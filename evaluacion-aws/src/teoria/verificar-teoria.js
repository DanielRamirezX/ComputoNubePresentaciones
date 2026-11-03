// Revisa que los bancos teóricos cumplan el contrato 4 de DISENO.md: casos
// con 5 preguntas cada uno, 4 opciones con texto y retroalimentación, clave
// balanceada sin rachas de tres, reparto por tema y ninguna pregunta repetida
// entre bancos.
//
// Los simulacros de octubre siguen sus reglas fijas (5 casos, 25 preguntas,
// 45 minutos, los 4 temas de las sesiones 1 a 4). Un banco puede declarar las
// suyas con `export const REGLAS`, y el del examen final debe hacerlo
// (SIMULADOR.md §6: 8 casos × 5 preguntas, 50 minutos):
//
//   export const REGLAS = {
//     casos: 8, preguntasPorCaso: 5, minutos: 50,
//     temas: ['Conceptos de la nube', …],              // por omisión, TEMAS del banco
//     porTema: { 'Conceptos de la nube': [9, 11], … },  // o { min, max } para todos (opcional)
//     porLetra: { min, max },                          // opcional (por omisión, parejo ± 1)
//     sesiones: [0, 13],                               // rango del campo `sesion` (0 = fuera de la Ruta)
//     palabrasHistoria: { min: 80, max: 150 }          // opcional
//   };
//
//   node src/teoria/verificar-teoria.js      → imprime el resultado; sale con 1 si hay problemas
//   import { verificarTeoria } from './teoria/verificar-teoria.js'   → lista de problemas ([] si todo bien)

import { pathToFileURL } from 'node:url';
import { EVALUACIONES, TIPOS, tipoDe } from '../evaluaciones.js';
import { TEORIA } from './index.js';

const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F'];

// Las reglas de los simulacros de octubre (no cambian).
const TEMAS = ['Fundamentos y EC2', 'Identidad y seguridad', 'Redes', 'Almacenamiento'];
const DE_OCTUBRE = {
  temas: TEMAS,
  sesionDeTema: { 'Fundamentos y EC2': 1, 'Identidad y seguridad': 2, Redes: 3, Almacenamiento: 4 },
  minutos: 45,
  casos: 5,
  preguntasPorCaso: 5,
  opciones: 4,
  porLetra: { min: 6, max: 7 },
  porTema: { min: 6, max: 7 },
  palabrasHistoria: { min: 80, max: 150 },
  // La correcta no debe delatarse por ser la opción más larga.
  maxCorrectaMasLarga: 8
};

// Lo que pide SIMULADOR.md §6 para la teórica del examen final.
const DEL_FINAL = { casos: 8, preguntasPorCaso: 5, minutos: 50 };

const tipoDelBanco = (id) => tipoDe(EVALUACIONES.find((ev) => ev.teoria === id));

/** Las reglas de un banco: las de octubre, o las que declara en REGLAS (completadas). */
function reglasDe(id, banco) {
  const tipo = tipoDelBanco(id);
  if (!banco.REGLAS && tipo !== 'final') return DE_OCTUBRE;
  const r = banco.REGLAS ?? {};
  const casos = r.casos ?? DEL_FINAL.casos;
  const preguntasPorCaso = r.preguntasPorCaso ?? DEL_FINAL.preguntasPorCaso;
  const opciones = r.opciones ?? 4;
  const n = casos * preguntasPorCaso;
  return {
    temas: r.temas ?? banco.TEMAS ?? [],
    sesionDeTema: r.sesionDeTema ?? null,
    sesiones: r.sesiones ?? [0, 13],
    minutos: r.minutos ?? TIPOS[tipo].minutosTeoria ?? 45,
    casos,
    preguntasPorCaso,
    opciones,
    porLetra: r.porLetra ?? { min: Math.floor(n / opciones) - 1, max: Math.ceil(n / opciones) + 1 },
    porTema: r.porTema ?? null,
    palabrasHistoria: r.palabrasHistoria ?? DE_OCTUBRE.palabrasHistoria,
    maxCorrectaMasLarga: r.maxCorrectaMasLarga ?? Math.ceil(n * 0.32)
  };
}

