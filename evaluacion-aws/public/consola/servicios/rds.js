// ---------------------------------------------------------------------------
// AURORA AND RDS
//
// La consola de RDS: Dashboard (con «Create with express configuration»),
// Databases (instancias, clústeres y réplicas agrupados), «Create database»
// en una sola página (Standard create / Easy create) con el costo estimado,
// el detalle de una base con sus pestañas (Connectivity & security,
// Monitoring, Logs & events, Configuration, Maintenance & backups, Tags),
// Modify con su resumen y «Schedule modifications», Create read replica,
// Take snapshot, Restore to point in time, Snapshots, Automated backups,
// Subnet groups y Events. Las acciones de Actions (Stop temporarily, Reboot
// con failover, Delete con snapshot final, Promote…) usan los modales reales.
// El modelo vive en modelo/rds.js.
// ---------------------------------------------------------------------------

import * as ui from '../ui.js';
import {
  agregarLectorAurora,
  aplicarPendientesRds,
  arrancarBaseRds,
  CLASES_RDS,
  claseRds,
  clusterRdsDe,
  compartirSnapshotRds,
  conectarEc2Rds,
  copiarSnapshotRds,
  cpuRds,
  crearBaseExpres,
  crearBaseRds,
  crearGrupoSubredesRds,
  crearReplicaRds,
  detenerBaseRds,
  editarGrupoSubredesRds,
  eliminarBaseRds,
  eliminarGrupoSubredesRds,
  eliminarSnapshotRds,
  esAurora,
  failoverClusterRds,
  grupoSubredesRdsDe,
  ID_ZONA,
  instanciaRdsDe,
  modificarBaseRds,
  modificarClusterRds,
  motorRds,
  nombreLlaveKms,
  MOTORES_RDS,
  promoverReplicaRds,
  reiniciarBaseRds,
  restaurarPuntoRds,
  restaurarSnapshotRds,
  tomarSnapshotRds,
  ventanaRestauracionRds,
  zonasDeGrupoRds
} from '../modelo.js';
import { enlaceRecurso, idParentesis, noExiste, opcionesVpc, opcionSubred } from './comun.js';

const { h } = ui;

/** Una región que se repinta a mano con la separación de 20 px entre contenedores. */
const regionPagina = (fn) => ui.region(fn, { clase: 'cx-pagina' });

/* ================================================================ ayudas */

const VACIO = { instancias: [], snapshots: [], gruposSubredes: [], clusteres: [], eventos: [] };
/** Las colecciones de RDS (una cuenta vieja puede no traerlas todavía). */
const col = (cx) => ({ ...VACIO, ...(cx.estado.rds ?? {}) });
const instDe = (cx, id) => instanciaRdsDe(cx.estado, id);
const clusterDe = (cx, id) => clusterRdsDe(cx.estado, id);
const baseDe = (cx, id) => instDe(cx, id) ?? clusterDe(cx, id);
const esCluster = (b) => Boolean(b?.miembros);
// Los clústeres viven también bajo rds/bases (como en la consola) para que «Databases» quede activo en el menú.
const rutaBase = (b) => `rds/bases/${b.id}`;
const rutaSnap = (s) => `rds/snapshots/${encodeURIComponent(s.id)}`;

const ESTADOS = {
  creating: ['pendiente', 'Creating'],
  'backing-up': ['pendiente', 'Backing-up'],
  available: ['exito', 'Available'],
  modifying: ['pendiente', 'Modifying'],
  rebooting: ['pendiente', 'Rebooting'],
  stopping: ['pendiente', 'Stopping'],
  stopped: ['detenido', 'Stopped'],
  starting: ['pendiente', 'Starting'],
  deleting: ['pendiente', 'Deleting'],
  failed: ['error', 'Failed']
};
export const estadoRds = (b) => {
  const [tipo, texto] = ESTADOS[b?.estado] ?? ['info', b?.estado ?? '–'];
  return ui.estado(tipo, texto);
};

const ROLES = { instance: 'Instance', primary: 'Primary', replica: 'Replica', writer: 'Writer instance', reader: 'Reader instance' };
const rolTexto = (b) => (esCluster(b) ? (b.tipo === 'aurora' ? 'Regional cluster' : 'Multi-AZ DB cluster') : ROLES[b.rol] ?? b.rol);
const motorTexto = (motor) => motorRds(motor)?.corto ?? motor;
const versionTexto = (b) => (b.motor === 'aurora-mysql' ? b.version.replace(/^8\.0\.mysql_aurora\./, '') + ' (compatible with MySQL 8.0)' : b.version);
const despliegueTexto = (b) => (esCluster(b) ? (b.tipo === 'aurora' ? `${b.miembros.length} instance${b.miembros.length === 1 ? '' : 's'}` : '3 Zones') : b.multiAz ? 'Yes' : 'No');

/** El nombre de un grupo de seguridad (o su id si ya no existe). */
const nombreSg = (cx, id) => cx.estado.gruposSeguridad.find((g) => g.id === id)?.nombre ?? id;

/** CPU con su barrita, como la columna CPU de Databases. */
function celdaCpu(b) {
  const inst = esCluster(b) ? null : b;
  const v = inst ? cpuRds(inst) : null;
  if (v === null) return '–';
  return h('span', { class: 'cx-rds-cpu' }, h('span', { class: 'cx-rds-cpu__barra' }, h('span', { style: { width: `${Math.min(100, v * 4)}%` } })), `${v.toFixed(2)}%`);
}

const precioMes = (n) => `${n.toFixed(2)} USD`;

function etiquetasDe(b) {
  return (b.etiquetas ?? []).length ? b.etiquetas : [];
}

/* ============================================================ dashboard */

function panel(cx) {
  cx.migas([{ texto: 'Aurora and RDS', ruta: 'rds' }, { texto: 'Dashboard' }]);
  const recurso = (texto, cuenta, ruta) =>
    h('div', { class: 'cx-resumen-recursos__item' }, ruta ? ui.enlace(texto, ruta, { cx }) : h('span', { class: 'cx-texto-sec' }, texto), h('span', {}, String(cuenta)));
  const recursos = cx.vivo(() => {
    const r = col(cx);
    const manuales = r.snapshots.filter((s) => s.tipo === 'manual').length;
    const automaticos = r.snapshots.filter((s) => s.tipo === 'automated').length;
    return ui.contenedor({
      titulo: 'Resources',
      descripcion: 'You are using the following Amazon RDS resources in the US East (N. Virginia) region (used/quota)',
      acciones: ui.botonRefrescar(() => cx.refrescar()),
      cuerpo: h(
        'div',
        { class: 'cx-resumen-recursos' },
        recurso(`DB Instances (${r.instancias.length}/40)`, '', 'rds/bases'),
        recurso('Allocated storage', `${(r.instancias.reduce((s, i) => s + (i.almacenamiento?.gib ?? 0), 0) / 1024).toFixed(2)} TB/100 TB`),
        recurso(`DB Clusters (${r.clusteres.length}/40)`, '', 'rds/bases'),
        recurso('Reserved instances (0/40)', ''),
        recurso(`Snapshots (${r.snapshots.length})`, '', 'rds/snapshots'),
        recurso(`Manual (${manuales}/100)`, '', 'rds/snapshots'),
        recurso(`Automated (${automaticos})`, '', 'rds/respaldos'),
        recurso(`Recent events (${r.eventos.length})`, '', 'rds/eventos'),
        recurso('Event subscriptions (0/20)', ''),
        recurso('Parameter groups', 'default'),
        recurso('Option groups', 'default'),
        recurso(`Subnet groups (${r.gruposSubredes.length}/50)`, '', 'rds/grupos-subredes'),
        recurso('Supported platforms', 'VPC'),
        recurso('Default network', cx.estado.vpcs.find((v) => v.porDefecto)?.id ?? '–')
      )
    });
  });
  const crear = ui.contenedor({
    titulo: 'Create database',
    info: 'rds-base',
    cx,
    cuerpo: h(
      'div',
      { class: 'cx-rds-crear-opciones' },
      h(
        'div',
        { class: 'cx-bloque' },
        h('div', { class: 'cx-bloque__titulo' }, 'Create with express configuration in seconds', ' ', h('span', { class: 'cx-insignia cx-insignia--azul' }, 'New')),
        h('p', { class: 'cx-texto-sec' }, 'Create an Aurora PostgreSQL serverless cluster with preconfigured settings. Connect from anywhere with IAM authentication through the internet access gateway.'),
        h('div', { style: { marginTop: '12px' } }, ui.boton('Create', { variante: 'normal', escribe: true, alClic: () => modalExpres(cx) }), ' ', ui.info(cx, 'rds-expres'))
      ),
      h(
        'div',
        { class: 'cx-bloque' },
        h('div', { class: 'cx-bloque__titulo' }, 'Create with full configuration'),
        h('p', { class: 'cx-texto-sec' }, 'Choose the engine, deployment, instance class, storage, connectivity, backups and encryption of your database.'),
        h('div', { style: { marginTop: '12px' } }, ui.boton('Create database', { variante: 'primario', alClic: () => cx.ir('rds/bases/crear') }))
      ),
      h('p', { class: 'cx-texto-sec' }, 'Note: your DB instances will launch in the US East (N. Virginia) region')
    )
  });
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Dashboard', info: 'rds-base', cx }),
    recursos,
    h(
      'div',
      { class: 'cx-dos-columnas' },
      h('div', { class: 'cx-pagina' }, crear),
      h(
        'div',
        { class: 'cx-lado' },
        ui.contenedor({ titulo: 'Service health', cuerpo: ui.estado('exito', 'Service is operating normally') }),
        ui.contenedor({ titulo: 'Additional information', cuerpo: h('div', { class: 'cx-form' }, ['Getting started', 'Overview and features', 'Documentation', 'Pricing'].map((t) => h('div', {}, ui.enlace(t, () => cx.ayuda('rds-base'), { externo: true })))) })
      )
    )
  );
}

function modalExpres(cx) {
  const f = { id: `database-${col(cx).clusteres.length + 1}`, min: '0', max: '16' };
  const m = cx.modal({
    titulo: 'Create with express configuration',
    ancho: 'grande',
    contenido: [
      h('p', { class: 'cx-texto-sec' }, 'Aurora creates a serverless Aurora PostgreSQL cluster with the following preconfigured settings. You can change the DB cluster identifier and the capacity range now, and other settings after the cluster is created.'),
      ui.campo({ etiqueta: 'DB cluster identifier', control: ui.entrada({ valor: f.id, alCambiar: (v) => (f.id = v) }), restriccion: 'The identifier is case-insensitive, but is stored as all lowercase. 1 to 63 alphanumeric characters or hyphens. First character must be a letter.' }),
      h(
        'div',
        { class: 'cx-fila-campos' },
        ui.campo({ etiqueta: 'Minimum capacity (ACUs)', control: ui.entrada({ tipo: 'number', valor: f.min, alCambiar: (v) => (f.min = v) }) }),
        ui.campo({ etiqueta: 'Maximum capacity (ACUs)', control: ui.entrada({ tipo: 'number', valor: f.max, alCambiar: (v) => (f.max = v) }) })
      ),
      ui.pares(
        [
          { etiqueta: 'Engine', valor: 'Aurora PostgreSQL 17.5' },
          { etiqueta: 'Instance class', valor: 'Serverless v2' },
          { etiqueta: 'Admin user', valor: 'postgres (IAM authentication)' },
          { etiqueta: 'Connectivity', valor: 'Internet access gateway' },
          { etiqueta: 'Port', valor: '5432' },
          { etiqueta: 'Encryption', valor: 'Enabled (aws/rds)' }
        ],
        { columnas: 3 }
      )
    ],
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Create', {
        variante: 'primario',
        alClic: () => {
          const r = cx.hacer({ servicio: 'RDS', accion: 'CreateDBCluster', error: 'Failed to create database' }, (e) => crearBaseExpres(e, { id: f.id, min: Number(f.min), max: Number(f.max) }), { atomico: true });
          if (r.ok) {
            m.cerrar();
            cx.flash({ tipo: 'progreso', titulo: `Creating database ${r.valor.id}`, texto: 'Your database might take a few minutes to launch.' });
            cx.ir('rds/bases');
          }
        }
      })
    ]
  });
}

/* ============================================================ Databases */

/** Filas de Databases: cada clúster con sus instancias y cada base con sus réplicas debajo. */
function filasBases(cx) {
  const r = col(cx);
  const filas = [];
  for (const c of r.clusteres) {
    filas.push({ x: c, nivel: 0 });
    for (const id of c.miembros) {
      const i = instDe(cx, id);
      if (i) filas.push({ x: i, nivel: 1 });
    }
  }
  for (const i of r.instancias) {
    if (i.clusterId) continue;
    if (i.rol === 'replica' && instDe(cx, i.fuente)) continue;
    filas.push({ x: i, nivel: 0 });
    for (const rid of i.replicas) {
      const rr = instDe(cx, rid);
      if (rr) filas.push({ x: rr, nivel: 1 });
    }
  }
  return filas;
}

function listaBases(cx) {
  cx.migas([{ texto: 'Aurora and RDS', ruta: 'rds' }, { texto: 'Databases' }]);
  const t = ui.tabla(cx, {
    titulo: 'Databases',
    info: 'rds-base',
    filas: () => filasBases(cx),
    clave: (f) => `${esCluster(f.x) ? 'c' : 'i'}:${f.x.id}`,
    seleccion: 'unica',
    filtro: 'Filter by databases',
    antesDelFiltro: null,
    columnas: [
      { titulo: 'DB identifier', texto: (f) => f.x.id, valor: (f) => h('span', { class: ['cx-rds-arbol', f.nivel && 'cx-rds-arbol--hijo'] }, f.nivel ? h('span', { class: 'cx-rds-arbol__rama', 'aria-hidden': 'true' }) : null, ui.enlace(f.x.id, rutaBase(f.x), { cx })) },
      { titulo: 'Status', valor: (f) => estadoRds(f.x) },
      { titulo: 'Role', valor: (f) => rolTexto(f.x) },
      { titulo: 'Engine', valor: (f) => motorTexto(f.x.motor) },
      { titulo: 'Region & AZ', valor: (f) => (esCluster(f.x) ? 'us-east-1' : f.x.zona) },
      { titulo: 'Size', valor: (f) => (esCluster(f.x) ? `${f.x.miembros.length} instance${f.x.miembros.length === 1 ? '' : 's'}` : f.x.clase) },
      { titulo: 'Recommendations', valor: (f) => (!esCluster(f.x) && !f.x.multiAz && !f.x.clusterId && f.x.plantilla === 'production' ? h('span', { class: 'cx-insignia cx-insignia--azul' }, '1 Informational') : '–') },
      { titulo: 'CPU', valor: (f) => celdaCpu(f.x) },
      { titulo: 'Current activity', valor: (f) => (esCluster(f.x) || f.x.estado !== 'available' ? '–' : `${(f.x.conexionesEc2?.length ?? 0) > 0 ? 1 : 0} Connections`) },
      { titulo: 'Maintenance', valor: (f) => (f.x.pendientes ? 'next window' : 'none') },
      { titulo: 'VPC', valor: (f) => enlaceRecurso(cx, f.x.vpcId) },
      { titulo: 'Multi-AZ', valor: (f) => despliegueTexto(f.x) }
    ],
    acciones: (sel) => {
      const b = sel[0]?.x ?? null;
      return [
        ui.boton('Group resources', { desactivado: true }),
        ui.boton('Modify', { escribe: true, desactivado: !b || (!esCluster(b) && b.estado !== 'available') || (esCluster(b) && b.estado !== 'available'), alClic: () => cx.ir(`${rutaBase(b)}/modificar`) }),
        menuAcciones(cx, b),
        ui.boton('Restore from S3', { desactivado: true }),
        ui.boton('Create database', { variante: 'primario', alClic: () => cx.ir('rds/bases/crear') })
      ];
    },
    vacio: { titulo: 'No databases', texto: 'You don’t have any databases in this Region.', accion: ui.boton('Create database', { escribe: true, alClic: () => cx.ir('rds/bases/crear') }) }
  });
  return h('div', { class: 'cx-pagina' }, t);
}

/** El menú Actions de una base o de un clúster (también en su página de detalle). */
function menuAcciones(cx, b) {
  return ui.menuBoton(
    'Actions',
    () => {
      if (!b) return [];
      const vivo = baseDe(cx, b.id) ?? b;
      if (esCluster(vivo)) {
        const aurora = vivo.tipo === 'aurora';
        const disp = vivo.estado === 'available';
        return [
          { texto: 'Add reader', escribe: true, desactivado: !aurora || !disp, alClic: () => cx.ir(`rds/bases/${vivo.id}/lector`) },
          { texto: 'Create cross-Region read replica', desactivado: true },
          { texto: 'Create clone', desactivado: true },
          { texto: 'Failover', escribe: true, desactivado: !aurora || !disp || vivo.miembros.length < 2, alClic: () => failoverCluster(cx, vivo) },
          '-',
          { texto: 'Stop temporarily', escribe: true, desactivado: !disp || vivo.expres, alClic: () => detener(cx, vivo) },
          { texto: 'Start', escribe: true, desactivado: vivo.estado !== 'stopped', alClic: () => arrancar(cx, vivo) },
          { texto: 'Delete', escribe: true, desactivado: vivo.estado === 'deleting', alClic: () => eliminar(cx, vivo) },
          '-',
          { texto: 'Take snapshot', escribe: true, desactivado: !['available', 'stopped'].includes(vivo.estado), alClic: () => cx.ir(`rds/bases/${vivo.id}/snapshot`) },
          { texto: 'Restore to point in time', escribe: true, desactivado: !vivo.primerRespaldo, alClic: () => cx.ir(`rds/bases/${vivo.id}/restaurar`) },
          { texto: 'Set up EC2 connection', escribe: true, desactivado: !disp || vivo.expres, alClic: () => modalConectarEc2(cx, vivo) }
        ];
      }
      const disp = vivo.estado === 'available';
      const enCluster = Boolean(vivo.clusterId);
      return [
        { texto: 'Convert to Multi-AZ deployment', escribe: true, desactivado: enCluster || vivo.multiAz || !disp || vivo.plantilla === 'freetier', alClic: () => convertirMultiAz(cx, vivo) },
        { texto: 'Stop temporarily', escribe: true, desactivado: enCluster || !disp, alClic: () => detener(cx, vivo) },
        { texto: 'Start', escribe: true, desactivado: vivo.estado !== 'stopped', alClic: () => arrancar(cx, vivo) },
        { texto: 'Reboot', escribe: true, desactivado: !disp, alClic: () => reiniciar(cx, vivo) },
        { texto: 'Delete', escribe: true, desactivado: vivo.estado === 'deleting', alClic: () => eliminar(cx, vivo) },
        '-',
        { texto: 'Set up EC2 connection', escribe: true, desactivado: enCluster || !disp, alClic: () => modalConectarEc2(cx, vivo) },
        { texto: 'Create read replica', escribe: true, desactivado: enCluster || !disp, alClic: () => cx.ir(`rds/bases/${vivo.id}/replica`) },
        { texto: 'Create Aurora read replica', desactivado: true },
        { texto: 'Promote', escribe: true, desactivado: vivo.rol !== 'replica' || !disp, alClic: () => promover(cx, vivo) },
        { texto: 'Take snapshot', escribe: true, desactivado: enCluster || !['available', 'stopped'].includes(vivo.estado), alClic: () => cx.ir(`rds/bases/${vivo.id}/snapshot`) },
        { texto: 'Restore to point in time', escribe: true, desactivado: enCluster || vivo.rol === 'replica', alClic: () => cx.ir(`rds/bases/${vivo.id}/restaurar`) },
        { texto: 'Migrate snapshot', desactivado: true }
      ];
    },
    { desactivado: !b }
  );
}

/* ============================================================ modales */

function detener(cx, b) {
  const snap = { crear: false, nombre: `${b.id}-stop-${Date.now().toString(36)}` };
  cx.confirmar({
    titulo: `Stop ${esCluster(b) ? 'DB cluster' : 'DB instance'} temporarily`,
    textoBoton: 'Stop temporarily',
    contenido: [
      ui.alerta({ tipo: 'aviso', contenido: `You can stop a ${esCluster(b) ? 'DB cluster' : 'DB instance'} for up to 7 days. If you don't manually start it after 7 days, it is automatically started. While stopped, you are charged for provisioned storage and backup storage, but not for DB instance hours.` }),
      h('p', {}, `Are you sure you want to stop ${b.id} temporarily?`),
      esCluster(b) ? null : ui.casilla({ etiqueta: 'Save the DB instance in a snapshot', descripcion: 'Optionally take a snapshot before stopping.', alCambiar: (v) => (snap.crear = v) })
    ],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'RDS', accion: esCluster(b) ? 'StopDBCluster' : 'StopDBInstance', error: `Failed to stop ${b.id}` }, (e) => {
        if (snap.crear) tomarSnapshotRds(e, { baseId: b.id, nombre: snap.nombre, interno: true });
        return detenerBaseRds(e, b.id);
      }, { atomico: true });
      if (r.ok) cx.flash({ tipo: 'exito', texto: `Stopping ${b.id}. It will be automatically started after 7 days.` });
      return r.ok;
    }
  });
}

function arrancar(cx, b) {
  const r = cx.hacer({ servicio: 'RDS', accion: esCluster(b) ? 'StartDBCluster' : 'StartDBInstance', error: `Failed to start ${b.id}` }, (e) => arrancarBaseRds(e, b.id));
  if (r.ok) cx.flash({ tipo: 'exito', texto: `Starting ${b.id}.` });
}

function reiniciar(cx, b) {
  const op = { failover: false };
  cx.confirmar({
    titulo: 'Reboot DB instance',
    textoBoton: 'Confirm',
    contenido: [
      h('p', {}, 'Are you sure you want to reboot this DB instance?'),
      h('ul', {}, h('li', {}, b.id)),
      ui.campo({
        etiqueta: 'Reboot with failover?',
        info: 'rds-failover',
        cx,
        control: ui.casilla({ etiqueta: 'Reboot with failover', descripcion: b.multiAz ? 'The standby in the other Availability Zone becomes the primary.' : 'Available only for Multi-AZ DB instance deployments.', desactivado: !b.multiAz, alCambiar: (v) => (op.failover = v) })
      })
    ],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'RDS', accion: 'RebootDBInstance', error: `Failed to reboot ${b.id}` }, (e) => reiniciarBaseRds(e, b.id, { failover: op.failover }));
      if (r.ok) cx.flash({ tipo: 'exito', texto: `Rebooting DB instance ${b.id}${op.failover ? ' with failover' : ''}.` });
      return r.ok;
    }
  });
}

