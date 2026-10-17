// ---------------------------------------------------------------------------
// LA CUENTA DE AWS SIMULADA
//
// Todo lo que el alumno crea en la consola simulada vive en un objeto JSON (el
// «estado»). Este archivo define cómo es ese objeto y las únicas acciones que
// lo cambian. Es puro (sin window ni document): la consola lo usa en el
// navegador y el servidor lo importa para calificar.
//
// Cada acción recibe (estado, parámetros), MUTA el estado, valida igual que
// AWS y, si algo está mal, lanza un ErrorAws con el mensaje en inglés que
// mostraría la consola real. Devuelve el recurso creado o cambiado y anota en
// la bitácora lo que pasó.
//
// La forma del estado (los campos van en español; los valores de AWS, como las
// clases de S3 o los tipos de volumen, en su forma original):
//
// {
//   version: 1,
//   cuenta:   { id: '123456789012', region: 'us-east-1', usuario, ipCasa },
//   vpcs:     [{ id, nombre, cidr, porDefecto, estado: 'available', tenancy, dnsHostnames, dnsResolution, creado }],
//   subredes: [{ id, nombre, vpcId, cidr, az, ipPublicaAuto, porDefecto, creado }],
//   tablasRutas: [{ id, nombre, vpcId, principal, rutas: [{ destino, objetivo }], asociaciones: [subredId] }],
//               // objetivo: 'local' | 'igw-…' | 'nat-…'. Una subred sin asociación
//               // explícita usa la tabla principal de su VPC.
//   igws:     [{ id, nombre, vpcId | null }],
//   nats:     [{ id, nombre, subredId, vpcId, eipId, tipo: 'public', estado, hasta?, siguiente?, motivo? }],
//   eips:     [{ id: 'eipalloc-…', ip, nombre, instanciaId | null, natId | null }],
//   nacls:    [{ id, nombre, vpcId, porDefecto, entrada: [regla], salida: [regla], subredes: [subredId] }],
//               // regla: { numero, protocolo: '-1'|'tcp'|'udp'|'icmp', desde, hasta, cidr, accion: 'allow'|'deny' }
//               // (más la regla «*» que niega todo, implícita: no se guarda)
//   gruposSeguridad: [{ id, nombre, descripcion, vpcId, porDefecto, entrada: [regla], salida: [regla] }],
//               // regla: { id: 'sgr-…', protocolo: '-1'|'tcp'|'udp'|'icmp', desde, hasta, origen, descripcion }
//               // origen: un CIDR ('0.0.0.0/0') o el id de otro grupo ('sg-…')
//   instancias: [{ id, nombre, ami, tipo, estado, hasta?, siguiente?, desde, subredId, vpcId, az,
//                  ipPrivada, ipPublica | null, autoIpPublica, eipId | null, gruposSeguridad: [sgId],
//                  llave | null, userData, userDataArranque | null, arranques, rolIam | null,
//                  volumenes: [volId], lanzada }],
//   volumenes: [{ id, nombre, tipo, tamano, iops, az, estado, hasta?, siguiente?, instanciaId | null,
//                 dispositivo | null, raiz, eliminarAlTerminar, cifrado, snapshotId | null, creado }],
//   snapshots: [{ id, nombre, volumenId, tamano, descripcion, estado, hasta?, siguiente?, creado, cifrado }],
//   llaves:    [{ id, nombre, tipo: 'rsa'|'ed25519', formato: 'pem'|'ppk', huella, creado }],
//   buckets:   [{ nombre, region, creado, propiedadObjetos, bloqueoPublico: { aclsNuevas, aclsCualquiera,
//                 politicasNuevas, politicasCualquiera }, versionado: 'Disabled'|'Enabled'|'Suspended',
//                 cifrado: { tipo: 'SSE-S3'|'SSE-KMS'|'DSSE-KMS', bucketKey }, sitioWeb: null | { indice, error },
//                 politica: null | texto, ciclo: [reglaCiclo], objetos: [objeto], etiquetas: [{ llave, valor }] }],
//               // reglaCiclo: { nombre, estado: 'Enabled'|'Disabled', prefijo: null | 'logs/',
//               //   transiciones: [{ dias, clase }], transicionesNoActuales: [{ dias, clase }],
//               //   expiracionDias: null | n, borrarNoActualesDias: null | n }
//               // objeto: { llave, tamano, tipo, clase, versionId, actual, marcadorBorrado, modificado }
//   iam: {
//     usuarios: [{ nombre, arn, creado, consola, cambiarContrasena, grupos: [nombre], politicas: [nombre],
//                  mfa: [{ nombre, tipo }], llavesAcceso: [{ id, estado: 'Active'|'Inactive', creado }] }],
//     grupos:   [{ nombre, arn, creado, politicas: [nombre] }],
//     roles:    [{ nombre, arn, creado, servicio: 'ec2.amazonaws.com', descripcion, politicas: [nombre] }],
//     raizMfa: false
//   },
//   bitacora: [{ t, servicio, accion, detalle }]   // lo último que hizo el alumno (máximo 500)
// }
// ---------------------------------------------------------------------------

/* ================================================================ errores */

export class ErrorAws extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = 'ErrorAws';
    this.codigo = codigo;
  }
}

const error = (codigo, mensaje) => new ErrorAws(codigo, mensaje);

/* ============================================================== el reloj */

// Se puede cambiar en pruebas: reloj.ahora = () => fijo.
export const reloj = { ahora: () => Date.now() };
const iso = (ms = reloj.ahora()) => new Date(ms).toISOString();

// Cuánto tarda cada transición, en milisegundos.
export const DURACION = {
  instanciaArranca: 8000,
  instanciaSeDetiene: 6000,
  instanciaTermina: 5000,
  volumenSeCrea: 4000,
  snapshotSeCompleta: 12000,
  natSeCrea: 15000,
  natSeBorra: 6000
};

/* ================================================================ azar */

function aleatorio() {
  const c = globalThis.crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0] / 4294967296;
  return Math.random();
}

const hexAzar = (n) => Array.from({ length: n }, () => Math.floor(aleatorio() * 16).toString(16)).join('');

/** Un id con la forma de AWS: vpc-0a1b2c3d4e5f67890 (17 caracteres hexadecimales). */
export const nuevoId = (prefijo) => `${prefijo}-0${hexAzar(16)}`;

/* ============================================================ direcciones */

