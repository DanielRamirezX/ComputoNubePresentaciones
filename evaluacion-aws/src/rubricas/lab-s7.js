// Rúbrica del laboratorio de la sesión 7 (simulador) · La tienda no se lleva sorpresas.
//
// Revisa la cuenta como la dejó el alumno: las dos líneas de EC2 en la Pricing
// Calculator (On-Demand y Compute Savings Plans), el presupuesto con sus
// alertas real y pronosticada, el bucket etiquetado y la etiqueta activada,
// los tres pendientes de Trusted Advisor (y que haya vuelto a revisar), la
// organización con sus OU, la cuenta de pruebas y la SCP (probada de verdad
// con accionPermitidaPorScp), la revisión Well-Architected con su milestone y
// el bono del caso de soporte.
//
// Elige «lo del alumno» con tolerancia: si un nombre no quedó exacto,
// califica lo que más se parece y la retro le dice qué se esperaba. Solo
// servidor: el navegador nunca recibe este archivo.

import {
  accionPermitidaPorScp,
  activarEtiquetasCosto,
  adjuntarPoliticaScp,
  asignarMfaRaiz,
  avanzar,
  clonar,
  crearBucket,
  crearCargaWa,
  crearCasoSoporte,
  crearCuentaOrganizacion,
  crearEstimacion,
  crearOrganizacion,
  crearPoliticaScp,
  crearPresupuesto,
  crearUnidadOrganizativa,
  eliminarSnapshot,
  FULL_AWS_ACCESS,
  guardarHitoWa,
  guardarServicioEstimacion,
  habilitarScp,
  liberarEip,
  precioCalculadora,
  PREGUNTAS_WA,
  refrescarAdvisor,
  reloj,
  responderPreguntaWa,
  tipoInstancia
} from '../../public/consola/modelo.js';
import { LAB, datosLab } from '../../public/labs/lab-s7.js';
import { armar, check, lista, normal, preparar } from './comun.js';

/**
 * Dónde repasar cada punto en la Ruta AWS (ver src/repaso.js). La clave
 * 'tarea/check' gana sobre la de la tarea.
 */
export const REPASO = {
  estimacion: ['s7-herramientas/1', 's7-lab-costos/3'],
  'estimacion/ondemand': ['s7-lab-costos/3', 's1-precios/1'],
  'estimacion/ahorro': ['s7-lab-costos/4', 's7-precios/2'],

  presupuesto: ['s7-herramientas/1', 's7-lab-costos/8'],
  'presupuesto/existe': ['s7-lab-costos/8', 's7-herramientas/1'],
  'presupuesto/monto': 's7-lab-costos/8',
  'presupuesto/real': ['s7-lab-costos/8', 's7-herramientas/1'],
  'presupuesto/pronostico': ['s7-lab-costos/8', 's7-herramientas/1'],

  etiquetas: 's7-herramientas/1',
  'etiquetas/bucket': ['s7-herramientas/1', 's4-lab-almacenamiento/3'],
  'etiquetas/activa': ['s7-herramientas/1', 's7-repaso/1'],

  advisor: ['s7-soporte/2', 's7-lab-costos/9'],
  'advisor/snapshot': ['s7-lab-costos/9', 's4-discos/2'],
  'advisor/eip': ['s7-precios/1', 's7-soporte/2'],
  'advisor/mfa': ['s2-identidades/2', 's2-identidades/3'],
  'advisor/refresh': ['s7-lab-costos/9', 's7-soporte/2'],

  gobierno: ['s7-herramientas/2', 's2-politicas/3'],
  'gobierno/organizacion': ['s7-herramientas/2', 's7-lab-costos/11'],
  'gobierno/ous': ['s7-herramientas/2', 's7-lab-costos/11'],
  'gobierno/cuenta': 's7-herramientas/2',
  'gobierno/scp': ['s2-politicas/3', 's2-politicas/2'],
  'gobierno/sin-dano': ['s2-politicas/3', 's2-politicas/2'],

  revision: ['s7-buenas-practicas/1', 's7-lab-costos/11'],
  'revision/carga': ['s7-lab-costos/11', 's7-buenas-practicas/1'],
  'revision/fiabilidad': 's7-buenas-practicas/1',
  'revision/hito': ['s7-buenas-practicas/1', 's7-repaso/1'],

  soporte: ['s7-soporte/1', 's7-lab-costos/10']
};

/* ================================================================ ayudas */

const dinero = (n) => `$${(Number(n) || 0).toFixed(2)}`;
/** Compara nombres sin acentos, mayúsculas ni signos («Producción» = «produccion»). */
const plano = (t) => normal(t).replace(/[^a-z0-9]/g, '');
const igualNombre = (a, b) => plano(a) === plano(b);
const NOMBRE_PAGO = { ondemand: 'On-Demand', 'compute-sp': 'Compute Savings Plans', 'ec2-sp': 'EC2 Instance Savings Plans', spot: 'Spot Instances' };
const OPCION_PAGO = { none: 'No upfront', partial: 'Partial upfront', all: 'All upfront' };

/* ======================================================== la estimación */

/** Lo esperado de cada línea: la config y su costo mensual (con el mismo cálculo de la calculadora). */
function lineasEsperadas(x) {
  const base = { sistema: 'linux', tenencia: 'shared', carga: 'constante', cantidad: x.cantidad, tipo: x.tipo, ebsTipo: 'gp3', ebsGb: 0 };
  const od = { ...base, pago: 'ondemand', utilizacion: 100 };
  const sp = { ...base, pago: 'compute-sp', plazo: 3, opcionPago: 'none' };
  return { od: { config: od, mensual: precioCalculadora('ec2', od).mensual }, sp: { config: sp, mensual: precioCalculadora('ec2', sp).mensual } };
}

