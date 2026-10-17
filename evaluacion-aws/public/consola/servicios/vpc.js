// ---------------------------------------------------------------------------
// VPC
//
// Your VPCs (con el Resource map), Create VPC («VPC only» y «VPC and more» con
// su vista previa y la pantalla de progreso), Subnets, Route tables,
// Internet gateways, NAT gateways, Network ACLs, y las pantallas compartidas
// con EC2 (Security groups y Elastic IPs).
// ---------------------------------------------------------------------------

import * as ui from '../ui.js';
import {
  adjuntarIgw,
  asociarNacl,
  asociarSubredes,
  asignarEip,
  crearIgw,
  crearNacl,
  crearNat,
  crearSubred,
  crearTablaRutas,
  crearVpc,
  crearVpcCompleta,
  desadjuntarIgw,
  editarReglasNacl,
  editarRutas,
  editarSubred,
  editarVpc,
  eliminarIgw,
  eliminarNacl,
  eliminarNat,
  eliminarSubred,
  eliminarTablaRutas,
  eliminarVpc,
  enteroAIp,
  hacerPrincipal,
  ID_ZONA,
  igwDeVpc,
  parsearCidr,
  tablaDeSubred,
  naclDeSubred,
  TIPOS_REGLA,
  tipoDeRegla,
  textoPuertos,
  textoProtocolo,
  ZONAS
} from '../modelo.js';
import { esSubredPublica } from '../red.js';
import {
  enlaceRecurso,
  idBarraNombre,
  idParentesis,
  ipsLibres,
  nombre,
  noExiste,
  opcionesVpc,
  paginaEtiquetas,
  panelVacio,
  pestanaEtiquetas,
  zonaTexto
} from './comun.js';
import { rutasEips, rutasGrupos } from './ec2-red.js';

const { h } = ui;
const MIGA = { texto: 'VPC', ruta: 'vpc' };
const n = (lista, palabra) => `${lista.length} ${palabra}${lista.length === 1 ? '' : 's'}`;

/* ===================================================== el mapa de recursos */

/**
 * El «Resource map»: columnas con cajas y líneas entre ellas.
 *   columnas: [{ titulo, desc, grupos: [{ titulo, cajas: [{ id, texto, sub, letra, publica, ruta }] }] }]
 *   conexiones: [[idA, idB, punteada?]]
 * Al pasar el mouse por una caja se iluminan sus conexiones (como en la consola).
 */
function mapa(cx, { columnas, conexiones }) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'cx-mapa__lineas');
  svg.setAttribute('aria-hidden', 'true');
  const lienzo = h(
    'div',
    { class: 'cx-mapa__columnas', style: { position: 'relative' } },
    columnas.map((c) =>
      h(
        'div',
        { class: 'cx-mapa__col' },
        h('h3', {}, c.titulo, c.contador !== undefined ? h('span', {}, ` (${c.contador})`) : null),
        h('div', { class: 'cx-mapa__col-desc' }, c.desc),
        c.grupos.every((g) => !g.cajas.length) ? h('div', { class: 'cx-mapa__vacio' }, c.vacio ?? 'None') : null,
        c.grupos.map((g) => [
          g.titulo && g.cajas.length ? h('div', { class: 'cx-mapa__az' }, g.titulo) : null,
          g.cajas.map((b) =>
            h(
              'div',
              {
                class: ['cx-mapa__caja', b.ruta && 'cx-mapa__caja--clic'],
                'data-id': b.id,
                tabindex: b.ruta ? '0' : undefined,
                role: b.ruta ? 'link' : undefined,
                title: b.titulo ?? b.id,
                onclick: b.ruta ? () => cx.ir(b.ruta) : undefined,
                onkeydown: b.ruta ? (e) => e.key === 'Enter' && cx.ir(b.ruta) : undefined
              },
              b.letra ? h('span', { class: ['cx-mapa__letra', b.publica ? 'cx-mapa__letra--publica' : 'cx-mapa__letra--privada'] }, b.letra) : null,
              h('span', {}, b.texto, b.sub ? h('small', {}, b.sub) : null)
            )
          )
        ])
      )
    )
  );
  lienzo.prepend(svg);

  const caja = (id) => lienzo.querySelector(`.cx-mapa__caja[data-id="${CSS.escape(id)}"]`);
  function dibujar() {
    if (!lienzo.isConnected) return;
    const base = lienzo.getBoundingClientRect();
    svg.replaceChildren();
    svg.setAttribute('width', String(lienzo.scrollWidth));
    svg.setAttribute('height', String(lienzo.scrollHeight));
    for (const [a, b, punteada] of conexiones) {
      const A = caja(a);
      const B = caja(b);
      if (!A || !B) continue;
      const ra = A.getBoundingClientRect();
      const rb = B.getBoundingClientRect();
      const x1 = ra.right - base.left;
      const y1 = ra.top + ra.height / 2 - base.top;
      const x2 = rb.left - base.left;
      const y2 = rb.top + rb.height / 2 - base.top;
      const m = (x1 + x2) / 2;
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', `M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}`);
      p.dataset.a = a;
      p.dataset.b = b;
      if (punteada) p.setAttribute('class', 'cx-mapa__punteada');
      svg.append(p);
    }
  }

  // Ilumina todo lo que está conectado (hacia los dos lados) con la caja.
  function iluminar(id) {
    const vecinos = new Set(id ? [id] : []);
    if (id) {
      // Hacia la derecha y hacia la izquierda por separado, para no saltar a ramas ajenas.
      for (const sentido of [0, 1]) {
        let frente = [id];
        while (frente.length) {
          const sig = [];
          for (const x of frente) for (const c of conexiones) if (c[sentido] === x && !vecinos.has(c[1 - sentido])) (vecinos.add(c[1 - sentido]), sig.push(c[1 - sentido]));
          frente = sig;
        }
      }
    }
    lienzo.querySelectorAll('.cx-mapa__caja').forEach((el) => {
      el.classList.toggle('cx-mapa__caja--luz', Boolean(id) && vecinos.has(el.dataset.id));
      el.classList.toggle('cx-mapa__caja--tenue', Boolean(id) && !vecinos.has(el.dataset.id));
    });
    svg.querySelectorAll('path').forEach((p) => {
      const si = id && vecinos.has(p.dataset.a) && vecinos.has(p.dataset.b);
      p.classList.toggle('cx-mapa__linea--luz', Boolean(si));
      p.classList.toggle('cx-mapa__linea--tenue', Boolean(id) && !si);
    });
  }
  lienzo.addEventListener('mouseover', (e) => iluminar(e.target.closest('.cx-mapa__caja')?.dataset.id ?? null));
  lienzo.addEventListener('mouseleave', () => iluminar(null));
  lienzo.addEventListener('focusin', (e) => iluminar(e.target.closest('.cx-mapa__caja')?.dataset.id ?? null));

  let intentos = 0;
  const esperar = () => {
    if (lienzo.isConnected) {
      dibujar();
      if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => dibujar()).observe(lienzo);
    } else if (intentos++ < 120) requestAnimationFrame(esperar);
  };
  requestAnimationFrame(esperar);
  return h('div', { class: 'cx-mapa' }, lienzo);
}

const LETRA = (az) => az.slice(-1).toUpperCase();

/** El Resource map de una VPC que ya existe. */
function mapaDeVpc(cx, vpc) {
  const e = cx.estado;
  const subredes = e.subredes.filter((s) => s.vpcId === vpc.id).sort((a, b) => a.az.localeCompare(b.az) || a.cidr.localeCompare(b.cidr, 'en', { numeric: true }));
  const tablas = e.tablasRutas.filter((t) => t.vpcId === vpc.id);
  const igw = igwDeVpc(e, vpc.id);
  const nats = e.nats.filter((x) => x.vpcId === vpc.id && x.estado !== 'deleted');
  const zonas = [...new Set(subredes.map((s) => s.az))];
  const conexiones = [];
  for (const s of subredes) {
    conexiones.push([vpc.id, s.id]);
    const t = tablaDeSubred(e, s.id);
    if (t) conexiones.push([s.id, t.id]);
  }
  for (const t of tablas) for (const r of t.rutas) if (r.objetivo !== 'local' && (r.objetivo === igw?.id || nats.some((x) => x.id === r.objetivo))) conexiones.push([t.id, r.objetivo, true]);
  const conexionesRed = [igw, ...nats].filter(Boolean);
  return mapa(cx, {
    columnas: [
      { titulo: 'VPC', desc: 'Your AWS virtual network', grupos: [{ cajas: [{ id: vpc.id, texto: vpc.nombre || vpc.id, sub: vpc.cidr }] }] },
      {
        titulo: 'Subnets',
        contador: subredes.length,
        desc: 'Subnets within this VPC',
        vacio: 'No subnets',
        grupos: zonas.map((az) => ({
          titulo: az,
          cajas: subredes.filter((s) => s.az === az).map((s) => ({ id: s.id, texto: s.nombre || s.id, sub: s.cidr, letra: LETRA(az), publica: esSubredPublica(e, s.id), ruta: `vpc/subredes/${s.id}` }))
        }))
      },
      {
        titulo: 'Route tables',
        contador: tablas.length,
        desc: 'Route network traffic to resources',
        grupos: [{ cajas: tablas.map((t) => ({ id: t.id, texto: t.nombre || t.id, sub: t.principal ? 'Main route table' : undefined, ruta: `vpc/tablas/${t.id}` })) }]
      },
      {
        titulo: 'Network connections',
        contador: conexionesRed.length,
        desc: 'Connections to other networks',
        vacio: 'No network connections',
        grupos: [{ cajas: conexionesRed.map((c) => ({ id: c.id, texto: c.nombre || c.id, sub: c.id.startsWith('nat-') ? `NAT gateway · ${c.estado}` : 'Internet gateway', ruta: c.id.startsWith('nat-') ? `vpc/nats/${c.id}` : `vpc/igws/${c.id}` })) }]
      }
    ],
    conexiones
  });
}

function leyendaMapa() {
  return h(
    'div',
    { class: 'cx-leyenda' },
    h('span', {}, h('span', { class: 'cx-mapa__letra cx-mapa__letra--publica' }, 'A'), 'Public subnet (route to an internet gateway)'),
    h('span', {}, h('span', { class: 'cx-mapa__letra cx-mapa__letra--privada' }, 'A'), 'Private subnet'),
    h('span', {}, 'Pasa el mouse por una caja para ver sus conexiones.')
  );
}

/* ================================================================ VPCs */

const vpcDe = (cx, id) => cx.estado.vpcs.find((v) => v.id === id);
const tablaPrincipal = (cx, vpcId) => cx.estado.tablasRutas.find((t) => t.vpcId === vpcId && t.principal);
const naclDefecto = (cx, vpcId) => cx.estado.nacls.find((x) => x.vpcId === vpcId && x.porDefecto);
const dhcp = (cx) => `dopt-0${cx.estado.cuenta.id.slice(0, 16).padEnd(16, '7')}`.slice(0, 22);

function paresVpc(cx, v) {
  return ui.pares(
    [
      { etiqueta: 'VPC ID', valor: ui.copiable(v.id) },
      { etiqueta: 'State', valor: ui.estado('exito', 'Available') },
      { etiqueta: 'Block Public Access', valor: ui.estado('detenido', 'Off') },
      { etiqueta: 'DNS hostnames', info: 'dns-vpc', valor: v.dnsHostnames ? 'Enabled' : 'Disabled' },
      { etiqueta: 'DNS resolution', info: 'dns-vpc', valor: v.dnsResolution ? 'Enabled' : 'Disabled' },
      { etiqueta: 'Tenancy', valor: v.tenancy },
      { etiqueta: 'DHCP option set', valor: dhcp(cx) },
      { etiqueta: 'Main route table', valor: enlaceRecurso(cx, tablaPrincipal(cx, v.id)?.id) },
      { etiqueta: 'Main network ACL', valor: enlaceRecurso(cx, naclDefecto(cx, v.id)?.id) },
      { etiqueta: 'Default VPC', valor: v.porDefecto ? 'Yes' : 'No' },
      { etiqueta: 'IPv4 CIDR', info: 'cidr', valor: v.cidr },
      { etiqueta: 'IPv6 pool', valor: '–' },
      { etiqueta: 'IPv6 CIDR (Network border group)', valor: '–' },
      { etiqueta: 'Network Address Usage metrics', valor: 'Disabled' },
      { etiqueta: 'Owner ID', valor: cx.estado.cuenta.id }
    ],
    { columnas: 4, cx }
  );
}

function borrarVpc(cx, v, alTerminar) {
  const e = cx.estado;
  const tambien = [
    ...e.subredes.filter((s) => s.vpcId === v.id).map((s) => [s.nombre, s.id, 'Subnet']),
    ...e.tablasRutas.filter((t) => t.vpcId === v.id && !t.principal).map((t) => [t.nombre, t.id, 'Route table']),
    ...e.igws.filter((g) => g.vpcId === v.id).map((g) => [g.nombre, g.id, 'Internet gateway (detach and delete)']),
    ...e.gruposSeguridad.filter((g) => g.vpcId === v.id && !g.porDefecto).map((g) => [g.nombre, g.id, 'Security group']),
    ...e.nacls.filter((x) => x.vpcId === v.id && !x.porDefecto).map((x) => [x.nombre, x.id, 'Network ACL'])
  ];
  cx.confirmar({
    titulo: 'Delete VPC',
    palabra: 'delete',
    ancho: 'grande',
    contenido: [
      ui.contenedor({
        titulo: ui.estado('exito', 'Will be deleted'),
        descripcion: 'This VPC will be deleted permanently and cannot be recovered later:',
        cuerpo: ui.pares([{ etiqueta: 'Name', valor: v.nombre || '–' }, { etiqueta: 'VPC ID', valor: ui.copiable(v.id) }, { etiqueta: 'State', valor: ui.estado('exito', 'Available') }], { columnas: 3 })
      }),
      tambien.length
        ? ui.contenedor({
            titulo: ui.estado('exito', 'Will also be deleted'),
            descripcion: `The following ${tambien.length} resources will also be deleted permanently and cannot be recovered later:`,
            sinRelleno: true,
            cuerpo: h(
              'table',
              { class: 'cx-tabla__tabla' },
              h('thead', {}, h('tr', {}, ['Name', 'Resource ID', 'Type'].map((t) => h('th', {}, h('span', { class: 'cx-tabla__orden' }, t))))),
              h('tbody', {}, tambien.map(([nom, id, tipo]) => h('tr', {}, h('td', { style: { paddingLeft: '20px' } }, nom || '–'), h('td', {}, id), h('td', {}, tipo))))
            )
          })
        : null,
      v.porDefecto ? ui.alerta({ tipo: 'aviso', titulo: 'This is your default VPC', contenido: 'If you delete it, instances launched with «No preference» won’t have a default subnet to use.' }) : null
    ],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'VPC', accion: 'DeleteVpc', error: `Failed to delete VPC ${v.id}` }, (es) => eliminarVpc(es, v.id));
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: `Successfully deleted ${v.id} / ${v.nombre || v.id}` });
        alTerminar?.();
      }
    }
  });
}

function accionesVpc(cx, sel, alBorrar) {
  const uno = sel.length === 1 ? sel[0] : null;
  return [
    { texto: 'Create flow log', desactivado: true },
    { texto: 'Edit VPC settings', escribe: true, desactivado: !uno, alClic: () => cx.ir(`vpc/vpcs/${uno.id}/editar`) },
    { texto: 'Edit CIDRs', desactivado: true },
    { texto: 'Manage middlebox routes', desactivado: true },
    { texto: 'Manage tags', escribe: true, desactivado: !uno, alClic: () => cx.ir(`vpc/etiquetas/${uno.id}`) },
    '-',
    { texto: 'Delete VPC', escribe: true, desactivado: !uno, alClic: () => borrarVpc(cx, uno, alBorrar) }
  ];
}

function pestanasVpc(cx, v, st, { conDetalles = true } = {}) {
  return ui.pestanas({
    activa: st.pestana,
    alCambiar: (p) => (st.pestana = p),
    pestanas: [
      conDetalles ? { id: 'detalles', texto: 'Details', contenido: () => ui.contenedor({ titulo: 'Details', cuerpo: paresVpc(cx, v) }) } : null,
      {
        id: 'mapa',
        texto: 'Resource map',
        contenido: () => ui.contenedor({ titulo: 'Resource map', info: 'mapa-recursos', cx, acciones: ui.interruptor({ etiqueta: 'Show all details', desactivado: true }), cuerpo: [mapaDeVpc(cx, v), leyendaMapa()] })
      },
      {
        id: 'cidrs',
        texto: 'CIDRs',
        contenido: () =>
          ui.contenedor({
            titulo: 'IPv4 CIDRs',
            sinRelleno: true,
            cuerpo: h(
              'table',
              { class: 'cx-tabla__tabla' },
              h('thead', {}, h('tr', {}, ['CIDR', 'Status', 'Network border group'].map((t) => h('th', {}, h('span', { class: 'cx-tabla__orden' }, t))))),
              h('tbody', {}, h('tr', {}, h('td', { style: { paddingLeft: '20px' } }, v.cidr), h('td', {}, ui.estado('exito', 'Associated')), h('td', {}, 'us-east-1')))
            )
          })
      },
      { id: 'flujo', texto: 'Flow logs', desactivada: true, contenido: () => null },
      { id: 'etiquetas', texto: 'Tags', contenido: () => pestanaEtiquetas(cx, v) }
    ].filter(Boolean)
  });
}

