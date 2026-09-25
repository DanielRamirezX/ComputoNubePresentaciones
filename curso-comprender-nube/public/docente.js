// Panel del docente: el plan de la clase con cronómetro, el avance del grupo
// en vivo y la práctica final (abrirla, calificaciones y repaso).
//
// Se refresca solo cada 5 segundos. Está pensado para abrirse en el celular
// del docente mientras la laptop proyecta el curso.

import { CURSO, PLAN } from './contenido.js';

const PREFIJO = 'comprender-nube:';
const LETRAS = ['A', 'B', 'C', 'D', 'E'];
const $ = (id) => document.getElementById(id);

const escapar = (t) =>
  String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icono = (id, clase = 'icono') => `<svg class="${clase}" aria-hidden="true"><use href="#${id}"></use></svg>`;
const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '');
const reloj = (minutos) => `${Math.floor(minutos / 60)}:${String(minutos % 60).padStart(2, '0')}`;

function memoria(tipo) {
  try {
    return window[tipo];
  } catch {
    return null;
  }
}
const local = memoria('localStorage');
const sesion = memoria('sessionStorage');
const leer = (donde, clave) => {
  try {
    return donde?.getItem(clave) ?? null;
  } catch {
    return null;
  }
};
const escribir = (donde, clave, valor) => {
  try {
    if (valor === null) donde?.removeItem(clave);
    else donde?.setItem(clave, valor);
  } catch {
    /* sin almacenamiento: solo se pierde la comodidad */
  }
};

const ACTIVIDADES = CURSO.capitulos.flatMap((c) => c.actividades.map((a) => ({ ...a, capitulo: c.numero })));

// Misma llave que el panel del examen: en la plataforma, entrar a uno te deja
// entrar al otro sin volver a escribir la clave.
let clave = leer(sesion, 'clave-docente') || '';
let datos = null;
let pestana = leer(sesion, PREFIJO + 'pestana') || 'plan';

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
  escribir(sesion, 'clave-docente', valor);
  $('aviso-clave').hidden = !info.claveInsegura;
  $('pantalla-clave').hidden = true;
  $('pantalla-panel').hidden = false;
  mostrarPestana(pestana);
  pintarPlan();
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

if (clave) entrar(clave).catch(() => escribir(sesion, 'clave-docente', null));

// La pantalla del QR es de la plataforma: solo existe si el curso está montado en ella.
if (!location.pathname.includes('/m/')) $('liga-qr').hidden = true;

/* ---------------------------------------------------------------- pestañas */

function mostrarPestana(nombre) {
  pestana = nombre;
  escribir(sesion, PREFIJO + 'pestana', nombre);
  document.querySelectorAll('[data-pestana]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.pestana === nombre)));
  document.querySelectorAll('[data-panel]').forEach((p) => {
    p.hidden = p.dataset.panel !== nombre;
  });
}

document.querySelector('.pestanas').addEventListener('click', (e) => {
  const boton = e.target.closest('[data-pestana]');
  if (boton) mostrarPestana(boton.dataset.pestana);
});

/* ------------------------------------------------------------------- datos */

async function llamar(ruta, opciones = {}) {
  const r = await fetch(ruta, { ...opciones, headers: { ...opciones.headers, 'x-clave-docente': clave } });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(cuerpo.error || `Error ${r.status}`), { estado: r.status });
  return cuerpo;
}

async function cargar() {
  try {
    datos = await llamar(`api/docente/resumen?grupo=${encodeURIComponent($('grupo').value)}`);
    $('error-panel').textContent = '';
    pintarTodo();
  } catch (e) {
    $('error-panel').textContent =
      e.estado === 401 ? 'La clave cambió o expiró. Recarga la página y vuelve a entrar.' : 'Se perdió la conexión con el servidor. Reintento en unos segundos.';
  }
}

$('grupo').addEventListener('change', cargar);

setInterval(() => {
  if (clave && !$('pantalla-panel').hidden && !document.hidden) cargar();
}, 5000);

setInterval(() => {
  if (datos) $('actualizado').textContent = `Actualizado a las ${new Date(datos.generado).toLocaleTimeString('es-MX')}`;
  actualizarCronometro();
}, 1000);

