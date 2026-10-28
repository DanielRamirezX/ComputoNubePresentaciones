// ---------------------------------------------------------------------------
// EC2 · INSTANCES
//
// La lista de instancias con su panel inferior (Details, Status and alarms,
// Security, Networking, Storage, Tags), los cambios de estado con los modales
// reales (Stop, Reboot, Terminate (delete)), el asistente «Launch an instance»
// en una sola página con su Summary a la derecha, y las pantallas de Actions:
// Connect, Get system log, Edit user data, Change instance type, Change
// security groups y Modify IAM role.
// ---------------------------------------------------------------------------

import * as ui from '../ui.js';
import {
  ami as amiDe,
  AMIS,
  cambiarGruposInstancia,
  cambiarRolInstancia,
  cambiarTipoInstancia,
  detenerInstancia,
  dnsPrivado,
  dnsPublico,
  editarUserData,
  iniciarInstancia,
  lanzarInstancias,
  reiniciarInstancia,
  terminarInstancia,
  TIPOS_INSTANCIA,
  TIPOS_VOLUMEN,
  tipoInstancia
} from '../modelo.js';
import { registroSistema } from '../red.js';
import {
  chequeoInstancia,
  chequeosListos,
  editorReglasSg,
  enlaceRecurso,
  estadoInstancia,
  idParentesis,
  nombre,
  noExiste,
  opcionesVpc,
  opcionSubred,
  panelVacio,
  pestanaEtiquetas,
  reglaDeFila,
  reglaNueva,
  abreATodos
} from './comun.js';
import { crearLlaveYDescargar, formularioLlave } from './ec2-red.js';

const { h } = ui;

const instDe = (cx, id) => cx.estado.instancias.find((i) => i.id === id);
const conNombre = (i) => `${i.id}${i.nombre ? ` (${i.nombre})` : ''}`;
const plataforma = (i) => {
  const a = amiDe(i.ami);
  return a?.so === 'windows' ? 'Windows' : a?.familia === 'Ubuntu' ? 'Ubuntu' : a?.familia === 'Red Hat' ? 'Red Hat Enterprise Linux' : a?.familia === 'Debian' ? 'Debian' : 'Amazon Linux';
};

/* ===================================================== cambios de estado */

function tablaModal(filas, columnas) {
  return h(
    'table',
    { class: 'cx-tabla__tabla' },
    h('thead', {}, h('tr', {}, columnas.map((c) => h('th', {}, h('span', { class: 'cx-tabla__orden' }, c))))),
    h('tbody', {}, filas.map((f) => h('tr', {}, f.map((c) => h('td', {}, c)))))
  );
}

const idCopiable = (i) => h('span', { class: 'cx-copiable' }, ui.copiable(i.id, { soloIcono: true }), h('span', { class: 'cx-enlace' }, conNombre(i)));

function detener(cx, insts) {
  const omitir = { valor: false };
  cx.confirmar({
    titulo: 'Stop instance',
    textoBoton: 'Stop',
    ancho: 'grande',
    contenido: [
      h('p', { class: 'cx-texto-sec' }, 'Stopping your instance allows you to reduce costs, modify settings, and troubleshoot problems.'),
      tablaModal(
        insts.map((i) => [idCopiable(i), 'Disabled', ['running', 'pending'].includes(i.estado) ? ui.estado('exito', 'Can stop') : ui.estado('error', `Instance is ${i.estado}`)]),
        ['Instance ID', 'Stop protection', 'Result']
      ),
      ui.expandible({ titulo: 'Associated resources', descripcion: 'You will continue to incur charges for these resources while the instance is stopped', contenido: h('p', { class: 'cx-texto-sec' }, 'EBS volumes and Elastic IP addresses stay allocated to your account.') }),
      ui.alerta({ tipo: 'aviso', titulo: 'You will be billed for associated resources', contenido: 'After you stop the instance, you are no longer charged usage or data transfer fees for it. However, you will still be billed for associated Elastic IP addresses and EBS volumes.' }),
      ui.campo({ etiqueta: 'Skip OS shutdown', descripcion: 'This option skips the graceful OS shutdown process. Use only when your instance must be stopped immediately, such as during an emergency or failover.', control: ui.casilla({ etiqueta: 'Skip OS shutdown', alCambiar: (v) => (omitir.valor = v) }) })
    ],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'EC2', accion: 'StopInstances', error: 'Failed to stop the instance' }, (e) => insts.forEach((i) => detenerInstancia(e, i.id)), { atomico: true });
      if (r.ok) cx.flash({ tipo: 'exito', texto: `Successfully stopped ${insts.map((i) => i.id).join(', ')}` });
    }
  });
}

function iniciar(cx, insts) {
  const r = cx.hacer({ servicio: 'EC2', accion: 'StartInstances', error: 'Failed to start the instance' }, (e) => insts.forEach((i) => iniciarInstancia(e, i.id)), { atomico: true });
  if (r.ok) cx.flash({ tipo: 'exito', texto: `Successfully started ${insts.map((i) => i.id).join(', ')}` });
}

function reiniciar(cx, insts) {
  cx.confirmar({
    titulo: 'Reboot instance?',
    textoBoton: 'Reboot',
    contenido: [h('p', {}, 'Are you sure you want to reboot these instances?'), h('ul', {}, insts.map((i) => h('li', {}, conNombre(i))))],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'EC2', accion: 'RebootInstances', error: 'Failed to reboot the instance' }, (e) => insts.forEach((i) => reiniciarInstancia(e, i.id)), { atomico: true });
      if (r.ok) cx.flash({ tipo: 'exito', texto: `Successfully rebooted ${insts.map((i) => i.id).join(', ')}` });
    }
  });
}

function terminar(cx, insts) {
  cx.confirmar({
    titulo: 'Terminate (delete) instance',
    textoBoton: 'Terminate (delete)',
    ancho: 'grande',
    contenido: [
      ui.alerta({ tipo: 'aviso', contenido: 'On an EBS-backed instance, the default action is for the root EBS volume to be deleted when the instance is terminated. Storage on any local drives will be lost.' }),
      h('b', {}, 'Are you sure you want to terminate these instances?'),
      tablaModal(insts.map((i) => [idCopiable(i), ui.estado('exito', 'Disabled')]), ['Instance ID', 'Termination protection']),
      h('p', {}, 'To confirm that you want to delete the instances, choose the terminate button below. Instances with termination protection enabled will not be terminated. Terminating the instance cannot be undone.'),
      ui.campo({ etiqueta: 'Skip OS shutdown', descripcion: 'This option skips the graceful OS shutdown process. Use only when your instance must be stopped immediately, such as during an emergency or failover.', control: ui.casilla({ etiqueta: 'Skip OS shutdown' }) })
    ],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'EC2', accion: 'TerminateInstances', error: 'Failed to terminate the instance' }, (e) => insts.forEach((i) => terminarInstancia(e, i.id)), { atomico: true });
      if (r.ok) cx.flash({ tipo: 'exito', texto: `Successfully initiated termination (deletion) of ${insts.map((i) => i.id).join(', ')}` });
    }
  });
}

function menuEstado(cx, sel) {
  const hay = (...estados) => sel.some((i) => estados.includes(i.estado));
  return ui.menuBoton('Instance state', () => [
    { texto: 'Stop instance', escribe: true, desactivado: !hay('running', 'pending'), alClic: () => detener(cx, sel.filter((i) => ['running', 'pending'].includes(i.estado))) },
    { texto: 'Start instance', escribe: true, desactivado: !hay('stopped'), alClic: () => iniciar(cx, sel.filter((i) => i.estado === 'stopped')) },
    { texto: 'Reboot instance', escribe: true, desactivado: !hay('running'), alClic: () => reiniciar(cx, sel.filter((i) => i.estado === 'running')) },
    { texto: 'Hibernate instance', desactivado: true },
    { texto: 'Terminate (delete) instance', escribe: true, desactivado: !sel.some((i) => i.estado !== 'terminated'), alClic: () => terminar(cx, sel.filter((i) => i.estado !== 'terminated')) }
  ], { desactivado: !sel.length });
}

