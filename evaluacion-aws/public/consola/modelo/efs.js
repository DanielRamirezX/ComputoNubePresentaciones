// ---------------------------------------------------------------------------
// AMAZON ELASTIC FILE SYSTEM (EFS)
//
// Los sistemas de archivos compartidos de la cuenta simulada: una «carpeta en
// red» que muchas instancias Linux montan a la vez por NFS (puerto 2049).
//
//   - «Create file system» rápido (Regional, con un mount target por zona de la
//     VPC y su grupo de seguridad por omisión) o personalizado: Regional o One
//     Zone, respaldos automáticos, ciclo de vida (Infrequent Access, Archive y
//     de regreso a Standard), cifrado con aws/elasticfilesystem o una llave
//     propia de KMS, modo de throughput (Elastic, Provisioned, Bursting) y de
//     rendimiento (General Purpose, Max I/O), mount targets por zona con sus
//     grupos de seguridad y la política del sistema de archivos.
//   - Igual que AWS, nada es instantáneo: el sistema pasa de creating a
//     available en 5 s (DURACION_EFS) y cada mount target, en 8 s.
//   - «Attach» muestra los comandos `mount` (comandosMontajeEfs).
//   - montajeEfs(estado, instanciaId, efsId) es una función PURA que dice si la
//     instancia llega al sistema por NFS 2049 (VPC, mount target, grupos de
//     seguridad y NACL). La usan las rúbricas.
//   - Delete hace lo que la consola: borra primero los mount targets y luego el
//     sistema de archivos (deleting → desaparece).
//
// La forma de la colección (campos en español; valores de AWS tal cual):
//
// estado.efs = {
//   sistemas: [{
//     id: 'fs-0…', arn: 'arn:aws:elasticfilesystem:us-east-1:<cuenta>:file-system/fs-0…', nombre,
//     tipo: 'regional' | 'one-zone', zona: null | 'us-east-1a', unaZona (true en One Zone),
//     estado: 'creating' | 'available' | 'updating' | 'deleting', hasta?, siguiente?,
//     rendimiento: 'generalPurpose' | 'maxIO', throughput: 'elastic' | 'provisioned' | 'bursting', mibps | null,
//     cifrado, llaveKms (id de la llave de KMS) | null, respaldos,
//     ciclo: { ia: 'AFTER_30_DAYS' | … | null, archivo: 'AFTER_90_DAYS' | … | null, estandar: 'AFTER_1_ACCESS' | null },
//     tamano (bytes medidos; 6 KiB al nacer), politica: null | texto JSON,
//     vpcId | null (la de sus mount targets),
//     montajes: [{ id: 'fsmt-0…', zona, subredId, vpcId, ip, eni: 'eni-0…', gruposSeguridad: [sgId],
//                  estado: 'creating' | 'available' | 'deleting', hasta?, siguiente?, creado }],
//     etiquetas: [{ llave, valor }], creado
//   }]
// }
//
// Ofrece por llamar(): montajeEfs, sistemaEfsDe.
//
// Regla del ciclo de módulos: nada de lo importado de modelo.js se usa en el
// nivel superior de este archivo, solo dentro de funciones.
// ---------------------------------------------------------------------------

import { registrarExtension, llamar } from './registro.js';
import { anotar, errorAws, grupoDe, instanciaDe, ipEnCidr, ipPrivadaNueva, iso, naclDeSubred, nombreLimpio, nuevoId, parsearCidr, enteroAIp, ipAEntero, reloj, subredDe, vpcDe } from '../modelo.js';

/* ============================================================ tiempos y límites */

/** Cuánto tarda cada transición de EFS en el simulador (ms). */
export const DURACION_EFS = {
  sistema: 5000, // creating → available
  montaje: 8000, // mount target creating → available
  borrado: 4000 // deleting → desaparece
};

export const LIMITES_EFS = {
  sistemasMax: 20, // del simulador (AWS: 1,000 por región)
  gruposPorMontaje: 5,
  mibpsMin: 1,
  mibpsMax: 3414
};

/** Las opciones de «Transition into …» de Lifecycle management, como en la consola. */
export const TRANSICIONES_IA = ['AFTER_1_DAY', 'AFTER_7_DAYS', 'AFTER_14_DAYS', 'AFTER_30_DAYS', 'AFTER_60_DAYS', 'AFTER_90_DAYS', 'AFTER_180_DAYS', 'AFTER_270_DAYS', 'AFTER_365_DAYS'];
export const TRANSICIONES_ARCHIVO = ['AFTER_1_DAY', 'AFTER_7_DAYS', 'AFTER_14_DAYS', 'AFTER_30_DAYS', 'AFTER_60_DAYS', 'AFTER_90_DAYS', 'AFTER_180_DAYS', 'AFTER_270_DAYS', 'AFTER_365_DAYS'];

