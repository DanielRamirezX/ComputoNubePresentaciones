// ---------------------------------------------------------------------------
// CLOUDWATCH
//
// Las pantallas de CloudWatch: Overview, Dashboards (automáticos y propios con
// widgets), Alarms (lista, detalle con gráfica e historial, y el asistente
// «Create alarm» de 4 pasos con sus acciones de SNS, Auto Scaling, EC2 y
// Lambda), Metrics → All metrics (Browse con gráfica SVG) y Logs → Log groups
// (retención, flujos y eventos).
//
// Las métricas se calculan en modelo/cloudwatch.js (no se guardan): una
// gráfica pide la serie cada vez que se pinta. El tiempo va comprimido: cada
// punto de la gráfica es un periodo de 10 segundos reales.
//
// Exporta grafica() y graficaMetricas() para que otros servicios (Auto Scaling,
// ELB, SQS…) pinten su pestaña Monitoring con la misma gráfica.
// ---------------------------------------------------------------------------

import * as ui from '../ui.js';
import * as modelo from '../modelo.js';
import {
  agregarWidget,
  alarmaDe,
  cambiarAccionesAlarmas,
  catalogoMetricas,
  claveMetrica,
  COMPARACIONES_ALARMA,
  crearAlarma,
  crearFlujoLogs,
  crearGrupoLogs,
  crearTablero,
  editarAlarma,
  editarRetencionLogs,
  eliminarAlarmas,
  eliminarFlujosLogs,
  eliminarGruposLogs,
  eliminarTableros,
  ESPACIOS_METRICAS,
  grupoLogsDe,
  bytesGrupoLogs,
  quitarWidget,
  RETENCIONES_LOGS,
  serieMetrica,
  signoComparacion,
  simularCarga,
  tableroDe,
  textoCondicion,
  textoEstadoAlarma,
  textoPeriodo,
  unidadMetrica
} from '../modelo.js';
import { noExiste } from './comun.js';

const { h } = ui;

/* ============================================================ utilidades */

const migasCw = (cx, ...resto) => cx.migas([{ texto: 'CloudWatch', ruta: 'cloudwatch' }, ...resto]);
const rutaAlarma = (n) => `cloudwatch/alarmas/${encodeURIComponent(n)}`;
const rutaGrupoLogs = (n) => `cloudwatch/logs/${encodeURIComponent(n)}`;
const rutaTablero = (n) => `cloudwatch/tableros/${encodeURIComponent(n)}`;
const cw = (cx) => cx.estado.cloudwatch ?? { alarmas: [], tableros: [], gruposLogs: [], carga: {} };
const dos = (n) => String(n).padStart(2, '0');

/** «2026-11-02 15:20:00» en UTC, como las columnas de CloudWatch. */
export function fechaUtc(v) {
  const d = new Date(typeof v === 'number' ? v : Date.parse(v));
  if (Number.isNaN(d.getTime())) return '–';
  return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())} ${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}:${dos(d.getUTCSeconds())}`;
}

/** «15:20:10», la hora local de los ejes de la gráfica. */
const horaCorta = (ms) => {
  const d = new Date(ms);
  return `${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;
};

/** Un número corto para los ejes y los widgets: 1.2k, 3.4M… */
export function numeroCorto(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  const a = Math.abs(v);
  const recorta = (x, d) => String(Number(x.toFixed(d)));
  if (a >= 1e12) return `${recorta(v / 1e12, 2)}T`;
  if (a >= 1e9) return `${recorta(v / 1e9, 2)}G`;
  if (a >= 1e6) return `${recorta(v / 1e6, 2)}M`;
  if (a >= 1e4) return `${recorta(v / 1e3, 1)}k`;
  if (a >= 100) return recorta(v, 0);
  if (a >= 1) return recorta(v, 2);
  return recorta(v, 4);
}

const ESTADO_ALARMA_UI = { ALARM: ['error', 'In alarm'], OK: ['exito', 'OK'], INSUFFICIENT_DATA: ['detenido', 'Insufficient data'] };
const estadoAlarma = (e) => ui.estado(...(ESTADO_ALARMA_UI[e] ?? ['info', e]));

const TEXTO_FALTANTES = {
  missing: 'Treat missing data as missing',
  notBreaching: 'Treat missing data as good (not breaching threshold)',
  breaching: 'Treat missing data as bad (breaching threshold)',
  ignore: 'Treat missing data as ignore (maintain the alarm state)'
};

const TEXTO_COMPARACION = {
  GreaterThanThreshold: ['Greater', '> threshold'],
  GreaterThanOrEqualToThreshold: ['Greater/Equal', '>= threshold'],
  LessThanOrEqualToThreshold: ['Lower/Equal', '<= threshold'],
  LessThanThreshold: ['Lower', '< threshold']
};

const ESTADISTICAS = ['Average', 'Sum', 'Minimum', 'Maximum', 'SampleCount', 'p99', 'p95', 'p90'];
const PERIODOS = [
  [10, '10 seconds'],
  [30, '30 seconds'],
  [60, '1 minute'],
  [300, '5 minutes'],
  [900, '15 minutes'],
  [3600, '1 hour'],
  [21600, '6 hours'],
  [86400, '1 day']
];

// Los rangos de las gráficas. Cada punto es un periodo de 5 minutos «de AWS»,
// que en el simulador dura 10 segundos.
const RANGOS = [
  { valor: '1h', etiqueta: '1h', puntos: 12 },
  { valor: '3h', etiqueta: '3h', puntos: 36 },
  { valor: '12h', etiqueta: '12h', puntos: 144 },
  { valor: '1d', etiqueta: '1d', puntos: 288 }
];
const puntosDe = (rango) => (RANGOS.find((r) => r.valor === rango) ?? RANGOS[1]).puntos;

function selectorRango(cx, alCambiar) {
  return ui.segmentado({
    etiquetaAccesible: 'Time range',
    valor: cx.memoria.cwRango ?? '3h',
    opciones: [...RANGOS.map((r) => ({ valor: r.valor, etiqueta: r.etiqueta })), { valor: 'custom', etiqueta: 'Custom', desactivado: true }],
    alCambiar: (v) => {
      cx.memoria.cwRango = v;
      alCambiar?.(v);
    }
  });
}

/** El nombre de una métrica para leyendas: «i-0abc (web) · CPUUtilization». */
export function etiquetaMetrica(ref, etiqueta) {
  const dims = Object.values(ref.dimensiones ?? {});
  const base = dims.length ? dims.join(' · ') : ref.namespace.replace('AWS/', '');
  return `${base}${etiqueta ? ` (${etiqueta})` : ''} · ${ref.metrica}`;
}

/* ================================================================ gráfica */

const NS_SVG = 'http://www.w3.org/2000/svg';
const COLORES = ['#7598ff', '#ff7a9a', '#2ea597', '#a783e1', '#f89256', '#3dc5f2', '#e94a8c', '#7fd36a', '#cf9cff', '#ffd166'];
export const colorSerie = (i) => COLORES[i % COLORES.length];

/** Un nodo SVG (los datos son números o textos fijos; los nombres van en HTML). */
function s(etiqueta, atributos = {}, ...hijos) {
  const el = document.createElementNS(NS_SVG, etiqueta);
  for (const [k, v] of Object.entries(atributos)) if (v !== undefined && v !== null && v !== false) el.setAttribute(k, String(v));
  for (const c of hijos.flat()) if (c !== null && c !== undefined) el.append(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  return el;
}

function techoBonito(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/**
 * La gráfica de líneas de CloudWatch.
 *   series: [{ etiqueta, puntos: [{ t, v }], color }]
 *   umbral, comparacion: la línea roja de una alarma
 *   unidad: 'Percent', 'Bytes'…  ancho/alto: tamaño del viewBox
 */
export function grafica({ series = [], umbral = null, comparacion = 'GreaterThanThreshold', unidad = '', ancho = 900, alto = 240, vacio, leyenda = true }) {
  if (!series.length) return h('div', { class: 'cx-cw-grafica cx-cw-grafica--vacia' }, h('p', { class: 'cx-texto-sec' }, vacio ?? 'Your CloudWatch graph is empty. Select some metrics to appear here.'));
  const valores = series.flatMap((x) => x.puntos.map((p) => p.v)).filter((v) => v !== null && v !== undefined);
  const izq = 52;
  const der = 14;
  const arriba = 22;
  const abajo = 24;
  const w = ancho - izq - der;
  const alt = alto - arriba - abajo;
  const minimo = Math.min(0, ...valores);
  let maximo = Math.max(...valores, umbral ?? -Infinity, minimo + 1e-9);
  if (!valores.length && umbral === null) maximo = unidad === 'Percent' ? 100 : 1;
  else maximo = maximo <= 1e-6 ? 1 : techoBonito(maximo * 1.1);
  if (unidad === 'Percent' && maximo > 100 && Math.max(...valores, umbral ?? 0) <= 100) maximo = 100;
  const tiempos = series[0].puntos.map((p) => p.t);
  const n = tiempos.length;
  const x = (i) => izq + (n <= 1 ? w / 2 : (i / (n - 1)) * w);
  const y = (v) => arriba + alt - ((v - minimo) / (maximo - minimo || 1)) * alt;

  const svg = s('svg', { viewBox: `0 0 ${ancho} ${alto}`, class: 'cx-cw-svg', role: 'img', 'aria-label': 'Metric graph' });
  // Rejilla y eje Y.
  for (let k = 0; k <= 4; k++) {
    const v = minimo + ((maximo - minimo) * k) / 4;
    const yy = y(v);
    svg.append(s('line', { x1: izq, x2: izq + w, y1: yy, y2: yy, class: k ? 'cx-cw-rejilla' : 'cx-cw-eje' }));
    svg.append(s('text', { x: izq - 6, y: yy + 4, 'text-anchor': 'end', class: 'cx-cw-texto-eje' }, numeroCorto(v)));
  }
  if (unidad && unidad !== 'Count') svg.append(s('text', { x: 4, y: 10, class: 'cx-cw-texto-eje' }, unidad === 'Percent' ? '%' : unidad));
  // Eje X: unas 5 horas.
  const marcas = Math.min(5, n);
  for (let k = 0; k < marcas; k++) {
    const i = marcas === 1 ? 0 : Math.round((k * (n - 1)) / (marcas - 1));
    svg.append(s('text', { x: x(i), y: alto - 6, 'text-anchor': k === 0 ? 'start' : k === marcas - 1 ? 'end' : 'middle', class: 'cx-cw-texto-eje' }, horaCorta(tiempos[i])));
  }
  // El umbral de la alarma: la línea roja y la zona en alarma sombreada.
  if (umbral !== null && umbral !== undefined && Number.isFinite(umbral)) {
    const yu = Math.max(arriba, Math.min(arriba + alt, y(umbral)));
    const mayor = /^Greater/.test(comparacion);
    svg.append(s('rect', { x: izq, width: w, y: mayor ? arriba : yu, height: mayor ? yu - arriba : arriba + alt - yu, class: 'cx-cw-zona-alarma' }));
    svg.append(s('line', { x1: izq, x2: izq + w, y1: yu, y2: yu, class: 'cx-cw-umbral' }));
  }
  // Las líneas (se cortan donde faltan datos).
  series.forEach((serie, i) => {
    const color = serie.color ?? colorSerie(i);
    let d = '';
    let tramo = 0;
    const sueltos = [];
    serie.puntos.forEach((p, k) => {
      if (p.v === null || p.v === undefined) {
        if (tramo === 1) sueltos.push(k - 1);
        tramo = 0;
        return;
      }
      d += `${tramo ? 'L' : 'M'}${x(k).toFixed(1)} ${y(p.v).toFixed(1)} `;
      tramo += 1;
    });
    if (tramo === 1) sueltos.push(serie.puntos.length - 1);
    if (d) svg.append(s('path', { d: d.trim(), class: 'cx-cw-linea', stroke: color }));
    for (const k of sueltos) svg.append(s('circle', { cx: x(k), cy: y(serie.puntos[k].v), r: 2.5, fill: color }));
    if (n <= 60) {
      serie.puntos.forEach((p, k) => {
        if (p.v === null || p.v === undefined) return;
        svg.append(s('circle', { cx: x(k), cy: y(p.v), r: 5, class: 'cx-cw-punto' }, s('title', {}, `${horaCorta(p.t)}  ${numeroCorto(p.v)}`)));
      });
    }
  });
  const sinDatos = !valores.length ? h('div', { class: 'cx-cw-grafica__aviso' }, 'No data available.') : null;
  return h(
    'div',
    { class: 'cx-cw-grafica' },
    h('div', { class: 'cx-cw-grafica__lienzo' }, svg, sinDatos),
    leyenda
      ? h(
          'div',
          { class: 'cx-cw-leyenda' },
          series.map((x2, i) => h('span', { class: 'cx-cw-leyenda__item' }, h('span', { class: 'cx-cw-muestra', style: { background: x2.color ?? colorSerie(i) } }), x2.etiqueta)),
          umbral !== null && umbral !== undefined ? h('span', { class: 'cx-cw-leyenda__item' }, h('span', { class: 'cx-cw-muestra cx-cw-muestra--umbral' }), `${signoComparacion(comparacion)} ${umbral}`) : null
        )
      : null
  );
}

/**
 * La gráfica de unas métricas: [{ namespace, metrica, dimensiones, estadistica, etiqueta }].
 * Para la pestaña Monitoring de otros servicios: graficaMetricas(cx, [ref], { puntos: 36 }).
 */
export function graficaMetricas(cx, refs, { puntos, umbral, comparacion, ancho, alto, vacio, leyenda } = {}) {
  const n = puntos ?? puntosDe(cx.memoria.cwRango);
  const series = refs.map((r, i) => ({ etiqueta: r.etiqueta ?? etiquetaMetrica(r), puntos: serieMetrica(cx.estado, r, { puntos: n }), color: colorSerie(i) }));
  // La unidad del eje solo si todas las métricas la comparten (CPU en % y red en bytes no).
  const unidades = [...new Set(refs.map((r) => unidadMetrica(r.metrica)))];
  return grafica({ series, umbral, comparacion, unidad: unidades.length === 1 ? unidades[0] : '', ancho, alto, vacio, leyenda });
}

/* ===================================================== navegador de métricas */

/** Las filas del catálogo con su clave y referencia. */
function filasCatalogo(estado) {
  return catalogoMetricas(estado).map((m) => {
    const ref = { namespace: m.namespace, metrica: m.metrica, dimensiones: m.dimensiones };
    return { ...m, ref, clave: claveMetrica(ref) };
  });
}

/**
 * «Browse» de All metrics: espacios de nombres → grupos de dimensiones →
 * tabla de métricas con casillas. st: { ruta: [namespace, conjunto], busqueda, elegidas: Map(clave → { ref, etiqueta }) }.
 * unica: true para elegir una sola (la de una alarma).
 */
function navegadorMetricas(cx, st, { unica = false, alCambiar } = {}) {
  const zona = cx.vivo(() => {
    const filas = filasCatalogo(cx.estado);
    const [ns, conjunto] = st.ruta;
    const migaRuta = h(
      'div',
      { class: 'cx-cw-ruta' },
      ui.enlace('All', () => ((st.ruta = []), zona.repintar())),
      ns ? [h('span', { class: 'cx-cw-ruta__sep' }, '>'), conjunto ? ui.enlace(corto(ns), () => ((st.ruta = [ns]), zona.repintar())) : h('b', {}, corto(ns))] : null,
      conjunto ? [h('span', { class: 'cx-cw-ruta__sep' }, '>'), h('b', {}, conjunto)] : null
    );
    const texto = st.busqueda.trim().toLowerCase();
    if (texto) {
      const halladas = filas.filter((f) => `${f.namespace} ${f.conjunto} ${f.metrica} ${Object.entries(f.dimensiones).flat().join(' ')} ${f.etiqueta ?? ''}`.toLowerCase().includes(texto));
      return [migaRuta, tablaMetricas(cx, st, halladas, { unica, alCambiar, mezcla: true })];
    }
    if (!ns) {
      const presentes = ESPACIOS_METRICAS.map((e) => ({ ...e, n: filas.filter((f) => f.namespace === e.namespace).length })).filter((e) => e.n);
      return [
        migaRuta,
        h('h3', { class: 'cx-h3' }, `Metrics (${filas.length})`),
        presentes.length
          ? h(
              'div',
              { class: 'cx-cw-espacios' },
              presentes.map((e) => h('button', { type: 'button', class: 'cx-cw-espacio', onclick: () => ((st.ruta = [e.namespace]), zona.repintar()) }, h('span', { class: 'cx-cw-espacio__nombre' }, e.corto), h('span', { class: 'cx-cw-espacio__n' }, String(e.n))))
            )
          : h('p', { class: 'cx-texto-sec' }, 'No metrics yet. Launch an instance (or create another resource) and its metrics appear here in a few seconds.')
      ];
    }
    if (!conjunto) {
      const conjuntos = [...new Set(filas.filter((f) => f.namespace === ns).map((f) => f.conjunto))];
      return [
        migaRuta,
        h('h3', { class: 'cx-h3' }, `${corto(ns)} metrics`),
        h(
          'div',
          { class: 'cx-cw-espacios' },
          conjuntos.map((c) => h('button', { type: 'button', class: 'cx-cw-espacio', onclick: () => ((st.ruta = [ns, c]), zona.repintar()) }, h('span', { class: 'cx-cw-espacio__nombre' }, c), h('span', { class: 'cx-cw-espacio__n' }, String(filas.filter((f) => f.namespace === ns && f.conjunto === c).length))))
        )
      ];
    }
    return [migaRuta, tablaMetricas(cx, st, filas.filter((f) => f.namespace === ns && f.conjunto === conjunto), { unica, alCambiar })];
  });
  const buscar = ui.entrada({
    buscar: true,
    valor: st.busqueda,
    placeholder: 'Search for any metric, dimension, resource id or account id',
    etiquetaAccesible: 'Search metrics',
    alCambiar: (v) => {
      st.busqueda = v;
      zona.repintar();
    }
  });
  return h('div', { class: 'cx-cw-navegador' }, h('div', { class: 'cx-cw-navegador__buscar' }, buscar), zona);
}

const corto = (ns) => ESPACIOS_METRICAS.find((e) => e.namespace === ns)?.corto ?? ns;

function tablaMetricas(cx, st, filas, { unica, alCambiar, mezcla = false }) {
  const dims = mezcla ? [] : Object.keys(filas[0]?.dimensiones ?? {});
  const conNombre = !mezcla && filas.some((f) => f.etiqueta);
  const columnas = [
    ...(conNombre ? [{ titulo: dims.includes('InstanceId') ? 'InstanceName' : 'Name', valor: (f) => f.etiqueta || '–' }] : []),
    ...dims.map((d) => ({ titulo: d, valor: (f) => f.dimensiones[d] })),
    ...(mezcla ? [{ titulo: 'Namespace', valor: (f) => `${corto(f.namespace)} > ${f.conjunto}` }, { titulo: 'Dimensions', valor: (f) => Object.entries(f.dimensiones).map(([k, v]) => `${k}=${v}`).join(', ') || '–' }] : []),
    { titulo: 'Metric name', valor: (f) => f.metrica }
  ];
  return ui.tabla(cx, {
    variante: 'simple',
    filas: () => filas,
    clave: (f) => f.clave,
    seleccion: unica ? 'unica' : 'multiple',
    seleccionados: [...st.elegidas.keys()].filter((k) => filas.some((f) => f.clave === k)),
    filtro: false,
    columnas,
    vacio: { titulo: 'No metrics', texto: 'No metrics match your search.' },
    alSeleccionar: (ids) => {
      if (unica) st.elegidas.clear();
      for (const f of filas) {
        if (ids.includes(f.clave)) st.elegidas.set(f.clave, { ref: f.ref, etiqueta: f.etiqueta });
        else if (!unica) st.elegidas.delete(f.clave);
      }
      alCambiar?.();
    }
  });
}

/** El modal «Select metric» del asistente de alarmas y del widget. */
function modalElegirMetrica(cx, { unica = true, titulo = 'Select metric', textoBoton = 'Select metric', alElegir }) {
  const st = { ruta: [], busqueda: '', elegidas: new Map() };
  const vista = cx.vivo(() => {
    const refs = [...st.elegidas.values()].map((x) => ({ ...x.ref, estadistica: 'Average', etiqueta: etiquetaMetrica(x.ref, x.etiqueta) }));
    return graficaMetricas(cx, refs, { alto: 200, vacio: 'Your CloudWatch graph is empty. Select a metric to appear here.' });
  });
  const boton = ui.boton(textoBoton, { variante: 'primario', escribe: false, desactivado: true, alClic: () => {
    const lista = [...st.elegidas.values()];
    if (!lista.length) return;
    m.cerrar();
    alElegir(unica ? lista[0] : lista);
  } });
  const m = cx.modal({
    titulo,
    ancho: 'grande',
    contenido: h(
      'div',
      { class: 'cx-pagina' },
      h('div', { class: 'cx-cw-cabeza-grafica' }, h('b', {}, 'Untitled graph'), selectorRango(cx, () => vista.repintar())),
      vista,
      ui.pestanas({
        pestanas: [
          { id: 'browse', texto: 'Browse', contenido: () => navegadorMetricas(cx, st, { unica, alCambiar: () => ((boton.disabled = !st.elegidas.size), vista.repintar()) }) },
          { id: 'query', texto: 'Multi source query', desactivada: true, contenido: () => null },
          { id: 'graficadas', texto: 'Graphed metrics', desactivada: true, contenido: () => null },
          { id: 'opciones', texto: 'Options', desactivada: true, contenido: () => null }
        ]
      })
    ),
    pie: [ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }), boton]
  });
  return m;
}

