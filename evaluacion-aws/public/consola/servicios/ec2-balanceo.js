// ---------------------------------------------------------------------------
// EC2 · LOAD BALANCING
//
// Load balancers y Target groups, como en la consola de EC2:
//   - la lista de balanceadores con su panel inferior, «Compare and select load
//     balancer type» y el formulario de creación (ALB funcional; NLB y GWLB se
//     crean, pero no llevan tráfico);
//   - el detalle con Listeners and rules, Network mapping, Resource map,
//     Security, Monitoring, Attributes y Tags; las reglas por ruta (path
//     pattern) de cada listener;
//   - los grupos de destino: asistente de dos pasos (Specify group details,
//     Register targets), detalle con la salud de cada destino (la calcula
//     modelo/elb.js con red.js), Register targets, Deregister y Edit health
//     check settings.
// Botón propio del simulador: «Open in browser», que abre el DNS del ALB en el
// navegador de prueba (desde la casa del alumno).
// ---------------------------------------------------------------------------

import * as ui from '../ui.js';
import {
  agregarOyente,
  agregarReglaOyente,
  balanceadoresDeGrupo,
  clonar,
  conteoSalud,
  crearBalanceador,
  crearGrupoDestino,
  editarAtributosBalanceador,
  editarAtributosGrupoDestino,
  editarChequeoGrupoDestino,
  editarGruposBalanceador,
  editarOyente,
  editarSubredesBalanceador,
  eliminarBalanceador,
  eliminarGrupoDestino,
  eliminarOyente,
  eliminarReglaOyente,
  gruposDeOyente,
  ID_ZONA,
  PROTOCOLOS_OYENTE,
  quitarDestinos,
  registrarDestinos
} from '../modelo.js';
import { enlaceRecurso, estadoInstancia, idParentesis, noExiste, opcionesVpc, opcionSubred, panelVacio } from './comun.js';

const { h } = ui;

/* ================================================================ ayudantes */

const elb = (cx) => cx.estado.elb ?? { balanceadores: [], gruposDestino: [] };
const lbDe = (cx, nombre) => elb(cx).balanceadores.find((b) => b.nombre === nombre) ?? null;
const tgDe = (cx, nombre) => elb(cx).gruposDestino.find((g) => g.nombre === nombre) ?? null;
const tgPorArn = (cx, arn) => elb(cx).gruposDestino.find((g) => g.arn === arn) ?? null;
const instDe = (cx, id) => cx.estado.instancias.find((i) => i.id === id) ?? null;
const vpcPorDefecto = (cx) => cx.estado.vpcs.find((v) => v.porDefecto) ?? cx.estado.vpcs[0] ?? null;

const migaEc2 = { texto: 'EC2', ruta: 'ec2' };
const migaLbs = { texto: 'Load balancers', ruta: 'ec2/balanceadores' };
const migaTgs = { texto: 'Target groups', ruta: 'ec2/grupos-destino' };

const TIPO_TEXTO = { application: 'application', network: 'network', gateway: 'gateway' };
const TIPO_NOMBRE = { application: 'Application Load Balancer', network: 'Network Load Balancer', gateway: 'Gateway Load Balancer' };

function estadoLb(lb) {
  return lb.estado === 'active' ? ui.estado('exito', 'Active') : lb.estado === 'provisioning' ? ui.estado('pendiente', 'Provisioning') : ui.estado('error', lb.estado);
}

const SALUD = {
  healthy: ['exito', 'Healthy'],
  unhealthy: ['error', 'Unhealthy'],
  initial: ['pendiente', 'Initial'],
  unused: ['inactivo', 'Unused'],
  draining: ['pendiente', 'Draining']
};
const estadoSalud = (s) => ui.estado(...(SALUD[s] ?? ['info', s]));

/** «HTTP:80». */
const protoPuerto = (o) => `${o.protocolo}:${o.puerto}`;

/** Enlace a un grupo de destino por su ARN. */
function enlaceTg(cx, arn) {
  const tg = tgPorArn(cx, arn);
  return tg ? ui.enlace(tg.nombre, `ec2/grupos-destino/${tg.nombre}`, { cx }) : arn ?? '–';
}

const zonasDe = (cx, lb) => lb.subredes.map((s) => cx.estado.subredes.find((x) => x.id === s)).filter(Boolean);

/** Abre el DNS del balanceador en el navegador del simulador. */
const abrirEnNavegador = (cx, lb) => cx.navegador(`http://${lb.dns}`);

function botonNavegador(cx, lb) {
  return ui.boton('Open in browser', { icono: 'external', titulo: 'Botón del simulador: abre el DNS del balanceador desde tu casa', alClic: () => abrirEnNavegador(cx, lb) });
}

/* ======================================================= load balancers: lista */

function confirmarBorrarLbs(cx, lbs, alTerminar) {
  cx.confirmar({
    titulo: 'Delete load balancer?',
    textoBoton: 'Delete',
    contenido: [
      h('p', {}, `Are you sure you want to delete the following load balancer${lbs.length > 1 ? 's' : ''}?`),
      h('ul', {}, lbs.map((b) => h('li', {}, h('b', {}, b.nombre)))),
      ui.alerta({ tipo: 'aviso', contenido: 'Deleting a load balancer does not delete its target groups or the targets registered with them. Your targets keep running and continue to incur charges.' })
    ],
    palabra: 'confirm',
    aceptar: () => {
      const r = cx.hacer({ servicio: 'ELB', accion: 'DeleteLoadBalancer', error: 'Failed to delete load balancer' }, (e) => lbs.forEach((b) => eliminarBalanceador(e, b.arn)), { atomico: true });
      if (!r.ok) return false;
      cx.flash({ tipo: 'exito', texto: `Successfully deleted load balancer${lbs.length > 1 ? 's' : ''}: ${lbs.map((b) => b.nombre).join(', ')}` });
      alTerminar?.();
    }
  });
}

function accionesLb(cx, sel, { alBorrar } = {}) {
  const uno = sel.length === 1 ? sel[0] : null;
  return ui.menuBoton(
    'Actions',
    () => [
      { texto: 'View details', desactivado: !uno, alClic: () => cx.ir(`ec2/balanceadores/${uno.nombre}`) },
      { texto: 'Open in browser', desactivado: !uno, alClic: () => abrirEnNavegador(cx, uno) },
      '-',
      { texto: 'Edit load balancer attributes', desactivado: !uno, escribe: true, alClic: () => modalAtributosLb(cx, uno) },
      { texto: 'Edit security groups', desactivado: !uno || uno.tipo === 'gateway', escribe: true, alClic: () => modalGruposLb(cx, uno) },
      { texto: 'Edit subnets', desactivado: !uno, escribe: true, alClic: () => modalSubredesLb(cx, uno) },
      { texto: 'Edit IP address type', desactivado: true },
      { texto: 'Manage tags', desactivado: true },
      '-',
      { texto: 'Delete load balancer', desactivado: !sel.length, escribe: true, alClic: () => confirmarBorrarLbs(cx, sel, alBorrar) }
    ],
    { desactivado: !sel.length }
  );
}

function listaBalanceadores(cx) {
  cx.migas([migaEc2, { texto: 'Load balancers' }]);
  const st = { pestana: 'detalles' };
  const t = ui.tabla(cx, {
    titulo: 'Load balancers',
    info: 'elb-balanceador',
    descripcion: 'Elastic Load Balancing scales your load balancer capacity automatically in response to changes in incoming traffic.',
    filas: () => elb(cx).balanceadores,
    clave: (b) => b.arn,
    seleccion: 'multiple',
    filtro: 'Filter load balancers',
    columnas: [
      { titulo: 'Name', valor: (b) => ui.enlace(b.nombre, `ec2/balanceadores/${b.nombre}`, { cx }) },
      { titulo: 'DNS name', valor: (b) => ui.copiable(b.dns), texto: (b) => b.dns },
      { titulo: 'State', valor: (b) => estadoLb(b), texto: (b) => b.estado },
      { titulo: 'VPC ID', valor: (b) => enlaceRecurso(cx, b.vpcId) },
      { titulo: 'Availability Zones', valor: (b) => `${b.subredes.length} Availability Zone${b.subredes.length === 1 ? '' : 's'}` },
      { titulo: 'Type', valor: (b) => TIPO_TEXTO[b.tipo] },
      { titulo: 'Date created', valor: (b) => ui.fecha(b.creado) }
    ],
    acciones: (sel) => [accionesLb(cx, sel, { alBorrar: () => t.seleccionar([]) }), ui.boton('Create load balancer', { variante: 'primario', alClic: () => cx.ir('ec2/balanceadores/crear') })],
    vacio: {
      titulo: 'No load balancers',
      texto: 'You don’t have any load balancers in us-east-1.',
      accion: ui.boton('Create load balancer', { escribe: true, alClic: () => cx.ir('ec2/balanceadores/crear') })
    },
    alSeleccionar: () => panel.repintar()
  });
  const panel = cx.vivo(() => {
    const sel = t.seleccion();
    if (sel.length !== 1) return panelVacio(sel.length ? `${sel.length} load balancers selected` : 'Select a load balancer');
    const lb = sel[0];
    return ui.panelInferior({ titulo: `Load balancer: ${lb.nombre}`, contenido: pestanasLb(cx, lb, st) });
  });
  return h('div', { class: 'cx-pagina' }, t, panel);
}

/* ===================================================== elegir el tipo */

const TIPOS = [
  {
    tipo: 'application',
    titulo: 'Application Load Balancer',
    dibujo: 'HTTP · HTTPS',
    texto:
      'Choose an Application Load Balancer when you need a flexible feature set for your applications with HTTP and HTTPS traffic. Operating at the request level, Application Load Balancers provide advanced routing and visibility features targeted at application architectures, including microservices and containers.'
  },
  {
    tipo: 'network',
    titulo: 'Network Load Balancer',
    dibujo: 'TCP · UDP · TLS',
    texto:
      'Choose a Network Load Balancer when you need ultra-high performance, TLS offloading at scale, centralized certificate deployment, support for UDP, and static IP addresses for your applications. Operating at the connection level, Network Load Balancers are capable of handling millions of requests per second securely while maintaining ultra-low latencies.'
  },
  {
    tipo: 'gateway',
    titulo: 'Gateway Load Balancer',
    dibujo: 'IP · GENEVE',
    texto:
      'Choose a Gateway Load Balancer when you need to deploy and manage a fleet of third-party virtual appliances that support GENEVE. These appliances enable you to improve security, compliance, and policy controls.'
  }
];

function elegirTipo(cx) {
  cx.migas([migaEc2, migaLbs, { texto: 'Compare and select load balancer type' }]);
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({
      titulo: 'Compare and select load balancer type',
      info: 'elb-tipos',
      cx,
      descripcion: 'A complete feature-by-feature comparison along with detailed highlights is available below.'
    }),
    ui.contenedor({
      titulo: 'Load balancer types',
      cuerpo: h(
        'div',
        { class: 'cx-elb-tipos' },
        TIPOS.map((t) =>
          h(
            'div',
            { class: 'cx-elb-tipo' },
            h('h3', { class: 'cx-h3' }, t.titulo, ' ', ui.info(cx, 'elb-tipos')),
            h('div', { class: ['cx-elb-tipo__dibujo', `cx-elb-tipo__dibujo--${t.tipo}`] }, h('span', {}, t.dibujo)),
            h('p', { class: 'cx-texto-sec' }, t.texto),
            ui.boton('Create', { alClic: () => cx.ir(`ec2/balanceadores/crear/${t.tipo}`) }),
            t.tipo !== 'application' ? h('p', { class: 'cx-elb-tipo__nota' }, 'En el simulador se crea y se ve, pero no reparte tráfico.') : null
          )
        )
      )
    }),
    ui.expandible({
      titulo: 'Classic Load Balancer - previous generation',
      contenido: ui.alerta({ tipo: 'info', contenido: 'Classic Load Balancer is the previous generation. It is not available in this simulator: use an Application Load Balancer.' })
    })
  );
}

/* ===================================================== crear un balanceador */

/** Un listener del formulario: { protocolo, puerto, tgArn }. */
const oyenteNuevo = (tipo) => ({ protocolo: PROTOCOLOS_OYENTE[tipo][0], puerto: tipo === 'gateway' ? '6081' : '80', tgArn: null });

/** Los grupos de destino que puede usar un listener de este tipo de balanceador en esa VPC. */
function gruposCompatibles(cx, tipo, vpcId, lbArn = null) {
  return elb(cx).gruposDestino.filter((g) => {
    if (g.vpcId !== vpcId) return false;
    const ok = tipo === 'application' ? ['HTTP', 'HTTPS'].includes(g.protocolo) : tipo === 'gateway' ? g.protocolo === 'GENEVE' : ['TCP', 'TLS', 'UDP', 'TCP_UDP'].includes(g.protocolo);
    if (!ok) return false;
    // Un grupo de destino solo puede estar con un balanceador.
    return !balanceadoresDeGrupo(cx.estado, g).some((b) => b.arn !== lbArn);
  });
}

const opcionTg = (g) => ({ valor: g.arn, etiqueta: g.nombre, descripcion: `Target type: Instance, ${g.protocolo}:${g.puerto}`, etiquetaDerecha: `${g.destinos.length} target${g.destinos.length === 1 ? '' : 's'}` });

