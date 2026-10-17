// ---------------------------------------------------------------------------
// LAS PIEZAS DE LA CONSOLA
//
// Componentes con el aspecto de Cloudscape en modo oscuro (el sistema de diseño
// de la consola de AWS): botones, menús «Actions ▾», selectores, tablas con
// selección, pestañas, alertas, modales, el estado con su ícono…
//
// Todo se arma con DOM (la función h), nunca con innerHTML de texto del
// alumno: los nombres que escribe se pintan como texto. Los únicos innerHTML
// son los íconos SVG constantes de este archivo.
//
// Los componentes que necesitan la consola (ayuda, refresco cada segundo)
// reciben `cx`, el contexto que arma consola.js. Ver NUCLEO.md.
// ---------------------------------------------------------------------------

/* ===================================================================== DOM */

const PROPIEDADES = new Set(['value', 'checked', 'disabled', 'selected', 'indeterminate', 'readOnly', 'multiple']);

/**
 * h('div', { class: 'x', onclick: fn, 'aria-label': '…' }, 'texto', otroNodo, [lista])
 * Los textos se agregan como nodos de texto (seguro). null/false/undefined se ignoran.
 */
export function h(etiqueta, props, ...hijos) {
  const el = document.createElement(etiqueta);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (PROPIEDADES.has(k)) {
        el[k] = v;
        // También como atributo, para que se note al comparar el HTML (ver vivo()).
        if (k !== 'value' && k !== 'indeterminate') el.setAttribute(k.toLowerCase(), '');
        else if (k === 'value' && etiqueta !== 'textarea') el.setAttribute('value', String(v));
      } else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  agregar(el, hijos);
  return el;
}