/** 'AFTER_30_DAYS' → '30 day(s) since last access'. */
export function textoTransicionEfs(valor) {
  if (!valor) return 'None';
  if (valor === 'AFTER_1_ACCESS') return 'On first access';
  const n = Number(/AFTER_(\d+)_DAY/.exec(valor)?.[1]);
  return n ? `${n} day(s) since last access` : valor;
}

const TAMANO_INICIAL = 6144; // un sistema vacío mide 6 KiB, igual que en AWS

/* ============================================================ ayudas internas */

function iniciar(estado) {
  estado.efs ??= { sistemas: [] };
  estado.efs.sistemas ??= [];
}

const cuentaDe = (estado) => estado.cuenta?.id ?? '123456789012';

/** El sistema de archivos por id, ARN o nombre. null si no existe. */
export function sistemaEfsDe(estado, ref) {
  const r = String(ref ?? '').trim();
  if (!r) return null;
  const lista = estado.efs?.sistemas ?? [];
  return lista.find((f) => f.id === r || f.arn === r) ?? lista.find((f) => f.nombre && f.nombre === r) ?? null;
}

function sistemaOError(estado, ref) {
  const f = sistemaEfsDe(estado, ref);
  if (!f) throw errorAws('FileSystemNotFound', `File system '${ref ?? ''}' does not exist.`);
  return f;
}

/** El nombre DNS del sistema de archivos. */
export const dnsEfs = (fs) => `${fs.id}.efs.us-east-1.amazonaws.com`;

/** ¿Está vivo (no se está borrando)? */
const vivo = (x) => x.estado !== 'deleting';

const limpiarEtiquetas = (etiquetas) =>
  (Array.isArray(etiquetas) ? etiquetas : [])
    .map((t) => ({ llave: nombreLimpio(t?.llave, 128), valor: nombreLimpio(t?.valor, 256) }))
    .filter((t) => t.llave)
    .slice(0, 50);

function ponerNombre(fs, nombre) {
  fs.nombre = nombreLimpio(nombre, 256);
  fs.etiquetas = fs.etiquetas.filter((t) => t.llave !== 'Name');
  if (fs.nombre) fs.etiquetas.unshift({ llave: 'Name', valor: fs.nombre });
}

function validarCiclo(ciclo = {}) {
  const ia = ciclo.ia ?? null;
  const archivo = ciclo.archivo ?? null;
  const estandar = ciclo.estandar ?? null;
  if (ia && !TRANSICIONES_IA.includes(ia)) throw errorAws('BadRequest', `Invalid value for TransitionToIA: ${ia}`);
  if (archivo && !TRANSICIONES_ARCHIVO.includes(archivo)) throw errorAws('BadRequest', `Invalid value for TransitionToArchive: ${archivo}`);
  if (estandar && estandar !== 'AFTER_1_ACCESS') throw errorAws('BadRequest', `Invalid value for TransitionToPrimaryStorageClass: ${estandar}`);
  if (ia && archivo) {
    const dias = (v) => Number(/AFTER_(\d+)_DAY/.exec(v)?.[1]);
    if (dias(archivo) <= dias(ia)) throw errorAws('BadRequest', 'The TransitionToArchive value must be greater than the TransitionToIA value.');
  }
  return { ia, archivo, estandar };
}

function validarThroughput(rendimiento, throughput, mibps, unaZona) {
  if (!['generalPurpose', 'maxIO'].includes(rendimiento)) throw errorAws('BadRequest', `Invalid PerformanceMode: ${rendimiento}`);
  if (!['elastic', 'provisioned', 'bursting'].includes(throughput)) throw errorAws('BadRequest', `Invalid ThroughputMode: ${throughput}`);
  if (rendimiento === 'maxIO' && throughput === 'elastic') throw errorAws('BadRequest', 'Max I/O performance mode is not supported with Elastic throughput mode. Use General Purpose.');
  if (rendimiento === 'maxIO' && unaZona) throw errorAws('BadRequest', 'One Zone file systems support only the General Purpose performance mode.');
  if (throughput !== 'provisioned') return null;
  const n = Number(mibps);
  if (!Number.isFinite(n) || n < LIMITES_EFS.mibpsMin || n > LIMITES_EFS.mibpsMax) {
    throw errorAws('BadRequest', `Provisioned throughput must be between ${LIMITES_EFS.mibpsMin} and ${LIMITES_EFS.mibpsMax.toLocaleString('en-US')} MiB/s.`);
  }
  return n;
}

