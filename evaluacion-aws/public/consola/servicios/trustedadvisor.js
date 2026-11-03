// ---------------------------------------------------------------------------
// TRUSTED ADVISOR
//
// Recommendations (contadores, categorías y la lista de chequeos), una página
// por categoría y el detalle de cada chequeo con sus recursos marcados.
//
// Los chequeos se CALCULAN del estado de la cuenta (modelo/costos.js,
// CHEQUEOS_ADVISOR), pero la consola muestra lo de la ÚLTIMA revisión: después
// de corregir algo hay que pulsar «Refresh all checks» (o «Refresh» en el
// chequeo), igual que en AWS. Con el plan Basic solo se ven los chequeos de
// seguridad básicos y los límites de servicio; los demás salen con candado.
// ---------------------------------------------------------------------------

import * as ui from '../ui.js';
import { CATEGORIAS_ADVISOR, CHEQUEOS_ADVISOR, chequeoDisponible, dinero, planSoporte, refrescarAdvisor, reloj } from '../modelo.js';

const { h } = ui;

const BASE = 'trustedadvisor';
const migasTa = (cx, ...resto) => cx.migas([{ texto: 'Trusted Advisor', ruta: BASE }, ...resto]);
const ESTADOS = {
  error: ['error', 'Action recommended'],
  warning: ['aviso', 'Investigation recommended'],
  ok: ['exito', 'No problems detected'],
  pendiente: ['inactivo', 'Not refreshed yet']
};

/** El resultado de un chequeo tal como quedó en la última revisión (o null si está bloqueado). */
function resultado(estado, ch) {
  if (!chequeoDisponible(estado, ch)) return null;
  return estado.costos?.advisor?.resultados?.[ch.id] ?? { estado: 'pendiente', evaluados: 0, marcados: [], revisado: null };
}

function estadoChequeo(estado, ch) {
  const r = resultado(estado, ch);
  if (!r) return h('span', { class: 'cx-st cx-st--inactivo' }, ui.icono('lock'), h('span', {}, 'Upgrade required'));
  const [tipo, texto] = ESTADOS[r.estado] ?? ESTADOS.pendiente;
  return ui.estado(tipo, texto);
}

const haceCuanto = (iso) => {
  if (!iso) return '–';
  const s = Math.max(0, Math.round((reloj.ahora() - Date.parse(iso)) / 1000));
  if (s < 60) return 'less than a minute ago';
  const m = Math.round(s / 60);
  return m < 60 ? `${m} minute${m === 1 ? '' : 's'} ago` : ui.fecha(iso);
};

function refrescarTodo(cx) {
  const r = cx.hacer({ servicio: 'TrustedAdvisor', accion: 'RefreshTrustedAdvisorCheck', error: 'Failed to refresh checks' }, (e) => refrescarAdvisor(e));
  if (r.ok) cx.flash({ tipo: 'exito', texto: 'All checks have been refreshed.' });
}

/** El aviso azul de las cuentas con Basic Support. */
function avisoPlan(cx) {
  if (planSoporte(cx.estado.costos?.planSoporte).id !== 'basic') return null;
  return ui.alerta({
    tipo: 'info',
    titulo: 'Upgrade your AWS Support plan to get all Trusted Advisor checks',
    contenido: 'With Basic Support you get the core security checks and the service limits checks. Business Support+, Enterprise Support and Unified Operations include the full set of checks for cost optimization, performance, fault tolerance and operational excellence.',
    accion: ui.boton('Compare support plans', { alClic: () => cx.ir('support/planes') })
  });
}

/** La tabla de chequeos (todos o los de una categoría). */
function tablaChequeos(cx, { categoria, titulo, variante = 'contenedor' }) {
  const e = cx.estado;
  return ui.tabla(cx, {
    titulo,
    variante,
    info: 'ta-chequeos',
    filas: () => CHEQUEOS_ADVISOR.filter((c) => !categoria || c.categoria === categoria),
    clave: (c) => c.id,
    seleccion: null,
    filtro: 'Search by check name',
    columnas: [
      { titulo: 'Status', valor: (c) => estadoChequeo(e, c), texto: (c) => resultado(e, c)?.estado ?? 'locked' },
      { titulo: 'Check name', valor: (c) => ui.enlace(c.nombre, `${BASE}/chequeo/${c.id}`, { cx }), texto: (c) => c.nombre },
      { titulo: 'Category', valor: (c) => CATEGORIAS_ADVISOR.find((x) => x.id === c.categoria)?.nombre },
      { titulo: 'Source', valor: () => 'AWS Trusted Advisor' },
      {
        titulo: 'Resources flagged',
        valor: (c) => {
          const r = resultado(e, c);
          return r ? `${r.marcados.length} of ${r.evaluados}` : '–';
        }
      },
      { titulo: 'Last refreshed', valor: (c) => (resultado(e, c)?.revisado ? haceCuanto(resultado(e, c).revisado) : '–') }
    ],
    vacio: { titulo: 'No checks', texto: 'There are no checks in this category.' }
  });
}

