// ---------------------------------------------------------------------------
// AMAZON S3
//
// La lista de buckets (con «Account snapshot»), «Create bucket» con todas las
// secciones de la consola real, el detalle del bucket con sus pestañas
// (Objects, Properties, Permissions, Management), las páginas de edición
// (versionado, cifrado, sitio web, bloqueo público, política), «Upload»,
// «Create lifecycle rule» y los modales de vaciar y borrar.
//
// Todo cambio pasa por cx.hacer con las acciones de modelo.js; los errores
// salen en rojo con el mensaje en inglés que da el modelo.
// ---------------------------------------------------------------------------

import * as ui from '../ui.js';
import {
  CLASES_S3,
  REGION,
  claseS3,
  bucketDe,
  validarNombreBucket,
  crearBucket,
  editarVersionado,
  editarCifrado,
  editarBloqueoPublico,
  editarSitioWeb,
  politicaEsPublica,
  editarPolitica,
  crearReglaCiclo,
  editarReglaCiclo,
  eliminarReglaCiclo,
  subirObjetos,
  crearCarpeta,
  eliminarObjetos,
  vaciarBucket,
  eliminarBucket
} from '../modelo.js';

const { h, icono } = ui;

/* ============================================================ utilidades */

const MESES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dos = (n) => String(n).padStart(2, '0');

/** Fecha como la muestra S3: «October 16, 2026, 10:23:45 (UTC-06:00)». */
function fechaS3(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  const off = -d.getTimezoneOffset();
  const signo = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return `${MESES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}, ${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())} (UTC${signo}${dos(Math.floor(a / 60))}:${dos(a % 60)})`;
}