/** La llave de KMS con la que se cifra: aws/elasticfilesystem por omisión o una propia habilitada. */
function llaveParaEfs(estado, ref) {
  if (!ref || ref === 'aws/elasticfilesystem' || ref === 'alias/aws/elasticfilesystem') {
    return llamar('llaveAwsKms', estado, 'elasticfilesystem')?.id ?? 'aws/elasticfilesystem';
  }
  const uso = llamar('usoLlaveKms', estado, ref);
  if (uso && !uso.ok) throw errorAws('KMSInvalidStateException', `The KMS key ${ref} cannot be used to encrypt the file system. ${llamar('problemaLlaveKms', estado, ref) ?? ''}`.trim());
  return llamar('llaveKmsDe', estado, ref)?.id ?? String(ref);
}

/** Una IP libre de la subred: la que pidió el alumno (validada) o una automática. */
function ipDeMontaje(estado, subred, ipPedida) {
  const usadas = new Set([
    ...estado.instancias.filter((i) => i.subredId === subred.id && i.estado !== 'terminated').map((i) => i.ipPrivada),
    ...(estado.efs?.sistemas ?? []).flatMap((f) => f.montajes.filter((m) => m.subredId === subred.id).map((m) => m.ip))
  ]);
  const pedida = String(ipPedida ?? '').trim();
  if (pedida) {
    const c = parsearCidr(subred.cidr);
    const n = ipAEntero(pedida);
    if (n === null || !ipEnCidr(pedida, subred.cidr) || n < c.inicio + 4 || n > c.inicio + c.total - 2) {
      throw errorAws('BadRequest', `IP address ${pedida} is not within the usable range of subnet ${subred.id} (${subred.cidr}).`);
    }
    if (usadas.has(enteroAIp(n))) throw errorAws('IpAddressInUse', `Address ${pedida} is already in use in subnet ${subred.id}.`);
    return enteroAIp(n);
  }
  for (let i = 0; i < 40; i++) {
    const ip = ipPrivadaNueva(estado, subred);
    if (!usadas.has(ip)) return ip;
  }
  throw errorAws('NoFreeAddressesInSubnet', `The subnet ${subred.id} has no more free IP addresses.`);
}

/** Valida y arma un mount target (sin guardarlo). */
function armarMontaje(estado, fs, { subredId, gruposSeguridad, ip } = {}, otros = fs.montajes) {
  const subred = subredDe(estado, subredId);
  if (!subred) throw errorAws('SubnetNotFound', `The subnet ID '${subredId ?? ''}' does not exist`);
  const vivos = otros.filter(vivo);
  const otraVpc = vivos.find((m) => m.vpcId !== subred.vpcId);
  if (otraVpc) throw errorAws('MountTargetConflict', `The file system already has mount targets in VPC ${otraVpc.vpcId}. All mount targets of a file system must be in the same VPC.`);
  if (vivos.some((m) => m.zona === subred.az)) throw errorAws('MountTargetConflict', `A mount target already exists in the Availability Zone ${subred.az} for this file system.`);
  if (fs.unaZona && subred.az !== fs.zona) throw errorAws('AvailabilityZonesMismatch', `The One Zone file system is in ${fs.zona}. Its mount target must be in a subnet of ${fs.zona} (the subnet ${subred.id} is in ${subred.az}).`);
  const grupos = [...new Set((Array.isArray(gruposSeguridad) ? gruposSeguridad : []).filter(Boolean))];
  const porOmision = estado.gruposSeguridad.find((g) => g.vpcId === subred.vpcId && g.porDefecto);
  if (!grupos.length && porOmision) grupos.push(porOmision.id);
  if (grupos.length > LIMITES_EFS.gruposPorMontaje) throw errorAws('SecurityGroupLimitExceeded', `A mount target can have at most ${LIMITES_EFS.gruposPorMontaje} security groups.`);
  for (const id of grupos) {
    const g = grupoDe(estado, id);
    if (!g) throw errorAws('SecurityGroupNotFound', `The security group '${id}' does not exist.`);
    if (g.vpcId !== subred.vpcId) throw errorAws('SecurityGroupNotFound', `The security group '${id}' is not in the VPC of the subnet (${subred.vpcId}).`);
  }
  const ahora = reloj.ahora();
  return {
    id: nuevoId('fsmt'),
    zona: subred.az,
    subredId: subred.id,
    vpcId: subred.vpcId,
    ip: ipDeMontaje(estado, subred, ip),
    eni: nuevoId('eni'),
    gruposSeguridad: grupos,
    estado: 'creating',
    hasta: ahora + DURACION_EFS.montaje,
    siguiente: 'available',
    creado: iso(ahora)
  };
}

