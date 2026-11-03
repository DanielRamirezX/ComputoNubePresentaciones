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
//    repasa (src/repaso.js). El catálogo sale de la Ruta; aquí se revisa que
//    las láminas que usan las referencias de octubre sigan existiendo.
//  - Los topes de minutos y de tareas dependen del tipo de la evaluación que
//    usa el laboratorio (TIPOS en src/evaluaciones.js): un laboratorio de
//    sesión dura hasta 55 min, una práctica integradora hasta 100…
//  - Servidor: una prueba de humo de app.js con un almacén temporal (todas
//    las rutas del alumno y del panel, en todas las evaluaciones).
// Si todavía no hay bancos o rúbricas, avisa y no falla: esa evaluación sale
// como «en preparación».

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { LABS } from '../public/labs/index.js';
import { calificarCuenta } from './calificar.js';
import { ANCLAS, LECCIONES, ORIGEN_CATALOGO, catalogoDe, resolverRepaso } from './repaso.js';
import { EVALUACIONES, TIPOS, tipoDe } from './evaluaciones.js';
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

/** El tipo de la evaluación que usa ese laboratorio (o el de octubre si ninguna lo usa). */
const tipoDeLab = (labId) => tipoDe(EVALUACIONES.find((ev) => ev.lab === labId));

function revisarLab(id) {
  const LAB = LABS.get(id);
  if (!LAB) return falla(`${id}: hay rúbrica pero no hay laboratorio en public/labs/index.js`);
  if (!LAB.titulo || !LAB.historia) falla(`${id}: al laboratorio le falta título o historia`);
  const tipo = tipoDeLab(id);
  const { minutos: maximo } = TIPOS[tipo];
  if (!(LAB.minutos > 0 && LAB.minutos <= maximo)) falla(`${id}: dura ${LAB.minutos} min (máximo ${maximo} en un ${TIPOS[tipo].nombre.toLowerCase()})`);
  if (tipo === 'final' && LAB.pistas) avisa(`${id}: es el examen final y trae pistas «¿Dónde se hace?» (se esperaba sin pistas)`);
  if (!EVALUACIONES.some((ev) => ev.lab === id)) avisa(`${id}: ninguna evaluación de src/evaluaciones.js usa este laboratorio`);

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
  if (!fs.existsSync(ruta)) return avisa('No encontré la Ruta AWS junto a este módulo: el repaso usa solo las anclas de octubre (sesiones 1 a 4)');
  let SESIONES;
  try {
    ({ SESIONES } = await import(pathToFileURL(ruta).href));
  } catch (e) {
    return falla(`repaso: no pude leer la Ruta (${e.message}); el servidor usaría solo las anclas de octubre`);
  }
  if (ORIGEN_CATALOGO !== 'ruta') falla('repaso: src/repaso.js no pudo armar el catálogo desde la Ruta y usa solo las anclas de octubre');
  const deRuta = catalogoDe(SESIONES);

  // Las referencias con número que de verdad se usan (rúbricas y bancos).
  const usadas = new Set();
  const anotar = (refs) => (Array.isArray(refs) ? refs : refs ? [refs] : []).forEach((r) => String(r).includes('/') && usadas.add(String(r)));
  for (const r of RUBRICAS.values()) Object.values(r.repaso ?? {}).forEach(anotar);
  for (const banco of TEORIA.values()) (banco.PREGUNTAS ?? []).forEach((p) => anotar(p.repaso));

  // Las anclas: las láminas de octubre deben seguir en la Ruta (aunque cambien
  // de lugar: resolverRepaso las busca por título).
  let movidas = 0;
  for (const [id, ancla] of Object.entries(ANCLAS)) {
    const l = deRuta[id];
    const usada = [...usadas].some((r) => r.startsWith(`${id}/`));
    if (!l) {
      (usada ? falla : avisa)(`repaso: la lección ${id} ya no existe en la Ruta${usada ? ' y hay referencias que apuntan a ella' : ''}`);
      continue;
    }
    if (JSON.stringify(l.partes) === JSON.stringify(ancla.partes)) continue;
    movidas++;
    ancla.partes.forEach((titulo, i) => {
      if (l.partes.includes(titulo)) return;
      const ref = `${id}/${i + 1}`;
      if (usadas.has(ref)) falla(`repaso: la lámina «${titulo}» (${ref}) ya no está en la Ruta; esa referencia ahora lleva a la lección completa. Corrige la referencia o el título`);
      else avisa(`repaso: la lámina «${titulo}» (${ref}) ya no está en la Ruta (ninguna referencia la usa)`);
    });
  }
  // Cada referencia de octubre lleva a la lámina con la que se escribió.
  for (const ref of usadas) {
    const [id, n] = ref.split('/');
    const esperada = ANCLAS[id]?.partes[Number(n) - 1];
    if (!esperada || !deRuta[id]?.partes.includes(esperada)) continue;
    const r = resolverRepaso(ref);
    if (r?.parte !== esperada) falla(`repaso: ${ref} debía llevar a «${esperada}» y lleva a «${r?.parte ?? 'nada'}»`);
  }
  // Lo que usa el servidor es lo mismo que dice la Ruta.
  const distintos = Object.keys(deRuta).filter((id) => JSON.stringify(deRuta[id]) !== JSON.stringify(LECCIONES[id]));
  if (distintos.length) falla(`repaso: el catálogo del servidor no coincide con la Ruta en ${distintos.join(', ')}`);
  const sesiones = [...new Set(Object.values(deRuta).map((l) => l.sesion))].sort((a, b) => a - b);
  bien(
    `El catálogo de repaso sale de la Ruta: ${Object.keys(deRuta).length} lecciones y laboratorios de las sesiones ${sesiones.join(', ')}${
      movidas ? ` (${movidas} lección(es) de octubre cambiaron de láminas; sus referencias se siguen por título)` : ''
    }`
  );
})();