export function ipAEntero(ip) {
  const partes = String(ip).trim().split('.');
  if (partes.length !== 4) return null;
  let n = 0;
  for (const p of partes) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

export const enteroAIp = (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');

/**
 * '10.0.1.0/24' → { red, prefijo, inicio, fin, total, texto }. null si no es un
 * CIDR válido o si la dirección no es el inicio de su bloque (10.0.1.5/24).
 */
export function parsearCidr(texto) {
  const m = /^\s*(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})\s*$/.exec(String(texto ?? ''));
  if (!m) return null;
  const ip = ipAEntero(m[1]);
  const prefijo = Number(m[2]);
  if (ip === null || prefijo > 32) return null;
  const total = 2 ** (32 - prefijo);
  const inicio = prefijo === 0 ? 0 : ip - (ip % total);
  if (inicio !== ip) return null;
  return { red: m[1], prefijo, inicio, fin: inicio + total - 1, total, texto: `${m[1]}/${prefijo}` };
}

export const cidrValido = (texto) => parsearCidr(texto) !== null;

/** ¿El bloque `chico` cabe completo dentro de `grande`? */
export function cidrContiene(grande, chico) {
  const g = parsearCidr(grande);
  const c = parsearCidr(chico);
  return Boolean(g && c && c.inicio >= g.inicio && c.fin <= g.fin);
}

export function cidrTraslapa(a, b) {
  const x = parsearCidr(a);
  const y = parsearCidr(b);
  return Boolean(x && y && x.inicio <= y.fin && y.inicio <= x.fin);
}

export function ipEnCidr(ip, cidr) {
  const n = ipAEntero(ip);
  const c = parsearCidr(cidr);
  return n !== null && c !== null && n >= c.inicio && n <= c.fin;
}

/** Direcciones utilizables de una subred: AWS reserva las 4 primeras y la última. */
export const ipsDisponibles = (cidr) => {
  const c = parsearCidr(cidr);
  return c ? Math.max(c.total - 5, 0) : 0;
};

/* ============================================================== catálogos */

export const REGION = { codigo: 'us-east-1', nombre: 'US East (N. Virginia)', corto: 'N. Virginia' };

export const ZONAS = ['us-east-1a', 'us-east-1b', 'us-east-1c', 'us-east-1d', 'us-east-1e', 'us-east-1f'];
export const ID_ZONA = {
  'us-east-1a': 'use1-az6',
  'us-east-1b': 'use1-az1',
  'us-east-1c': 'use1-az2',
  'us-east-1d': 'use1-az4',
  'us-east-1e': 'use1-az3',
  'us-east-1f': 'use1-az5'
};

// gestor: con qué se instalan paquetes (red.js lo usa para saber si el user data funciona).
export const AMIS = [
  {
    id: 'ami-0453ec754f44f9a4a',
    clave: 'al2023',
    familia: 'Amazon Linux',
    nombre: 'Amazon Linux 2023 AMI',
    descripcion: 'Amazon Linux 2023 is a modern, general purpose Linux-based OS that comes with 5 years of long term support.',
    so: 'linux',
    gestor: 'dnf',
    usuario: 'ec2-user',
    discoMinimo: 8,
    capaGratuita: true
  },
  {
    id: 'ami-0c02fb55956c7d316',
    clave: 'al2',
    familia: 'Amazon Linux',
    nombre: 'Amazon Linux 2 AMI (HVM) - Kernel 5.10, SSD Volume Type',
    descripcion: 'Amazon Linux 2 comes with five years support.',
    so: 'linux',
    gestor: 'yum',
    usuario: 'ec2-user',
    discoMinimo: 8,
    capaGratuita: true
  },
  {
    id: 'ami-0e86e20dae9224db8',
    clave: 'ubuntu',
    familia: 'Ubuntu',
    nombre: 'Ubuntu Server 24.04 LTS (HVM), SSD Volume Type',
    descripcion: 'Ubuntu Server 24.04 LTS (HVM), EBS General Purpose (SSD) Volume Type.',
    so: 'linux',
    gestor: 'apt',
    usuario: 'ubuntu',
    discoMinimo: 8,
    capaGratuita: true
  },
  {
    id: 'ami-0888db1202897905c',
    clave: 'windows',
    familia: 'Windows',
    nombre: 'Microsoft Windows Server 2022 Base',
    descripcion: 'Microsoft Windows 2022 Datacenter edition.',
    so: 'windows',
    gestor: null,
    usuario: 'Administrator',
    discoMinimo: 30,
    capaGratuita: true
  },
  {
    id: 'ami-0583d8c7a9c35822c',
    clave: 'redhat',
    familia: 'Red Hat',
    nombre: 'Red Hat Enterprise Linux 9 (HVM), SSD Volume Type',
    descripcion: 'Red Hat Enterprise Linux version 9 (HVM), EBS General Purpose (SSD) Volume Type.',
    so: 'linux',
    gestor: 'dnf',
    usuario: 'ec2-user',
    discoMinimo: 10,
    capaGratuita: true
  },
  {
    id: 'ami-064519b8c76274859',
    clave: 'debian',
    familia: 'Debian',
    nombre: 'Debian 12 (HVM), SSD Volume Type',
    descripcion: 'Debian 12 (20240717-1811).',
    so: 'linux',
    gestor: 'apt',
    usuario: 'admin',
    discoMinimo: 8,
    capaGratuita: true
  }
];
export const ami = (idOClave) => AMIS.find((a) => a.id === idOClave || a.clave === idOClave) ?? null;

// precio: dólares por hora, On-Demand, Linux, us-east-1.
export const TIPOS_INSTANCIA = [
  { tipo: 't2.nano', familia: 't2', vcpu: 1, memoria: 0.5, precio: 0.0058, capaGratuita: false },
  { tipo: 't2.micro', familia: 't2', vcpu: 1, memoria: 1, precio: 0.0116, capaGratuita: true },
  { tipo: 't2.small', familia: 't2', vcpu: 1, memoria: 2, precio: 0.023, capaGratuita: false },
  { tipo: 't2.medium', familia: 't2', vcpu: 2, memoria: 4, precio: 0.0464, capaGratuita: false },
  { tipo: 't3.micro', familia: 't3', vcpu: 2, memoria: 1, precio: 0.0104, capaGratuita: true },
  { tipo: 't3.small', familia: 't3', vcpu: 2, memoria: 2, precio: 0.0208, capaGratuita: false },
  { tipo: 't3.medium', familia: 't3', vcpu: 2, memoria: 4, precio: 0.0416, capaGratuita: false },
  { tipo: 'm5.large', familia: 'm5', vcpu: 2, memoria: 8, precio: 0.096, capaGratuita: false },
  { tipo: 'c5.large', familia: 'c5', vcpu: 2, memoria: 4, precio: 0.085, capaGratuita: false },
  { tipo: 'r5.large', familia: 'r5', vcpu: 2, memoria: 16, precio: 0.126, capaGratuita: false }
];
export const tipoInstancia = (tipo) => TIPOS_INSTANCIA.find((t) => t.tipo === tipo) ?? null;

export const TIPOS_VOLUMEN = [
  { tipo: 'gp3', nombre: 'General Purpose SSD (gp3)', min: 1, max: 16384, iops: 3000 },
  { tipo: 'gp2', nombre: 'General Purpose SSD (gp2)', min: 1, max: 16384, iops: 100 },
  { tipo: 'io1', nombre: 'Provisioned IOPS SSD (io1)', min: 4, max: 16384, iops: 100 },
  { tipo: 'io2', nombre: 'Provisioned IOPS SSD (io2)', min: 4, max: 65536, iops: 100 },
  { tipo: 'st1', nombre: 'Throughput Optimized HDD (st1)', min: 125, max: 16384, iops: null },
  { tipo: 'sc1', nombre: 'Cold HDD (sc1)', min: 125, max: 16384, iops: null },
  { tipo: 'standard', nombre: 'Magnetic (standard)', min: 1, max: 1024, iops: null }
];
export const tipoVolumen = (tipo) => TIPOS_VOLUMEN.find((t) => t.tipo === tipo) ?? null;

// orden: en qué sentido puede bajar un objeto con el ciclo de vida.
// minimoDias: lo mínimo que exige una transición a esa clase desde la creación.
export const CLASES_S3 = [
  { clase: 'STANDARD', nombre: 'Standard', orden: 0, minimoDias: 0 },
  { clase: 'INTELLIGENT_TIERING', nombre: 'Intelligent-Tiering', orden: 1, minimoDias: 0 },
  { clase: 'STANDARD_IA', nombre: 'Standard-IA', orden: 2, minimoDias: 30 },
  { clase: 'ONEZONE_IA', nombre: 'One Zone-IA', orden: 3, minimoDias: 30 },
  { clase: 'GLACIER_IR', nombre: 'Glacier Instant Retrieval', orden: 4, minimoDias: 0 },
  { clase: 'GLACIER', nombre: 'Glacier Flexible Retrieval (formerly Glacier)', orden: 5, minimoDias: 0 },
  { clase: 'DEEP_ARCHIVE', nombre: 'Glacier Deep Archive', orden: 6, minimoDias: 0 }
];
export const claseS3 = (clase) => CLASES_S3.find((c) => c.clase === clase) ?? null;

// Las políticas administradas por AWS que ofrece la consola simulada.
export const POLITICAS_IAM = [
  { nombre: 'AdministratorAccess', tipo: 'AWS managed - job function', descripcion: 'Provides full access to AWS services and resources.', servicio: '*', acceso: 'escritura' },
  { nombre: 'PowerUserAccess', tipo: 'AWS managed - job function', descripcion: 'Provides full access to AWS services and resources, but does not allow management of Users and groups.', servicio: '*', acceso: 'escritura' },
  { nombre: 'ReadOnlyAccess', tipo: 'AWS managed - job function', descripcion: 'Provides read-only access to AWS services and resources.', servicio: '*', acceso: 'lectura' },
  { nombre: 'ViewOnlyAccess', tipo: 'AWS managed - job function', descripcion: 'This policy grants permissions to view resources and basic metadata across all AWS services.', servicio: '*', acceso: 'lectura' },
  { nombre: 'Billing', tipo: 'AWS managed - job function', descripcion: 'Grants permissions for billing and cost management.', servicio: 'billing', acceso: 'escritura' },
  { nombre: 'AWSBillingReadOnlyAccess', tipo: 'AWS managed', descripcion: 'Allows users to view bills on the Billing Console.', servicio: 'billing', acceso: 'lectura' },
  { nombre: 'SecurityAudit', tipo: 'AWS managed - job function', descripcion: 'The security audit template grants access to read security configuration metadata.', servicio: '*', acceso: 'lectura' },
  { nombre: 'AmazonEC2FullAccess', tipo: 'AWS managed', descripcion: 'Provides full access to Amazon EC2 via the AWS Management Console.', servicio: 'ec2', acceso: 'escritura' },
  { nombre: 'AmazonEC2ReadOnlyAccess', tipo: 'AWS managed', descripcion: 'Provides read only access to Amazon EC2 via the AWS Management Console.', servicio: 'ec2', acceso: 'lectura' },
  { nombre: 'AmazonS3FullAccess', tipo: 'AWS managed', descripcion: 'Provides full access to all buckets via the AWS Management Console.', servicio: 's3', acceso: 'escritura' },
  { nombre: 'AmazonS3ReadOnlyAccess', tipo: 'AWS managed', descripcion: 'Provides read only access to all buckets via the AWS Management Console.', servicio: 's3', acceso: 'lectura' },
  { nombre: 'AmazonVPCFullAccess', tipo: 'AWS managed', descripcion: 'Provides full access to Amazon VPC via the AWS Management Console.', servicio: 'vpc', acceso: 'escritura' },
  { nombre: 'AmazonVPCReadOnlyAccess', tipo: 'AWS managed', descripcion: 'Provides read only access to Amazon VPC via the AWS Management Console.', servicio: 'vpc', acceso: 'lectura' },
  { nombre: 'IAMFullAccess', tipo: 'AWS managed', descripcion: 'Provides full access to IAM via the AWS Management Console.', servicio: 'iam', acceso: 'escritura' },
  { nombre: 'IAMReadOnlyAccess', tipo: 'AWS managed', descripcion: 'Provides read only access to IAM via the AWS Management Console.', servicio: 'iam', acceso: 'lectura' },
  { nombre: 'IAMUserChangePassword', tipo: 'AWS managed', descripcion: 'Provides the ability for an IAM user to change their own password.', servicio: 'iam', acceso: 'propio' },
  { nombre: 'AmazonRDSFullAccess', tipo: 'AWS managed', descripcion: 'Provides full access to Amazon RDS via the AWS Management Console.', servicio: 'rds', acceso: 'escritura' },
  { nombre: 'AmazonRDSReadOnlyAccess', tipo: 'AWS managed', descripcion: 'Provides read only access to Amazon RDS via the AWS Management Console.', servicio: 'rds', acceso: 'lectura' },
  { nombre: 'AmazonDynamoDBFullAccess', tipo: 'AWS managed', descripcion: 'Provides full access to Amazon DynamoDB via the AWS Management Console.', servicio: 'dynamodb', acceso: 'escritura' },
  { nombre: 'CloudWatchReadOnlyAccess', tipo: 'AWS managed', descripcion: 'Provides read only access to CloudWatch.', servicio: 'cloudwatch', acceso: 'lectura' },
  { nombre: 'AWSCloudTrail_ReadOnlyAccess', tipo: 'AWS managed', descripcion: 'Provides read only access to AWS CloudTrail.', servicio: 'cloudtrail', acceso: 'lectura' },
  { nombre: 'AmazonSSMManagedInstanceCore', tipo: 'AWS managed', descripcion: 'The policy for Amazon EC2 Role to enable AWS Systems Manager service core functionality.', servicio: 'ssm', acceso: 'escritura' }
];
export const politicaIam = (nombre) => POLITICAS_IAM.find((p) => p.nombre === nombre) ?? null;

// Los tipos de regla que ofrece el editor de grupos de seguridad y de NACL.
// `rango: true` = el alumno escribe los puertos; `todos` = no lleva puertos.
export const TIPOS_REGLA = [
  { tipo: 'Custom TCP', protocolo: 'tcp', desde: null, hasta: null, rango: true },
  { tipo: 'Custom UDP', protocolo: 'udp', desde: null, hasta: null, rango: true },
  { tipo: 'Custom ICMP - IPv4', protocolo: 'icmp', desde: -1, hasta: -1 },
  { tipo: 'All TCP', protocolo: 'tcp', desde: 0, hasta: 65535 },
  { tipo: 'All UDP', protocolo: 'udp', desde: 0, hasta: 65535 },
  { tipo: 'All ICMP - IPv4', protocolo: 'icmp', desde: -1, hasta: -1 },
  { tipo: 'All traffic', protocolo: '-1', desde: null, hasta: null, todos: true },
  { tipo: 'SSH', protocolo: 'tcp', desde: 22, hasta: 22 },
  { tipo: 'HTTP', protocolo: 'tcp', desde: 80, hasta: 80 },
  { tipo: 'HTTPS', protocolo: 'tcp', desde: 443, hasta: 443 },
  { tipo: 'RDP', protocolo: 'tcp', desde: 3389, hasta: 3389 },
  { tipo: 'MYSQL/Aurora', protocolo: 'tcp', desde: 3306, hasta: 3306 },
  { tipo: 'PostgreSQL', protocolo: 'tcp', desde: 5432, hasta: 5432 },
  { tipo: 'MSSQL', protocolo: 'tcp', desde: 1433, hasta: 1433 },
  { tipo: 'SMTP', protocolo: 'tcp', desde: 25, hasta: 25 },
  { tipo: 'DNS (UDP)', protocolo: 'udp', desde: 53, hasta: 53 },
  { tipo: 'NFS', protocolo: 'tcp', desde: 2049, hasta: 2049 }
];

/** El nombre con que la consola muestra una regla («HTTP», «Custom TCP»…). */
export function tipoDeRegla({ protocolo, desde, hasta }) {
  if (protocolo === '-1') return 'All traffic';
  const fija = TIPOS_REGLA.find((t) => !t.rango && !t.todos && t.protocolo === protocolo && t.desde === desde && t.hasta === hasta);
  if (fija) return fija.tipo;
  return protocolo === 'udp' ? 'Custom UDP' : protocolo === 'icmp' ? 'Custom ICMP - IPv4' : 'Custom TCP';
}

/** «80», «1024 - 65535», «All» */
export function textoPuertos({ protocolo, desde, hasta }) {
  if (protocolo === '-1' || desde === null || desde === undefined) return 'All';
  if (protocolo === 'icmp') return 'All';
  if (desde === 0 && hasta === 65535) return 'All';
  return desde === hasta ? String(desde) : `${desde} - ${hasta}`;
}

export const textoProtocolo = (p) => ({ '-1': 'All', tcp: 'TCP', udp: 'UDP', icmp: 'ICMP' })[p] ?? p;

// Nombres de bucket que «ya tiene otra cuenta en el mundo».
export const BUCKETS_AJENOS = new Set([
  'fotos', 'photos', 'test', 'prueba', 'pruebas', 'backup', 'backups', 'respaldo', 'respaldos', 'datos', 'data',
  'web', 'website', 'images', 'imagenes', 'bucket', 'mi-bucket', 'my-bucket', 'files', 'archivos', 'logs',
  'documentos', 'docs', 'media', 'static', 'assets', 'cafeteria', 'tienda', 'veterinaria', 'ferreteria', 'escuela'
]);

/* ============================================================= utilidades */

const buscar = (lista, id, tipo, codigo) => {
  const r = lista.find((x) => x.id === id);
  if (!r) throw error(codigo ?? 'InvalidID.NotFound', `The ${tipo} ID '${id ?? ''}' does not exist`);
  return r;
};

export const vpcDe = (estado, id) => estado.vpcs.find((v) => v.id === id) ?? null;
export const subredDe = (estado, id) => estado.subredes.find((s) => s.id === id) ?? null;
export const instanciaDe = (estado, id) => estado.instancias.find((i) => i.id === id) ?? null;
export const grupoDe = (estado, id) => estado.gruposSeguridad.find((g) => g.id === id) ?? null;
export const igwDe = (estado, id) => estado.igws.find((g) => g.id === id) ?? null;
export const bucketDe = (estado, nombre) => estado.buckets.find((b) => b.nombre === nombre) ?? null;

/** La tabla de rutas que usa una subred: la asociada a mano o, si no, la principal de su VPC. */
export function tablaDeSubred(estado, subredId) {
  const subred = subredDe(estado, subredId);
  if (!subred) return null;
  return (
    estado.tablasRutas.find((t) => t.asociaciones.includes(subredId)) ??
    estado.tablasRutas.find((t) => t.vpcId === subred.vpcId && t.principal) ??
    null
  );
}

export const naclDeSubred = (estado, subredId) => estado.nacls.find((n) => n.subredes.includes(subredId)) ?? null;
export const igwDeVpc = (estado, vpcId) => estado.igws.find((g) => g.vpcId === vpcId) ?? null;
export const vivas = (estado) => estado.instancias.filter((i) => i.estado !== 'terminated');

/** Las políticas que tiene un usuario: las suyas y las de sus grupos. */
export function politicasEfectivas(estado, nombreUsuario) {
  const u = estado.iam.usuarios.find((x) => x.nombre === nombreUsuario);
  if (!u) return [];
  const deGrupos = u.grupos.flatMap((g) => estado.iam.grupos.find((x) => x.nombre === g)?.politicas ?? []);
  return [...new Set([...u.politicas, ...deGrupos])];
}

/** Anota en la bitácora. El docente ve aquí lo que fue haciendo el alumno. */
export function anotar(estado, servicio, accion, detalle = '') {
  estado.bitacora.push({ t: iso(), servicio, accion, detalle: String(detalle).slice(0, 300) });
  if (estado.bitacora.length > 500) estado.bitacora.splice(0, estado.bitacora.length - 500);
}

const nombreLimpio = (v, max = 256) => String(v ?? '').trim().slice(0, max);

// Las IP públicas que AWS reparte en us-east-1 salen de bloques como estos.
const BLOQUES_PUBLICOS = [
  [3, 80, 95],
  [3, 208, 239],
  [18, 204, 215],
  [34, 200, 239],
  [44, 192, 223],
  [52, 0, 95],
  [54, 80, 240]
];

function ipPublicaNueva(estado) {
  const usadas = new Set([...estado.instancias.map((i) => i.ipPublica), ...estado.eips.map((e) => e.ip)]);
  for (;;) {
    const [a, min, max] = BLOQUES_PUBLICOS[Math.floor(aleatorio() * BLOQUES_PUBLICOS.length)];
    const ip = `${a}.${min + Math.floor(aleatorio() * (max - min + 1))}.${Math.floor(aleatorio() * 256)}.${1 + Math.floor(aleatorio() * 254)}`;
    if (!usadas.has(ip)) return ip;
  }
}

function ipPrivadaNueva(estado, subred) {
  const c = parsearCidr(subred.cidr);
  const usadas = new Set(estado.instancias.filter((i) => i.subredId === subred.id && i.estado !== 'terminated').map((i) => i.ipPrivada));
  const utiles = c.total - 5;
  if (utiles <= usadas.size) throw error('InsufficientFreeAddressesInSubnet', `There are not enough free addresses in subnet '${subred.id}' to satisfy the requested number of instances.`);
  let n = Math.floor(aleatorio() * Math.min(utiles, 200));
  for (;;) {
    const ip = enteroAIp(c.inicio + 4 + (n % utiles));
    if (!usadas.has(ip)) return ip;
    n += 1;
  }
}

/** El nombre DNS público que AWS da a una IP pública en us-east-1. */
export const dnsPublico = (ip) => (ip ? `ec2-${ip.replace(/\./g, '-')}.compute-1.amazonaws.com` : null);
export const dnsPrivado = (ip) => (ip ? `ip-${ip.replace(/\./g, '-')}.ec2.internal` : null);

/* ======================================================== la cuenta nueva */

const reglaTodoNacl = (numero) => ({ numero, protocolo: '-1', desde: null, hasta: null, cidr: '0.0.0.0/0', accion: 'allow' });
const reglaSalidaSg = () => ({ id: nuevoId('sgr'), protocolo: '-1', desde: null, hasta: null, origen: '0.0.0.0/0', descripcion: '' });

/** Lo que AWS crea solo con cada VPC: tabla principal, NACL y grupo por omisión. */
function acompananteDeVpc(estado, vpc) {
  estado.tablasRutas.push({ id: nuevoId('rtb'), nombre: '', vpcId: vpc.id, principal: true, rutas: [{ destino: vpc.cidr, objetivo: 'local' }], asociaciones: [] });
  estado.nacls.push({ id: nuevoId('acl'), nombre: '', vpcId: vpc.id, porDefecto: true, entrada: [reglaTodoNacl(100)], salida: [reglaTodoNacl(100)], subredes: [] });
  const sg = { id: nuevoId('sg'), nombre: 'default', descripcion: 'default VPC security group', vpcId: vpc.id, porDefecto: true, entrada: [], salida: [reglaSalidaSg()] };
  sg.entrada.push({ id: nuevoId('sgr'), protocolo: '-1', desde: null, hasta: null, origen: sg.id, descripcion: '' });
  estado.gruposSeguridad.push(sg);
}

/**
 * Una cuenta recién abierta en us-east-1: solo la VPC por omisión (172.31.0.0/16)
 * con una subred pública por zona, su Internet Gateway y lo que trae cada VPC.
 * `datos` sale de datosAlumno() (public/labs/comun.js).
 */
export function cuentaNueva(datos = {}) {
  const estado = {
    version: 1,
    cuenta: {
      id: datos.cuentaId ?? '123456789012',
      region: REGION.codigo,
      usuario: datos.nombre || 'alumno',
      ipCasa: datos.ipCasa ?? '187.190.20.30'
    },
    creada: iso(),
    vpcs: [],
    subredes: [],
    tablasRutas: [],
    igws: [],
    nats: [],
    eips: [],
    nacls: [],
    gruposSeguridad: [],
    instancias: [],
    volumenes: [],
    snapshots: [],
    llaves: [],
    buckets: [],
    iam: { usuarios: [], grupos: [], roles: [], raizMfa: false },
    bitacora: []
  };

  const vpc = { id: nuevoId('vpc'), nombre: '', cidr: '172.31.0.0/16', porDefecto: true, estado: 'available', tenancy: 'default', dnsHostnames: true, dnsResolution: true, creado: iso() };
  estado.vpcs.push(vpc);
  acompananteDeVpc(estado, vpc);
  const igw = { id: nuevoId('igw'), nombre: '', vpcId: vpc.id };
  estado.igws.push(igw);
  estado.tablasRutas.at(-1).rutas.push({ destino: '0.0.0.0/0', objetivo: igw.id });
  const nacl = estado.nacls.at(-1);
  ZONAS.forEach((az, i) => {
    const subred = { id: nuevoId('subnet'), nombre: '', vpcId: vpc.id, cidr: `172.31.${i * 16}.0/20`, az, ipPublicaAuto: true, porDefecto: true, creado: iso() };
    estado.subredes.push(subred);
    nacl.subredes.push(subred.id);
  });
  return estado;
}

/* ================================================================ la red */

function validarBloque(cidr, { min = 16, max = 28 } = {}) {
  const c = parsearCidr(cidr);
  if (!c) throw error('InvalidParameterValue', `Value (${cidr}) for parameter cidrBlock is invalid. This is not a valid CIDR block.`);
  if (c.prefijo < min || c.prefijo > max) throw error('InvalidVpc.Range', `The CIDR '${c.texto}' is invalid. CIDR block size must be between /${min} and /${max}.`);
  return c;
}

export function crearVpc(estado, { nombre, cidr, tenancy = 'default' } = {}) {
  const c = validarBloque(cidr);
  if (estado.vpcs.length >= 5) throw error('VpcLimitExceeded', 'The maximum number of VPCs has been reached.');
  const vpc = { id: nuevoId('vpc'), nombre: nombreLimpio(nombre), cidr: c.texto, porDefecto: false, estado: 'available', tenancy, dnsHostnames: false, dnsResolution: true, creado: iso() };
  estado.vpcs.push(vpc);
  acompananteDeVpc(estado, vpc);
  anotar(estado, 'VPC', 'CreateVpc', `${vpc.id} ${vpc.nombre || '(sin nombre)'} ${vpc.cidr}`);
  return vpc;
}

/**
 * «VPC and more»: la VPC y, de una vez, subredes, Internet Gateway, tablas de
 * rutas y NAT. Mismos nombres y rangos que pone la consola real para una /16.
 * Igual que en AWS, las subredes públicas quedan SIN asignar IP pública
 * automática: hay que activarla al lanzar la instancia o en la subred.
 */
export function crearVpcCompleta(estado, { prefijo = 'project', cidr, zonas = 2, publicas = 2, privadas = 2, nat = 'none', primeraZona = 0, bloquesPublicos = [], bloquesPrivados = [] } = {}) {
  const c = validarBloque(cidr);
  const pre = nombreLimpio(prefijo, 60) || 'project';
  const azs = ZONAS.slice(primeraZona, primeraZona + Math.max(1, Math.min(3, zonas)));
  if (publicas !== 0 && publicas !== azs.length) throw error('InvalidParameterValue', 'The number of public subnets must be 0 or equal to the number of Availability Zones.');
  if (privadas !== 0 && privadas !== azs.length && privadas !== azs.length * 2) throw error('InvalidParameterValue', 'The number of private subnets must be 0, or 1 or 2 per Availability Zone.');
  if (nat !== 'none' && publicas === 0) throw error('InvalidParameterValue', 'NAT gateways require at least one public subnet.');

  const vpc = crearVpc(estado, { nombre: `${pre}-vpc`, cidr: c.texto });
  vpc.dnsHostnames = true;
  // Cada subred es un bloque del tamaño de la VPC + 4 (/16 → /20), como en la consola.
  const tamano = Math.min(c.prefijo + 4, 28);
  const paso = 2 ** (32 - tamano);
  const bloque = (n) => `${enteroAIp(c.inicio + n * paso)}/${tamano}`;
  // «Customize subnets CIDR blocks»: lo que el alumno escribió reemplaza al /20 sugerido.
  const propio = (lista, i, sugerido) => (lista[i] && String(lista[i]).trim()) || sugerido;
  const mitad = 2 ** (tamano - c.prefijo) / 2;

  const pub = azs.slice(0, publicas).map((az, i) =>
    crearSubred(estado, { vpcId: vpc.id, nombre: `${pre}-subnet-public${i + 1}-${az}`, az, cidr: propio(bloquesPublicos, i, bloque(i)) })
  );
  const priv = [];
  for (let i = 0; i < privadas; i++) {
    const az = azs[i % azs.length];
    priv.push(crearSubred(estado, { vpcId: vpc.id, nombre: `${pre}-subnet-private${i + 1}-${az}`, az, cidr: propio(bloquesPrivados, i, bloque(mitad + i)) }));
  }

  let igw = null;
  if (pub.length) {
    igw = crearIgw(estado, { nombre: `${pre}-igw` });
    adjuntarIgw(estado, igw.id, vpc.id);
    const rt = crearTablaRutas(estado, { vpcId: vpc.id, nombre: `${pre}-rtb-public` });
    editarRutas(estado, rt.id, [{ destino: '0.0.0.0/0', objetivo: igw.id }]);
    asociarSubredes(estado, rt.id, pub.map((s) => s.id));
  }

  const nats = [];
  if (nat !== 'none') {
    const cuantas = nat === 'peraz' ? pub.length : 1;
    for (let i = 0; i < cuantas; i++) {
      const eip = asignarEip(estado, { nombre: `${pre}-eip-${pub[i].az}` });
      nats.push(crearNat(estado, { nombre: `${pre}-nat-public${i + 1}-${pub[i].az}`, subredId: pub[i].id, eipId: eip.id }));
    }
  }
  priv.forEach((s, i) => {
    const rt = crearTablaRutas(estado, { vpcId: vpc.id, nombre: `${pre}-rtb-private${i + 1}-${s.az}` });
    if (nats.length) {
      const natAz = nats.find((n) => subredDe(estado, n.subredId).az === s.az) ?? nats[0];
      editarRutas(estado, rt.id, [{ destino: '0.0.0.0/0', objetivo: natAz.id }]);
    }
    asociarSubredes(estado, rt.id, [s.id]);
  });

  anotar(estado, 'VPC', 'CreateVpc (VPC and more)', `${vpc.id} ${pub.length} públicas, ${priv.length} privadas, NAT: ${nat}`);
  return { vpc, publicas: pub, privadas: priv, igw, nats };
}

export function editarVpc(estado, vpcId, { nombre, dnsHostnames, dnsResolution } = {}) {
  const vpc = buscar(estado.vpcs, vpcId, 'vpc', 'InvalidVpcID.NotFound');
  if (nombre !== undefined) vpc.nombre = nombreLimpio(nombre);
  if (dnsHostnames !== undefined) vpc.dnsHostnames = Boolean(dnsHostnames);
  if (dnsResolution !== undefined) vpc.dnsResolution = Boolean(dnsResolution);
  anotar(estado, 'VPC', 'ModifyVpcAttribute', vpc.id);
  return vpc;
}

/**
 * «Delete VPC» de la consola: borra también sus subredes, tablas, NACL, grupos
 * y desconecta y borra su Internet Gateway. No se puede si tiene instancias o
 * NAT gateways vivos.
 */
export function eliminarVpc(estado, vpcId) {
  const vpc = buscar(estado.vpcs, vpcId, 'vpc', 'InvalidVpcID.NotFound');
  if (vivas(estado).some((i) => i.vpcId === vpcId)) {
    throw error('DependencyViolation', `The vpc '${vpcId}' has dependencies and cannot be deleted. Terminate its instances first.`);
  }
  if (estado.nats.some((n) => n.vpcId === vpcId && n.estado !== 'deleted')) {
    throw error('DependencyViolation', `The vpc '${vpcId}' has dependencies and cannot be deleted. Delete its NAT gateways first.`);
  }
  const subredes = new Set(estado.subredes.filter((s) => s.vpcId === vpcId).map((s) => s.id));
  estado.subredes = estado.subredes.filter((s) => s.vpcId !== vpcId);
  estado.tablasRutas = estado.tablasRutas.filter((t) => t.vpcId !== vpcId);
  estado.nacls = estado.nacls.filter((n) => n.vpcId !== vpcId);
  estado.gruposSeguridad = estado.gruposSeguridad.filter((g) => g.vpcId !== vpcId);
  estado.igws = estado.igws.filter((g) => g.vpcId !== vpcId);
  estado.nats = estado.nats.filter((n) => n.vpcId !== vpcId);
  estado.instancias = estado.instancias.filter((i) => !(i.estado === 'terminated' && subredes.has(i.subredId)));
  estado.vpcs = estado.vpcs.filter((v) => v.id !== vpcId);
  anotar(estado, 'VPC', 'DeleteVpc', `${vpcId} ${vpc.nombre}`);
}

export function crearSubred(estado, { vpcId, nombre, az, cidr } = {}) {
  const vpc = buscar(estado.vpcs, vpcId, 'vpc', 'InvalidVpcID.NotFound');
  const c = parsearCidr(cidr);
  if (!c) throw error('InvalidParameterValue', `Value (${cidr}) for parameter cidrBlock is invalid. This is not a valid CIDR block.`);
  if (!cidrContiene(vpc.cidr, c.texto)) {
    throw error('InvalidSubnet.Range', `The CIDR '${c.texto}' is invalid. Subnet CIDR must be within the VPC CIDR (${vpc.cidr}).`);
  }
  if (c.prefijo < 16 || c.prefijo > 28) throw error('InvalidSubnet.Range', `The CIDR '${c.texto}' is invalid. CIDR block size must be between /16 and /28.`);
  const choque = estado.subredes.find((s) => s.vpcId === vpcId && cidrTraslapa(s.cidr, c.texto));
  if (choque) throw error('InvalidSubnet.Conflict', `The CIDR '${c.texto}' conflicts with another subnet (${choque.id}, ${choque.cidr}).`);
  const zona = az && ZONAS.includes(az) ? az : ZONAS[Math.floor(aleatorio() * 3)];
  const subred = { id: nuevoId('subnet'), nombre: nombreLimpio(nombre), vpcId, cidr: c.texto, az: zona, ipPublicaAuto: false, porDefecto: false, creado: iso() };
  estado.subredes.push(subred);
  estado.nacls.find((n) => n.vpcId === vpcId && n.porDefecto)?.subredes.push(subred.id);
  anotar(estado, 'VPC', 'CreateSubnet', `${subred.id} ${subred.nombre || '(sin nombre)'} ${subred.cidr} ${subred.az}`);
  return subred;
}

export function editarSubred(estado, subredId, { nombre, ipPublicaAuto } = {}) {
  const subred = buscar(estado.subredes, subredId, 'subnet', 'InvalidSubnetID.NotFound');
  if (nombre !== undefined) subred.nombre = nombreLimpio(nombre);
  if (ipPublicaAuto !== undefined) subred.ipPublicaAuto = Boolean(ipPublicaAuto);
  anotar(estado, 'VPC', 'ModifySubnetAttribute', `${subred.id} auto-assign public IPv4: ${subred.ipPublicaAuto ? 'sí' : 'no'}`);
  return subred;
}

export function eliminarSubred(estado, subredId) {
  const subred = buscar(estado.subredes, subredId, 'subnet', 'InvalidSubnetID.NotFound');
  if (vivas(estado).some((i) => i.subredId === subredId) || estado.nats.some((n) => n.subredId === subredId && n.estado !== 'deleted')) {
    throw error('DependencyViolation', `The subnet '${subredId}' has dependencies and cannot be deleted.`);
  }
  estado.subredes = estado.subredes.filter((s) => s.id !== subredId);
  for (const t of estado.tablasRutas) t.asociaciones = t.asociaciones.filter((id) => id !== subredId);
  for (const n of estado.nacls) n.subredes = n.subredes.filter((id) => id !== subredId);
  anotar(estado, 'VPC', 'DeleteSubnet', `${subred.id} ${subred.nombre}`);
}

export function crearTablaRutas(estado, { vpcId, nombre } = {}) {
  const vpc = buscar(estado.vpcs, vpcId, 'vpc', 'InvalidVpcID.NotFound');
  const tabla = { id: nuevoId('rtb'), nombre: nombreLimpio(nombre), vpcId, principal: false, rutas: [{ destino: vpc.cidr, objetivo: 'local' }], asociaciones: [] };
  estado.tablasRutas.push(tabla);
  anotar(estado, 'VPC', 'CreateRouteTable', `${tabla.id} ${tabla.nombre || '(sin nombre)'}`);
  return tabla;
}

export function editarTablaRutas(estado, tablaId, { nombre } = {}) {
  const tabla = buscar(estado.tablasRutas, tablaId, 'route table', 'InvalidRouteTableID.NotFound');
  if (nombre !== undefined) tabla.nombre = nombreLimpio(nombre);
  return tabla;
}

/**
 * «Edit routes»: `rutas` son las rutas que el alumno deja (sin la local, que
 * no se toca). Reemplaza todas las demás.
 */
export function editarRutas(estado, tablaId, rutas = []) {
  const tabla = buscar(estado.tablasRutas, tablaId, 'route table', 'InvalidRouteTableID.NotFound');
  const vpc = vpcDe(estado, tabla.vpcId);
  const nuevas = [];
  for (const r of rutas) {
    const c = parsearCidr(r.destino);
    if (!c) throw error('InvalidParameterValue', `Value (${r.destino ?? ''}) for parameter destinationCidrBlock is invalid. This is not a valid CIDR block.`);
    if (nuevas.some((x) => x.destino === c.texto) || c.texto === vpc.cidr) {
      throw error('RouteAlreadyExists', `The route identified by ${c.texto} already exists.`);
    }
    const objetivo = String(r.objetivo ?? '');
    if (objetivo.startsWith('igw-')) {
      const igw = igwDe(estado, objetivo);
      if (!igw) throw error('InvalidInternetGatewayID.NotFound', `The internet gateway ID '${objetivo}' does not exist`);
      if (igw.vpcId !== tabla.vpcId) {
        throw error('InvalidParameterValue', `route table ${tabla.id} and network gateway ${objetivo} belong to different networks`);
      }
    } else if (objetivo.startsWith('nat-')) {
      const nat = estado.nats.find((n) => n.id === objetivo && n.estado !== 'deleted');
      if (!nat) throw error('InvalidNatGatewayID.NotFound', `The natGateway ID '${objetivo}' does not exist`);
      if (nat.vpcId !== tabla.vpcId) throw error('InvalidParameterValue', `route table ${tabla.id} and NAT gateway ${objetivo} belong to different networks`);
    } else {
      throw error('InvalidParameterValue', 'Target is required. Select a target for the route.');
    }
    nuevas.push({ destino: c.texto, objetivo });
  }
  tabla.rutas = [tabla.rutas.find((r) => r.objetivo === 'local'), ...nuevas];
  anotar(estado, 'VPC', 'ReplaceRoutes', `${tabla.id}: ${nuevas.map((r) => `${r.destino} → ${r.objetivo}`).join(', ') || 'solo local'}`);
  return tabla;
}

/** «Edit subnet associations»: la tabla queda asociada exactamente a esas subredes. */
export function asociarSubredes(estado, tablaId, subredIds = []) {
  const tabla = buscar(estado.tablasRutas, tablaId, 'route table', 'InvalidRouteTableID.NotFound');
  for (const id of subredIds) {
    const s = buscar(estado.subredes, id, 'subnet', 'InvalidSubnetID.NotFound');
    if (s.vpcId !== tabla.vpcId) throw error('InvalidParameterValue', `Route table ${tabla.id} and subnet ${id} belong to different networks`);
  }
  for (const t of estado.tablasRutas) if (t !== tabla) t.asociaciones = t.asociaciones.filter((id) => !subredIds.includes(id));
  tabla.asociaciones = [...new Set(subredIds)];
  anotar(estado, 'VPC', 'AssociateRouteTable', `${tabla.id}: ${tabla.asociaciones.join(', ') || 'sin subredes'}`);
  return tabla;
}

export function hacerPrincipal(estado, tablaId) {
  const tabla = buscar(estado.tablasRutas, tablaId, 'route table', 'InvalidRouteTableID.NotFound');
  for (const t of estado.tablasRutas) if (t.vpcId === tabla.vpcId) t.principal = t === tabla;
  tabla.asociaciones = [];
  anotar(estado, 'VPC', 'ReplaceRouteTableAssociation (main)', tabla.id);
  return tabla;
}

export function eliminarTablaRutas(estado, tablaId) {
  const tabla = buscar(estado.tablasRutas, tablaId, 'route table', 'InvalidRouteTableID.NotFound');
  if (tabla.principal || tabla.asociaciones.length) {
    throw error('DependencyViolation', `The routeTable '${tablaId}' has dependencies and cannot be deleted.`);
  }
  estado.tablasRutas = estado.tablasRutas.filter((t) => t.id !== tablaId);
  anotar(estado, 'VPC', 'DeleteRouteTable', tablaId);
}

export function crearIgw(estado, { nombre } = {}) {
  const igw = { id: nuevoId('igw'), nombre: nombreLimpio(nombre), vpcId: null };
  estado.igws.push(igw);
  anotar(estado, 'VPC', 'CreateInternetGateway', `${igw.id} ${igw.nombre || '(sin nombre)'}`);
  return igw;
}

export function editarIgw(estado, igwId, { nombre } = {}) {
  const igw = buscar(estado.igws, igwId, 'internet gateway', 'InvalidInternetGatewayID.NotFound');
  if (nombre !== undefined) igw.nombre = nombreLimpio(nombre);
  return igw;
}

export function adjuntarIgw(estado, igwId, vpcId) {
  const igw = buscar(estado.igws, igwId, 'internet gateway', 'InvalidInternetGatewayID.NotFound');
  buscar(estado.vpcs, vpcId, 'vpc', 'InvalidVpcID.NotFound');
  if (igw.vpcId) throw error('Resource.AlreadyAssociated', `resource ${igwId} is already attached to network ${igw.vpcId}`);
  const otro = igwDeVpc(estado, vpcId);
  if (otro) throw error('InvalidParameterValue', `Network ${vpcId} already has an internet gateway attached (${otro.id})`);
  igw.vpcId = vpcId;
  anotar(estado, 'VPC', 'AttachInternetGateway', `${igwId} → ${vpcId}`);
  return igw;
}

export function desadjuntarIgw(estado, igwId) {
  const igw = buscar(estado.igws, igwId, 'internet gateway', 'InvalidInternetGatewayID.NotFound');
  if (!igw.vpcId) throw error('Gateway.NotAttached', `resource ${igwId} is not attached to any network`);
  if (vivas(estado).some((i) => i.vpcId === igw.vpcId && i.ipPublica)) {
    throw error('DependencyViolation', `Network ${igw.vpcId} has some mapped public address(es). Please unmap those public address(es) before detaching the gateway.`);
  }
  const vpcId = igw.vpcId;
  igw.vpcId = null;
  anotar(estado, 'VPC', 'DetachInternetGateway', `${igwId} de ${vpcId}`);
  return igw;
}

export function eliminarIgw(estado, igwId) {
  const igw = buscar(estado.igws, igwId, 'internet gateway', 'InvalidInternetGatewayID.NotFound');
  if (igw.vpcId) throw error('DependencyViolation', `The internetGateway '${igwId}' has dependencies and cannot be deleted.`);
  estado.igws = estado.igws.filter((g) => g.id !== igwId);
  anotar(estado, 'VPC', 'DeleteInternetGateway', igwId);
}

export function asignarEip(estado, { nombre } = {}) {
  if (estado.eips.length >= 5) throw error('AddressLimitExceeded', 'The maximum number of addresses has been reached.');
  const eip = { id: nuevoId('eipalloc'), ip: ipPublicaNueva(estado), nombre: nombreLimpio(nombre), instanciaId: null, natId: null };
  estado.eips.push(eip);
  anotar(estado, 'EC2', 'AllocateAddress', `${eip.id} ${eip.ip}`);
  return eip;
}

export function asociarEip(estado, eipId, instanciaId) {
  const eip = buscar(estado.eips, eipId, 'allocation', 'InvalidAllocationID.NotFound');
  const inst = buscar(estado.instancias, instanciaId, 'instance', 'InvalidInstanceID.NotFound');
  if (inst.estado === 'terminated' || inst.estado === 'shutting-down') throw error('IncorrectInstanceState', `The instance '${instanciaId}' is not in a valid state for this operation.`);
  if (eip.natId) throw error('Resource.AlreadyAssociated', `resource ${eipId} is already associated with a NAT gateway`);
  if (!igwDeVpc(estado, inst.vpcId)) throw error('Gateway.NotAttached', `Network ${inst.vpcId} is not attached to any internet gateway`);
  if (eip.instanciaId && eip.instanciaId !== instanciaId) desasociarEip(estado, eipId);
  const anterior = estado.eips.find((e) => e.instanciaId === instanciaId);
  if (anterior && anterior !== eip) anterior.instanciaId = null;
  eip.instanciaId = instanciaId;
  inst.eipId = eip.id;
  inst.ipPublica = eip.ip;
  anotar(estado, 'EC2', 'AssociateAddress', `${eip.ip} → ${instanciaId}`);
  return eip;
}

export function desasociarEip(estado, eipId) {
  const eip = buscar(estado.eips, eipId, 'allocation', 'InvalidAllocationID.NotFound');
  const inst = eip.instanciaId && instanciaDe(estado, eip.instanciaId);
  eip.instanciaId = null;
  if (inst) {
    inst.eipId = null;
    // Como en AWS: si la instancia tenía IP pública automática, recibe una nueva.
    inst.ipPublica = inst.autoIpPublica && inst.estado === 'running' ? ipPublicaNueva(estado) : null;
  }
  anotar(estado, 'EC2', 'DisassociateAddress', eip.ip);
  return eip;
}

export function liberarEip(estado, eipId) {
  const eip = buscar(estado.eips, eipId, 'allocation', 'InvalidAllocationID.NotFound');
  if (eip.instanciaId || eip.natId) throw error('InvalidIPAddress.InUse', `Address ${eip.ip} is in use.`);
  estado.eips = estado.eips.filter((e) => e.id !== eipId);
  anotar(estado, 'EC2', 'ReleaseAddress', eip.ip);
}

export function crearNat(estado, { nombre, subredId, eipId, tipo = 'public' } = {}) {
  const subred = buscar(estado.subredes, subredId, 'subnet', 'InvalidSubnetID.NotFound');
  let eip = null;
  if (tipo === 'public') {
    if (!eipId) throw error('MissingParameter', 'An Elastic IP allocation ID is required for a public NAT gateway.');
    eip = buscar(estado.eips, eipId, 'allocation', 'InvalidAllocationID.NotFound');
    if (eip.instanciaId || eip.natId) throw error('Resource.AlreadyAssociated', `Elastic IP address [${eipId}] is already associated`);
  }
  const ahora = reloj.ahora();
  const sinIgw = tipo === 'public' && !igwDeVpc(estado, subred.vpcId);
  const nat = {
    id: nuevoId('nat'),
    nombre: nombreLimpio(nombre),
    subredId,
    vpcId: subred.vpcId,
    eipId: eip?.id ?? null,
    tipo,
    estado: 'pending',
    hasta: ahora + DURACION.natSeCrea,
    siguiente: sinIgw ? 'failed' : 'available',
    motivo: sinIgw ? `Network ${subred.vpcId} has no Internet gateway attached` : null,
    creado: iso(ahora)
  };
  if (eip && !sinIgw) eip.natId = nat.id;
  estado.nats.push(nat);
  anotar(estado, 'VPC', 'CreateNatGateway', `${nat.id} en ${subredId}`);
  return nat;
}

export function eliminarNat(estado, natId) {
  const nat = buscar(estado.nats, natId, 'NAT gateway', 'NatGatewayNotFound');
  if (nat.estado === 'deleted' || nat.estado === 'deleting') return nat;
  Object.assign(nat, { estado: 'deleting', hasta: reloj.ahora() + DURACION.natSeBorra, siguiente: 'deleted' });
  anotar(estado, 'VPC', 'DeleteNatGateway', natId);
  return nat;
}

/* ================================================================== NACL */

function validarReglasNacl(reglas) {
  const numeros = new Set();
  return reglas.map((r) => {
    const numero = Number(r.numero);
    if (!Number.isInteger(numero) || numero < 1 || numero > 32766) throw error('InvalidParameterValue', 'Rule number must be between 1 and 32766.');
    if (numeros.has(numero)) throw error('NetworkAclEntryAlreadyExists', `The network acl entry identified by ${numero} already exists.`);
    numeros.add(numero);
    const c = parsearCidr(r.cidr);
    if (!c) throw error('InvalidParameterValue', `Value (${r.cidr ?? ''}) for parameter cidrBlock is invalid. This is not a valid CIDR block.`);
    const puertos = normalizarPuertos(r);
    return { numero, ...puertos, cidr: c.texto, accion: r.accion === 'deny' ? 'deny' : 'allow' };
  });
}

function normalizarPuertos({ protocolo, desde, hasta }) {
  if (!['-1', 'tcp', 'udp', 'icmp'].includes(protocolo)) throw error('InvalidParameterValue', `Invalid protocol: ${protocolo}`);
  if (protocolo === '-1') return { protocolo, desde: null, hasta: null };
  if (protocolo === 'icmp') return { protocolo, desde: -1, hasta: -1 };
  const d = Number(desde);
  const h = hasta === undefined || hasta === null || hasta === '' ? d : Number(hasta);
  if (!Number.isInteger(d) || !Number.isInteger(h) || d < 0 || h > 65535 || d > h) {
    throw error('InvalidParameterValue', `Invalid port range: ${desde ?? ''}${hasta !== undefined && hasta !== desde ? ` - ${hasta}` : ''}. Port must be a number between 0 and 65535.`);
  }
  return { protocolo, desde: d, hasta: h };
}

export function crearNacl(estado, { vpcId, nombre } = {}) {
  buscar(estado.vpcs, vpcId, 'vpc', 'InvalidVpcID.NotFound');
  // Una NACL nueva niega todo hasta que le pongas reglas (la regla «*»).
  const nacl = { id: nuevoId('acl'), nombre: nombreLimpio(nombre), vpcId, porDefecto: false, entrada: [], salida: [], subredes: [] };
  estado.nacls.push(nacl);
  anotar(estado, 'VPC', 'CreateNetworkAcl', `${nacl.id} ${nacl.nombre || '(sin nombre)'}`);
  return nacl;
}

export function editarNacl(estado, naclId, { nombre } = {}) {
  const nacl = buscar(estado.nacls, naclId, 'network ACL', 'InvalidNetworkAclID.NotFound');
  if (nombre !== undefined) nacl.nombre = nombreLimpio(nombre);
  return nacl;
}

/** «Edit inbound rules» / «Edit outbound rules» de una NACL. `sentido`: 'entrada' | 'salida'. */
export function editarReglasNacl(estado, naclId, sentido, reglas = []) {
  const nacl = buscar(estado.nacls, naclId, 'network ACL', 'InvalidNetworkAclID.NotFound');
  if (sentido !== 'entrada' && sentido !== 'salida') throw error('InvalidParameterValue', 'Invalid direction');
  nacl[sentido] = validarReglasNacl(reglas).sort((a, b) => a.numero - b.numero);
  anotar(estado, 'VPC', sentido === 'entrada' ? 'ReplaceNetworkAclEntries (inbound)' : 'ReplaceNetworkAclEntries (outbound)', `${nacl.id}: ${nacl[sentido].map((r) => `${r.numero} ${r.accion} ${textoProtocolo(r.protocolo)} ${textoPuertos(r)} ${r.cidr}`).join('; ')}`);
  return nacl;
}

/** «Edit subnet associations» de una NACL: las subredes que se lleva salen de su NACL anterior. */
export function asociarNacl(estado, naclId, subredIds = []) {
  const nacl = buscar(estado.nacls, naclId, 'network ACL', 'InvalidNetworkAclID.NotFound');
  for (const id of subredIds) {
    const s = buscar(estado.subredes, id, 'subnet', 'InvalidSubnetID.NotFound');
    if (s.vpcId !== nacl.vpcId) throw error('InvalidParameterValue', `Network ACL ${naclId} and subnet ${id} belong to different networks`);
  }
  const porDefecto = estado.nacls.find((n) => n.vpcId === nacl.vpcId && n.porDefecto);
  // Las subredes que esta NACL suelta regresan a la NACL por omisión.
  for (const id of nacl.subredes) if (!subredIds.includes(id) && porDefecto && porDefecto !== nacl) porDefecto.subredes.push(id);
  for (const n of estado.nacls) if (n !== nacl) n.subredes = n.subredes.filter((id) => !subredIds.includes(id));
  nacl.subredes = [...new Set(subredIds)];
  if (porDefecto) porDefecto.subredes = [...new Set(porDefecto.subredes)];
  anotar(estado, 'VPC', 'ReplaceNetworkAclAssociation', `${nacl.id}: ${nacl.subredes.join(', ')}`);
  return nacl;
}

export function eliminarNacl(estado, naclId) {
  const nacl = buscar(estado.nacls, naclId, 'network ACL', 'InvalidNetworkAclID.NotFound');
  if (nacl.porDefecto) throw error('InvalidParameterValue', `cannot delete default network ACL ${naclId}`);
  if (nacl.subredes.length) throw error('DependencyViolation', `The networkAcl '${naclId}' has dependencies and cannot be deleted.`);
  estado.nacls = estado.nacls.filter((n) => n.id !== naclId);
  anotar(estado, 'VPC', 'DeleteNetworkAcl', naclId);
}

/* ===================================================== grupos de seguridad */

const ASCII_DESCRIPCION = /^[a-zA-Z0-9 ._\-:/()#,@[\]+=&;{}!$*]*$/;

function validarReglasSg(estado, vpcId, reglas, sentido) {
  const vistas = new Set();
  return reglas.map((r) => {
    const puertos = normalizarPuertos(r);
    let origen = String(r.origen ?? '').trim();
    if (origen.startsWith('sg-')) {
      const otro = grupoDe(estado, origen);
      if (!otro) throw error('InvalidGroup.NotFound', `The security group '${origen}' does not exist`);
      if (otro.vpcId !== vpcId) throw error('InvalidGroup.NotFound', `You have specified two resources that belong to different networks.`);
    } else {
      const c = parsearCidr(origen);
      if (!c) {
        throw error('InvalidParameterValue', `${sentido === 'salida' ? 'Destination' : 'Source'} '${origen}' is not a valid CIDR block or security group.`);
      }
      origen = c.texto;
    }
    const descripcion = String(r.descripcion ?? '').trim().slice(0, 255);
    if (!ASCII_DESCRIPCION.test(descripcion)) throw error('InvalidParameterValue', 'Invalid rule description. Character sets beyond ASCII are not supported.');
    const llave = `${puertos.protocolo}|${puertos.desde}|${puertos.hasta}|${origen}`;
    if (vistas.has(llave)) throw error('InvalidPermission.Duplicate', `the specified rule "peer: ${origen}, ${textoProtocolo(puertos.protocolo)}, from port: ${puertos.desde ?? 'All'}, to port: ${puertos.hasta ?? 'All'}, ALLOW" already exists`);
    vistas.add(llave);
    return { id: r.id && String(r.id).startsWith('sgr-') ? r.id : nuevoId('sgr'), ...puertos, origen, descripcion };
  });
}

export function crearGrupoSeguridad(estado, { nombre, descripcion, vpcId, entrada = [], salida } = {}) {
  const vpc = buscar(estado.vpcs, vpcId, 'vpc', 'InvalidVpcID.NotFound');
  const n = String(nombre ?? '').trim();
  const d = String(descripcion ?? '').trim();
  if (!n) throw error('MissingParameter', 'Security group name is required.');
  if (n.length > 255) throw error('InvalidParameterValue', 'Security group name can be up to 255 characters long.');
  if (/^sg-/i.test(n)) throw error('InvalidParameterValue', 'Group names may not be in the format sg-*.');
  if (!ASCII_DESCRIPCION.test(n)) throw error('InvalidParameterValue', 'Invalid security group name. Character sets beyond ASCII are not supported.');
  if (!d) throw error('MissingParameter', 'Description is required.');
  if (!ASCII_DESCRIPCION.test(d)) throw error('InvalidParameterValue', 'Invalid security group description. Character sets beyond ASCII are not supported.');
  if (estado.gruposSeguridad.some((g) => g.vpcId === vpcId && g.nombre.toLowerCase() === n.toLowerCase())) {
    throw error('InvalidGroup.Duplicate', `The security group '${n}' already exists for VPC '${vpc.id}'`);
  }
  const grupo = { id: nuevoId('sg'), nombre: n, descripcion: d, vpcId, porDefecto: false, entrada: [], salida: [] };
  // Se agrega antes de validar reglas para que una regla pueda apuntar al mismo grupo.
  estado.gruposSeguridad.push(grupo);
  try {
    grupo.entrada = validarReglasSg(estado, vpcId, entrada, 'entrada');
    grupo.salida = salida === undefined ? [reglaSalidaSg()] : validarReglasSg(estado, vpcId, salida, 'salida');
  } catch (e) {
    estado.gruposSeguridad = estado.gruposSeguridad.filter((g) => g !== grupo);
    throw e;
  }
  anotar(estado, 'EC2', 'CreateSecurityGroup', `${grupo.id} ${grupo.nombre}: ${describirReglasSg(grupo.entrada)}`);
  return grupo;
}

export const describirReglasSg = (reglas) =>
  reglas.map((r) => `${tipoDeRegla(r)} ${textoPuertos(r)} desde ${r.origen}`).join('; ') || 'sin reglas';

/** «Edit inbound rules» / «Edit outbound rules»: reemplaza todas las reglas de ese sentido. */
export function editarReglasSg(estado, grupoId, sentido, reglas = []) {
  const grupo = buscar(estado.gruposSeguridad, grupoId, 'security group', 'InvalidGroup.NotFound');
  if (sentido !== 'entrada' && sentido !== 'salida') throw error('InvalidParameterValue', 'Invalid direction');
  grupo[sentido] = validarReglasSg(estado, grupo.vpcId, reglas, sentido);
  anotar(estado, 'EC2', sentido === 'entrada' ? 'ModifySecurityGroupRules (inbound)' : 'ModifySecurityGroupRules (outbound)', `${grupo.id} ${grupo.nombre}: ${describirReglasSg(grupo[sentido])}`);
  return grupo;
}

export function eliminarGrupoSeguridad(estado, grupoId) {
  const grupo = buscar(estado.gruposSeguridad, grupoId, 'security group', 'InvalidGroup.NotFound');
  if (grupo.porDefecto) throw error('CannotDelete', `the specified group: "${grupoId}" name: "default" cannot be deleted by a user`);
  if (vivas(estado).some((i) => i.gruposSeguridad.includes(grupoId))) {
    throw error('DependencyViolation', `resource ${grupoId} has a dependent object`);
  }
  const referido = estado.gruposSeguridad.find((g) => g !== grupo && [...g.entrada, ...g.salida].some((r) => r.origen === grupoId));
  if (referido) throw error('DependencyViolation', `resource ${grupoId} has a dependent object (referenced by ${referido.id})`);
  estado.gruposSeguridad = estado.gruposSeguridad.filter((g) => g.id !== grupoId);
  anotar(estado, 'EC2', 'DeleteSecurityGroup', `${grupoId} ${grupo.nombre}`);
}

/* ================================================================ llaves */

export function crearLlave(estado, { nombre, tipo = 'rsa', formato = 'pem' } = {}) {
  const n = String(nombre ?? '').trim();
  if (!n) throw error('MissingParameter', 'Key pair name is required.');
  if (n.length > 255 || !/^[\x20-\x7e]+$/.test(n)) throw error('InvalidParameterValue', 'Key pair name can include up to 255 ASCII characters.');
  if (estado.llaves.some((k) => k.nombre === n)) throw error('InvalidKeyPair.Duplicate', `The keypair '${n}' already exists.`);
  const llave = {
    id: nuevoId('key'),
    nombre: n,
    tipo: tipo === 'ed25519' ? 'ed25519' : 'rsa',
    formato: formato === 'ppk' ? 'ppk' : 'pem',
    huella: Array.from({ length: 20 }, () => hexAzar(2)).join(':'),
    creado: iso()
  };
  estado.llaves.push(llave);
  anotar(estado, 'EC2', 'CreateKeyPair', llave.nombre);
  return llave;
}

export function eliminarLlave(estado, nombre) {
  if (!estado.llaves.some((k) => k.nombre === nombre)) throw error('InvalidKeyPair.NotFound', `The key pair '${nombre}' does not exist`);
  estado.llaves = estado.llaves.filter((k) => k.nombre !== nombre);
  anotar(estado, 'EC2', 'DeleteKeyPair', nombre);
}

/* ============================================================== volúmenes */

function validarTamano(tipo, tamano) {
  const t = tipoVolumen(tipo);
  if (!t) throw error('InvalidParameterValue', `Invalid volume type: ${tipo}`);
  const n = Number(tamano);
  if (!Number.isInteger(n) || n < t.min || n > t.max) {
    throw error('InvalidParameterValue', `Volume size must be between ${t.min} and ${t.max} GiB for ${t.tipo} volumes.`);
  }
  return n;
}

export function crearVolumen(estado, { nombre, tipo = 'gp3', tamano, az, snapshotId = null, cifrado = false, iops } = {}) {
  if (!ZONAS.includes(az)) throw error('InvalidParameterValue', 'Availability Zone is required.');
  let n = Number(tamano);
  if (snapshotId) {
    const snap = buscar(estado.snapshots, snapshotId, 'snapshot', 'InvalidSnapshot.NotFound');
    if (snap.estado !== 'completed') throw error('IncorrectState', `Snapshot '${snapshotId}' is not 'completed'.`);
    if (!tamano) n = snap.tamano;
    if (n < snap.tamano) throw error('InvalidParameterValue', `Volume of ${n}GiB is smaller than snapshot '${snapshotId}', expect size >= ${snap.tamano}GiB`);
  }
  n = validarTamano(tipo, n);
  const ahora = reloj.ahora();
  const vol = {
    id: nuevoId('vol'),
    nombre: nombreLimpio(nombre),
    tipo,
    tamano: n,
    iops: iops ?? tipoVolumen(tipo).iops,
    az,
    estado: 'creating',
    hasta: ahora + DURACION.volumenSeCrea,
    siguiente: 'available',
    instanciaId: null,
    dispositivo: null,
    raiz: false,
    eliminarAlTerminar: false,
    cifrado: Boolean(cifrado),
    snapshotId: snapshotId || null,
    creado: iso(ahora)
  };
  estado.volumenes.push(vol);
  anotar(estado, 'EC2', 'CreateVolume', `${vol.id} ${vol.tipo} ${vol.tamano} GiB ${vol.az}`);
  return vol;
}

export function editarVolumen(estado, volId, { nombre } = {}) {
  const vol = buscar(estado.volumenes, volId, 'volume', 'InvalidVolume.NotFound');
  if (nombre !== undefined) vol.nombre = nombreLimpio(nombre);
  return vol;
}

export function adjuntarVolumen(estado, volId, instanciaId, dispositivo = '/dev/sdf') {
  const vol = buscar(estado.volumenes, volId, 'volume', 'InvalidVolume.NotFound');
  const inst = buscar(estado.instancias, instanciaId, 'instance', 'InvalidInstanceID.NotFound');
  if (vol.estado !== 'available') throw error('IncorrectState', `vol '${volId}' is not 'available'.`);
  if (inst.estado !== 'running' && inst.estado !== 'stopped') throw error('IncorrectState', `Instance '${instanciaId}' is not 'running' or 'stopped'.`);
  if (vol.az !== inst.az) {
    throw error('InvalidVolume.ZoneMismatch', `The volume '${volId}' is not in the same availability zone as instance '${instanciaId}'`);
  }
  const usados = inst.volumenes.map((id) => estado.volumenes.find((v) => v.id === id)?.dispositivo);
  if (usados.includes(dispositivo)) throw error('InvalidParameterValue', `Attachment point ${dispositivo} is already in use`);
  Object.assign(vol, { estado: 'in-use', instanciaId, dispositivo });
  inst.volumenes.push(vol.id);
  anotar(estado, 'EC2', 'AttachVolume', `${volId} → ${instanciaId} (${dispositivo})`);
  return vol;
}

export function desadjuntarVolumen(estado, volId) {
  const vol = buscar(estado.volumenes, volId, 'volume', 'InvalidVolume.NotFound');
  if (vol.estado !== 'in-use') throw error('IncorrectState', `Volume '${volId}' is in the 'available' state.`);
  const inst = instanciaDe(estado, vol.instanciaId);
  if (vol.raiz && inst && inst.estado !== 'stopped') {
    throw error('OperationNotPermitted', `Unable to detach root volume '${volId}' from instance '${inst.id}'`);
  }
  if (inst) inst.volumenes = inst.volumenes.filter((id) => id !== volId);
  Object.assign(vol, { estado: 'available', instanciaId: null, dispositivo: null, raiz: false });
  anotar(estado, 'EC2', 'DetachVolume', volId);
  return vol;
}

export function eliminarVolumen(estado, volId) {
  const vol = buscar(estado.volumenes, volId, 'volume', 'InvalidVolume.NotFound');
  if (vol.estado === 'in-use') throw error('VolumeInUse', `Volume ${volId} is currently attached to ${vol.instanciaId}`);
  estado.volumenes = estado.volumenes.filter((v) => v.id !== volId);
  anotar(estado, 'EC2', 'DeleteVolume', volId);
}

export function crearSnapshot(estado, { volumenId, descripcion = '', nombre } = {}) {
  const vol = buscar(estado.volumenes, volumenId, 'volume', 'InvalidVolume.NotFound');
  if (vol.estado === 'creating') throw error('IncorrectState', `Volume '${volumenId}' is not 'available' or 'in-use'.`);
  const d = String(descripcion ?? '').trim().slice(0, 255);
  const ahora = reloj.ahora();
  const snap = {
    id: nuevoId('snap'),
    nombre: nombreLimpio(nombre),
    volumenId,
    tamano: vol.tamano,
    descripcion: d,
    estado: 'pending',
    progreso: 0,
    desde: ahora,
    hasta: ahora + DURACION.snapshotSeCompleta,
    siguiente: 'completed',
    creado: iso(ahora),
    cifrado: vol.cifrado
  };
  estado.snapshots.push(snap);
  anotar(estado, 'EC2', 'CreateSnapshot', `${snap.id} de ${volumenId}${d ? ` «${d}»` : ''}`);
  return snap;
}

export function editarSnapshot(estado, snapId, { nombre } = {}) {
  const snap = buscar(estado.snapshots, snapId, 'snapshot', 'InvalidSnapshot.NotFound');
  if (nombre !== undefined) snap.nombre = nombreLimpio(nombre);
  return snap;
}

export function eliminarSnapshot(estado, snapId) {
  buscar(estado.snapshots, snapId, 'snapshot', 'InvalidSnapshot.NotFound');
  estado.snapshots = estado.snapshots.filter((s) => s.id !== snapId);
  anotar(estado, 'EC2', 'DeleteSnapshot', snapId);
}

/* ============================================================= instancias */

/**
 * «Launch instance». Parámetros:
 *   nombre, ami (id o clave: 'al2023'), tipo ('t2.micro'), llave (nombre o null),
 *   subredId (null = «No preference»: una subred por omisión de la VPC por omisión),
 *   ipPublica (true/false; undefined = lo que diga la subred),
 *   gruposSeguridad: [sgId], nuevoGrupo: { nombre, descripcion, entrada } (lo crea el asistente),
 *   volumenes: [{ tamano, tipo, eliminarAlTerminar, cifrado }] (el primero es la raíz),
 *   userData (texto), perfilIam (nombre de un rol), cantidad (1 por omisión)
 * Devuelve la lista de instancias lanzadas.
 */
export function lanzarInstancias(estado, p = {}) {
  const imagen = ami(p.ami ?? 'al2023');
  if (!imagen) throw error('InvalidAMIID.NotFound', `The image id '[${p.ami}]' does not exist`);
  const tipo = tipoInstancia(p.tipo ?? 't2.micro');
  if (!tipo) throw error('InvalidParameterValue', `Invalid value '${p.tipo}' for InstanceType.`);
  if (p.llave && !estado.llaves.some((k) => k.nombre === p.llave)) throw error('InvalidKeyPair.NotFound', `The key pair '${p.llave}' does not exist`);
  const cantidad = Math.max(1, Math.min(Number(p.cantidad) || 1, 5));

  let subred;
  if (p.subredId) {
    subred = buscar(estado.subredes, p.subredId, 'subnet', 'InvalidSubnetID.NotFound');
  } else {
    const vpcDefecto = estado.vpcs.find((v) => v.porDefecto);
    const opciones = estado.subredes.filter((s) => s.vpcId === vpcDefecto?.id && s.porDefecto);
    if (!opciones.length) throw error('MissingInput', 'No default subnet is available. Select a subnet.');
    subred = opciones[Math.floor(aleatorio() * Math.min(opciones.length, 4))];
  }

  const volumenes = p.volumenes?.length ? p.volumenes : [{ tamano: imagen.discoMinimo, tipo: 'gp3', eliminarAlTerminar: true }];
  const raiz = volumenes[0];
  if (Number(raiz.tamano) < imagen.discoMinimo) {
    throw error('InvalidBlockDeviceMapping', `Volume of size ${raiz.tamano}GB is smaller than snapshot '${imagen.id.replace('ami', 'snap')}', expect size >= ${imagen.discoMinimo}GB`);
  }
  volumenes.forEach((v) => validarTamano(v.tipo ?? 'gp3', Number(v.tamano)));

  if (p.perfilIam && !estado.iam.roles.some((r) => r.nombre === p.perfilIam)) {
    throw error('InvalidParameterValue', `Value (${p.perfilIam}) for parameter iamInstanceProfile.name is invalid. Invalid IAM Instance Profile name`);
  }

  const grupos = [...(p.gruposSeguridad ?? [])];
  for (const id of grupos) {
    const g = buscar(estado.gruposSeguridad, id, 'security group', 'InvalidGroup.NotFound');
    if (g.vpcId !== subred.vpcId) {
      throw error('InvalidParameter', `Security group ${id} and subnet ${subred.id} belong to different networks.`);
    }
  }
  if (!grupos.length && !p.nuevoGrupo) throw error('MissingParameter', 'You must select at least one security group.');
  const ipPublica = p.ipPublica === undefined ? subred.ipPublicaAuto : Boolean(p.ipPublica);

  // El asistente crea el grupo nuevo justo antes de lanzar.
  if (p.nuevoGrupo) {
    const g = crearGrupoSeguridad(estado, { ...p.nuevoGrupo, vpcId: subred.vpcId });
    grupos.push(g.id);
  }

  const ahora = reloj.ahora();
  const lanzadas = [];
  for (let k = 0; k < cantidad; k++) {
    const inst = {
      id: nuevoId('i'),
      nombre: nombreLimpio(p.nombre),
      ami: imagen.id,
      tipo: tipo.tipo,
      estado: 'pending',
      desde: ahora,
      hasta: ahora + DURACION.instanciaArranca,
      siguiente: 'running',
      subredId: subred.id,
      vpcId: subred.vpcId,
      az: subred.az,
      ipPrivada: ipPrivadaNueva(estado, subred),
      ipPublica: null,
      autoIpPublica: ipPublica,
      eipId: null,
      gruposSeguridad: [...grupos],
      llave: p.llave || null,
      userData: String(p.userData ?? ''),
      userDataArranque: null,
      arranques: 0,
      rolIam: p.perfilIam || null,
      volumenes: [],
      lanzada: iso(ahora)
    };
    if (ipPublica) inst.ipPublica = ipPublicaNueva(estado);
    estado.instancias.push(inst);
    volumenes.forEach((v, i) => {
      const vol = {
        id: nuevoId('vol'),
        nombre: '',
        tipo: v.tipo ?? 'gp3',
        tamano: Number(v.tamano),
        iops: tipoVolumen(v.tipo ?? 'gp3').iops,
        az: subred.az,
        estado: 'in-use',
        instanciaId: inst.id,
        dispositivo: i === 0 ? '/dev/xvda' : `/dev/sd${String.fromCharCode(98 + i)}`,
        raiz: i === 0,
        eliminarAlTerminar: v.eliminarAlTerminar ?? i === 0,
        cifrado: Boolean(v.cifrado),
        snapshotId: i === 0 ? imagen.id.replace('ami', 'snap') : null,
        creado: iso(ahora)
      };
      estado.volumenes.push(vol);
      inst.volumenes.push(vol.id);
    });
    lanzadas.push(inst);
    anotar(estado, 'EC2', 'RunInstances', `${inst.id} «${inst.nombre}» ${imagen.clave} ${tipo.tipo} en ${subred.id} (${subred.az}), IP pública: ${inst.ipPublica ?? 'no'}, grupos: ${grupos.join(', ')}`);
  }
  return lanzadas;
}

const estadoInvalido = (inst, accion) =>
  error('IncorrectInstanceState', `The instance '${inst.id}' is not in a state from which it can be ${accion}.`);

export function detenerInstancia(estado, id) {
  const inst = buscar(estado.instancias, id, 'instance', 'InvalidInstanceID.NotFound');
  if (inst.estado === 'stopped' || inst.estado === 'stopping') return inst;
  if (inst.estado !== 'running' && inst.estado !== 'pending') throw estadoInvalido(inst, 'stopped');
  Object.assign(inst, { estado: 'stopping', desde: reloj.ahora(), hasta: reloj.ahora() + DURACION.instanciaSeDetiene, siguiente: 'stopped' });
  anotar(estado, 'EC2', 'StopInstances', id);
  return inst;
}

export function iniciarInstancia(estado, id) {
  const inst = buscar(estado.instancias, id, 'instance', 'InvalidInstanceID.NotFound');
  if (inst.estado === 'running' || inst.estado === 'pending') return inst;
  if (inst.estado !== 'stopped') throw estadoInvalido(inst, 'started');
  Object.assign(inst, { estado: 'pending', desde: reloj.ahora(), hasta: reloj.ahora() + DURACION.instanciaArranca, siguiente: 'running' });
  // Sin Elastic IP, la IP pública cambia en cada arranque.
  if (!inst.eipId && inst.autoIpPublica) inst.ipPublica = ipPublicaNueva(estado);
  anotar(estado, 'EC2', 'StartInstances', id);
  return inst;
}

export function reiniciarInstancia(estado, id) {
  const inst = buscar(estado.instancias, id, 'instance', 'InvalidInstanceID.NotFound');
  if (inst.estado !== 'running') throw estadoInvalido(inst, 'rebooted');
  inst.desde = reloj.ahora();
  anotar(estado, 'EC2', 'RebootInstances', id);
  return inst;
}

export function terminarInstancia(estado, id) {
  const inst = buscar(estado.instancias, id, 'instance', 'InvalidInstanceID.NotFound');
  if (inst.estado === 'terminated' || inst.estado === 'shutting-down') return inst;
  Object.assign(inst, { estado: 'shutting-down', desde: reloj.ahora(), hasta: reloj.ahora() + DURACION.instanciaTermina, siguiente: 'terminated' });
  anotar(estado, 'EC2', 'TerminateInstances', id);
  return inst;
}

function requiereDetenida(inst) {
  if (inst.estado !== 'stopped') throw error('IncorrectInstanceState', `The instance '${inst.id}' is not in the 'stopped' state.`);
}

export function editarInstancia(estado, id, { nombre } = {}) {
  const inst = buscar(estado.instancias, id, 'instance', 'InvalidInstanceID.NotFound');
  if (nombre !== undefined) inst.nombre = nombreLimpio(nombre);
  anotar(estado, 'EC2', 'CreateTags', `${id} Name=${inst.nombre}`);
  return inst;
}

export function cambiarTipoInstancia(estado, id, tipo) {
  const inst = buscar(estado.instancias, id, 'instance', 'InvalidInstanceID.NotFound');
  requiereDetenida(inst);
  if (!tipoInstancia(tipo)) throw error('InvalidParameterValue', `Invalid value '${tipo}' for InstanceType.`);
  inst.tipo = tipo;
  anotar(estado, 'EC2', 'ModifyInstanceAttribute (instanceType)', `${id} → ${tipo}`);
  return inst;
}

/** «Edit user data»: solo con la instancia detenida, y solo corre en el PRIMER arranque. */
export function editarUserData(estado, id, texto) {
  const inst = buscar(estado.instancias, id, 'instance', 'InvalidInstanceID.NotFound');
  requiereDetenida(inst);
  inst.userData = String(texto ?? '');
  anotar(estado, 'EC2', 'ModifyInstanceAttribute (userData)', id);
  return inst;
}

export function cambiarGruposInstancia(estado, id, grupoIds = []) {
  const inst = buscar(estado.instancias, id, 'instance', 'InvalidInstanceID.NotFound');
  if (!grupoIds.length) throw error('MissingParameter', 'You must select at least one security group.');
  for (const g of grupoIds) {
    const grupo = buscar(estado.gruposSeguridad, g, 'security group', 'InvalidGroup.NotFound');
    if (grupo.vpcId !== inst.vpcId) throw error('InvalidGroup.NotFound', `You have specified two resources that belong to different networks.`);
  }
  inst.gruposSeguridad = [...new Set(grupoIds)];
  anotar(estado, 'EC2', 'ModifyInstanceAttribute (groupSet)', `${id}: ${inst.gruposSeguridad.join(', ')}`);
  return inst;
}

/** «Modify IAM role»: un rol de EC2 o null para quitarlo. */
export function cambiarRolInstancia(estado, id, rol) {
  const inst = buscar(estado.instancias, id, 'instance', 'InvalidInstanceID.NotFound');
  if (rol) {
    const r = estado.iam.roles.find((x) => x.nombre === rol);
    if (!r) throw error('InvalidParameterValue', `Value (${rol}) for parameter iamInstanceProfile.name is invalid. Invalid IAM Instance Profile name`);
    if (r.servicio !== 'ec2.amazonaws.com') throw error('InvalidParameterValue', `Role ${rol} cannot be assumed by EC2. Its trusted entity is ${r.servicio}.`);
  }
  inst.rolIam = rol || null;
  anotar(estado, 'EC2', rol ? 'AssociateIamInstanceProfile' : 'DisassociateIamInstanceProfile', `${id} ${rol ?? ''}`);
  return inst;
}

/* ===================================================================== S3 */

export function validarNombreBucket(estado, nombre) {
  const n = String(nombre ?? '');
  const reglas = [
    [n.length >= 3 && n.length <= 63, 'Bucket name must be between 3 and 63 characters long.'],
    [/^[a-z0-9.-]+$/.test(n), 'Bucket name must not contain uppercase characters, spaces or symbols other than periods (.) and hyphens (-).'],
    [/^[a-z0-9]/.test(n) && /[a-z0-9]$/.test(n), 'Bucket name must start and end with a lowercase letter or number.'],
    [!n.includes('..'), 'Bucket name must not contain two adjacent periods.'],
    [!/^\d{1,3}(\.\d{1,3}){3}$/.test(n), 'Bucket name must not be formatted as an IP address (for example, 192.168.5.4).'],
    [!n.startsWith('xn--') && !n.startsWith('sthree-'), 'Bucket name must not start with the prefix "xn--" or "sthree-".'],
    [!n.endsWith('-s3alias') && !n.endsWith('--ol-s3'), 'Bucket name must not end with the suffix "-s3alias" or "--ol-s3".']
  ];
  const falla = reglas.find(([ok]) => !ok);
  if (falla) throw error('InvalidBucketName', falla[1]);
  if (bucketDe(estado, n)) throw error('BucketAlreadyOwnedByYou', 'Bucket with the same name already exists. You already own this bucket.');
  if (BUCKETS_AJENOS.has(n)) throw error('BucketAlreadyExists', 'Bucket with the same name already exists. Bucket names are shared by all AWS accounts in all Regions: choose a different name.');
  return n;
}

const bloqueoTotal = () => ({ aclsNuevas: true, aclsCualquiera: true, politicasNuevas: true, politicasCualquiera: true });

/**
 * «Create bucket». `bloqueoPublico` por omisión: todo bloqueado; `versionado`:
 * true/false; `cifrado`: 'SSE-S3' | 'SSE-KMS' | 'DSSE-KMS'.
 */
export function crearBucket(estado, { nombre, propiedadObjetos = 'BucketOwnerEnforced', bloqueoPublico, versionado = false, cifrado = 'SSE-S3', bucketKey = true, etiquetas = [] } = {}) {
  const n = validarNombreBucket(estado, nombre);
  const bucket = {
    nombre: n,
    region: REGION.codigo,
    creado: iso(),
    propiedadObjetos: propiedadObjetos === 'ObjectWriter' || propiedadObjetos === 'BucketOwnerPreferred' ? propiedadObjetos : 'BucketOwnerEnforced',
    bloqueoPublico: { ...bloqueoTotal(), ...(bloqueoPublico ?? {}) },
    versionado: versionado ? 'Enabled' : 'Disabled',
    cifrado: { tipo: ['SSE-S3', 'SSE-KMS', 'DSSE-KMS'].includes(cifrado) ? cifrado : 'SSE-S3', bucketKey: Boolean(bucketKey) },
    sitioWeb: null,
    politica: null,
    ciclo: [],
    objetos: [],
    etiquetas: etiquetas.filter((e) => e?.llave).map((e) => ({ llave: String(e.llave), valor: String(e.valor ?? '') }))
  };
  estado.buckets.push(bucket);
  const b = bucket.bloqueoPublico;
  const todo = b.aclsNuevas && b.aclsCualquiera && b.politicasNuevas && b.politicasCualquiera;
  anotar(estado, 'S3', 'CreateBucket', `${n} · acceso público bloqueado: ${todo ? 'todo' : 'NO'} · versionado: ${bucket.versionado} · cifrado: ${bucket.cifrado.tipo}`);
  return bucket;
}

const bucketOError = (estado, nombre) => {
  const b = bucketDe(estado, nombre);
  if (!b) throw error('NoSuchBucket', 'The specified bucket does not exist');
  return b;
};

export function editarVersionado(estado, nombre, activo) {
  const b = bucketOError(estado, nombre);
  if (!activo && b.versionado === 'Disabled') return b;
  b.versionado = activo ? 'Enabled' : 'Suspended';
  anotar(estado, 'S3', 'PutBucketVersioning', `${nombre}: ${b.versionado}`);
  return b;
}

export function editarCifrado(estado, nombre, { tipo = 'SSE-S3', bucketKey = true } = {}) {
  const b = bucketOError(estado, nombre);
  b.cifrado = { tipo: ['SSE-S3', 'SSE-KMS', 'DSSE-KMS'].includes(tipo) ? tipo : 'SSE-S3', bucketKey: Boolean(bucketKey) };
  anotar(estado, 'S3', 'PutBucketEncryption', `${nombre}: ${b.cifrado.tipo}`);
  return b;
}

export function editarBloqueoPublico(estado, nombre, bloqueo = {}) {
  const b = bucketOError(estado, nombre);
  b.bloqueoPublico = { ...b.bloqueoPublico, ...bloqueo };
  const x = b.bloqueoPublico;
  anotar(estado, 'S3', 'PutPublicAccessBlock', `${nombre}: ${[x.aclsNuevas, x.aclsCualquiera, x.politicasNuevas, x.politicasCualquiera].map((v) => (v ? 'On' : 'Off')).join('/')}`);
  return b;
}

export function editarSitioWeb(estado, nombre, { habilitado, indice = 'index.html', error: pagError = '' } = {}) {
  const b = bucketOError(estado, nombre);
  if (habilitado && !String(indice).trim()) throw error('InvalidArgument', 'Index document is required.');
  b.sitioWeb = habilitado ? { indice: String(indice).trim(), error: String(pagError ?? '').trim() } : null;
  anotar(estado, 'S3', habilitado ? 'PutBucketWebsite' : 'DeleteBucketWebsite', nombre);
  return b;
}

/** ¿La política deja entrar a cualquiera («Principal": "*" con Allow)? */
export function politicaEsPublica(texto) {
  try {
    const p = JSON.parse(texto);
    const declaraciones = Array.isArray(p.Statement) ? p.Statement : [p.Statement];
    return declaraciones.some((d) => d?.Effect === 'Allow' && (d.Principal === '*' || d.Principal?.AWS === '*') && !d.Condition);
  } catch {
    return false;
  }
}

export function editarPolitica(estado, nombre, texto) {
  const b = bucketOError(estado, nombre);
  const t = String(texto ?? '').trim();
  if (!t) {
    b.politica = null;
    anotar(estado, 'S3', 'DeleteBucketPolicy', nombre);
    return b;
  }
  let p;
  try {
    p = JSON.parse(t);
  } catch {
    throw error('MalformedPolicy', 'Policy has invalid JSON format.');
  }
  if (!p || typeof p !== 'object' || !p.Statement) throw error('MalformedPolicy', 'Missing required field Statement');
  if (politicaEsPublica(t) && b.bloqueoPublico.politicasNuevas) {
    throw error('AccessDenied', 'You either don\'t have permissions to edit the bucket policy, or your bucket policy grants a level of public access that conflicts with your Block Public Access settings. To edit a bucket policy, you need s3:PutBucketPolicy permissions. To review which Block Public Access settings are turned on, view your account and bucket settings.');
  }
  b.politica = t;
  anotar(estado, 'S3', 'PutBucketPolicy', `${nombre}${politicaEsPublica(t) ? ' (pública)' : ''}`);
  return b;
}

function validarReglaCiclo(b, regla, nombreAnterior) {
  const nombre = String(regla.nombre ?? '').trim();
  if (!nombre) throw error('InvalidArgument', 'Lifecycle rule name is required.');
  if (nombre.length > 255) throw error('InvalidArgument', 'Lifecycle rule name can be up to 255 characters.');
  if (b.ciclo.some((r) => r.nombre === nombre && r.nombre !== nombreAnterior)) throw error('InvalidArgument', `A lifecycle rule with the name "${nombre}" already exists.`);
  const prefijo = regla.prefijo === null || regla.prefijo === undefined || regla.prefijo === '' ? null : String(regla.prefijo).trim();
  const enteros = (lista = []) =>
    lista.map((t) => {
      const dias = Number(t.dias);
      if (!Number.isInteger(dias) || dias < 0) throw error('InvalidArgument', "'Days' for a transition must be a non-negative integer.");
      if (!claseS3(t.clase) || t.clase === 'STANDARD') throw error('InvalidArgument', `Invalid storage class for a transition: ${t.clase}`);
      return { dias, clase: t.clase };
    });
  const transiciones = enteros(regla.transiciones).sort((a, b) => a.dias - b.dias);
  const transicionesNoActuales = enteros(regla.transicionesNoActuales).sort((a, b) => a.dias - b.dias);
  const revisarTransiciones = (lista, cuales) => {
    const clases = new Set();
    for (const t of lista) {
      const c = claseS3(t.clase);
      if (clases.has(t.clase)) throw error('InvalidArgument', `You can't add more than one transition to ${c.nombre} for ${cuales} objects.`);
      clases.add(t.clase);
      if (t.dias < c.minimoDias) throw error('InvalidArgument', `Days in the Transition action for StorageClass ${c.nombre} for ${cuales} objects must be at least ${c.minimoDias}.`);
    }
    for (let i = 1; i < lista.length; i++) {
      const antes = claseS3(lista[i - 1].clase);
      const ahora = claseS3(lista[i].clase);
      if (ahora.orden <= antes.orden) {
        throw error('InvalidArgument', `Transitions for ${cuales} objects must go to colder storage classes: ${antes.nombre} can't transition to ${ahora.nombre}.`);
      }
      if ((antes.clase === 'STANDARD_IA' || antes.clase === 'ONEZONE_IA') && lista[i].dias - lista[i - 1].dias < 30) {
        throw error('InvalidArgument', `Objects must be stored at least 30 days in ${antes.nombre} before they can transition to ${ahora.nombre}.`);
      }
    }
  };
  revisarTransiciones(transiciones, 'current');
  revisarTransiciones(transicionesNoActuales, 'noncurrent');

  const diasOpcional = (v, texto) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) throw error('InvalidArgument', `'Days' for ${texto} must be a positive integer.`);
    return n;
  };
  const expiracionDias = diasOpcional(regla.expiracionDias, 'Expiration');
  const borrarNoActualesDias = diasOpcional(regla.borrarNoActualesDias, 'NoncurrentVersionExpiration');
  if (expiracionDias !== null && transiciones.length && expiracionDias <= transiciones.at(-1).dias) {
    throw error('InvalidArgument', `'Days' in the Expiration action must be greater than 'Days' in the Transition action (${transiciones.at(-1).dias}).`);
  }
  if (!transiciones.length && !transicionesNoActuales.length && expiracionDias === null && borrarNoActualesDias === null) {
    throw error('InvalidArgument', 'At least one lifecycle rule action must be selected.');
  }
  return { nombre, estado: regla.estado === 'Disabled' ? 'Disabled' : 'Enabled', prefijo, transiciones, transicionesNoActuales, expiracionDias, borrarNoActualesDias };
}

