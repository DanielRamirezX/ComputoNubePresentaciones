// ---------------------------------------------------------------------------
// AMAZON SQS
//
// Queues: la lista, Create queue (Standard o FIFO, configuración, cifrado,
// política de acceso y cola de mensajes muertos), Edit, el detalle con sus
// pestañas (SNS subscriptions, Lambda triggers, Dead-letter queue, Monitoring,
// Tagging, Access policy, Encryption), Send and receive messages (enviar,
// sondear, ver y borrar), Purge, Delete, «Subscribe to Amazon SNS topic» y
// «Configure Lambda function trigger».
//
// El modelo vive en modelo/mensajeria.js (las colas) y modelo/lambda.js (los
// disparadores). La visibilidad, el retraso y la retención van en segundos
// reales.
// ---------------------------------------------------------------------------

import * as ui from '../ui.js';
import {
  agregarDisparador,
  arnCola,
  borrarMensajes,
  colaPorRef,
  crearCola,
  disparadoresLambda,
  editarCola,
  editarMapeoLambda,
  eliminarCola,
  enviarMensaje,
  mensajesDisponibles,
  mensajesEnVuelo,
  mensajesRetrasados,
  politicaCola,
  purgarCola,
  quitarDisparador,
  recibirMensajes,
  suscribirColaATema,
  suscripcionesSns
} from '../modelo.js';
import { noExiste } from './comun.js';
import { botonBuzon, tablaEtiquetas } from './sns.js';

const { h } = ui;

const migaSqs = { texto: 'Amazon SQS', ruta: 'sqs' };
const migaColas = { texto: 'Queues', ruta: 'sqs/colas' };
const colas = (cx) => cx.estado.sqs?.colas ?? [];
const rutaCola = (c, resto = '') => `sqs/colas/${encodeURIComponent(c.nombre)}${resto ? `/${resto}` : ''}`;
const ahora = () => Date.now();

/* ================================================================ tiempos */

const UNIDADES = { Seconds: 1, Minutes: 60, Hours: 3600, Days: 86400 };

/** Segundos → { n, unidad } con la unidad más grande que quede exacta. */
function aUnidad(seg, permitidas) {
  for (const u of [...permitidas].reverse()) if (seg && seg % UNIDADES[u] === 0) return { n: String(seg / UNIDADES[u]), unidad: u };
  return { n: String(seg), unidad: permitidas[0] };
}

const enSegundos = (v) => {
  const n = Number(v.n);
  return v.n === '' || Number.isNaN(n) ? v.n : Math.round(n * UNIDADES[v.unidad]);
};

/** Un campo «número + unidad» (Visibility timeout, Message retention period…). */
function campoTiempo({ etiqueta, info, cx, valor, unidades, restriccion, descripcion }) {
  return ui.campo({
    etiqueta,
    info,
    cx,
    descripcion,
    control: h(
      'div',
      { class: 'cx-fila-campos' },
      ui.entrada({ valor: valor.n, tipo: 'number', etiquetaAccesible: etiqueta, alCambiar: (v) => (valor.n = v) }),
      ui.selector({ opciones: unidades.map((u) => ({ valor: u, etiqueta: u })), valor: valor.unidad, alCambiar: (v) => (valor.unidad = v), etiquetaAccesible: `${etiqueta} unit` })
    ),
    restriccion
  });
}

/* ================================================================ la lista */

function borrarCola(cx, c, { alTerminar } = {}) {
  cx.confirmar({
    titulo: 'Delete queue',
    textoBoton: 'Delete',
    palabra: 'delete',
    contenido: [
      h('p', {}, `Are you sure you want to delete the queue ${c.nombre}?`),
      ui.alerta({ tipo: 'aviso', contenido: 'When you delete a queue, all of the messages in the queue are deleted. This action can’t be undone.' })
    ],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'SQS', accion: 'DeleteQueue', error: `Failed to delete queue ${c.nombre}` }, (e) => eliminarCola(e, c.url));
      if (!r.ok) return false;
      cx.flash({ tipo: 'exito', texto: `Successfully deleted queue ${c.nombre}.` });
      alTerminar?.();
    }
  });
}

function purgar(cx, c) {
  cx.confirmar({
    titulo: 'Purge queue',
    textoBoton: 'Purge',
    palabra: 'purge',
    contenido: [
      h('p', {}, `Are you sure you want to purge the queue ${c.nombre}? All messages in the queue will be deleted permanently.`),
      ui.alerta({ tipo: 'aviso', contenido: 'Purging a queue can take up to 60 seconds. You can purge a queue only once every 60 seconds.' })
    ],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'SQS', accion: 'PurgeQueue', error: `Failed to purge queue ${c.nombre}` }, (e) => purgarCola(e, c.url));
      if (!r.ok) return false;
      cx.flash({ tipo: 'exito', texto: `Successfully purged queue ${c.nombre}.` });
    }
  });
}

const cifradoTexto = (c) => (c.cifrado === 'SSE-KMS' ? 'Amazon SQS key (SSE-KMS)' : c.cifrado === 'SSE-SQS' ? 'Amazon SQS key (SSE-SQS)' : 'Disabled');

function menuColas(cx, sel) {
  const c = sel[0];
  return ui.menuBoton('Actions', () => [
    { texto: 'Purge', escribe: true, desactivado: !c, alClic: () => purgar(cx, c) },
    { texto: 'Subscribe to Amazon SNS topic', escribe: true, desactivado: !c, alClic: () => cx.ir(rutaCola(c, 'suscribir')) },
    { texto: 'Configure Lambda function trigger', escribe: true, desactivado: !c, alClic: () => cx.ir(rutaCola(c, 'lambda')) },
    { texto: 'Start DLQ redrive', desactivado: true },
    { texto: 'Tag queue', desactivado: true }
  ]);
}

function listaColas(cx) {
  cx.migas([migaSqs, { texto: 'Queues' }]);
  const t = ui.tabla(cx, {
    titulo: 'Queues',
    info: 'sqs-cola',
    filas: () => colas(cx),
    clave: (c) => c.url,
    seleccion: 'unica',
    filtro: 'Search queues by prefix',
    columnas: [
      { titulo: 'Name', valor: (c) => ui.enlace(c.nombre, rutaCola(c), { cx }), texto: (c) => c.nombre },
      { titulo: 'Type', valor: (c) => c.tipo },
      { titulo: 'Created', valor: (c) => ui.fecha(c.creado), texto: (c) => c.creado },
      { titulo: 'Messages available', valor: (c) => String(mensajesDisponibles(c, ahora())) },
      { titulo: 'Messages in flight', valor: (c) => String(mensajesEnVuelo(c, ahora())) },
      { titulo: 'Encryption', valor: (c) => cifradoTexto(c) },
      { titulo: 'Content-based deduplication', valor: (c) => (c.tipo === 'FIFO' ? (c.deduplicacionContenido ? 'Enabled' : 'Disabled') : '-') }
    ],
    acciones: (sel) => [
      ui.boton('Edit', { desactivado: sel.length !== 1, alClic: () => cx.ir(rutaCola(sel[0], 'editar')) }),
      ui.boton('Delete', { desactivado: sel.length !== 1, escribe: true, alClic: () => borrarCola(cx, sel[0]) }),
      ui.boton('Send and receive messages', { desactivado: sel.length !== 1, alClic: () => cx.ir(rutaCola(sel[0], 'mensajes')) }),
      menuColas(cx, sel),
      ui.boton('Create queue', { variante: 'primario', alClic: () => cx.ir('sqs/colas/crear') })
    ],
    vacio: { titulo: 'No queues', texto: 'You don’t have any queues in this region.', accion: ui.boton('Create queue', { escribe: true, alClic: () => cx.ir('sqs/colas/crear') }) }
  });
  return h('div', { class: 'cx-pagina' }, t);
}

