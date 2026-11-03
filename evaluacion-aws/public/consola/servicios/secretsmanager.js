// ---------------------------------------------------------------------------
// AWS SECRETS MANAGER
//
// La consola de Secrets Manager: la lista de secretos, «Store a new secret»
// (asistente de 4 pasos: tipo y valor, nombre, rotación y revisión), el
// detalle con «Retrieve secret value» (aquí SÍ funciona, a diferencia de
// DataCamp), Edit del valor, rotación con Lambda, versiones (AWSCURRENT /
// AWSPREVIOUS), etiquetas y «Delete secret» con ventana de 7 a 30 días.
// El modelo vive en modelo/secretos.js.
// ---------------------------------------------------------------------------

import * as ui from '../ui.js';
import {
  configurarRotacionSecreto,
  crearFuncion,
  crearSecreto,
  editarSecreto,
  editarValorSecreto,
  eliminarSecreto,
  etiquetasSecreto,
  llaveKmsDe,
  MOTORES_OTRA_BASE,
  nombreLlaveKms,
  obtenerValorSecreto,
  paresDeSecreto,
  restaurarSecreto,
  rotarSecretoAhora,
  secretoDe,
  TIPOS_SECRETO
} from '../modelo.js';
import { noExiste } from './comun.js';

const { h } = ui;

const migaBase = { texto: 'Secrets Manager', ruta: 'secretsmanager' };
const rutaSecreto = (s) => `secretsmanager/secretos/${encodeURIComponent(s.nombre)}`;
const secretos = (cx) => cx.estado.secretos?.secretos ?? [];

/** Una región que se repinta a mano con la separación de 20 px entre contenedores. */
const regionPagina = (fn) => ui.region(fn, { clase: 'cx-pagina' });

/** «2026-11-17» como la columna Last retrieved (UTC). */
const diaUtc = (iso) => (iso ? String(iso).slice(0, 10) : '–');

const MESES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** «December 2, 2026, 05:23:05» en UTC, para los campos que dicen (UTC). */
function fechaUtc(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '–';
  const dos = (n) => String(n).padStart(2, '0');
  return `${MESES[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}, ${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}:${dos(d.getUTCSeconds())}`;
}

/* ============================================================ función de rotación */

// Para los secretos de RDS la consola ofrece crear la función de rotación
// (con la plantilla de AWS y el prefijo SecretsManager) o usar una que ya existe.
const PREFIJO_ROTACION = 'SecretsManager';
const conPlantilla = (tipo) => tipo === 'rds';

/** Los campos de «Rotation function». `r` = { funcion: 'crear'|'existente', nombreFuncion, lambda }. */
function camposFuncionRotacion(cx, r, { tipo, errores = {}, repintar }) {
  const funciones = cx.estado.lambda?.funciones ?? [];
  const existente = ui.campo({
    etiqueta: 'Lambda rotation function',
    control: h(
      'div',
      { class: 'cx-fila-campos' },
      h(
        'div',
        { style: { flex: '1 1 260px' } },
        ui.selector({
          opciones: funciones.map((fn) => ({ valor: fn.arn ?? fn.nombre, etiqueta: fn.nombre, descripcion: fn.runtime })),
          valor: r.lambda,
          placeholder: 'Choose a Lambda function',
          vacio: 'No Lambda functions',
          alCambiar: (v) => (r.lambda = v)
        })
      ),
      ui.enlace('Create function', 'lambda', { cx, externo: true })
    ),
    error: errores.lambda
  });
  if (!conPlantilla(tipo)) {
    return [existente, funciones.length ? null : ui.alerta({ tipo: 'info', contenido: 'Para rotar necesitas una función de Lambda. Créala en Lambda (cualquier runtime sirve en el simulador) y regresa aquí.' })];
  }
  return [
    ui.radios({
      valor: r.funcion,
      alCambiar: (v) => ((r.funcion = v), repintar()),
      opciones: [
        { valor: 'crear', etiqueta: 'Create a new Lambda function', descripcion: 'Secrets Manager creates the function from the rotation template for your database and gives its execution role the permissions it needs.' },
        { valor: 'existente', etiqueta: 'Use an existing Lambda function', descripcion: 'Reuse a rotation function that you already have.' }
      ]
    }),
    r.funcion === 'crear'
      ? ui.campo({
          etiqueta: 'Lambda rotation function name',
          descripcion: `Secrets Manager adds ${PREFIJO_ROTACION} to the beginning of the function name.`,
          restriccion: 'Up to 50 characters: letters, numbers, hyphens (-) and underscores (_).',
          control: ui.entrada({ valor: r.nombreFuncion, placeholder: 'my-rotation-function', alCambiar: (v) => (r.nombreFuncion = v) }),
          error: errores.nombreFuncion
        })
      : existente
  ];
}

/** Lo que falta en «Rotation function» (para marcar el campo en rojo). */
function erroresFuncionRotacion(estado, r, tipo) {
  if (conPlantilla(tipo) && r.funcion === 'crear') {
    const n = String(r.nombreFuncion ?? '').trim();
    if (!/^[A-Za-z0-9_-]{1,50}$/.test(n)) return { nombreFuncion: 'Enter a function name of 1 to 50 characters: letters, numbers, hyphens (-) and underscores (_).' };
    if ((estado.lambda?.funciones ?? []).some((fn) => fn.nombre === `${PREFIJO_ROTACION}${n}`)) return { nombreFuncion: `A function named ${PREFIJO_ROTACION}${n} already exists. Choose another name, or choose «Use an existing Lambda function».` };
    return {};
  }
  return r.lambda ? {} : { lambda: 'Choose a Lambda rotation function.' };
}

/** El nombre que se enseña en el resumen. */
const textoFuncionRotacion = (cx, r, tipo) =>
  conPlantilla(tipo) && r.funcion === 'crear' ? `${PREFIJO_ROTACION}${String(r.nombreFuncion ?? '').trim()} (new)` : (cx.estado.lambda?.funciones ?? []).find((x) => (x.arn ?? x.nombre) === r.lambda)?.nombre ?? r.lambda;

/** Dentro de cx.hacer: crea la función de la plantilla si se pidió y devuelve la que rotará el secreto. */
function funcionRotacion(estado, r, tipo) {
  if (!(conPlantilla(tipo) && r.funcion === 'crear')) return r.lambda;
  return crearFuncion(estado, {
    nombre: `${PREFIJO_ROTACION}${String(r.nombreFuncion ?? '').trim()}`,
    runtime: 'python3.13',
    descripcion: 'Rotates a Secrets Manager secret for Amazon RDS credentials using the single user rotation strategy.'
  }).arn;
}

/** Un bloque de código con su botón de copiar. */
export function bloqueCodigo(texto) {
  return h('div', { class: 'cx-codigo' }, h('pre', {}, texto), ui.copiable(texto, { soloIcono: true }));
}

