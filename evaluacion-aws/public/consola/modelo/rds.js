// ---------------------------------------------------------------------------
// AURORA AND RDS · ELASTICACHE
//
// Las bases de datos administradas de la cuenta simulada: instancias de RDS
// (MySQL, PostgreSQL, MariaDB), clústeres (Aurora y Multi-AZ DB cluster),
// réplicas de lectura, snapshots manuales y automáticos, restauración a un
// punto en el tiempo, DB subnet groups y las cachés de ElastiCache.
//
// Igual que AWS, nada es instantáneo: una base pasa por creating → backing-up
// → available (25 s + 5 s en el simulador), una réplica tarda 25 s, un
// snapshot manual 10 s y un Modify 10 s (ver DURACION_RDS). avanzar() resuelve
// las transiciones con el reloj del modelo.
//
// NO se guardan contraseñas: la acción valida la contraseña igual que AWS y
// solo deja `contrasenaDefinida: true`.
//
// La forma de las colecciones (campos en español; valores de AWS tal cual):
//
// estado.rds = {
//   instancias: [{
//     id, arn, recursoId: 'db-…', motor: 'mysql'|'postgres'|'mariadb'|'aurora-mysql'|'aurora-postgresql',
//     version, clase: 'db.t3.micro'…, plantilla: 'production'|'devtest'|'freetier',
//     despliegue: 'single'|'multiaz'|'cluster',          // cluster = miembro de un clúster
//     multiAz, zona, zonaSecundaria | null, subredId, subredSecundaria | null, ipPrivada, ipPublica | null,
//     almacenamiento: { tipo: 'gp3'|'gp2'|'io2'|'aurora', gib, iops, autoescalado, maximo },
//     vpcId, grupoSubredes (nombre), publica, gruposSeguridad: [sgId], puerto,
//     usuario, contrasenaDefinida: true, credenciales: 'self'|'secrets', nombreBase | null,
//     retencion (0-35 días), ventanaRespaldo, copiarEtiquetas, cifrada, llaveKms ('aws/rds' | id de una llave propia | null), protegida,
//     credencialesLlaveKms (con credenciales 'secrets': id de una llave propia para el secreto, o null = aws/secretsmanager),
//     actualizacionMenor, ventanaMantenimiento, endpoint, estado, hasta?, siguiente?, tras?,
//     pendientes: { clase?, gib?, multiAz?, … } | null,   // «Apply during the next scheduled maintenance window»
//     rol: 'instance'|'primary'|'replica'|'writer'|'reader', fuente | null, replicas: [id],
//     clusterId | null, conexionesEc2: [instanciaId], etiquetas: [{ llave, valor }],
//     creado, primerRespaldo | null
//   }],
//   clusteres: [{
//     id, arn, recursoId: 'cluster-…', tipo: 'aurora'|'multiaz', motor, version, miembros: [instanciaId],
//     endpoint, endpointLectura, puerto, vpcId, grupoSubredes, gruposSeguridad, publica,
//     usuario, contrasenaDefinida, retencion, cifrada, protegida, almacenamiento: { tipo, gib },
//     serverless: { min, max } | null, expres, estado, hasta?, siguiente?, tras?, creado, primerRespaldo
//   }],
//   snapshots: [{
//     id, arn, instanciaId | null, clusterId | null, tipo: 'manual'|'automated', motor, version, gib,
//     zona, vpcId, puerto, cifrado, publico, retenido, estado: 'creating'|'available', progreso,
//     desde?, hasta?, creado
//   }],
//   gruposSubredes: [{ nombre, arn, descripcion, vpcId, subredes: [subredId], creado }],
//   eventos: [{ t, fuente, tipo: 'db-instance'|'db-cluster'|'db-snapshot'|'db-subnet-group', mensaje }]   // máx. 60
// }
//
// estado.elasticache = {
//   caches: [{
//     nombre, arn, motor: 'valkey'|'redis'|'memcached', version, despliegue: 'serverless'|'propio',
//     descripcion, vpcId, subredes: [subredId], gruposSeguridad: [sgId],
//     limites: { datosGb, ecpu } | null, tipoNodo | null, nodos, replicas, multiAz,
//     retencionRespaldo, endpoint, endpointLectura | null, puerto, estado, hasta?, siguiente?, creado
//   }]
// }
//
// Regla del ciclo de módulos: nada de lo importado de modelo.js se usa en el
// nivel superior de este archivo, solo dentro de funciones.
// ---------------------------------------------------------------------------

import { registrarExtension, llamar } from './registro.js';
import {
  anotar,
  errorAws,
  grupoDe,
  hexAzar,
  igwDeVpc,
  instanciaDe,
  ipEnCidr,
  ipPrivadaNueva,
  ipPublicaNueva,
  iso,
  naclDeSubred,
  nombreLimpio,
  reloj,
  subredDe,
  vpcDe,
  crearGrupoSeguridad,
  cambiarGruposInstancia,
  aleatorio
} from '../modelo.js';

/* ============================================================ tiempos */

/** Cuánto tarda cada transición de RDS y ElastiCache (ms). Tiempo comprimido: ver SIMULADOR.md §3. */
export const DURACION_RDS = {
  crear: 25000,
  respaldoInicial: 5000,
  replica: 25000,
  snapshot: 10000,
  modificar: 10000,
  reiniciar: 6000,
  detener: 8000,
  arrancar: 10000,
  borrar: 8000,
  cacheCrear: 20000,
  cacheBorrar: 8000
};

/* ============================================================ catálogos */

/** Los motores que ofrece «Create database». Los tres últimos se ven, pero desactivados. */
export const MOTORES_RDS = [
  { motor: 'aurora-mysql', nombre: 'Aurora (MySQL Compatible)', corto: 'Aurora MySQL', puerto: 3306, aurora: true, usuario: 'admin', versiones: ['8.0.mysql_aurora.3.10.1', '8.0.mysql_aurora.3.09.0', '8.0.mysql_aurora.3.08.2'] },
  { motor: 'aurora-postgresql', nombre: 'Aurora (PostgreSQL Compatible)', corto: 'Aurora PostgreSQL', puerto: 5432, aurora: true, usuario: 'postgres', versiones: ['17.5', '16.9', '15.13'] },
  { motor: 'mysql', nombre: 'MySQL', corto: 'MySQL Community', puerto: 3306, usuario: 'admin', versiones: ['8.0.43', '8.0.42', '8.4.6'] },
  { motor: 'mariadb', nombre: 'MariaDB', corto: 'MariaDB', puerto: 3306, usuario: 'admin', versiones: ['11.4.8', '10.11.14', '10.6.23'] },
  { motor: 'postgres', nombre: 'PostgreSQL', corto: 'PostgreSQL', puerto: 5432, usuario: 'postgres', versiones: ['17.6', '16.10', '15.14'] },
  { motor: 'oracle-ee', nombre: 'Oracle', corto: 'Oracle', puerto: 1521, usuario: 'admin', versiones: [], desactivado: true },
  { motor: 'sqlserver-ex', nombre: 'Microsoft SQL Server', corto: 'SQL Server', puerto: 1433, usuario: 'admin', versiones: [], desactivado: true },
  { motor: 'db2-se', nombre: 'IBM Db2', corto: 'Db2', puerto: 50000, usuario: 'admin', versiones: [], desactivado: true }
];
export const motorRds = (m) => MOTORES_RDS.find((x) => x.motor === m) ?? null;
export const esAurora = (m) => String(m).startsWith('aurora');

/**
 * Las clases de instancia. familia: standard | memory | burstable | serverless.
 * precio: On-Demand por hora en us-east-1 (MySQL, Single-AZ); Multi-AZ cuesta el doble.
 * donde: para qué despliegues sirve ('instancia', 'cluster' = Multi-AZ DB cluster, 'aurora').
 */
export const CLASES_RDS = [
  { clase: 'db.t3.micro', familia: 'burstable', vcpu: 2, memoria: 1, precio: 0.017, capaGratuita: true, donde: ['instancia'] },
  { clase: 'db.t4g.micro', familia: 'burstable', vcpu: 2, memoria: 1, precio: 0.016, capaGratuita: true, donde: ['instancia'] },
  { clase: 'db.t3.small', familia: 'burstable', vcpu: 2, memoria: 2, precio: 0.034, donde: ['instancia'] },
  { clase: 'db.t4g.small', familia: 'burstable', vcpu: 2, memoria: 2, precio: 0.032, donde: ['instancia'] },
  { clase: 'db.t3.medium', familia: 'burstable', vcpu: 2, memoria: 4, precio: 0.068, donde: ['instancia', 'aurora'] },
  { clase: 'db.t4g.medium', familia: 'burstable', vcpu: 2, memoria: 4, precio: 0.065, donde: ['instancia', 'aurora'] },
  { clase: 'db.m5.large', familia: 'standard', vcpu: 2, memoria: 8, precio: 0.171, donde: ['instancia'] },
  { clase: 'db.m6g.large', familia: 'standard', vcpu: 2, memoria: 8, precio: 0.152, donde: ['instancia'] },
  { clase: 'db.m7g.large', familia: 'standard', vcpu: 2, memoria: 8, precio: 0.168, donde: ['instancia'] },
  { clase: 'db.m5d.large', familia: 'standard', vcpu: 2, memoria: 8, precio: 0.226, donde: ['cluster'] },
  { clase: 'db.m6gd.large', familia: 'standard', vcpu: 2, memoria: 8, precio: 0.198, donde: ['cluster'] },
  { clase: 'db.r5.large', familia: 'memory', vcpu: 2, memoria: 16, precio: 0.25, donde: ['instancia'] },
  { clase: 'db.r6g.large', familia: 'memory', vcpu: 2, memoria: 16, precio: 0.225, donde: ['instancia', 'aurora'] },
  { clase: 'db.r7g.large', familia: 'memory', vcpu: 2, memoria: 16, precio: 0.239, donde: ['instancia', 'aurora'] },
  { clase: 'db.r6gd.large', familia: 'memory', vcpu: 2, memoria: 16, precio: 0.288, donde: ['cluster'] },
  { clase: 'db.serverless', familia: 'serverless', vcpu: null, memoria: null, precio: 0.12, donde: ['aurora'] }
];
export const claseRds = (c) => CLASES_RDS.find((x) => x.clase === c) ?? null;

/** Precio por GiB-mes del almacenamiento (us-east-1). */
const PRECIO_GIB = { gp2: 0.115, gp3: 0.115, io2: 0.125, aurora: 0.1 };

const CLASES_CACHE = [
  { tipo: 'cache.t3.micro', memoria: 0.5, precio: 0.017 },
  { tipo: 'cache.t4g.micro', memoria: 0.5, precio: 0.016 },
  { tipo: 'cache.t4g.small', memoria: 1.37, precio: 0.032 },
  { tipo: 'cache.m7g.large', memoria: 6.38, precio: 0.158 },
  { tipo: 'cache.r7g.large', memoria: 13.07, precio: 0.219 }
];
export const TIPOS_NODO_CACHE = CLASES_CACHE;

export const MOTORES_CACHE = [
  { motor: 'valkey', nombre: 'Valkey', puerto: 6379, versiones: ['8.1', '8.0', '7.2'] },
  { motor: 'memcached', nombre: 'Memcached', puerto: 11211, versiones: ['1.6.22', '1.6.17'] },
  { motor: 'redis', nombre: 'Redis OSS', puerto: 6379, versiones: ['7.1', '7.0', '6.2'] }
];
export const motorCache = (m) => MOTORES_CACHE.find((x) => x.motor === m) ?? null;

/* ============================================================ ayudas internas */

function iniciar(estado) {
  estado.rds ??= { instancias: [], snapshots: [], gruposSubredes: [] };
  estado.rds.instancias ??= [];
  estado.rds.snapshots ??= [];
  estado.rds.gruposSubredes ??= [];
  estado.rds.clusteres ??= [];
  estado.rds.eventos ??= [];
  estado.elasticache ??= { caches: [] };
  estado.elasticache.caches ??= [];
}

const IDENTIFICADOR = /^[a-z](?!.*--)[a-z0-9-]{0,62}$/;

/** Los identificadores de RDS: letra al inicio, letras, dígitos y guiones, sin «--» ni guion al final. Se guardan en minúsculas. */
function validarIdentificador(texto, parametro) {
  const id = String(texto ?? '').trim().toLowerCase();
  if (!id) throw errorAws('MissingParameter', `The request must contain the parameter ${parametro}.`);
  if (!IDENTIFICADOR.test(id) || id.endsWith('-')) {
    throw errorAws('InvalidParameterValue', `The parameter ${parametro} is not a valid identifier. Identifiers must begin with a letter; must contain only ASCII letters, digits, and hyphens; and must not end with a hyphen or contain two consecutive hyphens.`);
  }
  return id;
}

