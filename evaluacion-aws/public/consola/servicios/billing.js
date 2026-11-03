// ---------------------------------------------------------------------------
// BILLING AND COST MANAGEMENT
//
// La consola de facturación: Home (Cost summary, Cost monitor, Cost breakdown,
// Recommended actions, Free Tier), Bills, Cost Explorer (agrupar por servicio,
// etiqueta, tipo de instancia o usage type, filtros y pronóstico), los reportes
// guardados, Cost Anomaly Detection, Free Tier, Budgets (plantillas y el
// asistente personalizado de 5 pasos, con alertas reales y pronosticadas), la
// Pricing Calculator (My Estimate con grupos y Export), Savings Plans y
// Reservations (solo lectura, con recomendaciones) y Cost allocation tags.
//
// Todo lo que se cobra lo calcula modelo/costos.js: 1 hora de uso = 1 minuto
// real (ver la ayuda «costos-tiempo»).
// ---------------------------------------------------------------------------

import * as ui from '../ui.js';
import {
  activarEtiquetasCosto,
  agregarGrupoEstimacion,
  anomaliasDeCostos,
  claveDia,
  claveMes,
  consultarCostos,
  costoMensual,
  costoMesPasadoMismoPeriodo,
  crearEstimacion,
  crearMonitorAnomalias,
  crearPresupuesto,
  desactivarEtiquetasCosto,
  dinero,
  duplicarServicioEstimacion,
  editarEstimacion,
  editarPresupuesto,
  eliminarEstimacion,
  eliminarGrupoEstimacion,
  eliminarMonitorAnomalias,
  eliminarPresupuesto,
  eliminarReporteCostos,
  eliminarServicioEstimacion,
  estadoPresupuesto,
  etiquetasDeCostos,
  facturaMes,
  finMes,
  guardarReporteCostos,
  guardarServicioEstimacion,
  lineasDelMes,
  mesCorto,
  mesesEntre,
  moverServicioEstimacion,
  nombreMes,
  OFERTAS_CAPA_GRATUITA,
  precioCalculadora,
  PRECIO_RDS,
  PRECIO_S3,
  pronosticoMes,
  recomendacionSavingsPlans,
  recursosFacturables,
  reloj,
  SERVICIOS_COSTO,
  servicioCosto,
  sumarMeses,
  tasaPorHora,
  TIPOS_INSTANCIA,
  totalesEstimacion
} from '../modelo.js';

const { h } = ui;