/** Las llaves de KMS que sirven para un secreto: aws/secretsmanager y las simétricas propias habilitadas. */
function opcionesLlave(cx) {
  const propias = (cx.estado.kms?.llaves ?? []).filter((k) => !k.administradaPorAws && k.estado === 'Enabled' && k.spec === 'SYMMETRIC_DEFAULT' && k.uso === 'ENCRYPT_DECRYPT');
  return [
    { valor: 'aws/secretsmanager', etiqueta: 'aws/secretsmanager', etiquetaDerecha: 'AWS managed key' },
    ...propias.map((k) => ({ valor: k.id, etiqueta: k.alias ?? k.id, descripcion: k.id, etiquetaDerecha: 'Customer managed key' }))
  ];
}

const textoLlave = (cx, s) => {
  const k = llaveKmsDe(cx.estado, s.llaveKms);
  return k ? k.alias ?? k.id : nombreLlaveKms(cx.estado, s.llaveKms);
};

/** El campo «Encryption key» con su enlace a KMS. */
function campoLlave(cx, f) {
  return ui.campo({
    etiqueta: 'Encryption key',
    info: 'secreto-llave',
    cx,
    descripcion: 'You can encrypt using the KMS key that Secrets Manager creates or a customer managed KMS key that you create.',
    control: h(
      'div',
      { class: 'cx-fila-campos' },
      h('div', { style: { flex: '1 1 260px' } }, ui.selector({ opciones: opcionesLlave(cx), valor: f.llaveKms, alCambiar: (v) => (f.llaveKms = v) })),
      ui.enlace('Add new key', 'kms/crear', { cx, externo: true })
    )
  });
}

/* ============================================================ lista */

function lista(cx) {
  cx.migas([migaBase, { texto: 'Secrets' }]);
  const st = { borrados: false };
  const t = ui.tabla(cx, {
    titulo: 'Secrets',
    info: 'secreto',
    filas: () => secretos(cx).filter((s) => st.borrados || !s.borradoEn),
    clave: (s) => s.arn,
    seleccion: null,
    filtro: 'Filter secrets by name, description, tag key, tag value, managed by, owning service or primary Region',
    columnas: [
      { titulo: 'Secret name', valor: (s) => ui.enlace(s.nombre, rutaSecreto(s), { cx }), texto: (s) => s.nombre },
      { titulo: 'Description', valor: (s) => s.descripcion || '–' },
      { titulo: 'Last retrieved (UTC)', valor: (s) => diaUtc(s.ultimoAcceso) },
      { titulo: 'Managed by', valor: (s) => (s.administradoPor === 'rds' ? 'Amazon RDS' : '–') },
      { titulo: 'Status', valor: (s) => (s.borradoEn ? ui.estado('aviso', `Scheduled for deletion ${diaUtc(s.borradoEn)}`) : ui.estado('exito', 'Active')) }
    ],
    acciones: () => [
      ui.interruptor({ etiqueta: 'Show secrets scheduled for deletion', marcada: st.borrados, alCambiar: (v) => ((st.borrados = v), cx.refrescar()) }),
      ui.boton('Store a new secret', { variante: 'primario', alClic: () => cx.ir('secretsmanager/crear') })
    ],
    vacio: {
      titulo: 'No secrets',
      texto: 'You don’t have any secrets yet. Store a secret to get started.',
      accion: () => ui.boton('Store a new secret', { escribe: true, alClic: () => cx.ir('secretsmanager/crear') })
    }
  });
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.alerta({
      tipo: 'info',
      titulo: 'Simulador: no guardes contraseñas reales',
      contenido: 'Aquí el valor del secreto se guarda en tu cuenta simulada para que «Retrieve secret value» funcione. Usa datos de práctica, nunca una contraseña de verdad.'
    }),
    t
  );
}

/* ============================================================ crear (asistente) */

const PASOS = ['Choose secret type', 'Configure secret', 'Configure rotation', 'Review'];

function marco(cx, f, { titulo, cuerpo, pie, irA }) {
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
    h('div', { class: 'cx-asis__cuerpo cx-pagina' }, ui.encabezado({ titulo, info: 'secreto', cx }), cuerpo, pie)
  );
}

/** Las bases de RDS que se pueden elegir: instancias (sin réplicas ni miembros de clúster) y clústeres. */
function basesRds(estado) {
  const inst = (estado.rds?.instancias ?? []).filter((i) => !i.clusterId && i.rol !== 'replica' && i.estado !== 'deleting');
  const clus = (estado.rds?.clusteres ?? []).filter((c) => c.estado !== 'deleting');
  return [...inst.map((b) => ({ ...b, esCluster: false })), ...clus.map((b) => ({ ...b, esCluster: true }))];
}

/** El editor de pares Key / Value («Other type of secret»). */
function editorPares(f, alCambiar) {
  const el = ui.region(() => [
    h(
      'div',
      { class: 'cx-sec-pares' },
      h('div', { class: 'cx-sec-pares__cabeza' }, 'Key'),
      h('div', { class: 'cx-sec-pares__cabeza' }, 'Value'),
      h('div'),
      f.pares.map((p, i) => [
        ui.entrada({ valor: p.llave, placeholder: 'Key', etiquetaAccesible: 'Secret key', alCambiar: (v) => ((p.llave = v), alCambiar?.()) }),
        ui.entrada({ valor: p.valor, placeholder: 'Value', etiquetaAccesible: 'Secret value', alCambiar: (v) => ((p.valor = v), alCambiar?.()) }),
        ui.boton('Remove', { desactivado: f.pares.length === 1, alClic: () => (f.pares.splice(i, 1), el.repintar(), alCambiar?.()) })
      ])
    ),
    h('div', { style: { marginTop: '10px' } }, ui.boton('+ Add row', { alClic: () => (f.pares.push({ llave: '', valor: '' }), el.repintar()) }))
  ]);
  return el;
}

/** El valor que se manda al modelo desde pares o texto plano. */
function valorDe(f) {
  if (f.vista === 'texto') return f.texto;
  const o = {};
  for (const p of f.pares) if (p.llave.trim()) o[p.llave.trim()] = p.valor;
  return Object.keys(o).length ? o : '';
}

/** Pasa de pares a texto plano (y de regreso) como la consola. */
function cambiarVista(f, vista) {
  if (vista === f.vista) return;
  if (vista === 'texto') {
    const v = valorDe({ ...f, vista: 'pares' });
    f.texto = v ? JSON.stringify(v) : f.texto;
  } else {
    const pares = paresDeSecreto(f.texto);
    if (pares?.length) f.pares = pares.map((p) => ({ ...p }));
  }
  f.vista = vista;
}

