// La ruta AWS del lado del alumno: registro, índice con la ruta completa,
// lecciones, ejercicios, laboratorios guiados con contador de sandbox y el
// examen de práctica. Es el mismo motor del curso "Comprender la computación en
// la nube", con el laboratorio y el contador como piezas nuevas.
//
// La ruta tiene varias sesiones; el índice muestra una a la vez y el alumno
// cambia entre ellas desde arriba o desde "La ruta completa".
//
// El simulador AWS (evaluacion-aws, montado al lado en /m/evaluacion/) entra
// de dos formas: un laboratorio con `simulador` deja elegir dónde hacerlo
// (DataCamp o simulador), y una actividad 'simulador' es una práctica que se
// hace solo allá. En ambos casos la Ruta muestra el avance real que reporta
// el simulador para el mismo perfil.
//
// Todo cuelga del hash (#/s1-ruta, #/sesion/2, #/practica/2) y las llamadas al servidor
// son relativas (api/…): así la misma página sirve suelta en la raíz y montada
// en /m/aws-practitioner/ dentro de la plataforma.
//
// El avance vive en localStorage y se copia al servidor para que el docente lo
// vea en vivo. Si el servidor no contesta, el curso sigue funcionando y la
// copia se reintenta en el siguiente movimiento.

import { CURSO, RUTA, SANDBOX, SESIONES, sesionDe } from './contenido.js';
import {
  almacenDuradero,
  borrarEvidencia,
  claveEvidencia,
  documentoEvidencias,
  guardarEvidencia,
  leerEvidencia,
  nombreArchivo,
  prepararCaptura
} from './evidencias.js';

const PREFIJO = 'aws-practitioner:';
const LETRAS = ['A', 'B', 'C', 'D', 'E'];
const TIPOS = { leccion: 'Lección', opcion: 'Opción múltiple', clasificar: 'Clasificar', laboratorio: 'Laboratorio', simulador: 'Simulador AWS' };

// El simulador AWS es otro módulo de la plataforma (evaluacion-aws), montado al
// lado en /m/evaluacion/. Suelto (node server.js) no existe: se ocultan sus ligas.
const SIMULADOR = '../evaluacion/';
const EN_PLATAFORMA = location.pathname.includes('/m/');

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

// Todas las actividades de todas las sesiones, cada una con su capítulo y su sesión.
const ACTIVIDADES = SESIONES.flatMap((sesionCurso) =>
  sesionCurso.capitulos.flatMap((capitulo) =>
    capitulo.actividades.map((actividad) => ({ ...actividad, capitulo, sesion: sesionCurso }))
  )
);
const INDICE = new Map(ACTIVIDADES.map((a, i) => [a.id, i]));
const actividadesDe = (sesionCurso) => ACTIVIDADES.filter((a) => a.sesion === sesionCurso);
const xpTotalDe = (sesionCurso) => actividadesDe(sesionCurso).reduce((suma, a) => suma + a.xp, 0);

// La sesión que se ve en el índice: la última que eligió el alumno. Si es
// nuevo, la de hoy según el servidor (ver seguirHoy) y, mientras contesta o
// si el docente no ha dicho cuál, la más reciente de la ruta.
let sesionActual = sesionDe(leer('sesion', 0)) ?? sesionDe(leer('hoy-visto', 0)) ?? SESIONES.at(-1);

function elegirSesion(sesionCurso) {
  sesionActual = sesionCurso;
  guardar('sesion', sesionCurso.numero);
}

// La sesión que se da hoy: el docente la marca al empezar la clase o al abrir
// su examen. Cuando cambia, la Ruta abre una vez en ella (así el QR de la
// sesión 9 deja al grupo en la 9 aunque ya estén publicadas hasta la 13);
// después cada quien navega a donde quiera.
function seguirHoy(numero) {
  const hoy = sesionDe(numero);
  if (!hoy || leer('hoy-visto', 0) === hoy.numero) return;
  guardar('hoy-visto', hoy.numero);
  if (hoy === sesionActual) return;
  elegirSesion(hoy);
  if (ruta()[0] === '' && (perfil || PROYECTOR)) pintar();
}

let perfil = leer('perfil', null);
let avance = leer('avance', { completados: {} });
// Cuántos pasos lleva en cada laboratorio: el docente lo ve en vivo.
const pasosLab = () =>
  Object.fromEntries(
    ACTIVIDADES.filter((a) => a.tipo === 'laboratorio').map((a) => [a.id, leer(`lab-${a.id}`, { hechos: [] }).hechos.length])
  );

// Dónde hace cada laboratorio que ofrece el simulador: 'datacamp' o 'simulador'.
const lugaresLab = () =>
  Object.fromEntries(
    ACTIVIDADES.filter((a) => a.tipo === 'laboratorio' && a.simulador)
      .map((a) => [a.id, leer(`lab-${a.id}`, {}).donde])
      .filter(([, donde]) => donde)
  );

const hecha = (id) => avance.completados[id] !== undefined;
const xpGanada = () => Object.values(avance.completados).reduce((suma, xp) => suma + xp, 0);
const xpGanadaEn = (sesionCurso) => actividadesDe(sesionCurso).reduce((suma, a) => suma + (avance.completados[a.id] ?? 0), 0);

// El comprobante y las respuestas a medias de cada examen. Los de la sesión 1
// conservan su nombre de antes para no perder lo que ya estaba guardado.
const claveResultado = (n) => `resultado-${perfil.id}${n === 1 ? '' : `-s${n}`}`;
const claveRespuestas = (n) => `practica-${perfil.id}${n === 1 ? '' : `-s${n}`}`;

/* ------------------------------------------------------------ utilidades */

const escapar = (t) =>
  String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const icono = (id, clase = 'icono') => `<svg class="${clase}" aria-hidden="true"><use href="#${id}"></use></svg>`;
const numero = (n) => Number(n).toLocaleString('es-MX');
const nActividades = (n) => `${n} ${n === 1 ? 'actividad' : 'actividades'}`;
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

// Qué exámenes están abiertos, por sesión: { 1: false, 2: true }.
let practicas = {};
let esperaCopia = null;

function sincronizar(inmediato = false) {
  if (PROYECTOR || !perfil) return;
  clearTimeout(esperaCopia);
  esperaCopia = setTimeout(() => {
    api('api/progreso', { alumno: perfil, completados: avance.completados, pasos: pasosLab(), lugares: lugaresLab() })
      .then((d) => {
        cambiarEstadoPracticas(d.practicas);
        seguirHoy(d.hoy);
      })
      .catch(() => {}); // se reintenta con el siguiente movimiento o el latido
  }, inmediato ? 0 : 400);
}

async function latido() {
  try {
    const d = await api(`api/estado${perfil && !PROYECTOR ? `?a=${perfil.id}` : ''}`);
    cambiarEstadoPracticas(d.practicas);
    seguirHoy(d.hoy);
  } catch {
    /* sin servidor por ahora */
  }
}

function cambiarEstadoPracticas(nuevas) {
  if (!nuevas || typeof nuevas !== 'object') return;
  const antes = practicas[sesionActual.numero];
  practicas = nuevas;
  if (practicas[sesionActual.numero] === antes) return;
  const tarjeta = document.getElementById('tarjeta-practica');
  if (tarjeta) tarjeta.innerHTML = contenidoTarjetaPractica();
}

setInterval(latido, 15000);

// Con `subir`, una actividad ya hecha con XP parcial recibe la diferencia (lo
// que pasa cuando el alumno entrega en el simulador algo que había marcado
// como terminado sin entregar).
function completar(actividad, xp, { subir = false } = {}) {
  const antes = avance.completados[actividad.id];
  if (PROYECTOR || (antes !== undefined && !(subir && xp > antes))) return;
  avance.completados[actividad.id] = xp;
  guardar('avance', avance);
  sincronizar(true);
  aviso(`+${xp - (antes ?? 0)} XP`);
  const barraXp = document.querySelector('.barra__xp');
  if (barraXp) barraXp.textContent = `${numero(xpGanada())} XP`;
  const capitulo = actividad.capitulo;
  if (antes === undefined && capitulo.actividades.every((a) => hecha(a.id))) {
    setTimeout(() => aviso(`¡Capítulo ${capitulo.numero} completo!`, 'capitulo'), 1000);
  }
}