function menuAcciones(cx, sel) {
  const uno = sel.length === 1 ? sel[0] : null;
  const vivo = uno && uno.estado !== 'terminated';
  const ir = (sub) => () => cx.ir(`ec2/instancias/${uno.id}/${sub}`);
  return ui.menuBoton('Actions', () => [
    { texto: 'Connect', desactivado: !vivo, alClic: ir('conectar') },
    { texto: 'View details', desactivado: !uno, alClic: () => cx.ir(`ec2/instancias/${uno.id}`) },
    { texto: 'Manage instance state', desactivado: true },
    { texto: 'Instance settings', desactivado: !vivo, items: [
      { texto: 'Change instance type', alClic: ir('tipo'), escribe: true },
      { texto: 'Change termination protection', desactivado: true },
      { texto: 'Change stop protection', desactivado: true },
      { texto: 'Edit user data', alClic: ir('user-data'), escribe: true },
      { texto: 'Edit instance tags', alClic: () => cx.ir(`ec2/etiquetas/${uno.id}`), escribe: true },
      { texto: 'Attach to Auto Scaling Group', desactivado: true }
    ] },
    { texto: 'Networking', desactivado: !vivo, items: [
      { texto: 'Manage IP addresses', desactivado: true },
      { texto: 'Attach network interface', desactivado: true },
      { texto: 'Change source/destination check', desactivado: true }
    ] },
    { texto: 'Security', desactivado: !vivo, items: [
      { texto: 'Change security groups', alClic: ir('grupos'), escribe: true },
      { texto: 'Get Windows password', desactivado: true },
      { texto: 'Modify IAM role', alClic: ir('rol'), escribe: true }
    ] },
    { texto: 'Image and templates', desactivado: !vivo, items: [
      { texto: 'Create image', desactivado: true },
      { texto: 'Create template from instance', desactivado: true },
      { texto: 'Launch more like this', desactivado: true }
    ] },
    { texto: 'Monitor and troubleshoot', desactivado: !uno, items: [
      { grupo: 'Monitor', items: [
        { texto: 'Manage detailed monitoring', desactivado: true },
        { texto: 'Manage CloudWatch alarms', desactivado: true }
      ] },
      { grupo: 'Troubleshoot', items: [
        { texto: 'Get system log', alClic: ir('log') },
        { texto: 'Get instance screenshot', desactivado: true },
        { texto: 'Connect to serial port', desactivado: true }
      ] }
    ] }
  ], { desactivado: !sel.length });
}

/* ===================================================== pestañas de detalle */

function abrirDireccion(cx, host) {
  return [' | ', ui.enlace('open address', () => cx.navegador(`https://${host}`), { externo: true })];
}

function paresResumen(cx, i) {
  const a = amiDe(i.ami);
  const eip = cx.estado.eips.find((e) => e.instanciaId === i.id);
  return ui.pares(
    [
      { etiqueta: 'Instance ID', valor: ui.copiable(i.id) },
      { etiqueta: 'Public IPv4 address', info: 'ip-publica', valor: i.ipPublica ? h('span', {}, ui.copiable(i.ipPublica), abrirDireccion(cx, i.ipPublica)) : '–' },
      { etiqueta: 'Private IPv4 addresses', valor: ui.copiable(i.ipPrivada) },
      { etiqueta: 'IPv6 address', valor: '–' },
      { etiqueta: 'Instance state', info: 'estado-instancia', valor: estadoInstancia(i) },
      { etiqueta: 'Public DNS', valor: i.ipPublica ? h('span', {}, ui.copiable(dnsPublico(i.ipPublica)), abrirDireccion(cx, dnsPublico(i.ipPublica))) : '–' },
      { etiqueta: 'Hostname type', valor: `IP name: ${dnsPrivado(i.ipPrivada)}` },
      { etiqueta: 'Private IP DNS name (IPv4 only)', valor: ui.copiable(dnsPrivado(i.ipPrivada)) },
      { etiqueta: 'Instance type', valor: i.tipo },
      { etiqueta: 'Elastic IP addresses', valor: eip ? `${eip.ip} [Public IP]` : '–' },
      { etiqueta: 'Auto-assigned IP address', valor: i.ipPublica && !eip ? `${i.ipPublica} [Public IP]` : '–' },
      { etiqueta: 'VPC ID', valor: enlaceRecurso(cx, i.vpcId, { conNombre: true }) },
      { etiqueta: 'IAM Role', info: 'perfil-iam', valor: i.rolIam ?? '–' },
      { etiqueta: 'Subnet ID', valor: enlaceRecurso(cx, i.subredId, { conNombre: true }) },
      { etiqueta: 'Instance ARN', valor: `arn:aws:ec2:us-east-1:${cx.estado.cuenta.id}:instance/${i.id}` },
      { etiqueta: 'Platform', valor: plataforma(i) },
      { etiqueta: 'AMI ID', valor: i.ami },
      { etiqueta: 'AMI name', valor: a?.nombre ?? '–' },
      { etiqueta: 'Key pair assigned at launch', valor: i.llave ?? '–' },
      { etiqueta: 'Launch time', valor: ui.fechaLarga(i.lanzada) },
      { etiqueta: 'Availability Zone', valor: i.az },
      { etiqueta: 'Monitoring', valor: 'disabled' },
      { etiqueta: 'Termination protection', valor: 'Disabled' },
      { etiqueta: 'Stop protection', valor: 'Disabled' }
    ],
    { columnas: 3, cx }
  );
}

function reglasDeInstancia(cx, i, sentido) {
  const filas = [];
  for (const id of i.gruposSeguridad) {
    const g = cx.estado.gruposSeguridad.find((x) => x.id === id);
    for (const r of g?.[sentido] ?? []) filas.push({ r, g });
  }
  return filas;
}

function tablaReglasInstancia(cx, i, sentido) {
  const palabra = sentido === 'entrada' ? 'Source' : 'Destination';
  return ui.tabla(cx, {
    titulo: sentido === 'entrada' ? 'Inbound rules' : 'Outbound rules',
    variante: 'contenedor',
    refrescar: false,
    filas: () => reglasDeInstancia(cx, instDe(cx, i.id) ?? i, sentido),
    clave: (x) => x.r.id,
    filtro: 'Filter rules',
    columnas: [
      { titulo: 'Name', valor: () => '–' },
      { titulo: 'Security group rule ID', valor: (x) => x.r.id },
      { titulo: 'Port range', valor: (x) => ui.textoDe(textoPuertosDe(x.r)) },
      { titulo: 'Protocol', valor: (x) => ({ '-1': 'All', tcp: 'TCP', udp: 'UDP', icmp: 'ICMP' })[x.r.protocolo] },
      { titulo: palabra, valor: (x) => (x.r.origen.startsWith('sg-') ? enlaceRecurso(cx, x.r.origen) : x.r.origen) },
      { titulo: 'Security groups', valor: (x) => enlaceRecurso(cx, x.g.id, { texto: x.g.nombre }) },
      { titulo: 'Description', valor: (x) => x.r.descripcion || '–' }
    ],
    vacio: { titulo: 'No rules', texto: `The security groups of this instance have no ${sentido === 'entrada' ? 'inbound' : 'outbound'} rules.` }
  });
}

const textoPuertosDe = (r) => (r.protocolo === '-1' || r.desde === null ? 'All' : r.protocolo === 'icmp' ? 'All' : r.desde === r.hasta ? String(r.desde) : `${r.desde} - ${r.hasta}`);

function pestanasInstancia(cx, i, st) {
  const ip = (t) => (t ? ui.copiable(t) : '–');
  return ui.pestanas({
    activa: st.pestana,
    alCambiar: (p) => (st.pestana = p),
    pestanas: [
      { id: 'detalles', texto: 'Details', contenido: () => ui.contenedor({ titulo: 'Instance summary', info: 'instancia', cx, plegable: true, cuerpo: paresResumen(cx, i) }) },
      {
        id: 'estado',
        texto: 'Status and alarms',
        contenido: () =>
          ui.contenedor({
            titulo: 'Status checks',
            info: 'chequeos',
            cx,
            descripcion: 'Status checks detect problems that may impair this instance from running your applications.',
            cuerpo:
              i.estado !== 'running'
                ? h('p', { class: 'cx-texto-sec' }, 'Status checks are only available for running instances.')
                : ui.pares(
                    [
                      { etiqueta: 'System status checks', valor: chequeosListos(i) ? ui.estado('exito', 'System reachability check passed') : ui.estado('espera', 'Initializing') },
                      { etiqueta: 'Instance status checks', valor: chequeosListos(i) ? ui.estado('exito', 'Instance reachability check passed') : ui.estado('espera', 'Initializing') },
                      { etiqueta: 'Attached EBS status checks', valor: chequeosListos(i) ? ui.estado('exito', 'Attached EBS reachability check passed') : ui.estado('espera', 'Initializing') }
                    ],
                    { columnas: 3 }
                  )
          })
      },
      { id: 'monitoreo', texto: 'Monitoring', contenido: () => ui.alerta({ tipo: 'info', titulo: 'No disponible en este simulador', contenido: 'Las gráficas de CloudWatch (CPU, red, disco) solo existen en la consola real.' }) },
      {
        id: 'seguridad',
        texto: 'Security',
        contenido: () => [
          ui.contenedor({
            titulo: 'Security details',
            cuerpo: ui.pares(
              [
                { etiqueta: 'IAM Role', valor: i.rolIam ?? '–' },
                { etiqueta: 'Owner ID', valor: cx.estado.cuenta.id },
                { etiqueta: 'Launch time', valor: ui.fechaLarga(i.lanzada) },
                { etiqueta: 'Security groups', info: 'grupo-seguridad', valor: h('div', {}, i.gruposSeguridad.map((g) => h('div', {}, enlaceRecurso(cx, g, { texto: idParentesis(cx.estado.gruposSeguridad.find((x) => x.id === g)) })))) }
              ],
              { columnas: 3, cx }
            )
          }),
          tablaReglasInstancia(cx, i, 'entrada'),
          tablaReglasInstancia(cx, i, 'salida')
        ]
      },
      {
        id: 'red',
        texto: 'Networking',
        contenido: () =>
          ui.contenedor({
            titulo: 'Networking details',
            cuerpo: ui.pares(
              [
                { etiqueta: 'Public IPv4 address', info: 'ip-publica', valor: i.ipPublica ? h('span', {}, ui.copiable(i.ipPublica), abrirDireccion(cx, i.ipPublica)) : '–' },
                { etiqueta: 'Private IPv4 addresses', valor: ip(i.ipPrivada) },
                { etiqueta: 'VPC ID', valor: enlaceRecurso(cx, i.vpcId, { conNombre: true }) },
                { etiqueta: 'Public DNS', valor: i.ipPublica ? ip(dnsPublico(i.ipPublica)) : '–' },
                { etiqueta: 'Private IP DNS name (IPv4 only)', valor: ip(dnsPrivado(i.ipPrivada)) },
                { etiqueta: 'Subnet ID', valor: enlaceRecurso(cx, i.subredId, { conNombre: true }) },
                { etiqueta: 'Availability zone', valor: i.az },
                { etiqueta: 'Elastic IP addresses', valor: cx.estado.eips.filter((e) => e.instanciaId === i.id).map((e) => e.ip).join(', ') || '–' },
                { etiqueta: 'Auto-assign public IP', valor: i.autoIpPublica ? 'Enabled' : 'Disabled' }
              ],
              { columnas: 3, cx }
            )
          })
      },
      {
        id: 'disco',
        texto: 'Storage',
        contenido: () => [
          ui.contenedor({
            titulo: 'Root device details',
            cuerpo: ui.pares(
              [
                { etiqueta: 'Root device name', valor: '/dev/xvda' },
                { etiqueta: 'Root device type', valor: 'EBS' },
                { etiqueta: 'EBS optimization', valor: 'disabled' }
              ],
              { columnas: 3 }
            )
          }),
          ui.tabla(cx, {
            titulo: 'Block devices',
            variante: 'contenedor',
            refrescar: false,
            filas: () => (instDe(cx, i.id)?.volumenes ?? []).map((id) => cx.estado.volumenes.find((v) => v.id === id)).filter(Boolean),
            clave: (v) => v.id,
            filtro: 'Filter block devices',
            columnas: [
              { titulo: 'Volume ID', valor: (v) => ui.enlace(v.id, `ec2/volumenes/${v.id}`, { cx }) },
              { titulo: 'Device name', valor: (v) => v.dispositivo },
              { titulo: 'Volume size (GiB)', valor: (v) => String(v.tamano) },
              { titulo: 'Attachment status', valor: () => ui.estado('exito', 'Attached') },
              { titulo: 'Attachment time', valor: (v) => ui.fecha(v.creado) },
              { titulo: 'Encrypted', valor: (v) => (v.cifrado ? 'Yes' : 'No') },
              { titulo: 'Delete on termination', valor: (v) => (v.eliminarAlTerminar ? 'Yes' : 'No') }
            ],
            vacio: { titulo: 'No block devices' }
          })
        ]
      },
      { id: 'etiquetas', texto: 'Tags', contenido: () => pestanaEtiquetas(cx, i) }
    ]
  });
}

