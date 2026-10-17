// ---------------------------------------------------------------------------
// EC2 · NETWORK & SECURITY
//
// Security Groups, Elastic IPs y Key Pairs. Las dos primeras pantallas son las
// mismas en EC2 y en VPC (como en la consola real): los enlaces se arman con
// cx.servicio para quedarse en el servicio donde está el alumno.
// ---------------------------------------------------------------------------

import * as ui from '../ui.js';
import {
  asignarEip,
  asociarEip,
  crearGrupoSeguridad,
  crearLlave,
  desasociarEip,
  editarReglasSg,
  eliminarGrupoSeguridad,
  eliminarLlave,
  ErrorAws,
  liberarEip,
  vpcDe
} from '../modelo.js';
import {
  editorReglasSg,
  enlaceRecurso,
  filaDeRegla,
  idBarraNombre,
  idParentesis,
  nombre,
  noExiste,
  opcionesVpc,
  panelVacio,
  pestanaEtiquetas,
  reglaDeFila,
  tablaReglasSg
} from './comun.js';

const { h } = ui;
const base = (cx) => (cx.servicio === 'vpc' ? 'vpc' : 'ec2');
const migaServicio = (cx) => ({ texto: cx.servicio === 'vpc' ? 'VPC' : 'EC2', ruta: cx.servicio === 'vpc' ? 'vpc' : 'ec2' });

/* ====================================================== security groups */

const grupoDe = (cx, id) => cx.estado.gruposSeguridad.find((g) => g.id === id);

function confirmarBorrarGrupos(cx, grupos, alTerminar) {
  cx.confirmar({
    titulo: 'Delete security groups',
    textoBoton: 'Delete',
    contenido: [
      h('p', {}, `Are you sure that you want to delete the following security group${grupos.length > 1 ? 's' : ''}?`),
      h('ul', {}, grupos.map((g) => h('li', {}, `${g.id} - ${g.nombre}`)))
    ],
    palabra: 'delete',
    aceptar: () => {
      const r = cx.hacer({ servicio: 'EC2', accion: 'DeleteSecurityGroup', error: 'Failed to delete security groups' }, (e) => grupos.forEach((g) => eliminarGrupoSeguridad(e, g.id)), { atomico: true });
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: `Successfully deleted ${grupos.length} security group${grupos.length > 1 ? 's' : ''}: ${grupos.map((g) => g.id).join(', ')}` });
        alTerminar?.();
      }
    }
  });
}

function accionesGrupo(cx, grupos, { alBorrar } = {}) {
  const uno = grupos.length === 1 ? grupos[0] : null;
  return [
    { texto: 'View details', desactivado: !uno, alClic: () => cx.ir(`${base(cx)}/grupos/${uno.id}`) },
    { texto: 'Edit inbound rules', desactivado: !uno, escribe: true, alClic: () => cx.ir(`${base(cx)}/grupos/${uno.id}/entrada`) },
    { texto: 'Edit outbound rules', desactivado: !uno, escribe: true, alClic: () => cx.ir(`${base(cx)}/grupos/${uno.id}/salida`) },
    { texto: 'Manage tags', desactivado: true },
    { texto: 'Manage stale rules', desactivado: true },
    '-',
    { texto: 'Copy to new security group', desactivado: true },
    { texto: 'Delete security groups', desactivado: !grupos.length, escribe: true, alClic: () => confirmarBorrarGrupos(cx, grupos, alBorrar) }
  ];
}

function detalleGrupoPares(cx, g) {
  return ui.pares(
    [
      { etiqueta: 'Security group name', valor: g.nombre },
      { etiqueta: 'Security group ID', valor: ui.copiable(g.id) },
      { etiqueta: 'Description', valor: g.descripcion },
      { etiqueta: 'VPC ID', valor: enlaceRecurso(cx, g.vpcId) },
      { etiqueta: 'Owner', valor: ui.copiable(cx.estado.cuenta.id) },
      { etiqueta: 'Inbound rules count', valor: `${g.entrada.length} Permission entr${g.entrada.length === 1 ? 'y' : 'ies'}` },
      { etiqueta: 'Outbound rules count', valor: `${g.salida.length} Permission entr${g.salida.length === 1 ? 'y' : 'ies'}` }
    ],
    { columnas: 4 }
  );
}