const BASE = 'billing';
const ahora = () => reloj.ahora();
const migasBilling = (cx, ...resto) => cx.migas([{ texto: 'Billing and Cost Management', ruta: BASE }, ...resto]);
const porcentaje = (n) => `${(Number(n) || 0).toFixed(2)}%`;
const numero = (v) => {
  const n = Number(String(v ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : NaN;
};
const lista = (texto) =>
  String(texto ?? '')
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);

/* ============================================================ la gráfica */

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Un nodo SVG (h() solo hace HTML). */
function s(etiqueta, atributos = {}, ...hijos) {
  const el = document.createElementNS(SVG_NS, etiqueta);
  for (const [k, v] of Object.entries(atributos)) if (v !== undefined && v !== null && v !== false) el.setAttribute(k, String(v));
  for (const c of hijos.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

// La paleta de gráficas de Cloudscape (la que usa Cost Explorer).
const COLORES = ['#688ae8', '#c33d69', '#2ea597', '#8456ce', '#e07941', '#3759ce', '#962249', '#096f64', '#6237a7', '#a84401'];
const COLOR_OTROS = '#7d8998';

/** Un tope «redondo» para el eje Y. */
function topeEje(maximo) {
  if (!(maximo > 0)) return 1;
  const base = 10 ** Math.floor(Math.log10(maximo));
  for (const f of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (f * base >= maximo) return f * base;
  return 10 * base;
}

/**
 * Barras apiladas. columnas: [{ etiqueta, valores: { grupo: n }, pronostico: n }]
 * grupos: nombres en orden (los primeros 9 con color; el resto como «Others»).
 */
function graficaBarras({ columnas, grupos, alto = 240, formato = dinero, titulo = 'Costs ($)' }) {
  const visibles = grupos.slice(0, 9);
  const conOtros = grupos.length > 9;
  const color = (g) => (visibles.includes(g) ? COLORES[visibles.indexOf(g)] : COLOR_OTROS);
  const totales = columnas.map((c) => Object.values(c.valores).reduce((a, b) => a + b, 0) + (c.pronostico ?? 0));
  const tope = topeEje(Math.max(...totales, 0));
  const ancho = 760;
  const izq = 64;
  const abajo = 26;
  const arriba = 10;
  const util = ancho - izq - 10;
  const paso = util / Math.max(1, columnas.length);
  const barra = Math.min(56, paso * 0.6);
  const y = (v) => arriba + (alto - arriba - abajo) * (1 - v / tope);
  const marcas = [0, 0.25, 0.5, 0.75, 1].map((f) => f * tope);
  const svg = s(
    'svg',
    { class: 'cx-costos-grafica', viewBox: `0 0 ${ancho} ${alto}`, role: 'img', 'aria-label': titulo, preserveAspectRatio: 'xMidYMid meet' },
    s('defs', {}, s('pattern', { id: 'cx-costos-rayas', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, s('rect', { width: 6, height: 6, fill: '#3b4655' }), s('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: '#9ba7b6', 'stroke-width': 2 }))),
    marcas.map((v) => [
      s('line', { x1: izq, x2: ancho - 6, y1: y(v), y2: y(v), class: 'cx-costos-grafica__rejilla' }),
      s('text', { x: izq - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'cx-costos-grafica__eje' }, formato(v).replace('.00', ''))
    ]),
    columnas.map((c, i) => {
      const x = izq + paso * i + (paso - barra) / 2;
      let acumulado = 0;
      const piezas = [];
      const orden = [...grupos].reverse();
      for (const g of [...visibles, ...(conOtros ? ['__otros'] : [])]) {
        const v = g === '__otros' ? orden.filter((o) => !visibles.includes(o)).reduce((a, o) => a + (c.valores[o] ?? 0), 0) : c.valores[g] ?? 0;
        if (!(v > 0)) continue;
        const y0 = y(acumulado);
        const y1 = y(acumulado + v);
        piezas.push(s('rect', { x, y: y1, width: barra, height: Math.max(0.5, y0 - y1), fill: g === '__otros' ? COLOR_OTROS : color(g) }, s('title', {}, `${c.etiqueta} · ${g === '__otros' ? 'Others' : g}: ${formato(v)}`)));
        acumulado += v;
      }
      if (c.pronostico > 0) {
        const y0 = y(acumulado);
        const y1 = y(acumulado + c.pronostico);
        piezas.push(s('rect', { x, y: y1, width: barra, height: Math.max(0.5, y0 - y1), fill: 'url(#cx-costos-rayas)', stroke: '#9ba7b6', 'stroke-dasharray': '3 2' }, s('title', {}, `${c.etiqueta} · Forecasted: ${formato(c.pronostico)}`)));
      }
      return [...piezas, s('text', { x: x + barra / 2, y: alto - 8, 'text-anchor': 'middle', class: 'cx-costos-grafica__eje' }, c.etiqueta)];
    }),
    s('line', { x1: izq, x2: ancho - 6, y1: y(0), y2: y(0), class: 'cx-costos-grafica__base' })
  );
  const leyenda = h(
    'div',
    { class: 'cx-leyenda' },
    visibles.map((g) => h('span', {}, h('i', { class: 'cx-costos-muestra', style: { background: color(g) } }), g)),
    conOtros ? h('span', {}, h('i', { class: 'cx-costos-muestra', style: { background: COLOR_OTROS } }), 'Others') : null,
    columnas.some((c) => c.pronostico > 0) ? h('span', {}, h('i', { class: 'cx-costos-muestra cx-costos-muestra--pronostico' }), 'Forecasted') : null
  );
  return h('div', { class: 'cx-costos-grafica-caja' }, h('div', { class: 'cx-costos-grafica__titulo' }, titulo), svg, leyenda);
}

/** Una cifra grande con su etiqueta (los widgets de Home y Cost Explorer). */
const cifra = (etiqueta, valor, nota, info, cx) =>
  h('div', { class: 'cx-costos-cifra' }, h('div', { class: 'cx-par__etiqueta' }, etiqueta, info && cx ? ui.info(cx, info) : null), h('div', { class: 'cx-costos-cifra__valor' }, valor), nota ? h('div', { class: 'cx-costos-cifra__nota' }, nota) : null);

/** «↑ 12% compared to last month for same period». */
function comparacion(actual, anterior, texto) {
  if (!(anterior > 0)) return null;
  const d = ((actual - anterior) / anterior) * 100;
  return h('span', { class: d > 0 ? 'cx-costos-sube' : 'cx-costos-baja' }, `${d > 0 ? '↑' : '↓'} ${Math.abs(d).toFixed(0)}% `, h('span', { class: 'cx-texto-sec' }, texto));
}

/** Una barra de progreso (Free Tier, presupuestos). */
function barraProgreso(fraccion, { peligro = false } = {}) {
  const f = Math.max(0, Math.min(1, fraccion || 0));
  return h('span', { class: ['cx-costos-progreso', peligro && 'cx-costos-progreso--peligro'] }, h('span', { style: { width: `${(f * 100).toFixed(1)}%` } }));
}

/** Descarga un archivo de texto (Export). */
function descargar(nombre, texto, tipo = 'text/csv') {
  try {
    const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
    const a = h('a', { href: url, download: nombre, style: { display: 'none' } });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch {
    /* sin descargas (por ejemplo, en una vista de solo lectura) */
  }
}

const csv = (filas) => filas.map((f) => f.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(',')).join('\n');

/** Los valores que tiene una llave de etiqueta en la cuenta (para filtros). */
function valoresDeEtiqueta(estado, llave) {
  const valores = new Set();
  for (const r of recursosFacturables(estado)) if (r.etiquetas[llave]) valores.add(r.etiquetas[llave]);
  for (const l of lineasDelMes(estado, claveMes(ahora()))) if (l.etiquetas?.[llave]) valores.add(l.etiquetas[llave]);
  return [...valores].sort();
}

/* ================================================================ Home */

function inicio(cx) {
  migasBilling(cx, { texto: 'Home' });
  const e = cx.estado;
  const resumen = cx.vivo(() => {
    const t = ahora();
    const mtd = costoMensual(e, {}, t);
    const pasadoMismo = costoMesPasadoMismoPeriodo(e, t);
    const pronostico = pronosticoMes(e, {}, t);
    const pasadoTotal = costoMensual(e, { mes: sumarMeses(claveMes(t), -1) }, t);
    return ui.contenedor({
      titulo: 'Cost summary',
      info: 'costos-resumen',
      cx,
      acciones: ui.boton('View in Cost Explorer', { alClic: () => cx.ir(`${BASE}/cost-explorer`) }),
      cuerpo: h(
        'div',
        { class: 'cx-costos-cifras' },
        cifra('Month-to-date cost', dinero(mtd), comparacion(mtd, pasadoMismo, 'compared to last month for same period')),
        cifra("Last month's cost for same time period", dinero(pasadoMismo), `${nombreMes(sumarMeses(claveMes(t), -1))} 1 – ${new Date(t).getUTCDate()}`),
        cifra('Total forecasted cost for current month', dinero(pronostico), comparacion(pronostico, pasadoTotal, "compared to last month's total costs"), 'costos-pronostico', cx),
        cifra("Last month's total cost", dinero(pasadoTotal), nombreMes(sumarMeses(claveMes(t), -1)))
      )
    });
  });

  const monitor = cx.vivo(() => {
    const presupuestos = e.costos?.presupuestos ?? [];
    const estados = presupuestos.map((b) => ({ b, st: estadoPresupuesto(e, b) }));
    const excedidos = estados.filter((x) => excedidoReal(x.b, x.st)).length;
    const pronosticados = estados.filter((x) => !excedidoReal(x.b, x.st) && x.st.excedido).length;
    const anomalias = anomaliasDeCostos(e);
    const hayMonitor = (e.costos?.monitores ?? []).length > 0;
    return ui.contenedor({
      titulo: 'Cost monitor',
      cuerpo: h(
        'div',
        { class: 'cx-costos-monitor' },
        h(
          'div',
          {},
          h('div', { class: 'cx-par__etiqueta' }, 'Budgets status'),
          presupuestos.length
            ? h('div', {}, excedidos ? ui.estado('error', `${excedidos} exceeded`) : pronosticados ? ui.estado('aviso', `${pronosticados} forecasted to exceed`) : ui.estado('exito', 'OK'), h('div', { class: 'cx-texto-sec' }, `${presupuestos.length} budget${presupuestos.length === 1 ? '' : 's'}`), ui.enlace('View budgets', `${BASE}/presupuestos`, { cx }))
            : h('div', {}, ui.estado('aviso', 'Setup required'), h('div', {}, ui.enlace('Create a budget', `${BASE}/presupuestos/crear`, { cx })))
        ),
        h(
          'div',
          {},
          h('div', { class: 'cx-par__etiqueta' }, 'Cost anomalies'),
          !hayMonitor
            ? h('div', {}, ui.estado('aviso', 'Setup required'), h('div', {}, ui.enlace('Create a monitor', `${BASE}/anomalias/crear`, { cx })))
            : anomalias.length
              ? h('div', {}, ui.estado('aviso', `${anomalias.length} anomal${anomalias.length === 1 ? 'y' : 'ies'} detected`), h('div', {}, ui.enlace('View anomalies', `${BASE}/anomalias`, { cx })))
              : h('div', {}, ui.estado('exito', 'No anomalies detected'), h('div', {}, ui.enlace('View monitors', `${BASE}/anomalias`, { cx })))
        )
      )
    });
  });

  const desglose = cx.vivo(() => {
    const t = ahora();
    const mes = claveMes(t);
    const q = consultarCostos(e, { desde: sumarMeses(mes, -5), hasta: mes, agrupar: { tipo: 'SERVICE' } }, t);
    return ui.contenedor({
      titulo: 'Cost breakdown',
      descripcion: 'Costs by service over the last 6 months (unblended costs).',
      acciones: ui.boton('View in Cost Explorer', { alClic: () => cx.ir(`${BASE}/cost-explorer`) }),
      cuerpo: graficaBarras({ columnas: q.periodos.map((p) => ({ etiqueta: mesCorto(p.clave), valores: p.grupos })), grupos: q.grupos, alto: 220 })
    });
  });

  const recomendadas = cx.vivo(() => {
    const acciones = [];
    const c = e.costos ?? {};
    if (!(c.presupuestos ?? []).length) acciones.push(['Create a budget', 'Track your costs and get alerts before you exceed your planned spending.', `${BASE}/presupuestos/crear`]);
    const ociosas = (e.eips ?? []).filter((x) => !x.instanciaId && !x.natId);
    if (ociosas.length) acciones.push([`Release ${ociosas.length} unassociated Elastic IP address${ociosas.length === 1 ? '' : 'es'}`, 'Public IPv4 addresses are charged every hour, even when they are not associated.', 'ec2/eips']);
    const sueltos = (e.volumenes ?? []).filter((v) => v.estado === 'available');
    if (sueltos.length) acciones.push([`Delete ${sueltos.length} unattached EBS volume${sueltos.length === 1 ? '' : 's'}`, 'Volumes are charged per GB-month even when no instance uses them.', 'ec2/volumenes']);
    const etiquetas = etiquetasDeCostos(e).filter((x) => x.tipo === 'user');
    if (etiquetas.length && !etiquetas.some((x) => x.activa)) acciones.push(['Activate cost allocation tags', 'Activate the tags you use so you can group and filter costs by them.', `${BASE}/etiquetas`]);
    const sp = recomendacionSavingsPlans(e);
    if (sp && sp.ahorroMensual >= 1) acciones.push([`Save up to ${dinero(sp.ahorroMensual)}/month with Savings Plans`, 'Review the Savings Plans recommendations based on your EC2 usage.', `${BASE}/savings-plans`]);
    const ta = Object.values(c.advisor?.resultados ?? {}).filter((r) => r.estado !== 'ok').length;
    if (ta) acciones.push([`Review ${ta} Trusted Advisor check${ta === 1 ? '' : 's'}`, 'Trusted Advisor found items that need your attention.', 'trustedadvisor']);
    return ui.contenedor({
      titulo: 'Recommended actions',
      contador: acciones.length,
      cuerpo: acciones.length
        ? h('div', { class: 'cx-inicio__atajos' }, acciones.map(([t, d, ruta]) => h('a', { href: '#', class: 'cx-inicio__atajo cx-costos-accion', onclick: (ev) => (ev.preventDefault(), cx.ir(ruta)) }, h('b', {}, t), h('span', { class: 'cx-texto-sec' }, d))))
        : h('p', { class: 'cx-texto-sec' }, 'No recommended actions right now.')
    });
  });

  const capa = cx.vivo(() => {
    const usos = usoCapaGratuita(e).slice(0, 4);
    return ui.contenedor({
      titulo: 'Free Tier',
      info: 'costos-free-tier',
      cx,
      acciones: ui.boton('View all', { alClic: () => cx.ir(`${BASE}/free-tier`) }),
      cuerpo: h(
        'div',
        { class: 'cx-costos-lista' },
        usos.map((o) =>
          h('div', { class: 'cx-costos-lista__item' }, h('div', {}, h('b', {}, o.servicio), h('div', { class: 'cx-texto-sec' }, o.texto)), h('div', { class: 'cx-costos-lista__dato' }, `${porcentaje(o.porcentaje)} used`, barraProgreso(o.porcentaje / 100, { peligro: o.porcentaje >= 85 })))
        )
      )
    });
  });

  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Billing and Cost Management home', info: 'costos-tiempo', cx, descripcion: 'Get a quick view of your costs and usage, and take action to manage your spending.' }),
    ui.alerta({
      tipo: 'info',
      titulo: 'Tiempo comprimido del simulador',
      contenido: 'Aquí 1 minuto real cuenta como 1 hora de uso: una instancia prendida durante tu laboratorio de 50 minutos se cobra como 50 horas. Los meses anteriores son un historial de ejemplo de tu cuenta.',
      cerrable: true
    }),
    resumen,
    h('div', { class: 'cx-costos-rejilla' }, desglose, h('div', { class: 'cx-pagina' }, monitor, recomendadas)),
    capa
  );
}

/* ================================================================ Bills */

function facturas(cx) {
  migasBilling(cx, { texto: 'Bills' });
  const e = cx.estado;
  const mesHoy = claveMes(ahora());
  const st = { mes: cx.memoria.mesFactura ?? mesHoy, pestana: 'servicio', abiertos: new Set() };
  const opciones = Array.from({ length: 12 }, (_, i) => sumarMeses(mesHoy, -i)).map((m) => ({ valor: m, etiqueta: nombreMes(m) }));
  const zona = cx.vivo(() => {
    const factura = facturaMes(e, st.mes);
    const total = factura.reduce((a, s) => a + s.total, 0);
    const actual = st.mes === mesHoy;
    const fin = new Date(finMes(st.mes) - 86_400_000);
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.contenedor({
        titulo: 'AWS estimated bill summary',
        info: 'costos-facturas',
        cx,
        cuerpo: ui.pares(
          [
            { etiqueta: 'Account ID', valor: e.cuenta.id },
            { etiqueta: 'Billing period', valor: `${nombreMes(st.mes).split(' ')[0]} 1 - ${fin.getUTCDate()}, ${st.mes.slice(0, 4)}` },
            { etiqueta: 'Bill status', valor: actual ? ui.estado('info', 'Pending') : ui.estado('exito', 'Issued') },
            { etiqueta: 'Total in USD', valor: h('span', { class: 'cx-costos-cifra__valor' }, dinero(total)) }
          ],
          { columnas: 4 }
        )
      }),
      actual ? ui.alerta({ tipo: 'info', contenido: 'The estimated bill for the current billing period updates as you use AWS services. Charges are finalized at the end of the month.' }) : null,
      ui.pestanas({
        activa: st.pestana,
        alCambiar: (p) => (st.pestana = p),
        pestanas: [
          {
            id: 'servicio',
            texto: 'Charges by service',
            contenido: () =>
              ui.contenedor({
                titulo: 'Charges by service',
                contador: factura.length,
                descripcion: 'Expand a service to see its charges by Region and usage type.',
                cuerpo: factura.length
                  ? h(
                      'div',
                      { class: 'cx-costos-factura' },
                      factura.map((sv) =>
                        ui.expandible({
                          titulo: sv.nombre,
                          descripcion: dinero(sv.total),
                          abierto: st.abiertos.has(sv.nombre),
                          alAlternar: (ab) => (ab ? st.abiertos.add(sv.nombre) : st.abiertos.delete(sv.nombre)),
                          contenido: h(
                            'div',
                            { class: 'cx-costos-factura__region' },
                            h('div', { class: 'cx-costos-factura__fila cx-costos-factura__fila--region' }, h('b', {}, ['route53', 'soporte', 'cloudfront'].some((x) => sv.servicios.includes(x)) ? 'Global' : 'US East (N. Virginia)'), h('b', {}, dinero(sv.total))),
                            sv.usos.map((u) =>
                              h('div', { class: 'cx-costos-factura__fila' }, h('span', {}, u.descripcion), h('span', { class: 'cx-texto-sec' }, `${u.cantidad.toLocaleString('en-US', { maximumFractionDigits: 3 })} ${u.unidad}`), h('span', {}, dinero(u.costo)))
                            )
                          )
                        })
                      ),
                      h('div', { class: 'cx-costos-factura__fila cx-costos-factura__fila--total' }, h('b', {}, 'Total'), h('span'), h('b', {}, dinero(total)))
                    )
                  : h('div', { class: 'cx-tabla__vacia' }, h('b', {}, 'No charges'), h('div', {}, 'There are no charges for this billing period.'))
              })
          },
          {
            id: 'cuenta',
            texto: 'Charges by account',
            contenido: () =>
              ui.contenedor({
                titulo: 'Charges by account',
                sinRelleno: true,
                cuerpo: h(
                  'table',
                  { class: 'cx-tabla__tabla' },
                  h('thead', {}, h('tr', {}, ['Account ID', 'Account name', 'Total in USD'].map((c) => h('th', {}, h('span', { class: 'cx-tabla__orden' }, c))))),
                  h('tbody', {}, h('tr', {}, h('td', { style: { paddingLeft: '20px' } }, e.cuenta.id), h('td', {}, e.cuenta.usuario ?? '–'), h('td', {}, dinero(total))))
                )
              })
          },
          {
            id: 'facturas',
            texto: 'Invoices',
            contenido: () =>
              ui.contenedor({
                titulo: 'Invoices',
                sinRelleno: true,
                cuerpo: actual
                  ? h('div', { class: 'cx-tabla__vacia' }, h('b', {}, 'No invoices'), h('div', {}, 'The invoice for this billing period is issued at the beginning of next month.'))
                  : h(
                      'table',
                      { class: 'cx-tabla__tabla' },
                      h('thead', {}, h('tr', {}, ['Invoice ID', 'Invoice date', 'Charge type', 'Total in USD'].map((c) => h('th', {}, h('span', { class: 'cx-tabla__orden' }, c))))),
                      h('tbody', {}, h('tr', {}, h('td', { style: { paddingLeft: '20px' } }, `${2_400_000_000 + (Number(st.mes.replace('-', '')) % 1_000_000)}`), h('td', {}, `${sumarMeses(st.mes, 1)}-02`), h('td', {}, 'Anniversary'), h('td', {}, dinero(total))))
                    )
              })
          },
          { id: 'ahorros', texto: 'Savings', contenido: () => ui.contenedor({ titulo: 'Savings', cuerpo: h('p', { class: 'cx-texto-sec' }, 'You have no Savings Plans, Reserved Instances or credits applied to this bill.') }) },
          { id: 'impuestos', texto: 'Taxes by service', contenido: () => ui.contenedor({ titulo: 'Taxes by service', cuerpo: h('p', { class: 'cx-texto-sec' }, 'Taxes are calculated when the invoice is issued. The simulator does not estimate taxes.') }) }
        ]
      })
    );
  });
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({
      titulo: 'Bills',
      info: 'costos-facturas',
      cx,
      acciones: [
        h('div', { class: 'cx-costos-selector-mes' }, ui.selector({ opciones, valor: st.mes, etiquetaAccesible: 'Billing period', alCambiar: (v) => ((st.mes = v), (cx.memoria.mesFactura = v), zona.repintar()) })),
        ui.boton('Download all to CSV', {
          icono: 'download',
          alClic: () => {
            const filas = [['Service', 'Usage type', 'Description', 'Usage quantity', 'Unit', 'Amount (USD)']];
            for (const sv of facturaMes(e, st.mes)) for (const u of sv.usos) filas.push([sv.nombre, u.uso, u.descripcion, u.cantidad.toFixed(4), u.unidad, u.costo.toFixed(2)]);
            descargar(`bill-${st.mes}.csv`, csv(filas));
          }
        })
      ]
    }),
    zona
  );
}

/* ======================================================== Cost Explorer */

const RANGOS = [
  { valor: '7d', etiqueta: 'Last 7 days', granularidad: 'DAILY' },
  { valor: 'mtd', etiqueta: 'Month to date', granularidad: 'DAILY' },
  { valor: '3m', etiqueta: 'Last 3 months', granularidad: 'MONTHLY' },
  { valor: '6m', etiqueta: 'Last 6 months', granularidad: 'MONTHLY' },
  { valor: '12m', etiqueta: 'Last 12 months', granularidad: 'MONTHLY' }
];
const DIMENSIONES = [
  { valor: 'SERVICE', etiqueta: 'Service' },
  { valor: 'TAG', etiqueta: 'Tag' },
  { valor: 'INSTANCE_TYPE', etiqueta: 'Instance type' },
  { valor: 'USAGE_TYPE', etiqueta: 'Usage type' },
  { valor: 'REGION', etiqueta: 'Region' },
  { valor: 'NONE', etiqueta: 'No grouping' }
];

const REPORTES_AWS = [
  { id: 'aws-servicio', nombre: 'Monthly costs by service', descripcion: 'View your monthly costs by service over the last 6 months.', parametros: { rango: '6m', granularidad: 'MONTHLY', agrupar: 'SERVICE' } },
  { id: 'aws-diario', nombre: 'Daily costs', descripcion: 'View your daily costs for the current month.', parametros: { rango: 'mtd', granularidad: 'DAILY', agrupar: 'NONE' } },
  { id: 'aws-instancias', nombre: 'Monthly EC2 running hours costs and usage', descripcion: 'EC2 running hours grouped by instance type.', parametros: { rango: '6m', granularidad: 'MONTHLY', agrupar: 'INSTANCE_TYPE', servicios: ['ec2'] } },
  { id: 'aws-uso', nombre: 'Monthly costs by usage type', descripcion: 'View your monthly costs by usage type.', parametros: { rango: '3m', granularidad: 'MONTHLY', agrupar: 'USAGE_TYPE' } }
];

const parametrosIniciales = () => ({ rango: '6m', granularidad: 'MONTHLY', agrupar: 'SERVICE', llave: null, servicios: [], etiquetaLlave: null, etiquetaValores: [], tipos: [], pronostico: false });

/** desde/hasta de la consulta según el rango y la granularidad. */
function rangoConsulta(p, t) {
  const mes = claveMes(t);
  if (p.granularidad === 'DAILY') {
    const hoy = claveDia(t);
    if (p.rango === '7d') return { desde: claveDia(t - 6 * 86_400_000), hasta: hoy };
    if (p.rango === 'mtd') return { desde: `${mes}-01`, hasta: hoy };
    const meses = { '3m': 3, '6m': 3, '12m': 3 }[p.rango] ?? 1;
    return { desde: `${sumarMeses(mes, -(meses - 1))}-01`, hasta: hoy };
  }
  const n = { '7d': 1, mtd: 1, '3m': 3, '6m': 6, '12m': 12 }[p.rango] ?? 6;
  return { desde: sumarMeses(mes, -(n - 1)), hasta: mes };
}

function filtroDe(p) {
  return {
    servicios: p.servicios?.length ? p.servicios : undefined,
    etiquetas: p.etiquetaLlave && p.etiquetaValores?.length ? p.etiquetaValores.map((v) => ({ llave: p.etiquetaLlave, valor: v === '__ninguno' ? '' : v })) : undefined,
    tiposInstancia: p.tipos?.length ? p.tipos : undefined
  };
}

function costExplorer(cx, { reporte } = {}) {
  migasBilling(cx, { texto: 'Cost Explorer', ruta: reporte ? `${BASE}/cost-explorer` : undefined }, ...(reporte ? [{ texto: 'Report' }] : []));
  const e = cx.estado;
  const guardado = reporte ? REPORTES_AWS.find((r) => r.id === reporte) ?? (e.costos?.reportes ?? []).find((r) => r.id === reporte) : null;
  if (reporte && !guardado) return ui.noDisponible('Report not found', 'Ese reporte ya no existe. Regresa a Cost Explorer saved reports.');
  const p = { ...parametrosIniciales(), ...(guardado ? guardado.parametros : cx.memoria.ceParametros ?? {}) };
  const recordar = () => {
    if (!guardado) cx.memoria.ceParametros = { ...p };
  };

  const resultado = cx.vivo(() => {
    const t = ahora();
    const { desde, hasta } = rangoConsulta(p, t);
    const agrupar = p.agrupar === 'NONE' ? null : p.agrupar === 'TAG' ? (p.llave ? { tipo: 'TAG', llave: p.llave } : null) : { tipo: p.agrupar };
    const q = consultarCostos(e, { desde, hasta, granularidad: p.granularidad, agrupar, filtro: filtroDe(p) }, t);
    const mensual = p.granularidad === 'MONTHLY';
    const etiquetaPeriodo = (c) => (mensual ? mesCorto(c) : c.slice(5).replace('-', '/'));
    const columnas = q.periodos.map((x) => ({ etiqueta: etiquetaPeriodo(x.clave), valores: x.grupos }));
    let pronosticoTotal = null;
    if (p.pronostico && mensual) {
      const filtro = filtroDe(p);
      const mesHoy = claveMes(t);
      const finDeMes = pronosticoMes(e, { filtro }, t);
      const restoMes = finDeMes - costoMensual(e, { filtro }, t);
      const ultima = columnas.at(-1);
      if (ultima && q.periodos.at(-1).clave === mesHoy) ultima.pronostico = restoMes;
      const porMes = tasaPorHora(e, filtro) * 730;
      for (let i = 1; i <= 3; i++) columnas.push({ etiqueta: mesCorto(sumarMeses(mesHoy, i)), valores: {}, pronostico: porMes });
      pronosticoTotal = { finDeMes, siguientes: porMes * 3 };
    }
    const grupos = q.grupos.length ? q.grupos : ['Total'];
    const servicios = new Set(q.periodos.flatMap((x) => Object.keys(consultarCostos(e, { desde: x.clave, hasta: x.clave, granularidad: p.granularidad, agrupar: { tipo: 'SERVICE' }, filtro: filtroDe(p) }, t).totales)));
    const nombreGrupo = (g) => (agrupar ? g : 'Total costs');
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.contenedor({
        cuerpo: h(
          'div',
          { class: 'cx-costos-cifras' },
          cifra('Total cost', dinero(q.total)),
          cifra(mensual ? 'Average monthly cost' : 'Average daily cost', dinero(q.periodos.length ? q.total / q.periodos.length : 0)),
          cifra('Service count', String([...servicios].length)),
          pronosticoTotal ? cifra('Forecasted month end costs', dinero(pronosticoTotal.finDeMes), null, 'costos-pronostico', cx) : null
        )
      }),
      ui.contenedor({
        titulo: 'Cost and usage graph',
        cuerpo: graficaBarras({ columnas, grupos: agrupar ? q.grupos : q.total ? ['Total'] : [], formato: dinero, alto: 260 })
      }),
      ui.contenedor({
        titulo: 'Cost and usage breakdown',
        sinRelleno: true,
        acciones: ui.boton('Download as CSV', {
          icono: 'download',
          alClic: () => {
            const filas = [[`${DIMENSIONES.find((d) => d.valor === p.agrupar)?.etiqueta ?? 'Group'}`, ...q.periodos.map((x) => x.clave), 'Total costs($)']];
            for (const g of grupos) filas.push([nombreGrupo(g), ...q.periodos.map((x) => (x.grupos[g] ?? 0).toFixed(2)), (q.totales[g] ?? 0).toFixed(2)]);
            descargar('costs.csv', csv(filas));
          }
        }),
        cuerpo: h(
          'div',
          { class: 'cx-tabla__desliza' },
          h(
            'table',
            { class: 'cx-tabla__tabla cx-costos-tabla' },
            h('thead', {}, h('tr', {}, h('th', {}, h('span', { class: 'cx-tabla__orden' }, DIMENSIONES.find((d) => d.valor === p.agrupar)?.etiqueta ?? 'Group')), h('th', {}, h('span', { class: 'cx-tabla__orden' }, 'Total costs($)')), q.periodos.map((x) => h('th', {}, h('span', { class: 'cx-tabla__orden' }, etiquetaPeriodo(x.clave)))))),
            h(
              'tbody',
              {},
              h('tr', { class: 'cx-costos-tabla__total' }, h('td', {}, 'Total costs'), h('td', {}, dinero(q.total)), q.periodos.map((x) => h('td', {}, dinero(x.total)))),
              agrupar ? q.grupos.map((g, i) => h('tr', {}, h('td', {}, h('i', { class: 'cx-costos-muestra', style: { background: i < 9 ? COLORES[i] : COLOR_OTROS } }), g), h('td', {}, dinero(q.totales[g])), q.periodos.map((x) => h('td', {}, dinero(x.grupos[g] ?? 0))))) : null
            )
          )
        )
      })
    );
  });

  const parametros = ui.region(() => {
    const llavesActivas = (e.costos?.etiquetasActivas ?? []).slice().sort();
    const rangos = RANGOS.map((r) => ({ valor: r.valor, etiqueta: r.etiqueta }));
    const cambio = () => {
      recordar();
      resultado.repintar();
      parametros.repintar();
    };
    return ui.contenedor({
      titulo: 'Report parameters',
      info: 'costos-cost-explorer',
      cx,
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        h('h3', { class: 'cx-costos-subtitulo' }, 'Time'),
        ui.campo({ etiqueta: 'Date range', control: ui.selector({ opciones: rangos, valor: p.rango, alCambiar: (v) => ((p.rango = v), (p.granularidad = RANGOS.find((r) => r.valor === v).granularidad), v.endsWith('m') || (p.pronostico = false), cambio()) }) }),
        ui.campo({
          etiqueta: 'Granularity',
          control: ui.segmentado({ opciones: [{ valor: 'DAILY', etiqueta: 'Daily' }, { valor: 'MONTHLY', etiqueta: 'Monthly' }], valor: p.granularidad, alCambiar: (v) => ((p.granularidad = v), v === 'DAILY' && (p.pronostico = false), cambio()) })
        }),
        ui.casilla({ etiqueta: 'Show forecasted values', descripcion: 'Adds the forecast for the rest of this month and the next 3 months (Monthly only).', marcada: p.pronostico, desactivado: p.granularidad !== 'MONTHLY', alCambiar: (v) => ((p.pronostico = v), cambio()) }),
        h('h3', { class: 'cx-costos-subtitulo' }, 'Group by'),
        ui.campo({ etiqueta: 'Dimension', control: ui.selector({ opciones: DIMENSIONES, valor: p.agrupar, alCambiar: (v) => ((p.agrupar = v), v === 'TAG' && !p.llave && (p.llave = llavesActivas[0] ?? null), cambio()) }) }),
        p.agrupar === 'TAG'
          ? ui.campo({
              etiqueta: 'Tag',
              descripcion: llavesActivas.length ? null : 'No active cost allocation tags. Activate a tag in Cost allocation tags to group by it.',
              control: ui.selector({ opciones: llavesActivas.map((l) => ({ valor: l, etiqueta: l })), valor: p.llave, placeholder: 'Choose a tag key', vacio: 'No active tags', alCambiar: (v) => ((p.llave = v), cambio()) })
            })
          : null,
        h('h3', { class: 'cx-costos-subtitulo' }, 'Filters'),
        ui.campo({
          etiqueta: 'Service',
          control: ui.selector({ multiple: true, opciones: SERVICIOS_COSTO.map((x) => ({ valor: x.id, etiqueta: x.ce })), valores: p.servicios, placeholder: 'Choose services', filtrar: true, alCambiar: (v) => ((p.servicios = v), cambio()) })
        }),
        ui.campo({
          etiqueta: 'Tag',
          control: ui.selector({ opciones: [{ valor: '', etiqueta: '(none)' }, ...llavesActivas.map((l) => ({ valor: l, etiqueta: l }))], valor: p.etiquetaLlave ?? '', placeholder: 'Choose a tag key', alCambiar: (v) => ((p.etiquetaLlave = v || null), (p.etiquetaValores = []), cambio()) })
        }),
        p.etiquetaLlave
          ? ui.campo({
              etiqueta: `Values for ${p.etiquetaLlave}`,
              control: ui.selector({ multiple: true, opciones: [...valoresDeEtiqueta(e, p.etiquetaLlave).map((v) => ({ valor: v, etiqueta: v })), { valor: '__ninguno', etiqueta: `No tag key: ${p.etiquetaLlave}` }], valores: p.etiquetaValores, placeholder: 'Choose values', alCambiar: (v) => ((p.etiquetaValores = v), cambio()) })
            })
          : null,
        ui.campo({
          etiqueta: 'Instance type',
          control: ui.selector({ multiple: true, opciones: TIPOS_INSTANCIA.map((x) => ({ valor: x.tipo, etiqueta: x.tipo })), valores: p.tipos, placeholder: 'Choose instance types', alCambiar: (v) => ((p.tipos = v), cambio()) })
        }),
        ui.campo({ etiqueta: 'Region', control: ui.selector({ opciones: [{ valor: 'us-east-1', etiqueta: 'US East (N. Virginia)' }], valor: 'us-east-1', desactivado: true }) }),
        h('div', { class: 'cx-acciones' }, ui.boton('Clear all', { alClic: () => (Object.assign(p, parametrosIniciales()), cambio()) }))
      )
    });
  });

  const guardar = () => {
    const f = { nombre: guardado && !guardado.id.startsWith('aws-') ? guardado.nombre : '' };
    const m = cx.modal({
      titulo: 'Save to report library',
      contenido: ui.campo({ etiqueta: 'Report name', control: ui.entrada({ valor: f.nombre, placeholder: 'My cost report', alCambiar: (v) => (f.nombre = v) }) }),
      pie: [
        ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
        ui.boton('Save', {
          variante: 'primario',
          alClic: () => {
            const r = cx.hacer({ servicio: 'CostExplorer', accion: 'CreateReport', error: 'Failed to save report' }, (est) => guardarReporteCostos(est, { nombre: f.nombre, parametros: { ...p } }));
            if (r.ok) {
              m.cerrar();
              cx.flash({ tipo: 'exito', texto: `Report "${r.valor.nombre}" saved to the report library.`, accion: { texto: 'View reports', alClic: () => cx.ir(`${BASE}/reportes`) } });
            }
          }
        })
      ]
    });
  };

  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({
      titulo: guardado ? guardado.nombre : 'New cost and usage report',
      info: 'costos-cost-explorer',
      cx,
      descripcion: guardado?.descripcion ?? 'Visualize, understand and manage your AWS costs and usage over time.',
      acciones: [ui.boton('Save to report library', { escribe: true, alClic: guardar })]
    }),
    h('div', { class: 'cx-dos-columnas cx-costos-ce' }, resultado, h('div', { class: 'cx-lado' }, parametros))
  );
}

function reportes(cx) {
  migasBilling(cx, { texto: 'Cost Explorer saved reports' });
  const e = cx.estado;
  const filas = () => [...REPORTES_AWS.map((r) => ({ ...r, tipo: 'AWS managed' })), ...(e.costos?.reportes ?? []).map((r) => ({ ...r, tipo: 'Custom' }))];
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.tabla(cx, {
      titulo: 'Reports',
      info: 'costos-cost-explorer',
      filas,
      clave: (r) => r.id,
      seleccion: 'unica',
      filtro: 'Find reports',
      columnas: [
        { titulo: 'Report name', valor: (r) => ui.enlace(r.nombre, `${BASE}/cost-explorer/${r.id}`, { cx }) },
        { titulo: 'Report type', valor: () => 'Cost and usage' },
        { titulo: 'Created by', valor: (r) => r.tipo },
        { titulo: 'Created', valor: (r) => (r.creado ? ui.fecha(r.creado) : '–') }
      ],
      acciones: (sel) => [
        ui.boton('Delete', {
          escribe: true,
          desactivado: sel.length !== 1 || sel[0].tipo !== 'Custom',
          alClic: () =>
            cx.confirmar({
              titulo: 'Delete report',
              contenido: h('p', {}, `Delete the report "${sel[0].nombre}"? This can't be undone.`),
              aceptar: () => {
                const r = cx.hacer({ servicio: 'CostExplorer', accion: 'DeleteReport', error: 'Failed to delete report' }, (est) => eliminarReporteCostos(est, sel[0].id));
                if (r.ok) cx.flash({ tipo: 'exito', texto: `Report "${sel[0].nombre}" deleted.` });
              }
            })
        }),
        ui.boton('Create new report', { variante: 'primario', escribe: false, alClic: () => ((cx.memoria.ceParametros = parametrosIniciales()), cx.ir(`${BASE}/cost-explorer`)) })
      ]
    })
  );
}

/* ================================================ Cost Anomaly Detection */

function anomalias(cx) {
  migasBilling(cx, { texto: 'Cost Anomaly Detection' });
  const e = cx.estado;
  const st = { pestana: cx.memoria.pestanaAnomalias ?? 'historial' };
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Cost Anomaly Detection', info: 'costos-anomalias', cx, descripcion: 'Detect unusual spend with machine learning and get alerted before it adds up.', acciones: [ui.boton('Create monitor', { variante: 'primario', alClic: () => cx.ir(`${BASE}/anomalias/crear`) })] }),
    ui.pestanas({
      activa: st.pestana,
      alCambiar: (v) => (cx.memoria.pestanaAnomalias = v),
      pestanas: [
        {
          id: 'historial',
          texto: 'Detection history',
          contenido: () =>
            ui.tabla(cx, {
              titulo: 'Detection history',
              variante: 'contenedor',
              filas: () => anomaliasDeCostos(e),
              clave: (a) => a.id,
              seleccion: null,
              filtro: 'Find anomalies',
              columnas: [
                { titulo: 'Start date', valor: (a) => a.dia },
                { titulo: 'Last detected date', valor: (a) => a.dia },
                { titulo: 'Duration', valor: () => '1 day' },
                { titulo: 'Monitor name', valor: (a) => a.monitor },
                { titulo: 'Service', valor: (a) => a.servicioNombre },
                { titulo: 'Account', valor: () => e.cuenta.id },
                { titulo: 'Region', valor: () => 'us-east-1' },
                { titulo: 'Total cost impact', valor: (a) => dinero(a.impacto) },
                { titulo: 'Impact %', valor: (a) => (a.porcentaje === null ? '–' : `${a.porcentaje.toFixed(0)}%`) },
                { titulo: 'Actual spend', valor: (a) => dinero(a.real) },
                { titulo: 'Expected spend', valor: (a) => dinero(a.esperado) }
              ],
              vacio: { titulo: 'No anomalies', texto: 'No anomalies were detected in your account.' }
            })
        },
        {
          id: 'monitores',
          texto: 'Cost monitors',
          contenido: () =>
            ui.tabla(cx, {
              titulo: 'Cost monitors',
              variante: 'contenedor',
              filas: () => e.costos?.monitores ?? [],
              clave: (m) => m.id,
              seleccion: 'unica',
              filtro: 'Find monitors',
              columnas: [
                { titulo: 'Monitor name', valor: (m) => m.nombre },
                { titulo: 'Monitor type', valor: (m) => (m.tipo === 'TAG' ? 'Cost allocation tag' : 'AWS services') },
                { titulo: 'Monitored dimension', valor: (m) => (m.tipo === 'TAG' ? `Tag: ${m.llave}` : 'Service') },
                { titulo: 'Alert threshold', valor: (m) => `${dinero(m.umbral)} above expected spend` },
                { titulo: 'Frequency', valor: (m) => ({ DAILY: 'Daily summaries', IMMEDIATE: 'Individual alerts', WEEKLY: 'Weekly summaries' })[m.frecuencia] },
                { titulo: 'Recipients', valor: (m) => (m.correos.length ? m.correos.join(', ') : '–') },
                { titulo: 'Date created', valor: (m) => ui.fecha(m.creado) }
              ],
              acciones: (sel) => [
                ui.boton('Delete', {
                  escribe: true,
                  desactivado: sel.length !== 1,
                  alClic: () =>
                    cx.confirmar({
                      titulo: 'Delete cost monitor',
                      contenido: h('p', {}, `Delete the monitor "${sel[0].nombre}"? Its detection history is also deleted.`),
                      aceptar: () => {
                        const r = cx.hacer({ servicio: 'CostExplorer', accion: 'DeleteAnomalyMonitor', error: 'Failed to delete monitor' }, (est) => eliminarMonitorAnomalias(est, sel[0].id));
                        if (r.ok) cx.flash({ tipo: 'exito', texto: `Monitor "${sel[0].nombre}" deleted.` });
                      }
                    })
                })
              ],
              vacio: { titulo: 'No monitors', texto: 'Create a monitor to detect anomalies.' }
            })
        },
        {
          id: 'alertas',
          texto: 'Alert subscriptions',
          contenido: () =>
            ui.tabla(cx, {
              titulo: 'Alert subscriptions',
              variante: 'contenedor',
              filas: () => (e.costos?.monitores ?? []).filter((m) => m.correos.length),
              clave: (m) => m.id,
              seleccion: null,
              filtro: false,
              columnas: [
                { titulo: 'Subscription name', valor: (m) => `${m.nombre}-subscription` },
                { titulo: 'Monitors', valor: (m) => m.nombre },
                { titulo: 'Threshold', valor: (m) => dinero(m.umbral) },
                { titulo: 'Frequency', valor: (m) => m.frecuencia },
                { titulo: 'Recipients', valor: (m) => m.correos.join(', ') }
              ],
              vacio: { titulo: 'No alert subscriptions', texto: 'Add recipients when you create a monitor.' }
            })
        }
      ]
    })
  );
}

function crearMonitor(cx) {
  migasBilling(cx, { texto: 'Cost Anomaly Detection', ruta: `${BASE}/anomalias` }, { texto: 'Create monitor' });
  const e = cx.estado;
  const f = { tipo: (e.costos?.monitores ?? []).some((m) => m.tipo === 'SERVICE') ? 'TAG' : 'SERVICE', nombre: '', llave: null, umbral: '100', frecuencia: 'DAILY', correos: '', errores: {} };
  const forma = ui.region(() =>
    h(
      'div',
      { class: 'cx-pagina' },
      ui.contenedor({
        titulo: 'Choose monitor type',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.tarjetas({
            columnas: 2,
            valor: f.tipo,
            alCambiar: (v) => ((f.tipo = v), forma.repintar()),
            opciones: [
              { valor: 'SERVICE', etiqueta: 'AWS services - Recommended', descripcion: 'Monitors all the AWS services you use individually.' },
              { valor: 'TAG', etiqueta: 'Cost allocation tag', descripcion: 'Monitors the spend of the values of one tag key.' },
              { valor: 'ACCOUNT', etiqueta: 'Linked account', descripcion: 'Requires AWS Organizations.', desactivado: true },
              { valor: 'CATEGORY', etiqueta: 'Cost category', descripcion: 'Requires cost categories.', desactivado: true }
            ]
          }),
          ui.campo({ etiqueta: 'Monitor name', error: f.errores.nombre, control: ui.entrada({ valor: f.nombre, placeholder: 'my-services-monitor', alCambiar: (v) => (f.nombre = v) }) }),
          f.tipo === 'TAG'
            ? ui.campo({ etiqueta: 'Cost allocation tag', error: f.errores.llave, descripcion: 'Only active cost allocation tags are listed.', control: ui.selector({ opciones: (e.costos?.etiquetasActivas ?? []).map((l) => ({ valor: l, etiqueta: l })), valor: f.llave, vacio: 'No active tags', alCambiar: (v) => (f.llave = v) }) })
            : null
        )
      }),
      ui.contenedor({
        titulo: 'Configure alert subscription',
        descripcion: 'Get notified when an anomaly is detected.',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.campo({ etiqueta: 'Threshold', descripcion: 'Alert when the total cost impact of an anomaly is above this amount ($).', control: ui.entrada({ tipo: 'number', valor: f.umbral, sufijo: 'USD', alCambiar: (v) => (f.umbral = v) }) }),
          ui.campo({
            etiqueta: 'Alerting frequency',
            control: ui.radios({ valor: f.frecuencia, alCambiar: (v) => (f.frecuencia = v), opciones: [{ valor: 'IMMEDIATE', etiqueta: 'Individual alerts' }, { valor: 'DAILY', etiqueta: 'Daily summaries' }, { valor: 'WEEKLY', etiqueta: 'Weekly summaries' }] })
          }),
          ui.campo({ etiqueta: 'Alert recipients', opcional: true, descripcion: 'Email addresses, separated by commas.', control: ui.entrada({ valor: f.correos, placeholder: 'name@example.com', alCambiar: (v) => (f.correos = v) }) })
        )
      }),
      ui.pieFormulario({
        cancelar: () => cx.ir(`${BASE}/anomalias`),
        textoEnviar: 'Create monitor',
        enviar: () => {
          f.errores = {};
          if (!f.nombre.trim()) f.errores.nombre = 'Monitor name is required.';
          if (f.tipo === 'TAG' && !f.llave) f.errores.llave = 'Select a cost allocation tag.';
          if (Object.keys(f.errores).length) return forma.repintar();
          const r = cx.hacer({ servicio: 'CostExplorer', accion: 'CreateAnomalyMonitor', error: 'Failed to create monitor' }, (est) => crearMonitorAnomalias(est, { nombre: f.nombre, tipo: f.tipo, llave: f.llave, umbral: numero(f.umbral), frecuencia: f.frecuencia, correos: lista(f.correos) }));
          if (r.ok) {
            cx.memoria.pestanaAnomalias = 'monitores';
            cx.flash({ tipo: 'exito', texto: `Successfully created monitor "${r.valor.nombre}".` });
            cx.ir(`${BASE}/anomalias`);
          }
        }
      })
    )
  );
  return h('div', { class: 'cx-pagina cx-pagina--form' }, ui.encabezado({ titulo: 'Create monitor', info: 'costos-anomalias', cx }), forma);
}