function pintarTodo() {
  const actual = $('grupo').value;
  $('grupo').innerHTML =
    '<option value="">Todos</option>' +
    datos.grupos.map((g) => `<option value="${escapar(g)}" ${g === actual ? 'selected' : ''}>${escapar(g)}</option>`).join('');
  pintarPlan();
  pintarVivo();
  pintarPractica();
}

/* -------------------------------------------------------------------- plan */

const CLAVE_INICIO = PREFIJO + 'inicio-clase';

function minutosDeClase() {
  const inicio = Number(leer(local, CLAVE_INICIO));
  return inicio ? (Date.now() - inicio) / 60000 : null;
}

function pintarPlan() {
  const transcurrido = minutosDeClase();
  const alumnos = datos?.alumnos ?? [];

  $('plan').innerHTML = PLAN.map((bloque) => {
    const actual = transcurrido !== null && transcurrido >= bloque.desde && transcurrido < bloque.hasta;
    const capitulo = CURSO.capitulos.find((c) => c.numero === bloque.capitulo);
    let terminaron = '';
    if (capitulo && alumnos.length) {
      const n = alumnos.filter((a) => capitulo.actividades.every((act) => a.completados[act.id] !== undefined)).length;
      terminaron = ` · <strong>${n} de ${alumnos.length}</strong> ya lo terminaron`;
    }
    return `
      <li class="bloque ${actual ? 'bloque--actual' : ''}">
        <span class="bloque__hora">${reloj(bloque.desde)} – ${reloj(bloque.hasta)} · ${bloque.hasta - bloque.desde} min${terminaron}</span>
        <h3>${escapar(bloque.titulo)}</h3>
        <ul>${bloque.pasos.map((p) => `<li>${escapar(p)}</li>`).join('')}</ul>
        ${
          capitulo
            ? `<ul class="bloque__actividades">${capitulo.actividades
                .map((a) => `<li><a href="./?proyectar=1#/${a.id}" target="_blank" rel="noopener">${icono('t-' + a.tipo)}${escapar(a.titulo)} · ${a.minutos}′</a></li>`)
                .join('')}</ul>`
            : ''
        }
        <p class="bloque__vigila"><strong>Vigila:</strong> ${escapar(bloque.vigila)}</p>
      </li>`;
  }).join('');
  actualizarCronometro();
}

function actualizarCronometro() {
  const transcurrido = minutosDeClase();
  $('btn-cronometro').hidden = transcurrido !== null;
  $('btn-reiniciar').hidden = transcurrido === null;
  if (transcurrido === null) {
    $('reloj').textContent = '0:00:00';
    return;
  }
  const segundos = Math.floor(transcurrido * 60);
  $('reloj').textContent = `${Math.floor(segundos / 3600)}:${String(Math.floor((segundos % 3600) / 60)).padStart(2, '0')}:${String(segundos % 60).padStart(2, '0')}`;

  const bloque = PLAN.find((b) => transcurrido >= b.desde && transcurrido < b.hasta);
  if (!bloque) {
    $('ahora').textContent = 'Se acabó el tiempo de la clase.';
    $('ahora-detalle').textContent = 'Cierra la práctica y descarga el CSV.';
  } else {
    $('ahora').textContent = `Ahora: ${bloque.titulo}`;
    const quedan = Math.ceil(bloque.hasta - transcurrido);
    $('ahora-detalle').textContent = `${quedan === 1 ? 'Queda 1 minuto' : `Quedan ${quedan} minutos`} de este bloque.`;
  }
  // Repinta el resaltado solo cuando cambia de bloque.
  const indice = PLAN.indexOf(bloque);
  if (indice !== actualizarCronometro.ultimo) {
    actualizarCronometro.ultimo = indice;
    document.querySelectorAll('.bloque').forEach((el, i) => el.classList.toggle('bloque--actual', i === indice));
  }
}

$('btn-cronometro').addEventListener('click', () => {
  escribir(local, CLAVE_INICIO, String(Date.now()));
  pintarPlan();
});

$('btn-reiniciar').addEventListener('click', () => {
  escribir(local, CLAVE_INICIO, null);
  pintarPlan();
});

/* ------------------------------------------------------------------- vivo */

