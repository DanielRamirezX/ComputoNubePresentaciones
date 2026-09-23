# Brief técnico y visual — Presentación “IaaS, PaaS y SaaS”

Presentación web para la materia **Cómputo en la Nube** (nivel universitario, México, español).
Estilo “para principiantes”: lenguaje sencillo, analogías, iconos, recuadros de ayuda,
mucha animación con propósito. Se proyecta en clase (teclado) y los alumnos pueden abrirla
en su celular.

El contenido (textos exactos por diapositiva) está en `docs/GUION.md`. **Los textos del guion ya
están revisados y verificados: úsalos tal cual.** Puedes partir un texto en dos líneas o
ajustar la puntuación para el diseño, pero no cambies datos, cifras, nombres de servicios
ni el sentido. No inventes cifras nuevas.

Carpeta del proyecto (ruta absoluta):
`C:\Users\danie\Repositories\Computo en la nube\presentacion-iaas-paas-saas`

---

## 1. Arquitectura

Sin frameworks ni dependencias de npm. HTML + CSS + JavaScript “vanilla”. Node 26 está instalado.

```
presentacion-iaas-paas-saas/
  build.mjs                 ← ensambla todo en un solo index.html autocontenido
  package.json              ← "scripts": { "build": "node build.mjs" }
  README.md                 ← instrucciones para el docente (cómo presentar, teclas, cómo editar)
  index.html                ← GENERADO por build.mjs (no se edita a mano)
  docs/  BRIEF.md  GUION.md  COMPONENTES.md
  src/
    template.html           ← esqueleto: <head>, fuentes, sprite de iconos, contenedor, UI del motor
    config.js               ← datos que el docente edita (fecha de entrega, etc.)
    css/base.css            ← tokens, tipografía, layout de diapositivas, transiciones
    css/components.css      ← componentes reutilizables
    css/sections/sN-*.css   ← estilos propios de cada sección
    js/deck.js              ← motor de la presentación
    js/sections/sN-*.js     ← interacciones propias de cada sección
    slides/NN-*.html        ← diapositivas de cada sección (fragmentos HTML)
```

