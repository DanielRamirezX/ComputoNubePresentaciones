// Audita la ruta antes de darla: npm run verificar
//
// Por cada sesión:
//  - Examen de práctica: las tres formas más comunes de acertar sin saber (una
//    letra que domina la clave, rachas de la misma letra y la correcta siempre
//    como la opción más larga) y que cada pregunta esté completa.
//  - Curso: que cada ejercicio tenga solución, que los minutos de cada capítulo
//    quepan en su bloque del plan de la clase y que el plan dure 120 minutos.
// En toda la ruta: ids de actividad únicos, un examen por sesión, que ninguna
// pregunta se repita entre exámenes y que cada captura de la consola exista en
// public/capturas.
//
// Los bancos del simulacro y de las prácticas (sesiones 8 a 13) pueden traer
// respuesta múltiple (se revisan aparte del balance de letras), `sesion` en
// cada pregunta, OBJETIVO (preguntas por tema), MINUTOS y ESCALA.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RUTA, SESIONES } from '../public/contenido.js';
import { TAMANOS } from '../public/piezas.js';
import { BANCOS } from './practicas.js';

const PUBLICO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const LETRAS = ['A', 'B', 'C', 'D'];
const MAX_SESION = Math.max(...RUTA.map((r) => r.numero));
const ID_LAB = /^[a-z0-9-]{1,40}$/;
let problemas = 0;
const falla = (m) => {
  console.log('  ✗ ' + m);
  problemas++;
};
// Los laboratorios del simulador que pide la Ruta (para revisarlos al final).
const labsSimulador = [];

/* ------------------------------------------------------ examen de práctica */