/** «245.0 KB», «1.8 MB», «0 B». */
function tamano(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(1)} GB`;
}

const ruta = (nombre, resto = '') => `s3/buckets/${encodeURIComponent(nombre)}${resto ? `/${resto}` : ''}`;
const arnBucket = (n) => `arn:aws:s3:::${n}`;
const regionTexto = () => `${REGION.nombre} ${REGION.codigo}`;
const nombreClase = (c) => claseS3(c)?.nombre ?? c;

/** Recuerda la pestaña del bucket para volver a ella después de editar. */
function recordarPestana(cx, nombre, pestana) {
  cx.memoria.s3Pestana ??= {};
  cx.memoria.s3Pestana[nombre] = pestana;
}

/** Vuelve al detalle del bucket en una pestaña. */
function irABucket(cx, nombre, pestana) {
  if (pestana) recordarPestana(cx, nombre, pestana);
  cx.ir(ruta(nombre));
}

/** Página para un bucket que ya no existe. */
function sinBucket(cx, nombre) {
  cx.migas([{ texto: 'Amazon S3', ruta: 's3' }, { texto: 'Buckets', ruta: 's3/buckets' }, { texto: nombre }]);
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.alerta({ tipo: 'error', titulo: 'Bucket not found', contenido: [`The bucket ${nombre} does not exist or was deleted. `, ui.enlace('View all buckets', 's3/buckets', { cx })] })
  );
}

/** Los objetos que «se ven»: la versión actual que no es marcador de borrado. */
const actuales = (b) => b.objetos.filter((o) => o.actual && !o.marcadorBorrado);

/** Lo que hay directo bajo un prefijo: carpetas («fotos/») y archivos. */
function listado(b, prefijo) {
  const carpetas = new Map();
  const archivos = [];
  for (const o of actuales(b)) {
    if (!o.llave.startsWith(prefijo)) continue;
    const resto = o.llave.slice(prefijo.length);
    if (!resto) continue; // el marcador de la carpeta en la que estamos
    const i = resto.indexOf('/');
    if (i >= 0) {
      const nombre = resto.slice(0, i + 1);
      if (!carpetas.has(nombre)) carpetas.set(nombre, { tipo: 'carpeta', llave: prefijo + nombre, nombre });
    } else archivos.push({ tipo: 'objeto', llave: o.llave, nombre: resto, objeto: o });
  }
  return [...[...carpetas.values()].sort((a, c) => a.nombre.localeCompare(c.nombre)), ...archivos.sort((a, c) => a.nombre.localeCompare(c.nombre))];
}

/** Bloqueo completo: las cuatro casillas en On. */
const bloqueoCompleto = (x) => x.aclsNuevas && x.aclsCualquiera && x.politicasNuevas && x.politicasCualquiera;

// Cada casilla: [llave, texto antes, palabra en cursiva, texto después, descripción].
const CASILLAS_BLOQUEO = [
  ['aclsNuevas', 'Block public access to buckets and objects granted through ', 'new', ' access control lists (ACLs)', 'S3 will block public access permissions applied to newly added buckets or objects, and prevent the creation of new public access ACLs for existing buckets and objects. This setting doesn’t change any existing permissions that allow public access to S3 resources using ACLs.'],
  ['aclsCualquiera', 'Block public access to buckets and objects granted through ', 'any', ' access control lists (ACLs)', 'S3 will ignore all ACLs that grant public access to buckets and objects.'],
  ['politicasNuevas', 'Block public access to buckets and objects granted through ', 'new', ' public bucket or access point policies', 'S3 will block new bucket and access point policies that grant public access to buckets and objects. This setting doesn’t change any existing policies that allow public access to S3 resources.'],
  ['politicasCualquiera', 'Block public and cross-account access to buckets and objects through ', 'any', ' public bucket or access point policies', 'S3 will ignore public and cross-account access for buckets or access points with policies that grant public access to buckets and objects.']
];

// Las mismas cuatro, en una línea (el resumen de la pestaña Permissions).
const TEXTO_BLOQUEO = CASILLAS_BLOQUEO.map(([k, antes, cursiva, despues]) => [k, `${antes}${cursiva}${despues}`]);

/**
 * El editor del bloqueo público (casilla maestra + las cuatro), con la alerta
 * amarilla y la casilla de reconocimiento cuando algo queda apagado.
 * `f.bloqueo` = { aclsNuevas, … }; `f.reconoce` = bool. `error()` da el texto rojo de la casilla.
 */
function editorBloqueo(f, { conReconocer = true, error = () => null } = {}) {
  const zona = ui.region(() => {
    const x = f.bloqueo;
    const todo = bloqueoCompleto(x);
    const alguno = x.aclsNuevas || x.aclsCualquiera || x.politicasNuevas || x.politicasCualquiera;
    const maestra = ui.casilla({
      etiqueta: h('span', {}, 'Block ', h('i', {}, 'all'), ' public access'),
      descripcion: 'Turning this setting on is the same as turning on all four settings below. Each of the following settings are independent of one another.',
      marcada: todo,
      alCambiar: (v) => {
        for (const k of Object.keys(x)) x[k] = v;
        zona.repintar();
      }
    });
    const caja = maestra.querySelector('input');
    if (caja && !todo && alguno) caja.indeterminate = true;
    return [
      maestra,
      h(
        'div',
        { class: 'cx-s3-bloqueo__hijas' },
        CASILLAS_BLOQUEO.map(([k, antes, cursiva, despues, desc]) =>
          ui.casilla({
            etiqueta: h('span', {}, antes, h('i', {}, cursiva), despues),
            descripcion: desc,
            marcada: x[k],
            alCambiar: (v) => {
              x[k] = v;
              zona.repintar();
            }
          })
        )
      ),
      conReconocer && !todo
        ? ui.alerta({
            tipo: 'aviso',
            titulo: 'Turning off block all public access might result in this bucket and the objects within becoming public',
            contenido: [
              h('p', {}, 'AWS recommends that you turn on block all public access, unless public access is required for specific and verified use cases such as static website hosting.'),
              ui.casilla({
                etiqueta: 'I acknowledge that the current settings might result in this bucket and the objects within becoming public.',
                marcada: f.reconoce,
                alCambiar: (v) => {
                  f.reconoce = v;
                  zona.repintar();
                }
              }),
              error() ? h('div', { class: 'cx-campo__error', role: 'alert' }, icono('status-negative'), h('span', {}, error())) : null
            ]
          })
        : null
    ];
  });
  return zona;
}

/* ===================================================== clases de almacenamiento */

// Lo que la consola dice de cada clase (las listas de Upload y del ciclo de vida).
const INFO_CLASE = {
  STANDARD: { uso: 'Frequently accessed data (more than once a month) with milliseconds access', azs: '≥ 3', minimo: '-', recuperar: '-' },
  INTELLIGENT_TIERING: { uso: 'Data with changing or unknown access patterns', azs: '≥ 3', minimo: 'No minimum storage duration', recuperar: '-' },
  STANDARD_IA: { uso: 'Infrequently accessed data (once a month) with milliseconds access', azs: '≥ 3', minimo: '30 days minimum storage duration', recuperar: 'Per-GB fees apply' },
  ONEZONE_IA: { uso: 'Recreatable, infrequently accessed data (once a month) with milliseconds access', azs: '1', minimo: '30 days minimum storage duration', recuperar: 'Per-GB fees apply' },
  GLACIER_IR: { uso: 'Long-lived archive data accessed once a quarter with instant retrieval in milliseconds', azs: '≥ 3', minimo: '90 days minimum storage duration', recuperar: 'Per-GB fees apply' },
  GLACIER: { uso: 'Long-lived archive data accessed once a year with retrieval of minutes to hours', azs: '≥ 3', minimo: '90 days minimum storage duration', recuperar: 'Per-GB fees apply' },
  DEEP_ARCHIVE: { uso: 'Long-lived archive data accessed less than once a year with retrieval of hours', azs: '≥ 3', minimo: '180 days minimum storage duration', recuperar: 'Per-GB fees apply' }
};

// El orden del desplegable de transiciones de la consola real.
const ORDEN_TRANSICION = ['STANDARD_IA', 'INTELLIGENT_TIERING', 'ONEZONE_IA', 'GLACIER_IR', 'GLACIER', 'DEEP_ARCHIVE'];

const opcionesTransicion = () =>
  ORDEN_TRANSICION.map((c) => ({ valor: c, etiqueta: nombreClase(c), descripcion: `${INFO_CLASE[c].uso}. ${INFO_CLASE[c].minimo}.` }));

/* ============================================================ lista */

function buckets(cx) {
  cx.migas([{ texto: 'Amazon S3', ruta: 's3' }, { texto: 'Buckets' }]);

  const resumen = cx.vivo(() => {
    const todos = cx.estado.buckets;
    const objetos = todos.flatMap((b) => b.objetos.filter((o) => !o.marcadorBorrado));
    const total = objetos.reduce((s, o) => s + (o.tamano || 0), 0);
    return ui.contenedor({
      titulo: 'Account snapshot - updated every 24 hours',
      info: 's3-bucket',
      cx,
      acciones: ui.boton('View Storage Lens dashboard', { desactivado: true }),
      descripcion: 'Storage Lens provides visibility into storage usage and activity trends.',
      cuerpo: ui.pares(
        [
          { etiqueta: 'Total storage', valor: tamano(total) },
          { etiqueta: 'Object count', valor: String(objetos.length) },
          { etiqueta: 'Average object size', valor: objetos.length ? tamano(Math.round(total / objetos.length)) : '0 B' },
          { etiqueta: 'Buckets', valor: String(todos.length) }
        ],
        { columnas: 4 }
      )
    });
  });

  let pestana = 'general';
  const tabla = ui.tabla(cx, {
    titulo: 'General purpose buckets',
    info: 's3-bucket',
    variante: 'contenedor',
    descripcion: 'Buckets are containers for data stored in S3.',
    filas: () => cx.estado.buckets,
    clave: (b) => b.nombre,
    seleccion: 'unica',
    filtro: 'Find buckets by name',
    columnas: [
      { titulo: 'Name', valor: (b) => ui.enlace(b.nombre, ruta(b.nombre), { cx }), texto: (b) => b.nombre },
      { titulo: 'AWS Region', valor: () => regionTexto() },
      { titulo: 'Creation date', valor: (b) => fechaS3(b.creado), texto: (b) => b.creado }
    ],
    acciones: (sel) => [
      ui.boton('Copy ARN', { icono: 'copy', desactivado: sel.length !== 1, alClic: () => copiarArn(cx, sel[0]) }),
      ui.boton('Empty', { desactivado: sel.length !== 1, escribe: true, alClic: () => modalVaciar(cx, sel[0].nombre) }),
      ui.boton('Delete', { desactivado: sel.length !== 1, escribe: true, alClic: () => modalBorrar(cx, sel[0].nombre) }),
      ui.boton('Create bucket', { variante: 'primario', alClic: () => cx.ir('s3/buckets/crear') })
    ],
    vacio: {
      titulo: 'No buckets',
      texto: 'You don’t have any buckets.',
      accion: ui.boton('Create bucket', { escribe: true, alClic: () => cx.ir('s3/buckets/crear') })
    }
  });

  const directorio = ui.contenedor({
    titulo: 'Directory buckets',
    descripcion: 'Directory buckets use the S3 Express One Zone storage class.',
    cuerpo: ui.alerta({ tipo: 'info', titulo: 'No disponible en este simulador', contenido: 'Los directory buckets existen en la consola real, pero no los necesitas para tus laboratorios: usa General purpose.' })
  });

  const cuerpo = h('div', {});
  const pintar = () =>
    ui.reemplazar(
      cuerpo,
      ui.segmentado({
        opciones: [
          { valor: 'general', etiqueta: 'General purpose buckets' },
          { valor: 'directorio', etiqueta: 'Directory buckets' }
        ],
        valor: pestana,
        alCambiar: (v) => {
          pestana = v;
          pintar();
        }
      }),
      h('div', { style: { marginTop: '16px' } }, pestana === 'general' ? tabla : directorio)
    );
  pintar();

  return h('div', { class: 'cx-pagina' }, ui.encabezado({ titulo: 'Amazon S3', info: 's3-bucket', cx }), resumen, cuerpo);
}

function copiarArn(cx, b) {
  try {
    navigator.clipboard?.writeText(arnBucket(b.nombre));
  } catch {
    /* sin portapapeles: igual avisamos */
  }
  cx.flash({ tipo: 'exito', texto: `Copied ARN to clipboard: ${arnBucket(b.nombre)}` });
}

/* ============================================================ vaciar y borrar */

function modalVaciar(cx, nombre, { alTerminar } = {}) {
  const b = bucketDe(cx.estado, nombre);
  if (!b) return;
  cx.confirmar({
    titulo: `Empty bucket "${nombre}"?`,
    palabra: 'permanently delete',
    textoBoton: 'Empty',
    contenido: [
      ui.alerta({
        tipo: 'aviso',
        contenido: [
          h('ul', {}, h('li', {}, 'Emptying the bucket deletes all objects in the bucket and cannot be undone.'), h('li', {}, 'Objects added to the bucket while the empty bucket action is in progress might be deleted.'), b.versionado !== 'Disabled' ? h('li', {}, 'All versions of every object, and their delete markers, will also be deleted.') : null)
        ]
      }),
      h('p', { class: 'cx-texto-sec', style: { marginTop: '12px' } }, `The bucket has ${b.objetos.length} object${b.objetos.length === 1 ? '' : 's'} (including versions).`)
    ],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'S3', accion: 'EmptyBucket', error: 'Failed to empty bucket' }, (e) => vaciarBucket(e, nombre));
      if (r.ok) {
        cx.flash({ tipo: 'exito', titulo: `Successfully emptied bucket "${nombre}"`, texto: 'All objects and object versions in the bucket were permanently deleted.' });
        alTerminar ? alTerminar() : cx.ir(cx.ruta);
      }
      return true;
    }
  });
}

function modalBorrar(cx, nombre) {
  const b = bucketDe(cx.estado, nombre);
  if (!b) return;
  const lleno = b.objetos.length > 0;
  let m;
  m = cx.confirmar({
    titulo: `Delete bucket "${nombre}"?`,
    palabra: nombre,
    textoBoton: 'Delete bucket',
    contenido: [
      lleno
        ? ui.alerta({
            tipo: 'error',
            titulo: 'This bucket is not empty',
            contenido: 'Buckets must be empty before they can be deleted. To delete all objects in the bucket, use the empty bucket configuration.',
            accion: ui.boton('Empty bucket', {
              escribe: true,
              alClic: () => {
                m.cerrar();
                modalVaciar(cx, nombre);
              }
            })
          })
        : null,
      ui.alerta({
        tipo: 'aviso',
        contenido: h('ul', {}, h('li', {}, 'Deleting a bucket cannot be undone.'), h('li', {}, 'Bucket names are unique. If you delete a bucket, another AWS user can use the name.'))
      })
    ],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'S3', accion: 'DeleteBucket', error: `Failed to delete bucket "${nombre}"` }, (e) => eliminarBucket(e, nombre));
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: `Successfully deleted bucket "${nombre}"` });
        cx.ir('s3/buckets');
      }
      return true;
    }
  });
}

/* ============================================================ crear bucket */

function crearBucketPagina(cx) {
  cx.migas([{ texto: 'Amazon S3', ruta: 's3' }, { texto: 'Buckets', ruta: 's3/buckets' }, { texto: 'Create bucket' }]);
  const f = {
    nombre: '',
    copiadoDe: null,
    propiedad: 'BucketOwnerEnforced',
    bloqueo: { aclsNuevas: true, aclsCualquiera: true, politicasNuevas: true, politicasCualquiera: true },
    reconoce: false,
    versionado: false,
    etiquetas: [],
    cifrado: 'SSE-S3',
    bucketKey: true,
    intento: false
  };
  let errorNombre = null;
  const errorBloqueo = () => (f.intento && !bloqueoCompleto(f.bloqueo) && !f.reconoce ? 'You must acknowledge that the current settings might result in this bucket and the objects within becoming public.' : null);

  // El error del nombre se revisa con modelo.js mientras escribes (como la consola real).
  const zonaErrorNombre = ui.region(() => (errorNombre ? h('div', { class: 'cx-campo__error', role: 'alert' }, icono('status-negative'), h('span', {}, errorNombre)) : null));
  const revisarNombre = () => {
    errorNombre = null;
    try {
      validarNombreBucket({ buckets: [] }, f.nombre);
    } catch (e) {
      // Solo el formato se revisa al escribir; «ya existe» sale en rojo al crear.
      if (e.codigo === 'InvalidBucketName') errorNombre = e.message;
    }
    zonaErrorNombre.repintar();
  };

  let zonaCopiar = null;
  const general = ui.contenedor({
    titulo: 'General configuration',
    cuerpo: h(
      'div',
      { class: 'cx-form' },
      ui.campo({ etiqueta: 'AWS Region', control: h('div', { class: 'cx-par__valor' }, regionTexto()) }),
      ui.campo({
        etiqueta: 'Bucket type',
        info: 's3-bucket',
        cx,
        control: ui.tarjetas({
          columnas: 2,
          valor: 'general',
          opciones: [
            { valor: 'general', etiqueta: 'General purpose', descripcion: 'Recommended for most use cases and access patterns. General purpose buckets are the original S3 bucket type. They allow a mix of storage classes that redundantly store objects across multiple Availability Zones.' },
            { valor: 'directorio', etiqueta: 'Directory', descripcion: 'Recommended for low-latency use cases. These buckets use only the S3 Express One Zone storage class.', desactivado: true }
          ]
        })
      }),
      ui.campo({
        etiqueta: 'Bucket name',
        info: 's3-bucket',
        cx,
        control: h(
          'div',
          {},
          ui.entrada({
            valor: f.nombre,
            placeholder: 'myawsbucket',
            etiquetaAccesible: 'Bucket name',
            alCambiar: (v) => {
              f.nombre = v;
              if (f.intento || errorNombre) revisarNombre();
            }
          }),
          zonaErrorNombre
        ),
        restriccion: h(
          'span',
          {},
          'Bucket names must be 3 to 63 characters and unique within the global namespace. Bucket names must also begin and end with a letter or number. Valid characters are a-z, 0-9, periods (.), and hyphens (-). ',
          ui.enlace('Learn More', () => cx.ayuda('s3-bucket'))
        )
      }),
      ui.campo({
        etiqueta: 'Copy settings from existing bucket',
        opcional: true,
        descripcion: 'Only the bucket settings in the following configuration are copied.',
        control: (zonaCopiar = ui.region(() =>
          h(
            'div',
            { class: 'cx-fila-campos' },
            h('span', { class: 'cx-texto-sec' }, f.copiadoDe ? `Format: s3://bucket/prefix · Copied from ${f.copiadoDe}` : 'Format: s3://bucket/prefix'),
            ui.boton('Choose bucket', { desactivado: !cx.estado.buckets.length, alClic: () => elegirBucketACopiar(cx, f, () => (formulario.repintar(), zonaCopiar.repintar())) })
          )
        ))
      })
    )
  });

  const formulario = ui.region(() => [
    ui.contenedor({
      titulo: 'Object Ownership',
      info: 's3-propiedad',
      cx,
      descripcion: 'Control ownership of objects written to this bucket from other AWS accounts and the use of access control lists (ACLs). Object ownership determines who can specify access to objects.',
      cuerpo: [
        ui.tarjetas({
          columnas: 2,
          valor: f.propiedad === 'BucketOwnerEnforced' ? 'off' : 'on',
          alCambiar: (v) => {
            f.propiedad = v === 'off' ? 'BucketOwnerEnforced' : 'BucketOwnerPreferred';
            formulario.repintar();
          },
          opciones: [
            { valor: 'off', etiqueta: 'ACLs disabled (recommended)', descripcion: 'All objects in this bucket are owned by this account. Access to this bucket and its objects is specified using only policies.' },
            { valor: 'on', etiqueta: 'ACLs enabled', descripcion: 'Objects in this bucket can be owned by other AWS accounts. Access to this bucket and its objects can be specified using ACLs.' }
          ]
        }),
        f.propiedad === 'BucketOwnerEnforced'
          ? h('div', { style: { marginTop: '12px' } }, ui.pares([{ etiqueta: 'Object Ownership', valor: 'Bucket owner enforced' }], { columnas: 1 }))
          : h(
              'div',
              { style: { marginTop: '12px' } },
              ui.alerta({ tipo: 'aviso', contenido: 'We recommend disabling ACLs, unless you need to control access for each object individually or to have the object writer own the data they upload.' }),
              ui.campo({
                etiqueta: 'Object Ownership',
                control: ui.radios({
                  valor: f.propiedad,
                  alCambiar: (v) => (f.propiedad = v),
                  opciones: [
                    { valor: 'BucketOwnerPreferred', etiqueta: 'Bucket owner preferred', descripcion: 'If new objects written to this bucket specify the bucket-owner-full-control canned ACL, they are owned by the bucket owner. Otherwise, they are owned by the object writer.' },
                    { valor: 'ObjectWriter', etiqueta: 'Object writer', descripcion: 'The object writer remains the object owner.' }
                  ]
                })
              })
            )
      ]
    }),
    ui.contenedor({
      titulo: 'Block Public Access settings for this bucket',
      info: 's3-bloqueo',
      cx,
      descripcion:
        'Public access is granted to buckets and objects through access control lists (ACLs), bucket policies, access point policies, or all. In order to ensure that public access to this bucket and its objects is blocked, turn on Block all public access. These settings apply only to this bucket and its access points. AWS recommends that you turn on Block all public access, but before applying any of these settings, ensure that your applications will work correctly without public access.',
      cuerpo: editorBloqueo(f, { error: errorBloqueo })
    }),
    ui.contenedor({
      titulo: 'Bucket Versioning',
      info: 's3-versionado',
      cx,
      descripcion: 'Versioning is a means of keeping multiple variants of an object in the same bucket. You can use versioning to preserve, retrieve, and restore every version of every object stored in your Amazon S3 bucket. With versioning, you can easily recover from both unintended user actions and application failures.',
      cuerpo: ui.campo({
        etiqueta: 'Bucket Versioning',
        control: ui.radios({
          valor: f.versionado ? 'on' : 'off',
          alCambiar: (v) => (f.versionado = v === 'on'),
          opciones: [
            { valor: 'off', etiqueta: 'Disable' },
            { valor: 'on', etiqueta: 'Enable' }
          ]
        })
      })
    }),
    ui.contenedor({
      titulo: 'Tags',
      contador: undefined,
      descripcion: 'You can use bucket tags to track storage costs and organize buckets.',
      cuerpo: ui.editorEtiquetas({ filas: f.etiquetas })
    }),
    ui.contenedor({
      titulo: 'Default encryption',
      info: 's3-cifrado',
      cx,
      descripcion: 'Server-side encryption is automatically applied to new objects stored in this bucket.',
      cuerpo: camposCifrado(f, () => formulario.repintar())
    }),
    ui.expandible({
      titulo: 'Advanced settings',
      fuerte: true,
      contenido: ui.contenedor({
        titulo: 'Object Lock',
        descripcion: 'Store objects using a write-once-read-many (WORM) model to help you prevent objects from being deleted or overwritten for a fixed amount of time or indefinitely. Object Lock works only in versioned buckets.',
        cuerpo: ui.radios({
          valor: 'off',
          opciones: [
            { valor: 'off', etiqueta: 'Disable' },
            { valor: 'on', etiqueta: 'Enable', descripcion: 'Permanently allows objects in this bucket to be locked. Additional Object Lock configuration is required in bucket details after bucket creation to protect objects in this bucket from being deleted or overwritten.', desactivado: true }
          ]
        })
      })
    })
  ], { clase: 'cx-pagina' });

  function enviar() {
    f.intento = true;
    revisarNombre();
    formulario.repintar();
    // Como la consola real: lleva al primer campo con error.
    if (errorNombre) return zonaErrorNombre.scrollIntoView({ block: 'center' });
    if (errorBloqueo()) return formulario.querySelector('.cx-alerta--aviso .cx-campo__error')?.scrollIntoView({ block: 'center' });
    const etiquetas = f.etiquetas.filter((e) => e.llave.trim()).map((e) => ({ llave: e.llave.trim(), valor: e.valor }));
    const r = cx.hacer({ servicio: 'S3', accion: 'CreateBucket', error: 'Failed to create bucket' }, (e) =>
      crearBucket(e, {
        nombre: f.nombre,
        propiedadObjetos: f.propiedad,
        bloqueoPublico: { ...f.bloqueo },
        versionado: f.versionado,
        cifrado: f.cifrado,
        bucketKey: f.cifrado === 'DSSE-KMS' ? false : f.bucketKey,
        etiquetas
      })
    );
    if (r.ok) {
      const n = r.valor.nombre;
      cx.flash({
        tipo: 'exito',
        titulo: `Successfully created bucket "${n}"`,
        texto: 'To upload files and folders, or to configure additional bucket settings, choose View details.',
        accion: { texto: 'View details', alClic: () => cx.ir(ruta(n)) }
      });
      cx.ir('s3/buckets');
    }
  }

  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Create bucket', info: 's3-bucket', cx, descripcion: 'Buckets are containers for data stored in S3.' }),
    general,
    formulario,
    ui.alerta({ tipo: 'info', contenido: 'After creating the bucket, you can upload files and folders to the bucket, and configure additional bucket settings.' }),
    ui.pieFormulario({ cancelar: () => cx.ir('s3/buckets'), enviar, textoEnviar: 'Create bucket' })
  );
}

/** «Encryption type» y «Bucket Key» (los usa Create bucket y Edit default encryption). */
function camposCifrado(f, repintar) {
  return h(
    'div',
    { class: 'cx-form' },
    ui.campo({
      etiqueta: 'Encryption type',
      info: 's3-cifrado',
      control: ui.radios({
        valor: f.cifrado,
        alCambiar: (v) => {
          f.cifrado = v;
          repintar();
        },
        opciones: [
          { valor: 'SSE-S3', etiqueta: 'Server-side encryption with Amazon S3 managed keys (SSE-S3)' },
          { valor: 'SSE-KMS', etiqueta: 'Server-side encryption with AWS Key Management Service keys (SSE-KMS)' },
          { valor: 'DSSE-KMS', etiqueta: 'Dual-layer server-side encryption with AWS Key Management Service keys (DSSE-KMS)', descripcion: 'Secure your objects with two separate layers of encryption. For details on pricing, see DSSE-KMS pricing on the Storage tab of the Amazon S3 pricing page.' }
        ]
      })
    }),
    f.cifrado !== 'SSE-S3'
      ? ui.campo({
          etiqueta: 'AWS KMS key',
          descripcion: 'Choose from your AWS KMS keys',
          control: ui.selector({ opciones: [{ valor: 'aws/s3', etiqueta: 'aws/s3', descripcion: 'AWS managed key' }], valor: 'aws/s3' })
        })
      : null,
    ui.campo({
      etiqueta: 'Bucket Key',
      descripcion: 'Using an S3 Bucket Key for SSE-KMS reduces encryption costs by lowering calls to AWS KMS. S3 Bucket Keys aren’t supported for DSSE-KMS.',
      control:
        f.cifrado === 'DSSE-KMS'
          ? h('span', { class: 'cx-texto-sec' }, 'S3 Bucket Keys aren’t supported for DSSE-KMS.')
          : ui.radios({
              valor: f.bucketKey ? 'on' : 'off',
              alCambiar: (v) => (f.bucketKey = v === 'on'),
              opciones: [
                { valor: 'off', etiqueta: 'Disable' },
                { valor: 'on', etiqueta: 'Enable' }
              ]
            })
    })
  );
}