/** Los mount targets del «Create» rápido: el primer subnet de cada zona de la VPC (One Zone: solo su zona). */
function montajesAutomaticos(estado, vpcId, zona) {
  const vistas = new Set();
  const lista = [];
  for (const s of estado.subredes.filter((x) => x.vpcId === vpcId)) {
    if (zona && s.az !== zona) continue;
    if (vistas.has(s.az)) continue;
    vistas.add(s.az);
    lista.push({ subredId: s.id, gruposSeguridad: [] });
  }
  return lista;
}

/* ============================================================ acciones */

/**
 * «Create file system». p = {
 *   nombre, tipo: 'regional' | 'one-zone', zona (One Zone), respaldos (true),
 *   ciclo: { ia, archivo, estandar } (por omisión 30 días a IA y 90 a Archive),
 *   cifrado (true), llaveKms (null = aws/elasticfilesystem),
 *   rendimiento: 'generalPurpose', throughput: 'elastic', mibps,
 *   vpcId, montajes: [{ subredId, gruposSeguridad, ip }] (si no viene: uno por zona, como el «Create» rápido),
 *   politica: null | texto JSON, etiquetas
 * }
 */
export function crearSistemaEfs(estado, p = {}) {
  iniciar(estado);
  if (estado.efs.sistemas.length >= LIMITES_EFS.sistemasMax) {
    throw errorAws('FileSystemLimitExceeded', `El simulador admite hasta ${LIMITES_EFS.sistemasMax} sistemas de archivos. Borra los que ya no uses.`);
  }
  const unaZona = p.tipo === 'one-zone';
  let zona = null;
  if (unaZona) {
    zona = String(p.zona ?? '').trim();
    if (!zona) throw errorAws('BadRequest', 'You must choose an Availability Zone for a One Zone file system.');
    if (!estado.subredes.some((s) => s.az === zona)) throw errorAws('BadRequest', `The Availability Zone ${zona} is not valid for this account.`);
  }
  const rendimiento = p.rendimiento ?? 'generalPurpose';
  const throughput = p.throughput ?? 'elastic';
  const mibps = validarThroughput(rendimiento, throughput, p.mibps, unaZona);
  const ciclo = validarCiclo(p.ciclo ?? { ia: 'AFTER_30_DAYS', archivo: 'AFTER_90_DAYS', estandar: null });
  if (unaZona && ciclo.archivo) throw errorAws('BadRequest', 'The Archive storage class is not available for One Zone file systems.');
  const cifrado = p.cifrado !== false;
  const politica = p.politica ? validarPolitica(p.politica) : null;

  const vpcId = p.vpcId ?? estado.vpcs.find((v) => v.porDefecto)?.id ?? estado.vpcs[0]?.id ?? null;
  if (vpcId && !vpcDe(estado, vpcId)) throw errorAws('BadRequest', `The VPC '${vpcId}' does not exist.`);

  const ahora = reloj.ahora();
  const id = nuevoId('fs');
  const fs = {
    id,
    arn: `arn:aws:elasticfilesystem:us-east-1:${cuentaDe(estado)}:file-system/${id}`,
    nombre: '',
    tipo: unaZona ? 'one-zone' : 'regional',
    zona,
    unaZona,
    estado: 'creating',
    hasta: ahora + DURACION_EFS.sistema,
    siguiente: 'available',
    rendimiento,
    throughput,
    mibps,
    cifrado,
    llaveKms: null,
    respaldos: p.respaldos !== false,
    ciclo,
    tamano: TAMANO_INICIAL,
    politica,
    vpcId: null,
    montajes: [],
    etiquetas: limpiarEtiquetas(p.etiquetas).filter((t) => t.llave !== 'Name'),
    creado: iso(ahora)
  };
  ponerNombre(fs, p.nombre);

  // Los mount targets se validan todos antes de guardar: si uno falla, no queda nada a medias.
  const pedidos = Array.isArray(p.montajes) ? p.montajes.filter((m) => m?.subredId) : vpcId ? montajesAutomaticos(estado, vpcId, zona) : [];
  const nuevos = [];
  for (const m of pedidos) nuevos.push(armarMontaje(estado, fs, m, nuevos));
  if (cifrado) fs.llaveKms = llaveParaEfs(estado, p.llaveKms);
  fs.montajes = nuevos;
  fs.vpcId = nuevos[0]?.vpcId ?? null;

  estado.efs.sistemas.push(fs);
  anotar(estado, 'EFS', 'CreateFileSystem', `${fs.id}${fs.nombre ? ` (${fs.nombre})` : ''} ${unaZona ? `One Zone ${zona}` : 'Regional'}`);
  for (const m of nuevos) anotar(estado, 'EFS', 'CreateMountTarget', `${m.id} en ${m.subredId} (${m.zona})`);
  if (ciclo.ia || ciclo.archivo || ciclo.estandar) anotar(estado, 'EFS', 'PutLifecycleConfiguration', fs.id);
  if (fs.respaldos) anotar(estado, 'EFS', 'PutBackupPolicy', `${fs.id} ENABLED`);
  return fs;
}

