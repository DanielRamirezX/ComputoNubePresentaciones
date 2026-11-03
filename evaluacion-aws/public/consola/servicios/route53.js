// ---------------------------------------------------------------------------
// AMAZON ROUTE 53
//
// Dashboard, Hosted zones (públicas y privadas: crear, editar, borrar), el
// detalle de una zona con sus registros (Quick create de A, AAAA, CNAME, MX y
// TXT; Alias a un ALB, a CloudFront, al sitio web de S3 o a otro registro;
// políticas simple, weighted, latency y failover), Edit record, Delete
// records y Test record. Health checks (endpoint y calculados) con su estado
// calculado. El registro de dominios se ve, pero desactivado.
//
// El modelo vive en modelo/borde.js. Botón propio del simulador en el detalle
// de un registro: «Open in browser», que abre ese nombre en el navegador
// simulado (red.js le pregunta a Route 53 con llamar('resolverNombre')).
// ---------------------------------------------------------------------------

import * as ui from '../ui.js';
import {
  ENDPOINT_S3_WEB,
  REGIONES_LATENCIA,
  CHEQUEADORES_R53,
  crearChequeoSalud,
  crearRegistrosDns,
  crearZonaHospedada,
  descripcionChequeo,
  editarChequeoSalud,
  editarRegistroDns,
  editarZonaHospedada,
  eliminarChequeoSalud,
  eliminarRegistrosDns,
  eliminarZonaHospedada,
  probarRegistroDns,
  zonaHospedadaDe,
  chequeoSaludDe
} from '../modelo.js';
import { noExiste, opcionesVpc } from './comun.js';
import { tablaEtiquetas } from './sns.js';

const { h } = ui;

const migaR53 = { texto: 'Route 53', ruta: 'route53' };
const migaZonas = { texto: 'Hosted zones', ruta: 'route53/zonas' };
const migaChequeos = { texto: 'Health checks', ruta: 'route53/chequeos' };
const zonas = (cx) => cx.estado.route53?.zonas ?? [];
const chequeos = (cx) => cx.estado.route53?.chequeos ?? [];
const rutaZona = (z, resto = '') => `route53/zonas/${z.id}${resto ? `/${resto}` : ''}`;
const conPunto = (n) => `${n}.`;

const POLITICAS = [
  { valor: 'simple', etiqueta: 'Simple routing', descripcion: 'Route traffic to a single resource.' },
  { valor: 'weighted', etiqueta: 'Weighted', descripcion: 'Route traffic to multiple resources in proportions that you specify.' },
  { valor: 'geolocation', etiqueta: 'Geolocation', descripcion: 'Route traffic based on the location of your users.', desactivado: true },
  { valor: 'geoproximity', etiqueta: 'Geoproximity', descripcion: 'Route traffic based on the location of your resources.', desactivado: true },
  { valor: 'latency', etiqueta: 'Latency', descripcion: 'Route traffic to the Region with the lowest latency.' },
  { valor: 'ip', etiqueta: 'IP-based', descripcion: 'Route traffic based on the IP address of your users.', desactivado: true },
  { valor: 'failover', etiqueta: 'Failover', descripcion: 'Route traffic to a backup resource when the primary is unhealthy.' },
  { valor: 'multivalue', etiqueta: 'Multivalue answer', descripcion: 'Respond with up to eight healthy records.', desactivado: true }
];
const textoPolitica = (v) => POLITICAS.find((p) => p.valor === v)?.etiqueta ?? 'Simple';

const TIPOS = [
  { valor: 'A', etiqueta: 'A – Routes traffic to an IPv4 address and some AWS resources' },
  { valor: 'AAAA', etiqueta: 'AAAA – Routes traffic to an IPv6 address and some AWS resources' },
  { valor: 'CAA', etiqueta: 'CAA – Restricts CAs that can create SSL/TLS certifications for the domain', desactivado: true },
  { valor: 'CNAME', etiqueta: 'CNAME – Routes traffic to another domain name and to some AWS resources' },
  { valor: 'DS', etiqueta: 'DS – Delegation Signer, used to establish a chain of trust for DNSSEC', desactivado: true },
  { valor: 'HTTPS', etiqueta: 'HTTPS – Provides alternative endpoints and parameters', desactivado: true },
  { valor: 'MX', etiqueta: 'MX – Specifies mail servers' },
  { valor: 'NAPTR', etiqueta: 'NAPTR – Is used by DDDS applications', desactivado: true },
  { valor: 'PTR', etiqueta: 'PTR – Maps an IP address to a domain name', desactivado: true },
  { valor: 'SPF', etiqueta: 'SPF – Not recommended', desactivado: true },
  { valor: 'SRV', etiqueta: 'SRV – Application-specific values that identify servers', desactivado: true },
  { valor: 'TXT', etiqueta: 'TXT – Verifies email senders and application-specific values' }
];

const DESTINOS_ALIAS = [
  { valor: 'elb', etiqueta: 'Alias to Application and Classic Load Balancer' },
  { valor: 'cloudfront', etiqueta: 'Alias to CloudFront distribution' },
  { valor: 's3', etiqueta: 'Alias to S3 website endpoint' },
  { valor: 'registro', etiqueta: 'Alias to another record in this hosted zone' },
  { valor: 'apigw', etiqueta: 'Alias to API Gateway API', desactivado: true },
  { valor: 'vpce', etiqueta: 'Alias to VPC endpoint', desactivado: true },
  { valor: 'eb', etiqueta: 'Alias to Elastic Beanstalk environment', desactivado: true },
  { valor: 'nlb', etiqueta: 'Alias to Network Load Balancer', desactivado: true },
  { valor: 'apprunner', etiqueta: 'Alias to App Runner application', desactivado: true }
];

const EJEMPLOS = { A: '192.0.2.235', AAAA: '2001:0db8:85a3:0:0:8a2e:0370:7334', CNAME: 'www.example.com', MX: '10 mailserver.example.com', TXT: '"Sample text entries"' };

const estadoChequeo = (ch) => (ch.estado === 'Healthy' ? ui.estado('exito', 'Healthy') : ch.estado === 'Unhealthy' ? ui.estado('error', 'Unhealthy') : ui.estado('espera', 'Unknown'));
const nombreZonaVisible = (z) => conPunto(z.nombre);

/* ================================================================ dashboard */

function dashboard(cx) {
  cx.migas([migaR53, { texto: 'Dashboard' }]);
  const tarjeta = (titulo, cuerpo, acciones) => ui.contenedor({ titulo, cuerpo, pie: acciones ? h('div', { class: 'cx-r53-pie' }, acciones) : null });
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Route 53 Dashboard', info: 'route53', cx }),
    ui.contenedor({
      titulo: 'Register domain',
      descripcion: 'Find and register an available domain, or transfer your existing domains to Route 53.',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        h('div', { class: 'cx-r53-dominio' }, ui.entrada({ placeholder: 'Enter a domain name', desactivado: true, etiquetaAccesible: 'Domain name' }), ui.boton('Check', { desactivado: true })),
        ui.alerta({ tipo: 'info', contenido: 'El registro de dominios no está en el simulador (en AWS un dominio .com cuesta unos $15 USD al año). Aquí basta con crear una hosted zone pública: el simulador hace como si el dominio ya fuera tuyo.' })
      )
    }),
    h(
      'div',
      { class: 'cx-r53-tablero' },
      cx.vivo(() =>
        tarjeta('DNS management', h('div', { class: 'cx-r53-cifra' }, h('strong', {}, String(zonas(cx).length)), h('span', {}, ' Hosted zones')), [
          ui.boton('Create hosted zone', { escribe: true, alClic: () => cx.ir('route53/zonas/crear') }),
          ui.enlace('View hosted zones', 'route53/zonas', { cx })
        ])
      ),
      tarjeta('Traffic management', h('p', { class: 'cx-texto-sec' }, 'Create traffic policies that route traffic to multiple resources.'), [ui.boton('Create policy', { desactivado: true })]),
      cx.vivo(() => {
        const lista = chequeos(cx);
        const malos = lista.filter((c) => c.estado === 'Unhealthy').length;
        return tarjeta(
          'Availability monitoring',
          h('div', { class: 'cx-r53-cifra' }, h('strong', {}, String(lista.length)), h('span', {}, ' Health checks'), malos ? h('div', {}, ui.estado('error', `${malos} unhealthy`)) : null),
          [ui.boton('Create health check', { escribe: true, alClic: () => cx.ir('route53/chequeos/crear') }), ui.enlace('View health checks', 'route53/chequeos', { cx })]
        );
      }),
      tarjeta('Domain registration', h('p', { class: 'cx-texto-sec' }, '0 Registered domains · 0 Pending requests'), [ui.boton('Register domains', { desactivado: true })])
    )
  );
}

/* ================================================================ zonas */