function listaVpcs(cx) {
  cx.migas([MIGA, { texto: 'Your VPCs' }]);
  const st = { pestana: 'detalles' };
  const t = ui.tabla(cx, {
    titulo: 'Your VPCs',
    info: 'vpc',
    filas: () => cx.estado.vpcs,
    clave: (v) => v.id,
    seleccion: 'multiple',
    filtro: 'Find VPCs by attribute or tag',
    ultimaActualizacion: true,
    columnas: [
      { titulo: 'Name', valor: (v) => nombre(v), editable: true },
      { titulo: 'VPC ID', valor: (v) => ui.enlace(v.id, `vpc/vpcs/${v.id}`, { cx }) },
      { titulo: 'State', valor: () => ui.estado('exito', 'Available') },
      { titulo: 'Block Public Access', valor: () => ui.estado('detenido', 'Off') },
      { titulo: 'IPv4 CIDR', valor: (v) => v.cidr },
      { titulo: 'IPv6 CIDR', valor: () => '–' },
      { titulo: 'DHCP option set', valor: () => dhcp(cx) },
      { titulo: 'Main route table', valor: (v) => enlaceRecurso(cx, tablaPrincipal(cx, v.id)?.id) },
      { titulo: 'Main network ACL', valor: (v) => enlaceRecurso(cx, naclDefecto(cx, v.id)?.id) },
      { titulo: 'Tenancy', valor: (v) => v.tenancy },
      { titulo: 'Default VPC', valor: (v) => (v.porDefecto ? 'Yes' : 'No') },
      { titulo: 'Owner ID', valor: () => cx.estado.cuenta.id }
    ],
    acciones: (sel) => [ui.menuBoton('Actions', () => accionesVpc(cx, sel, () => t.seleccionar([]))), ui.boton('Create VPC', { variante: 'primario', alClic: () => cx.ir('vpc/vpcs/crear') })],
    vacio: { titulo: 'No VPCs found in this Region', accion: ui.boton('Create VPC', { escribe: true, alClic: () => cx.ir('vpc/vpcs/crear') }) },
    alSeleccionar: () => panel.repintar()
  });
  const panel = cx.vivo(() => {
    const sel = t.seleccion();
    if (sel.length !== 1) return panelVacio(sel.length ? `${sel.length} VPCs selected` : 'Select a VPC');
    const v = sel[0];
    return ui.panelInferior({ titulo: `${v.id} / ${v.nombre || v.id}`, contenido: pestanasVpc(cx, v, st) });
  });
  return h('div', { class: 'cx-pagina' }, t, panel);
}

function detalleVpc(cx, { id }) {
  cx.migas([MIGA, { texto: 'Your VPCs', ruta: 'vpc/vpcs' }, { texto: id }]);
  if (!vpcDe(cx, id)) return noExiste(cx, 'VPC', id, 'vpc/vpcs');
  const st = { pestana: 'mapa' };
  return cx.vivo(() => {
    const v = vpcDe(cx, id);
    if (!v) return noExiste(cx, 'VPC', id, 'vpc/vpcs');
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({ titulo: `${v.id} / ${v.nombre || v.id}`, acciones: ui.menuBoton('Actions', () => accionesVpc(cx, [v], () => cx.ir('vpc/vpcs'))) }),
      ui.contenedor({ titulo: 'Details', info: 'vpc', cx, cuerpo: paresVpc(cx, v) }),
      pestanasVpc(cx, v, st, { conDetalles: false })
    );
  });
}

function editarVpcPagina(cx, { id }) {
  cx.migas([MIGA, { texto: 'Your VPCs', ruta: 'vpc/vpcs' }, { texto: id, ruta: `vpc/vpcs/${id}` }, { texto: 'Edit VPC settings' }]);
  const v = vpcDe(cx, id);
  if (!v) return noExiste(cx, 'VPC', id, 'vpc/vpcs');
  const f = { resolucion: v.dnsResolution, nombres: v.dnsHostnames };
  const form = ui.region(() =>
    h(
      'div',
      { class: 'cx-form' },
      ui.casilla({ etiqueta: 'Enable DNS resolution', descripcion: 'Indicates whether the DNS resolution is supported.', marcada: f.resolucion, alCambiar: (x) => ((f.resolucion = x), !x && (f.nombres = false), form.repintar()) }),
      ui.casilla({ etiqueta: 'Enable DNS hostnames', descripcion: 'Indicates whether instances with public IP addresses get corresponding public DNS hostnames.', marcada: f.nombres, desactivado: !f.resolucion, alCambiar: (x) => (f.nombres = x) })
    )
  );
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Edit VPC settings', info: 'dns-vpc', cx }),
    ui.contenedor({ titulo: 'VPC details', cuerpo: ui.pares([{ etiqueta: 'VPC ID', valor: v.id }, { etiqueta: 'Name', valor: v.nombre || '–' }], { columnas: 2 }) }),
    ui.contenedor({ titulo: 'DNS settings', info: 'dns-vpc', cx, cuerpo: form }),
    ui.pieFormulario({
      cancelar: () => cx.ir(`vpc/vpcs/${id}`),
      textoEnviar: 'Save',
      enviar: () => {
        const r = cx.hacer({ servicio: 'VPC', accion: 'ModifyVpcAttribute', error: 'Failed to modify VPC settings' }, (e) => editarVpc(e, id, { dnsResolution: f.resolucion, dnsHostnames: f.nombres }));
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: `You have successfully modified the settings for ${id}.` });
          cx.ir(`vpc/vpcs/${id}`);
        }
      }
    })
  );
}

/* ============================================================ Create VPC */

/** Lo que crearía «VPC and more» (mismos nombres y rangos que modelo.js), para la vista previa. */
function planVpc(f) {
  const c = parsearCidr(f.cidr);
  const pre = f.prefijo.trim() || 'project';
  const azs = ZONAS.slice(f.primeraZona, f.primeraZona + f.zonas);
  if (!c) return { valido: false, pre, azs, publicas: [], privadas: [] };
  const tamano = Math.min(c.prefijo + 4, 28);
  const paso = 2 ** (32 - tamano);
  const bloque = (k) => `${enteroAIp(c.inicio + k * paso)}/${tamano}`;
  const mitad = 2 ** (tamano - c.prefijo) / 2;
  const publicas = azs.slice(0, f.publicas).map((az, i) => ({ nombre: `${pre}-subnet-public${i + 1}-${az}`, az, sugerido: bloque(i), cidr: f.bloquesPublicos[i]?.trim() || bloque(i) }));
  const privadas = [];
  for (let i = 0; i < f.privadas; i++) {
    const az = azs[i % azs.length];
    privadas.push({ nombre: `${pre}-subnet-private${i + 1}-${az}`, az, sugerido: bloque(mitad + i), cidr: f.bloquesPrivados[i]?.trim() || bloque(mitad + i) });
  }
  return { valido: true, pre, azs, publicas, privadas };
}

function vistaPrevia(cx, f) {
  const p = planVpc(f);
  const vpcId = 'p-vpc';
  const conexiones = [];
  const subredes = [...p.publicas.map((s) => ({ ...s, publica: true })), ...p.privadas.map((s) => ({ ...s, publica: false }))].sort((a, b) => a.az.localeCompare(b.az) || (a.publica === b.publica ? 0 : a.publica ? -1 : 1));
  const tablas = [];
  const conex = [];
  if (p.publicas.length) {
    tablas.push({ id: 'p-rtb-pub', texto: `${p.pre}-rtb-public` });
    conex.push({ id: 'p-igw', texto: `${p.pre}-igw` });
    conexiones.push(['p-rtb-pub', 'p-igw', true]);
  }
  const nats = f.nat === 'none' || !p.publicas.length ? [] : (f.nat === 'peraz' ? p.publicas : p.publicas.slice(0, 1)).map((s, i) => ({ id: `p-nat-${i}`, texto: `${p.pre}-nat-public${i + 1}-${s.az}`, az: s.az }));
  conex.push(...nats);
  for (const s of subredes) {
    conexiones.push([vpcId, s.nombre]);
    if (s.publica) conexiones.push([s.nombre, 'p-rtb-pub']);
  }
  p.privadas.forEach((s, i) => {
    const id = `p-rtb-priv-${i}`;
    tablas.push({ id, texto: `${p.pre}-rtb-private${i + 1}-${s.az}` });
    conexiones.push([s.nombre, id]);
    if (nats.length) conexiones.push([id, (nats.find((x) => x.az === s.az) ?? nats[0]).id, true]);
  });
  return mapa(cx, {
    columnas: [
      { titulo: 'VPC', desc: 'Your AWS virtual network', grupos: [{ cajas: [{ id: vpcId, texto: `${p.pre}-vpc`, sub: f.cidr }] }] },
      {
        titulo: 'Subnets',
        contador: subredes.length,
        desc: 'Subnets within this VPC',
        vacio: 'No subnets',
        grupos: p.azs.map((az) => ({ titulo: az, cajas: subredes.filter((s) => s.az === az).map((s) => ({ id: s.nombre, texto: s.nombre, sub: s.cidr, letra: LETRA(az), publica: s.publica })) }))
      },
      { titulo: 'Route tables', contador: tablas.length + (p.publicas.length || p.privadas.length ? 0 : 1), desc: 'Route network traffic to resources', grupos: [{ cajas: tablas.length ? tablas : [{ id: 'p-rtb-main', texto: 'Main route table' }] }] },
      { titulo: 'Network connections', contador: conex.length, desc: 'Connections to other networks', vacio: 'No network connections', grupos: [{ cajas: conex }] }
    ],
    conexiones
  });
}

function crearVpcPagina(cx) {
  cx.migas([MIGA, { texto: 'Your VPCs', ruta: 'vpc/vpcs' }, { texto: 'Create VPC' }]);
  const f = {
    modo: 'solo',
    nombre: '',
    prefijo: 'project',
    cidr: '10.0.0.0/16',
    tenancy: 'default',
    zonas: 2,
    primeraZona: 0,
    publicas: 2,
    privadas: 2,
    nat: 'none',
    endpoints: 'none',
    dnsNombres: true,
    dnsResolucion: true,
    bloquesPublicos: [],
    bloquesPrivados: [],
    etiquetas: [],
    errores: {}
  };
  const ipsDe = (cidr) => {
    const c = parsearCidr(cidr);
    return c ? `${c.total.toLocaleString('en-US')} IPs` : '';
  };

  const cidrCampo = () =>
    ui.campo({
      etiqueta: f.modo === 'solo' ? 'IPv4 CIDR' : 'IPv4 CIDR block',
      info: 'cidr',
      cx,
      descripcion: f.modo === 'mas' ? 'Determine the starting IP and the size of your VPC using CIDR notation.' : null,
      control: ui.entrada({
        valor: f.cidr,
        sufijo: () => ipsDe(f.cidr),
        alCambiar: (v) => {
          f.cidr = v;
          const suf = form.querySelector('.cx-entrada__sufijo');
          if (suf) suf.textContent = ipsDe(v);
          if (f.modo === 'mas') previa.repintar();
        }
      }),
      error: f.errores.cidr,
      restriccion: 'CIDR block size must be between /16 and /28.'
    });

  const repintar = () => {
    form.repintar();
    previa.repintar();
  };

  const form = ui.region(() => {
    const modo = ui.campo({
      etiqueta: 'Resources to create',
      info: 'vpc-and-more',
      cx,
      descripcion: 'Create only the VPC resource or the VPC and other networking resources.',
      control: ui.tarjetas({
        valor: f.modo,
        opciones: [{ valor: 'solo', etiqueta: 'VPC only' }, { valor: 'mas', etiqueta: 'VPC and more' }],
        alCambiar: (v) => {
          f.modo = v;
          f.errores = {};
          repintar();
          lado.hidden = v !== 'mas';
          ajustar();
        }
      })
    });
    if (f.modo === 'solo') {
      return h(
        'div',
        { class: 'cx-form' },
        modo,
        ui.campo({ etiqueta: 'Name tag', opcional: true, descripcion: 'Creates a tag with a key of \'Name\' and a value that you specify.', control: ui.entrada({ valor: f.nombre, placeholder: 'my-vpc-01', alCambiar: (v) => (f.nombre = v) }) }),
        ui.campo({ etiqueta: 'IPv4 CIDR block', info: 'cidr', cx, control: ui.radios({ valor: 'manual', opciones: [{ valor: 'manual', etiqueta: 'IPv4 CIDR manual input' }, { valor: 'ipam', etiqueta: 'IPAM-allocated IPv4 CIDR block', desactivado: true }] }) }),
        cidrCampo(),
        ui.campo({ etiqueta: 'IPv6 CIDR block', control: ui.radios({ valor: 'no', opciones: [{ valor: 'no', etiqueta: 'No IPv6 CIDR block' }, { valor: 'ipam', etiqueta: 'IPAM-allocated IPv6 CIDR block', desactivado: true }, { valor: 'amazon', etiqueta: 'Amazon-provided IPv6 CIDR block', desactivado: true }] }) }),
        ui.campo({ etiqueta: 'Tenancy', info: 'tenancy', cx, control: ui.selector({ opciones: [{ valor: 'default', etiqueta: 'Default' }, { valor: 'dedicated', etiqueta: 'Dedicated' }], valor: f.tenancy, alCambiar: (v) => (f.tenancy = v) }) })
      );
    }
    const p = planVpc(f);
    const campoBloques = () =>
      ui.expandible({
        titulo: 'Customize subnets CIDR blocks',
        abierto: f.bloquesAbierto ?? false,
        alAlternar: (a) => (f.bloquesAbierto = a),
        contenido: h(
          'div',
          { class: 'cx-form' },
          p.publicas.map((s, i) =>
            ui.campo({
              etiqueta: `Public subnet CIDR block in ${s.az}`,
              control: ui.entrada({ valor: f.bloquesPublicos[i] ?? s.sugerido, sufijo: () => ipsDe(f.bloquesPublicos[i] ?? s.sugerido), alCambiar: (v) => ((f.bloquesPublicos[i] = v), previa.repintar()) })
            })
          ),
          p.privadas.map((s, i) =>
            ui.campo({
              etiqueta: `Private subnet CIDR block in ${s.az}`,
              control: ui.entrada({ valor: f.bloquesPrivados[i] ?? s.sugerido, sufijo: () => ipsDe(f.bloquesPrivados[i] ?? s.sugerido), alCambiar: (v) => ((f.bloquesPrivados[i] = v), previa.repintar()) })
            })
          ),
          !p.publicas.length && !p.privadas.length ? h('p', { class: 'cx-texto-sec' }, 'No subnets to customize.') : null
        )
      });
    const cambiarNum = (prop) => (v) => {
      f[prop] = v;
      f.bloquesPublicos = [];
      f.bloquesPrivados = [];
      if (prop === 'zonas') {
        if (f.publicas) f.publicas = v;
        if (f.privadas) f.privadas = f.privadas > f.zonas * 2 ? v * 2 : f.privadas === 0 ? 0 : f.privadas > v ? v * 2 : v;
        f.primeraZona = Math.min(f.primeraZona, ZONAS.length - v);
      }
      if (prop === 'publicas' && v === 0) f.nat = 'none';
      repintar();
    };
    return h(
      'div',
      { class: 'cx-form' },
      modo,
      ui.campo({
        etiqueta: 'Name tag auto-generation',
        info: 'vpc-and-more',
        cx,
        descripcion: 'Enter a value for the Name tag. This value will be used to auto-generate Name tags for all resources in the VPC.',
        control: h('div', { class: 'cx-form' }, ui.casilla({ etiqueta: 'Auto-generate', marcada: true, desactivado: true }), ui.entrada({ valor: f.prefijo, alCambiar: (v) => ((f.prefijo = v), previa.repintar()) }))
      }),
      cidrCampo(),
      ui.campo({ etiqueta: 'IPv6 CIDR block', control: ui.radios({ valor: 'no', opciones: [{ valor: 'no', etiqueta: 'No IPv6 CIDR block' }, { valor: 'amazon', etiqueta: 'Amazon-provided IPv6 CIDR block', desactivado: true }] }) }),
      ui.campo({ etiqueta: 'Tenancy', info: 'tenancy', cx, control: ui.selector({ opciones: [{ valor: 'default', etiqueta: 'Default' }, { valor: 'dedicated', etiqueta: 'Dedicated' }], valor: f.tenancy, alCambiar: (v) => (f.tenancy = v) }) }),
      ui.campo({
        etiqueta: 'Number of Availability Zones (AZs)',
        info: 'zona',
        cx,
        descripcion: 'Choose the number of AZs in which to provision subnets. We recommend at least two AZs for high availability.',
        control: ui.segmentado({ valor: f.zonas, opciones: [1, 2, 3].map((x) => ({ valor: x, etiqueta: String(x) })), alCambiar: cambiarNum('zonas') })
      }),
      ui.expandible({
        titulo: 'Customize AZs',
        abierto: f.azAbierto ?? false,
        alAlternar: (a) => (f.azAbierto = a),
        contenido: h(
          'div',
          { class: 'cx-form' },
          ui.campo({
            etiqueta: 'First availability zone',
            control: ui.selector({ opciones: ZONAS.slice(0, ZONAS.length - f.zonas + 1).map((z, i) => ({ valor: i, etiqueta: z })), valor: f.primeraZona, alCambiar: (v) => ((f.primeraZona = v), repintar()) })
          }),
          p.azs.slice(1).map((z, i) => ui.campo({ etiqueta: `${['Second', 'Third'][i]} availability zone`, control: ui.entrada({ valor: z, desactivado: true }) }))
        )
      }),
      ui.campo({
        etiqueta: 'Number of public subnets',
        info: 'subred-publica',
        cx,
        descripcion: 'The number of public subnets to add to your VPC. Use public subnets for web applications that need to be publicly accessible over the internet.',
        control: ui.segmentado({ valor: f.publicas, opciones: [0, f.zonas].map((x) => ({ valor: x, etiqueta: String(x) })), alCambiar: cambiarNum('publicas') })
      }),
      ui.campo({
        etiqueta: 'Number of private subnets',
        info: 'subred-publica',
        cx,
        descripcion: 'The number of private subnets to add to your VPC. Use private subnets to secure backend resources that don’t need public access.',
        control: ui.segmentado({ valor: f.privadas, opciones: [0, f.zonas, f.zonas * 2].map((x) => ({ valor: x, etiqueta: String(x) })), alCambiar: cambiarNum('privadas') })
      }),
      campoBloques(),
      ui.campo({
        etiqueta: 'NAT gateways ($)',
        info: 'nat',
        cx,
        descripcion: 'Choose the number of Availability Zones (AZs) in which to create NAT gateways. Note that there is a charge for each NAT gateway.',
        control: ui.segmentado({
          valor: f.nat,
          opciones: [
            { valor: 'none', etiqueta: 'None' },
            { valor: 'una', etiqueta: 'In 1 AZ', desactivado: !f.publicas },
            { valor: 'peraz', etiqueta: '1 per AZ', desactivado: !f.publicas }
          ],
          alCambiar: (v) => ((f.nat = v), repintar())
        })
      }),
      f.nat !== 'none' ? ui.alerta({ tipo: 'aviso', contenido: 'NAT gateways are billed per hour and per GB of data processed, even when nothing uses them. Delete them when you finish your lab.' }) : null,
      ui.campo({
        etiqueta: 'VPC endpoints',
        descripcion: 'Endpoints can help reduce NAT gateway charges and improve security by accessing S3 directly from the VPC.',
        control: ui.segmentado({ valor: 'none', opciones: [{ valor: 'none', etiqueta: 'None' }, { valor: 's3', etiqueta: 'S3 Gateway', desactivado: true, titulo: 'No disponible en este simulador' }] })
      }),
      ui.campo({
        etiqueta: 'DNS options',
        info: 'dns-vpc',
        cx,
        control: h('div', { class: 'cx-form' }, ui.casilla({ etiqueta: 'Enable DNS hostnames', marcada: f.dnsNombres, alCambiar: (v) => (f.dnsNombres = v) }), ui.casilla({ etiqueta: 'Enable DNS resolution', marcada: f.dnsResolucion, alCambiar: (v) => (f.dnsResolucion = v) }))
      })
    );
  });

  const previa = ui.region(() => (f.modo === 'mas' ? ui.contenedor({ titulo: 'Preview', cuerpo: [vistaPrevia(cx, f), leyendaMapa()] }) : null));
  const lado = h('div', { class: 'cx-lado', hidden: true }, previa);
  const rejilla = h(
    'div',
    { class: 'cx-pagina' },
    h('div', { class: 'cx-pagina' }, ui.contenedor({ titulo: 'VPC settings', cuerpo: form }), ui.contenedor({ titulo: 'Tags', descripcion: 'A tag is a label that you assign to an AWS resource.', plegable: true, abierto: false, cuerpo: ui.editorEtiquetas({ filas: f.etiquetas }) })),
    lado
  );
  // La vista previa es ancha: en «VPC and more» va al lado con más espacio.
  rejilla.style.display = 'grid';
  rejilla.style.gridTemplateColumns = 'minmax(0, 1fr)';
  rejilla.style.gap = '20px';
  rejilla.style.alignItems = 'start';
  function ajustar() {
    rejilla.style.gridTemplateColumns = f.modo === 'mas' ? 'minmax(340px, 440px) minmax(0, 1fr)' : 'minmax(0, 1fr)';
  }

  function enviar() {
    f.errores = {};
    if (!f.cidr.trim()) f.errores.cidr = 'IPv4 CIDR is required';
    if (f.errores.cidr) return form.repintar();
    if (f.modo === 'solo') {
      const r = cx.hacer({ servicio: 'VPC', accion: 'CreateVpc', error: 'Failed to create VPC' }, (e) => crearVpc(e, { nombre: f.nombre || ui.nombreDeEtiquetas(f.etiquetas), cidr: f.cidr, tenancy: f.tenancy }));
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: `You successfully created ${r.valor.id} / ${r.valor.nombre || r.valor.id}` });
        cx.ir(`vpc/vpcs/${r.valor.id}`);
      }
      return;
    }
    const p = planVpc(f);
    const r = cx.hacer(
      { servicio: 'VPC', accion: 'CreateVpc (VPC and more)', error: 'Failed to create VPC' },
      (e) => {
        const res = crearVpcCompleta(e, {
          prefijo: f.prefijo,
          cidr: f.cidr,
          zonas: f.zonas,
          publicas: f.publicas,
          privadas: f.privadas,
          nat: f.nat,
          primeraZona: f.primeraZona,
          bloquesPublicos: p.publicas.map((s, i) => (f.bloquesPublicos[i]?.trim() ? f.bloquesPublicos[i].trim() : '')),
          bloquesPrivados: p.privadas.map((s, i) => (f.bloquesPrivados[i]?.trim() ? f.bloquesPrivados[i].trim() : ''))
        });
        if (!f.dnsNombres || !f.dnsResolucion) editarVpc(e, res.vpc.id, { dnsHostnames: f.dnsNombres && f.dnsResolucion, dnsResolution: f.dnsResolucion });
        return res;
      },
      { atomico: true }
    );
    if (r.ok) {
      const res = r.valor;
      cx.memoria.flujoVpc = {
        inicio: Date.now(),
        vpc: res.vpc.id,
        subredes: [...res.publicas, ...res.privadas].map((s) => s.id),
        igw: res.igw?.id ?? null,
        tablas: cx.estado.tablasRutas.filter((t) => t.vpcId === res.vpc.id && !t.principal).map((t) => t.id),
        nats: res.nats.map((x) => x.id),
        eips: res.nats.map((x) => x.eipId)
      };
      cx.ir('vpc/flujo');
    }
  }

  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Create VPC', info: 'vpc', cx, descripcion: 'A VPC is an isolated portion of the AWS Cloud populated by AWS objects, such as Amazon EC2 instances.' }),
    rejilla,
    ui.pieFormulario({ cancelar: () => cx.ir('vpc/vpcs'), textoEnviar: 'Create VPC', enviar, extra: ui.boton('Preview code', { variante: 'texto', desactivado: true }) })
  );
}