/** «Create lifecycle rule». `prefijo` null = se aplica a todos los objetos del bucket. */
export function crearReglaCiclo(estado, nombre, regla = {}) {
  const b = bucketOError(estado, nombre);
  const limpia = validarReglaCiclo(b, regla);
  b.ciclo.push(limpia);
  anotar(estado, 'S3', 'PutBucketLifecycleConfiguration', `${nombre}: «${limpia.nombre}» ${describirReglaCiclo(limpia)}`);
  return limpia;
}

export function editarReglaCiclo(estado, nombre, nombreRegla, regla = {}) {
  const b = bucketOError(estado, nombre);
  const i = b.ciclo.findIndex((r) => r.nombre === nombreRegla);
  if (i < 0) throw error('NoSuchLifecycleConfiguration', 'The lifecycle configuration does not exist');
  b.ciclo[i] = validarReglaCiclo(b, regla, nombreRegla);
  anotar(estado, 'S3', 'PutBucketLifecycleConfiguration', `${nombre}: «${b.ciclo[i].nombre}» ${describirReglaCiclo(b.ciclo[i])}`);
  return b.ciclo[i];
}

export function eliminarReglaCiclo(estado, nombre, nombreRegla) {
  const b = bucketOError(estado, nombre);
  b.ciclo = b.ciclo.filter((r) => r.nombre !== nombreRegla);
  anotar(estado, 'S3', 'DeleteLifecycleRule', `${nombre}: «${nombreRegla}»`);
}

