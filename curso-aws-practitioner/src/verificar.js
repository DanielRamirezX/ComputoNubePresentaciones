// Audita la ruta antes de darla: npm run verificar
//
// Por cada sesión:
//  - Examen de práctica: las tres formas más comunes de acertar sin saber (una
//    letra que domina la clave, rachas de la misma letra y la correcta siempre
//    como la opción más larga) y que cada pregunta esté completa.
//  - Curso: que cada ejercicio tenga solución, que los minutos de cada capítulo
//    quepan en su bloque del plan de la clase y que el plan dure 120 minutos.
// En toda la ruta: ids de actividad únicos, un examen por sesión y que cada
// captura de la consola exista en public/capturas.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SESIONES } from '../public/contenido.js';
import { TAMANOS } from '../public/piezas.js';
import { BANCOS } from './practicas.js';

const PUBLICO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const LETRAS = ['A', 'B', 'C', 'D'];
let problemas = 0;
const falla = (m) => {
  console.log('  ✗ ' + m);
  problemas++;
};

/* ------------------------------------------------------ examen de práctica */

function revisarBanco({ PREGUNTAS, REPASO, TEMAS }, idsVistos) {
  const clave = PREGUNTAS.map((p) => LETRAS[p.correcta]);
  console.log('Clave:', clave.join(' '));

  const esperado = PREGUNTAS.length / LETRAS.length;
  console.log('Reparto: ' + LETRAS.map((l) => `${l} ${clave.filter((c) => c === l).length}`).join(' · '));
  for (const l of LETRAS) {
    const n = clave.filter((c) => c === l).length;
    if (Math.abs(n - esperado) > 1) falla(`la letra ${l} aparece ${n} veces; se esperaban ~${esperado}`);
  }

  let racha = 1;
  for (let i = 1; i < clave.length; i++) {
    racha = clave[i] === clave[i - 1] ? racha + 1 : 1;
    if (racha >= 3) falla(`racha de ${racha} ${clave[i]} seguidas que termina en la pregunta ${i + 1}`);
  }

  const masLarga = PREGUNTAS.filter((p) => {
    const largos = p.opciones.map((o) => o.length);
    return largos[p.correcta] === Math.max(...largos);
  }).length;
  console.log(`La correcta es (o empata como) la opción más larga en ${masLarga} de ${PREGUNTAS.length}`);
  if (masLarga > PREGUNTAS.length * 0.45) falla('la correcta tiende a ser la opción más larga');

  for (const p of PREGUNTAS) {
    if (p.opciones.length !== 4) falla(`${p.id} no tiene 4 opciones`);
    if (!Number.isInteger(p.correcta) || !p.opciones[p.correcta]) falla(`${p.id} apunta a una opción inexistente`);
    if (new Set(p.opciones).size !== p.opciones.length) falla(`${p.id} tiene opciones repetidas`);
    if (!TEMAS.includes(p.tema)) falla(`${p.id} usa un tema que no está en TEMAS`);
    if (!p.explicacion) falla(`${p.id} no tiene explicación para el repaso`);
    if (!p.concepto) falla(`${p.id} no tiene concepto para el reporte del alumno`);
  }
  const ids = PREGUNTAS.map((p) => p.id);
  if (new Set(ids).size !== ids.length) falla('hay ids de pregunta repetidos');

  console.log('Preguntas por tema: ' + TEMAS.map((t) => `${PREGUNTAS.filter((p) => p.tema === t).length} ${t}`).join(' · '));
  for (const t of TEMAS) if (!REPASO[t]?.length) falla(`el tema "${t}" no dice qué repasar`);
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

const capturas = Object.keys(TAMANOS);
for (const ruta of capturas) {
  if (!fs.existsSync(path.join(PUBLICO, 'capturas', `${ruta}.webp`))) falla(`falta la imagen capturas/${ruta}.webp`);
}
console.log(`${SESIONES.length} sesiones · ${todos.length} actividades · ${capturas.length} capturas de la consola`);

console.log(problemas === 0 ? '\nTodo en orden.' : `\n${problemas} problema(s) por revisar.`);
process.exit(problemas === 0 ? 0 : 1);