/** «Create VPC workflow»: las casillas verdes de cada paso de VPC and more. */
function flujoVpc(cx) {
  cx.migas([MIGA, { texto: 'Your VPCs', ruta: 'vpc/vpcs' }, { texto: 'Create VPC workflow' }]);
  const fl = cx.memoria.flujoVpc;
  if (!fl) return ui.noDisponible('Create VPC workflow', 'No hay ninguna creación de VPC en curso.');
  const pasos = [
    ['Create VPC', fl.vpc],
    ['Enable DNS hostnames'],
    ['Enable DNS resolution'],
    ['Verifying VPC creation', fl.vpc],
    ...fl.subredes.map((id) => ['Create subnet', id]),
    ...(fl.igw ? [['Create internet gateway', fl.igw], ['Attach internet gateway to the VPC']] : []),
    ...fl.tablas.flatMap((id) => [['Create route table', id], ['Associate route table']]),
    ...(fl.igw ? [['Create route']] : []),
    ...fl.eips.map((id) => ['Allocate elastic IP', id]),
    ...fl.nats.map((id) => ['Create NAT gateway', id]),
    ...(fl.nats.length ? [['Wait for NAT Gateways to activate', null, 'nat']] : []),
    ['Verifying route table creation']
  ];
  const lista = cx.vivo(() => {
    const transcurrido = Date.now() - fl.inicio;
    const natsListas = fl.nats.every((id) => ['available', 'failed'].includes(cx.estado.nats.find((x) => x.id === id)?.estado ?? 'available'));
    let hechos = 0;
    for (let i = 0; i < pasos.length; i++) {
      if (pasos[i][2] === 'nat' && !natsListas) break;
      if (transcurrido < (i + 1) * 180) break;
      hechos = i + 1;
    }
    const listo = hechos === pasos.length;
    return h(
      'div',
      { class: 'cx-pagina' },
      listo ? ui.alerta({ tipo: 'exito', titulo: 'Success', contenido: 'VPC was created successfully.' }) : ui.alerta({ tipo: 'info', titulo: 'Creating VPC', contenido: 'This may take a few minutes. Don’t close this page.' }),
      ui.contenedor({
        titulo: 'Details',
        cuerpo: h(
          'ul',
          { class: 'cx-pasos' },
          pasos.map(([texto, id], i) =>
            h('li', {}, i < hechos ? ui.estado('exito', '') : i === hechos ? ui.estado('pendiente', '') : ui.estado('espera', ''), h('span', {}, texto, id ? [': ', i < hechos ? enlaceRecurso(cx, id) : id] : null))
          )
        )
      }),
      h('div', { class: 'cx-pie-form' }, ui.boton('View VPC', { variante: 'primario', escribe: false, desactivado: !listo, alClic: () => cx.ir(`vpc/vpcs/${fl.vpc}`) }))
    );
  });
  return h('div', { class: 'cx-pagina' }, ui.encabezado({ titulo: 'Create VPC workflow', info: 'vpc-and-more', cx }), lista);
}

/* ================================================================ subnets */

const subDe = (cx, id) => cx.estado.subredes.find((s) => s.id === id);

function paresSubred(cx, s) {
  const t = tablaDeSubred(cx.estado, s.id);
  const nacl = naclDeSubred(cx.estado, s.id);
  return ui.pares(
    [
      { etiqueta: 'Subnet ID', valor: ui.copiable(s.id) },
      { etiqueta: 'Subnet ARN', valor: `arn:aws:ec2:us-east-1:${cx.estado.cuenta.id}:subnet/${s.id}` },
      { etiqueta: 'State', valor: ui.estado('exito', 'Available') },
      { etiqueta: 'IPv4 CIDR', info: 'cidr', valor: s.cidr },
      { etiqueta: 'Available IPv4 addresses', valor: String(ipsLibres(cx.estado, s)) },
      { etiqueta: 'IPv6 CIDR', valor: '–' },
      { etiqueta: 'Availability Zone', info: 'zona', valor: s.az },
      { etiqueta: 'Availability Zone ID', valor: ID_ZONA[s.az] },
      { etiqueta: 'VPC', valor: enlaceRecurso(cx, s.vpcId, { conNombre: true }) },
      { etiqueta: 'Route table', info: 'tabla-rutas', valor: t ? enlaceRecurso(cx, t.id, { conNombre: true }) : '–' },
      { etiqueta: 'Network ACL', info: 'nacl', valor: nacl ? enlaceRecurso(cx, nacl.id, { conNombre: true }) : '–' },
      { etiqueta: 'Default subnet', valor: s.porDefecto ? 'Yes' : 'No' },
      { etiqueta: 'Auto-assign public IPv4 address', info: 'ip-publica', valor: s.ipPublicaAuto ? 'Yes' : 'No' },
      { etiqueta: 'Owner', valor: cx.estado.cuenta.id }
    ],
    { columnas: 4, cx }
  );
}

function borrarSubredes(cx, subs, alTerminar) {
  cx.confirmar({
    titulo: 'Delete subnet',
    palabra: 'delete',
    contenido: [h('p', {}, 'Are you sure that you want to delete the following subnets?'), h('ul', {}, subs.map((s) => h('li', {}, idBarraNombre(s))))],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'VPC', accion: 'DeleteSubnet', error: 'Failed to delete subnets' }, (e) => subs.forEach((s) => eliminarSubred(e, s.id)), { atomico: true });
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: `Successfully deleted ${n(subs, 'subnet')}: ${subs.map((s) => s.id).join(', ')}` });
        alTerminar?.();
      }
    }
  });
}

function accionesSubred(cx, sel, alBorrar) {
  const uno = sel.length === 1 ? sel[0] : null;
  return [
    { texto: 'View details', desactivado: !uno, alClic: () => cx.ir(`vpc/subredes/${uno.id}`) },
    { texto: 'Create flow log', desactivado: true },
    { texto: 'Edit subnet settings', escribe: true, desactivado: !uno, alClic: () => cx.ir(`vpc/subredes/${uno.id}/editar`) },
    { texto: 'Edit IPv6 CIDRs', desactivado: true },
    { texto: 'Edit network ACL association', escribe: true, desactivado: !uno, alClic: () => cx.ir(`vpc/subredes/${uno.id}/nacl`) },
    { texto: 'Edit route table association', escribe: true, desactivado: !uno, alClic: () => cx.ir(`vpc/subredes/${uno.id}/tabla`) },
    { texto: 'Edit CIDR reservations', desactivado: true },
    { texto: 'Share subnet', desactivado: true },
    { texto: 'Manage tags', escribe: true, desactivado: !uno, alClic: () => cx.ir(`vpc/etiquetas/${uno.id}`) },
    '-',
    { texto: 'Delete subnet', escribe: true, desactivado: !sel.length, alClic: () => borrarSubredes(cx, sel, alBorrar) }
  ];
}

function tablaRutasSoloLectura(cx, tabla, { titulo = 'Routes', acciones } = {}) {
  return ui.tabla(cx, {
    titulo,
    variante: 'contenedor',
    refrescar: false,
    filas: () => cx.estado.tablasRutas.find((t) => t.id === tabla.id)?.rutas ?? [],
    clave: (r) => `${r.destino}`,
    filtro: 'Filter routes',
    columnas: [
      { titulo: 'Destination', valor: (r) => r.destino },
      { titulo: 'Target', valor: (r) => (r.objetivo === 'local' ? 'local' : enlaceRecurso(cx, r.objetivo)) },
      { titulo: 'Status', valor: (r) => (rutaActiva(cx, tabla, r) ? ui.estado('exito', 'Active') : ui.estado('error', 'Blackhole')) },
      { titulo: 'Propagated', valor: () => 'No' },
      { titulo: 'Route Origin', valor: (r) => (r.objetivo === 'local' ? 'Create Route Table' : 'Create Route') }
    ],
    acciones: () => acciones ?? []
  });
}

/** ¿El objetivo de la ruta existe y sirve? Si no, la consola la marca como «Blackhole». */
function rutaActiva(cx, tabla, r) {
  if (r.objetivo === 'local') return true;
  if (r.objetivo.startsWith('igw-')) return cx.estado.igws.some((g) => g.id === r.objetivo && g.vpcId === tabla.vpcId);
  if (r.objetivo.startsWith('nat-')) return cx.estado.nats.some((x) => x.id === r.objetivo && (x.estado === 'available' || x.estado === 'pending'));
  return false;
}

function tablaReglasNacl(cx, nacl, sentido, { acciones } = {}) {
  const palabra = sentido === 'entrada' ? 'Source' : 'Destination';
  return ui.tabla(cx, {
    titulo: sentido === 'entrada' ? 'Inbound rules' : 'Outbound rules',
    info: 'nacl-reglas',
    variante: 'contenedor',
    refrescar: false,
    filas: () => [...(cx.estado.nacls.find((x) => x.id === nacl.id)?.[sentido] ?? []), { numero: '*', protocolo: '-1', desde: null, hasta: null, cidr: '0.0.0.0/0', accion: 'deny' }],
    clave: (r) => String(r.numero),
    filtro: `Filter ${sentido === 'entrada' ? 'inbound' : 'outbound'} rules`,
    columnas: [
      { titulo: 'Rule number', valor: (r) => String(r.numero) },
      { titulo: 'Type', valor: (r) => tipoDeRegla(r) },
      { titulo: 'Protocol', valor: (r) => textoProtocolo(r.protocolo) },
      { titulo: 'Port range', valor: (r) => textoPuertos(r) },
      { titulo: palabra, valor: (r) => r.cidr },
      { titulo: 'Allow/Deny', valor: (r) => (r.accion === 'allow' ? ui.estado('exito', 'Allow') : ui.estado('error', 'Deny')) }
    ],
    acciones: () => acciones ?? []
  });
}

