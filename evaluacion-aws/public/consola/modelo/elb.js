// ---------------------------------------------------------------------------
// ELASTIC LOAD BALANCING (ELB)
//
// Los balanceadores (Application, Network y Gateway) y sus grupos de destino
// (target groups). Solo el Application Load Balancer (ALB) mueve tráfico de
// verdad en el simulador: el navegador abre su DNS y red.js recorre el camino
// casa → ALB → instancia sana. El NLB y el GWLB se pueden crear y ver, pero no
// reparten tráfico.
//
// La salud de cada destino se CALCULA con red.js (¿la instancia está running?,
// ¿su grupo de seguridad deja entrar el puerto desde el grupo del ALB?, ¿hay un
// servidor web corriendo según su user data?, ¿existe la ruta del health
// check?) y cambia de estado con los umbrales, como en AWS, pero con el tiempo
// comprimido (SIMULADOR.md §3): un chequeo cada 5 s.
//
// La forma de las colecciones:
//
// estado.elb = {
//   balanceadores: [{
//     arn, nombre, tipo: 'application' | 'network' | 'gateway',
//     esquema: 'internet-facing' | 'internal', tipoIp: 'ipv4',
//     dns,                         // alb-web-1234567890.us-east-1.elb.amazonaws.com
//     zonaHospedada,               // Z35SXDOTRQ7X7K (ALB) | Z26RNL4JYFTOTI (NLB)
//     vpcId, subredes: [subredId], // una por zona
//     gruposSeguridad: [sgId],     // el NLB puede no tener; el GWLB nunca tiene
//     estado: 'provisioning' | 'active', hasta?, siguiente?, activoDesde?,
//     protegido: false,            // Deletion protection
//     oyentes: [{
//       arn, protocolo: 'HTTP' | 'TCP' | 'UDP' | 'TCP_UDP' | 'TLS' | 'GENEVE', puerto,
//       accion: { tipo: 'forward', tgArn } | { tipo: 'fixed-response', codigo, cuerpo },
//       reglas: [{ arn, prioridad, rutas: ['/api/*'], tgArn }]    // solo ALB, además de la Default
//     }],
//     etiquetas: [{ llave, valor }], creado
//   }],
//   gruposDestino: [{
//     arn, nombre, tipoDestino: 'instance', protocolo, puerto, versionProtocolo: 'HTTP1' | null,
//     vpcId, tipoIp: 'ipv4',
//     chequeo: { protocolo, ruta, puerto: 'traffic-port' | número, sanos, insanos, espera, intervalo, codigos: '200' },
//     retraso: 300,                // Deregistration delay (segundos de AWS; en el simulador, DURACION_ELB.drenado)
//     modificado,                  // ms: cuándo cambió el health check (la salud vuelve a contar desde ahí)
//     destinos: [{
//       id: 'i-…', puerto,
//       salud: 'initial' | 'healthy' | 'unhealthy' | 'unused' | 'draining',
//       motivo: { codigo: 'Target.Timeout', descripcion: 'Request timed out' } | null,
//       registrado, desde, visto, ultimo: 'ok' | 'falla' | null, hasta?   // ms; `desde`: desde cuándo dura el resultado `ultimo`
//     }],
//     etiquetas: [{ llave, valor }], creado
//   }]
// }
//
// Regla del ciclo de módulos: nada de lo importado de modelo.js o de red.js se
// usa en el nivel superior de este archivo, solo dentro de funciones.
// ---------------------------------------------------------------------------

import { registrarExtension } from './registro.js';
import { aleatorio, anotar, buscar, errorAws, grupoDe, hexAzar, igwDeVpc, instanciaDe, iso, reloj, subredDe } from '../modelo.js';
import { revisarDestino } from '../red.js';

/** Cuánto tarda cada cosa, en milisegundos (tiempo comprimido del simulador). */
export const DURACION_ELB = {
  balanceadorActivo: 20000, // provisioning → active
  chequeo: 5000, // un health check (30 s en AWS)
  drenado: 10000 // draining → fuera (Deregistration delay de 300 s en AWS)
};

const PREFIJO = { application: 'app', network: 'net', gateway: 'gwy' };
const ZONA_HOSPEDADA = { application: 'Z35SXDOTRQ7X7K', network: 'Z26RNL4JYFTOTI', gateway: '' };

/** Lo que admite cada tipo de balanceador en sus listeners. */
export const PROTOCOLOS_OYENTE = {
  application: ['HTTP', 'HTTPS'],
  network: ['TCP', 'TLS', 'UDP', 'TCP_UDP'],
  gateway: ['GENEVE']
};
export const PROTOCOLOS_GRUPO = ['HTTP', 'HTTPS', 'TCP', 'TLS', 'UDP', 'TCP_UDP', 'GENEVE'];

const MOTIVOS = {
  registro: ['Elb.RegistrationInProgress', 'Target registration is in progress'],
  inicial: ['Elb.InitialHealthChecking', 'Initial health checks in progress'],
  sinUso: ['Target.NotInUse', 'Target group is not configured to receive traffic from the load balancer'],
  zona: ['Target.NotInUse', 'Target is in an Availability Zone that is not enabled for the load balancer'],
  detenida: ['Target.InvalidState', 'Target is in the stopped state'],
  terminada: ['Target.InvalidState', 'Target is in the terminated state'],
  drenando: ['Target.DeregistrationInProgress', 'Target deregistration is in progress']
};
const motivo = (clave) => ({ codigo: MOTIVOS[clave][0], descripcion: MOTIVOS[clave][1] });