/* ============================================================ Free Tier */

/** Cuánto se usó de cada oferta de la capa gratuita este mes (sin el histórico sintético). */
function usoCapaGratuita(e) {
  const t = ahora();
  const mes = claveMes(t);
  const lineas = lineasDelMes(e, mes).filter((l) => !l.sintetica);
  const fraccion = (t - Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 1)) / (finMes(mes) - Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 1));
  return OFERTAS_CAPA_GRATUITA.map((o) => {
    let usado = lineas.filter((l) => o.usos.includes(l.uso)).reduce((a, l) => a + l.cantidad, 0);
    if (o.unidad === 'Alarms') usado = (e.cloudwatch?.alarmas ?? []).length;
    const tasa = recursosFacturables(e).filter((r) => o.usos.includes(r.uso)).reduce((a, r) => a + r.porHora, 0);
    const pronostico = o.unidad === 'Alarms' ? usado : usado + tasa * ((finMes(mes) - t) / 3_600_000);
    return { ...o, usado, pronostico, porcentaje: (usado / o.limite) * 100, fraccion };
  }).sort((a, b) => b.porcentaje - a.porcentaje);
}

function capaGratuita(cx) {
  migasBilling(cx, { texto: 'Free Tier' });
  const e = cx.estado;
  const fmt = (n, u) => `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${u}`;
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Free Tier', info: 'costos-free-tier', cx, descripcion: 'Track your AWS Free Tier usage for the current month.' }),
    ui.alerta({ tipo: 'info', titulo: 'Así lo cuenta el simulador', contenido: 'La tabla muestra cuánto llevas usado de cada oferta. Para que veas el precio real de lo que usas, el simulador no descuenta la capa gratuita de la factura. Desde julio de 2025 las cuentas nuevas de AWS reciben créditos en lugar de los 12 meses gratis; las ofertas «Always Free» siguen igual.' }),
    ui.tabla(cx, {
      titulo: 'Free Tier offers in use',
      variante: 'contenedor',
      filas: () => usoCapaGratuita(e),
      clave: (o) => o.texto,
      seleccion: null,
      filtro: 'Find offers',
      columnas: [
        { titulo: 'Service', valor: (o) => o.servicio },
        { titulo: 'Free Tier type', valor: (o) => o.tipo },
        { titulo: 'Free Tier usage limit', valor: (o) => o.texto },
        { titulo: 'Current usage', valor: (o) => fmt(o.usado, o.unidad) },
        { titulo: 'Forecasted usage', valor: (o) => fmt(o.pronostico, o.unidad) },
        { titulo: 'MTD actual usage %', valor: (o) => h('span', { class: 'cx-costos-celda-progreso' }, porcentaje(o.porcentaje), barraProgreso(o.porcentaje / 100, { peligro: o.porcentaje >= 85 })) },
        { titulo: 'MTD forecasted usage %', valor: (o) => (o.pronostico / o.limite >= 1 ? ui.estado('aviso', porcentaje((o.pronostico / o.limite) * 100)) : porcentaje((o.pronostico / o.limite) * 100)) }
      ]
    })
  );
}

/* ============================================================== Budgets */

