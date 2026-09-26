// El curso del lado del alumno: registro, índice, lecciones, ejercicios y la
// práctica final.
//
// Todo cuelga del hash (#/c1-intro, #/practica) y las llamadas al servidor
// son relativas (api/…): así la misma página sirve suelta en la raíz y montada
// en /m/comprender-nube/ dentro de la plataforma.
//
// El avance vive en localStorage y se copia al servidor para que el docente lo
// vea en vivo. Si el servidor no contesta, el curso sigue funcionando y la
// copia se reintenta en el siguiente movimiento.

import { CURSO } from './contenido.js';

const PREFIJO = 'comprender-nube:';
const LETRAS = ['A', 'B', 'C', 'D', 'E'];
const TIPOS = { leccion: 'Lección', opcion: 'Opción múltiple', clasificar: 'Clasificar' };

const app = document.getElementById('app');

/* ------------------------------------------------------------- memoria */

function zona(nombre) {
  try {
    return window[nombre];
  } catch {
    return null; // almacenamiento bloqueado por el navegador
  }
}

const local = zona('localStorage');
const sesion = zona('sessionStorage');

function leer(clave, porDefecto, donde = local) {
  try {
    const valor = donde?.getItem(PREFIJO + clave);
    return valor == null ? porDefecto : JSON.parse(valor);
  } catch {
    return porDefecto;
  }
}

function guardar(clave, valor, donde = local) {
  try {
    if (valor === null) donde?.removeItem(PREFIJO + clave);
    else donde?.setItem(PREFIJO + clave, JSON.stringify(valor));
  } catch {
    /* sin almacenamiento: el curso funciona igual, solo no recuerda */
  }
}

// ?proyectar=1 es para la computadora del salón: no pide registro ni guarda
// avance, y deja ver las notas del docente con la tecla N.
const parametros = new URLSearchParams(location.search);
if (parametros.has('proyectar')) guardar('proyectar', parametros.get('proyectar') !== '0', sesion);
const PROYECTOR = leer('proyectar', false, sesion) === true;

/* ------------------------------------------------------------- el curso */

const ACTIVIDADES = CURSO.capitulos.flatMap((capitulo) =>
  capitulo.actividades.map((actividad) => ({ ...actividad, capitulo }))
);
const INDICE = new Map(ACTIVIDADES.map((a, i) => [a.id, i]));
const XP_TOTAL = ACTIVIDADES.reduce((suma, a) => suma + a.xp, 0);

let perfil = leer('perfil', null);
let avance = leer('avance', { completados: {} });

const hecha = (id) => avance.completados[id] !== undefined;
const xpGanada = () => Object.values(avance.completados).reduce((suma, xp) => suma + xp, 0);

/* ------------------------------------------------------------ utilidades */

const escapar = (t) =>
  String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const icono = (id, clase = 'icono') => `<svg class="${clase}" aria-hidden="true"><use href="#${id}"></use></svg>`;
const numero = (n) => Number(n).toLocaleString('es-MX');
const nombreCorto = (nombre) => String(nombre ?? '').trim().split(/\s+/)[0];
const fechaHora = (iso) =>
  new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// crypto.randomUUID solo existe con HTTPS o en localhost, y en el salón la
// plataforma corre por http://192.168…; getRandomValues sí está siempre.
function nuevoId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Orden estable por alumno: el mismo alumno ve siempre el mismo orden, pero
// su vecino ve otro. Así copiar la letra no sirve.
function barajar(n, texto) {
  let s = 2166136261;
  for (const c of texto) s = Math.imul(s ^ c.codePointAt(0), 16777619) >>> 0;
  const azar = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const orden = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [orden[i], orden[j]] = [orden[j], orden[i]];
  }
  return orden;
}

function aviso(texto, tipo = 'xp') {
  const el = document.createElement('div');
  el.className = `aviso-flotante aviso-flotante--${tipo}`;
  el.setAttribute('role', 'status');
  el.textContent = texto;
  document.body.append(el);
  setTimeout(() => el.remove(), 2700);
}

function pantallaCompleta() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

async function api(ruta, cuerpo) {
  const opciones =
    cuerpo === undefined
      ? {}
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) };
  const r = await fetch(ruta, opciones);
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) {
    const error = new Error(datos.error || `El servidor respondió ${r.status}`);
    error.estado = r.status;
    error.datos = datos;
    throw error;
  }
  return datos;
}

/* ------------------------------------------------- copia hacia el servidor */

let practicaAbierta = null;
let esperaCopia = null;

function sincronizar(inmediato = false) {
  if (PROYECTOR || !perfil) return;
  clearTimeout(esperaCopia);
  esperaCopia = setTimeout(() => {
    api('api/progreso', { alumno: perfil, completados: avance.completados })
      .then((d) => cambiarEstadoPractica(d.practicaAbierta))
      .catch(() => {}); // se reintenta con el siguiente movimiento o el latido
  }, inmediato ? 0 : 400);
}

async function latido() {
  try {
    const d = await api(`api/estado${perfil && !PROYECTOR ? `?a=${perfil.id}` : ''}`);
    cambiarEstadoPractica(d.practicaAbierta);
  } catch {
    /* sin servidor por ahora */
  }
}

function cambiarEstadoPractica(abierta) {
  if (typeof abierta !== 'boolean' || abierta === practicaAbierta) return;
  practicaAbierta = abierta;
  const tarjeta = document.getElementById('tarjeta-practica');
  if (tarjeta) tarjeta.innerHTML = contenidoTarjetaPractica();
}

setInterval(latido, 15000);

function completar(actividad, xp) {
  if (PROYECTOR || hecha(actividad.id)) return;
  avance.completados[actividad.id] = xp;
  guardar('avance', avance);
  sincronizar(true);
  aviso(`+${xp} XP`);
  const barraXp = document.querySelector('.barra__xp');
  if (barraXp) barraXp.textContent = `${numero(xpGanada())} XP`;
  const capitulo = actividad.capitulo;
  if (capitulo.actividades.every((a) => hecha(a.id))) {
    setTimeout(() => aviso(`¡Capítulo ${capitulo.numero} completo!`, 'capitulo'), 1000);
  }
}

const siguienteDe = (actividad) => ACTIVIDADES[INDICE.get(actividad.id) + 1]?.id ?? 'practica';

/* ---------------------------------------------------------------- rutas */

let alSalir = [];
let alTeclado = null;

