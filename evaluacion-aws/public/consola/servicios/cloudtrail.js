// ---------------------------------------------------------------------------
// CLOUDTRAIL
//
// «Quién hizo qué»: el Dashboard, el Event history (sacado de estado.bitacora,
// con los filtros Lookup attributes y el detalle del evento en JSON) y los
// Trails (Create trail con su bucket de S3, Start/Stop logging y Delete).
// El modelo vive en modelo/cloudwatch.js (eventosCloudTrail, crearTrail…).
// ---------------------------------------------------------------------------

import * as ui from '../ui.js';
import { cambiarRegistroTrail, crearTrail, eliminarTrail, eventosCloudTrail, existeFuncion, hexAzar, llamar, registroEventoCloudTrail, trailDe } from '../modelo.js';
import { noExiste } from './comun.js';
import { fechaUtc } from './cloudwatch.js';

const { h } = ui;

const migasCt = (cx, ...resto) => cx.migas([{ texto: 'CloudTrail', ruta: 'cloudtrail' }, ...resto]);
const trails = (cx) => cx.estado.cloudtrail?.trails ?? [];
const rutaEvento = (id) => `cloudtrail/eventos/${id}`;
const rutaTrail = (n) => `cloudtrail/trails/${encodeURIComponent(n)}`;

/** El recurso que se muestra en las columnas Resource type / Resource name. */
const primerRecurso = (ev) => ev.recursos[0] ?? null;

/* =============================================================== dashboard */

function dashboard(cx) {
  migasCt(cx, { texto: 'Dashboard' });
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Dashboard', info: 'ct-historial', cx }),
    cx.vivo(() =>
      ui.contenedor({
        titulo: 'Trails',
        contador: trails(cx).length,
        info: 'ct-trail',
        cx,
        acciones: ui.boton('Create trail', { escribe: true, alClic: () => cx.ir('cloudtrail/trails/crear') }),
        cuerpo: trails(cx).length
          ? ui.pares(trails(cx).map((t) => ({ etiqueta: t.nombre, valor: h('div', {}, t.registrando ? ui.estado('exito', 'Logging') : ui.estado('detenido', 'Not logging'), h('div', { class: 'cx-texto-sec' }, `s3://${t.bucket}`)) })), { columnas: 3 })
          : h('div', {}, h('p', { class: 'cx-texto-sec' }, 'Event history keeps 90 days of management events. Create a trail to keep a copy of every event in an S3 bucket.'))
      })
    ),
    ui.tabla(cx, {
      titulo: 'Event history',
      variante: 'contenedor',
      descripcion: 'The most recent events in your account.',
      filas: () => eventosCloudTrail(cx.estado).slice(0, 5),
      clave: (e) => e.id,
      filtro: false,
      paginacion: false,
      columnas: [
        { titulo: 'Event name', valor: (e) => ui.enlace(e.nombre, rutaEvento(e.id), { cx }) },
        { titulo: 'Event time', valor: (e) => fechaUtc(e.t) },
        { titulo: 'Event source', valor: (e) => e.fuente }
      ],
      acciones: () => [ui.boton('View full Event history', { alClic: () => cx.ir('cloudtrail/eventos') })],
      vacio: { titulo: 'No events', texto: 'Events appear here when you create or change resources.' }
    })
  );
}

/* =========================================================== event history */

const ATRIBUTOS = [
  { valor: 'soloLectura', etiqueta: 'Read-only' },
  { valor: 'nombre', etiqueta: 'Event name' },
  { valor: 'usuario', etiqueta: 'User name' },
  { valor: 'tipo', etiqueta: 'Resource type' },
  { valor: 'recurso', etiqueta: 'Resource name' },
  { valor: 'fuente', etiqueta: 'Event source' },
  { valor: 'id', etiqueta: 'Event ID' },
  { valor: 'llave', etiqueta: 'AWS access key' }
];

const RANGOS = [
  { valor: 30, etiqueta: 'Last 30 minutes' },
  { valor: 60, etiqueta: 'Last 1 hour' },
  { valor: 720, etiqueta: 'Last 12 hours' },
  { valor: 1440, etiqueta: 'Last 1 day' },
  { valor: 10080, etiqueta: 'Last 7 days' },
  { valor: 0, etiqueta: 'Last 90 days' }
];

