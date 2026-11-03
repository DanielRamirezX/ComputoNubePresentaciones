// ---------------------------------------------------------------------------
// GOBIERNO: AWS ORGANIZATIONS Y AWS WELL-ARCHITECTED TOOL
//
// Organizations junta varias cuentas de AWS bajo una «cuenta de administración»
// (la del alumno): las acomoda en unidades organizativas (OU), les pone límites
// con las SCP (service control policies) y les cobra en una sola factura
// (facturación consolidada). Well-Architected Tool revisa una carga de trabajo
// contra las preguntas reales de los seis pilares del Framework.
//
// Las colecciones (nombres fijos, ver SIMULADOR.md §2.1):
//
// estado.organizations = null | {
//   id: 'o-…', arn, conjunto: 'ALL', creada, cuentaAdmin: '123456789012',
//   raiz:  { id: 'r-…', arn, nombre: 'Root' },
//   ous:   [{ id: 'ou-xxxx-xxxxxxxx', arn, nombre, padre: 'r-…' | 'ou-…', creada }],
//   cuentas: [{ id: '12 dígitos', arn, nombre, correo, padre, estado: 'CREATING' | 'ACTIVE' | 'SUSPENDED',
//               metodo: 'CREATED' | 'INVITED', unida, admin: bool, rol: 'OrganizationAccountAccessRole' | null, hasta? }],
//   invitaciones: [{ id: 'h-…', destino, nota, estado: 'OPEN' | 'ACCEPTED' | 'CANCELED', creada, hasta?, cuentaId? }],
//   scpHabilitadas: bool,
//   politicas: [{ id: 'p-…' | 'p-FullAWSAccess', arn, nombre, descripcion, tipo: 'SERVICE_CONTROL_POLICY',
//                 administradaPorAws: bool, documento: texto JSON, objetivos: [id de raíz, OU o cuenta], creada }]
// }
//
// estado.wellarchitected = {
//   cargas: [{ id: 32 hex, arn, nombre, descripcion, responsable, entorno: 'PRODUCTION' | 'PREPRODUCTION',
//              regiones: ['us-east-1'], regionesNoAws: ['Mi centro de datos'], cuentas: ['12 dígitos'],
//              arquitectura, industriaTipo, lentes: ['wellarchitected'], estadoMejora, creada, actualizada,
//              respuestas: { 'REL2': { elegidas: ['REL02-BP01'], ninguna, noAplica, notas } },
//              hitos: [{ numero, nombre, fecha, respuestas: {…copia…} }] }]
// }
//
// Las SCP no afectan a la cuenta de administración (igual que en AWS): como el
// alumno ES la cuenta de administración, sus SCP no le niegan nada en la
// consola. accionPermitidaPorScp() explica qué pasaría en una cuenta miembro.
// ---------------------------------------------------------------------------

import { registrarExtension, llamar } from './registro.js';
import { anotar, errorAws, iso, nombreLimpio, aleatorio, hexAzar, reloj } from '../modelo.js';

// Cuánto tarda cada transición (ms). El simulador acepta solo las invitaciones.
export const DURACION_GOBIERNO = {
  cuentaSeCrea: 5000,
  invitacionSeAcepta: 10000
};

// Límites de AWS que se respetan aquí.
const MAX_CUENTAS = 10; // cuota por omisión de cuentas en una organización
const MAX_PROFUNDIDAD_OU = 5;
const MAX_SCP_POR_OBJETIVO = 5;
const MAX_TAMANO_SCP = 5120;
const MAX_INVITACIONES = 30;
const MAX_CARGAS_WA = 30;
const MAX_HITOS_WA = 20;

/* ================================================================ ayudas */

const ALFANUM = 'abcdefghijklmnopqrstuvwxyz0123456789';
const azar36 = (n) => Array.from({ length: n }, () => ALFANUM[Math.floor(aleatorio() * 36)]).join('');
const digitos = (n) => Array.from({ length: n }, (_, i) => String(Math.floor(aleatorio() * (i ? 10 : 9)) + (i ? 0 : 1))).join('');
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function iniciar(estado) {
  if (estado.organizations === undefined) estado.organizations = null;
  estado.wellarchitected ??= { cargas: [] };
  estado.wellarchitected.cargas ??= [];
}

function orgOError(estado) {
  iniciar(estado);
  if (!estado.organizations) throw errorAws('AWSOrganizationsNotInUseException', 'Your account is not a member of an organization.');
  return estado.organizations;
}

/* =========================================================== organización */

export const FULL_AWS_ACCESS = 'p-FullAWSAccess';

const DOCUMENTO_FULL_AWS_ACCESS = JSON.stringify({ Version: '2012-10-17', Statement: [{ Effect: 'Allow', Action: '*', Resource: '*' }] }, null, 4);

/** «Create an organization»: la cuenta del alumno pasa a ser la cuenta de administración. */
export function crearOrganizacion(estado, { correo } = {}) {
  iniciar(estado);
  if (estado.organizations) throw errorAws('AlreadyInOrganizationException', 'The AWS account is already a member of an organization.');
  const admin = estado.cuenta.id;
  const id = `o-${azar36(10)}`;
  const raizId = `r-${azar36(4)}`;
  const usuario = nombreLimpio(estado.cuenta.usuario, 50) || 'alumno';
  const org = {
    id,
    arn: `arn:aws:organizations::${admin}:organization/${id}`,
    conjunto: 'ALL',
    creada: iso(),
    cuentaAdmin: admin,
    raiz: { id: raizId, arn: `arn:aws:organizations::${admin}:root/${id}/${raizId}`, nombre: 'Root' },
    ous: [],
    cuentas: [],
    invitaciones: [],
    scpHabilitadas: false,
    politicas: []
  };
  const correoAdmin = nombreLimpio(correo, 64) || `${usuario.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || 'alumno'}@example.com`;
  org.cuentas.push({ id: admin, arn: arnCuenta(org, admin), nombre: usuario, correo: correoAdmin, padre: raizId, estado: 'ACTIVE', metodo: 'CREATED', unida: iso(), admin: true, rol: null });
  estado.organizations = org;
  anotar(estado, 'Organizations', 'CreateOrganization', `${id} · cuenta de administración ${admin}`);
  return org;
}

/** Borra la organización (solo si ya no tiene cuentas miembro). */
export function eliminarOrganizacion(estado) {
  const org = orgOError(estado);
  if (org.cuentas.some((c) => !c.admin)) {
    throw errorAws('OrganizationNotEmptyException', 'To delete an organization you must first remove all member accounts (except the management account).');
  }
  estado.organizations = null;
  anotar(estado, 'Organizations', 'DeleteOrganization', org.id);
}

const arnCuenta = (org, id) => `arn:aws:organizations::${org.cuentaAdmin}:account/${org.id}/${id}`;

/**
 * Cualquier objetivo de una SCP por su id: la raíz, una OU o una cuenta.
 * → { tipo: 'ROOT' | 'ORGANIZATIONAL_UNIT' | 'ACCOUNT', id, nombre, padre, arn, recurso } | null
 */
export function objetivoOrganizacion(estado, id) {
  const org = estado.organizations;
  if (!org || !id) return null;
  if (org.raiz.id === id) return { tipo: 'ROOT', id, nombre: org.raiz.nombre, padre: null, arn: org.raiz.arn, recurso: org.raiz };
  const ou = org.ous.find((o) => o.id === id);
  if (ou) return { tipo: 'ORGANIZATIONAL_UNIT', id, nombre: ou.nombre, padre: ou.padre, arn: ou.arn, recurso: ou };
  const c = org.cuentas.find((x) => x.id === id);
  if (c) return { tipo: 'ACCOUNT', id, nombre: c.nombre, padre: c.padre, arn: c.arn, recurso: c };
  return null;
}

/** Los ids desde la raíz hasta el objetivo (incluido): [r-…, ou-…, …, id]. */
export function rutaOrganizacion(estado, id) {
  const ruta = [];
  let actual = objetivoOrganizacion(estado, id);
  for (let i = 0; actual && i < 20; i++) {
    ruta.unshift(actual.id);
    actual = objetivoOrganizacion(estado, actual.padre);
  }
  return ruta;
}

/** Hijos directos de la raíz o de una OU. */
export function hijosOrganizacion(estado, padreId) {
  const org = estado.organizations;
  if (!org) return { ous: [], cuentas: [] };
  return { ous: org.ous.filter((o) => o.padre === padreId), cuentas: org.cuentas.filter((c) => c.padre === padreId) };
}

function padreOError(org, estado, padreId, codigo = 'ParentNotFoundException') {
  const p = objetivoOrganizacion(estado, padreId);
  if (!p || p.tipo === 'ACCOUNT') {
    throw errorAws(codigo, codigo === 'DestinationParentNotFoundException'
      ? "We can't find the destination container (a root or OU) with the ParentId that you specified."
      : "We can't find a root or OU with the ParentId that you specified.");
  }
  return p;
}

function adjuntarFullAccessSiAplica(org, id) {
  if (!org.scpHabilitadas) return;
  const full = org.politicas.find((p) => p.id === FULL_AWS_ACCESS);
  if (full && !full.objetivos.includes(id)) full.objetivos.push(id);
}

/* ======================================================== unidades (OU) */

function validarNombreOu(nombre) {
  const n = nombreLimpio(nombre, 1000);
  if (!n) throw errorAws('InvalidInputException', 'You must specify a name for the organizational unit.');
  if (n.length > 128) throw errorAws('InvalidInputException', 'The organizational unit name can be up to 128 characters long.');
  return n;
}