/** Todas las líneas de EC2 de todas las estimaciones: [{ est, l }]. */
const lineasEc2 = (estado) => (estado.costos?.estimaciones ?? []).flatMap((est) => (est.servicios ?? []).filter((l) => l.servicio === 'ec2').map((l) => ({ est, l })));

/** Qué le falta a una línea para ser la esperada (en español). */
function diferencias(l, esperado, x) {
  const c = l.config ?? {};
  const d = [];
  if (c.tipo !== x.tipo) d.push(`el tipo es ${c.tipo}, no ${x.tipo}`);
  if (Number(c.cantidad) !== x.cantidad) d.push(`son ${c.cantidad} instancias, no ${x.cantidad}`);
  if ((c.sistema ?? 'linux') !== 'linux') d.push('el sistema no es Linux (Windows cuesta más por la licencia)');
  const pago = c.pago ?? 'ondemand';
  if (pago !== esperado.config.pago) d.push(`la forma de pago es ${NOMBRE_PAGO[pago] ?? pago}, no ${NOMBRE_PAGO[esperado.config.pago]}`);
  if (esperado.config.pago === 'ondemand' && pago === 'ondemand' && Number(c.utilizacion ?? 100) !== 100) d.push(`la utilización es ${c.utilizacion} %, no 100 % (uso constante)`);
  if (esperado.config.pago === 'compute-sp' && pago === 'compute-sp') {
    if (Number(c.plazo) !== 3) d.push(`el plazo es de ${c.plazo} año(s), no de 3`);
    if ((c.opcionPago ?? 'none') !== 'none') d.push(`la opción de pago es ${OPCION_PAGO[c.opcionPago] ?? c.opcionPago}, no No upfront`);
  }
  if (Number(c.ebsGb) > 0) d.push(`le agregaste ${c.ebsGb} GB de EBS (se pidió sin disco)`);
  return d;
}

/** La línea que mejor se parece a la esperada (o null). */
function mejorLinea(lineas, esperado, x) {
  const puntos = ({ l }) => {
    const c = l.config ?? {};
    return (c.tipo === x.tipo ? 2 : 0) + (Number(c.cantidad) === x.cantidad ? 2 : 0) + ((c.pago ?? 'ondemand') === esperado.config.pago ? 3 : 0) - diferencias(l, esperado, x).length;
  };
  return [...lineas].sort((a, b) => puntos(b) - puntos(a))[0] ?? null;
}

function revisarEstimacion(estado, x) {
  const esp = lineasEsperadas(x);
  const todas = lineasEc2(estado);
  const n = (estado.costos?.estimaciones ?? []).length;
  const pide = `${x.cantidad} × ${x.tipo} Linux`;

  const revisarLinea = (esperado, nombrePago, id, puntos, textoOk) => {
    const exacta = todas.find(({ l }) => !diferencias(l, esperado, x).length && Math.abs(l.mensual - esperado.mensual) <= 0.011);
    let retro;
    if (exacta) retro = textoOk(exacta);
    else if (!n) retro = `Todavía no hay ninguna estimación. Ve a Billing and Cost Management → Pricing Calculator → Create estimate y agrega Amazon EC2 con ${pide} y ${nombrePago}.`;
    else if (!todas.length) retro = `Tu estimación no tiene líneas de Amazon EC2. Usa Add service → Amazon EC2 → Configure con ${pide} y ${nombrePago}.`;
    else {
      const m = mejorLinea(todas, esperado, x);
      const d = diferencias(m.l, esperado, x);
      retro = d.length
        ? `No encontré la línea ${pide} con ${nombrePago}. La que más se parece${m.l.descripcion ? ` («${m.l.descripcion}»)` : ''} cuesta ${dinero(m.l.mensual)} al mes, pero ${lista(d)}. Edítala en My Estimate (Action → Edit) o agrega otra.`
        : `Tu línea se parece, pero cuesta ${dinero(m.l.mensual)} al mes y debería dar ${dinero(esperado.mensual)}. Revisa sus datos en My Estimate (Action → Edit).`;
    }
    return check(id, `Línea de EC2: ${pide} con ${nombrePago} (${dinero(esperado.mensual)} al mes)`, puntos, Boolean(exacta), retro);
  };

  return [
    revisarLinea(esp.od, 'On-Demand al 100 %', 'ondemand', 8, () =>
      `Bien: ${x.cantidad} × ${x.tipo} On-Demand cuestan ${dinero(esp.od.mensual)} al mes (${x.cantidad} × $${tipoInstancia(x.tipo).precio} por hora × 730 horas). On-Demand no te compromete a nada: pagas por hora mientras estén encendidas.`
    ),
    revisarLinea(esp.sp, 'Compute Savings Plans 3 años No upfront', 'ahorro', 7, () =>
      `Bien: con Compute Savings Plans a 3 años sin pago inicial, los mismos servidores cuestan ${dinero(esp.sp.mensual)} al mes en lugar de ${dinero(esp.od.mensual)}: ahorras ${dinero(esp.od.mensual - esp.sp.mensual)} al mes a cambio de comprometerte a gastar unos $${(esp.sp.mensual / 730).toFixed(3)} por hora (eso da los ${dinero(esp.sp.mensual)} al mes) durante 3 años, aunque no la uses.`
    )
  ];
}