const TIPOS_PRESUPUESTO = { COST: 'Cost budget', USAGE: 'Usage budget', SAVINGS_PLANS_COVERAGE: 'Savings Plans coverage', SAVINGS_PLANS_UTILIZATION: 'Savings Plans utilization', RI_UTILIZATION: 'Reservation utilization', RI_COVERAGE: 'Reservation coverage' };
const PERIODOS = { MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', ANNUALLY: 'Annually', DAILY: 'Daily' };
const valorPresupuesto = (b, n) => (b.unidad === 'USD' ? dinero(n) : b.unidad === 'Hrs' ? `${(Number(n) || 0).toFixed(2)} Hrs` : porcentaje(n));
/** ¿El presupuesto ya se pasó de verdad? (lo gastado supera el monto o una alerta ACTUAL se disparó). */
const excedidoReal = (b, st) => (b.unidad === 'PERCENTAGE' ? st.excedido : st.usado > b.monto || st.alertas.some((a) => a.excedida && a.disparador === 'ACTUAL'));
const presDe = (cx, nombre) => (cx.estado.costos?.presupuestos ?? []).find((b) => b.nombre === nombre);

function presupuestos(cx) {
  migasBilling(cx, { texto: 'Budgets' });
  const e = cx.estado;
  const t = ui.tabla(cx, {
    titulo: 'Budgets',
    info: 'costos-presupuesto',
    filas: () => (e.costos?.presupuestos ?? []).map((b) => ({ b, st: estadoPresupuesto(e, b) })),
    clave: (x) => x.b.nombre,
    seleccion: 'unica',
    filtro: 'Find budgets',
    columnas: [
      { titulo: 'Name', valor: (x) => ui.enlace(x.b.nombre, `${BASE}/presupuestos/${encodeURIComponent(x.b.nombre)}`, { cx }), texto: (x) => x.b.nombre },
      { titulo: 'Thresholds', valor: (x) => (x.b.alertas.length ? (x.st.excedido ? ui.estado('error', 'Exceeded') : ui.estado('exito', 'OK')) : ui.estado('inactivo', 'No alerts')) },
      { titulo: 'Budget', valor: (x) => valorPresupuesto(x.b, x.b.monto) },
      { titulo: 'Amount used', valor: (x) => (x.b.unidad === 'PERCENTAGE' ? porcentaje(x.st.usado) : valorPresupuesto(x.b, x.st.usado)) },
      { titulo: 'Forecasted amount', valor: (x) => (x.b.unidad === 'PERCENTAGE' ? '–' : valorPresupuesto(x.b, x.st.pronostico)) },
      { titulo: 'Current vs. budgeted', valor: (x) => (x.b.unidad === 'PERCENTAGE' ? '–' : h('span', { class: 'cx-costos-celda-progreso' }, porcentaje(x.st.porcentajeUsado), barraProgreso(x.st.porcentajeUsado / 100, { peligro: x.st.porcentajeUsado >= 100 }))) },
      { titulo: 'Forecasted vs. budgeted', valor: (x) => (x.b.unidad === 'PERCENTAGE' ? '–' : porcentaje(x.st.porcentajePronostico)) },
      { titulo: 'Budget type', valor: (x) => TIPOS_PRESUPUESTO[x.b.tipo] ?? x.b.tipo }
    ],
    acciones: (sel) => [
      ui.menuBoton(
        'Actions',
        () => [
          { texto: 'Edit', escribe: true, desactivado: sel.length !== 1, alClic: () => cx.ir(`${BASE}/presupuestos/${encodeURIComponent(sel[0].b.nombre)}/editar`) },
          { texto: 'Delete', escribe: true, desactivado: sel.length !== 1, alClic: () => borrarPresupuesto(cx, sel[0].b.nombre) },
          { texto: 'Copy', desactivado: true },
          { texto: 'Download CSV', desactivado: !sel.length, alClic: () => descargar('budgets.csv', csv([['Budget name', 'Budget', 'Amount used', 'Forecasted amount'], ...sel.map((x) => [x.b.nombre, x.b.monto, x.st.usado.toFixed(2), x.st.pronostico.toFixed(2)])])) }
        ],
        { desactivado: !sel.length }
      ),
      ui.boton('Create budget', { variante: 'primario', alClic: () => cx.ir(`${BASE}/presupuestos/crear`) })
    ],
    vacio: { titulo: 'No budgets', texto: 'You haven’t created any budgets yet.', accion: () => ui.boton('Create budget', { escribe: true, alClic: () => cx.ir(`${BASE}/presupuestos/crear`) }) }
  });
  const resumen = cx.vivo(() => {
    const lista = (e.costos?.presupuestos ?? []).map((b) => ({ b, st: estadoPresupuesto(e, b) }));
    return ui.contenedor({
      titulo: 'Overview',
      cuerpo: h(
        'div',
        { class: 'cx-costos-cifras' },
        cifra('Total budgets', String(lista.length)),
        cifra('Budgets exceeded', String(lista.filter((x) => excedidoReal(x.b, x.st)).length)),
        cifra('Budgets forecasted to exceed', String(lista.filter((x) => x.b.unidad !== 'PERCENTAGE' && !excedidoReal(x.b, x.st) && x.st.porcentajePronostico > 100).length))
      )
    });
  });
  return h('div', { class: 'cx-pagina' }, resumen, t);
}

function borrarPresupuesto(cx, nombre) {
  cx.confirmar({
    titulo: `Delete ${nombre}?`,
    textoBoton: 'Delete',
    contenido: h('p', {}, 'Deleting this budget also deletes its alerts and actions. This action can’t be undone.'),
    aceptar: () => {
      const r = cx.hacer({ servicio: 'Budgets', accion: 'DeleteBudget', error: 'Failed to delete budget' }, (e) => eliminarPresupuesto(e, nombre));
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: `Successfully deleted budget "${nombre}".` });
        if (cx.ruta !== `${BASE}/presupuestos`) cx.ir(`${BASE}/presupuestos`);
      }
    }
  });
}

function detallePresupuesto(cx, { nombre }) {
  migasBilling(cx, { texto: 'Budgets', ruta: `${BASE}/presupuestos` }, { texto: nombre });
  const e = cx.estado;
  if (!presDe(cx, nombre)) return ui.noDisponible('Budget not found', `El presupuesto «${nombre}» no existe o ya se borró.`);
  const pest = { activa: 'detalles' };
  return cx.vivo(() => {
    const b = presDe(cx, nombre);
    if (!b) return ui.noDisponible('Budget not found', `El presupuesto «${nombre}» no existe o ya se borró.`);
    const st = estadoPresupuesto(e, b);
    const f = b.filtros ?? {};
    const alcance = [...(f.servicios ?? []).map((x) => `Service: ${servicioCosto(x)?.ce ?? x}`), ...(f.etiquetas ?? []).map((x) => `Tag: ${x.llave}${x.valor ? ` = ${x.valor}` : ''}`)];
    const porcentual = b.unidad === 'PERCENTAGE';
    const t = ahora();
    const historial = b.tipo === 'COST' && b.periodo === 'MONTHLY' ? consultarCostos(e, { desde: sumarMeses(claveMes(t), -5), hasta: claveMes(t), filtro: { servicios: f.servicios, etiquetas: f.etiquetas } }, t) : null;
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({
        titulo: b.nombre,
        info: 'costos-presupuesto',
        cx,
        acciones: [ui.boton('Delete', { escribe: true, alClic: () => borrarPresupuesto(cx, b.nombre) }), ui.boton('Edit', { escribe: true, alClic: () => cx.ir(`${BASE}/presupuestos/${encodeURIComponent(b.nombre)}/editar`) })]
      }),
      ui.contenedor({
        titulo: 'Budget health',
        cuerpo: h(
          'div',
          { class: 'cx-costos-cifras' },
          cifra(porcentual ? 'Current' : 'Current vs. budgeted', porcentual ? porcentaje(st.usado) : `${valorPresupuesto(b, st.usado)} of ${valorPresupuesto(b, b.monto)}`, porcentual ? null : h('span', { class: 'cx-costos-celda-progreso' }, porcentaje(st.porcentajeUsado), barraProgreso(st.porcentajeUsado / 100, { peligro: st.porcentajeUsado >= 100 }))),
          porcentual ? cifra('Target', porcentaje(b.monto)) : cifra('Forecasted vs. budgeted', valorPresupuesto(b, st.pronostico), porcentaje(st.porcentajePronostico), 'costos-pronostico', cx),
          cifra('Alerts', st.alertas.length ? (st.excedido ? ui.estado('error', `${st.alertas.filter((a) => a.excedida).length} exceeded`) : ui.estado('exito', 'OK')) : ui.estado('inactivo', 'No alerts'))
        )
      }),
      ui.pestanas({
        activa: pest.activa,
        alCambiar: (v) => (pest.activa = v),
        pestanas: [
          {
            id: 'detalles',
            texto: 'Details',
            contenido: () =>
              ui.contenedor({
                titulo: 'Details',
                cuerpo: ui.pares(
                  [
                    { etiqueta: 'Budget name', valor: b.nombre },
                    { etiqueta: 'Budget type', valor: TIPOS_PRESUPUESTO[b.tipo] },
                    { etiqueta: 'Period', valor: PERIODOS[b.periodo] },
                    { etiqueta: 'Budget renewal type', valor: b.renovacion === 'RECURRING' ? 'Recurring budget' : 'Expiring budget' },
                    { etiqueta: 'Budgeting method', valor: 'Fixed' },
                    { etiqueta: porcentual ? 'Target' : 'Budgeted amount', valor: valorPresupuesto(b, b.monto) },
                    { etiqueta: 'Budget scope', valor: alcance.length ? alcance.join(', ') : 'All AWS services' },
                    { etiqueta: 'Created', valor: ui.fecha(b.creado) },
                    { etiqueta: 'ARN', valor: ui.copiable(b.arn) }
                  ],
                  { columnas: 3 }
                )
              })
          },
          {
            id: 'alertas',
            texto: `Alerts (${b.alertas.length})`,
            contenido: () =>
              ui.contenedor({
                titulo: 'Alerts',
                contador: st.alertas.length,
                sinRelleno: true,
                cuerpo: st.alertas.length
                  ? h(
                      'table',
                      { class: 'cx-tabla__tabla' },
                      h('thead', {}, h('tr', {}, ['Threshold', 'Trigger', 'Status', 'Email recipients', 'Amazon SNS topic', 'Last triggered'].map((c) => h('th', {}, h('span', { class: 'cx-tabla__orden' }, c))))),
                      h(
                        'tbody',
                        {},
                        st.alertas.map((a) =>
                          h(
                            'tr',
                            {},
                            h('td', { style: { paddingLeft: '20px' } }, a.tipoUmbral === 'PERCENTAGE' && !porcentual ? `${a.umbral}% (${valorPresupuesto(b, a.valorUmbral)})` : valorPresupuesto(b, a.valorUmbral)),
                            h('td', {}, a.disparador === 'ACTUAL' ? 'Actual' : 'Forecasted'),
                            h('td', {}, a.excedida ? ui.estado('error', 'Exceeded') : ui.estado('exito', 'OK')),
                            h('td', {}, a.correos.join(', ') || '–'),
                            h('td', {}, a.temaSns ?? '–'),
                            h('td', {}, a.disparadaEn ? ui.fecha(a.disparadaEn) : '–')
                          )
                        )
                      )
                    )
                  : h('div', { class: 'cx-tabla__vacia' }, h('b', {}, 'No alerts'), h('div', {}, 'Edit the budget to add an alert threshold.'))
              })
          },
          {
            id: 'historial',
            texto: 'Budget history',
            contenido: () =>
              ui.contenedor({
                titulo: 'Budget history',
                descripcion: historial ? 'Actual costs of the last 6 months compared with the budgeted amount.' : null,
                cuerpo: historial
                  ? h(
                      'div',
                      {},
                      graficaBarras({ columnas: historial.periodos.map((x) => ({ etiqueta: mesCorto(x.clave), valores: { 'Actual cost': x.total } })), grupos: ['Actual cost'], alto: 200 }),
                      h('p', { class: 'cx-texto-sec' }, `Budgeted amount: ${dinero(b.monto)} per month`)
                    )
                  : h('p', { class: 'cx-texto-sec' }, 'Budget history is available for monthly cost budgets.')
              })
          }
        ]
      })
    );
  });
}

/* ------------------------------------------------- asistente de Budgets */

const PLANTILLAS = [
  { valor: 'zero', etiqueta: 'Zero spend budget', descripcion: 'Create a budget that notifies you once your spending exceeds $0.01 which is above the AWS Free Tier limits.', nombre: 'My Zero-Spend Budget' },
  { valor: 'mensual', etiqueta: 'Monthly cost budget', descripcion: 'Create a monthly budget that notifies you if you exceed, or are forecasted to exceed, the budget amount.', nombre: 'My Monthly Cost Budget' },
  { valor: 'sp-cobertura', etiqueta: 'Daily Savings Plans coverage budget', descripcion: 'Create a coverage budget for your Savings Plans that notifies you when you fall below the defined target.', nombre: 'My Savings Plans Coverage Budget' },
  { valor: 'ri-utilizacion', etiqueta: 'Daily reservation utilization budget', descripcion: 'Create a utilization budget for your reservations that notifies you when you fall below the defined target.', nombre: 'My Reservation Utilization Budget' }
];
const PASOS_PERSONALIZADO = ['Choose budget type', 'Set your budget', 'Configure alerts', 'Attach actions - optional', 'Review'];

// Como en la consola: el umbral va vacío (lo decide quien crea el presupuesto); las plantillas sí traen los suyos.
const alertaNueva = (correos = '') => ({ id: undefined, umbral: '', tipoUmbral: 'PERCENTAGE', disparador: 'ACTUAL', correos, temaSns: '' });