const ruta = () =>
  location.hash
    .replace(/^#\/?/, '')
    .split('/')
    .map((parte) => {
      try {
        return decodeURIComponent(parte);
      } catch {
        return parte;
      }
    });
const ir = (destino) => {
  location.hash = '#/' + destino;
};

function pintar() {
  for (const f of alSalir) f();
  alSalir = [];
  alTeclado = null;
  window.scrollTo(0, 0);

  const [primera = '', segunda] = ruta();
  if (!perfil && !PROYECTOR) return vistaRegistro();
  if (primera === '') return vistaCurso();
  if (primera === 'practica') return vistaPractica();
  if (primera === 'registro') return vistaRegistro();

  const i = INDICE.get(primera);
  if (i === undefined) return ir('');
  const actividad = ACTIVIDADES[i];
  if (actividad.tipo === 'leccion') return vistaLeccion(actividad, Number(segunda) || 1);
  return vistaEjercicio(actividad);
}

window.addEventListener('hashchange', pintar);

document.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  if (e.key === 'f' || e.key === 'F') {
    pantallaCompleta();
    return;
  }
  alTeclado?.(e);
});

const avisoProyector = () =>
  PROYECTOR
    ? `<p class="proyector-aviso">Modo proyector: no se guarda avance · F pantalla completa · N notas del docente · <a href="?proyectar=0${location.hash}">Salir</a></p>`
    : '';

/* ------------------------------------------------------------- registro */

function vistaRegistro() {
  app.innerHTML = `
    <main class="pagina pagina--angosta">
      <p class="etiqueta">Cómputo en la Nube · Curso</p>
      <h1 class="registro__titulo">${escapar(CURSO.titulo)}</h1>
      <p class="registro__intro">Antes de empezar, dinos quién eres para que tu docente vea tu avance. Toma 20 segundos.</p>
      <form class="hoja formulario" id="form-registro" novalidate>
        <label for="nombre">Nombre completo</label>
        <input id="nombre" name="nombre" autocomplete="name" maxlength="80" placeholder="Como aparece en la lista" value="${escapar(perfil?.nombre)}">
        <label for="matricula">Matrícula <span class="opcional">(opcional)</span></label>
        <input id="matricula" name="matricula" inputmode="numeric" autocomplete="off" maxlength="30" value="${escapar(perfil?.matricula)}">
        <label for="grupo">Grupo</label>
        <input id="grupo" name="grupo" autocomplete="off" maxlength="30" placeholder="Por ejemplo, SC03S" value="${escapar(perfil?.grupo)}">
        <details class="aviso-privacidad" open>
          <summary>Aviso de privacidad</summary>
          <p>Usamos tu nombre, tu matrícula y tu grupo <strong>solo</strong> para que tu docente vea tu avance en este curso y la calificación de tu práctica final. No se comparten con nadie ni se usan para otra cosa. Se guardan en el servidor de la materia y tu docente los borra al cerrar el ciclo escolar.</p>
        </details>
        <button class="boton boton--primario boton--ancho" type="submit">Empezar el curso</button>
        <p class="error" id="error-registro" role="alert"></p>
      </form>
      <p class="sutil registro__nota">Tu avance se guarda en este navegador: si cambias de celular, empiezas de cero.</p>
    </main>`;

  const form = document.getElementById('form-registro');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const nombre = form.nombre.value.trim().replace(/\s+/g, ' ');
    const grupo = form.grupo.value.trim().replace(/\s+/g, ' ').toUpperCase();
    const error = document.getElementById('error-registro');
    if (nombre.length < 3 || !nombre.includes(' ')) {
      error.textContent = 'Escribe tu nombre completo, con apellido.';
      form.nombre.focus();
      return;
    }
    if (!grupo) {
      error.textContent = 'Falta tu grupo.';
      form.grupo.focus();
      return;
    }
    perfil = { id: perfil?.id ?? nuevoId(), nombre, matricula: form.matricula.value.trim(), grupo };
    guardar('perfil', perfil);
    sincronizar(true);
    if (ruta()[0] === 'registro') ir('');
    else pintar();
  });
}

/* ---------------------------------------------------------------- índice */

function vistaCurso() {
  const hechas = ACTIVIDADES.filter((a) => hecha(a.id)).length;
  const siguiente = ACTIVIDADES.find((a) => !hecha(a.id));
  const abierto = siguiente?.capitulo.numero ?? null;
  const pct = Math.round((hechas / ACTIVIDADES.length) * 100);

  app.innerHTML = `
    ${avisoProyector()}
    <main class="pagina">
      <nav class="migas" aria-label="Ubicación">
        <a href="../../">← Cómputo en la Nube</a>
        ${perfil && !PROYECTOR ? `<span class="perfil">${escapar(nombreCorto(perfil.nombre))} · <b>${numero(xpGanada())} XP</b></span>` : ''}
      </nav>

      <header class="portada">
        <p class="etiqueta">Curso · ${escapar(CURSO.duracion)}</p>
        <h1>${escapar(CURSO.titulo)}</h1>
        <p class="portada__resumen">${escapar(CURSO.resumen)}</p>
        <ul class="portada__datos">
          <li>${icono('i-reloj')} ${escapar(CURSO.duracion)}</li>
          <li>${icono('i-libro')} ${CURSO.capitulos.length} capítulos</li>
          <li>${icono('i-check')} ${ACTIVIDADES.length} actividades</li>
          <li>${icono('i-estrella')} ${numero(XP_TOTAL)} XP</li>
        </ul>
        ${
          PROYECTOR
            ? ''
            : `<div class="portada__avance">
                <div class="progreso progreso--grande" role="progressbar" aria-label="Avance del curso" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
                <p>${hechas} de ${ACTIVIDADES.length} actividades · ${numero(xpGanada())} de ${numero(XP_TOTAL)} XP</p>
              </div>`
        }
        <a class="boton boton--primario" href="#/${siguiente ? siguiente.id : 'practica'}">
          ${siguiente ? `${hechas ? 'Continuar' : 'Empezar'}: ${escapar(siguiente.titulo)}` : 'Ir a la práctica final'} →
        </a>
      </header>

      ${CURSO.capitulos.map((c) => tarjetaCapitulo(c, siguiente, abierto)).join('')}

      <section class="practica-tarjeta" id="tarjeta-practica" aria-live="polite">${contenidoTarjetaPractica()}</section>

      <footer class="pie-curso">
        <a href="../../">Materiales de la materia</a>
        ${perfil && !PROYECTOR ? '<a href="#/registro">Corregir mis datos</a>' : ''}
        <a href="docente">Panel docente</a>
      </footer>
    </main>`;

  app.querySelectorAll('[data-plegar]').forEach((boton) =>
    boton.addEventListener('click', () => {
      const numeroCap = boton.dataset.plegar;
      const lista = document.getElementById(`lista-${numeroCap}`);
      lista.hidden = !lista.hidden;
      boton.setAttribute('aria-expanded', String(!lista.hidden));
      boton.firstChild.textContent = lista.hidden ? 'Mostrar detalles ' : 'Ocultar detalles ';
      guardar(`plegado-${numeroCap}`, lista.hidden, sesion);
    })
  );

  latido();
}

