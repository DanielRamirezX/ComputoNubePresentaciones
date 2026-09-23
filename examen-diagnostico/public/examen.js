const $ = (id) => document.getElementById(id);
const LETRAS = ['A', 'B', 'C', 'D', 'E'];

let preguntas = [];
let respuestas = {};
let actual = 0;
let intentoId = null;
let guardadoPendiente = null;

/* ------------------------------------------------------------- arranque */

async function cargarExamen() {
  const r = await fetch('api/examen');
  const data = await r.json();
  preguntas = data.preguntas;
  $('materia').textContent = data.materia;
  document.title = `Diagnóstico · ${data.materia}`;
}

cargarExamen().catch(() => {
  $('error-inicio').textContent = 'No se pudo cargar el examen. Recarga la página.';
});

// Si el alumno recarga la página a media prueba, retomamos donde iba.
const guardado = sessionStorage.getItem('intento');
if (guardado) {
  try {
    const s = JSON.parse(guardado);
    intentoId = s.id;
    respuestas = s.respuestas || {};
    actual = s.actual || 0;
    cargarExamen().then(() => mostrar('examen'));
  } catch {
    sessionStorage.removeItem('intento');
  }
}

function recordar() {
  sessionStorage.setItem('intento', JSON.stringify({ id: intentoId, respuestas, actual }));
}

/* -------------------------------------------------------------- navegar */

function mostrar(pantalla) {
  for (const p of ['inicio', 'examen', 'revision', 'fin']) {
    $(`pantalla-${p}`).classList.toggle('oculto', p !== pantalla);
  }
  window.scrollTo(0, 0);
  if (pantalla === 'examen') pintarPregunta();
  if (pantalla === 'revision') pintarRevision();
}