export function agregar(el, hijos) {
  for (const c of [hijos].flat(Infinity)) {
    if (c === null || c === undefined || c === false || c === true) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Vacía un elemento y le pone hijos nuevos. */
export function reemplazar(el, ...hijos) {
  el.replaceChildren();
  return agregar(el, hijos);
}

/** El texto plano de lo que devuelve una columna (texto o nodo), para filtrar y ordenar. */
export const textoDe = (v) => (v instanceof Node ? v.textContent : v === null || v === undefined ? '' : String(v));

let contadorIds = 0;
export const idUnico = (pre = 'cx') => `${pre}-${++contadorIds}`;

/**
 * Una zona que se vuelve a pintar a mano: const z = region(() => nodo); z.repintar().
 * La función puede devolver un nodo, texto o una lista.
 */
export function region(fn, { etiqueta = 'div', clase } = {}) {
  const el = h(etiqueta, { class: clase });
  el.repintar = () => reemplazar(el, fn());
  el.repintar();
  return el;
}

/* ================================================================= íconos */

const SVG = {
  'caret-down': '<path d="M4 6h8l-4 5z" fill="currentColor" stroke="none"/>',
  'caret-up': '<path d="M4 10h8l-4-5z" fill="currentColor" stroke="none"/>',
  'caret-right': '<path d="M6 4v8l5-4z" fill="currentColor" stroke="none"/>',
  'angle-left': '<path d="M10 2 4 8l6 6"/>',
  'angle-right': '<path d="m6 2 6 6-6 6"/>',
  'angle-down': '<path d="m2 5 6 6 6-6"/>',
  'angle-up': '<path d="m2 11 6-6 6 6"/>',
  search: '<circle cx="7" cy="7" r="5"/><path d="m11 11 4 4"/>',
  refresh: '<path d="M14 8a6 6 0 1 1-1.8-4.3"/><path d="M13 1v3.5H9.5"/>',
  settings: '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>',
  copy: '<rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M2 11V3a1 1 0 0 1 1-1h8"/>',
  external: '<path d="M10 2h4v4M14 2 7.5 8.5M12 9.5V14H2V4h4.5"/>',
  close: '<path d="m3 3 10 10M13 3 3 13"/>',
  'status-positive': '<circle cx="8" cy="8" r="7"/><path d="m4.8 8.2 2.2 2.2 4.2-4.6"/>',
  'status-negative': '<circle cx="8" cy="8" r="7"/><path d="m5.5 5.5 5 5M10.5 5.5l-5 5"/>',
  'status-warning': '<path d="M8 1.5 15 14.5H1z" stroke-linejoin="round"/><path d="M8 6v4M8 12v.5"/>',
  'status-info': '<circle cx="8" cy="8" r="7"/><path d="M8 7v5M8 4.2v.6"/>',
  'status-stopped': '<circle cx="8" cy="8" r="7"/><path d="M5 8h6"/>',
  'status-pending': '<circle cx="8" cy="8" r="7"/><path d="M8 4v4l2.6 1.6"/>',
  spinner: '<path d="M8 1a7 7 0 1 0 7 7"/>',
  menu: '<path d="M2 3.5h12M2 8h12M2 12.5h12"/>',
  notification: '<path d="M4 11V7a4 4 0 0 1 8 0v4l1.5 1.5h-11z" stroke-linejoin="round"/><path d="M6.5 14.5h3"/>',
  help: '<circle cx="8" cy="8" r="7"/><path d="M6 6.2a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9v.8M8 11.6v.6"/>',
  terminal: '<rect x="1" y="2" width="14" height="12" rx="1.5"/><path d="m4 6 2.5 2L4 10M8.5 10.5H12"/>',
  user: '<circle cx="8" cy="5" r="3"/><path d="M2 15c0-3.2 2.7-5 6-5s6 1.8 6 5"/>',
  grid: '<rect x="1.5" y="1.5" width="3" height="3"/><rect x="6.5" y="1.5" width="3" height="3"/><rect x="11.5" y="1.5" width="3" height="3"/><rect x="1.5" y="6.5" width="3" height="3"/><rect x="6.5" y="6.5" width="3" height="3"/><rect x="11.5" y="6.5" width="3" height="3"/><rect x="1.5" y="11.5" width="3" height="3"/><rect x="6.5" y="11.5" width="3" height="3"/><rect x="11.5" y="11.5" width="3" height="3"/>',
  globe: '<circle cx="8" cy="8" r="7"/><path d="M1 8h14M8 1c2 2 3 4.5 3 7s-1 5-3 7c-2-2-3-4.5-3-7s1-5 3-7z"/>',
  edit: '<path d="m11 1.5 3.5 3.5-9 9H2v-3.5z" stroke-linejoin="round"/>',
  upload: '<path d="M8 11V2M4 6l4-4 4 4M2 14h12"/>',
  download: '<path d="M8 2v9M4 7l4 4 4-4M2 14h12"/>',
  star: '<path d="m8 1.5 2 4.3 4.6.5-3.4 3.1 1 4.6L8 11.6 3.8 14l1-4.6L1.4 6.3 6 5.8z" stroke-linejoin="round"/>',
  'star-filled': '<path d="m8 1.5 2 4.3 4.6.5-3.4 3.1 1 4.6L8 11.6 3.8 14l1-4.6L1.4 6.3 6 5.8z" fill="currentColor" stroke-linejoin="round"/>',
  lock: '<rect x="3" y="7" width="10" height="7.5" rx="1"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/>',
  'zoom-in': '<circle cx="7" cy="7" r="5"/><path d="m11 11 4 4M5 7h4M7 5v4"/>',
  'zoom-out': '<circle cx="7" cy="7" r="5"/><path d="m11 11 4 4M5 7h4"/>',
  add: '<path d="M8 2v12M2 8h12"/>',
  remove: '<path d="M2 4h12M6 4V2h4v2M4 4l1 10h6l1-10"/>',
  'arrow-left': '<path d="M14 8H2M7 3 2 8l5 5"/>',
  'arrow-right': '<path d="M2 8h12M9 3l5 5-5 5"/>',
  browser: '<rect x="1" y="2" width="14" height="12" rx="1.5"/><path d="M1 5.5h14M3.5 3.8h.1M5.5 3.8h.1"/>',
  check: '<path d="m2.5 8.5 3.5 3.5 7.5-8"/>',
  filter: '<path d="M1.5 2.5h13L9.5 8.5v5l-3-1.5v-3.5z" stroke-linejoin="round"/>',
  file: '<path d="M3 1.5h6.5L13 5v9.5H3z" stroke-linejoin="round"/><path d="M9.5 1.5V5H13"/>',
  'split-panel': '<rect x="1.5" y="1.5" width="13" height="13" rx="1.5"/><path d="M1.5 9.5h13"/>',
  expand: '<path d="M9.5 2H14v4.5M6.5 14H2V9.5M14 2 9 7M2 14l5-5"/>',
  info: '<circle cx="8" cy="8" r="7"/><path d="M8 7v5M8 4.2v.6"/>',
  'sad-page': '<path d="M3 1.5h7L13 4.5v10H3z"/><path d="M5.5 8h.1M10.5 8h.1M5.5 12c1.5-1.4 3.5-1.4 5 0"/>',
  key: '<circle cx="5" cy="11" r="3.2"/><path d="m7.3 8.7 6.2-6.2M11 5l2 2M12.5 3.5 14 5"/>'
};

/** Un ícono SVG de 16 px que hereda el color del texto. */
export function icono(nombre, clase = '') {
  const span = document.createElement('span');
  span.className = `cx-icono ${clase}`.trim();
  span.setAttribute('aria-hidden', 'true');
  // SVG constante de este archivo: no lleva datos del alumno.
  span.innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">${SVG[nombre] ?? ''}</svg>`;
  return span;
}

/* ===================================================== íconos de servicio */


export const CATEGORIAS = {
  computo: { nombre: 'Compute', color: '#ed7100', glifo: '<rect x="6" y="6" width="12" height="12" rx="1"/><path d="M9 2.5v3.5M15 2.5v3.5M9 18v3.5M15 18v3.5M2.5 9h3.5M2.5 15h3.5M18 9h3.5M18 15h3.5M9.5 9.5h5v5h-5z"/>' },
  redes: { nombre: 'Networking & Content Delivery', color: '#8c4fff', glifo: '<rect x="3" y="3" width="18" height="18" rx="2.5" stroke-dasharray="3.2 2.2"/><circle cx="12" cy="12" r="3.2"/><path d="M12 3v5.8M12 15.2V21"/>' },
  almacenamiento: { nombre: 'Storage', color: '#7aa116', glifo: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6l1.8 12.5c.3 1.6 2.9 2.5 6.2 2.5s5.9-.9 6.2-2.5L20 6"/>' },
  seguridad: { nombre: 'Security, Identity, & Compliance', color: '#dd344c', glifo: '<path d="M12 2.5 19.5 5.5v6c0 4.6-3.2 8.3-7.5 10-4.3-1.7-7.5-5.4-7.5-10v-6z" stroke-linejoin="round"/><circle cx="12" cy="10.5" r="2"/><path d="M12 12.5v3.5"/>' },
  general: { nombre: 'General', color: '#5f6b7a', glifo: '<path d="M4 12h16M12 4v16"/>' }
};

/** El cuadrito de color de un servicio (sin logotipos de AWS: un glifo genérico por categoría). */
export function iconoServicio(servicio, tamano = 16) {
  const cat = CATEGORIAS[servicio?.categoria] ?? CATEGORIAS.general;
  const span = document.createElement('span');
  span.className = 'cx-icono-servicio';
  span.style.background = cat.color;
  span.style.width = span.style.height = `${tamano}px`;
  span.setAttribute('aria-hidden', 'true');
  // SVG constante: no lleva datos del alumno.
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${Math.round(tamano * 0.78)}" height="${Math.round(tamano * 0.78)}" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round">${cat.glifo}</svg>`;
  return span;
}

/* ============================================================== botones */

/**
 * boton('Create VPC', { variante: 'primario' | 'normal' | 'enlace' | 'icono' | 'texto',
 *   icono, iconoDerecha, alClic, desactivado, titulo, escribe, tipo: 'button' | 'submit', clase })
 * Los botones primarios (y los que llevan escribe: true) se apagan solos en modo de solo lectura.
 */
export function boton(texto, op = {}) {
  const variante = op.variante ?? 'normal';
  const escribe = op.escribe ?? variante === 'primario';
  return h(
    'button',
    {
      type: op.tipo ?? 'button',
      class: ['cx-boton', `cx-boton--${variante}`, op.clase],
      disabled: op.desactivado,
      title: op.titulo,
      'aria-label': op.etiquetaAccesible ?? (variante === 'icono' ? op.titulo : undefined),
      'data-escribe': escribe ? '' : undefined,
      onclick: (e) => {
        if (escribe && e.currentTarget.closest('.cx-solo')) return;
        op.alClic?.(e);
      }
    },
    op.icono ? icono(op.icono) : null,
    texto ? h('span', {}, texto) : null,
    op.iconoDerecha ? icono(op.iconoDerecha) : null
  );
}

/** Botón redondo de refrescar, como el de las tablas de la consola. */
export const botonRefrescar = (alClic) => boton('', { variante: 'icono-borde', icono: 'refresh', titulo: 'Refresh', alClic });

/** Un enlace azul de la consola. `destino`: función o ruta interna (con cx). */
export function enlace(texto, destino, op = {}) {
  return h(
    'a',
    {
      class: ['cx-enlace', op.clase],
      href: '#',
      title: op.titulo,
      onclick: (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof destino === 'function') destino(e);
        else op.cx?.ir(destino);
      }
    },
    texto,
    op.externo ? icono('external', 'cx-icono--chico') : null
  );
}

/** «Info»: abre el panel de ayuda (en español) a la derecha. */
export function info(cx, tema) {
  if (!tema) return null;
  return h(
    'button',
    {
      type: 'button',
      class: 'cx-info',
      onclick: (e) => {
        e.preventDefault();
        e.stopPropagation();
        cx.ayuda(tema);
      }
    },
    'Info'
  );
}

/* ========================================================== desplegables */

let abierto = null; // { panel, cerrar } el desplegable abierto (uno a la vez)

/** Cierra el menú o selector abierto, si hay. */
export function cerrarDesplegable() {
  if (abierto) abierto.cerrar();
}

/**
 * Abre un panel flotante pegado a `ancla` en la capa de la consola (.cx-capa),
 * para que no lo corte el scroll ni lo borre un repintado. Devuelve { panel, cerrar }.
 */
export function abrirDesplegable(ancla, contenido, { ancho, minAncho, alinear = 'izquierda', clase, alCerrar, encima = false } = {}) {
  cerrarDesplegable();
  const raiz = ancla.closest('.cx');
  const capa = raiz?.querySelector(':scope > .cx-capa');
  if (!capa) return null;
  const panel = h('div', { class: ['cx-desplegable', clase] });
  agregar(panel, contenido);
  capa.append(panel);

  const colocar = () => {
    const r = ancla.getBoundingClientRect();
    const base = raiz.getBoundingClientRect();
    const w = ancho ?? Math.max(minAncho ?? 0, r.width);
    panel.style.width = `${w}px`;
    let x = alinear === 'derecha' ? r.right - base.left - w : r.left - base.left;
    x = Math.max(4, Math.min(x, base.width - w - 4));
    panel.style.left = `${x}px`;
    const abajo = base.bottom - r.bottom;
    const alto = Math.min(panel.scrollHeight, 420);
    if (!encima && (abajo > alto + 8 || abajo > r.top - base.top)) {
      panel.style.top = `${r.bottom - base.top + 2}px`;
      panel.style.maxHeight = `${Math.max(120, abajo - 12)}px`;
    } else {
      panel.style.bottom = `${base.bottom - r.top + 2}px`;
      panel.style.maxHeight = `${Math.max(120, r.top - base.top - 12)}px`;
    }
  };
  colocar();

  const fuera = (e) => {
    if (!panel.contains(e.target) && !ancla.contains(e.target)) cerrar();
  };
  const tecla = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      cerrar();
      ancla.focus?.();
    }
  };
  const desplazar = (e) => {
    if (!panel.contains(e.target)) cerrar();
  };
  setTimeout(() => {
    document.addEventListener('mousedown', fuera, true);
    raiz.addEventListener('scroll', desplazar, true);
  });
  panel.addEventListener('keydown', tecla);
  ancla.addEventListener('keydown', tecla);
  window.addEventListener('resize', cerrarDesplegable);

  function cerrar() {
    document.removeEventListener('mousedown', fuera, true);
    raiz.removeEventListener('scroll', desplazar, true);
    ancla.removeEventListener('keydown', tecla);
    window.removeEventListener('resize', cerrarDesplegable);
    panel.remove();
    ancla.setAttribute?.('aria-expanded', 'false');
    if (abierto?.panel === panel) abierto = null;
    alCerrar?.();
  }
  ancla.setAttribute?.('aria-expanded', 'true');
  abierto = { panel, cerrar };
  return abierto;
}

/** Flechas arriba/abajo entre los botones de un menú. */
function navegarConFlechas(panel, selector) {
  panel.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const lista = [...panel.querySelectorAll(selector)].filter((b) => !b.disabled && b.offsetParent !== null);
    if (!lista.length) return;
    e.preventDefault();
    const i = lista.indexOf(document.activeElement);
    const sig = e.key === 'ArrowDown' ? (i + 1) % lista.length : (i - 1 + lista.length) % lista.length;
    lista[sig].focus();
  });
}

/**
 * Menú desplegable («Actions ▾», «Instance state ▾»).
 * items: [{ texto, alClic, desactivado, escribe, externo, descripcion, items: [submenú] } | { grupo: 'Monitor', items } | '-']
 * `items` puede ser una función (se evalúa al abrir, con la selección del momento).
 */
export function menuBoton(texto, items, op = {}) {
  const b = boton(texto, {
    variante: op.variante ?? 'normal',
    iconoDerecha: 'caret-down',
    desactivado: op.desactivado,
    escribe: false,
    clase: 'cx-boton--menu',
    alClic: () => {
      if (abierto && abierto.ancla === b) return cerrarDesplegable();
      const lista = typeof items === 'function' ? items() : items;
      const panel = h('div', { class: 'cx-menu', role: 'menu' }, pintarItems(lista, b));
      const d = abrirDesplegable(b, panel, { minAncho: op.ancho ?? 220, alinear: op.alinear ?? 'derecha', clase: 'cx-desplegable--menu' });
      if (d) {
        d.ancla = b;
        navegarConFlechas(d.panel, '.cx-menu__item');
        d.panel.querySelector('.cx-menu__item:not([disabled])')?.focus();
      }
    }
  });
  b.setAttribute('aria-haspopup', 'menu');
  return b;
}

function pintarItems(lista, ancla) {
  const salida = [];
  for (const it of lista) {
    if (!it) continue;
    if (it === '-') {
      salida.push(h('div', { class: 'cx-menu__separador', role: 'separator' }));
      continue;
    }
    if (it.grupo) {
      salida.push(h('div', { class: 'cx-menu__grupo' }, h('div', { class: 'cx-menu__grupo-titulo' }, it.grupo), pintarItems(it.items, ancla)));
      continue;
    }
    if (it.items) {
      const sub = h('div', { class: 'cx-menu cx-menu--sub', role: 'menu' }, pintarItems(it.items, ancla));
      const fila = h(
        'div',
        { class: 'cx-menu__padre' },
        h(
          'button',
          {
            type: 'button',
            class: 'cx-menu__item',
            role: 'menuitem',
            'aria-haspopup': 'menu',
            disabled: it.desactivado,
            onclick: () => abrirSub(fila),
            onkeydown: (e) => {
              if (e.key === 'ArrowRight' || e.key === 'Enter') {
                e.preventDefault();
                abrirSub(fila);
                sub.querySelector('.cx-menu__item:not([disabled])')?.focus();
              }
            }
          },
          h('span', {}, it.texto),
          icono('caret-right')
        ),
        sub
      );
      fila.addEventListener('mouseenter', () => !it.desactivado && abrirSub(fila));
      sub.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          e.stopPropagation();
          fila.classList.remove('cx-menu__padre--abierto');
          fila.querySelector('.cx-menu__item').focus();
        }
      });
      salida.push(fila);
      continue;
    }
    salida.push(
      h(
        'button',
        {
          type: 'button',
          class: 'cx-menu__item',
          role: 'menuitem',
          disabled: it.desactivado,
          'data-escribe': it.escribe ? '' : undefined,
          title: it.titulo,
          onclick: (e) => {
            if (it.escribe && e.currentTarget.closest('.cx-solo')) return;
            cerrarDesplegable();
            it.alClic?.();
          },
          onmouseenter: (e) => {
            // Al pasar por un item normal se cierran los submenús hermanos.
            const padre = e.currentTarget.parentElement;
            padre?.querySelectorAll(':scope > .cx-menu__padre--abierto').forEach((f) => f.classList.remove('cx-menu__padre--abierto'));
          }
        },
        h('span', {}, it.texto, it.nuevo ? h('em', { class: 'cx-menu__nuevo' }, ' - new') : null),
        it.externo ? icono('external', 'cx-icono--chico') : null,
        it.descripcion ? h('small', { class: 'cx-menu__desc' }, it.descripcion) : null
      )
    );
  }
  return salida;
}

function abrirSub(fila) {
  const menu = fila.parentElement;
  menu.querySelectorAll(':scope > .cx-menu__padre--abierto').forEach((f) => f !== fila && f.classList.remove('cx-menu__padre--abierto'));
  fila.classList.add('cx-menu__padre--abierto');
  // ¿Cabe a la derecha? Si no, el submenú sale a la izquierda (como en la captura de EC2).
  const raiz = fila.closest('.cx');
  const r = fila.getBoundingClientRect();
  const limite = raiz.getBoundingClientRect().right;
  fila.classList.toggle('cx-menu__padre--izquierda', r.right + 250 > limite);
}

/* ============================================================ formularios */

/**
 * Un campo de formulario: etiqueta (con «Info»), descripción, el control,
 * la restricción gris de abajo y el error rojo.
 */
export function campo(op) {
  const id = op.id ?? idUnico('campo');
  const control = op.control;
  if (control instanceof Element && !control.id && /^(INPUT|TEXTAREA|SELECT)$/.test(control.tagName)) control.id = id;
  const el = h(
    'div',
    { class: ['cx-campo', op.error && 'cx-campo--error', op.clase] },
    op.etiqueta
      ? h(
          'div',
          { class: 'cx-campo__cabeza' },
          h('label', { class: 'cx-campo__etiqueta', for: control?.id || undefined }, op.etiqueta, op.opcional ? h('i', {}, ' - optional') : null, op.requerido ? h('i', {}, ' - required') : null),
          op.info && op.cx ? [h('span', { class: 'cx-campo__barra' }), info(op.cx, op.info)] : null
        )
      : null,
    op.descripcion ? h('div', { class: 'cx-campo__desc' }, op.descripcion) : null,
    h('div', { class: 'cx-campo__control' }, control),
    op.error ? h('div', { class: 'cx-campo__error', role: 'alert' }, icono('status-negative'), h('span', {}, op.error)) : null,
    op.restriccion ? h('div', { class: 'cx-campo__restriccion' }, op.restriccion) : null
  );
  // Como en la consola: el error rojo se va en cuanto el alumno corrige el campo.
  if (op.error) {
    el.addEventListener(
      'input',
      () => {
        el.classList.remove('cx-campo--error');
        el.querySelector(':scope > .cx-campo__error')?.remove();
      },
      { once: true }
    );
  }
  return el;
}

/** <input> con estilo. alCambiar(valor) en cada tecla. `sufijo`: texto gris a la derecha («65,536 IPs»). */
export function entrada(op = {}) {
  const inp = h('input', {
    class: ['cx-entrada', op.invalido && 'cx-entrada--invalida', op.clase],
    type: op.tipo ?? 'text',
    value: op.valor ?? '',
    placeholder: op.placeholder,
    disabled: op.desactivado,
    readOnly: op.soloLectura,
    min: op.min,
    max: op.max,
    id: op.id,
    'aria-label': op.etiquetaAccesible,
    autocomplete: 'off',
    spellcheck: 'false',
    oninput: (e) => op.alCambiar?.(e.target.value, e),
    onkeydown: (e) => {
      if (e.key === 'Enter') op.alEnter?.(e.target.value, e);
    }
  });
  if (op.sufijo === undefined && !op.buscar) return inp;
  return h(
    'div',
    { class: ['cx-entrada-envoltura', op.buscar && 'cx-entrada-envoltura--buscar'] },
    op.buscar ? icono('search', 'cx-entrada__lupa') : null,
    inp,
    op.sufijo !== undefined ? h('span', { class: 'cx-entrada__sufijo' }, typeof op.sufijo === 'function' ? op.sufijo() : op.sufijo) : null
  );
}

/** <textarea>. */
export function area(op = {}) {
  return h('textarea', {
    class: ['cx-area', op.monoespaciado && 'cx-area--mono', op.clase],
    rows: op.filas ?? 6,
    placeholder: op.placeholder,
    disabled: op.desactivado,
    readOnly: op.soloLectura,
    id: op.id,
    value: op.valor ?? '',
    spellcheck: 'false',
    'aria-label': op.etiquetaAccesible,
    oninput: (e) => op.alCambiar?.(e.target.value)
  });
}

/** Casilla con etiqueta y descripción. */
export function casilla(op = {}) {
  return h(
    'label',
    { class: ['cx-casilla', op.desactivado && 'cx-casilla--desactivada', op.clase] },
    h('input', {
      type: 'checkbox',
      checked: op.marcada,
      disabled: op.desactivado,
      'aria-label': op.etiqueta ? undefined : op.etiquetaAccesible,
      onchange: (e) => op.alCambiar?.(e.target.checked)
    }),
    op.etiqueta || op.descripcion
      ? h('span', { class: 'cx-casilla__texto' }, h('span', { class: 'cx-casilla__etiqueta' }, op.etiqueta), op.descripcion ? h('span', { class: 'cx-casilla__desc' }, op.descripcion) : null)
      : null
  );
}

/** Interruptor (toggle) de Cloudscape. */
export function interruptor(op = {}) {
  return h(
    'label',
    { class: ['cx-interruptor', op.desactivado && 'cx-casilla--desactivada'] },
    h('input', { type: 'checkbox', role: 'switch', checked: op.marcada, disabled: op.desactivado, onchange: (e) => op.alCambiar?.(e.target.checked) }),
    h('span', { class: 'cx-interruptor__pista' }),
    op.etiqueta ? h('span', {}, op.etiqueta) : null
  );
}

/** Grupo de radios. opciones: [{ valor, etiqueta, descripcion, desactivado }] */
export function radios(op) {
  const nombre = op.nombre ?? idUnico('radio');
  return h(
    'div',
    { class: ['cx-radios', op.horizontal && 'cx-radios--horizontal'], role: 'radiogroup' },
    op.opciones.map((o) =>
      h(
        'label',
        { class: ['cx-radio', o.desactivado && 'cx-casilla--desactivada'] },
        h('input', {
          type: 'radio',
          name: nombre,
          value: o.valor,
          checked: o.valor === op.valor,
          disabled: o.desactivado,
          onchange: () => op.alCambiar?.(o.valor)
        }),
        h('span', { class: 'cx-casilla__texto' }, h('span', { class: 'cx-casilla__etiqueta' }, o.etiqueta), o.descripcion ? h('span', { class: 'cx-casilla__desc' }, o.descripcion) : null)
      )
    )
  );
}

/** Tarjetas-radio («VPC only» / «VPC and more», «Create security group» / «Select existing»). */
export function tarjetas(op) {
  const nombre = op.nombre ?? idUnico('tarjeta');
  return h(
    'div',
    { class: 'cx-tarjetas', role: 'radiogroup', style: op.columnas ? { gridTemplateColumns: `repeat(${op.columnas}, minmax(0, 1fr))` } : undefined },
    op.opciones.map((o) =>
      h(
        'label',
        { class: ['cx-tarjeta', o.valor === op.valor && 'cx-tarjeta--activa', o.desactivado && 'cx-casilla--desactivada'] },
        h('input', { type: 'radio', name: nombre, checked: o.valor === op.valor, disabled: o.desactivado, onchange: () => op.alCambiar?.(o.valor) }),
        h('span', { class: 'cx-casilla__texto' }, h('span', { class: 'cx-casilla__etiqueta' }, o.etiqueta), o.descripcion ? h('span', { class: 'cx-casilla__desc' }, o.descripcion) : null)
      )
    )
  );
}

/** Control segmentado («None | In 1 AZ | 1 per AZ»). */
export function segmentado(op) {
  return h(
    'div',
    { class: 'cx-segmentado', role: 'group', 'aria-label': op.etiquetaAccesible },
    op.opciones.map((o) =>
      h(
        'button',
        {
          type: 'button',
          class: ['cx-segmentado__op', o.valor === op.valor && 'cx-segmentado__op--activa'],
          'aria-pressed': o.valor === op.valor ? 'true' : 'false',
          disabled: o.desactivado,
          title: o.titulo,
          onclick: () => op.alCambiar?.(o.valor)
        },
        o.etiqueta
      )
    )
  );
}

/**
 * Editor de etiquetas (Key / Value - optional / Remove, «Add new tag»).
 * `filas` es una lista [{ llave, valor }] que el editor cambia en su lugar.
 */
export function editorEtiquetas({ filas, alCambiar, max = 50 }) {
  const el = region(() => [
    filas.length
      ? h(
          'div',
          { class: 'cx-reglas', style: { gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) auto' } },
          h('div', { class: 'cx-reglas__cabeza' }, 'Key'),
          h('div', { class: 'cx-reglas__cabeza' }, 'Value', h('i', { style: { fontWeight: 400 } }, ' - optional')),
          h('div'),
          filas.map((f, i) => [
            entrada({ valor: f.llave, placeholder: 'Enter key', etiquetaAccesible: 'Key', alCambiar: (v) => ((f.llave = v), alCambiar?.(filas)) }),
            entrada({ valor: f.valor, placeholder: 'Enter value', etiquetaAccesible: 'Value', alCambiar: (v) => ((f.valor = v), alCambiar?.(filas)) }),
            boton('Remove', { alClic: () => (filas.splice(i, 1), el.repintar(), alCambiar?.(filas)) })
          ])
        )
      : h('p', { class: 'cx-texto-sec' }, 'No tags associated with the resource.'),
    h(
      'div',
      { style: { marginTop: '10px' } },
      boton('Add new tag', { desactivado: filas.length >= max, alClic: () => (filas.push({ llave: '', valor: '' }), el.repintar(), alCambiar?.(filas)) }),
      h('div', { class: 'cx-campo__restriccion', style: { marginTop: '4px' } }, `You can add ${max - filas.length} more tags.`)
    )
  ]);
  return el;
}

/** El valor de la etiqueta Name de un editor de etiquetas. */
export const nombreDeEtiquetas = (filas) => (filas.find((f) => f.llave.trim() === 'Name')?.valor ?? '').trim();

/* ============================================================== selectores */

function pintarOpcion(o, { seleccionada, multiple } = {}) {
  return [
    multiple ? h('span', { class: ['cx-opcion__casilla', seleccionada && 'cx-opcion__casilla--si'] }, seleccionada ? icono('check') : null) : null,
    o.icono ? o.icono : null,
    h(
      'span',
      { class: 'cx-opcion__cuerpo' },
      h('span', { class: 'cx-opcion__fila' }, h('span', { class: 'cx-opcion__etiqueta' }, o.etiqueta), o.etiquetaDerecha ? h('span', { class: 'cx-opcion__derecha' }, o.etiquetaDerecha) : null),
      o.descripcion ? h('span', { class: 'cx-opcion__desc' }, o.descripcion) : null,
      o.etiquetas?.length ? h('span', { class: 'cx-opcion__etiquetas' }, o.etiquetas.map((t) => h('span', {}, t))) : null
    ),
    !multiple && seleccionada ? icono('check', 'cx-opcion__check') : null
  ];
}

/**
 * Selector de Cloudscape (Select / Multiselect).
 *   opciones: [{ valor, etiqueta, descripcion, etiquetas: [], etiquetaDerecha, desactivado, grupo }]
 *   valor (o valores si multiple), alCambiar(valor | valores), placeholder, filtrar, filtroPlaceholder,
 *   opcionLibre(texto) → opción | null (agrega «Use: …» con lo que escribió), vacio: 'No options',
 *   desactivado, invalido, multiple, ancho
 * El elemento devuelto tiene .valor (lo elegido).
 */
export function selector(op) {
  const multiple = Boolean(op.multiple);
  let valor = multiple ? [...(op.valores ?? [])] : op.valor ?? null;
  const opciones = () => (typeof op.opciones === 'function' ? op.opciones() : op.opciones);
  const disparador = h('button', {
    type: 'button',
    class: ['cx-select', op.invalido && 'cx-select--invalido', op.compacto && 'cx-select--compacto'],
    disabled: op.desactivado,
    'aria-haspopup': 'listbox',
    'aria-label': op.etiquetaAccesible,
    id: op.id,
    onclick: () => (abierto?.ancla === disparador ? cerrarDesplegable() : abrir())
  });
  const fichas = multiple ? h('div', { class: 'cx-fichas' }) : null;
  const cont = multiple ? h('div', { class: 'cx-multiselect' }, disparador, fichas) : disparador;

  function pintar() {
    const lista = opciones();
    let cuerpo;
    if (multiple) {
      cuerpo = h('span', { class: 'cx-select__placeholder' }, op.placeholder ?? 'Select');
      reemplazar(
        fichas,
        valor.map((v) => {
          const o = lista.find((x) => x.valor === v) ?? { valor: v, etiqueta: v };
          return h(
            'span',
            { class: 'cx-ficha' },
            h('span', { class: 'cx-ficha__texto' }, h('span', {}, o.etiqueta), o.descripcion ? h('small', {}, o.descripcion) : null),
            h('button', { type: 'button', class: 'cx-ficha__quitar', 'aria-label': `Remove ${o.etiqueta}`, disabled: op.desactivado, onclick: () => cambiar(valor.filter((x) => x !== v)) }, icono('close'))
          );
        })
      );
    } else {
      const o = lista.find((x) => x.valor === valor) ?? (valor !== null && valor !== undefined && valor !== '' && op.mostrarLibre ? op.mostrarLibre(valor) : null);
      cuerpo = o
        ? h('span', { class: 'cx-select__valor' }, pintarOpcion(o).slice(1, 3))
        : h('span', { class: 'cx-select__placeholder' }, op.placeholder ?? 'Select');
    }
    reemplazar(disparador, cuerpo, icono('caret-down', 'cx-select__caret'));
  }

  function cambiar(nuevo) {
    valor = nuevo;
    cont.valor = valor;
    pintar();
    op.alCambiar?.(valor);
  }

  function abrir() {
    let texto = '';
    const listaEl = h('ul', { class: 'cx-opciones', role: 'listbox', 'aria-multiselectable': multiple ? 'true' : undefined });
    const filtro = op.filtrar
      ? entrada({
          placeholder: op.filtroPlaceholder ?? 'Find',
          buscar: true,
          alCambiar: (t) => {
            texto = t;
            pintarLista();
          },
          alEnter: () => {
            listaEl.querySelector('.cx-opcion:not(.cx-opcion--desactivada)')?.click();
          }
        })
      : null;
    function pintarLista() {
      const t = texto.trim().toLowerCase();
      let lista = opciones().filter((o) => !t || `${o.etiqueta} ${o.descripcion ?? ''} ${(o.etiquetas ?? []).join(' ')} ${o.valor}`.toLowerCase().includes(t));
      const libre = texto.trim() && op.opcionLibre ? op.opcionLibre(texto.trim()) : null;
      if (libre && !lista.some((o) => o.valor === libre.valor)) lista = [{ ...libre, etiqueta: `Use: "${texto.trim()}"`, descripcion: libre.descripcion }, ...lista];
      const items = [];
      let grupo = null;
      for (const o of lista) {
        if (o.grupo && o.grupo !== grupo) {
          grupo = o.grupo;
          items.push(h('li', { class: 'cx-opciones__grupo', role: 'presentation' }, grupo));
        }
        const sel = multiple ? valor.includes(o.valor) : o.valor === valor;
        items.push(
          h(
            'li',
            {
              class: ['cx-opcion', sel && 'cx-opcion--elegida', o.desactivado && 'cx-opcion--desactivada', o.grupo && 'cx-opcion--en-grupo'],
              role: 'option',
              tabindex: o.desactivado ? undefined : '-1',
              'aria-selected': sel ? 'true' : 'false',
              'aria-disabled': o.desactivado ? 'true' : undefined,
              onclick: () => {
                if (o.desactivado) return;
                if (multiple) {
                  cambiar(valor.includes(o.valor) ? valor.filter((x) => x !== o.valor) : [...valor, o.valor]);
                  pintarLista();
                } else {
                  cerrarDesplegable();
                  cambiar(o.valor);
                  disparador.focus();
                }
              },
              onkeydown: (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.currentTarget.click();
                }
              }
            },
            pintarOpcion(o, { seleccionada: sel, multiple })
          )
        );
      }
      if (!items.length) items.push(h('li', { class: 'cx-opciones__vacio' }, texto ? 'No matches' : op.vacio ?? 'No options'));
      reemplazar(listaEl, items);
    }
    pintarLista();
    const d = abrirDesplegable(disparador, [filtro ? h('div', { class: 'cx-opciones__filtro' }, filtro) : null, listaEl, op.pie ?? null], { minAncho: op.ancho, clase: 'cx-desplegable--select' });
    if (!d) return;
    d.ancla = disparador;
    navegarConFlechas(d.panel, '.cx-opcion[tabindex], input');
    if (filtro) d.panel.querySelector('input')?.focus();
    else (d.panel.querySelector('.cx-opcion--elegida') ?? d.panel.querySelector('.cx-opcion[tabindex]'))?.focus();
  }

  cont.valor = valor;
  cont.actualizarOpciones = pintar;
  pintar();
  return cont;
}

/* ============================================================== estructura */

/** Encabezado de página: título h1 con «Info», descripción y botones a la derecha. */
export function encabezado(op) {
  return h(
    'div',
    { class: 'cx-encabezado' },
    h(
      'div',
      { class: 'cx-encabezado__texto' },
      h('h1', { class: 'cx-h1' }, op.titulo, op.contador !== undefined ? h('span', { class: 'cx-contador' }, ` (${op.contador})`) : null, op.info && op.cx ? info(op.cx, op.info) : null),
      op.descripcion ? h('p', { class: 'cx-encabezado__desc' }, op.descripcion) : null
    ),
    op.acciones ? h('div', { class: 'cx-encabezado__acciones' }, op.acciones) : null
  );
}

/**
 * Contenedor (tarjeta con borde redondeado). titulo, contador, info (tema), descripcion,
 * acciones (botones a la derecha del título), cuerpo, pie, plegable, abierto.
 */
export function contenedor(op) {
  const cuerpo = h('div', { class: ['cx-contenedor__cuerpo', op.sinRelleno && 'cx-contenedor__cuerpo--sin-relleno'] }, op.cuerpo);
  let abiertoAhora = op.abierto ?? true;
  const titulo = op.titulo
    ? h(
        op.nivel === 3 ? 'h3' : 'h2',
        { class: 'cx-h2' },
        op.plegable ? icono(abiertoAhora ? 'caret-down' : 'caret-right', 'cx-plegable__flecha') : null,
        h('span', {}, op.titulo),
        op.contador !== undefined ? h('span', { class: 'cx-contador' }, ` (${op.contador})`) : null,
        op.info && op.cx ? info(op.cx, op.info) : null
      )
    : null;
  const cabeza = titulo || op.acciones
    ? h(
        'div',
        { class: ['cx-contenedor__cabeza', op.plegable && 'cx-contenedor__cabeza--plegable'] },
        h('div', { class: 'cx-contenedor__titulos' }, titulo, op.descripcion ? h('p', { class: 'cx-contenedor__desc' }, op.descripcion) : null),
        op.acciones ? h('div', { class: 'cx-contenedor__acciones' }, op.acciones) : null
      )
    : null;
  const el = h('section', { class: ['cx-contenedor', op.clase] }, cabeza, cuerpo, op.pie ? h('div', { class: 'cx-contenedor__pie' }, op.pie) : null);
  if (op.plegable && cabeza) {
    const alternar = () => {
      abiertoAhora = !abiertoAhora;
      cuerpo.hidden = !abiertoAhora;
      const flecha = titulo.querySelector('.cx-plegable__flecha');
      flecha.replaceWith(icono(abiertoAhora ? 'caret-down' : 'caret-right', 'cx-plegable__flecha'));
      op.alAlternar?.(abiertoAhora);
    };
    titulo.setAttribute('tabindex', '0');
    titulo.setAttribute('role', 'button');
    titulo.setAttribute('aria-expanded', String(abiertoAhora));
    titulo.addEventListener('click', (e) => {
      if (e.target.closest('.cx-info')) return;
      alternar();
      titulo.setAttribute('aria-expanded', String(abiertoAhora));
    });
    titulo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        alternar();
      }
    });
    cuerpo.hidden = !abiertoAhora;
  }
  return el;
}

/** Sección plegable sencilla («▶ Advanced details», «▶ Tags - optional»). */
export function expandible(op) {
  let ab = op.abierto ?? false;
  const cuerpo = h('div', { class: 'cx-expandible__cuerpo', hidden: !ab }, op.contenido);
  const cab = h(
    'button',
    {
      type: 'button',
      class: 'cx-expandible__cabeza',
      'aria-expanded': String(ab),
      onclick: () => {
        ab = !ab;
        cuerpo.hidden = !ab;
        cab.setAttribute('aria-expanded', String(ab));
        cab.firstChild.replaceWith(icono(ab ? 'caret-down' : 'caret-right'));
        op.alAlternar?.(ab);
      }
    },
    icono(ab ? 'caret-down' : 'caret-right'),
    h('span', { class: op.fuerte ? 'cx-expandible__titulo cx-expandible__titulo--fuerte' : 'cx-expandible__titulo' }, op.titulo),
    op.descripcion ? h('span', { class: 'cx-expandible__desc' }, op.descripcion) : null
  );
  return h('div', { class: ['cx-expandible', op.clase] }, cab, cuerpo);
}

/**
 * Pares etiqueta/valor en columnas (la pestaña «Details»).
 * columnas: [[{ etiqueta, valor, info }]] — o una lista plana y `n` columnas.
 */
export function pares(lista, { columnas = 3, cx } = {}) {
  const items = lista.filter(Boolean);
  return h(
    'div',
    { class: 'cx-pares', style: { gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` } },
    items.map((p) =>
      h(
        'div',
        { class: 'cx-par' },
        h('div', { class: 'cx-par__etiqueta' }, p.etiqueta, p.info && cx ? info(cx, p.info) : null),
        h('div', { class: 'cx-par__valor' }, p.valor === null || p.valor === undefined || p.valor === '' ? '–' : p.valor)
      )
    )
  );
}

