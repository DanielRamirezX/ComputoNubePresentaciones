// Panel del docente de la evaluación: abrir y cerrar cada parte, cómo va
// cada alumno en vivo, el detalle de uno (respuestas, rúbrica, su cuenta en
// la consola en solo lectura y su bitácora) y lo que más costó al grupo.
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
let evId = leer(PREFIJO + 'evaluacion-panel') || '';
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
  // Sin elección previa, la próxima evaluación por fecha (o la última).
  if (!evaluaciones.some((e) => e.id === evId)) {
    const hoy = new Date().toLocaleDateString('en-CA');
    evId = (evaluaciones.find((e) => e.fecha >= hoy) ?? evaluaciones.at(-1)).id;
  }
  $('evaluacion').innerHTML = evaluaciones.map((e) => `<option value="${e.id}">${escapar(e.titulo)} · ${escapar(e.fechaTexto)}</option>`).join('');
  $('evaluacion').value = evId;
  $('aviso-clave').hidden = !info.claveInsegura;
  $('pantalla-clave').hidden = true;
  $('pantalla-panel').hidden = false;
  await cargar();
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
    const nuevos = await llamar(`api/docente/resumen?evaluacion=${encodeURIComponent(pedida)}&grupo=${encodeURIComponent($('grupo').value)}`);
    if (pedida !== evId) return; // cambió de evaluación mientras llegaba
    datos = nuevos;
    $('error-panel').textContent = '';
    pintarTodo();
  } catch (e) {
    $('error-panel').textContent =
      e.estado === 401 ? 'La clave cambió o expiró. Recarga la página y vuelve a entrar.' : 'Se perdió la conexión con el servidor. Reintento en unos segundos.';
  }
}

$('grupo').addEventListener('change', cargar);
$('evaluacion').addEventListener('change', () => {
  evId = $('evaluacion').value;
  escribir(PREFIJO + 'evaluacion-panel', evId);
  datos = null;
  ultimoControl = '';
  $('control').innerHTML = '<p class="cargando">Cargando…</p>';
  cargar();
});

setInterval(() => {
  if (clave && !$('pantalla-panel').hidden && !document.hidden) cargar();
}, 5000);
setInterval(() => {
  if (datos) $('actualizado').textContent = `Actualizado a las ${new Date(datos.generado).toLocaleTimeString('es-MX')}`;
}, 1000);

function pintarTodo() {
  const actual = $('grupo').value;
  $('grupo').innerHTML =
    '<option value="">Todos</option>' + datos.grupos.map((g) => `<option value="${escapar(g)}" ${g === actual ? 'selected' : ''}>${escapar(g)}</option>`).join('');
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
    return `
      <div class="control__parte">
        <h3>${NOMBRE_PARTE[p]}</h3>
        <button type="button" class="interruptor" role="switch" aria-checked="${abierta}" aria-label="Abrir ${NOMBRE_PARTE[p].toLowerCase()}" data-parte="${p}" data-foco="parte-${p}">
          <span class="interruptor__riel" aria-hidden="true"></span>
          <span class="interruptor__texto">
            <strong>${abierta ? `${NOMBRE_PARTE[p]} abierta` : `Abrir ${NOMBRE_PARTE[p].toLowerCase()}`}</strong>
            <small>${abierta ? 'Los alumnos ya pueden entrar · toca para cerrarla' : 'Cerrada: los alumnos ven el candado'}</small>
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
            : 'Laboratorio en la consola simulada · máximo 60 minutos (el reloj solo avisa)'
        }</p>
      </div>`;
  };

  $('control').innerHTML = `
    <div class="control__cabeza">
      <h2>${escapar(ev.titulo)}</h2>
      <p>${escapar(ev.fechaTexto)}${ev.partes.length > 1 ? ` · calificación combinada: ${pesos}` : ''}</p>
    </div>
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
        <p class="ajuste__ayuda">Con «Sí», el alumno ve qué lleva bien y qué le falta antes de entregar (ideal en simulacros). En el examen, «No».</p>
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
        titulo: `¿Cerrar la ${NOMBRE_PARTE[p].toLowerCase()}?`,
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
    caja(conteos.practica.entregaron, 'entregaron la práctica'),
    s.practica?.entregadas ? caja(porciento(s.practica.promedio), 'promedio práctica') : '',
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
    return `<span class="estado-celda estado-celda--curso">En curso · ${p.minutos} min${tareas}</span>`;
  }
  return `<span class="estado-celda ${p.porcentaje < APROBATORIO ? 'estado-celda--debil' : 'estado-celda--entregada'}">${icono('i-check')} ${decimal(p.obtenidos)}/${p.total} · ${p.tareasLogradas} de ${p.tareasTotal} tareas</span>${p.restaurada ? ' <small title="Repuesta desde el comprobante del alumno">↺</small>' : ''}`;
}

function pintarTabla() {
  const ev = datos.evaluacion;
  const conTeoria = ev.partes.includes('teoria');
  const combinada = ev.partes.length > 1;
  $('cabeza-tabla').innerHTML = `<tr>
    <th scope="col">Alumno</th><th scope="col">Matrícula</th><th scope="col">Grupo</th>
    ${conTeoria ? '<th scope="col">Teórica</th>' : ''}
    <th scope="col">Práctica</th>
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
    : `<tr><td colspan="${columnas}">Todavía no entra nadie. Comparte la liga de la evaluación (en la plataforma: Evaluación AWS).</td></tr>`;
}