function cumple(ev, atributo, valor) {
  const v = valor.trim().toLowerCase();
  if (!v) return true;
  switch (atributo) {
    case 'soloLectura':
      return v === 'false' ? !ev.soloLectura : v === 'true' ? ev.soloLectura : true;
    case 'nombre':
      return ev.nombre.toLowerCase() === v;
    case 'usuario':
      return ev.usuario.toLowerCase() === v;
    case 'tipo':
      return ev.recursos.some((r) => r.tipo.toLowerCase() === v);
    case 'recurso':
      return ev.recursos.some((r) => r.nombre.toLowerCase() === v);
    case 'fuente':
      return ev.fuente.toLowerCase() === v;
    case 'id':
      return ev.id.toLowerCase() === v;
    default:
      return false;
  }
}

function historial(cx) {
  migasCt(cx, { texto: 'Event history' });
  const st = cx.memoria.ctFiltro ?? { atributo: 'soloLectura', valor: 'false', minutos: 0 };
  cx.memoria.ctFiltro = st;
  const valor = ui.region(() =>
    st.atributo === 'soloLectura'
      ? ui.selector({ compacto: true, valor: st.valor === 'true' ? 'true' : 'false', etiquetaAccesible: 'Lookup value', opciones: [{ valor: 'false', etiqueta: 'false' }, { valor: 'true', etiqueta: 'true' }], alCambiar: (v) => ((st.valor = v), t.actualizar(true)) })
      : ui.entrada({ valor: st.valor, placeholder: `Enter ${ATRIBUTOS.find((a) => a.valor === st.atributo)?.etiqueta.toLowerCase()}`, etiquetaAccesible: 'Lookup value', alCambiar: (v) => ((st.valor = v), t.actualizar(true)) })
  );
  const filtros = h(
    'div',
    { class: 'cx-cw-filtros' },
    ui.selector({ compacto: true, valor: st.atributo, etiquetaAccesible: 'Lookup attributes', opciones: ATRIBUTOS, alCambiar: (v) => ((st.atributo = v), (st.valor = v === 'soloLectura' ? 'false' : ''), valor.repintar(), t.actualizar(true)) }),
    valor,
    ui.selector({ compacto: true, valor: st.minutos, etiquetaAccesible: 'Filter by date and time', opciones: RANGOS, alCambiar: (v) => ((st.minutos = Number(v)), t.actualizar(true)) })
  );
  const t = ui.tabla(cx, {
    titulo: 'Event history',
    info: 'ct-historial',
    descripcion: 'Event history shows you the last 90 days of management events.',
    filas: () => {
      const desde = st.minutos ? Date.now() - st.minutos * 60000 : 0;
      return eventosCloudTrail(cx.estado).filter((e) => cumple(e, st.atributo, st.valor) && (!desde || Date.parse(e.t) >= desde));
    },
    clave: (e) => e.id,
    filtro: false,
    columnas: [
      { titulo: 'Event name', valor: (e) => ui.enlace(e.nombre, rutaEvento(e.id), { cx }) },
      { titulo: 'Event time', valor: (e) => fechaUtc(e.t) },
      { titulo: 'User name', valor: (e) => e.usuario },
      { titulo: 'Event source', valor: (e) => e.fuente },
      { titulo: 'Resource type', valor: (e) => primerRecurso(e)?.tipo ?? '–' },
      { titulo: 'Resource name', valor: (e) => primerRecurso(e)?.nombre ?? '–' }
    ],
    acciones: () => [ui.boton('Download events', { desactivado: true, iconoDerecha: 'caret-down' }), ui.boton('Create Athena table', { desactivado: true })],
    vacio: { titulo: 'No events', texto: 'No events match the filter.' }
  });
  // Los filtros van en la barra de la tabla, donde la consola pone el buscador.
  t.querySelector('.cx-tabla__barra > div:first-child')?.replaceWith(h('div', { class: 'cx-tabla__filtro' }, filtros));
  return h('div', { class: 'cx-pagina' }, t);
}