/** «Create organizational unit» dentro de la raíz o de otra OU. */
export function crearUnidadOrganizativa(estado, { nombre, padre } = {}) {
  const org = orgOError(estado);
  const n = validarNombreOu(nombre);
  const p = padreOError(org, estado, padre ?? org.raiz.id);
  if (rutaOrganizacion(estado, p.id).length > MAX_PROFUNDIDAD_OU) {
    throw errorAws('ConstraintViolationException', `You have reached the maximum depth of organizational units in the organization tree (${MAX_PROFUNDIDAD_OU}).`);
  }
  if (org.ous.some((o) => o.padre === p.id && o.nombre === n)) throw errorAws('DuplicateOrganizationalUnitException', 'An OU with the same name already exists.');
  const id = `ou-${org.raiz.id.slice(2)}-${azar36(8)}`;
  const ou = { id, arn: `arn:aws:organizations::${org.cuentaAdmin}:ou/${org.id}/${id}`, nombre: n, padre: p.id, creada: iso() };
  org.ous.push(ou);
  adjuntarFullAccessSiAplica(org, id);
  anotar(estado, 'Organizations', 'CreateOrganizationalUnit', `${n} (${id}) en ${p.nombre}`);
  return ou;
}

export function renombrarUnidadOrganizativa(estado, ouId, nombre) {
  const org = orgOError(estado);
  const ou = org.ous.find((o) => o.id === ouId);
  if (!ou) throw errorAws('OrganizationalUnitNotFoundException', "We can't find an OU with the OrganizationalUnitId that you specified.");
  const n = validarNombreOu(nombre);
  if (org.ous.some((o) => o !== ou && o.padre === ou.padre && o.nombre === n)) throw errorAws('DuplicateOrganizationalUnitException', 'An OU with the same name already exists.');
  const antes = ou.nombre;
  ou.nombre = n;
  anotar(estado, 'Organizations', 'UpdateOrganizationalUnit', `${antes} → ${n} (${ouId})`);
  return ou;
}

/** Solo se borra una OU vacía (sin cuentas ni OU hijas). */
export function eliminarUnidadOrganizativa(estado, ouId) {
  const org = orgOError(estado);
  const ou = org.ous.find((o) => o.id === ouId);
  if (!ou) throw errorAws('OrganizationalUnitNotFoundException', "We can't find an OU with the OrganizationalUnitId that you specified.");
  if (org.ous.some((o) => o.padre === ouId) || org.cuentas.some((c) => c.padre === ouId)) {
    throw errorAws('OrganizationalUnitNotEmptyException', 'The specified OU is not empty. Move all accounts to another root or OU and delete all child OUs, then try the operation again.');
  }
  org.ous = org.ous.filter((o) => o !== ou);
  for (const p of org.politicas) p.objetivos = p.objetivos.filter((x) => x !== ouId);
  anotar(estado, 'Organizations', 'DeleteOrganizationalUnit', `${ou.nombre} (${ouId})`);
}

/* ================================================================ cuentas */

const cuentasVivas = (org) => org.cuentas.filter((c) => c.estado !== 'SUSPENDED');

function idCuentaNuevo(estado, org) {
  for (;;) {
    const id = digitos(12);
    if (id !== estado.cuenta.id && !org.cuentas.some((c) => c.id === id)) return id;
  }
}

function revisarCupo(org) {
  if (cuentasVivas(org).length + org.invitaciones.filter((i) => i.estado === 'OPEN').length >= MAX_CUENTAS) {
    throw errorAws('ConstraintViolationException', `You have reached the limit on the number of accounts in your organization (${MAX_CUENTAS}). To request an increase, use the Service Quotas console.`);
  }
}

/** «Create an AWS account»: una cuenta nueva que nace dentro de la organización. */
export function crearCuentaOrganizacion(estado, { nombre, correo, rol = 'OrganizationAccountAccessRole', padre } = {}) {
  const org = orgOError(estado);
  const n = nombreLimpio(nombre, 1000);
  if (!n) throw errorAws('InvalidInputException', 'You must specify an AWS account name.');
  if (n.length > 50) throw errorAws('InvalidInputException', 'The AWS account name can be up to 50 characters long.');
  const c = nombreLimpio(correo, 1000).toLowerCase();
  if (!CORREO.test(c) || c.length > 64) throw errorAws('InvalidInputException', 'The email address that you provided is not valid. Enter a valid email address.');
  if (org.cuentas.some((x) => x.correo.toLowerCase() === c)) {
    throw errorAws('EMAIL_ALREADY_EXISTS', 'The account could not be created because another AWS account with that email address already exists.');
  }
  const r = nombreLimpio(rol, 64) || 'OrganizationAccountAccessRole';
  if (!/^[\w+=,.@-]{1,64}$/.test(r)) throw errorAws('InvalidInputException', 'The IAM role name can contain only alphanumeric characters and +=,.@-_ characters.');
  revisarCupo(org);
  const p = padreOError(org, estado, padre ?? org.raiz.id);
  const id = idCuentaNuevo(estado, org);
  const ahora = reloj.ahora();
  const cuenta = { id, arn: arnCuenta(org, id), nombre: n, correo: c, padre: p.id, estado: 'CREATING', metodo: 'CREATED', unida: iso(ahora), admin: false, rol: r, hasta: ahora + DURACION_GOBIERNO.cuentaSeCrea };
  org.cuentas.push(cuenta);
  adjuntarFullAccessSiAplica(org, id);
  anotar(estado, 'Organizations', 'CreateAccount', `${n} (${id}) · ${c}`);
  return cuenta;
}

/** «Invite an existing AWS account» por correo o por id de 12 dígitos. */
export function invitarCuentaOrganizacion(estado, { destino, nota = '' } = {}) {
  const org = orgOError(estado);
  const d = nombreLimpio(destino, 200).toLowerCase();
  const esId = /^\d{12}$/.test(d);
  if (!esId && !CORREO.test(d)) throw errorAws('InvalidInputException', 'You must specify a valid email address or a 12-digit AWS account ID.');
  if (d === org.cuentaAdmin || org.cuentas.some((c) => c.id === d || c.correo.toLowerCase() === d)) {
    throw errorAws('HandshakeConstraintViolationException', 'The account that you are inviting is already a member of this organization.');
  }
  if (org.invitaciones.some((i) => i.estado === 'OPEN' && i.destino === d)) {
    throw errorAws('DuplicateHandshakeException', 'An invitation to this account is already open. Wait for it to be accepted or cancel it first.');
  }
  if (String(nota).length > 1024) throw errorAws('InvalidInputException', 'The note can be up to 1,024 characters long.');
  revisarCupo(org);
  const ahora = reloj.ahora();
  const inv = { id: `h-${azar36(10)}`, destino: d, nota: String(nota ?? ''), estado: 'OPEN', creada: iso(ahora), hasta: ahora + DURACION_GOBIERNO.invitacionSeAcepta };
  org.invitaciones.unshift(inv);
  if (org.invitaciones.length > MAX_INVITACIONES) org.invitaciones.length = MAX_INVITACIONES;
  anotar(estado, 'Organizations', 'InviteAccountToOrganization', `${d} (${inv.id})`);
  return inv;
}

export function cancelarInvitacionOrganizacion(estado, invitacionId) {
  const org = orgOError(estado);
  const inv = org.invitaciones.find((i) => i.id === invitacionId);
  if (!inv) throw errorAws('HandshakeNotFoundException', "We can't find a handshake with the HandshakeId that you specified.");
  if (inv.estado !== 'OPEN') throw errorAws('InvalidHandshakeTransitionException', `You can't cancel a handshake that is in the ${inv.estado} state.`);
  inv.estado = 'CANCELED';
  delete inv.hasta;
  anotar(estado, 'Organizations', 'CancelHandshake', `${inv.destino} (${inv.id})`);
  return inv;
}

/** La invitación se acepta (en el simulador, sola después de unos segundos). */
function aceptarInvitacion(estado, org, inv) {
  const esId = /^\d{12}$/.test(inv.destino);
  const id = esId ? inv.destino : idCuentaNuevo(estado, org);
  const correo = esId ? `aws-${id}@example.com` : inv.destino;
  const nombre = esId ? `Account ${id}` : inv.destino.split('@')[0].slice(0, 50);
  org.cuentas.push({ id, arn: arnCuenta(org, id), nombre, correo, padre: org.raiz.id, estado: 'ACTIVE', metodo: 'INVITED', unida: iso(inv.hasta), admin: false, rol: null });
  adjuntarFullAccessSiAplica(org, id);
  inv.estado = 'ACCEPTED';
  inv.cuentaId = id;
  delete inv.hasta;
  anotar(estado, 'Organizations', 'AcceptHandshake', `${inv.destino} se unió como ${id}`);
}

function cuentaOError(org, cuentaId) {
  const c = org.cuentas.find((x) => x.id === cuentaId);
  if (!c) throw errorAws('AccountNotFoundException', "We can't find an AWS account with the AccountId that you specified, or the account whose credentials you used to make this request isn't a member of an organization.");
  return c;
}