/** «Network» → Manage mount targets → Add mount target. */
export function crearMontajeEfs(estado, ref, { subredId, gruposSeguridad, ip } = {}) {
  iniciar(estado);
  const fs = sistemaOError(estado, ref);
  if (fs.estado === 'deleting') throw errorAws('IncorrectFileSystemLifeCycleState', `File system '${fs.id}' is being deleted.`);
  const m = armarMontaje(estado, fs, { subredId, gruposSeguridad, ip });
  fs.montajes.push(m);
  fs.vpcId = m.vpcId;
  anotar(estado, 'EFS', 'CreateMountTarget', `${m.id} en ${m.subredId} (${m.zona}) de ${fs.id}`);
  return m;
}

function montajeOError(fs, montajeId) {
  const m = fs.montajes.find((x) => x.id === montajeId || x.zona === montajeId || x.subredId === montajeId);
  if (!m) throw errorAws('MountTargetNotFound', `Mount target '${montajeId ?? ''}' does not exist.`);
  return m;
}

/** «Manage mount targets» → Remove: el mount target pasa a deleting y luego desaparece. */
export function eliminarMontajeEfs(estado, ref, montajeId) {
  iniciar(estado);
  const fs = sistemaOError(estado, ref);
  const m = montajeOError(fs, montajeId);
  if (m.estado === 'deleting') return m;
  if (m.estado !== 'available') throw errorAws('IncorrectMountTargetState', `Mount target '${m.id}' is in state ${m.estado}. Wait until it is available.`);
  Object.assign(m, { estado: 'deleting', hasta: reloj.ahora() + DURACION_EFS.borrado, siguiente: 'deleted' });
  anotar(estado, 'EFS', 'DeleteMountTarget', `${m.id} (${m.zona}) de ${fs.id}`);
  return m;
}

/** «Manage mount targets» → cambiar los grupos de seguridad (ModifyMountTargetSecurityGroups). */
export function gruposMontajeEfs(estado, ref, montajeId, gruposSeguridad = []) {
  iniciar(estado);
  const fs = sistemaOError(estado, ref);
  const m = montajeOError(fs, montajeId);
  if (m.estado !== 'available') throw errorAws('IncorrectMountTargetState', `Mount target '${m.id}' is in state ${m.estado}. Wait until it is available.`);
  const grupos = [...new Set((Array.isArray(gruposSeguridad) ? gruposSeguridad : []).filter(Boolean))];
  if (!grupos.length) throw errorAws('BadRequest', 'A mount target must have at least one security group.');
  if (grupos.length > LIMITES_EFS.gruposPorMontaje) throw errorAws('SecurityGroupLimitExceeded', `A mount target can have at most ${LIMITES_EFS.gruposPorMontaje} security groups.`);
  for (const id of grupos) {
    const g = grupoDe(estado, id);
    if (!g || g.vpcId !== m.vpcId) throw errorAws('SecurityGroupNotFound', `The security group '${id}' does not exist in ${m.vpcId}.`);
  }
  m.gruposSeguridad = grupos;
  anotar(estado, 'EFS', 'ModifyMountTargetSecurityGroups', `${m.id}: ${grupos.join(', ')}`);
  return m;
}

/**
 * «Edit» del sistema de archivos: { nombre, respaldos, ciclo, throughput, mibps }.
 * El tipo (Regional/One Zone), el cifrado y el modo de rendimiento no se cambian después.
 */