function pestanasGrupo(cx, g, st) {
  const editar = (s) => ui.boton(s === 'entrada' ? 'Edit inbound rules' : 'Edit outbound rules', { escribe: true, alClic: () => cx.ir(`${base(cx)}/grupos/${g.id}/${s}`) });
  return ui.pestanas({
    activa: st.pestana,
    alCambiar: (p) => (st.pestana = p),
    pestanas: [
      { id: 'detalles', texto: 'Details', contenido: () => ui.contenedor({ titulo: 'Details', cuerpo: detalleGrupoPares(cx, g) }) },
      { id: 'entrada', texto: 'Inbound rules', contenido: () => tablaReglasSg(cx, g, 'entrada', { acciones: [editar('entrada')] }) },
      { id: 'salida', texto: 'Outbound rules', contenido: () => tablaReglasSg(cx, g, 'salida', { acciones: [editar('salida')] }) },
      { id: 'compartir', texto: 'Sharing - new', desactivada: true, contenido: () => null },
      { id: 'etiquetas', texto: 'Tags', contenido: () => pestanaEtiquetas(cx, g) }
    ]
  });
}

function listaGrupos(cx) {
  cx.migas([migaServicio(cx), { texto: 'Security Groups' }]);
  const st = { pestana: 'detalles' };
  const t = ui.tabla(cx, {
    titulo: 'Security Groups',
    info: 'grupo-seguridad',
    filas: () => cx.estado.gruposSeguridad,
    clave: (g) => g.id,
    seleccion: 'multiple',
    filtro: 'Find security groups by attribute or tag',
    columnas: [
      { titulo: 'Name', valor: () => '–', editable: true },
      { titulo: 'Security group ID', valor: (g) => ui.enlace(g.id, `${base(cx)}/grupos/${g.id}`, { cx }) },
      { titulo: 'Security group name', valor: (g) => g.nombre },
      { titulo: 'VPC ID', valor: (g) => enlaceRecurso(cx, g.vpcId) },
      { titulo: 'Description', valor: (g) => g.descripcion },
      { titulo: 'Owner', valor: () => cx.estado.cuenta.id },
      { titulo: 'Inbound rules count', valor: (g) => `${g.entrada.length} Permission entr${g.entrada.length === 1 ? 'y' : 'ies'}` },
      { titulo: 'Outbound rules count', valor: (g) => `${g.salida.length} Permission entr${g.salida.length === 1 ? 'y' : 'ies'}` }
    ],
    acciones: (sel) => [
      ui.menuBoton('Actions', () => accionesGrupo(cx, sel, { alBorrar: () => t.seleccionar([]) })),
      ui.boton('Export security groups to CSV', { desactivado: true }),
      ui.boton('Create security group', { variante: 'primario', alClic: () => cx.ir(`${base(cx)}/grupos/crear`) })
    ],
    vacio: { titulo: 'No security groups', texto: 'You don’t have any security groups.' },
    alSeleccionar: () => panel.repintar()
  });
  const panel = cx.vivo(() => {
    const sel = t.seleccion();
    if (sel.length !== 1) return panelVacio(sel.length ? `${sel.length} security groups selected` : 'Select a security group');
    const g = sel[0];
    return ui.panelInferior({ titulo: `${g.id} - ${g.nombre}`, contenido: pestanasGrupo(cx, g, st) });
  });
  return h('div', { class: 'cx-pagina' }, t, panel);
}

function detalleGrupo(cx, { id }) {
  const g0 = grupoDe(cx, id);
  cx.migas([migaServicio(cx), { texto: 'Security Groups', ruta: `${base(cx)}/grupos` }, { texto: id }]);
  if (!g0) return noExiste(cx, 'Security group', id, `${base(cx)}/grupos`);
  const st = { pestana: 'entrada' };
  return cx.vivo(() => {
    const g = grupoDe(cx, id);
    if (!g) return noExiste(cx, 'Security group', id, `${base(cx)}/grupos`);
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({ titulo: `${g.id} - ${g.nombre}`, acciones: ui.menuBoton('Actions', () => accionesGrupo(cx, [g], { alBorrar: () => cx.ir(`${base(cx)}/grupos`) })) }),
      ui.contenedor({ titulo: 'Details', cuerpo: detalleGrupoPares(cx, g) }),
      ui.pestanas({
        activa: st.pestana,
        alCambiar: (p) => (st.pestana = p),
        pestanas: [
          { id: 'entrada', texto: 'Inbound rules', contenido: () => tablaReglasSg(cx, g, 'entrada', { acciones: [ui.boton('Manage tags', { desactivado: true }), ui.boton('Edit inbound rules', { escribe: true, alClic: () => cx.ir(`${base(cx)}/grupos/${g.id}/entrada`) })] }) },
          { id: 'salida', texto: 'Outbound rules', contenido: () => tablaReglasSg(cx, g, 'salida', { acciones: [ui.boton('Edit outbound rules', { escribe: true, alClic: () => cx.ir(`${base(cx)}/grupos/${g.id}/salida`) })] }) },
          { id: 'compartir', texto: 'Sharing - new', desactivada: true, contenido: () => null },
          { id: 'etiquetas', texto: 'Tags', contenido: () => pestanaEtiquetas(cx, g) }
        ]
      })
    );
  });
}