/** «Move»: cambia una cuenta de raíz u OU. */
export function moverCuentaOrganizacion(estado, cuentaId, destinoId) {
  const org = orgOError(estado);
  const c = cuentaOError(org, cuentaId);
  if (c.estado === 'CREATING') throw errorAws('ConcurrentModificationException', 'The target of the operation is currently being modified by a different request. Try again later.');
  const destino = padreOError(org, estado, destinoId, 'DestinationParentNotFoundException');
  if (c.padre === destino.id) throw errorAws('DuplicateAccountException', 'That account is already present in the specified destination.');
  const antes = objetivoOrganizacion(estado, c.padre)?.nombre ?? c.padre;
  c.padre = destino.id;
  anotar(estado, 'Organizations', 'MoveAccount', `${c.nombre} (${c.id}): ${antes} → ${destino.nombre}`);
  return c;
}

/** «Close»: solo cuentas creadas desde la organización; quedan suspendidas. */
export function cerrarCuentaOrganizacion(estado, cuentaId) {
  const org = orgOError(estado);
  const c = cuentaOError(org, cuentaId);
  if (c.admin) throw errorAws('ConstraintViolationException', "You can't close the management account from the AWS Organizations console. Sign in to the account and close it from the Account page.");
  if (c.estado === 'SUSPENDED') throw errorAws('AccountAlreadyClosedException', 'You attempted to close an account that is already closed.');
  if (c.estado === 'CREATING') throw errorAws('ConcurrentModificationException', 'The target of the operation is currently being modified by a different request. Try again later.');
  c.estado = 'SUSPENDED';
  anotar(estado, 'Organizations', 'CloseAccount', `${c.nombre} (${c.id})`);
  return c;
}

/**
 * «Remove from organization». Una cuenta invitada sale sin problema. Una
 * creada desde la organización necesita sus propios datos de pago para vivir
 * sola: en el simulador se cierra primero (Close) y ya cerrada se puede quitar.
 */
export function quitarCuentaOrganizacion(estado, cuentaId) {
  const org = orgOError(estado);
  const c = cuentaOError(org, cuentaId);
  if (c.admin) {
    throw errorAws('ConstraintViolationException', "You can't remove the management account from an organization. If you want the management account to become a member account in another organization, you must first delete the current organization.");
  }
  if (c.metodo === 'CREATED' && c.estado !== 'SUSPENDED') {
    throw errorAws('ConstraintViolationException', 'The member account is missing one or more of the prerequisites required to operate as a standalone account. To add what is missing, sign-in to the member account using the AWS Organizations console, then select to leave the organization. You will then be prompted to provide the missing information.');
  }
  org.cuentas = org.cuentas.filter((x) => x !== c);
  for (const p of org.politicas) p.objetivos = p.objetivos.filter((x) => x !== cuentaId);
  anotar(estado, 'Organizations', 'RemoveAccountFromOrganization', `${c.nombre} (${c.id})`);
}

/* ===================================================================== SCP */

/** «Enable service control policies»: FullAWSAccess queda en la raíz, cada OU y cada cuenta. */
export function habilitarScp(estado) {
  const org = orgOError(estado);
  if (org.scpHabilitadas) throw errorAws('PolicyTypeAlreadyEnabledException', 'The specified policy type is already enabled.');
  let full = org.politicas.find((p) => p.id === FULL_AWS_ACCESS);
  if (!full) {
    full = {
      id: FULL_AWS_ACCESS,
      arn: 'arn:aws:organizations::aws:policy/service_control_policy/p-FullAWSAccess',
      nombre: 'FullAWSAccess',
      descripcion: 'Allows access to every operation',
      tipo: 'SERVICE_CONTROL_POLICY',
      administradaPorAws: true,
      documento: DOCUMENTO_FULL_AWS_ACCESS,
      objetivos: [],
      creada: iso()
    };
    org.politicas.unshift(full);
  }
  org.scpHabilitadas = true;
  full.objetivos = [org.raiz.id, ...org.ous.map((o) => o.id), ...org.cuentas.map((c) => c.id)];
  anotar(estado, 'Organizations', 'EnablePolicyType', `SERVICE_CONTROL_POLICY en ${org.raiz.id}`);
  return org;
}

/** «Disable service control policies»: AWS separa todas las SCP de todos lados. */
export function deshabilitarScp(estado) {
  const org = orgOError(estado);
  if (!org.scpHabilitadas) throw errorAws('PolicyTypeNotEnabledException', 'This operation can be performed only for enabled policy types.');
  org.scpHabilitadas = false;
  for (const p of org.politicas) p.objetivos = [];
  anotar(estado, 'Organizations', 'DisablePolicyType', `SERVICE_CONTROL_POLICY en ${org.raiz.id}`);
  return org;
}

const comoLista = (v) => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
const ELEMENTOS_SCP = new Set(['Sid', 'Effect', 'Action', 'NotAction', 'Resource', 'NotResource', 'Condition']);

/**
 * Revisa un documento SCP como el validador del editor de la consola.
 * → { documento: objeto | null, problemas: [{ titulo, mensaje }] } (sin problemas = válido)
 */
export function revisarDocumentoScp(texto) {
  const problemas = [];
  const t = String(texto ?? '');
  const mal = (titulo, mensaje) => problemas.push({ titulo, mensaje });
  if (!t.trim()) {
    mal('Missing policy', 'The policy document is empty. Add at least one statement.');
    return { documento: null, problemas };
  }
  let doc;
  try {
    doc = JSON.parse(t);
  } catch (e) {
    const texto = e?.message ?? '';
    const lc = /line (\d+) column (\d+)/.exec(texto);
    const m = /position (\d+)/.exec(texto);
    const ficha = /Unexpected token '(.+?)'/.exec(texto);
    let donde = ficha ? ` near '${ficha[1]}'` : '';
    if (lc) donde = ` at line ${lc[1]}, column ${lc[2]}`;
    else if (m) {
      const antes = t.slice(0, Number(m[1]));
      const linea = antes.split('\n').length;
      const col = Number(m[1]) - antes.lastIndexOf('\n');
      donde = ` at line ${linea}, column ${col}`;
    }
    mal('JSON Syntax', `Fix the JSON syntax error${donde}. Check for missing commas, quotes, or brackets.`);
    return { documento: null, problemas };
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    mal('JSON Syntax', 'The policy must be a JSON object that starts with { and ends with }.');
    return { documento: null, problemas };
  }
  if (t.length > MAX_TAMANO_SCP) mal('Policy size', `The policy has ${t.length} characters. A service control policy can have up to ${MAX_TAMANO_SCP} characters, including white space.`);
  for (const k of Object.keys(doc)) {
    if (!['Version', 'Statement', 'Id'].includes(k)) mal('Unsupported element', `The policy element ${k} is not supported for the service control policy type.`);
  }
  if (doc.Version === undefined) mal('Missing Version', 'Every SCP must include a Version element with the value "2012-10-17".');
  else if (doc.Version !== '2012-10-17') mal('Invalid Version', 'The Version element must be "2012-10-17".');
  if (doc.Statement === undefined) {
    mal('Missing Statement', 'Add a Statement element to the policy.');
    return { documento: null, problemas };
  }
  const declaraciones = comoLista(doc.Statement);
  if (!declaraciones.length) mal('Missing Statement', 'The Statement element must contain at least one statement.');
  declaraciones.forEach((d, i) => {
    const cual = declaraciones.length > 1 ? ` (statement ${i + 1})` : '';
    if (!d || typeof d !== 'object' || Array.isArray(d)) {
      mal('Invalid statement', `Each statement must be a JSON object${cual}.`);
      return;
    }
    for (const k of Object.keys(d)) {
      if (k === 'Principal' || k === 'NotPrincipal') mal('Unsupported element', `The policy element ${k} is not supported for the service control policy type${cual}. SCPs apply to every principal in the account.`);
      else if (!ELEMENTOS_SCP.has(k)) mal('Unsupported element', `The policy element ${k} is not supported${cual}.`);
    }
    if (d.Effect !== 'Allow' && d.Effect !== 'Deny') mal('Invalid Effect', `The Effect element must be "Allow" or "Deny"${cual}.`);
    const conAccion = d.Action !== undefined;
    const conNoAccion = d.NotAction !== undefined;
    if (conAccion === conNoAccion) mal('Missing Action', `Each statement must include exactly one Action or NotAction element${cual}.`);
    else if (!comoLista(conAccion ? d.Action : d.NotAction).length) mal('Missing Action', `The ${conAccion ? 'Action' : 'NotAction'} element can't be empty. Add at least one action, for example "rds:*"${cual}.`);
    if ((d.Resource !== undefined && !comoLista(d.Resource).length) || (d.NotResource !== undefined && !comoLista(d.NotResource).length)) {
      mal('Missing Resource', `The Resource element can't be empty. Use "Resource": "*" to apply it to all resources${cual}.`);
    }
    for (const a of comoLista(conAccion ? d.Action : d.NotAction)) {
      if (typeof a !== 'string' || !(a === '*' || /^[a-z0-9-]+:[A-Za-z0-9*?]+$/i.test(a))) {
        mal('Invalid Action', `"${typeof a === 'string' ? a : JSON.stringify(a)}" is not a valid action. Use the format service:Action, for example "rds:CreateDBInstance" or "s3:*"${cual}.`);
      }
    }
    const conRecurso = d.Resource !== undefined;
    const conNoRecurso = d.NotResource !== undefined;
    if (conRecurso === conNoRecurso) mal('Missing Resource', `Each statement must include exactly one Resource or NotResource element${cual}. Use "Resource": "*" to apply it to all resources.`);
    if (d.Effect === 'Allow' && conRecurso && comoLista(d.Resource).some((r) => r !== '*')) {
      mal('Invalid Resource', `In statements with "Effect": "Allow", the Resource element can only be "*"${cual}.`);
    }
    if (d.Condition !== undefined && (typeof d.Condition !== 'object' || Array.isArray(d.Condition) || d.Condition === null)) {
      mal('Invalid Condition', `The Condition element must be a JSON object${cual}.`);
    }
  });
  return { documento: problemas.length ? null : doc, problemas };
}