function crear(cx) {
  cx.migas([migaBase, { texto: 'Secrets', ruta: 'secretsmanager/secretos' }, { texto: 'Store a new secret' }]);
  const f = {
    paso: 0,
    tipo: 'rds',
    usuario: '',
    contrasena: '',
    mostrar: false,
    llaveKms: 'aws/secretsmanager',
    baseId: null,
    motor: 'mysql',
    servidor: '',
    nombreBase: '',
    puerto: '3306',
    vista: 'pares',
    pares: [{ llave: '', valor: '' }],
    texto: '',
    nombre: '',
    descripcion: '',
    etiquetas: [],
    rotacion: { activa: false, modo: 'constructor', unidad: 'days', cada: '30', expresion: 'rate(30 days)', inmediata: true, funcion: 'crear', nombreFuncion: '', lambda: null },
    errores: {}
  };
  let zona = null;
  // La tabla de bases se arma una sola vez (así no se pierde la selección al repintar el paso).
  let tablaDeBases = null;
  const tablaBases = () =>
    (tablaDeBases ??= ui.tabla(cx, {
      titulo: 'Database',
      variante: 'contenedor',
      descripcion: 'Choose the RDS database that this secret will access.',
      filas: () => basesRds(cx.estado),
      clave: (b) => b.id,
      seleccion: 'unica',
      alSeleccionar: (ids) => (f.baseId = ids[0] ?? null),
      filtro: 'Filter databases',
      columnas: [
        { titulo: 'DB identifier', valor: (b) => b.id },
        { titulo: 'Engine', valor: (b) => b.motor },
        { titulo: 'Role', valor: (b) => (b.esCluster ? 'Regional cluster' : b.rol === 'primary' ? 'Primary' : 'Instance') },
        { titulo: 'Status', valor: (b) => b.estado }
      ],
      vacio: {
        titulo: 'No databases',
        texto: 'You don’t have any RDS databases in this Region.',
        accion: () => ui.boton('Create database', { alClic: () => cx.ir('rds/bases/crear') })
      }
    }));

  const irA = (i) => {
    f.paso = i;
    zona.repintar();
    cx.raiz.querySelector('.cx-principal, main')?.scrollTo?.(0, 0);
  };

  function revisar(paso) {
    f.errores = {};
    if (paso === 0) {
      if (f.tipo === 'rds' || f.tipo === 'otra-base') {
        if (!f.usuario.trim()) f.errores.usuario = 'User name is required.';
        if (!f.contrasena) f.errores.contrasena = 'Password is required.';
      }
      if (f.tipo === 'rds' && !f.baseId) f.errores.base = 'Choose the database that this secret will access.';
      if (f.tipo === 'otra-base' && !f.servidor.trim()) f.errores.servidor = 'Server address is required.';
      if (f.tipo === 'otro' && !valorDe(f)) f.errores.valor = f.vista === 'texto' ? 'Enter the secret value.' : 'Enter at least one key/value pair.';
    }
    if (paso === 1) {
      if (!f.nombre.trim()) f.errores.nombre = 'Secret name is required.';
      else if (!/^[A-Za-z0-9/_+=.@-]{1,512}$/.test(f.nombre.trim())) f.errores.nombre = 'Secret name must contain only alphanumeric characters and the characters /_+=.@-';
    }
    if (paso === 2 && f.rotacion.activa) {
      Object.assign(f.errores, erroresFuncionRotacion(cx.estado, f.rotacion, f.tipo));
      if (f.rotacion.modo === 'constructor' && !/^\d+$/.test(String(f.rotacion.cada).trim())) f.errores.cada = 'Enter a whole number.';
    }
    return !Object.values(f.errores).some(Boolean);
  }

  const siguiente = () => (revisar(f.paso) ? irA(f.paso + 1) : zona.repintar());

  function pie() {
    return h(
      'div',
      { class: 'cx-pie-form' },
      ui.boton('Cancel', { variante: 'texto', alClic: () => cx.ir('secretsmanager/secretos') }),
      f.paso > 0 ? ui.boton('Previous', { alClic: () => irA(f.paso - 1) }) : null,
      f.paso < 3 ? ui.boton('Next', { variante: 'primario', escribe: false, alClic: siguiente }) : ui.boton('Store', { variante: 'primario', alClic: guardar })
    );
  }

  /* ---------- paso 1 */
  function paso1() {
    const credenciales = f.tipo === 'rds' || f.tipo === 'otra-base';
    const partes = [
      ui.contenedor({
        titulo: 'Secret type',
        info: 'secreto-tipo',
        cx,
        cuerpo: ui.tarjetas({
          valor: f.tipo,
          columnas: 3,
          opciones: TIPOS_SECRETO.map((t) => ({ valor: t.tipo, etiqueta: t.nombre, descripcion: t.descripcion, desactivado: t.desactivado })),
          alCambiar: (v) => ((f.tipo = v), (f.errores = {}), zona.repintar())
        })
      })
    ];
    if (credenciales) {
      partes.push(
        ui.contenedor({
          titulo: 'Credentials',
          cuerpo: h(
            'div',
            { class: 'cx-form' },
            ui.campo({ etiqueta: 'User name', control: ui.entrada({ valor: f.usuario, placeholder: 'admin', alCambiar: (v) => (f.usuario = v) }), error: f.errores.usuario }),
            ui.campo({
              etiqueta: 'Password',
              control: ui.entrada({ tipo: f.mostrar ? 'text' : 'password', valor: f.contrasena, alCambiar: (v) => (f.contrasena = v) }),
              error: f.errores.contrasena
            }),
            ui.casilla({ etiqueta: 'Show password', marcada: f.mostrar, alCambiar: (v) => ((f.mostrar = v), zona.repintar()) })
          )
        })
      );
    } else {
      partes.push(
        ui.contenedor({
          titulo: 'Key/value pairs',
          info: 'secreto-pares',
          cx,
          cuerpo: h(
            'div',
            { class: 'cx-form' },
            ui.segmentado({ valor: f.vista, opciones: [{ valor: 'pares', etiqueta: 'Key/value' }, { valor: 'texto', etiqueta: 'Plaintext' }], alCambiar: (v) => (cambiarVista(f, v), zona.repintar()) }),
            f.vista === 'pares' ? editorPares(f) : ui.area({ valor: f.texto, filas: 6, monoespaciado: true, placeholder: '{"apiKey":"…"}', alCambiar: (v) => (f.texto = v) }),
            f.errores.valor ? h('div', { class: 'cx-campo__error', role: 'alert' }, ui.icono('status-negative'), h('span', {}, f.errores.valor)) : null
          )
        })
      );
    }
    partes.push(ui.contenedor({ titulo: 'Encryption key', cuerpo: campoLlave(cx, f) }));
    if (f.tipo === 'rds') {
      partes.push(h('div', {}, tablaBases(), f.errores.base ? h('div', { class: 'cx-campo__error', role: 'alert', style: { marginTop: '6px' } }, ui.icono('status-negative'), h('span', {}, f.errores.base)) : null));
    }
    if (f.tipo === 'otra-base') {
      partes.push(
        ui.contenedor({
          titulo: 'Database',
          cuerpo: h(
            'div',
            { class: 'cx-form' },
            ui.campo({
              etiqueta: 'Database engine',
              control: ui.radios({
                valor: f.motor,
                opciones: MOTORES_OTRA_BASE.map((x) => ({ valor: x.motor, etiqueta: x.nombre })),
                alCambiar: (v) => {
                  f.motor = v;
                  f.puerto = String(MOTORES_OTRA_BASE.find((x) => x.motor === v)?.puerto ?? 3306);
                  zona.repintar();
                }
              })
            }),
            ui.campo({ etiqueta: 'Server address', control: ui.entrada({ valor: f.servidor, placeholder: 'db.example.com', alCambiar: (v) => (f.servidor = v) }), error: f.errores.servidor }),
            ui.campo({ etiqueta: 'Database name', opcional: true, control: ui.entrada({ valor: f.nombreBase, alCambiar: (v) => (f.nombreBase = v) }) }),
            ui.campo({ etiqueta: 'Port', control: ui.entrada({ tipo: 'number', valor: f.puerto, alCambiar: (v) => (f.puerto = v) }) })
          )
        })
      );
    }
    return partes;
  }

  /* ---------- paso 2 */
  function paso2() {
    return [
      ui.contenedor({
        titulo: 'Secret name and description',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.campo({
            etiqueta: 'Secret name',
            info: 'secreto-nombre',
            cx,
            descripcion: 'A descriptive name that helps you find your secret later.',
            control: ui.entrada({ valor: f.nombre, placeholder: 'prod/AppBeta/MySql', alCambiar: (v) => (f.nombre = v) }),
            error: f.errores.nombre,
            restriccion: 'Secret name must contain only alphanumeric characters and the characters /_+=.@-'
          }),
          ui.campo({ etiqueta: 'Description', opcional: true, control: ui.area({ valor: f.descripcion, filas: 3, placeholder: 'Access to MYSQL prod database for my AppBeta', alCambiar: (v) => (f.descripcion = v) }), restriccion: 'Maximum 250 characters.' })
        )
      }),
      ui.contenedor({ titulo: 'Tags', descripcion: 'A tag is a label that you assign to an AWS resource.', plegable: true, abierto: f.etiquetas.length > 0, cuerpo: ui.editorEtiquetas({ filas: f.etiquetas }) }),
      ui.contenedor({
        titulo: 'Resource permissions',
        descripcion: 'Add or edit a resource policy to access secrets across AWS accounts.',
        plegable: true,
        abierto: false,
        cuerpo: ui.alerta({ tipo: 'info', contenido: 'Las políticas de recurso entre cuentas no están disponibles en este simulador.' })
      }),
      ui.contenedor({
        titulo: 'Replicate secret',
        descripcion: 'Create read-only replicas of your secret in other Regions.',
        plegable: true,
        abierto: false,
        cuerpo: ui.alerta({ tipo: 'info', contenido: 'La réplica en otras regiones no está disponible en este simulador (todo vive en us-east-1).' })
      })
    ];
  }

  /* ---------- paso 3 */
  function paso3() {
    const r = f.rotacion;
    return [
      ui.contenedor({
        titulo: 'Configure automatic rotation',
        info: 'secreto-rotacion',
        cx,
        descripcion: 'Configure AWS Secrets Manager to rotate this secret automatically.',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.interruptor({ etiqueta: 'Automatic rotation', marcada: r.activa, alCambiar: (v) => ((r.activa = v), zona.repintar()) }),
          r.activa
            ? [
                ui.campo({
                  etiqueta: 'Rotation schedule',
                  control: ui.segmentado({ valor: r.modo, opciones: [{ valor: 'constructor', etiqueta: 'Schedule expression builder' }, { valor: 'expresion', etiqueta: 'Schedule expression' }], alCambiar: (v) => ((r.modo = v), zona.repintar()) })
                }),
                r.modo === 'constructor'
                  ? h(
                      'div',
                      { class: 'cx-fila-campos' },
                      ui.campo({
                        etiqueta: 'Time unit',
                        control: ui.selector({
                          opciones: [
                            { valor: 'hours', etiqueta: 'Hours' },
                            { valor: 'days', etiqueta: 'Days' },
                            { valor: 'weeks', etiqueta: 'Weeks' },
                            { valor: 'months', etiqueta: 'Months' }
                          ],
                          valor: r.unidad,
                          alCambiar: (v) => (r.unidad = v)
                        })
                      }),
                      ui.campo({ etiqueta: 'Every', control: ui.entrada({ tipo: 'number', valor: r.cada, alCambiar: (v) => (r.cada = v) }), error: f.errores.cada })
                    )
                  : ui.campo({ etiqueta: 'Schedule expression', control: ui.entrada({ valor: r.expresion, placeholder: 'rate(30 days)', alCambiar: (v) => (r.expresion = v) }), restriccion: 'Use rate(n days), rate(n hours), rate(n weeks) or rate(n months). Between 4 hours and 1000 days.' }),
                ui.campo({ etiqueta: 'Window duration', opcional: true, control: ui.entrada({ valor: '', placeholder: '4h', desactivado: true }), descripcion: 'Secrets Manager rotates the secret during this window.' }),
                ui.casilla({ etiqueta: 'Rotate immediately when the secret is stored. The next rotation will begin on your schedule.', marcada: r.inmediata, alCambiar: (v) => (r.inmediata = v) })
              ]
            : null
        )
      }),
      r.activa
        ? ui.contenedor({
            titulo: 'Rotation function',
            info: 'secreto-rotacion',
            cx,
            descripcion: conPlantilla(f.tipo) ? 'Create the Lambda function that rotates the secret, or choose one that you already have.' : 'Choose the Lambda function that rotates the secret.',
            cuerpo: h('div', { class: 'cx-form' }, camposFuncionRotacion(cx, r, { tipo: f.tipo, errores: f.errores, repintar: () => zona.repintar() }))
          })
        : null
    ];
  }

  /* ---------- paso 4 */
  function paso4() {
    const tipo = TIPOS_SECRETO.find((t) => t.tipo === f.tipo)?.nombre;
    const llave = opcionesLlave(cx).find((o) => o.valor === f.llaveKms)?.etiqueta ?? 'aws/secretsmanager';
    const r = f.rotacion;
    const editar = (i) => ui.boton('Edit', { alClic: () => irA(i) });
    const nombre = f.nombre.trim() || 'MySecretName';
    return [
      ui.contenedor({ titulo: 'Step 1: Secret type', acciones: editar(0), cuerpo: ui.pares([{ etiqueta: 'Secret type', valor: tipo }, { etiqueta: 'Encryption key', valor: llave }, f.tipo === 'rds' ? { etiqueta: 'Database', valor: f.baseId } : null], { columnas: 3 }) }),
      ui.contenedor({
        titulo: 'Step 2: Configure secret',
        acciones: editar(1),
        cuerpo: ui.pares([{ etiqueta: 'Secret name', valor: f.nombre }, { etiqueta: 'Description', valor: f.descripcion || '–' }, { etiqueta: 'Tags', valor: f.etiquetas.filter((x) => x.llave.trim()).length ? f.etiquetas.filter((x) => x.llave.trim()).map((x) => `${x.llave}=${x.valor}`).join(', ') : '–' }], { columnas: 3 })
      }),
      ui.contenedor({
        titulo: 'Step 3: Configure rotation',
        acciones: editar(2),
        cuerpo: ui.pares(
          [
            { etiqueta: 'Automatic rotation', valor: r.activa ? 'Enabled' : 'Disabled' },
            r.activa ? { etiqueta: 'Rotation schedule', valor: r.modo === 'constructor' ? `rate(${r.cada} ${r.unidad})` : r.expresion } : null,
            r.activa ? { etiqueta: 'Lambda rotation function', valor: textoFuncionRotacion(cx, r, f.tipo) } : null
          ],
          { columnas: 3 }
        )
      }),
      ui.contenedor({
        titulo: 'Sample code',
        info: 'secreto-codigo',
        cx,
        descripcion: 'Use this code to retrieve the secret in your application.',
        plegable: true,
        abierto: false,
        cuerpo: bloqueCodigo(codigoEjemplo(nombre))
      })
    ];
  }

  function guardar() {
    const r = f.rotacion;
    const res = cx.hacer(
      { servicio: 'SecretsManager', accion: 'CreateSecret', error: 'Failed to store the secret' },
      (e2) =>
        crearSecreto(e2, {
          nombre: f.nombre.trim(),
          descripcion: f.descripcion,
          tipo: f.tipo,
          llaveKms: f.llaveKms,
          valor: valorDe(f),
          usuario: f.usuario,
          contrasena: f.contrasena,
          baseId: f.baseId,
          motor: f.motor,
          servidor: f.servidor,
          nombreBase: f.nombreBase,
          puerto: f.puerto,
          etiquetas: f.etiquetas,
          rotacion: r.activa ? { activa: true, lambda: funcionRotacion(e2, r, f.tipo), inmediata: r.inmediata, ...(r.modo === 'constructor' ? { unidad: r.unidad, cada: Number(r.cada) } : { expresion: r.expresion }) } : null
        }),
      { atomico: true }
    );
    if (res.ok) {
      cx.flash({ tipo: 'exito', texto: `Your secret ${res.valor.nombre} has been successfully stored.`, accion: { texto: 'View details', alClic: () => cx.ir(rutaSecreto(res.valor)) } });
      cx.ir('secretsmanager/secretos');
    }
  }

  zona = ui.region(() => {
    const cuerpos = [paso1, paso2, paso3, paso4];
    return marco(cx, f, { titulo: PASOS[f.paso], cuerpo: cuerpos[f.paso](), pie: pie(), irA });
  });
  return zona;
}

