// ---------------------------------------------------------------------------
// AMAZON SNS
//
// Temas (Standard y FIFO) con su detalle, Publish message, las suscripciones
// (Email, SQS, Lambda, HTTP/S, SMS) con su confirmación, y la «Bandeja de
// correo (simulada)»: un buzón propio del simulador donde llegan los correos
// que AWS mandaría al alumno (confirmaciones de SNS, alarmas de CloudWatch y
// avisos de Budgets), con su enlace «Confirm subscription».
//
// El modelo vive en modelo/mensajeria.js. Este archivo exporta además
// botonBuzon(cx) y copiar(cx, texto), que reusan sqs.js, lambda.js y
// eventbridge.js (y quien quiera abrir el buzón: la ruta es 'sns/buzon').
// ---------------------------------------------------------------------------

import * as ui from '../ui.js';
import {
  confirmarSuscripcion,
  correosSinLeer,
  crearSuscripcion,
  crearTema,
  editarSuscripcion,
  editarTema,
  eliminarCorreo,
  eliminarSuscripcion,
  eliminarTema,
  marcarBuzonLeido,
  marcarCorreoLeido,
  pedirConfirmacion,
  politicaTema,
  publicarMensaje,
  suscripcionesSns,
  temaSns,
  vaciarBuzon
} from '../modelo.js';
import { noExiste } from './comun.js';

const { h } = ui;

const migaSns = { texto: 'Amazon SNS', ruta: 'sns' };
const temas = (cx) => cx.estado.sns?.temas ?? [];
const rutaTema = (t) => `sns/temas/${encodeURIComponent(t.nombre)}`;
const rutaSub = (s) => `sns/suscripciones/${s.id}`;
const subPorId = (cx, id) => suscripcionesSns(cx.estado).find((s) => s.id === id) ?? null;

const NOMBRES_PROTOCOLO = { email: 'EMAIL', 'email-json': 'EMAIL-JSON', sqs: 'SQS', lambda: 'LAMBDA', http: 'HTTP', https: 'HTTPS', sms: 'SMS' };
const estadoSub = (s) => (s.estado === 'Confirmed' ? ui.estado('exito', 'Confirmed') : ui.estado('espera', 'Pending confirmation'));

/** Copia al portapapeles y avisa con la flashbar. */
export function copiar(cx, texto, que = 'ARN') {
  try {
    navigator.clipboard?.writeText(texto);
  } catch {
    /* sin permiso de portapapeles: igual avisamos */
  }
  cx.flash({ tipo: 'exito', texto: `${que} copied: ${texto}` });
}

/** El botón propio del simulador que abre el buzón, con los correos sin leer. */
export function botonBuzon(cx) {
  return cx.vivo(
    () => {
      const n = correosSinLeer(cx.estado);
      return h(
        'button',
        { type: 'button', class: 'cx-boton cx-boton--normal cx-msj-buzon-boton', title: 'Abre los correos que te mandó AWS', onclick: () => cx.ir('sns/buzon') },
        ui.icono('notification'),
        h('span', {}, 'Bandeja de correo (simulada)'),
        n ? h('span', { class: 'cx-msj-contador', 'aria-label': `${n} sin leer` }, String(n)) : null
      );
    },
    { etiqueta: 'span', clase: 'cx-msj-buzon-zona' }
  );
}

/* ================================================================ portada */

function portada(cx) {
  cx.migas([migaSns]);
  const f = { nombre: '' };
  const seguir = () => {
    cx.memoria.snsNombreTema = f.nombre.trim();
    cx.ir('sns/temas/crear');
  };
  return h(
    'div',
    { class: 'cx-pagina' },
    h(
      'div',
      { class: 'cx-msj-portada' },
      h(
        'div',
        { class: 'cx-msj-portada__texto' },
        h('p', { class: 'cx-texto-sec' }, 'Application Integration'),
        h('h1', { class: 'cx-msj-portada__titulo' }, 'Amazon Simple Notification Service'),
        h('p', { class: 'cx-msj-portada__lema' }, 'Pub/sub messaging for microservices and serverless applications.'),
        h('p', { class: 'cx-texto-sec' }, 'Amazon SNS is a highly available, durable, secure, fully managed pub/sub messaging service that enables you to decouple microservices, distributed systems, and event-driven serverless applications. Amazon SNS provides topics for high-throughput, push-based, many-to-many messaging.')
      ),
      ui.contenedor({
        titulo: 'Create topic',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.campo({
            etiqueta: 'Topic name',
            info: 'sns-tema',
            cx,
            control: ui.entrada({ placeholder: 'MyTopic', etiquetaAccesible: 'Topic name', alCambiar: (v) => (f.nombre = v), alEnter: seguir }),
            restriccion: 'Maximum 256 characters. Can include alphanumeric characters, hyphens (-) and underscores (_).'
          }),
          h('div', { class: 'cx-acciones', style: { justifyContent: 'flex-end' } }, ui.boton('Next step', { variante: 'primario', alClic: seguir }))
        )
      })
    ),
    ui.contenedor({
      titulo: 'How it works',
      cuerpo: h(
        'div',
        { class: 'cx-msj-flujo' },
        h('div', { class: 'cx-msj-flujo__caja' }, h('b', {}, 'Publisher'), h('small', {}, 'Your app, CloudWatch, EventBridge…')),
        h('span', { class: 'cx-msj-flujo__flecha' }, '→'),
        h('div', { class: 'cx-msj-flujo__caja cx-msj-flujo__caja--tema' }, h('b', {}, 'SNS topic'), h('small', {}, 'One message')),
        h('span', { class: 'cx-msj-flujo__flecha' }, '→'),
        h('div', { class: 'cx-msj-flujo__destinos' }, ['Amazon SQS', 'AWS Lambda', 'Email', 'HTTP/S', 'SMS'].map((d) => h('span', { class: 'cx-msj-flujo__caja' }, d)))
      )
    }),
    h('div', {}, botonBuzon(cx))
  );
}

/* ============================================================= dashboard */

function panel(cx) {
  cx.migas([migaSns, { texto: 'Dashboard' }]);
  const recurso = (texto, n, ruta) => h('div', { class: 'cx-resumen-recursos__item' }, ruta ? ui.enlace(texto, ruta, { cx }) : h('span', { class: 'cx-texto-sec' }, texto), h('span', {}, String(n)));
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Dashboard', info: 'sns-tema', cx, acciones: [botonBuzon(cx)] }),
    cx.vivo(() =>
      ui.contenedor({
        titulo: 'Resources for US East (N. Virginia)',
        acciones: ui.botonRefrescar(() => cx.refrescar()),
        cuerpo: h(
          'div',
          { class: 'cx-resumen-recursos' },
          recurso('Topics', temas(cx).length, 'sns/temas'),
          recurso('Platform applications', 0),
          recurso('Subscriptions', suscripcionesSns(cx.estado).length, 'sns/suscripciones')
        )
      })
    )
  );
}

/* ================================================================ temas */

function borrarTema(cx, t, { alTerminar } = {}) {
  cx.confirmar({
    titulo: 'Delete topic',
    textoBoton: 'Delete',
    palabra: 'delete me',
    contenido: h('p', {}, `Are you sure you want to delete the topic ${t.nombre}? Deleting a topic deletes all of its subscriptions and the messages that haven’t been delivered yet. This action can’t be undone.`),
    aceptar: () => {
      const r = cx.hacer({ servicio: 'SNS', accion: 'DeleteTopic', error: `Failed to delete topic ${t.nombre}` }, (e) => eliminarTema(e, t.arn));
      if (!r.ok) return false;
      cx.flash({ tipo: 'exito', texto: `Topic ${t.nombre} deleted successfully.` });
      alTerminar?.();
    }
  });
}