function pestanasSubred(cx, s, st) {
  const t = tablaDeSubred(cx.estado, s.id);
  const nacl = naclDeSubred(cx.estado, s.id);
  return ui.pestanas({
    activa: st.pestana,
    alCambiar: (p) => (st.pestana = p),
    pestanas: [
      { id: 'detalles', texto: 'Details', contenido: () => ui.contenedor({ titulo: 'Details', cuerpo: paresSubred(cx, s) }) },
      { id: 'flujo', texto: 'Flow logs', desactivada: true, contenido: () => null },
      {
        id: 'tabla',
        texto: 'Route table',
        contenido: () => [
          ui.contenedor({
            titulo: `Route table: ${t ? idBarraNombre(t) : '–'}`,
            info: 'tabla-rutas',
            cx,
            acciones: ui.boton('Edit route table association', { escribe: true, alClic: () => cx.ir(`vpc/subredes/${s.id}/tabla`) }),
            cuerpo: t ? h('p', { class: 'cx-texto-sec' }, t.asociaciones.includes(s.id) ? 'This subnet is explicitly associated with this route table.' : 'This subnet uses the main route table of its VPC (no explicit association).') : null
          }),
          t ? tablaRutasSoloLectura(cx, t) : null
        ]
      },
      {
        id: 'nacl',
        texto: 'Network ACL',
        contenido: () => [
          ui.contenedor({ titulo: `Network ACL: ${nacl ? idBarraNombre(nacl) : '–'}`, info: 'nacl', cx, acciones: ui.boton('Edit network ACL association', { escribe: true, alClic: () => cx.ir(`vpc/subredes/${s.id}/nacl`) }), cuerpo: null }),
          nacl ? tablaReglasNacl(cx, nacl, 'entrada') : null,
          nacl ? tablaReglasNacl(cx, nacl, 'salida') : null
        ]
      },
      { id: 'etiquetas', texto: 'Tags', contenido: () => pestanaEtiquetas(cx, s) }
    ]
  });
}

function listaSubredes(cx) {
  cx.migas([MIGA, { texto: 'Subnets' }]);
  const st = { pestana: 'detalles' };
  const t = ui.tabla(cx, {
    titulo: 'Subnets',
    info: 'subred',
    filas: () => cx.estado.subredes,
    clave: (s) => s.id,
    seleccion: 'multiple',
    filtro: 'Find resources by attribute or tag',
    ultimaActualizacion: true,
    columnas: [
      { titulo: 'Name', valor: (s) => nombre(s), editable: true },
      { titulo: 'Subnet ID', valor: (s) => ui.enlace(s.id, `vpc/subredes/${s.id}`, { cx }) },
      { titulo: 'State', valor: () => ui.estado('exito', 'Available') },
      { titulo: 'VPC', valor: (s) => enlaceRecurso(cx, s.vpcId, { conNombre: true }) },
      { titulo: 'Block Public Access', valor: () => ui.estado('detenido', 'Off') },
      { titulo: 'IPv4 CIDR', valor: (s) => s.cidr },
      { titulo: 'IPv6 CIDR', valor: () => '–' },
      { titulo: 'Available IPv4 addresses', valor: (s) => String(ipsLibres(cx.estado, s)) },
      { titulo: 'Availability Zone', valor: (s) => s.az },
      { titulo: 'Availability Zone ID', valor: (s) => ID_ZONA[s.az] },
      { titulo: 'Route table', valor: (s) => enlaceRecurso(cx, tablaDeSubred(cx.estado, s.id)?.id, { conNombre: true }) },
      { titulo: 'Network ACL', valor: (s) => enlaceRecurso(cx, naclDeSubred(cx.estado, s.id)?.id) },
      { titulo: 'Default subnet', valor: (s) => (s.porDefecto ? 'Yes' : 'No') },
      { titulo: 'Auto-assign public IPv4 address', valor: (s) => (s.ipPublicaAuto ? 'Yes' : 'No') },
      { titulo: 'Owner ID', valor: () => cx.estado.cuenta.id }
    ],
    acciones: (sel) => [ui.menuBoton('Actions', () => accionesSubred(cx, sel, () => t.seleccionar([]))), ui.boton('Create subnet', { variante: 'primario', alClic: () => cx.ir('vpc/subredes/crear') })],
    vacio: { titulo: 'No subnets found', accion: ui.boton('Create subnet', { escribe: true, alClic: () => cx.ir('vpc/subredes/crear') }) },
    alSeleccionar: () => panel.repintar()
  });
  const panel = cx.vivo(() => {
    const sel = t.seleccion();
    if (sel.length !== 1) return panelVacio(sel.length ? `${sel.length} subnets selected` : 'Select a subnet');
    return ui.panelInferior({ titulo: `${sel[0].id} / ${sel[0].nombre || sel[0].id}`, contenido: pestanasSubred(cx, sel[0], st) });
  });
  return h('div', { class: 'cx-pagina' }, t, panel);
}

function detalleSubred(cx, { id }) {
  cx.migas([MIGA, { texto: 'Subnets', ruta: 'vpc/subredes' }, { texto: id }]);
  if (!subDe(cx, id)) return noExiste(cx, 'Subnet', id, 'vpc/subredes');
  const st = { pestana: 'detalles' };
  return cx.vivo(() => {
    const s = subDe(cx, id);
    if (!s) return noExiste(cx, 'Subnet', id, 'vpc/subredes');
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({ titulo: `${s.id} / ${s.nombre || s.id}`, acciones: ui.menuBoton('Actions', () => accionesSubred(cx, [s], () => cx.ir('vpc/subredes'))) }),
      pestanasSubred(cx, s, st)
    );
  });
}

function crearSubredPagina(cx) {
  cx.migas([MIGA, { texto: 'Subnets', ruta: 'vpc/subredes' }, { texto: 'Create subnet' }]);
  const nueva = () => ({ nombre: '', az: '', cidr: '', etiquetas: [] });
  const f = { vpcId: null, subredes: [nueva()], error: null };
  const ipsDe = (cidr) => {
    const c = parsearCidr(cidr);
    return c ? `${c.total.toLocaleString('en-US')} IPs` : '';
  };
  const form = ui.region(() => {
    const vpc = vpcDe(cx, f.vpcId);
    return [
      ui.contenedor({
        titulo: 'VPC',
        cuerpo: h(
          'div',
          { class: 'cx-form', style: { maxWidth: '760px' } },
          ui.campo({
            etiqueta: 'VPC ID',
            info: 'vpc',
            cx,
            descripcion: 'Create subnets in this VPC.',
            control: ui.selector({ opciones: opcionesVpc(cx.estado), valor: f.vpcId, filtrar: true, placeholder: 'Select a VPC', alCambiar: (v) => ((f.vpcId = v), (f.error = null), form.repintar()) }),
            error: f.error
          }),
          vpc ? h('div', {}, h('b', {}, 'Associated VPC CIDRs'), ui.pares([{ etiqueta: 'IPv4 CIDRs', valor: vpc.cidr }], { columnas: 1 })) : null
        )
      }),
      vpc
        ? ui.contenedor({
            titulo: 'Subnet settings',
            info: 'subred',
            cx,
            descripcion: 'Specify the CIDR blocks and Availability Zone for the subnet.',
            cuerpo: h(
              'div',
              { class: 'cx-form', style: { maxWidth: '760px' } },
              f.subredes.map((s, i) =>
                h(
                  'div',
                  { class: 'cx-bloque' },
                  h('div', { class: 'cx-bloque__titulo' }, `Subnet ${i + 1} of ${f.subredes.length}`),
                  h(
                    'div',
                    { class: 'cx-form' },
                    ui.campo({ etiqueta: 'Subnet name', descripcion: 'Create a tag with a key of \'Name\' and a value that you specify.', control: ui.entrada({ valor: s.nombre, placeholder: 'my-subnet-01', alCambiar: (v) => (s.nombre = v) }), restriccion: 'The name can be up to 256 characters long.' }),
                    ui.campo({
                      etiqueta: 'Availability Zone',
                      info: 'zona',
                      cx,
                      descripcion: 'Choose the zone in which your subnet will reside, or let Amazon choose one for you.',
                      control: ui.selector({ opciones: [{ valor: '', etiqueta: 'No preference' }, ...ZONAS.map((z) => ({ valor: z, etiqueta: `United States (N. Virginia) / ${ID_ZONA[z]} (${z})` }))], valor: s.az, alCambiar: (v) => (s.az = v) })
                    }),
                    ui.campo({ etiqueta: 'IPv4 VPC CIDR block', info: 'cidr', cx, descripcion: 'Choose the VPC’s IPv4 CIDR block for the subnet. The subnet’s IPv4 CIDR must lie within this block.', control: ui.selector({ opciones: [{ valor: vpc.cidr, etiqueta: vpc.cidr }], valor: vpc.cidr }) }),
                    ui.campo({
                      etiqueta: 'IPv4 subnet CIDR block',
                      info: 'cidr',
                      cx,
                      control: ui.entrada({
                        valor: s.cidr,
                        placeholder: vpc.cidr.replace(/\/\d+$/, '/24'),
                        sufijo: () => ipsDe(s.cidr),
                        alCambiar: (v, ev) => {
                          s.cidr = v;
                          const suf = ev.target.parentElement.querySelector('.cx-entrada__sufijo');
                          if (suf) suf.textContent = ipsDe(v);
                        }
                      })
                    }),
                    ui.expandible({ titulo: 'Tags - optional', contenido: ui.editorEtiquetas({ filas: s.etiquetas }) }),
                    f.subredes.length > 1 ? h('div', {}, ui.boton('Remove', { alClic: () => (f.subredes.splice(i, 1), form.repintar()) })) : null
                  )
                )
              ),
              h('div', {}, ui.boton('Add new subnet', { alClic: () => (f.subredes.push(nueva()), form.repintar()) }))
            )
          })
        : null
    ];
  });
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Create subnet', info: 'subred', cx }),
    form,
    ui.pieFormulario({
      cancelar: () => cx.ir('vpc/subredes'),
      textoEnviar: 'Create subnet',
      enviar: () => {
        if (!f.vpcId) {
          f.error = 'VPC ID is required';
          return form.repintar();
        }
        const r = cx.hacer(
          { servicio: 'VPC', accion: 'CreateSubnet', error: 'Failed to create subnet' },
          (e) => f.subredes.map((s) => crearSubred(e, { vpcId: f.vpcId, nombre: s.nombre || ui.nombreDeEtiquetas(s.etiquetas), az: s.az || undefined, cidr: s.cidr })),
          { atomico: true }
        );
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: `You have successfully created ${n(r.valor, 'subnet')}: ${r.valor.map((s) => s.id).join(', ')}` });
          cx.ir('vpc/subredes');
        }
      }
    })
  );
}

function editarSubredPagina(cx, { id }) {
  cx.migas([MIGA, { texto: 'Subnets', ruta: 'vpc/subredes' }, { texto: id, ruta: `vpc/subredes/${id}` }, { texto: 'Edit subnet settings' }]);
  const s = subDe(cx, id);
  if (!s) return noExiste(cx, 'Subnet', id, 'vpc/subredes');
  const f = { auto: s.ipPublicaAuto };
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Edit subnet settings', info: 'ip-publica', cx }),
    ui.contenedor({ titulo: 'Subnet', cuerpo: ui.pares([{ etiqueta: 'Subnet ID', valor: s.id }, { etiqueta: 'Name', valor: s.nombre || '–' }], { columnas: 2 }) }),
    ui.contenedor({
      titulo: 'Auto-assign IP settings',
      info: 'ip-publica',
      cx,
      descripcion: 'Enable the auto-assign IP settings to automatically request a public IPv4 or IPv6 address for a new network interface in this subnet.',
      cuerpo: h('div', { class: 'cx-form' }, ui.casilla({ etiqueta: 'Enable auto-assign public IPv4 address', marcada: f.auto, alCambiar: (v) => (f.auto = v) }), ui.casilla({ etiqueta: 'Enable auto-assign customer-owned IPv4 address', desactivado: true }), ui.casilla({ etiqueta: 'Enable auto-assign IPv6 address', desactivado: true }))
    }),
    ui.contenedor({ titulo: 'Resource-based name (RBN) settings', cuerpo: ui.campo({ etiqueta: 'Hostname type', control: ui.radios({ valor: 'ip', opciones: [{ valor: 'ip', etiqueta: 'IP name' }, { valor: 'rbn', etiqueta: 'Resource name', desactivado: true }] }) }) }),
    ui.pieFormulario({
      cancelar: () => cx.ir(`vpc/subredes/${id}`),
      textoEnviar: 'Save',
      enviar: () => {
        const r = cx.hacer({ servicio: 'VPC', accion: 'ModifySubnetAttribute', error: 'Failed to modify subnet settings' }, (e) => editarSubred(e, id, { ipPublicaAuto: f.auto }));
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: `You have successfully changed subnet settings: Enable auto-assign public IPv4 address for ${id}` });
          cx.ir(`vpc/subredes/${id}`);
        }
      }
    })
  );
}

function asociarTablaSubred(cx, { id }) {
  cx.migas([MIGA, { texto: 'Subnets', ruta: 'vpc/subredes' }, { texto: id, ruta: `vpc/subredes/${id}` }, { texto: 'Edit route table association' }]);
  const s = subDe(cx, id);
  if (!s) return noExiste(cx, 'Subnet', id, 'vpc/subredes');
  const f = { tabla: tablaDeSubred(cx.estado, id)?.id ?? null };
  const rutas = ui.region(() => {
    const t = cx.estado.tablasRutas.find((x) => x.id === f.tabla);
    return t ? tablaRutasSoloLectura(cx, t) : null;
  });
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Edit route table association', info: 'tabla-rutas', cx }),
    ui.contenedor({
      titulo: 'Subnet route table settings',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.pares([{ etiqueta: 'Subnet ID', valor: id }], { columnas: 1 }),
        ui.campo({
          etiqueta: 'Route table ID',
          control: ui.selector({
            opciones: cx.estado.tablasRutas.filter((t) => t.vpcId === s.vpcId).map((t) => ({ valor: t.id, etiqueta: idBarraNombre(t), descripcion: t.principal ? 'Main route table' : undefined })),
            valor: f.tabla,
            filtrar: true,
            alCambiar: (v) => ((f.tabla = v), rutas.repintar())
          })
        })
      )
    }),
    rutas,
    ui.pieFormulario({
      cancelar: () => cx.ir(`vpc/subredes/${id}`),
      textoEnviar: 'Save',
      enviar: () => {
        const r = cx.hacer({ servicio: 'VPC', accion: 'AssociateRouteTable', error: 'Failed to change route table association' }, (e) => {
          const t = e.tablasRutas.find((x) => x.id === f.tabla);
          return asociarSubredes(e, f.tabla, [...new Set([...(t?.asociaciones ?? []), id])]);
        });
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: `You have successfully changed subnet route table association for ${id}.` });
          cx.ir(`vpc/subredes/${id}`);
        }
      }
    })
  );
}

function asociarNaclSubred(cx, { id }) {
  cx.migas([MIGA, { texto: 'Subnets', ruta: 'vpc/subredes' }, { texto: id, ruta: `vpc/subredes/${id}` }, { texto: 'Edit network ACL association' }]);
  const s = subDe(cx, id);
  if (!s) return noExiste(cx, 'Subnet', id, 'vpc/subredes');
  const f = { nacl: naclDeSubred(cx.estado, id)?.id ?? null };
  const reglas = ui.region(() => {
    const x = cx.estado.nacls.find((y) => y.id === f.nacl);
    return x ? [tablaReglasNacl(cx, x, 'entrada'), h('div', { style: { height: '16px' } }), tablaReglasNacl(cx, x, 'salida')] : null;
  });
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Edit network ACL association', info: 'nacl', cx }),
    ui.contenedor({
      titulo: 'Subnet network ACL settings',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.pares([{ etiqueta: 'Subnet ID', valor: id }], { columnas: 1 }),
        ui.campo({
          etiqueta: 'Network ACL ID',
          control: ui.selector({ opciones: cx.estado.nacls.filter((x) => x.vpcId === s.vpcId).map((x) => ({ valor: x.id, etiqueta: idBarraNombre(x), descripcion: x.porDefecto ? 'Default' : undefined })), valor: f.nacl, alCambiar: (v) => ((f.nacl = v), reglas.repintar()) })
        })
      )
    }),
    reglas,
    ui.pieFormulario({
      cancelar: () => cx.ir(`vpc/subredes/${id}`),
      textoEnviar: 'Save',
      enviar: () => {
        const r = cx.hacer({ servicio: 'VPC', accion: 'ReplaceNetworkAclAssociation', error: 'Failed to change network ACL association' }, (e) => {
          const x = e.nacls.find((y) => y.id === f.nacl);
          return asociarNacl(e, f.nacl, [...new Set([...(x?.subredes ?? []), id])]);
        });
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: `You have successfully changed the network ACL association for ${id}.` });
          cx.ir(`vpc/subredes/${id}`);
        }
      }
    })
  );
}

/* =========================================================== route tables */

const tablaDe = (cx, id) => cx.estado.tablasRutas.find((t) => t.id === id);