function pintarVivo() {
  const alumnos = datos.alumnos;
  const n = alumnos.length;
  const activos = alumnos.filter((a) => a.activo).length;
  const xpPromedio = n ? Math.round(alumnos.reduce((s, a) => s + a.xp, 0) / n) : 0;
  const terminaron = (capitulo) =>
    alumnos.filter((a) => capitulo.actividades.every((act) => a.completados[act.id] !== undefined)).length;

  $('metricas-vivo').innerHTML = `
    <div class="metrica"><b>${n}</b><span>registrados</span></div>
    <div class="metrica"><b>${activos}</b><span>activos en los últimos 2 min</span></div>
    <div class="metrica"><b>${xpPromedio.toLocaleString('es-MX')}</b><span>XP promedio</span></div>
    ${CURSO.capitulos.map((c) => `<div class="metrica"><b>${terminaron(c)}</b><span>terminaron el capítulo ${c.numero}</span></div>`).join('')}`;

  $('por-actividad').innerHTML = n
    ? CURSO.capitulos
        .map(
          (c) => `
        <h3 style="margin:10px 0 4px">${c.numero}. ${escapar(c.titulo)}</h3>
        ${c.actividades
          .map((a) => {
            const hechos = alumnos.filter((al) => al.completados[a.id] !== undefined).length;
            return `<div class="avance-actividad">
                ${icono('t-' + a.tipo)}
                <span>${escapar(a.titulo)}</span>
                <div class="progreso"><span style="width:${(hechos / n) * 100}%"></span></div>
                <span class="avance-actividad__cuenta">${hechos}/${n}</span>
              </div>`;
          })
          .join('')}`
        )
        .join('')
    : '<p class="sutil">Todavía no se registra nadie. Proyecta el QR de la plataforma para que entren.</p>';

  const porAvance = [...alumnos].sort(
    (a, b) => Object.keys(a.completados).length - Object.keys(b.completados).length || a.nombre.localeCompare(b.nombre, 'es')
  );

  $('tabla-vivo').innerHTML = porAvance.length
    ? porAvance
        .map((a) => {
          const siguiente = ACTIVIDADES.find((act) => a.completados[act.id] === undefined);
          const matriz = CURSO.capitulos
            .map((c) => c.actividades.map((act) => `<span class="${a.completados[act.id] !== undefined ? 'hecho' : ''}" title="${escapar(act.titulo)}"></span>`).join(''))
            .join('<span class="separador"></span>');
          return `<tr>
            <td><span class="punto-activo ${a.activo ? 'punto-activo--si' : ''}" title="${a.activo ? 'Activo ahora' : `Visto por última vez: ${hora(a.visto) || 'sin señal desde que arrancó el servidor'}`}"></span>${escapar(a.nombre)}</td>
            <td>${escapar(a.grupo)}</td>
            <td class="num">${a.xp}</td>
            <td class="num">${Object.keys(a.completados).length}/${datos.totalActividades}</td>
            <td><div class="matriz" aria-label="${Object.keys(a.completados).length} de ${datos.totalActividades} actividades">${matriz}</div></td>
            <td>${siguiente ? `${siguiente.capitulo}. ${escapar(siguiente.titulo)}` : a.entrega ? 'Entregó la práctica' : 'Terminó el curso'}</td>
          </tr>`;
        })
        .join('')
    : '<tr><td colspan="6">Sin alumnos por ahora.</td></tr>';
}

/* ---------------------------------------------------------------- práctica */

