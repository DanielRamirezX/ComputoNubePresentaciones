// Pruebas del modelo de CloudWatch y CloudTrail (public/consola/modelo/cloudwatch.js):
// métricas calculadas, alarmas con su evaluación en el tiempo comprimido,
// acciones por ARN, tableros, logs, el Event history y los trails.

import * as M from '../../public/consola/modelo.js';
import {
  agregarWidget,
  avanzar,
  catalogoMetricas,
  crearAlarma,
  crearAlarmaInterna,
  crearBucket,
  crearGrupoLogs,
  crearTablero,
  crearTrail,
  cuentaNueva,
  DURACION_CLOUDWATCH,
  editarAlarma,
  eliminarAlarmas,
  eliminarAlarmasInternas,
  escribirLog,
  eventosCloudTrail,
  lanzarInstancias,
  llamar,
  registroEventoCloudTrail,
  reloj,
  serieMetrica,
  simularCarga,
  textoCondicion,
  valorMetrica
} from '../../public/consola/modelo.js';

export const titulo = 'CloudWatch y CloudTrail';

export async function probar() {
  const fallas = [];
  const espera = (fn, texto) => {
    try {
      fn();
      fallas.push(`debió fallar: ${texto}`);
    } catch (e) {
      if (e?.name !== 'ErrorAws') fallas.push(`${texto}: tronó con ${e?.message}`);
    }
  };
  const original = reloj.ahora;
  let t = Date.UTC(2026, 10, 9, 15, 0, 0);
  reloj.ahora = () => t;
  const pasa = (ms) => {
    t += ms;
    avanzar(e, t);
  };
  const P = DURACION_CLOUDWATCH.periodo;
  let e;
  try {
    // Una cuenta guardada antes de CloudWatch no trae su colección.
    e = cuentaNueva({ nombre: 'Ana' });
    delete e.cloudwatch;
    delete e.cloudtrail;
    avanzar(e, t);
    if (!Array.isArray(e.cloudwatch?.alarmas) || !Array.isArray(e.cloudtrail?.trails)) fallas.push('avanzar no creó las colecciones en una cuenta vieja');
    delete e.cloudwatch;
    crearGrupoLogs(e, { nombre: 'mi-app' });

    // Métricas de una instancia.
    const sg = e.gruposSeguridad[0].id;
    const [inst] = lanzarInstancias(e, { nombre: 'web', gruposSeguridad: [sg] });
    pasa(10000);
    if (inst.estado !== 'running') fallas.push('la instancia no arrancó');
    pasa(3 * P);
    const ref = { namespace: 'AWS/EC2', metrica: 'CPUUtilization', dimensiones: { InstanceId: inst.id } };
    const cpu = valorMetrica(e, ref, t);
    if (typeof cpu !== 'number' || cpu < 1 || cpu > 18) fallas.push(`CPU base fuera de rango: ${cpu}`);
    if (valorMetrica(e, ref, t) !== cpu) fallas.push('la métrica no es determinista');
    if (llamar('valorMetrica', e, ref, t) !== cpu) fallas.push('valorMetrica no se ofrece por llamar()');
    const serie = serieMetrica(e, ref, { puntos: 12 });
    if (serie.length !== 12 || serie.at(-1).v === null || serie[0].v !== null) fallas.push('la serie no tiene 12 puntos con datos solo desde el arranque');
    if (!catalogoMetricas(e).some((m) => m.namespace === 'AWS/EC2' && m.dimensiones.InstanceId === inst.id && m.metrica === 'CPUUtilization')) fallas.push('el catálogo no trae la CPU de la instancia');
    if (valorMetrica(e, { namespace: 'AWS/EC2', metrica: 'CPUUtilization', dimensiones: {} }, t) === null) fallas.push('Across All Instances no da valor');
    if (valorMetrica(e, { namespace: 'AWS/SQS', metrica: 'ApproximateNumberOfMessagesVisible', dimensiones: { QueueName: 'no-existe' } }, t) !== null) fallas.push('una cola que no existe debería dar null');

    // Validaciones de la alarma.
    const base = { nombre: 'cpu-alta', metrica: { namespace: 'AWS/EC2', nombre: 'CPUUtilization', dimensiones: { InstanceId: inst.id } }, estadistica: 'Average', periodo: 300, comparacion: 'GreaterThanThreshold', umbral: 70, puntos: 1, evaluaciones: 1 };
    espera(() => crearAlarma(e, { ...base, nombre: '' }), 'alarma sin nombre');
    espera(() => crearAlarma(e, { ...base, umbral: 'abc' }), 'umbral que no es número');
    espera(() => crearAlarma(e, { ...base, puntos: 3, evaluaciones: 2 }), 'datapoints mayor que evaluation periods');
    espera(() => crearAlarma(e, { ...base, nombre: 'x', metrica: { namespace: 'AWS/EC2', nombre: 'CPUUtilization', dimensiones: { AutoScalingGroupName: 'g' } }, acciones: { ALARM: ['arn:aws:automate:us-east-1:ec2:stop'] } }), 'acción de EC2 sin InstanceId');

    const a = crearAlarma(e, { ...base, acciones: { ALARM: ['arn:aws:sns:us-east-1:123456789012:alertas'] } });
    espera(() => crearAlarma(e, base), 'alarma con nombre repetido');
    if (a.estado !== 'INSUFFICIENT_DATA') fallas.push('una alarma nueva empieza en INSUFFICIENT_DATA');
    if (textoCondicion(a) !== 'CPUUtilization > 70 for 1 datapoints within 5 minutes') fallas.push(`Conditions: ${textoCondicion(a)}`);
    pasa(P);
    if (a.estado !== 'OK') fallas.push(`sin carga la alarma debió quedar OK (quedó ${a.estado}: ${a.razon})`);

    // La hora pico: la CPU sube y la alarma pasa a ALARM en N × 10 s.
    simularCarga(e, { instanciaId: inst.id, cpu: 95, minutos: 6 });
    pasa(2 * P);
    if (a.estado !== 'ALARM') fallas.push(`con carga la alarma debió pasar a ALARM (quedó ${a.estado}: ${a.razon})`);
    if (!/^Threshold Crossed: 1 out of the last 1 datapoints \[\d/.test(a.razon)) fallas.push(`razón rara: ${a.razon}`);
    if (!a.historial.some((h) => h.tipo === 'StateUpdate' && h.resumen === 'Alarm updated from OK to In alarm')) fallas.push('falta el StateUpdate en el historial');
    if (!a.historial.some((h) => h.tipo === 'Action')) fallas.push('falta la acción (SNS) en el historial');
    if (e.bitacora.some((b) => b.servicio === 'Simulador') && eventosCloudTrail(e).some((x) => x.servicio === 'Simulador')) fallas.push('CloudTrail no debe mostrar las acciones del simulador');
    pasa(7 * P);
    if (a.estado !== 'OK') fallas.push(`al acabar la carga la alarma debió volver a OK (quedó ${a.estado})`);

    // M de N: 2 de 3 puntos.
    editarAlarma(e, 'cpu-alta', { ...base, puntos: 2, evaluaciones: 3, acciones: {} });
    if (a.puntos !== 2 || a.evaluaciones !== 3) fallas.push('Edit no cambió los datapoints');

    // Acción de EC2: detener la instancia.
    crearAlarma(e, { ...base, nombre: 'apagar', comparacion: 'GreaterThanOrEqualToThreshold', umbral: 0, acciones: { ALARM: ['arn:aws:automate:us-east-1:ec2:stop'] } });
    pasa(P);
    if (!['stopping', 'stopped'].includes(inst.estado)) fallas.push(`la acción Stop no detuvo la instancia (${inst.estado})`);
    pasa(10000);
    pasa(3 * P);
    const apagar = e.cloudwatch.alarmas.find((x) => x.nombre === 'apagar');
    if (apagar.estado !== 'INSUFFICIENT_DATA') fallas.push(`sin datos la alarma debió quedar INSUFFICIENT_DATA (${apagar.estado})`);
    eliminarAlarmas(e, ['apagar']);
    espera(() => eliminarAlarmas(e, ['apagar']), 'borrar una alarma que ya no existe');

    // Las alarmas de target tracking de Auto Scaling.
    const nombreTT = 'TargetTracking-grupo-web-AlarmHigh-1a2b3c4d-0000-4000-8000-000000000000';
    llamar('crearAlarmaInterna', e, { nombre: nombreTT, metrica: { namespace: 'AWS/EC2', nombre: 'CPUUtilization', dimensiones: { AutoScalingGroupName: 'grupo-web' } }, comparacion: 'GreaterThanThreshold', umbral: 50, acciones: { ALARM: ['arn:aws:autoscaling:us-east-1:123456789012:scalingPolicy:abc:autoScalingGroupName/grupo-web:policyName/Target Tracking Policy'] } });
    const tt = e.cloudwatch.alarmas.find((x) => x.nombre === nombreTT);
    if (!tt || tt.creadaPor !== 'autoscaling' || tt.evaluaciones !== 3) fallas.push('crearAlarmaInterna no dejó la alarma de target tracking');
    crearAlarmaInterna(e, { nombre: nombreTT, metrica: tt.metrica, umbral: 60 });
    if (e.cloudwatch.alarmas.filter((x) => x.nombre === nombreTT).length !== 1 || tt.umbral !== 60) fallas.push('crearAlarmaInterna debe reemplazar la alarma con el mismo nombre');
    pasa(P);
    llamar('eliminarAlarmasInternas', e, [nombreTT, 'no-existe']);
    eliminarAlarmasInternas(e, ['otra']);
    if (e.cloudwatch.alarmas.some((x) => x.nombre === nombreTT)) fallas.push('eliminarAlarmasInternas no la borró');

    // Tableros.
    espera(() => crearTablero(e, { nombre: 'mi tablero' }), 'nombre de tablero con espacio');
    crearTablero(e, { nombre: 'Taqueria' });
    espera(() => crearTablero(e, { nombre: 'Taqueria' }), 'tablero repetido');
    agregarWidget(e, 'Taqueria', { tipo: 'linea', titulo: 'CPU', metricas: [ref] });
    espera(() => agregarWidget(e, 'Taqueria', { tipo: 'linea', metricas: [] }), 'widget sin métricas');

    // Logs.
    espera(() => crearGrupoLogs(e, { nombre: 'mi-app' }), 'grupo de logs repetido');
    espera(() => crearGrupoLogs(e, { nombre: 'con espacio' }), 'nombre de grupo inválido');
    espera(() => crearGrupoLogs(e, { nombre: 'otro', retencion: 2 }), 'retención inválida');
    for (let i = 0; i < 700; i++) llamar('escribirLog', e, '/aws/lambda/procesar', `2026/11/09/[$LATEST]abc${i % 30}`, `START RequestId: ${i} Version: $LATEST`);
    const lg = e.cloudwatch.gruposLogs.find((g) => g.nombre === '/aws/lambda/procesar');
    if (!lg) fallas.push('escribirLog no creó el grupo');
    const totalEventos = e.cloudwatch.gruposLogs.reduce((s, g) => s + g.flujos.reduce((x, f) => x + f.eventos.length, 0), 0);
    if (totalEventos > 500 || lg.flujos.length > 20) fallas.push(`los logs no se recortan (${totalEventos} eventos, ${lg.flujos.length} flujos)`);
    pasa(P);
    const inv = valorMetrica(e, { namespace: 'AWS/Lambda', metrica: 'Invocations', dimensiones: { FunctionName: 'procesar' }, estadistica: 'Sum' }, t);
    if (!(inv > 0)) fallas.push(`las invocaciones de Lambda no salen de sus logs (${inv})`);

    // CloudTrail.
    const evs = eventosCloudTrail(e);
    if (!evs.length || evs[0].t < evs.at(-1).t) fallas.push('el Event history debe ir del más nuevo al más viejo');
    const run = evs.find((x) => x.nombre === 'RunInstances');
    if (!run || run.fuente !== 'ec2.amazonaws.com' || !run.recursos.some((r) => r.tipo === 'AWS::EC2::Instance')) fallas.push('RunInstances no trae su fuente o su instancia');
    const json = registroEventoCloudTrail(e, run);
    if (json.eventName !== 'RunInstances' || json.eventID !== run.id || json.requestParameters?.instanceId !== inst.id) fallas.push('el Event record no está completo');
    if (new Set(evs.map((x) => x.id)).size !== evs.length) fallas.push('los Event ID se repiten');

    espera(() => crearTrail(e, { nombre: 'ab', bucket: 'x' }), 'trail con nombre corto');
    espera(() => crearTrail(e, { nombre: 'auditoria', bucket: 'no-existe-este-bucket' }), 'trail con bucket inexistente');
    const tr = crearTrail(e, { nombre: 'auditoria', bucketNuevo: true });
    crearBucket(e, { nombre: 'otro-bucket-de-prueba-cw' });
    pasa(DURACION_CLOUDWATCH.entregaTrail + 1000);
    const b = e.buckets.find((x) => x.nombre === tr.bucket);
    if (!b?.objetos.some((o) => o.llave.includes('/CloudTrail/us-east-1/') && o.llave.endsWith('.json.gz'))) fallas.push('el trail no entregó su archivo al bucket');

    // Con las extensiones de Auto Scaling y mensajería (si ya existen): la hora pico
    // dispara la alarma, llega el correo al buzón y el grupo crece.
    await integracion(fallas);

    // El estado sigue siendo JSON y chico.
    const tam = JSON.stringify(e.cloudwatch).length;
    if (tam > 150 * 1024) fallas.push(`estado.cloudwatch pesa ${tam} bytes`);
    if (JSON.stringify(JSON.parse(JSON.stringify(e))) !== JSON.stringify(e)) fallas.push('el estado no es JSON puro');
  } catch (err) {
    fallas.push(`tronó: ${err?.stack ?? err}`);
  } finally {
    reloj.ahora = original;
  }
  return fallas;
}

/** Alarma de CPU de un grupo con aviso por SNS y target tracking, con los módulos de los otros agentes. */
async function integracion(fallas) {
  if (!M.crearGrupoAutoScaling || !M.crearTema || !M.crearSuscripcion || !M.confirmarSuscripcion) return;
  let t = M.reloj.ahora();
  const reloj0 = M.reloj.ahora;
  M.reloj.ahora = () => t;
  const pasa = (ms) => {
    for (let x = 0; x < ms; x += 1000) {
      t += 1000;
      M.avanzar(e, t);
    }
  };
  const e = M.cuentaNueva({ nombre: 'Luis' });
  try {
    const sg = e.gruposSeguridad[0].id;
    const pl = M.crearPlantillaLanzamiento(e, { nombre: 'plantilla-web', datos: { ami: 'al2023', tipo: 't2.micro', gruposSeguridad: [sg] } });
    M.crearGrupoAutoScaling(e, { nombre: 'grupo-web', plantillaId: pl.id, subredes: e.subredes.slice(0, 2).map((x) => x.id), min: 2, deseado: 2, max: 4, politica: { nombre: 'Target Tracking Policy', metrica: 'ASGAverageCPUUtilization', objetivo: 50 } });
    const tema = M.crearTema(e, { nombre: 'alertas-luis' });
    const sub = M.crearSuscripcion(e, { temaArn: tema.arn, protocolo: 'email', endpoint: 'luis@alumno.mx' });
    M.confirmarSuscripcion(e, sub.arn);
    pasa(40000);
    const tt = e.cloudwatch.alarmas.filter((a) => a.nombre.startsWith('TargetTracking-grupo-web-'));
    if (tt.length !== 2) fallas.push(`integración: la política debió crear 2 alarmas TargetTracking (hay ${tt.length})`);
    const alarma = M.crearAlarma(e, { nombre: 'cpu-alta-luis', metrica: { namespace: 'AWS/EC2', nombre: 'CPUUtilization', dimensiones: { AutoScalingGroupName: 'grupo-web' } }, estadistica: 'Average', periodo: 300, comparacion: 'GreaterThanThreshold', umbral: 70, acciones: { ALARM: [tema.arn] } });
    pasa(15000);
    if (alarma.estado !== 'OK') fallas.push(`integración: sin carga la alarma del grupo debió estar OK (${alarma.estado})`);
    M.simularCarga(e, { asg: 'grupo-web', cpu: 90, minutos: 30 });
    pasa(25000);
    if (!alarma.historial.some((h) => h.resumen === 'Alarm updated from OK to In alarm')) fallas.push('integración: la hora pico no puso la alarma en In alarm');
    if (!(e.sns.buzon ?? []).some((c) => /ALARM: "cpu-alta-luis" in US East \(N. Virginia\)/.test(c.asunto))) fallas.push('integración: no llegó el correo de la alarma al buzón');
    const refGrupo = { namespace: 'AWS/EC2', metrica: 'CPUUtilization', dimensiones: { AutoScalingGroupName: 'grupo-web' } };
    const pico = M.serieMetrica(e, refGrupo, { puntos: 1, ahora: t })[0];
    pasa(40000);
    // Un periodo viejo no cambia aunque el grupo haya crecido después.
    const otraVez = M.serieMetrica(e, refGrupo, { puntos: 1, ahora: pico.t + M.DURACION_CLOUDWATCH.periodo + 1 })[0];
    if (otraVez.t !== pico.t || otraVez.v !== pico.v || !(pico.v > 70)) fallas.push(`integración: el pico de la gráfica cambió al crecer el grupo (${pico.v} → ${otraVez.v})`);
    const g = e.autoscaling.grupos[0];
    if (g.deseado <= 2) fallas.push(`integración: el target tracking no hizo crecer el grupo (deseado ${g.deseado})`);
    const cpu = M.valorMetrica(e, { namespace: 'AWS/EC2', metrica: 'CPUUtilization', dimensiones: { AutoScalingGroupName: 'grupo-web' } }, t);
    if (!(cpu < 70)) fallas.push(`integración: con más instancias la CPU del grupo debió bajar (${cpu})`);
  } catch (err) {
    fallas.push(`integración tronó: ${err?.stack ?? err}`);
  } finally {
    M.reloj.ahora = reloj0;
  }
}