function asistentePresupuesto(cx, { nombre } = {}) {
  const e = cx.estado;
  const editar = nombre ? presDe(cx, nombre) : null;
  migasBilling(cx, { texto: 'Budgets', ruta: `${BASE}/presupuestos` }, ...(editar ? [{ texto: editar.nombre, ruta: `${BASE}/presupuestos/${encodeURIComponent(editar.nombre)}` }, { texto: 'Edit budget' }] : [{ texto: 'Create budget' }]));
  if (nombre && !editar) return ui.noDisponible('Budget not found', `El presupuesto «${nombre}» no existe o ya se borró.`);
  const f = editar
    ? {
        paso: 1,
        modo: 'personalizado',
        plantilla: null,
        nombre: editar.nombre,
        tipo: editar.tipo,
        periodo: editar.periodo,
        renovacion: editar.renovacion,
        monto: String(editar.monto),
        alcance: editar.filtros?.servicios?.length || editar.filtros?.etiquetas?.length ? 'filtrar' : 'todo',
        servicios: [...(editar.filtros?.servicios ?? [])],
        etiquetaLlave: editar.filtros?.etiquetas?.[0]?.llave ?? null,
        etiquetaValores: (editar.filtros?.etiquetas ?? []).map((x) => x.valor),
        alertas: editar.alertas.map((a) => ({ id: a.id, umbral: String(a.umbral), tipoUmbral: a.tipoUmbral, disparador: a.disparador, correos: a.correos.join(', '), temaSns: a.temaSns ?? '' })),
        correos: '',
        errores: {}
      }
    : { paso: 0, modo: 'plantilla', plantilla: 'mensual', nombre: 'My Monthly Cost Budget', tipo: 'COST', periodo: 'MONTHLY', renovacion: 'RECURRING', monto: '', alcance: 'todo', servicios: [], etiquetaLlave: null, etiquetaValores: [], alertas: [], correos: '', errores: {} };

  const parametros = () => ({
    nombre: f.nombre,
    tipo: f.tipo,
    periodo: f.periodo,
    renovacion: f.renovacion,
    monto: numero(f.monto),
    filtros: f.alcance === 'filtrar' ? { servicios: f.servicios, etiquetas: f.etiquetaLlave ? f.etiquetaValores.map((v) => ({ llave: f.etiquetaLlave, valor: v === '__ninguno' ? '' : v })) : [] } : { servicios: [], etiquetas: [] },
    alertas: f.alertas.map((a) => ({ id: a.id, umbral: numero(a.umbral), tipoUmbral: a.tipoUmbral, disparador: a.disparador, correos: lista(a.correos), temaSns: a.temaSns.trim() || null }))
  });

  const crear = () => {
    const accion = editar ? 'UpdateBudget' : 'CreateBudget';
    const r = cx.hacer({ servicio: 'Budgets', accion, error: editar ? 'Budget update failed' : 'Budget creation failed' }, (est) =>
      editar ? editarPresupuesto(est, editar.nombre, parametros()) : f.modo === 'plantilla' ? crearPresupuesto(est, { nombre: f.nombre, plantilla: f.plantilla, monto: numero(f.monto), correos: lista(f.correos) }) : crearPresupuesto(est, parametros())
    );
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: editar ? `Successfully updated budget "${r.valor.nombre}".` : `Your budget ${r.valor.nombre} has been created successfully.`, accion: { texto: 'View budget', alClic: () => cx.ir(`${BASE}/presupuestos/${encodeURIComponent(r.valor.nombre)}`) } });
      cx.ir(`${BASE}/presupuestos`);
    }
  };

  // Lo que la consola valida en el navegador antes de avanzar de paso.
  const validar = () => {
    f.errores = {};
    if (f.paso === 0 && f.modo === 'plantilla') {
      if (!f.nombre.trim()) f.errores.nombre = 'Budget name is required.';
      if (f.plantilla === 'mensual' && !(numero(f.monto) > 0)) f.errores.monto = 'Enter a budgeted amount greater than 0.';
      if (!lista(f.correos).length) f.errores.correos = 'Enter at least one email recipient.';
    }
    if (f.paso === 1) {
      if (!f.nombre.trim()) f.errores.nombre = 'Budget name is required.';
      if (!(numero(f.monto) > 0)) f.errores.monto = f.tipo === 'COST' ? 'Enter a budgeted amount greater than 0.' : 'Enter a value greater than 0.';
      if (f.alcance === 'filtrar' && !f.servicios.length && !(f.etiquetaLlave && f.etiquetaValores.length)) f.errores.alcance = 'Choose at least one filter value, or choose All AWS services.';
    }
    if (f.paso === 2) {
      f.alertas.forEach((a, i) => {
        if (!(numero(a.umbral) > 0)) f.errores[`umbral${i}`] = 'Enter a threshold greater than 0.';
        if (!lista(a.correos).length && !a.temaSns.trim()) f.errores[`correos${i}`] = 'Enter at least one email recipient or an Amazon SNS topic ARN.';
      });
    }
    return !Object.keys(f.errores).length;
  };

  const repintar = () => cuerpo.repintar();
  const ir = (paso) => {
    f.paso = paso;
    repintar();
    cx.raiz.querySelector('.cx-principal')?.scrollTo?.(0, 0);
  };

  const pasoTipo = () => {
    const plantilla = PLANTILLAS.find((p) => p.valor === f.plantilla);
    return [
      ui.contenedor({
        titulo: 'Budget setup',
        cuerpo: ui.tarjetas({
          columnas: 2,
          valor: f.modo,
          alCambiar: (v) => ((f.modo = v), repintar()),
          opciones: [
            { valor: 'plantilla', etiqueta: 'Use a template (simplified)', descripcion: 'Use the recommended configurations. You can change some configuration options after the budget is created.' },
            { valor: 'personalizado', etiqueta: 'Customize (advanced)', descripcion: 'Customize a budget to set parameters specific to your use case. You can customize the time period, the start month, and specific accounts.' }
          ]
        })
      }),
      f.modo === 'plantilla'
        ? [
            ui.contenedor({
              titulo: 'Templates - new',
              descripcion: 'Choose a template that best matches your use case.',
              cuerpo: ui.tarjetas({ columnas: 2, valor: f.plantilla, alCambiar: (v) => ((f.plantilla = v), (f.nombre = PLANTILLAS.find((p) => p.valor === v).nombre), repintar()), opciones: PLANTILLAS.map(({ valor, etiqueta, descripcion }) => ({ valor, etiqueta, descripcion })) })
            }),
            ui.contenedor({
              titulo: plantilla.etiqueta,
              cuerpo: h(
                'div',
                { class: 'cx-form' },
                ui.campo({ etiqueta: 'Budget name', info: 'costos-presupuesto', cx, descripcion: 'Provide a descriptive name for this budget.', error: f.errores.nombre, restriccion: 'Names must be between 1-100 characters.', control: ui.entrada({ valor: f.nombre, alCambiar: (v) => (f.nombre = v) }) }),
                f.plantilla === 'mensual' ? ui.campo({ etiqueta: 'Enter your budgeted amount ($)', error: f.errores.monto, control: ui.entrada({ tipo: 'number', valor: f.monto, placeholder: '0.00', alCambiar: (v) => (f.monto = v) }) }) : null,
                ui.campo({ etiqueta: 'Email recipients', info: 'costos-alertas', cx, descripcion: 'Specify the email recipients you want to notify when the threshold has exceeded.', error: f.errores.correos, restriccion: 'Separate email addresses with commas. You can add up to 10 recipients.', control: ui.entrada({ valor: f.correos, placeholder: 'example@email.com', alCambiar: (v) => (f.correos = v) }) }),
                ui.alerta({
                  tipo: 'info',
                  contenido: h(
                    'div',
                    {},
                    h('b', {}, 'You will be notified via email when:'),
                    f.plantilla === 'mensual'
                      ? h('ol', { class: 'cx-costos-ol' }, h('li', {}, 'Your actual spend reaches 85%'), h('li', {}, 'Your actual spend reaches 100%'), h('li', {}, 'If your forecasted spend is expected to reach 100%.'))
                      : f.plantilla === 'zero'
                        ? h('ol', { class: 'cx-costos-ol' }, h('li', {}, 'Your actual spend exceeds $0.01.'))
                        : h('ol', { class: 'cx-costos-ol' }, h('li', {}, `Your ${f.plantilla === 'sp-cobertura' ? 'Savings Plans coverage' : 'reservation utilization'} falls below 80% for the day.`))
                  )
                }),
                h('div', { class: 'cx-texto-sec' }, 'Budget scope: All AWS services (Recommended). Budgets are evaluated against unblended costs.')
              )
            })
          ]
        : ui.contenedor({
            titulo: 'Budget types',
            cuerpo: ui.tarjetas({
              columnas: 2,
              valor: f.tipo,
              alCambiar: (v) => ((f.tipo = v), (f.periodo = v === 'COST' || v === 'USAGE' ? f.periodo : 'MONTHLY'), repintar()),
              opciones: [
                { valor: 'COST', etiqueta: 'Cost budget - Recommended', descripcion: 'Monitor your costs against a specified dollar amount and receive alerts when your user-defined thresholds are met.' },
                { valor: 'USAGE', etiqueta: 'Usage budget', descripcion: 'Monitor your usage of one or more specified usage types or usage type groups and receive alerts when your thresholds are met.' },
                { valor: 'SAVINGS_PLANS_COVERAGE', etiqueta: 'Savings Plans budget', descripcion: 'Track the utilization or coverage associated with your Savings Plans and receive alerts when they fall below your threshold.' },
                { valor: 'RI_UTILIZATION', etiqueta: 'Reservation budget', descripcion: 'Track the utilization or coverage associated with your reservations and receive alerts when they fall below your threshold.' }
              ]
            })
          })
    ];
  };

  const pasoMonto = () => {
    const porcentual = f.tipo !== 'COST' && f.tipo !== 'USAGE';
    const llavesActivas = e.costos?.etiquetasActivas ?? [];
    return [
      ui.contenedor({
        titulo: 'Details',
        cuerpo: ui.campo({ etiqueta: 'Budget name', descripcion: 'Provide a descriptive name for this budget.', error: f.errores.nombre, restriccion: 'Names must be between 1-100 characters.', control: ui.entrada({ valor: f.nombre, desactivado: Boolean(editar), alCambiar: (v) => (f.nombre = v) }) })
      }),
      ui.contenedor({
        titulo: porcentual ? 'Set utilization or coverage threshold' : 'Set budget amount',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          f.tipo === 'USAGE' ? ui.campo({ etiqueta: 'Usage type groups', descripcion: 'The simulator tracks EC2 running hours.', control: ui.selector({ opciones: [{ valor: 'ec2', etiqueta: 'EC2: Running Hours', descripcion: 'Hrs' }], valor: 'ec2', desactivado: true }) }) : null,
          ui.campo({
            etiqueta: 'Period',
            control: ui.selector({ opciones: Object.entries(PERIODOS).map(([valor, etiqueta]) => ({ valor, etiqueta, desactivado: porcentual && valor !== 'MONTHLY' && valor !== 'DAILY' })), valor: f.periodo, alCambiar: (v) => (f.periodo = v) })
          }),
          ui.campo({
            etiqueta: 'Budget renewal type',
            control: ui.radios({ valor: f.renovacion, alCambiar: (v) => (f.renovacion = v), opciones: [{ valor: 'RECURRING', etiqueta: 'Recurring budget', descripcion: 'A recurring budget renews on the first day of every billing period.' }, { valor: 'EXPIRING', etiqueta: 'Expiring budget', descripcion: 'An expiring budget stops on the end date of the budget.' }] })
          }),
          ui.campo({ etiqueta: 'Start month', control: ui.selector({ opciones: [{ valor: claveMes(ahora()), etiqueta: nombreMes(claveMes(ahora())) }], valor: claveMes(ahora()), desactivado: true }) }),
          ui.campo({
            etiqueta: 'Budgeting method',
            control: ui.selector({ opciones: [{ valor: 'FIXED', etiqueta: 'Fixed', descripcion: 'Create a budget that tracks against a single budgeted amount.' }, { valor: 'PLANNED', etiqueta: 'Planned', desactivado: true }, { valor: 'AUTO', etiqueta: 'Auto-adjusting', desactivado: true }], valor: 'FIXED' })
          }),
          ui.campo({
            etiqueta: porcentual ? 'Utilization threshold (%)' : f.tipo === 'USAGE' ? 'Budgeted amount (Hrs)' : 'Enter your budgeted amount ($)',
            error: f.errores.monto,
            control: ui.entrada({ tipo: 'number', valor: f.monto, placeholder: porcentual ? '80' : '0.00', alCambiar: (v) => (f.monto = v) })
          })
        )
      }),
      f.tipo === 'COST' || f.tipo === 'USAGE'
        ? ui.contenedor({
            titulo: 'Budget scope',
            cuerpo: h(
              'div',
              { class: 'cx-form' },
              ui.radios({
                valor: f.alcance,
                alCambiar: (v) => ((f.alcance = v), repintar()),
                opciones: [
                  { valor: 'todo', etiqueta: 'All AWS services (Recommended)', descripcion: 'Track any cost incurred from any service for this account as part of the budget scope.' },
                  { valor: 'filtrar', etiqueta: 'Filter specific AWS cost dimensions', descripcion: 'Select specific dimensions to budget against. For example, you can choose to track costs for a specific service or a tag.' }
                ]
              }),
              f.alcance === 'filtrar'
                ? h(
                    'div',
                    { class: 'cx-bloque cx-form' },
                    f.errores.alcance ? ui.alerta({ tipo: 'error', contenido: f.errores.alcance }) : null,
                    ui.campo({ etiqueta: 'Service', opcional: true, control: ui.selector({ multiple: true, opciones: SERVICIOS_COSTO.map((x) => ({ valor: x.id, etiqueta: x.ce })), valores: f.servicios, placeholder: 'Choose services', filtrar: true, alCambiar: (v) => (f.servicios = v) }) }),
                    ui.campo({
                      etiqueta: 'Tag',
                      opcional: true,
                      descripcion: llavesActivas.length ? 'Only active cost allocation tags are listed.' : 'No active cost allocation tags. Activate a tag in Cost allocation tags to filter by it.',
                      control: ui.selector({ opciones: llavesActivas.map((l) => ({ valor: l, etiqueta: l })), valor: f.etiquetaLlave, placeholder: 'Choose a tag key', vacio: 'No active tags', alCambiar: (v) => ((f.etiquetaLlave = v), (f.etiquetaValores = []), repintar()) })
                    }),
                    f.etiquetaLlave
                      ? ui.campo({
                          etiqueta: `Values for ${f.etiquetaLlave}`,
                          control: ui.selector({ multiple: true, opciones: [...valoresDeEtiqueta(e, f.etiquetaLlave).map((v) => ({ valor: v, etiqueta: v })), { valor: '__ninguno', etiqueta: `No tag key: ${f.etiquetaLlave}` }], valores: f.etiquetaValores, placeholder: 'Choose values', alCambiar: (v) => (f.etiquetaValores = v) })
                        })
                      : null
                  )
                : null
            )
          })
        : null,
      ui.expandible({ titulo: 'Advanced options', contenido: ui.campo({ etiqueta: 'Aggregate costs by', control: ui.selector({ opciones: [{ valor: 'unblended', etiqueta: 'Unblended costs' }], valor: 'unblended', desactivado: true }) }) })
    ];
  };

  const pasoAlertas = () => [
    f.alertas.map((a, i) =>
      ui.contenedor({
        titulo: `Alert #${i + 1}`,
        acciones: ui.boton('Remove alert', { alClic: () => (f.alertas.splice(i, 1), repintar()) }),
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          h('h3', { class: 'cx-costos-subtitulo' }, 'Set alert threshold'),
          h(
            'div',
            { class: 'cx-fila-campos' },
            ui.campo({ etiqueta: 'Threshold', error: f.errores[`umbral${i}`], control: ui.entrada({ tipo: 'number', valor: a.umbral, placeholder: 'Enter a value', alCambiar: (v) => (a.umbral = v) }) }),
            ui.campo({ etiqueta: 'Type', control: ui.selector({ opciones: [{ valor: 'PERCENTAGE', etiqueta: '% of budgeted amount' }, { valor: 'ABSOLUTE_VALUE', etiqueta: 'Absolute value' }], valor: a.tipoUmbral, alCambiar: (v) => (a.tipoUmbral = v) }) }),
            ui.campo({ etiqueta: 'Trigger', info: 'costos-alertas', cx, control: ui.selector({ opciones: [{ valor: 'ACTUAL', etiqueta: 'Actual' }, { valor: 'FORECASTED', etiqueta: 'Forecasted', desactivado: f.tipo !== 'COST' && f.tipo !== 'USAGE' }], valor: a.disparador, alCambiar: (v) => (a.disparador = v) }) })
          ),
          h('h3', { class: 'cx-costos-subtitulo' }, 'Notification preferences - Optional'),
          ui.campo({ etiqueta: 'Email recipients', error: f.errores[`correos${i}`], descripcion: 'Specify the email recipients you want to notify when the threshold has exceeded.', restriccion: 'Separate email addresses with commas. You can add up to 10 recipients.', control: ui.entrada({ valor: a.correos, placeholder: 'example@email.com', alCambiar: (v) => (a.correos = v) }) }),
          ui.campo({ etiqueta: 'Amazon SNS Alerts', opcional: true, descripcion: 'Enter the ARN of an Amazon SNS topic. The topic policy must allow AWS Budgets to publish.', control: ui.entrada({ valor: a.temaSns, placeholder: 'arn:aws:sns:us-east-1:123456789012:my-topic', alCambiar: (v) => (a.temaSns = v) }) })
        )
      })
    ),
    f.alertas.length ? null : ui.alerta({ tipo: 'info', contenido: 'This budget has no alerts. Add an alert threshold to get notified by email.' }),
    h('div', {}, ui.boton('Add an alert threshold', { desactivado: f.alertas.length >= 5, alClic: () => (f.alertas.push(alertaNueva(f.alertas[0]?.correos ?? '')), repintar()) }), h('div', { class: 'cx-campo__restriccion' }, `You can add up to 5 alerts. ${5 - f.alertas.length} remaining.`))
  ];

  const pasoAcciones = () =>
    ui.contenedor({
      titulo: 'Attach actions - optional',
      descripcion: 'Budget actions run automatically (or after approval) when an alert threshold is exceeded, for example to apply an IAM policy or an SCP, or to stop EC2 or RDS instances.',
      cuerpo: h('div', { class: 'cx-form' }, ui.alerta({ tipo: 'info', contenido: 'Las acciones de presupuesto necesitan un rol de IAM para Budgets. En el simulador no se configuran: tus alertas solo mandan correo (y SNS si lo pusiste).' }), ui.boton('Add action', { desactivado: true }))
    });

  const pasoRevision = () => {
    const p = parametros();
    return [
      ui.contenedor({
        titulo: 'Step 1: Budget type',
        acciones: editar ? null : ui.boton('Edit', { alClic: () => ir(0) }),
        cuerpo: ui.pares([{ etiqueta: 'Budget type', valor: TIPOS_PRESUPUESTO[f.tipo] }], { columnas: 2 })
      }),
      ui.contenedor({
        titulo: 'Step 2: Set your budget',
        acciones: ui.boton('Edit', { alClic: () => ir(1) }),
        cuerpo: ui.pares(
          [
            { etiqueta: 'Budget name', valor: p.nombre },
            { etiqueta: 'Period', valor: PERIODOS[p.periodo] },
            { etiqueta: 'Budget renewal type', valor: p.renovacion === 'RECURRING' ? 'Recurring budget' : 'Expiring budget' },
            { etiqueta: 'Budgeting method', valor: 'Fixed' },
            { etiqueta: 'Budgeted amount', valor: f.tipo === 'COST' ? dinero(p.monto) : f.tipo === 'USAGE' ? `${p.monto} Hrs` : `${p.monto}%` },
            { etiqueta: 'Budget scope', valor: f.alcance === 'todo' ? 'All AWS services' : [...p.filtros.servicios.map((x) => servicioCosto(x)?.ce), ...p.filtros.etiquetas.map((x) => `${x.llave}: ${x.valor || '(no tag key)'}`)].join(', ') || '–' }
          ],
          { columnas: 3 }
        )
      }),
      ui.contenedor({
        titulo: 'Step 3: Configure alerts',
        acciones: ui.boton('Edit', { alClic: () => ir(2) }),
        cuerpo: p.alertas.length
          ? h('ul', { class: 'cx-costos-ol' }, p.alertas.map((a) => h('li', {}, `${a.disparador === 'ACTUAL' ? 'Actual' : 'Forecasted'} > ${a.tipoUmbral === 'PERCENTAGE' ? `${a.umbral}%` : dinero(a.umbral)} → ${[...a.correos, a.temaSns].filter(Boolean).join(', ')}`)))
          : h('p', { class: 'cx-texto-sec' }, 'No alerts')
      }),
      ui.contenedor({ titulo: 'Step 4: Attach actions', acciones: ui.boton('Edit', { alClic: () => ir(3) }), cuerpo: h('p', { class: 'cx-texto-sec' }, 'No actions') })
    ];
  };

  const cuerpo = ui.region(() => {
    const plantilla = f.modo === 'plantilla' && f.paso === 0;
    const pasos = plantilla ? ['Choose budget type'] : PASOS_PERSONALIZADO;
    const contenido = [pasoTipo, pasoMonto, pasoAlertas, pasoAcciones, pasoRevision][f.paso]();
    const ultimo = f.paso === 4;
    const pie = h(
      'div',
      { class: 'cx-pie-form' },
      ui.boton('Cancel', { variante: 'texto', alClic: () => cx.ir(editar ? `${BASE}/presupuestos/${encodeURIComponent(editar.nombre)}` : `${BASE}/presupuestos`) }),
      f.paso > (editar ? 1 : 0) ? ui.boton('Previous', { alClic: () => ir(f.paso - 1) }) : null,
      plantilla
        ? ui.boton('Create budget', { variante: 'primario', alClic: () => (validar() ? crear() : repintar()) })
        : ultimo
          ? ui.boton(editar ? 'Save' : 'Create budget', { variante: 'primario', alClic: crear })
          : ui.boton('Next', {
              variante: 'primario',
              escribe: false,
              alClic: () => {
                if (!validar()) return repintar();
                ir(f.paso + 1);
              }
            })
    );
    return h(
      'div',
      { class: 'cx-asis' },
      h('nav', { class: 'cx-asis__pasos', 'aria-label': 'Steps' }, h('ol', {}, pasos.map((p, i) => h('li', { class: ['cx-asis__paso', i === f.paso && 'cx-asis__paso--actual', i > f.paso && 'cx-asis__paso--futuro'], 'aria-current': i === f.paso ? 'step' : undefined }, h('small', {}, `Step ${i + 1}`), h('span', {}, p))))),
      h('div', { class: 'cx-asis__cuerpo cx-pagina' }, ui.encabezado({ titulo: editar && f.paso === 4 ? 'Review' : pasos[f.paso], info: 'costos-presupuesto', cx }), contenido, pie)
    );
  });
  return cuerpo;
}

/* ===================================================== Pricing Calculator */

const SERVICIOS_CALC = [
  { id: 'ec2', nombre: 'Amazon EC2', descripcion: 'Amazon Elastic Compute Cloud (Amazon EC2) is a web service that provides secure, resizable compute capacity in the cloud.', config: () => ({ sistema: 'linux', tenencia: 'shared', carga: 'constante', cantidad: '1', tipo: 't2.micro', pago: 'compute-sp', utilizacion: '100', plazo: 3, opcionPago: 'none', descuentoSpot: '70', ebsTipo: 'gp3', ebsGb: '0' }) },
  { id: 's3', nombre: 'Amazon Simple Storage Service (S3)', descripcion: 'Amazon Simple Storage Service (Amazon S3) is an object storage service that offers scalability, data availability, security, and performance.', config: () => ({ clase: 'STANDARD', gb: '0', put: '0', get: '0' }) },
  { id: 'rds-mysql', servicio: 'rds', nombre: 'Amazon RDS for MySQL', descripcion: 'Amazon RDS for MySQL makes it easy to set up, operate, and scale MySQL deployments in the cloud.', config: () => ({ motor: 'mysql', clase: 'db.t3.micro', despliegue: 'single', cantidad: '1', utilizacion: '100', pago: 'ondemand', plazo: 1, opcionPago: 'none', almacenamientoGb: '20' }) },
  { id: 'rds-postgres', servicio: 'rds', nombre: 'Amazon RDS for PostgreSQL', descripcion: 'Amazon RDS for PostgreSQL makes it easy to set up, operate, and scale PostgreSQL deployments in the cloud.', config: () => ({ motor: 'postgres', clase: 'db.t3.micro', despliegue: 'single', cantidad: '1', utilizacion: '100', pago: 'ondemand', plazo: 1, opcionPago: 'none', almacenamientoGb: '20' }) },
  { id: 'dynamodb', nombre: 'Amazon DynamoDB', descripcion: 'Amazon DynamoDB is a serverless, NoSQL, fully managed database with single-digit millisecond performance at any scale.', config: () => ({ modo: 'ondemand', gb: '1', escriturasMillones: '1', lecturasMillones: '1', wcu: '5', rcu: '5' }) }
];
const nombreServicioCalc = (linea) => (linea.servicio === 'rds' ? (linea.config?.motor === 'postgres' ? 'Amazon RDS for PostgreSQL' : linea.config?.motor === 'mariadb' ? 'Amazon RDS for MariaDB' : 'Amazon RDS for MySQL') : SERVICIOS_CALC.find((x) => x.id === linea.servicio)?.nombre ?? linea.servicio);
const estDe = (cx, id) => (cx.estado.costos?.estimaciones ?? []).find((x) => x.id === id);
/**
 * «Create estimate» no guarda nada todavía: la estimación nace con el primer
 * servicio que se guarda (como en la calculadora, que no deja «My Estimate»
 * vacías si sales sin agregar nada). Mientras tanto la ruta usa este id.
 */
const NUEVA = 'nueva';
const estOBorrador = (cx, id) => (id === NUEVA ? { id: NUEVA, nombre: 'My Estimate', grupos: [], servicios: [] } : estDe(cx, id));
const rutaEst = (id) => (id === NUEVA ? `${BASE}/calculadora` : `${BASE}/calculadora/${id}`);
const NOMBRES_PAGO = { ondemand: 'On-Demand', 'compute-sp': 'Compute Savings Plans', 'ec2-sp': 'EC2 Instance Savings Plans', spot: 'Spot Instances', reserved: 'Reserved' };
const OPCIONES_PAGO = { none: 'No upfront', partial: 'Partial upfront', all: 'All upfront' };

