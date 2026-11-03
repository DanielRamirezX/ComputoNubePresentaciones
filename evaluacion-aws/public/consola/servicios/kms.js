// ---------------------------------------------------------------------------
// AWS KEY MANAGEMENT SERVICE (KMS)
//
// La consola de KMS: AWS managed keys (solo lectura: aws/s3, aws/ebs,
// aws/rds… aparecen cuando un servicio las usa), Customer managed keys con
// «Create key» (asistente de 5 pasos: tipo y uso, alias, administradores,
// usuarios y revisión con la key policy), el detalle con sus pestañas (Key
// policy, Cryptographic configuration, Tags, Key rotation, Aliases) y Key
// actions: Disable / Enable, Schedule key deletion (7 a 30 días) y Cancel key
// deletion. El modelo vive en modelo/secretos.js.
// ---------------------------------------------------------------------------

import * as ui from '../ui.js';
import {
  cancelarBorradoLlaveKms,
  crearAliasKms,
  crearLlaveKms,
  deshabilitarLlaveKms,
  editarLlaveKms,
  eliminarAliasKms,
  etiquetasLlaveKms,
  habilitarLlaveKms,
  llaveKmsDe,
  permisosLlaveKms,
  politicaLlaveKms,
  programarBorradoLlaveKms,
  rotacionLlaveKms,
  rotarLlaveKmsAhora,
  specKms,
  SPECS_KMS
} from '../modelo.js';
import { noExiste } from './comun.js';

const { h } = ui;

const migaBase = { texto: 'KMS', ruta: 'kms' };
const llaves = (cx) => cx.estado.kms?.llaves ?? [];
const rutaLlave = (k) => `kms/llaves/${k.id}`;

const ESTADOS_LLAVE = {
  Enabled: ['exito', 'Enabled'],
  Disabled: ['inactivo', 'Disabled'],
  PendingDeletion: ['aviso', 'Pending deletion']
};
const estadoLlave = (k) => ui.estado(...(ESTADOS_LLAVE[k.estado] ?? ['info', k.estado]));

const TEXTO_USO = { ENCRYPT_DECRYPT: 'Encrypt and decrypt', SIGN_VERIFY: 'Sign and verify', GENERATE_VERIFY_MAC: 'Generate and verify MAC', KEY_AGREEMENT: 'Key agreement' };
const tipoLlave = (k) => specKms(k.spec)?.tipo ?? 'Symmetric';

/** Los usuarios y roles de IAM de la cuenta (para administradores y usuarios de la llave). */
function principales(estado) {
  const cuenta = estado.cuenta?.id ?? '123456789012';
  return [
    ...(estado.iam?.usuarios ?? []).map((u) => ({ arn: `arn:aws:iam::${cuenta}:user/${u.nombre}`, nombre: u.nombre, tipo: 'User' })),
    ...(estado.iam?.roles ?? []).map((r) => ({ arn: `arn:aws:iam::${cuenta}:role/${r.nombre}`, nombre: r.nombre, tipo: 'Role' }))
  ];
}
const nombreDeArn = (arn) => String(arn).split('/').pop();
const tipoDeArn = (arn) => (String(arn).includes(':role/') ? 'Role' : 'User');

/* ============================================================ listas */

function listaCliente(cx) {
  cx.migas([migaBase, { texto: 'Customer managed keys' }]);
  const t = ui.tabla(cx, {
    titulo: 'Customer managed keys',
    info: 'kms',
    filas: () => llaves(cx).filter((k) => !k.administradaPorAws),
    clave: (k) => k.id,
    seleccion: 'unica',
    filtro: 'Filter keys by properties or tags',
    columnas: [
      { titulo: 'Aliases', valor: (k) => (k.aliases.length ? ui.enlace(k.aliases.join(', '), rutaLlave(k), { cx }) : '–'), texto: (k) => k.aliases.join(', ') },
      { titulo: 'Key ID', valor: (k) => ui.enlace(k.id, rutaLlave(k), { cx }), texto: (k) => k.id },
      { titulo: 'Status', valor: estadoLlave, texto: (k) => k.estado },
      { titulo: 'Key type', valor: tipoLlave },
      { titulo: 'Key spec', valor: (k) => k.spec },
      { titulo: 'Key usage', valor: (k) => TEXTO_USO[k.uso] ?? k.uso }
    ],
    acciones: (sel) => [
      ui.menuBoton('Key actions', () => menuAcciones(cx, sel[0]), { desactivado: !sel.length }),
      ui.boton('Create key', { variante: 'primario', alClic: () => cx.ir('kms/crear') })
    ],
    vacio: { titulo: 'No keys', texto: 'You don’t have any customer managed keys in this Region.', accion: () => ui.boton('Create key', { escribe: true, alClic: () => cx.ir('kms/crear') }) }
  });
  return h('div', { class: 'cx-pagina' }, t);
}

function listaAws(cx) {
  cx.migas([migaBase, { texto: 'AWS managed keys' }]);
  const t = ui.tabla(cx, {
    titulo: 'AWS managed keys',
    info: 'kms-aws',
    descripcion: 'AWS creates, manages and uses these keys on your behalf. You can view them, but you can’t change or delete them.',
    filas: () => llaves(cx).filter((k) => k.administradaPorAws),
    clave: (k) => k.id,
    seleccion: null,
    filtro: 'Filter keys by properties or tags',
    columnas: [
      { titulo: 'Aliases', valor: (k) => ui.enlace(k.aliases.join(', '), rutaLlave(k), { cx }), texto: (k) => k.aliases.join(', ') },
      { titulo: 'Key ID', valor: (k) => ui.enlace(k.id, rutaLlave(k), { cx }), texto: (k) => k.id },
      { titulo: 'Status', valor: estadoLlave, texto: (k) => k.estado }
    ],
    vacio: { titulo: 'No keys', texto: 'AWS creates an AWS managed key the first time a service (S3, EBS, RDS…) encrypts something in your account.' }
  });
  return h('div', { class: 'cx-pagina' }, t);
}

