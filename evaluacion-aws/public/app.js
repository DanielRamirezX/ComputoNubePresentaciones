// La evaluación del lado del alumno: registro, las tres evaluaciones como
// tarjetas, la parte teórica (casos de negocio) y la práctica (un laboratorio
// en la consola de AWS simulada), con sus resultados.
//
// Todo cuelga del hash (#/simulacro-1, #/simulacro-1/teoria,
// #/simulacro-1/practica, #/simulacro-1/resultado) y las llamadas al servidor
// son relativas (api/…): así la misma página sirve suelta en la raíz y montada
// en /m/evaluacion/ dentro de la plataforma.
//
// Lo que el alumno va haciendo vive primero en localStorage (respuestas a
// medias, la cuenta de la consola) y se copia al servidor. Si se va la red,
// nada se pierde; si Render borra el disco después de entregar, el
// comprobante firmado que guardó el navegador repone la entrega (ver
// src/firma.js).

const PREFIJO = 'evaluacion-aws:';
// El perfil de la Ruta AWS (mismo origen cuando está montado en la plataforma):
// si ya existe, no se le pide al alumno que se registre otra vez.
const PERFIL_RUTA = 'aws-practitioner:perfil';
// La Ruta AWS montada junto a esta página: ahí apuntan los enlaces «Repásalo en».
const RUTA_URL = '../aws-practitioner/';
const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F'];
const LATIDO_MS = 10000;
const ESPERA_COPIA_MS = 2000;

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

function leerCrudo(clave, porDefecto = null) {
  try {
    const valor = local?.getItem(clave);
    return valor == null ? porDefecto : JSON.parse(valor);
  } catch {
    return porDefecto;
  }
}
const leer = (clave, porDefecto) => leerCrudo(PREFIJO + clave, porDefecto);

function guardar(clave, valor) {
  try {
    if (valor === null) local?.removeItem(PREFIJO + clave);
    else local?.setItem(PREFIJO + clave, JSON.stringify(valor));
    return true;
  } catch {
    return false; // sin almacenamiento o lleno: la evaluación sigue, solo no recuerda
  }
}

let perfil = leer('perfil', null);

/* ------------------------------------------------------------ utilidades */

const escapar = (t) =>
  String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icono = (id, clase = 'icono') => `<svg class="${clase}" aria-hidden="true"><use href="#${id}"></use></svg>`;
const nombreCorto = (nombre) => String(nombre ?? '').trim().split(/\s+/)[0];
const fechaHora = (iso) =>
  iso ? new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '');
const decimal = (n) => Number(n).toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const porciento = (n) => `${Number(n).toLocaleString('es-MX', { maximumFractionDigits: 1 })} %`;

// crypto.randomUUID solo existe con HTTPS o en localhost, y en el salón la
// plataforma corre por http://192.168…; getRandomValues sí está siempre.
function nuevoId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Orden estable por alumno (el mismo de la Ruta AWS): el mismo alumno ve
// siempre el mismo orden, pero su vecino ve otro. Así copiar la letra no sirve.
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

function aviso(texto, tipo = 'info') {
  const el = document.createElement('div');
  el.className = `aviso-flotante aviso-flotante--${tipo}`;
  el.setAttribute('role', 'status');
  el.textContent = texto;
  document.body.append(el);
  setTimeout(() => el.remove(), 4000);
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

/**
 * Una confirmación dentro de la página (no `confirm()`): se lee bien, se
 * maneja con teclado y no la bloquea el navegador. Devuelve true o false.
 */
function confirmar({ titulo, texto, si, no = 'Cancelar', peligro = false }) {
  return new Promise((resolve) => {
    const dialogo = document.createElement('dialog');
    dialogo.className = 'dialogo';
    dialogo.innerHTML = `
      <form method="dialog">
        <h2>${escapar(titulo)}</h2>
        <div class="dialogo__texto">${texto}</div>
        <div class="dialogo__acciones">
          <button class="boton" value="no" type="submit">${escapar(no)}</button>
          <button class="boton ${peligro ? 'boton--peligro-lleno' : 'boton--primario'}" value="si" type="submit">${escapar(si)}</button>
        </div>
      </form>`;
    document.body.append(dialogo);
    dialogo.addEventListener('close', () => {
      resolve(dialogo.returnValue === 'si');
      dialogo.remove();
    });
    dialogo.showModal();
    dialogo.querySelector('[value="no"]').focus();
  });
}

/* ------------------------------------------- los laboratorios (bajo demanda) */

// La consola y los laboratorios se cargan hasta que hacen falta: si algo
// falla en ellos, la parte teórica sigue funcionando.
let labsPrometidos = null;
function cargarLabs() {
  labsPrometidos ??= Promise.all([import('./labs/index.js'), import('./labs/comun.js')]).then(([labs, comun]) => ({
    LABS: labs.LABS,
    datosAlumno: comun.datosAlumno
  }));
  return labsPrometidos;
}
let LABS_LISTOS = null; // el Map de LABS cuando ya cargó (para las tarjetas)
cargarLabs()
  .then((l) => {
    LABS_LISTOS = l.LABS;
  })
  .catch(() => {});

/* ------------------------------------------------- estado del servidor */

let servidor = null; // la última respuesta de api/estado
let desfase = 0; // hora del servidor menos la de este equipo
const ahora = () => Date.now() + desfase;
const evDe = (id) => servidor?.evaluaciones.find((e) => e.id === id) ?? null;

const claveComprobantes = () => `comprobantes-${perfil.id}`;
const claveResultado = (evId, parte) => `resultado-${perfil.id}-${evId}-${parte}`;

function recordarEntrega(evId, parte, { resultado, comprobante }) {
  if (comprobante) {
    const todos = leer(claveComprobantes(), {});
    todos[`${evId}:${parte}`] = comprobante;
    guardar(claveComprobantes(), todos);
  }
  if (resultado) guardar(claveResultado(evId, parte), resultado);
}

function olvidarEntrega(evId, parte) {
  const todos = leer(claveComprobantes(), {});
  delete todos[`${evId}:${parte}`];
  guardar(claveComprobantes(), todos);
  guardar(claveResultado(evId, parte), null);
}

/**
 * Compara los comprobantes guardados con lo que dice el servidor. Si al
 * servidor le falta una entrega:
 *   - y es de otra «generación» (se borró el disco), se le regresa el
 *     comprobante para que la vuelva a registrar;
 *   - y es de la misma generación, el docente la borró para que repitas: el
 *     comprobante se tira.
 * Devuelve true si restauró algo (hay que volver a pedir el estado).
 */
async function conciliar(estado) {
  const todos = leer(claveComprobantes(), {});
  const restaurar = [];
  for (const [k, comprobante] of Object.entries(todos)) {
    const [evId, parte] = k.split(':');
    const ev = estado.evaluaciones.find((e) => e.id === evId);
    const p = ev?.partes?.[parte];
    if (!p) continue;
    if (p.entrega) continue;
    if (comprobante?.datos?.generacion && comprobante.datos.generacion !== estado.generacion) restaurar.push(comprobante);
    else olvidarEntrega(evId, parte);
  }
  if (!restaurar.length) return false;
  try {
    const r = await api('api/restaurar', { alumno: perfil, comprobantes: restaurar });
    return r.resultados.some((x) => x.estado === 'restaurada');
  } catch {
    return false; // se reintenta en el siguiente latido
  }
}

async function cargarEstado() {
  let d = await api(`api/estado?a=${encodeURIComponent(perfil.id)}`);
  desfase = Date.parse(d.ahora) - Date.now();
  if (await conciliar(d)) d = await api(`api/estado?a=${encodeURIComponent(perfil.id)}`);
  servidor = d;
  return d;
}

// Si una respuesta dice "abierta" o "cerrada" pero aquí hay comprobante de
// esa parte, el servidor la perdió: se repone antes de seguir.
async function reponerSiHaceFalta(evId, parte, respuesta) {
  if (respuesta.estado === 'entregada') return false;
  const comprobante = leer(claveComprobantes(), {})[`${evId}:${parte}`];
  if (!comprobante) return false;
  if (comprobante.datos?.generacion === respuesta.generacion) {
    olvidarEntrega(evId, parte);
    return false;
  }
  try {
    const r = await api('api/restaurar', { alumno: perfil, comprobantes: [comprobante] });
    return r.resultados[0]?.estado === 'restaurada';
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------- rutas */

let alSalir = [];
let alLatido = null;

const ruta = () =>
  location.hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean)
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

async function latido() {
  if (!perfil || document.hidden) return;
  try {
    await cargarEstado();
    alLatido?.(servidor);
  } catch {
    /* sin servidor por ahora: se reintenta */
  }
}
setInterval(latido, LATIDO_MS);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) latido();
});

async function pintar() {
  for (const f of alSalir) f();
  alSalir = [];
  alLatido = null;
  document.body.classList.remove('modo-lab');
  window.scrollTo(0, 0);

  const [primera = '', segunda = '', tercera = ''] = ruta();
  if (!perfil || primera === 'registro') return vistaRegistro();

  if (!servidor) {
    app.innerHTML = `${barra()}<main class="pagina"><p class="cargando">Cargando tus evaluaciones…</p></main>`;
    try {
      await cargarEstado();
    } catch (e) {
      return vistaSinServidor(e);
    }
  } else {
    // Lo guardado puede tener unos segundos: se pinta ya y se refresca enseguida.
    setTimeout(latido, 0);
  }
  const ev = primera ? evDe(primera) : null;
  if (primera && !ev) return ir('');
  if (!ev) return vistaInicio();
  if (tercera === 'intento') return puedeRepetir(ev, segunda) ? vistaIntento(ev, segunda) : ir(ev.id);
  if (segunda === 'teoria' && ev.partes.teoria) return vistaTeoria(ev);
  if (segunda === 'practica' && ev.partes.practica) return vistaPractica(ev);
  if (segunda === 'resultado') return vistaResultado(ev);
  if (segunda) return ir(ev.id);
  return vistaEvaluacion(ev);
}

window.addEventListener('hashchange', pintar);

/* ------------------------------------------------------------ piezas */

function barra({ volver = null, titulo = 'Evaluación AWS', detalle = '' } = {}) {
  return `
    <header class="barra">
      ${
        volver
          ? `<a class="barra__volver" href="#/${volver.ruta}">${icono('i-flecha', 'icono icono--atras')}<span>${escapar(volver.texto)}</span></a>`
          : `<span class="barra__marca">${icono('i-check')}<span>Evaluación</span></span>`
      }
      <div class="barra__centro">
        <span class="barra__titulo">${escapar(titulo)}</span>
      </div>
      <div class="barra__lado" id="barra-detalle">${detalle}</div>
      ${perfil ? `<a class="barra__quien" href="#/registro" title="Cambiar mis datos">${escapar(nombreCorto(perfil.nombre))}</a>` : ''}
    </header>`;
}

/** La pastilla de estado de una parte. */
function pastilla(parte) {
  if (parte.entrega) {
    return `<span class="pastilla pastilla--entregada">${icono('i-check')} Entregada · ${decimal(parte.entrega.calificacion)}</span>`;
  }
  if (parte.estado === 'abierta') return `<span class="pastilla pastilla--abierta"><span class="punto-vivo" aria-hidden="true"></span>Abierta</span>`;
  if (parte.estado === 'preparacion') return `<span class="pastilla pastilla--preparacion">En preparación</span>`;
  return `<span class="pastilla pastilla--cerrada">${icono('i-candado')} Cerrada</span>`;
}

const NOMBRE_PARTE = { teoria: 'Parte teórica', practica: 'Parte práctica' };
// «Examen bimestral · parte práctica» ya dice de qué parte es: no se repite.
const tituloParte = (ev, n) =>
  ev.titulo.toLowerCase().includes(NOMBRE_PARTE[n].toLowerCase()) ? ev.titulo : `${ev.titulo} · ${NOMBRE_PARTE[n]}`;
