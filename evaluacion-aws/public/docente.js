// Panel del docente de la evaluación: abrir y cerrar cada parte, cómo va
// cada alumno en vivo, el detalle de uno (respuestas, rúbrica, su cuenta en
// la consola en solo lectura y su bitácora) y lo que más costó al grupo.
// El selector agrupa por tipo (laboratorios de sesión, prácticas, final y las
// de octubre) y trae el «Resumen del simulador»: cómo va el grupo en todos
// los laboratorios a la vez.
//
// Se refresca solo cada 5 segundos. Está pensado para abrirse en el celular
// o la laptop del docente mientras el grupo trabaja.

const PREFIJO = 'evaluacion-aws:';
const APROBATORIO = 60;
const $ = (id) => document.getElementById(id);

const escapar = (t) =>
  String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icono = (id, clase = 'icono') => `<svg class="${clase}" aria-hidden="true"><use href="#${id}"></use></svg>`;
const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '');
const decimal = (n) => Number(n).toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const porciento = (n) => `${Number(n).toLocaleString('es-MX', { maximumFractionDigits: 1 })} %`;
const NOMBRE_PARTE = { teoria: 'Parte teórica', practica: 'Parte práctica' };
// La opción del selector que no es una evaluación: el resumen de todo el simulador.
const RESUMEN = 'simulador';
const TIPOS = [
  ['laboratorio', 'Laboratorios de sesión'],
  ['practica', 'Prácticas integradoras'],
  ['final', 'Examen final'],
  ['evaluacion', 'Evaluaciones de octubre']
];
const tipoDe = (ev) => (TIPOS.some(([t]) => t === ev?.tipo) ? ev.tipo : 'evaluacion');
/** Un laboratorio de sesión o una práctica solo tiene la parte práctica: se le dice «laboratorio». */
const soloLab = (ev) => tipoDe(ev) !== 'evaluacion' && !ev.partes.includes('teoria');
const nombreParte = (ev, p) => (p === 'practica' && soloLab(ev) ? 'Laboratorio' : NOMBRE_PARTE[p]);
const enPreparacion = (ev) => !ev.partes.some((p) => ev.disponible[p]);

function memoria(tipo) {
  try {
    return window[tipo];
  } catch {
    return null;
  }
}
const sesion = memoria('sessionStorage');
const leer = (clave) => {
  try {
    return sesion?.getItem(clave) ?? null;
  } catch {
    return null;
  }
};
const escribir = (clave, valor) => {
  try {
    if (valor === null) sesion?.removeItem(clave);
    else sesion?.setItem(clave, valor);
  } catch {
    /* sin almacenamiento: solo se pierde la comodidad */
  }
};

// Misma llave que los otros paneles: en la plataforma, entrar a uno te deja
// entrar a los demás sin volver a escribir la clave.
let clave = leer('clave-docente') || '';
let evaluaciones = [];
// El tablero de la plataforma abre una evaluación con docente.html#<id> (o
// #simulador para el resumen): esa gana sobre la última elegida.
const pedidaEnLiga = () => {
  try {
    return decodeURIComponent(location.hash.slice(1));
  } catch {
    return '';
  }
};
let evId = pedidaEnLiga() || leer(PREFIJO + 'evaluacion-panel') || '';
let datos = null;

/** Confirmación dentro de la página (no `confirm()`). Devuelve true o false. */
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

/* ------------------------------------------------------------------ entrar */

async function entrar(valor) {
  const r = await fetch('api/docente/entrar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clave: valor })
  });
  if (!r.ok) throw new Error('Clave incorrecta');
  const info = await r.json();
  clave = valor;
  escribir('clave-docente', valor);
  evaluaciones = info.evaluaciones;
  if (evId !== RESUMEN && !evaluaciones.some((e) => e.id === evId)) evId = porOmision();
  // El selector, agrupado por tipo; las que siguen en preparación lo dicen.
  $('evaluacion').innerHTML =
    `<optgroup label="Simulador AWS"><option value="${RESUMEN}">Resumen del simulador (todos los laboratorios)</option></optgroup>` +
    TIPOS.map(([tipo, nombre]) => {
      const delTipo = evaluaciones.filter((e) => tipoDe(e) === tipo);
      if (!delTipo.length) return '';
      return `<optgroup label="${escapar(nombre)}">${delTipo
        .map((e) => `<option value="${e.id}">${escapar(e.titulo)}${tipo === 'evaluacion' ? ` · ${escapar(e.fechaTexto)}` : ''}${enPreparacion(e) ? ' · en preparación' : ''}</option>`)
        .join('')}</optgroup>`;
    }).join('');
  $('evaluacion').value = evId;
  $('aviso-clave').hidden = !info.claveInsegura;
  $('pantalla-clave').hidden = true;
  $('pantalla-panel').hidden = false;
  await cargar();
}

/**
 * Sin elección previa: lo que tenga una parte abierta y lista, empezando por
 * lo más reciente del curso (el final, la última práctica abierta…); si no
 * hay nada abierto, la próxima por fecha, y si no, el resumen del simulador.
 */
function porOmision() {
  const abierta = (e) => e.partes.some((p) => e[p]?.abierta && e.disponible[p]);
  const nuevas = evaluaciones.filter((e) => tipoDe(e) !== 'evaluacion');
  const hoy = new Date().toLocaleDateString('en-CA');
  return (
    [...nuevas].reverse().find((e) => tipoDe(e) !== 'laboratorio' && abierta(e))?.id ??
    nuevas.find(abierta)?.id ??
    evaluaciones.find((e) => e.fecha && e.fecha >= hoy)?.id ??
    RESUMEN
  );
}

$('btn-entrar').addEventListener('click', async () => {
  $('error-clave').textContent = '';
  try {
    await entrar($('clave').value);
  } catch (e) {
    $('error-clave').textContent = e.message;
  }
});
$('clave').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('btn-entrar').click();
});
if (clave) entrar(clave).catch(() => escribir('clave-docente', null));

// En la plataforma (/m/<módulo>/), la liga de arriba regresa al tablero
// docente (/docente). Suelto, con `node server.js`, no hay tablero: se esconde.
const BASE_PLATAFORMA = location.pathname.includes('/m/') ? location.pathname.slice(0, location.pathname.indexOf('/m/')) : null;
if (BASE_PLATAFORMA !== null) {
  $('liga-tablero').href = `${BASE_PLATAFORMA}/docente`;
  $('liga-tablero').hidden = false;
}

