// Audita la evaluación antes de aplicarla: npm run verificar
//
//  - Parte teórica: corre verificarTeoria() de src/teoria/verificar-teoria.js
//    (clave balanceada, retro en cada opción…) y además revisa lo que el
//    servidor necesita de cada banco para no tronar: ids únicos, opciones con
//    texto y retro, `correcta` válida y cada pregunta en un caso que existe.
//  - Laboratorios: corre verificarLabs() de src/rubricas/verificar-labs.js (si
//    existe) y además, por cada rúbrica, con 3 alumnos de ejemplo, que la solución
//    dé 100, que la cuenta inicial dé menos de 25, que todo check traiga
//    retroalimentación (acierto y error) y que las tareas que ve el alumno
//    (LAB.tareas) sumen 100 y coincidan con las de la rúbrica. Las tareas
//    `bono: true` no cuentan en esos 100: la solución también gana sus puntos
//    y la calificación nunca pasa de 100.
//  - Repaso: cada pregunta y cada check dicen en qué lección de la Ruta AWS se
//    repasa (src/repaso.js), y el catálogo sigue igual que la Ruta.
// Si todavía no hay bancos o rúbricas, avisa y no falla: esa evaluación sale
// como «en preparación».

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { LABS } from '../public/labs/index.js';
import { calificarCuenta } from './calificar.js';
import { LECCIONES, resolverRepaso, repasosDe } from './repaso.js';
import { EVALUACIONES } from './evaluaciones.js';
import { RUBRICAS } from './rubricas/index.js';
import { TEORIA } from './teoria/index.js';
import { datosAlumno } from '../public/labs/comun.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const LIMITE_CUENTA = 512 * 1024; // el mismo tope que acepta app.js
const EJEMPLOS = [
  { nombre: 'Ana Sofía Pérez López', matricula: '20231234' },
  { nombre: 'Luis Ángel Ramírez Ortega', matricula: 'A01789456' },
  { nombre: 'María José Hernández Cruz', matricula: '' }
];

let problemas = 0;
let avisos = 0;
const falla = (m) => {
  console.log('  ✗ ' + m);
  problemas++;
};
const avisa = (m) => {
  console.log('  ! ' + m);
  avisos++;
};
const bien = (m) => console.log('  ✓ ' + m);

/* ------------------------------------------------------------- teórica */

/**
 * Corre un verificador escrito por otra parte del equipo (los bancos, los
 * laboratorios). Acepta lo que devuelva: una lista de problemas, un número de
 * problemas, true/false o { problemas }.
 */
async function verificadorExterno(relativo, funcion, quien) {
  const archivo = path.join(AQUI, relativo);
  if (!fs.existsSync(archivo)) return avisa(`todavía no existe src/${relativo.split(path.sep).join('/')} (lo escribe ${quien})`);
  try {
    const modulo = await import(pathToFileURL(archivo).href);
    if (typeof modulo[funcion] !== 'function') return falla(`src/${relativo} no exporta ${funcion}()`);
    const r = await modulo[funcion]();
    const lista = Array.isArray(r) ? r : Array.isArray(r?.problemas) ? r.problemas : null;
    if (lista) lista.forEach((p) => falla(`${funcion}: ${typeof p === 'string' ? p : JSON.stringify(p)}`));
    const n = lista ? lista.length : typeof r === 'number' ? r : r === false ? 1 : Number(r?.problemas ?? 0) || 0;
    if (!lista && n > 0) {
      problemas += n;
      console.log(`  ✗ ${funcion}() encontró ${n} problema(s)`);
    }
    if (n === 0) bien(`${funcion}() sin problemas`);
  } catch (e) {
    falla(`${funcion}() lanzó un error: ${e.message}`);
  }
}