function failoverCluster(cx, c) {
  const lectoras = c.miembros.map((id) => instDe(cx, id)).filter((x) => x?.rol === 'reader');
  const f = { destino: lectoras[0]?.id ?? null };
  cx.confirmar({
    titulo: `Failover DB cluster ${c.id}`,
    textoBoton: 'Failover',
    contenido: [
      h('p', {}, 'A failover promotes a reader instance to be the new writer. The current writer becomes a reader. Applications reconnect to the cluster endpoint automatically.'),
      ui.campo({ etiqueta: 'New writer', control: ui.selector({ opciones: lectoras.map((x) => ({ valor: x.id, etiqueta: x.id, descripcion: x.zona })), valor: f.destino, alCambiar: (v) => (f.destino = v) }) })
    ],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'RDS', accion: 'FailoverDBCluster', error: `Failed to fail over ${c.id}` }, (e) => failoverClusterRds(e, c.id, { destino: f.destino }));
      if (r.ok) cx.flash({ tipo: 'exito', texto: `Failing over DB cluster ${c.id}.` });
      return r.ok;
    }
  });
}

function promover(cx, b) {
  const f = { retencion: '7' };
  cx.confirmar({
    titulo: `Promote read replica ${b.id}`,
    textoBoton: 'Promote read replica',
    contenido: [
      ui.alerta({ tipo: 'aviso', contenido: 'After you promote the read replica, it becomes a standalone DB instance and stops replicating from its source. This can’t be undone.' }),
      ui.campo({ etiqueta: 'Backup retention period', info: 'rds-respaldo', cx, control: ui.selector({ opciones: Array.from({ length: 36 }, (_, i) => ({ valor: String(i), etiqueta: `${i} day${i === 1 ? '' : 's'}` })), valor: f.retencion, alCambiar: (v) => (f.retencion = v) }) })
    ],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'RDS', accion: 'PromoteReadReplica', error: `Failed to promote ${b.id}` }, (e) => promoverReplicaRds(e, b.id, { retencion: Number(f.retencion) }));
      if (r.ok) cx.flash({ tipo: 'exito', texto: `Promoting read replica ${b.id}.` });
      return r.ok;
    }
  });
}

function convertirMultiAz(cx, b) {
  cx.confirmar({
    titulo: `Convert ${b.id} to a Multi-AZ deployment`,
    textoBoton: 'Convert to Multi-AZ',
    contenido: [
      h('p', {}, 'Amazon RDS creates a synchronous standby replica in a different Availability Zone. The standby takes over automatically if the primary fails.'),
      ui.alerta({ tipo: 'info', contenido: 'The modification is applied immediately. Your DB instance stays available, but performance may be affected during the conversion. Multi-AZ doubles the DB instance cost.' })
    ],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'RDS', accion: 'ModifyDBInstance', error: `Failed to modify ${b.id}` }, (e) => modificarBaseRds(e, b.id, { multiAz: true }, { inmediato: true }));
      if (r.ok) cx.flash({ tipo: 'exito', texto: `Successfully modified DB instance ${b.id}. Converting to a Multi-AZ deployment.` });
      return r.ok;
    }
  });
}

function eliminar(cx, b) {
  const cluster = esCluster(b);
  const ultimo = !cluster && b.clusterId && (clusterDe(cx, b.clusterId)?.miembros.length ?? 0) === 1;
  const sinSnapshot = !cluster && (b.rol === 'replica' || (b.clusterId && !ultimo));
  const f = { snapshot: !sinSnapshot, nombre: `${cluster || ultimo ? (cluster ? b.id : b.clusterId) : b.id}-final-snapshot`, retener: false, acepto: false };
  const zona = ui.region(() => [
    sinSnapshot
      ? null
      : ui.casilla({ etiqueta: 'Create final snapshot', descripcion: 'Recommended. A final snapshot lets you restore this database later.', marcada: f.snapshot, alCambiar: (v) => ((f.snapshot = v), zona.repintar(), validar()) }),
    f.snapshot && !sinSnapshot ? ui.campo({ etiqueta: 'Final snapshot name', info: 'rds-snapshot', cx, control: ui.entrada({ valor: f.nombre, alCambiar: (v) => (f.nombre = v) }) }) : null,
    sinSnapshot ? null : ui.casilla({ etiqueta: 'Retain automated backups', descripcion: 'Automated backups are kept for the backup retention period after the database is deleted.', marcada: f.retener, alCambiar: (v) => (f.retener = v) }),
    !f.snapshot && !sinSnapshot
      ? ui.casilla({ etiqueta: 'I acknowledge that upon instance deletion, automated backups, including system snapshots and point-in-time recovery, will no longer be available.', marcada: f.acepto, alCambiar: (v) => ((f.acepto = v), validar()) })
      : null
  ], { clase: 'cx-form' });
  let escrito = '';
  const btn = ui.boton('Delete', { variante: 'primario', desactivado: true, alClic: () => aceptar() });
  const validar = () => {
    btn.disabled = escrito !== 'delete me' || (!f.snapshot && !sinSnapshot && !f.acepto);
  };
  const m = cx.modal({
    titulo: `Delete ${b.id} ${cluster ? 'DB cluster' : 'instance'}?`,
    ancho: 'grande',
    contenido: [
      b.protegida ? ui.alerta({ tipo: 'aviso', titulo: 'Deletion protection is enabled', contenido: 'This database can’t be deleted while deletion protection is enabled. Modify the database to turn it off first.' }) : null,
      h('p', {}, cluster ? `Deleting the DB cluster ${b.id} also deletes its ${b.miembros.length} DB instance(s).` : ultimo ? `This is the last DB instance in the DB cluster ${b.clusterId}. The DB cluster is deleted too.` : `Are you sure you want to delete the ${b.id} DB instance?`),
      b.replicas?.length ? ui.alerta({ tipo: 'info', contenido: `The read replicas of this DB instance (${b.replicas.join(', ')}) are promoted to standalone DB instances.` }) : null,
      zona,
      h(
        'div',
        { class: 'cx-confirmar' },
        ui.campo({
          etiqueta: h('span', {}, 'To confirm deletion, type ', h('i', {}, 'delete me'), ' into the field.'),
          control: ui.entrada({ placeholder: 'delete me', alCambiar: (v) => ((escrito = v), validar()), alEnter: () => !btn.disabled && aceptar() })
        })
      )
    ],
    pie: [ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }), btn]
  });
  function aceptar() {
    const r = cx.hacer({ servicio: 'RDS', accion: cluster ? 'DeleteDBCluster' : 'DeleteDBInstance', error: `Failed to delete ${b.id}` }, (e) =>
      eliminarBaseRds(e, b.id, { snapshotFinal: f.snapshot && !sinSnapshot, nombreSnapshot: f.nombre, retenerRespaldos: f.retener })
    );
    if (r.ok) {
      m.cerrar();
      cx.flash({ tipo: 'exito', texto: `Deleting ${b.id}. ${f.snapshot && !sinSnapshot ? `Final snapshot ${f.nombre.toLowerCase()} is being created.` : ''}` });
      if (cx.ruta !== 'rds/bases') cx.ir('rds/bases');
    }
  }
}

function modalConectarEc2(cx, b) {
  const insts = cx.estado.instancias.filter((i) => i.estado !== 'terminated' && i.vpcId === b.vpcId);
  const f = { inst: insts[0]?.id ?? null };
  const m = cx.modal({
    titulo: 'Set up EC2 connection',
    ancho: 'grande',
    contenido: [
      h('p', { class: 'cx-texto-sec' }, `RDS adds a security group to ${b.id} and another one to the EC2 instance so the instance can connect to the database on port ${b.puerto}.`),
      ui.campo({
        etiqueta: 'EC2 instance',
        info: 'rds-conectividad',
        cx,
        control: ui.selector({ opciones: insts.map((i) => ({ valor: i.id, etiqueta: idParentesis(i), descripcion: `${i.estado} · ${i.az}` })), valor: f.inst, placeholder: 'Choose an EC2 instance', vacio: `No EC2 instances in ${b.vpcId}`, filtrar: true, alCambiar: (v) => (f.inst = v) }),
        restriccion: 'Only EC2 instances in the same VPC as the database are shown.'
      })
    ],
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Set up', {
        variante: 'primario',
        alClic: () => {
          if (!f.inst) return;
          const r = cx.hacer({ servicio: 'RDS', accion: 'Set up EC2 connection', error: 'Failed to set up EC2 connection' }, (e) => conectarEc2Rds(e, b.id, f.inst), { atomico: true });
          if (r.ok) {
            m.cerrar();
            cx.flash({ tipo: 'exito', texto: `Successfully set up the connection between ${b.id} and ${f.inst}.` });
          }
        }
      })
    ]
  });
}

function modalConexion(cx, id) {
  const datos = cx.memoria.rdsCreada?.id === id ? cx.memoria.rdsCreada : null;
  const cuerpo = cx.vivo(() => {
    const b = baseDe(cx, id);
    if (!b) return h('p', {}, 'The database no longer exists.');
    return ui.pares(
      [
        { etiqueta: 'Master username', valor: b.usuario },
        { etiqueta: 'Master password', valor: datos?.contrasena ? ui.copiable(datos.contrasena) : b.credenciales === 'secrets' ? 'Managed in AWS Secrets Manager' : b.credenciales === 'iam' ? 'IAM authentication' : 'Use the password that you specified' },
        { etiqueta: 'Endpoint', valor: b.estado === 'creating' ? ui.estado('pendiente', 'Creating') : ui.copiable(b.endpoint) },
        { etiqueta: 'Port', valor: String(b.puerto) }
      ],
      { columnas: 2 }
    );
  });
  const m = cx.modal({
    titulo: `Connection details to your database ${id}`,
    contenido: [datos?.contrasena ? ui.alerta({ tipo: 'aviso', contenido: 'This is the only time you can view this password. Copy and save it in a secure place.' }) : null, cuerpo],
    pie: [ui.boton('Close', { alClic: () => m.cerrar() })]
  });
}

/* ======================================================= Create database */

/** Lo que cambia cada plantilla (y la Easy create). */
function aplicarPlantilla(f) {
  const m = motorRds(f.motor);
  if (m.aurora) {
    if (f.plantilla === 'freetier') f.plantilla = 'devtest';
    f.familia = 'serverless';
    f.clase = 'db.serverless';
    f.replicaAurora = f.plantilla === 'production';
    f.protegida = f.plantilla === 'production';
    f.retencion = '7';
    return;
  }
  if (f.plantilla === 'freetier') {
    f.despliegue = 'single';
    f.familia = 'burstable';
    f.clase = 'db.t4g.micro';
    f.almacenamiento = { tipo: 'gp2', gib: '20', iops: '3000', autoescalado: false, maximo: '1000' };
    f.retencion = '1';
    f.protegida = false;
  } else if (f.plantilla === 'production') {
    f.despliegue = 'multiaz';
    f.familia = 'standard';
    f.clase = 'db.m7g.large';
    f.almacenamiento = { tipo: 'io2', gib: '100', iops: '3000', autoescalado: true, maximo: '1000' };
    f.retencion = '7';
    f.protegida = true;
  } else {
    f.despliegue = 'single';
    f.familia = 'standard';
    f.clase = 'db.m7g.large';
    f.almacenamiento = { tipo: 'gp3', gib: '20', iops: '3000', autoescalado: true, maximo: '1000' };
    f.retencion = '7';
    f.protegida = false;
  }
}

const FAMILIAS = [
  { valor: 'standard', etiqueta: 'Standard classes (includes m classes)' },
  { valor: 'memory', etiqueta: 'Memory optimized classes (includes r and x classes)' },
  { valor: 'burstable', etiqueta: 'Burstable classes (includes t classes)' }
];

/** Las clases que ofrece la consola según motor, despliegue, plantilla y familia. */
function clasesPara(f) {
  const aurora = esAurora(f.motor);
  const donde = aurora ? 'aurora' : f.despliegue === 'cluster' ? 'cluster' : 'instancia';
  return CLASES_RDS.filter((k) => k.donde.includes(donde) && (f.plantilla !== 'freetier' || k.capaGratuita) && (k.familia === f.familia || (aurora && f.familia === 'serverless' && k.familia === 'serverless')));
}

/** Las llaves de KMS propias que sirven para cifrar: habilitadas y simétricas. */
const llavesPropias = (cx) => (cx.estado.kms?.llaves ?? []).filter((k) => !k.administradaPorAws && k.estado === 'Enabled' && k.spec === 'SYMMETRIC_DEFAULT' && k.uso === 'ENCRYPT_DECRYPT');

/** «AWS KMS key» (cifrado de la base) o «Select the encryption key» (el secreto): la de AWS y las propias. */
const opcionesLlaveRds = (cx, servicio) => [
  { valor: `aws/${servicio}`, etiqueta: `(default) aws/${servicio}`, etiquetaDerecha: 'AWS managed key' },
  ...llavesPropias(cx).map((k) => ({ valor: k.id, etiqueta: k.alias ?? k.id, descripcion: k.id, etiquetaDerecha: 'Customer managed key' }))
];

/** El texto de la llave de una base cifrada: «aws/rds» o el alias de la llave propia. */
const textoLlaveRds = (cx, b) => (b.cifrada ? nombreLlaveKms(cx.estado, b.llaveKms ?? 'aws/rds') : null);

const opcionClase = (k) => ({
  valor: k.clase,
  etiqueta: k.clase,
  etiquetas: k.vcpu ? [`${k.vcpu} vCPUs`, `${k.memoria} GiB RAM`, 'Network: up to 5 Gbps'] : ['Aurora capacity units (ACUs)'],
  etiquetaDerecha: k.capaGratuita ? 'Free tier eligible' : undefined
});