/* ------------------------------------------------------------------- datos */

async function llamar(ruta, opciones = {}) {
  const r = await fetch(ruta, { ...opciones, headers: { ...opciones.headers, 'x-clave-docente': clave } });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(cuerpo.error || `Error ${r.status}`), { estado: r.status });
  return cuerpo;
}

async function cargar() {
  try {
    const pedida = evId;
    const grupo = encodeURIComponent($('grupo').value);
    const nuevos = await llamar(pedida === RESUMEN ? `api/docente/simulador?grupo=${grupo}` : `api/docente/resumen?evaluacion=${encodeURIComponent(pedida)}&grupo=${grupo}`);
    if (pedida !== evId) return; // cambió de evaluación mientras llegaba
    datos = nuevos;
    $('error-panel').textContent = '';
    if (pedida === RESUMEN) pintarResumen();
    else pintarTodo();
  } catch (e) {
    $('error-panel').textContent =
      e.estado === 401 ? 'La clave cambió o expiró. Recarga la página y vuelve a entrar.' : 'Se perdió la conexión con el servidor. Reintento en unos segundos.';
  }
}

$('grupo').addEventListener('change', cargar);
$('evaluacion').addEventListener('change', () => {
  evId = $('evaluacion').value;
  // Ya eligió otra: la liga con la que llegó no debe volver a mandar al recargar.
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  escribir(PREFIJO + 'evaluacion-panel', evId);
  datos = null;
  ultimoControl = '';
  $('control').innerHTML = '<p class="cargando">Cargando…</p>';
  $('vista-simulador').innerHTML = '<p class="cargando">Cargando…</p>';
  mostrarVista();
  cargar();
});

// Con el panel abierto, otra liga del tablero (#<id>) cambia de evaluación.
window.addEventListener('hashchange', () => {
  const pedida = pedidaEnLiga();
  if (!evaluaciones.length || !pedida || pedida === evId) return;
  if (pedida !== RESUMEN && !evaluaciones.some((e) => e.id === pedida)) return;
  $('evaluacion').value = pedida;
  $('evaluacion').dispatchEvent(new Event('change'));
});

/** El resumen del simulador y una evaluación usan zonas distintas de la página. */
function mostrarVista() {
  $('vista-evaluacion').hidden = evId === RESUMEN;
  $('vista-simulador').hidden = evId !== RESUMEN;
}

setInterval(() => {
  if (clave && !$('pantalla-panel').hidden && !document.hidden) cargar();
}, 5000);
setInterval(() => {
  if (datos?.generado) $('actualizado').textContent = `Actualizado a las ${new Date(datos.generado).toLocaleTimeString('es-MX')}`;
}, 1000);

function pintarGrupos() {
  const actual = $('grupo').value;
  $('grupo').innerHTML =
    '<option value="">Todos</option>' + datos.grupos.map((g) => `<option value="${escapar(g)}" ${g === actual ? 'selected' : ''}>${escapar(g)}</option>`).join('');
}

function pintarTodo() {
  mostrarVista();
  pintarGrupos();
  $('titulo-panel').textContent = datos.evaluacion.titulo;
  pintarControl();
  pintarMetricas();
  pintarTabla();
  pintarEstadisticas();
}

/* ------------------------------------------------------------- el control */

let ultimoControl = '';

