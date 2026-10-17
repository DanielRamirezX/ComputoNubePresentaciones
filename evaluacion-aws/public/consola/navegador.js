// ---------------------------------------------------------------------------
// EL NAVEGADOR SIMULADO
//
// Una ventana que parece Chrome (pestaña, barra de dirección, recargar) para
// abrir las páginas de las instancias «desde la casa del alumno». Pregunta a
// red.js (probarPagina) si la dirección carga:
//
//   - si carga, pinta el HTML en un <iframe sandbox="" srcdoc>: el HTML sale
//     del user data que escribió el alumno, así que nunca va con innerHTML y
//     el iframe no puede correr scripts ni tocar la consola;
//   - si no carga, muestra la página de error de Chrome con su código
//     (ERR_CONNECTION_TIMED_OUT, ERR_CONNECTION_REFUSED…) y con un retraso
//     realista. NUNCA muestra el diagnóstico: averiguar por qué falla es parte
//     de la evaluación.
// ---------------------------------------------------------------------------

import { parsearDireccion, probarPagina } from './red.js';
import * as ui from './ui.js';

const { h, icono, reemplazar } = ui;

// Cuánto tarda cada resultado en aparecer (milisegundos).
const ESPERA = { ok: 450, timeout: 2200, rechazada: 350, dns: 700, invalida: 50, ssl: 400 };

// Lo que Chrome sugiere en su página de error.
const SUGERENCIAS = {
  timeout: ['Checking the connection', 'Checking the proxy and the firewall', 'Running Windows Network Diagnostics'],
  rechazada: ['Checking the connection', 'Checking the proxy and the firewall'],
  dns: ['Checking the connection', 'Checking the proxy, firewall, and DNS configuration', 'Running Windows Network Diagnostics'],
  ssl: [],
  invalida: []
};