function crearBalanceadorPagina(cx, { tipo }) {
  if (!TIPO_NOMBRE[tipo]) return ui.noDisponible('Create load balancer', 'Ese tipo de balanceador no existe.');
  cx.migas([migaEc2, migaLbs, { texto: 'Compare and select load balancer type', ruta: 'ec2/balanceadores/crear' }, { texto: `Create ${TIPO_NOMBRE[tipo]}` }]);
  const e = cx.estado;
  const borrador = cx.memoria.borradorBalanceador;
  const vpc0 = vpcPorDefecto(cx);
  const f =
    borrador?.tipo === tipo
      ? borrador
      : {
          tipo,
          nombre: '',
          esquema: 'internet-facing',
          vpcId: vpc0?.id ?? null,
          zonas: {},
          grupos: tipo === 'application' ? [e.gruposSeguridad.find((g) => g.vpcId === vpc0?.id && g.porDefecto)?.id].filter(Boolean) : [],
          oyentes: [oyenteNuevo(tipo)],
          etiquetas: [],
          errores: {}
        };
  f.errores = {};
  cx.memoria.borradorBalanceador = f;

  const subredesVpc = () => e.subredes.filter((s) => s.vpcId === f.vpcId);
  const zonasVpc = () => [...new Set(subredesVpc().map((s) => s.az))].sort();
  const elegidas = () => Object.entries(f.zonas).filter(([, s]) => s).map(([, s]) => s);

  /* ---------- Basic configuration */
  const basicos = ui.region(() =>
    ui.contenedor({
      titulo: 'Basic configuration',
      cuerpo: h(
        'div',
        { class: 'cx-form', style: { maxWidth: '720px' } },
        ui.campo({
          etiqueta: 'Load balancer name',
          info: 'elb-balanceador',
          cx,
          descripcion: 'Name must be unique within your AWS account and can’t be changed after the load balancer is created.',
          control: ui.entrada({ valor: f.nombre, placeholder: 'my-load-balancer', alCambiar: (v) => (f.nombre = v) }),
          error: f.errores.nombre,
          restriccion: 'A maximum of 32 alphanumeric characters including hyphens are allowed, but the name must not begin or end with a hyphen.'
        }),
        tipo !== 'gateway'
          ? ui.campo({
              etiqueta: 'Scheme',
              info: 'elb-esquema',
              cx,
              descripcion: 'Scheme can’t be changed after the load balancer is created.',
              control: ui.radios({
                valor: f.esquema,
                alCambiar: (v) => (f.esquema = v),
                opciones: [
                  { valor: 'internet-facing', etiqueta: 'Internet-facing', descripcion: 'Serves internet-facing traffic. Has public IP addresses. DNS name resolves to public IPs. Requires a public subnet.' },
                  { valor: 'internal', etiqueta: 'Internal', descripcion: 'Serves internal traffic. Has private IP addresses. DNS name resolves to private IPs. Compatible with the IPv4 and Dualstack IP address types.' }
                ]
              })
            })
          : null,
        ui.campo({
          etiqueta: 'Load balancer IP address type',
          descripcion: 'Select the front-end IP address type to assign to the load balancer. The VPC and subnets mapped to this load balancer must include the selected IP address types.',
          control: ui.radios({
            valor: 'ipv4',
            opciones: [
              { valor: 'ipv4', etiqueta: 'IPv4', descripcion: 'Includes only IPv4 addresses.' },
              { valor: 'dual', etiqueta: 'Dualstack', descripcion: 'Includes IPv4 and IPv6 addresses.', desactivado: true },
              { valor: 'dual6', etiqueta: 'Dualstack without public IPv4', descripcion: 'Includes a public IPv6 address, and private IPv4 and IPv6 addresses.', desactivado: true }
            ]
          })
        })
      )
    })
  );

  /* ---------- Network mapping */
  const red = ui.region(() =>
    ui.contenedor({
      titulo: 'Network mapping',
      info: 'elb-zonas',
      cx,
      descripcion: 'The load balancer routes traffic to targets in the selected subnets, and in accordance with your IP address settings.',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({
          etiqueta: 'VPC',
          info: 'elb-zonas',
          cx,
          descripcion: 'The load balancer will exist and scale within the selected VPC. The selected VPC is also where the load balancer targets must be hosted unless routing to Lambda or on-premises targets.',
          control: h(
            'div',
            { style: { maxWidth: '520px' } },
            ui.selector({
              opciones: opcionesVpc(e),
              valor: f.vpcId,
              filtrar: true,
              alCambiar: (v) => {
                f.vpcId = v;
                f.zonas = {};
                f.grupos = tipo === 'application' ? [e.gruposSeguridad.find((g) => g.vpcId === v && g.porDefecto)?.id].filter(Boolean) : [];
                f.oyentes.forEach((o) => (o.tgArn = null));
                repintarTodo();
              }
            })
          )
        }),
        ui.campo({
          etiqueta: tipo === 'application' ? 'Availability Zones and subnets' : 'Availability Zones',
          descripcion:
            tipo === 'application'
              ? 'Select at least two Availability Zones and a subnet for each zone. A load balancer node will be placed in each selected zone and will automatically scale in response to traffic. The load balancer routes traffic to targets in the selected Availability Zones only.'
              : 'Select at least one Availability Zone and one subnet for each zone. The load balancer routes traffic to targets in the selected Availability Zones only.',
          error: f.errores.zonas,
          control: zonasVpc().length
            ? h(
                'div',
                { class: 'cx-elb-zonas' },
                zonasVpc().map((az) => {
                  const marcada = Object.hasOwn(f.zonas, az);
                  const opciones = subredesVpc().filter((s) => s.az === az);
                  return h(
                    'div',
                    { class: ['cx-elb-zona', marcada && 'cx-elb-zona--activa'] },
                    ui.casilla({
                      etiqueta: `${az} (${ID_ZONA[az] ?? ''})`,
                      marcada,
                      alCambiar: (v) => {
                        if (v) f.zonas[az] = opciones.length === 1 ? opciones[0].id : null;
                        else delete f.zonas[az];
                        red.repintar();
                        resumen.repintar();
                      }
                    }),
                    marcada
                      ? h(
                          'div',
                          { class: 'cx-elb-zona__subred' },
                          ui.campo({
                            etiqueta: 'Subnet',
                            control: ui.selector({
                              opciones: opciones.map((s) => opcionSubred(e, s)),
                              valor: f.zonas[az],
                              placeholder: 'Select a subnet',
                              filtrar: true,
                              alCambiar: (v) => {
                                f.zonas[az] = v;
                                resumen.repintar();
                              }
                            })
                          }),
                          h('div', { class: 'cx-campo__restriccion' }, 'IPv4 address: Assigned by AWS')
                        )
                      : null
                  );
                })
              )
            : h('p', { class: 'cx-texto-sec' }, 'This VPC has no subnets. Create a subnet first.')
        })
      )
    })
  );

  /* ---------- Security groups */
  const seguridad = ui.region(() =>
    tipo === 'gateway'
      ? null
      : ui.contenedor({
          titulo: 'Security groups',
          info: 'elb-grupos-seguridad',
          cx,
          descripcion: 'A security group is a set of firewall rules that control the traffic to your load balancer. Select an existing security group, or you can create a new security group.',
          cuerpo: h(
            'div',
            { class: 'cx-form', style: { maxWidth: '720px' } },
            ui.campo({
              etiqueta: 'Security groups',
              opcional: tipo === 'network',
              error: f.errores.grupos,
              control: ui.selector({
                multiple: true,
                valores: f.grupos,
                placeholder: 'Select up to 5 security groups',
                filtrar: true,
                vacio: 'No security groups in this VPC',
                opciones: () => e.gruposSeguridad.filter((g) => g.vpcId === f.vpcId).map((g) => ({ valor: g.id, etiqueta: g.nombre, descripcion: `${g.id}  VPC: ${g.vpcId}` })),
                alCambiar: (v) => {
                  f.grupos = v;
                  resumen.repintar();
                }
              })
            }),
            h('div', {}, ui.enlace('Create new security group', () => cx.ir('ec2/grupos/crear'), { externo: true })),
            h('p', { class: 'cx-texto-sec' }, 'Tu formulario se guarda: después de crear el grupo, regresa a Load balancers → Create load balancer y lo encontrarás como lo dejaste.')
          )
        })
  );

  /* ---------- Listeners and routing */
  const oyentes = ui.region(() =>
    ui.contenedor({
      titulo: 'Listeners and routing',
      info: 'elb-oyente',
      cx,
      descripcion: 'A listener is a process that checks for connection requests using the port and protocol you configure. The rules that you define for a listener determine how the load balancer routes requests to its registered targets.',
      cuerpo: h(
        'div',
        { class: 'cx-pagina' },
        f.oyentes.map((o, i) =>
          h(
            'div',
            { class: 'cx-bloque cx-elb-oyente' },
            h(
              'div',
              { class: 'cx-elb-oyente__cabeza' },
              h('b', {}, `Listener ${o.protocolo}:${o.puerto || '–'}`),
              f.oyentes.length > 1 ? ui.boton('Remove', { alClic: () => (f.oyentes.splice(i, 1), oyentes.repintar(), resumen.repintar()) }) : null
            ),
            h(
              'div',
              { class: 'cx-fila-campos' },
              ui.campo({
                etiqueta: 'Protocol',
                control: ui.selector({
                  opciones: [
                    ...PROTOCOLOS_OYENTE[tipo].map((p) => ({ valor: p, etiqueta: p, desactivado: p === 'HTTPS' || p === 'TLS', descripcion: p === 'HTTPS' || p === 'TLS' ? 'Requires a certificate (not available in this simulator)' : undefined }))
                  ],
                  valor: o.protocolo,
                  desactivado: tipo === 'gateway',
                  alCambiar: (v) => ((o.protocolo = v), oyentes.repintar(), resumen.repintar())
                })
              }),
              ui.campo({
                etiqueta: 'Port',
                control: ui.entrada({ valor: o.puerto, tipo: 'number', min: 1, max: 65535, placeholder: '1-65535', desactivado: tipo === 'gateway', alCambiar: (v) => ((o.puerto = v), resumen.repintar()) })
              })
            ),
            ui.campo({
              etiqueta: 'Default action',
              info: 'elb-reglas',
              cx,
              descripcion: 'Forward to target group',
              error: f.errores[`tg${i}`],
              control: h(
                'div',
                { class: 'cx-elb-accion' },
                ui.selector({
                  opciones: () => gruposCompatibles(cx, tipo, f.vpcId).map(opcionTg),
                  valor: o.tgArn,
                  placeholder: 'Select a target group',
                  filtrar: true,
                  vacio: 'No compatible target groups in this VPC. Create a target group first.',
                  alCambiar: (v) => ((o.tgArn = v), resumen.repintar())
                }),
                ui.botonRefrescar(() => oyentes.repintar())
              )
            }),
            h(
              'div',
              {},
              ui.enlace('Create target group', () => {
                cx.memoria.volverABalanceador = { tipo, oyente: i };
                cx.ir('ec2/grupos-destino/crear');
              }, { externo: true })
            )
          )
        ),
        tipo !== 'gateway' ? h('div', {}, ui.boton('Add listener', { alClic: () => (f.oyentes.push({ ...oyenteNuevo(tipo), puerto: '' }), oyentes.repintar()) })) : null
      )
    })
  );

  /* ---------- Summary */
  const resumen = ui.region(() => {
    const nombres = (ids) => ids.map((id) => e.gruposSeguridad.find((g) => g.id === id)?.nombre ?? id).join(', ');
    const caja = (titulo, filas) => h('div', { class: 'cx-bloque' }, h('div', { class: 'cx-bloque__titulo' }, titulo), filas);
    return ui.contenedor({
      titulo: 'Summary',
      descripcion: 'Review and confirm your configurations. Estimate cost',
      cuerpo: h(
        'div',
        { class: 'cx-elb-resumen' },
        caja('Basic configuration', [h('div', {}, h('b', {}, f.nombre || '–')), h('div', {}, tipo === 'gateway' ? '' : `${f.esquema === 'internal' ? 'Internal' : 'Internet-facing'} · IPv4`)]),
        tipo !== 'gateway' ? caja('Security groups', h('div', {}, nombres(f.grupos) || '–')) : null,
        caja('Network mapping', [h('div', {}, f.vpcId ?? '–'), ...Object.entries(f.zonas).map(([az, s]) => h('div', { class: 'cx-texto-sec' }, `${az}: ${s ?? 'subnet required'}`))]),
        caja(
          'Listeners and routing',
          f.oyentes.map((o) => h('div', {}, `${o.protocolo}:${o.puerto || '–'} defaults to `, o.tgArn ? h('b', {}, tgPorArn(cx, o.tgArn)?.nombre ?? o.tgArn) : h('i', {}, 'no target group')))
        )
      )
    });
  });

  function repintarTodo() {
    basicos.repintar();
    red.repintar();
    seguridad.repintar();
    oyentes.repintar();
    resumen.repintar();
  }

  function crear() {
    // Lo que la consola revisa en el navegador antes de llamar a AWS.
    f.errores = {};
    if (!f.nombre.trim()) f.errores.nombre = 'Load balancer name is required.';
    if (Object.values(f.zonas).some((s) => !s)) f.errores.zonas = 'Select a subnet for each selected Availability Zone.';
    if (tipo === 'application' && !f.grupos.length) f.errores.grupos = 'Select at least one security group.';
    f.oyentes.forEach((o, i) => {
      if (!o.tgArn) f.errores[`tg${i}`] = 'Select a target group for the default action.';
    });
    if (Object.values(f.errores).some(Boolean)) {
      repintarTodo();
      setTimeout(() => cx.raiz.querySelector('.cx-campo--error')?.scrollIntoView({ block: 'center' }), 0);
      return;
    }
    const r = cx.hacer(
      { servicio: 'ELB', accion: 'CreateLoadBalancer', error: 'Failed to create load balancer' },
      (est) =>
        crearBalanceador(est, {
          nombre: f.nombre.trim(),
          tipo,
          esquema: f.esquema,
          vpcId: f.vpcId,
          subredes: elegidas(),
          gruposSeguridad: f.grupos,
          oyentes: f.oyentes.map((o) => ({ protocolo: o.protocolo, puerto: o.puerto, tgArn: o.tgArn })),
          etiquetas: f.etiquetas
        }),
      { atomico: true }
    );
    if (r.ok) {
      delete cx.memoria.borradorBalanceador;
      cx.flash({ tipo: 'exito', titulo: `Successfully created load balancer: ${r.valor.nombre}`, texto: 'It might take a few minutes for your load balancer to be fully set up and ready to route traffic. Targets will also take a few minutes to complete the registration process and pass initial health checks.' });
      cx.ir(`ec2/balanceadores/${r.valor.nombre}`);
    }
  }

  return h(
    'div',
    { class: 'cx-pagina cx-elb-crear' },
    ui.encabezado({
      titulo: `Create ${TIPO_NOMBRE[tipo]}`,
      info: 'elb-tipos',
      cx,
      descripcion:
        tipo === 'application'
          ? 'The Application Load Balancer distributes incoming HTTP and HTTPS traffic across multiple targets such as Amazon EC2 instances, microservices, and containers, based on request attributes. When the load balancer receives a connection request, it evaluates the listener rules in priority order to determine which rule to apply, and if applicable, it selects a target from the target group for the rule action.'
          : tipo === 'network'
            ? 'The Network Load Balancer distributes incoming TCP and UDP traffic across multiple targets such as Amazon EC2 instances, microservices, and containers. When the load balancer receives a connection request, it selects a target from the target group for the default rule.'
            : 'The Gateway Load Balancer distributes traffic across a fleet of third-party virtual appliances that support GENEVE.'
    }),
    tipo !== 'application' ? ui.alerta({ tipo: 'info', titulo: 'Aviso del simulador', contenido: `Puedes crear un ${TIPO_NOMBRE[tipo]} para conocer sus opciones, pero en el simulador no reparte tráfico: para abrir páginas usa un Application Load Balancer.` }) : null,
    basicos,
    red,
    seguridad,
    oyentes,
    tipo === 'application'
      ? ui.contenedor({
          titulo: 'Optimize with service integrations - optional',
          descripcion: 'Optimize your load balancer architecture by integrating additional AWS services.',
          cuerpo: h('div', { class: 'cx-form' }, ui.casilla({ etiqueta: 'Amazon CloudFront + AWS Web Application Firewall (WAF)', descripcion: 'Apply application layer acceleration and security protections in front of the load balancer.', desactivado: true }), ui.casilla({ etiqueta: 'AWS Global Accelerator', descripcion: 'Apply a static IP address and global network layer acceleration.', desactivado: true }))
        })
      : null,
    ui.contenedor({ titulo: 'Load balancer tags - optional', descripcion: 'Consider adding tags to your load balancer. Tags enable you to categorize your AWS resources so you can more easily manage them.', cuerpo: ui.editorEtiquetas({ filas: f.etiquetas }) }),
    resumen,
    ui.pieFormulario({
      cancelar: () => {
        delete cx.memoria.borradorBalanceador;
        cx.ir('ec2/balanceadores');
      },
      textoEnviar: 'Create load balancer',
      enviar: crear
    })
  );
}