function listaTemas(cx) {
  cx.migas([migaSns, { texto: 'Topics' }]);
  const tabla = ui.tabla(cx, {
    titulo: 'Topics',
    info: 'sns-tema',
    filas: () => temas(cx),
    clave: (t) => t.arn,
    seleccion: 'unica',
    filtro: 'Search',
    columnas: [
      { titulo: 'Name', valor: (t) => ui.enlace(t.nombre, rutaTema(t), { cx }), texto: (t) => t.nombre },
      { titulo: 'Type', valor: (t) => t.tipo },
      { titulo: 'ARN', valor: (t) => ui.copiable(t.arn), texto: (t) => t.arn }
    ],
    acciones: (sel) => [
      ui.boton('Edit', { desactivado: sel.length !== 1, alClic: () => cx.ir(`${rutaTema(sel[0])}/editar`) }),
      ui.boton('Delete', { desactivado: sel.length !== 1, escribe: true, alClic: () => borrarTema(cx, sel[0]) }),
      ui.boton('Publish message', { desactivado: sel.length !== 1, alClic: () => cx.ir(`${rutaTema(sel[0])}/publicar`) }),
      ui.boton('Create topic', { variante: 'primario', alClic: () => cx.ir('sns/temas/crear') })
    ],
    vacio: { titulo: 'No topics', texto: 'To get started, create a topic.', accion: ui.boton('Create topic', { escribe: true, alClic: () => cx.ir('sns/temas/crear') }) }
  });
  return h('div', { class: 'cx-pagina' }, h('div', { class: 'cx-acciones', style: { justifyContent: 'flex-end' } }, botonBuzon(cx)), tabla);
}

/** Las secciones plegables de Create topic y Edit (las que el simulador sí usa). */
function seccionesTema(cx, f) {
  return [
    ui.contenedor({
      titulo: 'Encryption - optional',
      plegable: true,
      abierto: false,
      descripcion: 'Amazon SNS provides in-transit encryption by default. Enabling server-side encryption adds at-rest encryption to your topic.',
      cuerpo: ui.interruptor({ etiqueta: 'Enable encryption', marcada: f.cifrado, alCambiar: (v) => (f.cifrado = v) })
    }),
    ui.contenedor({
      titulo: 'Access policy - optional',
      info: 'sns-politica',
      cx,
      plegable: true,
      abierto: false,
      descripcion: 'This policy defines who can access your topic. By default, only the topic owner can publish or subscribe to the topic.',
      cuerpo: ui.campo({ etiqueta: 'JSON editor', control: ui.area({ valor: f.politica, filas: 14, monoespaciado: true, alCambiar: (v) => (f.politica = v) }) })
    }),
    ui.contenedor({ titulo: 'Data protection policy - optional', plegable: true, abierto: false, cuerpo: ui.alerta({ tipo: 'info', contenido: 'No disponible en este simulador.' }) }),
    ui.contenedor({ titulo: 'Delivery policy (HTTP/S) - optional', plegable: true, abierto: false, cuerpo: ui.alerta({ tipo: 'info', contenido: 'No disponible en este simulador: la política de reintentos solo aplica a suscripciones HTTP/S.' }) }),
    ui.contenedor({ titulo: 'Delivery status logging - optional', plegable: true, abierto: false, cuerpo: ui.alerta({ tipo: 'info', contenido: 'No disponible en este simulador.' }) }),
    ui.contenedor({
      titulo: 'Tags - optional',
      plegable: true,
      abierto: false,
      descripcion: 'A tag is a metadata label that you can assign to an Amazon SNS topic. Each tag consists of a key and an optional value.',
      cuerpo: ui.editorEtiquetas({ filas: f.etiquetas })
    }),
    ui.contenedor({ titulo: 'Active tracing - optional', plegable: true, abierto: false, cuerpo: ui.alerta({ tipo: 'info', contenido: 'No disponible en este simulador (AWS X-Ray).' }) })
  ];
}

function crearTemaPagina(cx) {
  cx.migas([migaSns, { texto: 'Topics', ruta: 'sns/temas' }, { texto: 'Create topic' }]);
  const f = { tipo: 'Standard', nombre: cx.memoria.snsNombreTema ?? '', nombreMostrar: '', dedup: false, cifrado: false, politica: '', etiquetas: [], intento: false };
  delete cx.memoria.snsNombreTema;
  const detalles = ui.region(() => {
    const fifo = f.tipo === 'FIFO';
    const errorNombre = f.intento && !f.nombre.trim() ? 'Topic name is required.' : f.intento && fifo && !f.nombre.trim().endsWith('.fifo') ? 'FIFO topic names must end with ".fifo".' : null;
    return ui.contenedor({
      titulo: 'Details',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({
          etiqueta: 'Type',
          info: 'sns-fifo',
          cx,
          descripcion: 'Topic type cannot be modified after topic is created',
          control: ui.tarjetas({
            columnas: 2,
            valor: f.tipo,
            alCambiar: (v) => {
              f.tipo = v;
              if (v === 'FIFO' && f.nombre.trim() && !f.nombre.trim().endsWith('.fifo')) f.nombre = `${f.nombre.trim()}.fifo`;
              if (v === 'Standard') f.nombre = f.nombre.replace(/\.fifo$/, '');
              detalles.repintar();
            },
            opciones: [
              { valor: 'FIFO', etiqueta: 'FIFO (first-in, first-out)', descripcion: 'Strictly-preserved message ordering · Exactly-once message delivery · Subscription protocols: SQS' },
              { valor: 'Standard', etiqueta: 'Standard', descripcion: 'Best-effort message ordering · At-least once message delivery · Subscription protocols: SQS, Lambda, Data Firehose, HTTP, SMS, email, mobile application endpoints' }
            ]
          })
        }),
        ui.campo({
          etiqueta: 'Name',
          control: ui.entrada({ valor: f.nombre, placeholder: fifo ? 'MyTopic.fifo' : 'MyTopic', etiquetaAccesible: 'Name', alCambiar: (v) => (f.nombre = v) }),
          restriccion: `Maximum 256 characters. Can include alphanumeric characters, hyphens (-) and underscores (_).${fifo ? ' FIFO topic names must end with ".fifo".' : ''}`,
          error: errorNombre
        }),
        ui.campo({
          etiqueta: 'Display name',
          opcional: true,
          info: 'sns-tema',
          cx,
          descripcion: 'To use this topic with SMS subscriptions, enter a display name. Only the first 10 characters are displayed in an SMS message.',
          control: ui.entrada({ valor: f.nombreMostrar, placeholder: 'My Topic', etiquetaAccesible: 'Display name', alCambiar: (v) => (f.nombreMostrar = v) }),
          restriccion: 'Maximum 100 characters.'
        }),
        fifo
          ? ui.campo({
              etiqueta: 'Content-based message deduplication',
              descripcion: 'Enable default message deduplication based on message content.',
              control: ui.casilla({ etiqueta: 'Content-based message deduplication', marcada: f.dedup, alCambiar: (v) => (f.dedup = v) })
            })
          : null
      )
    });
  });

  function enviar() {
    f.intento = true;
    detalles.repintar();
    if (!f.nombre.trim() || (f.tipo === 'FIFO' && !f.nombre.trim().endsWith('.fifo'))) return detalles.scrollIntoView({ block: 'center' });
    const r = cx.hacer({ servicio: 'SNS', accion: 'CreateTopic', error: 'Failed to create topic' }, (e) =>
      crearTema(e, {
        nombre: f.nombre,
        tipo: f.tipo,
        nombreMostrar: f.nombreMostrar,
        deduplicacionContenido: f.dedup,
        politica: f.politica.trim() || null,
        cifrado: f.cifrado ? 'alias/aws/sns' : null,
        etiquetas: f.etiquetas
      })
    );
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: `Topic ${r.valor.nombre} created successfully. You can create subscriptions and send messages to them from this topic.` });
      cx.ir(rutaTema(r.valor));
    }
  }

  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Create topic', info: 'sns-tema', cx }),
    detalles,
    seccionesTema(cx, f),
    ui.pieFormulario({ cancelar: () => cx.ir('sns/temas'), enviar, textoEnviar: 'Create topic' })
  );
}

