# El núcleo de la consola simulada

Guía para quien agrega un servicio (S3, IAM…) a `public/consola/`. El marco,
el enrutador y los componentes ya existen; un servicio solo declara su menú,
sus rutas y sus pantallas. **La API de abajo ya no cambia de forma
incompatible** (solo se le agregan cosas).

Archivos:

| Archivo | Qué hace |
|---|---|
| `consola.js` | `montarConsola()`: barra superior, buscador, región, cuenta, favoritos, menú lateral, migas, flashbar, panel de ayuda, enrutador, reloj (`avanzar` cada segundo). |
| `ui.js` | Componentes (Cloudscape oscuro) hechos con DOM. |
| `consola.css` | Todos los estilos, bajo `.cx`. Clases `cx-…`. |
| `navegador.js` | El navegador simulado (`cx.navegador(url)`). |
| `servicios/index.js` | **El registro**: la lista `SERVICIOS`. |
| `servicios/inicio.js`, `ec2.js`, `vpc.js` | Console Home, EC2 y VPC (ejemplos completos). |

## 1. Registrar un servicio

Crea `servicios/s3.js` con un `export default` así y, en `servicios/index.js`,
cambia el `proximamente({ id: 's3', … })` por `import s3 from './s3.js'`
(y ponlo en la lista). No hace falta tocar nada más.

```js
import * as ui from '../ui.js';
import { crearBucket } from '../modelo.js';
const { h } = ui;

function buckets(cx) {                       // una pantalla: (cx, params) => Nodo
  cx.migas([{ texto: 'Amazon S3', ruta: 's3' }, { texto: 'Buckets' }]);
  return h('div', { class: 'cx-pagina' }, /* … */);
}
function detalleBucket(cx, { nombre }) { /* params salen de ':nombre' */ }

export default {
  id: 's3',                                  // primer segmento de la ruta: 's3/buckets/mi-bucket'
  nombre: 'S3',                              // barra de favoritos, buscador
  titulo: 'Amazon S3',                       // encabezado del menú lateral
  descripcion: 'Scalable Storage in the Cloud',
  categoria: 'almacenamiento',               // computo | redes | almacenamiento | seguridad (color del ícono)
  inicio: 's3/buckets',                      // a dónde va al elegir el servicio (por omisión: el id)
  menu: [                                    // menú lateral (vacío = sin menú)
    { texto: 'General purpose buckets', ruta: 's3/buckets' },
    { seccion: 'Storage Lens', items: [
      { texto: 'Dashboards', desactivado: true },          // gris, «no disponible»
      { texto: 'Docs', externo: true, desactivado: true }
    ] }
  ],
  rutas: {                                   // relativas al id; '' = 's3'
    '': buckets,
    buckets,
    'buckets/crear': crearBucketPagina,      // las rutas fijas ganan a las de parámetro
    'buckets/:nombre': detalleBucket
  },
  busqueda: [                                // «Features» del buscador de la barra (Alt+S)
    { texto: 'Buckets', ruta: 's3/buckets' }
  ],
  ayudas: {                                  // temas del panel «Info» (en español, cortos)
    bucket: { titulo: 'Bucket', texto: [
      'Un **bucket** es una carpeta gigante en la nube…',
      ['viñeta uno', 'viñeta dos'],          // una lista = viñetas
      'Usa `código` y **negritas** (no se acepta HTML).'
    ] }
  }
};
```

El ítem activo del menú lateral es el de ruta más larga que coincide con la
ruta actual. Los temas de `ayudas` son globales (todos los servicios los
comparten): usa nombres con prefijo si chocan (`s3-versionado`).

## 2. El contexto `cx`

Cada pantalla recibe `cx`:

| | |
|---|---|
| `cx.estado` | El estado de `modelo.js`. **Léelo** libremente; **cámbialo solo** con `cx.hacer`. |
| `cx.ir('s3/buckets/x')` | Navega (ruta interna; no toca `location.hash`). |
| `cx.ruta`, `cx.servicio` | Ruta e id del servicio actuales. |
| `cx.hacer(meta, fn, op?)` | Corre una acción de modelo.js. Ver abajo. |
| `cx.flash({ tipo, titulo, texto, accion })` | Alerta de arriba. `tipo`: `exito` (verde), `error` (rojo), `info` (azul), `aviso`, `progreso` (azul con giro). `texto` puede ser texto o nodos. `accion: { texto: 'View bucket', alClic }`. Sobrevive a **una** navegación (para el «Successfully created…» después de crear y regresar a la lista); las rojas se van con la siguiente. Devuelve un id para `cx.quitarFlash(id)`. |
| `cx.migas([{ texto, ruta }, …])` | Migas de pan de la pantalla (la última sin ruta). |
| `cx.modal({ titulo, contenido, pie, ancho })` | Modal propio → `{ cerrar }`. `ancho`: `chico` \| `mediano` \| `grande`. |
| `cx.confirmar({ titulo, contenido, palabra, textoBoton, aceptar })` | Confirmación. Con `palabra: 'delete'` pide escribirla. Si `aceptar()` devuelve `false`, el modal se queda abierto. |
| `cx.ayuda('tema')` | Abre el panel de ayuda (también lo hace `ui.info(cx, 'tema')`). |
| `cx.vivo(() => nodo)` | Zona que se reconstruye cada segundo y tras cada acción, pero solo se reemplaza si cambió lo que se ve y si el alumno no está escribiendo dentro. `.repintar()` la fuerza. Para todo lo que muestre estado que cambia solo (estados, progreso). |
| `cx.alRefrescar(fn)` | Llama `fn` cada segundo y tras cada acción (mientras la pantalla esté abierta). |
| `cx.refrescar()` | Repinta ya las zonas vivas. |
| `cx.memoria` | Objeto para pasar datos entre pantallas (por ejemplo, lo recién creado). |
| `cx.soloLectura` | `true` cuando el docente revisa. Los botones primarios, los `escribe: true` y `cx.hacer` ya se apagan solos. |
| `cx.navegador(url)` | Abre el navegador simulado. |
| `cx.iconoServicio(servicio, px)`, `cx.servicioDe(id)` | Ícono de color y datos de un servicio registrado. |

### `cx.hacer`

```js
const r = cx.hacer(
  { servicio: 'S3', accion: 'CreateBucket', error: 'Failed to create bucket' },   // meta
  (e) => crearBucket(e, { nombre, versionado })                                    // recibe el estado
);
if (r.ok) {
  cx.flash({ tipo: 'exito', texto: `Successfully created bucket "${r.valor.nombre}"` });
  cx.ir('s3/buckets');
}
// Si falla, ya se mostró la alerta roja con el mensaje en inglés de ErrorAws
// (con `error` como título) y la página no se movió: lo capturado sigue ahí.
```

- Tras el éxito llama `alCambiar(estado, { servicio, accion })` y repinta.
- `{ atomico: true }`: prueba la acción primero sobre una copia del estado; úsalo
  cuando `fn` hace varias acciones seguidas y no quieres dejar medio hecho.
- `{ flash: false }`: no muestra la alerta roja; tú decides (por ejemplo, junto a un campo).
- No valides en la pantalla lo que ya valida `modelo.js` (formato del nombre del
  bucket, duplicados…): deja que el error salga en rojo como en AWS. Solo valida
  lo que la consola real revisa en el navegador (campo obligatorio vacío).

## 3. Componentes (`ui.js`)

Todos devuelven un `Element`. El texto siempre se pinta como texto (nunca
`innerHTML`), así que puedes pasar nombres que escribió el alumno sin escapar.

### DOM