/* ===================================================== crear / editar */

function formularioNuevo(cx) {
  return {
    tipo: 'Standard',
    nombre: '',
    visibilidad: { n: '30', unidad: 'Seconds' },
    retencion: { n: '4', unidad: 'Days' },
    retraso: { n: '0', unidad: 'Seconds' },
    tamano: '1024',
    espera: '0',
    dedup: false,
    altoRendimiento: false,
    cifrado: true,
    llave: 'SSE-SQS',
    metodo: 'basico',
    politica: '',
    dlq: false,
    dlqArn: null,
    maxRecepciones: '10',
    etiquetas: [],
    intento: false
  };
}

function formularioDe(c) {
  return {
    tipo: c.tipo,
    nombre: c.nombre,
    visibilidad: aUnidad(c.visibilidad, ['Seconds', 'Minutes', 'Hours']),
    retencion: aUnidad(c.retencion, ['Seconds', 'Minutes', 'Hours', 'Days']),
    retraso: aUnidad(c.retraso, ['Seconds', 'Minutes']),
    tamano: String(Math.round(c.tamanoMaximo / 1024)),
    espera: String(c.espera),
    dedup: c.deduplicacionContenido,
    altoRendimiento: c.altoRendimiento,
    cifrado: Boolean(c.cifrado),
    llave: c.cifrado ?? 'SSE-SQS',
    metodo: c.politica ? 'avanzado' : 'basico',
    politica: c.politica ?? '',
    dlq: Boolean(c.dlq),
    dlqArn: c.dlq?.arn ?? null,
    maxRecepciones: String(c.dlq?.maxRecepciones ?? 10),
    etiquetas: c.etiquetas.map((x) => ({ ...x })),
    intento: false
  };
}