function editarTemaPagina(cx, { nombre }) {
  const t = temaSns(cx.estado, nombre);
  cx.migas([migaSns, { texto: 'Topics', ruta: 'sns/temas' }, { texto: nombre, ruta: t ? rutaTema(t) : null }, { texto: 'Edit' }]);
  if (!t) return noExiste(cx, 'Topic', nombre, 'sns/temas');
  const f = { nombreMostrar: t.nombreMostrar, dedup: t.deduplicacionContenido, cifrado: Boolean(t.cifrado), politica: politicaTema(cx.estado, t), etiquetas: t.etiquetas.map((x) => ({ ...x })) };
  const original = politicaTema(cx.estado, t);
  function guardar() {
    const r = cx.hacer({ servicio: 'SNS', accion: 'SetTopicAttributes', error: `Failed to edit topic ${t.nombre}` }, (e) =>
      editarTema(e, t.arn, { nombreMostrar: f.nombreMostrar, deduplicacionContenido: f.dedup, cifrado: f.cifrado ? 'alias/aws/sns' : null, politica: f.politica.trim() === original.trim() ? undefined : f.politica.trim() || null, etiquetas: f.etiquetas })
    );
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: `Topic ${t.nombre} saved successfully.` });
      cx.ir(rutaTema(t));
    }
  }
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: `Edit ${t.nombre}`, info: 'sns-tema', cx }),
    ui.contenedor({
      titulo: 'Details',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.pares([{ etiqueta: 'Name', valor: t.nombre }, { etiqueta: 'Type', valor: t.tipo }], { columnas: 2 }),
        ui.campo({ etiqueta: 'Display name', opcional: true, control: ui.entrada({ valor: f.nombreMostrar, alCambiar: (v) => (f.nombreMostrar = v) }), restriccion: 'Maximum 100 characters.' }),
        t.tipo === 'FIFO' ? ui.casilla({ etiqueta: 'Content-based message deduplication', marcada: f.dedup, alCambiar: (v) => (f.dedup = v) }) : null
      )
    }),
    seccionesTema(cx, f),
    ui.pieFormulario({ cancelar: () => cx.ir(rutaTema(t)), enviar: guardar, textoEnviar: 'Save changes' })
  );
}

function tablaSuscripciones(cx, { filas, titulo = 'Subscriptions', variante = 'contenedor', temaFijo = null }) {
  return ui.tabla(cx, {
    titulo,
    info: 'sns-suscripcion',
    variante,
    filas,
    clave: (s) => s.arn,
    seleccion: 'unica',
    filtro: 'Search',
    columnas: [
      { titulo: 'ID', valor: (s) => ui.enlace(s.id, rutaSub(s), { cx }), texto: (s) => s.id },
      { titulo: 'Endpoint', valor: (s) => s.endpoint },
      { titulo: 'Status', valor: (s) => estadoSub(s), texto: (s) => s.estado },
      { titulo: 'Protocol', valor: (s) => NOMBRES_PROTOCOLO[s.protocolo] ?? s.protocolo },
      temaFijo ? null : { titulo: 'Topic', valor: (s) => ui.enlace(s.temaArn.split(':').pop(), `sns/temas/${encodeURIComponent(s.temaArn.split(':').pop())}`, { cx }), texto: (s) => s.temaArn }
    ].filter(Boolean),
    acciones: (sel) => {
      const s = sel[0];
      return [
        ui.boton('Edit', { desactivado: !s, alClic: () => cx.ir(`${rutaSub(s)}/editar`) }),
        ui.boton('Delete', { desactivado: !s || s.estado !== 'Confirmed', escribe: true, titulo: s && s.estado !== 'Confirmed' ? 'You can’t delete a subscription that is pending confirmation.' : undefined, alClic: () => borrarSub(cx, s) }),
        ui.boton('Request confirmation', { desactivado: !s || s.estado === 'Confirmed' || !s.protocolo.startsWith('email'), escribe: true, alClic: () => pedirConf(cx, s) }),
        ui.boton('Confirm subscription', { desactivado: !s || s.estado === 'Confirmed', escribe: true, alClic: () => modalConfirmar(cx) }),
        ui.boton('Create subscription', {
          variante: 'primario',
          alClic: () => {
            cx.memoria.snsTemaSub = temaFijo?.arn ?? null;
            cx.ir('sns/suscripciones/crear');
          }
        })
      ];
    },
    vacio: {
      titulo: 'No subscriptions found',
      texto: 'You don’t have any subscriptions to this topic.',
      accion: ui.boton('Create subscription', {
        escribe: true,
        alClic: () => {
          cx.memoria.snsTemaSub = temaFijo?.arn ?? null;
          cx.ir('sns/suscripciones/crear');
        }
      })
    }
  });
}

function detalleTema(cx, { nombre }) {
  cx.migas([migaSns, { texto: 'Topics', ruta: 'sns/temas' }, { texto: nombre }]);
  if (!temaSns(cx.estado, nombre)) return noExiste(cx, 'Topic', nombre, 'sns/temas');
  const st = { pestana: cx.memoria.snsPestanaTema ?? 'suscripciones' };
  return cx.vivo(() => {
    const t = temaSns(cx.estado, nombre);
    if (!t) return noExiste(cx, 'Topic', nombre, 'sns/temas');
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({
        titulo: t.nombre,
        info: 'sns-tema',
        cx,
        acciones: [
          ui.boton('Edit', { alClic: () => cx.ir(`${rutaTema(t)}/editar`) }),
          ui.boton('Delete', { escribe: true, alClic: () => borrarTema(cx, t, { alTerminar: () => cx.ir('sns/temas') }) }),
          ui.boton('Publish message', { variante: 'primario', alClic: () => cx.ir(`${rutaTema(t)}/publicar`) })
        ]
      }),
      ui.contenedor({
        titulo: 'Details',
        cuerpo: ui.pares(
          [
            { etiqueta: 'Name', valor: t.nombre },
            { etiqueta: 'Display name', valor: t.nombreMostrar || '-' },
            { etiqueta: 'ARN', valor: ui.copiable(t.arn) },
            { etiqueta: 'Topic owner', valor: cx.estado.cuenta.id },
            { etiqueta: 'Type', valor: t.tipo, info: 'sns-fifo' },
            t.tipo === 'FIFO' ? { etiqueta: 'Content-based message deduplication', valor: t.deduplicacionContenido ? 'Enabled' : 'Disabled' } : null
          ],
          { columnas: 3, cx }
        )
      }),
      ui.pestanas({
        activa: st.pestana,
        alCambiar: (id) => (st.pestana = cx.memoria.snsPestanaTema = id),
        pestanas: [
          { id: 'suscripciones', texto: 'Subscriptions', contenido: () => tablaSuscripciones(cx, { filas: () => temaSns(cx.estado, nombre)?.suscripciones ?? [], temaFijo: t }) },
          { id: 'politica', texto: 'Access policy', contenido: () => ui.contenedor({ titulo: 'Access policy', info: 'sns-politica', cx, acciones: ui.boton('Edit', { alClic: () => cx.ir(`${rutaTema(t)}/editar`) }), cuerpo: h('pre', { class: 'cx-log' }, politicaTema(cx.estado, t)) }) },
          { id: 'proteccion', texto: 'Data protection policy', desactivada: true, contenido: () => null },
          { id: 'entrega', texto: 'Delivery policy (HTTP/S)', desactivada: true, contenido: () => null },
          { id: 'bitacora', texto: 'Delivery status logging', desactivada: true, contenido: () => null },
          { id: 'cifrado', texto: 'Encryption', contenido: () => ui.contenedor({ titulo: 'Encryption', cuerpo: ui.pares([{ etiqueta: 'Encryption', valor: t.cifrado ? 'Configured' : 'Not configured' }, { etiqueta: 'Customer master key (CMK)', valor: t.cifrado ?? '-' }], { columnas: 2 }) }) },
          { id: 'etiquetas', texto: 'Tags', contenido: () => tablaEtiquetas(cx, t.etiquetas) },
          { id: 'integraciones', texto: 'Integrations', desactivada: true, contenido: () => null }
        ]
      })
    );
  });
}