- `h(etiqueta, props, ...hijos)` — `props`: `class` (texto o lista), `style` (objeto), `onclick`/`oninput`…, atributos (`'aria-label'`), `checked`/`disabled`/`value`. Hijos: texto, nodos, listas, `null`.
- `region(() => nodo)` — zona que repintas a mano con `.repintar()` (formularios).
- `reemplazar(el, ...hijos)`, `agregar(el, hijos)`, `textoDe(v)`, `idUnico()`.
- `icono(nombre)` — 16 px, color del texto. Nombres: `caret-down`, `caret-right`, `angle-left/right/down/up`, `search`, `refresh`, `settings`, `copy`, `external`, `close`, `status-positive/negative/warning/info/stopped/pending`, `spinner`, `menu`, `help`, `user`, `edit`, `upload`, `download`, `add`, `remove`, `lock`, `file`, `globe`, `key`, `check`, `filter`, `star`…

### Botones, enlaces, menús

```js
ui.boton('Create bucket', { variante: 'primario', alClic, desactivado, icono: 'upload' })
//   variantes: 'primario' (naranja), 'normal' (borde azul), 'texto' (Cancel), 'icono', 'icono-borde'
//   escribe: true → se apaga en solo lectura (los primarios ya lo hacen)
ui.botonRefrescar(alClic)
ui.enlace('mi-bucket', 's3/buckets/mi-bucket', { cx })      // o enlace(texto, () => …), { externo: true }
ui.menuBoton('Actions', () => [                             // función: se evalúa al abrir
  { texto: 'Copy ARN', alClic },
  { texto: 'Delete', alClic, escribe: true, desactivado: !sel.length },
  '-',                                                      // separador
  { texto: 'Security', items: [ { texto: 'Modify IAM role', alClic } ] },   // submenú
  { grupo: 'Monitor', items: [ … ] }                        // grupo con título
], { variante: 'normal', desactivado, alinear: 'derecha' })
ui.info(cx, 'tema')                                         // el «Info» azul
```

### Formularios

```js
ui.campo({ etiqueta: 'Bucket name', info: 'bucket', cx, descripcion, opcional: true,
           control: ui.entrada({ valor, alCambiar: (v) => (f.nombre = v), placeholder }),
           restriccion: 'Bucket names must be 3 to 63 characters…', error: 'Bucket name is required' })
ui.entrada({ valor, alCambiar, placeholder, tipo: 'number', sufijo: '256 IPs', buscar: true, desactivado, alEnter })
ui.area({ valor, alCambiar, filas: 8, monoespaciado: true })
ui.casilla({ etiqueta, descripcion, marcada, alCambiar(bool), desactivado })
ui.interruptor({ etiqueta, marcada, alCambiar })
ui.radios({ opciones: [{ valor, etiqueta, descripcion, desactivado }], valor, alCambiar, horizontal })
ui.tarjetas({ opciones: [...], valor, alCambiar, columnas: 2 })        // radios en tarjeta
ui.segmentado({ opciones: [{ valor, etiqueta }], valor, alCambiar })
ui.selector({ opciones: [{ valor, etiqueta, descripcion, etiquetas: ['…'], etiquetaDerecha, desactivado, grupo }],
              valor, alCambiar, placeholder: 'Choose…', filtrar: true, vacio: 'No options',
              opcionLibre: (texto) => ({ valor: texto, etiqueta: texto }) | null })   // «Use: "…"»
ui.selector({ multiple: true, valores: [], alCambiar(valores), … })   // multiselect con fichas
ui.editorEtiquetas({ filas: [{ llave, valor }], alCambiar })          // Key / Value / Remove / Add new tag
ui.nombreDeEtiquetas(filas)                                          // el valor de Name
ui.pieFormulario({ cancelar, enviar, textoEnviar: 'Create bucket', extra })
```

### Estructura

```js
ui.encabezado({ titulo, contador, info, cx, descripcion, acciones: [botones] })   // h1 de página
ui.contenedor({ titulo, contador, info, cx, descripcion, acciones, cuerpo, pie, plegable, abierto })
ui.expandible({ titulo, contenido, abierto, fuerte })                            // ▶ Advanced settings
ui.pares([{ etiqueta, valor, info }], { columnas: 3, cx })                         // la rejilla de Details
ui.pestanas({ pestanas: [{ id, texto, contenido: () => nodo, desactivada }], activa, alCambiar })
ui.panelInferior({ titulo, contenido })                                         // split panel de las listas
ui.noDisponible('Access Analyzer', 'texto opcional')
```

