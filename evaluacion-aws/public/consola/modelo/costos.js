// ---------------------------------------------------------------------------
// COSTOS: BILLING AND COST MANAGEMENT, TRUSTED ADVISOR Y SUPPORT
//
// La factura de la cuenta simulada, la calculadora de precios, los
// presupuestos (Budgets) con sus alertas, las etiquetas de asignación de
// costos, la detección de anomalías, los chequeos de Trusted Advisor y los
// casos y el plan de AWS Support.
//
// Cómo se cobra (SIMULADOR.md §3): cada recurso que cobra por hora suma
// `precio por hora × horas`, y **1 hora simulada = 1 minuto real** (así un
// laboratorio de 50 minutos deja un gasto visible, pero chico). avanzar() va
// sumando lo que cuesta cada recurso que existe en ese momento: lo cobrado se
// queda aunque luego borres el recurso, como en AWS. Los meses anteriores a la
// cuenta salen de un histórico SINTÉTICO que se calcula (no se guarda) a partir
// del id de la cuenta, así cada alumno ve otra historia, pero siempre la misma.
// El pronóstico del mes es lo gastado más lo que cuestan por hora los recursos
// de hoy por las horas que le faltan al mes (horas reales del calendario).
//
// Los precios son los reales On-Demand de us-east-1 (noviembre de 2026). En
// la factura del simulador NO se descuenta la capa gratuita (para que el alumno
// vea cuánto costaría cada cosa); la página Free Tier sí muestra su consumo.
//
// La forma de la colección:
//
// estado.costos = {
//   inicio,                       // iso: desde cuándo cuenta el uso real (antes: histórico sintético)
//   uso: { mes: 'YYYY-MM', ultimo: ms, lineas: [linea] },   // lo cobrado en el mes en curso
//   historico: [{ mes: 'YYYY-MM', lineas: [linea] }],       // meses ya cerrados con uso real (máximo 12)
//       // linea: { servicio: 'ec2' | 'ec2-otros' | 'vpc' | 's3' | …  (SERVICIOS_COSTO),
//       //          uso: 'BoxUsage:t2.micro' (usage type), precio, unidad: 'Hrs' | 'GB-Mo' | …,
//       //          cantidad, costo, etiquetas: { llave: valor }, dias: { 'DD': costo } }
//   estimaciones: [{ id, nombre, creada, modificada,
//                    grupos: [{ id, nombre }],
//                    servicios: [{ id, grupoId | null, servicio: 'ec2' | 's3' | 'rds' | 'dynamodb',
//                                  descripcion, region: 'us-east-1', config, mensual, inicial }] }],
//       // config EC2: { sistema: 'linux' | 'windows', tenencia: 'shared', carga: 'constante',
//       //               cantidad, tipo: 't2.micro', pago: 'ondemand' | 'compute-sp' | 'ec2-sp' | 'spot',
//       //               utilizacion (On-Demand, %), plazo: 1 | 3, opcionPago: 'none' | 'partial' | 'all',
//       //               descuentoSpot (%), ebsTipo: 'gp3', ebsGb }
//       // config S3: { clase: 'STANDARD', gb, put, get }
//       // config RDS: { motor: 'mysql' | 'postgres' | 'mariadb', clase: 'db.t3.micro', despliegue: 'single' | 'multi',
//       //               cantidad, utilizacion, almacenamientoGb }
//       // config DynamoDB: { modo: 'ondemand' | 'provisioned', gb, escriturasMillones, lecturasMillones, wcu, rcu }
//   presupuestos: [{ nombre, arn, tipo: 'COST' | 'USAGE' | 'SAVINGS_PLANS_COVERAGE' | 'RI_UTILIZATION',
//                    plantilla: null | 'zero' | 'mensual' | 'sp-cobertura' | 'ri-utilizacion',
//                    periodo: 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY' | 'DAILY', renovacion: 'RECURRING' | 'EXPIRING',
//                    metodo: 'FIXED', monto, filtros: { servicios: [id], etiquetas: [{ llave, valor }] },
//                    alertas: [{ id, umbral, tipoUmbral: 'PERCENTAGE' | 'ABSOLUTE_VALUE',
//                                disparador: 'ACTUAL' | 'FORECASTED', correos: [texto], temaSns: null | arn,
//                                periodo: null | 'YYYY-MM' (o día) en que se disparó, disparadaEn: null | iso }],
//                    creado, modificado }],
//   etiquetasActivas: ['Proyecto'],                 // cost allocation tags activadas (llaves)
//   etiquetasFechas: { Proyecto: iso },             // cuándo se activó o desactivó cada una
//   monitores: [{ id, arn, nombre, tipo: 'SERVICE' | 'TAG', llave?, umbral, frecuencia: 'DAILY' | 'IMMEDIATE' | 'WEEKLY',
//                 correos: [texto], creado, porOmision }],
//   reportes: [{ id, nombre, parametros, creado }],  // Cost Explorer saved reports
//   planSoporte: 'basic' | 'business-plus' | 'enterprise' | 'unified-operations',
//   casos: [{ id, numero, asunto, tipo: 'account' | 'technical', servicio, categoria, severidad,
//             estado: 'unassigned' | 'pending-customer-action' | 'customer-action-completed' | 'resolved',
//             correos: [texto], creado, respuestaEn: null | ms,
//             mensajes: [{ de: 'customer' | 'aws', texto, t }] }],   // máximo 30 casos y 20 mensajes cada uno
//   advisor: { revisado: null | iso,
//              resultados: { [chequeoId]: { estado: 'ok' | 'warning' | 'error', evaluados,
//                                           marcados: [{ estado, recurso, datos: { columna: valor } }], revisado } } }
// }
//
// Las alertas de presupuesto escriben en el buzón simulado de SNS
// (`estado.sns.buzon`, ver modelo/mensajeria.js) con esta forma:
//   { id, de, para, asunto, cuerpo, fecha: iso, leido: false, origen: 'budgets' }
// y, si la alerta tiene un tema SNS, además llaman llamar('publicarEnTema', …).
//
// Regla del ciclo de módulos: nada de lo importado de modelo.js se usa en el
// nivel superior de este archivo, solo dentro de funciones.
// ---------------------------------------------------------------------------

import { registrarExtension, llamar } from './registro.js';
import { ami, anotar, errorAws, hexAzar, iso, nombreLimpio, politicaEsPublica, reloj, tipoInstancia } from '../modelo.js';

/** Tiempos de costos (tiempo comprimido del simulador, en ms). */
export const DURACION_COSTOS = {
  horaSimulada: 60_000,        // 1 hora de uso = 1 minuto real
  topeAvance: 60_000,          // si la consola estuvo cerrada, solo se cobra 1 minuto (= 1 hora) de golpe
  respuestaSoporte: 20_000,    // AWS Support contesta un caso a los 20 s
  guardar: 300_000             // cada 5 min avanzar avisa que el gasto cambió (para que se guarde)
};

const HORAS_MES = 730;
const MS_HORA_REAL = 3_600_000;

/* =========================================================== catálogos */

/**
 * Los servicios como aparecen en la factura. `ce`: nombre en Cost Explorer;
 * `factura`: nombre en Bills; `codigo`: la dimensión ServiceName de la métrica
 * AWS/Billing EstimatedCharges.
 */
export const SERVICIOS_COSTO = [
  { id: 'ec2', ce: 'EC2-Instances', factura: 'Elastic Compute Cloud', codigo: 'AmazonEC2' },
  { id: 'ec2-otros', ce: 'EC2-Other', factura: 'Elastic Compute Cloud', codigo: 'AmazonEC2' },
  { id: 'vpc', ce: 'Virtual Private Cloud', factura: 'Virtual Private Cloud', codigo: 'AmazonVPC' },
  { id: 'elb', ce: 'Elastic Load Balancing', factura: 'Elastic Load Balancing', codigo: 'AWSELB' },
  { id: 's3', ce: 'S3', factura: 'Simple Storage Service', codigo: 'AmazonS3' },
  { id: 'rds', ce: 'Relational Database Service', factura: 'Relational Database Service', codigo: 'AmazonRDS' },
  { id: 'elasticache', ce: 'ElastiCache', factura: 'ElastiCache', codigo: 'AmazonElastiCache' },
  { id: 'dynamodb', ce: 'DynamoDB', factura: 'DynamoDB', codigo: 'AmazonDynamoDB' },
  { id: 'lambda', ce: 'Lambda', factura: 'Lambda', codigo: 'AWSLambda' },
  { id: 'cloudwatch', ce: 'CloudWatch', factura: 'CloudWatch', codigo: 'AmazonCloudWatch' },
  { id: 'efs', ce: 'Elastic File System', factura: 'Elastic File System', codigo: 'AmazonEFS' },
  { id: 'kms', ce: 'Key Management Service', factura: 'Key Management Service', codigo: 'awskms' },
  { id: 'secretsmanager', ce: 'Secrets Manager', factura: 'Secrets Manager', codigo: 'AWSSecretsManager' },
  { id: 'route53', ce: 'Route 53', factura: 'Route 53', codigo: 'AmazonRoute53' },
  { id: 'cloudfront', ce: 'CloudFront', factura: 'CloudFront', codigo: 'AmazonCloudFront' },
  { id: 'sns', ce: 'SNS', factura: 'Simple Notification Service', codigo: 'AmazonSNS' },
  { id: 'sqs', ce: 'SQS', factura: 'Simple Queue Service', codigo: 'AWSQueueService' },
  { id: 'soporte', ce: 'AWS Support', factura: 'Support', codigo: 'AWSSupport' }
];
export const servicioCosto = (id) => SERVICIOS_COSTO.find((s) => s.id === id || s.ce === id || s.factura === id || s.codigo === id) ?? null;
/** Todos los ids que corresponden a un nombre ('AmazonEC2' o 'Elastic Compute Cloud' = EC2-Instances y EC2-Other). */
const idsDeServicio = (x) => SERVICIOS_COSTO.filter((s) => s.id === x || s.ce === x || s.factura === x || s.codigo === x).map((s) => s.id);

/** Precio de EBS por GB-mes (us-east-1). */
export const PRECIO_EBS = { gp3: 0.08, gp2: 0.1, io1: 0.125, io2: 0.125, st1: 0.045, sc1: 0.015, standard: 0.05 };
const USO_EBS = { gp3: 'EBS:VolumeUsage.gp3', gp2: 'EBS:VolumeUsage.gp2', io1: 'EBS:VolumeUsage.piops', io2: 'EBS:VolumeUsage.io2', st1: 'EBS:VolumeUsage.st1', sc1: 'EBS:VolumeUsage.sc1', standard: 'EBS:VolumeUsage' };

/** Precio de S3 por GB-mes según la clase, y su usage type. */
export const PRECIO_S3 = {
  STANDARD: [0.023, 'TimedStorage-ByteHrs'],
  INTELLIGENT_TIERING: [0.023, 'TimedStorage-INT-FA-ByteHrs'],
  STANDARD_IA: [0.0125, 'TimedStorage-SIA-ByteHrs'],
  ONEZONE_IA: [0.01, 'TimedStorage-ZIA-ByteHrs'],
  GLACIER_IR: [0.004, 'TimedStorage-GIR-ByteHrs'],
  GLACIER: [0.0036, 'TimedStorage-GlacierByteHrs'],
  DEEP_ARCHIVE: [0.00099, 'TimedStorage-GDA-ByteHrs']
};

/** Clases de RDS: [MySQL/MariaDB, PostgreSQL] dólares por hora, Single-AZ. */
export const PRECIO_RDS = {
  'db.t3.micro': [0.017, 0.018],
  'db.t3.small': [0.034, 0.036],
  'db.t3.medium': [0.068, 0.072],
  'db.t4g.micro': [0.016, 0.016],
  'db.t4g.small': [0.032, 0.032],
  'db.t4g.medium': [0.065, 0.065],
  'db.m5.large': [0.171, 0.178],
  'db.m6g.large': [0.152, 0.159],
  'db.r5.large': [0.25, 0.25],
  'db.r6g.large': [0.215, 0.225]
};
const PRECIO_AURORA = { 'db.t3.medium': 0.082, 'db.t4g.medium': 0.073, 'db.r5.large': 0.29, 'db.r6g.large': 0.26, 'db.t3.small': 0.041, 'db.t4g.small': 0.037 };

/** ElastiCache: nodos por hora y el mínimo por hora de un caché serverless. */
const PRECIO_ELASTICACHE = { 'cache.t3.micro': 0.017, 'cache.t4g.micro': 0.016, 'cache.t3.small': 0.034, 'cache.t4g.small': 0.032, 'cache.t3.medium': 0.068, 'cache.t4g.medium': 0.065, 'cache.m5.large': 0.156, 'cache.r6g.large': 0.206 };
const SERVERLESS_ELASTICACHE = { valkey: 0.0084, redis: 0.125, memcached: 0.125 };

/** Otros precios sueltos de us-east-1. */
export const PRECIOS = {
  ipv4: 0.005,              // por IP pública por hora (en uso u ociosa), desde 2024
  nat: 0.045,               // NAT gateway por hora
  alb: 0.0225,              // Application o Network Load Balancer por hora
  gwlb: 0.0125,
  snapshotGb: 0.05,         // snapshot de EBS por GB-mes
  rdsGb: 0.115,             // almacenamiento de RDS (gp2/gp3) por GB-mes
  dynamoGb: 0.25,
  dynamoWcuHora: 0.00065,
  dynamoRcuHora: 0.00013,
  dynamoEscrituraMillon: 0.625,
  dynamoLecturaMillon: 0.125,
  alarma: 0.1,              // alarma estándar de CloudWatch por mes
  tablero: 3,               // dashboard propio por mes
  efsGb: 0.3,
  efsUnaZonaGb: 0.16,
  llaveKms: 1,
  secreto: 0.4,
  zonaRoute53: 0.5,
  chequeoRoute53: 0.5,
  licenciaWindows: 0.0046   // por vCPU-hora, encima del precio Linux
};

/** Los planes de AWS Support de 2026 (aws.amazon.com/premiumsupport/pricing). */
export const PLANES_SOPORTE = [
  {
    id: 'basic',
    nombre: 'Basic Support',
    precio: 0,
    textoPrecio: 'Included',
    porcentajes: null,
    respuestas: [],
    advisor: 'Core checks',
    tam: false,
    casosTecnicos: false
  },
  {
    id: 'business-plus',
    nombre: 'Business Support+',
    precio: 29,
    textoPrecio: 'Starts at $29/month',
    porcentajes: ['9% of monthly AWS charges up to $10K', '7% from $10K to $80K', '5% from $80K to $250K', '3% over $250K'],
    respuestas: [['Business-critical system down', '< 30 minutes'], ['Production system down', '< 1 hour'], ['Production system impaired', '< 4 hours'], ['System impaired', '< 12 hours'], ['General guidance', '< 24 hours']],
    advisor: 'Full set of checks',
    tam: false,
    casosTecnicos: true
  },
  {
    id: 'enterprise',
    nombre: 'Enterprise Support',
    precio: 5000,
    textoPrecio: 'Starts at $5,000/month',
    porcentajes: ['10% of monthly AWS charges up to $150K', '7% from $150K to $500K', '5% from $500K to $1M', '3% over $1M'],
    respuestas: [['Business-critical system down', '< 15 minutes'], ['Production system down', '< 1 hour'], ['Production system impaired', '< 4 hours'], ['System impaired', '< 12 hours'], ['General guidance', '< 24 hours']],
    advisor: 'Full set of checks + Trusted Advisor Priority',
    tam: true,
    casosTecnicos: true
  },
  {
    id: 'unified-operations',
    nombre: 'Unified Operations',
    precio: 50000,
    textoPrecio: 'Starts at $50,000/month',
    porcentajes: ['10% of monthly AWS charges up to $1M', '6% from $1M to $5M', '5% over $5M'],
    respuestas: [['Mission-critical system down', '< 5 minutes'], ['Production system down', '< 1 hour'], ['Production system impaired', '< 4 hours'], ['System impaired', '< 12 hours'], ['General guidance', '< 24 hours']],
    advisor: 'Full set of checks + Trusted Advisor Priority',
    tam: true,
    casosTecnicos: true
  }
];
export const planSoporte = (id) => PLANES_SOPORTE.find((p) => p.id === id) ?? PLANES_SOPORTE[0];

