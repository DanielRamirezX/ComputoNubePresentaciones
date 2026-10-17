// ---------------------------------------------------------------------------
// IAM
//
// El tablero (recomendaciones de seguridad, conteos, la cuenta), usuarios con
// su asistente de 3 pasos y su detalle (Permissions, Groups, Security
// credentials: MFA y llaves de acceso), grupos, roles con su asistente
// (AWS service → EC2) y la lista de políticas administradas con su JSON.
//
// Todo cambio pasa por cx.hacer con las acciones de modelo.js. Los asistentes
// revisan el nombre con la misma acción del modelo sobre una copia del estado
// (probar), para que el error salga junto al campo con el mensaje de AWS.
// ---------------------------------------------------------------------------

import * as ui from '../ui.js';
import {
  POLITICAS_IAM,
  politicaIam,
  clonar,
  vivas,
  crearUsuario,
  eliminarUsuario,
  editarAccesoConsola,
  gruposDeUsuario,
  agregarUsuariosAGrupo,
  quitarUsuarioDeGrupo,
  adjuntarPoliticasUsuario,
  quitarPoliticaUsuario,
  asignarMfa,
  quitarMfa,
  asignarMfaRaiz,
  crearLlaveAcceso,
  cambiarLlaveAcceso,
  eliminarLlaveAcceso,
  crearGrupoIam,
  eliminarGrupoIam,
  adjuntarPoliticasGrupo,
  quitarPoliticaGrupo,
  crearRol,
  eliminarRol,
  adjuntarPoliticasRol,
  quitarPoliticaRol
} from '../modelo.js';

const { h, icono } = ui;

/* ============================================================ utilidades */

const MESES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dos = (n) => String(n).padStart(2, '0');

/** «October 16, 2026, 10:23 (UTC-06:00)», como en IAM. */
function fechaIam(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  const off = -d.getTimezoneOffset();
  const a = Math.abs(off);
  return `${MESES[d.getMonth()]} ${dos(d.getDate())}, ${d.getFullYear()}, ${dos(d.getHours())}:${dos(d.getMinutes())} (UTC${off >= 0 ? '+' : '-'}${dos(Math.floor(a / 60))}:${dos(a % 60)})`;
}

/** Antigüedad corta: «3 minutes», «2 hours», «5 days». */
function edad(iso) {
  if (!iso) return '–';
  const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'}`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'}`;
  const dias = Math.floor(hrs / 24);
  return `${dias} day${dias === 1 ? '' : 's'}`;
}

const enc = encodeURIComponent;
const rutaUsuario = (n, resto = '') => `iam/usuarios/${enc(n)}${resto ? `/${resto}` : ''}`;
const rutaGrupo = (n, resto = '') => `iam/grupos/${enc(n)}${resto ? `/${resto}` : ''}`;
const rutaRol = (n, resto = '') => `iam/roles/${enc(n)}${resto ? `/${resto}` : ''}`;
const rutaPolitica = (n) => `iam/politicas/${enc(n)}`;

const usuarioDe = (cx, n) => cx.estado.iam.usuarios.find((u) => u.nombre === n) ?? null;
const grupoDe = (cx, n) => cx.estado.iam.grupos.find((g) => g.nombre === n) ?? null;
const rolDe = (cx, n) => cx.estado.iam.roles.find((r) => r.nombre === n) ?? null;

/** Corre una acción del modelo sobre una copia: devuelve el mensaje de error o null (no cambia nada). */
function probar(cx, fn) {
  try {
    fn(clonar(cx.estado));
    return null;
  } catch (e) {
    return e?.message ?? String(e);
  }
}

/** Recuerda y recupera la pestaña de un detalle (para volver a ella tras un cambio). */
const pestanaDe = (cx, clave, porOmision) => cx.memoria.iamPestana?.[clave] ?? porOmision;
function recordar(cx, clave, id) {
  cx.memoria.iamPestana ??= {};
  cx.memoria.iamPestana[clave] = id;
}
/** Vuelve a pintar la pantalla actual (tras una acción en una pestaña). */
const recargar = (cx) => cx.ir(cx.ruta);

const migasIam = (cx, ...resto) => cx.migas([{ texto: 'IAM', ruta: 'iam' }, ...resto]);

function noEncontrado(cx, tipo, nombre, rutaLista) {
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.alerta({ tipo: 'error', titulo: `${tipo} not found`, contenido: [`The ${tipo.toLowerCase()} with name ${nombre} cannot be found. `, ui.enlace('View all', rutaLista, { cx })] })
  );
}

const errorCampo = (texto) => (texto ? h('div', { class: 'cx-campo__error', role: 'alert' }, icono('status-negative'), h('span', {}, texto)) : null);

function contrasenaAzar() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()_+-=[]{}|';
  let s = '';
  for (let i = 0; i < 16; i++) s += letras[Math.floor(Math.random() * letras.length)];
  return s;
}

function secretoAzar() {
  const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let s = '';
  for (let i = 0; i < 40; i++) s += letras[Math.floor(Math.random() * letras.length)];
  return s;
}

const codigoAzar = () => String(Math.floor(Math.random() * 1000000)).padStart(6, '0');

/* ============================================================ políticas */

// Las que viven en la ruta /job-function/ de AWS.
const RUTA_FUNCION = new Set(['ViewOnlyAccess', 'Billing']);
const arnPolitica = (n) => `arn:aws:iam::aws:policy/${RUTA_FUNCION.has(n) ? 'job-function/' : ''}${n}`;

/** Cuántos usuarios, grupos y roles tienen puesta la política. */
function entidadesCon(estado, nombre) {
  const { usuarios, grupos, roles } = estado.iam;
  return [
    ...usuarios.filter((u) => u.politicas.includes(nombre)).map((u) => ({ nombre: u.nombre, tipo: 'User', ruta: rutaUsuario(u.nombre) })),
    ...grupos.filter((g) => g.politicas.includes(nombre)).map((g) => ({ nombre: g.nombre, tipo: 'Group', ruta: rutaGrupo(g.nombre) })),
    ...roles.filter((r) => r.politicas.includes(nombre)).map((r) => ({ nombre: r.nombre, tipo: 'Role', ruta: rutaRol(r.nombre) }))
  ];
}

// Acciones de lectura típicas de cada servicio (para armar el JSON de las políticas).
const LECTURA = {
  ec2: ['ec2:Describe*', 'elasticloadbalancing:Describe*', 'cloudwatch:ListMetrics', 'cloudwatch:GetMetricStatistics', 'cloudwatch:Describe*', 'autoscaling:Describe*'],
  s3: ['s3:Get*', 's3:List*', 's3:Describe*', 's3-object-lambda:Get*', 's3-object-lambda:List*'],
  vpc: ['ec2:DescribeVpcs', 'ec2:DescribeSubnets', 'ec2:DescribeRouteTables', 'ec2:DescribeInternetGateways', 'ec2:DescribeNatGateways', 'ec2:DescribeNetworkAcls', 'ec2:DescribeSecurityGroups'],
  iam: ['iam:GenerateCredentialReport', 'iam:Get*', 'iam:List*', 'iam:SimulateCustomPolicy', 'iam:SimulatePrincipalPolicy'],
  rds: ['rds:Describe*', 'rds:ListTagsForResource', 'ec2:DescribeAccountAttributes', 'ec2:DescribeAvailabilityZones'],
  cloudwatch: ['cloudwatch:Describe*', 'cloudwatch:Get*', 'cloudwatch:List*', 'logs:Get*', 'logs:Describe*'],
  cloudtrail: ['cloudtrail:Get*', 'cloudtrail:Describe*', 'cloudtrail:List*', 'cloudtrail:LookupEvents'],
  billing: ['aws-portal:View*', 'budgets:ViewBudget', 'ce:Get*', 'cur:Describe*']
};

/** El documento JSON de una política administrada (aproximado al real). */
function documentoPolitica(nombre) {
  const p = politicaIam(nombre);
  const doc = (declaraciones) => ({ Version: '2012-10-17', Statement: declaraciones });
  const permite = (Action, Resource = '*', extra = {}) => ({ Effect: 'Allow', Action, Resource, ...extra });
  switch (nombre) {
    case 'AdministratorAccess':
      return doc([permite('*')]);
    case 'PowerUserAccess':
      return doc([
        { Effect: 'Allow', NotAction: ['iam:*', 'organizations:*', 'account:*'], Resource: '*' },
        permite(['account:GetAccountInformation', 'account:GetPrimaryEmail', 'account:ListRegions', 'iam:CreateServiceLinkedRole', 'iam:DeleteServiceLinkedRole', 'iam:ListRoles', 'organizations:DescribeOrganization'])
      ]);
    case 'ReadOnlyAccess':
    case 'ViewOnlyAccess':
    case 'SecurityAudit':
      return doc([permite(['ec2:Describe*', 's3:Get*', 's3:List*', 'iam:Get*', 'iam:List*', 'rds:Describe*', 'cloudwatch:Describe*', 'cloudtrail:Describe*', '…'])]);
    case 'IAMUserChangePassword':
      return doc([permite(['iam:ChangePassword'], ['arn:aws:iam::*:user/${aws:username}']), permite(['iam:GetAccountPasswordPolicy'])]);
    case 'AmazonSSMManagedInstanceCore':
      return doc([permite(['ssm:DescribeAssociation', 'ssm:GetDeployablePatchSnapshotForInstance', 'ssm:GetDocument', 'ssm:DescribeDocument', 'ssm:GetManifest', 'ssm:GetParameter', 'ssm:GetParameters', 'ssm:ListAssociations', 'ssm:ListInstanceAssociations', 'ssm:PutInventory', 'ssm:PutComplianceItems', 'ssm:PutConfigurePackageResult', 'ssm:UpdateAssociationStatus', 'ssm:UpdateInstanceAssociationStatus', 'ssm:UpdateInstanceInformation']), permite(['ssmmessages:CreateControlChannel', 'ssmmessages:CreateDataChannel', 'ssmmessages:OpenControlChannel', 'ssmmessages:OpenDataChannel']), permite(['ec2messages:*'])]);
    case 'AmazonEC2FullAccess':
      return doc([permite('ec2:*'), permite('elasticloadbalancing:*'), permite('cloudwatch:*'), permite('autoscaling:*'), permite('iam:CreateServiceLinkedRole', '*', { Condition: { StringEquals: { 'iam:AWSServiceName': ['autoscaling.amazonaws.com', 'ec2scheduled.amazonaws.com', 'elasticloadbalancing.amazonaws.com'] } } })]);
    case 'AmazonS3FullAccess':
      return doc([permite(['s3:*', 's3-object-lambda:*'])]);
    case 'AmazonVPCFullAccess':
      return doc([permite(['ec2:*Vpc*', 'ec2:*Subnet*', 'ec2:*Gateway*', 'ec2:*Route*', 'ec2:*NetworkAcl*', 'ec2:*SecurityGroup*', 'ec2:*Address*', 'ec2:Describe*'])]);
    default:
      if (!p) return doc([]);
      if (p.acceso === 'lectura') return doc([permite(LECTURA[p.servicio] ?? [`${p.servicio}:Get*`, `${p.servicio}:List*`, `${p.servicio}:Describe*`])]);
      return doc([permite(`${p.servicio === 'billing' ? 'aws-portal' : p.servicio}:*`)]);
  }
}

const jsonPolitica = (n) => JSON.stringify(documentoPolitica(n), null, 4);

/** Tabla de políticas administradas con filtro y casillas (asistentes y «Attach policies»). */
function tablaPoliticas(cx, { titulo = 'Permissions policies', seleccionados = [], alSeleccionar, excluir = () => [], variante = 'contenedor', descripcion } = {}) {
  return ui.tabla(cx, {
    titulo,
    info: 'iam-politica',
    variante,
    descripcion: descripcion ?? 'Choose one or more policies to attach to your new user.',
    filas: () => POLITICAS_IAM.filter((p) => !excluir().includes(p.nombre)),
    clave: (p) => p.nombre,
    seleccion: 'multiple',
    seleccionados,
    filtro: 'Search',
    columnas: [
      { titulo: 'Policy name', valor: (p) => h('span', { class: 'cx-iam-politica' }, icono('external', 'cx-icono--chico'), p.nombre), texto: (p) => p.nombre },
      { titulo: 'Type', valor: (p) => p.tipo },
      { titulo: 'Attached entities', valor: (p) => String(entidadesCon(cx.estado, p.nombre).length) }
    ],
    alSeleccionar
  });
}

/** Tabla de grupos con casillas (asistente de usuario y «Add user to groups»). */
function tablaGrupos(cx, { seleccionados = [], alSeleccionar, excluir = () => [], titulo = 'User groups', acciones } = {}) {
  return ui.tabla(cx, {
    titulo,
    info: 'iam-grupo',
    variante: 'contenedor',
    filas: () => cx.estado.iam.grupos.filter((g) => !excluir().includes(g.nombre)),
    clave: (g) => g.nombre,
    seleccion: 'multiple',
    seleccionados,
    filtro: 'Search',
    columnas: [
      { titulo: 'Group name', valor: (g) => g.nombre },
      { titulo: 'Users', valor: (g) => String(cx.estado.iam.usuarios.filter((u) => u.grupos.includes(g.nombre)).length) },
      { titulo: 'Attached policies', valor: (g) => (g.politicas.length ? g.politicas.join(', ') : '–') },
      { titulo: 'Created', valor: (g) => edad(g.creado) + ' ago' }
    ],
    acciones: acciones ? () => acciones : undefined,
    vacio: { titulo: 'No resources to display', texto: 'There are no user groups in this account.' },
    alSeleccionar
  });
}

/* ============================================================ asistentes */

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
          h(
            'li',
            { class: ['cx-asis__paso', i === paso && 'cx-asis__paso--actual', i > paso && 'cx-asis__paso--futuro'], 'aria-current': i === paso ? 'step' : undefined },
            h('small', {}, `Step ${i + 1}`),
            h('span', {}, p)
          )
        )
      )
    ),
    h('div', { class: 'cx-asis__cuerpo cx-pagina' }, ui.encabezado({ titulo, info, cx, descripcion }), cuerpo, pie)
  );
}

/** Pie de un asistente: Cancel, Previous (si no es el primer paso) y el botón naranja. */
function pieAsistente({ cancelar, anterior, siguiente, textoSiguiente = 'Next' }) {
  return h(
    'div',
    { class: 'cx-pie-form' },
    ui.boton('Cancel', { variante: 'texto', alClic: cancelar }),
    anterior ? ui.boton('Previous', { alClic: anterior }) : null,
    ui.boton(textoSiguiente, { variante: 'primario', alClic: siguiente })
  );
}

/* ============================================================ dashboard */

function tablero(cx) {
  migasIam(cx, { texto: 'Dashboard' });
  const { usuarios, grupos, roles, raizMfa } = cx.estado.iam;
  const id = cx.estado.cuenta.id;
  const url = `https://${id}.signin.aws.amazon.com/console`;
  const recomendacion = (ok, titulo, texto, accion) =>
    h(
      'div',
      { class: 'cx-iam-recomendacion' },
      ok ? ui.estado('exito', titulo) : ui.estado('error', titulo),
      h('p', { class: 'cx-texto-sec' }, texto),
      accion ? h('div', {}, accion) : null
    );
  const numero = (texto, n, ruta) => h('div', { class: 'cx-iam-recurso' }, h('div', { class: 'cx-texto-sec' }, texto), ruta ? ui.enlace(String(n), ruta, { cx, clase: 'cx-iam-recurso__n' }) : h('span', { class: 'cx-iam-recurso__n' }, String(n)));
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'IAM Dashboard', info: 'iam-usuario', cx }),
    h(
      'div',
      { class: 'cx-dos-columnas' },
      h(
        'div',
        { class: 'cx-pagina' },
        ui.contenedor({
          titulo: 'Security recommendations',
          info: 'iam-mfa',
          cx,
          contador: raizMfa ? 0 : 1,
          cuerpo: [
            raizMfa
              ? recomendacion(true, 'Root user has MFA', 'Having multi-factor authentication (MFA) for the root user improves security for this account.')
              : recomendacion(false, 'Add MFA for root user', 'Add MFA for root user - Enable multi-factor authentication (MFA) for the root user to improve security for this account.', ui.boton('Add MFA', { variante: 'primario', alClic: () => cx.ir('iam/mfa-raiz') })),
            recomendacion(true, 'Root user has no active access keys', 'Using access keys attached to an IAM user instead of the root user improves security.'),
            usuarios.some((u) => u.llavesAcceso.some((k) => k.estado === 'Active'))
              ? h('div', { class: 'cx-iam-recomendacion' }, ui.estado('aviso', 'IAM users have active access keys'), h('p', { class: 'cx-texto-sec' }, 'Rotate or remove access keys that are not needed. Use IAM roles for applications running on AWS instead.'))
              : null
          ]
        }),
        ui.contenedor({
          titulo: 'IAM resources',
          descripcion: 'Resources in this AWS Account',
          cuerpo: h(
            'div',
            { class: 'cx-iam-recursos' },
            numero('User groups', grupos.length, 'iam/grupos'),
            numero('Users', usuarios.length, 'iam/usuarios'),
            numero('Roles', roles.length, 'iam/roles'),
            numero('Policies', 0, 'iam/politicas'),
            numero('Identity providers', 0)
          )
        }),
        ui.contenedor({ titulo: 'What’s new', cuerpo: h('p', { class: 'cx-texto-sec' }, 'Updates for features in IAM. (No disponible en el simulador.)') })
      ),
      h(
        'div',
        { class: 'cx-lado' },
        ui.contenedor({
          titulo: 'AWS Account',
          cuerpo: ui.pares(
            [
              { etiqueta: 'Account ID', valor: ui.copiable(id) },
              { etiqueta: 'Account Alias', valor: h('span', {}, '–  ', ui.enlace('Create', () => cx.flash({ tipo: 'info', texto: 'Los alias de cuenta no están disponibles en el simulador.' }))) },
              { etiqueta: 'Sign-in URL for IAM users in this account', valor: ui.copiable(url) }
            ],
            { columnas: 1 }
          )
        }),
        ui.contenedor({
          titulo: 'Quick Links',
          cuerpo: h('div', {}, ui.enlace('My security credentials', 'iam/credenciales', { cx }), h('p', { class: 'cx-texto-sec' }, 'Manage your access keys, multi-factor authentication (MFA) and other credentials.'))
        }),
        ui.contenedor({ titulo: 'Tools', cuerpo: h('div', {}, h('span', { class: 'cx-enlace cx-enlace--apagado' }, 'Policy simulator', icono('external', 'cx-icono--chico')), h('p', { class: 'cx-texto-sec' }, 'The simulator evaluates the policies that you choose and determines the effective permissions for each of the actions that you specify.')) })
      )
    )
  );
}