function accionesTabla(cx, sel, alBorrar) {
  const uno = sel.length === 1 ? sel[0] : null;
  return [
    { texto: 'View details', desactivado: !uno, alClic: () => cx.ir(`vpc/tablas/${uno.id}`) },
    {
      texto: 'Set main route table',
      escribe: true,
      desactivado: !uno || uno.principal,
      alClic: () =>
        cx.confirmar({
          titulo: 'Set main route table',
          textoBoton: 'OK',
          contenido: h('p', {}, `Are you sure you want to make ${uno.id} the main route table for ${uno.vpcId}? Every subnet without an explicit association will use it.`),
          aceptar: () => {
            const r = cx.hacer({ servicio: 'VPC', accion: 'ReplaceRouteTableAssociation (main)', error: 'Failed to set main route table' }, (e) => hacerPrincipal(e, uno.id));
            if (r.ok) cx.flash({ tipo: 'exito', texto: `${uno.id} is now the main route table of ${uno.vpcId}.` });
          }
        })
    },
    { texto: 'Edit subnet associations', escribe: true, desactivado: !uno, alClic: () => cx.ir(`vpc/tablas/${uno.id}/asociaciones`) },
    { texto: 'Edit edge associations', desactivado: true },
    { texto: 'Edit route propagation', desactivado: true },
    { texto: 'Edit routes', escribe: true, desactivado: !uno, alClic: () => cx.ir(`vpc/tablas/${uno.id}/rutas`) },
    { texto: 'Manage tags', escribe: true, desactivado: !uno, alClic: () => cx.ir(`vpc/etiquetas/${uno.id}`) },
    '-',
    {
      texto: 'Delete route table',
      escribe: true,
      desactivado: !uno,
      alClic: () =>
        cx.confirmar({
          titulo: `Delete route table ${uno.id}`,
          palabra: 'delete',
          contenido: h('p', {}, `Are you sure you want to delete route table ${idBarraNombre(uno)}?`),
          aceptar: () => {
            const r = cx.hacer({ servicio: 'VPC', accion: 'DeleteRouteTable', error: 'Failed to delete route table' }, (e) => eliminarTablaRutas(e, uno.id));
            if (r.ok) {
              cx.flash({ tipo: 'exito', texto: `Successfully deleted route table ${uno.id}` });
              alBorrar?.();
            }
          }
        })
    }
  ];
}

function pestanasTabla(cx, t, st) {
  const sinExplicita = cx.estado.subredes.filter((s) => s.vpcId === t.vpcId && !cx.estado.tablasRutas.some((x) => x.asociaciones.includes(s.id)));
  const filaSub = (s) => h('tr', {}, h('td', { style: { paddingLeft: '20px' } }, nombre(s)), h('td', {}, enlaceRecurso(cx, s.id)), h('td', {}, s.cidr), h('td', {}, '–'));
  const tablaSubs = (lista) =>
    lista.length
      ? h('table', { class: 'cx-tabla__tabla' }, h('thead', {}, h('tr', {}, ['Name', 'Subnet ID', 'IPv4 CIDR', 'IPv6 CIDR'].map((x) => h('th', {}, h('span', { class: 'cx-tabla__orden' }, x))))), h('tbody', {}, lista.map(filaSub)))
      : h('div', { class: 'cx-tabla__vacia' }, h('b', {}, 'No subnet associations'), h('div', {}, 'You do not have any subnet associations.'));
  const explicitas = t.asociaciones.map((id) => subDe(cx, id)).filter(Boolean);
  return ui.pestanas({
    activa: st.pestana,
    alCambiar: (p) => (st.pestana = p),
    pestanas: [
      {
        id: 'detalles',
        texto: 'Details',
        contenido: () =>
          ui.contenedor({
            titulo: 'Details',
            cuerpo: ui.pares(
              [
                { etiqueta: 'Route table ID', valor: ui.copiable(t.id) },
                { etiqueta: 'Main', valor: t.principal ? 'Yes' : 'No' },
                { etiqueta: 'Explicit subnet associations', valor: explicitas.length ? h('div', {}, explicitas.map((s) => h('div', {}, enlaceRecurso(cx, s.id, { conNombre: true })))) : '–' },
                { etiqueta: 'Edge associations', valor: '–' },
                { etiqueta: 'VPC', valor: enlaceRecurso(cx, t.vpcId, { conNombre: true }) },
                { etiqueta: 'Owner ID', valor: cx.estado.cuenta.id }
              ],
              { columnas: 3 }
            )
          })
      },
      { id: 'rutas', texto: 'Routes', contenido: () => tablaRutasSoloLectura(cx, t, { titulo: 'Routes', acciones: [ui.boton('Edit routes', { escribe: true, alClic: () => cx.ir(`vpc/tablas/${t.id}/rutas`) })] }) },
      {
        id: 'asociaciones',
        texto: 'Subnet associations',
        contenido: () => [
          ui.contenedor({ titulo: 'Explicit subnet associations', contador: explicitas.length, info: 'asociacion-subred', cx, sinRelleno: true, acciones: ui.boton('Edit subnet associations', { escribe: true, alClic: () => cx.ir(`vpc/tablas/${t.id}/asociaciones`) }), cuerpo: tablaSubs(explicitas) }),
          ui.contenedor({
            titulo: 'Subnets without explicit associations',
            contador: sinExplicita.length,
            descripcion: 'The following subnets have not been explicitly associated with any route tables and are therefore associated with the main route table:',
            sinRelleno: true,
            cuerpo: tablaSubs(sinExplicita)
          })
        ]
      },
      { id: 'borde', texto: 'Edge associations', desactivada: true, contenido: () => null },
      { id: 'propagacion', texto: 'Route propagation', desactivada: true, contenido: () => null },
      { id: 'etiquetas', texto: 'Tags', contenido: () => pestanaEtiquetas(cx, t) }
    ]
  });
}

function listaTablas(cx) {
  cx.migas([MIGA, { texto: 'Route tables' }]);
  const st = { pestana: 'rutas' };
  const t = ui.tabla(cx, {
    titulo: 'Route tables',
    info: 'tabla-rutas',
    filas: () => cx.estado.tablasRutas,
    clave: (x) => x.id,
    seleccion: 'multiple',
    filtro: 'Find resources by attribute or tag',
    ultimaActualizacion: true,
    columnas: [
      { titulo: 'Name', valor: (x) => nombre(x), editable: true },
      { titulo: 'Route table ID', valor: (x) => ui.enlace(x.id, `vpc/tablas/${x.id}`, { cx }) },
      { titulo: 'Explicit subnet associations', valor: (x) => (x.asociaciones.length === 1 ? enlaceRecurso(cx, x.asociaciones[0]) : x.asociaciones.length ? `${x.asociaciones.length} subnets` : '–') },
      { titulo: 'Edge associations', valor: () => '–' },
      { titulo: 'Main', valor: (x) => (x.principal ? 'Yes' : 'No') },
      { titulo: 'VPC', valor: (x) => enlaceRecurso(cx, x.vpcId, { conNombre: true }) },
      { titulo: 'Owner ID', valor: () => cx.estado.cuenta.id }
    ],
    acciones: (sel) => [ui.menuBoton('Actions', () => accionesTabla(cx, sel, () => t.seleccionar([]))), ui.boton('Create route table', { variante: 'primario', alClic: () => cx.ir('vpc/tablas/crear') })],
    alSeleccionar: () => panel.repintar()
  });
  const panel = cx.vivo(() => {
    const sel = t.seleccion();
    if (sel.length !== 1) return panelVacio('Select a route table');
    return ui.panelInferior({ titulo: `${sel[0].id} / ${sel[0].nombre || sel[0].id}`, contenido: pestanasTabla(cx, sel[0], st) });
  });
  return h('div', { class: 'cx-pagina' }, t, panel);
}

function detalleTabla(cx, { id }) {
  cx.migas([MIGA, { texto: 'Route tables', ruta: 'vpc/tablas' }, { texto: id }]);
  if (!tablaDe(cx, id)) return noExiste(cx, 'Route table', id, 'vpc/tablas');
  const st = { pestana: 'rutas' };
  return cx.vivo(() => {
    const t = tablaDe(cx, id);
    if (!t) return noExiste(cx, 'Route table', id, 'vpc/tablas');
    return h('div', { class: 'cx-pagina' }, ui.encabezado({ titulo: `${t.id} / ${t.nombre || t.id}`, acciones: ui.menuBoton('Actions', () => accionesTabla(cx, [t], () => cx.ir('vpc/tablas'))) }), pestanasTabla(cx, t, st));
  });
}

function crearTablaPagina(cx) {
  cx.migas([MIGA, { texto: 'Route tables', ruta: 'vpc/tablas' }, { texto: 'Create route table' }]);
  const f = { nombre: '', vpcId: null, etiquetas: [], error: null };
  const form = ui.region(() =>
    h(
      'div',
      { class: 'cx-form', style: { maxWidth: '640px' } },
      ui.campo({ etiqueta: 'Name', opcional: true, descripcion: 'Create a tag with a key of \'Name\' and a value that you specify.', control: ui.entrada({ valor: f.nombre, placeholder: 'my-route-table-01', alCambiar: (v) => (f.nombre = v) }) }),
      ui.campo({ etiqueta: 'VPC', info: 'vpc', cx, descripcion: 'The VPC to use for this route table.', control: ui.selector({ opciones: opcionesVpc(cx.estado), valor: f.vpcId, filtrar: true, placeholder: 'Select a VPC', alCambiar: (v) => (f.vpcId = v) }), error: f.error })
    )
  );
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Create route table', info: 'tabla-rutas', cx, descripcion: 'A route table specifies how packets are forwarded between the subnets within your VPC, the internet, and your VPN connection.' }),
    ui.contenedor({ titulo: 'Route table settings', cuerpo: form }),
    ui.contenedor({ titulo: 'Tags', cuerpo: ui.editorEtiquetas({ filas: f.etiquetas }) }),
    ui.pieFormulario({
      cancelar: () => cx.ir('vpc/tablas'),
      textoEnviar: 'Create route table',
      enviar: () => {
        if (!f.vpcId) {
          f.error = 'VPC is required';
          return form.repintar();
        }
        const r = cx.hacer({ servicio: 'VPC', accion: 'CreateRouteTable', error: 'Failed to create route table' }, (e) => crearTablaRutas(e, { vpcId: f.vpcId, nombre: f.nombre || ui.nombreDeEtiquetas(f.etiquetas) }));
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: `Route table ${r.valor.id} | ${r.valor.nombre || r.valor.id} was created successfully.` });
          cx.ir(`vpc/tablas/${r.valor.id}`);
        }
      }
    })
  );
}

const TIPOS_OBJETIVO = [
  ['carrier', 'Carrier Gateway'],
  ['core', 'Core Network'],
  ['eigw', 'Egress Only Internet Gateway'],
  ['gwlb', 'Gateway Load Balancer Endpoint'],
  ['instance', 'Instance'],
  ['igw', 'Internet Gateway'],
  ['local', 'local'],
  ['nat', 'NAT Gateway'],
  ['eni', 'Network Interface'],
  ['outpost', 'Outpost Local Gateway'],
  ['pcx', 'Peering Connection'],
  ['tgw', 'Transit Gateway'],
  ['vgw', 'Virtual Private Gateway']
];

function editarRutasPagina(cx, { id }) {
  cx.migas([MIGA, { texto: 'Route tables', ruta: 'vpc/tablas' }, { texto: id, ruta: `vpc/tablas/${id}` }, { texto: 'Edit routes' }]);
  const t = tablaDe(cx, id);
  if (!t) return noExiste(cx, 'Route table', id, 'vpc/tablas');
  const local = t.rutas.find((r) => r.objetivo === 'local');
  const filas = t.rutas.filter((r) => r.objetivo !== 'local').map((r) => ({ destino: r.destino, tipo: r.objetivo.startsWith('nat-') ? 'nat' : 'igw', objetivo: r.objetivo }));
  const editor = ui.region(() => {
    const cols = 'minmax(170px,1fr) minmax(220px,1.3fr) 110px 90px 140px auto';
    const cab = ['Destination', 'Target', 'Status', 'Propagated', 'Route Origin', ''].map((x) => h('div', { class: 'cx-reglas__cabeza' }, x));
    const fijo = [
      h('div', { class: 'cx-reglas__celda-fija' }, local?.destino),
      h('div', {}, ui.selector({ opciones: [{ valor: 'local', etiqueta: 'local' }], valor: 'local', desactivado: true })),
      h('div', { class: 'cx-reglas__celda-fija' }, ui.estado('exito', 'Active')),
      h('div', { class: 'cx-reglas__celda-fija' }, 'No'),
      h('div', { class: 'cx-reglas__celda-fija' }, 'CreateRouteTable'),
      h('div'),
      h('div', { class: 'cx-reglas__sep' })
    ];
    const recursos = (tipo) =>
      tipo === 'igw'
        ? cx.estado.igws.map((g) => ({ valor: g.id, etiqueta: g.id, descripcion: [g.nombre, g.vpcId ? `attached to ${g.vpcId}` : 'detached'].filter(Boolean).join(' · ') }))
        : tipo === 'nat'
          ? cx.estado.nats.filter((x) => x.estado !== 'deleted').map((x) => ({ valor: x.id, etiqueta: x.id, descripcion: [x.nombre, x.vpcId, x.estado].filter(Boolean).join(' · ') }))
          : [];
    const filasEl = filas.map((fl, i) => [
      ui.entrada({ valor: fl.destino, buscar: true, placeholder: '0.0.0.0/0', etiquetaAccesible: 'Destination', alCambiar: (v) => (fl.destino = v) }),
      h(
        'div',
        { class: 'cx-form', style: { gap: '6px' } },
        ui.selector({
          opciones: TIPOS_OBJETIVO.map(([v, et]) => ({ valor: v, etiqueta: et, desactivado: !['igw', 'nat'].includes(v), })),
          valor: fl.tipo || null,
          placeholder: 'Select',
          etiquetaAccesible: 'Target',
          alCambiar: (v) => ((fl.tipo = v), (fl.objetivo = ''), editor.repintar())
        }),
        fl.tipo
          ? ui.selector({ opciones: recursos(fl.tipo), valor: fl.objetivo || null, filtrar: true, placeholder: fl.tipo === 'igw' ? 'igw-' : 'nat-', vacio: 'No resources of this type', etiquetaAccesible: 'Target resource', alCambiar: (v) => (fl.objetivo = v) })
          : null
      ),
      h('div', { class: 'cx-reglas__celda-fija' }, '–'),
      h('div', { class: 'cx-reglas__celda-fija' }, 'No'),
      h('div', { class: 'cx-reglas__celda-fija' }, 'CreateRoute'),
      ui.boton('Remove', { alClic: () => (filas.splice(i, 1), editor.repintar()) }),
      h('div', { class: 'cx-reglas__sep' })
    ]);
    return [h('div', { class: 'cx-reglas', style: { gridTemplateColumns: cols } }, cab, fijo, filasEl), h('div', { style: { marginTop: '12px' } }, ui.boton('Add route', { alClic: () => (filas.push({ destino: '', tipo: '', objetivo: '' }), editor.repintar()) }))];
  });
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: `Edit routes: ${id}`, info: 'tabla-rutas', cx }),
    ui.contenedor({ cuerpo: editor }),
    ui.pieFormulario({
      cancelar: () => cx.ir(`vpc/tablas/${id}`),
      extra: ui.boton('Preview', { desactivado: true }),
      textoEnviar: 'Save changes',
      enviar: () => {
        const r = cx.hacer({ servicio: 'VPC', accion: 'ReplaceRoutes', error: 'Failed to edit routes' }, (e) => editarRutas(e, id, filas.map((fl) => ({ destino: fl.destino, objetivo: fl.objetivo }))));
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: `Updated routes for ${id} / ${t.nombre || id} successfully` });
          cx.ir(`vpc/tablas/${id}`);
        }
      }
    })
  );
}

/** Tabla con casillas para elegir subredes de una VPC (route tables y NACL). */
function elegirSubredes(cx, { vpcId, elegidas, columnaActual }) {
  const sel = new Set(elegidas);
  const t = ui.tabla(cx, {
    titulo: 'Available subnets',
    variante: 'contenedor',
    refrescar: false,
    filas: () => cx.estado.subredes.filter((s) => s.vpcId === vpcId),
    clave: (s) => s.id,
    seleccion: 'multiple',
    seleccionados: [...sel],
    filtro: 'Filter subnet associations',
    columnas: [
      { titulo: 'Name', valor: (s) => nombre(s) },
      { titulo: 'Subnet ID', valor: (s) => s.id },
      { titulo: 'IPv4 CIDR', valor: (s) => s.cidr },
      { titulo: 'IPv6 CIDR', valor: () => '–' },
      columnaActual
    ],
    vacio: { titulo: 'No subnets', texto: 'This VPC has no subnets.' }
  });
  return t;
}

function asociacionesTabla(cx, { id }) {
  cx.migas([MIGA, { texto: 'Route tables', ruta: 'vpc/tablas' }, { texto: id, ruta: `vpc/tablas/${id}` }, { texto: 'Edit subnet associations' }]);
  const t = tablaDe(cx, id);
  if (!t) return noExiste(cx, 'Route table', id, 'vpc/tablas');
  const lista = elegirSubredes(cx, { vpcId: t.vpcId, elegidas: t.asociaciones, columnaActual: { titulo: 'Route table ID', valor: (s) => idBarraNombre(tablaDeSubred(cx.estado, s.id)) } });
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Edit subnet associations', info: 'asociacion-subred', cx, descripcion: 'Change which subnets are associated with this route table.' }),
    lista,
    ui.contenedor({ titulo: 'Route table', cuerpo: ui.pares([{ etiqueta: 'Route table ID', valor: idBarraNombre(t) }, { etiqueta: 'VPC', valor: t.vpcId }], { columnas: 2 }) }),
    ui.pieFormulario({
      cancelar: () => cx.ir(`vpc/tablas/${id}`),
      textoEnviar: 'Save associations',
      enviar: () => {
        const r = cx.hacer({ servicio: 'VPC', accion: 'AssociateRouteTable', error: 'Failed to update subnet associations' }, (e) => asociarSubredes(e, id, lista.ids()));
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: `You have successfully updated subnet associations for ${id} / ${t.nombre || id}.` });
          cx.ir(`vpc/tablas/${id}`);
        }
      }
    })
  );
}

