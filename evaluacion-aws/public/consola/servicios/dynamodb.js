// ---------------------------------------------------------------------------
// DYNAMODB
//
// La consola de DynamoDB: Dashboard, Tables (lista, Create table con Default
// o Customize settings y el detalle con sus pestañas), Explore items (Scan o
// Query con condiciones sobre la sort key, filtros y el banner de eficiencia),
// Create / Edit item en vista Form y JSON, índices globales, Backups (PITR y
// bajo demanda), Global tables (réplicas) y Delete table con «confirm».
//
// Todo lo que cambia el estado pasa por cx.hacer con las acciones de
// modelo/dynamodb.js; Scan y Query son funciones puras del modelo.
// ---------------------------------------------------------------------------

import * as ui from '../ui.js';
import {
  CONDICIONES_DYNAMO,
  REGIONES_DYNAMO,
  consultarTabla,
  crearIndiceDynamo,
  crearReplicaDynamo,
  crearRespaldoDynamo,
  crearTablaDynamo,
  editarCapacidadDynamo,
  editarClaseDynamo,
  editarEtiquetasDynamo,
  editarItemDynamo,
  editarPitrDynamo,
  editarProteccionDynamo,
  editarStreamDynamo,
  eliminarIndiceDynamo,
  eliminarItemsDynamo,
  eliminarReplicaDynamo,
  eliminarRespaldoDynamo,
  eliminarTablaDynamo,
  escanearTabla,
  itemDynamoPlano,
  itemDynamoTipado,
  leerItemDynamo,
  llaveDeItemDynamo,
  ponerItemDynamo,
  registrarLecturaDynamo,
  restaurarPitrDynamo,
  restaurarRespaldoDynamo,
  tamanoItemDynamo
} from '../modelo.js';

const { h } = ui;

/* ============================================================ utilidades */

const tablas = (cx) => cx.estado.dynamodb?.tablas ?? [];
const respaldos = (cx) => cx.estado.dynamodb?.respaldos ?? [];
const tablaDe = (cx, nombre) => tablas(cx).find((t) => t.nombre === nombre) ?? null;
const migaBase = { texto: 'DynamoDB', ruta: 'dynamodb' };

const TIPOS_LLAVE = [
  { valor: 'S', etiqueta: 'String' },
  { valor: 'N', etiqueta: 'Number' },
  { valor: 'B', etiqueta: 'Binary' }
];
const NOMBRE_TIPO = { S: 'String', N: 'Number', B: 'Binary', BOOL: 'Boolean', NULL: 'Null', SS: 'String set', NS: 'Number set', BS: 'Binary set', L: 'List', M: 'Map' };
const TIPOS_ATRIBUTO = ['S', 'N', 'B', 'BOOL', 'NULL', 'SS', 'NS', 'BS', 'L', 'M'];
const esSet = (t) => t === 'SS' || t === 'NS' || t === 'BS';
const esContenedor = (t) => esSet(t) || t === 'L' || t === 'M';
const CLASE_TEXTO = { STANDARD: 'DynamoDB Standard', STANDARD_INFREQUENT_ACCESS: 'DynamoDB Standard-IA' };
const CIFRADO_TEXTO = { OWNED: 'Owned by Amazon DynamoDB', AWS_MANAGED: 'AWS managed key', CUSTOMER_MANAGED: 'Customer managed key' };
const STREAM_TEXTO = { KEYS_ONLY: 'Key attributes only', NEW_IMAGE: 'New image', OLD_IMAGE: 'Old image', NEW_AND_OLD_IMAGES: 'New and old images' };
const PROYECCION_TEXTO = { ALL: 'All', KEYS_ONLY: 'Keys only', INCLUDE: 'Include' };
const NOMBRE_VALIDO = /^[a-zA-Z0-9_.-]{3,255}$/;
const RESTRICCION_NOMBRE = 'Between 3 and 255 characters, containing only letters, numbers, underscores (_), hyphens (-), and periods (.).';

function estadoTabla(t) {
  if (t.estado === 'ACTIVE') return ui.estado('exito', 'Active');
  if (t.estado === 'CREATING') return ui.estado('pendiente', t.restauradaDe ? 'Restoring' : 'Creating');
  if (t.estado === 'UPDATING') return ui.estado('pendiente', 'Updating');
  if (t.estado === 'DELETING') return ui.estado('pendiente', 'Deleting');
  return ui.estado('info', t.estado);
}

const estadoSimple = (e) => (e === 'ACTIVE' || e === 'AVAILABLE' ? ui.estado('exito', e === 'ACTIVE' ? 'Active' : 'Available') : ui.estado('pendiente', e === 'DELETING' ? 'Deleting' : 'Creating'));

/** «On-demand», «Provisioned (5)» o «Provisioned (Auto scaling)», como la columna de la lista. */
function modoTexto(t, que) {
  if (t.modo === 'PAY_PER_REQUEST') return 'On-demand';
  if (t.autoescalado?.[que]) return 'Provisioned (Auto scaling)';
  return `Provisioned (${t.capacidad[que]})`;
}

const llaveTexto = (ll) => (ll ? `${ll.nombre} (${NOMBRE_TIPO[ll.tipo]})` : '–');

function tamanoTexto(bytes) {
  if (bytes < 1000) return `${bytes} bytes`;
  if (bytes < 1000 * 1000) return `${(bytes / 1000).toFixed(1)} kilobytes`;
  return `${(bytes / 1000 / 1000).toFixed(1)} megabytes`;
}

const bytesTabla = (t) => t.items.reduce((s, i) => s + tamanoItemDynamo(i), 0);

/** Cómo se ve un valor en la celda de «Items returned». */
function valorCelda(v) {
  if (!v) return '';
  const [t, x] = Object.entries(v)[0];
  if (t === 'BOOL') return String(x);
  if (t === 'NULL') return 'null';
  if (esSet(t)) return `[${x.map((e) => JSON.stringify(t === 'NS' ? Number(e) : e)).join(', ')}]`;
  if (t === 'L' || t === 'M') {
    const texto = JSON.stringify(x).replace(/":/g, '" : ').replace(/,/g, ', ');
    return texto.length > 90 ? `${texto.slice(0, 87)}…` : texto;
  }
  return String(x);
}

const llaveRuta = (t, item) => encodeURIComponent(JSON.stringify(llaveDeItemDynamo(t, item)));

/** Precio por mes de la capacidad provisionada (us-east-1, 730 horas). */
function costoProvisionado({ lectura, escritura, clase }) {
  const factor = clase === 'STANDARD_INFREQUENT_ACCESS' ? 1.25 : 1;
  return (lectura * 0.00013 + escritura * 0.00065) * 730 * factor;
}

/* ============================================================ dashboard */

function panel(cx) {
  cx.migas([migaBase, { texto: 'Dashboard' }]);
  const zona = cx.vivo(() => {
    const ts = tablas(cx);
    const recurso = (texto, n, ruta) => h('div', { class: 'cx-resumen-recursos__item' }, ruta ? ui.enlace(texto, ruta, { cx }) : h('span', { class: 'cx-texto-sec' }, texto), h('span', {}, String(n)));
    return h(
      'div',
      { class: 'cx-dos-columnas' },
      h(
        'div',
        { class: 'cx-pagina' },
        ui.contenedor({
          titulo: 'Resources',
          descripcion: 'You are using the following Amazon DynamoDB resources in the US East (N. Virginia) Region:',
          acciones: ui.botonRefrescar(() => cx.refrescar()),
          cuerpo: h(
            'div',
            { class: 'cx-resumen-recursos' },
            recurso('Tables', ts.length, 'dynamodb/tablas'),
            recurso('Global tables', ts.filter((t) => t.replicas.length).length, 'dynamodb/tablas'),
            recurso('Backups', respaldos(cx).length, 'dynamodb/respaldos'),
            recurso('Items (all tables)', ts.reduce((s, t) => s + t.items.length, 0), 'dynamodb/explorar'),
            recurso('DAX clusters', 0),
            recurso('Alarms', 0)
          )
        }),
        ui.contenedor({
          titulo: 'Alarms',
          descripcion: 'CloudWatch alarms for your tables.',
          cuerpo: h('div', { class: 'cx-acciones', style: { gap: '40px' } }, ui.estado('aviso', '0 in alarm'), ui.estado('exito', '0 OK'), ui.estado('detenido', '0 insufficient data'))
        })
      ),
      h(
        'div',
        { class: 'cx-lado' },
        ui.contenedor({
          titulo: 'Create resources',
          cuerpo: h(
            'div',
            { class: 'cx-form' },
            h('p', { class: 'cx-texto-sec' }, 'Create a DynamoDB table to store and retrieve any amount of data.'),
            h('div', { class: 'cx-acciones' }, ui.boton('Create table', { variante: 'primario', alClic: () => cx.ir('dynamodb/tablas/crear') })),
            h('p', { class: 'cx-texto-sec' }, 'Amazon DynamoDB Accelerator (DAX) is a fully managed, highly available caching service built for DynamoDB.'),
            h('div', { class: 'cx-acciones' }, ui.boton('Create DAX cluster', { desactivado: true }))
          )
        }),
        ui.contenedor({ titulo: 'Service health', cuerpo: ui.estado('exito', 'This service is operating normally') })
      )
    );
  });
  return h('div', { class: 'cx-pagina' }, ui.encabezado({ titulo: 'Dashboard', info: 'dyn-tabla', cx }), zona);
}

/* ================================================================ tablas */

function listaTablas(cx) {
  cx.migas([migaBase, { texto: 'Tables' }]);
  vigilarCreacion(cx);
  const t = ui.tabla(cx, {
    titulo: 'Tables',
    info: 'dyn-tabla',
    filas: () => tablas(cx),
    clave: (x) => x.nombre,
    seleccion: 'multiple',
    filtro: 'Find tables by table name',
    ultimaActualizacion: true,
    columnas: [
      { titulo: 'Name', valor: (x) => ui.enlace(x.nombre, `dynamodb/tablas/${x.nombre}`, { cx }) },
      { titulo: 'Status', valor: (x) => estadoTabla(x) },
      { titulo: 'Partition key', valor: (x) => llaveTexto(x.pk) },
      { titulo: 'Sort key', valor: (x) => llaveTexto(x.sk) },
      { titulo: 'Indexes', valor: (x) => String(x.indices.length) },
      { titulo: 'Replication Regions', valor: (x) => String(x.replicas.length) },
      { titulo: 'Deletion protection', valor: (x) => (x.proteccion ? ui.estado('exito', 'On') : ui.estado('inactivo', 'Off')) },
      { titulo: 'Read capacity mode', valor: (x) => modoTexto(x, 'lectura') },
      { titulo: 'Write capacity mode', valor: (x) => modoTexto(x, 'escritura') },
      { titulo: 'Total size', valor: (x) => tamanoTexto(bytesTabla(x)) },
      { titulo: 'Table class', valor: (x) => CLASE_TEXTO[x.clase] }
    ],
    acciones: (sel) => {
      const uno = sel.length === 1 ? sel[0] : null;
      const lista = uno && uno.estado !== 'DELETING';
      return [
        ui.menuBoton('Actions', () => [
          { texto: 'View details', desactivado: !uno, alClic: () => cx.ir(`dynamodb/tablas/${uno.nombre}`) },
          { texto: 'Explore items', desactivado: !lista, alClic: () => cx.ir(`dynamodb/explorar/${uno.nombre}`) },
          '-',
          { texto: 'Update settings', desactivado: !lista, escribe: true, alClic: () => cx.ir(`dynamodb/tablas/${uno.nombre}/capacidad`) },
          { texto: 'Create index', desactivado: !lista, escribe: true, alClic: () => cx.ir(`dynamodb/tablas/${uno.nombre}/indice`) },
          { texto: 'Create replica', desactivado: !lista, escribe: true, alClic: () => cx.ir(`dynamodb/tablas/${uno.nombre}/replica`) },
          { texto: 'Create backup', desactivado: !lista, escribe: true, alClic: () => ((cx.memoria.dynRespaldoDe = uno.nombre), cx.ir('dynamodb/respaldos/crear')) }
        ], { desactivado: !sel.length }),
        ui.boton('Delete', { escribe: true, desactivado: !sel.length || sel.some((x) => x.estado === 'DELETING'), alClic: () => borrarTablas(cx, sel) }),
        ui.boton('Create table', { variante: 'primario', alClic: () => cx.ir('dynamodb/tablas/crear') })
      ];
    },
    vacio: {
      titulo: 'No tables',
      texto: 'You have not created any tables in this Region.',
      // Un getter: la tabla arma su cuerpo cada segundo y un mismo botón se movería al cuerpo descartado.
      get accion() {
        return ui.boton('Create table', { escribe: true, alClic: () => cx.ir('dynamodb/tablas/crear') });
      }
    }
  });
  return h('div', { class: 'cx-pagina' }, t);
}

/** Cambia la alerta azul «Creating the … table» por la verde cuando la tabla queda Active. */
function vigilarCreacion(cx) {
  cx.alRefrescar(() => {
    const c = cx.memoria.dynCreando;
    if (!c) return;
    const t = tablaDe(cx, c.nombre);
    if (t && t.estado !== 'ACTIVE') return;
    cx.memoria.dynCreando = null;
    cx.quitarFlash(c.id);
    if (t) cx.flash({ tipo: 'exito', texto: `The ${t.nombre} table was created successfully.` });
  });
}

/** El modal «Delete table» con sus dos casillas y la palabra confirm. */
function borrarTablas(cx, sel) {
  const op = { alarmas: true, respaldo: false };
  let escrito = '';
  const una = sel.length === 1;
  const protegidas = sel.filter((t) => t.proteccion);
  const conReplicas = sel.filter((t) => t.replicas.length);
  const btn = ui.boton('Delete', {
    variante: 'primario',
    desactivado: true,
    alClic: () => {
      const r = cx.hacer(
        { servicio: 'DynamoDB', accion: 'DeleteTable', error: una ? `Failed to delete the ${sel[0].nombre} table` : 'Failed to delete tables' },
        (e) => sel.forEach((t) => eliminarTablaDynamo(e, t.nombre, { alarmas: op.alarmas, respaldo: op.respaldo })),
        { atomico: true }
      );
      m.cerrar();
      if (r.ok) cx.flash({ tipo: 'exito', texto: una ? `The ${sel[0].nombre} table is being deleted.` : `${sel.length} tables are being deleted.` });
    }
  });
  const m = cx.modal({
    titulo: una ? `Delete table: ${sel[0].nombre}?` : `Delete ${sel.length} tables?`,
    ancho: 'mediano',
    contenido: h(
      'div',
      { class: 'cx-form' },
      h('p', {}, una ? 'Are you sure you want to delete this table? Deleting a table removes all of its items, indexes, and streams. This action cannot be undone.' : `Are you sure you want to delete these tables: ${sel.map((t) => t.nombre).join(', ')}? This action cannot be undone.`),
      protegidas.length ? ui.alerta({ tipo: 'aviso', titulo: 'Deletion protection is on', contenido: `${protegidas.map((t) => t.nombre).join(', ')} cannot be deleted until you turn off deletion protection (Additional settings tab).` }) : null,
      conReplicas.length ? ui.alerta({ tipo: 'aviso', titulo: 'Global table', contenido: `${conReplicas.map((t) => t.nombre).join(', ')} has replicas in other Regions. Delete the replicas first (Global tables tab).` }) : null,
      ui.casilla({ etiqueta: 'Delete all CloudWatch alarms for this table.', marcada: op.alarmas, alCambiar: (v) => (op.alarmas = v) }),
      ui.casilla({ etiqueta: 'Create an on-demand backup of this table before deleting it.', marcada: op.respaldo, alCambiar: (v) => (op.respaldo = v) }),
      ui.campo({
        etiqueta: h('span', {}, 'To confirm the deletion of this table, type ', h('i', {}, 'confirm'), '.'),
        control: ui.entrada({
          placeholder: 'confirm',
          etiquetaAccesible: 'Confirm deletion',
          alCambiar: (v) => {
            escrito = v;
            btn.disabled = escrito !== 'confirm';
          },
          alEnter: () => !btn.disabled && btn.click()
        })
      })
    ),
    pie: [ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }), btn]
  });
}

