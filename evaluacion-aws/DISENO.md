# Evaluación AWS · diseño y contratos

Contratos entre las piezas del módulo (se escribió para construirlo con varios
agentes en paralelo). Para usarlo en clase, lee el README.

## Qué es

Un módulo nuevo de la plataforma (`evaluacion-aws/`, montado en
`/m/evaluacion/`, tipo `express`, **cero dependencias de npm**) con tres
evaluaciones que el docente abre y cierra desde su panel:

| id | Cuándo | Partes |
|---|---|---|
| `simulacro-1` | martes 20 de octubre de 2026 | Teórica (casos de negocio) + práctica (laboratorio en la consola simulada) |
| `simulacro-2` | viernes 23 de octubre de 2026 | Teórica + práctica, con casos **distintos** a los del simulacro 1 |
| `bimestral` | martes 27 de octubre de 2026 | Solo la práctica (la teórica la aplica el docente por su cuenta) |

- Temas: lo visto en las sesiones 1 a 4 de la Ruta AWS (`../curso-aws-practitioner`):
  fundamentos e infraestructura global y EC2 (1), IAM y seguridad (2), redes (3),
  almacenamiento (4).
- Cada laboratorio dura **máximo 60 minutos** para un alumno promedio.
- La parte teórica del simulacro: **5 casos de negocio con 5 preguntas cada uno
  (25 preguntas, 45 minutos)**.
- **Toda pregunta y todo punto de la rúbrica tienen retroalimentación**, tanto
  si se acierta como si se falla.
- Público: alumnos universitarios en México que empiezan. Todo en español,
  estilo «for dummies», tuteando. Los nombres de la consola van en inglés, tal
  como los ve el alumno en AWS (*Launch instance*, *Route tables*…).
- Los alumnos ya usaron la consola real en el sandbox de DataCamp (en modo
  oscuro). El simulador existe porque no todos los equipos tienen permisos en
  DataCamp: **no depende de AWS ni de internet**.

## Estructura de carpetas (quién escribe qué)

```
evaluacion-aws/
  DISENO.md                 este documento
  README.md                 (al final)
  package.json              { "type": "module", scripts: start, verificar }   [servidor]
  app.js                    crearApp() — mismo patrón que ../curso-aws-practitioner/app.js   [servidor]
  server.js                 arranque suelto                                     [servidor]
  src/
    servidor.js             copia de ../curso-aws-practitioner/src/servidor.js  [servidor]
    almacen.js              JSON en data/evaluacion-aws.json                    [servidor]
    firma.js                comprobantes firmados (HMAC)                        [servidor]
    evaluaciones.js         registro de las 3 evaluaciones                      [servidor]
    teoria/index.js         TEORIA: Map evalId → banco                          [teoría]
    teoria/simulacro-1.js                                                       [teoría]
    teoria/simulacro-2.js                                                       [teoría]
    rubricas/index.js       RUBRICAS: Map labId → { revisar, solucion }         [labs]
    rubricas/simulacro-1.js, simulacro-2.js, bimestral.js                       [labs]
    verificar.js            `npm run verificar`                                 [servidor + labs + teoría]
  public/
    index.html, app.js, estilos.css   lado del alumno                           [servidor]
    docente.html, docente.js          panel del docente                         [servidor]
    consola/                el simulador de la consola de AWS                   [consola]
      modelo.js             estado de la cuenta + acciones (puro, sin DOM)      [ya escrito]
      red.js                ¿abre la página? + registro del sistema (puro)      [ya escrito]
      consola.js            montarConsola(...)                                  [consola]
      consola.css
      ...                   lo que haga falta (servicios/ec2.js, vpc.js, s3.js, iam.js, ui.js…)
    labs/
      index.js              LABS: Map labId → definición pública               [labs]
      comun.js              datosAlumno(...)                                    [ya escrito]
      simulacro-1.js, simulacro-2.js, bimestral.js                              [labs]
```

`modelo.js`, `red.js` y `comun.js` son puros (sin `window`, sin `document`):
el servidor los importa con `../public/consola/modelo.js` para calificar.