function menuAcciones(cx, k) {
  if (!k) return [];
  const pendiente = k.estado === 'PendingDeletion';
  return [
    { texto: 'Enable', escribe: true, desactivado: k.estado !== 'Disabled', alClic: () => cambiarEstado(cx, k, true) },
    { texto: 'Disable', escribe: true, desactivado: k.estado !== 'Enabled', alClic: () => deshabilitar(cx, k) },
    '-',
    { texto: 'Schedule key deletion', escribe: true, desactivado: pendiente, alClic: () => programarBorrado(cx, k) },
    { texto: 'Cancel key deletion', escribe: true, desactivado: !pendiente, alClic: () => cancelarBorrado(cx, k) }
  ];
}

/* ============================================================ crear (asistente) */

const PASOS = ['Configure key', 'Add labels', 'Define key administrative permissions', 'Define key usage permissions', 'Review'];
const OPCIONALES = new Set([2, 3]);

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
            h('small', {}, `Step ${i + 1}${OPCIONALES.has(i) ? ' - optional' : ''}`),
            i < f.paso ? h('a', { href: '#', class: 'cx-enlace', onclick: (ev) => (ev.preventDefault(), irA(i)) }, p) : h('span', {}, p)
          )
        )
      )
    ),
    h('div', { class: 'cx-asis__cuerpo cx-pagina' }, ui.encabezado({ titulo: PASOS[f.paso], info: 'kms', cx }), cuerpo, pie)
  );
}

/** Los usos que admite cada tipo de llave, como en la consola. */
const USOS = {
  simetrica: [
    { valor: 'ENCRYPT_DECRYPT', etiqueta: 'Encrypt and decrypt', descripcion: 'Use the key only to encrypt and decrypt data.' },
    { valor: 'GENERATE_VERIFY_MAC', etiqueta: 'Generate and verify MAC', descripcion: 'Use the key only to generate and verify hash-based message authentication codes (HMAC).' }
  ],
  asimetrica: [
    { valor: 'ENCRYPT_DECRYPT', etiqueta: 'Encrypt and decrypt', descripcion: 'Use the key pair for public key encryption.' },
    { valor: 'SIGN_VERIFY', etiqueta: 'Sign and verify', descripcion: 'Use the key pair for signing and verification.' },
    { valor: 'KEY_AGREEMENT', etiqueta: 'Key agreement', descripcion: 'Use the key pair to derive shared secrets.' }
  ]
};

const specsPara = (tipo, uso) => SPECS_KMS.filter((s) => (s.tipo === 'Asymmetric') === (tipo === 'asimetrica') && s.usos.includes(uso) && (tipo === 'asimetrica' || uso !== 'ENCRYPT_DECRYPT' || s.spec === 'SYMMETRIC_DEFAULT'));

