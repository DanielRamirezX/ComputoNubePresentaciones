// ---------------------------------------------------------------------------
// AWS ORGANIZATIONS
//
// Create an organization, el árbol de AWS accounts (Root → OU → cuentas) con
// Add an AWS account (Create / Invite), Move, Remove y Close; las OU (Create
// new, Rename, Delete); Policies → Service control policies (Enable, Create
// policy con editor JSON validado, Attach / Detach, FullAWSAccess); las
// invitaciones y Settings con la facturación consolidada. Un recuadro propio
// del simulador («Probar una acción») explica el «explicit deny» de las SCP.
// ---------------------------------------------------------------------------

import * as ui from '../ui.js';
import {
  accionPermitidaPorScp,
  adjuntarPoliticaScp,
  cancelarInvitacionOrganizacion,
  cerrarCuentaOrganizacion,
  clonar,
  crearCuentaOrganizacion,
  crearOrganizacion,
  crearPoliticaScp,
  crearUnidadOrganizativa,
  desadjuntarPoliticaScp,
  deshabilitarScp,
  editarPoliticaScp,
  eliminarOrganizacion,
  eliminarPoliticaScp,
  eliminarUnidadOrganizativa,
  facturacionConsolidada,
  FULL_AWS_ACCESS,
  habilitarScp,
  hijosOrganizacion,
  invitarCuentaOrganizacion,
  moverCuentaOrganizacion,
  objetivoOrganizacion,
  politicasDeObjetivo,
  politicasHeredadas,
  quitarCuentaOrganizacion,
  renombrarUnidadOrganizativa,
  revisarDocumentoScp,
  rutaOrganizacion
} from '../modelo.js';

const { h, icono } = ui;

/* ================================================================ ayudas */

const migasOrg = (cx, ...resto) => cx.migas([{ texto: 'AWS Organizations', ruta: 'organizations' }, ...resto]);
const org = (cx) => cx.estado.organizations ?? null;

/** Corre una acción del modelo sobre una copia: devuelve el mensaje de error o null (no cambia nada). */
function probar(cx, fn) {
  try {
    fn(clonar(cx.estado));
    return null;
  } catch (e) {
    return e?.message ?? String(e);
  }
}

const errorCampo = (texto) => (texto ? h('div', { class: 'cx-campo__error', role: 'alert' }, icono('status-negative'), h('span', {}, texto)) : null);

const TIPO_OBJETIVO = { ROOT: 'Root', ORGANIZATIONAL_UNIT: 'Organizational unit', ACCOUNT: 'Account' };

/** La ruta del detalle de un objetivo (raíz, OU o cuenta). */
const rutaObjetivo = (id) => (String(id).startsWith('r-') || String(id).startsWith('ou-') ? `organizations/ous/${id}` : `organizations/cuentas/${id}`);

// Íconos propios (SVG constante: no llevan datos del alumno).
const GLIFOS = {
  carpeta: '<path d="M1.5 3.5h4.5l1.5 1.5h7v8.5h-13z" stroke-linejoin="round"/>',
  raiz: '<path d="M1.5 3.5h4.5l1.5 1.5h7v8.5h-13z" stroke-linejoin="round"/><path d="M5.5 10.5h5"/>',
  cuenta: '<rect x="2" y="2" width="12" height="12" rx="2"/><circle cx="8" cy="6.5" r="2"/><path d="M4.5 12c.6-1.7 2-2.5 3.5-2.5s2.9.8 3.5 2.5"/>'
};
function iconoOrg(tipo) {
  const span = document.createElement('span');
  span.className = `cx-icono cx-org-icono cx-org-icono--${tipo}`;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">${GLIFOS[tipo] ?? ''}</svg>`;
  return span;
}

function estadoCuenta(c) {
  if (c.estado === 'CREATING') return ui.estado('pendiente', 'Creating');
  if (c.estado === 'SUSPENDED') return ui.estado('detenido', 'Suspended');
  return ui.estado('exito', 'Active');
}

const metodoTexto = (c) => (c.metodo === 'INVITED' ? 'Invited' : 'Created');

/** Si no hay organización, cualquier pantalla muestra la portada. */
const conOrg = (pantalla) => (cx, p) => (org(cx) ? pantalla(cx, p) : portada(cx));

function noEncontrado(cx, tipo, id, ruta) {
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.alerta({ tipo: 'error', titulo: `${tipo} not found`, contenido: [`We can't find the ${tipo.toLowerCase()} ${id} in this organization. `, ui.enlace('View AWS accounts', ruta, { cx })] })
  );
}

/* ================================================================ portada */

function portada(cx) {
  migasOrg(cx, { texto: 'Get started' });
  const crear = () => {
    const r = cx.hacer({ servicio: 'Organizations', accion: 'CreateOrganization', error: 'Failed to create organization' }, (e) => crearOrganizacion(e));
    if (r.ok) {
      cx.flash({ tipo: 'exito', titulo: 'You successfully created an organization', texto: `Your account ${r.valor.cuentaAdmin} is now the management account of ${r.valor.id}. You can now add AWS accounts and organize them into organizational units.` });
      cx.ir('organizations/cuentas');
    }
  };
  return h(
    'div',
    { class: 'cx-pagina cx-org-portada' },
    h(
      'div',
      { class: 'cx-org-heroe' },
      h('p', { class: 'cx-texto-sec' }, 'Management & Governance'),
      h('h1', { class: 'cx-org-heroe__titulo' }, 'AWS Organizations'),
      h('p', { class: 'cx-org-heroe__lema' }, 'Centrally manage and govern your environment as you grow and scale your AWS resources.')
    ),
    h(
      'div',
      { class: 'cx-dos-columnas' },
      h(
        'div',
        { class: 'cx-pagina' },
        ui.contenedor({
          titulo: 'How it works',
          info: 'org-organizacion',
          cx,
          cuerpo: h(
            'ol',
            { class: 'cx-org-pasos' },
            [
              ['Create an organization', 'Your current account becomes the management account. AWS Organizations creates the root of your organization.'],
              ['Add AWS accounts', 'Create new accounts or invite existing accounts, and group them into organizational units (OUs).'],
              ['Apply policies', 'Use service control policies (SCPs) to set the maximum available permissions for the accounts in an OU.'],
              ['Pay with one bill', 'Consolidated billing combines the usage of all accounts in one bill, so you can share volume pricing discounts.']
            ].map(([t, d], i) => h('li', {}, h('span', { class: 'cx-org-pasos__n' }, String(i + 1)), h('div', {}, h('strong', {}, t), h('p', { class: 'cx-texto-sec' }, d))))
          )
        })
      ),
      h(
        'div',
        { class: 'cx-lado' },
        ui.contenedor({
          titulo: 'Create an organization',
          cuerpo: h(
            'div',
            { class: 'cx-form' },
            h('p', {}, 'Create an organization to centrally manage multiple AWS accounts. The account you are signed in to becomes the management account.'),
            ui.boton('Create an organization', { variante: 'primario', alClic: crear })
          )
        }),
        ui.contenedor({ titulo: 'Pricing', cuerpo: h('p', {}, 'AWS Organizations is offered at no additional charge.') })
      )
    )
  );
}

/* ============================================================ el árbol */

/**
 * El árbol de la organización: Root → OU → cuentas. `elegidos` es un Set de
 * ids que el árbol cambia; `alCambiar()` se llama después de cada clic.
 *   tipo: 'casilla' | 'radio' | null, cuentas: bool (mostrar cuentas),
 *   desactivar(obj) → true para apagar una fila, filtro: texto.
 */
function arbol(cx, { elegidos, alCambiar, tipo = 'casilla', cuentas = true, desactivar = () => false, filtro = '', enlaces = true }) {
  const o = org(cx);
  cx.memoria.orgCerradas ??= [];
  const cerradas = new Set(cx.memoria.orgCerradas);
  const t = filtro.trim().toLowerCase();
  const coincideCuenta = (c) => !t || `${c.nombre} ${c.id} ${c.correo}`.toLowerCase().includes(t);
  // Una OU se ve si coincide su nombre o si tiene una cuenta que coincide dentro.
  const visible = (id) => {
    const obj = objetivoOrganizacion(cx.estado, id);
    if (!t || (obj && obj.tipo !== 'ACCOUNT' && obj.nombre.toLowerCase().includes(t))) return true;
    const hijos = hijosOrganizacion(cx.estado, id);
    return hijos.cuentas.some(coincideCuenta) || hijos.ous.some((x) => visible(x.id));
  };
  const filas = [];
  const fila = (obj, nivel) => {
    const esCuenta = obj.tipo === 'ACCOUNT';
    const hijos = esCuenta ? { ous: [], cuentas: [] } : hijosOrganizacion(cx.estado, obj.id);
    const cuantos = hijos.ous.length + (cuentas ? hijos.cuentas.length : 0);
    const abierta = !cerradas.has(obj.id) || Boolean(t);
    const apagada = desactivar(obj);
    const elegida = elegidos.has(obj.id);
    const control = tipo
      ? h('input', {
          type: tipo === 'radio' ? 'radio' : 'checkbox',
          name: tipo === 'radio' ? 'cx-org-destino' : undefined,
          checked: elegida,
          disabled: apagada,
          'aria-label': `Select ${obj.nombre}`,
          onchange: (e) => {
            if (tipo === 'radio') elegidos.clear();
            if (e.target.checked) elegidos.add(obj.id);
            else elegidos.delete(obj.id);
            alCambiar?.();
          }
        })
      : null;
    const flecha = !esCuenta && cuantos
      ? h(
          'button',
          {
            type: 'button',
            class: 'cx-org-flecha',
            'aria-label': abierta ? `Collapse ${obj.nombre}` : `Expand ${obj.nombre}`,
            'aria-expanded': String(abierta),
            onclick: () => {
              if (cerradas.has(obj.id)) cerradas.delete(obj.id);
              else cerradas.add(obj.id);
              cx.memoria.orgCerradas = [...cerradas];
              alCambiar?.();
            }
          },
          icono(abierta ? 'caret-down' : 'caret-right')
        )
      : h('span', { class: 'cx-org-flecha cx-org-flecha--vacia' });
    const c = obj.recurso;
    const nombre = enlaces && !apagada ? ui.enlace(obj.nombre, rutaObjetivo(obj.id), { cx }) : h('span', { class: 'cx-org-nombre-texto' }, obj.nombre);
    filas.push(
      h(
        'div',
        { class: ['cx-org-fila', elegida && 'cx-org-fila--elegida', apagada && 'cx-org-fila--apagada'], style: { paddingLeft: `${12 + nivel * 26}px` }, role: 'treeitem', 'aria-level': String(nivel + 1) },
        h('span', { class: 'cx-org-control' }, control),
        flecha,
        iconoOrg(obj.tipo === 'ROOT' ? 'raiz' : esCuenta ? 'cuenta' : 'carpeta'),
        h(
          'div',
          { class: 'cx-org-nombre' },
          h('div', { class: 'cx-org-nombre__fila' }, nombre, esCuenta && c.admin ? h('span', { class: 'cx-insignia cx-insignia--azul' }, 'management account') : null, esCuenta && c.estado !== 'ACTIVE' ? estadoCuenta(c) : null),
          h(
            'div',
            { class: 'cx-org-meta' },
            esCuenta ? [h('span', { class: 'cx-mono' }, c.id), h('span', {}, c.correo), h('span', {}, `${metodoTexto(c)} ${ui.fecha(c.unida).slice(0, 10)}`)] : [h('span', { class: 'cx-mono' }, obj.id), !abierta && cuantos ? h('span', {}, `${cuantos} item${cuantos === 1 ? '' : 's'}`) : null]
          )
        )
      )
    );
    if (esCuenta || !abierta) return;
    for (const ou of hijos.ous) if (visible(ou.id)) fila(objetivoOrganizacion(cx.estado, ou.id), nivel + 1);
    if (cuentas) for (const cu of hijos.cuentas) if (coincideCuenta(cu)) fila(objetivoOrganizacion(cx.estado, cu.id), nivel + 1);
  };
  fila(objetivoOrganizacion(cx.estado, o.raiz.id), 0);
  return h('div', { class: 'cx-org-arbol', role: 'tree' }, filas.length ? filas : h('p', { class: 'cx-texto-sec cx-org-vacio' }, 'No matches'));
}