/** «Copy settings from existing bucket»: elige un bucket y copia su configuración. */
function elegirBucketACopiar(cx, f, repintar) {
  let elegido = null;
  const t = ui.tabla(cx, {
    titulo: 'Buckets',
    variante: 'simple',
    filas: () => cx.estado.buckets,
    clave: (b) => b.nombre,
    seleccion: 'unica',
    filtro: 'Find buckets by name',
    columnas: [
      { titulo: 'Name', valor: (b) => b.nombre },
      { titulo: 'Creation date', valor: (b) => fechaS3(b.creado) }
    ],
    alSeleccionar: (ids) => {
      elegido = ids[0];
      boton.disabled = !elegido;
    }
  });
  const boton = ui.boton('Choose bucket', {
    variante: 'primario',
    escribe: false,
    desactivado: true,
    alClic: () => {
      const b = bucketDe(cx.estado, elegido);
      if (b) {
        f.copiadoDe = b.nombre;
        f.propiedad = b.propiedadObjetos;
        f.bloqueo = { ...b.bloqueoPublico };
        f.versionado = b.versionado === 'Enabled';
        f.cifrado = b.cifrado.tipo;
        f.bucketKey = b.cifrado.bucketKey;
        f.etiquetas.splice(0, f.etiquetas.length, ...b.etiquetas.map((e) => ({ ...e })));
      }
      m.cerrar();
      repintar();
    }
  });
  const m = cx.modal({ titulo: 'Choose bucket', ancho: 'grande', contenido: t, pie: [ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }), boton] });
}

/* ============================================================ detalle */

function detalleBucket(cx, { nombre }) {
  const b = bucketDe(cx.estado, nombre);
  if (!b) return sinBucket(cx, nombre);
  cx.migas([{ texto: 'Amazon S3', ruta: 's3' }, { texto: 'Buckets', ruta: 's3/buckets' }, { texto: nombre }]);
  const activa = cx.memoria.s3Pestana?.[nombre] ?? 'objetos';
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: nombre, info: 's3-bucket', cx }),
    ui.pestanas({
      activa,
      alCambiar: (id) => recordarPestana(cx, nombre, id),
      pestanas: [
        { id: 'objetos', texto: 'Objects', contenido: () => pestanaObjetos(cx, b) },
        { id: 'metadatos', texto: 'Metadata', desactivada: true, contenido: () => null },
        { id: 'propiedades', texto: 'Properties', contenido: () => pestanaPropiedades(cx, b) },
        { id: 'permisos', texto: 'Permissions', contenido: () => pestanaPermisos(cx, b) },
        { id: 'metricas', texto: 'Metrics', desactivada: true, contenido: () => null },
        { id: 'administracion', texto: 'Management', contenido: () => pestanaAdministracion(cx, b) },
        { id: 'puntos', texto: 'Access Points', desactivada: true, contenido: () => null }
      ]
    })
  );
}

/* ------------------------------------------------------------ Objects */

const prefijoActual = (cx, nombre) => (cx.memoria.s3Prefijo?.bucket === nombre ? cx.memoria.s3Prefijo.prefijo : '');
function irAPrefijo(cx, nombre, prefijo) {
  cx.memoria.s3Prefijo = { bucket: nombre, prefijo };
  irABucket(cx, nombre, 'objetos');
}

function pestanaObjetos(cx, b) {
  const nombre = b.nombre;
  const prefijo = prefijoActual(cx, nombre);
  let versiones = Boolean(cx.memoria.s3Versiones);
  const bucket = () => bucketDe(cx.estado, nombre) ?? b;

  // Migas internas: bucket / carpeta / subcarpeta /
  const partes = prefijo.split('/').filter(Boolean);
  const migasCarpeta = prefijo
    ? h(
        'div',
        { class: 'cx-s3-ruta' },
        ui.enlace(nombre, () => irAPrefijo(cx, nombre, '')),
        partes.map((p, i) => [' / ', i === partes.length - 1 ? h('b', {}, p) : ui.enlace(p, () => irAPrefijo(cx, nombre, `${partes.slice(0, i + 1).join('/')}/`))]),
        ' /'
      )
    : null;

  const filasVersiones = () =>
    bucket()
      .objetos.filter((o) => o.llave.startsWith(prefijo))
      .map((o, i) => ({ tipo: 'version', llave: `${o.llave}#${o.versionId}#${i}`, nombre: o.llave.slice(prefijo.length) || o.llave, objeto: o }));

  const t = ui.tabla(cx, {
    titulo: 'Objects',
    info: 's3-objeto',
    variante: 'contenedor',
    descripcion: 'Objects are the fundamental entities stored in Amazon S3. You can use Amazon S3 inventory to get a list of all objects in your bucket. For others to access your objects, you’ll need to explicitly grant them permissions.',
    filas: () => (versiones ? filasVersiones() : listado(bucket(), prefijo)),
    clave: (f) => f.llave,
    seleccion: 'multiple',
    filtro: 'Find objects by prefix',
    antesDelFiltro:
      bucket().versionado !== 'Disabled' || bucket().objetos.some((o) => o.versionId !== 'null')
        ? h(
            'span',
            { class: 'cx-s3-versiones' },
            ui.interruptor({
              etiqueta: 'Show versions',
              marcada: versiones,
              alCambiar: (v) => {
                cx.memoria.s3Versiones = v;
                irABucket(cx, nombre, 'objetos');
              }
            })
          )
        : null,
    columnas: [
      {
        titulo: 'Name',
        valor: (f) =>
          f.tipo === 'carpeta'
            ? h('span', { class: 'cx-s3-nombre' }, ui.enlace(f.nombre, () => irAPrefijo(cx, nombre, f.llave)))
            : h('span', { class: 'cx-s3-nombre' }, icono('file'), f.tipo === 'version' && f.objeto.marcadorBorrado ? h('span', {}, f.nombre) : ui.enlace(f.nombre, ruta(nombre, `objeto/${encodeURIComponent(f.objeto.llave)}`), { cx })),
        texto: (f) => f.nombre
      },
      ...(versiones
        ? [
            { titulo: 'Type', valor: (f) => (f.objeto.marcadorBorrado ? 'Delete marker' : tipoArchivo(f.nombre)) },
            { titulo: 'Version ID', valor: (f) => h('span', {}, f.objeto.versionId, f.objeto.actual ? h('span', { class: 'cx-texto-sec' }, ' (Current version)') : null) },
            { titulo: 'Last modified', valor: (f) => fechaS3(f.objeto.modificado) },
            { titulo: 'Size', valor: (f) => (f.objeto.marcadorBorrado ? '–' : tamano(f.objeto.tamano)) },
            { titulo: 'Storage class', valor: (f) => (f.objeto.marcadorBorrado ? '–' : nombreClase(f.objeto.clase)) }
          ]
        : [
            { titulo: 'Type', valor: (f) => (f.tipo === 'carpeta' ? 'Folder' : tipoArchivo(f.nombre)) },
            { titulo: 'Last modified', valor: (f) => (f.tipo === 'carpeta' ? '–' : fechaS3(f.objeto.modificado)) },
            { titulo: 'Size', valor: (f) => (f.tipo === 'carpeta' ? '–' : tamano(f.objeto.tamano)) },
            { titulo: 'Storage class', valor: (f) => (f.tipo === 'carpeta' ? '–' : nombreClase(f.objeto.clase)) }
          ])
    ],
    acciones: (sel) => [
      ui.boton('Copy S3 URI', { icono: 'copy', desactivado: sel.length !== 1, alClic: () => cx.flash({ tipo: 'exito', texto: `Copied S3 URI: s3://${nombre}/${sel[0].objeto?.llave ?? sel[0].llave}` }) }),
      ui.boton('Download', { icono: 'download', desactivado: true }),
      ui.boton('Open', { icono: 'external', desactivado: true }),
      ui.boton('Delete', {
        escribe: true,
        desactivado: !sel.length || versiones,
        titulo: versiones ? 'Turn off Show versions to delete objects' : undefined,
        alClic: () => borrarObjetos(cx, nombre, sel)
      }),
      ui.menuBoton('Actions', [
        { texto: 'Copy', desactivado: true },
        { texto: 'Move', desactivado: true },
        { texto: 'Rename object', desactivado: true },
        { texto: 'Edit storage class', desactivado: true },
        { texto: 'Edit server-side encryption', desactivado: true }
      ]),
      ui.boton('Create folder', { escribe: true, alClic: () => modalCarpeta(cx, nombre, prefijo) }),
      ui.boton('Upload', { variante: 'primario', icono: 'upload', alClic: () => cx.ir(ruta(nombre, 'subir')) })
    ],
    vacio: {
      titulo: 'No objects',
      texto: 'You don’t have any objects in this bucket.',
      accion: ui.boton('Upload', { icono: 'upload', escribe: true, alClic: () => cx.ir(ruta(nombre, 'subir')) })
    }
  });
  return h('div', { class: 'cx-pagina' }, migasCarpeta, t);
}

function tipoArchivo(nombre) {
  const i = nombre.lastIndexOf('.');
  return i > 0 ? nombre.slice(i + 1).toLowerCase() : '–';
}

/** «Delete objects»: con versionado se crean marcadores; sin él, se borran para siempre. */
function borrarObjetos(cx, nombre, sel) {
  const b = bucketDe(cx.estado, nombre);
  if (!b) return;
  const llaves = new Set();
  for (const f of sel) {
    if (f.tipo === 'carpeta') for (const o of actuales(b)) if (o.llave.startsWith(f.llave)) llaves.add(o.llave);
    if (f.tipo === 'objeto') llaves.add(f.llave);
  }
  const lista = [...llaves];
  const versionado = b.versionado !== 'Disabled';
  cx.confirmar({
    titulo: 'Delete objects',
    palabra: versionado ? 'delete' : 'permanently delete',
    textoBoton: 'Delete objects',
    ancho: 'grande',
    contenido: [
      versionado
        ? ui.alerta({ tipo: 'info', titulo: 'Bucket Versioning is enabled', contenido: 'Deleting the specified objects adds delete markers to them. If you need to undo the delete action, you can delete the delete markers.' })
        : ui.alerta({ tipo: 'aviso', titulo: 'Deleting the specified objects can’t be undone.', contenido: 'Bucket Versioning is disabled: the objects will be permanently deleted.' }),
      h('p', { style: { marginTop: '12px' } }, `Specified objects (${lista.length}):`),
      h('ul', { class: 'cx-s3-lista' }, lista.slice(0, 20).map((l) => h('li', { class: 'cx-mono' }, l)), lista.length > 20 ? h('li', {}, `… and ${lista.length - 20} more`) : null)
    ],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'S3', accion: 'DeleteObjects', error: 'Failed to delete objects' }, (e) => eliminarObjetos(e, nombre, lista));
      if (r.ok) {
        cx.flash({ tipo: 'exito', titulo: 'Successfully deleted objects', texto: lista.length === 1 ? `1 object ${versionado ? 'now has a delete marker' : 'was permanently deleted'}.` : `${lista.length} objects ${versionado ? 'now have delete markers' : 'were permanently deleted'}.` });
        irABucket(cx, nombre, 'objetos');
      }
      return true;
    }
  });
}

/** «Create folder» (modal). Dentro de una carpeta, crea la subcarpeta con el prefijo actual. */
function modalCarpeta(cx, nombre, prefijo) {
  let carpeta = '';
  const crear = () => {
    const r = cx.hacer({ servicio: 'S3', accion: 'PutObject', error: 'Failed to create folder' }, (e) => {
      if (!prefijo) return crearCarpeta(e, nombre, carpeta);
      // crearCarpeta no recibe prefijo: misma validación y subimos el marcador «prefijo/carpeta/».
      const n = String(carpeta ?? '').trim().replace(/\/+$/, '');
      if (!n || n.includes('/')) crearCarpeta(e, nombre, n); // lanza el error de modelo.js
      return subirObjetos(e, nombre, [{ llave: `${n}/`, tamano: 0, tipo: '' }], { prefijo })[0];
    });
    if (r.ok) {
      m.cerrar();
      cx.flash({ tipo: 'exito', texto: `Successfully created folder "${carpeta.trim().replace(/\/+$/, '')}".` });
      irABucket(cx, nombre, 'objetos');
    }
  };
  const m = cx.modal({
    titulo: 'Create folder',
    contenido: [
      h('p', { class: 'cx-texto-sec' }, 'Use folders to group objects in buckets. When you create a folder, S3 creates an object using the name that you specify followed by a slash (/). This object then appears as a folder on the console.'),
      ui.campo({
        etiqueta: 'Folder name',
        control: ui.entrada({ placeholder: 'fotos', alCambiar: (v) => (carpeta = v), alEnter: crear }),
        restriccion: 'Folder names can’t contain "/".'
      }),
      h('p', { class: 'cx-texto-sec', style: { marginTop: '8px' } }, `Destination: s3://${nombre}/${prefijo}`)
    ],
    pie: [ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }), ui.boton('Create folder', { variante: 'primario', alClic: crear })]
  });
}

/* ------------------------------------------------------------ objeto */

