// ---------------------------------------------------------------------------
// CLOUDWATCH Y CLOUDTRAIL (el modelo)
//
// Métricas, alarmas, tableros, grupos de logs y el registro de auditoría.
//
// Las MÉTRICAS no se guardan: se calculan en el momento a partir del estado
// (las instancias, los grupos de Auto Scaling, los balanceadores, las colas…)
// y del reloj. El tiempo va comprimido (SIMULADOR.md §3): un periodo de
// CloudWatch (1 o 5 minutos en AWS) dura 10 segundos reales. El periodo k va
// de k·10 s a (k+1)·10 s desde 1970; su valor sale de una cuenta determinista
// (la CPU base de cada instancia sale de su id), así que la gráfica dibujada
// dos veces da lo mismo.
//
// La forma de las colecciones:
//
// estado.cloudwatch = {
//   alarmas: [{
//     nombre, arn, descripcion, creado (iso), creadaPor: null | 'autoscaling',
//     metrica: { namespace: 'AWS/EC2', nombre: 'CPUUtilization', dimensiones: { AutoScalingGroupName: 'grupo-web' } },
//     estadistica: 'Average' | 'Sum' | 'Minimum' | 'Maximum' | 'SampleCount',
//     periodo: 300,                     // segundos «de AWS» (en el simulador cada periodo dura 10 s)
//     comparacion: 'GreaterThanThreshold' | 'GreaterThanOrEqualToThreshold' | 'LessThanThreshold' | 'LessThanOrEqualToThreshold',
//     umbral: 70,
//     puntos: 1, evaluaciones: 1,       // «Datapoints to alarm»: puntos de cada `evaluaciones`
//     datosFaltantes: 'missing' | 'notBreaching' | 'breaching' | 'ignore',
//     accionesActivas: true,
//     acciones: { ALARM: [arn], OK: [arn], INSUFFICIENT_DATA: [arn] },
//     estado: 'INSUFFICIENT_DATA' | 'OK' | 'ALARM', razon, desde (iso del último cambio),
//     evaluada: n (el último periodo evaluado), ultimoValor: número | null,
//     historial: [{ t (iso), tipo: 'StateUpdate' | 'Action' | 'ConfigurationUpdate', resumen, ok? }]   // máximo 40
//   }],
//   tableros: [{ nombre, arn, creado, modificado,
//     widgets: [{ id, tipo: 'linea' | 'numero' | 'texto', titulo, metricas: [{ namespace, metrica, dimensiones, estadistica }], texto }] }],
//   gruposLogs: [{ nombre, arn, creado, retencion: null | días, clase: 'STANDARD' | 'INFREQUENT_ACCESS',
//     flujos: [{ nombre, creado, ultimo (ms), eventos: [{ t (ms), m (texto) }] }] }],
//   carga: { '<instanciaId>' | 'asg:<nombre>': [{ cpu, desde (ms), hasta (ms), instancias }] }
//          // «Simular hora pico»: mientras dura, la CPU de esas instancias sube a `cpu`.
//          // En un grupo, la carga se reparte: si arrancó con 2 instancias y ya hay 4,
//          // cada una ve cpu × 2 / 4 (así se ve por qué escalar baja la CPU).
// }
// estado.cloudtrail = { trails: [{ nombre, arn, bucket, prefijo, multiRegion, validacion, kms, registrando,
//   eventosLectura, eventosEscritura, creado, entregados (cuántos eventos de la bitácora ya se entregaron), ultimaEntrega (ms) }] }
//
// El Event history de CloudTrail no se guarda: se arma con estado.bitacora
// (eventosCloudTrail). Las acciones del simulador que no son de AWS se anotan
// con el servicio 'Simulador' y no salen ahí.
//
// Regla del ciclo de módulos: nada de modelo.js en el nivel superior.
// ---------------------------------------------------------------------------

import { registrarExtension, llamar, existeFuncion } from './registro.js';
import {
  anotar,
  errorAws,
  iso,
  nombreLimpio,
  reloj,
  hexAzar,
  detenerInstancia,
  terminarInstancia,
  reiniciarInstancia,
  crearBucket
} from '../modelo.js';

/** Los tiempos comprimidos (SIMULADOR.md §3). */
export const DURACION_CLOUDWATCH = {
  periodo: 10000, // un periodo de métrica (1 o 5 min en AWS)
  entregaTrail: 30000, // cada cuánto un trail deja un archivo en su bucket
  retenerCarga: 3600000 // las ventanas de carga viejas se borran después de 1 hora
};

const P = () => DURACION_CLOUDWATCH.periodo;

const TOPES = { historial: 40, eventosFlujo: 100, flujosGrupo: 20, eventosTotales: 500, mensaje: 400, alarmas: 200, tableros: 50, widgets: 30, gruposLogs: 100, ventanas: 6, trails: 5, archivosTrail: 30 };

function iniciar(estado) {
  estado.cloudwatch ??= { alarmas: [], tableros: [], gruposLogs: [], carga: {} };
  const cw = estado.cloudwatch;
  cw.alarmas ??= [];
  cw.tableros ??= [];
  cw.gruposLogs ??= [];
  cw.carga ??= {};
  estado.cloudtrail ??= { trails: [] };
  estado.cloudtrail.trails ??= [];
}

/* ============================================================ utilidades */