/** La pestaña Tags de solo lectura (Key / Value). Exportada para SQS, Lambda y EventBridge. */
export function tablaEtiquetas(cx, etiquetas) {
  return ui.tabla(cx, {
    titulo: 'Tags',
    variante: 'contenedor',
    filas: () => etiquetas,
    clave: (x) => x.llave,
    filtro: false,
    paginacion: false,
    columnas: [
      { titulo: 'Key', valor: (x) => x.llave },
      { titulo: 'Value', valor: (x) => x.valor || '-' }
    ],
    vacio: { titulo: 'No tags', texto: 'No tags are associated with this resource.' }
  });
}

/* ======================================================== Publish message */

function publicar(cx, { nombre }) {
  const t = temaSns(cx.estado, nombre);
  cx.migas([migaSns, { texto: 'Topics', ruta: 'sns/temas' }, { texto: nombre, ruta: t ? rutaTema(t) : null }, { texto: 'Publish message' }]);
  if (!t) return noExiste(cx, 'Topic', nombre, 'sns/temas');
  const fifo = t.tipo === 'FIFO';
  const f = { asunto: '', mensaje: '', ttl: '', grupo: '', dedup: '', estructura: 'identica', atributos: [], intento: false };
  const forma = ui.region(() => {
    const errorMensaje = f.intento && !f.mensaje.trim() ? 'Message body is required.' : null;
    return [
      ui.contenedor({
        titulo: 'Message details',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.campo({ etiqueta: 'Topic ARN', control: h('div', { class: 'cx-par__valor' }, ui.copiable(t.arn)) }),
          ui.campo({
            etiqueta: 'Subject',
            opcional: true,
            control: ui.entrada({ valor: f.asunto, placeholder: 'Enter the message subject', etiquetaAccesible: 'Subject', alCambiar: (v) => (f.asunto = v) }),
            restriccion: 'Maximum 100 printable ASCII characters'
          }),
          fifo
            ? [
                ui.campo({ etiqueta: 'Message group ID', info: 'sns-fifo', cx, control: ui.entrada({ valor: f.grupo, alCambiar: (v) => (f.grupo = v) }), restriccion: 'The message group ID determines which messages are delivered in order. Maximum 128 characters.' }),
                ui.campo({
                  etiqueta: 'Message deduplication ID',
                  opcional: t.deduplicacionContenido,
                  control: ui.entrada({ valor: f.dedup, alCambiar: (v) => (f.dedup = v) }),
                  restriccion: t.deduplicacionContenido ? 'Content-based deduplication is enabled for this topic.' : 'Required because content-based deduplication is not enabled for this topic.'
                })
              ]
            : ui.campo({
                etiqueta: 'Time to Live (TTL)',
                opcional: true,
                descripcion: 'This setting applies only to mobile application endpoints.',
                control: ui.entrada({ valor: f.ttl, tipo: 'number', desactivado: true, etiquetaAccesible: 'Time to Live' })
              })
        )
      }),
      ui.contenedor({
        titulo: 'Message body',
        info: 'sns-publicar',
        cx,
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.campo({
            etiqueta: 'Message structure',
            control: ui.radios({
              valor: f.estructura,
              alCambiar: (v) => (f.estructura = v),
              opciones: [
                { valor: 'identica', etiqueta: 'Identical payload for all delivery protocols.', descripcion: 'The same payload is sent to endpoints subscribed to the topic, regardless of their delivery protocol.' },
                { valor: 'personal', etiqueta: 'Custom payload for each delivery protocol.', descripcion: 'Different payloads are sent to endpoints subscribed to the topic, based on their delivery protocol.', desactivado: true }
              ]
            })
          }),
          ui.campo({
            etiqueta: 'Message body to send to the endpoint',
            control: ui.area({ valor: f.mensaje, filas: 8, alCambiar: (v) => (f.mensaje = v) }),
            error: errorMensaje
          })
        )
      }),
      ui.contenedor({
        titulo: 'Message attributes',
        info: 'sns-filtro',
        cx,
        descripcion: 'Amazon SNS supports delivery of message attributes, which let you provide structured metadata items (such as timestamps, geospatial data, signatures, and identifiers) about the message.',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          f.atributos.map((a, i) =>
            h(
              'div',
              { class: 'cx-fila-campos' },
              ui.campo({ etiqueta: 'Type', control: ui.selector({ opciones: [{ valor: 'String', etiqueta: 'String' }, { valor: 'Number', etiqueta: 'Number' }], valor: a.tipo, alCambiar: (v) => (a.tipo = v) }) }),
              ui.campo({ etiqueta: 'Name', control: ui.entrada({ valor: a.nombre, alCambiar: (v) => (a.nombre = v) }) }),
              ui.campo({ etiqueta: 'Value', control: ui.entrada({ valor: a.valor, alCambiar: (v) => (a.valor = v) }) }),
              h('div', { class: 'cx-msj-quitar' }, ui.boton('Remove', { alClic: () => (f.atributos.splice(i, 1), forma.repintar()) }))
            )
          ),
          h('div', {}, ui.boton('Add attribute', { desactivado: f.atributos.length >= 10, alClic: () => (f.atributos.push({ tipo: 'String', nombre: '', valor: '' }), forma.repintar()) }))
        )
      })
    ];
  });

  function enviar() {
    f.intento = true;
    forma.repintar();
    if (!f.mensaje.trim()) return;
    const atributos = Object.fromEntries(f.atributos.filter((a) => a.nombre.trim()).map((a) => [a.nombre.trim(), a.tipo === 'Number' ? Number(a.valor) : a.valor]));
    const r = cx.hacer({ servicio: 'SNS', accion: 'Publish', error: 'Failed to publish message' }, (e) => publicarMensaje(e, t.arn, { asunto: f.asunto, mensaje: f.mensaje, grupo: f.grupo, dedup: f.dedup, atributos }));
    if (r.ok) {
      const aviso = r.valor.entregas ? '' : ' (Simulador: ninguna suscripción confirmada recibió el mensaje.)';
      cx.flash({ tipo: 'exito', titulo: `Message published to topic ${t.nombre} successfully.`, texto: `Message ID: ${r.valor.messageId}${aviso}` });
      cx.ir(rutaTema(t));
    }
  }

  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Publish message to topic', info: 'sns-publicar', cx }),
    forma,
    ui.pieFormulario({ cancelar: () => cx.ir(rutaTema(t)), enviar, textoEnviar: 'Publish message' })
  );
}

/* ========================================================= suscripciones */

function borrarSub(cx, s) {
  cx.confirmar({
    titulo: 'Delete subscription',
    textoBoton: 'Delete',
    contenido: h('p', {}, `Are you sure you want to delete the subscription ${s.id}? It can’t be undone.`),
    aceptar: () => {
      const r = cx.hacer({ servicio: 'SNS', accion: 'Unsubscribe', error: 'Failed to delete subscription' }, (e) => eliminarSuscripcion(e, s.arn));
      if (!r.ok) return false;
      cx.flash({ tipo: 'exito', texto: `Subscription ${s.id} deleted successfully.` });
    }
  });
}