/* ===================================================== detalle de un balanceador */

function paresLb(cx, lb) {
  return ui.pares(
    [
      { etiqueta: 'Load balancer type', valor: TIPO_NOMBRE[lb.tipo].replace(' Load Balancer', '') },
      { etiqueta: 'Status', valor: estadoLb(lb) },
      { etiqueta: 'VPC', valor: enlaceRecurso(cx, lb.vpcId) },
      { etiqueta: 'Load balancer IP address type', valor: 'IPv4' },
      { etiqueta: 'Scheme', info: 'elb-esquema', valor: lb.esquema ? (lb.esquema === 'internal' ? 'Internal' : 'Internet-facing') : '–' },
      { etiqueta: 'Hosted zone', valor: lb.zonaHospedada || '–' },
      { etiqueta: 'Availability Zones', valor: h('div', {}, zonasDe(cx, lb).map((s) => h('div', {}, enlaceRecurso(cx, s.id), ` ${s.az} (${ID_ZONA[s.az] ?? ''})`))) },
      { etiqueta: 'Date created', valor: ui.fechaLarga(lb.creado) },
      { etiqueta: 'Load balancer ARN', valor: ui.copiable(lb.arn) },
      { etiqueta: 'DNS name', info: 'elb-dns', valor: h('span', {}, ui.copiable(lb.dns), h('span', { class: 'cx-texto-sec' }, ' (A Record)')) }
    ],
    { columnas: 3, cx }
  );
}

/** Las pestañas del balanceador. En la página de detalle los Details van arriba, fuera de las pestañas. */
function pestanasLb(cx, lb, st, { conDetalles = true } = {}) {
  return ui.pestanas({
    activa: st.pestana,
    alCambiar: (p) => (st.pestana = p),
    pestanas: [
      conDetalles ? { id: 'detalles', texto: 'Details', contenido: () => ui.contenedor({ titulo: 'Details', cuerpo: paresLb(cx, lb) }) } : null,
      { id: 'oyentes', texto: 'Listeners and rules', contenido: () => tablaOyentes(cx, lb) },
      { id: 'red', texto: 'Network mapping', contenido: () => pestanaRed(cx, lb) },
      { id: 'mapa', texto: 'Resource map', contenido: () => mapaRecursos(cx, lb) },
      { id: 'seguridad', texto: 'Security', desactivada: lb.tipo === 'gateway', contenido: () => pestanaSeguridad(cx, lb) },
      { id: 'monitoreo', texto: 'Monitoring', contenido: () => pestanaMonitoreo(cx, lb) },
      { id: 'integraciones', texto: 'Integrations', desactivada: true, contenido: () => null },
      { id: 'atributos', texto: 'Attributes', contenido: () => pestanaAtributosLb(cx, lb) },
      { id: 'capacidad', texto: 'Capacity', desactivada: true, contenido: () => null },
      { id: 'etiquetas', texto: 'Tags', contenido: () => tablaEtiquetas(lb.etiquetas) }
    ].filter(Boolean)
  });
}

function detalleBalanceador(cx, { nombre }) {
  cx.migas([migaEc2, migaLbs, { texto: nombre }]);
  if (!lbDe(cx, nombre)) return noExiste(cx, 'Load balancer', nombre, 'ec2/balanceadores');
  const st = { pestana: 'oyentes' };
  return cx.vivo(() => {
    const lb = lbDe(cx, nombre);
    if (!lb) return noExiste(cx, 'Load balancer', nombre, 'ec2/balanceadores');
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({
        titulo: lb.nombre,
        info: 'elb-balanceador',
        cx,
        acciones: [ui.botonRefrescar(() => cx.refrescar()), botonNavegador(cx, lb), accionesLb(cx, [lb], { alBorrar: () => cx.ir('ec2/balanceadores') })]
      }),
      lb.estado === 'provisioning'
        ? ui.alerta({ tipo: 'info', titulo: 'Provisioning', contenido: 'Tu balanceador se está preparando: mientras diga Provisioning su DNS todavía no responde. Tarda unos 20 segundos en el simulador (unos minutos en AWS).' })
        : null,
      lb.tipo !== 'application' ? ui.alerta({ tipo: 'info', contenido: 'Aviso del simulador: este tipo de balanceador no reparte tráfico aquí. Úsalo para conocer sus opciones.' }) : null,
      ui.contenedor({ titulo: 'Details', cuerpo: paresLb(cx, lb) }),
      pestanasLb(cx, lb, st, { conDetalles: false })
    );
  });
}

/* ---------------------------------------------------------- listeners */

function tablaOyentes(cx, lb) {
  const t = ui.tabla(cx, {
    titulo: 'Listeners and rules',
    info: 'elb-oyente',
    variante: 'contenedor',
    descripcion: 'A listener checks for connection requests on its configured protocol and port. Traffic received by the listener is routed according to the default action and any additional rules.',
    filas: () => lbDe(cx, lb.nombre)?.oyentes ?? [],
    clave: (o) => o.arn,
    seleccion: 'unica',
    filtro: 'Filter listeners',
    columnas: [
      { titulo: 'Protocol:Port', valor: (o) => ui.enlace(protoPuerto(o), `ec2/balanceadores/${lb.nombre}/oyentes/${o.puerto}`, { cx }) },
      {
        titulo: 'Default action',
        valor: (o) => (o.accion?.tipo === 'forward' ? h('span', {}, 'Forward to target group', h('br'), '• ', enlaceTg(cx, o.accion.tgArn), ': 1 (100%)') : 'Return fixed response'),
        texto: (o) => tgPorArn(cx, o.accion?.tgArn)?.nombre ?? ''
      },
      { titulo: 'Rules', valor: (o) => ui.enlace(`${o.reglas.length + 1} rule${o.reglas.length ? 's' : ''}`, `ec2/balanceadores/${lb.nombre}/oyentes/${o.puerto}`, { cx }) },
      { titulo: 'ARN', valor: (o) => ui.copiable(o.arn, { soloIcono: true }), texto: (o) => o.arn },
      { titulo: 'Security policy', valor: () => 'Not applicable' },
      { titulo: 'Default SSL/TLS certificate', valor: () => 'Not applicable' }
    ],
    acciones: (sel) => [
      ui.menuBoton(
        'Manage listener',
        () => [
          { texto: 'Edit listener', desactivado: sel.length !== 1, escribe: true, alClic: () => modalEditarOyente(cx, lb, sel[0]) },
          { texto: 'Manage rules', desactivado: sel.length !== 1 || lb.tipo !== 'application', alClic: () => cx.ir(`ec2/balanceadores/${lb.nombre}/oyentes/${sel[0].puerto}`) },
          '-',
          { texto: 'Delete listener', desactivado: sel.length !== 1, escribe: true, alClic: () => confirmarBorrarOyente(cx, lb, sel[0], () => t.seleccionar([])) }
        ],
        { desactivado: !sel.length }
      ),
      ui.boton('Add listener', { escribe: true, desactivado: lb.tipo === 'gateway', alClic: () => cx.ir(`ec2/balanceadores/${lb.nombre}/oyente-nuevo`) })
    ],
    vacio: { titulo: 'No listeners', texto: 'This load balancer has no listeners. It won’t receive traffic until you add one.' }
  });
  return t;
}

function confirmarBorrarOyente(cx, lb, o, alTerminar) {
  cx.confirmar({
    titulo: 'Delete listener?',
    textoBoton: 'Delete',
    contenido: h('p', {}, `Are you sure you want to delete the listener ${protoPuerto(o)} from ${lb.nombre}? Its rules are deleted too, and the load balancer stops accepting traffic on port ${o.puerto}.`),
    palabra: 'confirm',
    aceptar: () => {
      const r = cx.hacer({ servicio: 'ELB', accion: 'DeleteListener', error: 'Failed to delete listener' }, (e) => eliminarOyente(e, o.arn));
      if (!r.ok) return false;
      cx.flash({ tipo: 'exito', texto: `Successfully deleted listener ${protoPuerto(o)}.` });
      alTerminar?.();
    }
  });
}

function modalEditarOyente(cx, lb, o) {
  const f = { puerto: String(o.puerto), tgArn: o.accion?.tgArn ?? null };
  const m = cx.modal({
    titulo: `Edit listener ${protoPuerto(o)}`,
    ancho: 'mediano',
    contenido: h(
      'div',
      { class: 'cx-form' },
      ui.campo({ etiqueta: 'Protocol', control: ui.entrada({ valor: o.protocolo, desactivado: true }) }),
      ui.campo({ etiqueta: 'Port', control: ui.entrada({ valor: f.puerto, tipo: 'number', desactivado: lb.tipo === 'gateway', alCambiar: (v) => (f.puerto = v) }) }),
      ui.campo({
        etiqueta: 'Default action',
        descripcion: 'Forward to target group',
        control: ui.selector({ opciones: gruposCompatibles(cx, lb.tipo, lb.vpcId, lb.arn).map(opcionTg), valor: f.tgArn, filtrar: true, placeholder: 'Select a target group', alCambiar: (v) => (f.tgArn = v) })
      })
    ),
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Save changes', {
        variante: 'primario',
        alClic: () => {
          const r = cx.hacer({ servicio: 'ELB', accion: 'ModifyListener', error: 'Failed to modify listener' }, (e) => editarOyente(e, o.arn, { puerto: f.puerto, tgArn: f.tgArn }));
          if (r.ok) {
            m.cerrar();
            cx.flash({ tipo: 'exito', texto: `Successfully modified listener ${protoPuerto(r.valor)}.` });
          }
        }
      })
    ]
  });
}