/* ========================================================== create table */

/** El bloque «Read capacity» o «Write capacity» de los ajustes provisionados. */
function bloqueCapacidad(cx, cap, titulo, repintar) {
  return h(
    'div',
    { class: 'cx-bloque cx-form' },
    h('div', { class: 'cx-bloque__titulo' }, titulo),
    ui.campo({
      etiqueta: 'Auto scaling',
      info: 'dyn-autoescalado',
      cx,
      descripcion: 'Dynamically adjusts provisioned throughput capacity on your behalf in response to actual traffic patterns.',
      control: ui.radios({
        horizontal: true,
        valor: cap.auto ? 'on' : 'off',
        opciones: [{ valor: 'on', etiqueta: 'On' }, { valor: 'off', etiqueta: 'Off' }],
        alCambiar: (v) => ((cap.auto = v === 'on'), repintar())
      })
    }),
    cap.auto
      ? h(
          'div',
          { class: 'cx-fila-campos', style: { alignItems: 'flex-start' } },
          ui.campo({ etiqueta: 'Minimum capacity units', control: ui.entrada({ tipo: 'number', valor: cap.min, min: 1, alCambiar: (v) => ((cap.min = v), repintar(true)) }) }),
          ui.campo({ etiqueta: 'Maximum capacity units', control: ui.entrada({ tipo: 'number', valor: cap.max, min: 1, alCambiar: (v) => ((cap.max = v), repintar(true)) }) }),
          ui.campo({ etiqueta: 'Target utilization (%)', control: ui.entrada({ tipo: 'number', valor: cap.objetivo, min: 20, max: 90, alCambiar: (v) => (cap.objetivo = v) }), restriccion: 'Between 20 and 90 percent.' })
        )
      : ui.campo({ etiqueta: 'Provisioned capacity units', control: ui.entrada({ tipo: 'number', valor: cap.unidades, min: 1, alCambiar: (v) => ((cap.unidades = v), repintar(true)) }), restriccion: 'Between 1 and 40,000.' })
  );
}

const capacidadNueva = () => ({ auto: true, min: '1', max: '10', objetivo: '70', unidades: '5' });

/** Lo que espera el modelo a partir del formulario de capacidad. */
function parametrosCapacidad(f) {
  if (f.modo === 'PAY_PER_REQUEST') return { modo: 'PAY_PER_REQUEST' };
  const auto = (c) => (c.auto ? { min: Number(c.min), max: Number(c.max), objetivo: Number(c.objetivo) } : null);
  return {
    modo: 'PROVISIONED',
    lectura: Number(f.lectura.unidades),
    escritura: Number(f.escritura.unidades),
    autoescalado: { lectura: auto(f.lectura), escritura: auto(f.escritura) }
  };
}

function estimacion(f) {
  if (f.modo === 'PAY_PER_REQUEST') return h('p', { class: 'cx-texto-sec' }, 'On-demand: you pay per request for the data reads and writes your application performs on your tables. No capacity planning is required.');
  const u = (c) => Number(c.auto ? c.min : c.unidades) || 0;
  const costo = costoProvisionado({ lectura: u(f.lectura), escritura: u(f.escritura), clase: f.clase });
  return ui.pares(
    [
      { etiqueta: 'Total read capacity units', valor: String(u(f.lectura)) },
      { etiqueta: 'Total write capacity units', valor: String(u(f.escritura)) },
      { etiqueta: 'Region', valor: 'us-east-1' },
      { etiqueta: 'Estimated cost', valor: `$${costo.toFixed(2)} / month` }
    ],
    { columnas: 4 }
  );
}

/** Capacity mode (On-demand / Provisioned) con sus bloques; lo comparten Create table y Edit capacity. */
function seccionCapacidad(cx, f, repintar) {
  const zonaCosto = ui.region(() => estimacion(f));
  const rep = (soloCosto) => (soloCosto ? zonaCosto.repintar() : repintar());
  return [
    ui.campo({
      etiqueta: 'Capacity mode',
      info: 'dyn-capacidad',
      cx,
      control: ui.tarjetas({
        columnas: 2,
        valor: f.modo,
        opciones: [
          { valor: 'PAY_PER_REQUEST', etiqueta: 'On-demand', descripcion: 'Simplify billing by paying for the actual reads and writes your application performs.' },
          { valor: 'PROVISIONED', etiqueta: 'Provisioned', descripcion: 'Manage and optimize your costs by allocating read/write capacity in advance.' }
        ],
        alCambiar: (v) => ((f.modo = v), repintar())
      })
    }),
    f.modo === 'PROVISIONED' ? [bloqueCapacidad(cx, f.lectura, 'Read capacity', rep), bloqueCapacidad(cx, f.escritura, 'Write capacity', rep)] : null,
    h('div', { class: 'cx-bloque' }, h('div', { class: 'cx-bloque__titulo' }, 'Estimated read/write capacity cost'), zonaCosto)
  ];
}

/** El formulario de un índice global (modal de Create table y página Create index). */
function formularioIndice(cx, g, repintar) {
  const sugerir = () => {
    if (g.nombreTocado) return;
    g.nombre = [g.pk.nombre, g.sk.nombre].filter((x) => x.trim()).join('-') + (g.pk.nombre.trim() ? '-index' : '');
  };
  const zonaNombre = ui.region(() =>
    ui.campo({
      etiqueta: 'Index name',
      error: g.errores.nombre,
      control: ui.entrada({ valor: g.nombre, alCambiar: (v) => ((g.nombre = v), (g.nombreTocado = true)) }),
      restriccion: RESTRICCION_NOMBRE
    })
  );
  const llave = (ll, etiqueta, desc, err) =>
    ui.campo({
      etiqueta,
      descripcion: desc,
      error: err,
      control: h(
        'div',
        { class: 'cx-fila-campos' },
        h('div', { style: { flex: '1 1 260px' } }, ui.entrada({ valor: ll.nombre, placeholder: 'Enter the attribute name', alCambiar: (v) => ((ll.nombre = v), sugerir(), zonaNombre.repintar()) })),
        h('div', { style: { flex: '0 0 140px' } }, ui.selector({ opciones: TIPOS_LLAVE, valor: ll.tipo, alCambiar: (v) => (ll.tipo = v) }))
      ),
      restriccion: '1 to 255 characters and case sensitive.'
    });
  return h(
    'div',
    { class: 'cx-form' },
    llave(g.pk, 'Partition key', 'The partition key for the index.', g.errores.pk),
    llave(g.sk, h('span', {}, 'Sort key', h('i', {}, ' - optional')), 'The sort key for the index.'),
    zonaNombre,
    ui.campo({
      etiqueta: 'Attribute projections',
      info: 'dyn-gsi',
      cx,
      descripcion: 'A projection is the set of attributes that is copied from a table into a secondary index.',
      control: ui.tarjetas({
        columnas: 3,
        valor: g.proyeccion,
        opciones: [
          { valor: 'ALL', etiqueta: 'All', descripcion: 'All of the table attributes are projected into the index.' },
          { valor: 'KEYS_ONLY', etiqueta: 'Only keys', descripcion: 'Only the index and primary keys are projected into the index.' },
          { valor: 'INCLUDE', etiqueta: 'Include', descripcion: 'Only the specified attributes are projected into the index.' }
        ],
        alCambiar: (v) => ((g.proyeccion = v), repintar())
      })
    }),
    g.proyeccion === 'INCLUDE'
      ? ui.campo({ etiqueta: 'Projected attributes', descripcion: 'Separate attribute names with commas.', control: ui.entrada({ valor: g.atributos, placeholder: 'puntaje, nivel', alCambiar: (v) => (g.atributos = v) }) })
      : null
  );
}

const indiceNuevo = () => ({ pk: { nombre: '', tipo: 'S' }, sk: { nombre: '', tipo: 'S' }, nombre: '', nombreTocado: false, proyeccion: 'ALL', atributos: '', errores: {} });

/** Revisa en el navegador lo que la consola revisa (campos vacíos) y arma el índice para el modelo. */
function indiceParaModelo(g) {
  g.errores = {};
  if (!g.pk.nombre.trim()) g.errores.pk = 'Partition key is required.';
  if (!g.nombre.trim()) g.errores.nombre = 'Index name is required.';
  else if (!NOMBRE_VALIDO.test(g.nombre.trim())) g.errores.nombre = 'Index name must be between 3 and 255 characters long, and can contain only letters, numbers, underscores (_), hyphens (-), and periods (.).';
  if (Object.keys(g.errores).length) return null;
  return {
    nombre: g.nombre.trim(),
    pk: { nombre: g.pk.nombre.trim(), tipo: g.pk.tipo },
    sk: g.sk.nombre.trim() ? { nombre: g.sk.nombre.trim(), tipo: g.sk.tipo } : null,
    proyeccion: g.proyeccion,
    atributos: g.atributos.split(',').map((a) => a.trim()).filter(Boolean)
  };
}

function opcionesKms(cx) {
  return (cx.estado.kms?.llaves ?? [])
    .filter((k) => k && !k.administradaPorAws && k.estado !== 'PendingDeletion')
    .map((k) => ({ valor: k.arn ?? k.id, etiqueta: k.alias ? `${k.alias}` : k.id, descripcion: k.id }));
}