function revisarBanco({ PREGUNTAS, REPASO, TEMAS, MINUTOS, ESCALA, OBJETIVO }, idsVistos) {
  // Las de una sola respuesta (4 opciones) llevan el balance de letras; las de
  // respuesta múltiple («Elige DOS», 5 opciones) se revisan aparte.
  const unicas = PREGUNTAS.filter((p) => !Array.isArray(p.correcta));
  const multiples = PREGUNTAS.filter((p) => Array.isArray(p.correcta));
  const clave = unicas.map((p) => LETRAS[p.correcta]);
  console.log('Clave:', clave.join(' '));

  const esperado = unicas.length / LETRAS.length;
  console.log('Reparto: ' + LETRAS.map((l) => `${l} ${clave.filter((c) => c === l).length}`).join(' · '));
  for (const l of LETRAS) {
    const n = clave.filter((c) => c === l).length;
    if (Math.abs(n - esperado) > 1) falla(`la letra ${l} aparece ${n} veces; se esperaban ~${esperado}`);
  }

  let racha = 1;
  for (let i = 1; i < clave.length; i++) {
    racha = clave[i] === clave[i - 1] ? racha + 1 : 1;
    if (racha >= 3) falla(`racha de ${racha} ${clave[i]} seguidas que termina en la pregunta ${unicas[i].id}`);
  }

  const masLarga = unicas.filter((p) => {
    const largos = p.opciones.map((o) => o.length);
    return largos[p.correcta] === Math.max(...largos);
  }).length;
  console.log(`La correcta es (o empata como) la opción más larga en ${masLarga} de ${unicas.length}`);
  if (masLarga > unicas.length * 0.45) falla('la correcta tiende a ser la opción más larga');

  for (const p of unicas) {
    if (p.opciones.length !== 4) falla(`${p.id} no tiene 4 opciones`);
    if (!Number.isInteger(p.correcta) || !p.opciones[p.correcta]) falla(`${p.id} apunta a una opción inexistente`);
    if (p.elige !== undefined) falla(`${p.id} tiene una sola correcta pero dice elige: ${p.elige}`);
  }
  if (multiples.length) {
    console.log(`Respuesta múltiple: ${multiples.length} (${multiples.map((p) => `${p.id} → ${p.correcta.map((i) => 'ABCDE'[i]).join('')}`).join(', ')})`);
  }
  for (const p of multiples) {
    if (p.opciones.length !== 5) falla(`${p.id} es de respuesta múltiple y necesita 5 opciones`);
    if (!Number.isInteger(p.elige) || p.elige < 2) falla(`${p.id} es de respuesta múltiple: elige debe ser 2 o más`);
    if (p.correcta.length !== p.elige) falla(`${p.id} pide elegir ${p.elige} pero tiene ${p.correcta.length} correctas`);
    if (new Set(p.correcta).size !== p.correcta.length || !p.correcta.every((i) => Number.isInteger(i) && p.opciones[i])) {
      falla(`${p.id} apunta a opciones inexistentes o repetidas`);
    }
    const cuantas = { 2: 'DOS', 3: 'TRES' }[p.elige];
    if (cuantas && !p.texto.includes(cuantas)) falla(`${p.id} no le dice al alumno cuántas elegir («Elige ${cuantas}.»)`);
  }

  for (const p of PREGUNTAS) {
    if (new Set(p.opciones).size !== p.opciones.length) falla(`${p.id} tiene opciones repetidas`);
    if (!TEMAS.includes(p.tema)) falla(`${p.id} usa un tema que no está en TEMAS`);
    if (!p.explicacion) falla(`${p.id} no tiene explicación para el repaso`);
    if (!p.concepto) falla(`${p.id} no tiene concepto para el reporte del alumno`);
    if (p.sesion !== undefined && !(Number.isInteger(p.sesion) && p.sesion >= 0 && p.sesion <= MAX_SESION)) {
      falla(`${p.id}: sesion debe ser un número de 0 a ${MAX_SESION} (0 = fuera de la Ruta)`);
    }
  }
  const ids = PREGUNTAS.map((p) => p.id);
  if (new Set(ids).size !== ids.length) falla('hay ids de pregunta repetidos');

  // «Por sesión de la Ruta» necesita la sesión en todas o en ninguna.
  const conSesion = PREGUNTAS.filter((p) => p.sesion !== undefined).length;
  if (conSesion && conSesion !== PREGUNTAS.length) falla(`solo ${conSesion} de ${PREGUNTAS.length} preguntas dicen su sesion: van todas o ninguna`);
  if (conSesion) {
    const porSesion = new Map();
    for (const p of PREGUNTAS) porSesion.set(p.sesion, (porSesion.get(p.sesion) ?? 0) + 1);
    console.log('Preguntas por sesión de la Ruta: ' + [...porSesion].sort((a, b) => a[0] - b[0]).map(([s, n]) => `S${s} ${n}`).join(' · '));
  }

  console.log('Preguntas por tema: ' + TEMAS.map((t) => `${PREGUNTAS.filter((p) => p.tema === t).length} ${t}`).join(' · '));
  for (const t of TEMAS) if (!REPASO[t]?.length) falla(`el tema "${t}" no dice qué repasar`);
  if (OBJETIVO) {
    for (const [t, n] of Object.entries(OBJETIVO)) {
      if (!TEMAS.includes(t)) falla(`OBJETIVO habla del tema "${t}", que no está en TEMAS`);
      const hay = PREGUNTAS.filter((p) => p.tema === t).length;
      if (hay !== n) falla(`el tema "${t}" tiene ${hay} preguntas y OBJETIVO pide ${n}`);
    }
    const suma = Object.values(OBJETIVO).reduce((a, b) => a + b, 0);
    if (suma !== PREGUNTAS.length) falla(`OBJETIVO suma ${suma} preguntas y el banco tiene ${PREGUNTAS.length}`);
  }
  if (MINUTOS !== undefined && !(Number.isInteger(MINUTOS) && MINUTOS > 0 && MINUTOS <= 180)) falla(`MINUTOS debe ser un entero de 1 a 180`);
  if (ESCALA !== undefined && !(ESCALA.maximo > 0 && ESCALA.aprueba > 0 && ESCALA.aprueba < ESCALA.maximo)) {
    falla('ESCALA necesita { maximo, aprueba } con aprueba menor que maximo');
  }
  if (MINUTOS || ESCALA) console.log(`Reloj: ${MINUTOS ? `${MINUTOS} min` : 'no'} · escala: ${ESCALA ? `${ESCALA.aprueba} de ${ESCALA.maximo}` : 'no'}`);
  // Un examen acumulativo puede mandar a repasar sesiones anteriores, o un
  // material de fuera de la ruta (texto libre, que no parece id de actividad).
  for (const id of Object.values(REPASO).flat()) {
    if (/^s\d+-/.test(id) && !idsVistos.includes(id)) falla(`REPASO apunta a una actividad que no es de esta sesión ni de las anteriores: ${id}`);
  }
}