function pintarControl() {
  const ev = datos.evaluacion;
  const firma = JSON.stringify([ev, datos.conteos]);
  if (firma === ultimoControl) return; // no se repinta si nada cambió: no se pierde el foco
  ultimoControl = firma;
  const enfocado = document.activeElement?.closest?.('#control [data-foco]')?.dataset.foco;

  const pesos = Object.entries(ev.pesos)
    .map(([p, peso]) => `${peso} % ${p === 'teoria' ? 'teórica' : 'práctica'}`)
    .join(' + ');
  const parte = (p) => {
    const abierta = ev[p].abierta;
    const listo = ev.disponible[p];
    const c = datos.conteos[p];
    const nombre = nombreParte(ev, p);
    return `
      <div class="control__parte">
        <h3>${nombre}</h3>
        <button type="button" class="interruptor" role="switch" aria-checked="${abierta}" aria-label="Abrir ${nombre.toLowerCase()}" data-parte="${p}" data-foco="parte-${p}">
          <span class="interruptor__riel" aria-hidden="true"></span>
          <span class="interruptor__texto">
            <strong>${abierta ? `${nombre} ${nombre === 'Laboratorio' ? 'abierto' : 'abierta'}` : `Abrir ${nombre === 'Laboratorio' ? 'el laboratorio' : nombre.toLowerCase()}`}</strong>
            <small>${
              nombre === 'Laboratorio'
                ? abierta ? 'Los alumnos ya pueden entrar · toca para cerrarlo' : 'Cerrado: los alumnos ven el candado'
                : abierta ? 'Los alumnos ya pueden entrar · toca para cerrarla' : 'Cerrada: los alumnos ven el candado'
            }</small>
          </span>
        </button>
        ${
          listo
            ? ''
            : `<p class="aviso-suave">${icono('i-alerta')} <span>En preparación: todavía no hay ${p === 'teoria' ? 'banco de preguntas' : 'rúbrica o laboratorio'}. Aunque la abras, los alumnos verán «En preparación».</span></p>`
        }
        <p class="control__conteo"><b>${c.empezaron}</b> empezaron · <b>${c.enCurso}</b> en curso · <b>${c.entregaron}</b> entregaron · de <b>${datos.conteos.registrados}</b> registrados</p>
        <p class="sutil" style="margin:0">${
          p === 'teoria'
            ? `${ev.preguntas ?? '—'} preguntas · ${ev.minutosTeoria ?? 45} minutos (el reloj solo avisa)`
            : `Laboratorio en la consola simulada · máximo ${ev.minutosPractica ?? 60} minutos (el reloj solo avisa)${
                tipoDe(ev) !== 'evaluacion' && ev.reintentos ? ' · después de entregar, el alumno puede repetirlo para practicar (no cambia su entrega)' : ''
              }`
        }</p>
      </div>`;
  };

  $('control').innerHTML = `
    <div class="control__cabeza">
      <h2>${escapar(ev.titulo)}</h2>
      <p>${escapar(ev.fechaTexto)}${ev.partes.length > 1 ? ` · calificación combinada: ${pesos}` : ''}</p>
    </div>
    ${
      tipoDe(ev) === 'laboratorio'
        ? '<p class="control__nota">Laboratorio de sesión: arranca abierto para que cada alumno elija hacerlo aquí o en DataCamp. Aquí ves solo a quienes lo hacen en el simulador.</p>'
        : ''
    }
    <div class="control__partes">${ev.partes.map(parte).join('')}</div>
    <div class="control__ajustes">
      <div class="ajuste">
        <span class="ajuste__nombre" id="et-retro">Retroalimentación al entregar</span>
        <div class="segmentado" role="group" aria-labelledby="et-retro">
          <button type="button" data-retro="completa" data-foco="retro-completa" aria-pressed="${ev.retro === 'completa'}">Completa</button>
          <button type="button" data-retro="calificacion" data-foco="retro-calificacion" aria-pressed="${ev.retro === 'calificacion'}">Solo calificación</button>
        </div>
        <p class="ajuste__ayuda">Completa: cada pregunta y cada punto del laboratorio con su explicación. Solo calificación: aciertos y puntos por tema y por tarea. Si cambias a completa después, quien regrese a su resultado ya la ve.</p>
      </div>
      ${
        ev.partes.includes('practica')
          ? `<div class="ajuste">
        <span class="ajuste__nombre" id="et-auto">«Revisar mi avance» en el laboratorio</span>
        <div class="segmentado" role="group" aria-labelledby="et-auto">
          <button type="button" data-auto="true" data-foco="auto-si" aria-pressed="${ev.autorrevision}">Sí</button>
          <button type="button" data-auto="false" data-foco="auto-no" aria-pressed="${!ev.autorrevision}">No</button>
        </div>
        <p class="ajuste__ayuda">Con «Sí», el alumno ve qué lleva bien y qué le falta antes de entregar.</p>
      </div>
      <div class="ajuste">
        <span class="ajuste__nombre" id="et-asistente">Asistente de IA en el laboratorio</span>
        <div class="segmentado" role="group" aria-labelledby="et-asistente">
          <button type="button" data-asistente="true" data-foco="asis-si" aria-pressed="${ev.asistente}">Sí</button>
          <button type="button" data-asistente="false" data-foco="asis-no" aria-pressed="${!ev.asistente}">No</button>
        </div>
        <p class="ajuste__ayuda">Con «Sí», cada alumno puede hacerle hasta ${ev.maxPreguntasAsistente} preguntas a un asistente que ve su cuenta y lo orienta sin darle la respuesta. Lees cada conversación en «Ver».${
          ev.asistenteListo ? '' : ' <strong>Falta la llave ANTHROPIC_API_KEY en el servidor: aunque esté en «Sí», los alumnos no lo ven.</strong>'
        }</p>
      </div>`
          : ''
      }
    </div>
    <p class="error" id="error-control" role="alert" style="margin:0;padding:0 20px 12px"></p>`;
  if (enfocado) $('control').querySelector(`[data-foco="${enfocado}"]`)?.focus();
}

async function cambiar(cambios) {
  $('error-control') && ($('error-control').textContent = '');
  try {
    const r = await llamar('api/docente/evaluacion', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evaluacion: evId, ...cambios })
    });
    // El cambio ya quedó en el servidor: se pinta aunque falle la recarga.
    if (datos?.evaluacion.id === r.evaluacion.id) {
      datos.evaluacion = r.evaluacion;
      pintarControl();
    }
    await cargar();
  } catch (e) {
    const el = $('error-control');
    if (el) el.textContent = `No se pudo guardar el cambio: ${e.estado === 401 ? 'la clave ya no es válida; recarga la página' : e.message}.`;
  }
}

$('control').addEventListener('click', async (e) => {
  if (!datos) return;
  const ev = datos.evaluacion;
  const interruptor = e.target.closest('[data-parte]');
  if (interruptor) {
    const p = interruptor.dataset.parte;
    const abrir = !ev[p].abierta;
    if (!abrir) {
      const c = datos.conteos[p];
      const si = await confirmar({
        titulo: `¿Cerrar ${nombreParte(ev, p) === 'Laboratorio' ? 'el laboratorio' : `la ${NOMBRE_PARTE[p].toLowerCase()}`}?`,
        texto: `<p>${c.enCurso ? `<strong>${c.enCurso} alumno${c.enCurso === 1 ? ' la está' : 's la están'} contestando.</strong> ` : ''}Quien no haya entregado ya no podrá hacerlo (su avance se queda guardado). Puedes volver a abrirla después.</p>`,
        si: 'Sí, cerrarla',
        no: 'Dejarla abierta',
        peligro: true
      });
      if (!si) return;
    }
    interruptor.disabled = true;
    await cambiar({ [p]: abrir });
    return;
  }
  const retro = e.target.closest('[data-retro]')?.dataset.retro;
  if (retro && retro !== ev.retro) return cambiar({ retro });
  const auto = e.target.closest('[data-auto]')?.dataset.auto;
  if (auto !== undefined && (auto === 'true') !== ev.autorrevision) return cambiar({ autorrevision: auto === 'true' });
  const asis = e.target.closest('[data-asistente]')?.dataset.asistente;
  if (asis !== undefined && (asis === 'true') !== ev.asistente) return cambiar({ asistente: asis === 'true' });
});

/* ------------------------------------------------------------- métricas */

function pintarMetricas() {
  const { conteos, estadisticas: s, evaluacion: ev } = datos;
  const caja = (b, texto) => `<div class="metrica"><b>${b}</b><span>${texto}</span></div>`;
  $('metricas').innerHTML = [
    caja(conteos.registrados, 'registrados'),
    caja(conteos.activos, 'conectados ahora'),
    ev.partes.includes('teoria') ? caja(conteos.teoria.entregaron, 'entregaron la teórica') : '',
    ev.partes.includes('teoria') && s.teoria?.entregadas ? caja(porciento(s.teoria.promedio), 'promedio teórica') : '',
    caja(conteos.practica.entregaron, soloLab(ev) ? 'entregaron el laboratorio' : 'entregaron la práctica'),
    s.practica?.entregadas ? caja(porciento(s.practica.promedio), soloLab(ev) ? 'promedio del laboratorio' : 'promedio práctica') : '',
    ev.partes.length > 1 && s.combinada.entregadas ? caja(decimal(s.combinada.promedio / 10), `combinada promedio (${s.combinada.entregadas})`) : ''
  ].join('');
}

