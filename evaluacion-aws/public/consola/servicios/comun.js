// ---------------------------------------------------------------------------
// PIEZAS QUE COMPARTEN EC2 Y VPC
//
// Nombres e ids «como en la consola», opciones de los selectores de VPC y
// subred, el estado de una instancia con su ícono, el editor de reglas de los
// grupos de seguridad (Type / Protocol / Port range / Source…), la pestaña
// Tags y la página «Manage tags».
// ---------------------------------------------------------------------------

import * as ui from '../ui.js';
import {
  editarIgw,
  editarInstancia,
  editarNacl,
  editarSnapshot,
  editarSubred,
  editarTablaRutas,
  editarVolumen,
  editarVpc,
  ipsDisponibles,
  parsearCidr,
  ID_ZONA,
  REGION,
  TIPOS_REGLA,
  tipoDeRegla,
  textoPuertos,
  textoProtocolo
} from '../modelo.js';

const { h } = ui;

/* ================================================================ nombres */

export const nombre = (r) => (r?.nombre ? r.nombre : '–');

/** «vpc-0abc… | cafe-vpc» o solo el id. */
export const idBarraNombre = (r) => (r ? (r.nombre ? `${r.id} | ${r.nombre}` : r.id) : '–');

/** «vpc-0abc… (cafe-vpc)», como en los selectores. */
export const idParentesis = (r) => (r ? (r.nombre ? `${r.id} (${r.nombre})` : r.id) : '–');

/** Busca cualquier recurso de red o EC2 por su id. */
export function recursoPorId(estado, id) {
  const listas = [estado.vpcs, estado.subredes, estado.tablasRutas, estado.igws, estado.nats, estado.eips, estado.nacls, estado.gruposSeguridad, estado.instancias, estado.volumenes, estado.snapshots, estado.llaves];
  for (const l of listas) {
    const r = l.find((x) => x.id === id);
    if (r) return r;
  }
  return null;
}

/** El enlace al recurso según su prefijo (vpc-, subnet-, sg-…). */
export function rutaDe(id, servicio = 'vpc') {
  const p = String(id ?? '');
  if (p.startsWith('vpc-')) return `vpc/vpcs/${p}`;
  if (p.startsWith('subnet-')) return `vpc/subredes/${p}`;
  if (p.startsWith('rtb-')) return `vpc/tablas/${p}`;
  if (p.startsWith('igw-')) return `vpc/igws/${p}`;
  if (p.startsWith('nat-')) return `vpc/nats/${p}`;
  if (p.startsWith('acl-')) return `vpc/nacls/${p}`;
  if (p.startsWith('sg-')) return `${servicio === 'vpc' ? 'vpc' : 'ec2'}/grupos/${p}`;
  if (p.startsWith('i-')) return `ec2/instancias/${p}`;
  if (p.startsWith('vol-')) return `ec2/volumenes/${p}`;
  if (p.startsWith('snap-')) return `ec2/snapshots/${p}`;
  if (p.startsWith('eipalloc-')) return `${servicio === 'vpc' ? 'vpc' : 'ec2'}/eips/${p}`;
  return null;
}

/** Enlace azul a un recurso: «subnet-0abc…» (o con su nombre). */
export function enlaceRecurso(cx, id, { conNombre = false, texto } = {}) {
  if (!id) return '–';
  const r = recursoPorId(cx.estado, id);
  const ruta = rutaDe(id, cx.servicio);
  const t = texto ?? (conNombre && r ? idBarraNombre(r) : id);
  return ruta && r ? ui.enlace(t, ruta, { cx }) : t;
}

/* ================================================================ opciones */

export const opcionVpc = (v) => ({
  valor: v.id,
  etiqueta: idParentesis(v),
  descripcion: v.cidr,
  etiquetas: v.porDefecto ? ['Default VPC'] : []
});

export const opcionesVpc = (estado) => estado.vpcs.map(opcionVpc);

export const zonaTexto = (az) => `${az} (${ID_ZONA[az] ?? ''})`;