function pintarPractica() {
  const p = datos.practica;
  const abierta = datos.practicaAbierta;
  const alumnos = datos.alumnos;

  $('estado-practica').classList.toggle('estado-practica--abierta', abierta);
  $('estado-practica-titulo').textContent = abierta ? 'La práctica está abierta' : 'La práctica está cerrada';
  $('estado-practica-texto').textContent = abierta
    ? 'Los alumnos ya pueden contestarla. Al cerrarla, nadie más puede entregar.'
    : 'Los alumnos ven la tarjeta con candado. Ábrela cuando el grupo termine el capítulo 3.';
  $('btn-practica').textContent = abierta ? 'Cerrar la práctica' : 'Abrir la práctica';
  $('btn-practica').className = abierta ? 'boton boton--peligro' : 'boton boton--primario';

  $('metricas-practica').innerHTML = `
    <div class="metrica"><b>${p.entregadas}</b><span>entregadas de ${alumnos.length} registrados</span></div>
    <div class="metrica"><b>${p.promedio}%</b><span>promedio</span></div>
    <div class="metrica"><b>${p.mediana}%</b><span>mediana</span></div>
    <div class="metrica"><b>${p.aprobados}</b><span>con ${p.aprobatorio}% o más</span></div>
    <div class="metrica"><b>${p.entregadas ? `${p.minimo}–${p.maximo}` : '—'}</b><span>rango (%)</span></div>`;

  const maximo = Math.max(1, ...p.distribucion.map((x) => x.alumnos));
  $('distribucion').innerHTML = p.distribucion
    .map(
      (x) => `<div class="barra-panel ${x.etiqueta.startsWith('0 ') || x.etiqueta.startsWith('40') ? 'barra-panel--debil' : ''}">
        <span>${x.etiqueta}% de aciertos</span><b>${x.alumnos}</b>
        <div class="progreso"><span style="width:${(x.alumnos / maximo) * 100}%"></span></div>
      </div>`
    )
    .join('');

  $('temas').innerHTML = p.entregadas
    ? p.porTema
        .map(
          (t) => `<div class="barra-panel ${t.porcentaje < p.aprobatorio ? 'barra-panel--debil' : ''}">
            <span>${escapar(t.tema)}</span><b>${t.porcentaje}%</b>
            <div class="progreso"><span style="width:${t.porcentaje}%"></span></div>
          </div>`
        )
        .join('')
    : '<p class="sutil">Aparece en cuanto llegue la primera entrega.</p>';

  // Se conservan abiertas las preguntas que el docente estaba mirando.
  const abiertas = new Set([...document.querySelectorAll('.pregunta-panel[open]')].map((d) => d.dataset.id));
  $('preguntas-panel').innerHTML = p.entregadas
    ? p.preguntas
        .map(
          (q) => `
        <details class="pregunta-panel ${q.porcentaje < p.aprobatorio ? 'pregunta-panel--debil' : ''}" data-id="${q.id}" ${abiertas.has(q.id) ? 'open' : ''}>
          <summary><span class="pregunta-panel__id">${q.id.toUpperCase()}</span><span>${escapar(q.texto)}</span><span class="pregunta-panel__pct">${q.porcentaje}%</span></summary>
          <div class="pregunta-panel__cuerpo">${opcionesConBarras(q, p.entregadas)}<p><strong>Por qué:</strong> ${escapar(q.explicacion)}</p></div>
        </details>`
        )
        .join('')
    : '<p class="sutil">Sin entregas todavía.</p>';
  $('btn-repaso').disabled = p.entregadas === 0;

  const entregaron = alumnos.filter((a) => a.entrega).sort((a, b) => b.entrega.porcentaje - a.entrega.porcentaje);
  const faltan = alumnos.filter((a) => !a.entrega).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  $('tabla-practica').innerHTML =
    [
      ...entregaron.map((a) => {
        const e = a.entrega;
        const minutos = e.inicio && e.fin ? Math.max(1, Math.round((new Date(e.fin) - new Date(e.inicio)) / 60000)) : '';
        return `<tr class="${e.porcentaje < p.aprobatorio ? 'debil' : ''}">
          <td>${escapar(a.nombre)}</td><td>${escapar(a.matricula)}</td><td>${escapar(a.grupo)}</td>
          <td class="num">${e.aciertos}/${e.total}</td><td class="num">${e.porcentaje}</td><td class="num">${(Math.round(e.porcentaje) / 10).toFixed(1)}</td>
          <td class="mono">${escapar(e.folio)}</td><td>${hora(e.fin)}</td><td class="num">${minutos}</td>
          <td><button class="boton boton--sutil boton--chico" type="button" data-reintento="${escapar(e.alumnoId)}" data-nombre="${escapar(a.nombre)}">Permitir reintento</button></td>
        </tr>`;
      }),
      ...faltan.map(
        (a) => `<tr><td>${escapar(a.nombre)}</td><td>${escapar(a.matricula)}</td><td>${escapar(a.grupo)}</td>
          <td class="num" colspan="6">Sin entregar${a.activo ? ' · conectado ahora' : ''}</td><td></td></tr>`
      )
    ].join('') || '<tr><td colspan="10">Sin alumnos por ahora.</td></tr>';
}