/** «My security credentials» de la raíz: MFA y llaves de acceso. */
function credencialesRaiz(cx) {
  migasIam(cx, { texto: 'My security credentials' });
  const raizMfa = cx.estado.iam.raizMfa;
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'My security credentials', info: 'iam-raiz', cx, descripcion: 'Root user for this account.' }),
    ui.alerta({ tipo: 'info', contenido: 'The root user has access to all AWS resources in this account, and this access can’t be limited. We recommend that you use the root user only for the tasks that require it.' }),
    ui.contenedor({
      titulo: 'Multi-factor authentication (MFA)',
      contador: raizMfa ? 1 : 0,
      info: 'iam-mfa',
      cx,
      acciones: ui.boton('Assign MFA device', { escribe: true, desactivado: raizMfa, alClic: () => cx.ir('iam/mfa-raiz') }),
      descripcion: 'Use MFA to increase the security of your AWS environment. Signing in with MFA requires an authentication code from an MFA device.',
      cuerpo: raizMfa
        ? ui.pares([{ etiqueta: 'Type', valor: 'Virtual' }, { etiqueta: 'Identifier', valor: `arn:aws:iam::${cx.estado.cuenta.id}:mfa/root-account-mfa-device` }], { columnas: 2 })
        : h('div', { class: 'cx-tabla__vacia' }, h('b', {}, 'No MFA devices'), h('div', {}, 'Assign an MFA device to improve the security of your AWS environment.'))
    }),
    ui.contenedor({ titulo: 'Access keys', contador: 0, info: 'iam-llaves', cx, acciones: ui.boton('Create access key', { desactivado: true, titulo: 'No crees llaves para la raíz' }), cuerpo: h('div', { class: 'cx-tabla__vacia' }, h('b', {}, 'No access keys'), h('div', {}, 'As a best practice, avoid using long-term credentials like access keys for the root user.')) })
  );
}

/* ============================================================ usuarios */

function usuarios(cx) {
  migasIam(cx, { texto: 'Users' });
  const t = ui.tabla(cx, {
    titulo: 'Users',
    info: 'iam-usuario',
    descripcion: 'An IAM user is an identity with long-term credentials that is used to interact with AWS in an account.',
    filas: () => cx.estado.iam.usuarios,
    clave: (u) => u.nombre,
    seleccion: 'multiple',
    filtro: 'Search',
    columnas: [
      { titulo: 'User name', valor: (u) => ui.enlace(u.nombre, rutaUsuario(u.nombre), { cx }), texto: (u) => u.nombre },
      { titulo: 'Path', valor: () => '/' },
      { titulo: 'Groups', valor: (u) => String(u.grupos.length) },
      { titulo: 'Last activity', valor: () => '–' },
      { titulo: 'MFA', valor: (u) => (u.mfa.length ? u.mfa.map((m) => TIPO_MFA[m.tipo] ?? 'Virtual').join(', ') : '–') },
      { titulo: 'Password age', valor: (u) => (u.consola ? edad(u.creado) : '–') },
      { titulo: 'Console last sign-in', valor: (u) => (u.consola ? 'Never' : '–') },
      { titulo: 'Access key ID', valor: (u) => (u.llavesAcceso.length ? u.llavesAcceso.map((k) => `${k.estado} - ${k.id}`).join(', ') : '–') },
      { titulo: 'Active key age', valor: (u) => { const k = u.llavesAcceso.find((x) => x.estado === 'Active'); return k ? edad(k.creado) : '–'; } }
    ],
    acciones: (sel) => [
      ui.boton('Delete', { escribe: true, desactivado: !sel.length, alClic: () => borrarUsuarios(cx, sel.map((u) => u.nombre)) }),
      ui.boton('Create user', { variante: 'primario', alClic: () => cx.ir('iam/usuarios/crear') })
    ],
    vacio: { titulo: 'No resources to display', texto: 'There are no IAM users in this account.', accion: ui.boton('Create user', { escribe: true, alClic: () => cx.ir('iam/usuarios/crear') }) }
  });
  return h('div', { class: 'cx-pagina' }, t);
}

const TIPO_MFA = { virtual: 'Virtual', llave: 'Passkey or security key', hardware: 'Hardware TOTP' };

function borrarUsuarios(cx, nombres, { alTerminar } = {}) {
  cx.confirmar({
    titulo: nombres.length === 1 ? `Delete ${nombres[0]}?` : `Delete ${nombres.length} users?`,
    palabra: 'confirm',
    textoBoton: 'Delete user',
    contenido: [
      h('p', {}, 'Deleting a user permanently removes the user and its access keys, MFA devices, passwords and group memberships. This action can’t be undone.'),
      h('ul', {}, nombres.map((n) => h('li', {}, h('b', {}, n))))
    ],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'IAM', accion: 'DeleteUser', error: 'Failed to delete user' }, (e) => nombres.forEach((n) => eliminarUsuario(e, n)), { atomico: true });
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: nombres.length === 1 ? `User ${nombres[0]} deleted.` : `${nombres.length} users deleted.` });
        alTerminar ? alTerminar() : cx.ir('iam/usuarios');
      }
      return true;
    }
  });
}

/** Los grupos y políticas directas que quedan según la opción de permisos elegida. */
function permisosElegidos(cx, f) {
  if (f.opcion === 'grupo') return { grupos: [...f.grupos], politicas: [] };
  if (f.opcion === 'copiar') {
    const u = usuarioDe(cx, f.copiarDe);
    return { grupos: [...(u?.grupos ?? [])], politicas: [...(u?.politicas ?? [])] };
  }
  return { grupos: [], politicas: [...f.politicas] };
}

/** Las tres tarjetas de «Permissions options» y su tabla (crear usuario y «Add permissions»). */
function opcionesPermisos(cx, f, repintar, { excluirGrupos = () => [], excluirPoliticas = () => [], nombreUsuario } = {}) {
  return [
    ui.contenedor({
      titulo: 'Permissions options',
      info: 'iam-grupo',
      cx,
      cuerpo: ui.tarjetas({
        columnas: 3,
        valor: f.opcion,
        alCambiar: (v) => {
          f.opcion = v;
          repintar();
        },
        opciones: [
          { valor: 'grupo', etiqueta: 'Add user to group', descripcion: 'Add user to an existing group, or create a new group. We recommend using groups to manage user permissions by job function.' },
          { valor: 'copiar', etiqueta: 'Copy permissions', descripcion: 'Copy all group memberships, attached managed policies, and inline policies from an existing user.' },
          { valor: 'directo', etiqueta: 'Attach policies directly', descripcion: 'Attach a managed policy directly to a user. As a best practice, we recommend attaching policies to a group instead. Then, add the user to the appropriate group.' }
        ]
      })
    }),
    f.opcion === 'grupo'
      ? tablaGrupos(cx, {
          seleccionados: f.grupos,
          excluir: excluirGrupos,
          alSeleccionar: (ids) => (f.grupos = ids),
          acciones: [ui.boton('Create group', { escribe: true, alClic: () => modalCrearGrupo(cx, (g) => (f.grupos.push(g.nombre), repintar())) })]
        })
      : null,
    f.opcion === 'copiar'
      ? ui.tabla(cx, {
          titulo: 'Users',
          info: 'iam-usuario',
          variante: 'contenedor',
          filas: () => cx.estado.iam.usuarios.filter((u) => u.nombre !== nombreUsuario),
          clave: (u) => u.nombre,
          seleccion: 'unica',
          seleccionados: f.copiarDe ? [f.copiarDe] : [],
          filtro: 'Search',
          columnas: [
            { titulo: 'User name', valor: (u) => u.nombre },
            { titulo: 'Groups', valor: (u) => (u.grupos.length ? u.grupos.join(', ') : '–') },
            { titulo: 'Attached policies', valor: (u) => (u.politicas.length ? u.politicas.join(', ') : '–') }
          ],
          vacio: { titulo: 'No resources to display', texto: 'There are no other users to copy from.' },
          alSeleccionar: (ids) => (f.copiarDe = ids[0] ?? null)
        })
      : null,
    f.opcion === 'directo'
      ? [
          ui.alerta({ tipo: 'info', contenido: 'Mínimo privilegio: lo recomendado es dar permisos a un grupo y meter al usuario en él, no ponérselos directo.' }),
          tablaPoliticas(cx, { seleccionados: f.politicas, excluir: excluirPoliticas, alSeleccionar: (ids) => (f.politicas = ids) })
        ]
      : null,
    ui.expandible({ titulo: 'Set permissions boundary - optional', contenido: h('p', { class: 'cx-texto-sec' }, 'Set a permissions boundary to control the maximum permissions for this user. (No disponible en el simulador.)') })
  ];
}

/** «Create user group» desde el asistente de usuario (modal). */
function modalCrearGrupo(cx, alCrear) {
  const f = { nombre: '', politicas: [] };
  let error = null;
  const zonaError = ui.region(() => errorCampo(error));
  const crear = () => {
    const r = cx.hacer({ servicio: 'IAM', accion: 'CreateGroup', error: 'Failed to create user group' }, (e) => crearGrupoIam(e, { nombre: f.nombre, politicas: f.politicas }), { flash: false });
    if (!r.ok) {
      error = r.error?.message ?? String(r.error);
      zonaError.repintar();
      return;
    }
    m.cerrar();
    cx.flash({ tipo: 'exito', texto: `${r.valor.nombre} user group created.` });
    alCrear(r.valor);
  };
  const m = cx.modal({
    titulo: 'Create user group',
    ancho: 'grande',
    contenido: [
      ui.campo({
        etiqueta: 'User group name',
        info: 'iam-grupo',
        cx,
        control: h('div', {}, ui.entrada({ placeholder: 'Enter a group name', alCambiar: (v) => (f.nombre = v) }), zonaError),
        restriccion: 'Maximum 128 characters. Use alphanumeric and ‘+=,.@-_’ characters.'
      }),
      h('div', { style: { marginTop: '16px' } }, tablaPoliticas(cx, { variante: 'simple', descripcion: '', alSeleccionar: (ids) => (f.politicas = ids) }))
    ],
    pie: [ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }), ui.boton('Create user group', { variante: 'primario', alClic: crear })]
  });
}

/** Tabla de resumen de permisos (paso de revisión). */
function resumenPermisos(cx, { grupos, politicas }) {
  const filas = [...grupos.map((g) => ({ nombre: g, tipo: 'Group', uso: 'Permissions group' })), ...politicas.map((p) => ({ nombre: p, tipo: politicaIam(p)?.tipo ?? 'AWS managed', uso: 'Permissions policy' }))];
  return ui.tabla(cx, {
    titulo: 'Permissions summary',
    variante: 'contenedor',
    filas: () => filas,
    clave: (x) => `${x.tipo}|${x.nombre}`,
    filtro: false,
    paginacion: false,
    columnas: [
      { titulo: 'Name', valor: (x) => x.nombre },
      { titulo: 'Type', valor: (x) => x.tipo },
      { titulo: 'Used as', valor: (x) => x.uso }
    ],
    vacio: { titulo: 'No resources', texto: 'No permissions were selected. The user will have no permissions.' }
  });
}

