// ---------------------------------------------------------------------------
// AWS WELL-ARCHITECTED TOOL
//
// Define workload (asistente de 3 pasos: propiedades, perfil y lentes), la
// lista de Workloads, el detalle con Overview / Milestones / Properties, la
// revisión pregunta por pregunta de los seis pilares (banco reducido con las
// preguntas y mejores prácticas reales del Framework), el Improvement plan con
// los riesgos altos y medios y los milestones.
// ---------------------------------------------------------------------------

import * as ui from '../ui.js';
import {
  clonar,
  crearCargaWa,
  editarCargaWa,
  eliminarCargaWa,
  ENTORNOS_WA,
  ESTADOS_MEJORA_WA,
  guardarHitoWa,
  LENTES_WA,
  PILARES_WA,
  planMejoraWa,
  preguntaWa,
  PREGUNTAS_WA,
  responderPreguntaWa,
  resumenWa,
  riesgoPreguntaWa
} from '../modelo.js';

const { h, icono } = ui;

/* ================================================================ ayudas */

const migasWa = (cx, ...resto) => cx.migas([{ texto: 'AWS Well-Architected Tool', ruta: 'wellarchitected' }, ...resto]);
const cargas = (cx) => cx.estado.wellarchitected?.cargas ?? [];
const cargaDe = (cx, id) => cargas(cx).find((c) => c.id === id) ?? null;
const rutaCarga = (id, resto = '') => `wellarchitected/cargas/${id}${resto ? `/${resto}` : ''}`;
const LENTE = LENTES_WA[0];

/** Corre una acción del modelo sobre una copia: devuelve el mensaje de error o null (no cambia nada). */
function probar(cx, fn) {
  try {
    fn(clonar(cx.estado));
    return null;
  } catch (e) {
    return e?.message ?? String(e);
  }
}

const REGIONES = [
  ['us-east-1', 'US East (N. Virginia)'],
  ['us-east-2', 'US East (Ohio)'],
  ['us-west-1', 'US West (N. California)'],
  ['us-west-2', 'US West (Oregon)'],
  ['mx-central-1', 'Mexico (Central)'],
  ['ca-central-1', 'Canada (Central)'],
  ['sa-east-1', 'South America (São Paulo)'],
  ['eu-west-1', 'Europe (Ireland)'],
  ['eu-central-1', 'Europe (Frankfurt)'],
  ['ap-northeast-1', 'Asia Pacific (Tokyo)'],
  ['ap-southeast-1', 'Asia Pacific (Singapore)']
];
const nombreRegion = (r) => REGIONES.find(([c]) => c === r)?.[1] ?? r;

const INDUSTRIAS = ['Agriculture', 'Automotive', 'Defense', 'Education', 'Energy - Oil & Gas', 'Financial Services', 'Gaming', 'Government', 'Healthcare', 'Hospitality', 'Life Sciences', 'Manufacturing', 'Marketing & Advertising', 'Media & Entertainment', 'Retail', 'Technology', 'Telecommunications', 'Travel, Transportation & Logistics', 'Other'];

/** El riesgo con su ícono, como en la consola. */
function riesgoUi(r) {
  return {
    HIGH: () => ui.estado('error', 'High risk'),
    MEDIUM: () => ui.estado('aviso', 'Medium risk'),
    NONE: () => ui.estado('exito', 'No improvements identified'),
    NOT_APPLICABLE: () => ui.estado('inactivo', 'Not applicable'),
    UNANSWERED: () => ui.estado('detenido', 'Unanswered')
  }[r]();
}

const numeroRiesgo = (n, tipo) => h('span', { class: ['cx-wa-numero', n && `cx-wa-numero--${tipo}`] }, String(n));
const preguntaTexto = (q) => `${q.clave}. ${q.titulo}`;
const pilar = (id) => PILARES_WA.find((p) => p.id === id);

/** La primera pregunta sin contestar (o la primera de todas), para «Continue reviewing». */
const siguientePendiente = (c) => PREGUNTAS_WA.find((q) => riesgoPreguntaWa(q, c.respuestas[q.id]) === 'UNANSWERED') ?? PREGUNTAS_WA[0];

function noEncontrada(cx, id) {
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.alerta({ tipo: 'error', titulo: 'Workload not found', contenido: [`No workload found with ID ${id}. `, ui.enlace('View workloads', 'wellarchitected/cargas', { cx })] })
  );
}

/* ================================================================ portada */

function portada(cx) {
  migasWa(cx);
  return h(
    'div',
    { class: 'cx-pagina' },
    h(
      'div',
      { class: 'cx-org-heroe' },
      h('p', { class: 'cx-texto-sec' }, 'Management & Governance'),
      h('h1', { class: 'cx-org-heroe__titulo' }, 'AWS Well-Architected Tool'),
      h('p', { class: 'cx-org-heroe__lema' }, 'Review your workloads against current AWS architectural best practices.')
    ),
    h(
      'div',
      { class: 'cx-dos-columnas' },
      h(
        'div',
        { class: 'cx-pagina' },
        ui.contenedor({
          titulo: 'How it works',
          info: 'wa-workload',
          cx,
          cuerpo: h(
            'ol',
            { class: 'cx-org-pasos' },
            [
              ['Define a workload', 'Describe the application: its name, owner, environment, and the AWS Regions where it runs.'],
              ['Answer the questions', 'For each pillar, choose the best practices that your workload follows today.'],
              ['Review the improvement plan', 'The tool identifies high and medium risks and suggests what to improve first.'],
              ['Save milestones', 'Take a snapshot of the review and measure your progress over time.']
            ].map(([t, d], i) => h('li', {}, h('span', { class: 'cx-org-pasos__n' }, String(i + 1)), h('div', {}, h('strong', {}, t), h('p', { class: 'cx-texto-sec' }, d))))
          )
        }),
        ui.contenedor({
          titulo: 'The six pillars',
          info: 'wa-pilares',
          cx,
          cuerpo: h(
            'div',
            { class: 'cx-wa-pilares' },
            PILARES_WA.map((p) => h('div', { class: 'cx-wa-pilar' }, h('span', { class: 'cx-wa-pilar__id' }, p.id), h('div', {}, h('strong', {}, p.nombre), h('p', { class: 'cx-texto-sec' }, p.es))))
          )
        })
      ),
      h(
        'div',
        { class: 'cx-lado' },
        ui.contenedor({
          titulo: 'Define a workload',
          cuerpo: h(
            'div',
            { class: 'cx-form' },
            h('p', {}, 'Define a workload to start a review with the AWS Well-Architected Framework lens.'),
            ui.boton('Define workload', { variante: 'primario', alClic: () => cx.ir('wellarchitected/cargas/definir') }),
            cargas(cx).length ? ui.enlace(`View your workloads (${cargas(cx).length})`, 'wellarchitected/cargas', { cx }) : null
          )
        }),
        ui.contenedor({ titulo: 'Pricing', cuerpo: h('p', {}, 'The AWS Well-Architected Tool is available at no additional charge.') })
      )
    )
  );
}