function pedirConf(cx, s) {
  const r = cx.hacer({ servicio: 'SNS', accion: 'Subscribe', error: 'Failed to request confirmation' }, (e) => pedirConfirmacion(e, s.arn));
  if (r.ok) {
    cx.flash({
      tipo: 'exito',
      texto: `A confirmation message was sent to ${s.endpoint}.`,
      accion: { texto: 'Abrir bandeja (simulada)', alClic: () => cx.ir('sns/buzon') }
    });
  }
}

/** «Confirm subscription» de la consola: pide el enlace del correo. */
function modalConfirmar(cx) {
  let url = '';
  let error = null;
  const cuerpo = ui.region(() => [
    h('p', { class: 'cx-texto-sec' }, 'To confirm the subscription, enter the subscription confirmation URL from the confirmation message that Amazon SNS sent to the endpoint.'),
    ui.campo({
      etiqueta: 'Subscription confirmation URL',
      control: ui.entrada({ valor: url, placeholder: 'https://sns.us-east-1.amazonaws.com/confirmation.html?TopicArn=…&Token=…', alCambiar: (v) => (url = v) }),
      error
    }),
    ui.alerta({ tipo: 'info', contenido: 'En el simulador, abre la «Bandeja de correo (simulada)» y pulsa el enlace Confirm subscription del correo, o copia aquí la dirección de ese enlace.' })
  ]);
  const m = cx.modal({
    titulo: 'Confirm subscription',
    ancho: 'grande',
    contenido: cuerpo,
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Confirm subscription', {
        variante: 'primario',
        alClic: () => {
          if (!url.trim()) {
            error = 'Subscription confirmation URL is required.';
            return cuerpo.repintar();
          }
          const r = cx.hacer({ servicio: 'SNS', accion: 'ConfirmSubscription', error: 'Failed to confirm subscription' }, (e) => confirmarSuscripcion(e, url), { flash: false });
          if (!r.ok) {
            error = r.error?.message ?? 'Invalid token';
            return cuerpo.repintar();
          }
          m.cerrar();
          cx.flash({ tipo: 'exito', texto: `Subscription ${r.valor.id} confirmed successfully.` });
        }
      })
    ]
  });
}

function listaSuscripciones(cx) {
  cx.migas([migaSns, { texto: 'Subscriptions' }]);
  return h('div', { class: 'cx-pagina' }, h('div', { class: 'cx-acciones', style: { justifyContent: 'flex-end' } }, botonBuzon(cx)), tablaSuscripciones(cx, { filas: () => suscripcionesSns(cx.estado), variante: 'pagina' }));
}

const PROTOCOLOS = [
  { valor: 'firehose', etiqueta: 'Amazon Data Firehose', desactivado: true },
  { valor: 'sqs', etiqueta: 'Amazon SQS' },
  { valor: 'lambda', etiqueta: 'AWS Lambda' },
  { valor: 'email', etiqueta: 'Email' },
  { valor: 'email-json', etiqueta: 'Email-JSON' },
  { valor: 'http', etiqueta: 'HTTP' },
  { valor: 'https', etiqueta: 'HTTPS' },
  { valor: 'application', etiqueta: 'Platform application endpoint', desactivado: true },
  { valor: 'sms', etiqueta: 'SMS' }
];

function crearSuscripcionPagina(cx) {
  cx.migas([migaSns, { texto: 'Subscriptions', ruta: 'sns/suscripciones' }, { texto: 'Create subscription' }]);
  const f = { temaArn: cx.memoria.snsTemaSub ?? null, protocolo: null, endpoint: '', filtro: '', cruda: false, intento: false };
  delete cx.memoria.snsTemaSub;
  const e = cx.estado;
  const tema = () => temaSns(e, f.temaArn);
  const forma = ui.region(() => {
    const fifo = tema()?.tipo === 'FIFO';
    const errores = {
      tema: f.intento && !f.temaArn ? 'Topic ARN is required.' : null,
      protocolo: f.intento && !f.protocolo ? 'Protocol is required.' : null,
      endpoint: f.intento && f.protocolo && !f.endpoint.trim() ? 'Endpoint is required.' : null
    };
    let endpoint = null;
    if (f.protocolo === 'sqs') {
      endpoint = ui.campo({
        etiqueta: 'Endpoint',
        descripcion: 'An Amazon SQS queue that can receive notifications from Amazon SNS.',
        control: ui.selector({
          placeholder: 'Choose an Amazon SQS queue',
          filtrar: true,
          valor: f.endpoint || null,
          opciones: (e.sqs?.colas ?? []).map((c) => ({ valor: c.arn, etiqueta: c.arn, descripcion: c.tipo, desactivado: !fifo && c.tipo === 'FIFO' })),
          opcionLibre: (v) => (v.startsWith('arn:') ? { valor: v, etiqueta: v } : null),
          vacio: 'No queues. Create one in Amazon SQS.',
          alCambiar: (v) => (f.endpoint = v)
        }),
        error: errores.endpoint
      });
    } else if (f.protocolo === 'lambda') {
      endpoint = ui.campo({
        etiqueta: 'Endpoint',
        descripcion: 'An AWS Lambda function that can receive notifications from Amazon SNS.',
        control: ui.selector({
          placeholder: 'Choose a Lambda function',
          filtrar: true,
          valor: f.endpoint || null,
          opciones: (e.lambda?.funciones ?? []).map((fn) => ({ valor: fn.arn, etiqueta: fn.arn })),
          opcionLibre: (v) => (v.startsWith('arn:') ? { valor: v, etiqueta: v } : null),
          vacio: 'No functions. Create one in AWS Lambda.',
          alCambiar: (v) => (f.endpoint = v)
        }),
        error: errores.endpoint
      });
    } else if (f.protocolo) {
      const textos = {
        email: ['An email address that can receive notifications from Amazon SNS.', 'user@domain.com'],
        'email-json': ['An email address that can receive notifications from Amazon SNS.', 'user@domain.com'],
        http: ['A URL beginning with http://', 'http://www.example.com'],
        https: ['A URL beginning with https://', 'https://www.example.com'],
        sms: ['A mobile number that can receive notifications from Amazon SNS. Use the E.164 format.', '+525512345678']
      }[f.protocolo];
      endpoint = ui.campo({ etiqueta: 'Endpoint', descripcion: textos[0], control: ui.entrada({ valor: f.endpoint, placeholder: textos[1], etiquetaAccesible: 'Endpoint', alCambiar: (v) => (f.endpoint = v) }), error: errores.endpoint });
    }
    return [
      ui.contenedor({
        titulo: 'Details',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.campo({
            etiqueta: 'Topic ARN',
            info: 'sns-suscripcion',
            cx,
            control: ui.selector({
              placeholder: 'Choose a topic',
              filtrar: true,
              valor: f.temaArn,
              opciones: temas(cx).map((t) => ({ valor: t.arn, etiqueta: t.arn, descripcion: t.tipo })),
              vacio: 'No topics. Create a topic first.',
              alCambiar: (v) => {
                f.temaArn = v;
                if (tema()?.tipo === 'FIFO' && f.protocolo && f.protocolo !== 'sqs') f.protocolo = null;
                forma.repintar();
              }
            }),
            error: errores.tema
          }),
          ui.campo({
            etiqueta: 'Protocol',
            descripcion: 'The type of endpoint to subscribe',
            control: ui.selector({
              placeholder: 'Select protocol',
              valor: f.protocolo,
              opciones: PROTOCOLOS.map((p) => ({ ...p, desactivado: p.desactivado || (fifo && p.valor !== 'sqs') })),
              alCambiar: (v) => {
                f.protocolo = v;
                f.endpoint = '';
                forma.repintar();
              }
            }),
            error: errores.protocolo
          }),
          endpoint,
          ['email', 'email-json', 'http', 'https'].includes(f.protocolo) ? ui.alerta({ tipo: 'info', contenido: 'After your subscription is created, you must confirm it.' }) : null,
          f.protocolo === 'sqs' ? ui.alerta({ tipo: 'aviso', contenido: 'Simulador: para que SNS pueda escribir en la cola, la política de acceso de la cola debe permitirlo. Lo más fácil es suscribir desde Amazon SQS → la cola → «Subscribe to Amazon SNS topic», que agrega ese permiso solo.' }) : null,
          f.protocolo === 'sqs' || f.protocolo === 'http' || f.protocolo === 'https'
            ? ui.casilla({ etiqueta: 'Enable raw message delivery', descripcion: 'Raw message delivery sends only the message body, without the JSON envelope.', marcada: f.cruda, alCambiar: (v) => (f.cruda = v) })
            : null
        )
      }),
      ui.contenedor({
        titulo: 'Subscription filter policy - optional',
        info: 'sns-filtro',
        cx,
        plegable: true,
        abierto: Boolean(f.filtro),
        descripcion: 'This policy filters the messages that a subscriber receives.',
        cuerpo: ui.campo({ etiqueta: 'JSON editor', descripcion: 'Filter policy scope: Message attributes', control: ui.area({ valor: f.filtro, filas: 6, monoespaciado: true, placeholder: '{\n  "tipo": ["pedido"]\n}', alCambiar: (v) => (f.filtro = v) }) })
      }),
      ui.contenedor({ titulo: 'Redrive policy (dead-letter queue) - optional', plegable: true, abierto: false, cuerpo: ui.alerta({ tipo: 'info', contenido: 'No disponible en este simulador.' }) })
    ];
  });

  function enviar() {
    f.intento = true;
    forma.repintar();
    if (!f.temaArn || !f.protocolo || !f.endpoint.trim()) return;
    const r = cx.hacer({ servicio: 'SNS', accion: 'Subscribe', error: 'Failed to create subscription' }, (es) =>
      crearSuscripcion(es, { temaArn: f.temaArn, protocolo: f.protocolo, endpoint: f.endpoint, filtro: f.filtro.trim() || null, entregaCruda: f.cruda })
    );
    if (r.ok) {
      const s = r.valor;
      cx.flash({
        tipo: 'exito',
        titulo: `Subscription to ${s.temaArn.split(':').pop()} created successfully.`,
        texto: `The ARN of the subscription is ${s.arn}.${s.estado !== 'Confirmed' && s.protocolo.startsWith('email') ? ' Revisa la Bandeja de correo (simulada) para confirmarla.' : ''}`,
        accion: s.protocolo.startsWith('email') ? { texto: 'Abrir bandeja (simulada)', alClic: () => cx.ir('sns/buzon') } : undefined
      });
      cx.ir(rutaSub(s));
    }
  }

  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Create subscription', info: 'sns-suscripcion', cx }),
    forma,
    ui.pieFormulario({ cancelar: () => cx.ir('sns/suscripciones'), enviar, textoEnviar: 'Create subscription' })
  );
}