/* ====================================================== internet gateways */

const igwDe = (cx, id) => cx.estado.igws.find((g) => g.id === id);
const estadoIgw = (g) => (g.vpcId ? ui.estado('exito', 'Attached') : ui.estado('error', 'Detached'));

function accionesIgw(cx, sel, alBorrar) {
  const uno = sel.length === 1 ? sel[0] : null;
  return [
    { texto: 'View details', desactivado: !uno, alClic: () => cx.ir(`vpc/igws/${uno.id}`) },
    { texto: 'Attach to VPC', escribe: true, desactivado: !uno || Boolean(uno.vpcId), alClic: () => cx.ir(`vpc/igws/${uno.id}/adjuntar`) },
    {
      texto: 'Detach from VPC',
      escribe: true,
      desactivado: !uno || !uno.vpcId,
      alClic: () =>
        cx.confirmar({
          titulo: 'Detach from VPC',
          textoBoton: 'Detach internet gateway',
          contenido: [h('p', {}, `Are you sure you want to detach internet gateway ${uno.id} from VPC ${uno.vpcId}?`), ui.alerta({ tipo: 'aviso', contenido: 'Instances in public subnets of this VPC will lose their connection to the internet.' })],
          aceptar: () => {
            const r = cx.hacer({ servicio: 'VPC', accion: 'DetachInternetGateway', error: `Failed to detach internet gateway ${uno.id}` }, (e) => desadjuntarIgw(e, uno.id));
            if (r.ok) cx.flash({ tipo: 'exito', texto: `Internet gateway ${uno.id} successfully detached from ${uno.vpcId}` });
          }
        })
    },
    { texto: 'Manage tags', escribe: true, desactivado: !uno, alClic: () => cx.ir(`vpc/etiquetas/${uno.id}`) },
    '-',
    {
      texto: 'Delete internet gateway',
      escribe: true,
      desactivado: !uno,
      alClic: () =>
        cx.confirmar({
          titulo: 'Delete internet gateway',
          palabra: 'delete',
          contenido: h('p', {}, `Are you sure you want to delete internet gateway ${idBarraNombre(uno)}?`),
          aceptar: () => {
            const r = cx.hacer({ servicio: 'VPC', accion: 'DeleteInternetGateway', error: `Failed to delete internet gateway ${uno.id}` }, (e) => eliminarIgw(e, uno.id));
            if (r.ok) {
              cx.flash({ tipo: 'exito', texto: `Internet gateway ${uno.id} successfully deleted` });
              alBorrar?.();
            }
          }
        })
    }
  ];
}

const paresIgw = (cx, g) =>
  ui.pares(
    [
      { etiqueta: 'Internet gateway ID', valor: ui.copiable(g.id) },
      { etiqueta: 'State', valor: estadoIgw(g) },
      { etiqueta: 'VPC ID', valor: g.vpcId ? enlaceRecurso(cx, g.vpcId, { conNombre: true }) : '–' },
      { etiqueta: 'Owner', valor: cx.estado.cuenta.id }
    ],
    { columnas: 4 }
  );

function listaIgws(cx) {
  cx.migas([MIGA, { texto: 'Internet gateways' }]);
  const t = ui.tabla(cx, {
    titulo: 'Internet gateways',
    info: 'igw',
    filas: () => cx.estado.igws,
    clave: (g) => g.id,
    seleccion: 'unica',
    filtro: 'Find internet gateways by attribute or tag',
    columnas: [
      { titulo: 'Name', valor: (g) => nombre(g), editable: true },
      { titulo: 'Internet gateway ID', valor: (g) => ui.enlace(g.id, `vpc/igws/${g.id}`, { cx }) },
      { titulo: 'State', valor: estadoIgw },
      { titulo: 'VPC ID', valor: (g) => (g.vpcId ? enlaceRecurso(cx, g.vpcId, { conNombre: true }) : '–') },
      { titulo: 'Owner', valor: () => cx.estado.cuenta.id }
    ],
    acciones: (sel) => [ui.menuBoton('Actions', () => accionesIgw(cx, sel, () => t.seleccionar([]))), ui.boton('Create internet gateway', { variante: 'primario', alClic: () => cx.ir('vpc/igws/crear') })],
    vacio: { titulo: 'No internet gateways found' },
    alSeleccionar: () => panel.repintar()
  });
  const panel = cx.vivo(() => {
    const sel = t.seleccion();
    if (sel.length !== 1) return panelVacio('Select an internet gateway');
    return ui.panelInferior({ titulo: `${sel[0].id} / ${sel[0].nombre || sel[0].id}`, contenido: ui.pestanas({ pestanas: [{ id: 'd', texto: 'Details', contenido: () => ui.contenedor({ titulo: 'Details', cuerpo: paresIgw(cx, sel[0]) }) }, { id: 't', texto: 'Tags', contenido: () => pestanaEtiquetas(cx, sel[0]) }] }) });
  });
  return h('div', { class: 'cx-pagina' }, t, panel);
}

function detalleIgw(cx, { id }) {
  cx.migas([MIGA, { texto: 'Internet gateways', ruta: 'vpc/igws' }, { texto: id }]);
  if (!igwDe(cx, id)) return noExiste(cx, 'Internet gateway', id, 'vpc/igws');
  return cx.vivo(() => {
    const g = igwDe(cx, id);
    if (!g) return noExiste(cx, 'Internet gateway', id, 'vpc/igws');
    return h('div', { class: 'cx-pagina' }, ui.encabezado({ titulo: `${g.id} / ${g.nombre || g.id}`, acciones: ui.menuBoton('Actions', () => accionesIgw(cx, [g], () => cx.ir('vpc/igws'))) }), ui.contenedor({ titulo: 'Details', cuerpo: paresIgw(cx, g) }), pestanaEtiquetas(cx, g));
  });
}

function crearIgwPagina(cx) {
  cx.migas([MIGA, { texto: 'Internet gateways', ruta: 'vpc/igws' }, { texto: 'Create internet gateway' }]);
  const f = { nombre: '', etiquetas: [] };
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Create internet gateway', info: 'igw', cx, descripcion: 'An internet gateway is a virtual router that connects a VPC to the internet. To create a new internet gateway specify the name for the gateway below.' }),
    ui.contenedor({ titulo: 'Internet gateway settings', cuerpo: ui.campo({ etiqueta: 'Name tag', descripcion: 'Creates a tag with a key of \'Name\' and a value that you specify.', control: ui.entrada({ valor: f.nombre, placeholder: 'my-internet-gateway-01', alCambiar: (v) => (f.nombre = v) }) }) }),
    ui.contenedor({ titulo: 'Tags - optional', cuerpo: ui.editorEtiquetas({ filas: f.etiquetas }) }),
    ui.pieFormulario({
      cancelar: () => cx.ir('vpc/igws'),
      textoEnviar: 'Create internet gateway',
      enviar: () => {
        const r = cx.hacer({ servicio: 'VPC', accion: 'CreateInternetGateway', error: 'Failed to create internet gateway' }, (e) => crearIgw(e, { nombre: f.nombre || ui.nombreDeEtiquetas(f.etiquetas) }));
        if (r.ok) {
          const g = r.valor;
          cx.flash({
            tipo: 'exito',
            texto: `The following internet gateway was created: ${g.id}${g.nombre ? ` - ${g.nombre}` : ''}. You can now attach to a VPC to enable the VPC to communicate with the internet.`,
            accion: { texto: 'Attach to a VPC', alClic: () => cx.ir(`vpc/igws/${g.id}/adjuntar`) }
          });
          cx.ir(`vpc/igws/${g.id}`);
        }
      }
    })
  );
}

function adjuntarIgwPagina(cx, { id }) {
  cx.migas([MIGA, { texto: 'Internet gateways', ruta: 'vpc/igws' }, { texto: id, ruta: `vpc/igws/${id}` }, { texto: 'Attach to VPC' }]);
  const g = igwDe(cx, id);
  if (!g) return noExiste(cx, 'Internet gateway', id, 'vpc/igws');
  const f = { vpcId: null, error: null };
  const form = ui.region(() => {
    const libres = cx.estado.vpcs.filter((v) => !igwDeVpc(cx.estado, v.id));
    return ui.campo({
      etiqueta: 'Available VPCs',
      info: 'igw',
      cx,
      descripcion: 'Attach the internet gateway to this VPC.',
      control: ui.selector({ opciones: libres.map((v) => ({ valor: v.id, etiqueta: idParentesis(v), descripcion: v.cidr })), valor: f.vpcId, filtrar: true, placeholder: 'Select a VPC', vacio: 'No VPCs without an internet gateway', alCambiar: (v) => ((f.vpcId = v), (f.error = null)) }),
      error: f.error
    });
  });
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: `Attach to VPC (${id})`, info: 'igw', cx }),
    ui.contenedor({ titulo: 'VPC', descripcion: 'Attach an internet gateway to a VPC to enable the VPC to communicate with the internet. Specify the VPC to attach below.', cuerpo: form }),
    ui.pieFormulario({
      cancelar: () => cx.ir(`vpc/igws/${id}`),
      textoEnviar: 'Attach internet gateway',
      enviar: () => {
        if (!f.vpcId) {
          f.error = 'Select a VPC';
          return form.repintar();
        }
        const r = cx.hacer({ servicio: 'VPC', accion: 'AttachInternetGateway', error: `Failed to attach internet gateway ${id}` }, (e) => adjuntarIgw(e, id, f.vpcId));
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: `Internet gateway ${id} successfully attached to ${f.vpcId}` });
          cx.ir(`vpc/igws/${id}`);
        }
      }
    })
  );
}

/* ============================================================= NAT gateways */

const natDe = (cx, id) => cx.estado.nats.find((x) => x.id === id);

function estadoNat(x) {
  const m = { pending: ['pendiente', 'Pending'], available: ['exito', 'Available'], failed: ['error', 'Failed'], deleting: ['pendiente', 'Deleting'], deleted: ['inactivo', 'Deleted'] }[x.estado] ?? ['info', x.estado];
  return ui.estado(m[0], m[1]);
}

const privadaNat = (cx, x) => {
  const s = subDe(cx, x.subredId);
  const c = s && parsearCidr(s.cidr);
  return c ? enteroAIp(c.inicio + 4 + (parseInt(x.id.slice(-2), 16) % Math.max(1, c.total - 5))) : '–';
};

function paresNat(cx, x) {
  return ui.pares(
    [
      { etiqueta: 'NAT gateway ID', valor: ui.copiable(x.id) },
      { etiqueta: 'Connectivity type', valor: x.tipo === 'public' ? 'Public' : 'Private' },
      { etiqueta: 'State', valor: estadoNat(x) },
      { etiqueta: 'State message', valor: x.motivo ?? '–' },
      { etiqueta: 'Primary public IPv4 address', valor: cx.estado.eips.find((e) => e.id === x.eipId)?.ip ?? '–' },
      { etiqueta: 'Primary private IPv4 address', valor: privadaNat(cx, x) },
      { etiqueta: 'Primary network interface ID', valor: `eni-${x.id.slice(4)}` },
      { etiqueta: 'VPC', valor: enlaceRecurso(cx, x.vpcId, { conNombre: true }) },
      { etiqueta: 'Subnet', valor: enlaceRecurso(cx, x.subredId, { conNombre: true }) },
      { etiqueta: 'Created', valor: ui.fechaLarga(x.creado) }
    ],
    { columnas: 4 }
  );
}

function accionesNat(cx, sel) {
  const uno = sel.length === 1 ? sel[0] : null;
  return [
    { texto: 'View details', desactivado: !uno, alClic: () => cx.ir(`vpc/nats/${uno.id}`) },
    { texto: 'Manage tags', desactivado: true },
    '-',
    {
      texto: 'Delete NAT gateway',
      escribe: true,
      desactivado: !uno || ['deleting', 'deleted'].includes(uno.estado),
      alClic: () =>
        cx.confirmar({
          titulo: `Delete NAT gateway ${uno.id}`,
          palabra: 'delete',
          contenido: h('p', {}, `Are you sure you want to delete NAT gateway ${idBarraNombre(uno)}? The Elastic IP address stays allocated to your account until you release it.`),
          aceptar: () => {
            const r = cx.hacer({ servicio: 'VPC', accion: 'DeleteNatGateway', error: 'Failed to delete NAT gateway' }, (e) => eliminarNat(e, uno.id));
            if (r.ok) cx.flash({ tipo: 'exito', texto: `Successfully initiated deletion of NAT gateway ${uno.id}` });
          }
        })
    }
  ];
}

function listaNats(cx) {
  cx.migas([MIGA, { texto: 'NAT gateways' }]);
  const t = ui.tabla(cx, {
    titulo: 'NAT gateways',
    info: 'nat',
    filas: () => cx.estado.nats,
    clave: (x) => x.id,
    seleccion: 'unica',
    filtro: 'Find resources by attribute or tag',
    columnas: [
      { titulo: 'Name', valor: (x) => nombre(x) },
      { titulo: 'NAT gateway ID', valor: (x) => ui.enlace(x.id, `vpc/nats/${x.id}`, { cx }) },
      { titulo: 'Connectivity type', valor: (x) => (x.tipo === 'public' ? 'Public' : 'Private') },
      { titulo: 'State', valor: estadoNat },
      { titulo: 'State message', valor: (x) => x.motivo ?? '–' },
      { titulo: 'Primary public IPv4 address', valor: (x) => cx.estado.eips.find((e) => e.id === x.eipId)?.ip ?? '–' },
      { titulo: 'Primary private IPv4 address', valor: (x) => privadaNat(cx, x) },
      { titulo: 'VPC', valor: (x) => enlaceRecurso(cx, x.vpcId) },
      { titulo: 'Subnet', valor: (x) => enlaceRecurso(cx, x.subredId, { conNombre: true }) },
      { titulo: 'Created', valor: (x) => ui.fecha(x.creado) }
    ],
    acciones: (sel) => [ui.menuBoton('Actions', () => accionesNat(cx, sel)), ui.boton('Create NAT gateway', { variante: 'primario', alClic: () => cx.ir('vpc/nats/crear') })],
    vacio: { titulo: 'No NAT gateways found' },
    alSeleccionar: () => panel.repintar()
  });
  const panel = cx.vivo(() => {
    const sel = t.seleccion();
    if (sel.length !== 1) return panelVacio('Select a NAT gateway');
    return ui.panelInferior({ titulo: `${sel[0].id} / ${sel[0].nombre || sel[0].id}`, contenido: ui.contenedor({ titulo: 'Details', cuerpo: paresNat(cx, sel[0]) }) });
  });
  return h('div', { class: 'cx-pagina' }, t, panel);
}

function detalleNat(cx, { id }) {
  cx.migas([MIGA, { texto: 'NAT gateways', ruta: 'vpc/nats' }, { texto: id }]);
  if (!natDe(cx, id)) return noExiste(cx, 'NAT gateway', id, 'vpc/nats');
  return cx.vivo(() => {
    const x = natDe(cx, id);
    if (!x) return noExiste(cx, 'NAT gateway', id, 'vpc/nats');
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({ titulo: `${x.id} / ${x.nombre || x.id}`, acciones: ui.menuBoton('Actions', () => accionesNat(cx, [x])) }),
      x.estado === 'failed' ? ui.alerta({ tipo: 'error', titulo: 'NAT gateway failed', contenido: x.motivo }) : null,
      ui.contenedor({ titulo: 'Details', cuerpo: paresNat(cx, x) })
    );
  });
}