function crearUsuarioPagina(cx) {
  migasIam(cx, { texto: 'Users', ruta: 'iam/usuarios' }, { texto: 'Create user' });
  const f = { paso: 0, nombre: '', consola: false, persona: 'iam', contrasena: 'auto', propia: '', cambiar: true, opcion: 'grupo', grupos: [], copiarDe: null, politicas: [], etiquetas: [] };
  const errores = {};
  const pasos = ['Specify user details', 'Set permissions', 'Review and create'];

  const zona = ui.region(() => {
    let cuerpo;
    if (f.paso === 0) {
      cuerpo = ui.contenedor({
        titulo: 'User details',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.campo({
            etiqueta: 'User name',
            info: 'iam-usuario',
            cx,
            control: ui.entrada({ valor: f.nombre, etiquetaAccesible: 'User name', alCambiar: (v) => (f.nombre = v) }),
            restriccion: 'The user name can have up to 64 characters. Valid characters: A-Z, a-z, 0-9, and + = , . @ _ - (hyphen)',
            error: errores.nombre
          }),
          ui.casilla({
            etiqueta: h('span', {}, 'Provide user access to the AWS Management Console', h('i', {}, ' - optional')),
            descripcion: 'If you’re providing console access to a person, it’s a best practice to manage their access in IAM Identity Center.',
            marcada: f.consola,
            alCambiar: (v) => ((f.consola = v), zona.repintar())
          }),
          f.consola
            ? [
                ui.alerta({
                  tipo: 'info',
                  titulo: 'Are you providing console access to a person?',
                  contenido: [
                    h('p', {}, 'User type'),
                    ui.radios({
                      valor: f.persona,
                      alCambiar: (v) => (f.persona = v),
                      opciones: [
                        { valor: 'centro', etiqueta: 'Specify a user in Identity Center - Recommended', descripcion: 'We recommend that you use Identity Center to provide console access to a person.', desactivado: true },
                        { valor: 'iam', etiqueta: 'I want to create an IAM user', descripcion: 'We recommend that you create IAM users only if you need to enable programmatic access through access keys, service-specific credentials for AWS CodeCommit or Amazon Keyspaces, or a backup credential for emergency account access.' }
                      ]
                    })
                  ]
                }),
                ui.campo({
                  etiqueta: 'Console password',
                  info: 'iam-consola',
                  cx,
                  control: ui.radios({
                    valor: f.contrasena,
                    alCambiar: (v) => ((f.contrasena = v), zona.repintar()),
                    opciones: [
                      { valor: 'auto', etiqueta: 'Autogenerated password', descripcion: 'You can view the password after you create the user.' },
                      { valor: 'propia', etiqueta: 'Custom password', descripcion: 'Enter a custom password for the user.' }
                    ]
                  })
                }),
                f.contrasena === 'propia'
                  ? ui.campo({
                      etiqueta: 'Password',
                      control: ui.entrada({ tipo: 'password', valor: f.propia, alCambiar: (v) => (f.propia = v) }),
                      restriccion: 'Must be at least 8 characters long. Must include at least three of the following mix of character types: uppercase letters (A-Z), lowercase letters (a-z), numbers (0-9), and symbols ! @ # $ % ^ & * ( ) _ + - (hyphen) = [ ] { } | ’',
                      error: errores.contrasena
                    })
                  : null,
                ui.casilla({
                  etiqueta: 'Users must create a new password at next sign-in - Recommended',
                  descripcion: 'Users automatically get the IAMUserChangePassword policy to allow them to change their own password.',
                  marcada: f.cambiar,
                  alCambiar: (v) => (f.cambiar = v)
                })
              ]
            : null
        )
      });
    } else if (f.paso === 1) {
      cuerpo = opcionesPermisos(cx, f, () => zona.repintar());
    } else {
      const p = permisosElegidos(cx, f);
      cuerpo = [
        ui.contenedor({
          titulo: 'User details',
          cuerpo: ui.pares(
            [
              { etiqueta: 'User name', valor: f.nombre.trim() },
              { etiqueta: 'Console password type', valor: f.consola ? (f.contrasena === 'auto' ? 'Autogenerated' : 'Custom password') : 'None' },
              { etiqueta: 'Require password reset', valor: f.consola && f.cambiar ? 'Yes' : 'No' }
            ],
            { columnas: 3 }
          )
        }),
        resumenPermisos(cx, p),
        ui.contenedor({ titulo: 'Tags - optional', descripcion: 'Tags are key-value pairs you can add to AWS resources to help identify, organize, or search for resources.', cuerpo: ui.editorEtiquetas({ filas: f.etiquetas }) })
      ];
    }
    return asistente(cx, {
      pasos,
      paso: f.paso,
      titulo: pasos[f.paso],
      info: 'iam-usuario',
      cuerpo,
      pie: pieAsistente({
        cancelar: () => cx.ir('iam/usuarios'),
        anterior: f.paso > 0 ? () => ((f.paso -= 1), zona.repintar()) : null,
        siguiente: f.paso < 2 ? siguiente : crear,
        textoSiguiente: f.paso < 2 ? 'Next' : 'Create user'
      })
    });
  });

  function siguiente() {
    if (f.paso === 0) {
      errores.nombre = probar(cx, (e) => crearUsuario(e, { nombre: f.nombre }));
      errores.contrasena = f.consola && f.contrasena === 'propia' && !contrasenaValida(f.propia) ? 'Password does not meet the password policy requirements.' : null;
      if (errores.nombre || errores.contrasena) return zona.repintar();
    }
    if (f.paso === 1 && f.opcion === 'copiar' && !f.copiarDe) {
      cx.flash({ tipo: 'error', texto: 'Choose a user to copy permissions from.' });
      return;
    }
    f.paso += 1;
    zona.repintar();
  }

  function crear() {
    const p = permisosElegidos(cx, f);
    const r = cx.hacer({ servicio: 'IAM', accion: 'CreateUser', error: 'Failed to create user' }, (e) => crearUsuario(e, { nombre: f.nombre, consola: f.consola, cambiarContrasena: f.cambiar, grupos: p.grupos, politicas: p.politicas }));
    if (!r.ok) return;
    const n = r.valor.nombre;
    if (f.consola) {
      cx.memoria.iamCreado = { nombre: n, contrasena: f.contrasena === 'auto' ? contrasenaAzar() : f.propia, cambiar: f.cambiar };
      cx.ir('iam/usuarios/creado');
    } else {
      cx.flash({ tipo: 'exito', texto: 'User created successfully', accion: { texto: 'View user', alClic: () => cx.ir(rutaUsuario(n)) } });
      cx.ir('iam/usuarios');
    }
  }

  return zona;
}

/** La política de contraseñas por omisión de AWS: 8+ caracteres y 3 tipos. */
function contrasenaValida(c) {
  if (String(c).length < 8) return false;
  const tipos = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(c)).length;
  return tipos >= 3;
}

/** «Retrieve password» después de crear un usuario con consola. */
function usuarioCreado(cx) {
  const c = cx.memoria.iamCreado;
  migasIam(cx, { texto: 'Users', ruta: 'iam/usuarios' }, { texto: 'Create user' });
  if (!c) return h('div', { class: 'cx-pagina' }, ui.alerta({ tipo: 'info', contenido: 'There is no password to retrieve.' }), ui.boton('Return to users list', { alClic: () => cx.ir('iam/usuarios') }));
  let ver = false;
  const url = `https://${cx.estado.cuenta.id}.signin.aws.amazon.com/console`;
  const contra = ui.region(() => h('span', { class: 'cx-mono' }, ver ? c.contrasena : '*******', ' ', ui.enlace(ver ? 'Hide' : 'Show', () => ((ver = !ver), contra.repintar()))));
  return h(
    'div',
    { class: 'cx-asis' },
    h('nav', { class: 'cx-asis__pasos' }, h('ol', {}, ['Specify user details', 'Set permissions', 'Review and create', 'Retrieve password'].map((p, i) => h('li', { class: ['cx-asis__paso', i === 3 && 'cx-asis__paso--actual'] }, h('small', {}, `Step ${i + 1}`), h('span', {}, p))))),
    h(
      'div',
      { class: 'cx-asis__cuerpo cx-pagina' },
      ui.alerta({ tipo: 'exito', titulo: 'User created successfully', contenido: 'You can view and download the user’s password and email instructions for signing in to the AWS Management Console.', accion: ui.boton('View user', { alClic: () => cx.ir(rutaUsuario(c.nombre)) }) }),
      ui.encabezado({ titulo: 'Retrieve password', info: 'iam-consola', cx, descripcion: 'You can view and download the user’s password below or email users instructions for signing in to the AWS Management Console. This is the only time you can view and download this password.' }),
      ui.contenedor({
        titulo: 'Console sign-in details',
        cuerpo: ui.pares(
          [
            { etiqueta: 'Console sign-in URL', valor: ui.copiable(url) },
            { etiqueta: 'User name', valor: ui.copiable(c.nombre) },
            { etiqueta: 'Console password', valor: contra }
          ],
          { columnas: 1 }
        )
      }),
      c.cambiar ? ui.alerta({ tipo: 'info', contenido: 'The user must create a new password the first time they sign in.' }) : null,
      h(
        'div',
        { class: 'cx-pie-form' },
        ui.boton('Download .csv file', { icono: 'download', alClic: () => cx.flash({ tipo: 'info', texto: 'Simulador: no se descargan archivos. En AWS se bajaría un .csv con la URL, el usuario y la contraseña.' }) }),
        ui.boton('Email sign-in instructions', { desactivado: true }),
        ui.boton('Return to users list', { variante: 'primario', escribe: false, alClic: () => ((cx.memoria.iamCreado = null), cx.ir('iam/usuarios')) })
      )
    )
  );
}

/* ------------------------------------------------------------ detalle del usuario */

function detalleUsuario(cx, { nombre }) {
  const u = usuarioDe(cx, nombre);
  migasIam(cx, { texto: 'Users', ruta: 'iam/usuarios' }, { texto: nombre });
  if (!u) return noEncontrado(cx, 'User', nombre, 'iam/usuarios');
  const clave = `u:${nombre}`;
  const llave = (i) => {
    const k = u.llavesAcceso[i];
    if (k) return h('span', {}, k.id, ' - ', k.estado === 'Active' ? ui.estado('exito', 'Active') : ui.estado('inactivo', 'Inactive'), h('div', { class: 'cx-texto-sec' }, `${edad(k.creado)} old`));
    return ui.enlace('Create access key', rutaUsuario(nombre, 'llave'), { cx });
  };
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: nombre, info: 'iam-usuario', cx, acciones: [ui.boton('Delete', { escribe: true, alClic: () => borrarUsuarios(cx, [nombre]) })] }),
    ui.contenedor({
      titulo: 'Summary',
      cuerpo: ui.pares(
        [
          { etiqueta: 'ARN', valor: ui.copiable(u.arn) },
          { etiqueta: 'Console access', valor: u.consola ? (u.mfa.length ? 'Enabled with MFA' : ui.estado('aviso', 'Enabled without MFA')) : 'Disabled' },
          { etiqueta: 'Access key 1', valor: llave(0) },
          { etiqueta: 'Created', valor: fechaIam(u.creado) },
          { etiqueta: 'Last console sign-in', valor: u.consola ? 'Never' : '–' },
          { etiqueta: 'Access key 2', valor: u.llavesAcceso.length ? llave(1) : 'Not enabled' }
        ],
        { columnas: 3 }
      )
    }),
    ui.pestanas({
      activa: pestanaDe(cx, clave, 'permisos'),
      alCambiar: (id) => recordar(cx, clave, id),
      pestanas: [
        { id: 'permisos', texto: 'Permissions', contenido: () => pestanaPermisosUsuario(cx, u) },
        { id: 'grupos', texto: 'Groups', contenido: () => pestanaGruposUsuario(cx, u) },
        { id: 'etiquetas', texto: 'Tags', contenido: () => ui.contenedor({ titulo: 'Tags', contador: 0, cuerpo: h('div', { class: 'cx-tabla__vacia' }, h('b', {}, 'No tags associated with the resource.')) }) },
        { id: 'credenciales', texto: 'Security credentials', contenido: () => pestanaCredenciales(cx, u) },
        { id: 'asesor', texto: 'Access Advisor', desactivada: true, contenido: () => null }
      ]
    })
  );
}

function pestanaPermisosUsuario(cx, u) {
  const nombre = u.nombre;
  const filas = () => {
    const x = usuarioDe(cx, nombre);
    if (!x) return [];
    return [
      ...x.politicas.map((p) => ({ politica: p, via: null })),
      ...x.grupos.flatMap((g) => (grupoDe(cx, g)?.politicas ?? []).map((p) => ({ politica: p, via: g })))
    ];
  };
  const t = ui.tabla(cx, {
    titulo: 'Permissions policies',
    info: 'iam-politica',
    variante: 'contenedor',
    descripcion: 'Permissions are defined by policies attached to the user directly or through groups.',
    filas,
    clave: (x) => `${x.via ?? ''}|${x.politica}`,
    seleccion: 'multiple',
    filtro: 'Search',
    columnas: [
      { titulo: 'Policy name', valor: (x) => ui.enlace(x.politica, rutaPolitica(x.politica), { cx }), texto: (x) => x.politica },
      { titulo: 'Type', valor: (x) => politicaIam(x.politica)?.tipo ?? 'AWS managed' },
      { titulo: 'Attached via', valor: (x) => (x.via ? h('span', {}, 'Group ', ui.enlace(x.via, rutaGrupo(x.via), { cx })) : 'Directly'), texto: (x) => (x.via ? `Group ${x.via}` : 'Directly') }
    ],
    acciones: (sel) => [
      ui.boton('Remove', {
        escribe: true,
        desactivado: !sel.length || sel.some((x) => x.via),
        titulo: sel.some((x) => x.via) ? 'Policies attached through a group must be removed from the group.' : undefined,
        alClic: () => quitarPoliticas(cx, { tipo: 'user', nombre, politicas: sel.map((x) => x.politica), quitar: quitarPoliticaUsuario })
      }),
      ui.menuBoton('Add permissions', [
        { texto: 'Add permissions', escribe: true, alClic: () => cx.ir(rutaUsuario(nombre, 'permisos')) },
        { texto: 'Create inline policy', desactivado: true }
      ], { variante: 'primario' })
    ],
    vacio: { titulo: 'No resources to display', texto: 'There are no permissions policies attached to this user.' }
  });
  return h(
    'div',
    { class: 'cx-pagina' },
    t,
    ui.contenedor({ titulo: 'Permissions boundary', descripcion: 'Set a permissions boundary to control the maximum permissions this user can have.', acciones: ui.boton('Set permissions boundary', { desactivado: true }), cuerpo: h('p', { class: 'cx-texto-sec' }, 'Permissions boundary (not set)') })
  );
}

/** Modal «Remove policy?» para usuarios, grupos y roles. */
function quitarPoliticas(cx, { tipo, nombre, politicas, quitar }) {
  cx.confirmar({
    titulo: politicas.length === 1 ? `Remove ${politicas[0]}?` : `Remove ${politicas.length} policies?`,
    textoBoton: 'Remove policy',
    contenido: h('p', {}, `Are you sure you want to remove ${politicas.join(', ')} from the ${tipo} `, h('b', {}, nombre), '? The permissions it grants will stop working right away.'),
    aceptar: () => {
      const r = cx.hacer({ servicio: 'IAM', accion: 'DetachPolicy', error: 'Failed to remove policy' }, (e) => politicas.forEach((p) => quitar(e, nombre, p)), { atomico: true });
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: politicas.length === 1 ? `Policy ${politicas[0]} removed.` : `${politicas.length} policies removed.` });
        recargar(cx);
      }
      return true;
    }
  });
}

