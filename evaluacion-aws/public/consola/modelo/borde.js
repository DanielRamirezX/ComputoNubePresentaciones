// ---------------------------------------------------------------------------
// EL BORDE DE LA RED: CLOUDFRONT Y ROUTE 53
//
// CloudFront (la red de entrega de contenido, CDN) y Route 53 (el DNS). Los dos
// son servicios GLOBALES: no viven en us-east-1 ni en una VPC.
//
// - Una distribución de CloudFront tiene uno o más orígenes (un bucket de S3,
//   el endpoint de sitio web de un bucket, un ALB u otro servidor) y
//   comportamientos de caché por ruta. Tarda en desplegarse (Deploying →
//   Enabled, 30 s en el simulador, SIMULADOR.md §3). Su dominio
//   d1234abcd.cloudfront.net lo abre el navegador simulado: red.js le pregunta
//   aquí con llamar('distribucionPorDominio') y pide el objeto al origen.
// - Route 53 guarda zonas hospedadas (públicas o privadas) con sus registros
//   A, AAAA, CNAME, MX y TXT, los Alias (a un ALB, a CloudFront, al sitio web
//   de un bucket o a otro registro) y las políticas de enrutamiento simple,
//   weighted, latency y failover. La salud de los health checks se CALCULA con
//   red.js (los chequeadores de Route 53 piden la página desde internet) cada
//   pocos segundos. llamar('resolverNombre') traduce www.tudominio.com a su
//   destino para que el navegador simulado lo abra.
//
// Simplificaciones (las ayudas lo dicen): el registro de dominios no existe
// (toda zona pública se trata como si su dominio estuviera registrado y
// delegado a sus servidores de nombres), los nombres alternos de CloudFront no
// piden certificado de ACM y el cliente siempre está en México (latency).
//
// La forma de las colecciones:
//
// estado.cloudfront = {
//   distribuciones: [{
//     id: 'E2QWRUHAPOMQZL', arn, dominio: 'd1a2b3c4d5e6f7.cloudfront.net',
//     nombre, descripcion, plan: 'payg' | 'free' | 'pro' | 'business' | 'premium',
//     habilitada: true, estado: 'Deploying' | 'Deployed', hasta?, desplegada,   // desplegada: ya terminó su primer despliegue
//     origenes: [{
//       id,                              // «Origin name»: por omisión el dominio
//       dominio,                         // mi-bucket.s3.us-east-1.amazonaws.com | mi-bucket.s3-website-us-east-1.amazonaws.com | DNS del ALB | otro
//       tipo: 's3' | 's3-website' | 'elb' | 'custom', recurso,   // recurso: nombre del bucket o ARN del ALB (o null)
//       ruta: '' | '/carpeta',           // Origin path
//       oacId: null | 'E…',              // Origin access control (solo 's3')
//       protocolo: 'http-only' | 'https-only' | 'match-viewer', puertoHttp: 80, puertoHttps: 443
//     }],
//     comportamientos: [{                // en orden de precedencia; el último es «Default (*)»
//       patron: '*' | '/imagenes/*', origenId,
//       protocoloVisor: 'allow-all' | 'redirect-to-https' | 'https-only',
//       metodos: 'GET_HEAD' | 'GET_HEAD_OPTIONS' | 'ALL', politicaCache: 'CachingOptimized' | …, comprimir: true
//     }],
//     objetoRaiz: '' | 'index.html', clasePrecio: 'PriceClass_All' | 'PriceClass_200' | 'PriceClass_100',
//     alias: ['www.tudominio.com'], waf: null | { webAcl: 'CreatedByCloudFront-1a2b3c4d' },
//     versionesHttp: 'http2' | 'http2and3' | 'http1.1' | 'http3', ipv6: true,
//     invalidaciones: [{ id, rutas: ['/*'], estado: 'InProgress' | 'Completed', hasta?, creado }],   // las últimas 20
//     etiquetas: [{ llave, valor }], creado, modificado
//   }],
//   oacs: [{ id, nombre, descripcion, tipoOrigen: 's3', firma: 'always', creado }]
// }
//
// estado.route53 = {
//   zonas: [{
//     id: 'Z0…', nombre: 'tudominio.com', tipo: 'publica' | 'privada', descripcion,
//     vpcs: [vpcId],                     // solo las privadas
//     servidores: ['ns-123.awsdns-15.com', …],   // los 4 servidores de nombres (NS)
//     registros: [{
//       id: 'rr-…', nombre: 'www.tudominio.com', tipo: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'SOA',
//       ttl: 300 | null, valores: ['3.80.1.2'],
//       alias: null | { tipoDestino: 'elb' | 'cloudfront' | 's3' | 'registro', destino, zonaDestino, evaluarSalud },
//       politica: 'simple' | 'weighted' | 'latency' | 'failover',
//       identificador: null | 'azul',    // Record ID (SetIdentifier)
//       peso, region, failover: null | 'PRIMARY' | 'SECONDARY', chequeoId: null | id,
//       sistema: false,                  // true: el NS y el SOA que Route 53 crea con la zona
//       creado
//     }],
//     etiquetas: [{ llave, valor }], creado
//   }],
//   chequeos: [{
//     id: '1a2b3c4d-…', nombre, tipo: 'endpoint' | 'calculado',
//     protocolo: 'HTTP' | 'HTTPS' | 'TCP', ip: null | '3.80.1.2', dominio: null | 'www.ejemplo.com', puerto, ruta,
//     intervalo: 30 | 10, umbral: 3, invertir: false,
//     hijos: [id], minimoSanos,          // solo los calculados
//     estado: 'Unknown' | 'Healthy' | 'Unhealthy', ultimo: null | 'ok' | 'falla', racha, proximo, observacion, cambio,
//     etiquetas: [{ llave, valor }], creado
//   }]
// }
//
// Regla del ciclo de módulos: nada de lo importado de modelo.js o de red.js se
// usa en el nivel superior de este archivo, solo dentro de funciones.
// ---------------------------------------------------------------------------

import { registrarExtension, llamar } from './registro.js';
import { aleatorio, anotar, bucketDe, editarPolitica, errorAws, ipAEntero, iso, nombreLimpio, reloj, vpcDe } from '../modelo.js';
import { probarPagina } from '../red.js';

/** Cuánto tarda cada cosa, en milisegundos (tiempo comprimido del simulador). */
export const DURACION_BORDE = {
  despliegue: 30000, // CloudFront Deploying → Enabled
  invalidacion: 10000, // una invalidación InProgress → Completed
  chequeoEstandar: 5000, // un health check «Standard (30 seconds)»
  chequeoRapido: 2500 // un health check «Fast (10 seconds)»
};

// Las zonas hospedadas «de AWS» a las que apunta un Alias (us-east-1).
export const ZONA_ALIAS = { cloudfront: 'Z2FDTNDATAQYW2', s3: 'Z3AQBSTGFYJSTF', elb: 'Z35SXDOTRQ7X7K' };
export const ENDPOINT_S3_WEB = 's3-website-us-east-1.amazonaws.com';

/** Las clases de precio de CloudFront (qué ubicaciones de borde usa). */
export const CLASES_PRECIO = [
  { valor: 'PriceClass_All', etiqueta: 'Use all edge locations (best performance)' },
  { valor: 'PriceClass_200', etiqueta: 'Use North America, Europe, Asia, Middle East, and Africa' },
  { valor: 'PriceClass_100', etiqueta: 'Use only North America and Europe' }
];