/** Las secciones de Create queue y Edit. `editar`: la cola que se edita (o null). */
function seccionesCola(cx, f, editar, repintar) {
  const fifo = f.tipo === 'FIFO';
  const nombreLimpio = f.nombre.trim();
  const errorNombre = editar || !f.intento ? null : !nombreLimpio ? 'Queue name is required.' : fifo && !nombreLimpio.endsWith('.fifo') ? 'The name of a FIFO queue must end with the .fifo suffix.' : null;
  const arnPropio = editar?.arn ?? arnCola(cx.estado, nombreLimpio || 'MyQueue');
  return [
    ui.contenedor({
      titulo: 'Details',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        editar
          ? ui.pares([{ etiqueta: 'Type', valor: editar.tipo }, { etiqueta: 'Name', valor: editar.nombre }], { columnas: 2 })
          : [
              ui.campo({
                etiqueta: 'Type',
                info: 'sqs-tipo',
                cx,
                descripcion: 'Choose the queue type for your application or cloud infrastructure.',
                control: ui.tarjetas({
                  columnas: 2,
                  valor: f.tipo,
                  alCambiar: (v) => {
                    f.tipo = v;
                    if (v === 'FIFO' && f.nombre.trim() && !f.nombre.trim().endsWith('.fifo')) f.nombre = `${f.nombre.trim()}.fifo`;
                    if (v === 'Standard') f.nombre = f.nombre.replace(/\.fifo$/, '');
                    f.dlqArn = null;
                    repintar();
                  },
                  opciones: [
                    { valor: 'Standard', etiqueta: 'Standard', descripcion: 'At-least-once delivery, message ordering isn’t preserved · At-least once delivery · Best-effort ordering' },
                    { valor: 'FIFO', etiqueta: 'FIFO', descripcion: 'First-in-first-out delivery, message ordering is preserved · First-in-first-out delivery · Exactly-once processing' }
                  ]
                }),
                restriccion: 'You can’t change the queue type after you create a queue.'
              }),
              ui.campo({
                etiqueta: 'Name',
                control: ui.entrada({ valor: f.nombre, placeholder: fifo ? 'MyQueue.fifo' : 'MyQueue', etiquetaAccesible: 'Name', alCambiar: (v) => (f.nombre = v) }),
                restriccion: `A queue name is case-sensitive and can have up to 80 characters. You can use alphanumeric characters, hyphens (-), and underscores ( _ ).${fifo ? ' The name of a FIFO queue must end with the .fifo suffix.' : ''}`,
                error: errorNombre
              })
            ]
      )
    }),
    ui.contenedor({
      titulo: 'Configuration',
      info: 'sqs-visibilidad',
      cx,
      descripcion: 'Set the maximum message size, visibility to other consumers, and message retention.',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        h(
          'div',
          { class: 'cx-fila-campos' },
          campoTiempo({ etiqueta: 'Visibility timeout', info: 'sqs-visibilidad', cx, valor: f.visibilidad, unidades: ['Seconds', 'Minutes', 'Hours'], restriccion: 'Should be between 0 seconds and 12 hours.' }),
          campoTiempo({ etiqueta: 'Message retention period', valor: f.retencion, unidades: ['Seconds', 'Minutes', 'Hours', 'Days'], restriccion: 'Should be between 1 minute and 14 days.' })
        ),
        h(
          'div',
          { class: 'cx-fila-campos' },
          campoTiempo({ etiqueta: 'Delivery delay', valor: f.retraso, unidades: ['Seconds', 'Minutes'], restriccion: 'Should be between 0 seconds and 15 minutes.' }),
          ui.campo({ etiqueta: 'Maximum message size', control: ui.entrada({ valor: f.tamano, tipo: 'number', sufijo: 'KiB', etiquetaAccesible: 'Maximum message size', alCambiar: (v) => (f.tamano = v) }), restriccion: 'Should be between 1 KiB and 1024 KiB.' })
        ),
        h(
          'div',
          { class: 'cx-fila-campos' },
          ui.campo({ etiqueta: 'Receive message wait time', control: ui.entrada({ valor: f.espera, tipo: 'number', sufijo: 'Seconds', etiquetaAccesible: 'Receive message wait time', alCambiar: (v) => (f.espera = v) }), restriccion: 'Should be between 0 and 20 seconds.' }),
          h('div', { class: 'cx-campo' })
        ),
        fifo
          ? [
              ui.casilla({ etiqueta: 'Content-based deduplication', descripcion: 'Uses a SHA-256 hash of the message body to generate the content-based message deduplication ID.', marcada: f.dedup, alCambiar: (v) => (f.dedup = v) }),
              ui.casilla({ etiqueta: 'Enable high throughput FIFO', descripcion: 'Enables higher throughput by partitioning messages by message group ID.', marcada: f.altoRendimiento, alCambiar: (v) => (f.altoRendimiento = v) })
            ]
          : null
      )
    }),
    ui.contenedor({
      titulo: 'Encryption',
      opcional: true,
      info: 'sqs-cifrado',
      cx,
      descripcion: 'Amazon SQS provides in-transit encryption by default. To add at-rest encryption to your queue, enable server-side encryption.',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({
          etiqueta: 'Server-side encryption',
          control: ui.radios({
            horizontal: true,
            valor: f.cifrado ? 'si' : 'no',
            alCambiar: (v) => ((f.cifrado = v === 'si'), repintar()),
            opciones: [
              { valor: 'no', etiqueta: 'Disabled' },
              { valor: 'si', etiqueta: 'Enabled' }
            ]
          })
        }),
        f.cifrado
          ? ui.campo({
              etiqueta: 'Encryption key type',
              control: ui.radios({
                valor: f.llave,
                alCambiar: (v) => (f.llave = v),
                opciones: [
                  { valor: 'SSE-SQS', etiqueta: 'Amazon SQS key (SSE-SQS)', descripcion: 'An encryption key that Amazon SQS creates, manages, and uses for you.' },
                  { valor: 'SSE-KMS', etiqueta: 'AWS Key Management Service key (SSE-KMS)', descripcion: 'An encryption key protected by AWS Key Management Service (AWS KMS).' }
                ]
              })
            })
          : null
      )
    }),
    ui.contenedor({
      titulo: 'Access policy',
      info: 'sqs-politica',
      cx,
      descripcion: 'Define who can access your queue.',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({
          etiqueta: 'Choose method',
          control: ui.tarjetas({
            columnas: 2,
            valor: f.metodo,
            alCambiar: (v) => {
              f.metodo = v;
              if (v === 'avanzado' && !f.politica.trim()) f.politica = politicaCola(cx.estado, { arn: arnPropio, politica: null });
              repintar();
            },
            opciones: [
              { valor: 'basico', etiqueta: 'Basic', descripcion: 'Use simple criteria to define a basic access policy.' },
              { valor: 'avanzado', etiqueta: 'Advanced', descripcion: 'Use a JSON object to define an advanced access policy.' }
            ]
          })
        }),
        f.metodo === 'basico'
          ? [
              ui.campo({ etiqueta: 'Define who can send messages to the queue', control: ui.radios({ valor: 'dueno', opciones: [{ valor: 'dueno', etiqueta: 'Only the queue owner', descripcion: 'Only the owner of the queue can send messages to the queue.' }, { valor: 'otros', etiqueta: 'Only the specified AWS accounts, IAM users and roles', desactivado: true }] }) }),
              ui.campo({ etiqueta: 'Define who can receive messages from the queue', control: ui.radios({ valor: 'dueno', opciones: [{ valor: 'dueno', etiqueta: 'Only the queue owner', descripcion: 'Only the owner of the queue can receive messages from the queue.' }, { valor: 'otros', etiqueta: 'Only the specified AWS accounts, IAM users and roles', desactivado: true }] }) }),
              editar?.politica ? ui.alerta({ tipo: 'aviso', contenido: 'Esta cola tiene una política propia (por ejemplo, el permiso para un tema de SNS). Si guardas con Basic, se reemplaza por la de omisión y SNS dejará de poder escribir.' }) : null
            ]
          : ui.campo({ etiqueta: 'Access policy (JSON)', control: ui.area({ valor: f.politica, filas: 16, monoespaciado: true, alCambiar: (v) => (f.politica = v) }) })
      )
    }),
    ui.contenedor({ titulo: 'Redrive allow policy - optional', plegable: true, abierto: false, cuerpo: ui.alerta({ tipo: 'info', contenido: 'No disponible en este simulador: por omisión, cualquier cola de tu cuenta puede usar esta como cola de mensajes muertos.' }) }),
    ui.contenedor({
      titulo: 'Dead-letter queue - optional',
      info: 'sqs-dlq',
      cx,
      plegable: true,
      abierto: f.dlq,
      descripcion: 'Send undeliverable messages to a dead-letter queue.',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({ etiqueta: 'Set this queue to receive undeliverable messages.', control: ui.radios({ horizontal: true, valor: f.dlq ? 'si' : 'no', alCambiar: (v) => ((f.dlq = v === 'si'), repintar()), opciones: [{ valor: 'no', etiqueta: 'Disabled' }, { valor: 'si', etiqueta: 'Enabled' }] }) }),
        f.dlq
          ? [
              ui.campo({
                etiqueta: 'Choose queue',
                control: ui.selector({
                  placeholder: 'Choose a queue',
                  filtrar: true,
                  valor: f.dlqArn,
                  opciones: colas(cx)
                    .filter((c) => c.tipo === f.tipo && c.arn !== editar?.arn)
                    .map((c) => ({ valor: c.arn, etiqueta: c.arn })),
                  vacio: `No ${f.tipo} queues available. Create another queue first.`,
                  alCambiar: (v) => (f.dlqArn = v)
                }),
                error: f.intento && f.dlq && !f.dlqArn ? 'Choose a dead-letter queue.' : null
              }),
              ui.campo({ etiqueta: 'Maximum receives', control: ui.entrada({ valor: f.maxRecepciones, tipo: 'number', etiquetaAccesible: 'Maximum receives', alCambiar: (v) => (f.maxRecepciones = v) }), restriccion: 'Value must be between 1 and 1000.' })
            ]
          : null
      )
    }),
    editar ? null : ui.contenedor({ titulo: 'Tags - optional', plegable: true, abierto: false, descripcion: 'A tag is a label assigned to an AWS resource.', cuerpo: ui.editorEtiquetas({ filas: f.etiquetas }) })
  ];
}

const parametrosCola = (f) => ({
  nombre: f.nombre.trim(),
  tipo: f.tipo,
  visibilidad: enSegundos(f.visibilidad),
  retencion: enSegundos(f.retencion),
  retraso: enSegundos(f.retraso),
  tamanoMaximo: f.tamano === '' ? '' : Math.round(Number(f.tamano) * 1024),
  espera: f.espera,
  deduplicacionContenido: f.dedup,
  altoRendimiento: f.altoRendimiento,
  cifrado: f.cifrado ? f.llave : null,
  politica: f.metodo === 'avanzado' ? f.politica.trim() || null : null,
  dlq: f.dlq && f.dlqArn ? { arn: f.dlqArn, maxRecepciones: Number(f.maxRecepciones) } : null,
  etiquetas: f.etiquetas
});

function crearColaPagina(cx) {
  cx.migas([migaSqs, migaColas, { texto: 'Create queue' }]);
  const f = formularioNuevo(cx);
  const forma = ui.region(() => seccionesCola(cx, f, null, () => forma.repintar()));
  function enviar() {
    f.intento = true;
    forma.repintar();
    const n = f.nombre.trim();
    if (!n || (f.tipo === 'FIFO' && !n.endsWith('.fifo')) || (f.dlq && !f.dlqArn)) return forma.querySelector('.cx-campo--error')?.scrollIntoView({ block: 'center' });
    const r = cx.hacer({ servicio: 'SQS', accion: 'CreateQueue', error: 'Failed to create queue' }, (e) => crearCola(e, parametrosCola(f)));
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: `Queue ${r.valor.nombre} created successfully. You can now send and receive messages.` });
      cx.ir(rutaCola(r.valor));
    }
  }
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Create queue', info: 'sqs-cola', cx }),
    forma,
    ui.pieFormulario({ cancelar: () => cx.ir('sqs/colas'), enviar, textoEnviar: 'Create queue' })
  );
}

