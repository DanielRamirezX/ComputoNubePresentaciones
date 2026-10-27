// El reporte de evidencia de una evaluación: un documento HTML suelto, listo
// para imprimir o guardar en PDF, con todo lo que la rúbrica revisó de cada
// alumno. Sirve como constancia ante la institución: quién entregó, a qué
// hora, cuánto sacó, qué cumplió y qué no (con la explicación de cada punto),
// y qué le preguntó al asistente.
//
// No depende del panel ni de la plataforma: el HTML trae sus estilos y se
// puede abrir sin conexión. Lo arma app.js con los datos del almacén.

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const decimal = (n) => (Number.isFinite(n) ? (Math.round(n * 10) / 10).toLocaleString('es-MX', { maximumFractionDigits: 1 }) : '—');

/** El estado de una tarea, en palabras (una tarea bono sin hacer no es un error). */
function estadoTarea(t) {
  const completa = t.puntos > 0 && t.obtenidos >= t.puntos;
  if (t.bono) return completa ? ['Bono completo', 'bien'] : t.obtenidos > 0 ? ['Bono parcial', 'media'] : ['Bono no realizado (no resta puntos)', 'neutra'];
  return completa ? ['Completa', 'bien'] : t.obtenidos > 0 ? ['Incompleta', 'media'] : ['No realizada', 'mal'];
}

const repasoTexto = (lista) => (lista ?? []).map((r) => `Sesión ${r.sesion} · ${r.leccion}${r.parte ? ` › ${r.parte}` : ''}`).join(' · ');

function tablaChecks(t) {
  return `<table class="checks">
    <thead><tr><th class="c-estado">Resultado</th><th>Punto revisado</th><th class="c-pts">Puntos</th><th>Explicación</th></tr></thead>
    <tbody>${(t.checks ?? [])
      .map(
        (c) => `<tr class="${c.ok ? 'fila--bien' : t.bono ? 'fila--neutra' : 'fila--mal'}">
          <td class="c-estado">${c.ok ? '✔ Cumplido' : '✘ No cumplido'}</td>
          <td>${esc(c.texto)}${c.repaso?.length ? `<div class="repaso">Se vio en: ${esc(repasoTexto(c.repaso))}</div>` : ''}</td>
          <td class="c-pts">${t.bono ? '+' : ''}${decimal(c.ok ? c.puntos : 0)} / ${decimal(c.puntos)}</td>
          <td>${esc(c.retro)}</td>
        </tr>`
      )
      .join('')}</tbody>
  </table>`;
}