/* ============================================================ AWS accounts */

function cuentasPagina(cx) {
  migasOrg(cx, { texto: 'AWS accounts' });
  const elegidos = new Set();
  let vista = cx.memoria.orgVista ?? 'jerarquia';
  let filtro = '';
  const elegidosObj = () => [...elegidos].map((id) => objetivoOrganizacion(cx.estado, id)).filter(Boolean);

  const acciones = () => {
    const sel = elegidosObj();
    const cuentas = sel.filter((x) => x.tipo === 'ACCOUNT');
    const contenedores = sel.filter((x) => x.tipo !== 'ACCOUNT');
    const unaOu = sel.length === 1 && sel[0].tipo === 'ORGANIZATIONAL_UNIT' ? sel[0] : null;
    const unaCuenta = sel.length === 1 && cuentas.length === 1 ? cuentas[0] : null;
    return [
      ui.menuBoton('Actions', () => [
        {
          grupo: 'AWS account',
          items: [
            { texto: 'Move', escribe: true, desactivado: !cuentas.length || contenedores.length > 0, alClic: () => irAMover(cx, cuentas.map((c) => c.id)) },
            { texto: 'Remove from organization', escribe: true, desactivado: !unaCuenta, alClic: () => quitarCuenta(cx, unaCuenta.recurso) },
            { texto: 'Close', escribe: true, desactivado: !unaCuenta || unaCuenta.recurso.admin || unaCuenta.recurso.metodo !== 'CREATED', alClic: () => cerrarCuenta(cx, unaCuenta.recurso) }
          ]
        },
        {
          grupo: 'Organizational unit',
          items: [
            { texto: 'Create new', escribe: true, desactivado: !(sel.length === 1 && contenedores.length === 1), alClic: () => cx.ir(`organizations/ous/${contenedores[0].id}/crear`) },
            { texto: 'Rename', escribe: true, desactivado: !unaOu, alClic: () => renombrarOu(cx, unaOu.recurso) },
            { texto: 'Delete', escribe: true, desactivado: !unaOu, alClic: () => borrarOu(cx, unaOu.recurso) }
          ]
        }
      ]),
      ui.boton('Add an AWS account', { variante: 'primario', alClic: () => cx.ir('organizations/cuentas/agregar') })
    ];
  };

  const cabeza = ui.region(() =>
    ui.encabezado({
      titulo: 'AWS accounts',
      info: 'org-cuenta',
      cx,
      descripcion: 'The following AWS accounts are in your organization. Use organizational units (OUs) to group accounts and apply policies to them.',
      acciones: acciones()
    })
  );
  const despuesDeElegir = () => {
    arbolVivo.repintar();
    cabeza.repintar();
  };
  // El árbol es una zona viva (las cuentas pasan de Creating a Active solas).
  const arbolVivo = cx.vivo(() => {
    if (!org(cx)) return null;
    for (const id of [...elegidos]) if (!objetivoOrganizacion(cx.estado, id)) elegidos.delete(id);
    return arbol(cx, { elegidos, filtro, alCambiar: despuesDeElegir });
  });
  // La lista es una ui.tabla, que ya se repinta sola sin perder filtro ni selección.
  const lista = ui.tabla(cx, {
    titulo: null,
    variante: 'simple',
    contador: false,
    filas: () => org(cx)?.cuentas ?? [],
    clave: (c) => c.id,
    seleccion: 'multiple',
    filtro: 'Find AWS accounts by name, email, or account ID',
    alSeleccionar: (ids) => {
      elegidos.clear();
      ids.forEach((i) => elegidos.add(i));
      cabeza.repintar();
    },
    columnas: [
      { titulo: 'Account name', valor: (c) => h('span', { class: 'cx-org-nombre__fila' }, ui.enlace(c.nombre, `organizations/cuentas/${c.id}`, { cx }), c.admin ? h('span', { class: 'cx-insignia cx-insignia--azul' }, 'management account') : null), texto: (c) => c.nombre },
      { titulo: 'Account ID', valor: (c) => c.id },
      { titulo: 'Email', valor: (c) => c.correo },
      { titulo: 'Parent', valor: (c) => ui.enlace(objetivoOrganizacion(cx.estado, c.padre)?.nombre ?? c.padre, rutaObjetivo(c.padre), { cx }), texto: (c) => objetivoOrganizacion(cx.estado, c.padre)?.nombre ?? '' },
      { titulo: 'Joined method', valor: (c) => metodoTexto(c) },
      { titulo: 'Joined on', valor: (c) => ui.fecha(c.unida) },
      { titulo: 'Status', valor: estadoCuenta, texto: (c) => c.estado }
    ]
  });
  const barra = ui.region(() =>
    h(
      'div',
      { class: 'cx-org-barra' },
      ui.segmentado({
        etiquetaAccesible: 'View',
        opciones: [{ valor: 'jerarquia', etiqueta: 'Hierarchy' }, { valor: 'lista', etiqueta: 'List' }],
        valor: vista,
        alCambiar: (v) => {
          vista = cx.memoria.orgVista = v;
          elegidos.clear();
          lista.seleccionar([]);
          barra.repintar();
          cuerpo.repintar();
          despuesDeElegir();
        }
      }),
      vista === 'jerarquia'
        ? h(
            'div',
            { class: 'cx-org-buscar' },
            ui.entrada({ placeholder: 'Find AWS accounts by name, email, or account ID', buscar: true, valor: filtro, etiquetaAccesible: 'Find AWS accounts', alCambiar: (v) => ((filtro = v), arbolVivo.repintar()) })
          )
        : h('span', { class: 'cx-texto-sec' }, 'Select accounts, then choose Actions.')
    )
  );
  const cuerpo = ui.region(() => (vista === 'jerarquia' ? arbolVivo : lista));
  return h(
    'div',
    { class: 'cx-pagina' },
    invitacionesAbiertas(cx),
    cabeza,
    ui.contenedor({
      titulo: 'Organization',
      info: 'org-ou',
      cx,
      descripcion: 'Select the root, an OU, or accounts, then choose Actions.',
      acciones: ui.botonRefrescar(() => arbolVivo.repintar()),
      sinRelleno: true,
      cuerpo: [barra, cuerpo]
    })
  );
}

/** Aviso de invitaciones abiertas arriba de AWS accounts. */
function invitacionesAbiertas(cx) {
  return cx.vivo(() => {
    const n = (org(cx)?.invitaciones ?? []).filter((i) => i.estado === 'OPEN').length;
    if (!n) return null;
    return ui.alerta({
      tipo: 'info',
      titulo: `${n} open invitation${n === 1 ? '' : 's'}`,
      contenido: ['Accounts appear in your organization after they accept the invitation. ', h('i', {}, '(En el simulador, la invitación se acepta sola en unos segundos.)')],
      accion: ui.boton('View invitations', { alClic: () => cx.ir('organizations/invitaciones') })
    });
  });
}

/* ---------------------------------------------------------- Add account */