function nuevoOyentePagina(cx, { nombre }) {
  cx.migas([migaEc2, migaLbs, { texto: nombre, ruta: `ec2/balanceadores/${nombre}` }, { texto: 'Add listener' }]);
  const lb = lbDe(cx, nombre);
  if (!lb) return noExiste(cx, 'Load balancer', nombre, 'ec2/balanceadores');
  const f = { protocolo: PROTOCOLOS_OYENTE[lb.tipo][0], puerto: '', tgArn: null, error: null };
  const form = ui.region(() =>
    ui.contenedor({
      titulo: 'Listener details',
      info: 'elb-oyente',
      cx,
      descripcion: `A listener is a process that checks for connection requests using the port and protocol you configure. Load balancer: ${lb.nombre}`,
      cuerpo: h(
        'div',
        { class: 'cx-form', style: { maxWidth: '640px' } },
        h(
          'div',
          { class: 'cx-fila-campos' },
          ui.campo({
            etiqueta: 'Protocol',
            control: ui.selector({ opciones: PROTOCOLOS_OYENTE[lb.tipo].map((p) => ({ valor: p, etiqueta: p, desactivado: p === 'HTTPS' || p === 'TLS' })), valor: f.protocolo, alCambiar: (v) => (f.protocolo = v) })
          }),
          ui.campo({ etiqueta: 'Port', control: ui.entrada({ valor: f.puerto, tipo: 'number', placeholder: '8080', alCambiar: (v) => (f.puerto = v) }), error: f.error, restriccion: '1-65535' })
        ),
        ui.campo({
          etiqueta: 'Default action',
          info: 'elb-reglas',
          cx,
          descripcion: 'Forward to target group',
          control: ui.selector({ opciones: () => gruposCompatibles(cx, lb.tipo, lb.vpcId, lb.arn).map(opcionTg), valor: f.tgArn, filtrar: true, placeholder: 'Select a target group', vacio: 'No compatible target groups', alCambiar: (v) => (f.tgArn = v) })
        })
      )
    })
  );
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Add listener', info: 'elb-oyente', cx }),
    form,
    ui.pieFormulario({
      cancelar: () => cx.ir(`ec2/balanceadores/${nombre}`),
      textoEnviar: 'Add',
      enviar: () => {
        f.error = String(f.puerto).trim() ? null : 'Port is required.';
        if (f.error) return form.repintar();
        const r = cx.hacer({ servicio: 'ELB', accion: 'CreateListener', error: 'Failed to create listener' }, (e) => agregarOyente(e, lb.arn, { protocolo: f.protocolo, puerto: f.puerto, tgArn: f.tgArn }));
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: `Successfully created listener ${protoPuerto(r.valor)}.` });
          cx.ir(`ec2/balanceadores/${nombre}`);
        }
      }
    })
  );
}

/** El detalle de un listener con sus reglas (Manage rules). */
function detalleOyente(cx, { nombre, puerto }) {
  cx.migas([migaEc2, migaLbs, { texto: nombre, ruta: `ec2/balanceadores/${nombre}` }, { texto: `Listener ${puerto}` }]);
  const buscarOyente = () => lbDe(cx, nombre)?.oyentes.find((o) => String(o.puerto) === String(puerto)) ?? null;
  if (!buscarOyente()) return noExiste(cx, 'Listener', `${nombre}:${puerto}`, `ec2/balanceadores/${nombre}`);
  const lb = lbDe(cx, nombre);
  // La tabla se arma dentro de la zona viva: un nodo de afuera se movería al borrador de cada repintado.
  const tablaReglas = () => {
    const t = ui.tabla(cx, {
      titulo: 'Listener rules',
      info: 'elb-reglas',
      variante: 'contenedor',
      descripcion: 'Rules are evaluated in priority order, from the lowest value to the highest value. The default rule is evaluated last.',
      filas: () => {
        const o = buscarOyente();
        if (!o) return [];
        return [...o.reglas.map((r) => ({ ...r, defecto: false })), { arn: `${o.arn}/default`, prioridad: 'Last (default)', rutas: [], tgArn: o.accion?.tgArn, defecto: true }];
      },
      clave: (r) => r.arn,
      seleccion: 'unica',
      filtro: false,
      columnas: [
        { titulo: 'Priority', valor: (r) => String(r.prioridad) },
        { titulo: 'Conditions (If)', valor: (r) => (r.defecto ? h('span', { class: 'cx-texto-sec' }, 'If no other rule applies') : h('span', {}, 'Path Pattern is ', r.rutas.map((p, i) => [i ? ' OR ' : '', h('code', {}, p)]))) },
        { titulo: 'Actions (Then)', valor: (r) => h('span', {}, 'Forward to target group', h('br'), '• ', enlaceTg(cx, r.tgArn), ': 1 (100%)') },
        { titulo: 'ARN', valor: (r) => (r.defecto ? 'Default' : ui.copiable(r.arn, { soloIcono: true })), texto: (r) => r.arn }
      ],
      acciones: (sel) => [
        ui.boton('Remove rule', {
          escribe: true,
          desactivado: sel.length !== 1 || sel[0].defecto,
          alClic: () =>
            cx.confirmar({
              titulo: 'Remove rule?',
              textoBoton: 'Remove',
              contenido: h('p', {}, `Are you sure you want to remove the rule with priority ${sel[0].prioridad}?`),
              aceptar: () => {
                const r = cx.hacer({ servicio: 'ELB', accion: 'DeleteRule', error: 'Failed to delete rule' }, (e) => eliminarReglaOyente(e, sel[0].arn));
                if (!r.ok) return false;
                cx.flash({ tipo: 'exito', texto: 'Successfully removed rule.' });
                t.seleccionar([]);
              }
            })
        }),
        ui.boton('Add rule', { variante: 'primario', desactivado: lb.tipo !== 'application', alClic: () => modalRegla(cx, lb, buscarOyente()) })
      ]
    });
    return t;
  };
  return cx.vivo(() => {
    const o = buscarOyente();
    if (!o) return noExiste(cx, 'Listener', `${nombre}:${puerto}`, `ec2/balanceadores/${nombre}`);
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({ titulo: `${protoPuerto(o)} listener`, info: 'elb-oyente', cx, acciones: [ui.boton('Edit listener', { escribe: true, alClic: () => modalEditarOyente(cx, lb, o) })] }),
      ui.contenedor({
        titulo: 'Listener details',
        cuerpo: ui.pares(
          [
            { etiqueta: 'Load balancer', valor: ui.enlace(lb.nombre, `ec2/balanceadores/${lb.nombre}`, { cx }) },
            { etiqueta: 'Protocol:Port', valor: protoPuerto(o) },
            { etiqueta: 'Default action', valor: h('span', {}, 'Forward to target group ', enlaceTg(cx, o.accion?.tgArn)) },
            { etiqueta: 'Listener ARN', valor: ui.copiable(o.arn) }
          ],
          { columnas: 4 }
        )
      }),
      tablaReglas()
    );
  });
}

function modalRegla(cx, lb, o) {
  const siguiente = (o.reglas.at(-1)?.prioridad ?? 0) + 1;
  const f = { prioridad: String(siguiente), rutas: '', tgArn: null };
  const m = cx.modal({
    titulo: 'Add rule',
    ancho: 'mediano',
    contenido: h(
      'div',
      { class: 'cx-form' },
      ui.alerta({ tipo: 'info', contenido: 'En el simulador las reglas solo usan la condición «Path» (path pattern), la más común en el examen.' }),
      ui.campo({
        etiqueta: 'Path pattern',
        info: 'elb-reglas',
        cx,
        descripcion: 'Up to 5 values separated by commas. Wildcards are supported: * (multiple characters) and ? (one character). Example: /images/*',
        control: ui.entrada({ valor: f.rutas, placeholder: '/api/*', alCambiar: (v) => (f.rutas = v) })
      }),
      ui.campo({
        etiqueta: 'Then: Forward to target group',
        control: ui.selector({ opciones: gruposCompatibles(cx, lb.tipo, lb.vpcId, lb.arn).map(opcionTg), valor: f.tgArn, filtrar: true, placeholder: 'Select a target group', alCambiar: (v) => (f.tgArn = v) })
      }),
      ui.campo({ etiqueta: 'Priority', descripcion: 'Rules are evaluated in priority order, from the lowest value to the highest value.', control: ui.entrada({ valor: f.prioridad, tipo: 'number', min: 1, max: 50000, alCambiar: (v) => (f.prioridad = v) }), restriccion: '1-50000' })
    ),
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Create', {
        variante: 'primario',
        alClic: () => {
          const r = cx.hacer({ servicio: 'ELB', accion: 'CreateRule', error: 'Failed to create rule' }, (e) =>
            agregarReglaOyente(e, o.arn, { prioridad: f.prioridad, rutas: f.rutas.split(','), tgArn: f.tgArn })
          );
          if (r.ok) {
            m.cerrar();
            cx.flash({ tipo: 'exito', texto: `Successfully created rule with priority ${r.valor.prioridad}.` });
          }
        }
      })
    ]
  });
}

/* ---------------------------------------------------------- network mapping */

function pestanaRed(cx, lb) {
  return ui.contenedor({
    titulo: 'Network mapping',
    info: 'elb-zonas',
    cx,
    descripcion: 'Targets in the listed Availability Zones and subnets are available for traffic from the load balancer using the IP addresses shown.',
    acciones: ui.boton('Edit subnets', { escribe: true, alClic: () => modalSubredesLb(cx, lb) }),
    cuerpo: h(
      'div',
      { class: 'cx-pagina' },
      ui.pares([{ etiqueta: 'VPC', valor: enlaceRecurso(cx, lb.vpcId, { conNombre: true }) }, { etiqueta: 'Load balancer IP address type', valor: 'IPv4' }], { columnas: 2, cx }),
      h(
        'table',
        { class: 'cx-tabla__tabla' },
        h('thead', {}, h('tr', {}, ['Zone', 'Subnet', 'IPv4 address'].map((c) => h('th', {}, h('span', { class: 'cx-tabla__orden' }, c))))),
        h('tbody', {}, zonasDe(cx, lb).map((s) => h('tr', {}, h('td', { style: { paddingLeft: '20px' } }, `${s.az} (${ID_ZONA[s.az] ?? ''})`), h('td', {}, enlaceRecurso(cx, s.id, { conNombre: true })), h('td', {}, 'Assigned by AWS'))))
      )
    )
  });
}

function modalSubredesLb(cx, lb) {
  const e = cx.estado;
  const zonas = {};
  for (const s of zonasDe(cx, lb)) zonas[s.az] = s.id;
  const subredesVpc = e.subredes.filter((s) => s.vpcId === lb.vpcId);
  const azs = [...new Set(subredesVpc.map((s) => s.az))].sort();
  const cuerpo = ui.region(() =>
    h(
      'div',
      { class: 'cx-elb-zonas' },
      azs.map((az) => {
        const marcada = Object.hasOwn(zonas, az);
        const opciones = subredesVpc.filter((s) => s.az === az);
        return h(
          'div',
          { class: ['cx-elb-zona', marcada && 'cx-elb-zona--activa'] },
          ui.casilla({ etiqueta: `${az} (${ID_ZONA[az] ?? ''})`, marcada, alCambiar: (v) => (v ? (zonas[az] = opciones[0]?.id ?? null) : delete zonas[az], cuerpo.repintar()) }),
          marcada ? h('div', { class: 'cx-elb-zona__subred' }, ui.selector({ opciones: opciones.map((s) => opcionSubred(e, s)), valor: zonas[az], alCambiar: (v) => (zonas[az] = v) })) : null
        );
      })
    )
  );
  const m = cx.modal({
    titulo: `Edit subnets: ${lb.nombre}`,
    ancho: 'grande',
    contenido: h('div', { class: 'cx-form' }, h('p', { class: 'cx-texto-sec' }, lb.tipo === 'application' ? 'Select at least two Availability Zones and one subnet per zone.' : 'Select at least one Availability Zone and one subnet per zone.'), cuerpo),
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Save changes', {
        variante: 'primario',
        alClic: () => {
          const r = cx.hacer({ servicio: 'ELB', accion: 'SetSubnets', error: 'Failed to update subnets' }, (est) => editarSubredesBalanceador(est, lb.arn, Object.values(zonas).filter(Boolean)));
          if (r.ok) {
            m.cerrar();
            cx.flash({ tipo: 'exito', texto: `Successfully updated subnets for ${lb.nombre}.` });
          }
        }
      })
    ]
  });
}

/* ---------------------------------------------------------- resource map */

/** Listeners → Rules → Target groups → Targets, con la salud de cada destino. */
function mapaRecursos(cx, lb) {
  const reglas = lb.oyentes.flatMap((o) => [...o.reglas.map((r) => ({ o, texto: `${r.prioridad}: Path is ${r.rutas.join(', ')}`, tgArn: r.tgArn })), { o, texto: 'Default', tgArn: o.accion?.tgArn }]);
  const tgs = [...new Set(lb.oyentes.flatMap(gruposDeOyente))].map((a) => tgPorArn(cx, a)).filter(Boolean);
  const col = (titulo, n, cuerpo) => h('div', { class: 'cx-elb-mapa__col' }, h('div', { class: 'cx-elb-mapa__titulo' }, `${titulo} (${n})`), cuerpo);
  const caja = (contenido, clase) => h('div', { class: ['cx-elb-mapa__caja', clase] }, contenido);
  return ui.contenedor({
    titulo: 'Resource map',
    info: 'elb-mapa',
    cx,
    descripcion: 'The resource map shows how the listeners, rules, target groups and targets of this load balancer are connected.',
    cuerpo: h(
      'div',
      { class: 'cx-elb-mapa' },
      col('Listeners', lb.oyentes.length, lb.oyentes.map((o) => caja([h('b', {}, protoPuerto(o)), h('small', {}, `${o.reglas.length + 1} rule${o.reglas.length ? 's' : ''}`)]))),
      col('Rules', reglas.length, reglas.map((r) => caja([h('b', {}, r.texto), h('small', {}, `${protoPuerto(r.o)} → ${tgPorArn(cx, r.tgArn)?.nombre ?? '–'}`)]))),
      col(
        'Target groups',
        tgs.length,
        tgs.map((g) => {
          const c = conteoSalud(g);
          return caja([ui.enlace(g.nombre, `ec2/grupos-destino/${g.nombre}`, { cx }), h('small', {}, `${g.protocolo}:${g.puerto} · ${c.healthy} healthy · ${c.unhealthy} unhealthy`)]);
        })
      ),
      col(
        'Targets',
        tgs.reduce((s, g) => s + g.destinos.length, 0),
        tgs.flatMap((g) =>
          g.destinos.map((d) => {
            const i = instDe(cx, d.id);
            return caja([ui.enlace(d.id, `ec2/instancias/${d.id}`, { cx }), h('small', {}, `${i?.nombre || '–'} · ${i?.az ?? ''} · port ${d.puerto}`), estadoSalud(d.salud), d.motivo ? h('small', { class: 'cx-texto-sec' }, d.motivo.descripcion) : null], `cx-elb-mapa__caja--${d.salud}`);
          })
        )
      )
    )
  });
}