function validarPoliticaScp(org, { nombre, descripcion, documento }, actual) {
  const n = nombreLimpio(nombre, 1000);
  if (!n) throw errorAws('InvalidInputException', 'You must specify a policy name.');
  if (n.length > 128) throw errorAws('InvalidInputException', 'The policy name can be up to 128 characters long.');
  if (org.politicas.some((p) => p !== actual && p.nombre === n)) throw errorAws('DuplicatePolicyException', 'A policy with the same name already exists.');
  const desc = String(descripcion ?? '').trim();
  if (desc.length > 512) throw errorAws('InvalidInputException', 'The policy description can be up to 512 characters long.');
  const texto = String(documento ?? '');
  if (texto.length > MAX_TAMANO_SCP) throw errorAws('ConstraintViolationException', 'The provided policy document exceeds the maximum size allowed for the policy type.');
  if (revisarDocumentoScp(texto).problemas.length) {
    throw errorAws('MalformedPolicyDocumentException', 'The provided policy document does not meet the requirements of the specified policy type.');
  }
  return { nombre: n, descripcion: desc, documento: texto };
}

/** «Create policy» de tipo SCP. `documento` es el texto JSON del editor. */
export function crearPoliticaScp(estado, { nombre, descripcion = '', documento } = {}) {
  const org = orgOError(estado);
  const v = validarPoliticaScp(org, { nombre, descripcion, documento });
  const id = `p-${azar36(8)}`;
  const p = { id, arn: `arn:aws:organizations::${org.cuentaAdmin}:policy/${org.id}/service_control_policy/${id}`, ...v, tipo: 'SERVICE_CONTROL_POLICY', administradaPorAws: false, objetivos: [], creada: iso() };
  org.politicas.push(p);
  anotar(estado, 'Organizations', 'CreatePolicy', `${v.nombre} (${id})`);
  return p;
}

function politicaOError(org, id) {
  const p = org.politicas.find((x) => x.id === id || x.nombre === id);
  if (!p) throw errorAws('PolicyNotFoundException', "We can't find a policy with the PolicyId that you specified.");
  return p;
}

export function editarPoliticaScp(estado, politicaId, cambios = {}) {
  const org = orgOError(estado);
  const p = politicaOError(org, politicaId);
  if (p.administradaPorAws) throw errorAws('AccessDeniedException', "You can't edit or delete an AWS managed policy.");
  const v = validarPoliticaScp(org, { nombre: cambios.nombre ?? p.nombre, descripcion: cambios.descripcion ?? p.descripcion, documento: cambios.documento ?? p.documento }, p);
  Object.assign(p, v);
  anotar(estado, 'Organizations', 'UpdatePolicy', `${p.nombre} (${p.id})`);
  return p;
}

export function eliminarPoliticaScp(estado, politicaId) {
  const org = orgOError(estado);
  const p = politicaOError(org, politicaId);
  if (p.administradaPorAws) throw errorAws('AccessDeniedException', "You can't edit or delete an AWS managed policy.");
  if (p.objetivos.length) {
    throw errorAws('PolicyInUseException', 'The policy is attached to one or more entities. You must detach it from all roots, OUs, and accounts before performing this operation.');
  }
  org.politicas = org.politicas.filter((x) => x !== p);
  anotar(estado, 'Organizations', 'DeletePolicy', `${p.nombre} (${p.id})`);
}

/** «Attach»: la SCP queda sobre la raíz, una OU o una cuenta. */
export function adjuntarPoliticaScp(estado, politicaId, objetivoId) {
  const org = orgOError(estado);
  const p = politicaOError(org, politicaId);
  if (!org.scpHabilitadas) throw errorAws('PolicyTypeNotEnabledException', 'This operation can be performed only for enabled policy types.');
  const obj = objetivoOrganizacion(estado, objetivoId);
  if (!obj) throw errorAws('TargetNotFoundException', "We can't find a root, OU, account, or policy with the TargetId that you specified.");
  if (p.objetivos.includes(obj.id)) throw errorAws('DuplicatePolicyAttachmentException', 'The selected policy is already attached to the specified target.');
  if (politicasDeObjetivo(estado, obj.id).length >= MAX_SCP_POR_OBJETIVO) {
    throw errorAws('ConstraintViolationException', `You have attached the maximum number of service control policies to the target (${MAX_SCP_POR_OBJETIVO}).`);
  }
  p.objetivos.push(obj.id);
  anotar(estado, 'Organizations', 'AttachPolicy', `${p.nombre} → ${obj.nombre} (${obj.id})`);
  return p;
}

/** «Detach». Un objetivo nunca se queda sin SCP: AWS exige al menos una. */
export function desadjuntarPoliticaScp(estado, politicaId, objetivoId) {
  const org = orgOError(estado);
  const p = politicaOError(org, politicaId);
  if (!org.scpHabilitadas) throw errorAws('PolicyTypeNotEnabledException', 'This operation can be performed only for enabled policy types.');
  if (!p.objetivos.includes(objetivoId)) throw errorAws('PolicyNotAttachedException', "The policy isn't attached to the specified target in the specified root.");
  if (politicasDeObjetivo(estado, objetivoId).length <= 1) {
    throw errorAws('ConstraintViolationException', 'You attempted to detach a policy from an entity that would leave it with fewer than the minimum number of policies of that type (1). Attach another SCP first, then detach this one.');
  }
  p.objetivos = p.objetivos.filter((x) => x !== objetivoId);
  anotar(estado, 'Organizations', 'DetachPolicy', `${p.nombre} ✕ ${objetivoOrganizacion(estado, objetivoId)?.nombre ?? objetivoId} (${objetivoId})`);
  return p;
}

/** Las SCP puestas directo en un objetivo. */
export function politicasDeObjetivo(estado, objetivoId) {
  const org = estado.organizations;
  if (!org) return [];
  return org.politicas.filter((p) => p.objetivos.includes(objetivoId));
}

/** Las SCP que el objetivo hereda de sus padres: [{ objetivo, politicas }] de la raíz hacia abajo. */
export function politicasHeredadas(estado, objetivoId) {
  return rutaOrganizacion(estado, objetivoId)
    .slice(0, -1)
    .map((id) => ({ objetivo: objetivoOrganizacion(estado, id), politicas: politicasDeObjetivo(estado, id) }));
}

/* ------------------------------------------------- evaluación de las SCP */

/** «rds:Create*» contra «rds:CreateDBInstance» (sin distinguir mayúsculas; * y ?). */
function coincide(patron, valor) {
  const p = String(patron).toLowerCase();
  const v = String(valor).toLowerCase();
  let i = 0;
  let j = 0;
  let estrella = -1;
  let marca = 0;
  while (j < v.length) {
    if (i < p.length && (p[i] === '?' || p[i] === v[j])) {
      i++;
      j++;
    } else if (i < p.length && p[i] === '*') {
      estrella = i++;
      marca = j;
    } else if (estrella >= 0) {
      i = estrella + 1;
      j = ++marca;
    } else return false;
  }
  while (p[i] === '*') i++;
  return i === p.length;
}

// Operadores de condición que entiende el simulador. Con la llave ausente, los
// negados («NotEquals», «NotLike») dan verdadero, igual que en IAM.
const OPERADORES = {
  StringEquals: (v, lista) => lista.some((x) => String(x) === v),
  StringNotEquals: (v, lista) => !lista.some((x) => String(x) === v),
  StringEqualsIgnoreCase: (v, lista) => lista.some((x) => String(x).toLowerCase() === v.toLowerCase()),
  StringNotEqualsIgnoreCase: (v, lista) => !lista.some((x) => String(x).toLowerCase() === v.toLowerCase()),
  StringLike: (v, lista) => lista.some((x) => coincide(x, v)),
  StringNotLike: (v, lista) => !lista.some((x) => coincide(x, v))
};

function cumpleCondicion(condicion, contexto) {
  if (!condicion) return true;
  for (const [operadorCompleto, pares] of Object.entries(condicion)) {
    const siExiste = operadorCompleto.endsWith('IfExists');
    const operador = operadorCompleto.replace(/IfExists$/, '');
    const fn = OPERADORES[operador];
    if (!fn) return false; // un operador que el simulador no entiende: la declaración no aplica
    for (const [llave, valores] of Object.entries(pares ?? {})) {
      const real = Object.entries(contexto).find(([k]) => k.toLowerCase() === llave.toLowerCase())?.[1];
      if (real === undefined || real === null) {
        if (siExiste || operador.includes('Not')) continue;
        return false;
      }
      if (!fn(String(real), comoLista(valores))) return false;
    }
  }
  return true;
}

function declaracionAplica(d, accion, contexto) {
  const acciones = d.Action !== undefined ? comoLista(d.Action) : comoLista(d.NotAction);
  const enLista = acciones.some((a) => coincide(a, accion));
  if (d.Action !== undefined ? !enLista : enLista) return false;
  if (d.Resource !== undefined) {
    const recursos = comoLista(d.Resource);
    if (!recursos.some((r) => r === '*' || (contexto.recurso && coincide(r, contexto.recurso)))) return false;
  } else if (d.NotResource !== undefined && contexto.recurso && comoLista(d.NotResource).some((r) => coincide(r, contexto.recurso))) {
    return false;
  }
  return cumpleCondicion(d.Condition, contexto);
}