/** IPs libres de una subred: las útiles menos las que ya usan instancias y NAT. */
export function ipsLibres(estado, subred) {
  const usadas =
    estado.instancias.filter((i) => i.subredId === subred.id && i.estado !== 'terminated').length +
    estado.nats.filter((n) => n.subredId === subred.id && n.estado !== 'deleted' && n.estado !== 'failed').length;
  return Math.max(0, ipsDisponibles(subred.cidr) - usadas);
}

export const opcionSubred = (estado, s) => ({
  valor: s.id,
  etiqueta: idParentesis(s),
  descripcion: `VPC: ${s.vpcId}  Owner: ${estado.cuenta.id}  Availability Zone: ${s.az}  Zone type: Availability Zone  IP addresses available: ${ipsLibres(estado, s)}  CIDR: ${s.cidr}`
});

export const opcionesZona = () =>
  ['us-east-1a', 'us-east-1b', 'us-east-1c', 'us-east-1d', 'us-east-1e', 'us-east-1f'].map((az) => ({
    valor: az,
    etiqueta: `${ID_ZONA[az]} (${az})`
  }));

export const regionTexto = () => `${REGION.nombre.replace(' (', ' (')} ${REGION.codigo}`;

/* ============================================================ instancias */

const ESTADOS_INSTANCIA = {
  pending: ['pendiente', 'Pending'],
  running: ['exito', 'Running'],
  stopping: ['pendiente', 'Stopping'],
  stopped: ['detenido', 'Stopped'],
  'shutting-down': ['pendiente', 'Shutting-down'],
  terminated: ['inactivo', 'Terminated']
};

export function estadoInstancia(inst) {
  const [tipo, texto] = ESTADOS_INSTANCIA[inst.estado] ?? ['info', inst.estado];
  return ui.estado(tipo, texto);
}

// La consola tarda un poco en pasar los chequeos después de arrancar.
const SEGUNDOS_CHEQUEO = 15;

export function chequeosListos(inst, ahora = Date.now()) {
  return inst.estado === 'running' && ahora - (inst.desde ?? 0) >= SEGUNDOS_CHEQUEO * 1000;
}

export function chequeoInstancia(inst) {
  if (inst.estado !== 'running') return '–';
  return chequeosListos(inst) ? ui.estado('exito', '2/2 checks passed') : ui.estado('espera', 'Initializing');
}

/* ======================================================= reglas de SG */

const TIPO_POR_NOMBRE = new Map(TIPOS_REGLA.map((t) => [t.tipo, t]));

/** Regla del modelo → fila del editor. */
export function filaDeRegla(r, ipCasa) {
  const tipo = tipoDeRegla(r);
  const t = TIPO_POR_NOMBRE.get(tipo);
  const origenTipo = r.origen === '0.0.0.0/0' ? 'anywhere' : r.origen === `${ipCasa}/32` ? 'myip' : 'custom';
  return {
    id: r.id,
    tipo,
    puertos: t?.rango ? (r.desde === r.hasta ? String(r.desde) : `${r.desde}-${r.hasta}`) : '',
    origenTipo,
    origen: r.origen,
    descripcion: r.descripcion ?? ''
  };
}

/** Fila del editor → regla para modelo.js. Lo que no se entienda se pasa tal cual para que AWS se queje. */
export function reglaDeFila(f) {
  const t = TIPO_POR_NOMBRE.get(f.tipo) ?? TIPOS_REGLA[0];
  let desde = t.desde;
  let hasta = t.hasta;
  if (t.rango) {
    const m = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(f.puertos ?? '');
    if (m) {
      desde = Number(m[1]);
      hasta = m[2] !== undefined ? Number(m[2]) : desde;
    } else {
      desde = f.puertos?.trim() || '';
      hasta = desde;
    }
  }
  return { id: f.id, protocolo: t.protocolo, desde, hasta, origen: String(f.origen ?? '').trim(), descripcion: f.descripcion ?? '' };
}

export const reglaNueva = (tipo = 'Custom TCP', origenTipo = 'custom', origen = '') => ({ tipo, puertos: '', origenTipo, origen, descripcion: '' });

/** ¿Alguna fila abre a todo internet? (para el aviso amarillo) */
export const abreATodos = (filas) => filas.some((f) => String(f.origen).trim() === '0.0.0.0/0');