function iniciar(estado) {
  estado.elb ??= { balanceadores: [], gruposDestino: [] };
  estado.elb.balanceadores ??= [];
  estado.elb.gruposDestino ??= [];
}

/* ================================================================ búsquedas */

const mismoTexto = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

/** Un grupo de destino por ARN o por nombre. null si no existe. */
export function grupoDestinoDe(estado, arnONombre) {
  iniciar(estado);
  const v = String(arnONombre ?? '').trim();
  return estado.elb.gruposDestino.find((g) => g.arn === v || mismoTexto(g.nombre, v)) ?? null;
}

/** Un balanceador por ARN o por nombre. null si no existe. */
export function balanceadorDe(estado, arnONombre) {
  iniciar(estado);
  const v = String(arnONombre ?? '').trim();
  return estado.elb.balanceadores.find((b) => b.arn === v || mismoTexto(b.nombre, v)) ?? null;
}

/** El balanceador cuyo DNS es `dns` (sin importar mayúsculas). Lo usa red.js para «¿abre la página?». */
export function balanceadorPorDns(estado, dns) {
  iniciar(estado);
  const host = String(dns ?? '').trim().toLowerCase().replace(/^dualstack\./, '').replace(/\.$/, '');
  return estado.elb.balanceadores.find((b) => b.dns.toLowerCase() === host) ?? null;
}

/** Los ARN de grupos de destino que usa un listener (acción por omisión y reglas). */
export const gruposDeOyente = (o) => [...new Set([o.accion?.tipo === 'forward' ? o.accion.tgArn : null, ...(o.reglas ?? []).map((r) => r.tgArn)].filter(Boolean))];

/** Los balanceadores que mandan tráfico a un grupo de destino (por sus listeners o reglas). */
export function balanceadoresDeGrupo(estado, tg) {
  iniciar(estado);
  return estado.elb.balanceadores.filter((b) => b.oyentes.some((o) => gruposDeOyente(o).includes(tg.arn)));
}

/** Salud de un destino: 'initial' | 'healthy' | 'unhealthy' | 'unused' | 'draining' | null (no registrado). */
export function saludDestino(estado, tgArn, instanciaId) {
  const tg = grupoDestinoDe(estado, tgArn);
  return tg?.destinos.find((d) => d.id === instanciaId)?.salud ?? null;
}

/** Cuántos destinos hay en cada estado de salud: { total, healthy, unhealthy, unused, initial, draining }. */
export function conteoSalud(tg) {
  const c = { total: tg.destinos.length, healthy: 0, unhealthy: 0, unused: 0, initial: 0, draining: 0 };
  for (const d of tg.destinos) c[d.salud] = (c[d.salud] ?? 0) + 1;
  return c;
}

/* ============================================================ validaciones */

function validarNombre(nombre, que) {
  const n = String(nombre ?? '').trim();
  const Que = que === 'lb' ? 'Load balancer' : 'Target group';
  const el = que === 'lb' ? 'The load balancer name' : 'The target group name';
  if (!n) throw errorAws('ValidationError', `${Que} name is required`);
  if (n.length > 32) throw errorAws('ValidationError', `${el} '${n}' cannot be longer than '32' characters`);
  if (!/^[a-zA-Z0-9-]+$/.test(n)) throw errorAws('ValidationError', `${Que} name '${n}' can only contain characters that are alphanumeric characters or hyphens(-)`);
  if (n.startsWith('-') || n.endsWith('-')) throw errorAws('ValidationError', `${Que} name '${n}' cannot begin or end with '-'`);
  if (que === 'lb' && /^internal-/i.test(n)) throw errorAws('ValidationError', `Load balancer name '${n}' cannot begin with 'internal-'`);
  return n;
}

const entero = (v, def) => (v === undefined || v === null || v === '' ? def : Number(v));

function validarPuerto(p) {
  const n = Number(p);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw errorAws('ValidationError', `Port '${p}' is not valid. Valid values are between 1 and 65535.`);
  return n;
}

/** «200», «200,202» o «200-299» con códigos entre 200 y 499. */
function validarCodigos(texto) {
  const t = String(texto ?? '200').replace(/\s+/g, '') || '200';
  const ok = t.split(',').every((parte) => {
    const m = /^(\d{3})(?:-(\d{3}))?$/.exec(parte);
    if (!m) return false;
    const [a, b] = [Number(m[1]), Number(m[2] ?? m[1])];
    return a >= 200 && b <= 499 && a <= b;
  });
  if (!ok) throw errorAws('ValidationError', `Health check matcher HTTP code '${t}' must be a value between 200 and 499, a list of values (200,202) or a range (200-299)`);
  return t;
}

const PROTOCOLO_CAPA7 = (p) => p === 'HTTP' || p === 'HTTPS';