function editarReglas(sentido) {
  return (cx, { id }) => {
    const g = grupoDe(cx, id);
    const titulo = sentido === 'entrada' ? 'Edit inbound rules' : 'Edit outbound rules';
    cx.migas([migaServicio(cx), { texto: 'Security Groups', ruta: `${base(cx)}/grupos` }, { texto: id, ruta: `${base(cx)}/grupos/${id}` }, { texto: titulo }]);
    if (!g) return noExiste(cx, 'Security group', id, `${base(cx)}/grupos`);
    const filas = g[sentido].map((r) => filaDeRegla(r, cx.estado.cuenta.ipCasa));
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({
        titulo,
        info: sentido === 'entrada' ? 'reglas-sg' : 'reglas-salida',
        cx,
        descripcion:
          sentido === 'entrada'
            ? 'Inbound rules control the incoming traffic that’s allowed to reach the instance.'
            : 'Outbound rules control the outgoing traffic that’s allowed to leave the instance.'
      }),
      ui.contenedor({ titulo: sentido === 'entrada' ? 'Inbound rules' : 'Outbound rules', info: 'reglas-sg', cx, cuerpo: editorReglasSg(cx, { filas, vpcId: g.vpcId, sentido }) }),
      ui.pieFormulario({
        cancelar: () => cx.ir(`${base(cx)}/grupos/${id}`),
        extra: ui.boton('Preview changes', { desactivado: true }),
        textoEnviar: 'Save rules',
        enviar: () => {
          const r = cx.hacer(
            { servicio: 'EC2', accion: sentido === 'entrada' ? 'ModifySecurityGroupRules (inbound)' : 'ModifySecurityGroupRules (outbound)', error: `There was an error modifying the ${sentido === 'entrada' ? 'inbound' : 'outbound'} rules` },
            (e) => editarReglasSg(e, id, sentido, filas.map(reglaDeFila))
          );
          if (r.ok) {
            cx.flash({ tipo: 'exito', texto: `${sentido === 'entrada' ? 'Inbound' : 'Outbound'} security group rules successfully modified on security group (${id} | ${g.nombre})` });
            cx.ir(`${base(cx)}/grupos/${id}`);
          }
        }
      })
    );
  };
}