/** Pestañas. pestanas: [{ id, texto, contenido: () => Nodo, desactivada }]. */
export function pestanas(op) {
  let activa = op.activa ?? op.pestanas.find((p) => !p.desactivada)?.id;
  const cuerpo = h('div', { class: 'cx-pestanas__cuerpo', role: 'tabpanel' });
  const lista = h('div', { class: 'cx-pestanas__lista', role: 'tablist' });
  function pintar() {
    reemplazar(
      lista,
      op.pestanas.map((p) =>
        h(
          'button',
          {
            type: 'button',
            role: 'tab',
            class: ['cx-pestana', p.id === activa && 'cx-pestana--activa'],
            'aria-selected': p.id === activa ? 'true' : 'false',
            disabled: p.desactivada,
            onclick: () => {
              activa = p.id;
              pintar();
              op.alCambiar?.(p.id);
            }
          },
          p.texto
        )
      )
    );
    const p = op.pestanas.find((x) => x.id === activa) ?? op.pestanas[0];
    reemplazar(cuerpo, p ? p.contenido() : null);
  }
  pintar();
  return h('div', { class: ['cx-pestanas', op.clase] }, lista, cuerpo);
}

/** Migas de pan: [{ texto, ruta }] (la última es la página actual). */
export function migas(cx, lista) {
  return h(
    'nav',
    { class: 'cx-migas', 'aria-label': 'Breadcrumbs' },
    lista.map((m, i) => [
      i ? icono('angle-right', 'cx-migas__sep') : null,
      i < lista.length - 1 && m.ruta ? enlace(m.texto, m.ruta, { cx }) : h('span', { class: 'cx-migas__actual' }, m.texto)
    ])
  );
}