function detalleEvento(cx, { id }) {
  migasCt(cx, { texto: 'Event history', ruta: 'cloudtrail/eventos' }, { texto: id });
  const ev = eventosCloudTrail(cx.estado).find((e) => e.id === id);
  if (!ev) return noExiste(cx, 'Event', id, 'cloudtrail/eventos');
  const registro = registroEventoCloudTrail(cx.estado, ev);
  const texto = JSON.stringify(registro, null, 4);
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: ev.nombre, info: 'ct-historial', cx }),
    ui.contenedor({
      titulo: 'Details',
      cuerpo: ui.pares(
        [
          { etiqueta: 'Event time', valor: ui.fechaLarga(ev.t) },
          { etiqueta: 'User name', valor: ev.usuario },
          { etiqueta: 'Event name', valor: ev.nombre },
          { etiqueta: 'Event source', valor: ev.fuente },
          { etiqueta: 'AWS access key', valor: registro.userIdentity.accessKeyId },
          { etiqueta: 'Source IP address', valor: registro.sourceIPAddress },
          { etiqueta: 'Event ID', valor: ui.copiable(ev.id) },
          { etiqueta: 'Request ID', valor: registro.requestID },
          { etiqueta: 'AWS region', valor: registro.awsRegion },
          { etiqueta: 'Error code', valor: '–' },
          { etiqueta: 'Read-only', valor: 'false' }
        ],
        { columnas: 3 }
      )
    }),
    ui.tabla(cx, {
      titulo: 'Resources referenced',
      variante: 'contenedor',
      filas: () => ev.recursos,
      clave: (r) => `${r.tipo}|${r.nombre}`,
      filtro: false,
      paginacion: false,
      columnas: [
        { titulo: 'Resource type', valor: (r) => r.tipo },
        { titulo: 'Resource name', valor: (r) => r.nombre },
        { titulo: 'AWS Config resource timeline', valor: () => '–' }
      ],
      vacio: { titulo: 'No resources', texto: 'This event doesn’t reference any resources.' }
    }),
    ui.contenedor({
      titulo: 'Event record',
      info: 'ct-registro',
      cx,
      acciones: ui.copiable(texto, { soloIcono: true }),
      cuerpo: h('pre', { class: 'cx-cw-json' }, texto)
    })
  );
}

/* ================================================================== trails */

function listaTrails(cx) {
  migasCt(cx, { texto: 'Trails' });
  const t = ui.tabla(cx, {
    titulo: 'Trails',
    info: 'ct-trail',
    filas: () => trails(cx),
    clave: (x) => x.nombre,
    seleccion: 'unica',
    filtro: 'Filter trails',
    columnas: [
      { titulo: 'Name', valor: (x) => ui.enlace(x.nombre, rutaTrail(x.nombre), { cx }) },
      { titulo: 'Home region', valor: () => 'US East (N. Virginia)' },
      { titulo: 'Multi-region trail', valor: (x) => (x.multiRegion ? 'Yes' : 'No') },
      { titulo: 'Insights', valor: () => 'Disabled' },
      { titulo: 'Organization trail', valor: () => 'No' },
      { titulo: 'S3 bucket', valor: (x) => x.bucket },
      { titulo: 'Log file prefix', valor: (x) => x.prefijo || '–' },
      { titulo: 'CloudWatch Logs log group', valor: () => '–' },
      { titulo: 'Status', valor: (x) => (x.registrando ? ui.estado('exito', 'Logging') : ui.estado('detenido', 'Not logging')) }
    ],
    acciones: (sel) => [
      ui.boton('Delete', { escribe: true, desactivado: sel.length !== 1, alClic: () => borrarTrail(cx, sel[0].nombre) }),
      ui.boton('Copy events to Lake', { desactivado: true }),
      ui.boton('Create trail', { variante: 'primario', alClic: () => cx.ir('cloudtrail/trails/crear') })
    ],
    vacio: { titulo: 'No trails', texto: 'You don’t have any trails.', accion: ui.boton('Create trail', { escribe: true, alClic: () => cx.ir('cloudtrail/trails/crear') }) }
  });
  return h('div', { class: 'cx-pagina' }, t);
}

function borrarTrail(cx, nombre) {
  cx.confirmar({
    titulo: 'Delete trail?',
    textoBoton: 'Delete',
    contenido: h('p', {}, `Are you sure you want to delete the trail ${nombre}? Log files already delivered to the S3 bucket are not deleted.`),
    aceptar: () => {
      const r = cx.hacer({ servicio: 'CloudTrail', accion: 'DeleteTrail', error: 'Failed to delete trail' }, (e) => eliminarTrail(e, nombre));
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: `Trail ${nombre} successfully deleted.` });
        cx.ir('cloudtrail/trails');
      }
      return r.ok;
    }
  });
}

