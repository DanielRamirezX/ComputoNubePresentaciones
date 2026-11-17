// El modal «Arquitectura» del laboratorio (SIMULADOR.md §6.6): el diagrama de lo
// que el alumno va a montar, marcado con lo que ya lleva y lo que le falta.
//
// El núcleo (./arquitectura.js) es puro: calcula los estados y dibuja el SVG.
// Aquí vive lo del navegador: el <dialog>, la leyenda, el detalle de la pieza
// elegida, la lista en texto y cuándo se le pide al servidor una revisión.
// app.js lo carga con import() la primera vez que hace falta: si este archivo
// falla, el laboratorio sigue funcionando y el botón solo avisa.
//
//   avanceDe(arq, cuenta, revision)  → { total, hechas, listas }   (para el contador del botón)
//   crearModalArquitectura(opciones) → { abrir(), cerrar(), cuentaCambio(), destruir(), abierto }
//
// De dónde salen las marcas: sin revisión, de `hecho(cuenta)` («Falta» o
// «Hecho, sin revisar»). Con «Revisar mi avance» prendido, la revisión de la
// rúbrica las sube a «Listo» o «Le falta algo». Una revisión hecha con otra
// versión de la cuenta (`rev`) nunca se pinta como vigente al abrir.

import { ESTADOS, TIPOS, estadosDe, marcaSvg, piezasDe, resumenDe, svgArquitectura } from './arquitectura.js';

const ENTRE_REVISIONES_MS = 3000; // con el modal abierto, como mucho una revisión cada 3 s
const TRAS_CAMBIO_MS = 900; // y no antes de esto después de un cambio de la cuenta
const TRAS_FALLO_MS = 10000; // sin conexión no se insiste tan seguido
const REPINTAR_MS = 250; // el reloj del simulador cambia la cuenta cada segundo: se agrupan los repintados

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
const icono = (id) => `<svg class="icono" aria-hidden="true"><use href="#${id}"></use></svg>`;
const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '');
const angosta = () => matchMedia('(max-width: 900px)').matches;

/**
 * La revisión tal como la entiende el núcleo. En un intento de práctica con la
 * retroalimentación reducida, las tareas llegan sin sus puntos (`checks`): de
 * ellas solo se sabe si quedaron completas. Una tarea completa da por buenos
 * los puntos de sus piezas; una incompleta se queda sin revisión (sus piezas
 * dicen «Hecho, sin revisar» en vez de un «Le falta algo» sin explicación).
 */
function revisionParaNucleo(revision, piezas) {
  const tareas = revision?.tareas ?? revision?.resultado?.tareas;
  if (!Array.isArray(tareas)) return null;
  return {
    tareas: tareas.flatMap((t) => {
      if (!t || typeof t !== 'object') return [];
      if (Array.isArray(t.checks) && t.checks.length) return [t];
      if (!(t.puntos > 0 && t.obtenidos >= t.puntos)) return [];
      const ids = new Set(piezas.filter((p) => p.tarea === t.id).flatMap((p) => p.checks));
      return [{ ...t, checks: [...ids, '*'].map((id) => ({ id, ok: true })) }];
    })
  };
}

/** Lo que cuenta el botón: piezas hechas (y listas, si hay revisión) de las que no son bono. */
export function avanceDe(arq, cuenta, revision = null) {
  return resumenDe(arq, estadosDe(arq, cuenta, revision ? revisionParaNucleo(revision, piezasDe(arq)) : null));
}

/**
 * opciones:
 *   arq        LAB.arquitectura(datos)
 *   tareas     LAB.tareas(datos) (para «Tarea 3 · …»)
 *   examen     true en el examen final y las evaluaciones (cambia la nota del modo sin revisión)
 *   estado()   → { cuenta, rev, revision, autorrevision }: lo del laboratorio, al momento.
 *              `revision` trae la `rev` de la cuenta con que se hizo y su `hora`.
 *   revisar()  → Promise de { revision } | { apagada } | { entregada } | { error }
 *              (`error: null` = sin conexión). Es la misma llamada que «Revisar mi avance».
 *   irATarea(id) lleva el panel a esa tarea (el modal ya se cerró).
 *   alCerrar({ porTarea }) para devolver el foco al botón.
 */