function crearTablaPagina(cx) {
  cx.migas([migaBase, { texto: 'Tables', ruta: 'dynamodb/tablas' }, { texto: 'Create table' }]);
  const f = {
    nombre: '',
    pk: { nombre: '', tipo: 'S' },
    sk: { nombre: '', tipo: 'S' },
    ajustes: 'default',
    clase: 'STANDARD',
    modo: 'PAY_PER_REQUEST',
    lectura: capacidadNueva(),
    escritura: capacidadNueva(),
    indices: [],
    cifrado: 'OWNED',
    llaveKms: null,
    proteccion: false,
    etiquetas: [],
    errores: {}
  };

  const llave = (ll, etiqueta, desc, err, placeholder) =>
    ui.campo({
      etiqueta,
      info: 'dyn-llaves',
      cx,
      descripcion: desc,
      error: err,
      control: h(
        'div',
        { class: 'cx-fila-campos' },
        h('div', { style: { flex: '1 1 260px' } }, ui.entrada({ valor: ll.nombre, placeholder, etiquetaAccesible: typeof etiqueta === 'string' ? etiqueta : 'Sort key', alCambiar: (v) => (ll.nombre = v) })),
        h('div', { style: { flex: '0 0 140px' } }, ui.selector({ opciones: TIPOS_LLAVE, valor: ll.tipo, etiquetaAccesible: 'Type', alCambiar: (v) => (ll.tipo = v) }))
      ),
      restriccion: '1 to 255 characters and case sensitive.'
    });

  const detalles = ui.region(() =>
    ui.contenedor({
      titulo: 'Table details',
      info: 'dyn-tabla',
      cx,
      descripcion: 'DynamoDB is a schemaless database that requires only a table name and a primary key when you create the table.',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({
          etiqueta: 'Table name',
          descripcion: 'This will be used to identify your table.',
          error: f.errores.nombre,
          control: ui.entrada({ valor: f.nombre, placeholder: 'Enter a name for your table', etiquetaAccesible: 'Table name', alCambiar: (v) => (f.nombre = v) }),
          restriccion: RESTRICCION_NOMBRE
        }),
        llave(f.pk, 'Partition key', 'The partition key is part of the table\'s primary key. It is a hash value that is used to retrieve items from your table and allocate data across hosts for scalability and availability.', f.errores.pk, 'Enter the partition key name'),
        llave(f.sk, h('span', {}, 'Sort key', h('i', {}, ' - optional')), 'You can use a sort key as the second part of a table\'s primary key. The sort key allows you to sort or search among all items sharing the same partition key.', null, 'Enter the sort key name')
      )
    })
  );

  const ajustes = ui.region(() => {
    const tablaDefecto = () =>
      h(
        'table',
        { class: 'cx-tabla__tabla' },
        h('thead', {}, h('tr', {}, ['Setting', 'Value', 'Editable after creation'].map((c) => h('th', {}, h('span', { class: 'cx-tabla__orden' }, c))))),
        h(
          'tbody',
          {},
          [
            ['Table class', 'DynamoDB Standard', 'Yes'],
            ['Capacity mode', 'On-demand', 'Yes'],
            ['Maximum read capacity units', '-', 'Yes'],
            ['Maximum write capacity units', '-', 'Yes'],
            ['Local secondary indexes', '-', 'No'],
            ['Global secondary indexes', '-', 'Yes'],
            ['Encryption key management', 'Owned by Amazon DynamoDB', 'Yes'],
            ['Deletion protection', 'Off', 'Yes'],
            ['Resource-based policy', 'Not active', 'Yes']
          ].map((fila) => h('tr', {}, fila.map((c) => h('td', { style: { paddingLeft: '20px' } }, c))))
        )
      );
    return [
      ui.contenedor({
        titulo: 'Table settings',
        info: 'dyn-ajustes',
        cx,
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.tarjetas({
            columnas: 2,
            valor: f.ajustes,
            opciones: [
              { valor: 'default', etiqueta: 'Default settings', descripcion: 'The fastest way to create your table. You can modify most of these settings after your table has been created. To modify the settings, choose "Customize settings".' },
              { valor: 'custom', etiqueta: 'Customize settings', descripcion: 'Use these advanced features to make DynamoDB work better for your needs.' }
            ],
            alCambiar: (v) => ((f.ajustes = v), ajustes.repintar())
          }),
          f.ajustes === 'default' ? h('div', {}, h('h3', { class: 'cx-h2', style: { margin: '8px 0' } }, 'Default table settings'), h('p', { class: 'cx-texto-sec' }, 'These are the default settings for your new table. You can change some of these settings after creating the table.'), tablaDefecto()) : null
        )
      }),
      f.ajustes === 'custom' ? personalizado() : null
    ];
  }, { clase: 'cx-pagina' });

  function personalizado() {
    const tablaIndices = h(
      'table',
      { class: 'cx-tabla__tabla' },
      h('thead', {}, h('tr', {}, ['Name', 'Partition key', 'Sort key', 'Projected attributes', ''].map((c) => h('th', {}, h('span', { class: 'cx-tabla__orden' }, c))))),
      h(
        'tbody',
        {},
        f.indices.length
          ? f.indices.map((g, i) =>
              h('tr', {}, h('td', { style: { paddingLeft: '20px' } }, g.nombre), h('td', {}, llaveTexto(g.pk)), h('td', {}, llaveTexto(g.sk)), h('td', {}, PROYECCION_TEXTO[g.proyeccion]), h('td', {}, ui.boton('Delete', { variante: 'texto', alClic: () => (f.indices.splice(i, 1), ajustes.repintar()) })))
            )
          : h('tr', {}, h('td', { class: 'cx-tabla__vacia', colspan: '5' }, h('b', {}, 'No global secondary indexes'), h('div', {}, 'You can create global secondary indexes now or after the table is created.')))
      )
    );
    const kms = opcionesKms(cx);
    return [
      ui.contenedor({
        titulo: 'Table class',
        info: 'dyn-clase',
        cx,
        descripcion: 'Choose a table class that optimizes for your cost and performance needs.',
        cuerpo: ui.tarjetas({
          columnas: 2,
          valor: f.clase,
          opciones: [
            { valor: 'STANDARD', etiqueta: 'DynamoDB Standard', descripcion: 'The default general-purpose table class. Recommended for the vast majority of tables that store frequently accessed data, with throughput (reads and writes) as the dominant table cost.' },
            { valor: 'STANDARD_INFREQUENT_ACCESS', etiqueta: 'DynamoDB Standard-IA', descripcion: 'Recommended for tables that store data that is infrequently accessed, with storage as the dominant table cost.' }
          ],
          alCambiar: (v) => ((f.clase = v), ajustes.repintar())
        })
      }),
      ui.contenedor({ titulo: 'Read/write capacity settings', info: 'dyn-capacidad', cx, cuerpo: h('div', { class: 'cx-form' }, seccionCapacidad(cx, f, () => ajustes.repintar())) }),
      ui.contenedor({
        titulo: 'Secondary indexes',
        info: 'dyn-gsi',
        cx,
        contador: f.indices.length,
        descripcion: 'You can create two types of secondary indexes: global and local. Local secondary indexes can only be created when you create the table.',
        acciones: [ui.boton('Create local index', { desactivado: true, titulo: 'No disponible en este simulador' }), ui.boton('Create global index', { alClic: () => modalIndice() })],
        sinRelleno: true,
        cuerpo: tablaIndices
      }),
      ui.contenedor({
        titulo: 'Encryption at rest',
        info: 'dyn-cifrado',
        cx,
        descripcion: 'All user data stored in Amazon DynamoDB is fully encrypted at rest. By default, DynamoDB manages the encryption key, and you are not charged any fee for using it.',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.campo({
            etiqueta: 'Encryption key management',
            control: ui.tarjetas({
              columnas: 3,
              valor: f.cifrado,
              opciones: [
                { valor: 'OWNED', etiqueta: 'Owned by Amazon DynamoDB', descripcion: 'The AWS KMS key is owned and managed by DynamoDB. You are not charged an additional fee for using this key.' },
                { valor: 'AWS_MANAGED', etiqueta: 'AWS managed key', descripcion: 'Key alias: aws/dynamodb. The key is stored in your account and is managed by AWS Key Management Service (AWS KMS). AWS KMS charges apply.' },
                { valor: 'CUSTOMER_MANAGED', etiqueta: 'Stored in your account, and owned and managed by you', descripcion: 'Customer managed key. The key is stored in your account and is created, owned, and managed by you. You have full control over the KMS key. AWS KMS charges apply.' }
              ],
              alCambiar: (v) => ((f.cifrado = v), ajustes.repintar())
            })
          }),
          f.cifrado === 'CUSTOMER_MANAGED'
            ? ui.campo({
                etiqueta: 'KMS key ARN or alias',
                error: f.errores.kms,
                control: ui.selector({
                  opciones: kms,
                  valor: f.llaveKms,
                  filtrar: true,
                  placeholder: 'Choose an AWS KMS key or enter an ARN',
                  vacio: 'No customer managed keys. Create one in AWS KMS or enter an ARN.',
                  opcionLibre: (texto) => (texto.startsWith('arn:aws:kms:') || texto.startsWith('alias/') ? { valor: texto, etiqueta: texto } : null),
                  mostrarLibre: (v) => ({ valor: v, etiqueta: v }),
                  alCambiar: (v) => (f.llaveKms = v)
                })
              })
            : null
        )
      }),
      ui.contenedor({
        titulo: 'Deletion protection',
        info: 'dyn-proteccion',
        cx,
        cuerpo: ui.casilla({ etiqueta: 'Turn on deletion protection', descripcion: 'Protects the table from being deleted unintentionally.', marcada: f.proteccion, alCambiar: (v) => (f.proteccion = v) })
      }),
      ui.contenedor({ titulo: 'Resource-based policy', descripcion: 'Resource-based policies are not available in this simulator.', cuerpo: ui.boton('Create policy', { desactivado: true }) })
    ];
  }

  function modalIndice() {
    const g = indiceNuevo();
    const zona = ui.region(() => formularioIndice(cx, g, () => zona.repintar()));
    const m = cx.modal({
      titulo: 'Global index details',
      ancho: 'grande',
      contenido: zona,
      pie: [
        ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
        ui.boton('Create index', {
          variante: 'primario',
          alClic: () => {
            const ind = indiceParaModelo(g);
            if (!ind) return zona.repintar();
            if (f.indices.some((x) => x.nombre === ind.nombre)) {
              g.errores.nombre = 'An index with this name already exists.';
              return zona.repintar();
            }
            f.indices.push(ind);
            m.cerrar();
            ajustes.repintar();
          }
        })
      ]
    });
  }

  const etiquetas = ui.contenedor({
    titulo: 'Tags',
    descripcion: 'Tags are pairs of keys and optional values, that you can assign to AWS resources. You can use tags to control access to your resources or track your AWS spending.',
    cuerpo: ui.editorEtiquetas({ filas: f.etiquetas })
  });

  function crear() {
    f.errores = {};
    const nombre = f.nombre.trim();
    if (!nombre) f.errores.nombre = 'Table name is required.';
    else if (!NOMBRE_VALIDO.test(nombre)) f.errores.nombre = 'Table name must be between 3 and 255 characters long, and can contain only letters, numbers, underscores (_), hyphens (-), and periods (.).';
    if (!f.pk.nombre.trim()) f.errores.pk = 'Partition key is required.';
    if (Object.keys(f.errores).length) return detalles.repintar();
    const custom = f.ajustes === 'custom';
    const r = cx.hacer({ servicio: 'DynamoDB', accion: 'CreateTable', error: `Failed to create the ${nombre} table` }, (e) =>
      crearTablaDynamo(e, {
        nombre,
        pk: { nombre: f.pk.nombre.trim(), tipo: f.pk.tipo },
        sk: f.sk.nombre.trim() ? { nombre: f.sk.nombre.trim(), tipo: f.sk.tipo } : null,
        ...(custom ? parametrosCapacidad(f) : { modo: 'PAY_PER_REQUEST' }),
        clase: custom ? f.clase : 'STANDARD',
        cifrado: custom ? f.cifrado : 'OWNED',
        llaveKms: f.llaveKms,
        proteccion: custom && f.proteccion,
        indices: custom ? f.indices : [],
        etiquetas: f.etiquetas
      })
    );
    if (!r.ok) return;
    const id = cx.flash({ tipo: 'progreso', texto: `Creating the ${r.valor.nombre} table. It will be available for use shortly.` });
    cx.memoria.dynCreando = { nombre: r.valor.nombre, id };
    cx.ir('dynamodb/tablas');
  }

  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Create table', info: 'dyn-tabla', cx }),
    detalles,
    ajustes,
    etiquetas,
    ui.pieFormulario({ cancelar: () => cx.ir('dynamodb/tablas'), enviar: crear, textoEnviar: 'Create table' })
  );
}

/* ========================================================== detalle de tabla */

function menuTabla(cx, t) {
  const viva = t.estado !== 'DELETING';
  const ir = (sub) => () => cx.ir(`dynamodb/tablas/${t.nombre}/${sub}`);
  return ui.menuBoton('Actions', () => [
    { texto: 'Edit capacity', escribe: true, desactivado: !viva, alClic: ir('capacidad') },
    { texto: 'Update table class', escribe: true, desactivado: !viva, alClic: ir('capacidad') },
    { texto: 'Create index', escribe: true, desactivado: !viva, alClic: ir('indice') },
    { texto: 'Create replica', escribe: true, desactivado: !viva, alClic: ir('replica') },
    { texto: 'Create backup', escribe: true, desactivado: !viva, alClic: () => ((cx.memoria.dynRespaldoDe = t.nombre), cx.ir('dynamodb/respaldos/crear')) },
    { texto: 'Restore to point in time', escribe: true, desactivado: !viva || !t.pitr, alClic: ir('restaurar') },
    '-',
    { texto: 'Delete table', escribe: true, desactivado: !viva, alClic: () => borrarTablas(cx, [t]) }
  ]);
}

function detalleTabla(cx, { nombre }) {
  cx.migas([migaBase, { texto: 'Tables', ruta: 'dynamodb/tablas' }, { texto: nombre }]);
  vigilarCreacion(cx);
  if (!tablaDe(cx, nombre)) return noExisteTabla(cx, nombre);
  const st = { pestana: cx.memoria.dynPestana ?? 'resumen' };
  cx.memoria.dynPestana = null;
  return cx.vivo(() => {
    const t = tablaDe(cx, nombre);
    if (!t) return noExisteTabla(cx, nombre);
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({
        titulo: t.nombre,
        info: 'dyn-tabla',
        cx,
        acciones: [ui.botonRefrescar(() => cx.refrescar()), menuTabla(cx, t), ui.boton('Explore table items', { desactivado: t.estado === 'CREATING' || t.estado === 'DELETING', alClic: () => cx.ir(`dynamodb/explorar/${t.nombre}`) })]
      }),
      t.estado === 'CREATING' ? ui.alerta({ tipo: 'info', titulo: t.restauradaDe ? 'Restoring the table' : 'Creating the table', contenido: 'The table will be available for use shortly.' }) : null,
      t.estado === 'DELETING' ? ui.alerta({ tipo: 'aviso', titulo: 'Deleting the table', contenido: 'This table is being deleted.' }) : null,
      ui.pestanas({
        activa: st.pestana,
        alCambiar: (p) => (st.pestana = p),
        pestanas: [
          { id: 'resumen', texto: 'Overview', contenido: () => pestanaResumen(cx, t) },
          { id: 'indices', texto: 'Indexes', contenido: () => pestanaIndices(cx, t) },
          { id: 'monitor', texto: 'Monitor', contenido: () => pestanaMonitor(cx, t) },
          { id: 'global', texto: 'Global tables', contenido: () => pestanaGlobal(cx, t) },
          { id: 'respaldos', texto: 'Backups', contenido: () => pestanaRespaldos(cx, t) },
          { id: 'streams', texto: 'Exports and streams', contenido: () => pestanaStreams(cx, t) },
          { id: 'mas', texto: 'Additional settings', contenido: () => pestanaAdicional(cx, t) }
        ]
      })
    );
  });
}

function noExisteTabla(cx, nombre) {
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.alerta({ tipo: 'error', titulo: 'Table not found', contenido: `Requested resource not found: Table: ${nombre} not found`, accion: ui.boton('View tables', { alClic: () => cx.ir('dynamodb/tablas') }) })
  );
}

function pestanaResumen(cx, t) {
  const bytes = bytesTabla(t);
  const promedio = t.items.length ? Math.round(bytes / t.items.length) : 0;
  return [
    ui.contenedor({
      titulo: 'General information',
      info: 'dyn-tabla',
      cx,
      cuerpo: ui.pares(
        [
          { etiqueta: 'Partition key', info: 'dyn-llaves', valor: llaveTexto(t.pk) },
          { etiqueta: 'Sort key', valor: llaveTexto(t.sk) },
          { etiqueta: 'Capacity mode', info: 'dyn-capacidad', valor: t.modo === 'PAY_PER_REQUEST' ? 'On-demand' : 'Provisioned' },
          { etiqueta: 'Table status', valor: estadoTabla(t) },
          { etiqueta: 'Alarms', valor: ui.estado('exito', 'No active alarms') },
          { etiqueta: 'Point-in-time recovery (PITR)', info: 'dyn-respaldos', valor: t.pitr ? ui.estado('exito', 'On') : ui.estado('inactivo', 'Off') },
          { etiqueta: 'Deletion protection', info: 'dyn-proteccion', valor: t.proteccion ? ui.estado('exito', 'On') : ui.estado('inactivo', 'Off') },
          { etiqueta: 'Table class', valor: CLASE_TEXTO[t.clase] },
          { etiqueta: 'Resource-based policy', valor: 'Not active' },
          { etiqueta: 'Global table version', valor: t.replicas.length ? 'Version 2019.11.21 (Current)' : '–' },
          { etiqueta: 'Creation date', valor: ui.fecha(t.creado) },
          { etiqueta: 'Amazon Resource Name (ARN)', valor: ui.copiable(t.arn) }
        ],
        { columnas: 3, cx }
      )
    }),
    ui.contenedor({
      titulo: 'Items summary',
      descripcion: 'DynamoDB updates the following information approximately every six hours. In this simulator it is always up to date.',
      acciones: ui.boton('Get live item count', { desactivado: t.estado !== 'ACTIVE', alClic: () => cx.flash({ tipo: 'exito', texto: `The ${t.nombre} table has ${t.items.length} items.` }) }),
      cuerpo: ui.pares(
        [
          { etiqueta: 'Item count', valor: String(t.items.length) },
          { etiqueta: 'Table size', valor: tamanoTexto(bytes) },
          { etiqueta: 'Average item size', valor: tamanoTexto(promedio) }
        ],
        { columnas: 3 }
      )
    }),
    t.restauradaDe ? ui.alerta({ tipo: 'info', titulo: 'Restored table', contenido: `This table was restored from ${t.restauradaDe}.` }) : null
  ];
}