function revisarBanco(id, banco) {
  const { PREGUNTAS, CASOS = [], TEMAS = [] } = banco;
  if (!Array.isArray(PREGUNTAS) || PREGUNTAS.length === 0) return falla(`${id}: el banco no tiene PREGUNTAS`);
  const casos = new Set(CASOS.map((c) => c.id));
  const ids = new Set();
  for (const p of PREGUNTAS) {
    if (ids.has(p.id)) falla(`${id}: la pregunta ${p.id} está repetida`);
    ids.add(p.id);
    if (!p.texto) falla(`${id}/${p.id}: no tiene texto`);
    if (!casos.has(p.caso)) falla(`${id}/${p.id}: su caso «${p.caso}» no está en CASOS`);
    if (TEMAS.length && !TEMAS.includes(p.tema)) falla(`${id}/${p.id}: su tema «${p.tema}» no está en TEMAS`);
    if (!Array.isArray(p.opciones) || p.opciones.length < 2) {
      falla(`${id}/${p.id}: necesita opciones`);
      continue;
    }
    if (!Number.isInteger(p.correcta) || !p.opciones[p.correcta]) falla(`${id}/${p.id}: «correcta» apunta a una opción que no existe`);
    p.opciones.forEach((o, i) => {
      if (!o?.texto) falla(`${id}/${p.id}: la opción ${i + 1} no tiene texto`);
      if (!o?.retro) falla(`${id}/${p.id}: la opción ${i + 1} no tiene retroalimentación`);
    });
    revisarRefs(`${id}/${p.id}`, p.repaso);
  }
  for (const c of CASOS) {
    if (!c.historia) falla(`${id}: el caso ${c.id} no tiene historia`);
    const n = PREGUNTAS.filter((p) => p.caso === c.id).length;
    if (n === 0) falla(`${id}: el caso ${c.id} se queda sin preguntas`);
  }
  if (typeof banco.calificar === 'function') {
    const todas = Object.fromEntries(PREGUNTAS.map((p) => [p.id, p.correcta]));
    const { aciertos, total } = banco.calificar(todas);
    if (aciertos !== total || total !== PREGUNTAS.length) falla(`${id}: calificar() con todas bien da ${aciertos}/${total}`);
    if (banco.calificar({}).aciertos !== 0) falla(`${id}: calificar() sin respuestas no da 0`);
  } else falla(`${id}: el banco no exporta calificar()`);
  console.log(`  ${id}: ${CASOS.length} casos · ${PREGUNTAS.length} preguntas · ${banco.MINUTOS ?? '¿?'} min`);
}

/* ------------------------------------------------------------ laboratorios */

// Lo que llega del navegador pasa por JSON: si algo no sobrevive, mejor saberlo aquí.
const porJson = (x) => JSON.parse(JSON.stringify(x));

/** Que una pregunta o un check diga dónde repasarlo, con referencias que existen. */
function revisarRefs(quien, refs) {
  const lista = Array.isArray(refs) ? refs : refs ? [refs] : [];
  if (!lista.length) return falla(`${quien}: no dice en qué lección se repasa (repaso)`);
  for (const r of lista) if (!resolverRepaso(r)) falla(`${quien}: el repaso «${r}» no existe en src/repaso.js`);
}

function revisarChecks(id, cuando, resultado) {
  for (const t of resultado.tareas) {
    const suma = t.checks.reduce((s, c) => s + c.puntos, 0);
    if (Math.abs(suma - t.puntos) > 0.01) falla(`${id}: los checks de la tarea ${t.id} suman ${suma}, no ${t.puntos}`);
    for (const c of t.checks) {
      if (!c.retro.trim()) falla(`${id}: el check ${t.id}/${c.id} no trae retro ${cuando}`);
      if (!c.texto.trim()) falla(`${id}: el check ${t.id}/${c.id} no tiene texto`);
      if (!c.repaso?.length) falla(`${id}: el check ${t.id}/${c.id} no dice dónde repasarlo (REPASO de la rúbrica)`);
    }
  }
}