function codigoEjemplo(nombre) {
  return [
    '# Python (boto3)',
    'import boto3',
    '',
    "client = boto3.client('secretsmanager', region_name='us-east-1')",
    `respuesta = client.get_secret_value(SecretId='${nombre}')`,
    "secreto = respuesta['SecretString']"
  ].join('\n');
}

/* ============================================================ detalle */

function detalle(cx, { nombre }) {
  cx.migas([migaBase, { texto: 'Secrets', ruta: 'secretsmanager/secretos' }, { texto: nombre }]);
  if (!secretoDe(cx.estado, nombre)) return noExiste(cx, 'Secret', nombre, 'secretsmanager/secretos');
  const st = { pestana: 'general', valor: null, vista: 'pares' };
  const s0 = () => secretoDe(cx.estado, nombre);

  const recuperar = () => {
    const r = cx.hacer({ servicio: 'SecretsManager', accion: 'GetSecretValue', error: 'Failed to retrieve the secret value' }, (e) => obtenerValorSecreto(e, nombre));
    if (r.ok) {
      st.valor = r.valor;
      st.vista = r.valor.pares ? 'pares' : 'texto';
      zona.repintar();
    }
  };

  const zona = cx.vivo(() => {
    const s = s0();
    if (!s) return noExiste(cx, 'Secret', nombre, 'secretsmanager/secretos');
    const rds = s.administradoPor === 'rds';
    const borrando = Boolean(s.borradoEn);
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({
        titulo: s.nombre,
        info: 'secreto',
        cx,
        acciones: [
          ui.botonRefrescar(() => cx.refrescar()),
          ui.menuBoton('Actions', () => [
            { texto: 'Edit description', escribe: true, desactivado: rds || borrando, alClic: () => editarDescripcion(cx, s) },
            { texto: 'Edit encryption key', escribe: true, desactivado: rds || borrando, alClic: () => editarLlave(cx, s) },
            { texto: 'Replicate secret to other Regions', desactivado: true },
            '-',
            { texto: 'Delete secret', escribe: true, desactivado: rds || borrando, alClic: () => eliminar(cx, s) },
            { texto: 'Cancel deletion', escribe: true, desactivado: !borrando, alClic: () => cancelar(cx, s) }
          ])
        ]
      }),
      borrando
        ? ui.alerta({
            tipo: 'aviso',
            titulo: `This secret is scheduled for deletion on ${ui.fechaLarga(s.borradoEn)}.`,
            contenido: 'You can’t use or retrieve this secret while it is scheduled for deletion. To restore it, choose Cancel deletion.',
            accion: ui.boton('Cancel deletion', { escribe: true, alClic: () => cancelar(cx, s) })
          })
        : null,
      rds
        ? ui.alerta({
            tipo: 'info',
            titulo: 'This secret is managed by Amazon RDS.',
            contenido: [`RDS creó este secreto con la contraseña maestra de la base ${s.base?.id ?? ''} y lo rota cada 7 días. Solo puedes leerlo; para cambiarlo usa la consola de `, ui.enlace('RDS', 'rds', { cx }), '.']
          })
        : null,
      ui.contenedor({
        titulo: 'Secret details',
        cuerpo: ui.pares(
          [
            { etiqueta: 'Encryption key', valor: textoLlave(cx, s), info: 'secreto-llave' },
            { etiqueta: 'Secret name', valor: s.nombre },
            { etiqueta: 'Secret ARN', valor: ui.copiable(s.arn) },
            { etiqueta: 'Secret description', valor: s.descripcion || '–' },
            { etiqueta: 'Managed by', valor: rds ? 'Amazon RDS' : '–' },
            { etiqueta: 'Last retrieved (UTC)', valor: fechaUtc(s.ultimoAcceso) }
          ],
          { columnas: 3, cx }
        )
      }),
      ui.pestanas({
        activa: st.pestana,
        alCambiar: (p) => (st.pestana = p),
        pestanas: [
          { id: 'general', texto: 'Overview', contenido: () => pestanaGeneral(cx, s, st, recuperar, () => zona.repintar()) },
          { id: 'rotacion', texto: 'Rotation', contenido: () => pestanaRotacion(cx, s) },
          { id: 'versiones', texto: 'Versions', contenido: () => pestanaVersiones(cx, s) },
          { id: 'replicas', texto: 'Replication', contenido: () => ui.contenedor({ titulo: 'Replicate secret', cuerpo: ui.alerta({ tipo: 'info', contenido: 'La réplica en otras regiones no está disponible en este simulador.' }) }) },
          { id: 'etiquetas', texto: 'Tags', contenido: () => pestanaEtiquetas(cx, s) }
        ]
      })
    );
  });
  return zona;
}