function detalleObjeto(cx, { nombre, llave }) {
  const b = bucketDe(cx.estado, nombre);
  if (!b) return sinBucket(cx, nombre);
  const o = actuales(b).find((x) => x.llave === llave) ?? b.objetos.find((x) => x.llave === llave);
  cx.migas([{ texto: 'Amazon S3', ruta: 's3' }, { texto: 'Buckets', ruta: 's3/buckets' }, { texto: nombre, ruta: ruta(nombre) }, { texto: llave.split('/').filter(Boolean).pop() ?? llave }]);
  if (!o) return h('div', { class: 'cx-pagina' }, ui.alerta({ tipo: 'error', titulo: 'Object not found', contenido: `The object ${llave} does not exist.` }));
  const url = `https://${nombre}.s3.${REGION.codigo}.amazonaws.com/${llave}`;
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: llave.split('/').filter(Boolean).pop() ?? llave, info: 's3-objeto', cx, acciones: [ui.boton('Copy S3 URI', { icono: 'copy', alClic: () => cx.flash({ tipo: 'exito', texto: `Copied S3 URI: s3://${nombre}/${llave}` }) }), ui.boton('Download', { desactivado: true }), ui.boton('Open', { desactivado: true })] }),
    ui.contenedor({
      titulo: 'Object overview',
      cuerpo: ui.pares(
        [
          { etiqueta: 'Owner', valor: cx.estado.cuenta.id },
          { etiqueta: 'AWS Region', valor: regionTexto() },
          { etiqueta: 'Last modified', valor: fechaS3(o.modificado) },
          { etiqueta: 'Size', valor: tamano(o.tamano) },
          { etiqueta: 'Type', valor: tipoArchivo(llave) },
          { etiqueta: 'Key', valor: ui.copiable(llave) },
          { etiqueta: 'S3 URI', valor: ui.copiable(`s3://${nombre}/${llave}`) },
          { etiqueta: 'Amazon Resource Name (ARN)', valor: ui.copiable(`arn:aws:s3:::${nombre}/${llave}`) },
          { etiqueta: 'Object URL', valor: ui.copiable(url) },
          { etiqueta: 'Version ID', valor: o.versionId },
          { etiqueta: 'Storage class', valor: nombreClase(o.clase), info: 's3-clases' },
          { etiqueta: 'Server-side encryption', valor: b.cifrado.tipo }
        ],
        { columnas: 3, cx }
      )
    }),
    b.bloqueoPublico.aclsCualquiera || b.bloqueoPublico.politicasCualquiera
      ? ui.alerta({ tipo: 'info', contenido: 'Este objeto no se puede abrir desde internet con su Object URL: el bucket bloquea el acceso público. Eso es lo que quieres para archivos privados.' })
      : null
  );
}

/* ------------------------------------------------------------ Upload */

const EJEMPLOS = [
  { llave: 'menu.pdf', tamano: 250880, tipo: 'application/pdf' },
  { llave: 'index.html', tamano: 2150, tipo: 'text/html' },
  { llave: 'error.html', tamano: 980, tipo: 'text/html' },
  { llave: 'logo.png', tamano: 48230, tipo: 'image/png' },
  { llave: 'cafe-de-olla.jpg', tamano: 1310720, tipo: 'image/jpeg' },
  { llave: 'precios-2026.xlsx', tamano: 35840, tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { llave: 'factura-A-0001.xml', tamano: 6144, tipo: 'application/xml' },
  { llave: 'expediente-firulais.pdf', tamano: 184320, tipo: 'application/pdf' },
  { llave: 'respaldo-ventas.zip', tamano: 10485760, tipo: 'application/zip' },
  { llave: 'video-promocional.mp4', tamano: 52428800, tipo: 'video/mp4' }
];

function tipoPorNombre(n) {
  const ext = tipoArchivo(n);
  return { pdf: 'application/pdf', html: 'text/html', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', txt: 'text/plain', csv: 'text/csv', xml: 'application/xml', zip: 'application/zip', mp4: 'video/mp4', json: 'application/json' }[ext] ?? 'binary/octet-stream';
}

function subir(cx, { nombre }) {
  const b = bucketDe(cx.estado, nombre);
  if (!b) return sinBucket(cx, nombre);
  const prefijo = prefijoActual(cx, nombre);
  cx.migas([{ texto: 'Amazon S3', ruta: 's3' }, { texto: 'Buckets', ruta: 's3/buckets' }, { texto: nombre, ruta: ruta(nombre) }, { texto: 'Upload' }]);
  const archivos = [];
  let clase = 'STANDARD';
  let errorVacio = false;

  const tabla = ui.tabla(cx, {
    titulo: 'Files and folders',
    variante: 'contenedor',
    descripcion: 'All files and folders in this table will be uploaded.',
    filas: () => archivos,
    clave: (a) => a.llave,
    seleccion: 'multiple',
    filtro: 'Find by name',
    contador: false,
    columnas: [
      { titulo: 'Name', valor: (a) => a.llave },
      { titulo: 'Folder', valor: () => (prefijo ? prefijo : '–') },
      { titulo: 'Type', valor: (a) => a.tipo || '–' },
      { titulo: 'Size', valor: (a) => tamano(a.tamano) }
    ],
    acciones: (sel) => [
      ui.boton('Remove', {
        desactivado: !sel.length,
        alClic: () => {
          for (const a of sel) archivos.splice(archivos.indexOf(a), 1);
          tabla.seleccionar([]);
          totales.repintar();
        }
      }),
      ui.boton('Add files', { escribe: true, alClic: () => agregarArchivos(cx, archivos, () => (tabla.actualizar(true), totales.repintar(), (errorVacio = false), avisoVacio.repintar())) }),
      ui.boton('Add folder', { desactivado: true, titulo: 'No disponible en este simulador' })
    ],
    vacio: { titulo: 'No files or folders', texto: 'You have not chosen any files or folders to upload.' }
  });
  const totales = ui.region(() => h('p', { class: 'cx-texto-sec' }, `${archivos.length} Total, ${tamano(archivos.reduce((s, a) => s + a.tamano, 0))}`));
  const avisoVacio = ui.region(() => (errorVacio ? ui.alerta({ tipo: 'error', contenido: 'Add at least one file to upload.' }) : null));

  const filasClase = ui.region(() =>
    h('div', { class: 'cx-tabla__desliza' }, h(
      'table',
      { class: 'cx-tabla__tabla cx-s3-clases' },
      h('thead', {}, h('tr', {}, ['', 'Storage class', 'Designed for', 'Availability Zones', 'Min storage duration', 'Retrieval fees'].map((t) => h('th', {}, h('span', { class: 'cx-tabla__orden' }, t))))),
      h(
        'tbody',
        {},
        CLASES_S3.map((c) =>
          h(
            'tr',
            { class: ['cx-fila--elegible', c.clase === clase && 'cx-fila--elegida'], onclick: () => ((clase = c.clase), filasClase.repintar()) },
            h('td', { class: 'cx-tabla__sel' }, h('input', { type: 'radio', name: 's3-clase-subida', checked: c.clase === clase, 'aria-label': c.nombre, onchange: () => ((clase = c.clase), filasClase.repintar()) })),
            h('td', {}, c.nombre),
            h('td', {}, INFO_CLASE[c.clase].uso),
            h('td', {}, INFO_CLASE[c.clase].azs),
            h('td', {}, INFO_CLASE[c.clase].minimo.replace(' minimum storage duration', '').replace('No minimum storage duration', '-')),
            h('td', {}, INFO_CLASE[c.clase].recuperar)
          )
        )
      )
    ))
  );

  function enviar() {
    if (!archivos.length) {
      errorVacio = true;
      avisoVacio.repintar();
      return;
    }
    const r = cx.hacer({ servicio: 'S3', accion: 'PutObject', error: 'Upload failed' }, (e) => subirObjetos(e, nombre, archivos.map((a) => ({ ...a })), { clase, prefijo }));
    if (r.ok) {
      cx.memoria.s3Subida = { bucket: nombre, prefijo, clase, archivos: r.valor.map((o) => ({ llave: o.llave, tamano: o.tamano, tipo: o.tipo })) };
      cx.ir(ruta(nombre, 'subida'));
    }
  }

  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Upload', info: 's3-objeto', cx, descripcion: 'Add the files and folders you want to upload to S3. To upload a file larger than 160GB, use the AWS CLI, AWS SDK or Amazon S3 REST API.' }),
    ui.alerta({ tipo: 'info', contenido: 'Simulador: no se suben archivos de verdad. Con «Add files» eliges archivos de ejemplo o escribes el nombre y el tamaño de uno.' }),
    h('div', {}, tabla, totales),
    avisoVacio,
    ui.contenedor({ titulo: 'Destination', cuerpo: ui.pares([{ etiqueta: 'Destination', valor: `s3://${nombre}/${prefijo}` }, { etiqueta: 'Bucket Versioning', valor: b.versionado }], { columnas: 2 }) }),
    ui.expandible({ titulo: 'Permissions', descripcion: 'Grant public access and access to other AWS accounts.', fuerte: true, contenido: h('p', { class: 'cx-texto-sec' }, 'This bucket has the bucket owner enforced setting applied for Object Ownership. Use bucket policies to control access.') }),
    ui.expandible({
      titulo: 'Properties',
      descripcion: 'Specify storage class, encryption settings, tags, and more.',
      fuerte: true,
      abierto: true,
      contenido: ui.contenedor({
        titulo: 'Storage class',
        info: 's3-clases',
        cx,
        descripcion: 'Amazon S3 offers a range of storage classes designed for different use cases.',
        sinRelleno: true,
        cuerpo: filasClase
      })
    }),
    ui.pieFormulario({ cancelar: () => irABucket(cx, nombre, 'objetos'), enviar, textoEnviar: 'Upload' })
  );
}

/** El diálogo «Add files»: archivos de ejemplo o uno escrito a mano (nombre y tamaño en KB). */
function agregarArchivos(cx, archivos, listo) {
  const elegidos = new Set();
  const propio = { llave: '', kb: '' };
  let error = null;
  const zonaError = ui.region(() => (error ? h('div', { class: 'cx-campo__error', role: 'alert' }, icono('status-negative'), h('span', {}, error)) : null));
  const agregar = () => {
    const nuevos = EJEMPLOS.filter((e) => elegidos.has(e.llave)).map((e) => ({ ...e }));
    if (propio.llave.trim()) {
      const kb = Number(propio.kb);
      if (!Number.isFinite(kb) || kb < 0 || propio.kb === '') {
        error = 'Escribe el tamaño en KB (un número, por ejemplo 120).';
        zonaError.repintar();
        return;
      }
      const llave = propio.llave.trim();
      nuevos.push({ llave, tamano: Math.round(kb * 1024), tipo: tipoPorNombre(llave) });
    }
    if (!nuevos.length) {
      error = 'Elige al menos un archivo de la lista o escribe uno.';
      zonaError.repintar();
      return;
    }
    for (const n of nuevos) {
      const i = archivos.findIndex((a) => a.llave === n.llave);
      if (i >= 0) archivos.splice(i, 1, n);
      else archivos.push(n);
    }
    m.cerrar();
    listo();
  };
  const m = cx.modal({
    titulo: 'Add files',
    ancho: 'grande',
    contenido: [
      h('p', { class: 'cx-texto-sec' }, 'Simulador: así se vería el explorador de archivos de tu computadora. Marca los que quieras subir.'),
      h(
        'div',
        { class: 'cx-s3-ejemplos' },
        EJEMPLOS.map((e) =>
          ui.casilla({
            etiqueta: e.llave,
            descripcion: tamano(e.tamano),
            alCambiar: (v) => (v ? elegidos.add(e.llave) : elegidos.delete(e.llave))
          })
        )
      ),
      h('div', { class: 'cx-bloque', style: { marginTop: '16px' } },
        h('div', { class: 'cx-bloque__titulo' }, 'Otro archivo'),
        h(
          'div',
          { class: 'cx-fila-campos' },
          ui.campo({ etiqueta: 'File name', control: ui.entrada({ placeholder: 'fotos/terraza.jpg', alCambiar: (v) => (propio.llave = v) }) }),
          ui.campo({ etiqueta: 'Size (KB)', control: ui.entrada({ tipo: 'number', placeholder: '120', min: 0, alCambiar: (v) => (propio.kb = v) }) })
        )
      ),
      zonaError
    ],
    pie: [ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }), ui.boton('Add files', { variante: 'primario', escribe: false, alClic: agregar })]
  });
}

/** «Upload: status» → «Upload succeeded». */
function subida(cx, { nombre }) {
  const s = cx.memoria.s3Subida;
  cx.migas([{ texto: 'Amazon S3', ruta: 's3' }, { texto: 'Buckets', ruta: 's3/buckets' }, { texto: nombre, ruta: ruta(nombre) }, { texto: 'Upload: status' }]);
  if (!s || s.bucket !== nombre) return h('div', { class: 'cx-pagina' }, ui.alerta({ tipo: 'info', contenido: 'There is no upload in progress.' }), ui.boton('Close', { alClic: () => irABucket(cx, nombre, 'objetos') }));
  const total = s.archivos.reduce((a, x) => a + x.tamano, 0);
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.alerta({ tipo: 'exito', titulo: 'Upload succeeded', contenido: 'View details below.' }),
    ui.encabezado({ titulo: 'Upload: status', acciones: [ui.boton('Close', { alClic: () => irABucket(cx, nombre, 'objetos') })] }),
    ui.alerta({ tipo: 'info', contenido: 'The information below will no longer be available after you navigate away from this page.' }),
    ui.contenedor({
      titulo: 'Summary',
      cuerpo: ui.pares(
        [
          { etiqueta: 'Destination', valor: ui.enlace(`s3://${nombre}/${s.prefijo}`, () => irABucket(cx, nombre, 'objetos')) },
          { etiqueta: 'Succeeded', valor: ui.estado('exito', `${s.archivos.length} file${s.archivos.length === 1 ? '' : 's'}, ${tamano(total)} (100.00%)`) },
          { etiqueta: 'Failed', valor: ui.estado('error', '0 files, 0 B (0%)') }
        ],
        { columnas: 3 }
      )
    }),
    ui.pestanas({
      pestanas: [
        {
          id: 'archivos',
          texto: 'Files and folders',
          contenido: () =>
            ui.tabla(cx, {
              titulo: 'Files and folders',
              variante: 'contenedor',
              filas: () => s.archivos,
              clave: (a) => a.llave,
              filtro: 'Find by name',
              columnas: [
                { titulo: 'Name', valor: (a) => a.llave.slice(s.prefijo.length) },
                { titulo: 'Folder', valor: () => s.prefijo || '–' },
                { titulo: 'Type', valor: (a) => a.tipo || '–' },
                { titulo: 'Size', valor: (a) => tamano(a.tamano) },
                { titulo: 'Status', valor: () => ui.estado('exito', 'Succeeded') }
              ]
            })
        },
        {
          id: 'config',
          texto: 'Configuration',
          contenido: () => ui.contenedor({ titulo: 'Configuration', cuerpo: ui.pares([{ etiqueta: 'Storage class', valor: nombreClase(s.clase) }, { etiqueta: 'Server-side encryption', valor: 'Bucket default' }], { columnas: 2 }) })
        }
      ]
    })
  );
}

