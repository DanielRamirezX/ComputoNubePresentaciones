// ---------------------------------------------------------------------------
// AMAZON ELASTIC FILE SYSTEM (EFS)
//
// La consola de EFS: la lista de file systems, «Create file system» rápido
// (nombre y VPC) o con «Customize» (asistente de 4 pasos: ajustes, red con
// mount targets por zona, política y revisión), el detalle con sus pestañas
// (Metered size, Monitoring, Tags, File system policy, Access points, Network,
// Replication), «Attach» con los comandos mount (más una prueba propia del
// simulador: ¿tu instancia llega por NFS 2049?), Edit, Manage mount targets y
// Delete. El modelo vive en modelo/efs.js.
// ---------------------------------------------------------------------------

import * as ui from '../ui.js';
import {
  comandosMontajeEfs,
  crearMontajeEfs,
  crearSistemaEfs,
  dnsEfs,
  editarSistemaEfs,
  eliminarMontajeEfs,
  eliminarSistemaEfs,
  etiquetasSistemaEfs,
  gruposMontajeEfs,
  ID_ZONA,
  llaveKmsDe,
  montajeEfs,
  politicaEfsDeOpciones,
  politicaSistemaEfs,
  sistemaEfsDe,
  textoTransicionEfs,
  TRANSICIONES_ARCHIVO,
  TRANSICIONES_IA
} from '../modelo.js';
import { enlaceRecurso, noExiste, opcionesVpc } from './comun.js';
import { bloqueCodigo } from './secretsmanager.js';

const { h } = ui;

const migaBase = { texto: 'Amazon EFS', ruta: 'efs' };
const sistemas = (cx) => cx.estado.efs?.sistemas ?? [];
const rutaSistema = (fs) => `efs/sistemas/${fs.id}`;

const ESTADOS = {
  creating: ['pendiente', 'Creating'],
  available: ['exito', 'Available'],
  updating: ['pendiente', 'Updating'],
  deleting: ['pendiente', 'Deleting']
};
const estadoEfs = (x) => ui.estado(...(ESTADOS[x.estado] ?? ['info', x.estado]));

/** 6144 → «6.00 KiB». */
function tamanoTexto(bytes) {
  const u = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB'];
  let n = Number(bytes ?? 0);
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i += 1;
  }
  return i === 0 ? `${n} Bytes` : `${n.toFixed(2)} ${u[i]}`;
}

const THROUGHPUT = { elastic: 'Elastic', provisioned: 'Provisioned', bursting: 'Bursting' };
const RENDIMIENTO = { generalPurpose: 'General Purpose', maxIO: 'Max I/O' };
const zonaTexto = (fs) => (fs.unaZona ? fs.zona : 'Regional');

const opcionesIa = () => [{ valor: '', etiqueta: 'None' }, ...TRANSICIONES_IA.map((v) => ({ valor: v, etiqueta: textoTransicionEfs(v) }))];
const opcionesArchivo = () => [{ valor: '', etiqueta: 'None' }, ...TRANSICIONES_ARCHIVO.map((v) => ({ valor: v, etiqueta: textoTransicionEfs(v) }))];
const opcionesEstandar = () => [
  { valor: '', etiqueta: 'None' },
  { valor: 'AFTER_1_ACCESS', etiqueta: 'On first access' }
];

/** Las llaves de KMS que sirven para cifrar EFS. */
function opcionesLlave(cx) {
  const propias = (cx.estado.kms?.llaves ?? []).filter((k) => !k.administradaPorAws && k.estado === 'Enabled' && k.spec === 'SYMMETRIC_DEFAULT' && k.uso === 'ENCRYPT_DECRYPT');
  return [{ valor: 'aws/elasticfilesystem', etiqueta: 'aws/elasticfilesystem', etiquetaDerecha: 'AWS managed key' }, ...propias.map((k) => ({ valor: k.id, etiqueta: k.alias ?? k.id, descripcion: k.id, etiquetaDerecha: 'Customer managed key' }))];
}

/* ============================================================ lista */

function lista(cx) {
  cx.migas([migaBase, { texto: 'File systems' }]);
  const t = ui.tabla(cx, {
    titulo: 'File systems',
    info: 'efs',
    filas: () => sistemas(cx),
    clave: (fs) => fs.id,
    seleccion: 'unica',
    filtro: 'Search file systems',
    columnas: [
      { titulo: 'Name', valor: (fs) => (fs.nombre ? ui.enlace(fs.nombre, rutaSistema(fs), { cx }) : '–'), texto: (fs) => fs.nombre },
      { titulo: 'File system ID', valor: (fs) => ui.enlace(fs.id, rutaSistema(fs), { cx }), texto: (fs) => fs.id },
      { titulo: 'Encrypted', valor: (fs) => (fs.cifrado ? 'Encrypted' : 'Unencrypted') },
      { titulo: 'Total size', valor: (fs) => tamanoTexto(fs.tamano) },
      { titulo: 'Size in Standard', valor: (fs) => tamanoTexto(fs.tamano) },
      { titulo: 'Size in IA', valor: () => '0 Bytes' },
      { titulo: 'Size in Archive', valor: () => '0 Bytes' },
      { titulo: 'Provisioned Throughput (MiB/s)', valor: (fs) => (fs.throughput === 'provisioned' ? String(fs.mibps) : '–') },
      { titulo: 'File system state', valor: estadoEfs, texto: (fs) => fs.estado },
      { titulo: 'Creation time', valor: (fs) => ui.fecha(fs.creado) },
      { titulo: 'Availability Zone', valor: zonaTexto }
    ],
    acciones: (sel) => [
      ui.boton('View details', { desactivado: sel.length !== 1, alClic: () => cx.ir(rutaSistema(sel[0])) }),
      ui.boton('Delete', { escribe: true, desactivado: sel.length !== 1 || sel[0].estado !== 'available', alClic: () => eliminar(cx, sel[0]) }),
      ui.boton('Create file system', { variante: 'primario', alClic: () => crearRapido(cx) })
    ],
    vacio: {
      titulo: 'No file systems',
      texto: 'You don’t have any EFS file systems in this Region.',
      accion: () => ui.boton('Create file system', { escribe: true, alClic: () => crearRapido(cx) })
    }
  });
  return h('div', { class: 'cx-pagina' }, t);
}

/* ============================================================ crear rápido */

