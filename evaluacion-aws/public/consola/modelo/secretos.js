// ---------------------------------------------------------------------------
// AWS SECRETS MANAGER · AWS KMS
//
// Los secretos de la cuenta simulada (contraseñas de bases, llaves de API…)
// y las llaves de cifrado de KMS que los protegen.
//
// Secrets Manager:
//   - «Store a new secret» con credenciales de RDS, de otra base o pares
//     llave/valor (o texto plano), cifrado con aws/secretsmanager o con una
//     llave propia de KMS.
//   - «Retrieve secret value» SÍ funciona aquí (en DataCamp sale negado).
//   - Rotación con una función de Lambda: cada vez que rota se crea una
//     versión nueva (AWSCURRENT) y la anterior queda como AWSPREVIOUS; si el
//     valor trae `password`, se cambia por una nueva al azar.
//   - Delete con ventana de recuperación de 7 a 30 días (Cancel deletion).
//   - Las bases de RDS con «Managed in AWS Secrets Manager» tienen su secreto
//     `rds!db-…` (o `rds!cluster-…`): avanzar() lo crea y lo borra junto con la
//     base, igual que AWS. El alumno no lo puede editar ni borrar.
//
// KMS:
//   - Customer managed keys: simétricas (Encrypt and decrypt o HMAC) o
//     asimétricas (RSA, ECC, ML-DSA), con alias, administradores y usuarios de
//     IAM, rotación automática (90 a 2560 días, 365 por omisión), rotación bajo
//     demanda (máximo 10), Disable/Enable y Schedule key deletion (7 a 30 días).
//   - AWS managed keys (aws/s3, aws/ebs, aws/rds, aws/dynamodb, aws/lambda,
//     aws/secretsmanager, aws/elasticfilesystem): AWS las crea la primera vez
//     que un servicio las necesita. avanzar() las agrega según lo que exista
//     en la cuenta; son de solo lectura y no se borran.
//
// Las fechas de borrado y de rotación van en tiempo REAL (días de verdad): en
// una clase de dos horas nada se borra solo, igual que en AWS.
//
// NO pongas contraseñas reales: el valor de un secreto se guarda en el estado
// (JSON) para que «Retrieve secret value» funcione. La consola lo avisa.
//
// La forma de las colecciones (campos en español; valores de AWS tal cual):
//
// estado.secretos = {
//   secretos: [{
//     nombre, arn: 'arn:aws:secretsmanager:us-east-1:<cuenta>:secret:<nombre>-AbC123',
//     tipo: 'rds' | 'otra-base' | 'otro',
//     descripcion, llaveKms (id de la llave de KMS),
//     valor (el SecretString vigente: JSON o texto plano),
//     versiones: [{ id (uuid), etapas: ['AWSCURRENT'] | ['AWSPREVIOUS'], creado, valor }],   // máx. 2
//     base: null | { id, motor, host, puerto },          // la base de un secreto tipo 'rds'
//     rotacion: { activa, expresion: 'rate(30 days)' | null, cadaMs | null, lambdaArn | null,
//                 inmediata, ultima: iso | null, siguiente: iso | null },
//     administradoPor: null | 'rds', recurso: null | arn de la base (los rds!…),
//     borradoEn: null | iso (fecha en que se borra para siempre), diasRecuperacion,
//     ultimoAcceso: null | iso, modificado, creado, etiquetas: [{ llave, valor }]
//   }]
// }
//
// estado.kms = {
//   llaves: [{
//     id (uuid), arn: 'arn:aws:kms:us-east-1:<cuenta>:key/<id>',
//     aliases: ['clinica-expedientes'] (sin el prefijo alias/), alias (el primero o null),
//     descripcion, spec: 'SYMMETRIC_DEFAULT'|'RSA_2048'|…, uso: 'ENCRYPT_DECRYPT'|'SIGN_VERIFY'|'GENERATE_VERIFY_MAC'|'KEY_AGREEMENT',
//     origen: 'AWS_KMS', multiRegion, administradaPorAws (true en aws/…), servicioAws: 's3'|… | null,
//     estado: 'Enabled' | 'Disabled' | 'PendingDeletion',
//     administradores: [arn de IAM], usuarios: [arn de IAM], adminsBorran,
//     rotacion: { activa, dias, siguiente: iso | null }, rotaciones: [{ t, tipo: 'AUTOMATIC'|'ON_DEMAND' }],   // máx. 20
//     borrado: null | { fecha: iso, dias }, etiquetas, creado
//   }]
// }
//
// Ofrece por llamar(): llaveKmsDe, llaveAwsKms, usoLlaveKms, problemaLlaveKms, secretoDe.
//
// Regla del ciclo de módulos: nada de lo importado de modelo.js se usa en el
// nivel superior de este archivo, solo dentro de funciones.
// ---------------------------------------------------------------------------

import { registrarExtension, llamar } from './registro.js';
import { aleatorio, anotar, errorAws, hexAzar, iso, nombreLimpio, reloj } from '../modelo.js';

/* ============================================================ límites */

const DIA = 86_400_000;
const HORA = 3_600_000;

/** Límites de Secrets Manager y KMS. Los «del simulador» cuidan que el estado quepa en 512 KB. */
export const LIMITES_SECRETOS = {
  recuperacionMin: 7,
  recuperacionMax: 30,
  rotacionMinMs: 4 * HORA,
  rotacionMaxMs: 1000 * DIA,
  rotacionKmsMin: 90,
  rotacionKmsMax: 2560,
  rotacionesBajoDemanda: 10,
  valorMax: 8192, // AWS acepta 65,536 bytes
  secretosMax: 40, // del simulador
  llavesMax: 30 // del simulador
};

/* ============================================================ catálogos */

/** Los tipos de «Choose secret type». Los desactivados se ven, pero no se pueden elegir. */
export const TIPOS_SECRETO = [
  { tipo: 'rds', nombre: 'Credentials for Amazon RDS database' },
  { tipo: 'documentdb', nombre: 'Credentials for Amazon DocumentDB database', desactivado: true },
  { tipo: 'redshift', nombre: 'Credentials for Amazon Redshift data warehouse', desactivado: true },
  { tipo: 'otra-base', nombre: 'Credentials for other database' },
  { tipo: 'otro', nombre: 'Other type of secret', descripcion: 'API key, OAuth token, other.' },
  { tipo: 'partner', nombre: 'Partner secret', desactivado: true }
];

/** Los motores de «Credentials for other database». */
export const MOTORES_OTRA_BASE = [
  { motor: 'mariadb', nombre: 'MariaDB', puerto: 3306 },
  { motor: 'mysql', nombre: 'MySQL', puerto: 3306 },
  { motor: 'postgres', nombre: 'PostgreSQL', puerto: 5432 },
  { motor: 'oracle', nombre: 'Oracle', puerto: 1521 },
  { motor: 'sqlserver', nombre: 'Microsoft SQL Server', puerto: 1433 }
];