function crearNatPagina(cx) {
  cx.migas([MIGA, { texto: 'NAT gateways', ruta: 'vpc/nats' }, { texto: 'Create NAT gateway' }]);
  const f = { nombre: '', subredId: null, tipo: 'public', eipId: null, etiquetas: [], errores: {} };
  const form = ui.region(() =>
    h(
      'div',
      { class: 'cx-form', style: { maxWidth: '680px' } },
      ui.campo({ etiqueta: 'Name', opcional: true, descripcion: 'Create a tag with a key of \'Name\' and a value that you specify.', control: ui.entrada({ valor: f.nombre, placeholder: 'my-nat-gateway-01', alCambiar: (v) => (f.nombre = v) }), restriccion: 'The name can be up to 256 characters long.' }),
      ui.campo({
        etiqueta: 'Subnet',
        info: 'nat',
        cx,
        descripcion: 'Select a subnet in which to create the NAT gateway.',
        control: ui.selector({ opciones: cx.estado.subredes.map((s) => ({ valor: s.id, etiqueta: idParentesis(s), descripcion: `${s.vpcId} · ${s.az} · ${s.cidr}` })), valor: f.subredId, filtrar: true, placeholder: 'Select a subnet', alCambiar: (v) => ((f.subredId = v), (f.errores.subred = null)) }),
        error: f.errores.subred
      }),
      ui.campo({
        etiqueta: 'Connectivity type',
        info: 'nat',
        cx,
        descripcion: 'Select a connectivity type for the NAT gateway.',
        control: ui.radios({ valor: f.tipo, opciones: [{ valor: 'public', etiqueta: 'Public' }, { valor: 'private', etiqueta: 'Private' }], alCambiar: (v) => ((f.tipo = v), form.repintar()) })
      }),
      f.tipo === 'public'
        ? ui.campo({
            etiqueta: 'Elastic IP allocation ID',
            info: 'eip',
            cx,
            descripcion: 'Assign an Elastic IP address to the NAT gateway.',
            control: h(
              'div',
              { class: 'cx-fila-campos' },
              h(
                'div',
                { style: { flex: '1 1 260px' } },
                ui.selector({ opciones: cx.estado.eips.filter((e) => !e.instanciaId && !e.natId).map((e) => ({ valor: e.id, etiqueta: e.id, descripcion: e.ip })), valor: f.eipId, filtrar: true, placeholder: 'Select an Elastic IP', vacio: 'No Elastic IP addresses available', alCambiar: (v) => ((f.eipId = v), (f.errores.eip = null)) })
              ),
              ui.boton('Allocate Elastic IP', {
                escribe: true,
                alClic: () => {
                  const r = cx.hacer({ servicio: 'EC2', accion: 'AllocateAddress', error: 'Failed to allocate Elastic IP address' }, (e) => asignarEip(e, {}));
                  if (r.ok) {
                    f.eipId = r.valor.id;
                    cx.flash({ tipo: 'exito', texto: `Elastic IP address ${r.valor.ip} allocated successfully.` });
                    form.repintar();
                  }
                }
              })
            ),
            error: f.errores.eip
          })
        : null
    )
  );
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Create NAT gateway', info: 'nat', cx, descripcion: 'A highly available, managed Network Address Translation (NAT) service that instances in private subnets can use to connect to services in other VPCs, on-premises networks, or the internet.' }),
    ui.contenedor({ titulo: 'NAT gateway settings', cuerpo: form }),
    ui.alerta({ tipo: 'aviso', contenido: 'NAT gateways are billed per hour and per GB of data processed. Delete it when you finish your lab.' }),
    ui.contenedor({ titulo: 'Tags', cuerpo: ui.editorEtiquetas({ filas: f.etiquetas }) }),
    ui.pieFormulario({
      cancelar: () => cx.ir('vpc/nats'),
      textoEnviar: 'Create NAT gateway',
      enviar: () => {
        f.errores = { subred: f.subredId ? null : 'Subnet is required', eip: f.tipo === 'public' && !f.eipId ? 'Elastic IP allocation ID is required' : null };
        if (f.errores.subred || f.errores.eip) return form.repintar();
        const r = cx.hacer({ servicio: 'VPC', accion: 'CreateNatGateway', error: 'Failed to create NAT gateway' }, (e) => crearNat(e, { nombre: f.nombre || ui.nombreDeEtiquetas(f.etiquetas), subredId: f.subredId, eipId: f.tipo === 'public' ? f.eipId : null, tipo: f.tipo }));
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: `NAT gateway ${r.valor.id}${r.valor.nombre ? ` | ${r.valor.nombre}` : ''} was created successfully.` });
          cx.ir(`vpc/nats/${r.valor.id}`);
        }
      }
    })
  );
}

/* ============================================================= network ACLs */

const naclDe = (cx, id) => cx.estado.nacls.find((x) => x.id === id);
const TIPO_POR_NOMBRE = new Map(TIPOS_REGLA.map((t) => [t.tipo, t]));

function accionesNacl(cx, sel, alBorrar) {
  const uno = sel.length === 1 ? sel[0] : null;
  return [
    { texto: 'View details', desactivado: !uno, alClic: () => cx.ir(`vpc/nacls/${uno.id}`) },
    { texto: 'Edit inbound rules', escribe: true, desactivado: !uno, alClic: () => cx.ir(`vpc/nacls/${uno.id}/entrada`) },
    { texto: 'Edit outbound rules', escribe: true, desactivado: !uno, alClic: () => cx.ir(`vpc/nacls/${uno.id}/salida`) },
    { texto: 'Edit subnet associations', escribe: true, desactivado: !uno, alClic: () => cx.ir(`vpc/nacls/${uno.id}/asociaciones`) },
    { texto: 'Manage tags', escribe: true, desactivado: !uno, alClic: () => cx.ir(`vpc/etiquetas/${uno.id}`) },
    '-',
    {
      texto: 'Delete network ACLs',
      escribe: true,
      desactivado: !uno,
      alClic: () =>
        cx.confirmar({
          titulo: 'Delete network ACLs',
          palabra: 'delete',
          contenido: h('p', {}, `Are you sure you want to delete network ACL ${idBarraNombre(uno)}?`),
          aceptar: () => {
            const r = cx.hacer({ servicio: 'VPC', accion: 'DeleteNetworkAcl', error: 'Failed to delete network ACL' }, (e) => eliminarNacl(e, uno.id));
            if (r.ok) {
              cx.flash({ tipo: 'exito', texto: `Successfully deleted network ACL ${uno.id}` });
              alBorrar?.();
            }
          }
        })
    }
  ];
}

function pestanasNacl(cx, x, st) {
  const subs = x.subredes.map((id) => subDe(cx, id)).filter(Boolean);
  return ui.pestanas({
    activa: st.pestana,
    alCambiar: (p) => (st.pestana = p),
    pestanas: [
      {
        id: 'detalles',
        texto: 'Details',
        contenido: () =>
          ui.contenedor({
            titulo: 'Details',
            cuerpo: ui.pares(
              [
                { etiqueta: 'Network ACL ID', valor: ui.copiable(x.id) },
                { etiqueta: 'Associated with', valor: subs.length ? `${n(subs, 'Subnet')}` : '–' },
                { etiqueta: 'Default', valor: x.porDefecto ? 'Yes' : 'No' },
                { etiqueta: 'VPC ID', valor: enlaceRecurso(cx, x.vpcId, { conNombre: true }) },
                { etiqueta: 'Owner', valor: cx.estado.cuenta.id }
              ],
              { columnas: 3 }
            )
          })
      },
      { id: 'entrada', texto: 'Inbound rules', contenido: () => tablaReglasNacl(cx, x, 'entrada', { acciones: [ui.boton('Edit inbound rules', { escribe: true, alClic: () => cx.ir(`vpc/nacls/${x.id}/entrada`) })] }) },
      { id: 'salida', texto: 'Outbound rules', contenido: () => tablaReglasNacl(cx, x, 'salida', { acciones: [ui.boton('Edit outbound rules', { escribe: true, alClic: () => cx.ir(`vpc/nacls/${x.id}/salida`) })] }) },
      {
        id: 'asociaciones',
        texto: 'Subnet associations',
        contenido: () =>
          ui.contenedor({
            titulo: 'Subnet associations',
            contador: subs.length,
            sinRelleno: true,
            acciones: ui.boton('Edit subnet associations', { escribe: true, alClic: () => cx.ir(`vpc/nacls/${x.id}/asociaciones`) }),
            cuerpo: subs.length
              ? h('table', { class: 'cx-tabla__tabla' }, h('thead', {}, h('tr', {}, ['Name', 'Subnet ID', 'IPv4 CIDR'].map((c) => h('th', {}, h('span', { class: 'cx-tabla__orden' }, c))))), h('tbody', {}, subs.map((s) => h('tr', {}, h('td', { style: { paddingLeft: '20px' } }, nombre(s)), h('td', {}, enlaceRecurso(cx, s.id)), h('td', {}, s.cidr)))))
              : h('div', { class: 'cx-tabla__vacia' }, h('b', {}, 'No subnet associations'), h('div', {}, 'This network ACL is not associated with any subnets.'))
          })
      },
      { id: 'etiquetas', texto: 'Tags', contenido: () => pestanaEtiquetas(cx, x) }
    ]
  });
}

function listaNacls(cx) {
  cx.migas([MIGA, { texto: 'Network ACLs' }]);
  const st = { pestana: 'entrada' };
  const t = ui.tabla(cx, {
    titulo: 'Network ACLs',
    info: 'nacl',
    filas: () => cx.estado.nacls,
    clave: (x) => x.id,
    seleccion: 'multiple',
    filtro: 'Find Network ACLs by attribute or tag',
    columnas: [
      { titulo: 'Name', valor: (x) => nombre(x), editable: true },
      { titulo: 'Network ACL ID', valor: (x) => ui.enlace(x.id, `vpc/nacls/${x.id}`, { cx }) },
      { titulo: 'Associated with', valor: (x) => (x.subredes.length === 1 ? enlaceRecurso(cx, x.subredes[0]) : x.subredes.length ? `${x.subredes.length} Subnets` : '–') },
      { titulo: 'Default', valor: (x) => (x.porDefecto ? 'Yes' : 'No') },
      { titulo: 'VPC ID', valor: (x) => enlaceRecurso(cx, x.vpcId, { conNombre: true }) },
      { titulo: 'Inbound rules count', valor: (x) => `${x.entrada.length + 1} Inbound rules` },
      { titulo: 'Outbound rules count', valor: (x) => `${x.salida.length + 1} Outbound rules` },
      { titulo: 'Owner', valor: () => cx.estado.cuenta.id }
    ],
    acciones: (sel) => [ui.menuBoton('Actions', () => accionesNacl(cx, sel, () => t.seleccionar([]))), ui.boton('Create network ACL', { variante: 'primario', alClic: () => cx.ir('vpc/nacls/crear') })],
    alSeleccionar: () => panel.repintar()
  });
  const panel = cx.vivo(() => {
    const sel = t.seleccion();
    if (sel.length !== 1) return panelVacio('Select a network ACL');
    return ui.panelInferior({ titulo: `${sel[0].id}${sel[0].nombre ? ` / ${sel[0].nombre}` : ''}`, contenido: pestanasNacl(cx, sel[0], st) });
  });
  return h('div', { class: 'cx-pagina' }, t, panel);
}

function detalleNacl(cx, { id }) {
  cx.migas([MIGA, { texto: 'Network ACLs', ruta: 'vpc/nacls' }, { texto: id }]);
  if (!naclDe(cx, id)) return noExiste(cx, 'Network ACL', id, 'vpc/nacls');
  const st = { pestana: 'entrada' };
  return cx.vivo(() => {
    const x = naclDe(cx, id);
    if (!x) return noExiste(cx, 'Network ACL', id, 'vpc/nacls');
    return h('div', { class: 'cx-pagina' }, ui.encabezado({ titulo: `${x.id}${x.nombre ? ` / ${x.nombre}` : ''}`, acciones: ui.menuBoton('Actions', () => accionesNacl(cx, [x], () => cx.ir('vpc/nacls'))) }), pestanasNacl(cx, x, st));
  });
}

function crearNaclPagina(cx) {
  cx.migas([MIGA, { texto: 'Network ACLs', ruta: 'vpc/nacls' }, { texto: 'Create network ACL' }]);
  const f = { nombre: '', vpcId: null, etiquetas: [], error: null };
  const form = ui.region(() =>
    h(
      'div',
      { class: 'cx-form', style: { maxWidth: '640px' } },
      ui.campo({ etiqueta: 'Name', opcional: true, control: ui.entrada({ valor: f.nombre, placeholder: 'my-network-acl-01', alCambiar: (v) => (f.nombre = v) }) }),
      ui.campo({ etiqueta: 'VPC', info: 'vpc', cx, descripcion: 'The VPC to use for this network ACL.', control: ui.selector({ opciones: opcionesVpc(cx.estado), valor: f.vpcId, filtrar: true, placeholder: 'Select a VPC', alCambiar: (v) => (f.vpcId = v) }), error: f.error })
    )
  );
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Create network ACL', info: 'nacl', cx, descripcion: 'A network ACL is an optional layer of security that acts as a firewall for controlling traffic in and out of a subnet.' }),
    ui.contenedor({ titulo: 'Network ACL settings', cuerpo: form }),
    ui.contenedor({ titulo: 'Tags', cuerpo: ui.editorEtiquetas({ filas: f.etiquetas }) }),
    ui.pieFormulario({
      cancelar: () => cx.ir('vpc/nacls'),
      textoEnviar: 'Create network ACL',
      enviar: () => {
        if (!f.vpcId) {
          f.error = 'VPC is required';
          return form.repintar();
        }
        const r = cx.hacer({ servicio: 'VPC', accion: 'CreateNetworkAcl', error: 'Failed to create network ACL' }, (e) => crearNacl(e, { vpcId: f.vpcId, nombre: f.nombre || ui.nombreDeEtiquetas(f.etiquetas) }));
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: `Network ACL ${r.valor.id}${r.valor.nombre ? ` / ${r.valor.nombre}` : ''} was created successfully.` });
          cx.ir(`vpc/nacls/${r.valor.id}`);
        }
      }
    })
  );
}

function editarReglasNaclPagina(sentido) {
  return (cx, { id }) => {
    const titulo = sentido === 'entrada' ? 'Edit inbound rules' : 'Edit outbound rules';
    cx.migas([MIGA, { texto: 'Network ACLs', ruta: 'vpc/nacls' }, { texto: id, ruta: `vpc/nacls/${id}` }, { texto: titulo }]);
    const x = naclDe(cx, id);
    if (!x) return noExiste(cx, 'Network ACL', id, 'vpc/nacls');
    const palabra = sentido === 'entrada' ? 'Source' : 'Destination';
    const filas = x[sentido].map((r) => ({ numero: String(r.numero), tipo: tipoDeRegla(r), puertos: TIPO_POR_NOMBRE.get(tipoDeRegla(r))?.rango ? (r.desde === r.hasta ? String(r.desde) : `${r.desde}-${r.hasta}`) : '', cidr: r.cidr, accion: r.accion }));
    const editor = ui.region(() => {
      const cols = '110px minmax(150px,1.3fr) 80px minmax(110px,1fr) minmax(150px,1.2fr) 120px auto';
      return [
        h(
          'div',
          { class: 'cx-reglas', style: { gridTemplateColumns: cols } },
          ['Rule number', 'Type', 'Protocol', 'Port range', palabra, 'Allow/Deny', ''].map((c) => h('div', { class: 'cx-reglas__cabeza' }, c, c && c !== 'Protocol' ? ui.info(cx, 'nacl-reglas') : null)),
          filas.map((fl, i) => {
            const tt = TIPO_POR_NOMBRE.get(fl.tipo) ?? TIPOS_REGLA[0];
            return [
              ui.entrada({ valor: fl.numero, tipo: 'number', etiquetaAccesible: 'Rule number', alCambiar: (v) => (fl.numero = v) }),
              ui.selector({ opciones: TIPOS_REGLA.map((t) => ({ valor: t.tipo, etiqueta: t.tipo })), valor: fl.tipo, filtrar: true, etiquetaAccesible: 'Type', alCambiar: (v) => ((fl.tipo = v), (fl.puertos = ''), editor.repintar()) }),
              ui.entrada({ valor: textoProtocolo(tt.protocolo), desactivado: true, etiquetaAccesible: 'Protocol' }),
              tt.rango
                ? ui.entrada({ valor: fl.puertos, placeholder: '0 - 65535', etiquetaAccesible: 'Port range', alCambiar: (v) => (fl.puertos = v) })
                : ui.entrada({ valor: tt.todos || tt.protocolo === 'icmp' ? 'All' : tt.desde === tt.hasta ? String(tt.desde) : `${tt.desde} - ${tt.hasta}`, desactivado: true, etiquetaAccesible: 'Port range' }),
              ui.entrada({ valor: fl.cidr, placeholder: '0.0.0.0/0', etiquetaAccesible: palabra, alCambiar: (v) => (fl.cidr = v) }),
              ui.selector({ opciones: [{ valor: 'allow', etiqueta: 'Allow' }, { valor: 'deny', etiqueta: 'Deny' }], valor: fl.accion, etiquetaAccesible: 'Allow/Deny', alCambiar: (v) => (fl.accion = v) }),
              ui.boton('Remove', { alClic: () => (filas.splice(i, 1), editor.repintar()) }),
              h('div', { class: 'cx-reglas__sep' })
            ];
          }),
          // La regla «*» del final: niega todo lo que no coincidió antes. No se puede editar.
          ['*', 'All traffic', 'All', 'All', '0.0.0.0/0'].map((c) => h('div', { class: 'cx-reglas__celda-fija' }, c)),
          h('div', { class: 'cx-reglas__celda-fija' }, ui.estado('error', 'Deny')),
          h('div')
        ),
        h(
          'div',
          { style: { marginTop: '12px' } },
          ui.boton('Add new rule', {
            alClic: () => {
              const max = Math.max(0, ...filas.map((fl) => Number(fl.numero) || 0));
              filas.push({ numero: String(Math.ceil((max + 1) / 100) * 100 || 100), tipo: 'Custom TCP', puertos: '', cidr: '0.0.0.0/0', accion: 'allow' });
              editor.repintar();
            }
          }),
          ui.boton('Sort by rule number', { variante: 'texto', alClic: () => (filas.sort((a, b) => Number(a.numero) - Number(b.numero)), editor.repintar()) })
        )
      ];
    });
    const convertir = (fl) => {
      const t = TIPO_POR_NOMBRE.get(fl.tipo) ?? TIPOS_REGLA[0];
      let desde = t.desde;
      let hasta = t.hasta;
      if (t.rango) {
        const m = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(fl.puertos);
        desde = m ? Number(m[1]) : fl.puertos.trim();
        hasta = m ? (m[2] !== undefined ? Number(m[2]) : desde) : desde;
      }
      return { numero: fl.numero, protocolo: t.protocolo, desde, hasta, cidr: fl.cidr, accion: fl.accion };
    };
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({ titulo, info: 'nacl-reglas', cx, descripcion: `${sentido === 'entrada' ? 'Inbound' : 'Outbound'} rules are evaluated in order, starting with the lowest numbered rule. The first rule that matches the traffic is applied.` }),
      ui.contenedor({ titulo: sentido === 'entrada' ? 'Inbound rules' : 'Outbound rules', cuerpo: editor }),
      ui.pieFormulario({
        cancelar: () => cx.ir(`vpc/nacls/${id}`),
        extra: ui.boton('Preview changes', { desactivado: true }),
        textoEnviar: 'Save changes',
        enviar: () => {
          const r = cx.hacer({ servicio: 'VPC', accion: sentido === 'entrada' ? 'ReplaceNetworkAclEntries (inbound)' : 'ReplaceNetworkAclEntries (outbound)', error: `Failed to update ${sentido === 'entrada' ? 'inbound' : 'outbound'} rules` }, (e) => editarReglasNacl(e, id, sentido, filas.map(convertir)));
          if (r.ok) {
            cx.flash({ tipo: 'exito', texto: `You have successfully updated ${sentido === 'entrada' ? 'inbound' : 'outbound'} rules for ${id}.` });
            cx.ir(`vpc/nacls/${id}`);
          }
        }
      })
    );
  };
}