function revisarLab(id) {
  const LAB = LABS.get(id);
  if (!LAB) return falla(`${id}: hay rúbrica pero no hay laboratorio en public/labs/index.js`);
  if (!LAB.titulo || !LAB.historia) falla(`${id}: al laboratorio le falta título o historia`);
  if (!(LAB.minutos > 0 && LAB.minutos <= 60)) falla(`${id}: dura ${LAB.minutos} min (máximo 60)`);

  for (const ejemplo of EJEMPLOS) {
    const quien = ejemplo.matricula || ejemplo.nombre;
    let datos;
    try {
      datos = datosAlumno(ejemplo);
    } catch (e) {
      falla(`${id}: datosAlumno() lanzó un error con ${quien}: ${e.message}`);
      continue;
    }

    try {
      const solucion = porJson(RUBRICAS.get(id).solucion(datos));
      if (JSON.stringify(solucion).length > LIMITE_CUENTA) falla(`${id}: la cuenta resuelta pesa más de 512 KB`);
      const { resultado } = calificarCuenta(id, solucion, ejemplo);
      if (resultado.total !== 100) falla(`${id}: la rúbrica vale ${resultado.total}, no 100`);
      // La solución saca 100 y además todos los puntos del bono (si hay): ningún check falla.
      const fallidos = resultado.tareas.flatMap((t) => t.checks.filter((c) => !c.ok).map((c) => `${t.id}/${c.id}`));
      if (resultado.obtenidos !== resultado.total || fallidos.length) {
        falla(`${id}: la solución de ${quien} da ${resultado.obtenidos}${fallidos.length ? ` (fallan: ${fallidos.join(', ')})` : ''}; debe dar 100 con todos los puntos, bono incluido`);
      } else bien(`${id}: la solución de ${quien} da 100${resultado.tareas.some((t) => t.bono) ? ' (y gana todo el bono)' : ''}`);
      revisarChecks(id, 'cuando se acierta', resultado);

      const inicial = porJson(LAB.estadoInicial(datos));
      const { resultado: deInicio } = calificarCuenta(id, inicial, ejemplo);
      if (deInicio.obtenidos >= 25) falla(`${id}: sin hacer nada, ${quien} ya saca ${deInicio.obtenidos}`);
      else bien(`${id}: la cuenta inicial de ${quien} da ${deInicio.obtenidos}`);
      revisarChecks(id, 'cuando se falla', deInicio);

      // Las tareas bono (opcionales) suman aparte: las requeridas valen 100 y
      // la calificación es min(100, requeridas + bono).
      const publicas = LAB.tareas(datos);
      const suma = publicas.filter((t) => !t.bono).reduce((s, t) => s + t.puntos, 0);
      if (suma !== 100) falla(`${id}: las tareas públicas (sin contar el bono) suman ${suma}, no 100`);
      if (deInicio.obtenidos > 100 || resultado.obtenidos > 100) falla(`${id}: la calificación pasa de 100`);
      const deRubrica = resultado.tareas.map((t) => t.id).join(', ');
      const dePublicas = publicas.map((t) => t.id).join(', ');
      if (deRubrica !== dePublicas) falla(`${id}: las tareas no coinciden. Rúbrica: ${deRubrica} · públicas: ${dePublicas}`);
      for (const t of publicas) {
        const r = resultado.tareas.find((x) => x.id === t.id);
        if (r && r.puntos !== t.puntos) falla(`${id}: la tarea ${t.id} vale ${t.puntos} para el alumno y ${r.puntos} en la rúbrica`);
        if (r && Boolean(r.bono) !== Boolean(t.bono)) falla(`${id}: la tarea ${t.id} es bono para ${t.bono ? 'el alumno' : 'la rúbrica'} y no para ${t.bono ? 'la rúbrica' : 'el alumno'}`);
        if (!t.titulo || !t.html) falla(`${id}: la tarea ${t.id} no tiene título o instrucciones`);
        if (LAB.pistas && !t.pista) falla(`${id}: la tarea ${t.id} no tiene pista («¿Dónde se hace?»)`);
      }
    } catch (e) {
      falla(`${id}: falló la revisión con ${quien}: ${e.stack || e.message}`);
    }
  }
}