// Lo que sigue dentro de la misma sesión; al final, su examen de práctica.
function siguienteDe(actividad) {
  const siguiente = ACTIVIDADES[INDICE.get(actividad.id) + 1];
  return siguiente?.sesion === actividad.sesion ? siguiente.id : `practica/${actividad.sesion.numero}`;
}

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
  if (primera === 'registro') return vistaRegistro();
  if (primera === 'sesion') {
    const elegida = sesionDe(segunda);
    if (elegida) elegirSesion(elegida);
    return ir('');
  }
  if (primera === 'practica') {
    const elegida = sesionDe(segunda);
    if (segunda !== undefined && !elegida) return ir('');
    if (elegida) elegirSesion(elegida);
    return vistaPractica();
  }

  const i = INDICE.get(primera);
  if (i === undefined) return ir('');
  const actividad = ACTIVIDADES[i];
  if (actividad.sesion !== sesionActual) elegirSesion(actividad.sesion);
  if (actividad.tipo === 'leccion') return vistaLeccion(actividad, Number(segunda) || 1);
  if (actividad.tipo === 'laboratorio') return vistaLaboratorio(actividad, Number(segunda) || 0);
  if (actividad.tipo === 'simulador') return vistaSimulador(actividad);
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
  // Quien ya se registró en el simulador encuentra sus datos puestos.
  const base = perfil ?? perfilSimulador();
  app.innerHTML = `
    <main class="pagina pagina--angosta">
      <p class="etiqueta">Cómputo en la Nube · Curso</p>
      <h1 class="registro__titulo">${escapar(CURSO.titulo)}</h1>
      <p class="registro__intro">Antes de empezar, dinos quién eres para que tu docente vea tu avance. Toma 20 segundos.</p>
      <form class="hoja formulario" id="form-registro" novalidate>
        <label for="nombre">Nombre completo</label>
        <input id="nombre" name="nombre" autocomplete="name" maxlength="80" placeholder="Como aparece en la lista" value="${escapar(base?.nombre)}">
        <label for="matricula">Matrícula <span class="opcional">(opcional)</span></label>
        <input id="matricula" name="matricula" inputmode="numeric" autocomplete="off" maxlength="30" value="${escapar(base?.matricula)}">
        <label for="grupo">Grupo</label>
        <input id="grupo" name="grupo" autocomplete="off" maxlength="30" placeholder="Por ejemplo, SC03S" value="${escapar(base?.grupo)}">
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
    // Si en este navegador ya hay perfil del simulador (Evaluación) y es la
    // misma persona, se reusa su id: así las dos apps hablan del mismo alumno
    // y la Ruta ve su avance real en el simulador.
    const matricula = form.matricula.value.trim();
    const delSimulador = perfilSimulador();
    const idPrevio = perfil?.id ?? (mismaPersona(delSimulador, { nombre, matricula }) ? delSimulador.id : null);
    perfil = { id: idPrevio ?? nuevoId(), nombre, matricula, grupo };
    guardar('perfil', perfil);
    sincronizar(true);
    if (ruta()[0] === 'registro') ir('');
    else pintar();
  });
}

/* ---------------------------------------------------------------- índice */

function vistaCurso() {
  const S = sesionActual;
  const actividades = actividadesDe(S);
  const hechas = actividades.filter((a) => hecha(a.id)).length;
  const siguiente = actividades.find((a) => !hecha(a.id));
  const abierto = siguiente?.capitulo.numero ?? null;
  const pct = Math.round((hechas / actividades.length) * 100);
  const xpTotal = xpTotalDe(S);

  app.innerHTML = `
    ${avisoProyector()}
    <main class="pagina">
      <nav class="migas" aria-label="Ubicación">
        <a href="../../">← Cómputo en la Nube</a>
        ${perfil && !PROYECTOR ? `<span class="perfil">${escapar(nombreCorto(perfil.nombre))} · <b>${numero(xpGanada())} XP</b></span>` : ''}
      </nav>

      ${selectorSesiones()}

      <header class="portada">
        <p class="etiqueta">${escapar(CURSO.titulo)} · ${escapar(S.duracion)}</p>
        <h1>${escapar(S.subtitulo)}</h1>
        <p class="portada__resumen">${escapar(S.resumen)}</p>
        <ul class="portada__datos">
          <li>${icono('i-reloj')} ${escapar(S.duracion)}</li>
          <li>${icono('i-libro')} ${S.capitulos.length} capítulos</li>
          <li>${icono('i-check')} ${nActividades(actividades.length)}</li>
          <li>${icono('i-estrella')} ${numero(xpTotal)} XP</li>
        </ul>
        ${
          PROYECTOR
            ? ''
            : `<div class="portada__avance">
                <div class="progreso progreso--grande" role="progressbar" aria-label="Avance de la sesión ${S.numero}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
                <p>${hechas} de ${nActividades(actividades.length)} · ${numero(xpGanadaEn(S))} de ${numero(xpTotal)} XP</p>
              </div>`
        }
        <a class="boton boton--primario" href="#/${siguiente ? siguiente.id : `practica/${S.numero}`}">
          ${siguiente ? `${hechas ? 'Continuar' : 'Empezar'}: ${escapar(siguiente.titulo)}` : 'Ir al examen de práctica'} →
        </a>
      </header>

      ${PROYECTOR || S.minutosSandbox === 0 ? '' : contadorSandbox(false)}

      ${S.capitulos.map((c) => tarjetaCapitulo(c, siguiente, abierto)).join('')}

      <section class="practica-tarjeta" id="tarjeta-practica" aria-live="polite">${contenidoTarjetaPractica()}</section>

      ${rutaCompleta()}

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
      guardar(`plegado-${sesionActual.numero}-${numeroCap}`, lista.hidden, sesion);
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
  const plegado = leer(`plegado-${sesionActual.numero}-${capitulo.numero}`, abierto !== null && capitulo.numero !== abierto, sesion);

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
      <p class="capitulo__meta">≈ ${minutos} min · ${nActividades(actividades.length)} · ${numero(xp)} XP</p>
      <ol class="actividades" id="lista-${capitulo.numero}" ${plegado ? 'hidden' : ''}>
        ${actividades.map((a) => filaActividad(a, siguiente)).join('')}
      </ol>
      <button class="capitulo__detalles" type="button" data-plegar="${capitulo.numero}" aria-expanded="${!plegado}" aria-controls="lista-${capitulo.numero}">${plegado ? 'Mostrar detalles' : 'Ocultar detalles'} ${icono('i-flecha', 'icono capitulo__flecha')}</button>
    </section>`;
}

// Pestañas para cambiar de sesión, arriba del índice.
function selectorSesiones() {
  if (SESIONES.length < 2) return '';
  return `
    <nav class="sesiones" aria-label="Sesiones de la ruta">
      ${SESIONES.map((s) => {
        const actividades = actividadesDe(s);
        const pct = PROYECTOR ? 0 : Math.round((actividades.filter((a) => hecha(a.id)).length / actividades.length) * 100);
        return `<a class="sesiones__boton" href="#/sesion/${s.numero}" ${s === sesionActual ? 'aria-current="page"' : ''}>
          <span class="sesiones__numero">Sesión ${s.numero}</span>
          <span class="sesiones__titulo">${escapar(s.titulo)}</span>
          ${PROYECTOR ? '' : `<span class="sesiones__avance">${pct === 100 ? `${icono('i-check')} Completa` : `${pct}%`}</span>`}
        </a>`;
      }).join('')}
    </nav>`;
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
  const S = sesionActual;
  const resultado = perfil ? leer(claveResultado(S.numero), null) : null;
  const abierta = practicas[S.numero] === true;

  if (PROYECTOR) {
    return `
      <span class="practica-tarjeta__estado">${icono('i-candado')} Se contesta en el celular</span>
      <h2>${escapar(S.practica.titulo)}</h2>
      <p>Cada alumno lo contesta en su dispositivo. Aquí puedes proyectar las instrucciones.</p>
      <a class="boton" href="#/practica/${S.numero}">Ver las instrucciones</a>`;
  }

  if (resultado) {
    return `
      <span class="practica-tarjeta__estado practica-tarjeta__estado--abierta">${icono('i-check')} Entregada</span>
      <h2>${escapar(S.practica.titulo)}</h2>
      <p>${resultado.aciertos !== undefined ? `Obtuviste ${resultado.aciertos} de ${resultado.total} aciertos.` : 'Tu práctica quedó registrada.'} Folio ${escapar(resultado.folio)}.</p>
      <a class="boton" href="#/practica/${S.numero}">Ver mi comprobante</a>`;
  }

  if (abierta) {
    return `
      <span class="practica-tarjeta__estado practica-tarjeta__estado--abierta">${icono('i-check')} Abierta</span>
      <h2>${escapar(S.practica.titulo)}</h2>
      <p>${escapar(S.practica.resumen)}</p>
      <a class="boton boton--primario" href="#/practica/${S.numero}">Empezar →</a>`;
  }

  return `
    <span class="practica-tarjeta__estado">${icono('i-candado')} Todavía cerrada</span>
    <h2>${escapar(S.practica.titulo)}</h2>
    <p>Tu docente la abre al final de la clase. Esta tarjeta se actualiza sola: no tienes que recargar.</p>`;
}

/* -------------------------------------------------------------- lecciones */

function barraActividad(actividad) {
  return `
    ${avisoProyector()}
    <header class="barra">
      <a class="barra__volver" href="#/" aria-label="Volver al índice del curso">${icono('i-flecha', 'icono icono--atras')}<span>Curso</span></a>
      <div class="barra__centro">
        <span class="barra__capitulo">Sesión ${actividad.sesion.numero} · Capítulo ${actividad.capitulo.numero} · ${TIPOS[actividad.tipo]}</span>
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
    activarCodigo(app);
    activarCapturas(app);
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
          <button class="boton boton--sutil" type="button" id="btn-saltar">${libre ? 'Siguiente actividad →' : 'Saltar →'}</button>
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

  // Nadie se queda atorado: saltar cuenta el ejercicio como hecho, con el XP
  // mínimo, para que el avance siga y el alumno pueda volver después.
  document.getElementById('btn-saltar').addEventListener('click', () => {
    if (!estado.terminado && !libre) completar(actividad, minimo);
    ir(siguienteDe(actividad));
  });

  btnSolucion.addEventListener('click', () => {
    estado.fallos = Math.max(estado.fallos, 99); // ver la respuesta deja el mínimo de XP
    exito(control.solucion(), true);
  });

  function exito(texto, conSolucion = false) {
    estado.terminado = true;
    btnEnviar.disabled = true;
    btnSolucion.hidden = true;
    document.getElementById('btn-saltar').hidden = true;
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

/* ---------------------------------------------------- contador del sandbox */

// Una estimación local de lo que se gasta del sandbox. Arranca solo al llegar
// a un paso del laboratorio que lo necesita y se detiene al terminar; también
// se maneja a mano. DataCamp no deja ver desde fuera cuántos tokens quedan: la
// cifra real está en su panel del sandbox. Esto es para no llevarse sorpresas.

function semanaActual() {
  const hoy = new Date();
  const jueves = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
  jueves.setUTCDate(jueves.getUTCDate() + 3 - ((jueves.getUTCDay() + 6) % 7));
  const inicioAnio = new Date(Date.UTC(jueves.getUTCFullYear(), 0, 4));
  const semana = 1 + Math.round(((jueves - inicioAnio) / 86400000 - 3 + ((inicioAnio.getUTCDay() + 6) % 7)) / 7);
  return `${jueves.getUTCFullYear()}-S${String(semana).padStart(2, '0')}`;
}

function estadoSandbox() {
  const s = leer('sandbox', null);
  if (!s || s.semana !== semanaActual()) return { semana: semanaActual(), minutos: 0, inicio: null, sesion: 0 };
  return s;
}

const minutosSemana = (s = estadoSandbox()) => s.minutos + (s.inicio ? (Date.now() - s.inicio) / 60000 : 0);
const minutosSesion = (s = estadoSandbox()) => (s.inicio ? (Date.now() - s.inicio) / 60000 : s.sesion || 0);

function encenderSandbox() {
  const s = estadoSandbox();
  if (s.inicio || PROYECTOR) return;
  s.inicio = Date.now();
  guardar('sandbox', s);
  pintarContador();
}

function apagarSandbox() {
  const s = estadoSandbox();
  if (!s.inicio) return;
  s.sesion = (Date.now() - s.inicio) / 60000;
  s.minutos += s.sesion;
  s.inicio = null;
  guardar('sandbox', s);
  pintarContador();
}

const cronometro = (minutos) => {
  const segundos = Math.floor(minutos * 60);
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`;
};

function contadorSandbox(conBoton = true) {
  const s = estadoSandbox();
  const semana = minutosSemana(s);
  const sesion = minutosSesion(s);
  const pct = Math.min(100, (semana / SANDBOX.minutosSemana) * 100);
  const tokens = Math.round((semana * SANDBOX.tokensSemana) / SANDBOX.minutosSemana);
  const planeados = sesionActual.minutosSandbox ?? SANDBOX.minutosLaboratorio;
  const excedido = s.inicio && sesion > planeados;
  const textoSesion = s.inicio
    ? `esta sesión: ${cronometro(sesion)}`
    : sesion
      ? `última sesión: ${Math.round(sesion)} min`
      : 'sin usar esta semana';
  return `
    <section class="sandbox ${s.inicio ? 'sandbox--encendido' : ''}" id="sandbox" aria-label="Contador del sandbox">
      <div class="sandbox__estado">
        <span class="sandbox__luz" aria-hidden="true"></span>
        <strong>${s.inicio ? 'Sandbox encendido' : 'Sandbox apagado'}</strong>
        <span class="sandbox__sesion ${excedido ? 'sandbox__sesion--excedida' : ''}">${textoSesion}${excedido ? ` · ya pasaste los ${planeados} min planeados` : ''}</span>
      </div>
      <div class="sandbox__semana">
        <span>Esta semana: <b>${Math.round(semana)}</b> de ${SANDBOX.minutosSemana} min · ≈ ${numero(tokens)} de ${numero(SANDBOX.tokensSemana)} tokens</span>
        <div class="progreso ${pct > 85 ? 'progreso--alerta' : ''}"><span style="width:${pct}%"></span></div>
      </div>
      ${
        conBoton && !PROYECTOR
          ? `<button class="boton boton--chico ${s.inicio ? 'boton--peligro' : ''}" type="button" data-sandbox="${s.inicio ? 'apagar' : 'encender'}">${s.inicio ? 'Detener contador' : 'Iniciar contador'}</button>`
          : ''
      }
    </section>`;
}

function pintarContador() {
  const actual = document.getElementById('sandbox');
  if (!actual) return;
  const molde = document.createElement('div');
  molde.innerHTML = contadorSandbox(Boolean(actual.querySelector('[data-sandbox]')));
  actual.replaceWith(molde.firstElementChild);
}

document.addEventListener('click', (e) => {
  const boton = e.target.closest('[data-sandbox]');
  if (!boton) return;
  if (boton.dataset.sandbox === 'encender') encenderSandbox();
  else apagarSandbox();
});

setInterval(() => {
  if (estadoSandbox().inicio) pintarContador();
}, 1000);

/* -------------------------------------------------------------- la ruta */

function rutaCompleta() {
  return `
    <section class="ruta" aria-labelledby="titulo-ruta">
      <h2 class="ruta__titulo" id="titulo-ruta">La ruta completa hacia la certificación</h2>
      <p class="ruta__intro">${RUTA.length} sesiones que cubren los cuatro dominios del examen AWS Certified Cloud Practitioner: siete con su laboratorio (en el sandbox de DataCamp o en el simulador AWS), un simulacro completo del examen y cinco prácticas integradoras en el simulador.</p>
      <ol class="ruta__sesiones">
        ${RUTA.map(
          (r) => `
          <li class="sesion ${r.numero === sesionActual.numero ? 'sesion--actual' : ''} ${r.lista ? 'sesion--lista' : ''}">
            <span class="sesion__numero">${r.numero}</span>
            <div class="sesion__texto">
              <h3>${r.lista ? `<a href="#/sesion/${r.numero}">${escapar(r.titulo)}</a>` : escapar(r.titulo)}</h3>
              <p>${escapar(r.temas)}</p>
              <p class="sesion__meta">${r.dominios.map((d) => `<span class="chip">${escapar(d)}</span>`).join('')}${
                r.sandbox ? `<span class="sesion__sandbox">${icono('i-reloj')} ≈ ${r.sandbox} min de sandbox</span>` : ''
              }</p>
            </div>
            <span class="sesion__estado">${r.numero === sesionActual.numero ? 'Estás aquí' : r.lista ? 'Disponible' : 'Próximamente'}</span>
          </li>`
        ).join('')}
      </ol>
    </section>`;
}

/* ---------------------------------------------------------- copiar comandos */

// navigator.clipboard solo existe con HTTPS o en localhost; en el salón la
// plataforma corre por http://192.168…, así que hay un plan B.
function copiar(texto) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(texto).catch(() => copiarALaAntigua(texto));
  }
  return copiarALaAntigua(texto);
}

function copiarALaAntigua(texto) {
  const area = document.createElement('textarea');
  area.value = texto;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  document.execCommand('copy');
  area.remove();
  return Promise.resolve();
}

function activarCodigo(raiz) {
  raiz.querySelectorAll('pre.codigo').forEach((pre) => {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'codigo__copiar';
    boton.textContent = 'Copiar';
    boton.addEventListener('click', () =>
      copiar(pre.querySelector('code').textContent).then(() => {
        boton.textContent = '¡Copiado!';
        setTimeout(() => (boton.textContent = 'Copiar'), 1600);
      })
    );
    pre.append(boton);
  });
}

// Tocar una captura de la consola la abre en grande, con sus marcas y su pie.
// Se cierra con Esc, con la ×, o tocando fuera de la imagen.
function activarCapturas(raiz) {
  raiz.querySelectorAll('[data-ampliar]').forEach((marco) =>
    marco.addEventListener('click', () => {
      const visor = document.createElement('dialog');
      visor.className = 'visor';
      visor.setAttribute('aria-label', marco.querySelector('img').alt);
      visor.innerHTML = `
        <button class="visor__cerrar" type="button" aria-label="Cerrar">×</button>
        <div class="visor__lienzo">${marco.innerHTML}</div>`;
      visor.querySelector('img').loading = 'eager';
      const pie = marco.closest('figure').querySelector('figcaption');
      if (pie) visor.append(pie.cloneNode(true));
      // Las flechas no deben cambiar de paso detrás del visor.
      visor.addEventListener('keydown', (e) => e.stopPropagation());
      visor.addEventListener('click', (e) => {
        if (e.target === visor || e.target.closest('.visor__cerrar')) visor.close();
      });
      visor.addEventListener('close', () => {
        visor.remove();
        marco.focus();
      });
      document.body.append(visor);
      visor.showModal();
    })
  );
}

/* --------------------------------------------------------- simulador AWS */

// Quién es quién entre la Ruta y el simulador: la matrícula si las dos la
// tienen; si no, el nombre sin acentos ni mayúsculas.
const normal = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
const mismaPersona = (a, b) =>
  Boolean(a && b) && (a.matricula && b.matricula ? normal(a.matricula) === normal(b.matricula) : normal(a.nombre) === normal(b.nombre));

// El perfil que guardó el simulador (evaluacion-aws) en este navegador. En la
// plataforma las dos apps comparten origen, así que se puede leer.
function perfilSimulador() {
  try {
    const p = JSON.parse(local?.getItem('evaluacion-aws:perfil') ?? 'null');
    return p && typeof p.id === 'string' && /^[a-f0-9]{16,40}$/.test(p.id) ? p : null;
  } catch {
    return null;
  }
}

// Con qué id preguntarle al simulador. El simulador adopta el perfil de la
// Ruta solo si todavía no tiene uno: quien entró primero al simulador tiene
// otro id allá, y es ese el que guarda su avance.
function idEnSimulador() {
  const p = perfilSimulador();
  return p && mismaPersona(p, perfil) ? p.id : perfil.id;
}

// El avance real del alumno en el simulador. Si no contesta (suelto, sin
// conexión o con otra versión), la Ruta sigue igual: solo no muestra el avance.
async function estadoSimulador(lab) {
  if (!EN_PLATAFORMA || !perfil || PROYECTOR) return null;
  try {
    const d = await api(`${SIMULADOR}api/estado?a=${encodeURIComponent(idEnSimulador())}`);
    if (!Array.isArray(d.evaluaciones)) return null;
    return { evaluacion: d.evaluaciones.find((ev) => ev.id === lab || ev.lab === lab) ?? null };
  } catch {
    return null;
  }
}

const parteSimulador = (datos) => datos?.evaluacion?.partes?.practica ?? null;

/** Una línea con cómo va: { texto, tono: 'hecho' | 'curso' | 'espera' | 'nada' }. */
function avanceSimulador(datos) {
  const parte = parteSimulador(datos);
  if (!parte || parte.estado === 'preparacion') return { tono: 'espera', texto: 'Tu docente todavía lo está preparando en el simulador.' };
  if (parte.entrega) {
    const pct = Number(parte.entrega.porcentaje);
    return { tono: 'hecho', texto: `Ya lo entregaste${Number.isFinite(pct) ? ` con ${Math.round(pct)} de 100` : ''}. Folio ${parte.entrega.folio ?? '—'}.` };
  }
  if (parte.empezada) {
    const a = parte.avance;
    return {
      tono: 'curso',
      texto: a?.tareasTotal ? `En curso: llevas ${a.tareasLogradas} de ${a.tareasTotal} tareas.` : 'En curso: ya lo abriste en el simulador.'
    };
  }
  if (parte.estado === 'cerrada') return { tono: 'espera', texto: 'Cerrado por ahora: tu docente lo abre en clase.' };
  return { tono: 'nada', texto: 'Todavía no lo empiezas.' };
}

/**
 * La caja del simulador: qué se hace allá, el botón para abrirlo y el avance
 * real. `tareas` es HTML de la sesión (como las láminas).
 */
function cajaSimulador({ lab, minutos, nota, tareas, boton }) {
  return `
    <section class="simulador-caja" aria-labelledby="simulador-titulo">
      <p class="simulador-caja__etiqueta">${icono('t-simulador', 'icono')} Simulador AWS · se califica solo</p>
      <h2 class="simulador-caja__titulo" id="simulador-titulo">Lo haces en la consola simulada${minutos ? `, en unos ${minutos} minutos` : ''}</h2>
      ${nota ? `<p>${escapar(nota)}</p>` : ''}
      ${
        tareas?.length
          ? `<p><strong>Lo que te va a pedir:</strong></p><ul class="simulador-caja__tareas">${tareas.map((t) => `<li>${t}</li>`).join('')}</ul>`
          : '<p>Allá ves la lista de tareas con tus propios datos (tu sufijo, tus nombres) y el simulador revisa tu cuenta solo. No necesitas capturas ni el sandbox de DataCamp.</p>'
      }
      ${
        EN_PLATAFORMA
          ? `<p class="simulador-caja__avance" data-avance-simulador role="status" aria-live="polite">Buscando tu avance en el simulador…</p>
             <a class="boton boton--primario" href="${SIMULADOR}#/${encodeURIComponent(lab)}" target="_blank" rel="noopener">${boton} →</a>
             <p class="simulador-caja__nota">¿No terminas en clase? Allá pulsa <strong>«Descargar mi avance»</strong>: te llevas un archivo y la próxima vez lo cargas para seguir donde te quedaste, sin empezar de cero.</p>`
          : '<p class="sutil">El simulador se abre desde la plataforma de la materia (Simulador AWS). Aquí, con el curso suelto, no hay liga.</p>'
      }
    </section>`;
}

/**
 * Pregunta el avance real cada 15 s mientras la vista esté abierta: lo pinta
 * en la caja (si está a la vista) y se lo pasa a `alAvance`. Regresa
 * { parar, repintar }: `repintar` pone el último avance en una caja recién
 * pintada, sin esperar la siguiente vuelta.
 */
function vigilarSimulador(lab, alAvance) {
  if (!EN_PLATAFORMA || PROYECTOR) return { parar() {}, repintar() {} };
  let ultimo;
  let vigente = true;
  const repintar = () => {
    const caja = app.querySelector('[data-avance-simulador]');
    if (!caja || ultimo === undefined) return;
    const { texto, tono } = avanceSimulador(ultimo);
    caja.textContent = texto;
    caja.dataset.tono = tono;
  };
  const revisar = async () => {
    const datos = await estadoSimulador(lab);
    if (!vigente) return;
    ultimo = datos;
    repintar();
    alAvance?.(datos);
  };
  const espera = setInterval(revisar, 15000);
  const parar = () => {
    vigente = false;
    clearInterval(espera);
  };
  alSalir.push(parar);
  revisar();
  return { parar, repintar };
}

// El botón que cierra algo del simulador dice lo que va a pasar: en la
// plataforma, mientras no haya entrega, no promete el XP completo.
function textoTerminarSimulador(actividad, datos) {
  if (PROYECTOR || hecha(actividad.id)) return 'Siguiente actividad →';
  if (datos && !parteSimulador(datos)?.entrega) return 'Seguir sin entregarlo →';
  return `Ya lo terminé en el simulador · +${actividad.xp} XP`;
}

/**
 * «Ya lo terminé» de algo que se hace en el simulador. Con entrega (o sin
 * conexión con el simulador, para no trabar a nadie) da el XP completo; sin
 * entrega pregunta y da XP según las tareas logradas (mínimo 10 %), como el
 * laboratorio de DataCamp. Regresa false si el alumno se arrepiente.
 */
async function terminarEnElSimulador(actividad, lab) {
  if (PROYECTOR) return true;
  const datos = await estadoSimulador(lab);
  const parte = parteSimulador(datos);
  if (!datos || parte?.entrega) {
    completar(actividad, actividad.xp, { subir: true });
    return true;
  }
  if (hecha(actividad.id)) return true;
  const a = parte?.avance;
  const xp = Math.max(Math.round(actividad.xp * 0.1), a?.tareasTotal ? Math.round((actividad.xp * a.tareasLogradas) / a.tareasTotal) : 0);
  const seguir = confirm(
    `Todavía no lo entregas en el simulador, así que tu docente no tiene tu calificación. ¿Lo marcas como terminado con ${xp} de ${actividad.xp} XP? Si después lo entregas, vuelve aquí y la Ruta te da el resto.`
  );
  if (seguir) completar(actividad, xp);
  return seguir;
}

// Una práctica integradora (sesiones 9 a 13): el caso, la arquitectura y las
// tareas aquí; el trabajo, en el simulador. Al entregar allá, la actividad se
// completa sola con su XP; la calificación real la pone el simulador.
function vistaSimulador(actividad) {
  app.innerHTML = `
    ${barraActividad(actividad)}
    <main class="leccion laboratorio">
      <div class="lab-intro">
        <p><strong>Objetivo:</strong> ${escapar(actividad.objetivo)}</p>
        <p><strong>Necesitas:</strong></p>
        <ul>${actividad.necesitas.map((n) => `<li>${escapar(n)}</li>`).join('')}</ul>
      </div>
      <article class="lamina">
        <p class="lamina__contador">Práctica en el simulador AWS · ≈ ${actividad.minutos} min
          <span class="pildora-hecho" data-hecha ${hecha(actividad.id) && !PROYECTOR ? '' : 'hidden'}>Hecha</span>
        </p>
        <h1 class="lamina__titulo" id="titulo-lamina" tabindex="-1">${escapar(actividad.titulo)}</h1>
        <div class="lamina__cuerpo">
          <section class="simulador-caso" aria-label="El caso">${actividad.caso}</section>
          ${actividad.arquitectura ? `<section class="simulador-arquitectura" aria-label="La arquitectura">${actividad.arquitectura}</section>` : ''}
          <section aria-labelledby="titulo-tareas">
            <h2 class="simulador-subtitulo" id="titulo-tareas">Tus tareas en el simulador</h2>
            <ol class="simulador-tareas">${actividad.tareas.map((t) => `<li><span>${t}</span></li>`).join('')}</ol>
          </section>
          ${cajaSimulador({ lab: actividad.lab, boton: 'Abrir la práctica en el simulador' })}
        </div>
      </article>
    </main>
    <nav class="navegacion" aria-label="Práctica">
      <a class="boton" href="#/">← Curso</a>
      <button class="boton boton--primario" type="button" data-accion="terminar">${textoTerminarSimulador(actividad, EN_PLATAFORMA ? {} : null)}</button>
    </nav>`;

  activarLamina(app);
  activarCodigo(app);
  activarCapturas(app);
  const boton = app.querySelector('[data-accion="terminar"]');
  vigilarSimulador(actividad.lab, (datos) => {
    if (parteSimulador(datos)?.entrega) completar(actividad, actividad.xp, { subir: true });
    boton.textContent = textoTerminarSimulador(actividad, datos);
    app.querySelector('[data-hecha]')?.toggleAttribute('hidden', !hecha(actividad.id) || PROYECTOR);
  });
  boton.addEventListener('click', async () => {
    boton.disabled = true;
    const seguir = await terminarEnElSimulador(actividad, actividad.lab).finally(() => {
      boton.disabled = false;
    });
    if (seguir) ir(siguienteDe(actividad));
  });
}

/* ------------------------------------------------------------ laboratorios */

function vistaLaboratorio(actividad, numeroPaso) {
  const clave = `lab-${actividad.id}`;
  const guardado = leer(clave, { hechos: [] });
  const hechos = new Set(guardado.hechos ?? []);
  const total = actividad.pasos.length;
  // Si el laboratorio también está en el simulador, el alumno elige dónde lo
  // hace. En el simulador no corre el contador del sandbox ni se piden las
  // capturas de DataCamp: la guía queda solo de referencia.
  let donde = actividad.simulador && ['datacamp', 'simulador'].includes(guardado.donde) ? guardado.donde : null;
  const enSimulador = () => donde === 'simulador';
  const conEvidencia = actividad.pasos.map((paso, j) => ({ paso, j })).filter(({ paso }) => paso.evidencia);
  const pideEvidencias = () => !enSimulador() && conEvidencia.length > 0;
  // Sin paso en la dirección, abre el primero que falte. Si ya terminó y el
  // laboratorio pide evidencias, abre el último: ahí se descarga el PDF. En el
  // simulador abre el primero, que es donde está su caja.
  const primeroQueFalta = actividad.pasos.findIndex((_, j) => !hechos.has(j));
  let i = numeroPaso
    ? Math.min(Math.max(numeroPaso, 1), total) - 1
    : enSimulador()
      ? 0
      : primeroQueFalta < 0 && conEvidencia.length
        ? total - 1
        : Math.max(0, primeroQueFalta);

  const recordar = () => {
    guardar(clave, { hechos: [...hechos].sort((a, b) => a - b), ...(donde ? { donde } : {}) });
    sincronizar();
  };

  // En el simulador se vigila el avance real mientras la vista esté abierta:
  // pinta la caja del paso 1, ajusta el botón y, al entregar allá, completa
  // el laboratorio solo. Un solo vigilante por vista, aunque cambie de paso.
  let vigilante = null;
  let datosSimulador = EN_PLATAFORMA ? {} : null; // {} = todavía no contesta: se supone sin entrega
  const alAvanceSimulador = (datos) => {
    datosSimulador = datos;
    if (parteSimulador(datos)?.entrega && !PROYECTOR && (avance.completados[actividad.id] ?? -1) < actividad.xp) {
      actividad.pasos.forEach((_, j) => hechos.add(j));
      recordar();
      completar(actividad, actividad.xp, { subir: true });
    }
    const boton = app.querySelector('[data-accion="terminar-simulador"]');
    if (boton) boton.textContent = textoTerminarSimulador(actividad, datosSimulador);
  };
  const vigilarSiToca = () => {
    if (enSimulador() && actividad.simulador) {
      vigilante ??= vigilarSimulador(actividad.simulador.lab, alAvanceSimulador);
      vigilante.repintar();
    } else if (vigilante) {
      vigilante.parar();
      vigilante = null;
    }
  };

  // Quien todavía no elige pero ya empezó o entregó en el simulador (desde
  // otro navegador, por ejemplo) lo hace en el simulador: se elige solo.
  if (actividad.simulador && !donde && EN_PLATAFORMA && !PROYECTOR) {
    let vigente = true;
    alSalir.push(() => {
      vigente = false;
    });
    estadoSimulador(actividad.simulador.lab).then((datos) => {
      const parte = parteSimulador(datos);
      if (vigente && !donde && (parte?.empezada || parte?.entrega)) elegirLugar('simulador');
    });
  }

  // Las capturas de cada alumno van aparte: en el salón la computadora se comparte.
  const claveDe = (paso) => claveEvidencia(perfil?.id ?? 'proyector', actividad.id, paso.evidencia.id);
  // Las miniaturas son URLs de objeto: se sueltan al cambiar de paso o de vista.
  let miniaturas = [];
  const soltarMiniaturas = () => {
    miniaturas.forEach((url) => URL.revokeObjectURL(url));
    miniaturas = [];
  };
  const miniatura = (blob) => {
    const url = URL.createObjectURL(blob);
    miniaturas.push(url);
    return url;
  };
  alSalir.push(soltarMiniaturas);

  // Pegar con Ctrl + V en cualquier parte del paso: es lo que hace quien usa Win + Shift + S.
  const alPegar = (e) => {
    const paso = actividad.pasos[i];
    if (!paso.evidencia || enSimulador()) return;
    const archivo = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
    if (!archivo) return;
    e.preventDefault();
    recibirCaptura(paso, archivo);
  };
  document.addEventListener('paste', alPegar);
  alSalir.push(() => document.removeEventListener('paste', alPegar));

  function cajaEvidencia(paso) {
    return `
      <section class="evidencia" aria-labelledby="evidencia-titulo" data-evidencia>
        <p class="evidencia__etiqueta">Tu evidencia · para tu PDF de Blackboard</p>
        <h2 class="evidencia__titulo" id="evidencia-titulo">${escapar(paso.evidencia.titulo)}</h2>
        <p class="evidencia__pide"><strong>Debe verse:</strong> ${escapar(paso.evidencia.pide)}</p>
        <div class="evidencia__zona" data-zona><p class="evidencia__cargando">Buscando tu captura…</p></div>
        <input type="file" accept="image/*" hidden data-archivo>
        <p class="evidencia__estado" role="status" aria-live="polite" data-estado></p>
      </section>`;
  }

  async function pintarEvidencia(paso) {
    const caja = app.querySelector('[data-evidencia]');
    if (!caja) return;
    const zona = caja.querySelector('[data-zona]');
    const registro = await leerEvidencia(claveDe(paso)).catch(() => null);
    // Si mientras leía cambió de paso, esta caja ya no existe.
    if (!caja.isConnected) return;
    const duradero = await almacenDuradero();
    zona.classList.toggle('evidencia__zona--lista', Boolean(registro));
    zona.innerHTML = registro
      ? `
        <img class="evidencia__imagen" src="${miniatura(registro.blob)}" width="${registro.ancho}" height="${registro.alto}" alt="Tu captura para: ${escapar(paso.evidencia.titulo)}">
        <div class="evidencia__datos">
          <p><span class="pildora-hecho">Guardada</span> ${escapar(registro.nombre)} · ${escapar(fechaHora(registro.fecha))}</p>
          <div class="evidencia__acciones">
            <button class="boton boton--sutil boton--chico" type="button" data-elegir>Cambiarla</button>
            <button class="boton boton--peligro boton--chico" type="button" data-quitar>Quitarla</button>
          </div>
        </div>`
      : `
        <svg class="icono evidencia__icono" aria-hidden="true"><use href="#i-imagen"></use></svg>
        <p><strong>Pega tu captura con Ctrl + V</strong>, arrástrala aquí o</p>
        <button class="boton boton--chico" type="button" data-elegir>Elige una imagen</button>
        <p class="evidencia__nota">${
          duradero
            ? 'Se guarda solo en este navegador. Nadie la ve hasta que subas tu PDF.'
            : 'Este navegador no deja guardarla: no cierres la pestaña hasta descargar tu PDF.'
        }</p>`;
  }

  async function recibirCaptura(paso, archivo) {
    const estado = app.querySelector('[data-estado]');
    if (estado) estado.textContent = 'Guardando tu captura…';
    try {
      const registro = await prepararCaptura(archivo);
      await guardarEvidencia(claveDe(paso), registro);
      if (estado) estado.textContent = 'Listo: tu captura quedó guardada.';
      soltarMiniaturas();
      await pintarEvidencia(paso);
      pintarEntrega();
    } catch (error) {
      if (estado) estado.textContent = error.message || 'No se pudo guardar la captura. Inténtalo de nuevo.';
    }
  }

  function activarEvidencia(paso) {
    const caja = app.querySelector('[data-evidencia]');
    if (!caja) return;
    const entrada = caja.querySelector('[data-archivo]');
    caja.addEventListener('click', async (e) => {
      if (e.target.closest('[data-elegir]')) entrada.click();
      if (e.target.closest('[data-quitar]')) {
        await borrarEvidencia(claveDe(paso));
        soltarMiniaturas();
        caja.querySelector('[data-estado]').textContent = 'Quitaste la captura.';
        await pintarEvidencia(paso);
        caja.querySelector('[data-elegir]')?.focus();
      }
    });
    entrada.addEventListener('change', () => {
      if (entrada.files[0]) recibirCaptura(paso, entrada.files[0]);
      entrada.value = '';
    });
    const zona = caja.querySelector('[data-zona]');
    zona.addEventListener('dragover', (e) => {
      e.preventDefault();
      zona.classList.add('evidencia__zona--encima');
    });
    zona.addEventListener('dragleave', () => zona.classList.remove('evidencia__zona--encima'));
    zona.addEventListener('drop', (e) => {
      e.preventDefault();
      zona.classList.remove('evidencia__zona--encima');
      const archivo = [...(e.dataTransfer?.files ?? [])][0];
      if (archivo) recibirCaptura(paso, archivo);
    });
    pintarEvidencia(paso);
  }

  // En el último paso: las evidencias juntas y el botón del PDF.
  const cajaEntrega = () => `
    <section class="entrega-evidencias" aria-labelledby="entrega-titulo" data-entrega>
      <h2 class="entrega-evidencias__titulo" id="entrega-titulo">Tu PDF de evidencias</h2>
      <p>Descárgalo y súbelo a Blackboard. Se arma aquí, en tu navegador, con las capturas que pegaste.</p>
      <ol class="entrega-evidencias__lista" data-lista></ol>
      <button class="boton boton--primario" type="button" data-descargar disabled>Descargar mi PDF de evidencias</button>
      <p class="evidencia__estado" role="status" aria-live="polite" data-estado-entrega></p>
    </section>`;

  async function pintarEntrega() {
    const caja = app.querySelector('[data-entrega]');
    if (!caja) return;
    const registros = await Promise.all(conEvidencia.map(({ paso }) => leerEvidencia(claveDe(paso)).catch(() => null)));
    if (!caja.isConnected) return;
    caja.querySelector('[data-lista]').innerHTML = conEvidencia
      .map(({ paso, j }, k) => {
        const registro = registros[k];
        return `<li class="${registro ? 'lista' : 'falta'}">
          ${registro ? `<img src="${miniatura(registro.blob)}" alt="" width="${registro.ancho}" height="${registro.alto}">` : '<span class="entrega-evidencias__vacio" aria-hidden="true">?</span>'}
          <span><strong>${escapar(paso.evidencia.titulo)}</strong><br>${
            registro ? 'Lista' : `Falta · <a href="#/${actividad.id}/${j + 1}">vuelve al paso ${j + 1}</a>`
          }</span>
        </li>`;
      })
      .join('');
    const faltan = registros.filter((r) => !r).length;
    const boton = caja.querySelector('[data-descargar]');
    boton.disabled = faltan > 0 || !perfil;
    caja.querySelector('[data-estado-entrega]').textContent = !perfil
      ? 'En el proyector no se arma el PDF: cada alumno lo descarga en su computadora.'
      : faltan
        ? `Te ${faltan === 1 ? 'falta 1 captura' : `faltan ${faltan} capturas`} para poder descargarlo.`
        : '';
  }

  async function descargarPdf(boton) {
    const estado = app.querySelector('[data-estado-entrega]');
    boton.disabled = true;
    estado.textContent = 'Armando tu PDF…';
    try {
      const evidencias = [];
      for (const { paso, j } of conEvidencia) {
        const registro = await leerEvidencia(claveDe(paso));
        if (!registro) throw new Error(`Falta la captura del paso ${j + 1}.`);
        evidencias.push({
          paso: j + 1,
          tituloPaso: paso.titulo,
          titulo: paso.evidencia.titulo,
          pide: paso.evidencia.pide,
          captura: { ...registro, bytes: new Uint8Array(await registro.blob.arrayBuffer()) }
        });
      }
      const bytes = documentoEvidencias({
        curso: CURSO.titulo,
        sesion: actividad.sesion.subtitulo,
        laboratorio: actividad.titulo,
        alumno: perfil,
        evidencias,
        fecha: new Date().toISOString()
      });
      const enlace = document.createElement('a');
      enlace.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      enlace.download = nombreArchivo(perfil, actividad.id);
      document.body.append(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(enlace.href), 30000);
      estado.textContent = `Listo: se descargó ${enlace.download}. Súbelo a Blackboard.`;
    } catch (error) {
      estado.textContent = error.message || 'No se pudo armar el PDF. Inténtalo de nuevo.';
    } finally {
      boton.disabled = false;
    }
  }

  // «¿Dónde harás este laboratorio?»: solo en el paso 1 de los que ofrecen el simulador.
  function eleccion() {
    if (!actividad.simulador) return '';
    const s = actividad.simulador;
    const boton = (valor, texto, detalle) =>
      `<button type="button" class="eleccion__boton" data-donde="${valor}" aria-pressed="${donde === valor}">
        <strong>${texto}</strong><span>${detalle}</span>
      </button>`;
    return `
      <section class="eleccion" aria-labelledby="eleccion-titulo">
        <h2 class="eleccion__titulo" id="eleccion-titulo">¿Dónde harás este laboratorio?</h2>
        <div class="eleccion__botones">
          ${boton('datacamp', 'DataCamp', 'El sandbox de AWS, con esta guía paso a paso y tus capturas para Blackboard.')}
          ${boton('simulador', 'Simulador', `La consola simulada: aquí sí se puede crear todo y se califica sola${s.minutos ? ` (≈ ${s.minutos} min)` : ''}.`)}
        </div>
        <p class="eleccion__nota">${donde ? 'Puedes cambiar de opinión cuando quieras.' : 'Elige una para empezar. Puedes cambiar después.'}</p>
      </section>
      ${enSimulador() ? cajaSimulador({ lab: s.lab, minutos: s.minutos, nota: s.nota, tareas: s.tareas, boton: 'Abrir el simulador' }) : ''}`;
  }

  function mostrar(enfocar = false) {
    const paso = actividad.pasos[i];
    const ultimo = i === total - 1;
    if (paso.sandbox && !enSimulador()) encenderSandbox();
    soltarMiniaturas();

    app.innerHTML = `
      ${barraActividad(actividad)}
      <main class="leccion laboratorio">
        ${enSimulador() ? '' : contadorSandbox()}
        <div class="leccion__puntos leccion__puntos--pasos" aria-hidden="true">${actividad.pasos
          .map((_, j) => `<span class="${j === i ? 'actual' : hechos.has(j) ? 'visto' : ''}"></span>`)
          .join('')}</div>
        ${
          i === 0
            ? `<div class="lab-intro">
                <p><strong>Objetivo:</strong> ${escapar(enSimulador() ? actividad.simulador.objetivo : actividad.objetivo)}</p>
                ${
                  // Lo que se necesita es para DataCamp (sesión, sandbox, capturas): en el simulador no aplica.
                  enSimulador()
                    ? ''
                    : `<p><strong>Necesitas:</strong></p>
                       <ul>${actividad.necesitas.map((n) => `<li>${escapar(n)}</li>`).join('')}</ul>`
                }
              </div>
              ${eleccion()}`
            : ''
        }
        <article class="lamina">
          <p class="lamina__contador">Paso ${i + 1} de ${total}
            ${
              enSimulador()
                ? '<span class="pildora-sandbox pildora-sandbox--apagado">Guía de DataCamp · solo de referencia</span>'
                : `<span class="pildora-sandbox ${paso.sandbox ? '' : 'pildora-sandbox--apagado'}">${paso.sandbox ? 'Con el sandbox encendido' : 'Con el sandbox apagado'}</span>`
            }
            ${hechos.has(i) ? '<span class="pildora-hecho">Hecho</span>' : ''}
          </p>
          <h1 class="lamina__titulo" id="titulo-lamina" tabindex="-1">${paso.titulo}</h1>
          <div class="lamina__cuerpo">
            ${paso.html}
            <div class="deberias-ver"><span class="deberias-ver__etiqueta">Deberías ver</span><p>${paso.ver}</p></div>
            ${paso.evidencia && !enSimulador() ? cajaEvidencia(paso) : ''}
            ${
              paso.problemas
                ? `<details class="problemas"><summary>¿Algo salió mal?</summary><dl>${paso.problemas
                    .map(([sintoma, solucion]) => `<div><dt>${sintoma}</dt><dd>${solucion}</dd></div>`)
                    .join('')}</dl></details>`
                : ''
            }
            ${ultimo && pideEvidencias() ? cajaEntrega() : ''}
            ${
              enSimulador() && !ultimo
                ? `<button class="boton boton--sutil boton--chico lab-referencia" type="button">${i === 0 ? 'Ver la guía de DataCamp como referencia' : 'Siguiente paso de la guía'} →</button>`
                : ''
            }
          </div>
        </article>
      </main>
      <nav class="navegacion" aria-label="Pasos del laboratorio">
        <button class="boton" type="button" data-accion="anterior" ${i === 0 ? 'disabled' : ''}>← Anterior</button>
        ${
          enSimulador()
            ? `<button class="boton boton--primario" type="button" data-accion="terminar-simulador">${textoTerminarSimulador(actividad, datosSimulador)}</button>`
            : `<button class="boton boton--primario" type="button" data-accion="${ultimo ? 'terminar' : 'hecho'}">${
                ultimo
                  ? hecha(actividad.id) || PROYECTOR
                    ? 'Terminar laboratorio'
                    : `Terminar laboratorio · +${actividad.xp} XP`
                  : 'Ya lo hice →'
              }</button>`
        }
      </nav>`;

    history.replaceState(null, '', `#/${actividad.id}/${i + 1}`);
    activarLamina(app);
    activarCodigo(app);
    activarCapturas(app);
    if (paso.evidencia && !enSimulador()) activarEvidencia(paso);
    if (ultimo && pideEvidencias()) {
      app.querySelector('[data-descargar]').addEventListener('click', (e) => descargarPdf(e.currentTarget));
      pintarEntrega();
    }
    vigilarSiToca();
    app.querySelector('.eleccion')?.addEventListener('click', (e) => {
      const boton = e.target.closest('[data-donde]');
      if (boton && boton.dataset.donde !== donde) elegirLugar(boton.dataset.donde);
    });
    app.querySelector('.lab-referencia')?.addEventListener('click', () => irAlPaso(i + 1));
    app.querySelector('.navegacion').addEventListener('click', (e) => {
      const accion = e.target.closest('[data-accion]')?.dataset.accion;
      if (accion === 'anterior') irAlPaso(i - 1);
      if (accion === 'hecho') marcar();
      if (accion === 'terminar') terminar();
      if (accion === 'terminar-simulador') terminarEnSimulador(e.target.closest('[data-accion]'));
    });
    if (enfocar) document.getElementById('titulo-lamina').focus({ preventScroll: true });
  }

  function irAlPaso(j) {
    if (j < 0 || j >= total) return;
    i = j;
    window.scrollTo(0, 0);
    mostrar(true);
  }

  // Elegir dónde se hace cuenta como avance: el docente lo ve en el panel.
  // Al pasarse al simulador se detiene el contador si estaba corriendo.
  function elegirLugar(lugar) {
    donde = lugar;
    if (!PROYECTOR) {
      if (enSimulador()) apagarSandbox();
      recordar();
      sincronizar(true);
    }
    mostrar();
  }

  // En el simulador los pasos de la guía no se marcan: «Ya lo terminé» completa
  // el laboratorio con XP según su avance real allá (todo, si ya lo entregó).
  // La calificación de verdad la pone el simulador.
  async function terminarEnSimulador(boton) {
    boton.disabled = true;
    const seguir = await terminarEnElSimulador(actividad, actividad.simulador.lab).finally(() => {
      if (boton.isConnected) boton.disabled = false;
    });
    if (!seguir) return;
    actividad.pasos.forEach((_, j) => hechos.add(j));
    recordar();
    ir(siguienteDe(actividad));
  }

  // Nunca se bloquea el avance. Si falta la captura solo se avisa: al cerrar
  // el sandbox se borra todo y ya no habría de dónde sacarla.
  async function marcar() {
    const paso = actividad.pasos[i];
    if (paso.evidencia && !PROYECTOR && !(await leerEvidencia(claveDe(paso)).catch(() => null))) {
      aviso('Avanzaste sin tu captura: la puedes pegar después en este paso');
    }
    hechos.add(i);
    recordar();
    irAlPaso(i + 1);
  }

  // Terminar marca el laboratorio completo aunque falten pasos. El XP sí
  // refleja cuántos pasos marcó el alumno (con un mínimo del 10 %).
  function terminar() {
    hechos.add(i);
    const marcados = hechos.size;
    actividad.pasos.forEach((_, j) => hechos.add(j));
    recordar();
    apagarSandbox();
    const xp = Math.max(Math.round(actividad.xp * 0.1), Math.round((actividad.xp * marcados) / total));
    completar(actividad, xp);
    ir(siguienteDe(actividad));
  }

  alTeclado = (e) => {
    // Espacio o Enter sobre un botón ya lo activan; no avanzamos dos veces.
    if ((e.key === ' ' || e.key === 'Enter') && e.target.closest('button, a, summary')) return;
    if (['ArrowRight', 'PageDown'].includes(e.key)) {
      e.preventDefault();
      const falta = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
      if (falta > 40) window.scrollBy({ top: window.innerHeight * 0.7, behavior: 'smooth' });
      else irAlPaso(i + 1);
    } else if (['ArrowLeft', 'PageUp'].includes(e.key)) {
      e.preventDefault();
      irAlPaso(i - 1);
    }
  };

  mostrar();
}