/* ------------------------------------------------------------ Properties */

function pestanaPropiedades(cx, b) {
  const n = b.nombre;
  const editar = (r) => ui.boton('Edit', { escribe: true, alClic: () => cx.ir(ruta(n, r)) });
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.contenedor({
      titulo: 'Bucket overview',
      cuerpo: ui.pares(
        [
          { etiqueta: 'AWS Region', valor: regionTexto() },
          { etiqueta: 'Amazon Resource Name (ARN)', valor: ui.copiable(arnBucket(n)) },
          { etiqueta: 'Creation date', valor: fechaS3(b.creado) }
        ],
        { columnas: 3 }
      )
    }),
    ui.contenedor({
      titulo: 'Bucket Versioning',
      info: 's3-versionado',
      cx,
      acciones: editar('versionado'),
      descripcion: 'Versioning is a means of keeping multiple variants of an object in the same bucket. You can use versioning to preserve, retrieve, and restore every version of every object stored in your Amazon S3 bucket.',
      cuerpo: ui.pares(
        [
          { etiqueta: 'Bucket Versioning', valor: b.versionado === 'Enabled' ? ui.estado('exito', 'Enabled') : b.versionado },
          { etiqueta: 'Multi-factor authentication (MFA) delete', valor: 'Disabled' }
        ],
        { columnas: 2 }
      )
    }),
    ui.contenedor({
      titulo: 'Tags',
      contador: b.etiquetas.length,
      acciones: ui.boton('Edit', { desactivado: true, titulo: 'No disponible en este simulador' }),
      descripcion: 'You can use bucket tags to track storage costs and organize buckets.',
      sinRelleno: b.etiquetas.length > 0,
      cuerpo: b.etiquetas.length
        ? h(
            'table',
            { class: 'cx-tabla__tabla' },
            h('thead', {}, h('tr', {}, h('th', {}, h('span', { class: 'cx-tabla__orden' }, 'Key')), h('th', {}, h('span', { class: 'cx-tabla__orden' }, 'Value')))),
            h('tbody', {}, b.etiquetas.map((e) => h('tr', {}, h('td', { style: { paddingLeft: '20px' } }, e.llave), h('td', {}, e.valor || '–'))))
          )
        : h('div', { class: 'cx-tabla__vacia' }, h('b', {}, 'No tags'), h('div', {}, 'There are no tags associated with this resource.'))
    }),
    ui.contenedor({
      titulo: 'Default encryption',
      info: 's3-cifrado',
      cx,
      acciones: editar('cifrado'),
      descripcion: 'Server-side encryption is automatically applied to new objects stored in this bucket.',
      cuerpo: ui.pares(
        [
          { etiqueta: 'Encryption type', valor: TEXTO_CIFRADO[b.cifrado.tipo] },
          { etiqueta: 'Bucket Key', valor: b.cifrado.tipo === 'DSSE-KMS' ? '–' : b.cifrado.bucketKey ? 'Enabled' : 'Disabled' }
        ],
        { columnas: 2 }
      )
    }),
    ui.contenedor({ titulo: 'Server access logging', acciones: ui.boton('Edit', { desactivado: true }), descripcion: 'Log requests for access to your bucket.', cuerpo: ui.pares([{ etiqueta: 'Server access logging', valor: 'Disabled' }], { columnas: 1 }) }),
    ui.contenedor({ titulo: 'Object Lock', descripcion: 'Store objects using a write-once-read-many (WORM) model to help you prevent objects from being deleted or overwritten for a fixed amount of time or indefinitely.', cuerpo: ui.pares([{ etiqueta: 'Object Lock', valor: 'Disabled' }], { columnas: 1 }) }),
    ui.contenedor({
      titulo: 'Static website hosting',
      info: 's3-sitio',
      cx,
      acciones: editar('sitio-web'),
      descripcion: 'Use this bucket to host a website or redirect requests.',
      cuerpo: b.sitioWeb
        ? ui.pares(
            [
              { etiqueta: 'Static website hosting', valor: ui.estado('exito', 'Enabled') },
              { etiqueta: 'Hosting type', valor: 'Bucket hosting' },
              { etiqueta: 'Bucket website endpoint', valor: ui.copiable(`http://${n}.s3-website-${REGION.codigo}.amazonaws.com`) }
            ],
            { columnas: 3 }
          )
        : ui.pares([{ etiqueta: 'Static website hosting', valor: 'Disabled' }], { columnas: 1 })
    })
  );
}

const TEXTO_CIFRADO = {
  'SSE-S3': 'Server-side encryption with Amazon S3 managed keys (SSE-S3)',
  'SSE-KMS': 'Server-side encryption with AWS Key Management Service keys (SSE-KMS)',
  'DSSE-KMS': 'Dual-layer server-side encryption with AWS Key Management Service keys (DSSE-KMS)'
};

/** Página de edición genérica: migas, título, contenedores y pie Cancel / Save changes. */
function paginaEditar(cx, b, { titulo, migaTitulo, pestana, info, contenido, guardar, textoGuardar = 'Save changes' }) {
  cx.migas([{ texto: 'Amazon S3', ruta: 's3' }, { texto: 'Buckets', ruta: 's3/buckets' }, { texto: b.nombre, ruta: ruta(b.nombre) }, { texto: migaTitulo ?? titulo }]);
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo, info, cx }),
    contenido,
    ui.pieFormulario({ cancelar: () => irABucket(cx, b.nombre, pestana), enviar: guardar, textoEnviar: textoGuardar })
  );
}

function editarVersionadoPagina(cx, { nombre }) {
  const b = bucketDe(cx.estado, nombre);
  if (!b) return sinBucket(cx, nombre);
  let valor = b.versionado === 'Enabled' ? 'on' : 'off';
  const zona = ui.region(() => [
    ui.campo({
      etiqueta: 'Bucket Versioning',
      control: ui.radios({
        valor,
        alCambiar: (v) => ((valor = v), zona.repintar()),
        opciones: [
          { valor: 'off', etiqueta: b.versionado === 'Disabled' ? 'Disable' : 'Suspend', descripcion: b.versionado === 'Disabled' ? undefined : 'This suspends the creation of object versions for all operations but preserves any existing object versions.' },
          { valor: 'on', etiqueta: 'Enable' }
        ]
      })
    }),
    valor === 'off' && b.versionado === 'Enabled'
      ? ui.alerta({ tipo: 'aviso', contenido: 'After suspending versioning, new objects will not get version IDs, and overwritten or deleted objects can’t be recovered.' })
      : null,
    valor === 'on' && b.versionado !== 'Enabled' ? ui.alerta({ tipo: 'info', contenido: 'After enabling Bucket Versioning, you might need to update your lifecycle rules to manage previous versions of objects.' }) : null,
    h('div', { style: { marginTop: '16px' } }, ui.pares([{ etiqueta: 'Multi-factor authentication (MFA) delete', valor: 'Disabled' }], { columnas: 1 }))
  ]);
  return paginaEditar(cx, b, {
    titulo: 'Edit Bucket Versioning',
    pestana: 'propiedades',
    info: 's3-versionado',
    contenido: ui.contenedor({
      titulo: 'Bucket Versioning',
      info: 's3-versionado',
      cx,
      descripcion: 'Versioning is a means of keeping multiple variants of an object in the same bucket. You can use versioning to preserve, retrieve, and restore every version of every object stored in your Amazon S3 bucket. With versioning, you can easily recover from both unintended user actions and application failures.',
      cuerpo: zona
    }),
    guardar: () => {
      const r = cx.hacer({ servicio: 'S3', accion: 'PutBucketVersioning', error: 'Failed to edit Bucket Versioning' }, (e) => editarVersionado(e, nombre, valor === 'on'));
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: 'Successfully edited Bucket Versioning.' });
        irABucket(cx, nombre, 'propiedades');
      }
    }
  });
}

function editarCifradoPagina(cx, { nombre }) {
  const b = bucketDe(cx.estado, nombre);
  if (!b) return sinBucket(cx, nombre);
  const f = { cifrado: b.cifrado.tipo, bucketKey: b.cifrado.bucketKey };
  const zona = ui.region(() => camposCifrado(f, () => zona.repintar()));
  return paginaEditar(cx, b, {
    titulo: 'Edit default encryption',
    pestana: 'propiedades',
    info: 's3-cifrado',
    contenido: ui.contenedor({ titulo: 'Default encryption', info: 's3-cifrado', cx, descripcion: 'Server-side encryption is automatically applied to new objects stored in this bucket.', cuerpo: zona }),
    guardar: () => {
      const r = cx.hacer({ servicio: 'S3', accion: 'PutBucketEncryption', error: 'Failed to edit default encryption' }, (e) => editarCifrado(e, nombre, { tipo: f.cifrado, bucketKey: f.cifrado === 'DSSE-KMS' ? false : f.bucketKey }));
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: 'Successfully edited default encryption.' });
        irABucket(cx, nombre, 'propiedades');
      }
    }
  });
}

function editarSitioPagina(cx, { nombre }) {
  const b = bucketDe(cx.estado, nombre);
  if (!b) return sinBucket(cx, nombre);
  const f = { habilitado: Boolean(b.sitioWeb), indice: b.sitioWeb?.indice ?? 'index.html', error: b.sitioWeb?.error ?? '' };
  const zona = ui.region(() => [
    ui.campo({
      etiqueta: 'Static website hosting',
      control: ui.radios({
        valor: f.habilitado ? 'on' : 'off',
        alCambiar: (v) => ((f.habilitado = v === 'on'), zona.repintar()),
        opciones: [
          { valor: 'off', etiqueta: 'Disable' },
          { valor: 'on', etiqueta: 'Enable' }
        ]
      })
    }),
    f.habilitado
      ? [
          ui.campo({
            etiqueta: 'Hosting type',
            control: ui.radios({
              valor: 'host',
              opciones: [
                { valor: 'host', etiqueta: 'Host a static website', descripcion: 'Use the bucket endpoint as the web address.' },
                { valor: 'redir', etiqueta: 'Redirect requests for an object', descripcion: 'Redirect requests to another bucket or domain.', desactivado: true }
              ]
            })
          }),
          ui.alerta({
            tipo: 'info',
            contenido: 'For your customers to access content at the website endpoint, you must make all your content publicly readable. To do so, you can edit the S3 Block Public Access settings for the bucket.'
          }),
          ui.campo({ etiqueta: 'Index document', descripcion: 'Specify the home or default page of the website.', control: ui.entrada({ valor: f.indice, alCambiar: (v) => (f.indice = v) }) }),
          ui.campo({ etiqueta: 'Error document', opcional: true, descripcion: 'This is returned when an error occurs.', control: ui.entrada({ valor: f.error, placeholder: 'error.html', alCambiar: (v) => (f.error = v) }) })
        ]
      : null
  ]);
  return paginaEditar(cx, b, {
    titulo: 'Edit static website hosting',
    pestana: 'propiedades',
    info: 's3-sitio',
    contenido: ui.contenedor({ titulo: 'Static website hosting', info: 's3-sitio', cx, descripcion: 'Use this bucket to host a website or redirect requests.', cuerpo: h('div', { class: 'cx-form' }, zona) }),
    guardar: () => {
      const r = cx.hacer({ servicio: 'S3', accion: 'PutBucketWebsite', error: 'Failed to edit static website hosting' }, (e) => editarSitioWeb(e, nombre, f));
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: 'Successfully edited static website hosting.' });
        irABucket(cx, nombre, 'propiedades');
      }
    }
  });
}

/* ------------------------------------------------------------ Permissions */

function accesoBucket(b) {
  if (b.politica && politicaEsPublica(b.politica) && !b.bloqueoPublico.politicasCualquiera) return ['error', 'Public'];
  if (!bloqueoCompleto(b.bloqueoPublico)) return ['aviso', 'Objects can be public'];
  return ['exito', 'Bucket and objects not public'];
}