## Contrato 1 · El estado de la cuenta simulada (`public/consola/modelo.js`)

Todo lo que el alumno crea vive en un objeto JSON serializable (ver el
comentario largo al inicio de `modelo.js`, que es la referencia). Se crea con
`cuentaNueva(datos)` y se modifica **solo** con las acciones exportadas
(`crearVpc`, `crearSubred`, `lanzarInstancia`, `crearBucket`…). Cada acción:

- recibe `(estado, parametros)` y **muta** `estado`;
- valida como AWS y, si algo está mal, lanza `ErrorAws` con `codigo` y
  `mensaje` en inglés, iguales o muy parecidos a los de la consola real (la UI
  los muestra tal cual en su alerta roja);
- devuelve el recurso creado o modificado;
- anota en `estado.bitacora` qué pasó (el docente ve el historial).

Los estados de transición (`pending`, `stopping`, `creating`…) guardan cuándo
terminan; `avanzar(estado, ahora)` los resuelve. La consola llama `avanzar`
cada segundo; el servidor lo llama antes de calificar.

## Contrato 2 · La consola (`public/consola/consola.js`)

```js
import { montarConsola } from './consola/consola.js';

const consola = montarConsola(contenedor, {
  estado,                 // objeto de modelo.js (la consola lo muta en su lugar)
  alumno: { nombre, matricula },  // para el menú de la cuenta
  alCambiar(estado, accion) {},   // tras cada acción exitosa: guardar y sincronizar
  soloLectura: false      // true: el docente revisa la cuenta de un alumno
});
consola.irA('ec2/instancias');   // opcional
consola.destruir();
```

La consola ocupa todo el contenedor que recibe (alto y ancho), tiene su propio
enrutador interno (no toca `location.hash`) y nunca hace `fetch`.

## Contrato 3 · Los laboratorios (`public/labs/*.js` y `src/rubricas/*.js`)

Definición pública (la ve el alumno; **no** lleva la rúbrica):

```js
export const LAB = {
  id: 'simulacro-1',
  titulo: 'La cafetería sube a la nube',
  minutos: 60,
  historia: '<p>…</p>',                       // el caso, en HTML
  pistas: true,                               // ¿mostrar «¿Dónde se hace?»?
  estadoInicial(datos) { return cuentaNueva(datos) + recursos ya hechos },
  tareas(datos) { return [ { id, titulo, puntos, html, pista, bono? } ] }  // html usa los datos del alumno
};
```

Una tarea con `bono: true` es **opcional**: las demás suman 100 y la rúbrica
califica `min(100, requeridas + bono)`. El bono compensa errores, pero nunca
pasa de 100. `armar()` (`src/rubricas/comun.js`) lo hace solo; la UI la marca
«Bono (opcional)» y no la cuenta en «X de Y tareas».

`datos` sale de `datosAlumno({ nombre, matricula })` (`public/labs/comun.js`):
octeto de la red, sufijo para nombres únicos, la IP pública «de tu casa», el
número de cuenta. Así cada alumno tiene rangos y nombres distintos.

Rúbrica (solo servidor):

```js
export function revisar(estado, datos) → {
  obtenidos, total,            // total = 100
  tareas: [{ id, titulo, puntos, obtenidos,
    checks: [{ id, texto, puntos, ok, retro }] }]   // retro: explica el acierto o el error
}
export function solucion(datos) → estado   // una cuenta resuelta, para verificar que da 100
```

Cada rúbrica exporta también `REPASO = { 'tarea': ref, 'tarea/check': ref }`
(referencias de `src/repaso.js`; la clave con check gana): la retro dice en
qué lámina o paso de la Ruta AWS repasar cada punto.

`npm run verificar` comprueba que `revisar(solucion(datos))` da 100, que
`revisar(estadoInicial(datos))` da muy poco y que todo check tiene retro.

## Contrato 4 · Los bancos teóricos (`src/teoria/*.js`)