export const describirReglaCiclo = (r) =>
  [
    r.prefijo ? `prefijo «${r.prefijo}»` : 'todo el bucket',
    ...r.transiciones.map((t) => `día ${t.dias} → ${claseS3(t.clase).nombre}`),
    ...r.transicionesNoActuales.map((t) => `versión anterior día ${t.dias} → ${claseS3(t.clase).nombre}`),
    r.expiracionDias !== null ? `expira el día ${r.expiracionDias}` : null,
    r.borrarNoActualesDias !== null ? `borra versiones anteriores el día ${r.borrarNoActualesDias}` : null
  ]
    .filter(Boolean)
    .join(', ');

/** «Upload»: `archivos` = [{ llave, tamano, tipo }]. Con versionado, subir un nombre repetido crea otra versión. */
export function subirObjetos(estado, nombre, archivos = [], { clase = 'STANDARD', prefijo = '' } = {}) {
  const b = bucketOError(estado, nombre);
  if (!claseS3(clase)) throw error('InvalidStorageClass', 'The storage class you specified is not valid');
  const ahora = iso();
  const subidos = [];
  for (const a of archivos) {
    const llave = `${prefijo}${String(a.llave ?? '').replace(/^\/+/, '')}`;
    if (!llave || llave.length > 1024) throw error('KeyTooLongError', 'Your key is too long');
    const versionId = b.versionado === 'Enabled' ? hexAzar(32) : 'null';
    if (b.versionado === 'Enabled') {
      for (const o of b.objetos) if (o.llave === llave) o.actual = false;
    } else {
      b.objetos = b.objetos.filter((o) => !(o.llave === llave && o.versionId === 'null'));
      for (const o of b.objetos) if (o.llave === llave) o.actual = false;
    }
    const objeto = { llave, tamano: Math.max(0, Number(a.tamano) || 0), tipo: String(a.tipo ?? ''), clase, versionId, actual: true, marcadorBorrado: false, modificado: ahora };
    b.objetos.push(objeto);
    subidos.push(objeto);
  }
  anotar(estado, 'S3', 'PutObject', `${nombre}: ${subidos.map((o) => o.llave).join(', ')} (${claseS3(clase).nombre})`);
  return subidos;
}