function crear(cx) {
  cx.migas([migaBase, { texto: 'Customer managed keys', ruta: 'kms/llaves' }, { texto: 'Create key' }]);
  const f = {
    paso: 0,
    tipo: 'simetrica',
    uso: 'ENCRYPT_DECRYPT',
    spec: 'SYMMETRIC_DEFAULT',
    multiRegion: false,
    alias: '',
    descripcion: '',
    etiquetas: [],
    administradores: [],
    usuarios: [],
    adminsBorran: true,
    errores: {}
  };
  let zona = null;
  const irA = (i) => {
    f.paso = i;
    zona.repintar();
    cx.raiz.querySelector('.cx-principal, main')?.scrollTo?.(0, 0);
  };

  // Las dos tablas de principales se arman una vez: así no pierden la selección entre pasos.
  const tablaPrincipales = (campo, titulo, descripcion) =>
    ui.tabla(cx, {
      titulo,
      variante: 'contenedor',
      descripcion,
      filas: () => principales(cx.estado),
      clave: (p) => p.arn,
      seleccion: 'multiple',
      seleccionados: f[campo],
      alSeleccionar: (ids) => (f[campo] = ids),
      filtro: 'Search users and roles',
      columnas: [
        { titulo: 'Name', valor: (p) => p.nombre },
        { titulo: 'Path', valor: () => '/' },
        { titulo: 'Type', valor: (p) => p.tipo }
      ],
      vacio: { titulo: 'No users or roles', texto: 'Create IAM users or roles first (IAM → Users / Roles).', accion: () => ui.boton('Go to IAM', { alClic: () => cx.ir('iam') }) }
    });
  const tablaAdmins = tablaPrincipales('administradores', 'Key administrators', 'Choose the IAM users and roles who can administer this key through the KMS API.');
  const tablaUsuarios = tablaPrincipales('usuarios', 'This account', 'Choose the IAM users and roles who can use this key in cryptographic operations.');

  function revisar(paso) {
    f.errores = {};
    if (paso === 1) {
      const a = f.alias.trim().replace(/^alias\//, '');
      if (!a) f.errores.alias = 'Alias is required.';
      else if (/^aws\//i.test(a)) f.errores.alias = 'Alias names cannot begin with aws/. That prefix is reserved for AWS managed keys.';
      else if (!/^[A-Za-z0-9/_-]+$/.test(a)) f.errores.alias = 'The alias can contain only alphanumeric characters, forward slashes (/), underscores (_), and dashes (-).';
    }
    return !Object.values(f.errores).some(Boolean);
  }
  const siguiente = () => (revisar(f.paso) ? irA(f.paso + 1) : zona.repintar());

  function pie() {
    return h(
      'div',
      { class: 'cx-pie-form' },
      ui.boton('Cancel', { variante: 'texto', alClic: () => cx.ir('kms/llaves') }),
      f.paso > 0 ? ui.boton('Previous', { alClic: () => irA(f.paso - 1) }) : null,
      f.paso < 4 ? ui.boton('Next', { variante: 'primario', escribe: false, alClic: siguiente }) : ui.boton('Finish', { variante: 'primario', alClic: terminar })
    );
  }

  function paso1() {
    const specs = specsPara(f.tipo, f.uso);
    return ui.contenedor({
      titulo: 'Key configuration',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({
          etiqueta: 'Key type',
          info: 'kms-tipo',
          cx,
          control: ui.tarjetas({
            valor: f.tipo,
            columnas: 2,
            opciones: [
              { valor: 'simetrica', etiqueta: 'Symmetric', descripcion: 'A single key used for encrypting and decrypting data or generating and verifying HMAC codes.' },
              { valor: 'asimetrica', etiqueta: 'Asymmetric', descripcion: 'A public and private key pair used for encrypting and decrypting data, signing and verifying messages, or deriving shared secrets.' }
            ],
            alCambiar: (v) => {
              f.tipo = v;
              f.uso = 'ENCRYPT_DECRYPT';
              f.spec = specsPara(v, f.uso)[0].spec;
              zona.repintar();
            }
          })
        }),
        ui.campo({
          etiqueta: 'Key usage',
          control: ui.radios({
            valor: f.uso,
            opciones: USOS[f.tipo],
            alCambiar: (v) => {
              f.uso = v;
              f.spec = specsPara(f.tipo, v)[0].spec;
              zona.repintar();
            }
          })
        }),
        f.tipo === 'asimetrica' || f.uso === 'GENERATE_VERIFY_MAC'
          ? ui.campo({ etiqueta: 'Key spec', control: ui.radios({ valor: f.spec, opciones: specs.map((s) => ({ valor: s.spec, etiqueta: s.spec })), alCambiar: (v) => (f.spec = v) }) })
          : null,
        ui.expandible({
          titulo: 'Advanced options',
          contenido: h(
            'div',
            { class: 'cx-form' },
            ui.campo({
              etiqueta: 'Key material origin',
              control: ui.radios({
                valor: 'kms',
                opciones: [
                  { valor: 'kms', etiqueta: 'KMS - recommended' },
                  { valor: 'externa', etiqueta: 'External (Import key material)', desactivado: true },
                  { valor: 'hsm', etiqueta: 'AWS CloudHSM key store', desactivado: true },
                  { valor: 'xks', etiqueta: 'External key store', desactivado: true }
                ]
              })
            }),
            ui.campo({
              etiqueta: 'Regionality',
              control: ui.radios({
                valor: f.multiRegion ? 'multi' : 'single',
                opciones: [
                  { valor: 'single', etiqueta: 'Single-Region key', descripcion: 'Never allow this key to be shared to multiple Regions.' },
                  { valor: 'multi', etiqueta: 'Multi-Region key', descripcion: 'Allow this key to be replicated into other Regions.' }
                ],
                alCambiar: (v) => (f.multiRegion = v === 'multi')
              })
            })
          )
        })
      )
    });
  }

  function paso2() {
    return [
      ui.contenedor({
        titulo: 'Alias',
        info: 'kms-alias',
        cx,
        descripcion: 'You can change the alias at any time.',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.campo({ etiqueta: 'Alias', control: ui.entrada({ valor: f.alias, placeholder: 'Enter alias', alCambiar: (v) => (f.alias = v) }), error: f.errores.alias, restriccion: 'Alias names must be between 1 and 256 characters. They can contain alphanumeric characters, forward slashes (/), underscores (_) and dashes (-). Alias names can’t begin with aws/.' }),
          ui.campo({ etiqueta: 'Description', opcional: true, control: ui.area({ valor: f.descripcion, filas: 3, placeholder: 'Description of the key', alCambiar: (v) => (f.descripcion = v) }) })
        )
      }),
      ui.contenedor({ titulo: 'Tags', descripcion: 'You can use tags to categorize and identify your KMS keys and help you track your AWS costs.', plegable: true, abierto: f.etiquetas.length > 0, cuerpo: ui.editorEtiquetas({ filas: f.etiquetas }) })
    ];
  }

  function paso3() {
    return [
      tablaAdmins,
      ui.contenedor({
        titulo: 'Key deletion',
        cuerpo: ui.casilla({ etiqueta: 'Allow key administrators to delete this key.', marcada: f.adminsBorran, alCambiar: (v) => (f.adminsBorran = v) })
      })
    ];
  }

  function paso4() {
    return [
      tablaUsuarios,
      ui.contenedor({
        titulo: 'Other AWS accounts',
        descripcion: 'Specify the AWS accounts that can use this key. Administrators of the accounts you specify are responsible for managing the permissions that allow their IAM users and roles to use this key.',
        cuerpo: ui.boton('Add another AWS account', { desactivado: true })
      })
    ];
  }

  function paso5() {
    const editar = (i) => ui.boton('Edit', { alClic: () => irA(i) });
    const borrador = { spec: f.spec, uso: f.uso, administradores: f.administradores, usuarios: f.usuarios, adminsBorran: f.adminsBorran };
    const lista = (arns) => (arns.length ? h('div', {}, arns.map((a) => h('div', {}, `${nombreDeArn(a)} (${tipoDeArn(a)})`))) : '–');
    return [
      ui.contenedor({
        titulo: 'Key configuration',
        acciones: editar(0),
        cuerpo: ui.pares(
          [
            { etiqueta: 'Key type', valor: f.tipo === 'asimetrica' ? 'Asymmetric' : 'Symmetric' },
            { etiqueta: 'Key spec', valor: f.spec },
            { etiqueta: 'Key usage', valor: TEXTO_USO[f.uso] },
            { etiqueta: 'Origin', valor: 'AWS KMS' },
            { etiqueta: 'Regionality', valor: f.multiRegion ? 'Multi-Region' : 'Single-Region' }
          ],
          { columnas: 3 }
        )
      }),
      ui.contenedor({
        titulo: 'Alias and description',
        acciones: editar(1),
        cuerpo: ui.pares([{ etiqueta: 'Alias', valor: f.alias.trim() }, { etiqueta: 'Description', valor: f.descripcion || '–' }], { columnas: 2 })
      }),
      ui.contenedor({
        titulo: 'Key administrators and users',
        acciones: editar(2),
        cuerpo: ui.pares([{ etiqueta: 'Key administrators', valor: lista(f.administradores) }, { etiqueta: 'Key users', valor: lista(f.usuarios) }, { etiqueta: 'Key deletion', valor: f.adminsBorran ? 'Key administrators can delete this key' : 'Key administrators can’t delete this key' }], { columnas: 3 })
      }),
      ui.contenedor({ titulo: 'Key policy', info: 'kms-politica', cx, descripcion: 'This is the key policy that KMS will attach to the key.', cuerpo: h('div', { class: 'cx-log cx-kms-politica' }, politicaLlaveKms(cx.estado, borrador)) })
    ];
  }

  function terminar() {
    const r = cx.hacer(
      { servicio: 'KMS', accion: 'CreateKey', error: 'Failed to create the key' },
      (e) =>
        crearLlaveKms(e, {
          alias: f.alias.trim(),
          descripcion: f.descripcion,
          tipo: f.tipo,
          uso: f.uso,
          spec: f.spec,
          multiRegion: f.multiRegion,
          administradores: f.administradores,
          usuarios: f.usuarios,
          adminsBorran: f.adminsBorran,
          etiquetas: f.etiquetas
        }),
      { atomico: true }
    );
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: `Success. Your AWS KMS key was created with alias ${r.valor.alias} and key ID ${r.valor.id}.`, accion: { texto: 'View key', alClic: () => cx.ir(rutaLlave(r.valor)) } });
      cx.ir('kms/llaves');
    }
  }

  zona = ui.region(() => marco(cx, f, { cuerpo: [paso1, paso2, paso3, paso4, paso5][f.paso](), pie: pie(), irA }));
  return zona;
}