function editarColaPagina(cx, { nombre }) {
  const c = colaPorRef(cx.estado, nombre);
  cx.migas([migaSqs, migaColas, { texto: nombre, ruta: c ? rutaCola(c) : null }, { texto: 'Edit' }]);
  if (!c) return noExiste(cx, 'Queue', nombre, 'sqs/colas');
  const f = formularioDe(c);
  const forma = ui.region(() => seccionesCola(cx, f, c, () => forma.repintar()));
  function guardar() {
    f.intento = true;
    forma.repintar();
    if (f.dlq && !f.dlqArn) return;
    const p = parametrosCola(f);
    delete p.nombre;
    delete p.tipo;
    delete p.etiquetas;
    const r = cx.hacer({ servicio: 'SQS', accion: 'SetQueueAttributes', error: `Failed to edit queue ${c.nombre}` }, (e) => editarCola(e, c.url, p));
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: `Queue ${c.nombre} updated successfully.` });
      cx.ir(rutaCola(c));
    }
  }
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: `Edit ${c.nombre}`, info: 'sqs-cola', cx }),
    forma,
    ui.pieFormulario({ cancelar: () => cx.ir(rutaCola(c)), enviar: guardar, textoEnviar: 'Save' })
  );
}

/* ================================================================ detalle */

const segundosTexto = (s) => {
  if (s % 86400 === 0 && s) return `${s / 86400} ${s === 86400 ? 'Day' : 'Days'}`;
  if (s % 3600 === 0 && s) return `${s / 3600} ${s === 3600 ? 'Hour' : 'Hours'}`;
  if (s % 60 === 0 && s) return `${s / 60} ${s === 60 ? 'Minute' : 'Minutes'}`;
  return `${s} ${s === 1 ? 'Second' : 'Seconds'}`;
};

function detalleCola(cx, { nombre }) {
  cx.migas([migaSqs, migaColas, { texto: nombre }]);
  if (!colaPorRef(cx.estado, nombre)) return noExiste(cx, 'Queue', nombre, 'sqs/colas');
  const st = { pestana: cx.memoria.sqsPestana ?? 'sns' };
  return cx.vivo(() => {
    const c = colaPorRef(cx.estado, nombre);
    if (!c) return noExiste(cx, 'Queue', nombre, 'sqs/colas');
    const t = ahora();
    const muerta = c.dlq ? colaPorRef(cx.estado, c.dlq.arn) : null;
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({
        titulo: c.nombre,
        info: 'sqs-cola',
        cx,
        acciones: [
          ui.boton('Edit', { alClic: () => cx.ir(rutaCola(c, 'editar')) }),
          ui.boton('Delete', { escribe: true, alClic: () => borrarCola(cx, c, { alTerminar: () => cx.ir('sqs/colas') }) }),
          ui.boton('Purge', { escribe: true, alClic: () => purgar(cx, c) }),
          ui.boton('Start DLQ redrive', { desactivado: true }),
          ui.boton('Send and receive messages', { variante: 'primario', escribe: false, alClic: () => cx.ir(rutaCola(c, 'mensajes')) })
        ]
      }),
      ui.contenedor({
        titulo: 'Details',
        cuerpo: [
          ui.pares(
            [
              { etiqueta: 'Name', valor: c.nombre },
              { etiqueta: 'Type', valor: c.tipo, info: 'sqs-tipo' },
              { etiqueta: 'ARN', valor: ui.copiable(c.arn) },
              { etiqueta: 'Encryption', valor: cifradoTexto(c) },
              { etiqueta: 'URL', valor: ui.copiable(c.url) },
              { etiqueta: 'Dead-letter queue', valor: muerta ? ui.enlace(muerta.nombre, rutaCola(muerta), { cx }) : '-' }
            ],
            { columnas: 3, cx }
          ),
          ui.expandible({
            titulo: 'More',
            contenido: ui.pares(
              [
                { etiqueta: 'Maximum message size', valor: `${Math.round(c.tamanoMaximo / 1024)} KiB` },
                { etiqueta: 'Message retention period', valor: segundosTexto(c.retencion) },
                { etiqueta: 'Created', valor: ui.fecha(c.creado) },
                { etiqueta: 'Default visibility timeout', valor: segundosTexto(c.visibilidad), info: 'sqs-visibilidad' },
                { etiqueta: 'Delivery delay', valor: segundosTexto(c.retraso) },
                { etiqueta: 'Last updated', valor: ui.fecha(c.modificado) },
                { etiqueta: 'Receive message wait time', valor: segundosTexto(c.espera) },
                { etiqueta: 'Messages available', valor: String(mensajesDisponibles(c, t)) },
                { etiqueta: 'Messages delayed', valor: String(mensajesRetrasados(c, t)) },
                { etiqueta: 'Messages in flight (not available to other consumers)', valor: String(mensajesEnVuelo(c, t)) },
                c.tipo === 'FIFO' ? { etiqueta: 'Content-based deduplication', valor: c.deduplicacionContenido ? 'Enabled' : 'Disabled' } : null
              ],
              { columnas: 3, cx }
            )
          })
        ]
      }),
      ui.pestanas({
        activa: st.pestana,
        alCambiar: (id) => (st.pestana = cx.memoria.sqsPestana = id),
        pestanas: [
          { id: 'sns', texto: 'SNS subscriptions', contenido: () => pestanaSns(cx, c) },
          { id: 'lambda', texto: 'Lambda triggers', contenido: () => pestanaLambda(cx, c) },
          { id: 'pipes', texto: 'EventBridge Pipes', desactivada: true, contenido: () => null },
          { id: 'dlq', texto: 'Dead-letter queue', contenido: () => pestanaDlq(cx, c) },
          { id: 'monitoreo', texto: 'Monitoring', contenido: () => pestanaMonitoreo(cx, c) },
          { id: 'etiquetas', texto: 'Tagging', contenido: () => tablaEtiquetas(cx, c.etiquetas) },
          { id: 'politica', texto: 'Access policy', contenido: () => ui.contenedor({ titulo: 'Access policy (Permissions)', info: 'sqs-politica', cx, acciones: ui.boton('Edit', { alClic: () => cx.ir(rutaCola(c, 'editar')) }), cuerpo: h('pre', { class: 'cx-log' }, politicaCola(cx.estado, c)) }) },
          { id: 'cifrado', texto: 'Encryption', contenido: () => ui.contenedor({ titulo: 'Encryption', info: 'sqs-cifrado', cx, cuerpo: ui.pares([{ etiqueta: 'Server-side encryption', valor: c.cifrado ? 'Enabled' : 'Disabled' }, { etiqueta: 'Encryption key type', valor: cifradoTexto(c) }], { columnas: 2 }) }) },
          { id: 'redrive', texto: 'Dead-letter queue redrive status', desactivada: true, contenido: () => null }
        ]
      })
    );
  });
}

