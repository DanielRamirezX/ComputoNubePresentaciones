// ---------------------------------------------------------------------------
// SNS Y SQS (y el buzón de correo simulado)
//
// Los temas de SNS con sus suscripciones, la publicación de mensajes con su
// abanico (email al buzón, SQS y Lambda), las colas de SQS con sus mensajes
// (visibilidad, retraso, retención, FIFO, cola de mensajes muertos) y el
// buzón donde llegan los correos de AWS Notifications.
//
// La forma de las colecciones:
//
// estado.sns = {
//   temas: [{ arn, nombre, tipo: 'Standard'|'FIFO', nombreMostrar, deduplicacionContenido,
//             politica: null | texto JSON (null = la de omisión, ver politicaTema),
//             cifrado: null | 'alias/aws/sns', etiquetas: [{ llave, valor }], creado,
//             publicados, eventos: [[t, 'p'|'e'|'f', n]],      // publicados / entregadas / fallidas (para métricas)
//             suscripciones: [{ arn, id, temaArn, protocolo: 'email'|'email-json'|'sqs'|'lambda'|'http'|'https'|'sms',
//                               endpoint, estado: 'PendingConfirmation'|'Confirmed', token, creado,
//                               confirmado: null | iso, entregados, fallidos, filtro: null | texto JSON,
//                               entregaCruda: false }] }],
//   buzon: [{ id, fecha, de, para, asunto, cuerpo, leido, origen: 'sns'|'budgets'|'cloudwatch'|…,
//             enlaces: [{ texto, accion: 'confirmar'|'baja', suscripcionArn, url }] }]   // los 60 más nuevos, el más nuevo PRIMERO
//   // En `cuerpo`, una línea «[[…]]» marca dónde va el siguiente enlace; los que
//   // no tengan su marca se pintan al final. Budgets puede usar correoAlBuzon
//   // (por llamar) o empujar aquí un correo con esta forma.
// }
//
// estado.sqs = {
//   colas: [{ nombre, url, arn, tipo: 'Standard'|'FIFO', creado, modificado,
//             visibilidad (s), retencion (s), retraso (s), tamanoMaximo (bytes), espera (s),
//             deduplicacionContenido, altoRendimiento, cifrado: 'SSE-SQS'|'SSE-KMS'|null,
//             politica: null | texto JSON (null = solo el dueño, ver politicaCola),
//             dlq: null | { arn, maxRecepciones }, etiquetas, purgadaEn: null | ms,
//             enviados, recibidos, borrados, eventos: [[t, 's'|'r'|'b', n]],
//             dedups: [[dedupId, t, messageId]],                // FIFO: ventana de 5 minutos
//             mensajes: [{ id, cuerpo, md5, enviado (ms), visibleDesde (ms), recibos, primerRecibo,
//                          recibo, atributos: { nombre: texto }, grupo, dedup, secuencia, origen }] }]  // máximo 120
// }
//
// Los tiempos de SQS (visibilidad, retraso y retención) van en segundos REALES:
// 30 s de visibilidad son 30 s en clase. Solo CloudWatch y compañía van
// acelerados (SIMULADOR.md §3).
//
// Ofrece por llamar(): publicarEnTema, enviarACola, correoAlBuzon,
// crearSuscripcion, eliminarSuscripcion, recibirDeCola, borrarDeCola,
// permitirEnviosACola, coincidePatron y metricaMensajeria.
//
// Regla del ciclo: nada de modelo.js se usa en el nivel superior.
// ---------------------------------------------------------------------------

import { registrarExtension, llamar } from './registro.js';
import { anotar, errorAws, hexAzar, iso, reloj } from '../modelo.js';

// Cuántas cosas guardamos como mucho (el estado debe caber en 512 KB).
const LIMITE_BUZON = 60;
const LIMITE_MENSAJES = 120;
const LIMITE_EVENTOS = 60;
const LIMITE_CUERPO_CORREO = 6000;
// AWS acepta hasta 256 KiB en SNS y 1 MiB en SQS; aquí, por el tamaño del estado, 32 KiB.
const LIMITE_SIMULADOR = 32768;

export const DURACION_MENSAJERIA = {
  esperaPurga: 60_000, // una purga por cola cada 60 s
  ventanaDedup: 5 * 60_000, // FIFO: deduplicación de 5 minutos
  caducaConfirmacion: 48 * 3600_000 // SNS borra las suscripciones sin confirmar a las 48 h
};

export const PROTOCOLOS_SNS = ['email', 'email-json', 'sqs', 'lambda', 'http', 'https', 'sms'];

function iniciar(estado) {
  estado.sns ??= { temas: [], buzon: [] };
  estado.sns.temas ??= [];
  estado.sns.buzon ??= [];
  estado.sqs ??= { colas: [] };
  estado.sqs.colas ??= [];
}

/* ================================================================ ayudas */

/** Un UUID v4 con el azar del simulador. */
export function uuidMensajeria() {
  return `${hexAzar(8)}-${hexAzar(4)}-4${hexAzar(3)}-${'89ab'[Math.floor(Number.parseInt(hexAzar(1), 16) / 4)]}${hexAzar(3)}-${hexAzar(12)}`;
}

const cuentaDe = (estado) => estado.cuenta?.id ?? '123456789012';
const region = (estado) => estado.cuenta?.region ?? 'us-east-1';
const bytes = (texto) => new TextEncoder().encode(String(texto ?? '')).length;

/** Anota un evento [t, tipo, n] en una lista corta (para las métricas de CloudWatch). */
function contar(lista, t, tipo, n = 1) {
  lista.push([t, tipo, n]);
  if (lista.length > LIMITE_EVENTOS) lista.splice(0, lista.length - LIMITE_EVENTOS);
}