/** Pie de formulario: Cancel (enlace) y el botón naranja. */
export function pieFormulario({ cancelar, enviar, textoEnviar, desactivado, extra }) {
  return h(
    'div',
    { class: 'cx-pie-form' },
    extra ?? null,
    cancelar ? boton('Cancel', { variante: 'texto', alClic: cancelar }) : null,
    boton(textoEnviar, { variante: 'primario', alClic: enviar, desactivado })
  );
}

/* ============================================================== estado */

const ESTADOS = {
  exito: { icono: 'status-positive', clase: 'cx-st--exito' },
  error: { icono: 'status-negative', clase: 'cx-st--error' },
  aviso: { icono: 'status-warning', clase: 'cx-st--aviso' },
  info: { icono: 'status-info', clase: 'cx-st--info' },
  pendiente: { icono: 'spinner', clase: 'cx-st--pendiente' },
  detenido: { icono: 'status-stopped', clase: 'cx-st--detenido' },
  espera: { icono: 'status-pending', clase: 'cx-st--detenido' },
  inactivo: { icono: 'status-stopped', clase: 'cx-st--inactivo' }
};

/** Indicador de estado con ícono de color: estado('exito', 'Running'). */
export function estado(tipo, texto) {
  const e = ESTADOS[tipo] ?? ESTADOS.info;
  return h('span', { class: ['cx-st', e.clase] }, icono(e.icono, tipo === 'pendiente' ? 'cx-gira' : ''), h('span', {}, texto));
}

