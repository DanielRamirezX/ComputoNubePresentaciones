// ---------------------------------------------------------------------------
// EC2 · ELASTIC BLOCK STORE
//
// Volumes (crear, adjuntar a una instancia de la MISMA zona, desconectar,
// borrar) y Snapshots (crear desde un volumen, con su progreso; crear un
// volumen a partir de un snapshot; borrar).
// ---------------------------------------------------------------------------

import * as ui from '../ui.js';
import { adjuntarVolumen, crearSnapshot, crearVolumen, desadjuntarVolumen, eliminarSnapshot, eliminarVolumen, TIPOS_VOLUMEN, tipoVolumen } from '../modelo.js';
import { enlaceRecurso, idParentesis, nombre, noExiste, opcionesZona, panelVacio, pestanaEtiquetas } from './comun.js';

const { h } = ui;

/* ================================================================ volúmenes */

const volDe = (cx, id) => cx.estado.volumenes.find((v) => v.id === id);

function estadoVolumen(v) {
  if (v.estado === 'creating') return ui.estado('pendiente', 'Creating');
  if (v.estado === 'available') return ui.estado('exito', 'Available');
  if (v.estado === 'in-use') return ui.estado('info', 'In-use');
  if (v.estado === 'deleting') return ui.estado('pendiente', 'Deleting');
  return ui.estado('info', v.estado);
}

const rendimiento = (v) => (v.tipo === 'gp3' ? '125' : '–');

function adjunto(cx, v) {
  if (!v.instanciaId) return '–';
  const i = cx.estado.instancias.find((x) => x.id === v.instanciaId);
  return h('span', {}, enlaceRecurso(cx, v.instanciaId, { texto: `${v.instanciaId}${i?.nombre ? ` (${i.nombre})` : ''}` }), `: ${v.dispositivo} (attached)`);
}

function confirmarDesconectar(cx, vols) {
  cx.confirmar({
    titulo: 'Detach volume',
    textoBoton: 'Detach',
    contenido: [h('p', {}, 'Are you sure that you want to detach the following volume?'), h('ul', {}, vols.map((v) => h('li', {}, idParentesis(v))))],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'EC2', accion: 'DetachVolume', error: 'Failed to detach volume' }, (e) => vols.forEach((v) => desadjuntarVolumen(e, v.id)), { atomico: true });
      if (r.ok) cx.flash({ tipo: 'exito', texto: `Successfully detached volume ${vols.map((v) => v.id).join(', ')}` });
    }
  });
}

function confirmarBorrarVolumen(cx, vols, alTerminar) {
  cx.confirmar({
    titulo: 'Delete volume',
    textoBoton: 'Delete',
    palabra: 'delete',
    contenido: [
      h('p', {}, `Are you sure that you want to delete the following volume${vols.length > 1 ? 's' : ''}?`),
      h('ul', {}, vols.map((v) => h('li', {}, idParentesis(v)))),
      ui.alerta({ tipo: 'aviso', contenido: 'Deleting a volume permanently deletes all of its data. This action can’t be undone.' })
    ],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'EC2', accion: 'DeleteVolume', error: 'Failed to delete volume' }, (e) => vols.forEach((v) => eliminarVolumen(e, v.id)), { atomico: true });
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: `Successfully deleted volume ${vols.map((v) => v.id).join(', ')}` });
        alTerminar?.();
      }
    }
  });
}

function accionesVolumen(cx, sel, alBorrar) {
  const uno = sel.length === 1 ? sel[0] : null;
  return [
    { texto: 'Modify volume', desactivado: true },
    { texto: 'Create snapshot', escribe: true, desactivado: !uno, alClic: () => cx.ir(`ec2/snapshots/crear/${uno.id}`) },
    { texto: 'Create snapshot lifecycle policy', desactivado: true },
    { texto: 'Delete volume', escribe: true, desactivado: !sel.length, alClic: () => confirmarBorrarVolumen(cx, sel, alBorrar) },
    '-',
    { texto: 'Attach volume', escribe: true, desactivado: !uno || uno.estado !== 'available', alClic: () => cx.ir(`ec2/volumenes/${uno.id}/adjuntar`) },
    { texto: 'Detach volume', escribe: true, desactivado: !sel.length || sel.some((v) => v.estado !== 'in-use'), alClic: () => confirmarDesconectar(cx, sel) },
    { texto: 'Force detach volume', desactivado: true },
    { texto: 'Manage auto-enabled I/O', desactivado: true },
    { texto: 'Manage tags', escribe: true, desactivado: !uno, alClic: () => cx.ir(`ec2/etiquetas/${uno.id}`) }
  ];
}