/** Lo que regala la capa gratuita (Free Tier). `uso`: prefijos de usage type que cuentan. */
export const OFERTAS_CAPA_GRATUITA = [
  { servicio: 'Amazon Elastic Compute Cloud', tipo: '12 Months Free', limite: 750, unidad: 'Hrs', texto: '750 hours of Amazon EC2 Linux t2.micro or t3.micro instance usage', usos: ['BoxUsage:t2.micro', 'BoxUsage:t3.micro'] },
  { servicio: 'Amazon Elastic Compute Cloud', tipo: '12 Months Free', limite: 30, unidad: 'GB-Mo', texto: '30 GB-month of Amazon EBS General Purpose (SSD) or Magnetic storage', usos: ['EBS:VolumeUsage.gp3', 'EBS:VolumeUsage.gp2', 'EBS:VolumeUsage'] },
  { servicio: 'Amazon Virtual Private Cloud', tipo: '12 Months Free', limite: 750, unidad: 'Hrs', texto: '750 hours of public IPv4 address usage', usos: ['PublicIPv4:InUseAddress'] },
  { servicio: 'Amazon Simple Storage Service', tipo: '12 Months Free', limite: 5, unidad: 'GB-Mo', texto: '5 GB-month of Amazon S3 Standard storage', usos: ['TimedStorage-ByteHrs'] },
  { servicio: 'Amazon Relational Database Service', tipo: '12 Months Free', limite: 750, unidad: 'Hrs', texto: '750 hours of Amazon RDS Single-AZ db.t2.micro, db.t3.micro or db.t4g.micro instance usage', usos: ['InstanceUsage:db.t3.micro', 'InstanceUsage:db.t4g.micro', 'InstanceUsage:db.t2.micro'] },
  { servicio: 'Amazon Relational Database Service', tipo: '12 Months Free', limite: 20, unidad: 'GB-Mo', texto: '20 GB-month of General Purpose (SSD) database storage', usos: ['RDS:GP2-Storage', 'RDS:GP3-Storage'] },
  { servicio: 'Amazon DynamoDB', tipo: 'Always Free', limite: 25, unidad: 'GB-Mo', texto: '25 GB-month of storage', usos: ['DynamoDB:TimedStorage'] },
  { servicio: 'Amazon CloudWatch', tipo: 'Always Free', limite: 10, unidad: 'Alarms', texto: '10 alarm metrics (standard resolution)', usos: ['CW:AlarmMonitorUsage'] },
  { servicio: 'AWS Lambda', tipo: 'Always Free', limite: 1_000_000, unidad: 'Requests', texto: '1,000,000 free requests per month', usos: ['Request'] },
  { servicio: 'Amazon Simple Notification Service', tipo: 'Always Free', limite: 1_000_000, unidad: 'Requests', texto: '1,000,000 requests', usos: ['Requests-Tier1'] },
  { servicio: 'Amazon Simple Queue Service', tipo: 'Always Free', limite: 1_000_000, unidad: 'Requests', texto: '1,000,000 requests', usos: ['Requests-RBP'] }
];

/** Las llaves de etiquetas que genera AWS (pestaña «AWS generated cost allocation tags»). */
export const ETIQUETAS_AWS = ['aws:autoscaling:groupName', 'aws:cloudformation:stack-name', 'aws:createdBy', 'aws:ec2launchtemplate:id', 'aws:elasticfilesystem:default-backup'];

/** Descuentos de la calculadora (fracción del precio On-Demand que se paga). */
export const FACTORES_AHORRO = {
  'compute-sp': { 1: { none: 0.72, partial: 0.69, all: 0.68 }, 3: { none: 0.5, partial: 0.47, all: 0.45 } },
  'ec2-sp': { 1: { none: 0.64, partial: 0.61, all: 0.6 }, 3: { none: 0.4, partial: 0.38, all: 0.37 } },
  'rds-ri': { 1: { none: 0.69, partial: 0.66, all: 0.65 }, 3: { none: 0.5, partial: 0.46, all: 0.44 } }
};

/* ============================================================= utilidades */

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const r6 = (n) => Math.round(Number(n) * 1e6) / 1e6;
const dos = (n) => String(n).padStart(2, '0');