/* ------------------------------------------------------------------ curso */

function revisarActividad(a) {
  if (!/^[a-z0-9-]{1,40}$/.test(a.id)) falla(`${a.id}: el id solo puede llevar minúsculas, números y guiones`);
  if (!(a.xp > 0) || !(a.minutos > 0)) falla(`${a.id}: le faltan xp o minutos`);

  if (a.tipo === 'leccion') {
    if (!a.laminas?.length) falla(`${a.id}: lección sin láminas`);
    for (const l of a.laminas ?? []) if (!l.titulo || !l.html) falla(`${a.id}: lámina sin título o sin contenido`);
  } else if (a.tipo === 'opcion') {
    const correctas = a.opciones.filter((o) => o.correcta).length;
    if (correctas !== 1) falla(`${a.id}: tiene ${correctas} respuestas correctas`);
    if (a.opciones.some((o) => !o.retro)) falla(`${a.id}: hay una opción sin retroalimentación`);
    if (!a.pista || !a.pregunta) falla(`${a.id}: le falta pregunta o pista`);
  } else if (a.tipo === 'laboratorio') {
    if (!a.pasos?.length) falla(`${a.id}: laboratorio sin pasos`);
    if (!a.objetivo || !a.necesitas?.length) falla(`${a.id}: le falta objetivo o lista de lo que se necesita`);
    for (const [n, paso] of (a.pasos ?? []).entries()) {
      if (!paso.titulo || !paso.html || !paso.ver) falla(`${a.id}: el paso ${n + 1} no tiene título, instrucciones o “deberías ver”`);
      if (typeof paso.sandbox !== 'boolean') falla(`${a.id}: el paso ${n + 1} no dice si necesita el sandbox`);
    }
    if (a.pasos?.at(-1)?.sandbox) falla(`${a.id}: el último paso debería ser apagar el sandbox`);
    // Evidencias: cada una con su id, qué es y qué debe verse; el último paso
    // arma el PDF, así que ahí no se pide captura.
    const idsEvidencia = new Set();
    for (const [n, paso] of (a.pasos ?? []).entries()) {
      if (!paso.evidencia) continue;
      const { id, titulo, pide } = paso.evidencia;
      if (!id || !titulo || !pide) falla(`${a.id}: la evidencia del paso ${n + 1} necesita id, titulo y pide`);
      if (idsEvidencia.has(id)) falla(`${a.id}: la evidencia "${id}" se repite`);
      idsEvidencia.add(id);
    }
    if (a.pasos?.at(-1)?.evidencia) falla(`${a.id}: el último paso arma el PDF, no puede pedir captura`);
    console.log(`  ${a.id}: ${a.pasos.length} pasos, ${idsEvidencia.size} evidencias para el PDF (${[...idsEvidencia].join(', ')})`);
    // La versión de simulador del mismo laboratorio (el alumno elige dónde hacerlo).
    if (a.simulador !== undefined) {
      const { lab, minutos, nota, tareas, objetivo } = a.simulador ?? {};
      if (!ID_LAB.test(lab ?? '')) falla(`${a.id}: simulador.lab debe ser el id del laboratorio en evaluacion-aws (por ejemplo, lab-s6)`);
      if (!(minutos > 0)) falla(`${a.id}: simulador.minutos debe ser mayor que 0`);
      if (nota !== undefined && typeof nota !== 'string') falla(`${a.id}: simulador.nota debe ser texto`);
      // El objetivo de arriba cambia con la elección: el de DataCamp no sirve en el simulador.
      if (typeof objetivo !== 'string' || !objetivo) falla(`${a.id}: simulador.objetivo debe decir qué se logra en el simulador`);
      if (tareas !== undefined && !(Array.isArray(tareas) && tareas.length && tareas.every((t) => typeof t === 'string' && t))) {
        falla(`${a.id}: simulador.tareas debe ser una lista de textos`);
      }
      labsSimulador.push({ actividad: a.id, lab });
      console.log(`  ${a.id}: también en el simulador → ${lab} (≈ ${minutos} min)`);
    }
  } else if (a.tipo === 'simulador') {
    // Una práctica que se hace solo en el simulador (sesiones 9 a 13).
    if (!ID_LAB.test(a.lab ?? '')) falla(`${a.id}: lab debe ser el id de la práctica en evaluacion-aws (por ejemplo, practica-1)`);
    if (!a.objetivo || !a.caso) falla(`${a.id}: le falta objetivo o caso`);
    if (!a.tareas?.length || a.tareas.some((t) => typeof t !== 'string' || !t)) falla(`${a.id}: necesita la lista de tareas`);
    if (!a.necesitas?.length) falla(`${a.id}: le falta la lista de lo que se necesita`);
    labsSimulador.push({ actividad: a.id, lab: a.lab });
    console.log(`  ${a.id}: práctica en el simulador → ${a.lab}, ${a.tareas?.length ?? 0} tareas`);
  } else if (a.tipo === 'clasificar') {
    const grupos = new Set(a.grupos.map((g) => g.id));
    for (const f of a.fichas) {
      if (!grupos.has(f.grupo)) falla(`${a.id}: la ficha "${f.texto}" va a un grupo que no existe`);
      if (!f.retro) falla(`${a.id}: la ficha "${f.texto}" no tiene retroalimentación`);
    }
    for (const g of a.grupos) {
      if (!a.fichas.some((f) => f.grupo === g.id)) falla(`${a.id}: el grupo ${g.nombre} se queda vacío`);
    }
    if (!a.cierre || !a.pista || !a.pregunta) falla(`${a.id}: le falta cierre, pista o pregunta`);
  } else {
    falla(`${a.id}: tipo desconocido "${a.tipo}"`);
  }
}