/* ========================================================== presupuesto */

function elegirPresupuesto(estado, x) {
  const todos = estado.costos?.presupuestos ?? [];
  const exacto = todos.find((b) => normal(b.nombre) === normal(x.presupuesto));
  if (exacto) return { b: exacto, exacto: true, todos };
  const puntos = (b) => (b.tipo === 'COST' ? 2 : 0) + (b.periodo === 'MONTHLY' ? 1 : 0) + (Math.abs(b.monto - x.monto) < 0.001 ? 2 : 0) + (b.alertas?.length ?? 0) / 10;
  return { b: [...todos].sort((a, c) => puntos(c) - puntos(a))[0] ?? null, exacto: false, todos };
}

const umbralPorcentaje = (b, a) => (a.tipoUmbral === 'ABSOLUTE_VALUE' ? (b.monto ? (a.umbral / b.monto) * 100 : 0) : a.umbral);
const conCorreo = (a, correo) => (a.correos ?? []).some((c) => normal(c) === normal(correo));

function revisarPresupuesto(estado, x) {
  const { b, exacto, todos } = elegirPresupuesto(estado, x);
  const nombres = todos.map((p) => `«${p.nombre}»`);

  // existe
  const okExiste = Boolean(b && exacto && b.tipo === 'COST' && b.periodo === 'MONTHLY');
  let rExiste;
  if (okExiste) rExiste = `El presupuesto ${x.presupuesto} es de costo y mensual: compara cada mes lo que gastas contra lo que planeaste.`;
  else if (!b) rExiste = `No hay ningún presupuesto. Créalo en Billing and Cost Management → Budgets → Create budget (la plantilla «Monthly cost budget» es la más rápida) con el nombre ${x.presupuesto}.`;
  else if (!exacto) rExiste = `Tus presupuestos se llaman ${lista(nombres)}, pero se pidió ${x.presupuesto}. En AWS el nombre de un presupuesto no se puede cambiar: crea otro con el nombre exacto (y borra el que sobra).`;
  else if (b.tipo !== 'COST') rExiste = `Tu presupuesto ${b.nombre} es de tipo ${b.tipo}, no de costo (Cost budget): ese mide horas de uso o porcentajes, no dólares. Créalo de nuevo como Cost budget.`;
  else rExiste = `Tu presupuesto ${b.nombre} tiene periodo ${b.periodo}, no mensual (Monthly). Edítalo (Actions → Edit) y cambia el Period a Monthly.`;

  // monto
  const okMonto = Boolean(b && Math.abs(b.monto - x.monto) < 0.001);
  const rMonto = !b
    ? `Primero crea el presupuesto ${x.presupuesto}; su monto debe ser ${dinero(x.monto)}.`
    : okMonto
      ? `El monto es ${dinero(x.monto)}: las alertas se calculan como porcentaje de esa cantidad.`
      : `Tu presupuesto ${b.nombre} es de ${dinero(b.monto)}, pero se pidió ${dinero(x.monto)}. Edítalo (Actions → Edit) y corrige «Budgeted amount».`;

  // alertas
  const revisarAlerta = (id, disparador, porcentaje, nombre, puntos, porque) => {
    const alertas = b?.alertas ?? [];
    const buena = alertas.find((a) => a.disparador === disparador && Math.abs(umbralPorcentaje(b, a) - porcentaje) < 0.5 && conCorreo(a, x.correo));
    let retro;
    if (buena) retro = `Tienes la alerta ${nombre} al ${porcentaje} % que avisa a ${x.correo}. ${porque}`;
    else if (!b) retro = `Primero crea el presupuesto; luego necesita una alerta ${nombre} (${disparador === 'ACTUAL' ? 'Actual' : 'Forecasted'}) al ${porcentaje} % con el correo ${x.correo}.`;
    else {
      const mismas = alertas.filter((a) => a.disparador === disparador);
      const casi = mismas.find((a) => Math.abs(umbralPorcentaje(b, a) - porcentaje) < 0.5);
      if (casi) retro = `Tu alerta ${nombre} al ${porcentaje} % avisa a ${lista(casi.correos ?? [], 'nadie')}, no a ${x.correo}. Edita el presupuesto y corrige «Email recipients».`;
      else if (mismas.length) retro = `Tu presupuesto tiene alertas ${nombre} al ${lista(mismas.map((a) => `${Math.round(umbralPorcentaje(b, a) * 100) / 100} %`))}, pero se pidió una al ${porcentaje} %. Edítalo y ajusta el Threshold.`;
      else retro = `Tu presupuesto ${b.nombre} no tiene ninguna alerta ${nombre} (Trigger: ${disparador === 'ACTUAL' ? 'Actual' : 'Forecasted'}). Edítalo y en «Configure alerts» agrega una al ${porcentaje} % con el correo ${x.correo}.`;
    }
    return check(id, `Alerta ${nombre} al ${porcentaje} % que avisa a ${x.correo}`, puntos, Boolean(buena), retro);
  };

  return [
    check('existe', `Presupuesto de costo mensual «${x.presupuesto}»`, 6, okExiste, rExiste),
    check('monto', `El presupuesto es de ${dinero(x.monto)}`, 4, okMonto, rMonto),
    revisarAlerta('real', 'ACTUAL', 85, 'real', 5, 'Avisa cuando lo que YA gastaste pasa del 85 %: todavía te queda margen para reaccionar antes del límite.'),
    revisarAlerta('pronostico', 'FORECASTED', 100, 'pronosticada', 5, 'Avisa cuando AWS calcula que, a este ritmo, vas a pasarte del presupuesto antes de que acabe el mes, aunque todavía no hayas gastado tanto.')
  ];
}