/* ============================================================ detalle */

function detalle(cx, { id }) {
  const k0 = llaveKmsDe(cx.estado, id);
  const deAws = Boolean(k0?.administradaPorAws);
  cx.migas([migaBase, deAws ? { texto: 'AWS managed keys', ruta: 'kms/aws' } : { texto: 'Customer managed keys', ruta: 'kms/llaves' }, { texto: id }]);
  if (!k0) return noExiste(cx, 'Key', id, 'kms/llaves');
  const st = { pestana: deAws ? 'politica' : 'politica', vistaPolitica: deAws ? 'json' : 'tabla' };
  return cx.vivo(() => {
    const k = llaveKmsDe(cx.estado, id);
    if (!k) return noExiste(cx, 'Key', id, deAws ? 'kms/aws' : 'kms/llaves');
    const pendiente = k.estado === 'PendingDeletion';
    const simetricaCifrado = k.spec === 'SYMMETRIC_DEFAULT';
    const pestanas = [
      { id: 'politica', texto: 'Key policy', contenido: () => pestanaPolitica(cx, k, st) },
      { id: 'cripto', texto: 'Cryptographic configuration', contenido: () => pestanaCripto(k) },
      { id: 'etiquetas', texto: 'Tags', contenido: () => pestanaEtiquetas(cx, k) },
      { id: 'rotacion', texto: 'Key rotation', desactivada: !simetricaCifrado, contenido: () => pestanaRotacion(cx, k) },
      { id: 'aliases', texto: 'Aliases', contenido: () => pestanaAliases(cx, k) }
    ];
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({
        titulo: k.alias ?? k.id,
        info: deAws ? 'kms-aws' : 'kms',
        cx,
        acciones: deAws ? [ui.botonRefrescar(() => cx.refrescar())] : [ui.botonRefrescar(() => cx.refrescar()), ui.menuBoton('Key actions', () => menuAcciones(cx, k))]
      }),
      pendiente
        ? ui.alerta({
            tipo: 'aviso',
            titulo: `This KMS key is pending deletion. It will be deleted on ${ui.fechaLarga(k.borrado?.fecha)}.`,
            contenido: 'While a key is pending deletion, nobody can use it in cryptographic operations. Anything encrypted with it (secrets, objects, volumes) can’t be decrypted after it is deleted.',
            accion: ui.boton('Cancel key deletion', { escribe: true, alClic: () => cancelarBorrado(cx, k) })
          })
        : null,
      deAws ? ui.alerta({ tipo: 'info', contenido: 'Es una llave administrada por AWS: la usa un servicio (S3, EBS, RDS…) por ti. Puedes verla, pero no cambiarla, deshabilitarla ni borrarla. AWS la rota sola cada año.' }) : null,
      ui.contenedor({
        titulo: 'General configuration',
        acciones: deAws ? null : ui.boton('Edit', { escribe: true, desactivado: pendiente, alClic: () => editarDescripcion(cx, k) }),
        cuerpo: ui.pares(
          [
            { etiqueta: 'Alias', valor: k.alias ?? '–' },
            { etiqueta: 'Status', valor: estadoLlave(k) },
            { etiqueta: 'Creation date', valor: ui.fechaLarga(k.creado) },
            { etiqueta: 'ARN', valor: ui.copiable(k.arn) },
            { etiqueta: 'Description', valor: k.descripcion || '–' },
            { etiqueta: 'Regionality', valor: k.multiRegion ? 'Multi-Region' : 'Single-Region' }
          ],
          { columnas: 3 }
        )
      }),
      ui.pestanas({ activa: st.pestana, alCambiar: (p) => (st.pestana = p), pestanas })
    );
  });
}