/**
 * El editor de reglas de un grupo de seguridad, como en «Create security group»
 * y «Edit inbound rules»: Type, Protocol, Port range, Source type, Source, Description, Delete.
 * `filas` se cambia en su lugar.
 */
export function editorReglasSg(cx, { filas, vpcId, sentido = 'entrada', alCambiar }) {
  const ipCasa = cx.estado.cuenta.ipCasa;
  const palabra = sentido === 'entrada' ? 'Source' : 'Destination';
  const aviso = cx.vivo(() =>
    sentido === 'entrada' && abreATodos(filas)
      ? ui.alerta({
          tipo: 'aviso',
          contenido: 'Rules with source of 0.0.0.0/0 or ::/0 allow all IP addresses to access your instance. We recommend setting security group rules to allow access from known IP addresses only.'
        })
      : null
  );
  const tiposOpciones = TIPOS_REGLA.map((t) => ({ valor: t.tipo, etiqueta: t.tipo }));
  const el = ui.region(() => {
    if (!filas.length) {
      return [
        h('p', { class: 'cx-texto-sec' }, `This security group has no ${sentido === 'entrada' ? 'inbound' : 'outbound'} rules.`),
        h('div', { style: { marginTop: '12px' } }, ui.boton('Add rule', { alClic: agregar }))
      ];
    }
    const columnas = 'minmax(150px,1.3fr) 80px minmax(90px,0.8fr) minmax(130px,1fr) minmax(170px,1.4fr) minmax(130px,1.2fr) auto';
    return [
      // Si la consola está angosta (con las instrucciones abiertas), las reglas
      // se desplazan de lado dentro de su caja y no empujan toda la página.
      h(
        'div',
        { class: 'cx-reglas-desliza' },
        h(
          'div',
          { class: 'cx-reglas', style: { gridTemplateColumns: columnas } },
          ['Type', 'Protocol', 'Port range', `${palabra} type`, palabra, 'Description - optional', ''].map((t, i) =>
            h('div', { class: 'cx-reglas__cabeza' }, t, i < 6 && t ? ui.info(cx, i === 3 || i === 4 ? 'origen-regla' : 'reglas-sg') : null)
          ),
          filas.map((f, i) => filaEditor(f, i))
        )
      ),
      h('div', { style: { marginTop: '12px' } }, ui.boton('Add rule', { alClic: agregar }))
    ];
  });

  function agregar() {
    filas.push(reglaNueva('Custom TCP', sentido === 'entrada' ? 'custom' : 'custom', sentido === 'entrada' ? '' : '0.0.0.0/0'));
    cambio();
  }

  function cambio(repintar = true) {
    if (repintar) el.repintar();
    aviso.repintar();
    alCambiar?.(filas);
  }

  function filaEditor(f, i) {
    const t = TIPO_POR_NOMBRE.get(f.tipo) ?? TIPOS_REGLA[0];
    const grupos = cx.estado.gruposSeguridad.filter((g) => !vpcId || g.vpcId === vpcId);
    const origenCtl =
      f.origenTipo === 'custom'
        ? ui.selector({
            opciones: () => [
              ...grupos.map((g) => ({ valor: g.id, etiqueta: g.id, descripcion: g.nombre, grupo: 'Security Groups' }))
            ],
            valor: f.origen || null,
            filtrar: true,
            filtroPlaceholder: 'CIDR blocks or security groups',
            placeholder: 'CIDR or security group',
            vacio: 'Type a CIDR block, for example 10.0.0.0/16',
            opcionLibre: (texto) => ({ valor: texto, etiqueta: texto, descripcion: parsearCidr(texto) ? 'CIDR block' : undefined }),
            mostrarLibre: (v) => ({ valor: v, etiqueta: v }),
            alCambiar: (v) => {
              f.origen = v;
              cambio(false);
            },
            etiquetaAccesible: palabra
          })
        : ui.entrada({ valor: f.origen, soloLectura: true, etiquetaAccesible: palabra });
    return [
      ui.selector({
        opciones: tiposOpciones,
        valor: f.tipo,
        filtrar: true,
        etiquetaAccesible: 'Type',
        alCambiar: (v) => {
          f.tipo = v;
          const nt = TIPO_POR_NOMBRE.get(v);
          f.puertos = nt?.rango ? '' : '';
          cambio();
        }
      }),
      ui.entrada({ valor: textoProtocolo(t.protocolo), desactivado: true, etiquetaAccesible: 'Protocol' }),
      t.rango
        ? ui.entrada({ valor: f.puertos, placeholder: '0', etiquetaAccesible: 'Port range', alCambiar: (v) => ((f.puertos = v), cambio(false)) })
        : ui.entrada({ valor: t.todos || t.protocolo === 'icmp' ? 'All' : t.desde === t.hasta ? String(t.desde) : `${t.desde} - ${t.hasta}`, desactivado: true, etiquetaAccesible: 'Port range' }),
      ui.selector({
        opciones: [
          { valor: 'custom', etiqueta: 'Custom' },
          { valor: 'anywhere', etiqueta: 'Anywhere-IPv4' },
          { valor: 'anywhere6', etiqueta: 'Anywhere-IPv6', desactivado: true },
          { valor: 'myip', etiqueta: 'My IP' }
        ],
        valor: f.origenTipo,
        etiquetaAccesible: `${palabra} type`,
        alCambiar: (v) => {
          f.origenTipo = v;
          f.origen = v === 'anywhere' ? '0.0.0.0/0' : v === 'myip' ? `${ipCasa}/32` : '';
          cambio();
        }
      }),
      h(
        'div',
        {},
        origenCtl,
        f.origen && f.origenTipo !== 'custom' ? h('span', { class: 'cx-ficha-sola' }, f.origen) : null,
        f.origen && String(f.origen).startsWith('sg-') ? h('div', { class: 'cx-campo__restriccion' }, cx.estado.gruposSeguridad.find((g) => g.id === f.origen)?.nombre ?? '') : null
      ),
      ui.entrada({ valor: f.descripcion, etiquetaAccesible: 'Description', alCambiar: (v) => ((f.descripcion = v), cambio(false)) }),
      ui.boton('Delete', {
        alClic: () => {
          filas.splice(i, 1);
          cambio();
        }
      }),
      h('div', { class: 'cx-reglas__sep' })
    ];
  }

  return h('div', {}, el, h('div', { style: { marginTop: '12px' } }, aviso));
}