const DESCRIBE_PARTE = {
  teoria: 'Casos de negocio con preguntas de opción múltiple · 45 minutos',
  practica: 'Un laboratorio en la consola de AWS simulada · máximo 60 minutos'
};

/** ¿Hay laboratorio público para esta evaluación? (si ya cargó la lista) */
const labPublico = (ev) => (LABS_LISTOS ? LABS_LISTOS.has(ev.lab) : true);
const estadoParte = (ev, nombre) => {
  const p = ev.partes[nombre];
  if (nombre === 'practica' && !p.entrega && !labPublico(ev)) return { ...p, estado: 'preparacion' };
  return p;
};

function textoParte(p) {
  if (p.entrega) return `${p.entrega.aciertos !== undefined ? `${p.entrega.aciertos} de ${p.entrega.total} aciertos` : `${p.entrega.obtenidos} de ${p.entrega.total} puntos`} · entregada a las ${hora(p.entrega.fin)}`;
  if (p.estado === 'abierta') return p.empezada ? 'Ya la empezaste: sigue donde ibas.' : 'Ya puedes empezar.';
  if (p.estado === 'preparacion') return 'Todavía la están preparando.';
  return 'Tu docente la abre en clase. Esta pantalla cambia sola cuando la abra.';
}

/* ------------------------------------------------------------- registro */