function seccionPractica(p, maxPreguntas, fecha) {
  if (!p) return '';
  const r = p.resultado;
  if (!r) return `<h3>Parte práctica</h3><p class="sin">Sin entrega${p.estado === 'en-curso' ? ` (la empezó a las ${esc(fecha(p.inicio))} y no entregó)` : ''}.</p>`;

  const requeridas = r.tareas.filter((t) => !t.bono);
  const bonos = r.tareas.filter((t) => t.bono);
  const base = requeridas.reduce((s, t) => s + t.obtenidos, 0);
  const bono = bonos.reduce((s, t) => s + t.obtenidos, 0);
  const checks = requeridas.flatMap((t) => t.checks ?? []);
  const datos = p.datos
    ? Object.entries(p.datos)
        .filter(([k, v]) => !['nombre', 'matricula', 'userData'].includes(k) && (typeof v === 'string' || typeof v === 'number'))
        .map(([k, v]) => `<span><b>${esc(k)}</b> ${esc(v)}</span>`)
        .join('')
    : '';
  const conversacion = Array.isArray(p.conversacion) ? p.conversacion : [];
  const preguntas = conversacion.filter((m) => m.rol === 'alumno').length;

  return `
    <h3>Parte práctica</h3>
    <table class="resumen-alumno">
      <tr><th>Calificación</th><td><strong>${decimal(r.calificacion)}</strong> de 10 (${decimal(r.obtenidos)} de ${r.total} puntos)</td></tr>
      ${bonos.length ? `<tr><th>Desglose</th><td>Lo requerido: ${decimal(base)} de 100 · bono opcional: +${decimal(bono)} de ${decimal(bonos.reduce((s, t) => s + t.puntos, 0))} posibles${base + bono > 100 ? ' (la calificación se queda en 100)' : ''}</td></tr>` : ''}
      <tr><th>Tareas completas</th><td>${requeridas.filter((t) => estadoTarea(t)[1] === 'bien').length} de ${requeridas.length}</td></tr>
      <tr><th>Puntos revisados cumplidos</th><td>${checks.filter((c) => c.ok).length} de ${checks.length} (sin contar el bono)</td></tr>
      <tr><th>Folio</th><td class="mono">${esc(r.folio)}</td></tr>
      <tr><th>Inicio</th><td>${esc(fecha(r.inicio))}</td></tr>
      <tr><th>Entrega</th><td>${esc(fecha(r.fin))}${p.minutos ? ` (${p.minutos} min)` : ''}</td></tr>
      ${p.restaurada ? '<tr><th>Origen</th><td>Repuesta desde el comprobante firmado del alumno, después de un reinicio del servidor</td></tr>' : ''}
      ${maxPreguntas ? `<tr><th>Asistente de IA</th><td>${preguntas} de ${maxPreguntas} preguntas usadas</td></tr>` : ''}
    </table>
    ${datos ? `<p class="datos"><b>Sus datos del laboratorio:</b> ${datos}</p>` : ''}
    <ol class="tareas">${r.tareas
      .map((t) => {
        const [estado, clase] = estadoTarea(t);
        return `<li class="tarea">
          <div class="tarea__cabeza tarea--${clase}">
            <span class="tarea__titulo">${t.bono ? 'Bono (opcional) · ' : ''}${esc(t.titulo)}</span>
            <span class="tarea__estado">${estado}</span>
            <span class="tarea__pts">${t.bono ? '+' : ''}${decimal(t.obtenidos)} / ${decimal(t.puntos)}</span>
          </div>
          ${tablaChecks(t)}
        </li>`;
      })
      .join('')}</ol>
    ${
      maxPreguntas || conversacion.length
        ? `<h4>Conversación con el asistente de IA</h4>${
            conversacion.length
              ? `<ol class="chat">${conversacion
                  .map(
                    (m) => `<li class="chat--${m.rol === 'alumno' ? 'alumno' : 'asistente'}"><b>${m.rol === 'alumno' ? 'Alumno' : 'Asistente'}</b> <span class="hora">${esc(fecha(m.hora))}</span>${m.rechazo ? ' <i>(declinada, no contó)</i>' : ''}<div>${esc(m.texto).replace(/\n/g, '<br>')}</div></li>`
                  )
                  .join('')}</ol>`
              : '<p class="sin">No usó el asistente.</p>'
          }`
        : ''
    }`;
}

function seccionTeoria(t, fecha) {
  if (!t) return '';
  const r = t.resultado;
  if (!r) return `<h3>Parte teórica</h3><p class="sin">Sin entrega.</p>`;
  return `
    <h3>Parte teórica</h3>
    <table class="resumen-alumno">
      <tr><th>Calificación</th><td><strong>${decimal(r.calificacion)}</strong> de 10 (${r.aciertos} de ${r.total} aciertos)</td></tr>
      <tr><th>Folio</th><td class="mono">${esc(r.folio)}</td></tr>
      <tr><th>Inicio</th><td>${esc(fecha(r.inicio))}</td></tr>
      <tr><th>Entrega</th><td>${esc(fecha(r.fin))}</td></tr>
    </table>
    <table class="checks">
      <thead><tr><th class="c-estado">Resultado</th><th>Pregunta</th><th>Su respuesta</th><th>Respuesta correcta</th></tr></thead>
      <tbody>${(r.detalle ?? [])
        .map(
          (d, i) => `<tr class="${d.acerto ? 'fila--bien' : 'fila--mal'}">
            <td class="c-estado">${d.acerto ? '✔ Correcta' : '✘ Incorrecta'}</td>
            <td>${i + 1}. ${esc(d.texto)}</td>
            <td>${d.elegida ? esc(d.elegida.texto) : '<i>Sin contestar</i>'}</td>
            <td>${esc(d.correcta.texto)}</td>
          </tr>`
        )
        .join('')}</tbody>
    </table>`;
}