function crearRapido(cx) {
  const e = cx.estado;
  const vpcDef = e.vpcs.find((v) => v.porDefecto) ?? e.vpcs[0];
  const f = { nombre: '', vpcId: vpcDef?.id ?? null };
  const m = cx.modal({
    titulo: 'Create file system',
    ancho: 'mediano',
    contenido: [
      h('p', { class: 'cx-texto-sec' }, 'Create an EFS file system with service recommended settings. Choose Customize to change them.'),
      h(
        'div',
        { class: 'cx-form' },
        ui.campo({ etiqueta: 'Name', opcional: true, descripcion: 'Name your file system.', control: ui.entrada({ valor: '', placeholder: 'Example: My file system', alCambiar: (v) => (f.nombre = v) }), restriccion: 'Name must not be longer than 256 characters, and must only contain letters, numbers, and these characters: + - = . _ : /' }),
        ui.campo({ etiqueta: 'Virtual Private Cloud (VPC)', info: 'efs-red', cx, descripcion: 'Choose the VPC where you want EC2 instances to connect to your file system.', control: ui.selector({ opciones: opcionesVpc(e), valor: f.vpcId, alCambiar: (v) => (f.vpcId = v) }) }),
        ui.alerta({ tipo: 'info', contenido: 'Se crea Regional, cifrado, con respaldos automáticos, throughput Elastic y un mount target en cada zona de la VPC con su grupo de seguridad por omisión (default).' })
      )
    ],
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Customize', {
        alClic: () => {
          m.cerrar();
          cx.memoria.efsBorrador = { nombre: f.nombre, vpcId: f.vpcId };
          cx.ir('efs/crear');
        }
      }),
      ui.boton('Create', {
        variante: 'primario',
        alClic: () => {
          const r = cx.hacer({ servicio: 'EFS', accion: 'CreateFileSystem', error: 'Failed to create file system' }, (e2) => crearSistemaEfs(e2, { nombre: f.nombre, vpcId: f.vpcId }), { atomico: true });
          if (r.ok) {
            m.cerrar();
            cx.flash({ tipo: 'exito', texto: `Success! File system (${r.valor.id}) is available.`, accion: { texto: 'View details', alClic: () => cx.ir(rutaSistema(r.valor)) } });
            if (cx.ruta !== 'efs/sistemas' && cx.ruta !== 'efs') cx.ir('efs/sistemas');
          }
        }
      })
    ]
  });
}

/* ============================================================ crear personalizado */

const PASOS = ['File system settings', 'Network access', 'File system policy', 'Review and create'];

function marco(cx, f, { cuerpo, pie, irA }) {
  return h(
    'div',
    { class: 'cx-asis cx-sec-asis' },
    h(
      'nav',
      { class: 'cx-asis__pasos', 'aria-label': 'Steps' },
      h(
        'ol',
        {},
        PASOS.map((p, i) =>
          h(
            'li',
            { class: ['cx-asis__paso', i === f.paso && 'cx-asis__paso--actual', i > f.paso && 'cx-asis__paso--futuro'], 'aria-current': i === f.paso ? 'step' : undefined },
            h('small', {}, `Step ${i + 1}${i === 2 ? ' - optional' : ''}`),
            i < f.paso ? h('a', { href: '#', class: 'cx-enlace', onclick: (ev) => (ev.preventDefault(), irA(i)) }, p) : h('span', {}, p)
          )
        )
      )
    ),
    h('div', { class: 'cx-asis__cuerpo cx-pagina' }, ui.encabezado({ titulo: PASOS[f.paso], info: 'efs', cx }), cuerpo, pie)
  );
}

/** Un mount target por zona de la VPC (el primer subnet de cada zona) con el grupo default. */
function montajesPorOmision(estado, vpcId, zona = null) {
  const sg = estado.gruposSeguridad.find((g) => g.vpcId === vpcId && g.porDefecto);
  const vistas = new Set();
  const filas = [];
  for (const s of estado.subredes.filter((x) => x.vpcId === vpcId)) {
    if ((zona && s.az !== zona) || vistas.has(s.az)) continue;
    vistas.add(s.az);
    filas.push({ zona: s.az, subredId: s.id, ip: '', grupos: sg ? [sg.id] : [] });
  }
  return filas;
}

/** El editor de filas de mount targets (lo comparten Create y Manage). */
function editorMontajes(cx, { filas, vpcId, zonaFija = null, existentes = [], alCambiar }) {
  const e = cx.estado;
  const subredesVpc = () => e.subredes.filter((s) => s.vpcId === vpcId);
  const zonas = () => [...new Set(subredesVpc().map((s) => s.az))].filter((z) => !zonaFija || z === zonaFija);
  const sgs = () => e.gruposSeguridad.filter((g) => g.vpcId === vpcId);
  const el = ui.region(() => {
    const usadas = new Set([...existentes.map((m) => m.zona), ...filas.map((x) => x.zona)]);
    return [
      filas.length || existentes.length
        ? h(
            'div',
            { class: 'cx-reglas-desliza' },
            h(
              'div',
              { class: 'cx-reglas cx-efs-montajes' },
              ['Availability zone', 'Subnet ID', 'IP addresses', 'Security groups', ''].map((t) => h('div', { class: 'cx-reglas__cabeza' }, t)),
              existentes.map((m) => [
                h('div', { class: 'cx-reglas__celda-fija' }, `${m.zona}`),
                h('div', { class: 'cx-reglas__celda-fija' }, m.subredId),
                h('div', { class: 'cx-reglas__celda-fija' }, m.ip),
                ui.selector({
                  multiple: true,
                  valores: m.grupos,
                  filtrar: true,
                  desactivado: m.quitar,
                  opciones: sgs().map((g) => ({ valor: g.id, etiqueta: `${g.id} (${g.nombre})` })),
                  alCambiar: (v) => ((m.grupos = v), alCambiar?.())
                }),
                ui.boton(m.quitar ? 'Undo' : 'Remove', { alClic: () => ((m.quitar = !m.quitar), el.repintar(), alCambiar?.()) })
              ]),
              filas.map((x, i) => [
                ui.selector({
                  opciones: zonas().map((z) => ({ valor: z, etiqueta: `${z} (${ID_ZONA[z] ?? ''})`, desactivado: z !== x.zona && usadas.has(z) })),
                  valor: x.zona,
                  placeholder: 'Choose an Availability Zone',
                  alCambiar: (v) => {
                    x.zona = v;
                    x.subredId = subredesVpc().find((s) => s.az === v)?.id ?? null;
                    el.repintar();
                    alCambiar?.();
                  }
                }),
                ui.selector({
                  opciones: subredesVpc()
                    .filter((s) => s.az === x.zona)
                    .map((s) => ({ valor: s.id, etiqueta: s.nombre ? `${s.id} (${s.nombre})` : s.id, descripcion: s.cidr })),
                  valor: x.subredId,
                  placeholder: 'Choose a subnet',
                  alCambiar: (v) => ((x.subredId = v), alCambiar?.())
                }),
                ui.entrada({ valor: x.ip, placeholder: 'Automatic', etiquetaAccesible: 'IPv4 address', alCambiar: (v) => (x.ip = v) }),
                ui.selector({
                  multiple: true,
                  valores: x.grupos,
                  filtrar: true,
                  placeholder: 'Choose security groups',
                  opciones: sgs().map((g) => ({ valor: g.id, etiqueta: `${g.id} (${g.nombre})` })),
                  alCambiar: (v) => ((x.grupos = v), alCambiar?.())
                }),
                ui.boton('Remove', { alClic: () => (filas.splice(i, 1), el.repintar(), alCambiar?.()) })
              ])
            )
          )
        : h('p', { class: 'cx-texto-sec' }, 'No mount targets. Without a mount target, no EC2 instance can mount the file system.'),
      h(
        'div',
        { style: { marginTop: '10px' } },
        ui.boton('Add mount target', {
          desactivado: zonas().every((z) => usadas.has(z)),
          alClic: () => {
            const libre = zonas().find((z) => !usadas.has(z));
            const sg = e.gruposSeguridad.find((g) => g.vpcId === vpcId && g.porDefecto);
            filas.push({ zona: libre, subredId: subredesVpc().find((s) => s.az === libre)?.id ?? null, ip: '', grupos: sg ? [sg.id] : [] });
            el.repintar();
            alCambiar?.();
          }
        })
      )
    ];
  });
  return el;
}