/* ============================================================ workloads */

function cargasPagina(cx) {
  migasWa(cx, { texto: 'Workloads' });
  const t = ui.tabla(cx, {
    titulo: 'Workloads',
    info: 'wa-workload',
    descripcion: 'Workloads that you defined. Choose a workload to continue its review.',
    filas: () => cargas(cx),
    clave: (c) => c.id,
    seleccion: 'unica',
    filtro: 'Find workloads',
    columnas: [
      { titulo: 'Name', valor: (c) => ui.enlace(c.nombre, rutaCarga(c.id), { cx }), texto: (c) => c.nombre },
      { titulo: 'Owner', valor: (c) => c.responsable },
      { titulo: 'Questions answered', valor: (c) => { const r = resumenWa(c.respuestas); return `${r.contestadas}/${r.total}`; } },
      { titulo: 'High risks', valor: (c) => numeroRiesgo(resumenWa(c.respuestas).alto, 'alto'), texto: (c) => String(resumenWa(c.respuestas).alto) },
      { titulo: 'Medium risks', valor: (c) => numeroRiesgo(resumenWa(c.respuestas).medio, 'medio'), texto: (c) => String(resumenWa(c.respuestas).medio) },
      { titulo: 'Improvement status', valor: (c) => ESTADOS_MEJORA_WA[c.estadoMejora] },
      { titulo: 'Last updated', valor: (c) => ui.fecha(c.actualizada) }
    ],
    acciones: (sel) => [
      ui.boton('Delete', { escribe: true, desactivado: sel.length !== 1, alClic: () => borrarCarga(cx, sel[0]) }),
      ui.boton('Define workload', { variante: 'primario', alClic: () => cx.ir('wellarchitected/cargas/definir') })
    ],
    vacio: { titulo: 'No workloads', texto: 'You haven’t defined any workloads.', accion: ui.boton('Define workload', { escribe: true, alClic: () => cx.ir('wellarchitected/cargas/definir') }) }
  });
  return h('div', { class: 'cx-pagina' }, t);
}

function borrarCarga(cx, c) {
  cx.confirmar({
    titulo: `Delete workload '${c.nombre}'?`,
    palabra: 'delete',
    textoBoton: 'Delete',
    contenido: h('p', {}, 'Deleting a workload deletes its answers, milestones, and improvement plan. This action can’t be undone.'),
    aceptar: () => {
      const r = cx.hacer({ servicio: 'WellArchitected', accion: 'DeleteWorkload', error: 'Failed to delete workload' }, (e) => eliminarCargaWa(e, c.id));
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: `Workload ${c.nombre} deleted.` });
        cx.ir('wellarchitected/cargas');
      }
      return true;
    }
  });
}

/* ----------------------------------------------------- propiedades */

/** Los campos de «Workload properties» (Define y Edit). Cambia `f` en su lugar. */
function camposPropiedades(cx, f, errores = {}) {
  const regionesZona = ui.region(() =>
    h(
      'div',
      { class: 'cx-form' },
      ui.casilla({ etiqueta: 'AWS Regions', marcada: f.usarAws, alCambiar: (v) => ((f.usarAws = v), regionesZona.repintar()) }),
      f.usarAws
        ? ui.selector({
            multiple: true,
            valores: f.regiones,
            opciones: REGIONES.map(([v, n]) => ({ valor: v, etiqueta: n, descripcion: v })),
            placeholder: 'Choose AWS Regions',
            filtrar: true,
            etiquetaAccesible: 'AWS Regions',
            alCambiar: (v) => (f.regiones = v)
          })
        : null,
      ui.casilla({ etiqueta: 'Non-AWS regions', descripcion: 'For example, your own data center.', marcada: f.usarOtras, alCambiar: (v) => ((f.usarOtras = v), regionesZona.repintar()) }),
      f.usarOtras ? ui.entrada({ valor: f.otras, placeholder: 'Monterrey data center', etiquetaAccesible: 'Non-AWS regions', alCambiar: (v) => (f.otras = v) }) : null
    )
  );
  return h(
    'div',
    { class: 'cx-form' },
    ui.campo({
      etiqueta: 'Name',
      info: 'wa-workload',
      cx,
      descripcion: 'A unique identifier for the workload.',
      control: ui.entrada({ valor: f.nombre, placeholder: 'tienda-en-linea', etiquetaAccesible: 'Name', alCambiar: (v) => (f.nombre = v) }),
      error: errores.nombre,
      restriccion: 'The name must be from 3 to 100 characters. At least 3 characters must be non-whitespace.'
    }),
    ui.campo({
      etiqueta: 'Description',
      descripcion: 'A brief description of the workload to document its scope and intended purpose.',
      control: ui.area({ valor: f.descripcion, filas: 3, etiquetaAccesible: 'Description', alCambiar: (v) => (f.descripcion = v) }),
      error: errores.descripcion,
      restriccion: 'The description must be from 3 to 250 characters.'
    }),
    ui.campo({
      etiqueta: 'Review owner',
      descripcion: 'The name, email address, or identifier for the primary individual or group that owns the review process.',
      control: ui.entrada({ valor: f.responsable, placeholder: 'Ana López', etiquetaAccesible: 'Review owner', alCambiar: (v) => (f.responsable = v) }),
      error: errores.responsable,
      restriccion: 'The review owner must be from 3 to 255 characters.'
    }),
    ui.campo({
      etiqueta: 'Environment',
      descripcion: 'The environment in which your workload runs.',
      control: ui.radios({ opciones: [{ valor: 'PRODUCTION', etiqueta: 'Production' }, { valor: 'PREPRODUCTION', etiqueta: 'Pre-production' }], valor: f.entorno, alCambiar: (v) => (f.entorno = v) }),
      error: errores.entorno
    }),
    ui.campo({ etiqueta: 'Regions', descripcion: 'The AWS Regions and non-AWS regions where the workload runs.', control: regionesZona, error: errores.regiones }),
    ui.campo({
      etiqueta: 'Account IDs',
      opcional: true,
      descripcion: 'The AWS accounts associated with the workload, separated by commas.',
      control: ui.entrada({ valor: f.cuentas, placeholder: '123456789012', etiquetaAccesible: 'Account IDs', alCambiar: (v) => (f.cuentas = v) })
    }),
    ui.campo({
      etiqueta: 'Architectural design',
      opcional: true,
      descripcion: 'A URL to your architectural design.',
      control: ui.entrada({ valor: f.arquitectura, placeholder: 'https://', etiquetaAccesible: 'Architectural design', alCambiar: (v) => (f.arquitectura = v) })
    }),
    ui.campo({
      etiqueta: 'Industry type',
      opcional: true,
      control: ui.selector({ opciones: INDUSTRIAS.map((i) => ({ valor: i, etiqueta: i })), valor: f.industriaTipo || null, placeholder: 'Choose an industry type', etiquetaAccesible: 'Industry type', alCambiar: (v) => (f.industriaTipo = v) })
    })
  );
}