/**
 * El documento completo.
 * `alumnos`: [{ nombre, matricula, grupo, combinada, teoria, practica }], donde
 * teoria y practica son las filas del panel más `resultado` (con retro
 * completa), y la práctica además trae `datos` y `conversacion`.
 */
export function reporteHtml({ materia, ev, alumnos, grupo, generado, zona, maxPreguntas }) {
  const fecha = (iso) => (iso ? new Date(iso).toLocaleString('es-MX', { timeZone: zona, dateStyle: 'medium', timeStyle: 'short' }) : '—');
  const partes = Object.keys(ev.pesos);
  const conAsistente = maxPreguntas > 0;
  const entregaron = alumnos.filter((a) => partes.every((p) => a[p]?.resultado)).length;

  const fila = (a, i) => {
    const p = a.practica?.resultado;
    const t = a.teoria?.resultado;
    const calif = partes.length > 1 ? (a.combinada === null ? null : a.combinada / 10) : (p ?? t)?.calificacion;
    return `<tr>
      <td>${i + 1}</td>
      <td>${esc(a.nombre)}</td>
      <td class="mono">${esc(a.matricula || '—')}</td>
      <td>${esc(a.grupo)}</td>
      ${partes.includes('teoria') ? `<td>${t ? `${t.aciertos}/${t.total}` : 'Sin entrega'}</td>` : ''}
      ${partes.includes('practica') ? `<td>${p ? `${decimal(p.obtenidos)}/${p.total}` : 'Sin entrega'}</td>` : ''}
      ${partes.includes('practica') ? `<td>${p ? `${p.tareas.filter((x) => !x.bono && x.puntos > 0 && x.obtenidos >= x.puntos).length}/${p.tareas.filter((x) => !x.bono).length}` : '—'}</td>` : ''}
      ${conAsistente ? `<td>${a.practica?.resultado ? (a.practica.conversacion ?? []).filter((m) => m.rol === 'alumno').length : '—'}</td>` : ''}
      <td>${esc(fecha((p ?? t)?.fin))}</td>
      <td><strong>${calif === null || calif === undefined ? '—' : decimal(calif)}</strong></td>
    </tr>`;
  };

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reporte · ${esc(ev.titulo)}${grupo ? ` · ${esc(grupo)}` : ''}</title>
<style>
  :root { color-scheme: light; --tinta: #1b2333; --sutil: #5b6475; --linea: #d5dae3; --bien: #1f7a3f; --bien-f: #e8f5ec; --mal: #b3261e; --mal-f: #fbeceb; --media: #9a6200; --media-f: #fff4dd; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #fff; color: var(--tinta); font: 13px/1.45 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
  main { max-width: 1000px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 17px; margin: 0 0 2px; }
  h3 { font-size: 15px; margin: 18px 0 8px; border-bottom: 2px solid var(--tinta); padding-bottom: 3px; }
  h4 { font-size: 14px; margin: 16px 0 6px; }
  .sutil, .repaso, .hora { color: var(--sutil); }
  .repaso { font-size: 11px; margin-top: 2px; }
  .mono { font-family: ui-monospace, Consolas, monospace; }
  .barra { display: flex; gap: 8px; align-items: center; justify-content: space-between; flex-wrap: wrap; background: #f3f5f8; border: 1px solid var(--linea); border-radius: 8px; padding: 10px 12px; margin: 12px 0 18px; }
  .barra button { font: inherit; font-weight: 600; padding: 8px 14px; border-radius: 6px; border: 0; background: #1b2333; color: #fff; cursor: pointer; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0; }
  th, td { border: 1px solid var(--linea); padding: 5px 7px; text-align: left; vertical-align: top; }
  thead th { background: #eef1f5; }
  .tabla-scroll { overflow-x: auto; }
  .resumen-alumno { width: auto; min-width: 60%; }
  .resumen-alumno th { background: #f6f7f9; width: 210px; }
  .c-estado { width: 112px; white-space: nowrap; font-weight: 600; }
  .c-pts { width: 72px; white-space: nowrap; text-align: right; }
  .fila--bien .c-estado { color: var(--bien); background: var(--bien-f); }
  .fila--mal .c-estado { color: var(--mal); background: var(--mal-f); }
  .fila--neutra .c-estado { color: var(--sutil); }
  .alumno { border-top: 3px solid var(--tinta); margin-top: 28px; padding-top: 12px; break-before: page; }
  .tareas { list-style: none; padding: 0; margin: 10px 0 0; }
  .tarea { margin: 0 0 12px; break-inside: avoid; }
  .tarea__cabeza { display: flex; gap: 10px; align-items: baseline; padding: 6px 8px; border-radius: 6px 6px 0 0; border: 1px solid var(--linea); border-bottom: 0; }
  .tarea__titulo { font-weight: 700; flex: 1; }
  .tarea__estado { font-weight: 600; }
  .tarea__pts { font-weight: 700; white-space: nowrap; }
  .tarea--bien { background: var(--bien-f); } .tarea--bien .tarea__estado { color: var(--bien); }
  .tarea--mal { background: var(--mal-f); } .tarea--mal .tarea__estado { color: var(--mal); }
  .tarea--media { background: var(--media-f); } .tarea--media .tarea__estado { color: var(--media); }
  .tarea--neutra { background: #f3f5f8; } .tarea--neutra .tarea__estado { color: var(--sutil); }
  .tarea table { margin-top: 0; }
  .datos span { display: inline-block; margin-right: 12px; }
  .sin { color: var(--sutil); font-style: italic; }
  .chat { padding-left: 18px; }
  .chat li { margin-bottom: 8px; break-inside: avoid; }
  .chat div { margin-top: 2px; }
  .chat--asistente div { color: #2b3a55; }
  .firmas { display: flex; gap: 32px; margin-top: 36px; flex-wrap: wrap; }
  .firmas div { flex: 1; min-width: 220px; border-top: 1px solid var(--tinta); padding-top: 4px; text-align: center; color: var(--sutil); }
  @media print {
    @page { size: letter; margin: 14mm 12mm; }
    body { font-size: 11px; }
    main { max-width: none; padding: 0; }
    .barra { display: none; }
    .tabla-scroll { overflow: visible; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<main>
  <p class="sutil">${esc(materia)}</p>
  <h1>Reporte de evidencia · ${esc(ev.titulo)}</h1>
  <p>Aplicación: ${esc(ev.fechaTexto)} · Grupo: ${esc(grupo || 'todos')} · ${alumnos.length} alumno${alumnos.length === 1 ? '' : 's'} · ${entregaron} con entrega completa</p>
  <p class="sutil">Generado: ${esc(fecha(generado))} · La calificación de la práctica la calcula una rúbrica automática sobre cómo quedó la cuenta de la consola simulada de cada alumno al entregar; cada punto que revisó aparece abajo con su resultado, sus puntos y su explicación.</p>
  <div class="barra"><span>Para guardarlo como PDF, usa «Imprimir» y elige «Guardar como PDF». Cada alumno empieza en una hoja nueva.</span><button type="button" onclick="window.print()">Imprimir o guardar en PDF</button></div>

  <h2>Resumen</h2>
  <div class="tabla-scroll"><table>
    <thead><tr>
      <th>#</th><th>Nombre</th><th>Matrícula</th><th>Grupo</th>
      ${partes.includes('teoria') ? '<th>Teórica</th>' : ''}
      ${partes.includes('practica') ? '<th>Práctica (puntos)</th><th>Tareas completas</th>' : ''}
      ${conAsistente ? '<th>Preguntas al asistente</th>' : ''}
      <th>Entrega</th><th>Calificación (0-10)</th>
    </tr></thead>
    <tbody>${alumnos.map(fila).join('') || `<tr><td colspan="9" class="sin">Nadie se ha registrado en esta evaluación.</td></tr>`}</tbody>
  </table></div>

  ${alumnos
    .map(
      (a, i) => `<section class="alumno">
        <h2>${i + 1}. ${esc(a.nombre)}</h2>
        <p>Matrícula <span class="mono">${esc(a.matricula || '—')}</span> · Grupo ${esc(a.grupo)} · ${esc(ev.titulo)}</p>
        ${partes.includes('teoria') ? seccionTeoria(a.teoria, fecha) : ''}
        ${partes.includes('practica') ? seccionPractica(a.practica, maxPreguntas, fecha) : ''}
        <div class="firmas"><div>Nombre y firma del docente</div><div>Nombre y firma del alumno</div></div>
      </section>`
    )
    .join('')}
</main>
</body>
</html>`;
}