/* ================================================================ lista */

function listaInstancias(cx) {
  cx.migas([{ texto: 'EC2', ruta: 'ec2' }, { texto: 'Instances' }]);
  const st = { pestana: 'detalles' };
  const t = ui.tabla(cx, {
    titulo: 'Instances',
    info: 'instancia',
    filas: () => cx.estado.instancias,
    clave: (i) => i.id,
    seleccion: 'multiple',
    filtro: 'Find Instance by attribute or tag (case-sensitive)',
    ultimaActualizacion: true,
    columnas: [
      { titulo: 'Name', valor: (i) => nombre(i), editable: true },
      { titulo: 'Instance ID', valor: (i) => ui.enlace(i.id, `ec2/instancias/${i.id}`, { cx }) },
      { titulo: 'Instance state', valor: (i) => estadoInstancia(i) },
      { titulo: 'Instance type', valor: (i) => i.tipo },
      { titulo: 'Status check', valor: (i) => chequeoInstancia(i) },
      { titulo: 'Availability Zone', valor: (i) => i.az },
      { titulo: 'Public IPv4 DNS', valor: (i) => (i.ipPublica ? dnsPublico(i.ipPublica) : '–') },
      { titulo: 'Public IPv4 address', valor: (i) => i.ipPublica ?? '–' },
      { titulo: 'Elastic IP', valor: (i) => cx.estado.eips.find((e) => e.instanciaId === i.id)?.ip ?? '–' },
      { titulo: 'Private IP address', valor: (i) => i.ipPrivada },
      { titulo: 'Security group name', valor: (i) => i.gruposSeguridad.map((g) => cx.estado.gruposSeguridad.find((x) => x.id === g)?.nombre ?? g).join(', ') },
      { titulo: 'Key name', valor: (i) => i.llave ?? '–' },
      { titulo: 'Launch time', valor: (i) => ui.fecha(i.lanzada) }
    ],
    acciones: (sel) => [
      ui.boton('Connect', { desactivado: sel.length !== 1 || sel[0].estado === 'terminated', alClic: () => cx.ir(`ec2/instancias/${sel[0].id}/conectar`) }),
      menuEstado(cx, sel),
      menuAcciones(cx, sel),
      ui.boton('Launch instances', { variante: 'primario', iconoDerecha: undefined, alClic: () => cx.ir('ec2/instancias/lanzar') })
    ],
    vacio: { titulo: 'No instances', texto: 'You do not have any instances in this region', accion: ui.boton('Launch instances', { escribe: true, alClic: () => cx.ir('ec2/instancias/lanzar') }) },
    alSeleccionar: () => panel.repintar()
  });
  const panel = cx.vivo(() => {
    const sel = t.seleccion();
    if (sel.length !== 1) return panelVacio(sel.length ? `${sel.length} instances selected` : 'Select an instance');
    const i = sel[0];
    return ui.panelInferior({ titulo: `${i.id}${i.nombre ? ` (${i.nombre})` : ''}`, contenido: pestanasInstancia(cx, i, st) });
  });
  return h('div', { class: 'cx-pagina' }, t, panel);
}

function detalleInstancia(cx, { id }) {
  cx.migas([{ texto: 'EC2', ruta: 'ec2' }, { texto: 'Instances', ruta: 'ec2/instancias' }, { texto: id }]);
  if (!instDe(cx, id)) return noExiste(cx, 'Instance', id, 'ec2/instancias');
  const st = { pestana: 'detalles' };
  return cx.vivo(() => {
    const i = instDe(cx, id);
    if (!i) return noExiste(cx, 'Instance', id, 'ec2/instancias');
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({
        titulo: `Instance summary for ${i.id}${i.nombre ? ` (${i.nombre})` : ''}`,
        info: 'instancia',
        cx,
        descripcion: `Updated less than a minute ago`,
        acciones: [ui.botonRefrescar(() => cx.refrescar()), ui.boton('Connect', { desactivado: i.estado === 'terminated', alClic: () => cx.ir(`ec2/instancias/${i.id}/conectar`) }), menuEstado(cx, [i]), menuAcciones(cx, [i])]
      }),
      pestanasInstancia(cx, i, st)
    );
  });
}

/* ========================================================== lanzar instancia */

const LOGOS = {
  'Amazon Linux': ['#232f3e', 'aws'],
  macOS: ['#555', ''],
  Ubuntu: ['#e95420', 'U'],
  Windows: ['#0078d4', '⊞'],
  'Red Hat': ['#ee0000', 'RH'],
  'SUSE Linux': ['#30ba78', 'S'],
  Debian: ['#a80030', 'D']
};

function siguienteLaunchWizard(estado) {
  let n = 1;
  const nombres = new Set(estado.gruposSeguridad.map((g) => g.nombre));
  while (nombres.has(`launch-wizard-${n}`)) n += 1;
  return n;
}