const formularioVacio = () => ({ nombre: '', descripcion: '', responsable: '', entorno: null, usarAws: true, regiones: ['us-east-1'], usarOtras: false, otras: '', cuentas: '', arquitectura: '', industriaTipo: '' });

const desdeCarga = (c) => ({
  nombre: c.nombre,
  descripcion: c.descripcion,
  responsable: c.responsable,
  entorno: c.entorno,
  usarAws: c.regiones.length > 0,
  regiones: [...c.regiones],
  usarOtras: c.regionesNoAws.length > 0,
  otras: c.regionesNoAws.join(', '),
  cuentas: c.cuentas.join(', '),
  arquitectura: c.arquitectura,
  industriaTipo: c.industriaTipo
});

/** Del formulario a los parámetros del modelo. */
const parametros = (f) => ({
  nombre: f.nombre,
  descripcion: f.descripcion,
  responsable: f.responsable,
  entorno: f.entorno,
  regiones: f.usarAws ? f.regiones : [],
  regionesNoAws: f.usarOtras ? f.otras.split(',').map((x) => x.trim()).filter(Boolean) : [],
  cuentas: f.cuentas.split(',').map((x) => x.trim()).filter(Boolean),
  arquitectura: f.arquitectura,
  industriaTipo: f.industriaTipo ?? ''
});

/** Lo que la consola revisa en el navegador antes de seguir (campos obligatorios). */
function erroresNavegador(f) {
  const e = {};
  if (!f.nombre.trim()) e.nombre = 'Name is required.';
  if (!f.descripcion.trim()) e.descripcion = 'Description is required.';
  if (!f.responsable.trim()) e.responsable = 'Review owner is required.';
  if (!f.entorno) e.entorno = 'Environment is required.';
  if (!(f.usarAws && f.regiones.length) && !(f.usarOtras && f.otras.trim())) e.regiones = 'Choose at least one AWS Region or enter a non-AWS region.';
  return e;
}

/* ----------------------------------------------------- Define workload */

const PASOS = ['Specify properties', 'Apply profile', 'Apply lenses'];

function asistente(cx, { paso, titulo, info, descripcion, cuerpo, pie }) {
  return h(
    'div',
    { class: 'cx-asis' },
    h(
      'nav',
      { class: 'cx-asis__pasos', 'aria-label': 'Steps' },
      h(
        'ol',
        {},
        PASOS.map((p, i) =>
          h(
            'li',
            { class: ['cx-asis__paso', i === paso && 'cx-asis__paso--actual', i > paso && 'cx-asis__paso--futuro'], 'aria-current': i === paso ? 'step' : undefined },
            h('small', {}, `Step ${i + 1}${i === 1 ? ' - optional' : ''}`),
            h('span', {}, p)
          )
        )
      )
    ),
    h('div', { class: 'cx-asis__cuerpo cx-pagina' }, ui.encabezado({ titulo, info, cx, descripcion }), cuerpo, pie)
  );
}

function pieAsistente({ cancelar, anterior, siguiente, textoSiguiente = 'Next', extra }) {
  return h(
    'div',
    { class: 'cx-pie-form' },
    ui.boton('Cancel', { variante: 'texto', alClic: cancelar }),
    extra ?? null,
    anterior ? ui.boton('Previous', { alClic: anterior }) : null,
    ui.boton(textoSiguiente, { variante: 'primario', alClic: siguiente })
  );
}

function definirPagina(cx) {
  migasWa(cx, { texto: 'Workloads', ruta: 'wellarchitected/cargas' }, { texto: 'Define workload' });
  cx.memoria.waDefinir ??= { paso: 0, f: formularioVacio() };
  const m = cx.memoria.waDefinir;
  const cancelar = () => {
    delete cx.memoria.waDefinir;
    cx.ir('wellarchitected/cargas');
  };
  let errores = {};
  let errorModelo = null;
  const zona = ui.region(() => {
    const ir = (p) => {
      m.paso = p;
      zona.repintar();
      zona.scrollIntoView?.({ block: 'start' });
    };
    const alertaError = errorModelo ? ui.alerta({ tipo: 'error', titulo: 'Failed to define workload', contenido: errorModelo }) : null;
    if (m.paso === 0) {
      return asistente(cx, {
        paso: 0,
        titulo: 'Specify properties',
        info: 'wa-workload',
        cuerpo: [ui.contenedor({ titulo: 'Workload properties', cuerpo: camposPropiedades(cx, m.f, errores) }), alertaError],
        pie: pieAsistente({
          cancelar,
          siguiente: () => {
            errores = erroresNavegador(m.f);
            errorModelo = Object.keys(errores).length ? null : probar(cx, (e) => crearCargaWa(e, parametros(m.f)));
            if (Object.keys(errores).length || errorModelo) return zona.repintar();
            ir(1);
          }
        })
      });
    }
    if (m.paso === 1) {
      return asistente(cx, {
        paso: 1,
        titulo: 'Apply profile',
        info: 'wa-workload',
        descripcion: 'A profile helps you prioritize the questions according to your business goals.',
        cuerpo: ui.contenedor({
          titulo: 'Profile',
          cuerpo: h(
            'div',
            { class: 'cx-form' },
            ui.campo({ etiqueta: 'Profile', opcional: true, control: ui.selector({ opciones: [], vacio: 'No profiles', placeholder: 'Choose a profile', desactivado: true, etiquetaAccesible: 'Profile' }) }),
            h('p', { class: 'cx-texto-sec' }, 'No profiles are available. This step is optional: choose Next.')
          )
        }),
        pie: pieAsistente({ cancelar, anterior: () => ir(0), siguiente: () => ir(2) })
      });
    }
    return asistente(cx, {
      paso: 2,
      titulo: 'Apply lenses',
      info: 'wa-lente',
      descripcion: 'Lenses are sets of questions for a specific technology or industry. The AWS Well-Architected Framework lens is always applied.',
      cuerpo: [
        ui.contenedor({
          titulo: 'Lenses',
          sinRelleno: true,
          cuerpo: h(
            'div',
            { class: 'cx-wa-lentes' },
            LENTES_WA.map((l) =>
              h(
                'div',
                { class: 'cx-wa-lente' },
                ui.casilla({ etiqueta: l.nombre, descripcion: l.descripcion, marcada: l.id === 'wellarchitected', desactivado: true }),
                l.disponible ? h('span', { class: 'cx-insignia cx-insignia--azul' }, 'Applied by default') : h('span', { class: 'cx-insignia cx-insignia--gris', title: 'No disponible en este simulador' }, 'Not available')
              )
            )
          )
        }),
        alertaError
      ],
      pie: pieAsistente({
        cancelar,
        anterior: () => ir(0),
        textoSiguiente: 'Define workload',
        siguiente: () => {
          const r = cx.hacer({ servicio: 'WellArchitected', accion: 'CreateWorkload', error: 'Failed to define workload' }, (e) => crearCargaWa(e, parametros(m.f)));
          if (r.ok) {
            delete cx.memoria.waDefinir;
            cx.flash({ tipo: 'exito', texto: `Workload ${r.valor.nombre} defined. Choose Start reviewing to answer the questions.` });
            cx.ir(rutaCarga(r.valor.id));
          }
        }
      })
    });
  });
  return h('div', { class: 'cx-pagina' }, zona);
}