function crearPersonalizado(cx) {
  cx.migas([migaBase, { texto: 'File systems', ruta: 'efs/sistemas' }, { texto: 'Create' }]);
  const e = cx.estado;
  const borrador = cx.memoria.efsBorrador ?? {};
  cx.memoria.efsBorrador = null;
  const vpcId = borrador.vpcId ?? (e.vpcs.find((v) => v.porDefecto) ?? e.vpcs[0])?.id ?? null;
  const f = {
    paso: 0,
    nombre: borrador.nombre ?? '',
    tipo: 'regional',
    zona: 'us-east-1a',
    respaldos: true,
    ia: 'AFTER_30_DAYS',
    archivo: 'AFTER_90_DAYS',
    estandar: '',
    cifrado: true,
    llaveKms: 'aws/elasticfilesystem',
    throughput: 'elastic',
    mibps: '1',
    rendimiento: 'generalPurpose',
    etiquetas: [],
    vpcId,
    montajes: montajesPorOmision(e, vpcId),
    politica: { sinRaiz: false, soloLectura: false, tls: false },
    textoPolitica: '',
    errores: {}
  };
  let zona = null;
  const irA = (i) => {
    f.paso = i;
    zona.repintar();
    cx.raiz.querySelector('.cx-principal, main')?.scrollTo?.(0, 0);
  };

  function revisar(paso) {
    f.errores = {};
    if (paso === 0) {
      if (f.nombre.length > 256) f.errores.nombre = 'Name must not be longer than 256 characters.';
      if (f.throughput === 'provisioned' && !(Number(f.mibps) >= 1)) f.errores.mibps = 'Enter a number of MiB/s of at least 1.';
    }
    if (paso === 1) {
      if (!f.vpcId) f.errores.vpc = 'Choose a VPC.';
      if (f.montajes.some((x) => !x.zona || !x.subredId)) f.errores.montajes = 'Choose an Availability Zone and a subnet for every mount target.';
      else if (f.montajes.some((x) => !x.grupos.length)) f.errores.montajes = 'Every mount target needs at least one security group.';
    }
    return !Object.values(f.errores).some(Boolean);
  }
  const siguiente = () => (revisar(f.paso) ? irA(f.paso + 1) : zona.repintar());

  function pie() {
    return h(
      'div',
      { class: 'cx-pie-form' },
      ui.boton('Cancel', { variante: 'texto', alClic: () => cx.ir('efs/sistemas') }),
      f.paso > 0 ? ui.boton('Previous', { alClic: () => irA(f.paso - 1) }) : null,
      f.paso < 3 ? ui.boton('Next', { variante: 'primario', escribe: false, alClic: siguiente }) : ui.boton('Create', { variante: 'primario', alClic: crear })
    );
  }

  function paso1() {
    const unaZona = f.tipo === 'one-zone';
    return [
      ui.contenedor({
        titulo: 'General',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.campo({ etiqueta: 'Name', opcional: true, control: ui.entrada({ valor: f.nombre, placeholder: 'Example: My file system', alCambiar: (v) => (f.nombre = v) }), error: f.errores.nombre }),
          ui.campo({
            etiqueta: 'File system type',
            info: 'efs-tipo',
            cx,
            control: ui.tarjetas({
              valor: f.tipo,
              columnas: 2,
              opciones: [
                { valor: 'regional', etiqueta: 'Regional', descripcion: 'Stores data redundantly across multiple Availability Zones. Recommended for production.' },
                { valor: 'one-zone', etiqueta: 'One Zone', descripcion: 'Stores data within a single Availability Zone. Lower cost; data is lost if the zone fails.' }
              ],
              alCambiar: (v) => {
                f.tipo = v;
                if (v === 'one-zone') f.archivo = '';
                f.montajes = montajesPorOmision(e, f.vpcId, v === 'one-zone' ? f.zona : null);
                zona.repintar();
              }
            })
          }),
          unaZona
            ? ui.campo({
                etiqueta: 'Availability Zone',
                control: ui.selector({
                  opciones: [...new Set(e.subredes.map((s) => s.az))].sort().map((z) => ({ valor: z, etiqueta: `${z} (${ID_ZONA[z] ?? ''})` })),
                  valor: f.zona,
                  alCambiar: (v) => ((f.zona = v), (f.montajes = montajesPorOmision(e, f.vpcId, v)))
                })
              })
            : null,
          ui.casilla({ etiqueta: 'Enable automatic backups', descripcion: 'Automatically back up your file system data with AWS Backup using recommended settings.', marcada: f.respaldos, alCambiar: (v) => (f.respaldos = v) })
        )
      }),
      ui.contenedor({
        titulo: 'Lifecycle management',
        info: 'efs-ciclo',
        cx,
        descripcion: 'EFS moves files between storage classes based on how recently they were accessed.',
        cuerpo: h(
          'div',
          { class: 'cx-fila-campos' },
          ui.campo({ etiqueta: 'Transition into Infrequent Access (IA)', control: ui.selector({ opciones: opcionesIa(), valor: f.ia, alCambiar: (v) => (f.ia = v) }) }),
          ui.campo({ etiqueta: 'Transition into Archive', control: ui.selector({ opciones: opcionesArchivo(), valor: f.archivo, desactivado: unaZona, alCambiar: (v) => (f.archivo = v) }), restriccion: unaZona ? 'Archive isn’t available for One Zone file systems.' : undefined }),
          ui.campo({ etiqueta: 'Transition into Standard', control: ui.selector({ opciones: opcionesEstandar(), valor: f.estandar, alCambiar: (v) => (f.estandar = v) }) })
        )
      }),
      ui.contenedor({
        titulo: 'Encryption',
        info: 'efs-cifrado',
        cx,
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.casilla({ etiqueta: 'Enable encryption of data at rest', descripcion: 'Encryption can only be set when you create the file system.', marcada: f.cifrado, alCambiar: (v) => ((f.cifrado = v), zona.repintar()) }),
          f.cifrado
            ? ui.expandible({
                titulo: 'Customize encryption settings',
                abierto: f.llaveKms !== 'aws/elasticfilesystem',
                contenido: ui.campo({ etiqueta: 'KMS key', control: ui.selector({ opciones: opcionesLlave(cx), valor: f.llaveKms, alCambiar: (v) => (f.llaveKms = v) }) })
              })
            : null
        )
      }),
      ui.contenedor({
        titulo: 'Performance settings',
        info: 'efs-rendimiento',
        cx,
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.campo({
            etiqueta: 'Throughput mode',
            control: ui.radios({
              valor: f.throughput,
              opciones: [
                { valor: 'elastic', etiqueta: 'Enhanced: Elastic (Recommended)', descripcion: 'Throughput scales automatically with your workload. You pay for what you use.' },
                { valor: 'provisioned', etiqueta: 'Enhanced: Provisioned', descripcion: 'You set a fixed throughput, independent of the amount of data stored.' },
                { valor: 'bursting', etiqueta: 'Bursting', descripcion: 'Throughput scales with the amount of data stored.' }
              ],
              alCambiar: (v) => ((f.throughput = v), zona.repintar())
            })
          }),
          f.throughput === 'provisioned'
            ? ui.campo({ etiqueta: 'Provisioned Throughput (MiB/s)', control: ui.entrada({ tipo: 'number', valor: f.mibps, alCambiar: (v) => (f.mibps = v) }), restriccion: 'Between 1 and 3,414 MiB/s.', error: f.errores.mibps })
            : null,
          ui.expandible({
            titulo: 'Additional settings',
            contenido: ui.campo({
              etiqueta: 'Performance mode',
              control: ui.radios({
                valor: f.rendimiento,
                opciones: [
                  { valor: 'generalPurpose', etiqueta: 'General Purpose (Recommended)', descripcion: 'Ideal for latency-sensitive use cases, like web serving and content management.' },
                  { valor: 'maxIO', etiqueta: 'Max I/O', descripcion: 'Designed for highly parallelized workloads that can tolerate higher latencies. Not supported with Elastic throughput or One Zone.' }
                ],
                alCambiar: (v) => (f.rendimiento = v)
              })
            })
          })
        )
      }),
      ui.contenedor({ titulo: 'Tags', descripcion: 'A tag is a label that you assign to an AWS resource.', plegable: true, abierto: f.etiquetas.length > 0, cuerpo: ui.editorEtiquetas({ filas: f.etiquetas }) })
    ];
  }

  function paso2() {
    return [
      ui.contenedor({
        titulo: 'Network',
        info: 'efs-red',
        cx,
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.campo({
            etiqueta: 'Virtual Private Cloud (VPC)',
            descripcion: 'Choose the VPC where you want EC2 instances to connect to your file system.',
            control: ui.selector({
              opciones: opcionesVpc(e),
              valor: f.vpcId,
              alCambiar: (v) => {
                f.vpcId = v;
                f.montajes = montajesPorOmision(e, v, f.tipo === 'one-zone' ? f.zona : null);
                zona.repintar();
              }
            }),
            error: f.errores.vpc
          })
        )
      }),
      ui.contenedor({
        titulo: 'Mount targets',
        info: 'efs-montaje',
        cx,
        descripcion: 'A mount target provides an NFSv4 endpoint at which you can mount an Amazon EFS file system. We recommend creating one mount target per Availability Zone.',
        cuerpo: h(
          'div',
          {},
          editorMontajes(cx, { filas: f.montajes, vpcId: f.vpcId, zonaFija: f.tipo === 'one-zone' ? f.zona : null }),
          f.errores.montajes ? h('div', { class: 'cx-campo__error', role: 'alert', style: { marginTop: '8px' } }, ui.icono('status-negative'), h('span', {}, f.errores.montajes)) : null
        )
      })
    ];
  }

  function paso3() {
    const armar = () => {
      const p = f.politica;
      f.textoPolitica = p.sinRaiz || p.soloLectura || p.tls ? politicaEfsDeOpciones({ arn: `arn:aws:elasticfilesystem:us-east-1:${e.cuenta.id}:file-system/fs-…` }, p) : '';
      zona.repintar();
    };
    return [
      ui.contenedor({
        titulo: 'Policy options',
        info: 'efs-politica',
        cx,
        descripcion: 'Select one or more of these common policy options, or create a more advanced policy using the editor.',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.casilla({ etiqueta: 'Prevent root access by default*', marcada: f.politica.sinRaiz, alCambiar: (v) => ((f.politica.sinRaiz = v), armar()) }),
          ui.casilla({ etiqueta: 'Enforce read-only access by default*', marcada: f.politica.soloLectura, alCambiar: (v) => ((f.politica.soloLectura = v), armar()) }),
          ui.casilla({ etiqueta: 'Enforce in-transit encryption for all clients', marcada: f.politica.tls, alCambiar: (v) => ((f.politica.tls = v), armar()) }),
          h('p', { class: 'cx-texto-sec' }, '* Identity-based policies can override these default permissions.')
        )
      }),
      ui.contenedor({
        titulo: 'Policy editor',
        descripcion: 'JSON. Leave it empty if you don’t need a file system policy.',
        cuerpo: ui.area({ valor: f.textoPolitica, filas: 12, monoespaciado: true, placeholder: '{\n  "Version": "2012-10-17",\n  "Statement": [ … ]\n}', alCambiar: (v) => (f.textoPolitica = v) })
      })
    ];
  }

  function paso4() {
    const editar = (i) => ui.boton('Edit', { alClic: () => irA(i) });
    const llave = opcionesLlave(cx).find((o) => o.valor === f.llaveKms)?.etiqueta;
    return [
      ui.contenedor({
        titulo: 'Step 1: File system settings',
        acciones: editar(0),
        cuerpo: ui.pares(
          [
            { etiqueta: 'Name', valor: f.nombre || '–' },
            { etiqueta: 'File system type', valor: f.tipo === 'one-zone' ? `One Zone (${f.zona})` : 'Regional' },
            { etiqueta: 'Automatic backups', valor: f.respaldos ? 'Enabled' : 'Disabled' },
            { etiqueta: 'Transition into IA', valor: textoTransicionEfs(f.ia || null) },
            { etiqueta: 'Transition into Archive', valor: textoTransicionEfs(f.archivo || null) },
            { etiqueta: 'Transition into Standard', valor: textoTransicionEfs(f.estandar || null) },
            { etiqueta: 'Encrypted', valor: f.cifrado ? `Yes (${llave})` : 'No' },
            { etiqueta: 'Throughput mode', valor: f.throughput === 'provisioned' ? `Provisioned (${f.mibps} MiB/s)` : THROUGHPUT[f.throughput] },
            { etiqueta: 'Performance mode', valor: RENDIMIENTO[f.rendimiento] }
          ],
          { columnas: 3 }
        )
      }),
      ui.contenedor({
        titulo: 'Step 2: Network access',
        acciones: editar(1),
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.pares([{ etiqueta: 'VPC', valor: f.vpcId }], { columnas: 1 }),
          f.montajes.length
            ? h('div', {}, f.montajes.map((x) => h('div', {}, `${x.zona} · ${x.subredId} · ${x.ip || 'Automatic'} · ${x.grupos.join(', ')}`)))
            : ui.alerta({ tipo: 'aviso', contenido: 'Sin mount targets ninguna instancia podrá montar el sistema de archivos. Puedes agregarlos después en Network → Manage.' })
        )
      }),
      ui.contenedor({ titulo: 'Step 3: File system policy', acciones: editar(2), cuerpo: f.textoPolitica.trim() ? h('div', { class: 'cx-log cx-kms-politica' }, f.textoPolitica) : h('span', { class: 'cx-texto-sec' }, 'No file system policy.') })
    ];
  }

  function crear() {
    const r = cx.hacer(
      { servicio: 'EFS', accion: 'CreateFileSystem', error: 'Failed to create file system' },
      (e2) => {
        const fs = crearSistemaEfs(e2, {
          nombre: f.nombre,
          tipo: f.tipo,
          zona: f.tipo === 'one-zone' ? f.zona : null,
          respaldos: f.respaldos,
          ciclo: { ia: f.ia || null, archivo: f.tipo === 'one-zone' ? null : f.archivo || null, estandar: f.estandar || null },
          cifrado: f.cifrado,
          llaveKms: f.llaveKms,
          throughput: f.throughput,
          mibps: Number(f.mibps),
          rendimiento: f.rendimiento,
          vpcId: f.vpcId,
          montajes: f.montajes.map((x) => ({ subredId: x.subredId, gruposSeguridad: x.grupos, ip: x.ip })),
          etiquetas: f.etiquetas
        });
        if (f.textoPolitica.trim()) politicaSistemaEfs(e2, fs.id, f.textoPolitica.replace(/fs-…/g, fs.id));
        return fs;
      },
      { atomico: true }
    );
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: `Success! File system (${r.valor.id}) is available.`, accion: { texto: 'View details', alClic: () => cx.ir(rutaSistema(r.valor)) } });
      cx.ir('efs/sistemas');
    }
  }

  zona = ui.region(() => marco(cx, f, { cuerpo: [paso1, paso2, paso3, paso4][f.paso](), pie: pie(), irA }));
  return zona;
}