/* ============================================================ etiquetas */

function etiquetaDe(b, llave) {
  const todas = Array.isArray(b?.etiquetas) ? b.etiquetas : [];
  const e = todas.find((x) => String(x.llave ?? '').trim() === llave);
  return e ? { llave, valor: String(e.valor ?? '').trim() } : null;
}

function revisarEtiquetas(estado, x) {
  const buckets = estado.buckets ?? [];
  const b = buckets.find((k) => k.nombre === x.bucket);
  const et = etiquetaDe(b, x.llave);
  const okBucket = Boolean(et && et.valor === x.valor);
  let rBucket;
  if (okBucket) rBucket = `El bucket ${x.bucket} lleva ${x.llave} = ${x.valor}. Todo lo que se cobre por ese bucket queda marcado con el proyecto de la tienda.`;
  else if (!b) {
    const otro = buckets.find((k) => (k.etiquetas ?? []).some((e) => normal(e.llave) === normal(x.llave)));
    rBucket = otro
      ? `Etiquetaste el bucket ${otro.nombre}, pero se pidió el bucket ${x.bucket} (el nombre debe ser exacto). Créalo en S3 → Create bucket y en Tags agrega ${x.llave} = ${x.valor}.`
      : `No existe el bucket ${x.bucket}. Créalo en S3 → Create bucket y, antes de crearlo, en la sección Tags agrega ${x.llave} = ${x.valor}.`;
  } else {
    const parecida = (b.etiquetas ?? []).find((e) => normal(e.llave) === normal(x.llave));
    if (et) rBucket = `El bucket ${x.bucket} tiene ${x.llave} = «${et.valor}», pero el valor debe ser ${x.valor} exacto. Corrígelo en S3 → el bucket → Properties → Tags → Edit.`;
    else if (parecida) rBucket = `El bucket ${x.bucket} tiene la etiqueta «${parecida.llave}», pero se pidió «${x.llave}» con mayúscula inicial: para AWS son etiquetas distintas y en la factura saldrían como dos proyectos. Corrígela en S3 → el bucket → Properties → Tags → Edit.`;
    else rBucket = `El bucket ${x.bucket} existe, pero no tiene la etiqueta ${x.llave} (sus etiquetas: ${lista((b.etiquetas ?? []).map((e) => `${e.llave}=${e.valor}`), 'ninguna')}). Agrégala en S3 → tu bucket → Properties → Tags → Edit → Add new tag.`;
  }

  const activas = estado.costos?.etiquetasActivas ?? [];
  const okActiva = activas.includes(x.llave);
  let rActiva;
  if (okActiva) rActiva = `La llave ${x.llave} está activa como etiqueta de asignación de costos: ya puedes agrupar el gasto por proyecto en Cost Explorer y verlo en la factura.`;
  else {
    const parecida = activas.find((l) => normal(l) === normal(x.llave));
    rActiva = parecida
      ? `Activaste «${parecida}», pero la llave pedida es «${x.llave}» (con mayúscula inicial). Activa la correcta en Billing and Cost Management → Cost allocation tags.`
      : `La llave ${x.llave} no está activada. Ve a Billing and Cost Management → Cost allocation tags → User-defined cost allocation tags, márcala y presiona Activate. Solo aparece en la lista cuando ya la usa algún recurso${b ? '' : ' (primero crea el bucket con la etiqueta)'}.`;
  }

  return [
    check('bucket', `El bucket «${x.bucket}» lleva la etiqueta ${x.llave} = ${x.valor}`, 7, okBucket, rBucket),
    check('activa', `La llave «${x.llave}» está activada en Cost allocation tags`, 8, okActiva, rActiva)
  ];
}

/* ====================================================== Trusted Advisor */

const snapshotPublico = (s) => s.publico === true || s.permisos === 'public' || s.compartido === 'public';