/* ============================================================ el workload */

function guardarHito(cx, c) {
  let nombre = '';
  let error = null;
  const zona = ui.region(() =>
    h(
      'div',
      { class: 'cx-form' },
      h('p', {}, 'A milestone records the current state of the workload: its answers, risks, and improvement plan. Use milestones to measure your progress.'),
      ui.campo({
        etiqueta: 'Milestone name',
        control: ui.entrada({ valor: nombre, placeholder: 'Version 1.0 - initial review', etiquetaAccesible: 'Milestone name', alCambiar: (v) => (nombre = v), alEnter: () => guardar() }),
        error,
        restriccion: 'The name must be from 3 to 100 characters and unique for this workload.'
      })
    )
  );
  const guardar = () => {
    error = probar(cx, (e) => guardarHitoWa(e, c.id, nombre));
    if (error) return zona.repintar();
    const r = cx.hacer({ servicio: 'WellArchitected', accion: 'CreateMilestone', error: 'Failed to save milestone' }, (e) => guardarHitoWa(e, c.id, nombre));
    if (r.ok) {
      m.cerrar();
      cx.flash({ tipo: 'exito', texto: `Milestone ${r.valor.nombre} saved.`, accion: { texto: 'View milestones', alClic: () => ((cx.memoria.waPestana = 'hitos'), cx.ir(rutaCarga(c.id))) } });
      cx.ir(cx.ruta);
    }
  };
  const m = cx.modal({ titulo: 'Save milestone', contenido: zona, pie: [ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }), ui.boton('Save', { variante: 'primario', alClic: guardar })] });
}

/** La tabla de pilares (Questions answered, High risks, Medium risks). */
function tablaPilares(cx, resumen, { cargaId, enlaces = true } = {}) {
  return h(
    'table',
    { class: 'cx-tabla__tabla' },
    h('thead', {}, h('tr', {}, ['Pillar', 'Questions answered', 'High risks', 'Medium risks'].map((t) => h('th', {}, h('span', { class: 'cx-tabla__orden' }, t))))),
    h(
      'tbody',
      {},
      PILARES_WA.map((p) => {
        const r = resumen.porPilar[p.id];
        const primera = PREGUNTAS_WA.find((q) => q.pilar === p.id);
        return h(
          'tr',
          {},
          h('td', { style: { paddingLeft: '20px' } }, enlaces ? ui.enlace(p.nombre, rutaCarga(cargaId, `revision/${primera.id}`), { cx }) : p.nombre),
          h('td', {}, `${r.contestadas}/${r.total}`),
          h('td', {}, numeroRiesgo(r.alto, 'alto')),
          h('td', {}, numeroRiesgo(r.medio, 'medio'))
        );
      })
    )
  );
}

function detalleCarga(cx, { id }) {
  const c = cargaDe(cx, id);
  migasWa(cx, { texto: 'Workloads', ruta: 'wellarchitected/cargas' }, { texto: c?.nombre ?? id });
  if (!c) return noEncontrada(cx, id);
  const empezado = () => resumenWa(c.respuestas).contestadas > 0;
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({
      titulo: c.nombre,
      info: 'wa-workload',
      cx,
      descripcion: c.descripcion,
      acciones: [ui.boton('Delete', { escribe: true, alClic: () => borrarCarga(cx, c) }), ui.boton('Edit', { escribe: true, alClic: () => cx.ir(rutaCarga(id, 'editar')) })]
    }),
    ui.pestanas({
      activa: cx.memoria.waPestana ?? 'resumen',
      alCambiar: (p) => (cx.memoria.waPestana = p),
      pestanas: [
        {
          id: 'resumen',
          texto: 'Overview',
          contenido: () => {
            const r = resumenWa(c.respuestas);
            return h(
              'div',
              { class: 'cx-pagina' },
              ui.contenedor({
                titulo: 'Workload overview',
                info: 'wa-riesgo',
                cx,
                acciones: [
                  ui.boton('Save milestone', { escribe: true, alClic: () => guardarHito(cx, c) }),
                  ui.boton(empezado() ? 'Continue reviewing' : 'Start reviewing', { variante: 'primario', alClic: () => cx.ir(rutaCarga(id, `revision/${siguientePendiente(c).id}`)) })
                ],
                cuerpo: ui.pares(
                  [
                    { etiqueta: 'Questions answered', valor: `${r.contestadas}/${r.total}` },
                    { etiqueta: 'High risks', valor: numeroRiesgo(r.alto, 'alto'), info: 'wa-riesgo' },
                    { etiqueta: 'Medium risks', valor: numeroRiesgo(r.medio, 'medio') },
                    { etiqueta: 'Improvement status', valor: ESTADOS_MEJORA_WA[c.estadoMejora] },
                    { etiqueta: 'Review owner', valor: c.responsable },
                    { etiqueta: 'Environment', valor: ENTORNOS_WA[c.entorno] },
                    { etiqueta: 'Regions', valor: [...c.regiones.map(nombreRegion), ...c.regionesNoAws].join(', ') },
                    { etiqueta: 'Milestones', valor: String(c.hitos.length) }
                  ],
                  { columnas: 4, cx }
                )
              }),
              ui.contenedor({
                titulo: 'Lenses',
                contador: c.lentes.length,
                info: 'wa-lente',
                cx,
                sinRelleno: true,
                cuerpo: h(
                  'table',
                  { class: 'cx-tabla__tabla' },
                  h('thead', {}, h('tr', {}, ['Lens name', 'Questions answered', 'High risks', 'Medium risks'].map((t) => h('th', {}, h('span', { class: 'cx-tabla__orden' }, t))))),
                  h(
                    'tbody',
                    {},
                    h('tr', {}, h('td', { style: { paddingLeft: '20px' } }, ui.enlace(LENTE.nombre, rutaCarga(id, 'lente'), { cx })), h('td', {}, `${r.contestadas}/${r.total}`), h('td', {}, numeroRiesgo(r.alto, 'alto')), h('td', {}, numeroRiesgo(r.medio, 'medio')))
                  )
                )
              }),
              ui.contenedor({ titulo: 'Pillars', descripcion: 'AWS Well-Architected Framework lens', sinRelleno: true, cuerpo: tablaPilares(cx, r, { cargaId: id }) }),
              ui.alerta({ tipo: 'info', contenido: `Este simulador usa un banco reducido de ${PREGUNTAS_WA.length} preguntas reales (2 a 4 por pilar). La herramienta real tiene 57 preguntas en el Framework.` })
            );
          }
        },
        {
          id: 'hitos',
          texto: 'Milestones',
          contenido: () =>
            ui.tabla(cx, {
              titulo: 'Milestones',
              info: 'wa-hito',
              variante: 'contenedor',
              filas: () => [...(cargaDe(cx, id)?.hitos ?? [])].reverse(),
              clave: (x) => String(x.numero),
              filtro: 'Find milestones',
              columnas: [
                { titulo: 'Milestone name', valor: (x) => ui.enlace(x.nombre, rutaCarga(id, `hitos/${x.numero}`), { cx }), texto: (x) => x.nombre },
                { titulo: 'Milestone number', valor: (x) => String(x.numero) },
                { titulo: 'Date saved', valor: (x) => ui.fecha(x.fecha) },
                { titulo: 'Questions answered', valor: (x) => { const r = resumenWa(x.respuestas); return `${r.contestadas}/${r.total}`; } },
                { titulo: 'High risks', valor: (x) => numeroRiesgo(resumenWa(x.respuestas).alto, 'alto') },
                { titulo: 'Medium risks', valor: (x) => numeroRiesgo(resumenWa(x.respuestas).medio, 'medio') }
              ],
              acciones: () => [ui.boton('Save milestone', { variante: 'primario', alClic: () => guardarHito(cx, c) })],
              vacio: { titulo: 'No milestones', texto: 'Save a milestone to record the current state of the workload.' }
            })
        },
        { id: 'propiedades', texto: 'Properties', contenido: () => pestanaPropiedades(cx, c) },
        { id: 'compartir', texto: 'Shares', desactivada: true, contenido: () => null }
      ]
    })
  );
}