function pestanaGeneral(cx, s, st, recuperar, repintar) {
  const v = st.valor;
  const cuerpo = v
    ? h(
        'div',
        { class: 'cx-form' },
        ui.segmentado({
          valor: st.vista,
          opciones: [
            { valor: 'pares', etiqueta: 'Key/value', desactivado: !v.pares },
            { valor: 'texto', etiqueta: 'Plaintext' }
          ],
          alCambiar: (x) => ((st.vista = x), repintar())
        }),
        st.vista === 'pares' && v.pares
          ? h(
              'table',
              { class: 'cx-sec-valor' },
              h('thead', {}, h('tr', {}, h('th', {}, 'Secret key'), h('th', {}, 'Secret value'))),
              h('tbody', {}, v.pares.map((p) => h('tr', {}, h('td', {}, p.llave), h('td', {}, p.valor))))
            )
          : bloqueCodigo(v.valor)
      )
    : h('div', { class: 'cx-texto-sec' }, 'The secret value is encrypted. Choose Retrieve secret value to see it.', h('div', { class: 'cx-sec-oculto', style: { marginTop: '8px' } }, '••••••••••••'));
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.contenedor({
      titulo: 'Secret value',
      info: 'secreto-valor',
      cx,
      descripcion: 'Retrieve and view the secret value.',
      acciones: v
        ? [ui.boton('Close', { alClic: () => ((st.valor = null), repintar()) }), ui.boton('Edit', { escribe: true, desactivado: s.administradoPor === 'rds' || Boolean(s.borradoEn), alClic: () => editarValor(cx, s, v, () => ((st.valor = null), repintar())) })]
        : ui.boton('Retrieve secret value', { escribe: true, desactivado: Boolean(s.borradoEn), alClic: recuperar }),
      cuerpo
    }),
    ui.contenedor({ titulo: 'Sample code', info: 'secreto-codigo', cx, descripcion: 'Use this code to retrieve the secret in your application.', plegable: true, abierto: false, cuerpo: bloqueCodigo(codigoEjemplo(s.nombre)) })
  );
}