/* ============================================================ detalle */

function detalle(cx, { id }) {
  cx.migas([migaBase, { texto: 'File systems', ruta: 'efs/sistemas' }, { texto: id }]);
  if (!sistemaEfsDe(cx.estado, id)) return noExiste(cx, 'File system', id, 'efs/sistemas');
  const st = { pestana: 'medida' };
  return cx.vivo(() => {
    const fs = sistemaEfsDe(cx.estado, id);
    if (!fs) return noExiste(cx, 'File system', id, 'efs/sistemas');
    const listo = fs.estado === 'available';
    const llave = fs.llaveKms ? llaveKmsDe(cx.estado, fs.llaveKms) : null;
    const ciclo = fs.ciclo ?? {};
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({
        titulo: fs.nombre ? `${fs.nombre} (${fs.id})` : fs.id,
        info: 'efs',
        cx,
        acciones: [
          ui.botonRefrescar(() => cx.refrescar()),
          ui.boton('Delete', { escribe: true, desactivado: !listo, alClic: () => eliminar(cx, fs) }),
          ui.boton('Attach', { desactivado: !listo, alClic: () => adjuntar(cx, fs) }),
          ui.boton('Edit', { escribe: true, desactivado: !listo, alClic: () => editar(cx, fs) })
        ]
      }),
      ui.contenedor({
        titulo: 'General',
        cuerpo: ui.pares(
          [
            { etiqueta: 'Performance mode', valor: RENDIMIENTO[fs.rendimiento] },
            { etiqueta: 'Throughput mode', valor: fs.throughput === 'provisioned' ? `Provisioned (${fs.mibps} MiB/s)` : THROUGHPUT[fs.throughput] },
            {
              etiqueta: 'Lifecycle management',
              info: 'efs-ciclo',
              valor: h('div', {}, h('div', {}, `Transition into IA: ${textoTransicionEfs(ciclo.ia)}`), h('div', {}, `Transition into Archive: ${textoTransicionEfs(ciclo.archivo)}`), h('div', {}, `Transition into Standard: ${textoTransicionEfs(ciclo.estandar)}`))
            },
            { etiqueta: 'Availability zone', valor: zonaTexto(fs) },
            { etiqueta: 'Automatic backups', valor: fs.respaldos ? 'Enabled' : 'Disabled' },
            { etiqueta: 'Encrypted', valor: fs.cifrado ? (llave ? `${llave.alias ?? llave.id}` : 'Encrypted') : 'Unencrypted' },
            { etiqueta: 'File system state', valor: estadoEfs(fs) },
            { etiqueta: 'DNS name', valor: listo ? ui.copiable(dnsEfs(fs)) : '–' },
            { etiqueta: 'File system ARN', valor: ui.copiable(fs.arn) }
          ],
          { columnas: 3, cx }
        )
      }),
      ui.pestanas({
        activa: st.pestana,
        alCambiar: (p) => (st.pestana = p),
        pestanas: [
          {
            id: 'medida',
            texto: 'Metered size',
            contenido: () =>
              ui.contenedor({
                titulo: 'Metered size',
                info: 'efs-ciclo',
                cx,
                cuerpo: h(
                  'div',
                  { class: 'cx-efs-medida' },
                  [
                    ['Total size', tamanoTexto(fs.tamano)],
                    ['Size in Standard', tamanoTexto(fs.tamano)],
                    ['Size in IA', '0 Bytes'],
                    ['Size in Archive', '0 Bytes']
                  ].map(([a, b]) => h('div', {}, h('span', { class: 'cx-texto-sec' }, a), h('strong', {}, b)))
                )
              })
          },
          { id: 'monitoreo', texto: 'Monitoring', contenido: () => ui.alerta({ tipo: 'info', titulo: 'No disponible en este simulador', contenido: 'Las métricas de EFS (Throughput, IOPS, conexiones de clientes) solo existen en la consola real.' }) },
          { id: 'etiquetas', texto: 'Tags', contenido: () => pestanaEtiquetas(cx, fs) },
          { id: 'politica', texto: 'File system policy', contenido: () => pestanaPolitica(cx, fs) },
          { id: 'puntos', texto: 'Access points', contenido: () => ui.alerta({ tipo: 'info', titulo: 'No disponible en este simulador', contenido: 'Los access points (puntos de acceso con su propia carpeta y usuario POSIX) no se necesitan en los laboratorios.' }) },
          { id: 'red', texto: 'Network', contenido: () => pestanaRed(cx, fs) },
          { id: 'replica', texto: 'Replication', contenido: () => ui.alerta({ tipo: 'info', titulo: 'No disponible en este simulador', contenido: 'La réplica de EFS a otra región no está disponible: todo vive en us-east-1.' }) }
        ]
      })
    );
  });
}