function pestanaPropiedades(cx, c) {
  const cambiarEstado = (v) => {
    const r = cx.hacer({ servicio: 'WellArchitected', accion: 'UpdateWorkload', error: 'Failed to update workload' }, (e) => editarCargaWa(e, c.id, { estadoMejora: v }));
    if (r.ok) cx.flash({ tipo: 'exito', texto: `Improvement status updated to ${ESTADOS_MEJORA_WA[v]}.` });
  };
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.contenedor({
      titulo: 'Workload properties',
      acciones: ui.boton('Edit', { escribe: true, alClic: () => cx.ir(rutaCarga(c.id, 'editar')) }),
      cuerpo: ui.pares(
        [
          { etiqueta: 'Name', valor: c.nombre },
          { etiqueta: 'Description', valor: c.descripcion },
          { etiqueta: 'Review owner', valor: c.responsable },
          { etiqueta: 'Environment', valor: ENTORNOS_WA[c.entorno] },
          { etiqueta: 'AWS Regions', valor: c.regiones.map((r) => `${nombreRegion(r)} (${r})`).join(', ') || '–' },
          { etiqueta: 'Non-AWS regions', valor: c.regionesNoAws.join(', ') || '–' },
          { etiqueta: 'Account IDs', valor: c.cuentas.join(', ') || '–' },
          { etiqueta: 'Architectural design', valor: ui.guion(c.arquitectura) },
          { etiqueta: 'Industry type', valor: ui.guion(c.industriaTipo) },
          { etiqueta: 'Created', valor: ui.fecha(c.creada) },
          { etiqueta: 'Last updated', valor: ui.fecha(c.actualizada) },
          { etiqueta: 'ARN', valor: ui.copiable(c.arn) }
        ],
        { columnas: 3 }
      )
    }),
    ui.contenedor({
      titulo: 'Workload status',
      info: 'wa-plan',
      cx,
      cuerpo: ui.campo({
        etiqueta: 'Improvement status',
        descripcion: 'Track how far along you are with the improvement plan.',
        control: h('div', { class: 'cx-wa-estado' }, ui.selector({ opciones: Object.entries(ESTADOS_MEJORA_WA).map(([v, t]) => ({ valor: v, etiqueta: t })), valor: c.estadoMejora, etiquetaAccesible: 'Improvement status', alCambiar: cambiarEstado }))
      })
    })
  );
}

function editarPagina(cx, { id }) {
  const c = cargaDe(cx, id);
  migasWa(cx, { texto: 'Workloads', ruta: 'wellarchitected/cargas' }, { texto: c?.nombre ?? id, ruta: rutaCarga(id) }, { texto: 'Edit' });
  if (!c) return noEncontrada(cx, id);
  const f = desdeCarga(c);
  let errores = {};
  let errorModelo = null;
  const zona = ui.region(() => [
    ui.contenedor({ titulo: 'Workload properties', cuerpo: camposPropiedades(cx, f, errores) }),
    errorModelo ? ui.alerta({ tipo: 'error', titulo: 'Failed to update workload', contenido: errorModelo }) : null
  ]);
  const guardar = () => {
    errores = erroresNavegador(f);
    errorModelo = Object.keys(errores).length ? null : probar(cx, (e) => editarCargaWa(e, id, parametros(f)));
    if (Object.keys(errores).length || errorModelo) return zona.repintar();
    const r = cx.hacer({ servicio: 'WellArchitected', accion: 'UpdateWorkload', error: 'Failed to update workload' }, (e) => editarCargaWa(e, id, parametros(f)));
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: `Workload ${r.valor.nombre} updated.` });
      cx.ir(rutaCarga(id));
    }
  };
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: `Edit ${c.nombre}`, info: 'wa-workload', cx }),
    zona,
    ui.pieFormulario({ cancelar: () => cx.ir(rutaCarga(id)), enviar: guardar, textoEnviar: 'Save' })
  );
}

/* ============================================================ el lente */

/** Una tarjeta del Improvement plan (una pregunta con sus prácticas faltantes). */
function itemMejora(cx, cargaId, x, { enlace = true } = {}) {
  return h(
    'div',
    { class: 'cx-wa-item' },
    h(
      'div',
      { class: 'cx-wa-item__cabeza' },
      h('div', {}, h('div', { class: 'cx-texto-sec' }, pilar(x.pregunta.pilar).nombre), enlace ? ui.enlace(preguntaTexto(x.pregunta), rutaCarga(cargaId, `revision/${x.pregunta.id}`), { cx }) : h('strong', {}, preguntaTexto(x.pregunta))),
      riesgoUi(x.riesgo)
    ),
    ui.expandible({
      titulo: `Recommended improvement items (${x.faltantes.length})`,
      contenido: h(
        'ul',
        { class: 'cx-wa-faltan' },
        x.faltantes.map((b) => h('li', {}, h('span', { class: ['cx-wa-faltan__riesgo', b.riesgo === 'HIGH' ? 'cx-wa-faltan__riesgo--alto' : 'cx-wa-faltan__riesgo--medio'] }, b.riesgo === 'HIGH' ? 'High' : 'Medium'), h('span', {}, h('strong', {}, `${b.id} `), b.titulo, h('span', { class: 'cx-texto-sec' }, ` — ${b.pista}`))))
      )
    })
  );
}