function paresVolumen(cx, v) {
  return ui.pares(
    [
      { etiqueta: 'Volume ID', valor: ui.copiable(v.id) },
      { etiqueta: 'Size', valor: `${v.tamano} GiB` },
      { etiqueta: 'Type', valor: v.tipo },
      { etiqueta: 'Volume status', valor: v.estado === 'creating' ? '–' : ui.estado('exito', 'Okay') },
      { etiqueta: 'Volume state', valor: estadoVolumen(v) },
      { etiqueta: 'IOPS', valor: v.iops ?? '–' },
      { etiqueta: 'Throughput', valor: rendimiento(v) },
      { etiqueta: 'Encryption', valor: v.cifrado ? 'Encrypted' : 'Not encrypted' },
      { etiqueta: 'Snapshot', valor: v.snapshotId ? (v.snapshotId.startsWith('snap-') && cx.estado.snapshots.some((s) => s.id === v.snapshotId) ? enlaceRecurso(cx, v.snapshotId) : v.snapshotId) : '–' },
      { etiqueta: 'Availability Zone', valor: v.az },
      { etiqueta: 'Created', valor: ui.fechaLarga(v.creado) },
      { etiqueta: 'Multi-Attach enabled', valor: 'No' },
      { etiqueta: 'Attached resources', valor: adjunto(cx, v) },
      { etiqueta: 'Delete on termination', valor: v.instanciaId ? (v.eliminarAlTerminar ? 'Yes' : 'No') : '–' }
    ],
    { columnas: 4, cx }
  );
}

function listaVolumenes(cx) {
  cx.migas([{ texto: 'EC2', ruta: 'ec2' }, { texto: 'Volumes' }]);
  const st = { pestana: 'detalles' };
  const t = ui.tabla(cx, {
    titulo: 'Volumes',
    info: 'volumen',
    filas: () => cx.estado.volumenes,
    clave: (v) => v.id,
    seleccion: 'multiple',
    filtro: 'Search',
    ultimaActualizacion: true,
    columnas: [
      { titulo: 'Name', valor: (v) => nombre(v), editable: true },
      { titulo: 'Volume ID', valor: (v) => ui.enlace(v.id, `ec2/volumenes/${v.id}`, { cx }) },
      { titulo: 'Type', valor: (v) => v.tipo },
      { titulo: 'Size', valor: (v) => `${v.tamano} GiB` },
      { titulo: 'IOPS', valor: (v) => String(v.iops ?? '–') },
      { titulo: 'Throughput', valor: rendimiento },
      { titulo: 'Snapshot ID', valor: (v) => v.snapshotId ?? '–' },
      { titulo: 'Created', valor: (v) => ui.fecha(v.creado) },
      { titulo: 'Availability Zone', valor: (v) => v.az },
      { titulo: 'Volume state', valor: estadoVolumen },
      { titulo: 'Attached resources', valor: (v) => adjunto(cx, v) },
      { titulo: 'Encryption', valor: (v) => (v.cifrado ? 'Encrypted' : 'Not encrypted') }
    ],
    acciones: (sel) => [
      ui.menuBoton('Actions', () => accionesVolumen(cx, sel, () => t.seleccionar([]))),
      ui.boton('Create volume', { variante: 'primario', alClic: () => cx.ir('ec2/volumenes/crear') })
    ],
    vacio: { titulo: 'No volumes', texto: 'You currently have no volumes in this region' },
    alSeleccionar: () => panel.repintar()
  });
  const panel = cx.vivo(() => {
    const sel = t.seleccion();
    if (sel.length !== 1) return panelVacio(sel.length ? `${sel.length} volumes selected` : 'Select a volume above');
    const v = sel[0];
    return ui.panelInferior({
      titulo: `Volume ID: ${v.id}${v.nombre ? ` (${v.nombre})` : ''}`,
      contenido: ui.pestanas({
        activa: st.pestana,
        alCambiar: (p) => (st.pestana = p),
        pestanas: [
          { id: 'detalles', texto: 'Details', contenido: () => ui.contenedor({ titulo: 'Details', cuerpo: paresVolumen(cx, v) }) },
          { id: 'chequeos', texto: 'Status checks', desactivada: true, contenido: () => null },
          { id: 'monitoreo', texto: 'Monitoring', desactivada: true, contenido: () => null },
          { id: 'etiquetas', texto: 'Tags', contenido: () => pestanaEtiquetas(cx, v) }
        ]
      })
    });
  });
  return h('div', { class: 'cx-pagina' }, t, panel);
}

