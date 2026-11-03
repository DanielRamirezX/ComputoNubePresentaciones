// ---------------------------------------------------------------------------
// DYNAMODB
//
// Tablas NoSQL con su llave primaria (partición y, opcional, ordenamiento),
// ítems en formato «DynamoDB JSON», índices globales (GSI), respaldos (PITR y
// bajo demanda) y réplicas de tablas globales (se ven, pero no se usan).
//
// Scan y Query son funciones PURAS (escanearTabla / consultarTabla): no cambian
// el estado y devuelven lo mismo que muestra la consola en su banner (ítems
// devueltos, ítems revisados, eficiencia y RCU consumidas). Las rúbricas las
// usan para revisar lo que hizo el alumno.
//
// La forma de la colección:
//
// estado.dynamodb = {
//   tablas: [{
//     nombre, arn, id (TableId), estado: 'CREATING'|'ACTIVE'|'UPDATING'|'DELETING', hasta?, siguiente?,
//     pk: { nombre, tipo: 'S'|'N'|'B' }, sk: null | { nombre, tipo },
//     modo: 'PAY_PER_REQUEST'|'PROVISIONED',
//     capacidad: { lectura, escritura },               // RCU y WCU provisionadas (0 en on-demand)
//     autoescalado: { lectura: null | { min, max, objetivo }, escritura: null | {…} },
//     clase: 'STANDARD'|'STANDARD_INFREQUENT_ACCESS',
//     cifrado: { tipo: 'OWNED'|'AWS_MANAGED'|'CUSTOMER_MANAGED', llave: null | arn o alias de KMS },
//     proteccion: bool,                                // Deletion protection
//     pitr: null | { dias, desde },                    // Point-in-time recovery (1 a 35 días)
//     stream: null | 'KEYS_ONLY'|'NEW_IMAGE'|'OLD_IMAGE'|'NEW_AND_OLD_IMAGES', streamArn,
//     indices: [{ nombre, arn, pk: { nombre, tipo }, sk, proyeccion: 'ALL'|'KEYS_ONLY'|'INCLUDE',
//                 atributos: [nombre], estado: 'CREATING'|'ACTIVE', hasta? }],
//     replicas: [{ region, estado: 'CREATING'|'ACTIVE'|'DELETING', hasta? }],
//     etiquetas: [{ llave, valor }],
//     items: [{ <atributo>: { S | N | B | BOOL | NULL | SS | NS | BS | L | M } }],   // DynamoDB JSON
//     consumo: { lecturas, escrituras },               // RCU y WCU acumuladas (para Monitor)
//     restauradaDe: null | texto, creado
//   }],
//   respaldos: [{ arn, nombre, tabla, tablaArn, estado: 'CREATING'|'AVAILABLE', hasta?, tipo: 'USER',
//                 esquema: { pk, sk, modo, capacidad, clase, indices }, items: [item], bytes, creado }]
// }
//
// Regla de este archivo: nada importado de modelo.js se usa en el nivel
// superior (se carga en ciclo con modelo.js), solo dentro de funciones.
// ---------------------------------------------------------------------------

import { registrarExtension, llamar } from './registro.js';
import { anotar, errorAws, iso, nombreLimpio, hexAzar, reloj } from '../modelo.js';

/** Cuánto tarda cada transición de DynamoDB (tiempo comprimido del simulador, en ms). */
const DURACION = {
  tablaSeCrea: 3000,
  tablaSeBorra: 3000,
  tablaSeActualiza: 3000,
  indiceSeCrea: 3000,
  replicaSeCrea: 8000,
  replicaSeBorra: 4000,
  respaldoSeCrea: 3000,
  tablaSeRestaura: 5000
};
export { DURACION as DURACION_DYNAMO };

// Límites del simulador (para que la cuenta quepa en el almacén del navegador).
// En AWS no hay límite de ítems y un ítem puede medir hasta 400 KB.
const LIMITE = { tablas: 40, bytesItem: 8 * 1024, bytesCuenta: 200 * 1024, respaldos: 20, indices: 20, filtros: 10 };
export { LIMITE as LIMITES_DYNAMO };

/** Las regiones que la consola ofrece para una réplica de tabla global. */
export const REGIONES_DYNAMO = [
  ['us-east-2', 'US East (Ohio)'],
  ['us-west-1', 'US West (N. California)'],
  ['us-west-2', 'US West (Oregon)'],
  ['ca-central-1', 'Canada (Central)'],
  ['mx-central-1', 'Mexico (Central)'],
  ['sa-east-1', 'South America (São Paulo)'],
  ['eu-west-1', 'Europe (Ireland)'],
  ['eu-central-1', 'Europe (Frankfurt)'],
  ['ap-northeast-1', 'Asia Pacific (Tokyo)'],
  ['ap-southeast-2', 'Asia Pacific (Sydney)']
];

const TIPOS_LLAVE = ['S', 'N', 'B'];
const TIPOS_VALOR = ['S', 'N', 'B', 'BOOL', 'NULL', 'SS', 'NS', 'BS', 'L', 'M'];
const NOMBRE_TABLA = /^[a-zA-Z0-9_.-]+$/;
const NUMERO = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

function iniciar(estado) {
  estado.dynamodb ??= { tablas: [], respaldos: [] };
  estado.dynamodb.tablas ??= [];
  estado.dynamodb.respaldos ??= [];
}

/* ============================================================ utilidades */

const region = () => 'us-east-1';
const arnTabla = (estado, nombre) => `arn:aws:dynamodb:${region()}:${estado.cuenta.id}:table/${nombre}`;
const uuid = () => `${hexAzar(8)}-${hexAzar(4)}-4${hexAzar(3)}-${'89ab'[parseInt(hexAzar(1), 16) % 4]}${hexAzar(3)}-${hexAzar(12)}`;

/** Bytes en UTF-8 (lo que cuenta DynamoDB para nombres y cadenas). */
function bytesUtf8(texto) {
  let n = 0;
  for (const c of String(texto)) {
    const p = c.codePointAt(0);
    n += p < 0x80 ? 1 : p < 0x800 ? 2 : p < 0x10000 ? 3 : 4;
  }
  return n;
}

/** El tamaño de un valor como lo calcula DynamoDB (aproximado: números y binarios). */
function bytesValor(v) {
  const [t, x] = Object.entries(v)[0];
  if (t === 'S') return bytesUtf8(x);
  if (t === 'N') return Math.ceil(String(x).replace(/[-+.]/g, '').length / 2) + 1;
  if (t === 'B') return Math.floor((String(x).length * 3) / 4);
  if (t === 'BOOL' || t === 'NULL') return 1;
  if (t === 'SS') return x.reduce((s, e) => s + bytesUtf8(e), 0);
  if (t === 'NS') return x.reduce((s, e) => s + bytesValor({ N: e }), 0);
  if (t === 'BS') return x.reduce((s, e) => s + bytesValor({ B: e }), 0);
  if (t === 'L') return 3 + x.reduce((s, e) => s + 1 + bytesValor(e), 0);
  if (t === 'M') return 3 + Object.entries(x).reduce((s, [k, e]) => s + 1 + bytesUtf8(k) + bytesValor(e), 0);
  return 0;
}

/** Tamaño de un ítem en bytes: nombres de atributos más valores. */
export function tamanoItemDynamo(item) {
  return Object.entries(item ?? {}).reduce((s, [k, v]) => s + bytesUtf8(k) + bytesValor(v), 0);
}

const bytesTabla = (t) => t.items.reduce((s, i) => s + tamanoItemDynamo(i), 0);

/** Lo que guarda la cuenta en ítems (tablas y respaldos), en bytes de JSON. */
function bytesGuardados(estado) {
  const tablas = estado.dynamodb.tablas.reduce((s, t) => s + JSON.stringify(t.items).length, 0);
  const respaldos = estado.dynamodb.respaldos.reduce((s, r) => s + JSON.stringify(r.items).length, 0);
  return tablas + respaldos;
}