function revisarAdvisor(estado, x) {
  // El snapshot público
  const publicos = (estado.snapshots ?? []).filter(snapshotPublico);
  const original = (estado.snapshots ?? []).find((s) => s.nombre === 'catalogo-2025-respaldo' || s.descripcion === x.snapDescripcion);
  const okSnap = publicos.length === 0;
  const rSnap = okSnap
    ? original
      ? `El snapshot ${original.id} ya es privado: solo tu cuenta (y las que tú agregues) puede usarlo.`
      : 'Borraste el snapshot público del catálogo: ya nadie fuera de la cuenta puede copiar esos datos, y dejas de pagar su almacenamiento.'
    : `Sigue público: ${lista(publicos.map((s) => s.id))}. Un snapshot público lo puede copiar cualquier cuenta de AWS del mundo, con todos sus datos. Bórralo en EC2 → Snapshots → Actions → Delete snapshot (o hazlo privado).`;

  // La IP elástica
  const eips = estado.eips ?? [];
  const sueltas = eips.filter((e) => !e.instanciaId && !e.natId);
  const promo = eips.find((e) => e.nombre === x.eipNombre);
  const okEip = !promo && sueltas.length === 0;
  let rEip;
  if (okEip) rEip = `Liberaste la IP ${x.eipNombre}: desde 2024 AWS cobra cada IPv4 pública (unos $0.005 por hora, cerca de $3.65 al mes), la uses o no. Una IP que nadie usa es dinero tirado.`;
  else if (promo && promo.instanciaId) rEip = `Asociaste ${x.eipNombre} (${promo.ip}) a una instancia, pero la tienda no la necesita y se sigue cobrando: desde 2024 toda IPv4 pública cuesta, aunque esté en uso. Desasóciala y libérala (Actions → Release Elastic IP addresses).`;
  else if (sueltas.length) rEip = `Sigue sin asociar: ${lista(sueltas.map((e) => `${e.nombre ? `«${e.nombre}» ` : ''}${e.ip}`))}. Se cobra cada hora aunque no la use nadie. Libérala en EC2 → Elastic IPs → Actions → Release Elastic IP addresses.`;
  else rEip = `La IP ${x.eipNombre} sigue en la cuenta. Libérala en EC2 → Elastic IPs → Actions → Release Elastic IP addresses.`;

  // MFA de la raíz
  const okMfa = Boolean(estado.iam?.raizMfa);
  const rMfa = okMfa
    ? 'El usuario raíz ya tiene MFA: aunque alguien robe la contraseña, sin el código del dispositivo no entra. La raíz puede hacer TODO en la cuenta (hasta cerrarla), por eso es lo primero que se protege.'
    : 'El usuario raíz sigue sin MFA. Ve a IAM → Dashboard → Security recommendations → «Add MFA for root user» → Add MFA.';

  // Refresh
  const res = estado.costos?.advisor?.resultados ?? {};
  const verde = (id) => res[id]?.estado === 'ok';
  const okRefresh = verde('ebs-snapshots-publicos') && verde('mfa-raiz');
  let rRefresh;
  if (okRefresh) rRefresh = 'Volviste a revisar con Refresh all checks y los chequeos «Amazon EBS Public Snapshots» y «MFA on Root Account» ya salen en verde. Trusted Advisor no se entera solo: muestra lo de su última revisión.';
  else if (okSnap && okMfa) rRefresh = 'Ya corregiste el snapshot y el MFA, pero Trusted Advisor sigue mostrando lo de su última revisión (en rojo). Ve a Trusted Advisor → Recommendations y presiona Refresh all checks.';
  else {
    const faltan = [!verde('ebs-snapshots-publicos') && 'Amazon EBS Public Snapshots', !verde('mfa-raiz') && 'MFA on Root Account'].filter(Boolean);
    const pendientes = [!okSnap && 'el snapshot sigue público', !okMfa && 'la raíz sigue sin MFA'].filter(Boolean);
    rRefresh = `En la última revisión de Trusted Advisor sale en rojo: ${lista(faltan)}. Primero corrige lo que falta (${lista(pendientes)}) y después presiona Refresh all checks para que vuelva a revisar.`;
  }

  return [
    check('snapshot', 'Ningún snapshot de EBS es público', 5, okSnap, rSnap),
    check('eip', `La IP elástica «${x.eipNombre}» quedó liberada (ninguna IP sin usar)`, 5, okEip, rEip),
    check('mfa', 'El usuario raíz tiene MFA', 5, okMfa, rMfa),
    check('refresh', 'Trusted Advisor volvió a revisar y los chequeos de seguridad salen en verde', 5, okRefresh, rRefresh)
  ];
}

/* ======================================================== Organizations */

/**
 * Prueba una acción en una cuenta miembro de la OU `ouId`: la del alumno si
 * existe, o una cuenta de prueba que se agrega a una copia (nunca a la cuenta
 * del alumno), con FullAWSAccess como lo pondría AWS al unirse.
 */
function probarScp(estado, ouId, cuentaId, accion) {
  const e = clonar(estado);
  const org = e.organizations;
  let id = cuentaId;
  if (!id) {
    id = '000000000777';
    org.cuentas.push({ id, nombre: 'prueba', correo: 'prueba@example.com', padre: ouId, estado: 'ACTIVE', metodo: 'CREATED', admin: false });
    const full = org.politicas.find((p) => p.id === FULL_AWS_ACCESS);
    if (org.scpHabilitadas && full) full.objetivos.push(id);
  }
  return accionPermitidaPorScp(e, id, accion);
}