/** El marco de un asistente: los pasos a la izquierda y el contenido a la derecha. */
function asistente(cx, { pasos, paso, cuerpo, pie }) {
  return h(
    'div',
    { class: 'cx-asis' },
    h('nav', { class: 'cx-asis__pasos', 'aria-label': 'Steps' }, h('ol', {}, pasos.map((p, i) => h('li', { class: ['cx-asis__paso', i === paso && 'cx-asis__paso--actual', i > paso && 'cx-asis__paso--futuro'] }, h('small', {}, `Step ${i + 1}`), h('span', {}, p))))),
    h('div', { class: 'cx-asis__cuerpo cx-pagina' }, ui.encabezado({ titulo: pasos[paso], info: 'ct-trail', cx }), cuerpo, pie)
  );
}

function crearTrailPagina(cx) {
  migasCt(cx, { texto: 'Trails', ruta: 'cloudtrail/trails' }, { texto: 'Create trail' });
  const pasos = ['Choose trail attributes', 'Choose log events', 'Review and create'];
  const sufijo = hexAzar(8);
  const f = {
    paso: 0,
    nombre: '',
    almacen: 'nuevo',
    bucketNuevo: `aws-cloudtrail-logs-${cx.estado.cuenta.id}-${sufijo}`,
    bucketExistente: null,
    prefijo: '',
    cifrado: true,
    alias: `aws-cloudtrail-logs-${cx.estado.cuenta.id}-${sufijo}`,
    validacion: true,
    lectura: true,
    escritura: true
  };
  const errores = {};
  const zona = ui.region(() => {
    let cuerpo;
    if (f.paso === 0) {
      cuerpo = [
        ui.contenedor({
          titulo: 'General details',
          descripcion: 'A trail created in the console is a multi-region trail.',
          cuerpo: h(
            'div',
            { class: 'cx-form' },
            ui.campo({ etiqueta: 'Trail name', descripcion: 'Enter a display name for your trail.', control: ui.entrada({ valor: f.nombre, alCambiar: (v) => (f.nombre = v) }), restriccion: '3-128 characters. Only letters, numbers, periods, underscores, and dashes are allowed.', error: errores.nombre }),
            ui.casilla({ etiqueta: 'Enable for all accounts in my organization', desactivado: true, descripcion: 'To review accounts in your organization, open AWS Organizations.' }),
            ui.campo({
              etiqueta: 'Storage location',
              info: 'ct-trail',
              cx,
              control: ui.radios({
                valor: f.almacen,
                opciones: [
                  { valor: 'nuevo', etiqueta: 'Create new S3 bucket', descripcion: 'Create a bucket to store logs for the trail.' },
                  { valor: 'existente', etiqueta: 'Use existing S3 bucket', descripcion: 'Choose an existing bucket to store logs for this trail.' }
                ],
                alCambiar: (v) => ((f.almacen = v), zona.repintar())
              })
            }),
            f.almacen === 'nuevo'
              ? ui.campo({ etiqueta: 'Trail log bucket and folder', descripcion: 'Enter a new S3 bucket name and folder (prefix) to store your logs. Bucket names must be globally unique.', control: ui.entrada({ valor: f.bucketNuevo, alCambiar: (v) => (f.bucketNuevo = v) }), error: errores.bucket })
              : ui.campo({ etiqueta: 'Trail log bucket name', control: ui.selector({ valor: f.bucketExistente, placeholder: 'Choose a bucket', filtrar: true, vacio: 'No buckets', opciones: (cx.estado.buckets ?? []).map((b) => ({ valor: b.nombre, etiqueta: b.nombre })), alCambiar: (v) => (f.bucketExistente = v) }), error: errores.bucket }),
            ui.campo({ etiqueta: 'Prefix', opcional: true, control: ui.entrada({ valor: f.prefijo, placeholder: 'logs', alCambiar: (v) => (f.prefijo = v) }), descripcion: `Logs will be stored in ${f.prefijo ? `${f.prefijo}/` : ''}AWSLogs/${cx.estado.cuenta.id}` }),
            ui.campo({
              etiqueta: 'Log file SSE-KMS encryption',
              info: 'ct-trail',
              cx,
              control: ui.casilla({ etiqueta: 'Enabled', marcada: f.cifrado, alCambiar: (v) => ((f.cifrado = v), zona.repintar()) })
            }),
            f.cifrado ? ui.campo({ etiqueta: 'AWS KMS alias', descripcion: 'New customer managed key. KMS key and S3 bucket must be in the same region.', control: ui.entrada({ valor: f.alias, alCambiar: (v) => (f.alias = v) }) }) : null,
            ui.campo({ etiqueta: 'Log file validation', control: ui.casilla({ etiqueta: 'Enabled', marcada: f.validacion, alCambiar: (v) => (f.validacion = v) }) }),
            ui.campo({ etiqueta: 'SNS notification delivery', control: ui.casilla({ etiqueta: 'Enabled', desactivado: true }) })
          )
        }),
        ui.contenedor({ titulo: 'CloudWatch Logs', descripcion: 'Configure CloudWatch Logs to monitor your trail logs.', cuerpo: ui.casilla({ etiqueta: 'Enabled', desactivado: true }) }),
        ui.expandible({ titulo: 'Tags - optional', contenido: h('p', { class: 'cx-texto-sec' }, 'No tags associated with the resource.') })
      ];
    } else if (f.paso === 1) {
      cuerpo = [
        ui.contenedor({
          titulo: 'Events',
          descripcion: 'Record API activity for individual resources, or for all current and future resources in AWS account.',
          cuerpo: h(
            'div',
            { class: 'cx-form' },
            ui.casilla({ etiqueta: 'Management events', descripcion: 'Capture management operations performed on your AWS resources.', marcada: true, desactivado: true }),
            ui.casilla({ etiqueta: 'Data events', descripcion: 'Log the resource operations performed on or within a resource.', desactivado: true }),
            ui.casilla({ etiqueta: 'Insights events', descripcion: 'Identify unusual activity, errors, or user behavior in your account.', desactivado: true }),
            ui.casilla({ etiqueta: 'Network activity events', descripcion: 'Log VPC endpoint API activity.', desactivado: true })
          )
        }),
        ui.contenedor({
          titulo: 'Management events',
          cuerpo: h(
            'div',
            { class: 'cx-form' },
            ui.campo({
              etiqueta: 'API activity',
              descripcion: 'Choose the activities you want to log.',
              control: h('div', { class: 'cx-acciones' }, ui.casilla({ etiqueta: 'Read', marcada: f.lectura, alCambiar: (v) => (f.lectura = v) }), ui.casilla({ etiqueta: 'Write', marcada: f.escritura, alCambiar: (v) => (f.escritura = v) })),
              error: errores.eventos
            }),
            ui.casilla({ etiqueta: 'Exclude AWS KMS events', desactivado: true }),
            ui.casilla({ etiqueta: 'Exclude Amazon RDS Data API events', desactivado: true })
          )
        })
      ];
    } else {
      cuerpo = [
        ui.contenedor({
          titulo: 'Step 1: Choose trail attributes',
          acciones: ui.boton('Edit', { alClic: () => ((f.paso = 0), zona.repintar()) }),
          cuerpo: ui.pares(
            [
              { etiqueta: 'Trail name', valor: f.nombre },
              { etiqueta: 'Multi-region trail', valor: 'Yes' },
              { etiqueta: 'Trail log location', valor: `${f.almacen === 'nuevo' ? f.bucketNuevo : f.bucketExistente}/${f.prefijo ? `${f.prefijo}/` : ''}AWSLogs/${cx.estado.cuenta.id}` },
              { etiqueta: 'Log file SSE-KMS encryption', valor: f.cifrado ? 'Enabled' : 'Disabled' },
              { etiqueta: 'Log file validation', valor: f.validacion ? 'Enabled' : 'Disabled' },
              { etiqueta: 'SNS notification delivery', valor: 'Disabled' }
            ],
            { columnas: 3 }
          )
        }),
        ui.contenedor({
          titulo: 'Step 2: Choose log events',
          acciones: ui.boton('Edit', { alClic: () => ((f.paso = 1), zona.repintar()) }),
          cuerpo: ui.pares([{ etiqueta: 'Management events', valor: [f.lectura && 'Read', f.escritura && 'Write'].filter(Boolean).join(', ') }, { etiqueta: 'Data events', valor: 'Disabled' }, { etiqueta: 'Insights events', valor: 'Disabled' }], { columnas: 3 })
        })
      ];
    }
    return asistente(cx, {
      pasos,
      paso: f.paso,
      cuerpo,
      pie: h(
        'div',
        { class: 'cx-pie-form' },
        ui.boton('Cancel', { variante: 'texto', alClic: () => cx.ir('cloudtrail/trails') }),
        f.paso ? ui.boton('Previous', { alClic: () => ((f.paso -= 1), zona.repintar()) }) : null,
        ui.boton(f.paso < 2 ? 'Next' : 'Create trail', { variante: 'primario', alClic: f.paso < 2 ? siguiente : crear })
      )
    });
  });

  function siguiente() {
    for (const k of Object.keys(errores)) errores[k] = null;
    if (f.paso === 0) {
      const n = f.nombre.trim();
      if (!n) errores.nombre = 'Trail name is required.';
      else if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,126}[A-Za-z0-9]$/.test(n)) errores.nombre = 'Trail name must start and end with a letter or number, and contain only letters, numbers, periods, underscores, and dashes.';
      else if (trailDe(cx.estado, n)) errores.nombre = `Trail ${n} already exists.`;
      if (f.almacen === 'existente' && !f.bucketExistente) errores.bucket = 'Choose a bucket.';
      if (f.almacen === 'nuevo' && !f.bucketNuevo.trim()) errores.bucket = 'Bucket name is required.';
    }
    if (f.paso === 1 && !f.lectura && !f.escritura) errores.eventos = 'Choose Read, Write, or both.';
    if (Object.values(errores).some(Boolean)) return zona.repintar();
    f.paso += 1;
    zona.repintar();
  }

  function crear() {
    const r = cx.hacer(
      { servicio: 'CloudTrail', accion: 'CreateTrail', error: 'Failed to create trail' },
      (e) =>
        crearTrail(e, {
          nombre: f.nombre.trim(),
          bucket: f.almacen === 'nuevo' ? f.bucketNuevo.trim() : f.bucketExistente,
          bucketNuevo: f.almacen === 'nuevo',
          prefijo: f.prefijo,
          kms: f.cifrado ? `alias/${f.alias.trim()}` : null,
          validacion: f.validacion,
          eventosLectura: f.lectura,
          eventosEscritura: f.escritura
        }),
      { atomico: true }
    );
    if (!r.ok) return;
    cx.flash({ tipo: 'exito', texto: `Trail successfully created. Trail ${r.valor.nombre} is now logging events to s3://${r.valor.bucket}.`, accion: { texto: 'View trail', alClic: () => cx.ir(rutaTrail(r.valor.nombre)) } });
    cx.ir('cloudtrail/trails');
  }
  return zona;
}

