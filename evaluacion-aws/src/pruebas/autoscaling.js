// Pruebas del modelo de Launch Templates y Auto Scaling (public/consola/modelo/autoscaling.js).
// El reloj va fijo: cada paso lo mueve a mano, sin esperar de verdad.
import * as m from '../../public/consola/modelo.js';

export const titulo = 'Auto Scaling';

export async function probar() {
  const fallas = [];
  const ok = (cond, texto) => {
    if (!cond) fallas.push(texto);
  };
  const falla = (fn, codigo, texto) => {
    try {
      fn();
      fallas.push(`${texto}: no lanzó error`);
    } catch (e) {
      if (e?.name !== 'ErrorAws' || (codigo && e.codigo !== codigo)) fallas.push(`${texto}: esperaba ${codigo}, salió ${e?.codigo ?? e?.message}`);
    }
  };

  const relojOriginal = m.reloj.ahora;
  let t = Date.parse('2026-11-10T16:00:00Z');
  m.reloj.ahora = () => t;
  // Avanza el reloj de a poco, como la consola (avanzar cada segundo… aquí cada 2 s).
  const pasar = (e, ms, paso = 2000) => {
    for (let r = ms; r > 0; r -= paso) {
      t += Math.min(paso, r);
      m.avanzar(e, t);
    }
  };

  try {
    /* ---------- una cuenta de octubre (sin la colección) no truena */
    const vieja = m.cuentaNueva({ nombre: 'Ana' });
    delete vieja.autoscaling;
    try {
      m.avanzar(vieja, t);
      ok(Array.isArray(vieja.autoscaling?.grupos), 'avanzar no creó estado.autoscaling en una cuenta vieja');
      delete vieja.autoscaling;
      ok(m.grupoAutoScalingDe(vieja, 'x') === null, 'grupoAutoScalingDe en cuenta vieja');
      delete vieja.autoscaling;
      m.crearPlantillaLanzamiento(vieja, { nombre: 'vieja-1', datos: { ami: 'al2023', tipo: 't2.micro' } });
    } catch (e) {
      fallas.push(`Una cuenta vieja truena: ${e.message}`);
    }

    /* ---------- plantillas */
    const e = m.cuentaNueva({ nombre: 'Ana', cuentaId: '111122223333' });
    const sub = (az) => e.subredes.find((s) => s.az === az && s.porDefecto).id;
    const vpc = e.vpcs.find((v) => v.porDefecto).id;
    falla(() => m.crearPlantillaLanzamiento(e, { nombre: 'a b' }), 'InvalidLaunchTemplateName.MalformedException', 'Nombre de plantilla con espacio');
    falla(() => m.crearPlantillaLanzamiento(e, { nombre: '' }), 'MissingParameter', 'Plantilla sin nombre');
    const script = '#!/bin/bash\ndnf install -y httpd\necho "<h1>Hola</h1><p>sucursal a01</p>" > /var/www/html/index.html\nsystemctl enable --now httpd';
    const lt = m.crearPlantillaLanzamiento(e, {
      nombre: 'plantilla-web-a01',
      descripcion: 'v1',
      guia: true,
      datos: { ami: 'al2023', tipo: 't2.micro', llave: null, subredId: null, userData: script, etiquetas: [{ llave: 'Name', valor: 'web-desde-plantilla' }] },
      nuevoGrupo: { nombre: 'web-sg', descripcion: 'HTTP', vpcId: vpc, entrada: [{ protocolo: 'tcp', desde: 80, hasta: 80, origen: '0.0.0.0/0' }] }
    });
    ok(/^lt-0[0-9a-f]{16}$/.test(lt.id), `Id de plantilla raro: ${lt.id}`);
    const sg = e.gruposSeguridad.find((g) => g.nombre === 'web-sg');
    ok(sg && lt.versiones[0].datos.gruposSeguridad.includes(sg.id), 'La plantilla no creó ni usó su grupo de seguridad');
    falla(() => m.crearPlantillaLanzamiento(e, { nombre: 'plantilla-web-a01' }), 'InvalidLaunchTemplateName.AlreadyExistsException', 'Plantilla repetida');
    falla(() => m.crearPlantillaLanzamiento(e, { nombre: 'mala', datos: { tipo: 'z9.huge' } }), 'InvalidParameterValue', 'Tipo de instancia inválido');
    const v2 = m.crearVersionPlantilla(e, lt.id, { descripcion: 'v2', datos: { ...lt.versiones[0].datos, tipo: 't3.micro' } });
    ok(v2.numero === 2 && lt.versionDefault === 1 && lt.ultimaVersion === 2, 'La versión 2 no quedó como Latest sin ser Default');
    ok(m.versionDePlantilla(lt, '$Latest').datos.tipo === 't3.micro' && m.versionDePlantilla(lt, '$Default').datos.tipo === 't2.micro', 'versionDePlantilla');
    falla(() => m.eliminarVersionPlantilla(e, lt.id, 1), 'InvalidLaunchTemplateVersion.DefaultVersionDeletion', 'Borrar la versión predeterminada');
    m.definirVersionPredeterminada(e, lt.id, 2);
    m.eliminarVersionPlantilla(e, lt.id, 1);
    m.definirVersionPredeterminada(e, lt.id, 2);
    ok(lt.versiones.length === 1, 'No se borró la versión 1');

    /* ---------- errores del grupo */
    const base = { nombre: 'grupo-web-a01', plantillaId: lt.id, subredes: [sub('us-east-1a'), sub('us-east-1b')], min: 1, deseado: 2, max: 3, etiquetas: [{ llave: 'Name', valor: 'web-asg-a01', propagar: true }] };
    falla(() => m.crearGrupoAutoScaling(e, { ...base, min: 3, max: 2, deseado: 2 }), 'ValidationError', 'Máximo menor que mínimo');
    falla(() => m.crearGrupoAutoScaling(e, { ...base, deseado: 5 }), 'ValidationError', 'Deseado fuera de rango');
    falla(() => m.crearGrupoAutoScaling(e, { ...base, subredes: [] }), 'ValidationError', 'Grupo sin subredes');
    falla(() => m.crearGrupoAutoScaling(e, { ...base, plantillaId: 'lt-0000' }), 'ValidationError', 'Plantilla inexistente');
    try {
      m.crearGrupoAutoScaling(e, { ...base, deseado: 5 });
    } catch (x) {
      ok(x.message === 'Desired capacity:5 must be between the specified min size:1 and max size:3', `Mensaje de capacidad: ${x.message}`);
    }

    /* ---------- crear: dos instancias en dos zonas */
    const g = m.crearGrupoAutoScaling(e, { ...base, politica: { nombre: 'Target Tracking Policy', metrica: 'ASGAverageCPUUtilization', objetivo: 50 } });
    falla(() => m.crearGrupoAutoScaling(e, base), 'AlreadyExists', 'Grupo repetido');
    ok(g.politicas.length === 1 && g.politicas[0].alarmas.length === 2, 'La política de seguimiento no guardó sus dos alarmas');
    ok(g.politicas[0].alarmas[0].startsWith('TargetTracking-grupo-web-a01-AlarmHigh-'), `Nombre de alarma: ${g.politicas[0].alarmas[0]}`);
    pasar(e, 2000);
    ok(g.instancias.length === 2, `Se esperaban 2 instancias lanzadas, hay ${g.instancias.length}`);
    ok(new Set(g.instancias.map((x) => x.az)).size === 2, 'Las instancias no quedaron en dos zonas');
    const i0 = m.instanciaDe(e, g.instancias[0].id);
    ok(i0.nombre === 'web-asg-a01' && i0.autoscaling === 'grupo-web-a01' && i0.tipo === 't3.micro' && i0.userData === script, 'La instancia no trae Name, marca del grupo, tipo o user data de la plantilla');
    ok(i0.gruposSeguridad.includes(sg.id), 'La instancia no trae el grupo de seguridad de la plantilla');
    ok(g.actividad.every((a) => a.estado === 'InProgress' && /a user request created an AutoScalingGroup changing the desired capacity from 0 to 2\. At .+ an instance was started in response to a difference between desired and actual capacity, increasing the capacity from 0 to 2\./.test(a.causa)), 'Causa de creación');
    pasar(e, 10000);
    ok(g.instancias.every((x) => x.ciclo === 'InService' && x.salud === 'Healthy'), 'No pasaron a InService');
    ok(g.actividad.every((a) => a.estado === 'Successful' && a.fin), 'Las actividades de lanzamiento no terminaron');

    /* ---------- autocuración: el alumno termina una */
    const victima = g.instancias[0].id;
    m.terminarInstancia(e, victima);
    pasar(e, 2000);
    const term = g.actividad.find((a) => a.descripcion === `Terminating EC2 instance: ${victima}`);
    ok(term && /in response to an EC2 health check indicating it has been terminated or stopped\./.test(term.causa), 'No hay actividad de Terminating por health check');
    pasar(e, 6000);
    const reemplazo = g.actividad.find((a) => a.descripcion.startsWith('Launching a new EC2 instance') && /unhealthy instance needing to be replaced/.test(a.causa));
    ok(reemplazo, 'No se lanzó el reemplazo con la causa de AWS');
    pasar(e, 10000);
    ok(g.instancias.length === 2 && !g.instancias.some((x) => x.id === victima) && g.instancias.every((x) => x.ciclo === 'InService'), 'El grupo no volvió a 2 InService');

    /* ---------- una detenida también se reemplaza */
    const detenida = g.instancias[1].id;
    m.detenerInstancia(e, detenida);
    pasar(e, 2000);
    ok(m.instanciaDe(e, detenida).estado === 'shutting-down' || m.instanciaDe(e, detenida).estado === 'terminated', 'La instancia detenida no se terminó');
    pasar(e, 16000);
    ok(g.instancias.filter((x) => x.ciclo === 'InService').length === 2, 'No se reemplazó la detenida');

    /* ---------- Edit: deseado 3 */
    m.editarGrupoAutoScaling(e, g.nombre, { deseado: 3 });
    pasar(e, 2000);
    const tercera = g.actividad.find((a) => /a user request update of AutoScalingGroup constraints to min: 1, max: 3, desired: 3 changing the desired capacity from 2 to 3\./.test(a.causa));
    ok(tercera && g.instancias.length === 3, 'Edit a 3 no lanzó la tercera con su causa');
    falla(() => m.editarGrupoAutoScaling(e, g.nombre, { max: 2 }), 'ValidationError', 'Edit con máximo menor que el deseado');
    pasar(e, 10000);
    m.editarGrupoAutoScaling(e, g.nombre, { deseado: 2 });
    pasar(e, 2000);
    ok(g.actividad.some((a) => /shrinking the capacity from 3 to 2/.test(a.causa)), 'Reducir a 2 no terminó una');
    pasar(e, 8000);
    ok(g.instancias.length === 2, `Después de reducir quedan ${g.instancias.length}`);

    /* ---------- target tracking con hora pico */
    m.simularCargaAsg(e, g.nombre, { cpu: 90, minutos: 12 });
    let creció = false;
    for (let k = 0; k < 40 && !creció; k++) {
      pasar(e, 2000);
      creció = g.deseado === 3;
    }
    ok(creció, `La hora pico no subió el deseado (deseado ${g.deseado})`);
    ok(g.actividad.some((a) => /a monitor alarm TargetTracking-grupo-web-a01-AlarmHigh-.+ in state ALARM triggered policy Target Tracking Policy changing the desired capacity from 2 to 3\./.test(a.causa)), 'Causa de la política');
    // Cuando pasa la hora pico, se encoge al mínimo (15 puntos bajos = 150 s más el warmup).
    let bajó = false;
    for (let k = 0; k < 200 && !bajó; k++) {
      pasar(e, 2000);
      bajó = g.deseado < 3;
    }
    ok(bajó, `Al terminar la carga no se encogió (deseado ${g.deseado})`);
    pasar(e, 20000);

    /* ---------- política simple y cooldown */
    m.editarGrupoAutoScaling(e, g.nombre, { min: 1, deseado: 1, max: 3 });
    pasar(e, 12000);
    const simple = m.crearPoliticaEscalado(e, g.nombre, { nombre: 'sube-uno', tipo: 'SimpleScaling', ajuste: 'ChangeInCapacity', valor: 1, enfriamiento: 300 });
    m.habilitarPoliticaEscalado(e, g.nombre, 'Target Tracking Policy', false);
    ok(m.ejecutarPolitica(e, simple.arn, { alarma: 'cpu-alta' }) === true && g.deseado === 2, 'ejecutarPolitica simple no subió el deseado');
    ok(m.ejecutarPolitica(e, simple.arn, { alarma: 'cpu-alta' }) === false && g.deseado === 2, 'El cooldown no detuvo la segunda ejecución');
    ok(m.llamar('grupoAutoScalingDe', e, g.nombre) === g, 'llamar(grupoAutoScalingDe)');
    m.eliminarPoliticaEscalado(e, g.nombre, 'sube-uno');
    falla(() => m.crearPoliticaEscalado(e, g.nombre, { nombre: 'mala', tipo: 'TargetTrackingScaling', metrica: 'ASGAverageCPUUtilization', objetivo: 150 }), 'ValidationError', 'Objetivo de CPU mayor a 100');

    /* ---------- acción programada */
    m.crearAccionProgramada(e, g.nombre, { nombre: 'noche', deseado: 3, recurrencia: 'once', inicio: new Date(t + 4000).toISOString() });
    pasar(e, 6000);
    ok(g.deseado === 3 && !g.programadas.length, 'La acción programada no se ejecutó o no se borró');
    pasar(e, 12000);

    /* ---------- Instance management */
    const sep = g.instancias.find((x) => x.ciclo === 'InService').id;
    m.separarInstanciasAsg(e, g.nombre, [sep]);
    ok(g.deseado === 2 && !m.instanciaDe(e, sep).autoscaling && m.instanciaDe(e, sep).estado === 'running', 'Detach no bajó el deseado o terminó la instancia');
    const prot = g.instancias[0].id;
    m.protegerInstanciasAsg(e, g.nombre, [prot], true);
    ok(g.instancias[0].protegida, 'Scale-in protection');

    /* ---------- falla al lanzar sin plantilla */
    const lt2 = m.crearPlantillaLanzamiento(e, { nombre: 'temporal', datos: { ami: 'al2023', tipo: 't2.micro', gruposSeguridad: [sg.id] } });
    m.crearGrupoAutoScaling(e, { nombre: 'sin-plantilla', plantillaId: lt2.id, subredes: [sub('us-east-1c')], min: 1, deseado: 1, max: 1 });
    m.eliminarPlantillaLanzamiento(e, lt2.id);
    pasar(e, 2000);
    const g2 = m.grupoAutoScalingDe(e, 'sin-plantilla');
    ok(g2.actividad[0]?.estado === 'Failed' && /does not exist/.test(g2.actividad[0].descripcion), 'Lanzar sin plantilla no dejó una actividad Failed');
    // Un reemplazo que falla (la plantilla ya no existe) lleva la causa del reemplazo.
    const lt3 = m.crearPlantillaLanzamiento(e, { nombre: 'temporal-3', datos: { ami: 'al2023', tipo: 't2.micro', gruposSeguridad: [sg.id] } });
    const g4 = m.crearGrupoAutoScaling(e, { nombre: 'reemplazo-falla', plantillaId: lt3.id, subredes: [sub('us-east-1d')], min: 1, deseado: 1, max: 1 });
    pasar(e, 12000);
    m.eliminarPlantillaLanzamiento(e, lt3.id);
    m.terminarInstancia(e, g4.instancias[0].id);
    pasar(e, 4000);
    const fallo = g4.actividad.find((a) => a.estado === 'Failed');
    ok(fallo && /unhealthy instance needing to be replaced/.test(fallo.causa), `Causa del reemplazo fallido: ${fallo?.causa}`);
    m.eliminarGrupoAutoScaling(e, 'reemplazo-falla');

    /* ---------- borrar en dos fases */
    const ids = g.instancias.map((x) => x.id);
    m.eliminarGrupoAutoScaling(e, g.nombre);
    ok(g.estado === 'borrando' && g.deseado === 0 && g.max === 0, 'Delete no dejó el grupo en Deleting con deseado 0');
    pasar(e, 2000);
    ok(ids.every((id) => ['shutting-down', 'terminated'].includes(m.instanciaDe(e, id).estado)), 'Delete no terminó las instancias (también la protegida)');
    pasar(e, 8000);
    ok(!m.grupoAutoScalingDe(e, 'grupo-web-a01'), 'El grupo no desapareció al terminar sus instancias');
    m.eliminarGrupoAutoScaling(e, 'sin-plantilla');
    pasar(e, 4000);

    /* ---------- el estado sigue siendo JSON chico */
    const copia = JSON.parse(JSON.stringify(e));
    ok(JSON.stringify(copia).length < 512 * 1024, 'El estado pasa de 512 KB');
    ok(e.autoscaling.grupos.every((x) => x.actividad.length <= 60), 'La actividad no se recorta');
  } catch (x) {
    fallas.push(`Error inesperado: ${x?.stack ?? x}`);
  } finally {
    m.reloj.ahora = relojOriginal;
  }
  return fallas;
}