function pestanaRed(cx, fs) {
  return ui.tabla(cx, {
    titulo: 'Network',
    info: 'efs-montaje',
    variante: 'contenedor',
    filas: () => sistemaEfsDe(cx.estado, fs.id)?.montajes ?? [],
    clave: (m) => m.id,
    seleccion: null,
    filtro: false,
    columnas: [
      { titulo: 'Availability zone', valor: (m) => m.zona },
      { titulo: 'Mount target ID', valor: (m) => m.id },
      { titulo: 'Subnet ID', valor: (m) => enlaceRecurso(cx, m.subredId) },
      { titulo: 'Mount target state', valor: estadoEfs, texto: (m) => m.estado },
      { titulo: 'IP address', valor: (m) => m.ip },
      { titulo: 'Network interface ID', valor: (m) => m.eni },
      { titulo: 'Security groups', valor: (m) => h('div', {}, m.gruposSeguridad.map((g) => h('div', {}, enlaceRecurso(cx, g)))) }
    ],
    acciones: () => [ui.boton('Manage', { escribe: true, desactivado: fs.estado !== 'available', alClic: () => cx.ir(`efs/sistemas/${fs.id}/red`) })],
    vacio: { titulo: 'No mount targets', texto: 'Without a mount target no EC2 instance can mount this file system. Choose Manage to add one.' }
  });
}