export function editarSistemaEfs(estado, ref, cambios = {}) {
  iniciar(estado);
  const fs = sistemaOError(estado, ref);
  if (fs.estado !== 'available') throw errorAws('IncorrectFileSystemLifeCycleState', `File system '${fs.id}' is in state ${fs.estado}. Wait until it is available.`);
  if (cambios.throughput !== undefined || cambios.mibps !== undefined) {
    const throughput = cambios.throughput ?? fs.throughput;
    fs.mibps = validarThroughput(fs.rendimiento, throughput, cambios.mibps ?? fs.mibps, fs.unaZona);
    fs.throughput = throughput;
    anotar(estado, 'EFS', 'UpdateFileSystem', `${fs.id} throughput ${throughput}${fs.mibps ? ` ${fs.mibps} MiB/s` : ''}`);
  }
  if (cambios.ciclo !== undefined) {
    const ciclo = validarCiclo(cambios.ciclo ?? {});
    if (fs.unaZona && ciclo.archivo) throw errorAws('BadRequest', 'The Archive storage class is not available for One Zone file systems.');
    fs.ciclo = ciclo;
    anotar(estado, 'EFS', 'PutLifecycleConfiguration', fs.id);
  }
  if (cambios.respaldos !== undefined) {
    fs.respaldos = Boolean(cambios.respaldos);
    anotar(estado, 'EFS', 'PutBackupPolicy', `${fs.id} ${fs.respaldos ? 'ENABLED' : 'DISABLED'}`);
  }
  if (cambios.nombre !== undefined) {
    ponerNombre(fs, cambios.nombre);
    anotar(estado, 'EFS', 'TagResource', `${fs.id} Name=${fs.nombre}`);
  }
  return fs;
}

function validarPolitica(texto) {
  const t = String(texto ?? '').trim();
  if (!t) return null;
  let o;
  try {
    o = JSON.parse(t);
  } catch {
    throw errorAws('InvalidPolicyException', 'The file system policy is not valid JSON.');
  }
  if (!o || typeof o !== 'object' || !Array.isArray(o.Statement) || !o.Statement.length) {
    throw errorAws('InvalidPolicyException', 'The file system policy must have a Statement list.');
  }
  return JSON.stringify(o, null, 4);
}

/** «File system policy» → Edit (texto vacío = borrar la política). */
export function politicaSistemaEfs(estado, ref, texto) {
  iniciar(estado);
  const fs = sistemaOError(estado, ref);
  fs.politica = validarPolitica(texto);
  anotar(estado, 'EFS', fs.politica ? 'PutFileSystemPolicy' : 'DeleteFileSystemPolicy', fs.id);
  return fs;
}

/**
 * La política que arma la consola con las casillas de «Policy options»:
 * { sinRaiz, soloLectura, tls, accesoPorPunto }.
 */
export function politicaEfsDeOpciones(fs, { sinRaiz = false, soloLectura = false, tls = false } = {}) {
  const declaraciones = [];
  const acciones = ['elasticfilesystem:ClientMount'];
  if (!soloLectura) acciones.push('elasticfilesystem:ClientWrite');
  if (!sinRaiz) acciones.push('elasticfilesystem:ClientRootAccess');
  declaraciones.push({ Effect: 'Allow', Principal: { AWS: '*' }, Action: acciones, Resource: fs.arn, Condition: { Bool: { 'elasticfilesystem:AccessedViaMountTarget': 'true' } } });
  if (tls) declaraciones.push({ Effect: 'Deny', Principal: { AWS: '*' }, Action: '*', Resource: fs.arn, Condition: { Bool: { 'aws:SecureTransport': 'false' } } });
  return JSON.stringify({ Version: '2012-10-17', Id: 'efs-policy-wizard', Statement: declaraciones }, null, 4);
}

/** «Tags» → Manage tags (reemplaza todas; Name cambia el nombre). */
export function etiquetasSistemaEfs(estado, ref, etiquetas = []) {
  iniciar(estado);
  const fs = sistemaOError(estado, ref);
  const lista = limpiarEtiquetas(etiquetas);
  fs.etiquetas = lista;
  fs.nombre = lista.find((t) => t.llave === 'Name')?.valor ?? '';
  anotar(estado, 'EFS', 'TagResource', fs.id);
  return fs;
}

/**
 * «Delete»: como la consola, borra primero los mount targets y luego el
 * sistema de archivos. Todo pasa a deleting y desaparece en unos segundos.
 */
export function eliminarSistemaEfs(estado, ref) {
  iniciar(estado);
  const fs = sistemaOError(estado, ref);
  if (fs.estado === 'deleting') return fs;
  if (fs.estado === 'creating') throw errorAws('IncorrectFileSystemLifeCycleState', `File system '${fs.id}' is in state creating. Wait until it is available.`);
  const fin = reloj.ahora() + DURACION_EFS.borrado;
  for (const m of fs.montajes) {
    if (m.estado === 'deleting') continue;
    Object.assign(m, { estado: 'deleting', hasta: fin, siguiente: 'deleted' });
    anotar(estado, 'EFS', 'DeleteMountTarget', `${m.id} de ${fs.id}`);
  }
  Object.assign(fs, { estado: 'deleting', hasta: fin, siguiente: 'deleted' });
  anotar(estado, 'EFS', 'DeleteFileSystem', fs.id);
  return fs;
}