`build.mjs`:
- Lee `src/template.html` y sustituye marcadores:
  `<!-- @styles -->` → `<style>` con base.css + components.css + css/sections/*.css (orden alfabético)
  `<!-- @slides -->` → concatenación de `src/slides/*.html` (orden alfabético)
  `<!-- @scripts -->` → `<script>` con config.js + deck.js + js/sections/*.js (orden alfabético)
- Si una carpeta está vacía o falta un archivo de sección, **no falla** (las secciones se crean en paralelo).
- Escribe `index.html` en la raíz del proyecto. Debe funcionar abriéndolo con doble clic (`file://`),
  sin servidor. Imprime en consola cuántas diapositivas encontró.
- Valida: ids de diapositiva duplicados → error; imprime advertencia si una diapositiva no tiene `<aside class="notes">`.

Única dependencia externa permitida: Google Fonts (con fuentes de respaldo del sistema, porque en
el salón puede no haber internet). Nada de CDNs de JS. Nada de imágenes externas: todo es SVG en línea
o CSS. No uses logotipos oficiales de marcas (AWS, Azure, Google, Gmail, etc.): escribe su nombre en
“chips” de texto con el color de la marca como acento.

## 2. Contrato del motor (`deck.js`) — TODAS las secciones dependen de esto

### Marcado de una diapositiva
```html
<section class="slide" id="s1-iaas" data-section="Los tres modelos" data-title="IaaS">
  <div class="slide__inner">
    …contenido…
  </div>
  <aside class="notes">Notas para el docente (no se ven en la diapositiva).</aside>
</section>
```
- `id` único, con prefijo de sección (`s0-`, `s1-`, `s2-`, `s3-`).
- `data-section` y `data-title` alimentan la barra inferior y el índice.
- Variante de fondo opcional: `data-bg="amarillo"` / `data-bg="tinta"` (fondo oscuro) / sin atributo = papel.

### Pasos (fragmentos)
- Cualquier elemento con clase `step` está oculto hasta que el docente avanza.
  `data-step="n"` (opcional) agrupa varios elementos en el mismo paso; sin él, se usa el orden del DOM.
- El motor añade `.is-shown` al paso revelado y pone `data-step-current="n"` en la diapositiva (0 = ningún paso).
- “Siguiente” revela el siguiente paso; si ya no hay, pasa a la siguiente diapositiva.
  “Anterior” oculta el último paso; si no hay, regresa a la diapositiva anterior **mostrando todos sus pasos**.

### Animaciones de entrada
- Elementos con `data-anim="fade-up | fade | pop | slide-left | slide-right | zoom | draw"` se animan
  cada vez que la diapositiva se vuelve activa (se re-disparan al volver a ella).
- Escalonado: `style="--d:3"` → retraso = `--d × 90ms`.
- `draw` es para trazos SVG (stroke-dashoffset).
- La diapositiva activa tiene `.is-active`; las animaciones se definen en CSS bajo `.slide.is-active [data-anim]`.

### Ganchos de JavaScript para secciones
```js
Deck.onSlide('s1-stack', {
  enter(slideEl) {},                   // al entrar
  leave(slideEl) {},                   // al salir
  step(slideEl, stepIndex, direction) {} // al cambiar de paso (direction: 1 o -1)
});
```
Además se emite `document` → `CustomEvent('deck:change', { detail: { index, id, slide } })`.
Cada archivo de `js/sections/` va envuelto en una IIFE y solo toca elementos de su sección.

### Navegación y UI del motor
- Siguiente: → , Espacio, PageDown, Enter, clic en botón “siguiente”, deslizar a la izquierda (táctil).
- Anterior: ← , PageUp, Retroceso, botón “anterior”, deslizar a la derecha.
- Inicio/Fin: Home / End. `F` = pantalla completa. `N` = panel de notas del docente.
  `O` o `Esc` = índice (lista de diapositivas agrupadas por sección, clic para ir). `?` = ayuda de teclas.
- Si el foco está en un `input`, `select`, `textarea` o dentro de `[data-no-nav]`, las teclas no navegan.
  Espacio/Enter sobre un botón enfocado activa el botón, no avanza.
- URL con hash `#/5` (número de diapositiva, base 1) sincronizada; al recargar se conserva la posición.
- Barra de progreso arriba; abajo: nombre de la sección, título, contador “7 / 25”, botones ← →.
  La UI del motor debe ser discreta (no competir con el contenido).
- `prefers-reduced-motion: reduce` → sin desplazamientos ni rebotes; solo cambios de opacidad breves.

### Configuración del docente
`src/config.js` define `window.CLASE = { materia, fechaEntrega, medioEntrega, … }`.
El motor reemplaza el texto de cualquier `[data-config="clave"]` con `CLASE[clave]`.
En el `index.html` generado, ese bloque debe quedar arriba del resto del JS con un comentario
bien visible: `/* ✏️ EDITA AQUÍ los datos de tu grupo */`, para que el docente lo cambie sin reconstruir.

## 3. Dirección visual

**Concepto: “cuaderno de apuntes con marcador amarillo”.** Amigable, claro, con carácter. Nada de
plantilla corporativa genérica, nada de degradados morados, nada de “glassmorphism”.

- Fondo papel `#FBF8EF` con una retícula muy tenue de cuaderno; tinta `#16181D`; texto secundario `#4B5160`.
- Acento firma: **amarillo marcador** `#FFD23F` (resaltados, el “tú”, botones principales).
- Bordes de tinta de 2–3 px, esquinas de 14 px, sombras duras desplazadas (p. ej. `4px 4px 0 #16181D`)
  en tarjetas destacadas. Resaltado tipo marcador que se “pinta” de izquierda a derecha al entrar.