/* ---------------------------------------------------------- security, monitoring, attributes */

function pestanaSeguridad(cx, lb) {
  return ui.tabla(cx, {
    titulo: 'Security groups',
    info: 'elb-grupos-seguridad',
    variante: 'contenedor',
    descripcion: 'A security group is a set of firewall rules that control the traffic to your load balancer.',
    filas: () => (lbDe(cx, lb.nombre)?.gruposSeguridad ?? []).map((id) => cx.estado.gruposSeguridad.find((g) => g.id === id) ?? { id, nombre: '–', descripcion: '' }),
    clave: (g) => g.id,
    filtro: false,
    columnas: [
      { titulo: 'Security group ID', valor: (g) => enlaceRecurso(cx, g.id) },
      { titulo: 'Name', valor: (g) => g.nombre },
      { titulo: 'Description', valor: (g) => g.descripcion || '–' }
    ],
    acciones: () => [ui.boton('Edit', { escribe: true, alClic: () => modalGruposLb(cx, lb) })],
    vacio: { titulo: 'No security groups', texto: 'This load balancer has no security groups.' }
  });
}

function modalGruposLb(cx, lb) {
  let valores = [...lb.gruposSeguridad];
  const m = cx.modal({
    titulo: `Edit security groups: ${lb.nombre}`,
    ancho: 'mediano',
    contenido: h(
      'div',
      { class: 'cx-form' },
      ui.campo({
        etiqueta: 'Security groups',
        info: 'elb-grupos-seguridad',
        cx,
        descripcion: 'Select up to 5 security groups.',
        control: ui.selector({
          multiple: true,
          valores,
          filtrar: true,
          opciones: cx.estado.gruposSeguridad.filter((g) => g.vpcId === lb.vpcId).map((g) => ({ valor: g.id, etiqueta: g.nombre, descripcion: g.id })),
          alCambiar: (v) => (valores = v)
        })
      })
    ),
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Save changes', {
        variante: 'primario',
        alClic: () => {
          const r = cx.hacer({ servicio: 'ELB', accion: 'SetSecurityGroups', error: 'Failed to update security groups' }, (e) => editarGruposBalanceador(e, lb.arn, valores));
          if (r.ok) {
            m.cerrar();
            cx.flash({ tipo: 'exito', texto: `Successfully updated security groups for ${lb.nombre}.` });
          }
        }
      })
    ]
  });
}

function pestanaMonitoreo(cx, lb) {
  const tgs = [...new Set(lb.oyentes.flatMap(gruposDeOyente))].map((a) => tgPorArn(cx, a)).filter(Boolean);
  const total = (k) => tgs.reduce((s, g) => s + conteoSalud(g)[k], 0);
  return ui.contenedor({
    titulo: 'Monitoring',
    descripcion: 'Las gráficas completas (RequestCount, TargetResponseTime…) están en CloudWatch → All metrics → AWS/ApplicationELB.',
    cuerpo: h(
      'div',
      { class: 'cx-elb-conteos' },
      conteo('Healthy hosts', total('healthy'), 'exito'),
      conteo('Unhealthy hosts', total('unhealthy'), 'error'),
      conteo('Target groups', tgs.length),
      conteo('Listeners', lb.oyentes.length)
    )
  });
}

function pestanaAtributosLb(cx, lb) {
  const app = lb.tipo === 'application';
  return ui.contenedor({
    titulo: 'Attributes',
    descripcion: 'Load balancer attributes configure how your load balancer behaves.',
    acciones: ui.boton('Edit', { escribe: true, alClic: () => modalAtributosLb(cx, lb) }),
    cuerpo: ui.pares(
      [
        { etiqueta: 'Deletion protection', valor: lb.protegido ? 'On' : 'Off' },
        app ? { etiqueta: 'Connection idle timeout', valor: '60 seconds' } : null,
        app ? { etiqueta: 'HTTP/2', valor: 'On' } : null,
        { etiqueta: 'Cross-zone load balancing', valor: app ? 'On' : 'Off' },
        app ? { etiqueta: 'Drop invalid header fields', valor: 'Off' } : null,
        app ? { etiqueta: 'Desync mitigation mode', valor: 'Defensive' } : null,
        { etiqueta: 'Access logs', valor: 'Off' }
      ],
      { columnas: 3 }
    )
  });
}

function modalAtributosLb(cx, lb) {
  let protegido = lb.protegido;
  const m = cx.modal({
    titulo: `Edit load balancer attributes: ${lb.nombre}`,
    ancho: 'mediano',
    contenido: h(
      'div',
      { class: 'cx-form' },
      ui.campo({
        etiqueta: 'Deletion protection',
        descripcion: 'Prevents the load balancer from being deleted accidentally. This must be turned off before the load balancer can be deleted.',
        control: ui.interruptor({ etiqueta: 'Turn on deletion protection', marcada: protegido, alCambiar: (v) => (protegido = v) })
      }),
      h('p', { class: 'cx-texto-sec' }, 'Los demás atributos (idle timeout, HTTP/2, access logs…) se muestran, pero no se editan en el simulador.')
    ),
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Save changes', {
        variante: 'primario',
        alClic: () => {
          const r = cx.hacer({ servicio: 'ELB', accion: 'ModifyLoadBalancerAttributes', error: 'Failed to modify load balancer attributes' }, (e) => editarAtributosBalanceador(e, lb.arn, { protegido }));
          if (r.ok) {
            m.cerrar();
            cx.flash({ tipo: 'exito', texto: `Successfully modified attributes for ${lb.nombre}.` });
          }
        }
      })
    ]
  });
}

function tablaEtiquetas(etiquetas = []) {
  return ui.contenedor({
    titulo: 'Tags',
    contador: etiquetas.length,
    acciones: ui.boton('Manage tags', { desactivado: true }),
    sinRelleno: etiquetas.length > 0,
    cuerpo: etiquetas.length
      ? h(
          'table',
          { class: 'cx-tabla__tabla' },
          h('thead', {}, h('tr', {}, h('th', {}, h('span', { class: 'cx-tabla__orden' }, 'Key')), h('th', {}, h('span', { class: 'cx-tabla__orden' }, 'Value')))),
          h('tbody', {}, etiquetas.map((t) => h('tr', {}, h('td', { style: { paddingLeft: '20px' } }, t.llave), h('td', {}, t.valor || '–'))))
        )
      : h('div', { class: 'cx-tabla__vacia' }, h('b', {}, 'No tags'), h('div', {}, 'You don’t have any tags.'))
  });
}

const conteo = (titulo, n, tipo) => h('div', { class: 'cx-elb-conteo' }, h('div', { class: 'cx-texto-sec' }, titulo), h('div', { class: ['cx-elb-conteo__n', tipo && `cx-elb-conteo__n--${tipo}`] }, String(n)));

/* ======================================================= target groups: lista */

function confirmarBorrarTgs(cx, tgs, alTerminar) {
  cx.confirmar({
    titulo: `Delete target group${tgs.length > 1 ? 's' : ''}`,
    textoBoton: 'Yes, delete',
    contenido: [h('p', {}, `Are you sure you want to delete the following target group${tgs.length > 1 ? 's' : ''}?`), h('ul', {}, tgs.map((g) => h('li', {}, h('b', {}, g.nombre))))],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'ELB', accion: 'DeleteTargetGroup', error: 'Failed to delete target group' }, (e) => tgs.forEach((g) => eliminarGrupoDestino(e, g.arn)), { atomico: true });
      if (!r.ok) return false;
      cx.flash({ tipo: 'exito', texto: `Successfully deleted target group${tgs.length > 1 ? 's' : ''}: ${tgs.map((g) => g.nombre).join(', ')}` });
      alTerminar?.();
    }
  });
}

function accionesTg(cx, sel, { alBorrar } = {}) {
  const uno = sel.length === 1 ? sel[0] : null;
  return ui.menuBoton(
    'Actions',
    () => [
      { texto: 'View details', desactivado: !uno, alClic: () => cx.ir(`ec2/grupos-destino/${uno.nombre}`) },
      { texto: 'Register targets', desactivado: !uno, escribe: true, alClic: () => cx.ir(`ec2/grupos-destino/${uno.nombre}/registrar`) },
      { texto: 'Edit health check settings', desactivado: !uno, escribe: true, alClic: () => cx.ir(`ec2/grupos-destino/${uno.nombre}/chequeos`) },
      { texto: 'Edit target group attributes', desactivado: !uno, escribe: true, alClic: () => modalAtributosTg(cx, uno) },
      { texto: 'Associate with an existing load balancer', desactivado: true },
      { texto: 'Manage tags', desactivado: true },
      '-',
      { texto: 'Delete', desactivado: !sel.length, escribe: true, alClic: () => confirmarBorrarTgs(cx, sel, alBorrar) }
    ],
    { desactivado: !sel.length }
  );
}

function enlacesLb(cx, tg) {
  const lbs = balanceadoresDeGrupo(cx.estado, tg);
  return lbs.length ? h('span', {}, lbs.map((b, i) => [i ? ', ' : '', ui.enlace(b.nombre, `ec2/balanceadores/${b.nombre}`, { cx })])) : h('span', { class: 'cx-texto-sec' }, 'None associated');
}

function listaGrupos(cx) {
  cx.migas([migaEc2, { texto: 'Target groups' }]);
  const st = { pestana: 'destinos' };
  const t = ui.tabla(cx, {
    titulo: 'Target groups',
    info: 'elb-grupo-destino',
    descripcion: 'Your load balancer routes requests to the targets in a target group and performs health checks on the targets.',
    filas: () => elb(cx).gruposDestino,
    clave: (g) => g.arn,
    seleccion: 'multiple',
    filtro: 'Filter target groups',
    columnas: [
      { titulo: 'Name', valor: (g) => ui.enlace(g.nombre, `ec2/grupos-destino/${g.nombre}`, { cx }) },
      { titulo: 'ARN', valor: (g) => h('span', { class: 'cx-copiable' }, ui.copiable(g.arn, { soloIcono: true }), h('span', { class: 'cx-elb-arn' }, g.arn)), texto: (g) => g.arn },
      { titulo: 'Port', valor: (g) => String(g.puerto) },
      { titulo: 'Protocol', valor: (g) => g.protocolo },
      { titulo: 'Target type', valor: () => 'Instance' },
      { titulo: 'Load balancer', valor: (g) => enlacesLb(cx, g), texto: (g) => balanceadoresDeGrupo(cx.estado, g).map((b) => b.nombre).join(' ') },
      { titulo: 'VPC ID', valor: (g) => enlaceRecurso(cx, g.vpcId) }
    ],
    acciones: (sel) => [accionesTg(cx, sel, { alBorrar: () => t.seleccionar([]) }), ui.boton('Create target group', { variante: 'primario', alClic: () => cx.ir('ec2/grupos-destino/crear') })],
    vacio: { titulo: 'No target groups', texto: 'You don’t have any target groups in us-east-1.', accion: ui.boton('Create target group', { escribe: true, alClic: () => cx.ir('ec2/grupos-destino/crear') }) },
    alSeleccionar: () => panel.repintar()
  });
  const panel = cx.vivo(() => {
    const sel = t.seleccion();
    if (sel.length !== 1) return panelVacio(sel.length ? `${sel.length} target groups selected` : 'Select a target group');
    const g = sel[0];
    return ui.panelInferior({ titulo: `Target group: ${g.nombre}`, contenido: pestanasTg(cx, g, st) });
  });
  return h('div', { class: 'cx-pagina' }, t, panel);
}

/* ===================================================== crear un grupo de destino */

const chequeoNuevo = () => ({ protocolo: 'HTTP', ruta: '/', puertoTipo: 'traffic', puerto: '', sanos: '5', insanos: '2', espera: '5', intervalo: '30', codigos: '200' });

const chequeoDeForm = (c, capa7) => ({
  protocolo: c.protocolo,
  ruta: capa7 ? c.ruta : undefined,
  puerto: c.puertoTipo === 'traffic' ? 'traffic-port' : c.puerto,
  sanos: c.sanos,
  insanos: c.insanos,
  espera: c.espera,
  intervalo: c.intervalo,
  codigos: capa7 ? c.codigos : undefined
});