function lanzar(cx) {
  cx.migas([{ texto: 'EC2', ruta: 'ec2' }, { texto: 'Instances', ruta: 'ec2/instancias' }, { texto: 'Launch an instance' }]);
  const e = cx.estado;
  const vpcDef = e.vpcs.find((v) => v.porDefecto) ?? e.vpcs[0];
  const n = siguienteLaunchWizard(e);
  const ahora = new Date();
  // Si el alumno salió a crear una subred desde aquí («Create new subnet»), se
  // le devuelve lo que llevaba, como la pestaña del asistente que AWS deja abierta.
  const borrador = cx.memoria.borradorLanzar;
  cx.memoria.borradorLanzar = null;
  if (borrador) cx.flash({ tipo: 'info', texto: 'Your launch settings were restored. Select the new subnet in Network settings.' });
  const f = borrador ? { ...borrador, red: { ...borrador.red, editar: true }, errores: {} } : {
    nombre: '',
    familia: 'Amazon Linux',
    ami: 'al2023',
    tipo: 't3.micro',
    llave: null, // null = no eligió; '' = sin par de llaves
    red: { editar: false, vpcId: vpcDef?.id ?? null, subredId: null, ipPublica: null },
    firewall: 'crear',
    grupo: { nombre: `launch-wizard-${n}`, descripcion: `launch-wizard-${n} created ${ahora.toISOString().replace(/\.\d+Z$/, '.000Z')}` },
    reglas: [{ tipo: 'SSH', puertos: '', origenTipo: 'anywhere', origen: '0.0.0.0/0', descripcion: '' }],
    existentes: [],
    discos: [{ tamano: '8', tipo: 'gp3' }],
    userData: '',
    base64: false,
    perfil: '',
    cantidad: '1',
    errores: {}
  };

  const vpcActual = () => e.vpcs.find((v) => v.id === f.red.vpcId);
  const subredActual = () => e.subredes.find((s) => s.id === f.red.subredId);
  const ipPublicaEfectiva = () => (f.red.ipPublica !== null ? f.red.ipPublica : f.red.subredId ? Boolean(subredActual()?.ipPublicaAuto) : true);

  const repintarTodo = () => {
    [secAmi, secTipo, secLlave, secRed, secDisco, secAvanzado].forEach((s) => s.repintar());
    resumen.repintar();
  };
  const cambio = () => resumen.repintar();

  /* ---------- Name and tags */
  const secNombre = ui.contenedor({
    titulo: 'Name and tags',
    info: 'instancia',
    cx,
    cuerpo: ui.campo({
      etiqueta: 'Name',
      control: h('div', { class: 'cx-fila-campos' }, h('div', { style: { flex: '1 1 300px' } }, ui.entrada({ valor: f.nombre, placeholder: 'e.g. My Web Server', alCambiar: (v) => ((f.nombre = v), cambio()) })), ui.enlace('Add additional tags', () => cx.flash({ tipo: 'info', texto: 'En el simulador solo se usa la etiqueta Name.' })))
    })
  });

  /* ---------- AMI */
  const secAmi = ui.region(() => {
    const familias = ['Amazon Linux', 'macOS', 'Ubuntu', 'Windows', 'Red Hat', 'SUSE Linux', 'Debian'];
    const deFamilia = AMIS.filter((a) => a.familia === f.familia);
    const a = amiDe(f.ami);
    return ui.contenedor({
      titulo: 'Application and OS Images (Amazon Machine Image)',
      info: 'ami',
      cx,
      plegable: true,
      descripcion: 'An AMI contains the operating system, application server, and applications for your instance. If you don’t see a suitable AMI below, use the search field or choose Browse more AMIs.',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.entrada({ placeholder: 'Search our full catalog including 1000s of application and OS images', buscar: true, desactivado: true }),
        ui.pestanas({ activa: 'rapido', pestanas: [{ id: 'recientes', texto: 'Recents', desactivada: true, contenido: () => null }, { id: 'rapido', texto: 'Quick Start', contenido: () => null }] }),
        h(
          'div',
          { class: 'cx-mosaicos', role: 'radiogroup', 'aria-label': 'Quick Start AMIs' },
          familias.map((fam) => {
            const hay = AMIS.some((x) => x.familia === fam);
            const [color, letra] = LOGOS[fam];
            return h(
              'button',
              {
                type: 'button',
                role: 'radio',
                'aria-checked': f.familia === fam ? 'true' : 'false',
                class: ['cx-mosaico', f.familia === fam && 'cx-mosaico--activo'],
                disabled: !hay,
                title: hay ? fam : `${fam} (not available in this simulator)`,
                onclick: () => {
                  f.familia = fam;
                  f.ami = AMIS.find((x) => x.familia === fam).clave;
                  f.discos[0].tamano = String(amiDe(f.ami).discoMinimo);
                  repintarTodo();
                }
              },
              h('span', {}, fam),
              h('span', { class: 'cx-mosaico__logo', style: { background: color } }, letra)
            );
          })
        ),
        ui.campo({
          etiqueta: 'Amazon Machine Image (AMI)',
          control: ui.selector({
            opciones: deFamilia.map((x) => ({ valor: x.clave, etiqueta: x.nombre, descripcion: `${x.id} (64-bit (x86)) · Virtualization: hvm · ENA enabled: true · Root device type: ebs`, etiquetaDerecha: x.capaGratuita ? 'Free tier eligible' : undefined })),
            valor: f.ami,
            alCambiar: (v) => {
              f.ami = v;
              f.discos[0].tamano = String(amiDe(v).discoMinimo);
              repintarTodo();
            }
          })
        }),
        ui.campo({ etiqueta: 'Description', control: h('div', {}, a?.descripcion ?? '') }),
        ui.pares(
          [
            { etiqueta: 'Architecture', valor: '64-bit (x86)' },
            { etiqueta: 'Boot mode', valor: 'uefi-preferred' },
            { etiqueta: 'AMI ID', valor: a?.id },
            { etiqueta: 'Username', valor: a?.usuario },
            { etiqueta: '', valor: h('span', { class: 'cx-insignia' }, 'Verified provider') }
          ],
          { columnas: 5 }
        )
      )
    });
  });

  /* ---------- Instance type */
  const secTipo = ui.region(() =>
    ui.contenedor({
      titulo: 'Instance type',
      info: 'tipo-instancia',
      cx,
      plegable: true,
      cuerpo: h(
        'div',
        { class: 'cx-fila-campos', style: { alignItems: 'flex-start' } },
        ui.campo({
          etiqueta: 'Instance type',
          control: ui.selector({
            opciones: TIPOS_INSTANCIA.map((t) => ({
              valor: t.tipo,
              etiqueta: t.tipo,
              etiquetaDerecha: t.capaGratuita ? 'Free tier eligible' : undefined,
              etiquetas: [`Family: ${t.familia}`, `${t.vcpu} vCPU`, `${t.memoria} GiB Memory`, 'Current generation: true', `On-Demand Linux base pricing: ${t.precio} USD per Hour`]
            })),
            valor: f.tipo,
            filtrar: true,
            alCambiar: (v) => ((f.tipo = v), cambio())
          })
        }),
        h('div', { style: { flex: '0 0 auto', paddingTop: '26px', display: 'flex', flexDirection: 'column', gap: '6px' } }, ui.interruptor({ etiqueta: 'All generations', desactivado: true }), ui.enlace('Compare instance types', 'ec2/tipos', { cx }))
      )
    })
  );

  /* ---------- Key pair */
  const secLlave = ui.region(() =>
    ui.contenedor({
      titulo: 'Key pair (login)',
      info: 'par-llaves',
      cx,
      plegable: true,
      descripcion: 'You can use a key pair to securely connect to your instance. Ensure that you have access to the selected key pair before you launch the instance.',
      cuerpo: h(
        'div',
        { class: 'cx-fila-campos' },
        ui.campo({
          etiqueta: 'Key pair name',
          requerido: true,
          control: ui.selector({
            opciones: [{ valor: '', etiqueta: 'Proceed without a key pair (Not recommended)', etiquetaDerecha: 'Default value' }, ...e.llaves.map((k) => ({ valor: k.nombre, etiqueta: k.nombre, descripcion: `Type: ${k.tipo}` }))],
            valor: f.llave,
            filtrar: true,
            placeholder: 'Select',
            alCambiar: (v) => {
              f.llave = v;
              f.errores.llave = null;
              secLlave.repintar();
              cambio();
            }
          }),
          error: f.errores.llave
        }),
        h('div', { style: { flex: '0 0 auto', marginBottom: f.errores.llave ? '22px' : '4px' } }, ui.boton('Create new key pair', { variante: 'texto', icono: 'refresh', escribe: true, alClic: () => modalLlave() }))
      )
    })
  );

  function modalLlave() {
    const k = { nombre: '', tipo: 'rsa', formato: 'pem', error: null };
    const form = ui.region(() => formularioLlave(cx, k));
    const m = cx.modal({
      titulo: 'Create key pair',
      contenido: [form, ui.alerta({ tipo: 'info', contenido: 'When prompted, store the private key in a secure and accessible location on your computer. You will need it later to connect to your instance.' })],
      pie: [
        ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
        ui.boton('Create key pair', {
          variante: 'primario',
          alClic: () => {
            const llave = crearLlaveYDescargar(cx, k);
            if (!llave) return form.repintar();
            f.llave = llave.nombre;
            f.errores.llave = null;
            m.cerrar();
            secLlave.repintar();
            cambio();
          }
        })
      ]
    });
  }

  /* ---------- Network settings */
  const tieneRegla = (tipo) => f.reglas.find((r) => r.tipo === tipo && (tipo === 'SSH' || r.origen === '0.0.0.0/0'));
  const alternarRegla = (tipo, si) => {
    if (si && !tieneRegla(tipo)) f.reglas.push({ tipo, puertos: '', origenTipo: 'anywhere', origen: '0.0.0.0/0', descripcion: '' });
    if (!si) f.reglas = f.reglas.filter((r) => r.tipo !== tipo);
    secRed.repintar();
    cambio();
  };

  function vistaRedSimple() {
    const ssh = tieneRegla('SSH');
    const sub = subredActual();
    return [
      ui.campo({ etiqueta: 'Network', info: 'vpc', cx, control: h('div', {}, f.red.vpcId ?? '–') }),
      ui.campo({ etiqueta: 'Subnet', info: 'subred', cx, control: h('div', {}, sub ? idParentesis(sub) : 'No preference (Default subnet in any availability zone)') }),
      ui.campo({ etiqueta: 'Auto-assign public IP', info: 'ip-publica', cx, control: h('div', {}, ipPublicaEfectiva() ? 'Enable' : 'Disable') }),
      firewall(() => [
        h('p', {}, `We'll create a new security group called '${f.grupo.nombre}' with the following rules:`),
        h(
          'div',
          { class: 'cx-fila-campos', style: { alignItems: 'flex-start' } },
          h('div', { style: { flex: '1 1 260px' } }, ui.casilla({ etiqueta: 'Allow SSH traffic from', descripcion: 'Helps you connect to your instance', marcada: Boolean(ssh), alCambiar: (v) => alternarRegla('SSH', v) })),
          h(
            'div',
            { style: { flex: '1 1 260px' } },
            ui.selector({
              desactivado: !ssh,
              valor: ssh?.origenTipo ?? 'anywhere',
              opciones: [
                { valor: 'anywhere', etiqueta: 'Anywhere', descripcion: '0.0.0.0/0' },
                { valor: 'custom', etiqueta: 'Custom', descripcion: ssh?.origenTipo === 'custom' ? ssh.origen || 'Enter a CIDR block' : 'Enter a CIDR block' },
                { valor: 'myip', etiqueta: 'My IP', descripcion: `${e.cuenta.ipCasa}/32` }
              ],
              alCambiar: (v) => {
                ssh.origenTipo = v;
                ssh.origen = v === 'anywhere' ? '0.0.0.0/0' : v === 'myip' ? `${e.cuenta.ipCasa}/32` : '';
                secRed.repintar();
                cambio();
              }
            }),
            ssh?.origenTipo === 'custom' ? h('div', { style: { marginTop: '6px' } }, ui.entrada({ valor: ssh.origen, placeholder: 'CIDR, for example 203.0.113.0/24', alCambiar: (v) => ((ssh.origen = v), cambio()) })) : null
          )
        ),
        ui.casilla({ etiqueta: 'Allow HTTPS traffic from the internet', descripcion: 'To set up an endpoint, for example when creating a web server', marcada: Boolean(tieneRegla('HTTPS')), alCambiar: (v) => alternarRegla('HTTPS', v) }),
        ui.casilla({ etiqueta: 'Allow HTTP traffic from the internet', descripcion: 'To set up an endpoint, for example when creating a web server', marcada: Boolean(tieneRegla('HTTP')), alCambiar: (v) => alternarRegla('HTTP', v) }),
        abreATodos(f.reglas) ? ui.alerta({ tipo: 'aviso', cerrable: true, contenido: 'Rules with source of 0.0.0.0/0 allow all IP addresses to access your instance. We recommend setting security group rules to allow access from known IP addresses only.' }) : null
      ])
    ];
  }

  function firewall(contenidoCrear) {
    const grupos = e.gruposSeguridad.filter((g) => g.vpcId === f.red.vpcId);
    return h(
      'div',
      { class: 'cx-form' },
      ui.campo({
        etiqueta: 'Firewall (security groups)',
        info: 'grupo-seguridad',
        cx,
        descripcion: 'A security group is a set of firewall rules that control the traffic for your instance. Add rules to allow specific traffic to reach your instance.',
        control: ui.tarjetas({
          valor: f.firewall,
          opciones: [{ valor: 'crear', etiqueta: 'Create security group' }, { valor: 'existente', etiqueta: 'Select existing security group' }],
          alCambiar: (v) => {
            f.firewall = v;
            f.errores.grupos = null;
            secRed.repintar();
            cambio();
          }
        })
      }),
      f.firewall === 'crear'
        ? contenidoCrear()
        : ui.campo({
            etiqueta: 'Common security groups',
            info: 'grupo-seguridad',
            cx,
            control: ui.selector({
              multiple: true,
              valores: f.existentes,
              filtrar: true,
              placeholder: 'Select security groups',
              opciones: grupos.map((g) => ({ valor: g.id, etiqueta: `${g.nombre} ${g.id}`, descripcion: `VPC: ${g.vpcId}` })),
              alCambiar: (v) => {
                f.existentes = v;
                f.errores.grupos = null;
                cambio();
              }
            }),
            error: f.errores.grupos,
            restriccion: 'Security groups that you add or remove here will be added to or removed from all your network interfaces.'
          })
    );
  }

  function vistaRedEditar() {
    const vpc = vpcActual();
    const subredes = e.subredes.filter((s) => s.vpcId === f.red.vpcId);
    const esDefecto = Boolean(vpc?.porDefecto);
    return [
      ui.campo({
        etiqueta: 'VPC',
        requerido: true,
        info: 'vpc',
        cx,
        control: ui.selector({
          opciones: opcionesVpc(e),
          valor: f.red.vpcId,
          filtrar: true,
          alCambiar: (v) => {
            f.red.vpcId = v;
            const nueva = e.vpcs.find((x) => x.id === v);
            f.red.subredId = nueva?.porDefecto ? null : e.subredes.find((s) => s.vpcId === v)?.id ?? null;
            f.red.ipPublica = null;
            f.existentes = [];
            f.reglas.forEach((r) => String(r.origen).startsWith('sg-') && (r.origen = ''));
            secRed.repintar();
            cambio();
          }
        })
      }),
      ui.campo({
        etiqueta: 'Subnet',
        info: 'subred',
        cx,
        control: ui.selector({
          opciones: [...(esDefecto ? [{ valor: '', etiqueta: 'No preference', descripcion: 'Default subnet in any availability zone' }] : []), ...subredes.map((s) => opcionSubred(e, s))],
          valor: f.red.subredId ?? (esDefecto ? '' : null),
          filtrar: true,
          placeholder: subredes.length ? 'Select' : 'No subnets found in this VPC',
          vacio: 'No subnets found in this VPC',
          alCambiar: (v) => {
            f.red.subredId = v || null;
            f.red.ipPublica = null;
            f.errores.subred = null;
            secRed.repintar();
            cambio();
          }
        }),
        error: f.errores.subred,
        restriccion:
          !esDefecto && !subredes.length
            ? h(
                'span',
                {},
                'This VPC has no subnets yet. ',
                ui.enlace(
                  'Create new subnet',
                  () => {
                    cx.memoria.borradorLanzar = f;
                    cx.ir('vpc/subredes/crear');
                  },
                  { externo: true }
                ),
                ' — your launch settings are kept for when you come back.'
              )
            : null
      }),
      ui.campo({
        etiqueta: 'Auto-assign public IP',
        info: 'ip-publica',
        cx,
        control: ui.selector({
          opciones: [{ valor: 'si', etiqueta: 'Enable' }, { valor: 'no', etiqueta: 'Disable' }],
          valor: ipPublicaEfectiva() ? 'si' : 'no',
          alCambiar: (v) => ((f.red.ipPublica = v === 'si'), cambio())
        })
      }),
      firewall(() => [
        ui.campo({ etiqueta: 'Security group name', requerido: true, control: ui.entrada({ valor: f.grupo.nombre, alCambiar: (v) => ((f.grupo.nombre = v), cambio()) }), error: f.errores.grupoNombre, restriccion: 'This security group will be added to all network interfaces. The name can’t be edited after the security group is created. Max length is 255 characters. Valid characters: a-z, A-Z, 0-9, spaces, and ._-:/()#,@[]+=&;{}!$*' }),
        ui.campo({ etiqueta: 'Description', requerido: true, control: ui.entrada({ valor: f.grupo.descripcion, alCambiar: (v) => (f.grupo.descripcion = v) }), error: f.errores.grupoDesc }),
        ui.campo({ etiqueta: 'Inbound Security Group Rules', info: 'reglas-sg', cx, control: editorReglasSg(cx, { filas: f.reglas, vpcId: f.red.vpcId, sentido: 'entrada', alCambiar: cambio }) })
      ])
    ];
  }

  const secRed = ui.region(() =>
    ui.contenedor({
      titulo: 'Network settings',
      info: 'red-instancia',
      cx,
      plegable: true,
      acciones: f.red.editar ? null : ui.boton('Edit', { alClic: () => ((f.red.editar = true), secRed.repintar()) }),
      cuerpo: h('div', { class: 'cx-form' }, f.red.editar ? vistaRedEditar() : vistaRedSimple())
    })
  );

  /* ---------- Storage */
  const secDisco = ui.region(() => {
    const a = amiDe(f.ami);
    const total = f.discos.reduce((s, d) => s + (Number(d.tamano) || 0), 0);
    return ui.contenedor({
      titulo: 'Configure storage',
      info: 'almacenamiento',
      cx,
      plegable: true,
      acciones: h('span', { class: 'cx-enlace cx-enlace--apagado' }, 'Advanced'),
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        f.discos.map((d, i) =>
          h(
            'div',
            { class: 'cx-fila-campos', style: { alignItems: 'center', flexWrap: 'nowrap' } },
            h('span', {}, '1x'),
            h('div', { style: { width: '90px' } }, ui.entrada({ tipo: 'number', valor: d.tamano, etiquetaAccesible: 'Size (GiB)', alCambiar: (v) => ((d.tamano = v), cambio()) })),
            h('span', {}, 'GiB'),
            h('div', { style: { width: '120px' } }, ui.selector({ opciones: TIPOS_VOLUMEN.map((t) => ({ valor: t.tipo, etiqueta: t.tipo, descripcion: t.nombre })), valor: d.tipo, ancho: 260, alCambiar: (v) => ((d.tipo = v), secDisco.repintar(), cambio()) })),
            h('span', { class: 'cx-texto-sec' }, i === 0 ? `Root volume, ${d.tipo === 'gp3' ? '3000 IOPS, ' : ''}Not encrypted` : `EBS volume, ${d.tipo === 'gp3' ? '3000 IOPS, ' : ''}Not encrypted`),
            i > 0 ? ui.boton('Remove', { alClic: () => (f.discos.splice(i, 1), secDisco.repintar(), cambio()) }) : null
          )
        ),
        total > 30 ? null : ui.alerta({ tipo: 'info', contenido: `Free tier eligible customers can get up to 30 GB of EBS General Purpose (SSD) or Magnetic storage.` }),
        Number(f.discos[0].tamano) < (a?.discoMinimo ?? 8) ? ui.alerta({ tipo: 'aviso', contenido: `The selected AMI requires a root volume of at least ${a.discoMinimo} GiB.` }) : null,
        h('div', {}, ui.boton('Add new volume', { alClic: () => (f.discos.push({ tamano: '8', tipo: 'gp3' }), secDisco.repintar(), cambio()) })),
        h('p', { class: 'cx-texto-sec' }, '0 x File systems')
      )
    });
  });

  /* ---------- Advanced details */
  const secAvanzado = ui.region(() =>
    ui.contenedor({
      titulo: 'Advanced details',
      info: 'user-data',
      cx,
      plegable: true,
      abierto: f.avanzadoAbierto ?? false,
      alAlternar: (a) => (f.avanzadoAbierto = a),
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({ etiqueta: 'Domain join directory', control: ui.selector({ opciones: [], placeholder: 'Select', desactivado: true }) }),
        ui.campo({
          etiqueta: 'IAM instance profile',
          info: 'perfil-iam',
          cx,
          control: ui.selector({
            opciones: [{ valor: '', etiqueta: 'Select' }, ...e.iam.roles.map((r) => ({ valor: r.nombre, etiqueta: r.nombre, descripcion: r.arn.replace(':role/', ':instance-profile/') }))],
            valor: f.perfil,
            filtrar: true,
            vacio: 'No IAM roles',
            alCambiar: (v) => (f.perfil = v)
          })
        }),
        ui.campo({ etiqueta: 'Hostname type', control: ui.selector({ opciones: [{ valor: 'ip', etiqueta: 'IP name' }], valor: 'ip', desactivado: true }) }),
        ui.campo({ etiqueta: 'Instance auto-recovery', control: ui.selector({ opciones: [{ valor: 'd', etiqueta: 'Default' }], valor: 'd', desactivado: true }) }),
        ui.campo({ etiqueta: 'Shutdown behavior', control: ui.selector({ opciones: [{ valor: 'stop', etiqueta: 'Stop' }], valor: 'stop', desactivado: true }) }),
        ui.campo({ etiqueta: 'Termination protection', control: ui.selector({ opciones: [{ valor: 'd', etiqueta: 'Disable' }], valor: 'd', desactivado: true }) }),
        ui.campo({ etiqueta: 'Detailed CloudWatch monitoring', control: ui.selector({ opciones: [{ valor: 'd', etiqueta: 'Disable' }], valor: 'd', desactivado: true }) }),
        ui.campo({
          etiqueta: 'User data',
          opcional: true,
          info: 'user-data',
          cx,
          descripcion: 'Upload a file with your user data or enter it in the field.',
          control: h(
            'div',
            { class: 'cx-form' },
            h('div', {}, ui.boton('Choose file', { icono: 'upload', desactivado: true })),
            ui.area({ valor: f.userData, filas: 10, monoespaciado: true, etiquetaAccesible: 'User data', alCambiar: (v) => (f.userData = v) }),
            ui.casilla({ etiqueta: 'User data has already been base64 encoded', marcada: f.base64, alCambiar: (v) => (f.base64 = v) })
          )
        })
      )
    })
  );

  /* ---------- Summary */
  const resumen = ui.region(() => {
    const a = amiDe(f.ami);
    const t = tipoInstancia(f.tipo);
    const fw = f.firewall === 'crear' ? 'New security group' : f.existentes.map((id) => e.gruposSeguridad.find((g) => g.id === id)?.nombre).filter(Boolean).join(', ') || '–';
    const total = f.discos.reduce((s, d) => s + (Number(d.tamano) || 0), 0);
    return h(
      'section',
      { class: 'cx-contenedor' },
      h('div', { class: 'cx-contenedor__cabeza' }, h('h2', { class: 'cx-h2' }, ui.icono('caret-down'), 'Summary')),
      h(
        'div',
        { class: 'cx-contenedor__cuerpo' },
        ui.campo({ etiqueta: 'Number of instances', info: 'instancia', cx, control: ui.entrada({ tipo: 'number', valor: f.cantidad, min: 1, max: 5, alCambiar: (v) => (f.cantidad = v) }) }),
        h(
          'dl',
          { class: 'cx-resumen' },
          h('dt', {}, 'Software Image (AMI)'),
          h('dd', {}, a?.nombre, h('br'), h('small', { class: 'cx-texto-sec' }, a?.id)),
          h('dt', {}, 'Virtual server type (instance type)'),
          h('dd', {}, t?.tipo),
          h('dt', {}, 'Firewall (security group)'),
          h('dd', {}, fw),
          h('dt', {}, 'Storage (volumes)'),
          h('dd', {}, `${f.discos.length} volume(s) - ${total} GiB`)
        ),
        (a?.capaGratuita && t?.capaGratuita) || true
          ? h('div', { style: { marginTop: '16px' } }, ui.alerta({ tipo: 'info', cerrable: true, contenido: 'Free tier: In your first year of opening an AWS account, you get 750 hours per month of t2.micro instance usage (or t3.micro where t2.micro isn’t available) when used with free tier AMIs, 750 hours per month of public IPv4 address usage, 30 GiB of EBS storage, 2 million I/Os, 1 GB of snapshots, and 100 GB of bandwidth to the internet.' }))
          : null
      ),
      h(
        'div',
        { class: 'cx-contenedor__pie', style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' } },
        ui.boton('Cancel', { variante: 'texto', alClic: () => cx.ir('ec2/instancias') }),
        ui.boton('Launch instance', { variante: 'primario', alClic: lanzarYa }),
        h('div', { style: { width: '100%', textAlign: 'right' } }, ui.boton('Preview code', { variante: 'texto', desactivado: true }))
      )
    );
  });

  function lanzarYa() {
    // Lo que la consola revisa en el navegador antes de llamar a AWS.
    f.errores = {};
    if (f.llave === null) f.errores.llave = 'Key pair name is required. Select a key pair, create a new one, or choose «Proceed without a key pair».';
    const vpc = vpcActual();
    if (vpc && !vpc.porDefecto && !f.red.subredId) {
      f.errores.subred = 'Subnet is required for this VPC. Select a subnet.';
      f.red.editar = true;
    }
    if (f.firewall === 'existente' && !f.existentes.length) f.errores.grupos = 'You must select at least one security group.';
    if (f.firewall === 'crear' && !f.grupo.nombre.trim()) {
      f.errores.grupoNombre = 'Security group name is required';
      f.red.editar = true;
    }
    if (f.firewall === 'crear' && !f.grupo.descripcion.trim()) {
      f.errores.grupoDesc = 'Description is required';
      f.red.editar = true;
    }
    if (Object.values(f.errores).some(Boolean)) {
      repintarTodo();
      setTimeout(() => cx.raiz.querySelector('.cx-campo--error')?.scrollIntoView({ block: 'center' }), 0);
      return;
    }
    let userData = f.userData;
    if (f.base64 && userData.trim()) {
      try {
        userData = decodeURIComponent(escape(atob(userData.replace(/\s+/g, ''))));
      } catch {
        userData = '(invalid base64 user data)';
      }
    }
    const r = cx.hacer(
      { servicio: 'EC2', accion: 'RunInstances', error: 'Instance launch failed' },
      (est) =>
        lanzarInstancias(est, {
          nombre: f.nombre,
          ami: f.ami,
          tipo: f.tipo,
          llave: f.llave || null,
          subredId: f.red.subredId,
          ipPublica: ipPublicaEfectiva(),
          gruposSeguridad: f.firewall === 'existente' ? f.existentes : [],
          nuevoGrupo: f.firewall === 'crear' ? { nombre: f.grupo.nombre.trim(), descripcion: f.grupo.descripcion, entrada: f.reglas.map(reglaDeFila) } : undefined,
          volumenes: f.discos.map((d, i) => ({ tamano: Number(d.tamano), tipo: d.tipo, eliminarAlTerminar: i === 0 })),
          userData,
          perfilIam: f.perfil || null,
          cantidad: Number(f.cantidad) || 1
        }),
      { atomico: true }
    );
    if (r.ok) {
      cx.memoria.lanzadas = r.valor.map((i) => i.id);
      cx.ir('ec2/instancias/lanzada');
    }
  }

  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Launch an instance', info: 'instancia', cx, descripcion: 'Amazon EC2 allows you to create virtual machines, or instances, that run on the AWS Cloud. Quickly get started by following the simple steps below.' }),
    h('div', { class: 'cx-dos-columnas' }, h('div', { class: 'cx-pagina' }, secNombre, secAmi, secTipo, secLlave, secRed, secDisco, secAvanzado), h('div', { class: 'cx-lado' }, resumen))
  );
}