/* ================================================================ overview */

function overview(cx) {
  migasCw(cx, { texto: 'Overview' });
  const resumen = cx.vivo(() => {
    const al = cw(cx).alarmas;
    const cuenta = (e) => al.filter((a) => a.estado === e).length;
    return ui.contenedor({
      titulo: 'Alarms summary',
      info: 'cw-estados',
      cx,
      acciones: [ui.boton('Create alarm', { alClic: () => cx.ir('cloudwatch/alarmas/crear'), escribe: true }), ui.boton('View all alarms', { alClic: () => cx.ir('cloudwatch/alarmas') })],
      cuerpo: h(
        'div',
        { class: 'cx-cw-estados' },
        h('div', {}, h('div', { class: 'cx-texto-sec' }, 'In alarm'), h('div', { class: ['cx-cw-cifra', cuenta('ALARM') && 'cx-cw-cifra--alarma'] }, String(cuenta('ALARM')))),
        h('div', {}, h('div', { class: 'cx-texto-sec' }, 'Insufficient data'), h('div', { class: 'cx-cw-cifra' }, String(cuenta('INSUFFICIENT_DATA')))),
        h('div', {}, h('div', { class: 'cx-texto-sec' }, 'OK'), h('div', { class: ['cx-cw-cifra', cuenta('OK') && 'cx-cw-cifra--ok'] }, String(cuenta('OK'))))
      )
    });
  });
  const recientes = cx.vivo(() => {
    const al = [...cw(cx).alarmas].sort((a, b) => Date.parse(b.desde) - Date.parse(a.desde)).slice(0, 4);
    return ui.contenedor({
      titulo: 'Recent alarms',
      cuerpo: al.length
        ? h(
            'div',
            { class: 'cx-cw-widgets' },
            al.map((a) =>
              h(
                'div',
                { class: 'cx-cw-widget' },
                h('div', { class: 'cx-cw-widget__cabeza' }, ui.enlace(a.nombre, rutaAlarma(a.nombre), { cx }), estadoAlarma(a.estado)),
                graficaMetricas(cx, [refDeAlarma(a)], { puntos: 18, umbral: a.umbral, comparacion: a.comparacion, ancho: 560, alto: 170, leyenda: false })
              )
            )
          )
        : h('p', { class: 'cx-texto-sec' }, 'You don’t have any alarms yet.')
    });
  });
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'CloudWatch', info: 'cw-tiempo', cx, descripcion: 'Observe and monitor your resources and applications on AWS, on premises, and on other clouds.' }),
    resumen,
    recientes,
    ui.contenedor({
      titulo: 'Automatic dashboards',
      descripcion: 'CloudWatch creates these dashboards for the AWS services you use.',
      cuerpo: cx.vivo(() => {
        const disp = automaticosConDatos(cx);
        return disp.length ? h('div', { class: 'cx-acciones' }, disp.map((a) => ui.boton(a.nombre, { alClic: () => cx.ir(`cloudwatch/tableros/auto/${a.id}`) }))) : h('p', { class: 'cx-texto-sec' }, 'When you create resources (instances, load balancers, queues…), their dashboards appear here.');
      })
    })
  );
}

const refDeAlarma = (a) => ({ namespace: a.metrica.namespace, metrica: a.metrica.nombre, dimensiones: a.metrica.dimensiones, estadistica: a.estadistica, etiqueta: a.metrica.nombre });

/* ============================================================== tableros */

// Los tableros automáticos por servicio: cada widget junta la misma métrica de
// varios recursos (hasta 10 líneas).
const AUTOMATICOS = [
  { id: 'ec2', nombre: 'EC2', descripcion: 'Elastic Compute Cloud', widgets: ['CPUUtilization', 'NetworkIn', 'NetworkOut', 'NetworkPacketsIn', 'NetworkPacketsOut', 'StatusCheckFailed'].map((m) => ({ namespace: 'AWS/EC2', conjunto: 'Per-Instance Metrics', metrica: m })) },
  {
    id: 'autoscaling',
    nombre: 'Auto Scaling',
    descripcion: 'EC2 Auto Scaling',
    widgets: [
      { namespace: 'AWS/EC2', conjunto: 'By Auto Scaling Group', metrica: 'CPUUtilization' },
      { namespace: 'AWS/AutoScaling', conjunto: 'Group Metrics', metrica: 'GroupDesiredCapacity' },
      { namespace: 'AWS/AutoScaling', conjunto: 'Group Metrics', metrica: 'GroupInServiceInstances' },
      { namespace: 'AWS/EC2', conjunto: 'By Auto Scaling Group', metrica: 'NetworkIn' }
    ]
  },
  {
    id: 'elb',
    nombre: 'Application ELB',
    descripcion: 'Application Load Balancer',
    widgets: [
      { namespace: 'AWS/ApplicationELB', conjunto: 'Per AppELB Metrics', metrica: 'RequestCount', estadistica: 'Sum' },
      { namespace: 'AWS/ApplicationELB', conjunto: 'Per AppELB, per TG Metrics', metrica: 'HealthyHostCount' },
      { namespace: 'AWS/ApplicationELB', conjunto: 'Per AppELB Metrics', metrica: 'TargetResponseTime' },
      { namespace: 'AWS/ApplicationELB', conjunto: 'Per AppELB Metrics', metrica: 'HTTPCode_ELB_5XX_Count', estadistica: 'Sum' }
    ]
  },
  { id: 'sqs', nombre: 'SQS', descripcion: 'Simple Queue Service', widgets: ['ApproximateNumberOfMessagesVisible', 'ApproximateNumberOfMessagesNotVisible', 'NumberOfMessagesSent', 'NumberOfMessagesReceived'].map((m) => ({ namespace: 'AWS/SQS', conjunto: 'Queue Metrics', metrica: m, estadistica: /^Number/.test(m) ? 'Sum' : 'Average' })) },
  { id: 'sns', nombre: 'SNS', descripcion: 'Simple Notification Service', widgets: ['NumberOfMessagesPublished', 'NumberOfNotificationsDelivered', 'NumberOfNotificationsFailed'].map((m) => ({ namespace: 'AWS/SNS', conjunto: 'Topic Metrics', metrica: m, estadistica: 'Sum' })) },
  { id: 'lambda', nombre: 'Lambda', descripcion: 'AWS Lambda', widgets: [['Invocations', 'Sum'], ['Duration', 'Average'], ['Errors', 'Sum'], ['ConcurrentExecutions', 'Maximum']].map(([m, e]) => ({ namespace: 'AWS/Lambda', conjunto: 'By Function Name', metrica: m, estadistica: e })) },
  { id: 'rds', nombre: 'RDS', descripcion: 'Relational Database Service', widgets: ['CPUUtilization', 'DatabaseConnections', 'FreeStorageSpace', 'FreeableMemory'].map((m) => ({ namespace: 'AWS/RDS', conjunto: 'Per-Database Metrics', metrica: m })) },
  { id: 'dynamodb', nombre: 'DynamoDB', descripcion: 'Amazon DynamoDB', widgets: ['ConsumedReadCapacityUnits', 'ConsumedWriteCapacityUnits'].map((m) => ({ namespace: 'AWS/DynamoDB', conjunto: 'Table Metrics', metrica: m, estadistica: 'Sum' })) },
  { id: 'billing', nombre: 'Billing', descripcion: 'Estimated charges', widgets: [{ namespace: 'AWS/Billing', conjunto: 'Total Estimated Charge', metrica: 'EstimatedCharges', estadistica: 'Maximum' }, { namespace: 'AWS/Billing', conjunto: 'By Service', metrica: 'EstimatedCharges', estadistica: 'Maximum' }] }
];

/** Los tableros automáticos que tienen datos (el catálogo se calcula una sola vez). */
const automaticosConDatos = (cx) => {
  const filas = filasCatalogo(cx.estado);
  return AUTOMATICOS.filter((a) => filas.some((f) => a.widgets.some((w) => w.namespace === f.namespace && w.conjunto === f.conjunto)));
};