function pestanaGruposUsuario(cx, u) {
  const nombre = u.nombre;
  const t = ui.tabla(cx, {
    titulo: 'User groups membership',
    info: 'iam-grupo',
    variante: 'contenedor',
    descripcion: 'A user group is a collection of IAM users. Use groups to specify permissions for a collection of users.',
    filas: () => (usuarioDe(cx, nombre)?.grupos ?? []).map((g) => grupoDe(cx, g) ?? { nombre: g, politicas: [] }),
    clave: (g) => g.nombre,
    seleccion: 'multiple',
    filtro: 'Search',
    columnas: [
      { titulo: 'Group name', valor: (g) => ui.enlace(g.nombre, rutaGrupo(g.nombre), { cx }), texto: (g) => g.nombre },
      { titulo: 'Attached policies', valor: (g) => (g.politicas.length ? g.politicas.join(', ') : '–') }
    ],
    acciones: (sel) => [
      ui.boton('Remove', {
        escribe: true,
        desactivado: !sel.length,
        alClic: () =>
          cx.confirmar({
            titulo: `Remove ${nombre} from ${sel.length === 1 ? sel[0].nombre : `${sel.length} groups`}?`,
            textoBoton: 'Remove',
            contenido: h('p', {}, 'The user will lose the permissions that come from these groups.'),
            aceptar: () => {
              const r = cx.hacer({ servicio: 'IAM', accion: 'RemoveUserFromGroup', error: 'Failed to remove user from group' }, (e) => sel.forEach((g) => quitarUsuarioDeGrupo(e, g.nombre, nombre)), { atomico: true });
              if (r.ok) {
                cx.flash({ tipo: 'exito', texto: `${nombre} removed from ${sel.map((g) => g.nombre).join(', ')}.` });
                recargar(cx);
              }
              return true;
            }
          })
      }),
      ui.boton('Add user to groups', { variante: 'primario', alClic: () => cx.ir(rutaUsuario(nombre, 'agregar-grupos')) })
    ],
    vacio: { titulo: 'No resources to display', texto: 'This user is not a member of any groups.' }
  });
  return t;
}

function pestanaCredenciales(cx, u) {
  const nombre = u.nombre;
  const url = `https://${cx.estado.cuenta.id}.signin.aws.amazon.com/console`;
  const mfa = ui.tabla(cx, {
    titulo: 'Multi-factor authentication (MFA)',
    info: 'iam-mfa',
    variante: 'contenedor',
    descripcion: 'Use MFA to increase the security of your AWS environment. Signing in with MFA requires an authentication code from an MFA device. Each user can have a maximum of 8 MFA devices assigned.',
    filas: () => usuarioDe(cx, nombre)?.mfa ?? [],
    clave: (m) => m.nombre,
    seleccion: 'unica',
    filtro: false,
    paginacion: false,
    columnas: [
      { titulo: 'Type', valor: (m) => TIPO_MFA[m.tipo] ?? 'Virtual' },
      { titulo: 'Identifier', valor: (m) => `arn:aws:iam::${cx.estado.cuenta.id}:mfa/${m.nombre}` },
      { titulo: 'Certifications', valor: () => 'Not applicable' },
      { titulo: 'Created on', valor: (m) => fechaIam(m.creado) }
    ],
    acciones: (sel) => [
      ui.boton('Remove', {
        escribe: true,
        desactivado: sel.length !== 1,
        alClic: () =>
          cx.confirmar({
            titulo: 'Remove MFA device?',
            palabra: 'remove',
            textoBoton: 'Remove',
            contenido: h('p', {}, 'Removing ', h('b', {}, sel[0].nombre), ' makes the user sign in with only a password.'),
            aceptar: () => {
              const r = cx.hacer({ servicio: 'IAM', accion: 'DeactivateMFADevice', error: 'Failed to remove MFA device' }, (e) => quitarMfa(e, nombre, sel[0].nombre));
              if (r.ok) {
                cx.flash({ tipo: 'exito', texto: 'MFA device removed.' });
                recargar(cx);
              }
              return true;
            }
          })
      }),
      ui.boton('Resync', { desactivado: true }),
      ui.boton('Assign MFA device', { escribe: true, desactivado: u.mfa.length >= 8, alClic: () => cx.ir(rutaUsuario(nombre, 'mfa')) })
    ],
    vacio: { titulo: 'No MFA devices. Assign an MFA device to improve the security of your AWS environment', texto: '', accion: ui.boton('Assign MFA device', { escribe: true, alClic: () => cx.ir(rutaUsuario(nombre, 'mfa')) }) }
  });

  const llaves = u.llavesAcceso;
  const tarjetaLlave = (k, i) =>
    h(
      'div',
      { class: 'cx-bloque cx-iam-llave' },
      h(
        'div',
        { class: 'cx-iam-llave__cabeza' },
        h('div', {}, h('b', { class: 'cx-mono' }, k.id), h('div', { class: 'cx-texto-sec' }, `Access key ${i + 1}`)),
        ui.menuBoton('Actions', () => [
          k.estado === 'Active'
            ? { texto: 'Deactivate', escribe: true, alClic: () => desactivarLlave(cx, nombre, k.id) }
            : { texto: 'Activate', escribe: true, alClic: () => activarLlave(cx, nombre, k.id) },
          { texto: 'Delete', escribe: true, alClic: () => borrarLlave(cx, nombre, k.id) }
        ])
      ),
      ui.pares(
        [
          { etiqueta: 'Description', valor: '–' },
          { etiqueta: 'Status', valor: k.estado === 'Active' ? ui.estado('exito', 'Active') : ui.estado('inactivo', 'Inactive') },
          { etiqueta: 'Last used', valor: 'Never' },
          { etiqueta: 'Created', valor: `${edad(k.creado)} ago` }
        ],
        { columnas: 4 }
      )
    );

  return h(
    'div',
    { class: 'cx-pagina' },
    ui.contenedor({
      titulo: 'Console sign-in',
      info: 'iam-consola',
      cx,
      acciones: ui.boton(u.consola ? 'Manage console access' : 'Enable console access', { escribe: true, alClic: () => modalConsola(cx, u) }),
      cuerpo: ui.pares(
        [
          { etiqueta: 'Console sign-in link', valor: ui.copiable(url) },
          { etiqueta: 'Console password', valor: u.consola ? `Updated ${edad(u.creado)} ago (never signed in)` : 'Not enabled' }
        ],
        { columnas: 2 }
      )
    }),
    mfa,
    ui.contenedor({
      titulo: 'Access keys',
      contador: llaves.length,
      info: 'iam-llaves',
      cx,
      acciones: ui.boton('Create access key', { escribe: true, desactivado: llaves.length >= 2, alClic: () => cx.ir(rutaUsuario(nombre, 'llave')) }),
      descripcion: 'Use access keys to send programmatic calls to AWS from the AWS CLI, AWS Tools for PowerShell, AWS SDKs, or direct AWS API calls. You can have a maximum of two access keys (active or inactive) at a time.',
      cuerpo: llaves.length ? llaves.map(tarjetaLlave) : h('div', { class: 'cx-tabla__vacia' }, h('b', {}, 'No access keys'), h('div', {}, 'As a best practice, avoid using long-term credentials like access keys. Instead, use tools which provide short term credentials.'))
    }),
    ui.contenedor({ titulo: 'SSH public keys for AWS CodeCommit', contador: 0, acciones: ui.boton('Upload SSH public key', { desactivado: true }), cuerpo: h('p', { class: 'cx-texto-sec' }, 'No SSH public keys') }),
    ui.contenedor({ titulo: 'HTTPS Git credentials for AWS CodeCommit', contador: 0, acciones: ui.boton('Generate credentials', { desactivado: true }), cuerpo: h('p', { class: 'cx-texto-sec' }, 'No credentials') }),
    ui.contenedor({ titulo: 'X.509 Signing certificates', contador: 0, acciones: ui.boton('Create X.509 certificate', { desactivado: true }), cuerpo: h('p', { class: 'cx-texto-sec' }, 'No certificates') })
  );
}

function desactivarLlave(cx, nombre, id) {
  cx.confirmar({
    titulo: `Deactivate ${id}?`,
    textoBoton: 'Deactivate',
    contenido: [
      h('p', {}, 'Deactivating an access key makes it stop working right away: any program or person using it will get “access denied”.'),
      h('p', { class: 'cx-texto-sec' }, 'You can activate it again later, or delete it once you’re sure nobody needs it.')
    ],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'IAM', accion: 'UpdateAccessKey', error: 'Failed to deactivate access key' }, (e) => cambiarLlaveAcceso(e, nombre, id, false));
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: `Access key ${id} deactivated.` });
        recargar(cx);
      }
      return true;
    }
  });
}

function activarLlave(cx, nombre, id) {
  const r = cx.hacer({ servicio: 'IAM', accion: 'UpdateAccessKey', error: 'Failed to activate access key' }, (e) => cambiarLlaveAcceso(e, nombre, id, true));
  if (r.ok) {
    cx.flash({ tipo: 'exito', texto: `Access key ${id} activated.` });
    recargar(cx);
  }
}

/** «Delete access key»: primero hay que desactivarla y luego escribir su ID. */
function borrarLlave(cx, nombre, id) {
  const k = usuarioDe(cx, nombre)?.llavesAcceso.find((x) => x.id === id);
  if (!k) return;
  const activa = k.estado === 'Active';
  let escrito = '';
  const btn = ui.boton('Delete', {
    variante: 'primario',
    desactivado: true,
    alClic: () => {
      const r = cx.hacer({ servicio: 'IAM', accion: 'DeleteAccessKey', error: 'Failed to delete access key' }, (e) => eliminarLlaveAcceso(e, nombre, id));
      m.cerrar();
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: `Access key ${id} deleted.` });
        recargar(cx);
      }
    }
  });
  const m = cx.modal({
    titulo: `Delete ${id}?`,
    contenido: [
      activa
        ? ui.alerta({
            tipo: 'aviso',
            titulo: 'Deactivate this access key',
            contenido: 'Before you delete an access key, you must deactivate it. Deactivating the key lets you check that nothing stops working before you delete it for good.',
            accion: ui.boton('Deactivate', {
              escribe: true,
              alClic: () => {
                const r = cx.hacer({ servicio: 'IAM', accion: 'UpdateAccessKey', error: 'Failed to deactivate access key' }, (e) => cambiarLlaveAcceso(e, nombre, id, false));
                m.cerrar();
                if (r.ok) borrarLlave(cx, nombre, id);
              }
            })
          })
        : ui.alerta({ tipo: 'info', contenido: 'Deleting an access key can’t be undone. Any program still using it will stop working.' }),
      h(
        'div',
        { class: 'cx-confirmar' },
        ui.campo({
          etiqueta: 'To confirm deletion, enter the access key ID in the text input field.',
          control: ui.entrada({
            placeholder: id,
            desactivado: activa,
            alCambiar: (v) => {
              escrito = v.trim();
              btn.disabled = activa || escrito !== id;
            }
          })
        })
      )
    ],
    pie: [ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }), btn]
  });
}

/** «Manage console access» (modal). */
function modalConsola(cx, u) {
  const f = { consola: 'on', contrasena: 'auto', propia: '', cambiar: true };
  let error = null;
  const zona = ui.region(() => [
    ui.campo({
      etiqueta: 'Console access',
      control: ui.radios({
        valor: f.consola,
        alCambiar: (v) => ((f.consola = v), zona.repintar()),
        opciones: [
          { valor: 'on', etiqueta: 'Enable' },
          { valor: 'off', etiqueta: 'Disable', descripcion: 'The user will no longer be able to sign in to the AWS Management Console.' }
        ]
      })
    }),
    f.consola === 'on'
      ? [
          ui.campo({
            etiqueta: 'Set password',
            control: ui.radios({
              valor: f.contrasena,
              alCambiar: (v) => ((f.contrasena = v), zona.repintar()),
              opciones: [
                { valor: 'auto', etiqueta: 'Autogenerated password' },
                { valor: 'propia', etiqueta: 'Custom password' }
              ]
            })
          }),
          f.contrasena === 'propia' ? ui.campo({ etiqueta: 'Password', control: ui.entrada({ tipo: 'password', valor: f.propia, alCambiar: (v) => (f.propia = v) }), error }) : null,
          ui.casilla({ etiqueta: 'User must create a new password at next sign-in - Recommended', marcada: f.cambiar, alCambiar: (v) => (f.cambiar = v) })
        ]
      : null
  ]);
  const aplicar = () => {
    if (f.consola === 'on' && f.contrasena === 'propia' && !contrasenaValida(f.propia)) {
      error = 'Password does not meet the password policy requirements.';
      zona.repintar();
      return;
    }
    const r = cx.hacer({ servicio: 'IAM', accion: f.consola === 'on' ? 'CreateLoginProfile' : 'DeleteLoginProfile', error: 'Failed to update console access' }, (e) => editarAccesoConsola(e, u.nombre, { consola: f.consola === 'on', cambiarContrasena: f.cambiar }));
    m.cerrar();
    if (!r.ok) return;
    if (f.consola === 'on') {
      const contra = f.contrasena === 'auto' ? contrasenaAzar() : f.propia;
      const m2 = cx.modal({
        titulo: 'Console password',
        contenido: [
          ui.alerta({ tipo: 'exito', contenido: 'Console access enabled. This is the only time you can view this password.' }),
          ui.pares([{ etiqueta: 'Console sign-in URL', valor: ui.copiable(`https://${cx.estado.cuenta.id}.signin.aws.amazon.com/console`) }, { etiqueta: 'User name', valor: u.nombre }, { etiqueta: 'Console password', valor: ui.copiable(contra) }], { columnas: 1 })
        ],
        pie: ui.boton('Close', { alClic: () => (m2.cerrar(), recargar(cx)) })
      });
    } else {
      cx.flash({ tipo: 'exito', texto: `Console access disabled for ${u.nombre}.` });
      recargar(cx);
    }
  };
  const m = cx.modal({ titulo: 'Manage console access', contenido: zona, pie: [ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }), ui.boton('Apply', { variante: 'primario', alClic: aplicar })] });
}

/** «Add permissions» de un usuario: las tres opciones y la revisión. */
function agregarPermisosUsuario(cx, { nombre }) {
  const u = usuarioDe(cx, nombre);
  migasIam(cx, { texto: 'Users', ruta: 'iam/usuarios' }, { texto: nombre, ruta: rutaUsuario(nombre) }, { texto: 'Add permissions' });
  if (!u) return noEncontrado(cx, 'User', nombre, 'iam/usuarios');
  const f = { paso: 0, opcion: 'grupo', grupos: [], copiarDe: null, politicas: [] };
  const pasos = ['Add permissions', 'Review'];
  const zona = ui.region(() => {
    const x = usuarioDe(cx, nombre) ?? u;
    const cuerpo =
      f.paso === 0
        ? opcionesPermisos(cx, f, () => zona.repintar(), { excluirGrupos: () => x.grupos, excluirPoliticas: () => x.politicas, nombreUsuario: nombre })
        : [
            h('p', { class: 'cx-texto-sec' }, `The following policies will be attached to ${nombre}.`),
            resumenPermisos(cx, permisosElegidos(cx, f))
          ];
    return asistente(cx, {
      pasos,
      paso: f.paso,
      titulo: pasos[f.paso],
      info: 'iam-politica',
      cuerpo,
      pie: pieAsistente({
        cancelar: () => cx.ir(rutaUsuario(nombre)),
        anterior: f.paso ? () => ((f.paso = 0), zona.repintar()) : null,
        textoSiguiente: f.paso ? 'Add permissions' : 'Next',
        siguiente: () => {
          if (f.paso === 0) {
            const p = permisosElegidos(cx, f);
            if (!p.grupos.length && !p.politicas.length) {
              cx.flash({ tipo: 'error', texto: f.opcion === 'grupo' ? 'Select at least one user group.' : f.opcion === 'copiar' ? 'Choose a user to copy permissions from.' : 'Select at least one policy.' });
              return;
            }
            f.paso = 1;
            return zona.repintar();
          }
          const p = permisosElegidos(cx, f);
          const r = cx.hacer(
            { servicio: 'IAM', accion: 'AttachUserPolicy', error: 'Failed to add permissions' },
            (e) => {
              const actual = e.iam.usuarios.find((y) => y.nombre === nombre);
              if (p.grupos.length) gruposDeUsuario(e, nombre, [...new Set([...actual.grupos, ...p.grupos])]);
              const nuevas = p.politicas.filter((pol) => !actual.politicas.includes(pol));
              if (nuevas.length) adjuntarPoliticasUsuario(e, nombre, nuevas);
            },
            { atomico: true }
          );
          if (r.ok) {
            cx.flash({ tipo: 'exito', texto: `Permissions added to ${nombre}.` });
            recordar(cx, `u:${nombre}`, p.grupos.length && !p.politicas.length ? 'grupos' : 'permisos');
            cx.ir(rutaUsuario(nombre));
          }
        }
      })
    });
  });
  return zona;
}