function pestanaPolitica(cx, fs) {
  return ui.contenedor({
    titulo: 'File system policy',
    info: 'efs-politica',
    cx,
    acciones: ui.boton('Edit', { escribe: true, desactivado: fs.estado !== 'available', alClic: () => editarPolitica(cx, fs) }),
    cuerpo: fs.politica ? h('div', { class: 'cx-log cx-kms-politica' }, fs.politica) : h('span', { class: 'cx-texto-sec' }, 'No file system policy. Any client that can reach a mount target can mount the file system (IAM still applies).')
  });
}

function pestanaEtiquetas(cx, fs) {
  return ui.tabla(cx, {
    titulo: 'Tags',
    variante: 'contenedor',
    filas: () => sistemaEfsDe(cx.estado, fs.id)?.etiquetas ?? [],
    clave: (t) => t.llave,
    seleccion: null,
    filtro: false,
    columnas: [
      { titulo: 'Key', valor: (t) => t.llave },
      { titulo: 'Value', valor: (t) => t.valor || '–' }
    ],
    acciones: () => [ui.boton('Manage tags', { escribe: true, alClic: () => editarEtiquetas(cx, fs) })],
    vacio: { titulo: 'No tags', texto: 'This file system has no tags.' }
  });
}

/* ============================================================ Manage mount targets */

function manejarRed(cx, { id }) {
  cx.migas([migaBase, { texto: 'File systems', ruta: 'efs/sistemas' }, { texto: id, ruta: `efs/sistemas/${id}` }, { texto: 'Network access' }]);
  const fs = sistemaEfsDe(cx.estado, id);
  if (!fs) return noExiste(cx, 'File system', id, 'efs/sistemas');
  const existentes = fs.montajes.filter((m) => m.estado !== 'deleting').map((m) => ({ id: m.id, zona: m.zona, subredId: m.subredId, ip: m.ip, grupos: [...m.gruposSeguridad], antes: [...m.gruposSeguridad], quitar: false }));
  const nuevos = [];
  const vpcId = fs.vpcId ?? (cx.estado.vpcs.find((v) => v.porDefecto) ?? cx.estado.vpcs[0])?.id;
  const st = { vpcId, error: null };
  const zona = ui.region(() => [
    ui.encabezado({ titulo: 'Network access', info: 'efs-montaje', cx, descripcion: `${fs.nombre ? `${fs.nombre} · ` : ''}${fs.id}` }),
    ui.contenedor({
      titulo: 'Network',
      cuerpo: ui.campo({
        etiqueta: 'Virtual Private Cloud (VPC)',
        descripcion: existentes.length ? 'All mount targets of a file system must be in the same VPC. Remove them all to change the VPC.' : 'Choose the VPC of the new mount targets.',
        control: ui.selector({ opciones: opcionesVpc(cx.estado), valor: st.vpcId, desactivado: existentes.length > 0, alCambiar: (v) => ((st.vpcId = v), nuevos.splice(0), zona.repintar()) })
      })
    }),
    ui.contenedor({
      titulo: 'Mount targets',
      cuerpo: h(
        'div',
        {},
        editorMontajes(cx, { filas: nuevos, vpcId: st.vpcId, zonaFija: fs.unaZona ? fs.zona : null, existentes }),
        st.error ? h('div', { class: 'cx-campo__error', role: 'alert', style: { marginTop: '8px' } }, ui.icono('status-negative'), h('span', {}, st.error)) : null
      )
    }),
    ui.pieFormulario({ cancelar: () => cx.ir(`efs/sistemas/${id}`), textoEnviar: 'Save', enviar: guardar })
  ]);

  function guardar() {
    st.error = null;
    if (nuevos.some((x) => !x.zona || !x.subredId)) st.error = 'Choose an Availability Zone and a subnet for every mount target.';
    else if ([...nuevos, ...existentes.filter((m) => !m.quitar)].some((x) => !x.grupos.length)) st.error = 'Every mount target needs at least one security group.';
    if (st.error) return zona.repintar();
    const r = cx.hacer(
      { servicio: 'EFS', accion: 'CreateMountTarget', error: 'Failed to update mount targets' },
      (e) => {
        for (const m of existentes) {
          if (m.quitar) eliminarMontajeEfs(e, id, m.id);
          else if (m.grupos.join() !== m.antes.join()) gruposMontajeEfs(e, id, m.id, m.grupos);
        }
        for (const x of nuevos) crearMontajeEfs(e, id, { subredId: x.subredId, gruposSeguridad: x.grupos, ip: x.ip });
        return sistemaEfsDe(e, id);
      },
      { atomico: true }
    );
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: `Successfully updated mount targets of file system ${id}.` });
      cx.ir(`efs/sistemas/${id}`);
    }
  }
  return h('div', { class: 'cx-pagina cx-pagina--form' }, zona);
}

/* ============================================================ modales */