function tableros(cx) {
  migasCw(cx, { texto: 'Dashboards' });
  const st = { pestana: cx.memoria.cwPestanaTableros ?? 'propios' };
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Dashboards', info: 'cw-tableros', cx }),
    ui.pestanas({
      activa: st.pestana,
      alCambiar: (p) => (cx.memoria.cwPestanaTableros = p),
      pestanas: [
        {
          id: 'propios',
          texto: 'Custom dashboards',
          contenido: () =>
            ui.tabla(cx, {
              titulo: 'Custom dashboards',
              variante: 'contenedor',
              filas: () => cw(cx).tableros,
              clave: (t) => t.nombre,
              seleccion: 'multiple',
              filtro: 'Filter dashboards',
              columnas: [
                { titulo: 'Name', valor: (t) => ui.enlace(t.nombre, rutaTablero(t.nombre), { cx }) },
                { titulo: 'Sharing', valor: () => 'Not shared' },
                { titulo: 'Favorite', valor: () => ui.icono('star') },
                { titulo: 'Widgets', valor: (t) => String(t.widgets.length) },
                { titulo: 'Last updated (UTC)', valor: (t) => fechaUtc(t.modificado) }
              ],
              acciones: (sel) => [
                ui.boton('Delete', { desactivado: !sel.length, escribe: true, alClic: () => borrarTableros(cx, sel.map((t) => t.nombre)) }),
                ui.boton('Create dashboard', { variante: 'primario', alClic: () => modalCrearTablero(cx) })
              ],
              vacio: { titulo: 'No dashboards', texto: 'You haven’t created any dashboards.', accion: ui.boton('Create dashboard', { escribe: true, alClic: () => modalCrearTablero(cx) }) }
            })
        },
        {
          id: 'auto',
          texto: 'Automatic dashboards',
          contenido: () =>
            ui.tabla(cx, {
              titulo: 'Automatic dashboards',
              variante: 'contenedor',
              descripcion: 'CloudWatch creates these dashboards for the AWS services that you use.',
              filas: () => automaticosConDatos(cx),
              clave: (a) => a.id,
              filtro: 'Filter dashboards',
              columnas: [
                { titulo: 'Name', valor: (a) => ui.enlace(a.nombre, `cloudwatch/tableros/auto/${a.id}`, { cx }) },
                { titulo: 'Description', valor: (a) => a.descripcion },
                { titulo: 'Widgets', valor: (a) => String(a.widgets.length) }
              ],
              vacio: { titulo: 'No automatic dashboards', texto: 'Create resources (for example an EC2 instance) and their dashboard appears here.' }
            })
        }
      ]
    })
  );
}

function borrarTableros(cx, nombres) {
  cx.confirmar({
    titulo: 'Delete dashboards',
    textoBoton: 'Delete',
    contenido: h('p', {}, `Are you sure you want to delete ${nombres.length === 1 ? `the dashboard "${nombres[0]}"` : `${nombres.length} dashboards`}? This action cannot be undone.`),
    aceptar: () => {
      const r = cx.hacer({ servicio: 'CloudWatch', accion: 'DeleteDashboards', error: 'Failed to delete dashboards' }, (e) => eliminarTableros(e, nombres));
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: `Successfully deleted ${nombres.length === 1 ? `dashboard ${nombres[0]}` : `${nombres.length} dashboards`}.` });
        cx.ir('cloudwatch/tableros');
      }
      return r.ok;
    }
  });
}

function modalCrearTablero(cx) {
  let nombre = '';
  let error = null;
  const zona = ui.region(() =>
    ui.campo({
      etiqueta: 'Dashboard name',
      control: ui.entrada({ valor: nombre, alCambiar: (v) => (nombre = v), alEnter: () => crear() }),
      restriccion: 'Valid characters in dashboard names include "0-9A-Za-z-_".',
      error
    })
  );
  function crear() {
    const r = cx.hacer({ servicio: 'CloudWatch', accion: 'PutDashboard', error: 'Failed to create dashboard' }, (e) => crearTablero(e, { nombre }), { flash: false });
    if (!r.ok) {
      error = r.error?.message ?? 'Invalid name';
      zona.repintar();
      return;
    }
    m.cerrar();
    cx.ir(rutaTablero(r.valor.nombre));
    modalWidget(cx, r.valor.nombre);
  }
  const m = cx.modal({ titulo: 'Create new dashboard', ancho: 'chico', contenido: zona, pie: [ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }), ui.boton('Create dashboard', { variante: 'primario', alClic: crear })] });
}

const TIPOS_WIDGET = [
  { valor: 'linea', etiqueta: 'Line', descripcion: 'Compare metrics over time' },
  { valor: 'numero', etiqueta: 'Number', descripcion: 'Instantly see the latest value for a metric' },
  { valor: 'texto', etiqueta: 'Text', descripcion: 'Free text with markdown formatting' },
  { valor: 'area', etiqueta: 'Stacked area', descripcion: 'Compare the total over time', desactivado: true },
  { valor: 'barra', etiqueta: 'Bar', descripcion: 'Compare categories of data', desactivado: true },
  { valor: 'pastel', etiqueta: 'Pie', descripcion: 'Proportional data', desactivado: true },
  { valor: 'medidor', etiqueta: 'Gauge', descripcion: 'See a value within a range', desactivado: true },
  { valor: 'logs', etiqueta: 'Logs table', descripcion: 'Explore results from Logs Insights', desactivado: true },
  { valor: 'alarmas', etiqueta: 'Alarm status', descripcion: 'Check status of multiple alarms', desactivado: true }
];

/** «Add widget»: el tipo y luego la métrica (o el texto). */
function modalWidget(cx, nombreTablero) {
  const f = { paso: 0, tipo: 'linea', titulo: '', texto: '# Mi tablero\nEscribe aquí notas para tu equipo.' };
  const st = { ruta: [], busqueda: '', elegidas: new Map() };
  const zona = ui.region(() => {
    if (f.paso === 0) return h('div', { class: 'cx-pagina' }, h('p', { class: 'cx-texto-sec' }, 'Widget type'), ui.tarjetas({ columnas: 3, valor: f.tipo, opciones: TIPOS_WIDGET, alCambiar: (v) => (f.tipo = v) }));
    if (f.tipo === 'texto') {
      return h('div', { class: 'cx-pagina' }, ui.campo({ etiqueta: 'Widget title', opcional: true, control: ui.entrada({ valor: f.titulo, alCambiar: (v) => (f.titulo = v) }) }), ui.campo({ etiqueta: 'Markdown', control: ui.area({ valor: f.texto, filas: 8, monoespaciado: true, alCambiar: (v) => (f.texto = v) }) }));
    }
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.campo({ etiqueta: 'Widget title', opcional: true, control: ui.entrada({ valor: f.titulo, placeholder: 'Untitled graph', alCambiar: (v) => (f.titulo = v) }) }),
      navegadorMetricas(cx, st, {})
    );
  });
  function siguiente() {
    if (f.paso === 0) {
      f.paso = 1;
      zona.repintar();
      pintarPie();
      return;
    }
    const metricas = [...st.elegidas.values()].map((x) => ({ ...x.ref, estadistica: /Count$|^Number|Invocations|Errors/.test(x.ref.metrica) ? 'Sum' : 'Average' }));
    if (f.tipo !== 'texto' && !metricas.length) {
      cx.flash({ tipo: 'error', texto: 'Select at least one metric for the widget.' });
      return;
    }
    const r = cx.hacer({ servicio: 'CloudWatch', accion: 'PutDashboard', error: 'Failed to create widget' }, (e) => agregarWidget(e, nombreTablero, { tipo: f.tipo, titulo: f.titulo, metricas, texto: f.texto }));
    if (r.ok) {
      m.cerrar();
      cx.flash({ tipo: 'exito', texto: `Your dashboard ${nombreTablero} has been saved.` });
      cx.ir(rutaTablero(nombreTablero));
    }
  }
  const pie = h('div', { class: 'cx-acciones' });
  function pintarPie() {
    ui.reemplazar(
      pie,
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      f.paso ? ui.boton('Previous', { alClic: () => ((f.paso = 0), zona.repintar(), pintarPie()) }) : null,
      ui.boton(f.paso ? 'Create widget' : 'Next', { variante: 'primario', alClic: siguiente })
    );
  }
  pintarPie();
  const m = cx.modal({ titulo: 'Add widget', ancho: 'grande', contenido: zona, pie });
}

function tableroPropio(cx, { nombre }) {
  migasCw(cx, { texto: 'Dashboards', ruta: 'cloudwatch/tableros' }, { texto: nombre });
  if (!tableroDe(cx.estado, nombre)) return noExiste(cx, 'Dashboard', nombre, 'cloudwatch/tableros');
  const cuerpo = cx.vivo(() => {
    const t = tableroDe(cx.estado, nombre);
    if (!t) return noExiste(cx, 'Dashboard', nombre, 'cloudwatch/tableros');
    if (!t.widgets.length) {
      return ui.contenedor({ cuerpo: h('div', { class: 'cx-tabla__vacia' }, h('b', {}, 'Start by adding a widget'), h('div', {}, 'Widgets show metrics, logs or text on your dashboard.'), ui.boton('Add widget', { escribe: true, alClic: () => modalWidget(cx, nombre) })) });
    }
    return h('div', { class: 'cx-cw-widgets' }, t.widgets.map((w) => widget(cx, t, w)));
  });
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({
      titulo: nombre,
      info: 'cw-tableros',
      cx,
      acciones: [
        selectorRango(cx, () => cuerpo.repintar()),
        ui.botonRefrescar(() => cuerpo.repintar()),
        ui.menuBoton('Actions', () => [{ texto: 'Delete dashboard', escribe: true, alClic: () => borrarTableros(cx, [nombre]) }, { texto: 'Share dashboard', desactivado: true }, { texto: 'View/edit source', desactivado: true }]),
        ui.boton('Add widget', { variante: 'primario', alClic: () => modalWidget(cx, nombre) })
      ]
    }),
    cuerpo
  );
}

function widget(cx, t, w) {
  const menu = ui.menuBoton('', () => [{ texto: 'Remove', escribe: true, alClic: () => cx.hacer({ servicio: 'CloudWatch', accion: 'PutDashboard', error: 'Failed to remove widget' }, (e) => quitarWidget(e, t.nombre, w.id)) }], { variante: 'icono', alinear: 'derecha' });
  let contenido;
  if (w.tipo === 'texto') contenido = h('div', { class: 'cx-cw-texto-widget' }, markdownSencillo(w.texto));
  else if (w.tipo === 'numero') {
    contenido = h(
      'div',
      { class: 'cx-cw-numeros' },
      w.metricas.map((m) => {
        const serie = serieMetrica(cx.estado, m, { puntos: 3 });
        const ultimo = [...serie].reverse().find((p) => p.v !== null)?.v ?? null;
        return h('div', { class: 'cx-cw-numero' }, h('div', { class: 'cx-texto-sec' }, etiquetaMetrica(m)), h('div', { class: 'cx-cw-cifra' }, numeroCorto(ultimo), h('small', {}, unidadMetrica(m.metrica) === 'Percent' ? ' %' : '')));
      })
    );
  } else contenido = graficaMetricas(cx, w.metricas.map((m) => ({ ...m, etiqueta: etiquetaMetrica(m) })), { ancho: 560, alto: 200 });
  return h('section', { class: 'cx-cw-widget' }, h('div', { class: 'cx-cw-widget__cabeza' }, h('b', {}, w.titulo || (w.tipo === 'texto' ? '' : w.metricas[0]?.metrica ?? 'Untitled graph')), menu), contenido);
}

/** Un markdown muy chico para los widgets de texto: títulos, viñetas y párrafos (sin HTML). */
function markdownSencillo(texto) {
  const lineas = String(texto ?? '').split('\n');
  const nodos = [];
  let lista = null;
  for (const l of lineas) {
    const vineta = /^\s*[-*]\s+(.*)$/.exec(l);
    if (vineta) {
      lista ??= h('ul', {});
      lista.append(h('li', {}, ui.textoRico(vineta[1])));
      continue;
    }
    if (lista) nodos.push(lista), (lista = null);
    const titulo = /^(#{1,3})\s+(.*)$/.exec(l);
    if (titulo) nodos.push(h(titulo[1].length === 1 ? 'h2' : 'h3', { class: titulo[1].length === 1 ? 'cx-h2' : 'cx-h3' }, titulo[2]));
    else if (l.trim()) nodos.push(h('p', {}, ui.textoRico(l)));
  }
  if (lista) nodos.push(lista);
  return nodos;
}

function tableroAutomatico(cx, { id }) {
  const def = AUTOMATICOS.find((a) => a.id === id);
  migasCw(cx, { texto: 'Dashboards', ruta: 'cloudwatch/tableros' }, { texto: def?.nombre ?? id });
  if (!def) return noExiste(cx, 'Dashboard', id, 'cloudwatch/tableros');
  const cuerpo = cx.vivo(() => {
    const filas = filasCatalogo(cx.estado);
    const widgets = def.widgets
      .map((w) => {
        const refs = filas.filter((f) => f.namespace === w.namespace && f.conjunto === w.conjunto && f.metrica === w.metrica).slice(0, 10);
        if (!refs.length) return null;
        return h(
          'section',
          { class: 'cx-cw-widget' },
          h('div', { class: 'cx-cw-widget__cabeza' }, h('b', {}, w.metrica), h('span', { class: 'cx-texto-sec' }, w.estadistica ?? 'Average')),
          graficaMetricas(cx, refs.map((f) => ({ ...f.ref, estadistica: w.estadistica ?? 'Average', etiqueta: Object.values(f.dimensiones).join(' · ') + (f.etiqueta ? ` (${f.etiqueta})` : '') })), { ancho: 560, alto: 200 })
        );
      })
      .filter(Boolean);
    return widgets.length ? h('div', { class: 'cx-cw-widgets' }, widgets) : ui.alerta({ tipo: 'info', contenido: 'No resources of this service send metrics yet.' });
  });
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({
      titulo: def.nombre,
      info: 'cw-tableros',
      cx,
      descripcion: `Automatic dashboard · ${def.descripcion}`,
      acciones: [selectorRango(cx, () => cuerpo.repintar()), ui.botonRefrescar(() => cuerpo.repintar()), ui.boton('Add to dashboard', { desactivado: true })]
    }),
    cuerpo
  );
}

/* ================================================================ alarmas */

function listaAlarmas(cx, { soloAlarma = false } = {}) {
  migasCw(cx, { texto: 'Alarms', ruta: 'cloudwatch/alarmas' }, { texto: soloAlarma ? 'In alarm' : 'All alarms' });
  const st = { estado: soloAlarma ? 'ALARM' : 'todos', ocultarAsg: false };
  const filtros = [
    ui.selector({
      compacto: true,
      valor: st.estado,
      etiquetaAccesible: 'Alarm state',
      opciones: [
        { valor: 'todos', etiqueta: 'Any state' },
        { valor: 'ALARM', etiqueta: 'In alarm' },
        { valor: 'OK', etiqueta: 'OK' },
        { valor: 'INSUFFICIENT_DATA', etiqueta: 'Insufficient data' }
      ],
      alCambiar: (v) => ((st.estado = v), t.actualizar(true))
    }),
    ui.casilla({ etiqueta: 'Hide Auto Scaling alarms', marcada: st.ocultarAsg, alCambiar: (v) => ((st.ocultarAsg = v), t.actualizar(true)) })
  ];
  const t = ui.tabla(cx, {
    titulo: 'Alarms',
    info: 'cw-alarma',
    filas: () => cw(cx).alarmas.filter((a) => (st.estado === 'todos' || a.estado === st.estado) && !(st.ocultarAsg && a.creadaPor === 'autoscaling')),
    clave: (a) => a.nombre,
    seleccion: 'multiple',
    filtro: 'Search',
    antesDelFiltro: h('div', { class: 'cx-cw-filtros' }, filtros),
    columnas: [
      { titulo: 'Name', valor: (a) => ui.enlace(a.nombre, rutaAlarma(a.nombre), { cx }) },
      { titulo: 'State', valor: (a) => estadoAlarma(a.estado), texto: (a) => textoEstadoAlarma(a.estado) },
      { titulo: 'Last state update (UTC)', valor: (a) => fechaUtc(a.desde) },
      { titulo: 'Conditions', valor: (a) => textoCondicion(a) },
      { titulo: 'Actions', valor: (a) => (!Object.values(a.acciones).flat().length ? h('span', { class: 'cx-texto-sec' }, 'No actions') : a.accionesActivas ? ui.estado('exito', 'Actions enabled') : ui.estado('aviso', 'Actions disabled')) }
    ],
    acciones: (sel) => [
      ui.boton('Create composite alarm', { desactivado: true }),
      ui.menuBoton('Actions', () => menuAlarma(cx, sel), { desactivado: !sel.length }),
      ui.boton('Create alarm', { variante: 'primario', alClic: () => cx.ir('cloudwatch/alarmas/crear') })
    ],
    vacio: { titulo: soloAlarma ? 'No alarms in ALARM state' : 'No alarms', texto: soloAlarma ? 'None of your alarms is in ALARM state right now.' : 'You don’t have any alarms yet.', accion: ui.boton('Create alarm', { escribe: true, alClic: () => cx.ir('cloudwatch/alarmas/crear') }) }
  });
  return h('div', { class: 'cx-pagina' }, t);
}