function vistaRegistro() {
  const deRuta = !perfil ? leerCrudo(PERFIL_RUTA) : null;
  const base = perfil ?? deRuta;
  app.innerHTML = `
    ${barra()}
    <main class="pagina pagina--angosta">
      <p class="etiqueta">Cómputo en la Nube · Evaluación</p>
      <h1 class="registro__titulo">${deRuta ? '¿Eres tú?' : perfil ? 'Tus datos' : 'Antes de empezar'}</h1>
      <p class="registro__intro">${
        deRuta
          ? 'Tomamos tus datos de la Ruta AWS. Revisa que estén bien y confirma: así tu docente sabe de quién es cada entrega.'
          : 'Dinos quién eres para que tu docente registre tus entregas. Toma 20 segundos.'
      }</p>
      <form class="hoja formulario" id="form-registro" novalidate>
        <label for="nombre">Nombre completo</label>
        <input id="nombre" name="nombre" autocomplete="name" maxlength="80" placeholder="Como aparece en la lista" value="${escapar(base?.nombre)}">
        <label for="matricula">Matrícula</label>
        <input id="matricula" name="matricula" inputmode="numeric" autocomplete="off" maxlength="30" value="${escapar(base?.matricula)}">
        <p class="sutil formulario__ayuda">Con tu matrícula te reconocemos aunque entres desde otro equipo.</p>
        <label for="grupo">Grupo</label>
        <input id="grupo" name="grupo" autocomplete="off" maxlength="30" placeholder="Por ejemplo, SC03S" value="${escapar(base?.grupo)}">
        <details class="aviso-privacidad">
          <summary>Aviso de privacidad</summary>
          <p>Usamos tu nombre, tu matrícula y tu grupo <strong>solo</strong> para registrar tus entregas y calificaciones de esta evaluación. No se comparten con nadie ni se usan para otra cosa. Se guardan en el servidor de la materia y tu docente los borra al cerrar el ciclo escolar.</p>
        </details>
        <button class="boton boton--primario boton--ancho" type="submit">${deRuta ? 'Sí, soy yo · continuar' : perfil ? 'Guardar mis datos' : 'Continuar'}</button>
        <p class="error" id="error-registro" role="alert"></p>
      </form>
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
    // Se reusa el id de la Ruta AWS si es válido: es el mismo alumno.
    const idPrevio = perfil?.id ?? (typeof deRuta?.id === 'string' && /^[a-f0-9]{16,40}$/.test(deRuta.id) ? deRuta.id : null);
    perfil = { id: idPrevio ?? nuevoId(), nombre, matricula: form.matricula.value.trim(), grupo };
    guardar('perfil', perfil);
    servidor = null;
    if (ruta()[0] === 'registro') ir('');
    else pintar();
  });
}

function vistaSinServidor(e) {
  app.innerHTML = `
    ${barra()}
    <main class="pagina pagina--angosta">
      <div class="hoja">
        <h1>No pude contactar al servidor</h1>
        <p>${escapar(e.message)}. Revisa que sigas conectado al Wi-Fi del salón.</p>
        <button class="boton boton--primario" type="button" id="btn-reintentar">Intentar de nuevo</button>
      </div>
    </main>`;
  document.getElementById('btn-reintentar').addEventListener('click', pintar);
  alLatido = () => pintar();
}

/* ---------------------------------------------------------------- inicio */

function vistaInicio() {
  const pintarTarjetas = () =>
    servidor.evaluaciones
      .map((ev) => {
        const partes = ['teoria', 'practica'].filter((n) => ev.partes[n]);
        return `
        <a class="tarjeta-ev" href="#/${ev.id}">
          <span class="tarjeta-ev__fecha">${icono('i-reloj')} ${escapar(ev.fechaTexto)}</span>
          <h2>${escapar(ev.titulo)}</h2>
          <p class="tarjeta-ev__resumen">${escapar(ev.resumen)}</p>
          <ul class="tarjeta-ev__partes">
            ${partes
              .map((n) => {
                const p = estadoParte(ev, n);
                return `<li><span class="tarjeta-ev__parte">${NOMBRE_PARTE[n]}</span>${pastilla(p)}${
                  !p.entrega && p.estado === 'cerrada' ? '<span class="tarjeta-ev__nota">tu docente la abre en clase</span>' : ''
                }</li>`;
              })
              .join('')}
          </ul>
          ${ev.combinada !== null && partes.length > 1 ? `<p class="tarjeta-ev__combinada">Calificación combinada: <strong>${decimal(ev.combinada / 10)}</strong></p>` : ''}
          <span class="tarjeta-ev__abrir">Abrir ${icono('i-flecha')}</span>
        </a>`;
      })
      .join('');

  app.innerHTML = `
    ${barra()}
    <main class="pagina">
      <p class="etiqueta">Ruta AWS · Evaluación del bimestre</p>
      <h1 class="inicio__titulo">Hola, ${escapar(nombreCorto(perfil.nombre))}</h1>
      <p class="inicio__intro">Estas son tus evaluaciones. Cada parte se abre cuando tu docente lo indica en clase; mientras esté cerrada, esta página se actualiza sola.</p>
      <div class="rejilla-ev" id="rejilla-ev">${pintarTarjetas()}</div>
      <p class="sutil inicio__nota">¿No eres ${escapar(perfil.nombre)}? <a href="#/registro">Cambia tus datos</a>.</p>
    </main>`;

  let antes = JSON.stringify(servidor.evaluaciones);
  const repintar = () => {
    const ahoraTxt = JSON.stringify(servidor.evaluaciones);
    if (ahoraTxt === antes) return;
    antes = ahoraTxt;
    document.getElementById('rejilla-ev').innerHTML = pintarTarjetas();
  };
  alLatido = repintar;
  cargarLabs()
    .then(() => {
      antes = '';
      if (document.getElementById('rejilla-ev')) repintar();
    })
    .catch(() => {});
}

/* ---------------------------------------------------- una evaluación */

function vistaEvaluacion(ev) {
  const pintarPartes = () => {
    ev = evDe(ev.id) ?? ev;
    const bloques = ['teoria', 'practica']
      .filter((n) => ev.partes[n])
      .map((n) => {
        const p = estadoParte(ev, n);
        let accion = '';
        if (p.entrega) {
          accion = `<a class="boton" href="#/${ev.id}/resultado">Ver mi resultado ${icono('i-flecha')}</a>`;
          if (puedeRepetir(ev, n)) accion += `<a class="boton boton--sutil" href="#/${ev.id}/${n}/intento">${hayIntento(ev.id, n) ? 'Continuar mi intento' : 'Intentar de nuevo'}</a>`;
        }
        else if (p.estado === 'abierta') {
          accion = `<a class="boton boton--primario" href="#/${ev.id}/${n}">${p.empezada ? 'Continuar' : 'Empezar'} la ${NOMBRE_PARTE[n].toLowerCase()} ${icono('i-flecha')}</a>`;
        }
        return `
          <section class="parte ${p.entrega ? 'parte--entregada' : p.estado === 'abierta' ? 'parte--abierta' : ''}" aria-labelledby="parte-${n}">
            <div class="parte__icono">${icono(n === 'teoria' ? 'i-libro' : 'i-consola')}</div>
            <div class="parte__texto">
              <h2 id="parte-${n}">${NOMBRE_PARTE[n]} ${pastilla(p)}</h2>
              <p class="parte__describe">${DESCRIBE_PARTE[n]}${ev.pesos[n] && ev.pesos[n] < 100 ? ` · vale el ${ev.pesos[n]} %` : ''}</p>
              <p class="parte__estado">${textoParte(p)}</p>
            </div>
            <div class="parte__accion">${accion}</div>
          </section>`;
      })
      .join('');
    const combinada =
      Object.keys(ev.pesos).length > 1
        ? `<div class="hoja combinada">
            <div>
              <h2>Calificación combinada</h2>
              <p class="sutil">${Object.entries(ev.pesos)
                .map(([n, peso]) => `${peso} % ${NOMBRE_PARTE[n].replace('Parte ', 'la ')}`)
                .join(' + ')}. Aparece cuando entregues las dos partes.</p>
            </div>
            <div class="combinada__cifra">${ev.combinada === null ? '—' : decimal(ev.combinada / 10)}</div>
          </div>`
        : '';
    return bloques + combinada;
  };

  app.innerHTML = `
    ${barra({ volver: { ruta: '', texto: 'Mis evaluaciones' }, titulo: ev.titulo })}
    <main class="pagina pagina--media">
      <p class="etiqueta">${escapar(ev.fechaTexto)}</p>
      <h1>${escapar(ev.titulo)}</h1>
      <p class="evaluacion__resumen">${escapar(ev.resumen)}</p>
      <div id="partes">${pintarPartes()}</div>
      ${
        ev.reintentos
          ? '<p class="sutil">Cada parte se entrega <strong>una sola vez</strong> y esa entrega es tu calificación. Después puedes repetirla las veces que quieras para practicar: los intentos no la cambian.</p>'
          : ev.partes.teoria || ev.partes.practica
            ? '<p class="sutil">Cada parte se entrega <strong>una sola vez</strong>. Si algo sale mal, avísale a tu docente.</p>'
            : ''
      }
    </main>`;

  let antes = JSON.stringify(ev);
  alLatido = () => {
    const nueva = evDe(ev.id);
    if (!nueva || JSON.stringify(nueva) === antes) return;
    antes = JSON.stringify(nueva);
    document.getElementById('partes').innerHTML = pintarPartes();
  };
  cargarLabs()
    .then(() => {
      if (document.getElementById('partes')) document.getElementById('partes').innerHTML = pintarPartes();
    })
    .catch(() => {});
}

/** Pantalla de "todavía no": se abre sola en cuanto el docente la active. */
function vistaEspera(ev, nombre, estado) {
  const preparacion = estado === 'preparacion';
  app.innerHTML = `
    ${barra({ volver: { ruta: ev.id, texto: ev.titulo }, titulo: tituloParte(ev, nombre) })}
    <main class="pagina pagina--angosta">
      <div class="hoja espera">
        ${icono(preparacion ? 'i-reloj' : 'i-candado', 'icono icono--grande')}
        <h1>${preparacion ? 'Todavía en preparación' : 'Todavía está cerrada'}</h1>
        <p>${
          preparacion
            ? 'Esta parte todavía no está lista. Tu docente te avisa cuándo se aplica.'
            : 'Tu docente la abre en clase. <strong>No recargues:</strong> en cuanto la abra, esta pantalla cambia sola.'
        }</p>
        <p class="sutil" id="espera-ultima">Revisando cada 10 segundos…</p>
        <a class="boton" href="#/${ev.id}">Volver</a>
      </div>
    </main>`;
  alLatido = (s) => {
    const p = s.evaluaciones.find((x) => x.id === ev.id)?.partes[nombre];
    if (p && (p.estado === 'abierta' || p.entrega)) pintar();
    else {
      const el = document.getElementById('espera-ultima');
      if (el) el.textContent = `Última revisión: ${new Date().toLocaleTimeString('es-MX')}`;
    }
  };
}

function vistaError(ev, mensaje) {
  app.innerHTML = `
    ${barra({ volver: { ruta: ev.id, texto: ev.titulo }, titulo: ev.titulo })}
    <main class="pagina pagina--angosta">
      <div class="hoja">
        <h1>No pude cargar esta parte</h1>
        <p>${escapar(mensaje)}. Revisa que sigas conectado al Wi-Fi del salón: lo que llevas sigue guardado en este equipo.</p>
        <button class="boton boton--primario" type="button" id="btn-reintentar">Intentar de nuevo</button>
      </div>
    </main>`;
  document.getElementById('btn-reintentar').addEventListener('click', pintar);
}

/** El reloj: solo avisa, nunca corta. */
function reloj(elemento, inicioIso, minutos, alAvisar) {
  const fin = Date.parse(inicioIso) + minutos * 60000;
  let avisado5 = false;
  let avisado0 = false;
  const pintarReloj = () => {
    if (!elemento.isConnected) return;
    const quedan = Math.round((fin - ahora()) / 1000);
    const m = Math.floor(Math.abs(quedan) / 60);
    const s = String(Math.abs(quedan) % 60).padStart(2, '0');
    elemento.classList.toggle('reloj--poco', quedan <= 300 && quedan > 0);
    elemento.classList.toggle('reloj--fuera', quedan <= 0);
    elemento.innerHTML = `${icono('i-reloj')}<span>${quedan > 0 ? `Te quedan <strong>${m}:${s}</strong>` : `Tiempo cumplido · <strong>+${m}:${s}</strong>`}</span>`;
    elemento.setAttribute('aria-label', quedan > 0 ? `Te quedan ${m} minutos` : 'Se acabó el tiempo sugerido');
    if (quedan <= 300 && quedan > 0 && !avisado5) {
      avisado5 = true;
      alAvisar?.('Quedan 5 minutos. Ve revisando para entregar.');
    }
    if (quedan <= 0 && !avisado0) {
      avisado0 = true;
      alAvisar?.('Se acabó el tiempo. Entrega en cuanto puedas.');
    }
  };
  pintarReloj();
  const t = setInterval(pintarReloj, 1000);
  // Si al abrir ya faltaba poco, no se avisa de golpe con un globo: se ve en el reloj.
  if (fin - ahora() <= 300000) avisado5 = true;
  if (fin - ahora() <= 0) avisado0 = true;
  alSalir.push(() => clearInterval(t));
}

/* ------------------------------------------------------------- teórica */

const claveTeoria = (evId) => `teoria-${perfil.id}-${evId}`;

async function vistaTeoria(ev) {
  const p = ev.partes.teoria;
  if (p.entrega) return ir(`${ev.id}/resultado`);
  if (p.estado !== 'abierta') return vistaEspera(ev, 'teoria', p.estado);

  const progreso = leer(claveTeoria(ev.id), null);
  // Antes de empezar se leen las instrucciones: el reloj arranca con «Empezar».
  if (!p.empezada && !progreso) return instruccionesTeoria(ev);
  return arrancarTeoria(ev);
}

function instruccionesTeoria(ev) {
  app.innerHTML = `
    ${barra({ volver: { ruta: ev.id, texto: ev.titulo }, titulo: `${ev.titulo} · Parte teórica` })}
    <main class="pagina pagina--angosta">
      <p class="etiqueta">Parte teórica · antes de empezar</p>
      <h1>Cómo funciona</h1>
      <ul class="reglas hoja">
        <li><strong>5 casos de negocio</strong>, cada uno con <strong>5 preguntas</strong> de opción múltiple: 25 en total.</li>
        <li>Arriba de cada grupo de preguntas está la historia del caso. Léela con calma: las respuestas salen de ahí.</li>
        <li>Tienes <strong>45 minutos</strong>. El reloj solo te avisa: no se corta nada.</li>
        <li>Puedes moverte entre casos y cambiar respuestas. Se guardan en este equipo mientras contestas.</li>
        <li>Al final revisas todo y entregas. <strong>Solo se entrega una vez.</strong></li>
      </ul>
      <button class="boton boton--primario boton--ancho" type="button" id="btn-empezar">Empezar · arranca el reloj ${icono('i-flecha')}</button>
      <p class="error" id="error-empezar" role="alert"></p>
    </main>`;
  document.getElementById('btn-empezar').addEventListener('click', () => {
    guardar(claveTeoria(ev.id), { respuestas: {}, caso: 0, fase: 'casos' });
    arrancarTeoria(ev);
  });
  alLatido = (s) => {
    const p = s.evaluaciones.find((x) => x.id === ev.id)?.partes.teoria;
    if (p && (p.estado !== 'abierta' || p.entrega)) pintar();
  };
}

async function arrancarTeoria(ev) {
  app.innerHTML = `${barra({ volver: { ruta: ev.id, texto: ev.titulo }, titulo: `${ev.titulo} · Parte teórica` })}<main class="pagina"><p class="cargando">Cargando los casos…</p></main>`;
  const pedido = location.hash;
  let datos;
  try {
    datos = await api('api/teoria', { alumno: perfil, evaluacion: ev.id });
    if (await reponerSiHaceFalta(ev.id, 'teoria', datos)) datos = await api('api/teoria', { alumno: perfil, evaluacion: ev.id });
  } catch (e) {
    if (location.hash === pedido) vistaError(ev, e.message);
    return;
  }
  if (location.hash !== pedido) return; // el alumno ya se fue a otra parte
  desfase = Date.parse(datos.ahora) - Date.now();

  if (datos.estado === 'entregada') {
    recordarEntrega(ev.id, 'teoria', datos);
    return ir(`${ev.id}/resultado`);
  }
  if (datos.estado !== 'abierta') return vistaEspera(ev, 'teoria', datos.estado);
  teoriaAbierta(ev, datos);
}

/**
 * La teórica en marcha. Con `intento`, es un intento de práctica después de
 * entregar: se guarda solo en este equipo, con su propio reloj y otro orden de
 * opciones, y al terminar se califica sin cambiar la entrega.
 */
function teoriaAbierta(ev, datos, { intento = false } = {}) {
  const { casos, preguntas, minutos } = datos;
  const clave = intento ? claveIntento(ev.id, 'teoria') : claveTeoria(ev.id);
  const estado = leer(clave, null) ?? { respuestas: {}, caso: 0, fase: 'casos' };
  if (estado.fase === 'inicio') estado.fase = 'casos';
  if (intento) {
    estado.inicio ??= new Date(ahora()).toISOString();
    estado.semilla ??= nuevoId();
  }
  const inicio = intento ? estado.inicio : datos.inicio;
  // Si cambió el banco, se descartan respuestas que ya no existen.
  const ids = new Set(preguntas.map((q) => q.id));
  for (const id of Object.keys(estado.respuestas)) if (!ids.has(id)) delete estado.respuestas[id];
  estado.caso = Math.min(Math.max(0, estado.caso | 0), casos.length - 1);

  const numero = new Map(preguntas.map((q, i) => [q.id, i + 1]));
  const delCaso = (c) => preguntas.filter((q) => q.caso === c.id);
  const ordenes = Object.fromEntries(preguntas.map((q) => [q.id, barajar(q.opciones.length, `${perfil.id}:${q.id}${intento ? `:${estado.semilla}` : ''}`)]));
  const contestada = (q) => Number.isInteger(estado.respuestas[q.id]);
  const contestadas = () => preguntas.filter(contestada).length;
  const recordar = () => guardar(clave, estado);
  let cerradaAviso = false;

  const titulo = `${ev.titulo} · Parte teórica${intento ? ' · intento de práctica' : ''}`;
  const cabeza = () => `
    ${barra({ volver: { ruta: ev.id, texto: ev.titulo }, titulo, detalle: '<span class="reloj" id="reloj"></span>' })}
    ${
      intento
        ? `<div class="aviso-intento">${icono('i-libro')}<span><strong>Intento de práctica:</strong> tu calificación es la de tu primera entrega y no cambia.</span></div>`
        : `<div class="aviso-cierre" id="aviso-cierre" ${cerradaAviso ? '' : 'hidden'} role="alert">${icono('i-alerta')} Tu docente cerró la parte teórica. Si no alcanzaste a entregar, avísale.</div>`
    }`;

  function mapa() {
    return `<div class="mapa" aria-label="Mapa de preguntas: ${contestadas()} de ${preguntas.length} contestadas">
      ${casos
        .map(
          (c, i) => `<div class="mapa__caso">
            <span class="mapa__etiqueta">Caso ${i + 1}</span>
            ${delCaso(c)
              .map(
                (q) =>
                  `<button type="button" class="marca ${contestada(q) ? 'marca--contestada' : ''} ${estado.fase === 'casos' && i === estado.caso ? 'marca--caso' : ''}" data-ir-caso="${i}" data-pregunta="${q.id}" aria-label="Pregunta ${numero.get(q.id)}${contestada(q) ? ', contestada' : ', sin contestar'}">${numero.get(q.id)}</button>`
              )
              .join('')}
          </div>`
        )
        .join('')}
    </div>`;
  }

  function pestanasCasos() {
    return `<nav class="casos-nav" aria-label="Casos">
      ${casos
        .map((c, i) => {
          const hechas = delCaso(c).filter(contestada).length;
          const total = delCaso(c).length;
          return `<button type="button" class="casos-nav__boton ${hechas === total ? 'casos-nav__boton--completo' : ''}" data-ir-caso="${i}" ${i === estado.caso && estado.fase === 'casos' ? 'aria-current="step"' : ''}>
            <span>Caso ${i + 1}</span><small>${hechas}/${total}</small>
          </button>`;
        })
        .join('')}
      <button type="button" class="casos-nav__boton casos-nav__boton--revisar" data-revisar ${estado.fase === 'revision' ? 'aria-current="step"' : ''}><span>Revisar</span><small>${contestadas()}/${preguntas.length}</small></button>
    </nav>`;
  }

  function mostrar(enfocar = true) {
    recordar();
    window.scrollTo(0, 0);
    if (estado.fase === 'revision') revision();
    else caso(enfocar);
    reloj(document.getElementById('reloj'), inicio, minutos, (t) => aviso(t, 'reloj'));
  }

  function caso(enfocar) {
    for (const f of alSalir) f();
    alSalir = [];
    const c = casos[estado.caso];
    const ultima = estado.caso === casos.length - 1;
    app.innerHTML = `
      ${cabeza()}
      <main class="pagina pagina--ancha teoria">
        ${pestanasCasos()}
        <div class="teoria__cuerpo">
          <aside class="teoria__caso">
            <details class="caso" open>
              <summary><span class="caso__num">Caso ${estado.caso + 1} de ${casos.length}</span><span class="caso__titulo">${escapar(c.titulo || c.empresa)}</span><span class="caso__plegar" aria-hidden="true"></span></summary>
              <div class="caso__historia">${c.empresa ? `<p class="caso__empresa">${escapar(c.empresa)}</p>` : ''}${c.historia}</div>
            </details>
          </aside>
          <section class="teoria__preguntas" aria-label="Preguntas del caso ${estado.caso + 1}">
            ${delCaso(c)
              .map((q) => {
                const orden = ordenes[q.id];
                return `
              <article class="pregunta ${contestada(q) ? 'pregunta--contestada' : ''}" id="p-${escapar(q.id)}">
                <p class="pregunta__meta"><span>Pregunta ${numero.get(q.id)} de ${preguntas.length}</span>${q.tema ? `<span class="chip">${escapar(q.tema)}</span>` : ''}</p>
                <h2 class="pregunta__texto" id="t-${escapar(q.id)}">${escapar(q.texto)}</h2>
                <div class="opciones" role="group" aria-labelledby="t-${escapar(q.id)}">
                  ${orden
                    .map(
                      (original, posicion) => `
                    <button type="button" class="opcion" data-p="${escapar(q.id)}" data-o="${original}" aria-pressed="${estado.respuestas[q.id] === original}">
                      <span class="opcion__letra">${LETRAS[posicion]}</span><span class="opcion__texto">${escapar(q.opciones[original])}</span>
                    </button>`
                    )
                    .join('')}
                </div>
              </article>`;
              })
              .join('')}
            <nav class="navegacion" aria-label="Moverse entre casos">
              <button class="boton" type="button" data-accion="anterior" ${estado.caso === 0 ? 'disabled' : ''}>${icono('i-flecha', 'icono icono--atras')} Caso anterior</button>
              <button class="boton boton--primario" type="button" data-accion="siguiente">${ultima ? 'Revisar y entregar' : 'Siguiente caso'} ${icono('i-flecha')}</button>
            </nav>
          </section>
        </div>
        ${mapa()}
      </main>`;

    app.querySelector('.teoria__preguntas').addEventListener('click', (e) => {
      const boton = e.target.closest('[data-o]');
      if (boton) {
        const id = boton.dataset.p;
        estado.respuestas[id] = Number(boton.dataset.o);
        recordar();
        boton.parentElement.querySelectorAll('[data-o]').forEach((b) => b.setAttribute('aria-pressed', String(b === boton)));
        boton.closest('.pregunta').classList.add('pregunta--contestada');
        refrescarConteos();
        return;
      }
      const accion = e.target.closest('[data-accion]')?.dataset.accion;
      if (accion === 'anterior' && estado.caso > 0) {
        estado.caso -= 1;
        mostrar();
      }
      if (accion === 'siguiente') {
        if (ultima) estado.fase = 'revision';
        else estado.caso += 1;
        mostrar();
      }
    });
    conectarSaltos();
    if (enfocar) app.querySelector('.caso summary')?.focus({ preventScroll: true });
  }

  // Los contadores de las pestañas y el mapa, sin repintar las preguntas (no se pierde el scroll).
  function refrescarConteos() {
    app.querySelector('.casos-nav')?.replaceWith(htmlANodo(pestanasCasos()));
    app.querySelector('.mapa')?.replaceWith(htmlANodo(mapa()));
    conectarSaltos();
  }

  function conectarSaltos() {
    app.querySelectorAll('.casos-nav, .mapa').forEach((zona) =>
      zona.addEventListener('click', (e) => {
        if (e.target.closest('[data-revisar]')) {
          estado.fase = 'revision';
          return mostrar();
        }
        const boton = e.target.closest('[data-ir-caso]');
        if (!boton) return;
        estado.caso = Number(boton.dataset.irCaso);
        estado.fase = 'casos';
        const pregunta = boton.dataset.pregunta;
        mostrar(!pregunta);
        if (pregunta) document.getElementById(`p-${pregunta}`)?.scrollIntoView({ block: 'center' });
      })
    );
  }

  function revision() {
    for (const f of alSalir) f();
    alSalir = [];
    const faltan = preguntas.length - contestadas();
    app.innerHTML = `
      ${cabeza()}
      <main class="pagina pagina--ancha teoria">
        ${pestanasCasos()}
        <div class="pagina--media revision-teoria">
          <p class="etiqueta">Antes de entregar</p>
          <h1>Revisa tus respuestas</h1>
          <p>${
            faltan === 0
              ? `Contestaste las ${preguntas.length} preguntas.`
              : `Te ${faltan === 1 ? 'falta 1 pregunta' : `faltan ${faltan} preguntas`}. Puedes entregar así, pero las que falten cuentan como error.`
          } Toca cualquier pregunta para ir a ella.</p>
          ${casos
            .map(
              (c, i) => `
            <h2 class="revision__caso">Caso ${i + 1} · ${escapar(c.titulo || c.empresa)}</h2>
            <ol class="revision" start="${numero.get(delCaso(c)[0]?.id) ?? 1}">
              ${delCaso(c)
                .map((q) => {
                  const lista = contestada(q);
                  return `<li><button type="button" data-ir-caso="${i}" data-pregunta="${escapar(q.id)}">
                    <span class="revision__num">${numero.get(q.id)}</span>
                    <span class="revision__texto">${escapar(q.texto)}</span>
                    <span class="revision__estado ${lista ? '' : 'revision__estado--falta'}">${lista ? LETRAS[ordenes[q.id].indexOf(estado.respuestas[q.id])] : 'Falta'}</span>
                  </button></li>`;
                })
                .join('')}
            </ol>`
            )
            .join('')}
          <div class="acciones">
            <button class="boton" type="button" id="btn-volver">Seguir contestando</button>
            <button class="boton boton--primario" type="button" id="btn-entregar">${intento ? 'Calificar mi intento' : 'Entregar la parte teórica'}</button>
          </div>
          <p class="error" id="error-entrega" role="alert"></p>
        </div>
      </main>`;

    conectarSaltos();
    app.querySelectorAll('.revision').forEach((lista) =>
      lista.addEventListener('click', (e) => {
        const boton = e.target.closest('[data-ir-caso]');
        if (!boton) return;
        estado.caso = Number(boton.dataset.irCaso);
        estado.fase = 'casos';
        mostrar(false);
        document.getElementById(`p-${boton.dataset.pregunta}`)?.scrollIntoView({ block: 'center' });
      })
    );
    document.getElementById('btn-volver').addEventListener('click', () => {
      const pendiente = preguntas.find((q) => !contestada(q));
      estado.caso = pendiente ? casos.findIndex((c) => c.id === pendiente.caso) : casos.length - 1;
      estado.fase = 'casos';
      mostrar();
      if (pendiente) document.getElementById(`p-${pendiente.id}`)?.scrollIntoView({ block: 'center' });
    });
    document.getElementById('btn-entregar').addEventListener('click', entregar);
    app.querySelector('h1').focus?.();
  }

  async function entregar() {
    const faltan = preguntas.length - contestadas();
    const falta = faltan ? `<strong>Te faltan ${faltan} pregunta${faltan === 1 ? '' : 's'}</strong> (cuentan como error). ` : 'Contestaste todo. ';
    const si = await confirmar(
      intento
        ? {
            titulo: '¿Calificar tu intento?',
            texto: `<p>${falta}Vas a ver cómo te fue en este intento. Tu calificación oficial no cambia.</p>`,
            si: 'Sí, calificar',
            no: 'Seguir revisando'
          }
        : {
            titulo: '¿Entregar la parte teórica?',
            texto: `<p>${falta}Después de entregar ya no podrás cambiar ninguna respuesta.</p>`,
            si: 'Sí, entregar',
            no: 'Seguir revisando'
          }
    );
    if (!si) return;
    const boton = document.getElementById('btn-entregar');
    const error = document.getElementById('error-entrega');
    boton.disabled = true;
    error.textContent = '';
    try {
      if (intento) {
        const r = await api('api/teoria/intento/calificar', { alumno: perfil, evaluacion: ev.id, respuestas: estado.respuestas });
        guardar(clave, null);
        return vistaResultadoIntento(ev, 'teoria', r.resultado);
      }
      const r = await api('api/teoria/entregar', { alumno: perfil, evaluacion: ev.id, respuestas: estado.respuestas });
      terminar(r);
    } catch (e) {
      if (e.estado === 409 && e.datos?.resultado) return terminar(e.datos);
      error.textContent = e.estado === 423 ? e.message : `${e.message}. Revisa tu conexión e inténtalo otra vez: tus respuestas siguen guardadas.`;
      boton.disabled = false;
    }
  }

  function terminar(r) {
    recordarEntrega(ev.id, 'teoria', r);
    guardar(clave, null);
    aviso('¡Entregada! Aquí está tu resultado.', 'exito');
    servidor = null; // que el inicio se vuelva a pedir
    ir(`${ev.id}/resultado`);
  }

  // En un intento ya hay entrega y no importa si la parte se cierra: nada que vigilar.
  if (!intento) alLatido = (s) => {
    const p = s.evaluaciones.find((x) => x.id === ev.id)?.partes.teoria;
    if (!p) return;
    if (p.entrega) return pintar(); // entregó desde otro equipo
    cerradaAviso = p.estado !== 'abierta';
    const el = document.getElementById('aviso-cierre');
    if (el) el.hidden = !cerradaAviso;
  };

  mostrar();
}

function htmlANodo(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/* ------------------------------------------------------------- práctica */

const claveLab = (evId) => `lab-${perfil.id}-${evId}`;
const clavePanel = 'panel-plegado';

async function vistaPractica(ev) {
  const p = ev.partes.practica;
  if (p.entrega) return ir(`${ev.id}/resultado`);
  if (p.estado !== 'abierta') return vistaEspera(ev, 'practica', p.estado);

  app.innerHTML = `${barra({ volver: { ruta: ev.id, texto: ev.titulo }, titulo: tituloParte(ev, 'practica') })}<main class="pagina"><p class="cargando">Preparando tu cuenta de AWS simulada…</p></main>`;
  const pedido = location.hash;
  let labs;
  try {
    labs = await cargarLabs();
  } catch (e) {
    console.error(e);
    if (location.hash === pedido) vistaError(ev, 'No pude cargar el laboratorio');
    return;
  }
  const LAB = labs.LABS.get(ev.lab);
  if (!LAB) return location.hash === pedido && vistaEspera(ev, 'practica', 'preparacion');

  const local_ = leer(claveLab(ev.id), null);
  // Antes de empezar se leen las instrucciones: el reloj arranca con «Empezar».
  if (!p.empezada && !local_) return instruccionesPractica(ev, LAB, labs);
  arrancarPractica(ev, LAB, labs);
}

function instruccionesPractica(ev, LAB, labs) {
  const movil = matchMedia('(max-width: 760px)').matches;
  app.innerHTML = `
    ${barra({ volver: { ruta: ev.id, texto: ev.titulo }, titulo: tituloParte(ev, 'practica') })}
    <main class="pagina pagina--angosta">
      <p class="etiqueta">Parte práctica · antes de empezar</p>
      <h1>${escapar(LAB.titulo)}</h1>
      ${movil ? `<p class="aviso-suave">${icono('i-alerta')}<span>Se recomienda hacer el laboratorio en una <strong>computadora</strong>: la consola necesita espacio. Puedes intentarlo en el teléfono, pero será incómodo.</span></p>` : ''}
      <ul class="reglas hoja">
        <li>Vas a trabajar en una <strong>consola de AWS simulada</strong>: se ve y se usa como la real, pero no cuesta nada y no necesita internet.</li>
        <li>Junto a la consola tienes el <strong>caso</strong>, tus <strong>tareas</strong> con sus puntos y <strong>tus datos</strong> (el rango de tu red, tu sufijo…). Son distintos a los de tu vecino.</li>
        <li>Tienes un máximo de <strong>${LAB.minutos || 60} minutos</strong>. El reloj solo avisa.</li>
        <li>Todo lo que haces se guarda solo, en este equipo y en el servidor.</li>
        ${ev.autorrevision ? '<li>Con <strong>«Revisar mi avance»</strong> ves qué llevas bien y qué te falta, sin entregar.</li>' : ''}
        ${ev.asistente ? '<li>Si te atoras, pregúntale al <strong>asistente</strong>: te ayuda a encontrar dónde está el problema, pero <strong>no te da la respuesta</strong>. Tu docente puede leer la conversación.</li>' : ''}
        <li>Cuando termines, pulsa <strong>«Entregar laboratorio»</strong>. <strong>Solo se entrega una vez.</strong></li>
      </ul>
      <button class="boton boton--primario boton--ancho" type="button" id="btn-empezar">Abrir la consola · arranca el reloj ${icono('i-flecha')}</button>
    </main>`;
  document.getElementById('btn-empezar').addEventListener('click', () => arrancarPractica(ev, LAB, labs));
  alLatido = (s) => {
    const p = s.evaluaciones.find((x) => x.id === ev.id)?.partes.practica;
    if (p && (p.estado !== 'abierta' || p.entrega)) pintar();
  };
}

async function arrancarPractica(ev, LAB, labs) {
  const pedido = location.hash;
  let datos;
  try {
    datos = await api('api/practica', { alumno: perfil, evaluacion: ev.id });
    if (await reponerSiHaceFalta(ev.id, 'practica', datos)) datos = await api('api/practica', { alumno: perfil, evaluacion: ev.id });
  } catch (e) {
    if (location.hash === pedido) vistaError(ev, e.message);
    return;
  }
  if (location.hash !== pedido) return;
  desfase = Date.parse(datos.ahora) - Date.now();
  if (datos.estado === 'entregada') {
    recordarEntrega(ev.id, 'practica', datos);
    guardar(claveLab(ev.id), null);
    return ir(`${ev.id}/resultado`);
  }
  if (datos.estado !== 'abierta') return vistaEspera(ev, 'practica', datos.estado);

  let consolaModulo;
  try {
    consolaModulo = await import('./consola/consola.js');
  } catch (e) {
    console.error(e);
    return vistaError(ev, 'No pude cargar la consola simulada');
  }
  if (location.hash !== pedido) return;
  laboratorio(ev, LAB, labs, datos, consolaModulo.montarConsola);
}

/** Etiquetas de los datos del alumno (public/labs/comun.js). Lo que no esté aquí se muestra con su nombre. */
const ETIQUETAS_DATOS = {
  vpcCidr: ['Rango de tu VPC', 'Úsalo al crear tu VPC.'],
  octeto: ['Tu número de red', 'El segundo número de todas tus direcciones: 10.<b>N</b>.x.x'],
  sufijo: ['Tu sufijo', 'Para nombres que deben ser únicos en el mundo, como los buckets.'],
  ipCasa: ['La IP de tu casa', 'La que aparece al elegir «My IP».'],
  cuentaId: ['Tu número de cuenta', 'El que muestra la consola arriba a la derecha.']
};
const OCULTOS = new Set(['nombre', 'matricula']);
const ordenDato = (k) => {
  const i = Object.keys(ETIQUETAS_DATOS).indexOf(k);
  return i === -1 ? 99 : i;
};

/**
 * El laboratorio en marcha. Con `intento`, es un intento de práctica después de
 * entregar: la cuenta vive solo en este equipo (el servidor no guarda copias),
 * tiene su propio reloj y al terminar se califica sin cambiar la entrega.
 */
function laboratorio(ev, LAB, { datosAlumno }, datosServidor, montarConsola, { intento = false } = {}) {
  const identidad = datosServidor.identidad ?? { nombre: perfil.nombre, matricula: perfil.matricula };
  const datos = datosAlumno(identidad);
  const clave = intento ? claveIntento(ev.id, 'practica') : claveLab(ev.id);
  let autorrevision = datosServidor.autorrevision;
  // El asistente de IA: solo en la entrega oficial (en un intento ya no hay límite que cuidar).
  const asistente = intento ? null : datosServidor.asistente ?? null;
  let conAsistente = Boolean(asistente?.activo);

  // ¿Con qué cuenta se arranca? La más avanzada entre la de este equipo y la
  // copia del servidor (cuenta por número de cambios, no por reloj: los relojes
  // de dos equipos no coinciden). Sin ninguna, la cuenta inicial del laboratorio.
  const enEquipo = leer(clave, null);
  const enServidor = intento ? null : datosServidor.copia;
  let cuenta;
  let rev;
  if (enEquipo?.estado && (!enServidor || (enEquipo.rev ?? 0) >= (enServidor.rev ?? 0))) {
    ({ estado: cuenta, rev = 0 } = enEquipo);
  } else if (enServidor?.estado) {
    cuenta = enServidor.estado;
    rev = enServidor.rev ?? 0;
    if (enEquipo) aviso('Recuperé tu avance desde el servidor (lo hiciste en otro equipo).', 'info');
  } else {
    cuenta = LAB.estadoInicial(datos);
    rev = 0;
  }
  const inicio = intento ? enEquipo?.inicio ?? new Date(ahora()).toISOString() : datosServidor.inicio;
  const enEsteEquipo = () => ({ estado: cuenta, rev, hora: new Date().toISOString(), ...(intento ? { inicio } : {}) });
  guardar(clave, enEsteEquipo());

  const tareas = LAB.tareas(datos);
  // Las tareas bono son opcionales: no cuentan en los 100 puntos.
  const totalPuntos = tareas.filter((t) => !t.bono).reduce((s, t) => s + t.puntos, 0);
  const totalBono = tareas.filter((t) => t.bono).reduce((s, t) => s + t.puntos, 0);
  const requeridas = tareas.filter((t) => !t.bono).length;
  let plegado = leer(clavePanel, false) === true;
  let pestana = 'tareas';
  let revision = null; // el último «Revisar mi avance»

  document.body.classList.add('modo-lab');
  const movil = matchMedia('(max-width: 760px)').matches;
  app.innerHTML = `
    <div class="lab ${plegado ? 'lab--plegado' : ''}" id="lab">
      <header class="lab__barra">
        <a class="lab__salir" href="#/${ev.id}" title="Tu avance queda guardado">${icono('i-flecha', 'icono icono--atras')}<span>Salir</span></a>
        <div class="lab__titulo"><span>${escapar(tituloParte(ev, 'practica'))}${intento ? ' · intento de práctica' : ''}</span><strong>${escapar(LAB.titulo)}</strong></div>
        <span class="lab__guardado" id="guardado" aria-live="polite"></span>
        <span class="reloj reloj--oscuro" id="reloj"></span>
        <div class="lab__acciones">
          <button class="boton boton--oscuro boton--chico" type="button" id="btn-panel" aria-controls="panel" aria-expanded="${!plegado}">${icono('i-panel')}<span>${plegado ? 'Mostrar' : 'Ocultar'} instrucciones</span></button>
          <button class="boton boton--oscuro boton--chico" type="button" id="btn-asistente" ${conAsistente ? '' : 'hidden'}>${icono('i-libro')}<span>Asistente</span></button>
          <button class="boton boton--oscuro boton--chico" type="button" id="btn-revisar" ${autorrevision ? '' : 'hidden'}>${icono('i-lupa')}<span>Revisar mi avance</span></button>
          <button class="boton boton--primario boton--chico" type="button" id="btn-entregar">${intento ? 'Calificar mi intento' : 'Entregar laboratorio'}</button>
        </div>
      </header>
      ${
        intento
          ? `<div class="aviso-intento">${icono('i-libro')}<span><strong>Intento de práctica:</strong> tu calificación es la de tu primera entrega y no cambia. Esta cuenta se guarda solo en este equipo.</span></div>`
          : `<div class="aviso-cierre" id="aviso-cierre" hidden role="alert">${icono('i-alerta')} Tu docente cerró la parte práctica. Tu avance quedó guardado; si no alcanzaste a entregar, avísale.</div>`
      }
      ${movil ? `<div class="aviso-movil" id="aviso-movil">${icono('i-alerta')}<span>Se recomienda una computadora para el laboratorio. Puedes seguir aquí: las instrucciones están debajo de la consola.</span><button class="boton boton--chico" type="button" id="btn-aviso-movil">Entendido</button></div>` : ''}
      <div class="lab__cuerpo">
        <div class="lab__consola" id="consola" role="region" aria-label="Consola de AWS simulada"></div>
        <aside class="lab__panel" id="panel" aria-label="Instrucciones del laboratorio">
          <div class="pestanas-lab" role="tablist" aria-label="Instrucciones">
            <button type="button" role="tab" id="tab-caso" data-pestana="caso" aria-controls="tp-caso">Caso</button>
            <button type="button" role="tab" id="tab-tareas" data-pestana="tareas" aria-controls="tp-tareas">Tareas</button>
            <button type="button" role="tab" id="tab-datos" data-pestana="datos" aria-controls="tp-datos">Tus datos</button>
            <button type="button" role="tab" id="tab-avance" data-pestana="avance" aria-controls="tp-avance" ${autorrevision ? '' : 'hidden'}>Mi avance</button>
            <button type="button" role="tab" id="tab-asistente" data-pestana="asistente" aria-controls="tp-asistente" ${conAsistente ? '' : 'hidden'}>Asistente</button>
          </div>
          <div class="lab__contenido">
            <section role="tabpanel" id="tp-caso" aria-labelledby="tab-caso" data-panel="caso" class="lab__caso">${LAB.historia}</section>
            <section role="tabpanel" id="tp-tareas" aria-labelledby="tab-tareas" data-panel="tareas">
              <p class="sutil">${requeridas} tareas · ${totalPuntos} puntos en total.${totalBono ? ` Además, un <strong>bono opcional</strong> de hasta +${totalBono}: compensa errores, pero tu calificación nunca pasa de 100.` : ''}</p>
              <ol class="tareas">
                ${tareas
                  .map(
                    (t, i) => `<li class="tarea ${t.bono ? 'tarea--bono' : ''}">
                      ${t.bono ? '<p class="etiqueta-bono">Bono (opcional)</p>' : ''}
                      <h3><span class="tarea__num">${t.bono ? '+' : i + 1}</span><span class="tarea__titulo">${escapar(t.titulo)}</span><span class="tarea__puntos">${t.bono ? `+${t.puntos} de bono` : `${t.puntos} pts`}</span></h3>
                      <div class="tarea__html">${t.html}</div>
                      ${LAB.pistas && t.pista ? `<details class="tarea__pista"><summary>¿Dónde se hace?</summary><div>${t.pista}</div></details>` : ''}
                    </li>`
                  )
                  .join('')}
              </ol>
            </section>
            <section role="tabpanel" id="tp-datos" aria-labelledby="tab-datos" data-panel="datos">
              <p class="sutil">Estos datos son <strong>solo tuyos</strong>: salen de tu ${identidad.matricula ? 'matrícula' : 'nombre'}. Úsalos tal cual.</p>
              <dl class="datos-alumno">
                ${Object.entries(datos)
                  .sort(([a], [b]) => ordenDato(a) - ordenDato(b))
                  .filter(([k, v]) => !OCULTOS.has(k) && (typeof v === 'string' || typeof v === 'number'))
                  .map(([k, v]) => {
                    const [etiqueta, ayuda] = ETIQUETAS_DATOS[k] ?? [k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()), ''];
                    return `<div class="dato">
                      <dt>${escapar(etiqueta)}</dt>
                      <dd><code>${escapar(v)}</code><button type="button" class="boton boton--chico boton--sutil" data-copiar="${escapar(v)}" aria-label="Copiar ${escapar(etiqueta)}">${icono('i-copiar')}<span>Copiar</span></button></dd>
                      ${ayuda ? `<p class="dato__ayuda">${ayuda}</p>` : ''}
                    </div>`;
                  })
                  .join('')}
              </dl>
              <p class="sutil">Tu cuenta: ${escapar(identidad.nombre)}${identidad.matricula ? ` · ${escapar(identidad.matricula)}` : ''}</p>
            </section>
            <section role="tabpanel" id="tp-avance" aria-labelledby="tab-avance" data-panel="avance"></section>
            <section role="tabpanel" id="tp-asistente" aria-labelledby="tab-asistente" data-panel="asistente" class="asistente">
              <p class="asistente__aviso">Pregúntale como le preguntarías a un compañero con experiencia. Ve cómo va tu cuenta y te ayuda a encontrar <strong>dónde</strong> estás atorado, pero <strong>no te da la respuesta</strong>. Tu docente puede leer esta conversación.</p>
              <ol class="asistente__mensajes" id="asistente-mensajes" aria-live="polite"></ol>
              <form class="asistente__forma" id="asistente-forma">
                <label class="solo-lectores" for="asistente-texto">Tu pregunta para el asistente</label>
                <textarea id="asistente-texto" rows="3" maxlength="600" placeholder="Ej.: Ya conecté el Internet Gateway pero la página sigue sin abrir. ¿Qué más reviso?"></textarea>
                <div class="asistente__pie">
                  <span class="sutil" id="asistente-quedan"></span>
                  <button class="boton boton--primario boton--chico" type="submit" id="asistente-enviar">Preguntar</button>
                </div>
              </form>
            </section>
          </div>
          <footer class="lab__pie">
            <button type="button" class="enlace-peligro" id="btn-reiniciar">Reiniciar mi cuenta</button>
          </footer>
        </aside>
      </div>
    </div>`;

  const $ = (id) => document.getElementById(id);
  const lab = $('lab');

  function mostrarPestana(nombre) {
    pestana = nombre;
    lab.querySelectorAll('[data-pestana]').forEach((b) => {
      b.setAttribute('aria-selected', String(b.dataset.pestana === nombre));
      b.tabIndex = b.dataset.pestana === nombre ? 0 : -1;
    });
    lab.querySelectorAll('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== nombre));
  }
  lab.querySelector('.pestanas-lab').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pestana]');
    if (b) mostrarPestana(b.dataset.pestana);
  });
  lab.querySelector('.pestanas-lab').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const visibles = [...lab.querySelectorAll('[data-pestana]:not([hidden])')];
    const i = visibles.findIndex((b) => b.dataset.pestana === pestana);
    const otro = visibles[(i + (e.key === 'ArrowRight' ? 1 : -1) + visibles.length) % visibles.length];
    mostrarPestana(otro.dataset.pestana);
    otro.focus();
  });
  mostrarPestana(pestana);

  // Cada bloque de código de las instrucciones (el user data) trae su «Copiar».
  lab.querySelectorAll('.lab__panel pre.lab-codigo').forEach((pre) => {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'lab-codigo__copiar';
    boton.innerHTML = `${icono('i-copiar')}<span>Copiar</span>`;
    boton.setAttribute('aria-label', 'Copiar el código');
    boton.addEventListener('click', () =>
      copiar((pre.querySelector('code') ?? pre).textContent).then(() => {
        boton.querySelector('span').textContent = '¡Copiado!';
        setTimeout(() => (boton.querySelector('span').textContent = 'Copiar'), 1600);
      })
    );
    pre.prepend(boton);
  });

  lab.addEventListener('click', (e) => {
    const b = e.target.closest('[data-copiar]');
    if (!b) return;
    copiar(b.dataset.copiar).then(() => {
      const texto = b.querySelector('span');
      texto.textContent = '¡Copiado!';
      setTimeout(() => (texto.textContent = 'Copiar'), 1600);
    });
  });

  $('btn-panel').addEventListener('click', () => {
    plegado = !plegado;
    guardar(clavePanel, plegado);
    lab.classList.toggle('lab--plegado', plegado);
    $('btn-panel').setAttribute('aria-expanded', String(!plegado));
    $('btn-panel').querySelector('span').textContent = `${plegado ? 'Mostrar' : 'Ocultar'} instrucciones`;
  });
  $('btn-aviso-movil')?.addEventListener('click', () => $('aviso-movil').remove());

  /* ----------------------------------------- guardar: equipo y servidor */

  let pendiente = false;
  let espera = null;
  let enviando = false;

  const textoGuardado = (t, clase = '') => {
    const el = $('guardado');
    if (!el) return;
    el.className = `lab__guardado ${clase}`;
    el.textContent = t;
  };

  function guardarEnEquipo() {
    if (!guardar(clave, enEsteEquipo())) {
      textoGuardado('No pude guardar en este equipo', 'lab__guardado--mal');
      return false;
    }
    return true;
  }

  const cuerpoCopia = () => ({ alumno: perfil, evaluacion: ev.id, estado: cuenta, rev });

  async function enviarCopia() {
    clearTimeout(espera);
    espera = null;
    if (enviando) {
      espera = setTimeout(enviarCopia, ESPERA_COPIA_MS);
      return;
    }
    enviando = true;
    const enviada = rev;
    try {
      const r = await api('api/practica/guardar', cuerpoCopia());
      if (r.estado === 'entregada') return pintar();
      if (rev === enviada) pendiente = false;
      textoGuardado(`Guardado ${hora(new Date().toISOString())}`, 'lab__guardado--bien');
      actualizarAutorrevision(r.autorrevision);
      actualizarAsistente(r.asistente);
    } catch {
      textoGuardado('Sin conexión · guardado en este equipo', 'lab__guardado--mal');
    } finally {
      enviando = false;
    }
  }

  function alCambiar(estado) {
    cuenta = estado;
    rev += 1;
    if (intento) {
      if (guardarEnEquipo()) textoGuardado('Guardado en este equipo', 'lab__guardado--bien');
      return;
    }
    pendiente = true;
    guardarEnEquipo();
    textoGuardado('Guardando…');
    clearTimeout(espera);
    espera = setTimeout(enviarCopia, ESPERA_COPIA_MS);
  }

  // Al cerrar la pestaña (o al pasar a otra app en el teléfono) se manda lo
  // pendiente con sendBeacon, que el navegador entrega aunque la página se cierre.
  function despedida() {
    if (!pendiente) return;
    const texto = JSON.stringify(cuerpoCopia());
    let ok = false;
    try {
      ok = navigator.sendBeacon?.('api/practica/guardar', new Blob([texto], { type: 'text/plain' })) ?? false;
    } catch {
      ok = false;
    }
    if (!ok) {
      fetch('api/practica/guardar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: texto, keepalive: true }).catch(() => {});
    }
    pendiente = false;
  }
  const alOcultar = () => {
    if (document.visibilityState === 'hidden') despedida();
  };
  window.addEventListener('pagehide', despedida);
  document.addEventListener('visibilitychange', alOcultar);

  /* ------------------------------------------------------- la consola */

  let consola = null;
  function montar() {
    consola?.destruir();
    const contenedor = $('consola');
    contenedor.innerHTML = '';
    try {
      consola = montarConsola(contenedor, { estado: cuenta, alumno: { nombre: identidad.nombre, matricula: identidad.matricula }, alCambiar, soloLectura: false });
    } catch (e) {
      console.error(e);
      contenedor.innerHTML = '<p class="lab__fallo">La consola tuvo un problema al abrir. Recarga la página: tu avance está guardado.</p>';
    }
  }
  montar();

  alSalir.push(() => {
    if (pendiente) {
      fetch('api/practica/guardar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpoCopia()), keepalive: true }).catch(() => {});
    }
    clearTimeout(espera);
    window.removeEventListener('pagehide', despedida);
    document.removeEventListener('visibilitychange', alOcultar);
    consola?.destruir();
    document.body.classList.remove('modo-lab');
  });

  reloj($('reloj'), inicio, LAB.minutos || 60, (t) => aviso(t, 'reloj'));
  textoGuardado(enServidor && rev === (enServidor.rev ?? 0) ? 'Guardado' : '');
  if (!intento && rev > (enServidor?.rev ?? -1)) {
    pendiente = true;
    enviarCopia();
  }

  /* ---------------------------------------------- revisar y entregar */

  function actualizarAutorrevision(valor) {
    if (typeof valor !== 'boolean' || valor === autorrevision) return;
    autorrevision = valor;
    $('btn-revisar').hidden = !valor;
    lab.querySelector('[data-pestana="avance"]').hidden = !valor;
    if (!valor && pestana === 'avance') mostrarPestana('tareas');
  }

  /* ------------------------------------------------------- el asistente */

  // Las respuestas llegan como texto: se escapa todo y solo se respetan los
  // `nombres de la consola` entre comillas invertidas y los saltos de línea.
  const textoAsistente = (t) =>
    escapar(t)
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');

  function pintarAsistente({ pensando = false } = {}) {
    if (!asistente) return;
    const lista = $('asistente-mensajes');
    lista.innerHTML =
      asistente.mensajes
        .map(
          (m) => `<li class="asistente__msg asistente__msg--${m.rol === 'alumno' ? 'alumno' : 'ia'}">
            <span class="asistente__quien">${m.rol === 'alumno' ? 'Tú' : 'Asistente'} · ${hora(m.hora)}</span>
            <p>${textoAsistente(m.texto)}</p>
          </li>`
        )
        .join('') +
      (pensando ? '<li class="asistente__msg asistente__msg--ia asistente__msg--pensando"><span class="asistente__quien">Asistente</span><p>Revisando tu cuenta…</p></li>' : '');
    if (!asistente.mensajes.length && !pensando) {
      lista.innerHTML = '<li class="asistente__vacio sutil">Cuéntale en qué tarea vas, qué intentaste y qué ves. Entre más claro, mejor te orienta.</li>';
    }
    const quedan = asistente.restantes;
    $('asistente-quedan').textContent = quedan > 0 ? `Te quedan ${quedan} de ${asistente.max} preguntas` : `Ya usaste tus ${asistente.max} preguntas`;
    const agotado = quedan <= 0;
    $('asistente-texto').disabled = agotado || pensando;
    $('asistente-enviar').disabled = agotado || pensando;
    lista.lastElementChild?.scrollIntoView({ block: 'nearest' });
  }
  pintarAsistente();

  function actualizarAsistente(valor) {
    if (!asistente || typeof valor !== 'boolean' || valor === conAsistente) return;
    conAsistente = valor;
    $('btn-asistente').hidden = !valor;
    lab.querySelector('[data-pestana="asistente"]').hidden = !valor;
    if (!valor && pestana === 'asistente') mostrarPestana('tareas');
  }

  $('btn-asistente').addEventListener('click', () => {
    if (plegado) $('btn-panel').click();
    mostrarPestana('asistente');
    $('asistente-texto').focus();
  });

  $('asistente-texto').addEventListener('keydown', (e) => {
    // Enter manda la pregunta; Shift+Enter hace un salto de línea.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $('asistente-forma').requestSubmit();
    }
  });

  $('asistente-forma').addEventListener('submit', async (e) => {
    e.preventDefault();
    const caja = $('asistente-texto');
    const pregunta = caja.value.trim();
    if (pregunta.length < 3) return caja.focus();
    const antes = asistente.mensajes;
    asistente.mensajes = [...antes, { rol: 'alumno', texto: pregunta, hora: new Date().toISOString() }];
    caja.value = '';
    pintarAsistente({ pensando: true });
    try {
      const r = await api('api/practica/asistente', { ...cuerpoCopia(), pregunta });
      pendiente = false;
      Object.assign(asistente, r.asistente);
    } catch (err) {
      asistente.mensajes = antes;
      caja.value = pregunta;
      if (err.datos?.asistente) Object.assign(asistente, err.datos.asistente);
      if (err.estado === 403) actualizarAsistente(false);
      if (err.estado === 409) return pintar();
      aviso(err.message, 'error');
    }
    pintarAsistente();
    if (!$('asistente-texto').disabled) $('asistente-texto').focus();
  });

  function pintarRevision() {
    const r = revision;
    $('tp-avance').innerHTML = r
      ? `<div class="mi-avance">
          <p class="mi-avance__cifra"><strong>${decimal(r.obtenidos)}</strong> de ${r.total} puntos</p>
          <p class="sutil">(Revisado a las ${hora(r.hora)}) <strong>Esto no es tu entrega:</strong> sigue trabajando y vuelve a revisar cuando quieras.</p>
          ${htmlTareasPractica(r.tareas, true)}
        </div>`
      : '<p class="sutil">Pulsa «Revisar mi avance» para ver qué llevas bien y qué te falta.</p>';
  }
  pintarRevision();

  $('btn-revisar').addEventListener('click', async () => {
    const boton = $('btn-revisar');
    boton.disabled = true;
    try {
      const r = await api(intento ? 'api/practica/intento/calificar' : 'api/practica/revisar', cuerpoCopia());
      pendiente = false;
      revision = { ...(intento ? r.resultado : r.revision), hora: new Date().toISOString() };
      if (plegado) $('btn-panel').click();
      pintarRevision();
      mostrarPestana('avance');
      $('tp-avance').scrollTop = 0;
    } catch (e) {
      if (e.estado === 403) actualizarAutorrevision(false);
      if (e.estado === 409) return pintar();
      aviso(e.message, 'error');
    } finally {
      boton.disabled = false;
    }
  });

  $('btn-entregar').addEventListener('click', async () => {
    const si = await confirmar(
      intento
        ? {
            titulo: '¿Calificar tu intento?',
            texto: '<p>Se califica tu cuenta tal como está ahora, para que veas cómo te fue. Tu calificación oficial no cambia.</p>',
            si: 'Sí, calificar',
            no: 'Seguir trabajando'
          }
        : {
            titulo: '¿Entregar el laboratorio?',
            texto: `<p>Se califica tu cuenta tal como está ahora. Después de entregar <strong>ya no podrás cambiar nada</strong>.</p>${
              autorrevision ? '<p>¿Ya usaste «Revisar mi avance»? Es buena idea antes de entregar.</p>' : ''
            }`,
            si: 'Sí, entregar',
            no: 'Seguir trabajando'
          }
    );
    if (!si) return;
    const boton = $('btn-entregar');
    boton.disabled = true;
    try {
      if (intento) {
        const r = await api('api/practica/intento/calificar', cuerpoCopia());
        guardar(clave, null);
        return vistaResultadoIntento(ev, 'practica', r.resultado);
      }
      const r = await api('api/practica/entregar', cuerpoCopia());
      terminar(r);
    } catch (e) {
      if (e.estado === 409 && e.datos?.resultado) return terminar(e.datos);
      aviso(e.estado === 423 ? e.message : `${e.message}. Revisa tu conexión e inténtalo otra vez: tu cuenta sigue guardada.`, 'error');
      boton.disabled = false;
    }
  });

  function terminar(r) {
    pendiente = false;
    recordarEntrega(ev.id, 'practica', r);
    guardar(clave, null);
    servidor = null;
    aviso('¡Laboratorio entregado! Aquí está tu resultado.', 'exito');
    ir(`${ev.id}/resultado`);
  }

  $('btn-reiniciar').addEventListener('click', async () => {
    const si = await confirmar({
      titulo: '¿Reiniciar tu cuenta?',
      texto: '<p>Se borra <strong>todo</strong> lo que creaste en la consola y vuelves a la cuenta del principio. El reloj no se reinicia.</p>',
      si: 'Sí, reiniciar',
      no: 'Cancelar',
      peligro: true
    });
    if (!si) return;
    const nueva = LAB.estadoInicial(datos);
    alCambiar(nueva);
    revision = null;
    pintarRevision();
    montar();
    aviso('Tu cuenta volvió a empezar.', 'info');
  });

  // En un intento ya hay entrega y no importa si la parte se cierra: nada que vigilar.
  if (!intento) alLatido = (s) => {
    const p = s.evaluaciones.find((x) => x.id === ev.id);
    if (!p) return;
    if (p.partes.practica?.entrega) return pintar();
    $('aviso-cierre').hidden = p.partes.practica?.estado === 'abierta';
    actualizarAutorrevision(p.autorrevision);
    actualizarAsistente(p.asistente);
    if (pendiente && !espera) enviarCopia();
  };
}

/* ------------------------------------------------- intentos de práctica */

// En los simulacros, después de entregar una parte se puede repetir para
// practicar. La entrega (lo que ve el docente) no cambia: el intento vive en
// este equipo y el servidor solo lo califica.
const claveIntento = (evId, parte) => `intento-${parte}-${perfil.id}-${evId}`;
const hayIntento = (evId, parte) => Boolean(leer(claveIntento(evId, parte), null));
const puedeRepetir = (ev, parte) => Boolean(ev.reintentos && ev.partes[parte]?.entrega);

async function vistaIntento(ev, parte) {
  const titulo = `${tituloParte(ev, parte)} · intento de práctica`;
  app.innerHTML = `${barra({ volver: { ruta: ev.id, texto: ev.titulo }, titulo })}<main class="pagina"><p class="cargando">${parte === 'teoria' ? 'Cargando los casos…' : 'Preparando tu cuenta de AWS simulada…'}</p></main>`;
  const pedido = location.hash;
  let datos;
  let labs;
  let consolaModulo;
  try {
    if (parte === 'practica') [labs, consolaModulo] = await Promise.all([cargarLabs(), import('./consola/consola.js')]);
    datos = await api(`api/${parte}/intento`, { alumno: perfil, evaluacion: ev.id });
  } catch (e) {
    console.error(e);
    if (location.hash === pedido) vistaError(ev, e.message);
    return;
  }
  if (location.hash !== pedido) return;
  desfase = Date.parse(datos.ahora) - Date.now();
  if (parte === 'teoria') return teoriaAbierta(ev, datos, { intento: true });
  const LAB = labs.LABS.get(ev.lab);
  if (!LAB) return vistaError(ev, 'No encontré este laboratorio');
  laboratorio(ev, LAB, labs, datos, consolaModulo.montarConsola, { intento: true });
}

/** Borra el intento a medias (si hay) y empieza uno desde cero. */
async function empezarIntento(ev, parte, { preguntar = true } = {}) {
  if (preguntar) {
    const si = await confirmar({
      titulo: `¿Repetir la ${NOMBRE_PARTE[parte].toLowerCase()}?`,
      texto: `<p>Empiezas de cero${parte === 'practica' ? ', con la cuenta de AWS del principio' : ''}. <strong>Tu calificación no cambia:</strong> cuenta solo tu primera entrega, que tu docente ya tiene.</p><p>Al terminar ves cómo te fue y puedes repetirla las veces que quieras.</p>`,
      si: 'Sí, empezar de nuevo',
      no: 'Cancelar'
    });
    if (!si) return;
  }
  guardar(claveIntento(ev.id, parte), null);
  const destino = `${ev.id}/${parte}/intento`;
  if (location.hash === `#/${destino}`) pintar();
  else ir(destino);
}

