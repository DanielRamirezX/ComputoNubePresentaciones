// ---------------------------------------------------------------------------
// LAMBDA Y EVENTBRIDGE (reglas)
//
// Las funciones de Lambda con su código, sus eventos de prueba, sus
// disparadores (SNS, SQS, EventBridge y S3) y su configuración; y las reglas
// de EventBridge, programadas (rate/cron) o con patrón de eventos.
//
// NUNCA se ejecuta el código del alumno: ni eval ni Function. Un intérprete
// chiquito lee el código como texto y entiende un subconjunto seguro:
// literales, `event` y sus campos, variables con valores literales,
// JSON.stringify / json.dumps, plantillas de texto, `console.log` / `print`
// y el primer `return` (o `throw` / `raise`) del handler. Si el código tiene
// condiciones o ciclos antes del return, la respuesta es null y la consola
// lo avisa en español. Siempre salen START, END y REPORT.
//
// La forma de las colecciones:
//
// estado.lambda = {
//   funciones: [{ nombre, arn, runtime: 'nodejs22.x'|'python3.13'|…, arquitectura: 'x86_64'|'arm64',
//                 handler, archivo: 'index.mjs'|'lambda_function.py', codigo, sha, descripcion,
//                 rol (nombre del rol de IAM), rolArn, timeout (s, 1-900), memoria (MB), efimero (MB),
//                 variables: [{ llave, valor }], etiquetas, creado, modificado, estado: 'Active',
//                 eventosPrueba: [{ nombre, json, compartido }],                    // máximo 10
//                 mapeos: [{ uuid, tipo: 'sqs', fuente: colaArn, tamanoLote, ventana, activo, creado, modificado }],
//                 s3: [{ id, bucket, eventos: ['s3:ObjectCreated:*'], prefijo, sufijo }],
//                 invocaciones, errores, calienteHasta (ms), flujo,
//                 ultimas: [{ t, requestId, origen, ok, duracion, respuesta, log }] }]   // las últimas 15
// }
// Los disparadores SNS viven en estado.sns (suscripciones con protocolo
// lambda) y los de EventBridge en las reglas: disparadoresLambda() los junta.
//
// estado.eventbridge = {
//   reglas: [{ nombre, arn, bus: 'default', descripcion, tipo: 'programada'|'patron',
//              expresion: 'rate(5 minutes)'|'cron(…)'|null, patron: null | texto JSON,
//              estado: 'ENABLED'|'DISABLED', destinos: [{ id, tipo: 'lambda'|'sqs'|'sns', arn,
//              entrada: 'evento'|'constante', constante }], etiquetas, creado,
//              proximo (ms | null), disparos, fallidos, ultimoDisparo (iso | null) }],
//   vistosEc2: { [instanciaId]: estado }    // para los eventos «EC2 Instance State-change Notification»
// }
//
// El tiempo va comprimido (SIMULADOR.md §3): un minuto de una regla programada
// son 10 s reales; una hora, 10 min; un día, 4 h.
//
// Ofrece por llamar(): invocarLambda, disparadoresLambda, notificarEventoS3 y
// metricaLambda.
//
// Regla del ciclo: nada de modelo.js se usa en el nivel superior.
// ---------------------------------------------------------------------------

import { registrarExtension, llamar } from './registro.js';
import { anotar, crearRol, errorAws, hexAzar, iso, politicaIam, reloj } from '../modelo.js';

export const DURACION_LAMBDA = {
  minutoRegla: 10_000, // rate(1 minute) dispara cada 10 s
  caliente: 5 * 60_000 // tras 5 min sin invocar, la siguiente lleva «Init Duration»
};

const LIMITE_ULTIMAS = 15;
const LIMITE_CODIGO = 65536;

export const RUNTIMES_LAMBDA = [
  { id: 'nodejs24.x', nombre: 'Node.js 24.x', lenguaje: 'js' },
  { id: 'nodejs22.x', nombre: 'Node.js 22.x', lenguaje: 'js' },
  { id: 'nodejs20.x', nombre: 'Node.js 20.x', lenguaje: 'js' },
  { id: 'python3.14', nombre: 'Python 3.14', lenguaje: 'py' },
  { id: 'python3.13', nombre: 'Python 3.13', lenguaje: 'py' },
  { id: 'python3.12', nombre: 'Python 3.12', lenguaje: 'py' }
];
export const runtimeLambda = (id) => RUNTIMES_LAMBDA.find((r) => r.id === id) ?? null;

/** El código «Hello from Lambda!» que pone la consola al crear la función. */
export function codigoInicialLambda(runtime) {
  if (runtimeLambda(runtime)?.lenguaje === 'py') {
    return [
      'import json',
      '',
      'def lambda_handler(event, context):',
      '    # TODO implement',
      '    return {',
      "        'statusCode': 200,",
      "        'body': json.dumps('Hello from Lambda!')",
      '    }',
      ''
    ].join('\n');
  }
  return [
    'export const handler = async (event) => {',
    '  // TODO implement',
    '  const response = {',
    '    statusCode: 200,',
    "    body: JSON.stringify('Hello from Lambda!'),",
    '  };',
    '  return response;',
    '};',
    ''
  ].join('\n');
}

function iniciar(estado) {
  estado.lambda ??= { funciones: [] };
  estado.lambda.funciones ??= [];
  estado.eventbridge ??= { reglas: [] };
  estado.eventbridge.reglas ??= [];
  estado.eventbridge.vistosEc2 ??= {};
}

/* ================================================================ ayudas */

function uuidLambda() {
  return `${hexAzar(8)}-${hexAzar(4)}-4${hexAzar(3)}-${'89ab'[Math.floor(Number.parseInt(hexAzar(1), 16) / 4)]}${hexAzar(3)}-${hexAzar(12)}`;
}

const cuentaDe = (estado) => estado.cuenta?.id ?? '123456789012';
const region = (estado) => estado.cuenta?.region ?? 'us-east-1';
export const arnFuncion = (estado, nombre) => `arn:aws:lambda:${region(estado)}:${cuentaDe(estado)}:function:${nombre}`;
export const arnRegla = (estado, nombre) => `arn:aws:events:${region(estado)}:${cuentaDe(estado)}:rule/${nombre}`;

/** Una función por nombre o ARN (con o sin calificador :$LATEST). */
export function funcionLambda(estado, nombreOArn) {
  const r = String(nombreOArn ?? '').trim();
  const nombre = r.startsWith('arn:') ? r.split(':')[6] : r.split(':')[0];
  return (estado.lambda?.funciones ?? []).find((f) => f.nombre === nombre) ?? null;
}

function funcionOError(estado, nombreOArn) {
  const f = funcionLambda(estado, nombreOArn);
  if (!f) throw errorAws('ResourceNotFoundException', `Function not found: ${String(nombreOArn).startsWith('arn:') ? nombreOArn : arnFuncion(estado, nombreOArn)}`);
  return f;
}

/** Un SHA-256 en base64 con la forma del de la consola (Code SHA-256). */
const shaFalso = () => {
  const b64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  return `${Array.from({ length: 43 }, () => b64[Math.floor(Number.parseInt(hexAzar(2), 16) / 4)]).join('')}=`;
};

const lenguajeDe = (f) => runtimeLambda(f.runtime)?.lenguaje ?? 'js';

/* ================================================== el intérprete seguro */

class NoSoportado extends Error {}
class ErrorDelCodigo extends Error {
  constructor(tipo, mensaje) {
    super(mensaje);
    this.tipo = tipo;
  }
}
class ErrorSintaxis extends Error {}

const DESCONOCIDO = Symbol('desconocido');
const PUNTUACION = ['===', '!==', '...', '**=', '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '+=', '-=', '*=', '/=', '**', '++', '--', '{', '}', '(', ')', '[', ']', ';', ',', ':', '.', '+', '-', '*', '/', '%', '=', '<', '>', '!', '?', '&', '|', '@', '^', '~'];
const ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };

/**
 * Parte el código en piezas: { t: 'num'|'str'|'tpl'|'id'|'p'|'nl', v }.
 * En Python, 'nl' marca un renglón nuevo fuera de paréntesis, con su sangría.
 */