/** El resumen de configuración de una línea (como en My Estimate). */
function resumenConfig(l) {
  const c = l.config ?? {};
  if (l.servicio === 'ec2') return `Tenancy (Shared Instances), Operating system (${c.sistema === 'windows' ? 'Windows Server' : 'Linux'}), Workload (Consistent, Number of instances: ${c.cantidad}), Advance EC2 instance (${c.tipo}), Pricing strategy (${NOMBRES_PAGO[c.pago] ?? c.pago}${c.pago === 'compute-sp' || c.pago === 'ec2-sp' ? ` ${c.plazo}yr ${OPCIONES_PAGO[c.opcionPago]}` : c.pago === 'ondemand' ? ` Utilization: ${c.utilizacion ?? 100} %Utilized/Month` : ''}), EBS Storage amount (${c.ebsGb ?? 0} GB)`;
  if (l.servicio === 's3') return `S3 ${PRECIO_S3[c.clase] ? c.clase.replace(/_/g, ' ') : 'Standard'} storage (${c.gb} GB per month), PUT, COPY, POST, LIST requests (${c.put}), GET, SELECT, and all other requests (${c.get})`;
  if (l.servicio === 'rds') return `Storage amount (${c.almacenamientoGb} GB), Nodes (${c.cantidad}), Instance Type (${c.clase}), Utilization (${c.utilizacion ?? 100} %Utilized/Month), Deployment option (${c.despliegue === 'multi' ? 'Multi-AZ' : 'Single-AZ'}), Pricing strategy (${c.pago === 'reserved' ? `Reserved ${c.plazo}yr ${OPCIONES_PAGO[c.opcionPago]}` : 'OnDemand'})`;
  if (l.servicio === 'dynamodb') return c.modo === 'provisioned' ? `Table class (Standard), Average item size (all attributes) (1 KB), Data storage size (${c.gb} GB), Write capacity units (${c.wcu}), Read capacity units (${c.rcu})` : `Table class (Standard), Data storage size (${c.gb} GB), Number of writes (${c.escriturasMillones} million per month), Number of reads (${c.lecturasMillones} million per month)`;
  return '';
}

function calculadora(cx) {
  migasBilling(cx, { texto: 'Pricing Calculator' });
  const e = cx.estado;
  const nueva = () => cx.ir(`${BASE}/calculadora/${NUEVA}/agregar`);
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Pricing Calculator', info: 'costos-calculadora', cx, descripcion: 'Estimate the cost of your architecture before you build it.' }),
    ui.tabla(cx, {
      titulo: 'Workload estimates',
      variante: 'contenedor',
      info: 'costos-calculadora',
      filas: () => e.costos?.estimaciones ?? [],
      clave: (x) => x.id,
      seleccion: 'unica',
      filtro: 'Find estimates',
      columnas: [
        { titulo: 'Estimate name', valor: (x) => ui.enlace(x.nombre, `${BASE}/calculadora/${x.id}`, { cx }), texto: (x) => x.nombre },
        { titulo: 'Services', valor: (x) => String(x.servicios.length) },
        { titulo: 'Upfront cost', valor: (x) => dinero(totalesEstimacion(x).inicial) },
        { titulo: 'Monthly cost', valor: (x) => dinero(totalesEstimacion(x).mensual) },
        { titulo: 'Total 12 months cost', valor: (x) => dinero(totalesEstimacion(x).anual) },
        { titulo: 'Last updated', valor: (x) => ui.fecha(x.modificada) }
      ],
      acciones: (sel) => [
        ui.boton('Delete', { escribe: true, desactivado: sel.length !== 1, alClic: () => borrarEstimacion(cx, sel[0]) }),
        ui.boton('Create estimate', { variante: 'primario', alClic: nueva })
      ],
      vacio: { titulo: 'No estimates', texto: 'Create an estimate to see what your workload will cost.', accion: () => ui.boton('Create estimate', { escribe: true, alClic: nueva }) }
    })
  );
}

function borrarEstimacion(cx, est) {
  cx.confirmar({
    titulo: 'Delete estimate',
    contenido: h('p', {}, `Delete the estimate "${est.nombre}" and all of its services? This can’t be undone.`),
    aceptar: () => {
      const r = cx.hacer({ servicio: 'PricingCalculator', accion: 'DeleteWorkloadEstimate', error: 'Failed to delete estimate' }, (e) => eliminarEstimacion(e, est.id));
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: `Estimate "${est.nombre}" deleted.` });
        cx.ir(`${BASE}/calculadora`);
      }
    }
  });
}

/** El CSV de Export, con el mismo orden de columnas que calculator.aws. */
function csvEstimacion(est) {
  const t = totalesEstimacion(est);
  const grupo = (id) => est.grupos.find((g) => g.id === id)?.nombre;
  const filas = [
    ['Estimate summary'],
    ['Upfront cost', 'Monthly cost', 'Total 12 months cost', 'Currency'],
    [t.inicial.toFixed(2), t.mensual.toFixed(2), t.anual.toFixed(2), 'USD'],
    [],
    ['Detailed Estimate'],
    ['Group hierarchy', 'Region', 'Description', 'Service', 'Upfront', 'Monthly', 'First 12 months total', 'Currency', 'Status', 'Configuration summary'],
    ...est.servicios.map((l) => [`My Estimate${grupo(l.grupoId) ? ` > ${grupo(l.grupoId)}` : ''}`, 'US East (N. Virginia)', l.descripcion, nombreServicioCalc(l), l.inicial.toFixed(2), l.mensual.toFixed(2), (l.inicial + l.mensual * 12).toFixed(2), 'USD', '', resumenConfig(l)])
  ];
  return csv(filas);
}

function miEstimacion(cx, { id }) {
  migasBilling(cx, { texto: 'Pricing Calculator', ruta: `${BASE}/calculadora` }, { texto: 'My Estimate' });
  const e = cx.estado;
  if (!estDe(cx, id)) return ui.noDisponible('Estimate not found', 'Esa estimación ya no existe. Regresa a Pricing Calculator.');
  const renombrar = (est) => {
    const f = { nombre: est.nombre };
    const m = cx.modal({
      titulo: 'Edit estimate name',
      ancho: 'chico',
      contenido: ui.campo({ etiqueta: 'Estimate name', control: ui.entrada({ valor: f.nombre, alCambiar: (v) => (f.nombre = v) }) }),
      pie: [
        ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
        ui.boton('Save', { variante: 'primario', alClic: () => cx.hacer({ servicio: 'PricingCalculator', accion: 'UpdateWorkloadEstimate', error: 'Failed to rename estimate' }, (x) => editarEstimacion(x, est.id, { nombre: f.nombre })).ok && m.cerrar() })
      ]
    });
  };
  const nuevoGrupo = (est) => {
    const f = { nombre: '' };
    const m = cx.modal({
      titulo: 'Add group',
      ancho: 'chico',
      contenido: ui.campo({ etiqueta: 'Group name', descripcion: 'Use groups to organize the services of your estimate (for example, by application or environment).', control: ui.entrada({ valor: f.nombre, placeholder: 'Web servers', alCambiar: (v) => (f.nombre = v) }) }),
      pie: [
        ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
        ui.boton('Add group', {
          variante: 'primario',
          alClic: () => {
            const r = cx.hacer({ servicio: 'PricingCalculator', accion: 'UpdateWorkloadEstimate', error: 'Failed to add group' }, (x) => agregarGrupoEstimacion(x, est.id, { nombre: f.nombre }));
            if (r.ok) m.cerrar();
          }
        })
      ]
    });
  };
  const mover = (est, ids) => {
    const f = { grupo: '' };
    const m = cx.modal({
      titulo: 'Move to group',
      ancho: 'chico',
      contenido: ui.campo({ etiqueta: 'Group', control: ui.selector({ opciones: [{ valor: '', etiqueta: 'My Estimate (no group)' }, ...est.grupos.map((g) => ({ valor: g.id, etiqueta: g.nombre }))], valor: f.grupo, alCambiar: (v) => (f.grupo = v) }) }),
      pie: [
        ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
        ui.boton('Move', { variante: 'primario', alClic: () => cx.hacer({ servicio: 'PricingCalculator', accion: 'UpdateWorkloadEstimate', error: 'Failed to move services' }, (x) => moverServicioEstimacion(x, est.id, ids, f.grupo || null)).ok && m.cerrar() })
      ]
    });
  };

  // Una tabla de servicios por grupo (y la de los servicios sin grupo).
  const tablaServicios = (est, grupoId, titulo, acciones) =>
    ui.tabla(cx, {
      titulo,
      variante: 'contenedor',
      filas: () => (estDe(cx, id)?.servicios ?? []).filter((l) => (l.grupoId ?? null) === grupoId),
      clave: (l) => l.id,
      seleccion: 'multiple',
      filtro: false,
      paginacion: false,
      columnas: [
        { titulo: 'Service name', valor: (l) => nombreServicioCalc(l) },
        { titulo: 'Description', valor: (l) => l.descripcion || '–' },
        { titulo: 'Region', valor: () => 'US East (N. Virginia)' },
        { titulo: 'Upfront cost', valor: (l) => dinero(l.inicial) },
        { titulo: 'Monthly cost', valor: (l) => dinero(l.mensual) },
        { titulo: 'Configuration summary', valor: (l) => h('span', { class: 'cx-costos-resumen-config' }, resumenConfig(l)) }
      ],
      acciones: (sel) => [
        ui.menuBoton(
          'Action',
          () => [
            { texto: 'Edit', desactivado: sel.length !== 1, alClic: () => cx.ir(`${BASE}/calculadora/${id}/editar/${sel[0].id}`) },
            { texto: 'Duplicate', escribe: true, desactivado: sel.length !== 1, alClic: () => cx.hacer({ servicio: 'PricingCalculator', accion: 'BatchCreateWorkloadEstimateUsage', error: 'Failed to duplicate service' }, (x) => duplicarServicioEstimacion(x, id, sel[0].id)) },
            { texto: 'Move to', escribe: true, desactivado: !sel.length || !est.grupos.length, alClic: () => mover(estDe(cx, id), sel.map((l) => l.id)) },
            { texto: 'Delete', escribe: true, desactivado: !sel.length, alClic: () => cx.confirmar({ titulo: 'Delete services', contenido: h('p', {}, `Delete ${sel.length} service${sel.length === 1 ? '' : 's'} from this estimate?`), aceptar: () => cx.hacer({ servicio: 'PricingCalculator', accion: 'BatchDeleteWorkloadEstimateUsage', error: 'Failed to delete services' }, (x) => eliminarServicioEstimacion(x, id, sel.map((l) => l.id))) }) }
          ],
          { desactivado: !sel.length }
        ),
        ...(acciones?.() ?? [])
      ],
      vacio: { titulo: 'No services', texto: grupoId ? 'Move services into this group with Action → Move to.' : 'Add a service to start your estimate.' }
    });

  return cx.vivo(() => {
    const est = estDe(cx, id);
    if (!est) return ui.noDisponible('Estimate not found', 'Esa estimación ya no existe. Regresa a Pricing Calculator.');
    const t = totalesEstimacion(est);
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({
        titulo: h('span', {}, est.nombre, ' ', ui.boton('', { variante: 'icono', icono: 'edit', titulo: 'Edit estimate name', escribe: true, alClic: () => renombrar(est) })),
        info: 'costos-calculadora',
        cx,
        acciones: [
          ui.menuBoton('Export', () => [
            { texto: 'CSV', alClic: () => descargar(`${est.nombre.replace(/[^\w-]+/g, '_')}.csv`, csvEstimacion(est)) },
            { texto: 'JSON', alClic: () => descargar(`${est.nombre.replace(/[^\w-]+/g, '_')}.json`, JSON.stringify({ name: est.nombre, totalCost: { upfront: t.inicial, monthly: t.mensual, '12months': t.anual }, groups: est.grupos.map((g) => g.nombre), services: est.servicios.map((l) => ({ service: nombreServicioCalc(l), description: l.descripcion, group: est.grupos.find((g) => g.id === l.grupoId)?.nombre ?? null, region: 'US East (N. Virginia)', upfront: l.inicial, monthly: l.mensual, config: l.config })) }, null, 2), 'application/json') },
            { texto: 'PDF', desactivado: true }
          ]),
          ui.boton('Share', { desactivado: true, titulo: 'No disponible en el simulador' }),
          ui.menuBoton('Action', () => [
            { texto: 'Add group', escribe: true, alClic: () => nuevoGrupo(est) },
            { texto: 'Delete estimate', escribe: true, alClic: () => borrarEstimacion(cx, est) }
          ]),
          ui.boton('Add service', { variante: 'primario', alClic: () => cx.ir(`${BASE}/calculadora/${id}/agregar`) })
        ]
      }),
      ui.contenedor({
        titulo: 'Estimate summary',
        info: 'costos-calculadora',
        cx,
        cuerpo: h('div', { class: 'cx-costos-cifras' }, cifra('Upfront cost', dinero(t.inicial)), cifra('Monthly cost', dinero(t.mensual)), cifra('Total 12 months cost', dinero(t.anual), 'Includes upfront cost'))
      }),
      est.grupos.map((g) => {
        const tg = totalesEstimacion(est, g.id);
        return tablaServicios(est, g.id, `${g.nombre} · ${dinero(tg.mensual)}/month`, () => [
          ui.boton('Delete group', {
            escribe: true,
            alClic: () =>
              cx.confirmar({
                titulo: `Delete group ${g.nombre}?`,
                contenido: h('p', {}, 'The services in this group move to My Estimate (no group).'),
                aceptar: () => cx.hacer({ servicio: 'PricingCalculator', accion: 'UpdateWorkloadEstimate', error: 'Failed to delete group' }, (x) => eliminarGrupoEstimacion(x, id, g.id))
              })
          })
        ]);
      }),
      tablaServicios(est, null, est.grupos.length ? 'Services without a group' : 'My Estimate', () => [ui.boton('Add group', { escribe: true, alClic: () => nuevoGrupo(estDe(cx, id)) })]),
      h('p', { class: 'cx-texto-sec' }, 'AWS Pricing Calculator provides only an estimate of your AWS fees and doesn’t include any taxes that might apply. Your actual fees depend on a variety of factors, including your actual usage of AWS services.')
    );
  });
}

function agregarServicio(cx, { id }) {
  migasBilling(cx, { texto: 'Pricing Calculator', ruta: `${BASE}/calculadora` }, { texto: 'My Estimate', ruta: rutaEst(id) }, { texto: 'Add service' });
  if (!estOBorrador(cx, id)) return ui.noDisponible('Estimate not found', 'Esa estimación ya no existe. Regresa a Pricing Calculator.');
  const st = { texto: '' };
  const tarjetas = ui.region(() => {
    const t = st.texto.trim().toLowerCase();
    const visibles = SERVICIOS_CALC.filter((x) => !t || `${x.nombre} ${x.descripcion} ${x.id}`.toLowerCase().includes(t));
    return visibles.length
      ? h(
          'div',
          { class: 'cx-costos-servicios' },
          visibles.map((x) => h('div', { class: 'cx-costos-servicio' }, h('b', {}, x.nombre), h('p', { class: 'cx-texto-sec' }, x.descripcion), h('div', {}, ui.boton('Configure', { alClic: () => cx.ir(`${BASE}/calculadora/${id}/configurar/${x.id}`) }))))
        )
      : h('div', { class: 'cx-tabla__vacia' }, h('b', {}, 'No matches'), h('div', {}, 'This simulator prices Amazon EC2, Amazon S3, Amazon RDS for MySQL and PostgreSQL, and Amazon DynamoDB.'));
  });
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Add service', info: 'costos-calculadora', cx, descripcion: 'Choose a location and find the service you want to estimate.' }),
    ui.contenedor({
      titulo: 'Choose a location type',
      cuerpo: h(
        'div',
        { class: 'cx-fila-campos' },
        ui.campo({ etiqueta: 'Location type', control: ui.selector({ opciones: [{ valor: 'region', etiqueta: 'Region' }, { valor: 'wavelength', etiqueta: 'Wavelength Zone', desactivado: true }, { valor: 'local', etiqueta: 'Local Zone', desactivado: true }], valor: 'region' }) }),
        ui.campo({ etiqueta: 'Choose a Region', control: ui.selector({ opciones: [{ valor: 'us-east-1', etiqueta: 'US East (N. Virginia)' }, { valor: 'us-east-2', etiqueta: 'US East (Ohio)', desactivado: true }, { valor: 'mx-central-1', etiqueta: 'Mexico (Central)', desactivado: true }], valor: 'us-east-1' }) })
      )
    }),
    ui.contenedor({
      titulo: 'Find Service',
      cuerpo: h('div', { class: 'cx-pagina' }, ui.entrada({ buscar: true, placeholder: 'Search for a service', etiquetaAccesible: 'Search for a service', alCambiar: (v) => ((st.texto = v), tarjetas.repintar()) }), tarjetas)
    }),
    h('div', { class: 'cx-pie-form' }, ui.boton('Cancel', { variante: 'texto', alClic: () => cx.ir(rutaEst(id)) }))
  );
}