/* ---------------------------------------------------------------- tabla */

function celdaTeoria(t) {
  if (!t) return '';
  if (t.estado === 'sin-empezar') return '<span class="estado-celda estado-celda--sin">Sin empezar</span>';
  if (t.estado === 'en-curso') return `<span class="estado-celda estado-celda--curso">En curso · ${t.minutos} min</span>`;
  return `<span class="estado-celda ${t.porcentaje < APROBATORIO ? 'estado-celda--debil' : 'estado-celda--entregada'}">${icono('i-check')} ${t.aciertos}/${t.total} · ${porciento(t.porcentaje)}</span>${t.restaurada ? ' <small title="Repuesta desde el comprobante del alumno">↺</small>' : ''}`;
}

function celdaPractica(p) {
  if (!p) return '';
  if (p.estado === 'sin-empezar') return '<span class="estado-celda estado-celda--sin">Sin empezar</span>';
  if (p.estado === 'en-curso') {
    const tareas = p.tareasTotal ? ` · ${p.tareasLogradas} de ${p.tareasTotal} tareas · ${decimal(p.obtenidos)} pts` : '';
    return `<span class="estado-celda estado-celda--curso">En curso · ${p.minutos} min${tareas}</span>${preguntasCelda(p)}`;
  }
  return `<span class="estado-celda ${p.porcentaje < APROBATORIO ? 'estado-celda--debil' : 'estado-celda--entregada'}">${icono('i-check')} ${decimal(p.obtenidos)}/${p.total} · ${p.tareasLogradas} de ${p.tareasTotal} tareas</span>${p.restaurada ? ' <small title="Repuesta desde el comprobante del alumno">↺</small>' : ''}${preguntasCelda(p)}`;
}

const preguntasCelda = (p) => (p.preguntas ? ` <small class="sutil" title="Preguntas al asistente de IA">· ${p.preguntas} al asistente</small>` : '');