function pestanaRotacion(cx, s) {
  const r = s.rotacion ?? {};
  const rds = s.administradoPor === 'rds';
  const lambda = r.lambdaArn ? r.lambdaArn.split(':').pop() : null;
  return ui.contenedor({
    titulo: 'Rotation configuration',
    info: 'secreto-rotacion',
    cx,
    acciones: [
      ui.boton('Rotate secret immediately', { escribe: true, desactivado: Boolean(s.borradoEn) || (!rds && !r.lambdaArn), alClic: () => rotarYa(cx, s) }),
      ui.boton('Edit rotation', { escribe: true, desactivado: rds || Boolean(s.borradoEn), alClic: () => editarRotacion(cx, s) })
    ],
    cuerpo: ui.pares(
      [
        { etiqueta: 'Rotation status', valor: r.activa ? ui.estado('exito', 'Enabled') : ui.estado('inactivo', 'Disabled') },
        { etiqueta: 'Rotation schedule', valor: r.activa ? r.expresion : '–' },
        { etiqueta: 'Next rotation date (UTC)', valor: r.activa && r.siguiente ? fechaUtc(r.siguiente) : '–' },
        { etiqueta: 'Last rotated date (UTC)', valor: fechaUtc(r.ultima) },
        { etiqueta: 'Lambda rotation function', valor: rds ? 'Managed by Amazon RDS' : lambda ?? '–' }
      ],
      { columnas: 3 }
    )
  });
}

function pestanaVersiones(cx, s) {
  return ui.tabla(cx, {
    titulo: 'Versions',
    variante: 'contenedor',
    filas: () => secretoDe(cx.estado, s.nombre)?.versiones ?? [],
    clave: (v) => v.id,
    seleccion: null,
    filtro: false,
    columnas: [
      { titulo: 'Version ID', valor: (v) => h('span', { class: 'cx-mono' }, v.id) },
      { titulo: 'Staging labels', valor: (v) => h('span', {}, v.etapas.map((x) => h('span', { class: 'cx-insignia cx-insignia--gris', style: { marginRight: '6px' } }, x))) },
      { titulo: 'Created on (UTC)', valor: (v) => fechaUtc(v.creado) }
    ]
  });
}

function pestanaEtiquetas(cx, s) {
  return ui.tabla(cx, {
    titulo: 'Tags',
    variante: 'contenedor',
    filas: () => secretoDe(cx.estado, s.nombre)?.etiquetas ?? [],
    clave: (t) => t.llave,
    seleccion: null,
    filtro: false,
    columnas: [
      { titulo: 'Key', valor: (t) => t.llave },
      { titulo: 'Value', valor: (t) => t.valor || '–' }
    ],
    acciones: () => [ui.boton('Edit tags', { escribe: true, desactivado: Boolean(s.borradoEn), alClic: () => editarEtiquetas(cx, s) })],
    vacio: { titulo: 'No tags', texto: 'This secret has no tags.' }
  });
}

/* ============================================================ modales */

function editarValor(cx, s, v, alTerminar) {
  const f = { vista: v.pares ? 'pares' : 'texto', pares: (v.pares ?? [{ llave: '', valor: '' }]).map((p) => ({ ...p })), texto: v.valor };
  const cuerpo = ui.region(() =>
    h(
      'div',
      { class: 'cx-form' },
      ui.segmentado({ valor: f.vista, opciones: [{ valor: 'pares', etiqueta: 'Key/value' }, { valor: 'texto', etiqueta: 'Plaintext' }], alCambiar: (x) => (cambiarVista(f, x), cuerpo.repintar()) }),
      f.vista === 'pares' ? editorPares(f) : ui.area({ valor: f.texto, filas: 8, monoespaciado: true, alCambiar: (x) => (f.texto = x) })
    )
  );
  const m = cx.modal({
    titulo: `Edit secret value: ${s.nombre}`,
    ancho: 'grande',
    contenido: [ui.alerta({ tipo: 'info', contenido: 'Al guardar se crea una versión nueva (AWSCURRENT) y la anterior queda como AWSPREVIOUS.' }), cuerpo],
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Save', {
        variante: 'primario',
        alClic: () => {
          const r = cx.hacer({ servicio: 'SecretsManager', accion: 'PutSecretValue', error: 'Failed to save the secret value' }, (e) => editarValorSecreto(e, s.nombre, valorDe(f)));
          if (r.ok) {
            m.cerrar();
            cx.flash({ tipo: 'exito', texto: `Your secret ${s.nombre} has been successfully updated.` });
            alTerminar?.();
          }
        }
      })
    ]
  });
}