function revisarEspacio(estado, extra) {
  if (bytesGuardados(estado) + extra > LIMITE.bytesCuenta)
    throw errorAws('LimitExceededException', `Este simulador guarda hasta ${LIMITE.bytesCuenta / 1024} KB de ítems en toda la cuenta (tablas y respaldos). Borra ítems, tablas o respaldos que ya no uses.`);
}

/** El número canónico, como lo guarda DynamoDB ("950.0" → "950"). */
function numeroCanonico(texto) {
  const t = String(texto).trim();
  if (!NUMERO.test(t)) throw errorAws('ValidationException', 'A value provided cannot be converted into a number');
  const n = Number(t);
  if (!Number.isFinite(n)) throw errorAws('ValidationException', 'Number overflow. Attempting to store a number with magnitude larger than supported range');
  const digitos = t.replace(/^[-+]/, '').replace(/[eE].*$/, '').replace('.', '').replace(/^0+/, '');
  return digitos.length <= 15 ? String(n) : t.replace(/^\+/, '');
}

/** Valida y normaliza un valor de DynamoDB JSON. Lanza ValidationException como AWS. */
function normalizarValor(v, profundidad = 0) {
  if (profundidad > 32) throw errorAws('ValidationException', 'Nesting Levels have exceeded supported limits');
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw errorAws('ValidationException', 'Supplied AttributeValue is empty, must contain exactly one of the supported datatypes');
  const llaves = Object.keys(v);
  if (!llaves.length) throw errorAws('ValidationException', 'Supplied AttributeValue is empty, must contain exactly one of the supported datatypes');
  if (llaves.length > 1) throw errorAws('ValidationException', 'Supplied AttributeValue has more than one datatypes set, must contain exactly one of the supported datatypes');
  const [t] = llaves;
  const x = v[t];
  if (!TIPOS_VALOR.includes(t)) throw errorAws('ValidationException', `Supplied AttributeValue has an unsupported datatype: ${t}`);
  const nombreSet = { SS: 'string set', NS: 'number set', BS: 'binary set' }[t];
  switch (t) {
    case 'S':
      if (typeof x !== 'string') throw errorAws('SerializationException', 'Start of structure or map found where not expected');
      return { S: x };
    case 'N':
      if (typeof x !== 'string' && typeof x !== 'number') throw errorAws('SerializationException', 'NUMBER_VALUE cannot be converted to String');
      return { N: numeroCanonico(x) };
    case 'B':
      if (typeof x !== 'string' || !BASE64.test(x)) throw errorAws('ValidationException', 'One or more parameter values were invalid: Binary value is not valid Base64');
      return { B: x };
    case 'BOOL':
      if (typeof x !== 'boolean') throw errorAws('SerializationException', 'BOOL value must be true or false');
      return { BOOL: x };
    case 'NULL':
      if (x !== true) throw errorAws('ValidationException', 'One or more parameter values were invalid: Null attribute value types must have the value of true');
      return { NULL: true };
    case 'SS':
    case 'NS':
    case 'BS': {
      if (!Array.isArray(x)) throw errorAws('SerializationException', 'Unexpected value type in payload');
      if (!x.length) throw errorAws('ValidationException', `One or more parameter values were invalid: An ${nombreSet} may not be empty`);
      const lista = x.map((e) => {
        if (t === 'NS') return normalizarValor({ N: e }).N;
        if (typeof e !== 'string') throw errorAws('SerializationException', 'Unexpected value type in payload');
        if (t === 'BS') return normalizarValor({ B: e }).B;
        return e;
      });
      const claves = lista.map((e) => (t === 'NS' ? String(Number(e)) : e));
      if (new Set(claves).size !== claves.length) throw errorAws('ValidationException', `One or more parameter values were invalid: Input collection [${lista.join(', ')}] contains duplicates.`);
      return { [t]: lista };
    }
    case 'L':
      if (!Array.isArray(x)) throw errorAws('SerializationException', 'Unexpected value type in payload');
      return { L: x.map((e) => normalizarValor(e, profundidad + 1)) };
    case 'M': {
      if (!x || typeof x !== 'object' || Array.isArray(x)) throw errorAws('SerializationException', 'Unexpected value type in payload');
      const m = {};
      for (const [k, e] of Object.entries(x)) m[k] = normalizarValor(e, profundidad + 1);
      return { M: m };
    }
  }
  return v;
}

/** Valida un ítem completo contra el esquema de la tabla (llaves, tipos, índices y tamaño). */
function normalizarItem(t, item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw errorAws('ValidationException', 'One or more parameter values were invalid: Item is empty');
  const limpio = {};
  for (const [nombre, v] of Object.entries(item)) {
    if (!nombre) throw errorAws('ValidationException', 'One or more parameter values were invalid: An AttributeName cannot be empty');
    limpio[nombre] = normalizarValor(v);
  }
  for (const llave of [t.pk, t.sk].filter(Boolean)) {
    const v = limpio[llave.nombre];
    if (!v) throw errorAws('ValidationException', `One or more parameter values were invalid: Missing the key ${llave.nombre} in the item`);
    const tipo = Object.keys(v)[0];
    if (tipo !== llave.tipo) throw errorAws('ValidationException', `One or more parameter values were invalid: Type mismatch for key ${llave.nombre} expected: ${llave.tipo} actual: ${tipo}`);
    if (tipo !== 'N' && v[tipo] === '') throw errorAws('ValidationException', `One or more parameter values are not valid. The AttributeValue for a key attribute cannot contain an empty ${tipo === 'S' ? 'string' : 'binary'} value. Key: ${llave.nombre}`);
    if (llave === t.pk && bytesUtf8(v[tipo]) > 2048) throw errorAws('ValidationException', 'One or more parameter values were invalid: Size of hashkey has exceeded the maximum size limit of 2048 bytes');
    if (llave === t.sk && bytesUtf8(v[tipo]) > 1024) throw errorAws('ValidationException', 'One or more parameter values were invalid: Aggregated size of all range keys has exceeded the size limit of 1024 bytes');
  }
  // Las llaves de los índices son opcionales (índice disperso), pero si vienen deben ser del tipo correcto.
  for (const ind of t.indices) {
    for (const llave of [ind.pk, ind.sk].filter(Boolean)) {
      const v = limpio[llave.nombre];
      if (!v) continue;
      const tipo = Object.keys(v)[0];
      if (tipo !== llave.tipo) throw errorAws('ValidationException', `One or more parameter values were invalid: Type mismatch for Index Key ${llave.nombre} Expected: ${llave.tipo} Actual: ${tipo} IndexName: ${ind.nombre}`);
      if (tipo !== 'N' && v[tipo] === '') throw errorAws('ValidationException', `One or more parameter values are not valid. A value specified for a secondary index key is not supported. The AttributeValue for a key attribute cannot contain an empty string value. IndexName: ${ind.nombre}, IndexKey: ${llave.nombre}`);
    }
  }
  const bytes = tamanoItemDynamo(limpio);
  if (bytes > 400 * 1024) throw errorAws('ValidationException', 'Item size has exceeded the maximum allowed size');
  if (JSON.stringify(limpio).length > LIMITE.bytesItem) throw errorAws('ValidationException', `Este simulador acepta ítems de hasta ${LIMITE.bytesItem / 1024} KB (en AWS el límite es 400 KB).`);
  return limpio;
}

/** Compara dos valores escalares del mismo tipo: números como números, el resto como texto. */
function comparar(a, b, tipo) {
  if (tipo === 'N') return Number(a) - Number(b);
  return a < b ? -1 : a > b ? 1 : 0;
}

const valorEscalar = (v) => (v ? Object.values(v)[0] : undefined);
const tipoDe = (v) => (v ? Object.keys(v)[0] : null);