function detalleTrail(cx, { nombre }) {
  migasCt(cx, { texto: 'Trails', ruta: 'cloudtrail/trails' }, { texto: nombre });
  if (!trailDe(cx.estado, nombre)) return noExiste(cx, 'Trail', nombre, 'cloudtrail/trails');
  return cx.vivo(() => {
    const t = trailDe(cx.estado, nombre);
    if (!t) return noExiste(cx, 'Trail', nombre, 'cloudtrail/trails');
    const alternar = () => {
      const r = cx.hacer({ servicio: 'CloudTrail', accion: t.registrando ? 'StopLogging' : 'StartLogging', error: 'Failed to update trail' }, (e) => cambiarRegistroTrail(e, nombre, !t.registrando));
      if (r.ok) cx.flash({ tipo: 'exito', texto: r.valor.registrando ? `Trail ${nombre} is now logging.` : `Logging stopped for trail ${nombre}.` });
    };
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({
        titulo: nombre,
        info: 'ct-trail',
        cx,
        acciones: [ui.boton('Delete', { escribe: true, alClic: () => borrarTrail(cx, nombre) }), ui.boton(t.registrando ? 'Stop logging' : 'Start logging', { escribe: true, alClic: alternar })]
      }),
      ui.contenedor({
        titulo: 'General details',
        // «Edit» necesita la acción UpdateTrail del modelo (editarTrail, por llamar()).
        acciones: existeFuncion('editarTrail') ? ui.boton('Edit', { escribe: true, alClic: () => cx.ir(`${rutaTrail(nombre)}/editar`) }) : null,
        cuerpo: ui.pares(
          [
            { etiqueta: 'Trail logging', valor: t.registrando ? ui.estado('exito', 'Logging') : ui.estado('detenido', 'Not logging') },
            { etiqueta: 'Trail name', valor: t.nombre },
            { etiqueta: 'Multi-region trail', valor: t.multiRegion ? 'Yes' : 'No' },
            { etiqueta: 'Apply trail to my organization', valor: 'Not enabled' },
            { etiqueta: 'Trail log location', valor: ui.enlace(`${t.bucket}/${t.prefijo ? `${t.prefijo}/` : ''}AWSLogs/${cx.estado.cuenta.id}`, `s3/buckets/${t.bucket}`, { cx }) },
            { etiqueta: 'Last log file delivered', valor: t.ultimaEntrega ? fechaUtc(t.ultimaEntrega) : '–' },
            { etiqueta: 'Log file SSE-KMS encryption', valor: t.kms ? `Enabled (${t.kms})` : 'Disabled' },
            { etiqueta: 'Log file validation', valor: t.validacion ? 'Enabled' : 'Disabled' },
            { etiqueta: 'Trail ARN', valor: ui.copiable(t.arn) }
          ],
          { columnas: 3 }
        )
      }),
      ui.contenedor({ titulo: 'Management events', cuerpo: ui.pares([{ etiqueta: 'API activity', valor: [t.eventosLectura && 'Read', t.eventosEscritura && 'Write'].filter(Boolean).join(', ') || 'None' }, { etiqueta: 'Exclude AWS KMS events', valor: 'No' }], { columnas: 3 }) }),
      ui.contenedor({ titulo: 'Data events', cuerpo: h('p', { class: 'cx-texto-sec' }, 'No data events configured.') }),
      ui.contenedor({ titulo: 'Insights events', cuerpo: h('p', { class: 'cx-texto-sec' }, 'Insights events are disabled.') })
    );
  });
}