- **Código de colores de los modelos — idéntico en TODA la presentación:**
  On-premises `#5B6470` (gris pizarra) · IaaS `#2563EB` (azul) · PaaS `#0E9F6E` (verde) · SaaS `#F2542D` (coral).
  “Tú administras” = amarillo `#FFD23F`; “El proveedor administra” = color del modelo.
- Proveedores (solo como acento en chips/bordes): AWS `#FF9900` (texto oscuro `#232F3E`),
  Azure `#0078D4`, Google Cloud `#4285F4` con un detalle de cuatro puntos (azul, rojo `#EA4335`,
  amarillo `#FBBC04`, verde `#34A853`).
- Tipografía (Google Fonts): títulos **Bricolage Grotesque** 700–800; cuerpo **Atkinson Hyperlegible**
  400/700 (máxima legibilidad al proyectar); etiquetas técnicas **JetBrains Mono**. Con respaldos del sistema.
- Legibilidad al proyectar: en una ventana de 1280×720 el texto de cuerpo no baja de ~22 px y los
  títulos rondan 48–64 px. Usa `clamp()` con unidades de viewport para escalar.
- Contraste AA como mínimo. Nada de texto gris claro sobre papel.
- Un tema único claro (pensado para proyector). Aun así, `body` lleva fondo explícito.

### Mascota: “Nubi”
Una nube con carita, dibujada en SVG (trazo de tinta, relleno blanco, mejillas amarillas), que aparece
en algunas diapositivas con un globo de diálogo para dar un consejo corto. Flota suavemente (animación
lenta). Tres expresiones como símbolos SVG distintos: `#nubi`, `#nubi-feliz`, `#nubi-pensando`.
No abuses: máximo una aparición por diapositiva y no en todas.

### Recuadros de ayuda (el sello “para principiantes”)
Cinco tipos, cada uno con icono SVG propio, etiqueta y color:
- **Recuerda** (amarillo) — idea clave.
- **Consejo** (verde) — tip práctico.
- **Cuidado** (rojo `#D7263D`) — error común o riesgo.
- **Cosas técnicas** (azul) — detalle para quien quiera profundizar.
- **¿Sabías que?** (morado `#7C3AED`) — dato curioso.

## 4. Diseño responsivo
- Cada diapositiva ocupa el viewport (`100dvh`). Contenido centrado con `max-width` ~1200 px y
  margen lateral mínimo de 16 px.
- En pantallas angostas (< 760 px) las rejillas se apilan en una columna y, si el contenido no cabe,
  la diapositiva hace scroll vertical interno. Nunca scroll horizontal del documento; las tablas van
  en un contenedor con `overflow-x: auto`.
- Probar mínimo en 1280×720, 1920×1080 y 390×844.

## 5. Reglas de colaboración (varios agentes trabajan en paralelo)
- Cada agente edita **solo** los archivos que su tarea le asigna. Los archivos compartidos
  (`template.html`, `base.css`, `components.css`, `deck.js`, `build.mjs`, `config.js`) son del agente
  de la base. Si una sección necesita algo nuevo, lo implementa dentro de su propio CSS/JS con prefijo
  de sección (`.s1-…`, `.s2-…`, `.s3-…`) y lo menciona en su reporte final.
- Iconos extra de una sección: sprite SVG oculto dentro de su propio archivo de diapositivas, con ids
  prefijados (`s2-i-…`).
- Todas las clases propias de una sección llevan su prefijo. JS envuelto en IIFE.
- Sin errores en la consola del navegador. `node build.mjs` debe terminar sin error.
- Comprobación visual: toma capturas con Edge o Chrome sin interfaz, por ejemplo
  `"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu --window-size=1280,720 --screenshot="captura.png" "file:///C:/Users/danie/Repositories/Computo%20en%20la%20nube/presentacion-iaas-paas-saas/index.html#/3"`
  (con `?all` en la URL — ver abajo — para que se vean todos los pasos). Guarda capturas en
  `docs/capturas/` (no en otra parte) y revísalas antes de terminar.
- El motor debe aceptar `?all=1` en la URL para mostrar todos los pasos revelados y animaciones
  terminadas (útil para capturas y para imprimir).