function pestanaIndices(cx, t) {
  return ui.tabla(cx, {
    titulo: 'Global secondary indexes',
    info: 'dyn-gsi',
    variante: 'contenedor',
    filas: () => tablaDe(cx, t.nombre)?.indices ?? [],
    clave: (i) => i.nombre,
    seleccion: 'unica',
    filtro: 'Find indexes',
    columnas: [
      { titulo: 'Name', valor: (i) => i.nombre },
      { titulo: 'Status', valor: (i) => estadoSimple(i.estado) },
      { titulo: 'Partition key', valor: (i) => llaveTexto(i.pk) },
      { titulo: 'Sort key', valor: (i) => llaveTexto(i.sk) },
      { titulo: 'Read capacity', valor: () => modoTexto(t, 'lectura') },
      { titulo: 'Write capacity', valor: () => modoTexto(t, 'escritura') },
      { titulo: 'Projected attributes', valor: (i) => (i.proyeccion === 'INCLUDE' ? `Include: ${i.atributos.join(', ')}` : PROYECCION_TEXTO[i.proyeccion]) },
      { titulo: 'Item count', valor: (i) => String(t.items.filter((x) => x[i.pk.nombre] && (!i.sk || x[i.sk.nombre])).length) }
    ],
    acciones: (sel) => [
      ui.boton('Delete', {
        escribe: true,
        desactivado: sel.length !== 1,
        alClic: () =>
          cx.confirmar({
            titulo: `Delete index ${sel[0].nombre}?`,
            palabra: 'confirm',
            contenido: h('p', {}, 'Deleting this index permanently removes it from the table. Queries that use this index will fail.'),
            aceptar: () => {
              const r = cx.hacer({ servicio: 'DynamoDB', accion: 'UpdateTable', error: 'Failed to delete the index' }, (e) => eliminarIndiceDynamo(e, t.nombre, sel[0].nombre));
              if (r.ok) cx.flash({ tipo: 'exito', texto: `The ${sel[0].nombre} index is being deleted.` });
            }
          })
      }),
      ui.boton('Create index', { escribe: true, alClic: () => cx.ir(`dynamodb/tablas/${t.nombre}/indice`) })
    ],
    vacio: {
      titulo: 'No global secondary indexes',
      texto: 'Use an index to query your data by an attribute that is not the primary key.',
      get accion() {
        return ui.boton('Create index', { escribe: true, alClic: () => cx.ir(`dynamodb/tablas/${t.nombre}/indice`) });
      }
    }
  });
}

function pestanaMonitor(cx, t) {
  return [
    ui.contenedor({
      titulo: 'CloudWatch alarms',
      contador: 0,
      acciones: ui.boton('Create alarm', { desactivado: !cx.servicioDe('cloudwatch') || cx.servicioDe('cloudwatch').proximamente, alClic: () => cx.ir('cloudwatch') }),
      cuerpo: h('p', { class: 'cx-texto-sec' }, 'No alarms. Create an alarm in CloudWatch with the AWS/DynamoDB namespace and the TableName dimension.')
    }),
    ui.contenedor({
      titulo: 'Capacity consumed',
      info: 'dyn-capacidad',
      cx,
      descripcion: 'Total since the table was created (in AWS you see these values in CloudWatch: ConsumedReadCapacityUnits and ConsumedWriteCapacityUnits).',
      cuerpo: ui.pares(
        [
          { etiqueta: 'Read capacity units consumed', valor: String(t.consumo?.lecturas ?? 0) },
          { etiqueta: 'Write capacity units consumed', valor: String(t.consumo?.escrituras ?? 0) },
          { etiqueta: 'Provisioned read capacity', valor: t.modo === 'PAY_PER_REQUEST' ? 'On-demand' : String(t.capacidad.lectura) },
          { etiqueta: 'Provisioned write capacity', valor: t.modo === 'PAY_PER_REQUEST' ? 'On-demand' : String(t.capacidad.escritura) }
        ],
        { columnas: 4 }
      )
    })
  ];
}

function pestanaGlobal(cx, t) {
  return [
    ui.alerta({
      tipo: 'info',
      titulo: 'Global tables',
      contenido: 'A global table replicates your data across AWS Regions. Each replica stores the same set of data items. En el simulador la réplica se ve, pero solo se usa la tabla de us-east-1.'
    }),
    ui.tabla(cx, {
      titulo: 'Replicas',
      info: 'dyn-global',
      variante: 'contenedor',
      filas: () => {
        const x = tablaDe(cx, t.nombre);
        return x ? [{ region: 'us-east-1', estado: x.estado === 'ACTIVE' ? 'ACTIVE' : 'CREATING', origen: true }, ...x.replicas] : [];
      },
      clave: (r) => r.region,
      seleccion: 'unica',
      filtro: false,
      columnas: [
        { titulo: 'Region', valor: (r) => `${r.origen ? 'US East (N. Virginia)' : REGIONES_DYNAMO.find(([c]) => c === r.region)?.[1] ?? r.region} ${r.region}` },
        { titulo: 'Status', valor: (r) => estadoSimple(r.estado) },
        { titulo: 'Replication', valor: (r) => (r.origen ? 'This Region' : 'Asynchronous') },
        { titulo: 'Write capacity mode', valor: () => modoTexto(t, 'escritura') }
      ],
      acciones: (sel) => [
        ui.boton('Delete replica', {
          escribe: true,
          desactivado: sel.length !== 1 || sel[0].origen || sel[0].estado !== 'ACTIVE',
          alClic: () =>
            cx.confirmar({
              titulo: `Delete replica in ${sel[0].region}?`,
              palabra: 'delete',
              contenido: h('p', {}, 'The replica table and all of its data in this Region will be deleted.'),
              aceptar: () => {
                const r = cx.hacer({ servicio: 'DynamoDB', accion: 'UpdateTable', error: 'Failed to delete the replica' }, (e) => eliminarReplicaDynamo(e, t.nombre, sel[0].region));
                if (r.ok) cx.flash({ tipo: 'exito', texto: `The replica in ${sel[0].region} is being deleted.` });
              }
            })
        }),
        ui.boton('Create replica', { escribe: true, alClic: () => cx.ir(`dynamodb/tablas/${t.nombre}/replica`) })
      ]
    })
  ];
}

function pestanaRespaldos(cx, t) {
  return [
    ui.contenedor({
      titulo: 'Point-in-time recovery (PITR)',
      info: 'dyn-respaldos',
      cx,
      descripcion: 'Point-in-time recovery provides continuous backups of your DynamoDB table data. You can restore the table to any point in time during the recovery period.',
      acciones: [
        ui.boton('Restore', { escribe: true, desactivado: !t.pitr, alClic: () => cx.ir(`dynamodb/tablas/${t.nombre}/restaurar`) }),
        ui.boton('Edit', { escribe: true, alClic: () => cx.ir(`dynamodb/tablas/${t.nombre}/pitr`) })
      ],
      cuerpo: ui.pares(
        [
          { etiqueta: 'Status', valor: t.pitr ? ui.estado('exito', 'On') : ui.estado('inactivo', 'Off') },
          { etiqueta: 'Backup recovery period', valor: t.pitr ? `${t.pitr.dias} days` : '–' },
          { etiqueta: 'Earliest restore date', valor: t.pitr ? ui.fecha(t.pitr.desde) : '–' },
          { etiqueta: 'Latest restore date', valor: t.pitr ? ui.fecha(new Date().toISOString()) : '–' }
        ],
        { columnas: 4 }
      )
    }),
    tablaRespaldos(cx, { tabla: t.nombre, variante: 'contenedor' })
  ];
}

function pestanaStreams(cx, t) {
  return [
    ui.contenedor({
      titulo: 'Exports to S3',
      descripcion: 'Export your table data to an Amazon S3 bucket. No disponible en este simulador.',
      acciones: ui.boton('Export to S3', { desactivado: true }),
      cuerpo: h('p', { class: 'cx-texto-sec' }, 'No exports.')
    }),
    ui.contenedor({
      titulo: 'DynamoDB stream details',
      info: 'dyn-streams',
      cx,
      descripcion: 'Capture item-level changes in your table, and push the changes to a DynamoDB stream. You then can access the change information through the DynamoDB Streams API.',
      acciones: t.stream
        ? ui.boton('Turn off', {
            escribe: true,
            alClic: () => {
              const r = cx.hacer({ servicio: 'DynamoDB', accion: 'UpdateTable', error: 'Failed to turn off the stream' }, (e) => editarStreamDynamo(e, t.nombre, null));
              if (r.ok) cx.flash({ tipo: 'exito', texto: 'DynamoDB stream turned off.' });
            }
          })
        : ui.boton('Turn on', { escribe: true, alClic: () => modalStream(cx, t) }),
      cuerpo: ui.pares(
        [
          { etiqueta: 'Stream status', valor: t.stream ? ui.estado('exito', 'On') : ui.estado('inactivo', 'Off') },
          { etiqueta: 'View type', valor: t.stream ? STREAM_TEXTO[t.stream] : '–' },
          { etiqueta: 'Latest stream ARN', valor: t.streamArn ? ui.copiable(t.streamArn) : '–' }
        ],
        { columnas: 3 }
      )
    }),
    ui.contenedor({ titulo: 'Amazon Kinesis data stream details', descripcion: 'No disponible en este simulador.', acciones: ui.boton('Turn on', { desactivado: true }), cuerpo: h('p', { class: 'cx-texto-sec' }, 'Off') })
  ];
}

function modalStream(cx, t) {
  const f = { tipo: 'NEW_AND_OLD_IMAGES' };
  const m = cx.modal({
    titulo: 'Turn on DynamoDB stream',
    contenido: ui.campo({
      etiqueta: 'View type',
      descripcion: 'Choose what information is written to the stream whenever data in the table is modified.',
      control: ui.radios({
        valor: f.tipo,
        opciones: [
          { valor: 'KEYS_ONLY', etiqueta: 'Key attributes only', descripcion: 'Only the key attributes of the modified item.' },
          { valor: 'NEW_IMAGE', etiqueta: 'New image', descripcion: 'The entire item, as it appears after it was modified.' },
          { valor: 'OLD_IMAGE', etiqueta: 'Old image', descripcion: 'The entire item, as it appeared before it was modified.' },
          { valor: 'NEW_AND_OLD_IMAGES', etiqueta: 'New and old images', descripcion: 'Both the new and the old images of the item.' }
        ],
        alCambiar: (v) => (f.tipo = v)
      })
    }),
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Turn on stream', {
        variante: 'primario',
        alClic: () => {
          const r = cx.hacer({ servicio: 'DynamoDB', accion: 'UpdateTable', error: 'Failed to turn on the stream' }, (e) => editarStreamDynamo(e, t.nombre, f.tipo));
          if (r.ok) {
            m.cerrar();
            cx.flash({ tipo: 'exito', texto: 'DynamoDB stream turned on.' });
          }
        }
      })
    ]
  });
}

function pestanaAdicional(cx, t) {
  const proteccion = () => {
    const activar = !t.proteccion;
    const hacer = () => {
      const r = cx.hacer({ servicio: 'DynamoDB', accion: 'UpdateTable', error: 'Failed to update deletion protection' }, (e) => editarProteccionDynamo(e, t.nombre, activar));
      if (r.ok) cx.flash({ tipo: 'exito', texto: `Deletion protection turned ${activar ? 'on' : 'off'} for the ${t.nombre} table.` });
    };
    if (activar) return hacer();
    cx.confirmar({ titulo: 'Turn off deletion protection?', textoBoton: 'Confirm', contenido: h('p', {}, `The ${t.nombre} table can be deleted after you turn off deletion protection.`), aceptar: hacer });
  };
  return [
    ui.contenedor({
      titulo: 'Read/write capacity',
      info: 'dyn-capacidad',
      cx,
      acciones: ui.boton('Edit', { escribe: true, alClic: () => cx.ir(`dynamodb/tablas/${t.nombre}/capacidad`) }),
      cuerpo: ui.pares(
        [
          { etiqueta: 'Capacity mode', valor: t.modo === 'PAY_PER_REQUEST' ? 'On-demand' : 'Provisioned' },
          { etiqueta: 'Table class', valor: CLASE_TEXTO[t.clase] },
          { etiqueta: 'Read capacity', valor: t.modo === 'PAY_PER_REQUEST' ? '–' : t.autoescalado.lectura ? `Auto scaling: ${t.autoescalado.lectura.min} - ${t.autoescalado.lectura.max} units, ${t.autoescalado.lectura.objetivo}% target (current ${t.capacidad.lectura})` : `${t.capacidad.lectura} units` },
          { etiqueta: 'Write capacity', valor: t.modo === 'PAY_PER_REQUEST' ? '–' : t.autoescalado.escritura ? `Auto scaling: ${t.autoescalado.escritura.min} - ${t.autoescalado.escritura.max} units, ${t.autoescalado.escritura.objetivo}% target (current ${t.capacidad.escritura})` : `${t.capacidad.escritura} units` }
        ],
        { columnas: 4 }
      )
    }),
    ui.contenedor({
      titulo: 'Deletion protection',
      info: 'dyn-proteccion',
      cx,
      acciones: ui.boton(t.proteccion ? 'Turn off' : 'Turn on', { escribe: true, alClic: proteccion }),
      cuerpo: ui.pares([{ etiqueta: 'Deletion protection', valor: t.proteccion ? ui.estado('exito', 'On') : ui.estado('inactivo', 'Off') }], { columnas: 1 })
    }),
    ui.contenedor({ titulo: 'Time to Live (TTL)', descripcion: 'Automatically delete expired items. No disponible en este simulador.', acciones: ui.boton('Turn on', { desactivado: true }), cuerpo: ui.pares([{ etiqueta: 'TTL status', valor: ui.estado('inactivo', 'Off') }], { columnas: 1 }) }),
    ui.contenedor({
      titulo: 'Encryption',
      info: 'dyn-cifrado',
      cx,
      acciones: ui.boton('Manage encryption', { desactivado: true }),
      cuerpo: ui.pares(
        [
          { etiqueta: 'Key management', valor: CIFRADO_TEXTO[t.cifrado.tipo] },
          { etiqueta: 'Key ARN', valor: t.cifrado.tipo === 'AWS_MANAGED' ? 'aws/dynamodb' : t.cifrado.llave ?? '–' }
        ],
        { columnas: 2 }
      )
    }),
    ui.contenedor({
      titulo: 'Tags',
      contador: t.etiquetas.length,
      acciones: ui.boton('Manage tags', { escribe: true, alClic: () => modalEtiquetas(cx, t) }),
      sinRelleno: t.etiquetas.length > 0,
      cuerpo: t.etiquetas.length
        ? h(
            'table',
            { class: 'cx-tabla__tabla' },
            h('thead', {}, h('tr', {}, ['Key', 'Value'].map((c) => h('th', {}, h('span', { class: 'cx-tabla__orden' }, c))))),
            h('tbody', {}, t.etiquetas.map((e) => h('tr', {}, h('td', { style: { paddingLeft: '20px' } }, e.llave), h('td', {}, e.valor || '–'))))
          )
        : h('p', { class: 'cx-texto-sec' }, 'No tags associated with the resource.')
    })
  ];
}

function modalEtiquetas(cx, t) {
  const filas = t.etiquetas.map((e) => ({ ...e }));
  const m = cx.modal({
    titulo: 'Manage tags',
    ancho: 'grande',
    contenido: ui.editorEtiquetas({ filas }),
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Save changes', {
        variante: 'primario',
        alClic: () => {
          const r = cx.hacer({ servicio: 'DynamoDB', accion: 'TagResource', error: 'Failed to update tags' }, (e) => editarEtiquetasDynamo(e, t.nombre, filas));
          if (r.ok) {
            m.cerrar();
            cx.flash({ tipo: 'exito', texto: 'Tags updated successfully.' });
          }
        }
      })
    ]
  });
}

/* =================================================== páginas de una tabla */

function paginaDeTabla(cx, nombre, titulo, cuerpo) {
  cx.migas([migaBase, { texto: 'Tables', ruta: 'dynamodb/tablas' }, { texto: nombre, ruta: `dynamodb/tablas/${nombre}` }, { texto: titulo }]);
  const t = tablaDe(cx, nombre);
  if (!t) return noExisteTabla(cx, nombre);
  return cuerpo(t);
}