console.log('\n=========== CONSOLA: PRUEBAS DEL MODELO');
{
  const carpeta = path.join(AQUI, 'pruebas');
  const archivos = fs.existsSync(carpeta) ? fs.readdirSync(carpeta).filter((a) => a.endsWith('.js')).sort() : [];
  for (const archivo of archivos) {
    try {
      const prueba = await import(pathToFileURL(path.join(carpeta, archivo)).href);
      const fallas = (await prueba.probar()) ?? [];
      if (fallas.length) for (const x of fallas) falla(`${prueba.titulo ?? archivo}: ${x}`);
      else bien(`${prueba.titulo ?? archivo}: sin problemas`);
    } catch (e) {
      falla(`${archivo}: la prueba tronó: ${e.stack ?? e}`);
    }
  }
  if (!archivos.length) avisa('Todavía no hay pruebas del modelo en src/pruebas/');
}

console.log('\n=========== SERVIDOR (prueba de humo)');
// El servidor de verdad (app.js) con un almacén de usar y tirar: que ninguna
// evaluación, ni las que siguen «en preparación», truene al alumno o al panel.
await (async () => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluacion-aws-verificar-'));
  process.env.DATA_DIR = carpeta;
  process.env.CLAVE_DOCENTE ||= 'verificar';
  const clave = process.env.CLAVE_DOCENTE;
  try {
    const { crearApp } = await import(pathToFileURL(path.join(AQUI, '..', 'app.js')).href);
    const manejar = crearApp();
    // Una solicitud sin red: el manejador escribe en un `res` de mentiras.
    const pedir = (metodo, url, cuerpo, headers = {}) =>
      new Promise((resolve, reject) => {
        const res = {
          headersSent: false,
          writeHead(estado) {
            this.estado = estado;
            this.headersSent = true;
          },
          setHeader() {},
          end(texto) {
            const crudo = String(texto ?? '');
            let json = null;
            try {
              json = JSON.parse(crudo);
            } catch {
              json = null;
            }
            resolve({ estado: this.estado, json, crudo });
          }
        };
        Promise.resolve(manejar({ method: metodo, url, headers, body: cuerpo }, res, () => resolve({ estado: 404, json: null, crudo: '' }))).catch(reject);
      });
    const docente = { 'x-clave-docente': clave };
    const alumno = { id: 'abcdef0123456789abcdef01', nombre: 'Prueba Verificar', matricula: 'V0001', grupo: 'PRUEBA' };
    let fallos = 0;
    const exigir = (ok, texto) => {
      if (!ok) {
        fallos++;
        falla(`servidor: ${texto}`);
      }
    };

    let r = await pedir('GET', `/api/estado?a=${alumno.id}`);
    exigir(r.estado === 200 && r.json?.evaluaciones?.length === EVALUACIONES.length, `api/estado respondió ${r.estado}`);
    exigir((r.json?.evaluaciones ?? []).every((e) => Object.hasOwn(TIPOS, e.tipo)), 'api/estado no trae el tipo de cada evaluación');

    for (const ev of EVALUACIONES) {
      for (const parte of ['teoria', 'practica']) {
        if (!(parte === 'teoria' ? ev.teoria : ev.lab)) continue;
        r = await pedir('POST', `/api/${parte}`, { alumno, evaluacion: ev.id });
        exigir(r.estado === 200 && ['abierta', 'cerrada', 'preparacion'].includes(r.json?.estado), `api/${parte} de ${ev.id} respondió ${r.estado} ${r.json?.estado ?? r.json?.error ?? ''}`);
      }
      r = await pedir('GET', `/api/resultado?a=${alumno.id}&evaluacion=${ev.id}`);
      exigir(r.estado === 200, `api/resultado de ${ev.id} respondió ${r.estado}`);
    }
    r = await pedir('GET', `/api/estado?a=${alumno.id}`);
    exigir(r.estado === 200 && r.json?.registrado === true, 'api/estado no reconoce al alumno ya registrado');

    r = await pedir('POST', '/api/docente/entrar', { clave });
    exigir(r.estado === 200 && r.json?.evaluaciones?.every((e) => e.tipo), `api/docente/entrar respondió ${r.estado}`);
    for (const ev of EVALUACIONES) {
      for (const ruta of [`/api/docente/resumen?evaluacion=${ev.id}`, `/api/docente/datos.csv?evaluacion=${ev.id}`, `/api/docente/reporte?evaluacion=${ev.id}`, `/api/docente/detalle?evaluacion=${ev.id}&alumno=${alumno.id}`]) {
        r = await pedir('GET', ruta, undefined, docente);
        exigir(r.estado === 200, `${ruta.split('?')[0]} de ${ev.id} respondió ${r.estado} ${r.json?.error ?? ''}`);
      }
    }
    r = await pedir('GET', '/api/docente/simulador', undefined, docente);
    exigir(r.estado === 200 && r.json?.evaluaciones?.length === EVALUACIONES.filter((e) => tipoDe(e) !== 'evaluacion').length, `api/docente/simulador respondió ${r.estado}`);
    if (!fallos) bien(`El servidor atiende al alumno y al panel en las ${EVALUACIONES.length} evaluaciones (también las que siguen en preparación)`);
  } catch (e) {
    falla(`servidor: la prueba de humo tronó: ${e.stack ?? e}`);
  } finally {
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
})();