/* ----------------------------------------------------------------- todo */

console.log('\n=========== PARTE TEÓRICA');
await verificadorExterno(path.join('teoria', 'verificar-teoria.js'), 'verificarTeoria', 'quien hace los bancos');
if (TEORIA.size === 0) avisa('TEORIA está vacío: todavía no hay bancos teóricos');
for (const [id, banco] of TEORIA) revisarBanco(id, banco);

console.log('\n=========== LABORATORIOS');
if (RUBRICAS.size === 0) avisa('RUBRICAS está vacío: todavía no hay rúbricas');
else await verificadorExterno(path.join('rubricas', 'verificar-labs.js'), 'verificarLabs', 'quien hace los laboratorios');
for (const id of RUBRICAS.keys()) revisarLab(id);
for (const [id, r] of RUBRICAS) for (const [clave, refs] of Object.entries(r.repaso ?? {})) revisarRefs(`${id}: REPASO['${clave}']`, refs);
for (const id of LABS.keys()) if (!RUBRICAS.has(id)) avisa(`${id}: hay laboratorio público pero no rúbrica`);

console.log('\n=========== REPASO (Ruta AWS)');
await (async () => {
  const ruta = path.join(AQUI, '..', '..', 'curso-aws-practitioner', 'public', 'contenido.js');
  if (!fs.existsSync(ruta)) return avisa('No encontré la Ruta AWS junto a este módulo: no puedo comparar el catálogo de repaso');
  const { SESIONES } = await import(pathToFileURL(ruta).href);
  const limpio = (t) => String(t ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  let distintos = 0;
  for (const s of SESIONES) for (const c of s.capitulos ?? []) for (const a of c.actividades ?? []) {
    const l = LECCIONES[a.id];
    if (!l) continue;
    const partes = (a.laminas ?? a.pasos ?? []).map((x) => limpio(x.titulo));
    if (l.sesion !== s.numero || l.titulo !== limpio(a.titulo) || JSON.stringify(l.partes) !== JSON.stringify(partes)) {
      falla(`repaso: la lección ${a.id} cambió en la Ruta; actualiza src/repaso.js para que los enlaces apunten a la lámina correcta`);
      distintos++;
    }
  }
  const enRuta = new Set(SESIONES.flatMap((s) => (s.capitulos ?? []).flatMap((c) => (c.actividades ?? []).map((a) => a.id))));
  for (const id of Object.keys(LECCIONES)) {
    if (!enRuta.has(id)) {
      falla(`repaso: la lección ${id} ya no existe en la Ruta`);
      distintos++;
    }
  }
  if (!distintos) bien(`El catálogo de repaso coincide con la Ruta (${Object.keys(LECCIONES).length} lecciones y laboratorios)`);
})();

console.log('\n=========== EVALUACIONES');
for (const ev of EVALUACIONES) {
  const partes = [];
  if (ev.teoria) partes.push(`teórica ${TEORIA.has(ev.teoria) ? 'lista' : 'EN PREPARACIÓN'}`);
  if (ev.lab) partes.push(`práctica ${RUBRICAS.has(ev.lab) && LABS.has(ev.lab) ? 'lista' : 'EN PREPARACIÓN'}`);
  const lista = (!ev.teoria || TEORIA.has(ev.teoria)) && (!ev.lab || (RUBRICAS.has(ev.lab) && LABS.has(ev.lab)));
  (lista ? bien : avisa)(`${ev.titulo} (${ev.fechaTexto}): ${partes.join(' · ')}`);
  const pesos = Object.values(ev.pesos).reduce((a, b) => a + b, 0);
  if (pesos !== 100) falla(`${ev.id}: los pesos suman ${pesos}, no 100`);
}

console.log(
  problemas === 0
    ? `\nTodo en orden${avisos ? ` (${avisos} aviso(s): lo que falta sale como «en preparación»)` : ''}.`
    : `\n${problemas} problema(s) por revisar.`
);
process.exit(problemas === 0 ? 0 : 1);