$('tabla').addEventListener('click', (e) => {
  const id = e.target.closest('[data-ver]')?.dataset.ver;
  if (id) abrirDetalle(id);
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
          (c) => `<li class="estad ${c.porcentaje < APROBATORIO ? 'estad--debil' : ''}">
          <div class="estad__cabeza"><strong>${escapar(c.texto)}</strong><span class="estad__pct">${porciento(c.porcentaje)}</span></div>
          <p class="estad__meta">${escapar(c.tareaTitulo)} · ${c.puntos} pts · lo cumplieron ${c.cumplidos} de ${c.n}</p>
          <div class="progreso"><span style="width:${c.porcentaje}%"></span></div>
        </li>`
        )
        .join('')}</ol>
    </div>`);
    tarjetas.push(`<div class="hoja"><h3>Promedio por tarea</h3>${p.tareas
      .map(
        (x) => `<div class="barra-panel ${x.porcentaje < APROBATORIO ? 'barra-panel--debil' : ''}"><span>${escapar(x.titulo)} · ${decimal(x.promedio)} de ${x.puntos} · completa: ${x.completas}</span><b>${porciento(x.porcentaje)}</b><div class="progreso"><span style="width:${x.porcentaje}%"></span></div></div>`
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
    d.practica && ['bitacora', `Bitácora (${d.practica.bitacora.length})`]
  ].filter(Boolean);
  if (!pestanas.some(([k]) => k === detallePestana)) detallePestana = pestanas[0][0];

  $('detalle-cuerpo').innerHTML = `
    <div class="pestanas-lab" role="tablist" aria-label="Detalle">
      ${pestanas.map(([k, t]) => `<button type="button" role="tab" data-dp="${k}" aria-selected="${k === detallePestana}">${escapar(t)}</button>`).join('')}
    </div>
    ${d.teoria ? `<section data-dpanel="teoria">${detalleTeoria(d)}</section>` : ''}
    ${d.practica ? `<section data-dpanel="practica">${detallePractica(d)}</section>` : ''}
    ${d.practica ? `<section data-dpanel="cuenta">${detalleCuenta(d)}</section>` : ''}
    ${d.practica ? `<section data-dpanel="bitacora">${detalleBitacora(d)}</section>` : ''}`;

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
      </li>`
      )
      .join('')}</ol>
    <div class="zona-peligro">
      <p><strong>¿Que repita la parte teórica?</strong> Se borra su entrega y su reloj vuelve a empezar.</p>
      <button class="boton boton--peligro" type="button" data-borrar="teoria" data-alumno="${escapar(t.alumnoId)}">Borrar entrega de la teórica</button>
    </div>`;
}

function tareasHtml(tareas) {
  return `<ol class="resultado-tareas">${tareas
    .map((t) => {
      const completa = t.puntos > 0 && t.obtenidos >= t.puntos;
      const pct = t.puntos ? Math.round((t.obtenidos / t.puntos) * 100) : 0;
      return `<li class="resultado-tarea ${completa ? 'resultado-tarea--bien' : t.obtenidos > 0 ? 'resultado-tarea--media' : 'resultado-tarea--mal'}">
        <div class="resultado-tarea__cabeza"><h3>${escapar(t.titulo)}</h3><span class="resultado-tarea__puntos">${decimal(t.obtenidos)} / ${t.puntos}</span></div>
        <div class="progreso" aria-hidden="true"><span style="width:${pct}%"></span></div>
        <ul class="checks">${(t.checks ?? [])
          .map(
            (c) => `<li class="check ${c.ok ? 'check--bien' : 'check--mal'}">${icono(c.ok ? 'i-check' : 'i-x', 'icono check__icono')}
            <div><p class="check__texto">${escapar(c.texto)} <span class="check__puntos">${c.ok ? c.puntos : 0}/${c.puntos}</span></p>${c.retro ? `<p class="check__retro">${escapar(c.retro)}</p>` : ''}</div></li>`
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