function detalleVolumen(cx, { id }) {
  cx.migas([{ texto: 'EC2', ruta: 'ec2' }, { texto: 'Volumes', ruta: 'ec2/volumenes' }, { texto: id }]);
  if (!volDe(cx, id)) return noExiste(cx, 'Volume', id, 'ec2/volumenes');
  return cx.vivo(() => {
    const v = volDe(cx, id);
    if (!v) return noExiste(cx, 'Volume', id, 'ec2/volumenes');
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({ titulo: `${v.id}${v.nombre ? ` (${v.nombre})` : ''}`, acciones: ui.menuBoton('Actions', () => accionesVolumen(cx, [v], () => cx.ir('ec2/volumenes'))) }),
      ui.contenedor({ titulo: 'Details', cuerpo: paresVolumen(cx, v) }),
      pestanaEtiquetas(cx, v)
    );
  });
}

function crearVolumenPagina(cx, { snap } = {}) {
  cx.migas([{ texto: 'EC2', ruta: 'ec2' }, { texto: 'Volumes', ruta: 'ec2/volumenes' }, { texto: 'Create volume' }]);
  const desdeSnap = snap ? cx.estado.snapshots.find((s) => s.id === snap) : null;
  const f = { tipo: 'gp3', tamano: desdeSnap ? String(desdeSnap.tamano) : '100', iops: '3000', rendimiento: '125', az: 'us-east-1a', snapshotId: desdeSnap?.id ?? null, cifrado: Boolean(desdeSnap?.cifrado), etiquetas: [], error: null };
  const form = ui.region(() => {
    const t = tipoVolumen(f.tipo);
    const conIops = ['gp3', 'io1', 'io2'].includes(f.tipo);
    const snaps = cx.estado.snapshots.filter((s) => s.estado === 'completed');
    return h(
      'div',
      { class: 'cx-form', style: { maxWidth: '640px' } },
      ui.campo({
        etiqueta: 'Volume type',
        info: 'volumen',
        cx,
        control: ui.selector({
          opciones: TIPOS_VOLUMEN.map((x) => ({ valor: x.tipo, etiqueta: x.nombre })),
          valor: f.tipo,
          alCambiar: (v) => {
            f.tipo = v;
            f.iops = String(tipoVolumen(v).iops ?? '');
            form.repintar();
          }
        })
      }),
      ui.campo({
        etiqueta: 'Size (GiB)',
        info: 'volumen',
        cx,
        control: ui.entrada({ tipo: 'number', valor: f.tamano, alCambiar: (v) => (f.tamano = v) }),
        error: f.error,
        restriccion: `Min: ${t.min} GiB, Max: ${t.max} GiB.`
      }),
      ui.campo({
        etiqueta: 'IOPS',
        control: ui.entrada({ tipo: conIops ? 'number' : 'text', valor: conIops ? f.iops : 'Not applicable', desactivado: !conIops, alCambiar: (v) => (f.iops = v) }),
        restriccion: f.tipo === 'gp3' ? 'Min: 3000 IOPS, Max: 16000 IOPS.' : conIops ? 'Min: 100 IOPS, Max: 64000 IOPS.' : null
      }),
      ui.campo({
        etiqueta: 'Throughput (MiB/s)',
        control: ui.entrada({ tipo: f.tipo === 'gp3' ? 'number' : 'text', valor: f.tipo === 'gp3' ? f.rendimiento : 'Not applicable', desactivado: f.tipo !== 'gp3', alCambiar: (v) => (f.rendimiento = v) }),
        restriccion: f.tipo === 'gp3' ? 'Min: 125 MiB/s, Max: 1000 MiB/s. Baseline: 125 MiB/s.' : null
      }),
      ui.campo({
        etiqueta: 'Availability Zone',
        info: 'zona',
        cx,
        control: ui.selector({ opciones: opcionesZona(), valor: f.az, alCambiar: (v) => (f.az = v) }),
        restriccion: 'The volume can only be attached to instances in this Availability Zone.'
      }),
      ui.campo({
        etiqueta: 'Snapshot ID',
        opcional: true,
        info: 'snapshot',
        cx,
        control: ui.selector({
          opciones: [{ valor: '', etiqueta: 'Don’t create volume from a snapshot' }, ...snaps.map((s) => ({ valor: s.id, etiqueta: s.id, descripcion: `${s.nombre ? `${s.nombre} · ` : ''}${s.descripcion || 'No description'} · ${s.tamano} GiB` }))],
          valor: f.snapshotId ?? '',
          filtrar: true,
          alCambiar: (v) => {
            f.snapshotId = v || null;
            const s = snaps.find((x) => x.id === v);
            if (s) {
              f.tamano = String(Math.max(Number(f.tamano) || 0, s.tamano));
              f.cifrado = s.cifrado;
            }
            form.repintar();
          }
        })
      }),
      ui.campo({
        etiqueta: 'Encryption',
        info: 'volumen',
        cx,
        descripcion: 'Use Amazon EBS encryption as an encryption solution for your EBS resources associated with your EC2 instances.',
        control: ui.casilla({ etiqueta: 'Encrypt this volume', marcada: f.cifrado, desactivado: Boolean(f.snapshotId && cx.estado.snapshots.find((s) => s.id === f.snapshotId)?.cifrado), alCambiar: (v) => (f.cifrado = v) })
      })
    );
  });
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Create volume', info: 'volumen', cx, descripcion: 'Create an Amazon EBS volume to attach to any EC2 instance in the same Availability Zone.' }),
    ui.contenedor({ titulo: 'Volume settings', cuerpo: form }),
    ui.contenedor({ titulo: 'Tags - optional', cuerpo: ui.editorEtiquetas({ filas: f.etiquetas }) }),
    ui.pieFormulario({
      cancelar: () => cx.ir('ec2/volumenes'),
      textoEnviar: 'Create volume',
      enviar: () => {
        f.error = String(f.tamano).trim() ? null : 'Size is required';
        if (f.error) return form.repintar();
        const r = cx.hacer({ servicio: 'EC2', accion: 'CreateVolume', error: 'Failed to create volume' }, (e) =>
          crearVolumen(e, {
            nombre: ui.nombreDeEtiquetas(f.etiquetas),
            tipo: f.tipo,
            tamano: Number(f.tamano),
            az: f.az,
            snapshotId: f.snapshotId,
            cifrado: f.cifrado,
            iops: ['gp3', 'io1', 'io2'].includes(f.tipo) ? Number(f.iops) || undefined : undefined
          })
        );
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: ['Successfully created volume ', ui.enlace(r.valor.id, `ec2/volumenes/${r.valor.id}`, { cx }), '.'] });
          cx.ir('ec2/volumenes');
        }
      }
    })
  );
}