function crearGrupo(cx) {
  cx.migas([migaServicio(cx), { texto: 'Security Groups', ruta: `${base(cx)}/grupos` }, { texto: 'Create security group' }]);
  const vpcDef = cx.estado.vpcs.find((v) => v.porDefecto) ?? cx.estado.vpcs[0];
  const f = { nombre: '', descripcion: '', vpcId: vpcDef?.id ?? null, entrada: [], salida: [{ tipo: 'All traffic', puertos: '', origenTipo: 'custom', origen: '0.0.0.0/0', descripcion: '' }], etiquetas: [], errores: {} };
  const basicos = ui.region(() =>
    ui.contenedor({
      titulo: 'Basic details',
      cuerpo: h(
        'div',
        { class: 'cx-form', style: { maxWidth: '700px' } },
        ui.campo({
          etiqueta: 'Security group name',
          info: 'grupo-seguridad',
          cx,
          control: ui.entrada({ valor: f.nombre, placeholder: 'MyWebServerGroup', alCambiar: (v) => (f.nombre = v) }),
          error: f.errores.nombre,
          restriccion: 'Name cannot be edited after creation.'
        }),
        ui.campo({
          etiqueta: 'Description',
          info: 'grupo-seguridad',
          cx,
          control: ui.entrada({ valor: f.descripcion, placeholder: 'Allows SSH access to developers', alCambiar: (v) => (f.descripcion = v) }),
          error: f.errores.descripcion
        }),
        ui.campo({
          etiqueta: 'VPC',
          info: 'vpc',
          cx,
          control: ui.selector({
            opciones: opcionesVpc(cx.estado),
            valor: f.vpcId,
            filtrar: true,
            alCambiar: (v) => {
              f.vpcId = v;
              // Las reglas que apuntan a grupos de otra VPC ya no sirven.
              f.entrada.forEach((r) => String(r.origen).startsWith('sg-') && (r.origen = ''));
              reglas.repintar();
            }
          })
        })
      )
    })
  );
  const reglas = ui.region(() => [
    ui.contenedor({ titulo: 'Inbound rules', info: 'reglas-sg', cx, cuerpo: editorReglasSg(cx, { filas: f.entrada, vpcId: f.vpcId, sentido: 'entrada' }) }),
    h('div', { style: { height: '20px' } }),
    ui.contenedor({ titulo: 'Outbound rules', info: 'reglas-salida', cx, cuerpo: editorReglasSg(cx, { filas: f.salida, vpcId: f.vpcId, sentido: 'salida' }) })
  ]);
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({
      titulo: 'Create security group',
      info: 'grupo-seguridad',
      cx,
      descripcion: 'A security group acts as a virtual firewall for your instance to control inbound and outbound traffic. To create a new security group, complete the fields below.'
    }),
    basicos,
    reglas,
    ui.contenedor({ titulo: 'Tags - optional', descripcion: 'A tag is a label that you assign to an AWS resource. Each tag consists of a key and an optional value.', cuerpo: ui.editorEtiquetas({ filas: f.etiquetas }) }),
    ui.pieFormulario({
      cancelar: () => cx.ir(`${base(cx)}/grupos`),
      textoEnviar: 'Create security group',
      enviar: () => {
        // Lo que la consola real revisa en el navegador antes de llamar a AWS.
        const n = f.nombre.trim();
        f.errores = {
          nombre: !n ? 'Security group name is required' : /^sg-/i.test(n) ? 'A security group name cannot begin with sg-' : null,
          descripcion: !f.descripcion.trim() ? 'A security group description is required' : null
        };
        basicos.repintar();
        if (f.errores.nombre || f.errores.descripcion) return;
        const r = cx.hacer({ servicio: 'EC2', accion: 'CreateSecurityGroup', error: 'Failed to create security group' }, (e) =>
          crearGrupoSeguridad(e, { nombre: n, descripcion: f.descripcion, vpcId: f.vpcId, entrada: f.entrada.map(reglaDeFila), salida: f.salida.map(reglaDeFila) })
        );
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: `Security group (${r.valor.id} | ${r.valor.nombre}) was created successfully` });
          cx.ir(`${base(cx)}/grupos/${r.valor.id}`);
        }
      }
    })
  );
}

export const rutasGrupos = {
  grupos: listaGrupos,
  'grupos/crear': crearGrupo,
  'grupos/:id': detalleGrupo,
  'grupos/:id/entrada': editarReglas('entrada'),
  'grupos/:id/salida': editarReglas('salida')
};

/* =========================================================== elastic IPs */

const asociacionId = (eip) => `eipassoc-${eip.id.slice(9)}`;
const eipDe = (cx, id) => cx.estado.eips.find((e) => e.id === id);

function eipAsociado(cx, eip) {
  if (eip.instanciaId) return enlaceRecurso(cx, eip.instanciaId);
  if (eip.natId) return enlaceRecurso(cx, eip.natId);
  return '–';
}

function privadaDeEip(cx, eip) {
  return cx.estado.instancias.find((i) => i.id === eip.instanciaId)?.ipPrivada ?? '–';
}