console.log('\n=========== EVALUACIONES');
{
  const ids = EVALUACIONES.map((ev) => ev.id);
  for (const id of new Set(ids)) if (ids.filter((x) => x === id).length > 1) falla(`la evaluación ${id} está repetida en src/evaluaciones.js`);
  const labs = EVALUACIONES.map((ev) => ev.lab).filter(Boolean);
  for (const lab of new Set(labs)) if (labs.filter((x) => x === lab).length > 1) falla(`el laboratorio ${lab} lo usan dos evaluaciones (el avance se mezclaría)`);
}
for (const ev of EVALUACIONES) {
  if (!Object.hasOwn(TIPOS, ev.tipo ?? '')) falla(`${ev.id}: su tipo «${ev.tipo}» no existe (${Object.keys(TIPOS).join(', ')})`);
  const partes = [];
  if (ev.teoria) partes.push(`teórica ${TEORIA.has(ev.teoria) ? 'lista' : 'EN PREPARACIÓN'}`);
  if (ev.lab) partes.push(`práctica ${RUBRICAS.has(ev.lab) && LABS.has(ev.lab) ? 'lista' : 'EN PREPARACIÓN'}`);
  const lista = (!ev.teoria || TEORIA.has(ev.teoria)) && (!ev.lab || (RUBRICAS.has(ev.lab) && LABS.has(ev.lab)));
  (lista ? bien : avisa)(`${ev.titulo} (${TIPOS[tipoDe(ev)].nombre.toLowerCase()} · ${ev.fechaTexto}): ${partes.join(' · ')}`);
  const pesos = Object.values(ev.pesos).reduce((a, b) => a + b, 0);
  if (pesos !== 100) falla(`${ev.id}: los pesos suman ${pesos}, no 100`);
}

console.log(
  problemas === 0
    ? `\nTodo en orden${avisos ? ` (${avisos} aviso(s): lo que falta sale como «en preparación»)` : ''}.`
    : `\n${problemas} problema(s) por revisar.`
);
process.exit(problemas === 0 ? 0 : 1);