function pestanaPolitica(cx, k, st) {
  if (k.administradaPorAws || st.vistaPolitica === 'json') {
    return ui.contenedor({
      titulo: 'Key policy',
      info: 'kms-politica',
      cx,
      acciones: k.administradaPorAws ? null : ui.boton('Switch to default view', { alClic: () => ((st.vistaPolitica = 'tabla'), cx.refrescar()) }),
      cuerpo: h('div', { class: 'cx-log cx-kms-politica' }, politicaLlaveKms(cx.estado, k))
    });
  }
  const pendiente = k.estado === 'PendingDeletion';
  const tablaDe = (campo, titulo) =>
    ui.tabla(cx, {
      titulo,
      variante: 'contenedor',
      filas: () => (llaveKmsDe(cx.estado, k.id)?.[campo] ?? []).map((arn) => ({ arn })),
      clave: (p) => p.arn,
      seleccion: 'multiple',
      filtro: false,
      columnas: [
        { titulo: 'Name', valor: (p) => nombreDeArn(p.arn) },
        { titulo: 'Path', valor: () => '/' },
        { titulo: 'Type', valor: (p) => tipoDeArn(p.arn) }
      ],
      acciones: (sel) => [
        ui.boton('Remove', { escribe: true, desactivado: !sel.length || pendiente, alClic: () => quitarPrincipales(cx, k, campo, sel.map((p) => p.arn)) }),
        ui.boton('Add', { escribe: true, desactivado: pendiente, alClic: () => agregarPrincipales(cx, k, campo, titulo) })
      ],
      vacio: { titulo: campo === 'administradores' ? 'No key administrators' : 'No key users', texto: 'Only the account root (and IAM policies) can manage this key.' }
    });
  return h(
    'div',
    { class: 'cx-pagina' },
    h('div', { style: { display: 'flex', justifyContent: 'flex-end' } }, ui.boton('Switch to policy view', { alClic: () => ((st.vistaPolitica = 'json'), cx.refrescar()) })),
    tablaDe('administradores', 'Key administrators'),
    ui.contenedor({
      titulo: 'Key deletion',
      cuerpo: ui.casilla({
        etiqueta: 'Allow key administrators to delete this key.',
        marcada: k.adminsBorran,
        desactivado: pendiente || cx.soloLectura,
        alCambiar: (v) => cx.hacer({ servicio: 'KMS', accion: 'PutKeyPolicy', error: 'Failed to update the key policy' }, (e) => permisosLlaveKms(e, k.id, { adminsBorran: v }))
      })
    }),
    tablaDe('usuarios', 'Key users'),
    ui.contenedor({ titulo: 'Other AWS accounts', cuerpo: ui.boton('Add other AWS accounts', { desactivado: true }) })
  );
}

function agregarPrincipales(cx, k, campo, titulo) {
  const ya = new Set(k[campo]);
  let elegidos = [];
  const t = ui.tabla(cx, {
    titulo: 'IAM users and roles',
    variante: 'simple',
    filas: () => principales(cx.estado).filter((p) => !ya.has(p.arn)),
    clave: (p) => p.arn,
    seleccion: 'multiple',
    alSeleccionar: (ids) => (elegidos = ids),
    filtro: 'Search users and roles',
    columnas: [
      { titulo: 'Name', valor: (p) => p.nombre },
      { titulo: 'Type', valor: (p) => p.tipo }
    ],
    vacio: { titulo: 'No users or roles', texto: 'All the IAM users and roles of the account are already listed, or there are none (create them in IAM).' }
  });
  const m = cx.modal({
    titulo: `Add ${titulo.toLowerCase()}`,
    ancho: 'grande',
    contenido: t,
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Add', {
        variante: 'primario',
        alClic: () => {
          if (!elegidos.length) return m.cerrar();
          const r = cx.hacer({ servicio: 'KMS', accion: 'PutKeyPolicy', error: 'Failed to update the key policy' }, (e) => permisosLlaveKms(e, k.id, { [campo]: [...k[campo], ...elegidos] }));
          if (r.ok) m.cerrar();
        }
      })
    ]
  });
}

function quitarPrincipales(cx, k, campo, arns) {
  cx.hacer({ servicio: 'KMS', accion: 'PutKeyPolicy', error: 'Failed to update the key policy' }, (e) => permisosLlaveKms(e, k.id, { [campo]: k[campo].filter((a) => !arns.includes(a)) }));
}

