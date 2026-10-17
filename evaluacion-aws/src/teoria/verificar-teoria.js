// Revisa que los bancos teóricos de los simulacros cumplan el contrato 4 de
// DISENO.md: 5 casos y 25 preguntas (5 por caso), 4 opciones con texto y
// retroalimentación, clave balanceada sin rachas de tres, reparto parejo por
// tema y ninguna pregunta repetida entre simulacros.
//
//   node src/teoria/verificar-teoria.js      → imprime el resultado; sale con 1 si hay problemas
//   import { verificarTeoria } from './teoria/verificar-teoria.js'   → lista de problemas ([] si todo bien)

import { pathToFileURL } from 'node:url';
import { TEORIA } from './index.js';

const TEMAS = ['Fundamentos y EC2', 'Identidad y seguridad', 'Redes', 'Almacenamiento'];
const SESION_DE_TEMA = { 'Fundamentos y EC2': 1, 'Identidad y seguridad': 2, Redes: 3, Almacenamiento: 4 };
const CASOS_POR_BANCO = 5;
const PREGUNTAS_POR_CASO = 5;
const OPCIONES = 4;
const LETRAS = ['A', 'B', 'C', 'D'];
const POR_LETRA = { min: 6, max: 7 };
const POR_TEMA = { min: 6, max: 7 };
const PALABRAS_HISTORIA = { min: 80, max: 150 };
// La correcta no debe delatarse por ser la opción más larga.
const MAX_CORRECTA_MAS_LARGA = 8;

const vacio = (s) => typeof s !== 'string' || s.trim() === '';
const sinEtiquetas = (html) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const contarPalabras = (html) => sinEtiquetas(html).split(/\s+/).filter((p) => /[\p{L}\p{N}]/u.test(p)).length;
const normalizar = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();

function revisarBanco(id, banco) {
  const p = [];
  const err = (msg) => p.push(`${id}: ${msg}`);

  if (JSON.stringify(banco.TEMAS) !== JSON.stringify(TEMAS)) err(`TEMAS debe ser ${JSON.stringify(TEMAS)}`);
  if (banco.MINUTOS !== 45) err('MINUTOS debe ser 45');
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
  const porTema = Object.fromEntries(TEMAS.map((t) => [t, 0]));
  const porLetra = [0, 0, 0, 0];
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

    if (!TEMAS.includes(q.tema)) err(`${nombre}: el tema «${q.tema}» no está en TEMAS`);
    else {
      porTema[q.tema] += 1;
      if (q.sesion !== SESION_DE_TEMA[q.tema]) err(`${nombre}: el tema «${q.tema}» es de la sesión ${SESION_DE_TEMA[q.tema]}, no ${q.sesion}`);
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
  for (const t of TEMAS) {
    if (porTema[t] < POR_TEMA.min || porTema[t] > POR_TEMA.max) {
      err(`el tema «${t}» tiene ${porTema[t]} preguntas (deben ser ${POR_TEMA.min}–${POR_TEMA.max})`);
    }
  }

  // Clave balanceada y sin tres seguidas.
  porLetra.forEach((n, i) => {
    if (n < POR_LETRA.min || n > POR_LETRA.max) err(`la clave tiene ${n} respuestas en ${LETRAS[i]} (deben ser ${POR_LETRA.min}–${POR_LETRA.max})`);
  });
  for (let i = 2; i < preguntas.length; i += 1) {
    const [a, b, c] = [preguntas[i - 2], preguntas[i - 1], preguntas[i]].map((q) => q.correcta);
    if (a === b && b === c) err(`tres respuestas seguidas en ${LETRAS[c]}: ${preguntas[i - 2].id}, ${preguntas[i - 1].id} y ${preguntas[i].id}`);
  }
  if (correctaMasLarga > MAX_CORRECTA_MAS_LARGA) {
    err(`en ${correctaMasLarga} preguntas la correcta es la opción más larga (máximo ${MAX_CORRECTA_MAS_LARGA})`);
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

  // calificar(): todo bien da 25, nada da 0, basura cuenta como error.
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