/** La contraseña se revisa igual que AWS y luego se olvida. */
function validarContrasena(contrasena, motor) {
  const c = String(contrasena ?? '');
  const max = motor === 'postgres' || motor === 'aurora-postgresql' ? 128 : 41;
  if (!c) throw errorAws('MissingParameter', 'The request must contain the parameter MasterUserPassword.');
  if (c.length < 8) throw errorAws('InvalidParameterValue', 'The parameter MasterUserPassword is not a valid password because it is shorter than 8 characters.');
  if (c.length > max) throw errorAws('InvalidParameterValue', `The parameter MasterUserPassword is not a valid password because it is longer than ${max} characters.`);
  if (!/^[\x21-\x7e]+$/.test(c) || /[/@"]/.test(c)) {
    throw errorAws('InvalidParameterValue', "The parameter MasterUserPassword is not a valid password. Only printable ASCII characters besides '/', '@', '\"', ' ' may be used.");
  }
}

function validarUsuario(usuario) {
  const u = String(usuario ?? '').trim();
  if (!/^[A-Za-z][A-Za-z0-9_]{0,15}$/.test(u)) {
    throw errorAws('InvalidParameterValue', 'MasterUsername must start with a letter and contain 1 to 16 alphanumeric characters.');
  }
  if (['rdsadmin', 'rdsrepladmin'].includes(u.toLowerCase())) throw errorAws('InvalidParameterValue', `MasterUsername ${u} cannot be used as it is a reserved word used by the engine`);
  return u;
}

/** El «hash» del endpoint es fijo por cuenta y región, como en AWS (mydb.c9akciq32xyz.us-east-1.rds.amazonaws.com). */
function hashCuenta(estado) {
  let h = 2166136261;
  for (const ch of `${estado.cuenta?.id ?? '123456789012'}-rds`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  let s = '';
  for (let i = 0; i < 12; i++) {
    h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0;
    s += 'abcdefghijklmnopqrstuvwxyz0123456789'[h % 36];
  }
  return s.replace(/^[0-9]/, 'c');
}

const arnRds = (estado, tipo, id) => `arn:aws:rds:us-east-1:${estado.cuenta.id}:${tipo}:${id}`;
const recursoIdNuevo = (prefijo) => `${prefijo}-${Array.from({ length: 26 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[Math.floor(aleatorio() * 32)]).join('')}`;

function evento(estado, fuente, tipo, mensaje) {
  estado.rds.eventos.push({ t: iso(), fuente, tipo, mensaje });
  if (estado.rds.eventos.length > 60) estado.rds.eventos.splice(0, estado.rds.eventos.length - 60);
}

/** Pone un recurso en un estado de transición: dentro de `ms` pasa a `siguiente` y corre el paso `tras`. */
function programar(r, estadoTexto, ms, siguiente, tras = null, desde = reloj.ahora()) {
  r.estado = estadoTexto;
  r.desde = desde;
  r.hasta = desde + ms;
  r.siguiente = siguiente;
  if (tras) r.tras = tras;
  else delete r.tras;
}

function terminarTransicion(r) {
  delete r.hasta;
  delete r.siguiente;
  delete r.tras;
  delete r.desde;
}

export const instanciaRdsDe = (estado, id) => estado.rds?.instancias.find((i) => i.id === String(id ?? '').toLowerCase()) ?? null;
export const clusterRdsDe = (estado, id) => estado.rds?.clusteres?.find((c) => c.id === String(id ?? '').toLowerCase()) ?? null;
export const snapshotRdsDe = (estado, id) => estado.rds?.snapshots.find((s) => s.id === id) ?? null;
export const grupoSubredesRdsDe = (estado, nombre) => estado.rds?.gruposSubredes.find((g) => g.nombre === String(nombre ?? '').toLowerCase()) ?? null;
export const cacheDe = (estado, nombre) => estado.elasticache?.caches.find((c) => c.nombre === String(nombre ?? '').toLowerCase()) ?? null;

function instanciaOError(estado, id) {
  const i = instanciaRdsDe(estado, id);
  if (!i) throw errorAws('DBInstanceNotFound', `DBInstance ${id ?? ''} not found.`);
  return i;
}

function clusterOError(estado, id) {
  const c = clusterRdsDe(estado, id);
  if (!c) throw errorAws('DBClusterNotFoundFault', `DBCluster ${id ?? ''} not found.`);
  return c;
}

const identificadorUsado = (estado, id) => estado.rds.instancias.some((i) => i.id === id);

/** Las zonas que cubre un DB subnet group (sin repetir, en orden). */
export function zonasDeGrupoRds(estado, grupo) {
  const zonas = [];
  for (const id of grupo?.subredes ?? []) {
    const s = subredDe(estado, id);
    if (s && !zonas.includes(s.az)) zonas.push(s.az);
  }
  return zonas.sort();
}

/** La subred de un grupo que está en esa zona (la primera). */
const subredEnZona = (estado, grupo, zona) => grupo.subredes.map((id) => subredDe(estado, id)).find((s) => s && s.az === zona) ?? null;

/** Ventanas de respaldo y mantenimiento «No preference»: AWS elige una al azar. */
const ventanaAzar = () => {
  const h = Math.floor(aleatorio() * 24);
  const dos = (n) => String(n).padStart(2, '0');
  return `${dos(h)}:00-${dos(h)}:30`;
};
const DIAS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const ventanaMantenimientoAzar = () => {
  const d = DIAS[Math.floor(aleatorio() * 7)];
  const h = Math.floor(aleatorio() * 24);
  const dos = (n) => String(n).padStart(2, '0');
  return `${d}:${dos(h)}:00-${d}:${dos(h)}:30`;
};

/* ======================================================== DB subnet groups */

const NOMBRE_GRUPO = /^[a-z0-9 ._-]{1,255}$/;

/** «Create DB subnet group»: al menos dos zonas, todas las subredes de la misma VPC. */
export function crearGrupoSubredesRds(estado, { nombre, descripcion, vpcId, subredes = [] } = {}) {
  iniciar(estado);
  const n = String(nombre ?? '').trim().toLowerCase();
  if (!n) throw errorAws('MissingParameter', 'The request must contain the parameter DBSubnetGroupName.');
  if (!NOMBRE_GRUPO.test(n) || n === 'default') {
    throw errorAws('InvalidParameterValue', 'The parameter DBSubnetGroupName is not a valid identifier. Must contain no more than 255 letters, numbers, periods, underscores, spaces, or hyphens. Must not be default.');
  }
  const d = String(descripcion ?? '').trim();
  if (!d) throw errorAws('MissingParameter', 'The request must contain the parameter DBSubnetGroupDescription.');
  if (grupoSubredesRdsDe(estado, n)) throw errorAws('DBSubnetGroupAlreadyExists', `The DB subnet group '${n}' already exists.`);
  const vpc = vpcDe(estado, vpcId);
  if (!vpc) throw errorAws('InvalidVPCNetworkStateFault', `The VPC '${vpcId ?? ''}' does not exist.`);
  const grupo = { nombre: n, arn: arnRds(estado, 'subgrp', n), descripcion: d.slice(0, 255), vpcId: vpc.id, subredes: [], creado: iso() };
  grupo.subredes = validarSubredesGrupo(estado, vpc.id, subredes);
  estado.rds.gruposSubredes.push(grupo);
  evento(estado, n, 'db-subnet-group', 'DB subnet group created');
  anotar(estado, 'RDS', 'CreateDBSubnetGroup', `${n} en ${vpc.id}: ${grupo.subredes.join(', ')} (zonas ${zonasDeGrupoRds(estado, grupo).join(', ')})`);
  return grupo;
}

function validarSubredesGrupo(estado, vpcId, subredes) {
  const ids = [...new Set((subredes ?? []).filter(Boolean))];
  if (!ids.length) throw errorAws('MissingParameter', 'The request must contain the parameter SubnetIds.');
  for (const id of ids) {
    const s = subredDe(estado, id);
    if (!s) throw errorAws('InvalidSubnet', `The subnet ID '${id}' does not exist`);
    if (s.vpcId !== vpcId) throw errorAws('InvalidSubnet', `Subnet ${id} is not in VPC ${vpcId}. All subnets in a DB subnet group must be in the same VPC.`);
  }
  const zonas = [...new Set(ids.map((id) => subredDe(estado, id).az))].sort();
  if (zonas.length < 2) {
    throw errorAws('DBSubnetGroupDoesNotCoverEnoughAZs', `The DB subnet group doesn't meet Availability Zone (AZ) coverage requirement. Current AZ coverage: ${zonas.join(', ')}. Add subnets to cover at least 2 AZs.`);
  }
  return ids;
}

/** «Edit» del subnet group: descripción y subredes (las de las bases vivas deben seguir dentro). */
export function editarGrupoSubredesRds(estado, nombre, { descripcion, subredes } = {}) {
  iniciar(estado);
  const g = grupoSubredesRdsDe(estado, nombre);
  if (!g) throw errorAws('DBSubnetGroupNotFoundFault', `DB subnet group '${nombre ?? ''}' not found.`);
  if (descripcion !== undefined) {
    const d = String(descripcion).trim();
    if (!d) throw errorAws('MissingParameter', 'The request must contain the parameter DBSubnetGroupDescription.');
    g.descripcion = d.slice(0, 255);
  }
  if (subredes !== undefined) {
    const nuevas = validarSubredesGrupo(estado, g.vpcId, subredes);
    const enUso = estado.rds.instancias.filter((i) => i.grupoSubredes === g.nombre).flatMap((i) => [i.subredId, i.subredSecundaria]).filter(Boolean);
    const falta = enUso.find((id) => !nuevas.includes(id));
    if (falta) throw errorAws('SubnetAlreadyInUse', `The DB subnet group can't be modified: subnet ${falta} is in use by a DB instance.`);
    g.subredes = nuevas;
  }
  anotar(estado, 'RDS', 'ModifyDBSubnetGroup', `${g.nombre}: ${g.subredes.join(', ')}`);
  return g;
}

export function eliminarGrupoSubredesRds(estado, nombre) {
  iniciar(estado);
  const g = grupoSubredesRdsDe(estado, nombre);
  if (!g) throw errorAws('DBSubnetGroupNotFoundFault', `DB subnet group '${nombre ?? ''}' not found.`);
  const usa = estado.rds.instancias.find((i) => i.grupoSubredes === g.nombre) ?? estado.rds.clusteres.find((c) => c.grupoSubredes === g.nombre);
  if (usa) throw errorAws('InvalidDBSubnetGroupStateFault', `Cannot delete the subnet group '${g.nombre}' because at least one database instance: ${usa.id} is still using it.`);
  estado.rds.gruposSubredes = estado.rds.gruposSubredes.filter((x) => x !== g);
  anotar(estado, 'RDS', 'DeleteDBSubnetGroup', g.nombre);
}

/** El grupo que arma la consola con «Create new DB Subnet Group» o «Automatic setup»: todas las subredes de la VPC. */
function grupoAutomatico(estado, vpcId) {
  const nombre = `default-${vpcId}`;
  const ya = grupoSubredesRdsDe(estado, nombre);
  if (ya) return ya;
  const subredes = estado.subredes.filter((s) => s.vpcId === vpcId).map((s) => s.id);
  return crearGrupoSubredesRds(estado, { nombre, descripcion: `Created from the RDS Management Console`, vpcId, subredes });
}

/* ======================================================== crear una base */

/**
 * «Create database». Parámetros (los de la consola):
 *   metodo: 'standard'|'easy', motor, version, plantilla: 'production'|'devtest'|'freetier',
 *   despliegue: 'single'|'multiaz'|'cluster' (Aurora: replicaAurora true/false),
 *   id (DB instance identifier o DB cluster identifier), usuario, credenciales: 'self'|'secrets', contrasena,
 *   clase, serverless: { min, max }, almacenamiento: { tipo, gib, iops, autoescalado, maximo },
 *   vpcId, grupoSubredes (nombre | null = crear uno nuevo), publica, gruposSeguridad: [sgId],
 *   nuevoGrupo: nombre del grupo de seguridad nuevo, zona (null = No preference), puerto,
 *   conectarEc2: instanciaId (crea los grupos ec2-rds-N y rds-ec2-N),
 *   nombreBase, retencion, ventanaRespaldo, copiarEtiquetas, cifrada, llaveKms (alias, id o ARN; omitido = aws/rds),
 *   credencialesLlaveKms (la llave del secreto que crea RDS; omitido = aws/secretsmanager), protegida, actualizacionMenor, etiquetas
 * Devuelve la instancia (o el clúster, si es Aurora o Multi-AZ DB cluster).
 */
export function crearBaseRds(estado, p = {}) {
  iniciar(estado);
  const m = motorRds(p.motor ?? 'mysql');
  if (!m || m.desactivado) throw errorAws('InvalidParameterValue', `Invalid DB engine: ${p.motor}`);
  const version = p.version || m.versiones[0];
  if (!m.versiones.includes(version)) throw errorAws('InvalidParameterCombination', `Cannot find version ${version} for ${m.motor}`);
  const plantilla = ['production', 'devtest', 'freetier'].includes(p.plantilla) ? p.plantilla : 'devtest';
  // Como en la consola: la plantilla Free tier solo deja Single-AZ.
  let despliegue = ['single', 'multiaz', 'cluster'].includes(p.despliegue) ? p.despliegue : 'single';
  if (plantilla === 'freetier') despliegue = 'single';

  if (m.aurora || despliegue === 'cluster') return crearClusterRds(estado, { ...p, motor: m.motor, version, plantilla, despliegue });

  const id = validarIdentificador(p.id, 'DBInstanceIdentifier');
  if (identificadorUsado(estado, id)) throw errorAws('DBInstanceAlreadyExists', 'DB instance already exists');
  const usuario = validarUsuario(p.usuario ?? m.usuario);
  if (p.credenciales !== 'secrets') validarContrasena(p.contrasena, m.motor);
  const llaves = llavesDeBase(estado, p);

  const clase = claseRds(p.clase ?? 'db.t3.micro');
  if (!clase || !clase.donde.includes('instancia')) {
    throw errorAws('InvalidParameterCombination', `RDS does not support creating a DB instance with the following combination: DBInstanceClass=${p.clase}, Engine=${m.motor}, EngineVersion=${version}, LicenseModel=${m.motor === 'postgres' ? 'postgresql-license' : 'general-public-license'}. For supported combinations of instance class and database engine version, see the documentation.`);
  }
  const almacenamiento = validarAlmacenamiento(m.motor, p.almacenamiento ?? {});
  const retencion = validarRetencion(p.retencion ?? 7, false);

  const red = prepararRed(estado, { ...p, puerto: p.puerto ?? m.puerto, motor: m.motor, multiAz: despliegue === 'multiaz' });
  const inst = nuevaInstancia(estado, {
    id,
    motor: m.motor,
    version,
    clase: clase.clase,
    plantilla,
    despliegue,
    almacenamiento,
    usuario,
    credenciales: p.credenciales === 'secrets' ? 'secrets' : 'self',
    nombreBase: nombreLimpio(p.nombreBase, 64) || null,
    retencion,
    ventanaRespaldo: p.ventanaRespaldo || ventanaAzar(),
    copiarEtiquetas: p.copiarEtiquetas !== false,
    cifrada: p.cifrada !== false,
    ...llaves,
    protegida: Boolean(p.protegida),
    actualizacionMenor: p.actualizacionMenor !== false,
    etiquetas: limpiarEtiquetas(p.etiquetas),
    ...red
  });
  programar(inst, 'creating', DURACION_RDS.crear, retencion > 0 ? 'backing-up' : 'available', 'creada');
  estado.rds.instancias.push(inst);
  if (red.conectarEc2) conectarGrupos(estado, inst, red.conectarEc2, red.gruposConexion);
  evento(estado, id, 'db-instance', 'DB instance created');
  anotar(estado, 'RDS', 'CreateDBInstance', `${id} ${m.motor} ${version} ${clase.clase} ${despliegue === 'multiaz' ? 'Multi-AZ' : 'Single-AZ'} plantilla ${plantilla}, ${almacenamiento.tipo} ${almacenamiento.gib} GiB, grupo ${inst.grupoSubredes}, pública: ${inst.publica ? 'sí' : 'no'}, SG ${inst.gruposSeguridad.join(', ')}, retención ${retencion} días, protección ${inst.protegida ? 'sí' : 'no'}`);
  return inst;
}

/**
 * Las llaves de KMS de una base nueva: la que cifra el almacenamiento (aws/rds
 * o una propia) y, con «Managed in AWS Secrets Manager», la del secreto que
 * crea RDS (null = aws/secretsmanager). Como en la consola, una llave propia
 * tiene que estar habilitada y ser simétrica de cifrado.
 */
function llavesDeBase(estado, p) {
  const cifrada = p.cifrada !== false;
  const secreto = p.credenciales === 'secrets' && !p.expres;
  return {
    llaveKms: cifrada ? (esLlaveAws(p.llaveKms, 'rds') ? 'aws/rds' : llavePropiaRds(estado, p.llaveKms, 'encrypt the DB instance')) : null,
    credencialesLlaveKms: secreto && !esLlaveAws(p.credencialesLlaveKms, 'secretsmanager') ? llavePropiaRds(estado, p.credencialesLlaveKms, 'encrypt the master user secret') : null
  };
}

const esLlaveAws = (ref, servicio) => !ref || ref === `aws/${servicio}` || ref === `alias/aws/${servicio}`;

function llavePropiaRds(estado, ref, para) {
  const k = llamar('llaveKmsDe', estado, ref);
  if (!k) throw errorAws('KMSKeyNotAccessibleFault', `The specified KMS key [${ref}] does not exist, is not enabled or you do not have permissions to access it.`);
  if (k.administradaPorAws) throw errorAws('InvalidParameterCombination', `${k.alias ?? k.id} is an AWS managed key for another service. Choose aws/rds or a customer managed key.`);
  const uso = llamar('usoLlaveKms', estado, k.id);
  if (uso && !uso.ok) throw errorAws('KMSKeyNotAccessibleFault', `The KMS key ${k.alias ?? k.id} can't be used to ${para}. ${llamar('problemaLlaveKms', estado, k.id) ?? ''}`.trim());
  return k.id;
}

function limpiarEtiquetas(etiquetas) {
  return (etiquetas ?? []).filter((t) => String(t?.llave ?? '').trim()).slice(0, 50).map((t) => ({ llave: nombreLimpio(t.llave, 128), valor: nombreLimpio(t.valor, 256) }));
}

function validarAlmacenamiento(motor, a) {
  const tipo = ['gp3', 'gp2', 'io2'].includes(a.tipo) ? a.tipo : 'gp3';
  const gib = Number(a.gib ?? 20);
  const min = tipo === 'io2' ? 100 : 20;
  if (!Number.isInteger(gib) || gib < min || gib > 65536) {
    throw errorAws('InvalidParameterCombination', `Invalid storage size for engine name ${motor} and storage type ${tipo}: ${a.gib}`);
  }
  const autoescalado = a.autoescalado !== false;
  const maximo = autoescalado ? Number(a.maximo ?? 1000) : null;
  if (autoescalado && (!Number.isInteger(maximo) || maximo <= gib || maximo > 65536)) {
    throw errorAws('InvalidParameterCombination', 'Max storage size must be greater than storage size.');
  }
  const iops = tipo === 'io2' ? Number(a.iops ?? 3000) : tipo === 'gp3' ? (gib >= 400 ? 12000 : 3000) : Math.max(100, gib * 3);
  if (tipo === 'io2' && (!Number.isInteger(iops) || iops < 1000 || iops > 256000)) {
    throw errorAws('InvalidParameterCombination', 'Invalid Provisioned IOPS value. The IOPS value must be between 1000 and 256000.');
  }
  return { tipo, gib, iops, autoescalado, maximo };
}

function validarRetencion(valor, aurora) {
  const r = Number(valor);
  if (!Number.isInteger(r) || r < (aurora ? 1 : 0) || r > 35) {
    throw errorAws('InvalidParameterValue', `Invalid backup retention period: ${valor}. The backup retention period must be between ${aurora ? 1 : 0} and 35 days.`);
  }
  return r;
}

/**
 * Lo que comparten crear, restaurar y la réplica: VPC, subnet group, zona,
 * acceso público y grupos de seguridad. Devuelve los campos de red de la base.
 */
function prepararRed(estado, p) {
  let conectarEc2 = null;
  let vpcId = p.vpcId ?? estado.vpcs.find((v) => v.porDefecto)?.id;
  if (p.conectarEc2) {
    conectarEc2 = instanciaDe(estado, p.conectarEc2);
    if (!conectarEc2 || conectarEc2.estado === 'terminated') throw errorAws('InvalidParameterValue', `The EC2 instance ${p.conectarEc2} does not exist or is terminated.`);
    vpcId = conectarEc2.vpcId;
  }
  const vpc = vpcDe(estado, vpcId);
  if (!vpc) throw errorAws('InvalidVPCNetworkStateFault', 'No default VPC for this user. Choose a VPC.');

  let grupo = p.grupoSubredes ? grupoSubredesRdsDe(estado, p.grupoSubredes) : null;
  if (p.grupoSubredes && !grupo) throw errorAws('DBSubnetGroupNotFoundFault', `DB subnet group '${p.grupoSubredes}' does not exist.`);
  if (grupo && grupo.vpcId !== vpc.id) throw errorAws('InvalidParameterCombination', `The DB subnet group '${grupo.nombre}' doesn't belong to the VPC ${vpc.id}.`);
  if (!grupo) grupo = grupoAutomatico(estado, vpc.id);
  const zonas = zonasDeGrupoRds(estado, grupo);
  if (zonas.length < 2) throw errorAws('DBSubnetGroupDoesNotCoverEnoughAZs', `The DB subnet group doesn't meet Availability Zone (AZ) coverage requirement. Current AZ coverage: ${zonas.join(', ') || 'none'}. Add subnets to cover at least 2 AZs.`);

  const publica = Boolean(p.publica);
  if (publica && !igwDeVpc(estado, vpc.id)) {
    throw errorAws('InvalidVPCNetworkStateFault', 'Cannot create a publicly accessible DBInstance. The specified VPC has no internet gateway attached.');
  }

  // Zona: la pedida (solo Single-AZ), la de la instancia EC2 a conectar, o una al azar.
  let zona = p.zona && !p.multiAz ? p.zona : conectarEc2 && zonas.includes(conectarEc2.az) ? conectarEc2.az : zonas[Math.floor(aleatorio() * zonas.length)];
  if (!zonas.includes(zona)) throw errorAws('InvalidParameterCombination', `The Availability Zone ${zona} is not covered by the DB subnet group '${grupo.nombre}'.`);
  const subred = subredEnZona(estado, grupo, zona);
  let zonaSecundaria = null;
  let subredSecundaria = null;
  if (p.multiAz) {
    const otras = zonas.filter((z) => z !== zona);
    zonaSecundaria = otras[Math.floor(aleatorio() * otras.length)];
    subredSecundaria = subredEnZona(estado, grupo, zonaSecundaria).id;
  }

  // Grupos de seguridad: los elegidos, uno nuevo, o los de «Connect to an EC2 compute resource».
  const grupos = [...new Set(p.gruposSeguridad ?? [])];
  for (const id of grupos) {
    const g = grupoDe(estado, id);
    if (!g) throw errorAws('InvalidParameterValue', `Invalid security group , groupId= ${id}, groupName=.`);
    if (g.vpcId !== vpc.id) throw errorAws('InvalidParameterCombination', `The DB instance and EC2 security group are in different VPCs. The DB instance is in ${vpc.id} and the EC2 security group is in ${g.vpcId}`);
  }
  if (p.nuevoGrupo) {
    const ip = estado.cuenta?.ipCasa ?? '187.190.20.30';
    const g = crearGrupoSeguridad(estado, {
      nombre: p.nuevoGrupo,
      descripcion: 'Created by RDS management console',
      vpcId: vpc.id,
      entrada: [{ protocolo: 'tcp', desde: p.puerto, hasta: p.puerto, origen: `${ip}/32`, descripcion: '' }]
    });
    grupos.push(g.id);
  }
  let gruposConexion = null;
  if (conectarEc2) {
    gruposConexion = crearParConexion(estado, vpc.id, p.puerto);
    grupos.push(gruposConexion.rdsEc2);
  }
  if (!grupos.length) {
    const def = estado.gruposSeguridad.find((g) => g.vpcId === vpc.id && g.porDefecto);
    if (def) grupos.push(def.id);
  }
  return {
    vpcId: vpc.id,
    grupoSubredes: grupo.nombre,
    zona,
    zonaSecundaria,
    subredId: subred.id,
    subredSecundaria,
    multiAz: Boolean(p.multiAz),
    publica,
    gruposSeguridad: grupos,
    puerto: Number(p.puerto),
    conectarEc2: conectarEc2?.id ?? null,
    gruposConexion
  };
}

/** Los dos grupos que crea «Connect to an EC2 compute resource»: rds-ec2-N (para la base) y ec2-rds-N (para la instancia). */
function crearParConexion(estado, vpcId, puerto) {
  let n = 1;
  const nombres = new Set(estado.gruposSeguridad.filter((g) => g.vpcId === vpcId).map((g) => g.nombre));
  while (nombres.has(`rds-ec2-${n}`) || nombres.has(`ec2-rds-${n}`)) n += 1;
  const ec2Rds = crearGrupoSeguridad(estado, { nombre: `ec2-rds-${n}`, descripcion: 'Security group attached to instances to securely connect to RDS instances. Modification could lead to connection loss.', vpcId, entrada: [], salida: [] });
  const rdsEc2 = crearGrupoSeguridad(estado, {
    nombre: `rds-ec2-${n}`,
    descripcion: 'Security group attached to RDS instances to allow EC2 instances with specific security groups attached to connect to the instance. Modification could lead to connection loss.',
    vpcId,
    entrada: [{ protocolo: 'tcp', desde: puerto, hasta: puerto, origen: ec2Rds.id, descripcion: `Rule to allow connections from EC2 instances with ${ec2Rds.id} attached` }],
    salida: []
  });
  ec2Rds.salida = [{ id: `sgr-0${hexAzar(16)}`, protocolo: 'tcp', desde: puerto, hasta: puerto, origen: rdsEc2.id, descripcion: `Rule to allow connections to RDS instances with ${rdsEc2.id} attached` }];
  return { ec2Rds: ec2Rds.id, rdsEc2: rdsEc2.id };
}

/** Le pone a la instancia EC2 el grupo ec2-rds-N y anota la conexión en la base. */
function conectarGrupos(estado, base, instanciaId, par) {
  const inst = instanciaDe(estado, instanciaId);
  if (inst && !inst.gruposSeguridad.includes(par.ec2Rds)) cambiarGruposInstancia(estado, inst.id, [...inst.gruposSeguridad, par.ec2Rds]);
  base.conexionesEc2 = [...new Set([...(base.conexionesEc2 ?? []), instanciaId])];
}

/** Arma el objeto de una instancia de RDS (sin agregarla). */
function nuevaInstancia(estado, d) {
  const subred = subredDe(estado, d.subredId);
  const ipPrivada = subred ? ipPrivadaNueva(estado, subred) : null;
  const inst = {
    id: d.id,
    arn: arnRds(estado, 'db', d.id),
    recursoId: recursoIdNuevo('db'),
    motor: d.motor,
    version: d.version,
    clase: d.clase,
    plantilla: d.plantilla ?? 'devtest',
    despliegue: d.despliegue ?? (d.multiAz ? 'multiaz' : 'single'),
    multiAz: Boolean(d.multiAz),
    zona: d.zona,
    zonaSecundaria: d.zonaSecundaria ?? null,
    subredId: d.subredId,
    subredSecundaria: d.subredSecundaria ?? null,
    ipPrivada,
    ipPublica: d.publica ? ipPublicaNueva(estado) : null,
    almacenamiento: d.almacenamiento,
    vpcId: d.vpcId,
    grupoSubredes: d.grupoSubredes,
    publica: Boolean(d.publica),
    gruposSeguridad: d.gruposSeguridad ?? [],
    puerto: d.puerto,
    usuario: d.usuario,
    contrasenaDefinida: true,
    credenciales: d.credenciales ?? 'self',
    nombreBase: d.nombreBase ?? null,
    retencion: d.retencion ?? 0,
    ventanaRespaldo: d.ventanaRespaldo ?? ventanaAzar(),
    copiarEtiquetas: d.copiarEtiquetas !== false,
    cifrada: Boolean(d.cifrada),
    llaveKms: d.cifrada ? (d.llaveKms ?? 'aws/rds') : null,
    credencialesLlaveKms: d.credenciales === 'secrets' ? (d.credencialesLlaveKms ?? null) : null,
    protegida: Boolean(d.protegida),
    actualizacionMenor: d.actualizacionMenor !== false,
    ventanaMantenimiento: d.ventanaMantenimiento ?? ventanaMantenimientoAzar(),
    endpoint: `${d.id}.${hashCuenta(estado)}.us-east-1.rds.amazonaws.com`,
    estado: 'creating',
    pendientes: null,
    rol: d.rol ?? 'instance',
    fuente: d.fuente ?? null,
    replicas: [],
    clusterId: d.clusterId ?? null,
    conexionesEc2: [],
    etiquetas: d.etiquetas ?? [],
    creado: iso(),
    primerRespaldo: null
  };
  return inst;
}

/* ============================================================ clústeres */

/** Aurora (MySQL/PostgreSQL) o Multi-AZ DB cluster (3 instancias en 3 zonas). */
function crearClusterRds(estado, p) {
  const m = motorRds(p.motor);
  const aurora = m.aurora;
  if (!aurora && !['mysql', 'postgres'].includes(m.motor)) {
    throw errorAws('InvalidParameterCombination', `Multi-AZ DB clusters aren't supported for engine ${m.motor}.`);
  }
  const id = validarIdentificador(p.id, 'DBClusterIdentifier');
  if (estado.rds.clusteres.some((c) => c.id === id)) throw errorAws('DBClusterAlreadyExistsFault', 'DB Cluster already exists');
  const usuario = validarUsuario(p.usuario ?? m.usuario);
  if (p.credenciales !== 'secrets' && !p.expres) validarContrasena(p.contrasena, m.motor);
  const llaves = llavesDeBase(estado, p);
  const clase = claseRds(p.clase ?? (aurora ? 'db.serverless' : 'db.m5d.large'));
  if (!clase || !clase.donde.includes(aurora ? 'aurora' : 'cluster')) {
    throw errorAws('InvalidParameterCombination', `RDS does not support creating a DB instance with the following combination: DBInstanceClass=${p.clase}, Engine=${m.motor}, EngineVersion=${p.version}, LicenseModel=${m.motor.includes('postgres') ? 'postgresql-license' : 'general-public-license'}. For supported combinations of instance class and database engine version, see the documentation.`);
  }
  let serverless = null;
  if (clase.clase === 'db.serverless') {
    const min = Number(p.serverless?.min ?? 0);
    const max = Number(p.serverless?.max ?? 4);
    if (!(min >= 0 && max <= 256 && max >= 1 && min <= max)) throw errorAws('InvalidParameterValue', 'The maximum capacity must be greater than or equal to the minimum capacity, and between 1 and 256 ACUs.');
    serverless = { min, max };
  }
  const retencion = validarRetencion(p.retencion ?? 7, aurora);
  const almacenamiento = aurora ? { tipo: 'aurora', gib: 0, iops: null, autoescalado: true, maximo: 131072, optimizado: p.almacenamiento?.tipo === 'io-optimized' } : validarAlmacenamiento(m.motor, { tipo: 'io2', gib: 100, iops: 1000, autoescalado: false, ...(p.almacenamiento ?? {}) });
  const red = prepararRed(estado, { ...p, puerto: p.puerto ?? m.puerto, multiAz: false });
  const grupo = grupoSubredesRdsDe(estado, red.grupoSubredes);
  const zonas = zonasDeGrupoRds(estado, grupo);
  if (!aurora && zonas.length < 3) {
    throw errorAws('DBSubnetGroupDoesNotCoverEnoughAZs', `The DB subnet group doesn't meet Availability Zone (AZ) coverage requirement. Current AZ coverage: ${zonas.join(', ')}. Add subnets to cover at least 3 AZs.`);
  }
  const hash = hashCuenta(estado);
  const cluster = {
    id,
    arn: arnRds(estado, 'cluster', id),
    recursoId: recursoIdNuevo('cluster'),
    tipo: aurora ? 'aurora' : 'multiaz',
    motor: m.motor,
    version: p.version,
    plantilla: p.plantilla,
    clase: clase.clase,
    miembros: [],
    endpoint: `${id}.cluster-${hash}.us-east-1.rds.amazonaws.com`,
    endpointLectura: `${id}.cluster-ro-${hash}.us-east-1.rds.amazonaws.com`,
    puerto: red.puerto,
    vpcId: red.vpcId,
    grupoSubredes: red.grupoSubredes,
    gruposSeguridad: red.gruposSeguridad,
    publica: red.publica,
    usuario,
    contrasenaDefinida: !p.expres,
    credenciales: p.expres ? 'iam' : p.credenciales === 'secrets' ? 'secrets' : 'self',
    nombreBase: nombreLimpio(p.nombreBase, 64) || null,
    retencion,
    ventanaRespaldo: p.ventanaRespaldo || ventanaAzar(),
    cifrada: p.cifrada !== false,
    ...llaves,
    protegida: Boolean(p.protegida),
    almacenamiento,
    serverless,
    expres: Boolean(p.expres),
    conexionesEc2: [],
    etiquetas: limpiarEtiquetas(p.etiquetas),
    estado: 'creating',
    creado: iso(),
    primerRespaldo: null
  };
  programar(cluster, 'creating', DURACION_RDS.crear, retencion > 0 ? 'backing-up' : 'available', 'creada');
  estado.rds.clusteres.push(cluster);

  // Las instancias del clúster: la escritora y sus lectoras.
  const otras = zonas.filter((z) => z !== red.zona);
  const cuantas = aurora ? (p.replicaAurora ? 2 : 1) : 3;
  for (let k = 0; k < cuantas; k++) {
    const zona = k === 0 ? red.zona : otras[(k - 1) % otras.length];
    const nombre = aurora ? (k === 0 ? `${id}-instance-1` : `${id}-instance-1-${zona}`) : `${id}-instance-${k + 1}`;
    if (identificadorUsado(estado, nombre)) throw errorAws('DBInstanceAlreadyExists', 'DB instance already exists');
    const inst = nuevaInstancia(estado, {
      ...red,
      id: nombre,
      motor: m.motor,
      version: p.version,
      clase: clase.clase,
      plantilla: p.plantilla,
      despliegue: 'cluster',
      multiAz: false,
      zona,
      subredId: subredEnZona(estado, grupo, zona).id,
      zonaSecundaria: null,
      subredSecundaria: null,
      almacenamiento,
      usuario,
      retencion,
      cifrada: cluster.cifrada,
      llaveKms: cluster.llaveKms,
      protegida: false,
      rol: k === 0 ? 'writer' : 'reader',
      clusterId: id
    });
    programar(inst, 'creating', DURACION_RDS.crear, 'available', 'miembro');
    estado.rds.instancias.push(inst);
    cluster.miembros.push(inst.id);
  }
  if (red.conectarEc2) conectarGrupos(estado, cluster, red.conectarEc2, red.gruposConexion);
  evento(estado, id, 'db-cluster', 'DB cluster created');
  anotar(estado, 'RDS', 'CreateDBCluster', `${id} ${aurora ? m.nombre : `Multi-AZ DB cluster ${m.motor}`} ${p.version} ${clase.clase}${serverless ? ` (${serverless.min}-${serverless.max} ACU)` : ''}, ${cluster.miembros.length} instancias, grupo ${cluster.grupoSubredes}, retención ${retencion} días`);
  return cluster;
}

/**
 * «Create with express configuration» de la página de bienvenida: un clúster
 * Aurora PostgreSQL Serverless v2 listo en segundos, con valores fijos.
 */
export function crearBaseExpres(estado, { id, min = 0, max = 16 } = {}) {
  iniciar(estado);
  const c = crearBaseRds(estado, {
    motor: 'aurora-postgresql',
    plantilla: 'devtest',
    id: id || `database-${estado.rds.clusteres.length + 1}`,
    usuario: 'postgres',
    clase: 'db.serverless',
    serverless: { min, max },
    expres: true,
    retencion: 1,
    cifrada: true
  });
  anotar(estado, 'RDS', 'CreateDBCluster (express configuration)', c.id);
  return c;
}

/** «Add reader» de un clúster Aurora. */
export function agregarLectorAurora(estado, clusterId, { id, clase, zona } = {}) {
  iniciar(estado);
  const c = clusterOError(estado, clusterId);
  if (c.tipo !== 'aurora') throw errorAws('InvalidDBClusterStateFault', 'You can only add readers to Aurora DB clusters.');
  if (c.estado !== 'available') throw errorAws('InvalidDBClusterStateFault', `DB cluster ${c.id} is not in the available state.`);
  const nombre = validarIdentificador(id, 'DBInstanceIdentifier');
  if (identificadorUsado(estado, nombre)) throw errorAws('DBInstanceAlreadyExists', 'DB instance already exists');
  if (c.miembros.length >= 16) throw errorAws('InstanceQuotaExceeded', 'An Aurora DB cluster can have up to 15 Aurora Replicas.');
  const k = claseRds(clase ?? c.clase);
  if (!k || !k.donde.includes('aurora')) throw errorAws('InvalidParameterCombination', `RDS does not support creating a DB instance with the following combination: DBInstanceClass=${clase}, Engine=${c.motor}.`);
  const grupo = grupoSubredesRdsDe(estado, c.grupoSubredes);
  const zonas = zonasDeGrupoRds(estado, grupo);
  const z = zona && zonas.includes(zona) ? zona : zonas[Math.floor(aleatorio() * zonas.length)];
  const escritora = instanciaRdsDe(estado, c.miembros.find((mid) => instanciaRdsDe(estado, mid)?.rol === 'writer'));
  const inst = nuevaInstancia(estado, {
    id: nombre,
    motor: c.motor,
    version: c.version,
    clase: k.clase,
    plantilla: c.plantilla,
    despliegue: 'cluster',
    zona: z,
    subredId: subredEnZona(estado, grupo, z).id,
    almacenamiento: c.almacenamiento,
    vpcId: c.vpcId,
    grupoSubredes: c.grupoSubredes,
    publica: c.publica,
    gruposSeguridad: [...c.gruposSeguridad],
    puerto: c.puerto,
    usuario: c.usuario,
    retencion: c.retencion,
    cifrada: c.cifrada,
    llaveKms: c.llaveKms,
    rol: 'reader',
    clusterId: c.id,
    ventanaMantenimiento: escritora?.ventanaMantenimiento
  });
  programar(inst, 'creating', DURACION_RDS.replica, 'available', 'miembro');
  estado.rds.instancias.push(inst);
  c.miembros.push(inst.id);
  evento(estado, inst.id, 'db-instance', 'DB instance created');
  anotar(estado, 'RDS', 'CreateDBInstance (Aurora reader)', `${inst.id} en ${c.id} (${z})`);
  return inst;
}

/* ======================================================== réplicas */

/**
 * «Create read replica». La fuente debe estar available y con respaldos
 * automáticos (retención > 0). La réplica puede ir en otra zona y ser Multi-AZ.
 */
export function crearReplicaRds(estado, fuenteId, p = {}) {
  iniciar(estado);
  const fuente = instanciaOError(estado, fuenteId);
  if (fuente.clusterId) throw errorAws('InvalidDBInstanceState', 'Read replicas of a DB instance in a DB cluster are not supported. Add a reader to the DB cluster instead.');
  if (fuente.retencion === 0) {
    throw errorAws('InvalidDBInstanceState', 'Automated backups are not enabled for this database instance. To enable automated backups, use ModifyDBInstance to set the backup retention period to a non-zero value.');
  }
  if (fuente.estado !== 'available') throw errorAws('InvalidDBInstanceState', `DB instance ${fuente.id} is not in available state.`);
  if (fuente.replicas.length >= 15) throw errorAws('DBInstanceQuotaExceeded', `The source DB instance ${fuente.id} already has the maximum number of read replicas (15).`);
  const id = validarIdentificador(p.id, 'DBInstanceIdentifier');
  if (identificadorUsado(estado, id)) throw errorAws('DBInstanceAlreadyExists', 'DB instance already exists');
  const clase = claseRds(p.clase ?? fuente.clase);
  if (!clase || !clase.donde.includes('instancia')) throw errorAws('InvalidParameterCombination', `RDS does not support creating a DB instance with the following combination: DBInstanceClass=${p.clase}, Engine=${fuente.motor}.`);
  const red = prepararRed(estado, {
    vpcId: fuente.vpcId,
    grupoSubredes: fuente.grupoSubredes,
    zona: p.zona,
    multiAz: Boolean(p.multiAz),
    publica: p.publica ?? false,
    gruposSeguridad: p.gruposSeguridad?.length ? p.gruposSeguridad : fuente.gruposSeguridad,
    puerto: fuente.puerto
  });
  const inst = nuevaInstancia(estado, {
    ...red,
    id,
    motor: fuente.motor,
    version: fuente.version,
    clase: clase.clase,
    plantilla: fuente.plantilla,
    despliegue: red.multiAz ? 'multiaz' : 'single',
    almacenamiento: { ...fuente.almacenamiento },
    usuario: fuente.usuario,
    credenciales: fuente.credenciales,
    nombreBase: fuente.nombreBase,
    retencion: 0,
    cifrada: fuente.cifrada,
    llaveKms: fuente.llaveKms,
    protegida: Boolean(p.protegida),
    rol: 'replica',
    fuente: fuente.id
  });
  programar(inst, 'creating', DURACION_RDS.replica, 'available', 'replica');
  estado.rds.instancias.push(inst);
  fuente.replicas.push(inst.id);
  fuente.rol = 'primary';
  evento(estado, id, 'db-instance', `Read replica created from source ${fuente.id}`);
  anotar(estado, 'RDS', 'CreateDBInstanceReadReplica', `${id} desde ${fuente.id} en ${inst.zona}${inst.multiAz ? ' (Multi-AZ)' : ''}`);
  return inst;
}

/** «Promote»: la réplica se vuelve una base independiente. */
export function promoverReplicaRds(estado, id, { retencion = 7 } = {}) {
  iniciar(estado);
  const r = instanciaOError(estado, id);
  if (r.rol !== 'replica') throw errorAws('InvalidDBInstanceState', `DB instance ${r.id} is not a read replica.`);
  if (r.estado !== 'available') throw errorAws('InvalidDBInstanceState', `DB instance ${r.id} is not in available state.`);
  soltarDeFuente(estado, r);
  r.retencion = validarRetencion(retencion, false);
  programar(r, 'modifying', DURACION_RDS.modificar, r.retencion > 0 ? 'backing-up' : 'available', 'promovida');
  evento(estado, r.id, 'db-instance', 'Read replica promotion started');
  anotar(estado, 'RDS', 'PromoteReadReplica', r.id);
  return r;
}

function soltarDeFuente(estado, replica) {
  const f = instanciaRdsDe(estado, replica.fuente);
  if (f) {
    f.replicas = f.replicas.filter((x) => x !== replica.id);
    if (!f.replicas.length && f.rol === 'primary') f.rol = 'instance';
  }
  replica.fuente = null;
  replica.rol = 'instance';
}

/* ======================================================== modificar */

/**
 * «Modify». cambios: { clase, multiAz, gib, autoescalado, maximo, tipoAlmacenamiento, retencion, protegida,
 * gruposSeguridad, publica, contrasena, actualizacionMenor, copiarEtiquetas }.
 * inmediato: true = «Apply immediately»; si no, lo que requiere reinicio queda pendiente para
 * la ventana de mantenimiento. La protección, la retención y los grupos se aplican siempre ya.
 */
export function modificarBaseRds(estado, id, cambios = {}, { inmediato = false } = {}) {
  iniciar(estado);
  const i = instanciaOError(estado, id);
  if (i.estado !== 'available') throw errorAws('InvalidDBInstanceState', `Database instance is not in available state.`);
  const listo = {};
  const pend = {};
  const m = motorRds(i.motor);

  if (cambios.clase !== undefined && cambios.clase !== i.clase) {
    const k = claseRds(cambios.clase);
    const donde = i.clusterId ? (esAurora(i.motor) ? 'aurora' : 'cluster') : 'instancia';
    if (!k || !k.donde.includes(donde)) throw errorAws('InvalidParameterCombination', `RDS does not support creating a DB instance with the following combination: DBInstanceClass=${cambios.clase}, Engine=${i.motor}, EngineVersion=${i.version}.`);
    (inmediato ? listo : pend).clase = k.clase;
  }
  if (cambios.multiAz !== undefined && Boolean(cambios.multiAz) !== i.multiAz) {
    if (i.clusterId) throw errorAws('InvalidParameterCombination', 'Multi-AZ can not be modified for a DB instance in a DB cluster.');
    if (i.plantilla === 'freetier' && cambios.multiAz) throw errorAws('InvalidParameterCombination', 'Multi-AZ deployments are not available with the Free tier template. Create the database with the Production or Dev/Test template.');
    (inmediato ? listo : pend).multiAz = Boolean(cambios.multiAz);
  }
  if (cambios.gib !== undefined || cambios.tipoAlmacenamiento !== undefined || cambios.autoescalado !== undefined || cambios.maximo !== undefined) {
    if (i.almacenamiento.tipo === 'aurora') throw errorAws('InvalidParameterCombination', 'Aurora cluster storage grows automatically and cannot be modified.');
    const nuevo = validarAlmacenamiento(i.motor, {
      tipo: cambios.tipoAlmacenamiento ?? i.almacenamiento.tipo,
      gib: cambios.gib ?? i.almacenamiento.gib,
      iops: i.almacenamiento.iops,
      autoescalado: cambios.autoescalado ?? i.almacenamiento.autoescalado,
      maximo: cambios.maximo ?? i.almacenamiento.maximo ?? Math.max(1000, (cambios.gib ?? i.almacenamiento.gib) + 1)
    });
    if (nuevo.gib < i.almacenamiento.gib) throw errorAws('InvalidParameterCombination', `Invalid storage size for engine name ${i.motor} and storage type ${nuevo.tipo}: ${nuevo.gib}. You can't reduce the allocated storage (currently ${i.almacenamiento.gib} GiB).`);
    if (nuevo.gib !== i.almacenamiento.gib || nuevo.tipo !== i.almacenamiento.tipo) (inmediato ? listo : pend).almacenamiento = nuevo;
    else i.almacenamiento = nuevo;
  }
  if (cambios.retencion !== undefined && Number(cambios.retencion) !== i.retencion) {
    if (i.clusterId) throw errorAws('InvalidParameterCombination', 'The backup retention period of a DB instance in a DB cluster is set on the DB cluster.');
    const r = validarRetencion(cambios.retencion, false);
    if (r === 0 && i.replicas.length) throw errorAws('InvalidParameterCombination', 'Cannot disable automated backups on a DB instance that has read replicas.');
    listo.retencion = r;
  }
  if (cambios.protegida !== undefined) i.protegida = Boolean(cambios.protegida);
  if (cambios.actualizacionMenor !== undefined) i.actualizacionMenor = Boolean(cambios.actualizacionMenor);
  if (cambios.copiarEtiquetas !== undefined) i.copiarEtiquetas = Boolean(cambios.copiarEtiquetas);
  if (cambios.gruposSeguridad !== undefined) {
    const gs = [...new Set(cambios.gruposSeguridad)];
    if (!gs.length) throw errorAws('InvalidParameterValue', 'At least one VPC security group is required.');
    for (const g of gs) {
      const x = grupoDe(estado, g);
      if (!x) throw errorAws('InvalidParameterValue', `Invalid security group , groupId= ${g}, groupName=.`);
      if (x.vpcId !== i.vpcId) throw errorAws('InvalidParameterCombination', `The DB instance and EC2 security group are in different VPCs. The DB instance is in ${i.vpcId} and the EC2 security group is in ${x.vpcId}`);
    }
    i.gruposSeguridad = gs;
  }
  if (cambios.publica !== undefined && Boolean(cambios.publica) !== i.publica) {
    if (cambios.publica && !igwDeVpc(estado, i.vpcId)) throw errorAws('InvalidVPCNetworkStateFault', 'Cannot modify a DBInstance to be publicly accessible. The specified VPC has no internet gateway attached.');
    listo.publica = Boolean(cambios.publica);
  }
  if (cambios.contrasena !== undefined && cambios.contrasena !== '') {
    validarContrasena(cambios.contrasena, m?.motor ?? i.motor);
    listo.contrasena = true;
  }

  const hayPend = Object.keys(pend).length;
  if (hayPend) i.pendientes = { ...(i.pendientes ?? {}), ...pend };
  if (Object.keys(listo).length) {
    i.cambiosEnCurso = listo;
    programar(i, 'modifying', DURACION_RDS.modificar, 'available', 'modificada');
  }
  evento(estado, i.id, 'db-instance', inmediato || !hayPend ? 'Applying modification to DB instance' : 'Modifications scheduled for the next maintenance window');
  anotar(estado, 'RDS', 'ModifyDBInstance', `${i.id} ${inmediato ? 'Apply immediately' : 'next maintenance window'}: ${JSON.stringify({ ...cambios, contrasena: cambios.contrasena ? '***' : undefined })}`);
  return i;
}

/** Aplica los cambios de un Modify al terminar «modifying». */
function aplicarCambios(estado, i, c) {
  if (c.clase) i.clase = c.clase;
  if (c.almacenamiento) i.almacenamiento = c.almacenamiento;
  if (c.publica !== undefined) {
    i.publica = c.publica;
    i.ipPublica = c.publica ? ipPublicaNueva(estado) : null;
  }
  if (c.multiAz !== undefined) {
    i.multiAz = c.multiAz;
    i.despliegue = c.multiAz ? 'multiaz' : 'single';
    if (c.multiAz) {
      const grupo = grupoSubredesRdsDe(estado, i.grupoSubredes);
      const otras = zonasDeGrupoRds(estado, grupo).filter((z) => z !== i.zona);
      i.zonaSecundaria = otras[Math.floor(aleatorio() * otras.length)] ?? null;
      i.subredSecundaria = i.zonaSecundaria ? subredEnZona(estado, grupo, i.zonaSecundaria).id : null;
    } else {
      i.zonaSecundaria = null;
      i.subredSecundaria = null;
    }
  }
  if (c.retencion !== undefined) {
    const antes = i.retencion;
    i.retencion = c.retencion;
    if (c.retencion === 0) estado.rds.snapshots = estado.rds.snapshots.filter((s) => !(s.tipo === 'automated' && s.instanciaId === i.id && !s.retenido));
    if (antes === 0 && c.retencion > 0) return 'respaldar';
  }
  return null;
}

/** «Apply now» de las modificaciones pendientes (o las aplica la ventana de mantenimiento). */
export function aplicarPendientesRds(estado, id) {
  iniciar(estado);
  const i = instanciaOError(estado, id);
  if (!i.pendientes) throw errorAws('InvalidParameterCombination', `DB instance ${i.id} has no pending modifications.`);
  if (i.estado !== 'available') throw errorAws('InvalidDBInstanceState', 'Database instance is not in available state.');
  i.cambiosEnCurso = i.pendientes;
  i.pendientes = null;
  programar(i, 'modifying', DURACION_RDS.modificar, 'available', 'modificada');
  anotar(estado, 'RDS', 'ApplyPendingMaintenanceAction', i.id);
  return i;
}

/** Modify del clúster: retención, protección y grupos de seguridad (se aplican ya). */
export function modificarClusterRds(estado, id, cambios = {}) {
  iniciar(estado);
  const c = clusterOError(estado, id);
  if (c.estado !== 'available') throw errorAws('InvalidDBClusterStateFault', `DB cluster ${c.id} is not in the available state.`);
  if (cambios.retencion !== undefined) c.retencion = validarRetencion(cambios.retencion, c.tipo === 'aurora');
  if (cambios.protegida !== undefined) c.protegida = Boolean(cambios.protegida);
  if (cambios.serverless && c.serverless) {
    const { min, max } = cambios.serverless;
    if (!(Number(min) >= 0 && Number(max) >= 1 && Number(max) <= 256 && Number(min) <= Number(max))) throw errorAws('InvalidParameterValue', 'The maximum capacity must be greater than or equal to the minimum capacity, and between 1 and 256 ACUs.');
    c.serverless = { min: Number(min), max: Number(max) };
  }
  if (cambios.gruposSeguridad) {
    for (const g of cambios.gruposSeguridad) {
      const x = grupoDe(estado, g);
      if (!x || x.vpcId !== c.vpcId) throw errorAws('InvalidParameterValue', `Invalid security group , groupId= ${g}, groupName=.`);
    }
    c.gruposSeguridad = [...new Set(cambios.gruposSeguridad)];
    for (const mid of c.miembros) {
      const inst = instanciaRdsDe(estado, mid);
      if (inst) inst.gruposSeguridad = [...c.gruposSeguridad];
    }
  }
  for (const mid of c.miembros) {
    const inst = instanciaRdsDe(estado, mid);
    if (inst && cambios.retencion !== undefined) inst.retencion = c.retencion;
  }
  programar(c, 'modifying', DURACION_RDS.modificar, 'available', 'modificada');
  evento(estado, c.id, 'db-cluster', 'Applying modification to DB cluster');
  anotar(estado, 'RDS', 'ModifyDBCluster', `${c.id}: ${JSON.stringify(cambios)}`);
  return c;
}

/* ======================================================== reiniciar, detener */

/** «Reboot». Con failover (solo Multi-AZ) la principal y la standby se intercambian de zona. */
export function reiniciarBaseRds(estado, id, { failover = false } = {}) {
  iniciar(estado);
  const i = instanciaOError(estado, id);
  if (i.estado !== 'available') throw errorAws('InvalidDBInstanceState', `DB instance ${i.id} is not in available state.`);
  if (failover && !i.multiAz) throw errorAws('InvalidParameterCombination', 'Reboot with failover is only supported for Multi-AZ DB instances.');
  programar(i, 'rebooting', DURACION_RDS.reiniciar, 'available', failover ? 'failover' : 'reiniciada');
  evento(estado, i.id, 'db-instance', failover ? 'Multi-AZ instance failover started.' : 'DB instance shutdown');
  anotar(estado, 'RDS', 'RebootDBInstance', `${i.id}${failover ? ' with failover' : ''}`);
  return i;
}

/** «Failover» de un clúster: una lectora pasa a ser la escritora. */
export function failoverClusterRds(estado, id, { destino } = {}) {
  iniciar(estado);
  const c = clusterOError(estado, id);
  if (c.estado !== 'available') throw errorAws('InvalidDBClusterStateFault', `DB cluster ${c.id} is not in the available state.`);
  const miembros = c.miembros.map((x) => instanciaRdsDe(estado, x)).filter(Boolean);
  const escritora = miembros.find((x) => x.rol === 'writer');
  const lectora = destino ? miembros.find((x) => x.id === destino && x.rol === 'reader') : miembros.find((x) => x.rol === 'reader' && x.estado === 'available');
  if (!lectora) throw errorAws('InvalidDBClusterStateFault', `DB cluster ${c.id} has no available reader to fail over to.`);
  if (escritora) {
    escritora.rol = 'reader';
    programar(escritora, 'rebooting', DURACION_RDS.reiniciar, 'available', 'reiniciada');
  }
  lectora.rol = 'writer';
  programar(lectora, 'rebooting', DURACION_RDS.reiniciar, 'available', 'reiniciada');
  evento(estado, c.id, 'db-cluster', `Started cross AZ failover to DB instance: ${lectora.id}`);
  anotar(estado, 'RDS', 'FailoverDBCluster', `${c.id}: nueva escritora ${lectora.id}`);
  return c;
}

/** «Stop temporarily»: AWS la vuelve a prender sola a los 7 días. */
export function detenerBaseRds(estado, id) {
  iniciar(estado);
  const i = instanciaRdsDe(estado, id);
  if (!i) {
    const c = clusterOError(estado, id);
    if (c.estado !== 'available') throw errorAws('InvalidDBClusterStateFault', `DbCluster ${c.id} is in ${c.estado} state but expected it to be one of available.`);
    programar(c, 'stopping', DURACION_RDS.detener, 'stopped', 'detenida');
    for (const mid of c.miembros) {
      const x = instanciaRdsDe(estado, mid);
      if (x) programar(x, 'stopping', DURACION_RDS.detener, 'stopped', 'detenida');
    }
    evento(estado, c.id, 'db-cluster', 'DB cluster stopped');
    anotar(estado, 'RDS', 'StopDBCluster', c.id);
    return c;
  }
  if (i.clusterId) throw errorAws('InvalidDBInstanceState', `Cannot stop DB instance ${i.id} because it is part of a DB cluster. Stop the DB cluster instead.`);
  if (i.rol === 'replica') throw errorAws('InvalidDBInstanceState', 'Cannot stop or start a Read Replica instance');
  if (i.replicas.length) throw errorAws('InvalidDBInstanceState', `Cannot stop instance ${i.id} because it has read replicas.`);
  if (i.estado !== 'available') throw errorAws('InvalidDBInstanceState', `Instance ${i.id} is not in available state.`);
  programar(i, 'stopping', DURACION_RDS.detener, 'stopped', 'detenida');
  evento(estado, i.id, 'db-instance', 'DB instance shutdown');
  anotar(estado, 'RDS', 'StopDBInstance', i.id);
  return i;
}

export function arrancarBaseRds(estado, id) {
  iniciar(estado);
  const i = instanciaRdsDe(estado, id);
  if (!i) {
    const c = clusterOError(estado, id);
    if (c.estado !== 'stopped') throw errorAws('InvalidDBClusterStateFault', `DbCluster ${c.id} is in ${c.estado} state but expected it to be one of stopped.`);
    programar(c, 'starting', DURACION_RDS.arrancar, 'available', 'arrancada');
    for (const mid of c.miembros) {
      const x = instanciaRdsDe(estado, mid);
      if (x) programar(x, 'starting', DURACION_RDS.arrancar, 'available', 'arrancada');
    }
    anotar(estado, 'RDS', 'StartDBCluster', c.id);
    return c;
  }
  if (i.estado !== 'stopped') throw errorAws('InvalidDBInstanceState', `Instance ${i.id} is not stopped.`);
  programar(i, 'starting', DURACION_RDS.arrancar, 'available', 'arrancada');
  evento(estado, i.id, 'db-instance', 'DB instance started');
  anotar(estado, 'RDS', 'StartDBInstance', i.id);
  return i;
}

/* ============================================================ borrar */

/**
 * «Delete». opciones: { snapshotFinal, nombreSnapshot, retenerRespaldos }.
 * Con Deletion protection activa, AWS no la borra. Sus réplicas se vuelven independientes.
 */
export function eliminarBaseRds(estado, id, { snapshotFinal = false, nombreSnapshot, retenerRespaldos = false } = {}) {
  iniciar(estado);
  const i = instanciaRdsDe(estado, id);
  if (!i) return eliminarClusterRds(estado, id, { snapshotFinal, nombreSnapshot, retenerRespaldos });
  if (i.estado === 'deleting') throw errorAws('InvalidDBInstanceState', `Instance ${i.id} is already being deleted.`);
  if (i.protegida) throw errorAws('InvalidParameterCombination', 'Cannot delete protected DB Instance, please disable deletion protection and try again.');
  const cluster = i.clusterId ? clusterRdsDe(estado, i.clusterId) : null;
  if (cluster?.tipo === 'multiaz') throw errorAws('InvalidParameterCombination', `Cannot delete DB instance ${i.id} because it is part of a Multi-AZ DB cluster. Delete the DB cluster instead.`);
  if (cluster && cluster.miembros.length === 1) {
    // La consola borra el clúster junto con su última instancia.
    return eliminarClusterRds(estado, cluster.id, { snapshotFinal, nombreSnapshot, retenerRespaldos });
  }
  if (snapshotFinal && !cluster) {
    if (i.rol === 'replica') throw errorAws('InvalidParameterCombination', 'FinalDBSnapshotIdentifier can not be specified when deleting a replica instance');
    if (i.estado === 'creating') throw errorAws('InvalidDBInstanceState', 'Instance is currently creating - a final snapshot cannot be taken.');
    tomarSnapshotRds(estado, { baseId: i.id, nombre: nombreSnapshot, interno: true });
  }
  // Sus réplicas se vuelven independientes; si es réplica, se suelta de su fuente.
  for (const rid of i.replicas) {
    const r = instanciaRdsDe(estado, rid);
    if (r) soltarDeFuente(estado, r);
  }
  i.replicas = [];
  if (i.rol === 'replica') soltarDeFuente(estado, i);
  // Lo de una instancia de clúster: si era la escritora, otra toma su lugar.
  if (cluster && i.rol === 'writer') {
    const otra = cluster.miembros.map((x) => instanciaRdsDe(estado, x)).find((x) => x && x !== i);
    if (otra) otra.rol = 'writer';
  }
  i.retenerRespaldos = Boolean(retenerRespaldos);
  programar(i, 'deleting', DURACION_RDS.borrar, 'deleted', 'borrada');
  evento(estado, i.id, 'db-instance', 'DB instance deleting');
  anotar(estado, 'RDS', 'DeleteDBInstance', `${i.id}${snapshotFinal ? ` con snapshot final ${nombreSnapshot}` : ' sin snapshot final'}${retenerRespaldos ? ', respaldos retenidos' : ''}`);
  return i;
}

function eliminarClusterRds(estado, id, { snapshotFinal = false, nombreSnapshot, retenerRespaldos = false } = {}) {
  const c = clusterOError(estado, id);
  if (c.estado === 'deleting') throw errorAws('InvalidDBClusterStateFault', `DB cluster ${c.id} is already being deleted.`);
  if (c.protegida) throw errorAws('InvalidParameterCombination', 'Cannot delete protected Cluster, please disable deletion protection and try again.');
  if (snapshotFinal) {
    if (c.estado === 'creating') throw errorAws('InvalidDBClusterStateFault', 'Cluster is currently creating - a final snapshot cannot be taken.');
    tomarSnapshotRds(estado, { baseId: c.id, nombre: nombreSnapshot, interno: true });
  }
  for (const mid of c.miembros) {
    const x = instanciaRdsDe(estado, mid);
    if (x) programar(x, 'deleting', DURACION_RDS.borrar, 'deleted', 'borrada');
  }
  c.retenerRespaldos = Boolean(retenerRespaldos);
  programar(c, 'deleting', DURACION_RDS.borrar, 'deleted', 'borrada');
  evento(estado, c.id, 'db-cluster', 'DB cluster deleting');
  anotar(estado, 'RDS', 'DeleteDBCluster', `${c.id}${snapshotFinal ? ` con snapshot final ${nombreSnapshot}` : ' sin snapshot final'}`);
  return c;
}

/* ============================================================ snapshots */

/** «Take snapshot» de una instancia o de un clúster (DB cluster snapshot). */
export function tomarSnapshotRds(estado, { baseId, nombre, interno = false } = {}) {
  iniciar(estado);
  const inst = instanciaRdsDe(estado, baseId);
  const cluster = inst ? null : clusterRdsDe(estado, baseId);
  if (!inst && !cluster) throw errorAws('DBInstanceNotFound', `DBInstance ${baseId ?? ''} not found.`);
  if (inst?.clusterId) throw errorAws('InvalidParameterCombination', `The specified DB instance is a member of a cluster. Take a snapshot of the DB cluster ${inst.clusterId} instead.`);
  const id = validarIdentificador(nombre, inst ? 'DBSnapshotIdentifier' : 'DBClusterSnapshotIdentifier');
  if (estado.rds.snapshots.some((s) => s.id === id)) throw errorAws(inst ? 'DBSnapshotAlreadyExists' : 'DBClusterSnapshotAlreadyExistsFault', `Cannot create the snapshot because a snapshot with the identifier ${id} already exists.`);
  const base = inst ?? cluster;
  if (!interno && !['available', 'stopped'].includes(base.estado)) {
    throw errorAws(inst ? 'InvalidDBInstanceState' : 'InvalidDBClusterStateFault', `Cannot create a snapshot because the database ${inst ? 'instance' : 'cluster'} ${base.id} is not currently in the available state.`);
  }
  const snap = nuevoSnapshot(estado, base, { id, tipo: 'manual', esCluster: Boolean(cluster) });
  programar(snap, 'creating', DURACION_RDS.snapshot, 'available', 'snapshot');
  snap.progreso = 0;
  estado.rds.snapshots.push(snap);
  if (!interno && base.estado === 'available') programar(base, 'backing-up', DURACION_RDS.snapshot, 'available', 'respaldada');
  evento(estado, id, 'db-snapshot', 'Creating manual snapshot');
  anotar(estado, 'RDS', cluster ? 'CreateDBClusterSnapshot' : 'CreateDBSnapshot', `${id} de ${base.id}`);
  return snap;
}

function nuevoSnapshot(estado, base, { id, tipo, esCluster }) {
  return {
    id,
    arn: arnRds(estado, esCluster ? 'cluster-snapshot' : 'snapshot', id),
    instanciaId: esCluster ? null : base.id,
    clusterId: esCluster ? base.id : null,
    tipo,
    motor: base.motor,
    version: base.version,
    gib: base.almacenamiento?.gib ?? 0,
    zona: base.zona ?? null,
    vpcId: base.vpcId,
    puerto: base.puerto,
    cifrado: Boolean(base.cifrada),
    llaveKms: base.cifrada ? (base.llaveKms ?? 'aws/rds') : null,
    clase: base.clase ?? null,
    publico: false,
    retenido: false,
    estado: 'available',
    progreso: 100,
    creado: iso()
  };
}

/** El snapshot automático del día (el que hace AWS en la ventana de respaldo). */
function snapshotAutomatico(estado, base, esCluster) {
  const d = new Date(reloj.ahora());
  const dos = (n) => String(n).padStart(2, '0');
  const id = `rds:${base.id}-${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}-${dos(d.getUTCHours())}-${dos(d.getUTCMinutes())}`;
  if (estado.rds.snapshots.some((s) => s.id === id)) return;
  const snap = nuevoSnapshot(estado, base, { id, tipo: 'automated', esCluster });
  estado.rds.snapshots.push(snap);
  // Como mucho 3 automáticos por base: el estado no debe crecer sin límite.
  const suyos = estado.rds.snapshots.filter((s) => s.tipo === 'automated' && (s.instanciaId ?? s.clusterId) === base.id && !s.retenido);
  if (suyos.length > 3) estado.rds.snapshots = estado.rds.snapshots.filter((s) => s !== suyos[0]);
  base.primerRespaldo ??= snap.creado;
}

export function eliminarSnapshotRds(estado, id) {
  iniciar(estado);
  const s = estado.rds.snapshots.find((x) => x.id === id);
  if (!s) throw errorAws('DBSnapshotNotFound', `DBSnapshot ${id ?? ''} not found.`);
  if (s.tipo === 'automated' && !s.retenido) throw errorAws('InvalidDBSnapshotState', 'Only manual snapshots may be deleted.');
  if (s.estado === 'creating') throw errorAws('InvalidDBSnapshotState', `Cannot delete the snapshot ${s.id} because it is being created.`);
  estado.rds.snapshots = estado.rds.snapshots.filter((x) => x !== s);
  anotar(estado, 'RDS', s.clusterId ? 'DeleteDBClusterSnapshot' : 'DeleteDBSnapshot', s.id);
}

/** «Copy snapshot»: de uno automático (o manual) sale uno manual nuevo. */
export function copiarSnapshotRds(estado, id, { nombre, cifrado } = {}) {
  iniciar(estado);
  const s = estado.rds.snapshots.find((x) => x.id === id);
  if (!s) throw errorAws('DBSnapshotNotFound', `DBSnapshot ${id ?? ''} not found.`);
  if (s.estado !== 'available') throw errorAws('InvalidDBSnapshotState', `Snapshot ${s.id} is not in available state.`);
  const nuevoNombre = validarIdentificador(nombre, 'TargetDBSnapshotIdentifier');
  if (estado.rds.snapshots.some((x) => x.id === nuevoNombre)) throw errorAws('DBSnapshotAlreadyExists', `Cannot create the snapshot because a snapshot with the identifier ${nuevoNombre} already exists.`);
  const copia = { ...s, id: nuevoNombre, arn: arnRds(estado, s.clusterId ? 'cluster-snapshot' : 'snapshot', nuevoNombre), tipo: 'manual', retenido: false, publico: false, cifrado: s.cifrado || Boolean(cifrado), llaveKms: s.cifrado ? (s.llaveKms ?? 'aws/rds') : cifrado ? 'aws/rds' : null, creado: iso() };
  programar(copia, 'creating', DURACION_RDS.snapshot, 'available', 'snapshot');
  copia.progreso = 0;
  estado.rds.snapshots.push(copia);
  anotar(estado, 'RDS', 'CopyDBSnapshot', `${s.id} → ${nuevoNombre}`);
  return copia;
}

/** «Share snapshot»: Private o Public. Un snapshot cifrado no se puede hacer público. */
export function compartirSnapshotRds(estado, id, { publico } = {}) {
  iniciar(estado);
  const s = estado.rds.snapshots.find((x) => x.id === id);
  if (!s) throw errorAws('DBSnapshotNotFound', `DBSnapshot ${id ?? ''} not found.`);
  if (s.tipo !== 'manual') throw errorAws('InvalidDBSnapshotState', 'Only manual snapshots can be shared. Copy the automated snapshot first.');
  if (publico && s.cifrado) throw errorAws('InvalidParameterValue', 'Encrypted snapshots cannot be shared publicly.');
  s.publico = Boolean(publico);
  anotar(estado, 'RDS', 'ModifyDBSnapshotAttribute', `${s.id} ${s.publico ? 'público (all)' : 'privado'}`);
  return s;
}

/* ============================================================ restaurar */

/** Las horas entre las que se puede restaurar una base (Earliest / Latest restorable time). */
export function ventanaRestauracionRds(estado, base, ahora = reloj.ahora()) {
  if (!base?.primerRespaldo || !base.retencion) return null;
  const desde = Date.parse(base.primerRespaldo);
  const hasta = Math.max(desde, ahora - 5 * 60 * 1000);
  return { desde: new Date(desde).toISOString(), hasta: new Date(hasta).toISOString() };
}

/**
 * «Restore to point in time»: crea OTRA base con los datos de `fuenteId` en
 * `momento` ('latest' o una fecha ISO dentro de la ventana). p como crearBaseRds
 * (id, clase, despliegue, grupoSubredes, publica, gruposSeguridad, zona, protegida).
 */
export function restaurarPuntoRds(estado, fuenteId, { momento = 'latest', ...p } = {}) {
  iniciar(estado);
  const base = instanciaRdsDe(estado, fuenteId) ?? clusterRdsDe(estado, fuenteId);
  // Se puede restaurar también desde los respaldos retenidos de una base ya borrada.
  const retenido = !base ? estado.rds.snapshots.find((s) => s.retenido && (s.instanciaId === fuenteId || s.clusterId === fuenteId)) : null;
  if (!base && !retenido) throw errorAws('DBInstanceAutomatedBackupNotFound', `No automated backups found for ${fuenteId ?? ''}.`);
  if (base?.clusterId) throw errorAws('InvalidParameterCombination', `Restore the DB cluster ${base.clusterId} instead of its instance.`);
  const v = base ? ventanaRestauracionRds(estado, base) : { desde: retenido.creado, hasta: retenido.creado };
  if (!v) {
    throw errorAws('InvalidDBInstanceState', 'Automated backups are not enabled for this database instance. To enable automated backups, use ModifyDBInstance to set the backup retention period to a non-zero value.');
  }
  if (momento !== 'latest') {
    const t = Date.parse(momento);
    if (Number.isNaN(t) || t < Date.parse(v.desde) || t > Date.parse(v.hasta)) {
      throw errorAws('InvalidRestoreFault', `The restore time must be between the earliest restorable time (${v.desde}) and the latest restorable time (${v.hasta}).`);
    }
  }
  const origen = base ?? retenido;
  const r = restaurarDesde(estado, origen, p);
  anotar(estado, 'RDS', base?.miembros ? 'RestoreDBClusterToPointInTime' : 'RestoreDBInstanceToPointInTime', `${r.id} desde ${fuenteId} al momento ${momento === 'latest' ? 'Latest restorable time' : momento}`);
  return r;
}

/** «Restore snapshot»: una base nueva desde un snapshot available. */
export function restaurarSnapshotRds(estado, snapId, p = {}) {
  iniciar(estado);
  const s = estado.rds.snapshots.find((x) => x.id === snapId);
  if (!s) throw errorAws('DBSnapshotNotFound', `DBSnapshot ${snapId ?? ''} not found.`);
  if (s.estado !== 'available') throw errorAws('InvalidDBSnapshotState', `Snapshot ${s.id} is not in available state.`);
  const r = restaurarDesde(estado, s, p);
  anotar(estado, 'RDS', s.clusterId ? 'RestoreDBClusterFromSnapshot' : 'RestoreDBInstanceFromDBSnapshot', `${r.id} desde ${s.id}`);
  return r;
}

/** Lo común de restaurar: una base nueva con el motor y el tamaño de su origen. */
function restaurarDesde(estado, origen, p) {
  const esCluster = Boolean(origen.miembros || origen.clusterId);
  if (esCluster) {
    const c = origen.miembros ? origen : clusterRdsDe(estado, origen.clusterId);
    const clase = p.clase ?? c?.clase ?? origen.clase ?? (esAurora(origen.motor) ? 'db.serverless' : 'db.m5d.large');
    return crearClusterRds(estado, {
      motor: origen.motor,
      version: origen.version,
      plantilla: c?.plantilla ?? 'devtest',
      id: p.id,
      usuario: c?.usuario ?? motorRds(origen.motor).usuario,
      credenciales: 'secrets',
      clase,
      serverless: c?.serverless ?? (clase === 'db.serverless' ? { min: 0, max: 4 } : null),
      vpcId: p.vpcId ?? origen.vpcId,
      grupoSubredes: p.grupoSubredes ?? c?.grupoSubredes,
      publica: p.publica ?? false,
      gruposSeguridad: p.gruposSeguridad,
      puerto: origen.puerto,
      retencion: c?.retencion || 1,
      cifrada: origen.cifrada ?? origen.cifrado,
      llaveKms: origen.llaveKms ?? undefined,
      protegida: p.protegida,
      replicaAurora: false
    });
  }
  const m = motorRds(origen.motor);
  const id = validarIdentificador(p.id, 'DBInstanceIdentifier');
  if (identificadorUsado(estado, id)) throw errorAws('DBInstanceAlreadyExists', 'DB instance already exists');
  const clase = claseRds(p.clase ?? origen.clase ?? 'db.t3.micro');
  if (!clase || !clase.donde.includes('instancia')) throw errorAws('InvalidParameterCombination', `RDS does not support creating a DB instance with the following combination: DBInstanceClass=${p.clase}, Engine=${origen.motor}.`);
  const plantilla = origen.plantilla ?? 'devtest';
  const multiAz = plantilla !== 'freetier' && p.despliegue === 'multiaz';
  const red = prepararRed(estado, {
    vpcId: p.vpcId ?? origen.vpcId,
    grupoSubredes: p.grupoSubredes ?? origen.grupoSubredes,
    zona: p.zona,
    multiAz,
    publica: p.publica ?? false,
    gruposSeguridad: p.gruposSeguridad ?? [],
    puerto: origen.puerto ?? m.puerto
  });
  const gib = origen.almacenamiento?.gib ?? origen.gib ?? 20;
  const inst = nuevaInstancia(estado, {
    ...red,
    id,
    motor: origen.motor,
    version: origen.version,
    clase: clase.clase,
    plantilla,
    despliegue: multiAz ? 'multiaz' : 'single',
    almacenamiento: origen.almacenamiento ? { ...origen.almacenamiento } : { tipo: 'gp3', gib, iops: 3000, autoescalado: true, maximo: Math.max(1000, gib + 1) },
    usuario: origen.usuario ?? m.usuario,
    credenciales: origen.credenciales ?? 'self',
    nombreBase: origen.nombreBase ?? null,
    retencion: origen.retencion ?? 7,
    cifrada: origen.cifrada ?? origen.cifrado,
    llaveKms: origen.llaveKms ?? undefined,
    protegida: Boolean(p.protegida)
  });
  programar(inst, 'creating', DURACION_RDS.crear, inst.retencion > 0 ? 'backing-up' : 'available', 'creada');
  estado.rds.instancias.push(inst);
  evento(estado, id, 'db-instance', 'Restored from snapshot');
  return inst;
}

/** «Set up EC2 connection»: crea el par de grupos y se los pone a la base y a la instancia EC2. */
export function conectarEc2Rds(estado, baseId, instanciaId) {
  iniciar(estado);
  const base = instanciaRdsDe(estado, baseId) ?? clusterRdsDe(estado, baseId);
  if (!base) throw errorAws('DBInstanceNotFound', `DBInstance ${baseId ?? ''} not found.`);
  const inst = instanciaDe(estado, instanciaId);
  if (!inst || inst.estado === 'terminated') throw errorAws('InvalidParameterValue', `The EC2 instance ${instanciaId} does not exist or is terminated.`);
  if (inst.vpcId !== base.vpcId) throw errorAws('InvalidParameterCombination', `The EC2 instance ${inst.id} must be in the same VPC as the database (${base.vpcId}).`);
  if (!['available', 'stopped'].includes(base.estado)) throw errorAws('InvalidDBInstanceState', `Database ${base.id} is not in available state.`);
  const par = crearParConexion(estado, base.vpcId, base.puerto);
  base.gruposSeguridad = [...base.gruposSeguridad, par.rdsEc2];
  for (const mid of base.miembros ?? []) {
    const x = instanciaRdsDe(estado, mid);
    if (x) x.gruposSeguridad = [...base.gruposSeguridad];
  }
  conectarGrupos(estado, base, inst.id, par);
  anotar(estado, 'RDS', 'Set up EC2 connection', `${base.id} ↔ ${inst.id} (${par.rdsEc2}, ${par.ec2Rds})`);
  return base;
}

/* ======================================================= ¿se conecta? */

const cubrePuerto = (r, puerto) => r.protocolo === '-1' || (r.protocolo === 'tcp' && r.desde <= puerto && puerto <= r.hasta);

/** ¿Alguna regla de esos grupos deja pasar el puerto desde/hacia el otro lado (por IP o por grupo)? */
function reglaQuePermite(estado, grupos, sentido, puerto, ip, gruposOtroLado) {
  for (const gid of grupos) {
    const g = grupoDe(estado, gid);
    for (const r of g?.[sentido] ?? []) {
      if (!cubrePuerto(r, puerto)) continue;
      if (String(r.origen).startsWith('sg-') ? gruposOtroLado.includes(r.origen) : ip && ipEnCidr(ip, r.origen)) return { grupo: g, regla: r };
    }
  }
  return null;
}

function naclDeja(nacl, sentido, puerto, ip) {
  if (!nacl) return true;
  for (const r of [...nacl[sentido]].sort((a, b) => a.numero - b.numero)) {
    const cubre = r.protocolo === '-1' || (r.protocolo === 'tcp' && r.desde <= puerto && puerto <= r.hasta);
    if (cubre && ipEnCidr(ip, r.cidr)) return r.accion === 'allow';
  }
  return false;
}

const ACTIVAS = ['available', 'backing-up', 'modifying', 'configuring-enhanced-monitoring', 'storage-optimization'];

/**
 * ¿La instancia EC2 llega a la base por la red? Función pura (no cambia el
 * estado): misma VPC, base encendida, grupo de seguridad de la base que deje
 * entrar el puerto del motor (3306/5432) desde la instancia (por su grupo o
 * por su IP), salida de la instancia hacia la base y NACL de ambas subredes.
 * baseId puede ser una instancia de RDS o un clúster (se usa la escritora).
 * Devuelve { ok, motivo, puerto }; `motivo` va en español para el docente.
 */
export function conexionBase(estado, instanciaId, baseId) {
  const inst = instanciaDe(estado, instanciaId);
  if (!inst || inst.estado === 'terminated') return { ok: false, motivo: `La instancia EC2 ${instanciaId ?? ''} no existe o está terminada.`, puerto: null };
  let base = instanciaRdsDe(estado, baseId);
  const cluster = base ? null : clusterRdsDe(estado, baseId);
  if (cluster) base = cluster.miembros.map((x) => instanciaRdsDe(estado, x)).find((x) => x?.rol === 'writer') ?? null;
  if (!base) return { ok: false, motivo: `No existe la base ${baseId ?? ''} (o su clúster no tiene instancia escritora).`, puerto: null };
  const puerto = base.puerto;
  if (inst.estado !== 'running') return { ok: false, motivo: `La instancia ${inst.id} no está encendida (estado ${inst.estado}).`, puerto };
  if (!ACTIVAS.includes(base.estado)) return { ok: false, motivo: `La base ${base.id} no está disponible (estado ${base.estado}).`, puerto };
  if (cluster?.expres) return { ok: false, motivo: `El clúster ${cluster.id} usa la configuración exprés: se entra por su internet access gateway con IAM, no desde la VPC.`, puerto };
  if (inst.vpcId !== base.vpcId) return { ok: false, motivo: `La instancia está en ${inst.vpcId} y la base en ${base.vpcId}: viven en VPC distintas y no se ven.`, puerto };

  const gruposBase = cluster ? cluster.gruposSeguridad : base.gruposSeguridad;
  const entrada = reglaQuePermite(estado, gruposBase, 'entrada', puerto, inst.ipPrivada, inst.gruposSeguridad);
  if (!entrada) {
    return { ok: false, motivo: `Ningún grupo de seguridad de la base (${gruposBase.join(', ') || 'ninguno'}) deja entrar TCP ${puerto} desde la instancia: agrega una regla con origen en el grupo de la instancia o en su IP privada.`, puerto };
  }
  const salida = reglaQuePermite(estado, inst.gruposSeguridad, 'salida', puerto, base.ipPrivada, gruposBase);
  if (!salida) return { ok: false, motivo: `Los grupos de seguridad de la instancia no la dejan salir hacia la base por TCP ${puerto}.`, puerto };

  const subI = subredDe(estado, inst.subredId);
  const subB = subredDe(estado, base.subredId);
  if (subI && subB && subI.id !== subB.id) {
    const nI = naclDeSubred(estado, subI.id);
    const nB = naclDeSubred(estado, subB.id);
    if (!naclDeja(nI, 'salida', puerto, base.ipPrivada)) return { ok: false, motivo: `La NACL ${nI.id} de la subred de la instancia no deja salir TCP ${puerto} hacia la base.`, puerto };
    if (!naclDeja(nB, 'entrada', puerto, inst.ipPrivada)) return { ok: false, motivo: `La NACL ${nB.id} de la subred de la base no deja entrar TCP ${puerto} desde la instancia.`, puerto };
    if (!naclDeja(nB, 'salida', 50000, inst.ipPrivada)) return { ok: false, motivo: `La NACL ${nB.id} de la subred de la base no deja salir la respuesta (puertos efímeros 1024-65535).`, puerto };
    if (!naclDeja(nI, 'entrada', 50000, base.ipPrivada)) return { ok: false, motivo: `La NACL ${nI.id} de la subred de la instancia no deja entrar la respuesta (puertos efímeros 1024-65535).`, puerto };
  }
  return { ok: true, motivo: `La instancia ${inst.id} llega a ${base.endpoint}:${puerto} (regla ${entrada.regla.id} del grupo ${entrada.grupo.nombre}).`, puerto };
}

/* ============================================================ costos */

/** Dólares por hora de una instancia de RDS (Multi-AZ cuesta el doble), sin almacenamiento. */
export function costoHoraRds(instancia) {
  if (!instancia || ['stopped', 'stopping', 'deleting'].includes(instancia.estado)) return 0;
  const k = claseRds(instancia.clase);
  if (!k) return 0;
  if (k.clase === 'db.serverless') return k.precio * 0.5;
  return k.precio * (instancia.multiAz ? 2 : 1);
}

/** Dólares al mes del almacenamiento de una instancia (Multi-AZ, el doble). */
export const costoMesAlmacenamientoRds = (instancia) => (instancia?.almacenamiento?.gib ?? 0) * (PRECIO_GIB[instancia?.almacenamiento?.tipo] ?? 0.115) * (instancia?.multiAz ? 2 : 1);

/** Dólares por hora de una caché (serverless: el mínimo de 1 GB de datos y algo de ECPU). */
export function costoHoraElasticache(cache) {
  if (!cache || cache.estado !== 'available') return 0;
  if (cache.despliegue === 'serverless') return cache.motor === 'valkey' ? 0.084 : 0.125;
  const t = CLASES_CACHE.find((c) => c.tipo === cache.tipoNodo);
  return (t?.precio ?? 0.017) * (cache.nodos ?? 1) * (1 + (cache.replicas ?? 0));
}

/** CPU sintética de una base: estable (sale de su id) y de 2 a 12 %. Para las listas y Monitoring. */
export function cpuRds(instancia, ahora = reloj.ahora()) {
  if (!instancia || !['available', 'backing-up', 'modifying'].includes(instancia.estado)) return null;
  let h = 7;
  for (const ch of instancia.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const base = 2 + (h % 900) / 100;
  const onda = Math.sin(ahora / 40000 + (h % 13)) * 0.8;
  return Math.max(0.5, Math.round((base + onda) * 100) / 100);
}

/* ============================================================ ElastiCache */

const NOMBRE_CACHE = /^[a-z](?!.*--)[a-z0-9-]{0,39}$/;

/**
 * «Create cache». p: { nombre, motor: 'valkey'|'redis'|'memcached', despliegue: 'serverless'|'propio',
 * descripcion, version, vpcId, subredes, gruposSeguridad, limites: { datosGb, ecpu },
 * tipoNodo, nodos, replicas, multiAz, retencionRespaldo }
 */
export function crearCacheElasticache(estado, p = {}) {
  iniciar(estado);
  const m = motorCache(p.motor ?? 'valkey');
  if (!m) throw errorAws('InvalidParameterValue', `Invalid engine: ${p.motor}`);
  const despliegue = p.despliegue === 'propio' ? 'propio' : 'serverless';
  const nombre = String(p.nombre ?? '').trim().toLowerCase();
  if (!nombre) throw errorAws('MissingParameter', `The request must contain the parameter ${despliegue === 'serverless' ? 'ServerlessCacheName' : 'ReplicationGroupId'}.`);
  if (!NOMBRE_CACHE.test(nombre) || nombre.endsWith('-')) {
    throw errorAws('InvalidParameterValue', `The parameter ${despliegue === 'serverless' ? 'ServerlessCacheName' : 'CacheClusterId'} is not a valid identifier. Identifiers must begin with a letter; must contain only ASCII letters, digits, and hyphens; and must not end with a hyphen or contain two consecutive hyphens. Maximum length: 40 characters.`);
  }
  if (cacheDe(estado, nombre)) throw errorAws(despliegue === 'serverless' ? 'ServerlessCacheAlreadyExistsFault' : 'CacheClusterAlreadyExists', `Cache with name ${nombre} already exists.`);
  const version = p.version && m.versiones.includes(p.version) ? p.version : m.versiones[0];
  const vpc = vpcDe(estado, p.vpcId ?? estado.vpcs.find((v) => v.porDefecto)?.id);
  if (!vpc) throw errorAws('InvalidVPCNetworkStateFault', 'No default VPC for this user. Choose a VPC.');
  let subredes = [...new Set(p.subredes ?? [])];
  if (!subredes.length) subredes = estado.subredes.filter((s) => s.vpcId === vpc.id).slice(0, 3).map((s) => s.id);
  for (const id of subredes) {
    const s = subredDe(estado, id);
    if (!s || s.vpcId !== vpc.id) throw errorAws('InvalidSubnet', `The subnet ID '${id}' does not exist in VPC ${vpc.id}.`);
  }
  const zonas = new Set(subredes.map((id) => subredDe(estado, id).az));
  if (despliegue === 'serverless' && zonas.size < 2) throw errorAws('InvalidParameterValue', 'Serverless caches require subnets in at least 2 Availability Zones.');
  let grupos = [...new Set(p.gruposSeguridad ?? [])];
  for (const g of grupos) {
    const x = grupoDe(estado, g);
    if (!x || x.vpcId !== vpc.id) throw errorAws('InvalidParameterValue', `Invalid security group ${g} for VPC ${vpc.id}.`);
  }
  if (!grupos.length) grupos = estado.gruposSeguridad.filter((g) => g.vpcId === vpc.id && g.porDefecto).map((g) => g.id);

  let limites = null;
  let tipoNodo = null;
  let nodos = 1;
  let replicas = 0;
  if (despliegue === 'serverless') {
    if (p.limites) {
      const datosGb = p.limites.datosGb === '' || p.limites.datosGb == null ? null : Number(p.limites.datosGb);
      const ecpu = p.limites.ecpu === '' || p.limites.ecpu == null ? null : Number(p.limites.ecpu);
      if (datosGb !== null && !(datosGb >= 1 && datosGb <= 5000)) throw errorAws('InvalidParameterValue', 'Maximum data storage must be between 1 and 5000 GB.');
      if (ecpu !== null && !(ecpu >= 1000 && ecpu <= 15000000)) throw errorAws('InvalidParameterValue', 'Maximum ECPU per second must be between 1000 and 15000000.');
      limites = { datosGb, ecpu };
    }
  } else {
    tipoNodo = CLASES_CACHE.some((c) => c.tipo === p.tipoNodo) ? p.tipoNodo : 'cache.t4g.micro';
    if (m.motor === 'memcached') {
      nodos = Number(p.nodos ?? 1);
      if (!Number.isInteger(nodos) || nodos < 1 || nodos > 60) throw errorAws('InvalidParameterValue', 'The number of cache nodes must be between 1 and 60.');
    } else {
      replicas = Number(p.replicas ?? 1);
      if (!Number.isInteger(replicas) || replicas < 0 || replicas > 5) throw errorAws('InvalidParameterValue', 'The number of replicas per shard must be between 0 and 5.');
      if (p.multiAz && replicas < 1) throw errorAws('InvalidParameterCombination', 'Multi-AZ requires at least one replica.');
    }
  }
  const sufijo = hexAzar(6);
  const endpoint =
    despliegue === 'serverless'
      ? `${nombre}-${sufijo}.serverless.use1.cache.amazonaws.com`
      : m.motor === 'memcached'
        ? `${nombre}.${sufijo}.cfg.use1.cache.amazonaws.com`
        : `master.${nombre}.${sufijo}.use1.cache.amazonaws.com`;
  const cache = {
    nombre,
    arn: `arn:aws:elasticache:us-east-1:${estado.cuenta.id}:${despliegue === 'serverless' ? 'serverlesscache' : m.motor === 'memcached' ? 'cluster' : 'replicationgroup'}:${nombre}`,
    motor: m.motor,
    version,
    despliegue,
    descripcion: nombreLimpio(p.descripcion, 255),
    vpcId: vpc.id,
    subredes,
    gruposSeguridad: grupos,
    limites,
    tipoNodo,
    nodos,
    replicas,
    multiAz: despliegue === 'serverless' ? true : Boolean(p.multiAz),
    retencionRespaldo: m.motor === 'memcached' ? 0 : Math.max(0, Math.min(35, Number(p.retencionRespaldo ?? (despliegue === 'serverless' ? 0 : 1)) || 0)),
    endpoint,
    // Serverless lee por el mismo endpoint en el puerto 6380; el diseñado a mano tiene su endpoint de lectura.
    endpointLectura: m.motor === 'memcached' ? null : despliegue === 'serverless' ? endpoint : `replica.${nombre}.${sufijo}.use1.cache.amazonaws.com`,
    puerto: m.puerto,
    estado: 'creating',
    creado: iso()
  };
  if (despliegue === 'serverless' && m.motor !== 'memcached') cache.puertoLectura = 6380;
  programar(cache, 'creating', DURACION_RDS.cacheCrear, 'available', 'cache');
  estado.elasticache.caches.push(cache);
  anotar(estado, 'ElastiCache', despliegue === 'serverless' ? 'CreateServerlessCache' : m.motor === 'memcached' ? 'CreateCacheCluster' : 'CreateReplicationGroup', `${nombre} ${m.nombre} ${version} ${despliegue}${tipoNodo ? ` ${tipoNodo}` : ''} en ${vpc.id}`);
  return cache;
}

export function eliminarCacheElasticache(estado, nombre, { respaldoFinal } = {}) {
  iniciar(estado);
  const c = cacheDe(estado, nombre);
  if (!c) throw errorAws('CacheClusterNotFound', `Cache ${nombre ?? ''} not found.`);
  if (c.estado === 'creating') throw errorAws('InvalidServerlessCacheStateFault', `Cache ${c.nombre} is not in available state.`);
  if (c.estado === 'deleting') throw errorAws('InvalidServerlessCacheStateFault', `Cache ${c.nombre} is already being deleted.`);
  programar(c, 'deleting', DURACION_RDS.cacheBorrar, 'deleted', 'cacheBorrada');
  anotar(estado, 'ElastiCache', c.despliegue === 'serverless' ? 'DeleteServerlessCache' : 'DeleteReplicationGroup', `${c.nombre}${respaldoFinal ? ` con respaldo final ${respaldoFinal}` : ''}`);
  return c;
}

/* ============================================================ el tiempo */

/** Qué pasa cuando termina una transición de una instancia de RDS. Devuelve 'borrar' si ya no existe. */
function pasoInstancia(estado, i) {
  const tras = i.tras;
  const fin = i.hasta;
  const siguiente = i.siguiente;
  terminarTransicion(i);
  i.estado = siguiente;
  switch (tras) {
    case 'creada':
    case 'promovida':
      if (siguiente === 'backing-up') {
        evento(estado, i.id, 'db-instance', 'Backing up DB instance');
        programar(i, 'backing-up', DURACION_RDS.respaldoInicial, 'available', 'respaldoInicial', fin);
      } else evento(estado, i.id, 'db-instance', tras === 'promovida' ? 'Promoted Read Replica to a stand-alone database instance' : 'DB instance created');
      break;
    case 'respaldoInicial':
      snapshotAutomatico(estado, i, false);
      evento(estado, i.id, 'db-instance', 'Finished DB Instance backup');
      break;
    case 'replica':
      evento(estado, i.id, 'db-instance', 'Replication for the Read Replica resumed');
      break;
    case 'miembro':
      evento(estado, i.id, 'db-instance', 'DB instance created');
      break;
    case 'modificada': {
      const c = i.cambiosEnCurso ?? {};
      delete i.cambiosEnCurso;
      const paso = aplicarCambios(estado, i, c);
      evento(estado, i.id, 'db-instance', 'Finished applying modification to DB instance');
      if (paso === 'respaldar') programar(i, 'backing-up', DURACION_RDS.respaldoInicial, 'available', 'respaldoInicial', fin);
      break;
    }
    case 'failover': {
      [i.zona, i.zonaSecundaria] = [i.zonaSecundaria, i.zona];
      [i.subredId, i.subredSecundaria] = [i.subredSecundaria, i.subredId];
      const s = subredDe(estado, i.subredId);
      if (s) i.ipPrivada = ipPrivadaNueva(estado, s);
      evento(estado, i.id, 'db-instance', 'Multi-AZ instance failover completed');
      break;
    }
    case 'reiniciada':
      evento(estado, i.id, 'db-instance', 'DB instance restarted');
      break;
    case 'respaldada':
      break;
    case 'detenida':
      evento(estado, i.id, 'db-instance', 'DB instance stopped');
      break;
    case 'arrancada':
      evento(estado, i.id, 'db-instance', 'DB instance started');
      break;
    case 'borrada':
      return 'borrar';
    default:
      break;
  }
  return null;
}

function pasoCluster(estado, c) {
  const tras = c.tras;
  const fin = c.hasta;
  const siguiente = c.siguiente;
  terminarTransicion(c);
  c.estado = siguiente;
  if (tras === 'creada' && siguiente === 'backing-up') programar(c, 'backing-up', DURACION_RDS.respaldoInicial, 'available', 'respaldoInicial', fin);
  else if (tras === 'respaldoInicial') snapshotAutomatico(estado, c, true);
  else if (tras === 'borrada') return 'borrar';
  return null;
}

/** Al borrar: fuera la base; sus automáticos se quedan solo si pidió retenerlos. */
function quitarBase(estado, base, esCluster) {
  const retener = Boolean(base.retenerRespaldos);
  estado.rds.snapshots = estado.rds.snapshots
    .filter((s) => !(s.tipo === 'automated' && (esCluster ? s.clusterId : s.instanciaId) === base.id) || retener)
    .map((s) => (s.tipo === 'automated' && (esCluster ? s.clusterId : s.instanciaId) === base.id ? { ...s, retenido: true } : s));
  if (esCluster) {
    estado.rds.clusteres = estado.rds.clusteres.filter((c) => c !== base);
    estado.rds.instancias = estado.rds.instancias.filter((i) => i.clusterId !== base.id);
    evento(estado, base.id, 'db-cluster', 'DB cluster deleted');
  } else {
    estado.rds.instancias = estado.rds.instancias.filter((i) => i !== base);
    const c = base.clusterId ? clusterRdsDe(estado, base.clusterId) : null;
    if (c) c.miembros = c.miembros.filter((x) => x !== base.id);
    evento(estado, base.id, 'db-instance', 'DB instance deleted');
  }
}

function avanzarRds(estado, ahora) {
  iniciar(estado);
  let cambio = false;
  // Varias vueltas: si pasó mucho tiempo, creating → backing-up → available se resuelve de una vez.
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    let hubo = false;
    for (const i of [...estado.rds.instancias]) {
      if (!i.hasta || i.hasta > ahora) continue;
      hubo = true;
      if (pasoInstancia(estado, i) === 'borrar') quitarBase(estado, i, false);
    }
    for (const c of [...estado.rds.clusteres]) {
      if (!c.hasta || c.hasta > ahora) continue;
      hubo = true;
      if (pasoCluster(estado, c) === 'borrar') quitarBase(estado, c, true);
    }
    if (!hubo) break;
    cambio = true;
  }
  for (const s of estado.rds.snapshots) {
    if (s.estado !== 'creating') continue;
    const total = s.hasta - s.desde;
    const progreso = s.hasta <= ahora ? 100 : Math.max(0, Math.min(99, Math.floor(((ahora - s.desde) / total) * 100)));
    if (progreso !== s.progreso) {
      s.progreso = progreso;
      cambio = true;
    }
    if (s.hasta <= ahora) {
      s.estado = 'available';
      terminarTransicion(s);
      evento(estado, s.id, 'db-snapshot', 'Manual snapshot created');
      cambio = true;
    }
  }
  for (const c of [...estado.elasticache.caches]) {
    if (!c.hasta || c.hasta > ahora) continue;
    const tras = c.tras;
    c.estado = c.siguiente;
    terminarTransicion(c);
    if (tras === 'cacheBorrada') estado.elasticache.caches = estado.elasticache.caches.filter((x) => x !== c);
    cambio = true;
  }
  return cambio;
}

/* ======================================================= dependencias */

const vivaRds = (x) => x.estado !== 'deleted';

function dependenciasVpc(estado, vpcId) {
  iniciar(estado);
  const base = estado.rds.instancias.find((i) => i.vpcId === vpcId && vivaRds(i));
  if (base) throw errorAws('DependencyViolation', `The vpc '${vpcId}' has dependencies and cannot be deleted. Delete the RDS DB instance '${base.id}' first.`);
  const cache = estado.elasticache.caches.find((c) => c.vpcId === vpcId);
  if (cache) throw errorAws('DependencyViolation', `The vpc '${vpcId}' has dependencies and cannot be deleted. Delete the ElastiCache cache '${cache.nombre}' first.`);
  const grupo = estado.rds.gruposSubredes.find((g) => g.vpcId === vpcId);
  if (grupo) throw errorAws('DependencyViolation', `The vpc '${vpcId}' has dependencies and cannot be deleted. Delete the DB subnet group '${grupo.nombre}' first (RDS → Subnet groups).`);
}

function dependenciasSubred(estado, subredId) {
  iniciar(estado);
  const base = estado.rds.instancias.find((i) => (i.subredId === subredId || i.subredSecundaria === subredId) && vivaRds(i));
  if (base) throw errorAws('DependencyViolation', `The subnet '${subredId}' has dependencies and cannot be deleted. It is used by the RDS DB instance '${base.id}'.`);
  const cache = estado.elasticache.caches.find((c) => c.subredes.includes(subredId));
  if (cache) throw errorAws('DependencyViolation', `The subnet '${subredId}' has dependencies and cannot be deleted. It is used by the ElastiCache cache '${cache.nombre}'.`);
  const grupo = estado.rds.gruposSubredes.find((g) => g.subredes.includes(subredId));
  if (grupo) throw errorAws('DependencyViolation', `The subnet '${subredId}' has dependencies and cannot be deleted. Remove it from the DB subnet group '${grupo.nombre}' first.`);
}

function dependenciasGrupo(estado, sgId) {
  iniciar(estado);
  const base = estado.rds.instancias.find((i) => i.gruposSeguridad.includes(sgId) && vivaRds(i)) ?? estado.rds.clusteres.find((c) => c.gruposSeguridad.includes(sgId));
  if (base) throw errorAws('DependencyViolation', `resource ${sgId} has a dependent object (used by the RDS database ${base.id})`);
  const cache = estado.elasticache.caches.find((c) => c.gruposSeguridad.includes(sgId));
  if (cache) throw errorAws('DependencyViolation', `resource ${sgId} has a dependent object (used by the ElastiCache cache ${cache.nombre})`);
}

registrarExtension({
  id: 'rds',
  orden: 50,
  iniciar,
  avanzar: avanzarRds,
  dependenciasVpc,
  dependenciasSubred,
  dependenciasGrupo,
  funciones: {
    conexionBase,
    baseRdsDe: (estado, id) => instanciaRdsDe(estado, id) ?? clusterRdsDe(estado, id),
    costoHoraRds,
    costoHoraElasticache,
    cpuRds
  }
});

