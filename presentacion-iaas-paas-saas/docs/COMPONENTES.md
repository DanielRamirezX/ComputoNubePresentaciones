# Catálogo de componentes

Este documento es la referencia para las secciones 1, 2 y 3. El build concatena los fragmentos HTML en orden alfabético, así que cada archivo de diapositivas debe contener únicamente uno o varios `<section class="slide">` completos. No edites `template.html`, `base.css`, `components.css`, `deck.js` ni `build.mjs` desde una sección.

## Contrato de una diapositiva

```html
<section class="slide s1-ejemplo" id="s1-ejemplo" data-section="Los tres modelos" data-title="Título corto">
  <div class="slide__inner">
    <span class="eyebrow">Etiqueta</span>
    <h2 class="slide-title">Título de la diapositiva</h2>
    <p class="slide-subtitle">Subtítulo opcional.</p>
    <!-- contenido -->
  </div>
  <aside class="notes">Notas para el docente. No aparecen en la diapositiva.</aside>
</section>
```

Los ids deben ser únicos y llevar el prefijo de su sección (`s1-`, `s2-` o `s3-`). Las clases propias también deben llevar ese prefijo, por ejemplo `.s1-stack__layer`. Usa `data-bg="amarillo"` para fondo amarillo o `data-bg="tinta"` para fondo oscuro. Sin atributo se usa papel.

## Pasos y animación

Un elemento `.step` comienza oculto. `data-step` agrupa varios elementos en un mismo avance; sin atributo, el motor usa el orden del DOM.

```html
<ul class="step-list">
  <li class="step s1-item" data-step="1">Primera idea</li>
  <li class="step s1-item" data-step="2">Segunda idea</li>
</ul>
```

El motor añade `.is-shown` y `data-step-current="n"` a la diapositiva. Al volver atrás desde una diapositiva anterior, el motor la muestra con todos sus pasos. `?all=1` muestra todos los pasos y deja las animaciones listas para capturas.

Elementos que aparecen al entrar pueden usar:

```html
<div data-anim="fade-up" style="--d:2">...</div>
```

Valores disponibles: `fade-up`, `fade`, `pop`, `slide-left`, `slide-right`, `zoom` y `draw`. El retraso es `--d × 90ms`. `draw` está pensado para trazos SVG. La clase `.step` se combina con una transición de entrada al revelarse; no añadas `data-anim` a un paso si no necesitas una animación propia.

## Tipografía, resaltados e iconos

```html
<span class="marker">texto resaltado</span>
<span class="hand-underline">texto subrayado a mano</span>
<span class="chip chip--aws">AWS</span>
<span class="model-badge model-badge--iaas">IaaS</span>
<svg class="icon"><use href="#icon-servidor"></use></svg>
```

Colores fijos: `--slate` on-premises, `--blue` IaaS, `--green` PaaS, `--coral` SaaS y `--yellow` para “tú administras”. Proveedores: `.chip--aws`, `.chip--azure`, `.chip--gcp`. No uses logos oficiales.

El sprite global está en `template.html`. Iconos disponibles: `#icon-nube`, `#icon-servidor`, `#icon-base-datos`, `#icon-codigo`, `#icon-app`, `#icon-usuario`, `#icon-edificio`, `#icon-casa`, `#icon-llave`, `#icon-candado`, `#icon-globo`, `#icon-foco`, `#icon-alerta`, `#icon-engrane`, `#icon-estrella`, `#icon-pin`, `#icon-check`, `#icon-flecha`, `#icon-dinero`, `#icon-reloj`, `#icon-cpu`, `#icon-disco`, `#icon-red`, `#icon-escudo`, `#icon-cohete`, `#icon-correo`, `#icon-insignia`, `#icon-libro`, `#icon-mapa`, `#icon-maleta` y `#icon-cama`. Para una sección que necesite un icono adicional, incluye un sprite local con id prefijado (`s1-i-nombre`).

## Recuadros de ayuda

