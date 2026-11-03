// Pruebas del modelo de costos: facturación acumulada, Cost Explorer,
// calculadora, Budgets con sus correos, etiquetas de costos, Trusted Advisor
// y Support. Usa solo modelo.js con el reloj fijo.

import * as m from '../../public/consola/modelo.js';

export const titulo = 'Costos (Billing, Trusted Advisor, Support)';

const cerca = (a, b, tol = 0.011) => Math.abs(a - b) <= tol;

export async function probar() {
  const fallas = [];
  const espera = (cond, texto) => {
    if (!cond) fallas.push(texto);
  };
  const errorDe = (fn) => {
    try {
      fn();
      return null;
    } catch (e) {
      return e;
    }
  };
  const relojOriginal = m.reloj.ahora;
  try {
    let t = Date.UTC(2026, 10, 2, 15, 0, 0); // 2 de noviembre de 2026
    m.reloj.ahora = () => t;
    const avanzarA = (e, ms) => {
      t = ms;
      m.avanzar(e, t);
    };

    /* ---------------------------------------- cuenta nueva y cuenta vieja */
    const e = m.cuentaNueva({ cuentaId: '111122223333', nombre: 'Ana' });
    espera(e.costos && Array.isArray(e.costos.presupuestos) && e.costos.planSoporte === 'basic', 'la cuenta nueva no trae estado.costos con planSoporte basic');
    const vieja = m.cuentaNueva({ cuentaId: '111122223333' });
    delete vieja.costos;
    const falloVieja = errorDe(() => {
      m.avanzar(vieja, t + 1000);
      m.costoMensual(vieja);
      m.consultarCostos(vieja, { desde: '2026-06', hasta: '2026-11', agrupar: { tipo: 'SERVICE' } });
    });
    espera(!falloVieja && vieja.costos?.uso, `una cuenta sin colección de costos truena: ${falloVieja?.message}`);

    /* ---------------------------------------------- histórico sintético */
    const hist = m.consultarCostos(e, { desde: '2026-05', hasta: '2026-10', agrupar: { tipo: 'SERVICE' } });
    espera(hist.periodos.length === 6 && hist.periodos.every((p) => p.total > 1 && p.total < 15), 'el histórico sintético de 6 meses no da entre 1 y 15 USD al mes');
    espera(hist.grupos.includes('EC2-Instances'), 'el histórico no agrupa por servicio con EC2-Instances');
    const otra = m.cuentaNueva({ cuentaId: '999988887777' });
    const histOtra = m.consultarCostos(otra, { desde: '2026-05', hasta: '2026-10' });
    espera(histOtra.total !== hist.total, 'dos cuentas distintas tienen el mismo histórico sintético');
    const hist2 = m.consultarCostos(e, { desde: '2026-05', hasta: '2026-10' });
    espera(hist2.total === hist.total, 'el histórico sintético cambia entre consultas');

    /* ------------------------------------------- cobro de las instancias */
    const mtd0 = m.costoMensual(e);
    m.avanzar(e, t); // fija el último cobro
    const [i1] = m.lanzarInstancias(e, { nombre: 'web', tipo: 't2.micro', gruposSeguridad: [e.gruposSeguridad[0].id], cantidad: 2 });
    avanzarA(e, t + 9000); // ya están running
    const inicioCobro = t;
    const ec2Antes = m.costoMensual(e, { servicio: 'ec2' });
    const ipv4Antes = m.costoMensual(e, { servicio: 'vpc' });
    for (let k = 1; k <= 30; k++) avanzarA(e, inicioCobro + k * 60_000); // 30 horas simuladas
    const ec2 = m.costoMensual(e, { servicio: 'ec2' }) - ec2Antes;
    espera(cerca(ec2, 2 * 0.0116 * 30, 0.002), `30 h de 2 t2.micro deberían costar 0.696 y costaron ${ec2.toFixed(4)}`);
    const ipv4 = m.costoMensual(e, { servicio: 'vpc' }) - ipv4Antes;
    espera(cerca(ipv4, 2 * 0.005 * 30, 0.002), `las IP públicas deberían costar 0.30 y costaron ${ipv4.toFixed(4)}`);
    espera(m.llamar('costoMensual', e, { servicio: 'AmazonEC2' }) > m.costoMensual(e, { servicio: 'ec2' }), "llamar('costoMensual') con el código AmazonEC2 no incluye EC2-Instances + EC2-Other");
    espera(m.costoMensual(e) > mtd0 + 0.9, 'el month-to-date no creció con el uso');

    // Si la consola estuvo cerrada una hora real, solo se cobra 1 hora simulada.
    const antes = m.costoMensual(e, { servicio: 'ec2' });
    avanzarA(e, t + 3_600_000);
    espera(cerca(m.costoMensual(e, { servicio: 'ec2' }) - antes, 2 * 0.0116, 0.0005), 'un salto largo del reloj cobra más de 1 hora simulada');

    // Lo cobrado se queda aunque se borre el recurso.
    const conInstancias = m.costoMensual(e, { servicio: 'ec2' });
    m.terminarInstancia(e, i1.id);
    avanzarA(e, t + 10_000);
    for (let k = 1; k <= 3; k++) avanzarA(e, t + 60_000);
    espera(m.costoMensual(e, { servicio: 'ec2' }) >= conInstancias, 'al terminar una instancia se perdió lo que ya había cobrado');

    // Bills.
    const factura = m.facturaMes(e, '2026-11');
    const lineaEc2 = factura.find((s) => s.nombre === 'Elastic Compute Cloud')?.usos.find((u) => u.uso === 'BoxUsage:t2.micro');
    espera(lineaEc2 && /\$0\.0116 per On Demand Linux t2\.micro Instance Hour/.test(lineaEc2.descripcion), 'Bills no describe el uso de t2.micro como en AWS');

    // Una EIP sin asociar cobra como ociosa.
    const eip = m.asignarEip(e, { nombre: 'suelta' });
    const r = m.recursosFacturables(e).find((x) => x.recurso === eip.id);
    espera(r?.uso === 'PublicIPv4:IdleAddress', 'la Elastic IP sin asociar no cobra como PublicIPv4:IdleAddress');

    // Pronóstico: lo gastado + lo que falta del mes a la tasa de hoy.
    espera(m.pronosticoMes(e) > m.costoMensual(e), 'el pronóstico del mes no es mayor que lo gastado');

    /* ------------------------------------------------------- calculadora */
    const est = m.crearEstimacion(e, { nombre: 'Tienda' });
    const grupo = m.agregarGrupoEstimacion(e, est.id, { nombre: 'Servidores web' });
    const lineaOd = m.guardarServicioEstimacion(e, est.id, { servicio: 'ec2', grupoId: grupo.id, descripcion: 'Servidores web de la tienda', config: { sistema: 'linux', tipo: 't2.micro', cantidad: 2, pago: 'ondemand', utilizacion: 100, ebsGb: 0 } });
    espera(lineaOd.mensual === 16.94, `2 × t2.micro On-Demand debería dar 16.94 y dio ${lineaOd.mensual}`);
    const tot = m.totalesEstimacion(e.costos.estimaciones[0]);
    espera(tot.mensual === 16.94 && tot.anual === 203.28, `los totales de la estimación no son 16.94 / 203.28 (${tot.mensual} / ${tot.anual})`);
    const sp = m.precioCalculadora('ec2', { tipo: 't2.micro', cantidad: 2, pago: 'compute-sp', plazo: 3, opcionPago: 'none' });
    espera(sp.mensual === 8.47 && sp.inicial === 0, `Compute Savings Plans 3 años sin pago inicial debería dar 8.47 y dio ${sp.mensual}`);
    const todo = m.precioCalculadora('ec2', { tipo: 't2.micro', cantidad: 2, pago: 'ec2-sp', plazo: 1, opcionPago: 'all' });
    espera(todo.mensual === 0 && todo.inicial > 0, 'All Upfront debería dejar el mensual en 0 y cobrar por adelantado');
    const rds = m.precioCalculadora('rds', { motor: 'mysql', clase: 'db.t3.micro', despliegue: 'single', cantidad: 1, almacenamientoGb: 20 });
    espera(rds.mensual === 14.71, `RDS MySQL db.t3.micro con 20 GB debería dar 14.71 y dio ${rds.mensual}`);
    const malo = errorDe(() => m.guardarServicioEstimacion(e, est.id, { servicio: 'ec2', config: { tipo: 't2.micro', cantidad: 0 } }));
    espera(malo?.codigo === 'ValidationException', 'la calculadora aceptó 0 instancias');
    const dup = errorDe(() => m.agregarGrupoEstimacion(e, est.id, { nombre: 'servidores web' }));
    espera(dup?.codigo === 'ValidationException', 'la calculadora aceptó un grupo con nombre repetido');

    /* ---------------------------------------------------------- Budgets */
    const correo = 'ana@example.com';
    const b = m.crearPresupuesto(e, { nombre: 'presupuesto-ana', plantilla: 'mensual', monto: 1, correos: [correo] });
    espera(b.alertas.length === 3 && b.alertas.some((a) => a.disparador === 'FORECASTED' && a.umbral === 100) && b.alertas.some((a) => a.umbral === 85), 'la plantilla Monthly cost budget no trae las alertas 85 % / 100 % / 100 % pronosticado');
    espera(b.arn === 'arn:aws:budgets::111122223333:budget/presupuesto-ana', 'el ARN del presupuesto no tiene el formato de AWS');
    const dupB = errorDe(() => m.crearPresupuesto(e, { nombre: 'presupuesto-ana', plantilla: 'mensual', monto: 5, correos: [correo] }));
    espera(dupB?.codigo === 'DuplicateRecordException', 'se aceptó un presupuesto con nombre repetido');
    espera(errorDe(() => m.crearPresupuesto(e, { nombre: 'a:b', monto: 5, alertas: [] }))?.codigo === 'InvalidParameterException', 'se aceptó un nombre de presupuesto con «:»');
    espera(errorDe(() => m.crearPresupuesto(e, { nombre: 'x', plantilla: 'mensual', monto: 5, correos: ['no-es-correo'] }))?.codigo === 'InvalidParameterException', 'se aceptó un correo inválido');
    espera(errorDe(() => m.crearPresupuesto(e, { nombre: 'x', monto: 0, alertas: [] }))?.codigo === 'InvalidParameterException', 'se aceptó un presupuesto de $0');

    // Con $1 de presupuesto y un MTD mayor, la alerta real se dispara en el siguiente avanzar.
    m.lanzarInstancias(e, { nombre: 'web2', tipo: 'm5.large', gruposSeguridad: [e.gruposSeguridad[0].id] });
    avanzarA(e, t + 9000);
    avanzarA(e, t + 60_000);
    const buzon = e.sns?.buzon ?? [];
    const correosBudget = buzon.filter((x) => x.origen === 'budgets' && x.para === correo);
    espera(correosBudget.some((x) => x.asunto === 'AWS Budgets: presupuesto-ana has exceeded your alert threshold'), 'la alerta real del presupuesto no llegó al buzón simulado');
    espera(correosBudget.some((x) => /is forecasted to exceed/.test(x.asunto)), 'la alerta pronosticada no llegó al buzón simulado');
    const cuantos = correosBudget.length;
    avanzarA(e, t + 60_000);
    espera((e.sns?.buzon ?? []).filter((x) => x.origen === 'budgets').length === cuantos, 'la misma alerta se mandó dos veces en el mismo mes');
    const unCorreo = correosBudget[0];
    espera(unCorreo && /costalerts\.amazonaws\.com/.test(unCorreo.de) && Array.isArray(unCorreo.enlaces) && unCorreo.id && unCorreo.fecha, 'el correo de Budgets no tiene la forma del buzón de mensajeria.js (de, enlaces, id, fecha)');
    const st = m.estadoPresupuesto(e, e.costos.presupuestos[0]);
    espera(st.excedido && st.usado > 1, 'estadoPresupuesto no marca el presupuesto como excedido');

    // Presupuesto con filtro por etiqueta: solo cuenta con la etiqueta activada.
    const conEtiqueta = m.crearPresupuesto(e, { nombre: 'solo-web', monto: 100, filtros: { etiquetas: [{ llave: 'Name', valor: 'web2' }] }, alertas: [{ umbral: 80, correos: [correo] }] });
    espera(m.estadoPresupuesto(e, conEtiqueta).usado === 0, 'un presupuesto por etiqueta cuenta gasto aunque la etiqueta no esté activada');

    /* ---------------------------------------------- etiquetas de costos */
    const llaves = m.etiquetasDeCostos(e).map((x) => x.llave);
    espera(llaves.includes('Name') && llaves.includes('aws:createdBy'), 'Cost allocation tags no lista Name ni las etiquetas de AWS');
    espera(m.activarEtiquetasCosto(e, ['Name']).length === 1 && e.costos.etiquetasActivas.includes('Name'), 'no se pudo activar la etiqueta Name');
    espera(errorDe(() => m.activarEtiquetasCosto(e, ['NoExiste']))?.codigo === 'ValidationException', 'se activó una etiqueta que no existe en ningún recurso');
    avanzarA(e, t + 60_000);
    const porTag = m.consultarCostos(e, { desde: '2026-11', hasta: '2026-11', agrupar: { tipo: 'TAG', llave: 'Name' } });
    espera(porTag.grupos.includes('Name$web2') && porTag.grupos.includes('No tag key: Name'), `Cost Explorer por etiqueta no separa Name$web2 y No tag key (${porTag.grupos.join(', ')})`);
    espera(m.estadoPresupuesto(e, conEtiqueta).usado > 0, 'con la etiqueta activada el presupuesto por etiqueta sigue en 0');
    const diario = m.consultarCostos(e, { desde: '2026-11-01', hasta: '2026-11-02', granularidad: 'DAILY', agrupar: { tipo: 'SERVICE' } });
    espera(diario.periodos.length === 2 && diario.periodos[1].total > diario.periodos[0].total, 'la vista diaria no muestra el gasto de hoy');

    // Las instancias de un grupo de Auto Scaling llevan las etiquetas que el grupo propaga.
    const [ia] = m.lanzarInstancias(e, { nombre: 'asg-web', tipo: 't3.micro', gruposSeguridad: [e.gruposSeguridad[0].id] });
    avanzarA(e, t + 9000);
    ia.autoscaling = 'asg-tienda';
    e.autoscaling ??= { plantillas: [], grupos: [] };
    e.autoscaling.grupos.push({ nombre: 'asg-tienda', plantilla: { id: 'lt-x', version: '$Default' }, etiquetas: [{ llave: 'Proyecto', valor: 'tienda', propagar: true }, { llave: 'Interna', valor: 'si', propagar: false }], instancias: [] });
    const lineaAsg = m.recursosFacturables(e).find((x) => x.recurso === ia.id && x.servicio === 'ec2');
    espera(lineaAsg?.etiquetas?.Proyecto === 'tienda' && lineaAsg.etiquetas['aws:autoscaling:groupName'] === 'asg-tienda' && !lineaAsg.etiquetas.Interna, 'la instancia del ASG no lleva sus etiquetas propagadas (ni aws:autoscaling:groupName)');
    espera(m.etiquetasDeCostos(e).some((x) => x.llave === 'Proyecto'), 'Cost allocation tags no lista la llave que propaga el ASG');
    e.autoscaling.grupos.pop();
    m.terminarInstancia(e, ia.id);

    // Una cuenta vieja sin estado.sns también recibe la alerta.
    const sinSns = m.cuentaNueva({ cuentaId: '444455556666' });
    delete sinSns.sns;
    m.avanzar(sinSns, t);
    m.crearPresupuesto(sinSns, { nombre: 'cero', plantilla: 'zero', correos: ['x@example.com'] });
    m.lanzarInstancias(sinSns, { nombre: 'a', tipo: 'm5.large', gruposSeguridad: [sinSns.gruposSeguridad[0].id] });
    m.avanzar(sinSns, t + 9000);
    m.avanzar(sinSns, t + 60_000);
    espera((sinSns.sns?.buzon ?? []).some((x) => x.origen === 'budgets'), 'en una cuenta sin estado.sns la alerta del Zero spend budget no llegó al buzón');

    /* ------------------------------------------------- Trusted Advisor */
    const ta = e.costos.advisor;
    espera(ta.revisado && ta.resultados['mfa-raiz']?.estado === 'error', 'Trusted Advisor no revisó solo la cuenta o no marca la MFA de la raíz');
    espera(!ta.resultados['eip-sin-asociar'], 'con el plan Basic se ve un chequeo de Business Support+');
    m.asignarMfaRaiz(e);
    espera(e.costos.advisor.resultados['mfa-raiz'].estado === 'error', 'Trusted Advisor cambió sin Refresh');
    m.refrescarAdvisor(e);
    espera(e.costos.advisor.resultados['mfa-raiz'].estado === 'ok', 'tras Refresh, MFA on Root Account no quedó en verde');
    const sg = m.crearGrupoSeguridad(e, { nombre: 'ssh-abierto', descripcion: 'ssh', vpcId: e.vpcs[0].id, entrada: [{ protocolo: 'tcp', desde: 22, hasta: 22, origen: '0.0.0.0/0' }] });
    m.refrescarAdvisor(e, 'sg-puertos');
    espera(e.costos.advisor.resultados['sg-puertos'].marcados.some((x) => x.recurso === sg.id && x.estado === 'error'), 'el puerto 22 abierto a 0.0.0.0/0 no sale en rojo');
    e.snapshots.push({ id: 'snap-0publico000000000', volumenId: 'vol-1', tamano: 8, estado: 'completed', publico: true, descripcion: '' });
    m.refrescarAdvisor(e, 'ebs-snapshots-publicos');
    espera(e.costos.advisor.resultados['ebs-snapshots-publicos'].estado === 'error', 'un snapshot público no sale en Amazon EBS Public Snapshots');
    m.cambiarPlanSoporte(e, 'business-plus');
    espera(e.costos.advisor.resultados['eip-sin-asociar']?.estado === 'warning', 'con Business Support+ no aparece la EIP sin asociar');
    espera(m.recursosFacturables(e).some((x) => x.servicio === 'soporte'), 'el plan Business Support+ no cobra');
    espera(errorDe(() => m.cambiarPlanSoporte(e, 'developer'))?.codigo === 'InvalidParameterValueException', 'se aceptó un plan de soporte que ya no existe');

    /* ----------------------------------------------------------- Support */
    m.cambiarPlanSoporte(e, 'basic');
    espera(errorDe(() => m.crearCasoSoporte(e, { tipo: 'technical', servicio: 'EC2', asunto: 'a', descripcion: 'b' }))?.codigo === 'SubscriptionRequiredException', 'con Basic se pudo abrir un caso técnico');
    const caso = m.crearCasoSoporte(e, { tipo: 'account', servicio: 'Billing', categoria: 'Charges and refunds', asunto: 'Cargo de EC2', descripcion: '¿Por qué me cobran?' });
    espera(caso.estado === 'unassigned' && /^\d{10}$/.test(caso.numero), 'el caso nuevo no queda Unassigned con un número de 10 dígitos');
    avanzarA(e, t + m.DURACION_COSTOS.respuestaSoporte + 1000);
    espera(caso.estado === 'pending-customer-action' && caso.mensajes.some((x) => x.de === 'aws'), 'AWS Support no contestó el caso');
    m.resolverCasoSoporte(e, caso.id);
    espera(caso.estado === 'resolved', 'el caso no se resolvió');

    /* ------------------------------------------------- anomalías */
    for (let k = 1; k <= 40; k++) avanzarA(e, t + 60_000);
    const anomalias = m.anomaliasDeCostos(e);
    espera(anomalias.some((a) => a.servicio === 'ec2'), 'Cost Anomaly Detection no detecta el gasto de EC2 de hoy');

    /* ------------------------------------------ cambio de mes y tamaño */
    const mtdNov = m.costoMensual(e);
    avanzarA(e, Date.UTC(2026, 11, 1, 0, 0, 30));
    espera(e.costos.historico.some((h) => h.mes === '2026-11'), 'al cambiar de mes, noviembre no pasó al histórico');
    espera(cerca(m.costoMensual(e, { mes: '2026-11' }), mtdNov, 0.05), 'noviembre cerrado no conserva lo gastado');
    espera(m.costoMensual(e) < 1, 'diciembre empezó con el gasto de noviembre');
    for (let k = 1; k <= 3600; k++) avanzarA(e, t + 1000);
    const kb = JSON.stringify(e).length / 1024;
    espera(kb < 200, `después de una hora la cuenta pesa ${kb.toFixed(0)} KB`);
    espera(JSON.stringify(JSON.parse(JSON.stringify(e.costos))) === JSON.stringify(e.costos), 'estado.costos no es JSON puro');
  } catch (err) {
    fallas.push(`excepción: ${err.stack ?? err}`);
  } finally {
    m.reloj.ahora = relojOriginal;
  }
  return fallas;
}