const volverA = (cx, t, pestana) => {
  cx.memoria.dynPestana = pestana;
  cx.ir(`dynamodb/tablas/${t.nombre}`);
};

function crearIndicePagina(cx, { nombre }) {
  return paginaDeTabla(cx, nombre, 'Create global secondary index', (t) => {
    const g = indiceNuevo();
    const zona = ui.region(() => formularioIndice(cx, g, () => zona.repintar()));
    const crear = () => {
      const ind = indiceParaModelo(g);
      if (!ind) return zona.repintar();
      const r = cx.hacer({ servicio: 'DynamoDB', accion: 'UpdateTable', error: `Failed to create the ${ind.nombre} index` }, (e) => crearIndiceDynamo(e, t.nombre, ind));
      if (!r.ok) return;
      cx.flash({ tipo: 'exito', texto: `Creating the ${ind.nombre} index. It will be available for use shortly.` });
      volverA(cx, t, 'indices');
    };
    return h(
      'div',
      { class: 'cx-pagina cx-pagina--form' },
      ui.encabezado({ titulo: 'Create global secondary index', info: 'dyn-gsi', cx, descripcion: `Table: ${t.nombre}` }),
      ui.contenedor({ titulo: 'Index details', cuerpo: zona }),
      t.modo === 'PROVISIONED' ? ui.contenedor({ titulo: 'Index capacity', cuerpo: h('p', { class: 'cx-texto-sec' }, 'Use the same capacity settings as the base table.') }) : null,
      ui.pieFormulario({ cancelar: () => volverA(cx, t, 'indices'), enviar: crear, textoEnviar: 'Create index' })
    );
  });
}

function capacidadPagina(cx, { nombre }) {
  return paginaDeTabla(cx, nombre, 'Edit read/write capacity', (t) => {
    const desde = (que) => {
      const a = t.autoescalado?.[que];
      return a ? { auto: true, min: String(a.min), max: String(a.max), objetivo: String(a.objetivo), unidades: String(t.capacidad[que] || 5) } : { ...capacidadNueva(), auto: t.modo !== 'PROVISIONED', unidades: String(t.capacidad[que] || 5) };
    };
    const f = { modo: t.modo, clase: t.clase, lectura: desde('lectura'), escritura: desde('escritura') };
    const zona = ui.region(() =>
      h(
        'div',
        { class: 'cx-pagina' },
        ui.contenedor({
          titulo: 'Table class',
          info: 'dyn-clase',
          cx,
          cuerpo: ui.tarjetas({
            columnas: 2,
            valor: f.clase,
            opciones: [
              { valor: 'STANDARD', etiqueta: 'DynamoDB Standard', descripcion: 'Recommended for tables that store frequently accessed data.' },
              { valor: 'STANDARD_INFREQUENT_ACCESS', etiqueta: 'DynamoDB Standard-IA', descripcion: 'Recommended for tables that store infrequently accessed data.' }
            ],
            alCambiar: (v) => ((f.clase = v), zona.repintar())
          })
        }),
        ui.contenedor({ titulo: 'Read/write capacity settings', info: 'dyn-capacidad', cx, cuerpo: h('div', { class: 'cx-form' }, seccionCapacidad(cx, f, () => zona.repintar())) })
      )
    );
    const guardar = () => {
      // Si solo cambió la clase, es otro UpdateTable; si no cambió nada, solo regresa.
      const p = parametrosCapacidad(f);
      const igual = JSON.stringify(p) === JSON.stringify(parametrosCapacidad({ modo: t.modo, lectura: desde('lectura'), escritura: desde('escritura') }));
      if (igual && f.clase === t.clase) return volverA(cx, t, 'mas');
      const r = cx.hacer({ servicio: 'DynamoDB', accion: 'UpdateTable', error: `Failed to update the ${t.nombre} table` }, (e) =>
        igual ? editarClaseDynamo(e, t.nombre, f.clase) : editarCapacidadDynamo(e, t.nombre, { ...p, clase: f.clase })
      );
      if (!r.ok) return;
      cx.flash({ tipo: 'exito', texto: `The ${t.nombre} table is being updated.` });
      volverA(cx, t, 'mas');
    };
    return h(
      'div',
      { class: 'cx-pagina cx-pagina--form' },
      ui.encabezado({ titulo: 'Edit read/write capacity', info: 'dyn-capacidad', cx, descripcion: `Table: ${t.nombre}` }),
      zona,
      ui.pieFormulario({ cancelar: () => volverA(cx, t, 'mas'), enviar: guardar, textoEnviar: 'Save changes' })
    );
  });
}

function pitrPagina(cx, { nombre }) {
  return paginaDeTabla(cx, nombre, 'Edit point-in-time recovery', (t) => {
    const f = { activa: Boolean(t.pitr), dias: String(t.pitr?.dias ?? 35) };
    const zona = ui.region(() =>
      ui.contenedor({
        titulo: 'Point-in-time recovery settings',
        info: 'dyn-respaldos',
        cx,
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.casilla({
            etiqueta: 'Turn on point-in-time recovery',
            descripcion: 'Point-in-time recovery provides continuous backups of your DynamoDB table data. Additional charges apply.',
            marcada: f.activa,
            alCambiar: (v) => ((f.activa = v), zona.repintar())
          }),
          f.activa
            ? ui.campo({
                etiqueta: 'Backup recovery period',
                descripcion: 'The number of days of continuous backups that you can restore from.',
                control: ui.entrada({ tipo: 'number', valor: f.dias, min: 1, max: 35, sufijo: 'days', alCambiar: (v) => (f.dias = v) }),
                restriccion: 'Between 1 and 35 days.'
              })
            : null
        )
      })
    );
    const guardar = () => {
      const r = cx.hacer({ servicio: 'DynamoDB', accion: 'UpdateContinuousBackups', error: 'Failed to update point-in-time recovery' }, (e) => editarPitrDynamo(e, t.nombre, f.activa, Number(f.dias)));
      if (!r.ok) return;
      cx.flash({ tipo: 'exito', texto: `Point-in-time recovery turned ${f.activa ? 'on' : 'off'} for the ${t.nombre} table.` });
      volverA(cx, t, 'respaldos');
    };
    return h(
      'div',
      { class: 'cx-pagina cx-pagina--form' },
      ui.encabezado({ titulo: 'Edit point-in-time recovery', info: 'dyn-respaldos', cx, descripcion: `Table: ${t.nombre}` }),
      zona,
      ui.pieFormulario({ cancelar: () => volverA(cx, t, 'respaldos'), enviar: guardar, textoEnviar: 'Save changes' })
    );
  });
}

/** Formulario común de las restauraciones: el nombre de la tabla nueva. */
function formularioRestaurar(cx, f) {
  return ui.campo({
    etiqueta: 'Name of restored table',
    descripcion: 'A restore always creates a new table. The original table is not changed.',
    error: f.error,
    control: ui.entrada({ valor: f.nombre, etiquetaAccesible: 'Name of restored table', alCambiar: (v) => (f.nombre = v) }),
    restriccion: RESTRICCION_NOMBRE
  });
}

function restaurarPitrPagina(cx, { nombre }) {
  return paginaDeTabla(cx, nombre, 'Restore table', (t) => {
    const f = { nombre: `${t.nombre}-restored`, error: null };
    const zona = ui.region(() =>
      ui.contenedor({
        titulo: 'Table details',
        info: 'dyn-respaldos',
        cx,
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.pares([{ etiqueta: 'Source table', valor: t.nombre }, { etiqueta: 'Source table ARN', valor: t.arn }], { columnas: 2 }),
          formularioRestaurar(cx, f),
          ui.campo({
            etiqueta: 'Restore date and time',
            control: ui.radios({
              valor: 'ultimo',
              opciones: [
                { valor: 'ultimo', etiqueta: 'Latest restore date', descripcion: 'Restore the table to the most recent point in time.' },
                { valor: 'fecha', etiqueta: 'Specify date and time', descripcion: 'No disponible en este simulador.', desactivado: true }
              ]
            })
          })
        )
      })
    );
    const restaurar = () => {
      f.error = f.nombre.trim() ? null : 'Table name is required.';
      if (f.error) return zona.repintar();
      const r = cx.hacer({ servicio: 'DynamoDB', accion: 'RestoreTableToPointInTime', error: 'Failed to restore the table' }, (e) => restaurarPitrDynamo(e, t.nombre, f.nombre.trim()));
      if (!r.ok) return;
      cx.flash({ tipo: 'exito', texto: `Restoring the ${r.valor.nombre} table. It will be available for use shortly.` });
      cx.ir('dynamodb/tablas');
    };
    return h(
      'div',
      { class: 'cx-pagina cx-pagina--form' },
      ui.encabezado({ titulo: 'Restore table to a point in time', info: 'dyn-respaldos', cx }),
      zona,
      ui.pieFormulario({ cancelar: () => volverA(cx, t, 'respaldos'), enviar: restaurar, textoEnviar: 'Restore' })
    );
  });
}

function replicaPagina(cx, { nombre }) {
  return paginaDeTabla(cx, nombre, 'Create replica', (t) => {
    const f = { region: null, error: null };
    const usadas = new Set(t.replicas.map((r) => r.region));
    const zona = ui.region(() =>
      ui.contenedor({
        titulo: 'Replication settings',
        info: 'dyn-global',
        cx,
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.alerta({
            tipo: 'info',
            contenido: 'To create a replica, the table must use on-demand capacity or provisioned capacity with auto scaling turned on for write capacity. DynamoDB Streams (new and old images) is turned on automatically.'
          }),
          ui.campo({
            etiqueta: 'Available replication Regions',
            error: f.error,
            control: ui.selector({
              opciones: REGIONES_DYNAMO.map(([c, n]) => ({ valor: c, etiqueta: n, descripcion: c, desactivado: usadas.has(c) })),
              valor: f.region,
              placeholder: 'Choose a Region',
              alCambiar: (v) => ((f.region = v), (f.error = null))
            })
          })
        )
      })
    );
    const crear = () => {
      if (!f.region) {
        f.error = 'Choose a Region.';
        return zona.repintar();
      }
      const r = cx.hacer({ servicio: 'DynamoDB', accion: 'UpdateTable', error: 'Failed to create the replica' }, (e) => crearReplicaDynamo(e, t.nombre, f.region));
      if (!r.ok) return;
      cx.flash({ tipo: 'exito', texto: `Creating a replica of the ${t.nombre} table in ${f.region}.` });
      volverA(cx, t, 'global');
    };
    return h(
      'div',
      { class: 'cx-pagina cx-pagina--form' },
      ui.encabezado({ titulo: 'Create replica', info: 'dyn-global', cx, descripcion: `Table: ${t.nombre}` }),
      zona,
      ui.pieFormulario({ cancelar: () => volverA(cx, t, 'global'), enviar: crear, textoEnviar: 'Create replica' })
    );
  });
}

/* ============================================================= respaldos */

function tablaRespaldos(cx, { tabla, variante = 'pagina' } = {}) {
  return ui.tabla(cx, {
    titulo: 'Backups',
    info: 'dyn-respaldos',
    variante,
    filas: () => respaldos(cx).filter((r) => !tabla || r.tabla === tabla),
    clave: (r) => r.arn,
    seleccion: 'unica',
    filtro: 'Find backups',
    columnas: [
      { titulo: 'Backup name', valor: (r) => r.nombre },
      { titulo: 'Status', valor: (r) => estadoSimple(r.estado) },
      { titulo: 'Table name', valor: (r) => (tablaDe(cx, r.tabla) ? ui.enlace(r.tabla, `dynamodb/tablas/${r.tabla}`, { cx }) : r.tabla) },
      { titulo: 'Backup type', valor: () => 'User' },
      { titulo: 'Creation time', valor: (r) => ui.fecha(r.creado) },
      { titulo: 'Size', valor: (r) => tamanoTexto(r.bytes) },
      { titulo: 'Items', valor: (r) => String(r.items.length) }
    ],
    acciones: (sel) => [
      ui.boton('Delete', {
        escribe: true,
        desactivado: sel.length !== 1 || sel[0].estado !== 'AVAILABLE',
        alClic: () =>
          cx.confirmar({
            titulo: `Delete backup ${sel[0].nombre}?`,
            palabra: 'delete',
            contenido: h('p', {}, 'This backup will be permanently deleted. You will not be able to restore a table from it.'),
            aceptar: () => {
              const r = cx.hacer({ servicio: 'DynamoDB', accion: 'DeleteBackup', error: 'Failed to delete the backup' }, (e) => eliminarRespaldoDynamo(e, sel[0].arn));
              if (r.ok) cx.flash({ tipo: 'exito', texto: `The ${sel[0].nombre} backup was deleted.` });
            }
          })
      }),
      ui.boton('Restore', { escribe: true, desactivado: sel.length !== 1 || sel[0].estado !== 'AVAILABLE', alClic: () => cx.ir(`dynamodb/respaldos/${encodeURIComponent(sel[0].arn)}/restaurar`) }),
      ui.boton('Create backup', { variante: tabla ? 'normal' : 'primario', escribe: true, alClic: () => ((cx.memoria.dynRespaldoDe = tabla ?? null), cx.ir('dynamodb/respaldos/crear')) })
    ],
    vacio: { titulo: 'No backups', texto: 'Create an on-demand backup to keep a full copy of a table.' }
  });
}

function listaRespaldos(cx) {
  cx.migas([migaBase, { texto: 'Backups' }]);
  return h('div', { class: 'cx-pagina' }, tablaRespaldos(cx));
}

function crearRespaldoPagina(cx) {
  cx.migas([migaBase, { texto: 'Backups', ruta: 'dynamodb/respaldos' }, { texto: 'Create on-demand backup' }]);
  const activas = tablas(cx).filter((t) => t.estado === 'ACTIVE' || t.estado === 'UPDATING');
  const f = { tabla: cx.memoria.dynRespaldoDe ?? null, nombre: '', errores: {} };
  cx.memoria.dynRespaldoDe = null;
  const sugerido = () => (f.tabla ? `${f.tabla}-backup` : '');
  if (f.tabla) f.nombre = sugerido();
  const zona = ui.region(() =>
    h(
      'div',
      { class: 'cx-pagina' },
      ui.contenedor({
        titulo: 'Backup settings',
        info: 'dyn-respaldos',
        cx,
        cuerpo: ui.tarjetas({
          columnas: 2,
          valor: 'dynamo',
          opciones: [
            { valor: 'dynamo', etiqueta: 'Default settings', descripcion: 'Create a full backup of your table with DynamoDB.' },
            { valor: 'backup', etiqueta: 'Customize settings', descripcion: 'Use AWS Backup for advanced features. No disponible en este simulador.', desactivado: true }
          ]
        })
      }),
      ui.contenedor({
        titulo: 'Source table',
        cuerpo: ui.campo({
          etiqueta: 'Table',
          error: f.errores.tabla,
          control: ui.selector({
            opciones: activas.map((t) => ({ valor: t.nombre, etiqueta: t.nombre, descripcion: `${t.items.length} items` })),
            valor: f.tabla,
            filtrar: true,
            placeholder: 'Choose a table',
            vacio: 'No active tables',
            alCambiar: (v) => {
              const antes = sugerido();
              f.tabla = v;
              if (!f.nombre || f.nombre === antes) f.nombre = sugerido();
              f.errores.tabla = null;
              zona.repintar();
            }
          })
        })
      }),
      ui.contenedor({
        titulo: 'Backup details',
        cuerpo: ui.campo({
          etiqueta: 'Backup name',
          error: f.errores.nombre,
          control: ui.entrada({ valor: f.nombre, etiquetaAccesible: 'Backup name', alCambiar: (v) => (f.nombre = v) }),
          restriccion: RESTRICCION_NOMBRE
        })
      })
    )
  );
  const crear = () => {
    f.errores = {};
    if (!f.tabla) f.errores.tabla = 'Choose a table.';
    if (!f.nombre.trim()) f.errores.nombre = 'Backup name is required.';
    if (Object.keys(f.errores).length) return zona.repintar();
    const r = cx.hacer({ servicio: 'DynamoDB', accion: 'CreateBackup', error: 'Failed to create the backup' }, (e) => crearRespaldoDynamo(e, f.tabla, f.nombre.trim()));
    if (!r.ok) return;
    cx.flash({ tipo: 'exito', texto: `Creating the ${r.valor.nombre} backup.` });
    cx.ir('dynamodb/respaldos');
  };
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Create on-demand backup', info: 'dyn-respaldos', cx }),
    zona,
    ui.pieFormulario({ cancelar: () => cx.ir('dynamodb/respaldos'), enviar: crear, textoEnviar: 'Create backup' })
  );
}