function menuAlarma(cx, sel, { enDetalle = false } = {}) {
  const uno = sel.length === 1 ? sel[0] : null;
  const nombres = sel.map((a) => a.nombre);
  return [
    { texto: 'Edit', escribe: true, desactivado: !uno, alClic: () => cx.ir(`cloudwatch/alarmas/editar/${encodeURIComponent(uno.nombre)}`) },
    { texto: 'Delete', escribe: true, desactivado: !sel.length, alClic: () => borrarAlarmas(cx, nombres, enDetalle) },
    '-',
    { texto: 'Enable actions', escribe: true, desactivado: !sel.some((a) => !a.accionesActivas), alClic: () => accionesAlarmas(cx, nombres, true) },
    { texto: 'Disable actions', escribe: true, desactivado: !sel.some((a) => a.accionesActivas), alClic: () => accionesAlarmas(cx, nombres, false) },
    '-',
    { texto: 'Add to dashboard', escribe: true, desactivado: !uno, alClic: () => alarmaATablero(cx, uno) },
    { texto: 'Create composite alarm', desactivado: true },
    { texto: 'Mute alarms', desactivado: true }
  ];
}

function accionesAlarmas(cx, nombres, activas) {
  const r = cx.hacer({ servicio: 'CloudWatch', accion: activas ? 'EnableAlarmActions' : 'DisableAlarmActions', error: 'Failed to update alarm actions' }, (e) => cambiarAccionesAlarmas(e, nombres, activas));
  if (r.ok) cx.flash({ tipo: 'exito', texto: `Successfully ${activas ? 'enabled' : 'disabled'} actions for ${nombres.length === 1 ? nombres[0] : `${nombres.length} alarms`}.` });
}

function borrarAlarmas(cx, nombres, irALista) {
  const internas = nombres.filter((n) => alarmaDe(cx.estado, n)?.creadaPor === 'autoscaling');
  cx.confirmar({
    titulo: 'Delete alarms',
    textoBoton: 'Delete',
    contenido: [
      h('p', {}, nombres.length === 1 ? `Are you sure you want to delete the alarm "${nombres[0]}"?` : `Are you sure you want to delete these ${nombres.length} alarms?`),
      nombres.length > 1 ? h('ul', {}, nombres.map((n) => h('li', {}, n))) : null,
      internas.length ? ui.alerta({ tipo: 'aviso', titulo: 'These alarms are managed by Auto Scaling', contenido: 'Son las alarmas de una política de target tracking. Si las borras, la política deja de escalar: mejor borra o edita la política en EC2 → Auto Scaling Groups.' }) : null
    ],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'CloudWatch', accion: 'DeleteAlarms', error: 'Failed to delete alarms' }, (e) => eliminarAlarmas(e, nombres));
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: `Successfully deleted ${nombres.length === 1 ? `alarm ${nombres[0]}` : `${nombres.length} alarms`}.` });
        if (irALista) cx.ir('cloudwatch/alarmas');
      }
      return r.ok;
    }
  });
}

function alarmaATablero(cx, a) {
  const tableros = cw(cx).tableros;
  let elegido = tableros[0]?.nombre ?? null;
  let nuevo = '';
  const zona = ui.region(() =>
    h(
      'div',
      { class: 'cx-form' },
      tableros.length
        ? ui.campo({ etiqueta: 'Select a dashboard', control: ui.selector({ valor: elegido, opciones: tableros.map((t) => ({ valor: t.nombre, etiqueta: t.nombre })), alCambiar: (v) => (elegido = v) }) })
        : ui.campo({ etiqueta: 'Create new dashboard', descripcion: 'You don’t have dashboards yet. Write a name for a new one.', control: ui.entrada({ valor: nuevo, alCambiar: (v) => (nuevo = v) }) })
    )
  );
  const m = cx.modal({
    titulo: 'Add to dashboard',
    ancho: 'chico',
    contenido: zona,
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Add to dashboard', {
        variante: 'primario',
        alClic: () => {
          const r = cx.hacer({ servicio: 'CloudWatch', accion: 'PutDashboard', error: 'Failed to add to dashboard' }, (e) => {
            const destino = tableros.length ? elegido : crearTablero(e, { nombre: nuevo }).nombre;
            agregarWidget(e, destino, { tipo: 'linea', titulo: a.nombre, metricas: [refDeAlarma(a)] });
            return destino;
          }, { atomico: true });
          if (r.ok) {
            m.cerrar();
            cx.flash({ tipo: 'exito', texto: `Added ${a.nombre} to dashboard ${r.valor}.`, accion: { texto: 'View dashboard', alClic: () => cx.ir(rutaTablero(r.valor)) } });
          }
        }
      })
    ]
  });
}

/** Describe un ARN de acción como la pestaña Actions del detalle. */
function describirAccion(cx, estadoAlarma2, arn) {
  const cuando = { ALARM: 'alarm', OK: 'OK', INSUFFICIENT_DATA: 'insufficient data' }[estadoAlarma2];
  if (/^arn:aws:sns:/.test(arn)) {
    const tema = arn.split(':').pop();
    const subs = (cx.estado.sns?.temas ?? []).find((t) => t.arn === arn)?.suscripciones ?? [];
    return { tipo: 'Notification', texto: `When in ${cuando}, send message to topic "${tema}"${subs.length ? ` (${subs.map((x) => x.endpoint).join(', ')})` : ''}` };
  }
  if (/^arn:aws:autoscaling:/.test(arn)) {
    const pol = /policyName\/(.+)$/.exec(arn)?.[1] ?? arn;
    const asg = /autoScalingGroupName\/([^:]+)/.exec(arn)?.[1] ?? '';
    return { tipo: 'Auto Scaling', texto: `When in ${cuando}, execute policy "${pol}"${asg ? ` on group ${asg}` : ''}` };
  }
  const ec2 = /ec2:(stop|terminate|reboot|recover)$/.exec(arn);
  if (ec2) return { tipo: 'EC2 action', texto: `When in ${cuando}, ${{ stop: 'stop', terminate: 'terminate', reboot: 'reboot', recover: 'recover' }[ec2[1]]} this instance` };
  if (/^arn:aws:lambda:/.test(arn)) return { tipo: 'Lambda action', texto: `When in ${cuando}, invoke function "${arn.split(':').pop()}"` };
  return { tipo: 'Action', texto: arn };
}

function detalleAlarma(cx, { nombre }) {
  migasCw(cx, { texto: 'Alarms', ruta: 'cloudwatch/alarmas' }, { texto: nombre });
  if (!alarmaDe(cx.estado, nombre)) return noExiste(cx, 'Alarm', nombre, 'cloudwatch/alarmas');
  const st = { pestana: 'detalles' };
  const cabeza = cx.vivo(() => {
    const a = alarmaDe(cx.estado, nombre);
    if (!a) return noExiste(cx, 'Alarm', nombre, 'cloudwatch/alarmas');
    const dims = a.metrica.dimensiones;
    const cargable = a.metrica.namespace === 'AWS/EC2' && (dims.InstanceId || dims.AutoScalingGroupName);
    return [
      ui.encabezado({
        titulo: a.nombre,
        info: 'cw-alarma',
        cx,
        acciones: [
          ui.botonRefrescar(() => cx.refrescar()),
          cargable ? ui.boton('Simular hora pico', { icono: 'zoom-in', escribe: true, titulo: 'Botón del simulador: sube la CPU por un rato', alClic: () => modalCarga(cx, dims) }) : null,
          ui.menuBoton('Actions', () => menuAlarma(cx, [a], { enDetalle: true })),
          ui.boton('Edit', { escribe: true, desactivado: a.creadaPor === 'autoscaling', alClic: () => cx.ir(`cloudwatch/alarmas/editar/${encodeURIComponent(a.nombre)}`) })
        ]
      }),
      a.creadaPor === 'autoscaling'
        ? ui.alerta({ tipo: 'info', titulo: 'Alarma creada por Auto Scaling', contenido: 'Esta alarma la creó una política de target tracking de tu grupo de Auto Scaling. Cuando pasa a In alarm, el grupo agrega (AlarmHigh) o quita (AlarmLow) instancias. No la edites: cambia la política del grupo.' })
        : null,
      ui.contenedor({
        titulo: 'Graph',
        acciones: selectorRango(cx, () => cx.refrescar()),
        cuerpo: h(
          'div',
          {},
          h('div', { class: 'cx-cw-estado-grande' }, estadoAlarma(a.estado), h('span', { class: 'cx-texto-sec' }, `${a.metrica.nombre} ${signoComparacion(a.comparacion)} ${a.umbral} for ${a.puntos} datapoints within ${textoPeriodo(a.periodo * a.evaluaciones)}`)),
          graficaMetricas(cx, [refDeAlarma(a)], { umbral: a.umbral, comparacion: a.comparacion })
        )
      })
    ];
  });
  const pestanas = cx.vivo(() => {
    const a = alarmaDe(cx.estado, nombre);
    if (!a) return null;
    return ui.pestanas({
      activa: st.pestana,
      alCambiar: (p) => ((st.pestana = p), pestanas.repintar()),
      pestanas: [
        {
          id: 'detalles',
          texto: 'Details',
          contenido: () =>
            ui.contenedor({
              titulo: 'Details',
              cuerpo: ui.pares(
                [
                  { etiqueta: 'Name', valor: a.nombre },
                  { etiqueta: 'Type', valor: 'Metric alarm' },
                  { etiqueta: 'Description', valor: a.descripcion || '–' },
                  { etiqueta: 'State', info: 'cw-estados', valor: h('div', {}, estadoAlarma(a.estado), h('div', { class: 'cx-texto-sec' }, a.razon)) },
                  { etiqueta: 'Threshold', valor: textoCondicion(a) },
                  { etiqueta: 'Last state update', valor: fechaUtc(a.desde) },
                  { etiqueta: 'Actions', valor: !Object.values(a.acciones).flat().length ? 'No actions' : a.accionesActivas ? ui.estado('exito', 'Actions enabled') : ui.estado('aviso', 'Actions disabled') },
                  { etiqueta: 'Namespace', valor: a.metrica.namespace },
                  { etiqueta: 'Metric name', valor: a.metrica.nombre },
                  ...Object.entries(a.metrica.dimensiones).map(([k, v]) => ({ etiqueta: k, valor: v })),
                  { etiqueta: 'Statistic', valor: a.estadistica },
                  { etiqueta: 'Period', valor: textoPeriodo(a.periodo) },
                  { etiqueta: 'Datapoints to alarm', valor: `${a.puntos} out of ${a.evaluaciones}` },
                  { etiqueta: 'Missing data treatment', valor: TEXTO_FALTANTES[a.datosFaltantes] },
                  { etiqueta: 'Last value', valor: a.ultimoValor === null ? '–' : numeroCorto(a.ultimoValor) },
                  { etiqueta: 'ARN', valor: ui.copiable(a.arn) }
                ],
                { columnas: 3, cx }
              )
            })
        },
        {
          id: 'acciones',
          texto: 'Actions',
          contenido: () => {
            const filas = Object.entries(a.acciones).flatMap(([e, arns]) => arns.map((arn) => ({ e, arn, ...describirAccion(cx, e, arn) })));
            return ui.tabla(cx, {
              titulo: 'Actions',
              variante: 'contenedor',
              filas: () => filas,
              clave: (x) => `${x.e}|${x.arn}`,
              filtro: false,
              columnas: [
                { titulo: 'Type', valor: (x) => x.tipo },
                { titulo: 'Description', valor: (x) => x.texto },
                { titulo: 'Config', valor: (x) => h('span', { class: ['cx-mono', 'cx-cw-ajustar'] }, x.arn) }
              ],
              vacio: { titulo: 'No actions', texto: 'This alarm doesn’t have actions.' }
            });
          }
        },
        {
          id: 'historial',
          texto: 'History',
          contenido: () =>
            ui.tabla(cx, {
              titulo: 'History',
              variante: 'contenedor',
              filas: () => alarmaDe(cx.estado, nombre)?.historial ?? [],
              clave: (x) => `${x.t}|${x.resumen}`,
              filtro: 'Search history',
              columnas: [
                { titulo: 'Date (UTC)', valor: (x) => fechaUtc(x.t) },
                { titulo: 'Type', valor: (x) => (x.tipo === 'StateUpdate' ? 'State update' : x.tipo === 'Action' ? 'Action' : 'Configuration update') },
                { titulo: 'Description', valor: (x) => h('span', { class: 'cx-cw-ajustar' }, x.ok === false ? ui.estado('error', x.resumen) : x.resumen), texto: (x) => x.resumen }
              ],
              vacio: { titulo: 'No history', texto: 'No history items.' }
            })
        },
        { id: 'padres', texto: 'Parent alarms', contenido: () => ui.contenedor({ titulo: 'Parent alarms', cuerpo: h('p', { class: 'cx-texto-sec' }, 'This alarm is not part of any composite alarm.') }) }
      ]
    });
  });
  return h('div', { class: 'cx-pagina' }, cabeza, pestanas);
}

/** El botón propio del simulador: sube la CPU de la instancia o del grupo un rato. */
function modalCarga(cx, dims) {
  const f = { cpu: '90', minutos: '10' };
  const m = cx.modal({
    titulo: 'Simular hora pico',
    ancho: 'chico',
    contenido: h(
      'div',
      { class: 'cx-form' },
      ui.alerta({ tipo: 'info', contenido: `Botón propio del simulador: durante unos periodos de la métrica (1 o 5 minutos en AWS; cada uno dura 10 s aquí) la CPU de ${dims.InstanceId ? `la instancia ${dims.InstanceId}` : `las instancias del grupo ${dims.AutoScalingGroupName}`} sube al valor que elijas.` }),
      ui.campo({ etiqueta: 'CPU (%)', control: ui.entrada({ tipo: 'number', valor: f.cpu, alCambiar: (v) => (f.cpu = v) }) }),
      ui.campo({ etiqueta: 'Duración (periodos de métrica)', control: ui.entrada({ tipo: 'number', valor: f.minutos, alCambiar: (v) => (f.minutos = v) }) })
    ),
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Simular', {
        variante: 'primario',
        alClic: () => {
          const r = cx.hacer({ servicio: 'Simulador', accion: 'SimulateLoad', error: 'No se pudo simular la carga' }, (e) => simularCarga(e, { instanciaId: dims.InstanceId, asg: dims.InstanceId ? undefined : dims.AutoScalingGroupName, cpu: Number(f.cpu), minutos: Number(f.minutos) }));
          if (r.ok) {
            m.cerrar();
            cx.flash({ tipo: 'info', texto: `Hora pico simulada: CPU al ${f.cpu} % durante ${f.minutos} periodos de métrica (${Number(f.minutos) * 10} s reales). La gráfica sube en el siguiente periodo.` });
          }
        }
      })
    ]
  });
}