function lanzada(cx) {
  cx.migas([{ texto: 'EC2', ruta: 'ec2' }, { texto: 'Instances', ruta: 'ec2/instancias' }, { texto: 'Launch an instance' }]);
  const ids = cx.memoria.lanzadas ?? [];
  return h(
    'div',
    { class: 'cx-pagina' },
    h(
      'div',
      { class: 'cx-flash cx-flash--exito' },
      ui.icono('status-positive'),
      h('div', { class: 'cx-flash__cuerpo' }, h('div', { class: 'cx-flash__titulo' }, 'Success'), h('div', {}, 'Successfully initiated launch of instance (', ids.map((id, k) => [k ? ', ' : '', ui.enlace(id, `ec2/instancias/${id}`, { cx })]), ')'))
    ),
    ui.expandible({ titulo: 'Launch log', fuerte: true, contenido: h('ul', { class: 'cx-pasos' }, ['Initializing requests', 'Creating security groups', 'Creating security group rules', 'Launch initiation'].map((p) => h('li', {}, ui.estado('exito', 'Succeeded'), p))) }),
    ui.contenedor({
      titulo: 'Next Steps',
      cuerpo: h(
        'div',
        { class: 'cx-inicio__atajos', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' } },
        [
          ['Connect to your instance', 'Once your instance is running, log into it from your local computer.', ids[0] ? `ec2/instancias/${ids[0]}/conectar` : 'ec2/instancias'],
          ['Create EBS snapshot policy', 'Back up the volumes of your instance.', 'ec2/snapshots/crear'],
          ['Allocate an Elastic IP', 'Keep the same public IP address when the instance stops and starts.', 'ec2/eips/asignar']
        ].map(([t, d, ruta]) => h('a', { href: '#', class: 'cx-inicio__atajo', onclick: (ev) => (ev.preventDefault(), cx.ir(ruta)) }, h('b', {}, t), h('span', { class: 'cx-texto-sec' }, d)))
      )
    }),
    h('div', { class: 'cx-pie-form' }, ui.boton('View all instances', { variante: 'primario', escribe: false, alClic: () => cx.ir('ec2/instancias') }))
  );
}

/* ================================================== pantallas de Actions */

function pantallaInstancia(titulo, cuerpo) {
  return (cx, { id }) => {
    cx.migas([{ texto: 'EC2', ruta: 'ec2' }, { texto: 'Instances', ruta: 'ec2/instancias' }, { texto: id, ruta: `ec2/instancias/${id}` }, { texto: titulo }]);
    const i = instDe(cx, id);
    if (!i) return noExiste(cx, 'Instance', id, 'ec2/instancias');
    return cuerpo(cx, i);
  };
}

const conectar = pantallaInstancia('Connect to instance', (cx, i) => {
  const a = amiDe(i.ami);
  const dns = i.ipPublica ? dnsPublico(i.ipPublica) : null;
  const llave = i.llave ? `${i.llave}.${cx.estado.llaves.find((k) => k.nombre === i.llave)?.formato ?? 'pem'}` : 'your-key.pem';
  const st = { usuario: a?.usuario ?? 'ec2-user' };
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Connect to instance', info: 'conectar', cx, descripcion: `Connect to your instance ${i.id}${i.nombre ? ` (${i.nombre})` : ''} using any of these options` }),
    ui.pestanas({
      pestanas: [
        {
          id: 'ic',
          texto: 'EC2 Instance Connect',
          contenido: () => {
            const salida = h('div');
            return [
              ui.contenedor({
                cuerpo: h(
                  'div',
                  { class: 'cx-form' },
                  ui.pares([{ etiqueta: 'Instance ID', valor: ui.copiable(i.id) }, { etiqueta: 'Public IPv4 address', valor: i.ipPublica ? ui.copiable(i.ipPublica) : '–' }], { columnas: 2 }),
                  ui.campo({ etiqueta: 'Connection type', control: ui.tarjetas({ valor: 'publica', opciones: [{ valor: 'publica', etiqueta: 'Connect using a Public IP', descripcion: 'Connect using a public IPv4 or IPv6 address' }, { valor: 'endpoint', etiqueta: 'Connect using a Private IP', descripcion: 'Connect using a private IP address and a VPC endpoint', desactivado: true }] }) }),
                  ui.campo({ etiqueta: 'Username', descripcion: 'Enter the username defined in the AMI used to launch the instance. If you didn’t define a custom username, use the default username, ' + (a?.usuario ?? 'ec2-user') + '.', control: ui.entrada({ valor: st.usuario, alCambiar: (v) => (st.usuario = v) }) }),
                  ui.alerta({ tipo: 'info', contenido: 'Note: In most cases, the default username, ' + (a?.usuario ?? 'ec2-user') + ', is correct. However, read your AMI usage instructions to check if the AMI owner has changed the default AMI username.' })
                )
              }),
              salida,
              h(
                'div',
                { class: 'cx-pie-form' },
                ui.boton('Cancel', { variante: 'texto', alClic: () => cx.ir('ec2/instancias') }),
                ui.boton('Connect', {
                  variante: 'primario',
                  escribe: false,
                  alClic: () =>
                    ui.reemplazar(
                      salida,
                      ui.alerta({
                        tipo: 'error',
                        titulo: 'Failed to connect to your instance',
                        contenido: i.estado !== 'running' ? 'Error establishing SSH connection to your instance. The instance is not in the running state.' : 'EC2 Instance Connect no está disponible en este simulador: aquí no hay una terminal real. Para revisar si tu servidor funciona, abre su IP pública con el Navegador o mira Get system log.'
                      })
                    )
                })
              )
            ];
          }
        },
        { id: 'ssm', texto: 'Session Manager', contenido: () => ui.alerta({ tipo: 'aviso', titulo: 'SSM Agent is not online', contenido: 'The SSM Agent was unable to connect to a Systems Manager endpoint to register itself with the service.' }) },
        {
          id: 'ssh',
          texto: 'SSH client',
          contenido: () =>
            ui.contenedor({
              cuerpo: h(
                'div',
                { class: 'cx-form' },
                ui.pares([{ etiqueta: 'Instance ID', valor: ui.copiable(i.id) }], { columnas: 1 }),
                h(
                  'ol',
                  {},
                  h('li', {}, 'Open an SSH client.'),
                  h('li', {}, `Locate your private key file. The key used to launch this instance is ${i.llave ? llave : '(none: this instance was launched without a key pair)'}`),
                  h('li', {}, 'Run this command, if necessary, to ensure your key is not publicly viewable.', h('div', { class: 'cx-log', style: { marginTop: '6px' } }, `chmod 400 "${llave}"`)),
                  h('li', {}, 'Connect to your instance using its Public DNS:', h('div', { class: 'cx-log', style: { marginTop: '6px' } }, dns ?? '(this instance has no public IPv4 address)'))
                ),
                h('b', {}, 'Example:'),
                h('div', { class: 'cx-log' }, `ssh -i "${llave}" ${a?.usuario ?? 'ec2-user'}@${dns ?? i.ipPrivada}`),
                !i.llave ? ui.alerta({ tipo: 'aviso', contenido: 'This instance was launched without a key pair. You can’t connect with an SSH client unless you add a key to the instance.' }) : null
              )
            })
        },
        { id: 'serial', texto: 'EC2 serial console', contenido: () => ui.alerta({ tipo: 'info', contenido: 'EC2 serial console access is not enabled for this account.' }) }
      ]
    })
  );
});