function confirmarBorrarZona(cx, z, { alTerminar } = {}) {
  cx.confirmar({
    titulo: `Delete hosted zone ${z.nombre}`,
    textoBoton: 'Delete',
    palabra: 'delete',
    contenido: [
      h('p', {}, 'If you delete this hosted zone, DNS resolvers can’t resolve the domain name.'),
      z.registros.some((r) => !r.sistema) ? ui.alerta({ tipo: 'aviso', contenido: 'Primero borra todos los registros que no sean el NS y el SOA; si no, Route 53 responde HostedZoneNotEmpty.' }) : null
    ],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'Route53', accion: 'DeleteHostedZone', error: `Failed to delete hosted zone ${z.nombre}` }, (e) => eliminarZonaHospedada(e, z.id));
      if (!r.ok) return false;
      cx.flash({ tipo: 'exito', texto: `Hosted zone ${z.nombre} was successfully deleted.` });
      alTerminar?.();
    }
  });
}

function listaZonas(cx) {
  cx.migas([migaR53, { texto: 'Hosted zones' }]);
  const t = ui.tabla(cx, {
    titulo: 'Hosted zones',
    info: 'r53-zona',
    filas: () => zonas(cx),
    clave: (z) => z.id,
    seleccion: 'unica',
    filtro: 'Filter hosted zones by property or value',
    columnas: [
      { titulo: 'Hosted zone name', valor: (z) => ui.enlace(z.nombre, rutaZona(z), { cx }), texto: (z) => z.nombre },
      { titulo: 'Type', valor: (z) => (z.tipo === 'publica' ? 'Public' : 'Private') },
      { titulo: 'Created by', valor: () => 'Route 53' },
      { titulo: 'Record count', valor: (z) => String(z.registros.length) },
      { titulo: 'Description', valor: (z) => z.descripcion || '-' },
      { titulo: 'Hosted zone ID', valor: (z) => z.id }
    ],
    acciones: (sel) => [
      ui.boton('View details', { desactivado: sel.length !== 1, alClic: () => cx.ir(rutaZona(sel[0])) }),
      ui.boton('Edit', { desactivado: sel.length !== 1, escribe: true, alClic: () => cx.ir(rutaZona(sel[0], 'editar')) }),
      ui.boton('Delete', { desactivado: sel.length !== 1, escribe: true, alClic: () => confirmarBorrarZona(cx, sel[0]) }),
      ui.boton('Create hosted zone', { variante: 'primario', alClic: () => cx.ir('route53/zonas/crear') })
    ],
    vacio: { titulo: 'No hosted zones', texto: 'You don’t have any hosted zones.', accion: () => ui.boton('Create hosted zone', { escribe: true, alClic: () => cx.ir('route53/zonas/crear') }) }
  });
  return h('div', { class: 'cx-pagina' }, t);
}

/** Las VPC asociadas a una zona privada (filas con Region y VPC ID). */
function editorVpcs(cx, f, repintar) {
  return h(
    'div',
    { class: 'cx-form' },
    f.vpcs.map((v, i) =>
      h(
        'div',
        { class: 'cx-fila-campos cx-r53-fila' },
        ui.campo({ etiqueta: 'Region', control: ui.selector({ valor: 'us-east-1', opciones: [{ valor: 'us-east-1', etiqueta: 'US East (N. Virginia) us-east-1' }], etiquetaAccesible: 'Region' }) }),
        ui.campo({
          etiqueta: 'VPC ID',
          control: ui.selector({ placeholder: 'Choose VPC', valor: v.id, opciones: opcionesVpc(cx.estado), etiquetaAccesible: 'VPC ID', alCambiar: (x) => (v.id = x) }),
          error: f.intento && !v.id ? 'Choose a VPC.' : null
        }),
        f.vpcs.length > 1 ? ui.boton('Remove VPC', { alClic: () => (f.vpcs.splice(i, 1), repintar()) }) : null
      )
    ),
    h('div', {}, ui.boton('Add VPC', { alClic: () => (f.vpcs.push({ id: null }), repintar()) }))
  );
}

function crearZonaPagina(cx) {
  cx.migas([migaR53, migaZonas, { texto: 'Create hosted zone' }]);
  const f = { nombre: '', descripcion: '', tipo: 'publica', vpcs: [{ id: null }], etiquetas: [], intento: false };
  const forma = ui.region(() => [
    ui.contenedor({
      titulo: 'Hosted zone configuration',
      descripcion: 'A hosted zone is a container that holds information about how you want to route traffic for a domain, such as example.com, and its subdomains.',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({
          etiqueta: 'Domain name',
          info: 'r53-zona',
          cx,
          descripcion: 'This is the name of the domain that you want to route traffic for.',
          control: ui.entrada({ valor: f.nombre, placeholder: 'example.com', etiquetaAccesible: 'Domain name', alCambiar: (v) => (f.nombre = v) }),
          restriccion: 'Valid characters: a-z, 0-9, ! " # $ % & \' ( ) * + , - / : ; < = > ? @ [ \\ ] ^ _ ` { | } . ~',
          error: f.intento && !f.nombre.trim() ? 'Domain name is required.' : null
        }),
        ui.campo({
          etiqueta: 'Description',
          opcional: true,
          descripcion: 'This value lets you distinguish hosted zones that have the same name.',
          control: ui.entrada({ valor: f.descripcion, placeholder: 'The hosted zone is used for...', etiquetaAccesible: 'Description', alCambiar: (v) => (f.descripcion = v) }),
          restriccion: 'The description can have up to 256 characters.'
        }),
        ui.campo({
          etiqueta: 'Type',
          descripcion: 'The type indicates whether you want to route traffic on the internet or in an Amazon VPC.',
          control: ui.tarjetas({
            columnas: 2,
            valor: f.tipo,
            alCambiar: (v) => ((f.tipo = v), forma.repintar()),
            opciones: [
              { valor: 'publica', etiqueta: 'Public hosted zone', descripcion: 'A public hosted zone determines how traffic is routed on the internet.' },
              { valor: 'privada', etiqueta: 'Private hosted zone', descripcion: 'A private hosted zone determines how traffic is routed within an Amazon VPC.' }
            ]
          })
        }),
        f.tipo === 'publica'
          ? ui.alerta({ tipo: 'info', contenido: 'En AWS una zona pública cuesta $0.50 USD al mes. Para que internet la use, el dominio debe estar registrado y apuntar a sus 4 servidores de nombres (NS). En el simulador eso ya está hecho.' })
          : null
      )
    }),
    f.tipo === 'privada'
      ? ui.contenedor({ titulo: 'VPCs to associate with the hosted zone', descripcion: 'To use this hosted zone to resolve DNS queries for one or more VPCs, choose the VPCs. The VPCs must have DNS hostnames and DNS resolution enabled.', cuerpo: editorVpcs(cx, f, () => forma.repintar()) })
      : null,
    ui.contenedor({ titulo: 'Tags', descripcion: 'Apply tags to hosted zones to help organize and identify them.', plegable: true, abierto: false, cuerpo: ui.editorEtiquetas({ filas: f.etiquetas }) })
  ]);
  function crear() {
    f.intento = true;
    forma.repintar();
    if (!f.nombre.trim() || (f.tipo === 'privada' && f.vpcs.some((v) => !v.id))) return;
    const r = cx.hacer({ servicio: 'Route53', accion: 'CreateHostedZone', error: 'Failed to create hosted zone' }, (e) =>
      crearZonaHospedada(e, { nombre: f.nombre, descripcion: f.descripcion, tipo: f.tipo, vpcs: f.vpcs.map((v) => v.id), etiquetas: f.etiquetas })
    );
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: `${r.valor.nombre} was successfully created.`, accion: null });
      cx.ir(rutaZona(r.valor));
    }
  }
  return h('div', { class: 'cx-pagina cx-pagina--form' }, ui.encabezado({ titulo: 'Create hosted zone', info: 'r53-zona', cx }), forma, ui.pieFormulario({ cancelar: () => cx.ir('route53/zonas'), enviar: crear, textoEnviar: 'Create hosted zone' }));
}

function editarZonaPagina(cx, { id }) {
  const z = zonaHospedadaDe(cx.estado, id);
  cx.migas([migaR53, migaZonas, { texto: z?.nombre ?? id, ruta: z ? rutaZona(z) : null }, { texto: 'Edit' }]);
  if (!z) return noExiste(cx, 'Hosted zone', id, 'route53/zonas');
  const f = { descripcion: z.descripcion, vpcs: z.vpcs.map((v) => ({ id: v })), intento: false };
  const forma = ui.region(() => [
    ui.contenedor({
      titulo: 'Hosted zone configuration',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.pares([{ etiqueta: 'Domain name', valor: z.nombre }, { etiqueta: 'Type', valor: z.tipo === 'publica' ? 'Public hosted zone' : 'Private hosted zone' }], { columnas: 2 }),
        ui.campo({ etiqueta: 'Description', opcional: true, control: ui.entrada({ valor: f.descripcion, etiquetaAccesible: 'Description', alCambiar: (v) => (f.descripcion = v) }) })
      )
    }),
    z.tipo === 'privada' ? ui.contenedor({ titulo: 'VPCs to associate with the hosted zone', cuerpo: editorVpcs(cx, f, () => forma.repintar()) }) : null
  ]);
  function guardar() {
    f.intento = true;
    forma.repintar();
    if (z.tipo === 'privada' && f.vpcs.some((v) => !v.id)) return;
    const r = cx.hacer({ servicio: 'Route53', accion: 'UpdateHostedZoneComment', error: 'Failed to update hosted zone' }, (e) => editarZonaHospedada(e, z.id, { descripcion: f.descripcion, vpcs: z.tipo === 'privada' ? f.vpcs.map((v) => v.id) : undefined }));
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: `Hosted zone ${z.nombre} was successfully updated.` });
      cx.ir(rutaZona(z));
    }
  }
  return h('div', { class: 'cx-pagina cx-pagina--form' }, ui.encabezado({ titulo: 'Edit hosted zone', cx }), forma, ui.pieFormulario({ cancelar: () => cx.ir(rutaZona(z)), enviar: guardar, textoEnviar: 'Save changes' }));
}