/* ======================================================== asistente de alarma */

/** El marco de un asistente: los pasos a la izquierda y el contenido a la derecha. */
function asistente(cx, { pasos, paso, titulo, info, cuerpo, pie }) {
  return h(
    'div',
    { class: 'cx-asis' },
    h(
      'nav',
      { class: 'cx-asis__pasos', 'aria-label': 'Steps' },
      h(
        'ol',
        {},
        pasos.map((p, i) => h('li', { class: ['cx-asis__paso', i === paso && 'cx-asis__paso--actual', i > paso && 'cx-asis__paso--futuro'], 'aria-current': i === paso ? 'step' : undefined }, h('small', {}, `Step ${i + 1}`), h('span', {}, p)))
      )
    ),
    h('div', { class: 'cx-asis__cuerpo cx-pagina' }, ui.encabezado({ titulo, info, cx }), cuerpo, pie)
  );
}

function pieAsistente({ cancelar, anterior, siguiente, textoSiguiente = 'Next' }) {
  return h('div', { class: 'cx-pie-form' }, ui.boton('Cancel', { variante: 'texto', alClic: cancelar }), anterior ? ui.boton('Previous', { alClic: anterior }) : null, ui.boton(textoSiguiente, { variante: 'primario', alClic: siguiente }));
}

const PASOS_ALARMA = ['Specify metric and conditions', 'Configure actions', 'Add name and description', 'Preview and create'];
const TRIGGERS = [
  { valor: 'ALARM', etiqueta: 'In alarm', descripcion: 'The metric or expression is outside of the defined threshold.' },
  { valor: 'OK', etiqueta: 'OK', descripcion: 'The metric or expression is within the defined threshold.' },
  { valor: 'INSUFFICIENT_DATA', etiqueta: 'Insufficient data', descripcion: 'The alarm has just started or not enough data is available.' }
];
const ACCIONES_EC2 = [
  { valor: 'recover', etiqueta: 'Recover this instance' },
  { valor: 'stop', etiqueta: 'Stop this instance' },
  { valor: 'terminate', etiqueta: 'Terminate this instance' },
  { valor: 'reboot', etiqueta: 'Reboot this instance' }
];

const temas = (cx) => cx.estado.sns?.temas ?? [];
const gruposAsg = (cx) => cx.estado.autoscaling?.grupos ?? [];
const funcionesLambda = (cx) => cx.estado.lambda?.funciones ?? [];
const arnLambda = (cx, f) => f.arn ?? `arn:aws:lambda:us-east-1:${cx.estado.cuenta.id}:function:${f.nombre}`;
const correoValido = (c) => /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(c);

/** El formulario vacío o el de una alarma existente (Edit). */
function formularioAlarma(cx, a) {
  const f = {
    paso: 0,
    metrica: null,
    etiqueta: '',
    estadistica: 'Average',
    periodo: 300,
    comparacion: 'GreaterThanThreshold',
    umbral: '',
    puntos: '1',
    evaluaciones: '1',
    datosFaltantes: 'missing',
    notificaciones: [{ estado: 'ALARM', modo: 'existente', tema: null, nuevoNombre: 'Default_CloudWatch_Alarms_Topic', correos: '', arn: '' }],
    autoscaling: [],
    ec2: [],
    lambdas: [],
    nombre: '',
    descripcion: '',
    temasNuevos: []
  };
  const pre = cx.memoria.cwAlarmaMetrica;
  if (!a && pre) {
    f.metrica = { namespace: pre.namespace, metrica: pre.metrica, dimensiones: pre.dimensiones ?? {} };
    f.estadistica = pre.estadistica ?? 'Average';
    delete cx.memoria.cwAlarmaMetrica;
  }
  if (!a) return f;
  Object.assign(f, {
    metrica: { namespace: a.metrica.namespace, metrica: a.metrica.nombre, dimensiones: { ...a.metrica.dimensiones } },
    estadistica: a.estadistica,
    periodo: a.periodo,
    comparacion: a.comparacion,
    umbral: String(a.umbral),
    puntos: String(a.puntos),
    evaluaciones: String(a.evaluaciones),
    datosFaltantes: a.datosFaltantes,
    nombre: a.nombre,
    descripcion: a.descripcion,
    notificaciones: []
  });
  for (const [estado, arns] of Object.entries(a.acciones)) {
    for (const arn of arns) {
      if (/^arn:aws:sns:/.test(arn)) f.notificaciones.push({ estado, modo: temas(cx).some((t) => t.arn === arn) ? 'existente' : 'arn', tema: arn, nuevoNombre: '', correos: '', arn });
      else if (/^arn:aws:autoscaling:/.test(arn)) f.autoscaling.push({ estado, asg: gruposAsg(cx).find((g) => (g.politicas ?? []).some((p) => p.arn === arn))?.nombre ?? null, politica: arn });
      else if (/ec2:(stop|terminate|reboot|recover)$/.test(arn)) f.ec2.push({ estado, accion: arn.split(':').pop() });
      else if (/^arn:aws:lambda:/.test(arn)) f.lambdas.push({ estado, funcion: arn });
    }
  }
  return f;
}

/** Las acciones del formulario como { ALARM: [arn], OK: [], INSUFFICIENT_DATA: [] }. */
function accionesDe(cx, f) {
  const acc = { ALARM: [], OK: [], INSUFFICIENT_DATA: [] };
  for (const n of f.notificaciones) {
    const arn = n.modo === 'arn' ? n.arn.trim() : n.tema;
    if (arn) acc[n.estado].push(arn);
  }
  for (const x of f.autoscaling) if (x.politica) acc[x.estado].push(x.politica);
  for (const x of f.ec2) acc[x.estado].push(`arn:aws:automate:us-east-1:ec2:${x.accion}`);
  for (const x of f.lambdas) if (x.funcion) acc[x.estado].push(x.funcion);
  return acc;
}

function datosDe(cx, f) {
  return {
    nombre: f.nombre,
    descripcion: f.descripcion,
    metrica: { namespace: f.metrica?.namespace, nombre: f.metrica?.metrica, dimensiones: f.metrica?.dimensiones },
    estadistica: f.estadistica,
    periodo: f.periodo,
    comparacion: f.comparacion,
    umbral: f.umbral === '' ? '' : Number(f.umbral),
    puntos: Number(f.puntos),
    evaluaciones: Number(f.evaluaciones),
    datosFaltantes: f.datosFaltantes,
    acciones: accionesDe(cx, f)
  };
}