function accionesEip(cx, sel, alTerminar) {
  const uno = sel.length === 1 ? sel[0] : null;
  return [
    { texto: 'View details', desactivado: !uno, alClic: () => cx.ir(`${base(cx)}/eips/${uno.id}`) },
    {
      texto: 'Release Elastic IP addresses',
      escribe: true,
      desactivado: !sel.length,
      alClic: () =>
        cx.confirmar({
          titulo: 'Release Elastic IP addresses',
          textoBoton: 'Release',
          contenido: [
            h('p', {}, 'Are you sure that you want to release the following Elastic IP addresses? Once released, you can’t use these addresses with your account.'),
            h('ul', {}, sel.map((e) => h('li', {}, `${e.ip} (${e.id})`)))
          ],
          aceptar: () => {
            const r = cx.hacer({ servicio: 'EC2', accion: 'ReleaseAddress', error: 'Failed to release Elastic IP addresses' }, (e) => sel.forEach((x) => liberarEip(e, x.id)), { atomico: true });
            if (r.ok) {
              cx.flash({ tipo: 'exito', texto: `Elastic IP address${sel.length > 1 ? 'es' : ''} released successfully.` });
              alTerminar?.();
            }
          }
        })
    },
    { texto: 'Associate Elastic IP address', escribe: true, desactivado: !uno, alClic: () => cx.ir(`${base(cx)}/eips/${uno.id}/asociar`) },
    {
      texto: 'Disassociate Elastic IP address',
      escribe: true,
      desactivado: !uno || !uno.instanciaId,
      alClic: () =>
        cx.confirmar({
          titulo: 'Disassociate Elastic IP address',
          textoBoton: 'Disassociate',
          contenido: [
            h('p', {}, 'Are you sure that you want to disassociate the following Elastic IP address?'),
            ui.pares([
              { etiqueta: 'Elastic IP address', valor: uno.ip },
              { etiqueta: 'Instance', valor: uno.instanciaId },
              { etiqueta: 'Association ID', valor: asociacionId(uno) }
            ])
          ],
          aceptar: () => {
            const r = cx.hacer({ servicio: 'EC2', accion: 'DisassociateAddress', error: 'Failed to disassociate Elastic IP address' }, (e) => desasociarEip(e, uno.id));
            if (r.ok) cx.flash({ tipo: 'exito', texto: 'Elastic IP address disassociated successfully.' });
          }
        })
    },
    { texto: 'Update reverse DNS', desactivado: true },
    { texto: 'Manage tags', desactivado: true }
  ];
}

function paresEip(cx, eip) {
  return ui.pares(
    [
      { etiqueta: 'Allocated IPv4 address', valor: ui.copiable(eip.ip) },
      { etiqueta: 'Type', valor: 'Public IP' },
      { etiqueta: 'Allocation ID', valor: ui.copiable(eip.id) },
      { etiqueta: 'Associated instance ID', valor: eip.instanciaId ? enlaceRecurso(cx, eip.instanciaId) : '–' },
      { etiqueta: 'Private IP address', valor: privadaDeEip(cx, eip) },
      { etiqueta: 'Association ID', valor: eip.instanciaId ? asociacionId(eip) : '–' },
      { etiqueta: 'NAT Gateway ID', valor: eip.natId ? enlaceRecurso(cx, eip.natId) : '–' },
      { etiqueta: 'Network border group', valor: 'us-east-1' },
      { etiqueta: 'Public DNS', valor: `ec2-${eip.ip.replace(/\./g, '-')}.compute-1.amazonaws.com` },
      { etiqueta: 'Address pool', valor: 'Amazon' }
    ],
    { columnas: 4 }
  );
}

function listaEips(cx) {
  cx.migas([migaServicio(cx), { texto: 'Elastic IP addresses' }]);
  const t = ui.tabla(cx, {
    titulo: 'Elastic IP addresses',
    info: 'eip',
    filas: () => cx.estado.eips,
    clave: (e) => e.id,
    seleccion: 'multiple',
    filtro: 'Find Elastic IP address by attribute or tag',
    columnas: [
      { titulo: 'Name', valor: (e) => nombre(e), editable: true },
      { titulo: 'Allocated IPv4 address', valor: (e) => ui.enlace(e.ip, `${base(cx)}/eips/${e.id}`, { cx }) },
      { titulo: 'Type', valor: () => 'Public IP' },
      { titulo: 'Allocation ID', valor: (e) => e.id },
      { titulo: 'Reverse DNS record', valor: () => '–' },
      { titulo: 'Associated instance ID', valor: (e) => (e.instanciaId ? enlaceRecurso(cx, e.instanciaId) : '–') },
      { titulo: 'Private IP address', valor: (e) => privadaDeEip(cx, e) },
      { titulo: 'Association ID', valor: (e) => (e.instanciaId || e.natId ? asociacionId(e) : '–') },
      { titulo: 'Network border group', valor: () => 'us-east-1' }
    ],
    acciones: (sel) => [
      ui.menuBoton('Actions', () => accionesEip(cx, sel, () => t.seleccionar([]))),
      ui.boton('Allocate Elastic IP address', { variante: 'primario', alClic: () => cx.ir(`${base(cx)}/eips/asignar`) })
    ],
    vacio: { titulo: 'No Elastic IP addresses found in this Region', accion: ui.boton('Allocate Elastic IP address', { escribe: true, alClic: () => cx.ir(`${base(cx)}/eips/asignar`) }) },
    alSeleccionar: () => panel.repintar()
  });
  const panel = cx.vivo(() => {
    const sel = t.seleccion();
    if (sel.length !== 1) return panelVacio('Select an Elastic IP address');
    return ui.panelInferior({ titulo: `${sel[0].ip}`, contenido: ui.contenedor({ titulo: 'Summary', cuerpo: paresEip(cx, sel[0]) }) });
  });
  return h('div', { class: 'cx-pagina' }, t, panel);
}