/** [min, max] de preguntas de un tema según `porTema` (por tema, parejo o «al menos 1»). */
function rangoTema(porTema, tema) {
  if (!porTema) return [1, Infinity];
  const propio = porTema[tema];
  if (Array.isArray(propio)) return propio;
  if (typeof propio === 'number') return [propio, propio];
  if (typeof porTema.min === 'number') return [porTema.min, porTema.max ?? Infinity];
  return [1, Infinity];
}

const vacio = (s) => typeof s !== 'string' || s.trim() === '';
const sinEtiquetas = (html) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const contarPalabras = (html) => sinEtiquetas(html).split(/\s+/).filter((p) => /[\p{L}\p{N}]/u.test(p)).length;
const normalizar = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();

function revisarBanco(id, banco) {
  const p = [];
  const err = (msg) => p.push(`${id}: ${msg}`);
  const R = reglasDe(id, banco);
  const CASOS_POR_BANCO = R.casos;
  const PREGUNTAS_POR_CASO = R.preguntasPorCaso;
  const OPCIONES = R.opciones;
  const PALABRAS_HISTORIA = R.palabrasHistoria;

  if (tipoDelBanco(id) === 'final') {
    if (!banco.REGLAS) err('el banco del examen final debe exportar REGLAS (8 casos × 5 preguntas, 50 minutos)');
    for (const [k, v] of Object.entries(DEL_FINAL)) if (R[k] !== v) err(`REGLAS.${k} es ${R[k]}; el examen final pide ${v}`);
  }
  if (!R.temas.length) err('no declara TEMAS');
  if (JSON.stringify(banco.TEMAS) !== JSON.stringify(R.temas)) err(`TEMAS debe ser ${JSON.stringify(R.temas)}`);
  if (banco.MINUTOS !== R.minutos) err(`MINUTOS debe ser ${R.minutos}`);
  if (vacio(banco.CASO)) err('falta CASO (instrucciones antes de empezar)');
  if (typeof banco.publica !== 'function') err('falta la función publica()');
  if (typeof banco.calificar !== 'function') err('falta la función calificar()');

  const casos = Array.isArray(banco.CASOS) ? banco.CASOS : [];
  const preguntas = Array.isArray(banco.PREGUNTAS) ? banco.PREGUNTAS : [];
  if (casos.length !== CASOS_POR_BANCO) err(`tiene ${casos.length} casos; deben ser ${CASOS_POR_BANCO}`);
  if (preguntas.length !== CASOS_POR_BANCO * PREGUNTAS_POR_CASO) {
    err(`tiene ${preguntas.length} preguntas; deben ser ${CASOS_POR_BANCO * PREGUNTAS_POR_CASO}`);
  }

  // Casos
  const idsCaso = new Set();
  for (const c of casos) {
    if (vacio(c.id)) { err('un caso no tiene id'); continue; }
    if (idsCaso.has(c.id)) err(`caso ${c.id} repetido`);
    idsCaso.add(c.id);
    for (const campo of ['empresa', 'titulo', 'historia']) if (vacio(c[campo])) err(`caso ${c.id}: falta ${campo}`);
    if (!vacio(c.historia)) {
      const n = contarPalabras(c.historia);
      if (n < PALABRAS_HISTORIA.min || n > PALABRAS_HISTORIA.max) {
        err(`caso ${c.id}: la historia tiene ${n} palabras (deben ser ${PALABRAS_HISTORIA.min}–${PALABRAS_HISTORIA.max})`);
      }
    }
  }

  // Preguntas
  const idsPregunta = new Set();
  const porCaso = new Map();
  const porTema = Object.fromEntries(R.temas.map((t) => [t, 0]));
  const porLetra = Array(OPCIONES).fill(0);
  let correctaMasLarga = 0;

  for (const q of preguntas) {
    const nombre = q.id || '(sin id)';
    if (vacio(q.id)) err('una pregunta no tiene id');
    else if (idsPregunta.has(q.id)) err(`pregunta ${q.id} repetida`);
    idsPregunta.add(q.id);

    if (!idsCaso.has(q.caso)) err(`${nombre}: el caso «${q.caso}» no existe`);
    else {
      porCaso.set(q.caso, [...(porCaso.get(q.caso) || []), q]);
      if (q.id && !q.id.startsWith(q.caso)) err(`${nombre}: su id no empieza con su caso (${q.caso})`);
    }

    if (!R.temas.includes(q.tema)) err(`${nombre}: el tema «${q.tema}» no está en TEMAS`);
    else {
      porTema[q.tema] += 1;
      if (R.sesionDeTema && q.sesion !== R.sesionDeTema[q.tema]) err(`${nombre}: el tema «${q.tema}» es de la sesión ${R.sesionDeTema[q.tema]}, no ${q.sesion}`);
    }
    if (!R.sesionDeTema && !(Number.isInteger(q.sesion) && q.sesion >= R.sesiones[0] && q.sesion <= R.sesiones[1])) {
      err(`${nombre}: «sesion» debe ser un entero de ${R.sesiones[0]} a ${R.sesiones[1]} (0 = fuera de la Ruta), no ${q.sesion}`);
    }
    if (vacio(q.concepto)) err(`${nombre}: falta concepto`);
    if (vacio(q.texto)) err(`${nombre}: falta texto`);

    const opciones = Array.isArray(q.opciones) ? q.opciones : [];
    if (opciones.length !== OPCIONES) err(`${nombre}: tiene ${opciones.length} opciones; deben ser ${OPCIONES}`);
    opciones.forEach((o, i) => {
      if (vacio(o?.texto)) err(`${nombre}: la opción ${LETRAS[i]} no tiene texto`);
      if (vacio(o?.retro)) err(`${nombre}: la opción ${LETRAS[i]} no tiene retroalimentación`);
    });
    const textos = opciones.map((o) => normalizar(o?.texto || ''));
    if (new Set(textos).size !== textos.length) err(`${nombre}: tiene opciones repetidas`);

    if (!Number.isInteger(q.correcta) || q.correcta < 0 || q.correcta >= opciones.length) {
      err(`${nombre}: correcta (${q.correcta}) fuera de rango`);
    } else {
      porLetra[q.correcta] += 1;
      const largos = opciones.map((o) => (o?.texto || '').length);
      const largo = largos[q.correcta];
      if (largos.every((l, i) => i === q.correcta || l < largo)) correctaMasLarga += 1;
    }
  }

  // Cinco por caso, y cada caso mezcla temas.
  for (const c of casos) {
    const suyas = porCaso.get(c.id) || [];
    if (suyas.length !== PREGUNTAS_POR_CASO) err(`caso ${c.id}: tiene ${suyas.length} preguntas; deben ser ${PREGUNTAS_POR_CASO}`);
    if (new Set(suyas.map((q) => q.tema)).size < 2) err(`caso ${c.id}: todas sus preguntas son del mismo tema`);
  }

  // Reparto por tema.
  for (const t of R.temas) {
    const [min, max] = rangoTema(R.porTema, t);
    if (porTema[t] < min || porTema[t] > max) {
      err(`el tema «${t}» tiene ${porTema[t]} preguntas (deben ser ${min}${max === Infinity ? ' o más' : `–${max}`})`);
    }
  }

  // Clave balanceada y sin tres seguidas.
  porLetra.forEach((n, i) => {
    if (n < R.porLetra.min || n > R.porLetra.max) err(`la clave tiene ${n} respuestas en ${LETRAS[i]} (deben ser ${R.porLetra.min}–${R.porLetra.max})`);
  });
  for (let i = 2; i < preguntas.length; i += 1) {
    const [a, b, c] = [preguntas[i - 2], preguntas[i - 1], preguntas[i]].map((q) => q.correcta);
    if (a === b && b === c) err(`tres respuestas seguidas en ${LETRAS[c]}: ${preguntas[i - 2].id}, ${preguntas[i - 1].id} y ${preguntas[i].id}`);
  }
  if (correctaMasLarga > R.maxCorrectaMasLarga) {
    err(`en ${correctaMasLarga} preguntas la correcta es la opción más larga (máximo ${R.maxCorrectaMasLarga})`);
  }

  // publica() no debe filtrar la respuesta ni la retroalimentación.
  if (typeof banco.publica === 'function') {
    const pub = banco.publica();
    const json = JSON.stringify(pub);
    if (/"(correcta|retro)"/.test(json)) err('publica() deja ver correcta o retro');
    if (pub?.caso !== banco.CASO) err('publica().caso no es CASO');
    if (pub?.casos?.length !== casos.length) err('publica().casos no trae todos los casos');
    if (pub?.preguntas?.length !== preguntas.length) err('publica().preguntas no trae todas las preguntas');
    for (const q of pub?.preguntas || []) {
      for (const campo of ['id', 'caso', 'tema', 'texto']) if (vacio(q[campo])) err(`publica(): ${q.id || '?'} sin ${campo}`);
      if (!Array.isArray(q.opciones) || q.opciones.length !== OPCIONES || q.opciones.some((o) => typeof o !== 'string')) {
        err(`publica(): ${q.id || '?'} debe traer ${OPCIONES} opciones como texto`);
      }
    }
  }

  // calificar(): todo bien da el total, nada da 0, basura cuenta como error.
  if (typeof banco.calificar === 'function' && preguntas.length) {
    const todas = Object.fromEntries(preguntas.map((q) => [q.id, q.correcta]));
    const perfecto = banco.calificar(todas);
    if (perfecto.aciertos !== preguntas.length || perfecto.total !== preguntas.length) err('calificar() con la clave no da el total');
    const nada = banco.calificar({});
    if (nada.aciertos !== 0 || nada.detalle.some((d) => d.elegida !== null || d.correcta !== false)) err('calificar({}) debe dar 0 y elegida null');
    const basura = banco.calificar(Object.fromEntries(preguntas.map((q) => [q.id, '1'])));
    if (basura.aciertos !== 0) err('calificar() acepta índices que no son números enteros');
    const d = perfecto.detalle?.[0] || {};
    for (const campo of ['id', 'caso', 'tema', 'elegida', 'correcta']) if (!(campo in d)) err(`calificar(): el detalle no trae ${campo}`);
  }

  return p;
}