function validarChequeo(c = {}, protocoloGrupo) {
  const capa7 = PROTOCOLO_CAPA7(protocoloGrupo);
  const protocolo = c.protocolo ?? (capa7 ? protocoloGrupo : protocoloGrupo === 'GENEVE' ? 'TCP' : 'TCP');
  if (!['HTTP', 'HTTPS', 'TCP'].includes(protocolo)) throw errorAws('ValidationError', `Health check protocol '${protocolo}' is not valid`);
  if (capa7 && protocolo === 'TCP') throw errorAws('ValidationError', `Health check protocol 'TCP' is not supported for target groups with the protocol '${protocoloGrupo}'`);
  const ruta = PROTOCOLO_CAPA7(protocolo) ? String(c.ruta ?? '/').trim() || '/' : null;
  if (ruta !== null && (!ruta.startsWith('/') || ruta.length > 1024)) throw errorAws('ValidationError', `Health check path '${ruta}' must begin with a '/' character and can be at most 1024 characters long`);
  const puerto = c.puerto === undefined || c.puerto === null || c.puerto === '' || c.puerto === 'traffic-port' ? 'traffic-port' : validarPuerto(c.puerto);
  const sanos = entero(c.sanos, 5);
  const insanos = entero(c.insanos, 2);
  const espera = entero(c.espera, capa7 ? 5 : 10);
  const intervalo = entero(c.intervalo, 30);
  if (!Number.isInteger(sanos) || sanos < 2 || sanos > 10) throw errorAws('ValidationError', 'Healthy threshold must be between 2 and 10');
  if (!Number.isInteger(insanos) || insanos < 2 || insanos > 10) throw errorAws('ValidationError', 'Unhealthy threshold must be between 2 and 10');
  if (!Number.isInteger(espera) || espera < 2 || espera > 120) throw errorAws('ValidationError', 'Health check timeout must be between 2 and 120 seconds');
  if (!Number.isInteger(intervalo) || intervalo < 5 || intervalo > 300) throw errorAws('ValidationError', 'Health check interval must be between 5 and 300 seconds');
  if (espera >= intervalo) throw errorAws('ValidationError', 'Health check interval must be greater than the timeout.');
  const codigos = PROTOCOLO_CAPA7(protocolo) ? validarCodigos(c.codigos) : null;
  return { protocolo, ruta, puerto, sanos, insanos, espera, intervalo, codigos };
}

/* ======================================================== grupos de destino */

/**
 * Create target group. p: { nombre, tipoDestino: 'instance', protocolo: 'HTTP', puerto: 80, vpcId,
 *   versionProtocolo: 'HTTP1', chequeo: { protocolo, ruta, puerto, sanos, insanos, espera, intervalo, codigos },
 *   destinos: ['i-…'] | [{ id, puerto }], etiquetas }
 */
export function crearGrupoDestino(estado, p = {}) {
  iniciar(estado);
  const nombre = validarNombre(p.nombre, 'tg');
  if (estado.elb.gruposDestino.some((g) => mismoTexto(g.nombre, nombre))) {
    throw errorAws('DuplicateTargetGroupName', `A target group with the same name '${nombre}' exists, but with different settings`);
  }
  const tipoDestino = p.tipoDestino ?? 'instance';
  if (tipoDestino !== 'instance') throw errorAws('ValidationError', `Target type '${tipoDestino}' is not supported in this simulator. Use 'instance'.`);
  const protocolo = String(p.protocolo ?? 'HTTP').toUpperCase();
  if (!PROTOCOLOS_GRUPO.includes(protocolo)) throw errorAws('ValidationError', `Protocol '${protocolo}' is not valid. Valid values: ${PROTOCOLOS_GRUPO.join(', ')}`);
  const puerto = validarPuerto(p.puerto ?? (protocolo === 'GENEVE' ? 6081 : protocolo === 'HTTPS' ? 443 : 80));
  if (protocolo === 'GENEVE' && puerto !== 6081) throw errorAws('ValidationError', 'The port for target groups with the protocol GENEVE must be 6081');
  const vpc = buscar(estado.vpcs, p.vpcId ?? estado.vpcs.find((v) => v.porDefecto)?.id, 'vpc', 'InvalidVpcID.NotFound');
  const chequeo = validarChequeo(p.chequeo, protocolo);
  const ahora = reloj.ahora();
  const tg = {
    arn: `arn:aws:elasticloadbalancing:us-east-1:${estado.cuenta.id}:targetgroup/${nombre}/${hexAzar(16)}`,
    nombre,
    tipoDestino,
    protocolo,
    puerto,
    versionProtocolo: PROTOCOLO_CAPA7(protocolo) ? p.versionProtocolo ?? 'HTTP1' : null,
    vpcId: vpc.id,
    tipoIp: 'ipv4',
    chequeo,
    retraso: 300,
    modificado: ahora,
    destinos: [],
    etiquetas: limpiarEtiquetas(p.etiquetas),
    creado: iso(ahora)
  };
  estado.elb.gruposDestino.push(tg);
  anotar(estado, 'ELB', 'CreateTargetGroup', `${nombre} ${protocolo}:${puerto} (${tipoDestino}) en ${vpc.id}, health check ${chequeo.protocolo} ${chequeo.ruta ?? ''}`);
  try {
    if (p.destinos?.length) registrarDestinos(estado, tg.arn, p.destinos);
  } catch (e) {
    estado.elb.gruposDestino = estado.elb.gruposDestino.filter((g) => g !== tg);
    throw e;
  }
  return tg;
}

const limpiarEtiquetas = (filas = []) =>
  (filas ?? []).map((f) => ({ llave: String(f.llave ?? '').trim().slice(0, 128), valor: String(f.valor ?? '').trim().slice(0, 256) })).filter((f) => f.llave);

const grupoOError = (estado, arnONombre) => {
  const tg = grupoDestinoDe(estado, arnONombre);
  if (!tg) throw errorAws('TargetGroupNotFound', `Target groups '${arnONombre ?? ''}' not found`);
  return tg;
};