/** Las secciones «Health checks» y «Advanced health check settings» (crear y editar). */
function formularioChequeo(cx, c, { protocoloGrupo, abierto = false, alCambiar } = {}) {
  const capa7 = ['HTTP', 'HTTPS'].includes(protocoloGrupo);
  const el = ui.region(() =>
    h(
      'div',
      { class: 'cx-form', style: { maxWidth: '720px' } },
      ui.campo({
        etiqueta: 'Health check protocol',
        info: 'elb-chequeo',
        cx,
        control: ui.selector({
          opciones: (capa7 ? ['HTTP', 'HTTPS'] : ['TCP', 'HTTP', 'HTTPS']).map((p) => ({ valor: p, etiqueta: p })),
          valor: c.protocolo,
          alCambiar: (v) => ((c.protocolo = v), el.repintar(), alCambiar?.())
        })
      }),
      c.protocolo !== 'TCP'
        ? ui.campo({
            etiqueta: 'Health check path',
            info: 'elb-chequeo',
            cx,
            descripcion: 'Use the default path of "/" to perform health checks on the root, or specify a custom path if preferred.',
            control: ui.entrada({ valor: c.ruta, placeholder: '/', alCambiar: (v) => (c.ruta = v) }),
            restriccion: 'Up to 1024 characters allowed.'
          })
        : null,
      ui.expandible({
        titulo: 'Advanced health check settings',
        abierto,
        contenido: h(
          'div',
          { class: 'cx-form' },
          ui.campo({
            etiqueta: 'Health check port',
            descripcion: 'The port the load balancer uses when performing health checks on targets. By default, the health check port is the same as the target group’s traffic port.',
            control: h(
              'div',
              {},
              ui.radios({
                valor: c.puertoTipo,
                alCambiar: (v) => ((c.puertoTipo = v), el.repintar()),
                opciones: [
                  { valor: 'traffic', etiqueta: 'Traffic port' },
                  { valor: 'override', etiqueta: 'Override' }
                ]
              }),
              c.puertoTipo === 'override' ? h('div', { style: { maxWidth: '200px', marginTop: '8px' } }, ui.entrada({ valor: c.puerto, tipo: 'number', placeholder: '80', alCambiar: (v) => (c.puerto = v) })) : null
            )
          }),
          h(
            'div',
            { class: 'cx-fila-campos' },
            ui.campo({ etiqueta: 'Healthy threshold', info: 'elb-umbrales', cx, descripcion: 'The number of consecutive health checks successes required before considering an unhealthy target healthy.', control: ui.entrada({ valor: c.sanos, tipo: 'number', alCambiar: (v) => (c.sanos = v) }), restriccion: '2-10' }),
            ui.campo({ etiqueta: 'Unhealthy threshold', info: 'elb-umbrales', cx, descripcion: 'The number of consecutive health check failures required before considering a target unhealthy.', control: ui.entrada({ valor: c.insanos, tipo: 'number', alCambiar: (v) => (c.insanos = v) }), restriccion: '2-10' })
          ),
          h(
            'div',
            { class: 'cx-fila-campos' },
            ui.campo({ etiqueta: 'Timeout', descripcion: 'The amount of time, in seconds, during which no response means a failed health check.', control: ui.entrada({ valor: c.espera, tipo: 'number', sufijo: 'seconds', alCambiar: (v) => (c.espera = v) }), restriccion: '2-120' }),
            ui.campo({ etiqueta: 'Interval', descripcion: 'The approximate amount of time between health checks of an individual target.', control: ui.entrada({ valor: c.intervalo, tipo: 'number', sufijo: 'seconds', alCambiar: (v) => (c.intervalo = v) }), restriccion: '5-300' })
          ),
          c.protocolo !== 'TCP'
            ? ui.campo({ etiqueta: 'Success codes', info: 'elb-chequeo', cx, descripcion: 'The HTTP codes to use when checking for a successful response from a target. You can specify multiple values (for example, "200,202") or a range of values (for example, "200-299").', control: ui.entrada({ valor: c.codigos, alCambiar: (v) => (c.codigos = v) }), restriccion: '200-499' })
            : null,
          h('p', { class: 'cx-texto-sec' }, 'En el simulador cada chequeo tarda 5 s (no el intervalo real): así ves el cambio de salud en clase.')
        )
      })
    )
  );
  return el;
}

/** Tabla «Available instances» + puerto + «Include as pending below» + «Review targets». */
function selectorDestinos(cx, f, vpcId) {
  const disponibles = ui.tabla(cx, {
    titulo: 'Available instances',
    variante: 'contenedor',
    filas: () => cx.estado.instancias.filter((i) => i.vpcId === vpcId && !['terminated', 'shutting-down'].includes(i.estado)),
    clave: (i) => i.id,
    seleccion: 'multiple',
    filtro: 'Filter resources by property or value',
    columnas: [
      { titulo: 'Instance ID', valor: (i) => i.id },
      { titulo: 'Name', valor: (i) => i.nombre || '–' },
      { titulo: 'State', valor: (i) => estadoInstancia(i), texto: (i) => i.estado },
      { titulo: 'Security groups', valor: (i) => i.gruposSeguridad.map((g) => cx.estado.gruposSeguridad.find((x) => x.id === g)?.nombre ?? g).join(', ') },
      { titulo: 'Zone', valor: (i) => `${i.az} (${ID_ZONA[i.az] ?? ''})` },
      { titulo: 'Private IPv4 address', valor: (i) => i.ipPrivada },
      { titulo: 'Subnet ID', valor: (i) => i.subredId }
    ],
    vacio: { titulo: 'No instances', texto: 'There are no instances in this VPC. Launch an instance first.' }
  });
  const revisar = ui.region(() =>
    ui.contenedor({
      titulo: 'Review targets',
      contador: f.pendientes.length,
      acciones: ui.boton('Remove all pending', { desactivado: !f.pendientes.length, alClic: () => ((f.pendientes.length = 0), revisar.repintar()) }),
      sinRelleno: f.pendientes.length > 0,
      cuerpo: f.pendientes.length
        ? h(
            'table',
            { class: 'cx-tabla__tabla' },
            h('thead', {}, h('tr', {}, ['Remove', 'Health status', 'Instance ID', 'Name', 'Port', 'Zone'].map((c) => h('th', {}, h('span', { class: 'cx-tabla__orden' }, c))))),
            h(
              'tbody',
              {},
              f.pendientes.map((p, k) => {
                const i = instDe(cx, p.id);
                return h(
                  'tr',
                  {},
                  h('td', { style: { paddingLeft: '20px' } }, ui.boton('', { variante: 'icono', icono: 'close', titulo: 'Remove', alClic: () => (f.pendientes.splice(k, 1), revisar.repintar()) })),
                  h('td', {}, ui.estado('espera', 'Pending')),
                  h('td', {}, p.id),
                  h('td', {}, i?.nombre || '–'),
                  h('td', {}, String(p.puerto)),
                  h('td', {}, i?.az ?? '–')
                );
              })
            )
          )
        : h('div', { class: 'cx-tabla__vacia' }, h('b', {}, 'No pending targets'), h('div', {}, 'Select instances above and choose «Include as pending below».'))
    })
  );
  const puertoCampo = ui.region(() =>
    h(
      'div',
      { class: 'cx-elb-pendientes' },
      ui.campo({
        etiqueta: 'Ports for the selected instances',
        descripcion: 'Ports for routing traffic to the selected instances.',
        control: ui.entrada({ valor: f.puertoSel, tipo: 'number', alCambiar: (v) => (f.puertoSel = v) }),
        error: f.errorPuerto,
        restriccion: '1-65535 (separate multiple ports with commas)'
      }),
      ui.boton('Include as pending below', {
        alClic: () => {
          const sel = disponibles.seleccion();
          const puertos = String(f.puertoSel).split(',').map((p) => Number(p.trim())).filter((p) => Number.isInteger(p) && p >= 1 && p <= 65535);
          f.errorPuerto = puertos.length ? null : 'Enter a valid port (1-65535).';
          if (!f.errorPuerto) {
            for (const i of sel) for (const p of puertos) if (!f.pendientes.some((x) => x.id === i.id && x.puerto === p)) f.pendientes.push({ id: i.id, puerto: p });
            disponibles.seleccionar([]);
          }
          puertoCampo.repintar();
          revisar.repintar();
        }
      })
    )
  );
  return h('div', { class: 'cx-pagina' }, disponibles, puertoCampo, revisar);
}

/** El marco de un asistente: los pasos a la izquierda y el contenido a la derecha. */
function asistente(cx, { pasos, paso, titulo, info, descripcion, cuerpo, pie }) {
  return h(
    'div',
    { class: 'cx-asis' },
    h(
      'nav',
      { class: 'cx-asis__pasos', 'aria-label': 'Steps' },
      h(
        'ol',
        {},
        pasos.map((p, i) =>
          h('li', { class: ['cx-asis__paso', i === paso && 'cx-asis__paso--actual', i > paso && 'cx-asis__paso--futuro'], 'aria-current': i === paso ? 'step' : undefined }, h('small', {}, `Step ${i + 1}`), h('span', {}, p))
        )
      )
    ),
    h('div', { class: 'cx-asis__cuerpo cx-pagina' }, ui.encabezado({ titulo, info, cx, descripcion }), cuerpo, pie)
  );
}