/** Configurar un servicio (nuevo con `servicio`, o el que ya existe con `linea`). */
function configurarServicio(cx, { id, servicio, linea }) {
  const est = linea ? estDe(cx, id) : estOBorrador(cx, id);
  const existente = linea ? est?.servicios.find((l) => l.id === linea) : null;
  const def = existente ? SERVICIOS_CALC.find((x) => (x.servicio ?? x.id) === existente.servicio && (existente.servicio !== 'rds' || x.config().motor === existente.config.motor)) ?? SERVICIOS_CALC[0] : SERVICIOS_CALC.find((x) => x.id === servicio);
  migasBilling(cx, { texto: 'Pricing Calculator', ruta: `${BASE}/calculadora` }, { texto: 'My Estimate', ruta: rutaEst(id) }, { texto: def ? `Configure ${def.nombre}` : 'Configure' });
  if (!est || !def || (linea && !existente)) return ui.noDisponible('Not found', 'Esa estimación o ese servicio ya no existe. Regresa a Pricing Calculator.');
  const tipoServicio = def.servicio ?? def.id;
  const f = {
    descripcion: existente?.descripcion ?? '',
    grupoId: existente?.grupoId ?? cx.memoria.grupoCalculadora ?? '',
    config: existente ? Object.fromEntries(Object.entries(existente.config).map(([k, v]) => [k, typeof v === 'number' ? String(v) : v])) : def.config(),
    filtroTipo: '',
    errores: {}
  };
  if (f.grupoId && !est.grupos.some((g) => g.id === f.grupoId)) f.grupoId = '';
  const c = f.config;
  const precio = () => {
    try {
      const n = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : v]));
      return precioCalculadora(tipoServicio, n);
    } catch {
      return { mensual: 0, inicial: 0 };
    }
  };
  const resumen = ui.region(() => {
    const p = precio();
    return ui.contenedor({
      titulo: 'Summary',
      cuerpo: h(
        'div',
        { class: 'cx-pagina' },
        cifra('Total Upfront cost', dinero(p.inicial)),
        cifra('Total monthly cost', dinero(p.mensual)),
        ui.expandible({ titulo: 'Show calculations', contenido: h('div', { class: 'cx-log cx-costos-calculo' }, calculos(tipoServicio, c, p)) })
      )
    });
  });
  const cambio = () => resumen.repintar();
  const todo = () => {
    secciones.repintar();
    resumen.repintar();
  };
  const ent = (llave, op = {}) => ui.entrada({ tipo: 'number', valor: c[llave], min: 0, ...op, alCambiar: (v) => ((c[llave] = v), cambio()) });

  const secEc2 = () => {
    const elegido = TIPOS_INSTANCIA.find((x) => x.tipo === c.tipo);
    const sp = c.pago === 'compute-sp' || c.pago === 'ec2-sp';
    return [
      ui.contenedor({
        titulo: 'EC2 specifications',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.campo({ etiqueta: 'Tenancy', control: ui.selector({ opciones: [{ valor: 'shared', etiqueta: 'Shared Instances' }, { valor: 'dedicated', etiqueta: 'Dedicated Instances', desactivado: true }, { valor: 'host', etiqueta: 'Dedicated Hosts', desactivado: true }], valor: 'shared' }) }),
          ui.campo({ etiqueta: 'Operating system', control: ui.selector({ opciones: [{ valor: 'linux', etiqueta: 'Linux' }, { valor: 'windows', etiqueta: 'Windows Server' }, { valor: 'rhel', etiqueta: 'Red Hat Enterprise Linux', desactivado: true }, { valor: 'suse', etiqueta: 'SUSE Linux Enterprise Server', desactivado: true }], valor: c.sistema, alCambiar: (v) => ((c.sistema = v), todo()) }) }),
          ui.campo({
            etiqueta: 'Workloads',
            descripcion: 'Choose the workload that best represents your usage pattern.',
            control: ui.tarjetas({ columnas: 2, valor: 'constante', opciones: [{ valor: 'constante', etiqueta: 'Constant usage' }, { valor: 'diario', etiqueta: 'Daily spike traffic', desactivado: true }, { valor: 'semanal', etiqueta: 'Weekly spike traffic', desactivado: true }, { valor: 'mensual', etiqueta: 'Monthly spike traffic', desactivado: true }] })
          }),
          ui.campo({ etiqueta: 'Number of instances', error: f.errores.cantidad, control: ent('cantidad', { placeholder: '1' }) })
        )
      }),
      ui.contenedor({
        titulo: 'EC2 instances',
        descripcion: elegido ? `Selected instance: ${elegido.tipo}, Family: General purpose, ${elegido.vcpu} vCPUs, ${elegido.memoria} GiB Memory` : 'Select an instance type.',
        sinRelleno: true,
        cuerpo: h(
          'div',
          {},
          h('div', { class: 'cx-costos-relleno' }, ui.entrada({ buscar: true, valor: f.filtroTipo, placeholder: 'Search instance type (for example, t2.micro)', etiquetaAccesible: 'Search instance type', alCambiar: (v) => ((f.filtroTipo = v), filas.repintar()) })),
          (filas = ui.region(() => {
            const visibles = TIPOS_INSTANCIA.filter((x) => !f.filtroTipo.trim() || x.tipo.includes(f.filtroTipo.trim().toLowerCase()));
            return h(
              'table',
              { class: 'cx-tabla__tabla' },
              h('thead', {}, h('tr', {}, h('th', { class: 'cx-tabla__sel' }), ['Instance name', 'On-Demand hourly cost', 'vCPUs', 'Memory', 'Network performance'].map((x) => h('th', {}, h('span', { class: 'cx-tabla__orden' }, x))))),
              h(
                'tbody',
                {},
                visibles.length
                  ? visibles.map((x) =>
                      h(
                        'tr',
                        { class: ['cx-fila--elegible', x.tipo === c.tipo && 'cx-fila--elegida'], onclick: () => ((c.tipo = x.tipo), todo()) },
                        h('td', { class: 'cx-tabla__sel' }, h('input', { type: 'radio', name: 'tipo-calc', checked: x.tipo === c.tipo, 'aria-label': `Select ${x.tipo}`, onchange: () => ((c.tipo = x.tipo), todo()) })),
                        h('td', {}, x.tipo),
                        h('td', {}, `${(c.sistema === 'windows' ? x.precio + 0.0046 * x.vcpu : x.precio).toFixed(4)} USD`),
                        h('td', {}, String(x.vcpu)),
                        h('td', {}, `${x.memoria} GiB`),
                        h('td', {}, x.familia === 't2' ? 'Low to Moderate' : 'Up to 5 Gigabit')
                      )
                    )
                  : h('tr', {}, h('td', { colspan: '6', class: 'cx-tabla__vacia' }, 'No matches'))
              )
            );
          }))
        )
      }),
      ui.contenedor({
        titulo: 'Payment options',
        info: 'costos-pago',
        cx,
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.tarjetas({
            columnas: 2,
            valor: c.pago,
            alCambiar: (v) => ((c.pago = v), todo()),
            opciones: [
              { valor: 'compute-sp', etiqueta: 'Compute Savings Plans', descripcion: 'Flexible savings across EC2, Lambda and Fargate in exchange for a 1 or 3 year commitment.' },
              { valor: 'ec2-sp', etiqueta: 'EC2 Instance Savings Plans', descripcion: 'Lowest Savings Plans prices for a specific instance family in a Region.' },
              { valor: 'ondemand', etiqueta: 'On-Demand', descripcion: 'Pay for compute capacity by the hour with no long-term commitments.' },
              { valor: 'spot', etiqueta: 'Spot Instances', descripcion: 'Use spare EC2 capacity at up to a 90% discount. Instances can be interrupted.' }
            ]
          }),
          sp
            ? h(
                'div',
                { class: 'cx-fila-campos cx-costos-fila-arriba' },
                ui.campo({ etiqueta: 'Reservation term', control: ui.radios({ valor: Number(c.plazo), alCambiar: (v) => ((c.plazo = v), cambio()), opciones: [{ valor: 1, etiqueta: '1 year' }, { valor: 3, etiqueta: '3 years' }] }) }),
                ui.campo({ etiqueta: 'Payment options', control: ui.radios({ valor: c.opcionPago, alCambiar: (v) => ((c.opcionPago = v), cambio()), opciones: Object.entries(OPCIONES_PAGO).map(([valor, etiqueta]) => ({ valor, etiqueta })) }) })
              )
            : null,
          c.pago === 'ondemand' ? ui.campo({ etiqueta: 'Expected utilization', descripcion: 'The percentage of the month that your instances run (730 hours = 100%).', control: ent('utilizacion', { sufijo: '%Utilized/Month', max: 100 }) }) : null,
          c.pago === 'spot' ? ui.campo({ etiqueta: 'Assume percentage discount for my estimate', descripcion: 'Historical average discount for this instance type: 70%.', control: ent('descuentoSpot', { sufijo: '%', max: 100 }) }) : null
        )
      }),
      ui.contenedor({
        titulo: 'Amazon Elastic Block Store (EBS)',
        cuerpo: h(
          'div',
          { class: 'cx-fila-campos' },
          ui.campo({ etiqueta: 'Storage for each EC2 instance', control: ui.selector({ opciones: [{ valor: 'gp3', etiqueta: 'General Purpose SSD (gp3)' }, { valor: 'gp2', etiqueta: 'General Purpose SSD (gp2)' }, { valor: 'io1', etiqueta: 'Provisioned IOPS SSD (io1)' }, { valor: 'st1', etiqueta: 'Throughput Optimized HDD (st1)' }, { valor: 'sc1', etiqueta: 'Cold HDD (sc1)' }], valor: c.ebsTipo, alCambiar: (v) => ((c.ebsTipo = v), cambio()) }) }),
          ui.campo({ etiqueta: 'Storage amount', control: ent('ebsGb', { sufijo: 'GB' }) })
        )
      })
    ];
  };
  let filas;

  const secS3 = () =>
    ui.contenedor({
      titulo: 'S3 storage',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({ etiqueta: 'Storage class', control: ui.selector({ opciones: [['STANDARD', 'S3 Standard'], ['INTELLIGENT_TIERING', 'S3 Intelligent-Tiering'], ['STANDARD_IA', 'S3 Standard-Infrequent Access'], ['ONEZONE_IA', 'S3 One Zone-Infrequent Access'], ['GLACIER_IR', 'S3 Glacier Instant Retrieval'], ['GLACIER', 'S3 Glacier Flexible Retrieval'], ['DEEP_ARCHIVE', 'S3 Glacier Deep Archive']].map(([valor, etiqueta]) => ({ valor, etiqueta, etiquetaDerecha: `$${PRECIO_S3[valor][0]}/GB` })), valor: c.clase, alCambiar: (v) => ((c.clase = v), cambio()) }) }),
        ui.campo({ etiqueta: 'Storage', descripcion: 'Average storage per month.', control: ent('gb', { sufijo: 'GB per month' }) }),
        ui.campo({ etiqueta: 'PUT, COPY, POST, LIST requests to S3', control: ent('put', { sufijo: 'requests' }) }),
        ui.campo({ etiqueta: 'GET, SELECT, and all other requests from S3', control: ent('get', { sufijo: 'requests' }) })
      )
    });

  const secRds = () => {
    const reservado = c.pago === 'reserved';
    return ui.contenedor({
      titulo: `${c.motor === 'postgres' ? 'PostgreSQL' : 'MySQL'} instance specifications`,
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({ etiqueta: 'Nodes', error: f.errores.cantidad, control: ent('cantidad') }),
        ui.campo({ etiqueta: 'Instance type', control: ui.selector({ opciones: Object.entries(PRECIO_RDS).map(([valor, p]) => ({ valor, etiqueta: valor, etiquetaDerecha: `${(c.motor === 'postgres' ? p[1] : p[0]).toFixed(3)} USD/hour` })), valor: c.clase, filtrar: true, alCambiar: (v) => ((c.clase = v), cambio()) }) }),
        ui.campo({ etiqueta: 'Deployment option', control: ui.selector({ opciones: [{ valor: 'single', etiqueta: 'Single-AZ' }, { valor: 'multi', etiqueta: 'Multi-AZ', descripcion: 'A standby instance in another Availability Zone (twice the instance price).' }], valor: c.despliegue, alCambiar: (v) => ((c.despliegue = v), cambio()) }) }),
        ui.campo({ etiqueta: 'Pricing model', control: ui.radios({ horizontal: true, valor: c.pago, alCambiar: (v) => ((c.pago = v), todo()), opciones: [{ valor: 'ondemand', etiqueta: 'OnDemand' }, { valor: 'reserved', etiqueta: 'Reserved' }] }) }),
        reservado
          ? h(
              'div',
              { class: 'cx-fila-campos cx-costos-fila-arriba' },
              ui.campo({ etiqueta: 'Term', control: ui.radios({ valor: Number(c.plazo), alCambiar: (v) => ((c.plazo = v), cambio()), opciones: [{ valor: 1, etiqueta: '1 year' }, { valor: 3, etiqueta: '3 years' }] }) }),
              ui.campo({ etiqueta: 'Purchase option', control: ui.radios({ valor: c.opcionPago, alCambiar: (v) => ((c.opcionPago = v), cambio()), opciones: Object.entries(OPCIONES_PAGO).map(([valor, etiqueta]) => ({ valor, etiqueta })) }) })
            )
          : ui.campo({ etiqueta: 'Utilization (On-Demand only)', control: ent('utilizacion', { sufijo: '%Utilized/Month', max: 100 }) }),
        ui.campo({ etiqueta: 'Storage amount', descripcion: 'General Purpose SSD (gp3) storage per node.', control: ent('almacenamientoGb', { sufijo: 'GB' }) })
      )
    });
  };

  const secDynamo = () =>
    ui.contenedor({
      titulo: 'DynamoDB features',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({ etiqueta: 'Capacity mode', control: ui.tarjetas({ columnas: 2, valor: c.modo, alCambiar: (v) => ((c.modo = v), todo()), opciones: [{ valor: 'ondemand', etiqueta: 'On-demand capacity', descripcion: 'Pay per request.' }, { valor: 'provisioned', etiqueta: 'Provisioned capacity', descripcion: 'Pay per hour for read and write capacity units.' }] }) }),
        ui.campo({ etiqueta: 'Data storage size', control: ent('gb', { sufijo: 'GB' }) }),
        c.modo === 'provisioned'
          ? [ui.campo({ etiqueta: 'Write capacity units (WCU)', control: ent('wcu') }), ui.campo({ etiqueta: 'Read capacity units (RCU)', control: ent('rcu') })]
          : [ui.campo({ etiqueta: 'Number of writes', control: ent('escriturasMillones', { sufijo: 'million per month' }) }), ui.campo({ etiqueta: 'Number of reads', control: ent('lecturasMillones', { sufijo: 'million per month' }) })]
      )
    });

  const secciones = ui.region(() => [
    ui.contenedor({
      titulo: 'Description - optional',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({ etiqueta: 'Description', opcional: true, control: ui.entrada({ valor: f.descripcion, placeholder: 'Enter a description for this service', alCambiar: (v) => (f.descripcion = v) }) }),
        ui.campo({ etiqueta: 'Group', opcional: true, descripcion: 'Add the service to a group of your estimate.', control: ui.selector({ opciones: [{ valor: '', etiqueta: 'My Estimate (no group)' }, ...est.grupos.map((g) => ({ valor: g.id, etiqueta: g.nombre }))], valor: f.grupoId, alCambiar: (v) => (f.grupoId = v) }) }),
        ui.campo({ etiqueta: 'Choose a Region', control: ui.selector({ opciones: [{ valor: 'us-east-1', etiqueta: 'US East (N. Virginia)' }], valor: 'us-east-1' }) })
      )
    }),
    tipoServicio === 'ec2' ? secEc2() : tipoServicio === 's3' ? secS3() : tipoServicio === 'rds' ? secRds() : secDynamo()
  ]);

  const guardar = (siguiente) => {
    f.errores = {};
    if ((tipoServicio === 'ec2' || tipoServicio === 'rds') && !(Number.isInteger(numero(c.cantidad)) && numero(c.cantidad) >= 1)) {
      f.errores.cantidad = 'Enter a whole number greater than 0.';
      return secciones.repintar();
    }
    const datos = { lineaId: existente?.id, servicio: tipoServicio, descripcion: f.descripcion, grupoId: f.grupoId || null, config: c };
    // Una estimación nueva se crea junto con su primer servicio (atómico: si el servicio no es válido, no queda una «My Estimate» vacía).
    const r = cx.hacer(
      { servicio: 'PricingCalculator', accion: 'BatchCreateWorkloadEstimateUsage', error: 'Failed to save service' },
      (e) => {
        const idEst = id === NUEVA ? crearEstimacion(e, { nombre: 'My Estimate' }).id : id;
        return { idEst, linea: guardarServicioEstimacion(e, idEst, datos) };
      },
      { atomico: id === NUEVA }
    );
    if (!r.ok) return;
    const { idEst, linea: guardada } = r.valor;
    cx.memoria.grupoCalculadora = f.grupoId || '';
    cx.flash({ tipo: 'exito', texto: `${def.nombre} ${existente ? 'updated in' : 'added to'} your estimate (${dinero(guardada.mensual)}/month).` });
    cx.ir(siguiente === 'agregar' ? `${BASE}/calculadora/${idEst}/agregar` : `${BASE}/calculadora/${idEst}`);
  };

  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: `Configure ${def.nombre}`, info: 'costos-calculadora', cx, descripcion: def.descripcion }),
    h('div', { class: 'cx-dos-columnas' }, h('div', { class: 'cx-pagina' }, secciones), h('div', { class: 'cx-lado' }, resumen)),
    h(
      'div',
      { class: 'cx-pie-form' },
      ui.boton('Cancel', { variante: 'texto', alClic: () => cx.ir(rutaEst(id)) }),
      existente ? null : ui.boton('Save and add service', { escribe: true, alClic: () => guardar('agregar') }),
      ui.boton(existente ? 'Update' : 'Save and view summary', { variante: 'primario', alClic: () => guardar('resumen') })
    )
  );
}

/** «Show calculations»: la cuenta en texto, como la calculadora. */
function calculos(servicio, c, p) {
  const n = (v) => Number(v) || 0;
  if (servicio === 'ec2') {
    const t = TIPOS_INSTANCIA.find((x) => x.tipo === c.tipo);
    if (!t) return 'Select an instance type.';
    const hora = c.sistema === 'windows' ? t.precio + 0.0046 * t.vcpu : t.precio;
    const lineas = [];
    if (c.pago === 'ondemand') lineas.push(`${n(c.cantidad)} instances x ${hora.toFixed(4)} USD x 730 hours in a month x ${n(c.utilizacion)}% utilization = ${(n(c.cantidad) * hora * 730 * (n(c.utilizacion) / 100)).toFixed(2)} USD`);
    else if (c.pago === 'spot') lineas.push(`${n(c.cantidad)} instances x ${hora.toFixed(4)} USD x (1 - ${n(c.descuentoSpot)}% discount) x 730 hours = ${(n(c.cantidad) * hora * (1 - n(c.descuentoSpot) / 100) * 730).toFixed(2)} USD`);
    else lineas.push(`${NOMBRES_PAGO[c.pago]} ${c.plazo}yr ${OPCIONES_PAGO[c.opcionPago]}: Upfront ${p.inicial.toFixed(2)} USD, Monthly ${p.mensual.toFixed(2)} USD (includes EBS)`);
    if (n(c.ebsGb)) lineas.push(`${n(c.cantidad)} instances x ${n(c.ebsGb)} GB x EBS ${c.ebsTipo} price per GB-month`);
    lineas.push(`Total monthly cost: ${p.mensual.toFixed(2)} USD`);
    return lineas.join('\n');
  }
  return `Upfront: ${p.inicial.toFixed(2)} USD\nMonthly: ${p.mensual.toFixed(2)} USD`;
}

/* ================================================ Savings Plans y reservas */