function crearBase(cx) {
  cx.migas([{ texto: 'Aurora and RDS', ruta: 'rds' }, { texto: 'Databases', ruta: 'rds/bases' }, { texto: 'Create database' }]);
  const e = cx.estado;
  const vpcDef = e.vpcs.find((v) => v.porDefecto) ?? e.vpcs[0];
  const n = col(cx).instancias.length + col(cx).clusteres.length + 1;
  const f = {
    metodo: 'standard',
    motor: 'mysql',
    version: motorRds('mysql').versiones[0],
    plantilla: 'devtest',
    despliegue: 'single',
    replicaAurora: false,
    id: `database-${n}`,
    usuario: 'admin',
    credenciales: 'self',
    autoContrasena: false,
    contrasena: '',
    confirmar: '',
    familia: 'standard',
    clase: 'db.m7g.large',
    serverless: { min: '0', max: '4' },
    almacenamiento: { tipo: 'gp3', gib: '20', iops: '3000', autoescalado: true, maximo: '1000' },
    auroraAlmacen: 'standard',
    computo: 'no',
    ec2: null,
    vpcId: vpcDef?.id ?? null,
    grupoSubredes: '',
    publica: false,
    sgModo: 'existente',
    sgs: e.gruposSeguridad.filter((g) => g.vpcId === vpcDef?.id && g.porDefecto).map((g) => g.id),
    sgNombre: '',
    zona: '',
    puerto: '3306',
    nombreBase: '',
    respaldos: true,
    retencion: '7',
    copiarEtiquetas: true,
    cifrada: true,
    llaveKms: 'aws/rds',
    credencialesLlaveKms: 'aws/secretsmanager',
    actualizacionMenor: true,
    protegida: false,
    etiquetas: [],
    errores: {}
  };
  aplicarPlantilla(f);

  const m = () => motorRds(f.motor);
  const aurora = () => Boolean(m().aurora);
  const facil = () => f.metodo === 'easy';
  const secciones = [];
  const seccion = (fn) => {
    const r = ui.region(fn);
    secciones.push(r);
    return r;
  };
  const repintarTodo = () => secciones.forEach((s) => s.repintar());

  /* ---------- Choose a database creation method */
  const secMetodo = seccion(() =>
    ui.contenedor({
      titulo: 'Choose a database creation method',
      info: 'rds-base',
      cx,
      cuerpo: ui.tarjetas({
        valor: f.metodo,
        columnas: 2,
        opciones: [
          { valor: 'standard', etiqueta: 'Standard create', descripcion: 'You set all of the configuration options, including ones for availability, security, backups, and maintenance.' },
          { valor: 'easy', etiqueta: 'Easy create', descripcion: 'Use recommended best-practice configurations. Some configuration options can be changed after the database is created.' }
        ],
        alCambiar: (v) => {
          f.metodo = v;
          repintarTodo();
        }
      })
    })
  );

  /* ---------- Engine options */
  const secMotor = seccion(() =>
    ui.contenedor({
      titulo: 'Engine options',
      info: 'rds-motor',
      cx,
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({
          etiqueta: 'Engine type',
          control: h(
            'div',
            { class: 'cx-rds-motores' },
            ui.tarjetas({
              valor: f.motor,
              columnas: 4,
              opciones: MOTORES_RDS.map((x) => ({ valor: x.motor, etiqueta: x.nombre, descripcion: x.desactivado ? 'Not available in this simulator' : x.aurora ? 'Up to 5x the throughput of MySQL/3x of PostgreSQL' : undefined, desactivado: x.desactivado })),
              alCambiar: (v) => {
                f.motor = v;
                const mm = motorRds(v);
                f.version = mm.versiones[0];
                f.usuario = mm.usuario;
                f.puerto = String(mm.puerto);
                if (f.despliegue === 'cluster' && v === 'mariadb') f.despliegue = 'single';
                aplicarPlantilla(f);
                repintarTodo();
              }
            })
          )
        }),
        facil()
          ? null
          : ui.campo({
              etiqueta: 'Engine version',
              info: 'rds-motor',
              cx,
              control: ui.selector({ opciones: m().versiones.map((v, i) => ({ valor: v, etiqueta: f.motor === 'aurora-mysql' ? `Aurora MySQL ${v.replace(/^8\.0\.mysql_aurora\./, '')} (compatible with MySQL 8.0)` : `${m().corto} ${v}`, etiquetaDerecha: i === 0 ? 'Default' : undefined })), valor: f.version, alCambiar: (v) => ((f.version = v), cambio()) })
            }),
        aurora() || facil() ? null : ui.casilla({ etiqueta: 'Enable RDS Extended Support', descripcion: 'Amazon RDS Extended Support is a paid offering. By selecting this option, you consent to being charged for this offering if you are running your database major version past the RDS end of standard support date.', desactivado: true })
      )
    })
  );

  /* ---------- Templates */
  const secPlantilla = seccion(() =>
    ui.contenedor({
      titulo: facil() ? 'DB instance size' : 'Templates',
      info: 'rds-plantilla',
      cx,
      descripcion: facil() ? null : 'Choose a sample template to meet your use case.',
      cuerpo: ui.tarjetas({
        valor: f.plantilla,
        columnas: 3,
        opciones: [
          { valor: 'production', etiqueta: 'Production', descripcion: facil() ? 'db.m7g.large · 2 vCPUs · 8 GiB RAM · 100 GiB · Multi-AZ' : 'Use defaults for high availability and fast, consistent performance.' },
          { valor: 'devtest', etiqueta: 'Dev/Test', descripcion: facil() ? 'db.m7g.large · 2 vCPUs · 8 GiB RAM · 20 GiB' : 'This instance is intended for development use outside of a production environment.' },
          { valor: 'freetier', etiqueta: 'Free tier', descripcion: facil() ? 'db.t4g.micro · 2 vCPUs · 1 GiB RAM · 20 GiB' : 'Use RDS Free Tier to develop new applications, test existing applications, or gain hands-on experience with Amazon RDS.', desactivado: aurora() }
        ],
        alCambiar: (v) => {
          f.plantilla = v;
          aplicarPlantilla(f);
          repintarTodo();
        }
      })
    })
  );

  /* ---------- Availability and durability */
  const secDisponibilidad = seccion(() => {
    if (facil()) return null;
    if (aurora()) {
      return ui.contenedor({
        titulo: 'Availability and durability',
        info: 'rds-despliegue',
        cx,
        cuerpo: ui.campo({
          etiqueta: 'Multi-AZ deployment',
          control: ui.radios({
            valor: f.replicaAurora ? 'si' : 'no',
            opciones: [
              { valor: 'si', etiqueta: 'Create an Aurora Replica or Reader node in a different AZ (recommended for scaled availability)', descripcion: 'Creates an Aurora Replica for fast failover and high availability.' },
              { valor: 'no', etiqueta: "Don't create an Aurora Replica" }
            ],
            alCambiar: (v) => ((f.replicaAurora = v === 'si'), cambio())
          })
        })
      });
    }
    const libre = f.plantilla === 'freetier';
    return ui.contenedor({
      titulo: 'Availability and durability',
      info: 'rds-despliegue',
      cx,
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({
          etiqueta: 'Deployment options',
          info: 'rds-despliegue',
          cx,
          descripcion: 'The deployment options below are limited to those supported by the engine you selected above.',
          control: ui.tarjetas({
            valor: f.despliegue,
            columnas: 1,
            opciones: [
              { valor: 'cluster', etiqueta: 'Multi-AZ DB cluster deployment (3 instances)', descripcion: 'Creates a DB cluster with a primary DB instance and two readable standby DB instances, with each DB instance in a different Availability Zone (AZ). Provides high availability, data redundancy and increases capacity to serve read workloads.', desactivado: libre || f.motor === 'mariadb' },
              { valor: 'multiaz', etiqueta: 'Multi-AZ DB instance deployment (2 instances)', descripcion: 'Creates a primary DB instance and a standby DB instance in a different AZ. Provides high availability and data redundancy, but the standby DB instance doesn’t support connections for read workloads.', desactivado: libre },
              { valor: 'single', etiqueta: 'Single-AZ DB instance deployment (1 instance)', descripcion: 'Creates a single DB instance with no standby DB instances.' }
            ],
            alCambiar: (v) => {
              f.despliegue = v;
              if (v === 'cluster') {
                f.familia = 'standard';
                f.clase = 'db.m6gd.large';
                f.almacenamiento = { tipo: 'io2', gib: '100', iops: '1000', autoescalado: false, maximo: '1000' };
              } else if (claseRds(f.clase)?.donde.includes('cluster')) {
                f.clase = 'db.m7g.large';
                f.almacenamiento = { tipo: 'gp3', gib: '20', iops: '3000', autoescalado: true, maximo: '1000' };
              }
              repintarTodo();
            }
          })
        }),
        libre ? ui.alerta({ tipo: 'info', contenido: 'The Free tier template supports only Single-AZ DB instance deployments. To use Multi-AZ, choose the Production or Dev/Test template.' }) : null
      )
    });
  });

  /* ---------- Settings */
  let fuerza = null;
  const fuerzaDe = (c) => (!c ? 'Neutral' : c.length < 8 ? 'Weak' : /[A-Z]/.test(c) && /[0-9]/.test(c) && /[^A-Za-z0-9]/.test(c) ? 'Strong' : 'Fair');
  const secAjustes = seccion(() => {
    const contra = f.credenciales === 'self' && !f.autoContrasena;
    return ui.contenedor({
      titulo: 'Settings',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({
          etiqueta: aurora() || f.despliegue === 'cluster' ? 'DB cluster identifier' : 'DB instance identifier',
          info: 'rds-identificador',
          cx,
          descripcion: 'Type a name for your DB instance. The name must be unique across all DB instances owned by your AWS account in the current AWS Region.',
          control: ui.entrada({ valor: f.id, alCambiar: (v) => ((f.id = v), cambio()) }),
          error: f.errores.id,
          restriccion: 'The DB instance identifier is case-insensitive, but is stored as all lowercase (as in "mydbinstance"). Constraints: 1 to 60 alphanumeric characters or hyphens. First character must be a letter. Can\'t contain two consecutive hyphens. Can\'t end with a hyphen.'
        }),
        ui.expandible({
          titulo: 'Credentials Settings',
          fuerte: true,
          abierto: true,
          contenido: h(
            'div',
            { class: 'cx-form' },
            ui.campo({ etiqueta: 'Master username', info: 'rds-credenciales', cx, descripcion: 'Type a login ID for the master user of your DB instance.', control: ui.entrada({ valor: f.usuario, alCambiar: (v) => (f.usuario = v) }), error: f.errores.usuario, restriccion: '1 to 16 alphanumeric characters. The first character must be a letter.' }),
            ui.campo({
              etiqueta: 'Credentials management',
              info: 'rds-credenciales',
              cx,
              descripcion: 'You can use AWS Secrets Manager or manage your master user credentials.',
              control: ui.tarjetas({
                valor: f.credenciales,
                columnas: 2,
                opciones: [
                  { valor: 'secrets', etiqueta: 'Managed in AWS Secrets Manager - most secure', descripcion: 'RDS generates a password for you and manages it throughout its lifecycle using AWS Secrets Manager.' },
                  { valor: 'self', etiqueta: 'Self managed', descripcion: 'Create your own password or have RDS create a password that you manage.' }
                ],
                alCambiar: (v) => ((f.credenciales = v), secAjustes.repintar())
              })
            }),
            f.credenciales === 'secrets'
              ? ui.campo({
                  etiqueta: 'Select the encryption key',
                  info: 'rds-credenciales',
                  cx,
                  descripcion: 'You can encrypt using the KMS key that Secrets Manager creates or a customer managed KMS key that you create.',
                  control: h(
                    'div',
                    { class: 'cx-fila-campos' },
                    h('div', { style: { flex: '1 1 260px' } }, ui.selector({ opciones: opcionesLlaveRds(cx, 'secretsmanager'), valor: f.credencialesLlaveKms, alCambiar: (v) => (f.credencialesLlaveKms = v) })),
                    ui.enlace('Add new key', 'kms/crear', { cx, externo: true })
                  )
                })
              : null,
            f.credenciales === 'self' ? ui.casilla({ etiqueta: 'Auto generate password', descripcion: 'Amazon RDS can generate a password for you, or you can specify your own password.', marcada: f.autoContrasena, alCambiar: (v) => ((f.autoContrasena = v), secAjustes.repintar()) }) : null,
            contra
              ? ui.campo({ etiqueta: 'Master password', info: 'rds-credenciales', cx, control: ui.entrada({ tipo: 'password', valor: f.contrasena, alCambiar: (v) => ((f.contrasena = v), fuerza?.repintar()) }), error: f.errores.contrasena, restriccion: 'Minimum constraints: At least 8 printable ASCII characters. Can\'t contain any of the following symbols: / \' " @' })
              : null,
            contra ? (fuerza = ui.region(() => h('div', { class: 'cx-campo__restriccion' }, `Password strength: ${fuerzaDe(f.contrasena)}`))) : null,
            contra ? ui.campo({ etiqueta: 'Confirm master password', control: ui.entrada({ tipo: 'password', valor: f.confirmar, alCambiar: (v) => (f.confirmar = v) }), error: f.errores.confirmar }) : null
          )
        })
      )
    });
  });

  /* ---------- Instance configuration */
  const secClase = seccion(() => {
    if (facil()) return null;
    const familias = aurora() ? [{ valor: 'serverless', etiqueta: 'Serverless v2' }, FAMILIAS[1], FAMILIAS[2]] : f.despliegue === 'cluster' ? FAMILIAS.slice(0, 2) : f.plantilla === 'freetier' ? FAMILIAS.slice(2) : FAMILIAS;
    const opciones = clasesPara(f).map(opcionClase);
    return ui.contenedor({
      titulo: 'Instance configuration',
      info: 'rds-clase',
      cx,
      descripcion: 'The DB instance configuration options below are limited to those supported by the engine that you selected above.',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({
          etiqueta: 'DB instance class',
          info: 'rds-clase',
          cx,
          control: h(
            'div',
            { class: 'cx-form' },
            ui.radios({
              valor: f.familia,
              opciones: familias,
              alCambiar: (v) => {
                f.familia = v;
                f.clase = clasesPara(f)[0]?.clase ?? null;
                secClase.repintar();
                cambio();
              }
            }),
            f.familia === 'serverless'
              ? h(
                  'div',
                  { class: 'cx-fila-campos' },
                  ui.campo({ etiqueta: 'Minimum capacity (ACUs)', control: ui.entrada({ tipo: 'number', valor: f.serverless.min, alCambiar: (v) => ((f.serverless.min = v), cambio()) }), restriccion: '0 to 256 ACUs. 1 ACU ≈ 2 GiB of memory.' }),
                  ui.campo({ etiqueta: 'Maximum capacity (ACUs)', control: ui.entrada({ tipo: 'number', valor: f.serverless.max, alCambiar: (v) => ((f.serverless.max = v), cambio()) }), restriccion: '1 to 256 ACUs' })
                )
              : ui.selector({ opciones, valor: f.clase, filtrar: true, placeholder: 'Choose a DB instance class', alCambiar: (v) => ((f.clase = v), cambio()) })
          )
        }),
        ui.casilla({ etiqueta: 'Include previous generation classes', desactivado: true })
      )
    });
  });

  /* ---------- Storage */
  const secAlmacen = seccion(() => {
    if (facil()) return null;
    if (aurora()) {
      return ui.contenedor({
        titulo: 'Cluster storage configuration',
        info: 'rds-almacenamiento',
        cx,
        cuerpo: ui.tarjetas({
          valor: f.auroraAlmacen,
          columnas: 2,
          opciones: [
            { valor: 'io-optimized', etiqueta: 'Aurora I/O-Optimized', descripcion: 'Predictable pricing for all applications. Improved price performance for I/O-intensive applications (I/O costs >25% of total database costs).' },
            { valor: 'standard', etiqueta: 'Aurora Standard', descripcion: 'Cost-effective pricing for many applications with moderate I/O usage (I/O costs <25% of total database costs).' }
          ],
          alCambiar: (v) => ((f.auroraAlmacen = v), cambio())
        })
      });
    }
    const a = f.almacenamiento;
    return ui.contenedor({
      titulo: 'Storage',
      info: 'rds-almacenamiento',
      cx,
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({
          etiqueta: 'Storage type',
          info: 'rds-almacenamiento',
          cx,
          control: ui.selector({
            opciones: [
              { valor: 'gp3', etiqueta: 'General Purpose SSD (gp3)', descripcion: 'Performance scales independently from storage' },
              { valor: 'gp2', etiqueta: 'General Purpose SSD (gp2)', descripcion: 'Baseline performance determined by volume size' },
              { valor: 'io2', etiqueta: 'Provisioned IOPS SSD (io2)', descripcion: 'Flexibility in provisioning I/O' }
            ].filter((o) => f.despliegue !== 'cluster' || o.valor !== 'gp2'),
            valor: a.tipo,
            alCambiar: (v) => {
              a.tipo = v;
              if (v === 'io2' && Number(a.gib) < 100) a.gib = '100';
              secAlmacen.repintar();
              cambio();
            }
          })
        }),
        ui.campo({ etiqueta: 'Allocated storage', info: 'rds-almacenamiento', cx, control: ui.entrada({ tipo: 'number', valor: a.gib, sufijo: 'GiB', alCambiar: (v) => ((a.gib = v), cambio()) }), restriccion: `The minimum value is ${a.tipo === 'io2' ? 100 : 20} GiB and the maximum value is 65,536 GiB` }),
        a.tipo === 'io2' ? ui.campo({ etiqueta: 'Provisioned IOPS', control: ui.entrada({ tipo: 'number', valor: a.iops, sufijo: 'IOPS', alCambiar: (v) => (a.iops = v) }), restriccion: 'The minimum value is 1,000 IOPS and the maximum value is 256,000 IOPS.' }) : null,
        ui.expandible({
          titulo: 'Additional storage configuration',
          abierto: false,
          contenido: h(
            'div',
            { class: 'cx-form' },
            ui.campo({
              etiqueta: 'Storage autoscaling',
              info: 'rds-almacenamiento',
              cx,
              descripcion: 'Provides dynamic scaling support for your database’s storage based on your application’s needs.',
              control: ui.casilla({ etiqueta: 'Enable storage autoscaling', descripcion: 'Enabling this feature will allow the storage to increase after the specified threshold is exceeded.', marcada: a.autoescalado, alCambiar: (v) => ((a.autoescalado = v), secAlmacen.repintar()) })
            }),
            a.autoescalado ? ui.campo({ etiqueta: 'Maximum storage threshold', descripcion: 'Charges will apply when your database autoscales to the specified threshold', control: ui.entrada({ tipo: 'number', valor: a.maximo, sufijo: 'GiB', alCambiar: (v) => (a.maximo = v) }), restriccion: 'The minimum value is 22 GiB and the maximum value is 65,536 GiB' }) : null
          )
        })
      )
    });
  });

  /* ---------- Connectivity */
  const secRed = seccion(() => {
    const insts = e.instancias.filter((i) => i.estado !== 'terminated');
    const conectar = f.computo === 'si';
    const vpc = e.vpcs.find((v) => v.id === f.vpcId);
    const grupos = col(cx).gruposSubredes.filter((g) => g.vpcId === f.vpcId);
    const grupo = f.grupoSubredes ? grupoSubredesRdsDe(e, f.grupoSubredes) : null;
    const zonas = grupo ? zonasDeGrupoRds(e, grupo) : [...new Set(e.subredes.filter((s) => s.vpcId === f.vpcId).map((s) => s.az))].sort();
    const ec2 = (
      ui.campo({
        etiqueta: 'Compute resource',
        info: 'rds-conectividad',
        cx,
        descripcion: 'Choose whether to set up a connection to a compute resource for this database. Setting up a connection will automatically change connectivity settings so that the compute resource can connect to this database.',
        control: h(
          'div',
          { class: 'cx-form' },
          ui.tarjetas({
            valor: f.computo,
            columnas: 2,
            opciones: [
              { valor: 'no', etiqueta: "Don't connect to an EC2 compute resource", descripcion: "Don't set up a connection to a compute resource for this database. You can manually set up a connection to a compute resource later." },
              { valor: 'si', etiqueta: 'Connect to an EC2 compute resource', descripcion: 'Set up a connection to an EC2 compute resource for this database.' }
            ],
            alCambiar: (v) => {
              f.computo = v;
              if (v === 'si') f.publica = false;
              secRed.repintar();
              cambio();
            }
          }),
          conectar
            ? ui.campo({
                etiqueta: 'EC2 instance',
                control: ui.selector({
                  opciones: insts.map((i) => ({ valor: i.id, etiqueta: idParentesis(i), descripcion: `${i.estado} · ${i.vpcId} · ${i.az}` })),
                  valor: f.ec2,
                  filtrar: true,
                  placeholder: 'Choose an EC2 instance',
                  vacio: 'No EC2 instances. Launch one in EC2 first.',
                  alCambiar: (v) => {
                    f.ec2 = v;
                    const i = e.instancias.find((x) => x.id === v);
                    if (i && i.vpcId !== f.vpcId) {
                      f.vpcId = i.vpcId;
                      f.grupoSubredes = '';
                      f.sgs = [];
                    }
                    f.errores.ec2 = null;
                    secRed.repintar();
                  }
                }),
                error: f.errores.ec2
              })
            : null
        )
      })
    );
    return ui.contenedor({
      titulo: 'Connectivity',
      info: 'rds-conectividad',
      cx,
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ec2,
        facil()
          ? null
          : [
              ui.campo({ etiqueta: 'Network type', control: ui.radios({ valor: 'ipv4', opciones: [{ valor: 'ipv4', etiqueta: 'IPv4', descripcion: 'Your resources can communicate only over the IPv4 addressing protocol.' }, { valor: 'dual', etiqueta: 'Dual-stack mode', descripcion: 'Your resources can communicate over IPv4, IPv6, or both.', desactivado: true }] }) }),
              ui.campo({
                etiqueta: 'Virtual private cloud (VPC)',
                info: 'vpc',
                cx,
                descripcion: 'Choose the VPC. The VPC defines the virtual networking environment for this DB instance.',
                control: ui.selector({
                  opciones: opcionesVpc(e),
                  valor: f.vpcId,
                  desactivado: conectar,
                  alCambiar: (v) => {
                    f.vpcId = v;
                    f.grupoSubredes = '';
                    f.sgs = e.gruposSeguridad.filter((g) => g.vpcId === v && g.porDefecto).map((g) => g.id);
                    f.zona = '';
                    secRed.repintar();
                  }
                }),
                restriccion: 'After a database is created, you can’t change its VPC.'
              }),
              ui.campo({
                etiqueta: 'DB subnet group',
                info: 'rds-grupo-subredes',
                cx,
                descripcion: 'Choose the DB subnet group. The DB subnet group defines which subnets and IP ranges the DB instance can use in the VPC that you selected.',
                control: ui.selector({
                  opciones: [...grupos.map((g) => ({ valor: g.nombre, etiqueta: g.nombre, descripcion: `${g.subredes.length} Subnets, ${zonasDeGrupoRds(e, g).length} Availability Zones` })), { valor: '', etiqueta: conectar ? 'Automatic setup' : 'Create new DB Subnet Group', descripcion: `Uses all the subnets of ${vpc?.id ?? 'the VPC'}` }],
                  valor: f.grupoSubredes,
                  alCambiar: (v) => ((f.grupoSubredes = v), (f.zona = ''), secRed.repintar())
                })
              }),
              ui.campo({
                etiqueta: 'Public access',
                info: 'rds-acceso-publico',
                cx,
                control: ui.radios({
                  valor: f.publica ? 'si' : 'no',
                  opciones: [
                    { valor: 'si', etiqueta: 'Yes', descripcion: 'RDS assigns a public IP address to the database. Amazon EC2 instances and other resources outside of the VPC can connect to your database. Resources inside the VPC can also connect to the database. Choose one or more VPC security groups that specify which resources can connect to the database.', desactivado: conectar },
                    { valor: 'no', etiqueta: 'No', descripcion: 'RDS doesn’t assign a public IP address to the database. Only Amazon EC2 instances and other resources inside the VPC can connect to your database. Choose one or more VPC security groups that specify which resources can connect to the database.' }
                  ],
                  alCambiar: (v) => ((f.publica = v === 'si'), cambio())
                })
              }),
              ui.campo({
                etiqueta: 'VPC security group (firewall)',
                info: 'rds-grupo-seguridad',
                cx,
                descripcion: 'Choose one or more VPC security groups to allow access to your database. Make sure that the security group rules allow the appropriate incoming traffic.',
                control: ui.tarjetas({
                  valor: f.sgModo,
                  columnas: 2,
                  opciones: [
                    { valor: 'existente', etiqueta: 'Choose existing', descripcion: 'Choose existing VPC security groups' },
                    { valor: 'nuevo', etiqueta: 'Create new', descripcion: 'Create new VPC security group' }
                  ],
                  alCambiar: (v) => ((f.sgModo = v), secRed.repintar())
                })
              }),
              f.sgModo === 'existente'
                ? ui.campo({
                    etiqueta: 'Existing VPC security groups',
                    control: ui.selector({
                      multiple: true,
                      valores: f.sgs,
                      filtrar: true,
                      placeholder: 'Choose one or more options',
                      opciones: e.gruposSeguridad.filter((g) => g.vpcId === f.vpcId).map((g) => ({ valor: g.id, etiqueta: g.nombre, descripcion: g.id })),
                      alCambiar: (v) => (f.sgs = v)
                    }),
                    restriccion: conectar ? 'RDS also adds a new rds-ec2-N security group that lets the EC2 instance connect.' : null
                  })
                : ui.campo({ etiqueta: 'New VPC security group name', control: ui.entrada({ valor: f.sgNombre, alCambiar: (v) => (f.sgNombre = v) }), error: f.errores.sgNombre, restriccion: `RDS adds an inbound rule for port ${f.puerto} from your current IP address (${e.cuenta.ipCasa}/32).` }),
              f.despliegue === 'single' && !aurora()
                ? ui.campo({
                    etiqueta: 'Availability Zone',
                    info: 'zona',
                    cx,
                    control: ui.selector({ opciones: [{ valor: '', etiqueta: 'No preference' }, ...zonas.map((z) => ({ valor: z, etiqueta: z }))], valor: f.zona, alCambiar: (v) => (f.zona = v) })
                  })
                : null,
              ui.campo({ etiqueta: 'RDS Proxy', descripcion: 'RDS Proxy is a fully managed, highly available database proxy that improves application scalability, resiliency, and security.', control: ui.casilla({ etiqueta: 'Create an RDS Proxy', desactivado: true }) }),
              ui.campo({ etiqueta: 'Certificate authority - optional', control: ui.selector({ opciones: [{ valor: 'g1', etiqueta: 'rds-ca-rsa2048-g1 (default)', descripcion: 'Expiry: May 25, 2061' }], valor: 'g1', desactivado: true }) }),
              ui.expandible({
                titulo: 'Additional configuration',
                contenido: ui.campo({ etiqueta: 'Database port', descripcion: 'TCP/IP port that the database will use for application connections.', control: ui.entrada({ tipo: 'number', valor: f.puerto, alCambiar: (v) => (f.puerto = v) }) })
              })
            ]
      )
    });
  });

  /* ---------- Tags, authentication, monitoring */
  const secEtiquetas = seccion(() =>
    facil()
      ? null
      : ui.contenedor({
          titulo: 'Tags - optional',
          descripcion: 'A tag consists of a case-sensitive key-value pair.',
          cuerpo: ui.editorEtiquetas({ filas: f.etiquetas })
        })
  );
  const secAutenticacion = seccion(() =>
    facil()
      ? null
      : ui.contenedor({
          titulo: 'Database authentication',
          cuerpo: ui.radios({
            valor: 'password',
            opciones: [
              { valor: 'password', etiqueta: 'Password authentication', descripcion: 'Authenticates using database passwords.' },
              { valor: 'iam', etiqueta: 'Password and IAM database authentication', descripcion: 'Authenticates using the database password and user credentials through AWS IAM users and roles.', desactivado: true },
              { valor: 'kerberos', etiqueta: 'Password and Kerberos authentication', descripcion: 'Choose a directory in which you want to allow authorized users to authenticate with this DB instance using Kerberos Authentication.', desactivado: true }
            ]
          })
        })
  );
  const secMonitoreo = seccion(() =>
    facil()
      ? null
      : ui.contenedor({
          titulo: 'Monitoring',
          plegable: true,
          abierto: false,
          cuerpo: h(
            'div',
            { class: 'cx-form' },
            ui.campo({ etiqueta: 'Database Insights', control: ui.radios({ valor: 'std', opciones: [{ valor: 'adv', etiqueta: 'Database Insights - Advanced', descripcion: 'Retains 15 months of performance history', desactivado: true }, { valor: 'std', etiqueta: 'Database Insights - Standard', descripcion: 'Retains 7 days of performance history, with the option to pay for the retention of up to 24 months of performance history' }] }) }),
            ui.casilla({ etiqueta: 'Enable Enhanced monitoring', descripcion: 'Enabling Enhanced Monitoring metrics are useful when you want to see how different processes or threads use the CPU.', desactivado: true })
          )
        })
  );

  /* ---------- Additional configuration */
  const secAdicional = seccion(() => {
    if (facil()) return null;
    const opcionesRet = Array.from({ length: aurora() ? 35 : 35 }, (_, i) => ({ valor: String(i + 1), etiqueta: `${i + 1} day${i ? 's' : ''}` }));
    return ui.contenedor({
      titulo: 'Additional configuration',
      descripcion: 'Database options, encryption turned on, backup turned on, backtrack turned off, maintenance, CloudWatch Logs, delete protection turned off.',
      plegable: true,
      abierto: true,
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        h('div', { class: 'cx-bloque__titulo' }, 'Database options'),
        ui.campo({ etiqueta: 'Initial database name', info: 'rds-base', cx, opcional: true, control: ui.entrada({ valor: f.nombreBase, alCambiar: (v) => (f.nombreBase = v) }), restriccion: 'If you do not specify a database name, Amazon RDS does not create a database.' }),
        ui.campo({ etiqueta: 'DB parameter group', control: ui.selector({ opciones: [{ valor: 'd', etiqueta: `default.${f.motor}${(f.version.match(/^\d+(\.\d+)?/) ?? [''])[0]}` }], valor: 'd', desactivado: true }) }),
        h('div', { class: 'cx-bloque__titulo' }, 'Backup'),
        aurora() ? null : ui.casilla({ etiqueta: 'Enable automated backups', descripcion: 'Creates a point-in-time snapshot of your database', marcada: f.respaldos, alCambiar: (v) => ((f.respaldos = v), secAdicional.repintar()) }),
        f.respaldos || aurora()
          ? [
              ui.campo({ etiqueta: 'Backup retention period', info: 'rds-respaldo', cx, descripcion: 'The number of days (1-35) for which automatic backups are kept.', control: ui.selector({ opciones: opcionesRet, valor: f.retencion, alCambiar: (v) => (f.retencion = v) }) }),
              ui.campo({ etiqueta: 'Backup window', descripcion: 'The daily time range (in UTC) during which RDS takes automated backups.', control: ui.radios({ valor: 'np', horizontal: true, opciones: [{ valor: 'w', etiqueta: 'Choose a window', desactivado: true }, { valor: 'np', etiqueta: 'No preference' }] }) }),
              ui.casilla({ etiqueta: 'Copy tags to snapshots', marcada: f.copiarEtiquetas, alCambiar: (v) => (f.copiarEtiquetas = v) })
            ]
          : ui.alerta({ tipo: 'aviso', contenido: 'Without automated backups you can’t restore to a point in time, and you can’t create read replicas of this DB instance.' }),
        h('div', { class: 'cx-bloque__titulo' }, 'Encryption'),
        ui.casilla({ etiqueta: 'Enable encryption', descripcion: 'Choose to encrypt the given instance. Master key IDs and aliases appear in the list after they have been created using the AWS Key Management Service console.', marcada: f.cifrada, alCambiar: (v) => ((f.cifrada = v), secAdicional.repintar()) }),
        f.cifrada
          ? ui.campo({
              etiqueta: 'AWS KMS key',
              info: 'rds-cifrado',
              cx,
              control: h(
                'div',
                { class: 'cx-fila-campos' },
                h('div', { style: { flex: '1 1 260px' } }, ui.selector({ opciones: opcionesLlaveRds(cx, 'rds'), valor: f.llaveKms, alCambiar: (v) => (f.llaveKms = v) })),
                ui.enlace('Add new key', 'kms/crear', { cx, externo: true })
              )
            })
          : null,
        h('div', { class: 'cx-bloque__titulo' }, 'Log exports'),
        ['Audit log', 'Error log', 'General log', 'Slow query log'].map((t) => ui.casilla({ etiqueta: t, desactivado: true })),
        h('div', { class: 'cx-bloque__titulo' }, 'Maintenance'),
        ui.casilla({ etiqueta: 'Enable auto minor version upgrade', descripcion: 'Enabling auto minor version upgrade will automatically upgrade to new minor versions as they are released.', marcada: f.actualizacionMenor, alCambiar: (v) => (f.actualizacionMenor = v) }),
        ui.campo({ etiqueta: 'Maintenance window', control: ui.radios({ valor: 'np', horizontal: true, opciones: [{ valor: 'w', etiqueta: 'Choose a window', desactivado: true }, { valor: 'np', etiqueta: 'No preference' }] }) }),
        h('div', { class: 'cx-bloque__titulo' }, 'Deletion protection'),
        ui.casilla({ etiqueta: 'Enable deletion protection', descripcion: 'Protects the database from being deleted accidentally. While this option is enabled, you can’t delete the database.', marcada: f.protegida, alCambiar: (v) => (f.protegida = v) })
      )
    });
  });

  /* ---------- Easy create: los valores por omisión */
  const secFacil = seccion(() => {
    if (!facil()) return null;
    const mm = m();
    return ui.contenedor({
      titulo: 'View default settings for Easy create',
      plegable: true,
      abierto: false,
      descripcion: 'Easy create sets the following configurations to their default values, some of which can be changed later. If you want to change any of these settings now, use Standard create.',
      cuerpo: ui.pares(
        [
          { etiqueta: 'Encryption', valor: 'Enabled' },
          { etiqueta: 'VPC', valor: f.vpcId },
          { etiqueta: 'Option group', valor: `default:${f.motor}` },
          { etiqueta: 'Subnet group', valor: f.grupoSubredes || 'Create new DB Subnet Group' },
          { etiqueta: 'Automatic backups', valor: 'Enabled' },
          { etiqueta: 'VPC security group', valor: 'default' },
          { etiqueta: 'Publicly accessible', valor: 'No' },
          { etiqueta: 'Database port', valor: String(mm.puerto) },
          { etiqueta: 'DB engine version', valor: mm.versiones[0] },
          { etiqueta: 'Auto minor version upgrade', valor: 'Enabled' },
          { etiqueta: 'Deletion protection', valor: f.plantilla === 'production' ? 'Enabled' : 'Disabled' },
          { etiqueta: 'Multi-AZ', valor: f.plantilla === 'production' ? 'Yes' : 'No' }
        ],
        { columnas: 3 }
      )
    });
  });

  /* ---------- Estimated monthly costs */
  const fila = (t, v, fuerte) => h('div', { class: ['cx-rds-costo__fila', fuerte && 'cx-rds-costo__fila--total'] }, h('span', {}, t), h('span', {}, precioMes(v)));
  const costo = ui.region(() => {
    if (aurora()) {
      const k = claseRds(f.clase);
      const acu = (Number(f.serverless.min) + Number(f.serverless.max)) / 2 || 1;
      const hora = f.clase === 'db.serverless' ? k.precio * acu : (k?.precio ?? 0) * 1.2;
      const inst = hora * 730 * (f.replicaAurora ? 2 : 1);
      return ui.contenedor({ titulo: 'Estimated monthly costs', cuerpo: h('div', { class: 'cx-rds-costo' }, fila('DB instance', inst), fila('Storage (pay per use)', 0.1 * 10), h('hr'), fila('Total', inst + 1, true), h('p', { class: 'cx-texto-sec' }, 'This billing estimate is based on on-demand usage as described in Amazon Aurora Pricing. Estimate does not include costs for I/O, backup storage, or data transfer.')) });
    }
    const k = claseRds(f.clase);
    const multi = f.despliegue === 'multiaz' ? 2 : f.despliegue === 'cluster' ? 3 : 1;
    const inst = (k?.precio ?? 0) * 730 * multi;
    const alm = (Number(f.almacenamiento.gib) || 0) * (f.almacenamiento.tipo === 'io2' ? 0.125 : 0.115) * multi + (f.almacenamiento.tipo === 'io2' ? (Number(f.almacenamiento.iops) || 0) * 0.1 * multi : 0);
    return ui.contenedor({
      titulo: 'Estimated monthly costs',
      cuerpo: h(
        'div',
        { class: 'cx-rds-costo' },
        f.plantilla === 'freetier'
          ? ui.alerta({ tipo: 'info', contenido: 'The Amazon RDS Free Tier is available to you for 12 months. Each calendar month, the free tier will allow you to use the Amazon RDS resources listed below for free: 750 hrs of Amazon RDS in a Single-AZ db.t2.micro, db.t3.micro or db.t4g.micro Instance; 20 GB of General Purpose Storage (SSD); 20 GB for automated backup storage and any user-initiated DB Snapshots.' })
          : null,
        fila('DB instance', inst),
        fila('Storage', alm),
        h('hr'),
        fila('Total', inst + alm, true),
        h('p', { class: 'cx-texto-sec' }, 'This billing estimate is based on on-demand usage as described in Amazon RDS Pricing. Estimate does not include costs for backup storage, IOs (if applicable), or data transfer.')
      )
    });
  });
  const cambio = () => costo.repintar();

  function crearYa() {
    // Lo que la consola revisa antes de llamar a AWS.
    f.errores = {};
    if (!f.id.trim()) f.errores.id = 'DB instance identifier is required.';
    if (!String(f.usuario).trim()) f.errores.usuario = 'Master username is required.';
    const propia = f.credenciales === 'self' && !f.autoContrasena;
    if (propia && !f.contrasena) f.errores.contrasena = 'Master password is required.';
    if (propia && f.contrasena && f.contrasena !== f.confirmar) f.errores.confirmar = 'Passwords must match.';
    if (f.computo === 'si' && !f.ec2) f.errores.ec2 = 'Choose an EC2 instance.';
    if (!facil() && f.sgModo === 'nuevo' && !f.sgNombre.trim()) f.errores.sgNombre = 'Security group name is required.';
    if (Object.values(f.errores).some(Boolean)) {
      repintarTodo();
      setTimeout(() => cx.raiz.querySelector('.cx-campo--error')?.scrollIntoView({ block: 'center' }), 0);
      return;
    }
    // La contraseña generada solo se enseña una vez (no va al estado).
    const generada = f.credenciales === 'self' && f.autoContrasena ? `${Math.random().toString(36).slice(2, 10)}A${Math.random().toString(36).slice(2, 8)}9!` : null;
    const p = facil()
      ? {
          metodo: 'easy',
          motor: f.motor,
          plantilla: f.plantilla,
          despliegue: aurora() ? undefined : f.plantilla === 'production' ? 'multiaz' : 'single',
          replicaAurora: f.plantilla === 'production',
          id: f.id,
          usuario: f.usuario,
          credenciales: f.credenciales,
          credencialesLlaveKms: f.credenciales === 'secrets' ? f.credencialesLlaveKms : undefined,
          contrasena: generada ?? f.contrasena,
          clase: f.clase,
          serverless: aurora() ? { min: 0, max: 4 } : undefined,
          almacenamiento: aurora() ? undefined : { ...f.almacenamiento, gib: Number(f.almacenamiento.gib), iops: Number(f.almacenamiento.iops), maximo: Number(f.almacenamiento.maximo) },
          vpcId: f.vpcId,
          conectarEc2: f.computo === 'si' ? f.ec2 : null,
          retencion: Number(f.retencion),
          protegida: f.plantilla === 'production'
        }
      : {
          metodo: 'standard',
          motor: f.motor,
          version: f.version,
          plantilla: f.plantilla,
          despliegue: f.despliegue,
          replicaAurora: f.replicaAurora,
          id: f.id,
          usuario: f.usuario,
          credenciales: f.credenciales,
          credencialesLlaveKms: f.credenciales === 'secrets' ? f.credencialesLlaveKms : undefined,
          contrasena: generada ?? f.contrasena,
          clase: f.clase,
          serverless: f.clase === 'db.serverless' ? { min: Number(f.serverless.min), max: Number(f.serverless.max) } : undefined,
          almacenamiento: aurora() ? { tipo: f.auroraAlmacen } : { ...f.almacenamiento, gib: Number(f.almacenamiento.gib), iops: Number(f.almacenamiento.iops), maximo: Number(f.almacenamiento.maximo) },
          vpcId: f.vpcId,
          grupoSubredes: f.grupoSubredes || null,
          publica: f.publica,
          gruposSeguridad: f.sgModo === 'existente' ? f.sgs : [],
          nuevoGrupo: f.sgModo === 'nuevo' ? f.sgNombre.trim() : undefined,
          zona: f.zona || null,
          puerto: Number(f.puerto),
          conectarEc2: f.computo === 'si' ? f.ec2 : null,
          nombreBase: f.nombreBase,
          retencion: f.respaldos || aurora() ? Number(f.retencion) : 0,
          copiarEtiquetas: f.copiarEtiquetas,
          cifrada: f.cifrada,
          llaveKms: f.cifrada ? f.llaveKms : undefined,
          protegida: f.protegida,
          actualizacionMenor: f.actualizacionMenor,
          etiquetas: f.etiquetas
        };
    const r = cx.hacer({ servicio: 'RDS', accion: aurora() || f.despliegue === 'cluster' ? 'CreateDBCluster' : 'CreateDBInstance', error: 'Failed to create database' }, (est) => crearBaseRds(est, p), { atomico: true });
    if (r.ok) {
      const id = r.valor.id;
      cx.memoria.rdsCreada = { id, contrasena: generada };
      cx.flash({ tipo: 'progreso', titulo: `Creating database ${id}`, texto: 'Your database might take a few minutes to launch. You can use settings from this database to fill in the Add RDS proxy configuration.', accion: { texto: 'View connection details', alClic: () => modalConexion(cx, id) } });
      cx.ir('rds/bases');
    }
  }

  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Create database', info: 'rds-base', cx }),
    h(
      'div',
      { class: 'cx-pagina cx-rds-form' },
      secMetodo,
      secMotor,
      secPlantilla,
      secDisponibilidad,
      secAjustes,
      secClase,
      secAlmacen,
      secRed,
      secEtiquetas,
      secAutenticacion,
      secMonitoreo,
      secAdicional,
      secFacil,
      costo,
      h('p', { class: 'cx-texto-sec' }, 'You are responsible for ensuring that you have all of the necessary rights for any third-party products or services that you use with AWS services.'),
      ui.pieFormulario({ cancelar: () => cx.ir('rds/bases'), enviar: crearYa, textoEnviar: 'Create database' })
    )
  );
}

