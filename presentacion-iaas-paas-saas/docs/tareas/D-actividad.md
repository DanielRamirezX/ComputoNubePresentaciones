# TAREA D — Sección 3: “Manos a la obra” (AWS Educate, tarea, glosario y cierre)

Lee primero `docs/tareas/_comun-secciones.md` y sigue sus reglas.

**Tus archivos (solo estos):**
- `src/slides/30-actividad.html`
- `src/css/sections/s3-actividad.css`
- `src/js/sections/s3-actividad.js`
- capturas: `docs/capturas/s3-*.png`

**Contenido:** las 6 diapositivas de la SECCIÓN 3 del `docs/GUION.md`, en este orden y con estos ids:
`s3-aws-educate`, `s3-registro`, `s3-tarea`, `s3-problemas`, `s3-glosario`, `s3-cierre`.
`data-section="Manos a la obra"`.

**Puntos donde se juega la calidad:**
- Es la parte que los alumnos consultarán después desde su celular para hacer la tarea: la versión
  390×844 debe ser impecable y los enlaces deben abrirse (`target="_blank" rel="noopener"`).
- `s3-registro`: stepper animado con una ventana de navegador ilustrada que cambia en cada paso.
  Es un boceto genérico (barras, cajas, un botón amarillo), NO una imitación de la interfaz de AWS.
- `s3-tarea`: fecha y medio de entrega con `data-config="fechaEntrega"` y `data-config="medioEntrega"`
  (los valores viven en `src/config.js`, que es de la base: no lo edites; si falta alguna clave,
  menciónalo en tu reporte). Casillas de “qué entregas” que se marcan con animación.
- `s3-problemas`: formato problema → solución fácil de escanear (acordeón o tarjetas).
- `s3-glosario`: 12 tarjetas volteables (reutiliza el componente de la base). Clic voltea una; un paso
  del teclado voltea todas; retroceder las regresa.
- `s3-cierre`: cierre memorable con Nubi feliz despidiéndose y nubes en movimiento, coherente con la
  portada (`s0-portada`).

**Aceptación observable:** build sin errores; capturas 1280×720 y 390×844 de las 6 diapositivas
revisadas; enlaces verificados; `data-config` se rellena; sin errores de consola. En tu `worker_done`
lista los archivos y cualquier necesidad de cambio en archivos compartidos.