export function crearCarpeta(estado, nombre, carpeta) {
  const n = String(carpeta ?? '').trim().replace(/\/+$/, '');
  if (!n || n.includes('/')) throw error('InvalidArgument', 'Folder names can\'t contain "/".');
  return subirObjetos(estado, nombre, [{ llave: `${n}/`, tamano: 0, tipo: '' }])[0];
}

/** «Delete»: con versionado activo deja un marcador de borrado (los datos siguen ahí). */
export function eliminarObjetos(estado, nombre, llaves = []) {
  const b = bucketOError(estado, nombre);
  for (const llave of llaves) {
    if (b.versionado === 'Disabled') {
      b.objetos = b.objetos.filter((o) => o.llave !== llave);
      continue;
    }
    for (const o of b.objetos) if (o.llave === llave) o.actual = false;
    b.objetos.push({ llave, tamano: 0, tipo: '', clase: 'STANDARD', versionId: hexAzar(32), actual: true, marcadorBorrado: true, modificado: iso() });
  }
  anotar(estado, 'S3', 'DeleteObjects', `${nombre}: ${llaves.join(', ')}`);
}

/** «Empty bucket»: borra para siempre todos los objetos y todas sus versiones. */
export function vaciarBucket(estado, nombre) {
  const b = bucketOError(estado, nombre);
  b.objetos = [];
  anotar(estado, 'S3', 'EmptyBucket', nombre);
  return b;
}