/* ======================================================== detalle de zona */

/** «Value/Route traffic to» de un registro. */
function valorRegistro(cx, r) {
  if (!r.alias) return r.valores.join('\n');
  if (r.alias.tipoDestino === 'registro') return conPunto(r.alias.destino);
  return conPunto(r.alias.destino);
}

function diferenciador(r) {
  if (r.politica === 'weighted') return String(r.peso);
  if (r.politica === 'latency') return r.region;
  if (r.politica === 'failover') return r.failover === 'PRIMARY' ? 'Primary' : 'Secondary';
  return '-';
}

/** El registro se puede abrir en el navegador simulado (A, AAAA, CNAME o Alias). */
const abrible = (r) => ['A', 'AAAA', 'CNAME'].includes(r.tipo) && !r.nombre.startsWith('*');

function abrirRegistro(cx, r) {
  cx.navegador(`http://${r.nombre}`);
}

function borrarRegistros(cx, z, sel) {
  cx.confirmar({
    titulo: 'Delete records',
    textoBoton: 'Delete',
    contenido: [
      h('p', {}, `Are you sure you want to delete the following ${sel.length === 1 ? 'record' : `${sel.length} records`}?`),
      h('ul', {}, sel.map((r) => h('li', {}, `${r.nombre} · ${r.tipo}${r.identificador ? ` · ${r.identificador}` : ''}`)))
    ],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'Route53', accion: 'ChangeResourceRecordSets', error: 'Error occurred' }, (e) => eliminarRegistrosDns(e, z.id, sel.map((x) => x.id)));
      if (!r.ok) return false;
      cx.flash({ tipo: 'exito', texto: `Record${sel.length === 1 ? '' : 's'} for ${z.nombre} ${sel.length === 1 ? 'was' : 'were'} successfully deleted.` });
    }
  });
}

function detalleZona(cx, { id }) {
  const z0 = zonaHospedadaDe(cx.estado, id);
  cx.migas([migaR53, migaZonas, { texto: z0?.nombre ?? id }]);
  if (!z0) return noExiste(cx, 'Hosted zone', id, 'route53/zonas');
  const zona = () => zonaHospedadaDe(cx.estado, id);
  const st = { pestana: 'registros', detalles: true };
  let tabla = null;
  const panel = ui.region(() => panelRegistro());

  function panelRegistro() {
    const r = tabla?.seleccion();
    if (!r || r.length !== 1) return null;
    const x = r[0];
    return ui.contenedor({
      titulo: 'Record details',
      acciones: [
        abrible(x) ? ui.boton('Open in browser', { icono: 'external', titulo: 'Botón del simulador: abre este nombre desde tu casa', alClic: () => abrirRegistro(cx, x) }) : null,
        ui.boton('Edit record', { escribe: true, desactivado: x.sistema && x.tipo === 'SOA', alClic: () => cx.ir(rutaZona(zona(), `registros/${x.id}/editar`)) })
      ],
      cuerpo: ui.pares(
        [
          { etiqueta: 'Record name', valor: x.nombre },
          { etiqueta: 'Record type', valor: x.tipo },
          { etiqueta: 'Value', valor: h('pre', { class: 'cx-mono cx-r53-valor' }, valorRegistro(cx, x)) },
          { etiqueta: 'Alias', valor: x.alias ? 'Yes' : 'No' },
          { etiqueta: 'TTL (seconds)', valor: x.ttl === null ? '-' : String(x.ttl) },
          { etiqueta: 'Routing policy', valor: textoPolitica(x.politica) },
          ...(x.alias ? [{ etiqueta: 'Evaluate target health', valor: x.alias.evaluarSalud ? 'Yes' : 'No' }] : []),
          ...(x.identificador ? [{ etiqueta: 'Record ID', valor: x.identificador }] : []),
          ...(x.chequeoId ? [{ etiqueta: 'Health check ID', valor: ui.enlace(x.chequeoId, () => ((cx.memoria.r53Chequeo = x.chequeoId), cx.ir('route53/chequeos'))) }] : [])
        ],
        { columnas: 3 }
      )
    });
  }

  function pestanaRegistros() {
    tabla = ui.tabla(cx, {
      titulo: 'Records',
      variante: 'contenedor',
      info: 'r53-registro',
      contador: undefined,
      filas: () => zona()?.registros ?? [],
      clave: (r) => r.id,
      seleccion: 'multiple',
      filtro: 'Filter records by property or value',
      columnas: [
        { titulo: 'Record name', valor: (r) => r.nombre },
        { titulo: 'Type', valor: (r) => r.tipo },
        { titulo: 'Routing policy', valor: (r) => (r.politica === 'simple' ? 'Simple' : textoPolitica(r.politica)) },
        { titulo: 'Differentiator', valor: (r) => diferenciador(r) },
        { titulo: 'Alias', valor: (r) => (r.alias ? 'Yes' : 'No') },
        { titulo: 'Value/Route traffic to', valor: (r) => h('span', { class: 'cx-r53-valor' }, valorRegistro(cx, r)), texto: (r) => valorRegistro(cx, r) },
        { titulo: 'TTL (seconds)', valor: (r) => (r.ttl === null ? '-' : String(r.ttl)) },
        { titulo: 'Health check ID', valor: (r) => r.chequeoId ?? '-' },
        { titulo: 'Evaluate target health', valor: (r) => (r.alias ? (r.alias.evaluarSalud ? 'Yes' : 'No') : '-') },
        { titulo: 'Record ID', valor: (r) => r.identificador ?? '-' }
      ],
      acciones: (sel) => [
        ui.boton('Delete record', { desactivado: !sel.length, escribe: true, alClic: () => borrarRegistros(cx, zona(), sel) }),
        ui.boton('Import zone file', { desactivado: true, titulo: 'No disponible en el simulador' }),
        ui.boton('Create record', { variante: 'primario', alClic: () => cx.ir(rutaZona(zona(), 'registros/crear')) })
      ],
      alSeleccionar: () => panel.repintar()
    });
    return h('div', { class: 'cx-pagina' }, tabla, panel);
  }

  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({
      titulo: z0.nombre,
      info: 'r53-zona',
      cx,
      acciones: [
        ui.boton('Delete zone', { escribe: true, alClic: () => confirmarBorrarZona(cx, zona(), { alTerminar: () => cx.ir('route53/zonas') }) }),
        ui.boton('Test record', { alClic: () => cx.ir(rutaZona(z0, 'probar')) }),
        ui.boton('Configure query logging', { desactivado: true })
      ]
    }),
    cx.vivo(() => {
      const z = zona();
      if (!z) return null;
      return ui.contenedor({
        titulo: 'Hosted zone details',
        plegable: true,
        abierto: st.detalles,
        alAlternar: (v) => (st.detalles = v),
        acciones: ui.boton('Edit hosted zone', { escribe: true, alClic: () => cx.ir(rutaZona(z, 'editar')) }),
        cuerpo: ui.pares(
          [
            { etiqueta: 'Hosted zone name', valor: z.nombre },
            { etiqueta: 'Hosted zone ID', valor: ui.copiable(z.id) },
            { etiqueta: 'Description', valor: z.descripcion || '-' },
            { etiqueta: 'Type', valor: z.tipo === 'publica' ? 'Public hosted zone' : 'Private hosted zone' },
            { etiqueta: 'Record count', valor: String(z.registros.length) },
            { etiqueta: 'Query log', valor: '-' },
            { etiqueta: 'Name servers', valor: h('div', { class: 'cx-mono' }, z.servidores.map((s) => h('div', {}, s))), info: 'r53-zona' },
            ...(z.tipo === 'privada' ? [{ etiqueta: 'VPCs', valor: h('div', {}, z.vpcs.map((v) => h('div', {}, v))) }] : []),
            { etiqueta: 'Created by', valor: 'Route 53' }
          ],
          { columnas: 3, cx }
        )
      });
    }),
    ui.pestanas({
      activa: st.pestana,
      alCambiar: (p) => (st.pestana = p),
      pestanas: [
        { id: 'registros', texto: `Records (${z0.registros.length})`, contenido: pestanaRegistros },
        { id: 'dnssec', texto: 'DNSSEC signing', contenido: () => ui.noDisponible('DNSSEC signing', 'Firmar la zona con DNSSEC no está en este simulador.') },
        { id: 'etiquetas', texto: `Hosted zone tags (${z0.etiquetas.length})`, contenido: () => tablaEtiquetas(cx, zona()?.etiquetas ?? []) }
      ]
    })
  );
}

/* ================================================================ registros */