function declaracionesDe(p) {
  try {
    return comoLista(JSON.parse(p.documento).Statement).filter((d) => d && typeof d === 'object');
  } catch {
    return [];
  }
}

/**
 * ¿Una SCP deja hacer `accion` (por ejemplo 'rds:CreateDBInstance') en la cuenta?
 * Así evalúa AWS: un Deny explícito en cualquier nivel (raíz, OU o cuenta) gana;
 * y en CADA nivel debe haber alguna SCP que lo permita (si no, deny implícito).
 * `contexto` (opcional): { region: 'us-east-1', recurso: 'arn:…', 'ec2:InstanceType': 't3.micro' }.
 * → { permitida, politica: nombre de la SCP que niega | null, motivo, nivel }
 *   motivo: 'sin-organizacion' | 'scp-deshabilitadas' | 'cuenta-administracion' | 'deny-explicito' | 'deny-implicito' | 'permitida'
 */
export function accionPermitidaPorScp(estado, cuentaId, accion, contexto = {}) {
  const org = estado?.organizations;
  const cuenta = org?.cuentas.find((c) => c.id === cuentaId);
  if (!org || !cuenta) return { permitida: true, politica: null, motivo: 'sin-organizacion', nivel: null };
  if (!org.scpHabilitadas) return { permitida: true, politica: null, motivo: 'scp-deshabilitadas', nivel: null };
  if (cuenta.admin) return { permitida: true, politica: null, motivo: 'cuenta-administracion', nivel: null };
  const ctx = { 'aws:RequestedRegion': contexto.region ?? 'us-east-1', ...contexto };
  const niveles = rutaOrganizacion(estado, cuentaId);
  // 1. Un Deny explícito en cualquier nivel gana siempre.
  for (const nivel of niveles) {
    for (const p of politicasDeObjetivo(estado, nivel)) {
      if (declaracionesDe(p).some((d) => d.Effect === 'Deny' && declaracionAplica(d, accion, ctx))) {
        return { permitida: false, politica: p.nombre, motivo: 'deny-explicito', nivel };
      }
    }
  }
  // 2. Cada nivel debe tener un Allow que cubra la acción.
  for (const nivel of niveles) {
    const permite = politicasDeObjetivo(estado, nivel).some((p) => declaracionesDe(p).some((d) => d.Effect === 'Allow' && declaracionAplica(d, accion, ctx)));
    if (!permite) return { permitida: false, politica: null, motivo: 'deny-implicito', nivel };
  }
  return { permitida: true, politica: null, motivo: 'permitida', nivel: null };
}

/* ================================================= facturación consolidada */

const redondea = (n) => Math.round(n * 100) / 100;

/**
 * Lo que la cuenta de administración paga por cada cuenta este mes (una sola
 * factura). La de administración sale de Billing (costoMensual); las miembro
 * tienen un gasto sintético estable: 1 hora simulada = 1 minuto real.
 * → { cuentas: [{ id, nombre, admin, estado, monto }], total } | null sin organización
 */
export function facturacionConsolidada(estado, ahora = reloj.ahora()) {
  const org = estado?.organizations;
  if (!org) return null;
  const propio = llamar('costoMensual', estado, {});
  const montoAdmin = typeof propio === 'number' ? propio : Number(propio?.total ?? propio?.monto ?? 0) || 0;
  const cuentas = org.cuentas.map((c) => {
    if (c.admin) return { id: c.id, nombre: c.nombre, admin: true, estado: c.estado, monto: redondea(montoAdmin) };
    if (c.estado === 'CREATING') return { id: c.id, nombre: c.nombre, admin: false, estado: c.estado, monto: 0 };
    const semilla = Number(c.id.slice(-5)) || 0;
    const porHora = 0.01 + (semilla % 50) / 1000; // de 1 a 6 centavos por hora simulada
    const horas = Math.max(0, (ahora - Date.parse(c.unida)) / 60000);
    const previo = c.metodo === 'INVITED' ? 3 + (semilla % 2700) / 100 : 0; // lo que ya llevaba en el mes
    return { id: c.id, nombre: c.nombre, admin: false, estado: c.estado, monto: redondea(previo + porHora * horas) };
  });
  return { cuentas, total: redondea(cuentas.reduce((s, c) => s + c.monto, 0)) };
}

/* ==================================================== WELL-ARCHITECTED TOOL */

export const PILARES_WA = [
  { id: 'OPS', nombre: 'Operational Excellence', es: 'Excelencia operativa' },
  { id: 'SEC', nombre: 'Security', es: 'Seguridad' },
  { id: 'REL', nombre: 'Reliability', es: 'Fiabilidad' },
  { id: 'PERF', nombre: 'Performance Efficiency', es: 'Eficiencia del rendimiento' },
  { id: 'COST', nombre: 'Cost Optimization', es: 'Optimización de costos' },
  { id: 'SUS', nombre: 'Sustainability', es: 'Sostenibilidad' }
];

export const LENTES_WA = [
  { id: 'wellarchitected', nombre: 'AWS Well-Architected Framework', descripcion: 'The AWS Well-Architected Framework Lens provides a set of foundational questions for you to consider for all of your cloud architectures.', disponible: true },
  { id: 'serverless', nombre: 'Serverless Lens', descripcion: 'The AWS Serverless Application Lens provides a set of additional questions for you to consider for your serverless applications.', disponible: false },
  { id: 'saas', nombre: 'SaaS Lens', descripcion: 'The AWS SaaS Lens provides a set of additional questions for you to consider for your Software-as-a-Service (SaaS) applications.', disponible: false }
];

// Banco reducido con preguntas y mejores prácticas reales del Framework
// (docs.aws.amazon.com/wellarchitected/latest/framework). `riesgo` es el que
// queda si NO se sigue esa práctica; `pista` es la explicación en español.
const bp = (id, titulo, riesgo, pista) => ({ id, titulo, riesgo, pista });
const H = 'HIGH';
const M = 'MEDIUM';

