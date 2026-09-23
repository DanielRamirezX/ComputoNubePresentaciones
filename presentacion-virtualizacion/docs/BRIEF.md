# Brief — "La nube por dentro: hilos, núcleos y máquinas virtuales"

Presentación web para **Cómputo en la Nube** (universidad, México, español). Es la
**segunda** presentación de la materia; la primera fue "IaaS, PaaS y SaaS" y ya se
impartió. Los alumnos **son novatos**: no saben qué es un hilo ni qué es un hipervisor.

Usa el **mismo motor y el mismo diseño** que `../presentacion-iaas-paas-saas`.
Los archivos `build.mjs`, `template.html`, `base.css`, `components.css`, `deck.js`
y `config.js` **ya están copiados y NO se tocan**.

El contenido exacto por diapositiva está en `docs/GUION.md`. **Respeta los datos
técnicos del guion: no inventes cifras, modelos de procesador ni nombres de menús.**
Puedes reescribir la redacción para que fluya, partir textos y elegir el diseño.

## Regla pedagógica número uno

Son principiantes. **Cada concepto se explica antes de usarse.** Nada de "como ya
saben". Cada diapositiva técnica necesita una analogía cotidiana antes de la
definición formal. El tono es el de la primera presentación: cálido, directo,
sin condescendencia.

## Contrato del motor (idéntico al de la otra presentación)

### Diapositiva
```html
<section class="slide s1-slide" id="s1-nucleo" data-section="El procesador por dentro" data-title="El núcleo">
  <div class="slide__inner">…</div>
  <aside class="notes">Notas para el docente.</aside>
</section>
```
- `id` único con prefijo de sección (`s0-`, `s1-`, `s2-`, `s3-`).
- `data-section` y `data-title` alimentan la barra inferior y el índice.
- Fondo opcional: `data-bg="amarillo"` o `data-bg="tinta"` (oscuro). Sin atributo = papel.
- **Toda diapositiva lleva `<aside class="notes">`** o el build avisa.

### Pasos
- Elemento con clase `step` = oculto hasta que el docente avanza. `data-step="n"`
  agrupa varios elementos en el mismo paso.
- El motor pone `.is-shown` al paso revelado y `data-step-current="n"` en la diapositiva.

### Animaciones
- `data-anim="fade-up | fade | pop | slide-left | slide-right | zoom | draw"`.
- Escalonado con `style="--d:3"` (retraso = --d × 90 ms).

### Ganchos de JS
```js
Deck.onSlide("s1-nucleo", { enter(slide){}, leave(slide){}, step(slide, i, dir){} });
```
Cada archivo de `js/sections/` va en una IIFE y solo toca elementos de su sección.
`Deck.flip(card, bool)` existe para las tarjetas volteables.

## Componentes que YA existen — úsalos, no reinventes

De `components.css`: `.eyebrow` · `.marker` (resaltado de marcador, con
`data-anim="draw-marker"`) · `.hand-underline` · `.body-copy` · `.grid grid--2|3|4|sidebar`
· `.model-card` · `.chip` · `.help-box` · `.step-list` · `.compare-wrap`+`.compare-table`
· `.flip-card` · `.nubi` · `.metric`.

**Los cinco recuadros de ayuda** (el sello "para principiantes"):
`help-box--recuerda` (amarillo, `#icon-foco`) · `--consejo` (verde) · `--cuidado`
(rojo, `#icon-alerta`) · `--tecnico` (azul, `#icon-engrane`) · `--sabias` (morado).

**Nubi**, la mascota: `#nubi`, `#nubi-feliz`, `#nubi-pensando`. Máximo una aparición
por diapositiva y **no en todas**.

Iconos del sprite ya disponibles: `#icon-cpu #icon-disco #icon-red #icon-servidor
#icon-nube #icon-engrane #icon-foco #icon-alerta #icon-check #icon-flecha #icon-reloj
#icon-candado #icon-llave #icon-libro #icon-cohete #icon-app #icon-codigo #icon-usuario
#icon-base-datos #icon-edificio #icon-casa #icon-globo #icon-estrella #icon-pin
#icon-dinero #icon-insignia #icon-mapa #icon-maleta #icon-cama`.
¿Necesitas otro? Va en un sprite SVG oculto **dentro de tu propio archivo de
diapositivas**, con id prefijado (`s1-i-hilo`).

## Dirección visual (no negociable)

"Cuaderno de apuntes con marcador amarillo". Papel `#FBF8EF`, tinta `#16181D`,
amarillo `#FFD23F`, bordes de 2–3 px, esquinas de 14 px, sombras duras `4px 4px 0`.
Nada de degradados morados ni glassmorphism.

Colores con significado **constante en toda la presentación**:
- **Núcleo físico** = tinta `#16181D`
- **Hilo / procesador lógico (vCPU)** = azul `#2563EB`
- **Anfitrión (host)** = gris pizarra `#5B6470`
- **Invitado (VM)** = verde `#0E9F6E`
- **Advertencia / costo** = rojo `#D7263D`

Tipografía: títulos Bricolage Grotesque, cuerpo Atkinson Hyperlegible, monoespaciada
JetBrains Mono. Al proyectar en 1280×720 el cuerpo no baja de ~22 px.

## Trampas de `base.css` (las dos las pisaron los agentes que hicieron esto)

Dos reglas del motor le ganan por especificidad a cualquier regla tuya de una sola clase:

```css
.slide h1, .slide h2, .slide h3, .slide p { margin-top: 0 }
.slide__inner > :last-child          { margin-bottom: 0 }
```

La primera anula en silencio los `margin-top` de tus párrafos; la segunda rompe el
centrado por márgenes automáticos del último hijo. La solución es prefijar tus reglas
con la clase de la diapositiva: `.s2-slide .s2-lead { margin-top: 18px }`.

## Capturas en Windows

Sin `--force-device-scale-factor=1`, Edge entrega 754×487 por el escalado de pantalla
y dispara el layout móvil, así que las capturas engañan. Y la ruta de `--screenshot`
debe ir en formato Windows absoluto; las relativas fallan en silencio. Lo que funciona:

```
--headless=new --no-sandbox --disable-gpu --force-device-scale-factor=1
--window-size=1280,720 --virtual-time-budget=6000
--screenshot="C:\ruta\absoluta\captura.png"
```

## Responsivo
Cada diapositiva ocupa `100dvh`, contenido a `max-width` ~1200 px. Bajo 760 px las
rejillas se apilan y la diapositiva hace scroll vertical interno. **Nunca** scroll
horizontal del documento; tablas en `.compare-wrap`.

## Reglas de colaboración (varios agentes en paralelo)
- Cada agente edita **solo** los archivos de su tarea. Los compartidos
  (`template.html`, `base.css`, `components.css`, `deck.js`, `build.mjs`, `config.js`)
  **no se tocan**.
- Todas las clases propias llevan el prefijo de su sección (`.s1-…`). JS en IIFE.
- Sin errores en la consola del navegador. `node build.mjs` debe terminar sin error.
- Verifica con capturas antes de terminar:
  ```
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu --window-size=1280,720 --screenshot="docs/capturas/sN-nombre.png" "file:///C:/Users/danie/Repositories/Computo%20en%20la%20nube/presentacion-virtualizacion/index.html?all=1#/7"
  ```
  Guarda en `docs/capturas/`. **Míralas** antes de reportar terminado.
- `?all=1` revela todos los pasos (para capturas).