/** Las políticas de caché administradas por AWS. */
export const POLITICAS_CACHE = [
  { nombre: 'CachingOptimized', id: '658327ea-f89d-4fab-a63d-7e88639e58f6', descripcion: 'Policy with caching enabled. Supports Gzip and Brotli compression.', ttl: [1, 86400, 31536000] },
  { nombre: 'CachingDisabled', id: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad', descripcion: 'Policy with caching disabled', ttl: [0, 0, 0] },
  { nombre: 'CachingOptimizedForUncompressedObjects', id: 'b2884449-e4de-46a7-ac36-70bc7f1ddd6d', descripcion: 'Default policy when compression is disabled', ttl: [1, 86400, 31536000] },
  { nombre: 'UseOriginCacheControlHeaders', id: '83da9c7e-98b4-4e11-a168-04f0df8e2c65', descripcion: 'Policy for origins that return Cache-Control headers. Query strings are not included in the cache key.', ttl: [0, 0, 31536000] },
  { nombre: 'UseOriginCacheControlHeaders-QueryStrings', id: '4cc15a8a-d715-48a4-82b8-cc0b614638fe', descripcion: 'Policy for origins that return Cache-Control headers and serve different content based on values present in the query string.', ttl: [0, 0, 31536000] },
  { nombre: 'Amplify', id: '2e54312d-136d-493c-8eb9-b001f22f67d2', descripcion: 'Policy for Amplify Origin', ttl: [2, 2, 31536000] },
  { nombre: 'Elemental-MediaPackage', id: '08627262-05a9-4f76-9ded-b50ca2e3a84f', descripcion: 'Policy for Elemental MediaPackage Origin', ttl: [0, 86400, 31536000] }
];

/** Los planes de precio de CloudFront (noviembre de 2025 en adelante). */
export const PLANES_CLOUDFRONT = [
  { valor: 'free', etiqueta: 'Free', precio: '$0/month', descripcion: 'For hobby projects and personal websites.' },
  { valor: 'pro', etiqueta: 'Pro', precio: '$15/month', descripcion: 'For small businesses and professional websites.' },
  { valor: 'business', etiqueta: 'Business', precio: '$200/month', descripcion: 'For business-critical applications.' },
  { valor: 'premium', etiqueta: 'Premium', precio: '$1,000/month', descripcion: 'For high-traffic and mission-critical applications.' },
  { valor: 'payg', etiqueta: 'Pay as you go', precio: 'Usage-based', descripcion: 'Pay only for the data transfer and requests that you use. Full control over every setting.' }
];

/** Las regiones para los registros de latency, de la más cercana a la casa del alumno (México) a la más lejana. */
export const REGIONES_LATENCIA = [
  { codigo: 'mx-central-1', nombre: 'Mexico (Central)' },
  { codigo: 'us-east-1', nombre: 'US East (N. Virginia)' },
  { codigo: 'us-east-2', nombre: 'US East (Ohio)' },
  { codigo: 'us-west-1', nombre: 'US West (N. California)' },
  { codigo: 'us-west-2', nombre: 'US West (Oregon)' },
  { codigo: 'ca-central-1', nombre: 'Canada (Central)' },
  { codigo: 'sa-east-1', nombre: 'South America (São Paulo)' },
  { codigo: 'eu-west-1', nombre: 'Europe (Ireland)' },
  { codigo: 'eu-central-1', nombre: 'Europe (Frankfurt)' },
  { codigo: 'ap-northeast-1', nombre: 'Asia Pacific (Tokyo)' },
  { codigo: 'ap-southeast-1', nombre: 'Asia Pacific (Singapore)' },
  { codigo: 'ap-south-1', nombre: 'Asia Pacific (Mumbai)' }
];

/** Desde dónde revisan los chequeadores de Route 53 (los que se ven en «Health checkers»). */
export const CHEQUEADORES_R53 = ['us-east-1', 'us-west-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'sa-east-1'];

// Una IP de los chequeadores de Route 53 en us-east-1 (rango 54.243.31.192/26).
const IP_CHEQUEADOR = '54.243.31.200';

/** Los tipos de registro que el simulador acepta del alumno. */
export const TIPOS_REGISTRO = ['A', 'AAAA', 'CNAME', 'MX', 'TXT'];

function iniciar(estado) {
  estado.cloudfront ??= { distribuciones: [], oacs: [] };
  estado.cloudfront.distribuciones ??= [];
  estado.cloudfront.oacs ??= [];
  estado.route53 ??= { zonas: [], chequeos: [] };
  estado.route53.zonas ??= [];
  estado.route53.chequeos ??= [];
}

/* ================================================================== ayudas */

const ALFANUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const azar = (n, letras = ALFANUM) => Array.from({ length: n }, () => letras[Math.floor(aleatorio() * letras.length)]).join('');
const uuid = () => {
  const x = (n) => azar(n, '0123456789abcdef');
  return `${x(8)}-${x(4)}-4${x(3)}-${'89ab'[Math.floor(aleatorio() * 4)]}${x(3)}-${x(12)}`;
};

/** 'WWW.Ejemplo.com.' → 'www.ejemplo.com'. */
export const normalizarNombreDns = (n) => String(n ?? '').trim().toLowerCase().replace(/\.+$/, '');

/** ¿Es un nombre de dominio válido? `comodin`: acepta «*» como primera etiqueta. */
function dominioValido(n, { comodin = false } = {}) {
  if (!n || n.length > 253) return false;
  const etiquetas = n.split('.');
  if (etiquetas.length < 2) return false;
  return etiquetas.every((e, i) => (comodin && i === 0 && e === '*') || /^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/.test(e));
}

const dentroDeZona = (nombre, zona) => nombre === zona || nombre.endsWith(`.${zona}`);

/** Un número de 32 bits a partir de un texto (para IP «estables» de los Alias). */
function hash(texto) {
  let h = 2166136261;
  for (const c of String(texto)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/** Las IP que «contesta» el DNS de un recurso de AWS (siempre las mismas para el mismo nombre). */
function ipsDeRecurso(nombre, bloques) {
  const h = hash(nombre);
  return [0, 1].map((i) => {
    const [a, b] = bloques[(h + i) % bloques.length];
    return `${a}.${b}.${(h >>> (8 + i * 4)) & 255}.${1 + ((h >>> (16 + i * 3)) % 254)}`;
  });
}
const BLOQUES = {
  cloudfront: [[18, 160], [13, 32], [3, 160], [108, 138]],
  elb: [[3, 211], [52, 4], [54, 152], [44, 207]],
  s3: [[52, 217], [3, 5], [16, 182]]
};

/* ================================================================ CloudFront */

const cf = (estado) => (iniciar(estado), estado.cloudfront);

/** Una distribución por id o por ARN. null si no existe. */
export function distribucionDe(estado, idOArn) {
  const v = String(idOArn ?? '').trim();
  return cf(estado).distribuciones.find((d) => d.id === v || d.arn === v) ?? null;
}

function distribucionOError(estado, id) {
  const d = distribucionDe(estado, id);
  if (!d) throw errorAws('NoSuchDistribution', 'The specified distribution does not exist.');
  return d;
}

/** El comportamiento que atiende una ruta (el primero cuyo patrón coincide; si ninguno, el Default). */
export function comportamientoParaRuta(dist, ruta = '/') {
  const r = String(ruta || '/').split('?')[0];
  const patronRe = (p) => new RegExp(`^/?${p.replace(/^\//, '').replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
  return dist.comportamientos.find((c) => c.patron !== '*' && patronRe(c.patron).test(r)) ?? dist.comportamientos.find((c) => c.patron === '*') ?? null;
}

/** El protocolo con el que CloudFront habla con el origen ('http' o 'https'). */
function protocoloEfectivo(origen, comp) {
  if (origen.tipo === 's3') return 'https';
  if (origen.tipo === 's3-website') return 'http';
  if (origen.protocolo === 'https-only') return 'https';
  if (origen.protocolo === 'http-only') return 'http';
  return comp && comp.protocoloVisor !== 'allow-all' ? 'https' : 'http';
}

/**
 * La distribución cuyo dominio es `dominio` (d123.cloudfront.net), en la forma
 * que usa red.js: { id, arn, dominio, habilitada, estado, objetoRaiz, alias,
 * protocoloVisor, origen: { dominio, protocolo: 'http' | 'https', tipo, id } }.
 * Con `ruta`, el origen es el del comportamiento que atiende esa ruta. null si
 * no existe o si todavía no termina su primer despliegue (su DNS aún no existe).
 */
export function distribucionPorDominio(estado, dominio, ruta = '/') {
  const host = normalizarNombreDns(dominio);
  const d = cf(estado).distribuciones.find((x) => x.dominio === host);
  if (!d || !d.desplegada) return null;
  const comp = comportamientoParaRuta(d, ruta);
  const o = d.origenes.find((x) => x.id === comp?.origenId) ?? d.origenes[0] ?? null;
  return {
    id: d.id,
    arn: d.arn,
    dominio: d.dominio,
    habilitada: d.habilitada,
    estado: d.habilitada ? 'Enabled' : 'Disabled',
    objetoRaiz: d.objetoRaiz,
    alias: [...d.alias],
    protocoloVisor: comp?.protocoloVisor ?? 'allow-all',
    origen: o ? { id: o.id, tipo: o.tipo, dominio: `${o.dominio}${o.ruta ?? ''}`, protocolo: protocoloEfectivo(o, comp), oac: Boolean(o.oacId) } : null
  };
}

/** La política de bucket que CloudFront propone para OAC («Copy policy»). */
export function politicaOac(estado, dist, bucket) {
  return JSON.stringify(
    {
      Version: '2008-10-17',
      Id: 'PolicyForCloudFrontPrivateContent',
      Statement: [
        {
          Sid: 'AllowCloudFrontServicePrincipal',
          Effect: 'Allow',
          Principal: { Service: 'cloudfront.amazonaws.com' },
          Action: 's3:GetObject',
          Resource: `arn:aws:s3:::${bucket}/*`,
          Condition: { StringEquals: { 'AWS:SourceArn': dist.arn } }
        }
      ]
    },
    null,
    2
  );
}

/** Agrega a la política del bucket el permiso para la distribución (lo que hace la consola con OAC). */
function darAccesoOac(estado, dist, bucket) {
  const b = bucketDe(estado, bucket);
  if (!b) return;
  const nueva = JSON.parse(politicaOac(estado, dist, bucket));
  let politica = nueva;
  if (b.politica) {
    try {
      const actual = JSON.parse(b.politica);
      const lista = Array.isArray(actual.Statement) ? actual.Statement : actual.Statement ? [actual.Statement] : [];
      if (lista.some((s) => s?.Condition?.StringEquals?.['AWS:SourceArn'] === dist.arn)) return;
      const sid = lista.some((s) => s?.Sid === 'AllowCloudFrontServicePrincipal') ? `AllowCloudFrontServicePrincipal${lista.length}` : 'AllowCloudFrontServicePrincipal';
      politica = { ...actual, Statement: [...lista, { ...nueva.Statement[0], Sid: sid }] };
    } catch {
      politica = nueva;
    }
  }
  editarPolitica(estado, bucket, JSON.stringify(politica, null, 2));
}

/** Arma y valida un origen. `o`: { tipo, dominio, recurso, ruta, acceso: 'oac' | 'publico', protocolo, puertoHttp, puertoHttps, id }. */
function origenNuevo(estado, o = {}, existentes = []) {
  const tipo = ['s3', 's3-website', 'elb', 'custom'].includes(o.tipo) ? o.tipo : 'custom';
  let dominio = normalizarNombreDns(o.dominio).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  let recurso = o.recurso ?? null;
  if (!dominio && tipo === 's3' && recurso) dominio = `${recurso}.s3.us-east-1.amazonaws.com`;
  if (!dominio && tipo === 's3-website' && recurso) dominio = `${recurso}.${ENDPOINT_S3_WEB}`;
  if (!dominio || !dominioValido(dominio)) throw errorAws('InvalidArgument', 'The parameter origin name must be a domain name.');
  if (tipo === 's3' || tipo === 's3-website') {
    recurso = /^(.+?)\.s3(?:-website[.-]us-east-1|\.us-east-1)?\.amazonaws\.com$/.exec(dominio)?.[1] ?? recurso;
    if (!bucketDe(estado, recurso)) throw errorAws('InvalidArgument', `The S3 bucket ${recurso ?? dominio} doesn't exist.`);
    if (tipo === 's3-website' && !bucketDe(estado, recurso).sitioWeb) throw errorAws('InvalidArgument', `The S3 bucket ${recurso} doesn't have static website hosting enabled.`);
  }
  if (tipo === 'elb') {
    const lb = llamar('balanceadorPorDns', estado, dominio);
    if (!lb) throw errorAws('InvalidArgument', `The load balancer ${dominio} doesn't exist.`);
    recurso = lb.arn;
  }
  let ruta = String(o.ruta ?? '').trim();
  if (ruta && !ruta.startsWith('/')) ruta = `/${ruta}`;
  ruta = ruta.replace(/\/+$/, '');
  if (/[*?]/.test(ruta)) throw errorAws('InvalidArgument', 'The parameter origin path must start with a slash and must not end with a slash.');
  const id = nombreLimpio(o.id || dominio, 128);
  if (existentes.some((x) => x.id === id)) throw errorAws('InvalidArgument', `The parameter origin name ${id} must be unique within the distribution.`);
  const puerto = (v, def) => {
    const n = v === undefined || v === '' || v === null ? def : Number(v);
    if (!Number.isInteger(n) || !(n === 80 || n === 443 || (n >= 1024 && n <= 65535))) throw errorAws('InvalidArgument', 'The origin port must be 80, 443, or between 1024 and 65535.');
    return n;
  };
  return {
    id,
    dominio,
    tipo,
    recurso,
    ruta,
    oacId: null,
    protocolo: tipo === 's3' ? 'https-only' : tipo === 's3-website' ? 'http-only' : ['http-only', 'https-only', 'match-viewer'].includes(o.protocolo) ? o.protocolo : tipo === 'elb' ? 'https-only' : 'match-viewer',
    puertoHttp: puerto(o.puertoHttp, 80),
    puertoHttps: puerto(o.puertoHttps, 443)
  };
}

/** Un OAC para un bucket (lo crea la consola con la configuración recomendada). */
function oacPara(estado, dominio) {
  const lista = cf(estado).oacs;
  let nombre = dominio.slice(0, 64);
  for (let n = 2; lista.some((x) => x.nombre === nombre); n += 1) nombre = `${dominio.slice(0, 60)}-${n}`;
  const oac = { id: `E${azar(13)}`, nombre, descripcion: '', tipoOrigen: 's3', firma: 'always', creado: iso() };
  lista.push(oac);
  return oac;
}

/** Valida y arma un comportamiento de caché. */
function comportamientoNuevo(c = {}, origenes = [], { patron = '*' } = {}) {
  let p = String(c.patron ?? patron).trim() || '*';
  if (p !== '*' && /\s/.test(p)) throw errorAws('InvalidArgument', 'The path pattern must not contain spaces.');
  if (p.length > 255) throw errorAws('InvalidArgument', 'The path pattern must be 255 characters or fewer.');
  const origenId = c.origenId ?? origenes[0]?.id;
  if (!origenes.some((o) => o.id === origenId)) throw errorAws('NoSuchOrigin', 'One or more of your origins or origin groups do not exist.');
  const politica = POLITICAS_CACHE.find((x) => x.nombre === c.politicaCache)?.nombre ?? (c.comprimir === false ? 'CachingOptimizedForUncompressedObjects' : 'CachingOptimized');
  return {
    patron: p,
    origenId,
    protocoloVisor: ['allow-all', 'redirect-to-https', 'https-only'].includes(c.protocoloVisor) ? c.protocoloVisor : 'redirect-to-https',
    metodos: ['GET_HEAD', 'GET_HEAD_OPTIONS', 'ALL'].includes(c.metodos) ? c.metodos : 'GET_HEAD',
    politicaCache: politica,
    comprimir: c.comprimir !== false
  };
}

/** Los nombres alternos (CNAMEs), sin repetir y sin chocar con otra distribución. */
function validarAlias(estado, lista, distId) {
  const alias = [...new Set((lista ?? []).map(normalizarNombreDns).filter(Boolean))];
  for (const a of alias) {
    if (!dominioValido(a, { comodin: true })) throw errorAws('InvalidArgument', `The parameter CNAME contains an invalid domain name: ${a}.`);
    if (/\.cloudfront\.net$|\.amazonaws\.com$/.test(a)) throw errorAws('InvalidArgument', `The parameter CNAME contains a domain that is reserved by AWS: ${a}.`);
  }
  if (alias.length > 100) throw errorAws('TooManyDistributionCNAMEs', 'Your request contains more CNAMEs than are allowed per distribution.');
  const otra = cf(estado).distribuciones.find((d) => d.id !== distId && d.alias.some((a) => alias.includes(a)));
  if (otra) throw errorAws('CNAMEAlreadyExists', 'One or more of the CNAMEs you provided are already associated with a different resource.');
  return alias;
}

function validarObjetoRaiz(v) {
  const t = String(v ?? '').trim();
  if (t.startsWith('/') || t.length > 255 || /\s/.test(t)) throw errorAws('InvalidDefaultRootObject', 'The default root object you specified is invalid.');
  return t;
}

const clasePrecioValida = (v) => (CLASES_PRECIO.some((c) => c.valor === v) ? v : 'PriceClass_All');

/** Pone la distribución a desplegar (cada cambio tarda en llegar a todas las ubicaciones de borde). */
function desplegar(d) {
  d.estado = 'Deploying';
  d.hasta = reloj.ahora() + DURACION_BORDE.despliegue;
  d.modificado = iso();
}

/**
 * «Create distribution». p: { nombre, descripcion, plan, origen: { tipo, dominio | recurso, ruta, acceso: 'oac' | 'publico',
 * actualizarPolitica, protocolo, puertoHttp, puertoHttps }, comportamiento: { protocoloVisor, metodos, politicaCache, comprimir },
 * waf, clasePrecio, objetoRaiz, alias: [], versionesHttp, ipv6, etiquetas }.
 */
export function crearDistribucion(estado, p = {}) {
  iniciar(estado);
  const nombre = nombreLimpio(p.nombre, 128);
  if (!nombre) throw errorAws('InvalidArgument', 'Distribution name is required.');
  const plan = PLANES_CLOUDFRONT.some((x) => x.valor === p.plan) ? p.plan : 'payg';
  const origen = origenNuevo(estado, p.origen ?? {});
  const id = `E${azar(13)}`;
  const d = {
    id,
    arn: `arn:aws:cloudfront::${estado.cuenta.id}:distribution/${id}`,
    dominio: `d${azar(13, 'abcdefghijklmnopqrstuvwxyz0123456789')}.cloudfront.net`,
    nombre,
    descripcion: nombreLimpio(p.descripcion, 128),
    plan,
    habilitada: true,
    estado: 'Deploying',
    desplegada: false,
    origenes: [origen],
    comportamientos: [],
    objetoRaiz: validarObjetoRaiz(p.objetoRaiz ?? ''),
    clasePrecio: plan === 'payg' ? clasePrecioValida(p.clasePrecio) : 'PriceClass_All',
    alias: validarAlias(estado, p.alias, id),
    waf: p.waf || plan !== 'payg' ? { webAcl: `CreatedByCloudFront-${azar(8, 'abcdef0123456789')}` } : null,
    versionesHttp: ['http2', 'http2and3', 'http1.1', 'http3'].includes(p.versionesHttp) ? p.versionesHttp : 'http2',
    ipv6: p.ipv6 !== false,
    invalidaciones: [],
    etiquetas: [{ llave: 'Name', valor: nombre }, ...(p.etiquetas ?? []).filter((t) => t?.llave && t.llave !== 'Name').map((t) => ({ llave: nombreLimpio(t.llave, 128), valor: nombreLimpio(t.valor, 256) }))],
    creado: iso(),
    modificado: iso()
  };
  d.comportamientos.push(comportamientoNuevo({ ...(p.comportamiento ?? {}), origenId: origen.id }, d.origenes));
  // Un origen S3 privado usa Origin Access Control y la consola actualiza la política del bucket.
  if (origen.tipo === 's3' && (p.origen?.acceso ?? 'oac') === 'oac') {
    origen.oacId = oacPara(estado, origen.dominio).id;
    if (p.origen?.actualizarPolitica !== false) darAccesoOac(estado, d, origen.recurso);
  }
  desplegar(d);
  cf(estado).distribuciones.push(d);
  anotar(estado, 'CloudFront', 'CreateDistribution', `${id} (${d.dominio}) → ${origen.dominio}`);
  return d;
}

/** Edit settings: { descripcion, clasePrecio, alias, objetoRaiz, versionesHttp, ipv6, waf, nombre }. */
export function editarDistribucion(estado, id, p = {}) {
  const d = distribucionOError(estado, id);
  if (p.alias !== undefined) d.alias = validarAlias(estado, p.alias, d.id);
  if (p.objetoRaiz !== undefined) d.objetoRaiz = validarObjetoRaiz(p.objetoRaiz);
  if (p.descripcion !== undefined) d.descripcion = nombreLimpio(p.descripcion, 128);
  if (p.clasePrecio !== undefined && d.plan === 'payg') d.clasePrecio = clasePrecioValida(p.clasePrecio);
  if (p.versionesHttp !== undefined) d.versionesHttp = ['http2', 'http2and3', 'http1.1', 'http3'].includes(p.versionesHttp) ? p.versionesHttp : d.versionesHttp;
  if (p.ipv6 !== undefined) d.ipv6 = Boolean(p.ipv6);
  if (p.waf !== undefined) {
    if (!p.waf && d.plan !== 'payg') throw errorAws('InvalidArgument', 'A web ACL is required for distributions with a flat-rate pricing plan.');
    d.waf = p.waf ? d.waf ?? { webAcl: `CreatedByCloudFront-${azar(8, 'abcdef0123456789')}` } : null;
  }
  if (p.nombre !== undefined && nombreLimpio(p.nombre, 128)) {
    d.nombre = nombreLimpio(p.nombre, 128);
    const t = d.etiquetas.find((x) => x.llave === 'Name');
    if (t) t.valor = d.nombre;
    else d.etiquetas.unshift({ llave: 'Name', valor: d.nombre });
  }
  desplegar(d);
  anotar(estado, 'CloudFront', 'UpdateDistribution', d.id);
  return d;
}

/** Disable / Enable. */
export function cambiarEstadoDistribucion(estado, id, habilitada) {
  const d = distribucionOError(estado, id);
  if (d.habilitada === Boolean(habilitada)) return d;
  d.habilitada = Boolean(habilitada);
  desplegar(d);
  anotar(estado, 'CloudFront', 'UpdateDistribution', `${d.id}: ${d.habilitada ? 'Enabled' : 'Disabled'}`);
  return d;
}

/** Solo se borra deshabilitada y ya desplegada. */
export function eliminarDistribucion(estado, id) {
  const d = distribucionOError(estado, id);
  if (d.habilitada || d.estado !== 'Deployed') throw errorAws('DistributionNotDisabled', 'The distribution you are trying to delete has not been disabled.');
  estado.cloudfront.distribuciones = estado.cloudfront.distribuciones.filter((x) => x !== d);
  anotar(estado, 'CloudFront', 'DeleteDistribution', d.id);
  return d;
}

/** «Create origin». */
export function crearOrigenCloudFront(estado, id, o = {}) {
  const d = distribucionOError(estado, id);
  if (d.origenes.length >= 100) throw errorAws('TooManyOrigins', 'You cannot create more origins for the distribution.');
  const nuevo = origenNuevo(estado, o, d.origenes);
  if (nuevo.tipo === 's3' && (o.acceso ?? 'oac') === 'oac') {
    nuevo.oacId = oacPara(estado, nuevo.dominio).id;
    if (o.actualizarPolitica !== false) darAccesoOac(estado, d, nuevo.recurso);
  }
  d.origenes.push(nuevo);
  desplegar(d);
  anotar(estado, 'CloudFront', 'UpdateDistribution', `${d.id}: origin ${nuevo.id}`);
  return nuevo;
}

/** «Edit origin»: el dominio no cambia; sí la ruta, el acceso (S3) y el protocolo (ALB u otro). */
export function editarOrigenCloudFront(estado, id, origenId, o = {}) {
  const d = distribucionOError(estado, id);
  const actual = d.origenes.find((x) => x.id === origenId);
  if (!actual) throw errorAws('NoSuchOrigin', 'One or more of your origins or origin groups do not exist.');
  const otro = origenNuevo(estado, { ...actual, ...o, id: actual.id, dominio: actual.dominio, tipo: actual.tipo }, d.origenes.filter((x) => x !== actual));
  otro.oacId = actual.oacId;
  if (otro.tipo === 's3' && o.acceso !== undefined) {
    if (o.acceso === 'oac' && !actual.oacId) otro.oacId = oacPara(estado, otro.dominio).id;
    if (o.acceso !== 'oac') otro.oacId = null;
    if (o.acceso === 'oac' && o.actualizarPolitica) darAccesoOac(estado, d, otro.recurso);
  }
  Object.assign(actual, otro);
  desplegar(d);
  anotar(estado, 'CloudFront', 'UpdateDistribution', `${d.id}: origin ${actual.id}`);
  return actual;
}

export function eliminarOrigenCloudFront(estado, id, origenId) {
  const d = distribucionOError(estado, id);
  if (d.comportamientos.some((c) => c.origenId === origenId)) throw errorAws('IllegalUpdate', `You can't delete origin ${origenId} because it's used by one or more cache behaviors.`);
  if (d.origenes.length <= 1) throw errorAws('IllegalUpdate', 'A distribution must have at least one origin.');
  d.origenes = d.origenes.filter((x) => x.id !== origenId);
  desplegar(d);
  anotar(estado, 'CloudFront', 'UpdateDistribution', `${d.id}: delete origin ${origenId}`);
  return d;
}

/** «Create behavior»: { patron, origenId, protocoloVisor, metodos, politicaCache, comprimir }. Va antes del Default. */
export function crearComportamientoCache(estado, id, c = {}) {
  const d = distribucionOError(estado, id);
  const nuevo = comportamientoNuevo(c, d.origenes, { patron: '' });
  if (nuevo.patron === '*') throw errorAws('InvalidArgument', 'The path pattern is required. Default (*) already exists.');
  if (d.comportamientos.some((x) => x.patron === nuevo.patron)) throw errorAws('InvalidArgument', `The path pattern ${nuevo.patron} is duplicated: your request contains duplicate cache behavior path patterns.`);
  d.comportamientos.splice(d.comportamientos.length - 1, 0, nuevo);
  desplegar(d);
  anotar(estado, 'CloudFront', 'UpdateDistribution', `${d.id}: behavior ${nuevo.patron}`);
  return nuevo;
}

/** «Edit behavior» (el patrón del Default no cambia). */
export function editarComportamientoCache(estado, id, patron, c = {}) {
  const d = distribucionOError(estado, id);
  const i = d.comportamientos.findIndex((x) => x.patron === patron);
  if (i < 0) throw errorAws('InvalidArgument', `The cache behavior ${patron} does not exist.`);
  const nuevo = comportamientoNuevo({ ...d.comportamientos[i], ...c, patron: patron === '*' ? '*' : c.patron ?? patron }, d.origenes);
  if (patron !== '*' && nuevo.patron === '*') throw errorAws('InvalidArgument', 'The path pattern * is reserved for the default cache behavior.');
  if (d.comportamientos.some((x, j) => j !== i && x.patron === nuevo.patron)) throw errorAws('InvalidArgument', `The path pattern ${nuevo.patron} is duplicated: your request contains duplicate cache behavior path patterns.`);
  d.comportamientos[i] = nuevo;
  desplegar(d);
  anotar(estado, 'CloudFront', 'UpdateDistribution', `${d.id}: behavior ${nuevo.patron}`);
  return nuevo;
}

export function eliminarComportamientoCache(estado, id, patron) {
  const d = distribucionOError(estado, id);
  if (patron === '*') throw errorAws('IllegalUpdate', 'You can’t delete the default cache behavior.');
  if (!d.comportamientos.some((x) => x.patron === patron)) throw errorAws('InvalidArgument', `The cache behavior ${patron} does not exist.`);
  d.comportamientos = d.comportamientos.filter((x) => x.patron !== patron);
  desplegar(d);
  anotar(estado, 'CloudFront', 'UpdateDistribution', `${d.id}: delete behavior ${patron}`);
  return d;
}

/** «Create invalidation»: rutas como '/index.html' o '/imagenes/*'. */
export function crearInvalidacion(estado, id, rutas = []) {
  const d = distribucionOError(estado, id);
  const lista = (Array.isArray(rutas) ? rutas : String(rutas).split('\n')).map((r) => String(r).trim()).filter(Boolean);
  if (!lista.length) throw errorAws('MissingBody', 'You must specify at least one object path to invalidate.');
  if (lista.length > 3000) throw errorAws('TooManyInvalidationsInProgress', 'You have exceeded the maximum number of allowable InProgress invalidation batch requests, or invalidation objects.');
  if (lista.some((r) => !r.startsWith('/') || (r.includes('*') && !r.endsWith('*')))) throw errorAws('InvalidArgument', 'Your request contains one or more invalid invalidation paths.');
  const inv = { id: `I${azar(25)}`, rutas: [...new Set(lista)], estado: 'InProgress', hasta: reloj.ahora() + DURACION_BORDE.invalidacion, creado: iso() };
  d.invalidaciones.unshift(inv);
  d.invalidaciones.splice(20);
  anotar(estado, 'CloudFront', 'CreateInvalidation', `${d.id}: ${inv.rutas.join(' ').slice(0, 200)}`);
  return inv;
}

/** Las distribuciones que usan un bucket o un balanceador como origen (para avisos en la consola). */
export function distribucionesConOrigen(estado, recurso) {
  return cf(estado).distribuciones.filter((d) => d.origenes.some((o) => o.recurso === recurso || o.dominio === recurso));
}

/* ================================================================== Route 53 */

const r53 = (estado) => (iniciar(estado), estado.route53);

/** Una zona hospedada por id (acepta '/hostedzone/Z…'). null si no existe. */
export function zonaHospedadaDe(estado, id) {
  const v = String(id ?? '').trim().replace(/^\/?hostedzone\//, '');
  return r53(estado).zonas.find((z) => z.id === v) ?? null;
}

function zonaOError(estado, id) {
  const z = zonaHospedadaDe(estado, id);
  if (!z) throw errorAws('NoSuchHostedZone', `No hosted zone found with ID: ${id}`);
  return z;
}

/** Un health check por id. null si no existe. */
export function chequeoSaludDe(estado, id) {
  return r53(estado).chequeos.find((c) => c.id === id) ?? null;
}

const nombreConPunto = (n) => `${n}.`;
const RESERVADOS = /^(example\.(com|net|org)|.*\.?amazonaws\.com|.*\.?cloudfront\.net|aws|.*\.aws)$/;

/** Los cuatro servidores de nombres de una zona pública (uno .com, .net, .org y .co.uk). */
function servidoresNuevos() {
  const n = () => Math.floor(aleatorio() * 2048);
  const g = () => String(Math.floor(aleatorio() * 64)).padStart(2, '0');
  return [`ns-${n()}.awsdns-${g()}.com`, `ns-${n()}.awsdns-${g()}.net`, `ns-${n()}.awsdns-${g()}.org`, `ns-${n()}.awsdns-${g()}.co.uk`];
}

/**
 * «Create hosted zone». p: { nombre, descripcion, tipo: 'publica' | 'privada', vpcs: [vpcId], etiquetas }.
 * Crea también el NS y el SOA del dominio, como Route 53.
 */
export function crearZonaHospedada(estado, p = {}) {
  iniciar(estado);
  const nombre = normalizarNombreDns(p.nombre);
  if (!dominioValido(nombre)) throw errorAws('InvalidDomainName', `${nombre || 'The domain name'} is not a valid domain name.`);
  if (RESERVADOS.test(nombre)) throw errorAws('InvalidDomainName', `${nombre} is reserved by AWS!`);
  const tipo = p.tipo === 'privada' ? 'privada' : 'publica';
  const vpcs = tipo === 'privada' ? [...new Set(p.vpcs ?? [])] : [];
  if (tipo === 'privada') {
    if (!vpcs.length) throw errorAws('InvalidVPCId', 'When you create a private hosted zone, you must associate it with at least one VPC.');
    for (const v of vpcs) if (!vpcDe(estado, v)) throw errorAws('InvalidVPCId', `The VPC ID '${v}' does not exist.`);
    if (estado.route53.zonas.some((z) => z.tipo === 'privada' && z.nombre === nombre && z.vpcs.some((v) => vpcs.includes(v)))) {
      throw errorAws('ConflictingDomainExists', `A private hosted zone named ${nombre} is already associated with the VPC that you specified.`);
    }
  }
  if (estado.route53.zonas.length >= 500) throw errorAws('TooManyHostedZones', 'This operation can\'t be completed because the current account has reached the limit on the number of hosted zones.');
  const servidores = tipo === 'publica' ? servidoresNuevos() : ['ns-0.awsdns-00.com', 'ns-512.awsdns-00.net', 'ns-1024.awsdns-00.org', 'ns-1536.awsdns-00.co.uk'];
  const z = {
    id: `Z0${azar(19)}`,
    nombre,
    tipo,
    descripcion: nombreLimpio(p.descripcion, 256),
    vpcs,
    servidores,
    registros: [],
    etiquetas: (p.etiquetas ?? []).filter((t) => t?.llave).map((t) => ({ llave: nombreLimpio(t.llave, 128), valor: nombreLimpio(t.valor, 256) })),
    creado: iso()
  };
  const base = { alias: null, politica: 'simple', identificador: null, peso: null, region: null, failover: null, chequeoId: null, sistema: true, creado: z.creado };
  z.registros.push(
    { id: `rr-${azar(10, 'abcdef0123456789')}`, nombre, tipo: 'NS', ttl: 172800, valores: servidores.map(nombreConPunto), ...base },
    { id: `rr-${azar(10, 'abcdef0123456789')}`, nombre, tipo: 'SOA', ttl: 900, valores: [`${servidores[0]}. awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400`], ...base }
  );
  estado.route53.zonas.push(z);
  anotar(estado, 'Route53', 'CreateHostedZone', `${nombre} (${tipo === 'publica' ? 'public' : 'private'}) ${z.id}`);
  return z;
}

/** «Edit hosted zone»: la descripción y, en las privadas, las VPC asociadas. */
export function editarZonaHospedada(estado, id, p = {}) {
  const z = zonaOError(estado, id);
  if (p.descripcion !== undefined) z.descripcion = nombreLimpio(p.descripcion, 256);
  if (p.vpcs !== undefined && z.tipo === 'privada') {
    const vpcs = [...new Set(p.vpcs)];
    if (!vpcs.length) throw errorAws('LastVPCAssociation', 'The VPC that you\'re trying to disassociate from the private hosted zone is the last VPC that is associated with the hosted zone. Amazon Route 53 doesn\'t support disassociating the last VPC from a hosted zone.');
    for (const v of vpcs) if (!vpcDe(estado, v)) throw errorAws('InvalidVPCId', `The VPC ID '${v}' does not exist.`);
    const nuevas = vpcs.filter((v) => !z.vpcs.includes(v));
    z.vpcs = vpcs;
    if (nuevas.length) anotar(estado, 'Route53', 'AssociateVPCWithHostedZone', `${z.nombre}: ${nuevas.join(', ')}`);
  }
  if (p.descripcion !== undefined) anotar(estado, 'Route53', 'UpdateHostedZoneComment', z.nombre);
  return z;
}

/** Solo se borra con nada más que su NS y su SOA. */
export function eliminarZonaHospedada(estado, id) {
  const z = zonaOError(estado, id);
  if (z.registros.some((r) => !r.sistema)) throw errorAws('HostedZoneNotEmpty', 'The specified hosted zone contains non-required resource record sets and so cannot be deleted.');
  estado.route53.zonas = estado.route53.zonas.filter((x) => x !== z);
  anotar(estado, 'Route53', 'DeleteHostedZone', `${z.nombre} ${z.id}`);
  return z;
}

/* ---------------------------------------------------------- registros */

const textoCambio = (accion, r) => `Change with [Action=${accion}, Name=${r.nombre}., Type=${r.tipo}, SetIdentifier=${r.identificador ?? 'null'}]`;
const errorRegistro = (problema, valor) => errorAws('InvalidChangeBatch', `[Invalid Resource Record: 'FATAL problem: ${problema} encountered with '${valor}'']`);
const IPV6 = /^(([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|(([0-9a-f]{1,4}:){0,7}[0-9a-f]{1,4})?::(([0-9a-f]{1,4}:){0,7}[0-9a-f]{1,4})?)$/i;
const NOMBRE_POLITICA = { simple: 'simple', weighted: 'weighted', latency: 'latency', failover: 'failover' };

/** ¿Existe el destino de un Alias? Devuelve el alias normalizado o lanza el error de Route 53. */
function validarAlias53(estado, zona, r, a) {
  const tipoDestino = ['elb', 'cloudfront', 's3', 'registro'].includes(a.tipoDestino) ? a.tipoDestino : null;
  let destino = normalizarNombreDns(a.destino);
  let zonaDestino = null;
  let ok = false;
  if (tipoDestino === 'cloudfront') {
    zonaDestino = ZONA_ALIAS.cloudfront;
    ok = cf(estado).distribuciones.some((d) => d.dominio === destino);
  } else if (tipoDestino === 'elb') {
    const lb = llamar('balanceadorPorDns', estado, destino);
    ok = Boolean(lb);
    zonaDestino = lb?.zonaHospedada || ZONA_ALIAS.elb;
    if (lb && !destino.startsWith('dualstack.')) destino = `dualstack.${destino}`;
  } else if (tipoDestino === 's3') {
    // El endpoint del sitio web de S3 atiende por el nombre: el bucket se debe llamar igual que el registro.
    zonaDestino = ZONA_ALIAS.s3;
    destino = ENDPOINT_S3_WEB;
    ok = Boolean(bucketDe(estado, r.nombre)?.sitioWeb);
  } else if (tipoDestino === 'registro') {
    zonaDestino = zona.id;
    ok = dentroDeZona(destino, zona.nombre) && destino !== r.nombre && zona.registros.some((x) => x.nombre === destino && x.tipo === r.tipo);
  }
  if (!ok) {
    throw errorAws('InvalidChangeBatch', `[Tried to create an alias that targets ${destino || '(empty)'}., type ${r.tipo} in zone ${zonaDestino ?? '(unknown)'}, but the alias target name does not lie within the target zone]`);
  }
  return { tipoDestino, destino, zonaDestino, evaluarSalud: tipoDestino === 'cloudfront' ? false : Boolean(a.evaluarSalud) };
}

/** Valida un registro tal como lo manda la consola y lo devuelve normalizado (sin id). */
function registroNuevo(estado, zona, p = {}, accion = 'CREATE') {
  const tipo = String(p.tipo ?? '').toUpperCase();
  const nombre = normalizarNombreDns(p.nombre ?? zona.nombre);
  const r = { nombre, tipo, ttl: null, valores: [], alias: null, politica: 'simple', identificador: null, peso: null, region: null, failover: null, chequeoId: null, sistema: false };
  if (!TIPOS_REGISTRO.includes(tipo)) throw errorAws('InvalidInput', `Record type ${tipo || '(empty)'} isn't supported in this simulator. Use A, AAAA, CNAME, MX, or TXT.`);
  if (!dominioValido(nombre, { comodin: true }) && nombre !== zona.nombre) throw errorAws('InvalidChangeBatch', `[RRSet with DNS name ${nombre}. is not a valid DNS name]`);
  if (!dentroDeZona(nombre, zona.nombre)) throw errorAws('InvalidChangeBatch', `[RRSet with DNS name ${nombre}. is not permitted in zone ${zona.nombre}.]`);
  if (tipo === 'CNAME' && nombre === zona.nombre) throw errorAws('InvalidChangeBatch', `[RRSet of type CNAME with DNS name ${nombre}. is not permitted at apex in zone ${zona.nombre}.]`);

  // La política de enrutamiento.
  r.politica = NOMBRE_POLITICA[p.politica] ?? 'simple';
  if (r.politica !== 'simple') {
    r.identificador = nombreLimpio(p.identificador, 128) || null;
    if (!r.identificador) throw errorAws('InvalidInput', `Invalid request: Missing field 'SetIdentifier' in ${textoCambio(accion, r)}`);
    if (p.chequeoId) {
      if (!chequeoSaludDe(estado, p.chequeoId)) throw errorAws('NoSuchHealthCheck', `A health check with id ${p.chequeoId} does not exist.`);
      r.chequeoId = p.chequeoId;
    }
  }
  if (r.politica === 'weighted') {
    const peso = Number(p.peso);
    if (p.peso === '' || p.peso === null || p.peso === undefined || !Number.isInteger(peso) || peso < 0 || peso > 255) throw errorAws('InvalidInput', `Invalid request: Weight must be an integer between 0 and 255 in ${textoCambio(accion, r)}`);
    r.peso = peso;
  }
  if (r.politica === 'latency') {
    if (!REGIONES_LATENCIA.some((x) => x.codigo === p.region)) throw errorAws('InvalidInput', `Invalid request: Missing field 'Region' in ${textoCambio(accion, r)}`);
    r.region = p.region;
  }
  if (r.politica === 'failover') {
    if (!['PRIMARY', 'SECONDARY'].includes(p.failover)) throw errorAws('InvalidInput', `Invalid request: Missing field 'Failover' in ${textoCambio(accion, r)}`);
    r.failover = p.failover;
  }

  // Alias o valores con TTL.
  if (p.alias && p.alias.tipoDestino) {
    if (!['A', 'AAAA'].includes(tipo)) throw errorAws('InvalidChangeBatch', `[Alias records of type ${tipo} are not supported in this simulator. Use type A or AAAA.]`);
    r.alias = validarAlias53(estado, zona, r, p.alias);
    return r;
  }
  const valores = (Array.isArray(p.valores) ? p.valores : String(p.valores ?? '').split('\n')).map((v) => String(v).trim()).filter(Boolean);
  if (!valores.length) throw errorAws('InvalidInput', `Invalid request: Expected exactly one of [AliasTarget, all of [TTL, and ResourceRecords], or TrafficPolicyInstanceId], but found none in ${textoCambio(accion, r)}`);
  const ttl = p.ttl === '' || p.ttl === undefined || p.ttl === null ? 300 : Number(p.ttl);
  if (!Number.isInteger(ttl) || ttl < 0 || ttl > 2147483647) throw errorAws('InvalidInput', 'TTL must be an integer between 0 and 2147483647.');
  r.ttl = ttl;
  for (const v of valores) {
    if (tipo === 'A' && ipAEntero(v) === null) throw errorRegistro('ARRDATAIllegalIPv4Address (Value is not a valid IPv4 address)', v);
    if (tipo === 'AAAA' && !IPV6.test(v)) throw errorRegistro('AAAARRDATAIllegalIPv6Address (Value is not a valid IPv6 address)', v);
    if (tipo === 'CNAME' && !dominioValido(normalizarNombreDns(v))) throw errorRegistro('DomainLabelEmpty (Domain label is empty) or invalid domain name', v);
    if (tipo === 'MX') {
      const m = /^(\d{1,5})\s+(\S+)$/.exec(v);
      if (!m || Number(m[1]) > 65535 || !dominioValido(normalizarNombreDns(m[2]))) throw errorRegistro('MXRRDATAIncorrectFormat (Value must be a priority followed by a mail server, for example 10 mail.example.com)', v);
    }
    if (tipo === 'TXT') {
      if (!/^".*"$/.test(v)) throw errorRegistro('InvalidCharacterString (Value should be enclosed in quotation marks)', v);
      if (v.length > 257) throw errorRegistro('CharacterStringTooLong (Value is too long)', v);
    }
  }
  if (tipo === 'CNAME' && valores.length > 1) throw errorAws('InvalidChangeBatch', `[RRSet of type CNAME with DNS name ${nombre}. has more than one value; a CNAME record can have only one value.]`);
  r.valores = tipo === 'CNAME' ? [normalizarNombreDns(valores[0])] : tipo === 'MX' ? valores.map((v) => v.replace(/\s+/, ' ').replace(/\.$/, '')) : valores;
  return r;
}

/** ¿El registro `r` choca con los que ya están en `lista`? Lanza el error de Route 53. */
function revisarConflictos(lista, r, zona) {
  const mismoNombre = lista.filter((x) => x.nombre === r.nombre);
  if (r.tipo === 'CNAME' ? mismoNombre.some((x) => x.tipo !== 'CNAME') : mismoNombre.some((x) => x.tipo === 'CNAME')) {
    throw errorAws('InvalidChangeBatch', `[RRSet of type CNAME with DNS name ${r.nombre}. is not permitted as it conflicts with other records with the same DNS name in zone ${zona.nombre}.]`);
  }
  const conjunto = mismoNombre.filter((x) => x.tipo === r.tipo);
  if (!conjunto.length) return;
  const clave = r.identificador ? `[name='${r.nombre}.', type='${r.tipo}', set-identifier='${r.identificador}']` : `[name='${r.nombre}.', type='${r.tipo}']`;
  if (conjunto.some((x) => (x.identificador ?? null) === (r.identificador ?? null))) throw errorAws('InvalidChangeBatch', `[Tried to create resource record set ${clave} but it already exists]`);
  const otra = conjunto.find((x) => x.politica !== r.politica);
  if (otra) {
    throw errorAws('InvalidChangeBatch', `[RRSet with DNS name ${r.nombre}., type ${r.tipo}${r.identificador ? `, SetIdentifier ${r.identificador}` : ''} cannot be created as ${otra.politica === 'simple' ? 'a non-' + r.politica : 'a ' + otra.politica} set exists with the same name and type.]`);
  }
  if (r.politica === 'failover' && conjunto.some((x) => x.failover === r.failover)) {
    throw errorAws('InvalidChangeBatch', `[RRSet with DNS name ${r.nombre}., type ${r.tipo} already has a ${r.failover} failover record. A failover set has exactly one PRIMARY and one SECONDARY record.]`);
  }
  if (r.politica === 'latency' && conjunto.some((x) => x.region === r.region)) {
    throw errorAws('InvalidChangeBatch', `[RRSet with DNS name ${r.nombre}., type ${r.tipo} already has a latency record for region ${r.region}.]`);
  }
}

/**
 * «Create records» (Quick create): crea varios registros de una vez. Como
 * ChangeResourceRecordSets, es todo o nada.
 */
export function crearRegistrosDns(estado, zonaId, registros = []) {
  const z = zonaOError(estado, zonaId);
  const lista = [...z.registros];
  const nuevos = [];
  if (!registros.length) throw errorAws('InvalidInput', 'Invalid request: the change batch is empty.');
  for (const p of registros) {
    const r = registroNuevo(estado, z, p, 'CREATE');
    revisarConflictos(lista, r, z);
    const completo = { id: `rr-${azar(10, 'abcdef0123456789')}`, ...r, creado: iso() };
    lista.push(completo);
    nuevos.push(completo);
  }
  z.registros = lista;
  anotar(estado, 'Route53', 'ChangeResourceRecordSets', `${z.nombre}: CREATE ${nuevos.map((r) => `${r.nombre} ${r.tipo}`).join(', ')}`.slice(0, 300));
  return nuevos;
}

/** Un solo registro (atajo de crearRegistrosDns). */
export const crearRegistroDns = (estado, zonaId, registro) => crearRegistrosDns(estado, zonaId, [registro])[0];

/** «Edit record»: el nombre, el tipo y el Record ID no cambian. */
export function editarRegistroDns(estado, zonaId, registroId, p = {}) {
  const z = zonaOError(estado, zonaId);
  const actual = z.registros.find((r) => r.id === registroId);
  if (!actual) throw errorAws('InvalidChangeBatch', `[Tried to delete resource record set [name='${registroId}'] but it was not found]`);
  if (actual.sistema && actual.tipo === 'SOA') throw errorAws('InvalidChangeBatch', '[The SOA record can\'t be edited in this simulator.]');
  if (actual.sistema) {
    // El NS del dominio solo admite cambiar el TTL y los servidores (como en AWS).
    const valores = (Array.isArray(p.valores) ? p.valores : String(p.valores ?? '').split('\n')).map((v) => v.trim()).filter(Boolean);
    if (!valores.length) throw errorAws('InvalidChangeBatch', '[A HostedZone must contain at least one NS record for the zone itself.]');
    actual.valores = valores;
    if (p.ttl !== undefined && p.ttl !== '') actual.ttl = Number(p.ttl) || actual.ttl;
    anotar(estado, 'Route53', 'ChangeResourceRecordSets', `${z.nombre}: UPSERT ${actual.nombre} NS`);
    return actual;
  }
  const r = registroNuevo(estado, z, { ...p, nombre: actual.nombre, tipo: actual.tipo, identificador: actual.identificador ?? p.identificador, politica: actual.politica === 'simple' ? p.politica ?? 'simple' : actual.politica }, 'UPSERT');
  const resto = z.registros.filter((x) => x !== actual);
  revisarConflictos(resto, r, z);
  Object.assign(actual, r);
  anotar(estado, 'Route53', 'ChangeResourceRecordSets', `${z.nombre}: UPSERT ${actual.nombre} ${actual.tipo}`);
  return actual;
}

/** «Delete record»: el NS y el SOA del dominio no se pueden borrar. */
export function eliminarRegistrosDns(estado, zonaId, ids = []) {
  const z = zonaOError(estado, zonaId);
  const borrar = z.registros.filter((r) => ids.includes(r.id));
  if (!borrar.length) throw errorAws('InvalidChangeBatch', '[Tried to delete resource record set but it was not found]');
  const sistema = borrar.find((r) => r.sistema);
  if (sistema) throw errorAws('InvalidChangeBatch', sistema.tipo === 'NS' ? '[A HostedZone must contain at least one NS record for the zone itself.]' : '[A HostedZone must contain exactly one SOA record.]');
  // Un Alias a otro registro de la zona se queda sin destino: Route 53 no deja borrar el destino.
  const usado = z.registros.find((x) => !ids.includes(x.id) && x.alias?.tipoDestino === 'registro' && borrar.some((b) => b.nombre === x.alias.destino && b.tipo === x.tipo) && z.registros.filter((y) => y.nombre === x.alias.destino && y.tipo === x.tipo && !ids.includes(y.id)).length === 0);
  if (usado) throw errorAws('InvalidChangeBatch', `[Tried to delete resource record set [name='${usado.alias.destino}.', type='${usado.tipo}'] but it is the target of the alias record ${usado.nombre}.]`);
  z.registros = z.registros.filter((r) => !ids.includes(r.id));
  anotar(estado, 'Route53', 'ChangeResourceRecordSets', `${z.nombre}: DELETE ${borrar.map((r) => `${r.nombre} ${r.tipo}`).join(', ')}`.slice(0, 300));
  return borrar;
}

/* ---------------------------------------------------------- health checks */

/**
 * «Create health check». p: { nombre, tipo: 'endpoint' | 'calculado', protocolo, ip, dominio, puerto, ruta,
 * intervalo: 30 | 10, umbral, invertir, hijos, minimoSanos, etiquetas }.
 */
export function crearChequeoSalud(estado, p = {}) {
  iniciar(estado);
  const ch = chequeoDesdeParametros(estado, p);
  ch.id = uuid();
  ch.creado = iso();
  ch.estado = 'Unknown';
  ch.ultimo = null;
  ch.racha = 0;
  ch.proximo = reloj.ahora() + 1000;
  ch.observacion = '';
  ch.cambio = null;
  estado.route53.chequeos.push(ch);
  anotar(estado, 'Route53', 'CreateHealthCheck', `${ch.nombre || ch.id}: ${descripcionChequeo(ch)}`);
  return ch;
}

function chequeoDesdeParametros(estado, p, actual = null) {
  if (estado.route53.chequeos.length >= 200 && !actual) throw errorAws('TooManyHealthChecks', 'This health check can\'t be created because the current account has reached the limit on the number of active health checks.');
  const tipo = p.tipo === 'calculado' ? 'calculado' : 'endpoint';
  const ch = { nombre: nombreLimpio(p.nombre, 256), tipo, invertir: Boolean(p.invertir), etiquetas: (p.etiquetas ?? actual?.etiquetas ?? []).filter((t) => t?.llave) };
  if (tipo === 'calculado') {
    const hijos = [...new Set(p.hijos ?? [])];
    if (!hijos.length) throw errorAws('InvalidInput', 'A calculated health check must monitor at least one health check.');
    for (const h of hijos) {
      const hijo = chequeoSaludDe(estado, h);
      if (!hijo || h === actual?.id) throw errorAws('NoSuchHealthCheck', `A health check with id ${h} does not exist.`);
      if (hijo.tipo === 'calculado') throw errorAws('InvalidInput', 'A calculated health check can\'t monitor another calculated health check.');
    }
    const minimo = Number(p.minimoSanos ?? hijos.length);
    if (!Number.isInteger(minimo) || minimo < 0 || minimo > hijos.length) throw errorAws('InvalidInput', 'The health threshold must be between 0 and the number of child health checks.');
    return { ...ch, hijos, minimoSanos: minimo, protocolo: null, ip: null, dominio: null, puerto: null, ruta: null, intervalo: 30, umbral: 1 };
  }
  const protocolo = ['HTTP', 'HTTPS', 'TCP'].includes(p.protocolo) ? p.protocolo : 'HTTP';
  const ip = String(p.ip ?? '').trim() || null;
  const dominio = normalizarNombreDns(p.dominio) || null;
  if (!ip && !dominio) throw errorAws('InvalidInput', 'You must specify either an IP address or a fully qualified domain name.');
  if (ip) {
    if (ipAEntero(ip) === null) throw errorAws('InvalidInput', `Invalid IP address: ${ip}`);
    const privada = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8', '169.254.0.0/16', '100.64.0.0/10'].some((c) => {
      const [red, pre] = c.split('/');
      const tam = 2 ** (32 - Number(pre));
      return Math.floor(ipAEntero(ip) / tam) === Math.floor(ipAEntero(red) / tam);
    });
    if (privada) throw errorAws('InvalidInput', `The IP address ${ip} is in a private, local, or non-routable range. Route 53 health checkers can only reach public IP addresses.`);
  }
  if (dominio && !dominioValido(dominio)) throw errorAws('InvalidInput', `Invalid domain name: ${dominio}`);
  const puerto = p.puerto === '' || p.puerto === undefined || p.puerto === null ? (protocolo === 'HTTPS' ? 443 : 80) : Number(p.puerto);
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) throw errorAws('InvalidInput', 'Port must be between 1 and 65535.');
  let ruta = protocolo === 'TCP' ? null : String(p.ruta ?? '').trim();
  if (ruta !== null && !ruta.startsWith('/')) ruta = `/${ruta}`;
  const umbral = p.umbral === '' || p.umbral === undefined ? 3 : Number(p.umbral);
  if (!Number.isInteger(umbral) || umbral < 1 || umbral > 10) throw errorAws('InvalidInput', 'Failure threshold must be between 1 and 10.');
  return { ...ch, protocolo, ip, dominio, puerto, ruta, intervalo: Number(p.intervalo) === 10 ? 10 : 30, umbral, hijos: [], minimoSanos: null };
}

/** «Edit health check»: el tipo (endpoint o calculado) no cambia. */
export function editarChequeoSalud(estado, id, p = {}) {
  iniciar(estado);
  const ch = chequeoSaludDe(estado, id);
  if (!ch) throw errorAws('NoSuchHealthCheck', `A health check with id ${id} does not exist.`);
  const nuevo = chequeoDesdeParametros(estado, { ...ch, ...p, tipo: ch.tipo }, ch);
  Object.assign(ch, nuevo, { estado: 'Unknown', ultimo: null, racha: 0, proximo: reloj.ahora() + 1000 });
  anotar(estado, 'Route53', 'UpdateHealthCheck', `${ch.nombre || ch.id}: ${descripcionChequeo(ch)}`);
  return ch;
}

/** No se borra si un registro o un chequeo calculado lo usa. */
export function eliminarChequeoSalud(estado, id) {
  iniciar(estado);
  const ch = chequeoSaludDe(estado, id);
  if (!ch) throw errorAws('NoSuchHealthCheck', `A health check with id ${id} does not exist.`);
  const usado = estado.route53.zonas.some((z) => z.registros.some((r) => r.chequeoId === id)) || estado.route53.chequeos.some((c) => c.hijos?.includes(id));
  if (usado) throw errorAws('HealthCheckInUse', `The health check with id ${id} is still referenced from parent health check(s) or resource record set(s).`);
  estado.route53.chequeos = estado.route53.chequeos.filter((c) => c !== ch);
  anotar(estado, 'Route53', 'DeleteHealthCheck', ch.nombre || ch.id);
  return ch;
}

/** «http://3.80.1.2:80/salud», como la columna Description. */
export function descripcionChequeo(ch) {
  if (ch.tipo === 'calculado') return `Calculated: ${ch.minimoSanos} of ${ch.hijos.length} healthy`;
  const host = ch.dominio ?? ch.ip;
  return ch.protocolo === 'TCP' ? `tcp://${host}:${ch.puerto}` : `${ch.protocolo.toLowerCase()}://${host}:${ch.puerto}${ch.ruta ?? '/'}`;
}

const TEXTO_HTTP = { 200: 'OK', 301: 'Moved Permanently', 302: 'Found', 400: 'Bad Request', 403: 'Forbidden', 404: 'Not Found', 500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout' };

/** Un chequeador pide el endpoint desde internet: { ok, observacion }. */
function revisarEndpoint(estado, ch) {
  // Un nombre de una zona de Route 53 lo traduce red.js (llamar('resolverNombre')).
  const host = ch.ip ?? ch.dominio;
  const url = ch.protocolo === 'TCP' ? `http://${host}:${ch.puerto}/` : `${ch.protocolo.toLowerCase()}://${host}:${ch.puerto}${ch.ruta ?? '/'}`;
  let res;
  try {
    res = probarPagina(estado, url, { ipCliente: IP_CHEQUEADOR });
  } catch {
    res = { resultado: 'timeout' };
  }
  if (res.resultado === 'ok') {
    const c = res.codigoHttp ?? 200;
    if (ch.protocolo === 'TCP') return { ok: true, observacion: 'Success: TCP connection established' };
    const ok = c >= 200 && c < 400;
    return { ok, observacion: `${ok ? 'Success' : 'Failure'}: HTTP Status Code ${c}, ${TEXTO_HTTP[c] ?? ''}`.trim() };
  }
  const motivo = {
    dns: 'Failure: DNS resolution failed: Rcode NXDomain(3)',
    rechazada: 'Failure: Connection refused. The endpoint is not accepting connections on the specified port.',
    ssl: 'Failure: The endpoint violated the TLS protocol or the SSL handshake failed.',
    invalida: 'Failure: The endpoint address is not valid.'
  }[res.resultado];
  return {
    ok: false,
    observacion: motivo ?? 'Failure: Connection timed out. The endpoint or the internet connection is down, or requests are being blocked by your firewall. See https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/dns-failover-router-firewall-rules.html'
  };
}

/** Resuelve los health checks que ya tocaba revisar. true si cambió algún estado visible. */
function avanzarChequeos(estado, ahora) {
  let cambio = false;
  const lista = estado.route53.chequeos;
  // Primero los de endpoint; después los calculados (leen a sus hijos ya revisados).
  for (const ch of [...lista.filter((c) => c.tipo !== 'calculado'), ...lista.filter((c) => c.tipo === 'calculado')]) {
    if ((ch.proximo ?? 0) > ahora) continue;
    // Si el reloj saltó (al calificar o con la pestaña dormida), cuentan todos los chequeos que tocaban.
    const periodo = ch.intervalo === 10 ? DURACION_BORDE.chequeoRapido : DURACION_BORDE.chequeoEstandar;
    const veces = Math.min(20, 1 + Math.floor((ahora - (ch.proximo ?? ahora)) / periodo));
    ch.proximo = ahora + periodo;
    let ok;
    let observacion;
    if (ch.tipo === 'calculado') {
      const sanos = ch.hijos.filter((h) => chequeoSaludDe(estado, h)?.estado === 'Healthy').length;
      ok = sanos >= ch.minimoSanos;
      observacion = `${sanos} of ${ch.hijos.length} child health checks are healthy (threshold: ${ch.minimoSanos}).`;
    } else {
      ({ ok, observacion } = revisarEndpoint(estado, ch));
    }
    if (ch.invertir) ok = !ok;
    const resultado = ok ? 'ok' : 'falla';
    ch.racha = Math.min(99, (ch.ultimo === resultado ? ch.racha ?? 0 : 0) + veces);
    ch.ultimo = resultado;
    if (observacion !== ch.observacion) {
      ch.observacion = observacion;
      cambio = true;
    }
    const nuevo = ok ? 'Healthy' : 'Unhealthy';
    // El primer resultado decide; después hace falta la racha del umbral (Failure threshold).
    if (ch.estado !== nuevo && (ch.estado === 'Unknown' || ch.tipo === 'calculado' || ch.racha >= ch.umbral)) {
      ch.estado = nuevo;
      ch.cambio = iso(ahora);
      cambio = true;
    }
  }
  return cambio;
}

/* ---------------------------------------------------------- resolver nombres */

let turnoDns = 0;

/** La zona que responde por `nombre`: la de sufijo más largo (las privadas solo desde su VPC). */
function zonaParaNombre(estado, nombre, vpcId) {
  const candidatas = r53(estado).zonas.filter((z) => dentroDeZona(nombre, z.nombre) && (z.tipo === 'publica' || (vpcId && z.vpcs.includes(vpcId))));
  candidatas.sort((a, b) => b.nombre.length - a.nombre.length || (a.tipo === 'privada' ? -1 : 1) - (b.tipo === 'privada' ? -1 : 1) || a.creado.localeCompare(b.creado));
  return candidatas[0] ?? null;
}

/** Los registros con ese nombre (o el comodín más cercano: *.tudominio.com). */
function registrosDeNombre(zona, nombre) {
  const exactos = zona.registros.filter((r) => r.nombre === nombre);
  if (exactos.length) return exactos;
  const partes = nombre.split('.');
  for (let i = 1; i < partes.length; i += 1) {
    const padre = partes.slice(i).join('.');
    if (!dentroDeZona(padre, zona.nombre)) break;
    const comodin = zona.registros.filter((r) => r.nombre === `*.${padre}`);
    if (comodin.length) return comodin;
  }
  return [];
}

/** ¿El destino de un Alias está sano? (Evaluate target health). */
function aliasSano(estado, zona, r) {
  const a = r.alias;
  if (a.tipoDestino === 'elb') {
    const lb = llamar('balanceadorPorDns', estado, a.destino);
    if (!lb || lb.estado !== 'active') return false;
    const arns = new Set(lb.oyentes.flatMap((o) => [o.accion?.tipo === 'forward' ? o.accion.tgArn : null, ...(o.reglas ?? []).map((x) => x.tgArn)]).filter(Boolean));
    return [...arns].some((arn) => (llamar('grupoDestinoDe', estado, arn)?.destinos ?? []).some((d) => d.salud === 'healthy'));
  }
  if (a.tipoDestino === 's3') return Boolean(bucketDe(estado, r.nombre)?.sitioWeb);
  if (a.tipoDestino === 'registro') return registrosDeNombre(zona, a.destino).some((x) => x.tipo === r.tipo && registroSano(estado, zona, x));
  return true;
}

/** ¿Route 53 considera sano este registro? (su health check y, si es Alias, su destino). */
export function registroSano(estado, zona, r) {
  if (r.chequeoId) {
    const ch = chequeoSaludDe(estado, r.chequeoId);
    if (ch && ch.estado === 'Unhealthy') return false;
  }
  if (r.alias?.evaluarSalud) return aliasSano(estado, zona, r);
  return true;
}

/** Elige un registro del conjunto según su política (simple, weighted, latency o failover). */
function elegirRegistro(estado, zona, conjunto, turno) {
  if (conjunto.length === 1 && conjunto[0].politica === 'simple') return conjunto[0];
  const sanos = conjunto.filter((r) => registroSano(estado, zona, r));
  const politica = conjunto[0].politica;
  if (politica === 'failover') {
    const primario = conjunto.find((r) => r.failover === 'PRIMARY');
    const secundario = conjunto.find((r) => r.failover === 'SECONDARY');
    if (primario && sanos.includes(primario)) return primario;
    if (secundario && sanos.includes(secundario)) return secundario;
    return primario ?? secundario ?? null;
  }
  // Si todos están enfermos, Route 53 los trata como sanos.
  const vivos = sanos.length ? sanos : conjunto;
  if (politica === 'latency') {
    const orden = (r) => REGIONES_LATENCIA.findIndex((x) => x.codigo === r.region);
    return [...vivos].sort((a, b) => orden(a) - orden(b))[0];
  }
  if (politica === 'weighted') {
    const conPeso = vivos.filter((r) => r.peso > 0);
    const lista = conPeso.length ? conPeso : vivos;
    const total = lista.reduce((s, r) => s + (conPeso.length ? r.peso : 1), 0);
    let n = (((turno ?? turnoDns++) * 37) % total + total) % total;
    for (const r of lista) {
      n -= conPeso.length ? r.peso : 1;
      if (n < 0) return r;
    }
    return lista[lista.length - 1];
  }
  return vivos[0];
}

/**
 * Traduce un nombre como lo haría el DNS: `www.tudominio.com` → { destino, valores,
 * tipo, alias, registro, zona, politica, identificador, cadena }. El destino es una
 * IP (registro A) o el nombre al que hay que seguir (d123.cloudfront.net, el DNS
 * de un ALB, mi-bucket.s3-website-us-east-1.amazonaws.com…). null si ninguna zona
 * responde por ese nombre o no tiene un registro de ese tipo (NXDOMAIN).
 * Opciones: tipo ('A' por omisión), vpcId (para ver las zonas privadas) y turno.
 */
export function resolverNombre(estado, nombre, { tipo = 'A', vpcId = null, turno, profundidad = 0 } = {}) {
  const host = normalizarNombreDns(nombre).replace(/^https?:\/\//, '').replace(/[/:].*$/, '');
  if (!host || profundidad > 8) return null;
  const zona = zonaParaNombre(estado, host, vpcId);
  if (!zona) return null;
  const registros = registrosDeNombre(zona, host);
  const base = { zona: zona.id, nombreZona: zona.nombre, cadena: [host] };
  // Un CNAME manda a otro nombre (dentro o fuera de Route 53).
  const cname = registros.find((r) => r.tipo === 'CNAME');
  if (cname && tipo !== 'CNAME') {
    const destino = cname.valores[0];
    const sigue = resolverNombre(estado, destino, { tipo, vpcId, turno, profundidad: profundidad + 1 });
    if (sigue) return { ...sigue, cadena: [host, ...sigue.cadena] };
    return { ...base, destino, valores: [destino], tipo: 'CNAME', alias: false, registro: cname.id, politica: cname.politica, identificador: cname.identificador, cadena: [host, destino] };
  }
  const conjunto = registros.filter((r) => r.tipo === tipo);
  if (!conjunto.length) return null;
  const r = elegirRegistro(estado, zona, conjunto, turno);
  if (!r) return null;
  const extra = { registro: r.id, politica: r.politica, identificador: r.identificador };
  if (r.alias) {
    const a = r.alias;
    if (a.tipoDestino === 'registro') {
      const sigue = resolverNombre(estado, a.destino, { tipo, vpcId, turno, profundidad: profundidad + 1 });
      return sigue ? { ...sigue, alias: true, cadena: [host, ...sigue.cadena] } : null;
    }
    const destino = a.tipoDestino === 'elb' ? a.destino.replace(/^dualstack\./, '') : a.tipoDestino === 's3' ? `${host}.${ENDPOINT_S3_WEB}` : a.destino;
    return { ...base, ...extra, destino, valores: [destino], tipo: r.tipo, alias: true, tipoDestino: a.tipoDestino, cadena: [host, destino] };
  }
  return { ...base, ...extra, destino: r.valores[0], valores: [...r.valores], tipo: r.tipo, alias: false, cadena: [host] };
}

/**
 * «Test record»: lo que contestaría Route 53 a una consulta.
 * → { codigo: 'NOERROR' | 'NXDOMAIN', respuestas: ['3.80.1.2', …], tipo, protocolo: 'UDP' }.
 */
export function probarRegistroDns(estado, zonaId, nombre, tipo = 'A') {
  const z = zonaOError(estado, zonaId);
  const host = normalizarNombreDns(nombre);
  const t = String(tipo).toUpperCase();
  const fuera = { codigo: 'NXDOMAIN', respuestas: [], tipo: t, protocolo: 'UDP' };
  if (!dentroDeZona(host, z.nombre)) return fuera;
  const registros = registrosDeNombre(z, host);
  if (!registros.length) return fuera;
  const deTipo = registros.filter((r) => r.tipo === t);
  if (['NS', 'SOA'].includes(t)) return { codigo: 'NOERROR', respuestas: deTipo.flatMap((r) => r.valores), tipo: t, protocolo: 'UDP' };
  const cname = registros.find((r) => r.tipo === 'CNAME');
  if (!deTipo.length && cname) return { codigo: 'NOERROR', respuestas: [`${cname.valores[0]}.`], tipo: 'CNAME', protocolo: 'UDP' };
  if (!deTipo.length) return { codigo: 'NOERROR', respuestas: [], tipo: t, protocolo: 'UDP' };
  const r = elegirRegistro(estado, z, deTipo);
  if (!r?.alias) return { codigo: 'NOERROR', respuestas: [...r.valores], tipo: t, protocolo: 'UDP' };
  const a = r.alias;
  if (a.tipoDestino === 'registro') return { ...probarRegistroDns(estado, zonaId, a.destino, t), tipo: t };
  if (t === 'AAAA') return { codigo: 'NOERROR', respuestas: ipsDeRecurso(a.destino, BLOQUES[a.tipoDestino] ?? BLOQUES.elb).map((ip) => `2600:9000:${(hash(ip) & 0xffff).toString(16)}::${(hash(ip) >>> 16).toString(16)}`), tipo: t, protocolo: 'UDP' };
  return { codigo: 'NOERROR', respuestas: ipsDeRecurso(a.tipoDestino === 's3' ? host : a.destino, BLOQUES[a.tipoDestino] ?? BLOQUES.elb), tipo: t, protocolo: 'UDP' };
}

/* ================================================================== tiempo */

function avanzar(estado, ahora) {
  iniciar(estado);
  let cambio = false;
  for (const d of estado.cloudfront.distribuciones) {
    if (d.estado === 'Deploying' && d.hasta && d.hasta <= ahora) {
      d.estado = 'Deployed';
      d.desplegada = true;
      d.modificado = iso(d.hasta);
      delete d.hasta;
      cambio = true;
    }
    for (const inv of d.invalidaciones) {
      if (inv.estado === 'InProgress' && inv.hasta && inv.hasta <= ahora) {
        inv.estado = 'Completed';
        delete inv.hasta;
        cambio = true;
      }
    }
  }
  if (avanzarChequeos(estado, ahora)) cambio = true;
  return cambio;
}

/** Una zona privada asociada a la VPC impide borrarla (como en AWS: hay que desasociarla o borrar la zona). */
function dependenciasVpc(estado, vpcId) {
  iniciar(estado);
  const z = estado.route53.zonas.find((x) => x.tipo === 'privada' && x.vpcs.includes(vpcId));
  if (z) throw errorAws('DependencyViolation', `The vpc '${vpcId}' has dependencies and cannot be deleted. It is associated with the private hosted zone ${z.nombre} (${z.id}).`);
}

registrarExtension({
  id: 'borde',
  orden: 60,
  iniciar,
  avanzar,
  dependenciasVpc,
  funciones: {
    distribucionPorDominio,
    resolverNombre
  }
});
