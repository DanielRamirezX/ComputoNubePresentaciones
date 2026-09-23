import PDFDocument from 'pdfkit';

const TINTA = '#16231A';
const SUAVE = '#5C6B5E';
const LINEA = '#C9D3C2';
const DATO = '#1F4E5F';
const ALERTA = '#B3261E';

const MARGEN = 48;
const ANCHO = 612 - MARGEN * 2;

const fecha = (iso) =>
  new Date(iso).toLocaleString('es-MX', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Mexico_City'
  });

function recorta(doc, texto, ancho, fuente, tam) {
  doc.font(fuente).fontSize(tam);
  let t = String(texto ?? '');
  if (doc.widthOfString(t) <= ancho) return t;
  while (t.length > 1 && doc.widthOfString(t + '...') > ancho) t = t.slice(0, -1);
  return t + '...';
}

function regla(doc, y, color = LINEA) {
  doc.save().lineWidth(0.75).strokeColor(color).moveTo(MARGEN, y).lineTo(MARGEN + ANCHO, y).stroke().restore();
}

function titulo(doc, texto) {
  doc.font('Helvetica-Bold').fontSize(12).fillColor(TINTA).text(texto, MARGEN, doc.y);
  doc.moveDown(0.35);
  regla(doc, doc.y);
  doc.moveDown(0.7);
}

/** Barra horizontal con etiqueta a la izquierda y valor a la derecha. */
function barra(doc, { etiqueta, valor, maximo, sufijo = '%', color = DATO, anchoEtiqueta = 190 }) {
  const y = doc.y;
  const anchoPista = ANCHO - anchoEtiqueta - 52;
  const x = MARGEN + anchoEtiqueta;
  const proporcion = maximo > 0 ? Math.max(0, Math.min(1, valor / maximo)) : 0;

  doc.font('Helvetica').fontSize(9).fillColor(TINTA);
  doc.text(recorta(doc, etiqueta, anchoEtiqueta - 10, 'Helvetica', 9), MARGEN, y + 1.5, {
    width: anchoEtiqueta - 10,
    lineBreak: false
  });

  doc.save();
  doc.roundedRect(x, y, anchoPista, 11, 1.5).fillColor('#E8EDE4').fill();
  if (proporcion > 0) {
    doc.roundedRect(x, y, Math.max(2, anchoPista * proporcion), 11, 1.5).fillColor(color).fill();
  }
  doc.restore();

  doc.font('Helvetica-Bold').fontSize(9).fillColor(TINTA);
  doc.text(`${valor}${sufijo}`, x + anchoPista + 8, y + 1.5, { width: 44, lineBreak: false });
  doc.y = y + 17;
}

function encabezadoTabla(doc, columnas) {
  const y = doc.y;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(SUAVE);
  let x = MARGEN;
  for (const c of columnas) {
    doc.text(c.titulo, x, y, { width: c.ancho, align: c.align || 'left', lineBreak: false });
    x += c.ancho;
  }
  doc.y = y + 13;
  regla(doc, doc.y - 3);
}

function filaTabla(doc, columnas, valores, { resaltar = false } = {}) {
  if (doc.y > 720) {
    doc.addPage();
    encabezadoTabla(doc, columnas);
  }
  const y = doc.y;
  let x = MARGEN;
  doc.font('Helvetica').fontSize(9).fillColor(resaltar ? ALERTA : TINTA);
  for (let i = 0; i < columnas.length; i++) {
    const c = columnas[i];
    doc.text(recorta(doc, valores[i], c.ancho - 6, 'Helvetica', 9), x, y, {
      width: c.ancho - 6,
      align: c.align || 'left',
      lineBreak: false
    });
    x += c.ancho;
  }
  doc.y = y + 14;
  doc.save().lineWidth(0.4).strokeColor('#E4EADF').moveTo(MARGEN, doc.y - 3).lineTo(MARGEN + ANCHO, doc.y - 3).stroke().restore();
}