function tarjetaCapitulo(capitulo, siguiente, abierto) {
  const actividades = capitulo.actividades;
  const hechas = actividades.filter((a) => hecha(a.id)).length;
  const pct = Math.round((hechas / actividades.length) * 100);
  const xp = actividades.reduce((s, a) => s + a.xp, 0);
  const minutos = actividades.reduce((s, a) => s + a.minutos, 0);
  const plegado = leer(`plegado-${capitulo.numero}`, abierto !== null && capitulo.numero !== abierto, sesion);

  return `
    <section class="capitulo" id="capitulo-${capitulo.numero}" aria-labelledby="titulo-capitulo-${capitulo.numero}">
      <header class="capitulo__cabeza">
        <span class="capitulo__numero">${capitulo.numero}</span>
        <h2 class="capitulo__titulo" id="titulo-capitulo-${capitulo.numero}">${escapar(capitulo.titulo)}</h2>
        ${
          PROYECTOR
            ? ''
            : `<div class="capitulo__avance">
                <div class="progreso" role="progressbar" aria-label="Avance del capítulo ${capitulo.numero}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
                <span class="capitulo__pct">${pct}%</span>
              </div>`
        }
      </header>
      <p class="capitulo__descripcion">${escapar(capitulo.descripcion)}</p>
      <p class="capitulo__meta">≈ ${minutos} min · ${actividades.length} actividades · ${numero(xp)} XP</p>
      <ol class="actividades" id="lista-${capitulo.numero}" ${plegado ? 'hidden' : ''}>
        ${actividades.map((a) => filaActividad(a, siguiente)).join('')}
      </ol>
      <button class="capitulo__detalles" type="button" data-plegar="${capitulo.numero}" aria-expanded="${!plegado}" aria-controls="lista-${capitulo.numero}">${plegado ? 'Mostrar detalles' : 'Ocultar detalles'} ${icono('i-flecha', 'icono capitulo__flecha')}</button>
    </section>`;
}

function filaActividad(actividad, siguiente) {
  const lista = hecha(actividad.id) && !PROYECTOR;
  const esSiguiente = siguiente?.id === actividad.id && !PROYECTOR;
  return `
    <li>
      <a class="actividad ${lista ? 'actividad--hecha' : ''} ${esSiguiente ? 'actividad--siguiente' : ''}" href="#/${actividad.id}">
        <span class="actividad__icono" title="${TIPOS[actividad.tipo]}">${icono('t-' + actividad.tipo)}</span>
        <span class="actividad__titulo">
          ${escapar(actividad.titulo)}${esSiguiente ? '<span class="actividad__siguiente">Siguiente</span>' : ''}
          <span class="solo-lectores">. ${TIPOS[actividad.tipo]}${lista ? ', completada' : ''}.</span>
        </span>
        <span class="actividad__xp">${lista ? icono('i-check', 'icono actividad__check') + avance.completados[actividad.id] : actividad.xp} XP</span>
      </a>
    </li>`;
}

function contenidoTarjetaPractica() {
  const resultado = perfil ? leer(`resultado-${perfil.id}`, null) : null;

  if (PROYECTOR) {
    return `
      <span class="practica-tarjeta__estado">${icono('i-candado')} Se contesta en el celular</span>
      <h2>Práctica final: Panaderías Doña Rosca</h2>
      <p>Cada alumno la contesta en su dispositivo. Aquí puedes proyectar el caso.</p>
      <a class="boton" href="#/practica">Ver el caso</a>`;
  }

  if (resultado) {
    return `
      <span class="practica-tarjeta__estado practica-tarjeta__estado--abierta">${icono('i-check')} Entregada</span>
      <h2>Práctica final: Panaderías Doña Rosca</h2>
      <p>${resultado.aciertos !== undefined ? `Obtuviste ${resultado.aciertos} de ${resultado.total} aciertos.` : 'Tu práctica quedó registrada.'} Folio ${escapar(resultado.folio)}.</p>
      <a class="boton" href="#/practica">Ver mi comprobante</a>`;
  }

  if (practicaAbierta) {
    return `
      <span class="practica-tarjeta__estado practica-tarjeta__estado--abierta">${icono('i-check')} Abierta</span>
      <h2>Práctica final: Panaderías Doña Rosca</h2>
      <p>Un caso de una empresa que quiere mudarse a la nube: 20 preguntas, unos 20 minutos, una sola entrega.</p>
      <a class="boton boton--primario" href="#/practica">Empezar la práctica →</a>`;
  }

  return `
    <span class="practica-tarjeta__estado">${icono('i-candado')} Todavía cerrada</span>
    <h2>Práctica final: Panaderías Doña Rosca</h2>
    <p>Tu docente la abre al final de la clase. Esta tarjeta se actualiza sola: no tienes que recargar.</p>`;
}

/* -------------------------------------------------------------- lecciones */

function barraActividad(actividad) {
  return `
    ${avisoProyector()}
    <header class="barra">
      <a class="barra__volver" href="#/" aria-label="Volver al índice del curso">${icono('i-flecha', 'icono icono--atras')}<span>Curso</span></a>
      <div class="barra__centro">
        <span class="barra__capitulo">Capítulo ${actividad.capitulo.numero} · ${TIPOS[actividad.tipo]}</span>
        <span class="barra__titulo">${escapar(actividad.titulo)}</span>
      </div>
      <span class="barra__xp">${PROYECTOR ? 'Proyector' : `${numero(xpGanada())} XP`}</span>
    </header>`;
}

function activarLamina(raiz) {
  // Diagramas con dos vistas (por ejemplo, servidores propios contra nube).
  raiz.querySelectorAll('[data-modo-boton]').forEach((boton) =>
    boton.addEventListener('click', () => {
      const figura = boton.closest('[data-modo]');
      figura.dataset.modo = boton.dataset.modoBoton;
      figura.querySelectorAll('[data-modo-boton]').forEach((b) => b.setAttribute('aria-pressed', String(b === boton)));
    })
  );
}