/** Tabla de solo lectura con las reglas de un grupo (pestañas Inbound/Outbound rules). */
export function tablaReglasSg(cx, grupo, sentido, { titulo, acciones } = {}) {
  const palabra = sentido === 'entrada' ? 'Source' : 'Destination';
  return ui.tabla(cx, {
    titulo: titulo ?? (sentido === 'entrada' ? 'Inbound rules' : 'Outbound rules'),
    variante: 'contenedor',
    filas: () => (cx.estado.gruposSeguridad.find((g) => g.id === grupo.id)?.[sentido] ?? []),
    clave: (r) => r.id,
    seleccion: null,
    filtro: `Filter ${sentido === 'entrada' ? 'inbound' : 'outbound'} rules`,
    columnas: [
      { titulo: 'Name', valor: () => '–' },
      { titulo: 'Security group rule ID', valor: (r) => r.id },
      { titulo: 'IP version', valor: (r) => (r.origen.startsWith('sg-') ? '–' : 'IPv4') },
      { titulo: 'Type', valor: (r) => tipoDeRegla(r) },
      { titulo: 'Protocol', valor: (r) => textoProtocolo(r.protocolo) },
      { titulo: 'Port range', valor: (r) => textoPuertos(r) },
      { titulo: palabra, valor: (r) => (r.origen.startsWith('sg-') ? enlaceRecurso(cx, r.origen) : r.origen) },
      { titulo: 'Description', valor: (r) => r.descripcion || '–' }
    ],
    vacio: { titulo: `No security group rules found`, texto: `This security group has no ${sentido === 'entrada' ? 'inbound' : 'outbound'} rules.` },
    acciones: () => acciones ?? []
  });
}