function pestanaSns(cx, c) {
  return ui.tabla(cx, {
    titulo: 'SNS subscriptions',
    info: 'sqs-sns',
    variante: 'contenedor',
    filas: () => suscripcionesSns(cx.estado).filter((s) => s.protocolo === 'sqs' && s.endpoint === c.arn),
    clave: (s) => s.arn,
    filtro: 'Search subscriptions',
    columnas: [
      { titulo: 'Subscription ARN', valor: (s) => ui.enlace(s.arn, `sns/suscripciones/${s.id}`, { cx }), texto: (s) => s.arn },
      { titulo: 'Topic ARN', valor: (s) => s.temaArn }
    ],
    acciones: () => [ui.boton('Subscribe to Amazon SNS topic', { escribe: true, alClic: () => cx.ir(rutaCola(c, 'suscribir')) })],
    vacio: { titulo: 'No subscriptions', texto: 'This queue isn’t subscribed to any Amazon SNS topics.', accion: ui.boton('Subscribe to Amazon SNS topic', { escribe: true, alClic: () => cx.ir(rutaCola(c, 'suscribir')) }) }
  });
}

function pestanaLambda(cx, c) {
  const filas = () => (cx.estado.lambda?.funciones ?? []).flatMap((fn) => fn.mapeos.filter((m) => m.fuente === c.arn).map((m) => ({ fn, m })));
  return ui.tabla(cx, {
    titulo: 'Lambda triggers',
    info: 'sqs-lambda',
    variante: 'contenedor',
    filas,
    clave: (x) => x.m.uuid,
    seleccion: 'unica',
    filtro: false,
    columnas: [
      { titulo: 'UUID', valor: (x) => x.m.uuid },
      { titulo: 'ARN', valor: (x) => ui.enlace(x.fn.arn, `lambda/funciones/${encodeURIComponent(x.fn.nombre)}`, { cx }), texto: (x) => x.fn.arn },
      { titulo: 'Status', valor: (x) => (x.m.activo ? ui.estado('exito', 'Enabled') : ui.estado('detenido', 'Disabled')) },
      { titulo: 'Last modified', valor: (x) => ui.fecha(x.m.modificado) }
    ],
    acciones: (sel) => [
      ui.boton(sel[0]?.m.activo === false ? 'Enable trigger' : 'Disable trigger', {
        desactivado: !sel[0],
        escribe: true,
        alClic: () => cx.hacer({ servicio: 'Lambda', accion: 'UpdateEventSourceMapping', error: 'Failed to update trigger' }, (e) => editarMapeoLambda(e, sel[0].fn.nombre, sel[0].m.uuid, { activo: !sel[0].m.activo }))
      }),
      ui.boton('Delete', {
        desactivado: !sel[0],
        escribe: true,
        alClic: () =>
          cx.confirmar({
            titulo: 'Delete trigger',
            textoBoton: 'Delete',
            contenido: h('p', {}, `Delete the trigger for ${sel[0].fn.nombre}? The function stops receiving messages from this queue.`),
            aceptar: () => cx.hacer({ servicio: 'Lambda', accion: 'DeleteEventSourceMapping', error: 'Failed to delete trigger' }, (e) => quitarDisparador(e, sel[0].fn.nombre, { tipo: 'sqs', id: sel[0].m.uuid })).ok
          })
      }),
      ui.boton('Configure Lambda function trigger', { escribe: true, alClic: () => cx.ir(rutaCola(c, 'lambda')) })
    ],
    vacio: { titulo: 'No Lambda triggers', texto: 'There are no Lambda triggers for this queue.', accion: ui.boton('Configure Lambda function trigger', { escribe: true, alClic: () => cx.ir(rutaCola(c, 'lambda')) }) }
  });
}

function pestanaDlq(cx, c) {
  const muerta = c.dlq ? colaPorRef(cx.estado, c.dlq.arn) : null;
  const fuentes = colas(cx).filter((x) => x.dlq?.arn === c.arn);
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.contenedor({
      titulo: 'Dead-letter queue',
      info: 'sqs-dlq',
      cx,
      acciones: ui.boton('Edit', { alClic: () => cx.ir(rutaCola(c, 'editar')) }),
      cuerpo: c.dlq
        ? ui.pares([{ etiqueta: 'Queue', valor: muerta ? ui.enlace(muerta.arn, rutaCola(muerta), { cx }) : c.dlq.arn }, { etiqueta: 'Maximum receives', valor: String(c.dlq.maxRecepciones) }], { columnas: 2 })
        : h('p', { class: 'cx-texto-sec' }, 'No dead-letter queue is configured for this queue.')
    }),
    fuentes.length
      ? ui.contenedor({ titulo: `Source queues (${fuentes.length})`, descripcion: 'These queues use this queue as their dead-letter queue.', cuerpo: h('ul', {}, fuentes.map((x) => h('li', {}, ui.enlace(x.nombre, rutaCola(x), { cx })))) })
      : null
  );
}

function pestanaMonitoreo(cx, c) {
  const t = ahora();
  return ui.contenedor({
    titulo: 'Monitoring',
    info: 'sqs-cola',
    cx,
    descripcion: 'Las gráficas completas están en CloudWatch → All metrics → AWS/SQS. Aquí ves los números de este momento.',
    acciones: ui.boton('View in CloudWatch', { alClic: () => cx.ir('cloudwatch/metricas') }),
    cuerpo: ui.pares(
      [
        { etiqueta: 'Approximate Number Of Messages Visible', valor: String(mensajesDisponibles(c, t)) },
        { etiqueta: 'Approximate Number Of Messages Not Visible', valor: String(mensajesEnVuelo(c, t)) },
        { etiqueta: 'Approximate Number Of Messages Delayed', valor: String(mensajesRetrasados(c, t)) },
        { etiqueta: 'Number Of Messages Sent (total)', valor: String(c.enviados) },
        { etiqueta: 'Number Of Messages Received (total)', valor: String(c.recibidos) },
        { etiqueta: 'Number Of Messages Deleted (total)', valor: String(c.borrados) }
      ],
      { columnas: 3 }
    )
  });
}

/* ============================================== Send and receive messages */