/* ============================================================== alertas */

const ALERTAS = { info: 'status-info', exito: 'status-positive', error: 'status-negative', aviso: 'status-warning' };

/** Alerta dentro de la página (no flashbar). tipo: info | exito | error | aviso. */
export function alerta(op) {
  const el = h(
    'div',
    { class: ['cx-alerta', `cx-alerta--${op.tipo ?? 'info'}`, op.clase], role: op.tipo === 'error' ? 'alert' : 'status' },
    icono(ALERTAS[op.tipo ?? 'info'], 'cx-alerta__icono'),
    h('div', { class: 'cx-alerta__cuerpo' }, op.titulo ? h('div', { class: 'cx-alerta__titulo' }, op.titulo) : null, op.contenido ? h('div', { class: 'cx-alerta__texto' }, op.contenido) : null),
    op.accion ? h('div', { class: 'cx-alerta__accion' }, op.accion) : null,
    op.cerrable ? h('button', { type: 'button', class: 'cx-alerta__cerrar', 'aria-label': 'Dismiss', onclick: () => el.remove() }, icono('close')) : null
  );
  return el;
}

/* ============================================================== copiar */

/** Ícono de copiar junto a un ID o IP, como en la consola. Al copiar avisa «… copied». */
export function copiable(texto, { etiqueta, soloIcono = false } = {}) {
  if (!texto) return '–';
  const b = h(
    'button',
    {
      type: 'button',
      class: 'cx-copiar',
      title: 'Copy',
      'aria-label': `Copy ${texto}`,
      onclick: async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard?.writeText(texto);
        } catch {
          /* sin permiso de portapapeles: igual avisamos */
        }
        const aviso = h('span', { class: 'cx-copiar__aviso', role: 'status' }, icono('status-positive'), ` ${etiqueta ?? 'Copied'}`);
        b.append(aviso);
        setTimeout(() => aviso.remove(), 1400);
      }
    },
    icono('copy')
  );
  if (soloIcono) return b;
  return h('span', { class: 'cx-copiable' }, b, h('span', {}, texto));
}