export const PREGUNTAS_WA = [
  {
    id: 'OPS1', clave: 'OPS 1', pilar: 'OPS',
    titulo: 'How do you determine what your priorities are?',
    descripcion: 'Everyone should understand their part in enabling business success. Have shared goals in order to set priorities for resources. This will maximize the benefits of your efforts.',
    practicas: [
      bp('OPS01-BP01', 'Evaluate external customer needs', H, 'Pregúntale a tus clientes qué necesitan de verdad.'),
      bp('OPS01-BP02', 'Evaluate internal customer needs', H, 'Considera a los equipos de tu empresa que usan el sistema.'),
      bp('OPS01-BP03', 'Evaluate governance requirements', M, 'Respeta las reglas internas de la empresa.'),
      bp('OPS01-BP04', 'Evaluate compliance requirements', M, 'Cumple leyes y normas (datos personales, facturación…).'),
      bp('OPS01-BP05', 'Evaluate threat landscape', M, 'Conoce las amenazas que podrían afectar al negocio.'),
      bp('OPS01-BP06', 'Evaluate tradeoffs while managing benefits and risks', M, 'Decide qué sacrificar (costo, velocidad, riesgo) y por qué.')
    ]
  },
  {
    id: 'OPS4', clave: 'OPS 4', pilar: 'OPS',
    titulo: 'How do you implement observability in your workload?',
    descripcion: 'Implement observability in your workload so that you can understand its state and make data-driven decisions based on business requirements.',
    practicas: [
      bp('OPS04-BP01', 'Identify key performance indicators', H, 'Define los números que dicen si el negocio va bien (KPI).'),
      bp('OPS04-BP02', 'Implement application telemetry', H, 'Tu aplicación manda métricas y logs (por ejemplo a CloudWatch).'),
      bp('OPS04-BP03', 'Implement user experience telemetry', M, 'Mide lo que vive el usuario: tiempos de carga, errores.'),
      bp('OPS04-BP04', 'Implement dependency telemetry', M, 'Vigila también los servicios de los que dependes.'),
      bp('OPS04-BP05', 'Implement distributed tracing', M, 'Sigue una petición por todos los componentes (AWS X-Ray).')
    ]
  },
  {
    id: 'OPS6', clave: 'OPS 6', pilar: 'OPS',
    titulo: 'How do you mitigate deployment risks?',
    descripcion: 'Adopt approaches that provide fast feedback on quality and achieve rapid recovery from changes that do not have desired outcomes. Using these practices mitigates the impact of issues introduced through the deployment of changes.',
    practicas: [
      bp('OPS06-BP01', 'Plan for unsuccessful changes', H, 'Ten un plan para regresar a la versión anterior.'),
      bp('OPS06-BP02', 'Test deployments', H, 'Prueba los cambios antes de llevarlos a producción.'),
      bp('OPS06-BP03', 'Employ safe deployment strategies', M, 'Despliega poco a poco (canary, blue/green).'),
      bp('OPS06-BP04', 'Automate testing and rollback', M, 'Que las pruebas y el regreso se hagan solos.')
    ]
  },
  {
    id: 'SEC1', clave: 'SEC 1', pilar: 'SEC',
    titulo: 'How do you securely operate your workload?',
    descripcion: 'To operate your workload securely, you must apply overarching best practices to every area of security. Take requirements and processes that you have defined in operational excellence at an organizational and workload level, and apply them to all areas.',
    practicas: [
      bp('SEC01-BP01', 'Separate workloads using accounts', H, 'Una cuenta por ambiente o equipo, con AWS Organizations.'),
      bp('SEC01-BP02', 'Secure account root user and properties', H, 'MFA en la raíz y no usarla para el trabajo diario.'),
      bp('SEC01-BP03', 'Identify and validate control objectives', M, 'Define qué controles de seguridad necesitas y revísalos.'),
      bp('SEC01-BP04', 'Stay up to date with security threats and recommendations', M, 'Lee avisos de seguridad y aplícalos.'),
      bp('SEC01-BP05', 'Reduce security management scope', M, 'Usa servicios administrados: AWS se encarga de más cosas.'),
      bp('SEC01-BP06', 'Automate deployment of standard security controls', M, 'Que los controles se apliquen solos en cada cuenta (SCP, plantillas).'),
      bp('SEC01-BP07', 'Identify threats and prioritize mitigations using a threat model', M, 'Haz un modelo de amenazas y atiende primero lo más grave.'),
      bp('SEC01-BP08', 'Evaluate and implement new security services and features regularly', M, 'Revisa cada cierto tiempo los servicios nuevos de seguridad.')
    ]
  },
  {
    id: 'SEC2', clave: 'SEC 2', pilar: 'SEC',
    titulo: 'How do you manage authentication for people and machines?',
    descripcion: 'There are two types of identities that you need to manage when approaching operating secure AWS workloads: human identities and machine identities.',
    practicas: [
      bp('SEC02-BP01', 'Use strong sign-in mechanisms', H, 'Contraseñas fuertes y MFA para entrar.'),
      bp('SEC02-BP02', 'Use temporary credentials', H, 'Roles con credenciales temporales en vez de llaves fijas.'),
      bp('SEC02-BP03', 'Store and use secrets securely', H, 'Guarda contraseñas en Secrets Manager, no en el código.'),
      bp('SEC02-BP04', 'Rely on a centralized identity provider', H, 'Un solo lugar para las cuentas de la gente (IAM Identity Center).'),
      bp('SEC02-BP05', 'Audit and rotate credentials periodically', M, 'Revisa y cambia las credenciales cada cierto tiempo.'),
      bp('SEC02-BP06', 'Employ user groups and attributes', M, 'Da permisos por grupo, no persona por persona.')
    ]
  },
  {
    id: 'SEC8', clave: 'SEC 8', pilar: 'SEC',
    titulo: 'How do you protect your data at rest?',
    descripcion: 'Protect your data at rest by implementing multiple controls, to reduce the risk of unauthorized access or mishandling.',
    practicas: [
      bp('SEC08-BP01', 'Implement secure key management', H, 'Administra las llaves de cifrado con AWS KMS.'),
      bp('SEC08-BP02', 'Enforce encryption at rest', H, 'Cifra discos, buckets y bases de datos.'),
      bp('SEC08-BP03', 'Automate data at rest protection', M, 'Que el cifrado se active solo (por omisión).'),
      bp('SEC08-BP04', 'Enforce access control', H, 'Solo quien debe puede leer los datos (políticas, bloqueo público).')
    ]
  },
  {
    id: 'REL2', clave: 'REL 2', pilar: 'REL',
    titulo: 'How do you plan your network topology?',
    descripcion: 'Workloads often exist in multiple environments. Plans must include network considerations such as intra- and intersystem connectivity, public IP address management, private IP address management, and domain name resolution.',
    practicas: [
      bp('REL02-BP01', 'Use highly available network connectivity for your workload public endpoints', H, 'La entrada pública aguanta fallas (balanceador, Route 53, CloudFront).'),
      bp('REL02-BP02', 'Provision redundant connectivity between private networks in the cloud and on-premises environments', H, 'Dos conexiones a tu oficina, por si una se cae.'),
      bp('REL02-BP03', 'Ensure IP subnet allocation accounts for expansion and availability', M, 'Deja espacio en tus rangos IP y usa subredes en varias zonas.'),
      bp('REL02-BP04', 'Prefer hub-and-spoke topologies over many-to-many mesh', M, 'Conecta redes con un centro (Transit Gateway), no todas con todas.'),
      bp('REL02-BP05', 'Enforce non-overlapping private IP address ranges in all private address spaces where they are connected', M, 'Que dos redes conectadas no usen el mismo rango IP.')
    ]
  },
  {
    id: 'REL7', clave: 'REL 7', pilar: 'REL',
    titulo: 'How do you design your workload to adapt to changes in demand?',
    descripcion: 'A scalable workload provides elasticity to add or remove resources automatically so that they closely match the current demand at any given point in time.',
    practicas: [
      bp('REL07-BP01', 'Use automation when obtaining or scaling resources', H, 'Auto Scaling agrega y quita servidores solo.'),
      bp('REL07-BP02', 'Obtain resources upon detection of impairment to a workload', M, 'Si algo falla, se reemplaza solo (autocuración).'),
      bp('REL07-BP03', 'Obtain resources upon detection that more resources are needed for a workload', M, 'Escala cuando la métrica dice que hace falta (alarma de CPU).'),
      bp('REL07-BP04', 'Load test your workload', M, 'Haz pruebas de carga para saber cuánto aguanta.')
    ]
  },
  {
    id: 'REL9', clave: 'REL 9', pilar: 'REL',
    titulo: 'How do you back up data?',
    descripcion: 'Back up data, applications, and configuration to meet your requirements for recovery time objectives (RTO) and recovery point objectives (RPO).',
    practicas: [
      bp('REL09-BP01', 'Identify and back up all data that needs to be backed up, or reproduce the data from sources', H, 'Sabes qué datos respaldar (bases, buckets, discos).'),
      bp('REL09-BP02', 'Secure and encrypt backups', H, 'Los respaldos también van cifrados y protegidos.'),
      bp('REL09-BP03', 'Perform data backup automatically', M, 'Respaldos automáticos (RDS, AWS Backup, snapshots programados).'),
      bp('REL09-BP04', 'Perform periodic recovery of the data to verify backup integrity and processes', M, 'Prueba restaurar: un respaldo que no se prueba no sirve.')
    ]
  },
  {
    id: 'REL10', clave: 'REL 10', pilar: 'REL',
    titulo: 'How do you use fault isolation to protect your workload?',
    descripcion: 'Fault isolation limits the impact of a component or system failure to a defined boundary. With proper isolation, components outside of the boundary are unaffected by the failure.',
    practicas: [
      bp('REL10-BP01', 'Deploy the workload to multiple locations', H, 'Varias zonas de disponibilidad (Multi-AZ) o regiones.'),
      bp('REL10-BP02', 'Automate recovery for components constrained to a single location', M, 'Si algo vive en una sola zona, que se recupere solo.'),
      bp('REL10-BP03', 'Use bulkhead architectures to limit scope of impact', M, 'Divide en compartimentos para que una falla no tumbe todo.')
    ]
  },
  {
    id: 'PERF1', clave: 'PERF 1', pilar: 'PERF',
    titulo: 'How do you select appropriate cloud resources and architecture for your workload?',
    descripcion: 'The optimal solution for a particular workload varies, and solutions often combine multiple approaches. Well-Architected workloads use multiple solutions and allow different features to improve performance.',
    practicas: [
      bp('PERF01-BP01', 'Learn about and understand available cloud services and features', H, 'Conoce los servicios que existen antes de elegir.'),
      bp('PERF01-BP02', 'Use guidance from your cloud provider or an appropriate partner to learn about architecture patterns and best practices', M, 'Apóyate en guías y arquitecturas de referencia de AWS.'),
      bp('PERF01-BP03', 'Factor cost into architectural decisions', M, 'El costo también cuenta al diseñar.'),
      bp('PERF01-BP04', 'Evaluate how trade-offs impact customers and architecture efficiency', M, 'Mide qué ganas y qué pierdes con cada opción.'),
      bp('PERF01-BP05', 'Use policies and reference architectures', M, 'Usa diseños ya probados como punto de partida.'),
      bp('PERF01-BP06', 'Use benchmarking to drive architectural decisions', M, 'Compara opciones con pruebas medibles.'),
      bp('PERF01-BP07', 'Use a data-driven approach for architectural choices', M, 'Decide con datos, no con corazonadas.')
    ]
  },
  {
    id: 'PERF2', clave: 'PERF 2', pilar: 'PERF',
    titulo: 'How do you select and use compute resources in your workload?',
    descripcion: 'The optimal compute choice for a particular workload can vary based on application design, usage patterns, and configuration settings. Selecting the wrong compute choice for an architecture can lead to lower performance efficiency.',
    practicas: [
      bp('PERF02-BP01', 'Select the best compute options for your workload', H, 'Instancias, contenedores o Lambda: lo que mejor quede.'),
      bp('PERF02-BP02', 'Understand the available compute configuration and features', M, 'Conoce las familias de instancias y sus opciones.'),
      bp('PERF02-BP03', 'Collect compute-related metrics', H, 'Mide CPU, memoria y red en CloudWatch.'),
      bp('PERF02-BP04', 'Configure and right-size compute resources', M, 'Ni muy grande ni muy chica: right-sizing.'),
      bp('PERF02-BP05', 'Scale your compute resources dynamically', H, 'Escala según la demanda con Auto Scaling.'),
      bp('PERF02-BP06', 'Use optimized hardware-based compute accelerators', M, 'GPU u otros aceleradores si tu carga los necesita.')
    ]
  },
  {
    id: 'PERF3', clave: 'PERF 3', pilar: 'PERF',
    titulo: 'How do you store, manage, and access data in your workload?',
    descripcion: 'The optimal data management solution for a particular system varies based on the kind of data type (block, file, or object), access patterns, required throughput, frequency of access and update, and availability and durability constraints.',
    practicas: [
      bp('PERF03-BP01', 'Use a purpose-built data store that best supports your data access and storage requirements', H, 'La base adecuada para cada dato: RDS, DynamoDB, S3…'),
      bp('PERF03-BP02', 'Evaluate available configuration options for data store', M, 'Revisa las opciones: tipo de disco, clase, capacidad.'),
      bp('PERF03-BP03', 'Collect and record data store performance metrics', M, 'Mide cómo responde tu base de datos.'),
      bp('PERF03-BP04', 'Implement strategies to improve query performance in data store', M, 'Índices y consultas bien hechas.'),
      bp('PERF03-BP05', 'Implement data access patterns that utilize caching', M, 'Usa caché (ElastiCache, CloudFront) para lo que se lee mucho.')
    ]
  },
  {
    id: 'COST2', clave: 'COST 2', pilar: 'COST',
    titulo: 'How do you govern usage?',
    descripcion: 'Establish policies and mechanisms to verify that appropriate costs are incurred while objectives are achieved. By employing a checks-and-balances approach, you can innovate without overspending.',
    practicas: [
      bp('COST02-BP01', 'Develop policies based on your organization requirements', H, 'Reglas claras de qué se puede usar y cuánto.'),
      bp('COST02-BP02', 'Implement goals and targets', H, 'Metas de gasto por equipo o proyecto.'),
      bp('COST02-BP03', 'Implement an account structure', M, 'Cuentas separadas con AWS Organizations y factura consolidada.'),
      bp('COST02-BP04', 'Implement groups and roles', M, 'Solo ciertos grupos pueden crear recursos caros.'),
      bp('COST02-BP05', 'Implement cost controls', H, 'Límites que se cumplen solos: SCP, presupuestos con acciones.'),
      bp('COST02-BP06', 'Track project lifecycle', M, 'Apaga lo que pertenece a proyectos que ya terminaron.')
    ]
  },
  {
    id: 'COST3', clave: 'COST 3', pilar: 'COST',
    titulo: 'How do you monitor your cost and usage?',
    descripcion: 'Establish policies and procedures to monitor and appropriately allocate your costs. This permits you to measure and improve the cost efficiency of this workload.',
    practicas: [
      bp('COST03-BP01', 'Configure detailed information sources', H, 'Activa los reportes detallados de costos (CUR).'),
      bp('COST03-BP02', 'Add organization information to cost and usage', M, 'Etiqueta los recursos por proyecto o área.'),
      bp('COST03-BP03', 'Identify cost attribution categories', H, 'Decide cómo repartir el gasto (por equipo, por cliente).'),
      bp('COST03-BP04', 'Establish organization metrics', M, 'Mide el costo por unidad de negocio (por pedido, por alumno).'),
      bp('COST03-BP05', 'Configure billing and cost management tools', H, 'Usa Cost Explorer y Budgets con alertas.'),
      bp('COST03-BP06', 'Allocate costs based on workload metrics', M, 'Reparte el costo según lo que usa cada carga.')
    ]
  },
  {
    id: 'COST6', clave: 'COST 6', pilar: 'COST',
    titulo: 'How do you meet cost targets when you select resource type, size and number?',
    descripcion: 'Verify that you choose the appropriate resource size and number of resources for the task at hand. You minimize waste by selecting the most cost effective type, size, and number.',
    practicas: [
      bp('COST06-BP01', 'Perform cost modeling', H, 'Estima antes de crear (Pricing Calculator).'),
      bp('COST06-BP02', 'Select resource type, size, and number based on data', M, 'Elige el tamaño mirando métricas reales.'),
      bp('COST06-BP03', 'Select resource type, size, and number automatically based on metrics', M, 'Que el tamaño se ajuste solo (Auto Scaling).'),
      bp('COST06-BP04', 'Consider using shared resources', M, 'Comparte recursos cuando se pueda.')
    ]
  },
  {
    id: 'SUS1', clave: 'SUS 1', pilar: 'SUS',
    titulo: 'How do you select Regions for your workload?',
    descripcion: 'The choice of Region for your workload significantly affects its KPIs, including performance, cost, and carbon footprint. To improve these KPIs, you should choose Regions for your workloads based on both business requirements and sustainability goals.',
    practicas: [
      bp('SUS01-BP01', 'Choose Region based on both business requirements and sustainability goals', M, 'Elige la región por latencia, leyes, costo y energía más limpia.')
    ]
  },
  {
    id: 'SUS2', clave: 'SUS 2', pilar: 'SUS',
    titulo: 'How do you align cloud resources to your demand?',
    descripcion: 'Scale infrastructure to continually match demand and verify that you use only the minimum resources required to support your users. Remove unused assets.',
    practicas: [
      bp('SUS02-BP01', 'Scale workload infrastructure dynamically', M, 'Crece y se encoge con la demanda.'),
      bp('SUS02-BP02', 'Align SLAs with sustainability goals', M, 'No prometas más disponibilidad de la que se necesita.'),
      bp('SUS02-BP03', 'Stop the creation and maintenance of unused assets', M, 'Borra lo que nadie usa (IP sueltas, discos huérfanos).'),
      bp('SUS02-BP04', 'Optimize geographic placement of workloads based on their networking requirements', M, 'Pon los recursos cerca de tus usuarios.'),
      bp('SUS02-BP05', 'Optimize team member resources for activities performed', M, 'Equipos de trabajo adecuados a lo que hace cada persona.'),
      bp('SUS02-BP06', 'Implement buffering or throttling to flatten the demand curve', M, 'Usa colas (SQS) para repartir los picos.')
    ]
  },
  {
    id: 'SUS5', clave: 'SUS 5', pilar: 'SUS',
    titulo: 'How do you select and use cloud hardware and services in your architecture to support your sustainability goals?',
    descripcion: 'Look for opportunities to reduce workload sustainability impacts by making changes to your hardware management practices. Minimize the amount of hardware needed to provision and deploy, and select the most efficient hardware and services for your individual workload.',
    practicas: [
      bp('SUS05-BP01', 'Use the minimum amount of hardware to meet your needs', M, 'Solo el hardware que de verdad ocupas.'),
      bp('SUS05-BP02', 'Use instance types with the least impact', M, 'Instancias más eficientes (por ejemplo Graviton).'),
      bp('SUS05-BP03', 'Use managed services', M, 'Los servicios administrados comparten hardware y desperdician menos.'),
      bp('SUS05-BP04', 'Optimize your use of hardware-based compute accelerators', M, 'Usa GPU solo cuando de verdad aportan.')
    ]
  }
];