function adjuntarPagina(cx, { id }) {
  cx.migas([{ texto: 'EC2', ruta: 'ec2' }, { texto: 'Volumes', ruta: 'ec2/volumenes' }, { texto: id, ruta: `ec2/volumenes/${id}` }, { texto: 'Attach volume' }]);
  const v = volDe(cx, id);
  if (!v) return noExiste(cx, 'Volume', id, 'ec2/volumenes');
  const f = { instanciaId: null, dispositivo: '/dev/sdf', error: null };
  const form = ui.region(() => {
    // Igual que la consola real: solo se ofrecen instancias de la misma zona.
    const mismas = cx.estado.instancias.filter((i) => i.az === v.az && (i.estado === 'running' || i.estado === 'stopped'));
    return h(
      'div',
      { class: 'cx-form', style: { maxWidth: '640px' } },
      ui.campo({ etiqueta: 'Volume ID', control: ui.entrada({ valor: idParentesis(v), desactivado: true }) }),
      ui.campo({ etiqueta: 'Availability Zone', control: ui.entrada({ valor: v.az, desactivado: true }) }),
      ui.campo({
        etiqueta: 'Instance',
        info: 'zona',
        cx,
        control: ui.selector({
          opciones: mismas.map((i) => ({ valor: i.id, etiqueta: i.id, descripcion: `${i.nombre ? `${i.nombre} · ` : ''}(${i.estado})` })),
          valor: f.instanciaId,
          filtrar: true,
          placeholder: 'Select an instance',
          vacio: `No instances found in ${v.az}. A volume can only be attached to an instance in its same Availability Zone.`,
          opcionLibre: (t) => (/^i-[0-9a-f]{17}$/.test(t) ? { valor: t, etiqueta: t } : null),
          mostrarLibre: (x) => ({ valor: x, etiqueta: x }),
          alCambiar: (x) => {
            f.instanciaId = x;
            f.error = null;
          }
        }),
        error: f.error,
        restriccion: `Only instances in the same Availability Zone as the selected volume are displayed.`
      }),
      ui.campo({
        etiqueta: 'Device name',
        info: 'volumen',
        cx,
        control: ui.entrada({ valor: f.dispositivo, alCambiar: (x) => (f.dispositivo = x) }),
        restriccion: 'Recommended for data volumes: /dev/sd[f-p]'
      }),
      ui.alerta({ tipo: 'info', contenido: 'Newer Linux kernels may rename your devices to /dev/xvdf through /dev/xvdp internally, even when the device name entered here (and shown in the details) is /dev/sdf through /dev/sdp.' })
    );
  });
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Attach volume', info: 'volumen', cx, descripcion: 'Attach a volume to an instance to use it as you would a regular physical hard disk drive.' }),
    ui.contenedor({ titulo: 'Basic details', cuerpo: form }),
    ui.pieFormulario({
      cancelar: () => cx.ir('ec2/volumenes'),
      textoEnviar: 'Attach volume',
      enviar: () => {
        if (!f.instanciaId) {
          f.error = 'Instance is required';
          return form.repintar();
        }
        const r = cx.hacer({ servicio: 'EC2', accion: 'AttachVolume', error: 'Failed to attach volume' }, (e) => adjuntarVolumen(e, id, f.instanciaId, f.dispositivo.trim() || '/dev/sdf'));
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: `Successfully attached volume ${id} to instance ${f.instanciaId}` });
          cx.ir('ec2/volumenes');
        }
      }
    })
  );
}