/* ============================================================== modales */

/**
 * Modal propio (nunca alert/confirm). Se monta en la capa de modales de la
 * consola. op: { titulo, contenido, pie, ancho: 'chico' | 'mediano' | 'grande', alCerrar }
 * Devuelve { cerrar, cuerpo }.
 */
export function modal(raiz, op) {
  cerrarDesplegable();
  const capa = raiz.querySelector(':scope > .cx-modales');
  const anterior = document.activeElement;
  const titulo = h('h2', { class: 'cx-modal__titulo', id: idUnico('modal') }, op.titulo);
  const cuerpo = h('div', { class: 'cx-modal__cuerpo' }, op.contenido);
  const caja = h(
    'div',
    { class: ['cx-modal', `cx-modal--${op.ancho ?? 'mediano'}`], role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titulo.id, tabindex: '-1' },
    h('div', { class: 'cx-modal__cabeza' }, titulo, h('button', { type: 'button', class: 'cx-modal__cerrar', 'aria-label': 'Close modal', onclick: () => cerrar() }, icono('close'))),
    cuerpo,
    op.pie ? h('div', { class: 'cx-modal__pie' }, op.pie) : null
  );
  const fondo = h('div', { class: 'cx-modal-fondo', onmousedown: (e) => e.target === fondo && op.cerrarAfuera !== false && cerrar() }, caja);
  caja.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      cerrar();
    }
    if (e.key === 'Tab') {
      // Mantener el foco dentro del modal.
      const f = [...caja.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea, a[href], [tabindex="0"], iframe')].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) {
        e.preventDefault();
        f.at(-1).focus();
      } else if (!e.shiftKey && document.activeElement === f.at(-1)) {
        e.preventDefault();
        f[0].focus();
      }
    }
  });
  capa.append(fondo);
  setTimeout(() => (caja.querySelector('input:not([disabled]), textarea') ?? caja).focus());
  let cerrado = false;
  function cerrar() {
    if (cerrado) return;
    cerrado = true;
    fondo.remove();
    op.alCerrar?.();
    if (anterior?.isConnected) anterior.focus?.();
  }
  return { cerrar, cuerpo, caja };
}