function planMejora(cx, c, respuestas = c.respuestas, { enlace = true } = {}) {
  const plan = planMejoraWa({ respuestas });
  const r = resumenWa(respuestas);
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.contenedor({
      titulo: 'Improvement plan overview',
      info: 'wa-plan',
      cx,
      cuerpo: ui.pares(
        [
          { etiqueta: 'High risks', valor: numeroRiesgo(r.alto, 'alto') },
          { etiqueta: 'Medium risks', valor: numeroRiesgo(r.medio, 'medio') },
          { etiqueta: 'Questions answered', valor: `${r.contestadas}/${r.total}` },
          { etiqueta: 'Improvement status', valor: ESTADOS_MEJORA_WA[c.estadoMejora] }
        ],
        { columnas: 4 }
      )
    }),
    ui.contenedor({
      titulo: 'Improvement items',
      contador: plan.length,
      descripcion: 'Questions with risks, ordered by pillar. High risk issues are listed first, followed by medium risk issues.',
      cuerpo: plan.length
        ? h('div', { class: 'cx-wa-items' }, plan.map((x) => itemMejora(cx, c.id, x, { enlace })))
        : h('p', { class: 'cx-texto-sec' }, r.contestadas ? 'No improvement items. The answered questions have no high or medium risks.' : 'Answer the questions of the workload review to get an improvement plan.')
    })
  );
}

function lentePagina(cx, { id }) {
  const c = cargaDe(cx, id);
  migasWa(cx, { texto: 'Workloads', ruta: 'wellarchitected/cargas' }, { texto: c?.nombre ?? id, ruta: rutaCarga(id) }, { texto: LENTE.nombre });
  if (!c) return noEncontrada(cx, id);
  const r = resumenWa(c.respuestas);
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({
      titulo: LENTE.nombre,
      info: 'wa-lente',
      cx,
      descripcion: LENTE.descripcion,
      acciones: [ui.boton(r.contestadas ? 'Continue reviewing' : 'Start reviewing', { variante: 'primario', alClic: () => cx.ir(rutaCarga(id, `revision/${siguientePendiente(c).id}`)) })]
    }),
    ui.pestanas({
      activa: cx.memoria.waLente ?? 'resumen',
      alCambiar: (p) => (cx.memoria.waLente = p),
      pestanas: [
        {
          id: 'resumen',
          texto: 'Overview',
          contenido: () =>
            h(
              'div',
              { class: 'cx-pagina' },
              ui.contenedor({
                titulo: 'Lens overview',
                cuerpo: ui.pares(
                  [
                    { etiqueta: 'Questions answered', valor: `${r.contestadas}/${r.total}` },
                    { etiqueta: 'High risks', valor: numeroRiesgo(r.alto, 'alto') },
                    { etiqueta: 'Medium risks', valor: numeroRiesgo(r.medio, 'medio') },
                    { etiqueta: 'Lens version', valor: '2025-02-25' }
                  ],
                  { columnas: 4 }
                )
              }),
              ui.contenedor({ titulo: 'Pillars', info: 'wa-pilares', cx, sinRelleno: true, cuerpo: tablaPilares(cx, r, { cargaId: id }) })
            )
        },
        { id: 'mejora', texto: 'Improvement plan', contenido: () => planMejora(cx, c) }
      ]
    })
  );
}

/* ============================================================ la revisión */

function revisionPagina(cx, { id, pregunta }) {
  const c = cargaDe(cx, id);
  const q = preguntaWa(pregunta);
  migasWa(cx, { texto: 'Workloads', ruta: 'wellarchitected/cargas' }, { texto: c?.nombre ?? id, ruta: rutaCarga(id) }, { texto: LENTE.nombre, ruta: rutaCarga(id, 'lente') }, { texto: q?.clave ?? pregunta });
  if (!c) return noEncontrada(cx, id);
  if (!q) return h('div', { class: 'cx-pagina' }, ui.alerta({ tipo: 'error', titulo: 'Question not found', contenido: [`No question ${pregunta} in this lens. `, ui.enlace('Back to the workload', rutaCarga(id), { cx })] }));
  const previa = c.respuestas[q.id];
  const f = { elegidas: new Set(previa?.elegidas ?? []), ninguna: Boolean(previa?.ninguna), noAplica: Boolean(previa?.noAplica), notas: previa?.notas ?? '' };
  const respuesta = () => ({ elegidas: [...f.elegidas], ninguna: f.ninguna, noAplica: f.noAplica, notas: f.notas });
  const indice = PREGUNTAS_WA.indexOf(q);

  /** Guarda y se va a `ruta` (si no cambió nada, solo navega). */
  const guardarEIr = (ruta) => {
    const antes = JSON.stringify(previa ?? null);
    const ahora = respuesta();
    const vacia = !ahora.elegidas.length && !ahora.ninguna && !ahora.noAplica && !ahora.notas.trim();
    if (antes !== JSON.stringify(vacia ? null : ahora)) {
      const r = cx.hacer({ servicio: 'WellArchitected', accion: 'UpdateAnswer', error: 'Failed to save answer' }, (e) => responderPreguntaWa(e, id, q.id, ahora));
      if (!r.ok) return;
    }
    cx.ir(ruta);
  };

  const opciones = ui.region(() =>
    h(
      'div',
      { class: 'cx-wa-opciones' },
      q.practicas.map((b) =>
        h(
          'div',
          { class: 'cx-wa-opcion' },
          ui.casilla({
            etiqueta: `${b.titulo}`,
            descripcion: b.pista,
            marcada: f.elegidas.has(b.id),
            desactivado: f.noAplica,
            alCambiar: (v) => {
              if (v) {
                f.elegidas.add(b.id);
                f.ninguna = false;
              } else f.elegidas.delete(b.id);
              opciones.repintar();
              riesgo.repintar();
            }
          }),
          h('span', { class: ['cx-wa-opcion__riesgo', b.riesgo === 'HIGH' ? 'cx-wa-faltan__riesgo--alto' : 'cx-wa-faltan__riesgo--medio'], title: 'Risk if this best practice is not followed' }, b.riesgo === 'HIGH' ? 'High' : 'Medium')
        )
      ),
      h(
        'div',
        { class: 'cx-wa-opcion cx-wa-opcion--ninguna' },
        ui.casilla({
          etiqueta: 'None of these',
          marcada: f.ninguna,
          desactivado: f.noAplica,
          alCambiar: (v) => {
            f.ninguna = v;
            if (v) f.elegidas.clear();
            opciones.repintar();
            riesgo.repintar();
          }
        })
      )
    )
  );
  const riesgo = ui.region(() => h('div', { class: 'cx-wa-riesgo' }, h('span', { class: 'cx-texto-sec' }, 'Risk: '), riesgoUi(riesgoPreguntaWa(q, respuesta()))));

  const navegacion = h(
    'nav',
    { class: 'cx-wa-nav', 'aria-label': 'Questions' },
    h('div', { class: 'cx-wa-nav__titulo' }, LENTE.nombre),
    PILARES_WA.map((p) =>
      h(
        'div',
        { class: 'cx-wa-nav__pilar' },
        h('div', { class: 'cx-wa-nav__nombre' }, p.nombre),
        PREGUNTAS_WA.filter((x) => x.pilar === p.id).map((x) => {
          const rx = riesgoPreguntaWa(x, c.respuestas[x.id]);
          return h(
            'button',
            {
              type: 'button',
              class: ['cx-wa-nav__pregunta', x.id === q.id && 'cx-wa-nav__pregunta--actual'],
              'aria-current': x.id === q.id ? 'page' : undefined,
              onclick: () => guardarEIr(rutaCarga(id, `revision/${x.id}`))
            },
            h('span', { class: ['cx-wa-punto', `cx-wa-punto--${rx.toLowerCase()}`], title: rx }),
            h('span', {}, preguntaTexto(x))
          );
        })
      )
    )
  );

  return h(
    'div',
    { class: 'cx-wa-revision' },
    navegacion,
    h(
      'div',
      { class: 'cx-pagina' },
      h('div', { class: 'cx-texto-sec' }, `${pilar(q.pilar).nombre} · Question ${indice + 1} of ${PREGUNTAS_WA.length}`),
      ui.encabezado({ titulo: preguntaTexto(q), info: `wa-${q.id}`, cx, descripcion: q.descripcion }),
      ui.contenedor({
        titulo: 'Best practices',
        info: 'wa-riesgo',
        cx,
        descripcion: 'Select the best practices that your workload follows today.',
        acciones: riesgo,
        cuerpo: opciones
      }),
      ui.contenedor({
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.casilla({
            etiqueta: 'Question does not apply to this workload',
            descripcion: 'If you choose this option, explain the reason in the notes.',
            marcada: f.noAplica,
            alCambiar: (v) => {
              f.noAplica = v;
              opciones.repintar();
              riesgo.repintar();
            }
          }),
          ui.campo({ etiqueta: 'Notes', opcional: true, control: ui.area({ valor: f.notas, filas: 3, etiquetaAccesible: 'Notes', alCambiar: (v) => (f.notas = v) }), restriccion: 'Maximum 2,084 characters.' })
        )
      }),
      h(
        'div',
        { class: 'cx-pie-form' },
        ui.boton('Save and exit', { escribe: true, alClic: () => guardarEIr(rutaCarga(id)) }),
        indice > 0 ? ui.boton('Previous', { alClic: () => guardarEIr(rutaCarga(id, `revision/${PREGUNTAS_WA[indice - 1].id}`)) }) : null,
        indice < PREGUNTAS_WA.length - 1
          ? ui.boton('Next', { variante: 'primario', alClic: () => guardarEIr(rutaCarga(id, `revision/${PREGUNTAS_WA[indice + 1].id}`)) })
          : ui.boton('Done', {
              variante: 'primario',
              alClic: () => {
                cx.memoria.waLente = 'mejora';
                guardarEIr(rutaCarga(id, 'lente'));
              }
            })
      )
    )
  );
}