function crearGrupoPagina(cx) {
  cx.migas([migaEc2, migaTgs, { texto: 'Create target group' }]);
  const e = cx.estado;
  const volver = cx.memoria.volverABalanceador ?? null;
  const vpcInicial = volver && cx.memoria.borradorBalanceador?.vpcId ? cx.memoria.borradorBalanceador.vpcId : vpcPorDefecto(cx)?.id;
  const tipoLb = volver?.tipo ?? 'application';
  const f = {
    paso: 0,
    nombre: '',
    protocolo: tipoLb === 'network' ? 'TCP' : tipoLb === 'gateway' ? 'GENEVE' : 'HTTP',
    puerto: tipoLb === 'gateway' ? '6081' : '80',
    vpcId: vpcInicial ?? null,
    version: 'HTTP1',
    chequeo: chequeoNuevo(),
    etiquetas: [],
    pendientes: [],
    puertoSel: '80',
    errores: {}
  };
  if (tipoLb !== 'application') f.chequeo.protocolo = 'TCP';
  const capa7 = () => ['HTTP', 'HTTPS'].includes(f.protocolo);
  const parametros = () => ({ nombre: f.nombre.trim(), tipoDestino: 'instance', protocolo: f.protocolo, puerto: f.puerto, vpcId: f.vpcId, versionProtocolo: capa7() ? f.version : null, chequeo: chequeoDeForm(f.chequeo, f.chequeo.protocolo !== 'TCP'), etiquetas: f.etiquetas });

  const vista = ui.region(() => (f.paso === 0 ? paso1() : paso2()));

  function paso1() {
    const chequeo = formularioChequeo(cx, f.chequeo, { protocoloGrupo: f.protocolo });
    return asistente(cx, {
      pasos: ['Specify group details', 'Register targets'],
      paso: 0,
      titulo: 'Specify group details',
      info: 'elb-grupo-destino',
      descripcion: 'Your load balancer routes requests to the targets in a target group and performs health checks on the targets.',
      cuerpo: [
        ui.contenedor({
          titulo: 'Basic configuration',
          descripcion: 'Settings in this section can’t be changed after the target group is created.',
          cuerpo: h(
            'div',
            { class: 'cx-form', style: { maxWidth: '760px' } },
            ui.campo({
              etiqueta: 'Choose a target type',
              info: 'elb-grupo-destino',
              cx,
              control: ui.tarjetas({
                valor: 'instance',
                columnas: 2,
                opciones: [
                  { valor: 'instance', etiqueta: 'Instances', descripcion: 'Supports load balancing to instances within a specific VPC. Facilitates the use of Amazon EC2 Auto Scaling to manage and scale your EC2 capacity.' },
                  { valor: 'ip', etiqueta: 'IP addresses', descripcion: 'Supports load balancing to VPC and on-premises resources.', desactivado: true },
                  { valor: 'lambda', etiqueta: 'Lambda function', descripcion: 'Facilitates routing to a single Lambda function.', desactivado: true },
                  { valor: 'alb', etiqueta: 'Application Load Balancer', descripcion: 'Offers the flexibility for a Network Load Balancer to accept and route TCP requests within a specific VPC.', desactivado: true }
                ]
              })
            }),
            ui.campo({
              etiqueta: 'Target group name',
              control: ui.entrada({ valor: f.nombre, placeholder: 'Enter target group name', alCambiar: (v) => (f.nombre = v) }),
              error: f.errores.nombre,
              restriccion: 'A maximum of 32 alphanumeric characters including hyphens are allowed, but the name must not begin or end with a hyphen.'
            }),
            ui.campo({
              etiqueta: 'Protocol : Port',
              descripcion: 'Choose a protocol for your target group that corresponds to the Load Balancer type that will route traffic to it. Some protocols now include anomaly detection for the targets and you can set mitigation options once your target group is created.',
              control: h(
                'div',
                { class: 'cx-elb-proto-puerto' },
                ui.selector({
                  opciones: ['HTTP', 'HTTPS', 'TCP', 'TLS', 'UDP', 'TCP_UDP', 'GENEVE'].map((p) => ({ valor: p, etiqueta: p })),
                  valor: f.protocolo,
                  alCambiar: (v) => {
                    f.protocolo = v;
                    if (v === 'GENEVE') f.puerto = '6081';
                    else if (v === 'HTTPS' || v === 'TLS') f.puerto = '443';
                    else if (f.puerto === '6081' || f.puerto === '443') f.puerto = '80';
                    f.chequeo.protocolo = capa7() ? v : 'TCP';
                    vista.repintar();
                  }
                }),
                h('span', {}, ':'),
                ui.entrada({ valor: f.puerto, tipo: 'number', min: 1, max: 65535, desactivado: f.protocolo === 'GENEVE', alCambiar: (v) => ((f.puerto = v), (f.puertoSel = v)) })
              ),
              restriccion: '1-65535'
            }),
            ui.campo({
              etiqueta: 'IP address type',
              descripcion: 'Only targets with the indicated IP address type can be included in this target group.',
              control: ui.radios({ valor: 'ipv4', opciones: [{ valor: 'ipv4', etiqueta: 'IPv4' }, { valor: 'ipv6', etiqueta: 'IPv6', desactivado: true }] })
            }),
            ui.campo({
              etiqueta: 'VPC',
              descripcion: 'Select the VPC with the instances that you want to include in the target group. Only VPCs that support the IP address type selected above are available in this list.',
              control: ui.selector({ opciones: opcionesVpc(e), valor: f.vpcId, filtrar: true, alCambiar: (v) => ((f.vpcId = v), (f.pendientes = [])) })
            }),
            capa7()
              ? ui.campo({
                  etiqueta: 'Protocol version',
                  control: ui.radios({
                    valor: f.version,
                    alCambiar: (v) => (f.version = v),
                    opciones: [
                      { valor: 'HTTP1', etiqueta: 'HTTP1', descripcion: 'Send requests to targets using HTTP/1.1. Supported when the request protocol is HTTP/1.1 or HTTP/2.' },
                      { valor: 'HTTP2', etiqueta: 'HTTP2', descripcion: 'Send requests to targets using HTTP/2. Supported when the request protocol is HTTP/2 or gRPC, but gRPC-specific features are not available.', desactivado: true },
                      { valor: 'gRPC', etiqueta: 'gRPC', descripcion: 'Send requests to targets using gRPC. Supported when the request protocol is gRPC.', desactivado: true }
                    ]
                  })
                })
              : null
          )
        }),
        ui.contenedor({ titulo: 'Health checks', info: 'elb-chequeo', cx, descripcion: 'The associated load balancer periodically sends requests, per the settings below, to the registered targets to test their status.', cuerpo: chequeo }),
        ui.contenedor({ titulo: 'Attributes', descripcion: 'Certain default attributes will be applied to your target group. You can view and edit them after creating the target group.', cuerpo: h('p', { class: 'cx-texto-sec' }, 'Deregistration delay: 300 seconds · Load balancing algorithm: Round robin · Stickiness: Off') }),
        ui.contenedor({ titulo: 'Tags - optional', descripcion: 'Consider adding tags to your target group. Tags enable you to categorize your AWS resources so you can more easily manage them.', cuerpo: ui.editorEtiquetas({ filas: f.etiquetas }) })
      ],
      pie: h('div', { class: 'cx-pie-form' }, ui.boton('Cancel', { variante: 'texto', alClic: cancelar }), ui.boton('Next', { variante: 'primario', alClic: siguiente }))
    });
  }

  function paso2() {
    return asistente(cx, {
      pasos: ['Specify group details', 'Register targets'],
      paso: 1,
      titulo: 'Register targets',
      info: 'elb-registrar',
      descripcion: 'This is an optional step to create a target group. However, to ensure that your load balancer routes traffic to this target group you must register your targets.',
      cuerpo: selectorDestinos(cx, f, f.vpcId),
      pie: h(
        'div',
        { class: 'cx-pie-form' },
        ui.boton('Cancel', { variante: 'texto', alClic: cancelar }),
        ui.boton('Previous', { alClic: () => ((f.paso = 0), vista.repintar()) }),
        ui.boton('Create target group', { variante: 'primario', alClic: crear })
      )
    });
  }

  function cancelar() {
    delete cx.memoria.volverABalanceador;
    cx.ir(volver ? `ec2/balanceadores/crear/${volver.tipo}` : 'ec2/grupos-destino');
  }

  function siguiente() {
    // La consola revisa el nombre y los números en el navegador antes de seguir;
    // aquí se prueba la acción sobre una copia para mostrar el mismo error de AWS.
    f.errores = { nombre: f.nombre.trim() ? null : 'Target group name is required.' };
    if (f.errores.nombre) return vista.repintar();
    try {
      crearGrupoDestino(clonar(e), parametros());
    } catch (x) {
      if (/name/i.test(x.message)) f.errores.nombre = x.message;
      else cx.flash({ tipo: 'error', titulo: 'Failed to validate target group', texto: x.message });
      return vista.repintar();
    }
    f.puertoSel = String(f.puerto);
    f.paso = 1;
    vista.repintar();
    cx.raiz.querySelector('.cx-principal')?.scrollTo?.({ top: 0 });
  }

  function crear() {
    const r = cx.hacer({ servicio: 'ELB', accion: 'CreateTargetGroup', error: 'Failed to create target group' }, (est) => crearGrupoDestino(est, { ...parametros(), destinos: f.pendientes }), { atomico: true });
    if (!r.ok) return;
    const tg = r.valor;
    if (volver && cx.memoria.borradorBalanceador) {
      // Como en la consola: regresas al balanceador con el grupo nuevo ya elegido.
      const o = cx.memoria.borradorBalanceador.oyentes[volver.oyente];
      if (o && !o.tgArn) o.tgArn = tg.arn;
      delete cx.memoria.volverABalanceador;
      cx.flash({ tipo: 'exito', texto: `Successfully created target group: ${tg.nombre}. Ya quedó elegido en tu balanceador.` });
      cx.ir(`ec2/balanceadores/crear/${volver.tipo}`);
      return;
    }
    cx.flash({ tipo: 'exito', texto: `Successfully created target group: ${tg.nombre}` });
    cx.ir(`ec2/grupos-destino/${tg.nombre}`);
  }

  return h('div', { class: 'cx-pagina' }, volver ? ui.alerta({ tipo: 'info', contenido: 'Al crear el grupo regresarás a tu balanceador, con este grupo ya elegido en el listener.' }) : null, vista);
}

/* ===================================================== detalle de un grupo de destino */

function paresTg(cx, g) {
  return ui.pares(
    [
      { etiqueta: 'Target type', valor: 'Instance' },
      { etiqueta: 'Protocol : Port', valor: `${g.protocolo}: ${g.puerto}` },
      { etiqueta: 'Protocol version', valor: g.versionProtocolo ?? '–' },
      { etiqueta: 'VPC', valor: enlaceRecurso(cx, g.vpcId) },
      { etiqueta: 'IP address type', valor: 'IPv4' },
      { etiqueta: 'Load balancer', valor: enlacesLb(cx, g) },
      { etiqueta: 'ARN', valor: ui.copiable(g.arn) }
    ],
    { columnas: 3, cx }
  );
}

function conteosTg(g) {
  const c = conteoSalud(g);
  return h(
    'div',
    { class: 'cx-elb-conteos' },
    conteo('Total targets', c.total),
    conteo('Healthy', c.healthy, 'exito'),
    conteo('Unhealthy', c.unhealthy, 'error'),
    conteo('Unused', c.unused),
    conteo('Initial', c.initial, 'info'),
    conteo('Draining', c.draining)
  );
}

function tablaDestinos(cx, g) {
  const t = ui.tabla(cx, {
    titulo: 'Registered targets',
    info: 'elb-salud',
    variante: 'contenedor',
    descripcion: 'Targets are registered to a target group. The load balancer routes requests only to the healthy targets in enabled Availability Zones.',
    filas: () => tgDe(cx, g.nombre)?.destinos ?? [],
    clave: (d) => `${d.id}:${d.puerto}`,
    seleccion: 'multiple',
    filtro: 'Filter targets',
    columnas: [
      { titulo: 'Instance ID', valor: (d) => ui.enlace(d.id, `ec2/instancias/${d.id}`, { cx }) },
      { titulo: 'Name', valor: (d) => instDe(cx, d.id)?.nombre || '–' },
      { titulo: 'Port', valor: (d) => String(d.puerto) },
      { titulo: 'Zone', valor: (d) => instDe(cx, d.id)?.az ?? '–' },
      { titulo: 'Health status', valor: (d) => estadoSalud(d.salud), texto: (d) => d.salud },
      { titulo: 'Health status details', valor: (d) => d.motivo?.descripcion ?? '–' },
      { titulo: 'Launch time', valor: (d) => ui.fecha(instDe(cx, d.id)?.lanzada) }
    ],
    acciones: (sel) => [
      ui.boton('Deregister', {
        escribe: true,
        desactivado: !sel.length,
        alClic: () => {
          const r = cx.hacer({ servicio: 'ELB', accion: 'DeregisterTargets', error: 'Failed to deregister targets' }, (e) => quitarDestinos(e, g.arn, sel.map((d) => d.id)));
          if (r.ok) {
            cx.flash({ tipo: 'exito', texto: `Successfully deregistered ${sel.length} target${sel.length > 1 ? 's' : ''} from ${g.nombre}.` });
            t.seleccionar([]);
          }
        }
      }),
      ui.boton('Register targets', { escribe: true, alClic: () => cx.ir(`ec2/grupos-destino/${g.nombre}/registrar`) })
    ],
    vacio: {
      titulo: 'No targets',
      texto: 'You don’t have any targets registered to this target group.',
      accion: ui.boton('Register targets', { escribe: true, alClic: () => cx.ir(`ec2/grupos-destino/${g.nombre}/registrar`) })
    }
  });
  return t;
}

function pestanasTg(cx, g, st, { conDetalles = true } = {}) {
  return ui.pestanas({
    activa: st.pestana,
    alCambiar: (p) => (st.pestana = p),
    pestanas: [
      conDetalles ? { id: 'detalles', texto: 'Details', contenido: () => ui.contenedor({ titulo: 'Details', cuerpo: h('div', { class: 'cx-pagina' }, paresTg(cx, g), conteosTg(g)) }) } : null,
      { id: 'destinos', texto: 'Targets', contenido: () => tablaDestinos(cx, g) },
      { id: 'monitoreo', texto: 'Monitoring', contenido: () => ui.contenedor({ titulo: 'Monitoring', descripcion: 'Las gráficas completas (HealthyHostCount, UnHealthyHostCount, RequestCountPerTarget) están en CloudWatch → All metrics → AWS/ApplicationELB.', cuerpo: conteosTg(g) }) },
      { id: 'chequeos', texto: 'Health checks', contenido: () => pestanaChequeos(cx, g) },
      { id: 'atributos', texto: 'Attributes', contenido: () => pestanaAtributosTg(cx, g) },
      { id: 'etiquetas', texto: 'Tags', contenido: () => tablaEtiquetas(g.etiquetas) }
    ].filter(Boolean)
  });
}

function pestanaChequeos(cx, g) {
  const c = g.chequeo;
  return ui.contenedor({
    titulo: 'Health check settings',
    info: 'elb-chequeo',
    cx,
    acciones: ui.boton('Edit', { escribe: true, alClic: () => cx.ir(`ec2/grupos-destino/${g.nombre}/chequeos`) }),
    cuerpo: ui.pares(
      [
        { etiqueta: 'Protocol', valor: c.protocolo },
        { etiqueta: 'Path', valor: c.ruta ?? '–' },
        { etiqueta: 'Port', valor: c.puerto === 'traffic-port' ? 'Traffic port' : String(c.puerto) },
        { etiqueta: 'Healthy threshold', info: 'elb-umbrales', valor: `${c.sanos} consecutive health check successes` },
        { etiqueta: 'Unhealthy threshold', info: 'elb-umbrales', valor: `${c.insanos} consecutive health check failures` },
        { etiqueta: 'Timeout', valor: `${c.espera} seconds` },
        { etiqueta: 'Interval', valor: `${c.intervalo} seconds` },
        { etiqueta: 'Success codes', valor: c.codigos ?? '–' }
      ],
      { columnas: 4, cx }
    )
  });
}

function pestanaAtributosTg(cx, g) {
  return ui.contenedor({
    titulo: 'Attributes',
    acciones: ui.boton('Edit', { escribe: true, alClic: () => modalAtributosTg(cx, g) }),
    cuerpo: ui.pares(
      [
        { etiqueta: 'Deregistration delay', info: 'elb-retraso', valor: `${g.retraso} seconds` },
        { etiqueta: 'Load balancing algorithm', valor: 'Round robin' },
        { etiqueta: 'Slow start duration', valor: '0 seconds' },
        { etiqueta: 'Stickiness', valor: 'Off' },
        { etiqueta: 'Cross-zone load balancing', valor: 'Inherit settings from load balancer' }
      ],
      { columnas: 3, cx }
    )
  });
}

function modalAtributosTg(cx, g) {
  let retraso = String(g.retraso);
  const m = cx.modal({
    titulo: `Edit target group attributes: ${g.nombre}`,
    ancho: 'mediano',
    contenido: h(
      'div',
      { class: 'cx-form' },
      ui.campo({
        etiqueta: 'Deregistration delay',
        info: 'elb-retraso',
        cx,
        descripcion: 'The time to wait for in-flight requests to complete while deregistering a target. During this time, the state of the target is draining.',
        control: ui.entrada({ valor: retraso, tipo: 'number', sufijo: 'seconds', alCambiar: (v) => (retraso = v) }),
        restriccion: '0-3600 seconds'
      })
    ),
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Save changes', {
        variante: 'primario',
        alClic: () => {
          const r = cx.hacer({ servicio: 'ELB', accion: 'ModifyTargetGroupAttributes', error: 'Failed to modify target group attributes' }, (e) => editarAtributosGrupoDestino(e, g.arn, { retraso }));
          if (r.ok) {
            m.cerrar();
            cx.flash({ tipo: 'exito', texto: `Successfully modified attributes for ${g.nombre}.` });
          }
        }
      })
    ]
  });
}