export const rutasVolumenes = {
  volumenes: listaVolumenes,
  'volumenes/crear': crearVolumenPagina,
  'volumenes/crear/:snap': crearVolumenPagina,
  'volumenes/:id': detalleVolumen,
  'volumenes/:id/adjuntar': adjuntarPagina
};

/* ================================================================ snapshots */

const snapDe = (cx, id) => cx.estado.snapshots.find((s) => s.id === id);

function estadoSnapshot(s) {
  if (s.estado === 'pending') return ui.estado('pendiente', `Pending (${s.progreso ?? 0}%)`);
  if (s.estado === 'completed') return ui.estado('exito', 'Completed');
  if (s.estado === 'error') return ui.estado('error', 'Error');
  return ui.estado('info', s.estado);
}

const progreso = (s) => {
  const p = s.estado === 'completed' ? 100 : s.progreso ?? 0;
  return h('span', {}, `${p}%`, h('span', { class: 'cx-progreso', 'aria-hidden': 'true' }, h('span', { style: { width: `${p}%` } })));
};

function accionesSnapshot(cx, sel, alBorrar) {
  const uno = sel.length === 1 ? sel[0] : null;
  return [
    { texto: 'Create volume from snapshot', escribe: true, desactivado: !uno || uno.estado !== 'completed', alClic: () => cx.ir(`ec2/volumenes/crear/${uno.id}`) },
    { texto: 'Create image from snapshot', desactivado: true },
    { texto: 'Copy snapshot', desactivado: true },
    { texto: 'Modify permissions', desactivado: true },
    { texto: 'Manage tags', escribe: true, desactivado: !uno, alClic: () => cx.ir(`ec2/etiquetas/${uno.id}`) },
    '-',
    {
      texto: 'Delete snapshot',
      escribe: true,
      desactivado: !sel.length,
      alClic: () =>
        cx.confirmar({
          titulo: 'Delete snapshots',
          textoBoton: 'Delete',
          palabra: 'delete',
          contenido: [h('p', {}, 'Are you sure that you want to delete the following snapshots?'), h('ul', {}, sel.map((s) => h('li', {}, idParentesis(s))))],
          aceptar: () => {
            const r = cx.hacer({ servicio: 'EC2', accion: 'DeleteSnapshot', error: 'Failed to delete snapshots' }, (e) => sel.forEach((s) => eliminarSnapshot(e, s.id)), { atomico: true });
            if (r.ok) {
              cx.flash({ tipo: 'exito', texto: `Successfully deleted snapshot ${sel.map((s) => s.id).join(', ')}` });
              alBorrar?.();
            }
          }
        })
    }
  ];
}

