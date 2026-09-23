# TAREA C — Sección 2: “Los tres grandes” (AWS, Azure, Google Cloud e IaaS)

Lee primero `docs/tareas/_comun-secciones.md` y sigue sus reglas.

**Tus archivos (solo estos):**
- `src/slides/20-proveedores.html`
- `src/css/sections/s2-proveedores.css`
- `src/js/sections/s2-proveedores.js`
- capturas: `docs/capturas/s2-*.png`

**Contenido:** las 6 diapositivas de la SECCIÓN 2 del `docs/GUION.md`, en este orden y con estos ids:
`s2-tres-grandes`, `s2-caracteristicas`, `s2-diccionario`, `s2-rasgos-iaas`, `s2-siete-pasos`,
`s2-precios`. `data-section="Los tres grandes"`.

**Puntos donde se juega la calidad:**
- Cifras exactas del GUION (28 %, 20 %, 15 %, 63 %, fuente Synergy Research Group Q2 2026). No agregues
  otras cifras. Las barras de cuota crecen con contador animado; incluye la barra “Todos los demás” (37 %).
- Colores de marca solo como acento (chips, bordes, barras). Nada de logotipos oficiales.
- `s2-caracteristicas` y `s2-diccionario` son tablas densas: deben ser legibles al proyectar
  (revela fila por fila con pasos, resalta la fila activa) y en celular (tarjetas apiladas o scroll
  horizontal dentro del contenedor de la tabla, nunca del documento).
- `s2-siete-pasos`: ilustración de un servidor que se va “armando” con cada paso (región → imagen →
  tamaño → disco → firewall → llave → encendido con luz verde).
- `s2-precios`: la mini calculadora interactiva (control deslizante 0–730 h, US$0.02/h, etiqueta
  “Precio ilustrativo, no real”), con accesibilidad de teclado en el slider y `data-no-nav` para que
  las flechas muevan el slider y no cambien de diapositiva cuando tiene el foco.
- `s2-rasgos-iaas`: micro-animaciones en los iconos de las 6 tarjetas.

**Aceptación observable:** build sin errores; capturas 1280×720 y 390×844 de las 6 diapositivas
revisadas; calculadora probada (0 h = US$0.00, 2 h = US$0.04, 730 h = US$14.60); sin errores de
consola. En tu `worker_done` lista los archivos y cualquier necesidad de cambio en archivos compartidos.