function detalleEip(cx, { id }) {
  cx.migas([migaServicio(cx), { texto: 'Elastic IP addresses', ruta: `${base(cx)}/eips` }, { texto: id }]);
  if (!eipDe(cx, id)) return noExiste(cx, 'Elastic IP address', id, `${base(cx)}/eips`);
  return cx.vivo(() => {
    const e = eipDe(cx, id);
    if (!e) return noExiste(cx, 'Elastic IP address', id, `${base(cx)}/eips`);
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({ titulo: e.ip, acciones: ui.menuBoton('Actions', () => accionesEip(cx, [e], () => cx.ir(`${base(cx)}/eips`))) }),
      ui.contenedor({ titulo: 'Summary', cuerpo: paresEip(cx, e) })
    );
  });
}

function asignar(cx) {
  cx.migas([migaServicio(cx), { texto: 'Elastic IP addresses', ruta: `${base(cx)}/eips` }, { texto: 'Allocate Elastic IP address' }]);
  const etiquetas = [];
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Allocate Elastic IP address', info: 'eip', cx, descripcion: 'Allocate an Elastic IP address by selecting the public IPv4 address pool from which the public IP address is to be allocated.' }),
    ui.contenedor({
      titulo: 'Elastic IP address settings',
      info: 'eip',
      cx,
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({ etiqueta: 'Network border group', control: ui.selector({ opciones: [{ valor: 'us-east-1', etiqueta: 'us-east-1' }], valor: 'us-east-1', desactivado: true }) }),
        ui.campo({
          etiqueta: 'Public IPv4 address pool',
          control: ui.radios({
            valor: 'amazon',
            opciones: [
              { valor: 'amazon', etiqueta: 'Amazon’s pool of IPv4 addresses' },
              { valor: 'propio', etiqueta: 'Public IPv4 address that you bring to your AWS account', desactivado: true },
              { valor: 'cliente', etiqueta: 'Customer owned pool of IPv4 addresses', desactivado: true },
              { valor: 'ipam', etiqueta: 'Allocate using an IPv4 IPAM pool', desactivado: true }
            ]
          })
        })
      )
    }),
    ui.contenedor({ titulo: 'Tags - optional', cuerpo: ui.editorEtiquetas({ filas: etiquetas }) }),
    ui.pieFormulario({
      cancelar: () => cx.ir(`${base(cx)}/eips`),
      textoEnviar: 'Allocate',
      enviar: () => {
        const r = cx.hacer({ servicio: 'EC2', accion: 'AllocateAddress', error: 'Failed to allocate Elastic IP address' }, (e) => asignarEip(e, { nombre: ui.nombreDeEtiquetas(etiquetas) }));
        if (r.ok) {
          const eip = r.valor;
          cx.flash({
            tipo: 'exito',
            titulo: 'Elastic IP address allocated successfully.',
            texto: `Elastic IP address ${eip.ip}`,
            accion: { texto: 'Associate this Elastic IP address', alClic: () => cx.ir(`${base(cx)}/eips/${eip.id}/asociar`) }
          });
          cx.ir(`${base(cx)}/eips`);
        }
      }
    })
  );
}