function mensajes(cx, { nombre }) {
  const c0 = colaPorRef(cx.estado, nombre);
  cx.migas([migaSqs, migaColas, { texto: nombre, ruta: c0 ? rutaCola(c0) : null }, { texto: 'Send and receive messages' }]);
  if (!c0) return noExiste(cx, 'Queue', nombre, 'sqs/colas');
  const cola = () => colaPorRef(cx.estado, nombre);
  const fifo = c0.tipo === 'FIFO';
  const f = { cuerpo: '', retraso: '0', grupo: '', dedup: '', atributos: [], intento: false };
  const sondeo = { duracion: 20, maximo: 10, desde: 0, hasta: 0, recibidos: [], hubo: false };
  cx.memoria.sqsRecibidos ??= {};

  const envio = ui.region(() =>
    ui.contenedor({
      titulo: 'Send message',
      info: 'sqs-mensajes',
      cx,
      acciones: [ui.boton('Clear content', { alClic: () => ((f.cuerpo = ''), (f.grupo = ''), (f.dedup = ''), (f.atributos = []), (f.intento = false), envio.repintar()) }), ui.boton('Send message', { variante: 'primario', alClic: enviar })],
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({ etiqueta: 'Message body', descripcion: 'Enter the message to send to the queue.', control: ui.area({ valor: f.cuerpo, filas: 5, placeholder: 'Enter message', alCambiar: (v) => (f.cuerpo = v) }), error: f.intento && !f.cuerpo ? 'Message body is required.' : null }),
        fifo
          ? h(
              'div',
              { class: 'cx-fila-campos' },
              ui.campo({ etiqueta: 'Message group ID', info: 'sqs-tipo', cx, control: ui.entrada({ valor: f.grupo, alCambiar: (v) => (f.grupo = v) }), restriccion: 'Messages that belong to the same message group are processed in a FIFO manner.' }),
              ui.campo({ etiqueta: 'Message deduplication ID', opcional: c0.deduplicacionContenido, control: ui.entrada({ valor: f.dedup, alCambiar: (v) => (f.dedup = v) }), restriccion: 'The token used for deduplication of sent messages.' })
            )
          : ui.campo({ etiqueta: 'Delivery delay', control: ui.entrada({ valor: f.retraso, tipo: 'number', sufijo: 'Seconds', etiquetaAccesible: 'Delivery delay', alCambiar: (v) => (f.retraso = v) }), restriccion: 'Should be between 0 seconds and 15 minutes.' }),
        ui.expandible({
          titulo: 'Message attributes - optional',
          abierto: f.atributos.length > 0,
          contenido: h(
            'div',
            { class: 'cx-form' },
            f.atributos.map((a, i) =>
              h(
                'div',
                { class: 'cx-fila-campos' },
                ui.campo({ etiqueta: 'Name', control: ui.entrada({ valor: a.nombre, alCambiar: (v) => (a.nombre = v) }) }),
                ui.campo({ etiqueta: 'Type', control: ui.selector({ opciones: ['String', 'Number', 'Binary'].map((x) => ({ valor: x, etiqueta: x })), valor: a.tipo, alCambiar: (v) => (a.tipo = v) }) }),
                ui.campo({ etiqueta: 'Value', control: ui.entrada({ valor: a.valor, alCambiar: (v) => (a.valor = v) }) }),
                h('div', { class: 'cx-msj-quitar' }, ui.boton('Remove', { alClic: () => (f.atributos.splice(i, 1), envio.repintar()) }))
              )
            ),
            h('div', {}, ui.boton('Add new attribute', { desactivado: f.atributos.length >= 10, alClic: () => (f.atributos.push({ nombre: '', tipo: 'String', valor: '' }), envio.repintar()) }))
          )
        })
      )
    })
  );

  function enviar() {
    f.intento = true;
    if (!f.cuerpo) return envio.repintar();
    const atributos = Object.fromEntries(f.atributos.filter((a) => a.nombre.trim()).map((a) => [a.nombre.trim(), a.valor]));
    const r = cx.hacer({ servicio: 'SQS', accion: 'SendMessage', error: 'Failed to send message' }, (e) => enviarMensaje(e, nombre, { cuerpo: f.cuerpo, retraso: fifo ? null : f.retraso, grupo: f.grupo, dedup: f.dedup, atributos }));
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: r.valor.duplicado ? `Your message was accepted as a duplicate (deduplication ID already used in the last 5 minutes).` : 'Your message has been sent and is ready to be received.' });
      f.intento = false;
      envio.repintar();
    }
  }

  const sondeando = () => ahora() < sondeo.hasta && sondeo.recibidos.length < sondeo.maximo;

  function recibirAhora() {
    const c = cola();
    if (!c) return;
    const faltan = sondeo.maximo - sondeo.recibidos.length;
    if (faltan <= 0) return;
    if (sondeo.hubo && !mensajesDisponibles(c, ahora())) return;
    sondeo.hubo = true;
    const r = cx.hacer({ servicio: 'SQS', accion: 'ReceiveMessage', error: 'Failed to receive messages' }, (e) => recibirMensajes(e, nombre, { maximo: Math.min(10, faltan) }));
    if (r.ok) sondeo.recibidos.push(...r.valor.map((m) => ({ ...m, recibidoEn: ahora() })));
  }

  function sondear() {
    sondeo.desde = ahora();
    sondeo.hasta = ahora() + sondeo.duracion * 1000;
    sondeo.recibidos = [];
    sondeo.hubo = false;
    recibirAhora();
    recepcion.repintar();
    tablaMsjs.actualizar(true);
  }

  cx.alRefrescar(() => {
    if (sondeando()) {
      const antes = sondeo.recibidos.length;
      recibirAhora();
      if (sondeo.recibidos.length !== antes) tablaMsjs.actualizar(true);
      if (!sondeando()) sondeo.hasta = 0;
    } else if (sondeo.hasta) {
      sondeo.hasta = 0;
    }
  });

  function ajustes() {
    const v = { duracion: String(sondeo.duracion), maximo: String(sondeo.maximo) };
    let error = null;
    const cuerpo = ui.region(() => [
      ui.campo({ etiqueta: 'Polling duration', control: ui.entrada({ valor: v.duracion, tipo: 'number', sufijo: 'Seconds', alCambiar: (x) => (v.duracion = x) }), restriccion: 'Should be between 1 and 60 seconds.' }),
      ui.campo({ etiqueta: 'Maximum message count', control: ui.entrada({ valor: v.maximo, tipo: 'number', alCambiar: (x) => (v.maximo = x) }), restriccion: 'Should be between 1 and 10.', error })
    ]);
    const m = cx.modal({
      titulo: 'Edit poll settings',
      contenido: cuerpo,
      pie: [
        ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
        ui.boton('Save', {
          variante: 'primario',
          escribe: false,
          alClic: () => {
            const d = Number(v.duracion);
            const n = Number(v.maximo);
            if (!Number.isInteger(d) || d < 1 || d > 60 || !Number.isInteger(n) || n < 1 || n > 10) {
              error = 'Polling duration must be 1-60 seconds and maximum message count 1-10.';
              return cuerpo.repintar();
            }
            sondeo.duracion = d;
            sondeo.maximo = n;
            m.cerrar();
            recepcion.repintar();
          }
        })
      ]
    });
  }

  const recepcion = cx.vivo(() => {
    const c = cola();
    const activo = sondeando();
    const avance = activo ? Math.min(100, Math.round(((ahora() - sondeo.desde) / (sondeo.hasta - sondeo.desde)) * 100)) : 0;
    return ui.contenedor({
      titulo: 'Receive messages',
      info: 'sqs-visibilidad',
      cx,
      acciones: [
        ui.boton('Edit poll settings', { alClic: ajustes }),
        ui.boton('Stop polling', { desactivado: !activo, alClic: () => ((sondeo.hasta = 0), recepcion.repintar()) }),
        ui.boton('Poll for messages', { variante: 'primario', desactivado: activo, alClic: sondear })
      ],
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        h(
          'div',
          { class: 'cx-msj-mensajes-meta' },
          ui.pares(
            [
              { etiqueta: 'Messages available', valor: String(c ? mensajesDisponibles(c, ahora()) : 0) },
              { etiqueta: 'Polling duration', valor: String(sondeo.duracion) },
              { etiqueta: 'Maximum message count', valor: String(sondeo.maximo) },
              { etiqueta: 'Polling progress', valor: activo ? h('span', { class: 'cx-msj-sondeo' }, h('span', { class: 'cx-progreso' }, h('span', { style: { width: `${avance}%` } })), `${avance}%`) : sondeo.desde ? '100%' : '0%' }
            ],
            { columnas: 4 }
          )
        )
      )
    });
  });

  const tablaMsjs = ui.tabla(cx, {
    titulo: 'Messages',
    variante: 'contenedor',
    descripcion: 'Received messages stay «in flight» (invisible to other consumers) during the visibility timeout. Delete them after processing.',
    filas: () => sondeo.recibidos,
    clave: (m) => m.recibo,
    seleccion: 'multiple',
    filtro: 'Search messages',
    columnas: [
      { titulo: 'ID', valor: (m) => ui.enlace(m.id, () => detalleMensaje(cx, m), {}), texto: (m) => m.id },
      { titulo: 'Sent', valor: (m) => ui.fecha(new Date(m.enviado).toISOString()), texto: (m) => String(m.enviado) },
      { titulo: 'Size', valor: (m) => `${new TextEncoder().encode(m.cuerpo).length} bytes` },
      { titulo: 'Receive count', valor: (m) => String(m.recibos) }
    ],
    acciones: (sel) => [
      ui.boton('View details', { desactivado: sel.length !== 1, alClic: () => detalleMensaje(cx, sel[0]) }),
      ui.boton('Delete', {
        desactivado: !sel.length,
        escribe: true,
        alClic: () =>
          cx.confirmar({
            titulo: 'Delete messages',
            textoBoton: 'Delete',
            contenido: h('p', {}, `Are you sure you want to delete ${sel.length} message${sel.length > 1 ? 's' : ''}?`),
            aceptar: () => {
              const r = cx.hacer({ servicio: 'SQS', accion: 'DeleteMessage', error: 'Failed to delete messages' }, (e) => borrarMensajes(e, nombre, sel.map((m) => m.recibo)));
              if (!r.ok) return false;
              const quitar = new Set(sel.map((m) => m.recibo));
              sondeo.recibidos = sondeo.recibidos.filter((m) => !quitar.has(m.recibo));
              tablaMsjs.actualizar(true);
              cx.flash({ tipo: 'exito', texto: r.valor ? `Successfully deleted ${r.valor} message${r.valor > 1 ? 's' : ''}.` : 'The messages were already deleted or their receipt handles expired.' });
            }
          })
      })
    ],
    vacio: { titulo: 'No messages', texto: 'Choose Poll for messages to receive messages from the queue.' }
  });

  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Send and receive messages', info: 'sqs-mensajes', cx, descripcion: `Send messages to and receive messages from a queue: ${nombre}` }),
    envio,
    recepcion,
    tablaMsjs
  );
}