function vistaResultadoIntento(ev, parte, r) {
  for (const f of alSalir) f();
  alSalir = [];
  alLatido = null;
  document.body.classList.remove('modo-lab');
  window.scrollTo(0, 0);
  const oficial = ev.partes[parte]?.entrega;
  const detalle = (x) => (parte === 'teoria' ? `${x.aciertos} de ${x.total} aciertos` : `${decimal(x.obtenidos)} de ${x.total} puntos`);
  app.innerHTML = `
    ${barra({ volver: { ruta: ev.id, texto: ev.titulo }, titulo: `${ev.titulo} · Intento de práctica` })}
    <main class="pagina pagina--media resultado">
      <p class="etiqueta">${NOMBRE_PARTE[parte]} · intento de práctica</p>
      <h1>Así te fue en este intento</h1>
      <p class="aviso-suave">${icono('i-alerta')}<span>Este intento <strong>no cambia tu calificación</strong>: tu docente solo toma tu primera entrega.</span></p>
      <div class="marcadores">
        <div class="marcador marcador--combinada"><span class="marcador__nombre">Este intento</span><span class="marcador__cifra">${decimal(r.calificacion)}</span><span class="marcador__detalle">${detalle(r)}</span></div>
        ${oficial ? `<a class="marcador" href="#/${ev.id}/resultado"><span class="marcador__nombre">Tu entrega (la que cuenta)</span><span class="marcador__cifra">${decimal(oficial.calificacion)}</span><span class="marcador__detalle">${detalle(oficial)}</span></a>` : ''}
      </div>
      ${parte === 'teoria' ? seccionTeoria(r) : seccionPractica(r)}
      <div class="acciones">
        <button class="boton boton--primario" type="button" id="btn-otra-vez">Intentar otra vez</button>
        <a class="boton" href="#/${ev.id}/resultado">Ver mi resultado oficial</a>
      </div>
    </main>`;
  document.getElementById('btn-otra-vez').addEventListener('click', () => empezarIntento(ev, parte, { preguntar: false }));
}