/** Health checks → Edit. */
export function editarChequeoGrupoDestino(estado, arnONombre, chequeo = {}) {
  const tg = grupoOError(estado, arnONombre);
  tg.chequeo = validarChequeo({ ...tg.chequeo, ...chequeo }, tg.protocolo);
  tg.modificado = reloj.ahora();
  anotar(estado, 'ELB', 'ModifyTargetGroup', `${tg.nombre}: health check ${tg.chequeo.protocolo} ${tg.chequeo.ruta ?? ''} (${tg.chequeo.sanos}/${tg.chequeo.insanos}, cada ${tg.chequeo.intervalo} s, códigos ${tg.chequeo.codigos ?? '–'})`);
  return tg;
}

/** Attributes → Edit (solo el Deregistration delay, de 0 a 3600 s). */
export function editarAtributosGrupoDestino(estado, arnONombre, { retraso } = {}) {
  const tg = grupoOError(estado, arnONombre);
  const n = Number(retraso);
  if (!Number.isInteger(n) || n < 0 || n > 3600) throw errorAws('ValidationError', 'Deregistration delay must be between 0 and 3600 seconds');
  tg.retraso = n;
  anotar(estado, 'ELB', 'ModifyTargetGroupAttributes', `${tg.nombre}: deregistration_delay.timeout_seconds=${n}`);
  return tg;
}

export function eliminarGrupoDestino(estado, arnONombre) {
  const tg = grupoOError(estado, arnONombre);
  if (balanceadoresDeGrupo(estado, tg).length) {
    throw errorAws('ResourceInUse', `Target group '${tg.arn}' is currently in use by a listener or a rule`);
  }
  estado.elb.gruposDestino = estado.elb.gruposDestino.filter((g) => g !== tg);
  anotar(estado, 'ELB', 'DeleteTargetGroup', tg.nombre);
}

/**
 * Register targets. `instancias`: ['i-…'] o [{ id, puerto }] (sin puerto = el del grupo).
 * Las instancias pending se pueden registrar (Auto Scaling lo hace al lanzarlas).
 */
export function registrarDestinos(estado, tgArn, instancias = []) {
  const tg = grupoOError(estado, tgArn);
  const lista = (instancias ?? []).map((x) => (typeof x === 'string' ? { id: x } : x)).filter((x) => x?.id);
  if (!lista.length) throw errorAws('ValidationError', 'At least one target must be specified');
  const invalidas = lista.filter((x) => !instanciaDe(estado, x.id));
  if (invalidas.length) throw errorAws('InvalidTarget', `The following targets are not valid instances: ${invalidas.map((x) => `'${x.id}'`).join(', ')}`);
  const apagadas = lista.filter((x) => !['pending', 'running'].includes(instanciaDe(estado, x.id).estado));
  if (apagadas.length) throw errorAws('InvalidTarget', `The following targets are not in a running state and cannot be registered: ${apagadas.map((x) => `'${x.id}'`).join(', ')}`);
  const fuera = lista.filter((x) => instanciaDe(estado, x.id).vpcId !== tg.vpcId);
  if (fuera.length) throw errorAws('InvalidTarget', `The following targets are not in the target group VPC '${tg.vpcId}': ${fuera.map((x) => `'${x.id}'`).join(', ')}`);
  const ahora = reloj.ahora();
  const nuevos = [];
  for (const x of lista) {
    const puerto = x.puerto === undefined || x.puerto === null || x.puerto === '' ? tg.puerto : validarPuerto(x.puerto);
    const ya = tg.destinos.find((d) => d.id === x.id && d.puerto === puerto);
    if (ya && ya.salud !== 'draining') continue;
    const d = ya ?? { id: x.id, puerto };
    Object.assign(d, { salud: 'initial', motivo: motivo('registro'), registrado: ahora, desde: ahora, visto: ahora, ultimo: null });
    delete d.hasta;
    if (!ya) tg.destinos.push(d);
    nuevos.push(d);
  }
  if (nuevos.length) anotar(estado, 'ELB', 'RegisterTargets', `${tg.nombre}: ${nuevos.map((d) => `${d.id}:${d.puerto}`).join(', ')}`);
  return tg;
}

/**
 * Deregister. El destino pasa a `draining` y sale cuando acaba el Deregistration
 * delay; si el grupo no recibe tráfico de ningún balanceador, sale de inmediato.
 */
export function quitarDestinos(estado, tgArn, instancias = []) {
  const tg = grupoOError(estado, tgArn);
  const ids = new Set((instancias ?? []).map((x) => (typeof x === 'string' ? x : x?.id)));
  const enUso = balanceadoresDeGrupo(estado, tg).length > 0;
  const ahora = reloj.ahora();
  const quitados = [];
  for (const d of [...tg.destinos]) {
    if (!ids.has(d.id) || d.salud === 'draining') continue;
    quitados.push(d.id);
    if (!enUso || d.salud === 'unused' || tg.retraso === 0) {
      tg.destinos = tg.destinos.filter((x) => x !== d);
    } else {
      Object.assign(d, { salud: 'draining', motivo: motivo('drenando'), hasta: ahora + DURACION_ELB.drenado });
    }
  }
  if (quitados.length) anotar(estado, 'ELB', 'DeregisterTargets', `${tg.nombre}: ${quitados.join(', ')}`);
  return tg;
}

/* ============================================================ balanceadores */