export function eliminarBucket(estado, nombre) {
  const b = bucketOError(estado, nombre);
  if (b.objetos.length) {
    throw error('BucketNotEmpty', 'The bucket you tried to delete is not empty. You must delete all versions in the bucket.');
  }
  estado.buckets = estado.buckets.filter((x) => x !== b);
  anotar(estado, 'S3', 'DeleteBucket', nombre);
}

/* ==================================================================== IAM */

const NOMBRE_IAM = /^[\w+=,.@-]{1,64}$/;
const mismo = (a, b) => a.toLowerCase() === b.toLowerCase();
const arn = (estado, tipo, nombre) => `arn:aws:iam::${estado.cuenta.id}:${tipo}/${nombre}`;

function validarPoliticas(nombres = []) {
  const lista = [...new Set(nombres)];
  for (const n of lista) if (!politicaIam(n)) throw error('NoSuchEntity', `Policy arn:aws:iam::aws:policy/${n} does not exist or is not attachable.`);
  if (lista.length > 10) throw error('LimitExceeded', 'Cannot exceed quota for PoliciesPerUser: 10');
  return lista;
}

const usuarioOError = (estado, nombre) => {
  const u = estado.iam.usuarios.find((x) => x.nombre === nombre);
  if (!u) throw error('NoSuchEntity', `The user with name ${nombre} cannot be found.`);
  return u;
};
const grupoIamOError = (estado, nombre) => {
  const g = estado.iam.grupos.find((x) => x.nombre === nombre);
  if (!g) throw error('NoSuchEntity', `The group with name ${nombre} cannot be found.`);
  return g;
};
const rolOError = (estado, nombre) => {
  const r = estado.iam.roles.find((x) => x.nombre === nombre);
  if (!r) throw error('NoSuchEntity', `The role with name ${nombre} cannot be found.`);
  return r;
};