function paresSnapshot(cx, s) {
  return ui.pares(
    [
      { etiqueta: 'Snapshot ID', valor: ui.copiable(s.id) },
      { etiqueta: 'Owner', valor: cx.estado.cuenta.id },
      { etiqueta: 'Description', valor: s.descripcion || '–' },
      { etiqueta: 'Snapshot status', valor: estadoSnapshot(s) },
      { etiqueta: 'Progress', valor: progreso(s) },
      { etiqueta: 'Volume ID', valor: volDe(cx, s.volumenId) ? enlaceRecurso(cx, s.volumenId) : s.volumenId },
      { etiqueta: 'Volume size', valor: `${s.tamano} GiB` },
      { etiqueta: 'Started', valor: ui.fechaLarga(s.creado) },
      { etiqueta: 'Encryption', valor: s.cifrado ? 'Encrypted' : 'Not encrypted' },
      { etiqueta: 'Storage tier', valor: 'Standard' }
    ],
    { columnas: 4 }
  );
}

function listaSnapshots(cx) {
  cx.migas([{ texto: 'EC2', ruta: 'ec2' }, { texto: 'Snapshots' }]);
  const t = ui.tabla(cx, {
    titulo: 'Snapshots',
    info: 'snapshot',
    filas: () => cx.estado.snapshots,
    clave: (s) => s.id,
    seleccion: 'multiple',
    filtro: 'Search',
    ultimaActualizacion: true,
    antesDelFiltro: ui.selector({ opciones: [{ valor: 'mios', etiqueta: 'Owned by me' }], valor: 'mios', compacto: true, etiquetaAccesible: 'Snapshot scope' }),
    columnas: [
      { titulo: 'Name', valor: (s) => nombre(s), editable: true },
      { titulo: 'Snapshot ID', valor: (s) => ui.enlace(s.id, `ec2/snapshots/${s.id}`, { cx }) },
      { titulo: 'Full snapshot size', valor: (s) => (s.estado === 'completed' ? `${(s.tamano * 0.02).toFixed(2)} GiB` : '0 B') },
      { titulo: 'Volume size', valor: (s) => `${s.tamano} GiB` },
      { titulo: 'Description', valor: (s) => s.descripcion || '–' },
      { titulo: 'Storage tier', valor: () => 'Standard' },
      { titulo: 'Snapshot status', valor: estadoSnapshot },
      { titulo: 'Started', valor: (s) => ui.fecha(s.creado) },
      { titulo: 'Progress', valor: progreso },
      { titulo: 'Encryption', valor: (s) => (s.cifrado ? 'Encrypted' : 'Not encrypted') },
      { titulo: 'Volume ID', valor: (s) => s.volumenId }
    ],
    acciones: (sel) => [
      ui.boton('Recycle Bin', { icono: 'external', desactivado: true }),
      ui.menuBoton('Actions', () => accionesSnapshot(cx, sel, () => t.seleccionar([]))),
      ui.boton('Create snapshot', { variante: 'primario', alClic: () => cx.ir('ec2/snapshots/crear') })
    ],
    vacio: { titulo: 'No snapshots', texto: 'You don’t have any snapshots in this Region.', accion: ui.boton('Create snapshot', { escribe: true, alClic: () => cx.ir('ec2/snapshots/crear') }) },
    alSeleccionar: () => panel.repintar()
  });
  const panel = cx.vivo(() => {
    const sel = t.seleccion();
    if (sel.length !== 1) return panelVacio('Select a snapshot');
    return ui.panelInferior({ titulo: `Snapshot ID: ${sel[0].id}`, contenido: ui.pestanas({ pestanas: [{ id: 'd', texto: 'Details', contenido: () => ui.contenedor({ titulo: 'Details', cuerpo: paresSnapshot(cx, sel[0]) }) }, { id: 't', texto: 'Tags', contenido: () => pestanaEtiquetas(cx, sel[0]) }] }) });
  });
  return h('div', { class: 'cx-pagina' }, t, panel);
}