function recomendaciones(cx) {
  migasTa(cx, { texto: 'Recommendations' });
  const e = cx.estado;
  const resumen = cx.vivo(() => {
    const res = CHEQUEOS_ADVISOR.map((c) => resultado(e, c)).filter(Boolean);
    const cuenta = (est) => res.filter((r) => r.estado === est).length;
    const ahorro = CHEQUEOS_ADVISOR.filter((c) => c.categoria === 'cost_optimizing')
      .map((c) => resultado(e, c))
      .filter(Boolean)
      .flatMap((r) => r.marcados)
      .reduce((a, m) => a + (m.ahorro ?? 0), 0);
    const revisado = e.costos?.advisor?.revisado;
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.contenedor({
        titulo: 'Checks summary',
        info: 'ta-chequeos',
        cx,
        descripcion: revisado ? `Last refreshed ${haceCuanto(revisado)}` : 'Not refreshed yet',
        cuerpo: h(
          'div',
          { class: 'cx-ta-contadores' },
          contador('Action recommended', cuenta('error'), 'error'),
          contador('Investigation recommended', cuenta('warning'), 'aviso'),
          contador('Checks with excluded items', 0, 'info'),
          contador('No problems detected', cuenta('ok'), 'exito')
        )
      }),
      h(
        'div',
        { class: 'cx-ta-categorias' },
        CATEGORIAS_ADVISOR.map((cat) => {
          const chequeos = CHEQUEOS_ADVISOR.filter((c) => c.categoria === cat.id);
          const r = chequeos.map((c) => resultado(e, c));
          const bloqueados = r.filter((x) => !x).length;
          const n = (est) => r.filter((x) => x?.estado === est).length;
          return h(
            'div',
            { class: 'cx-ta-categoria' },
            h('div', { class: 'cx-ta-categoria__cabeza' }, ui.enlace(cat.nombre, `${BASE}/categoria/${cat.id}`, { cx }), cat.id === 'cost_optimizing' && ahorro > 0 ? h('span', { class: 'cx-texto-sec' }, `Potential monthly savings: ${dinero(ahorro)}`) : null),
            bloqueados === chequeos.length
              ? h('div', { class: 'cx-st cx-st--inactivo' }, ui.icono('lock'), h('span', {}, 'Upgrade your support plan to see these checks'))
              : h('div', { class: 'cx-ta-categoria__cuentas' }, ui.estado('error', String(n('error'))), ui.estado('aviso', String(n('warning'))), ui.estado('exito', String(n('ok'))), bloqueados ? h('span', { class: 'cx-st cx-st--inactivo' }, ui.icono('lock'), h('span', {}, String(bloqueados))) : null)
          );
        })
      )
    );
  });
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({
      titulo: 'Trusted Advisor Recommendations',
      info: 'ta-chequeos',
      cx,
      descripcion: 'Trusted Advisor inspects your AWS environment and makes recommendations to save money, improve performance and security, and close gaps.',
      acciones: [ui.boton('Download all checks', { icono: 'download', desactivado: true }), ui.boton('Refresh all checks', { icono: 'refresh', escribe: true, alClic: () => refrescarTodo(cx) })]
    }),
    avisoPlan(cx),
    resumen,
    tablaChequeos(cx, { titulo: 'Checks' })
  );
}

const contador = (texto, n, tipo) => h('div', { class: 'cx-ta-contador' }, ui.estado(tipo, texto), h('div', { class: ['cx-ta-contador__n', `cx-ta-contador__n--${tipo}`] }, String(n)));

function categoria(cx, { cat }) {
  const c = CATEGORIAS_ADVISOR.find((x) => x.id === cat);
  migasTa(cx, { texto: c?.nombre ?? cat });
  if (!c) return ui.noDisponible('Category not found');
  const bloqueados = CHEQUEOS_ADVISOR.filter((x) => x.categoria === cat && !chequeoDisponible(cx.estado, x)).length;
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: c.nombre, info: 'ta-chequeos', cx, acciones: [ui.boton('Refresh all checks', { icono: 'refresh', escribe: true, alClic: () => refrescarTodo(cx) })] }),
    bloqueados ? avisoPlan(cx) : null,
    tablaChequeos(cx, { categoria: cat, titulo: 'Checks' })
  );
}