/* ============================================================ «Attach» */

/**
 * Los comandos de «Attach». modo 'dns' (por omisión) o 'ip' (con la IP del
 * mount target de `zona`). Devuelve { ayudante, nfs, ip } (textos).
 */
export function comandosMontajeEfs(fs, { modo = 'dns', zona = null, carpeta = 'efs' } = {}) {
  const opciones = 'nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport';
  const vivos = (fs.montajes ?? []).filter((m) => m.estado === 'available');
  const m = vivos.find((x) => x.zona === zona) ?? vivos[0] ?? null;
  if (modo === 'ip') {
    if (!m) return { ayudante: null, nfs: null, ip: null };
    return {
      ayudante: `sudo mount -t efs -o tls,mounttargetip=${m.ip} ${fs.id} ${carpeta}/`,
      nfs: `sudo mount -t nfs4 -o ${opciones} ${m.ip}:/ ${carpeta}`,
      ip: m.ip
    };
  }
  return {
    ayudante: `sudo mount -t efs -o tls ${fs.id}:/ ${carpeta}`,
    nfs: `sudo mount -t nfs4 -o ${opciones} ${dnsEfs(fs)}:/ ${carpeta}`,
    ip: null
  };
}

/* ============================================================ ¿se monta? */

const cubre2049 = (r) => r.protocolo === '-1' || (r.protocolo === 'tcp' && r.desde <= 2049 && 2049 <= r.hasta);