/* ======================================================= detalle */

function grafica(valores, { unidad = '%', max } = {}) {
  const w = 300;
  const alto = 90;
  const tope = max ?? Math.max(1, ...valores) * 1.25;
  const puntos = valores.map((v, i) => `${((i / Math.max(1, valores.length - 1)) * w).toFixed(1)},${(alto - (v / tope) * alto).toFixed(1)}`).join(' ');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${alto}`);
  svg.setAttribute('class', 'cx-rds-grafica__svg');
  svg.setAttribute('preserveAspectRatio', 'none');
  for (const y of [0.25, 0.5, 0.75]) {
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    Object.entries({ x1: 0, x2: w, y1: alto * y, y2: alto * y, class: 'cx-rds-grafica__rejilla' }).forEach(([k, v]) => l.setAttribute(k, v));
    svg.append(l);
  }
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  p.setAttribute('points', puntos);
  p.setAttribute('class', 'cx-rds-grafica__linea');
  svg.append(p);
  return h('div', { class: 'cx-rds-grafica' }, h('div', { class: 'cx-rds-grafica__tope' }, `${tope.toFixed(unidad === '%' ? 1 : 0)} ${unidad}`), svg);
}

function pestanaMonitoreo(cx, b) {
  return cx.vivo(() => {
    const i = instDe(cx, b.id) ?? b;
    const ahora = Date.now();
    const serie = Array.from({ length: 30 }, (_, k) => cpuRds(i, ahora - (29 - k) * 10000) ?? 0);
    const conexiones = Array.from({ length: 30 }, () => ((i.conexionesEc2?.length ?? 0) > 0 && i.estado === 'available' ? 1 : 0));
    const libreGb = (i.almacenamiento?.gib || 10) * 0.93;
    const tarjeta = (titulo, contenido) => h('div', { class: 'cx-bloque' }, h('div', { class: 'cx-bloque__titulo' }, titulo), contenido);
    return ui.contenedor({
      titulo: 'CloudWatch',
      descripcion: 'Each data point is one period (10 seconds in this simulator, 1 minute in AWS).',
      acciones: ui.boton('Monitoring', { iconoDerecha: 'caret-down', desactivado: true }),
      cuerpo: h(
        'div',
        { class: 'cx-rds-graficas' },
        tarjeta('CPUUtilization (Percent)', grafica(serie)),
        tarjeta('DatabaseConnections (Count)', grafica(conexiones, { unidad: '', max: 4 })),
        tarjeta('FreeStorageSpace (Gigabytes)', grafica(Array.from({ length: 30 }, () => libreGb), { unidad: 'GB', max: (i.almacenamiento?.gib || 10) * 1.1 })),
        tarjeta('FreeableMemory (Megabytes)', grafica(Array.from({ length: 30 }, (_, k) => ((claseRds(i.clase)?.memoria ?? 2) * 1024 * 0.42) + Math.sin(k / 3) * 8), { unidad: 'MB' }))
      )
    });
  });
}

function tablaEventos(cx, fuente) {
  return ui.tabla(cx, {
    titulo: 'Recent events',
    variante: 'contenedor',
    filas: () => col(cx).eventos.filter((ev) => !fuente || ev.fuente === fuente).slice().reverse(),
    clave: (ev) => `${ev.t}-${ev.mensaje}-${ev.fuente}`,
    filtro: 'Filter db events',
    columnas: [
      { titulo: 'Time', valor: (ev) => ui.fechaLarga(ev.t) },
      { titulo: 'Source', valor: (ev) => ev.fuente },
      { titulo: 'Type', valor: (ev) => ({ 'db-instance': 'Instances', 'db-cluster': 'Clusters', 'db-snapshot': 'Snapshots', 'db-subnet-group': 'Subnet groups' })[ev.tipo] ?? ev.tipo },
      { titulo: 'Message', valor: (ev) => ev.mensaje }
    ],
    vacio: { titulo: 'No events', texto: 'There are no events in the last 24 hours.' }
  });
}

/** Reglas de los grupos de la base: la tabla «Security group rules» de Connectivity & security. */
function tablaReglasBase(cx, b) {
  return ui.tabla(cx, {
    titulo: 'Security group rules',
    variante: 'contenedor',
    refrescar: false,
    filas: () => {
      const actual = baseDe(cx, b.id) ?? b;
      const filas = [];
      for (const gid of actual.gruposSeguridad) {
        const g = cx.estado.gruposSeguridad.find((x) => x.id === gid);
        for (const r of g?.entrada ?? []) filas.push({ g, r, tipo: 'CIDR/IP - Inbound' });
        for (const r of g?.salida ?? []) filas.push({ g, r, tipo: 'CIDR/IP - Outbound' });
      }
      return filas;
    },
    clave: (x) => x.r.id,
    filtro: 'Filter security group rules',
    columnas: [
      { titulo: 'Security group', valor: (x) => enlaceRecurso(cx, x.g.id, { texto: `${x.g.nombre} (${x.g.id})` }) },
      { titulo: 'Type', valor: (x) => (String(x.r.origen).startsWith('sg-') ? x.tipo.replace('CIDR/IP', 'EC2 Security Group') : x.tipo) },
      { titulo: 'Rule', valor: (x) => `${x.r.protocolo === '-1' ? 'All traffic' : `${String(x.r.protocolo).toUpperCase()} ${x.r.desde === x.r.hasta ? x.r.desde : `${x.r.desde}-${x.r.hasta}`}`} ${x.tipo.endsWith('Inbound') ? 'from' : 'to'} ${String(x.r.origen).startsWith('sg-') ? `${nombreSg(cx, x.r.origen)} (${x.r.origen})` : x.r.origen}` }
    ],
    vacio: { titulo: 'No rules', texto: 'The security groups of this database have no rules.' }
  });
}

function pestanaConectividad(cx, b) {
  const i = b;
  const grupo = grupoSubredesRdsDe(cx.estado, i.grupoSubredes);
  return [
    ui.contenedor({
      titulo: 'Connectivity & security',
      cuerpo: h(
        'div',
        { class: 'cx-rds-columnas' },
        h(
          'div',
          {},
          h('div', { class: 'cx-bloque__titulo' }, 'Endpoint & port'),
          ui.pares([{ etiqueta: 'Endpoint', info: 'rds-endpoint', valor: i.estado === 'creating' ? '–' : ui.copiable(i.endpoint) }, { etiqueta: 'Port', valor: String(i.puerto) }], { columnas: 1, cx })
        ),
        h(
          'div',
          {},
          h('div', { class: 'cx-bloque__titulo' }, 'Networking'),
          ui.pares(
            [
              { etiqueta: 'Availability Zone', valor: i.zona },
              { etiqueta: 'VPC', valor: enlaceRecurso(cx, i.vpcId, { conNombre: true }) },
              { etiqueta: 'Subnet group', valor: ui.enlace(i.grupoSubredes, `rds/grupos-subredes/${encodeURIComponent(i.grupoSubredes)}`, { cx }) },
              { etiqueta: 'Subnets', valor: h('div', {}, (grupo?.subredes ?? []).map((s) => h('div', {}, enlaceRecurso(cx, s)))) },
              { etiqueta: 'Network type', valor: 'IPv4' }
            ],
            { columnas: 1 }
          )
        ),
        h(
          'div',
          {},
          h('div', { class: 'cx-bloque__titulo' }, 'Security'),
          ui.pares(
            [
              { etiqueta: 'VPC security groups', info: 'rds-grupo-seguridad', valor: h('div', {}, i.gruposSeguridad.map((g) => h('div', {}, enlaceRecurso(cx, g, { texto: `${nombreSg(cx, g)} (${g})` }), ' ', ui.estado('exito', 'Active')))) },
              { etiqueta: 'Publicly accessible', info: 'rds-acceso-publico', valor: i.publica ? 'Yes' : 'No' },
              { etiqueta: 'Certificate authority', valor: 'rds-ca-rsa2048-g1' },
              { etiqueta: 'Certificate authority date', valor: 'May 25, 2061, 17:34 (UTC-06:00)' }
            ],
            { columnas: 1, cx }
          )
        )
      )
    }),
    ui.tabla(cx, {
      titulo: 'Connected compute resources',
      variante: 'contenedor',
      refrescar: false,
      descripcion: 'Compute resources that were set up to connect to this database with «Set up EC2 connection».',
      filas: () => ((baseDe(cx, b.id) ?? b).conexionesEc2 ?? []).map((id) => cx.estado.instancias.find((x) => x.id === id)).filter(Boolean),
      clave: (x) => x.id,
      filtro: false,
      columnas: [
        { titulo: 'Resource identifier', valor: (x) => enlaceRecurso(cx, x.id) },
        { titulo: 'Resource type', valor: () => 'EC2 instance' },
        { titulo: 'Security group', valor: (x) => x.gruposSeguridad.map((g) => nombreSg(cx, g)).filter((n) => n.startsWith('ec2-rds-')).join(', ') || '–' }
      ],
      acciones: () => [ui.boton('Set up EC2 connection', { escribe: true, desactivado: i.estado !== 'available' || i.clusterId, alClic: () => modalConectarEc2(cx, i) })],
      vacio: { titulo: 'No connected compute resources', texto: 'Use Actions → Set up EC2 connection to connect an EC2 instance.' }
    }),
    tablaReglasBase(cx, b),
    i.rol === 'primary' || i.rol === 'replica'
      ? ui.tabla(cx, {
          titulo: 'Replication',
          variante: 'contenedor',
          refrescar: false,
          filas: () => {
            const raiz = i.rol === 'replica' ? instDe(cx, i.fuente) : instDe(cx, i.id);
            return raiz ? [raiz, ...raiz.replicas.map((x) => instDe(cx, x)).filter(Boolean)] : [];
          },
          clave: (x) => x.id,
          filtro: false,
          columnas: [
            { titulo: 'DB instance', valor: (x) => ui.enlace(x.id, `rds/bases/${x.id}`, { cx }) },
            { titulo: 'Role', valor: (x) => rolTexto(x) },
            { titulo: 'Region & AZ', valor: (x) => x.zona },
            { titulo: 'Replication state', valor: (x) => (x.rol === 'replica' ? (x.estado === 'available' ? 'replicating' : '–') : '–') },
            { titulo: 'Lag', valor: (x) => (x.rol === 'replica' && x.estado === 'available' ? '0 milliseconds' : '–') }
          ]
        })
      : null,
  ];
}

function pestanaConfiguracion(cx, i) {
  const k = claseRds(i.clase);
  const pendientes = Object.entries(i.pendientes ?? {});
  return [
    ui.contenedor({
      titulo: 'Instance',
      cuerpo: h(
        'div',
        { class: 'cx-rds-columnas' },
        h(
          'div',
          {},
          h('div', { class: 'cx-bloque__titulo' }, 'Configuration'),
          ui.pares(
            [
              { etiqueta: 'DB instance ID', valor: i.id },
              { etiqueta: 'Engine version', valor: versionTexto(i) },
              { etiqueta: 'DB name', valor: i.nombreBase ?? '–' },
              { etiqueta: 'License model', valor: i.motor.includes('postgres') ? 'PostgreSQL License' : 'General Public License' },
              { etiqueta: 'Option groups', valor: `default:${i.motor}` },
              { etiqueta: 'Amazon Resource Name (ARN)', valor: ui.copiable(i.arn) },
              { etiqueta: 'Resource ID', valor: i.recursoId },
              { etiqueta: 'Created time', valor: ui.fechaLarga(i.creado) },
              { etiqueta: 'Deletion protection', info: 'rds-proteccion', valor: i.protegida ? 'Enabled' : 'Disabled' }
            ],
            { columnas: 1, cx }
          )
        ),
        h(
          'div',
          {},
          h('div', { class: 'cx-bloque__titulo' }, 'Instance class'),
          ui.pares([{ etiqueta: 'Instance class', valor: i.clase }, { etiqueta: 'vCPU', valor: k?.vcpu ? String(k.vcpu) : '–' }, { etiqueta: 'RAM', valor: k?.memoria ? `${k.memoria} GB` : '–' }], { columnas: 1 }),
          h('div', { class: 'cx-bloque__titulo', style: { marginTop: '16px' } }, 'Availability'),
          ui.pares(
            [
              { etiqueta: 'Master username', valor: i.usuario },
              { etiqueta: 'Master password', valor: i.credenciales === 'secrets' ? 'Managed in AWS Secrets Manager' : '••••••••••••' },
              { etiqueta: 'IAM DB authentication', valor: 'Not enabled' },
              { etiqueta: 'Multi-AZ', info: 'rds-despliegue', valor: i.clusterId ? '–' : i.multiAz ? 'Yes' : 'No' },
              { etiqueta: 'Secondary Zone', valor: i.zonaSecundaria ?? '–' }
            ],
            { columnas: 1, cx }
          )
        ),
        h(
          'div',
          {},
          h('div', { class: 'cx-bloque__titulo' }, 'Storage'),
          ui.pares(
            [
              { etiqueta: 'Encryption', info: 'rds-cifrado', valor: i.cifrada ? 'Enabled' : 'Not enabled' },
              { etiqueta: 'AWS KMS key', valor: textoLlaveRds(cx, i) ?? '–' },
              { etiqueta: 'Storage type', valor: i.almacenamiento.tipo === 'aurora' ? 'Aurora Standard' : { gp3: 'General Purpose SSD (gp3)', gp2: 'General Purpose SSD (gp2)', io2: 'Provisioned IOPS SSD (io2)' }[i.almacenamiento.tipo] },
              { etiqueta: 'Storage', valor: i.almacenamiento.tipo === 'aurora' ? 'Aurora cluster volume (grows automatically)' : `${i.almacenamiento.gib} GiB` },
              { etiqueta: 'Provisioned IOPS', valor: i.almacenamiento.iops ? `${i.almacenamiento.iops} IOPS` : '–' },
              { etiqueta: 'Storage autoscaling', valor: i.almacenamiento.autoescalado ? 'Enabled' : 'Disabled' },
              { etiqueta: 'Maximum storage threshold', valor: i.almacenamiento.maximo ? `${i.almacenamiento.maximo} GiB` : '–' }
            ],
            { columnas: 1, cx }
          )
        )
      )
    }),
    ui.contenedor({
      titulo: 'Pending modifications',
      info: 'rds-modificar',
      cx,
      acciones: pendientes.length ? ui.boton('Apply now', { escribe: true, desactivado: i.estado !== 'available', alClic: () => {
        const r = cx.hacer({ servicio: 'RDS', accion: 'ApplyPendingMaintenanceAction', error: 'Failed to apply pending modifications' }, (e) => aplicarPendientesRds(e, i.id));
        if (r.ok) cx.flash({ tipo: 'exito', texto: `Applying pending modifications to ${i.id}.` });
      } }) : null,
      cuerpo: pendientes.length
        ? ui.pares(pendientes.map(([kk, v]) => ({ etiqueta: { clase: 'DB instance class', multiAz: 'Multi-AZ', almacenamiento: 'Allocated storage' }[kk] ?? kk, valor: kk === 'almacenamiento' ? `${v.gib} GiB (${v.tipo})` : kk === 'multiAz' ? (v ? 'Yes' : 'No') : String(v) })), { columnas: 3 })
        : h('p', { class: 'cx-texto-sec' }, 'There are no pending modifications for this DB instance.')
    })
  ];
}

function pestanaRespaldos(cx, b) {
  const v = ventanaRestauracionRds(cx.estado, b);
  return [
    ui.contenedor({
      titulo: 'Maintenance',
      cuerpo: ui.pares(
        [
          { etiqueta: 'Auto minor version upgrade', valor: b.actualizacionMenor === false ? 'Disabled' : 'Enabled' },
          { etiqueta: 'Maintenance window', valor: b.ventanaMantenimiento ? `${b.ventanaMantenimiento} UTC` : '–' },
          { etiqueta: 'Pending maintenance', valor: b.pendientes ? 'next window' : 'none' }
        ],
        { columnas: 3 }
      )
    }),
    ui.contenedor({
      titulo: 'Backup',
      info: 'rds-respaldo',
      cx,
      cuerpo: ui.pares(
        [
          { etiqueta: 'Automated backups', valor: b.retencion ? `Enabled (${b.retencion} Day${b.retencion === 1 ? '' : 's'})` : 'Disabled' },
          { etiqueta: 'Copy tags to snapshots', valor: b.copiarEtiquetas === false ? 'Disabled' : 'Enabled' },
          { etiqueta: 'Backup window', valor: b.ventanaRespaldo ? `${b.ventanaRespaldo} UTC (30 minutes)` : '–' },
          { etiqueta: 'Earliest restorable time', valor: v ? ui.fechaLarga(v.desde) : '–' },
          { etiqueta: 'Latest restorable time', valor: v ? ui.fechaLarga(v.hasta) : '–' },
          { etiqueta: 'Backup replication', valor: 'Not enabled' }
        ],
        { columnas: 3 }
      )
    }),
    ui.tabla(cx, {
      titulo: 'Snapshots',
      variante: 'contenedor',
      filas: () => col(cx).snapshots.filter((s) => (s.instanciaId ?? s.clusterId) === b.id),
      clave: (s) => s.id,
      filtro: 'Filter snapshots',
      columnas: [
        { titulo: 'Snapshot name', valor: (s) => ui.enlace(s.id, rutaSnap(s), { cx }) },
        { titulo: 'Snapshot creation time', valor: (s) => ui.fecha(s.creado) },
        { titulo: 'Status', valor: (s) => (s.estado === 'creating' ? ui.estado('pendiente', 'Creating') : ui.estado('exito', 'Available')) },
        { titulo: 'Type', valor: (s) => (s.tipo === 'manual' ? 'Manual' : 'Automated') }
      ],
      acciones: () => [ui.boton('Take snapshot', { escribe: true, desactivado: !['available', 'stopped'].includes(b.estado) || Boolean(b.clusterId), alClic: () => cx.ir(`rds/bases/${b.id}/snapshot`) })],
      vacio: { titulo: 'No snapshots', texto: 'This database has no snapshots.' }
    })
  ];
}

function pestanaEtiquetasRds(cx, b) {
  const filas = etiquetasDe(b);
  return ui.tabla(cx, {
    titulo: 'Tags',
    variante: 'contenedor',
    refrescar: false,
    filas: () => filas,
    clave: (t) => t.llave,
    filtro: 'Filter tags',
    columnas: [
      { titulo: 'Key', valor: (t) => t.llave },
      { titulo: 'Value', valor: (t) => t.valor || '–' }
    ],
    vacio: { titulo: 'No tags', texto: 'You don’t have any tags.' }
  });
}

function resumenBase(cx, b) {
  return ui.contenedor({
    titulo: 'Summary',
    cuerpo: ui.pares(
      [
        { etiqueta: esCluster(b) ? 'DB cluster identifier' : 'DB identifier', valor: b.id },
        { etiqueta: 'Status', valor: estadoRds(b) },
        { etiqueta: 'Role', valor: rolTexto(b) },
        { etiqueta: 'Engine', valor: motorTexto(b.motor) },
        { etiqueta: 'Recommendations', valor: '–' },
        { etiqueta: 'CPU', valor: celdaCpu(b) },
        { etiqueta: esCluster(b) ? 'Capacity type' : 'Class', valor: esCluster(b) ? (b.serverless ? `Serverless v2 (${b.serverless.min} - ${b.serverless.max} ACUs)` : 'Provisioned') : b.clase },
        { etiqueta: 'Current activity', valor: esCluster(b) || b.estado !== 'available' ? '–' : `${(b.conexionesEc2?.length ?? 0) > 0 ? 1 : 0} Connections` },
        { etiqueta: 'Region & AZ', valor: esCluster(b) ? 'us-east-1' : b.zona }
      ],
      { columnas: 4 }
    )
  });
}

function detalleBase(cx, { id }) {
  cx.migas([{ texto: 'Aurora and RDS', ruta: 'rds' }, { texto: 'Databases', ruta: 'rds/bases' }, { texto: id }]);
  if (!instDe(cx, id)) return clusterDe(cx, id) ? detalleCluster(cx, { id }) : noExiste(cx, 'DB instance', id, 'rds/bases');
  const st = { pestana: 'conectividad' };
  return cx.vivo(() => {
    const i = instDe(cx, id);
    if (!i) return noExiste(cx, 'DB instance', id, 'rds/bases');
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({
        titulo: i.id,
        info: 'rds-base',
        cx,
        acciones: [ui.botonRefrescar(() => cx.refrescar()), ui.boton('Modify', { escribe: true, desactivado: i.estado !== 'available', alClic: () => cx.ir(`rds/bases/${i.id}/modificar`) }), menuAcciones(cx, i)]
      }),
      i.pendientes ? ui.alerta({ tipo: 'info', titulo: 'Pending modifications', contenido: 'Some modifications will be applied during the next scheduled maintenance window. See the Configuration tab.' }) : null,
      resumenBase(cx, i),
      ui.pestanas({
        activa: st.pestana,
        alCambiar: (p) => (st.pestana = p),
        pestanas: [
          { id: 'conectividad', texto: 'Connectivity & security', contenido: () => pestanaConectividad(cx, i) },
          { id: 'monitoreo', texto: 'Monitoring', contenido: () => pestanaMonitoreo(cx, i) },
          { id: 'logs', texto: 'Logs & events', contenido: () => [tablaEventos(cx, i.id), ui.tabla(cx, { titulo: 'Logs', variante: 'contenedor', refrescar: false, filas: () => (i.motor.includes('postgres') ? ['error/postgresql.log'] : ['error/mysql-error-running.log', 'error/mysql-error.log']), clave: (x) => x, filtro: false, columnas: [{ titulo: 'Name', valor: (x) => x }, { titulo: 'Last written', valor: () => ui.fecha(i.creado) }, { titulo: 'Size', valor: () => '2.1 kB' }] })] },
          { id: 'configuracion', texto: 'Configuration', contenido: () => pestanaConfiguracion(cx, i) },
          { id: 'etl', texto: 'Zero-ETL integrations', desactivada: true, contenido: () => null },
          { id: 'respaldos', texto: 'Maintenance & backups', contenido: () => pestanaRespaldos(cx, i) },
          { id: 'datos', texto: 'Data migrations', desactivada: true, contenido: () => null },
          { id: 'etiquetas', texto: 'Tags', contenido: () => pestanaEtiquetasRds(cx, i) }
        ]
      })
    );
  });
}

function detalleCluster(cx, { id }) {
  cx.migas([{ texto: 'Aurora and RDS', ruta: 'rds' }, { texto: 'Databases', ruta: 'rds/bases' }, { texto: id }]);
  if (!clusterDe(cx, id)) return noExiste(cx, 'DB cluster', id, 'rds/bases');
  const st = { pestana: 'conectividad' };
  return cx.vivo(() => {
    const c = clusterDe(cx, id);
    if (!c) return noExiste(cx, 'DB cluster', id, 'rds/bases');
    const miembros = c.miembros.map((x) => instDe(cx, x)).filter(Boolean);
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({
        titulo: c.id,
        info: c.tipo === 'aurora' ? 'rds-aurora' : 'rds-despliegue',
        cx,
        acciones: [ui.botonRefrescar(() => cx.refrescar()), ui.boton('Modify', { escribe: true, desactivado: c.estado !== 'available', alClic: () => cx.ir(`rds/bases/${c.id}/modificar`) }), menuAcciones(cx, c)]
      }),
      c.expres ? ui.alerta({ tipo: 'info', contenido: 'This cluster was created with express configuration. Connect through its internet access gateway using IAM authentication for the postgres user.' }) : null,
      resumenBase(cx, c),
      ui.pestanas({
        activa: st.pestana,
        alCambiar: (p) => (st.pestana = p),
        pestanas: [
          {
            id: 'conectividad',
            texto: 'Connectivity & security',
            contenido: () => [
              ui.tabla(cx, {
                titulo: 'Endpoints',
                variante: 'contenedor',
                info: 'rds-endpoint',
                refrescar: false,
                filas: () => [
                  { nombre: c.endpoint, tipo: 'Writer', puerto: c.puerto },
                  { nombre: c.endpointLectura, tipo: 'Reader', puerto: c.puerto }
                ],
                clave: (x) => x.nombre,
                filtro: false,
                columnas: [
                  { titulo: 'Endpoint name', valor: (x) => ui.copiable(x.nombre) },
                  { titulo: 'Status', valor: () => (c.estado === 'creating' ? ui.estado('pendiente', 'Creating') : ui.estado('exito', 'Available')) },
                  { titulo: 'Type', valor: (x) => x.tipo },
                  { titulo: 'Port', valor: (x) => String(x.puerto) }
                ]
              }),
              ui.contenedor({
                titulo: 'Networking and security',
                cuerpo: ui.pares(
                  [
                    { etiqueta: 'VPC', valor: enlaceRecurso(cx, c.vpcId, { conNombre: true }) },
                    { etiqueta: 'Subnet group', valor: ui.enlace(c.grupoSubredes, `rds/grupos-subredes/${encodeURIComponent(c.grupoSubredes)}`, { cx }) },
                    { etiqueta: 'VPC security groups', valor: h('div', {}, c.gruposSeguridad.map((g) => h('div', {}, enlaceRecurso(cx, g, { texto: `${nombreSg(cx, g)} (${g})` })))) },
                    { etiqueta: 'Publicly accessible', valor: c.publica ? 'Yes' : 'No' },
                    { etiqueta: 'Internet access gateway', valor: c.expres ? 'Enabled' : 'Disabled' },
                    { etiqueta: 'Network type', valor: 'IPv4' }
                  ],
                  { columnas: 3 }
                )
              }),
              tablaReglasBase(cx, c)
            ]
          },
          {
            id: 'instancias',
            texto: 'Instances',
            contenido: () =>
              ui.tabla(cx, {
                titulo: 'DB instances',
                variante: 'contenedor',
                filas: () => (clusterDe(cx, c.id)?.miembros ?? []).map((x) => instDe(cx, x)).filter(Boolean),
                clave: (x) => x.id,
                filtro: false,
                columnas: [
                  { titulo: 'DB identifier', valor: (x) => ui.enlace(x.id, `rds/bases/${x.id}`, { cx }) },
                  { titulo: 'Status', valor: (x) => estadoRds(x) },
                  { titulo: 'Role', valor: (x) => rolTexto(x) },
                  { titulo: 'Region & AZ', valor: (x) => x.zona },
                  { titulo: 'Size', valor: (x) => x.clase }
                ],
                acciones: () => [ui.boton('Add reader', { escribe: true, desactivado: c.tipo !== 'aurora' || c.estado !== 'available', alClic: () => cx.ir(`rds/bases/${c.id}/lector`) })]
              })
          },
          { id: 'monitoreo', texto: 'Monitoring', contenido: () => (miembros[0] ? pestanaMonitoreo(cx, miembros.find((x) => x.rol === 'writer') ?? miembros[0]) : h('p', {}, 'No instances.')) },
          { id: 'logs', texto: 'Logs & events', contenido: () => tablaEventos(cx, c.id) },
          {
            id: 'configuracion',
            texto: 'Configuration',
            contenido: () =>
              ui.contenedor({
                titulo: 'Configuration',
                cuerpo: ui.pares(
                  [
                    { etiqueta: 'DB cluster ID', valor: c.id },
                    { etiqueta: 'Engine version', valor: versionTexto(c) },
                    { etiqueta: 'DB cluster type', valor: c.tipo === 'aurora' ? 'Aurora' : 'Multi-AZ DB cluster' },
                    { etiqueta: 'Amazon Resource Name (ARN)', valor: ui.copiable(c.arn) },
                    { etiqueta: 'Resource ID', valor: c.recursoId },
                    { etiqueta: 'Created time', valor: ui.fechaLarga(c.creado) },
                    { etiqueta: 'Master username', valor: c.usuario },
                    { etiqueta: 'Capacity', valor: c.serverless ? `Serverless v2 (${c.serverless.min} - ${c.serverless.max} ACUs)` : c.clase },
                    { etiqueta: 'Storage', valor: c.tipo === 'aurora' ? (c.almacenamiento?.optimizado ? 'Aurora I/O-Optimized' : 'Aurora Standard') : `${c.almacenamiento.gib} GiB ${c.almacenamiento.tipo}` },
                    { etiqueta: 'Encryption', valor: c.cifrada ? `Enabled (${textoLlaveRds(cx, c)})` : 'Not enabled' },
                    { etiqueta: 'Deletion protection', valor: c.protegida ? 'Enabled' : 'Disabled' }
                  ],
                  { columnas: 3 }
                )
              })
          },
          { id: 'respaldos', texto: 'Maintenance & backups', contenido: () => pestanaRespaldos(cx, c) },
          { id: 'etiquetas', texto: 'Tags', contenido: () => pestanaEtiquetasRds(cx, c) }
        ]
      })
    );
  });
}

/* ======================================================= Modify */

function modificarBase(cx, { id }) {
  cx.migas([{ texto: 'Aurora and RDS', ruta: 'rds' }, { texto: 'Databases', ruta: 'rds/bases' }, { texto: id, ruta: `rds/bases/${id}` }, { texto: 'Modify' }]);
  const i = instDe(cx, id);
  if (!i) return clusterDe(cx, id) ? modificarCluster(cx, { id }) : noExiste(cx, 'DB instance', id, 'rds/bases');
  const enCluster = Boolean(i.clusterId);
  const f = {
    paso: 1,
    clase: i.clase,
    familia: claseRds(i.clase)?.familia ?? 'burstable',
    multiAz: i.multiAz,
    gib: String(i.almacenamiento.gib),
    autoescalado: i.almacenamiento.autoescalado,
    maximo: String(i.almacenamiento.maximo ?? 1000),
    retencion: String(i.retencion),
    protegida: i.protegida,
    publica: i.publica,
    sgs: [...i.gruposSeguridad],
    contrasena: '',
    actualizacionMenor: i.actualizacionMenor,
    inmediato: false
  };
  const donde = enCluster ? (esAurora(i.motor) ? 'aurora' : 'cluster') : 'instancia';
  const cuerpo = ui.region(() => (f.paso === 1 ? paso1() : paso2()), { clase: 'cx-pagina' });

  function paso1() {
    const opciones = CLASES_RDS.filter((k) => k.donde.includes(donde) && (i.plantilla !== 'freetier' || k.capaGratuita) && k.familia === f.familia).map(opcionClase);
    return [
      ui.contenedor({
        titulo: 'Settings',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.campo({ etiqueta: 'DB instance identifier', control: ui.entrada({ valor: i.id, desactivado: true }) }),
          enCluster ? null : ui.campo({ etiqueta: 'New master password', opcional: true, info: 'rds-credenciales', cx, control: ui.entrada({ tipo: 'password', valor: f.contrasena, alCambiar: (v) => (f.contrasena = v) }), restriccion: 'Leave blank to keep the current password. At least 8 printable ASCII characters. Can\'t contain / \' " @' })
        )
      }),
      ui.contenedor({
        titulo: 'Instance configuration',
        info: 'rds-clase',
        cx,
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.radios({ valor: f.familia, opciones: (donde === 'cluster' ? FAMILIAS.slice(0, 2) : i.plantilla === 'freetier' ? FAMILIAS.slice(2) : FAMILIAS).concat(donde === 'aurora' ? [{ valor: 'serverless', etiqueta: 'Serverless v2' }] : []), alCambiar: (v) => ((f.familia = v), (f.clase = CLASES_RDS.find((k) => k.donde.includes(donde) && k.familia === v)?.clase ?? f.clase), cuerpo.repintar()) }),
          ui.selector({ opciones, valor: f.clase, filtrar: true, alCambiar: (v) => (f.clase = v) })
        )
      }),
      enCluster
        ? null
        : ui.contenedor({
            titulo: 'Availability and durability',
            info: 'rds-despliegue',
            cx,
            cuerpo: ui.tarjetas({
              valor: f.multiAz ? 'multi' : 'single',
              columnas: 1,
              opciones: [
                { valor: 'multi', etiqueta: 'Multi-AZ DB instance deployment (2 instances)', descripcion: 'Creates a standby DB instance in a different Availability Zone.', desactivado: i.plantilla === 'freetier' },
                { valor: 'single', etiqueta: 'Single-AZ DB instance deployment (1 instance)', descripcion: 'Creates a single DB instance with no standby DB instances.' }
              ],
              alCambiar: (v) => (f.multiAz = v === 'multi')
            })
          }),
      enCluster || i.almacenamiento.tipo === 'aurora'
        ? null
        : ui.contenedor({
            titulo: 'Storage',
            info: 'rds-almacenamiento',
            cx,
            cuerpo: h(
              'div',
              { class: 'cx-form' },
              ui.campo({ etiqueta: 'Allocated storage', control: ui.entrada({ tipo: 'number', valor: f.gib, sufijo: 'GiB', alCambiar: (v) => (f.gib = v) }), restriccion: `The current value is ${i.almacenamiento.gib} GiB. You can increase it, but you can’t reduce it.` }),
              ui.casilla({ etiqueta: 'Enable storage autoscaling', marcada: f.autoescalado, alCambiar: (v) => ((f.autoescalado = v), cuerpo.repintar()) }),
              f.autoescalado ? ui.campo({ etiqueta: 'Maximum storage threshold', control: ui.entrada({ tipo: 'number', valor: f.maximo, sufijo: 'GiB', alCambiar: (v) => (f.maximo = v) }) }) : null
            )
          }),
      enCluster
        ? null
        : ui.contenedor({
            titulo: 'Connectivity',
            info: 'rds-conectividad',
            cx,
            cuerpo: h(
              'div',
              { class: 'cx-form' },
              ui.campo({ etiqueta: 'Security group', info: 'rds-grupo-seguridad', cx, control: ui.selector({ multiple: true, valores: f.sgs, filtrar: true, opciones: cx.estado.gruposSeguridad.filter((g) => g.vpcId === i.vpcId).map((g) => ({ valor: g.id, etiqueta: g.nombre, descripcion: g.id })), alCambiar: (v) => (f.sgs = v) }) }),
              ui.campo({ etiqueta: 'Public access', info: 'rds-acceso-publico', cx, control: ui.radios({ valor: f.publica ? 'si' : 'no', opciones: [{ valor: 'si', etiqueta: 'Publicly accessible' }, { valor: 'no', etiqueta: 'Not publicly accessible' }], alCambiar: (v) => (f.publica = v === 'si') }) })
            )
          }),
      enCluster
        ? null
        : ui.contenedor({
            titulo: 'Additional configuration',
            cuerpo: h(
              'div',
              { class: 'cx-form' },
              ui.campo({ etiqueta: 'Backup retention period', info: 'rds-respaldo', cx, control: ui.selector({ opciones: Array.from({ length: 36 }, (_, n) => ({ valor: String(n), etiqueta: `${n} day${n === 1 ? '' : 's'}`, descripcion: n === 0 ? 'Disables automated backups' : undefined })), valor: f.retencion, alCambiar: (v) => (f.retencion = v) }) }),
              ui.casilla({ etiqueta: 'Enable auto minor version upgrade', marcada: f.actualizacionMenor, alCambiar: (v) => (f.actualizacionMenor = v) }),
              ui.casilla({ etiqueta: 'Enable deletion protection', descripcion: 'Protects the database from being deleted accidentally.', marcada: f.protegida, alCambiar: (v) => (f.protegida = v) })
            )
          }),
      ui.pieFormulario({ cancelar: () => cx.ir(`rds/bases/${i.id}`), textoEnviar: 'Continue', enviar: () => ((f.paso = 2), cuerpo.repintar(), cx.raiz.querySelector('.cx-principal')?.scrollTo?.(0, 0)) })
    ];
  }

  /** Lo que cambió, para «Summary of modifications». */
  function diferencias() {
    const d = [];
    const sn = (v) => (v ? 'Yes' : 'No');
    if (f.clase !== i.clase) d.push(['DB instance class', i.clase, f.clase, 'clase', f.clase]);
    if (!enCluster && f.multiAz !== i.multiAz) d.push(['Multi-AZ deployment', sn(i.multiAz), sn(f.multiAz), 'multiAz', f.multiAz]);
    if (!enCluster && Number(f.gib) !== i.almacenamiento.gib) d.push(['Allocated storage', `${i.almacenamiento.gib} GiB`, `${f.gib} GiB`, 'gib', Number(f.gib)]);
    if (!enCluster && f.autoescalado !== i.almacenamiento.autoescalado) d.push(['Storage autoscaling', sn(i.almacenamiento.autoescalado), sn(f.autoescalado), 'autoescalado', f.autoescalado]);
    if (!enCluster && f.autoescalado && Number(f.maximo) !== i.almacenamiento.maximo) d.push(['Maximum storage threshold', `${i.almacenamiento.maximo ?? '–'} GiB`, `${f.maximo} GiB`, 'maximo', Number(f.maximo)]);
    if (!enCluster && Number(f.retencion) !== i.retencion) d.push(['Backup retention period', `${i.retencion} days`, `${f.retencion} days`, 'retencion', Number(f.retencion)]);
    if (!enCluster && f.protegida !== i.protegida) d.push(['Deletion protection', i.protegida ? 'Enabled' : 'Disabled', f.protegida ? 'Enabled' : 'Disabled', 'protegida', f.protegida]);
    if (!enCluster && f.publica !== i.publica) d.push(['Public access', i.publica ? 'Publicly accessible' : 'Not publicly accessible', f.publica ? 'Publicly accessible' : 'Not publicly accessible', 'publica', f.publica]);
    if (!enCluster && (f.sgs.length !== i.gruposSeguridad.length || f.sgs.some((g) => !i.gruposSeguridad.includes(g)))) d.push(['Security group', i.gruposSeguridad.map((g) => nombreSg(cx, g)).join(', '), f.sgs.map((g) => nombreSg(cx, g)).join(', ') || '–', 'gruposSeguridad', f.sgs]);
    if (!enCluster && f.actualizacionMenor !== i.actualizacionMenor) d.push(['Auto minor version upgrade', sn(i.actualizacionMenor), sn(f.actualizacionMenor), 'actualizacionMenor', f.actualizacionMenor]);
    if (f.contrasena) d.push(['Master password', '••••••••', '••••••••', 'contrasena', f.contrasena]);
    return d;
  }

  function paso2() {
    const d = diferencias();
    return [
      ui.contenedor({
        titulo: 'Summary of modifications',
        descripcion: 'You are about to submit the following modifications. Only values that will change are displayed. Carefully verify your changes and choose Modify DB instance.',
        sinRelleno: Boolean(d.length),
        cuerpo: d.length
          ? h(
              'table',
              { class: 'cx-tabla__tabla' },
              h('thead', {}, h('tr', {}, ['Attribute', 'Current value', 'New value'].map((t) => h('th', {}, h('span', { class: 'cx-tabla__orden' }, t))))),
              h('tbody', {}, d.map(([a, v1, v2]) => h('tr', {}, h('td', { style: { paddingLeft: '20px' } }, a), h('td', {}, v1), h('td', {}, v2))))
            )
          : ui.alerta({ tipo: 'info', contenido: 'You haven’t made any changes. Go back to change the settings of the DB instance.' })
      }),
      ui.contenedor({
        titulo: 'Schedule modifications',
        info: 'rds-modificar',
        cx,
        cuerpo: ui.campo({
          etiqueta: 'When to apply modifications',
          control: ui.radios({
            valor: f.inmediato ? 'ya' : 'ventana',
            opciones: [
              { valor: 'ventana', etiqueta: 'Apply during the next scheduled maintenance window', descripcion: `Current maintenance window: ${i.ventanaMantenimiento} UTC` },
              { valor: 'ya', etiqueta: 'Apply immediately', descripcion: 'The modifications in this request and any pending modifications will be asynchronously applied as soon as possible, regardless of the maintenance window setting for this database instance.' }
            ],
            alCambiar: (v) => (f.inmediato = v === 'ya')
          })
        })
      }),
      h(
        'div',
        { class: 'cx-pie-form' },
        ui.boton('Cancel', { variante: 'texto', alClic: () => cx.ir(`rds/bases/${i.id}`) }),
        ui.boton('Back', { alClic: () => ((f.paso = 1), cuerpo.repintar()) }),
        ui.boton('Modify DB instance', {
          variante: 'primario',
          desactivado: !d.length,
          alClic: () => {
            const cambios = Object.fromEntries(d.map((x) => [x[3], x[4]]));
            const r = cx.hacer({ servicio: 'RDS', accion: 'ModifyDBInstance', error: `Failed to modify DB instance ${i.id}` }, (e) => modificarBaseRds(e, i.id, cambios, { inmediato: f.inmediato }));
            if (r.ok) {
              cx.flash({ tipo: 'exito', texto: `Successfully modified DB instance ${i.id}.${f.inmediato ? '' : ' Some changes will be applied during the next maintenance window.'}` });
              cx.ir('rds/bases');
            }
          }
        })
      )
    ];
  }

  return h('div', { class: 'cx-pagina cx-pagina--form cx-rds-form' }, ui.encabezado({ titulo: `Modify DB instance: ${i.id}`, info: 'rds-modificar', cx }), cuerpo);
}

function modificarCluster(cx, { id }) {
  cx.migas([{ texto: 'Aurora and RDS', ruta: 'rds' }, { texto: 'Databases', ruta: 'rds/bases' }, { texto: id, ruta: `rds/bases/${id}` }, { texto: 'Modify' }]);
  const c = clusterDe(cx, id);
  if (!c) return noExiste(cx, 'DB cluster', id, 'rds/bases');
  const f = { retencion: String(c.retencion), protegida: c.protegida, sgs: [...c.gruposSeguridad], min: String(c.serverless?.min ?? ''), max: String(c.serverless?.max ?? '') };
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form cx-rds-form' },
    ui.encabezado({ titulo: `Modify DB cluster: ${c.id}`, info: 'rds-modificar', cx }),
    c.serverless
      ? ui.contenedor({
          titulo: 'Capacity range',
          cuerpo: h('div', { class: 'cx-fila-campos' }, ui.campo({ etiqueta: 'Minimum capacity (ACUs)', control: ui.entrada({ tipo: 'number', valor: f.min, alCambiar: (v) => (f.min = v) }) }), ui.campo({ etiqueta: 'Maximum capacity (ACUs)', control: ui.entrada({ tipo: 'number', valor: f.max, alCambiar: (v) => (f.max = v) }) }))
        })
      : null,
    ui.contenedor({
      titulo: 'Connectivity',
      cuerpo: ui.campo({ etiqueta: 'VPC security group', info: 'rds-grupo-seguridad', cx, control: ui.selector({ multiple: true, valores: f.sgs, filtrar: true, opciones: cx.estado.gruposSeguridad.filter((g) => g.vpcId === c.vpcId).map((g) => ({ valor: g.id, etiqueta: g.nombre, descripcion: g.id })), alCambiar: (v) => (f.sgs = v) }) })
    }),
    ui.contenedor({
      titulo: 'Additional configuration',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({ etiqueta: 'Backup retention period', info: 'rds-respaldo', cx, control: ui.selector({ opciones: Array.from({ length: 35 }, (_, n) => ({ valor: String(n + 1), etiqueta: `${n + 1} day${n ? 's' : ''}` })), valor: f.retencion, alCambiar: (v) => (f.retencion = v) }) }),
        ui.casilla({ etiqueta: 'Enable deletion protection', marcada: f.protegida, alCambiar: (v) => (f.protegida = v) })
      )
    }),
    ui.alerta({ tipo: 'info', contenido: 'Changes to a DB cluster are applied immediately in this simulator.' }),
    ui.pieFormulario({
      cancelar: () => cx.ir(`rds/bases/${c.id}`),
      textoEnviar: 'Modify cluster',
      enviar: () => {
        const r = cx.hacer({ servicio: 'RDS', accion: 'ModifyDBCluster', error: `Failed to modify DB cluster ${c.id}` }, (e) =>
          modificarClusterRds(e, c.id, { retencion: Number(f.retencion), protegida: f.protegida, gruposSeguridad: f.sgs, serverless: c.serverless ? { min: f.min, max: f.max } : undefined })
        );
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: `Successfully modified DB cluster ${c.id}.` });
          cx.ir('rds/bases');
        }
      }
    })
  );
}

/* ======================================================= réplica, lector, snapshot, PITR */

function crearReplica(cx, { id }) {
  cx.migas([{ texto: 'Aurora and RDS', ruta: 'rds' }, { texto: 'Databases', ruta: 'rds/bases' }, { texto: id, ruta: `rds/bases/${id}` }, { texto: 'Create read replica' }]);
  const fuente = instDe(cx, id);
  if (!fuente) return noExiste(cx, 'DB instance', id, 'rds/bases');
  const grupo = grupoSubredesRdsDe(cx.estado, fuente.grupoSubredes);
  const zonas = zonasDeGrupoRds(cx.estado, grupo);
  const f = { id: `${fuente.id}-replica`, clase: fuente.clase, multiAz: false, zona: '', publica: false, sgs: [...fuente.gruposSeguridad], protegida: false, errores: {} };
  const form = regionPagina(() => [
    fuente.retencion === 0 ? ui.alerta({ tipo: 'aviso', titulo: 'Automated backups are disabled', contenido: 'To create a read replica, the source DB instance must have automated backups turned on (backup retention period greater than 0). Modify the source first.' }) : null,
    ui.contenedor({
      titulo: 'Replica source',
      info: 'rds-replica',
      cx,
      cuerpo: ui.pares([{ etiqueta: 'Source DB instance identifier', valor: fuente.id }, { etiqueta: 'Engine', valor: `${motorTexto(fuente.motor)} ${fuente.version}` }, { etiqueta: 'Source AZ', valor: fuente.zona }], { columnas: 3 })
    }),
    ui.contenedor({
      titulo: 'Settings',
      cuerpo: ui.campo({ etiqueta: 'DB instance identifier', info: 'rds-identificador', cx, control: ui.entrada({ valor: f.id, alCambiar: (v) => (f.id = v) }), error: f.errores.id, restriccion: 'The identifier is case-insensitive, but is stored as all lowercase. 1 to 63 alphanumeric characters or hyphens.' })
    }),
    ui.contenedor({
      titulo: 'Instance configuration',
      info: 'rds-clase',
      cx,
      cuerpo: ui.campo({ etiqueta: 'DB instance class', control: ui.selector({ opciones: CLASES_RDS.filter((k) => k.donde.includes('instancia') && (fuente.plantilla !== 'freetier' || k.capaGratuita)).map(opcionClase), valor: f.clase, filtrar: true, alCambiar: (v) => (f.clase = v) }) })
    }),
    ui.contenedor({
      titulo: 'AWS Region',
      cuerpo: ui.campo({ etiqueta: 'Destination Region', control: ui.selector({ opciones: [{ valor: 'us-east-1', etiqueta: 'US East (N. Virginia)' }, { valor: 'us-west-2', etiqueta: 'US West (Oregon) — not available in this simulator', desactivado: true }], valor: 'us-east-1' }) })
    }),
    ui.contenedor({
      titulo: 'Availability',
      info: 'rds-despliegue',
      cx,
      cuerpo: ui.tarjetas({
        valor: f.multiAz ? 'multi' : 'single',
        columnas: 1,
        opciones: [
          { valor: 'multi', etiqueta: 'Multi-AZ DB instance deployment (2 instances)', descripcion: 'Creates a standby for the read replica in a different Availability Zone.', desactivado: fuente.plantilla === 'freetier' },
          { valor: 'single', etiqueta: 'Single-AZ DB instance deployment (1 instance)' }
        ],
        alCambiar: (v) => ((f.multiAz = v === 'multi'), form.repintar())
      })
    }),
    ui.contenedor({
      titulo: 'Connectivity',
      info: 'rds-conectividad',
      cx,
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({ etiqueta: 'DB subnet group', control: ui.entrada({ valor: fuente.grupoSubredes, desactivado: true }) }),
        ui.campo({ etiqueta: 'Public access', info: 'rds-acceso-publico', cx, control: ui.radios({ valor: f.publica ? 'si' : 'no', opciones: [{ valor: 'si', etiqueta: 'Publicly accessible' }, { valor: 'no', etiqueta: 'Not publicly accessible' }], alCambiar: (v) => (f.publica = v === 'si') }) }),
        ui.campo({ etiqueta: 'Existing VPC security groups', control: ui.selector({ multiple: true, valores: f.sgs, filtrar: true, opciones: cx.estado.gruposSeguridad.filter((g) => g.vpcId === fuente.vpcId).map((g) => ({ valor: g.id, etiqueta: g.nombre, descripcion: g.id })), alCambiar: (v) => (f.sgs = v) }) }),
        f.multiAz ? null : ui.campo({ etiqueta: 'Availability Zone', info: 'zona', cx, control: ui.selector({ opciones: [{ valor: '', etiqueta: 'No preference' }, ...zonas.map((z) => ({ valor: z, etiqueta: z, descripcion: z === fuente.zona ? 'Same AZ as the source' : undefined }))], valor: f.zona, alCambiar: (v) => (f.zona = v) }) })
      )
    }),
    ui.contenedor({ titulo: 'Additional configuration', cuerpo: ui.casilla({ etiqueta: 'Enable deletion protection', marcada: f.protegida, alCambiar: (v) => (f.protegida = v) }) }),
    ui.pieFormulario({
      cancelar: () => cx.ir(`rds/bases/${fuente.id}`),
      textoEnviar: 'Create read replica',
      enviar: () => {
        f.errores = {};
        if (!f.id.trim()) {
          f.errores.id = 'DB instance identifier is required.';
          return form.repintar();
        }
        const r = cx.hacer({ servicio: 'RDS', accion: 'CreateDBInstanceReadReplica', error: 'Failed to create read replica' }, (e) => crearReplicaRds(e, fuente.id, { id: f.id, clase: f.clase, multiAz: f.multiAz, zona: f.zona || null, publica: f.publica, gruposSeguridad: f.sgs, protegida: f.protegida }), { atomico: true });
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: `Successfully started the creation of read replica ${r.valor.id} from ${fuente.id}.` });
          cx.ir('rds/bases');
        }
      }
    })
  ]);
  return h('div', { class: 'cx-pagina cx-pagina--form cx-rds-form' }, ui.encabezado({ titulo: 'Create read replica DB instance', info: 'rds-replica', cx, descripcion: 'A read replica is a read-only copy of a DB instance. Amazon RDS replicates changes asynchronously from the source.' }), form);
}

function agregarLector(cx, { id }) {
  cx.migas([{ texto: 'Aurora and RDS', ruta: 'rds' }, { texto: 'Databases', ruta: 'rds/bases' }, { texto: id, ruta: `rds/bases/${id}` }, { texto: 'Add reader' }]);
  const c = clusterDe(cx, id);
  if (!c) return noExiste(cx, 'DB cluster', id, 'rds/bases');
  const zonas = zonasDeGrupoRds(cx.estado, grupoSubredesRdsDe(cx.estado, c.grupoSubredes));
  const f = { id: `${c.id}-reader-${c.miembros.length + 1}`, clase: c.clase, zona: '' };
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form cx-rds-form' },
    ui.encabezado({ titulo: 'Add reader', info: 'rds-aurora', cx, descripcion: `Adds an Aurora Replica to ${c.id}. Readers share the cluster volume and serve read traffic through the reader endpoint.` }),
    ui.contenedor({ titulo: 'Settings', cuerpo: ui.campo({ etiqueta: 'DB instance identifier', control: ui.entrada({ valor: f.id, alCambiar: (v) => (f.id = v) }) }) }),
    ui.contenedor({ titulo: 'Instance configuration', cuerpo: ui.campo({ etiqueta: 'DB instance class', control: ui.selector({ opciones: CLASES_RDS.filter((k) => k.donde.includes('aurora')).map(opcionClase), valor: f.clase, alCambiar: (v) => (f.clase = v) }) }) }),
    ui.contenedor({ titulo: 'Connectivity', cuerpo: ui.campo({ etiqueta: 'Availability Zone', control: ui.selector({ opciones: [{ valor: '', etiqueta: 'No preference' }, ...zonas.map((z) => ({ valor: z, etiqueta: z }))], valor: f.zona, alCambiar: (v) => (f.zona = v) }) }) }),
    ui.pieFormulario({
      cancelar: () => cx.ir(`rds/bases/${c.id}`),
      textoEnviar: 'Add reader',
      enviar: () => {
        const r = cx.hacer({ servicio: 'RDS', accion: 'CreateDBInstance', error: 'Failed to add reader' }, (e) => agregarLectorAurora(e, c.id, { id: f.id, clase: f.clase, zona: f.zona || null }), { atomico: true });
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: `Adding reader ${r.valor.id} to ${c.id}.` });
          cx.ir('rds/bases');
        }
      }
    })
  );
}

function tomarSnapshot(cx, { id }) {
  const b = baseDe(cx, id);
  cx.migas([{ texto: 'Aurora and RDS', ruta: 'rds' }, { texto: 'Snapshots', ruta: 'rds/snapshots' }, { texto: 'Take snapshot' }]);
  const r = col(cx);
  const f = { tipo: b && esCluster(b) ? 'cluster' : 'instancia', base: b?.id ?? null, nombre: '', error: null };
  const form = regionPagina(() => {
    const opciones = f.tipo === 'cluster' ? r.clusteres.map((c) => ({ valor: c.id, etiqueta: c.id, descripcion: motorTexto(c.motor) })) : r.instancias.filter((i) => !i.clusterId).map((i) => ({ valor: i.id, etiqueta: i.id, descripcion: `${motorTexto(i.motor)} · ${i.estado}` }));
    return [
      ui.alerta({ tipo: 'info', contenido: 'This feature is currently supported for InnoDB storage engine for MySQL. If you are using MyISAM, refer to details here.' }),
      ui.contenedor({
        titulo: 'Settings',
        info: 'rds-snapshot',
        cx,
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.campo({ etiqueta: 'Snapshot type', control: ui.radios({ valor: f.tipo, horizontal: true, opciones: [{ valor: 'instancia', etiqueta: 'DB instance' }, { valor: 'cluster', etiqueta: 'DB cluster' }], alCambiar: (v) => ((f.tipo = v), (f.base = null), form.repintar()) }) }),
          ui.campo({ etiqueta: f.tipo === 'cluster' ? 'DB cluster' : 'DB instance', control: ui.selector({ opciones, valor: f.base, filtrar: true, placeholder: 'Select', vacio: 'No databases', alCambiar: (v) => (f.base = v) }) }),
          ui.campo({ etiqueta: 'Snapshot name', control: ui.entrada({ valor: f.nombre, alCambiar: (v) => (f.nombre = v) }), error: f.error, restriccion: 'The identifier must start with a letter and contain only ASCII letters, digits, and hyphens. It can’t end with a hyphen or contain two consecutive hyphens.' })
        )
      }),
      ui.pieFormulario({
        cancelar: () => (b ? cx.ir(rutaBase(b)) : cx.ir('rds/snapshots')),
        textoEnviar: 'Take snapshot',
        enviar: () => {
          f.error = !f.base ? 'Choose a database first.' : !f.nombre.trim() ? 'Snapshot name is required.' : null;
          if (f.error) return form.repintar();
          const res = cx.hacer({ servicio: 'RDS', accion: f.tipo === 'cluster' ? 'CreateDBClusterSnapshot' : 'CreateDBSnapshot', error: 'Failed to take snapshot' }, (e) => tomarSnapshotRds(e, { baseId: f.base, nombre: f.nombre }));
          if (res.ok) {
            cx.flash({ tipo: 'exito', texto: `Successfully started creating snapshot ${res.valor.id}.` });
            cx.ir('rds/snapshots');
          }
        }
      })
    ];
  });
  return h('div', { class: 'cx-pagina cx-pagina--form' }, ui.encabezado({ titulo: 'Take DB snapshot', info: 'rds-snapshot', cx, descripcion: 'This snapshot will be a manual backup of your database. Manual snapshots are kept until you delete them.' }), form);
}

/** Formulario común de restaurar (point in time y snapshot): identificador, clase, despliegue y red. */
function formularioRestaurar(cx, origen, f) {
  const vpcId = origen.vpcId;
  const grupos = col(cx).gruposSubredes.filter((g) => g.vpcId === vpcId);
  const cluster = Boolean(origen.miembros || origen.clusterId);
  return [
    ui.contenedor({
      titulo: 'Settings',
      cuerpo: ui.campo({ etiqueta: cluster ? 'DB cluster identifier' : 'DB instance identifier', info: 'rds-identificador', cx, control: ui.entrada({ valor: f.id, alCambiar: (v) => (f.id = v) }), error: f.errores.id, restriccion: 'Type a name for the new database. It must be unique in this Region.' })
    }),
    cluster
      ? null
      : ui.contenedor({
          titulo: 'Availability and durability',
          info: 'rds-despliegue',
          cx,
          cuerpo: ui.tarjetas({ valor: f.despliegue, columnas: 1, opciones: [{ valor: 'multiaz', etiqueta: 'Multi-AZ DB instance deployment (2 instances)', desactivado: origen.plantilla === 'freetier' }, { valor: 'single', etiqueta: 'Single-AZ DB instance deployment (1 instance)' }], alCambiar: (v) => (f.despliegue = v) })
        }),
    cluster
      ? null
      : ui.contenedor({ titulo: 'Instance configuration', info: 'rds-clase', cx, cuerpo: ui.campo({ etiqueta: 'DB instance class', control: ui.selector({ opciones: CLASES_RDS.filter((k) => k.donde.includes('instancia') && (origen.plantilla !== 'freetier' || k.capaGratuita)).map(opcionClase), valor: f.clase, filtrar: true, alCambiar: (v) => (f.clase = v) }) }) }),
    ui.contenedor({
      titulo: 'Connectivity',
      info: 'rds-conectividad',
      cx,
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({ etiqueta: 'Virtual private cloud (VPC)', control: ui.entrada({ valor: vpcId, desactivado: true }) }),
        ui.campo({ etiqueta: 'DB subnet group', info: 'rds-grupo-subredes', cx, control: ui.selector({ opciones: [...grupos.map((g) => ({ valor: g.nombre, etiqueta: g.nombre })), { valor: '', etiqueta: 'Create new DB Subnet Group' }], valor: f.grupoSubredes, alCambiar: (v) => (f.grupoSubredes = v) }) }),
        ui.campo({ etiqueta: 'Public access', info: 'rds-acceso-publico', cx, control: ui.radios({ valor: f.publica ? 'si' : 'no', opciones: [{ valor: 'si', etiqueta: 'Yes' }, { valor: 'no', etiqueta: 'No' }], alCambiar: (v) => (f.publica = v === 'si') }) }),
        ui.campo({ etiqueta: 'Existing VPC security groups', control: ui.selector({ multiple: true, valores: f.sgs, filtrar: true, opciones: cx.estado.gruposSeguridad.filter((g) => g.vpcId === vpcId).map((g) => ({ valor: g.id, etiqueta: g.nombre, descripcion: g.id })), alCambiar: (v) => (f.sgs = v) }) })
      )
    }),
    ui.contenedor({ titulo: 'Additional configuration', cuerpo: ui.casilla({ etiqueta: 'Enable deletion protection', marcada: f.protegida, alCambiar: (v) => (f.protegida = v) }) })
  ];
}

const formRestaurarInicial = (origen) => ({
  id: '',
  despliegue: origen.multiAz ? 'multiaz' : 'single',
  clase: origen.clase && !String(origen.clase).includes('serverless') ? origen.clase : 'db.t3.micro',
  grupoSubredes: origen.grupoSubredes ?? '',
  publica: false,
  sgs: [...(origen.gruposSeguridad ?? [])],
  protegida: false,
  errores: {}
});

const paramsRestaurar = (f) => ({ id: f.id, despliegue: f.despliegue, clase: f.clase, grupoSubredes: f.grupoSubredes || null, publica: f.publica, gruposSeguridad: f.sgs, protegida: f.protegida });

function restaurarPunto(cx, { id }) {
  cx.migas([{ texto: 'Aurora and RDS', ruta: 'rds' }, { texto: 'Databases', ruta: 'rds/bases' }, { texto: id, ruta: `rds/bases/${id}` }, { texto: 'Restore to point in time' }]);
  const b = baseDe(cx, id);
  if (!b) return noExiste(cx, 'DB instance', id, 'rds/bases');
  const f = { ...formRestaurarInicial(b), momento: 'latest', fecha: '' };
  const form = regionPagina(() => {
    const v = ventanaRestauracionRds(cx.estado, baseDe(cx, id) ?? b);
    return [
      !v ? ui.alerta({ tipo: 'aviso', titulo: 'No restorable time', contenido: 'Automated backups are not enabled for this database, or the first automated backup hasn’t finished yet.' }) : null,
      ui.contenedor({
        titulo: 'Restore time',
        info: 'rds-pitr',
        cx,
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.radios({
            valor: f.momento,
            opciones: [
              { valor: 'latest', etiqueta: 'Latest restorable time', descripcion: v ? ui.fechaLarga(v.hasta) : '–' },
              { valor: 'custom', etiqueta: 'Custom date and time', descripcion: v ? `Choose a time between ${ui.fechaLarga(v.desde)} and ${ui.fechaLarga(v.hasta)}.` : undefined }
            ],
            alCambiar: (x) => ((f.momento = x), form.repintar())
          }),
          f.momento === 'custom' ? ui.campo({ etiqueta: 'Date and time (UTC, ISO 8601)', control: ui.entrada({ valor: f.fecha || v?.desde || '', placeholder: '2026-11-10T16:00:00Z', alCambiar: (x) => (f.fecha = x) }) }) : null
        )
      }),
      ui.contenedor({ titulo: 'Source', cuerpo: ui.pares([{ etiqueta: esCluster(b) ? 'Source DB cluster' : 'Source DB instance', valor: b.id }, { etiqueta: 'Engine', valor: `${motorTexto(b.motor)} ${b.version}` }], { columnas: 2 }) }),
      ...formularioRestaurar(cx, b, f),
      ui.pieFormulario({
        cancelar: () => cx.ir(rutaBase(b)),
        textoEnviar: 'Restore to point in time',
        enviar: () => {
          f.errores = {};
          if (!f.id.trim()) {
            f.errores.id = 'DB instance identifier is required.';
            return form.repintar();
          }
          const r = cx.hacer({ servicio: 'RDS', accion: 'RestoreDBInstanceToPointInTime', error: 'Failed to restore to point in time' }, (e) => restaurarPuntoRds(e, b.id, { momento: f.momento === 'latest' ? 'latest' : f.fecha || v?.desde, ...paramsRestaurar(f) }), { atomico: true });
          if (r.ok) {
            cx.flash({ tipo: 'exito', texto: `Successfully started restoring ${b.id} to the new database ${r.valor.id}.` });
            cx.ir('rds/bases');
          }
        }
      })
    ];
  });
  return h('div', { class: 'cx-pagina cx-pagina--form cx-rds-form' }, ui.encabezado({ titulo: 'Restore to point in time', info: 'rds-pitr', cx, descripcion: 'You are creating a new database from a source database at a specified time. This new database will have the default security group and the default parameter group unless you change them.' }), form);
}

/* ======================================================= Snapshots */

function listaSnapshots(cx) {
  cx.migas([{ texto: 'Aurora and RDS', ruta: 'rds' }, { texto: 'Snapshots' }]);
  const st = { pestana: 'manual' };
  const tablaDe = (tipo) =>
    ui.tabla(cx, {
      titulo: tipo === 'manual' ? 'Manual snapshots' : 'System snapshots',
      info: 'rds-snapshot',
      variante: 'contenedor',
      filas: () => col(cx).snapshots.filter((s) => (tipo === 'manual' ? s.tipo === 'manual' : s.tipo === 'automated')),
      clave: (s) => s.id,
      seleccion: 'unica',
      filtro: 'Filter by snapshots',
      columnas: [
        { titulo: 'Snapshot name', valor: (s) => ui.enlace(s.id, rutaSnap(s), { cx }) },
        { titulo: 'DB instance or cluster', valor: (s) => s.instanciaId ?? s.clusterId },
        { titulo: 'Snapshot creation time', valor: (s) => ui.fecha(s.creado) },
        { titulo: 'DB instance created time', valor: (s) => ui.fecha(baseDe(cx, s.instanciaId ?? s.clusterId)?.creado) },
        { titulo: 'Status', valor: (s) => (s.estado === 'creating' ? ui.estado('pendiente', 'Creating') : ui.estado('exito', 'Available')) },
        { titulo: 'Progress', valor: (s) => (s.estado === 'creating' ? `${s.progreso ?? 0}%` : 'Completed') },
        { titulo: 'VPC', valor: (s) => enlaceRecurso(cx, s.vpcId) },
        { titulo: 'Type', valor: (s) => (s.tipo === 'manual' ? 'Manual' : s.retenido ? 'Automated (retained)' : 'Automated') },
        { titulo: 'Engine', valor: (s) => motorTexto(s.motor) },
        { titulo: 'Visibility', valor: (s) => (s.publico ? 'Public' : 'Private') }
      ],
      acciones: (sel) => {
        const s = sel[0];
        return [
          ui.menuBoton('Actions', () => [
            { texto: 'Restore snapshot', escribe: true, desactivado: !s || s.estado !== 'available', alClic: () => cx.ir(`${rutaSnap(s)}/restaurar`) },
            { texto: 'Copy snapshot', escribe: true, desactivado: !s || s.estado !== 'available', alClic: () => copiarSnapshot(cx, s) },
            { texto: 'Share snapshot', escribe: true, desactivado: !s || s.tipo !== 'manual' || s.estado !== 'available', alClic: () => compartirSnapshot(cx, s) },
            { texto: 'Migrate snapshot', desactivado: true },
            { texto: 'Export to Amazon S3', desactivado: true },
            '-',
            { texto: 'Delete snapshot', escribe: true, desactivado: !s || (s.tipo !== 'manual' && !s.retenido), alClic: () => eliminarSnapshot(cx, s) }
          ], { desactivado: !s }),
          ui.boton('Take snapshot', { variante: 'primario', alClic: () => cx.ir('rds/snapshots/tomar') })
        ];
      },
      vacio: { titulo: 'No snapshots', texto: tipo === 'manual' ? 'You don’t have any manual snapshots.' : 'There are no automated snapshots.' }
    });
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Snapshots', info: 'rds-snapshot', cx }),
    ui.pestanas({
      activa: st.pestana,
      alCambiar: (p) => (st.pestana = p),
      pestanas: [
        { id: 'manual', texto: 'Manual', contenido: () => tablaDe('manual') },
        { id: 'sistema', texto: 'System', contenido: () => tablaDe('automated') },
        { id: 'compartidos', texto: 'Shared with me', desactivada: true, contenido: () => null },
        { id: 'publicos', texto: 'Public', desactivada: true, contenido: () => null },
        { id: 'backup', texto: 'Backup service', desactivada: true, contenido: () => null },
        { id: 'exports', texto: 'Exports in Amazon S3', desactivada: true, contenido: () => null }
      ]
    })
  );
}

function detalleSnapshot(cx, { id }) {
  cx.migas([{ texto: 'Aurora and RDS', ruta: 'rds' }, { texto: 'Snapshots', ruta: 'rds/snapshots' }, { texto: id }]);
  const buscar = () => col(cx).snapshots.find((s) => s.id === id);
  if (!buscar()) return noExiste(cx, 'Snapshot', id, 'rds/snapshots');
  return cx.vivo(() => {
    const s = buscar();
    if (!s) return noExiste(cx, 'Snapshot', id, 'rds/snapshots');
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({
        titulo: s.id,
        info: 'rds-snapshot',
        cx,
        acciones: [
          ui.menuBoton('Actions', () => [
            { texto: 'Restore snapshot', escribe: true, desactivado: s.estado !== 'available', alClic: () => cx.ir(`${rutaSnap(s)}/restaurar`) },
            { texto: 'Copy snapshot', escribe: true, desactivado: s.estado !== 'available', alClic: () => copiarSnapshot(cx, s) },
            { texto: 'Share snapshot', escribe: true, desactivado: s.tipo !== 'manual' || s.estado !== 'available', alClic: () => compartirSnapshot(cx, s) },
            { texto: 'Delete snapshot', escribe: true, desactivado: s.tipo !== 'manual' && !s.retenido, alClic: () => eliminarSnapshot(cx, s) }
          ])
        ]
      }),
      ui.contenedor({
        titulo: 'Details',
        cuerpo: ui.pares(
          [
            { etiqueta: 'DB snapshot name', valor: s.id },
            { etiqueta: 'ARN', valor: ui.copiable(s.arn) },
            { etiqueta: 'Status', valor: s.estado === 'creating' ? ui.estado('pendiente', `Creating (${s.progreso ?? 0}%)`) : ui.estado('exito', 'Available') },
            { etiqueta: 'Type', valor: s.tipo === 'manual' ? 'Manual' : 'Automated' },
            { etiqueta: s.clusterId ? 'DB cluster' : 'DB instance', valor: s.instanciaId ?? s.clusterId },
            { etiqueta: 'Engine', valor: `${motorTexto(s.motor)} ${s.version}` },
            { etiqueta: 'Allocated storage', valor: s.gib ? `${s.gib} GiB` : '–' },
            { etiqueta: 'Port', valor: String(s.puerto) },
            { etiqueta: 'Availability zone', valor: s.zona ?? '–' },
            { etiqueta: 'VPC', valor: enlaceRecurso(cx, s.vpcId) },
            { etiqueta: 'Encrypted', valor: s.cifrado ? 'Yes' : 'No' },
            { etiqueta: 'Visibility', valor: s.publico ? 'Public' : 'Private' },
            { etiqueta: 'Snapshot creation time', valor: ui.fechaLarga(s.creado) }
          ],
          { columnas: 3 }
        )
      })
    );
  });
}

function restaurarSnapshot(cx, { id }) {
  cx.migas([{ texto: 'Aurora and RDS', ruta: 'rds' }, { texto: 'Snapshots', ruta: 'rds/snapshots' }, { texto: id, ruta: `rds/snapshots/${encodeURIComponent(id)}` }, { texto: 'Restore snapshot' }]);
  const s = col(cx).snapshots.find((x) => x.id === id);
  if (!s) return noExiste(cx, 'Snapshot', id, 'rds/snapshots');
  const origen = baseDe(cx, s.instanciaId ?? s.clusterId) ?? s;
  const f = formRestaurarInicial({ ...s, ...origen, vpcId: s.vpcId });
  const form = regionPagina(() => [
    ui.contenedor({ titulo: 'DB specifications', cuerpo: ui.pares([{ etiqueta: 'Snapshot', valor: s.id }, { etiqueta: 'Engine', valor: `${motorTexto(s.motor)} ${s.version}` }], { columnas: 2 }) }),
    ...formularioRestaurar(cx, { ...origen, vpcId: s.vpcId, clusterId: s.clusterId }, f),
    ui.pieFormulario({
      cancelar: () => cx.ir('rds/snapshots'),
      textoEnviar: 'Restore DB instance',
      enviar: () => {
        f.errores = {};
        if (!f.id.trim()) {
          f.errores.id = 'DB instance identifier is required.';
          return form.repintar();
        }
        const r = cx.hacer({ servicio: 'RDS', accion: 'RestoreDBInstanceFromDBSnapshot', error: 'Failed to restore snapshot' }, (e) => restaurarSnapshotRds(e, s.id, paramsRestaurar(f)), { atomico: true });
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: `Successfully started restoring ${r.valor.id} from snapshot ${s.id}.` });
          cx.ir('rds/bases');
        }
      }
    })
  ]);
  return h('div', { class: 'cx-pagina cx-pagina--form cx-rds-form' }, ui.encabezado({ titulo: 'Restore snapshot', info: 'rds-snapshot', cx, descripcion: 'You are creating a new database from a snapshot. The new database has the data that the source had when the snapshot was taken.' }), form);
}

function copiarSnapshot(cx, s) {
  const f = { nombre: `${s.id.replace(/^rds:/, '')}-copy`, cifrado: s.cifrado };
  const m = cx.modal({
    titulo: 'Copy snapshot',
    contenido: [
      ui.pares([{ etiqueta: 'Source DB snapshot', valor: s.id }], { columnas: 1 }),
      ui.campo({ etiqueta: 'New DB snapshot identifier', control: ui.entrada({ valor: f.nombre, alCambiar: (v) => (f.nombre = v) }) }),
      ui.campo({ etiqueta: 'Destination Region', control: ui.selector({ opciones: [{ valor: 'us-east-1', etiqueta: 'US East (N. Virginia)' }], valor: 'us-east-1', desactivado: true }) }),
      ui.casilla({ etiqueta: 'Enable encryption', marcada: f.cifrado, desactivado: s.cifrado, alCambiar: (v) => (f.cifrado = v) })
    ],
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Copy snapshot', {
        variante: 'primario',
        alClic: () => {
          const r = cx.hacer({ servicio: 'RDS', accion: 'CopyDBSnapshot', error: 'Failed to copy snapshot' }, (e) => copiarSnapshotRds(e, s.id, { nombre: f.nombre, cifrado: f.cifrado }));
          if (r.ok) {
            m.cerrar();
            cx.flash({ tipo: 'exito', texto: `Copying snapshot ${s.id} to ${r.valor.id}.` });
          }
        }
      })
    ]
  });
}

function compartirSnapshot(cx, s) {
  const f = { publico: s.publico };
  const m = cx.modal({
    titulo: `Share snapshot ${s.id}`,
    contenido: [
      ui.campo({
        etiqueta: 'DB snapshot visibility',
        info: 'rds-snapshot',
        cx,
        control: ui.radios({ valor: f.publico ? 'pub' : 'priv', opciones: [{ valor: 'priv', etiqueta: 'Private', descripcion: 'Only the AWS accounts that you add can restore this snapshot.' }, { valor: 'pub', etiqueta: 'Public', descripcion: 'Any AWS account can restore this snapshot and see all of its data.' }], alCambiar: (v) => (f.publico = v === 'pub') })
      }),
      ui.alerta({ tipo: 'aviso', contenido: 'A public snapshot exposes all the data of your database to every AWS account. Trusted Advisor flags public RDS snapshots as a security risk.' })
    ],
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Save', {
        variante: 'primario',
        alClic: () => {
          const r = cx.hacer({ servicio: 'RDS', accion: 'ModifyDBSnapshotAttribute', error: 'Failed to share snapshot' }, (e) => compartirSnapshotRds(e, s.id, { publico: f.publico }));
          if (r.ok) {
            m.cerrar();
            cx.flash({ tipo: 'exito', texto: `Snapshot ${s.id} is now ${f.publico ? 'public' : 'private'}.` });
          }
        }
      })
    ]
  });
}

function eliminarSnapshot(cx, s) {
  cx.confirmar({
    titulo: 'Delete snapshot?',
    palabra: 'delete me',
    contenido: h('p', {}, `Are you sure you want to delete ${s.id}? You can’t restore a database from it afterwards.`),
    aceptar: () => {
      const r = cx.hacer({ servicio: 'RDS', accion: 'DeleteDBSnapshot', error: 'Failed to delete snapshot' }, (e) => eliminarSnapshotRds(e, s.id));
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: `Successfully deleted snapshot ${s.id}.` });
        if (cx.ruta !== 'rds/snapshots') cx.ir('rds/snapshots');
      }
      return r.ok;
    }
  });
}

/* ======================================================= Automated backups */

function respaldos(cx) {
  cx.migas([{ texto: 'Aurora and RDS', ruta: 'rds' }, { texto: 'Automated backups' }]);
  const st = { pestana: 'actual' };
  const actuales = () => [...col(cx).instancias.filter((i) => !i.clusterId && i.retencion > 0), ...col(cx).clusteres.filter((c) => c.retencion > 0)];
  const retenidos = () => {
    const vistos = new Map();
    for (const s of col(cx).snapshots.filter((x) => x.retenido)) {
      const id = s.instanciaId ?? s.clusterId;
      if (!vistos.has(id)) vistos.set(id, s);
    }
    return [...vistos.values()];
  };
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Automated backups', info: 'rds-respaldo', cx }),
    ui.pestanas({
      activa: st.pestana,
      alCambiar: (p) => (st.pestana = p),
      pestanas: [
        {
          id: 'actual',
          texto: 'Current Region',
          contenido: () =>
            ui.tabla(cx, {
              titulo: 'Current Region backups',
              variante: 'contenedor',
              filas: actuales,
              clave: (b) => b.id,
              seleccion: 'unica',
              filtro: 'Filter by automated backups',
              columnas: [
                { titulo: 'DB name', valor: (b) => ui.enlace(b.id, rutaBase(b), { cx }) },
                { titulo: 'Status', valor: (b) => (b.primerRespaldo ? ui.estado('exito', 'Replicating') : ui.estado('pendiente', 'Pending')) },
                { titulo: 'Engine', valor: (b) => motorTexto(b.motor) },
                { titulo: 'Earliest restorable time', valor: (b) => ui.fecha(ventanaRestauracionRds(cx.estado, b)?.desde) },
                { titulo: 'Latest restorable time', valor: (b) => ui.fecha(ventanaRestauracionRds(cx.estado, b)?.hasta) },
                { titulo: 'Retention period', valor: (b) => `${b.retencion} day${b.retencion === 1 ? '' : 's'}` },
                { titulo: 'Backup window', valor: (b) => b.ventanaRespaldo ?? '–' }
              ],
              acciones: (sel) => [ui.menuBoton('Actions', () => [{ texto: 'Restore to point in time', escribe: true, desactivado: !sel[0]?.primerRespaldo, alClic: () => cx.ir(`rds/bases/${sel[0].id}/restaurar`) }, { texto: 'Manage replication to another region', desactivado: true }], { desactivado: !sel.length })],
              vacio: { titulo: 'No automated backups', texto: 'Databases with a backup retention period greater than 0 appear here.' }
            })
        },
        {
          id: 'retenidos',
          texto: 'Retained',
          contenido: () =>
            ui.tabla(cx, {
              titulo: 'Retained backups',
              variante: 'contenedor',
              filas: retenidos,
              clave: (s) => s.id,
              filtro: 'Filter by retained backups',
              columnas: [
                { titulo: 'DB name', valor: (s) => s.instanciaId ?? s.clusterId },
                { titulo: 'Engine', valor: (s) => motorTexto(s.motor) },
                { titulo: 'Backup time', valor: (s) => ui.fecha(s.creado) },
                { titulo: 'Snapshot', valor: (s) => ui.enlace(s.id, rutaSnap(s), { cx }) }
              ],
              vacio: { titulo: 'No retained backups', texto: 'When you delete a database with «Retain automated backups», its backups appear here.' }
            })
        },
        { id: 'replicados', texto: 'Replicated', desactivada: true, contenido: () => null }
      ]
    })
  );
}

/* ======================================================= Subnet groups */

function listaGrupos(cx) {
  cx.migas([{ texto: 'Aurora and RDS', ruta: 'rds' }, { texto: 'Subnet groups' }]);
  const t = ui.tabla(cx, {
    titulo: 'DB subnet groups',
    info: 'rds-grupo-subredes',
    filas: () => col(cx).gruposSubredes,
    clave: (g) => g.nombre,
    seleccion: 'unica',
    filtro: 'Filter subnet groups',
    columnas: [
      { titulo: 'Name', valor: (g) => ui.enlace(g.nombre, `rds/grupos-subredes/${encodeURIComponent(g.nombre)}`, { cx }) },
      { titulo: 'Description', valor: (g) => g.descripcion },
      { titulo: 'Status', valor: () => ui.estado('exito', 'Complete') },
      { titulo: 'VPC', valor: (g) => enlaceRecurso(cx, g.vpcId) },
      { titulo: 'Supported network types', valor: () => 'IPv4' }
    ],
    acciones: (sel) => [
      ui.boton('Edit', { escribe: true, desactivado: sel.length !== 1, alClic: () => cx.ir(`rds/grupos-subredes/${encodeURIComponent(sel[0].nombre)}/editar`) }),
      ui.boton('Delete', { escribe: true, desactivado: sel.length !== 1, alClic: () => eliminarGrupo(cx, sel[0]) }),
      ui.boton('Create DB subnet group', { variante: 'primario', alClic: () => cx.ir('rds/grupos-subredes/crear') })
    ],
    vacio: { titulo: 'No DB subnet groups', texto: 'You don’t have any DB subnet groups.', accion: ui.boton('Create DB subnet group', { escribe: true, alClic: () => cx.ir('rds/grupos-subredes/crear') }) }
  });
  return h('div', { class: 'cx-pagina' }, t);
}

function eliminarGrupo(cx, g) {
  cx.confirmar({
    titulo: 'Delete DB subnet group',
    textoBoton: 'Delete',
    contenido: h('p', {}, `Are you sure you want to delete the DB subnet group ${g.nombre}?`),
    aceptar: () => {
      const r = cx.hacer({ servicio: 'RDS', accion: 'DeleteDBSubnetGroup', error: `Failed to delete ${g.nombre}` }, (e) => eliminarGrupoSubredesRds(e, g.nombre));
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: `Successfully deleted DB subnet group ${g.nombre}.` });
        if (cx.ruta !== 'rds/grupos-subredes') cx.ir('rds/grupos-subredes');
      }
      return r.ok;
    }
  });
}

/** El formulario de crear o editar un subnet group: VPC, Availability Zones y Subnets. */
function formGrupo(cx, existente) {
  const e = cx.estado;
  const vpcDef = e.vpcs.find((v) => v.porDefecto) ?? e.vpcs[0];
  const f = existente
    ? { nombre: existente.nombre, descripcion: existente.descripcion, vpcId: existente.vpcId, zonas: zonasDeGrupoRds(e, existente), subredes: [...existente.subredes], errores: {} }
    : { nombre: '', descripcion: '', vpcId: vpcDef?.id ?? null, zonas: [], subredes: [], errores: {} };
  let cuentaZonas = null;
  const form = regionPagina(() => {
    const subredesVpc = e.subredes.filter((s) => s.vpcId === f.vpcId);
    const zonasVpc = [...new Set(subredesVpc.map((s) => s.az))].sort();
    return [
      ui.contenedor({
        titulo: 'Subnet group details',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.campo({ etiqueta: 'Name', descripcion: 'You won’t be able to modify the name after your subnet group has been created.', control: ui.entrada({ valor: f.nombre, desactivado: Boolean(existente), alCambiar: (v) => (f.nombre = v) }), error: f.errores.nombre, restriccion: 'Must contain from 1 to 255 characters. Alphanumeric characters, spaces, hyphens, underscores, and periods are allowed.' }),
          ui.campo({ etiqueta: 'Description', control: ui.entrada({ valor: f.descripcion, alCambiar: (v) => (f.descripcion = v) }), error: f.errores.descripcion }),
          ui.campo({
            etiqueta: 'VPC',
            info: 'vpc',
            cx,
            descripcion: 'Choose a VPC identifier that corresponds to the subnets you want to use for your DB subnet group. You won’t be able to choose a different VPC identifier after your subnet group has been created.',
            control: ui.selector({ opciones: opcionesVpc(e), valor: f.vpcId, desactivado: Boolean(existente), alCambiar: (v) => ((f.vpcId = v), (f.zonas = []), (f.subredes = []), form.repintar()) })
          })
        )
      }),
      ui.contenedor({
        titulo: 'Add subnets',
        info: 'rds-grupo-subredes',
        cx,
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.campo({
            etiqueta: 'Availability Zones',
            descripcion: 'Choose the Availability Zones that include the subnets you want to add.',
            control: ui.selector({
              multiple: true,
              valores: f.zonas,
              placeholder: 'Choose an availability zone',
              opciones: zonasVpc.map((z) => ({ valor: z, etiqueta: z, descripcion: ID_ZONA[z] })),
              alCambiar: (v) => {
                f.zonas = v;
                f.subredes = f.subredes.filter((id) => v.includes(e.subredes.find((s) => s.id === id)?.az));
                form.repintar();
              }
            })
          }),
          ui.campo({
            etiqueta: 'Subnets',
            descripcion: 'Choose the subnets that you want to add. The list includes the subnets in the selected Availability Zones.',
            control: ui.selector({
              multiple: true,
              valores: f.subredes,
              placeholder: 'Select subnets',
              vacio: f.zonas.length ? 'No subnets' : 'Choose Availability Zones first',
              opciones: subredesVpc.filter((s) => f.zonas.includes(s.az)).map((s) => ({ ...opcionSubred(e, s), etiqueta: `${s.az} · ${s.id}${s.nombre ? ` (${s.nombre})` : ''}`, descripcion: s.cidr })),
              alCambiar: (v) => ((f.subredes = v), cuentaZonas?.repintar())
            }),
            error: f.errores.subredes
          }),
          (cuentaZonas = ui.region(() => {
            const n = new Set(f.subredes.map((id) => e.subredes.find((s) => s.id === id)?.az)).size;
            return f.subredes.length && n < 2 ? ui.alerta({ tipo: 'aviso', contenido: 'For Multi-AZ DB instances and DB clusters, the DB subnet group must have subnets in at least 2 Availability Zones.' }) : null;
          }))
        )
      }),
      ui.tabla(cx, {
        titulo: 'Subnets selected',
        variante: 'contenedor',
        refrescar: false,
        filas: () => f.subredes.map((id) => e.subredes.find((s) => s.id === id)).filter(Boolean),
        clave: (s) => s.id,
        filtro: false,
        contador: true,
        columnas: [
          { titulo: 'Availability zone', valor: (s) => s.az },
          { titulo: 'Subnet ID', valor: (s) => s.id },
          { titulo: 'CIDR block', valor: (s) => s.cidr }
        ],
        vacio: { titulo: 'No subnets selected' }
      }),
      ui.pieFormulario({
        cancelar: () => cx.ir('rds/grupos-subredes'),
        textoEnviar: existente ? 'Save' : 'Create',
        enviar: () => {
          f.errores = {};
          if (!f.nombre.trim()) f.errores.nombre = 'Name is required.';
          if (!f.descripcion.trim()) f.errores.descripcion = 'Description is required.';
          if (!f.subredes.length) f.errores.subredes = 'Choose at least one subnet.';
          if (Object.values(f.errores).some(Boolean)) return form.repintar();
          const r = existente
            ? cx.hacer({ servicio: 'RDS', accion: 'ModifyDBSubnetGroup', error: `Failed to modify ${existente.nombre}` }, (est) => editarGrupoSubredesRds(est, existente.nombre, { descripcion: f.descripcion, subredes: f.subredes }))
            : cx.hacer({ servicio: 'RDS', accion: 'CreateDBSubnetGroup', error: 'Failed to create DB subnet group' }, (est) => crearGrupoSubredesRds(est, { nombre: f.nombre, descripcion: f.descripcion, vpcId: f.vpcId, subredes: f.subredes }));
          if (r.ok) {
            cx.flash({ tipo: 'exito', texto: existente ? `Successfully modified ${r.valor.nombre}.` : `Successfully created ${r.valor.nombre}. View subnet group` });
            cx.ir('rds/grupos-subredes');
          }
        }
      })
    ];
  });
  return form;
}

function crearGrupo(cx) {
  cx.migas([{ texto: 'Aurora and RDS', ruta: 'rds' }, { texto: 'Subnet groups', ruta: 'rds/grupos-subredes' }, { texto: 'Create DB subnet group' }]);
  return h('div', { class: 'cx-pagina cx-pagina--form' }, ui.encabezado({ titulo: 'Create DB subnet group', info: 'rds-grupo-subredes', cx, descripcion: 'To create a new subnet group, give it a name and a description, and choose an existing VPC. You will then be able to add subnets related to that VPC.' }), formGrupo(cx, null));
}

function editarGrupo(cx, { nombre }) {
  cx.migas([{ texto: 'Aurora and RDS', ruta: 'rds' }, { texto: 'Subnet groups', ruta: 'rds/grupos-subredes' }, { texto: nombre, ruta: `rds/grupos-subredes/${encodeURIComponent(nombre)}` }, { texto: 'Edit' }]);
  const g = grupoSubredesRdsDe(cx.estado, nombre);
  if (!g) return noExiste(cx, 'DB subnet group', nombre, 'rds/grupos-subredes');
  return h('div', { class: 'cx-pagina cx-pagina--form' }, ui.encabezado({ titulo: `Edit DB subnet group: ${g.nombre}`, info: 'rds-grupo-subredes', cx }), formGrupo(cx, g));
}

function detalleGrupo(cx, { nombre }) {
  cx.migas([{ texto: 'Aurora and RDS', ruta: 'rds' }, { texto: 'Subnet groups', ruta: 'rds/grupos-subredes' }, { texto: nombre }]);
  const buscar = () => grupoSubredesRdsDe(cx.estado, nombre);
  if (!buscar()) return noExiste(cx, 'DB subnet group', nombre, 'rds/grupos-subredes');
  const g = buscar();
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: g.nombre, info: 'rds-grupo-subredes', cx, acciones: [ui.boton('Edit', { escribe: true, alClic: () => cx.ir(`rds/grupos-subredes/${encodeURIComponent(g.nombre)}/editar`) }), ui.boton('Delete', { escribe: true, alClic: () => eliminarGrupo(cx, g) })] }),
    ui.contenedor({
      titulo: 'Subnet group details',
      cuerpo: ui.pares(
        [
          { etiqueta: 'VPC', valor: enlaceRecurso(cx, g.vpcId, { conNombre: true }) },
          { etiqueta: 'ARN', valor: ui.copiable(g.arn) },
          { etiqueta: 'Description', valor: g.descripcion },
          { etiqueta: 'Supported network types', valor: 'IPv4' }
        ],
        { columnas: 2 }
      )
    }),
    ui.tabla(cx, {
      titulo: 'Subnets',
      variante: 'contenedor',
      filas: () => (buscar()?.subredes ?? []).map((id) => cx.estado.subredes.find((s) => s.id === id)).filter(Boolean),
      clave: (s) => s.id,
      filtro: false,
      columnas: [
        { titulo: 'Availability zone', valor: (s) => s.az },
        { titulo: 'Subnet ID', valor: (s) => enlaceRecurso(cx, s.id) },
        { titulo: 'CIDR block', valor: (s) => s.cidr }
      ]
    }),
    ui.tabla(cx, {
      titulo: 'Databases using this subnet group',
      variante: 'contenedor',
      refrescar: false,
      filas: () => [...col(cx).instancias.filter((i) => i.grupoSubredes === g.nombre && !i.clusterId), ...col(cx).clusteres.filter((c) => c.grupoSubredes === g.nombre)],
      clave: (b) => b.id,
      filtro: false,
      columnas: [
        { titulo: 'DB identifier', valor: (b) => ui.enlace(b.id, rutaBase(b), { cx }) },
        { titulo: 'Status', valor: (b) => estadoRds(b) },
        { titulo: 'Engine', valor: (b) => motorTexto(b.motor) }
      ],
      vacio: { titulo: 'No databases', texto: 'No database uses this subnet group.' }
    })
  );
}

/* ======================================================= Events */

function eventos(cx) {
  cx.migas([{ texto: 'Aurora and RDS', ruta: 'rds' }, { texto: 'Events' }]);
  return h('div', { class: 'cx-pagina' }, ui.encabezado({ titulo: 'Events', info: 'rds-eventos', cx, descripcion: 'Events from the last 24 hours for your databases, snapshots and subnet groups.' }), tablaEventos(cx, null));
}

function noDisponible(cx, { que }) {
  cx.migas([{ texto: 'Aurora and RDS', ruta: 'rds' }, { texto: que }]);
  return ui.noDisponible(que);
}

/* ================================================================ ayudas */

const ayudas = {
  'rds-base': {
    titulo: 'Amazon RDS (base de datos administrada)',
    texto: [
      '**RDS** te renta una base de datos relacional (MySQL, PostgreSQL, MariaDB…) ya instalada. AWS se encarga de los parches, los respaldos y el hardware; tú solo usas la base y decides su tamaño.',
      'Compáralo con instalar MySQL tú mismo en una instancia EC2: ahí **tú** parchas, respaldas y reparas. Es el **modelo de responsabilidad compartida**.',
      'Una base tarda unos minutos en crearse: pasa por **Creating → Backing-up → Available** (aquí, unos 30 segundos).'
    ]
  },
  'rds-motor': {
    titulo: 'Motor (engine)',
    texto: [
      'El **motor** es el programa de base de datos. MySQL y MariaDB usan el puerto `3306`; PostgreSQL usa el `5432`.',
      '**Aurora** es el motor propio de AWS, compatible con MySQL o PostgreSQL: guarda 6 copias de tus datos en 3 zonas y es más rápido, pero más caro.',
      'Oracle, SQL Server y Db2 existen en AWS pero no están en este simulador.'
    ]
  },
  'rds-plantilla': {
    titulo: 'Plantillas (Templates)',
    texto: [
      [
        '**Production**: Multi-AZ, disco io2 y protección contra borrado. Alta disponibilidad, más caro.',
        '**Dev/Test**: una sola instancia para desarrollar.',
        '**Free tier**: clase micro y 20 GiB; **solo permite Single-AZ**.'
      ],
      'La plantilla solo llena valores sugeridos: puedes cambiarlos abajo.'
    ]
  },
  'rds-despliegue': {
    titulo: 'Multi-AZ, clúster y réplicas',
    texto: [
      '**Multi-AZ DB instance**: AWS mantiene una copia **standby** sincrónica en otra zona. Si la principal falla, la standby toma su lugar sola (*failover*). La standby **no atiende lecturas**: sirve para disponibilidad, no para rendimiento.',
      '**Multi-AZ DB cluster**: 3 instancias en 3 zonas; las dos de reserva sí atienden lecturas.',
      '**Read replica** (Actions → Create read replica): copia **asíncrona** que sí atiende lecturas; sirve para repartir la carga de consultas.'
    ]
  },
  'rds-identificador': {
    titulo: 'Identificador de la base',
    texto: ['Es el nombre de la base en tu cuenta (no el nombre de la base de datos interna). Empieza con letra, usa letras, números y guiones, sin `--` ni guion al final. Se guarda en minúsculas.']
  },
  'rds-credenciales': {
    titulo: 'Usuario y contraseña maestros',
    texto: [
      'El **master username** es el administrador de la base (`admin` en MySQL, `postgres` en PostgreSQL).',
      'La contraseña lleva al menos 8 caracteres y no puede tener `/`, `@`, `"` ni espacios.',
      '**Managed in AWS Secrets Manager** guarda la contraseña en Secrets Manager y la rota por ti (cada 7 días): es lo más seguro. En **Select the encryption key** eliges con qué llave de KMS se cifra ese secreto: `aws/secretsmanager` o una llave tuya.',
      'El simulador **no guarda** tu contraseña: no uses una real.'
    ]
  },
  'rds-clase': {
    titulo: 'Clase de instancia',
    texto: [
      'La **clase** es el tamaño de la máquina de la base: `db.t3.micro` = 2 vCPU y 1 GiB de RAM.',
      'Las **t** (burstable) son baratas y aguantan picos cortos; las **m** son de uso general y las **r** tienen mucha memoria.',
      'En Aurora existe **Serverless v2**: la capacidad sube y baja sola en ACU (1 ACU ≈ 2 GiB de RAM).'
    ]
  },
  'rds-almacenamiento': {
    titulo: 'Almacenamiento',
    texto: [
      '`gp3` es SSD de uso general (mínimo 20 GiB); `io2` es SSD con IOPS garantizadas (mínimo 100 GiB), para producción.',
      '**Storage autoscaling** hace crecer el disco solo cuando se está llenando, hasta el máximo que pongas.',
      'El disco se puede **agrandar** después con Modify, pero **nunca achicar**.'
    ]
  },
  'rds-conectividad': {
    titulo: 'Conectividad',
    texto: [
      'La base vive en una **VPC** y en las subredes de su **DB subnet group**. Una vez creada, no cambia de VPC.',
      '**Connect to an EC2 compute resource** arma la red por ti: crea los grupos `rds-ec2-N` (en la base) y `ec2-rds-N` (en la instancia) para que esa instancia, y solo ella, entre al puerto de la base.',
      'Para que una instancia EC2 llegue a la base: misma VPC y una regla de entrada en el grupo de la base con el puerto del motor (3306/5432) y como origen **el grupo de seguridad de la instancia**.'
    ]
  },
  'rds-grupo-subredes': {
    titulo: 'DB subnet group',
    texto: [
      'Es la lista de subredes (de una misma VPC) donde RDS puede poner tu base. Debe cubrir **al menos 2 zonas de disponibilidad**, aunque tu base sea Single-AZ: así puede pasar a Multi-AZ después.',
      'Lo normal es usar **subredes privadas** para que la base no quede expuesta a internet.',
      'Si eliges «Create new DB Subnet Group», RDS crea `default-vpc-…` con todas las subredes de la VPC.'
    ]
  },
  'rds-acceso-publico': {
    titulo: 'Public access',
    texto: [
      '**No** (recomendado): la base solo tiene IP privada; solo la alcanzan recursos dentro de la VPC.',
      '**Yes**: recibe IP pública. Necesita que la VPC tenga Internet Gateway, y aun así el grupo de seguridad decide quién entra.'
    ]
  },
  'rds-grupo-seguridad': {
    titulo: 'Grupo de seguridad de la base',
    texto: [
      'Es el firewall de la base. La regla correcta es **TCP 3306 (o 5432) con origen en el grupo de seguridad de tu servidor web** (`sg-…`), no `0.0.0.0/0`.',
      '«Create new» crea un grupo que deja entrar el puerto solo desde tu IP de casa.'
    ]
  },
  'rds-respaldo': {
    titulo: 'Respaldos automáticos',
    texto: [
      'RDS respalda tu base cada día y guarda los registros de cambios: puedes **restaurar a cualquier momento** dentro del periodo de retención (de **1 a 35 días**).',
      'Con **0 días** se apagan los respaldos: ya no hay restauración a un punto en el tiempo y **no se pueden crear réplicas de lectura**.',
      'Los **snapshots manuales** (Take snapshot) se quedan hasta que tú los borres, aunque borres la base.'
    ]
  },
  'rds-cifrado': {
    titulo: 'Cifrado',
    texto: ['Con **Enable encryption**, RDS cifra el disco, los respaldos y los snapshots con una llave de **KMS**: `aws/rds` (la que AWS administra) o una llave tuya (*customer managed*), que eliges en **AWS KMS key**. Solo se elige al crear la base; un snapshot cifrado no se puede hacer público.']
  },
  'rds-proteccion': {
    titulo: 'Deletion protection',
    texto: ['Mientras esté activa, **nadie puede borrar la base** (ni por error). Para borrarla primero haz Modify y desactívala.']
  },
  'rds-replica': {
    titulo: 'Réplica de lectura',
    texto: [
      'Una **read replica** es una copia de solo lectura que se actualiza de forma **asíncrona** (con un pequeño retraso).',
      'Tu aplicación manda las lecturas a la réplica y las escrituras a la principal: así reparte la carga.',
      'Requisito: la base origen debe tener **respaldos automáticos** (retención mayor que 0).',
      '**Promote** convierte la réplica en una base independiente.'
    ]
  },
  'rds-snapshot': {
    titulo: 'Snapshots de RDS',
    texto: [
      'Un **snapshot** es una foto completa de la base. Los **manuales** los tomas tú y duran hasta que los borres; los **automáticos** (System) los hace RDS cada día y se borran al pasar la retención.',
      'Para recuperar datos se usa **Restore snapshot**: crea una base **nueva**; no sobrescribe la actual.',
      'Un snapshot **público** lo puede copiar cualquier cuenta de AWS: casi nunca es buena idea.'
    ]
  },
  'rds-pitr': {
    titulo: 'Restore to point in time',
    texto: [
      'Crea una **base nueva** con los datos que tenía la original en el momento que elijas (por ejemplo, un minuto antes de que alguien borró una tabla).',
      'Solo funciona dentro del periodo de retención de los respaldos automáticos. «Latest restorable time» suele ser hace unos 5 minutos.'
    ]
  },
  'rds-failover': {
    titulo: 'Reboot with failover',
    texto: [
      'En una base **Multi-AZ**, reiniciar **con failover** hace que la standby de la otra zona se vuelva la principal. Así puedes probar qué pasa si se cae una zona.',
      'Mira la columna **Region & AZ** antes y después: la zona principal y la secundaria se intercambian. El endpoint no cambia.'
    ]
  },
  'rds-modificar': {
    titulo: 'Modify y cuándo se aplica',
    texto: [
      '**Apply immediately**: el cambio empieza ya (la base pasa por *Modifying*).',
      '**Apply during the next scheduled maintenance window**: el cambio queda pendiente hasta la ventana de mantenimiento (en el simulador puedes adelantarlo con **Apply now** en Configuration).',
      'La protección contra borrado, la retención de respaldos y los grupos de seguridad se aplican siempre de inmediato.'
    ]
  },
  'rds-endpoint': {
    titulo: 'Endpoint',
    texto: [
      'El **endpoint** es el nombre DNS con el que tu aplicación se conecta a la base: `mi-base.xxxx.us-east-1.rds.amazonaws.com` más el puerto.',
      'Usa siempre el endpoint, no una IP: en un failover la IP cambia, el endpoint no.',
      'Los clústeres tienen un endpoint de escritura (cluster) y uno de lectura (cluster-ro).'
    ]
  },
  'rds-aurora': {
    titulo: 'Amazon Aurora',
    texto: [
      'Aurora separa el cómputo del almacenamiento: las instancias (una escritora y hasta 15 lectoras) comparten un volumen que guarda **6 copias en 3 zonas** y crece solo.',
      '**Add reader** agrega una lectora; **Failover** vuelve escritora a una lectora.'
    ]
  },
  'rds-expres': {
    titulo: 'Express configuration',
    texto: ['Crea en segundos un clúster **Aurora PostgreSQL Serverless** con valores fijos. Se conecta por un *internet access gateway* con autenticación de IAM, así que no hace falta armar la red: ideal para probar.']
  },
  'rds-eventos': {
    titulo: 'Eventos de RDS',
    texto: ['Aquí RDS anota lo que les pasa a tus bases: creada, respaldada, reiniciada, failover, detenida… Sirve para saber qué ocurrió y cuándo.']
  }
};