/** Las especificaciones de llave de KMS y para qué sirve cada una. */
export const SPECS_KMS = [
  { spec: 'SYMMETRIC_DEFAULT', tipo: 'Symmetric', usos: ['ENCRYPT_DECRYPT'], algoritmos: ['SYMMETRIC_DEFAULT'] },
  { spec: 'HMAC_224', tipo: 'Symmetric', usos: ['GENERATE_VERIFY_MAC'], algoritmos: ['HMAC_SHA_224'] },
  { spec: 'HMAC_256', tipo: 'Symmetric', usos: ['GENERATE_VERIFY_MAC'], algoritmos: ['HMAC_SHA_256'] },
  { spec: 'HMAC_384', tipo: 'Symmetric', usos: ['GENERATE_VERIFY_MAC'], algoritmos: ['HMAC_SHA_384'] },
  { spec: 'HMAC_512', tipo: 'Symmetric', usos: ['GENERATE_VERIFY_MAC'], algoritmos: ['HMAC_SHA_512'] },
  { spec: 'RSA_2048', tipo: 'Asymmetric', usos: ['ENCRYPT_DECRYPT', 'SIGN_VERIFY'], algoritmos: ['RSAES_OAEP_SHA_1', 'RSAES_OAEP_SHA_256'], firmas: ['RSASSA_PKCS1_V1_5_SHA_256', 'RSASSA_PSS_SHA_256'] },
  { spec: 'RSA_3072', tipo: 'Asymmetric', usos: ['ENCRYPT_DECRYPT', 'SIGN_VERIFY'], algoritmos: ['RSAES_OAEP_SHA_1', 'RSAES_OAEP_SHA_256'], firmas: ['RSASSA_PKCS1_V1_5_SHA_384', 'RSASSA_PSS_SHA_384'] },
  { spec: 'RSA_4096', tipo: 'Asymmetric', usos: ['ENCRYPT_DECRYPT', 'SIGN_VERIFY'], algoritmos: ['RSAES_OAEP_SHA_1', 'RSAES_OAEP_SHA_256'], firmas: ['RSASSA_PKCS1_V1_5_SHA_512', 'RSASSA_PSS_SHA_512'] },
  { spec: 'ECC_NIST_P256', tipo: 'Asymmetric', usos: ['SIGN_VERIFY', 'KEY_AGREEMENT'], firmas: ['ECDSA_SHA_256'] },
  { spec: 'ECC_NIST_P384', tipo: 'Asymmetric', usos: ['SIGN_VERIFY', 'KEY_AGREEMENT'], firmas: ['ECDSA_SHA_384'] },
  { spec: 'ECC_NIST_P521', tipo: 'Asymmetric', usos: ['SIGN_VERIFY', 'KEY_AGREEMENT'], firmas: ['ECDSA_SHA_512'] },
  { spec: 'ECC_SECG_P256K1', tipo: 'Asymmetric', usos: ['SIGN_VERIFY'], firmas: ['ECDSA_SHA_256'] },
  { spec: 'ML_DSA_44', tipo: 'Asymmetric', usos: ['SIGN_VERIFY'], firmas: ['ML_DSA_SHAKE_256'] },
  { spec: 'ML_DSA_65', tipo: 'Asymmetric', usos: ['SIGN_VERIFY'], firmas: ['ML_DSA_SHAKE_256'] },
  { spec: 'ML_DSA_87', tipo: 'Asymmetric', usos: ['SIGN_VERIFY'], firmas: ['ML_DSA_SHAKE_256'] }
];
export const specKms = (spec) => SPECS_KMS.find((s) => s.spec === spec) ?? null;

/** Las AWS managed keys que este simulador conoce: alias, servicio y la descripción que pone AWS. */
export const LLAVES_AWS = [
  { servicio: 's3', alias: 'aws/s3', descripcion: 'Default key that protects my S3 objects when no other key is defined' },
  { servicio: 'ebs', alias: 'aws/ebs', descripcion: 'Default key that protects my EBS volumes when no other key is defined' },
  { servicio: 'rds', alias: 'aws/rds', descripcion: 'Default key that protects my RDS database volumes when no other key is defined' },
  { servicio: 'dynamodb', alias: 'aws/dynamodb', descripcion: 'Default key that protects my DynamoDB data when no other key is defined' },
  { servicio: 'lambda', alias: 'aws/lambda', descripcion: 'Default key that protects my Lambda functions when no other key is defined' },
  { servicio: 'secretsmanager', alias: 'aws/secretsmanager', descripcion: 'Default key that protects my Secrets Manager data when no other key is defined' },
  { servicio: 'elasticfilesystem', alias: 'aws/elasticfilesystem', descripcion: 'Default key that protects my EFS file systems when no other key is defined' }
];

// Qué recursos de la cuenta hacen que AWS cree cada llave administrada.
const USOS_LLAVES_AWS = {
  s3: (e) => (e.buckets ?? []).some((b) => ['SSE-KMS', 'DSSE-KMS'].includes(b.cifrado?.tipo) && !b.cifrado?.llaveKms),
  ebs: (e) => [...(e.volumenes ?? []), ...(e.snapshots ?? [])].some((v) => v.cifrado && (!v.llaveKms || v.llaveKms === 'aws/ebs')),
  rds: (e) => [...(e.rds?.instancias ?? []), ...(e.rds?.clusteres ?? [])].some((i) => i.llaveKms === 'aws/rds'),
  dynamodb: (e) => (e.dynamodb?.tablas ?? []).some((t) => t.cifrado?.tipo === 'AWS_MANAGED'),
  lambda: (e) => (e.lambda?.funciones ?? []).length > 0
};

/* ============================================================ ayudas internas */

function iniciar(estado) {
  estado.secretos ??= { secretos: [] };
  estado.secretos.secretos ??= [];
  estado.kms ??= { llaves: [] };
  estado.kms.llaves ??= [];
}

const cuentaDe = (estado) => estado.cuenta?.id ?? '123456789012';

/** Un uuid v4 como los de KMS: 1234abcd-12ab-34cd-56ef-1234567890ab. */
const uuid = () => `${hexAzar(8)}-${hexAzar(4)}-4${hexAzar(3)}-${'89ab'[Math.floor(aleatorio() * 4)]}${hexAzar(3)}-${hexAzar(12)}`;

const ALFANUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const azarDe = (abc, n) => Array.from({ length: n }, () => abc[Math.floor(aleatorio() * abc.length)]).join('');

/** Una contraseña como las de GetRandomPassword (32 caracteres, sin / @ " ni espacios). */
export function contrasenaAzar(n = 32) {
  return azarDe(`${ALFANUM}!#$%&()*+,-.:;<=>?[]^_{|}~`, n);
}

const arnLlave = (estado, id) => `arn:aws:kms:us-east-1:${cuentaDe(estado)}:key/${id}`;
const arnPrincipal = (estado, tipo, nombre) => `arn:aws:iam::${cuentaDe(estado)}:${tipo}/${nombre}`;

const limpiarEtiquetas = (etiquetas) =>
  (Array.isArray(etiquetas) ? etiquetas : [])
    .map((t) => ({ llave: nombreLimpio(t?.llave, 128), valor: nombreLimpio(t?.valor, 256) }))
    .filter((t) => t.llave)
    .slice(0, 50);

/* ============================================================ KMS: buscar */

/**
 * La llave a la que se refiere `ref`: su id, su ARN, `alias/x`, `x` o el ARN
 * del alias. null si no existe.
 */