function validarSubredes(estado, tipo, subredIds, vpcId) {
  const subredes = [...new Set(subredIds ?? [])].map((id) => {
    const s = subredDe(estado, id);
    if (!s) throw errorAws('SubnetNotFound', `The subnet ID '${id}' is not valid`);
    return s;
  });
  if (!subredes.length) {
    throw errorAws('ValidationError', tipo === 'application' ? 'At least two subnets in two different Availability Zones must be specified' : 'At least one subnet must be specified');
  }
  const vpc = vpcId ?? subredes[0].vpcId;
  if (subredes.some((s) => s.vpcId !== vpc)) throw errorAws('InvalidConfigurationRequest', `All subnets must belong to the same VPC '${vpc}'`);
  const zonas = new Set();
  for (const s of subredes) {
    if (zonas.has(s.az)) throw errorAws('InvalidConfigurationRequest', 'A load balancer cannot be attached to multiple subnets in the same Availability Zone');
    zonas.add(s.az);
  }
  if (tipo === 'application' && zonas.size < 2) throw errorAws('ValidationError', 'At least two subnets in two different Availability Zones must be specified');
  return { subredes, vpcId: vpc };
}

function validarGrupos(estado, tipo, ids, vpcId) {
  if (tipo === 'gateway') return [];
  let lista = [...new Set(ids ?? [])];
  // Sin grupos, el ALB toma el grupo «default» de la VPC (como la API).
  if (!lista.length && tipo === 'application') lista = [estado.gruposSeguridad.find((g) => g.vpcId === vpcId && g.porDefecto)?.id].filter(Boolean);
  if (lista.length > 5) throw errorAws('TooManySecurityGroups', 'You can specify at most 5 security groups for a load balancer');
  for (const id of lista) {
    const g = grupoDe(estado, id);
    if (!g) throw errorAws('InvalidSecurityGroup', `The security group '${id}' does not exist`);
    if (g.vpcId !== vpcId) throw errorAws('InvalidSecurityGroup', `Security group '${id}' does not belong to VPC '${vpcId}'`);
  }
  return lista;
}

/** Revisa que un grupo de destino pueda recibir tráfico de este balanceador. */
function validarGrupoParaOyente(estado, lb, protocolo, tgArn) {
  const tg = grupoOError(estado, tgArn);
  if (tg.vpcId !== lb.vpcId) throw errorAws('InvalidConfigurationRequest', `The target group '${tg.arn}' is not in the same VPC as the load balancer`);
  const compatible =
    lb.tipo === 'application' ? PROTOCOLO_CAPA7(tg.protocolo) : lb.tipo === 'gateway' ? tg.protocolo === 'GENEVE' : ['TCP', 'TLS', 'UDP', 'TCP_UDP'].includes(tg.protocolo);
  if (!compatible) throw errorAws('InvalidConfigurationRequest', `Listener protocol '${protocolo}' is not supported with a target group with the protocol '${tg.protocolo}'`);
  const otro = balanceadoresDeGrupo(estado, tg).find((b) => b.arn !== lb.arn);
  if (otro) throw errorAws('TargetGroupAssociationLimit', `The following target groups cannot be associated with more than one load balancer: ${tg.arn}`);
  return tg;
}

function nuevoOyente(estado, lb, o = {}) {
  const protocolo = String(o.protocolo ?? (lb.tipo === 'application' ? 'HTTP' : lb.tipo === 'gateway' ? 'GENEVE' : 'TCP')).toUpperCase();
  if (!PROTOCOLOS_OYENTE[lb.tipo].includes(protocolo)) {
    throw errorAws('ValidationError', `Listener protocol '${protocolo}' must be one of '${PROTOCOLOS_OYENTE[lb.tipo].join(', ')}'`);
  }
  if (protocolo === 'HTTPS' || protocolo === 'TLS') throw errorAws('CertificateNotFound', `A certificate must be specified for ${protocolo} listeners`);
  const puerto = lb.tipo === 'gateway' ? 6081 : validarPuerto(o.puerto ?? 80);
  if (lb.oyentes.some((x) => x.puerto === puerto)) throw errorAws('DuplicateListener', 'A listener already exists on this port for this load balancer');
  const tgArn = o.tgArn ?? o.accion?.tgArn ?? o.grupoDestino;
  if (!tgArn) throw errorAws('ValidationError', 'A default action must be specified for the listener');
  const tg = validarGrupoParaOyente(estado, lb, protocolo, tgArn);
  return {
    arn: `arn:aws:elasticloadbalancing:us-east-1:${estado.cuenta.id}:listener/${lb.arn.split(':loadbalancer/')[1]}/${hexAzar(16)}`,
    protocolo,
    puerto,
    accion: { tipo: 'forward', tgArn: tg.arn },
    reglas: []
  };
}

/** El DNS público que AWS le pone al balanceador. */
function dnsNuevo(nombre, tipo, esquema) {
  if (tipo === 'application') {
    const n = String(1000000000 + Math.floor(aleatorio() * 8999999999));
    return `${esquema === 'internal' ? 'internal-' : ''}${nombre}-${n}.us-east-1.elb.amazonaws.com`.toLowerCase();
  }
  return `${nombre}-${hexAzar(16)}.elb.us-east-1.amazonaws.com`.toLowerCase();
}

/**
 * Create load balancer. p: { nombre, tipo: 'application' | 'network' | 'gateway',
 *   esquema: 'internet-facing' | 'internal', vpcId?, subredes: [subredId] (una por zona),
 *   gruposSeguridad: [sgId], oyentes: [{ protocolo, puerto, tgArn }], etiquetas }
 * Queda en provisioning y pasa a active en DURACION_ELB.balanceadorActivo.
 */
