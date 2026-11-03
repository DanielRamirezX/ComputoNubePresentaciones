// Tablero del docente: un solo lugar para abrir y cerrar lo de todos los módulos.
//
// No sabe nada de cada módulo: le pide a cada uno su /api/docente/tablero
// (indicadores y controles ya armados) y le regresa el cambio con un PUT. Así,
// abrir un examen desde aquí hace exactamente lo mismo que desde el panel del
// módulo. Lo único propio de la plataforma es qué tarjetas ven los alumnos.

const $ = (id) => document.getElementById(id);

const escapar = (t) =>
  String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Para buscar sin que importen acentos ni mayúsculas: «sesión» encuentra «sesion».
const normal = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

// En una ventana privada o con el almacenamiento bloqueado, sessionStorage
// truena al tocarlo. El tablero funciona igual; solo pedirá la clave otra vez.
const sesion = (() => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
})();
const leer = (llave) => {
  try {
    return sesion?.getItem(llave) ?? null;
  } catch {
    return null;
  }
};
const escribir = (llave, valor) => {
  try {
    if (valor === null) sesion?.removeItem(llave);
    else sesion?.setItem(llave, valor);
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
};

// La llave donde cada panel de módulo recuerda la clave. Hoy los cuatro usan la
// misma («clave-docente»); si alguno cambia la suya, se agrega aquí y el
// tablero la escribe también, para que abrirlo desde aquí no la vuelva a pedir.
const LLAVE = 'clave-docente';
const LLAVES_MODULOS = ['clave-docente'];
const LLAVE_PLEGADO = 'tablero:plegado';

const CADA_MS = 20_000;
// Una lista («Sesión de hoy») se guarda cuando el docente deja de moverla: con
// las flechas cada paso es un «change», y no hay que mandar cada sesión de en medio.
const ESPERA_LISTA_MS = 700;

let clave = leer(LLAVE) || '';
let indice = null; // { tarjetas, modulos } de la plataforma
const tableros = new Map(); // id del módulo → { tipo: 'ok' | 'sin-controles' | 'error', datos?, mensaje? }
const guardando = new Set(); // «módulo|control» que esperan respuesta del servidor
const errores = new Map(); // «módulo|grupo» → mensaje del último cambio que falló
const esperas = new Map(); // «módulo|control» de una lista → { valor, anterior, temporizador } aún sin mandar
const siguiente = new Map(); // «módulo|control» de una lista → valor que se movió mientras se guardaba el anterior
let ultimaCarga = 0;
let cargando = null;
let ultimaHuella = ''; // los datos con los que se pintó por última vez
let repintarDespues = false; // un repintado que se aplazó porque el docente estaba usando una lista o un aviso

// Qué grupos desplegó o plegó el docente a mano. Se respeta en cada repintado
// (cada 20 s) para que no se le cierre lo que estaba viendo.
const plegado = new Map(
  (() => {
    try {
      return Object.entries(JSON.parse(leer(LLAVE_PLEGADO) || '{}'));
    } catch {
      return [];
    }
  })()
);
const recordarPlegado = () => escribir(LLAVE_PLEGADO, JSON.stringify(Object.fromEntries(plegado)));

/* ------------------------------------------------------------- utilidades */

let temporizadorMensaje = null;
function avisar(texto, tipo = 'ok') {
  const el = $('mensaje');
  el.textContent = texto;
  el.className = `mensaje mensaje--${tipo} mensaje--visible`;
  clearTimeout(temporizadorMensaje);
  temporizadorMensaje = setTimeout(() => el.classList.remove('mensaje--visible'), tipo === 'error' ? 7000 : 3500);
}

/** fetch con la clave. Lanza un Error con `estado` (el código HTTP, o 0 sin red). */
async function llamar(ruta, opciones = {}) {
  let r;
  try {
    r = await fetch(ruta, {
      cache: 'no-store',
      ...opciones,
      headers: { 'Content-Type': 'application/json', ...opciones.headers, 'x-clave-docente': clave }
    });
  } catch {
    const e = new Error('no hubo respuesta del servidor; revisa la conexión');
    e.estado = 0;
    throw e;
  }
  const tipo = r.headers.get('content-type') || '';
  const datos = tipo.includes('json') ? await r.json().catch(() => null) : null;
  if (!r.ok) {
    const e = new Error(datos?.error || `el servidor respondió ${r.status}`);
    e.estado = r.status;
    throw e;
  }
  if (!datos) {
    // Un módulo sin la ruta puede contestar su página de inicio en lugar de JSON.
    const e = new Error('el módulo no contestó con datos');
    e.estado = 404;
    throw e;
  }
  return datos;
}

/** Confirmación dentro de la página (no `confirm()`), como en los paneles. */
function confirmar({ titulo, texto, si, no = 'Cancelar' }) {
  // De dónde se abrió, para regresar ahí el teclado al cerrar aunque el botón
  // original se haya repintado mientras tanto.
  const origen = document.activeElement?.dataset?.foco;
  return new Promise((resolve) => {
    const dialogo = document.createElement('dialog');
    dialogo.className = 'dialogo';
    dialogo.setAttribute('aria-labelledby', 'dialogo-titulo');
    dialogo.innerHTML = `
      <form method="dialog">
        <h2 id="dialogo-titulo">${escapar(titulo)}</h2>
        <div class="dialogo__texto">${texto}</div>
        <div class="dialogo__acciones">
          <button class="boton" value="no" type="submit">${escapar(no)}</button>
          <button class="boton boton--peligro" value="si" type="submit">${escapar(si)}</button>
        </div>
      </form>`;
    document.body.append(dialogo);
    dialogo.addEventListener('close', () => {
      resolve(dialogo.returnValue === 'si');
      dialogo.remove();
      requestAnimationFrame(() => {
        if (repintarDespues) repintar();
        if (document.activeElement && document.activeElement !== document.body) return;
        const destino = origen && document.querySelector(`[data-foco="${CSS.escape(origen)}"]`);
        (destino || $('abierto')).focus();
      });
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
  }).catch(() => null);
  if (!r) throw new Error('No hubo respuesta del servidor. Revisa la conexión.');
  if (r.status === 401) throw new Error('Esa no es la clave. Revisa mayúsculas y espacios.');
  if (!r.ok) throw new Error(`El servidor respondió ${r.status}. Intenta de nuevo.`);
  const info = await r.json();

  clave = valor;
  escribir(LLAVE, valor);
  for (const llave of LLAVES_MODULOS) escribir(llave, valor);

  $('aviso-clave').hidden = !info.claveInsegura;
  $('pantalla-clave').hidden = true;
  $('pantalla-tablero').hidden = false;
  await actualizar();
}

$('form-clave').addEventListener('submit', async (e) => {
  e.preventDefault();
  const valor = $('clave').value.trim();
  $('error-clave').textContent = '';
  if (!valor) {
    $('error-clave').textContent = 'Escribe la clave.';
    $('clave').focus();
    return;
  }
  const boton = e.submitter ?? $('form-clave').querySelector('button');
  boton.disabled = true;
  try {
    await entrar(valor);
  } catch (err) {
    $('error-clave').textContent = err.message;
    $('clave').select();
  } finally {
    boton.disabled = false;
  }
});

function salir(motivo = '') {
  clave = '';
  escribir(LLAVE, null);
  for (const llave of LLAVES_MODULOS) escribir(llave, null);
  indice = null;
  tableros.clear();
  ultimaHuella = '';
  $('pantalla-tablero').hidden = true;
  $('pantalla-clave').hidden = false;
  $('clave').value = '';
  $('error-clave').textContent = motivo;
  $('clave').focus();
}

$('salir').addEventListener('click', () => salir());

/* ------------------------------------------------------------------ cargar */

/** Pide el índice de la plataforma y el tablero de cada módulo, en paralelo. */
function actualizar() {
  // Si ya hay una carga en camino (el reloj y el botón a la vez), se reutiliza.
  if (cargando) return cargando;
  cargando = (async () => {
    $('actualizar').disabled = true;
    try {
      let nuevo;
      try {
        nuevo = await llamar('api/docente/indice');
      } catch (e) {
        if (e.estado === 401) return salir('La clave cambió en el servidor. Vuelve a entrar.');
        $('aviso-red').hidden = false;
        $('aviso-red').textContent = `No pude actualizar el tablero: ${e.message}. Lo vuelvo a intentar en unos segundos.`;
        return;
      }
      $('aviso-red').hidden = true;
      // Lo que se está guardando en este momento conserva su valor optimista.
      for (const t of nuevo.tarjetas) {
        if (guardando.has(`indice|${t.id}`)) t.visible = indice?.tarjetas.find((x) => x.id === t.id)?.visible ?? t.visible;
      }
      indice = nuevo;

      await Promise.all(
        indice.modulos.map(async (m) => {
          const resultado = await pedirTablero(m);
          // Si el docente cambió algo de este módulo mientras llegaba la
          // respuesta (o movió una lista que aún no se manda), manda la
          // respuesta de su cambio, no esta (puede ser vieja).
          if ([...guardando, ...esperas.keys(), ...siguiente.keys()].some((k) => k.startsWith(m.id + '|'))) return;
          tableros.set(m.id, resultado);
        })
      );
      ultimaCarga = Date.now();
      $('hora').textContent = `Actualizado a las ${new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
      // Si nada cambió desde lo que está pintado, no se repinta: así no se
      // mueve nada bajo la mano del docente cada 20 s.
      if (huellaDatos() === ultimaHuella && !repintarDespues) return;
      repintar();
    } finally {
      $('actualizar').disabled = false;
      cargando = null;
    }
  })();
  return cargando;
}

async function pedirTablero(m) {
  if (m.estado !== 'ok') return { tipo: 'error', mensaje: `El módulo no cargó: ${m.detalle ?? 'revisa la terminal del servidor'}.` };
  try {
    return { tipo: 'ok', datos: await llamar(`${m.url}api/docente/tablero`) };
  } catch (e) {
    if (e.estado === 404) return { tipo: 'sin-controles' };
    if (e.estado === 401) return { tipo: 'error', mensaje: 'El módulo no aceptó la clave. ¿Arrancó con otra CLAVE_DOCENTE?' };
    return { tipo: 'error', mensaje: `No contestó: ${e.message}.` };
  }
}

$('actualizar').addEventListener('click', async () => {
  await actualizar();
  if (indice) avisar('Tablero actualizado.');
});

// Cada 20 s mientras la pestaña está a la vista; oculta no gasta nada.
setInterval(() => {
  if (clave && indice && !document.hidden) actualizar();
}, CADA_MS);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && clave && indice && Date.now() - ultimaCarga > CADA_MS) actualizar();
});

/* -------------------------------------------------------------- pintar */

const urlPanel = (m, ruta) => `${m.url}${ruta || 'docente.html'}`;

const huellaDatos = () => JSON.stringify([indice, [...tableros]]);

function pintarTodo() {
  ultimaHuella = huellaDatos();
  // Se recuerda qué tenía el foco para devolvérselo después de repintar (cada
  // 20 s se repinta todo: sin esto, el teclado saltaría al inicio de la página).
  const foco = document.activeElement?.dataset?.foco;
  pintarAbierto();
  pintarModulos();
  pintarIndice();
  if (!foco) return;
  const destino = document.querySelector(`[data-foco="${CSS.escape(foco)}"]`);
  if (destino) destino.focus();
  // Lo que se cerró desde «Abierto ahora» desaparece de la lista: el foco se
  // queda en la sección en lugar de perderse.
  else if (foco.startsWith('cerrar:')) $('abierto').focus();
}

/**
 * Repinta, salvo que el docente esté eligiendo en una lista o contestando un
 * aviso: repintar cambia esos elementos por otros nuevos y la lista abierta se
 * le cerraría en la mano. Entonces solo se ponen al día los valores de las
 * listas y el repintado completo espera a que suelte la lista o cierre el aviso.
 */
function repintar() {
  const ocupado = document.activeElement?.matches?.('select[data-control]') || document.querySelector('dialog[open]');
  if (!ocupado) {
    repintarDespues = false;
    pintarTodo();
    return;
  }
  repintarDespues = true;
  for (const sel of document.querySelectorAll('select[data-control]')) {
    const llave = `${sel.dataset.modulo}|${sel.dataset.control}`;
    const c = buscarControl(sel.dataset.modulo, sel.dataset.control)?.c;
    if (c && !esperas.has(llave) && sel.value !== String(c.valor ?? '')) sel.value = String(c.valor ?? '');
  }
}

const esApertura = (control) => control.tipo === 'interruptor' && /abiert[oa]s?\b/i.test(control.etiqueta ?? '');
// «Parte práctica abierta» → «parte práctica», para el resumen de arriba.
const nombreCorto = (control) => {
  const t = String(control.etiqueta ?? '').replace(/\s+abiert[oa]s?\b.*$/i, '').trim() || control.etiqueta;
  return t.charAt(0).toLowerCase() + t.slice(1);
};
// «Simulacro 2 · parte práctica», pero «Laboratorio de la sesión 5» a secas
// (no «… · laboratorio»): si el grupo ya lo dice, no se repite.
const queSeAbre = (g, c) => (normal(g.titulo).includes(normal(nombreCorto(c))) ? g.titulo : `${g.titulo} · ${nombreCorto(c)}`);

/** Cada grupo de cada módulo que contestó su tablero. */
function* recorrerGrupos() {
  for (const m of indice?.modulos ?? []) {
    const t = tableros.get(m.id);
    if (t?.tipo === 'ok') for (const g of t.datos.grupos ?? []) yield { m, g };
  }
}

/** Todo lo que se puede recorrer: cada control con su módulo y su grupo. */
function* recorrer() {
  for (const m of indice?.modulos ?? []) {
    const t = tableros.get(m.id);
    if (t?.tipo !== 'ok') continue;
    const titulo = t.datos.titulo || m.titulo;
    for (const g of t.datos.grupos ?? []) {
      for (const c of g.controles ?? []) yield { m, titulo, g, c };
    }
  }
}

function pintarAbierto() {
  const abiertos = [...recorrer()].filter(({ c }) => esApertura(c) && c.valor === true);
  const hoy = [...recorrer()].filter(({ c }) => c.tipo === 'seleccion' && /\bhoy\b/i.test(c.etiqueta ?? ''));

  // «Sesión de hoy» es lo que más se mueve en clase: va aquí arriba como lista
  // de verdad (la misma que en el grupo de su módulo), no solo como texto.
  const extras = hoy
    .map(({ m, titulo, c }) => {
      const llave = `${m.id}|${c.id}`;
      const id = `hoy-${m.id}-${c.id}`.replace(/[^\w-]/g, '-');
      return `<div class="seleccion abierto__hoy${guardando.has(llave) ? ' seleccion--guardando' : ''}">
          <label for="${escapar(id)}">${escapar(c.etiqueta)} <span class="sutil">· ${escapar(titulo)}</span>${guardando.has(llave) ? ' <span class="sutil">· guardando…</span>' : ''}</label>
          ${lista(m, c, id, `hoy:${llave}`)}
        </div>`;
    })
    .join('');

  if (!abiertos.length) {
    $('lista-abierto').innerHTML = `${extras}<p class="abierto__nada">Nada abierto: ningún examen, práctica ni laboratorio está recibiendo respuestas.</p>`;
    return;
  }
  $('lista-abierto').innerHTML = `${extras}
    <ul class="abierto">${abiertos
      .map(({ m, titulo, g, c }) => {
        const llave = `${m.id}|${c.id}`;
        const ocupado = guardando.has(llave);
        return `<li class="abierto__item${m.id === 'evaluacion' ? ' abierto__item--evaluacion' : ''}">
          <span class="abierto__punto" aria-hidden="true"></span>
          <span class="abierto__texto"><b>${escapar(queSeAbre(g, c))}</b><small>${escapar(titulo)}</small></span>
          <button class="boton boton--chico boton--cerrar" type="button" data-modulo="${escapar(m.id)}" data-control="${escapar(c.id)}" data-valor="false"
            data-foco="cerrar:${escapar(llave)}" ${ocupado ? 'aria-disabled="true" aria-busy="true"' : ''}
            aria-label="Cerrar ${escapar(queSeAbre(g, c))}">${ocupado ? 'Cerrando…' : 'Cerrar'}</button>
        </li>`;
      })
      .join('')}</ul>`;
}

function indicadores(lista, clase = '') {
  if (!lista?.length) return '';
  return `<dl class="indicadores ${clase}">${lista
    .map((i) => `<div class="indicador"><dt>${escapar(i.etiqueta)}</dt><dd>${escapar(i.valor)}</dd></div>`)
    .join('')}</dl>`;
}

function control(m, c) {
  const llave = `${m.id}|${c.id}`;
  const ocupado = guardando.has(llave);
  const foco = `control:${llave}`;
  if (c.tipo === 'interruptor') {
    const si = c.valor === true;
    return `<button class="interruptor${ocupado ? ' interruptor--guardando' : ''}" type="button" role="switch" aria-checked="${si}"
        data-modulo="${escapar(m.id)}" data-control="${escapar(c.id)}" data-foco="${escapar(foco)}" ${ocupado ? 'aria-disabled="true" aria-busy="true"' : ''}>
        <span class="interruptor__pista" aria-hidden="true"></span>
        <span class="interruptor__texto">${escapar(c.etiqueta)}</span>
        <span class="interruptor__estado" aria-hidden="true">${ocupado ? 'guardando…' : si ? 'Sí' : 'No'}</span>
      </button>`;
  }
  if (c.tipo === 'seleccion') {
    const id = `sel-${m.id}-${c.id}`.replace(/[^\w-]/g, '-');
    return `<div class="seleccion${ocupado ? ' seleccion--guardando' : ''}">
        <label for="${escapar(id)}">${escapar(c.etiqueta)}${ocupado ? ' <span class="sutil">· guardando…</span>' : ''}</label>
        ${lista(m, c, id, foco)}
      </div>`;
  }
  return '';
}

/** El <select> de un control de selección. Si nadie ha elegido, dice «Sin elegir» en lugar de fingir la primera opción. */
function lista(m, c, id, foco) {
  const ocupado = guardando.has(`${m.id}|${c.id}`);
  const opciones = c.opciones ?? [];
  const elegida = opciones.some((o) => String(o.valor) === String(c.valor ?? ''));
  return `<select id="${escapar(id)}" data-modulo="${escapar(m.id)}" data-control="${escapar(c.id)}" data-foco="${escapar(foco)}" ${ocupado ? 'aria-busy="true"' : ''}>
      ${elegida ? '' : '<option value="" disabled selected>Sin elegir</option>'}
      ${opciones
        .map((o) => `<option value="${escapar(o.valor)}"${String(o.valor) === String(c.valor) ? ' selected' : ''}>${escapar(o.etiqueta)}</option>`)
        .join('')}
    </select>`;
}

/** El texto donde se busca: el módulo, el grupo y sus controles. */
const textoGrupo = (m, g) => normal([m.titulo, g.titulo, g.detalle, ...(g.controles ?? []).map((c) => c.etiqueta)].join(' '));

/**
 * ¿Este grupo coincide con lo que se escribió en «Buscar»? Si la frase completa
 * aparece en algún lado («sesion 1»), se busca la frase; si no («simulacro
 * practica»), basta con que estén todas las palabras.
 */
function coincide(m, g, filtro, frase) {
  if (!filtro) return true;
  const texto = textoGrupo(m, g);
  return frase ? texto.includes(filtro) : filtro.split(/\s+/).every((p) => texto.includes(p));
}

function grupo(m, g, totalGrupos, filtro) {
  const llaveGrupo = `${m.id}|${g.titulo}`;
  const abiertos = (g.controles ?? []).filter((c) => esApertura(c) && c.valor === true);
  // «Clase de hoy» (la lista «Sesión de hoy») se usa en cada clase: no se esconde.
  const conHoy = (g.controles ?? []).some((c) => c.tipo === 'seleccion' && /\bhoy\b/i.test(c.etiqueta ?? ''));
  // Desplegado si el docente lo dejó así; si no ha tocado nada: los que tienen
  // algo abierto, el de la clase de hoy y los módulos con pocos grupos. Al
  // buscar, todo lo que coincide.
  const desplegado = filtro
    ? true
    : plegado.has(llaveGrupo)
      ? plegado.get(llaveGrupo)
      : abiertos.length > 0 || conHoy || totalGrupos <= 2;
  const error = errores.get(llaveGrupo);
  const enlace = g.enlace
    ? `<a class="grupo__enlace" href="${escapar(urlPanel(m, g.enlace))}" target="_blank" rel="opener" data-foco="enlace:${escapar(llaveGrupo)}">Ver en el panel completo</a>`
    : '';
  return `<details class="grupo${abiertos.length ? ' grupo--abierto' : ''}" data-grupo="${escapar(llaveGrupo)}"${desplegado ? ' open' : ''}>
      <summary data-foco="grupo:${escapar(llaveGrupo)}">
        <span class="grupo__titulo">${escapar(g.titulo)}</span>
        ${g.detalle ? `<span class="grupo__detalle">${escapar(g.detalle)}</span>` : ''}
        ${abiertos.length ? `<span class="pastilla pastilla--abierto">Abierto: ${escapar(abiertos.map(nombreCorto).join(', '))}</span>` : ''}
      </summary>
      <div class="grupo__cuerpo">
        ${indicadores(g.indicadores, 'indicadores--chicos')}
        ${(g.controles ?? []).length ? `<div class="controles">${g.controles.map((c) => control(m, c)).join('')}</div>` : ''}
        <p class="error" role="alert">${escapar(error ?? '')}</p>
        ${enlace}
      </div>
    </details>`;
}

function pintarModulos() {
  const filtro = normal($('buscar').value.trim()).replace(/\s+/g, ' ');
  let visibles = 0;
  const frase = [...recorrerGrupos()].some(({ m, g }) => textoGrupo(m, g).includes(filtro));
  const html = (indice?.modulos ?? []).map((m) => {
    const t = tableros.get(m.id) ?? { tipo: 'error', mensaje: 'Cargando…' };
    const titulo = t.tipo === 'ok' && t.datos.titulo ? t.datos.titulo : m.titulo;
    const panel = t.tipo === 'ok' && t.datos.panel ? t.datos.panel : 'docente.html';
    const abrir = m.url
      ? `<a class="boton boton--chico modulo__abrir" href="${escapar(urlPanel(m, panel))}" target="_blank" rel="opener" data-foco="panel:${escapar(m.id)}">Abrir panel completo</a>`
      : '';
    let cuerpo;
    if (t.tipo === 'ok') {
      const grupos = t.datos.grupos ?? [];
      const coinciden = grupos.filter((g) => coincide(m, g, filtro, frase));
      if (filtro && !coinciden.length && !normal(titulo).includes(filtro)) return '';
      visibles++;
      cuerpo = `
        ${indicadores(t.datos.indicadores)}
        ${
          grupos.length
            ? `<div class="grupos${grupos.length > 4 ? ' grupos--muchos' : ''}">${(coinciden.length ? coinciden : grupos)
                .map((g) => grupo(m, g, grupos.length, coinciden.length ? filtro : ''))
                .join('')}</div>`
            : '<p class="sutil">Este módulo no tiene nada que abrir o cerrar desde aquí.</p>'
        }`;
    } else {
      if (filtro && !normal(titulo).includes(filtro)) return '';
      visibles++;
      cuerpo =
        t.tipo === 'sin-controles'
          ? '<p class="sutil">Sin controles en el tablero todavía. Ábrelo en su panel completo.</p>'
          : `<p class="error">${escapar(t.mensaje)}</p>`;
    }
    return `<article class="modulo modulo--${escapar(m.id)}" aria-labelledby="mod-${escapar(m.id)}">
        <header class="modulo__cabeza">
          <h3 id="mod-${escapar(m.id)}">${escapar(titulo)}</h3>
          ${abrir}
        </header>
        ${cuerpo}
      </article>`;
  });
  $('lista-modulos').innerHTML = html.join('');
  $('filtro-vacio').hidden = !(filtro && visibles === 0);
}

/* ----------------------------------------------- lo que ven los alumnos */

function pintarIndice() {
  if (!indice) return;
  const secciones = new Map([['', []]]);
  for (const t of indice.tarjetas) {
    const nombre = t.seccion || '';
    if (!secciones.has(nombre)) secciones.set(nombre, []);
    secciones.get(nombre).push(t);
  }
  const ocultas = indice.tarjetas.filter((t) => !t.visible).length;
  $('conteo-ocultas').textContent = ocultas
    ? `${ocultas} tarjeta${ocultas === 1 ? ' oculta' : 's ocultas'} de ${indice.tarjetas.length}.`
    : `Las ${indice.tarjetas.length} tarjetas están a la vista.`;
  $('mostrar-todo').disabled = ocultas === 0;

  $('lista-indice').innerHTML = [...secciones]
    .filter(([, tarjetas]) => tarjetas.length)
    .map(([nombre, tarjetas]) => {
      const visibles = tarjetas.filter((t) => t.visible).length;
      const titulo = nombre || 'Clases';
      const evaluacion = /evaluaci|simulador/i.test(nombre);
      return `<section class="indice-seccion${evaluacion ? ' indice-seccion--evaluacion' : ''}" aria-label="${escapar(titulo)}">
        <header class="indice-seccion__cabeza">
          <h3>${escapar(titulo)} <span class="sutil">· ${visibles} de ${tarjetas.length} a la vista</span></h3>
          <div class="indice-seccion__botones">
            <button class="boton boton--chico" type="button" data-seccion="${escapar(nombre)}" data-visible="true" data-foco="sec-si:${escapar(nombre)}" ${visibles === tarjetas.length ? 'disabled' : ''}>Mostrar sección</button>
            <button class="boton boton--chico" type="button" data-seccion="${escapar(nombre)}" data-visible="false" data-foco="sec-no:${escapar(nombre)}" ${visibles === 0 ? 'disabled' : ''}>Ocultar sección</button>
          </div>
        </header>
        <ul class="tarjetas-indice">${tarjetas
          .map((t) => {
            const ocupado = guardando.has(`indice|${t.id}`);
            return `<li class="tarjeta-indice${t.visible ? '' : ' tarjeta-indice--oculta'}">
              <button class="interruptor interruptor--indice${ocupado ? ' interruptor--guardando' : ''}" type="button" role="switch" aria-checked="${t.visible}"
                data-tarjeta="${escapar(t.id)}" data-foco="tarjeta:${escapar(t.id)}" ${ocupado ? 'aria-disabled="true" aria-busy="true"' : ''}>
                <span class="interruptor__pista" aria-hidden="true"></span>
                <span class="interruptor__texto">${escapar(t.titulo)}${t.etiqueta ? `<small>${escapar(t.etiqueta)}</small>` : ''}${
                  t.estado !== 'ok' ? '<small class="error">No cargó</small>' : ''
                }</span>
                <span class="interruptor__estado" aria-hidden="true">${ocupado ? 'guardando…' : t.visible ? 'Visible' : 'Oculta'}</span>
              </button>
              ${t.url ? `<a class="tarjeta-indice__ver" href="${escapar(t.url)}" target="_blank" rel="opener" data-foco="ver:${escapar(t.id)}" aria-label="Abrir ${escapar(t.titulo)}">Abrir</a>` : ''}
            </li>`;
          })
          .join('')}</ul>
      </section>`;
    })
    .join('');
}

async function cambiarVisible(ids, visible) {
  const pendientes = ids.filter((id) => indice.tarjetas.find((t) => t.id === id)?.visible !== visible);
  if (!pendientes.length) return;
  // Optimista: se ve el cambio de inmediato y se deshace si el servidor falla.
  const antes = new Map(indice.tarjetas.map((t) => [t.id, t.visible]));
  for (const id of pendientes) {
    guardando.add(`indice|${id}`);
    indice.tarjetas.find((t) => t.id === id).visible = visible;
  }
  pintarTodo();
  let fallo = null;
  for (const id of pendientes) {
    try {
      const nuevo = await llamar('api/docente/indice', { method: 'PUT', body: JSON.stringify({ id, visible }) });
      // Se conserva lo optimista de las que todavía no se guardan.
      for (const t of nuevo.tarjetas) {
        if (guardando.has(`indice|${t.id}`) && t.id !== id) t.visible = visible;
      }
      indice = { ...indice, tarjetas: nuevo.tarjetas, modulos: nuevo.modulos ?? indice.modulos };
    } catch (e) {
      fallo = e;
      const t = indice.tarjetas.find((x) => x.id === id);
      if (t) t.visible = antes.get(id);
    } finally {
      guardando.delete(`indice|${id}`);
    }
    if (fallo?.estado === 401) break;
  }
  for (const id of pendientes) guardando.delete(`indice|${id}`);
  pintarTodo();
  if (fallo?.estado === 401) return salir('La clave cambió en el servidor. Vuelve a entrar.');
  if (fallo) return avisar(`No se pudo guardar: ${fallo.message}.`, 'error');
  const una = pendientes.length === 1 ? indice.tarjetas.find((t) => t.id === pendientes[0])?.titulo : null;
  avisar(
    una
      ? `«${una}» ${visible ? 'ya se ve' : 'ya no se ve'} en el índice de los alumnos.`
      : `${pendientes.length} tarjetas ${visible ? 'ya se ven' : 'ya no se ven'} en el índice de los alumnos.`
  );
}

$('lista-indice').addEventListener('click', (e) => {
  const interruptor = e.target.closest('[data-tarjeta]');
  if (interruptor?.getAttribute('aria-disabled') === 'true') return;
  if (interruptor) {
    const id = interruptor.dataset.tarjeta;
    return cambiarVisible([id], interruptor.getAttribute('aria-checked') !== 'true');
  }
  const boton = e.target.closest('[data-seccion]');
  if (boton) {
    const ids = indice.tarjetas.filter((t) => (t.seccion || '') === boton.dataset.seccion).map((t) => t.id);
    cambiarVisible(ids, boton.dataset.visible === 'true');
  }
});

$('mostrar-todo').addEventListener('click', () => cambiarVisible(indice.tarjetas.map((t) => t.id), true));

/* ------------------------------------------------- controles de módulos */

function buscarControl(moduloId, controlId) {
  const t = tableros.get(moduloId);
  if (t?.tipo !== 'ok') return null;
  for (const g of t.datos.grupos ?? []) {
    const c = (g.controles ?? []).find((x) => x.id === controlId);
    if (c) return { t, g, c };
  }
  return null;
}

/**
 * Manda un cambio al módulo. `anteriorDado` es el valor que había antes de que
 * el docente empezara a mover una lista (para deshacer si falla): mientras la
 * lista espera, el valor que se ve ya es el nuevo.
 */
async function cambiarControl(moduloId, controlId, valor, anteriorDado) {
  const encontrado = buscarControl(moduloId, controlId);
  if (!encontrado) return;
  const { g, c } = encontrado;
  const m = indice.modulos.find((x) => x.id === moduloId);
  const llave = `${moduloId}|${controlId}`;
  const llaveGrupo = `${moduloId}|${g.titulo}`;
  if (guardando.has(llave)) {
    // Una lista que se movió mientras se guardaba el valor anterior: su último
    // valor se manda en cuanto termine, en lugar de tirarlo.
    if (c.tipo === 'seleccion') {
      siguiente.set(llave, valor);
      c.valor = valor;
    }
    return;
  }
  const anterior = anteriorDado !== undefined ? anteriorDado : c.valor;
  // La lista regresó a donde estaba: no hay nada que mandar.
  if (c.tipo === 'seleccion' && String(valor) === String(anterior)) {
    c.valor = anterior;
    return repintar();
  }

  // Cerrar algo que los alumnos están contestando se confirma, como en los paneles.
  if (esApertura(c) && c.valor === true && valor === false) {
    const ind = (g.indicadores ?? []).map((i) => `${escapar(i.etiqueta)}: <b>${escapar(i.valor)}</b>`).join(' · ');
    const si = await confirmar({
      titulo: `¿Cerrar ${queSeAbre(g, c)}?`,
      texto: `${ind ? `<p>${ind}</p>` : ''}<p>Quien no haya entregado ya no podrá hacerlo (su avance se queda guardado). Puedes volver a abrirlo después.</p>`,
      si: 'Sí, cerrar',
      no: 'Dejarlo abierto'
    });
    if (!si) return;
  }

  c.valor = valor; // optimista
  guardando.add(llave);
  errores.delete(llaveGrupo);
  repintar();
  let fallo = null;
  try {
    const datos = await llamar(`${m.url}api/docente/tablero`, {
      method: 'PUT',
      body: JSON.stringify({ control: controlId, valor })
    });
    tableros.set(moduloId, { tipo: 'ok', datos });
    const ahora = buscarControl(moduloId, controlId)?.c;
    const texto =
      c.tipo === 'seleccion'
        ? `${c.etiqueta}: ${(ahora?.opciones ?? c.opciones ?? []).find((o) => String(o.valor) === String(valor))?.etiqueta ?? valor}.`
        : esApertura(c)
          ? `${queSeAbre(g, c)}: ${valor ? 'abierto' : 'cerrado'}.`
          : `${g.titulo} · ${c.etiqueta}: ${valor ? 'sí' : 'no'}.`;
    // Si la lista ya se movió otra vez, el aviso espera al último valor.
    if (!siguiente.has(llave)) avisar(texto);
  } catch (e) {
    fallo = e;
    siguiente.delete(llave); // lo que venía detrás partía de un valor que no se guardó
    const sigue = buscarControl(moduloId, controlId)?.c;
    if (sigue) sigue.valor = anterior;
    if (e.estado === 401) {
      guardando.delete(llave);
      return salir('La clave cambió en el servidor. Vuelve a entrar.');
    }
    const mensaje = `No se guardó «${c.etiqueta}»: ${e.message}.`;
    errores.set(llaveGrupo, mensaje);
    avisar(mensaje, 'error');
  } finally {
    guardando.delete(llave);
    if (!fallo && siguiente.has(llave)) {
      const proximo = siguiente.get(llave);
      siguiente.delete(llave);
      cambiarControl(moduloId, controlId, proximo);
    } else {
      repintar();
    }
  }
}

document.addEventListener('click', (e) => {
  const boton = e.target.closest('[data-modulo][data-control]');
  if (!boton || boton.tagName === 'SELECT') return;
  if (boton.dataset.valor === 'false') return cambiarControl(boton.dataset.modulo, boton.dataset.control, false);
  if (boton.getAttribute('role') === 'switch') {
    cambiarControl(boton.dataset.modulo, boton.dataset.control, boton.getAttribute('aria-checked') !== 'true');
  }
});

// Las listas (en «Abierto ahora» y en los grupos) no guardan en cada «change»:
// esperan a que el docente deje de moverlas o salga de ellas.
document.addEventListener('change', (e) => {
  const sel = e.target.closest?.('select[data-control]');
  if (!sel) return;
  const { modulo, control: id } = sel.dataset;
  const c = buscarControl(modulo, id)?.c;
  if (!c) return;
  const llave = `${modulo}|${id}`;
  const espera = esperas.get(llave) ?? { anterior: c.valor };
  clearTimeout(espera.temporizador);
  espera.valor = sel.value;
  espera.temporizador = setTimeout(() => soltarLista(llave), ESPERA_LISTA_MS);
  esperas.set(llave, espera);
  c.valor = sel.value; // así un repintado mientras espera no la regresa
  // La misma lista puede estar arriba y en su grupo: las dos dicen lo mismo.
  for (const otra of document.querySelectorAll('select[data-control]')) {
    if (otra !== sel && otra.dataset.modulo === modulo && otra.dataset.control === id) otra.value = sel.value;
  }
});

function soltarLista(llave) {
  const espera = esperas.get(llave);
  if (!espera) return;
  clearTimeout(espera.temporizador);
  esperas.delete(llave);
  const corte = llave.indexOf('|');
  cambiarControl(llave.slice(0, corte), llave.slice(corte + 1), espera.valor, espera.anterior);
}

// Al salir de una lista se manda lo que tenga sin esperar, y se hace el
// repintado que se aplazó mientras la usaba. Con setTimeout: durante
// «focusout» el foco todavía no llega a su nuevo lugar y un repintado ahí lo
// perdería.
document.addEventListener('focusout', (e) => {
  const sel = e.target.closest?.('select[data-control]');
  if (!sel) return;
  const llave = `${sel.dataset.modulo}|${sel.dataset.control}`;
  setTimeout(() => {
    soltarLista(llave);
    if (repintarDespues) repintar();
  }, 0);
});

// Se recuerda qué grupos desplegó o plegó el docente. Con el clic (también
// llega con Enter o Espacio) y no con el evento «toggle»: ese también salta
// cuando el tablero se repinta, y lo automático no debe quedar como elección.
$('lista-modulos').addEventListener('click', (e) => {
  const resumen = e.target.closest('details[data-grupo] > summary');
  if (!resumen || $('buscar').value.trim()) return;
  const d = resumen.parentElement;
  plegado.set(d.dataset.grupo, !d.open); // el clic llega antes de que cambie
  recordarPlegado();
});

function plegarTodo(abrir) {
  for (const d of $('lista-modulos').querySelectorAll('details[data-grupo]')) {
    plegado.set(d.dataset.grupo, abrir);
    d.open = abrir;
  }
  recordarPlegado();
}
$('desplegar-todo').addEventListener('click', () => plegarTodo(true));
$('plegar-todo').addEventListener('click', () => plegarTodo(false));

$('buscar').addEventListener('input', () => pintarModulos());

/* ------------------------------------------------------------------ inicio */

if (clave) {
  // Se dice por qué se pide otra vez: la clave guardada ya no sirve, o el
  // servidor no contestó (entonces la clave puede estar bien).
  entrar(clave).catch((err) => {
    const vieja = /no es la clave/i.test(err.message);
    // Solo se olvida si de verdad ya no sirve; sin red, al recargar se reintenta.
    if (vieja) for (const llave of new Set([LLAVE, ...LLAVES_MODULOS])) escribir(llave, null);
    clave = '';
    $('error-clave').textContent = vieja ? 'Tu clave guardada ya no sirve (¿cambió en el servidor?). Escríbela de nuevo.' : err.message;
    $('clave').focus();
  });
} else {
  $('clave').focus();
}