/* =============================================================== etiquetas */

/** La pestaña «Tags» de cualquier recurso con nombre. */
export function pestanaEtiquetas(cx, recurso) {
  const filas = recurso.nombre ? [{ llave: 'Name', valor: recurso.nombre }] : [];
  return ui.contenedor({
    titulo: 'Tags',
    contador: filas.length,
    acciones: ui.boton('Manage tags', { escribe: true, alClic: () => cx.ir(`${cx.servicio}/etiquetas/${recurso.id}`) }),
    sinRelleno: !filas.length ? false : true,
    cuerpo: filas.length
      ? h(
          'table',
          { class: 'cx-tabla__tabla' },
          h('thead', {}, h('tr', {}, h('th', {}, h('span', { class: 'cx-tabla__orden' }, 'Key')), h('th', {}, h('span', { class: 'cx-tabla__orden' }, 'Value')))),
          h('tbody', {}, filas.map((f) => h('tr', {}, h('td', { style: { paddingLeft: '20px' } }, f.llave), h('td', {}, f.valor))))
        )
      : h('div', { class: 'cx-tabla__vacia' }, h('b', {}, 'No tags'), h('div', {}, 'You don’t have any tags.'))
  });
}

const EDITORES = [
  ['vpc-', editarVpc, 'VPC'],
  ['subnet-', editarSubred, 'VPC'],
  ['rtb-', editarTablaRutas, 'VPC'],
  ['igw-', editarIgw, 'VPC'],
  ['acl-', editarNacl, 'VPC'],
  ['i-', editarInstancia, 'EC2'],
  ['vol-', editarVolumen, 'EC2'],
  ['snap-', editarSnapshot, 'EC2']
];

/** «Manage tags»: aquí solo importa la etiqueta Name (es la que se ve en la columna Name). */
export function paginaEtiquetas(cx, { id }) {
  const r = recursoPorId(cx.estado, id);
  const editor = EDITORES.find(([p]) => id.startsWith(p));
  cx.migas([{ texto: cx.servicio === 'vpc' ? 'VPC' : 'EC2', ruta: cx.servicio }, { texto: id, ruta: rutaDe(id, cx.servicio) }, { texto: 'Manage tags' }]);
  if (!r || !editor) return ui.noDisponible('Manage tags', 'Este recurso no admite etiquetas en el simulador.');
  const filas = r.nombre ? [{ llave: 'Name', valor: r.nombre }] : [];
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Manage tags', descripcion: 'A tag is a label that you assign to an AWS resource. Each tag consists of a key and an optional value.' }),
    ui.contenedor({ titulo: 'Resource', cuerpo: ui.pares([{ etiqueta: 'Resource ID', valor: id }], { columnas: 1 }) }),
    ui.contenedor({ titulo: 'Tags', cuerpo: ui.editorEtiquetas({ filas }) }),
    ui.pieFormulario({
      cancelar: () => cx.ir(rutaDe(id, cx.servicio)),
      textoEnviar: 'Save',
      enviar: () => {
        const n = ui.nombreDeEtiquetas(filas);
        const res = cx.hacer({ servicio: editor[2], accion: 'CreateTags', error: 'Failed to update tags' }, (e) => editor[1](e, id, { nombre: n }));
        if (res.ok) {
          cx.flash({ tipo: 'exito', texto: `Successfully updated tags for ${id}.` });
          cx.ir(rutaDe(id, cx.servicio));
        }
      }
    })
  );
}

/* ================================================================ panel */

/** El contenido del panel inferior cuando no hay una sola fila elegida. */
export const panelVacio = (texto) => ui.panelInferior({ titulo: texto, contenido: h('div', { class: 'cx-panel-inferior__vacio' }) });

/** Una página que abre un recurso por id; si ya no existe, el aviso de la consola. */
export function noExiste(cx, tipo, id, rutaLista) {
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.alerta({ tipo: 'error', titulo: `${tipo} not found`, contenido: [`The ${tipo.toLowerCase()} ${id} does not exist or was deleted. `, rutaLista ? ui.enlace(`View all`, rutaLista, { cx }) : null] })
  );
}