function agregarCuentaPagina(cx) {
  migasOrg(cx, { texto: 'AWS accounts', ruta: 'organizations/cuentas' }, { texto: 'Add an AWS account' });
  const f = cx.memoria.orgAgregar ?? { modo: 'crear', nombre: '', correo: '', rol: 'OrganizationAccountAccessRole', destino: '', nota: '' };
  cx.memoria.orgAgregar = f;
  let error = null;
  const formulario = ui.region(() =>
    f.modo === 'crear'
      ? ui.contenedor({
          titulo: 'Create an AWS account',
          info: 'org-cuenta',
          cx,
          cuerpo: h(
            'div',
            { class: 'cx-form' },
            ui.campo({
              etiqueta: 'AWS account name',
              descripcion: 'The name helps you identify this account in the organization.',
              control: ui.entrada({ valor: f.nombre, placeholder: 'Production', etiquetaAccesible: 'AWS account name', alCambiar: (v) => (f.nombre = v) }),
              restriccion: 'The account name can be up to 50 characters.'
            }),
            ui.campo({
              etiqueta: "Email address of the account's owner",
              descripcion: 'Enter an email address that is not already associated with an AWS account. This email becomes the root user of the new account.',
              control: ui.entrada({ valor: f.correo, placeholder: 'name@example.com', etiquetaAccesible: 'Email address', alCambiar: (v) => (f.correo = v) })
            }),
            ui.campo({
              etiqueta: 'IAM role name',
              descripcion: 'AWS Organizations creates this role in the new account. Users in the management account can assume it to administer the member account.',
              control: ui.entrada({ valor: f.rol, etiquetaAccesible: 'IAM role name', alCambiar: (v) => (f.rol = v) }),
              restriccion: 'Use alphanumeric and +=,.@-_ characters. Maximum 64 characters.'
            }),
            ui.expandible({ titulo: 'Tags - optional', contenido: h('p', { class: 'cx-texto-sec' }, 'Las etiquetas de cuentas no están disponibles en este simulador.') })
          )
        })
      : ui.contenedor({
          titulo: 'Invite an existing AWS account',
          info: 'org-invitacion',
          cx,
          cuerpo: h(
            'div',
            { class: 'cx-form' },
            ui.campo({
              etiqueta: 'Email address or account ID of the AWS account to invite',
              control: ui.entrada({ valor: f.destino, placeholder: 'name@example.com or 123456789012', etiquetaAccesible: 'Email address or account ID', alCambiar: (v) => (f.destino = v) })
            }),
            ui.campo({
              etiqueta: 'Message to include in the invitation email message',
              opcional: true,
              control: ui.area({ valor: f.nota, filas: 4, etiquetaAccesible: 'Message', alCambiar: (v) => (f.nota = v) }),
              restriccion: 'Maximum 1,024 characters.'
            }),
            ui.alerta({ tipo: 'info', contenido: 'En el simulador no hay otra persona que acepte: la invitación se acepta sola en unos segundos y la cuenta aparece en Root.' })
          )
        })
  );
  const zonaError = ui.region(() => (error ? ui.alerta({ tipo: 'error', titulo: f.modo === 'crear' ? 'Failed to create AWS account' : 'Failed to send invitation', contenido: error }) : null));
  const enviar = () => {
    const fn = f.modo === 'crear' ? (e) => crearCuentaOrganizacion(e, { nombre: f.nombre, correo: f.correo, rol: f.rol }) : (e) => invitarCuentaOrganizacion(e, { destino: f.destino, nota: f.nota });
    error = probar(cx, fn);
    zonaError.repintar();
    if (error) return;
    const r = cx.hacer({ servicio: 'Organizations', accion: f.modo === 'crear' ? 'CreateAccount' : 'InviteAccountToOrganization', error: 'Failed' }, fn);
    if (!r.ok) return;
    delete cx.memoria.orgAgregar;
    if (f.modo === 'crear') {
      cx.flash({ tipo: 'exito', titulo: 'AWS account creation is in progress', texto: `The account ${r.valor.nombre} (${r.valor.id}) is being created. It appears as Active in a few moments.` });
      cx.ir('organizations/cuentas');
    } else {
      cx.flash({ tipo: 'exito', texto: `You successfully sent an invitation to ${r.valor.destino}.`, accion: { texto: 'View invitations', alClic: () => cx.ir('organizations/invitaciones') } });
      cx.ir('organizations/invitaciones');
    }
  };
  // Al cambiar de tarjeta se rehacen las tarjetas (su resaltado) y el pie (el texto del botón).
  const eleccion = ui.region(() =>
    ui.contenedor({
      titulo: 'Add an AWS account',
      cuerpo: ui.tarjetas({
        columnas: 2,
        valor: f.modo,
        alCambiar: (v) => {
          f.modo = v;
          error = null;
          eleccion.repintar();
          formulario.repintar();
          zonaError.repintar();
          pie.repintar();
        },
        opciones: [
          { valor: 'crear', etiqueta: 'Create an AWS account', descripcion: 'Create a new AWS account that is added to your organization.' },
          { valor: 'invitar', etiqueta: 'Invite an existing AWS account', descripcion: 'Invite an existing AWS account to join your organization.' }
        ]
      })
    })
  );
  const pie = ui.region(() => ui.pieFormulario({ cancelar: () => cx.ir('organizations/cuentas'), enviar, textoEnviar: f.modo === 'crear' ? 'Create AWS account' : 'Send invitation' }));
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Add an AWS account', info: 'org-cuenta', cx, descripcion: 'Create a new AWS account in your organization, or invite an account that already exists.' }),
    eleccion,
    formulario,
    zonaError,
    pie
  );
}

/* ---------------------------------------------------------- acciones */

function irAMover(cx, ids) {
  cx.memoria.orgMover = ids;
  cx.ir('organizations/mover');
}

function moverPagina(cx) {
  migasOrg(cx, { texto: 'AWS accounts', ruta: 'organizations/cuentas' }, { texto: 'Move AWS account' });
  const ids = (cx.memoria.orgMover ?? []).filter((id) => objetivoOrganizacion(cx.estado, id)?.tipo === 'ACCOUNT');
  if (!ids.length) return noEncontrado(cx, 'Account', '', 'organizations/cuentas');
  const cuentas = ids.map((id) => objetivoOrganizacion(cx.estado, id));
  const destino = new Set();
  let error = null;
  const zona = ui.region(() => [
    arbol(cx, { elegidos: destino, tipo: 'radio', cuentas: false, enlaces: false, alCambiar: () => zona.repintar(), desactivar: (o) => cuentas.length === 1 && o.id === cuentas[0].padre }),
    error ? ui.alerta({ tipo: 'error', titulo: 'Failed to move AWS account', contenido: error }) : null
  ]);
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({
      titulo: cuentas.length === 1 ? `Move AWS account '${cuentas[0].nombre}'` : `Move ${cuentas.length} AWS accounts`,
      info: 'org-ou',
      cx,
      descripcion: 'The account inherits the policies attached to its new parent and stops inheriting the policies of its current parent.'
    }),
    ui.contenedor({
      titulo: 'Accounts to move',
      cuerpo: ui.pares(cuentas.map((c) => ({ etiqueta: c.nombre, valor: `${c.id} · now in ${objetivoOrganizacion(cx.estado, c.padre)?.nombre ?? c.padre}` })), { columnas: 2 })
    }),
    ui.contenedor({ titulo: 'Destination', descripcion: 'Choose the root or the organizational unit to move the account to.', sinRelleno: true, cuerpo: zona }),
    ui.pieFormulario({
      cancelar: () => cx.ir('organizations/cuentas'),
      textoEnviar: 'Move AWS account',
      enviar: () => {
        const d = [...destino][0];
        if (!d) {
          error = 'Choose a destination.';
          zona.repintar();
          return;
        }
        const fn = (e) => cuentas.forEach((c) => moverCuentaOrganizacion(e, c.id, d));
        error = probar(cx, fn);
        zona.repintar();
        if (error) return;
        const r = cx.hacer({ servicio: 'Organizations', accion: 'MoveAccount', error: 'Failed to move AWS account' }, fn, { atomico: true });
        if (r.ok) {
          const dn = objetivoOrganizacion(cx.estado, d)?.nombre ?? d;
          cx.flash({ tipo: 'exito', texto: cuentas.length === 1 ? `You successfully moved the account ${cuentas[0].nombre} to ${dn}.` : `You successfully moved ${cuentas.length} accounts to ${dn}.` });
          delete cx.memoria.orgMover;
          cx.ir('organizations/cuentas');
        }
      }
    })
  );
}

function quitarCuenta(cx, c) {
  cx.confirmar({
    titulo: `Remove account ${c.nombre}?`,
    textoBoton: 'Remove account',
    contenido: [
      h('p', {}, `The account ${c.nombre} (${c.id}) will leave the organization. It will no longer be affected by your SCPs and it will pay its own bills.`),
      c.metodo === 'CREATED' && c.estado !== 'SUSPENDED'
        ? ui.alerta({ tipo: 'aviso', contenido: 'Esta cuenta se creó desde la organización: no tiene sus propios datos de pago, así que AWS no la deja salir. En el simulador primero ciérrala (Close) y después quítala.' })
        : null
    ],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'Organizations', accion: 'RemoveAccountFromOrganization', error: 'Failed to remove the account' }, (e) => quitarCuentaOrganizacion(e, c.id));
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: `You successfully removed the account ${c.nombre} from your organization.` });
        cx.ir('organizations/cuentas');
      }
      return true;
    }
  });
}

function cerrarCuenta(cx, c) {
  cx.confirmar({
    titulo: `Close account ${c.nombre}?`,
    textoBoton: 'Close account',
    palabra: c.id,
    contenido: [
      h('p', {}, 'Closing an account stops all its resources and suspends it. A closed account stays in your organization with the status Suspended.'),
      ui.alerta({ tipo: 'aviso', contenido: 'Cerrar una cuenta no se deshace en este simulador. Escribe el ID de la cuenta para confirmar.' })
    ],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'Organizations', accion: 'CloseAccount', error: 'Failed to close the account' }, (e) => cerrarCuentaOrganizacion(e, c.id));
      if (r.ok) cx.flash({ tipo: 'exito', texto: `The account ${c.nombre} (${c.id}) is closed. It now has the status Suspended.` });
      return true;
    }
  });
}

/* ---------------------------------------------------------- OU */

function crearOuPagina(cx, { id }) {
  const padre = objetivoOrganizacion(cx.estado, id);
  migasOrg(cx, { texto: 'AWS accounts', ruta: 'organizations/cuentas' }, { texto: 'Create organizational unit' });
  if (!padre || padre.tipo === 'ACCOUNT') return noEncontrado(cx, 'Organizational unit', id, 'organizations/cuentas');
  const f = { nombre: '' };
  let error = null;
  const zonaError = ui.region(() => errorCampo(error));
  const enviar = () => {
    const fn = (e) => crearUnidadOrganizativa(e, { nombre: f.nombre, padre: id });
    error = probar(cx, fn);
    zonaError.repintar();
    if (error) return;
    const r = cx.hacer({ servicio: 'Organizations', accion: 'CreateOrganizationalUnit', error: 'Failed to create organizational unit' }, fn);
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: `You successfully created the organizational unit ${r.valor.nombre}.`, accion: { texto: 'View OU', alClic: () => cx.ir(`organizations/ous/${r.valor.id}`) } });
      cx.ir('organizations/cuentas');
    }
  };
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: `Create organizational unit in ${padre.nombre}`, info: 'org-ou', cx }),
    ui.contenedor({
      titulo: 'Organizational unit details',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({ etiqueta: 'Parent', control: h('div', { class: 'cx-mono' }, `${padre.nombre} (${padre.id})`) }),
        ui.campo({
          etiqueta: 'Organizational unit name',
          control: h('div', {}, ui.entrada({ placeholder: 'Production', etiquetaAccesible: 'Organizational unit name', alCambiar: (v) => (f.nombre = v), alEnter: enviar }), zonaError),
          restriccion: 'The name can be up to 128 characters.'
        })
      )
    }),
    ui.expandible({ titulo: 'Tags - optional', contenido: h('p', { class: 'cx-texto-sec' }, 'Las etiquetas de las OU no están disponibles en este simulador.') }),
    ui.pieFormulario({ cancelar: () => cx.ir('organizations/cuentas'), enviar, textoEnviar: 'Create organizational unit' })
  );
}

function renombrarOu(cx, ou) {
  let nombre = ou.nombre;
  let error = null;
  const zona = ui.region(() =>
    ui.campo({
      etiqueta: 'Organizational unit name',
      control: h('div', {}, ui.entrada({ valor: nombre, etiquetaAccesible: 'Organizational unit name', alCambiar: (v) => (nombre = v) }), errorCampo(error)),
      restriccion: 'The name can be up to 128 characters.'
    })
  );
  const guardar = () => {
    error = probar(cx, (e) => renombrarUnidadOrganizativa(e, ou.id, nombre));
    if (error) return zona.repintar();
    const r = cx.hacer({ servicio: 'Organizations', accion: 'UpdateOrganizationalUnit', error: 'Failed to rename' }, (e) => renombrarUnidadOrganizativa(e, ou.id, nombre));
    if (r.ok) {
      m.cerrar();
      cx.flash({ tipo: 'exito', texto: `You successfully renamed the organizational unit to ${r.valor.nombre}.` });
    }
  };
  const m = cx.modal({ titulo: `Rename organizational unit '${ou.nombre}'`, contenido: zona, pie: [ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }), ui.boton('Save', { variante: 'primario', alClic: guardar })] });
}