function revisarSesion(sesion) {
  const actividades = sesion.capitulos.flatMap((c) => c.actividades);
  for (const k of ['titulo', 'subtitulo', 'resumen', 'duracion', 'practica', 'plan']) {
    if (!sesion[k]) falla(`la sesión ${sesion.numero} no tiene ${k}`);
  }
  for (const a of actividades) {
    revisarActividad(a);
    if (!a.id.startsWith(`s${sesion.numero}-`)) falla(`${a.id}: los ids de la sesión ${sesion.numero} empiezan con s${sesion.numero}-`);
  }

  const posiciones = actividades.filter((a) => a.tipo === 'opcion').map((a) => LETRAS[a.opciones.findIndex((o) => o.correcta)]);
  console.log('Correcta en los ejercicios de opción múltiple: ' + posiciones.join(' '));
  for (const l of LETRAS) {
    if (posiciones.filter((x) => x === l).length > Math.ceil(posiciones.length / 2)) falla(`demasiadas correctas en ${l}`);
  }

  console.log('Minutos por capítulo contra el plan');
  for (const c of sesion.capitulos) {
    const minutos = c.actividades.reduce((s, a) => s + a.minutos, 0);
    const bloque = sesion.plan.find((b) => b.capitulo === c.numero);
    const disponible = bloque ? bloque.hasta - bloque.desde : 0;
    const xp = c.actividades.reduce((s, a) => s + a.xp, 0);
    console.log(`  Capítulo ${c.numero}: ${minutos} min de ${disponible} · ${c.actividades.length} actividades · ${xp} XP`);
    if (!bloque) falla(`el capítulo ${c.numero} no tiene bloque en el plan`);
    else if (minutos > disponible) falla(`el capítulo ${c.numero} no cabe en su bloque (${minutos} > ${disponible} min)`);
  }
  const duracion = sesion.plan.at(-1).hasta;
  console.log(`  Clase completa: ${duracion} min`);
  if (duracion !== 120) falla(`el plan dura ${duracion} min, no 120`);
  for (let i = 1; i < sesion.plan.length; i++) {
    if (sesion.plan[i].desde !== sesion.plan[i - 1].hasta) falla(`hay un hueco o un traslape antes de "${sesion.plan[i].titulo}"`);
  }
  return actividades.map((a) => a.id);
}