/**
 * «Create user». `consola`: si tendrá contraseña para entrar a la consola.
 * `grupos`: nombres de grupos; `politicas`: políticas puestas directo al usuario.
 */
export function crearUsuario(estado, { nombre, consola = false, cambiarContrasena = true, grupos = [], politicas = [] } = {}) {
  const n = String(nombre ?? '').trim();
  if (!NOMBRE_IAM.test(n)) {
    throw error('ValidationError', 'The user name can have up to 64 characters. Valid characters: A-Z, a-z, 0-9, and + = , . @ _ - (hyphen)');
  }
  if (estado.iam.usuarios.some((u) => mismo(u.nombre, n))) throw error('EntityAlreadyExists', `User with name ${n} already exists.`);
  grupos.forEach((g) => grupoIamOError(estado, g));
  const usuario = {
    nombre: n,
    arn: arn(estado, 'user', n),
    creado: iso(),
    consola: Boolean(consola),
    cambiarContrasena: Boolean(consola && cambiarContrasena),
    grupos: [...new Set(grupos)],
    politicas: validarPoliticas(politicas),
    mfa: [],
    llavesAcceso: []
  };
  estado.iam.usuarios.push(usuario);
  anotar(estado, 'IAM', 'CreateUser', `${n} · consola: ${usuario.consola ? 'sí' : 'no'} · grupos: ${usuario.grupos.join(', ') || 'ninguno'} · políticas directas: ${usuario.politicas.join(', ') || 'ninguna'}`);
  return usuario;
}