/* ============================================================ milestones */

function hitoPagina(cx, { id, numero }) {
  const c = cargaDe(cx, id);
  const x = c?.hitos.find((y) => String(y.numero) === String(numero));
  migasWa(cx, { texto: 'Workloads', ruta: 'wellarchitected/cargas' }, { texto: c?.nombre ?? id, ruta: rutaCarga(id) }, { texto: x?.nombre ?? `Milestone ${numero}` });
  if (!c) return noEncontrada(cx, id);
  if (!x) return h('div', { class: 'cx-pagina' }, ui.alerta({ tipo: 'error', titulo: 'Milestone not found', contenido: [`No milestone ${numero} in this workload. `, ui.enlace('Back to the workload', rutaCarga(id), { cx })] }));
  const r = resumenWa(x.respuestas);
  const ahora = resumenWa(c.respuestas);
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: x.nombre, info: 'wa-hito', cx, descripcion: `Milestone ${x.numero} of ${c.nombre}. It shows the workload as it was on ${ui.fecha(x.fecha)}.` }),
    ui.contenedor({
      titulo: 'Milestone overview',
      cuerpo: ui.pares(
        [
          { etiqueta: 'Milestone number', valor: String(x.numero) },
          { etiqueta: 'Date saved', valor: ui.fecha(x.fecha) },
          { etiqueta: 'Questions answered', valor: `${r.contestadas}/${r.total}` },
          { etiqueta: 'High risks', valor: h('span', {}, numeroRiesgo(r.alto, 'alto'), h('span', { class: 'cx-texto-sec' }, `  (now ${ahora.alto})`)) },
          { etiqueta: 'Medium risks', valor: h('span', {}, numeroRiesgo(r.medio, 'medio'), h('span', { class: 'cx-texto-sec' }, `  (now ${ahora.medio})`)) }
        ],
        { columnas: 5 }
      )
    }),
    ui.contenedor({ titulo: 'Pillars', sinRelleno: true, cuerpo: tablaPilares(cx, r, { cargaId: id, enlaces: false }) }),
    planMejora(cx, c, x.respuestas, { enlace: false })
  );
}

/* ============================================================ registro */

const noDisp = (titulo) => (cx) => {
  migasWa(cx, { texto: titulo });
  return ui.noDisponible(titulo);
};