```html
<div class="help-box help-box--consejo">
  <svg class="help-box__icon"><use href="#icon-foco"></use></svg>
  <div>
    <span class="help-box__label">Consejo</span>
    <p class="help-box__text">Una explicación breve y útil.</p>
  </div>
</div>
```

Variantes: `help-box--recuerda`, `help-box--consejo`, `help-box--cuidado`, `help-box--tecnico` y `help-box--sabias`. Usa una sola etiqueta por recuadro.

## Rejillas y tarjetas

```html
<div class="grid grid--3">
  <article class="model-card model-card--paas">
    <div class="model-card__head"><h3 class="model-card__title">PaaS</h3><span class="model-badge model-badge--paas">modelo</span></div>
    <p class="model-card__text">Texto breve.</p>
  </article>
</div>
```

Usa `.grid--2`, `.grid--3` o `.grid--4`. En pantallas angostas se apilan. `.grid--sidebar` sirve para una columna principal y una columna de apoyo. No construyas paneles tipo dashboard ni repitas cajas sin propósito.

## Tablas comparativas

Siempre envuelve la tabla para permitir scroll horizontal en celular:

```html
<div class="compare-wrap">
  <table class="compare-table">
    <thead><tr><th></th><th class="col-iaas">IaaS</th><th class="col-paas">PaaS</th><th class="col-saas">SaaS</th></tr></thead>
    <tbody><tr><th>Control</th><td>Mucho</td><td>Medio</td><td>Poco</td></tr></tbody>
  </table>
</div>
```

## Tarjetas volteables

```html
<button class="flip-card" type="button" aria-pressed="false">
  <span class="flip-card__inner">
    <span class="flip-card__face"><h3>Frente</h3><p>Pregunta o situación.</p></span>
    <span class="flip-card__face flip-card__face--back"><h3>Reverso</h3><p>Respuesta y explicación.</p></span>
  </span>
</button>
```

El botón es accesible por teclado. Para controlar una tarjeta desde JS: `Deck.flip(element, true)` o `Deck.flip(element, false)`. No uses ids globales para tarjetas de una sección.

## Nubi

```html
<div class="nubi">
  <svg class="nubi__image" aria-hidden="true"><use href="#nubi"></use></svg>
  <p class="nubi__bubble">Consejo corto, una aparición por diapositiva como máximo.</p>
</div>
```

Expresiones: `#nubi`, `#nubi-feliz` y `#nubi-pensando`. Nubi ya tiene flotación suave; no agregues más de una aparición por diapositiva.

## API del motor

Cada JS de sección debe estar en una IIFE y registrarse así:

```js
(function () {
  Deck.onSlide("s1-ejemplo", {
    enter(slideEl) {},
    leave(slideEl) {},
    step(slideEl, stepIndex, direction) {}
  });
})();
```

`direction` vale `1` al avanzar y `-1` al retroceder. También existe `Deck.next()`, `Deck.previous()`, `Deck.goTo(index)`, y `Deck.flip(element, bool)`. El índice es base 0 para la API y base 1 en el hash `#/n`.

El motor emite `document` → `CustomEvent("deck:change", { detail: { index, id, slide } })`. Si necesitas escuchar cambios:

```js
document.addEventListener("deck:change", (event) => {
  const { id, slide } = event.detail;
  // Solo modifica elementos de tu propia sección.
});
```

## Convenciones

- JS de sección: IIFE, solo clases e ids de su prefijo.
- CSS de sección: prefijo obligatorio (`.s1-`, `.s2-`, `.s3-`).
- Iconos extra: sprite local con ids prefijados.
- No dependencias npm, CDNs de JS ni imágenes externas.
- Conserva exactamente los textos, cifras, nombres de servicios y sentido de `docs/GUION.md`.
- Los textos de notas siempre van en `<aside class="notes">`.
- Antes de entregar ejecuta `node build.mjs`, abre `index.html` con `file://` y prueba en 1280×720 y 390×844.