/* ------------------------------------------------------------------ la ruta */

const todos = [];
for (const sesion of SESIONES) {
  console.log(`\n=========== SESIÓN ${sesion.numero} · ${sesion.titulo.toUpperCase()}`);
  const ids = revisarSesion(sesion);
  todos.push(...ids);
  const banco = BANCOS.get(sesion.numero);
  console.log('\nExamen de práctica');
  if (!banco) falla(`la sesión ${sesion.numero} no tiene banco de preguntas en src/practicas.js`);
  else revisarBanco(banco, todos);
}

console.log('\n=========== TODA LA RUTA');
const repetidos = todos.filter((id, i) => todos.indexOf(id) !== i);
if (repetidos.length) falla(`ids de actividad repetidos entre sesiones: ${[...new Set(repetidos)].join(', ')}`);
for (const n of BANCOS.keys()) if (!SESIONES.some((s) => s.numero === n)) falla(`hay banco de preguntas para la sesión ${n}, que no existe`);

// La misma pregunta en dos exámenes: el alumno la reconoce y el examen mide
// memoria, no comprensión. Se compara el texto sin acentos, mayúsculas ni signos.
const normal = (t) =>
  String(t)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
const textos = new Map();
for (const [n, { PREGUNTAS }] of BANCOS) {
  for (const p of PREGUNTAS) {
    const k = normal(p.texto);
    const previa = textos.get(k);
    if (previa) falla(`la pregunta ${p.id} de la sesión ${n} repite el texto de ${previa.id} de la sesión ${previa.n}`);
    else textos.set(k, { n, id: p.id });
  }
}
console.log(`${textos.size} preguntas distintas en ${BANCOS.size} exámenes`);

// Los laboratorios del simulador viven en otro módulo (evaluacion-aws): si
// todavía no están registrados, solo se avisa; la Ruta los muestra «en preparación».
if (labsSimulador.length) {
  let registrados = null;
  try {
    const { EVALUACIONES } = await import('../../evaluacion-aws/src/evaluaciones.js');
    registrados = new Set(EVALUACIONES.flatMap((ev) => [ev.id, ev.lab]));
  } catch {
    console.log('  (No encontré evaluacion-aws/src/evaluaciones.js: no reviso los laboratorios del simulador.)');
  }
  for (const { actividad, lab } of labsSimulador) {
    if (registrados && !registrados.has(lab)) console.log(`  ! ${actividad}: ${lab} todavía no está en EVALUACIONES de evaluacion-aws`);
  }
}

const capturas = Object.keys(TAMANOS);
for (const ruta of capturas) {
  if (!fs.existsSync(path.join(PUBLICO, 'capturas', `${ruta}.webp`))) falla(`falta la imagen capturas/${ruta}.webp`);
}
console.log(`${SESIONES.length} sesiones · ${todos.length} actividades · ${capturas.length} capturas de la consola`);

console.log(problemas === 0 ? '\nTodo en orden.' : `\n${problemas} problema(s) por revisar.`);
process.exit(problemas === 0 ? 0 : 1);