function detalleSuscripcion(cx, { id }) {
  cx.migas([migaSns, { texto: 'Subscriptions', ruta: 'sns/suscripciones' }, { texto: id }]);
  if (!subPorId(cx, id)) return noExiste(cx, 'Subscription', id, 'sns/suscripciones');
  return cx.vivo(() => {
    const s = subPorId(cx, id);
    if (!s) return noExiste(cx, 'Subscription', id, 'sns/suscripciones');
    const nombreTema = s.temaArn.split(':').pop();
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({
        titulo: `Subscription: ${s.id}`,
        info: 'sns-suscripcion',
        cx,
        acciones: [
          ui.boton('Edit', { alClic: () => cx.ir(`${rutaSub(s)}/editar`) }),
          ui.boton('Delete', { escribe: true, desactivado: s.estado !== 'Confirmed', alClic: () => borrarSub(cx, s) }),
          s.estado !== 'Confirmed' ? ui.boton('Confirm subscription', { escribe: true, alClic: () => modalConfirmar(cx) }) : null
        ]
      }),
      s.estado !== 'Confirmed' && s.protocolo.startsWith('email')
        ? ui.alerta({
            tipo: 'info',
            titulo: 'Pending confirmation',
            contenido: `Amazon SNS sent a confirmation message to ${s.endpoint}. Simulador: ábrelo en la Bandeja de correo (simulada) y pulsa «Confirm subscription».`,
            accion: ui.boton('Abrir bandeja (simulada)', { alClic: () => cx.ir('sns/buzon') })
          })
        : null,
      ui.contenedor({
        titulo: 'Details',
        cuerpo: ui.pares(
          [
            { etiqueta: 'ARN', valor: ui.copiable(s.arn) },
            { etiqueta: 'Endpoint', valor: s.endpoint },
            { etiqueta: 'Topic', valor: ui.enlace(nombreTema, `sns/temas/${encodeURIComponent(nombreTema)}`, { cx }) },
            { etiqueta: 'Subscription Principal', valor: `arn:aws:iam::${cx.estado.cuenta.id}:root` },
            { etiqueta: 'Status', valor: estadoSub(s) },
            { etiqueta: 'Protocol', valor: NOMBRES_PROTOCOLO[s.protocolo] ?? s.protocolo },
            { etiqueta: 'Raw message delivery', valor: s.entregaCruda ? 'Enabled' : 'Disabled' },
            { etiqueta: 'Messages delivered (simulador)', valor: String(s.entregados) },
            { etiqueta: 'Failed deliveries (simulador)', valor: String(s.fallidos) }
          ],
          { columnas: 3, cx }
        )
      }),
      s.protocolo === 'sqs' && s.fallidos > 0
        ? ui.alerta({ tipo: 'aviso', titulo: 'Simulador: hay entregas fallidas', contenido: 'SNS no pudo escribir en la cola. Casi siempre es la política de acceso de la cola: debe permitir SQS:SendMessage a este tema. Suscribe desde SQS con «Subscribe to Amazon SNS topic» para que la consola agregue el permiso.' })
        : null,
      ui.pestanas({
        pestanas: [
          {
            id: 'filtro',
            texto: 'Subscription filter policy',
            contenido: () =>
              ui.contenedor({
                titulo: 'Subscription filter policy',
                info: 'sns-filtro',
                cx,
                acciones: ui.boton('Edit', { alClic: () => cx.ir(`${rutaSub(s)}/editar`) }),
                cuerpo: s.filtro ? h('pre', { class: 'cx-log' }, s.filtro) : h('p', { class: 'cx-texto-sec' }, 'No filter policy configured for this subscription.')
              })
          },
          { id: 'redrive', texto: 'Redrive policy (dead-letter queue)', desactivada: true, contenido: () => null }
        ]
      })
    );
  });
}

function editarSuscripcionPagina(cx, { id }) {
  const s = subPorId(cx, id);
  cx.migas([migaSns, { texto: 'Subscriptions', ruta: 'sns/suscripciones' }, { texto: id, ruta: s ? rutaSub(s) : null }, { texto: 'Edit' }]);
  if (!s) return noExiste(cx, 'Subscription', id, 'sns/suscripciones');
  const f = { filtro: s.filtro ?? '', cruda: s.entregaCruda };
  function guardar() {
    const r = cx.hacer({ servicio: 'SNS', accion: 'SetSubscriptionAttributes', error: 'Failed to save subscription' }, (e) => editarSuscripcion(e, s.arn, { filtro: f.filtro.trim() || null, entregaCruda: f.cruda }));
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: `Subscription ${s.id} saved successfully.` });
      cx.ir(rutaSub(s));
    }
  }
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: `Edit subscription: ${s.id}`, info: 'sns-suscripcion', cx }),
    ui.contenedor({
      titulo: 'Details',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.pares([{ etiqueta: 'Topic ARN', valor: s.temaArn }, { etiqueta: 'Protocol', valor: NOMBRES_PROTOCOLO[s.protocolo] }, { etiqueta: 'Endpoint', valor: s.endpoint }], { columnas: 3 }),
        ['sqs', 'http', 'https'].includes(s.protocolo) ? ui.casilla({ etiqueta: 'Enable raw message delivery', marcada: f.cruda, alCambiar: (v) => (f.cruda = v) }) : null
      )
    }),
    ui.contenedor({
      titulo: 'Subscription filter policy - optional',
      info: 'sns-filtro',
      cx,
      cuerpo: ui.campo({ etiqueta: 'JSON editor', control: ui.area({ valor: f.filtro, filas: 8, monoespaciado: true, alCambiar: (v) => (f.filtro = v) }) })
    }),
    ui.pieFormulario({ cancelar: () => cx.ir(rutaSub(s)), enviar: guardar, textoEnviar: 'Save changes' })
  );
}

