# Examen diagnóstico — Cómputo en la Nube

Servidor para aplicar un examen de 20 preguntas de opción múltiple al inicio del curso
y ver, en un panel aparte, qué tan parejo está el grupo en fundamentos: computadora,
memoria, procesador, redes y programación básica.

- `/` — examen del alumno
- `/docente` — panel con el promedio grupal, descarga de PDF y CSV

Requiere **Node 22 o más nuevo**.

## Correr en local

```bash
npm install
CLAVE_DOCENTE=loquesea npm start
# http://localhost:3000
```

## Correr dentro de la plataforma del curso

El examen también se monta como un módulo de `../plataforma`, junto al resto del
material, en un solo puerto y con una sola dirección para los alumnos. No hay que
hacer nada especial: la plataforma importa `crearApp()` de `app.js`.

Por eso `app.js` y `server.js` están separados y las rutas de `public/` son
relativas (`fetch('api/examen')`, no `fetch('/api/examen')`): así funcionan igual
en la raíz que colgadas de `/m/diagnostico/`. **Si agregas código al navegador,
no le pongas diagonal inicial a las rutas** o se romperá al montarse.

## Desplegar en Render

1. Sube este repositorio a GitHub.
2. En Render: **New → Blueprint**, apunta al repo. Lee `render.yaml` solo.
3. Te va a pedir el valor de `CLAVE_DOCENTE`. Pon una y guárdala: es la única
   protección del panel.
4. Al terminar el build tienes la URL. La que comparten los alumnos es la raíz;
   tú entras a `/docente`.

Si prefieres hacerlo a mano en lugar del blueprint: servicio web, runtime Node,
build `npm ci`, start `node server.js`, health check `/salud`.

## Variables de entorno

| Variable | Para qué sirve | Por defecto |
|---|---|---|
| `CLAVE_DOCENTE` | Clave del panel. **Defínela siempre.** | `cambiame` (con aviso en pantalla) |
| `MATERIA` | Nombre que sale en la portada y en el PDF | Cómputo en la Nube |
| `DOCENTE` | Tu nombre en el encabezado del PDF | vacío |
| `RETROALIMENTACION` | Qué ve el alumno al entregar: `resumen`, `completo` o `nada` | `resumen` |
| `DATABASE_URL` | Si existe, usa Postgres en lugar de SQLite | vacío |
| `DATA_DIR` | Carpeta del archivo SQLite | `./data` |

`RETROALIMENTACION=completo` le dice al alumno cuáles falló y cuál era la correcta.
Úsalo solo si no piensas reutilizar el mismo examen con otro grupo.

## Lo que hay que saber del plan gratis

El disco de Render en plan gratis es efímero. El servicio se duerme a los 15 minutos
sin tráfico y, cuando eso pasa, **el archivo SQLite con los intentos se borra**.
Durante el examen no hay problema porque el tráfico lo mantiene despierto, pero:

- **Opción rápida:** baja el PDF y el CSV antes de salir del salón. Para un
  diagnóstico de una sola aplicación es suficiente.
- **Opción con respaldo:** crea un Postgres gratis en Render y define `DATABASE_URL`.
  El código detecta la variable al arrancar y cambia de motor solo, sin tocar nada
  más. En `render.yaml` ya están las líneas, comentadas.

Además, el primer alumno que abra la liga después de un rato va a esperar entre 30
y 60 segundos mientras el servicio despierta. Ábrela tú unos minutos antes de clase.

## Editar las preguntas

Todo el banco está en `src/preguntas.js`. Cada pregunta lleva `tema`, `texto`,
`opciones` y `correcta` (índice desde 0). Para meter un bloque de código en el
enunciado, sepáralo del resto con una línea en blanco: lo que va después se
renderiza en monoespaciado.

El umbral que pinta un tema en rojo es 60% y el de una pregunta es 50%. Están en
`src/estadisticas.js` y en las vistas, por si quieres moverlos.

## Estructura

```
app.js                  rutas de la API (exporta crearApp)
server.js               arranque cuando el examen corre solo
src/preguntas.js        banco de 20 preguntas y calificación
src/almacen.js          SQLite o Postgres, misma interfaz
src/estadisticas.js     promedio, mediana, distribución, por tema, por pregunta
src/reporte-pdf.js      reporte en PDF (PDFKit, sin navegador headless)
public/                 examen y panel
```

## Notas de diseño

Las respuestas correctas viven solo en el servidor: el endpoint `/api/examen`
entrega enunciados y opciones, nunca el índice correcto, así que abrir las
herramientas del navegador no sirve de nada. La calificación se hace en
`/api/intentos/:id/entregar`.

Cada respuesta se guarda en el servidor conforme el alumno avanza, así que si se
le cierra el navegador puede volver a entrar y retomar donde iba (la sesión vive
en `sessionStorage`).