function restaurarRespaldoPagina(cx, { arn }) {
  cx.migas([migaBase, { texto: 'Backups', ruta: 'dynamodb/respaldos' }, { texto: 'Restore backup' }]);
  const r = respaldos(cx).find((x) => x.arn === arn);
  if (!r) return h('div', { class: 'cx-pagina' }, ui.alerta({ tipo: 'error', titulo: 'Backup not found', contenido: `Backup not found: ${arn}` }));
  const f = { nombre: `${r.tabla}-restored`, error: null };
  const zona = ui.region(() =>
    ui.contenedor({
      titulo: 'Table details',
      info: 'dyn-respaldos',
      cx,
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.pares(
          [
            { etiqueta: 'Backup name', valor: r.nombre },
            { etiqueta: 'Source table', valor: r.tabla },
            { etiqueta: 'Creation time', valor: ui.fecha(r.creado) },
            { etiqueta: 'Items', valor: String(r.items.length) }
          ],
          { columnas: 4 }
        ),
        formularioRestaurar(cx, f)
      )
    })
  );
  const restaurar = () => {
    f.error = f.nombre.trim() ? null : 'Table name is required.';
    if (f.error) return zona.repintar();
    const res = cx.hacer({ servicio: 'DynamoDB', accion: 'RestoreTableFromBackup', error: 'Failed to restore the backup' }, (e) => restaurarRespaldoDynamo(e, r.arn, f.nombre.trim()));
    if (!res.ok) return;
    cx.flash({ tipo: 'exito', texto: `Restoring the ${res.valor.nombre} table. It will be available for use shortly.` });
    cx.ir('dynamodb/tablas');
  };
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Restore table from backup', info: 'dyn-respaldos', cx }),
    zona,
    ui.pieFormulario({ cancelar: () => cx.ir('dynamodb/respaldos'), enviar: restaurar, textoEnviar: 'Restore' })
  );
}

/* ========================================================= explore items */

const filtroNuevo = () => ({ atributo: '', tipo: 'S', condicion: 'EQ', valor: '', valor2: '' });
const consultaNueva = () => ({ modo: 'scan', origen: '', pk: '', skCond: 'EQ', sk: '', sk2: '', desc: false, filtros: [], abierta: true });

/** El estado de «Scan or query items» por tabla (sobrevive a ir y volver de Create item). */
function memoriaExplorar(cx, nombre) {
  cx.memoria.dynExplorar ??= {};
  cx.memoria.dynExplorar[nombre] ??= { forma: consultaNueva(), corrida: consultaNueva() };
  return cx.memoria.dynExplorar[nombre];
}

/** Corre la consulta guardada (pura): { r } o { error }. */
function correr(cx, t, q) {
  const op = {
    indice: q.origen || undefined,
    filtros: q.filtros.filter((f) => f.atributo.trim()).map((f) => ({ atributo: f.atributo, condicion: f.condicion, tipo: f.tipo, valor: f.valor, valor2: f.valor2 }))
  };
  try {
    if (q.modo === 'scan') return { r: escanearTabla(cx.estado, t.nombre, op) };
    return { r: consultarTabla(cx.estado, t.nombre, { ...op, pk: q.pk, sk: q.sk !== '' ? { condicion: q.skCond, valor: q.sk, valor2: q.sk2 } : null, descendente: q.desc }) };
  } catch (e) {
    return { error: e };
  }
}

/** La llave (partición y ordenamiento) del origen elegido: la tabla o un índice. */
function llavesOrigen(t, origen) {
  const i = origen ? t.indices.find((x) => x.nombre === origen) : null;
  return i ? { pk: i.pk, sk: i.sk } : { pk: t.pk, sk: t.sk };
}

function explorar(cx, { nombre } = {}) {
  cx.migas(nombre ? [migaBase, { texto: 'Explore items', ruta: 'dynamodb/explorar' }, { texto: nombre }] : [migaBase, { texto: 'Explore items' }]);
  const lista = { filtro: '' };
  const lateral = cx.vivo(() => {
    const ts = tablas(cx).filter((t) => t.nombre.toLowerCase().includes(lista.filtro.toLowerCase()));
    return ui.contenedor({
      titulo: 'Tables',
      contador: tablas(cx).length,
      sinRelleno: true,
      cuerpo: h(
        'div',
        { class: 'cx-dyn-lista' },
        h('div', { class: 'cx-dyn-lista__filtro' }, ui.entrada({ valor: lista.filtro, placeholder: 'Find tables', buscar: true, etiquetaAccesible: 'Find tables', alCambiar: (v) => ((lista.filtro = v), lateral.repintar()) })),
        ts.length
          ? ts.map((t) =>
              h(
                'button',
                {
                  type: 'button',
                  class: ['cx-dyn-lista__item', t.nombre === nombre && 'cx-dyn-lista__item--activo'],
                  'aria-current': t.nombre === nombre ? 'true' : undefined,
                  onclick: () => cx.ir(`dynamodb/explorar/${t.nombre}`)
                },
                h('span', { class: ['cx-dyn-lista__radio', t.nombre === nombre && 'cx-dyn-lista__radio--si'] }),
                h('span', { class: 'cx-dyn-lista__nombre' }, t.nombre),
                t.estado !== 'ACTIVE' ? estadoTabla(t) : null
              )
            )
          : h('p', { class: 'cx-texto-sec', style: { padding: '12px 20px' } }, tablas(cx).length ? 'No matches' : 'No tables')
      )
    });
  });
  const t0 = nombre ? tablaDe(cx, nombre) : null;
  let principal;
  if (!nombre) principal = h('div', { class: 'cx-pagina' }, ui.encabezado({ titulo: 'Explore items', info: 'dyn-scan-query', cx }), ui.alerta({ tipo: 'info', titulo: 'Select a table', contenido: 'Choose a table from the list to scan or query its items.' }), !tablas(cx).length ? ui.boton('Create table', { variante: 'primario', alClic: () => cx.ir('dynamodb/tablas/crear') }) : null);
  else if (!t0) principal = noExisteTabla(cx, nombre);
  else principal = explorarTabla(cx, t0);
  return h('div', { class: 'cx-dyn-explorar' }, h('div', { class: 'cx-dyn-explorar__lado' }, lateral), h('div', { class: 'cx-dyn-explorar__principal' }, principal));
}

function explorarTabla(cx, t0) {
  const nombre = t0.nombre;
  const m = memoriaExplorar(cx, nombre);
  const q = m.forma;
  let errores = {};

  // El formulario «Scan or query items».
  const forma = ui.region(() => {
    const t = tablaDe(cx, nombre) ?? t0;
    const { pk, sk } = llavesOrigen(t, q.origen);
    const opcionesOrigen = [{ valor: '', etiqueta: `Table - ${t.nombre}` }, ...t.indices.map((i) => ({ valor: i.nombre, etiqueta: `Index - ${i.nombre}`, desactivado: i.estado !== 'ACTIVE', etiquetaDerecha: i.estado !== 'ACTIVE' ? 'Creating' : undefined }))];
    const condicionesSk = ['EQ', 'LE', 'LT', 'GE', 'GT', 'BETWEEN', ...(sk?.tipo === 'N' ? [] : ['BEGINS_WITH'])].map((c) => ({ valor: c, etiqueta: CONDICIONES_DYNAMO[c] }));
    const cuerpo = h(
      'div',
      { class: 'cx-form' },
      h(
        'div',
        { class: 'cx-fila-campos', style: { alignItems: 'flex-end' } },
        h('div', { style: { flex: '0 0 auto' } }, ui.segmentado({ etiquetaAccesible: 'Scan or query', opciones: [{ valor: 'scan', etiqueta: 'Scan' }, { valor: 'query', etiqueta: 'Query' }], valor: q.modo, alCambiar: (v) => ((q.modo = v), forma.repintar()) })),
        h('div', { style: { flex: '1 1 240px' } }, ui.campo({ etiqueta: 'Select a table or index', control: ui.selector({ opciones: opcionesOrigen, valor: q.origen, alCambiar: (v) => ((q.origen = v), (q.pk = ''), (q.sk = ''), (q.sk2 = ''), forma.repintar()) }) })),
        h('div', { style: { flex: '1 1 200px' } }, ui.campo({ etiqueta: 'Select attribute projection', control: ui.selector({ opciones: [{ valor: 'todo', etiqueta: 'All attributes' }, { valor: 'algunos', etiqueta: 'Specific attributes', desactivado: true }], valor: 'todo' }) }))
      ),
      q.modo === 'query'
        ? h(
            'div',
            { class: 'cx-fila-campos', style: { alignItems: 'flex-start' } },
            h('div', { style: { flex: '1 1 240px' } }, ui.campo({ etiqueta: h('span', {}, h('b', {}, pk.nombre), h('i', {}, ' (Partition key)')), error: errores.pk, control: ui.entrada({ valor: q.pk, placeholder: 'Enter partition key value', etiquetaAccesible: 'Partition key value', alCambiar: (v) => (q.pk = v), alEnter: () => ejecutar() }) })),
            sk
              ? [
                  h('div', { style: { flex: '0 0 200px' } }, ui.campo({ etiqueta: h('span', {}, h('b', {}, sk.nombre), h('i', {}, ' (Sort key)')), control: ui.selector({ opciones: condicionesSk, valor: q.skCond, etiquetaAccesible: 'Sort key condition', alCambiar: (v) => ((q.skCond = v), forma.repintar()) }) })),
                  h('div', { style: { flex: '1 1 160px' } }, ui.campo({ etiqueta: q.skCond === 'BETWEEN' ? 'From' : 'Value', control: ui.entrada({ valor: q.sk, placeholder: 'Enter sort key value', etiquetaAccesible: 'Sort key value', alCambiar: (v) => (q.sk = v), alEnter: () => ejecutar() }) })),
                  q.skCond === 'BETWEEN' ? h('div', { style: { flex: '1 1 160px' } }, ui.campo({ etiqueta: 'To', control: ui.entrada({ valor: q.sk2, placeholder: 'Enter sort key value', etiquetaAccesible: 'Sort key upper value', alCambiar: (v) => (q.sk2 = v) }) })) : null
                ]
              : null
          )
        : null,
      q.modo === 'query' && sk ? ui.casilla({ etiqueta: 'Sort descending', marcada: q.desc, alCambiar: (v) => (q.desc = v) }) : null,
      ui.expandible({ titulo: h('span', {}, 'Filters', h('i', {}, ' - optional')), abierto: q.filtros.length > 0, contenido: filtros() }),
      h('div', { class: 'cx-acciones' }, ui.boton('Run', { variante: 'primario', escribe: false, alClic: () => ejecutar() }), ui.boton('Reset', { alClic: () => reiniciar() }))
    );
    return ui.contenedor({ titulo: 'Scan or query items', info: 'dyn-scan-query', cx, plegable: true, abierto: q.abierta, alAlternar: (a) => (q.abierta = a), cuerpo });
  });

  function filtros() {
    const condicionesDe = (tipo) => {
      if (tipo === 'BOOL' || tipo === 'NULL') return ['EQ', 'NE', 'NOT_NULL', 'NULL'];
      if (tipo === 'N') return ['EQ', 'NE', 'LE', 'LT', 'GE', 'GT', 'BETWEEN', 'NOT_NULL', 'NULL'];
      return ['EQ', 'NE', 'LE', 'LT', 'GE', 'GT', 'BETWEEN', 'NOT_NULL', 'NULL', 'CONTAINS', 'NOT_CONTAINS', 'BEGINS_WITH'];
    };
    return h(
      'div',
      { class: 'cx-form' },
      q.filtros.length
        ? h(
            'div',
            { class: 'cx-dyn-filtros' },
            h('div', { class: 'cx-reglas__cabeza' }, 'Attribute name'),
            h('div', { class: 'cx-reglas__cabeza' }, 'Type'),
            h('div', { class: 'cx-reglas__cabeza' }, 'Condition'),
            h('div', { class: 'cx-reglas__cabeza' }, 'Value'),
            h('div'),
            q.filtros.map((f, i) => {
              const sinValor = f.condicion === 'NOT_NULL' || f.condicion === 'NULL';
              return [
                ui.entrada({ valor: f.atributo, placeholder: 'Enter attribute name', etiquetaAccesible: 'Filter attribute name', alCambiar: (v) => (f.atributo = v) }),
                ui.selector({
                  opciones: ['S', 'N', 'B', 'BOOL', 'NULL'].map((x) => ({ valor: x, etiqueta: NOMBRE_TIPO[x] })),
                  valor: f.tipo,
                  etiquetaAccesible: 'Filter type',
                  alCambiar: (v) => {
                    f.tipo = v;
                    if (!condicionesDe(v).includes(f.condicion)) f.condicion = 'EQ';
                    if (v === 'BOOL') f.valor = 'true';
                    forma.repintar();
                  }
                }),
                ui.selector({ opciones: condicionesDe(f.tipo).map((c) => ({ valor: c, etiqueta: CONDICIONES_DYNAMO[c] })), valor: f.condicion, etiquetaAccesible: 'Filter condition', alCambiar: (v) => ((f.condicion = v), forma.repintar()) }),
                sinValor || f.tipo === 'NULL'
                  ? h('span', { class: 'cx-texto-sec' }, '–')
                  : f.tipo === 'BOOL'
                    ? ui.selector({ opciones: [{ valor: 'true', etiqueta: 'True' }, { valor: 'false', etiqueta: 'False' }], valor: f.valor || 'true', alCambiar: (v) => (f.valor = v) })
                    : h(
                        'div',
                        { class: 'cx-dyn-entre' },
                        ui.entrada({ valor: f.valor, placeholder: 'Enter value', etiquetaAccesible: 'Filter value', alCambiar: (v) => (f.valor = v) }),
                        f.condicion === 'BETWEEN' ? ui.entrada({ valor: f.valor2, placeholder: 'and', etiquetaAccesible: 'Filter upper value', alCambiar: (v) => (f.valor2 = v) }) : null
                      ),
                ui.boton('Remove', { alClic: () => (q.filtros.splice(i, 1), forma.repintar()) })
              ];
            })
          )
        : null,
      h('div', {}, ui.boton('Add filter', { desactivado: q.filtros.length >= 10, alClic: () => (q.filtros.push(filtroNuevo()), forma.repintar()) }))
    );
  }

  function ejecutar() {
    errores = {};
    if (q.modo === 'query' && !String(q.pk).trim()) {
      errores.pk = 'Enter a partition key value.';
      return forma.repintar();
    }
    m.corrida = JSON.parse(JSON.stringify(q));
    const t = tablaDe(cx, nombre);
    const res = t ? correr(cx, t, m.corrida) : null;
    // Las RCU consumidas quedan en la tabla (pestaña Monitor). En solo lectura no se anota.
    if (res?.r && !cx.soloLectura) cx.hacer({ servicio: 'DynamoDB', accion: q.modo === 'scan' ? 'Scan' : 'Query' }, (e) => registrarLecturaDynamo(e, nombre, res.r.rcu), { flash: false });
    forma.repintar();
    resultados.repintar();
  }

  function reiniciar() {
    Object.assign(q, consultaNueva());
    m.corrida = consultaNueva();
    errores = {};
    forma.repintar();
    resultados.repintar();
  }

  // Los resultados se recalculan solos (después de crear o borrar ítems) con la última consulta corrida.
  const resultados = cx.vivo(() => {
    const t = tablaDe(cx, nombre);
    if (!t) return noExisteTabla(cx, nombre);
    if (t.estado === 'CREATING') return ui.alerta({ tipo: 'info', titulo: 'The table is being created', contenido: 'You can explore its items when its status is Active.' });
    if (t.estado === 'DELETING') return ui.alerta({ tipo: 'aviso', titulo: 'The table is being deleted' });
    const { r, error } = correr(cx, t, m.corrida);
    if (error)
      return ui.alerta({ tipo: 'error', titulo: m.corrida.modo === 'scan' ? 'Scan failed' : 'Query failed', contenido: error.message });
    return [
      ui.alerta({
        tipo: 'exito',
        titulo: 'Completed',
        contenido: h('span', { class: 'cx-dyn-banner' }, `Items returned: ${r.devueltos}`, h('span', { class: 'cx-dyn-banner__sep' }, '·'), `Items scanned: ${r.revisados}`, h('span', { class: 'cx-dyn-banner__sep' }, '·'), `Efficiency: ${r.eficiencia}%`, h('span', { class: 'cx-dyn-banner__sep' }, '·'), `RCUs consumed: ${r.rcu}`)
      }),
      tablaItems(cx, t, r, llavesOrigen(t, m.corrida.origen))
    ];
  });

  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({
      titulo: t0.nombre,
      info: 'dyn-scan-query',
      cx,
      descripcion: 'Explore and manage the items in your table.',
      acciones: [ui.boton('View table details', { alClic: () => cx.ir(`dynamodb/tablas/${nombre}`) })]
    }),
    forma,
    resultados
  );
}