function asociar(cx, { id }) {
  cx.migas([migaServicio(cx), { texto: 'Elastic IP addresses', ruta: `${base(cx)}/eips` }, { texto: id, ruta: `${base(cx)}/eips/${id}` }, { texto: 'Associate Elastic IP address' }]);
  const eip = eipDe(cx, id);
  if (!eip) return noExiste(cx, 'Elastic IP address', id, `${base(cx)}/eips`);
  const f = { instanciaId: null, reasociar: false, error: null };
  const formulario = ui.region(() => {
    const inst = cx.estado.instancias.find((i) => i.id === f.instanciaId);
    return h(
      'div',
      { class: 'cx-form' },
      ui.campo({
        etiqueta: 'Resource type',
        descripcion: 'Choose the type of resource with which to associate the Elastic IP address.',
        control: ui.radios({ valor: 'instancia', opciones: [{ valor: 'instancia', etiqueta: 'Instance' }, { valor: 'eni', etiqueta: 'Network interface', desactivado: true }] })
      }),
      ui.alerta({ tipo: 'info', contenido: 'If you associate an Elastic IP address to an instance that already has an Elastic IP address associated, this previously associated Elastic IP address will be disassociated but still allocated to your account.' }),
      ui.campo({
        etiqueta: 'Instance',
        control: ui.selector({
          opciones: cx.estado.instancias.filter((i) => i.estado !== 'terminated').map((i) => ({ valor: i.id, etiqueta: i.id, descripcion: `${i.nombre || ''} ${i.estado}`.trim() })),
          valor: f.instanciaId,
          filtrar: true,
          placeholder: 'Choose an instance',
          alCambiar: (v) => {
            f.instanciaId = v;
            f.error = null;
            formulario.repintar();
          }
        }),
        error: f.error
      }),
      ui.campo({
        etiqueta: 'Private IP address',
        opcional: true,
        descripcion: 'The private IP address with which to associate the Elastic IP address.',
        control: ui.selector({ opciones: inst ? [{ valor: inst.ipPrivada, etiqueta: inst.ipPrivada }] : [], valor: inst?.ipPrivada ?? null, placeholder: 'Choose a private IP address', desactivado: !inst })
      }),
      ui.campo({
        etiqueta: 'Reassociation',
        descripcion: 'Specify whether the Elastic IP address can be reassociated with a different resource if it already associated with a resource.',
        control: ui.casilla({ etiqueta: 'Allow this Elastic IP address to be reassociated', marcada: f.reasociar, alCambiar: (v) => (f.reasociar = v) })
      })
    );
  });
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Associate Elastic IP address', info: 'eip', cx, descripcion: 'Choose the instance or network interface to associate to this Elastic IP address' }),
    ui.contenedor({ titulo: 'Elastic IP address: ' + eip.ip, cuerpo: formulario }),
    ui.pieFormulario({
      cancelar: () => cx.ir(`${base(cx)}/eips`),
      textoEnviar: 'Associate',
      enviar: () => {
        if (!f.instanciaId) {
          f.error = 'Instance is required';
          return formulario.repintar();
        }
        const r = cx.hacer({ servicio: 'EC2', accion: 'AssociateAddress', error: 'Failed to associate Elastic IP address' }, (e) => {
          const x = e.eips.find((z) => z.id === id);
          if (x?.instanciaId && x.instanciaId !== f.instanciaId && !f.reasociar) {
            throw new ErrorAws('Resource.AlreadyAssociated', `resource ${id} is already associated with associate-id ${asociacionId(x)}`);
          }
          return asociarEip(e, id, f.instanciaId);
        });
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: `Elastic IP address associated successfully. Elastic IP address ${eip.ip} has been associated with instance ${f.instanciaId}` });
          cx.ir(`${base(cx)}/eips`);
        }
      }
    })
  );
}

export const rutasEips = {
  eips: listaEips,
  'eips/asignar': asignar,
  'eips/:id': detalleEip,
  'eips/:id/asociar': asociar
};

/* ============================================================== key pairs */

/** El formulario de «Create key pair» (página o modal del asistente de lanzamiento). */
export function formularioLlave(cx, f) {
  return h(
    'div',
    { class: 'cx-form' },
    ui.campo({
      etiqueta: 'Key pair name',
      info: 'par-llaves',
      cx,
      descripcion: 'Key pairs allow you to connect to your instance securely.',
      control: ui.entrada({ valor: f.nombre, placeholder: 'Enter key pair name', alCambiar: (v) => (f.nombre = v) }),
      error: f.error,
      restriccion: 'The name can include up to 255 ASCII characters. It can’t include leading or trailing spaces.'
    }),
    ui.campo({
      etiqueta: 'Key pair type',
      info: 'par-llaves',
      cx,
      control: ui.radios({ valor: f.tipo, alCambiar: (v) => (f.tipo = v), opciones: [{ valor: 'rsa', etiqueta: 'RSA', descripcion: 'RSA encrypted private and public key pair' }, { valor: 'ed25519', etiqueta: 'ED25519', descripcion: 'ED25519 encrypted private and public key pair' }] })
    }),
    ui.campo({
      etiqueta: 'Private key file format',
      control: ui.radios({ valor: f.formato, alCambiar: (v) => (f.formato = v), opciones: [{ valor: 'pem', etiqueta: '.pem', descripcion: 'For use with OpenSSH' }, { valor: 'ppk', etiqueta: '.ppk', descripcion: 'For use with PuTTY' }] })
    })
  );
}