Clases útiles: `cx-pagina` (columna con separación de 20 px), `cx-pagina--form`
(ancho máximo de formulario), `cx-dos-columnas` + `cx-lado` (formulario con
resumen pegajoso a la derecha), `cx-fila-campos` (campos en fila),
`cx-bloque` (recuadro interno), `cx-texto-sec`, `cx-mono`, `cx-log`
(texto monoespaciado), `cx-insignia` (`--gris`, `--azul`, `--morada`).

### Estado, alertas, copiar, fechas

```js
ui.estado('exito', 'Enabled')        // exito | error | aviso | info | pendiente (gira) | detenido | inactivo
ui.alerta({ tipo: 'aviso', titulo, contenido, accion, cerrable })   // dentro de la página
ui.copiable('arn:aws:iam::…')        // ícono de copiar + texto
ui.fecha(iso)  ui.fechaLarga(iso)  ui.guion(v)  ui.nombreEId(recurso)  ui.textoRico('**b** `c`')
```

### Tablas

```js
const t = ui.tabla(cx, {
  titulo: 'Buckets', info: 'bucket', variante: 'pagina',     // 'pagina' (h1) | 'contenedor' (tarjeta) | 'simple'
  filas: () => cx.estado.buckets,                            // función: se vuelve a leer cada segundo
  clave: (b) => b.nombre,
  seleccion: 'unica',                                        // 'unica' (radio) | 'multiple' | null
  filtro: 'Find buckets by name',                            // false = sin filtro
  columnas: [
    { titulo: 'Name', valor: (b) => ui.enlace(b.nombre, `s3/buckets/${b.nombre}`, { cx }) },
    { titulo: 'AWS Region', valor: () => 'US East (N. Virginia) us-east-1' }
  ],
  acciones: (elegidas) => [                                  // se repinta al cambiar la selección
    ui.boton('Empty', { desactivado: elegidas.length !== 1, escribe: true }),
    ui.boton('Create bucket', { variante: 'primario', alClic: () => cx.ir('s3/buckets/crear') })
  ],
  vacio: { titulo: 'No buckets', texto: 'You don’t have any buckets.', accion: ui.boton('Create bucket', …) },
  alSeleccionar: (ids, filas) => detalle.repintar()
});
t.seleccion()   // filas elegidas
t.ids()         // sus claves
t.seleccionar([ids])
```

La tabla se repinta sola (sin perder filtro ni selección). Para el panel de
abajo que depende de la selección, usa `cx.vivo(() => …t.seleccion()…)`.

## 4. Convenciones

- Interfaz en inglés como AWS; ayudas (`ayudas`) y avisos del simulador en español.
- IDs y nombres como en la consola: `nombre || '–'`; selectores con «id (name)».
- Lo que la consola real tiene y aquí no: menú lateral con `desactivado: true`
  o una ruta que devuelva `ui.noDisponible(…)`.
- Los íconos de servicio salen de `categoria` (sin logotipos de AWS).
- Revisa EC2 (`servicios/ec2.js`) como referencia de lista + panel inferior +
  formulario de creación + modales de confirmación.

## 5. Notas añadidas después (compatibles)

- `ui.campo({ error })`: el error rojo se quita solo en cuanto el alumno escribe en ese campo.
- `cx.vivo()` suelta los refrescos de lo que construyó la vez anterior (por ejemplo,
  las `ui.tabla` que vivían dentro), así que puedes poner tablas dentro de una zona viva.
- `servicios/comun.js` tiene ayudas de EC2/VPC reutilizables: `enlaceRecurso(cx, id)`,
  `idBarraNombre(r)`, `idParentesis(r)`, `pestanaEtiquetas(cx, recurso)`, `panelVacio(texto)`,
  `noExiste(cx, tipo, id, rutaLista)`.
- El reinicio de estilos usa `.cx :where(button, input…)`: cualquier clase `cx-…` le gana.