$('btn-comenzar').addEventListener('click', async () => {
  const nombre = $('nombre').value.trim();
  const grupo = $('grupo').value.trim();
  $('error-inicio').textContent = '';

  if (nombre.length < 3) {
    $('error-inicio').textContent = 'Escribe tu nombre completo para continuar.';
    return;
  }
  if (!grupo) {
    $('error-inicio').textContent = 'Falta el grupo.';
    return;
  }

  $('btn-comenzar').disabled = true;
  try {
    const r = await fetch('api/intentos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, grupo, matricula: $('matricula').value.trim() })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'No se pudo iniciar');
    intentoId = data.id;
    actual = 0;
    respuestas = {};
    recordar();
    mostrar('examen');
  } catch (e) {
    $('error-inicio').textContent = e.message;
  } finally {
    $('btn-comenzar').disabled = false;
  }
});

/* ------------------------------------------------------------- pregunta */

function pintarPregunta() {
  const p = preguntas[actual];
  if (!p) return;

  const partes = p.texto.split('\n\n');
  $('tema').textContent = p.tema;
  $('enunciado').textContent = partes[0];

  const codigo = partes.slice(1).join('\n\n');
  $('codigo').classList.toggle('oculto', !codigo);
  $('codigo').textContent = codigo;

  $('posicion').textContent = `Pregunta ${actual + 1} de ${preguntas.length}`;
  const faltan = preguntas.length - Object.keys(respuestas).length;
  $('pendientes').textContent = faltan === 0 ? 'Ya contestaste todas' : `Faltan ${faltan}`;

  const cont = $('opciones');
  cont.innerHTML = '';
  p.opciones.forEach((texto, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'opcion';
    b.setAttribute('aria-pressed', String(respuestas[p.id] === i));
    b.innerHTML = `<span class="letra">${LETRAS[i]}</span><span></span>`;
    b.lastElementChild.textContent = texto;
    b.addEventListener('click', () => responder(p.id, i));
    cont.appendChild(b);
  });

  $('btn-anterior').disabled = actual === 0;
  $('btn-siguiente').textContent = actual === preguntas.length - 1 ? 'Revisar y entregar' : 'Siguiente';
  pintarRegla($('regla'), true);
}

function responder(id, i) {
  respuestas[id] = i;
  recordar();
  guardarParcial();
  pintarPregunta();
  // Avanza solo, sin brincarse la última.
  if (actual < preguntas.length - 1) {
    setTimeout(() => {
      actual += 1;
      recordar();
      pintarPregunta();
    }, 180);
  }
}

function pintarRegla(contenedor, interactiva) {
  contenedor.innerHTML = '';
  preguntas.forEach((p, i) => {
    const m = document.createElement('button');
    m.type = 'button';
    m.className = 'marca';
    if (respuestas[p.id] !== undefined) m.classList.add('contestada');
    if (interactiva && i === actual) m.classList.add('actual');
    m.setAttribute('aria-label', `Pregunta ${i + 1}${respuestas[p.id] !== undefined ? ', contestada' : ', sin contestar'}`);
    m.addEventListener('click', () => {
      actual = i;
      recordar();
      mostrar('examen');
    });
    contenedor.appendChild(m);
  });
}

$('btn-anterior').addEventListener('click', () => {
  if (actual > 0) {
    actual -= 1;
    recordar();
    pintarPregunta();
  }
});

$('btn-siguiente').addEventListener('click', () => {
  if (actual < preguntas.length - 1) {
    actual += 1;
    recordar();
    pintarPregunta();
  } else {
    mostrar('revision');
  }
});

/* ------------------------------------------------------ guardado parcial */

function guardarParcial() {
  clearTimeout(guardadoPendiente);
  guardadoPendiente = setTimeout(() => {
    if (!intentoId) return;
    fetch(`api/intentos/${intentoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ respuestas })
    }).catch(() => {});
  }, 800);
}

/* ------------------------------------------------------------- revisión */

function pintarRevision() {
  const faltan = preguntas.filter((p) => respuestas[p.id] === undefined).length;
  $('texto-revision').textContent =
    faltan === 0
      ? 'Contestaste las 20 preguntas. Una vez que entregues ya no podrás cambiar tus respuestas.'
      : `Te faltan ${faltan} preguntas por contestar. Puedes entregar así, pero cuentan como error.`;
  pintarRegla($('regla-revision'), false);
}

$('btn-volver').addEventListener('click', () => {
  const pendiente = preguntas.findIndex((p) => respuestas[p.id] === undefined);
  actual = pendiente === -1 ? preguntas.length - 1 : pendiente;
  mostrar('examen');
});

$('btn-entregar').addEventListener('click', async () => {
  $('btn-entregar').disabled = true;
  $('error-entrega').textContent = '';
  try {
    const r = await fetch(`api/intentos/${intentoId}/entregar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ respuestas })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'No se pudo entregar');
    sessionStorage.removeItem('intento');
    pintarResultado(data);
    mostrar('fin');
  } catch (e) {
    $('error-entrega').textContent = e.message + '. Revisa tu conexión e inténtalo otra vez.';
    $('btn-entregar').disabled = false;
  }
});

/* ------------------------------------------------------------ resultado */

function pintarResultado(data) {
  const cont = $('resultado');
  if (data.porcentaje === undefined) {
    cont.innerHTML = '<p>Tu examen quedó registrado. Los resultados los revisamos en clase.</p>';
    return;
  }

  const barras = (data.porTema || [])
    .map((t) => {
      const pct = Math.round((t.aciertos / t.total) * 100);
      return `<div class="barra ${pct < 60 ? 'debil' : ''}">
          <div><span class="etiqueta">${t.tema}</span>
            <div class="pista"><div class="relleno" style="width:${pct}%"></div></div>
          </div>
          <b>${t.aciertos}/${t.total}</b>
        </div>`;
    })
    .join('');

  cont.innerHTML = `
    <div class="hoja">
      <div class="cifra">${data.aciertos}<span> de ${data.total} aciertos</span></div>
      <p class="sutil" style="margin-top:14px">Equivale al ${data.porcentaje}%. Esto no afecta tu calificación.</p>
      <h3>Cómo te fue por tema</h3>
      ${barras}
    </div>
    <p class="sutil" style="margin-top:18px">Ya puedes cerrar esta página.</p>`;
}
