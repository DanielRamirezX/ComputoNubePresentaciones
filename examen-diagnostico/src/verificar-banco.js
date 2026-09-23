// Audita el banco antes de aplicar el examen: node src/verificar-banco.js
//
// Busca las tres formas más comunes de que un alumno acierte sin saber:
//  - una letra que domina la clave
//  - rachas largas de la misma letra
//  - la correcta siendo siempre la opción más larga

import { PREGUNTAS, TEMAS } from './preguntas.js';

const LETRAS = ['A', 'B', 'C', 'D'];
let problemas = 0;
const falla = (m) => {
  console.log('  ✗ ' + m);
  problemas++;
};

const clave = PREGUNTAS.map((p) => LETRAS[p.correcta]);
console.log('Clave:', clave.join(' '), '\n');

// 1. Reparto de letras
console.log('Reparto de la clave');
const esperado = PREGUNTAS.length / 4;
for (const l of LETRAS) {
  const n = clave.filter((c) => c === l).length;
  console.log(`  ${l}: ${n}`);
  if (Math.abs(n - esperado) > 1) falla(`la letra ${l} aparece ${n} veces, se esperaban ~${esperado}`);
}

// 2. Rachas
let racha = 1;
for (let i = 1; i < clave.length; i++) {
  racha = clave[i] === clave[i - 1] ? racha + 1 : 1;
  if (racha >= 3) falla(`racha de ${racha} ${clave[i]} seguidas que termina en la pregunta ${i + 1}`);
}

// 3. ¿La correcta es la más larga?
const masLarga = PREGUNTAS.filter((p) => {
  const largos = p.opciones.map((o) => o.length);
  return largos[p.correcta] === Math.max(...largos);
}).length;
console.log(`\nLa correcta es la opción más larga en ${masLarga} de ${PREGUNTAS.length}`);
if (masLarga > PREGUNTAS.length * 0.45) {
  falla('la correcta tiende a ser la opción más larga; acorta la correcta o alarga los distractores');
}

// 4. Integridad
for (const p of PREGUNTAS) {
  if (p.opciones.length !== 4) falla(`${p.id} no tiene 4 opciones`);
  if (!Number.isInteger(p.correcta) || !p.opciones[p.correcta]) falla(`${p.id} apunta a una opción inexistente`);
  if (new Set(p.opciones).size !== p.opciones.length) falla(`${p.id} tiene opciones repetidas`);
  if (!TEMAS.includes(p.tema)) falla(`${p.id} usa un tema que no está en TEMAS`);
}
const ids = PREGUNTAS.map((p) => p.id);
if (new Set(ids).size !== ids.length) falla('hay ids repetidos');

// 5. Reparto por tema
console.log('\nPreguntas por tema');
for (const t of TEMAS) console.log(`  ${PREGUNTAS.filter((p) => p.tema === t).length}  ${t}`);

console.log(problemas === 0 ? '\nBanco limpio.' : `\n${problemas} problema(s) por revisar.`);
process.exit(problemas === 0 ? 0 : 1);