/** En la página de resultados: repetir cada parte entregada, para practicar. */
function htmlIntentos(ev, partes) {
  const repetibles = partes.filter((n) => puedeRepetir(ev, n));
  if (!repetibles.length) return '';
  return `
    <section class="hoja intentos" aria-labelledby="titulo-intentos">
      <h2 id="titulo-intentos">¿Quieres practicar otra vez?</h2>
      <p>Puedes repetir ${repetibles.length > 1 ? 'cada parte' : 'esta parte'} desde cero, las veces que quieras. <strong>Tu calificación no cambia:</strong> tu docente solo toma tu primera entrega.</p>
      <div class="acciones">
        ${repetibles
          .map(
            (n) => `<button class="boton" type="button" data-intento="${n}">Repetir la ${NOMBRE_PARTE[n].toLowerCase()}</button>${
              hayIntento(ev.id, n) ? `<a class="boton boton--sutil" href="#/${ev.id}/${n}/intento">Continuar mi intento de la ${n === 'teoria' ? 'teórica' : 'práctica'}</a>` : ''
            }`
          )
          .join('')}
      </div>
    </section>`;
}

/**
 * Dónde repasar un tema: enlaces a la lámina o al paso de la Ruta AWS, en otra
 * pestaña para no perder el resultado. `bien` cambia solo el rótulo.
 */