function registroVacio() {
  return { sub: '', tipo: 'A', alias: false, valores: '', ttl: '300', politica: 'simple', aliasTipo: null, aliasDestino: null, evaluarSalud: true, peso: '', region: null, failover: 'PRIMARY', chequeoId: null, identificador: '' };
}

/** El formulario a partir de un registro existente (Edit record). */
function registroDe(z, r) {
  const sub = r.nombre === z.nombre ? '' : r.nombre.slice(0, -(z.nombre.length + 1));
  const aliasTipo = r.alias?.tipoDestino ?? null;
  const aliasDestino = r.alias ? (aliasTipo === 'elb' ? r.alias.destino.replace(/^dualstack\./, '') : r.alias.destino) : null;
  return {
    sub,
    tipo: r.tipo,
    alias: Boolean(r.alias),
    valores: r.valores.join('\n'),
    ttl: r.ttl === null ? '300' : String(r.ttl),
    politica: r.politica,
    aliasTipo,
    aliasDestino,
    evaluarSalud: r.alias?.evaluarSalud ?? true,
    peso: r.peso === null ? '' : String(r.peso),
    region: r.region,
    failover: r.failover ?? 'PRIMARY',
    chequeoId: r.chequeoId,
    identificador: r.identificador ?? ''
  };
}

const nombreCompleto = (z, f) => (f.sub.trim() ? `${f.sub.trim().replace(/\.$/, '')}.${z.nombre}` : z.nombre);

/** Los recursos que puede elegir un Alias según su tipo de destino. */
function opcionesAlias(cx, z, f) {
  const nombre = nombreCompleto(z, f).toLowerCase();
  if (f.aliasTipo === 'elb') return (cx.estado.elb?.balanceadores ?? []).filter((b) => b.tipo === 'application').map((b) => ({ valor: b.dns, etiqueta: `dualstack.${b.dns}`, descripcion: `${b.nombre} · ${b.estado}` }));
  if (f.aliasTipo === 'cloudfront')
    return (cx.estado.cloudfront?.distribuciones ?? []).map((d) => ({ valor: d.dominio, etiqueta: d.dominio, descripcion: `${d.id}${d.alias.length ? ` · ${d.alias.join(', ')}` : ' · no alternate domain names'}` }));
  if (f.aliasTipo === 's3') {
    const b = (cx.estado.buckets ?? []).find((x) => x.nombre === nombre && x.sitioWeb);
    return b ? [{ valor: ENDPOINT_S3_WEB, etiqueta: ENDPOINT_S3_WEB, descripcion: `bucket ${b.nombre}` }] : [];
  }
  if (f.aliasTipo === 'registro') return z.registros.filter((r) => r.tipo === f.tipo && r.nombre !== nombre && !r.sistema).map((r) => ({ valor: r.nombre, etiqueta: r.nombre, descripcion: `${r.tipo}${r.identificador ? ` · ${r.identificador}` : ''}` }));
  return [];
}

/** Un registro del formulario (una tarjeta de Quick create). `editar`: el registro que se edita. */
function tarjetaRegistro(cx, z, f, i, { repintar, quitar, editar = null, intento }) {
  const permiteAlias = ['A', 'AAAA'].includes(f.tipo);
  const nombre = nombreCompleto(z, f);
  const conPolitica = f.politica !== 'simple';
  const dist = f.aliasTipo === 'cloudfront' ? (cx.estado.cloudfront?.distribuciones ?? []).find((d) => d.dominio === f.aliasDestino) : null;
  const errorValor = intento && !f.alias && !f.valores.trim() ? 'Enter a value.' : null;
  const errorDestino = intento && f.alias && (!f.aliasTipo || !f.aliasDestino) ? 'Choose an endpoint.' : null;
  const errorId = intento && conPolitica && !f.identificador.trim() ? 'Record ID is required.' : null;
  return ui.contenedor({
    titulo: editar ? 'Record' : `Record ${i + 1}`,
    acciones: quitar ? ui.boton('Delete', { alClic: quitar }) : null,
    cuerpo: h(
      'div',
      { class: 'cx-form' },
      h(
        'div',
        { class: 'cx-fila-campos' },
        ui.campo({
          etiqueta: 'Record name',
          info: 'r53-registro',
          cx,
          control: ui.entrada({ valor: f.sub, placeholder: 'subdomain', sufijo: `.${z.nombre}`, desactivado: Boolean(editar), etiquetaAccesible: 'Record name', alCambiar: (v) => (f.sub = v) }),
          restriccion: 'Keep blank to create a record for the root domain.'
        }),
        ui.campo({
          etiqueta: 'Record type',
          control: ui.selector({
            valor: f.tipo,
            desactivado: Boolean(editar),
            opciones: TIPOS,
            etiquetaAccesible: 'Record type',
            alCambiar: (v) => {
              f.tipo = v;
              if (!['A', 'AAAA'].includes(v)) f.alias = false;
              repintar();
            }
          })
        })
      ),
      permiteAlias
        ? ui.interruptor({
            etiqueta: 'Alias',
            marcada: f.alias,
            alCambiar: (v) => {
              f.alias = v;
              repintar();
            }
          })
        : null,
      f.alias
        ? [
            ui.campo({
              etiqueta: 'Route traffic to',
              info: 'r53-alias',
              cx,
              control: h(
                'div',
                { class: 'cx-form' },
                ui.selector({
                  placeholder: 'Choose endpoint',
                  valor: f.aliasTipo,
                  opciones: DESTINOS_ALIAS,
                  etiquetaAccesible: 'Choose endpoint',
                  alCambiar: (v) => {
                    f.aliasTipo = v;
                    f.aliasDestino = v === 's3' ? opcionesAlias(cx, z, f)[0]?.valor ?? null : null;
                    if (v === 'cloudfront') f.evaluarSalud = false;
                    repintar();
                  }
                }),
                f.aliasTipo === 'elb' || f.aliasTipo === 's3' ? ui.selector({ valor: 'us-east-1', opciones: [{ valor: 'us-east-1', etiqueta: 'US East (N. Virginia)' }], etiquetaAccesible: 'Choose Region' }) : null,
                f.aliasTipo
                  ? ui.selector({
                      placeholder: f.aliasTipo === 'cloudfront' ? 'Choose distribution' : f.aliasTipo === 'registro' ? 'Choose record' : f.aliasTipo === 's3' ? 'Choose S3 bucket' : 'Choose load balancer',
                      filtrar: true,
                      valor: f.aliasDestino,
                      opciones: () => opcionesAlias(cx, z, f),
                      vacio:
                        f.aliasTipo === 's3'
                          ? `No resources found. The bucket must have the same name as the record (${nombre}) and static website hosting enabled.`
                          : f.aliasTipo === 'cloudfront'
                            ? 'No distributions. Create one in CloudFront first.'
                            : f.aliasTipo === 'registro'
                              ? `No other ${f.tipo} records in this hosted zone.`
                              : 'No Application Load Balancers. Create one in EC2 → Load Balancers first.',
                      etiquetaAccesible: 'Alias target',
                      alCambiar: (v) => ((f.aliasDestino = v), repintar())
                    })
                  : null
              ),
              error: errorDestino
            }),
            f.aliasTipo === 's3'
              ? ui.alerta({ tipo: 'info', contenido: `Para un Alias al sitio web de S3, el bucket debe llamarse exactamente igual que el registro (${nombre}) y tener «Static website hosting» habilitado.` })
              : null,
            dist && !dist.alias.includes(nombre.toLowerCase())
              ? ui.alerta({ tipo: 'aviso', titulo: 'Falta el nombre alterno', contenido: `La distribución ${dist.id} no tiene ${nombre} en «Alternate domain names (CNAMEs)». El registro se crea, pero CloudFront contestará 403 hasta que lo agregues (CloudFront → la distribución → General → Settings → Edit).` })
              : null,
            ui.campo({
              etiqueta: 'Evaluate target health',
              control: ui.interruptor({ etiqueta: 'Yes', marcada: f.aliasTipo === 'cloudfront' ? false : f.evaluarSalud, desactivado: f.aliasTipo === 'cloudfront', alCambiar: (v) => (f.evaluarSalud = v) }),
              descripcion: f.aliasTipo === 'cloudfront' ? 'Evaluate target health isn’t supported for CloudFront distributions.' : null
            })
          ]
        : [
            ui.campo({
              etiqueta: 'Value',
              info: 'r53-registro',
              cx,
              control: ui.area({ valor: f.valores, filas: 3, monoespaciado: true, alCambiar: (v) => (f.valores = v) }),
              descripcion: `Enter multiple values on separate lines. Example: ${EJEMPLOS[f.tipo] ?? ''}`,
              error: errorValor
            }),
            ui.campo({
              etiqueta: 'TTL (seconds)',
              info: 'r53-ttl',
              cx,
              control: h(
                'div',
                { class: 'cx-fila-campos cx-r53-ttl' },
                ui.entrada({ valor: f.ttl, tipo: 'number', etiquetaAccesible: 'TTL (seconds)', alCambiar: (v) => (f.ttl = v) }),
                ['1m', '1h', '1d'].map((t) => ui.boton(t, { alClic: () => ((f.ttl = String({ '1m': 60, '1h': 3600, '1d': 86400 }[t])), repintar()) }))
              ),
              restriccion: 'Recommended values: 60 to 172800 (two days)'
            })
          ],
      ui.campo({
        etiqueta: 'Routing policy',
        info: 'r53-politica',
        cx,
        control: ui.selector({ valor: f.politica, opciones: POLITICAS, desactivado: Boolean(editar) && editar.politica !== 'simple', etiquetaAccesible: 'Routing policy', alCambiar: (v) => ((f.politica = v), repintar()) })
      }),
      f.politica === 'weighted'
        ? ui.campo({ etiqueta: 'Weight', control: ui.entrada({ valor: f.peso, tipo: 'number', placeholder: '0', etiquetaAccesible: 'Weight', alCambiar: (v) => (f.peso = v) }), restriccion: 'Weight can be a number between 0 and 255.' })
        : null,
      f.politica === 'latency'
        ? ui.campo({
            etiqueta: 'Region',
            control: ui.selector({ placeholder: 'Choose Region', valor: f.region, opciones: REGIONES_LATENCIA.map((r) => ({ valor: r.codigo, etiqueta: `${r.nombre} ${r.codigo}` })), etiquetaAccesible: 'Region', alCambiar: (v) => (f.region = v) })
          })
        : null,
      f.politica === 'failover'
        ? ui.campo({
            etiqueta: 'Failover record type',
            control: ui.radios({ horizontal: true, valor: f.failover, alCambiar: (v) => (f.failover = v), opciones: [{ valor: 'PRIMARY', etiqueta: 'Primary' }, { valor: 'SECONDARY', etiqueta: 'Secondary' }] })
          })
        : null,
      conPolitica
        ? [
            ui.campo({
              etiqueta: 'Health check ID',
              opcional: true,
              descripcion: f.politica === 'failover' && f.failover === 'PRIMARY' ? 'For a failover primary record, associate a health check so Route 53 can detect when it fails.' : null,
              control: ui.selector({
                placeholder: 'Choose health check',
                valor: f.chequeoId,
                opciones: [{ valor: null, etiqueta: '-' }, ...chequeos(cx).map((c) => ({ valor: c.id, etiqueta: c.nombre ? `${c.nombre} (${c.id})` : c.id, descripcion: descripcionChequeo(c) }))],
                vacio: 'No health checks.',
                etiquetaAccesible: 'Health check ID',
                alCambiar: (v) => (f.chequeoId = v)
              })
            }),
            ui.campo({
              etiqueta: 'Record ID',
              control: ui.entrada({ valor: f.identificador, desactivado: Boolean(editar), placeholder: 'Enter a unique value', etiquetaAccesible: 'Record ID', alCambiar: (v) => (f.identificador = v) }),
              restriccion: 'Enter a value that differentiates this record from other records with the same name and type.',
              error: errorId
            })
          ]
        : null
    )
  });
}