function pestanaPermisos(cx, b) {
  const n = b.nombre;
  const x = b.bloqueoPublico;
  const [tipoAcceso, textoAcceso] = accesoBucket(b);
  const publica = b.politica && politicaEsPublica(b.politica);
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.contenedor({ titulo: 'Permissions overview', cuerpo: ui.pares([{ etiqueta: 'Access', valor: ui.estado(tipoAcceso, textoAcceso) }], { columnas: 1 }) }),
    ui.contenedor({
      titulo: 'Block public access (bucket settings)',
      info: 's3-bloqueo',
      cx,
      acciones: ui.boton('Edit', { escribe: true, alClic: () => cx.ir(ruta(n, 'bloqueo')) }),
      descripcion: 'Public access is granted to buckets and objects through access control lists (ACLs), bucket policies, access point policies, or all. In order to ensure that public access to all your S3 buckets and objects is blocked, turn on Block all public access.',
      cuerpo: [
        ui.pares([{ etiqueta: 'Block all public access', valor: bloqueoCompleto(x) ? ui.estado('exito', 'On') : ui.estado('aviso', 'Off') }], { columnas: 1 }),
        ui.expandible({
          titulo: 'Individual Block Public Access settings for this bucket',
          abierto: !bloqueoCompleto(x),
          contenido: h('div', { class: 'cx-s3-bloqueo__resumen' }, TEXTO_BLOQUEO.map(([k, t]) => ui.pares([{ etiqueta: t, valor: x[k] ? ui.estado('exito', 'On') : ui.estado('aviso', 'Off') }], { columnas: 1 })))
        })
      ]
    }),
    ui.contenedor({
      titulo: 'Bucket policy',
      info: 's3-politica',
      cx,
      acciones: [
        publica ? ui.estado('aviso', 'Publicly accessible') : null,
        ui.boton('Edit', { escribe: true, alClic: () => cx.ir(ruta(n, 'politica')) }),
        ui.boton('Delete', {
          escribe: true,
          desactivado: !b.politica,
          alClic: () =>
            cx.confirmar({
              titulo: 'Delete bucket policy?',
              palabra: 'delete',
              contenido: h('p', {}, 'Deleting the bucket policy removes all permissions granted by it. This action cannot be undone.'),
              aceptar: () => {
                const r = cx.hacer({ servicio: 'S3', accion: 'DeleteBucketPolicy', error: 'Failed to delete bucket policy' }, (e) => editarPolitica(e, n, ''));
                if (r.ok) {
                  cx.flash({ tipo: 'exito', texto: 'Successfully deleted bucket policy.' });
                  irABucket(cx, n, 'permisos');
                }
                return true;
              }
            })
        })
      ],
      descripcion: 'The bucket policy, written in JSON, provides access to the objects stored in the bucket. Bucket policies don’t apply to objects owned by other accounts.',
      cuerpo: [
        publica ? ui.alerta({ tipo: 'aviso', titulo: 'Publicly accessible', contenido: 'This bucket policy grants public access: anyone on the internet can use the permissions it allows. Make sure this is what you want.' }) : null,
        b.politica ? h('pre', { class: 'cx-log cx-s3-json' }, formatearJson(b.politica)) : h('p', { class: 'cx-texto-sec' }, 'No policy to display.')
      ]
    }),
    ui.contenedor({
      titulo: 'Object Ownership',
      info: 's3-propiedad',
      cx,
      acciones: ui.boton('Edit', { desactivado: true, titulo: 'No disponible en este simulador' }),
      descripcion: 'Control ownership of objects written to this bucket from other AWS accounts and the use of access control lists (ACLs).',
      cuerpo: ui.pares(
        [
          {
            etiqueta: 'Object Ownership',
            valor: { BucketOwnerEnforced: 'Bucket owner enforced', BucketOwnerPreferred: 'Bucket owner preferred', ObjectWriter: 'Object writer' }[b.propiedadObjetos]
          },
          { etiqueta: 'ACLs', valor: b.propiedadObjetos === 'BucketOwnerEnforced' ? 'ACLs are disabled. All objects in this bucket are owned by this account.' : 'ACLs are enabled.' }
        ],
        { columnas: 1 }
      )
    }),
    ui.contenedor({ titulo: 'Access control list (ACL)', acciones: ui.boton('Edit', { desactivado: true }), descripcion: 'Grant basic read/write permissions to other AWS accounts.', cuerpo: h('p', { class: 'cx-texto-sec' }, b.propiedadObjetos === 'BucketOwnerEnforced' ? 'This bucket has the bucket owner enforced setting applied for Object Ownership. When bucket owner enforced is applied, use bucket policies to control access.' : 'Bucket owner (your AWS account): List, Write · Read, Write (bucket ACL).') }),
    ui.contenedor({ titulo: 'Cross-origin resource sharing (CORS)', acciones: ui.boton('Edit', { desactivado: true }), cuerpo: h('p', { class: 'cx-texto-sec' }, 'No configurations to display') })
  );
}

function formatearJson(texto) {
  try {
    return JSON.stringify(JSON.parse(texto), null, 4);
  } catch {
    return texto;
  }
}

function editarBloqueoPagina(cx, { nombre }) {
  const b = bucketDe(cx.estado, nombre);
  if (!b) return sinBucket(cx, nombre);
  const f = { bloqueo: { ...b.bloqueoPublico }, reconoce: true };
  return paginaEditar(cx, b, {
    titulo: 'Edit Block public access (bucket settings)',
    pestana: 'permisos',
    info: 's3-bloqueo',
    contenido: ui.contenedor({
      titulo: 'Block public access (bucket settings)',
      info: 's3-bloqueo',
      cx,
      descripcion: 'Public access is granted to buckets and objects through access control lists (ACLs), bucket policies, access point policies, or all. In order to ensure that public access to all your S3 buckets and objects is blocked, turn on Block all public access. These settings apply only to this bucket and its access points.',
      cuerpo: editorBloqueo(f, { conReconocer: false })
    }),
    guardar: () =>
      cx.confirmar({
        titulo: 'Edit Block public access (bucket settings)?',
        palabra: 'confirm',
        textoBoton: 'Confirm',
        contenido: [
          h('p', {}, 'Updating the Block Public Access settings for this bucket will affect this bucket and all objects within. This may result in some objects becoming public.'),
          !bloqueoCompleto(f.bloqueo) ? ui.alerta({ tipo: 'aviso', contenido: 'Con alguna casilla apagada, un descuido en una política puede dejar tus archivos a la vista de todo internet.' }) : null
        ],
        aceptar: () => {
          const r = cx.hacer({ servicio: 'S3', accion: 'PutPublicAccessBlock', error: 'Failed to edit Block Public Access settings' }, (e) => editarBloqueoPublico(e, nombre, { ...f.bloqueo }));
          if (r.ok) {
            cx.flash({ tipo: 'exito', texto: 'Successfully edited Block Public Access settings for this bucket.' });
            irABucket(cx, nombre, 'permisos');
          }
          return true;
        }
      })
  });
}

function editarPoliticaPagina(cx, { nombre }) {
  const b = bucketDe(cx.estado, nombre);
  if (!b) return sinBucket(cx, nombre);
  let texto = b.politica ? formatearJson(b.politica) : '';
  const aviso = ui.region(() => (politicaEsPublica(texto) ? ui.alerta({ tipo: 'aviso', titulo: 'Publicly accessible', contenido: 'This policy allows public access ("Principal": "*"). Anyone on the internet will be able to use the permissions it grants.' }) : null));
  return paginaEditar(cx, b, {
    titulo: 'Edit bucket policy',
    pestana: 'permisos',
    info: 's3-politica',
    contenido: ui.contenedor({
      titulo: 'Bucket policy',
      info: 's3-politica',
      cx,
      descripcion: 'The bucket policy, written in JSON, provides access to the objects stored in the bucket. Bucket policies don’t apply to objects owned by other accounts.',
      cuerpo: [
        ui.pares([{ etiqueta: 'Bucket ARN', valor: ui.copiable(arnBucket(nombre)) }], { columnas: 1 }),
        h(
          'div',
          { class: 'cx-fila-campos', style: { margin: '12px 0 8px', justifyContent: 'space-between' } },
          h('b', {}, 'Policy'),
          h('span', {}, ui.boton('Policy examples', { iconoDerecha: 'external', desactivado: true }), ' ', ui.boton('Policy generator', { iconoDerecha: 'external', desactivado: true }))
        ),
        ui.area({
          valor: texto,
          filas: 18,
          monoespaciado: true,
          etiquetaAccesible: 'Policy',
          placeholder: '{\n    "Version": "2012-10-17",\n    "Statement": [ … ]\n}',
          alCambiar: (v) => {
            texto = v;
            aviso.repintar();
          }
        }),
        aviso
      ]
    }),
    guardar: () => {
      const r = cx.hacer({ servicio: 'S3', accion: 'PutBucketPolicy', error: 'Failed to edit bucket policy' }, (e) => editarPolitica(e, nombre, texto));
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: 'Successfully edited bucket policy.' });
        irABucket(cx, nombre, 'permisos');
      }
    }
  });
}

/* ------------------------------------------------------------ Management */

const textoAcciones = (lista, palabra) => (lista.length ? lista.map((t) => `Transition to ${nombreClase(t.clase)} after ${t.dias} days${palabra}`) : []);

function pestanaAdministracion(cx, b) {
  const n = b.nombre;
  const t = ui.tabla(cx, {
    titulo: 'Lifecycle rules',
    info: 's3-ciclo',
    variante: 'simple',
    descripcion: 'Use lifecycle rules to define actions you want Amazon S3 to take during an object’s lifetime such as transitioning objects to another storage class, archiving them, or deleting them after a specified period of time.',
    filas: () => bucketDe(cx.estado, n)?.ciclo ?? [],
    clave: (r) => r.nombre,
    seleccion: 'unica',
    filtro: false,
    columnas: [
      { titulo: 'Lifecycle rule name', valor: (r) => ui.enlace(r.nombre, ruta(n, `ciclo/${encodeURIComponent(r.nombre)}`), { cx }), texto: (r) => r.nombre },
      { titulo: 'Status', valor: (r) => (r.estado === 'Enabled' ? ui.estado('exito', 'Enabled') : ui.estado('detenido', 'Disabled')) },
      { titulo: 'Scope', valor: (r) => (r.prefijo ? `Filtered (prefix: ${r.prefijo})` : 'Entire bucket') },
      {
        titulo: 'Current version actions',
        valor: (r) => h('div', {}, [...textoAcciones(r.transiciones, ''), r.expiracionDias !== null ? `Expire after ${r.expiracionDias} days` : null].filter(Boolean).map((l) => h('div', {}, l)), !r.transiciones.length && r.expiracionDias === null ? '–' : null)
      },
      {
        titulo: 'Noncurrent versions actions',
        valor: (r) => h('div', {}, [...textoAcciones(r.transicionesNoActuales, ' (noncurrent)'), r.borrarNoActualesDias !== null ? `Permanently delete after ${r.borrarNoActualesDias} days` : null].filter(Boolean).map((l) => h('div', {}, l)), !r.transicionesNoActuales.length && r.borrarNoActualesDias === null ? '–' : null)
      },
      { titulo: 'Expired object delete markers', valor: () => '–' },
      { titulo: 'Incomplete multipart uploads', valor: () => '–' }
    ],
    acciones: (sel) => [
      ui.boton('View details', { desactivado: sel.length !== 1, alClic: () => cx.ir(ruta(n, `ciclo/${encodeURIComponent(sel[0].nombre)}`)) }),
      ui.boton('Edit', { escribe: true, desactivado: sel.length !== 1, alClic: () => cx.ir(ruta(n, `ciclo/${encodeURIComponent(sel[0].nombre)}/editar`)) }),
      ui.boton('Delete', { escribe: true, desactivado: sel.length !== 1, alClic: () => borrarRegla(cx, n, sel[0].nombre) }),
      ui.menuBoton(
        'Actions',
        () => [
          { texto: 'Enable rule', escribe: true, desactivado: sel.length !== 1 || sel[0].estado === 'Enabled', alClic: () => cambiarEstadoRegla(cx, n, sel[0], 'Enabled') },
          { texto: 'Disable rule', escribe: true, desactivado: sel.length !== 1 || sel[0].estado === 'Disabled', alClic: () => cambiarEstadoRegla(cx, n, sel[0], 'Disabled') }
        ],
        { desactivado: sel.length !== 1 }
      ),
      ui.boton('Create lifecycle rule', { variante: 'primario', alClic: () => cx.ir(ruta(n, 'ciclo/crear')) })
    ],
    vacio: {
      titulo: 'No lifecycle rules',
      texto: 'There are no lifecycle rules for this bucket.',
      accion: ui.boton('Create lifecycle rule', { escribe: true, alClic: () => cx.ir(ruta(n, 'ciclo/crear')) })
    }
  });
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.contenedor({
      titulo: 'Lifecycle configuration',
      info: 's3-ciclo',
      cx,
      descripcion: 'To manage your objects so that they are stored cost effectively throughout their lifecycle, configure their lifecycle. A lifecycle configuration is a set of rules that define actions that Amazon S3 applies to a group of objects. Lifecycle rules run once per day.',
      cuerpo: t
    }),
    ui.contenedor({ titulo: 'Replication rules', contador: 0, acciones: ui.boton('Create replication rule', { desactivado: true }), descripcion: 'Use replication rules to define options you want Amazon S3 to apply during replication such as server-side encryption, replica ownership, transitioning replicas to another storage class, and more.', cuerpo: h('div', { class: 'cx-tabla__vacia' }, h('b', {}, 'No replication rules'), h('div', {}, 'You don’t have any replication rules.')) }),
    ui.contenedor({ titulo: 'Inventory configurations', contador: 0, acciones: ui.boton('Create inventory configuration', { desactivado: true }), cuerpo: h('div', { class: 'cx-tabla__vacia' }, h('b', {}, 'No inventory configurations'), h('div', {}, 'You can create inventory configurations to receive scheduled reports.')) })
  );
}

/** Pasa una regla del modelo al formato que pide editarReglaCiclo. */
const reglaComoParametros = (r, cambios = {}) => ({
  nombre: r.nombre,
  estado: r.estado,
  prefijo: r.prefijo,
  transiciones: r.transiciones.map((t) => ({ ...t })),
  transicionesNoActuales: r.transicionesNoActuales.map((t) => ({ ...t })),
  expiracionDias: r.expiracionDias,
  borrarNoActualesDias: r.borrarNoActualesDias,
  ...cambios
});

function cambiarEstadoRegla(cx, nombre, regla, estadoNuevo) {
  const r = cx.hacer({ servicio: 'S3', accion: 'PutBucketLifecycleConfiguration', error: 'Failed to edit lifecycle rule' }, (e) => editarReglaCiclo(e, nombre, regla.nombre, reglaComoParametros(regla, { estado: estadoNuevo })));
  if (r.ok) {
    cx.flash({ tipo: 'exito', texto: `Successfully ${estadoNuevo === 'Enabled' ? 'enabled' : 'disabled'} lifecycle rule "${regla.nombre}".` });
    irABucket(cx, nombre, 'administracion');
  }
}

function borrarRegla(cx, nombre, nombreRegla, { alTerminar } = {}) {
  cx.confirmar({
    titulo: 'Delete lifecycle rule?',
    textoBoton: 'Delete',
    contenido: h('p', {}, 'Are you sure you want to delete the lifecycle rule ', h('b', {}, nombreRegla), '? Amazon S3 will stop applying its actions to the objects in this bucket.'),
    aceptar: () => {
      const r = cx.hacer({ servicio: 'S3', accion: 'DeleteLifecycleRule', error: 'Failed to delete lifecycle rule' }, (e) => eliminarReglaCiclo(e, nombre, nombreRegla));
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: `Successfully deleted lifecycle rule "${nombreRegla}".` });
        alTerminar ? alTerminar() : irABucket(cx, nombre, 'administracion');
      }
      return true;
    }
  });
}