function vistaLeccion(actividad, numeroLamina) {
  const total = actividad.laminas.length;
  let i = Math.min(Math.max(numeroLamina, 1), total) - 1;

  function mostrar(enfocar = false) {
    const lamina = actividad.laminas[i];
    const ultima = i === total - 1;
    const conNotas = PROYECTOR && lamina.notas;
    const textoFinal =
      hecha(actividad.id) || PROYECTOR ? 'Siguiente actividad →' : `Terminar lección · +${actividad.xp} XP`;

    app.innerHTML = `
      ${barraActividad(actividad)}
      <main class="leccion">
        <div class="leccion__puntos" aria-hidden="true">${actividad.laminas
          .map((_, j) => `<span class="${j === i ? 'actual' : j < i ? 'visto' : ''}"></span>`)
          .join('')}</div>
        <article class="lamina">
          <p class="lamina__contador">Lámina ${i + 1} de ${total}</p>
          <h1 class="lamina__titulo" id="titulo-lamina" tabindex="-1">${lamina.titulo}</h1>
          <div class="lamina__cuerpo">${lamina.html}</div>
        </article>
        ${conNotas ? `<aside class="notas" id="notas" hidden><h2>Notas para el docente</h2><p>${lamina.notas}</p></aside>` : ''}
      </main>
      <nav class="navegacion" aria-label="Láminas">
        <button class="boton" type="button" data-accion="anterior" ${i === 0 ? 'disabled' : ''}>← Anterior</button>
        ${conNotas ? '<button class="boton boton--sutil" type="button" data-accion="notas">Notas (N)</button>' : ''}
        <button class="boton boton--primario" type="button" data-accion="${ultima ? 'terminar' : 'siguiente'}">${ultima ? textoFinal : 'Siguiente →'}</button>
      </nav>`;

    // replaceState no dispara hashchange: la lámina queda en la dirección para
    // que una recarga en el proyector no regrese al principio.
    history.replaceState(null, '', `#/${actividad.id}/${i + 1}`);
    activarLamina(app);
    app.querySelector('.navegacion').addEventListener('click', (e) => {
      const accion = e.target.closest('[data-accion]')?.dataset.accion;
      if (accion === 'anterior') retroceder();
      if (accion === 'siguiente') avanzar();
      if (accion === 'terminar') terminar();
      if (accion === 'notas') alternarNotas();
    });
    if (enfocar) document.getElementById('titulo-lamina').focus({ preventScroll: true });
  }

  function avanzar() {
    if (i < total - 1) {
      i += 1;
      window.scrollTo(0, 0);
      mostrar(true);
    } else {
      terminar();
    }
  }

  function retroceder() {
    if (i === 0) return;
    i -= 1;
    window.scrollTo(0, 0);
    mostrar(true);
  }

  function terminar() {
    completar(actividad, actividad.xp);
    ir(siguienteDe(actividad));
  }

  function alternarNotas() {
    const notas = document.getElementById('notas');
    if (notas) notas.hidden = !notas.hidden;
  }

  alTeclado = (e) => {
    // Espacio o Enter sobre un botón ya lo activan; no avanzamos dos veces.
    if ((e.key === ' ' || e.key === 'Enter') && e.target.closest('button, a, summary')) return;
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) {
      e.preventDefault();
      // El control del proyector manda PageDown: si la lámina no cabe en la
      // pantalla, el primer clic baja a lo que falta y el siguiente avanza.
      const falta = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
      if (falta > 40) {
        window.scrollBy({ top: window.innerHeight * 0.7, behavior: 'smooth' });
        return;
      }
      avanzar();
    } else if (['ArrowLeft', 'PageUp'].includes(e.key)) {
      e.preventDefault();
      retroceder();
    } else if (e.key === 'n' || e.key === 'N') {
      alternarNotas();
    }
  };

  mostrar();
}

/* ------------------------------------------------------------- ejercicios */