function asociacionesNacl(cx, { id }) {
  cx.migas([MIGA, { texto: 'Network ACLs', ruta: 'vpc/nacls' }, { texto: id, ruta: `vpc/nacls/${id}` }, { texto: 'Edit subnet associations' }]);
  const x = naclDe(cx, id);
  if (!x) return noExiste(cx, 'Network ACL', id, 'vpc/nacls');
  const lista = elegirSubredes(cx, { vpcId: x.vpcId, elegidas: x.subredes, columnaActual: { titulo: 'Associated with', valor: (s) => naclDeSubred(cx.estado, s.id)?.id ?? '–' } });
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Edit subnet associations', info: 'nacl', cx, descripcion: 'Change which subnets are associated with this network ACL. A subnet can be associated with only one network ACL at a time.' }),
    lista,
    ui.pieFormulario({
      cancelar: () => cx.ir(`vpc/nacls/${id}`),
      textoEnviar: 'Save changes',
      enviar: () => {
        const r = cx.hacer({ servicio: 'VPC', accion: 'ReplaceNetworkAclAssociation', error: 'Failed to update subnet associations' }, (e) => asociarNacl(e, id, lista.ids()));
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: `You have successfully updated subnet associations for ${id}.` });
          cx.ir(`vpc/nacls/${id}`);
        }
      }
    })
  );
}

/* ============================================================== dashboard */

function panel(cx) {
  cx.migas([MIGA, { texto: 'VPC dashboard' }]);
  const tarjeta = (titulo, ruta, cuenta) =>
    h(
      'div',
      { class: 'cx-tarjeta-region' },
      h('div', { class: 'cx-tarjeta-region__fila' }, ruta ? ui.enlace(titulo, ruta, { cx }) : h('span', { class: 'cx-texto-sec' }, titulo), h('span', {}, 'N. Virginia ', ruta ? ui.enlace(String(cuenta), ruta, { cx }) : String(cuenta))),
      h('span', { class: 'cx-tarjeta-region__ver' }, ui.icono('caret-right'), 'See all regions')
    );
  const recursos = cx.vivo(() => {
    const e = cx.estado;
    return h(
      'div',
      { class: 'cx-tarjetas-region' },
      tarjeta('VPCs', 'vpc/vpcs', e.vpcs.length),
      tarjeta('Endpoint Services', null, 0),
      tarjeta('Subnets', 'vpc/subredes', e.subredes.length),
      tarjeta('NAT Gateways', 'vpc/nats', e.nats.filter((x) => x.estado !== 'deleted').length),
      tarjeta('Route Tables', 'vpc/tablas', e.tablasRutas.length),
      tarjeta('VPC Peering Connections', null, 0),
      tarjeta('Internet Gateways', 'vpc/igws', e.igws.length),
      tarjeta('Network ACLs', 'vpc/nacls', e.nacls.length),
      tarjeta('Egress-only Internet Gateways', null, 0),
      tarjeta('Security Groups', 'vpc/grupos', e.gruposSeguridad.length),
      tarjeta('DHCP option sets', null, 1),
      tarjeta('Elastic IPs', 'vpc/eips', e.eips.length),
      tarjeta('Endpoints', null, 0),
      tarjeta('Customer Gateways', null, 0)
    );
  });
  return h(
    'div',
    { class: 'cx-pagina' },
    h(
      'div',
      { class: 'cx-dos-columnas' },
      h(
        'div',
        { class: 'cx-pagina' },
        h('div', {}, h('div', { class: 'cx-acciones' }, ui.boton('Create VPC', { variante: 'primario', alClic: () => cx.ir('vpc/vpcs/crear') }), ui.boton('Launch EC2 Instances', { alClic: () => cx.ir('ec2/instancias/lanzar') })), h('p', { class: 'cx-texto-sec', style: { marginTop: '4px', fontSize: '12px' } }, 'Note: Your Instances will launch in the United States region.')),
        ui.contenedor({ titulo: 'Resources by Region', info: 'vpc', cx, descripcion: 'You are using the following Amazon VPC resources', acciones: ui.boton('Refresh Resources', { variante: 'texto', icono: 'refresh', alClic: () => cx.refrescar() }), cuerpo: recursos })
      ),
      h(
        'div',
        { class: 'cx-lado' },
        ui.contenedor({ titulo: 'Service Health', cuerpo: ui.estado('exito', 'This service is operating normally') }),
        ui.contenedor({ titulo: 'Settings', cuerpo: h('div', { class: 'cx-form' }, ['Account-level encryption control', 'Block Public Access', 'Zones', 'Console Experiments'].map((t) => h('div', { class: 'cx-texto-sec' }, t))) }),
        ui.contenedor({ titulo: 'Additional Information', cuerpo: h('div', { class: 'cx-form' }, ['VPC Documentation', 'All VPC Resources', 'Forums', 'Report an Issue'].map((t) => h('div', { class: 'cx-texto-sec' }, t))) })
      )
    )
  );
}

/* ================================================================ ayudas */

const ayudas = {
  vpc: {
    titulo: 'VPC',
    texto: [
      'Una **VPC** (nube privada virtual) es tu propia red aislada dentro de AWS: como un fraccionamiento cerrado donde viven tus servidores.',
      'Cada cuenta trae una **default VPC** (`172.31.0.0/16`) lista para usar. Tú puedes crear las tuyas con el rango que quieras.',
      'Dentro de la VPC se crean **subredes**, y el tráfico se dirige con **route tables**.'
    ]
  },
  cidr: {
    titulo: 'Bloque CIDR',
    texto: [
      'Un **CIDR** dice qué direcciones IP usa una red: `10.0.0.0/16` = todas las que empiezan con `10.0.` (65,536 direcciones).',
      'Entre más grande el número después de la diagonal, más chica la red: `/24` = 256 direcciones, `/28` = 16.',
      'La VPC acepta de `/16` a `/28`. Cada subred debe caber **dentro** del rango de la VPC y no encimarse con otra.',
      'En cada subred AWS se reserva 5 direcciones (las 4 primeras y la última).'
    ]
  },
  subred: {
    titulo: 'Subred',
    texto: [
      'Una **subred** es un pedazo del rango de la VPC que vive en **una sola zona de disponibilidad**. Las instancias se lanzan dentro de una subred.',
      'Que sea **pública** o **privada** NO depende de su nombre: depende de su route table. Es pública si su tabla manda `0.0.0.0/0` a un Internet Gateway.'
    ]
  },
  'subred-publica': {
    titulo: 'Subred pública y privada',
    texto: [
      '**Pública**: su route table tiene la ruta `0.0.0.0/0` → Internet Gateway. Ahí van los servidores web.',
      '**Privada**: no tiene esa ruta. Ahí van bases de datos y servidores internos. Si necesitan salir a internet (por ejemplo, para actualizarse), usan un **NAT gateway**.',
      'Ojo: aunque la subred sea pública, la instancia también necesita **IP pública** para que la encuentren.'
    ]
  },
  'tabla-rutas': {
    titulo: 'Route table',
    texto: [
      'La **route table** es el letrero de la calle: dice a dónde se va cada paquete según su destino.',
      'La ruta **local** (el rango de la VPC) siempre está y comunica a todas las subredes entre sí.',
      'Para salir a internet agrega `0.0.0.0/0` con target **Internet Gateway** (`igw-…`). Para que una subred privada salga sin ser visible, target **NAT Gateway**.',
      'Cada subred usa una sola tabla: la que le asocies (**Edit subnet associations**) o, si no, la **main** de su VPC.',
      'Una ruta en rojo **Blackhole** apunta a algo que ya no existe o ya no está conectado.'
    ]
  },
  'asociacion-subred': {
    titulo: 'Asociar subredes',
    texto: ['Marca las subredes que deben usar esta route table. Las que no tengan asociación explícita usan la tabla **main** de la VPC.', 'Crear la ruta no basta: si la subred no está asociada a la tabla, la ruta no le aplica.']
  },
  igw: {
    titulo: 'Internet Gateway',
    texto: [
      'El **Internet Gateway** es la puerta del fraccionamiento hacia internet. Una VPC tiene como máximo una.',
      'Crearlo no basta: hay que **adjuntarlo** a la VPC (Attach to VPC) y luego poner la ruta `0.0.0.0/0` → `igw-…` en la route table de la subred pública.'
    ]
  },
  nat: {
    titulo: 'NAT gateway',
    texto: [
      'Un **NAT gateway** deja que las instancias de subredes **privadas** salgan a internet (para descargar actualizaciones) sin que nadie de afuera pueda entrar a ellas.',
      'Se crea en una subred **pública** y necesita una **Elastic IP**. Luego, en la route table de la subred privada, pon `0.0.0.0/0` → `nat-…`.',
      'Si su VPC no tiene Internet Gateway, el NAT queda en **Failed**. Cobra por hora: bórralo al terminar.'
    ]
  },
  nacl: {
    titulo: 'Network ACL',
    texto: [
      'La **NACL** es la caseta de vigilancia de la **subred** (el security group es el guardia de cada instancia).',
      'Diferencias con el security group: la NACL tiene reglas de **Allow y Deny**, se revisan **en orden por número** (la primera que coincide gana) y **no recuerda** conexiones: hay que permitir también la respuesta de salida (puertos 1024-65535).',
      'La NACL por omisión deja pasar todo. Una NACL nueva **niega todo** hasta que le agregues reglas.'
    ]
  },
  'nacl-reglas': {
    titulo: 'Reglas de la NACL',
    texto: [
      'Las reglas se evalúan del **número más bajo al más alto**; la primera que coincide decide. Deja huecos (100, 200, 300…) para meter reglas después.',
      'La regla `*` del final niega todo lo que no coincidió antes y no se puede borrar.',
      'Para una página web: entrada TCP 80 Allow desde `0.0.0.0/0` **y** salida TCP 1024-65535 Allow hacia `0.0.0.0/0` (la respuesta).'
    ]
  },
  'mapa-recursos': {
    titulo: 'Resource map',
    texto: [
      'El mapa dibuja cómo se conecta todo en la VPC: **VPC → subredes (por zona) → route tables → conexiones** (Internet Gateway, NAT).',
      'Las subredes con círculo verde son **públicas** (su tabla llega a un Internet Gateway); las de cuadro azul, privadas.',
      'Pasa el mouse por una caja para iluminar su camino. Si una subred no llega a ningún gateway, no puede salir a internet.'
    ]
  },
  'vpc-and-more': {
    titulo: 'VPC only o VPC and more',
    texto: [
      '**VPC only** crea solo la VPC (con su main route table, NACL y security group por omisión). Lo demás lo agregas tú a mano.',
      '**VPC and more** crea de una vez subredes públicas y privadas en varias zonas, el Internet Gateway, las route tables con sus rutas y (si quieres) NAT gateways. La vista previa de la derecha muestra todo.',
      'Ojo: las subredes públicas que crea quedan **sin IP pública automática**; actívala al lanzar la instancia o en la subred.'
    ]
  },
  tenancy: { titulo: 'Tenancy', texto: ['**Default**: tus instancias comparten hardware físico con otros clientes (lo normal y lo más barato). **Dedicated**: hardware solo para ti (mucho más caro).'] },
  'dns-vpc': {
    titulo: 'Opciones de DNS',
    texto: ['**DNS resolution**: las instancias pueden traducir nombres a IP usando el DNS de Amazon.', '**DNS hostnames**: las instancias con IP pública reciben un nombre como `ec2-54-1-2-3.compute-1.amazonaws.com`.']
  }
};

/* ================================================================ registro */

const des = (texto) => ({ texto, desactivado: true });

export default {
  id: 'vpc',
  nombre: 'VPC',
  titulo: 'VPC dashboard',
  descripcion: 'Isolated Cloud Resources',
  categoria: 'redes',
  claves: 'network red subnets virtual private cloud',
  inicio: 'vpc',
  menu: [
    { texto: 'AWS Global View', externo: true, desactivado: true },
    {
      seccion: 'Virtual private cloud',
      items: [
        { texto: 'Your VPCs', ruta: 'vpc/vpcs' },
        { texto: 'Subnets', ruta: 'vpc/subredes' },
        { texto: 'Route tables', ruta: 'vpc/tablas' },
        { texto: 'Internet gateways', ruta: 'vpc/igws' },
        des('Egress-only internet gateways'),
        des('Carrier gateways'),
        des('DHCP option sets'),
        { texto: 'Elastic IPs', ruta: 'vpc/eips' },
        des('Managed prefix lists'),
        { texto: 'NAT gateways', ruta: 'vpc/nats' },
        des('Peering connections'),
        des('Route servers')
      ]
    },
    { seccion: 'Security', items: [{ texto: 'Network ACLs', ruta: 'vpc/nacls' }, { texto: 'Security groups', ruta: 'vpc/grupos' }] },
    { seccion: 'PrivateLink and Lattice', items: [des('Endpoints'), des('Endpoint services')] },
    { seccion: 'Virtual private network (VPN)', items: [des('Customer gateways'), des('Virtual private gateways'), des('Site-to-Site VPN connections')] }
  ],
  rutas: {
    '': panel,
    vpcs: listaVpcs,
    'vpcs/crear': crearVpcPagina,
    'vpcs/:id': detalleVpc,
    'vpcs/:id/editar': editarVpcPagina,
    flujo: flujoVpc,
    subredes: listaSubredes,
    'subredes/crear': crearSubredPagina,
    'subredes/:id': detalleSubred,
    'subredes/:id/editar': editarSubredPagina,
    'subredes/:id/tabla': asociarTablaSubred,
    'subredes/:id/nacl': asociarNaclSubred,
    tablas: listaTablas,
    'tablas/crear': crearTablaPagina,
    'tablas/:id': detalleTabla,
    'tablas/:id/rutas': editarRutasPagina,
    'tablas/:id/asociaciones': asociacionesTabla,
    igws: listaIgws,
    'igws/crear': crearIgwPagina,
    'igws/:id': detalleIgw,
    'igws/:id/adjuntar': adjuntarIgwPagina,
    nats: listaNats,
    'nats/crear': crearNatPagina,
    'nats/:id': detalleNat,
    nacls: listaNacls,
    'nacls/crear': crearNaclPagina,
    'nacls/:id': detalleNacl,
    'nacls/:id/entrada': editarReglasNaclPagina('entrada'),
    'nacls/:id/salida': editarReglasNaclPagina('salida'),
    'nacls/:id/asociaciones': asociacionesNacl,
    ...rutasGrupos,
    ...rutasEips,
    'etiquetas/:id': paginaEtiquetas
  },
  busqueda: [
    { texto: 'Your VPCs', ruta: 'vpc/vpcs' },
    { texto: 'Create VPC', ruta: 'vpc/vpcs/crear' },
    { texto: 'Subnets', ruta: 'vpc/subredes', claves: 'subredes' },
    { texto: 'Route tables', ruta: 'vpc/tablas', claves: 'rutas routes' },
    { texto: 'Internet gateways', ruta: 'vpc/igws', claves: 'igw' },
    { texto: 'NAT gateways', ruta: 'vpc/nats' },
    { texto: 'Network ACLs', ruta: 'vpc/nacls', claves: 'nacl' },
    { texto: 'Security groups', ruta: 'vpc/grupos' },
    { texto: 'Elastic IPs', ruta: 'vpc/eips' }
  ],
  ayudas
};

export { zonaTexto };