function htmlRepaso(lista, bien) {
  if (!lista?.length) return '';
  const enlaces = lista
    .map((r) => `<a href="${RUTA_URL}#/${encodeURI(r.ruta)}" target="_blank" rel="noopener">Sesión ${r.sesion} · ${escapar(r.leccion)}${r.parte ? ` › ${escapar(r.parte)}` : ''}</a>`)
    .join(' · ');
  return `<p class="repaso">${icono('i-libro', 'icono repaso__icono')}<span><strong>${bien ? 'Lo viste en' : 'Repásalo en'}:</strong> ${enlaces}</span></p>`;
}

/**
 * Cómo se lee una tarea bono (opcional) en el resultado: sus puntos se suman
 * encima de lo requerido, sin pasar de 100, y no hacerla no es un error.
 */
function puntosTarea(t) {
  if (!t.bono) return `${decimal(t.obtenidos)} / ${t.puntos}`;
  return t.obtenidos >= t.puntos ? `+${decimal(t.obtenidos)} de bono` : `+${decimal(t.obtenidos)} de bono (de ${t.puntos} posibles)`;
}

/** El estado de la tarea en palabras: queda escrito en el resultado (y en su PDF). */
function estadoTarea(t) {
  const completa = t.puntos > 0 && t.obtenidos >= t.puntos;
  if (t.bono) return completa ? 'Bono completo' : t.obtenidos > 0 ? 'Bono parcial' : 'Bono no realizado';
  return completa ? 'Completa' : t.obtenidos > 0 ? 'Incompleta' : 'No realizada';
}