function pestanaCripto(k) {
  const s = specKms(k.spec);
  return ui.contenedor({
    titulo: 'Cryptographic configuration',
    cuerpo: ui.pares(
      [
        { etiqueta: 'Key type', valor: tipoLlave(k) },
        { etiqueta: 'Origin', valor: 'AWS KMS' },
        { etiqueta: 'Key spec', valor: k.spec },
        { etiqueta: 'Key usage', valor: TEXTO_USO[k.uso] ?? k.uso },
        s?.algoritmos && k.uso === 'ENCRYPT_DECRYPT' ? { etiqueta: 'Encryption algorithms', valor: s.algoritmos.join(', ') } : null,
        s?.firmas && k.uso === 'SIGN_VERIFY' ? { etiqueta: 'Signing algorithms', valor: s.firmas.join(', ') } : null,
        k.uso === 'GENERATE_VERIFY_MAC' ? { etiqueta: 'MAC algorithms', valor: s?.algoritmos?.join(', ') } : null
      ],
      { columnas: 3 }
    )
  });
}

function pestanaEtiquetas(cx, k) {
  return ui.tabla(cx, {
    titulo: 'Tags',
    variante: 'contenedor',
    filas: () => llaveKmsDe(cx.estado, k.id)?.etiquetas ?? [],
    clave: (t) => t.llave,
    seleccion: null,
    filtro: false,
    columnas: [
      { titulo: 'Tag key', valor: (t) => t.llave },
      { titulo: 'Tag value', valor: (t) => t.valor || '–' }
    ],
    acciones: () => (k.administradaPorAws ? [] : [ui.boton('Edit', { escribe: true, desactivado: k.estado === 'PendingDeletion', alClic: () => editarEtiquetas(cx, k) })]),
    vacio: { titulo: 'No tags', texto: 'This key has no tags.' }
  });
}

function pestanaRotacion(cx, k) {
  const r = k.rotacion ?? {};
  const deAws = k.administradaPorAws;
  const hechas = (k.rotaciones ?? []).filter((x) => x.tipo === 'ON_DEMAND').length;
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.contenedor({
      titulo: 'Automatic key rotation',
      info: 'kms-rotacion',
      cx,
      acciones: deAws ? null : ui.boton('Edit', { escribe: true, desactivado: k.estado !== 'Enabled', alClic: () => editarRotacion(cx, k) }),
      cuerpo: ui.pares(
        [
          { etiqueta: 'Status', valor: r.activa ? ui.estado('exito', 'Enabled') : ui.estado('inactivo', 'Disabled') },
          { etiqueta: 'Rotation period', valor: r.activa ? `${r.dias} days` : '–' },
          { etiqueta: 'Next rotation date', valor: r.activa && r.siguiente ? ui.fechaLarga(r.siguiente) : '–' }
        ],
        { columnas: 3 }
      )
    }),
    deAws
      ? null
      : ui.contenedor({
          titulo: 'On-demand key rotation',
          descripcion: `Rotate the key material now. You can perform on-demand rotation up to 10 times per key (${hechas} of 10 used).`,
          acciones: ui.boton('Rotate now', { escribe: true, desactivado: k.estado !== 'Enabled' || hechas >= 10, alClic: () => rotarAhora(cx, k) }),
          cuerpo: null
        }),
    ui.tabla(cx, {
      titulo: 'Key rotations',
      variante: 'contenedor',
      filas: () => [...(llaveKmsDe(cx.estado, k.id)?.rotaciones ?? [])].reverse(),
      clave: (x) => `${x.t}-${x.tipo}`,
      seleccion: null,
      filtro: false,
      columnas: [
        { titulo: 'Date', valor: (x) => ui.fechaLarga(x.t) },
        { titulo: 'Rotation type', valor: (x) => (x.tipo === 'ON_DEMAND' ? 'On-demand' : 'Automatic') }
      ],
      vacio: { titulo: 'No rotations', texto: 'This key hasn’t been rotated yet.' }
    })
  );
}

function pestanaAliases(cx, k) {
  return ui.tabla(cx, {
    titulo: 'Aliases',
    variante: 'contenedor',
    info: 'kms-alias',
    filas: () => (llaveKmsDe(cx.estado, k.id)?.aliases ?? []).map((a) => ({ a })),
    clave: (x) => x.a,
    seleccion: k.administradaPorAws ? null : 'unica',
    filtro: false,
    columnas: [
      { titulo: 'Alias name', valor: (x) => x.a },
      { titulo: 'Alias ARN', valor: (x) => ui.copiable(`arn:aws:kms:us-east-1:${cx.estado.cuenta?.id ?? ''}:alias/${x.a}`) }
    ],
    acciones: (sel) =>
      k.administradaPorAws
        ? []
        : [
            ui.boton('Delete', { escribe: true, desactivado: !sel.length, alClic: () => borrarAlias(cx, sel[0].a) }),
            ui.boton('Create alias', { escribe: true, desactivado: k.estado === 'PendingDeletion', alClic: () => crearAlias(cx, k) })
          ],
    vacio: { titulo: 'No aliases', texto: 'This key has no aliases. Add one so it’s easier to find.' }
  });
}

/* ============================================================ acciones y modales */

function cambiarEstado(cx, k, habilitar) {
  const r = cx.hacer({ servicio: 'KMS', accion: habilitar ? 'EnableKey' : 'DisableKey', error: `Failed to ${habilitar ? 'enable' : 'disable'} the key` }, (e) => (habilitar ? habilitarLlaveKms(e, k.id) : deshabilitarLlaveKms(e, k.id)));
  if (r.ok) cx.flash({ tipo: 'exito', texto: `The key ${k.alias ?? k.id} was ${habilitar ? 'enabled' : 'disabled'}.` });
}