/** Del formulario a lo que espera el modelo. */
function parametrosRegistro(z, f) {
  const p = { nombre: nombreCompleto(z, f), tipo: f.tipo, politica: f.politica, identificador: f.identificador.trim(), peso: f.peso, region: f.region, failover: f.failover, chequeoId: f.chequeoId };
  if (f.alias) p.alias = { tipoDestino: f.aliasTipo, destino: f.aliasDestino, evaluarSalud: f.evaluarSalud };
  else {
    p.valores = f.valores;
    p.ttl = f.ttl;
  }
  return p;
}

const incompleto = (f) => (f.alias ? !f.aliasTipo || !f.aliasDestino : !f.valores.trim()) || (f.politica !== 'simple' && !f.identificador.trim());

function crearRegistroPagina(cx, { id }) {
  const z = zonaHospedadaDe(cx.estado, id);
  cx.migas([migaR53, migaZonas, { texto: z?.nombre ?? id, ruta: z ? rutaZona(z) : null }, { texto: 'Create record' }]);
  if (!z) return noExiste(cx, 'Hosted zone', id, 'route53/zonas');
  const st = { filas: [registroVacio()], intento: false };
  const forma = ui.region(() => [
    ui.contenedor({
      titulo: 'Quick create record',
      descripcion: 'Quick create lets you create one or more records at once.',
      acciones: ui.boton('Switch to wizard', { desactivado: true, titulo: 'No disponible en el simulador' }),
      cuerpo: h(
        'div',
        { class: 'cx-pagina' },
        st.filas.map((f, i) =>
          tarjetaRegistro(cx, z, f, i, {
            repintar: () => forma.repintar(),
            quitar: st.filas.length > 1 ? () => (st.filas.splice(i, 1), forma.repintar()) : null,
            intento: st.intento
          })
        ),
        h('div', {}, ui.boton('Add another record', { alClic: () => (st.filas.push(registroVacio()), forma.repintar()) }))
      )
    })
  ]);
  function crear() {
    st.intento = true;
    forma.repintar();
    if (st.filas.some(incompleto)) return forma.querySelector('.cx-campo--error')?.scrollIntoView({ block: 'center' });
    const r = cx.hacer({ servicio: 'Route53', accion: 'ChangeResourceRecordSets', error: 'Error occurred' }, (e) => crearRegistrosDns(e, z.id, st.filas.map((f) => parametrosRegistro(z, f))));
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: `Record${r.valor.length === 1 ? ` ${r.valor[0].nombre}` : 's'} for ${z.nombre} ${r.valor.length === 1 ? 'was' : 'were'} successfully created.`, accion: null });
      cx.ir(rutaZona(z));
    }
  }
  return h('div', { class: 'cx-pagina cx-pagina--form' }, ui.encabezado({ titulo: 'Create record', info: 'r53-registro', cx }), forma, ui.pieFormulario({ cancelar: () => cx.ir(rutaZona(z)), enviar: crear, textoEnviar: 'Create records' }));
}

function editarRegistroPagina(cx, { id, registro }) {
  const z = zonaHospedadaDe(cx.estado, id);
  cx.migas([migaR53, migaZonas, { texto: z?.nombre ?? id, ruta: z ? rutaZona(z) : null }, { texto: 'Edit record' }]);
  if (!z) return noExiste(cx, 'Hosted zone', id, 'route53/zonas');
  const r = z.registros.find((x) => x.id === registro);
  if (!r) return noExiste(cx, 'Record', registro, rutaZona(z));
  // El NS de la zona solo admite cambiar sus valores y su TTL.
  if (r.sistema) {
    const f = { valores: r.valores.join('\n'), ttl: String(r.ttl) };
    const guardar = () => {
      const res = cx.hacer({ servicio: 'Route53', accion: 'ChangeResourceRecordSets', error: 'Error occurred' }, (e) => editarRegistroDns(e, z.id, r.id, f));
      if (res.ok) {
        cx.flash({ tipo: 'exito', texto: `Record ${r.nombre} was successfully updated.` });
        cx.ir(rutaZona(z));
      }
    };
    return h(
      'div',
      { class: 'cx-pagina cx-pagina--form' },
      ui.encabezado({ titulo: 'Edit record', cx }),
      ui.contenedor({
        titulo: `${r.nombre} · ${r.tipo}`,
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.alerta({ tipo: 'aviso', contenido: 'Estos son los servidores de nombres de la zona. Si los cambias, el dominio deja de resolver: casi nunca hay que tocarlos.' }),
          ui.campo({ etiqueta: 'Value', control: ui.area({ valor: f.valores, filas: 5, monoespaciado: true, alCambiar: (v) => (f.valores = v) }) }),
          ui.campo({ etiqueta: 'TTL (seconds)', control: ui.entrada({ valor: f.ttl, tipo: 'number', etiquetaAccesible: 'TTL (seconds)', alCambiar: (v) => (f.ttl = v) }) })
        )
      }),
      ui.pieFormulario({ cancelar: () => cx.ir(rutaZona(z)), enviar: guardar, textoEnviar: 'Save' })
    );
  }
  const f = registroDe(z, r);
  const st = { intento: false };
  const forma = ui.region(() => tarjetaRegistro(cx, z, f, 0, { repintar: () => forma.repintar(), editar: r, intento: st.intento }));
  function guardar() {
    st.intento = true;
    forma.repintar();
    if (incompleto(f)) return;
    const res = cx.hacer({ servicio: 'Route53', accion: 'ChangeResourceRecordSets', error: 'Error occurred' }, (e) => editarRegistroDns(e, z.id, r.id, parametrosRegistro(z, f)));
    if (res.ok) {
      cx.flash({ tipo: 'exito', texto: `Record ${r.nombre} was successfully updated.` });
      cx.ir(rutaZona(z));
    }
  }
  return h('div', { class: 'cx-pagina cx-pagina--form' }, ui.encabezado({ titulo: 'Edit record', info: 'r53-registro', cx }), forma, ui.pieFormulario({ cancelar: () => cx.ir(rutaZona(z)), enviar: guardar, textoEnviar: 'Save' }));
}

/* ============================================================== Test record */