/** «arn:aws:sqs:…:x» o el comodín «arn:aws:sns:*:*:x» contra un ARN. */
function arnCoincide(patron, valor) {
  const p = String(patron ?? '');
  if (!p.includes('*') && !p.includes('?')) return p === valor;
  const re = new RegExp(`^${p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
  return re.test(String(valor ?? ''));
}

const lista = (v) => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);

function parsearJson(texto, codigo, mensaje) {
  try {
    const v = JSON.parse(texto);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('no es objeto');
    return v;
  } catch {
    throw errorAws(codigo, mensaje);
  }
}

/* ======================================================= patrones de filtro */

/**
 * ¿Los datos cumplen el patrón? Es la sintaxis de las reglas de EventBridge y
 * de las políticas de filtro de SNS: cada llave del patrón lista los valores
 * aceptados; también { prefix }, { suffix }, { 'anything-but' }, { exists },
 * { numeric: ['>', 10] } y objetos anidados.
 */
export function coincidePatron(patron, datos) {
  if (!patron || typeof patron !== 'object') return false;
  for (const [llave, esperado] of Object.entries(patron)) {
    const valor = datos?.[llave];
    if (esperado && typeof esperado === 'object' && !Array.isArray(esperado)) {
      if (!valor || typeof valor !== 'object' || !coincidePatron(esperado, valor)) return false;
      continue;
    }
    const valores = Array.isArray(valor) ? valor : [valor];
    if (!lista(esperado).some((regla) => valores.some((v) => coincideValor(regla, v, valor !== undefined)))) return false;
  }
  return true;
}

function coincideValor(regla, v, existe) {
  if (regla === null || typeof regla !== 'object') return existe && v === regla;
  if ('exists' in regla) return Boolean(regla.exists) === existe;
  if (!existe) return false;
  if ('prefix' in regla) return typeof v === 'string' && v.startsWith(String(regla.prefix));
  if ('suffix' in regla) return typeof v === 'string' && v.endsWith(String(regla.suffix));
  if ('equals-ignore-case' in regla) return typeof v === 'string' && v.toLowerCase() === String(regla['equals-ignore-case']).toLowerCase();
  if ('anything-but' in regla) {
    const no = regla['anything-but'];
    if (no && typeof no === 'object' && !Array.isArray(no) && 'prefix' in no) return !(typeof v === 'string' && v.startsWith(no.prefix));
    return !lista(no).includes(v);
  }
  if ('numeric' in regla) {
    const n = Number(v);
    if (typeof v === 'boolean' || Number.isNaN(n)) return false;
    const c = regla.numeric;
    for (let i = 0; i + 1 < c.length; i += 2) {
      const lim = Number(c[i + 1]);
      const ok = { '=': n === lim, '>': n > lim, '>=': n >= lim, '<': n < lim, '<=': n <= lim }[c[i]];
      if (!ok) return false;
    }
    return true;
  }
  return false;
}

/* ============================================================== el buzón */

/**
 * Deja un correo en el buzón simulado del alumno. Lo usan SNS (confirmaciones
 * y notificaciones), Budgets y cualquiera que mande un correo de AWS.
 * enlaces: [{ texto, accion: 'confirmar' | 'baja', suscripcionArn, url }]
 */
export function correoAlBuzon(estado, { de = 'AWS Notifications <no-reply@sns.amazonaws.com>', para = '', asunto = '', cuerpo = '', origen = 'sns', enlaces = [] } = {}) {
  iniciar(estado);
  let texto = String(cuerpo ?? '');
  if (texto.length > LIMITE_CUERPO_CORREO) texto = `${texto.slice(0, LIMITE_CUERPO_CORREO)}\n…`;
  const correo = { id: uuidMensajeria(), fecha: iso(), de: String(de), para: String(para), asunto: String(asunto ?? '').slice(0, 200), cuerpo: texto, leido: false, origen, enlaces };
  // El más nuevo va primero (como en una bandeja de entrada) y se van los más viejos.
  estado.sns.buzon.unshift(correo);
  if (estado.sns.buzon.length > LIMITE_BUZON) estado.sns.buzon.length = LIMITE_BUZON;
  return correo;
}

export function marcarCorreoLeido(estado, id, leido = true) {
  iniciar(estado);
  const c = estado.sns.buzon.find((x) => x.id === id);
  if (c) c.leido = Boolean(leido);
  return c ?? null;
}

export function marcarBuzonLeido(estado) {
  iniciar(estado);
  estado.sns.buzon.forEach((c) => (c.leido = true));
}

export function eliminarCorreo(estado, id) {
  iniciar(estado);
  estado.sns.buzon = estado.sns.buzon.filter((c) => c.id !== id);
}

export function vaciarBuzon(estado) {
  iniciar(estado);
  estado.sns.buzon = [];
}

export const correosSinLeer = (estado) => (estado.sns?.buzon ?? []).filter((c) => !c.leido).length;

/* ============================================================ SNS · temas */

const NOMBRE_TEMA = /^[A-Za-z0-9_-]{1,256}$/;
const NOMBRE_TEMA_FIFO = /^[A-Za-z0-9_-]{1,251}\.fifo$/;

export const arnTema = (estado, nombre) => `arn:aws:sns:${region(estado)}:${cuentaDe(estado)}:${nombre}`;

/** Un tema por ARN o por nombre (o null). */
export function temaSns(estado, arnONombre) {
  const temas = estado.sns?.temas ?? [];
  return temas.find((t) => t.arn === arnONombre) ?? temas.find((t) => t.nombre === arnONombre) ?? null;
}

function temaOError(estado, arnONombre) {
  const t = temaSns(estado, arnONombre);
  if (!t) throw errorAws('NotFound', 'Topic does not exist');
  return t;
}

/** La política de acceso del tema (la de omisión si nunca la editaron). */
export function politicaTema(estado, tema) {
  if (tema.politica) return tema.politica;
  return JSON.stringify(
    {
      Version: '2008-10-17',
      Id: '__default_policy_ID',
      Statement: [
        {
          Sid: '__default_statement_ID',
          Effect: 'Allow',
          Principal: { AWS: '*' },
          Action: ['SNS:GetTopicAttributes', 'SNS:SetTopicAttributes', 'SNS:AddPermission', 'SNS:RemovePermission', 'SNS:DeleteTopic', 'SNS:Subscribe', 'SNS:ListSubscriptionsByTopic', 'SNS:Publish'],
          Resource: tema.arn,
          Condition: { StringEquals: { 'AWS:SourceOwner': cuentaDe(estado) } }
        }
      ]
    },
    null,
    2
  );
}

/** «Create topic». Como en AWS, crear otra vez el mismo tema devuelve el que ya existe. */
export function crearTema(estado, { nombre, tipo = 'Standard', nombreMostrar = '', deduplicacionContenido = false, politica = null, cifrado = null, etiquetas = [] } = {}) {
  iniciar(estado);
  const n = String(nombre ?? '').trim();
  const fifo = tipo === 'FIFO';
  if (fifo && !NOMBRE_TEMA_FIFO.test(n)) {
    throw errorAws('InvalidParameter', 'Invalid parameter: Fifo Topic names must end with .fifo and must be made up of only uppercase and lowercase ASCII letters, numbers, underscores, and hyphens, and must be between 1 and 256 characters long.');
  }
  if (!fifo && !NOMBRE_TEMA.test(n)) {
    throw errorAws('InvalidParameter', 'Invalid parameter: Topic Name. Topic names must be made up of only uppercase and lowercase ASCII letters, numbers, underscores, and hyphens, and must be between 1 and 256 characters long.');
  }
  if (String(nombreMostrar ?? '').length > 100) throw errorAws('InvalidParameter', 'Invalid parameter: DisplayName. Maximum 100 characters.');
  if (politica) parsearJson(politica, 'InvalidParameter', 'Invalid parameter: Policy Error: The policy is not valid JSON.');
  const ya = estado.sns.temas.find((t) => t.nombre === n);
  if (ya) {
    if (ya.tipo !== (fifo ? 'FIFO' : 'Standard')) throw errorAws('InvalidParameter', 'Invalid parameter: Attributes Reason: Topic already exists with different attributes');
    return ya;
  }
  const tema = {
    arn: arnTema(estado, n),
    nombre: n,
    tipo: fifo ? 'FIFO' : 'Standard',
    nombreMostrar: String(nombreMostrar ?? '').trim(),
    deduplicacionContenido: fifo && Boolean(deduplicacionContenido),
    politica: politica || null,
    cifrado: cifrado || null,
    etiquetas: etiquetas.filter((e) => e.llave?.trim()).map((e) => ({ llave: e.llave.trim(), valor: e.valor ?? '' })),
    creado: iso(),
    publicados: 0,
    eventos: [],
    suscripciones: []
  };
  estado.sns.temas.push(tema);
  anotar(estado, 'SNS', 'CreateTopic', `${n} (${tema.tipo})`);
  return tema;
}

/** «Edit» del tema: nombre para mostrar, política, deduplicación y cifrado. */
export function editarTema(estado, arnONombre, cambios = {}) {
  iniciar(estado);
  const t = temaOError(estado, arnONombre);
  if (cambios.nombreMostrar !== undefined) {
    if (String(cambios.nombreMostrar).length > 100) throw errorAws('InvalidParameter', 'Invalid parameter: DisplayName. Maximum 100 characters.');
    t.nombreMostrar = String(cambios.nombreMostrar).trim();
  }
  if (cambios.politica !== undefined) {
    if (cambios.politica) parsearJson(cambios.politica, 'InvalidParameter', 'Invalid parameter: Policy Error: The policy is not valid JSON.');
    t.politica = cambios.politica || null;
  }
  if (cambios.deduplicacionContenido !== undefined && t.tipo === 'FIFO') t.deduplicacionContenido = Boolean(cambios.deduplicacionContenido);
  if (cambios.cifrado !== undefined) t.cifrado = cambios.cifrado || null;
  if (cambios.etiquetas) t.etiquetas = cambios.etiquetas.filter((e) => e.llave?.trim()).map((e) => ({ llave: e.llave.trim(), valor: e.valor ?? '' }));
  anotar(estado, 'SNS', 'SetTopicAttributes', t.nombre);
  return t;
}

/** «Delete» del tema: se van también sus suscripciones. */
export function eliminarTema(estado, arnONombre) {
  iniciar(estado);
  const t = temaOError(estado, arnONombre);
  estado.sns.temas = estado.sns.temas.filter((x) => x !== t);
  anotar(estado, 'SNS', 'DeleteTopic', t.nombre);
}

/* ===================================================== SNS · suscripciones */

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_ARN_SQS = /^arn:aws:sqs:[a-z0-9-]+:\d{12}:[A-Za-z0-9_-]{1,80}(\.fifo)?$/;
const RE_ARN_LAMBDA = /^arn:aws:lambda:[a-z0-9-]+:\d{12}:function:[A-Za-z0-9_-]{1,64}(:[A-Za-z0-9_$-]+)?$/;

/** Todas las suscripciones de la cuenta (de todos los temas). */
export const suscripcionesSns = (estado) => (estado.sns?.temas ?? []).flatMap((t) => t.suscripciones);

export function suscripcionSns(estado, arn) {
  return suscripcionesSns(estado).find((s) => s.arn === arn || s.id === arn) ?? null;
}

function suscripcionOError(estado, arn) {
  const s = suscripcionSns(estado, arn);
  if (!s) throw errorAws('NotFound', 'Subscription does not exist');
  return s;
}

const urlConfirmacion = (estado, tema, sub) =>
  `https://sns.${region(estado)}.amazonaws.com/confirmation.html?TopicArn=${tema.arn}&Token=${sub.token}&Endpoint=${encodeURIComponent(sub.endpoint)}`;
const urlBaja = (estado, sub) => `https://sns.${region(estado)}.amazonaws.com/unsubscribe.html?SubscriptionArn=${sub.arn}&Endpoint=${encodeURIComponent(sub.endpoint)}`;

/** El correo «AWS Notification - Subscription Confirmation». */
function correoConfirmacion(estado, tema, sub) {
  const url = urlConfirmacion(estado, tema, sub);
  return correoAlBuzon(estado, {
    de: `${tema.nombreMostrar || 'AWS Notifications'} <no-reply@sns.amazonaws.com>`,
    para: sub.endpoint,
    asunto: 'AWS Notification - Subscription Confirmation',
    cuerpo: [
      'You have chosen to subscribe to the topic:',
      tema.arn,
      '',
      'To confirm this subscription, click or visit the link below (If this was in error no action is necessary):',
      '[[Confirm subscription]]',
      '',
      'Please do not reply directly to this email. If you wish to remove yourself from receiving all future SNS subscription confirmation requests please send an email to sns-opt-out'
    ].join('\n'),
    origen: 'sns',
    enlaces: [{ texto: 'Confirm subscription', accion: 'confirmar', suscripcionArn: sub.arn, url }]
  });
}

/**
 * «Create subscription». protocolo: email | email-json | sqs | lambda | http | https | sms.
 * Email y HTTP/S quedan en PendingConfirmation (el correo llega al buzón);
 * SQS, Lambda y SMS quedan confirmadas de inmediato.
 */
export function crearSuscripcion(estado, { temaArn, protocolo, endpoint, filtro = null, entregaCruda = false } = {}) {
  iniciar(estado);
  const tema = temaOError(estado, temaArn);
  const p = String(protocolo ?? '').toLowerCase();
  const e = String(endpoint ?? '').trim();
  if (!PROTOCOLOS_SNS.includes(p)) throw errorAws('InvalidParameter', `Invalid parameter: Invalid protocol type: ${protocolo}`);
  if (tema.tipo === 'FIFO' && p !== 'sqs') throw errorAws('InvalidParameter', `Invalid parameter: Invalid protocol type: ${p}`);
  if (!e) throw errorAws('InvalidParameter', 'Invalid parameter: Endpoint');
  if ((p === 'email' || p === 'email-json') && !RE_EMAIL.test(e)) throw errorAws('InvalidParameter', 'Invalid parameter: Email address');
  if (p === 'sqs') {
    if (!RE_ARN_SQS.test(e)) throw errorAws('InvalidParameter', 'Invalid parameter: SQS endpoint ARN');
    if (tema.tipo === 'Standard' && e.endsWith('.fifo')) throw errorAws('InvalidParameter', 'Invalid parameter: Endpoint Reason: FIFO SQS Queues can not be subscribed to standard SNS topics');
  }
  if (p === 'lambda' && !RE_ARN_LAMBDA.test(e)) throw errorAws('InvalidParameter', 'Invalid parameter: Lambda endpoint ARN');
  if (p === 'http' && !/^http:\/\/\S+$/i.test(e)) throw errorAws('InvalidParameter', 'Invalid parameter: Endpoint must match the specified protocol');
  if (p === 'https' && !/^https:\/\/\S+$/i.test(e)) throw errorAws('InvalidParameter', 'Invalid parameter: Endpoint must match the specified protocol');
  if (p === 'sms' && !/^\+\d{8,15}$/.test(e)) throw errorAws('InvalidParameter', 'Invalid parameter: Endpoint Reason: Invalid SMS endpoint. Use the E.164 format, for example +525512345678');
  if (filtro) parsearJson(filtro, 'InvalidParameter', 'Invalid parameter: FilterPolicy: The filter policy is not valid JSON.');

  // Como en AWS: suscribir dos veces el mismo endpoint devuelve la suscripción que ya existe.
  const ya = tema.suscripciones.find((s) => s.protocolo === p && s.endpoint === e);
  if (ya) return ya;

  const id = uuidMensajeria();
  const pendiente = ['email', 'email-json', 'http', 'https'].includes(p);
  const sub = {
    arn: `${tema.arn}:${id}`,
    id,
    temaArn: tema.arn,
    protocolo: p,
    endpoint: e,
    estado: pendiente ? 'PendingConfirmation' : 'Confirmed',
    token: hexAzar(64),
    creado: iso(),
    confirmado: pendiente ? null : iso(),
    entregados: 0,
    fallidos: 0,
    filtro: filtro || null,
    entregaCruda: Boolean(entregaCruda)
  };
  tema.suscripciones.push(sub);
  if (p === 'email' || p === 'email-json') correoConfirmacion(estado, tema, sub);
  anotar(estado, 'SNS', 'Subscribe', `${tema.nombre} → ${p}: ${e}`);
  return sub;
}

/**
 * Confirma una suscripción pendiente. `ref`: el ARN de la suscripción, su
 * token o el enlace completo «Confirm subscription» del correo.
 */
export function confirmarSuscripcion(estado, ref) {
  iniciar(estado);
  const texto = String(ref ?? '').trim();
  const token = texto.match(/[?&]Token=([0-9a-f]+)/i)?.[1] ?? texto;
  const sub = suscripcionesSns(estado).find((s) => s.token === token || s.arn === texto || s.id === texto);
  if (!sub) throw errorAws('InvalidParameter', 'Invalid token');
  if (sub.estado !== 'Confirmed') {
    sub.estado = 'Confirmed';
    sub.confirmado = iso();
    anotar(estado, 'SNS', 'ConfirmSubscription', `${sub.protocolo}: ${sub.endpoint}`);
  }
  return sub;
}

/** «Request confirmation»: vuelve a mandar el correo de confirmación. */
export function pedirConfirmacion(estado, subArn) {
  iniciar(estado);
  const sub = suscripcionOError(estado, subArn);
  if (sub.estado === 'Confirmed') throw errorAws('InvalidParameter', 'Invalid parameter: The subscription is already confirmed');
  const tema = temaOError(estado, sub.temaArn);
  if (sub.protocolo === 'email' || sub.protocolo === 'email-json') correoConfirmacion(estado, tema, sub);
  anotar(estado, 'SNS', 'Subscribe', `${tema.nombre} → ${sub.protocolo}: ${sub.endpoint} (confirmación reenviada)`);
  return sub;
}

/** «Edit» de la suscripción: política de filtro y entrega sin envoltura (raw). */
export function editarSuscripcion(estado, subArn, { filtro, entregaCruda } = {}) {
  iniciar(estado);
  const sub = suscripcionOError(estado, subArn);
  if (filtro !== undefined) {
    if (filtro) parsearJson(filtro, 'InvalidParameter', 'Invalid parameter: FilterPolicy: The filter policy is not valid JSON.');
    sub.filtro = filtro || null;
  }
  if (entregaCruda !== undefined) sub.entregaCruda = Boolean(entregaCruda);
  anotar(estado, 'SNS', 'SetSubscriptionAttributes', sub.arn);
  return sub;
}

/** «Delete» (Unsubscribe). Las pendientes no se pueden borrar: SNS las quita solo a las 48 h. */
export function eliminarSuscripcion(estado, subArn) {
  iniciar(estado);
  const sub = suscripcionOError(estado, subArn);
  if (sub.estado !== 'Confirmed') throw errorAws('InvalidParameter', 'Invalid parameter: You can’t delete a subscription that is pending confirmation. Amazon SNS deletes unconfirmed subscriptions automatically after 48 hours.');
  const tema = temaSns(estado, sub.temaArn);
  if (tema) tema.suscripciones = tema.suscripciones.filter((s) => s !== sub);
  anotar(estado, 'SNS', 'Unsubscribe', `${sub.protocolo}: ${sub.endpoint}`);
}

/* ======================================================== SNS · publicar */

/** El JSON que SNS entrega a SQS, email-json y HTTP (la «envoltura»). */
function envoltura(estado, tema, sub, { messageId, asunto, mensaje, atributos, secuencia }) {
  const sobre = { Type: 'Notification', MessageId: messageId };
  if (secuencia) sobre.SequenceNumber = secuencia;
  sobre.TopicArn = tema.arn;
  if (asunto) sobre.Subject = asunto;
  sobre.Message = mensaje;
  sobre.Timestamp = iso();
  sobre.SignatureVersion = '1';
  sobre.Signature = `${hexAzar(40)}EXAMPLE==`;
  sobre.SigningCertURL = `https://sns.${region(estado)}.amazonaws.com/SimpleNotificationService-${hexAzar(32)}.pem`;
  sobre.UnsubscribeURL = `https://sns.${region(estado)}.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=${sub.arn}`;
  if (atributos && Object.keys(atributos).length) {
    sobre.MessageAttributes = Object.fromEntries(Object.entries(atributos).map(([k, v]) => [k, { Type: typeof v === 'number' ? 'Number' : 'String', Value: String(v) }]));
  }
  return sobre;
}

/** El evento con que SNS invoca una Lambda. */
function eventoLambdaSns(estado, tema, sub, datos) {
  const sobre = envoltura(estado, tema, sub, datos);
  return {
    Records: [
      {
        EventSource: 'aws:sns',
        EventVersion: '1.0',
        EventSubscriptionArn: sub.arn,
        Sns: {
          Type: sobre.Type,
          MessageId: sobre.MessageId,
          TopicArn: sobre.TopicArn,
          Subject: datos.asunto || null,
          Message: sobre.Message,
          Timestamp: sobre.Timestamp,
          SignatureVersion: '1',
          Signature: sobre.Signature,
          SigningCertUrl: sobre.SigningCertURL,
          UnsubscribeUrl: sobre.UnsubscribeURL,
          MessageAttributes: sobre.MessageAttributes ?? {}
        }
      }
    ]
  };
}

/** ¿El mensaje pasa la política de filtro de la suscripción? */
function pasaFiltro(sub, atributos) {
  if (!sub.filtro) return true;
  try {
    return coincidePatron(JSON.parse(sub.filtro), atributos ?? {});
  } catch {
    return true;
  }
}

/** Entrega un mensaje a una suscripción confirmada. Devuelve true si llegó. */
function entregar(estado, tema, sub, datos) {
  const { asunto, mensaje } = datos;
  switch (sub.protocolo) {
    case 'email':
      correoAlBuzon(estado, {
        de: `${tema.nombreMostrar || 'AWS Notifications'} <no-reply@sns.amazonaws.com>`,
        para: sub.endpoint,
        asunto: asunto || 'AWS Notification Message',
        cuerpo: [
          mensaje,
          '',
          '--',
          'If you wish to stop receiving notifications from this topic, please click or visit the link below to unsubscribe:',
          '[[unsubscribe]]',
          '',
          'Please do not reply directly to this email. If you have any questions or comments regarding this email, please contact us at https://aws.amazon.com/support'
        ].join('\n'),
        origen: datos.origen ?? 'sns',
        enlaces: [{ texto: urlBaja(estado, sub), accion: 'baja', suscripcionArn: sub.arn, url: urlBaja(estado, sub) }]
      });
      return true;
    case 'email-json':
      correoAlBuzon(estado, {
        de: `${tema.nombreMostrar || 'AWS Notifications'} <no-reply@sns.amazonaws.com>`,
        para: sub.endpoint,
        asunto: asunto || 'AWS Notification Message',
        cuerpo: JSON.stringify(envoltura(estado, tema, sub, datos), null, 2),
        origen: datos.origen ?? 'sns'
      });
      return true;
    case 'sqs': {
      const cola = colaPorRef(estado, sub.endpoint);
      if (!cola || !colaPermiteServicio(estado, cola, { servicio: 'sns.amazonaws.com', fuenteArn: tema.arn })) return false;
      const cuerpo = sub.entregaCruda ? mensaje : JSON.stringify(envoltura(estado, tema, sub, datos), null, 2);
      const fifo = cola.tipo === 'FIFO';
      try {
        meterMensaje(estado, cola, {
          cuerpo,
          atributos: sub.entregaCruda ? datos.atributos : {},
          grupo: fifo ? datos.grupo || 'default' : null,
          dedup: fifo ? datos.messageId : null,
          origen: 'sns',
          ahora: datos.ahora
        });
        return true;
      } catch {
        return false;
      }
    }
    case 'lambda': {
      const r = llamar('invocarLambda', estado, sub.endpoint, eventoLambdaSns(estado, tema, sub, datos), { origen: 'sns' });
      return Boolean(r);
    }
    case 'sms':
      return true;
    default:
      // HTTP/HTTPS: no hay servidor que reciba en el simulador.
      return false;
  }
}

/**
 * «Publish message». Reparte a cada suscripción confirmada que pase su filtro.
 * Devuelve { messageId, entregas, fallidas }.
 */
export function publicarMensaje(estado, temaArn, { asunto = '', mensaje, grupo = '', dedup = '', atributos = {}, origen = 'consola', ahora = reloj.ahora() } = {}) {
  iniciar(estado);
  const tema = temaOError(estado, temaArn);
  const cuerpo = String(mensaje ?? '');
  const subj = String(asunto ?? '').trim();
  if (!cuerpo.trim()) throw errorAws('InvalidParameter', 'Invalid parameter: Empty message');
  if (subj.length > 100 || /[\r\n]/.test(subj)) throw errorAws('InvalidParameter', 'Invalid parameter: Subject');
  if (bytes(cuerpo) > LIMITE_SIMULADOR) throw errorAws('InvalidParameter', 'Invalid parameter: Message too long');
  let secuencia = null;
  if (tema.tipo === 'FIFO') {
    if (!String(grupo ?? '').trim()) throw errorAws('InvalidParameter', 'Invalid parameter: The MessageGroupId parameter is required for FIFO topics');
    if (!String(dedup ?? '').trim() && !tema.deduplicacionContenido) {
      throw errorAws('InvalidParameter', 'Invalid parameter: The topic should either have ContentBasedDeduplication enabled or MessageDeduplicationId provided explicitly');
    }
    secuencia = `${String(ahora).padStart(14, '0')}${String(tema.publicados).padStart(6, '0')}`;
  }
  const messageId = uuidMensajeria();
  const datos = { messageId, asunto: subj, mensaje: cuerpo, atributos, grupo: String(grupo ?? '').trim(), secuencia, origen, ahora };
  tema.publicados += 1;
  let entregas = 0;
  let fallidas = 0;
  for (const sub of [...tema.suscripciones]) {
    if (sub.estado !== 'Confirmed' || !pasaFiltro(sub, atributos)) continue;
    if (entregar(estado, tema, sub, datos)) {
      sub.entregados += 1;
      entregas += 1;
    } else {
      sub.fallidos += 1;
      fallidas += 1;
    }
  }
  tema.eventos ??= [];
  contar(tema.eventos, ahora, 'p');
  if (entregas) contar(tema.eventos, ahora, 'e', entregas);
  if (fallidas) contar(tema.eventos, ahora, 'f', fallidas);
  anotar(estado, 'SNS', 'Publish', `${tema.nombre}${origen !== 'consola' ? ` (desde ${origen})` : ''}: ${entregas} entrega(s)`);
  return { messageId, entregas, fallidas };
}

/**
 * Para otras extensiones (alarmas, presupuestos, EventBridge): publica sin
 * lanzar errores. Devuelve el resultado de publicarMensaje o null.
 */
export function publicarEnTema(estado, temaArn, { asunto = '', mensaje = '', origen = 'cloudwatch', grupo = '', atributos = {} } = {}) {
  iniciar(estado);
  const tema = temaSns(estado, temaArn);
  if (!tema) return null;
  try {
    return publicarMensaje(estado, tema.arn, {
      asunto: String(asunto ?? '').replace(/[\r\n]+/g, ' ').slice(0, 100),
      mensaje: String(mensaje ?? '') || ' ',
      grupo: grupo || (tema.tipo === 'FIFO' ? origen : ''),
      dedup: tema.tipo === 'FIFO' ? uuidMensajeria() : '',
      atributos,
      origen
    });
  } catch {
    return null;
  }
}

/* ============================================================ SQS · colas */

const NOMBRE_COLA = /^[A-Za-z0-9_-]{1,80}$/;
const NOMBRE_COLA_FIFO = /^[A-Za-z0-9_-]{1,75}\.fifo$/;

export const urlCola = (estado, nombre) => `https://sqs.${region(estado)}.amazonaws.com/${cuentaDe(estado)}/${nombre}`;
export const arnCola = (estado, nombre) => `arn:aws:sqs:${region(estado)}:${cuentaDe(estado)}:${nombre}`;

/** Una cola por URL, ARN o nombre (o null). */
export function colaPorRef(estado, ref) {
  const colas = estado.sqs?.colas ?? [];
  const r = String(ref ?? '').trim();
  return colas.find((c) => c.url === r || c.arn === r) ?? colas.find((c) => c.nombre === r) ?? null;
}

function colaOError(estado, ref) {
  const c = colaPorRef(estado, ref);
  if (!c) throw errorAws('QueueDoesNotExist', 'The specified queue does not exist.');
  return c;
}

/** La política de acceso de la cola (la de omisión: solo el dueño). */
export function politicaCola(estado, cola) {
  if (cola.politica) return cola.politica;
  return JSON.stringify(
    {
      Version: '2012-10-17',
      Id: '__default_policy_ID',
      Statement: [{ Sid: '__owner_statement', Effect: 'Allow', Principal: { AWS: `arn:aws:iam::${cuentaDe(estado)}:root` }, Action: 'SQS:*', Resource: cola.arn }]
    },
    null,
    2
  );
}

/** ¿La política de la cola deja que un servicio (sns.amazonaws.com, events.amazonaws.com) le mande mensajes? */
export function colaPermiteServicio(estado, cola, { servicio, fuenteArn } = {}) {
  let doc;
  try {
    doc = JSON.parse(politicaCola(estado, cola));
  } catch {
    return false;
  }
  const declaraciones = lista(doc.Statement);
  const aplica = (d) => {
    const acciones = lista(d.Action).map((a) => String(a).toLowerCase());
    if (!acciones.some((a) => a === '*' || a === 'sqs:*' || a === 'sqs:sendmessage')) return false;
    const recursos = lista(d.Resource);
    if (recursos.length && !recursos.some((r) => arnCoincide(r, cola.arn))) return false;
    const p = d.Principal;
    const principalOk =
      p === '*' ||
      lista(p?.AWS).includes('*') ||
      lista(p?.Service).includes(servicio);
    if (!principalOk) return false;
    for (const [operador, pares] of Object.entries(d.Condition ?? {})) {
      for (const [llave, valores] of Object.entries(pares ?? {})) {
        const k = llave.toLowerCase();
        if (k === 'aws:sourcearn') {
          const ok = lista(valores).some((v) => (/like/i.test(operador) ? arnCoincide(v, fuenteArn) : v === fuenteArn));
          if (!ok) return false;
        } else if (k === 'aws:sourceaccount' || k === 'aws:sourceowner') {
          if (!lista(valores).includes(cuentaDe(estado))) return false;
        }
      }
    }
    return true;
  };
  if (declaraciones.some((d) => d.Effect === 'Deny' && aplica(d))) return false;
  return declaraciones.some((d) => d.Effect === 'Allow' && aplica(d));
}

/**
 * Agrega a la política de la cola el permiso para que un tema de SNS o una
 * regla de EventBridge le mande mensajes (lo que hace la consola al suscribir).
 */
export function permitirEnviosACola(estado, colaRef, { servicio = 'sns.amazonaws.com', fuenteArn } = {}) {
  iniciar(estado);
  const cola = colaPorRef(estado, colaRef);
  if (!cola) return null;
  if (colaPermiteServicio(estado, cola, { servicio, fuenteArn })) return cola;
  const doc = JSON.parse(politicaCola(estado, cola));
  doc.Statement = lista(doc.Statement);
  const esSns = servicio === 'sns.amazonaws.com';
  doc.Statement.push({
    Sid: esSns ? `topic-subscription-${fuenteArn}` : `AWSEvents_${String(fuenteArn).split('/').pop()}_${hexAzar(6)}`,
    Effect: 'Allow',
    Principal: esSns ? { AWS: '*' } : { Service: servicio },
    Action: 'SQS:SendMessage',
    Resource: cola.arn,
    Condition: esSns ? { ArnLike: { 'aws:SourceArn': fuenteArn } } : { ArnEquals: { 'aws:SourceArn': fuenteArn } }
  });
  cola.politica = JSON.stringify(doc, null, 2);
  return cola;
}

function entero(v, nombreAtributo, min, max) {
  const n = Number(v);
  if (v === '' || v === null || !Number.isInteger(n) || n < min || n > max) throw errorAws('InvalidAttributeValue', `Invalid value for the parameter ${nombreAtributo}.`);
  return n;
}

/** Valida y normaliza la configuración de una cola (Create queue y Edit). */
function configCola(estado, base, p, tipo) {
  const c = {
    visibilidad: entero(p.visibilidad ?? base.visibilidad ?? 30, 'VisibilityTimeout', 0, 43200),
    retencion: entero(p.retencion ?? base.retencion ?? 345600, 'MessageRetentionPeriod', 60, 1209600),
    retraso: entero(p.retraso ?? base.retraso ?? 0, 'DelaySeconds', 0, 900),
    tamanoMaximo: entero(p.tamanoMaximo ?? base.tamanoMaximo ?? 1048576, 'MaximumMessageSize', 1024, 1048576),
    espera: entero(p.espera ?? base.espera ?? 0, 'ReceiveMessageWaitTimeSeconds', 0, 20),
    cifrado: p.cifrado === undefined ? base.cifrado ?? 'SSE-SQS' : p.cifrado || null,
    deduplicacionContenido: tipo === 'FIFO' && Boolean(p.deduplicacionContenido ?? base.deduplicacionContenido),
    altoRendimiento: tipo === 'FIFO' && Boolean(p.altoRendimiento ?? base.altoRendimiento)
  };
  if (c.cifrado && !['SSE-SQS', 'SSE-KMS'].includes(c.cifrado)) c.cifrado = 'SSE-SQS';
  const politica = p.politica === undefined ? base.politica ?? null : p.politica || null;
  if (politica) parsearJson(politica, 'InvalidAttributeValue', 'Invalid value for the parameter Policy.');
  c.politica = politica;
  const dlq = p.dlq === undefined ? base.dlq ?? null : p.dlq;
  if (dlq) {
    const texto = `{"deadLetterTargetArn":"${dlq.arn}","maxReceiveCount":${dlq.maxRecepciones}}`;
    const n = Number(dlq.maxRecepciones);
    if (!Number.isInteger(n) || n < 1 || n > 1000) {
      throw errorAws('InvalidParameterValue', `Value ${texto} for parameter RedrivePolicy is invalid. Reason: Invalid value for maxReceiveCount: ${dlq.maxRecepciones}, valid values are from 1 to 1000 both inclusive.`);
    }
    const destino = colaPorRef(estado, dlq.arn);
    if (!destino) throw errorAws('InvalidParameterValue', `Value ${texto} for parameter RedrivePolicy is invalid. Reason: Dead-letter target does not exist.`);
    if (destino.tipo !== tipo) throw errorAws('InvalidParameterValue', `Value ${texto} for parameter RedrivePolicy is invalid. Reason: Dead-letter queue must be same type of queue as the source.`);
    if (destino.arn === base.arn) throw errorAws('InvalidParameterValue', `Value ${texto} for parameter RedrivePolicy is invalid. Reason: Source queue ARN cannot be the same as the dead-letter target.`);
    c.dlq = { arn: destino.arn, maxRecepciones: n };
  } else c.dlq = null;
  return c;
}

/** «Create queue». */
export function crearCola(estado, p = {}) {
  iniciar(estado);
  const n = String(p.nombre ?? '').trim();
  const tipo = p.tipo === 'FIFO' ? 'FIFO' : 'Standard';
  if (tipo === 'FIFO' && !NOMBRE_COLA_FIFO.test(n)) {
    throw errorAws('InvalidParameterValue', 'The name of a FIFO queue can only include alphanumeric characters, hyphens, or underscores, must end with .fifo suffix and be 1 to 80 in length.');
  }
  if (tipo === 'Standard' && !NOMBRE_COLA.test(n)) throw errorAws('InvalidParameterValue', 'Can only include alphanumeric characters, hyphens, or underscores. 1 to 80 in length');
  if (estado.sqs.colas.some((c) => c.nombre === n)) throw errorAws('QueueAlreadyExists', `A queue already exists with the same name: ${n}`);
  const base = { arn: arnCola(estado, n) };
  const config = configCola(estado, base, p, tipo);
  const cola = {
    nombre: n,
    url: urlCola(estado, n),
    arn: base.arn,
    tipo,
    creado: iso(),
    modificado: iso(),
    ...config,
    etiquetas: (p.etiquetas ?? []).filter((e) => e.llave?.trim()).map((e) => ({ llave: e.llave.trim(), valor: e.valor ?? '' })),
    purgadaEn: null,
    enviados: 0,
    recibidos: 0,
    borrados: 0,
    eventos: [],
    dedups: [],
    mensajes: []
  };
  estado.sqs.colas.push(cola);
  anotar(estado, 'SQS', 'CreateQueue', `${n} (${tipo})`);
  return cola;
}

/** «Edit» de la cola (el tipo y el nombre no cambian). */
export function editarCola(estado, ref, p = {}) {
  iniciar(estado);
  const cola = colaOError(estado, ref);
  const config = configCola(estado, cola, p, cola.tipo);
  Object.assign(cola, config, { modificado: iso() });
  if (p.etiquetas) cola.etiquetas = p.etiquetas.filter((e) => e.llave?.trim()).map((e) => ({ llave: e.llave.trim(), valor: e.valor ?? '' }));
  anotar(estado, 'SQS', 'SetQueueAttributes', cola.nombre);
  return cola;
}

export function eliminarCola(estado, ref) {
  iniciar(estado);
  const cola = colaOError(estado, ref);
  estado.sqs.colas = estado.sqs.colas.filter((c) => c !== cola);
  anotar(estado, 'SQS', 'DeleteQueue', cola.nombre);
}

/** «Purge»: borra todos los mensajes. Solo una vez cada 60 segundos. */
export function purgarCola(estado, ref, ahora = reloj.ahora()) {
  iniciar(estado);
  const cola = colaOError(estado, ref);
  if (cola.purgadaEn && ahora - cola.purgadaEn < DURACION_MENSAJERIA.esperaPurga) {
    throw errorAws('PurgeQueueInProgress', `Only one PurgeQueue operation on ${cola.nombre} is allowed every 60 seconds.`);
  }
  const n = cola.mensajes.length;
  cola.mensajes = [];
  cola.purgadaEn = ahora;
  anotar(estado, 'SQS', 'PurgeQueue', `${cola.nombre}: ${n} mensaje(s)`);
  return n;
}

/* ========================================================= SQS · mensajes */

export const mensajesDisponibles = (cola, ahora = reloj.ahora()) => cola.mensajes.filter((m) => m.visibleDesde <= ahora).length;
export const mensajesEnVuelo = (cola, ahora = reloj.ahora()) => cola.mensajes.filter((m) => m.recibos > 0 && m.visibleDesde > ahora).length;
export const mensajesRetrasados = (cola, ahora = reloj.ahora()) => cola.mensajes.filter((m) => m.recibos === 0 && m.visibleDesde > ahora).length;

/** Mete un mensaje ya validado en la cola (con la deduplicación FIFO). */
function meterMensaje(estado, cola, { cuerpo, retraso = null, atributos = {}, grupo = null, dedup = null, origen = 'consola', ahora = reloj.ahora() }) {
  const texto = String(cuerpo ?? '');
  if (bytes(texto) > Math.min(cola.tamanoMaximo, LIMITE_SIMULADOR)) {
    throw errorAws('InvalidParameterValue', `One or more parameters are invalid. Reason: Message must be shorter than ${Math.min(cola.tamanoMaximo, LIMITE_SIMULADOR)} bytes.`);
  }
  cola.dedups ??= [];
  cola.eventos ??= [];
  let dedupId = null;
  if (cola.tipo === 'FIFO') {
    dedupId = String(dedup ?? '').trim() || (cola.deduplicacionContenido ? `contenido:${texto}` : '');
    cola.dedups = cola.dedups.filter(([, t]) => ahora - t < DURACION_MENSAJERIA.ventanaDedup);
    const repetido = cola.dedups.find(([id]) => id === dedupId);
    // Dentro de la ventana de 5 minutos, SQS acepta el envío pero no lo duplica.
    if (repetido) return { id: repetido[2], duplicado: true };
  }
  const espera = cola.tipo === 'FIFO' ? cola.retraso : retraso ?? cola.retraso;
  const msg = {
    id: uuidMensajeria(),
    cuerpo: texto,
    md5: hexAzar(32),
    enviado: ahora,
    visibleDesde: ahora + espera * 1000,
    recibos: 0,
    primerRecibo: null,
    recibo: null,
    atributos: { ...(atributos ?? {}) },
    grupo: grupo || null,
    dedup: dedupId ? String(dedup ?? '').trim() || null : null,
    secuencia: cola.tipo === 'FIFO' ? `${String(ahora).padStart(14, '0')}${String(cola.enviados).padStart(6, '0')}` : null,
    origen
  };
  if (dedupId) {
    cola.dedups.push([dedupId.slice(0, 200), ahora, msg.id]);
    if (cola.dedups.length > 50) cola.dedups.splice(0, cola.dedups.length - 50);
  }
  cola.mensajes.push(msg);
  // Tope del simulador: se van los más viejos (el estado debe ser chico).
  if (cola.mensajes.length > LIMITE_MENSAJES) cola.mensajes.splice(0, cola.mensajes.length - LIMITE_MENSAJES);
  cola.enviados += 1;
  contar(cola.eventos, ahora, 's');
  return msg;
}

/** «Send message». Para FIFO: grupo (MessageGroupId) y dedup (MessageDeduplicationId). */
export function enviarMensaje(estado, ref, { cuerpo, retraso = null, grupo = '', dedup = '', atributos = {}, origen = 'consola', ahora = reloj.ahora() } = {}) {
  iniciar(estado);
  const cola = colaOError(estado, ref);
  const texto = String(cuerpo ?? '');
  if (!texto.length) throw errorAws('MissingParameter', 'The request must contain the parameter MessageBody.');
  if (cola.tipo === 'FIFO') {
    if (retraso !== null && retraso !== undefined && retraso !== '' && Number(retraso) !== 0) {
      throw errorAws('InvalidParameterValue', `Value ${retraso} for parameter DelaySeconds is invalid. Reason: The request include parameter that is not valid for this queue type.`);
    }
    if (!String(grupo ?? '').trim()) throw errorAws('MissingParameter', 'The request must contain the parameter MessageGroupId.');
    if (!String(dedup ?? '').trim() && !cola.deduplicacionContenido) {
      throw errorAws('InvalidParameterValue', 'The queue should either have ContentBasedDeduplication enabled or MessageDeduplicationId provided explicitly');
    }
  }
  let espera = null;
  if (cola.tipo === 'Standard' && retraso !== null && retraso !== undefined && retraso !== '') {
    const n = Number(retraso);
    if (!Number.isInteger(n) || n < 0 || n > 900) throw errorAws('InvalidParameterValue', `Value ${retraso} for parameter DelaySeconds is invalid. Reason: DelaySeconds must be >= 0 and <= 900.`);
    espera = n;
  }
  const msg = meterMensaje(estado, cola, { cuerpo: texto, retraso: espera, atributos, grupo: String(grupo ?? '').trim(), dedup, origen, ahora });
  if (origen === 'consola') anotar(estado, 'SQS', 'SendMessage', cola.nombre);
  return msg;
}

/** Para otras extensiones (SNS, EventBridge): manda sin lanzar errores. Devuelve el mensaje o null. */
export function enviarACola(estado, colaArnOUrl, cuerpo, { origen = 'eventbridge', grupo = '', dedup = '', atributos = {} } = {}) {
  iniciar(estado);
  const cola = colaPorRef(estado, colaArnOUrl);
  if (!cola) return null;
  try {
    const fifo = cola.tipo === 'FIFO';
    return meterMensaje(estado, cola, {
      cuerpo: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
      atributos,
      grupo: fifo ? grupo || origen : null,
      dedup: fifo ? dedup || uuidMensajeria() : null,
      origen
    });
  } catch {
    return null;
  }
}

/** Manda un mensaje a la cola de mensajes muertos de `cola` (si existe). */
function aColaMuerta(estado, cola, msg, ahora) {
  const dlq = colaPorRef(estado, cola.dlq?.arn);
  if (!dlq) return;
  dlq.mensajes.push({ ...msg, visibleDesde: ahora, recibo: null, origen: 'dlq' });
  if (dlq.mensajes.length > LIMITE_MENSAJES) dlq.mensajes.splice(0, dlq.mensajes.length - LIMITE_MENSAJES);
  dlq.enviados += 1;
}

/**
 * «Poll for messages» (ReceiveMessage). Los recibidos quedan «in flight»
 * durante el visibility timeout. Si un mensaje ya se recibió maxReceiveCount
 * veces y la cola tiene DLQ, se va a la DLQ en lugar de entregarse.
 * Devuelve copias de los mensajes, con su `recibo` (receipt handle).
 */
export function recibirMensajes(estado, ref, { maximo = 10, visibilidad = null, origen = 'consola', ahora = reloj.ahora() } = {}) {
  iniciar(estado);
  const cola = colaOError(estado, ref);
  const n = Number(maximo);
  if (!Number.isInteger(n) || n < 1 || n > 10) throw errorAws('InvalidParameterValue', `Value ${maximo} for parameter MaxNumberOfMessages is invalid. Reason: Must be between 1 and 10, if provided.`);
  const vis = visibilidad === null || visibilidad === undefined || visibilidad === '' ? cola.visibilidad : entero(visibilidad, 'VisibilityTimeout', 0, 43200);
  // FIFO: un grupo con un mensaje «in flight» no entrega más hasta que se resuelva.
  const ocupados = new Set(cola.tipo === 'FIFO' ? cola.mensajes.filter((m) => m.recibos > 0 && m.visibleDesde > ahora).map((m) => m.grupo) : []);
  const recibidos = [];
  for (const msg of [...cola.mensajes]) {
    if (recibidos.length >= n) break;
    if (msg.visibleDesde > ahora) continue;
    if (cola.tipo === 'FIFO' && ocupados.has(msg.grupo)) continue;
    if (cola.dlq && msg.recibos >= cola.dlq.maxRecepciones) {
      cola.mensajes = cola.mensajes.filter((m) => m !== msg);
      aColaMuerta(estado, cola, msg, ahora);
      continue;
    }
    msg.recibos += 1;
    msg.primerRecibo ??= ahora;
    msg.recibo = `${hexAzar(32)}${hexAzar(32)}`;
    msg.visibleDesde = ahora + vis * 1000;
    if (cola.tipo === 'FIFO') ocupados.add(msg.grupo);
    recibidos.push({ ...msg, atributos: { ...msg.atributos } });
  }
  if (recibidos.length) {
    cola.recibidos += recibidos.length;
    cola.eventos ??= [];
    contar(cola.eventos, ahora, 'r', recibidos.length);
  }
  if (origen === 'consola') anotar(estado, 'SQS', 'ReceiveMessage', `${cola.nombre}: ${recibidos.length} mensaje(s)`);
  return recibidos;
}

/** «Delete» de mensajes recibidos: por su recibo (receipt handle) o su id. */
export function borrarMensajes(estado, ref, recibosOIds = [], { origen = 'consola', ahora = reloj.ahora() } = {}) {
  iniciar(estado);
  const cola = colaOError(estado, ref);
  const quitar = new Set(recibosOIds);
  const antes = cola.mensajes.length;
  cola.mensajes = cola.mensajes.filter((m) => !(quitar.has(m.recibo) || quitar.has(m.id)));
  const n = antes - cola.mensajes.length;
  if (n) {
    cola.borrados += n;
    cola.eventos ??= [];
    contar(cola.eventos, ahora, 'b', n);
  }
  if (origen === 'consola') anotar(estado, 'SQS', n > 1 ? 'DeleteMessageBatch' : 'DeleteMessage', `${cola.nombre}: ${n} mensaje(s)`);
  return n;
}

/** Para Lambda (event source mapping): recibe sin lanzar errores. */
function recibirDeCola(estado, colaArn, { maximo = 10, origen = 'lambda', ahora } = {}) {
  const cola = colaPorRef(estado, colaArn);
  if (!cola) return null;
  try {
    return recibirMensajes(estado, cola.arn, { maximo: Math.max(1, Math.min(10, maximo)), origen, ahora });
  } catch {
    return null;
  }
}

function borrarDeCola(estado, colaArn, recibos, { ahora } = {}) {
  const cola = colaPorRef(estado, colaArn);
  if (!cola) return 0;
  return borrarMensajes(estado, cola.arn, recibos, { origen: 'lambda', ahora });
}

/** «Subscribe to Amazon SNS topic» desde la cola: agrega el permiso y crea la suscripción. */
export function suscribirColaATema(estado, colaRef, temaArn) {
  iniciar(estado);
  const cola = colaOError(estado, colaRef);
  const tema = temaOError(estado, temaArn);
  if (tema.tipo === 'Standard' && cola.tipo === 'FIFO') throw errorAws('InvalidParameter', 'Invalid parameter: Endpoint Reason: FIFO SQS Queues can not be subscribed to standard SNS topics');
  permitirEnviosACola(estado, cola.arn, { servicio: 'sns.amazonaws.com', fuenteArn: tema.arn });
  return crearSuscripcion(estado, { temaArn: tema.arn, protocolo: 'sqs', endpoint: cola.arn });
}

/* ============================================================== métricas */

/**
 * El valor de una métrica de AWS/SQS o AWS/SNS en este momento (CloudWatch las
 * pide; no se guardan series). Los contadores suman lo ocurrido en el periodo
 * (ms) que termina en `ahora`. Devuelve un número o null.
 */
export function metricaMensajeria(estado, { namespace, metrica, dimensiones = {}, periodo = 10_000 } = {}, ahora = reloj.ahora()) {
  const suma = (eventos, tipo) => (eventos ?? []).filter(([t, k]) => k === tipo && t > ahora - periodo && t <= ahora).reduce((s, [, , n]) => s + n, 0);
  if (namespace === 'AWS/SQS') {
    const cola = colaPorRef(estado, dimensiones.QueueName);
    if (!cola) return null;
    switch (metrica) {
      case 'ApproximateNumberOfMessagesVisible':
        return mensajesDisponibles(cola, ahora);
      case 'ApproximateNumberOfMessagesNotVisible':
        return mensajesEnVuelo(cola, ahora);
      case 'ApproximateNumberOfMessagesDelayed':
        return mensajesRetrasados(cola, ahora);
      case 'ApproximateAgeOfOldestMessage':
        return cola.mensajes.length ? Math.round((ahora - Math.min(...cola.mensajes.map((m) => m.enviado))) / 1000) : 0;
      case 'NumberOfMessagesSent':
        return suma(cola.eventos, 's');
      case 'NumberOfMessagesReceived':
        return suma(cola.eventos, 'r');
      case 'NumberOfMessagesDeleted':
        return suma(cola.eventos, 'b');
      default:
        return null;
    }
  }
  if (namespace === 'AWS/SNS') {
    const tema = temaSns(estado, dimensiones.TopicName);
    if (!tema) return null;
    if (metrica === 'NumberOfMessagesPublished') return suma(tema.eventos, 'p');
    if (metrica === 'NumberOfNotificationsDelivered') return suma(tema.eventos, 'e');
    if (metrica === 'NumberOfNotificationsFailed') return suma(tema.eventos, 'f');
    return null;
  }
  return null;
}

/* ============================================================== el tiempo */

function avanzar(estado, ahora) {
  let cambio = false;
  // Retención: los mensajes que cumplen su periodo desaparecen.
  for (const cola of estado.sqs.colas) {
    const antes = cola.mensajes.length;
    cola.mensajes = cola.mensajes.filter((m) => m.enviado + cola.retencion * 1000 > ahora);
    if (cola.mensajes.length !== antes) cambio = true;
  }
  // SNS borra las suscripciones que nadie confirmó en 48 horas.
  for (const tema of estado.sns.temas) {
    const antes = tema.suscripciones.length;
    tema.suscripciones = tema.suscripciones.filter((s) => s.estado === 'Confirmed' || ahora - Date.parse(s.creado) < DURACION_MENSAJERIA.caducaConfirmacion);
    if (tema.suscripciones.length !== antes) cambio = true;
  }
  return cambio;
}

registrarExtension({
  id: 'mensajeria',
  orden: 40,
  iniciar,
  avanzar,
  funciones: {
    publicarEnTema,
    enviarACola,
    correoAlBuzon,
    crearSuscripcion,
    eliminarSuscripcion,
    recibirDeCola,
    borrarDeCola,
    permitirEnviosACola,
    coincidePatron,
    metricaMensajeria
  }
});