/* ---------------------------------------------------------------- práctica */

function barraPractica(detalle = '') {
  return `
    ${avisoProyector()}
    <header class="barra">
      <a class="barra__volver" href="#/" aria-label="Volver al índice del curso">${icono('i-flecha', 'icono icono--atras')}<span>Curso</span></a>
      <div class="barra__centro">
        <span class="barra__capitulo">Sesión ${sesionActual.numero} · Práctica final</span>
        <span class="barra__titulo">${escapar(sesionActual.practica.titulo)}</span>
      </div>
      <span class="barra__xp" id="barra-detalle">${detalle}</span>
    </header>`;
}

async function vistaPractica() {
  const n = sesionActual.numero;
  app.innerHTML = `${barraPractica()}<main class="pagina pagina--angosta"><p class="cargando">Cargando la práctica…</p></main>`;

  if (PROYECTOR) return practicaProyector();

  let datos;
  try {
    datos = await api('api/practica', { alumno: perfil, sesion: n });
  } catch (e) {
    const guardado = leer(claveResultado(n), null);
    if (guardado) return practicaResultado(guardado);
    return practicaError(e.message);
  }
  // El alumno ya se fue a otra parte (u otra sesión) mientras cargaba.
  if (ruta()[0] !== 'practica' || sesionActual.numero !== n) return;

  if (datos.estado === 'entregada') {
    guardar(claveResultado(n), datos.resultado);
    return practicaResultado(datos.resultado);
  }
  // El servidor manda: si el docente permitió un reintento, se olvida el comprobante viejo.
  guardar(claveResultado(n), null);
  cambiarEstadoPracticas({ ...practicas, [n]: datos.estado === 'abierta' });
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
        <a class="boton" href="#/">Volver a la sesión</a>
      </div>
    </main>`;
  const espera = setInterval(async () => {
    try {
      const d = await api(`api/estado?a=${perfil.id}&s=${sesionActual.numero}`);
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
    caso = (await api(`api/caso?s=${sesionActual.numero}`)).caso;
  } catch {
    caso = '<p>No pude cargar las instrucciones.</p>';
  }
  app.innerHTML = `
    ${barraPractica('Proyector')}
    <main class="pagina pagina--angosta practica">
      <p class="etiqueta">Práctica final</p>
      <h1>${escapar(sesionActual.practica.titulo)}</h1>
      <div class="hoja caso">${caso}</div>
      <p class="sutil">Las preguntas se contestan en el celular de cada alumno.</p>
    </main>`;
}

function practicaAbiertaVista(datos) {
  const { preguntas, caso, minutos, escala } = datos;
  const n = sesionActual.numero;
  const clave = claveRespuestas(n);
  const estado = leer(clave, { respuestas: {}, actual: 0, fase: 'inicio' });
  // Si cambió el banco de preguntas, se descartan respuestas que ya no existen
  // (o que cambiaron de una sola respuesta a respuesta múltiple, o al revés).
  const porId = new Map(preguntas.map((p) => [p.id, p]));
  for (const [id, valor] of Object.entries(estado.respuestas)) {
    const p = porId.get(id);
    if (!p || Array.isArray(valor) !== Boolean(p.elige)) delete estado.respuestas[id];
  }
  estado.actual = Math.min(estado.actual, preguntas.length - 1);

  const ordenes = Object.fromEntries(
    preguntas.map((p) => [p.id, p.fijo ? p.opciones.map((_, i) => i) : barajar(p.opciones.length, `${perfil.id}:${p.id}`)])
  );
  // Las de respuesta múltiple («Elige DOS») cuentan como contestadas solo con
  // todas sus opciones marcadas: con una de dos, el examen real la da por mala.
  const marcadas = (p) => (Array.isArray(estado.respuestas[p.id]) ? estado.respuestas[p.id] : []);
  const contestada = (p) => (p.elige ? marcadas(p).length === p.elige : Number.isInteger(estado.respuestas[p.id]));
  const contestadas = () => preguntas.filter(contestada).length;
  const recordar = () => guardar(clave, estado);

  // El reloj (solo si el banco trae MINUTOS): cuenta desde que el servidor
  // abrió el examen para este alumno. Avisa a los 10 minutos y al llegar a 0,
  // pero nunca corta: el alumno entrega cuando termina.
  const inicioReloj = Date.parse(datos.inicio) || (estado.inicio ??= Date.now());
  const quedan = () => minutos * 60000 - (Date.now() - inicioReloj);
  estado.avisos ??= {};
  function textoReloj() {
    const ms = quedan();
    if (ms <= 0) return { texto: 'Se acabó el tiempo: revisa y entrega', tono: 'fin' };
    const min = Math.floor(ms / 60000);
    const seg = Math.floor((ms % 60000) / 1000);
    return { texto: `Quedan ${min}:${String(seg).padStart(2, '0')}`, tono: ms <= 10 * 60000 ? 'poco' : '' };
  }
  const reloj = () => {
    if (!minutos) return '';
    const { texto, tono } = textoReloj();
    return `<p class="reloj-practica ${tono ? `reloj-practica--${tono}` : ''}" id="reloj-practica" role="timer">${icono('i-reloj')} <span>${texto}</span></p>`;
  };
  if (minutos) {
    const tic = setInterval(() => {
      const el = document.getElementById('reloj-practica');
      const { texto, tono } = textoReloj();
      if (el) {
        el.querySelector('span').textContent = texto;
        el.className = `reloj-practica ${tono ? `reloj-practica--${tono}` : ''}`;
      }
      const ms = quedan();
      if (ms <= 10 * 60000 && ms > 0 && !estado.avisos.diez) {
        estado.avisos.diez = true;
        recordar();
        aviso('Quedan 10 minutos', 'reloj');
      }
      if (ms <= 0 && !estado.avisos.cero) {
        estado.avisos.cero = true;
        recordar();
        aviso('Se acabó el tiempo. Revisa y entrega', 'reloj');
      }
    }, 1000);
    alSalir.push(() => clearInterval(tic));
  }

  function mostrar() {
    recordar();
    window.scrollTo(0, 0);
    if (estado.fase === 'inicio') return inicio();
    if (estado.fase === 'revision') return revision();
    return pregunta();
  }

  const multiples = preguntas.filter((p) => p.elige).length;
  const textoFaltan = (faltan) => (faltan ? `Faltan ${faltan}` : 'Ya contestaste todas');

  function inicio() {
    alTeclado = null;
    app.innerHTML = `
      ${barraPractica()}
      <main class="pagina pagina--angosta practica">
        <p class="etiqueta">Práctica final</p>
        <h1>${escapar(sesionActual.practica.titulo)}</h1>
        <div class="hoja caso">${caso}</div>
        <ul class="reglas">
          <li><strong>${preguntas.length} preguntas</strong> de opción múltiple sobre ${escapar(sesionActual.practica.sobre ?? `la sesión ${n}`)}, en unos ${minutos ?? 20} minutos.</li>
          ${
            multiples
              ? `<li><strong>${multiples === 1 ? 'Una pregunta es' : `${multiples} preguntas son`} de respuesta múltiple</strong>, como en el examen real: dicen cuántas elegir («Elige DOS») y solo cuentan si marcas todas las correctas.</li>`
              : ''
          }
          ${minutos ? `<li>Arriba verás un <strong>reloj de ${minutos} minutos</strong>. Te avisa cuando queden 10, pero no te corta: entregas cuando termines.</li>` : ''}
          ${
            escala
              ? `<li>Al entregar verás un <strong>puntaje estimado de ${escala.maximo}</strong>. El examen real se aprueba con ${escala.aprueba}.</li>`
              : ''
          }
          <li>Las instrucciones siempre están a un toque de distancia, arriba de cada pregunta.</li>
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
        const clases = ['marca', contestada(p) && 'marca--contestada', estado.fase === 'pregunta' && i === estado.actual && 'marca--actual']
          .filter(Boolean)
          .join(' ');
        return `<button type="button" class="${clases}" data-ir="${i}" aria-label="Pregunta ${i + 1}${contestada(p) ? ', contestada' : ', sin contestar'}"></button>`;
      })
      .join('')}</div>`;
  }

  function pregunta() {
    const p = preguntas[estado.actual];
    const faltan = preguntas.length - contestadas();
    const orden = ordenes[p.id];
    const ultima = estado.actual === preguntas.length - 1;

    const elegida = (original) => (p.elige ? marcadas(p).includes(original) : estado.respuestas[p.id] === original);
    // Con respuesta múltiple a medias (una de dos) no se avanza: así nadie la
    // deja incompleta sin darse cuenta. Sin ninguna marcada sí, como las demás.
    const aMedias = () => p.elige && marcadas(p).length > 0 && marcadas(p).length < p.elige;
    const textoElige = () =>
      `Elige ${p.elige}. ${marcadas(p).length === p.elige ? `Ya marcaste ${p.elige}: para cambiar una, primero quítala.` : `Llevas ${marcadas(p).length}.`}`;

    app.innerHTML = `
      ${barraPractica(`${contestadas()}/${preguntas.length}`)}
      <main class="pagina pagina--angosta practica">
        <details class="caso-plegable"><summary>${escapar(sesionActual.practica.plegable)}</summary><div class="caso">${caso}</div></details>
        ${reloj()}
        ${regla()}
        <p class="practica__conteo"><span>Pregunta ${estado.actual + 1} de ${preguntas.length}</span><span id="faltan">${textoFaltan(faltan)}</span></p>
        <div class="hoja">
          <p class="pregunta__tema">${escapar(p.tema)}${p.elige ? ' · respuesta múltiple' : ''}</p>
          <h1 class="pregunta__texto" tabindex="-1" id="texto-pregunta">${escapar(p.texto)}</h1>
          ${p.elige ? `<p class="pregunta__elige" id="elige" aria-live="polite">${textoElige()}</p>` : ''}
          <div class="opciones ${p.elige ? 'opciones--multiples' : ''}" ${p.elige ? 'role="group" aria-describedby="elige"' : ''}>
            ${orden
              .map(
                (original, posicion) => `
              <button type="button" class="opcion" data-opcion="${original}" aria-pressed="${elegida(original)}">
                <span class="opcion__letra">${LETRAS[posicion]}</span><span class="opcion__texto">${escapar(p.opciones[original])}</span>
              </button>`
              )
              .join('')}
          </div>
        </div>
        <nav class="navegacion navegacion--practica" aria-label="Preguntas">
          <button class="boton" type="button" data-accion="anterior" ${estado.actual === 0 ? 'disabled' : ''}>← Anterior</button>
          <button class="boton boton--primario" type="button" data-accion="siguiente" ${aMedias() ? 'disabled' : ''}>${ultima ? 'Revisar y entregar' : 'Siguiente →'}</button>
        </nav>
      </main>`;

    // Respuesta múltiple: cada toque marca o quita una opción, hasta `elige`.
    // No avanza sola: el alumno decide cuándo pasar.
    function alternar(boton) {
      const original = Number(boton.dataset.opcion);
      const actuales = marcadas(p);
      if (actuales.includes(original)) estado.respuestas[p.id] = actuales.filter((i) => i !== original);
      else if (actuales.length < p.elige) estado.respuestas[p.id] = [...actuales, original].sort((a, b) => a - b);
      else {
        aviso(`Ya marcaste ${p.elige}: quita una para cambiarla`, 'reloj');
        return;
      }
      if (!estado.respuestas[p.id].length) delete estado.respuestas[p.id];
      recordar();
      boton.setAttribute('aria-pressed', String(marcadas(p).includes(original)));
      document.getElementById('elige').textContent = textoElige();
      app.querySelector('[data-accion="siguiente"]').disabled = aMedias();
      document.getElementById('barra-detalle').textContent = `${contestadas()}/${preguntas.length}`;
      document.getElementById('faltan').textContent = textoFaltan(preguntas.length - contestadas());
      app.querySelector(`[data-ir="${estado.actual}"]`)?.classList.toggle('marca--contestada', contestada(p));
    }

    app.querySelector('.opciones').addEventListener('click', (e) => {
      const boton = e.target.closest('[data-opcion]');
      if (!boton) return;
      if (p.elige) return alternar(boton);
      estado.respuestas[p.id] = Number(boton.dataset.opcion);
      recordar();
      app.querySelectorAll('[data-opcion]').forEach((b) => b.setAttribute('aria-pressed', String(b === boton)));
      // Avanza solo, como el examen diagnóstico, sin brincarse la última.
      if (!ultima) {
        setTimeout(() => {
          if (ruta()[0] !== 'practica' || sesionActual.numero !== n || preguntas[estado.actual] !== p) return;
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
        if (aMedias()) return;
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
        ${reloj()}
        ${regla()}
        <ol class="revision">
          ${preguntas
            .map((p, i) => {
              const lista = contestada(p);
              // La letra que vio el alumno (las opciones van barajadas); en las múltiples, todas las que marcó.
              const letras = p.elige
                ? marcadas(p).map((o) => LETRAS[ordenes[p.id].indexOf(o)]).sort().join(', ')
                : LETRAS[ordenes[p.id].indexOf(estado.respuestas[p.id])];
              const estadoTexto = lista ? letras : p.elige && marcadas(p).length ? `${marcadas(p).length} de ${p.elige}` : 'Falta';
              return `<li><button type="button" data-ir="${i}">
                <span class="revision__num">${i + 1}</span>
                <span class="revision__texto">${escapar(p.texto)}</span>
                <span class="revision__estado ${lista ? '' : 'revision__estado--falta'}">${estadoTexto}</span>
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
      const pendiente = preguntas.findIndex((p) => !contestada(p));
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
      const datosEntrega = await api('api/practica/entregar', { alumno: perfil, sesion: n, respuestas: estado.respuestas });
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
    guardar(claveResultado(n), resultado);
    practicaResultado(resultado);
  }

  mostrar();
}