// Una ayuda «Info» por pregunta, en español.
const AYUDAS_PREGUNTAS = {
  OPS1: 'Antes de construir, el equipo se pone de acuerdo en qué importa más: lo que piden los clientes, las reglas de la empresa y las leyes. Así se decide en qué gastar tiempo y dinero.',
  OPS4: '**Observabilidad** = poder saber qué pasa dentro de tu sistema sin adivinar: métricas, logs y trazas (CloudWatch, X-Ray). Empieza por definir qué números (KPI) dicen que todo va bien.',
  OPS6: 'Cada cambio que subes puede romper algo. Reduce el riesgo: prueba antes, despliega poco a poco y ten listo el plan para regresar a la versión anterior.',
  SEC1: 'La base de la seguridad: separa cargas en **cuentas distintas** (AWS Organizations), protege la **raíz** con MFA y automatiza los controles (por ejemplo con SCP).',
  SEC2: 'Quién entra y cómo: **MFA**, credenciales **temporales** (roles) en lugar de llaves fijas, secretos guardados en **Secrets Manager** y permisos por **grupo**.',
  SEC8: 'Los datos guardados (discos, buckets, bases) deben ir **cifrados** con llaves bien administradas (**KMS**) y solo debe leerlos quien tiene permiso.',
  REL2: 'Diseña la red pensando en fallas y en crecer: entrada pública con alta disponibilidad (balanceador, Route 53), subredes en **varias zonas** y rangos IP que no choquen.',
  REL7: 'Una carga **elástica** crece y se encoge sola con la demanda (**Auto Scaling**) y reemplaza lo que falla. Haz pruebas de carga para saber cuánto aguanta.',
  REL9: 'Respalda datos y configuración según cuánto puedes perder (**RPO**) y cuánto puedes tardar en volver (**RTO**). Automatiza los respaldos, cífralos y **prueba restaurarlos**.',
  REL10: '**Aislar fallas**: si una zona de disponibilidad se cae, las otras siguen. Por eso se despliega en **Multi-AZ** (o en varias regiones).',
  PERF1: 'Elige la arquitectura con información: conoce los servicios, usa arquitecturas de referencia, compara con pruebas y toma en cuenta el costo.',
  PERF2: 'Escoge el cómputo correcto (instancias, contenedores o Lambda), del **tamaño correcto** (right-sizing), mide sus métricas y escala con la demanda.',
  PERF3: 'Cada tipo de dato tiene su base ideal: relacional (**RDS**), clave-valor (**DynamoDB**), objetos (**S3**). Mide su rendimiento y usa **caché** para lo que se lee mucho.',
  COST2: '**Gobernar el uso**: reglas y metas de gasto, una estructura de cuentas con **Organizations** y controles que se cumplen solos (SCP, presupuestos).',
  COST3: 'No puedes ahorrar en lo que no ves: **etiqueta** los recursos, activa las etiquetas de costos y usa **Cost Explorer** y **Budgets** con alertas.',
  COST6: 'Antes de crear, **estima** (Pricing Calculator). Luego elige tipo, tamaño y cantidad mirando métricas reales, o deja que **Auto Scaling** lo ajuste.',
  SUS1: 'La región que eliges cambia la latencia, las leyes que aplican, el costo y la **huella de carbono**. Elige con todo eso en mente.',
  SUS2: 'Usa solo lo que la demanda necesita: escala dinámicamente, borra lo que nadie usa y aplana los picos con colas.',
  SUS5: 'Menos hardware y más eficiente: tamaños justos, instancias eficientes (como Graviton) y **servicios administrados**, que comparten infraestructura.'
};

export default {
  id: 'wellarchitected',
  nombre: 'AWS Well-Architected Tool',
  titulo: 'AWS Well-Architected Tool',
  descripcion: 'Review workloads against best practices',
  categoria: 'gestion',
  claves: 'well architected wa pilares pillars revision review workload milestone riesgo',
  inicio: 'wellarchitected',
  menu: [
    { texto: 'Dashboard', desactivado: true },
    { texto: 'Workloads', ruta: 'wellarchitected/cargas' },
    { texto: 'Custom lenses', desactivado: true },
    { texto: 'Lens catalog', desactivado: true },
    { texto: 'Profiles', desactivado: true },
    { texto: 'Review templates', desactivado: true },
    { texto: 'Share invitations', desactivado: true },
    { texto: 'Settings', desactivado: true },
    { seccion: 'Resources', items: [{ texto: 'AWS Well-Architected Framework', externo: true, desactivado: true }, { texto: 'What’s new', externo: true, desactivado: true }] }
  ],
  rutas: {
    '': portada,
    cargas: (cx) => (cargas(cx).length ? cargasPagina(cx) : portada(cx)),
    'cargas/definir': definirPagina,
    'cargas/:id': detalleCarga,
    'cargas/:id/editar': editarPagina,
    'cargas/:id/lente': lentePagina,
    'cargas/:id/revision/:pregunta': revisionPagina,
    'cargas/:id/hitos/:numero': hitoPagina,
    lentes: noDisp('Custom lenses')
  },
  busqueda: [
    { texto: 'Workloads', ruta: 'wellarchitected/cargas', claves: 'well-architected revision cargas' },
    { texto: 'Define workload', ruta: 'wellarchitected/cargas/definir', claves: 'well-architected definir workload' }
  ],
  ayudas: {
    'wa-workload': {
      titulo: 'Workload (carga de trabajo)',
      texto: [
        'Un **workload** es el conjunto de recursos que juntos dan valor al negocio: por ejemplo, la tienda en línea (servidores, base de datos, bucket de fotos).',
        'Al definirlo le pones nombre, una descripción, el **responsable de la revisión** (Review owner), el **ambiente** (Production o Pre-production) y las **regiones** donde corre.',
        'Después contestas las preguntas de los seis pilares y la herramienta te dice dónde hay riesgos.'
      ]
    },
    'wa-pilares': {
      titulo: 'Los seis pilares',
      texto: [
        'El AWS Well-Architected Framework revisa una arquitectura desde seis ángulos:',
        [
          '**Operational Excellence**: operar y mejorar el sistema (monitoreo, despliegues seguros).',
          '**Security**: proteger datos, cuentas y sistemas.',
          '**Reliability**: que funcione siempre y se recupere de fallas.',
          '**Performance Efficiency**: usar los recursos correctos de forma eficiente.',
          '**Cost Optimization**: no pagar de más.',
          '**Sustainability**: reducir el impacto ambiental.'
        ],
        'Truco para recordarlos: «**O**rden, **S**eguridad, **R**esistencia, **R**apidez, **C**osto y **S**ostenibilidad».'
      ]
    },
    'wa-lente': {
      titulo: 'Lentes (lenses)',
      texto: [
        'Un **lente** es un juego de preguntas. El **AWS Well-Architected Framework** siempre se aplica: tiene las preguntas generales de los seis pilares.',
        'Hay lentes extra para casos especiales (Serverless, SaaS, IA…). En el simulador solo está el del Framework.'
      ]
    },
    'wa-riesgo': {
      titulo: 'Riesgos alto y medio',
      texto: [
        'Por cada pregunta marcas las **mejores prácticas** que ya sigues. Cada práctica que falta deja un riesgo:',
        ['**High risk**: falta una práctica importante. Atiéndela primero.', '**Medium risk**: falta una práctica menos crítica.', '**No improvements identified**: sigues todas.'],
        '«None of these» significa que no sigues ninguna: casi siempre da riesgo alto. «Question does not apply» quita la pregunta del cálculo.'
      ]
    },
    'wa-plan': {
      titulo: 'Improvement plan',
      texto: [
        'El **plan de mejora** junta las preguntas con riesgo, primero las de riesgo alto, y lista las prácticas que te faltan.',
        'Ve atendiéndolas, vuelve a contestar la pregunta y verás bajar los riesgos. Marca tu avance con **Improvement status**.'
      ]
    },
    'wa-hito': {
      titulo: 'Milestones',
      texto: [
        'Un **milestone** es una foto de la revisión en un momento: respuestas, riesgos y plan de mejora.',
        'Guarda uno al terminar la primera revisión y otro después de mejorar: así comparas el antes y el después.'
      ]
    },
    ...Object.fromEntries(PREGUNTAS_WA.map((q) => [`wa-${q.id}`, { titulo: `${q.clave} · ${pilar(q.pilar).es}`, texto: [AYUDAS_PREGUNTAS[q.id], 'Marca solo lo que tu carga **ya hace hoy**. Lo que no marques aparece en el **Improvement plan**.'] }]))
  }
};