const verLog = pantallaInstancia('Get system log', (cx, i) =>
  h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Get system log', info: 'system-log', cx, descripcion: `Instance ${i.id}${i.nombre ? ` (${i.nombre})` : ''}` }),
    ui.contenedor({
      titulo: 'System log',
      info: 'system-log',
      cx,
      descripcion: 'When you experience issues with your EC2 instance, reviewing system logs can help you pinpoint the cause.',
      acciones: [ui.botonRefrescar(() => cx.refrescar()), ui.boton('Download', { icono: 'download', desactivado: true })],
      cuerpo: cx.vivo(() => {
        const x = instDe(cx, i.id);
        const lineas = x ? registroSistema(x) : [];
        return lineas.length
          ? h('pre', { class: 'cx-log' }, lineas.join('\n'))
          : ui.alerta({ tipo: 'info', contenido: 'Logs are only retrieved after an instance event (launch/reboot/termination). Wait for the instance to finish starting and refresh.' });
      })
    }),
    h('div', { class: 'cx-pie-form' }, ui.boton('Close', { escribe: false, alClic: () => cx.ir('ec2/instancias') }))
  )
);

const editarUD = pantallaInstancia('Edit user data', (cx, i) => {
  const f = { texto: i.userData ?? '', base64: false };
  const detenida = i.estado === 'stopped';
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Edit user data', info: 'user-data', cx, descripcion: 'User data is used to run commands or scripts on the instance when it starts.' }),
    !detenida ? ui.alerta({ tipo: 'info', contenido: `To edit the user data, you must first stop the instance. Instance ${i.id} is currently ${i.estado}.` }) : null,
    ui.contenedor({
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.pares([{ etiqueta: 'Instance ID', valor: i.id }], { columnas: 1 }),
        ui.campo({ etiqueta: 'Current user data', control: h('pre', { class: 'cx-log', style: { minHeight: '40px' } }, i.userData || ' ') }),
        ui.campo({ etiqueta: 'New user data', control: ui.radios({ valor: 'texto', opciones: [{ valor: 'texto', etiqueta: 'Modify user data as text' }, { valor: 'archivo', etiqueta: 'Modify user data from file', desactivado: true }] }) }),
        ui.area({ valor: f.texto, filas: 10, monoespaciado: true, desactivado: !detenida, etiquetaAccesible: 'User data', alCambiar: (v) => (f.texto = v) }),
        ui.casilla({ etiqueta: 'Input is already base64 encoded', desactivado: !detenida, alCambiar: (v) => (f.base64 = v) })
      )
    }),
    ui.pieFormulario({
      cancelar: () => cx.ir('ec2/instancias'),
      textoEnviar: 'Save',
      desactivado: !detenida,
      enviar: () => {
        let t = f.texto;
        if (f.base64) {
          try {
            t = decodeURIComponent(escape(atob(t.replace(/\s+/g, ''))));
          } catch {
            t = '(invalid base64 user data)';
          }
        }
        const r = cx.hacer({ servicio: 'EC2', accion: 'ModifyInstanceAttribute (userData)', error: 'Failed to edit user data' }, (e) => editarUserData(e, i.id, t));
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: `Successfully edited user data for instance ${i.id}` });
          cx.ir('ec2/instancias');
        }
      }
    })
  );
});