function probarPaginaR53(cx, { id }) {
  const z = zonaHospedadaDe(cx.estado, id);
  cx.migas([migaR53, migaZonas, { texto: z?.nombre ?? id, ruta: z ? rutaZona(z) : null }, { texto: 'Test record' }]);
  if (!z) return noExiste(cx, 'Hosted zone', id, 'route53/zonas');
  const f = { sub: 'www', tipo: 'A', resultado: null, nombre: '' };
  const forma = ui.region(() =>
    ui.contenedor({
      titulo: 'Test',
      descripcion: 'Check the response that Route 53 returns to a DNS query for a record in this hosted zone.',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        h(
          'div',
          { class: 'cx-fila-campos' },
          ui.campo({ etiqueta: 'Record name', control: ui.entrada({ valor: f.sub, placeholder: 'subdomain', sufijo: `.${z.nombre}`, etiquetaAccesible: 'Record name', alCambiar: (v) => (f.sub = v), alEnter: () => probar() }) }),
          ui.campo({ etiqueta: 'Type', control: ui.selector({ valor: f.tipo, opciones: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA'].map((t) => ({ valor: t, etiqueta: t })), etiquetaAccesible: 'Type', alCambiar: (v) => (f.tipo = v) }) })
        ),
        ui.expandible({ titulo: 'Resolver IP address - optional', contenido: ui.entrada({ placeholder: '192.0.2.200', desactivado: true, etiquetaAccesible: 'Resolver IP address' }) }),
        h('div', {}, ui.boton('Get response', { variante: 'primario', alClic: () => probar() }))
      )
    })
  );
  const respuesta = ui.region(() => {
    const r = f.resultado;
    if (!r) return null;
    return ui.contenedor({
      titulo: 'Response returned by Route 53',
      cuerpo: ui.pares(
        [
          { etiqueta: 'DNS query sent to Route 53', valor: conPunto(f.nombre) },
          { etiqueta: 'Query type', valor: r.tipo },
          { etiqueta: 'Response code', valor: r.codigo === 'NOERROR' ? 'NOERROR' : ui.estado('error', r.codigo) },
          { etiqueta: 'Protocol', valor: r.protocolo },
          { etiqueta: 'Response returned by Route 53', valor: r.respuestas.length ? h('pre', { class: 'cx-mono cx-r53-valor' }, r.respuestas.join('\n')) : '-' }
        ],
        { columnas: 3 }
      )
    });
  });
  function probar() {
    f.nombre = nombreCompleto(z, f);
    f.resultado = probarRegistroDns(cx.estado, z.id, f.nombre, f.tipo);
    respuesta.repintar();
  }
  return h('div', { class: 'cx-pagina cx-pagina--form' }, ui.encabezado({ titulo: 'Test record', info: 'r53-registro', cx }), forma, respuesta, h('div', {}, ui.boton('Back to hosted zone', { variante: 'texto', alClic: () => cx.ir(rutaZona(z)) })));
}

/* ============================================================ health checks */

function listaChequeos(cx) {
  cx.migas([migaR53, { texto: 'Health checks' }]);
  const t = ui.tabla(cx, {
    titulo: 'Health checks',
    info: 'r53-chequeo',
    filas: () => chequeos(cx),
    clave: (c) => c.id,
    seleccion: 'unica',
    filtro: 'Filter by name, ID, or description',
    columnas: [
      { titulo: 'Name', valor: (c) => c.nombre || '-' },
      { titulo: 'Status', valor: (c) => estadoChequeo(c), texto: (c) => c.estado },
      { titulo: 'Description', valor: (c) => descripcionChequeo(c) },
      { titulo: 'Alarms', valor: () => 'No alarms configured' },
      { titulo: 'ID', valor: (c) => c.id }
    ],
    acciones: (sel) => [
      ui.boton('Edit health check', { desactivado: sel.length !== 1, escribe: true, alClic: () => cx.ir(`route53/chequeos/${sel[0].id}/editar`) }),
      ui.boton('Delete health check', {
        desactivado: sel.length !== 1,
        escribe: true,
        alClic: () =>
          cx.confirmar({
            titulo: 'Delete health check',
            textoBoton: 'Delete',
            contenido: h('p', {}, `Are you sure you want to delete the health check ${sel[0].nombre || sel[0].id}?`),
            aceptar: () => {
              const r = cx.hacer({ servicio: 'Route53', accion: 'DeleteHealthCheck', error: 'Failed to delete health check' }, (e) => eliminarChequeoSalud(e, sel[0].id));
              if (!r.ok) return false;
              cx.flash({ tipo: 'exito', texto: 'The health check was successfully deleted.' });
            }
          })
      }),
      ui.boton('Create health check', { variante: 'primario', alClic: () => cx.ir('route53/chequeos/crear') })
    ],
    vacio: { titulo: 'No health checks', texto: 'You don’t have any health checks.', accion: () => ui.boton('Create health check', { escribe: true, alClic: () => cx.ir('route53/chequeos/crear') }) },
    alSeleccionar: () => panel.repintar()
  });
  const inicial = cx.memoria.r53Chequeo;
  cx.memoria.r53Chequeo = null;
  const st = { pestana: 'monitoreo' };
  const panel = cx.vivo(() => {
    const c = t.seleccion()[0];
    if (!c) return ui.panelInferior({ titulo: 'Select a health check', contenido: h('div', { class: 'cx-panel-inferior__vacio' }) });
    return ui.panelInferior({
      titulo: `Health check: ${c.nombre || c.id}`,
      contenido: ui.pestanas({
        activa: st.pestana,
        alCambiar: (p) => (st.pestana = p),
        pestanas: [
          {
            id: 'monitoreo',
            texto: 'Monitoring',
            contenido: () =>
              ui.pares(
                [
                  { etiqueta: 'Status', valor: estadoChequeo(c) },
                  { etiqueta: 'Last status change', valor: c.cambio ? ui.fecha(c.cambio) : '-' },
                  { etiqueta: 'Last failure reason', valor: c.ultimo === 'falla' || c.estado === 'Unhealthy' ? c.observacion || '-' : '-' }
                ],
                { columnas: 3 }
              )
          },
          {
            id: 'info',
            texto: 'Info',
            contenido: () =>
              ui.pares(
                [
                  { etiqueta: 'Health check ID', valor: ui.copiable(c.id) },
                  { etiqueta: 'What to monitor', valor: c.tipo === 'calculado' ? 'Status of other health checks' : 'Endpoint' },
                  { etiqueta: 'Description', valor: descripcionChequeo(c) },
                  ...(c.tipo === 'calculado'
                    ? [{ etiqueta: 'Health checks to monitor', valor: h('div', {}, c.hijos.map((x) => h('div', {}, chequeoSaludDe(cx.estado, x)?.nombre || x))) }]
                    : [
                        { etiqueta: 'Request interval', valor: c.intervalo === 10 ? 'Fast (10 seconds)' : 'Standard (30 seconds)' },
                        { etiqueta: 'Failure threshold', valor: String(c.umbral) },
                        { etiqueta: 'Protocol', valor: c.protocolo }
                      ]),
                  { etiqueta: 'Invert health check status', valor: c.invertir ? 'Yes' : 'No' }
                ],
                { columnas: 3 }
              )
          },
          {
            id: 'chequeadores',
            texto: 'Health checkers',
            contenido: () =>
              c.tipo === 'calculado'
                ? h('p', { class: 'cx-texto-sec' }, 'Calculated health checks don’t use health checkers.')
                : ui.tabla(cx, {
                    titulo: 'Health checkers',
                    variante: 'simple',
                    filas: () => (c.ultimo ? CHEQUEADORES_R53 : []),
                    clave: (x) => x,
                    filtro: false,
                    columnas: [
                      { titulo: 'Health checker region', valor: (x) => x },
                      { titulo: 'Health checker IP', valor: (x, i) => `54.243.31.${200 + CHEQUEADORES_R53.indexOf(x)}` },
                      { titulo: 'Last checked', valor: () => ui.fecha(new Date(Math.max(0, (c.proximo ?? Date.now()) - 5000)).toISOString()) },
                      { titulo: 'Status', valor: () => c.observacion || '-' }
                    ],
                    vacio: { titulo: 'No results yet', texto: 'Route 53 is checking the endpoint for the first time.' }
                  })
          },
          { id: 'etiquetas', texto: 'Tags', contenido: () => tablaEtiquetas(cx, c.etiquetas ?? []) }
        ]
      })
    });
  });
  if (inicial) t.seleccionar([inicial]);
  return h('div', { class: 'cx-pagina' }, t, panel);
}

/** El marco de un asistente (pasos a la izquierda). */
function asistente(cx, { pasos, paso, titulo, info, cuerpo, pie }) {
  return h(
    'div',
    { class: 'cx-asis' },
    h('nav', { class: 'cx-asis__pasos', 'aria-label': 'Steps' }, h('ol', {}, pasos.map((p, i) => h('li', { class: ['cx-asis__paso', i === paso && 'cx-asis__paso--actual', i > paso && 'cx-asis__paso--futuro'], 'aria-current': i === paso ? 'step' : undefined }, h('small', {}, `Step ${i + 1}`), h('span', {}, p))))),
    h('div', { class: 'cx-asis__cuerpo cx-pagina' }, ui.encabezado({ titulo, info, cx }), cuerpo, pie)
  );
}

function chequeoPagina(cx, { id }) {
  const editar = id ? chequeoSaludDe(cx.estado, id) : null;
  cx.migas([migaR53, migaChequeos, { texto: editar ? 'Edit health check' : 'Create health check' }]);
  if (id && !editar) return noExiste(cx, 'Health check', id, 'route53/chequeos');
  const f = editar
    ? { paso: 0, nombre: editar.nombre, tipo: editar.tipo, por: editar.ip ? 'ip' : 'dominio', protocolo: editar.protocolo ?? 'HTTP', ip: editar.ip ?? '', dominio: editar.dominio ?? '', puerto: String(editar.puerto ?? 80), ruta: (editar.ruta ?? '/').replace(/^\//, ''), intervalo: editar.intervalo, umbral: String(editar.umbral), invertir: editar.invertir, hijos: [...(editar.hijos ?? [])], minimo: String(editar.minimoSanos ?? 1), alarma: 'no', intento: false }
    : { paso: 0, nombre: '', tipo: 'endpoint', por: 'ip', protocolo: 'HTTP', ip: '', dominio: '', puerto: '80', ruta: '', intervalo: 30, umbral: '3', invertir: false, hijos: [], minimo: '1', alarma: 'no', intento: false };
  const PASOS = ['Configure health check', 'Get notified when health check fails'];
  const repintar = () => vista.repintar();
  const faltaEndpoint = () => (f.por === 'ip' ? !f.ip.trim() : !f.dominio.trim());

  function paso1() {
    const endpoint = f.tipo === 'endpoint';
    return asistente(cx, {
      pasos: PASOS,
      paso: 0,
      titulo: 'Configure health check',
      info: 'r53-chequeo',
      cuerpo: [
        ui.contenedor({
          titulo: 'Configure health check',
          descripcion: 'Route 53 health checks let you track the health status of your resources, such as web servers or mail servers, and take action when an outage occurs.',
          cuerpo: h(
            'div',
            { class: 'cx-form' },
            ui.campo({ etiqueta: 'Name', control: ui.entrada({ valor: f.nombre, placeholder: 'Enter a name', etiquetaAccesible: 'Name', alCambiar: (v) => (f.nombre = v) }) }),
            ui.campo({
              etiqueta: 'What to monitor',
              control: ui.radios({
                valor: f.tipo,
                alCambiar: (v) => ((f.tipo = v), repintar()),
                opciones: [
                  { valor: 'endpoint', etiqueta: 'Endpoint', desactivado: Boolean(editar) && editar.tipo !== 'endpoint' },
                  { valor: 'calculado', etiqueta: 'Status of other health checks (calculated health check)', desactivado: Boolean(editar) && editar.tipo !== 'calculado' },
                  { valor: 'alarma', etiqueta: 'State of CloudWatch alarm', desactivado: true }
                ]
              })
            })
          )
        }),
        endpoint
          ? ui.contenedor({
              titulo: 'Monitor an endpoint',
              descripcion: 'Multiple Route 53 health checkers will try to establish a TCP connection with the following resource to determine whether it’s healthy.',
              cuerpo: h(
                'div',
                { class: 'cx-form' },
                ui.campo({
                  etiqueta: 'Specify endpoint by',
                  control: ui.radios({ horizontal: true, valor: f.por, alCambiar: (v) => ((f.por = v), repintar()), opciones: [{ valor: 'ip', etiqueta: 'IP address' }, { valor: 'dominio', etiqueta: 'Domain name' }] })
                }),
                ui.campo({
                  etiqueta: 'Protocol',
                  control: ui.selector({
                    valor: f.protocolo,
                    opciones: ['HTTP', 'HTTPS', 'TCP'].map((p) => ({ valor: p, etiqueta: p })),
                    etiquetaAccesible: 'Protocol',
                    alCambiar: (v) => {
                      f.protocolo = v;
                      if (v === 'HTTPS' && f.puerto === '80') f.puerto = '443';
                      if (v === 'HTTP' && f.puerto === '443') f.puerto = '80';
                      repintar();
                    }
                  })
                }),
                f.por === 'ip'
                  ? ui.campo({ etiqueta: 'IP address', control: ui.entrada({ valor: f.ip, placeholder: '192.0.2.44', etiquetaAccesible: 'IP address', alCambiar: (v) => (f.ip = v) }), restriccion: 'Una IP pública: los chequeadores de Route 53 están en internet.', error: f.intento && faltaEndpoint() ? 'IP address is required.' : null })
                  : ui.campo({ etiqueta: 'Domain name', control: ui.entrada({ valor: f.dominio, placeholder: 'www.example.com', etiquetaAccesible: 'Domain name', alCambiar: (v) => (f.dominio = v) }), error: f.intento && faltaEndpoint() ? 'Domain name is required.' : null }),
                ui.campo({ etiqueta: 'Port', control: ui.entrada({ valor: f.puerto, tipo: 'number', etiquetaAccesible: 'Port', alCambiar: (v) => (f.puerto = v) }) }),
                f.protocolo !== 'TCP'
                  ? ui.campo({ etiqueta: 'Path', opcional: true, control: ui.entrada({ valor: f.ruta, sufijo: undefined, placeholder: 'images', etiquetaAccesible: 'Path', alCambiar: (v) => (f.ruta = v) }), descripcion: 'The path that you want Route 53 to request, for example /index.html. Route 53 adds the leading slash.' })
                  : null,
                ui.expandible({
                  titulo: 'Advanced configuration',
                  contenido: h(
                    'div',
                    { class: 'cx-form' },
                    ui.campo({ etiqueta: 'Request interval', control: ui.radios({ valor: String(f.intervalo), alCambiar: (v) => (f.intervalo = Number(v)), opciones: [{ valor: '30', etiqueta: 'Standard (30 seconds)' }, { valor: '10', etiqueta: 'Fast (10 seconds)', descripcion: 'Costs more.' }] }) }),
                    ui.campo({ etiqueta: 'Failure threshold', control: ui.entrada({ valor: f.umbral, tipo: 'number', etiquetaAccesible: 'Failure threshold', alCambiar: (v) => (f.umbral = v) }), restriccion: 'The number of consecutive health checks that an endpoint must pass or fail to change status (1-10).' }),
                    ui.casilla({ etiqueta: 'Invert health check status', descripcion: 'Route 53 considers the endpoint unhealthy when it’s healthy and vice versa.', marcada: f.invertir, alCambiar: (v) => (f.invertir = v) }),
                    ui.alerta({ tipo: 'info', contenido: 'En el simulador un chequeo «Standard» se revisa cada 5 s y uno «Fast» cada 2.5 s, para que veas el cambio en clase.' })
                  )
                })
              )
            })
          : ui.contenedor({
              titulo: 'Monitor other health checks',
              cuerpo: h(
                'div',
                { class: 'cx-form' },
                ui.campo({
                  etiqueta: 'Health checks to monitor',
                  control: ui.selector({
                    multiple: true,
                    placeholder: 'Choose health checks',
                    valores: f.hijos,
                    opciones: chequeos(cx).filter((c) => c.tipo !== 'calculado' && c.id !== editar?.id).map((c) => ({ valor: c.id, etiqueta: c.nombre || c.id, descripcion: descripcionChequeo(c) })),
                    vacio: 'No endpoint health checks. Create one first.',
                    etiquetaAccesible: 'Health checks to monitor',
                    alCambiar: (v) => ((f.hijos = v), repintar())
                  }),
                  error: f.intento && !f.hijos.length ? 'Choose at least one health check.' : null
                }),
                ui.campo({
                  etiqueta: 'Report healthy when',
                  control: h('div', { class: 'cx-fila-campos' }, ui.entrada({ valor: f.minimo, tipo: 'number', etiquetaAccesible: 'Minimum healthy', alCambiar: (v) => (f.minimo = v) }), h('span', { class: 'cx-texto-sec' }, `of ${f.hijos.length} selected health checks are healthy`))
                })
              )
            })
      ],
      pie: h(
        'div',
        { class: 'cx-pie-form' },
        ui.boton('Cancel', { variante: 'texto', alClic: () => cx.ir('route53/chequeos') }),
        ui.boton('Next', {
          variante: 'primario',
          alClic: () => {
            f.intento = true;
            if (f.tipo === 'endpoint' ? faltaEndpoint() : !f.hijos.length) return repintar();
            f.paso = 1;
            repintar();
          }
        })
      )
    });
  }

  function paso2() {
    return asistente(cx, {
      pasos: PASOS,
      paso: 1,
      titulo: 'Get notified when health check fails',
      cuerpo: ui.contenedor({
        titulo: 'Get notified when health check fails',
        descripcion: 'CloudWatch alarms can notify you through SNS when the health check status changes.',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.campo({ etiqueta: 'Create alarm', control: ui.radios({ horizontal: true, valor: 'no', opciones: [{ valor: 'si', etiqueta: 'Yes', desactivado: true }, { valor: 'no', etiqueta: 'No' }] }) }),
          ui.alerta({ tipo: 'info', contenido: 'Las alarmas de health checks se crean en CloudWatch (métrica HealthCheckStatus del espacio AWS/Route53). En el simulador esa conexión todavía no está: deja «No».' })
        )
      }),
      pie: h(
        'div',
        { class: 'cx-pie-form' },
        ui.boton('Cancel', { variante: 'texto', alClic: () => cx.ir('route53/chequeos') }),
        ui.boton('Previous', { alClic: () => ((f.paso = 0), repintar()) }),
        ui.boton(editar ? 'Save' : 'Create health check', { variante: 'primario', alClic: guardar })
      )
    });
  }

  function guardar() {
    const p =
      f.tipo === 'calculado'
        ? { nombre: f.nombre, tipo: 'calculado', hijos: f.hijos, minimoSanos: f.minimo, invertir: f.invertir }
        : { nombre: f.nombre, tipo: 'endpoint', protocolo: f.protocolo, ip: f.por === 'ip' ? f.ip.trim() : null, dominio: f.por === 'dominio' ? f.dominio.trim() : null, puerto: f.puerto, ruta: f.protocolo === 'TCP' ? null : `/${f.ruta.trim().replace(/^\//, '')}`, intervalo: f.intervalo, umbral: f.umbral, invertir: f.invertir };
    const r = cx.hacer({ servicio: 'Route53', accion: editar ? 'UpdateHealthCheck' : 'CreateHealthCheck', error: editar ? 'Failed to update health check' : 'Failed to create health check' }, (e) => (editar ? editarChequeoSalud(e, editar.id, p) : crearChequeoSalud(e, p)));
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: editar ? 'The health check was successfully updated.' : 'The health check was successfully created. Its status is Unknown until Route 53 checks it.' });
      cx.memoria.r53Chequeo = r.valor.id;
      cx.ir('route53/chequeos');
    } else {
      f.paso = 0;
      repintar();
    }
  }
  const vista = ui.region(() => (f.paso === 0 ? paso1() : paso2()));
  return h('div', { class: 'cx-pagina' }, vista);
}

/* ============================================================== dominios */

function dominios(cx) {
  cx.migas([migaR53, { texto: 'Registered domains' }]);
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.tabla(cx, {
      titulo: 'Registered domains',
      info: 'r53-zona',
      filas: () => [],
      clave: (x) => x,
      filtro: 'Search',
      columnas: [
        { titulo: 'Domain name', valor: () => '' },
        { titulo: 'Expiration date', valor: () => '' },
        { titulo: 'Auto-renew', valor: () => '' },
        { titulo: 'Transfer lock', valor: () => '' }
      ],
      acciones: () => [ui.boton('Transfer in', { desactivado: true }), ui.boton('Register domains', { variante: 'primario', desactivado: true })],
      vacio: { titulo: 'No registered domains', texto: 'Registrar un dominio no está disponible en el simulador (cuesta dinero de verdad). Crea una hosted zone pública: el simulador la trata como si el dominio ya fuera tuyo.' }
    })
  );
}

