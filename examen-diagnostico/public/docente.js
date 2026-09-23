const $ = (id) => document.getElementById(id);
let clave = sessionStorage.getItem('clave-docente') || '';

const texto = (s) => String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

async function entrar(valor) {
  const r = await fetch('api/docente/entrar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clave: valor })
  });
  if (!r.ok) throw new Error('Clave incorrecta');
  const data = await r.json();
  clave = valor;
  sessionStorage.setItem('clave-docente', valor);
  $('materia').textContent = data.materia;
  $('aviso-clave').classList.toggle('oculto', !data.claveInsegura);
  $('pantalla-clave').classList.add('oculto');
  $('pantalla-panel').classList.remove('oculto');
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

if (clave) entrar(clave).catch(() => sessionStorage.removeItem('clave-docente'));

/* ----------------------------------------------------------------- datos */

async function cargar() {
  $('error-panel').textContent = '';
  const grupo = $('grupo').value;
  const r = await fetch(`api/docente/resumen?grupo=${encodeURIComponent(grupo)}`, {
    headers: { 'x-clave-docente': clave }
  });
  if (!r.ok) {
    $('error-panel').textContent = 'La sesión expiró. Recarga la página y vuelve a entrar.';
    return;
  }
  pintar(await r.json());
}

$('btn-recargar').addEventListener('click', cargar);
$('grupo').addEventListener('change', cargar);

function pintar(d) {
  // Selector de grupos, conservando el actual
  const actual = $('grupo').value;
  $('grupo').innerHTML =
    '<option value="">Todos</option>' +
    d.grupos.map((g) => `<option value="${texto(g)}"${g === actual ? ' selected' : ''}>${texto(g)}</option>`).join('');

  $('tarjeta-promedio').innerHTML = `
    <div class="cifra">${d.promedio}<span> % promedio grupal</span></div>
    <div class="cifras">
      <div><span>Terminaron</span><b>${d.terminados}</b></div>
      <div><span>Sin terminar</span><b>${d.enProceso}</b></div>
      <div><span>Mediana</span><b>${d.mediana}%</b></div>
      <div><span>Desviación</span><b>${d.desviacion} pts</b></div>
      <div><span>Rango</span><b>${d.minimo}% a ${d.maximo}%</b></div>
      <div><span>Arriba de 60%</span><b>${d.aprobados} de ${d.terminados}</b></div>
    </div>`;

  const maxAlumnos = Math.max(1, ...d.distribucion.map((x) => x.alumnos));
  $('distribucion').innerHTML = d.distribucion
    .map(
      (x) => `<div class="barra ${x.etiqueta === '0 a 39' || x.etiqueta === '40 a 59' ? 'debil' : ''}">
        <div><span class="etiqueta">${x.etiqueta}% de aciertos</span>
          <div class="pista"><div class="relleno" style="width:${(x.alumnos / maxAlumnos) * 100}%"></div></div>
        </div><b>${x.alumnos}</b></div>`
    )
    .join('');

  $('temas').innerHTML = d.porTema
    .map(
      (t) => `<div class="barra ${t.porcentaje < 60 ? 'debil' : ''}">
        <div><span class="etiqueta">${texto(t.tema)}</span>
          <div class="pista"><div class="relleno" style="width:${t.porcentaje}%"></div></div>
        </div><b>${t.porcentaje}%</b></div>`
    )
    .join('');

  const debiles = d.porTema.filter((t) => t.porcentaje < 60).map((t) => t.tema);
  $('recomendacion').textContent =
    d.terminados === 0
      ? 'Todavía no hay exámenes entregados.'
      : debiles.length
        ? `Conviene nivelar antes de entrar a contenidos de nube: ${debiles.join(', ')}.`
        : 'Ningún tema quedó por debajo del 60%. El grupo puede arrancar con el temario normal.';

  $('tabla-preguntas').innerHTML = d.preguntas
    .map(
      (p) => `<tr class="${p.porcentaje < 50 ? 'debil' : ''}">
        <td>${texto(p.texto)}</td><td>${texto(p.tema)}</td>
        <td class="num">${p.porcentaje}%</td><td class="num">${p.sinContestar}</td></tr>`
    )
    .join('');

  $('tabla-alumnos').innerHTML = d.alumnos.length
    ? d.alumnos
        .map(
          (a) => `<tr class="${a.porcentaje < 60 ? 'debil' : ''}">
            <td>${texto(a.nombre)}</td><td>${texto(a.matricula)}</td>
            <td class="num">${a.aciertos}/${a.total}</td><td class="num">${a.porcentaje}%</td>
            <td class="num">${a.minutos ?? ''}</td></tr>`
        )
        .join('')
    : '<tr><td colspan="5">Sin exámenes entregados por ahora.</td></tr>';
}

/* -------------------------------------------------------------- descargas */

const liga = (ruta) =>
  `${ruta}?grupo=${encodeURIComponent($('grupo').value)}&clave=${encodeURIComponent(clave)}`;

$('btn-pdf').addEventListener('click', () => window.open(liga('api/docente/reporte.pdf'), '_blank'));
$('btn-csv').addEventListener('click', () => window.open(liga('api/docente/datos.csv'), '_blank'));

$('btn-borrar').addEventListener('click', async () => {
  const grupo = $('grupo').value;
  const cual = grupo ? `del grupo ${grupo}` : 'de todos los grupos';
  if (!confirm(`Se borran los intentos ${cual}. Esto no se puede deshacer. ¿Continuar?`)) return;

  const r = await fetch(`api/docente/intentos?grupo=${encodeURIComponent(grupo)}`, {
    method: 'DELETE',
    headers: { 'x-clave-docente': clave }
  });
  if (!r.ok) {
    $('error-panel').textContent = 'No se pudieron borrar los intentos.';
    return;
  }
  await cargar();
});