/** «Edit» de General details: Log file SSE-KMS encryption y Log file validation (UpdateTrail). */
function editarTrailPagina(cx, { nombre }) {
  migasCt(cx, { texto: 'Trails', ruta: 'cloudtrail/trails' }, { texto: nombre, ruta: rutaTrail(nombre) }, { texto: 'Edit' });
  const t = trailDe(cx.estado, nombre);
  if (!t) return noExiste(cx, 'Trail', nombre, 'cloudtrail/trails');
  if (!existeFuncion('editarTrail')) return ui.noDisponible('Edit trail', 'Todavía no se puede editar un trail en el simulador.');
  const llaves = () => (cx.estado.kms?.llaves ?? []).filter((k) => !k.administradaPorAws && k.estado === 'Enabled' && k.spec === 'SYMMETRIC_DEFAULT' && k.uso === 'ENCRYPT_DECRYPT');
  const refDe = (k) => (k.alias ? `alias/${k.alias}` : k.arn);
  const existente = t.kms ? llaves().find((k) => refDe(k) === t.kms || k.arn === t.kms || k.id === t.kms) : null;
  const f = {
    cifrado: Boolean(t.kms),
    modo: !t.kms || existente ? 'existente' : 'nueva',
    llave: existente ? refDe(existente) : null,
    alias: t.kms && !existente ? String(t.kms).replace(/^alias\//, '') : `aws-cloudtrail-logs-${cx.estado.cuenta.id}-${hexAzar(8)}`,
    validacion: Boolean(t.validacion)
  };
  if (!f.llave && f.modo === 'existente' && !llaves().length) f.modo = 'nueva';
  let error = null;
  const zona = ui.region(() =>
    ui.contenedor({
      titulo: 'General details',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.pares([{ etiqueta: 'Trail name', valor: t.nombre }, { etiqueta: 'Trail log location', valor: `${t.bucket}/${t.prefijo ? `${t.prefijo}/` : ''}AWSLogs/${cx.estado.cuenta.id}` }], { columnas: 2 }),
        ui.campo({ etiqueta: 'Log file SSE-KMS encryption', info: 'ct-trail', cx, control: ui.casilla({ etiqueta: 'Enabled', marcada: f.cifrado, alCambiar: (v) => ((f.cifrado = v), zona.repintar()) }) }),
        f.cifrado
          ? ui.campo({
              etiqueta: 'Customer managed AWS KMS key',
              control: ui.radios({
                valor: f.modo,
                horizontal: true,
                opciones: [
                  { valor: 'nueva', etiqueta: 'New' },
                  { valor: 'existente', etiqueta: 'Existing', desactivado: !llaves().length }
                ],
                alCambiar: (v) => ((f.modo = v), zona.repintar())
              })
            })
          : null,
        f.cifrado && f.modo === 'nueva' ? ui.campo({ etiqueta: 'AWS KMS alias', descripcion: 'New customer managed key. KMS key and S3 bucket must be in the same region.', control: ui.entrada({ valor: f.alias, alCambiar: (v) => (f.alias = v) }), error }) : null,
        f.cifrado && f.modo === 'existente'
          ? ui.campo({
              etiqueta: 'AWS KMS alias',
              control: ui.selector({ valor: f.llave, placeholder: 'Choose a KMS key', filtrar: true, vacio: 'No customer managed keys', opciones: () => llaves().map((k) => ({ valor: refDe(k), etiqueta: k.alias ?? k.id, descripcion: k.arn })), alCambiar: (v) => (f.llave = v) }),
              error
            })
          : null,
        ui.campo({ etiqueta: 'Log file validation', control: ui.casilla({ etiqueta: 'Enabled', marcada: f.validacion, alCambiar: (v) => (f.validacion = v) }) })
      )
    })
  );
  function guardar() {
    error = null;
    if (f.cifrado && f.modo === 'nueva' && !f.alias.trim()) error = 'AWS KMS alias is required.';
    if (f.cifrado && f.modo === 'existente' && !f.llave) error = 'Choose a KMS key.';
    if (error) return zona.repintar();
    const kms = !f.cifrado ? null : f.modo === 'nueva' ? `alias/${f.alias.trim().replace(/^alias\//, '')}` : f.llave;
    const r = cx.hacer({ servicio: 'CloudTrail', accion: 'UpdateTrail', error: 'Failed to update trail' }, (e) => llamar('editarTrail', e, nombre, { kms, validacion: f.validacion }));
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: `Trail ${nombre} successfully updated.` });
      cx.ir(rutaTrail(nombre));
    }
  }
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Edit trail', info: 'ct-trail', cx }),
    zona,
    ui.pieFormulario({ cancelar: () => cx.ir(rutaTrail(nombre)), enviar: guardar, textoEnviar: 'Save changes' })
  );
}