function borrarOu(cx, ou, { alTerminar } = {}) {
  cx.confirmar({
    titulo: `Delete organizational unit '${ou.nombre}'?`,
    palabra: ou.nombre,
    textoBoton: 'Delete organizational unit',
    contenido: h('p', {}, 'You can delete only an empty OU. First move its accounts to another OU or to the root, and delete its child OUs.'),
    aceptar: () => {
      const r = cx.hacer({ servicio: 'Organizations', accion: 'DeleteOrganizationalUnit', error: 'Failed to delete organizational unit' }, (e) => eliminarUnidadOrganizativa(e, ou.id));
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: `You successfully deleted the organizational unit ${ou.nombre}.` });
        if (alTerminar) alTerminar();
      }
      return true;
    }
  });
}

/* ============================================================ detalles */

/** La pestaña Policies de un objetivo: SCP adjuntas directo y heredadas. */
function pestanaPoliticas(cx, id) {
  const o = org(cx);
  if (!o.scpHabilitadas) {
    return ui.alerta({
      tipo: 'info',
      titulo: 'Service control policies are disabled',
      contenido: 'Enable service control policies before you attach them to the root, OUs, or accounts.',
      accion: ui.boton('Go to Service control policies', { alClic: () => cx.ir('organizations/politicas/scp') })
    });
  }
  const directas = ui.tabla(cx, {
    titulo: 'Attached directly',
    info: 'org-scp',
    variante: 'contenedor',
    descripcion: 'Service control policies attached directly to this target.',
    filas: () => politicasDeObjetivo(cx.estado, id),
    clave: (p) => p.id,
    seleccion: 'unica',
    filtro: false,
    columnas: [
      { titulo: 'Policy name', valor: (p) => ui.enlace(p.nombre, `organizations/politicas/scp/${p.id}`, { cx }), texto: (p) => p.nombre },
      { titulo: 'Type', valor: (p) => (p.administradaPorAws ? 'AWS managed policy' : 'Customer managed policy') },
      { titulo: 'Description', valor: (p) => ui.guion(p.descripcion) }
    ],
    acciones: (sel) => [
      ui.boton('Detach', { escribe: true, desactivado: sel.length !== 1, alClic: () => desadjuntar(cx, sel[0], id) }),
      ui.boton('Attach', { variante: 'primario', alClic: () => cx.ir(`organizations/adjuntar-a/${id}`) })
    ],
    vacio: { titulo: 'No policies', texto: 'No service control policies are attached directly to this target.' }
  });
  const heredadas = politicasHeredadas(cx.estado, id).filter((x) => x.politicas.length);
  return h(
    'div',
    { class: 'cx-pagina' },
    directas,
    heredadas.length
      ? ui.contenedor({
          titulo: 'Inherited from',
          descripcion: 'Policies attached to the parents of this target also apply to it.',
          sinRelleno: true,
          cuerpo: h(
            'table',
            { class: 'cx-tabla__tabla' },
            h('thead', {}, h('tr', {}, ['Policy name', 'Inherited from', 'Type'].map((t) => h('th', {}, h('span', { class: 'cx-tabla__orden' }, t))))),
            h(
              'tbody',
              {},
              heredadas.flatMap((x) =>
                x.politicas.map((p) =>
                  h('tr', {}, h('td', { style: { paddingLeft: '20px' } }, ui.enlace(p.nombre, `organizations/politicas/scp/${p.id}`, { cx })), h('td', {}, ui.enlace(x.objetivo.nombre, rutaObjetivo(x.objetivo.id), { cx })), h('td', {}, p.administradaPorAws ? 'AWS managed policy' : 'Customer managed policy'))
                )
              )
            )
          )
        })
      : null
  );
}

function desadjuntar(cx, p, objetivoId, { alTerminar } = {}) {
  const obj = objetivoOrganizacion(cx.estado, objetivoId);
  cx.confirmar({
    titulo: `Detach policy '${p.nombre}'?`,
    textoBoton: 'Detach policy',
    contenido: [
      h('p', {}, `The policy ${p.nombre} will be detached from ${obj?.nombre ?? objetivoId}. The accounts under this target will no longer be affected by it.`),
      p.id === FULL_AWS_ACCESS ? ui.alerta({ tipo: 'aviso', contenido: 'Ojo: sin FullAWSAccess (o sin otra SCP que diga Allow), las cuentas de este nivel ya no pueden hacer nada: es un deny implícito.' }) : null
    ],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'Organizations', accion: 'DetachPolicy', error: 'Failed to detach policy' }, (e) => desadjuntarPoliticaScp(e, p.id, objetivoId));
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: `You successfully detached the policy ${p.nombre} from ${obj?.nombre ?? objetivoId}.` });
        alTerminar ? alTerminar() : cx.ir(cx.ruta);
      }
      return true;
    }
  });
}

/** Simulador: ¿una SCP deja hacer esta acción en esta cuenta? */
function probadorScp(cx, { cuentaId } = {}) {
  const f = { cuenta: cuentaId ?? org(cx)?.cuentas.find((c) => !c.admin)?.id ?? org(cx)?.cuentaAdmin, accion: 'rds:CreateDBInstance', region: 'us-east-1' };
  let resultado = null;
  const REGIONES = ['us-east-1', 'us-east-2', 'us-west-2', 'mx-central-1', 'sa-east-1', 'eu-west-1', 'eu-central-1', 'ap-northeast-1'];
  const evaluar = () => {
    resultado = { ...accionPermitidaPorScp(cx.estado, f.cuenta, f.accion.trim(), { region: f.region }), accion: f.accion.trim(), cuenta: f.cuenta, region: f.region };
    zonaResultado.repintar();
  };
  const zonaResultado = ui.region(() => {
    if (!resultado) return null;
    const r = resultado;
    const nivel = r.nivel ? objetivoOrganizacion(cx.estado, r.nivel)?.nombre ?? r.nivel : '';
    if (r.motivo === 'deny-explicito') {
      return ui.alerta({
        tipo: 'error',
        titulo: 'Denied: explicit deny in a service control policy',
        contenido: [
          h('p', {}, ...ui.textoRico(`La SCP **${r.politica}** (adjunta en **${nivel}**) tiene un \`Deny\` que cubre \`${r.accion}\`. Un Deny explícito gana siempre: aunque el usuario tenga \`AdministratorAccess\` en IAM, no puede hacerlo.`)),
          h('pre', { class: 'cx-log cx-org-mensaje' }, `User: arn:aws:sts::${r.cuenta}:assumed-role/OrganizationAccountAccessRole/alumno is not authorized to perform: ${r.accion} with an explicit deny in a service control policy`)
        ]
      });
    }
    if (r.motivo === 'deny-implicito') {
      return ui.alerta({
        tipo: 'error',
        titulo: 'Denied: no SCP allows this action (implicit deny)',
        contenido: h('p', {}, ...ui.textoRico(`En **${nivel}** ninguna SCP dice \`Allow\` para \`${r.accion}\` (por ejemplo, alguien quitó **FullAWSAccess**). Cada nivel —Root, cada OU y la cuenta— debe permitir la acción.`))
      });
    }
    if (r.motivo === 'cuenta-administracion') return ui.alerta({ tipo: 'info', titulo: 'Allowed: management account', contenido: 'Las SCP no afectan a la cuenta de administración. Prueba con una cuenta miembro.' });
    if (r.motivo === 'scp-deshabilitadas') return ui.alerta({ tipo: 'info', titulo: 'Allowed: SCPs are disabled', contenido: 'Las SCP están apagadas en esta organización: no limitan nada.' });
    if (r.motivo === 'sin-organizacion') return ui.alerta({ tipo: 'info', titulo: 'Allowed', contenido: 'Esa cuenta no está en la organización.' });
    return ui.alerta({ tipo: 'exito', titulo: 'Allowed by SCPs', contenido: 'Ninguna SCP lo niega y cada nivel lo permite. Ahora decide IAM: el usuario todavía necesita una política que se lo permita.' });
  });
  const opciones = () => (org(cx)?.cuentas ?? []).map((c) => ({ valor: c.id, etiqueta: `${c.nombre} (${c.id})`, etiquetas: c.admin ? ['management account'] : [] }));
  return ui.contenedor({
    titulo: 'Probar una acción (simulador)',
    info: 'org-deny',
    cx,
    descripcion: 'Herramienta propia del simulador: dice si las SCP dejan hacer una acción en una cuenta y por qué.',
    cuerpo: h(
      'div',
      { class: 'cx-form' },
      h(
        'div',
        { class: 'cx-fila-campos cx-org-probador' },
        cuentaId ? null : ui.campo({ etiqueta: 'Account', control: ui.selector({ opciones, valor: f.cuenta, alCambiar: (v) => (f.cuenta = v), etiquetaAccesible: 'Account' }) }),
        ui.campo({ etiqueta: 'Action', control: ui.entrada({ valor: f.accion, placeholder: 'rds:CreateDBInstance', etiquetaAccesible: 'Action', alCambiar: (v) => (f.accion = v), alEnter: evaluar }) }),
        ui.campo({ etiqueta: 'Region', control: ui.selector({ opciones: REGIONES.map((r) => ({ valor: r, etiqueta: r })), valor: f.region, alCambiar: (v) => (f.region = v), etiquetaAccesible: 'Region' }) })
      ),
      h('div', {}, ui.boton('Evaluate', { alClic: evaluar })),
      zonaResultado
    )
  });
}