/** La regla de esos grupos que deja pasar TCP 2049 hacia/desde el otro lado (por IP o por grupo). */
function reglaNfs(estado, grupos, sentido, ip, gruposOtroLado) {
  for (const gid of grupos ?? []) {
    const g = grupoDe(estado, gid);
    for (const r of g?.[sentido] ?? []) {
      if (!cubre2049(r)) continue;
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

/**
 * ¿La instancia EC2 monta el sistema de archivos por NFS (TCP 2049)? Función
 * pura (no cambia el estado): instancia encendida, sistema available, un mount
 * target available en la misma VPC (de preferencia en la zona de la
 * instancia), su grupo de seguridad deja entrar 2049 desde la instancia (por
 * su grupo o su IP), la instancia deja salir 2049 y las NACL dejan pasar ida y
 * vuelta. Devuelve { ok, motivo, puerto: 2049, montaje, ip, cruzaZona };
 * `motivo` va en español para el docente.
 */
export function montajeEfs(estado, instanciaId, efsId) {
  const res = (ok, motivo, extra = {}) => ({ ok, motivo, puerto: 2049, montaje: null, ip: null, cruzaZona: false, ...extra });
  const inst = instanciaDe(estado, instanciaId);
  if (!inst || inst.estado === 'terminated') return res(false, `La instancia EC2 ${instanciaId ?? ''} no existe o está terminada.`);
  const fs = sistemaEfsDe(estado, efsId);
  if (!fs) return res(false, `No existe el sistema de archivos ${efsId ?? ''}.`);
  if (inst.estado !== 'running') return res(false, `La instancia ${inst.id} no está encendida (estado ${inst.estado}).`);
  if (fs.estado !== 'available') return res(false, `El sistema de archivos ${fs.id} no está disponible (estado ${fs.estado}).`);
  const listos = (fs.montajes ?? []).filter((m) => m.estado === 'available');
  if (!listos.length) return res(false, `El sistema de archivos ${fs.id} no tiene ningún mount target disponible: sin mount target no hay por dónde entrar.`);
  const enVpc = listos.filter((m) => m.vpcId === inst.vpcId);
  if (!enVpc.length) return res(false, `Los mount targets de ${fs.id} están en ${listos[0].vpcId} y la instancia en ${inst.vpcId}: viven en VPC distintas y no se ven.`);
  const m = enVpc.find((x) => x.zona === inst.az) ?? enVpc[0];
  const cruzaZona = m.zona !== inst.az;
  const extra = { montaje: m.id, ip: m.ip, cruzaZona };

  const entrada = reglaNfs(estado, m.gruposSeguridad, 'entrada', inst.ipPrivada, inst.gruposSeguridad);
  if (!entrada) {
    return res(false, `Ningún grupo de seguridad del mount target ${m.id} (${m.gruposSeguridad.join(', ') || 'ninguno'}) deja entrar NFS (TCP 2049) desde la instancia: agrega una regla de entrada tipo NFS con origen en el grupo de la instancia o en su IP privada.`, extra);
  }
  const salida = reglaNfs(estado, inst.gruposSeguridad, 'salida', m.ip, m.gruposSeguridad);
  if (!salida) return res(false, `Los grupos de seguridad de la instancia no la dejan salir hacia el mount target por TCP 2049.`, extra);

  if (inst.subredId !== m.subredId) {
    const nI = naclDeSubred(estado, inst.subredId);
    const nM = naclDeSubred(estado, m.subredId);
    if (!naclDeja(nI, 'salida', 2049, m.ip)) return res(false, `La NACL ${nI.id} de la subred de la instancia no deja salir TCP 2049 hacia el mount target.`, extra);
    if (!naclDeja(nM, 'entrada', 2049, inst.ipPrivada)) return res(false, `La NACL ${nM.id} de la subred del mount target no deja entrar TCP 2049 desde la instancia.`, extra);
    if (!naclDeja(nM, 'salida', 50000, inst.ipPrivada)) return res(false, `La NACL ${nM.id} de la subred del mount target no deja salir la respuesta (puertos efímeros 1024-65535).`, extra);
    if (!naclDeja(nI, 'entrada', 50000, m.ip)) return res(false, `La NACL ${nI.id} de la subred de la instancia no deja entrar la respuesta (puertos efímeros 1024-65535).`, extra);
  }
  const nota = cruzaZona ? ` Ojo: no hay mount target en ${inst.az}, así que entra por el de ${m.zona} (cruza de zona: más latencia y cobro de transferencia). Lo ideal es un mount target en cada zona.` : '';
  return res(true, `La instancia ${inst.id} monta ${fs.id} por el mount target ${m.id} (${m.ip}:2049, regla ${entrada.regla.id} del grupo ${entrada.grupo.nombre}).${nota}`, extra);
}

/* ============================================================ el tiempo */

function avanzarEfs(estado, ahora) {
  iniciar(estado);
  let cambio = false;
  for (const fs of estado.efs.sistemas) {
    for (const m of fs.montajes) {
      if (m.hasta === undefined || m.hasta === null || m.hasta > ahora) continue;
      m.estado = m.siguiente;
      delete m.hasta;
      delete m.siguiente;
      cambio = true;
    }
    const antes = fs.montajes.length;
    fs.montajes = fs.montajes.filter((m) => m.estado !== 'deleted');
    if (fs.montajes.length !== antes) {
      cambio = true;
      if (!fs.montajes.length) fs.vpcId = null;
    }
    if (fs.hasta !== undefined && fs.hasta !== null && fs.hasta <= ahora) {
      fs.estado = fs.siguiente;
      delete fs.hasta;
      delete fs.siguiente;
      cambio = true;
    }
  }
  const n = estado.efs.sistemas.length;
  estado.efs.sistemas = estado.efs.sistemas.filter((fs) => fs.estado !== 'deleted');
  if (estado.efs.sistemas.length !== n) cambio = true;
  return cambio;
}

/* ============================================================ dependencias */

function dependenciasVpc(estado, vpcId) {
  iniciar(estado);
  const fs = estado.efs.sistemas.find((f) => f.montajes.some((m) => m.vpcId === vpcId && vivo(m)));
  if (fs) throw errorAws('DependencyViolation', `The vpc '${vpcId}' has dependencies and cannot be deleted. Delete the mount targets of the EFS file system '${fs.id}' first.`);
}

function dependenciasSubred(estado, subredId) {
  iniciar(estado);
  const fs = estado.efs.sistemas.find((f) => f.montajes.some((m) => m.subredId === subredId && vivo(m)));
  if (fs) throw errorAws('DependencyViolation', `The subnet '${subredId}' has dependencies and cannot be deleted. It is used by a mount target of the EFS file system '${fs.id}'.`);
}

function dependenciasGrupo(estado, sgId) {
  iniciar(estado);
  const fs = estado.efs.sistemas.find((f) => f.montajes.some((m) => m.gruposSeguridad.includes(sgId) && vivo(m)));
  if (fs) throw errorAws('DependencyViolation', `resource ${sgId} has a dependent object (used by a mount target of the EFS file system ${fs.id})`);
}

registrarExtension({
  id: 'efs',
  orden: 66,
  iniciar,
  avanzar: avanzarEfs,
  dependenciasVpc,
  dependenciasSubred,
  dependenciasGrupo,
  funciones: { montajeEfs, sistemaEfsDe }
});