function adjuntar(cx, fs) {
  const vivos = fs.montajes.filter((m) => m.estado === 'available');
  const st = { modo: 'dns', zona: vivos[0]?.zona ?? null, instancia: null, resultado: null };
  const instancias = () => cx.estado.instancias.filter((i) => i.estado !== 'terminated');
  const cuerpo = ui.region(() => {
    const c = comandosMontajeEfs(fs, { modo: st.modo, zona: st.zona });
    return [
      ui.segmentado({ valor: st.modo, opciones: [{ valor: 'dns', etiqueta: 'Mount via DNS' }, { valor: 'ip', etiqueta: 'Mount via IP' }], alCambiar: (v) => ((st.modo = v), cuerpo.repintar()) }),
      st.modo === 'ip'
        ? ui.campo({ etiqueta: 'Availability zone', control: ui.selector({ opciones: vivos.map((m) => ({ valor: m.zona, etiqueta: m.zona, descripcion: m.ip })), valor: st.zona, vacio: 'No mount targets', alCambiar: (v) => ((st.zona = v), cuerpo.repintar()) }) })
        : null,
      c.ayudante
        ? [
            h('div', { class: 'cx-codigo-titulo' }, 'Using the EFS mount helper:'),
            bloqueCodigo(c.ayudante),
            h('div', { class: 'cx-codigo-titulo' }, 'Using the NFS client:'),
            bloqueCodigo(c.nfs)
          ]
        : ui.alerta({ tipo: 'aviso', contenido: 'This file system has no available mount targets. Add one in Network → Manage.' }),
      h('p', { class: 'cx-texto-sec', style: { marginTop: '12px' } }, ui.textoRico('Antes de montar: instala el cliente (`sudo dnf install -y amazon-efs-utils`) y crea la carpeta (`mkdir efs`). El grupo de seguridad del mount target debe dejar entrar **NFS (TCP 2049)** desde tu instancia.')),
      h(
        'div',
        { class: 'cx-efs-prueba' },
        h('div', { class: 'cx-bloque__titulo' }, 'Prueba del simulador: ¿tu instancia lo puede montar?'),
        h('p', { class: 'cx-texto-sec' }, 'Elige una instancia y el simulador revisa el camino: VPC, mount target, grupos de seguridad (NFS 2049) y NACL.'),
        h(
          'div',
          { class: 'cx-fila-campos' },
          ui.campo({
            etiqueta: 'EC2 instance',
            control: ui.selector({
              opciones: instancias().map((i) => ({ valor: i.id, etiqueta: i.nombre ? `${i.id} (${i.nombre})` : i.id, descripcion: `${i.estado} · ${i.az} · ${i.vpcId}` })),
              valor: st.instancia,
              placeholder: 'Choose an instance',
              vacio: 'No instances',
              alCambiar: (v) => ((st.instancia = v), (st.resultado = null), cuerpo.repintar())
            })
          }),
          ui.boton('Probar montaje', { desactivado: !st.instancia, alClic: () => ((st.resultado = montajeEfs(cx.estado, st.instancia, fs.id)), cuerpo.repintar()) })
        ),
        st.resultado
          ? ui.alerta({
              tipo: st.resultado.ok ? 'exito' : 'error',
              titulo: st.resultado.ok ? 'Se monta: la instancia llega por NFS (TCP 2049).' : 'No se monta: mount.nfs4: Connection timed out',
              contenido: st.resultado.motivo
            })
          : null
      )
    ];
  });
  const m = cx.modal({
    titulo: 'Attach',
    ancho: 'grande',
    contenido: [h('p', { class: 'cx-texto-sec' }, `Mount your Amazon EFS file system ${fs.id} on a Linux instance.`), cuerpo],
    pie: [ui.boton('Close', { variante: 'primario', escribe: false, alClic: () => m.cerrar() })]
  });
}

function editar(cx, fs) {
  const f = {
    nombre: fs.nombre ?? '',
    respaldos: fs.respaldos,
    ia: fs.ciclo?.ia ?? '',
    archivo: fs.ciclo?.archivo ?? '',
    estandar: fs.ciclo?.estandar ?? '',
    throughput: fs.throughput,
    mibps: String(fs.mibps ?? 1)
  };
  const cuerpo = ui.region(() =>
    h(
      'div',
      { class: 'cx-form' },
      ui.campo({ etiqueta: 'Name', opcional: true, control: ui.entrada({ valor: f.nombre, alCambiar: (v) => (f.nombre = v) }) }),
      ui.casilla({ etiqueta: 'Enable automatic backups', marcada: f.respaldos, alCambiar: (v) => (f.respaldos = v) }),
      h(
        'div',
        { class: 'cx-fila-campos' },
        ui.campo({ etiqueta: 'Transition into IA', control: ui.selector({ opciones: opcionesIa(), valor: f.ia, alCambiar: (v) => (f.ia = v) }) }),
        ui.campo({ etiqueta: 'Transition into Archive', control: ui.selector({ opciones: opcionesArchivo(), valor: f.archivo, desactivado: fs.unaZona, alCambiar: (v) => (f.archivo = v) }) }),
        ui.campo({ etiqueta: 'Transition into Standard', control: ui.selector({ opciones: opcionesEstandar(), valor: f.estandar, alCambiar: (v) => (f.estandar = v) }) })
      ),
      ui.campo({
        etiqueta: 'Throughput mode',
        control: ui.radios({
          valor: f.throughput,
          horizontal: true,
          opciones: [
            { valor: 'elastic', etiqueta: 'Elastic', desactivado: fs.rendimiento === 'maxIO' },
            { valor: 'provisioned', etiqueta: 'Provisioned' },
            { valor: 'bursting', etiqueta: 'Bursting' }
          ],
          alCambiar: (v) => ((f.throughput = v), cuerpo.repintar())
        })
      }),
      f.throughput === 'provisioned' ? ui.campo({ etiqueta: 'Provisioned Throughput (MiB/s)', control: ui.entrada({ tipo: 'number', valor: f.mibps, alCambiar: (v) => (f.mibps = v) }) }) : null,
      h('p', { class: 'cx-texto-sec' }, 'El tipo (Regional / One Zone), el cifrado y el modo de rendimiento solo se eligen al crear.')
    )
  );
  const m = cx.modal({
    titulo: `Edit ${fs.nombre || fs.id}`,
    ancho: 'grande',
    contenido: cuerpo,
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Save changes', {
        variante: 'primario',
        alClic: () => {
          const cambios = {
            nombre: f.nombre,
            respaldos: f.respaldos,
            ciclo: { ia: f.ia || null, archivo: fs.unaZona ? null : f.archivo || null, estandar: f.estandar || null }
          };
          if (f.throughput !== fs.throughput || (f.throughput === 'provisioned' && Number(f.mibps) !== fs.mibps)) Object.assign(cambios, { throughput: f.throughput, mibps: Number(f.mibps) });
          const r = cx.hacer({ servicio: 'EFS', accion: 'UpdateFileSystem', error: 'Failed to update file system' }, (e) => editarSistemaEfs(e, fs.id, cambios), { atomico: true });
          if (r.ok) {
            m.cerrar();
            cx.flash({ tipo: 'exito', texto: `Successfully updated file system ${fs.id}.` });
          }
        }
      })
    ]
  });
}