function pintarTabla() {
  const ev = datos.evaluacion;
  const conTeoria = ev.partes.includes('teoria');
  const combinada = ev.partes.length > 1;
  $('cabeza-tabla').innerHTML = `<tr>
    <th scope="col">Alumno</th><th scope="col">Matrícula</th><th scope="col">Grupo</th>
    ${conTeoria ? '<th scope="col">Teórica</th>' : ''}
    <th scope="col">${soloLab(ev) ? 'Laboratorio' : 'Práctica'}</th>
    ${combinada ? '<th scope="col" class="num">Combinada</th>' : ''}
    <th scope="col">Última señal</th><th scope="col"><span class="solo-lectores">Acciones</span></th>
  </tr>`;
  const columnas = 6 + (conTeoria ? 1 : 0) + (combinada ? 1 : 0);
  const alumnos = [...datos.alumnos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  $('tabla').innerHTML = alumnos.length
    ? alumnos
        .map(
          (a) => `<tr>
          <td><span class="punto-activo ${a.activo ? 'punto-activo--si' : ''}" title="${a.activo ? 'Conectado ahora' : 'Sin señal reciente'}"></span>${escapar(a.nombre)}</td>
          <td class="mono">${escapar(a.matricula || '—')}</td>
          <td>${escapar(a.grupo)}</td>
          ${conTeoria ? `<td>${celdaTeoria(a.teoria)}</td>` : ''}
          <td>${celdaPractica(a.practica)}</td>
          ${combinada ? `<td class="num">${a.combinada === null ? '—' : `<strong>${decimal(a.combinada / 10)}</strong>`}</td>` : ''}
          <td>${a.visto ? `${a.activo ? 'ahora' : `a las ${hora(a.visto)}`}` : '<span class="sutil">—</span>'}</td>
          <td><button class="boton boton--chico" type="button" data-ver="${escapar(a.id)}">Ver</button></td>
        </tr>`
        )
        .join('')
    : `<tr><td colspan="${columnas}">Todavía no entra nadie. ${
        tipoDe(ev) === 'evaluacion' ? 'Comparte la liga de la evaluación (en la plataforma: Evaluación AWS).' : 'Los alumnos lo abren desde la plataforma, en «Simulador AWS».'
      }</td></tr>`;
}

$('tabla').addEventListener('click', (e) => {
  const id = e.target.closest('[data-ver]')?.dataset.ver;
  if (id) abrirDetalle(id);
});

/* ------------------------------------------------- resumen del simulador */

/** Todos los laboratorios de sesión, prácticas y el final en una tabla, para ver de un vistazo. */
function pintarResumen() {
  mostrarVista();
  pintarGrupos();
  $('titulo-panel').textContent = 'Resumen del simulador';
  const estado = (ev) => {
    if (enPreparacion(ev)) return '<span class="estado-celda estado-celda--sin">En preparación</span>';
    const abiertas = ev.partes.filter((p) => ev[p].abierta);
    if (!abiertas.length) return `<span class="estado-celda estado-celda--sin">${icono('i-candado')} Cerrado</span>`;
    return `<span class="estado-celda estado-celda--curso">Abierto${ev.partes.length > 1 && abiertas.length < ev.partes.length ? ` (${abiertas.map((p) => nombreParte(ev, p).toLowerCase()).join(', ')})` : ''}</span>`;
  };
  const cifras = (c) => (c ? `<b>${c.empezaron}</b> · <b>${c.enCurso}</b> · <b>${c.entregaron}</b>` : '—');
  const promedio = (ev) => {
    const lista = ev.partes.map((p) => ev.conteos[p]?.promedio).filter((x) => typeof x === 'number');
    return lista.length ? ev.partes.map((p) => (typeof ev.conteos[p]?.promedio === 'number' ? porciento(ev.conteos[p].promedio) : '—')).join(' / ') : '—';
  };
  const filas = TIPOS.filter(([tipo]) => tipo !== 'evaluacion')
    .map(([tipo, nombre]) => {
      const lista = datos.evaluaciones.filter((ev) => tipoDe(ev) === tipo);
      if (!lista.length) return '';
      return `<tr class="tabla-panel__grupo"><th colspan="6" scope="colgroup">${escapar(nombre)}</th></tr>${lista
        .map(
          (ev) => `<tr>
            <td><strong>${escapar(ev.titulo)}</strong><br><small class="sutil">${escapar(ev.fechaTexto)}</small></td>
            <td>${estado(ev)}</td>
            <td class="num">${ev.activos ? `<span class="punto-activo punto-activo--si"></span>${ev.activos}` : '0'}</td>
            <td class="num">${ev.partes.map((p) => `${ev.partes.length > 1 ? `<small class="sutil">${p === 'teoria' ? 'teórica' : 'práctica'}</small> ` : ''}${cifras(ev.conteos[p])}`).join('<br>')}</td>
            <td class="num">${promedio(ev)}</td>
            <td><button class="boton boton--chico" type="button" data-ir="${escapar(ev.id)}">Ver ${icono('i-flecha')}</button></td>
          </tr>`
        )
        .join('')}`;
    })
    .join('');
  $('vista-simulador').innerHTML = `
    <div class="metricas">
      <div class="metrica"><b>${datos.registrados}</b><span>alumnos registrados${$('grupo').value ? ` en ${escapar($('grupo').value)}` : ''}</span></div>
      <div class="metrica"><b>${datos.evaluaciones.reduce((s, ev) => s + ev.activos, 0)}</b><span>trabajando ahora en un laboratorio</span></div>
      <div class="metrica"><b>${datos.evaluaciones.reduce((s, ev) => s + (ev.conteos.practica?.entregaron ?? 0), 0)}</b><span>laboratorios entregados</span></div>
    </div>
    <h2 class="seccion-panel">Laboratorios, prácticas y examen final <small>empezaron · en curso · entregaron · se actualiza cada 5 segundos</small></h2>
    <div class="tabla-scroll">
      <table class="tabla-panel tabla-resumen">
        <thead><tr><th scope="col">Laboratorio</th><th scope="col">Estado</th><th scope="col" class="num">Ahora</th><th scope="col" class="num">Empezaron · en curso · entregaron</th><th scope="col" class="num">Promedio</th><th scope="col"><span class="solo-lectores">Acciones</span></th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
    <p class="sutil">«Ver» abre ese laboratorio: ahí lo abres o lo cierras, ves a cada alumno en vivo y descargas el CSV y el reporte. La consola libre del simulador no se califica ni llega al servidor.</p>`;
}

$('vista-simulador').addEventListener('click', (e) => {
  const id = e.target.closest('[data-ir]')?.dataset.ir;
  if (!id) return;
  $('evaluacion').value = id;
  $('evaluacion').dispatchEvent(new Event('change'));
});

/* ---------------------------------------------------------- estadísticas */

function reparto(titulo, s) {
  const maximo = Math.max(1, ...s.distribucion.map((x) => x.alumnos));
  return `<div class="hoja">
    <h3>${titulo}</h3>
    <p class="sutil">${s.entregadas} entregas · promedio ${porciento(s.promedio)} · mediana ${porciento(s.mediana)} · ${s.aprobados} con ${s.aprobatorio} % o más</p>
    ${s.distribucion
      .map(
        (x) => `<div class="barra-panel ${x.etiqueta.startsWith('0 ') || x.etiqueta.startsWith('40') ? 'barra-panel--debil' : ''}">
        <span>${x.etiqueta} %</span><b>${x.alumnos}</b>
        <div class="progreso"><span style="width:${(x.alumnos / maximo) * 100}%"></span></div>
      </div>`
      )
      .join('')}
  </div>`;
}

function pintarEstadisticas() {
  const { teoria: t, practica: p } = datos.estadisticas;
  const tarjetas = [];
  if (t?.entregadas) {
    tarjetas.push(reparto('Reparto · parte teórica', t));
    tarjetas.push(`<div class="hoja">
      <h3>Preguntas, de la más fallada a la más acertada</h3>
      <p class="sutil">La opción más elegida dice qué confusión repasar.</p>
      <ol class="lista-estad">${t.preguntas
        .map((q) => {
          const mas = q.masElegida;
          const textoMas = mas
            ? mas.esCorrecta
              ? `La más elegida fue la correcta (${mas.veces}).`
              : `La más elegida: «${escapar(q.opciones[mas.indice])}» (${mas.veces}).`
            : '';
          return `<li class="estad ${q.porcentaje < APROBATORIO ? 'estad--debil' : ''}">
            <div class="estad__cabeza"><strong>${escapar(q.id.toUpperCase())} · ${escapar(q.texto)}</strong><span class="estad__pct">${porciento(q.porcentaje)}</span></div>
            <p class="estad__meta">${escapar(q.tema ?? '')}${q.tema ? ' · ' : ''}Correcta: «${escapar(q.opciones[q.correcta])}». ${textoMas}${q.sinContestar ? ` Sin contestar: ${q.sinContestar}.` : ''}</p>
            <div class="progreso"><span style="width:${q.porcentaje}%"></span></div>
          </li>`;
        })
        .join('')}</ol>
    </div>`);
    if (t.porTema?.length) {
      tarjetas.push(`<div class="hoja"><h3>Dominio por tema</h3>${t.porTema
        .map(
          (x) => `<div class="barra-panel ${x.porcentaje < APROBATORIO ? 'barra-panel--debil' : ''}"><span>${escapar(x.tema)}</span><b>${porciento(x.porcentaje)}</b><div class="progreso"><span style="width:${x.porcentaje}%"></span></div></div>`
        )
        .join('')}
        <h3 style="margin-top:18px">Por caso</h3>${t.porCaso
          .map(
            (x) => `<div class="barra-panel ${x.porcentaje < APROBATORIO ? 'barra-panel--debil' : ''}"><span>${escapar(x.empresa || x.titulo)}</span><b>${porciento(x.porcentaje)}</b><div class="progreso"><span style="width:${x.porcentaje}%"></span></div></div>`
          )
          .join('')}</div>`);
    }
  }
  if (p?.entregadas) {
    tarjetas.push(reparto('Reparto · parte práctica', p));
    tarjetas.push(`<div class="hoja">
      <h3>Puntos del laboratorio, del menos cumplido al más</h3>
      <p class="sutil">Lo de arriba es lo que hay que repasar en el cierre.</p>
      <ol class="lista-estad">${p.checks
        .map(
          (c) => `<li class="estad ${c.porcentaje < APROBATORIO && !c.bono ? 'estad--debil' : ''}">
          <div class="estad__cabeza"><strong>${escapar(c.texto)}</strong><span class="estad__pct">${porciento(c.porcentaje)}</span></div>
          <p class="estad__meta">${escapar(c.tareaTitulo)}${c.bono ? ' (bono opcional)' : ''} · ${c.bono ? '+' : ''}${c.puntos} pts · lo cumplieron ${c.cumplidos} de ${c.n}</p>
          <div class="progreso"><span style="width:${c.porcentaje}%"></span></div>
        </li>`
        )
        .join('')}</ol>
    </div>`);
    tarjetas.push(`<div class="hoja"><h3>Promedio por tarea</h3>${p.tareas
      .map(
        (x) => `<div class="barra-panel ${x.porcentaje < APROBATORIO && !x.bono ? 'barra-panel--debil' : ''}"><span>${x.bono ? 'Bono (opcional): ' : ''}${escapar(x.titulo)} · ${x.bono ? `+${decimal(x.promedio)} de ${x.puntos} en promedio · la hicieron completa: ${x.completas}` : `${decimal(x.promedio)} de ${x.puntos} · completa: ${x.completas}`}</span><b>${porciento(x.porcentaje)}</b><div class="progreso"><span style="width:${x.porcentaje}%"></span></div></div>`
      )
      .join('')}</div>`);
  }
  // Se conservan abiertas y en su lugar las tarjetas: solo se repinta si cambió algo.
  const html = tarjetas.length ? tarjetas.join('') : '<p class="sutil">Aparecen en cuanto llegue la primera entrega.</p>';
  if ($('estadisticas').dataset.firma !== html) {
    $('estadisticas').dataset.firma = html;
    $('estadisticas').innerHTML = html;
  }
}

/* ------------------------------------------------------------- CSV */

$('btn-csv').addEventListener('click', () => {
  window.open(
    `api/docente/datos.csv?evaluacion=${encodeURIComponent(evId)}&grupo=${encodeURIComponent($('grupo').value)}&clave=${encodeURIComponent(clave)}`,
    '_blank'
  );
});

// El reporte de evidencia se abre en otra pestaña, listo para imprimir o guardar en PDF.
$('btn-reporte').addEventListener('click', () => {
  window.open(
    `api/docente/reporte?evaluacion=${encodeURIComponent(evId)}&grupo=${encodeURIComponent($('grupo').value)}&clave=${encodeURIComponent(clave)}`,
    '_blank'
  );
});

/* ------------------------------------------------------ detalle del alumno */

let detalleId = null;
let detallePestana = 'teoria';
let consolaLectura = null;

function cerrarConsola() {
  consolaLectura?.destruir();
  consolaLectura = null;
}

$('btn-detalle-cerrar').addEventListener('click', () => $('detalle').close());
$('btn-detalle-actualizar').addEventListener('click', () => detalleId && abrirDetalle(detalleId));
$('btn-detalle-reporte').addEventListener('click', () => {
  if (!detalleId) return;
  window.open(`api/docente/reporte?evaluacion=${encodeURIComponent(evId)}&alumno=${encodeURIComponent(detalleId)}&clave=${encodeURIComponent(clave)}`, '_blank');
});
$('detalle-cuerpo').addEventListener('click', (e) => borrarDesdeDetalle(e));
$('detalle').addEventListener('close', () => {
  cerrarConsola();
  detalleId = null;
});

async function abrirDetalle(id) {
  detalleId = id;
  cerrarConsola();
  if (!$('detalle').open) $('detalle').showModal();
  $('detalle-cuerpo').innerHTML = '<p class="cargando">Cargando…</p>';
  let d;
  try {
    d = await llamar(`api/docente/detalle?evaluacion=${encodeURIComponent(evId)}&alumno=${encodeURIComponent(id)}`);
  } catch (e) {
    $('detalle-cuerpo').innerHTML = `<p class="error">No pude cargar el detalle: ${escapar(e.message)}</p>`;
    return;
  }
  if (detalleId !== id) return;
  pintarDetalle(d);
}

function pintarDetalle(d) {
  const a = d.alumno;
  $('detalle-titulo').textContent = a.nombre;
  $('detalle-sub').textContent = `${a.matricula || 'sin matrícula'} · ${a.grupo} · ${d.evaluacion.titulo}${a.activo ? ' · conectado ahora' : ''}`;
  const pestanas = [
    d.teoria && ['teoria', 'Teórica'],
    d.practica && ['practica', 'Laboratorio'],
    d.practica && ['cuenta', 'Su cuenta'],
    d.practica && ['bitacora', `Bitácora (${d.practica.bitacora.length})`],
    d.practica && (d.practica.asistente.length || d.evaluacion.asistente) && ['asistente', `Asistente (${d.practica.asistente.filter((m) => m.rol === 'alumno').length})`]
  ].filter(Boolean);
  if (!pestanas.some(([k]) => k === detallePestana)) detallePestana = pestanas[0][0];

  $('detalle-cuerpo').innerHTML = `
    <div class="pestanas-lab" role="tablist" aria-label="Detalle">
      ${pestanas.map(([k, t]) => `<button type="button" role="tab" data-dp="${k}" aria-selected="${k === detallePestana}">${escapar(t)}</button>`).join('')}
    </div>
    ${d.teoria ? `<section data-dpanel="teoria">${detalleTeoria(d)}</section>` : ''}
    ${d.practica ? `<section data-dpanel="practica">${detallePractica(d)}</section>` : ''}
    ${d.practica ? `<section data-dpanel="cuenta">${detalleCuenta(d)}</section>` : ''}
    ${d.practica ? `<section data-dpanel="bitacora">${detalleBitacora(d)}</section>` : ''}
    ${d.practica ? `<section data-dpanel="asistente">${detalleAsistente(d)}</section>` : ''}`;

  const mostrar = (k) => {
    detallePestana = k;
    $('detalle-cuerpo').querySelectorAll('[data-dp]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.dp === k)));
    $('detalle-cuerpo').querySelectorAll('[data-dpanel]').forEach((s) => (s.hidden = s.dataset.dpanel !== k));
    if (k === 'cuenta') montarCuenta(d);
  };
  $('detalle-cuerpo').querySelector('.pestanas-lab').addEventListener('click', (e) => {
    const b = e.target.closest('[data-dp]');
    if (b) mostrar(b.dataset.dp);
  });
  mostrar(detallePestana);
}

function detalleTeoria(d) {
  const t = d.teoria;
  const r = t.resultado;
  if (!r) {
    return t.estado === 'en-curso'
      ? `<p>En curso desde las ${hora(t.inicio)} (${t.minutos} min). Sus respuestas viven en su equipo hasta que entregue.</p>`
      : '<p class="sutil">Todavía no empieza la parte teórica.</p>';
  }
  return `
    <p><strong>${r.aciertos} de ${r.total} aciertos</strong> · ${porciento(r.porcentaje)} · calificación ${decimal(r.calificacion)} · folio <span class="mono">${escapar(r.folio)}</span> · entregó a las ${hora(r.fin)}${t.minutos ? ` (${t.minutos} min)` : ''}${t.restaurada ? ' · <em>repuesta desde su comprobante</em>' : ''}</p>
    <ol class="detalle-teoria">${(r.detalle ?? [])
      .map(
        (q, i) => `<li class="detalle ${q.acerto ? 'detalle--bien' : 'detalle--mal'}">
        <p class="detalle__pregunta">${icono(q.acerto ? 'i-check' : 'i-x', 'icono detalle__icono')}<span>${i + 1}. ${escapar(q.texto)} <span class="chip">${escapar(q.tema ?? '')}</span></span></p>
        <div class="detalle__respuesta ${q.acerto ? 'detalle__respuesta--bien' : 'detalle__respuesta--mal'}">
          <p class="detalle__titulo">Su respuesta${q.acerto ? ' · correcta' : ''}</p>
          <p>${q.elegida ? escapar(q.elegida.texto) : '<em>No la contestó.</em>'}</p>
          ${q.elegida?.retro ? `<p class="detalle__retro">${escapar(q.elegida.retro)}</p>` : ''}
        </div>
        ${q.acerto ? '' : `<div class="detalle__respuesta detalle__respuesta--bien"><p class="detalle__titulo">Respuesta correcta</p><p>${escapar(q.correcta.texto)}</p>${q.correcta.retro ? `<p class="detalle__retro">${escapar(q.correcta.retro)}</p>` : ''}</div>`}
        ${repasoHtml(q.repaso)}
      </li>`
      )
      .join('')}</ol>
    <div class="zona-peligro">
      <p><strong>¿Que repita la parte teórica?</strong> Se borra su entrega y su reloj vuelve a empezar.</p>
      <button class="boton boton--peligro" type="button" data-borrar="teoria" data-alumno="${escapar(t.alumnoId)}">Borrar entrega de la teórica</button>
    </div>`;
}

/** Dónde se repasa el tema en la Ruta AWS (lo mismo que ve el alumno). */
const repasoHtml = (lista) =>
  lista?.length
    ? `<p class="repaso"><span><strong>Se repasa en:</strong> ${lista
        .map((r) => `<a href="../aws-practitioner/#/${encodeURI(r.ruta)}" target="_blank" rel="noopener">Sesión ${r.sesion} · ${escapar(r.leccion)}${r.parte ? ` › ${escapar(r.parte)}` : ''}</a>`)
        .join(' · ')}</span></p>`
    : '';

/** Lo requerido y lo del bono, por separado (solo si el laboratorio tiene bono). */
function notaBono(tareas) {
  const bonos = tareas.filter((t) => t.bono);
  if (!bonos.length) return '';
  const base = tareas.filter((t) => !t.bono).reduce((s, t) => s + t.obtenidos, 0);
  const bono = bonos.reduce((s, t) => s + t.obtenidos, 0);
  const posibles = bonos.reduce((s, t) => s + t.puntos, 0);
  return `<p class="nota-bono">Lo requerido: <strong>${decimal(base)} de 100</strong> · bono opcional: <strong>+${decimal(bono)}</strong> de ${posibles} posibles${base + bono > 100 ? ' (la calificación se queda en 100)' : ''}.</p>`;
}

function tareasHtml(tareas) {
  return `${notaBono(tareas)}<ol class="resultado-tareas">${tareas
    .map((t) => {
      const completa = t.puntos > 0 && t.obtenidos >= t.puntos;
      const pct = t.puntos ? Math.round((t.obtenidos / t.puntos) * 100) : 0;
      // Una tarea bono sin hacer no es un error: se pinta neutra, no en rojo.
      const clase = t.bono
        ? `resultado-tarea--bono ${completa ? 'resultado-tarea--bien' : t.obtenidos > 0 ? 'resultado-tarea--media' : ''}`
        : completa ? 'resultado-tarea--bien' : t.obtenidos > 0 ? 'resultado-tarea--media' : 'resultado-tarea--mal';
      const puntos = t.bono ? `+${decimal(t.obtenidos)} de bono${completa ? '' : ` (de ${t.puntos} posibles)`}` : `${decimal(t.obtenidos)} / ${t.puntos}`;
      return `<li class="resultado-tarea ${clase}">
        ${t.bono ? '<p class="etiqueta-bono">Bono (opcional)</p>' : ''}
        <div class="resultado-tarea__cabeza"><h3>${escapar(t.titulo)}</h3><span class="resultado-tarea__puntos">${puntos}</span></div>
        <div class="progreso" aria-hidden="true"><span style="width:${pct}%"></span></div>
        <ul class="checks">${(t.checks ?? [])
          .map(
            (c) => `<li class="check ${c.ok ? 'check--bien' : t.bono ? 'check--bono' : 'check--mal'}">${icono(c.ok ? 'i-check' : 'i-x', 'icono check__icono')}
            <div><p class="check__texto">${escapar(c.texto)} <span class="check__puntos">${t.bono ? '+' : ''}${c.ok ? c.puntos : 0}/${c.puntos}</span></p>${c.retro ? `<p class="check__retro">${escapar(c.retro)}</p>` : ''}${repasoHtml(c.repaso)}</div></li>`
          )
          .join('')}</ul>
      </li>`;
    })
    .join('')}</ol>`;
}

function detallePractica(d) {
  const p = d.practica;
  const datosLab = p.datos
    ? `<p class="sutil">Sus datos del laboratorio: ${Object.entries(p.datos)
        .filter(([k, v]) => !['nombre', 'matricula'].includes(k) && (typeof v === 'string' || typeof v === 'number'))
        .map(([k, v]) => `${escapar(k)} <code>${escapar(v)}</code>`)
        .join(' · ')}</p>`
    : '';
  if (p.resultado) {
    const r = p.resultado;
    return `
      <p><strong>${decimal(r.obtenidos)} de ${r.total} puntos</strong> · calificación ${decimal(r.calificacion)} · folio <span class="mono">${escapar(r.folio)}</span> · entregó a las ${hora(r.fin)}${p.minutos ? ` (${p.minutos} min)` : ''}${p.restaurada ? ' · <em>repuesta desde su comprobante</em>' : ''}</p>
      ${datosLab}
      ${tareasHtml(r.tareas)}
      <div class="zona-peligro">
        <p><strong>¿Que repita el laboratorio?</strong> Se borra su entrega; su cuenta se queda como estaba y él decide si la reinicia.</p>
        <button class="boton boton--peligro" type="button" data-borrar="practica" data-alumno="${escapar(p.alumnoId)}">Borrar entrega del laboratorio</button>
      </div>`;
  }
  if (p.estado === 'en-curso') {
    return `
      <p>En curso desde las ${hora(p.inicio)} (${p.minutos} min). ${p.guardado ? `Última copia a las ${hora(p.guardado)}.` : 'Todavía no llega ninguna copia de su cuenta.'}</p>
      ${datosLab}
      ${p.enCurso ? `<p><strong>Así va según la rúbrica: ${decimal(p.enCurso.obtenidos)} de ${p.enCurso.total} puntos.</strong> (No es su entrega.)</p>${tareasHtml(p.enCurso.tareas)}` : ''}`;
  }
  return '<p class="sutil">Todavía no empieza el laboratorio.</p>';
}

function detalleCuenta(d) {
  const p = d.practica;
  if (!p.cuenta) {
    return `<p class="sutil">${p.restaurada ? 'Esta entrega se repuso desde el comprobante del alumno después de un reinicio del servidor: el comprobante trae la calificación, no la cuenta completa.' : 'Todavía no hay una cuenta guardada de este alumno.'}</p>`;
  }
  return `<p class="sutil">${p.fuente === 'entrega' ? 'La cuenta tal como la entregó.' : `Su última copia (${hora(p.guardado)}).`} Solo lectura: puedes navegar por la consola, pero no cambiar nada.</p>
    <div class="consola-lectura" id="consola-lectura"></div>`;
}

async function montarCuenta(d) {
  const contenedor = $('consola-lectura');
  if (!contenedor || consolaLectura) return;
  try {
    const { montarConsola } = await import('./consola/consola.js');
    if (!contenedor.isConnected) return;
    consolaLectura = montarConsola(contenedor, {
      estado: structuredClone(d.practica.cuenta),
      alumno: { nombre: d.practica.identidad?.nombre ?? d.alumno.nombre, matricula: d.practica.identidad?.matricula ?? d.alumno.matricula },
      alCambiar() {},
      soloLectura: true
    });
  } catch (e) {
    console.error(e);
    contenedor.innerHTML = '<p style="color:#fff;padding:20px">No pude abrir la consola simulada.</p>';
  }
}

function detalleBitacora(d) {
  const lista = [...d.practica.bitacora].reverse();
  if (!lista.length) return '<p class="sutil">Sin movimientos todavía.</p>';
  const texto = (x) => (typeof x === 'string' ? { t: '', servicio: '', accion: x, detalle: '' } : x);
  return `<p class="sutil">Lo más reciente primero (${lista.length} movimientos).</p>
    <table class="bitacora"><tbody>${lista
      .map(texto)
      .map(
        (x) => `<tr><td>${x.t ? new Date(x.t).toLocaleTimeString('es-MX') : ''}</td><td>${escapar(x.servicio ?? '')}</td><td><span class="mono">${escapar(x.accion ?? '')}</span> ${escapar(x.detalle ?? '')}</td></tr>`
      )
      .join('')}</tbody></table>`;
}

function detalleAsistente(d) {
  const lista = d.practica.asistente;
  if (!lista.length) return '<p class="sutil">No le ha hecho preguntas al asistente.</p>';
  const texto = (t) => escapar(t).replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\n/g, '<br>');
  return `<p class="sutil">Lo que preguntó y lo que le contestó el asistente, en orden. Te dice dónde se atoró.</p>
    <ol class="asistente__mensajes">${lista
      .map(
        (m) => `<li class="asistente__msg asistente__msg--${m.rol === 'alumno' ? 'alumno' : 'ia'}">
          <span class="asistente__quien">${m.rol === 'alumno' ? escapar(d.alumno.nombre) : 'Asistente'} · ${m.hora ? new Date(m.hora).toLocaleTimeString('es-MX') : ''}</span>
          <p>${texto(m.texto)}</p>
        </li>`
      )
      .join('')}</ol>`;
}

async function borrarDesdeDetalle(e) {
  const boton = e.target.closest('[data-borrar]');
  if (!boton) return;
  const parte = boton.dataset.borrar;
  const nombre = $('detalle-titulo').textContent;
  const si = await confirmar({
    titulo: `¿Borrar la entrega de ${parte === 'teoria' ? 'la teórica' : 'el laboratorio'}?`,
    texto: `<p>${escapar(nombre)} podrá hacer de nuevo ${parte === 'teoria' ? 'la parte teórica' : 'el laboratorio'} mientras esté abierto. Su calificación actual se pierde (descarga antes el CSV si la quieres guardar).</p>`,
    si: 'Sí, borrar la entrega',
    no: 'Cancelar',
    peligro: true
  });
  if (!si) return;
  try {
    await llamar(`api/docente/entregas/${encodeURIComponent(boton.dataset.alumno)}?evaluacion=${encodeURIComponent(evId)}&parte=${parte}`, { method: 'DELETE' });
    await Promise.all([cargar(), abrirDetalle(detalleId)]);
  } catch (err) {
    boton.insertAdjacentHTML('afterend', `<p class="error">No se pudo borrar: ${escapar(err.message)}</p>`);
  }
}