function revisarGobierno(estado, x) {
  const org = estado.organizations;
  const raiz = org?.raiz?.id;
  const ous = org?.ous ?? [];
  const ouDe = (nombre) => ous.find((o) => igualNombre(o.nombre, nombre) && o.padre === raiz) ?? ous.find((o) => igualNombre(o.nombre, nombre)) ?? null;
  const prod = ouDe(x.ouProduccion);
  const pruebas = ouDe(x.ouPruebas);

  // organización
  const okOrg = Boolean(org);
  const rOrg = okOrg
    ? `Creaste la organización ${org.id}: tu cuenta es la de administración y paga una sola factura por todas (facturación consolidada, con descuentos por volumen).`
    : 'Todavía no hay organización. Ve a AWS Organizations y presiona «Create an organization».';

  // OUs
  const enRaiz = (o) => o && o.padre === raiz;
  const okOus = enRaiz(prod) && enRaiz(pruebas);
  let rOus;
  if (okOus) rOus = `Tienes las OU ${prod.nombre} y ${pruebas.nombre} dentro de Root: así cada grupo de cuentas recibe sus propias reglas.`;
  else if (!org) rOus = `Primero crea la organización; luego, en AWS accounts, selecciona Root → Actions → Organizational unit → Create new: ${x.ouProduccion} y ${x.ouPruebas}.`;
  else {
    const falta = [!prod && x.ouProduccion, !pruebas && x.ouPruebas].filter(Boolean);
    const anidadas = [prod, pruebas].filter((o) => o && !enRaiz(o)).map((o) => o.nombre);
    rOus = falta.length
      ? `Te falta la OU ${lista(falta)} (tus OU: ${lista(ous.map((o) => o.nombre), 'ninguna')}). Créala en AWS accounts → selecciona Root → Actions → Organizational unit → Create new.`
      : `Las OU ${lista(anidadas)} quedaron dentro de otra OU, no directo en Root. Bórrala (vacía) y créala de nuevo seleccionando Root.`;
  }

  // la cuenta de pruebas
  const cuentas = (org?.cuentas ?? []).filter((c) => !c.admin && c.estado !== 'SUSPENDED');
  const cuenta = cuentas.find((c) => igualNombre(c.nombre, x.cuentaPruebas)) ?? null;
  const okCuenta = Boolean(cuenta && pruebas && cuenta.padre === pruebas.id);
  let rCuenta;
  if (okCuenta) rCuenta = `La cuenta ${cuenta.nombre} (${cuenta.id}) está en la OU ${pruebas.nombre}: hereda las SCP de esa OU, y sus gastos llegan a la misma factura.`;
  else if (!org) rCuenta = `Primero crea la organización; luego en AWS accounts → Add an AWS account crea ${x.cuentaPruebas} con el correo ${x.correoPruebas}.`;
  else if (!cuenta) rCuenta = `No encontré la cuenta ${x.cuentaPruebas} (cuentas miembro: ${lista(cuentas.map((c) => c.nombre), 'ninguna')}). Créala con Add an AWS account → Create an AWS account y el correo ${x.correoPruebas}.`;
  else rCuenta = `La cuenta ${cuenta.nombre} está en ${org.ous.find((o) => o.id === cuenta.padre)?.nombre ?? 'Root'}, no en la OU ${x.ouPruebas}${pruebas ? '' : ' (que todavía no existe)'}. Selecciónala y usa Actions → Move.`;

  // la SCP, probada de verdad
  const propias = (org?.politicas ?? []).filter((p) => !p.administradaPorAws);
  const cuentaEnPruebas = okCuenta ? cuenta.id : null;
  const rdsPruebas = org && pruebas ? probarScp(estado, pruebas.id, cuentaEnPruebas, 'rds:CreateDBInstance') : null;
  const okScp = Boolean(org?.scpHabilitadas && rdsPruebas && !rdsPruebas.permitida && rdsPruebas.motivo === 'deny-explicito');
  let rScp;
  if (okScp) rScp = `Probé crear una base de RDS desde una cuenta de la OU ${pruebas.nombre}: la niega tu SCP «${rdsPruebas.politica}» con un Deny explícito. Ni el administrador de esa cuenta puede saltárselo: es el mismo «explicit deny» que ves en el sandbox de DataCamp.`;
  else if (!org) rScp = 'Primero crea la organización; luego en Policies → Service control policies habilita las SCP y crea la política que niega rds:*.';
  else if (!org.scpHabilitadas) rScp = 'Las service control policies no están habilitadas. Ve a Policies → Service control policies → Enable service control policies.';
  else if (!pruebas) rScp = `Falta la OU ${x.ouPruebas}, que es donde va la SCP.`;
  else if (!propias.length) rScp = `Solo existe FullAWSAccess. Crea una SCP (Policies → Service control policies → Create policy) con "Effect": "Deny", "Action": "rds:*" y "Resource": "*", y adjúntala a la OU ${pruebas.nombre}.`;
  else {
    const enPruebas = propias.filter((p) => p.objetivos.includes(pruebas.id));
    if (!enPruebas.length) {
      rScp = `Tienes ${lista(propias.map((p) => `«${p.nombre}»`))}, pero ninguna está adjunta a la OU ${pruebas.nombre}${propias.some((p) => p.objetivos.length) ? ` (están en: ${lista([...new Set(propias.flatMap((p) => p.objetivos.map((o) => (o === org.raiz.id ? 'Root' : org.ous.find((u) => u.id === o)?.nombre ?? o))))])})` : ''}. En el detalle de la política → Targets → Attach, elige ${pruebas.nombre}.`;
    } else {
      rScp = `Tu SCP ${lista(enPruebas.map((p) => `«${p.nombre}»`))} está en ${pruebas.nombre}, pero no niega crear bases de RDS (rds:CreateDBInstance sigue ${rdsPruebas?.permitida ? 'permitida' : 'sin un Deny explícito'}). Revisa que diga "Effect": "Deny" y "Action": "rds:*".`;
    }
  }

  // ¿no rompió nada más?
  const ec2Pruebas = okScp ? probarScp(estado, pruebas.id, cuentaEnPruebas, 'ec2:RunInstances') : null;
  const rdsProd = okScp && prod ? probarScp(estado, prod.id, null, 'rds:CreateDBInstance') : null;
  const okSinDano = Boolean(okScp && ec2Pruebas?.permitida && rdsProd?.permitida);
  let rSinDano;
  if (okSinDano) rSinDano = `En ${pruebas.nombre} se siguen pudiendo lanzar instancias EC2 y en ${prod.nombre} sí se pueden crear bases: la SCP solo quita RDS en pruebas, que es lo que se pidió. Recuerda que una SCP no da permisos, solo pone el techo.`;
  else if (!okScp) rSinDano = 'Esto se revisa cuando la SCP de la OU de pruebas ya niega RDS: que no niegue de más (EC2 en pruebas) ni en otro lado (RDS en producción).';
  else if (!prod) rSinDano = `Falta la OU ${x.ouProduccion} para comprobar que producción no quedó afectada.`;
  else if (!ec2Pruebas?.permitida) rSinDano = `Tu SCP niega de más: en ${pruebas.nombre} tampoco se puede lanzar EC2 (${ec2Pruebas?.motivo === 'deny-implicito' ? 'no queda ningún Allow: no le quites FullAWSAccess' : `lo niega «${ec2Pruebas?.politica}»`}). Deja solo "rds:*" en el Deny.`;
  else rSinDano = `La SCP también afecta a ${prod.nombre}: ahí tampoco se pueden crear bases (${rdsProd?.politica ? `la niega «${rdsProd.politica}»` : 'falta un Allow'}). Adjúntala solo a ${pruebas.nombre}, no a Root ni a ${prod.nombre}.`;

  return [
    check('organizacion', 'Existe la organización', 3, okOrg, rOrg),
    check('ous', `Las OU «${x.ouProduccion}» y «${x.ouPruebas}» dentro de Root`, 4, okOus, rOus),
    check('cuenta', `La cuenta «${x.cuentaPruebas}» está en la OU «${x.ouPruebas}»`, 3, okCuenta, rCuenta),
    check('scp', `Una SCP niega RDS en la OU «${x.ouPruebas}»`, 5, okScp, rScp),
    check('sin-dano', 'La SCP no niega de más (EC2 en pruebas y RDS en producción siguen permitidos)', 3, okSinDano, rSinDano)
  ];
}