function deshabilitar(cx, k) {
  let ok = false;
  const b = ui.boton('Disable key', {
    variante: 'primario',
    desactivado: true,
    alClic: () => {
      m.cerrar();
      cambiarEstado(cx, k, false);
    }
  });
  const m = cx.modal({
    titulo: 'Disable key',
    contenido: [
      ui.alerta({ tipo: 'aviso', contenido: 'While the key is disabled, nobody can use it to encrypt or decrypt. Secrets, objects and volumes encrypted with this key become unreadable until you enable it again.' }),
      h('div', { style: { marginTop: '12px' } }, ui.casilla({ etiqueta: 'Confirm that you want to disable this key.', alCambiar: (v) => ((ok = v), (b.disabled = !ok)) }))
    ],
    pie: [ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }), b]
  });
}

function programarBorrado(cx, k) {
  const f = { dias: '30', confirmado: false, error: null };
  let boton = null;
  const cuerpo = ui.region(() => [
    ui.alerta({ tipo: 'aviso', titulo: 'Deleting a KMS key is destructive and potentially dangerous.', contenido: 'After the waiting period ends, KMS deletes the key and you can’t decrypt any data encrypted with it. If you’re not sure, disable the key instead.' }),
    ui.campo({
      etiqueta: 'Waiting period (in days)',
      descripcion: 'Enter a waiting period between 7 and 30 days.',
      control: ui.entrada({ tipo: 'number', valor: f.dias, min: 7, max: 30, alCambiar: (v) => (f.dias = v) }),
      error: f.error
    }),
    ui.casilla({
      etiqueta: 'Confirm that you want to schedule this key to be deleted after the waiting period.',
      marcada: f.confirmado,
      alCambiar: (v) => {
        f.confirmado = v;
        if (boton) boton.disabled = !v;
      }
    })
  ]);
  const m = cx.modal({
    titulo: 'Schedule key deletion',
    contenido: cuerpo,
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      (boton = ui.boton('Schedule deletion', {
        variante: 'primario',
        desactivado: true,
        alClic: () => {
          const n = Number(f.dias);
          if (!Number.isInteger(n) || n < 7 || n > 30) {
            f.error = 'The waiting period must be between 7 and 30 days.';
            cuerpo.repintar();
            return;
          }
          const r = cx.hacer({ servicio: 'KMS', accion: 'ScheduleKeyDeletion', error: 'Failed to schedule key deletion' }, (e) => programarBorradoLlaveKms(e, k.id, n));
          if (r.ok) {
            m.cerrar();
            cx.flash({ tipo: 'exito', texto: `The key ${k.alias ?? k.id} is scheduled for deletion on ${ui.fechaLarga(r.valor.borrado.fecha)}.` });
          }
        }
      }))
    ]
  });
}

function cancelarBorrado(cx, k) {
  const r = cx.hacer({ servicio: 'KMS', accion: 'CancelKeyDeletion', error: 'Failed to cancel key deletion' }, (e) => cancelarBorradoLlaveKms(e, k.id));
  if (r.ok) cx.flash({ tipo: 'exito', texto: `Key deletion was canceled. The key ${k.alias ?? k.id} is now disabled; enable it to use it again.` });
}

function editarDescripcion(cx, k) {
  const f = { descripcion: k.descripcion ?? '' };
  const m = cx.modal({
    titulo: 'Edit description',
    contenido: ui.campo({ etiqueta: 'Description', control: ui.area({ valor: f.descripcion, filas: 3, alCambiar: (v) => (f.descripcion = v) }) }),
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Save changes', {
        variante: 'primario',
        alClic: () => {
          const r = cx.hacer({ servicio: 'KMS', accion: 'UpdateKeyDescription', error: 'Failed to update the description' }, (e) => editarLlaveKms(e, k.id, { descripcion: f.descripcion }));
          if (r.ok) m.cerrar();
        }
      })
    ]
  });
}

function editarEtiquetas(cx, k) {
  const filas = k.etiquetas.map((t) => ({ ...t }));
  const m = cx.modal({
    titulo: 'Edit tags',
    ancho: 'grande',
    contenido: ui.editorEtiquetas({ filas }),
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Save changes', {
        variante: 'primario',
        alClic: () => {
          const r = cx.hacer({ servicio: 'KMS', accion: 'TagResource', error: 'Failed to save tags' }, (e) => etiquetasLlaveKms(e, k.id, filas));
          if (r.ok) m.cerrar();
        }
      })
    ]
  });
}

function editarRotacion(cx, k) {
  const f = { activa: k.rotacion?.activa ?? false, dias: String(k.rotacion?.dias ?? 365), error: null };
  const cuerpo = ui.region(() =>
    h(
      'div',
      { class: 'cx-form' },
      ui.casilla({ etiqueta: 'Enable automatic key rotation', descripcion: 'KMS generates new key material on the schedule. Old key material is kept so data encrypted before still decrypts.', marcada: f.activa, alCambiar: (v) => ((f.activa = v), cuerpo.repintar()) }),
      f.activa
        ? ui.campo({ etiqueta: 'Rotation period (in days)', control: ui.entrada({ tipo: 'number', valor: f.dias, min: 90, max: 2560, alCambiar: (v) => (f.dias = v) }), restriccion: 'Enter a number between 90 and 2560. The default is 365 days.', error: f.error })
        : null
    )
  );
  const m = cx.modal({
    titulo: 'Edit automatic key rotation',
    contenido: cuerpo,
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Save', {
        variante: 'primario',
        alClic: () => {
          const r = cx.hacer({ servicio: 'KMS', accion: f.activa ? 'EnableKeyRotation' : 'DisableKeyRotation', error: 'Failed to update key rotation' }, (e) => rotacionLlaveKms(e, k.id, { activa: f.activa, dias: Number(f.dias) }));
          if (r.ok) m.cerrar();
        }
      })
    ]
  });
}