export function llaveKmsDe(estado, ref) {
  const llaves = estado.kms?.llaves ?? [];
  const r = String(ref ?? '').trim();
  if (!r) return null;
  const porId = llaves.find((k) => k.id === r || k.arn === r);
  if (porId) return porId;
  const alias = r.replace(/^arn:aws:kms:[^:]*:\d+:/, '').replace(/^alias\//, '');
  return llaves.find((k) => (k.aliases ?? []).includes(alias)) ?? null;
}

function llaveOError(estado, ref) {
  const k = llaveKmsDe(estado, ref);
  if (!k) throw errorAws('NotFoundException', `Key '${String(ref ?? '').startsWith('arn:') ? ref : arnLlave(estado, ref ?? '')}' does not exist`);
  return k;
}

/** El nombre que se muestra de una llave: su alias (aws/s3, mi-llave) o su id. */
export function nombreLlaveKms(estado, ref) {
  const k = llaveKmsDe(estado, ref);
  if (!k) return String(ref ?? '–');
  return k.alias ?? k.id;
}

function soloCliente(k) {
  if (k.administradaPorAws) throw errorAws('UnsupportedOperationException', `${k.arn} is an AWS managed key. You cannot change the configuration of AWS managed keys.`);
}

function noPendiente(k) {
  if (k.estado === 'PendingDeletion') throw errorAws('KMSInvalidStateException', `${k.arn} is pending deletion.`);
}

/**
 * ¿Se puede usar la llave para cifrar o descifrar? Función pura: { ok, motivo }.
 * La usan Secrets Manager, EFS y las rúbricas.
 */
export function usoLlaveKms(estado, ref) {
  const k = llaveKmsDe(estado, ref);
  if (!k) return { ok: false, motivo: `La llave de KMS ${ref ?? ''} no existe (¿se borró?).` };
  if (k.estado === 'PendingDeletion') return { ok: false, motivo: `La llave ${k.alias ?? k.id} está programada para borrarse (Pending deletion): nadie la puede usar.` };
  if (k.estado !== 'Enabled') return { ok: false, motivo: `La llave ${k.alias ?? k.id} está deshabilitada (Disabled).` };
  if (k.uso !== 'ENCRYPT_DECRYPT' || k.spec !== 'SYMMETRIC_DEFAULT') return { ok: false, motivo: `La llave ${k.alias ?? k.id} no es simétrica de cifrado (${k.spec}, ${k.uso}).` };
  return { ok: true, motivo: `La llave ${k.alias ?? k.id} está habilitada.` };
}

/** Por qué no sirve la llave, en el inglés de AWS (para los errores de Secrets Manager y EFS). */
export function problemaLlaveKms(estado, ref) {
  const k = llaveKmsDe(estado, ref);
  if (!k) return `The KMS key ${ref ?? ''} doesn't exist.`;
  if (k.estado === 'PendingDeletion') return `${k.arn} is pending deletion.`;
  if (k.estado !== 'Enabled') return `${k.arn} is disabled.`;
  return `${k.arn} is not a symmetric encryption KMS key.`;
}

/* ============================================================ KMS: AWS managed */

/**
 * La AWS managed key de un servicio ('s3', 'secretsmanager'…). Si todavía no
 * existe, la crea (así lo hace AWS la primera vez que el servicio la usa).
 */
export function llaveAwsKms(estado, servicio) {
  iniciar(estado);
  const def = LLAVES_AWS.find((l) => l.servicio === servicio);
  if (!def) return null;
  const ya = estado.kms.llaves.find((k) => k.administradaPorAws && (k.aliases ?? []).includes(def.alias));
  if (ya) return ya;
  const id = uuid();
  const ahora = reloj.ahora();
  const k = {
    id,
    arn: arnLlave(estado, id),
    aliases: [def.alias],
    alias: def.alias,
    descripcion: def.descripcion,
    spec: 'SYMMETRIC_DEFAULT',
    uso: 'ENCRYPT_DECRYPT',
    origen: 'AWS_KMS',
    multiRegion: false,
    administradaPorAws: true,
    servicioAws: servicio,
    estado: 'Enabled',
    administradores: [],
    usuarios: [],
    adminsBorran: false,
    rotacion: { activa: true, dias: 365, siguiente: iso(ahora + 365 * DIA) },
    rotaciones: [],
    borrado: null,
    etiquetas: [],
    creado: iso(ahora)
  };
  estado.kms.llaves.push(k);
  return k;
}

/* ============================================================ KMS: alias */

function validarAlias(estado, alias, llave = null) {
  const a = String(alias ?? '').trim().replace(/^alias\//, '');
  if (!a) throw errorAws('ValidationException', 'Alias is required.');
  if (/^aws\//i.test(a)) throw errorAws('NotAuthorizedException', 'Alias names cannot begin with aws/. That alias name prefix is reserved by Amazon Web Services to represent AWS managed keys in your account.');
  if (a.length > 250 || !/^[A-Za-z0-9/_-]+$/.test(a)) {
    throw errorAws('ValidationException', 'Alias names must be between 1 and 256 characters and contain only alphanumeric characters, forward slashes (/), underscores (_), and dashes (-).');
  }
  const otra = (estado.kms.llaves ?? []).find((k) => k !== llave && (k.aliases ?? []).includes(a));
  if (otra || llave?.aliases?.includes(a)) throw errorAws('AlreadyExistsException', `An alias with the name arn:aws:kms:us-east-1:${cuentaDe(estado)}:alias/${a} already exists`);
  return a;
}

/** Valida una lista de principales de IAM (nombres o ARN de usuarios y roles) y devuelve sus ARN. */
function validarPrincipales(estado, lista) {
  const salida = [];
  for (const p of Array.isArray(lista) ? lista : []) {
    const t = String(p ?? '').trim();
    if (!t) continue;
    const u = (estado.iam?.usuarios ?? []).find((x) => x.nombre === t || x.arn === t || arnPrincipal(estado, 'user', x.nombre) === t);
    const r = u ? null : (estado.iam?.roles ?? []).find((x) => x.nombre === t || x.arn === t || arnPrincipal(estado, 'role', x.nombre) === t);
    if (!u && !r) throw errorAws('MalformedPolicyDocumentException', 'Policy contains a statement with one or more invalid principals.');
    const arn = u ? arnPrincipal(estado, 'user', u.nombre) : arnPrincipal(estado, 'role', r.nombre);
    if (!salida.includes(arn)) salida.push(arn);
  }
  return salida;
}

/* ============================================================ KMS: acciones */

/**
 * «Create key». p = { alias, descripcion, tipo: 'simetrica'|'asimetrica', uso, spec,
 *   multiRegion, administradores: [nombres o ARN de IAM], usuarios: [...], adminsBorran, etiquetas }
 */
export function crearLlaveKms(estado, p = {}) {
  iniciar(estado);
  if (estado.kms.llaves.filter((k) => !k.administradaPorAws).length >= LIMITES_SECRETOS.llavesMax) {
    throw errorAws('LimitExceededException', `El simulador admite hasta ${LIMITES_SECRETOS.llavesMax} llaves propias. Programa el borrado de las que ya no uses.`);
  }
  const asimetrica = p.tipo === 'asimetrica';
  const uso = p.uso ?? (asimetrica ? 'ENCRYPT_DECRYPT' : 'ENCRYPT_DECRYPT');
  const spec = p.spec ?? (asimetrica ? 'RSA_2048' : uso === 'GENERATE_VERIFY_MAC' ? 'HMAC_256' : 'SYMMETRIC_DEFAULT');
  const s = specKms(spec);
  if (!s) throw errorAws('ValidationException', `1 validation error detected: Value '${spec}' at 'keySpec' failed to satisfy constraint: Member must satisfy enum value set`);
  if ((s.tipo === 'Asymmetric') !== asimetrica && p.tipo) throw errorAws('ValidationException', `KeySpec ${spec} is not a valid ${asimetrica ? 'asymmetric' : 'symmetric'} key spec.`);
  if (!s.usos.includes(uso)) throw errorAws('ValidationException', `KeyUsage ${uso} is not compatible with KeySpec ${spec}`);
  if (p.multiRegion && s.tipo === 'Asymmetric' && false) throw errorAws('ValidationException', 'Unsupported');
  const alias = validarAlias(estado, p.alias);
  const descripcion = nombreLimpio(p.descripcion, 8192);
  const administradores = validarPrincipales(estado, p.administradores);
  const usuarios = validarPrincipales(estado, p.usuarios);
  const id = p.multiRegion ? `mrk-${hexAzar(32)}` : uuid();
  const k = {
    id,
    arn: arnLlave(estado, id),
    aliases: [alias],
    alias,
    descripcion,
    spec,
    uso,
    origen: 'AWS_KMS',
    multiRegion: Boolean(p.multiRegion),
    administradaPorAws: false,
    servicioAws: null,
    estado: 'Enabled',
    administradores,
    usuarios,
    adminsBorran: p.adminsBorran !== false,
    rotacion: { activa: false, dias: 365, siguiente: null },
    rotaciones: [],
    borrado: null,
    etiquetas: limpiarEtiquetas(p.etiquetas),
    creado: iso()
  };
  estado.kms.llaves.push(k);
  anotar(estado, 'KMS', 'CreateKey', `${k.arn} (${spec}, ${uso})`);
  anotar(estado, 'KMS', 'CreateAlias', `alias/${alias} → ${k.id}`);
  return k;
}

/** «Edit» de la descripción (UpdateKeyDescription). */
export function editarLlaveKms(estado, ref, { descripcion } = {}) {
  iniciar(estado);
  const k = llaveOError(estado, ref);
  soloCliente(k);
  noPendiente(k);
  k.descripcion = nombreLimpio(descripcion, 8192);
  anotar(estado, 'KMS', 'UpdateKeyDescription', k.arn);
  return k;
}

/** «Create alias» (pestaña Aliases). */
export function crearAliasKms(estado, ref, alias) {
  iniciar(estado);
  const k = llaveOError(estado, ref);
  soloCliente(k);
  noPendiente(k);
  const a = validarAlias(estado, alias, k);
  k.aliases.push(a);
  k.alias = k.aliases[0];
  anotar(estado, 'KMS', 'CreateAlias', `alias/${a} → ${k.id}`);
  return k;
}

/** «Delete alias». */
export function eliminarAliasKms(estado, alias) {
  iniciar(estado);
  const a = String(alias ?? '').trim().replace(/^alias\//, '');
  const k = estado.kms.llaves.find((x) => (x.aliases ?? []).includes(a));
  if (!k) throw errorAws('NotFoundException', `Alias arn:aws:kms:us-east-1:${cuentaDe(estado)}:alias/${a} is not found.`);
  soloCliente(k);
  k.aliases = k.aliases.filter((x) => x !== a);
  k.alias = k.aliases[0] ?? null;
  anotar(estado, 'KMS', 'DeleteAlias', `alias/${a}`);
  return k;
}

/** Key actions → Enable. */
export function habilitarLlaveKms(estado, ref) {
  iniciar(estado);
  const k = llaveOError(estado, ref);
  soloCliente(k);
  noPendiente(k);
  k.estado = 'Enabled';
  anotar(estado, 'KMS', 'EnableKey', k.arn);
  return k;
}

/** Key actions → Disable. Mientras esté deshabilitada nadie la puede usar (ni para descifrar). */
export function deshabilitarLlaveKms(estado, ref) {
  iniciar(estado);
  const k = llaveOError(estado, ref);
  soloCliente(k);
  noPendiente(k);
  k.estado = 'Disabled';
  anotar(estado, 'KMS', 'DisableKey', k.arn);
  return k;
}

/** «Schedule key deletion»: la llave queda Pending deletion durante `dias` (7 a 30). */
export function programarBorradoLlaveKms(estado, ref, dias = 30) {
  iniciar(estado);
  const k = llaveOError(estado, ref);
  soloCliente(k);
  noPendiente(k);
  const n = Number(dias);
  if (!Number.isInteger(n) || n < LIMITES_SECRETOS.recuperacionMin) {
    throw errorAws('ValidationException', `1 validation error detected: Value '${dias}' at 'pendingWindowInDays' failed to satisfy constraint: Member must have value greater than or equal to 7`);
  }
  if (n > LIMITES_SECRETOS.recuperacionMax) {
    throw errorAws('ValidationException', `1 validation error detected: Value '${dias}' at 'pendingWindowInDays' failed to satisfy constraint: Member must have value less than or equal to 30`);
  }
  k.estado = 'PendingDeletion';
  k.borrado = { fecha: iso(reloj.ahora() + n * DIA), dias: n };
  anotar(estado, 'KMS', 'ScheduleKeyDeletion', `${k.arn} en ${n} días`);
  return k;
}

/** «Cancel key deletion»: la llave regresa, pero deshabilitada (como en AWS). */
export function cancelarBorradoLlaveKms(estado, ref) {
  iniciar(estado);
  const k = llaveOError(estado, ref);
  soloCliente(k);
  if (k.estado !== 'PendingDeletion') throw errorAws('KMSInvalidStateException', `${k.arn} is not pending deletion.`);
  k.estado = 'Disabled';
  k.borrado = null;
  anotar(estado, 'KMS', 'CancelKeyDeletion', k.arn);
  return k;
}

const rotable = (k) => k.spec === 'SYMMETRIC_DEFAULT' && k.origen === 'AWS_KMS';

/** «Automatic key rotation» → Edit: activa y cada cuántos días (90 a 2560; 365 por omisión). */
export function rotacionLlaveKms(estado, ref, { activa, dias = 365 } = {}) {
  iniciar(estado);
  const k = llaveOError(estado, ref);
  soloCliente(k);
  if (!rotable(k)) throw errorAws('UnsupportedOperationException', `${k.arn} key rotation is not supported for this key spec (${k.spec}). Only symmetric encryption KMS keys can be rotated automatically.`);
  if (k.estado !== 'Enabled') throw errorAws('KMSInvalidStateException', `${k.arn} is ${k.estado === 'PendingDeletion' ? 'pending deletion' : 'disabled'}.`);
  if (activa) {
    const n = Number(dias);
    if (!Number.isInteger(n) || n < LIMITES_SECRETOS.rotacionKmsMin) {
      throw errorAws('ValidationException', `1 validation error detected: Value '${dias}' at 'rotationPeriodInDays' failed to satisfy constraint: Member must have value greater than or equal to 90`);
    }
    if (n > LIMITES_SECRETOS.rotacionKmsMax) {
      throw errorAws('ValidationException', `1 validation error detected: Value '${dias}' at 'rotationPeriodInDays' failed to satisfy constraint: Member must have value less than or equal to 2560`);
    }
    k.rotacion = { activa: true, dias: n, siguiente: iso(reloj.ahora() + n * DIA) };
    anotar(estado, 'KMS', 'EnableKeyRotation', `${k.arn} cada ${n} días`);
  } else {
    k.rotacion = { activa: false, dias: k.rotacion?.dias ?? 365, siguiente: null };
    anotar(estado, 'KMS', 'DisableKeyRotation', k.arn);
  }
  return k;
}

/** «Rotate now» (rotación bajo demanda, máximo 10 por llave). */
export function rotarLlaveKmsAhora(estado, ref) {
  iniciar(estado);
  const k = llaveOError(estado, ref);
  soloCliente(k);
  if (!rotable(k)) throw errorAws('UnsupportedOperationException', `${k.arn} key rotation is not supported for this key spec (${k.spec}).`);
  if (k.estado !== 'Enabled') throw errorAws('KMSInvalidStateException', `${k.arn} is ${k.estado === 'PendingDeletion' ? 'pending deletion' : 'disabled'}.`);
  const hechas = k.rotaciones.filter((r) => r.tipo === 'ON_DEMAND').length;
  if (hechas >= LIMITES_SECRETOS.rotacionesBajoDemanda) {
    throw errorAws('LimitExceededException', `The on-demand rotations limit has been reached for the given keyId. No more on-demand rotations can be performed for this key: ${k.arn}`);
  }
  registrarRotacion(k, 'ON_DEMAND');
  anotar(estado, 'KMS', 'RotateKeyOnDemand', k.arn);
  return k;
}

function registrarRotacion(k, tipo, t = reloj.ahora()) {
  k.rotaciones.push({ t: iso(t), tipo });
  if (k.rotaciones.length > 20) k.rotaciones.splice(0, k.rotaciones.length - 20);
}

/** «Key policy» → Add/Remove de administradores y usuarios, y «Allow key administrators to delete this key». */
export function permisosLlaveKms(estado, ref, { administradores, usuarios, adminsBorran } = {}) {
  iniciar(estado);
  const k = llaveOError(estado, ref);
  soloCliente(k);
  noPendiente(k);
  if (administradores !== undefined) k.administradores = validarPrincipales(estado, administradores);
  if (usuarios !== undefined) k.usuarios = validarPrincipales(estado, usuarios);
  if (adminsBorran !== undefined) k.adminsBorran = Boolean(adminsBorran);
  anotar(estado, 'KMS', 'PutKeyPolicy', `${k.arn}: ${k.administradores.length} administradores, ${k.usuarios.length} usuarios`);
  return k;
}

/** «Tags» → Edit (reemplaza todas). */
export function etiquetasLlaveKms(estado, ref, etiquetas = []) {
  iniciar(estado);
  const k = llaveOError(estado, ref);
  soloCliente(k);
  noPendiente(k);
  k.etiquetas = limpiarEtiquetas(etiquetas);
  anotar(estado, 'KMS', 'TagResource', k.arn);
  return k;
}

const ACCIONES_ADMIN = ['kms:Create*', 'kms:Describe*', 'kms:Enable*', 'kms:List*', 'kms:Put*', 'kms:Update*', 'kms:Revoke*', 'kms:Disable*', 'kms:Get*', 'kms:Delete*', 'kms:TagResource', 'kms:UntagResource', 'kms:ScheduleKeyDeletion', 'kms:CancelKeyDeletion', 'kms:RotateKeyOnDemand'];

function accionesUso(k) {
  if (k.uso === 'GENERATE_VERIFY_MAC') return ['kms:GenerateMac', 'kms:VerifyMac', 'kms:DescribeKey'];
  if (k.uso === 'SIGN_VERIFY') return ['kms:DescribeKey', 'kms:GetPublicKey', 'kms:Sign', 'kms:Verify'];
  if (k.uso === 'KEY_AGREEMENT') return ['kms:DescribeKey', 'kms:GetPublicKey', 'kms:DeriveSharedSecret'];
  if (k.spec !== 'SYMMETRIC_DEFAULT') return ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:DescribeKey', 'kms:GetPublicKey'];
  return ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'];
}

/**
 * La key policy (JSON) que arma la consola con los administradores y usuarios
 * elegidos. `k` puede ser una llave o un borrador { spec, uso, administradores, usuarios, adminsBorran }.
 */
export function politicaLlaveKms(estado, k) {
  const cuenta = cuentaDe(estado);
  const raiz = { Sid: 'Enable IAM User Permissions', Effect: 'Allow', Principal: { AWS: `arn:aws:iam::${cuenta}:root` }, Action: 'kms:*', Resource: '*' };
  if (k.administradaPorAws) {
    const def = LLAVES_AWS.find((l) => l.servicio === k.servicioAws);
    const servicio = def?.servicio === 'ebs' ? 'ec2' : def?.servicio ?? 'kms';
    const politica = {
      Version: '2012-10-17',
      Id: `auto-${servicio}-1`,
      Statement: [
        {
          Sid: `Allow access through ${servicio.toUpperCase()} for all principals in the account that are authorized to use ${servicio.toUpperCase()}`,
          Effect: 'Allow',
          Principal: { AWS: '*' },
          Action: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:CreateGrant', 'kms:DescribeKey'],
          Resource: '*',
          Condition: { StringEquals: { 'kms:CallerAccount': cuenta, 'kms:ViaService': `${servicio}.us-east-1.amazonaws.com` } }
        },
        { Sid: 'Allow direct access to key metadata to the account', Effect: 'Allow', Principal: { AWS: `arn:aws:iam::${cuenta}:root` }, Action: ['kms:Describe*', 'kms:Get*', 'kms:List*', 'kms:RevokeGrant'], Resource: '*' }
      ]
    };
    return JSON.stringify(politica, null, 4);
  }
  const declaraciones = [raiz];
  const admins = k.administradores ?? [];
  const usuarios = k.usuarios ?? [];
  if (admins.length) {
    const acciones = k.adminsBorran === false ? ACCIONES_ADMIN.filter((a) => !['kms:ScheduleKeyDeletion', 'kms:CancelKeyDeletion'].includes(a)) : ACCIONES_ADMIN;
    declaraciones.push({ Sid: 'Allow access for Key Administrators', Effect: 'Allow', Principal: { AWS: admins.length === 1 ? admins[0] : admins }, Action: acciones, Resource: '*' });
  }
  if (usuarios.length) {
    const principal = { AWS: usuarios.length === 1 ? usuarios[0] : usuarios };
    declaraciones.push({ Sid: 'Allow use of the key', Effect: 'Allow', Principal: principal, Action: accionesUso(k), Resource: '*' });
    if (k.spec === 'SYMMETRIC_DEFAULT' || !k.spec) {
      declaraciones.push({ Sid: 'Allow attachment of persistent resources', Effect: 'Allow', Principal: principal, Action: ['kms:CreateGrant', 'kms:ListGrants', 'kms:RevokeGrant'], Resource: '*', Condition: { Bool: { 'kms:GrantIsForAWSResource': 'true' } } });
    }
  }
  return JSON.stringify({ Id: 'key-consolepolicy-3', Version: '2012-10-17', Statement: declaraciones }, null, 4);
}

/* ============================================================ Secrets Manager: buscar */

/** El secreto por su nombre o su ARN (completo o sin el sufijo de 6 caracteres). null si no existe. */
export function secretoDe(estado, ref) {
  const r = String(ref ?? '').trim();
  if (!r) return null;
  const lista = estado.secretos?.secretos ?? [];
  return lista.find((s) => s.nombre === r || s.arn === r) ?? lista.find((s) => r.startsWith('arn:') && s.arn.startsWith(`${r}-`)) ?? null;
}

function secretoOError(estado, ref) {
  const s = secretoDe(estado, ref);
  if (!s) throw errorAws('ResourceNotFoundException', "Secrets Manager can't find the specified secret.");
  return s;
}

function noBorrado(s) {
  if (s.borradoEn) throw errorAws('InvalidRequestException', "You can't perform this operation on the secret because it was marked for deletion.");
}

function noAdministrado(s, accion = 'modify') {
  if (s.administradoPor === 'rds') {
    throw errorAws('InvalidRequestException', `You can't ${accion} secret ${s.nombre} because it's managed by Amazon RDS. Use the Amazon RDS console or API to manage it.`);
  }
}

const NOMBRE_SECRETO = /^[A-Za-z0-9/_+=.@-]{1,512}$/;

/** La llave de KMS de un secreto: la de Secrets Manager por omisión o una propia, habilitada y simétrica. */
function llaveParaSecreto(estado, ref) {
  if (!ref || ref === 'aws/secretsmanager' || ref === 'alias/aws/secretsmanager') return llaveAwsKms(estado, 'secretsmanager').id;
  const k = llaveKmsDe(estado, ref);
  if (!k) throw errorAws('KMSInvalidStateException', `The KMS key ${ref} is not found or you don't have access to it.`);
  if (k.estado === 'PendingDeletion') throw errorAws('KMSInvalidStateException', `${k.arn} is pending deletion.`);
  if (k.estado !== 'Enabled') throw errorAws('KMSInvalidStateException', `${k.arn} is disabled.`);
  if (k.spec !== 'SYMMETRIC_DEFAULT' || k.uso !== 'ENCRYPT_DECRYPT') throw errorAws('InvalidParameterException', 'You must use a symmetric encryption KMS key to encrypt a secret.');
  return k.id;
}

/** El texto del secreto: un objeto se guarda como JSON; un texto se guarda tal cual. */
function textoValor(valor) {
  const t = typeof valor === 'string' ? valor : valor && typeof valor === 'object' ? JSON.stringify(valor) : '';
  if (!t) throw errorAws('InvalidParameterException', 'You must provide either SecretString or SecretBinary.');
  if (t.length > LIMITES_SECRETOS.valorMax) {
    throw errorAws('ValidationException', `El simulador acepta secretos de hasta ${LIMITES_SECRETOS.valorMax.toLocaleString('en-US')} caracteres (AWS permite 65,536 bytes).`);
  }
  return t;
}

/** Los pares llave/valor de un texto JSON de un nivel; null si no es un objeto JSON. */
export function paresDeSecreto(texto) {
  try {
    const o = JSON.parse(texto);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    return Object.entries(o).map(([llave, v]) => ({ llave, valor: typeof v === 'string' ? v : JSON.stringify(v) }));
  } catch {
    return null;
  }
}

/** { unidad: 'hours'|'days'|'weeks'|'months', cada: n } o 'rate(…)' → { expresion, cadaMs }. */
export function expresionRotacion(prog) {
  const MS = { hours: HORA, hour: HORA, days: DIA, day: DIA, weeks: 7 * DIA, week: 7 * DIA, months: 30 * DIA, month: 30 * DIA };
  let unidad;
  let cada;
  if (typeof prog === 'string') {
    const m = /^\s*rate\(\s*(\d+)\s+(hours?|days?|weeks?|months?)\s*\)\s*$/i.exec(prog);
    if (!m) throw errorAws('InvalidParameterException', `The schedule expression ${prog} is invalid. Use rate(n days), rate(n hours), rate(n weeks) or rate(n months).`);
    cada = Number(m[1]);
    unidad = m[2].toLowerCase();
  } else {
    cada = Number(prog?.cada);
    unidad = String(prog?.unidad ?? 'days').toLowerCase();
  }
  if (!Number.isInteger(cada) || cada < 1 || !MS[unidad]) throw errorAws('InvalidParameterException', `The schedule expression rate(${prog?.cada ?? ''} ${unidad}) is invalid.`);
  const cadaMs = cada * MS[unidad];
  if (cadaMs < LIMITES_SECRETOS.rotacionMinMs || cadaMs > LIMITES_SECRETOS.rotacionMaxMs) {
    throw errorAws('InvalidParameterException', 'The rotation schedule must be between 4 hours and 1000 days.');
  }
  const plural = unidad.endsWith('s') ? unidad : `${unidad}s`;
  return { expresion: `rate(${cada} ${cada === 1 ? plural.slice(0, -1) : plural})`, cadaMs };
}

/** La función de Lambda de rotación (por nombre o ARN); lanza el error de AWS si no existe. */
function lambdaRotacion(estado, ref) {
  const r = String(ref ?? '').trim();
  if (!r) throw errorAws('InvalidParameterException', 'You must specify a Lambda rotation function to turn on automatic rotation.');
  const fn = (estado.lambda?.funciones ?? []).find((f) => f.nombre === r || f.arn === r || (f.arn && r.startsWith(`${f.arn}:`)));
  if (!fn) throw errorAws('ResourceNotFoundException', `Secrets Manager can't find the specified Lambda function: ${r}`);
  return fn.arn ?? `arn:aws:lambda:us-east-1:${cuentaDe(estado)}:function:${fn.nombre}`;
}

/* ============================================================ Secrets Manager: acciones */

/**
 * «Store a new secret». p = {
 *   nombre, descripcion, tipo: 'rds'|'otra-base'|'otro', llaveKms (id/alias/ARN o null = aws/secretsmanager),
 *   valor (tipo 'otro': objeto de pares o texto plano),
 *   usuario, contrasena, baseId (tipo 'rds'),
 *   usuario, contrasena, motor, servidor, nombreBase, puerto (tipo 'otra-base'),
 *   rotacion: null | { activa, unidad, cada | expresion, lambda, inmediata }, etiquetas
 * }
 */
export function crearSecreto(estado, p = {}) {
  iniciar(estado);
  const nombre = String(p.nombre ?? '').trim();
  if (!nombre) throw errorAws('InvalidParameterException', 'You must provide a name for the secret.');
  if (!NOMBRE_SECRETO.test(nombre)) {
    throw errorAws('ValidationException', 'Invalid name. Must be a valid name containing alphanumeric characters, or any of the following: -/_+=.@!');
  }
  const ya = estado.secretos.secretos.find((s) => s.nombre === nombre);
  if (ya?.borradoEn) throw errorAws('InvalidRequestException', "You can't create this secret because a secret with this name is already scheduled for deletion.");
  if (ya) throw errorAws('ResourceExistsException', `The operation failed because the secret ${nombre} already exists.`);
  if (estado.secretos.secretos.filter((s) => !s.administradoPor).length >= LIMITES_SECRETOS.secretosMax) {
    throw errorAws('LimitExceededException', `El simulador admite hasta ${LIMITES_SECRETOS.secretosMax} secretos. Borra los que ya no uses.`);
  }
  const tipo = ['rds', 'otra-base', 'otro'].includes(p.tipo) ? p.tipo : 'otro';
  let valor;
  let base = null;
  if (tipo === 'rds' || tipo === 'otra-base') {
    const usuario = String(p.usuario ?? '').trim();
    const contrasena = String(p.contrasena ?? '');
    if (!usuario) throw errorAws('InvalidParameterException', 'User name is required.');
    if (!contrasena) throw errorAws('InvalidParameterException', 'Password is required.');
    if (tipo === 'rds') {
      if (!p.baseId) throw errorAws('InvalidParameterException', 'Choose the database that this secret will access.');
      const b = llamar('baseRdsDe', estado, p.baseId);
      if (b === null) throw errorAws('ResourceNotFoundException', `The database ${p.baseId} doesn't exist.`);
      base = { id: b?.id ?? String(p.baseId), motor: b?.motor ?? null, host: b?.endpoint ?? null, puerto: b?.puerto ?? null };
      valor = { username: usuario, password: contrasena, engine: base.motor, host: base.host, port: base.puerto, dbInstanceIdentifier: base.id };
      if (b?.miembros) valor = { username: usuario, password: contrasena, engine: base.motor, host: base.host, port: base.puerto, dbClusterIdentifier: base.id };
    } else {
      const m = MOTORES_OTRA_BASE.find((x) => x.motor === p.motor) ?? MOTORES_OTRA_BASE[1];
      const servidor = String(p.servidor ?? '').trim();
      if (!servidor) throw errorAws('InvalidParameterException', 'Server address is required.');
      const puerto = Number(p.puerto || m.puerto);
      if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) throw errorAws('InvalidParameterException', 'Port must be a number between 1 and 65535.');
      base = { id: null, motor: m.motor, host: servidor, puerto };
      valor = { engine: m.motor, host: servidor, username: usuario, password: contrasena, dbname: String(p.nombreBase ?? '').trim() || undefined, port: String(puerto) };
    }
  } else {
    valor = p.valor;
  }
  const texto = textoValor(valor);
  const llaveKms = llaveParaSecreto(estado, p.llaveKms);
  const ahora = reloj.ahora();
  const s = {
    nombre,
    arn: `arn:aws:secretsmanager:us-east-1:${cuentaDe(estado)}:secret:${nombre}-${azarDe(ALFANUM, 6)}`,
    tipo,
    descripcion: nombreLimpio(p.descripcion, 2048),
    llaveKms,
    valor: texto,
    versiones: [{ id: uuid(), etapas: ['AWSCURRENT'], creado: iso(ahora), valor: texto }],
    base,
    rotacion: { activa: false, expresion: null, cadaMs: null, lambdaArn: null, inmediata: true, ultima: null, siguiente: null },
    administradoPor: null,
    recurso: null,
    borradoEn: null,
    diasRecuperacion: null,
    ultimoAcceso: null,
    modificado: iso(ahora),
    creado: iso(ahora),
    etiquetas: limpiarEtiquetas(p.etiquetas)
  };
  // La rotación se valida antes de guardar: si falla, no queda nada a medias.
  const rot = p.rotacion?.activa ? prepararRotacion(estado, p.rotacion) : null;
  estado.secretos.secretos.push(s);
  anotar(estado, 'SecretsManager', 'CreateSecret', `${s.arn} (${tipo})`);
  if (rot) aplicarRotacion(estado, s, rot);
  return s;
}

function prepararRotacion(estado, r) {
  const { expresion, cadaMs } = expresionRotacion(r.expresion ?? { unidad: r.unidad ?? 'days', cada: r.cada ?? 30 });
  const lambdaArn = lambdaRotacion(estado, r.lambda);
  return { expresion, cadaMs, lambdaArn, inmediata: r.inmediata !== false };
}

function aplicarRotacion(estado, s, rot) {
  const ahora = reloj.ahora();
  s.rotacion = { activa: true, expresion: rot.expresion, cadaMs: rot.cadaMs, lambdaArn: rot.lambdaArn, inmediata: rot.inmediata, ultima: s.rotacion?.ultima ?? null, siguiente: iso(ahora + rot.cadaMs) };
  anotar(estado, 'SecretsManager', 'RotateSecret', `${s.nombre}: ${rot.expresion} con ${rot.lambdaArn}`);
  if (rot.inmediata) rotar(estado, s, 'console');
}

/**
 * «Retrieve secret value» (GetSecretValue). Devuelve { valor, pares, versionId, etapas }
 * y anota la fecha de último acceso. Falla si la llave de KMS ya no sirve.
 */
export function obtenerValorSecreto(estado, ref, { etapa = 'AWSCURRENT' } = {}) {
  iniciar(estado);
  const s = secretoOError(estado, ref);
  noBorrado(s);
  if (!usoLlaveKms(estado, s.llaveKms).ok) throw errorAws('DecryptionFailure', `Secrets Manager can't decrypt the protected secret text using the provided KMS key. ${problemaLlaveKms(estado, s.llaveKms)}`);
  const v = s.versiones.find((x) => x.etapas.includes(etapa));
  if (!v) throw errorAws('ResourceNotFoundException', `Secrets Manager can't find the specified secret value for staging label: ${etapa}`);
  s.ultimoAcceso = iso();
  anotar(estado, 'SecretsManager', 'GetSecretValue', s.arn);
  return { valor: v.valor, pares: paresDeSecreto(v.valor), versionId: v.id, etapas: [...v.etapas] };
}

/** Una versión nueva AWSCURRENT con `texto`; la vigente pasa a AWSPREVIOUS y las demás se van. */
function nuevaVersion(s, texto, t = reloj.ahora()) {
  const actual = s.versiones.find((v) => v.etapas.includes('AWSCURRENT'));
  const nueva = { id: uuid(), etapas: ['AWSCURRENT'], creado: iso(t), valor: texto };
  s.versiones = actual ? [nueva, { ...actual, etapas: ['AWSPREVIOUS'] }] : [nueva];
  s.valor = texto;
  s.modificado = iso(t);
  return nueva;
}

/** «Edit» del valor (PutSecretValue). */
export function editarValorSecreto(estado, ref, valor) {
  iniciar(estado);
  const s = secretoOError(estado, ref);
  noBorrado(s);
  noAdministrado(s);
  if (!usoLlaveKms(estado, s.llaveKms).ok) throw errorAws('EncryptionFailure', `Secrets Manager can't encrypt the protected secret text using the provided KMS key. ${problemaLlaveKms(estado, s.llaveKms)}`);
  const v = nuevaVersion(s, textoValor(valor));
  anotar(estado, 'SecretsManager', 'PutSecretValue', `${s.arn} versión ${v.id}`);
  return s;
}

/** «Edit description» / «Edit encryption key» (UpdateSecret). */
export function editarSecreto(estado, ref, { descripcion, llaveKms } = {}) {
  iniciar(estado);
  const s = secretoOError(estado, ref);
  noBorrado(s);
  noAdministrado(s);
  if (descripcion !== undefined) s.descripcion = nombreLimpio(descripcion, 2048);
  if (llaveKms !== undefined) s.llaveKms = llaveParaSecreto(estado, llaveKms);
  s.modificado = iso();
  anotar(estado, 'SecretsManager', 'UpdateSecret', s.arn);
  return s;
}

/** «Edit rotation»: { activa, unidad, cada | expresion, lambda, inmediata }. */
export function configurarRotacionSecreto(estado, ref, r = {}) {
  iniciar(estado);
  const s = secretoOError(estado, ref);
  noBorrado(s);
  noAdministrado(s);
  if (!r.activa) {
    s.rotacion = { ...s.rotacion, activa: false, siguiente: null };
    anotar(estado, 'SecretsManager', 'CancelRotateSecret', s.arn);
    return s;
  }
  aplicarRotacion(estado, s, prepararRotacion(estado, r));
  return s;
}

/** «Rotate secret immediately» (RotateSecret sin cambiar el calendario). */
export function rotarSecretoAhora(estado, ref) {
  iniciar(estado);
  const s = secretoOError(estado, ref);
  noBorrado(s);
  if (s.administradoPor !== 'rds' && !s.rotacion?.lambdaArn) throw errorAws('InvalidRequestException', 'No Lambda rotation function ARN is associated with this secret.');
  if (s.administradoPor !== 'rds' && !(estado.lambda?.funciones ?? []).some((f) => f.arn === s.rotacion.lambdaArn)) {
    throw errorAws('ResourceNotFoundException', `Secrets Manager can't find the specified Lambda function: ${s.rotacion.lambdaArn}`);
  }
  rotar(estado, s, 'console');
  return s;
}

/**
 * Rota: invoca la Lambda (si existe) con los pasos createSecret…finishSecret,
 * cambia `password` por una nueva al azar y deja la versión anterior en AWSPREVIOUS.
 */
function rotar(estado, s, origen, t = reloj.ahora()) {
  const anterior = s.versiones.find((v) => v.etapas.includes('AWSCURRENT'));
  const pares = paresDeSecreto(anterior?.valor ?? s.valor);
  let texto = anterior?.valor ?? s.valor;
  if (pares) {
    const o = JSON.parse(texto);
    if (typeof o.password === 'string') o.password = contrasenaAzar(s.administradoPor === 'rds' ? 28 : 32);
    texto = JSON.stringify(o);
  }
  const v = nuevaVersion(s, texto, t);
  if (s.rotacion?.lambdaArn) {
    try {
      for (const paso of ['createSecret', 'setSecret', 'testSecret', 'finishSecret']) {
        llamar('invocarLambda', estado, s.rotacion.lambdaArn, { SecretId: s.arn, ClientRequestToken: v.id, Step: paso }, { origen: 'secretsmanager' });
      }
    } catch {
      /* si la Lambda falla, el secreto igual rota en el simulador */
    }
  }
  s.rotacion = { ...s.rotacion, ultima: iso(t), siguiente: s.rotacion?.activa && s.rotacion.cadaMs ? iso(t + s.rotacion.cadaMs) : null };
  anotar(estado, 'SecretsManager', 'RotationSucceeded', `${s.nombre} (${origen}) versión ${v.id}`);
}

/** «Delete secret»: queda programado para borrarse en `dias` (7 a 30) y se puede cancelar. */
export function eliminarSecreto(estado, ref, { dias = 30 } = {}) {
  iniciar(estado);
  const s = secretoOError(estado, ref);
  noAdministrado(s, 'delete');
  if (s.borradoEn) throw errorAws('InvalidRequestException', "You can't perform this operation on the secret because it was marked for deletion.");
  const n = Number(dias);
  if (!Number.isInteger(n) || n < LIMITES_SECRETOS.recuperacionMin || n > LIMITES_SECRETOS.recuperacionMax) {
    throw errorAws('InvalidParameterException', 'The RecoveryWindowInDays value must be between 7 and 30 days (inclusive).');
  }
  s.borradoEn = iso(reloj.ahora() + n * DIA);
  s.diasRecuperacion = n;
  anotar(estado, 'SecretsManager', 'DeleteSecret', `${s.arn} en ${n} días`);
  return s;
}

/** «Cancel deletion» (RestoreSecret). */
export function restaurarSecreto(estado, ref) {
  iniciar(estado);
  const s = secretoOError(estado, ref);
  if (!s.borradoEn) throw errorAws('InvalidRequestException', 'The secret is not scheduled for deletion.');
  s.borradoEn = null;
  s.diasRecuperacion = null;
  anotar(estado, 'SecretsManager', 'RestoreSecret', s.arn);
  return s;
}

/** «Tags» → Edit tags (reemplaza todas). */
export function etiquetasSecreto(estado, ref, etiquetas = []) {
  iniciar(estado);
  const s = secretoOError(estado, ref);
  noBorrado(s);
  s.etiquetas = [...s.etiquetas.filter((t) => t.llave.startsWith('aws:')), ...limpiarEtiquetas(etiquetas).filter((t) => !t.llave.startsWith('aws:'))];
  anotar(estado, 'SecretsManager', 'TagResource', s.arn);
  return s;
}

/* ============================================================ el tiempo */

/** Los secretos rds!… de las bases con «Managed in AWS Secrets Manager». */
function sincronizarSecretosRds(estado, ahora) {
  let cambio = false;
  const bases = [
    ...(estado.rds?.instancias ?? []).filter((i) => !i.clusterId && i.rol !== 'replica' && i.rol !== 'reader').map((b) => ({ b, cluster: false })),
    ...(estado.rds?.clusteres ?? []).map((b) => ({ b, cluster: true }))
  ].filter(({ b }) => b.credenciales === 'secrets' && b.estado !== 'deleted' && b.arn);
  const vivos = new Set(bases.map(({ b }) => b.arn));
  const antes = estado.secretos.secretos.length;
  estado.secretos.secretos = estado.secretos.secretos.filter((s) => s.administradoPor !== 'rds' || vivos.has(s.recurso));
  if (estado.secretos.secretos.length !== antes) cambio = true;
  for (const { b, cluster } of bases) {
    if (estado.secretos.secretos.some((s) => s.recurso === b.arn)) continue;
    const nombre = `rds!${cluster ? 'cluster' : 'db'}-${uuid()}`;
    const texto = JSON.stringify({ username: b.usuario ?? 'admin', password: contrasenaAzar(28) });
    // La llave que se eligió en RDS («Select the encryption key»); si no, aws/secretsmanager.
    const llaveId = (b.credencialesLlaveKms && llaveKmsDe(estado, b.credencialesLlaveKms)?.id) || llaveAwsKms(estado, 'secretsmanager').id;
    estado.secretos.secretos.push({
      nombre,
      arn: `arn:aws:secretsmanager:us-east-1:${cuentaDe(estado)}:secret:${nombre}-${azarDe(ALFANUM, 6)}`,
      tipo: 'rds',
      descripcion: `Secret associated with primary RDS DB ${cluster ? 'cluster' : 'instance'}: ${b.arn}`,
      llaveKms: llaveId,
      valor: texto,
      versiones: [{ id: uuid(), etapas: ['AWSCURRENT'], creado: iso(ahora), valor: texto }],
      base: { id: b.id, motor: b.motor ?? null, host: b.endpoint ?? null, puerto: b.puerto ?? null },
      rotacion: { activa: true, expresion: 'rate(7 days)', cadaMs: 7 * DIA, lambdaArn: null, inmediata: false, ultima: null, siguiente: iso(ahora + 7 * DIA) },
      administradoPor: 'rds',
      recurso: b.arn,
      borradoEn: null,
      diasRecuperacion: null,
      ultimoAcceso: null,
      modificado: iso(ahora),
      creado: iso(ahora),
      etiquetas: [{ llave: cluster ? 'aws:rds:primaryDBClusterArn' : 'aws:rds:primaryDBInstanceArn', valor: b.arn }]
    });
    cambio = true;
  }
  return cambio;
}

function avanzarSecretos(estado, ahora) {
  iniciar(estado);
  let cambio = false;

  // Lo que ya cumplió su ventana de borrado desaparece para siempre.
  const nSecretos = estado.secretos.secretos.length;
  estado.secretos.secretos = estado.secretos.secretos.filter((s) => !s.borradoEn || Date.parse(s.borradoEn) > ahora);
  const nLlaves = estado.kms.llaves.length;
  estado.kms.llaves = estado.kms.llaves.filter((k) => !k.borrado || Date.parse(k.borrado.fecha) > ahora);
  if (estado.secretos.secretos.length !== nSecretos || estado.kms.llaves.length !== nLlaves) cambio = true;

  // Las AWS managed keys que AWS ya habría creado por lo que existe en la cuenta.
  for (const [servicio, usa] of Object.entries(USOS_LLAVES_AWS)) {
    const def = LLAVES_AWS.find((l) => l.servicio === servicio);
    if (estado.kms.llaves.some((k) => k.administradaPorAws && k.aliases?.includes(def.alias))) continue;
    if (usa(estado)) {
      llaveAwsKms(estado, servicio);
      cambio = true;
    }
  }

  if (sincronizarSecretosRds(estado, ahora)) cambio = true;

  // Rotaciones automáticas que ya tocaban (en días reales).
  for (const s of estado.secretos.secretos) {
    if (!s.rotacion?.activa || !s.rotacion.siguiente || s.borradoEn || Date.parse(s.rotacion.siguiente) > ahora) continue;
    rotar(estado, s, 'scheduled', ahora);
    cambio = true;
  }
  for (const k of estado.kms.llaves) {
    if (!k.rotacion?.activa || !k.rotacion.siguiente || k.estado !== 'Enabled' || Date.parse(k.rotacion.siguiente) > ahora) continue;
    registrarRotacion(k, 'AUTOMATIC', ahora);
    k.rotacion.siguiente = iso(ahora + k.rotacion.dias * DIA);
    cambio = true;
  }
  return cambio;
}

registrarExtension({
  id: 'secretos',
  orden: 65,
  iniciar,
  avanzar: avanzarSecretos,
  funciones: {
    llaveKmsDe,
    llaveAwsKms,
    usoLlaveKms,
    problemaLlaveKms,
    secretoDe
  }
});