function editarDescripcion(cx, s) {
  const f = { descripcion: s.descripcion ?? '' };
  const m = cx.modal({
    titulo: 'Edit description',
    contenido: ui.campo({ etiqueta: 'Description', control: ui.area({ valor: f.descripcion, filas: 3, alCambiar: (v) => (f.descripcion = v) }), restriccion: 'Maximum 250 characters.' }),
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Save', {
        variante: 'primario',
        alClic: () => {
          const r = cx.hacer({ servicio: 'SecretsManager', accion: 'UpdateSecret', error: 'Failed to update the description' }, (e) => editarSecreto(e, s.nombre, { descripcion: f.descripcion }));
          if (r.ok) m.cerrar();
        }
      })
    ]
  });
}

function editarLlave(cx, s) {
  const k = llaveKmsDe(cx.estado, s.llaveKms);
  const f = { llaveKms: k?.administradaPorAws ? 'aws/secretsmanager' : k?.id ?? 'aws/secretsmanager' };
  const m = cx.modal({
    titulo: 'Edit encryption key',
    contenido: [campoLlave(cx, f), ui.alerta({ tipo: 'info', contenido: 'Las versiones nuevas del secreto se cifran con la llave que elijas.' })],
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Save', {
        variante: 'primario',
        alClic: () => {
          const r = cx.hacer({ servicio: 'SecretsManager', accion: 'UpdateSecret', error: 'Failed to update the encryption key' }, (e) => editarSecreto(e, s.nombre, { llaveKms: f.llaveKms }));
          if (r.ok) m.cerrar();
        }
      })
    ]
  });
}

function editarRotacion(cx, s) {
  const r0 = s.rotacion ?? {};
  const m0 = /^rate\((\d+) (hours?|days?|weeks?|months?)\)$/.exec(r0.expresion ?? '');
  const f = {
    activa: Boolean(r0.activa),
    modo: 'constructor',
    unidad: m0 ? (m0[2].endsWith('s') ? m0[2] : `${m0[2]}s`) : 'days',
    cada: m0 ? m0[1] : '30',
    expresion: r0.expresion ?? 'rate(30 days)',
    inmediata: false,
    funcion: r0.lambdaArn ? 'existente' : 'crear',
    nombreFuncion: '',
    lambda: r0.lambdaArn ?? null,
    errores: {}
  };
  const cuerpo = ui.region(() =>
    h(
      'div',
      { class: 'cx-form' },
      ui.interruptor({ etiqueta: 'Automatic rotation', marcada: f.activa, alCambiar: (v) => ((f.activa = v), cuerpo.repintar()) }),
      f.activa
        ? [
            ui.campo({ etiqueta: 'Rotation schedule', control: ui.segmentado({ valor: f.modo, opciones: [{ valor: 'constructor', etiqueta: 'Schedule expression builder' }, { valor: 'expresion', etiqueta: 'Schedule expression' }], alCambiar: (v) => ((f.modo = v), cuerpo.repintar()) }) }),
            f.modo === 'constructor'
              ? h(
                  'div',
                  { class: 'cx-fila-campos' },
                  ui.campo({ etiqueta: 'Time unit', control: ui.selector({ opciones: ['hours', 'days', 'weeks', 'months'].map((u) => ({ valor: u, etiqueta: u[0].toUpperCase() + u.slice(1) })), valor: f.unidad, alCambiar: (v) => (f.unidad = v) }) }),
                  ui.campo({ etiqueta: 'Every', control: ui.entrada({ tipo: 'number', valor: f.cada, alCambiar: (v) => (f.cada = v) }) })
                )
              : ui.campo({ etiqueta: 'Schedule expression', control: ui.entrada({ valor: f.expresion, alCambiar: (v) => (f.expresion = v) }) }),
            ui.casilla({ etiqueta: 'Rotate immediately when the secret is stored. The next rotation will begin on your schedule.', marcada: f.inmediata, alCambiar: (v) => (f.inmediata = v) }),
            h('div', { class: 'cx-bloque__titulo' }, 'Rotation function'),
            camposFuncionRotacion(cx, f, { tipo: s.tipo, errores: f.errores, repintar: () => cuerpo.repintar() })
          ]
        : null
    )
  );
  const m = cx.modal({
    titulo: 'Edit rotation configuration',
    ancho: 'grande',
    contenido: cuerpo,
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Save', {
        variante: 'primario',
        alClic: () => {
          f.errores = f.activa ? erroresFuncionRotacion(cx.estado, f, s.tipo) : {};
          if (Object.keys(f.errores).length) return cuerpo.repintar();
          const r = cx.hacer(
            { servicio: 'SecretsManager', accion: f.activa ? 'RotateSecret' : 'CancelRotateSecret', error: 'Failed to edit rotation' },
            (e) =>
              configurarRotacionSecreto(e, s.nombre, f.activa ? { activa: true, lambda: funcionRotacion(e, f, s.tipo), inmediata: f.inmediata, ...(f.modo === 'constructor' ? { unidad: f.unidad, cada: Number(f.cada) } : { expresion: f.expresion }) } : { activa: false }),
            { atomico: true }
          );
          if (r.ok) {
            m.cerrar();
            cx.flash({ tipo: 'exito', texto: `Rotation configuration for ${s.nombre} was saved.` });
          }
        }
      })
    ]
  });
}

function rotarYa(cx, s) {
  cx.confirmar({
    titulo: 'Rotate secret immediately',
    textoBoton: 'Rotate',
    contenido: h('p', {}, `Secrets Manager will rotate ${s.nombre} now. Applications that cache the old value should read the secret again. The next rotation follows your schedule.`),
    aceptar: () => {
      const r = cx.hacer({ servicio: 'SecretsManager', accion: 'RotateSecret', error: 'Failed to rotate the secret' }, (e) => rotarSecretoAhora(e, s.nombre));
      if (r.ok) cx.flash({ tipo: 'exito', texto: `Rotation of ${s.nombre} succeeded. A new version is now labeled AWSCURRENT.` });
      return r.ok;
    }
  });
}

function editarEtiquetas(cx, s) {
  const filas = s.etiquetas.filter((t) => !t.llave.startsWith('aws:')).map((t) => ({ ...t }));
  const m = cx.modal({
    titulo: 'Edit tags',
    ancho: 'grande',
    contenido: ui.editorEtiquetas({ filas }),
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Save', {
        variante: 'primario',
        alClic: () => {
          const r = cx.hacer({ servicio: 'SecretsManager', accion: 'TagResource', error: 'Failed to save tags' }, (e) => etiquetasSecreto(e, s.nombre, filas));
          if (r.ok) m.cerrar();
        }
      })
    ]
  });
}