function tablaItems(cx, t, r, llavesIndice) {
  // Columnas: llaves de la tabla, llaves del índice y después los demás atributos (sin esquema fijo).
  const llaves = [t.pk.nombre, t.sk?.nombre, llavesIndice.pk.nombre, llavesIndice.sk?.nombre].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i);
  const otros = [...new Set(r.items.flatMap((i) => Object.keys(i)))].filter((x) => !llaves.includes(x)).sort((a, b) => a.localeCompare(b));
  const clave = (i) => JSON.stringify(llaveDeItemDynamo(t, i));
  const irEditar = (i) => cx.ir(`dynamodb/explorar/${t.nombre}/item/${llaveRuta(t, i)}`);
  const columnas = [...llaves, ...otros].map((a, n) => ({
    titulo: a,
    valor: (i) => (n === 0 ? ui.enlace(valorCelda(i[a]) || '(empty)', () => irEditar(i)) : i[a] ? valorCelda(i[a]) : h('span', { class: 'cx-texto-sec' }, '')),
    texto: (i) => valorCelda(i[a])
  }));
  return ui.tabla(cx, {
    titulo: `Table: ${t.nombre} - Items returned`,
    info: 'dyn-item',
    variante: 'contenedor',
    filas: () => r.items,
    clave,
    seleccion: 'multiple',
    filtro: 'Find items',
    columnas,
    acciones: (sel) => [
      ui.menuBoton('Actions', () => [
        { texto: 'Edit item', desactivado: sel.length !== 1, alClic: () => irEditar(sel[0]) },
        { texto: 'Duplicate item', escribe: true, desactivado: sel.length !== 1, alClic: () => ((cx.memoria.dynDuplicar = { tabla: t.nombre, item: leerItemDynamo(cx.estado, t.nombre, llaveDeItemDynamo(t, sel[0])) }), cx.ir(`dynamodb/explorar/${t.nombre}/crear`)) },
        { texto: 'Delete items', escribe: true, desactivado: !sel.length, alClic: () => borrarItems(cx, t, sel) },
        '-',
        { texto: 'Download selected items to CSV', desactivado: true },
        { texto: 'Download results to CSV', desactivado: true }
      ]),
      ui.boton('Create item', { variante: 'primario', alClic: () => cx.ir(`dynamodb/explorar/${t.nombre}/crear`) })
    ],
    vacio: {
      titulo: 'No items',
      texto: 'The operation returned no items.',
      get accion() {
        return ui.boton('Create item', { escribe: true, alClic: () => cx.ir(`dynamodb/explorar/${t.nombre}/crear`) });
      }
    }
  });
}

function borrarItems(cx, t, sel) {
  cx.confirmar({
    titulo: 'Delete items?',
    palabra: 'delete',
    contenido: h('p', {}, `Are you sure you want to permanently delete ${sel.length === 1 ? 'this item' : `these ${sel.length} items`} from the ${t.nombre} table? You can't undo this action.`),
    aceptar: () => {
      const r = cx.hacer({ servicio: 'DynamoDB', accion: 'DeleteItem', error: 'Failed to delete items' }, (e) => eliminarItemsDynamo(e, t.nombre, sel.map((i) => llaveDeItemDynamo(t, i))));
      if (r.ok) cx.flash({ tipo: 'exito', texto: `${r.valor} item${r.valor === 1 ? '' : 's'} deleted successfully.` });
    }
  });
}

/* ==================================================== editor de un ítem */

const tipoElemento = (t) => ({ SS: 'S', NS: 'N', BS: 'B' })[t];

function filaNueva(tipo, nombre = '') {
  return { nombre, tipo, valor: tipo === 'BOOL' ? 'false' : '', hijos: esContenedor(tipo) ? [] : null };
}

/** Valor tipado → fila del formulario (recursivo para List y Map). */
function filaDe(nombre, v) {
  const [t, x] = Object.entries(v)[0];
  if (esSet(t)) return { nombre, tipo: t, valor: '', hijos: x.map((e) => ({ nombre: '', tipo: tipoElemento(t), valor: String(e), hijos: null })) };
  if (t === 'L') return { nombre, tipo: t, valor: '', hijos: x.map((e) => filaDe('', e)) };
  if (t === 'M') return { nombre, tipo: t, valor: '', hijos: Object.entries(x).map(([k, e]) => filaDe(k, e)) };
  if (t === 'NULL') return { nombre, tipo: t, valor: '', hijos: null };
  return { nombre, tipo: t, valor: String(x), hijos: null };
}

/** Fila del formulario → valor tipado. El modelo valida números, binarios y sets. */
function valorDeFila(f) {
  switch (f.tipo) {
    case 'S':
      return { S: f.valor };
    case 'N':
      return { N: f.valor.trim() };
    case 'B':
      return { B: f.valor.trim() };
    case 'BOOL':
      return { BOOL: f.valor === 'true' };
    case 'NULL':
      return { NULL: true };
    case 'SS':
    case 'NS':
    case 'BS':
      return { [f.tipo]: f.hijos.map((x) => (f.tipo === 'SS' ? x.valor : x.valor.trim())) };
    case 'L':
      return { L: f.hijos.map(valorDeFila) };
    case 'M':
      return { M: Object.fromEntries(f.hijos.map((x) => [x.nombre.trim(), valorDeFila(x)])) };
  }
  return { S: f.valor };
}

/** Revisa nombres vacíos o repetidos (lo que la consola marca antes de enviar). */
function errorNombres(filas, donde = '') {
  const vistos = new Set();
  for (const f of filas) {
    const n = f.nombre.trim();
    if (!n) return `Attribute name can't be empty${donde}.`;
    if (vistos.has(n)) return `Duplicate attribute name: ${n}${donde}.`;
    vistos.add(n);
    if (f.tipo === 'M') {
      const e = errorNombres(f.hijos, ` (in map ${n})`);
      if (e) return e;
    }
  }
  return null;
}

function menuTipos(texto, alElegir, op = {}) {
  return ui.menuBoton(texto, () => TIPOS_ATRIBUTO.map((t) => ({ texto: NOMBRE_TIPO[t], alClic: () => alElegir(t) })), { variante: 'normal', ...op });
}

/**
 * El editor «Attributes» (Form / JSON view). `item` (tipado) para editar o
 * duplicar; devuelve { nodo, leer() → item tipado | null }.
 */
function editorItem(cx, t, item, aviso) {
  const llaves = [t.pk, t.sk].filter(Boolean);
  const ed = {
    vista: 'form',
    dynamoJson: true,
    filas: [],
    json: '',
    error: null
  };
  // Las llaves primero (fijas), luego los demás atributos.
  for (const ll of llaves) ed.filas.push({ ...(item?.[ll.nombre] ? filaDe(ll.nombre, item[ll.nombre]) : filaNueva(ll.tipo, ll.nombre)), llave: ll === t.pk ? 'Partition key' : 'Sort key' });
  for (const [k, v] of Object.entries(item ?? {})) if (!llaves.some((ll) => ll.nombre === k)) ed.filas.push(filaDe(k, v));

  const itemDeFilas = () => Object.fromEntries(ed.filas.map((f) => [f.nombre.trim(), valorDeFila(f)]));
  const aTexto = (it) => JSON.stringify(ed.dynamoJson ? it : itemDynamoPlano(it), null, 2);

  function filasForm(lista, nivel, padre) {
    return lista.map((f, i) => {
      const sangria = { paddingLeft: `${nivel * 22}px` };
      let celdaNombre;
      if (f.llave) celdaNombre = h('div', { class: 'cx-dyn-atr__nombre', style: sangria }, h('b', {}, f.nombre), h('span', { class: 'cx-texto-sec' }, ` - ${f.llave}`));
      else if (padre && padre.tipo !== 'M') celdaNombre = h('div', { class: 'cx-dyn-atr__nombre cx-texto-sec', style: sangria }, esSet(padre.tipo) ? `Value ${i + 1}` : `[${i}]`);
      else celdaNombre = h('div', { style: sangria }, ui.entrada({ valor: f.nombre, placeholder: 'Enter attribute name', etiquetaAccesible: 'Attribute name', alCambiar: (v) => (f.nombre = v) }));
      let celdaValor;
      if (f.tipo === 'BOOL') celdaValor = ui.selector({ opciones: [{ valor: 'true', etiqueta: 'True' }, { valor: 'false', etiqueta: 'False' }], valor: f.valor, etiquetaAccesible: 'Value', alCambiar: (v) => (f.valor = v) });
      else if (f.tipo === 'NULL') celdaValor = h('span', { class: 'cx-texto-sec' }, 'null');
      else if (esSet(f.tipo)) celdaValor = ui.boton('Insert a field', { icono: 'add', alClic: () => (f.hijos.push({ nombre: '', tipo: tipoElemento(f.tipo), valor: '', hijos: null }), editor.repintar()) });
      else if (f.tipo === 'L' || f.tipo === 'M') celdaValor = menuTipos('Insert a field', (tipo) => (f.hijos.push(filaNueva(tipo)), editor.repintar()));
      else celdaValor = ui.entrada({ valor: f.valor, placeholder: f.tipo === 'N' ? 'Enter a number' : f.tipo === 'B' ? 'Enter base64-encoded binary' : 'Enter value', etiquetaAccesible: f.llave ? `${f.nombre} value` : 'Value', alCambiar: (v) => (f.valor = v) });
      const quitar = f.llave ? h('div') : ui.boton('Remove', { alClic: () => (lista.splice(i, 1), editor.repintar()) });
      return [
        h('div', { class: ['cx-dyn-atr__fila', nivel && 'cx-dyn-atr__fila--hija'] }, celdaNombre, h('div', {}, celdaValor), h('div', { class: 'cx-dyn-atr__tipo' }, NOMBRE_TIPO[f.tipo]), quitar),
        f.hijos ? filasForm(f.hijos, nivel + 1, f) : null
      ];
    });
  }

  function cambiarVista(v) {
    if (v === ed.vista) return;
    ed.error = null;
    if (v === 'json') {
      const e = errorNombres(ed.filas);
      if (e) {
        ed.error = e;
        return editor.repintar();
      }
      ed.json = aTexto(itemDeFilas());
    } else {
      const it = leerJson();
      if (!it) return editor.repintar();
      ed.filas = [];
      for (const ll of llaves) ed.filas.push({ ...(it[ll.nombre] && typeof it[ll.nombre] === 'object' ? filaDe(ll.nombre, it[ll.nombre]) : filaNueva(ll.tipo, ll.nombre)), llave: ll === t.pk ? 'Partition key' : 'Sort key' });
      for (const [k, x] of Object.entries(it)) if (!llaves.some((ll) => ll.nombre === k)) ed.filas.push(filaDe(k, x));
    }
    ed.vista = v;
    editor.repintar();
  }

  /** El texto del JSON → item tipado (o null y el error en pantalla). */
  function leerJson() {
    let datos;
    try {
      datos = JSON.parse(ed.json);
    } catch (e) {
      ed.error = `Invalid JSON: ${e.message}`;
      return null;
    }
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
      ed.error = 'Invalid JSON: the item must be a JSON object.';
      return null;
    }
    try {
      const it = ed.dynamoJson ? datos : itemDynamoTipado(datos);
      for (const [k, v] of Object.entries(it)) {
        if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== 1 || !TIPOS_ATRIBUTO.includes(Object.keys(v)[0])) throw new Error(`The value of "${k}" is not valid DynamoDB JSON. Use a type descriptor, for example {"S": "text"} or {"N": "10"}, or turn off View DynamoDB JSON.`);
        filaDe(k, v);
      }
      return it;
    } catch (e) {
      ed.error = e.message;
      return null;
    }
  }

  const editor = ui.region(() => {
    const vistaForm = () =>
      h(
        'div',
        { class: 'cx-dyn-atr' },
        h('div', { class: 'cx-dyn-atr__fila cx-dyn-atr__cabeza' }, h('div', {}, 'Attribute name'), h('div', {}, 'Value'), h('div', {}, 'Type'), h('div')),
        filasForm(ed.filas, 0, null)
      );
    const vistaJson = () =>
      h(
        'div',
        { class: 'cx-form' },
        ui.interruptor({
          etiqueta: 'View DynamoDB JSON',
          marcada: ed.dynamoJson,
          alCambiar: (v) => {
            const it = leerJson();
            if (!it) return editor.repintar();
            ed.dynamoJson = v;
            ed.json = aTexto(it);
            ed.error = null;
            editor.repintar();
          }
        }),
        ui.area({ valor: ed.json, filas: 16, monoespaciado: true, etiquetaAccesible: 'Item JSON', alCambiar: (v) => (ed.json = v) })
      );
    return ui.contenedor({
      titulo: 'Attributes',
      info: 'dyn-item',
      cx,
      acciones: [
        ed.vista === 'form' ? menuTipos('Add new attribute', (tipo) => (ed.filas.push(filaNueva(tipo)), editor.repintar())) : null,
        ui.segmentado({ etiquetaAccesible: 'Editor view', opciones: [{ valor: 'form', etiqueta: 'Form' }, { valor: 'json', etiqueta: 'JSON view' }], valor: ed.vista, alCambiar: cambiarVista })
      ],
      cuerpo: [
        aviso ?? null,
        ed.error ? ui.alerta({ tipo: 'error', contenido: ed.error }) : null,
        ed.vista === 'form' ? vistaForm() : vistaJson()
      ]
    });
  });

  return {
    nodo: editor,
    leer() {
      ed.error = null;
      let it;
      if (ed.vista === 'json') it = leerJson();
      else {
        ed.error = errorNombres(ed.filas);
        it = ed.error ? null : itemDeFilas();
      }
      editor.repintar();
      return it;
    }
  };
}