function claseTarea(t) {
  const completa = t.puntos > 0 && t.obtenidos >= t.puntos;
  if (t.bono) return `resultado-tarea--bono ${completa ? 'resultado-tarea--bien' : t.obtenidos > 0 ? 'resultado-tarea--media' : ''}`;
  return completa ? 'resultado-tarea--bien' : t.obtenidos > 0 ? 'resultado-tarea--media' : 'resultado-tarea--mal';
}

/** Lo requerido y lo del bono, por separado (solo si el laboratorio tiene bono). */
function notaBono(tareas) {
  const bonos = tareas.filter((t) => t.bono);
  if (!bonos.length) return '';
  const base = tareas.filter((t) => !t.bono).reduce((s, t) => s + t.obtenidos, 0);
  const bono = bonos.reduce((s, t) => s + t.obtenidos, 0);
  const posibles = bonos.reduce((s, t) => s + t.puntos, 0);
  return `<p class="nota-bono">Lo requerido te da <strong>${decimal(base)} de 100</strong>. ${
    bono > 0
      ? `El bono opcional suma <strong>+${decimal(bono)}</strong> de ${posibles} posibles${base + bono > 100 ? ', pero la calificación nunca pasa de 100' : ''}.`
      : `El bono opcional (hasta +${posibles}) no sumó puntos, y eso no te quita nada.`
  }</p>`;
}