/**
 * Confirmación de la consola. Si `palabra` viene (por ejemplo 'delete'), el botón
 * solo se habilita al escribirla: «To confirm deletion, type delete in the field».
 * aceptar() devuelve false para dejar el modal abierto (por ejemplo si hubo error).
 */
export function confirmar(raiz, op) {
  let escrito = '';
  const btn = boton(op.textoBoton ?? 'Delete', {
    variante: 'primario',
    desactivado: Boolean(op.palabra),
    alClic: () => {
      const r = op.aceptar?.();
      if (r !== false) m.cerrar();
    }
  });
  const contenido = [
    op.contenido,
    op.palabra
      ? h(
          'div',
          { class: 'cx-confirmar' },
          campo({
            etiqueta: h('span', {}, 'To confirm deletion, type ', h('i', {}, op.palabra), ' in the field:'),
            control: entrada({
              placeholder: op.palabra,
              alCambiar: (v) => {
                escrito = v;
                btn.disabled = escrito !== op.palabra;
              },
              alEnter: () => !btn.disabled && btn.click()
            })
          })
        )
      : null
  ];
  const m = modal(raiz, {
    titulo: op.titulo,
    ancho: op.ancho ?? 'mediano',
    contenido,
    pie: [boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }), btn]
  });
  return m;
}

/* ============================================================== tablas */

/**
 * La tabla de la consola, con su encabezado («Instances (1/3)», refrescar,
 * acciones, filtro, paginación) y selección. Se repinta sola cada segundo
 * (vía cx) sin perder el filtro ni la selección.
 *
 *   titulo, info, descripcion, contador (true), variante: 'pagina' | 'contenedor' | 'simple'
 *   columnas: [{ titulo, valor: (fila) => texto | Nodo, texto?: (fila) => texto, ancho, info }]
 *   filas: () => [], clave: (fila) => id
 *   seleccion: 'unica' | 'multiple' | null, seleccionados: [ids], alSeleccionar(ids, filas)
 *   filtro: 'Find instances…' | false
 *   acciones: (filasElegidas) => [nodos]   (se vuelven a pintar al cambiar la selección)
 *   vacio: { titulo, texto, accion: Nodo }
 *   refrescar: true (botón de refrescar), ultimaActualizacion: true
 */