/* ============================================ la bandeja de correo simulada */

/** La página de «Subscription confirmed!» que abre el enlace del correo. */
function paginaConfirmada(cx, sub) {
  const m = cx.modal({
    titulo: 'sns.us-east-1.amazonaws.com',
    ancho: 'mediano',
    contenido: h(
      'div',
      { class: 'cx-msj-confirmada' },
      h('div', { class: 'cx-msj-confirmada__marca' }, 'Simple Notification Service'),
      h('h2', {}, 'Subscription confirmed!'),
      h('p', {}, 'You have successfully subscribed.'),
      h('p', {}, 'Your subscription\'s id is:'),
      h('p', { class: 'cx-mono' }, sub.arn),
      h('p', { class: 'cx-texto-sec' }, 'If it was not your intention to subscribe, click here to unsubscribe.')
    ),
    pie: [ui.boton('Close', { variante: 'primario', escribe: false, alClic: () => m.cerrar() })]
  });
}

function paginaBaja(cx, sub) {
  const m = cx.modal({
    titulo: 'sns.us-east-1.amazonaws.com',
    ancho: 'mediano',
    contenido: h(
      'div',
      { class: 'cx-msj-confirmada' },
      h('div', { class: 'cx-msj-confirmada__marca' }, 'Simple Notification Service'),
      h('h2', {}, 'Subscription removed!'),
      h('p', {}, `Your subscription to the topic below has been deactivated for ${sub.endpoint}:`),
      h('p', { class: 'cx-mono' }, sub.temaArn),
      h('p', { class: 'cx-texto-sec' }, 'You will no longer receive notifications from this topic.')
    ),
    pie: [ui.boton('Close', { variante: 'primario', escribe: false, alClic: () => m.cerrar() })]
  });
}

function abrirEnlace(cx, enlace) {
  if (enlace.accion === 'confirmar') {
    const r = cx.hacer({ servicio: 'SNS', accion: 'ConfirmSubscription', error: 'Subscription confirmation failed' }, (e) => confirmarSuscripcion(e, enlace.url ?? enlace.suscripcionArn));
    if (r.ok) paginaConfirmada(cx, r.valor);
    return;
  }
  if (enlace.accion === 'baja') {
    const sub = suscripcionesSns(cx.estado).find((s) => s.arn === enlace.suscripcionArn);
    if (!sub) return cx.flash({ tipo: 'info', texto: 'This subscription no longer exists.' });
    cx.confirmar({
      titulo: 'Unsubscribe',
      textoBoton: 'Unsubscribe',
      contenido: h('p', {}, `Simulador: ¿quieres dar de baja ${sub.endpoint} del tema ${sub.temaArn.split(':').pop()}? Es lo mismo que pulsar el enlace en un correo real.`),
      aceptar: () => {
        const r = cx.hacer({ servicio: 'SNS', accion: 'Unsubscribe', error: 'Failed to unsubscribe' }, (e) => eliminarSuscripcion(e, sub.arn));
        if (!r.ok) return false;
        setTimeout(() => paginaBaja(cx, sub));
      }
    });
  }
}

/** El cuerpo del correo con sus enlaces: cada renglón «[[…]]» es el siguiente enlace. */
function cuerpoCorreo(cx, c) {
  const enlaces = [...(c.enlaces ?? [])];
  const renglones = String(c.cuerpo ?? '').split('\n');
  const pintar = (enlace) =>
    h('a', { class: 'cx-enlace cx-msj-correo__enlace', href: '#', onclick: (ev) => (ev.preventDefault(), abrirEnlace(cx, enlace)) }, enlace.texto);
  const nodos = renglones.map((r) => {
    if (/^\[\[.*\]\]$/.test(r.trim()) && enlaces.length) return h('div', {}, pintar(enlaces.shift()));
    return h('div', {}, r || ' ');
  });
  return [h('div', { class: 'cx-msj-correo__texto' }, nodos), enlaces.length ? h('div', { class: 'cx-msj-correo__extra' }, enlaces.map(pintar)) : null];
}

const fechaCorreo = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

function buzon(cx) {
  cx.migas([migaSns, { texto: 'Bandeja de correo (simulada)' }]);
  const st = { abierto: cx.memoria.snsCorreo ?? null };
  const correos = () => [...(cx.estado.sns?.buzon ?? [])].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  const abrir = (c) => {
    st.abierto = cx.memoria.snsCorreo = c.id;
    if (!c.leido && !cx.soloLectura) cx.hacer({ servicio: 'SNS', accion: 'LeerCorreo' }, (e) => marcarCorreoLeido(e, c.id, true), { flash: false });
    zona.repintar();
  };
  const zona = cx.vivo(() => {
    const lista = correos();
    const c = lista.find((x) => x.id === st.abierto) ?? null;
    return h(
      'div',
      { class: 'cx-msj-buzon' },
      h(
        'div',
        { class: 'cx-msj-buzon__lista', role: 'list', 'aria-label': 'Correos' },
        lista.length
          ? lista.map((x) =>
              h(
                'button',
                { type: 'button', role: 'listitem', class: ['cx-msj-buzon__item', !x.leido && 'cx-msj-buzon__item--nuevo', c?.id === x.id && 'cx-msj-buzon__item--abierto'], onclick: () => abrir(x) },
                h('span', { class: 'cx-msj-buzon__de' }, String(x.de).replace(/\s*<.*>$/, '')),
                h('span', { class: 'cx-msj-buzon__fecha' }, fechaCorreo(x.fecha)),
                h('span', { class: 'cx-msj-buzon__asunto' }, x.asunto || '(sin asunto)'),
                h('span', { class: 'cx-msj-buzon__vista' }, String(x.cuerpo ?? '').replace(/\[\[[^\]]*\]\]/g, '').replace(/\s+/g, ' ').slice(0, 90))
              )
            )
          : h('div', { class: 'cx-msj-buzon__vacio' }, h('b', {}, 'No hay correos'), h('p', { class: 'cx-texto-sec' }, 'Cuando crees una suscripción de tipo Email, AWS te mandará aquí el correo para confirmarla.'))
      ),
      h(
        'div',
        { class: 'cx-msj-correo' },
        c
          ? [
              h(
                'div',
                { class: 'cx-msj-correo__cabeza' },
                h('h2', { class: 'cx-h2' }, c.asunto || '(sin asunto)'),
                h('div', { class: 'cx-msj-correo__meta' }, h('span', {}, h('b', {}, 'De: '), c.de), h('span', {}, h('b', {}, 'Para: '), c.para || '–'), h('span', {}, h('b', {}, 'Fecha: '), ui.fechaLarga(c.fecha))),
                h(
                  'div',
                  { class: 'cx-acciones' },
                  ui.boton('Marcar como no leído', { alClic: () => (cx.hacer({ servicio: 'SNS', accion: 'LeerCorreo' }, (e) => marcarCorreoLeido(e, c.id, false), { flash: false }), (st.abierto = cx.memoria.snsCorreo = null), zona.repintar()) }),
                  ui.boton('Eliminar', { icono: 'remove', alClic: () => (cx.hacer({ servicio: 'SNS', accion: 'BorrarCorreo' }, (e) => eliminarCorreo(e, c.id), { flash: false }), (st.abierto = cx.memoria.snsCorreo = null), zona.repintar()) })
                )
              ),
              h('div', { class: 'cx-msj-correo__cuerpo' }, cuerpoCorreo(cx, c))
            ]
          : h('div', { class: 'cx-msj-buzon__vacio' }, ui.icono('notification'), h('p', { class: 'cx-texto-sec' }, lista.length ? 'Elige un correo para leerlo.' : 'Tu bandeja está vacía.'))
      )
    );
  });
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({
      titulo: 'Bandeja de correo (simulada)',
      info: 'sns-buzon',
      cx,
      descripcion: 'Los correos que AWS te mandaría: confirmaciones de suscripción, avisos de alarmas y de presupuestos.',
      acciones: [
        ui.botonRefrescar(() => cx.refrescar()),
        ui.boton('Marcar todo como leído', { alClic: () => cx.hacer({ servicio: 'SNS', accion: 'LeerCorreo' }, (e) => marcarBuzonLeido(e), { flash: false }) }),
        ui.boton('Vaciar bandeja', {
          alClic: () =>
            cx.confirmar({
              titulo: 'Vaciar bandeja',
              textoBoton: 'Vaciar',
              contenido: h('p', {}, '¿Borrar todos los correos de la bandeja simulada? Las suscripciones no cambian.'),
              aceptar: () => {
                cx.hacer({ servicio: 'SNS', accion: 'BorrarCorreo' }, (e) => vaciarBuzon(e), { flash: false });
                st.abierto = cx.memoria.snsCorreo = null;
              }
            })
        })
      ]
    }),
    ui.alerta({
      tipo: 'info',
      titulo: 'Esto es parte del simulador',
      contenido: 'En AWS real estos correos llegan a tu email de verdad. Aquí llegan todos a esta bandeja, sin importar la dirección que escribas. Cada correo de confirmación trae su enlace «Confirm subscription»: púlsalo para confirmar la suscripción.'
    }),
    zona
  );
}