/** La línea de tiempo de «Review transition and expiration actions». */
function lineaTiempo({ transiciones, expiracionDias, transicionesNoActuales, borrarNoActualesDias }) {
  const columna = (titulo, inicio, pasos) =>
    h(
      'div',
      { class: 'cx-s3-linea__col' },
      h('h3', { class: 'cx-h3' }, titulo),
      h('div', { class: 'cx-s3-linea__dia' }, h('b', {}, 'Day 0'), pasos.length ? h('ul', {}, h('li', {}, inicio)) : h('div', {}, 'No actions defined.')),
      pasos.map((p) => [h('div', { class: 'cx-s3-linea__flecha', 'aria-hidden': 'true' }, '↓'), h('div', { class: 'cx-s3-linea__dia' }, h('b', {}, `Day ${p.dias}`), h('ul', {}, h('li', {}, p.texto)))])
    );
  const ordenar = (l) => l.filter((p) => Number.isFinite(p.dias)).sort((a, c) => a.dias - c.dias);
  const actuales = ordenar([
    ...transiciones.map((t) => ({ dias: Number(t.dias), texto: `Objects move to ${nombreClase(t.clase)}` })),
    ...(expiracionDias !== null ? [{ dias: Number(expiracionDias), texto: 'Objects expire' }] : [])
  ]);
  const noActuales = ordenar([
    ...transicionesNoActuales.map((t) => ({ dias: Number(t.dias), texto: `Noncurrent versions move to ${nombreClase(t.clase)}` })),
    ...(borrarNoActualesDias !== null ? [{ dias: Number(borrarNoActualesDias), texto: 'Noncurrent versions are permanently deleted' }] : [])
  ]);
  return h('div', { class: 'cx-s3-linea' }, columna('Current version actions', 'Objects uploaded', actuales), columna('Noncurrent versions actions', 'Objects become noncurrent', noActuales));
}

function nuevaRegla() {
  return {
    nombre: '',
    estado: 'Enabled',
    alcance: 'filtro',
    prefijo: '',
    reconoceTodo: false,
    acciones: { trans: false, transNo: false, expira: false, borrarNo: false, marcadores: false },
    transiciones: [{ clase: 'STANDARD_IA', dias: '' }],
    transicionesNo: [{ clase: 'STANDARD_IA', dias: '' }],
    expiraDias: '',
    borrarNoDias: '',
    marcadores: { borrar: false, multipart: false, diasMultipart: '' },
    reconoceCosto: false
  };
}

function reglaAFormulario(r) {
  const f = nuevaRegla();
  f.nombre = r.nombre;
  f.estado = r.estado;
  f.alcance = r.prefijo ? 'filtro' : 'todo';
  f.prefijo = r.prefijo ?? '';
  f.reconoceTodo = !r.prefijo;
  f.acciones = { trans: r.transiciones.length > 0, transNo: r.transicionesNoActuales.length > 0, expira: r.expiracionDias !== null, borrarNo: r.borrarNoActualesDias !== null, marcadores: false };
  if (r.transiciones.length) f.transiciones = r.transiciones.map((t) => ({ clase: t.clase, dias: String(t.dias) }));
  if (r.transicionesNoActuales.length) f.transicionesNo = r.transicionesNoActuales.map((t) => ({ clase: t.clase, dias: String(t.dias) }));
  f.expiraDias = r.expiracionDias !== null ? String(r.expiracionDias) : '';
  f.borrarNoDias = r.borrarNoActualesDias !== null ? String(r.borrarNoActualesDias) : '';
  f.reconoceCosto = true;
  return f;
}

/** El formulario como lo recibe modelo.js. */
function formularioARegla(f) {
  const a = f.acciones;
  return {
    nombre: f.nombre,
    estado: f.estado,
    prefijo: f.alcance === 'todo' ? null : f.prefijo.trim(),
    transiciones: a.trans ? f.transiciones.map((t) => ({ clase: t.clase, dias: t.dias === '' ? NaN : Number(t.dias) })) : [],
    transicionesNoActuales: a.transNo ? f.transicionesNo.map((t) => ({ clase: t.clase, dias: t.dias === '' ? NaN : Number(t.dias) })) : [],
    expiracionDias: a.expira ? f.expiraDias : null,
    borrarNoActualesDias: a.borrarNo ? f.borrarNoDias : null
  };
}

/** Crear y editar regla de ciclo de vida (misma pantalla). */
function formularioCiclo(cx, b, reglaOriginal) {
  const n = b.nombre;
  const f = reglaOriginal ? reglaAFormulario(reglaOriginal) : nuevaRegla();
  let intento = false;
  const titulo = reglaOriginal ? 'Edit lifecycle rule' : 'Create lifecycle rule';
  cx.migas([
    { texto: 'Amazon S3', ruta: 's3' },
    { texto: 'Buckets', ruta: 's3/buckets' },
    { texto: n, ruta: ruta(n) },
    { texto: 'Lifecycle configuration', ruta: ruta(n) },
    { texto: titulo }
  ]);

  // Lo que la consola revisa en el navegador (lo demás lo valida modelo.js).
  const errores = () => {
    if (!intento) return {};
    const e = {};
    if (!f.nombre.trim()) e.nombre = 'Lifecycle rule name is required.';
    if (f.alcance === 'filtro' && !f.prefijo.trim()) e.prefijo = 'Enter a prefix, or choose "Apply to all objects in the bucket".';
    if (f.alcance === 'todo' && !f.reconoceTodo) e.todo = 'You must acknowledge that this rule will apply to all objects in the bucket.';
    if (!Object.values(f.acciones).some(Boolean)) e.acciones = 'At least one lifecycle rule action must be selected.';
    if ((f.acciones.trans || f.acciones.transNo) && !f.reconoceCosto) e.costo = 'You must select the checkbox to acknowledge that you understand the costs associated with transitions.';
    if (f.acciones.trans) f.transiciones.forEach((t, i) => t.dias === '' && (e[`t${i}`] = 'Days after object creation is required.'));
    if (f.acciones.transNo) f.transicionesNo.forEach((t, i) => t.dias === '' && (e[`n${i}`] = 'Days after objects become noncurrent is required.'));
    if (f.acciones.expira && f.expiraDias === '') e.expira = 'Days after object creation is required.';
    if (f.acciones.borrarNo && f.borrarNoDias === '') e.borrarNo = 'Days after objects become noncurrent is required.';
    return e;
  };

  const linea = ui.region(() => {
    const r = formularioARegla(f);
    return lineaTiempo({
      transiciones: r.transiciones.filter((t) => Number.isFinite(t.dias)),
      transicionesNoActuales: r.transicionesNoActuales.filter((t) => Number.isFinite(t.dias)),
      expiracionDias: r.expiracionDias === null || r.expiracionDias === '' ? null : r.expiracionDias,
      borrarNoActualesDias: r.borrarNoActualesDias === null || r.borrarNoActualesDias === '' ? null : r.borrarNoActualesDias
    });
  });

  const errorDe = (e, k) => (e[k] ? h('div', { class: 'cx-campo__error', role: 'alert' }, icono('status-negative'), h('span', {}, e[k])) : null);
  const diasEntrada = (obj, k, placeholder) =>
    ui.entrada({
      tipo: 'number',
      min: 0,
      valor: obj[k],
      placeholder,
      etiquetaAccesible: placeholder,
      alCambiar: (v) => {
        obj[k] = v;
        linea.repintar();
      }
    });

  /** Filas de transición («Choose storage class transitions» + días + Remove). */
  function filasTransicion(lista, pref, etiquetaDias, e) {
    return h(
      'div',
      { class: 'cx-s3-transiciones' },
      lista.map((t, i) =>
        h(
          'div',
          { class: 'cx-fila-campos' },
          ui.campo({
            etiqueta: i === 0 ? 'Choose storage class transitions' : '',
            info: i === 0 ? 's3-clases' : undefined,
            cx,
            control: ui.selector({
              opciones: opcionesTransicion(),
              valor: t.clase,
              etiquetaAccesible: 'Storage class',
              alCambiar: (v) => {
                t.clase = v;
                linea.repintar();
              }
            })
          }),
          ui.campo({ etiqueta: i === 0 ? etiquetaDias : '', control: diasEntrada(t, 'dias', etiquetaDias), error: e[`${pref}${i}`] }),
          lista.length > 1
            ? h('div', { class: 'cx-s3-quitar' }, ui.boton('Remove', { alClic: () => (lista.splice(i, 1), cuerpo.repintar()) }))
            : null
        )
      ),
      h(
        'div',
        { style: { marginTop: '8px' } },
        ui.boton('Add transition', {
          desactivado: lista.length >= ORDEN_TRANSICION.length,
          alClic: () => {
            const ultima = ORDEN_TRANSICION.indexOf(lista.at(-1)?.clase);
            lista.push({ clase: ORDEN_TRANSICION[Math.min(ORDEN_TRANSICION.length - 1, ultima + 1)] ?? 'GLACIER', dias: '' });
            cuerpo.repintar();
          }
        })
      )
    );
  }

  const cuerpo = ui.region(() => {
    const e = errores();
    const a = f.acciones;
    const marcar = (k) => (v) => {
      a[k] = v;
      cuerpo.repintar();
    };
    return [
      ui.contenedor({
        titulo: 'Lifecycle rule configuration',
        info: 's3-ciclo',
        cx,
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.campo({
            etiqueta: 'Lifecycle rule name',
            control: ui.entrada({ valor: f.nombre, placeholder: 'Enter a rule name', alCambiar: (v) => (f.nombre = v) }),
            restriccion: 'Up to 255 characters',
            error: e.nombre
          }),
          ui.campo({
            etiqueta: 'Choose a rule scope',
            control: ui.radios({
              valor: f.alcance,
              alCambiar: (v) => {
                f.alcance = v;
                cuerpo.repintar();
              },
              opciones: [
                { valor: 'filtro', etiqueta: 'Limit the scope of this rule using one or more filters' },
                { valor: 'todo', etiqueta: 'Apply to all objects in the bucket' }
              ]
            })
          }),
          f.alcance === 'todo'
            ? ui.alerta({
                tipo: 'aviso',
                titulo: 'Apply to all objects in the bucket',
                contenido: [
                  h('p', {}, 'If you want the rule to apply to specific objects, you must use a filter to identify those objects. Choose "Limit the scope of this rule using one or more filters". '),
                  ui.casilla({ etiqueta: 'I acknowledge that this rule will apply to all objects in the bucket.', marcada: f.reconoceTodo, alCambiar: (v) => ((f.reconoceTodo = v), cuerpo.repintar()) }),
                  errorDe(e, 'todo')
                ]
              })
            : h(
                'div',
                { class: 'cx-bloque' },
                h('div', { class: 'cx-bloque__titulo' }, 'Filter type'),
                h('p', { class: 'cx-texto-sec' }, 'You can filter objects by prefix, object tags, object size, or whatever combination suits your use case.'),
                ui.campo({
                  etiqueta: 'Prefix',
                  descripcion: 'Add filter to limit the scope of this rule to a single prefix.',
                  control: ui.entrada({ valor: f.prefijo, placeholder: 'Enter prefix', alCambiar: (v) => (f.prefijo = v) }),
                  restriccion: 'Don’t include the bucket name in the prefix. Using certain characters in key names can cause problems with some applications and protocols.',
                  error: e.prefijo
                }),
                ui.campo({ etiqueta: 'Object tags', control: ui.boton('Add tag', { desactivado: true }) }),
                ui.campo({ etiqueta: 'Object size', control: h('span', { class: 'cx-texto-sec' }, 'Specify minimum object size / Specify maximum object size (no disponible en el simulador)') })
              )
        )
      }),
      ui.contenedor({
        titulo: 'Lifecycle rule actions',
        info: 's3-ciclo',
        cx,
        descripcion: 'Choose the actions you want this rule to perform.',
        cuerpo: [
          ui.casilla({ etiqueta: 'Transition current versions of objects between storage classes', descripcion: 'This action will move current versions.', marcada: a.trans, alCambiar: marcar('trans') }),
          ui.casilla({ etiqueta: 'Transition noncurrent versions of objects between storage classes', descripcion: 'This action will move noncurrent versions.', marcada: a.transNo, alCambiar: marcar('transNo') }),
          ui.casilla({ etiqueta: 'Expire current versions of objects', marcada: a.expira, alCambiar: marcar('expira') }),
          ui.casilla({ etiqueta: 'Permanently delete noncurrent versions of objects', marcada: a.borrarNo, alCambiar: marcar('borrarNo') }),
          ui.casilla({ etiqueta: 'Delete expired object delete markers or incomplete multipart uploads', descripcion: 'These actions are not supported when filtering by object tags or object size.', marcada: a.marcadores, alCambiar: marcar('marcadores') }),
          errorDe(e, 'acciones'),
          a.trans || a.transNo
            ? h(
                'div',
                { style: { marginTop: '16px' } },
                ui.alerta({
                  tipo: 'aviso',
                  titulo: 'Transitions are charged per request',
                  contenido: [
                    h('p', {}, 'For a lifecycle transition action, each request corresponds to an object transition. For details on lifecycle transition pricing, see requests pricing info on the Storage & requests tab of the Amazon S3 pricing page.'),
                    ui.casilla({ etiqueta: 'I acknowledge that this lifecycle rule will incur a transition cost per request.', marcada: f.reconoceCosto, alCambiar: (v) => ((f.reconoceCosto = v), cuerpo.repintar()) }),
                    errorDe(e, 'costo')
                  ]
                }),
                h('div', { style: { marginTop: '12px' } }, ui.alerta({ tipo: 'info', titulo: 'By default, objects less than 128KB will not transition across any storage class', contenido: 'We don’t recommend transitioning objects less than 128 KB because the transition costs can outweigh the storage savings.' }))
              )
            : null
        ]
      }),
      a.trans
        ? ui.contenedor({
            titulo: 'Transition current versions of objects between storage classes',
            info: 's3-clases',
            cx,
            descripcion: 'Choose transitions to move current versions of objects between storage classes based on your use case scenario and performance access requirements. These transitions start from when the objects are created and are consecutively applied.',
            cuerpo: filasTransicion(f.transiciones, 't', 'Days after object creation', e)
          })
        : null,
      a.transNo
        ? ui.contenedor({
            titulo: 'Transition noncurrent versions of objects between storage classes',
            descripcion: 'Choose transitions to move noncurrent versions of objects between storage classes. These transitions start from when the objects become noncurrent and are consecutively applied.',
            cuerpo: filasTransicion(f.transicionesNo, 'n', 'Days after objects become noncurrent', e)
          })
        : null,
      a.expira
        ? ui.contenedor({
            titulo: 'Expire current versions of objects',
            descripcion: 'For version-enabled buckets, Amazon S3 adds a delete marker and the current version of an object is retained as a noncurrent version. For non-versioned buckets, Amazon S3 permanently removes the object.',
            cuerpo: ui.campo({ etiqueta: 'Days after object creation', clase: 'cx-s3-dias', control: diasEntrada(f, 'expiraDias', 'Days after object creation'), error: e.expira })
          })
        : null,
      a.borrarNo
        ? ui.contenedor({
            titulo: 'Permanently delete noncurrent versions of objects',
            descripcion: 'Choose when Amazon S3 permanently deletes specified noncurrent versions of objects.',
            cuerpo: h(
              'div',
              { class: 'cx-fila-campos' },
              ui.campo({ etiqueta: 'Days after objects become noncurrent', clase: 'cx-s3-dias', control: diasEntrada(f, 'borrarNoDias', 'Days after objects become noncurrent'), error: e.borrarNo }),
              ui.campo({ etiqueta: 'Number of newer versions to retain', opcional: true, control: ui.entrada({ desactivado: true, placeholder: 'Enter value' }) })
            )
          })
        : null,
      a.marcadores
        ? ui.contenedor({
            titulo: 'Delete expired object delete markers or incomplete multipart uploads',
            cuerpo: [
              ui.casilla({ etiqueta: 'Delete expired object delete markers', descripcion: 'This action will remove expired object delete markers and may improve performance.', marcada: f.marcadores.borrar, alCambiar: (v) => (f.marcadores.borrar = v) }),
              ui.casilla({ etiqueta: 'Delete incomplete multipart uploads', descripcion: 'This action will stop all incomplete multipart uploads, and the parts associated with the multipart upload will be deleted.', marcada: f.marcadores.multipart, alCambiar: (v) => (f.marcadores.multipart = v) }),
              h('p', { class: 'cx-texto-sec', style: { marginTop: '8px' } }, 'Simulador: esta acción se muestra, pero no se guarda (no la piden tus laboratorios).')
            ]
          })
        : null,
      ui.contenedor({ titulo: 'Review transition and expiration actions', cuerpo: linea })
    ];
  }, { clase: 'cx-pagina' });

  function enviar() {
    intento = true;
    cuerpo.repintar();
    if (Object.keys(errores()).length) return cuerpo.querySelector('.cx-campo__error')?.scrollIntoView({ block: 'center' });
    const regla = formularioARegla(f);
    const r = reglaOriginal
      ? cx.hacer({ servicio: 'S3', accion: 'PutBucketLifecycleConfiguration', error: 'Failed to edit lifecycle rule' }, (e) => editarReglaCiclo(e, n, reglaOriginal.nombre, regla))
      : cx.hacer({ servicio: 'S3', accion: 'PutBucketLifecycleConfiguration', error: 'Failed to create lifecycle rule' }, (e) => crearReglaCiclo(e, n, regla));
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: reglaOriginal ? `Successfully edited lifecycle rule "${r.valor.nombre}".` : `Successfully created lifecycle rule "${r.valor.nombre}".` });
      irABucket(cx, n, 'administracion');
    }
  }

  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo, info: 's3-ciclo', cx, descripcion: 'Lifecycle rules define actions that Amazon S3 applies to a group of objects, such as moving them to cheaper storage classes or deleting them after a period of time.' }),
    cuerpo,
    ui.pieFormulario({ cancelar: () => irABucket(cx, n, 'administracion'), enviar, textoEnviar: reglaOriginal ? 'Save changes' : 'Create rule' })
  );
}