export function generarReporte(resumen, { materia = 'Cómputo en la Nube', docente = '' } = {}) {
  const doc = new PDFDocument({ size: 'LETTER', margin: MARGEN, bufferPages: true });
  doc.info.Title = `Diagnóstico ${materia}${resumen.grupo ? ' - ' + resumen.grupo : ''}`;

  // ---------- Portada / resumen ----------
  doc.font('Helvetica').fontSize(9).fillColor(SUAVE).text(materia, MARGEN, MARGEN);
  doc.font('Helvetica-Bold').fontSize(22).fillColor(TINTA).text('Examen diagnóstico de fundamentos', {
    width: ANCHO
  });
  doc.moveDown(0.3);
  doc
    .font('Helvetica')
    .fontSize(9.5)
    .fillColor(SUAVE)
    .text(
      `Grupo: ${resumen.grupo || 'todos'}   |   Generado el ${fecha(resumen.generado)}${
        docente ? '   |   ' + docente : ''
      }`,
      { width: ANCHO }
    );

  doc.moveDown(1.2);
  regla(doc, doc.y);
  doc.moveDown(1);

  // Promedio grande
  const yProm = doc.y;
  doc.font('Helvetica-Bold').fontSize(56).fillColor(DATO).text(`${resumen.promedio}`, MARGEN, yProm, {
    lineBreak: false,
    width: 170
  });
  const anchoProm = doc.widthOfString(`${resumen.promedio}`);
  doc.font('Helvetica').fontSize(16).fillColor(SUAVE).text('%', MARGEN + anchoProm + 4, yProm + 32, {
    lineBreak: false
  });
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(SUAVE)
    .text('promedio grupal de aciertos', MARGEN, yProm + 62, { width: 200, lineBreak: false });

  // Cifras de apoyo en dos columnas
  const cifras = [
    ['Alumnos que terminaron', String(resumen.terminados)],
    ['Intentos sin terminar', String(resumen.enProceso)],
    ['Mediana', `${resumen.mediana}%`],
    ['Desviación estándar', `${resumen.desviacion} pts`],
    ['Más alto / más bajo', `${resumen.maximo}% / ${resumen.minimo}%`],
    ['Arriba de 60%', `${resumen.aprobados} de ${resumen.terminados}`]
  ];
  let yc = yProm + 2;
  const xc = MARGEN + 230;
  for (const [k, v] of cifras) {
    doc.font('Helvetica').fontSize(9).fillColor(SUAVE).text(k, xc, yc, { width: 170, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(TINTA).text(v, xc + 175, yc, {
      width: ANCHO - 230 - 175,
      align: 'right',
      lineBreak: false
    });
    yc += 14;
  }

  doc.y = Math.max(yProm + 90, yc + 14);
  doc.moveDown(0.8);

  // ---------- Distribución ----------
  titulo(doc, 'Cómo se reparte el grupo');
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(SUAVE)
    .text('Alumnos en cada rango de aciertos.', MARGEN, doc.y, { width: ANCHO });
  doc.moveDown(0.6);

  const maxAlumnos = Math.max(1, ...resumen.distribucion.map((d) => d.alumnos));
  for (const d of resumen.distribucion) {
    barra(doc, {
      etiqueta: `${d.etiqueta} % de aciertos`,
      valor: d.alumnos,
      maximo: maxAlumnos,
      sufijo: '',
      color: d.etiqueta === '0 a 39' || d.etiqueta === '40 a 59' ? ALERTA : DATO,
      anchoEtiqueta: 150
    });
  }

  doc.moveDown(0.8);

  // ---------- Temas ----------
  titulo(doc, 'Dominio por tema, de más débil a más fuerte');
  for (const t of resumen.porTema) {
    barra(doc, {
      etiqueta: `${t.tema} (${t.preguntas} preguntas)`,
      valor: t.porcentaje,
      maximo: 100,
      color: t.porcentaje < 60 ? ALERTA : DATO,
      anchoEtiqueta: 200
    });
  }

  const debiles = resumen.porTema.filter((t) => t.porcentaje < 60).map((t) => t.tema);
  doc.moveDown(0.5);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(SUAVE)
    .text(
      debiles.length
        ? `Conviene nivelar antes de entrar a contenidos de nube: ${debiles.join(', ')}.`
        : 'Ningún tema quedó por debajo del 60%. El grupo puede arrancar con el temario normal.',
      MARGEN,
      doc.y,
      { width: ANCHO }
    );

  // ---------- Preguntas ----------
  if (doc.y > 560) doc.addPage();
  else doc.moveDown(2);
  doc.font('Helvetica-Bold').fontSize(14).fillColor(TINTA).text('Pregunta por pregunta', MARGEN, doc.y);
  doc.moveDown(0.2);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(SUAVE)
    .text('Ordenadas de menor a mayor porcentaje de acierto. En rojo, las que menos del 50% del grupo resolvió.', {
      width: ANCHO
    });
  doc.moveDown(1);

  const colPreg = [
    { titulo: 'Pregunta', ancho: 250 },
    { titulo: 'Tema', ancho: 150 },
    { titulo: 'Acierto', ancho: 58, align: 'right' },
    { titulo: 'Sin contestar', ancho: 58, align: 'right' }
  ];
  encabezadoTabla(doc, colPreg);
  for (const p of resumen.preguntas) {
    filaTabla(
      doc,
      colPreg,
      [p.texto, p.tema, `${p.porcentaje}%`, String(p.sinContestar)],
      { resaltar: p.porcentaje < 50 }
    );
  }

  // ---------- Alumnos ----------
  if (doc.y > 560) doc.addPage();
  else doc.moveDown(2.5);
  doc.font('Helvetica-Bold').fontSize(14).fillColor(TINTA).text('Resultados por alumno', MARGEN, doc.y);
  doc.moveDown(0.2);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(SUAVE)
    .text('De mayor a menor porcentaje. En rojo, quienes quedaron por debajo del 60%.', { width: ANCHO });
  doc.moveDown(1);

  const colAlu = [
    { titulo: 'Alumno', ancho: 210 },
    { titulo: 'Matrícula', ancho: 100 },
    { titulo: 'Grupo', ancho: 70 },
    { titulo: 'Aciertos', ancho: 62, align: 'right' },
    { titulo: '%', ancho: 74, align: 'right' }
  ];
  encabezadoTabla(doc, colAlu);
  if (resumen.alumnos.length === 0) {
    doc.font('Helvetica').fontSize(9).fillColor(SUAVE).text('Todavía no hay exámenes terminados.', MARGEN, doc.y);
  }
  for (const a of resumen.alumnos) {
    filaTabla(
      doc,
      colAlu,
      [a.nombre, a.matricula, a.grupo, `${a.aciertos} / ${a.total}`, `${a.porcentaje}%`],
      { resaltar: a.porcentaje < 60 }
    );
  }

  // ---------- Pie de página ----------
  const rango = doc.bufferedPageRange();
  for (let i = 0; i < rango.count; i++) {
    doc.switchToPage(rango.start + i);
    // Sin esto, escribir por debajo del margen inferior crea páginas nuevas.
    const margenInferior = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(SUAVE)
      .text(`${materia} — diagnóstico de fundamentos`, MARGEN, 754, { width: ANCHO - 60, lineBreak: false })
      .text(`${i + 1} de ${rango.count}`, MARGEN + ANCHO - 60, 754, {
        width: 60,
        align: 'right',
        lineBreak: false
      });
    doc.page.margins.bottom = margenInferior;
  }

  doc.end();
  return doc;
}