function detalleCuenta(cx, { id }) {
  const c = org(cx).cuentas.find((x) => x.id === id);
  migasOrg(cx, { texto: 'AWS accounts', ruta: 'organizations/cuentas' }, { texto: c?.nombre ?? id });
  if (!c) return noEncontrado(cx, 'Account', id, 'organizations/cuentas');
  const clave = `cuenta:${id}`;
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({
      titulo: c.nombre,
      info: 'org-cuenta',
      cx,
      acciones: [
        ui.menuBoton('Actions', () => [
          { texto: 'Move', escribe: true, alClic: () => irAMover(cx, [id]) },
          { texto: 'Remove from organization', escribe: true, desactivado: c.admin, alClic: () => quitarCuenta(cx, c) },
          { texto: 'Close', escribe: true, desactivado: c.admin || c.metodo !== 'CREATED' || c.estado === 'SUSPENDED', alClic: () => cerrarCuenta(cx, c) }
        ])
      ]
    }),
    cx.vivo(() => {
      const x = org(cx)?.cuentas.find((y) => y.id === id);
      if (!x) return null;
      return ui.contenedor({
        titulo: 'Account details',
        cuerpo: ui.pares(
          [
            { etiqueta: 'Account name', valor: x.nombre },
            { etiqueta: 'Account ID', valor: ui.copiable(x.id) },
            { etiqueta: 'Email', valor: x.correo },
            { etiqueta: 'Status', valor: estadoCuenta(x) },
            { etiqueta: 'Joined method', valor: metodoTexto(x) },
            { etiqueta: 'Joined on', valor: ui.fecha(x.unida) },
            { etiqueta: 'Parent', valor: ui.enlace(objetivoOrganizacion(cx.estado, x.padre)?.nombre ?? x.padre, rutaObjetivo(x.padre), { cx }) },
            { etiqueta: 'IAM role name', valor: ui.guion(x.rol) },
            { etiqueta: 'ARN', valor: ui.copiable(x.arn) }
          ],
          { columnas: 3 }
        )
      });
    }),
    c.admin ? ui.alerta({ tipo: 'info', titulo: 'This is the management account', contenido: 'Service control policies don’t affect users or roles in the management account.' }) : null,
    ui.pestanas({
      activa: cx.memoria.orgPestana?.[clave] ?? 'politicas',
      alCambiar: (p) => ((cx.memoria.orgPestana ??= {})[clave] = p),
      pestanas: [
        { id: 'politicas', texto: 'Policies', contenido: () => h('div', { class: 'cx-pagina' }, pestanaPoliticas(cx, id), org(cx).scpHabilitadas ? probadorScp(cx, { cuentaId: id }) : null) },
        { id: 'etiquetas', texto: 'Tags', desactivada: true, contenido: () => null }
      ]
    })
  );
}

function detalleOu(cx, { id }) {
  const obj = objetivoOrganizacion(cx.estado, id);
  migasOrg(cx, { texto: 'AWS accounts', ruta: 'organizations/cuentas' }, ...rutaOrganizacion(cx.estado, id).slice(0, -1).map((x) => ({ texto: objetivoOrganizacion(cx.estado, x).nombre, ruta: rutaObjetivo(x) })), { texto: obj?.nombre ?? id });
  if (!obj || obj.tipo === 'ACCOUNT') return noEncontrado(cx, 'Organizational unit', id, 'organizations/cuentas');
  const esRaiz = obj.tipo === 'ROOT';
  const clave = `ou:${id}`;
  const hijos = () => {
    const x = hijosOrganizacion(cx.estado, id);
    return [...x.ous.map((o) => objetivoOrganizacion(cx.estado, o.id)), ...x.cuentas.map((c) => objetivoOrganizacion(cx.estado, c.id))];
  };
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({
      titulo: obj.nombre,
      info: 'org-ou',
      cx,
      acciones: [
        ui.menuBoton('Actions', () => [
          { texto: 'Create new organizational unit', escribe: true, alClic: () => cx.ir(`organizations/ous/${id}/crear`) },
          { texto: 'Rename', escribe: true, desactivado: esRaiz, alClic: () => renombrarOu(cx, obj.recurso) },
          { texto: 'Delete', escribe: true, desactivado: esRaiz, alClic: () => borrarOu(cx, obj.recurso, { alTerminar: () => cx.ir('organizations/cuentas') }) }
        ])
      ]
    }),
    cx.vivo(() => {
      const x = objetivoOrganizacion(cx.estado, id);
      if (!x) return null;
      return ui.contenedor({
        titulo: esRaiz ? 'Root details' : 'Organizational unit details',
        cuerpo: ui.pares(
          [
            { etiqueta: 'Name', valor: x.nombre },
            { etiqueta: 'ID', valor: ui.copiable(x.id) },
            esRaiz ? { etiqueta: 'Type', valor: 'Root' } : { etiqueta: 'Parent', valor: ui.enlace(objetivoOrganizacion(cx.estado, x.padre)?.nombre ?? x.padre, rutaObjetivo(x.padre), { cx }) },
            { etiqueta: 'ARN', valor: ui.copiable(x.arn) }
          ],
          { columnas: 4 }
        )
      });
    }),
    ui.pestanas({
      activa: cx.memoria.orgPestana?.[clave] ?? 'hijos',
      alCambiar: (p) => ((cx.memoria.orgPestana ??= {})[clave] = p),
      pestanas: [
        {
          id: 'hijos',
          texto: 'Children',
          contenido: () =>
            ui.tabla(cx, {
              titulo: 'Children',
              variante: 'contenedor',
              descripcion: 'Organizational units and AWS accounts directly under this parent.',
              filas: hijos,
              clave: (x) => x.id,
              filtro: 'Find by name or ID',
              columnas: [
                { titulo: 'Name', valor: (x) => h('span', { class: 'cx-org-nombre__fila' }, iconoOrg(x.tipo === 'ACCOUNT' ? 'cuenta' : 'carpeta'), ui.enlace(x.nombre, rutaObjetivo(x.id), { cx })), texto: (x) => x.nombre },
                { titulo: 'Type', valor: (x) => TIPO_OBJETIVO[x.tipo] },
                { titulo: 'ID', valor: (x) => x.id },
                { titulo: 'Email', valor: (x) => (x.tipo === 'ACCOUNT' ? x.recurso.correo : '–') }
              ],
              acciones: () => [ui.boton('Create new organizational unit', { escribe: true, alClic: () => cx.ir(`organizations/ous/${id}/crear`) })],
              vacio: { titulo: 'No children', texto: 'This organizational unit is empty. Move accounts into it from AWS accounts.' }
            })
        },
        { id: 'politicas', texto: 'Policies', contenido: () => pestanaPoliticas(cx, id) },
        { id: 'etiquetas', texto: 'Tags', desactivada: esRaiz, contenido: () => ui.noDisponible('Tags') }
      ]
    })
  );
}

/* ============================================================ invitaciones */

const ESTADO_INVITACION = { OPEN: ['pendiente', 'Open'], ACCEPTED: ['exito', 'Accepted'], CANCELED: ['detenido', 'Canceled'] };

function invitacionesPagina(cx) {
  migasOrg(cx, { texto: 'Invitations' });
  const t = ui.tabla(cx, {
    titulo: 'Invitations',
    info: 'org-invitacion',
    descripcion: 'Invitations that your organization sent to existing AWS accounts.',
    filas: () => org(cx)?.invitaciones ?? [],
    clave: (i) => i.id,
    seleccion: 'unica',
    filtro: 'Find invitations',
    columnas: [
      { titulo: 'Account', valor: (i) => (i.cuentaId ? ui.enlace(i.destino, `organizations/cuentas/${i.cuentaId}`, { cx }) : i.destino), texto: (i) => i.destino },
      { titulo: 'Handshake ID', valor: (i) => i.id },
      { titulo: 'Status', valor: (i) => ui.estado(...(ESTADO_INVITACION[i.estado] ?? ['info', i.estado])), texto: (i) => i.estado },
      { titulo: 'Sent', valor: (i) => ui.fecha(i.creada) }
    ],
    acciones: (sel) => [
      ui.boton('Cancel invitation', {
        escribe: true,
        desactivado: sel.length !== 1 || sel[0].estado !== 'OPEN',
        alClic: () => {
          const r = cx.hacer({ servicio: 'Organizations', accion: 'CancelHandshake', error: 'Failed to cancel invitation' }, (e) => cancelarInvitacionOrganizacion(e, sel[0].id));
          if (r.ok) cx.flash({ tipo: 'exito', texto: `The invitation to ${sel[0].destino} was canceled.` });
        }
      }),
      ui.boton('Invite AWS account', {
        variante: 'primario',
        alClic: () => {
          cx.memoria.orgAgregar = { modo: 'invitar', nombre: '', correo: '', rol: 'OrganizationAccountAccessRole', destino: '', nota: '' };
          cx.ir('organizations/cuentas/agregar');
        }
      })
    ],
    vacio: { titulo: 'No invitations', texto: 'Your organization hasn’t sent any invitations.' }
  });
  return h('div', { class: 'cx-pagina' }, t);
}

/* ============================================================ políticas */

const TIPOS_POLITICA = [
  { id: 'scp', nombre: 'Service control policies', descripcion: 'Define the maximum available permissions for IAM users and roles in the accounts of your organization.' },
  { id: 'rcp', nombre: 'Resource control policies', descripcion: 'Define the maximum available permissions for resources in your organization.' },
  { id: 'declarativas', nombre: 'Declarative policies', descripcion: 'Enforce baseline configurations of AWS services at scale.' },
  { id: 'respaldo', nombre: 'Backup policies', descripcion: 'Deploy organization-wide backup plans.' },
  { id: 'etiquetas', nombre: 'Tag policies', descripcion: 'Standardize the tags attached to resources in your organization.' },
  { id: 'ia', nombre: 'AI services opt-out policies', descripcion: 'Control whether AI services can store and use your content.' }
];

function politicasPagina(cx) {
  migasOrg(cx, { texto: 'Policies' });
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Policies', info: 'org-scp', cx, descripcion: 'Policies in AWS Organizations enable you to manage the accounts in your organization. To use a policy type, enable it first.' }),
    ui.contenedor({
      titulo: 'Supported policy types',
      sinRelleno: true,
      cuerpo: cx.vivo(() =>
        h(
          'table',
          { class: 'cx-tabla__tabla' },
          h('thead', {}, h('tr', {}, ['Policy type', 'Description', 'Status'].map((t) => h('th', {}, h('span', { class: 'cx-tabla__orden' }, t))))),
          h(
            'tbody',
            {},
            TIPOS_POLITICA.map((t) =>
              h(
                'tr',
                {},
                h('td', { style: { paddingLeft: '20px' } }, t.id === 'scp' ? ui.enlace(t.nombre, 'organizations/politicas/scp', { cx }) : h('span', { class: 'cx-enlace cx-enlace--apagado', title: 'No disponible en este simulador' }, t.nombre)),
                h('td', { class: 'cx-org-celda-larga' }, t.descripcion),
                h('td', {}, t.id === 'scp' && org(cx).scpHabilitadas ? ui.estado('exito', 'Enabled') : ui.estado('detenido', 'Disabled'))
              )
            )
          )
        )
      )
    })
  );
}