/** Un número de 32 bits estable a partir de un texto (FNV-1a). */
function hash(texto) {
  let h = 0x811c9dc5;
  const s = String(texto);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Un «azar» repetible entre 0 y 1. */
const azar = (texto) => hash(texto) / 4294967296;

/** Fechas como vengan (iso o ms) → ms; null si no se entiende. */
function aMs(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Date.parse(v);
  return Number.isNaN(n) ? null : n;
}

const redondear = (v, d = 2) => (v === null || v === undefined ? null : Math.round(v * 10 ** d) / 10 ** d);
const cuentaId = (estado) => estado.cuenta?.id ?? '123456789012';

/** Las dimensiones como objeto { Nombre: valor }, vengan como vengan. */
function normalizarDimensiones(d) {
  if (!d) return {};
  if (Array.isArray(d)) {
    const o = {};
    for (const x of d) {
      const n = x?.nombre ?? x?.Name ?? x?.name;
      if (n) o[n] = String(x.valor ?? x.Value ?? x.value ?? '');
    }
    return o;
  }
  const o = {};
  for (const [k, v] of Object.entries(d)) if (v !== undefined && v !== null) o[k] = String(v);
  return o;
}

/** Una referencia a métrica en su forma única: { namespace, metrica, dimensiones, estadistica }. */
export function referenciaMetrica(r = {}) {
  return {
    namespace: String(r.namespace ?? r.Namespace ?? ''),
    metrica: String(r.metrica ?? r.nombre ?? r.MetricName ?? r.metricName ?? ''),
    dimensiones: normalizarDimensiones(r.dimensiones ?? r.Dimensions),
    estadistica: r.estadistica ?? r.Statistic ?? 'Average'
  };
}

/** Clave de una métrica (namespace + nombre + dimensiones ordenadas). */
export const claveMetrica = (r) => {
  const x = referenciaMetrica(r);
  return `${x.namespace}|${x.metrica}|${Object.keys(x.dimensiones).sort().map((k) => `${k}=${x.dimensiones[k]}`).join(',')}`;
};

/* ============================================================== el catálogo */

// Las métricas que ofrece cada espacio de nombres, por grupo de dimensiones.
// unidad: como la reporta AWS. 'sin' = sin unidad.
const METRICAS_EC2 = [
  ['CPUUtilization', 'Percent'],
  ['NetworkIn', 'Bytes'],
  ['NetworkOut', 'Bytes'],
  ['NetworkPacketsIn', 'Count'],
  ['NetworkPacketsOut', 'Count'],
  ['StatusCheckFailed', 'Count'],
  ['StatusCheckFailed_Instance', 'Count'],
  ['StatusCheckFailed_System', 'Count'],
  ['CPUCreditUsage', 'Count'],
  ['CPUCreditBalance', 'Count']
];
const METRICAS_ASG = ['GroupMinSize', 'GroupMaxSize', 'GroupDesiredCapacity', 'GroupInServiceInstances', 'GroupPendingInstances', 'GroupTerminatingInstances', 'GroupTotalInstances'];
const METRICAS_ALB = ['RequestCount', 'ActiveConnectionCount', 'NewConnectionCount', 'ProcessedBytes', 'HTTPCode_Target_2XX_Count', 'HTTPCode_ELB_5XX_Count', 'TargetResponseTime', 'ConsumedLCUs'];
const METRICAS_ALB_TG = ['HealthyHostCount', 'UnHealthyHostCount', 'RequestCount', 'TargetResponseTime', 'HTTPCode_Target_2XX_Count'];
const METRICAS_SQS = ['ApproximateNumberOfMessagesVisible', 'ApproximateNumberOfMessagesNotVisible', 'ApproximateNumberOfMessagesDelayed', 'ApproximateAgeOfOldestMessage', 'NumberOfMessagesSent', 'NumberOfMessagesReceived', 'NumberOfMessagesDeleted'];
const METRICAS_SNS = ['NumberOfMessagesPublished', 'NumberOfNotificationsDelivered', 'NumberOfNotificationsFailed'];
const METRICAS_LAMBDA = ['Invocations', 'Errors', 'Duration', 'Throttles', 'ConcurrentExecutions'];
const METRICAS_RDS = ['CPUUtilization', 'DatabaseConnections', 'FreeStorageSpace', 'FreeableMemory', 'ReadIOPS', 'WriteIOPS', 'ReadLatency', 'WriteLatency'];
const METRICAS_DYNAMO = ['ConsumedReadCapacityUnits', 'ConsumedWriteCapacityUnits', 'ProvisionedReadCapacityUnits', 'ProvisionedWriteCapacityUnits', 'ThrottledRequests'];
const METRICAS_LOGS = ['IncomingLogEvents', 'IncomingBytes'];

const UNIDADES = {
  CPUUtilization: 'Percent',
  NetworkIn: 'Bytes',
  NetworkOut: 'Bytes',
  ProcessedBytes: 'Bytes',
  FreeStorageSpace: 'Bytes',
  FreeableMemory: 'Bytes',
  IncomingBytes: 'Bytes',
  SentMessageSize: 'Bytes',
  TargetResponseTime: 'Seconds',
  ReadLatency: 'Seconds',
  WriteLatency: 'Seconds',
  ApproximateAgeOfOldestMessage: 'Seconds',
  Duration: 'Milliseconds',
  ReadIOPS: 'Count/Second',
  WriteIOPS: 'Count/Second',
  EstimatedCharges: 'None',
  ConsumedLCUs: 'None'
};

/** La unidad de una métrica ('Percent', 'Bytes', 'Count'…). */
export const unidadMetrica = (metrica) => UNIDADES[metrica] ?? 'Count';

/** Los espacios de nombres que se muestran en «Browse», en el orden de la consola. */
export const ESPACIOS_METRICAS = [
  { namespace: 'AWS/ApplicationELB', corto: 'ApplicationELB' },
  { namespace: 'AWS/AutoScaling', corto: 'Auto Scaling' },
  { namespace: 'AWS/Billing', corto: 'Billing' },
  { namespace: 'AWS/DynamoDB', corto: 'DynamoDB' },
  { namespace: 'AWS/EC2', corto: 'EC2' },
  { namespace: 'AWS/Lambda', corto: 'Lambda' },
  { namespace: 'AWS/Logs', corto: 'Logs' },
  { namespace: 'AWS/RDS', corto: 'RDS' },
  { namespace: 'AWS/SNS', corto: 'SNS' },
  { namespace: 'AWS/SQS', corto: 'SQS' }
];

// Los nombres de servicio de AWS/Billing (dimensión ServiceName).
const SERVICIOS_FACTURA = ['AmazonEC2', 'AWSELB', 'AmazonS3', 'AmazonRDS', 'AWSLambda', 'AmazonDynamoDB', 'AmazonCloudWatch', 'AmazonSNS', 'AWSQueueService', 'AmazonVPC', 'AmazonCloudFront', 'AmazonRoute53', 'AmazonElastiCache', 'AmazonEFS', 'awskms', 'AWSSecretsManager'];

/* --- lectores tolerantes de las colecciones de otros servicios --- */

const gruposAsg = (estado) => estado.autoscaling?.grupos ?? [];
const nombreAsg = (g) => g?.nombre ?? g?.name ?? '';
const idsDeAsg = (g) => (g?.instancias ?? []).map((x) => (typeof x === 'string' ? x : x?.id ?? x?.instanciaId)).filter(Boolean);
const balanceadores = (estado) => estado.elb?.balanceadores ?? [];
const gruposDestino = (estado) => estado.elb?.gruposDestino ?? [];
const colasSqs = (estado) => estado.sqs?.colas ?? [];
const temasSns = (estado) => estado.sns?.temas ?? [];
const funcionesLambda = (estado) => estado.lambda?.funciones ?? [];
const basesRds = (estado) => estado.rds?.instancias ?? [];
const tablasDynamo = (estado) => estado.dynamodb?.tablas ?? [];
const idRds = (r) => r?.identificador ?? r?.id ?? r?.nombre ?? '';

/** «app/mi-alb/50dc6c495c0c9188», la dimensión LoadBalancer de un ALB. */
export function dimensionBalanceador(b) {
  const m = /loadbalancer\/(.+)$/.exec(b?.arn ?? '');
  return m ? m[1] : `app/${b?.nombre ?? ''}/${(hash(b?.nombre ?? '') >>> 0).toString(16).padStart(16, '0').slice(0, 16)}`;
}

/** «targetgroup/tg-web/73e2d6bc24d8a067», la dimensión TargetGroup. */
export function dimensionGrupoDestino(g) {
  const m = /(targetgroup\/.+)$/.exec(g?.arn ?? '');
  return m ? m[1] : `targetgroup/${g?.nombre ?? ''}/${(hash(g?.nombre ?? '') >>> 0).toString(16).padStart(16, '0').slice(0, 16)}`;
}

/** Los ARN de grupo de destino a los que reenvía un balanceador (por sus oyentes y reglas). */
function tgsDeBalanceador(b) {
  const arns = new Set();
  const ver = (acc) => {
    if (!acc) return;
    const tg = acc.tgArn ?? acc.grupoDestino ?? acc.targetGroupArn;
    if (tg) arns.add(tg);
    for (const x of acc.grupos ?? []) arns.add(x.tgArn ?? x.arn ?? x);
  };
  for (const o of b?.oyentes ?? []) {
    ver(o.accion);
    for (const r of o.reglas ?? []) ver(r.accion);
  }
  return [...arns];
}

const coincideTg = (g, valor) => g.arn === valor || g.nombre === valor || dimensionGrupoDestino(g) === valor;

/**
 * Todas las métricas que existen ahora en la cuenta, para «Browse».
 * → [{ namespace, conjunto, dimensiones, metrica, etiqueta? }]
 */
export function catalogoMetricas(estado) {
  iniciar(estado);
  const lista = [];
  const meter = (namespace, conjunto, dimensiones, metricas, etiqueta) => {
    for (const m of metricas) lista.push({ namespace, conjunto, dimensiones, metrica: Array.isArray(m) ? m[0] : m, etiqueta });
  };

  // EC2: por instancia (las que alguna vez arrancaron), por grupo y de todas.
  const conDatos = (estado.instancias ?? []).filter((i) => i.estado === 'running' || (i.arranques ?? 0) > 0);
  for (const i of conDatos) meter('AWS/EC2', 'Per-Instance Metrics', { InstanceId: i.id }, METRICAS_EC2.filter(([m]) => !m.startsWith('CPUCredit') || /^t[234]/.test(i.tipo ?? '')), i.nombre || '');
  for (const g of gruposAsg(estado)) meter('AWS/EC2', 'By Auto Scaling Group', { AutoScalingGroupName: nombreAsg(g) }, ['CPUUtilization', 'NetworkIn', 'NetworkOut', 'NetworkPacketsIn', 'NetworkPacketsOut', 'StatusCheckFailed']);
  if (conDatos.length) meter('AWS/EC2', 'Across All Instances', {}, ['CPUUtilization', 'NetworkIn', 'NetworkOut', 'NetworkPacketsIn', 'NetworkPacketsOut']);

  for (const g of gruposAsg(estado)) meter('AWS/AutoScaling', 'Group Metrics', { AutoScalingGroupName: nombreAsg(g) }, METRICAS_ASG);

  for (const b of balanceadores(estado)) {
    if ((b.tipo ?? 'application') !== 'application') continue;
    const lb = dimensionBalanceador(b);
    meter('AWS/ApplicationELB', 'Per AppELB Metrics', { LoadBalancer: lb }, METRICAS_ALB, b.nombre);
    for (const arn of tgsDeBalanceador(b)) {
      const g = gruposDestino(estado).find((x) => coincideTg(x, arn));
      if (g) meter('AWS/ApplicationELB', 'Per AppELB, per TG Metrics', { LoadBalancer: lb, TargetGroup: dimensionGrupoDestino(g) }, METRICAS_ALB_TG, g.nombre);
    }
  }
  for (const g of gruposDestino(estado)) meter('AWS/ApplicationELB', 'Per TG Metrics', { TargetGroup: dimensionGrupoDestino(g) }, ['RequestCountPerTarget'], g.nombre);

  for (const c of colasSqs(estado)) meter('AWS/SQS', 'Queue Metrics', { QueueName: c.nombre }, METRICAS_SQS);
  for (const tema of temasSns(estado)) meter('AWS/SNS', 'Topic Metrics', { TopicName: tema.nombre }, METRICAS_SNS);

  const funciones = new Set(funcionesLambda(estado).map((f) => f.nombre).filter(Boolean));
  for (const g of estado.cloudwatch.gruposLogs) if (g.nombre.startsWith('/aws/lambda/')) funciones.add(g.nombre.slice(12));
  for (const f of funciones) meter('AWS/Lambda', 'By Function Name', { FunctionName: f }, METRICAS_LAMBDA);
  if (funciones.size) meter('AWS/Lambda', 'Across All Functions', {}, ['Invocations', 'Errors', 'Duration', 'ConcurrentExecutions']);

  for (const r of basesRds(estado)) if (idRds(r)) meter('AWS/RDS', 'Per-Database Metrics', { DBInstanceIdentifier: idRds(r) }, METRICAS_RDS);

  for (const t of tablasDynamo(estado)) {
    if (!t.nombre) continue;
    meter('AWS/DynamoDB', 'Table Metrics', { TableName: t.nombre }, METRICAS_DYNAMO.filter((m) => !m.startsWith('Provisioned') || provisionadaDynamo(t)));
  }

  for (const g of estado.cloudwatch.gruposLogs) meter('AWS/Logs', 'Log Group Metrics', { LogGroupName: g.nombre }, METRICAS_LOGS);

  if (existeFuncion('costoMensual')) {
    meter('AWS/Billing', 'Total Estimated Charge', { Currency: 'USD' }, ['EstimatedCharges']);
    for (const s of SERVICIOS_FACTURA) {
      const v = costo(estado, s);
      if (v !== null && v > 0) meter('AWS/Billing', 'By Service', { ServiceName: s, Currency: 'USD' }, ['EstimatedCharges']);
    }
  }
  return lista;
}

function provisionadaDynamo(t) {
  const modo = String(t.modo ?? t.facturacion ?? t.capacidad?.modo ?? '').toUpperCase();
  return modo.includes('PROVISIONED');
}

function costo(estado, servicio) {
  let v;
  try {
    v = llamar('costoMensual', estado, servicio ? { servicio } : {});
  } catch {
    return null;
  }
  if (v && typeof v === 'object') v = v.total ?? v.monto ?? null;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/* ======================================================== cálculo de valores */

/**
 * Lo que se calcula una vez por consulta: a qué grupo pertenece cada instancia
 * y cuántas vivas tiene cada grupo (para repartir la carga).
 */
function contexto(estado) {
  const asgDe = new Map();
  const vivasAsg = new Map();
  for (const g of gruposAsg(estado)) {
    const n = nombreAsg(g);
    for (const id of idsDeAsg(g)) asgDe.set(id, n);
  }
  for (const i of estado.instancias ?? []) {
    const etq = (i.etiquetas ?? []).find((e) => (e.llave ?? e.Key) === 'aws:autoscaling:groupName');
    const n = i.autoscaling ?? i.asg ?? i.grupoAutoScaling ?? etq?.valor ?? etq?.Value;
    if (n && !asgDe.has(i.id)) asgDe.set(i.id, n);
  }
  const miembrosAsg = new Map();
  for (const i of estado.instancias ?? []) {
    const n = asgDe.get(i.id);
    if (!n) continue;
    if (i.estado === 'running' || i.estado === 'pending') vivasAsg.set(n, (vivasAsg.get(n) ?? 0) + 1);
    if (!miembrosAsg.has(n)) miembrosAsg.set(n, []);
    miembrosAsg.get(n).push(i);
  }
  return { estado, asgDe, vivasAsg, miembrosAsg, carga: estado.cloudwatch?.carga ?? {} };
}

/**
 * Cuántas instancias del grupo mandaban métricas en t. La carga se reparte
 * entre ellas: así la gráfica de un periodo viejo no cambia cuando el grupo
 * crece después (la hora pico se sigue viendo arriba del umbral).
 */
function activasAsg(cx, asg, t) {
  let n = 0;
  for (const i of cx.miembrosAsg.get(asg) ?? []) if (instanciaActiva(i, t)) n += 1;
  return n;
}

/** ¿La instancia mandaba métricas en el instante t? */
function instanciaActiva(inst, t) {
  const lanzada = aMs(inst.lanzada);
  if (lanzada === null) return inst.estado === 'running';
  const inicio = lanzada + 8000;
  const fin = inst.estado === 'running' ? Infinity : aMs(inst.desde) ?? lanzada;
  return t >= inicio && t <= fin && !(inst.estado === 'pending' && (inst.arranques ?? 0) === 0);
}

/** El nivel de carga simulada (0-100) que ve una instancia en t. */
function nivelCarga(cx, inst, t) {
  let nivel = 0;
  for (const v of cx.carga[inst.id] ?? []) if (t >= v.desde && t < v.hasta) nivel = Math.max(nivel, v.cpu);
  const asg = cx.asgDe.get(inst.id);
  if (asg) {
    const n = Math.max(1, activasAsg(cx, asg, t));
    for (const v of cx.carga[`asg:${asg}`] ?? []) {
      if (t >= v.desde && t < v.hasta) nivel = Math.max(nivel, (v.cpu * Math.max(1, v.instancias ?? 1)) / Math.max(n, v.instancias ?? 1));
    }
  }
  return nivel;
}

/** La CPU (%) de una instancia en t, o null si no estaba prendida. */
function cpuInstancia(cx, inst, t) {
  if (!instanciaActiva(inst, t)) return null;
  const base = 3 + azar(inst.id) * 12;
  const ruido = (azar(`${inst.id}:${Math.floor(t / P())}`) - 0.5) * 3;
  const v = Math.max(base, nivelCarga(cx, inst, t)) + ruido;
  return Math.min(100, Math.max(0.1, v));
}

/** Una métrica de EC2 para una instancia en t. */
function metricaInstancia(cx, inst, metrica, t) {
  const cpu = cpuInstancia(cx, inst, t);
  if (cpu === null) return null;
  const r = azar(`${inst.id}:${metrica}:${Math.floor(t / P())}`);
  switch (metrica) {
    case 'CPUUtilization':
      return cpu;
    case 'NetworkIn':
      return Math.round(cpu * 9000 * (0.85 + r * 0.3));
    case 'NetworkOut':
      return Math.round(cpu * 15000 * (0.85 + r * 0.3));
    case 'NetworkPacketsIn':
      return Math.round(cpu * 14 * (0.85 + r * 0.3));
    case 'NetworkPacketsOut':
      return Math.round(cpu * 12 * (0.85 + r * 0.3));
    case 'StatusCheckFailed':
    case 'StatusCheckFailed_Instance':
    case 'StatusCheckFailed_System':
      return 0;
    case 'CPUCreditUsage':
      return redondear((cpu / 100) * 5 * (0.9 + r * 0.2), 3);
    case 'CPUCreditBalance':
      return redondear(Math.max(0, 60 + azar(inst.id) * 80 - cpu * 0.3), 2);
    default:
      return null;
  }
}

/** Las instancias que cuentan para unas dimensiones de AWS/EC2. */
function instanciasPara(cx, dims) {
  const todas = cx.estado.instancias ?? [];
  if (dims.InstanceId) return todas.filter((i) => i.id === dims.InstanceId);
  if (dims.AutoScalingGroupName) return todas.filter((i) => cx.asgDe.get(i.id) === dims.AutoScalingGroupName);
  if (Object.keys(dims).length === 0) return todas;
  return [];
}

/** Las peticiones que atendió una instancia en el periodo de t. */
function peticionesInstancia(cx, inst, t) {
  const cpu = cpuInstancia(cx, inst, t);
  if (cpu === null) return null;
  return Math.round(Math.max(0, cpu - 1.5) * 4 * (0.9 + azar(`${inst.id}:req:${Math.floor(t / P())}`) * 0.2));
}

/** Los destinos de un grupo de destino con su salud actual. */
function destinosDe(estado, g) {
  return (g.destinos ?? []).map((d) => {
    const id = d.instanciaId ?? d.id;
    let salud = d.salud ?? d.estado;
    if (!salud) salud = llamar('saludDestino', estado, g.arn, id) ?? 'initial';
    return { id, salud };
  });
}

function balanceadorActivo(b, t) {
  const creado = aMs(b.creado ?? b.creadoEn);
  if (b.estado && b.estado !== 'active') return false;
  return creado === null || t >= creado;
}

/** Los valores de un grupo de destino en t: { sanos, enfermos, peticiones, tiempo }. */
function datosGrupoDestino(cx, g, t) {
  let sanos = 0;
  let enfermos = 0;
  let peticiones = 0;
  let cpuTotal = 0;
  for (const d of destinosDe(cx.estado, g)) {
    const inst = (cx.estado.instancias ?? []).find((i) => i.id === d.id);
    if (!inst) continue;
    if (d.salud === 'healthy') {
      const p = peticionesInstancia(cx, inst, t);
      if (p === null) continue;
      sanos += 1;
      peticiones += p;
      cpuTotal += cpuInstancia(cx, inst, t) ?? 0;
    } else if (d.salud === 'unhealthy') enfermos += 1;
  }
  return { sanos, enfermos, peticiones, tiempo: sanos ? 0.002 + (cpuTotal / sanos / 100) * 0.06 : null };
}

/** Las fuentes (valores individuales) de una métrica en el instante t. */
function fuentes(cx, ref, t) {
  const { namespace, metrica } = ref;
  const dims = ref.dimensiones;
  const estado = cx.estado;
  const r = azar(`${claveMetrica(ref)}:${Math.floor(t / P())}`);

  if (namespace === 'AWS/EC2') {
    return instanciasPara(cx, dims).map((i) => metricaInstancia(cx, i, metrica, t)).filter((v) => v !== null);
  }

  if (namespace === 'AWS/AutoScaling') {
    const g = gruposAsg(estado).find((x) => nombreAsg(x) === dims.AutoScalingGroupName);
    if (!g) return [];
    const creado = aMs(g.creado);
    if (creado !== null && t < creado) return [];
    const inst = (g.instancias ?? []).map((x) => (typeof x === 'string' ? { id: x } : x));
    const ciclo = (c) =>
      inst.filter((x) => {
        const real = (estado.instancias ?? []).find((i) => i.id === (x.id ?? x.instanciaId));
        const cicloX = x.ciclo ?? x.lifecycle ?? (real?.estado === 'running' ? 'InService' : real?.estado === 'pending' ? 'Pending' : real?.estado === 'shutting-down' ? 'Terminating' : null);
        return String(cicloX ?? '').startsWith(c);
      }).length;
    const valores = {
      GroupMinSize: g.min ?? g.minimo,
      GroupMaxSize: g.max ?? g.maximo,
      GroupDesiredCapacity: g.deseado ?? g.deseada ?? g.capacidadDeseada,
      GroupInServiceInstances: ciclo('InService'),
      GroupPendingInstances: ciclo('Pending'),
      GroupTerminatingInstances: ciclo('Terminating'),
      GroupTotalInstances: inst.length
    };
    const v = valores[metrica];
    return typeof v === 'number' ? [v] : [];
  }

  if (namespace === 'AWS/ApplicationELB') {
    if (metrica === 'RequestCountPerTarget' && dims.TargetGroup) {
      const g = gruposDestino(estado).find((x) => coincideTg(x, dims.TargetGroup));
      if (!g) return [];
      const d = datosGrupoDestino(cx, g, t);
      return d.sanos ? [d.peticiones / d.sanos] : [];
    }
    const b = balanceadores(estado).find((x) => dimensionBalanceador(x) === dims.LoadBalancer || x.arn === dims.LoadBalancer || x.nombre === dims.LoadBalancer);
    if (!b || !balanceadorActivo(b, t)) return [];
    let grupos = tgsDeBalanceador(b).map((arn) => gruposDestino(estado).find((x) => coincideTg(x, arn))).filter(Boolean);
    if (dims.TargetGroup) grupos = grupos.filter((x) => coincideTg(x, dims.TargetGroup));
    if (dims.TargetGroup && !grupos.length) return [];
    const ds = grupos.map((g) => datosGrupoDestino(cx, g, t));
    const sanos = ds.reduce((a, d) => a + d.sanos, 0);
    const enfermos = ds.reduce((a, d) => a + d.enfermos, 0);
    const peticiones = ds.reduce((a, d) => a + d.peticiones, 0);
    const tiempos = ds.map((d) => d.tiempo).filter((x) => x !== null);
    const sinDestinos = sanos === 0 ? Math.round(2 + r * 6) : 0; // las peticiones que el ALB contesta con 503
    switch (metrica) {
      case 'HealthyHostCount':
        return [sanos];
      case 'UnHealthyHostCount':
        return [enfermos];
      case 'RequestCount':
        return [peticiones + sinDestinos];
      case 'HTTPCode_Target_2XX_Count':
        return [peticiones];
      case 'HTTPCode_ELB_5XX_Count':
        return [sinDestinos];
      case 'TargetResponseTime':
        return tiempos.length ? [tiempos.reduce((a, b2) => a + b2, 0) / tiempos.length] : [];
      case 'ActiveConnectionCount':
        return [Math.round((peticiones + sinDestinos) / 3)];
      case 'NewConnectionCount':
        return [Math.round((peticiones + sinDestinos) / 4)];
      case 'ProcessedBytes':
        return [Math.round((peticiones + sinDestinos) * 1850 * (0.9 + r * 0.2))];
      case 'ConsumedLCUs':
        return [redondear(0.01 + (peticiones / 25) * 0.02, 4)];
      default:
        return [];
    }
  }

  // SQS y SNS: los cuenta la extensión de mensajería (sus contadores por periodo).
  if ((namespace === 'AWS/SQS' || namespace === 'AWS/SNS') && existeFuncion('metricaMensajeria')) {
    const fin = (Math.floor(t / P()) + 1) * P();
    const v = llamar('metricaMensajeria', estado, { namespace, metrica, dimensiones: dims, periodo: P() }, Math.min(fin, reloj.ahora()));
    return typeof v === 'number' && Number.isFinite(v) ? [v] : [];
  }

  if (namespace === 'AWS/SQS') {
    const c = colasSqs(estado).find((x) => x.nombre === dims.QueueName);
    if (!c) return [];
    const creada = aMs(c.creado ?? c.creada);
    if (creada !== null && t < creada) return [];
    const inicio = Math.floor(t / P()) * P();
    const fin = inicio + P();
    const msgs = (c.mensajes ?? []).map((m) => ({ enviado: aMs(m.enviado ?? m.t) ?? 0, visible: aMs(m.visibleDesde ?? m.visibleEn ?? m.visible) ?? 0, recibidos: m.recibos ?? m.recibidos ?? 0, tamano: String(m.cuerpo ?? '').length }));
    const presentes = msgs.filter((m) => m.enviado <= fin);
    const retraso = (m) => m.recibidos === 0 && m.visible > fin;
    switch (metrica) {
      case 'ApproximateNumberOfMessagesVisible':
        return [presentes.filter((m) => m.visible <= fin).length];
      case 'ApproximateNumberOfMessagesNotVisible':
        return [presentes.filter((m) => m.visible > fin && !retraso(m)).length];
      case 'ApproximateNumberOfMessagesDelayed':
        return [presentes.filter(retraso).length];
      case 'ApproximateAgeOfOldestMessage':
        return presentes.length ? [Math.max(0, Math.round((fin - Math.min(...presentes.map((m) => m.enviado))) / 1000))] : [0];
      case 'NumberOfMessagesSent':
        return [msgs.filter((m) => m.enviado >= inicio && m.enviado < fin).length];
      case 'SentMessageSize': {
        const s = msgs.filter((m) => m.enviado >= inicio && m.enviado < fin);
        return s.length ? s.map((m) => m.tamano) : [];
      }
      case 'NumberOfMessagesReceived':
        return [msgs.filter((m) => m.recibidos > 0 && m.visible - (c.visibilidad ?? 30) * 1000 >= inicio && m.visible - (c.visibilidad ?? 30) * 1000 < fin).length];
      case 'NumberOfMessagesDeleted':
      case 'NumberOfEmptyReceives':
        return [0];
      default:
        return [];
    }
  }

  if (namespace === 'AWS/Lambda') {
    const nombres = dims.FunctionName ? [dims.FunctionName] : [...new Set([...funcionesLambda(estado).map((f) => f.nombre), ...estado.cloudwatch.gruposLogs.filter((g) => g.nombre.startsWith('/aws/lambda/')).map((g) => g.nombre.slice(12))])];
    const inicio = Math.floor(t / P()) * P();
    const fin = inicio + P();
    let invocaciones = 0;
    let errores = 0;
    const duraciones = [];
    for (const n of nombres) {
      const g = estado.cloudwatch.gruposLogs.find((x) => x.nombre === `/aws/lambda/${n}`);
      for (const f of g?.flujos ?? []) {
        for (const e of f.eventos) {
          if (e.t < inicio || e.t >= fin) continue;
          if (e.m.startsWith('START RequestId')) invocaciones += 1;
          else if (/^REPORT RequestId/.test(e.m)) {
            const m = /Duration:\s*([\d.]+)\s*ms/.exec(e.m);
            if (m) duraciones.push(Number(m[1]));
          } else if (/\bERROR\b|Task timed out|"errorType"/.test(e.m)) errores += 1;
        }
      }
    }
    switch (metrica) {
      case 'Invocations':
        return [invocaciones];
      case 'Errors':
        return [errores];
      case 'Throttles':
        return [0];
      case 'ConcurrentExecutions':
        return [invocaciones ? Math.min(invocaciones, 1 + Math.floor(invocaciones / 5)) : 0];
      case 'Duration':
        return duraciones;
      default:
        return [];
    }
  }

  if (namespace === 'AWS/RDS') {
    const b = basesRds(estado).find((x) => idRds(x) === dims.DBInstanceIdentifier);
    if (!b) return [];
    const disponible = ['available', 'backing-up', 'modifying', 'rebooting'].includes(b.estado ?? 'available');
    const creada = aMs(b.creado ?? b.creada);
    if (!disponible || (creada !== null && t < creada + 25000)) return [];
    const base = azar(idRds(b));
    const gib = Number(b.almacenamiento ?? b.almacenamientoGb ?? 20) || 20;
    switch (metrica) {
      case 'CPUUtilization':
        return [redondear(2 + base * 6 + (r - 0.5) * 2, 3)];
      case 'DatabaseConnections':
        return [Math.floor(r * 3)];
      case 'FreeStorageSpace':
        return [Math.round(gib * 1073741824 * (0.96 - base * 0.02))];
      case 'FreeableMemory':
        return [Math.round(1073741824 * (0.35 + base * 0.2) * (/large|xlarge/.test(b.clase ?? '') ? 6 : 1))];
      case 'ReadIOPS':
        return [redondear(0.1 + r * 1.5, 3)];
      case 'WriteIOPS':
        return [redondear(1 + r * 3, 3)];
      case 'ReadLatency':
        return [redondear(0.0004 + r * 0.0006, 5)];
      case 'WriteLatency':
        return [redondear(0.001 + r * 0.002, 5)];
      default:
        return [];
    }
  }

  if (namespace === 'AWS/DynamoDB') {
    const tabla = tablasDynamo(estado).find((x) => x.nombre === dims.TableName);
    if (!tabla) return [];
    const creada = aMs(tabla.creado ?? tabla.creada);
    if (creada !== null && t < creada) return [];
    const cap = tabla.capacidad ?? {};
    switch (metrica) {
      case 'ConsumedReadCapacityUnits':
        return [r > 0.7 ? Math.ceil(r * 4) : 0];
      case 'ConsumedWriteCapacityUnits':
        return [r < 0.2 ? 1 : 0];
      case 'ProvisionedReadCapacityUnits':
        return provisionadaDynamo(tabla) ? [Number(cap.lectura ?? tabla.rcu ?? tabla.lectura ?? 5)] : [];
      case 'ProvisionedWriteCapacityUnits':
        return provisionadaDynamo(tabla) ? [Number(cap.escritura ?? tabla.wcu ?? tabla.escritura ?? 5)] : [];
      case 'ThrottledRequests':
        return [0];
      default:
        return [];
    }
  }

  if (namespace === 'AWS/Logs') {
    const g = estado.cloudwatch.gruposLogs.find((x) => x.nombre === dims.LogGroupName);
    if (!g) return [];
    const inicio = Math.floor(t / P()) * P();
    const fin = inicio + P();
    const eventos = g.flujos.flatMap((f) => f.eventos.filter((e) => e.t >= inicio && e.t < fin));
    if (metrica === 'IncomingLogEvents') return [eventos.length];
    if (metrica === 'IncomingBytes') return [eventos.reduce((a, e) => a + e.m.length + 26, 0)];
    return [];
  }

  if (namespace === 'AWS/Billing' && metrica === 'EstimatedCharges') {
    const v = costo(estado, dims.ServiceName);
    return v === null ? [] : [v];
  }
  return [];
}

/** Junta las fuentes con una estadística. */
function aplicarEstadistica(valores, estadistica = 'Average') {
  if (!valores.length) return null;
  switch (estadistica) {
    case 'Sum':
      return valores.reduce((a, b) => a + b, 0);
    case 'Minimum':
      return Math.min(...valores);
    case 'Maximum':
      return Math.max(...valores);
    case 'SampleCount':
      return valores.length;
    default:
      if (/^p(\d+(\.\d+)?)$/.test(estadistica)) {
        const p = Number(estadistica.slice(1)) / 100;
        const orden = [...valores].sort((a, b) => a - b);
        return orden[Math.min(orden.length - 1, Math.floor(p * orden.length))];
      }
      return valores.reduce((a, b) => a + b, 0) / valores.length;
  }
}

/** El valor del periodo k (k·10 s … (k+1)·10 s) o null si no hay datos. */
function datoPeriodo(cx, ref, k) {
  const t = k * P() + P() / 2;
  return aplicarEstadistica(fuentes(cx, ref, t), ref.estadistica);
}

/**
 * El valor de una métrica en el último periodo completo antes de `ahora`
 * (número o null). Lo usan Auto Scaling, los tableros y las alarmas.
 */
export function valorMetrica(estado, ref, ahora) {
  iniciar(estado);
  const t = ahora ?? reloj.ahora();
  const r = referenciaMetrica(ref);
  return datoPeriodo(contexto(estado), r, Math.floor(t / P()) - 1);
}

/**
 * La serie de una métrica: los últimos `puntos` periodos completos.
 * → [{ t (ms del inicio del periodo), v (número | null) }], del más viejo al más nuevo.
 */
export function serieMetrica(estado, ref, { puntos = 36, ahora } = {}) {
  iniciar(estado);
  const t = ahora ?? reloj.ahora();
  const r = referenciaMetrica(ref);
  const cx = contexto(estado);
  const ultimo = Math.floor(t / P()) - 1;
  const n = Math.max(1, Math.min(400, puntos));
  const serie = [];
  for (let k = ultimo - n + 1; k <= ultimo; k++) serie.push({ t: k * P(), v: datoPeriodo(cx, r, k) });
  return serie;
}

/* ================================================================ la carga */

/**
 * «Simular hora pico» (botón propio del simulador): durante `minutos` periodos
 * (minutos × 10 s reales) la CPU de la instancia, o de las instancias del
 * grupo, sube a `cpu` %. En un grupo la carga se reparte entre las que haya.
 */
export function simularCarga(estado, { asg, instanciaId, cpu = 90, minutos = 10 } = {}) {
  iniciar(estado);
  const nivel = Number(cpu);
  const duracion = Number(minutos);
  if (!Number.isFinite(nivel) || nivel < 0 || nivel > 100) throw errorAws('ValidationError', 'CPU must be between 0 and 100.');
  if (!Number.isFinite(duracion) || duracion < 1 || duracion > 120) throw errorAws('ValidationError', 'Duration must be between 1 and 120 minutes.');
  let clave;
  let instancias = 1;
  if (asg) {
    const cx = contexto(estado);
    clave = `asg:${asg}`;
    // Las que ya mandan métricas; si el grupo apenas arranca, las que van a estar.
    instancias = Math.max(1, activasAsg(cx, asg, reloj.ahora()) || (cx.vivasAsg.get(asg) ?? 0));
  } else if (instanciaId) {
    if (!(estado.instancias ?? []).some((i) => i.id === instanciaId)) throw errorAws('InvalidInstanceID.NotFound', `The instance ID '${instanciaId}' does not exist`);
    clave = instanciaId;
  } else throw errorAws('ValidationError', 'Choose an Auto Scaling group or an instance.');
  const ahora = reloj.ahora();
  const lista = (estado.cloudwatch.carga[clave] ??= []);
  // Una carga nueva reemplaza a la que siga vigente.
  for (const v of lista) if (v.hasta > ahora) v.hasta = ahora;
  const ventana = { cpu: nivel, desde: ahora, hasta: ahora + Math.round(duracion) * P(), instancias };
  lista.push(ventana);
  recortarCarga(estado, ahora);
  anotar(estado, 'Simulador', 'SimulateLoad', `${asg ? `grupo ${asg}` : instanciaId}: CPU ${nivel} % durante ${Math.round(duracion)} min simulados`);
  return ventana;
}

/** Detiene la carga simulada que siga vigente. */
export function detenerCarga(estado, { asg, instanciaId } = {}) {
  iniciar(estado);
  const ahora = reloj.ahora();
  for (const v of estado.cloudwatch.carga[asg ? `asg:${asg}` : instanciaId] ?? []) if (v.hasta > ahora) v.hasta = ahora;
}

/** La ventana de carga vigente de un grupo o instancia, o null. */
export function cargaVigente(estado, { asg, instanciaId } = {}, ahora = reloj.ahora()) {
  const lista = estado.cloudwatch?.carga?.[asg ? `asg:${asg}` : instanciaId] ?? [];
  return lista.find((v) => v.desde <= ahora && v.hasta > ahora) ?? null;
}

function recortarCarga(estado, ahora) {
  const carga = estado.cloudwatch.carga;
  for (const [k, lista] of Object.entries(carga)) {
    const vigentes = lista.filter((v) => v.hasta > ahora - DURACION_CLOUDWATCH.retenerCarga).slice(-TOPES.ventanas);
    if (vigentes.length) carga[k] = vigentes;
    else delete carga[k];
  }
}

/* =============================================================== alarmas */

const COMPARACIONES = {
  GreaterThanThreshold: { signo: '>', texto: 'greater than', prueba: (v, u) => v > u },
  GreaterThanOrEqualToThreshold: { signo: '>=', texto: 'greater than or equal to', prueba: (v, u) => v >= u },
  LessThanThreshold: { signo: '<', texto: 'less than', prueba: (v, u) => v < u },
  LessThanOrEqualToThreshold: { signo: '<=', texto: 'less than or equal to', prueba: (v, u) => v <= u }
};
const ALIAS_COMPARACION = { '>': 'GreaterThanThreshold', '>=': 'GreaterThanOrEqualToThreshold', '<': 'LessThanThreshold', '<=': 'LessThanOrEqualToThreshold' };
export const COMPARACIONES_ALARMA = Object.keys(COMPARACIONES);
export const signoComparacion = (c) => COMPARACIONES[c]?.signo ?? c;
export const ESTADOS_ALARMA = ['ALARM', 'OK', 'INSUFFICIENT_DATA'];
export const TRATAMIENTOS_FALTANTES = ['missing', 'notBreaching', 'breaching', 'ignore'];
const ESTADISTICAS = ['Average', 'Sum', 'Minimum', 'Maximum', 'SampleCount'];
const PERIODOS = [10, 30, 60, 300, 900, 3600, 21600, 86400];

/** El texto del estado como lo pinta la consola. */
export const textoEstadoAlarma = (e) => ({ ALARM: 'In alarm', OK: 'OK', INSUFFICIENT_DATA: 'Insufficient data' })[e] ?? e;

/** «5 minutes», «1 minute», «1 hour». */
export function textoPeriodo(seg) {
  if (seg < 60) return `${seg} seconds`;
  if (seg < 3600) return seg === 60 ? '1 minute' : `${seg / 60} minutes`;
  if (seg < 86400) return seg === 3600 ? '1 hour' : `${seg / 3600} hours`;
  return seg === 86400 ? '1 day' : `${seg / 86400} days`;
}

/** La columna Conditions: «CPUUtilization > 70 for 1 datapoints within 5 minutes». */
export function textoCondicion(a) {
  return `${a.metrica.nombre} ${signoComparacion(a.comparacion)} ${formatoNumero(a.umbral)} for ${a.puntos} datapoints within ${textoPeriodo(a.periodo * a.evaluaciones)}`;
}

const formatoNumero = (n) => (Number.isInteger(n) ? String(n) : String(redondear(n, 4)));

export const alarmaDe = (estado, nombre) => estado.cloudwatch?.alarmas?.find((a) => a.nombre === nombre) ?? null;
const arnAlarma = (estado, nombre) => `arn:aws:cloudwatch:us-east-1:${cuentaId(estado)}:alarm:${nombre}`;

/** Valida y deja en su forma única los datos de una alarma. */
function datosAlarma(estado, p) {
  const nombre = nombreLimpio(p.nombre, 400);
  if (!nombre) throw errorAws('ValidationError', "1 validation error detected: Value null at 'alarmName' failed to satisfy constraint: Member must not be null");
  if (nombre.length > 255) throw errorAws('ValidationError', `1 validation error detected: Value '${nombre}' at 'alarmName' failed to satisfy constraint: Member must have length less than or equal to 255`);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(nombre)) throw errorAws('ValidationError', 'The alarm name must contain only UTF-8 characters, and can’t contain ASCII control characters.');

  const ref = referenciaMetrica(p.metrica && typeof p.metrica === 'object' ? { ...p.metrica, estadistica: p.estadistica } : p);
  if (!ref.namespace || !ref.metrica) throw errorAws('ValidationError', 'You must specify a metric for the alarm.');
  const estadistica = p.estadistica ?? ref.estadistica ?? 'Average';
  if (!ESTADISTICAS.includes(estadistica) && !/^p\d+(\.\d+)?$/.test(estadistica)) throw errorAws('ValidationError', `Invalid statistic '${estadistica}'.`);
  const periodo = Number(p.periodo ?? 300);
  if (!PERIODOS.includes(periodo)) throw errorAws('ValidationError', 'The parameter Period must be 10, 30, or a multiple of 60.');

  const comparacion = ALIAS_COMPARACION[p.comparacion] ?? p.comparacion ?? 'GreaterThanThreshold';
  if (!COMPARACIONES[comparacion]) throw errorAws('ValidationError', `Invalid comparison operator '${comparacion}'.`);
  const umbral = Number(p.umbral);
  if (p.umbral === '' || p.umbral === null || p.umbral === undefined || !Number.isFinite(umbral)) throw errorAws('ValidationError', 'The threshold must be a number.');

  const evaluaciones = Number(p.evaluaciones ?? p.puntos ?? 1);
  const puntos = Number(p.puntos ?? evaluaciones);
  if (!Number.isInteger(evaluaciones) || evaluaciones < 1) throw errorAws('ValidationError', 'The evaluation periods must be at least 1.');
  if (!Number.isInteger(puntos) || puntos < 1) throw errorAws('ValidationError', 'Datapoints to alarm must be at least 1.');
  if (puntos > evaluaciones) throw errorAws('ValidationError', 'DatapointsToAlarm must be less than or equal to EvaluationPeriods.');
  if (evaluaciones * periodo > 7 * 86400) throw errorAws('ValidationError', 'The evaluation period (EvaluationPeriods × Period) can’t be longer than 7 days.');

  const datosFaltantes = p.datosFaltantes ?? 'missing';
  if (!TRATAMIENTOS_FALTANTES.includes(datosFaltantes)) throw errorAws('ValidationError', `Invalid value '${datosFaltantes}' for TreatMissingData.`);

  const lista = (v) => [...new Set((Array.isArray(v) ? v : v ? [v] : []).map(String).filter(Boolean))];
  const a = p.acciones ?? {};
  const acciones = {
    ALARM: lista(a.ALARM ?? a.alarma ?? p.accionesAlarma),
    OK: lista(a.OK ?? a.ok ?? p.accionesOk),
    INSUFFICIENT_DATA: lista(a.INSUFFICIENT_DATA ?? a.datos ?? p.accionesDatos)
  };
  for (const arn of Object.values(acciones).flat()) {
    if (!/^arn:aws:/.test(arn)) throw errorAws('ValidationError', `Invalid arn syntax: ${arn}`);
    const ec2 = /^arn:aws:automate:[^:]+:ec2:(stop|terminate|reboot|recover)$/.exec(arn);
    if (ec2 && !ref.dimensiones.InstanceId) {
      throw errorAws('ValidationError', `Invalid use of EC2 '${ec2[1][0].toUpperCase()}${ec2[1].slice(1)}' action. An EC2 action can only be used if the alarm is monitoring an EC2 instance.`);
    }
    if (/^arn:aws:automate:/.test(arn) && !ec2) throw errorAws('ValidationError', `Invalid action: ${arn}`);
  }
  return {
    nombre,
    descripcion: nombreLimpio(p.descripcion, 1024),
    metrica: { namespace: ref.namespace, nombre: ref.metrica, dimensiones: ref.dimensiones },
    estadistica,
    periodo,
    comparacion,
    umbral,
    puntos,
    evaluaciones,
    datosFaltantes,
    accionesActivas: p.accionesActivas ?? true,
    acciones
  };
}

function historiar(a, tipo, resumen, ok = true) {
  a.historial.unshift({ t: iso(), tipo, resumen: String(resumen).slice(0, 300), ok });
  if (a.historial.length > TOPES.historial) a.historial.length = TOPES.historial;
}

/** PutMetricAlarm desde el asistente «Create alarm». Un nombre repetido es error en la consola. */
export function crearAlarma(estado, p = {}) {
  iniciar(estado);
  const d = datosAlarma(estado, p);
  if (alarmaDe(estado, d.nombre)) throw errorAws('ResourceAlreadyExists', `An alarm with the name ${d.nombre} already exists. Choose a different name.`);
  if (estado.cloudwatch.alarmas.length >= TOPES.alarmas) throw errorAws('LimitExceeded', 'The maximum number of alarms for this account has been reached.');
  const a = { ...d, arn: arnAlarma(estado, d.nombre), creado: iso(), creadaPor: p.creadaPor ?? null, estado: 'INSUFFICIENT_DATA', razon: 'Unchecked: Initial alarm creation', desde: iso(), evaluada: null, ultimoValor: null, historial: [] };
  estado.cloudwatch.alarmas.push(a);
  historiar(a, 'ConfigurationUpdate', `Alarm "${a.nombre}" created`);
  anotar(estado, 'CloudWatch', 'PutMetricAlarm', `${a.nombre}: ${textoCondicion(a)}${p.creadaPor ? ` (creada por ${p.creadaPor})` : ''}`);
  return a;
}

/** PutMetricAlarm sobre una alarma que ya existe (Edit). El nombre no cambia. */
export function editarAlarma(estado, nombre, p = {}) {
  iniciar(estado);
  const a = alarmaDe(estado, nombre);
  if (!a) throw errorAws('ResourceNotFound', `Alarm ${nombre} does not exist`);
  const d = datosAlarma(estado, { ...p, nombre });
  const cambioCondicion = claveMetrica({ ...d.metrica, metrica: d.metrica.nombre }) !== claveMetrica({ ...a.metrica, metrica: a.metrica.nombre }) || d.umbral !== a.umbral || d.comparacion !== a.comparacion || d.estadistica !== a.estadistica;
  Object.assign(a, d);
  if (cambioCondicion) a.evaluada = null; // se vuelve a evaluar en el siguiente periodo
  historiar(a, 'ConfigurationUpdate', `Alarm "${a.nombre}" updated`);
  anotar(estado, 'CloudWatch', 'PutMetricAlarm', `${a.nombre}: ${textoCondicion(a)} (actualizada)`);
  return a;
}

/** DeleteAlarms. */
export function eliminarAlarmas(estado, nombres = []) {
  iniciar(estado);
  const lista = [].concat(nombres);
  for (const n of lista) if (!alarmaDe(estado, n)) throw errorAws('ResourceNotFound', `Alarm ${n} does not exist`);
  estado.cloudwatch.alarmas = estado.cloudwatch.alarmas.filter((a) => !lista.includes(a.nombre));
  anotar(estado, 'CloudWatch', 'DeleteAlarms', lista.join(', '));
}

/** EnableAlarmActions / DisableAlarmActions. */
export function cambiarAccionesAlarmas(estado, nombres = [], activas = true) {
  iniciar(estado);
  for (const n of [].concat(nombres)) {
    const a = alarmaDe(estado, n);
    if (!a) throw errorAws('ResourceNotFound', `Alarm ${n} does not exist`);
    a.accionesActivas = Boolean(activas);
    historiar(a, 'ConfigurationUpdate', `Alarm actions ${activas ? 'enabled' : 'disabled'}`);
  }
  anotar(estado, 'CloudWatch', activas ? 'EnableAlarmActions' : 'DisableAlarmActions', [].concat(nombres).join(', '));
}

/**
 * Para Auto Scaling: crea (o reemplaza) una alarma de target tracking,
 * `TargetTracking-<asg>-AlarmHigh-<uuid>`. Acepta la misma forma que crearAlarma.
 */
export function crearAlarmaInterna(estado, alarma = {}) {
  iniciar(estado);
  const d = datosAlarma(estado, { periodo: 60, evaluaciones: 3, puntos: 3, ...alarma });
  const existente = alarmaDe(estado, d.nombre);
  if (existente) {
    Object.assign(existente, d, { creadaPor: alarma.creadaPor ?? existente.creadaPor ?? 'autoscaling' });
    return existente;
  }
  const a = { ...d, arn: arnAlarma(estado, d.nombre), creado: iso(), creadaPor: alarma.creadaPor ?? 'autoscaling', estado: 'INSUFFICIENT_DATA', razon: 'Unchecked: Initial alarm creation', desde: iso(), evaluada: null, ultimoValor: null, historial: [] };
  estado.cloudwatch.alarmas.push(a);
  historiar(a, 'ConfigurationUpdate', `Alarm "${a.nombre}" created`);
  anotar(estado, 'CloudWatch', 'PutMetricAlarm', `${a.nombre}: ${textoCondicion(a)} (Auto Scaling)`);
  return a;
}

/** Para Auto Scaling: borra sus alarmas (no falla si alguna ya no existe). */
export function eliminarAlarmasInternas(estado, nombres = []) {
  iniciar(estado);
  const lista = [].concat(nombres);
  const antes = estado.cloudwatch.alarmas.length;
  estado.cloudwatch.alarmas = estado.cloudwatch.alarmas.filter((a) => !lista.includes(a.nombre));
  if (estado.cloudwatch.alarmas.length !== antes) anotar(estado, 'CloudWatch', 'DeleteAlarms', `${lista.join(', ')} (Auto Scaling)`);
}

/** «02/11/26 15:20:00», la fecha de los datapoints en las razones de AWS (UTC). */
function fechaDato(ms) {
  const d = new Date(ms);
  const dos = (n) => String(n).padStart(2, '0');
  return `${dos(d.getUTCDate())}/${dos(d.getUTCMonth() + 1)}/${String(d.getUTCFullYear()).slice(2)} ${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}:${dos(d.getUTCSeconds())}`;
}

/** Evalúa una alarma en el periodo k. Devuelve true si cambió de estado. */
function evaluarAlarma(estado, cx, a, k) {
  const ref = { namespace: a.metrica.namespace, metrica: a.metrica.nombre, dimensiones: a.metrica.dimensiones, estadistica: a.estadistica };
  const puntos = [];
  for (let j = k - a.evaluaciones + 1; j <= k; j++) puntos.push({ t: j * P(), v: datoPeriodo(cx, ref, j) });
  a.ultimoValor = puntos.at(-1).v === null ? null : redondear(puntos.at(-1).v, 4);
  const c = COMPARACIONES[a.comparacion];
  let validos = puntos.filter((x) => x.v !== null);
  let rompen = validos.filter((x) => c.prueba(x.v, a.umbral)).length;
  const faltan = puntos.length - validos.length;
  if (a.datosFaltantes === 'breaching') rompen += faltan;
  if (a.datosFaltantes === 'breaching' || a.datosFaltantes === 'notBreaching') validos = puntos;

  let nuevo;
  let razon;
  const lista = puntos.filter((x) => x.v !== null).slice(-5).reverse().map((x) => `${formatoNumero(redondear(x.v, 4))} (${fechaDato(x.t)})`).join(', ');
  if (!validos.length) {
    if (a.datosFaltantes === 'ignore') return false;
    nuevo = 'INSUFFICIENT_DATA';
    razon = `Insufficient Data: ${a.evaluaciones} datapoint${a.evaluaciones === 1 ? ' was' : 's were'} unknown.`;
  } else if (rompen >= a.puntos) {
    nuevo = 'ALARM';
    razon = `Threshold Crossed: ${rompen} out of the last ${a.evaluaciones} datapoints [${lista}] ${rompen === 1 ? 'was' : 'were'} ${c.texto} the threshold (${formatoNumero(a.umbral)}) (minimum ${a.puntos} datapoint${a.puntos === 1 ? '' : 's'} for OK -> ALARM transition).`;
  } else {
    nuevo = 'OK';
    const noRompen = validos.length - rompen;
    razon = `Threshold Crossed: ${noRompen} out of the last ${a.evaluaciones} datapoints [${lista}] ${noRompen === 1 ? 'was' : 'were'} not ${c.texto} the threshold (${formatoNumero(a.umbral)}) (minimum 1 datapoint for ALARM -> OK transition).`;
  }
  if (nuevo === a.estado) {
    // Las acciones de Auto Scaling se repiten en cada periodo que la alarma siga en su estado.
    if (a.accionesActivas) for (const arn of a.acciones[nuevo] ?? []) if (/^arn:aws:autoscaling:/.test(arn)) despachar(estado, a, arn, nuevo, false);
    if (a.accionesActivas && nuevo === 'ALARM') seguimientoSinPolitica(estado, a);
    return false;
  }
  const anterior = a.estado;
  a.estado = nuevo;
  a.razon = razon;
  a.desde = iso();
  historiar(a, 'StateUpdate', `Alarm updated from ${textoEstadoAlarma(anterior)} to ${textoEstadoAlarma(nuevo)}`);
  if (a.accionesActivas) {
    for (const arn of a.acciones[nuevo] ?? []) despachar(estado, a, arn, anterior, true);
    if (nuevo === 'ALARM') seguimientoSinPolitica(estado, a);
  }
  return true;
}

/**
 * Las alarmas de target tracking que creó Auto Scaling sin poner el ARN de su
 * política: se le avisa al grupo con ajusteSeguimiento (si lo ofrece).
 */
function seguimientoSinPolitica(estado, a) {
  if (a.creadaPor !== 'autoscaling' || !a.nombre.startsWith('TargetTracking-')) return;
  if ((a.acciones.ALARM ?? []).some((x) => /^arn:aws:autoscaling:/.test(x))) return;
  const asg = a.metrica.dimensiones.AutoScalingGroupName ?? /^TargetTracking-(.+)-Alarm(High|Low)-/.exec(a.nombre)?.[1];
  try {
    if (asg) llamar('ajusteSeguimiento', estado, asg, { alarma: a });
  } catch {
    /* el grupo pudo desaparecer */
  }
}

/** El texto del correo que manda una alarma por SNS (el de AWS Notifications). */
function correoAlarma(estado, a, anterior) {
  const d = a.metrica.dimensiones;
  const c = COMPARACIONES[a.comparacion];
  const fecha = new Date(reloj.ahora()).toUTCString().replace(/ GMT$/, ' UTC');
  return [
    `You are receiving this email because your Amazon CloudWatch Alarm "${a.nombre}" in the US East (N. Virginia) region has entered the ${a.estado} state, because "${a.razon}" at "${fecha}".`,
    '',
    'View this alarm in the AWS Management Console:',
    `https://us-east-1.console.aws.amazon.com/cloudwatch/deeplink.js?region=us-east-1#alarmsV2:alarm/${encodeURIComponent(a.nombre)}`,
    '',
    'Alarm Details:',
    `- Name:                       ${a.nombre}`,
    `- Description:                ${a.descripcion || ''}`,
    `- State Change:               ${anterior} -> ${a.estado}`,
    `- Reason for State Change:    ${a.razon}`,
    `- Timestamp:                  ${fecha}`,
    `- AWS Account:                ${cuentaId(estado)}`,
    `- Alarm Arn:                  ${a.arn}`,
    '',
    'Threshold:',
    `- The alarm is in the ALARM state when the metric is ${a.comparacion} ${formatoNumero(a.umbral)} for at least ${a.puntos} of the last ${a.evaluaciones} period(s) of ${a.periodo} seconds.`,
    '',
    'Monitored Metric:',
    `- MetricNamespace:                     ${a.metrica.namespace}`,
    `- MetricName:                          ${a.metrica.nombre}`,
    `- Dimensions:                          ${Object.entries(d).map(([k, v]) => `[${k} = ${v}]`).join(' ')}`,
    `- Period:                              ${a.periodo} seconds`,
    `- Statistic:                           ${a.estadistica}`,
    `- Unit:                                not specified`,
    `- TreatMissingData:                    ${a.datosFaltantes}`,
    '',
    'State Change Actions:',
    `- OK: [${a.acciones.OK.join(', ')}]`,
    `- ALARM: [${a.acciones.ALARM.join(', ')}]`,
    `- INSUFFICIENT_DATA: [${a.acciones.INSUFFICIENT_DATA.join(', ')}]`
  ].join('\n');
}

/** Ejecuta una acción de una alarma según su ARN (SIMULADOR.md §4). */
function despachar(estado, a, arn, anterior, anotarHistorial) {
  const bien = () => anotarHistorial && historiar(a, 'Action', `Successfully executed action ${arn}`);
  const mal = (motivo) => anotarHistorial && historiar(a, 'Action', `Failed to execute action ${arn}. Received error: "${motivo}"`, false);
  try {
    if (/^arn:aws:sns:/.test(arn)) {
      if (!existeFuncion('publicarEnTema')) return mal('Amazon SNS is not available in this simulator yet');
      llamar('publicarEnTema', estado, arn, { asunto: `${a.estado}: "${a.nombre}" in US East (N. Virginia)`, mensaje: correoAlarma(estado, a, anterior), origen: 'cloudwatch' });
      return bien();
    }
    if (/^arn:aws:autoscaling:[^:]*:[^:]*:scalingPolicy:/.test(arn)) {
      if (!existeFuncion('ejecutarPolitica')) return mal('Auto Scaling is not available in this simulator yet');
      // Auto Scaling lee la métrica de la alarma en su forma plana (step scaling).
      const plana = { ...a, namespace: a.metrica.namespace, metrica: a.metrica.nombre, dimensiones: a.metrica.dimensiones };
      llamar('ejecutarPolitica', estado, arn, { alarma: plana });
      return bien();
    }
    const ec2 = /^arn:aws:automate:[^:]+:ec2:(stop|terminate|reboot|recover)$/.exec(arn);
    if (ec2) {
      const id = a.metrica.dimensiones.InstanceId;
      const inst = (estado.instancias ?? []).find((i) => i.id === id);
      if (!inst || inst.estado === 'terminated') return mal(`The instance ID '${id}' does not exist`);
      if (ec2[1] === 'stop') detenerInstancia(estado, id);
      else if (ec2[1] === 'terminate') terminarInstancia(estado, id);
      else if (inst.estado === 'running') reiniciarInstancia(estado, id); // reboot y recover
      return bien();
    }
    if (/^arn:aws:lambda:/.test(arn)) {
      if (!existeFuncion('invocarLambda')) return mal('AWS Lambda is not available in this simulator yet');
      const evento = {
        source: 'aws.cloudwatch',
        alarmArn: a.arn,
        accountId: cuentaId(estado),
        time: iso(),
        region: 'us-east-1',
        alarmData: {
          alarmName: a.nombre,
          state: { value: a.estado, reason: a.razon, timestamp: iso() },
          previousState: { value: anterior },
          configuration: { description: a.descripcion, metrics: [{ metricStat: { metric: { namespace: a.metrica.namespace, name: a.metrica.nombre, dimensions: a.metrica.dimensiones }, period: a.periodo, stat: a.estadistica } }] }
        }
      };
      llamar('invocarLambda', estado, arn, evento, { origen: 'cloudwatch' });
      return bien();
    }
    return mal('Unsupported action');
  } catch (e) {
    return mal(e?.message ?? String(e));
  }
}

/**
 * Para Auto Scaling: una política simple o de pasos se cuelga de una alarma
 * que ya existe (su ARN se agrega a las acciones de ALARM).
 */
export function agregarAccionAlarma(estado, nombreAlarma, arn) {
  iniciar(estado);
  const a = alarmaDe(estado, nombreAlarma);
  if (!a || !arn) return null;
  if (!a.acciones.ALARM.includes(arn)) {
    a.acciones.ALARM.push(arn);
    historiar(a, 'ConfigurationUpdate', `Alarm "${a.nombre}" updated`);
  }
  return a;
}

/* =============================================================== tableros */

const NOMBRE_TABLERO = /^[A-Za-z0-9_-]{1,255}$/;
export const tableroDe = (estado, nombre) => estado.cloudwatch?.tableros?.find((t) => t.nombre === nombre) ?? null;

/** PutDashboard (vacío). */
export function crearTablero(estado, { nombre } = {}) {
  iniciar(estado);
  const n = String(nombre ?? '').trim();
  if (!n) throw errorAws('InvalidParameterInput', 'Dashboard name is required.');
  if (!NOMBRE_TABLERO.test(n)) throw errorAws('InvalidParameterInput', 'The dashboard name can contain only alphanumerics, dash (-) and underscore (_).');
  if (tableroDe(estado, n)) throw errorAws('InvalidParameterInput', `A dashboard with the name ${n} already exists.`);
  if (estado.cloudwatch.tableros.length >= TOPES.tableros) throw errorAws('LimitExceeded', 'The maximum number of dashboards has been reached.');
  const t = { nombre: n, arn: `arn:aws:cloudwatch::${cuentaId(estado)}:dashboard/${n}`, creado: iso(), modificado: iso(), widgets: [] };
  estado.cloudwatch.tableros.push(t);
  anotar(estado, 'CloudWatch', 'PutDashboard', n);
  return t;
}

/** DeleteDashboards. */
export function eliminarTableros(estado, nombres = []) {
  iniciar(estado);
  const lista = [].concat(nombres);
  for (const n of lista) if (!tableroDe(estado, n)) throw errorAws('ResourceNotFound', `Dashboard ${n} does not exist`);
  estado.cloudwatch.tableros = estado.cloudwatch.tableros.filter((t) => !lista.includes(t.nombre));
  anotar(estado, 'CloudWatch', 'DeleteDashboards', lista.join(', '));
}

/** Agrega un widget: { tipo: 'linea' | 'numero' | 'texto', titulo, metricas: [ref], texto }. */
export function agregarWidget(estado, nombreTablero, w = {}) {
  iniciar(estado);
  const t = tableroDe(estado, nombreTablero);
  if (!t) throw errorAws('ResourceNotFound', `Dashboard ${nombreTablero} does not exist`);
  if (!['linea', 'numero', 'texto'].includes(w.tipo)) throw errorAws('InvalidParameterInput', 'Unsupported widget type.');
  if (t.widgets.length >= TOPES.widgets) throw errorAws('LimitExceeded', 'The dashboard has too many widgets.');
  const metricas = (w.metricas ?? []).map(referenciaMetrica).filter((m) => m.namespace && m.metrica).slice(0, 10);
  if (w.tipo !== 'texto' && !metricas.length) throw errorAws('InvalidParameterInput', 'The widget must have at least one metric.');
  const widget = {
    id: hexAzar(8),
    tipo: w.tipo,
    titulo: nombreLimpio(w.titulo, 120),
    metricas,
    texto: w.tipo === 'texto' ? nombreLimpio(w.texto, 2000) : ''
  };
  t.widgets.push(widget);
  t.modificado = iso();
  anotar(estado, 'CloudWatch', 'PutDashboard', `${t.nombre}: widget ${widget.titulo || w.tipo}`);
  return widget;
}

/** Quita un widget del tablero. */
export function quitarWidget(estado, nombreTablero, widgetId) {
  iniciar(estado);
  const t = tableroDe(estado, nombreTablero);
  if (!t) throw errorAws('ResourceNotFound', `Dashboard ${nombreTablero} does not exist`);
  t.widgets = t.widgets.filter((w) => w.id !== widgetId);
  t.modificado = iso();
  anotar(estado, 'CloudWatch', 'PutDashboard', `${t.nombre}: widget removed`);
}

/* =================================================================== logs */

const NOMBRE_GRUPO_LOGS = /^[.\-_/#A-Za-z0-9]{1,512}$/;
const NOMBRE_FLUJO = /^[^:*]{1,512}$/;
export const RETENCIONES_LOGS = [1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653];
export const grupoLogsDe = (estado, nombre) => estado.cloudwatch?.gruposLogs?.find((g) => g.nombre === nombre) ?? null;
const arnGrupoLogs = (estado, nombre) => `arn:aws:logs:us-east-1:${cuentaId(estado)}:log-group:${nombre}`;

function validarRetencion(dias) {
  if (dias === null || dias === undefined || dias === '' || dias === 0) return null;
  const n = Number(dias);
  if (!RETENCIONES_LOGS.includes(n)) throw errorAws('InvalidParameterException', `1 validation error detected: Value '${dias}' at 'retentionInDays' failed to satisfy constraint: Member must satisfy enum value set: [${RETENCIONES_LOGS.join(', ')}]`);
  return n;
}

function nuevoGrupoLogs(estado, nombre, { retencion = null, clase = 'STANDARD' } = {}) {
  const g = { nombre, arn: arnGrupoLogs(estado, nombre), creado: iso(), retencion, clase, flujos: [] };
  estado.cloudwatch.gruposLogs.push(g);
  return g;
}

/** CreateLogGroup. */
export function crearGrupoLogs(estado, { nombre, retencion = null, clase = 'STANDARD' } = {}) {
  iniciar(estado);
  const n = String(nombre ?? '').trim();
  if (!n) throw errorAws('InvalidParameterException', 'Log group name is required.');
  if (!NOMBRE_GRUPO_LOGS.test(n)) throw errorAws('InvalidParameterException', `1 validation error detected: Value '${n}' at 'logGroupName' failed to satisfy constraint: Member must satisfy regular expression pattern: [\\.\\-_/#A-Za-z0-9]+`);
  if (grupoLogsDe(estado, n)) throw errorAws('ResourceAlreadyExistsException', 'The specified log group already exists');
  if (estado.cloudwatch.gruposLogs.length >= TOPES.gruposLogs) throw errorAws('LimitExceededException', 'Resource limit exceeded.');
  if (!['STANDARD', 'INFREQUENT_ACCESS'].includes(clase)) throw errorAws('InvalidParameterException', `Invalid log group class '${clase}'.`);
  const g = nuevoGrupoLogs(estado, n, { retencion: validarRetencion(retencion), clase });
  anotar(estado, 'Logs', 'CreateLogGroup', n);
  return g;
}

/** PutRetentionPolicy (null = Never expire, DeleteRetentionPolicy). */
export function editarRetencionLogs(estado, nombres = [], dias = null) {
  iniciar(estado);
  const r = validarRetencion(dias);
  for (const n of [].concat(nombres)) {
    const g = grupoLogsDe(estado, n);
    if (!g) throw errorAws('ResourceNotFoundException', 'The specified log group does not exist.');
    g.retencion = r;
  }
  anotar(estado, 'Logs', r === null ? 'DeleteRetentionPolicy' : 'PutRetentionPolicy', `${[].concat(nombres).join(', ')}${r ? `: ${r} days` : ''}`);
}

/** DeleteLogGroup. */
export function eliminarGruposLogs(estado, nombres = []) {
  iniciar(estado);
  const lista = [].concat(nombres);
  for (const n of lista) if (!grupoLogsDe(estado, n)) throw errorAws('ResourceNotFoundException', 'The specified log group does not exist.');
  estado.cloudwatch.gruposLogs = estado.cloudwatch.gruposLogs.filter((g) => !lista.includes(g.nombre));
  anotar(estado, 'Logs', 'DeleteLogGroup', lista.join(', '));
}

/** CreateLogStream. */
export function crearFlujoLogs(estado, grupo, nombre) {
  iniciar(estado);
  const g = grupoLogsDe(estado, grupo);
  if (!g) throw errorAws('ResourceNotFoundException', 'The specified log group does not exist.');
  const n = String(nombre ?? '').trim();
  if (!n) throw errorAws('InvalidParameterException', 'Log stream name is required.');
  if (!NOMBRE_FLUJO.test(n)) throw errorAws('InvalidParameterException', "Log stream name can't contain ':' or '*'.");
  if (g.flujos.some((f) => f.nombre === n)) throw errorAws('ResourceAlreadyExistsException', 'The specified log stream already exists');
  const f = { nombre: n, creado: iso(), ultimo: null, eventos: [] };
  g.flujos.push(f);
  recortarLogs(estado);
  anotar(estado, 'Logs', 'CreateLogStream', `${grupo}: ${n}`);
  return f;
}

/** DeleteLogStream. */
export function eliminarFlujosLogs(estado, grupo, nombres = []) {
  iniciar(estado);
  const g = grupoLogsDe(estado, grupo);
  if (!g) throw errorAws('ResourceNotFoundException', 'The specified log group does not exist.');
  const lista = [].concat(nombres);
  g.flujos = g.flujos.filter((f) => !lista.includes(f.nombre));
  anotar(estado, 'Logs', 'DeleteLogStream', `${grupo}: ${lista.join(', ')}`);
}

/**
 * Escribe un evento de log (PutLogEvents). Crea el grupo y el flujo si no
 * existen, como hace Lambda con /aws/lambda/<función>. No va a la bitácora.
 */
export function escribirLog(estado, grupo, flujo, mensaje) {
  iniciar(estado);
  const ng = String(grupo ?? '').trim().slice(0, 512);
  const nf = String(flujo ?? '').trim().slice(0, 512) || 'default';
  if (!ng) return null;
  const g = grupoLogsDe(estado, ng) ?? nuevoGrupoLogs(estado, ng);
  let f = g.flujos.find((x) => x.nombre === nf);
  if (!f) {
    f = { nombre: nf, creado: iso(), ultimo: null, eventos: [] };
    g.flujos.push(f);
  }
  const t = reloj.ahora();
  const ev = { t, m: String(mensaje ?? '').slice(0, TOPES.mensaje) };
  f.eventos.push(ev);
  f.ultimo = t;
  recortarLogs(estado);
  return ev;
}

/** Mantiene los logs chicos: eventos por flujo, flujos por grupo y el total. */
function recortarLogs(estado) {
  let total = 0;
  for (const g of estado.cloudwatch.gruposLogs) {
    if (g.flujos.length > TOPES.flujosGrupo) {
      g.flujos.sort((a, b) => (a.ultimo ?? aMs(a.creado) ?? 0) - (b.ultimo ?? aMs(b.creado) ?? 0));
      g.flujos.splice(0, g.flujos.length - TOPES.flujosGrupo);
    }
    for (const f of g.flujos) {
      if (f.eventos.length > TOPES.eventosFlujo) f.eventos.splice(0, f.eventos.length - TOPES.eventosFlujo);
      total += f.eventos.length;
    }
  }
  if (total <= TOPES.eventosTotales) return;
  // Se borran los más viejos de toda la cuenta.
  const todos = estado.cloudwatch.gruposLogs.flatMap((g) => g.flujos.flatMap((f) => f.eventos.map((e) => e.t))).sort((a, b) => a - b);
  const corte = todos[total - TOPES.eventosTotales];
  for (const g of estado.cloudwatch.gruposLogs) for (const f of g.flujos) f.eventos = f.eventos.filter((e) => e.t >= corte);
}

/** Bytes guardados de un grupo de logs (lo que muestra «Stored bytes»). */
export const bytesGrupoLogs = (g) => g.flujos.reduce((a, f) => a + f.eventos.reduce((b, e) => b + e.m.length + 26, 0), 0);

/* ============================================================= CloudTrail */

// Cómo escribe CloudTrail el «Event source» de cada servicio de la bitácora.
const FUENTES = {
  EC2: 'ec2.amazonaws.com',
  VPC: 'ec2.amazonaws.com',
  S3: 's3.amazonaws.com',
  IAM: 'iam.amazonaws.com',
  AutoScaling: 'autoscaling.amazonaws.com',
  ELB: 'elasticloadbalancing.amazonaws.com',
  CloudWatch: 'monitoring.amazonaws.com',
  Logs: 'logs.amazonaws.com',
  CloudTrail: 'cloudtrail.amazonaws.com',
  SNS: 'sns.amazonaws.com',
  SQS: 'sqs.amazonaws.com',
  Lambda: 'lambda.amazonaws.com',
  EventBridge: 'events.amazonaws.com',
  RDS: 'rds.amazonaws.com',
  ElastiCache: 'elasticache.amazonaws.com',
  DynamoDB: 'dynamodb.amazonaws.com',
  Budgets: 'budgets.amazonaws.com',
  Billing: 'billingconsole.amazonaws.com',
  CostExplorer: 'ce.amazonaws.com',
  Pricing: 'pricing.amazonaws.com',
  TrustedAdvisor: 'trustedadvisor.amazonaws.com',
  Support: 'support.amazonaws.com',
  Organizations: 'organizations.amazonaws.com',
  WellArchitected: 'wellarchitected.amazonaws.com',
  CloudFront: 'cloudfront.amazonaws.com',
  Route53: 'route53.amazonaws.com',
  SecretsManager: 'secretsmanager.amazonaws.com',
  KMS: 'kms.amazonaws.com',
  EFS: 'elasticfilesystem.amazonaws.com'
};

/** El «Event source» de CloudTrail para un servicio de la bitácora. */
export const fuenteCloudTrail = (servicio) => FUENTES[servicio] ?? `${String(servicio ?? 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '')}.amazonaws.com`;

// Los recursos que se reconocen en el detalle de la bitácora, con su tipo de CloudTrail.
const PATRONES_RECURSO = [
  [/\bvpc-[0-9a-f]{8,17}\b/g, 'AWS::EC2::VPC'],
  [/\bsubnet-[0-9a-f]{8,17}\b/g, 'AWS::EC2::Subnet'],
  [/\bsg-[0-9a-f]{8,17}\b/g, 'AWS::EC2::SecurityGroup'],
  [/\bi-[0-9a-f]{8,17}\b/g, 'AWS::EC2::Instance'],
  [/\bvol-[0-9a-f]{8,17}\b/g, 'AWS::EC2::Volume'],
  [/\bsnap-[0-9a-f]{8,17}\b/g, 'AWS::EC2::Snapshot'],
  [/\bigw-[0-9a-f]{8,17}\b/g, 'AWS::EC2::InternetGateway'],
  [/\brtb-[0-9a-f]{8,17}\b/g, 'AWS::EC2::RouteTable'],
  [/\bnat-[0-9a-f]{8,17}\b/g, 'AWS::EC2::NatGateway'],
  [/\bacl-[0-9a-f]{8,17}\b/g, 'AWS::EC2::NetworkAcl'],
  [/\beipalloc-[0-9a-f]{8,17}\b/g, 'AWS::EC2::EIP'],
  [/\blt-[0-9a-f]{8,17}\b/g, 'AWS::EC2::LaunchTemplate'],
  [/\barn:aws:[a-z0-9-]+:[^\s,»)]+/g, null]
];

const TIPO_POR_ARN = { sns: 'AWS::SNS::Topic', sqs: 'AWS::SQS::Queue', lambda: 'AWS::Lambda::Function', elasticloadbalancing: 'AWS::ElasticLoadBalancingV2::LoadBalancer', autoscaling: 'AWS::AutoScaling::AutoScalingGroup', cloudwatch: 'AWS::CloudWatch::Alarm', iam: 'AWS::IAM::Role', rds: 'AWS::RDS::DBInstance', dynamodb: 'AWS::DynamoDB::Table', kms: 'AWS::KMS::Key', s3: 'AWS::S3::Bucket', logs: 'AWS::Logs::LogGroup' };

// El tipo y el nombre del recurso principal según el servicio y la acción.
function recursoPrincipal(ev) {
  const primero = String(ev.detalle ?? '').split(/[:\s,(]/)[0];
  const porServicio = {
    S3: 'AWS::S3::Bucket',
    IAM: /Role/.test(ev.accion) ? 'AWS::IAM::Role' : /Group/.test(ev.accion) ? 'AWS::IAM::Group' : /Policy/.test(ev.accion) ? 'AWS::IAM::Policy' : 'AWS::IAM::User',
    CloudWatch: /Dashboard/.test(ev.accion) ? 'AWS::CloudWatch::Dashboard' : 'AWS::CloudWatch::Alarm',
    Logs: 'AWS::Logs::LogGroup',
    AutoScaling: /LaunchTemplate/.test(ev.accion) ? 'AWS::EC2::LaunchTemplate' : 'AWS::AutoScaling::AutoScalingGroup',
    DynamoDB: 'AWS::DynamoDB::Table',
    RDS: 'AWS::RDS::DBInstance',
    SNS: 'AWS::SNS::Topic',
    SQS: 'AWS::SQS::Queue',
    Lambda: 'AWS::Lambda::Function',
    CloudTrail: 'AWS::CloudTrail::Trail'
  };
  const tipo = porServicio[ev.servicio];
  return tipo && primero && !/^(arn|vpc|subnet|sg|i|vol)-/.test(primero) ? { tipo, nombre: primero.replace(/[«»"]/g, '') } : null;
}

/** Un id de evento estable con forma de UUID. */
function idEvento(ev, n) {
  const base = `${ev.t}|${ev.servicio}|${ev.accion}|${ev.detalle}|${n}`;
  const h = [hash(base), hash(`a${base}`), hash(`b${base}`), hash(`c${base}`)].map((x) => x.toString(16).padStart(8, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${'89ab'[parseInt(h[16], 16) % 4]}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * El Event history: la bitácora vista como CloudTrail, del más nuevo al más viejo.
 * → [{ id, t, nombre, fuente, servicio, usuario, detalle, recursos: [{ tipo, nombre }], soloLectura: false }]
 */
export function eventosCloudTrail(estado) {
  const vistos = new Map();
  const lista = [];
  for (const ev of estado.bitacora ?? []) {
    if (ev.servicio === 'Simulador') continue;
    const base = `${ev.t}|${ev.accion}|${ev.detalle}`;
    const n = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, n);
    const recursos = [];
    const principal = recursoPrincipal(ev);
    if (principal) recursos.push(principal);
    for (const [re, tipo] of PATRONES_RECURSO) {
      for (const m of String(ev.detalle ?? '').matchAll(re)) {
        const nombre = m[0];
        const t = tipo ?? TIPO_POR_ARN[nombre.split(':')[2]] ?? 'AWS::Resource';
        if (!recursos.some((r) => r.nombre === nombre)) recursos.push({ tipo: t, nombre });
      }
    }
    // El recurso principal primero; los demás en el orden en que aparecen en el detalle.
    const detalle = String(ev.detalle ?? '');
    const lugar = (r) => (r === principal ? -1 : detalle.indexOf(r.nombre));
    recursos.sort((a, b) => lugar(a) - lugar(b));
    lista.push({
      id: idEvento(ev, n),
      t: ev.t,
      nombre: ev.accion,
      fuente: fuenteCloudTrail(ev.servicio),
      servicio: ev.servicio,
      usuario: estado.cuenta?.usuario ?? 'alumno',
      detalle: ev.detalle ?? '',
      recursos: recursos.slice(0, 8),
      soloLectura: false
    });
  }
  return lista.reverse();
}

/** El registro JSON de un evento, como el «Event record» de la consola. */
export function registroEventoCloudTrail(estado, ev) {
  const usuario = estado.cuenta?.usuario ?? 'alumno';
  const limpio = String(usuario).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w+=,.@-]/g, '-').slice(0, 64) || 'alumno';
  const parametros = {};
  for (const r of ev.recursos) {
    const campo = { 'AWS::EC2::VPC': 'vpcId', 'AWS::EC2::Subnet': 'subnetId', 'AWS::EC2::SecurityGroup': 'groupId', 'AWS::EC2::Instance': 'instanceId', 'AWS::EC2::Volume': 'volumeId', 'AWS::EC2::Snapshot': 'snapshotId', 'AWS::S3::Bucket': 'bucketName', 'AWS::CloudWatch::Alarm': 'alarmName', 'AWS::Logs::LogGroup': 'logGroupName' }[r.tipo];
    if (campo && !(campo in parametros)) parametros[campo] = r.nombre;
  }
  return {
    eventVersion: '1.10',
    userIdentity: {
      type: 'IAMUser',
      principalId: `AIDA${(hash(usuario).toString(16) + hash(`x${usuario}`).toString(16)).toUpperCase().slice(0, 17)}`,
      arn: `arn:aws:iam::${cuentaId(estado)}:user/${limpio}`,
      accountId: cuentaId(estado),
      accessKeyId: `ASIA${hash(ev.id).toString(16).toUpperCase().padStart(8, '0')}EXAMPLE`,
      userName: usuario,
      sessionContext: { attributes: { creationDate: ev.t, mfaAuthenticated: 'false' } }
    },
    eventTime: String(ev.t).replace(/\.\d{3}Z$/, 'Z'),
    eventSource: ev.fuente,
    eventName: ev.nombre,
    awsRegion: ['iam.amazonaws.com', 'cloudfront.amazonaws.com', 'route53.amazonaws.com', 'organizations.amazonaws.com'].includes(ev.fuente) ? 'us-east-1' : estado.cuenta?.region ?? 'us-east-1',
    sourceIPAddress: estado.cuenta?.ipCasa ?? '187.190.20.30',
    userAgent: 'AWS Internal',
    requestParameters: Object.keys(parametros).length ? parametros : null,
    responseElements: null,
    additionalEventData: { simulatorDetail: ev.detalle },
    requestID: idEvento({ ...ev, accion: `${ev.nombre}-req` }, 0),
    eventID: ev.id,
    readOnly: false,
    resources: ev.recursos.map((r) => ({ type: r.tipo, ARN: r.nombre.startsWith('arn:') ? r.nombre : undefined, resourceName: r.nombre.startsWith('arn:') ? undefined : r.nombre })),
    eventType: 'AwsApiCall',
    managementEvent: true,
    recipientAccountId: cuentaId(estado),
    eventCategory: 'Management',
    tlsDetails: { tlsVersion: 'TLSv1.3', cipherSuite: 'TLS_AES_128_GCM_SHA256', clientProvidedHostHeader: `${ev.fuente.replace('.amazonaws.com', '')}.us-east-1.amazonaws.com` },
    sessionCredentialFromConsole: 'true'
  };
}

const NOMBRE_TRAIL = /^[A-Za-z0-9][A-Za-z0-9._-]{1,126}[A-Za-z0-9]$/;
export const trailDe = (estado, nombre) => estado.cloudtrail?.trails?.find((t) => t.nombre === nombre) ?? null;

/**
 * CreateTrail (y StartLogging). bucketNuevo: true crea el bucket de S3 para
 * los logs (aws-cloudtrail-logs-<cuenta>-<azar>), como hace la consola.
 */
export function crearTrail(estado, { nombre, bucket, bucketNuevo = false, prefijo = '', kms = null, validacion = true, eventosLectura = true, eventosEscritura = true } = {}) {
  iniciar(estado);
  const n = String(nombre ?? '').trim();
  if (!n) throw errorAws('InvalidTrailNameException', 'Trail name is required.');
  if (n.length < 3 || n.length > 128) throw errorAws('InvalidTrailNameException', 'Trail name must be between 3 and 128 characters.');
  if (!NOMBRE_TRAIL.test(n) || /[._-]{2}/.test(n)) throw errorAws('InvalidTrailNameException', 'Trail name must start with a letter or number, end with a letter or number, and contain only ASCII letters, numbers, periods (.), underscores (_), or dashes (-). It cannot have adjacent periods, underscores or dashes.');
  if (trailDe(estado, n)) throw errorAws('TrailAlreadyExistsException', `Trail ${n} already exists for customer: ${cuentaId(estado)}`);
  if (estado.cloudtrail.trails.length >= TOPES.trails) throw errorAws('MaximumNumberOfTrailsExceededException', 'User: ' + cuentaId(estado) + ' already has 5 trails in us-east-1.');
  let b = String(bucket ?? '').trim();
  if (bucketNuevo) {
    if (!b) b = `aws-cloudtrail-logs-${cuentaId(estado)}-${hexAzar(8)}`;
    crearBucket(estado, { nombre: b });
  } else if (!b) throw errorAws('InvalidS3BucketNameException', 'S3 bucket name is required.');
  else if (!(estado.buckets ?? []).some((x) => x.nombre === b)) throw errorAws('S3BucketDoesNotExistException', `S3 bucket does not exist: ${b}`);
  const t = {
    nombre: n,
    arn: `arn:aws:cloudtrail:us-east-1:${cuentaId(estado)}:trail/${n}`,
    bucket: b,
    prefijo: String(prefijo ?? '').trim().replace(/^\/+|\/+$/g, ''),
    multiRegion: true,
    validacion: Boolean(validacion),
    kms: kms || null,
    registrando: true,
    eventosLectura: Boolean(eventosLectura),
    eventosEscritura: Boolean(eventosEscritura),
    creado: iso(),
    entregados: (estado.bitacora ?? []).length,
    ultimaEntrega: null
  };
  estado.cloudtrail.trails.push(t);
  anotar(estado, 'CloudTrail', 'CreateTrail', `${n} → s3://${b}${t.prefijo ? `/${t.prefijo}` : ''}`);
  anotar(estado, 'CloudTrail', 'StartLogging', n);
  return t;
}

/** StartLogging / StopLogging. */
export function cambiarRegistroTrail(estado, nombre, registrando) {
  iniciar(estado);
  const t = trailDe(estado, nombre);
  if (!t) throw errorAws('TrailNotFoundException', `Unknown trail: ${nombre} for the user: ${cuentaId(estado)}`);
  t.registrando = Boolean(registrando);
  if (t.registrando) t.entregados = (estado.bitacora ?? []).length;
  anotar(estado, 'CloudTrail', registrando ? 'StartLogging' : 'StopLogging', nombre);
  return t;
}

/** UpdateTrail: cambia la validación de los archivos de log y el cifrado SSE-KMS (kms: alias/x, un ARN o null). */
export function editarTrail(estado, nombre, { kms, validacion } = {}) {
  iniciar(estado);
  const t = trailDe(estado, nombre);
  if (!t) throw errorAws('TrailNotFoundException', `Unknown trail: ${nombre} for the user: ${cuentaId(estado)}`);
  if (validacion !== undefined) t.validacion = Boolean(validacion);
  if (kms !== undefined) t.kms = String(kms ?? '').trim() || null;
  anotar(estado, 'CloudTrail', 'UpdateTrail', nombre);
  return t;
}

/** DeleteTrail (el bucket y sus logs se quedan). */
export function eliminarTrail(estado, nombre) {
  iniciar(estado);
  if (!trailDe(estado, nombre)) throw errorAws('TrailNotFoundException', `Unknown trail: ${nombre} for the user: ${cuentaId(estado)}`);
  estado.cloudtrail.trails = estado.cloudtrail.trails.filter((t) => t.nombre !== nombre);
  anotar(estado, 'CloudTrail', 'DeleteTrail', nombre);
}

/** Cada tanto, cada trail que registra deja un archivo .json.gz en su bucket. */
function entregarTrails(estado, ahora) {
  let cambio = false;
  const total = (estado.bitacora ?? []).length;
  for (const t of estado.cloudtrail.trails) {
    if (!t.registrando) continue;
    if (t.ultimaEntrega && ahora - t.ultimaEntrega < DURACION_CLOUDWATCH.entregaTrail) continue;
    // La bitácora se recorta por el frente: si hay menos que lo entregado, se reinicia la cuenta.
    if (t.entregados > total) t.entregados = total;
    const nuevos = total - t.entregados;
    if (nuevos <= 0) continue;
    const b = (estado.buckets ?? []).find((x) => x.nombre === t.bucket);
    t.entregados = total;
    t.ultimaEntrega = ahora;
    cambio = true;
    if (!b) continue;
    const d = new Date(ahora);
    const dos = (x) => String(x).padStart(2, '0');
    const cuenta = cuentaId(estado);
    const marca = `${d.getUTCFullYear()}${dos(d.getUTCMonth() + 1)}${dos(d.getUTCDate())}T${dos(d.getUTCHours())}${dos(d.getUTCMinutes())}Z`;
    const prefijo = `${t.prefijo ? `${t.prefijo}/` : ''}AWSLogs/${cuenta}/CloudTrail/us-east-1/${d.getUTCFullYear()}/${dos(d.getUTCMonth() + 1)}/${dos(d.getUTCDate())}/`;
    b.objetos ??= [];
    b.objetos.push({ llave: `${prefijo}${cuenta}_CloudTrail_us-east-1_${marca}_${hexAzar(16)}.json.gz`, tamano: 420 + nuevos * 610, tipo: 'application/json', clase: 'STANDARD', versionId: b.versionado === 'Enabled' ? hexAzar(32) : 'null', actual: true, marcadorBorrado: false, modificado: iso(ahora) });
    // Solo se guardan los últimos archivos de cada trail (el estado debe seguir chico).
    const raiz = `${t.prefijo ? `${t.prefijo}/` : ''}AWSLogs/${cuenta}/CloudTrail/`;
    const suyos = b.objetos.filter((o) => o.llave.startsWith(raiz));
    if (suyos.length > TOPES.archivosTrail) {
      const fuera = new Set(suyos.slice(0, suyos.length - TOPES.archivosTrail));
      b.objetos = b.objetos.filter((o) => !fuera.has(o));
    }
  }
  return cambio;
}

/* =============================================================== el tiempo */

function avanzar(estado, ahora) {
  const cw = estado.cloudwatch;
  let cambio = false;
  const k = Math.floor(ahora / P()) - 1; // el último periodo completo
  if (cw.alarmas.length) {
    const cx = contexto(estado);
    for (const a of [...cw.alarmas]) {
      if (a.evaluada === k) continue;
      a.evaluada = k;
      try {
        if (evaluarAlarma(estado, cx, a, k)) cambio = true;
      } catch (e) {
        // Una alarma con datos raros no debe tumbar el reloj de la consola.
        a.razon = `Evaluation error: ${e?.message ?? e}`;
      }
    }
  }
  if (Object.keys(cw.carga).length && k % 30 === 0) recortarCarga(estado, ahora);
  if (estado.cloudtrail.trails.length && entregarTrails(estado, ahora)) cambio = true;
  return cambio;
}

registrarExtension({
  id: 'cloudwatch',
  orden: 30,
  iniciar,
  avanzar,
  funciones: { crearAlarmaInterna, eliminarAlarmasInternas, agregarAccionAlarma, valorMetrica, simularCarga, escribirLog, editarTrail }
});