```js
export const TEMAS = ['Fundamentos y EC2', 'Identidad y seguridad', 'Redes', 'Almacenamiento'];
export const MINUTOS = 45;
export const CASOS = [{ id: 'c1', empresa: 'Taquería…', titulo: '…', historia: '<p>…</p>' }];   // 5 casos
export const PREGUNTAS = [{
  id: 'c1p1', caso: 'c1', tema: 'Redes', sesion: 3, concepto: '…',
  texto: '…',
  opciones: [ { texto: '…', retro: 'Por qué sí / por qué no' }, … ],   // 4 opciones
  correcta: 2
}];                                                                     // 25 preguntas
export function publica()      // casos y preguntas sin `correcta` ni `retro`
export function calificar(respuestas)  // { aciertos, total, detalle: [{ id, tema, elegida, correcta }] }
```

Clave balanceada (A/B/C/D casi igual, sin tres seguidas iguales), cada
distractor es una confusión real, retro de 1 a 3 frases por opción.

## Contrato 5 · La API del módulo

Rutas relativas (el módulo vive montado en `/m/evaluacion/`). El alumno se
identifica igual que en la Ruta AWS: `{ id, nombre, matricula, grupo }`
guardado en `localStorage`.

Alumno:
- `GET  api/estado?a=` → evaluaciones con su estado (`teoria`/`practica`:
  `cerrada | abierta`), sus entregas y la configuración visible.
- `POST api/teoria` `{ alumno, evaluacion }` → arranca (guarda la hora) y da
  los casos y preguntas públicos, o el resultado si ya entregó.
- `POST api/teoria/entregar` `{ alumno, evaluacion, respuestas }`.
- `POST api/practica` `{ alumno, evaluacion }` → arranca o informa si ya entregó.
- `POST api/practica/guardar` `{ alumno, evaluacion, estado }` → copia del
  avance (el docente lo ve en vivo; si el alumno cambia de equipo, lo recupera).
- `POST api/practica/revisar` → la rúbrica a medio camino, solo si el docente
  permite autorrevisión (simulacros sí, bimestral no por omisión).
- `POST api/practica/entregar` `{ alumno, evaluacion, estado }`.
- Intentos de práctica (solo si la evaluación tiene `reintentos`, es decir,
  los simulacros, y el alumno ya entregó esa parte; abierta o cerrada):
  `POST api/teoria/intento` da las preguntas, `POST api/teoria/intento/calificar`
  `{ respuestas }`, `POST api/practica/intento` da la identidad del laboratorio
  y `POST api/practica/intento/calificar` `{ estado }` (sirve también para
  «Revisar mi avance»). Califican con la retroalimentación vigente y **no
  guardan nada**: la entrega que cuenta es la primera. El avance del intento
  vive solo en el `localStorage` del alumno.

Docente (cabecera `x-clave-docente`, misma `CLAVE_DOCENTE` que los demás
paneles): entrar, resumen por evaluación y grupo, abrir y cerrar cada parte,
retroalimentación (`completa` | `calificacion`), autorrevisión, detalle de un
alumno (respuestas, rúbrica y su cuenta en modo solo lectura), borrar una
entrega para que repita, CSV.

Render borra el disco en cada despliegue o reinicio: cada entrega regresa al
navegador con un comprobante firmado (HMAC con la clave del docente). Si el
servidor la perdió, el navegador la vuelve a mandar y se acepta.

## Aspecto

- La página del alumno y la del panel usan el tono de la sección
  «Evaluación» de la plataforma: azul marino (`#16202c` / `#232f3e`) con
  acentos naranja (`#ff9900`) y el papel claro del curso para leer.
- La consola simulada imita la consola real de AWS en **modo oscuro**
  (Cloudscape): barra superior, buscador de servicios, región «N. Virginia»,
  menú lateral, migas, tablas con selección, menús «Actions», asistentes,
  alertas verdes y rojas, IDs como `vpc-0a1b2c3d4e5f67890`. Referencia: las
  capturas reales en `../curso-aws-practitioner/public/capturas/s1…s4`.
- Sin logotipos de AWS. Un distintivo discreto «Simulador» en la barra.
