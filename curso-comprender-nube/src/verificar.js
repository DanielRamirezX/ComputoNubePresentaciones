// Audita el curso antes de darlo: npm run verificar
//
// Práctica final: las tres formas más comunes de acertar sin saber (una letra
// que domina la clave, rachas de la misma letra y la correcta siempre como la
// opción más larga) y que cada pregunta esté completa.
// Curso: que cada ejercicio tenga solución, que los ids no choquen y que los
// minutos de cada capítulo quepan en su bloque del plan de la clase.

import { CURSO, PLAN } from '../public/contenido.js';
import { PREGUNTAS, TEMAS } from './practica.js';

const LETRAS = ['A', 'B', 'C', 'D'];
let problemas = 0;
const falla = (m) => {
  console.log('  ✗ ' + m);
  problemas++;
};

/* ------------------------------------------------------ práctica final */

console.log('PRÁCTICA FINAL');
const clave = PREGUNTAS.map((p) => LETRAS[p.correcta]);
console.log('Clave:', clave.join(' '), '\n');

console.log('Reparto de la clave');
const esperado = PREGUNTAS.length / LETRAS.length;
for (const l of LETRAS) {
  const n = clave.filter((c) => c === l).length;
  console.log(`  ${l}: ${n}`);
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
console.log(`\nLa correcta es (o empata como) la opción más larga en ${masLarga} de ${PREGUNTAS.length}`);
if (masLarga > PREGUNTAS.length * 0.45) falla('la correcta tiende a ser la opción más larga');

for (const p of PREGUNTAS) {
  if (p.opciones.length !== 4) falla(`${p.id} no tiene 4 opciones`);
  if (!Number.isInteger(p.correcta) || !p.opciones[p.correcta]) falla(`${p.id} apunta a una opción inexistente`);
  if (new Set(p.opciones).size !== p.opciones.length) falla(`${p.id} tiene opciones repetidas`);
  if (!TEMAS.includes(p.tema)) falla(`${p.id} usa un tema que no está en TEMAS`);
  if (!p.explicacion) falla(`${p.id} no tiene explicación para el repaso`);
}
const ids = PREGUNTAS.map((p) => p.id);
if (new Set(ids).size !== ids.length) falla('hay ids de pregunta repetidos');

console.log('\nPreguntas por tema');
for (const t of TEMAS) console.log(`  ${PREGUNTAS.filter((p) => p.tema === t).length}  ${t}`);

/* --------------------------------------------------------------- curso */

console.log('\nCURSO');
const actividades = CURSO.capitulos.flatMap((c) => c.actividades);
const idsCurso = actividades.map((a) => a.id);
if (new Set(idsCurso).size !== idsCurso.length) falla('hay ids de actividad repetidos');

for (const a of actividades) {
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

console.log('Posición de la correcta en los ejercicios de opción múltiple');
const posiciones = actividades
  .filter((a) => a.tipo === 'opcion')
  .map((a) => LETRAS[a.opciones.findIndex((o) => o.correcta)]);
console.log('  ' + posiciones.join(' '));
for (const l of LETRAS) {
  if (posiciones.filter((x) => x === l).length > Math.ceil(posiciones.length / 2)) falla(`demasiadas correctas en ${l}`);
}

console.log('\nMinutos por capítulo contra el plan');
for (const c of CURSO.capitulos) {
  const minutos = c.actividades.reduce((s, a) => s + a.minutos, 0);
  const bloque = PLAN.find((b) => b.capitulo === c.numero);
  const disponible = bloque ? bloque.hasta - bloque.desde : 0;
  const xp = c.actividades.reduce((s, a) => s + a.xp, 0);
  console.log(`  Capítulo ${c.numero}: ${minutos} min de ${disponible} · ${c.actividades.length} actividades · ${xp} XP`);
  if (!bloque) falla(`el capítulo ${c.numero} no tiene bloque en el plan`);
  else if (minutos > disponible) falla(`el capítulo ${c.numero} no cabe en su bloque (${minutos} > ${disponible} min)`);
}
const duracion = PLAN.at(-1).hasta;
console.log(`  Clase completa: ${duracion} min`);
if (duracion !== 120) falla(`el plan dura ${duracion} min, no 120`);
for (let i = 1; i < PLAN.length; i++) {
  if (PLAN[i].desde !== PLAN[i - 1].hasta) falla(`hay un hueco o un traslape antes de "${PLAN[i].titulo}"`);
}

console.log(problemas === 0 ? '\nTodo en orden.' : `\n${problemas} problema(s) por revisar.`);
process.exit(problemas === 0 ? 0 : 1);