export function tabla(cx, op) {
  const sel = new Set(op.seleccionados ?? []);
  let filtro = '';
  let orden = null; // { i, desc }
  const variante = op.variante ?? 'pagina';
  const cabeza = h('div', { class: 'cx-tabla__cabeza' });
  const cuerpo = h('div', { class: 'cx-tabla__desliza' });
  let ultimoCabeza = '';
  let ultimoCuerpo = '';

  const filasTodas = () => op.filas();
  const textoFila = (f) => op.columnas.map((c) => (c.texto ? c.texto(f) : textoDe(c.valor(f)))).join(' ').toLowerCase();

  function visibles() {
    let lista = filasTodas();
    const t = filtro.trim().toLowerCase();
    if (t) lista = lista.filter((f) => textoFila(f).includes(t));
    if (orden) {
      const c = op.columnas[orden.i];
      const clave = (f) => (c.texto ? c.texto(f) : textoDe(c.valor(f)));
      lista = [...lista].sort((a, b) => clave(a).localeCompare(clave(b), 'en', { numeric: true }) * (orden.desc ? -1 : 1));
    }
    return lista;
  }

  function elegidas() {
    const todas = filasTodas();
    // Si una fila elegida desapareció (se borró), deja de estar elegida.
    for (const id of [...sel]) if (!todas.some((f) => op.clave(f) === id)) sel.delete(id);
    return todas.filter((f) => sel.has(op.clave(f)));
  }

  function avisar() {
    op.alSeleccionar?.([...sel], elegidas());
  }

  function elegir(id, solo) {
    if (op.seleccion === 'unica' || solo) {
      sel.clear();
      sel.add(id);
    } else if (sel.has(id)) sel.delete(id);
    else sel.add(id);
    actualizar(true);
    avisar();
  }

  const entradaFiltro =
    op.filtro === false
      ? null
      : entrada({
          placeholder: op.filtro ?? 'Find resources',
          buscar: true,
          etiquetaAccesible: op.filtro ?? 'Filter',
          alCambiar: (t) => {
            filtro = t;
            actualizar(true);
          }
        });

  function pintarCabeza() {
    const total = filasTodas().length;
    const n = elegidas().length;
    const contador = op.contador === false ? null : h('span', { class: 'cx-contador' }, ` (${n && op.seleccion ? `${n}/${total}` : total})`);
    const Titulo = variante === 'pagina' ? 'h1' : 'h2';
    return h(
      'div',
      { class: 'cx-tabla__titulo-fila' },
      h(
        'div',
        { class: 'cx-tabla__titulos' },
        op.titulo ? h(Titulo, { class: variante === 'pagina' ? 'cx-h1 cx-h1--tabla' : 'cx-h2' }, op.titulo, contador, op.info ? info(cx, op.info) : null) : null,
        op.descripcion ? h('p', { class: 'cx-contenedor__desc' }, op.descripcion) : null
      ),
      h(
        'div',
        { class: 'cx-tabla__acciones' },
        op.ultimaActualizacion ? h('span', { class: 'cx-tabla__actualizado' }, 'Last updated', h('br'), 'less than a minute ago') : null,
        op.refrescar !== false && variante !== 'simple' ? botonRefrescar(() => actualizar(true)) : null,
        op.acciones ? op.acciones(elegidas()) : null
      )
    );
  }

  function pintarCuerpo() {
    const lista = visibles();
    const total = filasTodas().length;
    const multiple = op.seleccion === 'multiple';
    const todasMarcadas = multiple && lista.length > 0 && lista.every((f) => sel.has(op.clave(f)));
    const algunas = multiple && !todasMarcadas && lista.some((f) => sel.has(op.clave(f)));
    const nombreGrupo = `t${idUnico('sel')}`;
    const thead = h(
      'thead',
      {},
      h(
        'tr',
        {},
        op.seleccion
          ? h(
              'th',
              { class: 'cx-tabla__sel', scope: 'col' },
              multiple
                ? h('input', {
                    type: 'checkbox',
                    'aria-label': 'Select all',
                    checked: todasMarcadas,
                    indeterminate: algunas,
                    'data-algunas': algunas ? '' : undefined,
                    onchange: (e) => {
                      if (e.target.checked) lista.forEach((f) => sel.add(op.clave(f)));
                      else sel.clear();
                      actualizar(true);
                      avisar();
                    }
                  })
                : null
            )
          : null,
        op.columnas.map((c, i) =>
          h(
            'th',
            { scope: 'col', style: c.ancho ? { minWidth: c.ancho } : undefined, 'aria-sort': orden?.i === i ? (orden.desc ? 'descending' : 'ascending') : undefined },
            h(
              'button',
              {
                type: 'button',
                class: 'cx-tabla__orden',
                onclick: () => {
                  orden = orden?.i === i ? { i, desc: !orden.desc } : { i, desc: false };
                  actualizar(true);
                }
              },
              h('span', {}, c.titulo),
              c.editable ? icono('edit', 'cx-icono--chico') : null,
              icono(orden?.i === i && !orden.desc ? 'caret-up' : 'caret-down', 'cx-tabla__flecha')
            )
          )
        )
      )
    );
    let filas;
    if (!lista.length) {
      const sinNada = !total;
      filas = h(
        'tr',
        {},
        h(
          'td',
          { class: 'cx-tabla__vacia', colspan: String(op.columnas.length + (op.seleccion ? 1 : 0)) },
          sinNada
            ? [h('b', {}, op.vacio?.titulo ?? 'No resources'), op.vacio?.texto ? h('div', {}, op.vacio.texto) : null, op.vacio?.accion ?? null]
            : [h('b', {}, 'No matches'), h('div', {}, 'We can’t find a match.'), boton('Clear filter', { alClic: () => limpiarFiltro() })]
        )
      );
    } else {
      filas = lista.map((f) => {
        const id = op.clave(f);
        const marcada = sel.has(id);
        return h(
          'tr',
          {
            class: [marcada && 'cx-fila--elegida', op.seleccion && 'cx-fila--elegible'],
            onclick: (e) => {
              if (!op.seleccion || e.target.closest('a, button, input, label')) return;
              elegir(id, true);
            }
          },
          op.seleccion
            ? h(
                'td',
                { class: 'cx-tabla__sel' },
                h('input', {
                  type: multiple ? 'checkbox' : 'radio',
                  name: multiple ? undefined : nombreGrupo,
                  checked: marcada,
                  'aria-label': `Select ${textoDe(op.columnas[0].valor(f)) || id}`,
                  onchange: () => elegir(id, false)
                })
              )
            : null,
          op.columnas.map((c) => h('td', {}, c.valor(f) ?? '–'))
        );
      });
    }
    return h('table', { class: 'cx-tabla__tabla' }, thead, h('tbody', {}, filas));
  }

  function limpiarFiltro() {
    filtro = '';
    const inp = entradaFiltro?.querySelector('input');
    if (inp) inp.value = '';
    actualizar(true);
  }

  /** Repinta encabezado y filas. Sin `forzar`, solo si algo cambió. */
  function actualizar(forzar = false) {
    const c = pintarCabeza();
    const htmlC = c.outerHTML;
    if (forzar || htmlC !== ultimoCabeza) {
      reemplazar(cabeza, c);
      ultimoCabeza = htmlC;
    }
    const b = pintarCuerpo();
    const htmlB = b.outerHTML;
    if (forzar || htmlB !== ultimoCuerpo) {
      const izq = cuerpo.scrollLeft;
      reemplazar(cuerpo, b);
      cuerpo.scrollLeft = izq;
      ultimoCuerpo = htmlB;
    }
  }

  const barra =
    variante === 'simple' && !entradaFiltro
      ? null
      : h(
          'div',
          { class: 'cx-tabla__barra' },
          entradaFiltro ? h('div', { class: 'cx-tabla__filtro' }, op.antesDelFiltro ?? null, entradaFiltro) : h('div'),
          op.paginacion === false
            ? null
            : h(
                'div',
                { class: 'cx-paginacion' },
                h('button', { type: 'button', class: 'cx-paginacion__flecha', disabled: true, 'aria-label': 'Previous page' }, icono('angle-left')),
                h('span', { class: 'cx-paginacion__num', 'aria-current': 'page' }, '1'),
                h('button', { type: 'button', class: 'cx-paginacion__flecha', disabled: true, 'aria-label': 'Next page' }, icono('angle-right')),
                h('span', { class: 'cx-paginacion__sep' }),
                h('button', { type: 'button', class: 'cx-paginacion__flecha', title: 'Preferences', 'aria-label': 'Preferences' }, icono('settings'))
              )
        );

  const el = h('div', { class: ['cx-tabla', `cx-tabla--${variante}`, op.clase] }, cabeza, barra, cuerpo);
  actualizar(true);
  cx.alRefrescar(() => actualizar(false));
  el.actualizar = actualizar;
  el.seleccion = elegidas;
  el.ids = () => elegidas().map(op.clave);
  el.seleccionar = (ids) => {
    sel.clear();
    ids.forEach((i) => sel.add(i));
    actualizar(true);
    avisar();
  };
  return el;
}

/** El panel inferior de las listas (split panel): titulo + contenido (pestañas). */
export function panelInferior({ titulo, contenido, acciones }) {
  return h(
    'section',
    { class: 'cx-panel-inferior' },
    h('div', { class: 'cx-panel-inferior__asa', 'aria-hidden': 'true' }),
    h('div', { class: 'cx-panel-inferior__cabeza' }, h('h2', { class: 'cx-h2' }, titulo), h('div', { class: 'cx-panel-inferior__iconos' }, acciones ?? null, icono('settings'), icono('angle-down'))),
    contenido
  );
}

/** Página sencilla «No disponible en este simulador» para lo que la consola real tiene y aquí no. */
export function noDisponible(titulo, texto) {
  return h(
    'div',
    { class: 'cx-no-disponible' },
    h('h1', { class: 'cx-h1' }, titulo),
    alerta({
      tipo: 'info',
      titulo: 'No disponible en este simulador',
      contenido: texto ?? 'Esta parte existe en la consola real de AWS, pero no la necesitas para tus laboratorios. Usa el menú de la izquierda para regresar.'
    })
  );
}

/* ============================================================== textos */

/** «**negritas**» y «`código`» de las ayudas, sin innerHTML. */
export function textoRico(t) {
  const partes = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let i = 0;
  let m;
  while ((m = re.exec(t))) {
    if (m.index > i) partes.push(t.slice(i, m.index));
    partes.push(m[1] !== undefined ? h('strong', {}, m[1]) : h('code', {}, m[2]));
    i = m.index + m[0].length;
  }
  if (i < t.length) partes.push(t.slice(i));
  return partes;
}

/** Fecha como la muestra la consola: «2026/10/20 09:15 GMT-6». */
export function fecha(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  const dos = (n) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset() / 60;
  return `${d.getFullYear()}/${dos(d.getMonth() + 1)}/${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())} GMT${off >= 0 ? '+' : ''}${off}`;
}

/** Fecha larga: «Tue Oct 20 2026 09:15:03 GMT-0600». */
export function fechaLarga(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '–' : d.toString().replace(/\s*\(.*\)$/, '');
}

/** «name | id» o solo el id, como los selectores de Cloudscape. */
export const nombreEId = (r) => (r?.nombre ? `${r.id} | ${r.nombre}` : r?.id ?? '–');
export const guion = (v) => (v === null || v === undefined || v === '' ? '–' : v);