function crearReglaPagina(cx, { nombre }) {
  const b = bucketDe(cx.estado, nombre);
  if (!b) return sinBucket(cx, nombre);
  return formularioCiclo(cx, b, null);
}

function editarReglaPagina(cx, { nombre, regla }) {
  const b = bucketDe(cx.estado, nombre);
  if (!b) return sinBucket(cx, nombre);
  const r = b.ciclo.find((x) => x.nombre === regla);
  if (!r) return detalleRegla(cx, { nombre, regla });
  return formularioCiclo(cx, b, r);
}

function detalleRegla(cx, { nombre, regla }) {
  const b = bucketDe(cx.estado, nombre);
  if (!b) return sinBucket(cx, nombre);
  cx.migas([{ texto: 'Amazon S3', ruta: 's3' }, { texto: 'Buckets', ruta: 's3/buckets' }, { texto: nombre, ruta: ruta(nombre) }, { texto: 'Lifecycle configuration', ruta: ruta(nombre) }, { texto: regla }]);
  recordarPestana(cx, nombre, 'administracion');
  const r = b.ciclo.find((x) => x.nombre === regla);
  if (!r) return h('div', { class: 'cx-pagina' }, ui.alerta({ tipo: 'error', titulo: 'Lifecycle rule not found', contenido: [`The lifecycle rule ${regla} does not exist. `, ui.enlace('Back to Management', ruta(nombre), { cx })] }));
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({
      titulo: r.nombre,
      info: 's3-ciclo',
      cx,
      acciones: [
        ui.boton('Delete', { escribe: true, alClic: () => borrarRegla(cx, nombre, r.nombre) }),
        ui.boton('Edit', { escribe: true, alClic: () => cx.ir(ruta(nombre, `ciclo/${encodeURIComponent(r.nombre)}/editar`)) })
      ]
    }),
    ui.contenedor({
      titulo: 'Lifecycle rule configuration',
      cuerpo: ui.pares(
        [
          { etiqueta: 'Lifecycle rule name', valor: r.nombre },
          { etiqueta: 'Status', valor: r.estado === 'Enabled' ? ui.estado('exito', 'Enabled') : ui.estado('detenido', 'Disabled') },
          { etiqueta: 'Scope', valor: r.prefijo ? 'Filtered' : 'Entire bucket' },
          { etiqueta: 'Prefix', valor: r.prefijo ?? '–' }
        ],
        { columnas: 4 }
      )
    }),
    ui.contenedor({ titulo: 'Review transition and expiration actions', cuerpo: lineaTiempo({ transiciones: r.transiciones, expiracionDias: r.expiracionDias, transicionesNoActuales: r.transicionesNoActuales, borrarNoActualesDias: r.borrarNoActualesDias }) })
  );
}

/* ============================================================ otras pantallas */

const noDisp = (titulo) => (cx) => {
  cx.migas([{ texto: 'Amazon S3', ruta: 's3' }, { texto: titulo }]);
  return ui.noDisponible(titulo);
};

/* ============================================================ registro */

export default {
  id: 's3',
  nombre: 'S3',
  titulo: 'Amazon S3',
  descripcion: 'Scalable Storage in the Cloud',
  categoria: 'almacenamiento',
  claves: 'bucket storage almacenamiento objetos',
  inicio: 's3/buckets',
  menu: [
    { texto: 'General purpose buckets', ruta: 's3/buckets' },
    { texto: 'Directory buckets', desactivado: true },
    { texto: 'Table buckets', desactivado: true },
    { texto: 'Vector buckets', desactivado: true },
    { texto: 'Access Grants', desactivado: true },
    { texto: 'Access Points (General Purpose Buckets, FSx file systems)', desactivado: true },
    { texto: 'Object Lambda Access Points', desactivado: true },
    { texto: 'Multi-Region Access Points', desactivado: true },
    { texto: 'Batch Operations', desactivado: true },
    { texto: 'IAM Access Analyzer for S3', desactivado: true },
    { texto: 'Block Public Access settings for this account', desactivado: true },
    {
      seccion: 'Storage Lens',
      items: [
        { texto: 'Dashboards', desactivado: true },
        { texto: 'Storage Lens groups', desactivado: true },
        { texto: 'AWS Organizations settings', desactivado: true }
      ]
    },
    { texto: 'Feature spotlight', desactivado: true },
    { texto: 'AWS Marketplace for S3', externo: true, desactivado: true }
  ],
  rutas: {
    '': buckets,
    buckets,
    'buckets/crear': crearBucketPagina,
    'buckets/:nombre': detalleBucket,
    'buckets/:nombre/subir': subir,
    'buckets/:nombre/subida': subida,
    'buckets/:nombre/versionado': editarVersionadoPagina,
    'buckets/:nombre/cifrado': editarCifradoPagina,
    'buckets/:nombre/sitio-web': editarSitioPagina,
    'buckets/:nombre/bloqueo': editarBloqueoPagina,
    'buckets/:nombre/politica': editarPoliticaPagina,
    'buckets/:nombre/ciclo/crear': crearReglaPagina,
    'buckets/:nombre/ciclo/:regla': detalleRegla,
    'buckets/:nombre/ciclo/:regla/editar': editarReglaPagina,
    'buckets/:nombre/objeto/:llave': detalleObjeto,
    'storage-lens': noDisp('Storage Lens')
  },
  busqueda: [
    { texto: 'Buckets', ruta: 's3/buckets', claves: 'bucket' },
    { texto: 'Create bucket', ruta: 's3/buckets/crear' }
  ],
  ayudas: {
    's3-bucket': {
      titulo: 'Bucket de S3',
      texto: [
        'Un **bucket** es como una carpeta gigante en la nube donde guardas archivos (S3 los llama **objetos**). No tiene límite de tamaño.',
        'El nombre es **único en todo el mundo**: si otra persona ya usa `fotos`, tú no puedes. Por eso conviene agregarle algo tuyo, como `elgrano-menu-a0123`.',
        ['Solo minúsculas, números, puntos y guiones.', 'De 3 a 63 caracteres.', 'Empieza y termina con letra o número.'],
        'Un bucket vive en una región (aquí, **N. Virginia**), aunque la lista de buckets los muestre todos juntos.'
      ]
    },
    's3-objeto': {
      titulo: 'Objetos y carpetas',
      texto: [
        'Cada archivo que subes es un **objeto**: el contenido más su nombre completo (la **key**), por ejemplo `fotos/terraza.jpg`.',
        'En realidad S3 no tiene carpetas: la consola agrupa los objetos por lo que va antes de cada `/` para que lo veas ordenado.',
        'Con **Upload** subes archivos y con **Create folder** creas una «carpeta».'
      ]
    },
    's3-bloqueo': {
      titulo: 'Bloqueo de acceso público',
      texto: [
        '**Block all public access** es el candado general del bucket: impide que cualquiera en internet vea tus archivos, aunque alguien se equivoque con un permiso.',
        'Son cuatro casillas: dos para las ACL (permisos viejos por archivo) y dos para las políticas del bucket.',
        'Déjalo **todo en On** salvo que de verdad quieras publicar algo (por ejemplo, un sitio web). Si lo apagas, la consola te pide reconocer el riesgo.'
      ]
    },
    's3-versionado': {
      titulo: 'Versionado',
      texto: [
        'Con el **versionado** activado, S3 guarda cada versión de un archivo. Si lo sobrescribes o lo borras, la versión anterior sigue ahí y la puedes recuperar.',
        'Es tu red de seguridad contra errores y contra quien borre cosas por accidente.',
        'Una vez activado ya no se puede «desactivar», solo **suspender** (deja de crear versiones nuevas, pero conserva las que hay).'
      ]
    },
    's3-cifrado': {
      titulo: 'Cifrado por omisión',
      texto: [
        'El **cifrado** guarda tus archivos revueltos en los discos de AWS: si alguien se robara un disco, no podría leerlos.',
        ['**SSE-S3**: S3 maneja las llaves por ti. Es lo normal y no cuesta extra.', '**SSE-KMS**: las llaves viven en el servicio KMS y puedes controlar quién las usa.', '**DSSE-KMS**: dos capas de cifrado con KMS, para casos muy exigentes.'],
        'Para tus laboratorios basta **SSE-S3**.'
      ]
    },
    's3-ciclo': {
      titulo: 'Ciclo de vida',
      texto: [
        'Una **regla de ciclo de vida** mueve sola los archivos viejos a clases más baratas y, si quieres, los borra después de un tiempo.',
        'Ejemplo: a los 30 días a `Standard-IA`, a los 180 a `Glacier Flexible Retrieval` y a los 1825 (5 años) se borran.',
        'Elige **Apply to all objects in the bucket** si la regla es para todo el bucket (te pide confirmarlo), o escribe un **prefijo** (`logs/`) para aplicarla solo a una «carpeta».',
        'Ojo: un archivo debe pasar al menos 30 días en Standard antes de ir a Standard-IA.'
      ]
    },
    's3-clases': {
      titulo: 'Clases de almacenamiento',
      texto: [
        'La **clase** decide cuánto pagas por guardar y por leer un archivo:',
        ['**Standard**: lo que usas seguido. Rápido y sin cargos por leer.', '**Standard-IA** (Infrequent Access): lo que lees poco, como una vez al mes. Más barato de guardar, cobra por leer.', '**One Zone-IA**: como IA pero en una sola zona; para cosas que puedes volver a generar.', '**Intelligent-Tiering**: S3 decide solo según el uso.', '**Glacier Instant / Flexible Retrieval**: archivo que casi no consultas; Flexible tarda de minutos a horas en devolverlo.', '**Glacier Deep Archive**: lo más barato; tarda horas. Ideal para lo que guardas por ley.'],
        'Mientras menos lo consultes, más fría (y barata) puede ser la clase.'
      ]
    },
    's3-sitio': {
      titulo: 'Sitio web estático',
      texto: [
        'S3 puede servir una página web hecha solo de archivos (HTML, CSS, imágenes), sin servidor.',
        'Necesitas un **index document** (la portada, normalmente `index.html`) y, para que la vean, permitir lectura pública con una política del bucket. Por eso choca con el bloqueo de acceso público.'
      ]
    },
    's3-politica': {
      titulo: 'Política del bucket',
      texto: [
        'Es un documento **JSON** que dice quién puede hacer qué con el bucket.',
        'Si lleva `"Principal": "*"` con `"Effect": "Allow"`, el permiso es para **cualquiera en internet**: la consola lo marca como **Publicly accessible**.',
        'Con el bloqueo de acceso público encendido, S3 no te deja guardar una política pública: es una protección, no un error.'
      ]
    },
    's3-propiedad': {
      titulo: 'Object Ownership',
      texto: [
        'Decide de quién son los archivos que suben otras cuentas y si se usan las **ACL** (permisos viejos, archivo por archivo).',
        'Lo recomendado es **ACLs disabled**: todo es de tu cuenta y los permisos se manejan solo con políticas, más fácil de revisar.'
      ]
    }
  }
};