function detalleGrupo(cx, { nombre }) {
  cx.migas([migaEc2, migaTgs, { texto: nombre }]);
  if (!tgDe(cx, nombre)) return noExiste(cx, 'Target group', nombre, 'ec2/grupos-destino');
  const st = { pestana: 'destinos' };
  return cx.vivo(() => {
    const g = tgDe(cx, nombre);
    if (!g) return noExiste(cx, 'Target group', nombre, 'ec2/grupos-destino');
    const sinLb = !balanceadoresDeGrupo(cx.estado, g).length;
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({ titulo: g.nombre, info: 'elb-grupo-destino', cx, acciones: [ui.botonRefrescar(() => cx.refrescar()), accionesTg(cx, [g], { alBorrar: () => cx.ir('ec2/grupos-destino') })] }),
      sinLb && g.destinos.length
        ? ui.alerta({ tipo: 'info', contenido: 'This target group is not associated with a load balancer. Its targets are «unused» until a listener or rule forwards traffic to it.' })
        : null,
      ui.contenedor({ titulo: 'Details', cuerpo: h('div', { class: 'cx-pagina' }, paresTg(cx, g), conteosTg(g)) }),
      pestanasTg(cx, g, st, { conDetalles: false })
    );
  });
}

function registrarPagina(cx, { nombre }) {
  cx.migas([migaEc2, migaTgs, { texto: nombre, ruta: `ec2/grupos-destino/${nombre}` }, { texto: 'Register targets' }]);
  const g = tgDe(cx, nombre);
  if (!g) return noExiste(cx, 'Target group', nombre, 'ec2/grupos-destino');
  const f = { pendientes: [], puertoSel: String(g.puerto) };
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Register targets', info: 'elb-registrar', cx, descripcion: `Register one or more instances with ${g.nombre}. The load balancer starts routing requests to a target as soon as the registration process completes and the target passes the initial health checks.` }),
    selectorDestinos(cx, f, g.vpcId),
    ui.pieFormulario({
      cancelar: () => cx.ir(`ec2/grupos-destino/${nombre}`),
      textoEnviar: 'Register pending targets',
      enviar: () => {
        if (!f.pendientes.length) return cx.flash({ tipo: 'error', titulo: 'No pending targets', texto: 'Select instances and choose «Include as pending below» first.' });
        const r = cx.hacer({ servicio: 'ELB', accion: 'RegisterTargets', error: 'Failed to register targets' }, (e) => registrarDestinos(e, g.arn, f.pendientes));
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: `Successfully registered ${f.pendientes.length} target${f.pendientes.length > 1 ? 's' : ''} with ${g.nombre}.` });
          cx.ir(`ec2/grupos-destino/${nombre}`);
        }
      }
    })
  );
}

function editarChequeosPagina(cx, { nombre }) {
  cx.migas([migaEc2, migaTgs, { texto: nombre, ruta: `ec2/grupos-destino/${nombre}` }, { texto: 'Edit health check settings' }]);
  const g = tgDe(cx, nombre);
  if (!g) return noExiste(cx, 'Target group', nombre, 'ec2/grupos-destino');
  const c0 = g.chequeo;
  const c = {
    protocolo: c0.protocolo,
    ruta: c0.ruta ?? '/',
    puertoTipo: c0.puerto === 'traffic-port' ? 'traffic' : 'override',
    puerto: c0.puerto === 'traffic-port' ? '' : String(c0.puerto),
    sanos: String(c0.sanos),
    insanos: String(c0.insanos),
    espera: String(c0.espera),
    intervalo: String(c0.intervalo),
    codigos: c0.codigos ?? '200'
  };
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Edit health check settings', info: 'elb-chequeo', cx, descripcion: `Target group: ${g.nombre}` }),
    ui.contenedor({ titulo: 'Health check settings', cuerpo: formularioChequeo(cx, c, { protocoloGrupo: g.protocolo, abierto: true }) }),
    ui.pieFormulario({
      cancelar: () => cx.ir(`ec2/grupos-destino/${nombre}`),
      textoEnviar: 'Save changes',
      enviar: () => {
        const r = cx.hacer({ servicio: 'ELB', accion: 'ModifyTargetGroup', error: 'Failed to modify health check settings' }, (e) => editarChequeoGrupoDestino(e, g.arn, chequeoDeForm(c, c.protocolo !== 'TCP')));
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: `Successfully updated health check settings for ${g.nombre}.` });
          cx.ir(`ec2/grupos-destino/${nombre}`);
        }
      }
    })
  );
}

/* ================================================================ registro */

export const rutasBalanceo = {
  balanceadores: listaBalanceadores,
  'balanceadores/crear': elegirTipo,
  'balanceadores/crear/:tipo': crearBalanceadorPagina,
  'balanceadores/:nombre': detalleBalanceador,
  'balanceadores/:nombre/oyente-nuevo': nuevoOyentePagina,
  'balanceadores/:nombre/oyentes/:puerto': detalleOyente,
  'grupos-destino': listaGrupos,
  'grupos-destino/crear': crearGrupoPagina,
  'grupos-destino/:nombre': detalleGrupo,
  'grupos-destino/:nombre/registrar': registrarPagina,
  'grupos-destino/:nombre/chequeos': editarChequeosPagina
};

/** «Features» del buscador de la barra (ec2.js los agrega a su `busqueda`). */
export const busquedaBalanceo = [
  { texto: 'Load balancers', ruta: 'ec2/balanceadores', claves: 'elb alb nlb balanceador balanceadores' },
  { texto: 'Create load balancer', ruta: 'ec2/balanceadores/crear', claves: 'application network gateway alb nlb' },
  { texto: 'Target groups', ruta: 'ec2/grupos-destino', claves: 'grupos de destino health checks' },
  { texto: 'Create target group', ruta: 'ec2/grupos-destino/crear', claves: 'grupo de destino' }
];

/** Las ayudas «Info» (ec2.js las agrega a sus `ayudas`). */
export const ayudasBalanceo = {
  'elb-balanceador': {
    titulo: 'Balanceador de carga (ELB)',
    texto: [
      'Un **balanceador de carga** es el recepcionista de tu aplicación: recibe todas las visitas en **una sola dirección** (su DNS) y las reparte entre varios servidores.',
      'Si un servidor se enferma, el balanceador deja de mandarle visitas y las reparte entre los sanos. Así tu página sigue arriba aunque falle una instancia (**alta disponibilidad**).',
      'Para abrir tu página usa su **DNS name** (no la IP de una instancia). Con el botón **Open in browser** (del simulador) la abres desde tu casa.'
    ]
  },
  'elb-tipos': {
    titulo: 'Tipos de balanceador',
    texto: [
      [
        '**Application Load Balancer (ALB)**: capa 7 (HTTP y HTTPS). Lee la petición y puede repartir por ruta (`/api/*`) o por nombre. Es el de las páginas web.',
        '**Network Load Balancer (NLB)**: capa 4 (TCP, UDP, TLS). Rapidísimo, millones de conexiones y puede tener IP fija.',
        '**Gateway Load Balancer (GWLB)**: reparte tráfico entre aparatos de seguridad de terceros (firewalls) con GENEVE.'
      ],
      'En el simulador solo el **ALB** reparte tráfico de verdad; el NLB y el GWLB se crean para conocerlos.',
      'En el examen: «HTTP, rutas, microservicios» → ALB; «ultra baja latencia, TCP/UDP, IP fija» → NLB; «firewalls de terceros» → GWLB.'
    ]
  },
  'elb-esquema': {
    titulo: 'Scheme',
    texto: [
      '**Internet-facing**: tiene IP públicas y lo visita cualquiera desde internet. Necesita subredes **públicas** (con ruta al Internet Gateway).',
      '**Internal**: solo tiene IP privadas; lo usan otros servidores dentro de tu VPC (por ejemplo, la capa web hablando con la capa de aplicación).'
    ]
  },
  'elb-zonas': {
    titulo: 'Zonas y subredes del balanceador',
    texto: [
      'El balanceador pone un «nodo» en cada zona que elijas. Un **ALB pide al menos dos zonas**: si se cae un centro de datos, el otro sigue atendiendo.',
      'Elige **una subred pública por zona** (las de la VPC por omisión ya lo son).',
      'Ojo: el balanceador solo manda visitas a instancias que estén en **las zonas que elegiste**. Una instancia en otra zona queda como **unused**.'
    ]
  },
  'elb-grupos-seguridad': {
    titulo: 'Grupo de seguridad del balanceador',
    texto: [
      'Es el firewall del balanceador. Para una página pública necesita **HTTP (80) desde 0.0.0.0/0**.',
      'Buena práctica (y pregunta de examen): a las instancias **no** las abras a todo internet; en su grupo pon **HTTP desde el grupo del balanceador** (`sg-…`). Así solo el balanceador les puede hablar.',
      'El grupo **default** solo deja entrar a quien tenga ese mismo grupo: con él tu página no abrirá desde casa.'
    ]
  },
  'elb-oyente': {
    titulo: 'Listener',
    texto: [
      'Un **listener** es el «oído» del balanceador: escucha en un protocolo y puerto (por ejemplo **HTTP:80**).',
      'Su **acción por omisión** dice a qué **grupo de destino** manda las visitas (*Forward to target group*).',
      'Sin listener en un puerto, el balanceador no contesta en ese puerto.'
    ]
  },
  'elb-reglas': {
    titulo: 'Reglas del listener',
    texto: [
      'Un ALB puede repartir según la **ruta** de la petición: por ejemplo `/api/*` a un grupo y todo lo demás al grupo por omisión.',
      'Las reglas se revisan de la **prioridad más baja a la más alta**; la regla **Default** va al final («si ninguna otra aplica»).',
      'En el patrón, `*` vale por varios caracteres y `?` por uno.'
    ]
  },
  'elb-dns': {
    titulo: 'DNS name',
    texto: [
      'Es la dirección de tu balanceador, por ejemplo `alb-web-1234567890.us-east-1.elb.amazonaws.com`. Ábrela con `http://` (el listener es HTTP, no HTTPS).',
      'Las IP del balanceador cambian solas, por eso **siempre se usa el DNS**. En Route 53 se le apunta con un registro **Alias**.',
      'Mientras el estado diga **Provisioning**, el DNS todavía no responde.'
    ]
  },
  'elb-grupo-destino': {
    titulo: 'Grupo de destino (target group)',
    texto: [
      'Un **target group** es la lista de servidores (instancias) que atienden las visitas, más el **health check** con el que el balanceador revisa si están sanos.',
      'Se crea en dos pasos: datos del grupo (protocolo, puerto, VPC y health check) y **Register targets** (qué instancias entran).',
      'Un grupo solo recibe tráfico cuando un **listener** de un balanceador lo usa. Un grupo de Auto Scaling registra solo sus instancias aquí.'
    ]
  },
  'elb-chequeo': {
    titulo: 'Health check',
    texto: [
      'Cada cierto tiempo el balanceador pide una página a cada instancia (por omisión `GET /`). Si contesta con un código de **Success codes** (200), está sana.',
      'Si cambias el **path** a una página que no existe, la respuesta será 404 y verás «Health checks failed with these codes: [404]».',
      'En el simulador cada chequeo tarda **5 segundos** para que veas el cambio en clase.'
    ]
  },
  'elb-umbrales': {
    titulo: 'Umbrales (thresholds)',
    texto: [
      '**Unhealthy threshold** (2): cuántos chequeos fallidos seguidos hacen falta para declarar **unhealthy** a una instancia.',
      '**Healthy threshold** (5): cuántos chequeos buenos seguidos hacen falta para que una instancia enferma vuelva a **healthy**.',
      'Una instancia recién registrada solo necesita pasar **un** chequeo para quedar healthy.'
    ]
  },
  'elb-salud': {
    titulo: 'Estados de salud de un destino',
    texto: [
      [
        '**Initial**: se está registrando o pasando sus primeros chequeos.',
        '**Healthy**: sana; recibe visitas.',
        '**Unhealthy**: falló los chequeos. Lee «Health status details»: *Request timed out* = el grupo de seguridad o la red no dejan pasar al balanceador; *Health checks failed* = no hay servidor web corriendo; *codes: [404]* = no existe la ruta del health check.',
        '**Unused**: el grupo no tiene balanceador, la instancia está detenida o está en una zona que el balanceador no usa.',
        '**Draining**: la estás quitando; termina las visitas en curso y sale.'
      ]
    ]
  },
  'elb-registrar': {
    titulo: 'Register targets',
    texto: [
      'Marca las instancias, revisa el puerto (el del grupo, normalmente 80) y pulsa **Include as pending below**. Luego **Create target group** o **Register pending targets**.',
      'Solo se pueden registrar instancias **running** (o arrancando) de la **misma VPC** que el grupo.'
    ]
  },
  'elb-retraso': {
    titulo: 'Deregistration delay',
    texto: ['Cuánto espera el balanceador, al quitar una instancia, a que terminen las visitas que ya estaba atendiendo (estado **draining**). En AWS son 300 s por omisión; en el simulador tarda unos segundos.']
  },
  'elb-mapa': {
    titulo: 'Resource map',
    texto: ['Es el dibujo del camino de una visita: **listener → regla → grupo de destino → instancia**. Si una instancia sale en rojo, ahí mismo ves por qué (Health status details).']
  }
};