export function crearModalArquitectura({ arq, tareas = [], examen = false, estado, revisar, irATarea, alCerrar }) {
  const piezas = piezasDe(arq);
  const porId = new Map(piezas.map((p) => [p.id, p]));
  const numTarea = new Map(tareas.map((t, i) => [t.id, t.bono ? 'Bono' : `Tarea ${i + 1}`]));
  const tituloTarea = new Map(tareas.map((t) => [t.id, t.titulo]));
  const nombreTarea = (id) => (numTarea.has(id) ? `${numTarea.get(id)} · ${tituloTarea.get(id)}` : 'Otra parte del laboratorio');

  let dialogo = null;
  let abierto = false;
  let modo = 'presencia'; // 'revision' si «Revisar mi avance» estaba prendido al abrir
  let usada = null; // la revisión con que se pintan las marcas (puede ser de una rev anterior mientras se actualiza)
  let fase = null; // 'revisando' | 'al-dia' | 'sin-conexion' | 'error'
  let mensajeError = '';
  let enCurso = false;
  let otraVez = false;
  let ultimaPeticion = 0;
  let temporizador = null;
  let repintado = null;
  let elegida = null;
  let porTarea = false;
  const ya = {}; // el último HTML de cada zona: lo que no cambió no se toca (ni se vuelve a anunciar)
  let observador = null;

  /* --------------------------------------------------------- el esqueleto */

  function construir() {
    dialogo = document.createElement('dialog');
    dialogo.className = 'diagrama';
    dialogo.setAttribute('aria-labelledby', 'diagrama-titulo');
    dialogo.setAttribute('aria-describedby', 'diagrama-objetivo');
    dialogo.innerHTML = `
      <header class="diagrama__cabeza">
        <div class="diagrama__textos">
          <p class="etiqueta">Arquitectura · lo que vas a montar</p>
          <h2 id="diagrama-titulo" tabindex="-1">${esc(arq.titulo)}</h2>
          <p class="diagrama__objetivo" id="diagrama-objetivo">${esc(arq.objetivo)}</p>
        </div>
        <div class="diagrama__avance" data-zona="avance"></div>
        <button type="button" class="diagrama__cerrar" data-cerrar aria-label="Cerrar el diagrama" title="Cerrar (Esc)">${icono('i-x')}</button>
      </header>
      <div class="diagrama__cuerpo">
        <div class="diagrama__principal">
          <div class="diagrama__guia">
            <ul class="diagrama__leyenda" aria-label="Qué dice cada marca" data-zona="leyenda"></ul>
            <p class="diagrama__nota" data-zona="nota"></p>
          </div>
          <div class="diagrama__lienzo" data-zona="lienzo"></div>
        </div>
        <div class="diagrama__lado">
          <section class="diagrama__detalle" aria-live="polite" aria-label="La pieza elegida" data-zona="detalle"></section>
          <details class="diagrama__lista">
            <summary>Ver como lista</summary>
            <div data-zona="lista"></div>
          </details>
        </div>
      </div>
      <footer class="diagrama__pie">
        <button type="button" class="boton boton--chico" data-revisar>${icono('i-lupa')}<span>Revisar ahora</span></button>
        <button type="button" class="boton boton--chico boton--primario" data-cerrar>Cerrar</button>
      </footer>`;
    document.body.append(dialogo);

    dialogo.addEventListener('click', (e) => {
      if (e.target === dialogo) return cerrar(); // clic en el fondo oscuro
      if (e.target.closest('[data-cerrar]')) return cerrar();
      if (e.target.closest('[data-revisar]')) return revisarAhora();
      const ver = e.target.closest('[data-ver-tarea]');
      if (ver) return verTarea(ver.dataset.verTarea);
      const renglon = e.target.closest('[data-elegir]');
      if (renglon) return elegir(renglon.dataset.elegir, { desde: 'lista' });
      const pieza = e.target.closest('[data-pieza]');
      if (pieza) elegir(pieza.dataset.pieza, { desde: 'diagrama' });
    });
    dialogo.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const pieza = e.target.closest?.('[data-pieza]');
      if (!pieza) return;
      e.preventDefault();
      elegir(pieza.dataset.pieza, { desde: 'diagrama' });
    });
    dialogo.addEventListener('close', alCerrarse);

    observador = typeof ResizeObserver === 'function' ? new ResizeObserver(() => ajustar()) : null;
    observador?.observe(zona('lienzo'));
  }

  const zona = (nombre) => dialogo.querySelector(`[data-zona="${nombre}"]`);

  /** Cambia el HTML de una zona solo si es distinto (así no parpadea ni se re-anuncia). */
  function poner(nombre, html) {
    if (ya[nombre] === html) return false;
    ya[nombre] = html;
    zona(nombre).innerHTML = html;
    return true;
  }

  /* ----------------------------------------------------------- los estados */

  function calcular() {
    const { cuenta, rev } = estado();
    const estados = estadosDe(arq, cuenta, usada ? revisionParaNucleo(usada, piezas) : null);
    return { estados, rev, resumen: resumenDe(arq, estados), vigente: Boolean(usada) && usada.rev === rev };
  }

  /* --------------------------------------------------------------- pintar */

  function pintar() {
    clearTimeout(repintado);
    repintado = null;
    if (!dialogo) return;
    const { estados, resumen, vigente } = calcular();
    pintarAvance(resumen);
    pintarLeyenda();
    pintarNota(vigente);
    pintarDiagrama(estados);
    pintarDetalle(estados);
    pintarLista(estados);
    const boton = dialogo.querySelector('[data-revisar]');
    boton.hidden = modo !== 'revision';
    boton.disabled = enCurso;
    boton.querySelector('span').textContent = enCurso ? 'Revisando…' : 'Revisar ahora';
  }

  function pintarAvance({ total, hechas, listas }) {
    const pct = (n) => (total ? Math.round((n / total) * 1000) / 10 : 0);
    poner(
      'avance',
      `<p class="diagrama__cifra">Llevas <strong>${hechas}</strong> de ${total} piezas</p>
       <div class="diagrama__barra" aria-hidden="true">
         <span class="diagrama__barra-listo" style="width:${pct(usada ? listas : 0)}%"></span><span class="diagrama__barra-hecho" style="width:${pct(hechas - (usada ? listas : 0))}%"></span>
       </div>
       ${
         usada
           ? `<p class="diagrama__sub">${
               listas === total && total ? '¡Todas listas!' : listas ? `<strong>${listas}</strong> ${listas === 1 ? 'ya revisada y lista' : 'ya revisadas y listas'}` : 'Ninguna lista todavía'
             }</p>`
           : ''
       }`
    );
  }

  function pintarLeyenda() {
    const lista = usada ? ['falta', 'creado', 'pendiente', 'listo'] : ['falta', 'creado'];
    poner('leyenda', lista.map((e) => `<li>${marcaSvg(e, 18)}<span>${esc(ESTADOS[e].nombre)}</span></li>`).join(''));
  }

  function pintarNota(vigente) {
    const nota = zona('nota');
    let html;
    let clase = 'diagrama__nota';
    if (modo !== 'revision') {
      clase += ' diagrama__nota--aviso';
      html = `${icono('i-alerta')}<span>${examen ? 'En este examen el diagrama' : 'Por ahora el diagrama'} marca lo que <strong>ya existe</strong> en tu cuenta. Que algo aparezca como hecho no significa que esté bien configurado: eso se califica al entregar.</span>`;
    } else if (fase === 'sin-conexion' || fase === 'error') {
      clase += ' diagrama__nota--mal';
      html = `<span>No pude revisar con el servidor${fase === 'error' && mensajeError ? ` (${esc(mensajeError)})` : ''}: el diagrama marca solo lo que ya existe en tu cuenta.</span>`;
    } else if (!usada) {
      html = '<span>Revisando tu cuenta…</span>';
    } else if (vigente) {
      html = `<span>Revisado a las ${esc(hora(usada.hora))} · toca una pieza para ver qué le falta.</span>`;
    } else {
      html = `<span>Revisado a las ${esc(hora(usada.hora))} · tu cuenta cambió: la reviso otra vez en un momento…</span>`;
    }
    nota.className = clase;
    poner('nota', html);
  }

  function pintarDiagrama(estados) {
    const lienzo = zona('lienzo');
    const activa = document.activeElement;
    const conFoco = lienzo.contains(activa) ? activa.closest('[data-pieza]')?.dataset.pieza : null;
    const izq = lienzo.scrollLeft;
    const arriba = lienzo.scrollTop;
    if (!poner('lienzo', svgArquitectura(arq, estados, { elegida }))) return;
    // El núcleo escapa todo el texto del SVG: insertarlo con innerHTML es seguro.
    ajustar();
    lienzo.scrollLeft = izq;
    lienzo.scrollTop = arriba;
    if (conFoco) piezaEnDiagrama(conFoco)?.focus({ preventScroll: true });
  }

  const piezaEnDiagrama = (id) => zona('lienzo').querySelector(`[data-pieza="${CSS.escape(id)}"]`);

  /**
   * En pantalla ancha el diagrama cabe completo si se puede (alto y ancho);
   * nunca más angosto que su `min-width` (el texto ya no se leería): entonces
   * la caja se desplaza. En pantalla angosta va a lo ancho y se desplaza de lado.
   */
  function ajustar() {
    const lienzo = dialogo && zona('lienzo');
    const svg = lienzo?.querySelector('svg');
    if (!svg) return;
    if (angosta()) {
      svg.style.width = '';
      return;
    }
    const vb = svg.viewBox?.baseVal;
    const minimo = parseFloat(svg.style.minWidth) || 0;
    const ancho = lienzo.clientWidth - 24;
    const alto = lienzo.clientHeight - 24;
    if (!vb?.width || ancho <= 0 || alto < 200) return;
    svg.style.width = `${Math.max(minimo, Math.min(ancho, (alto * vb.width) / vb.height))}px`;
  }

  /** El texto del estado de una pieza, en palabras del alumno. */
  function explicacion(est) {
    if (est === 'falta') return 'Todavía no existe en tu cuenta.';
    if (est === 'listo') return 'Está en tu cuenta y la revisión dice que está bien.';
    if (est === 'pendiente') return 'Ya está en tu cuenta, pero la revisión encontró algo por corregir:';
    if (modo !== 'revision') return 'Ya está en tu cuenta. Que exista no quiere decir que esté bien configurado: eso se califica al entregar.';
    if (fase === 'sin-conexion' || fase === 'error') return 'Ya está en tu cuenta. Sin la revisión no puedo decirte si está bien configurado.';
    // Con revisión y aun así «sin revisar»: la revisión solo trajo la calificación por tarea.
    if (usada) return 'Ya está en tu cuenta, pero su tarea todavía no está completa. Aquí la revisión solo da los puntos por tarea, no qué punto falta.';
    return 'Ya está en tu cuenta. Que exista no quiere decir que esté bien: con la revisión sabrás si le falta algo.';
  }

  /** Los puntos de la rúbrica que le faltan a una pieza: los suyos o, si no declara, los de su tarea. */
  function faltantes(p) {
    const t = (usada?.tareas ?? []).find((x) => x?.id === p.tarea);
    const checks = Array.isArray(t?.checks) ? t.checks : [];
    const propios = p.checks.length ? checks.filter((c) => p.checks.includes(c?.id)) : checks;
    return propios.filter((c) => c && c.ok !== true && c.texto);
  }

  function pintarDetalle(estados) {
    const p = elegida ? porId.get(elegida) : null;
    if (!p) {
      poner(
        'detalle',
        `<p class="diagrama__invita">Toca una pieza para ver qué es y qué le falta.</p>
         <p class="sutil">Con el teclado: <kbd>Tab</kbd> para moverte entre las piezas y <kbd>Enter</kbd> para elegir una.</p>`
      );
      return;
    }
    const est = estados[p.id] ?? 'falta';
    const clase = p.clase === 'flecha' ? (p.tipo === 'apoyo' ? 'Conexión de apoyo' : 'Conexión') : TIPOS[p.tipo]?.nombre ?? 'Pieza';
    const lista = est === 'pendiente' ? faltantes(p) : [];
    poner(
      'detalle',
      `<p class="diagrama__clase">${esc(clase)}${p.bono ? ' · <span class="diagrama__bono">Bono (opcional)</span>' : ''}</p>
       <h3 class="diagrama__pieza">${esc(p.etiqueta)}</h3>
       ${p.detalle ? `<p class="diagrama__dato"><code>${esc(p.detalle)}</code></p>` : ''}
       <p class="diagrama__estado diagrama__estado--${est}">${marcaSvg(est, 20)}<span><strong>${esc(ESTADOS[est].nombre)}.</strong> ${esc(explicacion(est))}</span></p>
       ${
         est === 'pendiente'
           ? lista.length
             ? `<ul class="diagrama__faltan">${lista.map((c) => `<li><strong>${esc(c.texto)}</strong>${c.retro ? `<span>${esc(c.retro)}</span>` : ''}</li>`).join('')}</ul>`
             : '<p class="sutil">Abre la pestaña «Mi avance» para ver el detalle de su tarea.</p>'
           : ''
       }
       <p class="diagrama__tarea">Es parte de <strong>${esc(nombreTarea(p.tarea))}</strong></p>
       ${numTarea.has(p.tarea) ? `<button type="button" class="boton boton--chico" data-ver-tarea="${esc(p.tarea)}">Ver la tarea ${icono('i-flecha')}</button>` : ''}`
    );
  }

  function pintarLista(estados) {
    const grupos = [...tareas.map((t) => t.id), ...new Set(piezas.map((p) => p.tarea).filter((id) => !numTarea.has(id)))];
    poner(
      'lista',
      grupos
        .map((id) => {
          const suyas = piezas.filter((p) => p.tarea === id);
          if (!suyas.length) return '';
          return `<section class="diagrama__grupo">
            <h4>${esc(nombreTarea(id))}</h4>
            <ul>${suyas
              .map((p) => {
                const est = estados[p.id] ?? 'falta';
                return `<li><button type="button" class="diagrama__renglon" data-elegir="${esc(p.id)}"${p.id === elegida ? ' aria-current="true"' : ''}>
                  ${marcaSvg(est, 18)}
                  <span><strong>${esc(p.etiqueta)}</strong> <span class="diagrama__renglon-estado">· ${esc(ESTADOS[est].nombre)}</span>${p.bono ? ' <span class="diagrama__bono">Bono</span>' : ''}${
                    p.detalle ? `<small>${esc(p.detalle)}</small>` : ''
                  }</span>
                </button></li>`;
              })
              .join('')}</ul>
          </section>`;
        })
        .join('')
    );
  }

  /* ------------------------------------------------------------- elegir */

  function elegir(id, { desde } = {}) {
    if (!porId.has(id)) return;
    const enLista = desde === 'lista' ? document.activeElement : null;
    elegida = id;
    pintar();
    if (enLista) zona('lista').querySelector(`[data-elegir="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
    // En pantalla angosta el detalle va debajo del diagrama: que se vea lo que
    // se eligió. En ancha, elegir desde la lista lleva el diagrama a la pieza.
    if (angosta()) zona('detalle').scrollIntoView({ block: 'nearest' });
    else if (desde === 'lista') mostrarEnLienzo(id);
  }

  /** Desplaza la caja del diagrama (y solo esa caja) hasta la pieza. */
  function mostrarEnLienzo(id) {
    const g = piezaEnDiagrama(id);
    const lienzo = zona('lienzo');
    if (!g) return;
    const r = g.getBoundingClientRect();
    const c = lienzo.getBoundingClientRect();
    if (r.left < c.left || r.right > c.right) lienzo.scrollLeft += r.left - c.left - (c.width - Math.min(r.width, c.width)) / 2;
    if (r.top < c.top || r.bottom > c.bottom) lienzo.scrollTop += r.top - c.top - (c.height - Math.min(r.height, c.height)) / 2;
  }

  function verTarea(id) {
    porTarea = true;
    cerrar();
    irATarea?.(id);
  }

  /* ------------------------------------------------------- la revisión */

  async function solicitar() {
    if (modo !== 'revision') return;
    if (enCurso) {
      otraVez = true;
      return;
    }
    clearTimeout(temporizador);
    temporizador = null;
    enCurso = true;
    otraVez = false;
    ultimaPeticion = Date.now();
    if (fase !== 'al-dia') fase = 'revisando';
    pintar();
    let r;
    try {
      r = await revisar();
    } catch (e) {
      r = { error: e?.estado ? e.message : null };
    }
    enCurso = false;
    if (!abierto || !r || r.entregada) return;
    if (r.apagada) {
      // Tu docente apagó «Revisar mi avance»: el modal se queda sin revisión.
      modo = 'presencia';
      usada = null;
      fase = null;
    } else if ('error' in r) {
      usada = null;
      fase = r.error ? 'error' : 'sin-conexion';
      mensajeError = r.error ?? '';
    } else if (r.revision) {
      usada = r.revision;
      fase = 'al-dia';
    }
    pintar();
    if (modo === 'revision' && (otraVez || (usada && usada.rev !== estado().rev))) programar();
  }

  function programar() {
    if (temporizador || modo !== 'revision' || !abierto) return;
    const pausa = fase === 'sin-conexion' || fase === 'error' ? TRAS_FALLO_MS : ENTRE_REVISIONES_MS;
    const espera = Math.max(TRAS_CAMBIO_MS, ultimaPeticion + pausa - Date.now());
    temporizador = setTimeout(() => {
      temporizador = null;
      if (abierto) solicitar();
    }, espera);
  }

  function revisarAhora() {
    clearTimeout(temporizador);
    temporizador = null;
    solicitar();
  }

  /* ----------------------------------------------------- abrir y cerrar */

  function abrir() {
    if (!dialogo) construir();
    if (abierto) return;
    const s = estado();
    modo = s.autorrevision ? 'revision' : 'presencia';
    // Una revisión de otra versión de la cuenta no se pinta como vigente: se
    // pinta sin revisión y se pide otra.
    usada = modo === 'revision' && s.revision && s.revision.rev === s.rev ? s.revision : null;
    fase = usada ? 'al-dia' : null;
    mensajeError = '';
    porTarea = false;
    abierto = true;
    pintar();
    dialogo.showModal();
    ajustar();
    dialogo.querySelector('#diagrama-titulo').focus({ preventScroll: true });
    if (modo === 'revision' && !usada) solicitar();
  }

  function cerrar() {
    if (dialogo?.open) dialogo.close();
  }

  function alCerrarse() {
    abierto = false;
    clearTimeout(temporizador);
    temporizador = null;
    clearTimeout(repintado);
    repintado = null;
    const t = porTarea;
    porTarea = false;
    alCerrar?.({ porTarea: t });
  }

  /**
   * La cuenta cambió (o se reinició: `olvidar`). Con el modal abierto se
   * repinta sin parpadear: se conservan las marcas de la última revisión y se
   * pide otra con calma.
   */
  function cuentaCambio({ olvidar = false } = {}) {
    if (olvidar) usada = null;
    if (!abierto) return;
    if (olvidar) pintar();
    else repintado ??= setTimeout(pintar, REPINTAR_MS);
    if (modo === 'revision') programar();
  }

  function destruir() {
    clearTimeout(temporizador);
    clearTimeout(repintado);
    observador?.disconnect();
    if (dialogo) {
      dialogo.removeEventListener('close', alCerrarse);
      if (dialogo.open) dialogo.close();
      dialogo.remove();
    }
    dialogo = null;
    abierto = false;
  }

  return {
    abrir,
    cerrar,
    cuentaCambio,
    destruir,
    get abierto() {
      return abierto;
    }
  };
}