function crearItemPagina(cx, { nombre }) {
  cx.migas([migaBase, { texto: 'Explore items', ruta: 'dynamodb/explorar' }, { texto: nombre, ruta: `dynamodb/explorar/${nombre}` }, { texto: 'Create item' }]);
  const t = tablaDe(cx, nombre);
  if (!t) return noExisteTabla(cx, nombre);
  const dup = cx.memoria.dynDuplicar?.tabla === nombre ? cx.memoria.dynDuplicar.item : null;
  cx.memoria.dynDuplicar = null;
  const ed = editorItem(cx, t, dup, h('p', { class: 'cx-texto-sec', style: { marginTop: 0 } }, 'You can add, remove, or edit the attributes of an item. You can nest attributes inside other attributes up to 32 levels deep.'));
  const crear = () => {
    const it = ed.leer();
    if (!it) return;
    const r = cx.hacer({ servicio: 'DynamoDB', accion: 'PutItem', error: 'Failed to create item' }, (e) => ponerItemDynamo(e, nombre, it));
    if (!r.ok) return;
    cx.flash({ tipo: 'exito', texto: 'The item has been saved successfully.' });
    if (r.valor.reemplazado)
      cx.flash({ tipo: 'info', titulo: 'Se reemplazó un ítem (simulador)', texto: 'Ya existía un ítem con esa misma llave primaria. PutItem no da error: lo sobrescribe completo, y los atributos que no escribiste desaparecen.' });
    cx.ir(`dynamodb/explorar/${nombre}`);
  };
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Create item', info: 'dyn-item', cx, descripcion: `Table: ${nombre}` }),
    ed.nodo,
    ui.pieFormulario({ cancelar: () => cx.ir(`dynamodb/explorar/${nombre}`), enviar: crear, textoEnviar: 'Create item' })
  );
}

function editarItemPagina(cx, { nombre, llave }) {
  cx.migas([migaBase, { texto: 'Explore items', ruta: 'dynamodb/explorar' }, { texto: nombre, ruta: `dynamodb/explorar/${nombre}` }, { texto: 'Edit item' }]);
  const t = tablaDe(cx, nombre);
  if (!t) return noExisteTabla(cx, nombre);
  let original = null;
  try {
    original = JSON.parse(llave);
  } catch {
    original = null;
  }
  const item = original ? leerItemDynamo(cx.estado, nombre, original) : null;
  if (!item)
    return h('div', { class: 'cx-pagina' }, ui.alerta({ tipo: 'error', titulo: 'Item not found', contenido: 'The item does not exist. It may have been deleted.', accion: ui.boton('Back to items', { alClic: () => cx.ir(`dynamodb/explorar/${nombre}`) }) }));
  let llaveActual = original;
  const ed = editorItem(cx, t, item);
  const guardar = (cerrar) => {
    const it = ed.leer();
    if (!it) return;
    const r = cx.hacer({ servicio: 'DynamoDB', accion: 'PutItem', error: 'Failed to save item' }, (e) => editarItemDynamo(e, nombre, llaveActual, it));
    if (!r.ok) return;
    llaveActual = llaveDeItemDynamo(t, r.valor.item);
    cx.flash({ tipo: 'exito', texto: 'The item has been saved successfully.' });
    if (cerrar) cx.ir(`dynamodb/explorar/${nombre}`);
  };
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Edit item', info: 'dyn-item', cx, descripcion: `Table: ${nombre}` }),
    ed.nodo,
    ui.pieFormulario({ cancelar: () => cx.ir(`dynamodb/explorar/${nombre}`), enviar: () => guardar(true), textoEnviar: 'Save and close', extra: ui.boton('Save', { escribe: true, alClic: () => guardar(false) }) })
  );
}

/* ================================================================ ayudas */

const ayudas = {
  'dyn-tabla': {
    titulo: 'Tabla de DynamoDB',
    texto: [
      '**DynamoDB** es una base de datos **NoSQL** administrada y sin servidores: no eliges máquinas ni discos, solo creas tablas y guardas datos.',
      'Una **tabla** guarda **ítems** (como renglones). Cada ítem es un conjunto de **atributos** (nombre y valor). No hay esquema fijo: dos ítems de la misma tabla pueden tener atributos distintos.',
      'Lo único obligatorio al crear la tabla es su **nombre** y su **llave primaria** (partition key y, si quieres, sort key).',
      'Una tabla nueva tarda unos segundos en pasar de **Creating** a **Active**.'
    ]
  },
  'dyn-llaves': {
    titulo: 'Partition key y sort key',
    texto: [
      'La **llave primaria** identifica a cada ítem; no puede haber dos ítems con la misma.',
      [
        '**Partition key** (obligatoria): DynamoDB la usa para repartir los datos. Ejemplo: `jugador`.',
        '**Sort key** (opcional): ordena los ítems que comparten partición. Ejemplo: `evento` + `asiento`. Con ella la llave es **compuesta**.'
      ],
      'El tipo de cada llave (String, Number o Binary) **no se puede cambiar** después. Elige nombres en minúsculas y sin espacios.'
    ]
  },
  'dyn-ajustes': {
    titulo: 'Default o Customize settings',
    texto: [
      '**Default settings** crea la tabla en modo **On-demand**, con la clase Standard, cifrado con llave de AWS y sin protección contra borrado. Es lo más rápido para practicar.',
      '**Customize settings** te deja elegir la clase de tabla, la capacidad (On-demand o Provisioned con autoescalado), índices globales, el cifrado y la protección contra borrado.'
    ]
  },
  'dyn-capacidad': {
    titulo: 'Capacidad: On-demand o Provisioned',
    texto: [
      '**On-demand**: pagas por cada lectura y escritura. No planeas nada; ideal si el tráfico es impredecible o estás empezando.',
      '**Provisioned**: reservas de antemano unidades de lectura (**RCU**) y de escritura (**WCU**). Sale más barato si el tráfico es estable.',
      ['1 **RCU** = una lectura fuerte por segundo de hasta 4 KB (o dos lecturas eventualmente consistentes).', '1 **WCU** = una escritura por segundo de hasta 1 KB.'],
      'Con **Auto scaling** DynamoDB sube y baja la capacidad entre un mínimo y un máximo para mantener el porcentaje objetivo.'
    ]
  },
  'dyn-autoescalado': {
    titulo: 'Auto scaling de la tabla',
    texto: [
      'El **autoescalado** ajusta la capacidad provisionada según el uso real, entre **Minimum** y **Maximum capacity units**.',
      '**Target utilization** (20 a 90 %) es qué tan llena quieres la capacidad antes de que suba. 70 % es el valor común.',
      'Una **tabla global** en modo Provisioned necesita autoescalado de escritura.'
    ]
  },
  'dyn-clase': {
    titulo: 'Clase de tabla',
    texto: [
      '**DynamoDB Standard**: la normal, para datos que se leen y escriben seguido.',
      '**Standard-IA** (Infrequent Access): el almacenamiento cuesta menos, pero cada lectura y escritura cuesta más. Conviene para datos que casi no se consultan (historial, bitácoras viejas).'
    ]
  },
  'dyn-cifrado': {
    titulo: 'Cifrado en reposo',
    texto: [
      'DynamoDB **siempre** cifra tus datos guardados. Solo eliges quién administra la llave:',
      ['**Owned by Amazon DynamoDB**: gratis, DynamoDB se encarga.', '**AWS managed key** (`aws/dynamodb`): la llave vive en KMS de tu cuenta; la ves en CloudTrail.', '**Customer managed key**: tu propia llave de KMS; tú controlas quién la usa y su rotación.']
    ]
  },
  'dyn-proteccion': {
    titulo: 'Deletion protection',
    texto: [
      'Con la **protección contra borrado** encendida, nadie puede borrar la tabla por accidente: `DeleteTable` falla hasta que la apagues.',
      'La encuentras en la pestaña **Additional settings** de la tabla.'
    ]
  },
  'dyn-item': {
    titulo: 'Ítems y atributos',
    texto: [
      'Un **ítem** es un registro. Debe traer la llave primaria; los demás atributos son libres (**sin esquema fijo**).',
      'Tipos: **String**, **Number**, **Binary** (base64), **Boolean**, **Null**, **String/Number/Binary set** (listas sin repetidos), **List** y **Map** (anidados).',
      '**Create item** hace un `PutItem`: si ya existe un ítem con la misma llave, **lo reemplaza completo** sin avisar.',
      'En **JSON view** con **View DynamoDB JSON** cada valor lleva su tipo: `{"jugador": {"S": "ana"}, "puntaje": {"N": "950"}}`. Si lo apagas escribes JSON normal: `{"jugador": "ana", "puntaje": 950}`.'
    ]
  },
  'dyn-scan-query': {
    titulo: 'Scan contra Query',
    texto: [
      '**Scan** lee **toda** la tabla y después filtra. Es fácil, pero en una tabla grande es lento y caro.',
      '**Query** va directo a una **partition key** (y, si quieres, a un rango de la sort key). Solo lee esos ítems: es rápido y barato.',
      'El banner te dice cuántos ítems **regresó** y cuántos **revisó**. **Efficiency** = devueltos ÷ revisados. Los **filtros** no ahorran lectura: se aplican después de leer.',
      '**RCUs consumed** sale del tamaño leído: 0.5 RCU por cada 4 KB en lectura eventualmente consistente.'
    ]
  },
  'dyn-gsi': {
    titulo: 'Índice global secundario (GSI)',
    texto: [
      'Un **GSI** es otra forma de buscar: una copia de la tabla organizada con **otra llave**. Así puedes hacer **Query** por un atributo que no es la llave primaria (por ejemplo `zona` en una tabla de boletos).',
      'Solo entran al índice los ítems que tienen sus atributos de llave (índice **disperso**).',
      '**Attribute projections**: qué atributos se copian al índice (All, Only keys o Include).',
      'Para usarlo, en **Explore items** elige `Index - nombre` en «Select a table or index».'
    ]
  },
  'dyn-respaldos': {
    titulo: 'Respaldos de DynamoDB',
    texto: [
      '**Point-in-time recovery (PITR)**: respaldo continuo. Puedes regresar la tabla a cualquier segundo de los últimos 1 a 35 días.',
      '**On-demand backup**: una copia completa de la tabla en un momento, que guardas el tiempo que quieras (aunque borres la tabla).',
      'Restaurar **siempre crea una tabla nueva** con otro nombre; la original no cambia.'
    ]
  },
  'dyn-global': {
    titulo: 'Tablas globales',
    texto: [
      'Una **tabla global** replica tus datos en **otras regiones** de AWS: los usuarios de cada región leen y escriben cerca, y si una región falla la otra sigue.',
      'Requiere capacidad **On-demand** (o Provisioned con autoescalado de escritura) y enciende **DynamoDB Streams** para copiar los cambios.',
      'En el simulador la réplica se crea y se ve, pero los datos solo viven en us-east-1.'
    ]
  },
  'dyn-streams': {
    titulo: 'DynamoDB Streams',
    texto: [
      'Un **stream** es la lista de cambios de la tabla (altas, cambios y bajas), en orden, por 24 horas.',
      'Sirve para reaccionar a los cambios, por ejemplo disparando una función **Lambda**, y es lo que usan las **tablas globales** para replicar.'
    ]
  }
};

/* ================================================================ registro */

const des = (texto) => ({ texto, desactivado: true });

export default {
  id: 'dynamodb',
  nombre: 'DynamoDB',
  titulo: 'DynamoDB',
  descripcion: 'Managed NoSQL Database',
  categoria: 'bases',
  claves: 'nosql database tabla tables items key value base de datos',
  inicio: 'dynamodb',
  menu: [
    { texto: 'Dashboard', ruta: 'dynamodb' },
    { texto: 'Tables', ruta: 'dynamodb/tablas' },
    { texto: 'Explore items', ruta: 'dynamodb/explorar' },
    des('PartiQL editor'),
    { texto: 'Backups', ruta: 'dynamodb/respaldos' },
    des('Exports to S3'),
    des('Imports from S3'),
    des('Integrations'),
    des('Reserved capacity'),
    des('Settings'),
    { seccion: 'DAX', items: [des('Clusters'), des('Subnet groups'), des('Parameter groups'), des('Events')] }
  ],
  rutas: {
    '': panel,
    tablas: listaTablas,
    'tablas/crear': crearTablaPagina,
    'tablas/:nombre': detalleTabla,
    'tablas/:nombre/indice': crearIndicePagina,
    'tablas/:nombre/capacidad': capacidadPagina,
    'tablas/:nombre/pitr': pitrPagina,
    'tablas/:nombre/restaurar': restaurarPitrPagina,
    'tablas/:nombre/replica': replicaPagina,
    explorar,
    'explorar/:nombre': explorar,
    'explorar/:nombre/crear': crearItemPagina,
    'explorar/:nombre/item/:llave': editarItemPagina,
    respaldos: listaRespaldos,
    'respaldos/crear': crearRespaldoPagina,
    'respaldos/:arn/restaurar': restaurarRespaldoPagina
  },
  busqueda: [
    { texto: 'Tables', ruta: 'dynamodb/tablas', claves: 'dynamodb tablas nosql' },
    { texto: 'Create table', ruta: 'dynamodb/tablas/crear', claves: 'dynamodb crear tabla' },
    { texto: 'Explore items', ruta: 'dynamodb/explorar', claves: 'dynamodb scan query items' },
    { texto: 'Backups', ruta: 'dynamodb/respaldos', claves: 'dynamodb respaldo pitr' }
  ],
  ayudas
};