/* ================================================================ ayudas */

const ayudas = {
  'sns-tema': {
    titulo: 'Tema de SNS',
    texto: [
      'Un **tema** (topic) es como un grupo de WhatsApp: alguien **publica** un mensaje una vez y SNS se lo reparte a **todos los suscritos** al mismo tiempo (pub/sub).',
      'Los suscritos pueden ser correos, colas de SQS, funciones Lambda, direcciones HTTP o teléfonos (SMS).',
      'Lo usan las **alarmas de CloudWatch** para avisarte por correo cuando algo pasa, y los presupuestos de Billing.',
      'El **Display name** es el nombre que ves como remitente de los correos.'
    ]
  },
  'sns-fifo': {
    titulo: 'Standard o FIFO',
    texto: [
      ['**Standard**: entrega cada mensaje *al menos una vez* y casi en orden. Acepta todos los tipos de suscripción. Es el que usarás casi siempre.', '**FIFO** (first-in, first-out): respeta el orden exacto y no repite mensajes. Solo acepta colas de SQS y su nombre debe terminar en `.fifo`.'],
      'En FIFO cada mensaje lleva un **Message group ID** (los mensajes del mismo grupo salen en orden) y un **deduplication ID** (para no repetir), salvo que actives la deduplicación por contenido.',
      'El tipo no se puede cambiar después de crear el tema.'
    ]
  },
  'sns-suscripcion': {
    titulo: 'Suscripción',
    texto: [
      'Una **suscripción** conecta el tema con un destino (endpoint): un correo, una cola, una función…',
      'Las de **Email** quedan en **Pending confirmation** hasta que la persona pulsa el enlace del correo: así AWS evita mandar correos a quien no los pidió. En el simulador, el correo llega a la **Bandeja de correo (simulada)**.',
      'Las de **SQS** y **Lambda** de tu misma cuenta quedan **Confirmed** al instante.',
      'Una suscripción pendiente no se puede borrar: SNS la quita sola a las 48 horas.'
    ]
  },
  'sns-publicar': {
    titulo: 'Publicar un mensaje',
    texto: [
      'Escribe el mensaje y pulsa **Publish message**: SNS lo entrega a cada suscripción **confirmada** del tema.',
      'El **Subject** es el asunto del correo. A SQS y a email-json les llega un JSON (la «envoltura») con el mensaje dentro del campo `Message`.',
      'Si nadie lo recibió, revisa que la suscripción diga **Confirmed**.'
    ]
  },
  'sns-filtro': {
    titulo: 'Política de filtro',
    texto: [
      'Con una **filter policy** una suscripción recibe solo los mensajes cuyos **atributos** coinciden. Ejemplo: `{"tipo": ["pedido"]}` deja pasar solo los mensajes con el atributo `tipo` igual a `pedido`.',
      'Los atributos se agregan al publicar, en **Message attributes**.'
    ]
  },
  'sns-politica': {
    titulo: 'Política de acceso del tema',
    texto: [
      'Es un documento **JSON** que dice quién puede publicar en el tema o suscribirse. La de omisión deja todo a tu propia cuenta.',
      'Si otro servicio (por ejemplo S3 o EventBridge) debe publicar aquí, la política tiene que permitírselo.'
    ]
  },
  'sns-buzon': {
    titulo: 'Bandeja de correo (simulada)',
    texto: [
      'Es una pieza **propia del simulador**: aquí llegan los correos que AWS te mandaría a tu email.',
      ['**AWS Notification - Subscription Confirmation**: el correo para confirmar una suscripción Email. Pulsa **Confirm subscription**.', '**ALARM: …**: el aviso de una alarma de CloudWatch que publica en un tema.', '**AWS Budgets**: los avisos de tus presupuestos.'],
      'Todas las direcciones llegan a esta misma bandeja.'
    ]
  }
};

/* ================================================================ registro */

const des = (texto) => ({ texto, desactivado: true });

export default {
  id: 'sns',
  nombre: 'Simple Notification Service',
  titulo: 'Amazon SNS',
  descripcion: 'SNS managed message topics for Pub/Sub',
  categoria: 'integracion',
  claves: 'sns notificaciones correo email pub sub temas topics buzon bandeja',
  inicio: 'sns',
  menu: [
    { texto: 'Dashboard', ruta: 'sns/dashboard' },
    { texto: 'Topics', ruta: 'sns/temas' },
    { texto: 'Subscriptions', ruta: 'sns/suscripciones' },
    { seccion: 'Mobile', items: [des('Push notifications'), des('Text messaging (SMS)'), des('Origination numbers')] },
    { seccion: 'Simulador', items: [{ texto: 'Bandeja de correo (simulada)', ruta: 'sns/buzon' }] }
  ],
  rutas: {
    '': portada,
    dashboard: panel,
    temas: listaTemas,
    'temas/crear': crearTemaPagina,
    'temas/:nombre': detalleTema,
    'temas/:nombre/editar': editarTemaPagina,
    'temas/:nombre/publicar': publicar,
    suscripciones: listaSuscripciones,
    'suscripciones/crear': crearSuscripcionPagina,
    'suscripciones/:id': detalleSuscripcion,
    'suscripciones/:id/editar': editarSuscripcionPagina,
    buzon
  },
  busqueda: [
    { texto: 'Topics', ruta: 'sns/temas', claves: 'temas' },
    { texto: 'Create topic', ruta: 'sns/temas/crear' },
    { texto: 'Subscriptions', ruta: 'sns/suscripciones', claves: 'suscripciones' },
    { texto: 'Create subscription', ruta: 'sns/suscripciones/crear' },
    { texto: 'Bandeja de correo (simulada)', ruta: 'sns/buzon', claves: 'correo email buzon inbox confirm subscription' }
  ],
  ayudas
};