/* ===================================================== Well-Architected */

const PREGUNTAS_REL = () => PREGUNTAS_WA.filter((q) => q.pilar === 'REL');
const relContestadas = (respuestas = {}) => PREGUNTAS_REL().filter((q) => {
  const r = respuestas[q.id];
  return Boolean(r && ((r.elegidas ?? []).length || r.ninguna));
});

function revisarRevision(estado, x) {
  const cargas = estado.wellarchitected?.cargas ?? [];
  const exacta = cargas.find((c) => igualNombre(c.nombre, x.carga));
  const carga = exacta ?? [...cargas].sort((a, b) => relContestadas(b.respuestas).length - relContestadas(a.respuestas).length)[0] ?? null;

  const okCarga = Boolean(exacta && exacta.entorno === 'PREPRODUCTION' && (exacta.regiones ?? []).includes('us-east-1') && (exacta.lentes ?? []).includes('wellarchitected'));
  let rCarga;
  if (okCarga) rCarga = `El workload ${exacta.nombre} está definido en Pre-production, en US East (N. Virginia), con la lente AWS Well-Architected Framework.`;
  else if (!cargas.length) rCarga = `No hay ningún workload. Ve a AWS Well-Architected Tool → Define workload y créalo con el nombre ${x.carga}.`;
  else if (!exacta) rCarga = `Tus workloads se llaman ${lista(cargas.map((c) => `«${c.nombre}»`))}, pero se pidió ${x.carga}. Puedes cambiar el nombre en el workload → Properties → Edit.`;
  else {
    const d = [];
    if (exacta.entorno !== 'PREPRODUCTION') d.push('el entorno es Production, no Pre-production (la tienda todavía no estrena esta versión)');
    if (!(exacta.regiones ?? []).includes('us-east-1')) d.push(`las regiones son ${lista([...(exacta.regiones ?? []), ...(exacta.regionesNoAws ?? [])], 'ninguna')}, sin US East (N. Virginia)`);
    rCarga = `Tu workload ${exacta.nombre} existe, pero ${lista(d)}. Corrígelo en Properties → Edit.`;
  }

  const contestadas = carga ? relContestadas(carga.respuestas) : [];
  const okRel = Boolean(exacta && contestadas.length >= x.preguntasRel);
  let rRel;
  if (okRel) rRel = `Contestaste ${contestadas.length} preguntas de Reliability (${lista(contestadas.map((q) => q.clave))}). Las prácticas que no marcaste quedan como riesgos (alto o medio) en el Improvement plan: esa es la lista de pendientes de la tienda.`;
  else if (!carga) rRel = `Primero define el workload ${x.carga}; luego, en «Start reviewing», contesta al menos ${x.preguntasRel} preguntas del pilar Reliability.`;
  else if (!exacta) rRel = `Contesta las preguntas en el workload ${x.carga} (el de nombre exacto).`;
  else rRel = `En el pilar Reliability llevas ${contestadas.length} de ${x.preguntasRel} preguntas contestadas${contestadas.length ? ` (${lista(contestadas.map((q) => q.clave))})` : ''}. Marca las buenas prácticas que sí se siguen, o «None of these»; «Question does not apply» no cuenta. Usa «Save and exit» o Next para que se guarde.`;

  const hitos = carga?.hitos ?? [];
  const hitoBueno = exacta ? (exacta.hitos ?? []).find((h) => relContestadas(h.respuestas).length >= x.preguntasRel) : null;
  const okHito = Boolean(hitoBueno);
  let rHito;
  if (okHito) rHito = `El milestone «${hitoBueno.nombre}» guardó la foto de tus respuestas: en la próxima revisión podrás comparar cuántos riesgos se resolvieron.`;
  else if (!exacta) rHito = `Primero define el workload ${x.carga}, contesta las preguntas y después presiona Save milestone.`;
  else if (!hitos.length) rHito = 'No hay ningún milestone. Cuando termines de contestar, presiona «Save milestone» en el workload y ponle un nombre.';
  else rHito = `Tus milestones (${lista(hitos.map((h) => `«${h.nombre}»`))}) se guardaron antes de contestar ${x.preguntasRel} preguntas de Reliability: un milestone es una foto de ese momento. Guarda otro ahora que ya contestaste.`;

  return [
    check('carga', `Workload «${x.carga}» en Pre-production y us-east-1`, 4, okCarga, rCarga),
    check('fiabilidad', `Al menos ${x.preguntasRel} preguntas de Reliability contestadas`, 4, okRel, rRel),
    check('hito', 'Un milestone guardado después de contestar', 4, okHito, rHito)
  ];
}