function scpPagina(cx) {
  migasOrg(cx, { texto: 'Policies', ruta: 'organizations/politicas' }, { texto: 'Service control policies' });
  const encender = () => {
    const r = cx.hacer({ servicio: 'Organizations', accion: 'EnablePolicyType', error: 'Failed to enable service control policies' }, (e) => habilitarScp(e));
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: 'Service control policies are enabled. The FullAWSAccess policy is attached to the root, all OUs, and all accounts.' });
      cx.ir('organizations/politicas/scp');
    }
  };
  const apagar = () =>
    cx.confirmar({
      titulo: 'Disable service control policies?',
      palabra: 'disable',
      textoBoton: 'Disable',
      contenido: h('p', {}, 'All SCPs are detached from every root, OU, and account. The policies themselves are not deleted, but they won’t have any effect until you enable SCPs again and attach them.'),
      aceptar: () => {
        const r = cx.hacer({ servicio: 'Organizations', accion: 'DisablePolicyType', error: 'Failed to disable service control policies' }, (e) => deshabilitarScp(e));
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: 'Service control policies are disabled.' });
          cx.ir('organizations/politicas/scp');
        }
        return true;
      }
    });
  if (!org(cx).scpHabilitadas) {
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({ titulo: 'Service control policies', info: 'org-scp', cx, descripcion: 'Service control policies (SCPs) offer central control over the maximum available permissions for IAM users and IAM roles in your organization.' }),
      ui.alerta({
        tipo: 'info',
        titulo: 'Service control policies are not enabled',
        contenido: 'When you enable SCPs, AWS Organizations attaches the AWS managed FullAWSAccess policy to the root, every OU, and every account. Nothing is denied until you attach your own policies.',
        accion: ui.boton('Enable service control policies', { variante: 'primario', alClic: encender })
      })
    );
  }
  const t = ui.tabla(cx, {
    titulo: 'Available policies',
    info: 'org-scp',
    descripcion: 'Service control policies (SCPs) offer central control over the maximum available permissions for IAM users and IAM roles in your organization.',
    filas: () => org(cx)?.politicas ?? [],
    clave: (p) => p.id,
    seleccion: 'unica',
    filtro: 'Find policies',
    columnas: [
      { titulo: 'Name', valor: (p) => ui.enlace(p.nombre, `organizations/politicas/scp/${p.id}`, { cx }), texto: (p) => p.nombre },
      { titulo: 'Type', valor: (p) => (p.administradaPorAws ? 'AWS managed policy' : 'Customer managed policy') },
      { titulo: 'Description', valor: (p) => ui.guion(p.descripcion) },
      { titulo: 'Targets', valor: (p) => String(p.objetivos.length) }
    ],
    acciones: (sel) => [
      ui.menuBoton('Actions', () => [
        { texto: 'Edit policy', escribe: true, desactivado: sel.length !== 1 || sel[0].administradaPorAws, alClic: () => cx.ir(`organizations/politicas/scp/${sel[0].id}/editar`) },
        { texto: 'Attach policy', escribe: true, desactivado: sel.length !== 1, alClic: () => cx.ir(`organizations/politicas/scp/${sel[0].id}/adjuntar`) },
        { texto: 'Delete policy', escribe: true, desactivado: sel.length !== 1 || sel[0].administradaPorAws, alClic: () => borrarPolitica(cx, sel[0]) }
      ], { desactivado: !sel.length }),
      ui.boton('Create policy', { variante: 'primario', alClic: () => cx.ir('organizations/politicas/scp/crear') })
    ]
  });
  return h(
    'div',
    { class: 'cx-pagina' },
    t,
    probadorScp(cx),
    h('div', { class: 'cx-org-apagar' }, ui.boton('Disable service control policies', { escribe: true, alClic: apagar }))
  );
}

function borrarPolitica(cx, p) {
  cx.confirmar({
    titulo: `Delete policy '${p.nombre}'?`,
    palabra: p.nombre,
    textoBoton: 'Delete policy',
    contenido: h('p', {}, 'You must detach the policy from all roots, OUs, and accounts before you delete it. This action can’t be undone.'),
    aceptar: () => {
      const r = cx.hacer({ servicio: 'Organizations', accion: 'DeletePolicy', error: 'Failed to delete policy' }, (e) => eliminarPoliticaScp(e, p.id));
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: `You successfully deleted the policy ${p.nombre}.` });
        cx.ir('organizations/politicas/scp');
      }
      return true;
    }
  });
}

/* ---------------------------------------------------------- editor JSON */

const PLANTILLA_SCP = `{
\t"Version": "2012-10-17",
\t"Statement": [
\t\t{
\t\t\t"Sid": "Statement1",
\t\t\t"Effect": "Deny",
\t\t\t"Action": [],
\t\t\t"Resource": "*"
\t\t}
\t]
}`;

const EJEMPLOS_SCP = [
  {
    texto: 'Negar un servicio (RDS)',
    json: { Version: '2012-10-17', Statement: [{ Sid: 'DenyRDS', Effect: 'Deny', Action: 'rds:*', Resource: '*' }] }
  },
  {
    texto: 'Solo permitir us-east-1',
    json: {
      Version: '2012-10-17',
      Statement: [{ Sid: 'DenyOutsideUsEast1', Effect: 'Deny', NotAction: ['iam:*', 'organizations:*', 'support:*', 'cloudfront:*', 'route53:*'], Resource: '*', Condition: { StringNotEquals: { 'aws:RequestedRegion': ['us-east-1'] } } }]
    }
  },
  {
    texto: 'Impedir salir de la organización',
    json: { Version: '2012-10-17', Statement: [{ Sid: 'DenyLeaveOrganization', Effect: 'Deny', Action: 'organizations:LeaveOrganization', Resource: '*' }] }
  }
];

/** Formulario de Create / Edit policy con el editor JSON y su validador. */
function formularioPolitica(cx, { politica } = {}) {
  const editar = Boolean(politica);
  const f = { nombre: politica?.nombre ?? '', descripcion: politica?.descripcion ?? '', documento: politica?.documento ?? PLANTILLA_SCP };
  let errorNombre = null;
  let errorEnvio = null;
  const zonaNombre = ui.region(() => errorCampo(errorNombre));
  const validador = ui.region(() => {
    const { problemas } = revisarDocumentoScp(f.documento);
    return h(
      'div',
      { class: 'cx-org-validador' },
      h(
        'div',
        { class: 'cx-org-validador__cabeza' },
        h('span', { class: problemas.length ? 'cx-org-validador__n cx-org-validador__n--mal' : 'cx-org-validador__n' }, `Errors: ${problemas.length}`),
        h('span', { class: 'cx-org-validador__n' }, 'Security: 0'),
        h('span', { class: 'cx-org-validador__n' }, 'Warnings: 0'),
        h('span', { class: ['cx-org-validador__tam', f.documento.length > 5120 && 'cx-org-validador__n--mal'] }, `${f.documento.length.toLocaleString('en-US')} of 5,120 characters`)
      ),
      problemas.length
        ? h('ul', { class: 'cx-org-validador__lista' }, problemas.map((p) => h('li', {}, icono('status-negative'), h('span', {}, h('strong', {}, `${p.titulo}: `), p.mensaje))))
        : h('div', { class: 'cx-org-validador__bien' }, ui.estado('exito', 'No errors. The policy has valid SCP syntax.'))
    );
  });
  const editor = ui.area({
    valor: f.documento,
    filas: 18,
    monoespaciado: true,
    etiquetaAccesible: 'Policy editor',
    alCambiar: (v) => {
      f.documento = v;
      validador.repintar();
    }
  });
  editor.classList.add('cx-org-editor');
  // Tab inserta un tabulador, como el editor de la consola.
  editor.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || e.shiftKey) return;
    e.preventDefault();
    const { selectionStart: a, selectionEnd: b, value } = editor;
    editor.value = `${value.slice(0, a)}\t${value.slice(b)}`;
    editor.selectionStart = editor.selectionEnd = a + 1;
    f.documento = editor.value;
    validador.repintar();
  });
  const usarEjemplo = (j) => {
    editor.value = f.documento = JSON.stringify(j, null, 4);
    validador.repintar();
  };
  const zonaEnvio = ui.region(() => (errorEnvio ? ui.alerta({ tipo: 'error', titulo: editar ? 'Failed to save policy' : 'Failed to create policy', contenido: errorEnvio }) : null));
  const enviar = () => {
    errorNombre = f.nombre.trim() ? null : 'Policy name is required.';
    zonaNombre.repintar();
    if (errorNombre) return;
    const fn = editar ? (e) => editarPoliticaScp(e, politica.id, f) : (e) => crearPoliticaScp(e, f);
    errorEnvio = probar(cx, fn);
    zonaEnvio.repintar();
    if (errorEnvio) {
      validador.repintar();
      return;
    }
    const r = cx.hacer({ servicio: 'Organizations', accion: editar ? 'UpdatePolicy' : 'CreatePolicy', error: editar ? 'Failed to save policy' : 'Failed to create policy' }, fn);
    if (!r.ok) return;
    if (editar) {
      cx.flash({ tipo: 'exito', texto: `You successfully updated the policy ${r.valor.nombre}.` });
      cx.ir(`organizations/politicas/scp/${r.valor.id}`);
    } else {
      cx.flash({ tipo: 'exito', texto: `You successfully created the policy ${r.valor.nombre}. Attach it to a root, OU, or account to apply it.`, accion: { texto: 'Attach policy', alClic: () => cx.ir(`organizations/politicas/scp/${r.valor.id}/adjuntar`) } });
      cx.ir('organizations/politicas/scp');
    }
  };
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: editar ? `Edit policy ${politica.nombre}` : 'Create new service control policy', info: 'org-scp', cx }),
    ui.contenedor({
      titulo: 'Details',
      cuerpo: h(
        'div',
        { class: 'cx-form cx-pagina--form' },
        ui.campo({
          etiqueta: 'Policy name',
          control: h('div', {}, ui.entrada({ valor: f.nombre, placeholder: 'deny-rds', etiquetaAccesible: 'Policy name', alCambiar: (v) => (f.nombre = v) }), zonaNombre),
          restriccion: 'The name can be up to 128 characters.'
        }),
        ui.campo({ etiqueta: 'Policy description', opcional: true, control: ui.area({ valor: f.descripcion, filas: 2, etiquetaAccesible: 'Policy description', alCambiar: (v) => (f.descripcion = v) }), restriccion: 'Maximum 512 characters.' })
      )
    }),
    h(
      'div',
      { class: 'cx-dos-columnas' },
      ui.contenedor({
        titulo: 'Policy',
        info: 'org-scp',
        cx,
        descripcion: 'Use the JSON editor to write the policy. An SCP needs Version, and each statement needs Effect, Action (or NotAction), and Resource.',
        acciones: ui.segmentado({ opciones: [{ valor: 'visual', etiqueta: 'Visual', desactivado: true }, { valor: 'json', etiqueta: 'JSON' }], valor: 'json' }),
        cuerpo: h('div', { class: 'cx-org-editor-caja' }, editor, validador)
      }),
      h(
        'div',
        { class: 'cx-lado' },
        ui.contenedor({
          titulo: 'Ejemplos (simulador)',
          descripcion: 'Reemplazan lo que hay en el editor. Úsalos como punto de partida.',
          cuerpo: h('div', { class: 'cx-org-ejemplos' }, EJEMPLOS_SCP.map((e) => ui.boton(e.texto, { alClic: () => usarEjemplo(e.json) })))
        }),
        ui.contenedor({
          titulo: 'Recuerda',
          cuerpo: h('ul', { class: 'cx-org-lista' }, [
            'Una SCP **no da permisos**: pone el techo de lo que una cuenta puede hacer.',
            'Un `Deny` explícito gana siempre, aunque IAM diga Allow.',
            'Las SCP **no afectan** a la cuenta de administración.'
          ].map((t) => h('li', {}, ...ui.textoRico(t))))
        })
      )
    ),
    zonaEnvio,
    ui.pieFormulario({ cancelar: () => cx.ir(editar ? `organizations/politicas/scp/${politica.id}` : 'organizations/politicas/scp'), enviar, textoEnviar: editar ? 'Save changes' : 'Create policy' })
  );
}