/** Dinero como lo escribe la consola: $1,234.56. */
export const dinero = (n) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** 'YYYY-MM' del instante (UTC, como la facturación de AWS). */
export const claveMes = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}`;
};
export const claveDia = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}`;
};
export function inicioMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  return Date.UTC(a, m - 1, 1);
}
export const finMes = (mes) => inicioMes(sumarMeses(mes, 1));
export const diasDelMes = (mes) => Math.round((finMes(mes) - inicioMes(mes)) / 86_400_000);
export function sumarMeses(mes, n) {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}`;
}
/** Los meses de `desde` a `hasta` (inclusive). */
export function mesesEntre(desde, hasta) {
  const lista = [];
  for (let m = desde; m <= hasta && lista.length < 60; m = sumarMeses(m, 1)) lista.push(m);
  return lista;
}
const NOMBRES_MES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** 'November 2026'. */
export const nombreMes = (mes) => `${NOMBRES_MES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;
/** 'Nov 2026'. */
export const mesCorto = (mes) => `${NOMBRES_MES[Number(mes.slice(5, 7)) - 1].slice(0, 3)} ${mes.slice(0, 4)}`;

/** Un número fijo a partir de un texto (para el histórico sintético). */
function semilla(texto) {
  let h = 2166136261;
  for (const c of String(texto)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
/** Generador pseudoaleatorio con semilla (mulberry32): siempre da lo mismo. */
function generador(n) {
  let a = n >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Las etiquetas de un recurso como objeto { llave: valor } (incluye Name). */
export function etiquetasDe(r) {
  const salida = {};
  if (!r) return salida;
  const lista = r.etiquetas ?? r.tags;
  if (Array.isArray(lista)) {
    for (const e of lista) {
      const llave = e?.llave ?? e?.Key ?? e?.key;
      if (llave) salida[String(llave)] = String(e.valor ?? e.Value ?? e.value ?? '');
    }
  } else if (lista && typeof lista === 'object') {
    for (const [k, v] of Object.entries(lista)) salida[k] = String(v ?? '');
  }
  if (r.nombre && salida.Name === undefined && typeof r.nombre === 'string' && /^(i|vol|snap|nat|eipalloc|vpc|subnet)-/.test(String(r.id ?? ''))) salida.Name = r.nombre;
  const asg = r.autoscaling ?? r.grupoAutoScaling ?? r.asg;
  if (typeof asg === 'string' && asg) salida['aws:autoscaling:groupName'] = asg;
  return salida;
}

/**
 * Las etiquetas de una instancia EC2 como las ve la factura: las suyas, más
 * las «Resource tags» de su plantilla de lanzamiento y las etiquetas que su
 * grupo de Auto Scaling propaga («Tag new instances»), como en AWS.
 */
function etiquetasInstancia(estado, inst) {
  const salida = etiquetasDe(inst);
  if (typeof inst.autoscaling !== 'string' || !inst.autoscaling) return salida;
  const g = (estado.autoscaling?.grupos ?? []).find((x) => x.nombre === inst.autoscaling);
  if (!g) return salida;
  const lt = (estado.autoscaling?.plantillas ?? []).find((p) => p.id === g.plantilla?.id);
  const pedida = g.plantilla?.version;
  const n = pedida === '$Latest' ? lt?.ultimaVersion : pedida === '$Default' || pedida == null ? lt?.versionDefault : Number(pedida);
  const version = lt?.versiones?.find((v) => v.numero === n) ?? lt?.versiones?.at?.(-1);
  for (const e of version?.datos?.etiquetas ?? []) if (e?.llave && salida[e.llave] === undefined) salida[e.llave] = String(e.valor ?? '');
  for (const e of g.etiquetas ?? []) if (e?.llave && e.propagar !== false) salida[e.llave] = String(e.valor ?? '');
  return salida;
}

/** La firma de una línea de cobro: mismo servicio, mismo uso, mismas etiquetas → misma línea. */
const firma = (l) => `${l.servicio}|${l.uso}|${l.precio}|${Object.entries(l.etiquetas ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join(',')}`;

/* ================================================================ iniciar */

function iniciar(estado) {
  estado.costos ??= {};
  const c = estado.costos;
  c.inicio ??= estado.creada ?? iso();
  c.uso ??= { mes: null, ultimo: null, lineas: [] };
  c.uso.lineas ??= [];
  c.historico ??= [];
  c.estimaciones ??= [];
  c.presupuestos ??= [];
  c.etiquetasActivas ??= [];
  c.etiquetasFechas ??= {};
  c.monitores ??= [
    // AWS crea este monitor solo en las cuentas nuevas (Cost Anomaly Detection).
    { id: hexAzar(8), arn: `arn:aws:ce::${estado.cuenta?.id ?? '123456789012'}:anomalymonitor/${hexAzar(8)}-${hexAzar(4)}-${hexAzar(4)}-${hexAzar(4)}-${hexAzar(12)}`, nombre: 'Default-Services-Monitor', tipo: 'SERVICE', umbral: 100, frecuencia: 'DAILY', correos: [], creado: c.inicio, porOmision: true }
  ];
  c.reportes ??= [];
  c.planSoporte ??= 'basic';
  c.casos ??= [];
  c.advisor ??= { revisado: null, resultados: {} };
  c.advisor.resultados ??= {};
}

/* =================================================== recursos que cobran */

/** Precio por hora de una instancia (Linux; Windows suma la licencia por vCPU). */
function precioInstancia(inst) {
  const t = tipoInstancia(inst.tipo);
  if (!t) return 0;
  return ami(inst.ami)?.so === 'windows' ? t.precio + PRECIOS.licenciaWindows * t.vcpu : t.precio;
}

const ACTIVO_RDS = new Set(['available', 'backing-up', 'modifying', 'rebooting', 'upgrading', 'storage-optimization', 'configuring-enhanced-monitoring', 'maintenance']);

/** Precio por hora de una instancia de RDS (sin almacenamiento). */
export function precioInstanciaRds({ motor = 'mysql', clase = 'db.t3.micro', multiAz = false, despliegue } = {}) {
  const aurora = String(motor).startsWith('aurora');
  let precio;
  if (aurora) precio = PRECIO_AURORA[clase] ?? 0.082;
  else {
    const p = PRECIO_RDS[clase] ?? [0.068, 0.072];
    precio = String(motor).startsWith('postgres') ? p[1] : p[0];
  }
  if (despliegue === 'cluster') return precio * 3;
  return multiAz || despliegue === 'multi' ? precio * 2 : precio;
}

/**
 * Lo que cobra la cuenta EN ESTE MOMENTO, recurso por recurso. Función pura.
 * Cada elemento: { servicio, uso, precio, unidad, porHora, etiquetas, recurso }.
 * El costo de una hora simulada es precio × porHora (porHora = 1 para lo que
 * cobra por hora; GB / 730 para lo que cobra por GB-mes; 1 / 730 para lo que
 * cobra por mes).
 */
export function recursosFacturables(estado) {
  const lista = [];
  const agregar = (servicio, uso, precio, unidad, porHora, r, etiquetas) => {
    if (!(precio > 0) || !(porHora > 0)) return;
    lista.push({ servicio, uso, precio, unidad, porHora, etiquetas: etiquetas ?? etiquetasDe(r), recurso: r?.id ?? r?.arn ?? r?.nombre ?? null });
  };

  // EC2: instancias prendidas y su IP pública automática.
  for (const inst of estado.instancias ?? []) {
    if (inst.estado !== 'running') continue;
    const etiquetas = etiquetasInstancia(estado, inst);
    agregar('ec2', `BoxUsage:${inst.tipo}`, precioInstancia(inst), 'Hrs', 1, inst, etiquetas);
    if (inst.ipPublica && !inst.eipId) agregar('vpc', 'PublicIPv4:InUseAddress', PRECIOS.ipv4, 'Hrs', 1, inst, etiquetas);
  }
  // EBS: los volúmenes cobran aunque la instancia esté detenida.
  for (const vol of estado.volumenes ?? []) {
    agregar('ec2-otros', USO_EBS[vol.tipo] ?? 'EBS:VolumeUsage.gp3', PRECIO_EBS[vol.tipo] ?? 0.08, 'GB-Mo', Number(vol.tamano || 0) / HORAS_MES, vol);
  }
  for (const snap of estado.snapshots ?? []) {
    if (snap.estado !== 'completed') continue;
    agregar('ec2-otros', 'EBS:SnapshotUsage', PRECIOS.snapshotGb, 'GB-Mo', Number(snap.tamano || 0) / HORAS_MES, snap);
  }
  for (const nat of estado.nats ?? []) {
    if (nat.estado === 'deleted' || nat.estado === 'failed') continue;
    agregar('ec2-otros', 'NatGateway-Hours', PRECIOS.nat, 'Hrs', 1, nat);
  }
  // Las Elastic IP cobran siempre: en uso o sin asociar (ociosas).
  for (const eip of estado.eips ?? []) {
    agregar('vpc', eip.instanciaId || eip.natId ? 'PublicIPv4:InUseAddress' : 'PublicIPv4:IdleAddress', PRECIOS.ipv4, 'Hrs', 1, eip);
  }
  // S3: lo guardado, por clase.
  for (const b of estado.buckets ?? []) {
    const porClase = {};
    for (const o of b.objetos ?? []) if (!o.marcadorBorrado) porClase[o.clase ?? 'STANDARD'] = (porClase[o.clase ?? 'STANDARD'] ?? 0) + Number(o.tamano || 0);
    for (const [clase, bytes] of Object.entries(porClase)) {
      const [precio, uso] = PRECIO_S3[clase] ?? PRECIO_S3.STANDARD;
      agregar('s3', uso, precio, 'GB-Mo', bytes / 1e9 / HORAS_MES, b);
    }
  }
  // ELB.
  for (const lb of estado.elb?.balanceadores ?? []) {
    if (lb.estado === 'failed' || lb.estado === 'deleted') continue;
    if (lb.tipo === 'gateway') agregar('elb', 'LoadBalancerUsage:Gateway', PRECIOS.gwlb, 'Hrs', 1, lb);
    else agregar('elb', lb.tipo === 'network' ? 'LoadBalancerUsage:Network' : 'LoadBalancerUsage', PRECIOS.alb, 'Hrs', 1, lb);
  }
  // RDS: la instancia solo cobra prendida; el almacenamiento, siempre.
  for (const db of estado.rds?.instancias ?? []) {
    if (['deleting', 'deleted', 'failed', 'creating'].includes(db.estado)) continue;
    const clase = db.clase ?? db.claseInstancia ?? 'db.t3.micro';
    const multi = Boolean(db.multiAz ?? db.multiAZ) || db.despliegue === 'multi' || db.despliegue === 'multi-az';
    const cluster = db.despliegue === 'cluster';
    if (ACTIVO_RDS.has(db.estado)) {
      agregar('rds', `${multi || cluster ? 'Multi-AZUsage' : 'InstanceUsage'}:${clase}`, precioInstanciaRds({ motor: db.motor, clase, multiAz: multi, despliegue: cluster ? 'cluster' : undefined }), 'Hrs', 1, db);
    }
    const gb = Number(db.almacenamiento ?? db.almacenamientoGb ?? 20);
    if (!String(db.motor ?? '').startsWith('aurora')) agregar('rds', multi ? 'RDS:Multi-AZ-GP2-Storage' : 'RDS:GP2-Storage', PRECIOS.rdsGb * (multi ? 2 : 1), 'GB-Mo', gb / HORAS_MES, db);
  }
  // ElastiCache.
  for (const c of estado.elasticache?.caches ?? []) {
    if (['deleting', 'deleted', 'creating', 'failed'].includes(c.estado)) continue;
    if (c.serverless || c.tipo === 'serverless') {
      const motor = String(c.motor ?? 'valkey').toLowerCase().replace(/[^a-z]/g, '').replace('redisoss', 'redis');
      agregar('elasticache', `ElastiCache:ServerlessStorage-${motor}`, SERVERLESS_ELASTICACHE[motor] ?? 0.0084, 'Hrs', 1, c);
    } else {
      const tipo = c.tipoNodo ?? c.clase ?? 'cache.t3.micro';
      agregar('elasticache', `NodeUsage:${tipo}`, PRECIO_ELASTICACHE[tipo] ?? 0.068, 'Hrs', Math.max(1, Number(c.nodos ?? c.numNodos ?? 1)), c);
    }
  }
  // DynamoDB: la capacidad provisionada cobra por hora; el on-demand, por petición (casi nada).
  for (const t of estado.dynamodb?.tablas ?? []) {
    if (t.estado === 'DELETING') continue;
    if (t.modo === 'PROVISIONED') {
      agregar('dynamodb', 'WriteCapacityUnit-Hrs', PRECIOS.dynamoWcuHora, 'WCU-Hrs', Number(t.capacidad?.escritura ?? 0), t);
      agregar('dynamodb', 'ReadCapacityUnit-Hrs', PRECIOS.dynamoRcuHora, 'RCU-Hrs', Number(t.capacidad?.lectura ?? 0), t);
    }
  }
  // CloudWatch: alarmas y tableros propios (cobro mensual prorrateado).
  for (const a of estado.cloudwatch?.alarmas ?? []) agregar('cloudwatch', 'CW:AlarmMonitorUsage', PRECIOS.alarma, 'Alarms', 1 / HORAS_MES, a);
  for (const t of estado.cloudwatch?.tableros ?? []) if (!t.automatico) agregar('cloudwatch', 'DashboardsUsageHour-Basic', PRECIOS.tablero, 'Dashboards', 1 / HORAS_MES, t);
  // EFS.
  for (const fs of estado.efs?.sistemas ?? []) {
    if (['deleting', 'deleted'].includes(fs.estado)) continue;
    const gb = Number(fs.tamanoGb ?? (fs.tamano ? fs.tamano / 1e9 : 0.006));
    const unaZona = Boolean(fs.unaZona) || fs.disponibilidad === 'one-zone' || fs.tipo === 'one-zone';
    agregar('efs', unaZona ? 'TimedStorage-Z-ByteHrs' : 'TimedStorage-ByteHrs', unaZona ? PRECIOS.efsUnaZonaGb : PRECIOS.efsGb, 'GB-Mo', gb / HORAS_MES, fs);
  }
  // KMS (solo las llaves del cliente) y Secrets Manager.
  for (const k of estado.kms?.llaves ?? []) {
    if (k.administrada === 'aws' || k.awsManaged || k.administradaPorAws) continue;
    if (['PendingDeletion', 'Deleted'].includes(k.estado)) continue;
    agregar('kms', 'KMS-Keys', PRECIOS.llaveKms, 'Keys', 1 / HORAS_MES, k);
  }
  for (const s of estado.secretos?.secretos ?? []) {
    if (s.borradoEn || s.estado === 'deleted') continue;
    agregar('secretsmanager', 'AWSSecretsManager-Secrets', PRECIOS.secreto, 'Secrets', 1 / HORAS_MES, s);
  }
  // Route 53.
  for (const z of estado.route53?.zonas ?? []) agregar('route53', 'HostedZone', PRECIOS.zonaRoute53, 'HostedZones', 1 / HORAS_MES, z);
  for (const ch of estado.route53?.chequeos ?? []) agregar('route53', 'Health-Check-AWS', PRECIOS.chequeoRoute53, 'HealthChecks', 1 / HORAS_MES, ch);
  // El plan de soporte (el mínimo mensual, prorrateado por hora).
  const plan = planSoporte(estado.costos?.planSoporte);
  if (plan.precio) agregar('soporte', `Support-${plan.id}`, plan.precio / HORAS_MES, 'Hrs', 1, null);
  return lista;
}

/** Cuánto cuesta una hora simulada de la cuenta hoy (opcionalmente filtrado). */
export function tasaPorHora(estado, filtro = {}) {
  return recursosFacturables(estado)
    .filter((r) => coincideFiltro(estado, r, filtro))
    .reduce((s, r) => s + r.precio * r.porHora, 0);
}

/** Texto de un usage type, como en Bills: «$0.0116 per On Demand Linux t2.micro Instance Hour». */
export function descripcionUso(uso, precio) {
  const p = `$${Number(precio) < 0.01 ? Number(precio).toFixed(Number(precio) < 0.001 ? 5 : 4) : Number(precio).toFixed(Number(precio) % 0.01 ? 4 : 2)}`;
  const m = /^BoxUsage:(.+)$/.exec(uso);
  if (m) return `${p} per On Demand Linux ${m[1]} Instance Hour`;
  const rds = /^(InstanceUsage|Multi-AZUsage):(.+)$/.exec(uso);
  if (rds) return `${p} per RDS ${rds[2]} ${rds[1] === 'Multi-AZUsage' ? 'Multi-AZ ' : 'Single-AZ '}instance hour (or partial hour)`;
  const nodo = /^NodeUsage:(.+)$/.exec(uso);
  if (nodo) return `${p} per ${nodo[1]} node-hour (or partial hour)`;
  const fijos = {
    'EBS:VolumeUsage.gp3': `${p} per GB-month of General Purpose (gp3) provisioned storage - US East (Northern Virginia)`,
    'EBS:VolumeUsage.gp2': `${p} per GB-month of General Purpose SSD (gp2) provisioned storage - US East (Northern Virginia)`,
    'EBS:VolumeUsage': `${p} per GB-month of Magnetic provisioned storage - US East (Northern Virginia)`,
    'EBS:SnapshotUsage': `${p} per GB-Month of snapshot data stored - US East (Northern Virginia)`,
    'NatGateway-Hours': `${p} per NAT Gateway Hour`,
    'PublicIPv4:InUseAddress': `${p} per In-use public IPv4 address per hour`,
    'PublicIPv4:IdleAddress': `${p} per Idle public IPv4 address per hour`,
    'TimedStorage-ByteHrs': `${p} per GB - first 50 TB / month of storage used`,
    LoadBalancerUsage: `${p} per Application LoadBalancer-hour (or partial hour)`,
    'LoadBalancerUsage:Network': `${p} per Network LoadBalancer-hour (or partial hour)`,
    'LoadBalancerUsage:Gateway': `${p} per Gateway LoadBalancer-hour (or partial hour)`,
    'RDS:GP2-Storage': `${p} per GB-month of provisioned GP2 storage running MySQL`,
    'RDS:Multi-AZ-GP2-Storage': `${p} per GB-month of provisioned GP2 storage for Multi-AZ deployments`,
    'WriteCapacityUnit-Hrs': `${p} per hour for units of write capacity for a month`,
    'ReadCapacityUnit-Hrs': `${p} per hour for units of read capacity for a month`,
    'CW:AlarmMonitorUsage': `${p} per alarm metric month - first 10 alarm metrics are free`,
    'DashboardsUsageHour-Basic': `${p} per dashboard per month`,
    'KMS-Keys': `${p} per customer managed key per month`,
    'AWSSecretsManager-Secrets': `${p} per secret per month`,
    HostedZone: `${p} per Hosted Zone for the first 25 Hosted Zones`,
    'Health-Check-AWS': `${p} per health check per month for AWS endpoints`
  };
  if (fijos[uso]) return fijos[uso];
  if (uso.startsWith('Support-')) return `AWS Support (${planSoporte(uso.slice(8)).nombre}) - minimum monthly fee, prorated`;
  if (uso.startsWith('TimedStorage')) return `${p} per GB-month of storage`;
  return `${p} per ${uso}`;
}

/* ================================================ histórico sintético */

// Memoria de las líneas sintéticas (función pura de cuenta, inicio y mes).
const memoSintetico = new Map();

/**
 * El gasto sintético de un mes ANTERIOR a que el alumno empezara a usar la
 * cuenta (un poco de EC2, su disco, su IP pública, algo de S3…). Para el mes en
 * que empezó solo cuenta la parte anterior a `costos.inicio`.
 */
function lineasSinteticas(estado, mes) {
  const cuenta = estado.cuenta?.id ?? '123456789012';
  const inicio = Date.parse(estado.costos?.inicio ?? estado.creada ?? '') || 0;
  const clave = `${cuenta}|${inicio}|${mes}`;
  if (memoSintetico.has(clave)) return memoSintetico.get(clave);
  const ini = inicioMes(mes);
  const fin = finMes(mes);
  let lineas = [];
  // Una cuenta tiene historia de 8 meses como máximo antes de su inicio.
  if (inicio && ini < inicio && ini >= inicioMes(sumarMeses(claveMes(inicio), -8))) {
    const fraccion = Math.min(1, (inicio - ini) / (fin - ini));
    const azar = generador(semilla(`${cuenta}|${mes}`));
    const horas = 140 + azar() * 220;
    const base = [
      ['ec2', 'BoxUsage:t2.micro', 0.0116, 'Hrs', horas],
      ['ec2-otros', 'EBS:VolumeUsage.gp3', 0.08, 'GB-Mo', 8 + Math.floor(azar() * 3) * 8],
      ['vpc', 'PublicIPv4:InUseAddress', PRECIOS.ipv4, 'Hrs', horas],
      ['s3', 'TimedStorage-ByteHrs', 0.023, 'GB-Mo', 0.2 + azar() * 2.5]
    ];
    if (azar() > 0.45) base.push(['cloudwatch', 'CW:AlarmMonitorUsage', PRECIOS.alarma, 'Alarms', 1 + Math.floor(azar() * 3)]);
    if (azar() > 0.55) base.push(['ec2-otros', 'EBS:SnapshotUsage', PRECIOS.snapshotGb, 'GB-Mo', 4 + azar() * 8]);
    if (azar() > 0.7) base.push(['vpc', 'PublicIPv4:IdleAddress', PRECIOS.ipv4, 'Hrs', 20 + azar() * 120]);
    // El reparto por día (con algo de ruido), solo de los días antes del inicio.
    const dias = diasDelMes(mes);
    const pesos = [];
    for (let d = 1; d <= dias; d++) {
      const diaIni = ini + (d - 1) * 86_400_000;
      pesos.push(diaIni < inicio ? 0.6 + azar() * 0.8 : 0);
    }
    const suma = pesos.reduce((s, p) => s + p, 0) || 1;
    lineas = base.map(([servicio, uso, precio, unidad, cantidadMes]) => {
      const cantidad = cantidadMes * fraccion;
      const costo = cantidad * precio;
      const porDia = {};
      pesos.forEach((p, i) => {
        if (p) porDia[dos(i + 1)] = r6((costo * p) / suma);
      });
      return { servicio, uso, precio, unidad, cantidad: r6(cantidad), costo: r6(costo), etiquetas: {}, dias: porDia, sintetica: true };
    });
  }
  if (memoSintetico.size > 400) memoSintetico.clear();
  memoSintetico.set(clave, lineas);
  return lineas;
}

/** Todas las líneas de cobro de un mes: el histórico sintético más el uso real. */
export function lineasDelMes(estado, mes) {
  iniciar(estado);
  const c = estado.costos;
  const reales = c.uso.mes === mes ? c.uso.lineas : c.historico.find((h) => h.mes === mes)?.lineas ?? [];
  return [...lineasSinteticas(estado, mes), ...reales];
}

/* ===================================================== filtros y consultas */

/**
 * filtro: { servicios: [id], etiquetas: [{ llave, valor }] (valor '' = sin esa etiqueta),
 *           tiposInstancia: ['t2.micro'], usos: ['BoxUsage:'] (prefijos) }
 */
function coincideFiltro(estado, linea, filtro = {}) {
  if (filtro.servicios?.length) {
    const ids = filtro.servicios.flatMap((s) => idsDeServicio(s));
    if (!ids.includes(linea.servicio)) return false;
  }
  if (filtro.etiquetas?.length) {
    // Como en AWS: solo cuentan las etiquetas activadas para asignación de costos.
    const activas = estado.costos?.etiquetasActivas ?? [];
    const porLlave = {};
    for (const e of filtro.etiquetas) (porLlave[e.llave] ??= []).push(e.valor ?? '');
    for (const [llave, valores] of Object.entries(porLlave)) {
      const v = activas.includes(llave) ? linea.etiquetas?.[llave] ?? '' : '';
      if (!valores.includes(v)) return false;
    }
  }
  if (filtro.tiposInstancia?.length && !filtro.tiposInstancia.includes(tipoDeUso(linea.uso))) return false;
  if (filtro.usos?.length && !filtro.usos.some((u) => linea.uso.startsWith(u))) return false;
  return true;
}

/** El tipo de instancia de un usage type (o 'NoInstanceType'). */
export function tipoDeUso(uso) {
  const m = /^(?:BoxUsage|InstanceUsage|Multi-AZUsage|NodeUsage):(.+)$/.exec(uso ?? '');
  return m ? m[1] : 'NoInstanceType';
}

/** El nombre del grupo de una línea según la dimensión de Cost Explorer. */
function grupoDe(estado, linea, agrupar) {
  if (!agrupar?.tipo) return 'Total';
  switch (agrupar.tipo) {
    case 'SERVICE':
      return servicioCosto(linea.servicio)?.ce ?? linea.servicio;
    case 'USAGE_TYPE':
      return linea.uso;
    case 'INSTANCE_TYPE':
      return tipoDeUso(linea.uso);
    case 'REGION':
      return ['route53', 'cloudfront', 'soporte'].includes(linea.servicio) ? 'global' : 'us-east-1';
    case 'TAG': {
      const activa = (estado.costos?.etiquetasActivas ?? []).includes(agrupar.llave);
      const v = activa ? linea.etiquetas?.[agrupar.llave] : undefined;
      return v ? `${agrupar.llave}$${v}` : `No tag key: ${agrupar.llave}`;
    }
    default:
      return 'Total';
  }
}

/**
 * La consulta de Cost Explorer. Pura.
 *   { desde: 'YYYY-MM' | 'YYYY-MM-DD', hasta, granularidad: 'MONTHLY' | 'DAILY',
 *     agrupar: { tipo: 'SERVICE' | 'TAG' | 'USAGE_TYPE' | 'INSTANCE_TYPE' | 'REGION', llave? } | null,
 *     filtro, metrica: 'costo' | 'cantidad' }
 * → { periodos: [{ clave, total, grupos: { nombre: valor } }], grupos: [nombre] (de mayor a menor), total }
 */
export function consultarCostos(estado, { desde, hasta, granularidad = 'MONTHLY', agrupar = null, filtro = {}, metrica = 'costo' } = {}, ahora = reloj.ahora()) {
  iniciar(estado);
  const hoy = claveDia(ahora);
  const mesHoy = claveMes(ahora);
  const periodos = [];
  const totales = {};
  const sumar = (p, linea, valor) => {
    if (!valor) return;
    const g = grupoDe(estado, linea, agrupar);
    p.grupos[g] = (p.grupos[g] ?? 0) + valor;
    p.total += valor;
    totales[g] = (totales[g] ?? 0) + valor;
  };
  if (granularidad === 'DAILY') {
    const ini = Date.parse(`${(desde ?? hoy).slice(0, 10)}T00:00:00Z`);
    const fin = Date.parse(`${(hasta ?? hoy).slice(0, 10)}T00:00:00Z`);
    for (let t = ini; t <= fin && periodos.length < 92; t += 86_400_000) {
      const dia = claveDia(t);
      const p = { clave: dia, total: 0, grupos: {} };
      for (const linea of lineasDelMes(estado, dia.slice(0, 7))) {
        if (!coincideFiltro(estado, linea, filtro)) continue;
        const costo = linea.dias?.[dia.slice(8, 10)] ?? 0;
        sumar(p, linea, metrica === 'cantidad' ? (linea.costo ? (costo / linea.costo) * linea.cantidad : 0) : costo);
      }
      periodos.push(p);
    }
  } else {
    for (const mes of mesesEntre((desde ?? mesHoy).slice(0, 7), (hasta ?? mesHoy).slice(0, 7))) {
      const p = { clave: mes, total: 0, grupos: {} };
      for (const linea of lineasDelMes(estado, mes)) if (coincideFiltro(estado, linea, filtro)) sumar(p, linea, metrica === 'cantidad' ? linea.cantidad : linea.costo);
      periodos.push(p);
    }
  }
  const grupos = Object.keys(totales).sort((a, b) => totales[b] - totales[a]);
  return { periodos, grupos, totales, total: periodos.reduce((s, p) => s + p.total, 0) };
}

/** Lo gastado en el mes en curso (month-to-date). Con `servicio` (id, nombre o código), solo ese servicio. */
export function costoMensual(estado, { servicio, filtro = {}, mes } = {}, ahora = reloj.ahora()) {
  const f = servicio ? { ...filtro, servicios: [servicio] } : filtro;
  const m = mes ?? claveMes(ahora);
  return lineasDelMes(estado, m)
    .filter((l) => coincideFiltro(estado, l, f))
    .reduce((s, l) => s + l.costo, 0);
}

/** Lo que se pronostica para fin de mes: lo gastado más lo que cuesta la cuenta por hora × horas que faltan. */
export function pronosticoMes(estado, { servicio, filtro = {} } = {}, ahora = reloj.ahora()) {
  const f = servicio ? { ...filtro, servicios: [servicio] } : filtro;
  const faltan = Math.max(0, (finMes(claveMes(ahora)) - ahora) / MS_HORA_REAL);
  return costoMensual(estado, { filtro: f }, ahora) + tasaPorHora(estado, f) * faltan;
}

/** El mismo periodo del mes pasado (para «Last month's cost for same time period»). */
export function costoMesPasadoMismoPeriodo(estado, ahora = reloj.ahora()) {
  const mes = claveMes(ahora);
  const anterior = sumarMeses(mes, -1);
  const fraccion = (ahora - inicioMes(mes)) / (finMes(mes) - inicioMes(mes));
  const diasHasta = Math.ceil(fraccion * diasDelMes(anterior));
  let total = 0;
  for (const l of lineasDelMes(estado, anterior)) {
    for (const [d, c] of Object.entries(l.dias ?? {})) if (Number(d) <= diasHasta) total += c;
  }
  return total;
}

/**
 * La factura de un mes, como Bills: por servicio y, dentro, por usage type.
 * → [{ servicio, nombre, total, usos: [{ uso, descripcion, cantidad, unidad, costo }] }]
 */
export function facturaMes(estado, mes) {
  const porServicio = new Map();
  for (const l of lineasDelMes(estado, mes)) {
    const nombre = servicioCosto(l.servicio)?.factura ?? l.servicio;
    if (!porServicio.has(nombre)) porServicio.set(nombre, { nombre, servicios: new Set(), total: 0, usos: new Map() });
    const s = porServicio.get(nombre);
    s.servicios.add(l.servicio);
    s.total += l.costo;
    const clave = `${l.uso}|${l.precio}`;
    const u = s.usos.get(clave) ?? { uso: l.uso, descripcion: descripcionUso(l.uso, l.precio), cantidad: 0, unidad: l.unidad, costo: 0 };
    u.cantidad += l.cantidad;
    u.costo += l.costo;
    s.usos.set(clave, u);
  }
  return [...porServicio.values()]
    .map((s) => ({ nombre: s.nombre, servicios: [...s.servicios], total: s.total, usos: [...s.usos.values()].sort((a, b) => b.costo - a.costo) }))
    .sort((a, b) => b.total - a.total);
}

/* ============================================================ cobrar */

/** Cierra el mes del acumulador: pasa sus líneas al histórico. */
function cerrarMes(c, mesNuevo) {
  if (c.uso.mes && c.uso.lineas.length) {
    c.historico = c.historico.filter((h) => h.mes !== c.uso.mes);
    c.historico.push({ mes: c.uso.mes, lineas: c.uso.lineas });
    c.historico.sort((a, b) => a.mes.localeCompare(b.mes));
    if (c.historico.length > 12) c.historico.splice(0, c.historico.length - 12);
  }
  c.uso.mes = mesNuevo;
  c.uso.lineas = [];
}

/** Suma al mes lo que costaron los recursos durante `horas` horas simuladas. */
function cobrar(estado, horas, ahora) {
  const c = estado.costos;
  const dia = claveDia(ahora).slice(8, 10);
  const indice = new Map(c.uso.lineas.map((l) => [firma(l), l]));
  for (const r of recursosFacturables(estado)) {
    const cantidad = r.porHora * horas;
    const costo = r.precio * cantidad;
    if (!(costo > 0)) continue;
    const nueva = { servicio: r.servicio, uso: r.uso, precio: r.precio, unidad: r.unidad, etiquetas: r.etiquetas };
    const clave = firma(nueva);
    let l = indice.get(clave);
    if (!l) {
      l = { ...nueva, cantidad: 0, costo: 0, dias: {} };
      c.uso.lineas.push(l);
      indice.set(clave, l);
    }
    l.cantidad = r6(l.cantidad + cantidad);
    l.costo = r6(l.costo + costo);
    l.dias[dia] = r6((l.dias[dia] ?? 0) + costo);
  }
  // Tope de líneas (cada combinación de etiquetas abre una): las más chicas se juntan sin etiquetas.
  if (c.uso.lineas.length > 150) {
    c.uso.lineas.sort((a, b) => b.costo - a.costo);
    const sobran = c.uso.lineas.splice(120);
    for (const s of sobran) {
      const destino = { ...s, etiquetas: {} };
      const clave = firma(destino);
      const l = c.uso.lineas.find((x) => firma(x) === clave);
      if (l) {
        l.cantidad = r6(l.cantidad + s.cantidad);
        l.costo = r6(l.costo + s.costo);
        for (const [d, v] of Object.entries(s.dias)) l.dias[d] = r6((l.dias[d] ?? 0) + v);
      } else c.uso.lineas.push(destino);
    }
  }
}

/* ======================================================= calculadora */

const REDONDEO_CALC = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Precio por hora On-Demand de un tipo para la calculadora. */
export function precioHoraEc2(tipo, sistema = 'linux') {
  const t = tipoInstancia(tipo);
  if (!t) return 0;
  return sistema === 'windows' ? t.precio + PRECIOS.licenciaWindows * t.vcpu : t.precio;
}

/**
 * Lo que cuesta una línea de la calculadora: { mensual, inicial } (dólares, a 2 decimales). Pura.
 * Ver la forma de `config` en la cabecera.
 */
export function precioCalculadora(servicio, config = {}) {
  const n = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  if (servicio === 'ec2') {
    const cantidad = Math.max(0, n(config.cantidad));
    const hora = precioHoraEc2(config.tipo, config.sistema);
    const ebs = cantidad * Math.max(0, n(config.ebsGb)) * (PRECIO_EBS[config.ebsTipo ?? 'gp3'] ?? 0.08);
    let mensual = 0;
    let inicial = 0;
    const pago = config.pago ?? 'ondemand';
    if (pago === 'ondemand') {
      const util = Math.min(100, Math.max(0, n(config.utilizacion, 100)));
      mensual = cantidad * hora * HORAS_MES * (util / 100);
    } else if (pago === 'spot') {
      const desc = Math.min(100, Math.max(0, n(config.descuentoSpot, 70)));
      mensual = cantidad * hora * HORAS_MES * (1 - desc / 100);
    } else {
      const plazo = Number(config.plazo) === 3 ? 3 : 1;
      const opcion = ['none', 'partial', 'all'].includes(config.opcionPago) ? config.opcionPago : 'none';
      const factor = FACTORES_AHORRO[pago]?.[plazo]?.[opcion] ?? 1;
      const totalPlazo = cantidad * hora * factor * HORAS_MES * 12 * plazo;
      if (opcion === 'none') mensual = totalPlazo / (12 * plazo);
      else if (opcion === 'partial') {
        inicial = totalPlazo / 2;
        mensual = totalPlazo / 2 / (12 * plazo);
      } else inicial = totalPlazo;
    }
    return { mensual: REDONDEO_CALC(mensual + ebs), inicial: REDONDEO_CALC(inicial) };
  }
  if (servicio === 's3') {
    const [precio] = PRECIO_S3[config.clase ?? 'STANDARD'] ?? PRECIO_S3.STANDARD;
    const mensual = Math.max(0, n(config.gb)) * precio + (Math.max(0, n(config.put)) / 1000) * 0.005 + (Math.max(0, n(config.get)) / 1000) * 0.0004;
    return { mensual: REDONDEO_CALC(mensual), inicial: 0 };
  }
  if (servicio === 'rds') {
    const cantidad = Math.max(0, n(config.cantidad, 1));
    const util = Math.min(100, Math.max(0, n(config.utilizacion, 100)));
    const hora = precioInstanciaRds({ motor: config.motor, clase: config.clase, despliegue: config.despliegue });
    const gb = Math.max(0, n(config.almacenamientoGb, 20)) * PRECIOS.rdsGb * (config.despliegue === 'multi' ? 2 : 1) * cantidad;
    if (config.pago === 'reserved') {
      const plazo = Number(config.plazo) === 3 ? 3 : 1;
      const opcion = ['none', 'partial', 'all'].includes(config.opcionPago) ? config.opcionPago : 'none';
      const total = cantidad * hora * (FACTORES_AHORRO['rds-ri'][plazo][opcion] ?? 1) * HORAS_MES * 12 * plazo;
      if (opcion === 'none') return { mensual: REDONDEO_CALC(total / (12 * plazo) + gb), inicial: 0 };
      if (opcion === 'partial') return { mensual: REDONDEO_CALC(total / 2 / (12 * plazo) + gb), inicial: REDONDEO_CALC(total / 2) };
      return { mensual: REDONDEO_CALC(gb), inicial: REDONDEO_CALC(total) };
    }
    return { mensual: REDONDEO_CALC(cantidad * hora * HORAS_MES * (util / 100) + gb), inicial: 0 };
  }
  if (servicio === 'dynamodb') {
    const almacen = Math.max(0, n(config.gb)) * PRECIOS.dynamoGb;
    if (config.modo === 'provisioned') {
      const mensual = Math.max(0, n(config.wcu)) * PRECIOS.dynamoWcuHora * HORAS_MES + Math.max(0, n(config.rcu)) * PRECIOS.dynamoRcuHora * HORAS_MES + almacen;
      return { mensual: REDONDEO_CALC(mensual), inicial: 0 };
    }
    const mensual = Math.max(0, n(config.escriturasMillones)) * PRECIOS.dynamoEscrituraMillon + Math.max(0, n(config.lecturasMillones)) * PRECIOS.dynamoLecturaMillon + almacen;
    return { mensual: REDONDEO_CALC(mensual), inicial: 0 };
  }
  throw errorAws('ValidationException', `The service ${servicio} is not supported by this estimate.`);
}

/** Lo que valida la calculadora antes de guardar una línea (los mismos textos que la consola). */
function validarConfig(servicio, config) {
  const entero = (v) => Number.isInteger(Number(v)) && Number(v) >= 0;
  if (servicio === 'ec2') {
    if (!tipoInstancia(config.tipo)) throw errorAws('ValidationException', 'Select an instance type.');
    if (!entero(config.cantidad) || Number(config.cantidad) < 1) throw errorAws('ValidationException', 'Number of instances must be a whole number greater than 0.');
    if (Number(config.cantidad) > 10000) throw errorAws('ValidationException', 'Number of instances must be 10,000 or less.');
    if (!['ondemand', 'compute-sp', 'ec2-sp', 'spot'].includes(config.pago ?? 'ondemand')) throw errorAws('ValidationException', 'Select a payment option.');
  }
  if (servicio === 'rds' && !PRECIO_RDS[config.clase] && !PRECIO_AURORA[config.clase]) throw errorAws('ValidationException', 'Select a DB instance class.');
  if (servicio === 'rds' && (!entero(config.cantidad) || Number(config.cantidad) < 1)) throw errorAws('ValidationException', 'Nodes must be a whole number greater than 0.');
  for (const [k, v] of Object.entries(config)) {
    if (typeof v === 'number' && (!Number.isFinite(v) || v < 0)) throw errorAws('ValidationException', `Enter a valid value for ${k}.`);
  }
}

const estimacionOError = (estado, id) => {
  const est = estado.costos.estimaciones.find((e) => e.id === id);
  if (!est) throw errorAws('ResourceNotFoundException', `Workload estimate ${id} not found.`);
  return est;
};

/** «Create estimate»: una estimación vacía (My Estimate). */
export function crearEstimacion(estado, { nombre = 'My Estimate' } = {}) {
  iniciar(estado);
  const n = nombreLimpio(nombre, 100) || 'My Estimate';
  if (estado.costos.estimaciones.length >= 20) throw errorAws('ServiceQuotaExceededException', 'You can save up to 20 estimates.');
  const est = { id: `${hexAzar(8)}-${hexAzar(4)}-${hexAzar(4)}-${hexAzar(4)}-${hexAzar(12)}`, nombre: n, creada: iso(), modificada: iso(), grupos: [], servicios: [] };
  estado.costos.estimaciones.push(est);
  anotar(estado, 'PricingCalculator', 'CreateWorkloadEstimate', `«${n}»`);
  return est;
}

export function editarEstimacion(estado, id, { nombre } = {}) {
  iniciar(estado);
  const est = estimacionOError(estado, id);
  if (nombre !== undefined) {
    const n = nombreLimpio(nombre, 100);
    if (!n) throw errorAws('ValidationException', 'Estimate name is required.');
    est.nombre = n;
  }
  est.modificada = iso();
  anotar(estado, 'PricingCalculator', 'UpdateWorkloadEstimate', `«${est.nombre}»`);
  return est;
}

export function eliminarEstimacion(estado, id) {
  iniciar(estado);
  const est = estimacionOError(estado, id);
  estado.costos.estimaciones = estado.costos.estimaciones.filter((e) => e !== est);
  anotar(estado, 'PricingCalculator', 'DeleteWorkloadEstimate', `«${est.nombre}»`);
}

export function agregarGrupoEstimacion(estado, id, { nombre } = {}) {
  iniciar(estado);
  const est = estimacionOError(estado, id);
  const n = nombreLimpio(nombre, 100);
  if (!n) throw errorAws('ValidationException', 'Group name is required.');
  if (est.grupos.some((g) => g.nombre.toLowerCase() === n.toLowerCase())) throw errorAws('ValidationException', `A group named "${n}" already exists in this estimate.`);
  const g = { id: hexAzar(10), nombre: n };
  est.grupos.push(g);
  est.modificada = iso();
  anotar(estado, 'PricingCalculator', 'UpdateWorkloadEstimate', `«${est.nombre}»: grupo «${n}»`);
  return g;
}

/** Borra un grupo; sus servicios pasan a «sin grupo» (o se borran con `conServicios`). */
export function eliminarGrupoEstimacion(estado, id, grupoId, { conServicios = false } = {}) {
  iniciar(estado);
  const est = estimacionOError(estado, id);
  if (!est.grupos.some((g) => g.id === grupoId)) throw errorAws('ResourceNotFoundException', 'Group not found.');
  est.grupos = est.grupos.filter((g) => g.id !== grupoId);
  if (conServicios) est.servicios = est.servicios.filter((s) => s.grupoId !== grupoId);
  else for (const s of est.servicios) if (s.grupoId === grupoId) s.grupoId = null;
  est.modificada = iso();
  return est;
}

/**
 * «Save and add service» / «Save and view summary»: agrega (o, con `lineaId`,
 * reemplaza) un servicio de la estimación. Calcula su costo mensual e inicial.
 */
export function guardarServicioEstimacion(estado, id, { lineaId, servicio, descripcion = '', grupoId = null, region = 'us-east-1', config = {} } = {}) {
  iniciar(estado);
  const est = estimacionOError(estado, id);
  if (!['ec2', 's3', 'rds', 'dynamodb'].includes(servicio)) throw errorAws('ValidationException', 'Select a service.');
  if (region !== 'us-east-1') throw errorAws('ValidationException', 'This simulator only prices US East (N. Virginia).');
  if (grupoId && !est.grupos.some((g) => g.id === grupoId)) throw errorAws('ResourceNotFoundException', 'Group not found.');
  const cfg = JSON.parse(JSON.stringify(config ?? {}));
  for (const k of Object.keys(cfg)) if (typeof cfg[k] === 'string' && cfg[k].trim() !== '' && /^-?\d+(\.\d+)?$/.test(cfg[k].trim())) cfg[k] = Number(cfg[k]);
  validarConfig(servicio, cfg);
  const { mensual, inicial } = precioCalculadora(servicio, cfg);
  const datos = { servicio, descripcion: nombreLimpio(descripcion, 200), grupoId: grupoId || null, region, config: cfg, mensual, inicial };
  let linea;
  if (lineaId) {
    linea = est.servicios.find((s) => s.id === lineaId);
    if (!linea) throw errorAws('ResourceNotFoundException', 'Service not found in this estimate.');
    Object.assign(linea, datos);
  } else {
    if (est.servicios.length >= 50) throw errorAws('ServiceQuotaExceededException', 'An estimate can have up to 50 services.');
    linea = { id: hexAzar(10), ...datos };
    est.servicios.push(linea);
  }
  est.modificada = iso();
  anotar(estado, 'PricingCalculator', 'BatchCreateWorkloadEstimateUsage', `«${est.nombre}»: ${servicio} ${mensual.toFixed(2)} USD/mes`);
  return linea;
}

export function eliminarServicioEstimacion(estado, id, lineaIds = []) {
  iniciar(estado);
  const est = estimacionOError(estado, id);
  const ids = [lineaIds].flat();
  est.servicios = est.servicios.filter((s) => !ids.includes(s.id));
  est.modificada = iso();
  anotar(estado, 'PricingCalculator', 'BatchDeleteWorkloadEstimateUsage', `«${est.nombre}»: ${ids.length} servicio(s)`);
  return est;
}

export function moverServicioEstimacion(estado, id, lineaIds = [], grupoId = null) {
  iniciar(estado);
  const est = estimacionOError(estado, id);
  if (grupoId && !est.grupos.some((g) => g.id === grupoId)) throw errorAws('ResourceNotFoundException', 'Group not found.');
  for (const s of est.servicios) if ([lineaIds].flat().includes(s.id)) s.grupoId = grupoId || null;
  est.modificada = iso();
  return est;
}

export function duplicarServicioEstimacion(estado, id, lineaId) {
  iniciar(estado);
  const est = estimacionOError(estado, id);
  const s = est.servicios.find((x) => x.id === lineaId);
  if (!s) throw errorAws('ResourceNotFoundException', 'Service not found in this estimate.');
  const copia = { ...JSON.parse(JSON.stringify(s)), id: hexAzar(10) };
  est.servicios.push(copia);
  est.modificada = iso();
  return copia;
}

/** Totales de una estimación: { inicial, mensual, anual } (12 meses incluye lo inicial). */
export function totalesEstimacion(est, grupoId) {
  const lineas = (est?.servicios ?? []).filter((s) => grupoId === undefined || s.grupoId === grupoId);
  const inicial = r2(lineas.reduce((s, l) => s + l.inicial, 0));
  const mensual = r2(lineas.reduce((s, l) => s + l.mensual, 0));
  return { inicial, mensual, anual: r2(inicial + mensual * 12) };
}

/* ============================================================== Budgets */

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const presupuestoOError = (estado, nombre) => {
  const p = estado.costos.presupuestos.find((x) => x.nombre === nombre);
  if (!p) throw errorAws('NotFoundException', `Unable to get budget: ${nombre} - the budget doesn't exist.`);
  return p;
};

function normalizarAlertas(alertas = []) {
  if (alertas.length > 5) throw errorAws('InvalidParameterException', 'You can configure up to 5 alerts per budget.');
  return alertas.map((a) => {
    const umbral = Number(a.umbral);
    if (!Number.isFinite(umbral) || umbral <= 0) throw errorAws('InvalidParameterException', 'Alert threshold must be greater than 0.');
    const tipoUmbral = a.tipoUmbral === 'ABSOLUTE_VALUE' ? 'ABSOLUTE_VALUE' : 'PERCENTAGE';
    if (tipoUmbral === 'PERCENTAGE' && umbral > 1000000) throw errorAws('InvalidParameterException', 'Alert threshold percentage is too large.');
    const correos = [...new Set((a.correos ?? []).map((c) => String(c).trim()).filter(Boolean))];
    for (const c of correos) if (!CORREO.test(c)) throw errorAws('InvalidParameterException', `Invalid email address: ${c}`);
    if (correos.length > 10) throw errorAws('InvalidParameterException', 'You can add up to 10 email recipients per alert.');
    const temaSns = a.temaSns ? String(a.temaSns).trim() : null;
    if (temaSns && !/^arn:aws:sns:[a-z0-9-]+:\d{12}:[\w-]+(\.fifo)?$/.test(temaSns)) throw errorAws('InvalidParameterException', `Invalid Amazon SNS topic ARN: ${temaSns}`);
    if (!correos.length && !temaSns) throw errorAws('InvalidParameterException', 'Each alert needs at least one email recipient or an Amazon SNS topic.');
    return {
      id: a.id ?? hexAzar(8),
      umbral,
      tipoUmbral,
      disparador: a.disparador === 'FORECASTED' ? 'FORECASTED' : 'ACTUAL',
      correos,
      temaSns,
      periodo: a.periodo ?? null,
      disparadaEn: a.disparadaEn ?? null
    };
  });
}

/**
 * «Create budget». p: { nombre, tipo, plantilla, periodo, renovacion, monto, filtros, alertas }.
 * Las plantillas llenan lo que falte:
 *   'zero'    → Zero spend budget: monto 1.00 y alerta ACTUAL > $0.01.
 *   'mensual' → Monthly cost budget: alertas ACTUAL 85 %, ACTUAL 100 % y FORECASTED 100 % a los correos.
 */
export function crearPresupuesto(estado, p = {}) {
  iniciar(estado);
  const datos = prepararPresupuesto(estado, p);
  if (estado.costos.presupuestos.some((x) => x.nombre === datos.nombre)) {
    throw errorAws('DuplicateRecordException', `Error creating budget: the budget ${datos.nombre} already exists.`);
  }
  if (estado.costos.presupuestos.length >= 50) throw errorAws('ServiceQuotaExceededException', 'You have reached the maximum number of budgets for this account.');
  const b = { ...datos, arn: `arn:aws:budgets::${estado.cuenta.id}:budget/${datos.nombre}`, creado: iso(), modificado: iso() };
  estado.costos.presupuestos.push(b);
  anotar(estado, 'Budgets', 'CreateBudget', `«${b.nombre}» ${b.tipo} ${b.periodo} ${b.monto} USD, ${b.alertas.length} alerta(s)`);
  return b;
}

function prepararPresupuesto(estado, p) {
  const nombre = nombreLimpio(p.nombre, 101);
  if (!nombre) throw errorAws('InvalidParameterException', 'Budget name is required.');
  if (nombre.length > 100) throw errorAws('InvalidParameterException', 'Budget name must be 100 characters or less.');
  if (/[:\\]/.test(nombre)) throw errorAws('InvalidParameterException', "Budget name can't contain the characters : and \\.");
  const plantilla = ['zero', 'mensual', 'sp-cobertura', 'ri-utilizacion'].includes(p.plantilla) ? p.plantilla : null;
  let tipo = ['COST', 'USAGE', 'SAVINGS_PLANS_COVERAGE', 'SAVINGS_PLANS_UTILIZATION', 'RI_UTILIZATION', 'RI_COVERAGE'].includes(p.tipo) ? p.tipo : 'COST';
  let periodo = ['MONTHLY', 'QUARTERLY', 'ANNUALLY', 'DAILY'].includes(p.periodo) ? p.periodo : 'MONTHLY';
  let monto = Number(p.monto);
  let alertas = p.alertas ?? [];
  const correos = (p.correos ?? []).map((c) => String(c).trim()).filter(Boolean);
  if (plantilla === 'zero') {
    tipo = 'COST';
    periodo = 'MONTHLY';
    monto = 1;
    if (!correos.length) throw errorAws('InvalidParameterException', 'Enter at least one email recipient.');
    alertas = [{ umbral: 0.01, tipoUmbral: 'ABSOLUTE_VALUE', disparador: 'ACTUAL', correos }];
  } else if (plantilla === 'mensual') {
    tipo = 'COST';
    periodo = 'MONTHLY';
    if (!correos.length) throw errorAws('InvalidParameterException', 'Enter at least one email recipient.');
    alertas = [
      { umbral: 85, disparador: 'ACTUAL', correos },
      { umbral: 100, disparador: 'ACTUAL', correos },
      { umbral: 100, disparador: 'FORECASTED', correos }
    ];
  } else if (plantilla === 'sp-cobertura' || plantilla === 'ri-utilizacion') {
    tipo = plantilla === 'sp-cobertura' ? 'SAVINGS_PLANS_COVERAGE' : 'RI_UTILIZATION';
    periodo = 'DAILY';
    monto = 80;
    if (!correos.length) throw errorAws('InvalidParameterException', 'Enter at least one email recipient.');
    alertas = [{ umbral: 100, disparador: 'ACTUAL', correos }];
  }
  if (!Number.isFinite(monto) || monto <= 0) throw errorAws('InvalidParameterException', 'Budget amount must be greater than 0.');
  if ((tipo.endsWith('COVERAGE') || tipo.endsWith('UTILIZATION')) && monto > 100) throw errorAws('InvalidParameterException', 'The target percentage must be between 0 and 100.');
  const filtros = {
    servicios: [...new Set((p.filtros?.servicios ?? []).map((s) => servicioCosto(s)?.id).filter(Boolean))],
    etiquetas: (p.filtros?.etiquetas ?? []).filter((e) => e?.llave).map((e) => ({ llave: String(e.llave), valor: String(e.valor ?? '') }))
  };
  return {
    nombre,
    tipo,
    plantilla,
    periodo,
    renovacion: p.renovacion === 'EXPIRING' ? 'EXPIRING' : 'RECURRING',
    metodo: 'FIXED',
    monto: r2(monto),
    unidad: tipo === 'USAGE' ? 'Hrs' : tipo === 'COST' ? 'USD' : 'PERCENTAGE',
    filtros,
    alertas: normalizarAlertas(alertas)
  };
}

/** «Edit budget»: se reemplaza todo menos el nombre (en AWS el nombre no se cambia). */
export function editarPresupuesto(estado, nombre, p = {}) {
  iniciar(estado);
  const b = presupuestoOError(estado, nombre);
  const datos = prepararPresupuesto(estado, { ...b, ...p, nombre: b.nombre, plantilla: null, correos: undefined });
  // Las alertas que ya se dispararon este periodo se quedan disparadas.
  datos.alertas = datos.alertas.map((a) => {
    const vieja = b.alertas.find((x) => x.id === a.id);
    return vieja ? { ...a, periodo: vieja.periodo, disparadaEn: vieja.disparadaEn } : a;
  });
  Object.assign(b, datos, { modificado: iso() });
  anotar(estado, 'Budgets', 'UpdateBudget', `«${b.nombre}» ${b.monto} USD, ${b.alertas.length} alerta(s)`);
  return b;
}

export function eliminarPresupuesto(estado, nombres = []) {
  iniciar(estado);
  for (const n of [nombres].flat()) {
    const b = presupuestoOError(estado, n);
    estado.costos.presupuestos = estado.costos.presupuestos.filter((x) => x !== b);
    anotar(estado, 'Budgets', 'DeleteBudget', `«${n}»`);
  }
}

/** La clave del periodo del presupuesto en el que estamos ('2026-11', '2026-Q4', '2026', '2026-11-02'). */
function periodoPresupuesto(b, ahora) {
  const mes = claveMes(ahora);
  if (b.periodo === 'DAILY') return claveDia(ahora);
  if (b.periodo === 'QUARTERLY') return `${mes.slice(0, 4)}-Q${Math.floor((Number(mes.slice(5, 7)) - 1) / 3) + 1}`;
  if (b.periodo === 'ANNUALLY') return mes.slice(0, 4);
  return mes;
}

/** Los meses del periodo (para trimestral y anual) y las horas que le faltan. */
function rangoPeriodo(b, ahora) {
  const mes = claveMes(ahora);
  if (b.periodo === 'DAILY') {
    const finDia = Date.parse(`${claveDia(ahora)}T00:00:00Z`) + 86_400_000;
    return { meses: [mes], dia: claveDia(ahora), fin: finDia };
  }
  if (b.periodo === 'QUARTERLY') {
    const primero = `${mes.slice(0, 4)}-${dos(Math.floor((Number(mes.slice(5, 7)) - 1) / 3) * 3 + 1)}`;
    return { meses: mesesEntre(primero, mes), fin: finMes(sumarMeses(primero, 2)) };
  }
  if (b.periodo === 'ANNUALLY') return { meses: mesesEntre(`${mes.slice(0, 4)}-01`, mes), fin: finMes(`${mes.slice(0, 4)}-12`) };
  return { meses: [mes], fin: finMes(mes) };
}

/**
 * Cómo va un presupuesto ahora. Pura.
 * → { usado, pronostico, porcentajeUsado, porcentajePronostico, excedido,
 *     alertas: [{ ...alerta, valorUmbral, excedida }] }
 * Para COST, `usado` y `pronostico` son dólares; para USAGE, horas de EC2;
 * para los de cobertura/utilización, porcentajes (sin Savings Plans ni reservas: 0 %).
 */
export function estadoPresupuesto(estado, b, ahora = reloj.ahora()) {
  iniciar(estado);
  let usado = 0;
  let pronostico = 0;
  if (b.tipo === 'COST' || b.tipo === 'USAGE') {
    const { meses, dia, fin } = rangoPeriodo(b, ahora);
    const filtro = { servicios: b.filtros?.servicios, etiquetas: b.filtros?.etiquetas, usos: b.tipo === 'USAGE' ? ['BoxUsage:'] : undefined };
    const valor = (l) => (b.tipo === 'USAGE' ? l.cantidad : l.costo);
    for (const mes of meses) {
      for (const l of lineasDelMes(estado, mes)) {
        if (!coincideFiltro(estado, l, filtro)) continue;
        if (dia) usado += b.tipo === 'USAGE' ? (l.costo ? ((l.dias?.[dia.slice(8, 10)] ?? 0) / l.costo) * l.cantidad : 0) : l.dias?.[dia.slice(8, 10)] ?? 0;
        else usado += valor(l);
      }
    }
    const faltan = Math.max(0, (fin - ahora) / MS_HORA_REAL);
    const porHora = recursosFacturables(estado)
      .filter((r) => coincideFiltro(estado, r, filtro))
      .reduce((s, r) => s + (b.tipo === 'USAGE' ? r.porHora : r.precio * r.porHora), 0);
    pronostico = usado + porHora * faltan;
  }
  const esPorcentaje = b.unidad === 'PERCENTAGE';
  const alertas = (b.alertas ?? []).map((a) => {
    const valorUmbral = a.tipoUmbral === 'ABSOLUTE_VALUE' || esPorcentaje ? a.umbral : (b.monto * a.umbral) / 100;
    const medido = a.disparador === 'FORECASTED' ? pronostico : usado;
    // Cobertura y utilización avisan cuando quedan POR DEBAJO de la meta.
    let excedida;
    if (esPorcentaje) {
      const hayUsoElegible = b.tipo.startsWith('SAVINGS') ? tasaPorHora(estado, { servicios: ['ec2'] }) > 0 : (estado.rds?.instancias ?? []).length > 0;
      excedida = hayUsoElegible && usado < (b.monto * a.umbral) / 100;
    } else excedida = medido > valorUmbral;
    return { ...a, valorUmbral, excedida };
  });
  return {
    usado,
    pronostico,
    porcentajeUsado: b.monto ? (usado / b.monto) * 100 : 0,
    porcentajePronostico: b.monto ? (pronostico / b.monto) * 100 : 0,
    excedido: alertas.some((a) => a.excedida),
    alertas
  };
}

/** Escribe un correo en el buzón simulado (el de SNS) y, si hay tema, publica en él. */
function enviarCorreo(estado, { para, asunto, cuerpo, origen, temaSns }) {
  const de = 'AWS Budgets <budgets@costalerts.amazonaws.com>';
  for (const destino of para) {
    // Primero con la función del buzón (modelo/mensajeria.js); si no está, directo.
    let hecho;
    try {
      hecho = llamar('correoAlBuzon', estado, { de, para: destino, asunto, cuerpo, origen, enlaces: [] });
    } catch {
      hecho = undefined;
    }
    if (hecho) continue;
    estado.sns ??= { temas: [], buzon: [] };
    estado.sns.buzon ??= [];
    estado.sns.buzon.unshift({ id: hexAzar(12), de, para: destino, asunto, cuerpo, fecha: iso(), leido: false, origen, enlaces: [] });
    if (estado.sns.buzon.length > 60) estado.sns.buzon.length = 60;
  }
  if (temaSns) {
    try {
      llamar('publicarEnTema', estado, temaSns, { asunto, mensaje: cuerpo, origen });
    } catch {
      /* un tema que ya no existe no detiene la alerta por correo */
    }
  }
}

function avisarPresupuesto(estado, b, a, est) {
  const tipo = { COST: 'Cost', USAGE: 'Usage', SAVINGS_PLANS_COVERAGE: 'Savings Plans Coverage', RI_UTILIZATION: 'Reservation Utilization' }[b.tipo] ?? b.tipo;
  const fmt = (n) => (b.unidad === 'USD' ? dinero(n) : b.unidad === 'Hrs' ? `${r2(n)} Hrs` : `${r2(n)}%`);
  const medido = a.disparador === 'FORECASTED' ? est.pronostico : est.usado;
  const periodo = { MONTHLY: 'the current month', QUARTERLY: 'the current quarter', ANNUALLY: 'the current year', DAILY: 'the current day' }[b.periodo];
  const asunto =
    a.disparador === 'FORECASTED' ? `AWS Budgets: ${b.nombre} is forecasted to exceed your alert threshold` : `AWS Budgets: ${b.nombre} has exceeded your alert threshold`;
  const cuerpo = [
    'Dear AWS Customer,',
    '',
    a.disparador === 'FORECASTED'
      ? `You requested that we alert you when the FORECASTED ${tipo} associated with your ${b.nombre} budget is greater than ${fmt(a.valorUmbral)} for ${periodo}. The FORECASTED ${tipo} associated with this budget is ${fmt(medido)}. You can find additional details below and by accessing the AWS Budgets dashboard.`
      : `You requested that we alert you when the ACTUAL ${tipo} associated with your ${b.nombre} budget is greater than ${fmt(a.valorUmbral)} for ${periodo}. The ACTUAL ${tipo} associated with this budget is ${fmt(medido)}. You can find additional details below and by accessing the AWS Budgets dashboard.`,
    '',
    `Budget Name: ${b.nombre}`,
    `Budget Type: ${tipo}`,
    `Budgeted Amount: ${fmt(b.monto)}`,
    `Alert Type: ${a.disparador}`,
    `Alert Threshold: > ${fmt(a.valorUmbral)}${a.tipoUmbral === 'PERCENTAGE' && b.unidad === 'USD' ? ` (${a.umbral.toFixed(2)}%)` : ''}`,
    `${a.disparador} Amount: ${fmt(medido)}`
  ].join('\n');
  enviarCorreo(estado, { para: a.correos, asunto, cuerpo, origen: 'budgets', temaSns: a.temaSns });
  anotar(estado, 'Budgets', 'Notification', `«${b.nombre}» ${a.disparador} > ${fmt(a.valorUmbral)}: ${fmt(medido)}`);
}

/** Revisa las alertas de todos los presupuestos. Devuelve true si se disparó alguna. */
function revisarPresupuestos(estado, ahora) {
  let cambio = false;
  for (const b of estado.costos.presupuestos) {
    const periodo = periodoPresupuesto(b, ahora);
    const est = estadoPresupuesto(estado, b, ahora);
    for (const a of est.alertas) {
      const original = b.alertas.find((x) => x.id === a.id);
      if (!original || !a.excedida || original.periodo === periodo) continue;
      original.periodo = periodo;
      original.disparadaEn = iso(ahora);
      avisarPresupuesto(estado, b, a, est);
      cambio = true;
    }
  }
  return cambio;
}

/* =================================================== etiquetas de costos */

/**
 * Las llaves de etiquetas que existen en la cuenta (Cost allocation tags). Pura.
 * → [{ llave, tipo: 'user' | 'aws', activa, actualizada, ultimoUso: 'YYYY-MM' | null }]
 */
export function etiquetasDeCostos(estado, ahora = reloj.ahora()) {
  iniciar(estado);
  const c = estado.costos;
  const llaves = new Map(); // llave → último mes en que se usó (o null)
  const visto = (llave, mes) => {
    if (!llave || llave.startsWith('aws:')) return;
    const previo = llaves.get(llave) ?? null;
    llaves.set(llave, mes && (!previo || previo < mes) ? mes : previo);
  };
  const mes = claveMes(ahora);
  const recursos = [
    ...(estado.instancias ?? []).filter((i) => i.estado !== 'terminated'),
    ...(estado.volumenes ?? []),
    ...(estado.snapshots ?? []),
    ...(estado.buckets ?? []),
    ...(estado.vpcs ?? []),
    ...(estado.subredes ?? []),
    ...(estado.eips ?? []),
    ...(estado.nats ?? []),
    ...(estado.elb?.balanceadores ?? []),
    ...(estado.elb?.gruposDestino ?? []),
    ...(estado.rds?.instancias ?? []),
    ...(estado.dynamodb?.tablas ?? []),
    ...(estado.lambda?.funciones ?? []),
    ...(estado.efs?.sistemas ?? []),
    ...(estado.secretos?.secretos ?? []),
    ...(estado.autoscaling?.grupos ?? [])
  ];
  for (const r of recursos) for (const llave of Object.keys(String(r.id ?? '').startsWith('i-') ? etiquetasInstancia(estado, r) : etiquetasDe(r))) visto(llave, mes);
  for (const l of c.uso.lineas) for (const llave of Object.keys(l.etiquetas ?? {})) visto(llave, c.uso.mes);
  for (const llave of c.etiquetasActivas) visto(llave, null);
  const usuario = [...llaves.entries()].map(([llave, ultimoUso]) => ({ llave, tipo: 'user', activa: c.etiquetasActivas.includes(llave), actualizada: c.etiquetasFechas[llave] ?? null, ultimoUso }));
  const deAws = ETIQUETAS_AWS.map((llave) => ({ llave, tipo: 'aws', activa: c.etiquetasActivas.includes(llave), actualizada: c.etiquetasFechas[llave] ?? null, ultimoUso: llave === 'aws:autoscaling:groupName' && (estado.autoscaling?.grupos ?? []).length ? mes : null }));
  return [...usuario.sort((a, b) => a.llave.localeCompare(b.llave)), ...deAws];
}

/** «Activate» / «Deactivate» en Cost allocation tags. */
export function cambiarEtiquetasCosto(estado, llaves = [], activar = true) {
  iniciar(estado);
  const c = estado.costos;
  const lista = [llaves].flat().map((l) => String(l).trim()).filter(Boolean);
  if (!lista.length) throw errorAws('ValidationException', 'Select at least one tag key.');
  if (lista.length > 20) throw errorAws('ValidationException', 'You can update up to 20 tag keys at a time.');
  const existentes = new Set(etiquetasDeCostos(estado).map((e) => e.llave));
  for (const l of lista) {
    if (!existentes.has(l)) throw errorAws('ValidationException', `Tag key ${l} was not found. Tag keys appear here after you use them on a resource.`);
    if (activar && !c.etiquetasActivas.includes(l)) c.etiquetasActivas.push(l);
    if (!activar) c.etiquetasActivas = c.etiquetasActivas.filter((x) => x !== l);
    c.etiquetasFechas[l] = iso();
  }
  anotar(estado, 'CostExplorer', 'UpdateCostAllocationTagsStatus', `${activar ? 'Active' : 'Inactive'}: ${lista.join(', ')}`);
  return lista;
}
export const activarEtiquetasCosto = (estado, llaves) => cambiarEtiquetasCosto(estado, llaves, true);
export const desactivarEtiquetasCosto = (estado, llaves) => cambiarEtiquetasCosto(estado, llaves, false);

/* ======================================== Cost Explorer: reportes guardados */

export function guardarReporteCostos(estado, { nombre, parametros } = {}) {
  iniciar(estado);
  const n = nombreLimpio(nombre, 100);
  if (!n) throw errorAws('ValidationException', 'Report name is required.');
  if (estado.costos.reportes.some((r) => r.nombre === n)) throw errorAws('ValidationException', `A report named "${n}" already exists.`);
  if (estado.costos.reportes.length >= 30) throw errorAws('LimitExceededException', 'You can save up to 30 reports.');
  const r = { id: hexAzar(10), nombre: n, parametros: JSON.parse(JSON.stringify(parametros ?? {})), creado: iso() };
  estado.costos.reportes.push(r);
  anotar(estado, 'CostExplorer', 'CreateReport', `«${n}»`);
  return r;
}

export function eliminarReporteCostos(estado, id) {
  iniciar(estado);
  const r = estado.costos.reportes.find((x) => x.id === id);
  if (!r) throw errorAws('ResourceNotFoundException', 'Report not found.');
  estado.costos.reportes = estado.costos.reportes.filter((x) => x !== r);
  anotar(estado, 'CostExplorer', 'DeleteReport', `«${r.nombre}»`);
}

/* ================================================ Cost Anomaly Detection */

export function crearMonitorAnomalias(estado, { nombre, tipo = 'SERVICE', llave, umbral = 100, frecuencia = 'DAILY', correos = [] } = {}) {
  iniciar(estado);
  const n = nombreLimpio(nombre, 1024);
  if (!n) throw errorAws('ValidationException', 'Monitor name is required.');
  if (estado.costos.monitores.some((m) => m.nombre === n)) throw errorAws('ValidationException', `A monitor named ${n} already exists.`);
  if (tipo === 'SERVICE' && estado.costos.monitores.some((m) => m.tipo === 'SERVICE')) {
    throw errorAws('ValidationException', 'You can create only one AWS services monitor per account.');
  }
  if (tipo === 'TAG' && !llave) throw errorAws('ValidationException', 'Select a cost allocation tag.');
  if (!(Number(umbral) > 0)) throw errorAws('ValidationException', 'Threshold must be greater than 0.');
  const lista = [...new Set(correos.map((c) => String(c).trim()).filter(Boolean))];
  for (const c of lista) if (!CORREO.test(c)) throw errorAws('ValidationException', `Invalid email address: ${c}`);
  const m = {
    id: hexAzar(8),
    arn: `arn:aws:ce::${estado.cuenta.id}:anomalymonitor/${hexAzar(8)}-${hexAzar(4)}-${hexAzar(4)}-${hexAzar(4)}-${hexAzar(12)}`,
    nombre: n,
    tipo: tipo === 'TAG' ? 'TAG' : 'SERVICE',
    llave: tipo === 'TAG' ? String(llave) : undefined,
    umbral: Number(umbral),
    frecuencia: ['DAILY', 'IMMEDIATE', 'WEEKLY'].includes(frecuencia) ? frecuencia : 'DAILY',
    correos: lista,
    creado: iso(),
    porOmision: false
  };
  estado.costos.monitores.push(m);
  anotar(estado, 'CostExplorer', 'CreateAnomalyMonitor', `«${n}» ${m.tipo}`);
  return m;
}

export function eliminarMonitorAnomalias(estado, id) {
  iniciar(estado);
  const m = estado.costos.monitores.find((x) => x.id === id);
  if (!m) throw errorAws('UnknownMonitorException', 'Cost anomaly monitor does not exist.');
  estado.costos.monitores = estado.costos.monitores.filter((x) => x !== m);
  anotar(estado, 'CostExplorer', 'DeleteAnomalyMonitor', `«${m.nombre}»`);
}

/**
 * Las anomalías de gasto (Cost Anomaly Detection simple). Pura. Un día del mes
 * en curso es anómalo para un servicio si gastó más de 3 veces su promedio
 * diario del mes pasado y al menos $1 más. Solo si hay un monitor de servicios.
 * → [{ id, servicio, dia, impacto, esperado, real, porcentaje, monitor }]
 */
export function anomaliasDeCostos(estado, ahora = reloj.ahora()) {
  iniciar(estado);
  const monitor = estado.costos.monitores.find((m) => m.tipo === 'SERVICE');
  if (!monitor) return [];
  const mes = claveMes(ahora);
  const anterior = sumarMeses(mes, -1);
  const base = {};
  for (const l of lineasDelMes(estado, anterior)) base[l.servicio] = (base[l.servicio] ?? 0) + l.costo / diasDelMes(anterior);
  const porDia = {};
  for (const l of lineasDelMes(estado, mes)) {
    if (l.sintetica) continue;
    for (const [d, v] of Object.entries(l.dias ?? {})) {
      const clave = `${l.servicio}|${d}`;
      porDia[clave] = (porDia[clave] ?? 0) + v;
    }
  }
  const lista = [];
  for (const [clave, real] of Object.entries(porDia)) {
    const [servicio, d] = clave.split('|');
    const esperado = base[servicio] ?? 0;
    if (real > Math.max(esperado * 3, esperado + 1)) {
      lista.push({ id: `${mes}-${d}-${servicio}`, servicio, servicioNombre: servicioCosto(servicio)?.factura ?? servicio, dia: `${mes}-${d}`, impacto: real - esperado, esperado, real, porcentaje: esperado ? ((real - esperado) / esperado) * 100 : null, monitor: monitor.nombre });
    }
  }
  return lista.sort((a, b) => b.dia.localeCompare(a.dia) || b.impacto - a.impacto);
}

/* ========================================== Savings Plans: recomendaciones */

/**
 * La recomendación de Compute Savings Plans según lo que gasta EC2 por hora
 * hoy (instancias prendidas). Pura.
 * → { gastoHora, compromiso, ahorroMensual, porcentaje, plazo, opcion } | null
 */
export function recomendacionSavingsPlans(estado, { plazo = 1, opcion = 'none', tipo = 'compute-sp' } = {}) {
  const gastoHora = tasaPorHora(estado, { servicios: ['ec2'], usos: ['BoxUsage:'] });
  if (!(gastoHora > 0)) return null;
  const factor = FACTORES_AHORRO[tipo]?.[plazo]?.[opcion] ?? 1;
  const compromiso = gastoHora * factor;
  return { gastoHora, compromiso, ahorroMensual: (gastoHora - compromiso) * HORAS_MES, porcentaje: (1 - factor) * 100, plazo, opcion, tipo, costoMensualActual: gastoHora * HORAS_MES };
}

/* ========================================================== Support */

export function cambiarPlanSoporte(estado, plan) {
  iniciar(estado);
  if (!PLANES_SOPORTE.some((p) => p.id === plan)) throw errorAws('InvalidParameterValueException', `Invalid support plan: ${plan}`);
  const anterior = estado.costos.planSoporte;
  if (anterior === plan) return planSoporte(plan);
  estado.costos.planSoporte = plan;
  anotar(estado, 'Support', 'UpdateSupportPlan', `${planSoporte(anterior).nombre} → ${planSoporte(plan).nombre}`);
  // Con otro plan cambian los chequeos de Trusted Advisor que se pueden ver.
  refrescarAdvisor(estado, null, { anotar: false });
  return planSoporte(plan);
}

const CATEGORIAS_CUENTA = ['Account', 'Billing', 'Free Tier', 'Payments', 'Charges and refunds', 'Account and billing (other)'];
const SEVERIDADES = { low: 'General guidance', normal: 'System impaired', high: 'Production system impaired', urgent: 'Production system down', critical: 'Business-critical system down' };
export { CATEGORIAS_CUENTA, SEVERIDADES };

/** «Create case». p: { tipo: 'account' | 'technical', servicio, categoria, severidad, asunto, descripcion, correos } */
export function crearCasoSoporte(estado, p = {}) {
  iniciar(estado);
  const plan = planSoporte(estado.costos.planSoporte);
  const tipo = p.tipo === 'technical' ? 'technical' : 'account';
  if (tipo === 'technical' && !plan.casosTecnicos) {
    throw errorAws('SubscriptionRequiredException', 'Technical support is unavailable on the Basic Support plan. To open a technical support case, upgrade your support plan.');
  }
  const asunto = nombreLimpio(p.asunto, 250);
  const descripcion = String(p.descripcion ?? '').trim().slice(0, 5000);
  if (!asunto) throw errorAws('InvalidParameterValueException', 'Subject is required.');
  if (!descripcion) throw errorAws('InvalidParameterValueException', 'Description is required.');
  if (!p.servicio) throw errorAws('InvalidParameterValueException', 'Service is required.');
  let severidad = Object.keys(SEVERIDADES).includes(p.severidad) ? p.severidad : 'low';
  if (tipo === 'account') severidad = 'low';
  const correos = [...new Set((p.correos ?? []).map((c) => String(c).trim()).filter(Boolean))];
  for (const c of correos) if (!CORREO.test(c)) throw errorAws('InvalidParameterValueException', `Invalid email address: ${c}`);
  const ahora = reloj.ahora();
  const caso = {
    id: `case-${estado.cuenta.id}-muen-${claveMes(ahora).slice(0, 4)}-${hexAzar(16)}`,
    numero: String(1_700_000_000 + Math.floor((Number.parseInt(hexAzar(7), 16) % 99_999_999))),
    asunto,
    tipo,
    servicio: String(p.servicio),
    categoria: String(p.categoria ?? 'General question'),
    severidad,
    estado: 'unassigned',
    correos,
    creado: iso(ahora),
    respuestaEn: ahora + DURACION_COSTOS.respuestaSoporte,
    mensajes: [{ de: 'customer', texto: descripcion, t: iso(ahora) }]
  };
  estado.costos.casos.unshift(caso);
  if (estado.costos.casos.length > 30) estado.costos.casos.length = 30;
  anotar(estado, 'Support', 'CreateCase', `${caso.numero} «${asunto}» (${tipo === 'technical' ? 'Technical' : 'Account and billing'})`);
  return caso;
}

const casoOError = (estado, id) => {
  const caso = estado.costos.casos.find((c) => c.id === id || c.numero === id);
  if (!caso) throw errorAws('CaseIdNotFound', `The requested case ID could not be located: ${id}`);
  return caso;
};

export function responderCasoSoporte(estado, id, texto) {
  iniciar(estado);
  const caso = casoOError(estado, id);
  const t = String(texto ?? '').trim().slice(0, 5000);
  if (!t) throw errorAws('InvalidParameterValueException', 'Correspondence is required.');
  caso.mensajes.push({ de: 'customer', texto: t, t: iso() });
  if (caso.mensajes.length > 20) caso.mensajes.splice(1, caso.mensajes.length - 20);
  caso.estado = 'customer-action-completed';
  caso.respuestaEn = reloj.ahora() + DURACION_COSTOS.respuestaSoporte;
  anotar(estado, 'Support', 'AddCommunicationToCase', caso.numero);
  return caso;
}

export function resolverCasoSoporte(estado, id) {
  iniciar(estado);
  const caso = casoOError(estado, id);
  caso.estado = 'resolved';
  caso.respuestaEn = null;
  anotar(estado, 'Support', 'ResolveCase', caso.numero);
  return caso;
}

/** La respuesta automática de AWS Support (en inglés, como la real). */
/**
 * Respuestas de facturación que sí contestan la duda del caso (si el asunto o
 * el primer mensaje hablan del tema). Las demás reciben la respuesta general.
 */
const RESPUESTAS_CUENTA = [
  {
    tema: /\bips?\b|elastic ip|ipv4|\beips?\b/i,
    texto: (caso) =>
      `Hello,\n\nThank you for contacting AWS Support about "${caso.asunto}".\n\nSince February 1, 2024, AWS charges $${PRECIOS.ipv4} per hour for every public IPv4 address, whether it is in use or idle. An Elastic IP address that is allocated but not associated with a running instance appears in your bill as "Idle public IPv4 address". You can see this charge in the Billing and Cost Management console under Bills → Charges by service → Amazon Virtual Private Cloud ("$${PRECIOS.ipv4} per Idle public IPv4 address per hour"). Trusted Advisor also lists these addresses in the "Unassociated Elastic IP Addresses" check.\n\nTo stop the charge, release the address in the EC2 console under Elastic IPs → Actions → Release Elastic IP addresses. Hours already used remain on the bill.\n\nPlease let us know if you have any further questions.\n\nBest regards,\nAWS Support`
  }
];

function respuestaAws(caso) {
  const primera = !caso.mensajes.some((m) => m.de === 'aws');
  if (caso.tipo === 'account') {
    const duda = `${caso.asunto ?? ''} ${caso.mensajes[0]?.texto ?? ''}`;
    const especifica = primera ? RESPUESTAS_CUENTA.find((r) => r.tema.test(duda)) : null;
    if (especifica) return especifica.texto(caso);
    return primera
      ? `Hello,\n\nThank you for contacting AWS Support about "${caso.asunto}". I've reviewed your account and the charges you mentioned.\n\nYou can review every charge by service in the Billing and Cost Management console under Bills, and you can see trends in Cost Explorer. To avoid unexpected charges, we recommend creating a budget with alerts in AWS Budgets and stopping or deleting the resources you no longer need.\n\nPlease let us know if you have any further questions.\n\nBest regards,\nAWS Support`
      : 'Hello again,\n\nThank you for the additional information. Your request has been noted. If there is nothing else we can help with, you can resolve this case from the Support Center.\n\nBest regards,\nAWS Support';
  }
  return primera
    ? `Hello,\n\nThank you for contacting AWS Support. I understand you need help with ${caso.servicio}.\n\nI've reviewed the resources in your account in us-east-1. Could you please share the resource IDs involved and the exact error message you see? In the meantime, you can review the AWS Health Dashboard and the service documentation.\n\nBest regards,\nAWS Support`
    : 'Hello,\n\nThank you for the details. Based on the information provided, please review the security groups, route tables and IAM permissions of the resource. If the issue persists, reply to this case and we will continue troubleshooting.\n\nBest regards,\nAWS Support';
}

/* ======================================================= Trusted Advisor */

const PUERTOS_ROJOS = [20, 21, 22, 1433, 1434, 3306, 3389, 4333, 5432, 5500];
const PUERTOS_VERDES = [25, 80, 443, 465];
const abierto = (r) => r.origen === '0.0.0.0/0' || r.origen === '::/0';
const incluyePuerto = (r, p) => r.protocolo === '-1' || r.desde === null || (Number(r.desde) <= p && p <= Number(r.hasta));
const textoPuerto = (r) => (r.protocolo === '-1' || r.desde === null ? 'All' : r.desde === r.hasta ? String(r.desde) : `${r.desde}-${r.hasta}`);

/** Lo que usa un grupo de seguridad (¿está adjunto a algo?). */
function grupoEnUso(estado, sgId) {
  return (
    (estado.instancias ?? []).some((i) => i.estado !== 'terminated' && i.gruposSeguridad?.includes(sgId)) ||
    (estado.elb?.balanceadores ?? []).some((b) => b.gruposSeguridad?.includes(sgId)) ||
    (estado.rds?.instancias ?? []).some((d) => (d.gruposSeguridad ?? d.vpcSecurityGroups ?? []).includes(sgId))
  );
}

/** CPU promedio de una instancia: de CloudWatch si existe; si no, su base estable (3 a 15 %). */
function cpuDe(estado, inst, ahora) {
  let v;
  try {
    v = llamar('valorMetrica', estado, { namespace: 'AWS/EC2', metrica: 'CPUUtilization', dimensiones: { InstanceId: inst.id }, estadistica: 'Average' }, ahora);
  } catch {
    v = null;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return 3 + (semilla(inst.id) % 13);
}

/**
 * Los chequeos de Trusted Advisor que calcula el simulador. `plan: 'basic'` =
 * los que ve cualquier cuenta; 'business' = solo con Business Support+ o mayor.
 * evaluar(estado, ahora) → { evaluados, marcados: [{ estado: 'error' | 'warning', recurso, datos }] }
 */
export const CHEQUEOS_ADVISOR = [
  {
    id: 'ebs-snapshots-publicos',
    nombre: 'Amazon EBS Public Snapshots',
    categoria: 'security',
    plan: 'basic',
    descripcion: 'Checks the permission settings for your Amazon Elastic Block Store (Amazon EBS) volume snapshots and alerts you if any snapshots are marked as public.',
    criterios: ['Red: The EBS volume snapshot is publicly accessible.'],
    accion: 'Unless you are certain you want to share all the data in the snapshot with all AWS users, modify the permissions: mark the snapshot as private, and then specify the accounts that you want to give permissions to.',
    columnas: ['Region', 'Volume ID', 'Snapshot ID', 'Description'],
    evaluar: (e) => {
      const lista = e.snapshots ?? [];
      return {
        evaluados: lista.length,
        marcados: lista.filter((s) => s.publico === true || s.permisos === 'public' || s.compartido === 'public').map((s) => ({ estado: 'error', recurso: s.id, datos: { Region: 'us-east-1', 'Volume ID': s.volumenId ?? '–', 'Snapshot ID': s.id, Description: s.descripcion || '–' } }))
      };
    }
  },
  {
    id: 'rds-snapshots-publicos',
    nombre: 'Amazon RDS Public Snapshots',
    categoria: 'security',
    plan: 'basic',
    descripcion: 'Checks the permission settings for your Amazon Relational Database Service (Amazon RDS) DB snapshots and alerts you if any snapshots are marked as public.',
    criterios: ['Red: The Amazon RDS snapshot is marked as public.'],
    accion: 'Unless you are certain you want to share all the data in the snapshot with all AWS users, modify the permissions: mark the snapshot as private, and then specify the accounts that you want to give permissions to.',
    columnas: ['Region', 'DB Instance or Cluster ID', 'Snapshot ID'],
    evaluar: (e) => {
      const lista = e.rds?.snapshots ?? [];
      return {
        evaluados: lista.length,
        marcados: lista.filter((s) => s.publico === true || s.visibilidad === 'public').map((s) => ({ estado: 'error', recurso: s.id ?? s.nombre, datos: { Region: 'us-east-1', 'DB Instance or Cluster ID': s.instancia ?? s.instanciaId ?? '–', 'Snapshot ID': s.id ?? s.nombre } }))
      };
    }
  },
  {
    id: 's3-permisos',
    nombre: 'Amazon S3 Bucket Permissions',
    categoria: 'security',
    plan: 'basic',
    descripcion: 'Checks buckets in Amazon Simple Storage Service (Amazon S3) that have open access permissions, or that allow access to any authenticated AWS user.',
    criterios: [
      'Red: A bucket policy allows public access and Block Public Access settings are not enabled.',
      'Yellow: A bucket policy allows public access, but the Restrict Public Buckets setting is turned on.',
      'Yellow: The bucket is compliant but does not have full Block Public Access protection enabled.',
      'Green: The bucket is compliant and has full Block Public Access protection enabled.'
    ],
    accion: 'If a bucket allows open access, determine if open access is truly needed. When possible, update the bucket permissions to restrict access to the owner or specific users. Use Amazon S3 Block Public Access to control the settings that allow public access to your data.',
    columnas: ['Region', 'Bucket Name', 'Policy Allows Access', 'Block Public Access'],
    evaluar: (e) => {
      const lista = e.buckets ?? [];
      const marcados = [];
      for (const b of lista) {
        const bp = b.bloqueoPublico ?? {};
        const completo = bp.aclsNuevas && bp.aclsCualquiera && bp.politicasNuevas && bp.politicasCualquiera;
        let publica = false;
        try {
          publica = Boolean(b.politica) && politicaEsPublica(b.politica);
        } catch {
          publica = false;
        }
        const datos = { Region: 'us-east-1', 'Bucket Name': b.nombre, 'Policy Allows Access': publica ? 'Yes' : 'No', 'Block Public Access': completo ? 'On' : 'Off' };
        if (publica && !bp.politicasCualquiera) marcados.push({ estado: 'error', recurso: b.nombre, datos });
        else if (!completo) marcados.push({ estado: 'warning', recurso: b.nombre, datos });
      }
      return { evaluados: lista.length, marcados };
    }
  },
  {
    id: 'mfa-raiz',
    nombre: 'MFA on Root Account',
    categoria: 'security',
    plan: 'basic',
    descripcion: 'Checks the root account and warns if multi-factor authentication (MFA) is not enabled. For increased security, we recommend that you protect your account by using MFA.',
    criterios: ['Red: MFA is not enabled on the root account.'],
    accion: 'Log in to your root account and activate an MFA device.',
    columnas: ['Account'],
    evaluar: (e) => ({ evaluados: 1, marcados: e.iam?.raizMfa ? [] : [{ estado: 'error', recurso: e.cuenta?.id, datos: { Account: e.cuenta?.id ?? '–' } }] })
  },
  {
    id: 'sg-puertos',
    nombre: 'Security Groups - Specific Ports Unrestricted',
    categoria: 'security',
    plan: 'basic',
    descripcion: 'Checks security groups for rules that allow unrestricted access (0.0.0.0/0) to specific ports. Unrestricted access increases opportunities for malicious activity (hacking, denial-of-service attacks, loss of data).',
    criterios: [
      'Green: Security Group provides unrestricted access on ports 80, 25, 443, or 465.',
      'Red: Security Group provides unrestricted access to port 20, 21, 22, 1433, 1434, 3306, 3389, 4333, 5432, or 5500.',
      'Yellow: Security Group provides unrestricted access to any other port.'
    ],
    accion: 'Restrict access to only those IP addresses that require it. To restrict access to a specific IP address, set the suffix to /32 (for example, 192.0.2.10/32). Be sure to delete overly permissive rules after creating rules that are more restrictive.',
    columnas: ['Region', 'Security Group Name', 'Security Group ID', 'Protocol', 'Port'],
    evaluar: (e) => {
      const lista = e.gruposSeguridad ?? [];
      const marcados = [];
      for (const g of lista) {
        for (const r of g.entrada ?? []) {
          if (!abierto(r)) continue;
          const rojo = PUERTOS_ROJOS.some((p) => incluyePuerto(r, p));
          const verde = !rojo && r.protocolo !== '-1' && r.desde !== null && PUERTOS_VERDES.includes(Number(r.desde)) && r.desde === r.hasta;
          if (verde) continue;
          marcados.push({ estado: rojo ? 'error' : 'warning', recurso: g.id, datos: { Region: 'us-east-1', 'Security Group Name': g.nombre, 'Security Group ID': g.id, Protocol: r.protocolo === '-1' ? 'All' : r.protocolo, Port: textoPuerto(r) } });
        }
      }
      return { evaluados: lista.length, marcados };
    }
  },
  {
    id: 'iam-uso',
    nombre: 'IAM Use',
    categoria: 'security',
    plan: 'basic',
    descripcion: 'Checks for your use of AWS Identity and Access Management (IAM). This check is intended to discourage the use of root access by checking for existence of at least one IAM user.',
    criterios: ['Yellow: IAM is not being used (there are no IAM users).'],
    accion: 'Create an IAM user or use AWS IAM Identity Center to create additional users whose permissions are limited to perform specific tasks in your AWS environment.',
    columnas: ['Account'],
    evaluar: (e) => ({ evaluados: 1, marcados: (e.iam?.usuarios ?? []).length ? [] : [{ estado: 'warning', recurso: e.cuenta?.id, datos: { Account: e.cuenta?.id ?? '–' } }] })
  },
  {
    id: 'limite-vpc',
    nombre: 'VPC',
    categoria: 'service_limits',
    plan: 'basic',
    descripcion: 'Checks for usage that is more than 80% of the VPC quota.',
    criterios: ['Yellow: 80% of the quota reached.', 'Red: 100% of the quota reached.'],
    accion: 'If you anticipate exceeding a service quota, request an increase directly from the Service Quotas console.',
    columnas: ['Region', 'Service', 'Limit Name', 'Limit Amount', 'Current Usage'],
    evaluar: (e) => limite(e.vpcs?.length ?? 0, 5, 'VPC', 'VPCs')
  },
  {
    id: 'limite-eip',
    nombre: 'EC2-VPC Elastic IP Address',
    categoria: 'service_limits',
    plan: 'basic',
    descripcion: 'Checks for usage that is more than 80% of the EC2-VPC Elastic IP Address quota.',
    criterios: ['Yellow: 80% of the quota reached.', 'Red: 100% of the quota reached.'],
    accion: 'If you anticipate exceeding a service quota, request an increase directly from the Service Quotas console.',
    columnas: ['Region', 'Service', 'Limit Name', 'Limit Amount', 'Current Usage'],
    evaluar: (e) => limite(e.eips?.length ?? 0, 5, 'EC2', 'EC2-VPC Elastic IPs')
  },
  {
    id: 'limite-igw',
    nombre: 'VPC Internet Gateways',
    categoria: 'service_limits',
    plan: 'basic',
    descripcion: 'Checks for usage that is more than 80% of the VPC Internet Gateways quota.',
    criterios: ['Yellow: 80% of the quota reached.', 'Red: 100% of the quota reached.'],
    accion: 'If you anticipate exceeding a service quota, request an increase directly from the Service Quotas console.',
    columnas: ['Region', 'Service', 'Limit Name', 'Limit Amount', 'Current Usage'],
    evaluar: (e) => limite(e.igws?.length ?? 0, 5, 'VPC', 'Internet gateways')
  },
  {
    id: 'ec2-baja-utilizacion',
    nombre: 'Low Utilization Amazon EC2 Instances',
    categoria: 'cost_optimizing',
    plan: 'business',
    descripcion: 'Checks the Amazon Elastic Compute Cloud (Amazon EC2) instances that were running and alerts you if the daily CPU utilization was 10% or less. Low utilization can indicate an opportunity to right-size your instances.',
    criterios: ['Yellow: An instance had 10% or less daily average CPU utilization.'],
    accion: 'Consider stopping or terminating instances that have low utilization, or scale the number of instances by using Auto Scaling. Right-size: change to a smaller instance type.',
    columnas: ['Region', 'Instance ID', 'Instance Name', 'Instance Type', 'Estimated Monthly Savings', 'Average CPU Utilization'],
    evaluar: (e, ahora) => {
      const lista = (e.instancias ?? []).filter((i) => i.estado === 'running');
      return {
        evaluados: lista.length,
        marcados: lista
          .map((i) => ({ i, cpu: cpuDe(e, i, ahora) }))
          .filter(({ cpu }) => cpu <= 10)
          .map(({ i, cpu }) => ({ estado: 'warning', recurso: i.id, ahorro: precioInstancia(i) * HORAS_MES, datos: { Region: 'us-east-1', 'Instance ID': i.id, 'Instance Name': i.nombre || '–', 'Instance Type': i.tipo, 'Estimated Monthly Savings': dinero(precioInstancia(i) * HORAS_MES), 'Average CPU Utilization': `${cpu.toFixed(1)}%` } }))
      };
    }
  },
  {
    id: 'eip-sin-asociar',
    nombre: 'Unassociated Elastic IP Addresses',
    categoria: 'cost_optimizing',
    plan: 'business',
    descripcion: 'Checks for Elastic IP addresses (EIPs) that are not associated with a running Amazon EC2 instance. EIPs are charged for every hour they are allocated, whether associated or not.',
    criterios: ['Yellow: An allocated Elastic IP address (EIP) is not associated with a running Amazon EC2 instance.'],
    accion: 'Associate the EIP with a running active instance, or release the unassociated EIP.',
    columnas: ['Region', 'IP Address', 'Allocation ID', 'Estimated Monthly Savings'],
    evaluar: (e) => {
      const lista = e.eips ?? [];
      const corriendo = (id) => (e.instancias ?? []).some((i) => i.id === id && i.estado === 'running');
      return {
        evaluados: lista.length,
        marcados: lista.filter((x) => !x.natId && !(x.instanciaId && corriendo(x.instanciaId))).map((x) => ({ estado: 'warning', recurso: x.id, ahorro: PRECIOS.ipv4 * HORAS_MES, datos: { Region: 'us-east-1', 'IP Address': x.ip, 'Allocation ID': x.id, 'Estimated Monthly Savings': dinero(PRECIOS.ipv4 * HORAS_MES) } }))
      };
    }
  },
  {
    id: 'ebs-subutilizados',
    nombre: 'Underutilized Amazon EBS Volumes',
    categoria: 'cost_optimizing',
    plan: 'business',
    descripcion: 'Checks Amazon Elastic Block Store (Amazon EBS) volume configurations and warns when volumes appear to be underused. Charges begin when a volume is created.',
    criterios: ['Yellow: A volume is unattached or had less than 1 IOPS per day for the past 7 days.'],
    accion: 'Consider creating a snapshot and deleting the volume to reduce costs.',
    columnas: ['Region', 'Volume ID', 'Volume Name', 'Volume Type', 'Volume Size', 'Monthly Storage Cost'],
    evaluar: (e) => {
      const lista = e.volumenes ?? [];
      return {
        evaluados: lista.length,
        marcados: lista.filter((v) => v.estado === 'available').map((v) => ({ estado: 'warning', recurso: v.id, ahorro: (PRECIO_EBS[v.tipo] ?? 0.08) * v.tamano, datos: { Region: 'us-east-1', 'Volume ID': v.id, 'Volume Name': v.nombre || '–', 'Volume Type': v.tipo, 'Volume Size': `${v.tamano} GiB`, 'Monthly Storage Cost': dinero((PRECIO_EBS[v.tipo] ?? 0.08) * v.tamano) } }))
      };
    }
  },
  {
    id: 'elb-ociosos',
    nombre: 'Idle Load Balancers',
    categoria: 'cost_optimizing',
    plan: 'business',
    descripcion: 'Checks your load balancer configurations for load balancers that are not actively used. Any load balancer that is configured accrues charges.',
    criterios: ['Yellow: A load balancer has no active back-end instances.'],
    accion: 'If your load balancer has no active back-end instances, consider registering instances or deleting your load balancer.',
    columnas: ['Region', 'Load Balancer Name', 'Reason', 'Estimated Monthly Savings'],
    evaluar: (e) => {
      const lista = e.elb?.balanceadores ?? [];
      const sanos = (lb) =>
        (lb.oyentes ?? []).some((o) => {
          const tgs = [o.accion?.tgArn, ...(o.reglas ?? []).map((r) => r.tgArn)].filter(Boolean);
          return tgs.some((arn) => (e.elb?.gruposDestino ?? []).find((t) => t.arn === arn)?.destinos?.some((d) => d.salud === 'healthy'));
        });
      return { evaluados: lista.length, marcados: lista.filter((lb) => !sanos(lb)).map((lb) => ({ estado: 'warning', recurso: lb.arn, ahorro: PRECIOS.alb * HORAS_MES, datos: { Region: 'us-east-1', 'Load Balancer Name': lb.nombre, Reason: 'No active back-end instances', 'Estimated Monthly Savings': dinero(PRECIOS.alb * HORAS_MES) } })) };
    }
  },
  {
    id: 'ebs-sin-snapshots',
    nombre: 'Amazon EBS Snapshots',
    categoria: 'fault_tolerance',
    plan: 'business',
    descripcion: 'Checks the age of the snapshots for your Amazon Elastic Block Store (Amazon EBS) volumes (available or in-use). Even though Amazon EBS volumes are replicated, failures can occur.',
    criterios: ['Yellow: The most recent volume snapshot is between 7 and 30 days old.', 'Red: The most recent volume snapshot is more than 30 days old, or there is no volume snapshot.'],
    accion: 'Create weekly or monthly snapshots of your volumes. You can use Amazon Data Lifecycle Manager to automate it.',
    columnas: ['Region', 'Volume ID', 'Volume Name', 'Snapshot ID', 'Reason'],
    evaluar: (e) => {
      const lista = e.volumenes ?? [];
      return {
        evaluados: lista.length,
        marcados: lista.filter((v) => !(e.snapshots ?? []).some((s) => s.volumenId === v.id && s.estado !== 'error')).map((v) => ({ estado: 'error', recurso: v.id, datos: { Region: 'us-east-1', 'Volume ID': v.id, 'Volume Name': v.nombre || '–', 'Snapshot ID': '–', Reason: 'No snapshot' } }))
      };
    }
  },
  {
    id: 'rds-multi-az',
    nombre: 'Amazon RDS Multi-AZ',
    categoria: 'fault_tolerance',
    plan: 'business',
    descripcion: 'Checks for DB instances that are deployed in a single Availability Zone. Multi-AZ deployments enhance database availability by synchronously replicating to a standby instance in a different Availability Zone.',
    criterios: ['Yellow: A DB instance is deployed in a single Availability Zone.'],
    accion: 'If your application requires high availability, modify your DB instance to enable Multi-AZ deployment.',
    columnas: ['Region', 'DB Instance', 'Multi-AZ', 'Instance Type'],
    evaluar: (e) => {
      const lista = (e.rds?.instancias ?? []).filter((d) => !['deleting', 'deleted'].includes(d.estado) && !d.replicaDe && !d.origenReplica);
      const multi = (d) => Boolean(d.multiAz ?? d.multiAZ) || ['multi', 'multi-az', 'cluster'].includes(d.despliegue);
      return { evaluados: lista.length, marcados: lista.filter((d) => !multi(d)).map((d) => ({ estado: 'warning', recurso: d.id ?? d.nombre, datos: { Region: 'us-east-1', 'DB Instance': d.id ?? d.nombre, 'Multi-AZ': 'No', 'Instance Type': d.clase ?? '–' } })) };
    }
  },
  {
    id: 'ec2-balance-zonas',
    nombre: 'Amazon EC2 Availability Zone Balance',
    categoria: 'fault_tolerance',
    plan: 'business',
    descripcion: 'Checks the distribution of Amazon EC2 instances across Availability Zones in a Region. Availability Zones are distinct locations that are designed to be insulated from failures in other Availability Zones.',
    criterios: ['Yellow: The Region has instances in multiple zones, but the distribution is uneven.', 'Red: The Region has instances only in a single zone.'],
    accion: 'Ensure your Amazon EC2 instances are evenly distributed across multiple Availability Zones. You can do this by launching instances manually or by using Auto Scaling to do it automatically.',
    columnas: ['Region', 'Zone a Instances', 'Zone b Instances', 'Zone c Instances', 'Zone d Instances', 'Zone e Instances', 'Zone f Instances', 'Reason'],
    evaluar: (e) => {
      const lista = (e.instancias ?? []).filter((i) => i.estado === 'running');
      if (lista.length < 2) return { evaluados: lista.length, marcados: [] };
      const por = {};
      for (const i of lista) por[i.az] = (por[i.az] ?? 0) + 1;
      const zonas = Object.keys(por);
      const datos = { Region: 'us-east-1', Reason: zonas.length === 1 ? 'Single AZ' : 'Unbalanced AZs' };
      for (const l of 'abcdef') datos[`Zone ${l} Instances`] = String(por[`us-east-1${l}`] ?? 0);
      if (zonas.length === 1) return { evaluados: 1, marcados: [{ estado: 'error', recurso: 'us-east-1', datos }] };
      const v = Object.values(por);
      return { evaluados: 1, marcados: Math.max(...v) - Math.min(...v) > 1 ? [{ estado: 'warning', recurso: 'us-east-1', datos }] : [] };
    }
  },
  {
    id: 's3-versionado',
    nombre: 'Amazon S3 Bucket Versioning',
    categoria: 'fault_tolerance',
    plan: 'business',
    descripcion: 'Checks for Amazon Simple Storage Service buckets that do not have versioning enabled, or have versioning suspended. When versioning is enabled, you can easily recover from both unintended user actions and application failures.',
    criterios: ['Yellow: Versioning is not enabled, or versioning is suspended for the bucket.'],
    accion: 'Enable bucket versioning on most buckets to prevent accidental deletion or overwriting.',
    columnas: ['Region', 'Bucket Name', 'Versioning'],
    evaluar: (e) => {
      const lista = e.buckets ?? [];
      return { evaluados: lista.length, marcados: lista.filter((b) => b.versionado !== 'Enabled').map((b) => ({ estado: 'warning', recurso: b.nombre, datos: { Region: 'us-east-1', 'Bucket Name': b.nombre, Versioning: b.versionado === 'Suspended' ? 'Suspended' : 'Not enabled' } })) };
    }
  },
  {
    id: 'ec2-alta-utilizacion',
    nombre: 'High Utilization Amazon EC2 Instances',
    categoria: 'performance',
    plan: 'business',
    descripcion: 'Checks the Amazon Elastic Compute Cloud (Amazon EC2) instances that were running and alerts you if the daily CPU utilization was more than 90%.',
    criterios: ['Yellow: An instance had more than 90% daily average CPU utilization.'],
    accion: 'Consider adding more instances by using Auto Scaling, or change to a larger instance type.',
    columnas: ['Region', 'Instance ID', 'Instance Name', 'Instance Type', 'Average CPU Utilization'],
    evaluar: (e, ahora) => {
      const lista = (e.instancias ?? []).filter((i) => i.estado === 'running');
      return {
        evaluados: lista.length,
        marcados: lista
          .map((i) => ({ i, cpu: cpuDe(e, i, ahora) }))
          .filter(({ cpu }) => cpu > 90)
          .map(({ i, cpu }) => ({ estado: 'warning', recurso: i.id, datos: { Region: 'us-east-1', 'Instance ID': i.id, 'Instance Name': i.nombre || '–', 'Instance Type': i.tipo, 'Average CPU Utilization': `${cpu.toFixed(1)}%` } }))
      };
    }
  },
  {
    id: 'sg-muchas-reglas',
    nombre: 'Large Number of Rules in an EC2 Security Group',
    categoria: 'performance',
    plan: 'business',
    descripcion: 'Checks each Amazon Elastic Compute Cloud (EC2) security group for an excessive number of rules. If a security group has a large number of rules, performance can be degraded.',
    criterios: ['Yellow: A security group has more than 50 rules.', 'Red: A security group has more than 100 rules.'],
    accion: 'Reduce the number of rules in a security group by deleting unnecessary or overlapping rules.',
    columnas: ['Region', 'Security Group Name', 'Security Group ID', 'Total Rules'],
    evaluar: (e) => {
      const lista = e.gruposSeguridad ?? [];
      return {
        evaluados: lista.length,
        marcados: lista
          .map((g) => ({ g, n: (g.entrada?.length ?? 0) + (g.salida?.length ?? 0) }))
          .filter(({ n }) => n > 50)
          .map(({ g, n }) => ({ estado: n > 100 ? 'error' : 'warning', recurso: g.id, datos: { Region: 'us-east-1', 'Security Group Name': g.nombre, 'Security Group ID': g.id, 'Total Rules': String(n) } }))
      };
    }
  },
  {
    id: 'sg-acceso-abierto',
    nombre: 'Security Groups - Unrestricted Access',
    categoria: 'security',
    plan: 'business',
    descripcion: 'Checks security groups for rules that allow unrestricted access to a resource. Unrestricted access increases opportunities for malicious activity (hacking, denial-of-service attacks, loss of data).',
    criterios: [
      'Green: A security group rule has a source IP address with a /0 suffix for ports 25, 80, or 443.',
      'Yellow: A security group rule has a source IP address with a /0 suffix for ports other than 25, 80, or 443 and security group is attached to a resource.',
      'Red: A security group rule has a source IP address with a /0 suffix for ports other than 25, 80, or 443 and security group is not attached to a resource.'
    ],
    accion: 'Restrict access to only those IP addresses that require it. Review and delete unused security groups.',
    columnas: ['Region', 'Security Group Name', 'Security Group ID', 'Protocol', 'Port', 'IP Address'],
    evaluar: (e) => {
      const lista = e.gruposSeguridad ?? [];
      const marcados = [];
      for (const g of lista) {
        for (const r of g.entrada ?? []) {
          if (!abierto(r)) continue;
          if (r.protocolo !== '-1' && r.desde !== null && r.desde === r.hasta && [25, 80, 443].includes(Number(r.desde))) continue;
          marcados.push({ estado: grupoEnUso(e, g.id) ? 'warning' : 'error', recurso: g.id, datos: { Region: 'us-east-1', 'Security Group Name': g.nombre, 'Security Group ID': g.id, Protocol: r.protocolo === '-1' ? 'All' : r.protocolo, Port: textoPuerto(r), 'IP Address': r.origen } });
        }
      }
      return { evaluados: lista.length, marcados };
    }
  },
  {
    id: 'ec2-detenidas',
    nombre: 'Amazon EC2 instances stopped',
    categoria: 'operational_excellence',
    plan: 'business',
    descripcion: 'Checks if there are Amazon EC2 instances that have been stopped. Stopped instances still incur charges for their attached Amazon EBS volumes and Elastic IP addresses.',
    criterios: ['Yellow: There are EC2 instances in the stopped state.'],
    accion: 'Review the stopped instances. If you no longer need them, create a backup and terminate them.',
    columnas: ['Region', 'Instance ID', 'Instance Name', 'Instance Type'],
    evaluar: (e) => {
      const lista = (e.instancias ?? []).filter((i) => i.estado !== 'terminated');
      return { evaluados: lista.length, marcados: lista.filter((i) => i.estado === 'stopped').map((i) => ({ estado: 'warning', recurso: i.id, datos: { Region: 'us-east-1', 'Instance ID': i.id, 'Instance Name': i.nombre || '–', 'Instance Type': i.tipo } })) };
    }
  }
];

function limite(usado, maximo, servicio, nombre) {
  const datos = { Region: 'us-east-1', Service: servicio, 'Limit Name': nombre, 'Limit Amount': String(maximo), 'Current Usage': String(usado) };
  if (usado >= maximo) return { evaluados: 1, marcados: [{ estado: 'error', recurso: nombre, datos }] };
  if (usado >= maximo * 0.8) return { evaluados: 1, marcados: [{ estado: 'warning', recurso: nombre, datos }] };
  return { evaluados: 1, marcados: [] };
}

export const CATEGORIAS_ADVISOR = [
  { id: 'cost_optimizing', nombre: 'Cost optimization' },
  { id: 'performance', nombre: 'Performance' },
  { id: 'security', nombre: 'Security' },
  { id: 'fault_tolerance', nombre: 'Fault tolerance' },
  { id: 'service_limits', nombre: 'Service limits' },
  { id: 'operational_excellence', nombre: 'Operational excellence' }
];

/** ¿El plan de soporte deja ver este chequeo? */
export const chequeoDisponible = (estado, chequeo) => chequeo.plan === 'basic' || (estado.costos?.planSoporte ?? 'basic') !== 'basic';

/**
 * «Refresh all checks» (o un solo chequeo con `chequeoId`). Guarda el
 * resultado: Trusted Advisor muestra lo de la última revisión, no lo de este
 * instante, así que después de corregir algo hay que refrescar.
 */
export function refrescarAdvisor(estado, chequeoId = null, { anotar: conBitacora = true } = {}, ahora = reloj.ahora()) {
  iniciar(estado);
  const a = estado.costos.advisor;
  const cuando = iso(ahora);
  const lista = CHEQUEOS_ADVISOR.filter((c) => !chequeoId || c.id === chequeoId);
  if (chequeoId && !lista.length) throw errorAws('InvalidParameterValueException', `Check ${chequeoId} does not exist.`);
  for (const ch of lista) {
    if (!chequeoDisponible(estado, ch)) {
      delete a.resultados[ch.id];
      continue;
    }
    let r;
    try {
      r = ch.evaluar(estado, ahora);
    } catch {
      r = { evaluados: 0, marcados: [] };
    }
    const marcados = r.marcados.slice(0, 50);
    const peor = marcados.some((m) => m.estado === 'error') ? 'error' : marcados.length ? 'warning' : 'ok';
    a.resultados[ch.id] = { estado: peor, evaluados: r.evaluados, marcados, revisado: cuando };
  }
  if (!chequeoId) a.revisado = cuando;
  if (conBitacora) anotar(estado, 'TrustedAdvisor', 'RefreshTrustedAdvisorCheck', chequeoId ?? 'all checks');
  return a;
}

/* ================================================================ avanzar */

function avanzarCostos(estado, ahora) {
  iniciar(estado);
  const c = estado.costos;
  let cambio = false;
  const mes = claveMes(ahora);
  if (!c.uso.mes) c.uso.mes = mes;
  if (c.uso.mes !== mes && c.uso.mes < mes) {
    cerrarMes(c, mes);
    cambio = true;
  }
  const ultimo = Number(c.uso.ultimo) || 0;
  if (!ultimo || ahora < ultimo) c.uso.ultimo = ahora;
  else if (ahora > ultimo) {
    const delta = Math.min(ahora - ultimo, DURACION_COSTOS.topeAvance);
    cobrar(estado, delta / DURACION_COSTOS.horaSimulada, ahora);
    c.uso.ultimo = ahora;
    // Cada 5 min avisa del gasto acumulado, para que la cuenta se guarde.
    if (Math.floor(ahora / DURACION_COSTOS.guardar) !== Math.floor(ultimo / DURACION_COSTOS.guardar)) cambio = true;
  }
  if (revisarPresupuestos(estado, ahora)) cambio = true;
  // Trusted Advisor revisa la cuenta la primera vez solo.
  if (!c.advisor.revisado) {
    refrescarAdvisor(estado, null, { anotar: false }, ahora);
    cambio = true;
  }
  // AWS Support contesta los casos.
  for (const caso of c.casos) {
    if (!caso.respuestaEn || caso.respuestaEn > ahora || caso.estado === 'resolved') continue;
    caso.mensajes.push({ de: 'aws', texto: respuestaAws(caso), t: iso(caso.respuestaEn) });
    if (caso.mensajes.length > 20) caso.mensajes.splice(1, caso.mensajes.length - 20);
    caso.estado = 'pending-customer-action';
    caso.respuestaEn = null;
    cambio = true;
  }
  return cambio;
}

registrarExtension({
  id: 'costos',
  orden: 80,
  iniciar,
  avanzar: avanzarCostos,
  funciones: { costoMensual }
});