/* ================================================================ ayudas */

const ayudas = {
  route53: {
    titulo: 'Amazon Route 53',
    texto: [
      '**Route 53** es el servicio de **DNS** de AWS: traduce nombres como `www.tudominio.com` a la dirección donde vive tu sitio (una IP, un balanceador, CloudFront…).',
      'Se llama «53» por el puerto del DNS. Es un servicio **global** y AWS promete 100 % de disponibilidad.',
      ['**Registrar dominios** (comprar tudominio.com).', '**Hosted zones**: los registros DNS de tu dominio.', '**Health checks** y **políticas de enrutamiento** (weighted, latency, failover…) para mandar a tus usuarios al servidor sano o más cercano.']
    ]
  },
  'r53-zona': {
    titulo: 'Hosted zone',
    texto: [
      'Una **hosted zone** guarda todos los registros DNS de un dominio (por ejemplo `tudominio.com` y sus subdominios).',
      ['**Pública**: responde a todo internet.', '**Privada**: solo responde dentro de las VPC que asocies (nombres internos como `db.interna.local`).'],
      'Al crearla, Route 53 agrega dos registros: **NS** (los 4 servidores de nombres que debes poner en tu registrador) y **SOA**. No se pueden borrar.',
      'Para borrar la zona, primero borra los demás registros.'
    ]
  },
  'r53-registro': {
    titulo: 'Registros DNS',
    texto: [
      'Cada **registro** dice a dónde va un nombre:',
      ['**A**: a una dirección IPv4 (`3.80.12.34`).', '**AAAA**: a una IPv6.', '**CNAME**: a otro nombre (`www` → `tienda.otrodominio.com`). No se permite en la raíz del dominio.', '**MX**: los servidores de correo, con prioridad (`10 mail.tudominio.com`).', '**TXT**: texto entre comillas, para verificaciones (SPF, Google…).'],
      'Usa **Test record** para ver qué contesta Route 53, y el botón del simulador **Open in browser** para abrir el nombre.'
    ]
  },
  'r53-alias': {
    titulo: 'Registros Alias',
    texto: [
      'Un **Alias** es una extensión de Route 53: un registro **A** que apunta directo a un recurso de AWS por su nombre, y Route 53 sigue sus IP aunque cambien.',
      ['Funciona en la **raíz** del dominio (`tudominio.com`), donde un CNAME no se permite.', 'Las consultas a un Alias de AWS **no se cobran**.', 'No lleva TTL: usa el del recurso.'],
      'Destinos en el simulador: un **ALB**, una distribución de **CloudFront**, el **sitio web de S3** (el bucket debe llamarse igual que el registro) u otro registro de la zona.'
    ]
  },
  'r53-ttl': {
    titulo: 'TTL',
    texto: [
      'El **TTL** (time to live) es cuántos segundos guardan la respuesta los resolvedores de internet antes de volver a preguntar.',
      ['TTL alto (1 día): menos consultas y más barato, pero los cambios tardan en verse.', 'TTL bajo (60 s): los cambios se ven rápido; útil antes de una migración.']
    ]
  },
  'r53-politica': {
    titulo: 'Políticas de enrutamiento',
    texto: [
      '**Simple**: un nombre, un destino.',
      '**Weighted**: reparte por pesos (por ejemplo 90 % a la versión actual y 10 % a la nueva). Cada registro lleva un **Record ID** distinto.',
      '**Latency**: manda al usuario a la región con menos latencia para él.',
      '**Failover**: un registro **Primary** con health check y uno **Secondary** de respaldo; si el primario falla, Route 53 contesta con el secundario (activo-pasivo).',
      'Geolocation (por país del usuario), Geoproximity, IP-based y Multivalue también existen en AWS; aquí se ven desactivadas.'
    ]
  },
  'r53-chequeo': {
    titulo: 'Health checks',
    texto: [
      'Un **health check** de Route 53 revisa desde varias regiones de internet si tu servidor responde (HTTP 2xx o 3xx, o una conexión TCP).',
      'Si falla tantas veces seguidas como el **Failure threshold** (3 por omisión), queda **Unhealthy** y las políticas failover o weighted dejan de mandar tráfico ahí.',
      'Ojo: los chequeadores vienen de internet, así que el grupo de seguridad de tu instancia debe dejarlos entrar.'
    ]
  }
};