/** ¿Dos valores de llave son iguales? (los números se comparan por valor: 7 = 7.0) */
function mismaLlave(a, b) {
  const ta = tipoDe(a);
  if (!a || !b || ta !== tipoDe(b)) return false;
  return comparar(valorEscalar(a), valorEscalar(b), ta) === 0;
}

/** La llave primaria de un ítem: { pk: valor, sk?: valor } con los nombres reales. */
export function llaveDeItemDynamo(tabla, item) {
  const llave = { [tabla.pk.nombre]: item[tabla.pk.nombre] };
  if (tabla.sk) llave[tabla.sk.nombre] = item[tabla.sk.nombre];
  return llave;
}

function indiceDeItem(t, llave) {
  return t.items.findIndex((i) => mismaLlave(i[t.pk.nombre], llave[t.pk.nombre]) && (!t.sk || mismaLlave(i[t.sk.nombre], llave[t.sk.nombre])));
}

/** Un hash estable del valor de partición: Scan devuelve los ítems en ese orden (no alfabético), como DynamoDB. */
function hashParticion(v) {
  let h = 2166136261;
  for (const c of JSON.stringify(v ?? '')) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/* ============================================= conversión DynamoDB JSON ↔ JSON */

/** DynamoDB JSON → JSON normal ({ jugador: { S: 'ana' } } → { jugador: 'ana' }). Los sets salen como listas. */
export function itemDynamoPlano(item) {
  const valor = (v) => {
    const [t, x] = Object.entries(v)[0];
    if (t === 'N') return Number(x);
    if (t === 'NS') return x.map(Number);
    if (t === 'NULL') return null;
    if (t === 'L') return x.map(valor);
    if (t === 'M') return Object.fromEntries(Object.entries(x).map(([k, e]) => [k, valor(e)]));
    return x;
  };
  return Object.fromEntries(Object.entries(item ?? {}).map(([k, v]) => [k, valor(v)]));
}

/** JSON normal → DynamoDB JSON. Cadenas → S, números → N, booleanos → BOOL, null → NULL, listas → L y objetos → M. */
export function itemDynamoTipado(plano) {
  const valor = (x) => {
    if (x === null) return { NULL: true };
    if (typeof x === 'string') return { S: x };
    if (typeof x === 'number') return { N: String(x) };
    if (typeof x === 'boolean') return { BOOL: x };
    if (Array.isArray(x)) return { L: x.map(valor) };
    if (typeof x === 'object') return { M: Object.fromEntries(Object.entries(x).map(([k, e]) => [k, valor(e)])) };
    throw errorAws('ValidationException', 'Unsupported value type');
  };
  if (!plano || typeof plano !== 'object' || Array.isArray(plano)) throw errorAws('ValidationException', 'One or more parameter values were invalid: Item is empty');
  return Object.fromEntries(Object.entries(plano).map(([k, v]) => [k, valor(v)]));
}

/** Un valor escalar escrito por el alumno (texto) → valor tipado según el tipo de la llave. */
function valorDeTexto(texto, tipo) {
  if (texto && typeof texto === 'object') return normalizarValor(texto);
  if (tipo === 'N') return { N: numeroCanonico(texto) };
  if (tipo === 'B') return normalizarValor({ B: String(texto ?? '') });
  if (tipo === 'BOOL') return { BOOL: texto === true || String(texto).toLowerCase() === 'true' };
  if (tipo === 'NULL') return { NULL: true };
  return { S: String(texto ?? '') };
}

/* ================================================================ tablas */

/** Busca una tabla o lanza ResourceNotFoundException como DynamoDB. */
export function tablaDynamoOError(estado, nombre) {
  iniciar(estado);
  const t = estado.dynamodb.tablas.find((x) => x.nombre === nombre && x.estado !== 'DELETING');
  if (!t) throw errorAws('ResourceNotFoundException', `Requested resource not found: Table: ${nombre ?? ''} not found`);
  return t;
}

/** La tabla con ese nombre (o null). */
export function tablaDynamoDe(estado, nombre) {
  return estado.dynamodb?.tablas?.find((t) => t.nombre === nombre) ?? null;
}

function tablaActiva(estado, nombre, accion = 'cambiar') {
  const t = tablaDynamoOError(estado, nombre);
  if (t.estado === 'CREATING') throw errorAws('ResourceInUseException', `Attempt to change a resource which is still in use: Table is being created: ${nombre}`);
  if (t.estado === 'UPDATING' && accion === 'cambiar') throw errorAws('ResourceInUseException', `Attempt to change a resource which is still in use: Table is being updated: ${nombre}`);
  return t;
}

/** Ítems: se puede leer y escribir mientras la tabla esté ACTIVE o UPDATING. */
function tablaDatos(estado, nombre) {
  const t = tablaDynamoOError(estado, nombre);
  if (t.estado === 'CREATING') throw errorAws('ResourceNotFoundException', `Requested resource not found: Table: ${nombre} not found`);
  return t;
}

function validarNombreTabla(nombre, campo = 'tableName') {
  if (nombre.length < 3) throw errorAws('ValidationException', `1 validation error detected: Value '${nombre}' at '${campo}' failed to satisfy constraint: Member must have length greater than or equal to 3`);
  if (nombre.length > 255) throw errorAws('ValidationException', `1 validation error detected: Value '${nombre}' at '${campo}' failed to satisfy constraint: Member must have length less than or equal to 255`);
  if (!NOMBRE_TABLA.test(nombre)) throw errorAws('ValidationException', `1 validation error detected: Value '${nombre}' at '${campo}' failed to satisfy constraint: Member must satisfy regular expression pattern: [a-zA-Z0-9_.-]+`);
}

function validarLlave(llave, que) {
  if (!llave) return null;
  const nombre = nombreLimpio(llave.nombre, 255);
  if (!nombre) throw errorAws('ValidationException', `One or more parameter values were invalid: ${que} name cannot be empty`);
  const tipo = llave.tipo ?? 'S';
  if (!TIPOS_LLAVE.includes(tipo)) throw errorAws('ValidationException', `Member must satisfy enum value set: [B, N, S]`);
  return { nombre, tipo };
}

function validarCapacidad(lectura, escritura) {
  for (const [n, que] of [[lectura, 'ReadCapacityUnits'], [escritura, 'WriteCapacityUnits']]) {
    if (!Number.isInteger(n) || n < 1) throw errorAws('ValidationException', `One or more parameter values were invalid: ${que} must be greater than 0 for table`);
    if (n > 40000) throw errorAws('LimitExceededException', `Subscriber limit exceeded: Provisioned throughput for ${que} can not exceed 40000 for table`);
  }
}

function validarAutoescalado(a, que) {
  if (!a) return null;
  const min = Number(a.min);
  const max = Number(a.max);
  const objetivo = Number(a.objetivo ?? 70);
  if (!Number.isInteger(min) || min < 1) throw errorAws('ValidationException', `${que} minimum capacity units must be at least 1`);
  if (!Number.isInteger(max) || max > 40000) throw errorAws('ValidationException', `${que} maximum capacity units must be at most 40000`);
  if (min > max) throw errorAws('ValidationException', `Maximum capacity cannot be less than minimum capacity`);
  if (!(objetivo >= 20 && objetivo <= 90)) throw errorAws('ValidationException', 'Target utilization must be between 20 and 90 percent');
  return { min, max, objetivo };
}

/** Lee la configuración de capacidad de los parámetros de crear o editar. */
function leerCapacidad({ modo, lectura, escritura, autoescalado }) {
  if (modo === 'PAY_PER_REQUEST' || modo === undefined || modo === null)
    return { modo: 'PAY_PER_REQUEST', capacidad: { lectura: 0, escritura: 0 }, autoescalado: { lectura: null, escritura: null } };
  if (modo !== 'PROVISIONED') throw errorAws('ValidationException', `1 validation error detected: Value '${modo}' at 'billingMode' failed to satisfy constraint: Member must satisfy enum value set: [PROVISIONED, PAY_PER_REQUEST]`);
  const auto = {
    lectura: validarAutoescalado(autoescalado?.lectura, 'Read'),
    escritura: validarAutoescalado(autoescalado?.escritura, 'Write')
  };
  // Con autoescalado, la capacidad arranca en el mínimo.
  const cap = { lectura: auto.lectura ? auto.lectura.min : Number(lectura ?? 5), escritura: auto.escritura ? auto.escritura.min : Number(escritura ?? 5) };
  validarCapacidad(cap.lectura, cap.escritura);
  return { modo: 'PROVISIONED', capacidad: cap, autoescalado: auto };
}

function prepararIndice(estado, t, p, { atributosConocidos }) {
  const nombre = nombreLimpio(p.nombre, 255);
  if (!nombre) throw errorAws('ValidationException', 'One or more parameter values were invalid: Index name cannot be empty');
  validarNombreTabla(nombre, 'indexName');
  if (t.indices.some((i) => i.nombre === nombre)) throw errorAws('ValidationException', `One or more parameter values were invalid: Duplicate index name: ${nombre}`);
  if (t.indices.length >= LIMITE.indices) throw errorAws('LimitExceededException', `Subscriber limit exceeded: the number of global secondary indexes for table ${t.nombre} cannot exceed ${LIMITE.indices}`);
  const pk = validarLlave(p.pk, 'Index partition key');
  if (!pk) throw errorAws('ValidationException', 'One or more parameter values were invalid: Index partition key is required');
  const sk = validarLlave(p.sk, 'Index sort key');
  if (sk && sk.nombre === pk.nombre) throw errorAws('ValidationException', 'Invalid KeySchema: Some index key attribute have no definition');
  // Un mismo atributo no puede tener dos tipos distintos en la tabla.
  for (const ll of [pk, sk].filter(Boolean)) {
    const conocido = atributosConocidos.get(ll.nombre);
    if (conocido && conocido !== ll.tipo) throw errorAws('ValidationException', `One or more parameter values were invalid: Some AttributeDefinitions are not valid. AttributeName ${ll.nombre} has conflicting types`);
    atributosConocidos.set(ll.nombre, ll.tipo);
  }
  const proyeccion = p.proyeccion ?? 'ALL';
  if (!['ALL', 'KEYS_ONLY', 'INCLUDE'].includes(proyeccion)) throw errorAws('ValidationException', 'Unknown ProjectionType');
  const atributos = proyeccion === 'INCLUDE' ? [...new Set((p.atributos ?? []).map((a) => nombreLimpio(a, 255)).filter(Boolean))] : [];
  if (proyeccion === 'INCLUDE' && !atributos.length) throw errorAws('ValidationException', 'One or more parameter values were invalid: NonKeyAttributes must not be empty for INCLUDE projection type');
  return { nombre, arn: `${arnTabla(estado, t.nombre)}/index/${nombre}`, pk, sk, proyeccion, atributos };
}

const atributosDe = (t) => {
  const m = new Map();
  for (const ll of [t.pk, t.sk, ...t.indices.flatMap((i) => [i.pk, i.sk])].filter(Boolean)) m.set(ll.nombre, ll.tipo);
  return m;
};

/**
 * CreateTable. p: { nombre, pk: { nombre, tipo }, sk?, modo: 'PAY_PER_REQUEST'|'PROVISIONED',
 *   lectura, escritura, autoescalado: { lectura: { min, max, objetivo } | null, escritura },
 *   clase, cifrado: 'OWNED'|'AWS_MANAGED'|'CUSTOMER_MANAGED', llaveKms, proteccion, indices: [{ nombre, pk, sk, proyeccion, atributos }], etiquetas }
 */
export function crearTablaDynamo(estado, p = {}) {
  iniciar(estado);
  const nombre = nombreLimpio(p.nombre, 300);
  validarNombreTabla(nombre);
  if (estado.dynamodb.tablas.some((t) => t.nombre === nombre)) throw errorAws('ResourceInUseException', `Table already exists: ${nombre}`);
  if (estado.dynamodb.tablas.length >= LIMITE.tablas) throw errorAws('LimitExceededException', `Este simulador permite hasta ${LIMITE.tablas} tablas por cuenta.`);
  const pk = validarLlave(p.pk, 'Partition key');
  if (!pk) throw errorAws('ValidationException', 'One or more parameter values were invalid: Partition key is required');
  const sk = validarLlave(p.sk?.nombre ? p.sk : null, 'Sort key');
  if (sk && sk.nombre === pk.nombre) throw errorAws('ValidationException', 'Both the Hash Key and the Range Key element in the KeySchema have the same name');
  const clase = p.clase ?? 'STANDARD';
  if (!['STANDARD', 'STANDARD_INFREQUENT_ACCESS'].includes(clase)) throw errorAws('ValidationException', `Unknown table class: ${clase}`);
  const tipoCifrado = p.cifrado ?? 'OWNED';
  if (!['OWNED', 'AWS_MANAGED', 'CUSTOMER_MANAGED'].includes(tipoCifrado)) throw errorAws('ValidationException', 'Unknown SSE type');
  if (tipoCifrado === 'CUSTOMER_MANAGED' && !p.llaveKms) throw errorAws('ValidationException', 'One or more parameter values were invalid: KMSMasterKeyId must be specified for a customer managed key');
  const capacidad = leerCapacidad(p);
  const ahora = reloj.ahora();
  const t = {
    nombre,
    arn: arnTabla(estado, nombre),
    id: uuid(),
    estado: 'CREATING',
    hasta: ahora + DURACION.tablaSeCrea,
    siguiente: 'ACTIVE',
    pk,
    sk,
    ...capacidad,
    clase,
    cifrado: { tipo: tipoCifrado, llave: tipoCifrado === 'CUSTOMER_MANAGED' ? String(p.llaveKms) : null },
    proteccion: Boolean(p.proteccion),
    pitr: null,
    stream: null,
    streamArn: null,
    indices: [],
    replicas: [],
    etiquetas: (p.etiquetas ?? []).filter((e) => String(e.llave ?? '').trim()).map((e) => ({ llave: String(e.llave).trim().slice(0, 128), valor: String(e.valor ?? '').slice(0, 256) })),
    items: [],
    consumo: { lecturas: 0, escrituras: 0 },
    restauradaDe: null,
    creado: iso(ahora)
  };
  const conocidos = atributosDe(t);
  for (const ind of p.indices ?? []) {
    const i = prepararIndice(estado, t, ind, { atributosConocidos: conocidos });
    t.indices.push({ ...i, estado: 'CREATING', hasta: ahora + DURACION.tablaSeCrea });
  }
  estado.dynamodb.tablas.push(t);
  anotar(estado, 'DynamoDB', 'CreateTable', `${nombre} (${pk.nombre}${sk ? ` + ${sk.nombre}` : ''}, ${t.modo})`);
  return t;
}

/**
 * DeleteTable. op: { respaldo: true } crea antes un respaldo bajo demanda
 * («Create an on-demand backup of this table before deleting it»);
 * { alarmas: true } borra las alarmas de CloudWatch de la tabla.
 */
export function eliminarTablaDynamo(estado, nombre, op = {}) {
  const t = tablaDynamoOError(estado, nombre);
  if (t.estado === 'CREATING' || t.estado === 'UPDATING') throw errorAws('ResourceInUseException', `Attempt to change a resource which is still in use: Table is being ${t.estado === 'CREATING' ? 'created' : 'updated'}: ${nombre}`);
  if (t.proteccion) throw errorAws('ValidationException', 'Resource cannot be deleted as it is currently protected against deletion. Disable deletion protection first.');
  if (t.replicas.some((r) => r.estado !== 'DELETING')) throw errorAws('ValidationException', `Table ${nombre} has replicas. Delete the replicas of this global table before deleting the table.`);
  if (op.respaldo) crearRespaldoDynamo(estado, nombre, op.nombreRespaldo || `${nombre}-backup-${iso().slice(0, 10)}`);
  if (op.alarmas) {
    const alarmas = (estado.cloudwatch?.alarmas ?? []).filter((a) => a.namespace === 'AWS/DynamoDB' && JSON.stringify(a.dimensiones ?? []).includes(`"${nombre}"`)).map((a) => a.nombre);
    if (alarmas.length) llamar('eliminarAlarmasInternas', estado, alarmas);
  }
  t.estado = 'DELETING';
  t.hasta = reloj.ahora() + DURACION.tablaSeBorra;
  t.siguiente = null;
  anotar(estado, 'DynamoDB', 'DeleteTable', nombre);
  return t;
}

/** UpdateTable: cambia el modo de capacidad, las unidades o el autoescalado. */
export function editarCapacidadDynamo(estado, nombre, p = {}) {
  const t = tablaActiva(estado, nombre);
  const nueva = leerCapacidad(p);
  if (p.clase && !['STANDARD', 'STANDARD_INFREQUENT_ACCESS'].includes(p.clase)) throw errorAws('ValidationException', `Unknown table class: ${p.clase}`);
  // Una tabla global necesita on-demand o autoescalado de escritura.
  if (nueva.modo === 'PROVISIONED' && t.replicas.length && !nueva.autoescalado.escritura) throw errorAws('ValidationException', 'Table write capacity should either be Pay-Per-Request or AutoScaled.');
  Object.assign(t, nueva);
  if (p.clase) t.clase = p.clase;
  t.estado = 'UPDATING';
  t.hasta = reloj.ahora() + DURACION.tablaSeActualiza;
  t.siguiente = 'ACTIVE';
  anotar(estado, 'DynamoDB', 'UpdateTable', `${nombre}: ${t.modo}${t.modo === 'PROVISIONED' ? ` ${t.capacidad.lectura} RCU / ${t.capacidad.escritura} WCU` : ''}`);
  return t;
}

/** UpdateTable (TableClass). */
export function editarClaseDynamo(estado, nombre, clase) {
  const t = tablaActiva(estado, nombre);
  if (!['STANDARD', 'STANDARD_INFREQUENT_ACCESS'].includes(clase)) throw errorAws('ValidationException', `Unknown table class: ${clase}`);
  t.clase = clase;
  t.estado = 'UPDATING';
  t.hasta = reloj.ahora() + DURACION.tablaSeActualiza;
  t.siguiente = 'ACTIVE';
  anotar(estado, 'DynamoDB', 'UpdateTable', `${nombre}: ${clase}`);
  return t;
}

/** UpdateTable (DeletionProtectionEnabled). */
export function editarProteccionDynamo(estado, nombre, activa) {
  const t = tablaActiva(estado, nombre, 'leer');
  t.proteccion = Boolean(activa);
  anotar(estado, 'DynamoDB', 'UpdateTable', `${nombre}: deletion protection ${activa ? 'on' : 'off'}`);
  return t;
}

/** UpdateContinuousBackups: PITR encendido (con su periodo de 1 a 35 días) o apagado. */
export function editarPitrDynamo(estado, nombre, activa, dias = 35) {
  const t = tablaActiva(estado, nombre, 'leer');
  if (activa) {
    const n = Number(dias);
    if (!Number.isInteger(n) || n < 1 || n > 35) throw errorAws('ValidationException', 'RecoveryPeriodInDays must be between 1 and 35');
    t.pitr = { dias: n, desde: t.pitr?.desde ?? iso() };
  } else t.pitr = null;
  anotar(estado, 'DynamoDB', 'UpdateContinuousBackups', `${nombre}: PITR ${activa ? 'enabled' : 'disabled'}`);
  return t;
}

/** UpdateTable (StreamSpecification). tipo null = apagar. */
export function editarStreamDynamo(estado, nombre, tipo) {
  const t = tablaActiva(estado, nombre);
  if (tipo && !['KEYS_ONLY', 'NEW_IMAGE', 'OLD_IMAGE', 'NEW_AND_OLD_IMAGES'].includes(tipo)) throw errorAws('ValidationException', 'Unknown StreamViewType');
  if (!tipo && t.replicas.length) throw errorAws('ValidationException', 'Table is a global table. Streams cannot be disabled on a global table replica.');
  if (tipo && t.stream && t.stream !== tipo) throw errorAws('ValidationException', `Table already has an enabled stream: ${t.streamArn}`);
  t.stream = tipo || null;
  t.streamArn = tipo ? `${t.arn}/stream/${iso().replace('Z', '')}` : null;
  anotar(estado, 'DynamoDB', 'UpdateTable', `${nombre}: stream ${tipo || 'off'}`);
  return t;
}

/** TagResource / UntagResource: reemplaza las etiquetas. */
export function editarEtiquetasDynamo(estado, nombre, etiquetas = []) {
  const t = tablaDynamoOError(estado, nombre);
  const llaves = new Set();
  t.etiquetas = etiquetas
    .filter((e) => String(e.llave ?? '').trim())
    .map((e) => {
      const llave = String(e.llave).trim().slice(0, 128);
      if (llaves.has(llave)) throw errorAws('ValidationException', `Duplicate tag keys found: ${llave}`);
      llaves.add(llave);
      return { llave, valor: String(e.valor ?? '').slice(0, 256) };
    });
  anotar(estado, 'DynamoDB', 'TagResource', nombre);
  return t;
}

/* =============================================================== índices */

/** UpdateTable (GlobalSecondaryIndexUpdates: Create). */
export function crearIndiceDynamo(estado, nombre, p = {}) {
  const t = tablaActiva(estado, nombre);
  if (t.indices.some((i) => i.estado === 'CREATING')) throw errorAws('LimitExceededException', 'Subscriber limit exceeded: Only 1 online index can be created or deleted simultaneously per table');
  const i = prepararIndice(estado, t, p, { atributosConocidos: atributosDe(t) });
  // Los ítems que ya tienen el atributo con otro tipo impiden el índice (backfill fallido).
  for (const ll of [i.pk, i.sk].filter(Boolean)) {
    const malo = t.items.find((it) => it[ll.nombre] && tipoDe(it[ll.nombre]) !== ll.tipo);
    if (malo) throw errorAws('ValidationException', `One or more parameter values were invalid: Type mismatch for Index Key ${ll.nombre} Expected: ${ll.tipo} Actual: ${tipoDe(malo[ll.nombre])} IndexName: ${i.nombre}`);
  }
  const ind = { ...i, estado: 'CREATING', hasta: reloj.ahora() + DURACION.indiceSeCrea };
  t.indices.push(ind);
  anotar(estado, 'DynamoDB', 'UpdateTable', `${nombre}: create index ${ind.nombre}`);
  return ind;
}

/** UpdateTable (GlobalSecondaryIndexUpdates: Delete). */
export function eliminarIndiceDynamo(estado, nombre, indice) {
  const t = tablaActiva(estado, nombre);
  const i = t.indices.find((x) => x.nombre === indice);
  if (!i) throw errorAws('ResourceNotFoundException', `Requested resource not found: Index: ${indice} not found`);
  if (i.estado === 'CREATING') throw errorAws('ResourceInUseException', `Attempt to change a resource which is still in use: Index is being created: ${indice}`);
  t.indices = t.indices.filter((x) => x !== i);
  anotar(estado, 'DynamoDB', 'UpdateTable', `${nombre}: delete index ${indice}`);
  return t;
}

/* ================================================================= ítems */

/**
 * PutItem: crea el ítem o, si ya existe uno con la misma llave primaria, lo
 * REEMPLAZA completo (los atributos que no vengan desaparecen). Devuelve
 * { item, reemplazado, anterior }.
 */
export function ponerItemDynamo(estado, nombre, item) {
  const t = tablaDatos(estado, nombre);
  const limpio = normalizarItem(t, item);
  const i = indiceDeItem(t, limpio);
  const anterior = i >= 0 ? t.items[i] : null;
  revisarEspacio(estado, JSON.stringify(limpio).length - (anterior ? JSON.stringify(anterior).length : 0));
  if (i >= 0) t.items[i] = limpio;
  else t.items.push(limpio);
  t.consumo.escrituras += Math.max(1, Math.ceil(tamanoItemDynamo(limpio) / 1024));
  anotar(estado, 'DynamoDB', 'PutItem', `${nombre}: ${JSON.stringify(itemDynamoPlano(llaveDeItemDynamo(t, limpio)))}`);
  return { item: limpio, reemplazado: Boolean(anterior), anterior };
}

/** GetItem: el ítem con esa llave ({ jugador: { S: 'ana' } } o { jugador: 'ana' }) o null. Pura. */
export function leerItemDynamo(estado, nombre, llave) {
  const t = tablaDynamoDe(estado, nombre);
  if (!t) return null;
  const tipada = llaveTipada(t, llave);
  const i = indiceDeItem(t, tipada);
  return i >= 0 ? t.items[i] : null;
}

function llaveTipada(t, llave = {}) {
  const r = {};
  for (const ll of [t.pk, t.sk].filter(Boolean)) {
    const v = llave[ll.nombre];
    if (v === undefined || v === null) throw errorAws('ValidationException', 'The provided key element does not match the schema');
    r[ll.nombre] = typeof v === 'object' ? normalizarValor(v) : valorDeTexto(v, ll.tipo);
    if (tipoDe(r[ll.nombre]) !== ll.tipo) throw errorAws('ValidationException', 'The provided key element does not match the schema');
  }
  return r;
}

/**
 * Editar un ítem (lo que hace «Save» en la consola): si la llave no cambió es
 * un PutItem; si cambió, se crea el ítem nuevo y se borra el original.
 */
export function editarItemDynamo(estado, nombre, llaveOriginal, item) {
  const t = tablaDatos(estado, nombre);
  const original = llaveTipada(t, llaveOriginal);
  const i = indiceDeItem(t, original);
  if (i < 0) throw errorAws('ConditionalCheckFailedException', 'The conditional request failed');
  const limpio = normalizarItem(t, item);
  const mismo = mismaLlave(limpio[t.pk.nombre], original[t.pk.nombre]) && (!t.sk || mismaLlave(limpio[t.sk.nombre], original[t.sk.nombre]));
  if (!mismo) t.items.splice(i, 1);
  return ponerItemDynamo(estado, nombre, limpio);
}

/** DeleteItem (uno o varios): llaves = [{ jugador: { S: 'ana' } }, …]. Devuelve cuántos borró. */
export function eliminarItemsDynamo(estado, nombre, llaves = []) {
  const t = tablaDatos(estado, nombre);
  let n = 0;
  for (const llave of llaves) {
    const i = indiceDeItem(t, llaveTipada(t, llave));
    if (i >= 0) {
      t.items.splice(i, 1);
      t.consumo.escrituras += 1;
      n += 1;
    }
  }
  anotar(estado, 'DynamoDB', n > 1 ? 'BatchWriteItem' : 'DeleteItem', `${nombre}: ${n} item(s)`);
  return n;
}

/* ===================================================== Scan y Query (puras) */

/** Los nombres que acepta la consola para las condiciones (Sort key y Filters). */
export const CONDICIONES_DYNAMO = {
  EQ: 'Equal to',
  NE: 'Not equal to',
  LE: 'Less than or equal to',
  LT: 'Less than',
  GE: 'Greater than or equal to',
  GT: 'Greater than',
  BETWEEN: 'Between',
  BEGINS_WITH: 'Begins with',
  NOT_NULL: 'Exists',
  NULL: 'Not exists',
  CONTAINS: 'Contains',
  NOT_CONTAINS: 'Not contains'
};

/** ¿Cumple el valor `v` (tipado) la condición? `a` y `b` ya vienen tipados. */
function cumple(v, condicion, a, b) {
  if (condicion === 'NOT_NULL') return v !== undefined;
  if (condicion === 'NULL') return v === undefined;
  // Un atributo que no existe no cumple ninguna comparación (pero sí «Not contains»).
  if (v === undefined) return condicion === 'NOT_CONTAINS';
  const tv = tipoDe(v);
  const x = valorEscalar(v);
  const ta = tipoDe(a);
  const y = valorEscalar(a);
  if (condicion === 'CONTAINS' || condicion === 'NOT_CONTAINS') {
    let si = false;
    if (tv === 'S' && ta === 'S') si = x.includes(y);
    else if (tv === 'B' && ta === 'B') si = x.includes(y);
    else if (['SS', 'NS', 'BS'].includes(tv)) si = x.some((e) => (tv === 'NS' ? ta === 'N' && Number(e) === Number(y) : e === y));
    else if (tv === 'L') si = x.some((e) => JSON.stringify(e) === JSON.stringify(a));
    return condicion === 'CONTAINS' ? si : !si;
  }
  if (condicion === 'NE') return JSON.stringify(v) !== JSON.stringify(a) && !(tv === ta && tv === 'N' && Number(x) === Number(y));
  if (condicion === 'EQ') {
    if (tv !== ta) return false;
    if (['S', 'N', 'B'].includes(tv)) return comparar(x, y, tv) === 0;
    return JSON.stringify(v) === JSON.stringify(a);
  }
  // Las comparaciones de orden solo valen entre escalares del mismo tipo.
  if (tv !== ta || !['S', 'N', 'B'].includes(tv)) return false;
  const c = comparar(x, y, tv);
  if (condicion === 'LT') return c < 0;
  if (condicion === 'LE') return c <= 0;
  if (condicion === 'GT') return c > 0;
  if (condicion === 'GE') return c >= 0;
  if (condicion === 'BEGINS_WITH') return tv !== 'N' && String(x).startsWith(String(y));
  if (condicion === 'BETWEEN') return tipoDe(b) === tv && c >= 0 && comparar(x, valorEscalar(b), tv) <= 0;
  return false;
}

/** Un filtro de la consola: { atributo, condicion, valor, valor2, tipo: 'S'|'N'|'B'|'BOOL'|'NULL' }. */
function prepararFiltro(f) {
  const atributo = nombreLimpio(f.atributo, 255);
  if (!atributo) throw errorAws('ValidationException', 'Filter attribute name cannot be empty');
  const condicion = f.condicion ?? 'EQ';
  if (!CONDICIONES_DYNAMO[condicion]) throw errorAws('ValidationException', `Unsupported operator: ${condicion}`);
  const sinValor = condicion === 'NOT_NULL' || condicion === 'NULL';
  const tipo = f.tipo ?? 'S';
  if (!sinValor && (f.valor === undefined || f.valor === null || (f.valor === '' && tipo !== 'S'))) throw errorAws('ValidationException', `ExpressionAttributeValues contains invalid value: One or more parameter values were invalid: An AttributeValue may not contain an empty string for key :${atributo}`);
  const a = sinValor ? null : valorDeTexto(f.valor, tipo);
  const b = condicion === 'BETWEEN' ? valorDeTexto(f.valor2 ?? '', tipo) : null;
  if (condicion === 'BETWEEN' && comparar(valorEscalar(a), valorEscalar(b), tipo) > 0) throw errorAws('ValidationException', 'Invalid FilterExpression: The BETWEEN operator requires upper bound to be greater than or equal to lower bound');
  return (item) => cumple(item[atributo], condicion, a, b);
}

/** El origen de la lectura: la tabla o uno de sus índices (solo los ítems que tienen sus llaves). */
function origenLectura(t, indice) {
  if (!indice) return { pk: t.pk, sk: t.sk, items: t.items, proyectar: (i) => i };
  const ind = t.indices.find((i) => i.nombre === indice);
  if (!ind) throw errorAws('ValidationException', `The table does not have the specified index: ${indice}`);
  if (ind.estado !== 'ACTIVE') throw errorAws('ValidationException', `Cannot read from backfilling global secondary index: ${indice}`);
  const items = t.items.filter((i) => i[ind.pk.nombre] && (!ind.sk || i[ind.sk.nombre]));
  const llaves = [t.pk.nombre, t.sk?.nombre, ind.pk.nombre, ind.sk?.nombre].filter(Boolean);
  const proyectar = (i) => {
    if (ind.proyeccion === 'ALL') return i;
    const quedan = ind.proyeccion === 'KEYS_ONLY' ? llaves : [...llaves, ...ind.atributos];
    return Object.fromEntries(Object.entries(i).filter(([k]) => quedan.includes(k)));
  };
  return { pk: ind.pk, sk: ind.sk, items, proyectar };
}

/** RCU de una lectura eventualmente consistente: 0.5 por cada 4 KB leídos (mínimo 0.5). */
function rcuDe(items, fuerte) {
  const bytes = items.reduce((s, i) => s + tamanoItemDynamo(i), 0);
  const bloques = Math.max(1, Math.ceil(bytes / 4096));
  return fuerte ? bloques : bloques / 2;
}

function resultado(revisados, devueltos, proyectar, { fuerte, indice }) {
  return {
    items: devueltos.map(proyectar),
    devueltos: devueltos.length,
    revisados: revisados.length,
    eficiencia: revisados.length ? Math.round((devueltos.length / revisados.length) * 100) : 0,
    rcu: rcuDe(revisados, fuerte),
    indice: indice ?? null
  };
}

/**
 * Scan (pura): lee TODOS los ítems de la tabla o del índice y después aplica
 * los filtros. op: { indice, filtros: [{ atributo, condicion, valor, valor2, tipo }], fuerte }
 * → { items, devueltos, revisados, eficiencia (%), rcu, indice }
 */
export function escanearTabla(estado, nombre, op = {}) {
  const t = tablaDynamoDe(estado, nombre);
  if (!t || t.estado === 'DELETING') throw errorAws('ResourceNotFoundException', `Requested resource not found: Table: ${nombre ?? ''} not found`);
  if (t.estado === 'CREATING') throw errorAws('ResourceNotFoundException', `Requested resource not found: Table: ${nombre} not found`);
  const o = origenLectura(t, op.indice);
  const filtros = (op.filtros ?? []).slice(0, LIMITE.filtros).map(prepararFiltro);
  // El orden de un Scan sale del hash de la partición: no es alfabético.
  const revisados = [...o.items].sort((a, b) => hashParticion(a[o.pk.nombre]) - hashParticion(b[o.pk.nombre]) || (o.sk ? comparar(valorEscalar(a[o.sk.nombre]), valorEscalar(b[o.sk.nombre]), o.sk.tipo) : 0));
  const devueltos = revisados.filter((i) => filtros.every((f) => f(i)));
  return resultado(revisados, devueltos, o.proyectar, { fuerte: op.fuerte, indice: op.indice });
}

/**
 * Query (pura): solo lee los ítems con ese valor de partición (y la condición
 * de la sort key); después aplica los filtros.
 * op: { indice, pk: valor, sk: { condicion: 'EQ'|'LT'|'LE'|'GT'|'GE'|'BETWEEN'|'BEGINS_WITH', valor, valor2 },
 *       filtros, descendente, fuerte }
 * Los valores pueden ser texto/número ('ana', 950) o tipados ({ S: 'ana' }).
 */
export function consultarTabla(estado, nombre, op = {}) {
  const t = tablaDynamoDe(estado, nombre);
  if (!t || t.estado === 'DELETING' || t.estado === 'CREATING') throw errorAws('ResourceNotFoundException', `Requested resource not found: Table: ${nombre ?? ''} not found`);
  const o = origenLectura(t, op.indice);
  if (op.pk === undefined || op.pk === null || op.pk === '') throw errorAws('ValidationException', `Query condition missed key schema element: ${o.pk.nombre}`);
  if (op.fuerte && op.indice) throw errorAws('ValidationException', 'Consistent reads are not supported on global secondary indexes');
  const vpk = valorDeTexto(op.pk, o.pk.tipo);
  if (tipoDe(vpk) !== o.pk.tipo) throw errorAws('ValidationException', 'One or more parameter values were invalid: Condition parameter type does not match schema type');
  let condSk = () => true;
  if (op.sk && op.sk.condicion && op.sk.valor !== undefined && op.sk.valor !== '') {
    if (!o.sk) throw errorAws('ValidationException', 'Query key condition not supported');
    const c = op.sk.condicion;
    if (!['EQ', 'LT', 'LE', 'GT', 'GE', 'BETWEEN', 'BEGINS_WITH'].includes(c)) throw errorAws('ValidationException', `Unsupported operator on KeyConditionExpression: ${c}`);
    if (c === 'BEGINS_WITH' && o.sk.tipo === 'N') throw errorAws('ValidationException', 'Invalid KeyConditionExpression: Incorrect operand type for operator or function; operator or function: begins_with, operand type: N');
    const a = valorDeTexto(op.sk.valor, o.sk.tipo);
    const b = c === 'BETWEEN' ? valorDeTexto(op.sk.valor2 ?? '', o.sk.tipo) : null;
    if (c === 'BETWEEN' && comparar(valorEscalar(a), valorEscalar(b), o.sk.tipo) > 0) throw errorAws('ValidationException', 'Invalid KeyConditionExpression: The BETWEEN operator requires upper bound to be greater than or equal to lower bound');
    condSk = (i) => cumple(i[o.sk.nombre], c, a, b);
  }
  const filtros = (op.filtros ?? []).slice(0, LIMITE.filtros).map(prepararFiltro);
  let revisados = o.items.filter((i) => mismaLlave(i[o.pk.nombre], vpk) && condSk(i));
  if (o.sk) revisados = revisados.sort((a, b) => comparar(valorEscalar(a[o.sk.nombre]), valorEscalar(b[o.sk.nombre]), o.sk.tipo));
  if (op.descendente) revisados.reverse();
  const devueltos = revisados.filter((i) => filtros.every((f) => f(i)));
  return resultado(revisados, devueltos, o.proyectar, { fuerte: op.fuerte, indice: op.indice });
}

/** Lo que la consola anota al correr un Scan o un Query: suma las RCU al consumo de la tabla. */
export function registrarLecturaDynamo(estado, nombre, rcu) {
  const t = tablaDynamoDe(estado, nombre);
  if (!t) return null;
  t.consumo.lecturas = Math.round((t.consumo.lecturas + Number(rcu || 0)) * 10) / 10;
  return t;
}

/* ============================================================= respaldos */

const arnRespaldo = (t) => `${t.arn}/backup/${String(reloj.ahora()).padStart(14, '0')}-${hexAzar(8)}`;

/** CreateBackup: copia los ítems de la tabla en este momento. */
export function crearRespaldoDynamo(estado, nombre, nombreRespaldo) {
  const t = tablaActiva(estado, nombre, 'leer');
  const nombreR = nombreLimpio(nombreRespaldo, 300);
  validarNombreTabla(nombreR, 'backupName');
  if (estado.dynamodb.respaldos.length >= LIMITE.respaldos) throw errorAws('LimitExceededException', `Este simulador guarda hasta ${LIMITE.respaldos} respaldos por cuenta. Borra alguno que ya no uses.`);
  revisarEspacio(estado, JSON.stringify(t.items).length);
  const ahora = reloj.ahora();
  const r = {
    arn: arnRespaldo(t),
    nombre: nombreR,
    tabla: t.nombre,
    tablaArn: t.arn,
    estado: 'CREATING',
    hasta: ahora + DURACION.respaldoSeCrea,
    tipo: 'USER',
    esquema: { pk: t.pk, sk: t.sk, modo: t.modo, capacidad: { ...t.capacidad }, clase: t.clase, indices: t.indices.map(({ nombre: n, pk, sk, proyeccion, atributos }) => ({ nombre: n, pk, sk, proyeccion, atributos })) },
    items: JSON.parse(JSON.stringify(t.items)),
    bytes: bytesTabla(t),
    creado: iso(ahora)
  };
  estado.dynamodb.respaldos.push(r);
  anotar(estado, 'DynamoDB', 'CreateBackup', `${t.nombre} → ${nombreR}`);
  return r;
}

/** DeleteBackup. */
export function eliminarRespaldoDynamo(estado, arn) {
  iniciar(estado);
  const r = estado.dynamodb.respaldos.find((x) => x.arn === arn);
  if (!r) throw errorAws('BackupNotFoundException', `Backup not found: ${arn}`);
  if (r.estado === 'CREATING') throw errorAws('BackupInUseException', `Backup is being created: ${arn}`);
  estado.dynamodb.respaldos = estado.dynamodb.respaldos.filter((x) => x !== r);
  anotar(estado, 'DynamoDB', 'DeleteBackup', r.nombre);
  return r;
}

function tablaRestaurada(estado, nombreNuevo, esquema, items, origen) {
  iniciar(estado);
  const nombre = nombreLimpio(nombreNuevo, 300);
  validarNombreTabla(nombre, 'targetTableName');
  if (estado.dynamodb.tablas.some((t) => t.nombre === nombre)) throw errorAws('TableAlreadyExistsException', `Table already exists: ${nombre}`);
  revisarEspacio(estado, JSON.stringify(items).length);
  const t = crearTablaDynamo(estado, {
    nombre,
    pk: esquema.pk,
    sk: esquema.sk,
    modo: esquema.modo,
    lectura: esquema.capacidad?.lectura || 5,
    escritura: esquema.capacidad?.escritura || 5,
    clase: esquema.clase,
    indices: esquema.indices
  });
  t.hasta = reloj.ahora() + DURACION.tablaSeRestaura;
  t.items = JSON.parse(JSON.stringify(items));
  t.restauradaDe = origen;
  return t;
}

/** RestoreTableFromBackup: siempre crea una tabla NUEVA con los ítems del respaldo. */
export function restaurarRespaldoDynamo(estado, arn, nombreNuevo) {
  iniciar(estado);
  const r = estado.dynamodb.respaldos.find((x) => x.arn === arn);
  if (!r) throw errorAws('BackupNotFoundException', `Backup not found: ${arn}`);
  if (r.estado !== 'AVAILABLE') throw errorAws('BackupInUseException', `Backup is being created: ${arn}`);
  const t = tablaRestaurada(estado, nombreNuevo, r.esquema, r.items, `backup ${r.nombre}`);
  anotar(estado, 'DynamoDB', 'RestoreTableFromBackup', `${r.nombre} → ${t.nombre}`);
  return t;
}

/** RestoreTableToPointInTime (al último momento restaurable): necesita PITR encendido. */
export function restaurarPitrDynamo(estado, nombre, nombreNuevo) {
  const t = tablaActiva(estado, nombre, 'leer');
  if (!t.pitr) throw errorAws('PointInTimeRecoveryUnavailableException', `Point in time recovery is not enabled for table '${nombre}'`);
  const nueva = tablaRestaurada(estado, nombreNuevo, { pk: t.pk, sk: t.sk, modo: t.modo, capacidad: t.capacidad, clase: t.clase, indices: t.indices.filter((i) => i.estado === 'ACTIVE') }, t.items, `point in time of ${nombre}`);
  anotar(estado, 'DynamoDB', 'RestoreTableToPointInTime', `${nombre} → ${nueva.nombre}`);
  return nueva;
}

/* ======================================================= tablas globales */

/** UpdateTable (ReplicaUpdates: Create). La réplica se ve, pero el simulador solo usa us-east-1. */
export function crearReplicaDynamo(estado, nombre, regionReplica) {
  const t = tablaActiva(estado, nombre);
  const reg = REGIONES_DYNAMO.find(([c]) => c === regionReplica);
  if (regionReplica === 'us-east-1') throw errorAws('ValidationException', 'One or more parameter values were invalid: Cannot add replica in the same region as the table');
  if (!reg) throw errorAws('ValidationException', `Region ${regionReplica ?? ''} is not supported for global tables`);
  if (t.replicas.some((r) => r.region === regionReplica)) throw errorAws('ValidationException', `Failed to create a the new replica of table with name: '${nombre}' because one or more replicas already existed as tables.`);
  if (t.modo === 'PROVISIONED' && !t.autoescalado.escritura) throw errorAws('ValidationException', 'Table write capacity should either be Pay-Per-Request or AutoScaled.');
  // La consola enciende DynamoDB Streams (NEW_AND_OLD_IMAGES) para replicar.
  if (!t.stream) {
    t.stream = 'NEW_AND_OLD_IMAGES';
    t.streamArn = `${t.arn}/stream/${iso().replace('Z', '')}`;
  }
  const r = { region: regionReplica, estado: 'CREATING', hasta: reloj.ahora() + DURACION.replicaSeCrea };
  t.replicas.push(r);
  anotar(estado, 'DynamoDB', 'UpdateTable', `${nombre}: create replica ${regionReplica}`);
  return r;
}

/** UpdateTable (ReplicaUpdates: Delete). */
export function eliminarReplicaDynamo(estado, nombre, regionReplica) {
  const t = tablaDynamoOError(estado, nombre);
  const r = t.replicas.find((x) => x.region === regionReplica);
  if (!r) throw errorAws('ValidationException', `Replica ${regionReplica} does not exist for table ${nombre}`);
  if (r.estado === 'CREATING') throw errorAws('ResourceInUseException', `Attempt to change a resource which is still in use: Replica is being created: ${regionReplica}`);
  r.estado = 'DELETING';
  r.hasta = reloj.ahora() + DURACION.replicaSeBorra;
  anotar(estado, 'DynamoDB', 'UpdateTable', `${nombre}: delete replica ${regionReplica}`);
  return r;
}

/* ============================================================== el tiempo */

function avanzar(estado, ahora) {
  let cambio = false;
  const d = estado.dynamodb;
  for (const t of [...d.tablas]) {
    if (t.hasta && t.hasta <= ahora) {
      if (t.estado === 'DELETING') {
        d.tablas = d.tablas.filter((x) => x !== t);
        cambio = true;
        continue;
      }
      t.estado = t.siguiente ?? 'ACTIVE';
      delete t.hasta;
      delete t.siguiente;
      cambio = true;
    }
    for (const i of t.indices) {
      if (i.hasta && i.hasta <= ahora && t.estado !== 'CREATING') {
        i.estado = 'ACTIVE';
        delete i.hasta;
        cambio = true;
      }
    }
    for (const r of [...t.replicas]) {
      if (!r.hasta || r.hasta > ahora) continue;
      if (r.estado === 'DELETING') t.replicas = t.replicas.filter((x) => x !== r);
      else {
        r.estado = 'ACTIVE';
        delete r.hasta;
      }
      cambio = true;
    }
  }
  for (const r of d.respaldos) {
    if (r.hasta && r.hasta <= ahora) {
      r.estado = 'AVAILABLE';
      delete r.hasta;
      cambio = true;
    }
  }
  return cambio;
}

registrarExtension({
  id: 'dynamodb',
  orden: 55,
  iniciar,
  avanzar,
  funciones: { tablaDynamoDe, consultarTabla, escanearTabla, ponerItemDynamo, leerItemDynamo }
});