function editarPolitica(cx, fs) {
  const f = { texto: fs.politica ?? '' };
  const cuerpo = ui.region(() => [
    h(
      'div',
      { class: 'cx-fila-campos', style: { marginBottom: '10px' } },
      ui.boton('Prevent root access', { alClic: () => ((f.texto = politicaEfsDeOpciones(fs, { sinRaiz: true })), cuerpo.repintar()) }),
      ui.boton('Enforce read-only access', { alClic: () => ((f.texto = politicaEfsDeOpciones(fs, { soloLectura: true })), cuerpo.repintar()) }),
      ui.boton('Enforce in-transit encryption', { alClic: () => ((f.texto = politicaEfsDeOpciones(fs, { tls: true })), cuerpo.repintar()) })
    ),
    ui.area({ valor: f.texto, filas: 14, monoespaciado: true, alCambiar: (v) => (f.texto = v) }),
    h('p', { class: 'cx-texto-sec' }, 'Deja el editor vacío y guarda para quitar la política.')
  ]);
  const m = cx.modal({
    titulo: 'File system policy',
    ancho: 'grande',
    contenido: cuerpo,
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Save', {
        variante: 'primario',
        alClic: () => {
          const r = cx.hacer({ servicio: 'EFS', accion: 'PutFileSystemPolicy', error: 'Failed to save the file system policy' }, (e) => politicaSistemaEfs(e, fs.id, f.texto));
          if (r.ok) m.cerrar();
        }
      })
    ]
  });
}

function editarEtiquetas(cx, fs) {
  const filas = fs.etiquetas.map((t) => ({ ...t }));
  const m = cx.modal({
    titulo: 'Manage tags',
    ancho: 'grande',
    contenido: ui.editorEtiquetas({ filas }),
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Save', {
        variante: 'primario',
        alClic: () => {
          const r = cx.hacer({ servicio: 'EFS', accion: 'TagResource', error: 'Failed to save tags' }, (e) => etiquetasSistemaEfs(e, fs.id, filas));
          if (r.ok) m.cerrar();
        }
      })
    ]
  });
}

function eliminar(cx, fs) {
  cx.confirmar({
    titulo: 'Delete file system',
    palabra: fs.id,
    textoBoton: 'Confirm',
    contenido: [
      ui.alerta({ tipo: 'aviso', contenido: 'Deleting the file system permanently deletes all of its data and its mount targets. This action can’t be undone.' })
    ],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'EFS', accion: 'DeleteFileSystem', error: `Failed to delete ${fs.id}` }, (e) => eliminarSistemaEfs(e, fs.id));
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: `File system ${fs.id} is being deleted.` });
        if (cx.ruta.startsWith('efs/sistemas/')) cx.ir('efs/sistemas');
      }
      return r.ok;
    }
  });
}

/* ================================================================ ayudas */

const ayudas = {
  efs: {
    titulo: 'Amazon EFS',
    texto: [
      '**EFS** es una **carpeta compartida en red**: muchas instancias Linux la montan al mismo tiempo y ven los mismos archivos.',
      'Crece y se encoge sola: no eliges tamaño y pagas por los GB que guardas.',
      ['**EBS**: un disco de **una** instancia, en **una** zona.', '**EFS**: archivos compartidos por **muchas** instancias, en varias zonas.', '**S3**: objetos por internet (HTTP), no se monta como carpeta.'],
      'Usa el protocolo **NFS** (puerto TCP **2049**).'
    ]
  },
  'efs-tipo': {
    titulo: 'Regional o One Zone',
    texto: [
      '**Regional**: guarda copias en **varias zonas**. Si una zona se cae, tus archivos siguen ahí. Es lo recomendado.',
      '**One Zone**: todo en **una sola zona**. Cuesta casi la mitad, pero si esa zona falla pierdes acceso (o los datos). Bueno para copias o pruebas.'
    ]
  },
  'efs-ciclo': {
    titulo: 'Ciclo de vida y clases',
    texto: [
      'EFS tiene tres clases: **Standard** (lo que usas seguido), **Infrequent Access (IA)** (más barato de guardar, cobra por leer) y **Archive** (lo más barato, para lo que casi nunca se toca).',
      'El **ciclo de vida** mueve solo cada archivo según cuántos días lleva sin usarse; con **Transition into Standard: On first access** regresa a Standard en cuanto alguien lo abre.'
    ]
  },
  'efs-cifrado': {
    titulo: 'Cifrado',
    texto: ['EFS cifra los datos guardados con una llave de **KMS** (`aws/elasticfilesystem` o una tuya).', 'Solo se elige **al crear**: para cifrar uno que no lo está, crea otro y copia los datos.']
  },
  'efs-rendimiento': {
    titulo: 'Throughput y rendimiento',
    texto: [
      '**Elastic**: el throughput sube y baja solo con tu carga; pagas lo que usas. Es el recomendado.',
      '**Provisioned**: fijas los MiB/s que necesitas aunque guardes pocos datos.',
      '**Bursting**: el throughput crece con lo que guardas (con créditos de ráfaga).',
      '**General Purpose** es el modo de rendimiento normal; **Max I/O** es para miles de clientes en paralelo.'
    ]
  },
  'efs-red': {
    titulo: 'La red de EFS',
    texto: ['EFS vive dentro de una **VPC**. Las instancias de esa VPC llegan a él por sus **mount targets**.', 'Todos los mount targets de un sistema de archivos van en la **misma VPC**.']
  },
  'efs-montaje': {
    titulo: 'Mount targets',
    texto: [
      'Un **mount target** es la «puerta» del sistema de archivos dentro de una subred: tiene una IP privada y sus propios **grupos de seguridad**.',
      'Crea **uno por zona**: así cada instancia entra por la puerta de su zona (más rápido y sin cobro entre zonas).',
      'Su grupo de seguridad debe dejar entrar **NFS (TCP 2049)** desde el grupo de seguridad de tus instancias. Si no, `mount` se queda esperando y falla por *timeout*.'
    ]
  },
  'efs-politica': {
    titulo: 'File system policy',
    texto: ['Una política JSON del propio sistema de archivos: por ejemplo, **obligar TLS** (cifrado en tránsito), negar el acceso como root o dejarlo de solo lectura.', 'Es opcional: sin política, cualquier cliente que llegue a un mount target puede montar.']
  }
};

/* ================================================================ registro */

const des = (texto) => ({ texto, desactivado: true });

export default {
  id: 'efs',
  nombre: 'EFS',
  titulo: 'Amazon Elastic File System',
  descripcion: 'Managed File Storage for EC2',
  categoria: 'almacenamiento',
  claves: 'efs nfs archivos compartidos file system carpeta',
  inicio: 'efs/sistemas',
  menu: [{ texto: 'File systems', ruta: 'efs/sistemas' }, des('Access points'), des('Replications')],
  rutas: {
    '': lista,
    sistemas: lista,
    crear: crearPersonalizado,
    'sistemas/:id': detalle,
    'sistemas/:id/red': manejarRed
  },
  busqueda: [
    { texto: 'File systems', ruta: 'efs/sistemas' },
    { texto: 'Create file system', ruta: 'efs/crear', claves: 'crear efs nfs' }
  ],
  ayudas
};
