// Vista previa del diagrama de arquitectura de un laboratorio (SIMULADOR.md §6.6).
//
//   node src/arquitectura-vista.js <lab> [--estado inicial|solucion] [--revision]
//        [--demo] [--alumno 0..4] [--elegida <id>] [--salida archivo.html]
//   npm run diagrama -- practica-1 --estado solucion --revision
//
// Escribe un HTML autosuficiente (fondo claro, el SVG, la leyenda, el resumen y
// la lista en texto) con el diagrama en la cuenta inicial o en la solución de
// la rúbrica. --revision califica esa cuenta (como «Revisar mi avance») para
// ver los estados «listo» y «le falta algo». --demo reparte los cuatro estados
// entre las piezas, para juzgar el diseño. Sin --salida, el HTML va a la
// carpeta temporal del sistema (nunca dentro del repositorio).
//
// El HTML se captura con Edge sin ventana y la captura se mira: un diagrama no
// se da por bueno sin verlo. Por ejemplo:
//   "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu
//     --hide-scrollbars --user-data-dir=<tmp>/edge --window-size=1400,1000
//     --screenshot=<tmp>/p1.png "file:///<tmp>/p1.html"

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ESTADOS, estadosDe, marcaSvg, piezasDe, resumenDe, svgArquitectura, validarArquitectura } from '../public/arquitectura.js';
import { datosAlumno } from '../public/labs/comun.js';
import { LABS } from '../public/labs/index.js';
import { calificarCuenta } from './calificar.js';
import { ALUMNOS } from './rubricas/verificar-labs.js';
import { RUBRICAS } from './rubricas/index.js';

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const porJson = (x) => JSON.parse(JSON.stringify(x));

function leerArgumentos(argv) {
  const op = { lab: null, estado: 'inicial', revision: false, demo: false, alumno: 0, elegida: null, salida: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--estado') op.estado = argv[++i];
    else if (a === '--revision') op.revision = true;
    else if (a === '--demo') op.demo = true;
    else if (a === '--alumno') op.alumno = Number(argv[++i]);
    else if (a === '--elegida') op.elegida = argv[++i];
    else if (a === '--salida') op.salida = argv[++i];
    else if (!a.startsWith('--') && !op.lab) op.lab = a;
    else throw new Error(`no entiendo «${a}»`);
  }
  return op;
}

/** Reparte los cuatro estados entre lo que tiene estado (para ver todos a la vez). */
function estadosDemo(arq) {
  const ciclo = ['falta', 'creado', 'pendiente', 'listo'];
  const estados = estadosDe(arq, null);
  piezasDe(arq).forEach((p, i) => (estados[p.id] = ciclo[i % ciclo.length]));
  return estados;
}

/** El HTML de la vista previa. */
function htmlVista({ arq, estados, elegida = null, subtitulo = '' }) {
  const r = resumenDe(arq, estados);
  const lista = piezasDe(arq)
    .map((p) => {
      const e = estados[p.id] ?? 'falta';
      return `<li>${marcaSvg(e, 14)} <strong>${esc(p.etiqueta)}</strong>${p.detalle ? ` <code>${esc(p.detalle)}</code>` : ''} · ${esc(ESTADOS[e].nombre)} <span class="sutil">(${esc(p.tarea)}${p.checks.length ? `: ${esc(p.checks.join(', '))}` : ''}${p.bono ? ' · bono' : ''})</span></li>`;
    })
    .join('');
  const leyenda = Object.entries(ESTADOS)
    .map(([e, x]) => `<span class="ley">${marcaSvg(e, 16)} ${esc(x.nombre)}</span>`)
    .join('');
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(arq.titulo)} · vista previa</title>
<style>
  body { margin: 0; background: #f4f5f7; color: #16191f; font-family: "Segoe UI", Arial, sans-serif; }
  main { max-width: 1180px; margin: 0 auto; padding: 16px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p { margin: 0 0 8px; }
  .sutil { color: #5f6b7a; font-size: 13px; }
  .tarjeta { background: #fff; border: 1px solid #d5dbe1; border-radius: 10px; padding: 12px; margin: 10px 0; overflow-x: auto; }
  .leyenda { display: flex; flex-wrap: wrap; gap: 16px; font-size: 13px; align-items: center; }
  .ley { display: inline-flex; gap: 6px; align-items: center; }
  .resumen { font-weight: 600; }
  ul { margin: 0; padding-left: 18px; font-size: 13px; columns: 2 320px; }
  li { margin: 2px 0; break-inside: avoid; }
  li svg { vertical-align: -2px; }
  code { font-family: Consolas, monospace; font-size: 12px; }
</style>
</head>
<body>
<main>
  <h1>${esc(arq.titulo)}</h1>
  <p>${esc(arq.objetivo)}</p>
  <p class="sutil">${esc(subtitulo)}</p>
  <div class="tarjeta leyenda"><span class="resumen">Llevas ${r.hechas} de ${r.total} · ${r.listas} listas</span>${leyenda}</div>
  <div class="tarjeta">${svgArquitectura(arq, estados, { elegida })}</div>
  <div class="tarjeta"><ul>${lista}</ul></div>
</main>
</body>
</html>
`;
}

async function principal() {
  const op = leerArgumentos(process.argv.slice(2));
  const LAB = op.lab && LABS.get(op.lab);
  if (!LAB) throw new Error(`uso: node src/arquitectura-vista.js <lab> … (labs: ${[...LABS.keys()].join(', ')})`);
  if (typeof LAB.arquitectura !== 'function') throw new Error(`${op.lab} todavía no tiene arquitectura(datos)`);
  if (!['inicial', 'solucion'].includes(op.estado)) throw new Error('--estado es inicial o solucion');
  const alumno = ALUMNOS[op.alumno];
  if (!alumno) throw new Error(`--alumno va de 0 a ${ALUMNOS.length - 1}`);
  const datos = datosAlumno(alumno);
  const arq = LAB.arquitectura(datos);

  const problemas = validarArquitectura(arq);
  for (const p of problemas) console.log(`  ✗ ${p}`);

  let estados;
  let subtitulo;
  if (op.demo) {
    estados = estadosDemo(arq);
    subtitulo = 'demo: los cuatro estados repartidos entre las piezas';
  } else {
    const rubrica = RUBRICAS.get(op.lab);
    if (op.estado === 'solucion' && !rubrica) throw new Error(`${op.lab} no tiene rúbrica con solución`);
    const cuenta = porJson(op.estado === 'solucion' ? rubrica.solucion(datos) : LAB.estadoInicial(datos));
    const revision = op.revision ? calificarCuenta(op.lab, cuenta, alumno).resultado : null;
    estados = estadosDe(arq, cuenta, revision);
    subtitulo = `${op.estado === 'solucion' ? 'cuenta resuelta (solución de la rúbrica)' : 'cuenta inicial'}${revision ? ` · con la revisión (${revision.obtenidos}/100)` : ' · sin revisión'} · ${alumno.nombre}`;
  }

  const salida = path.resolve(op.salida ?? path.join(os.tmpdir(), `arquitectura-${op.lab}-${op.demo ? 'demo' : op.estado}${op.revision ? '-revision' : ''}.html`));
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  fs.writeFileSync(salida, htmlVista({ arq, estados, elegida: op.elegida, subtitulo }));
  const r = resumenDe(arq, estados);
  console.log(`${op.lab}: ${r.hechas} de ${r.total} hechas, ${r.listas} listas${problemas.length ? ` · ${problemas.length} problema(s) de validación` : ''}`);
  console.log(salida);
  if (problemas.length) process.exitCode = 1;
}

try {
  await principal();
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