function crearAlarmaPagina(cx, { nombre } = {}) {
  const editando = nombre !== undefined;
  migasCw(cx, { texto: 'Alarms', ruta: 'cloudwatch/alarmas' }, ...(editando ? [{ texto: nombre, ruta: rutaAlarma(nombre) }, { texto: 'Edit' }] : [{ texto: 'Create alarm' }]));
  const original = editando ? alarmaDe(cx.estado, nombre) : null;
  if (editando && !original) return noExiste(cx, 'Alarm', nombre, 'cloudwatch/alarmas');
  if (original?.creadaPor === 'autoscaling') {
    return h('div', { class: 'cx-pagina' }, ui.alerta({ tipo: 'aviso', titulo: 'This alarm is managed by Auto Scaling', contenido: ['No se puede editar: la creó una política de target tracking. Cambia la política en EC2 → Auto Scaling Groups → Automatic scaling. ', ui.enlace('Back to alarm', rutaAlarma(nombre), { cx })] }));
  }
  const f = formularioAlarma(cx, original);
  const errores = {};

  const zona = ui.region(() => {
    const cuerpo = [pasoMetrica, pasoAcciones, pasoNombre, pasoRevision][f.paso]();
    return asistente(cx, {
      pasos: PASOS_ALARMA,
      paso: f.paso,
      titulo: PASOS_ALARMA[f.paso],
      info: ['cw-alarma', 'cw-acciones', 'cw-alarma', 'cw-alarma'][f.paso],
      cuerpo,
      pie: pieAsistente({
        cancelar: () => cx.ir(editando ? rutaAlarma(nombre) : 'cloudwatch/alarmas'),
        anterior: f.paso > 0 ? () => cambiarPaso(f.paso - 1) : null,
        siguiente: f.paso < 3 ? siguiente : guardar,
        textoSiguiente: f.paso < 3 ? 'Next' : editando ? 'Update alarm' : 'Create alarm'
      })
    });
  });
  const repintar = () => zona.repintar();
  // Al cambiar de paso, la página vuelve arriba (como la consola).
  const cambiarPaso = (p) => {
    f.paso = p;
    repintar();
    zona.closest('.cx-principal')?.scrollTo?.(0, 0);
  };

  /* --- paso 1 --- */
  function pasoMetrica() {
    const elegir = () => modalElegirMetrica(cx, { alElegir: (x) => ((f.metrica = { ...x.ref }), (f.etiqueta = x.etiqueta ?? ''), (errores.metrica = null), repintar()) });
    const grafica2 = f.metrica
      ? cx.vivo(() => graficaMetricas(cx, [{ ...f.metrica, estadistica: f.estadistica, etiqueta: f.metrica.metrica }], { umbral: f.umbral === '' || Number.isNaN(Number(f.umbral)) ? null : Number(f.umbral), comparacion: f.comparacion, alto: 200 }))
      : null;
    const metrica = ui.contenedor({
      titulo: 'Metric',
      info: 'cw-metricas',
      cx,
      acciones: f.metrica ? ui.boton('Edit', { alClic: elegir }) : null,
      cuerpo: f.metrica
        ? h(
            'div',
            { class: 'cx-pagina' },
            grafica2,
            h('p', { class: 'cx-texto-sec' }, 'This alarm will trigger when the line is in the red area for the datapoints you set below.'),
            h(
              'div',
              { class: 'cx-form' },
              ui.campo({ etiqueta: 'Namespace', control: ui.entrada({ valor: f.metrica.namespace, desactivado: true }) }),
              ui.campo({ etiqueta: 'Metric name', control: ui.entrada({ valor: f.metrica.metrica, desactivado: true }) }),
              Object.entries(f.metrica.dimensiones).map(([k, v]) => ui.campo({ etiqueta: k, control: ui.entrada({ valor: v, desactivado: true }) })),
              ui.campo({ etiqueta: 'Statistic', control: ui.selector({ valor: f.estadistica, opciones: ESTADISTICAS.map((x) => ({ valor: x, etiqueta: x })), alCambiar: (v) => ((f.estadistica = v), repintar()) }) }),
              ui.campo({ etiqueta: 'Period', info: 'cw-tiempo', cx, control: ui.selector({ valor: f.periodo, opciones: PERIODOS.map(([v, t]) => ({ valor: v, etiqueta: t })), alCambiar: (v) => (f.periodo = Number(v)) }) })
            )
          )
        : h('div', { class: 'cx-cw-sin-metrica' }, h('p', { class: 'cx-texto-sec' }, 'Graph'), h('p', {}, 'Preview of the metric or metric expression and the alarm threshold.'), ui.boton('Select metric', { alClic: elegir }), errores.metrica ? h('div', { class: 'cx-campo__error', role: 'alert' }, ui.icono('status-negative'), h('span', {}, errores.metrica)) : null)
    });
    if (!f.metrica) return metrica;
    const condiciones = ui.contenedor({
      titulo: 'Conditions',
      info: 'cw-condiciones',
      cx,
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({
          etiqueta: 'Threshold type',
          control: ui.tarjetas({
            columnas: 2,
            valor: 'estatico',
            opciones: [
              { valor: 'estatico', etiqueta: 'Static', descripcion: 'Use a value as a threshold' },
              { valor: 'anomalia', etiqueta: 'Anomaly detection', descripcion: 'Use a band as a threshold', desactivado: true }
            ]
          })
        }),
        ui.campo({
          etiqueta: `Whenever ${f.metrica.metrica} is...`,
          descripcion: 'Define the alarm condition.',
          control: ui.radios({ horizontal: true, valor: f.comparacion, opciones: COMPARACIONES_ALARMA.slice().sort((x, y) => ['GreaterThanThreshold', 'GreaterThanOrEqualToThreshold', 'LessThanOrEqualToThreshold', 'LessThanThreshold'].indexOf(x) - ['GreaterThanThreshold', 'GreaterThanOrEqualToThreshold', 'LessThanOrEqualToThreshold', 'LessThanThreshold'].indexOf(y)).map((c) => ({ valor: c, etiqueta: TEXTO_COMPARACION[c][0], descripcion: TEXTO_COMPARACION[c][1] })), alCambiar: (v) => ((f.comparacion = v), repintar()) })
        }),
        ui.campo({
          etiqueta: 'than...',
          descripcion: 'Define the threshold value.',
          control: ui.entrada({ valor: f.umbral, placeholder: 'Use a number', alCambiar: (v) => (f.umbral = v.trim()), alEnter: () => repintar() }),
          restriccion: 'Must be a number',
          error: errores.umbral
        }),
        ui.expandible({
          titulo: 'Additional configuration',
          abierto: f.puntos !== '1' || f.evaluaciones !== '1' || f.datosFaltantes !== 'missing',
          contenido: h(
            'div',
            { class: 'cx-form' },
            ui.campo({
              etiqueta: 'Datapoints to alarm',
              info: 'cw-condiciones',
              cx,
              descripcion: 'Define the number of datapoints within the evaluation period that must be breaching to cause the alarm to go to ALARM state.',
              control: h('div', { class: 'cx-cw-de' }, ui.entrada({ tipo: 'number', valor: f.puntos, etiquetaAccesible: 'Datapoints', alCambiar: (v) => (f.puntos = v) }), h('span', {}, 'out of'), ui.entrada({ tipo: 'number', valor: f.evaluaciones, etiquetaAccesible: 'Evaluation periods', alCambiar: (v) => (f.evaluaciones = v) })),
              error: errores.puntos
            }),
            ui.campo({
              etiqueta: 'Missing data treatment',
              info: 'cw-datos-faltantes',
              cx,
              descripcion: 'How to treat missing data when evaluating the alarm.',
              control: ui.selector({ valor: f.datosFaltantes, opciones: Object.entries(TEXTO_FALTANTES).map(([v, t]) => ({ valor: v, etiqueta: t })), alCambiar: (v) => (f.datosFaltantes = v) })
            })
          )
        })
      )
    });
    return [metrica, condiciones];
  }

  /* --- paso 2 --- */
  function seccion(titulo, quitar, cuerpo) {
    return ui.contenedor({ titulo, acciones: ui.boton('Remove', { alClic: quitar }), cuerpo: h('div', { class: 'cx-form' }, cuerpo) });
  }
  const trigger = (x) => ui.campo({ etiqueta: 'Alarm state trigger', descripcion: 'Define the alarm state that will trigger this action.', control: ui.tarjetas({ columnas: 3, valor: x.estado, opciones: TRIGGERS, alCambiar: (v) => (x.estado = v) }) });

  function notificacion(n, i) {
    const lista = temas(cx);
    const tema = lista.find((t) => t.arn === n.tema);
    const correos = (tema?.suscripciones ?? []).filter((s2) => /^email/.test(s2.protocolo));
    let detalle;
    if (n.modo === 'existente') {
      detalle = [
        ui.campo({
          etiqueta: 'Send a notification to...',
          control: ui.selector({ valor: n.tema, placeholder: 'Select an SNS topic', filtrar: true, vacio: 'No SNS topics. Choose «Create new topic».', opciones: lista.map((t) => ({ valor: t.arn, etiqueta: t.nombre, descripcion: t.arn })), alCambiar: (v) => ((n.tema = v), repintar()) }),
          descripcion: 'Only email lists for this account are available.',
          error: errores[`sns${i}`]
        }),
        tema ? ui.campo({ etiqueta: 'Email (endpoints)', control: correos.length ? h('ul', { class: 'cx-cw-correos' }, correos.map((s2) => h('li', {}, s2.endpoint, ' ', s2.estado === 'Confirmed' ? null : h('span', { class: 'cx-texto-sec' }, '(Pending confirmation)')))) : h('span', { class: 'cx-texto-sec' }, 'This topic has no email subscriptions.') }) : null
      ];
    } else if (n.modo === 'nuevo') {
      detalle = [
        ui.campo({ etiqueta: 'Create a new topic...', descripcion: 'The topic name must be unique.', control: ui.entrada({ valor: n.nuevoNombre, alCambiar: (v) => (n.nuevoNombre = v) }), restriccion: 'SNS topic names can contain only alphanumeric characters, hyphens (-) and underscores (_).', error: errores[`sns${i}`] }),
        ui.campo({ etiqueta: 'Email endpoints that will receive the notification...', descripcion: 'Add a comma-separated list of email addresses. Each address will be added as a subscription to the topic above.', control: ui.entrada({ valor: n.correos, placeholder: 'user1@example.com, user2@example.com', alCambiar: (v) => (n.correos = v) }), error: errores[`correo${i}`] }),
        ui.boton('Create topic', { escribe: true, alClic: () => crearTemaNuevo(n, i) })
      ];
    } else {
      detalle = ui.campo({ etiqueta: 'Topic ARN', control: ui.entrada({ valor: n.arn, placeholder: 'arn:aws:sns:us-east-1:123456789012:my-topic', alCambiar: (v) => (n.arn = v) }), error: errores[`sns${i}`] });
    }
    return seccion('Notification', () => (f.notificaciones.splice(i, 1), repintar()), [
      trigger(n),
      ui.campo({
        etiqueta: 'Send a notification to the following SNS topic',
        info: 'cw-sns',
        cx,
        descripcion: 'Define the SNS (Simple Notification Service) topic that will receive the notification.',
        control: ui.radios({
          valor: n.modo,
          opciones: [
            { valor: 'existente', etiqueta: 'Select an existing SNS topic' },
            { valor: 'nuevo', etiqueta: 'Create new topic' },
            { valor: 'arn', etiqueta: 'Use topic ARN to notify other accounts' }
          ],
          alCambiar: (v) => ((n.modo = v), repintar())
        })
      }),
      detalle
    ]);
  }

  function crearTemaNuevo(n, i) {
    const lista = n.correos.split(',').map((c) => c.trim()).filter(Boolean);
    errores[`sns${i}`] = n.nuevoNombre.trim() ? null : 'Topic name is required.';
    errores[`correo${i}`] = !lista.length ? 'Enter at least one email address.' : lista.find((c) => !correoValido(c)) ? `Invalid email address: ${lista.find((c) => !correoValido(c))}` : null;
    if (errores[`sns${i}`] || errores[`correo${i}`]) return repintar();
    if (!modelo.crearTema || !modelo.crearSuscripcion) {
      cx.flash({ tipo: 'error', texto: 'Amazon SNS todavía no está disponible en este simulador.' });
      return;
    }
    const r = cx.hacer(
      { servicio: 'SNS', accion: 'CreateTopic', error: 'Failed to create topic' },
      (e) => {
        const t = modelo.crearTema(e, { nombre: n.nuevoNombre.trim() });
        for (const c of lista) modelo.crearSuscripcion(e, { temaArn: t.arn, protocolo: 'email', endpoint: c });
        return t;
      },
      { atomico: true }
    );
    if (!r.ok) return;
    f.temasNuevos.push(r.valor.arn);
    Object.assign(n, { modo: 'existente', tema: r.valor.arn });
    cx.flash({ tipo: 'exito', texto: `Successfully created topic ${r.valor.nombre}. A confirmation email was sent to ${lista.join(', ')}.` });
    repintar();
  }

  function accionAsg(x, i) {
    const grupos = gruposAsg(cx);
    const g = grupos.find((y) => y.nombre === x.asg);
    const politicas = (g?.politicas ?? []).filter((p) => p.tipo !== 'TargetTrackingScaling');
    const describir = (p) => (p.tipo === 'SimpleScaling' ? `${p.ajuste === 'ExactCapacity' ? 'Set to' : p.valor >= 0 ? 'Add' : 'Remove'} ${Math.abs(p.valor)} ${p.ajuste === 'PercentChangeInCapacity' ? 'percent of group' : 'capacity units'}` : 'Step scaling');
    return seccion('Auto Scaling action', () => (f.autoscaling.splice(i, 1), repintar()), [
      trigger(x),
      ui.campo({ etiqueta: 'Resource type', control: ui.radios({ horizontal: true, valor: 'asg', opciones: [{ valor: 'asg', etiqueta: 'EC2 Auto Scaling group' }, { valor: 'ecs', etiqueta: 'ECS service', desactivado: true }] }) }),
      ui.campo({ etiqueta: 'Select a group', control: ui.selector({ valor: x.asg, placeholder: 'Select a group', vacio: 'No Auto Scaling groups', opciones: grupos.map((y) => ({ valor: y.nombre, etiqueta: y.nombre })), alCambiar: (v) => ((x.asg = v), (x.politica = null), repintar()) }) }),
      x.asg
        ? ui.campo({
            etiqueta: 'Take the following action...',
            descripcion: politicas.length ? null : 'This group has no simple or step scaling policies. Create one in EC2 → Auto Scaling Groups → Automatic scaling (target tracking policies create their own alarms).',
            control: ui.selector({ valor: x.politica, placeholder: 'Select an action', vacio: 'No scaling policies', opciones: politicas.map((p) => ({ valor: p.arn, etiqueta: `${p.nombre} (${describir(p)})` })), alCambiar: (v) => (x.politica = v) }),
            error: errores[`asg${i}`]
          })
        : null
    ]);
  }

  function accionEc2(x, i) {
    return seccion('EC2 action', () => (f.ec2.splice(i, 1), repintar()), [trigger(x), ui.campo({ etiqueta: 'Take the following action...', control: ui.radios({ valor: x.accion, opciones: ACCIONES_EC2, alCambiar: (v) => (x.accion = v) }) })]);
  }

  function accionLambda(x, i) {
    return seccion('Lambda action', () => (f.lambdas.splice(i, 1), repintar()), [
      trigger(x),
      ui.campo({ etiqueta: 'Select a function from this account', control: ui.selector({ valor: x.funcion, placeholder: 'Select a function', vacio: 'No functions', filtrar: true, opciones: funcionesLambda(cx).map((fn) => ({ valor: arnLambda(cx, fn), etiqueta: fn.nombre })), alCambiar: (v) => (x.funcion = v) }), error: errores[`lambda${i}`] })
    ]);
  }

  function pasoAcciones() {
    const porInstancia = Boolean(f.metrica?.dimensiones?.InstanceId);
    const agregar = (texto, lista, nuevo, op = {}) => ui.boton(texto, { desactivado: op.desactivado, alClic: () => (lista.push(nuevo()), repintar()) });
    return [
      ...f.notificaciones.map(notificacion),
      ui.contenedor({ titulo: f.notificaciones.length ? null : 'Notification', cuerpo: agregar('Add notification', f.notificaciones, () => ({ estado: 'ALARM', modo: temas(cx).length ? 'existente' : 'nuevo', tema: null, nuevoNombre: 'Default_CloudWatch_Alarms_Topic', correos: '', arn: '' })) }),
      ...f.lambdas.map(accionLambda),
      ui.contenedor({ titulo: f.lambdas.length ? null : 'Lambda action', cuerpo: agregar('Add Lambda action', f.lambdas, () => ({ estado: 'ALARM', funcion: null })) }),
      ...f.autoscaling.map(accionAsg),
      ui.contenedor({ titulo: f.autoscaling.length ? null : 'Auto Scaling action', cuerpo: agregar('Add Auto Scaling action', f.autoscaling, () => ({ estado: 'ALARM', asg: null, politica: null })) }),
      ...f.ec2.map(accionEc2),
      ui.contenedor({
        titulo: f.ec2.length ? null : 'EC2 action',
        cuerpo: h('div', { class: 'cx-form' }, agregar('Add EC2 action', f.ec2, () => ({ estado: 'ALARM', accion: 'stop' }), { desactivado: !porInstancia }), porInstancia ? null : h('p', { class: 'cx-texto-sec' }, 'This action is only available for EC2 Per-Instance Metrics.'))
      }),
      ui.contenedor({ titulo: 'Systems Manager action', cuerpo: ui.boton('Add Systems Manager action', { desactivado: true }) }),
      ui.contenedor({ titulo: 'Investigation action', cuerpo: ui.boton('Add investigation action', { desactivado: true }) })
    ];
  }

  /* --- paso 3 --- */
  function pasoNombre() {
    const contador = h('span', {}, `${f.descripcion.length}/1024`);
    return ui.contenedor({
      titulo: 'Name and description',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({ etiqueta: 'Alarm name', control: ui.entrada({ valor: f.nombre, desactivado: editando, alCambiar: (v) => (f.nombre = v) }), error: errores.nombre }),
        ui.campo({
          etiqueta: 'Alarm description',
          opcional: true,
          descripcion: 'You can use Markdown to format the description. It appears in the alarm Details tab.',
          control: ui.area({ valor: f.descripcion, filas: 5, placeholder: 'Alarm description', alCambiar: (v) => ((f.descripcion = v.slice(0, 1024)), (contador.textContent = `${f.descripcion.length}/1024`)) }),
          restriccion: h('span', {}, 'Up to 1024 characters (', contador, ')')
        })
      )
    });
  }

  /* --- paso 4 --- */
  function pasoRevision() {
    const d = datosDe(cx, f);
    const editar = (p) => ui.boton('Edit', { alClic: () => cambiarPaso(p) });
    const acciones = Object.entries(d.acciones).flatMap(([e, arns]) => arns.map((arn) => describirAccion(cx, e, arn)));
    return [
      ui.contenedor({
        titulo: 'Step 1: Specify metric and conditions',
        acciones: editar(0),
        cuerpo: h(
          'div',
          { class: 'cx-pagina' },
          cx.vivo(() => graficaMetricas(cx, [{ ...f.metrica, estadistica: f.estadistica, etiqueta: f.metrica.metrica }], { umbral: Number(f.umbral), comparacion: f.comparacion, alto: 200 })),
          ui.pares(
            [
              { etiqueta: 'Namespace', valor: f.metrica.namespace },
              { etiqueta: 'Metric name', valor: f.metrica.metrica },
              ...Object.entries(f.metrica.dimensiones).map(([k, v]) => ({ etiqueta: k, valor: v })),
              { etiqueta: 'Statistic', valor: f.estadistica },
              { etiqueta: 'Period', valor: textoPeriodo(f.periodo) },
              { etiqueta: 'Threshold type', valor: 'Static' },
              { etiqueta: `Whenever ${f.metrica.metrica} is...`, valor: `${TEXTO_COMPARACION[f.comparacion][0]} (${signoComparacion(f.comparacion)}) than ${f.umbral}` },
              { etiqueta: 'Datapoints to alarm', valor: `${f.puntos} out of ${f.evaluaciones}` },
              { etiqueta: 'Missing data treatment', valor: TEXTO_FALTANTES[f.datosFaltantes] }
            ],
            { columnas: 3 }
          )
        )
      }),
      ui.contenedor({
        titulo: 'Step 2: Configure actions',
        acciones: editar(1),
        cuerpo: acciones.length ? h('ul', { class: 'cx-cw-lista-acciones' }, acciones.map((x) => h('li', {}, h('b', {}, `${x.tipo}: `), x.texto))) : h('p', { class: 'cx-texto-sec' }, 'No actions configured.')
      }),
      ui.contenedor({ titulo: 'Step 3: Add name and description', acciones: editar(2), cuerpo: ui.pares([{ etiqueta: 'Name', valor: f.nombre.trim() }, { etiqueta: 'Description', valor: f.descripcion || '–' }], { columnas: 2 }) })
    ];
  }

  /* --- navegación --- */
  function siguiente() {
    for (const k of Object.keys(errores)) errores[k] = null;
    if (f.paso === 0) {
      if (!f.metrica) {
        errores.metrica = 'You must select a metric.';
        return repintar();
      }
      if (f.umbral === '' || !Number.isFinite(Number(f.umbral))) errores.umbral = f.umbral === '' ? 'Threshold is required.' : 'The threshold must be a number.';
      const p = Number(f.puntos);
      const n = Number(f.evaluaciones);
      if (!Number.isInteger(p) || !Number.isInteger(n) || p < 1 || n < 1) errores.puntos = 'Datapoints to alarm must be a whole number greater than 0.';
      else if (p > n) errores.puntos = 'Datapoints to alarm must be less than or equal to the evaluation period.';
      if (errores.umbral || errores.puntos) return repintar();
    }
    if (f.paso === 1) {
      f.notificaciones.forEach((n, i) => {
        if (n.modo === 'existente' && !n.tema) errores[`sns${i}`] = 'Select an SNS topic.';
        if (n.modo === 'nuevo') errores[`sns${i}`] = 'Choose «Create topic» to create the topic before you continue.';
        if (n.modo === 'arn' && !/^arn:aws:sns:[a-z0-9-]+:\d{12}:[\w-]+(\.fifo)?$/.test(n.arn.trim())) errores[`sns${i}`] = 'Enter a valid SNS topic ARN.';
      });
      f.autoscaling.forEach((x, i) => {
        if (!x.politica) errores[`asg${i}`] = 'Select a scaling policy.';
      });
      f.lambdas.forEach((x, i) => {
        if (!x.funcion) errores[`lambda${i}`] = 'Select a function.';
      });
      if (Object.values(errores).some(Boolean)) return repintar();
      const hay = Object.values(accionesDe(cx, f)).flat().length;
      if (!hay) {
        cx.confirmar({
          titulo: 'Proceed without actions?',
          textoBoton: 'Proceed without actions',
          contenido: h('p', {}, 'You haven’t configured any actions for this alarm. Without actions, you won’t be notified and nothing happens automatically when the alarm changes state.'),
          aceptar: () => cambiarPaso(2)
        });
        return;
      }
    }
    if (f.paso === 2) {
      const n = f.nombre.trim();
      if (!n) errores.nombre = 'Alarm name is required.';
      else if (n.length > 255) errores.nombre = 'Alarm name must be 255 characters or fewer.';
      else if (!editando && alarmaDe(cx.estado, n)) errores.nombre = 'An alarm with this name already exists.';
      if (errores.nombre) return repintar();
    }
    cambiarPaso(f.paso + 1);
  }

  function guardar() {
    const d = datosDe(cx, f);
    const r = editando
      ? cx.hacer({ servicio: 'CloudWatch', accion: 'PutMetricAlarm', error: 'Failed to update alarm' }, (e) => editarAlarma(e, nombre, d))
      : cx.hacer({ servicio: 'CloudWatch', accion: 'PutMetricAlarm', error: 'Failed to create alarm' }, (e) => crearAlarma(e, d));
    if (!r.ok) return;
    cx.flash({ tipo: 'exito', texto: editando ? `Successfully updated alarm ${r.valor.nombre}.` : `Successfully created alarm ${r.valor.nombre}.`, accion: { texto: 'View alarm', alClic: () => cx.ir(rutaAlarma(r.valor.nombre)) } });
    const pendientes = d.acciones.ALARM.concat(d.acciones.OK, d.acciones.INSUFFICIENT_DATA)
      .map((arn) => temas(cx).find((t) => t.arn === arn))
      .filter(Boolean)
      .some((t) => t.suscripciones.some((x) => /^email/.test(x.protocolo) && x.estado !== 'Confirmed'));
    if (pendientes) {
      cx.flash({ tipo: 'info', titulo: 'Some subscriptions are pending confirmation', texto: 'Amazon SNS doesn’t send messages to an endpoint until the subscription is confirmed. Abre la bandeja de correo simulada (en SNS) y confirma la suscripción.', accion: { texto: 'View SNS Subscriptions', alClic: () => cx.ir('sns') } });
    }
    cx.ir('cloudwatch/alarmas');
  }

  return zona;
}