/** Revisa todos los bancos de TEORIA. Devuelve la lista de problemas (vacía si todo bien). */
export function verificarTeoria() {
  const problemas = [];
  if (TEORIA.size === 0) return ['TEORIA no tiene bancos registrados'];

  const textosVistos = new Map(); // texto normalizado → "banco/idPregunta"
  const empresasVistas = new Map();
  for (const [id, banco] of TEORIA) {
    problemas.push(...revisarBanco(id, banco));
    for (const q of banco.PREGUNTAS || []) {
      if (vacio(q.texto)) continue;
      const clave = normalizar(q.texto);
      const otro = textosVistos.get(clave);
      if (otro) problemas.push(`${id}/${q.id}: el texto se repite en ${otro}`);
      else textosVistos.set(clave, `${id}/${q.id}`);
    }
    for (const c of banco.CASOS || []) {
      if (vacio(c.empresa)) continue;
      const clave = normalizar(c.empresa);
      const otro = empresasVistas.get(clave);
      if (otro && otro !== id) problemas.push(`${id}/${c.id}: la empresa «${c.empresa}» ya aparece en ${otro}`);
      else empresasVistas.set(clave, id);
    }
  }
  return problemas;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problemas = verificarTeoria();
  if (problemas.length) {
    console.error(`✗ Bancos teóricos: ${problemas.length} problema(s)`);
    for (const p of problemas) console.error(`  - ${p}`);
    process.exit(1);
  }
  const resumen = [...TEORIA].map(([id, b]) => `${id} (${b.CASOS.length} casos, ${b.PREGUNTAS.length} preguntas)`).join(', ');
  console.log(`✓ Bancos teóricos en orden: ${resumen}`);
}