export function abrirNavegador(cx, urlInicial = '') {
  // Una sola ventana a la vez.
  cx.raiz.querySelector('.cx-nav-fondo')?.remove();

  const historial = [];
  let posicion = -1;
  let turno = 0; // para ignorar respuestas de cargas viejas
  let cargando = false;

  const titulo = h('span', { class: 'cx-nav__pestana-titulo' }, 'New Tab');
  const favicon = h('span', { class: 'cx-nav__favicon' }, icono('globe'));
  const seguridad = h('span', { class: 'cx-nav__seguridad' });
  const direccion = h('input', {
    class: 'cx-nav__direccion',
    type: 'text',
    spellcheck: 'false',
    autocomplete: 'off',
    'aria-label': 'Address and search bar',
    placeholder: 'Escribe una dirección, por ejemplo http://54.210.12.34',
    onkeydown: (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        navegar(direccion.value, true);
      }
    }
  });
  const atras = h('button', { type: 'button', class: 'cx-nav__btn', 'aria-label': 'Back', title: 'Back', disabled: true, onclick: () => moverse(-1) }, icono('arrow-left'));
  const adelante = h('button', { type: 'button', class: 'cx-nav__btn', 'aria-label': 'Forward', title: 'Forward', disabled: true, onclick: () => moverse(1) }, icono('arrow-right'));
  const recargar = h('button', { type: 'button', class: 'cx-nav__btn', 'aria-label': 'Reload', title: 'Reload', onclick: () => historial[posicion] && navegar(historial[posicion], false) }, icono('refresh'));
  const barraProgreso = h('div', { class: 'cx-nav__progreso', hidden: true });
  const contenido = h('div', { class: 'cx-nav__contenido' });

  const ventana = h(
    'div',
    { class: 'cx-nav', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Navegador simulado' },
    h(
      'div',
      { class: 'cx-nav__pestanas' },
      h('div', { class: 'cx-nav__pestana' }, favicon, titulo, h('button', { type: 'button', class: 'cx-nav__cerrar-pestana', 'aria-label': 'Close tab', onclick: () => cerrar() }, icono('close'))),
      h('span', { class: 'cx-nav__nueva', 'aria-hidden': 'true' }, '+'),
      h('div', { class: 'cx-nav__espacio' }),
      h('span', { class: 'cx-nav__etiqueta' }, 'Navegador de prueba · desde tu casa'),
      h('button', { type: 'button', class: 'cx-nav__ventana-cerrar', 'aria-label': 'Close browser', title: 'Close', onclick: () => cerrar() }, icono('close'))
    ),
    h('div', { class: 'cx-nav__herramientas' }, atras, adelante, recargar, h('div', { class: 'cx-nav__omnibox' }, seguridad, direccion), h('button', { type: 'button', class: 'cx-nav__btn', 'aria-label': 'Info', title: 'Ayuda', onclick: () => cx.ayuda('navegador') }, icono('help'))),
    barraProgreso,
    contenido
  );
  const fondo = h('div', { class: 'cx-nav-fondo', onmousedown: (e) => e.target === fondo && cerrar() }, ventana);
  fondo.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      cerrar();
    }
  });
  cx.raiz.querySelector(':scope > .cx-modales').append(fondo);

  function cerrar() {
    turno += 1;
    fondo.remove();
  }

  function moverse(paso) {
    const nueva = posicion + paso;
    if (nueva < 0 || nueva >= historial.length) return;
    posicion = nueva;
    navegar(historial[posicion], false);
  }

  function pintarBotones() {
    atras.disabled = posicion <= 0;
    adelante.disabled = posicion >= historial.length - 1;
  }

  function pintarSeguridad(url) {
    const d = parsearDireccion(url);
    reemplazar(seguridad, d?.protocolo === 'https' ? icono('lock') : d ? [icono('status-warning'), h('span', {}, 'Not secure')] : null);
    seguridad.classList.toggle('cx-nav__seguridad--insegura', d?.protocolo === 'http');
  }

  /** Abre una dirección. `nueva`: true si la escribió el alumno (va al historial). */
  function navegar(texto, nueva) {
    const t = String(texto ?? '').trim();
    if (!t) return;
    const d = parsearDireccion(t);
    const url = d?.url ?? t;
    if (nueva) {
      historial.splice(posicion + 1);
      historial.push(url);
      posicion = historial.length - 1;
    }
    pintarBotones();
    direccion.value = url.replace(/\/$/, '');
    pintarSeguridad(url);
    direccion.blur();

    const r = probarPagina(cx.estado, t);
    const mio = ++turno;
    cargando = true;
    reemplazar(titulo, d?.host ?? t);
    reemplazar(favicon, icono('spinner', 'cx-gira'));
    barraProgreso.hidden = false;
    barraProgreso.classList.remove('cx-nav__progreso--lento');
    void barraProgreso.offsetWidth;
    barraProgreso.classList.add(r.resultado === 'timeout' ? 'cx-nav__progreso--lento' : 'cx-nav__progreso--rapido');
    reemplazar(contenido, h('div', { class: 'cx-nav__blanco' }));

    setTimeout(() => {
      if (mio !== turno) return;
      cargando = false;
      barraProgreso.hidden = true;
      barraProgreso.classList.remove('cx-nav__progreso--lento', 'cx-nav__progreso--rapido');
      if (r.resultado === 'ok') pintarPagina(r);
      else pintarError(r, d);
    }, ESPERA[r.resultado] ?? 600);
  }

  function pintarPagina(r) {
    reemplazar(titulo, r.titulo || r.url);
    reemplazar(favicon, icono('file'));
    // sandbox="" sin permisos: sin scripts, sin formularios, sin acceso a la consola.
    const marco = h('iframe', { class: 'cx-nav__marco', sandbox: '', title: r.titulo || 'Página', referrerpolicy: 'no-referrer' });
    marco.srcdoc = r.html ?? '';
    reemplazar(contenido, marco);
  }

  function pintarError(r, d) {
    const host = d?.host ?? r.url;
    reemplazar(titulo, host);
    reemplazar(favicon, icono('sad-page'));
    const e = r.error ?? { titulo: 'This site can’t be reached', detalle: '', codigo: 'ERR_FAILED' };
    const sugerencias = SUGERENCIAS[r.resultado] ?? [];
    let detallesAbiertos = false;
    const detalles = h(
      'div',
      { class: 'cx-chrome__detalles', hidden: true },
      r.resultado === 'timeout' || r.resultado === 'rechazada'
        ? h('p', {}, 'Check your Internet connection. Check any cables and reboot any routers, modems, or other network devices you may be using.')
        : r.resultado === 'dns'
          ? h('p', {}, `${host}’s server IP address could not be found.`)
          : h('p', {}, 'The site sent an invalid response.')
    );
    reemplazar(
      contenido,
      h(
        'div',
        { class: 'cx-chrome' },
        h('div', { class: 'cx-chrome__caja' }, h('div', { class: 'cx-chrome__icono' }, icono('sad-page')), h('h1', {}, e.titulo), h('p', { class: 'cx-chrome__detalle' }, ...resaltarHost(e.detalle, host)),
          sugerencias.length ? [h('p', {}, 'Try:'), h('ul', {}, sugerencias.map((s) => h('li', {}, s)))] : null,
          h('div', { class: 'cx-chrome__codigo' }, e.codigo),
          h(
            'div',
            { class: 'cx-chrome__botones' },
            h(
              'button',
              {
                type: 'button',
                class: 'cx-chrome__detalles-btn',
                onclick: (ev) => {
                  detallesAbiertos = !detallesAbiertos;
                  detalles.hidden = !detallesAbiertos;
                  ev.currentTarget.textContent = detallesAbiertos ? 'Hide details' : 'Details';
                }
              },
              'Details'
            ),
            h('button', { type: 'button', class: 'cx-chrome__recargar', onclick: () => navegar(historial[posicion] ?? r.url, false) }, 'Reload')
          ),
          detalles
        )
      )
    );
  }

  function resaltarHost(texto, host) {
    const i = host ? texto.indexOf(host) : -1;
    if (i < 0) return [texto];
    return [texto.slice(0, i), h('b', {}, host), texto.slice(i + host.length)];
  }

  if (urlInicial) {
    direccion.value = urlInicial;
    navegar(urlInicial, true);
  } else {
    reemplazar(
      contenido,
      h(
        'div',
        { class: 'cx-nav__vacio' },
        h('div', { class: 'cx-nav__vacio-icono' }, icono('globe')),
        h('p', {}, 'Escribe arriba la dirección de tu servidor (su IP pública o su DNS público) y presiona Enter.'),
        h('p', { class: 'cx-texto-sec' }, `Este navegador se conecta desde tu casa: tu IP pública es ${cx.estado.cuenta?.ipCasa ?? '—'}.`)
      )
    );
    setTimeout(() => direccion.focus());
  }
  void cargando;
  return { cerrar, navegar: (u) => navegar(u, true) };
}