/* ============================================================ All metrics */

function todasMetricas(cx) {
  migasCw(cx, { texto: 'Metrics' }, { texto: 'All metrics' });
  const st = cx.memoria.cwMetricas ?? { ruta: [], busqueda: '', elegidas: new Map(), estadisticas: {} };
  cx.memoria.cwMetricas = st;
  const st2 = { pestana: 'browse' };
  const grafica2 = cx.vivo(() => {
    const refs = [...st.elegidas.entries()].map(([k, x]) => ({ ...x.ref, estadistica: st.estadisticas[k] ?? 'Average', etiqueta: etiquetaMetrica(x.ref, x.etiqueta) }));
    return graficaMetricas(cx, refs);
  });
  const pestanas = ui.region(() =>
    ui.pestanas({
      activa: st2.pestana,
      alCambiar: (p) => ((st2.pestana = p), pestanas.repintar()),
      pestanas: [
        {
          id: 'browse',
          texto: 'Browse',
          contenido: () =>
            navegadorMetricas(cx, st, {
              alCambiar: () => {
                grafica2.repintar();
                // El contador de la pestaña «Graphed metrics» sin reconstruir el navegador.
                const p = [...pestanas.querySelectorAll('[role=tab]')].find((b) => b.textContent.startsWith('Graphed metrics'));
                if (p) p.textContent = `Graphed metrics (${st.elegidas.size})`;
              }
            })
        },
        { id: 'query', texto: 'Query', desactivada: true, contenido: () => null },
        { id: 'graficadas', texto: `Graphed metrics (${st.elegidas.size})`, contenido: () => graficadas() },
        { id: 'opciones', texto: 'Options', desactivada: true, contenido: () => null },
        { id: 'fuente', texto: 'Source', desactivada: true, contenido: () => null }
      ]
    })
  );
  function graficadas() {
    const filas = [...st.elegidas.entries()].map(([clave, x], i) => ({ clave, ...x, i }));
    return ui.tabla(cx, {
      variante: 'simple',
      filas: () => filas,
      clave: (x) => x.clave,
      filtro: false,
      columnas: [
        { titulo: 'Label', valor: (x) => h('span', { class: 'cx-cw-leyenda__item' }, h('span', { class: 'cx-cw-muestra', style: { background: colorSerie(x.i) } }), etiquetaMetrica(x.ref, x.etiqueta)) },
        { titulo: 'Details', valor: (x) => h('span', { class: 'cx-mono' }, `${x.ref.namespace} • ${x.ref.metrica}${Object.entries(x.ref.dimensiones).map(([k, v]) => ` • ${k}: ${v}`).join('')}`) },
        { titulo: 'Statistic', valor: (x) => ui.selector({ compacto: true, valor: st.estadisticas[x.clave] ?? 'Average', opciones: ESTADISTICAS.map((e) => ({ valor: e, etiqueta: e })), alCambiar: (v) => ((st.estadisticas[x.clave] = v), grafica2.repintar()) }) },
        { titulo: 'Period', valor: () => '5 minutes' },
        {
          titulo: 'Actions',
          valor: (x) =>
            h(
              'span',
              { class: 'cx-acciones' },
              ui.boton('', { variante: 'icono', icono: 'notification', titulo: 'Create alarm', alClic: () => ((cx.memoria.cwAlarmaMetrica = { ...x.ref, estadistica: st.estadisticas[x.clave] ?? 'Average' }), cx.ir('cloudwatch/alarmas/crear')) }),
              ui.boton('', { variante: 'icono', icono: 'close', titulo: 'Remove', alClic: () => (st.elegidas.delete(x.clave), grafica2.repintar(), pestanas.repintar()) })
            )
        }
      ],
      vacio: { titulo: 'No metrics graphed', texto: 'Select metrics in the Browse tab.' }
    });
  }
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.contenedor({
      titulo: 'Untitled graph',
      info: 'cw-metricas',
      cx,
      acciones: [selectorRango(cx, () => grafica2.repintar()), ui.botonRefrescar(() => grafica2.repintar()), ui.menuBoton('Actions', () => [{ texto: 'Add to dashboard', escribe: true, desactivado: !st.elegidas.size, alClic: () => metricasATablero(cx, st) }, { texto: 'Share', desactivado: true }, { texto: 'Download as .csv', desactivado: true }])],
      cuerpo: grafica2
    }),
    ui.contenedor({ cuerpo: pestanas })
  );
}

function metricasATablero(cx, st) {
  const tableros = cw(cx).tableros;
  if (!tableros.length) {
    cx.flash({ tipo: 'info', texto: 'Create a dashboard first (Dashboards → Create dashboard).', accion: { texto: 'Dashboards', alClic: () => cx.ir('cloudwatch/tableros') } });
    return;
  }
  let elegido = tableros[0].nombre;
  const m = cx.modal({
    titulo: 'Add to dashboard',
    ancho: 'chico',
    contenido: ui.campo({ etiqueta: 'Select a dashboard', control: ui.selector({ valor: elegido, opciones: tableros.map((t) => ({ valor: t.nombre, etiqueta: t.nombre })), alCambiar: (v) => (elegido = v) }) }),
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Add to dashboard', {
        variante: 'primario',
        alClic: () => {
          const metricas = [...st.elegidas.entries()].map(([k, x]) => ({ ...x.ref, estadistica: st.estadisticas[k] ?? 'Average' }));
          const r = cx.hacer({ servicio: 'CloudWatch', accion: 'PutDashboard', error: 'Failed to add to dashboard' }, (e) => agregarWidget(e, elegido, { tipo: 'linea', titulo: '', metricas }));
          if (r.ok) {
            m.cerrar();
            cx.flash({ tipo: 'exito', texto: `Added to dashboard ${elegido}.`, accion: { texto: 'View dashboard', alClic: () => cx.ir(rutaTablero(elegido)) } });
          }
        }
      })
    ]
  });
}

/* ==================================================================== logs */