export function crearBalanceador(estado, p = {}) {
  iniciar(estado);
  const nombre = validarNombre(p.nombre, 'lb');
  if (estado.elb.balanceadores.some((b) => mismoTexto(b.nombre, nombre))) {
    throw errorAws('DuplicateLoadBalancerName', `A load balancer with the same name '${nombre}' exists, but with different settings`);
  }
  const tipo = p.tipo ?? 'application';
  if (!PREFIJO[tipo]) throw errorAws('ValidationError', `Load balancer type '${tipo}' is not valid`);
  const esquema = tipo === 'gateway' ? null : p.esquema === 'internal' ? 'internal' : 'internet-facing';
  if (p.vpcId) buscar(estado.vpcs, p.vpcId, 'vpc', 'InvalidVpcID.NotFound');
  const { subredes, vpcId } = validarSubredes(estado, tipo, p.subredes, p.vpcId);
  if (esquema === 'internet-facing' && !igwDeVpc(estado, vpcId)) throw errorAws('InvalidSubnet', `VPC ${vpcId} has no internet gateway`);
  const gruposSeguridad = validarGrupos(estado, tipo, p.gruposSeguridad, vpcId);
  const ahora = reloj.ahora();
  const hex = hexAzar(16);
  const lb = {
    arn: `arn:aws:elasticloadbalancing:us-east-1:${estado.cuenta.id}:loadbalancer/${PREFIJO[tipo]}/${nombre}/${hex}`,
    nombre,
    tipo,
    esquema,
    tipoIp: 'ipv4',
    dns: dnsNuevo(nombre, tipo, esquema),
    zonaHospedada: ZONA_HOSPEDADA[tipo],
    vpcId,
    subredes: subredes.map((s) => s.id),
    gruposSeguridad,
    estado: 'provisioning',
    hasta: ahora + DURACION_ELB.balanceadorActivo,
    siguiente: 'active',
    protegido: false,
    oyentes: [],
    etiquetas: limpiarEtiquetas(p.etiquetas),
    creado: iso(ahora)
  };
  // Los listeners se validan con el balanceador ya armado (necesitan su VPC y su ARN).
  for (const o of p.oyentes ?? []) lb.oyentes.push(nuevoOyente(estado, lb, o));
  if (tipo === 'gateway' && !lb.oyentes.length) throw errorAws('ValidationError', 'A default action must be specified for the listener');
  estado.elb.balanceadores.push(lb);
  anotar(
    estado,
    'ELB',
    'CreateLoadBalancer',
    `${nombre} (${tipo}, ${esquema ?? '–'}) en ${vpcId}, subredes ${lb.subredes.join(', ')}, grupos ${gruposSeguridad.join(', ') || '–'}, listeners ${lb.oyentes.map((o) => `${o.protocolo}:${o.puerto}→${grupoDestinoDe(estado, o.accion.tgArn)?.nombre}`).join(', ') || '–'}`
  );
  return lb;
}

const balanceadorOError = (estado, arnONombre) => {
  const lb = balanceadorDe(estado, arnONombre);
  if (!lb) throw errorAws('LoadBalancerNotFound', `Load balancers '[${arnONombre ?? ''}]' not found`);
  return lb;
};

export function eliminarBalanceador(estado, arnONombre) {
  const lb = balanceadorOError(estado, arnONombre);
  if (lb.protegido) throw errorAws('OperationNotPermitted', `Load balancer '${lb.arn}' cannot be deleted because deletion protection is enabled`);
  estado.elb.balanceadores = estado.elb.balanceadores.filter((b) => b !== lb);
  anotar(estado, 'ELB', 'DeleteLoadBalancer', lb.nombre);
}

/** Attributes → Edit: por ahora solo Deletion protection. */
export function editarAtributosBalanceador(estado, arnONombre, { protegido } = {}) {
  const lb = balanceadorOError(estado, arnONombre);
  if (protegido !== undefined) lb.protegido = Boolean(protegido);
  anotar(estado, 'ELB', 'ModifyLoadBalancerAttributes', `${lb.nombre}: deletion_protection.enabled=${lb.protegido}`);
  return lb;
}

/** Security → Edit security groups. */
export function editarGruposBalanceador(estado, arnONombre, grupoIds = []) {
  const lb = balanceadorOError(estado, arnONombre);
  if (lb.tipo === 'gateway') throw errorAws('InvalidConfigurationRequest', 'Gateway Load Balancers do not support security groups');
  if (lb.tipo === 'application' && !grupoIds.length) throw errorAws('ValidationError', 'At least one security group must be specified');
  lb.gruposSeguridad = validarGrupos(estado, lb.tipo, grupoIds, lb.vpcId);
  anotar(estado, 'ELB', 'SetSecurityGroups', `${lb.nombre}: ${lb.gruposSeguridad.join(', ') || '–'}`);
  return lb;
}

/** Network mapping → Edit subnets. */
export function editarSubredesBalanceador(estado, arnONombre, subredIds = []) {
  const lb = balanceadorOError(estado, arnONombre);
  const { subredes } = validarSubredes(estado, lb.tipo, subredIds, lb.vpcId);
  lb.subredes = subredes.map((s) => s.id);
  anotar(estado, 'ELB', 'SetSubnets', `${lb.nombre}: ${lb.subredes.join(', ')}`);
  return lb;
}

/** Listeners → Add listener. o: { protocolo, puerto, tgArn } */
export function agregarOyente(estado, arnONombre, o = {}) {
  const lb = balanceadorOError(estado, arnONombre);
  const oyente = nuevoOyente(estado, lb, o);
  lb.oyentes.push(oyente);
  anotar(estado, 'ELB', 'CreateListener', `${lb.nombre}: ${oyente.protocolo}:${oyente.puerto} → ${grupoDestinoDe(estado, oyente.accion.tgArn)?.nombre}`);
  return oyente;
}