/** Crea la llave y «descarga» el archivo (en el simulador solo se avisa). Devuelve la llave o null. */
export function crearLlaveYDescargar(cx, f) {
  if (!f.nombre.trim()) {
    f.error = 'Key pair name is required';
    return null;
  }
  const r = cx.hacer({ servicio: 'EC2', accion: 'CreateKeyPair', error: 'Failed to create key pair' }, (e) => crearLlave(e, { nombre: f.nombre, tipo: f.tipo, formato: f.formato }));
  if (!r.ok) return null;
  cx.flash({
    tipo: 'exito',
    titulo: `Successfully created key pair`,
    texto: `Tu navegador habría descargado ${r.valor.nombre}.${r.valor.formato}. En AWS real guárdalo bien: es la única vez que puedes bajarlo.`
  });
  return r.valor;
}

function listaLlaves(cx) {
  cx.migas([migaServicio(cx), { texto: 'Key pairs' }]);
  const t = ui.tabla(cx, {
    titulo: 'Key pairs',
    info: 'par-llaves',
    filas: () => cx.estado.llaves,
    clave: (k) => k.nombre,
    seleccion: 'multiple',
    filtro: 'Find Key Pair by attribute or tag',
    columnas: [
      { titulo: 'Name', valor: (k) => k.nombre },
      { titulo: 'Type', valor: (k) => k.tipo },
      { titulo: 'Created', valor: (k) => ui.fecha(k.creado) },
      { titulo: 'Fingerprint', valor: (k) => h('span', { class: 'cx-mono' }, k.huella) },
      { titulo: 'ID', valor: (k) => k.id }
    ],
    acciones: (sel) => [
      ui.menuBoton('Actions', () => [
        { texto: 'Import key pair', desactivado: true },
        { texto: 'Manage tags', desactivado: true },
        {
          texto: 'Delete',
          escribe: true,
          desactivado: !sel.length,
          alClic: () =>
            cx.confirmar({
              titulo: `Delete ${sel.map((k) => k.nombre).join(', ')}?`,
              textoBoton: 'Delete',
              palabra: 'Delete',
              contenido: h('p', {}, 'Are you sure that you want to delete these key pairs? Instances that use them keep working, but you won’t be able to launch new instances with them.'),
              aceptar: () => {
                const r = cx.hacer({ servicio: 'EC2', accion: 'DeleteKeyPair', error: 'Failed to delete key pairs' }, (e) => sel.forEach((k) => eliminarLlave(e, k.nombre)), { atomico: true });
                if (r.ok) {
                  cx.flash({ tipo: 'exito', texto: `Successfully deleted ${sel.length} key pair${sel.length > 1 ? 's' : ''}` });
                  t.seleccionar([]);
                }
              }
            })
        }
      ]),
      ui.boton('Create key pair', { variante: 'primario', alClic: () => cx.ir('ec2/llaves/crear') })
    ],
    vacio: { titulo: 'No key pairs to display', accion: ui.boton('Create key pair', { escribe: true, alClic: () => cx.ir('ec2/llaves/crear') }) }
  });
  return h('div', { class: 'cx-pagina' }, t);
}

function crearLlavePagina(cx) {
  cx.migas([migaServicio(cx), { texto: 'Key pairs', ruta: 'ec2/llaves' }, { texto: 'Create key pair' }]);
  const f = { nombre: '', tipo: 'rsa', formato: 'pem', error: null, etiquetas: [] };
  const form = ui.region(() => formularioLlave(cx, f));
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Create key pair', info: 'par-llaves', cx }),
    ui.contenedor({ titulo: 'Key pair', info: 'par-llaves', cx, descripcion: 'A key pair, consisting of a private key and a public key, is a set of security credentials that you use to prove your identity when connecting to an instance.', cuerpo: form }),
    ui.contenedor({ titulo: 'Tags - optional', cuerpo: ui.editorEtiquetas({ filas: f.etiquetas }) }),
    ui.pieFormulario({
      cancelar: () => cx.ir('ec2/llaves'),
      textoEnviar: 'Create key pair',
      enviar: () => {
        const k = crearLlaveYDescargar(cx, f);
        if (k) cx.ir('ec2/llaves');
        else form.repintar();
      }
    })
  );
}

export const rutasLlaves = {
  llaves: listaLlaves,
  'llaves/crear': crearLlavePagina
};

export { vpcDe, idBarraNombre, idParentesis };