export function eliminarUsuario(estado, nombre) {
  usuarioOError(estado, nombre);
  estado.iam.usuarios = estado.iam.usuarios.filter((u) => u.nombre !== nombre);
  anotar(estado, 'IAM', 'DeleteUser', nombre);
}

export function editarAccesoConsola(estado, nombre, { consola, cambiarContrasena = true } = {}) {
  const u = usuarioOError(estado, nombre);
  u.consola = Boolean(consola);
  u.cambiarContrasena = Boolean(consola && cambiarContrasena);
  anotar(estado, 'IAM', consola ? 'CreateLoginProfile' : 'DeleteLoginProfile', nombre);
  return u;
}

/** Deja al usuario exactamente en esos grupos. */
export function gruposDeUsuario(estado, nombre, grupos = []) {
  const u = usuarioOError(estado, nombre);
  grupos.forEach((g) => grupoIamOError(estado, g));
  u.grupos = [...new Set(grupos)];
  anotar(estado, 'IAM', 'AddUserToGroup / RemoveUserFromGroup', `${nombre}: ${u.grupos.join(', ') || 'sin grupos'}`);
  return u;
}

export function agregarUsuariosAGrupo(estado, grupo, usuarios = []) {
  grupoIamOError(estado, grupo);
  for (const n of usuarios) {
    const u = usuarioOError(estado, n);
    if (!u.grupos.includes(grupo)) u.grupos.push(grupo);
  }
  anotar(estado, 'IAM', 'AddUserToGroup', `${grupo}: ${usuarios.join(', ')}`);
}

export function quitarUsuarioDeGrupo(estado, grupo, usuario) {
  const u = usuarioOError(estado, usuario);
  u.grupos = u.grupos.filter((g) => g !== grupo);
  anotar(estado, 'IAM', 'RemoveUserFromGroup', `${grupo}: ${usuario}`);
}

export function adjuntarPoliticasUsuario(estado, nombre, politicas = []) {
  const u = usuarioOError(estado, nombre);
  u.politicas = validarPoliticas([...u.politicas, ...politicas]);
  anotar(estado, 'IAM', 'AttachUserPolicy', `${nombre}: ${politicas.join(', ')}`);
  return u;
}

export function quitarPoliticaUsuario(estado, nombre, politica) {
  const u = usuarioOError(estado, nombre);
  u.politicas = u.politicas.filter((p) => p !== politica);
  anotar(estado, 'IAM', 'DetachUserPolicy', `${nombre}: ${politica}`);
  return u;
}

/** «Assign MFA device». `tipo`: 'virtual' | 'llave' | 'hardware'. */
export function asignarMfa(estado, nombre, { nombreDispositivo, tipo = 'virtual' } = {}) {
  const u = usuarioOError(estado, nombre);
  const d = String(nombreDispositivo ?? '').trim();
  if (!/^[\w+=,.@-]{1,128}$/.test(d)) throw error('ValidationError', 'Device name can have up to 128 characters. Valid characters: A-Z, a-z, 0-9, and + = , . @ _ - (hyphen)');
  if (u.mfa.length >= 8) throw error('LimitExceeded', 'Cannot exceed quota for MFADevicesPerUser: 8');
  u.mfa.push({ nombre: d, tipo, creado: iso() });
  anotar(estado, 'IAM', 'EnableMFADevice', `${nombre}: ${d} (${tipo})`);
  return u;
}

export function quitarMfa(estado, nombre, nombreDispositivo) {
  const u = usuarioOError(estado, nombre);
  u.mfa = u.mfa.filter((m) => m.nombre !== nombreDispositivo);
  anotar(estado, 'IAM', 'DeactivateMFADevice', `${nombre}: ${nombreDispositivo}`);
  return u;
}

export function asignarMfaRaiz(estado) {
  estado.iam.raizMfa = true;
  anotar(estado, 'IAM', 'EnableMFADevice (root)', 'cuenta raíz');
}

export function crearLlaveAcceso(estado, nombre) {
  const u = usuarioOError(estado, nombre);
  if (u.llavesAcceso.length >= 2) throw error('LimitExceeded', 'Cannot exceed quota for AccessKeysPerUser: 2');
  const llave = { id: `AKIA${Array.from({ length: 16 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[Math.floor(aleatorio() * 32)]).join('')}`, estado: 'Active', creado: iso() };
  u.llavesAcceso.push(llave);
  anotar(estado, 'IAM', 'CreateAccessKey', `${nombre}: ${llave.id}`);
  return llave;
}

export function cambiarLlaveAcceso(estado, nombre, id, activa) {
  const u = usuarioOError(estado, nombre);
  const llave = u.llavesAcceso.find((k) => k.id === id);
  if (!llave) throw error('NoSuchEntity', `The Access Key with id ${id} cannot be found.`);
  llave.estado = activa ? 'Active' : 'Inactive';
  anotar(estado, 'IAM', 'UpdateAccessKey', `${nombre}: ${id} ${llave.estado}`);
  return llave;
}

export function eliminarLlaveAcceso(estado, nombre, id) {
  const u = usuarioOError(estado, nombre);
  u.llavesAcceso = u.llavesAcceso.filter((k) => k.id !== id);
  anotar(estado, 'IAM', 'DeleteAccessKey', `${nombre}: ${id}`);
}

export function crearGrupoIam(estado, { nombre, politicas = [], usuarios = [] } = {}) {
  const n = String(nombre ?? '').trim();
  if (!/^[\w+=,.@-]{1,128}$/.test(n)) {
    throw error('ValidationError', 'The user group name can have up to 128 characters. Valid characters: A-Z, a-z, 0-9, and + = , . @ _ - (hyphen)');
  }
  if (estado.iam.grupos.some((g) => mismo(g.nombre, n))) throw error('EntityAlreadyExists', `Group with name ${n} already exists.`);
  usuarios.forEach((u) => usuarioOError(estado, u));
  const grupo = { nombre: n, arn: arn(estado, 'group', n), creado: iso(), politicas: validarPoliticas(politicas) };
  estado.iam.grupos.push(grupo);
  for (const u of usuarios) {
    const usuario = usuarioOError(estado, u);
    if (!usuario.grupos.includes(n)) usuario.grupos.push(n);
  }
  anotar(estado, 'IAM', 'CreateGroup', `${n} · políticas: ${grupo.politicas.join(', ') || 'ninguna'}${usuarios.length ? ` · usuarios: ${usuarios.join(', ')}` : ''}`);
  return grupo;
}

export function eliminarGrupoIam(estado, nombre) {
  grupoIamOError(estado, nombre);
  estado.iam.grupos = estado.iam.grupos.filter((g) => g.nombre !== nombre);
  for (const u of estado.iam.usuarios) u.grupos = u.grupos.filter((g) => g !== nombre);
  anotar(estado, 'IAM', 'DeleteGroup', nombre);
}

export function adjuntarPoliticasGrupo(estado, nombre, politicas = []) {
  const g = grupoIamOError(estado, nombre);
  g.politicas = validarPoliticas([...g.politicas, ...politicas]);
  anotar(estado, 'IAM', 'AttachGroupPolicy', `${nombre}: ${politicas.join(', ')}`);
  return g;
}

export function quitarPoliticaGrupo(estado, nombre, politica) {
  const g = grupoIamOError(estado, nombre);
  g.politicas = g.politicas.filter((p) => p !== politica);
  anotar(estado, 'IAM', 'DetachGroupPolicy', `${nombre}: ${politica}`);
  return g;
}

/** «Create role» para un servicio de AWS (EC2, el caso del curso). */
export function crearRol(estado, { nombre, servicio = 'ec2.amazonaws.com', descripcion = '', politicas = [] } = {}) {
  const n = String(nombre ?? '').trim();
  if (!NOMBRE_IAM.test(n)) throw error('ValidationError', 'The role name can have up to 64 characters. Valid characters: A-Z, a-z, 0-9, and + = , . @ _ - (hyphen)');
  if (estado.iam.roles.some((r) => mismo(r.nombre, n))) throw error('EntityAlreadyExists', `Role with name ${n} already exists.`);
  const rol = { nombre: n, arn: arn(estado, 'role', n), creado: iso(), servicio, descripcion: String(descripcion).slice(0, 1000), politicas: validarPoliticas(politicas) };
  estado.iam.roles.push(rol);
  anotar(estado, 'IAM', 'CreateRole', `${n} (confía en ${servicio}) · políticas: ${rol.politicas.join(', ') || 'ninguna'}`);
  return rol;
}

export function eliminarRol(estado, nombre) {
  rolOError(estado, nombre);
  if (vivas(estado).some((i) => i.rolIam === nombre)) throw error('DeleteConflict', 'Cannot delete entity, must remove roles from instance profile first.');
  estado.iam.roles = estado.iam.roles.filter((r) => r.nombre !== nombre);
  anotar(estado, 'IAM', 'DeleteRole', nombre);
}

export function adjuntarPoliticasRol(estado, nombre, politicas = []) {
  const r = rolOError(estado, nombre);
  r.politicas = validarPoliticas([...r.politicas, ...politicas]);
  anotar(estado, 'IAM', 'AttachRolePolicy', `${nombre}: ${politicas.join(', ')}`);
  return r;
}

export function quitarPoliticaRol(estado, nombre, politica) {
  const r = rolOError(estado, nombre);
  r.politicas = r.politicas.filter((p) => p !== politica);
  anotar(estado, 'IAM', 'DetachRolePolicy', `${nombre}: ${politica}`);
  return r;
}

/* ============================================================ el tiempo */

/**
 * Resuelve las transiciones que ya debieron terminar (pending → running,
 * creating → available…). Devuelve true si cambió algo. La consola lo llama
 * cada segundo; el servidor, antes de calificar.
 */
export function avanzar(estado, ahora = reloj.ahora()) {
  let cambio = false;

  for (const inst of estado.instancias) {
    if (inst.hasta === undefined || inst.hasta === null || inst.hasta > ahora) continue;
    const anterior = inst.estado;
    inst.estado = inst.siguiente;
    inst.desde = inst.hasta;
    delete inst.hasta;
    delete inst.siguiente;
    cambio = true;

    if (inst.estado === 'running' && anterior === 'pending') {
      inst.arranques = (inst.arranques ?? 0) + 1;
      // El user data solo corre en el primer arranque.
      if (inst.arranques === 1) inst.userDataArranque = inst.userData;
    }
    if (inst.estado === 'stopped') {
      if (!inst.eipId) inst.ipPublica = null;
    }
    if (inst.estado === 'terminated') {
      inst.ipPublica = null;
      const eip = estado.eips.find((e) => e.instanciaId === inst.id);
      if (eip) eip.instanciaId = null;
      inst.eipId = null;
      for (const volId of inst.volumenes) {
        const vol = estado.volumenes.find((v) => v.id === volId);
        if (!vol) continue;
        if (vol.eliminarAlTerminar) estado.volumenes = estado.volumenes.filter((v) => v !== vol);
        else Object.assign(vol, { estado: 'available', instanciaId: null, dispositivo: null, raiz: false });
      }
      inst.volumenes = [];
    }
  }

  for (const vol of estado.volumenes) {
    if (vol.hasta && vol.hasta <= ahora) {
      vol.estado = vol.siguiente;
      delete vol.hasta;
      delete vol.siguiente;
      cambio = true;
    }
  }

  for (const snap of estado.snapshots) {
    if (snap.estado !== 'pending') continue;
    const total = snap.hasta - snap.desde;
    const progreso = snap.hasta <= ahora ? 100 : Math.max(0, Math.min(99, Math.floor(((ahora - snap.desde) / total) * 100)));
    if (progreso !== snap.progreso) {
      snap.progreso = progreso;
      cambio = true;
    }
    if (snap.hasta <= ahora) {
      snap.estado = snap.siguiente;
      delete snap.hasta;
      delete snap.siguiente;
      cambio = true;
    }
  }

  for (const nat of estado.nats) {
    if (!nat.hasta || nat.hasta > ahora) continue;
    nat.estado = nat.siguiente;
    delete nat.hasta;
    delete nat.siguiente;
    if (nat.estado === 'deleted') {
      const eip = estado.eips.find((e) => e.natId === nat.id);
      if (eip) eip.natId = null;
    }
    cambio = true;
  }

  return cambio;
}

/** Copia profunda: el estado es JSON puro. */
export const clonar = (estado) => JSON.parse(JSON.stringify(estado));