/** «Add user to groups» (desde la pestaña Groups del usuario). */
function agregarAGrupos(cx, { nombre }) {
  const u = usuarioDe(cx, nombre);
  migasIam(cx, { texto: 'Users', ruta: 'iam/usuarios' }, { texto: nombre, ruta: rutaUsuario(nombre) }, { texto: 'Add user to groups' });
  if (!u) return noEncontrado(cx, 'User', nombre, 'iam/usuarios');
  let elegidos = [];
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: `Add ${nombre} to groups`, info: 'iam-grupo', cx }),
    tablaGrupos(cx, {
      titulo: 'User groups',
      excluir: () => usuarioDe(cx, nombre)?.grupos ?? [],
      alSeleccionar: (ids) => (elegidos = ids),
      acciones: [ui.boton('Create group', { escribe: true, alClic: () => modalCrearGrupo(cx, () => recargar(cx)) })]
    }),
    ui.pieFormulario({
      cancelar: () => cx.ir(rutaUsuario(nombre)),
      textoEnviar: 'Add user to group(s)',
      enviar: () => {
        if (!elegidos.length) return cx.flash({ tipo: 'error', texto: 'Select at least one user group.' });
        const r = cx.hacer({ servicio: 'IAM', accion: 'AddUserToGroup', error: 'Failed to add user to groups' }, (e) => elegidos.forEach((g) => agregarUsuariosAGrupo(e, g, [nombre])), { atomico: true });
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: `${nombre} added to ${elegidos.join(', ')}.` });
          recordar(cx, `u:${nombre}`, 'grupos');
          cx.ir(rutaUsuario(nombre));
        }
      }
    })
  );
}

/* ------------------------------------------------------------ MFA */

/** «Assign MFA device» para un usuario (o para la raíz con `raiz: true`). */
function asignarMfaPagina(cx, { nombre }, { raiz = false } = {}) {
  const u = raiz ? null : usuarioDe(cx, nombre);
  if (raiz) migasIam(cx, { texto: 'My security credentials', ruta: 'iam/credenciales' }, { texto: 'Assign MFA device' });
  else migasIam(cx, { texto: 'Users', ruta: 'iam/usuarios' }, { texto: nombre, ruta: rutaUsuario(nombre) }, { texto: 'Assign MFA device' });
  if (!raiz && !u) return noEncontrado(cx, 'User', nombre, 'iam/usuarios');
  if (raiz && cx.estado.iam.raizMfa) return h('div', { class: 'cx-pagina' }, ui.alerta({ tipo: 'exito', titulo: 'Root user has MFA', contenido: 'The root user already has an MFA device assigned.' }), ui.boton('Back to IAM Dashboard', { alClic: () => cx.ir('iam') }));

  const f = { paso: 0, nombre: '', tipo: 'virtual', c1: '', c2: '', serie: '', qr: false, tocada: false };
  const codigos = [codigoAzar(), codigoAzar()];
  const errores = {};
  const pasos = ['Select MFA device', 'Set up device'];
  const volver = () => {
    if (raiz) return cx.ir('iam');
    recordar(cx, `u:${nombre}`, 'credenciales');
    cx.ir(rutaUsuario(nombre));
  };

  const camposCodigos = () => [
    ui.campo({ etiqueta: 'MFA code 1', control: ui.entrada({ valor: f.c1, placeholder: '6 digits', alCambiar: (v) => (f.c1 = v.trim()) }), error: errores.c1 }),
    ui.campo({ etiqueta: 'MFA code 2', control: ui.entrada({ valor: f.c2, placeholder: '6 digits', alCambiar: (v) => (f.c2 = v.trim()) }), error: errores.c2 })
  ];
  const celular = (titulo) =>
    h(
      'div',
      { class: 'cx-iam-celular', 'aria-label': 'Simulated authenticator app' },
      h('div', { class: 'cx-iam-celular__titulo' }, titulo),
      h('div', { class: 'cx-texto-sec' }, `Amazon Web Services · ${raiz ? 'root' : nombre}@${cx.estado.cuenta.id}`),
      h('div', { class: 'cx-iam-celular__codigo cx-mono' }, codigos[0]),
      h('div', { class: 'cx-texto-sec' }, 'Después de 30 segundos la app muestra:'),
      h('div', { class: 'cx-iam-celular__codigo cx-mono' }, codigos[1]),
      h('p', { class: 'cx-texto-sec' }, 'Simulador: escribe estos dos códigos seguidos, como si los leyeras de tu celular.')
    );

  const zona = ui.region(() => {
    let cuerpo;
    if (f.paso === 0) {
      cuerpo = [
        ui.contenedor({
          titulo: 'MFA device name',
          cuerpo: ui.campo({
            etiqueta: 'Device name',
            info: 'iam-mfa',
            cx,
            descripcion: 'Enter a meaningful name to identify this device.',
            control: ui.entrada({ valor: f.nombre, placeholder: raiz ? 'root-celular' : `${nombre}-celular`, alCambiar: (v) => (f.nombre = v) }),
            restriccion: 'Maximum 128 characters. Use alphanumeric and ‘+ = , . @ - _’ characters.',
            error: errores.nombre
          })
        }),
        ui.contenedor({
          titulo: 'MFA device',
          descripcion: 'Select an MFA device to use, in addition to your username and password, whenever you need to authenticate.',
          cuerpo: ui.tarjetas({
            columnas: 1,
            valor: f.tipo,
            alCambiar: (v) => ((f.tipo = v), zona.repintar()),
            opciones: [
              { valor: 'llave', etiqueta: 'Passkey or security key', descripcion: 'Authenticate using your fingerprint, face, or screen lock. Create a passkey on this device or use another device, like a FIDO2 security key.' },
              { valor: 'virtual', etiqueta: 'Authenticator app', descripcion: 'Authenticate using a code generated by an app installed on your mobile device or computer.' },
              { valor: 'hardware', etiqueta: 'Hardware TOTP token', descripcion: 'Authenticate using a code generated by hardware TOTP token or other hardware devices.' }
            ]
          })
        })
      ];
    } else if (f.tipo === 'virtual') {
      cuerpo = ui.contenedor({
        titulo: 'Set up device',
        cuerpo: h(
          'div',
          { class: 'cx-iam-mfa' },
          h(
            'ol',
            { class: 'cx-iam-mfa__pasos' },
            h('li', {}, h('b', {}, 'Install a compatible application such as Google Authenticator, Duo Mobile, or Authy app on your mobile device or computer.'), ' ', h('span', { class: 'cx-texto-sec' }, 'See a list of compatible applications.')),
            h(
              'li',
              {},
              h('b', {}, 'Open your authenticator app, chose Show QR code on this page, then use the app to scan the code.'),
              ' Alternatively, you can type a secret key.',
              h('div', { class: 'cx-iam-qr' }, f.qr ? qrFalso() : ui.enlace('Show QR code', () => ((f.qr = true), zona.repintar())))
            ),
            h('li', {}, h('b', {}, 'Type two consecutive MFA codes below'), h('div', { class: 'cx-fila-campos' }, camposCodigos()))
          ),
          celular('Authenticator app (simulada)')
        )
      });
    } else if (f.tipo === 'hardware') {
      cuerpo = ui.contenedor({
        titulo: 'Set up device',
        cuerpo: h(
          'div',
          { class: 'cx-iam-mfa' },
          h(
            'div',
            { class: 'cx-form' },
            ui.campo({ etiqueta: 'Serial number', descripcion: 'The serial number is usually found on the back of the device.', control: ui.entrada({ valor: f.serie, placeholder: 'GAHT12345678', alCambiar: (v) => (f.serie = v) }), error: errores.serie }),
            h('div', { class: 'cx-fila-campos' }, camposCodigos())
          ),
          celular('Token de hardware (simulado)')
        )
      });
    } else {
      cuerpo = ui.contenedor({
        titulo: 'Set up device',
        cuerpo: [
          h('p', {}, 'Your browser will prompt you to choose where to save the passkey: this device, a phone, or a security key.'),
          f.tocada ? ui.estado('exito', 'Passkey registered') : ui.boton('Simular: tocar la llave / usar huella', { alClic: () => ((f.tocada = true), zona.repintar()) }),
          errores.llave ? errorCampo(errores.llave) : null
        ]
      });
    }
    return asistente(cx, {
      pasos,
      paso: f.paso,
      titulo: pasos[f.paso],
      info: 'iam-mfa',
      cuerpo,
      pie: pieAsistente({
        cancelar: volver,
        anterior: f.paso ? () => ((f.paso = 0), zona.repintar()) : null,
        textoSiguiente: f.paso ? 'Add MFA' : 'Next',
        siguiente: f.paso ? agregar : siguiente
      })
    });
  });

  function siguiente() {
    errores.nombre = raiz
      ? /^[\w+=,.@-]{1,128}$/.test(f.nombre.trim())
        ? null
        : 'Device name can have up to 128 characters. Valid characters: A-Z, a-z, 0-9, and + = , . @ _ - (hyphen)'
      : probar(cx, (e) => asignarMfa(e, nombre, { nombreDispositivo: f.nombre, tipo: f.tipo }));
    if (errores.nombre) return zona.repintar();
    f.paso = 1;
    zona.repintar();
  }

  function agregar() {
    errores.c1 = errores.c2 = errores.serie = errores.llave = null;
    if (f.tipo === 'llave') {
      if (!f.tocada) errores.llave = 'Register your passkey or security key to continue.';
    } else {
      if (!/^\d{6}$/.test(f.c1)) errores.c1 = 'MFA code 1 must be 6 digits.';
      if (!/^\d{6}$/.test(f.c2)) errores.c2 = 'MFA code 2 must be 6 digits.';
      if (!errores.c1 && !errores.c2 && (f.c1 !== codigos[0] || f.c2 !== codigos[1])) errores.c2 = 'The authentication codes you entered are invalid. Type the two consecutive codes your app shows.';
      if (f.tipo === 'hardware' && !f.serie.trim()) errores.serie = 'Serial number is required.';
    }
    if (errores.c1 || errores.c2 || errores.serie || errores.llave) return zona.repintar();
    const r = raiz
      ? cx.hacer({ servicio: 'IAM', accion: 'EnableMFADevice', error: 'Failed to assign MFA device' }, (e) => asignarMfaRaiz(e))
      : cx.hacer({ servicio: 'IAM', accion: 'EnableMFADevice', error: 'Failed to assign MFA device' }, (e) => asignarMfa(e, nombre, { nombreDispositivo: f.nombre, tipo: f.tipo }));
    if (r.ok) {
      cx.flash({ tipo: 'exito', titulo: 'MFA device assigned', texto: 'You can register up to 8 MFA devices of any combination of the currently supported MFA types with your AWS account root and IAM user.' });
      volver();
    }
  }

  return zona;
}

/** Un «código QR» de adorno (cuadritos fijos; no lleva datos del alumno). */
function qrFalso() {
  const n = 21;
  const celdas = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const esquina = (a, b) => x >= a && x < a + 7 && y >= b && y < b + 7 && (x === a || x === a + 6 || y === b || y === b + 6 || (x >= a + 2 && x <= a + 4 && y >= b + 2 && y <= b + 4));
      const enEsquina = (x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12);
      const negro = enEsquina ? esquina(0, 0) || esquina(14, 0) || esquina(0, 14) : ((x * 7 + y * 13 + x * y) % 5) < 2;
      if (negro) celdas.push(h('span', { style: { gridColumn: String(x + 1), gridRow: String(y + 1) } }));
    }
  }
  return h('div', { class: 'cx-iam-qr__codigo', role: 'img', 'aria-label': 'QR code' }, celdas);
}

/* ------------------------------------------------------------ llaves de acceso */

const CASOS_LLAVE = [
  { valor: 'cli', etiqueta: 'Command Line Interface (CLI)', descripcion: 'You plan to use this access key to enable the AWS CLI to access your AWS account.', alternativa: 'Use AWS CloudShell, a browser-based CLI, to run commands. Or use the AWS CLI V2 with IAM Identity Center for short-term credentials.' },
  { valor: 'local', etiqueta: 'Local code', descripcion: 'You plan to use this access key to enable application code in a local development environment to access your AWS account.', alternativa: 'Use an integrated development environment (IDE) that supports the AWS Toolkit with IAM Identity Center authentication.' },
  { valor: 'aws', etiqueta: 'Application running on an AWS compute service', descripcion: 'You plan to use this access key to enable application code running on an AWS compute service like Amazon EC2, Amazon ECS, or AWS Lambda to access your AWS account.', alternativa: 'Use an IAM role instead: attach a role to your EC2 instance (or ECS task, or Lambda function). The service gives your code temporary credentials that rotate automatically, so there is no long-term key to leak.' },
  { valor: 'tercero', etiqueta: 'Third-party service', descripcion: 'You plan to use this access key to enable access for a third-party application or service that monitors or manages your AWS resources.', alternativa: 'Use temporary security credentials (IAM roles) instead of creating long-term credentials like access keys, and don’t share your keys with anyone.' },
  { valor: 'fuera', etiqueta: 'Application running outside AWS', descripcion: 'You plan to use this access key to authenticate workloads running in your data center or other infrastructure outside of AWS that needs to access your AWS resources.', alternativa: 'Use IAM Roles Anywhere to generate temporary security credentials for non-AWS workloads.' },
  { valor: 'otro', etiqueta: 'Other', descripcion: 'Your use case is not listed here.', alternativa: null }
];