function practicaResultado(r) {
  alTeclado = null;
  const n = r.sesion ?? sesionActual.numero;
  const conCalificacion = r.aciertos !== undefined;
  // Con escala (el simulacro CLF-C02), «débil» es lo que no llega al 70 % del examen real.
  const corte = r.escala ? Math.round((r.escala.aprueba / r.escala.maximo) * 100) : 60;
  const barra = (nombre, aciertos, total) => {
    const pct = total ? Math.round((aciertos / total) * 100) : 0;
    return `<div class="barra-tema ${pct < corte ? 'barra-tema--debil' : ''}">
        <span class="barra-tema__nombre">${escapar(nombre)}</span><span class="barra-tema__valor">${aciertos}/${total}</span>
        <div class="progreso"><span style="width:${pct}%"></span></div>
      </div>`;
  };
  const temas = (r.porTema ?? []).map((t) => barra(t.tema, t.aciertos, t.total)).join('');
  const sesiones = (r.porSesion ?? []).map((s) => barra(s.titulo, s.aciertos, s.total)).join('');
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
            ${
              r.escala
                ? `<div class="hoja escala ${r.escala.aprobado ? 'escala--aprueba' : 'escala--no'}">
                    <p class="escala__cifra">${r.escala.puntaje}<span> de ${r.escala.maximo} · puntaje estimado</span></p>
                    <p><strong>${r.escala.aprobado ? 'Con este puntaje aprobarías el examen real.' : `Todavía no aprobarías: el examen real pide ${r.escala.aprueba}.`}</strong></p>
                    <p class="sutil">Es una estimación: AWS no publica cómo convierte los aciertos en puntaje. Aquí ${corte}&nbsp;% de aciertos equivale a ${r.escala.aprueba}.</p>
                  </div>`
                : ''
            }
            <h2>Cómo te fue por tema</h2>
            ${temas}
            ${sesiones ? `<h2>Por sesión de la Ruta</h2><p class="sutil">Si una sesión salió baja, vuelve a abrir sus lecciones: siguen en el curso.</p>${sesiones}` : ''}`
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
        ${conCalificacion ? `<a class="boton boton--primario" href="api/practica/reporte.pdf?a=${perfil.id}&s=${n}" download>${icono('i-libro')} Descargar mi reporte en PDF</a>` : ''}
        <a class="boton" href="#/">Volver a la sesión</a>
      </div>
      ${
        conCalificacion
          ? `<p class="sutil">El reporte trae tu dominio por tema${sesiones ? ', por sesión de la Ruta' : ''} y por concepto, comparado con tu grupo, y qué lecciones repasar.</p>`
          : ''
      }
    </main>`;
}

/* ---------------------------------------------------------------- arranque */

pintar();
sincronizar(true);
latido();