function crearPoliticaPagina(cx) {
  migasOrg(cx, { texto: 'Policies', ruta: 'organizations/politicas' }, { texto: 'Service control policies', ruta: 'organizations/politicas/scp' }, { texto: 'Create new service control policy' });
  if (!org(cx).scpHabilitadas) return scpPagina(cx);
  return formularioPolitica(cx);
}

function editarPoliticaPagina(cx, { id }) {
  const p = org(cx).politicas.find((x) => x.id === id);
  migasOrg(cx, { texto: 'Policies', ruta: 'organizations/politicas' }, { texto: 'Service control policies', ruta: 'organizations/politicas/scp' }, { texto: p?.nombre ?? id, ruta: `organizations/politicas/scp/${id}` }, { texto: 'Edit' });
  if (!p) return noEncontrado(cx, 'Policy', id, 'organizations/politicas/scp');
  if (p.administradaPorAws) return h('div', { class: 'cx-pagina' }, ui.alerta({ tipo: 'error', titulo: 'You can’t edit this policy', contenido: 'FullAWSAccess is an AWS managed policy. You can attach and detach it, but you can’t edit or delete it.' }));
  return formularioPolitica(cx, { politica: p });
}

function detallePolitica(cx, { id }) {
  const p = org(cx).politicas.find((x) => x.id === id);
  migasOrg(cx, { texto: 'Policies', ruta: 'organizations/politicas' }, { texto: 'Service control policies', ruta: 'organizations/politicas/scp' }, { texto: p?.nombre ?? id });
  if (!p) return noEncontrado(cx, 'Policy', id, 'organizations/politicas/scp');
  const clave = `pol:${id}`;
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({
      titulo: p.nombre,
      info: p.id === FULL_AWS_ACCESS ? 'org-fullaccess' : 'org-scp',
      cx,
      descripcion: p.descripcion || null,
      acciones: [
        ui.boton('Delete', { escribe: true, desactivado: p.administradaPorAws, alClic: () => borrarPolitica(cx, p) }),
        ui.boton('Edit policy', { escribe: true, desactivado: p.administradaPorAws, alClic: () => cx.ir(`organizations/politicas/scp/${id}/editar`) })
      ]
    }),
    ui.contenedor({
      titulo: 'Policy details',
      cuerpo: ui.pares(
        [
          { etiqueta: 'Policy name', valor: p.nombre },
          { etiqueta: 'Policy type', valor: 'Service control policy' },
          { etiqueta: 'Type', valor: p.administradaPorAws ? 'AWS managed policy' : 'Customer managed policy' },
          { etiqueta: 'Description', valor: ui.guion(p.descripcion) },
          { etiqueta: 'Policy ID', valor: ui.copiable(p.id) },
          { etiqueta: 'ARN', valor: ui.copiable(p.arn) }
        ],
        { columnas: 3 }
      )
    }),
    ui.pestanas({
      activa: cx.memoria.orgPestana?.[clave] ?? 'objetivos',
      alCambiar: (x) => ((cx.memoria.orgPestana ??= {})[clave] = x),
      pestanas: [
        {
          id: 'objetivos',
          texto: 'Targets',
          contenido: () =>
            ui.tabla(cx, {
              titulo: 'Targets',
              info: 'org-scp',
              variante: 'contenedor',
              descripcion: 'The roots, OUs, and accounts that this policy is attached to.',
              filas: () => (org(cx)?.politicas.find((x) => x.id === id)?.objetivos ?? []).map((t) => objetivoOrganizacion(cx.estado, t)).filter(Boolean),
              clave: (x) => x.id,
              seleccion: 'unica',
              filtro: 'Find targets',
              columnas: [
                { titulo: 'Name', valor: (x) => h('span', { class: 'cx-org-nombre__fila' }, iconoOrg(x.tipo === 'ROOT' ? 'raiz' : x.tipo === 'ACCOUNT' ? 'cuenta' : 'carpeta'), ui.enlace(x.nombre, rutaObjetivo(x.id), { cx })), texto: (x) => x.nombre },
                { titulo: 'Type', valor: (x) => TIPO_OBJETIVO[x.tipo] },
                { titulo: 'ID', valor: (x) => x.id }
              ],
              acciones: (sel) => [
                ui.boton('Detach', { escribe: true, desactivado: sel.length !== 1, alClic: () => desadjuntar(cx, p, sel[0].id) }),
                ui.boton('Attach', { variante: 'primario', alClic: () => cx.ir(`organizations/politicas/scp/${id}/adjuntar`) })
              ],
              vacio: { titulo: 'No targets', texto: 'This policy isn’t attached to any root, OU, or account yet.', accion: ui.boton('Attach', { escribe: true, alClic: () => cx.ir(`organizations/politicas/scp/${id}/adjuntar`) }) }
            })
        },
        {
          id: 'contenido',
          texto: 'Content',
          contenido: () =>
            ui.contenedor({
              titulo: 'Policy content',
              acciones: [ui.boton('Edit policy', { escribe: true, desactivado: p.administradaPorAws, alClic: () => cx.ir(`organizations/politicas/scp/${id}/editar`) })],
              cuerpo: h('pre', { class: 'cx-log cx-s3-json' }, (() => {
                try {
                  return JSON.stringify(JSON.parse(p.documento), null, 4);
                } catch {
                  return p.documento;
                }
              })())
            })
        },
        { id: 'etiquetas', texto: 'Tags', desactivada: true, contenido: () => null }
      ]
    })
  );
}

/** «Attach a service control policy»: se eligen los objetivos en el árbol. */
function adjuntarPagina(cx, { id }) {
  const p = org(cx).politicas.find((x) => x.id === id);
  migasOrg(cx, { texto: 'Policies', ruta: 'organizations/politicas' }, { texto: 'Service control policies', ruta: 'organizations/politicas/scp' }, { texto: p?.nombre ?? id, ruta: `organizations/politicas/scp/${id}` }, { texto: 'Attach' });
  if (!p) return noEncontrado(cx, 'Policy', id, 'organizations/politicas/scp');
  if (!org(cx).scpHabilitadas) return scpPagina(cx);
  const elegidos = new Set();
  let error = null;
  const zona = ui.region(() => [
    arbol(cx, { elegidos, enlaces: false, alCambiar: () => zona.repintar(), desactivar: (o) => p.objetivos.includes(o.id) }),
    error ? h('div', { style: { padding: '0 20px 16px' } }, ui.alerta({ tipo: 'error', titulo: 'Failed to attach policy', contenido: error })) : null
  ]);
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: `Attach the policy '${p.nombre}'`, info: 'org-scp', cx, descripcion: 'Choose the root, OUs, or accounts. The policy affects every account under the targets you choose. Targets that already have this policy are dimmed.' }),
    ui.contenedor({ titulo: 'Targets', sinRelleno: true, cuerpo: zona }),
    ui.pieFormulario({
      cancelar: () => cx.ir(`organizations/politicas/scp/${id}`),
      textoEnviar: 'Attach policy',
      enviar: () => {
        const ids = [...elegidos];
        if (!ids.length) {
          error = 'Choose at least one target.';
          zona.repintar();
          return;
        }
        const fn = (e) => ids.forEach((t) => adjuntarPoliticaScp(e, p.id, t));
        error = probar(cx, fn);
        zona.repintar();
        if (error) return;
        const r = cx.hacer({ servicio: 'Organizations', accion: 'AttachPolicy', error: 'Failed to attach policy' }, fn, { atomico: true });
        if (r.ok) {
          const nombres = ids.map((t) => objetivoOrganizacion(cx.estado, t)?.nombre ?? t).join(', ');
          cx.flash({ tipo: 'exito', texto: `You successfully attached the policy ${p.nombre} to ${nombres}.` });
          cx.ir(`organizations/politicas/scp/${id}`);
        }
      }
    })
  );
}

/** «Attach» desde la pestaña Policies de una raíz, OU o cuenta: se eligen las SCP. */
function adjuntarAObjetivoPagina(cx, { id }) {
  const obj = objetivoOrganizacion(cx.estado, id);
  migasOrg(cx, { texto: 'AWS accounts', ruta: 'organizations/cuentas' }, { texto: obj?.nombre ?? id, ruta: rutaObjetivo(id) }, { texto: 'Attach a service control policy' });
  if (!obj) return noEncontrado(cx, 'Target', id, 'organizations/cuentas');
  if (!org(cx).scpHabilitadas) return scpPagina(cx);
  let elegidas = [];
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: `Attach a service control policy to '${obj.nombre}'`, info: 'org-scp', cx }),
    ui.tabla(cx, {
      titulo: 'Available policies',
      variante: 'contenedor',
      filas: () => (org(cx)?.politicas ?? []).filter((p) => !p.objetivos.includes(id)),
      clave: (p) => p.id,
      seleccion: 'multiple',
      filtro: 'Find policies',
      alSeleccionar: (ids) => (elegidas = ids),
      columnas: [
        { titulo: 'Name', valor: (p) => p.nombre },
        { titulo: 'Type', valor: (p) => (p.administradaPorAws ? 'AWS managed policy' : 'Customer managed policy') },
        { titulo: 'Description', valor: (p) => ui.guion(p.descripcion) }
      ],
      vacio: { titulo: 'No policies', texto: 'All the policies are already attached to this target.', accion: ui.boton('Create policy', { escribe: true, alClic: () => cx.ir('organizations/politicas/scp/crear') }) }
    }),
    ui.pieFormulario({
      cancelar: () => cx.ir(rutaObjetivo(id)),
      textoEnviar: 'Attach policy',
      enviar: () => {
        if (!elegidas.length) {
          cx.flash({ tipo: 'error', texto: 'Choose at least one policy.' });
          return;
        }
        const r = cx.hacer({ servicio: 'Organizations', accion: 'AttachPolicy', error: 'Failed to attach policy' }, (e) => elegidas.forEach((p) => adjuntarPoliticaScp(e, p, id)), { atomico: true });
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: `You successfully attached ${elegidas.length === 1 ? 'the policy' : `${elegidas.length} policies`} to ${obj.nombre}.` });
          cx.ir(rutaObjetivo(id));
        }
      }
    })
  );
}