function crearLlavePagina(cx, { nombre }) {
  const u = usuarioDe(cx, nombre);
  migasIam(cx, { texto: 'Users', ruta: 'iam/usuarios' }, { texto: nombre, ruta: rutaUsuario(nombre) }, { texto: 'Create access key' });
  if (!u) return noEncontrado(cx, 'User', nombre, 'iam/usuarios');
  const f = { paso: 0, caso: null, entiendo: false, descripcion: '', llave: null, secreto: secretoAzar(), ver: false };
  const errores = {};
  const pasos = ['Access key best practices & alternatives', 'Set description tag - optional', 'Retrieve access keys'];
  const volver = () => {
    recordar(cx, `u:${nombre}`, 'credenciales');
    cx.ir(rutaUsuario(nombre));
  };

  const zona = ui.region(() => {
    let cuerpo;
    let pie;
    if (f.paso === 0) {
      const caso = CASOS_LLAVE.find((c) => c.valor === f.caso);
      cuerpo = [
        ui.alerta({ tipo: 'info', contenido: 'Avoid using long-term credentials like access keys to improve your security. Consider the following use cases and alternatives.' }),
        ui.contenedor({
          titulo: 'Use case',
          info: 'iam-llaves',
          cx,
          cuerpo: [
            ui.tarjetas({ columnas: 2, valor: f.caso, alCambiar: (v) => ((f.caso = v), (f.entiendo = false), zona.repintar()), opciones: CASOS_LLAVE }),
            errorCampo(errores.caso)
          ]
        }),
        caso?.alternativa
          ? ui.contenedor({
              titulo: 'Alternative recommended',
              cuerpo: [
                ui.alerta({ tipo: caso.valor === 'aws' ? 'aviso' : 'info', contenido: caso.alternativa }),
                ui.casilla({ etiqueta: 'I understand the above recommendation and want to proceed to create an access key.', marcada: f.entiendo, alCambiar: (v) => (f.entiendo = v) }),
                errorCampo(errores.entiendo)
              ]
            })
          : null
      ];
      pie = pieAsistente({
        cancelar: volver,
        siguiente: () => {
          errores.caso = f.caso ? null : 'Choose a use case.';
          const c = CASOS_LLAVE.find((x) => x.valor === f.caso);
          errores.entiendo = c?.alternativa && !f.entiendo ? 'You must confirm that you understand the recommendation.' : null;
          if (errores.caso || errores.entiendo) return zona.repintar();
          f.paso = 1;
          zona.repintar();
        }
      });
    } else if (f.paso === 1) {
      cuerpo = ui.contenedor({
        titulo: 'Description tag',
        cuerpo: ui.campo({
          etiqueta: 'Description tag value',
          descripcion: 'Describe the purpose of this access key and where it will be used. A good description will help you rotate this access key confidently later.',
          control: ui.entrada({ valor: f.descripcion, placeholder: 'Enter description', alCambiar: (v) => (f.descripcion = v) }),
          restriccion: 'Maximum 256 characters. Allowed characters are letters, numbers, spaces representable in UTF-8, and: _ . : / = + - @'
        })
      });
      pie = pieAsistente({
        cancelar: volver,
        anterior: () => ((f.paso = 0), zona.repintar()),
        textoSiguiente: 'Create access key',
        siguiente: () => {
          const r = cx.hacer({ servicio: 'IAM', accion: 'CreateAccessKey', error: 'Failed to create access key' }, (e) => crearLlaveAcceso(e, nombre));
          if (!r.ok) return;
          f.llave = r.valor;
          f.paso = 2;
          zona.repintar();
        }
      });
    } else {
      const secreto = ui.region(() => h('span', { class: 'cx-mono' }, f.ver ? f.secreto : '*'.repeat(16), ' ', ui.enlace(f.ver ? 'Hide' : 'Show', () => ((f.ver = !f.ver), secreto.repintar()))));
      cuerpo = [
        ui.alerta({ tipo: 'exito', titulo: 'Access key created', contenido: 'This is the only time that the secret access key can be viewed or downloaded. You cannot recover it later. However, you can create a new access key any time.' }),
        ui.contenedor({
          titulo: 'Access key',
          descripcion: 'If you lose or forget your secret access key, you cannot retrieve it. Instead, create a new access key and make the old key inactive.',
          cuerpo: ui.pares([{ etiqueta: 'Access key', valor: ui.copiable(f.llave.id) }, { etiqueta: 'Secret access key', valor: secreto }], { columnas: 2 })
        }),
        ui.contenedor({
          titulo: 'Access key best practices',
          cuerpo: h('ul', {}, h('li', {}, 'Never store your access key in plain text, in a code repository, or in code.'), h('li', {}, 'Disable or delete access key when no longer needed.'), h('li', {}, 'Enable least-privilege permissions.'), h('li', {}, 'Rotate access keys regularly.'))
        })
      ];
      pie = h(
        'div',
        { class: 'cx-pie-form' },
        ui.boton('Download .csv file', { icono: 'download', alClic: () => cx.flash({ tipo: 'info', texto: 'Simulador: no se descargan archivos. En AWS bajarías un .csv con la llave y su secreto: guárdalo en un lugar seguro.' }) }),
        ui.boton('Done', { variante: 'primario', escribe: false, alClic: () => (cx.flash({ tipo: 'exito', texto: `Access key ${f.llave.id} created.` }), volver()) })
      );
    }
    return asistente(cx, { pasos, paso: f.paso, titulo: pasos[f.paso], info: 'iam-llaves', cuerpo, pie });
  });
  return zona;
}

/* ============================================================ grupos */

function grupos(cx) {
  migasIam(cx, { texto: 'User groups' });
  const t = ui.tabla(cx, {
    titulo: 'User groups',
    info: 'iam-grupo',
    descripcion: 'A user group is a collection of IAM users. Use groups to specify permissions for a collection of users.',
    filas: () => cx.estado.iam.grupos,
    clave: (g) => g.nombre,
    seleccion: 'multiple',
    filtro: 'Search',
    columnas: [
      { titulo: 'Group name', valor: (g) => ui.enlace(g.nombre, rutaGrupo(g.nombre), { cx }), texto: (g) => g.nombre },
      { titulo: 'Users', valor: (g) => String(cx.estado.iam.usuarios.filter((u) => u.grupos.includes(g.nombre)).length) },
      { titulo: 'Permissions', valor: (g) => (g.politicas.length ? ui.estado('exito', 'Defined') : ui.estado('aviso', 'Not defined')) },
      { titulo: 'Creation time', valor: (g) => `${edad(g.creado)} ago` }
    ],
    acciones: (sel) => [
      ui.boton('Delete', { escribe: true, desactivado: !sel.length, alClic: () => borrarGrupos(cx, sel.map((g) => g.nombre)) }),
      ui.boton('Create group', { variante: 'primario', alClic: () => cx.ir('iam/grupos/crear') })
    ],
    vacio: { titulo: 'No resources to display', texto: 'There are no user groups in this account.', accion: ui.boton('Create group', { escribe: true, alClic: () => cx.ir('iam/grupos/crear') }) }
  });
  return h('div', { class: 'cx-pagina' }, t);
}

function borrarGrupos(cx, nombres) {
  cx.confirmar({
    titulo: nombres.length === 1 ? `Delete ${nombres[0]}?` : `Delete ${nombres.length} user groups?`,
    palabra: nombres.length === 1 ? nombres[0] : 'delete',
    textoBoton: 'Delete',
    contenido: h('p', {}, 'Deleting a user group removes its users from the group and detaches its policies. The users stay, but they lose the permissions that came from the group.'),
    aceptar: () => {
      const r = cx.hacer({ servicio: 'IAM', accion: 'DeleteGroup', error: 'Failed to delete user group' }, (e) => nombres.forEach((n) => eliminarGrupoIam(e, n)), { atomico: true });
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: nombres.length === 1 ? `User group ${nombres[0]} deleted.` : `${nombres.length} user groups deleted.` });
        cx.ir('iam/grupos');
      }
      return true;
    }
  });
}

function crearGrupoPagina(cx) {
  migasIam(cx, { texto: 'User groups', ruta: 'iam/grupos' }, { texto: 'Create user group' });
  const f = { nombre: '', usuarios: [], politicas: [] };
  let error = null;
  const zonaError = ui.region(() => errorCampo(error));
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Create user group', info: 'iam-grupo', cx }),
    ui.contenedor({
      titulo: 'Name the group',
      cuerpo: ui.campo({
        etiqueta: 'User group name',
        descripcion: 'Enter a meaningful name to identify this group.',
        control: h('div', {}, ui.entrada({ placeholder: 'Enter a group name', etiquetaAccesible: 'User group name', alCambiar: (v) => (f.nombre = v) }), zonaError),
        restriccion: 'Maximum 128 characters. Use alphanumeric and ‘+=,.@-_’ characters.'
      })
    }),
    ui.tabla(cx, {
      titulo: 'Add users to the group - Optional',
      info: 'iam-usuario',
      variante: 'contenedor',
      descripcion: 'An IAM user is an entity that you create in AWS to represent the person or application that uses it to interact with AWS.',
      filas: () => cx.estado.iam.usuarios,
      clave: (u) => u.nombre,
      seleccion: 'multiple',
      filtro: 'Search',
      columnas: [
        { titulo: 'User name', valor: (u) => u.nombre },
        { titulo: 'Groups', valor: (u) => String(u.grupos.length) },
        { titulo: 'Last activity', valor: () => '–' },
        { titulo: 'Creation time', valor: (u) => `${edad(u.creado)} ago` }
      ],
      vacio: { titulo: 'No resources to display', texto: 'There are no IAM users in this account.' },
      alSeleccionar: (ids) => (f.usuarios = ids)
    }),
    tablaPoliticas(cx, { titulo: 'Attach permissions policies - Optional', descripcion: 'You can attach up to 10 policies to this user group. All the users in this group will have permissions that are defined in the selected policies.', alSeleccionar: (ids) => (f.politicas = ids) }),
    ui.pieFormulario({
      cancelar: () => cx.ir('iam/grupos'),
      textoEnviar: 'Create user group',
      enviar: () => {
        error = probar(cx, (e) => crearGrupoIam(e, { nombre: f.nombre }));
        zonaError.repintar();
        if (error) return;
        const r = cx.hacer({ servicio: 'IAM', accion: 'CreateGroup', error: 'Failed to create user group' }, (e) => crearGrupoIam(e, { nombre: f.nombre, usuarios: f.usuarios, politicas: f.politicas }));
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: `${r.valor.nombre} user group created.`, accion: { texto: 'View group', alClic: () => cx.ir(rutaGrupo(r.valor.nombre)) } });
          cx.ir('iam/grupos');
        }
      }
    })
  );
}

function detalleGrupo(cx, { nombre }) {
  const g = grupoDe(cx, nombre);
  migasIam(cx, { texto: 'User groups', ruta: 'iam/grupos' }, { texto: nombre });
  if (!g) return noEncontrado(cx, 'Group', nombre, 'iam/grupos');
  const clave = `g:${nombre}`;
  const miembros = () => cx.estado.iam.usuarios.filter((u) => u.grupos.includes(nombre));
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: nombre, info: 'iam-grupo', cx, acciones: [ui.boton('Delete', { escribe: true, alClic: () => borrarGrupos(cx, [nombre]) })] }),
    ui.contenedor({
      titulo: 'Summary',
      cuerpo: ui.pares([{ etiqueta: 'User group name', valor: nombre }, { etiqueta: 'Creation time', valor: fechaIam(g.creado) }, { etiqueta: 'ARN', valor: ui.copiable(g.arn) }], { columnas: 3 })
    }),
    ui.pestanas({
      activa: pestanaDe(cx, clave, 'usuarios'),
      alCambiar: (id) => recordar(cx, clave, id),
      pestanas: [
        {
          id: 'usuarios',
          texto: `Users (${miembros().length})`,
          contenido: () =>
            ui.tabla(cx, {
              titulo: 'Users in this group',
              info: 'iam-usuario',
              variante: 'contenedor',
              descripcion: 'An IAM user is an entity that you create in AWS to represent the person or application that uses it to interact with AWS.',
              filas: miembros,
              clave: (u) => u.nombre,
              seleccion: 'multiple',
              filtro: 'Search',
              columnas: [
                { titulo: 'User name', valor: (u) => ui.enlace(u.nombre, rutaUsuario(u.nombre), { cx }), texto: (u) => u.nombre },
                { titulo: 'Groups', valor: (u) => String(u.grupos.length) },
                { titulo: 'Last activity', valor: () => '–' },
                { titulo: 'Creation time', valor: (u) => `${edad(u.creado)} ago` }
              ],
              acciones: (sel) => [
                ui.boton('Remove', {
                  escribe: true,
                  desactivado: !sel.length,
                  alClic: () =>
                    cx.confirmar({
                      titulo: `Remove ${sel.length === 1 ? sel[0].nombre : `${sel.length} users`} from ${nombre}?`,
                      textoBoton: 'Remove users',
                      contenido: h('p', {}, 'The users will lose the permissions that come from this group.'),
                      aceptar: () => {
                        const r = cx.hacer({ servicio: 'IAM', accion: 'RemoveUserFromGroup', error: 'Failed to remove users' }, (e) => sel.forEach((u) => quitarUsuarioDeGrupo(e, nombre, u.nombre)), { atomico: true });
                        if (r.ok) {
                          cx.flash({ tipo: 'exito', texto: `Removed ${sel.map((u) => u.nombre).join(', ')} from ${nombre}.` });
                          recargar(cx);
                        }
                        return true;
                      }
                    })
                }),
                ui.boton('Add users', { variante: 'primario', alClic: () => cx.ir(rutaGrupo(nombre, 'agregar-usuarios')) })
              ],
              vacio: { titulo: 'No resources to display', texto: 'There are no users in this group.' }
            })
        },
        {
          id: 'permisos',
          texto: 'Permissions',
          contenido: () =>
            ui.tabla(cx, {
              titulo: 'Permissions policies',
              info: 'iam-politica',
              variante: 'contenedor',
              descripcion: 'You can attach up to 10 managed policies.',
              filas: () => (grupoDe(cx, nombre)?.politicas ?? []).map((p) => politicaIam(p) ?? { nombre: p, tipo: 'AWS managed', descripcion: '' }),
              clave: (p) => p.nombre,
              seleccion: 'multiple',
              filtro: 'Search',
              columnas: [
                { titulo: 'Policy name', valor: (p) => ui.enlace(p.nombre, rutaPolitica(p.nombre), { cx }), texto: (p) => p.nombre },
                { titulo: 'Type', valor: (p) => p.tipo },
                { titulo: 'Description', valor: (p) => p.descripcion }
              ],
              acciones: (sel) => [
                ui.boton('Remove', { escribe: true, desactivado: !sel.length, alClic: () => quitarPoliticas(cx, { tipo: 'group', nombre, politicas: sel.map((p) => p.nombre), quitar: quitarPoliticaGrupo }) }),
                ui.menuBoton('Add permissions', [
                  { texto: 'Attach policies', escribe: true, alClic: () => cx.ir(rutaGrupo(nombre, 'adjuntar')) },
                  { texto: 'Create inline policy', desactivado: true }
                ], { variante: 'primario' })
              ],
              vacio: { titulo: 'No resources to display', texto: 'There are no permissions policies attached to this group.' }
            })
        },
        { id: 'asesor', texto: 'Access Advisor', desactivada: true, contenido: () => null }
      ]
    })
  );
}

/** «Attach permission policies» de un grupo o un rol (misma pantalla). */
function paginaAdjuntar(cx, { tipo, nombre, entidad, adjuntar, volver }) {
  let elegidas = [];
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: `Attach permission policies to ${nombre}`, info: 'iam-politica', cx }),
    ui.tabla(cx, {
      titulo: 'Current permissions policies',
      variante: 'contenedor',
      filas: () => (entidad()?.politicas ?? []).map((p) => politicaIam(p) ?? { nombre: p, tipo: 'AWS managed' }),
      clave: (p) => p.nombre,
      filtro: false,
      columnas: [
        { titulo: 'Policy name', valor: (p) => p.nombre },
        { titulo: 'Type', valor: (p) => p.tipo }
      ],
      vacio: { titulo: 'No resources to display', texto: `There are no policies attached to this ${tipo}.` }
    }),
    tablaPoliticas(cx, { titulo: 'Other permissions policies', descripcion: '', excluir: () => entidad()?.politicas ?? [], alSeleccionar: (ids) => (elegidas = ids) }),
    ui.pieFormulario({
      cancelar: volver,
      textoEnviar: 'Attach policies',
      enviar: () => {
        if (!elegidas.length) return cx.flash({ tipo: 'error', texto: 'Select at least one policy.' });
        const r = cx.hacer({ servicio: 'IAM', accion: tipo === 'role' ? 'AttachRolePolicy' : 'AttachGroupPolicy', error: 'Failed to attach policies' }, (e) => adjuntar(e, nombre, elegidas));
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: `Policy was successfully attached to ${tipo}.` });
          volver();
        }
      }
    })
  );
}