function savingsPlans(cx) {
  migasBilling(cx, { texto: 'Savings Plans' });
  const e = cx.estado;
  const p = { tipo: 'compute-sp', plazo: 1, opcion: 'none' };
  const reco = cx.vivo(() => {
    const r = recomendacionSavingsPlans(e, p);
    return ui.contenedor({
      titulo: 'Recommendations',
      info: 'costos-savings-plans',
      cx,
      descripcion: 'Based on your On-Demand EC2 usage right now (the console uses your past 7, 30 or 60 days).',
      cuerpo: r
        ? h(
            'div',
            { class: 'cx-pagina' },
            h('div', { class: 'cx-costos-cifras' }, cifra('Estimated monthly savings', dinero(r.ahorroMensual)), cifra('Estimated savings percentage', `${r.porcentaje.toFixed(0)}%`), cifra('Hourly commitment to purchase', `$${r.compromiso.toFixed(4)}/hour`), cifra('Current On-Demand spend', `${dinero(r.costoMensualActual)}/month`)),
            ui.alerta({ tipo: 'info', contenido: 'Un Savings Plan es un compromiso de gastar cierta cantidad POR HORA durante 1 o 3 años. A cambio pagas menos que On-Demand. Si apagas tus instancias, el compromiso se sigue cobrando.' })
          )
        : h('div', { class: 'cx-tabla__vacia' }, h('b', {}, 'No recommendations'), h('div', {}, 'You have no running EC2 instances. Recommendations appear when you have steady On-Demand usage.'))
    });
  });
  const parametros = ui.region(() =>
    ui.contenedor({
      titulo: 'Recommendation parameters',
      cuerpo: h(
        'div',
        { class: 'cx-fila-campos cx-costos-fila-arriba' },
        ui.campo({ etiqueta: 'Savings Plans type', control: ui.radios({ valor: p.tipo, alCambiar: (v) => ((p.tipo = v), reco.repintar()), opciones: [{ valor: 'compute-sp', etiqueta: 'Compute Savings Plans' }, { valor: 'ec2-sp', etiqueta: 'EC2 Instance Savings Plans' }] }) }),
        ui.campo({ etiqueta: 'Savings Plans term', control: ui.radios({ valor: p.plazo, alCambiar: (v) => ((p.plazo = v), reco.repintar()), opciones: [{ valor: 1, etiqueta: '1 year' }, { valor: 3, etiqueta: '3 years' }] }) }),
        ui.campo({ etiqueta: 'Payment option', control: ui.radios({ valor: p.opcion, alCambiar: (v) => ((p.opcion = v), reco.repintar()), opciones: Object.entries(OPCIONES_PAGO).map(([valor, etiqueta]) => ({ valor, etiqueta })) }) })
      )
    })
  );
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Savings Plans overview', info: 'costos-savings-plans', cx, descripcion: 'Savings Plans offer lower prices in exchange for a commitment to a consistent amount of usage (measured in $/hour) for a 1 or 3 year term.', acciones: [ui.boton('Purchase Savings Plans', { variante: 'primario', desactivado: true, titulo: 'No disponible en el simulador' })] }),
    parametros,
    reco,
    ui.contenedor({
      titulo: 'Inventory',
      contador: 0,
      cuerpo: h('div', { class: 'cx-tabla__vacia' }, h('b', {}, 'No Savings Plans'), h('div', {}, 'You don’t have any Savings Plans. In this simulator purchases are disabled.'))
    }),
    ui.contenedor({ titulo: 'Utilization report', cuerpo: h('div', { class: 'cx-costos-cifras' }, cifra('Savings Plans utilization', '–', 'No Savings Plans in this account')) }),
    ui.contenedor({ titulo: 'Coverage report', cuerpo: h('div', { class: 'cx-costos-cifras' }, cifra('Savings Plans coverage', '0%', 'All your eligible usage is billed at On-Demand rates')) })
  );
}

function reservas(cx) {
  migasBilling(cx, { texto: 'Reservations' });
  const e = cx.estado;
  const lista = () =>
    (e.rds?.instancias ?? [])
      .filter((d) => !['deleting', 'deleted'].includes(d.estado))
      .map((d) => {
        const r = recursosFacturables(e).find((x) => x.servicio === 'rds' && x.uso.includes('Usage:') && (x.recurso === d.id || x.recurso === d.arn || x.recurso === d.nombre));
        const hora = r?.precio ?? 0;
        return { id: d.id ?? d.nombre, clase: d.clase ?? '–', motor: d.motor ?? 'mysql', hora, ahorro: hora * 730 * (1 - 0.69) };
      })
      .filter((x) => x.hora > 0);
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Reservations overview', info: 'costos-savings-plans', cx, descripcion: 'Reserved Instances give you a discount for committing to a specific instance configuration for 1 or 3 years.', acciones: [ui.boton('Purchase reservations', { variante: 'primario', desactivado: true, titulo: 'No disponible en el simulador' })] }),
    ui.tabla(cx, {
      titulo: 'RDS reservation recommendations',
      variante: 'contenedor',
      descripcion: '1 year, No upfront, based on your running DB instances.',
      filas: lista,
      clave: (x) => x.id,
      seleccion: null,
      filtro: false,
      columnas: [
        { titulo: 'DB instance', valor: (x) => x.id },
        { titulo: 'Instance class', valor: (x) => x.clase },
        { titulo: 'Database engine', valor: (x) => x.motor },
        { titulo: 'On-Demand cost', valor: (x) => `${dinero(x.hora * 730)}/month` },
        { titulo: 'Estimated monthly savings', valor: (x) => dinero(x.ahorro) }
      ],
      vacio: { titulo: 'No recommendations', texto: 'You don’t have running RDS DB instances. Reservation recommendations are based on steady usage.' }
    }),
    ui.contenedor({ titulo: 'Inventory', contador: 0, cuerpo: h('div', { class: 'cx-tabla__vacia' }, h('b', {}, 'No reservations'), h('div', {}, 'You don’t have any active reservations.')) })
  );
}

/* ================================================== Cost allocation tags */

function etiquetas(cx) {
  migasBilling(cx, { texto: 'Cost allocation tags' });
  const e = cx.estado;
  const st = { pestana: cx.memoria.pestanaEtiquetas ?? 'user' };
  const confirmarCambio = (sel, activar) => {
    const llaves = sel.map((x) => x.llave);
    cx.confirmar({
      titulo: activar ? 'Activate cost allocation tags' : 'Deactivate cost allocation tags',
      textoBoton: activar ? 'Activate' : 'Deactivate',
      contenido: [
        h('p', {}, activar ? 'Activate these tags so that AWS can use them to organize your costs in Cost Explorer, Budgets and cost reports:' : 'After you deactivate these tags, they no longer appear in new cost reports:'),
        h('ul', {}, llaves.map((l) => h('li', {}, h('b', {}, l)))),
        activar ? ui.alerta({ tipo: 'info', contenido: 'It can take up to 24 hours for tags to activate. (En el simulador se activan al momento.)' }) : null
      ],
      aceptar: () => {
        const r = cx.hacer({ servicio: 'CostExplorer', accion: 'UpdateCostAllocationTagsStatus', error: `Failed to ${activar ? 'activate' : 'deactivate'} tags` }, (est) => (activar ? activarEtiquetasCosto(est, llaves) : desactivarEtiquetasCosto(est, llaves)));
        if (r.ok) cx.flash({ tipo: 'exito', texto: `${llaves.length} tag${llaves.length === 1 ? '' : 's'} ${activar ? 'activated' : 'deactivated'}: ${llaves.join(', ')}.` });
      }
    });
  };
  const tabla = (tipo) =>
    ui.tabla(cx, {
      titulo: tipo === 'user' ? 'User-defined cost allocation tags' : 'AWS generated cost allocation tags',
      info: 'costos-etiquetas',
      variante: 'contenedor',
      filas: () => etiquetasDeCostos(e).filter((x) => x.tipo === tipo),
      clave: (x) => x.llave,
      seleccion: 'multiple',
      filtro: 'Search tag keys',
      columnas: [
        { titulo: 'Tag key', valor: (x) => x.llave },
        { titulo: 'Status', valor: (x) => (x.activa ? ui.estado('exito', 'Active') : ui.estado('inactivo', 'Inactive')) },
        { titulo: 'Last updated date', valor: (x) => (x.actualizada ? ui.fecha(x.actualizada) : '–') },
        { titulo: 'Last used month', valor: (x) => (x.ultimoUso ? nombreMes(x.ultimoUso) : '–') }
      ],
      acciones: (sel) => [
        ui.boton('Deactivate', { escribe: true, desactivado: !sel.some((x) => x.activa), alClic: () => confirmarCambio(sel.filter((x) => x.activa), false) }),
        ui.boton('Activate', { variante: 'primario', desactivado: !sel.some((x) => !x.activa), alClic: () => confirmarCambio(sel.filter((x) => !x.activa), true) })
      ],
      vacio: tipo === 'user' ? { titulo: 'No tags', texto: 'Tag keys appear here after you add them to your resources (EC2 instances, S3 buckets, volumes…).' } : { titulo: 'No tags', texto: 'No AWS generated tags.' }
    });
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Cost allocation tags', info: 'costos-etiquetas', cx, descripcion: 'Activate tags to track your AWS costs by them in Cost Explorer, Budgets and your cost and usage reports.' }),
    ui.pestanas({
      activa: st.pestana,
      alCambiar: (v) => (cx.memoria.pestanaEtiquetas = v),
      pestanas: [
        { id: 'user', texto: 'User-defined cost allocation tags', contenido: () => tabla('user') },
        { id: 'aws', texto: 'AWS generated cost allocation tags', contenido: () => tabla('aws') }
      ]
    })
  );
}

/* ============================================================ registro */

function noDisponible(cx, { que }) {
  migasBilling(cx, { texto: que });
  return ui.noDisponible(que);
}

const nd = (texto) => ({ texto, ruta: `${BASE}/no-disponible/${encodeURIComponent(texto)}` });

const ayudas = {
  'costos-tiempo': {
    titulo: 'El tiempo en la facturación del simulador',
    texto: [
      'En AWS pagas por hora (o por GB al mes) lo que tienes encendido o guardado. Para que en una clase se note el gasto, el simulador **comprime el tiempo**: **1 minuto real = 1 hora de uso**.',
      'Ejemplo: 2 instancias `t2.micro` prendidas 30 minutos se cobran como 2 × 30 h × $0.0116 = **$0.70**.',
      'Lo que ya se cobró se queda aunque borres el recurso, igual que en AWS. Los meses anteriores son un historial de ejemplo de tu cuenta.'
    ]
  },
  'costos-resumen': {
    titulo: 'Cost summary',
    texto: [
      '**Month-to-date cost**: lo que llevas gastado este mes.',
      '**Total forecasted cost**: lo que AWS calcula que gastarás al cierre del mes si sigues igual.',
      'Compara con el mes pasado para notar si algo se disparó.'
    ]
  },
  'costos-pronostico': {
    titulo: 'Pronóstico (forecast)',
    texto: [
      'El **pronóstico** es lo gastado más lo que cuestan por hora tus recursos de hoy, multiplicado por las horas que le faltan al mes.',
      'Si apagas o borras recursos, el pronóstico baja. Las alertas **Forecasted** de Budgets usan este número: te avisan **antes** de pasarte.'
    ]
  },
  'costos-facturas': {
    titulo: 'Bills (factura)',
    texto: [
      'La factura del mes, **por servicio**. Abre un servicio para ver cada cobro: el precio unitario, la cantidad (horas, GB-mes) y el importe.',
      'Busca líneas como `$0.0116 per On Demand Linux t2.micro Instance Hour` o `$0.005 per Idle public IPv4 address per hour` (una Elastic IP sin usar).',
      'El mes en curso dice **Pending**: se cierra el último día del mes.'
    ]
  },
  'costos-cost-explorer': {
    titulo: 'Cost Explorer',
    texto: [
      'Sirve para **analizar después** lo que gastaste: gráficas por mes o por día, agrupadas por **servicio**, **etiqueta**, tipo de instancia…',
      'En **Report parameters** (derecha) eliges el rango, la granularidad, el **Group by** y los filtros.',
      'Para agrupar por una etiqueta (por ejemplo `Proyecto`), primero actívala en **Cost allocation tags**. Verás grupos como `Proyecto$tienda` (llave `Proyecto`, valor `tienda`) y `No tag key: Proyecto` (lo que no tiene esa etiqueta).',
      'Marca **Show forecasted values** para ver el pronóstico de los siguientes meses.'
    ]
  },
  'costos-presupuesto': {
    titulo: 'AWS Budgets',
    texto: [
      'Un **presupuesto** es un límite que tú pones (por ejemplo, $10 al mes) para que AWS **te avise por correo** cuando te acerques o te pases.',
      '**Ojo:** un presupuesto **no apaga nada** ni detiene el cobro: solo avisa.',
      '**Use a template** crea uno rápido: el **Monthly cost budget** avisa al 85 % real, al 100 % real y si el pronóstico llega al 100 %.',
      '**Customize** te deja elegir periodo, alcance (servicios o etiquetas) y tus propias alertas.'
    ]
  },
  'costos-alertas': {
    titulo: 'Alertas de presupuesto',
    texto: [
      [
        '**Actual**: avisa cuando lo que YA gastaste pasa el umbral.',
        '**Forecasted**: avisa cuando lo que VAS a gastar al cierre del periodo pasa el umbral (aviso anticipado).'
      ],
      'El correo llega a la **bandeja de correo simulada** (en SNS). Cada alerta se manda una sola vez por periodo.'
    ]
  },
  'costos-etiquetas': {
    titulo: 'Cost allocation tags',
    texto: [
      'Las **etiquetas** (tags) son pares llave=valor que le pones a tus recursos, como `Proyecto=tienda`.',
      'Para que la facturación las use hay que **activarlas** aquí (Activate). Después puedes agrupar y filtrar por ellas en Cost Explorer y en Budgets.',
      'Así una empresa sabe cuánto gasta cada proyecto, área o cliente.'
    ]
  },
  'costos-calculadora': {
    titulo: 'Pricing Calculator',
    texto: [
      'Sirve para **estimar antes de construir**: eliges servicios, cantidades y forma de pago, y te dice cuánto costaría al mes.',
      'En **My Estimate** ves el costo inicial (Upfront), el mensual y el total de 12 meses. Usa **grupos** para ordenar (por ejemplo, «Servidores web»).',
      'Ejemplo: 2 × `t2.micro` On-Demand = 2 × $0.0116 × 730 h = **$16.94 al mes**.'
    ]
  },
  'costos-pago': {
    titulo: 'Formas de pago de EC2',
    texto: [
      [
        '**On-Demand**: pagas por hora, sin compromiso. El más caro, el más flexible.',
        '**Savings Plans**: te comprometes a gastar $X por hora durante 1 o 3 años y pagas menos (hasta ~72 %). Compute SP sirve para cualquier familia; EC2 Instance SP, para una familia fija.',
        '**Spot**: usas capacidad sobrante con hasta 90 % de descuento, pero AWS puede quitártela con 2 minutos de aviso.',
        '**All / Partial / No upfront**: cuánto pagas por adelantado. Más adelantado = más barato.'
      ]
    ]
  },
  'costos-free-tier': {
    titulo: 'Free Tier (capa gratuita)',
    texto: [
      'AWS regala cierto uso: algunas ofertas son por **12 meses** (750 h de `t2.micro` al mes) y otras **siempre** (Always Free, como 1 millón de peticiones de Lambda).',
      'Desde julio de 2025 las cuentas nuevas reciben **créditos** y un plan gratuito por 6 meses en lugar de los 12 meses.',
      'Si te pasas del límite, pagas el precio normal. Un **Zero spend budget** te avisa en cuanto gastes $0.01.'
    ]
  },
  'costos-anomalias': {
    titulo: 'Cost Anomaly Detection',
    texto: [
      'Vigila tu gasto y te avisa cuando un servicio gasta **mucho más de lo normal** (por ejemplo, olvidaste prender 10 instancias).',
      'Un **monitor** de servicios aprende tu gasto típico. En el simulador, un día es anómalo si un servicio gastó más del triple de su promedio diario del mes pasado.'
    ]
  },
  'costos-savings-plans': {
    titulo: 'Savings Plans y reservas',
    texto: [
      'Son **compromisos**: prometes usar (y pagar) cierta capacidad por 1 o 3 años y AWS te cobra menos que On-Demand.',
      'Las **recomendaciones** salen de tu uso actual: te dicen cuánto comprometer por hora y cuánto ahorrarías.',
      'En el simulador solo se ven: no se compran.'
    ]
  }
};

export default {
  id: 'billing',
  nombre: 'Billing and Cost Management',
  titulo: 'Billing and Cost Management',
  descripcion: 'View and pay bills, analyze and govern your spending',
  categoria: 'costos',
  claves: 'billing facturacion costos factura budgets presupuesto cost explorer pricing calculator calculadora tags etiquetas free tier',
  inicio: BASE,
  menu: [
    { texto: 'Home', ruta: BASE },
    nd('Getting started'),
    {
      seccion: 'Cost and Usage Analysis',
      items: [{ texto: 'Cost Explorer', ruta: `${BASE}/cost-explorer` }, { texto: 'Cost Explorer saved reports', ruta: `${BASE}/reportes` }, { texto: 'Cost Anomaly Detection', ruta: `${BASE}/anomalias` }, { texto: 'Free Tier', ruta: `${BASE}/free-tier` }, nd('Data Exports'), nd('Split cost allocation data')]
    },
    { seccion: 'Budgets and Planning', items: [{ texto: 'Budgets', ruta: `${BASE}/presupuestos` }, { texto: 'Pricing Calculator', ruta: `${BASE}/calculadora`, nuevo: true }, nd('Budgets reports')] },
    { seccion: 'Savings and Commitments', items: [{ texto: 'Savings Plans', ruta: `${BASE}/savings-plans` }, { texto: 'Reservations', ruta: `${BASE}/reservas` }] },
    { seccion: 'Billing and Payments', items: [{ texto: 'Bills', ruta: `${BASE}/facturas` }, nd('Payments'), nd('Credits'), nd('Purchase orders')] },
    { seccion: 'Cost Organization', items: [nd('Cost categories'), { texto: 'Cost allocation tags', ruta: `${BASE}/etiquetas` }, nd('Billing View')] },
    nd('Preferences and Settings')
  ],
  rutas: {
    '': inicio,
    facturas,
    'cost-explorer': costExplorer,
    'cost-explorer/:reporte': costExplorer,
    reportes,
    anomalias,
    'anomalias/crear': crearMonitor,
    'free-tier': capaGratuita,
    presupuestos,
    'presupuestos/crear': asistentePresupuesto,
    'presupuestos/:nombre': detallePresupuesto,
    'presupuestos/:nombre/editar': asistentePresupuesto,
    calculadora,
    'calculadora/:id': miEstimacion,
    'calculadora/:id/agregar': agregarServicio,
    'calculadora/:id/configurar/:servicio': configurarServicio,
    'calculadora/:id/editar/:linea': configurarServicio,
    'savings-plans': savingsPlans,
    reservas,
    etiquetas,
    'no-disponible/:que': noDisponible
  },
  busqueda: [
    { texto: 'Bills', ruta: `${BASE}/facturas`, claves: 'factura invoice' },
    { texto: 'Cost Explorer', ruta: `${BASE}/cost-explorer`, claves: 'costos gastos graficas' },
    { texto: 'Budgets', ruta: `${BASE}/presupuestos`, claves: 'presupuesto alertas' },
    { texto: 'Create budget', ruta: `${BASE}/presupuestos/crear`, claves: 'presupuesto' },
    { texto: 'Pricing Calculator', ruta: `${BASE}/calculadora`, claves: 'calculadora estimate estimacion precio' },
    { texto: 'Cost allocation tags', ruta: `${BASE}/etiquetas`, claves: 'etiquetas tags' },
    { texto: 'Free Tier', ruta: `${BASE}/free-tier`, claves: 'capa gratuita' },
    { texto: 'Cost Anomaly Detection', ruta: `${BASE}/anomalias`, claves: 'anomalias' },
    { texto: 'Savings Plans', ruta: `${BASE}/savings-plans`, claves: 'ahorro compromiso' },
    { texto: 'Reservations', ruta: `${BASE}/reservas`, claves: 'reserved instances reservas' }
  ],
  ayudas
};