/* ============================================================== soporte */

function revisarSoporte(estado) {
  const casos = estado.costos?.casos ?? [];
  const cuenta = casos.find((c) => c.tipo === 'account');
  const ok = Boolean(cuenta);
  let retro;
  if (ok) retro = `Abriste el caso ${cuenta.numero} de Account and billing. Con el plan Basic esto es gratis; los casos técnicos (y respuestas en menos de 1 hora si producción se cae) piden Business Support+ o mayor.`;
  else if (casos.length) retro = 'Tus casos no son de tipo Account and billing. Con el plan Basic solo se pueden abrir de cuenta y facturación: Support → Create case → Account and billing.';
  else retro = 'No abriste ningún caso. Es opcional: Support → Support Center → Create case → Account and billing.';
  return [check('caso', 'Un caso de soporte de cuenta y facturación', 5, ok, retro)];
}

/* ============================================================== revisar */

export function revisar(estadoOriginal, datos) {
  const estado = preparar(estadoOriginal);
  const x = datosLab(datos);
  return armar(LAB.tareas(datos), {
    estimacion: revisarEstimacion(estado, x),
    presupuesto: revisarPresupuesto(estado, x),
    etiquetas: revisarEtiquetas(estado, x),
    advisor: revisarAdvisor(estado, x),
    gobierno: revisarGobierno(estado, x),
    revision: revisarRevision(estado, x),
    soporte: revisarSoporte(estado)
  });
}

/* ============================================================= solución */

/** La cuenta resuelta, hecha solo con acciones del modelo (como en la consola). */
export function solucion(datos) {
  const x = datosLab(datos);
  const e = LAB.estadoInicial(datos);
  const esp = lineasEsperadas(x);

  // estimación
  const est = crearEstimacion(e, {});
  guardarServicioEstimacion(e, est.id, { servicio: 'ec2', descripcion: 'Navidad On-Demand', config: esp.od.config });
  guardarServicioEstimacion(e, est.id, { servicio: 'ec2', descripcion: 'Navidad Savings Plans', config: esp.sp.config });

  // presupuesto (plantilla Monthly cost budget)
  crearPresupuesto(e, { nombre: x.presupuesto, plantilla: 'mensual', monto: x.monto, correos: [x.correo] });

  // etiquetas
  crearBucket(e, { nombre: x.bucket, etiquetas: [{ llave: x.llave, valor: x.valor }] });
  activarEtiquetasCosto(e, [x.llave]);

  // Trusted Advisor
  for (const s of e.snapshots.filter(snapshotPublico)) eliminarSnapshot(e, s.id);
  for (const ip of e.eips.filter((i) => !i.instanciaId && !i.natId)) liberarEip(e, ip.id);
  asignarMfaRaiz(e);
  refrescarAdvisor(e);

  // Organizations
  crearOrganizacion(e, {});
  crearUnidadOrganizativa(e, { nombre: x.ouProduccion });
  const pruebas = crearUnidadOrganizativa(e, { nombre: x.ouPruebas });
  crearCuentaOrganizacion(e, { nombre: x.cuentaPruebas, correo: x.correoPruebas, padre: pruebas.id });
  habilitarScp(e);
  const pol = crearPoliticaScp(e, {
    nombre: x.scp,
    descripcion: 'Nadie crea bases de RDS en pruebas',
    documento: JSON.stringify({ Version: '2012-10-17', Statement: [{ Sid: 'NegarRds', Effect: 'Deny', Action: 'rds:*', Resource: '*' }] }, null, 2)
  });
  adjuntarPoliticaScp(e, pol.id, pruebas.id);

  // Well-Architected
  const carga = crearCargaWa(e, {
    nombre: x.carga,
    descripcion: 'Tienda en linea de Bicicletas Rodada 29',
    responsable: 'Doña Carmen',
    entorno: 'PREPRODUCTION',
    regiones: ['us-east-1'],
    lentes: ['wellarchitected']
  });
  responderPreguntaWa(e, carga.id, 'REL2', { elegidas: ['REL02-BP03'] });
  responderPreguntaWa(e, carga.id, 'REL7', { ninguna: true });
  responderPreguntaWa(e, carga.id, 'REL9', { elegidas: ['REL09-BP01', 'REL09-BP03'] });
  guardarHitoWa(e, carga.id, x.hito);

  // bono: caso de soporte
  crearCasoSoporte(e, {
    tipo: 'account',
    servicio: 'Billing',
    categoria: 'Charges and refunds',
    asunto: 'Cobro de una IP elastica sin usar',
    descripcion: `Hola, en la factura de octubre de la cuenta de ${x.sufijo} aparece un cobro por una IP elastica que no usabamos. ¿Por qué se cobra?`
  });

  avanzar(e, reloj.ahora() + 60_000);
  return e;
}