export default {
  id: 'route53',
  nombre: 'Route 53',
  titulo: 'Route 53',
  descripcion: 'Scalable DNS and Domain Name Registration',
  categoria: 'redes',
  claves: 'dns dominio route53 zona registro alias failover',
  inicio: 'route53',
  menu: [
    { texto: 'Dashboard', ruta: 'route53' },
    { texto: 'Hosted zones', ruta: 'route53/zonas' },
    { texto: 'Health checks', ruta: 'route53/chequeos' },
    { texto: 'Profiles', desactivado: true },
    { seccion: 'IP-based routing', items: [{ texto: 'CIDR collections', desactivado: true }] },
    { seccion: 'Traffic flow', items: [{ texto: 'Traffic policies', desactivado: true }, { texto: 'Policy records', desactivado: true }] },
    { seccion: 'Domains', items: [{ texto: 'Registered domains', ruta: 'route53/dominios' }, { texto: 'Requests', desactivado: true }] },
    { seccion: 'Resolver', items: [{ texto: 'VPCs', desactivado: true }, { texto: 'Inbound endpoints', desactivado: true }, { texto: 'Outbound endpoints', desactivado: true }] }
  ],
  rutas: {
    '': dashboard,
    zonas: listaZonas,
    'zonas/crear': crearZonaPagina,
    'zonas/:id': detalleZona,
    'zonas/:id/editar': editarZonaPagina,
    'zonas/:id/probar': probarPaginaR53,
    'zonas/:id/registros/crear': crearRegistroPagina,
    'zonas/:id/registros/:registro/editar': editarRegistroPagina,
    chequeos: listaChequeos,
    'chequeos/crear': chequeoPagina,
    'chequeos/:id/editar': chequeoPagina,
    dominios
  },
  busqueda: [
    { texto: 'Hosted zones', ruta: 'route53/zonas', claves: 'zonas dns' },
    { texto: 'Create hosted zone', ruta: 'route53/zonas/crear' },
    { texto: 'Health checks', ruta: 'route53/chequeos' },
    { texto: 'Registered domains', ruta: 'route53/dominios', claves: 'dominios' }
  ],
  ayudas
};