function oyenteOError(estado, oyenteArn) {
  iniciar(estado);
  for (const lb of estado.elb.balanceadores) {
    const o = lb.oyentes.find((x) => x.arn === oyenteArn);
    if (o) return { lb, o };
  }
  throw errorAws('ListenerNotFound', `One or more listeners not found`);
}

/** Edit listener: cambia el puerto o el grupo de destino de la acción por omisión. */
export function editarOyente(estado, oyenteArn, { puerto, tgArn } = {}) {
  const { lb, o } = oyenteOError(estado, oyenteArn);
  if (puerto !== undefined && lb.tipo !== 'gateway') {
    const n = validarPuerto(puerto);
    if (lb.oyentes.some((x) => x !== o && x.puerto === n)) throw errorAws('DuplicateListener', 'A listener already exists on this port for this load balancer');
    o.puerto = n;
  }
  if (tgArn) o.accion = { tipo: 'forward', tgArn: validarGrupoParaOyente(estado, lb, o.protocolo, tgArn).arn };
  anotar(estado, 'ELB', 'ModifyListener', `${lb.nombre}: ${o.protocolo}:${o.puerto} → ${grupoDestinoDe(estado, o.accion.tgArn)?.nombre ?? '–'}`);
  return o;
}

export function eliminarOyente(estado, oyenteArn) {
  const { lb, o } = oyenteOError(estado, oyenteArn);
  lb.oyentes = lb.oyentes.filter((x) => x !== o);
  anotar(estado, 'ELB', 'DeleteListener', `${lb.nombre}: ${o.protocolo}:${o.puerto}`);
}