const cambiarTipo = pantallaInstancia('Change instance type', (cx, i) => {
  const f = { tipo: i.tipo };
  const detenida = i.estado === 'stopped';
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Change instance type', info: 'tipo-instancia', cx, descripcion: 'Change the instance type of your instance to better suit your workload.' }),
    !detenida ? ui.alerta({ tipo: 'aviso', contenido: `You must stop your instance before you can change its instance type. Instance ${i.id} is currently ${i.estado}.` }) : null,
    ui.contenedor({
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.pares([{ etiqueta: 'Instance ID', valor: conNombre(i) }, { etiqueta: 'Current instance type', valor: i.tipo }], { columnas: 2 }),
        ui.campo({
          etiqueta: 'New instance type',
          control: ui.selector({
            opciones: TIPOS_INSTANCIA.map((t) => ({ valor: t.tipo, etiqueta: t.tipo, etiquetas: [`${t.vcpu} vCPU`, `${t.memoria} GiB Memory`, `${t.precio} USD per Hour`] })),
            valor: f.tipo,
            filtrar: true,
            desactivado: !detenida,
            alCambiar: (v) => (f.tipo = v)
          })
        })
      )
    }),
    ui.pieFormulario({
      cancelar: () => cx.ir('ec2/instancias'),
      textoEnviar: 'Change',
      desactivado: !detenida,
      enviar: () => {
        const r = cx.hacer({ servicio: 'EC2', accion: 'ModifyInstanceAttribute (instanceType)', error: 'Failed to change instance type' }, (e) => cambiarTipoInstancia(e, i.id, f.tipo));
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: `Successfully changed instance type of ${i.id} to ${f.tipo}` });
          cx.ir('ec2/instancias');
        }
      }
    })
  );
});