/* ================================================================ registro */

const des = (texto) => ({ texto, desactivado: true });

export default {
  id: 'rds',
  nombre: 'Aurora and RDS',
  titulo: 'Aurora and RDS',
  descripcion: 'Managed Relational Database Service',
  categoria: 'bases',
  claves: 'rds database mysql postgresql mariadb aurora base de datos relacional sql',
  inicio: 'rds',
  menu: [
    { texto: 'Dashboard', ruta: 'rds' },
    { texto: 'Databases', ruta: 'rds/bases' },
    des('Query editor'),
    des('Performance insights'),
    { texto: 'Snapshots', ruta: 'rds/snapshots' },
    des('Exports in Amazon S3'),
    { texto: 'Automated backups', ruta: 'rds/respaldos' },
    des('Reserved instances'),
    des('Proxies'),
    { texto: 'Subnet groups', ruta: 'rds/grupos-subredes' },
    des('Parameter groups'),
    des('Option groups'),
    des('Custom engine versions'),
    des('Zero-ETL integrations'),
    { texto: 'Events', ruta: 'rds/eventos' },
    des('Event subscriptions'),
    des('Recommendations'),
    des('Certificate update')
  ],
  rutas: {
    '': panel,
    bases: listaBases,
    'bases/crear': crearBase,
    'bases/:id': detalleBase,
    'bases/:id/modificar': modificarBase,
    'bases/:id/replica': crearReplica,
    'bases/:id/snapshot': tomarSnapshot,
    'bases/:id/restaurar': restaurarPunto,
    'bases/:id/lector': agregarLector,
    'clusteres/:id': detalleCluster,
    'clusteres/:id/modificar': modificarCluster,
    'clusteres/:id/lector': agregarLector,
    snapshots: listaSnapshots,
    'snapshots/tomar': (cx) => tomarSnapshot(cx, { id: null }),
    'snapshots/:id': detalleSnapshot,
    'snapshots/:id/restaurar': restaurarSnapshot,
    respaldos,
    'grupos-subredes': listaGrupos,
    'grupos-subredes/crear': crearGrupo,
    'grupos-subredes/:nombre': detalleGrupo,
    'grupos-subredes/:nombre/editar': editarGrupo,
    eventos,
    'no-disponible/:que': noDisponible
  },
  busqueda: [
    { texto: 'Databases', ruta: 'rds/bases', claves: 'rds bases mysql postgres' },
    { texto: 'Create database', ruta: 'rds/bases/crear', claves: 'rds nueva base' },
    { texto: 'Snapshots', ruta: 'rds/snapshots', claves: 'rds backup respaldo' },
    { texto: 'Automated backups', ruta: 'rds/respaldos', claves: 'rds point in time' },
    { texto: 'Subnet groups', ruta: 'rds/grupos-subredes', claves: 'rds db subnet group' },
    { texto: 'Events', ruta: 'rds/eventos', claves: 'rds' }
  ],
  ayudas
};

// Para servicios vecinos (ElastiCache) que pintan los estados igual.
export { motorTexto };