/* ================================================================== ayudas */

const ayudas = {
  'ct-historial': {
    titulo: 'CloudTrail: quién hizo qué',
    texto: [
      '**CloudTrail** anota cada llamada a la API de tu cuenta: **quién** (User name), **qué** (Event name, por ejemplo `RunInstances`), **cuándo** (Event time), **desde dónde** (Source IP) y sobre **qué recurso**.',
      '**Event history** guarda los eventos de administración de los últimos 90 días, gratis y sin configurar nada.',
      'Usa **Lookup attributes** para filtrar: por ejemplo Event name = `TerminateInstances` para saber quién borró una instancia.'
    ]
  },
  'ct-registro': {
    titulo: 'Event record',
    texto: ['Es el evento completo en JSON, tal como lo guarda CloudTrail. Fíjate en `userIdentity` (quién), `eventName` (qué), `eventTime` (cuándo), `sourceIPAddress` (desde dónde) y `requestParameters` (con qué datos).']
  },
  'ct-trail': {
    titulo: 'Trail',
    texto: [
      'Un **trail** copia todos los eventos a un **bucket de S3** para guardarlos más de 90 días (auditorías, cumplimiento).',
      'Conviene activar **Log file validation** (detecta si alguien alteró los archivos) y el cifrado con **SSE-KMS**.',
      'En el simulador, el trail deja un archivo `.json.gz` en `AWSLogs/<cuenta>/CloudTrail/…` del bucket cada vez que hay eventos nuevos.'
    ]
  }
};