function adjuntarAGrupo(cx, { nombre }) {
  migasIam(cx, { texto: 'User groups', ruta: 'iam/grupos' }, { texto: nombre, ruta: rutaGrupo(nombre) }, { texto: 'Attach permission policies' });
  if (!grupoDe(cx, nombre)) return noEncontrado(cx, 'Group', nombre, 'iam/grupos');
  return paginaAdjuntar(cx, {
    tipo: 'group',
    nombre,
    entidad: () => grupoDe(cx, nombre),
    adjuntar: adjuntarPoliticasGrupo,
    volver: () => (recordar(cx, `g:${nombre}`, 'permisos'), cx.ir(rutaGrupo(nombre)))
  });
}

function agregarUsuariosPagina(cx, { nombre }) {
  migasIam(cx, { texto: 'User groups', ruta: 'iam/grupos' }, { texto: nombre, ruta: rutaGrupo(nombre) }, { texto: 'Add users' });
  if (!grupoDe(cx, nombre)) return noEncontrado(cx, 'Group', nombre, 'iam/grupos');
  let elegidos = [];
  const volver = () => (recordar(cx, `g:${nombre}`, 'usuarios'), cx.ir(rutaGrupo(nombre)));
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: `Add users to ${nombre}`, info: 'iam-grupo', cx }),
    ui.tabla(cx, {
      titulo: 'Other users in this account',
      variante: 'contenedor',
      filas: () => cx.estado.iam.usuarios.filter((u) => !u.grupos.includes(nombre)),
      clave: (u) => u.nombre,
      seleccion: 'multiple',
      filtro: 'Search',
      columnas: [
        { titulo: 'User name', valor: (u) => u.nombre },
        { titulo: 'Groups', valor: (u) => String(u.grupos.length) },
        { titulo: 'Creation time', valor: (u) => `${edad(u.creado)} ago` }
      ],
      vacio: { titulo: 'No resources to display', texto: 'All users in this account are already in this group.' },
      alSeleccionar: (ids) => (elegidos = ids)
    }),
    ui.pieFormulario({
      cancelar: volver,
      textoEnviar: 'Add users',
      enviar: () => {
        if (!elegidos.length) return cx.flash({ tipo: 'error', texto: 'Select at least one user.' });
        const r = cx.hacer({ servicio: 'IAM', accion: 'AddUserToGroup', error: 'Failed to add users' }, (e) => agregarUsuariosAGrupo(e, nombre, elegidos));
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: `${elegidos.join(', ')} added to ${nombre}.` });
          volver();
        }
      }
    })
  );
}

/* ============================================================ roles */

const SERVICIOS_ROL = [
  { valor: 'ec2.amazonaws.com', etiqueta: 'EC2', casos: [
    { valor: 'ec2', etiqueta: 'EC2', descripcion: 'Allows EC2 instances to call AWS services on your behalf.' },
    { valor: 'ssm', etiqueta: 'EC2 Role for AWS Systems Manager', descripcion: 'Allows EC2 instances to call AWS services like CloudWatch and Systems Manager on your behalf.', desactivado: true },
    { valor: 'spot', etiqueta: 'EC2 Spot Fleet Role', descripcion: 'Allows EC2 Spot Fleet to request and terminate Spot Instances on your behalf.', desactivado: true }
  ] },
  { valor: 'lambda.amazonaws.com', etiqueta: 'Lambda', casos: [{ valor: 'lambda', etiqueta: 'Lambda', descripcion: 'Allows Lambda functions to call AWS services on your behalf.' }] },
  { valor: 'ecs-tasks.amazonaws.com', etiqueta: 'Elastic Container Service', desactivado: true, casos: [] },
  { valor: 'rds.amazonaws.com', etiqueta: 'RDS', desactivado: true, casos: [] },
  { valor: 'cloudformation.amazonaws.com', etiqueta: 'CloudFormation', desactivado: true, casos: [] }
];

const servicioCorto = (s) => s.replace('.amazonaws.com', '');

function confianza(servicio) {
  return JSON.stringify({ Version: '2012-10-17', Statement: [{ Effect: 'Allow', Action: ['sts:AssumeRole'], Principal: { Service: [servicio] } }] }, null, 4);
}

function roles(cx) {
  migasIam(cx, { texto: 'Roles' });
  const t = ui.tabla(cx, {
    titulo: 'Roles',
    info: 'iam-rol',
    descripcion: 'An IAM role is an identity you can create that has specific permissions with credentials that are valid for short durations. Roles can be assumed by entities that you trust.',
    filas: () => cx.estado.iam.roles,
    clave: (r) => r.nombre,
    seleccion: 'multiple',
    filtro: 'Search',
    columnas: [
      { titulo: 'Role name', valor: (r) => ui.enlace(r.nombre, rutaRol(r.nombre), { cx }), texto: (r) => r.nombre },
      { titulo: 'Trusted entities', valor: (r) => `AWS Service: ${servicioCorto(r.servicio)}` },
      { titulo: 'Last activity', valor: () => '–' }
    ],
    acciones: (sel) => [
      ui.boton('Delete', { escribe: true, desactivado: !sel.length, alClic: () => borrarRoles(cx, sel.map((r) => r.nombre)) }),
      ui.boton('Create role', { variante: 'primario', alClic: () => cx.ir('iam/roles/crear') })
    ],
    vacio: { titulo: 'No resources to display', texto: 'There are no roles in this account.', accion: ui.boton('Create role', { escribe: true, alClic: () => cx.ir('iam/roles/crear') }) }
  });
  return h(
    'div',
    { class: 'cx-pagina' },
    t,
    ui.contenedor({ titulo: 'Roles Anywhere', info: 'iam-rol', cx, descripcion: 'Authenticate your non AWS workloads and securely provide access to AWS services.', acciones: ui.boton('Manage', { desactivado: true }), cuerpo: h('p', { class: 'cx-texto-sec' }, 'No disponible en el simulador.') })
  );
}

function borrarRoles(cx, nombres) {
  const enUso = nombres.filter((n) => vivas(cx.estado).some((i) => i.rolIam === n));
  cx.confirmar({
    titulo: nombres.length === 1 ? `Delete ${nombres[0]}?` : `Delete ${nombres.length} roles?`,
    palabra: nombres.length === 1 ? nombres[0] : 'delete',
    textoBoton: 'Delete',
    contenido: [
      h('p', {}, 'Deleting a role removes its permissions from every service and instance that uses it.'),
      enUso.length ? ui.alerta({ tipo: 'aviso', contenido: `${enUso.join(', ')} is attached to a running instance. Remove it from the instance first (EC2 → Actions → Security → Modify IAM role).` }) : null
    ],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'IAM', accion: 'DeleteRole', error: 'Failed to delete role' }, (e) => nombres.forEach((n) => eliminarRol(e, n)), { atomico: true });
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: nombres.length === 1 ? `Role ${nombres[0]} deleted.` : `${nombres.length} roles deleted.` });
        cx.ir('iam/roles');
      }
      return true;
    }
  });
}

function crearRolPagina(cx) {
  migasIam(cx, { texto: 'Roles', ruta: 'iam/roles' }, { texto: 'Create role' });
  const f = { paso: 0, tipo: 'servicio', servicio: null, caso: null, politicas: [], nombre: '', descripcion: '' };
  const errores = {};
  const pasos = ['Select trusted entity', 'Add permissions', 'Name, review, and create'];
  const servicioDe = () => SERVICIOS_ROL.find((s) => s.valor === f.servicio);

  const zona = ui.region(() => {
    let cuerpo;
    if (f.paso === 0) {
      const s = servicioDe();
      cuerpo = [
        ui.contenedor({
          titulo: 'Trusted entity type',
          info: 'iam-rol',
          cx,
          cuerpo: ui.tarjetas({
            columnas: 3,
            valor: f.tipo,
            alCambiar: (v) => ((f.tipo = v), zona.repintar()),
            opciones: [
              { valor: 'servicio', etiqueta: 'AWS service', descripcion: 'Allow AWS services like EC2, Lambda, or others to perform actions in this account.' },
              { valor: 'cuenta', etiqueta: 'AWS account', descripcion: 'Allow entities in other AWS accounts belonging to you or a 3rd party to perform actions in this account.' },
              { valor: 'web', etiqueta: 'Web identity', descripcion: 'Allows users federated by the specified external web identity provider to assume this role to perform actions in this account.' },
              { valor: 'saml', etiqueta: 'SAML 2.0 federation', descripcion: 'Allow users federated with SAML 2.0 from a corporate directory to perform actions in this account.' },
              { valor: 'propia', etiqueta: 'Custom trust policy', descripcion: 'Create a custom trust policy to enable others to perform actions in this account.' }
            ]
          })
        }),
        f.tipo !== 'servicio'
          ? ui.alerta({ tipo: 'info', titulo: 'No disponible en este simulador', contenido: 'En tus laboratorios los roles son para un servicio de AWS (AWS service → EC2). Elige «AWS service».' })
          : ui.contenedor({
              titulo: 'Use case',
              descripcion: 'Allow an AWS service like EC2, Lambda, or others to perform actions in this account.',
              cuerpo: h(
                'div',
                { class: 'cx-form' },
                ui.campo({
                  etiqueta: 'Service or use case',
                  control: ui.selector({
                    opciones: SERVICIOS_ROL.map((x) => ({ valor: x.valor, etiqueta: x.etiqueta, desactivado: x.desactivado })),
                    valor: f.servicio,
                    placeholder: 'Choose a service or use case',
                    filtrar: true,
                    alCambiar: (v) => {
                      f.servicio = v;
                      f.caso = SERVICIOS_ROL.find((x) => x.valor === v)?.casos[0]?.valor ?? null;
                      zona.repintar();
                    }
                  }),
                  error: errores.servicio
                }),
                s
                  ? ui.campo({
                      etiqueta: 'Use case',
                      descripcion: `Choose a use case for the specified service.`,
                      control: ui.radios({ valor: f.caso, alCambiar: (v) => (f.caso = v), opciones: s.casos })
                    })
                  : null
              )
            })
      ];
    } else if (f.paso === 1) {
      cuerpo = [
        tablaPoliticas(cx, { titulo: 'Permissions policies', descripcion: 'Choose one or more policies to attach to your new role.', seleccionados: f.politicas, alSeleccionar: (ids) => (f.politicas = ids) }),
        ui.expandible({ titulo: 'Set permissions boundary - optional', contenido: h('p', { class: 'cx-texto-sec' }, 'No disponible en el simulador.') })
      ];
    } else {
      const s = servicioDe();
      cuerpo = [
        ui.contenedor({
          titulo: 'Role details',
          cuerpo: h(
            'div',
            { class: 'cx-form' },
            ui.campo({
              etiqueta: 'Role name',
              info: 'iam-rol',
              cx,
              descripcion: 'Enter a meaningful name to identify this role.',
              control: ui.entrada({ valor: f.nombre, etiquetaAccesible: 'Role name', alCambiar: (v) => (f.nombre = v) }),
              restriccion: 'Maximum 64 characters. Use alphanumeric and ‘+=,.@-_’ characters.',
              error: errores.nombre
            }),
            ui.campo({
              etiqueta: 'Description',
              descripcion: 'Add a short explanation for this role.',
              control: ui.area({ valor: f.descripcion, filas: 3, alCambiar: (v) => (f.descripcion = v) }),
              restriccion: 'Maximum 1000 characters. Use letters (A-Z and a-z), numbers (0-9), tabs, new lines, or any of the following characters: _+=,.@-/\\[]!#$%^&*;:"\'<>?`~(){}|'
            })
          )
        }),
        ui.contenedor({
          titulo: 'Step 1: Select trusted entities',
          acciones: ui.boton('Edit', { alClic: () => ((f.paso = 0), zona.repintar()) }),
          cuerpo: ui.campo({ etiqueta: 'Trust policy', control: ui.area({ valor: confianza(f.servicio), filas: 16, monoespaciado: true, soloLectura: true }) })
        }),
        h(
          'div',
          {},
          resumenPermisos(cx, { grupos: [], politicas: f.politicas }),
          h('div', { style: { marginTop: '8px' } }, ui.boton('Edit', { alClic: () => ((f.paso = 1), zona.repintar()) }))
        ),
        ui.contenedor({ titulo: 'Step 3: Add tags - optional', cuerpo: h('p', { class: 'cx-texto-sec' }, `No tags associated with the resource. (Use case: ${s?.etiqueta ?? '–'})`) })
      ];
    }
    return asistente(cx, {
      pasos,
      paso: f.paso,
      titulo: pasos[f.paso],
      info: 'iam-rol',
      cuerpo,
      pie: pieAsistente({
        cancelar: () => cx.ir('iam/roles'),
        anterior: f.paso ? () => ((f.paso -= 1), zona.repintar()) : null,
        textoSiguiente: f.paso < 2 ? 'Next' : 'Create role',
        siguiente: f.paso < 2 ? siguiente : crear
      })
    });
  });

  function siguiente() {
    if (f.paso === 0) {
      if (f.tipo !== 'servicio') return;
      errores.servicio = f.servicio ? null : 'Choose a service or use case.';
      if (errores.servicio) return zona.repintar();
      if (!f.descripcion) f.descripcion = servicioDe()?.casos.find((c) => c.valor === f.caso)?.descripcion ?? '';
    }
    f.paso += 1;
    zona.repintar();
  }

  function crear() {
    errores.nombre = probar(cx, (e) => crearRol(e, { nombre: f.nombre, servicio: f.servicio }));
    if (errores.nombre) return zona.repintar();
    const r = cx.hacer({ servicio: 'IAM', accion: 'CreateRole', error: 'Failed to create role' }, (e) => crearRol(e, { nombre: f.nombre, servicio: f.servicio, descripcion: f.descripcion, politicas: f.politicas }));
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: `Role ${r.valor.nombre} created.`, accion: { texto: 'View role', alClic: () => cx.ir(rutaRol(r.valor.nombre)) } });
      cx.ir('iam/roles');
    }
  }

  return zona;
}