export const preguntaWa = (id) => PREGUNTAS_WA.find((p) => p.id === id || p.clave === id) ?? null;

export const ENTORNOS_WA = { PRODUCTION: 'Production', PREPRODUCTION: 'Pre-production' };
export const ESTADOS_MEJORA_WA = {
  NOT_APPLICABLE: 'Not applicable',
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  COMPLETE: 'Complete',
  RISK_ACKNOWLEDGED: 'Risk acknowledged'
};

const normalNombreWa = (n) => String(n).toLowerCase().replace(/\s+/g, '');

function validarCargaWa(estado, p, actual) {
  const largo = (campo, v, min, max) => {
    const t = String(v ?? '').trim();
    if (t.length < min || t.length > max) {
      throw errorAws('ValidationException', `1 validation error detected: Value at '${campo}' failed to satisfy constraint: Member must have length between ${min} and ${max}`);
    }
    return t;
  };
  const nombre = largo('workloadName', p.nombre, 3, 100);
  if (estado.wellarchitected.cargas.some((c) => c !== actual && normalNombreWa(c.nombre) === normalNombreWa(nombre))) {
    throw errorAws('ConflictException', `A workload with the name '${nombre}' already exists. Workload names must be unique.`);
  }
  const descripcion = largo('description', p.descripcion, 3, 250);
  const responsable = largo('reviewOwner', p.responsable, 3, 255);
  if (!ENTORNOS_WA[p.entorno]) throw errorAws('ValidationException', "1 validation error detected: Value at 'environment' failed to satisfy constraint: Member must satisfy enum value set: [PRODUCTION, PREPRODUCTION]");
  const regiones = [...new Set(comoLista(p.regiones).map((r) => String(r).trim()).filter(Boolean))];
  const regionesNoAws = [...new Set(comoLista(p.regionesNoAws).map((r) => String(r).trim().slice(0, 25)).filter(Boolean))];
  if (!regiones.length && !regionesNoAws.length) throw errorAws('ValidationException', 'At least one of AwsRegions or NonAwsRegions must be specified.');
  const cuentas = [...new Set(comoLista(p.cuentas).map((c) => String(c).trim()).filter(Boolean))];
  for (const c of cuentas) if (!/^\d{12}$/.test(c)) throw errorAws('ValidationException', `Invalid AWS account ID '${c}'. An account ID must have 12 digits.`);
  const lentes = [...new Set(comoLista(p.lentes ?? ['wellarchitected']))];
  if (!lentes.includes('wellarchitected')) throw errorAws('ValidationException', 'The AWS Well-Architected Framework lens must be applied to the workload.');
  for (const l of lentes) if (!LENTES_WA.some((x) => x.id === l && x.disponible)) throw errorAws('ValidationException', `Lens '${l}' is not available.`);
  return {
    nombre,
    descripcion,
    responsable,
    entorno: p.entorno,
    regiones,
    regionesNoAws,
    cuentas,
    arquitectura: String(p.arquitectura ?? '').trim().slice(0, 2048),
    industriaTipo: String(p.industriaTipo ?? '').trim().slice(0, 100),
    lentes
  };
}