/* ============================================================ Settings */

function configuracionPagina(cx) {
  migasOrg(cx, { texto: 'Settings' });
  const o = org(cx);
  const admin = o.cuentas.find((c) => c.admin);
  const borrar = () =>
    cx.confirmar({
      titulo: 'Delete organization?',
      palabra: o.id,
      textoBoton: 'Delete organization',
      contenido: h('p', {}, 'You can delete the organization only after you remove all member accounts. All OUs and policies are deleted too. This action can’t be undone.'),
      aceptar: () => {
        const r = cx.hacer({ servicio: 'Organizations', accion: 'DeleteOrganization', error: 'Failed to delete organization' }, (e) => eliminarOrganizacion(e));
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: `You successfully deleted the organization ${o.id}.` });
          cx.ir('organizations');
        }
        return true;
      }
    });
  const dinero = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Settings', info: 'org-organizacion', cx }),
    ui.contenedor({
      titulo: 'Organization details',
      cuerpo: ui.pares(
        [
          { etiqueta: 'Organization ID', valor: ui.copiable(o.id) },
          { etiqueta: 'Feature set', valor: 'All features' },
          { etiqueta: 'Created', valor: ui.fecha(o.creada) },
          { etiqueta: 'Management account ID', valor: ui.copiable(o.cuentaAdmin) },
          { etiqueta: 'Management account email', valor: admin?.correo },
          { etiqueta: 'ARN', valor: ui.copiable(o.arn) }
        ],
        { columnas: 3 }
      ),
      acciones: ui.boton('Delete organization', { escribe: true, alClic: borrar })
    }),
    ui.contenedor({
      titulo: 'Consolidated billing',
      info: 'org-facturacion',
      cx,
      descripcion: 'The management account pays the charges of all member accounts in one bill. Usage is combined, so the organization reaches volume pricing tiers sooner.',
      sinRelleno: true,
      cuerpo: cx.vivo(() => {
        const f = facturacionConsolidada(cx.estado);
        if (!f) return null;
        return h(
          'table',
          { class: 'cx-tabla__tabla' },
          h('thead', {}, h('tr', {}, ['Account', 'Account ID', 'Status', 'Month-to-date cost'].map((t, i) => h('th', {}, h('span', { class: ['cx-tabla__orden', i === 3 && 'cx-org-derecha'] }, t))))),
          h(
            'tbody',
            {},
            f.cuentas.map((c) =>
              h('tr', {}, h('td', { style: { paddingLeft: '20px' } }, ui.enlace(c.nombre, `organizations/cuentas/${c.id}`, { cx }), c.admin ? h('span', { class: 'cx-insignia cx-insignia--azul', style: { marginLeft: '8px' } }, 'management account') : null), h('td', { class: 'cx-mono' }, c.id), h('td', {}, estadoCuenta(c)), h('td', { class: 'cx-org-derecha' }, dinero(c.monto)))
            ),
            h('tr', { class: 'cx-org-total' }, h('td', { style: { paddingLeft: '20px' } }, h('strong', {}, 'Total (one bill)')), h('td', {}), h('td', {}), h('td', { class: 'cx-org-derecha' }, h('strong', {}, dinero(f.total))))
          )
        );
      }),
      pie: h('span', { class: 'cx-texto-sec' }, 'Vista del simulador. En AWS la ves en Billing and Cost Management → Bills, con el desglose por cuenta.')
    })
  );
}

/* ============================================================ registro */

const noDisp = (titulo) => (cx) => {
  migasOrg(cx, { texto: titulo });
  return ui.noDisponible(titulo);
};

export default {
  id: 'organizations',
  nombre: 'AWS Organizations',
  titulo: 'AWS Organizations',
  descripcion: 'Central management for multiple AWS accounts',
  categoria: 'gestion',
  claves: 'organizaciones cuentas ou scp service control policies facturacion consolidada consolidated billing',
  inicio: 'organizations',
  menu: [
    { texto: 'AWS accounts', ruta: 'organizations/cuentas' },
    { texto: 'Invitations', ruta: 'organizations/invitaciones' },
    { texto: 'AWS services', ruta: 'organizations/servicios' },
    { texto: 'Policies', ruta: 'organizations/politicas' },
    { texto: 'Settings', ruta: 'organizations/configuracion' },
    { texto: 'Get started', ruta: 'organizations/inicio' },
    { seccion: 'Related', items: [
      { texto: 'AWS Control Tower', externo: true, desactivado: true },
      { texto: 'IAM Identity Center', externo: true, desactivado: true },
      { texto: 'Billing and Cost Management', externo: true, desactivado: true }
    ] }
  ],
  rutas: {
    '': conOrg((cx) => cuentasPagina(cx)),
    inicio: (cx) => (org(cx) ? cuentasPagina(cx) : portada(cx)),
    cuentas: conOrg(cuentasPagina),
    'cuentas/agregar': conOrg(agregarCuentaPagina),
    'cuentas/:id': conOrg(detalleCuenta),
    mover: conOrg(moverPagina),
    'ous/:id': conOrg(detalleOu),
    'ous/:id/crear': conOrg(crearOuPagina),
    'adjuntar-a/:id': conOrg(adjuntarAObjetivoPagina),
    invitaciones: conOrg(invitacionesPagina),
    politicas: conOrg(politicasPagina),
    'politicas/scp': conOrg(scpPagina),
    'politicas/scp/crear': conOrg(crearPoliticaPagina),
    'politicas/scp/:id': conOrg(detallePolitica),
    'politicas/scp/:id/editar': conOrg(editarPoliticaPagina),
    'politicas/scp/:id/adjuntar': conOrg(adjuntarPagina),
    configuracion: conOrg(configuracionPagina),
    servicios: noDisp('AWS services')
  },
  busqueda: [
    { texto: 'AWS accounts', ruta: 'organizations/cuentas', claves: 'organizations cuentas ou organizational units' },
    { texto: 'Service control policies', ruta: 'organizations/politicas/scp', claves: 'scp politicas organizations deny' },
    { texto: 'Create an organization', ruta: 'organizations', claves: 'organizations crear organizacion' },
    { texto: 'Consolidated billing', ruta: 'organizations/configuracion', claves: 'facturacion consolidada organizations' }
  ],
  ayudas: {
    'org-organizacion': {
      titulo: 'AWS Organizations',
      texto: [
        'Una **organización** junta varias cuentas de AWS para administrarlas desde una sola: la **cuenta de administración** (management account).',
        'Las empresas usan una cuenta por ambiente o por equipo (Producción, Pruebas, Finanzas…): si algo sale mal en Pruebas, no toca Producción.',
        ['Organizas las cuentas en **unidades organizativas (OU)**.', 'Les pones límites con las **SCP**.', 'Pagas todo en **una sola factura** (facturación consolidada).'],
        'AWS Organizations **no cuesta**.'
      ]
    },
    'org-ou': {
      titulo: 'Unidades organizativas (OU)',
      texto: [
        'Una **OU** es una carpeta de cuentas dentro de la organización. Arriba de todo está **Root** (la raíz).',
        'Una OU puede tener cuentas y otras OU adentro (hasta 5 niveles).',
        'Lo que adjuntas a una OU (por ejemplo, una SCP) **lo heredan** todas las cuentas que tiene adentro. Por eso es más fácil poner las reglas en la OU que cuenta por cuenta.',
        'Para borrar una OU primero debe quedar **vacía**.'
      ]
    },
    'org-cuenta': {
      titulo: 'Cuentas de la organización',
      texto: [
        'Hay dos formas de sumar una cuenta: **crearla** desde la organización (nace adentro, con el rol `OrganizationAccountAccessRole` para administrarla) o **invitar** una que ya existe (la otra persona acepta).',
        'Con **Move** cambias una cuenta de OU: deja de heredar las políticas de la OU anterior y hereda las de la nueva.',
        'La cuenta con la etiqueta **management account** es la tuya: paga la factura de todas y las SCP no la afectan.'
      ]
    },
    'org-invitacion': {
      titulo: 'Invitaciones',
      texto: [
        'Para traer una cuenta que ya existe, le mandas una **invitación** (handshake) a su correo o a su ID de 12 dígitos.',
        'Mientras la otra persona no acepta, la invitación queda **Open**. En el simulador se acepta sola en unos segundos.'
      ]
    },
    'org-scp': {
      titulo: 'Service control policies (SCP)',
      texto: [
        'Una **SCP** pone el **techo** de lo que pueden hacer los usuarios y roles de una cuenta. **No da permisos**: los permisos los sigue dando IAM.',
        'Lo que se puede hacer es lo que **IAM permite Y la SCP no niega**.',
        'Primero se activan con **Enable service control policies**. AWS pone `FullAWSAccess` (permite todo) en Root, en cada OU y en cada cuenta.',
        'Luego creas tu propia SCP con un `Deny` (por ejemplo `"Action": "rds:*"`) y la adjuntas (**Attach**) a una OU: ninguna cuenta de esa OU podrá usar RDS.',
        ['Las SCP **no afectan** a la cuenta de administración.', 'Un objetivo nunca se queda sin SCP: para quitar FullAWSAccess, primero adjunta otra.']
      ]
    },
    'org-fullaccess': {
      titulo: 'FullAWSAccess',
      texto: [
        '`FullAWSAccess` es la SCP administrada por AWS que dice `Allow *`: deja pasar todo lo que IAM permita.',
        'Si la quitas de una OU y no pones otra que diga `Allow`, las cuentas de esa OU no pueden hacer **nada** (deny implícito). Así funciona la estrategia de «lista de permitidos».'
      ]
    },
    'org-deny': {
      titulo: 'El «explicit deny» de una SCP',
      texto: [
        'Así decide AWS si una acción pasa:',
        ['Si alguna SCP en Root, en la OU o en la cuenta dice **Deny** para la acción → **negada** (explicit deny). Siempre gana.', 'Si en algún nivel ninguna SCP dice **Allow** → **negada** (deny implícito).', 'Si pasa las SCP, todavía **IAM** tiene que permitirla.'],
        'Es el mensaje que salía en los laboratorios de DataCamp: `… is not authorized to perform: rds:CreateDBCluster … with an explicit deny in a service control policy`. El sandbox tenía una SCP que negaba ese servicio.'
      ]
    },
    'org-facturacion': {
      titulo: 'Facturación consolidada',
      texto: [
        'Con Organizations, la cuenta de administración recibe **una sola factura** con el gasto de todas las cuentas.',
        'Como el uso se **suma**, la organización llega antes a los precios por volumen (por ejemplo, S3 o la transferencia de datos bajan de precio con más uso) y comparte los descuentos de Savings Plans y reservas.',
        'Cada cuenta se sigue viendo por separado en el desglose, para saber quién gastó qué.'
      ]
    }
  }
};