function detalleRol(cx, { nombre }) {
  const r = rolDe(cx, nombre);
  migasIam(cx, { texto: 'Roles', ruta: 'iam/roles' }, { texto: nombre });
  if (!r) return noEncontrado(cx, 'Role', nombre, 'iam/roles');
  const clave = `r:${nombre}`;
  const instancias = vivas(cx.estado).filter((i) => i.rolIam === nombre);
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: nombre, info: 'iam-rol', cx, descripcion: r.descripcion || undefined, acciones: [ui.boton('Delete', { escribe: true, alClic: () => borrarRoles(cx, [nombre]) })] }),
    ui.contenedor({
      titulo: 'Summary',
      cuerpo: ui.pares(
        [
          { etiqueta: 'Creation date', valor: fechaIam(r.creado) },
          { etiqueta: 'ARN', valor: ui.copiable(r.arn) },
          { etiqueta: 'Instance profile ARN', valor: r.servicio === 'ec2.amazonaws.com' ? ui.copiable(`arn:aws:iam::${cx.estado.cuenta.id}:instance-profile/${nombre}`) : '–' },
          { etiqueta: 'Last activity', valor: instancias.length ? `Used by ${instancias.map((i) => i.id).join(', ')}` : '–' },
          { etiqueta: 'Maximum session duration', valor: '1 hour' }
        ],
        { columnas: 3 }
      )
    }),
    ui.pestanas({
      activa: pestanaDe(cx, clave, 'permisos'),
      alCambiar: (id) => recordar(cx, clave, id),
      pestanas: [
        {
          id: 'permisos',
          texto: 'Permissions',
          contenido: () =>
            ui.tabla(cx, {
              titulo: 'Permissions policies',
              info: 'iam-politica',
              variante: 'contenedor',
              descripcion: 'You can attach up to 10 managed policies.',
              filas: () => (rolDe(cx, nombre)?.politicas ?? []).map((p) => politicaIam(p) ?? { nombre: p, tipo: 'AWS managed' }),
              clave: (p) => p.nombre,
              seleccion: 'multiple',
              filtro: 'Search',
              columnas: [
                { titulo: 'Policy name', valor: (p) => ui.enlace(p.nombre, rutaPolitica(p.nombre), { cx }), texto: (p) => p.nombre },
                { titulo: 'Type', valor: (p) => p.tipo },
                { titulo: 'Attached entities', valor: (p) => String(entidadesCon(cx.estado, p.nombre).length) }
              ],
              acciones: (sel) => [
                ui.boton('Remove', { escribe: true, desactivado: !sel.length, alClic: () => quitarPoliticas(cx, { tipo: 'role', nombre, politicas: sel.map((p) => p.nombre), quitar: quitarPoliticaRol }) }),
                ui.menuBoton('Add permissions', [
                  { texto: 'Attach policies', escribe: true, alClic: () => cx.ir(rutaRol(nombre, 'adjuntar')) },
                  { texto: 'Create inline policy', desactivado: true }
                ], { variante: 'primario' })
              ],
              vacio: { titulo: 'No resources to display', texto: 'There are no permissions policies attached to this role.' }
            })
        },
        {
          id: 'confianza',
          texto: 'Trust relationships',
          contenido: () =>
            ui.contenedor({
              titulo: 'Trusted entities',
              info: 'iam-rol',
              cx,
              acciones: ui.boton('Edit trust policy', { desactivado: true }),
              descripcion: 'Entities that can assume this role under specified conditions.',
              cuerpo: h('pre', { class: 'cx-log cx-s3-json' }, confianza(r.servicio))
            })
        },
        { id: 'etiquetas', texto: 'Tags', contenido: () => ui.contenedor({ titulo: 'Tags', contador: 0, cuerpo: h('div', { class: 'cx-tabla__vacia' }, h('b', {}, 'No tags associated with the resource.')) }) },
        { id: 'asesor', texto: 'Last Accessed', desactivada: true, contenido: () => null },
        { id: 'sesiones', texto: 'Revoke sessions', desactivada: true, contenido: () => null }
      ]
    })
  );
}

function adjuntarARol(cx, { nombre }) {
  migasIam(cx, { texto: 'Roles', ruta: 'iam/roles' }, { texto: nombre, ruta: rutaRol(nombre) }, { texto: 'Attach policy' });
  if (!rolDe(cx, nombre)) return noEncontrado(cx, 'Role', nombre, 'iam/roles');
  return paginaAdjuntar(cx, {
    tipo: 'role',
    nombre,
    entidad: () => rolDe(cx, nombre),
    adjuntar: adjuntarPoliticasRol,
    volver: () => (recordar(cx, `r:${nombre}`, 'permisos'), cx.ir(rutaRol(nombre)))
  });
}

/* ============================================================ políticas */

function politicas(cx) {
  migasIam(cx, { texto: 'Policies' });
  const t = ui.tabla(cx, {
    titulo: 'Policies',
    info: 'iam-politica',
    descripcion: 'A policy is an object in AWS that defines permissions.',
    filas: () => POLITICAS_IAM,
    clave: (p) => p.nombre,
    seleccion: 'unica',
    filtro: 'Search',
    antesDelFiltro: h('span', { class: 'cx-iam-filtro-tipo' }, ui.selector({ opciones: [{ valor: 'todas', etiqueta: 'All types' }, { valor: 'aws', etiqueta: 'AWS managed' }, { valor: 'propia', etiqueta: 'Customer managed', desactivado: true }], valor: 'todas', compacto: true, etiquetaAccesible: 'Filter by Type' })),
    columnas: [
      { titulo: 'Policy name', valor: (p) => ui.enlace(p.nombre, rutaPolitica(p.nombre), { cx }), texto: (p) => p.nombre },
      { titulo: 'Type', valor: (p) => p.tipo },
      { titulo: 'Used as', valor: (p) => { const n = entidadesCon(cx.estado, p.nombre).length; return n ? `Permissions policy (${n})` : '–'; } },
      { titulo: 'Description', valor: (p) => p.descripcion }
    ],
    acciones: (sel) => [
      ui.menuBoton('Actions', [
        { texto: 'Attach', desactivado: true },
        { texto: 'Detach', desactivado: true },
        { texto: 'Delete', desactivado: true }
      ], { desactivado: !sel.length }),
      ui.boton('Create policy', { variante: 'primario', desactivado: true, titulo: 'En el simulador solo hay políticas administradas por AWS' })
    ]
  });
  return h('div', { class: 'cx-pagina' }, t);
}

function detallePolitica(cx, { nombre }) {
  const p = politicaIam(nombre);
  migasIam(cx, { texto: 'Policies', ruta: 'iam/politicas' }, { texto: nombre });
  if (!p) return noEncontrado(cx, 'Policy', nombre, 'iam/politicas');
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: nombre, info: 'iam-politica', cx, descripcion: p.descripcion }),
    ui.contenedor({
      titulo: 'Policy details',
      cuerpo: ui.pares(
        [
          { etiqueta: 'Type', valor: p.tipo },
          { etiqueta: 'Creation time', valor: 'February 06, 2015, 12:40 (UTC-06:00)' },
          { etiqueta: 'Edited time', valor: 'August 22, 2024, 11:05 (UTC-06:00)' },
          { etiqueta: 'ARN', valor: ui.copiable(arnPolitica(nombre)) }
        ],
        { columnas: 4 }
      )
    }),
    ui.pestanas({
      pestanas: [
        {
          id: 'permisos',
          texto: 'Permissions',
          contenido: () =>
            ui.contenedor({
              titulo: 'Permissions defined in this policy',
              info: 'iam-politica',
              cx,
              descripcion: 'Permissions defined in this policy document specify which actions are allowed or denied.',
              acciones: [ui.segmentado({ opciones: [{ valor: 'resumen', etiqueta: 'Summary', desactivado: true }, { valor: 'json', etiqueta: 'JSON' }], valor: 'json' })],
              cuerpo: h('pre', { class: 'cx-log cx-s3-json' }, jsonPolitica(nombre))
            })
        },
        {
          id: 'entidades',
          texto: 'Entities attached',
          contenido: () =>
            ui.tabla(cx, {
              titulo: 'Entities attached',
              variante: 'contenedor',
              filas: () => entidadesCon(cx.estado, nombre),
              clave: (x) => `${x.tipo}|${x.nombre}`,
              filtro: 'Filter',
              columnas: [
                { titulo: 'Entity name', valor: (x) => ui.enlace(x.nombre, x.ruta, { cx }), texto: (x) => x.nombre },
                { titulo: 'Entity type', valor: (x) => x.tipo },
                { titulo: 'Attached via', valor: () => 'Directly' }
              ],
              vacio: { titulo: 'No entities attached', texto: 'This policy is not attached to any user, group, or role.' }
            })
        },
        { id: 'versiones', texto: 'Policy versions', desactivada: true, contenido: () => null },
        { id: 'asesor', texto: 'Access Advisor', desactivada: true, contenido: () => null }
      ]
    })
  );
}

/* ============================================================ registro */

const noDisp = (titulo) => (cx) => {
  migasIam(cx, { texto: titulo });
  return ui.noDisponible(titulo);
};

export default {
  id: 'iam',
  nombre: 'IAM',
  titulo: 'IAM',
  descripcion: 'Manage access to AWS resources',
  categoria: 'seguridad',
  claves: 'identity users usuarios grupos roles politicas mfa',
  inicio: 'iam',
  menu: [
    { texto: 'Dashboard', ruta: 'iam' },
    {
      seccion: 'Access management',
      items: [
        { texto: 'User groups', ruta: 'iam/grupos' },
        { texto: 'Users', ruta: 'iam/usuarios' },
        { texto: 'Roles', ruta: 'iam/roles' },
        { texto: 'Policies', ruta: 'iam/politicas' },
        { texto: 'Identity providers', desactivado: true },
        { texto: 'Account settings', desactivado: true },
        { texto: 'Root access management', desactivado: true }
      ]
    },
    {
      seccion: 'Access reports',
      items: [
        { texto: 'Access Analyzer', desactivado: true },
        { texto: 'Credential report', desactivado: true },
        { texto: 'Organization activity', desactivado: true },
        { texto: 'Service control policies', desactivado: true }
      ]
    },
    { texto: 'Related consoles', desactivado: true },
    { texto: 'IAM Identity Center', externo: true, desactivado: true },
    { texto: 'AWS Organizations', externo: true, desactivado: true }
  ],
  rutas: {
    '': tablero,
    credenciales: credencialesRaiz,
    'mfa-raiz': (cx) => asignarMfaPagina(cx, { nombre: 'root' }, { raiz: true }),
    usuarios,
    'usuarios/crear': crearUsuarioPagina,
    'usuarios/creado': usuarioCreado,
    'usuarios/:nombre': detalleUsuario,
    'usuarios/:nombre/permisos': agregarPermisosUsuario,
    'usuarios/:nombre/agregar-grupos': agregarAGrupos,
    'usuarios/:nombre/mfa': (cx, p) => asignarMfaPagina(cx, p),
    'usuarios/:nombre/llave': crearLlavePagina,
    grupos,
    'grupos/crear': crearGrupoPagina,
    'grupos/:nombre': detalleGrupo,
    'grupos/:nombre/adjuntar': adjuntarAGrupo,
    'grupos/:nombre/agregar-usuarios': agregarUsuariosPagina,
    roles,
    'roles/crear': crearRolPagina,
    'roles/:nombre': detalleRol,
    'roles/:nombre/adjuntar': adjuntarARol,
    politicas,
    'politicas/:nombre': detallePolitica,
    'proveedores': noDisp('Identity providers')
  },
  busqueda: [
    { texto: 'Users', ruta: 'iam/usuarios', claves: 'usuarios' },
    { texto: 'User groups', ruta: 'iam/grupos', claves: 'grupos' },
    { texto: 'Roles', ruta: 'iam/roles' },
    { texto: 'Policies', ruta: 'iam/politicas', claves: 'politicas' },
    { texto: 'My security credentials', ruta: 'iam/credenciales', claves: 'mfa root' }
  ],
  ayudas: {
    'iam-usuario': {
      titulo: 'Usuario de IAM',
      texto: [
        'Un **usuario** es una identidad para una persona (o un programa) dentro de tu cuenta: tiene su nombre, su contraseña para la consola y, si hace falta, llaves de acceso.',
        'Nunca compartas el usuario **raíz** (el correo con el que abriste la cuenta): crea un usuario para cada persona.',
        'Un usuario recién creado **no puede hacer nada** hasta que le das permisos, mejor si es a través de un grupo.'
      ]
    },
    'iam-grupo': {
      titulo: 'Grupo de usuarios',
      texto: [
        'Un **grupo** junta usuarios que hacen el mismo trabajo (por ejemplo `cajeros`). Le pones las políticas al grupo y todos sus miembros las **heredan**.',
        'Así, cuando llega alguien nuevo, solo lo metes al grupo; cuando se va, lo sacas. No tienes que acordarte de qué permiso le diste a cada quien.',
        'Lo recomendado: permisos **en el grupo**, no puestos directo al usuario.'
      ]
    },
    'iam-rol': {
      titulo: 'Rol de IAM',
      texto: [
        'Un **rol** es un conjunto de permisos que alguien o algo «se pone» por un rato, con credenciales **temporales** que se renuevan solas.',
        'El caso típico: un servidor **EC2** que necesita leer S3. En vez de copiar una llave de acceso dentro del servidor (que alguien podría robar), creas un rol para EC2 y se lo asignas a la instancia.',
        'Al crearlo eliges la **entidad de confianza** (quién puede usarlo: `AWS service → EC2`) y sus políticas.'
      ]
    },
    'iam-politica': {
      titulo: 'Políticas',
      texto: [
        'Una **política** es un documento JSON que dice qué acciones se permiten y sobre qué recursos.',
        'Las **AWS managed** ya vienen hechas por AWS: `AmazonS3ReadOnlyAccess` deja ver S3 sin cambiar nada; `AdministratorAccess` deja hacer **todo**.',
        'Aplica el **mínimo privilegio**: da solo lo necesario. Si alguien solo necesita ver, usa una política `ReadOnly` del servicio que ocupa, no una que abra toda la cuenta.'
      ]
    },
    'iam-minimo': {
      titulo: 'Mínimo privilegio',
      texto: [
        'Dar a cada persona o programa **solo** los permisos que necesita para su trabajo, y nada más.',
        'Si una contraseña o llave se filtra, el daño queda limitado a esos pocos permisos.'
      ]
    },
    'iam-mfa': {
      titulo: 'MFA (autenticación multifactor)',
      texto: [
        'El **MFA** es una segunda cerradura: además de la contraseña, pide un código de 6 dígitos que cambia cada 30 segundos en tu celular (app como Google Authenticator).',
        'Si alguien roba la contraseña, todavía le falta tu celular para entrar.',
        'Actívalo **primero en la raíz** y luego en cada usuario que entre a la consola.',
        'Para darlo de alta escribes **dos códigos seguidos** de la app: así AWS comprueba que tu app y AWS están sincronizadas.'
      ]
    },
    'iam-llaves': {
      titulo: 'Llaves de acceso',
      texto: [
        'Una **llave de acceso** (`AKIA…` + una clave secreta) sirve para que un programa o la línea de comandos use AWS sin contraseña.',
        'Son credenciales **de largo plazo**: si se filtran (por ejemplo en GitHub), cualquiera puede usarlas. Por eso:',
        ['Si un servidor de AWS necesita permisos, usa un **rol**, no una llave.', 'Desactiva (**Deactivate**) o borra las llaves que ya no se usan.', 'La clave secreta solo se ve una vez, al crearla.']
      ]
    },
    'iam-raiz': {
      titulo: 'Usuario raíz',
      texto: [
        'La **raíz** es el correo con el que se abrió la cuenta: puede hacer todo, incluso cerrarla, y sus permisos no se pueden limitar.',
        'Protégela con **MFA**, no le crees llaves de acceso y úsala solo para lo que de verdad la necesita.'
      ]
    },
    'iam-consola': {
      titulo: 'Acceso a la consola',
      texto: [
        'Si marcas **Provide user access to the AWS Management Console**, el usuario tendrá contraseña para entrar a la consola web.',
        'Con **must create a new password at next sign-in**, la persona cambia la contraseña la primera vez que entra: así solo ella la conoce.',
        'Un usuario solo para programas no necesita consola: le bastan llaves (o mejor, un rol).'
      ]
    }
  }
};