const cambiarGrupos = pantallaInstancia('Change security groups', (cx, i) => {
  const elegidos = [...i.gruposSeguridad];
  let candidato = null;
  const lista = ui.region(() => {
    const disponibles = cx.estado.gruposSeguridad.filter((g) => g.vpcId === i.vpcId && !elegidos.includes(g.id));
    return h(
      'div',
      { class: 'cx-form' },
      h(
        'div',
        { class: 'cx-fila-campos' },
        ui.campo({
          etiqueta: 'Associated security groups',
          descripcion: 'Add one or more security groups to the network interface. You can also remove security groups.',
          control: ui.selector({
            opciones: disponibles.map((g) => ({ valor: g.id, etiqueta: g.nombre, descripcion: g.id })),
            valor: candidato,
            filtrar: true,
            placeholder: 'Select security groups',
            vacio: 'No more security groups in this VPC',
            alCambiar: (v) => (candidato = v)
          })
        }),
        h('div', { style: { flex: '0 0 auto' } }, ui.boton('Add security group', { alClic: () => candidato && (elegidos.push(candidato), (candidato = null), lista.repintar()) }))
      ),
      tablaModal(
        elegidos.map((id, k) => {
          const g = cx.estado.gruposSeguridad.find((x) => x.id === id);
          return [g?.nombre ?? id, id, ui.boton('Remove', { alClic: () => (elegidos.splice(k, 1), lista.repintar()) })];
        }),
        ['Security group name', 'Security group ID', '']
      )
    );
  });
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Change security groups', info: 'grupo-seguridad', cx, descripcion: 'Security groups act as a firewall for associated instances, controlling both inbound and outbound traffic at the instance level.' }),
    ui.contenedor({ titulo: 'Instance details', cuerpo: ui.pares([{ etiqueta: 'Instance ID', valor: conNombre(i) }, { etiqueta: 'Network interface ID', valor: `eni-${i.id.slice(2)}` }], { columnas: 2 }) }),
    ui.contenedor({ titulo: 'Associated security groups', cuerpo: lista }),
    ui.pieFormulario({
      cancelar: () => cx.ir('ec2/instancias'),
      textoEnviar: 'Save',
      enviar: () => {
        const r = cx.hacer({ servicio: 'EC2', accion: 'ModifyInstanceAttribute (groupSet)', error: 'Failed to change security groups' }, (e) => cambiarGruposInstancia(e, i.id, elegidos));
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: `Successfully changed security groups for instance ${i.id}` });
          cx.ir('ec2/instancias');
        }
      }
    })
  );
});

const cambiarRol = pantallaInstancia('Modify IAM role', (cx, i) => {
  const f = { rol: i.rolIam ?? '' };
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Modify IAM role', info: 'perfil-iam', cx, descripcion: 'Attach an IAM role to your instance.' }),
    ui.contenedor({
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.pares([{ etiqueta: 'Instance ID', valor: conNombre(i) }], { columnas: 1 }),
        h(
          'div',
          { class: 'cx-fila-campos' },
          ui.campo({
            etiqueta: 'IAM role',
            descripcion: 'Select an IAM role to attach to your instance or create a new role if you haven’t created any. The role you select replaces any roles that are currently attached to your instance.',
            control: ui.selector({
              opciones: [{ valor: '', etiqueta: 'No IAM Role' }, ...cx.estado.iam.roles.map((r) => ({ valor: r.nombre, etiqueta: r.nombre, descripcion: r.servicio }))],
              valor: f.rol,
              filtrar: true,
              alCambiar: (v) => (f.rol = v)
            })
          }),
          h('div', { style: { flex: '0 0 auto' } }, ui.boton('Create new IAM role', { icono: 'external', alClic: () => cx.ir('iam/roles') }))
        )
      )
    }),
    ui.pieFormulario({
      cancelar: () => cx.ir('ec2/instancias'),
      textoEnviar: 'Update IAM role',
      enviar: () => {
        const r = cx.hacer({ servicio: 'EC2', accion: f.rol ? 'AssociateIamInstanceProfile' : 'DisassociateIamInstanceProfile', error: 'Failed to modify IAM role' }, (e) => cambiarRolInstancia(e, i.id, f.rol || null));
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: f.rol ? `Successfully attached ${f.rol} to instance ${i.id}` : `Successfully detached the IAM role from instance ${i.id}` });
          cx.ir('ec2/instancias');
        }
      }
    })
  );
});

/* ======================================================= tipos de instancia */

function tipos(cx) {
  cx.migas([{ texto: 'EC2', ruta: 'ec2' }, { texto: 'Instance types' }]);
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.tabla(cx, {
      titulo: 'Instance types',
      info: 'tipo-instancia',
      filas: () => TIPOS_INSTANCIA,
      clave: (t) => t.tipo,
      seleccion: null,
      filtro: 'Filter instance types',
      columnas: [
        { titulo: 'Instance type', valor: (t) => t.tipo },
        { titulo: 'Free-tier eligible', valor: (t) => (t.capaGratuita ? 'true' : 'false') },
        { titulo: 'vCPUs', valor: (t) => String(t.vcpu) },
        { titulo: 'Architectures', valor: () => 'x86_64' },
        { titulo: 'Memory (GiB)', valor: (t) => String(t.memoria) },
        { titulo: 'Current generation', valor: () => 'true' },
        { titulo: 'On-Demand Linux pricing', valor: (t) => `${t.precio} USD per Hour` }
      ]
    })
  );
}

export const rutasInstancias = {
  instancias: listaInstancias,
  'instancias/lanzar': lanzar,
  'instancias/lanzada': lanzada,
  'instancias/:id': detalleInstancia,
  'instancias/:id/conectar': conectar,
  'instancias/:id/log': verLog,
  'instancias/:id/user-data': editarUD,
  'instancias/:id/tipo': cambiarTipo,
  'instancias/:id/grupos': cambiarGrupos,
  'instancias/:id/rol': cambiarRol,
  tipos
};

export { reglaNueva };