function detalleSnapshot(cx, { id }) {
  cx.migas([{ texto: 'EC2', ruta: 'ec2' }, { texto: 'Snapshots', ruta: 'ec2/snapshots' }, { texto: id }]);
  if (!snapDe(cx, id)) return noExiste(cx, 'Snapshot', id, 'ec2/snapshots');
  return cx.vivo(() => {
    const s = snapDe(cx, id);
    if (!s) return noExiste(cx, 'Snapshot', id, 'ec2/snapshots');
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({ titulo: `${s.id}${s.nombre ? ` (${s.nombre})` : ''}`, acciones: ui.menuBoton('Actions', () => accionesSnapshot(cx, [s], () => cx.ir('ec2/snapshots'))) }),
      ui.contenedor({ titulo: 'Snapshot details', cuerpo: paresSnapshot(cx, s) }),
      pestanaEtiquetas(cx, s)
    );
  });
}

function crearSnapshotPagina(cx, { vol } = {}) {
  cx.migas([{ texto: 'EC2', ruta: 'ec2' }, { texto: 'Snapshots', ruta: 'ec2/snapshots' }, { texto: 'Create snapshot' }]);
  const f = { volumenId: vol && volDe(cx, vol) ? vol : null, descripcion: '', etiquetas: [], error: null };
  const form = ui.region(() => {
    const v = volDe(cx, f.volumenId);
    return h(
      'div',
      { class: 'cx-form', style: { maxWidth: '640px' } },
      ui.campo({
        etiqueta: 'Resource type',
        info: 'snapshot',
        cx,
        control: ui.radios({ valor: 'volumen', opciones: [{ valor: 'volumen', etiqueta: 'Volume', descripcion: 'Create a snapshot of a single volume.' }, { valor: 'instancia', etiqueta: 'Instance', descripcion: 'Create multi-volume snapshots, one per volume attached to the instance.', desactivado: true }] })
      }),
      ui.campo({
        etiqueta: 'Volume ID',
        descripcion: 'The volume from which to create the snapshot.',
        control: ui.selector({
          opciones: cx.estado.volumenes.filter((x) => x.estado !== 'creating').map((x) => ({ valor: x.id, etiqueta: x.id, descripcion: `${x.nombre ? `${x.nombre} · ` : ''}${x.tamano} GiB · ${x.az} · ${x.estado}` })),
          valor: f.volumenId,
          filtrar: true,
          placeholder: 'Select a volume',
          vacio: 'No volumes',
          alCambiar: (x) => {
            f.volumenId = x;
            f.error = null;
            form.repintar();
          }
        }),
        error: f.error
      }),
      ui.campo({
        etiqueta: 'Description',
        opcional: true,
        descripcion: 'Add a description for your snapshot.',
        control: ui.entrada({ valor: f.descripcion, placeholder: 'Snapshot description', alCambiar: (x) => (f.descripcion = x) }),
        restriccion: 'Up to 255 characters.'
      }),
      ui.campo({ etiqueta: 'Encryption', control: h('div', {}, v ? (v.cifrado ? 'Encrypted' : 'Not encrypted') : '–') })
    );
  });
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Create snapshot', info: 'snapshot', cx, descripcion: 'Create a point-in-time snapshot to back up the data on an Amazon EBS volume to Amazon S3.' }),
    ui.contenedor({ titulo: 'Details', cuerpo: form }),
    ui.contenedor({ titulo: 'Tags', cuerpo: ui.editorEtiquetas({ filas: f.etiquetas }) }),
    ui.pieFormulario({
      cancelar: () => cx.ir('ec2/snapshots'),
      textoEnviar: 'Create snapshot',
      enviar: () => {
        if (!f.volumenId) {
          f.error = 'Volume ID is required';
          return form.repintar();
        }
        const r = cx.hacer({ servicio: 'EC2', accion: 'CreateSnapshot', error: 'Failed to create snapshot' }, (e) =>
          crearSnapshot(e, { volumenId: f.volumenId, descripcion: f.descripcion, nombre: ui.nombreDeEtiquetas(f.etiquetas) })
        );
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: ['Successfully created snapshot ', ui.enlace(r.valor.id, `ec2/snapshots/${r.valor.id}`, { cx }), ` from volume ${f.volumenId}.`] });
          cx.ir('ec2/snapshots');
        }
      }
    })
  );
}

export const rutasSnapshots = {
  snapshots: listaSnapshots,
  'snapshots/crear': crearSnapshotPagina,
  'snapshots/crear/:vol': crearSnapshotPagina,
  'snapshots/:id': detalleSnapshot
};