function detalleMensaje(cx, m) {
  const atributos = Object.entries(m.atributos ?? {});
  const contenido = ui.pestanas({
    pestanas: [
      {
        id: 'detalles',
        texto: 'Details',
        contenido: () =>
          ui.pares(
            [
              { etiqueta: 'Message ID', valor: m.id },
              { etiqueta: 'MD5 of message body', valor: m.md5 },
              { etiqueta: 'Sent', valor: ui.fechaLarga(new Date(m.enviado).toISOString()) },
              { etiqueta: 'First received', valor: m.primerRecibo ? ui.fechaLarga(new Date(m.primerRecibo).toISOString()) : '-' },
              { etiqueta: 'Receive count', valor: String(m.recibos) },
              { etiqueta: 'Message attributes count', valor: String(atributos.length) },
              m.grupo ? { etiqueta: 'Message group ID', valor: m.grupo } : null,
              m.dedup ? { etiqueta: 'Message deduplication ID', valor: m.dedup } : null,
              m.secuencia ? { etiqueta: 'Sequence number', valor: m.secuencia } : null
            ],
            { columnas: 2 }
          )
      },
      { id: 'cuerpo', texto: 'Body', contenido: () => h('pre', { class: 'cx-log' }, m.cuerpo) },
      {
        id: 'atributos',
        texto: 'Attributes',
        contenido: () => (atributos.length ? ui.pares(atributos.map(([k, v]) => ({ etiqueta: k, valor: String(v) })), { columnas: 2 }) : h('p', { class: 'cx-texto-sec' }, 'This message has no message attributes.'))
      }
    ]
  });
  const md = cx.modal({ titulo: `Message: ${m.id}`, ancho: 'grande', contenido, pie: [ui.boton('Done', { variante: 'primario', escribe: false, alClic: () => md.cerrar() })] });
}

/* ====================================== Subscribe to SNS / Lambda trigger */

function suscribirPagina(cx, { nombre }) {
  const c = colaPorRef(cx.estado, nombre);
  cx.migas([migaSqs, migaColas, { texto: nombre, ruta: c ? rutaCola(c) : null }, { texto: 'Subscribe to Amazon SNS topic' }]);
  if (!c) return noExiste(cx, 'Queue', nombre, 'sqs/colas');
  const f = { tema: null, intento: false };
  const forma = ui.region(() =>
    ui.contenedor({
      titulo: 'Amazon SNS topic',
      info: 'sqs-sns',
      cx,
      descripcion: 'Specify an Amazon SNS topic available for this queue to subscribe to.',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({
          etiqueta: 'Use existing Amazon SNS topic',
          control: ui.selector({
            placeholder: 'Choose a topic',
            filtrar: true,
            valor: f.tema,
            opciones: (cx.estado.sns?.temas ?? []).map((t) => ({ valor: t.arn, etiqueta: t.arn, descripcion: t.tipo, desactivado: c.tipo === 'FIFO' && t.tipo === 'Standard' })),
            opcionLibre: (v) => (v.startsWith('arn:aws:sns:') ? { valor: v, etiqueta: v } : null),
            vacio: 'No topics. Create one in Amazon SNS first.',
            alCambiar: (v) => (f.tema = v)
          }),
          error: f.intento && !f.tema ? 'Choose an Amazon SNS topic.' : null
        }),
        ui.alerta({ tipo: 'info', contenido: 'Amazon SQS adds a statement to the queue’s access policy that allows the topic to send messages to this queue.' })
      )
    })
  );
  function guardar() {
    f.intento = true;
    forma.repintar();
    if (!f.tema) return;
    const r = cx.hacer({ servicio: 'SQS', accion: 'Subscribe', error: 'Failed to subscribe to the topic' }, (e) => suscribirColaATema(e, c.arn, f.tema), { atomico: true });
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: `Subscribed successfully to topic ${f.tema.split(':').pop()}.` });
      cx.memoria.sqsPestana = 'sns';
      cx.ir(rutaCola(c));
    }
  }
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: `Subscribe to Amazon SNS topic`, info: 'sqs-sns', cx, descripcion: c.nombre }),
    forma,
    ui.pieFormulario({ cancelar: () => cx.ir(rutaCola(c)), enviar: guardar, textoEnviar: 'Save' })
  );
}