const textoRetencion = (d) => {
  if (!d) return 'Never expire';
  const nombres = { 1: '1 day', 3: '3 days', 5: '5 days', 7: '1 week', 14: '2 weeks', 30: '1 month', 60: '2 months', 90: '3 months', 120: '4 months', 150: '5 months', 180: '6 months', 365: '12 months', 400: '13 months', 545: '18 months', 731: '2 years', 1096: '3 years', 1827: '5 years', 2192: '6 years', 2557: '7 years', 2922: '8 years', 3288: '9 years', 3653: '10 years' };
  return nombres[d] ?? `${d} days`;
};
const opcionesRetencion = () => [{ valor: 0, etiqueta: 'Never expire' }, ...RETENCIONES_LOGS.map((d) => ({ valor: d, etiqueta: textoRetencion(d) }))];
const textoBytes = (b) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(2)} MB`);

function gruposLogs(cx) {
  migasCw(cx, { texto: 'Logs' }, { texto: 'Log groups' });
  const t = ui.tabla(cx, {
    titulo: 'Log groups',
    info: 'cw-logs',
    filas: () => cw(cx).gruposLogs,
    clave: (g) => g.nombre,
    seleccion: 'multiple',
    filtro: 'Filter log groups or try prefix search',
    columnas: [
      { titulo: 'Log group', valor: (g) => ui.enlace(g.nombre, rutaGrupoLogs(g.nombre), { cx }) },
      { titulo: 'Log class', valor: (g) => (g.clase === 'INFREQUENT_ACCESS' ? 'Infrequent Access' : 'Standard') },
      { titulo: 'Anomaly detection', valor: () => '–' },
      { titulo: 'Data protection', valor: () => '–' },
      { titulo: 'Retention', valor: (g) => textoRetencion(g.retencion) },
      { titulo: 'Metric filters', valor: () => '–' },
      { titulo: 'Stored bytes', valor: (g) => textoBytes(bytesGrupoLogs(g)) }
    ],
    acciones: (sel) => [
      ui.menuBoton('Actions', () => [
        { texto: 'Edit retention setting(s)', escribe: true, desactivado: !sel.length, alClic: () => modalRetencion(cx, sel.map((g) => g.nombre)) },
        { texto: 'Delete log group(s)', escribe: true, desactivado: !sel.length, alClic: () => borrarGruposLogs(cx, sel.map((g) => g.nombre)) },
        '-',
        { texto: 'Create metric filter', desactivado: true },
        { texto: 'Export data to Amazon S3', desactivado: true }
      ], { desactivado: !sel.length }),
      ui.boton('View in Logs Insights', { desactivado: true }),
      ui.boton('Start tailing', { desactivado: true }),
      ui.boton('Create log group', { variante: 'primario', alClic: () => cx.ir('cloudwatch/logs/crear') })
    ],
    vacio: { titulo: 'No log groups', texto: 'You don’t have any log groups. Lambda creates /aws/lambda/<function> the first time a function runs.', accion: ui.boton('Create log group', { escribe: true, alClic: () => cx.ir('cloudwatch/logs/crear') }) }
  });
  return h('div', { class: 'cx-pagina' }, t);
}

function modalRetencion(cx, nombres) {
  let dias = grupoLogsDe(cx.estado, nombres[0])?.retencion ?? 0;
  const m = cx.modal({
    titulo: 'Edit retention setting',
    ancho: 'chico',
    contenido: h('div', { class: 'cx-form' }, h('p', { class: 'cx-texto-sec' }, nombres.join(', ')), ui.campo({ etiqueta: 'Expire events after', info: 'cw-retencion', cx, control: ui.selector({ valor: dias, opciones: opcionesRetencion(), alCambiar: (v) => (dias = Number(v)) }) })),
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Save', {
        variante: 'primario',
        alClic: () => {
          const r = cx.hacer({ servicio: 'Logs', accion: 'PutRetentionPolicy', error: 'Failed to update retention' }, (e) => editarRetencionLogs(e, nombres, dias || null));
          if (r.ok) {
            m.cerrar();
            cx.flash({ tipo: 'exito', texto: `Retention setting updated to "${textoRetencion(dias || null)}".` });
          }
        }
      })
    ]
  });
}

function borrarGruposLogs(cx, nombres) {
  cx.confirmar({
    titulo: 'Delete log group(s)',
    textoBoton: 'Delete',
    contenido: [h('p', {}, 'The following log groups and all of their log events will be permanently deleted:'), h('ul', {}, nombres.map((n) => h('li', {}, n)))],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'Logs', accion: 'DeleteLogGroup', error: 'Failed to delete log group' }, (e) => eliminarGruposLogs(e, nombres));
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: `Successfully deleted ${nombres.length === 1 ? `log group ${nombres[0]}` : `${nombres.length} log groups`}.` });
        cx.ir('cloudwatch/logs');
      }
      return r.ok;
    }
  });
}

function crearGrupoLogsPagina(cx) {
  migasCw(cx, { texto: 'Log groups', ruta: 'cloudwatch/logs' }, { texto: 'Create log group' });
  const f = { nombre: '', retencion: 0, clase: 'STANDARD', etiquetas: [] };
  let error = null;
  const zona = ui.region(() =>
    h(
      'div',
      { class: 'cx-pagina cx-pagina--form' },
      ui.encabezado({ titulo: 'Create log group', info: 'cw-logs', cx }),
      ui.contenedor({
        titulo: 'Log group details',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.campo({ etiqueta: 'Log group name', control: ui.entrada({ valor: f.nombre, placeholder: '/aws/mi-app', alCambiar: (v) => (f.nombre = v) }), restriccion: 'Log group names can be between 1 and 512 characters long. Valid characters: a-z, A-Z, 0-9, \'_\' (underscore), \'-\' (hyphen), \'/\' (forward slash), \'.\' (period) and \'#\' (number sign).', error }),
          ui.campo({ etiqueta: 'Retention setting', info: 'cw-retencion', cx, control: ui.selector({ valor: f.retencion, opciones: opcionesRetencion(), alCambiar: (v) => (f.retencion = Number(v)) }) }),
          ui.campo({
            etiqueta: 'Log class',
            control: ui.tarjetas({
              columnas: 2,
              valor: f.clase,
              opciones: [
                { valor: 'STANDARD', etiqueta: 'Standard', descripcion: 'Full set of CloudWatch Logs capabilities.' },
                { valor: 'INFREQUENT_ACCESS', etiqueta: 'Infrequent Access', descripcion: 'Lower ingestion cost, for logs you rarely query.' }
              ],
              alCambiar: (v) => (f.clase = v)
            })
          }),
          ui.campo({ etiqueta: 'KMS key ARN', opcional: true, control: ui.entrada({ desactivado: true, placeholder: 'arn:aws:kms:…' }) })
        )
      }),
      ui.contenedor({ titulo: 'Tags', descripcion: 'Tags are key-value pairs you can add to AWS resources.', cuerpo: ui.editorEtiquetas({ filas: f.etiquetas }) }),
      ui.pieFormulario({
        cancelar: () => cx.ir('cloudwatch/logs'),
        textoEnviar: 'Create',
        enviar: () => {
          const r = cx.hacer({ servicio: 'Logs', accion: 'CreateLogGroup', error: 'Failed to create log group' }, (e) => crearGrupoLogs(e, { nombre: f.nombre, retencion: f.retencion || null, clase: f.clase }), { flash: false });
          if (!r.ok) {
            error = r.error?.message;
            zona.repintar();
            return;
          }
          cx.flash({ tipo: 'exito', texto: `Log group "${r.valor.nombre}" has been created.` });
          cx.ir('cloudwatch/logs');
        }
      })
    )
  );
  return zona;
}

function detalleGrupoLogs(cx, { grupo }) {
  migasCw(cx, { texto: 'Log groups', ruta: 'cloudwatch/logs' }, { texto: grupo });
  if (!grupoLogsDe(cx.estado, grupo)) return noExiste(cx, 'Log group', grupo, 'cloudwatch/logs');
  const st = { pestana: 'flujos' };
  const resumen = cx.vivo(() => {
    const g = grupoLogsDe(cx.estado, grupo);
    if (!g) return noExiste(cx, 'Log group', grupo, 'cloudwatch/logs');
    return ui.contenedor({
      titulo: 'Log group details',
      cuerpo: ui.pares(
        [
          { etiqueta: 'Log class', valor: g.clase === 'INFREQUENT_ACCESS' ? 'Infrequent Access' : 'Standard' },
          { etiqueta: 'ARN', valor: ui.copiable(`${g.arn}:*`) },
          { etiqueta: 'Creation time', valor: ui.fechaLarga(g.creado) },
          { etiqueta: 'Retention', info: 'cw-retencion', valor: textoRetencion(g.retencion) },
          { etiqueta: 'Stored bytes', valor: textoBytes(bytesGrupoLogs(g)) },
          { etiqueta: 'Metric filters', valor: '0' },
          { etiqueta: 'Subscription filters', valor: '0' },
          { etiqueta: 'KMS key ID', valor: '–' },
          { etiqueta: 'Deletion protection', valor: 'Off' }
        ],
        { columnas: 3, cx }
      )
    });
  });
  const flujos = ui.tabla(cx, {
    titulo: 'Log streams',
    variante: 'contenedor',
    filas: () => [...(grupoLogsDe(cx.estado, grupo)?.flujos ?? [])].sort((a, b) => (b.ultimo ?? 0) - (a.ultimo ?? 0)),
    clave: (f) => f.nombre,
    seleccion: 'multiple',
    filtro: 'Filter log streams or try prefix search',
    columnas: [
      { titulo: 'Log stream', valor: (f) => ui.enlace(f.nombre, `${rutaGrupoLogs(grupo)}/${encodeURIComponent(f.nombre)}`, { cx }) },
      { titulo: 'Last event time', valor: (f) => (f.ultimo ? fechaUtc(f.ultimo) : '–') }
    ],
    acciones: (sel) => [
      ui.boton('Delete', { escribe: true, desactivado: !sel.length, alClic: () => borrarFlujos(cx, grupo, sel.map((f) => f.nombre)) }),
      ui.boton('Create log stream', { escribe: true, alClic: () => modalFlujo(cx, grupo) }),
      ui.boton('Search all log streams', { desactivado: true })
    ],
    vacio: { titulo: 'No log streams', texto: 'There are no log streams in this log group.' }
  });
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({
      titulo: grupo,
      info: 'cw-logs',
      cx,
      acciones: [
        ui.menuBoton('Actions', () => [
          { texto: 'Edit retention setting', escribe: true, alClic: () => modalRetencion(cx, [grupo]) },
          { texto: 'Delete log group', escribe: true, alClic: () => borrarGruposLogs(cx, [grupo]) }
        ]),
        ui.boton('View in Logs Insights', { desactivado: true }),
        ui.boton('Start tailing', { desactivado: true })
      ]
    }),
    resumen,
    ui.pestanas({
      activa: st.pestana,
      alCambiar: (p) => (st.pestana = p),
      pestanas: [
        { id: 'flujos', texto: 'Log streams', contenido: () => flujos },
        { id: 'etiquetas', texto: 'Tags', contenido: () => ui.contenedor({ titulo: 'Tags', cuerpo: h('p', { class: 'cx-texto-sec' }, 'No tags associated with the resource.') }) },
        { id: 'anomalias', texto: 'Anomaly detection', desactivada: true, contenido: () => null },
        { id: 'filtros', texto: 'Metric filters', desactivada: true, contenido: () => null }
      ]
    })
  );
}

function modalFlujo(cx, grupo) {
  let nombre = '';
  let error = null;
  const zona = ui.region(() => ui.campo({ etiqueta: 'Log stream name', control: ui.entrada({ valor: nombre, alCambiar: (v) => (nombre = v) }), restriccion: 'Log stream names can be up to 512 characters and can’t contain «:» or «*».', error }));
  const m = cx.modal({
    titulo: 'Create log stream',
    ancho: 'chico',
    contenido: zona,
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Create', {
        variante: 'primario',
        alClic: () => {
          const r = cx.hacer({ servicio: 'Logs', accion: 'CreateLogStream', error: 'Failed to create log stream' }, (e) => crearFlujoLogs(e, grupo, nombre), { flash: false });
          if (!r.ok) {
            error = r.error?.message;
            zona.repintar();
            return;
          }
          m.cerrar();
          cx.flash({ tipo: 'exito', texto: `Log stream "${r.valor.nombre}" has been created.` });
        }
      })
    ]
  });
}

function borrarFlujos(cx, grupo, nombres) {
  cx.confirmar({
    titulo: 'Delete log stream(s)',
    textoBoton: 'Delete',
    contenido: [h('p', {}, 'The following log streams and their log events will be permanently deleted:'), h('ul', {}, nombres.map((n) => h('li', {}, n)))],
    aceptar: () => cx.hacer({ servicio: 'Logs', accion: 'DeleteLogStream', error: 'Failed to delete log stream' }, (e) => eliminarFlujosLogs(e, grupo, nombres)).ok
  });
}

function eventosFlujo(cx, { grupo, flujo }) {
  migasCw(cx, { texto: 'Log groups', ruta: 'cloudwatch/logs' }, { texto: grupo, ruta: rutaGrupoLogs(grupo) }, { texto: flujo });
  const existe = () => grupoLogsDe(cx.estado, grupo)?.flujos.find((f) => f.nombre === flujo);
  if (!existe()) return noExiste(cx, 'Log stream', flujo, rutaGrupoLogs(grupo));
  const t = ui.tabla(cx, {
    titulo: 'Log events',
    info: 'cw-logs',
    descripcion: 'You can use the filter bar below to search for and match terms, phrases, or values in your log events.',
    filas: () => existe()?.eventos ?? [],
    clave: (e) => `${e.t}|${e.m}`,
    filtro: 'Filter events - press enter to search',
    columnas: [
      { titulo: 'Timestamp', valor: (e) => h('span', { class: 'cx-mono' }, new Date(e.t).toISOString()) },
      { titulo: 'Message', valor: (e) => h('span', { class: 'cx-mono cx-cw-mensaje' }, e.m.replace(/\t/g, '   ')), texto: (e) => e.m }
    ],
    acciones: () => [ui.menuBoton('Actions', () => [{ texto: 'Download search results (CSV)', desactivado: true }, { texto: 'Copy search results (ASCII)', desactivado: true }]), ui.boton('Start tailing', { desactivado: true }), ui.boton('Create metric filter', { desactivado: true })],
    vacio: { titulo: 'No events', texto: 'There are no older events to load.' }
  });
  return h('div', { class: 'cx-pagina' }, t);
}

/* ================================================================== ayudas */

const ayudas = {
  'cw-tiempo': {
    titulo: 'El tiempo en el simulador',
    texto: [
      'En AWS una métrica básica de EC2 manda un dato **cada 5 minutos**. Para que veas cambios en clase, aquí **cada periodo dura 10 segundos reales**.',
      ['Una alarma con «1 out of 1» cambia de estado ~10 s después de que la métrica cruza el umbral.', 'Con «3 out of 3», ~30 s.', 'El rango **3h** de una gráfica son 36 puntos: unos 6 minutos reales.'],
      'Las horas del eje son las de tu reloj.'
    ]
  },
  'cw-metricas': {
    titulo: 'Métricas de CloudWatch',
    texto: [
      'Una **métrica** es un número que un servicio de AWS manda cada cierto tiempo: la CPU de una instancia, los mensajes de una cola, las peticiones a un balanceador…',
      'Se organizan por **namespace** (AWS/EC2, AWS/SQS…) y por **dimensiones**: `InstanceId` para una instancia o `AutoScalingGroupName` para el promedio de todo un grupo.',
      'La **estadística** dice cómo se junta cada periodo: Average (promedio), Sum (suma), Minimum, Maximum o SampleCount.',
      'En **Browse** entra a un namespace, luego a un grupo de dimensiones y marca las casillas: la gráfica de arriba se dibuja sola.'
    ]
  },
  'cw-alarma': {
    titulo: 'Alarma de CloudWatch',
    texto: [
      'Una **alarma** vigila **una métrica** y la compara con un **umbral** (por ejemplo, CPU > 70 %). Si se cumple la condición durante los puntos que pediste, entra en **In alarm** y ejecuta sus **acciones**.',
      'Se crea en 4 pasos: 1) métrica y condición, 2) acciones (SNS, Auto Scaling, EC2, Lambda), 3) nombre, 4) revisar y crear.',
      'Las alarmas `TargetTracking-…-AlarmHigh` y `AlarmLow` las crea **Auto Scaling** para su política de target tracking: no las edites.'
    ]
  },
  'cw-estados': {
    titulo: 'Estados de una alarma',
    texto: [
      [
        '**OK**: la métrica está dentro del umbral.',
        '**In alarm**: la métrica cruzó el umbral los puntos necesarios. Aquí se disparan las acciones.',
        '**Insufficient data**: la alarma acaba de nacer o no llegan datos (por ejemplo, la instancia está apagada).'
      ],
      'Las acciones solo corren cuando la alarma **cambia** de estado (las de Auto Scaling se repiten mientras siga en alarma).'
    ]
  },
  'cw-condiciones': {
    titulo: 'Condiciones de la alarma',
    texto: [
      '**Whenever … is** elige la comparación (Greater = mayor que) y **than…** el umbral.',
      '**Datapoints to alarm** «M out of N»: la alarma entra en alarma si M de los últimos N periodos cruzaron el umbral. «1 out of 1» reacciona rápido; «3 out of 3» ignora picos de un solo periodo.',
      'Ejemplo de la clase: `CPUUtilization > 70` con periodo de 5 minutos y «1 out of 1».'
    ]
  },
  'cw-datos-faltantes': {
    titulo: 'Datos faltantes',
    texto: [
      'Si un periodo no trae dato (la instancia está apagada o se borró), la alarma puede:',
      ['**missing**: no cuenta; si no hay ningún dato, pasa a Insufficient data.', '**good**: lo cuenta como dentro del umbral.', '**bad**: lo cuenta como fuera del umbral (útil para vigilar que algo siga vivo).', '**ignore**: se queda en el estado que tenía.']
    ]
  },
  'cw-acciones': {
    titulo: 'Acciones de la alarma',
    texto: [
      [
        '**Notification**: publica en un tema de **SNS**; SNS manda el correo a quien esté suscrito (y confirmado).',
        '**Auto Scaling action**: ejecuta una política simple o de pasos de un grupo (agrega o quita instancias).',
        '**EC2 action**: detiene, termina, reinicia o recupera la instancia (solo con métricas por instancia).',
        '**Lambda action**: invoca una función.'
      ],
      'Si no quieres acciones, quita la notificación con **Remove** y elige **Proceed without actions**.'
    ]
  },
  'cw-sns': {
    titulo: 'Avisar por SNS',
    texto: [
      'SNS es el «altavoz» de AWS: la alarma publica un mensaje en un **tema** y SNS lo reparte a sus suscriptores (correo, SQS, Lambda…).',
      'Con **Create new topic** escribes el nombre y los correos y pulsas **Create topic**. Cada correo queda **Pending confirmation** hasta que la persona pulsa «Confirm subscription» en el correo (en el simulador: SNS → bandeja de correo simulada).'
    ]
  },
  'cw-tableros': {
    titulo: 'Dashboards',
    texto: [
      'Un **dashboard** junta en una sola pantalla las gráficas que te importan.',
      '**Automatic dashboards** los arma CloudWatch solo, por servicio (EC2, Auto Scaling, ELB…). **Custom dashboards** los haces tú con **Add widget**: Line (gráfica), Number (último valor) o Text (notas).'
    ]
  },
  'cw-logs': {
    titulo: 'CloudWatch Logs',
    texto: [
      'Los **logs** son los mensajes que escriben tus aplicaciones. Se guardan en **log groups** (uno por aplicación) y dentro en **log streams** (uno por instancia o ejecución).',
      'Lambda escribe sola en `/aws/lambda/<función>`: cada invocación deja sus líneas START, END y REPORT.'
    ]
  },
  'cw-retencion': {
    titulo: 'Retención',
    texto: ['La **retención** dice cuánto tiempo se guardan los eventos. **Never expire** los guarda para siempre (y los cobra para siempre). Para ahorrar, pon un plazo, por ejemplo 1 month.']
  }
};

/* ================================================================ registro */

const des = (texto) => ({ texto, desactivado: true });

export default {
  id: 'cloudwatch',
  nombre: 'CloudWatch',
  titulo: 'CloudWatch',
  descripcion: 'Monitor Resources and Applications',
  categoria: 'gestion',
  claves: 'monitoring metrics alarms logs dashboards monitoreo alarmas métricas',
  inicio: 'cloudwatch',
  menu: [
    { texto: 'Overview', ruta: 'cloudwatch' },
    { seccion: 'Dashboards', items: [{ texto: 'Dashboards', ruta: 'cloudwatch/tableros' }] },
    { seccion: 'AI Operations', items: [des('Investigations'), des('Configuration')] },
    { seccion: 'Alarms', items: [{ texto: 'In alarm', ruta: 'cloudwatch/alarmas/en-alarma' }, { texto: 'All alarms', ruta: 'cloudwatch/alarmas' }] },
    { seccion: 'Logs', items: [{ texto: 'Log groups', ruta: 'cloudwatch/logs' }, des('Log Anomalies'), des('Live Tail'), des('Logs Insights'), des('Contributor Insights')] },
    { seccion: 'Metrics', items: [{ texto: 'All metrics', ruta: 'cloudwatch/metricas' }, des('Explorer'), des('Streams')] },
    { seccion: 'Application Signals (APM)', items: [des('Services'), des('Service Map'), des('Transaction Search')] },
    { seccion: 'Network Monitoring', items: [des('Internet Monitors'), des('Synthetic Monitors')] },
    { seccion: 'Insights', items: [des('Container Insights'), des('Database Insights'), des('Lambda Insights')] },
    des('Settings'),
    des('Getting Started')
  ],
  rutas: {
    '': overview,
    tableros,
    'tableros/auto/:id': tableroAutomatico,
    'tableros/:nombre': tableroPropio,
    alarmas: (cx) => listaAlarmas(cx),
    'alarmas/en-alarma': (cx) => listaAlarmas(cx, { soloAlarma: true }),
    'alarmas/crear': (cx) => crearAlarmaPagina(cx),
    'alarmas/editar/:nombre': (cx, p) => crearAlarmaPagina(cx, p),
    'alarmas/:nombre': detalleAlarma,
    metricas: todasMetricas,
    logs: gruposLogs,
    'logs/crear': crearGrupoLogsPagina,
    'logs/:grupo': detalleGrupoLogs,
    'logs/:grupo/:flujo': eventosFlujo
  },
  busqueda: [
    { texto: 'Alarms', ruta: 'cloudwatch/alarmas', claves: 'alarmas' },
    { texto: 'Create alarm', ruta: 'cloudwatch/alarmas/crear', claves: 'crear alarma' },
    { texto: 'All metrics', ruta: 'cloudwatch/metricas', claves: 'métricas cpu' },
    { texto: 'Dashboards', ruta: 'cloudwatch/tableros', claves: 'tableros' },
    { texto: 'Log groups', ruta: 'cloudwatch/logs', claves: 'logs registros' }
  ],
  ayudas
};