function opcionesConBarras(q, total) {
  return q.opciones
    .map((texto, i) => {
      const n = q.elegidas[i];
      const pct = total ? Math.round((n / total) * 100) : 0;
      return `<div class="opcion-panel ${i === q.correcta ? 'opcion-panel--correcta' : ''}">
        <span>${i === q.correcta ? icono('i-check') : LETRAS[i]}</span>
        <span>${escapar(texto)}</span>
        <b>${pct}%</b>
        <div class="opcion-panel__barra"><span style="width:${pct}%"></span></div>
      </div>`;
    })
    .join('');
}

$('btn-practica').addEventListener('click', async () => {
  const abrir = !datos.practicaAbierta;
  if (!abrir && !confirm('Al cerrar la práctica, quien no haya entregado ya no podrá hacerlo. ¿Cerrarla?')) return;
  try {
    await llamar('api/docente/practica', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ abierta: abrir })
    });
    await cargar();
  } catch (e) {
    $('error-panel').textContent = `No se pudo cambiar la práctica: ${e.message}`;
  }
});

$('tabla-practica').addEventListener('click', async (e) => {
  const boton = e.target.closest('[data-reintento]');
  if (!boton) return;
  if (!confirm(`Se borra la entrega de ${boton.dataset.nombre} y podrá contestar de nuevo. ¿Continuar?`)) return;
  try {
    await llamar(`api/docente/entregas/${encodeURIComponent(boton.dataset.reintento)}`, { method: 'DELETE' });
    await cargar();
  } catch (err) {
    $('error-panel').textContent = `No se pudo borrar la entrega: ${err.message}`;
  }
});

$('btn-csv').addEventListener('click', () => {
  window.open(
    `api/docente/datos.csv?grupo=${encodeURIComponent($('grupo').value)}&clave=${encodeURIComponent(clave)}`,
    '_blank'
  );
});

$('btn-borrar').addEventListener('click', async () => {
  const grupo = $('grupo').value;
  const cual = grupo ? `del grupo ${grupo}` : 'de todos los grupos';
  if (!confirm(`Se borran los alumnos, su avance y sus prácticas ${cual}. Descarga antes el CSV. Esto no se puede deshacer. ¿Continuar?`)) return;
  try {
    await llamar(`api/docente/datos?grupo=${encodeURIComponent(grupo)}`, { method: 'DELETE' });
    await cargar();
  } catch (e) {
    $('error-panel').textContent = `No se pudieron borrar los datos: ${e.message}`;
  }
});

/* ------------------------------------------------ repaso para proyectar */

let repasoIndice = 0;

function pintarRepaso() {
  const preguntas = datos.practica.preguntas;
  const q = preguntas[repasoIndice];
  $('repaso-pregunta').innerHTML = `
    <p class="pregunta__tema">${escapar(q.tema)} · la acertó el ${q.porcentaje}% del grupo</p>
    <h2>${escapar(q.texto)}</h2>
    ${opcionesConBarras(q, datos.practica.entregadas)}
    <div class="repaso-proyectado__explicacion"><strong>Por qué:</strong> ${escapar(q.explicacion)}</div>`;
  $('repaso-contador').textContent = `${repasoIndice + 1} de ${preguntas.length} · de la más fallada a la más acertada`;
  $('btn-repaso-anterior').disabled = repasoIndice === 0;
  $('btn-repaso-siguiente').disabled = repasoIndice === preguntas.length - 1;
}

function cerrarRepaso() {
  $('repaso').hidden = true;
  if (document.fullscreenElement) document.exitFullscreen?.();
}

$('btn-repaso').addEventListener('click', () => {
  repasoIndice = 0;
  pintarRepaso();
  $('repaso').hidden = false;
  $('repaso').requestFullscreen?.().catch(() => {});
});

$('btn-cerrar-repaso').addEventListener('click', cerrarRepaso);
$('btn-repaso-anterior').addEventListener('click', () => {
  repasoIndice = Math.max(0, repasoIndice - 1);
  pintarRepaso();
});
$('btn-repaso-siguiente').addEventListener('click', () => {
  repasoIndice = Math.min(datos.practica.preguntas.length - 1, repasoIndice + 1);
  pintarRepaso();
});

document.addEventListener('keydown', (e) => {
  if ($('repaso').hidden) return;
  if (e.key === 'Escape') cerrarRepaso();
  if (e.key === 'ArrowRight') $('btn-repaso-siguiente').click();
  if (e.key === 'ArrowLeft') $('btn-repaso-anterior').click();
});