function rotarAhora(cx, k) {
  cx.confirmar({
    titulo: 'Rotate key now',
    textoBoton: 'Rotate key',
    contenido: h('p', {}, 'KMS generates new key material for this key right away. New data is encrypted with the new material; data encrypted before still decrypts. You can do this up to 10 times per key.'),
    aceptar: () => {
      const r = cx.hacer({ servicio: 'KMS', accion: 'RotateKeyOnDemand', error: 'Failed to rotate the key' }, (e) => rotarLlaveKmsAhora(e, k.id));
      if (r.ok) cx.flash({ tipo: 'exito', texto: `Key rotation for ${k.alias ?? k.id} is in progress.` });
      return r.ok;
    }
  });
}

function crearAlias(cx, k) {
  const f = { alias: '' };
  const m = cx.modal({
    titulo: 'Create alias',
    contenido: ui.campo({ etiqueta: 'Alias name', descripcion: 'alias/', control: ui.entrada({ valor: '', placeholder: 'Enter alias name', alCambiar: (v) => (f.alias = v) }) }),
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Create alias', {
        variante: 'primario',
        alClic: () => {
          const r = cx.hacer({ servicio: 'KMS', accion: 'CreateAlias', error: 'Failed to create the alias' }, (e) => crearAliasKms(e, k.id, f.alias));
          if (r.ok) m.cerrar();
        }
      })
    ]
  });
}

function borrarAlias(cx, alias) {
  cx.confirmar({
    titulo: 'Delete alias',
    textoBoton: 'Delete',
    contenido: h('p', {}, `Delete the alias alias/${alias}? Applications that refer to the key by this alias will stop working.`),
    aceptar: () => cx.hacer({ servicio: 'KMS', accion: 'DeleteAlias', error: 'Failed to delete the alias' }, (e) => eliminarAliasKms(e, alias)).ok
  });
}

/* ================================================================ ayudas */

const ayudas = {
  kms: {
    titulo: 'AWS KMS',
    texto: [
      '**KMS** (Key Management Service) guarda y administra las **llaves de cifrado** de tu cuenta. Tú nunca ves la llave: le pides a KMS que cifre o descifre por ti.',
      'Una **customer managed key** la creas tú: decides quién la administra, quién la usa, si rota y cuándo se borra. Cuesta 1 USD al mes.',
      ['S3, EBS, RDS, Secrets Manager y EFS cifran con KMS.', 'Cada uso de la llave queda en **CloudTrail**: sabes quién descifró qué.'],
      'Para el examen: KMS es **multi-inquilino y administrado**; si necesitas un HSM dedicado solo para ti, eso es **CloudHSM**.'
    ]
  },
  'kms-aws': {
    titulo: 'AWS managed keys',
    texto: ['AWS crea estas llaves (`aws/s3`, `aws/ebs`, `aws/rds`…) la primera vez que un servicio cifra algo en tu cuenta.', 'Son gratis, rotan solas cada año y **no puedes** cambiar sus permisos ni borrarlas.']
  },
  'kms-tipo': {
    titulo: 'Simétrica o asimétrica',
    texto: [
      '**Symmetric**: una sola llave cifra y descifra. Es la que usan S3, EBS, RDS y Secrets Manager. Casi siempre eliges esta.',
      '**Asymmetric**: un par de llaves (pública y privada). Sirve para **firmar** documentos o para que alguien fuera de AWS cifre con la pública.'
    ]
  },
  'kms-alias': {
    titulo: 'Alias',
    texto: ['El **alias** es un nombre fácil para la llave (`alias/clinica-expedientes`) en lugar de su id larguísimo.', 'No puede empezar con `aws/`: ese prefijo es de las llaves de AWS.']
  },
  'kms-politica': {
    titulo: 'Key policy',
    texto: [
      'La **key policy** dice quién puede hacer qué con la llave.',
      ['**Key administrators**: la administran (habilitar, deshabilitar, programar el borrado), pero **no** la usan para cifrar.', '**Key users**: la usan para cifrar y descifrar.'],
      'Separar a quien administra de quien usa es el principio de **mínimo privilegio**.'
    ]
  },
  'kms-rotacion': {
    titulo: 'Rotación de la llave',
    texto: [
      '**Rotar** es generar material criptográfico nuevo. El id, el alias y los permisos no cambian, y lo que cifraste antes **se sigue descifrando**.',
      'Con la rotación automática, KMS lo hace cada año (365 días) o el periodo que elijas (90 a 2560 días).',
      'Solo las llaves **simétricas** de cifrado rotan automáticamente.'
    ]
  }
};

/* ================================================================ registro */

const des = (texto) => ({ texto, desactivado: true });

export default {
  id: 'kms',
  nombre: 'Key Management Service',
  titulo: 'Key Management Service (KMS)',
  descripcion: 'Securely Generate and Manage AWS Encryption Keys',
  categoria: 'seguridad',
  claves: 'kms llaves cifrado encryption key cmk',
  inicio: 'kms/llaves',
  menu: [
    { texto: 'AWS managed keys', ruta: 'kms/aws' },
    { texto: 'Customer managed keys', ruta: 'kms/llaves' },
    { seccion: 'Custom key stores', items: [des('AWS CloudHSM key stores'), des('External key stores')] }
  ],
  rutas: {
    '': listaCliente,
    llaves: listaCliente,
    aws: listaAws,
    crear,
    'llaves/:id': detalle
  },
  busqueda: [
    { texto: 'Customer managed keys', ruta: 'kms/llaves' },
    { texto: 'AWS managed keys', ruta: 'kms/aws' },
    { texto: 'Create key', ruta: 'kms/crear', claves: 'crear llave cifrado' }
  ],
  ayudas
};