function tokenizar(codigo, py) {
  const toks = py ? [{ t: 'nl', ind: 0 }] : [];
  const n = codigo.length;
  let i = 0;
  let prof = 0;
  while (i < n) {
    const c = codigo[i];
    if (c === '\n') {
      i += 1;
      if (py && prof === 0) {
        let j = i;
        let ind = 0;
        while (j < n && (codigo[j] === ' ' || codigo[j] === '\t')) {
          ind += codigo[j] === '\t' ? 4 : 1;
          j += 1;
        }
        if (j < n && !'\n\r#'.includes(codigo[j])) toks.push({ t: 'nl', ind });
        i = j;
      }
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') {
      i += 1;
      continue;
    }
    if (py && c === '\\' && codigo[i + 1] === '\n') {
      i += 2;
      continue;
    }
    if (!py && c === '/' && codigo[i + 1] === '/') {
      while (i < n && codigo[i] !== '\n') i += 1;
      continue;
    }
    if (!py && c === '/' && codigo[i + 1] === '*') {
      const f = codigo.indexOf('*/', i + 2);
      if (f < 0) throw new ErrorSintaxis('Invalid or unexpected token');
      i = f + 2;
      continue;
    }
    if (py && c === '#') {
      while (i < n && codigo[i] !== '\n') i += 1;
      continue;
    }
    // Textos ('…', "…", `…`, y en Python f"…", r'…', """…""").
    let prefijo = '';
    if (py) {
      const m = /^([rRbBuUfF]{1,2})(?=['"])/.exec(codigo.slice(i, i + 3));
      if (m) prefijo = m[1].toLowerCase();
    }
    const q = codigo[i + prefijo.length];
    if (q === '"' || q === "'" || (!py && q === '`')) {
      i += prefijo.length;
      const triple = py && codigo.startsWith(q.repeat(3), i);
      const cierre = triple ? q.repeat(3) : q;
      i += cierre.length;
      const partes = [];
      let texto = '';
      const plantilla = q === '`' || prefijo.includes('f');
      const crudo = prefijo.includes('r');
      for (;;) {
        if (i >= n) throw new ErrorSintaxis('Invalid or unexpected token');
        if (codigo.startsWith(cierre, i)) {
          i += cierre.length;
          break;
        }
        const d = codigo[i];
        if (d === '\n' && !triple && q !== '`') throw new ErrorSintaxis('Invalid or unexpected token');
        if (d === '\\' && !crudo) {
          const e = codigo[i + 1];
          if (e === 'u' && /^[0-9a-fA-F]{4}$/.test(codigo.slice(i + 2, i + 6))) {
            texto += String.fromCharCode(Number.parseInt(codigo.slice(i + 2, i + 6), 16));
            i += 6;
          } else {
            texto += ESCAPES[e] ?? e;
            i += 2;
          }
          continue;
        }
        if (plantilla && q === '`' && d === '$' && codigo[i + 1] === '{') {
          const f = cierreLlave(codigo, i + 2);
          partes.push(texto, { expr: tokenizar(codigo.slice(i + 2, f), false) });
          texto = '';
          i = f + 1;
          continue;
        }
        if (plantilla && q !== '`' && d === '{') {
          if (codigo[i + 1] === '{') {
            texto += '{';
            i += 2;
            continue;
          }
          const f = cierreLlave(codigo, i + 1);
          partes.push(texto, { expr: tokenizar(codigo.slice(i + 1, f), true).filter((t) => t.t !== 'nl') });
          texto = '';
          i = f + 1;
          continue;
        }
        if (plantilla && q !== '`' && d === '}' && codigo[i + 1] === '}') {
          texto += '}';
          i += 2;
          continue;
        }
        texto += d;
        i += 1;
      }
      toks.push(plantilla ? { t: 'tpl', partes: [...partes, texto] } : { t: 'str', v: texto });
      continue;
    }
    const num = /^(\d[\d_]*(\.\d+)?([eE][+-]?\d+)?|\.\d+)/.exec(codigo.slice(i, i + 40));
    if (num) {
      toks.push({ t: 'num', v: Number(num[0].replace(/_/g, '')) });
      i += num[0].length;
      continue;
    }
    const id = /^[A-Za-z_$][\w$]*/.exec(codigo.slice(i, i + 200));
    if (id) {
      toks.push({ t: 'id', v: id[0] });
      i += id[0].length;
      continue;
    }
    const p = PUNTUACION.find((x) => codigo.startsWith(x, i));
    if (!p) throw new ErrorSintaxis('Invalid or unexpected token');
    if ('([{'.includes(p)) prof += 1;
    if (')]}'.includes(p)) {
      prof -= 1;
      if (prof < 0) throw new ErrorSintaxis(`Unexpected token '${p}'`);
    }
    toks.push({ t: 'p', v: p });
    i += p.length;
  }
  if (prof !== 0) throw new ErrorSintaxis('Unexpected end of input');
  return toks;
}

/** La llave que cierra la que abre en `desde` (sin contar las de textos sencillos). */
function cierreLlave(codigo, desde) {
  let prof = 1;
  for (let i = desde; i < codigo.length; i++) {
    const c = codigo[i];
    if (c === '"' || c === "'") {
      const f = codigo.indexOf(c, i + 1);
      if (f < 0) break;
      i = f;
      continue;
    }
    if (c === '{') prof += 1;
    if (c === '}' && --prof === 0) return i;
  }
  throw new ErrorSintaxis('Unexpected end of input');
}

/** Pone una propiedad propia (también «__proto__», sin tocar el prototipo). */
function poner(obj, llave, valor) {
  Object.defineProperty(obj, String(llave), { value: valor, enumerable: true, writable: true, configurable: true });
}

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Como util.inspect de Node, en un renglón: { statusCode: 200, body: 'hola' }. */
function inspeccionar(v, prof = 0) {
  if (typeof v === 'string') return prof ? `'${v.replace(/'/g, "\\'")}'` : v;
  if (v === undefined) return 'undefined';
  if (v === null || typeof v !== 'object') return String(v);
  if (prof > 2) return Array.isArray(v) ? '[Array]' : '[Object]';
  if (Array.isArray(v)) return v.length ? `[ ${v.map((x) => inspeccionar(x, prof + 1)).join(', ')} ]` : '[]';
  const pares = Object.keys(v).map((k) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : `'${k}'`}: ${inspeccionar(v[k], prof + 1)}`);
  return pares.length ? `{ ${pares.join(', ')} }` : '{}';
}

/** El str() / repr() de Python: {'a': 1, 'b': True}. */
function pyRepr(v, enStr = false) {
  if (typeof v === 'string') return enStr ? v : `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  if (v === null || v === undefined) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return `[${v.map((x) => pyRepr(x)).join(', ')}]`;
  return `{${Object.keys(v).map((k) => `${pyRepr(k)}: ${pyRepr(v[k])}`).join(', ')}}`;
}

/** json.dumps de Python: separadores «, » y «: » y ensure_ascii. */
function pyDumps(v, indent) {
  const ascii = (t) => t.replace(/[\u007f-￿]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`);
  if (indent !== undefined && indent !== null) return ascii(JSON.stringify(v ?? null, null, indent));
  const s = (x) => {
    if (x === null || x === undefined) return 'null';
    if (Array.isArray(x)) return `[${x.map(s).join(', ')}]`;
    if (typeof x === 'object') return `{${Object.keys(x).map((k) => `${JSON.stringify(k)}: ${s(x[k])}`).join(', ')}}`;
    return JSON.stringify(x);
  };
  return ascii(s(v));
}

/** Las funciones que el intérprete sabe «llamar» (todas nuestras, ninguna del alumno). */
function globales(py, variables) {
  const entorno = Object.fromEntries((variables ?? []).filter((v) => v.llave).map((v) => [v.llave, v.valor ?? '']));
  const g = Object.create(null);
  if (py) {
    g.json = { dumps: (v, kw) => pyDumps(v, kw?.indent), loads: (t) => parsearOError(t, 'json.decoder.JSONDecodeError') };
    g.str = (v) => pyRepr(v, true);
    g.int = (v) => {
      const n = Number.parseInt(v, 10);
      if (Number.isNaN(n)) throw new ErrorDelCodigo('ValueError', `invalid literal for int() with base 10: ${pyRepr(v)}`);
      return n;
    };
    g.float = (v) => Number(v);
    g.len = (v) => (typeof v === 'string' || Array.isArray(v) ? v.length : esObjeto(v) ? Object.keys(v).length : 0);
    g.round = (v, d = 0) => Number(Number(v).toFixed(d));
    g.os = { environ: entorno };
  } else {
    g.JSON = { stringify: (v, _r, esp) => JSON.stringify(v, null, esp), parse: (t) => parsearOError(t, 'SyntaxError') };
    g.String = (v) => (typeof v === 'object' && v !== null ? (Array.isArray(v) ? v.join(',') : '[object Object]') : String(v));
    g.Number = (v) => Number(v);
    g.parseInt = (v) => Number.parseInt(v, 10);
    g.Math = { round: Math.round, floor: Math.floor, ceil: Math.ceil, max: Math.max, min: Math.min, abs: Math.abs };
    g.process = { env: entorno };
  }
  return g;
}

function parsearOError(t, tipo) {
  try {
    return JSON.parse(t);
  } catch (e) {
    throw new ErrorDelCodigo(tipo, e.message);
  }
}

/**
 * Evalúa una expresión desde toks[i]. Devuelve { valor, fin }. Lanza
 * NoSoportado si encuentra algo que no sabe leer (nunca ejecuta nada).
 */
function evaluar(toks, i, env, py) {
  const es = (v, k = 0) => {
    const t = toks[i + k];
    return Boolean(t) && (t.t === 'p' || t.t === 'id') && t.v === v;
  };
  const esperar = (v) => {
    if (!es(v)) throw new NoSoportado();
    i += 1;
  };

  function miembro(obj, nombre, opcional) {
    if (obj === null || obj === undefined) {
      if (opcional) return undefined;
      if (py) throw new ErrorDelCodigo('AttributeError', `'NoneType' object has no attribute '${nombre}'`);
      throw new ErrorDelCodigo('TypeError', `Cannot read properties of ${obj === null ? 'null' : 'undefined'} (reading '${nombre}')`);
    }
    if (typeof obj === 'string') {
      if (nombre === 'length' && !py) return obj.length;
      const metodos = py
        ? { upper: () => obj.toUpperCase(), lower: () => obj.toLowerCase(), strip: () => obj.trim(), title: () => obj.replace(/\b\w/g, (x) => x.toUpperCase()) }
        : { toUpperCase: () => obj.toUpperCase(), toLowerCase: () => obj.toLowerCase(), trim: () => obj.trim(), toString: () => obj };
      if (Object.hasOwn(metodos, nombre)) return metodos[nombre];
      throw new NoSoportado();
    }
    if (Array.isArray(obj)) {
      if (nombre === 'length' && !py) return obj.length;
      if (nombre === 'join' && !py) return (sep = ',') => obj.join(sep);
      throw new NoSoportado();
    }
    if (typeof obj === 'function') throw new NoSoportado();
    if (typeof obj === 'object') {
      if (py && nombre === 'get' && !Object.hasOwn(obj, 'get')) return (k, def = null) => (Object.hasOwn(obj, k) ? obj[k] : def);
      if (Object.hasOwn(obj, nombre)) return obj[nombre];
      if (py) throw new ErrorDelCodigo('AttributeError', `'dict' object has no attribute '${nombre}'`);
      return undefined;
    }
    if (py) throw new ErrorDelCodigo('AttributeError', `'${typeof obj === 'number' ? 'int' : 'bool'}' object has no attribute '${nombre}'`);
    return undefined;
  }

  function indice(obj, k) {
    if (Array.isArray(obj) || typeof obj === 'string') {
      const n = Number(k);
      if (!Number.isInteger(n)) throw new NoSoportado();
      const j = py && n < 0 ? obj.length + n : n;
      if (py && (j < 0 || j >= obj.length)) throw new ErrorDelCodigo('IndexError', 'list index out of range');
      return obj[j];
    }
    if (esObjeto(obj)) {
      if (Object.hasOwn(obj, String(k))) return obj[String(k)];
      if (py) throw new ErrorDelCodigo('KeyError', pyRepr(k));
      return undefined;
    }
    if (obj === null || obj === undefined) {
      if (py) throw new ErrorDelCodigo('TypeError', "'NoneType' object is not subscriptable");
      throw new ErrorDelCodigo('TypeError', `Cannot read properties of ${obj === null ? 'null' : 'undefined'} (reading '${k}')`);
    }
    throw new NoSoportado();
  }

  function argumentos(cierre) {
    const args = [];
    let kw = null;
    while (!es(cierre)) {
      if (py && toks[i]?.t === 'id' && es('=', 1)) {
        const nombre = toks[i].v;
        i += 2;
        kw ??= {};
        kw[nombre] = expr();
      } else args.push(expr());
      if (es(',')) i += 1;
      else break;
    }
    esperar(cierre);
    if (kw) args.push(kw);
    return args;
  }

  function primario() {
    const t = toks[i];
    if (!t) throw new NoSoportado();
    if (t.t === 'num' || t.t === 'str') {
      i += 1;
      return t.v;
    }
    if (t.t === 'tpl') {
      i += 1;
      return t.partes
        .map((p) => {
          if (typeof p === 'string') return p;
          const r = evaluar(p.expr, 0, env, py);
          if (r.fin !== p.expr.length) throw new NoSoportado();
          return py ? pyRepr(r.valor, true) : typeof r.valor === 'object' && r.valor !== null ? (Array.isArray(r.valor) ? r.valor.join(',') : '[object Object]') : String(r.valor);
        })
        .join('');
    }
    if (es('(')) {
      i += 1;
      const v = expr();
      esperar(')');
      if (es('=>')) throw new NoSoportado();
      return v;
    }
    if (es('[')) {
      i += 1;
      const arr = [];
      while (!es(']')) {
        if (es('...')) {
          i += 1;
          const v = expr();
          if (!Array.isArray(v)) throw new NoSoportado();
          arr.push(...v);
        } else arr.push(expr());
        if (es(',')) i += 1;
        else break;
      }
      esperar(']');
      return arr;
    }
    if (es('{')) {
      i += 1;
      const obj = {};
      while (!es('}')) {
        if (es('...')) {
          i += 1;
          const v = expr();
          if (esObjeto(v)) Object.keys(v).forEach((k) => poner(obj, k, v[k]));
        } else {
          const k = toks[i];
          let llave;
          if (es('[') && !py) {
            i += 1;
            llave = expr();
            esperar(']');
          } else if (py) {
            llave = expr();
          } else if (k?.t === 'id' || k?.t === 'str' || k?.t === 'num') {
            llave = k.v;
            i += 1;
          } else throw new NoSoportado();
          if (es(':')) {
            i += 1;
            poner(obj, llave, expr());
          } else if (!py && k?.t === 'id' && (es(',') || es('}'))) {
            poner(obj, llave, variable(llave));
          } else throw new NoSoportado();
        }
        if (es(',')) i += 1;
        else break;
      }
      esperar('}');
      return obj;
    }
    if (t.t === 'id') {
      i += 1;
      const literales = py ? { True: true, False: false, None: null } : { true: true, false: false, null: null, undefined };
      if (Object.hasOwn(literales, t.v)) return literales[t.v];
      if (['new', 'await', 'typeof', 'function', 'async', 'lambda', 'not', 'yield', 'this', 'self'].includes(t.v)) throw new NoSoportado();
      return variable(t.v);
    }
    throw new NoSoportado();
  }

  function variable(nombre) {
    if (!(nombre in env)) throw new NoSoportado();
    const v = env[nombre];
    if (v === DESCONOCIDO) throw new NoSoportado();
    return v;
  }

  function postfijo() {
    let v = primario();
    for (;;) {
      if (es('.') || es('?.')) {
        const opcional = es('?.');
        i += 1;
        const t = toks[i];
        if (t?.t !== 'id') throw new NoSoportado();
        i += 1;
        v = miembro(v, t.v, opcional);
      } else if (es('[')) {
        i += 1;
        const k = expr();
        esperar(']');
        v = indice(v, k);
      } else if (es('(')) {
        if (typeof v !== 'function') throw new NoSoportado();
        i += 1;
        const args = argumentos(')');
        v = v(...args);
      } else return v;
    }
  }

  function unario() {
    if (es('-')) {
      i += 1;
      const v = unario();
      if (typeof v !== 'number') throw new NoSoportado();
      return -v;
    }
    if (es('+')) {
      i += 1;
      return Number(unario());
    }
    return postfijo();
  }

  function producto() {
    let v = unario();
    while (es('*') || es('/') || es('%')) {
      const op = toks[i].v;
      i += 1;
      const w = unario();
      if (typeof v === 'string' && py && op === '*' && typeof w === 'number') {
        v = v.repeat(w);
        continue;
      }
      if (typeof v !== 'number' || typeof w !== 'number') throw new NoSoportado();
      if (py && op !== '*' && w === 0) throw new ErrorDelCodigo('ZeroDivisionError', 'division by zero');
      v = op === '*' ? v * w : op === '/' ? v / w : v % w;
    }
    return v;
  }

  function suma() {
    let v = producto();
    while (es('+') || es('-')) {
      const op = toks[i].v;
      i += 1;
      const w = producto();
      if (op === '-') {
        if (typeof v !== 'number' || typeof w !== 'number') throw new NoSoportado();
        v -= w;
      } else if (py) {
        if (typeof v === 'string' && typeof w === 'string') v += w;
        else if (typeof v === 'number' && typeof w === 'number') v += w;
        else if (typeof v === 'string') throw new ErrorDelCodigo('TypeError', `can only concatenate str (not "${w === null ? 'NoneType' : typeof w === 'number' ? 'int' : typeof w === 'boolean' ? 'bool' : 'dict'}") to str`);
        else throw new NoSoportado();
      } else if (typeof v === 'string' || typeof w === 'string') {
        const s = (x) => (typeof x === 'object' && x !== null ? (Array.isArray(x) ? x.join(',') : '[object Object]') : String(x));
        v = s(v) + s(w);
      } else if (typeof v === 'number' && typeof w === 'number') v += w;
      else throw new NoSoportado();
    }
    return v;
  }

  function expr() {
    let v = suma();
    while (es('||') || es('&&') || es('??') || es('or') || es('and')) {
      const op = toks[i].v;
      i += 1;
      const w = suma();
      if (op === '||' || op === 'or') v = v || w;
      else if (op === '&&' || op === 'and') v = v && w;
      else v = v ?? w;
    }
    return v;
  }

  const valor = expr();
  return { valor, fin: i };
}

const CONTROL_JS = new Set(['if', 'for', 'while', 'switch', 'try', 'do', 'else', 'catch']);
const CONTROL_PY = new Set(['if', 'for', 'while', 'try', 'with', 'elif', 'else', 'match', 'except']);
const INICIOS_JS = new Set(['const', 'let', 'var', 'return', 'throw', 'if', 'for', 'while', 'console', 'function', 'try', 'switch', 'export', 'import']);

/** ¿Termina aquí una sentencia? (después de una expresión) */
function terminaSentencia(toks, i, py) {
  const t = toks[i];
  if (!t || t.t === 'nl') return true;
  if (py) return false;
  return (t.t === 'p' && (t.v === ';' || t.v === '}')) || t.t === 'id';
}

/** Salta una sentencia de JS que no se entiende: hasta el ; o la siguiente sentencia. */
function saltarJs(toks, i) {
  let prof = 0;
  let k = i;
  for (; k < toks.length; k++) {
    const t = toks[k];
    if (t.t === 'p' && '([{'.includes(t.v)) prof += 1;
    else if (t.t === 'p' && ')]}'.includes(t.v)) {
      if (prof === 0) return k;
      prof -= 1;
      if (prof === 0 && t.v === '}' && toks[k + 1]?.t === 'id' && INICIOS_JS.has(toks[k + 1].v)) return k + 1;
    } else if (prof === 0 && t.t === 'p' && t.v === ';') return k + 1;
    else if (prof === 0 && k > i && t.t === 'id' && INICIOS_JS.has(t.v)) return k;
  }
  return k;
}

/** El índice del } que cierra el { de toks[i]. */
function cierreBloque(toks, i) {
  let prof = 0;
  for (let k = i; k < toks.length; k++) {
    const t = toks[k];
    if (t.t !== 'p') continue;
    if ('([{'.includes(t.v)) prof += 1;
    if (')]}'.includes(t.v) && --prof === 0) return k;
  }
  return toks.length;
}

/** Lee los nombres de los parámetros entre ( y ). Devuelve { nombres, fin }. */
function parametros(toks, i) {
  const nombres = [];
  if (toks[i]?.v !== '(') return { nombres, fin: i };
  const fin = cierreBloque(toks, i);
  let esperaNombre = true;
  for (let k = i + 1; k < fin; k++) {
    const t = toks[k];
    if (t.t === 'p' && t.v === ',') esperaNombre = true;
    else if (esperaNombre && t.t === 'id') {
      nombres.push(t.v);
      esperaNombre = false;
    }
  }
  return { nombres, fin: fin + 1 };
}

/**
 * Interpreta (sin ejecutar) el handler. Devuelve
 * { respuesta, error: null | { tipo, mensaje }, logs: [{ nivel, texto }], interpretado }.
 */
export function interpretarCodigo(codigo, lenguaje, evento, { variables = [], contexto = {} } = {}) {
  const py = lenguaje === 'py';
  const logs = [];
  let toks;
  try {
    toks = tokenizar(String(codigo ?? ''), py);
  } catch (e) {
    if (e instanceof ErrorSintaxis) {
      return py
        ? { respuesta: null, error: { tipo: 'Runtime.UserCodeSyntaxError', mensaje: "Syntax error in module 'lambda_function': invalid syntax" }, logs, interpretado: true }
        : { respuesta: null, error: { tipo: 'Runtime.UserCodeSyntaxError', mensaje: `SyntaxError: ${e.message}` }, logs, interpretado: true };
    }
    throw e;
  }
  const env = globales(py, variables);
  try {
    return py ? correrPy(toks, env, evento, contexto, logs) : correrJs(String(codigo ?? ''), toks, env, evento, contexto, logs);
  } catch (e) {
    if (e instanceof ErrorDelCodigo) return { respuesta: null, error: { tipo: e.tipo, mensaje: e.message }, logs, interpretado: true };
    return { respuesta: null, error: null, logs, interpretado: false };
  }
}

function correrJs(codigo, toks, env, evento, contexto, logs) {
  // ¿Dónde está el handler? export const handler = async (event) => { … }  |  export async function handler(event) { … }
  let def = -1;
  let ini = -1;
  let cuerpoExpr = false;
  let params = [];
  for (let k = 0; k < toks.length && def < 0; k++) {
    const t = toks[k];
    if (t.t !== 'id' || t.v !== 'handler') continue;
    if (toks[k - 1]?.v === 'function') {
      const p = parametros(toks, k + 1);
      params = p.nombres;
      if (toks[p.fin]?.v !== '{') continue;
      def = k - 1;
      while (def > 0 && ['async', 'export'].includes(toks[def - 1].v)) def -= 1;
      ini = p.fin;
    } else if (toks[k + 1]?.v === '=') {
      let j = k + 2;
      if (toks[j]?.v === 'async') j += 1;
      if (toks[j]?.v === 'function') {
        j += 1;
        if (toks[j]?.t === 'id') j += 1;
        const p = parametros(toks, j);
        params = p.nombres;
        j = p.fin;
      } else if (toks[j]?.v === '(') {
        const p = parametros(toks, j);
        params = p.nombres;
        j = p.fin;
        if (toks[j]?.v !== '=>') continue;
        j += 1;
      } else if (toks[j]?.t === 'id' && toks[j + 1]?.v === '=>') {
        params = [toks[j].v];
        j += 2;
      } else continue;
      def = k;
      while (def > 0 && ['const', 'let', 'var', 'export', '.', 'exports', 'module'].includes(toks[def - 1].v)) def -= 1;
      ini = j;
      cuerpoExpr = toks[j]?.v !== '{';
    }
  }
  const exportado = /\bexport\s+(const|let|var|async\s+function|function)\s+handler\b|\bexports\.handler\s*=|\bexport\s*\{[^}]*\bhandler\b/.test(codigo);
  if (def < 0 || !exportado) return { respuesta: null, error: { tipo: 'Runtime.HandlerNotFound', mensaje: 'index.handler is undefined or not exported' }, logs, interpretado: true };
  if (params[0]) env[params[0]] = evento;
  if (params[1]) env[params[1]] = contexto;
  const fin = cuerpoExpr ? ini : cierreBloque(toks, ini);

  let i = 0;
  let dentro = false;
  while (i < toks.length) {
    if (i === def) {
      if (cuerpoExpr) {
        const r = evaluar(toks, ini, env, false);
        return { respuesta: r.valor ?? null, error: null, logs, interpretado: true };
      }
      i = ini + 1;
      dentro = true;
      continue;
    }
    if (dentro && i >= fin) break;
    const t = toks[i];
    const v = t.t === 'id' || t.t === 'p' ? t.v : null;
    if (v === ';') {
      i += 1;
      continue;
    }
    if (v === 'function' || v === 'class') {
      let k = i;
      while (k < toks.length && toks[k].v !== '{') k += 1;
      i = cierreBloque(toks, k) + 1;
      continue;
    }
    if (v === 'import') {
      while (i < toks.length && toks[i].t !== 'str') i += 1;
      i += 1;
      continue;
    }
    if (v === 'export' || v === 'async') {
      i += 1;
      continue;
    }
    if (v === 'const' || v === 'let' || v === 'var') {
      const n = toks[i + 1];
      if (n?.t === 'id' && toks[i + 2]?.v === '=') {
        try {
          const r = evaluar(toks, i + 3, env, false);
          if (!terminaSentencia(toks, r.fin, false)) throw new NoSoportado();
          env[n.v] = r.valor;
          i = r.fin;
        } catch (e) {
          if (e instanceof ErrorDelCodigo && dentro) throw e;
          env[n.v] = DESCONOCIDO;
          i = saltarJs(toks, i + 3);
        }
        continue;
      }
      if (n?.v === '{') {
        // const { a, b } = event;
        const cierre = cierreBloque(toks, i + 1);
        const nombres = toks.slice(i + 2, cierre).filter((x) => x.t === 'id').map((x) => x.v);
        const simples = toks.slice(i + 2, cierre).every((x) => x.t === 'id' || x.v === ',');
        if (toks[cierre + 1]?.v === '=') {
          try {
            if (!simples) throw new NoSoportado();
            const r = evaluar(toks, cierre + 2, env, false);
            if (!terminaSentencia(toks, r.fin, false)) throw new NoSoportado();
            for (const nombre of nombres) env[nombre] = r.valor === null || r.valor === undefined ? DESCONOCIDO : esObjeto(r.valor) && Object.hasOwn(r.valor, nombre) ? r.valor[nombre] : undefined;
            i = r.fin;
          } catch (e) {
            if (e instanceof ErrorDelCodigo && dentro) throw e;
            nombres.forEach((nombre) => (env[nombre] = DESCONOCIDO));
            i = saltarJs(toks, cierre + 2);
          }
          continue;
        }
      }
      i = saltarJs(toks, i + 1);
      continue;
    }
    // x = …;  o  respuesta.body = …;
    if (t.t === 'id' && (toks[i + 1]?.v === '=' || toks[i + 1]?.v === '.')) {
      let k = i + 1;
      const ruta = [t.v];
      while (toks[k]?.v === '.' && toks[k + 1]?.t === 'id') {
        ruta.push(toks[k + 1].v);
        k += 2;
      }
      if (toks[k]?.v === '=' && !(dentro && ruta[0] === 'console')) {
        try {
          const r = evaluar(toks, k + 1, env, false);
          if (!terminaSentencia(toks, r.fin, false)) throw new NoSoportado();
          if (ruta.length === 1) env[ruta[0]] = r.valor;
          else {
            let obj = env[ruta[0]];
            for (const p of ruta.slice(1, -1)) obj = esObjeto(obj) && Object.hasOwn(obj, p) ? obj[p] : null;
            if (!esObjeto(obj)) throw new NoSoportado();
            poner(obj, ruta.at(-1), r.valor);
          }
          i = r.fin;
        } catch (e) {
          if (e instanceof ErrorDelCodigo && dentro) throw e;
          env[ruta[0]] = DESCONOCIDO;
          i = saltarJs(toks, k + 1);
        }
        continue;
      }
    }
    if (dentro) {
      if (v === 'console' && toks[i + 1]?.v === '.' && toks[i + 3]?.v === '(') {
        const nivel = { log: 'INFO', info: 'INFO', warn: 'WARN', error: 'ERROR', debug: 'DEBUG' }[toks[i + 2].v];
        const cierre = cierreBloque(toks, i + 3);
        if (nivel) {
          try {
            const args = [];
            let k = i + 4;
            while (k < cierre) {
              const r = evaluar(toks, k, env, false);
              args.push(r.valor);
              k = r.fin;
              if (toks[k]?.v === ',') k += 1;
              else if (k !== cierre) throw new NoSoportado();
            }
            logs.push({ nivel, texto: args.map((a) => inspeccionar(a)).join(' ') });
          } catch (e) {
            if (e instanceof ErrorDelCodigo) throw e;
          }
        }
        i = cierre + 1;
        continue;
      }
      if (v === 'return') {
        if (terminaSentencia(toks, i + 1, false) && toks[i + 1]?.t !== 'id') return { respuesta: null, error: null, logs, interpretado: true };
        const r = evaluar(toks, i + 1, env, false);
        if (!terminaSentencia(toks, r.fin, false)) throw new NoSoportado();
        return { respuesta: r.valor === undefined ? null : r.valor, error: null, logs, interpretado: true };
      }
      if (v === 'throw') {
        let k = i + 1;
        if (toks[k]?.v === 'new') k += 1;
        const tipo = toks[k]?.t === 'id' ? toks[k].v : 'Error';
        let mensaje = '';
        if (toks[k + 1]?.v === '(' && toks[k + 2]?.v !== ')') mensaje = String(evaluar(toks, k + 2, env, false).valor);
        throw new ErrorDelCodigo(tipo, mensaje);
      }
      if (CONTROL_JS.has(v)) return { respuesta: null, error: null, logs, interpretado: false };
    }
    const siguiente = saltarJs(toks, i);
    i = siguiente > i ? siguiente : i + 1;
  }
  return { respuesta: null, error: null, logs, interpretado: true };
}

function correrPy(toks, env, evento, contexto, logs) {
  const def = toks.findIndex((t, k) => t.t === 'id' && t.v === 'lambda_handler' && toks[k - 1]?.v === 'def');
  if (def < 0) return { respuesta: null, error: { tipo: 'Runtime.HandlerNotFound', mensaje: "Handler 'lambda_handler' missing on module 'lambda_function'" }, logs, interpretado: true };
  const p = parametros(toks, def + 1);
  if (p.nombres[0]) env[p.nombres[0]] = evento;
  if (p.nombres[1]) env[p.nombres[1]] = contexto;
  const sangria = (k) => {
    for (let j = k; j >= 0; j--) if (toks[j].t === 'nl') return toks[j].ind;
    return 0;
  };
  const defInd = sangria(def);
  const finRenglon = (k) => {
    while (k < toks.length && toks[k].t !== 'nl') k += 1;
    return k;
  };
  const saltarBloque = (k) => {
    const ind = sangria(k);
    k = finRenglon(k);
    while (k < toks.length && !(toks[k].t === 'nl' && toks[k].ind <= ind)) k += 1;
    return k;
  };
  let i = 0;
  let dentro = false;
  while (i < toks.length) {
    const t = toks[i];
    if (t.t === 'nl') {
      if (dentro && t.ind <= defInd) break;
      i += 1;
      continue;
    }
    const v = t.t === 'id' || t.t === 'p' ? t.v : null;
    if (v === 'def' && i === def - 1) {
      i = toks.findIndex((x, k) => k > p.fin - 1 && x.v === ':') + 1;
      dentro = true;
      continue;
    }
    if (v === 'def' || v === 'class' || v === '@') {
      i = saltarBloque(i);
      continue;
    }
    if (v === 'import' || v === 'from' || v === 'pass' || v === 'global') {
      i = finRenglon(i);
      continue;
    }
    if (t.t === 'id' && toks[i + 1]?.v === '=') {
      try {
        const r = evaluar(toks, i + 2, env, true);
        if (!terminaSentencia(toks, r.fin, true)) throw new NoSoportado();
        env[t.v] = r.valor;
        i = r.fin;
      } catch (e) {
        if (e instanceof ErrorDelCodigo && dentro) throw e;
        env[t.v] = DESCONOCIDO;
        i = finRenglon(i);
      }
      continue;
    }
    if (!dentro && CONTROL_PY.has(v)) {
      i = saltarBloque(i);
      continue;
    }
    if (dentro) {
      const esLogger = t.t === 'id' && toks[i + 1]?.v === '.' && ['info', 'warning', 'error', 'debug', 'critical', 'exception'].includes(toks[i + 2]?.v) && toks[i + 3]?.v === '(';
      if ((v === 'print' && toks[i + 1]?.v === '(') || esLogger) {
        const abre = esLogger ? i + 3 : i + 1;
        const cierre = cierreBloque(toks, abre);
        try {
          const args = [];
          let k = abre + 1;
          while (k < cierre) {
            if (toks[k]?.t === 'id' && toks[k + 1]?.v === '=') {
              k = evaluar(toks, k + 2, env, true).fin;
            } else {
              const r = evaluar(toks, k, env, true);
              args.push(r.valor);
              k = r.fin;
            }
            if (toks[k]?.v === ',') k += 1;
            else if (k !== cierre) throw new NoSoportado();
          }
          const texto = esLogger ? pyRepr(args[0], true) : args.map((a) => pyRepr(a, true)).join(' ');
          logs.push({ nivel: esLogger ? `[${toks[i + 2].v === 'warning' ? 'WARNING' : toks[i + 2].v.toUpperCase()}]` : null, texto });
        } catch (e) {
          if (e instanceof ErrorDelCodigo) throw e;
        }
        i = cierre + 1;
        continue;
      }
      if (v === 'return') {
        if (terminaSentencia(toks, i + 1, true)) return { respuesta: null, error: null, logs, interpretado: true };
        const r = evaluar(toks, i + 1, env, true);
        if (!terminaSentencia(toks, r.fin, true)) throw new NoSoportado();
        return { respuesta: r.valor === undefined ? null : r.valor, error: null, logs, interpretado: true };
      }
      if (v === 'raise') {
        const tipo = toks[i + 1]?.t === 'id' ? toks[i + 1].v : 'Exception';
        let mensaje = '';
        if (toks[i + 2]?.v === '(' && toks[i + 3]?.v !== ')') mensaje = pyRepr(evaluar(toks, i + 3, env, true).valor, true);
        throw new ErrorDelCodigo(tipo, mensaje);
      }
      if (CONTROL_PY.has(v)) return { respuesta: null, error: null, logs, interpretado: false };
    }
    i = finRenglon(i);
  }
  return { respuesta: null, error: null, logs, interpretado: true };
}

/* ============================================================ funciones */

const NOMBRE_FUNCION = /^[A-Za-z0-9_-]{1,64}$/;
const sinAcentos = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * «Create function» (Author from scratch).
 * rol: { modo: 'nuevo' } crea `<fn>-role-xxxxxxxx` con AWSLambdaBasicExecutionRole;
 *      { modo: 'existente', nombre } usa un rol que confíe en lambda.amazonaws.com.
 */
export function crearFuncion(estado, { nombre, runtime = 'nodejs22.x', arquitectura = 'x86_64', rol = { modo: 'nuevo' }, descripcion = '', codigo = null } = {}) {
  iniciar(estado);
  const n = String(nombre ?? '').trim();
  if (!NOMBRE_FUNCION.test(n)) {
    throw errorAws('InvalidParameterValueException', 'Function name must be 1 to 64 characters, must be unique to the Region, and can’t include spaces. Valid characters are a-z, A-Z, 0-9, hyphens (-), and underscores (_).');
  }
  if (estado.lambda.funciones.some((f) => f.nombre === n)) throw errorAws('ResourceConflictException', `Function already exist: ${n}`);
  const rt = runtimeLambda(runtime);
  if (!rt) throw errorAws('InvalidParameterValueException', `Value ${runtime} at 'runtime' failed to satisfy constraint: Member must satisfy enum value set`);
  if (!['x86_64', 'arm64'].includes(arquitectura)) throw errorAws('InvalidParameterValueException', `Value [${arquitectura}] at 'architectures' failed to satisfy constraint`);

  let rolIam;
  if (rol?.modo === 'existente') {
    rolIam = estado.iam.roles.find((r) => r.nombre === rol.nombre);
    if (!rolIam || rolIam.servicio !== 'lambda.amazonaws.com') throw errorAws('InvalidParameterValueException', 'The role defined for the function cannot be assumed by Lambda.');
  } else {
    const azar = Array.from({ length: 8 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Number.parseInt(hexAzar(2), 16) % 36]).join('');
    const nombreRol = `${sinAcentos(n).slice(0, 50)}-role-${azar}`;
    // La política básica de Lambda (escribir en CloudWatch Logs), si el catálogo de IAM ya la trae.
    const politicas = politicaIam('AWSLambdaBasicExecutionRole') ? ['AWSLambdaBasicExecutionRole'] : [];
    rolIam = crearRol(estado, { nombre: nombreRol, servicio: 'lambda.amazonaws.com', descripcion: '', politicas });
  }
  const py = rt.lenguaje === 'py';
  const ahora = iso();
  const fn = {
    nombre: n,
    arn: arnFuncion(estado, n),
    runtime: rt.id,
    arquitectura,
    handler: py ? 'lambda_function.lambda_handler' : 'index.handler',
    archivo: py ? 'lambda_function.py' : 'index.mjs',
    codigo: codigo ?? codigoInicialLambda(rt.id),
    sha: shaFalso(),
    descripcion: String(descripcion ?? '').slice(0, 256),
    rol: rolIam.nombre,
    rolArn: rolIam.arn,
    timeout: 3,
    memoria: 128,
    efimero: 512,
    variables: [],
    etiquetas: [],
    creado: ahora,
    modificado: ahora,
    estado: 'Active',
    eventosPrueba: [],
    mapeos: [],
    s3: [],
    invocaciones: 0,
    errores: 0,
    calienteHasta: 0,
    flujo: null,
    ultimas: []
  };
  estado.lambda.funciones.push(fn);
  anotar(estado, 'Lambda', 'CreateFunction', `${n} (${rt.nombre}, rol ${rolIam.nombre})`);
  return fn;
}

/** «Deploy»: guarda el código nuevo. */
export function desplegarCodigo(estado, nombre, codigo) {
  iniciar(estado);
  const fn = funcionOError(estado, nombre);
  const texto = String(codigo ?? '');
  if (new TextEncoder().encode(texto).length > LIMITE_CODIGO) throw errorAws('CodeStorageExceededException', 'Code storage limit exceeded. The inline code editor in this simulator accepts up to 64 KB.');
  fn.codigo = texto;
  fn.sha = shaFalso();
  fn.modificado = iso();
  anotar(estado, 'Lambda', 'UpdateFunctionCode', fn.nombre);
  return fn;
}

function rango(valor, campo, min, max) {
  const n = Number(valor);
  if (!Number.isInteger(n)) throw errorAws('ValidationException', `1 validation error detected: Value '${valor}' at '${campo}' failed to satisfy constraint: Member must have value greater than or equal to ${min}`);
  if (n < min) throw errorAws('ValidationException', `1 validation error detected: Value '${n}' at '${campo}' failed to satisfy constraint: Member must have value greater than or equal to ${min}`);
  if (n > max) throw errorAws('ValidationException', `1 validation error detected: Value '${n}' at '${campo}' failed to satisfy constraint: Member must have value less than or equal to ${max}`);
  return n;
}

/** «General configuration» → Edit: descripción, memoria, almacenamiento efímero, timeout y rol. */
export function editarConfiguracionLambda(estado, nombre, { descripcion, memoria, timeout, efimero, rol } = {}) {
  iniciar(estado);
  const fn = funcionOError(estado, nombre);
  const cambios = {};
  if (descripcion !== undefined) cambios.descripcion = String(descripcion).slice(0, 256);
  if (memoria !== undefined) cambios.memoria = rango(memoria, 'memorySize', 128, 10240);
  if (efimero !== undefined) cambios.efimero = rango(efimero, 'ephemeralStorage.size', 512, 10240);
  if (timeout !== undefined) cambios.timeout = rango(timeout, 'timeout', 1, 900);
  if (rol !== undefined && rol !== fn.rol) {
    const r = estado.iam.roles.find((x) => x.nombre === rol);
    if (!r || r.servicio !== 'lambda.amazonaws.com') throw errorAws('InvalidParameterValueException', 'The role defined for the function cannot be assumed by Lambda.');
    cambios.rol = r.nombre;
    cambios.rolArn = r.arn;
  }
  // Lambda no deja un timeout mayor que la visibilidad de una cola que la dispara.
  const t = cambios.timeout ?? fn.timeout;
  for (const m of fn.mapeos) {
    const cola = (estado.sqs?.colas ?? []).find((c) => c.arn === m.fuente);
    if (cola && cola.visibilidad < t) throw errorAws('InvalidParameterValueException', `Queue visibility timeout: ${cola.visibilidad} seconds is less than Function timeout: ${t} seconds`);
  }
  Object.assign(fn, cambios, { modificado: iso() });
  anotar(estado, 'Lambda', 'UpdateFunctionConfiguration', fn.nombre);
  return fn;
}

const RESERVADAS = ['_HANDLER', '_X_AMZN_TRACE_ID', 'AWS_DEFAULT_REGION', 'AWS_REGION', 'AWS_EXECUTION_ENV', 'AWS_LAMBDA_FUNCTION_NAME', 'AWS_LAMBDA_FUNCTION_MEMORY_SIZE', 'AWS_LAMBDA_FUNCTION_VERSION', 'AWS_LAMBDA_INITIALIZATION_TYPE', 'AWS_LAMBDA_LOG_GROUP_NAME', 'AWS_LAMBDA_LOG_STREAM_NAME', 'AWS_ACCESS_KEY', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_LAMBDA_RUNTIME_API', 'LAMBDA_TASK_ROOT', 'LAMBDA_RUNTIME_DIR'];

/** «Environment variables» → Edit. */
export function editarVariablesLambda(estado, nombre, variables = []) {
  iniciar(estado);
  const fn = funcionOError(estado, nombre);
  const filas = variables.filter((v) => String(v.llave ?? '').trim()).map((v) => ({ llave: String(v.llave).trim(), valor: String(v.valor ?? '') }));
  const reservadas = filas.filter((v) => RESERVADAS.includes(v.llave)).map((v) => v.llave);
  if (reservadas.length) {
    throw errorAws('InvalidParameterValueException', `Lambda was unable to configure your environment variables because the environment variables you have provided contains reserved keys that are currently not supported for modification. Reserved keys used in this request: ${reservadas.join(', ')}`);
  }
  const malas = filas.filter((v) => !/^[a-zA-Z]([a-zA-Z0-9_])+$/.test(v.llave)).map((v) => v.llave);
  if (malas.length) throw errorAws('InvalidParameterValueException', `Lambda was unable to configure your environment variables because the environment variables you have provided contains invalid keys. Invalid keys: ${malas.join(', ')}`);
  if (new Set(filas.map((v) => v.llave)).size !== filas.length) throw errorAws('InvalidParameterValueException', 'Environment variable keys must be unique.');
  if (JSON.stringify(filas).length > 4096) throw errorAws('InvalidParameterValueException', 'Lambda was unable to configure your environment variables because the environment variables you have provided exceeded the 4KB limit.');
  fn.variables = filas;
  fn.modificado = iso();
  anotar(estado, 'Lambda', 'UpdateFunctionConfiguration', `${fn.nombre}: variables de entorno`);
  return fn;
}

/** «Save» de un evento de prueba (Test). Máximo 10 por función. */
export function guardarEventoPrueba(estado, nombre, { nombreEvento, json, compartido = false } = {}) {
  iniciar(estado);
  const fn = funcionOError(estado, nombre);
  const n = String(nombreEvento ?? '').trim();
  if (!/^[A-Za-z0-9_.-]{1,25}$/.test(n)) {
    throw errorAws('InvalidParameterValueException', 'Event name must contain 1 to 25 characters, and can only include letters, numbers, periods (.), hyphens (-), and underscores (_).');
  }
  try {
    JSON.parse(json);
  } catch {
    throw errorAws('InvalidParameterValueException', 'There is an error in your JSON event. Correct it before saving.');
  }
  const ya = fn.eventosPrueba.find((e) => e.nombre === n);
  if (ya) Object.assign(ya, { json: String(json), compartido: Boolean(compartido) });
  else {
    if (fn.eventosPrueba.length >= 10) throw errorAws('LimitExceededException', 'You can create up to 10 test events per function.');
    fn.eventosPrueba.push({ nombre: n, json: String(json), compartido: Boolean(compartido) });
  }
  return fn;
}

export function eliminarEventoPrueba(estado, nombre, nombreEvento) {
  iniciar(estado);
  const fn = funcionOError(estado, nombre);
  fn.eventosPrueba = fn.eventosPrueba.filter((e) => e.nombre !== nombreEvento);
  return fn;
}

/** «Delete function». El rol y los logs se quedan (como en AWS). */
export function eliminarFuncion(estado, nombre) {
  iniciar(estado);
  const fn = funcionOError(estado, nombre);
  estado.lambda.funciones = estado.lambda.funciones.filter((f) => f !== fn);
  anotar(estado, 'Lambda', 'DeleteFunction', fn.nombre);
}

/* ============================================================== invocar */

const fechaFlujo = (ms) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '/');
const azarEntre = (min, max) => min + (Number.parseInt(hexAzar(4), 16) / 65536) * (max - min);

/** Arma el texto del log (START / líneas / END / REPORT) como lo pinta Lambda. */
function textoLog(fn, requestId, r, { duracion, facturada, memoriaUsada, inicio, ms }) {
  const py = lenguajeDe(fn) === 'py';
  const t = new Date(ms).toISOString();
  const lineas = [`START RequestId: ${requestId} Version: $LATEST`];
  for (const l of r.logs) {
    if (py) lineas.push(l.nivel ? `${l.nivel}\t${t}\t${requestId}\t${l.texto}` : l.texto);
    else lineas.push(`${t}\t${requestId}\t${l.nivel}\t${l.texto}`);
  }
  if (r.error) {
    if (py) lineas.push(`[ERROR] ${r.error.tipo}: ${r.error.mensaje}\nTraceback (most recent call last):\n  File "/var/task/lambda_function.py", line 1, in lambda_handler`);
    else lineas.push(`${t}\t${requestId}\tERROR\tInvoke Error \t${JSON.stringify({ errorType: r.error.tipo, errorMessage: r.error.mensaje, stack: [`${r.error.tipo}: ${r.error.mensaje}`, '    at Runtime.handler (file:///var/task/index.mjs:1:1)'] })}`);
  }
  lineas.push(`END RequestId: ${requestId}`);
  lineas.push(
    `REPORT RequestId: ${requestId}\tDuration: ${duracion.toFixed(2)} ms\tBilled Duration: ${facturada} ms\tMemory Size: ${fn.memoria} MB\tMax Memory Used: ${memoriaUsada} MB${inicio ? `\tInit Duration: ${inicio.toFixed(2)} ms` : ''}${r.error ? '\tStatus: error' : ''}`
  );
  return lineas.join('\n');
}

/** El cuerpo de error que regresa Lambda cuando el código falla. */
function cuerpoError(fn, requestId, error) {
  if (lenguajeDe(fn) === 'py') return { errorMessage: error.mensaje, errorType: error.tipo, requestId, stackTrace: ['  File "/var/task/lambda_function.py", line 1, in lambda_handler\n'] };
  return { errorType: error.tipo, errorMessage: error.mensaje, trace: [`${error.tipo}: ${error.mensaje}`, '    at Runtime.handler (file:///var/task/index.mjs:1:1)'] };
}

/**
 * Invoca una función: interpreta su código (sin ejecutarlo), escribe el log en
 * CloudWatch Logs (/aws/lambda/<fn>) y cuenta la invocación. Devuelve null si
 * la función no existe; si no:
 * { requestId, ok, respuesta, error, log, duracion, facturada, memoriaUsada, inicio, interpretado }
 */
export function invocarLambda(estado, arnONombre, evento, { origen = 'consola', ahora = reloj.ahora() } = {}) {
  iniciar(estado);
  const fn = funcionLambda(estado, arnONombre);
  if (!fn) return null;
  const requestId = uuidLambda();
  const frio = !fn.calienteHasta || ahora > fn.calienteHasta;
  if (frio || !fn.flujo) fn.flujo = `${fechaFlujo(ahora)}/[$LATEST]${hexAzar(32)}`;
  fn.calienteHasta = ahora + DURACION_LAMBDA.caliente;
  const contexto = {
    functionName: fn.nombre,
    function_name: fn.nombre,
    functionVersion: '$LATEST',
    function_version: '$LATEST',
    invokedFunctionArn: fn.arn,
    invoked_function_arn: fn.arn,
    memoryLimitInMB: String(fn.memoria),
    memory_limit_in_mb: fn.memoria,
    awsRequestId: requestId,
    aws_request_id: requestId,
    logGroupName: `/aws/lambda/${fn.nombre}`,
    log_group_name: `/aws/lambda/${fn.nombre}`,
    logStreamName: fn.flujo,
    log_stream_name: fn.flujo
  };
  const r = interpretarCodigo(fn.codigo, lenguajeDe(fn), evento, { variables: fn.variables, contexto });
  const duracion = azarEntre(1, r.logs.length ? 25 : 12);
  const datos = {
    duracion,
    facturada: Math.ceil(duracion),
    memoriaUsada: Math.min(fn.memoria, Math.round(azarEntre(lenguajeDe(fn) === 'py' ? 34 : 62, lenguajeDe(fn) === 'py' ? 42 : 72))),
    inicio: frio ? azarEntre(120, 230) : null,
    ms: ahora
  };
  const log = textoLog(fn, requestId, r, datos);
  const ok = !r.error;
  const respuesta = ok ? r.respuesta : cuerpoError(fn, requestId, r.error);
  fn.invocaciones += 1;
  if (!ok) fn.errores += 1;
  fn.ultimas.push({
    t: ahora,
    requestId,
    origen,
    ok,
    duracion: Number(duracion.toFixed(2)),
    respuesta: JSON.stringify(respuesta ?? null).slice(0, 600),
    log: log.slice(0, 1500)
  });
  if (fn.ultimas.length > LIMITE_ULTIMAS) fn.ultimas.splice(0, fn.ultimas.length - LIMITE_ULTIMAS);
  // CloudWatch Logs (si ya existe esa extensión): un evento por renglón.
  for (const linea of log.split('\n')) llamar('escribirLog', estado, `/aws/lambda/${fn.nombre}`, fn.flujo, linea);
  return { requestId, ok, respuesta, error: r.error, log, ...datos, interpretado: r.interpretado };
}

/** «Test» desde la consola: el JSON del evento como texto. */
export function probarFuncion(estado, nombre, eventoJson, { ahora } = {}) {
  iniciar(estado);
  const fn = funcionOError(estado, nombre);
  let evento;
  try {
    evento = typeof eventoJson === 'string' ? JSON.parse(eventoJson || '{}') : eventoJson ?? {};
  } catch {
    throw errorAws('InvalidRequestContentException', 'There is an error in your JSON event. Correct it before testing.');
  }
  anotar(estado, 'Lambda', 'Invoke', `${fn.nombre} (Test)`);
  return invocarLambda(estado, fn.nombre, evento, { origen: 'consola', ahora });
}

/* =========================================================== disparadores */

/** Todos los disparadores de una función: SNS, SQS, EventBridge y S3. */
export function disparadoresLambda(estado, nombreOArn) {
  const fn = funcionLambda(estado, nombreOArn);
  if (!fn) return [];
  const lista = [];
  for (const tema of estado.sns?.temas ?? []) {
    for (const s of tema.suscripciones) {
      if (s.protocolo === 'lambda' && funcionLambda(estado, s.endpoint) === fn) lista.push({ tipo: 'sns', id: s.arn, fuente: tema.arn, nombre: tema.nombre, estado: 'Enabled' });
    }
  }
  for (const m of fn.mapeos) lista.push({ tipo: 'sqs', id: m.uuid, fuente: m.fuente, nombre: m.fuente.split(':').pop(), estado: m.activo ? 'Enabled' : 'Disabled', tamanoLote: m.tamanoLote });
  for (const r of estado.eventbridge?.reglas ?? []) {
    if (r.destinos.some((d) => d.tipo === 'lambda' && funcionLambda(estado, d.arn) === fn)) {
      lista.push({ tipo: 'eventbridge', id: r.nombre, fuente: r.arn, nombre: r.nombre, estado: r.estado === 'ENABLED' ? 'Enabled' : 'Disabled', expresion: r.expresion, patron: r.patron });
    }
  }
  for (const c of fn.s3) lista.push({ tipo: 's3', id: c.id, fuente: `arn:aws:s3:::${c.bucket}`, nombre: c.bucket, estado: 'Enabled', eventos: c.eventos, prefijo: c.prefijo, sufijo: c.sufijo });
  return lista;
}

const tienePolitica = (rol, nombres) => rol && rol.politicas.some((p) => nombres.includes(p));

/**
 * «Add trigger». tipo: 'sns' { temaArn } | 'sqs' { colaArn, tamanoLote, ventana, activo }
 * | 'eventbridge' { reglaNombre } o { nuevaRegla: { nombre, descripcion, tipo, expresion, patron } }
 * | 's3' { bucket, eventos, prefijo, sufijo }.
 */
export function agregarDisparador(estado, nombreFn, p = {}) {
  iniciar(estado);
  const fn = funcionOError(estado, nombreFn);
  if (p.tipo === 'sns') {
    const sub = llamar('crearSuscripcion', estado, { temaArn: p.temaArn, protocolo: 'lambda', endpoint: fn.arn });
    if (!sub) throw errorAws('ServiceException', 'Amazon SNS is not available.');
    return { tipo: 'sns', id: sub.arn };
  }
  if (p.tipo === 'sqs') {
    const cola = (estado.sqs?.colas ?? []).find((c) => c.arn === p.colaArn || c.url === p.colaArn || c.nombre === p.colaArn);
    if (!cola) {
      throw errorAws('InvalidParameterValueException', 'Error occurred while ReceiveMessage. SQS Error Code: AWS.SimpleQueueService.NonExistentQueue. SQS Error Message: The specified queue does not exist or you do not have access to it.');
    }
    // El rol de ejecución necesita leer de SQS (si el catálogo de IAM ya trae la política).
    if (politicaIam('AWSLambdaSQSQueueExecutionRole')) {
      const rol = estado.iam.roles.find((r) => r.nombre === fn.rol);
      if (!tienePolitica(rol, ['AWSLambdaSQSQueueExecutionRole', 'AdministratorAccess', 'PowerUserAccess', 'AmazonSQSFullAccess'])) {
        throw errorAws('InvalidParameterValueException', 'The provided execution role does not have permissions to call ReceiveMessage on SQS');
      }
    }
    if (cola.visibilidad < fn.timeout) throw errorAws('InvalidParameterValueException', `Queue visibility timeout: ${cola.visibilidad} seconds is less than Function timeout: ${fn.timeout} seconds`);
    const ya = fn.mapeos.find((m) => m.fuente === cola.arn);
    if (ya) {
      throw errorAws('ResourceConflictException', `An event source mapping with SQS arn (" ${cola.arn} ") and function (" ${fn.nombre} ") already exists. Please update or delete the existing mapping with UUID ${ya.uuid}`);
    }
    const maximo = cola.tipo === 'FIFO' ? 10 : 10000;
    const lote = Number(p.tamanoLote ?? 10);
    if (!Number.isInteger(lote) || lote < 1 || lote > maximo) throw errorAws('InvalidParameterValueException', `Batch size must be between 1 and ${maximo}.`);
    const ventana = Number(p.ventana ?? 0);
    if (!Number.isInteger(ventana) || ventana < 0 || ventana > 300) throw errorAws('InvalidParameterValueException', 'Maximum batching window must be between 0 and 300 seconds.');
    if (lote > 10 && ventana < 1) throw errorAws('InvalidParameterValueException', 'Maximum batch window in seconds must be greater than 0 if maximum batch size is greater than 10');
    const m = { uuid: uuidLambda(), tipo: 'sqs', fuente: cola.arn, tamanoLote: lote, ventana, activo: p.activo !== false, creado: iso(), modificado: iso() };
    fn.mapeos.push(m);
    anotar(estado, 'Lambda', 'CreateEventSourceMapping', `${cola.nombre} → ${fn.nombre}`);
    return { tipo: 'sqs', id: m.uuid };
  }
  if (p.tipo === 'eventbridge') {
    if (p.nuevaRegla) {
      const r = crearRegla(estado, { ...p.nuevaRegla, destinos: [{ arn: fn.arn }] });
      return { tipo: 'eventbridge', id: r.nombre };
    }
    const r = reglaOError(estado, p.reglaNombre);
    if (!r.destinos.some((d) => d.arn === fn.arn)) {
      if (r.destinos.length >= 5) throw errorAws('LimitExceededException', 'The requested resource exceeds the maximum number allowed.');
      r.destinos.push(destinoNuevo(estado, r, { arn: fn.arn }));
      anotar(estado, 'EventBridge', 'PutTargets', `${r.nombre} → ${fn.nombre}`);
    }
    return { tipo: 'eventbridge', id: r.nombre };
  }
  if (p.tipo === 's3') {
    const bucket = (estado.buckets ?? []).find((b) => b.nombre === p.bucket);
    if (!bucket) throw errorAws('NoSuchBucket', 'The specified bucket does not exist');
    const eventos = (p.eventos?.length ? p.eventos : ['s3:ObjectCreated:*']).map(String);
    const prefijo = String(p.prefijo ?? '');
    const sufijo = String(p.sufijo ?? '');
    const choca = (estado.lambda.funciones ?? []).some((f) =>
      f.s3.some((c) => c.bucket === bucket.nombre && (c.prefijo.startsWith(prefijo) || prefijo.startsWith(c.prefijo)) && (c.sufijo.endsWith(sufijo) || sufijo.endsWith(c.sufijo)) && c.eventos.some((e) => eventos.some((x) => mismaFamiliaS3(e, x))))
    );
    if (choca) throw errorAws('InvalidArgument', 'Configuration is ambiguously defined. Cannot have overlapping suffixes in two rules if the prefixes are overlapping for the same event type.');
    const c = { id: uuidLambda(), bucket: bucket.nombre, eventos, prefijo, sufijo };
    fn.s3.push(c);
    anotar(estado, 'S3', 'PutBucketNotificationConfiguration', `${bucket.nombre} → ${fn.nombre}`);
    return { tipo: 's3', id: c.id };
  }
  throw errorAws('InvalidParameterValueException', `Unsupported trigger type: ${p.tipo}`);
}

const familiaS3 = (e) => String(e).replace(/^s3:/, '').split(':')[0];
const mismaFamiliaS3 = (a, b) => familiaS3(a) === familiaS3(b);

/** Quita un disparador (Delete en Configuration → Triggers). */
export function quitarDisparador(estado, nombreFn, { tipo, id } = {}) {
  iniciar(estado);
  const fn = funcionOError(estado, nombreFn);
  if (tipo === 'sns') {
    llamar('eliminarSuscripcion', estado, id);
  } else if (tipo === 'sqs') {
    fn.mapeos = fn.mapeos.filter((m) => m.uuid !== id);
    anotar(estado, 'Lambda', 'DeleteEventSourceMapping', `${fn.nombre}: ${id}`);
  } else if (tipo === 'eventbridge') {
    const r = reglaOError(estado, id);
    r.destinos = r.destinos.filter((d) => funcionLambda(estado, d.arn) !== fn);
    anotar(estado, 'EventBridge', 'RemoveTargets', `${r.nombre}: ${fn.nombre}`);
  } else if (tipo === 's3') {
    fn.s3 = fn.s3.filter((c) => c.id !== id);
    anotar(estado, 'S3', 'PutBucketNotificationConfiguration', `${fn.nombre}: quitar disparador`);
  }
  return fn;
}

/** Enable / Disable de un disparador de SQS (o cambiar su tamaño de lote). */
export function editarMapeoLambda(estado, nombreFn, uuid, { activo, tamanoLote } = {}) {
  iniciar(estado);
  const fn = funcionOError(estado, nombreFn);
  const m = fn.mapeos.find((x) => x.uuid === uuid);
  if (!m) throw errorAws('ResourceNotFoundException', `The resource you requested does not exist. (Service: Lambda, Status Code: 404, Request ID: ${uuidLambda()})`);
  if (activo !== undefined) m.activo = Boolean(activo);
  if (tamanoLote !== undefined) {
    const n = Number(tamanoLote);
    if (!Number.isInteger(n) || n < 1 || n > 10000) throw errorAws('InvalidParameterValueException', 'Batch size must be between 1 and 10000.');
    m.tamanoLote = n;
  }
  m.modificado = iso();
  anotar(estado, 'Lambda', 'UpdateEventSourceMapping', `${fn.nombre}: ${m.activo ? 'Enabled' : 'Disabled'}`);
  return m;
}

/** S3 avisa que llegó o se borró un objeto: invoca las funciones con ese disparador. */
export function notificarEventoS3(estado, bucket, { llave, tamano = 0, evento = 'ObjectCreated:Put' } = {}) {
  iniciar(estado);
  let n = 0;
  for (const fn of estado.lambda.funciones) {
    for (const c of fn.s3) {
      if (c.bucket !== bucket || !String(llave).startsWith(c.prefijo) || !String(llave).endsWith(c.sufijo)) continue;
      const pasa = c.eventos.some((e) => {
        const x = String(e).replace(/^s3:/, '');
        return x === evento || (x.endsWith(':*') && evento.startsWith(x.slice(0, -1)));
      });
      if (!pasa) continue;
      invocarLambda(estado, fn.nombre, {
        Records: [
          {
            eventVersion: '2.1',
            eventSource: 'aws:s3',
            awsRegion: region(estado),
            eventTime: iso(),
            eventName: evento,
            userIdentity: { principalId: `AWS:${hexAzar(20).toUpperCase()}` },
            s3: { s3SchemaVersion: '1.0', configurationId: c.id, bucket: { name: bucket, arn: `arn:aws:s3:::${bucket}` }, object: { key: llave, size: tamano, eTag: hexAzar(32) } }
          }
        ]
      }, { origen: 's3' });
      n += 1;
    }
  }
  return n;
}

/* ============================================================ EventBridge */

const NOMBRE_REGLA = /^[.\-_A-Za-z0-9]{1,64}$/;
const UNIDADES = { minute: 1, minutes: 1, hour: 60, hours: 60, day: 1440, days: 1440 };

export function reglaEventBridge(estado, nombreOArn) {
  return (estado.eventbridge?.reglas ?? []).find((r) => r.nombre === nombreOArn || r.arn === nombreOArn) ?? null;
}

function reglaOError(estado, nombre) {
  const r = reglaEventBridge(estado, nombre);
  if (!r) throw errorAws('ResourceNotFoundException', `Rule ${nombre} does not exist on EventBus default.`);
  return r;
}

/**
 * Cada cuánto dispara una expresión (en ms reales del simulador) o null si no
 * es válida. rate(5 minutes) → 50 s. Para cron se usa el campo de minutos u horas.
 */
export function periodoRegla(expresion) {
  const t = String(expresion ?? '').trim();
  const rate = /^rate\((\d+)\s+(minute|minutes|hour|hours|day|days)\)$/.exec(t);
  if (rate) {
    const n = Number(rate[1]);
    if (n < 1) return null;
    // AWS exige singular para 1 y plural para más.
    if ((n === 1) !== !rate[2].endsWith('s')) return null;
    return n * UNIDADES[rate[2]] * DURACION_LAMBDA.minutoRegla;
  }
  const cron = /^cron\((.+)\)$/.exec(t);
  if (cron) {
    const campos = cron[1].trim().split(/\s+/);
    if (campos.length !== 6) return null;
    if (!campos.every((c) => /^[\d*?/,\-LW#A-Za-z]+$/.test(c))) return null;
    if (campos[2] !== '?' && campos[4] !== '?') return null;
    if (campos[2] === '?' && campos[4] === '?') return null;
    const cada = (c) => (c === '*' ? 1 : /^(\*|\d+)\/(\d+)$/.test(c) ? Number(c.split('/')[1]) : null);
    const min = cada(campos[0]);
    if (min) return min * DURACION_LAMBDA.minutoRegla;
    const hora = cada(campos[1]);
    if (hora) return hora * 60 * DURACION_LAMBDA.minutoRegla;
    return 1440 * DURACION_LAMBDA.minutoRegla;
  }
  return null;
}

function validarPatron(texto) {
  let v;
  try {
    v = JSON.parse(texto);
  } catch (e) {
    throw errorAws('InvalidEventPatternException', `Event pattern is not valid. Reason: ${e.message}`);
  }
  if (!v || typeof v !== 'object' || Array.isArray(v) || !Object.keys(v).length) throw errorAws('InvalidEventPatternException', 'Event pattern is not valid. Reason: Filter is not an object');
  const revisar = (o) => {
    for (const [k, x] of Object.entries(o)) {
      if (x && typeof x === 'object' && !Array.isArray(x)) revisar(x);
      else if (!Array.isArray(x)) throw errorAws('InvalidEventPatternException', `Event pattern is not valid. Reason: "${k}" must be an object or an array`);
    }
  };
  revisar(v);
  return v;
}

/** «Test pattern»: ¿este evento (texto JSON) cumple el patrón (texto JSON)? */
export function probarPatronEventos(patronTexto, eventoTexto) {
  const patron = validarPatron(patronTexto);
  let evento;
  try {
    evento = JSON.parse(eventoTexto);
  } catch (e) {
    throw errorAws('InvalidEventPatternException', `Event is not valid JSON. Reason: ${e.message}`);
  }
  return Boolean(llamar('coincidePatron', patron, evento));
}

function tipoDestino(arn) {
  if (/^arn:aws:lambda:/.test(arn)) return 'lambda';
  if (/^arn:aws:sqs:/.test(arn)) return 'sqs';
  if (/^arn:aws:sns:/.test(arn)) return 'sns';
  return null;
}

function destinoNuevo(estado, regla, { arn, entrada = 'evento', constante = '' }) {
  const tipo = tipoDestino(String(arn ?? ''));
  if (!tipo) throw errorAws('ValidationException', `Parameter ${arn} is not valid. Reason: Provided Arn is not in correct format.`);
  if (entrada === 'constante') {
    try {
      JSON.parse(constante);
    } catch {
      throw errorAws('ValidationException', 'Input is not a valid JSON text.');
    }
  }
  // Como la consola: al elegir una cola de destino agrega el permiso para EventBridge.
  if (tipo === 'sqs') llamar('permitirEnviosACola', estado, arn, { servicio: 'events.amazonaws.com', fuenteArn: regla.arn });
  return { id: `Id${hexAzar(8)}`, tipo, arn: String(arn), entrada: entrada === 'constante' ? 'constante' : 'evento', constante: entrada === 'constante' ? String(constante) : '' };
}

function validarRegla(p) {
  const tipo = p.tipo === 'patron' ? 'patron' : 'programada';
  let expresion = null;
  let patron = null;
  if (tipo === 'programada') {
    expresion = String(p.expresion ?? '').trim();
    if (!periodoRegla(expresion)) throw errorAws('ValidationException', 'Parameter ScheduleExpression is not valid.');
  } else {
    patron = JSON.stringify(validarPatron(String(p.patron ?? '')), null, 2);
  }
  const destinos = p.destinos ?? [];
  if (destinos.length > 5) throw errorAws('LimitExceededException', 'The requested resource exceeds the maximum number allowed.');
  return { tipo, expresion, patron };
}

/** «Create rule» en el bus default. destinos: [{ arn, entrada: 'evento'|'constante', constante }]. */
export function crearRegla(estado, p = {}) {
  iniciar(estado);
  const n = String(p.nombre ?? '').trim();
  if (!NOMBRE_REGLA.test(n)) {
    throw errorAws('ValidationException', `1 validation error detected: Value '${n}' at 'name' failed to satisfy constraint: Member must satisfy regular expression pattern: [\\.\\-_A-Za-z0-9]+`);
  }
  if (estado.eventbridge.reglas.some((r) => r.nombre === n)) throw errorAws('ResourceAlreadyExistsException', `Rule ${n} already exists on EventBus default.`);
  const v = validarRegla(p);
  const ahora = reloj.ahora();
  const regla = {
    nombre: n,
    arn: arnRegla(estado, n),
    bus: 'default',
    descripcion: String(p.descripcion ?? '').slice(0, 512),
    ...v,
    estado: p.activa === false ? 'DISABLED' : 'ENABLED',
    destinos: [],
    etiquetas: (p.etiquetas ?? []).filter((e) => e.llave?.trim()).map((e) => ({ llave: e.llave.trim(), valor: e.valor ?? '' })),
    creado: iso(ahora),
    proximo: null,
    disparos: 0,
    fallidos: 0,
    ultimoDisparo: null
  };
  regla.destinos = (p.destinos ?? []).map((d) => destinoNuevo(estado, regla, d));
  if (regla.tipo === 'programada' && regla.estado === 'ENABLED') regla.proximo = ahora + periodoRegla(regla.expresion);
  if (regla.tipo === 'patron') fotografiarEc2(estado);
  estado.eventbridge.reglas.push(regla);
  anotar(estado, 'EventBridge', 'PutRule', `${n} (${regla.expresion ?? 'event pattern'})`);
  if (regla.destinos.length) anotar(estado, 'EventBridge', 'PutTargets', `${n}: ${regla.destinos.length} destino(s)`);
  return regla;
}

/** «Edit» de la regla: descripción, horario o patrón y destinos. */
export function editarRegla(estado, nombre, p = {}) {
  iniciar(estado);
  const regla = reglaOError(estado, nombre);
  const v = validarRegla({ tipo: p.tipo ?? regla.tipo, expresion: p.expresion ?? regla.expresion, patron: p.patron ?? regla.patron, destinos: p.destinos ?? regla.destinos });
  const cambioHorario = v.expresion !== regla.expresion;
  Object.assign(regla, v);
  if (p.descripcion !== undefined) regla.descripcion = String(p.descripcion).slice(0, 512);
  if (p.destinos) {
    regla.destinos = p.destinos.map((d) => {
      const nuevo = destinoNuevo(estado, regla, d);
      const viejo = regla.destinos.find((x) => x.arn === nuevo.arn);
      if (viejo) nuevo.id = viejo.id;
      return nuevo;
    });
  }
  if (regla.tipo === 'programada' && regla.estado === 'ENABLED' && (cambioHorario || !regla.proximo)) regla.proximo = reloj.ahora() + periodoRegla(regla.expresion);
  if (regla.tipo === 'patron') regla.proximo = null;
  anotar(estado, 'EventBridge', 'PutRule', regla.nombre);
  return regla;
}

/** Enable / Disable. */
export function cambiarEstadoRegla(estado, nombre, activa) {
  iniciar(estado);
  const regla = reglaOError(estado, nombre);
  regla.estado = activa ? 'ENABLED' : 'DISABLED';
  regla.proximo = activa && regla.tipo === 'programada' ? reloj.ahora() + periodoRegla(regla.expresion) : null;
  if (activa && regla.tipo === 'patron') fotografiarEc2(estado);
  anotar(estado, 'EventBridge', activa ? 'EnableRule' : 'DisableRule', regla.nombre);
  return regla;
}

/** «Delete» (la consola quita antes sus destinos). */
export function eliminarRegla(estado, nombre) {
  iniciar(estado);
  const regla = reglaOError(estado, nombre);
  estado.eventbridge.reglas = estado.eventbridge.reglas.filter((r) => r !== regla);
  if (regla.destinos.length) anotar(estado, 'EventBridge', 'RemoveTargets', regla.nombre);
  anotar(estado, 'EventBridge', 'DeleteRule', regla.nombre);
}

/** Manda un evento a los destinos de una regla. */
function dispararRegla(estado, regla, evento, ahora) {
  regla.disparos += 1;
  regla.ultimoDisparo = iso(ahora);
  for (const d of regla.destinos) {
    const entrada = d.entrada === 'constante' ? JSON.parse(d.constante || '{}') : evento;
    let ok = false;
    if (d.tipo === 'lambda') ok = Boolean(invocarLambda(estado, d.arn, entrada, { origen: 'eventbridge', ahora }));
    else if (d.tipo === 'sqs') ok = Boolean(llamar('enviarACola', estado, d.arn, JSON.stringify(entrada), { origen: 'eventbridge' }));
    else if (d.tipo === 'sns') ok = Boolean(llamar('publicarEnTema', estado, d.arn, { mensaje: JSON.stringify(entrada), origen: 'eventbridge' }));
    if (!ok) regla.fallidos += 1;
  }
}

const eventoBase = (estado, ahora, extra) => ({
  version: '0',
  id: uuidLambda(),
  'detail-type': extra['detail-type'],
  source: extra.source,
  account: cuentaDe(estado),
  time: new Date(ahora).toISOString().replace(/\.\d{3}Z$/, 'Z'),
  region: region(estado),
  resources: extra.resources ?? [],
  detail: extra.detail ?? {}
});

/** Recuerda el estado de cada instancia para notar sus cambios. */
function fotografiarEc2(estado) {
  estado.eventbridge.vistosEc2 = Object.fromEntries((estado.instancias ?? []).map((i) => [i.id, i.estado]));
}

/* ============================================================== métricas */

/** AWS/Lambda por FunctionName: Invocations, Errors, Duration (promedio), Throttles. */
export function metricaLambda(estado, { metrica, dimensiones = {}, periodo = 10_000 } = {}, ahora = reloj.ahora()) {
  const fn = funcionLambda(estado, dimensiones.FunctionName);
  if (!fn) return null;
  const recientes = fn.ultimas.filter((u) => u.t > ahora - periodo && u.t <= ahora);
  if (metrica === 'Invocations') return recientes.length;
  if (metrica === 'Errors') return recientes.filter((u) => !u.ok).length;
  if (metrica === 'Duration') return recientes.length ? recientes.reduce((s, u) => s + u.duracion, 0) / recientes.length : null;
  if (metrica === 'Throttles') return 0;
  if (metrica === 'ConcurrentExecutions') return recientes.length ? 1 : 0;
  return null;
}

/* ============================================================== el tiempo */

function avanzar(estado, ahora) {
  let cambio = false;

  // 1. SQS → Lambda: cada disparador activo lee lotes de su cola.
  for (const fn of estado.lambda.funciones) {
    for (const m of fn.mapeos) {
      if (!m.activo) continue;
      for (let lote = 0; lote < 3; lote++) {
        const mensajes = llamar('recibirDeCola', estado, m.fuente, { maximo: Math.min(10, m.tamanoLote), origen: 'lambda', ahora });
        if (!mensajes?.length) break;
        cambio = true;
        const r = invocarLambda(estado, fn.nombre, {
          Records: mensajes.map((msg) => ({
            messageId: msg.id,
            receiptHandle: msg.recibo,
            body: msg.cuerpo,
            attributes: { ApproximateReceiveCount: String(msg.recibos), SentTimestamp: String(msg.enviado), SenderId: `AIDA${hexAzar(16).toUpperCase()}`, ApproximateFirstReceiveTimestamp: String(msg.primerRecibo) },
            messageAttributes: {},
            md5OfBody: msg.md5,
            eventSource: 'aws:sqs',
            eventSourceARN: m.fuente,
            awsRegion: region(estado)
          }))
        }, { origen: 'sqs', ahora });
        // Si la función falla, los mensajes vuelven a la cola al vencer su visibilidad.
        if (r?.ok) llamar('borrarDeCola', estado, m.fuente, mensajes.map((x) => x.recibo), { ahora });
        else break;
      }
    }
  }

  // 2. Reglas programadas: rate(N minutes) dispara cada N × 10 s.
  for (const regla of estado.eventbridge.reglas) {
    if (regla.estado !== 'ENABLED' || regla.tipo !== 'programada') continue;
    const periodo = periodoRegla(regla.expresion);
    if (!periodo) continue;
    if (!regla.proximo) {
      regla.proximo = ahora + periodo;
      cambio = true;
      continue;
    }
    if (ahora < regla.proximo) continue;
    dispararRegla(estado, regla, eventoBase(estado, ahora, { 'detail-type': 'Scheduled Event', source: 'aws.events', resources: [regla.arn] }), ahora);
    // Si el simulador estuvo cerrado mucho tiempo, no se ponen al corriente todos los disparos.
    regla.proximo = Math.max(regla.proximo + periodo, ahora + 1);
    cambio = true;
  }

  // 3. Reglas con patrón: los cambios de estado de las instancias EC2.
  const conPatron = estado.eventbridge.reglas.filter((r) => r.estado === 'ENABLED' && r.tipo === 'patron');
  if (conPatron.length) {
    const vistos = estado.eventbridge.vistosEc2;
    for (const inst of estado.instancias ?? []) {
      if (vistos[inst.id] === inst.estado) continue;
      const evento = eventoBase(estado, ahora, {
        'detail-type': 'EC2 Instance State-change Notification',
        source: 'aws.ec2',
        resources: [`arn:aws:ec2:${region(estado)}:${cuentaDe(estado)}:instance/${inst.id}`],
        detail: { 'instance-id': inst.id, state: inst.estado }
      });
      for (const regla of conPatron) {
        let patron;
        try {
          patron = JSON.parse(regla.patron);
        } catch {
          continue;
        }
        if (llamar('coincidePatron', patron, evento)) dispararRegla(estado, regla, evento, ahora);
      }
      vistos[inst.id] = inst.estado;
      cambio = true;
    }
    for (const id of Object.keys(vistos)) if (!(estado.instancias ?? []).some((i) => i.id === id)) delete vistos[id];
  } else if (Object.keys(estado.eventbridge.vistosEc2).length) {
    estado.eventbridge.vistosEc2 = {};
    cambio = true;
  }

  return cambio;
}

registrarExtension({
  id: 'lambda',
  orden: 45,
  iniciar,
  avanzar,
  funciones: { invocarLambda, disparadoresLambda, notificarEventoS3, metricaLambda }
});