function detalle(cx, { id }) {
  const ch = CHEQUEOS_ADVISOR.find((c) => c.id === id);
  migasTa(cx, { texto: 'Recommendations', ruta: BASE }, { texto: ch?.nombre ?? id });
  if (!ch) return ui.noDisponible('Check not found');
  const e = cx.estado;
  const cat = CATEGORIAS_ADVISOR.find((x) => x.id === ch.categoria);
  const refrescar = () => {
    const r = cx.hacer({ servicio: 'TrustedAdvisor', accion: 'RefreshTrustedAdvisorCheck', error: 'Failed to refresh check' }, (est) => refrescarAdvisor(est, ch.id));
    if (r.ok) cx.flash({ tipo: 'exito', texto: `The check "${ch.nombre}" has been refreshed.` });
  };
  return cx.vivo(() => {
    const r = resultado(e, ch);
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({
        titulo: ch.nombre,
        info: 'ta-chequeos',
        cx,
        descripcion: r?.revisado ? `Last refreshed ${haceCuanto(r.revisado)}` : null,
        acciones: [ui.boton('Refresh', { icono: 'refresh', escribe: true, desactivado: !r, alClic: refrescar })]
      }),
      !r ? avisoPlan(cx) ?? ui.alerta({ tipo: 'info', contenido: 'This check is not available with your support plan.' }) : null,
      ui.contenedor({
        titulo: 'Check details',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.pares(
            [
              { etiqueta: 'Status', valor: estadoChequeo(e, ch) },
              { etiqueta: 'Category', valor: cat?.nombre },
              { etiqueta: 'Source', valor: 'AWS Trusted Advisor' },
              { etiqueta: 'Resources flagged', valor: r ? `${r.marcados.length} of ${r.evaluados}` : '–' }
            ],
            { columnas: 4 }
          ),
          h('div', {}, h('b', {}, 'Description'), h('p', {}, ch.descripcion)),
          h('div', {}, h('b', {}, 'Alert criteria'), h('ul', { class: 'cx-costos-ol' }, ch.criterios.map((c) => h('li', {}, c)))),
          h('div', {}, h('b', {}, 'Recommended action'), h('p', {}, ch.accion))
        )
      }),
      r
        ? ui.contenedor({
            titulo: 'Affected resources',
            contador: r.marcados.length,
            sinRelleno: true,
            cuerpo: r.marcados.length
              ? h(
                  'div',
                  { class: 'cx-tabla__desliza' },
                  h(
                    'table',
                    { class: 'cx-tabla__tabla' },
                    h('thead', {}, h('tr', {}, h('th', {}, h('span', { class: 'cx-tabla__orden' }, 'Status')), ch.columnas.map((c) => h('th', {}, h('span', { class: 'cx-tabla__orden' }, c))))),
                    h('tbody', {}, r.marcados.map((m) => h('tr', {}, h('td', { style: { paddingLeft: '20px' } }, m.estado === 'error' ? ui.estado('error', 'Red') : ui.estado('aviso', 'Yellow')), ch.columnas.map((c) => h('td', {}, m.datos?.[c] ?? '–')))))
                  )
                )
              : h('div', { class: 'cx-tabla__vacia' }, h('b', {}, r.revisado ? 'No problems detected' : 'Not refreshed yet'), h('div', {}, r.revisado ? 'No resources are flagged by this check.' : 'Choose Refresh to run this check.'))
          })
        : null
    );
  });
}

function noDisponible(cx, { que }) {
  migasTa(cx, { texto: que });
  return ui.noDisponible(que);
}

const nd = (texto) => ({ texto, ruta: `${BASE}/no-disponible/${encodeURIComponent(texto)}` });

export default {
  id: 'trustedadvisor',
  nombre: 'Trusted Advisor',
  titulo: 'Trusted Advisor',
  descripcion: 'Optimize performance and security',
  categoria: 'gestion',
  claves: 'trusted advisor recomendaciones seguridad costos chequeos limites',
  inicio: BASE,
  menu: [
    { texto: 'Recommendations', ruta: BASE },
    ...CATEGORIAS_ADVISOR.map((c) => ({ texto: c.nombre, ruta: `${BASE}/categoria/${c.id}` })),
    { texto: 'Engage', desactivado: true },
    nd('Organizational view'),
    nd('Notifications'),
    nd('Preferences')
  ],
  rutas: {
    '': recomendaciones,
    'categoria/:cat': categoria,
    'chequeo/:id': detalle,
    'no-disponible/:que': noDisponible
  },
  busqueda: [
    { texto: 'Trusted Advisor recommendations', ruta: BASE, claves: 'recomendaciones' },
    { texto: 'Security checks', ruta: `${BASE}/categoria/security`, claves: 'seguridad mfa' },
    { texto: 'Cost optimization checks', ruta: `${BASE}/categoria/cost_optimizing`, claves: 'ahorro costos' },
    { texto: 'Service limits', ruta: `${BASE}/categoria/service_limits`, claves: 'cuotas limites quotas' }
  ],
  ayudas: {
    'ta-chequeos': {
      titulo: 'Trusted Advisor',
      texto: [
        'Trusted Advisor revisa tu cuenta como un asesor y te dice qué mejorar en **cinco áreas**: costos, rendimiento, seguridad, tolerancia a fallas y límites de servicio (más excelencia operativa).',
        [
          '**Rojo (Action recommended)**: corrígelo ya. Ejemplo: la raíz sin MFA, el puerto 22 abierto a todo internet, un snapshot público.',
          '**Amarillo (Investigation recommended)**: revísalo. Ejemplo: una Elastic IP que pagas y no usas.',
          '**Verde**: sin problemas.'
        ],
        'Muestra lo de la **última revisión**: después de corregir algo, pulsa **Refresh all checks**.',
        'Con el plan **Basic** solo ves los chequeos básicos de seguridad y los límites de servicio. El resto requiere **Business Support+** o mayor.'
      ]
    }
  }
};