function vistaEjercicio(actividad) {
  const yaHecha = hecha(actividad.id);
  const libre = yaHecha || PROYECTOR;
  const pena = { pista: Math.round(actividad.xp * 0.3), fallo: Math.round(actividad.xp * 0.2) };
  const minimo = Math.round(actividad.xp * 0.1);
  const estado = { fallos: 0, pista: false, terminado: false };
  const vale = () =>
    Math.max(minimo, actividad.xp - (estado.pista ? pena.pista : 0) - estado.fallos * pena.fallo);

  app.innerHTML = `
    ${barraActividad(actividad)}
    <main class="ejercicio">
      <section class="ejercicio__planteamiento" aria-labelledby="titulo-ejercicio">
        <p class="etiqueta etiqueta--suave">${TIPOS[actividad.tipo]}</p>
        <h1 class="ejercicio__titulo" id="titulo-ejercicio">${escapar(actividad.titulo)}</h1>
        <div class="ejercicio__contexto">${actividad.contexto}</div>
        <div class="instrucciones">
          <div class="instrucciones__cabeza">
            <h2>Instrucciones</h2>
            <span class="instrucciones__xp" id="vale">${libre ? 'Práctica libre' : `Vale ${vale()} XP`}</span>
          </div>
          <p class="instrucciones__pregunta">${escapar(actividad.pregunta)}</p>
          ${actividad.tipo === 'clasificar' ? '<p class="instrucciones__como">Toca una ficha y elige su grupo. En computadora también puedes arrastrarla a su caja.</p>' : ''}
          <button class="boton boton--sutil boton--chico" type="button" id="btn-pista">${icono('i-foco')} Pedir pista${libre ? '' : ` (−${pena.pista} XP)`}</button>
          <p class="pista" id="pista" hidden>${escapar(actividad.pista)}</p>
        </div>
        ${yaHecha && !PROYECTOR ? `<p class="ya-hecha">${icono('i-check')} Ya lo completaste y ganaste ${avance.completados[actividad.id]} XP. Puedes practicarlo otra vez: tu XP no cambia.</p>` : ''}
      </section>
      <section class="ejercicio__zona" aria-label="Tu respuesta">
        <div id="zona"></div>
        <div class="ejercicio__acciones">
          <button class="boton boton--primario" type="button" id="btn-enviar" disabled>Enviar respuesta</button>
          <button class="boton boton--sutil" type="button" id="btn-solucion" ${PROYECTOR ? '' : 'hidden'}>Ver la respuesta</button>
        </div>
        <div class="retro" id="retro" role="status" aria-live="polite" hidden></div>
      </section>
    </main>`;

  const zonaRespuesta = document.getElementById('zona');
  const btnEnviar = document.getElementById('btn-enviar');
  const btnSolucion = document.getElementById('btn-solucion');
  const retro = document.getElementById('retro');
  const pintarVale = () => {
    if (!libre) document.getElementById('vale').textContent = `Vale ${vale()} XP`;
  };

  const control = (actividad.tipo === 'opcion' ? opcionMultiple : clasificador)(actividad, zonaRespuesta, () => {
    btnEnviar.disabled = estado.terminado || !control.listo();
  });

  document.getElementById('btn-pista').addEventListener('click', (e) => {
    estado.pista = true;
    document.getElementById('pista').hidden = false;
    e.currentTarget.disabled = true;
    pintarVale();
  });

  btnEnviar.addEventListener('click', () => {
    const resultado = control.revisar(estado.fallos);
    if (resultado.bien) exito(resultado.retro);
    else fallo(resultado.retro);
  });

  btnSolucion.addEventListener('click', () => {
    estado.fallos = Math.max(estado.fallos, 99); // ver la respuesta deja el mínimo de XP
    exito(control.solucion(), true);
  });

  function exito(texto, conSolucion = false) {
    estado.terminado = true;
    btnEnviar.disabled = true;
    btnSolucion.hidden = true;
    const xp = vale();
    const nueva = !yaHecha && !PROYECTOR;
    if (nueva) completar(actividad, xp);
    const encabezado = conSolucion
      ? `Esta es la respuesta${nueva ? ` · +${xp} XP` : ''}`
      : `¡Correcto!${nueva ? ` +${xp} XP` : ''}`;
    retro.className = 'retro retro--bien';
    retro.innerHTML = `
      <div class="retro__cabeza">${icono('i-check')}<strong>${encabezado}</strong></div>
      <p>${texto}</p>
      <button class="boton boton--primario" type="button" id="btn-continuar">Continuar →</button>`;
    retro.hidden = false;
    document.getElementById('btn-continuar').addEventListener('click', () => ir(siguienteDe(actividad)));
    retro.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function fallo(texto) {
    estado.fallos += 1;
    pintarVale();
    btnEnviar.disabled = true;
    if (estado.fallos >= 2) btnSolucion.hidden = false;
    retro.className = 'retro retro--mal';
    retro.innerHTML = `
      <div class="retro__cabeza">${icono('i-alerta')}<strong>Todavía no</strong></div>
      ${texto}
      <p class="sutil">${libre ? 'Corrige y vuelve a enviar.' : `Corrige y vuelve a enviar: ahora vale ${vale()} XP.`}${estado.fallos >= 2 ? ' Si te atoras, puedes ver la respuesta.' : ''}</p>`;
    retro.hidden = false;
    retro.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function opcionMultiple(actividad, zonaRespuesta, alCambiar) {
  let elegida = null;
  let resuelta = false;
  const descartadas = new Set();

  function pintarOpciones(enfocar) {
    zonaRespuesta.innerHTML = `
      <div class="opciones">
        ${actividad.opciones
          .map((o, i) => {
            const clase = resuelta && o.correcta ? 'opcion--bien' : descartadas.has(i) ? 'opcion--mal' : '';
            const bloqueada = resuelta || descartadas.has(i);
            return `<button type="button" class="opcion ${clase}" data-i="${i}" aria-pressed="${elegida === i}" ${bloqueada ? 'disabled' : ''}>
                <span class="opcion__letra">${LETRAS[i]}</span><span class="opcion__texto">${escapar(o.texto)}</span>
              </button>`;
          })
          .join('')}
      </div>`;
    if (enfocar !== undefined) zonaRespuesta.querySelector(`[data-i="${enfocar}"]`)?.focus();
  }

  zonaRespuesta.addEventListener('click', (e) => {
    const boton = e.target.closest('[data-i]');
    if (!boton || boton.disabled) return;
    elegida = Number(boton.dataset.i);
    pintarOpciones(elegida);
    alCambiar();
  });

  pintarOpciones();

  return {
    listo: () => elegida !== null,
    revisar() {
      const opcion = actividad.opciones[elegida];
      if (opcion.correcta) {
        resuelta = true;
        pintarOpciones();
        return { bien: true, retro: escapar(opcion.retro) };
      }
      descartadas.add(elegida);
      elegida = null;
      pintarOpciones();
      alCambiar();
      return { bien: false, retro: `<p>${escapar(opcion.retro)}</p>` };
    },
    solucion() {
      resuelta = true;
      elegida = actividad.opciones.findIndex((o) => o.correcta);
      pintarOpciones();
      return escapar(actividad.opciones[elegida].retro);
    }
  };
}

function clasificador(actividad, zonaRespuesta, alCambiar) {
  const lugar = actividad.fichas.map(() => null); // id del grupo de cada ficha
  const bien = new Set(); // ya confirmadas: no se mueven
  const mal = new Set(); // marcadas en rojo tras enviar
  let seleccion = null;
  let arrastrando = null;

  const fichasDe = (destino) => actividad.fichas.map((_, i) => i).filter((i) => lugar[i] === destino);

  function ficha(i) {
    const clases = ['ficha', bien.has(i) && 'ficha--bien', mal.has(i) && 'ficha--mal', seleccion === i && 'ficha--elegida']
      .filter(Boolean)
      .join(' ');
    const marca = bien.has(i) ? icono('i-check', 'icono ficha__marca') : mal.has(i) ? icono('i-alerta', 'icono ficha__marca') : '';
    return `<button type="button" class="${clases}" data-ficha="${i}" draggable="${!bien.has(i)}" aria-pressed="${seleccion === i}"${bien.has(i) ? ' aria-disabled="true"' : ''}>${marca}<span>${escapar(actividad.fichas[i].texto)}</span></button>`;
  }

  // En el celular las cajas de los grupos quedan lejos de la ficha: por eso,
  // al elegir una, sus opciones aparecen justo debajo de ella.
  function selector(i) {
    if (seleccion !== i) return '';
    return `<div class="elegir-grupo" role="group" aria-label="¿A qué grupo va?">
        <span class="elegir-grupo__titulo">Va en:</span>
        ${actividad.grupos
          .map((g) => `<button type="button" class="elegir-grupo__boton grupo--${g.color}" data-soltar="${g.id}">${escapar(g.nombre)}</button>`)
          .join('')}
        ${lugar[i] !== null ? '<button type="button" class="elegir-grupo__boton" data-soltar="">Sin clasificar</button>' : ''}
      </div>`;
  }

  const conSelector = (i) => ficha(i) + selector(i);

  function pintarZona(enfocar) {
    const pendientes = fichasDe(null);
    zonaRespuesta.innerHTML = `
      <div class="clasificar ${seleccion !== null ? 'clasificar--eligiendo' : ''}">
        <div class="bandeja ${pendientes.length ? '' : 'bandeja--vacia'}" data-destino="">
          <p class="bandeja__titulo">${pendientes.length ? `Por clasificar · ${pendientes.length}` : 'Todas clasificadas. Revisa y envía.'}</p>
          <div class="bandeja__fichas">${pendientes.map(conSelector).join('')}</div>
        </div>
        <p class="clasificar__ayuda" aria-live="polite">${seleccion !== null ? 'Elige su grupo en los botones que aparecieron debajo de la ficha o toca una caja.' : ''}</p>
        <div class="grupos grupos--${actividad.grupos.length}">
          ${actividad.grupos
            .map(
              (g) => `
            <div class="grupo grupo--${g.color}" data-destino="${g.id}">
              <button type="button" class="grupo__cabeza" data-soltar="${g.id}" aria-label="Poner en ${escapar(g.nombre)}">
                <span>${escapar(g.nombre)}</span><span class="grupo__poner" aria-hidden="true">Poner aquí</span>
              </button>
              <div class="grupo__fichas">${fichasDe(g.id).map(conSelector).join('')}</div>
            </div>`
            )
            .join('')}
        </div>
      </div>`;
    if (enfocar !== undefined) zonaRespuesta.querySelector(`[data-ficha="${enfocar}"]`)?.focus();
  }

  function mover(i, destino) {
    if (i === null || bien.has(i)) return;
    lugar[i] = destino || null;
    mal.delete(i);
    seleccion = null;
    pintarZona(i);
    alCambiar();
  }

  zonaRespuesta.addEventListener('click', (e) => {
    const botonFicha = e.target.closest('[data-ficha]');
    if (botonFicha) {
      const i = Number(botonFicha.dataset.ficha);
      if (bien.has(i)) return;
      // Tocar una ficha que ya estaba elegida la suelta; tocar otra la elige.
      seleccion = seleccion === i ? null : i;
      pintarZona(i);
      return;
    }
    const soltar = e.target.closest('[data-soltar]');
    if (soltar && seleccion !== null) return mover(seleccion, soltar.dataset.soltar);
    const destino = e.target.closest('[data-destino]');
    if (destino && seleccion !== null) mover(seleccion, destino.dataset.destino);
  });

  // Arrastrar con el mouse. En pantallas táctiles se usa tocar y tocar.
  zonaRespuesta.addEventListener('dragstart', (e) => {
    const botonFicha = e.target.closest('[data-ficha]');
    if (!botonFicha) return;
    arrastrando = Number(botonFicha.dataset.ficha);
    e.dataTransfer.setData('text/plain', String(arrastrando));
    e.dataTransfer.effectAllowed = 'move';
  });
  zonaRespuesta.addEventListener('dragover', (e) => {
    const destino = e.target.closest('[data-destino]');
    if (!destino || arrastrando === null) return;
    e.preventDefault();
    zonaRespuesta.querySelectorAll('.encima').forEach((x) => x !== destino && x.classList.remove('encima'));
    destino.classList.add('encima');
  });
  zonaRespuesta.addEventListener('drop', (e) => {
    const destino = e.target.closest('[data-destino]');
    if (!destino || arrastrando === null) return;
    e.preventDefault();
    const i = arrastrando;
    arrastrando = null;
    mover(i, destino.dataset.destino);
  });
  zonaRespuesta.addEventListener('dragend', () => {
    arrastrando = null;
    zonaRespuesta.querySelectorAll('.encima').forEach((x) => x.classList.remove('encima'));
  });

  pintarZona();

  return {
    // Para volver a enviar hay que mover antes todas las fichas en rojo.
    listo: () => lugar.every((g) => g !== null) && mal.size === 0,
    revisar(fallosPrevios) {
      actividad.fichas.forEach((f, i) => {
        if (lugar[i] === f.grupo) bien.add(i);
        else mal.add(i);
      });
      seleccion = null;
      pintarZona();
      if (mal.size === 0) return { bien: true, retro: escapar(actividad.cierre) };

      const cuantas = mal.size === 1 ? 'Una ficha está' : `${mal.size} fichas están`;
      let texto = `<p>${cuantas} en el grupo equivocado (en rojo). Las verdes ya quedaron. Mueve las rojas y vuelve a enviar.</p>`;
      // Al segundo intento se explica cada error: así nadie se queda atorado.
      if (fallosPrevios >= 1) {
        texto += `<ul>${[...mal]
          .map((i) => `<li><strong>${escapar(actividad.fichas[i].texto)}</strong> ${escapar(actividad.fichas[i].retro)}</li>`)
          .join('')}</ul>`;
      }
      return { bien: false, retro: texto };
    },
    solucion() {
      actividad.fichas.forEach((f, i) => {
        lugar[i] = f.grupo;
        bien.add(i);
      });
      mal.clear();
      seleccion = null;
      pintarZona();
      return escapar(actividad.cierre);
    }
  };
}

/* ---------------------------------------------------------------- práctica */

function barraPractica(detalle = '') {
  return `
    ${avisoProyector()}
    <header class="barra">
      <a class="barra__volver" href="#/" aria-label="Volver al índice del curso">${icono('i-flecha', 'icono icono--atras')}<span>Curso</span></a>
      <div class="barra__centro">
        <span class="barra__capitulo">Práctica final</span>
        <span class="barra__titulo">Caso: Panaderías Doña Rosca</span>
      </div>
      <span class="barra__xp" id="barra-detalle">${detalle}</span>
    </header>`;
}

async function vistaPractica() {
  app.innerHTML = `${barraPractica()}<main class="pagina pagina--angosta"><p class="cargando">Cargando la práctica…</p></main>`;

  if (PROYECTOR) return practicaProyector();

  let datos;
  try {
    datos = await api('api/practica', { alumno: perfil });
  } catch (e) {
    const guardado = leer(`resultado-${perfil.id}`, null);
    if (guardado) return practicaResultado(guardado);
    return practicaError(e.message);
  }
  if (ruta()[0] !== 'practica') return; // el alumno ya se fue a otra parte

  if (datos.estado === 'entregada') {
    guardar(`resultado-${perfil.id}`, datos.resultado);
    return practicaResultado(datos.resultado);
  }
  // El servidor manda: si el docente permitió un reintento, se olvida el comprobante viejo.
  guardar(`resultado-${perfil.id}`, null);
  cambiarEstadoPractica(datos.estado === 'abierta');
  if (datos.estado === 'cerrada') return practicaCerrada();
  practicaAbiertaVista(datos);
}

function practicaError(mensaje) {
  app.innerHTML = `
    ${barraPractica()}
    <main class="pagina pagina--angosta">
      <div class="hoja">
        <h1>No pude cargar la práctica</h1>
        <p>${escapar(mensaje)}. Revisa que sigas conectado al Wi-Fi del salón.</p>
        <button class="boton boton--primario" type="button" id="btn-reintentar">Intentar de nuevo</button>
      </div>
    </main>`;
  document.getElementById('btn-reintentar').addEventListener('click', pintar);
}

function practicaCerrada() {
  app.innerHTML = `
    ${barraPractica()}
    <main class="pagina pagina--angosta practica">
      <p class="etiqueta">Práctica final</p>
      <h1>Todavía está cerrada</h1>
      <div class="hoja">
        <p>Tu docente la abre cuando todo el grupo termine el curso. En cuanto la abra, esta pantalla cambia sola.</p>
        <p class="sutil">Mientras tanto, repasa las lecciones que se te hicieron más difíciles.</p>
        <a class="boton" href="#/">Volver al curso</a>
      </div>
    </main>`;
  const espera = setInterval(async () => {
    try {
      const d = await api(`api/estado?a=${perfil.id}`);
      if (d.practicaAbierta) pintar();
    } catch {
      /* sigue esperando */
    }
  }, 5000);
  alSalir.push(() => clearInterval(espera));
}

async function practicaProyector() {
  let caso = '';
  try {
    caso = (await api('api/caso')).caso;
  } catch {
    caso = '<p>No pude cargar el caso.</p>';
  }
  app.innerHTML = `
    ${barraPractica('Proyector')}
    <main class="pagina pagina--angosta practica">
      <p class="etiqueta">Práctica final</p>
      <h1>Caso: Panaderías Doña Rosca</h1>
      <div class="hoja caso">${caso}</div>
      <p class="sutil">Las preguntas se contestan en el celular de cada alumno.</p>
    </main>`;
}

function practicaAbiertaVista(datos) {
  const { preguntas, caso } = datos;
  const clave = `practica-${perfil.id}`;
  const estado = leer(clave, { respuestas: {}, actual: 0, fase: 'inicio' });
  // Si cambió el banco de preguntas, se descartan respuestas que ya no existen.
  const ids = new Set(preguntas.map((p) => p.id));
  for (const id of Object.keys(estado.respuestas)) if (!ids.has(id)) delete estado.respuestas[id];
  estado.actual = Math.min(estado.actual, preguntas.length - 1);

  const ordenes = Object.fromEntries(
    preguntas.map((p) => [p.id, p.fijo ? p.opciones.map((_, i) => i) : barajar(p.opciones.length, `${perfil.id}:${p.id}`)])
  );
  const contestadas = () => preguntas.filter((p) => Number.isInteger(estado.respuestas[p.id])).length;
  const recordar = () => guardar(clave, estado);

  function mostrar() {
    recordar();
    window.scrollTo(0, 0);
    if (estado.fase === 'inicio') return inicio();
    if (estado.fase === 'revision') return revision();
    return pregunta();
  }

  function inicio() {
    alTeclado = null;
    app.innerHTML = `
      ${barraPractica()}
      <main class="pagina pagina--angosta practica">
        <p class="etiqueta">Práctica final</p>
        <h1>Caso: Panaderías Doña Rosca</h1>
        <div class="hoja caso">${caso}</div>
        <ul class="reglas">
          <li><strong>${preguntas.length} preguntas</strong> de opción múltiple sobre todo el curso, en unos 20 minutos.</li>
          <li>El caso siempre está a un toque de distancia, arriba de cada pregunta.</li>
          <li>Tus respuestas se guardan en este celular mientras contestas.</li>
          <li><strong>Solo puedes entregar una vez.</strong> Revisa antes de enviar.</li>
        </ul>
        <button class="boton boton--primario boton--ancho" type="button" id="btn-empezar">${contestadas() ? 'Continuar la práctica' : 'Empezar'} →</button>
      </main>`;
    document.getElementById('btn-empezar').addEventListener('click', () => {
      estado.fase = 'pregunta';
      mostrar();
    });
  }

  function regla() {
    return `<div class="regla" role="group" aria-label="Ir a una pregunta">${preguntas
      .map((p, i) => {
        const clases = ['marca', Number.isInteger(estado.respuestas[p.id]) && 'marca--contestada', estado.fase === 'pregunta' && i === estado.actual && 'marca--actual']
          .filter(Boolean)
          .join(' ');
        return `<button type="button" class="${clases}" data-ir="${i}" aria-label="Pregunta ${i + 1}${Number.isInteger(estado.respuestas[p.id]) ? ', contestada' : ', sin contestar'}"></button>`;
      })
      .join('')}</div>`;
  }

  function pregunta() {
    const p = preguntas[estado.actual];
    const faltan = preguntas.length - contestadas();
    const orden = ordenes[p.id];
    const ultima = estado.actual === preguntas.length - 1;

    app.innerHTML = `
      ${barraPractica(`${contestadas()}/${preguntas.length}`)}
      <main class="pagina pagina--angosta practica">
        <details class="caso-plegable"><summary>Ver el caso de Doña Rosca</summary><div class="caso">${caso}</div></details>
        ${regla()}
        <p class="practica__conteo"><span>Pregunta ${estado.actual + 1} de ${preguntas.length}</span><span>${faltan ? `Faltan ${faltan}` : 'Ya contestaste todas'}</span></p>
        <div class="hoja">
          <p class="pregunta__tema">${escapar(p.tema)}</p>
          <h1 class="pregunta__texto" tabindex="-1" id="texto-pregunta">${escapar(p.texto)}</h1>
          <div class="opciones">
            ${orden
              .map(
                (original, posicion) => `
              <button type="button" class="opcion" data-opcion="${original}" aria-pressed="${estado.respuestas[p.id] === original}">
                <span class="opcion__letra">${LETRAS[posicion]}</span><span class="opcion__texto">${escapar(p.opciones[original])}</span>
              </button>`
              )
              .join('')}
          </div>
        </div>
        <nav class="navegacion navegacion--practica" aria-label="Preguntas">
          <button class="boton" type="button" data-accion="anterior" ${estado.actual === 0 ? 'disabled' : ''}>← Anterior</button>
          <button class="boton boton--primario" type="button" data-accion="siguiente">${ultima ? 'Revisar y entregar' : 'Siguiente →'}</button>
        </nav>
      </main>`;

    app.querySelector('.opciones').addEventListener('click', (e) => {
      const boton = e.target.closest('[data-opcion]');
      if (!boton) return;
      estado.respuestas[p.id] = Number(boton.dataset.opcion);
      recordar();
      app.querySelectorAll('[data-opcion]').forEach((b) => b.setAttribute('aria-pressed', String(b === boton)));
      // Avanza solo, como el examen diagnóstico, sin brincarse la última.
      if (!ultima) {
        setTimeout(() => {
          if (ruta()[0] !== 'practica' || preguntas[estado.actual] !== p) return;
          estado.actual += 1;
          mostrar();
        }, 220);
      } else {
        document.getElementById('barra-detalle').textContent = `${contestadas()}/${preguntas.length}`;
        app.querySelector(`[data-ir="${estado.actual}"]`)?.classList.add('marca--contestada');
      }
    });
    app.querySelector('.navegacion').addEventListener('click', (e) => {
      const accion = e.target.closest('[data-accion]')?.dataset.accion;
      if (accion === 'anterior' && estado.actual > 0) {
        estado.actual -= 1;
        mostrar();
      }
      if (accion === 'siguiente') {
        if (ultima) estado.fase = 'revision';
        else estado.actual += 1;
        mostrar();
      }
    });
    conectarRegla();
    document.getElementById('texto-pregunta').focus({ preventScroll: true });
  }

  function conectarRegla() {
    app.querySelector('.regla').addEventListener('click', (e) => {
      const boton = e.target.closest('[data-ir]');
      if (!boton) return;
      estado.actual = Number(boton.dataset.ir);
      estado.fase = 'pregunta';
      mostrar();
    });
  }

  function revision() {
    const faltan = preguntas.length - contestadas();
    app.innerHTML = `
      ${barraPractica(`${contestadas()}/${preguntas.length}`)}
      <main class="pagina pagina--angosta practica">
        <p class="etiqueta">Antes de entregar</p>
        <h1>Revisa tus respuestas</h1>
        <p>${faltan === 0 ? `Contestaste las ${preguntas.length} preguntas.` : `Te ${faltan === 1 ? 'falta 1 pregunta' : `faltan ${faltan} preguntas`}. Puedes entregar así, pero cuentan como error.`} Una vez que entregues ya no podrás cambiar nada.</p>
        ${regla()}
        <ol class="revision">
          ${preguntas
            .map((p, i) => {
              const lista = Number.isInteger(estado.respuestas[p.id]);
              return `<li><button type="button" data-ir="${i}">
                <span class="revision__num">${i + 1}</span>
                <span class="revision__texto">${escapar(p.texto)}</span>
                <span class="revision__estado ${lista ? '' : 'revision__estado--falta'}">${lista ? LETRAS[ordenes[p.id].indexOf(estado.respuestas[p.id])] : 'Falta'}</span>
              </button></li>`;
            })
            .join('')}
        </ol>
        <div class="acciones">
          <button class="boton" type="button" id="btn-volver">Seguir contestando</button>
          <button class="boton boton--primario" type="button" id="btn-entregar">Entregar práctica</button>
        </div>
        <p class="error" id="error-entrega" role="alert"></p>
      </main>`;

    conectarRegla();
    app.querySelector('.revision').addEventListener('click', (e) => {
      const boton = e.target.closest('[data-ir]');
      if (!boton) return;
      estado.actual = Number(boton.dataset.ir);
      estado.fase = 'pregunta';
      mostrar();
    });
    document.getElementById('btn-volver').addEventListener('click', () => {
      const pendiente = preguntas.findIndex((p) => !Number.isInteger(estado.respuestas[p.id]));
      estado.actual = pendiente === -1 ? preguntas.length - 1 : pendiente;
      estado.fase = 'pregunta';
      mostrar();
    });
    document.getElementById('btn-entregar').addEventListener('click', entregar);
  }

  async function entregar() {
    const boton = document.getElementById('btn-entregar');
    const error = document.getElementById('error-entrega');
    boton.disabled = true;
    error.textContent = '';
    try {
      const datosEntrega = await api('api/practica/entregar', { alumno: perfil, respuestas: estado.respuestas });
      terminar(datosEntrega.resultado);
    } catch (e) {
      if (e.estado === 409 && e.datos?.resultado) return terminar(e.datos.resultado);
      error.textContent =
        e.estado === 423 ? e.message : `${e.message}. Revisa tu conexión e inténtalo otra vez: tus respuestas siguen guardadas.`;
      boton.disabled = false;
    }
  }

  function terminar(resultado) {
    guardar(clave, null);
    guardar(`resultado-${perfil.id}`, resultado);
    practicaResultado(resultado);
  }

  mostrar();
}

function practicaResultado(r) {
  alTeclado = null;
  const conCalificacion = r.aciertos !== undefined;
  const temas = (r.porTema ?? [])
    .map((t) => {
      const pct = Math.round((t.aciertos / t.total) * 100);
      return `<div class="barra-tema ${pct < 60 ? 'barra-tema--debil' : ''}">
          <span class="barra-tema__nombre">${escapar(t.tema)}</span><span class="barra-tema__valor">${t.aciertos}/${t.total}</span>
          <div class="progreso"><span style="width:${pct}%"></span></div>
        </div>`;
    })
    .join('');
  const detalle = (r.detalle ?? [])
    .map(
      (d, i) => `<li class="${d.correcta ? 'detalle--bien' : 'detalle--mal'}">
        <strong>${i + 1}. ${escapar(d.texto)}</strong>
        <p>${d.correcta ? 'Correcta' : `Tu respuesta: ${escapar(d.elegida ?? 'sin contestar')}. La correcta: ${escapar(d.respuesta)}.`}</p>
        <p class="sutil">${escapar(d.explicacion)}</p>
      </li>`
    )
    .join('');

  app.innerHTML = `
    ${barraPractica('Entregada')}
    <main class="pagina pagina--angosta practica resultado">
      <p class="etiqueta">Práctica entregada</p>
      <h1>¡Listo, ${escapar(nombreCorto(r.nombre))}!</h1>
      ${
        conCalificacion
          ? `<div class="hoja resultado__marcador">
              <div class="resultado__cifra">${r.aciertos}<span> de ${r.total} aciertos</span></div>
              <p>${r.porcentaje}&nbsp;% · calificación ${r.calificacion.toFixed(1)}</p>
            </div>
            <h2>Cómo te fue por tema</h2>
            ${temas}`
          : '<p>Tu práctica quedó registrada. Los resultados los revisamos en clase.</p>'
      }
      ${detalle ? `<h2>Pregunta por pregunta</h2><ol class="detalle-resultado">${detalle}</ol>` : ''}
      <section class="hoja comprobante" aria-labelledby="titulo-comprobante">
        <h2 id="titulo-comprobante">Comprobante de entrega</h2>
        <dl>
          <div><dt>Nombre</dt><dd>${escapar(r.nombre)}</dd></div>
          <div><dt>Matrícula</dt><dd>${escapar(r.matricula || '—')}</dd></div>
          <div><dt>Grupo</dt><dd>${escapar(r.grupo)}</dd></div>
          <div><dt>Entregada</dt><dd>${escapar(fechaHora(r.fin))}</dd></div>
          <div><dt>Folio</dt><dd class="mono">${escapar(r.folio)}</dd></div>
        </dl>
        <p class="sutil">Tómale captura a esta pantalla: es tu comprobante de entrega.</p>
      </section>
      <div class="acciones">
        ${conCalificacion ? `<a class="boton boton--primario" href="api/practica/reporte.pdf?a=${perfil.id}" download>${icono('i-libro')} Descargar mi reporte en PDF</a>` : ''}
        <a class="boton" href="#/">Volver al curso</a>
      </div>
      ${conCalificacion ? '<p class="sutil">El reporte trae tu dominio por tema y por concepto, comparado con tu grupo, y qué lecciones repasar.</p>' : ''}
    </main>`;
}

/* ---------------------------------------------------------------- arranque */

pintar();
sincronizar(true);
latido();