/** Add rule (solo ALB): «Path is /api/*» → forward a un grupo de destino. r: { prioridad, rutas: ['/api/*'], tgArn } */
export function agregarReglaOyente(estado, oyenteArn, r = {}) {
  const { lb, o } = oyenteOError(estado, oyenteArn);
  if (lb.tipo !== 'application') throw errorAws('InvalidConfigurationRequest', 'Rules are only supported for Application Load Balancers');
  const prioridad = Number(r.prioridad);
  if (!Number.isInteger(prioridad) || prioridad < 1 || prioridad > 50000) throw errorAws('ValidationError', 'Priority must be between 1 and 50000');
  if (o.reglas.some((x) => x.prioridad === prioridad)) throw errorAws('PriorityInUse', `Priority '${prioridad}' is currently in use`);
  const rutas = (r.rutas ?? []).map((x) => String(x).trim()).filter(Boolean);
  if (!rutas.length) throw errorAws('ValidationError', 'A rule must have at least one condition');
  if (rutas.length > 5) throw errorAws('ValidationError', 'A path pattern condition can have at most 5 values');
  for (const x of rutas) {
    if (x.length > 128 || !/^[A-Za-z0-9_\-.$/~"'@:+&*?]+$/.test(x)) throw errorAws('ValidationError', `Path pattern '${x}' is not valid. It can be up to 128 characters and can include A-Z, a-z, 0-9, _ - . $ / ~ " ' @ : + & * ?`);
  }
  const tg = validarGrupoParaOyente(estado, lb, o.protocolo, r.tgArn);
  const regla = { arn: o.arn.replace(':listener/', ':listener-rule/') + `/${hexAzar(16)}`, prioridad, rutas, tgArn: tg.arn };
  o.reglas.push(regla);
  o.reglas.sort((a, b) => a.prioridad - b.prioridad);
  anotar(estado, 'ELB', 'CreateRule', `${lb.nombre} ${o.protocolo}:${o.puerto}: prioridad ${prioridad}, path ${rutas.join(' o ')} → ${tg.nombre}`);
  return regla;
}

export function eliminarReglaOyente(estado, reglaArn) {
  iniciar(estado);
  for (const lb of estado.elb.balanceadores) {
    for (const o of lb.oyentes) {
      const r = o.reglas.find((x) => x.arn === reglaArn);
      if (!r) continue;
      o.reglas = o.reglas.filter((x) => x !== r);
      anotar(estado, 'ELB', 'DeleteRule', `${lb.nombre} ${o.protocolo}:${o.puerto}: prioridad ${r.prioridad}`);
      return;
    }
  }
  throw errorAws('RuleNotFound', 'One or more rules not found');
}

/* ================================================================ el tiempo */

/** La salud de un destino en este momento (muta el destino). Devuelve false si hay que sacarlo del grupo. */
function revisarSalud(estado, tg, lb, d, ahora) {
  const fijar = (salud, m) => {
    d.salud = salud;
    d.motivo = m;
  };
  if (d.salud === 'draining') return !(d.hasta <= ahora);
  const inst = instanciaDe(estado, d.id);
  d.visto ??= ahora;
  if (!inst || inst.estado === 'terminated' || inst.estado === 'shutting-down') {
    // ELB saca solo a las instancias terminadas.
    if (!inst || (inst.estado === 'terminated' && ahora - (inst.desde ?? 0) >= DURACION_ELB.drenado)) return false;
    fijar('unused', motivo('terminada'));
    d.ultimo = null;
    d.visto = ahora;
    return true;
  }
  const evaluable = (() => {
    if (inst.estado === 'stopped' || inst.estado === 'stopping') return fijar('unused', motivo('detenida')), false;
    if (!lb) return fijar('unused', motivo('sinUso')), false;
    if (!lb.subredes.some((s) => subredDe(estado, s)?.az === inst.az)) return fijar('unused', motivo('zona')), false;
    if (lb.estado !== 'active' || inst.estado !== 'running') return fijar('initial', motivo('registro')), false;
    return true;
  })();
  if (!evaluable) {
    d.ultimo = null;
    d.visto = ahora;
    return true;
  }

  const r = revisarDestino(estado, lb, tg, inst, d.puerto);
  const resultado = r.ok ? 'ok' : 'falla';
  if (d.ultimo !== resultado) {
    // ¿Desde cuándo da este resultado? Con un salto grande de reloj (al calificar)
    // se toma lo último que cambió: el arranque de la instancia, el balanceador
    // que quedó activo, el registro o el cambio del health check.
    d.desde = Math.min(ahora, Math.max(d.visto ?? 0, inst.desde ?? 0, lb.activoDesde ?? 0, d.registrado ?? 0, tg.modificado ?? 0));
    d.ultimo = resultado;
  }
  d.visto = ahora;
  const lleva = ahora - d.desde;
  const paso = DURACION_ELB.chequeo;
  if (resultado === 'ok') {
    // Recién registrado basta un chequeo bueno; para volver de unhealthy, el Healthy threshold.
    const necesita = (d.salud === 'unhealthy' ? tg.chequeo.sanos : 1) * paso;
    if (d.salud !== 'healthy' && lleva >= necesita) fijar('healthy', null);
    else if (d.salud === 'unused') fijar('initial', motivo('inicial'));
    else if (d.salud === 'initial') fijar('initial', motivo('inicial'));
  } else {
    const fallo = { codigo: r.codigo, descripcion: r.descripcion };
    if (d.salud === 'unhealthy') fijar('unhealthy', fallo);
    else if (lleva >= tg.chequeo.insanos * paso) fijar('unhealthy', fallo);
    else if (d.salud !== 'healthy') fijar('initial', motivo('inicial'));
  }
  return true;
}

function avanzar(estado, ahora) {
  iniciar(estado);
  let cambio = false;
  for (const lb of estado.elb.balanceadores) {
    if (!lb.hasta || lb.hasta > ahora) continue;
    lb.estado = lb.siguiente;
    lb.activoDesde = lb.hasta;
    delete lb.hasta;
    delete lb.siguiente;
    cambio = true;
  }
  for (const tg of estado.elb.gruposDestino) {
    // El primer balanceador que le manda tráfico es el que hace los health checks.
    const lb = balanceadoresDeGrupo(estado, tg)[0] ?? null;
    const antes = JSON.stringify(tg.destinos.map((d) => [d.id, d.salud, d.motivo?.descripcion]));
    tg.destinos = tg.destinos.filter((d) => revisarSalud(estado, tg, lb, d, ahora));
    if (JSON.stringify(tg.destinos.map((d) => [d.id, d.salud, d.motivo?.descripcion])) !== antes) cambio = true;
  }
  return cambio;
}

/* ============================================================ dependencias */

function dependenciasVpc(estado, vpcId) {
  iniciar(estado);
  const lb = estado.elb.balanceadores.find((b) => b.vpcId === vpcId);
  if (lb) throw errorAws('DependencyViolation', `The vpc '${vpcId}' has dependencies and cannot be deleted. Delete the load balancer ${lb.nombre} first.`);
}

function dependenciasSubred(estado, subredId) {
  iniciar(estado);
  if (estado.elb.balanceadores.some((b) => b.subredes.includes(subredId))) {
    throw errorAws('DependencyViolation', `The subnet '${subredId}' has dependencies and cannot be deleted.`);
  }
}

function dependenciasGrupo(estado, sgId) {
  iniciar(estado);
  if (estado.elb.balanceadores.some((b) => b.gruposSeguridad.includes(sgId))) {
    throw errorAws('DependencyViolation', `resource ${sgId} has a dependent object`);
  }
}

/**
 * Las versiones que se ofrecen por llamar() a Auto Scaling, que las usa dentro de
 * su avanzar: nunca lanzan (un grupo borrado o una instancia que ya no sirve se
 * ignoran) para no tumbar el reloj de la consola. Devuelven el grupo o null.
 */
function registrarDestinosSeguro(estado, tgArn, instancias = []) {
  const tg = grupoDestinoDe(estado, tgArn);
  if (!tg) return null;
  const validas = (instancias ?? [])
    .map((x) => (typeof x === 'string' ? { id: x } : x))
    .filter((x) => {
      const inst = x?.id ? instanciaDe(estado, x.id) : null;
      return inst && ['pending', 'running'].includes(inst.estado) && inst.vpcId === tg.vpcId;
    });
  if (!validas.length) return tg;
  try {
    return registrarDestinos(estado, tg.arn, validas);
  } catch (e) {
    if (e?.name === 'ErrorAws') return null;
    throw e;
  }
}

function quitarDestinosSeguro(estado, tgArn, instancias = []) {
  const tg = grupoDestinoDe(estado, tgArn);
  return tg ? quitarDestinos(estado, tg.arn, instancias) : null;
}

registrarExtension({
  id: 'elb',
  orden: 10,
  iniciar,
  avanzar,
  dependenciasVpc,
  dependenciasSubred,
  dependenciasGrupo,
  funciones: {
    registrarDestinos: registrarDestinosSeguro,
    quitarDestinos: quitarDestinosSeguro,
    saludDestino,
    grupoDestinoDe,
    balanceadorPorDns,
    crearBalanceador,
    crearGrupoDestino
  }
});