function cargaOError(estado, id) {
  iniciar(estado);
  const c = estado.wellarchitected.cargas.find((x) => x.id === id);
  if (!c) throw errorAws('ResourceNotFoundException', `No workload found with ID '${id}'.`);
  return c;
}

/** «Define workload». */
export function crearCargaWa(estado, p = {}) {
  iniciar(estado);
  if (estado.wellarchitected.cargas.length >= MAX_CARGAS_WA) throw errorAws('ServiceQuotaExceededException', `You have reached the maximum number of workloads (${MAX_CARGAS_WA}) in this simulator.`);
  const v = validarCargaWa(estado, p);
  const id = hexAzar(32);
  const carga = {
    id,
    arn: `arn:aws:wellarchitected:us-east-1:${estado.cuenta.id}:workload/${id}`,
    ...v,
    estadoMejora: 'NOT_APPLICABLE',
    respuestas: {},
    hitos: [],
    creada: iso(),
    actualizada: iso()
  };
  estado.wellarchitected.cargas.push(carga);
  anotar(estado, 'WellArchitected', 'CreateWorkload', `${v.nombre} · ${ENTORNOS_WA[v.entorno]} · ${[...v.regiones, ...v.regionesNoAws].join(', ')}`);
  return carga;
}

/** «Edit» de las propiedades (y el Improvement status). */
export function editarCargaWa(estado, cargaId, cambios = {}) {
  const c = cargaOError(estado, cargaId);
  const v = validarCargaWa(estado, { ...c, ...cambios }, c);
  Object.assign(c, v);
  if (cambios.estadoMejora !== undefined) {
    if (!ESTADOS_MEJORA_WA[cambios.estadoMejora]) throw errorAws('ValidationException', `Invalid improvement status '${cambios.estadoMejora}'.`);
    c.estadoMejora = cambios.estadoMejora;
  }
  c.actualizada = iso();
  anotar(estado, 'WellArchitected', 'UpdateWorkload', c.nombre);
  return c;
}

export function eliminarCargaWa(estado, cargaId) {
  const c = cargaOError(estado, cargaId);
  estado.wellarchitected.cargas = estado.wellarchitected.cargas.filter((x) => x !== c);
  anotar(estado, 'WellArchitected', 'DeleteWorkload', c.nombre);
}

/**
 * Contesta una pregunta: las prácticas que sí sigues, «None of these» o
 * «Question does not apply to this workload». Sin nada elegido, la pregunta
 * vuelve a quedar sin contestar.
 */
export function responderPreguntaWa(estado, cargaId, preguntaId, { elegidas = [], ninguna = false, noAplica = false, notas = '' } = {}) {
  const c = cargaOError(estado, cargaId);
  const q = preguntaWa(preguntaId);
  if (!q) throw errorAws('ResourceNotFoundException', `No question found with ID '${preguntaId}'.`);
  const validas = new Set(q.practicas.map((b) => b.id));
  const lista = [...new Set(comoLista(elegidas))];
  for (const b of lista) if (!validas.has(b)) throw errorAws('ValidationException', `Choice '${b}' is not valid for question '${q.clave}'.`);
  if (ninguna && lista.length) throw errorAws('ValidationException', "You can't select 'None of these' together with other best practices.");
  const n = String(notas ?? '');
  if (n.length > 2084) throw errorAws('ValidationException', 'Notes can have up to 2,084 characters.');
  if (!lista.length && !ninguna && !noAplica) {
    if (n.trim()) c.respuestas[q.id] = { elegidas: [], ninguna: false, noAplica: false, notas: n };
    else delete c.respuestas[q.id];
  } else {
    c.respuestas[q.id] = { elegidas: q.practicas.map((b) => b.id).filter((id) => lista.includes(id)), ninguna: Boolean(ninguna), noAplica: Boolean(noAplica), notas: n };
  }
  c.actualizada = iso();
  anotar(estado, 'WellArchitected', 'UpdateAnswer', `${c.nombre} · ${q.clave}: ${noAplica ? 'no aplica' : ninguna ? 'none of these' : `${lista.length} de ${q.practicas.length}`}`);
  return c.respuestas[q.id] ?? null;
}

const contestada = (r) => Boolean(r && (r.elegidas.length || r.ninguna || r.noAplica));

/**
 * El riesgo de una pregunta según lo que se contestó:
 * 'UNANSWERED' | 'NOT_APPLICABLE' | 'HIGH' | 'MEDIUM' | 'NONE'.
 * Es el riesgo mayor de las prácticas que faltan.
 */
export function riesgoPreguntaWa(pregunta, respuesta) {
  const q = typeof pregunta === 'string' ? preguntaWa(pregunta) : pregunta;
  if (!q || !contestada(respuesta)) return 'UNANSWERED';
  if (respuesta.noAplica) return 'NOT_APPLICABLE';
  const faltan = q.practicas.filter((b) => !respuesta.elegidas.includes(b.id));
  if (faltan.some((b) => b.riesgo === 'HIGH')) return 'HIGH';
  if (faltan.length) return 'MEDIUM';
  return 'NONE';
}

/** Contestadas y riesgos de un juego de respuestas (de la carga o de un hito), en total y por pilar. */
export function resumenWa(respuestas = {}) {
  const vacio = () => ({ total: 0, contestadas: 0, alto: 0, medio: 0, ninguno: 0, noAplica: 0 });
  const r = { ...vacio(), porPilar: Object.fromEntries(PILARES_WA.map((p) => [p.id, vacio()])) };
  for (const q of PREGUNTAS_WA) {
    const riesgo = riesgoPreguntaWa(q, respuestas[q.id]);
    for (const o of [r, r.porPilar[q.pilar]]) {
      o.total++;
      if (riesgo !== 'UNANSWERED') o.contestadas++;
      if (riesgo === 'HIGH') o.alto++;
      if (riesgo === 'MEDIUM') o.medio++;
      if (riesgo === 'NONE') o.ninguno++;
      if (riesgo === 'NOT_APPLICABLE') o.noAplica++;
    }
  }
  return r;
}

/** Improvement plan: las preguntas con riesgo (altas primero) y las prácticas que faltan. */
export function planMejoraWa(carga) {
  const orden = Object.fromEntries(PILARES_WA.map((p, i) => [p.id, i]));
  return PREGUNTAS_WA.map((q) => ({ pregunta: q, riesgo: riesgoPreguntaWa(q, carga.respuestas[q.id]) }))
    .filter((x) => x.riesgo === 'HIGH' || x.riesgo === 'MEDIUM')
    .map((x) => ({ ...x, faltantes: x.pregunta.practicas.filter((b) => !carga.respuestas[x.pregunta.id].elegidas.includes(b.id)) }))
    .sort((a, b) => (a.riesgo === b.riesgo ? orden[a.pregunta.pilar] - orden[b.pregunta.pilar] : a.riesgo === 'HIGH' ? -1 : 1));
}

/** «Save milestone»: una foto de las respuestas para comparar después. */
export function guardarHitoWa(estado, cargaId, nombre) {
  const c = cargaOError(estado, cargaId);
  const n = String(nombre ?? '').trim();
  if (n.length < 3 || n.length > 100) throw errorAws('ValidationException', "1 validation error detected: Value at 'milestoneName' failed to satisfy constraint: Member must have length between 3 and 100");
  if (c.hitos.some((h) => normalNombreWa(h.nombre) === normalNombreWa(n))) throw errorAws('ConflictException', `A milestone with the name '${n}' already exists for this workload.`);
  if (c.hitos.length >= MAX_HITOS_WA) throw errorAws('ServiceQuotaExceededException', `You have reached the maximum number of milestones (${MAX_HITOS_WA}) for this workload in this simulator.`);
  const hito = { numero: (c.hitos.at(-1)?.numero ?? 0) + 1, nombre: n, fecha: iso(), respuestas: JSON.parse(JSON.stringify(c.respuestas)) };
  c.hitos.push(hito);
  anotar(estado, 'WellArchitected', 'CreateMilestone', `${c.nombre} · ${n}`);
  return hito;
}

/* ================================================================ el reloj */

function avanzar(estado, ahora) {
  const org = estado.organizations;
  if (!org) return false;
  let cambio = false;
  for (const c of org.cuentas) {
    if (c.estado === 'CREATING' && c.hasta <= ahora) {
      c.estado = 'ACTIVE';
      delete c.hasta;
      cambio = true;
    }
  }
  for (const inv of org.invitaciones) {
    if (inv.estado === 'OPEN' && inv.hasta <= ahora) {
      aceptarInvitacion(estado, org, inv);
      cambio = true;
    }
  }
  return cambio;
}

registrarExtension({
  id: 'gobierno',
  orden: 90,
  iniciar,
  avanzar,
  funciones: { accionPermitidaPorScp, facturacionConsolidada }
});