function lambdaPagina(cx, { nombre }) {
  const c = colaPorRef(cx.estado, nombre);
  cx.migas([migaSqs, migaColas, { texto: nombre, ruta: c ? rutaCola(c) : null }, { texto: 'Configure Lambda function trigger' }]);
  if (!c) return noExiste(cx, 'Queue', nombre, 'sqs/colas');
  const f = { fn: null, intento: false };
  const forma = ui.region(() =>
    ui.contenedor({
      titulo: 'Lambda function trigger',
      info: 'sqs-lambda',
      cx,
      descripcion: 'Specify a Lambda function that is invoked when messages arrive in this queue.',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({
          etiqueta: 'Choose a Lambda function',
          control: ui.selector({
            placeholder: 'Choose a function',
            filtrar: true,
            valor: f.fn,
            opciones: (cx.estado.lambda?.funciones ?? []).map((fn) => ({ valor: fn.arn, etiqueta: fn.arn, descripcion: `${fn.runtime} · timeout ${fn.timeout} s` })),
            vacio: 'No functions. Create one in AWS Lambda first.',
            alCambiar: (v) => (f.fn = v)
          }),
          error: f.intento && !f.fn ? 'Choose a Lambda function.' : null
        }),
        ui.alerta({ tipo: 'info', contenido: `Lambda reads up to 10 messages at a time and deletes them when the function succeeds. The queue’s visibility timeout (${c.visibilidad} s) must be at least the function timeout.` })
      )
    })
  );
  function guardar() {
    f.intento = true;
    forma.repintar();
    if (!f.fn) return;
    const fnNombre = f.fn.split(':').pop();
    const r = cx.hacer({ servicio: 'Lambda', accion: 'CreateEventSourceMapping', error: 'Failed to configure the Lambda function trigger' }, (e) => agregarDisparador(e, fnNombre, { tipo: 'sqs', colaArn: c.arn }));
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: `Lambda function ${fnNombre} configured successfully as a trigger for queue ${c.nombre}.` });
      cx.memoria.sqsPestana = 'lambda';
      cx.ir(rutaCola(c));
    }
  }
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Configure Lambda function trigger', info: 'sqs-lambda', cx, descripcion: c.nombre }),
    forma,
    ui.pieFormulario({ cancelar: () => cx.ir(rutaCola(c)), enviar: guardar, textoEnviar: 'Save' })
  );
}

/* ================================================================ ayudas */

const ayudas = {
  'sqs-cola': {
    titulo: 'Cola de SQS',
    texto: [
      'Una **cola** es como la fila de comandas de una taquería: quien toma el pedido lo deja en la fila y la cocina los va sacando a su ritmo. Así un sistema no se cae si el otro va lento: quedan **desacoplados**.',
      'Los mensajes esperan en la cola hasta que alguien los **recibe** y los **borra**. Si nadie los borra, se quedan hasta que vence el **retention period** (4 días por omisión).',
      'Para probar: **Send and receive messages** → escribe un mensaje → **Send message** → **Poll for messages**.'
    ]
  },
  'sqs-tipo': {
    titulo: 'Standard o FIFO',
    texto: [
      ['**Standard**: casi sin límite de velocidad; entrega cada mensaje *al menos una vez* y el orden puede variar.', '**FIFO**: respeta el orden exacto y entrega *exactamente una vez*. El nombre debe terminar en `.fifo`.'],
      'En FIFO cada mensaje lleva un **Message group ID**: los del mismo grupo salen en orden, uno tras otro.',
      'El tipo no se puede cambiar después.'
    ]
  },
  'sqs-visibilidad': {
    titulo: 'Visibility timeout',
    texto: [
      'Cuando alguien **recibe** un mensaje, SQS lo esconde de los demás durante el **visibility timeout** (30 s por omisión): queda **in flight**.',
      'Si en ese tiempo no lo borran (porque el programa falló), el mensaje **reaparece** para que otro lo procese. Por eso, después de procesarlo, hay que **borrarlo**.',
      'En el simulador los segundos son reales: recibe un mensaje y verás que regresa 30 s después si no lo borras.'
    ]
  },
  'sqs-mensajes': {
    titulo: 'Enviar y recibir mensajes',
    texto: [
      '**Send message** pone un mensaje en la cola. **Poll for messages** escucha la cola durante el *polling duration* y recibe hasta *maximum message count* mensajes.',
      'Cada vez que recibes un mensaje sube su **Receive count**. Al terminar, elígelo y pulsa **Delete**.'
    ]
  },
  'sqs-politica': {
    titulo: 'Política de acceso',
    texto: [
      'Es el JSON que dice quién puede mandar o leer mensajes de la cola. La de omisión (**Basic**, *Only the queue owner*) solo deja a tu cuenta.',
      'Para que un **tema de SNS** escriba aquí, la política debe permitir `SQS:SendMessage` a ese tema. La forma fácil: en la cola, **Actions → Subscribe to Amazon SNS topic**; la consola agrega el permiso sola.'
    ]
  },
  'sqs-cifrado': {
    titulo: 'Cifrado',
    texto: ['Con **SSE-SQS** (la opción por omisión) los mensajes se guardan cifrados con una llave que maneja SQS, sin costo extra. **SSE-KMS** usa una llave de KMS que tú controlas.']
  },
  'sqs-dlq': {
    titulo: 'Cola de mensajes muertos (DLQ)',
    texto: [
      'Una **dead-letter queue** es otra cola donde van a parar los mensajes que fallaron demasiadas veces.',
      'Con **Maximum receives** = 3, un mensaje que se recibió 3 veces sin que nadie lo borrara se mueve a la DLQ: así no bloquea la cola principal y puedes revisarlo después.',
      'La DLQ debe ser del mismo tipo (Standard o FIFO).'
    ]
  },
  'sqs-sns': {
    titulo: 'Suscribir la cola a un tema',
    texto: [
      'Así juntas **SNS + SQS** (el patrón *fan-out*): cada mensaje que se publica en el tema llega como un mensaje a la cola.',
      'Lo que llega es un JSON de SNS: el texto original va en el campo `Message`.'
    ]
  },
  'sqs-lambda': {
    titulo: 'Disparador de Lambda',
    texto: [
      'Con un **Lambda trigger**, Lambda lee la cola por ti y llama a tu función con los mensajes (en `event.Records`). Si la función termina bien, los borra.',
      'Si la función falla, los mensajes vuelven a la cola al vencer el visibility timeout. Por eso el visibility timeout debe ser **mayor o igual** al timeout de la función.'
    ]
  }
};

/* ================================================================ registro */

export default {
  id: 'sqs',
  nombre: 'Simple Queue Service',
  titulo: 'Amazon SQS',
  descripcion: 'Managed Message Queues',
  categoria: 'integracion',
  claves: 'sqs colas queue mensajes desacoplar',
  inicio: 'sqs/colas',
  menu: [{ texto: 'Queues', ruta: 'sqs/colas' }, { seccion: 'Simulador', items: [{ texto: 'Bandeja de correo (simulada)', ruta: 'sns/buzon' }] }],
  rutas: {
    '': listaColas,
    colas: listaColas,
    'colas/crear': crearColaPagina,
    'colas/:nombre': detalleCola,
    'colas/:nombre/editar': editarColaPagina,
    'colas/:nombre/mensajes': mensajes,
    'colas/:nombre/suscribir': suscribirPagina,
    'colas/:nombre/lambda': lambdaPagina
  },
  busqueda: [
    { texto: 'Queues', ruta: 'sqs/colas', claves: 'colas' },
    { texto: 'Create queue', ruta: 'sqs/colas/crear' }
  ],
  ayudas
};

export { botonBuzon };