/* ================================================================ registro */

const des = (texto) => ({ texto, desactivado: true });

export default {
  id: 'cloudtrail',
  nombre: 'CloudTrail',
  titulo: 'CloudTrail',
  descripcion: 'Track User Activity and API Usage',
  categoria: 'gestion',
  claves: 'audit auditoría eventos quién api activity trail',
  inicio: 'cloudtrail',
  menu: [
    { texto: 'Dashboard', ruta: 'cloudtrail' },
    { texto: 'Event history', ruta: 'cloudtrail/eventos' },
    des('Insights'),
    { seccion: 'Lake', items: [des('Dashboard'), des('Query'), des('Event data stores'), des('Integrations')] },
    { texto: 'Trails', ruta: 'cloudtrail/trails' },
    des('Settings')
  ],
  rutas: {
    '': dashboard,
    eventos: historial,
    'eventos/:id': detalleEvento,
    trails: listaTrails,
    'trails/crear': crearTrailPagina,
    'trails/:nombre': detalleTrail,
    'trails/:nombre/editar': editarTrailPagina
  },
  busqueda: [
    { texto: 'Event history', ruta: 'cloudtrail/eventos', claves: 'eventos auditoría quién' },
    { texto: 'Trails', ruta: 'cloudtrail/trails' },
    { texto: 'Create trail', ruta: 'cloudtrail/trails/crear' }
  ],
  ayudas
};
