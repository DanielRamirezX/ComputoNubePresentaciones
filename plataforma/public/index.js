const $ = (id) => document.getElementById(id);

const escapar = (t) =>
  String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function tarjeta(m) {
  const etiqueta = m.etiqueta ? `<span class="tarjeta__etiqueta">${escapar(m.etiqueta)}</span>` : '';
  const cuerpo = `
    ${etiqueta}
    <h2>${escapar(m.titulo)}</h2>
    <p>${escapar(m.resumen)}</p>`;

  if (m.estado !== 'ok') {
    return `<div class="tarjeta tarjeta--error">
      <span class="tarjeta__etiqueta">No disponible</span>
      <h2>${escapar(m.titulo)}</h2>
      <p>Este material no cargó. El docente ya lo está viendo.</p>
      <p class="tarjeta__detalle">${escapar(m.detalle)}</p>
    </div>`;
  }

  const fuera = m.externo ? ' target="_blank" rel="noopener"' : '';
  return `<a class="tarjeta" href="${escapar(m.url)}"${fuera}>
    ${cuerpo}
    <span class="tarjeta__abrir">Abrir</span>
  </a>`;
}

async function cargar() {
  try {
    const r = await fetch('api/curso');
    if (!r.ok) throw new Error('respuesta ' + r.status);
    const datos = await r.json();

    document.title = datos.materia;
    $('materia').textContent = datos.materia;

    const partes = [];
    if (datos.docente && datos.docente !== 'Por definir') partes.push(datos.docente);
    if (datos.grupo && datos.grupo !== 'Por definir') partes.push('Grupo ' + datos.grupo);
    $('pie').textContent = partes.join(' · ');

    $('etiqueta').textContent = `${datos.modulos.length} material${datos.modulos.length === 1 ? '' : 'es'}`;
    $('rejilla').innerHTML = datos.modulos.map(tarjeta).join('');
    // El mismo texto no puede ser cierto en los dos lados: local, este servidor
    // es la laptop del docente; desplegado, es un servidor rentado. Decirlo bien
    // es media clase de la materia.
    $('pie-donde').innerHTML = datos.publica
      ? 'Este servidor ya no vive en la laptop del docente: corre en un centro de datos rentado, y sigue abierto aunque el salón esté vacío. Eso es <b>PaaS</b>.'
      : 'Este servidor corre en la laptop del docente, dentro de la red del salón. Si se apaga, la página deja de abrir: es justo lo que significa <b>on-premises</b>.';

    $('cargando').hidden = true;
    $('rejilla').hidden = false;
  } catch (e) {
    $('cargando').textContent =
      'No pude contactar al servidor. Revisa que sigas conectado al Wi-Fi del salón.';
  }
}

cargar();