// Si el alumno nunca entró a la Ruta en este equipo, la Ruta le pediría
// registrarse antes de mostrar la lámina: se le pasan los mismos datos.
document.addEventListener('click', (e) => {
  if (!e.target.closest?.('.repaso a') || !perfil || leerCrudo(PERFIL_RUTA)) return;
  try {
    localStorage.setItem(PERFIL_RUTA, JSON.stringify({ id: perfil.id, nombre: perfil.nombre, matricula: perfil.matricula, grupo: perfil.grupo }));
  } catch {
    // Sin localStorage la Ruta solo pedirá los datos otra vez.
  }
});

/** Las tareas de la rúbrica: con checks y retro, o solo puntos por tarea. */
function htmlTareasPractica(tareas, conChecks) {
  return `${notaBono(tareas)}<ol class="resultado-tareas">${tareas
    .map((t) => {
      const pct = t.puntos ? Math.round((t.obtenidos / t.puntos) * 100) : 0;
      return `<li class="resultado-tarea ${claseTarea(t)}">
        ${t.bono ? '<p class="etiqueta-bono">Bono (opcional)</p>' : ''}
        <div class="resultado-tarea__cabeza">
          <h3>${escapar(t.titulo)}</h3>
          <span class="resultado-tarea__estado">${estadoTarea(t)}</span>
          <span class="resultado-tarea__puntos">${puntosTarea(t)}</span>
        </div>
        <div class="progreso" aria-hidden="true"><span style="width:${pct}%"></span></div>
        ${
          conChecks && t.checks?.length
            ? `<ul class="checks">${t.checks
                .map(
                  (c) => `<li class="check ${c.ok ? 'check--bien' : t.bono ? 'check--bono' : 'check--mal'}">
                    ${icono(c.ok ? 'i-check' : 'i-x', 'icono check__icono')}
                    <div><p class="check__texto"><span class="check__estado">${c.ok ? 'Cumplido: ' : t.bono ? 'Bono sin hacer: ' : 'No cumplido: '}</span>${escapar(c.texto)} <span class="check__puntos">${t.bono ? '+' : ''}${c.ok ? c.puntos : 0}/${c.puntos}</span></p>
                    ${c.retro ? `<p class="check__retro">${escapar(c.retro)}</p>` : ''}
                    ${htmlRepaso(c.repaso, c.ok)}</div>
                  </li>`
                )
                .join('')}</ul>`
            : ''
        }
      </li>`;
    })
    .join('')}</ol>`;
}

/* ------------------------------------------------------------ resultado */

async function vistaResultado(ev) {
  app.innerHTML = `${barra({ volver: { ruta: ev.id, texto: ev.titulo }, titulo: `${ev.titulo} · Resultado` })}<main class="pagina"><p class="cargando">Cargando tu resultado…</p></main>`;
  const pedido = location.hash;
  let datos;
  try {
    datos = await api(`api/resultado?a=${encodeURIComponent(perfil.id)}&evaluacion=${encodeURIComponent(ev.id)}`);
  } catch {
    // Sin servidor: se muestra lo que quedó guardado en este equipo.
    datos = { evaluacion: ev, offline: true };
    for (const parte of ['teoria', 'practica']) {
      const r = leer(claveResultado(ev.id, parte), null);
      datos[parte] = r ? { resultado: r } : null;
    }
  }
  if (location.hash !== pedido) return;
  for (const parte of ['teoria', 'practica']) if (datos[parte]) recordarEntrega(ev.id, parte, datos[parte]);
  const e = datos.evaluacion ?? ev;
  const t = datos.teoria?.resultado;
  const p = datos.practica?.resultado;

  if (!t && !p) {
    app.innerHTML = `
      ${barra({ volver: { ruta: ev.id, texto: ev.titulo }, titulo: `${ev.titulo} · Resultado` })}
      <main class="pagina pagina--angosta"><div class="hoja"><h1>Todavía no entregas</h1><p>Cuando entregues una parte, aquí verás tu calificación.</p><a class="boton" href="#/${ev.id}">Volver</a></div></main>`;
    return;
  }

  const partes = Object.keys(e.pesos);
  const combinada = e.combinada ?? null;
  app.innerHTML = `
    ${barra({ volver: { ruta: ev.id, texto: ev.titulo }, titulo: `${ev.titulo} · Resultado` })}
    <main class="pagina pagina--media resultado">
      <p class="etiqueta">${escapar(ev.titulo)} · ${escapar(ev.fechaTexto)}</p>
      <h1>Tu resultado, ${escapar(nombreCorto(perfil.nombre))}</h1>
      ${datos.offline ? '<p class="aviso-suave">Sin conexión: te muestro lo que quedó guardado en este equipo.</p>' : ''}
      <div class="marcadores">
        ${partes.length > 1 ? `<div class="marcador marcador--combinada"><span class="marcador__nombre">Combinada</span><span class="marcador__cifra">${combinada === null ? '—' : decimal(combinada / 10)}</span><span class="marcador__detalle">${combinada === null ? 'cuando entregues las dos partes' : partes.map((n) => `${e.pesos[n]} % ${n === 'teoria' ? 'teórica' : 'práctica'}`).join(' + ')}</span></div>` : ''}
        ${partes
          .map((n) => {
            const r = n === 'teoria' ? t : p;
            return `<a class="marcador" href="#${n === 'teoria' ? 'res-teoria' : 'res-practica'}">
              <span class="marcador__nombre">${NOMBRE_PARTE[n]}</span>
              <span class="marcador__cifra">${r ? decimal(r.calificacion) : '—'}</span>
              <span class="marcador__detalle">${r ? (n === 'teoria' ? `${r.aciertos} de ${r.total} aciertos` : `${decimal(r.obtenidos)} de ${r.total} puntos`) : 'sin entregar'}</span>
            </a>`;
          })
          .join('')}
      </div>
      ${t ? seccionTeoria(t) : ''}
      ${p ? seccionPractica(p) : ''}
      <section class="hoja comprobante" aria-labelledby="titulo-comprobante">
        <h2 id="titulo-comprobante">Comprobante de entrega</h2>
        <dl>
          <div><dt>Nombre</dt><dd>${escapar((t ?? p).nombre)}</dd></div>
          <div><dt>Matrícula</dt><dd>${escapar((t ?? p).matricula || '—')}</dd></div>
          <div><dt>Grupo</dt><dd>${escapar((t ?? p).grupo)}</dd></div>
          ${t ? `<div><dt>Teórica</dt><dd>folio <span class="mono">${escapar(t.folio)}</span> · ${escapar(fechaHora(t.fin))}</dd></div>` : ''}
          ${p ? `<div><dt>Práctica</dt><dd>folio <span class="mono">${escapar(p.folio)}</span> · ${escapar(fechaHora(p.fin))}</dd></div>` : ''}
        </dl>
        <p class="sutil">Guárdalo en PDF o tómale captura a esta pantalla: es tu comprobante. Este equipo también guarda una copia firmada por si el servidor se reinicia.</p>
      </section>
      ${datos.offline ? '' : htmlIntentos(e, partes)}
      <div class="acciones"><button class="boton boton--oscuro" type="button" id="btn-imprimir">Imprimir o guardar en PDF</button><a class="boton" href="#/${ev.id}">Volver a ${escapar(ev.titulo)}</a><a class="boton boton--sutil" href="#/">Mis evaluaciones</a></div>
    </main>`;
  app.querySelector('#btn-imprimir').addEventListener('click', () => window.print());
  app.querySelector('.intentos')?.addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-intento]');
    if (boton) empezarIntento(e, boton.dataset.intento);
  });
}

function barras(lista, etiqueta) {
  return lista
    .map((x) => {
      const pct = x.total ? Math.round((x.aciertos / x.total) * 100) : 0;
      return `<div class="barra-tema ${pct < 60 ? 'barra-tema--debil' : ''}">
        <span class="barra-tema__nombre">${escapar(etiqueta(x))}</span><span class="barra-tema__valor">${x.aciertos}/${x.total}</span>
        <div class="progreso" aria-hidden="true"><span style="width:${pct}%"></span></div>
      </div>`;
    })
    .join('');
}

function seccionTeoria(r) {
  return `
    <section class="seccion-resultado" id="res-teoria" aria-labelledby="h-teoria">
      <h2 id="h-teoria">Parte teórica <span class="seccion-resultado__cifra">${r.aciertos}/${r.total} · ${porciento(r.porcentaje)}</span></h2>
      <div class="rejilla-2">
        ${r.porTema?.length ? `<div class="hoja"><h3>Por tema</h3>${barras(r.porTema, (x) => x.tema)}</div>` : ''}
        ${r.porCaso?.length ? `<div class="hoja"><h3>Por caso</h3>${barras(r.porCaso, (x) => x.empresa || x.titulo)}</div>` : ''}
      </div>
      ${
        r.detalle
          ? `<h3>Pregunta por pregunta</h3>
            <ol class="detalle-teoria">${r.detalle
              .map(
                (d) => `<li class="detalle ${d.acerto ? 'detalle--bien' : 'detalle--mal'}">
                  <p class="detalle__pregunta">${icono(d.acerto ? 'i-check' : 'i-x', 'icono detalle__icono')}<span><span class="solo-lectores">${d.acerto ? 'Correcta. ' : 'Incorrecta. '}</span>${escapar(d.texto)}</span></p>
                  <div class="detalle__respuesta ${d.acerto ? 'detalle__respuesta--bien' : 'detalle__respuesta--mal'}">
                    <p class="detalle__titulo">Tu respuesta${d.acerto ? ' · correcta' : ''}</p>
                    <p>${d.elegida ? escapar(d.elegida.texto) : '<em>No la contestaste.</em>'}</p>
                    ${d.elegida?.retro ? `<p class="detalle__retro">${escapar(d.elegida.retro)}</p>` : ''}
                  </div>
                  ${
                    d.acerto
                      ? ''
                      : `<div class="detalle__respuesta detalle__respuesta--bien">
                    <p class="detalle__titulo">Respuesta correcta</p>
                    <p>${escapar(d.correcta.texto)}</p>
                    ${d.correcta.retro ? `<p class="detalle__retro">${escapar(d.correcta.retro)}</p>` : ''}
                  </div>`
                  }
                  ${htmlRepaso(d.repaso, d.acerto)}
                </li>`
              )
              .join('')}</ol>`
          : '<p class="sutil">Tu docente revisará las respuestas en clase.</p>'
      }
    </section>`;
}

function seccionPractica(r) {
  const conChecks = r.tareas.some((t) => t.checks);
  return `
    <section class="seccion-resultado" id="res-practica" aria-labelledby="h-practica">
      <h2 id="h-practica">Parte práctica <span class="seccion-resultado__cifra">${decimal(r.obtenidos)}/${r.total} · ${porciento(r.porcentaje)}</span></h2>
      ${htmlTareasPractica(r.tareas, conChecks)}
      ${conChecks ? '' : '<p class="sutil">Tu docente revisará el detalle de cada tarea en clase.</p>'}
    </section>`;
}

/* ---------------------------------------------------------------- arranque */

pintar();