function eliminar(cx, s) {
  const f = { dias: '30', error: null };
  const cuerpo = ui.region(() => [
    ui.alerta({ tipo: 'aviso', contenido: 'Scheduling a secret for deletion makes it unavailable right away. After the waiting period, Secrets Manager deletes the secret permanently and you can’t recover it.' }),
    h('p', {}, `To schedule deletion of ${s.nombre}, choose a waiting period.`),
    ui.campo({
      etiqueta: 'Waiting period (in days)',
      control: ui.entrada({ tipo: 'number', valor: f.dias, min: 7, max: 30, alCambiar: (v) => (f.dias = v) }),
      restriccion: 'Enter a number between 7 and 30.',
      error: f.error
    })
  ]);
  cx.confirmar({
    titulo: 'Schedule secret deletion',
    textoBoton: 'Schedule deletion',
    contenido: cuerpo,
    aceptar: () => {
      const n = Number(f.dias);
      if (!Number.isInteger(n) || n < 7 || n > 30) {
        f.error = 'Waiting period must be between 7 and 30 days.';
        cuerpo.repintar();
        return false;
      }
      const r = cx.hacer({ servicio: 'SecretsManager', accion: 'DeleteSecret', error: 'Failed to schedule deletion' }, (e) => eliminarSecreto(e, s.nombre, { dias: n }));
      if (r.ok) cx.flash({ tipo: 'exito', texto: `The secret ${s.nombre} is scheduled for deletion on ${ui.fechaLarga(r.valor.borradoEn)}.` });
      return r.ok;
    }
  });
}

function cancelar(cx, s) {
  const r = cx.hacer({ servicio: 'SecretsManager', accion: 'RestoreSecret', error: 'Failed to cancel deletion' }, (e) => restaurarSecreto(e, s.nombre));
  if (r.ok) cx.flash({ tipo: 'exito', texto: `The deletion of ${s.nombre} was canceled. You can use the secret again.` });
}

/* ================================================================ ayudas */

const ayudas = {
  secreto: {
    titulo: 'AWS Secrets Manager',
    texto: [
      '**Secrets Manager** es una caja fuerte para tus **secretos**: contraseñas de bases de datos, llaves de API, tokens…',
      'En lugar de escribir la contraseña dentro del código (donde cualquiera la ve en GitHub), tu aplicación le **pide el secreto** a Secrets Manager cuando lo necesita.',
      ['Cada secreto se **cifra** con una llave de **KMS**.', 'Puede **rotarse solo** cada cierto tiempo con una función de Lambda.', 'CloudTrail anota quién leyó cada secreto (`GetSecretValue`).'],
      'Cuesta 0.40 USD por secreto al mes. Para un dato que no es secreto (un nombre de bucket, una URL) basta con **Systems Manager Parameter Store**.'
    ]
  },
  'secreto-tipo': {
    titulo: 'Tipos de secreto',
    texto: [
      '**Credentials for Amazon RDS database**: usuario y contraseña de una base de RDS que ya existe. Secrets Manager guarda también el host y el puerto.',
      '**Credentials for other database**: lo mismo, pero para una base que no es de RDS (tú escribes el servidor).',
      '**Other type of secret**: cualquier cosa en pares llave/valor (por ejemplo `apiKey`) o en texto plano.'
    ]
  },
  'secreto-pares': {
    titulo: 'Pares llave/valor',
    texto: ['Escribe cada dato como una **llave** (el nombre) y su **valor**. Secrets Manager los guarda juntos como un JSON: `{"apiKey":"abc123"}`.', 'Con **Plaintext** ves y editas ese mismo JSON (o un texto cualquiera).']
  },
  'secreto-llave': {
    titulo: 'La llave de cifrado',
    texto: [
      'Todo secreto se guarda **cifrado** con una llave de **AWS KMS**.',
      '`aws/secretsmanager` es la llave que AWS crea y administra por ti (no cuesta).',
      'Una **customer managed key** (la creas en KMS) te deja decidir **quién** puede usarla y ver en CloudTrail cada uso. Si la deshabilitas o la borras, ¡nadie podrá leer el secreto!'
    ]
  },
  'secreto-nombre': {
    titulo: 'Nombre del secreto',
    texto: ['Usa un nombre que diga para qué es, con diagonales como carpetas: `prod/tienda/mysql`.', 'Letras, números y `/_+=.@-`; sin espacios.']
  },
  'secreto-rotacion': {
    titulo: 'Rotación automática',
    texto: [
      '**Rotar** es cambiar la contraseña cada cierto tiempo, sin que nadie la toque. Si alguien la robó, pronto deja de servirle.',
      'Secrets Manager llama a una **función de Lambda** que crea la contraseña nueva, la pone en la base y la prueba.',
      'Con un secreto de RDS no tienes que programarla: elige **Create a new Lambda function**, escribe un nombre y Secrets Manager la crea con su plantilla (le pone el prefijo `SecretsManager`).',
      'La versión nueva queda como `AWSCURRENT` y la anterior como `AWSPREVIOUS`.',
      'En el simulador la rotación usa días de verdad: con «Rotate secret immediately» la ves al momento.'
    ]
  },
  'secreto-valor': {
    titulo: 'Retrieve secret value',
    texto: ['Muestra el valor descifrado. Cada lectura queda en **CloudTrail** como `GetSecretValue`.', 'En el sandbox de DataCamp este botón sale negado; aquí sí funciona.']
  },
  'secreto-codigo': {
    titulo: 'Código de ejemplo',
    texto: ['Así lee tu aplicación el secreto con el SDK de AWS. El permiso que necesita es `secretsmanager:GetSecretValue` (y `kms:Decrypt` si usas una llave propia).']
  }
};

/* ================================================================ registro */

const des = (texto) => ({ texto, desactivado: true });

export default {
  id: 'secretsmanager',
  nombre: 'Secrets Manager',
  titulo: 'AWS Secrets Manager',
  descripcion: 'Easily rotate, manage, and retrieve secrets throughout their lifecycle',
  categoria: 'seguridad',
  claves: 'secretos contraseñas password credenciales rotación',
  inicio: 'secretsmanager/secretos',
  menu: [{ texto: 'Secrets', ruta: 'secretsmanager/secretos' }, des('Batch retrieval'), des('Secrets Manager Agent')],
  rutas: {
    '': lista,
    secretos: lista,
    crear,
    'secretos/:nombre': detalle
  },
  busqueda: [
    { texto: 'Secrets', ruta: 'secretsmanager/secretos' },
    { texto: 'Store a new secret', ruta: 'secretsmanager/crear', claves: 'crear secreto contraseña' }
  ],
  ayudas
};
