// El reporte que descarga el alumno al entregar la práctica: su dominio por
// tema y por concepto, comparado con su grupo, y qué lecciones repasar.
//
// Con RETROALIMENTACION=completo incluye además la respuesta correcta de lo
// que falló; en modo `resumen` dice qué concepto falló, pero no la respuesta.

import { ANCHO, anchoTexto, crearPdf, partir } from './pdf.js';

const MARGEN = 50;
const ANCHO_UTIL = ANCHO - MARGEN * 2;
const LIMITE = 730; // debajo de esto va el pie de página

const TINTA = [22, 24, 29];
const GRIS = [75, 81, 96];
const LINEA = [214, 205, 187];
const PISTA = [231, 224, 207];
const AMARILLO = [255, 210, 63];
const PAPEL = [251, 248, 239];

// Mismo corte que el resto del curso: 60 % es el mínimo aprobatorio.
const NIVELES = [
  { minimo: 80, nombre: 'Dominado', color: [14, 159, 110] },
  { minimo: 60, nombre: 'En desarrollo', color: [196, 132, 0] },
  { minimo: 0, nombre: 'Por reforzar', color: [215, 38, 61] }
];

const nivelDe = (pct) => NIVELES.find((n) => pct >= n.minimo);
const pct = (parte, total) => (total ? Math.round((parte / total) * 100) : 0);

/**
 * @param {object} datos
 * @param {object} datos.entrega       la entrega guardada del alumno
 * @param {Array}  datos.preguntas     el banco completo (con correcta y concepto)
 * @param {Array}  datos.temas         nombres de los temas, en orden
 * @param {Array}  datos.detalle       resultado de calificar() para esta entrega
 * @param {object} datos.grupo         { entregas, porPregunta: {id: %}, porTema: {tema: %} }
 * @param {object} datos.repaso        { tema: ['Título de lección', …] }
 * @param {boolean} datos.conRespuestas incluir la respuesta correcta de lo fallado
 */
export function reporteDominio({ entrega, preguntas, temas, detalle, grupo, repaso, conRespuestas, materia, curso, fecha }) {
  const pdf = crearPdf({ titulo: `Reporte de ${entrega.nombre} · ${curso}` });
  let y = 0;

  const asegurar = (alto) => {
    if (y + alto > LIMITE) {
      pdf.nuevaPagina();
      y = 50;
    }
  };

  const seccion = (titulo) => {
    asegurar(60);
    y += 16;
    pdf.texto(MARGEN, y + 14, titulo, { tamano: 14, negrita: true });
    y += 22;
    pdf.linea(MARGEN, y, MARGEN + ANCHO_UTIL, y, { color: TINTA, grosor: 1.5 });
    y += 12;
  };

  // --------------------------------------------------------------- portada
  pdf.rect(0, 0, ANCHO, 100, { relleno: AMARILLO });
  pdf.linea(0, 100, ANCHO, 100, { grosor: 2 });
  pdf.texto(MARGEN, 34, `${materia.toUpperCase()} · PRÁCTICA FINAL`, { tamano: 8.5, negrita: true, color: GRIS });
  pdf.texto(MARGEN, 62, 'Tu dominio de los conceptos', { tamano: 22, negrita: true });
  pdf.texto(MARGEN, 84, curso, { tamano: 11, color: GRIS });
  y = 124;

  const filas = [
    ['Nombre', entrega.nombre],
    ['Matrícula', entrega.matricula || '—'],
    ['Grupo', entrega.grupo],
    ['Entregada', fecha],
    ['Folio', entrega.folio]
  ];
  for (const [etiqueta, valor] of filas) {
    pdf.texto(MARGEN, y, etiqueta.toUpperCase(), { tamano: 8, negrita: true, color: GRIS });
    pdf.texto(MARGEN + 80, y, valor, { tamano: 11, negrita: etiqueta === 'Nombre' });
    y += 17;
  }

  // Marcador general
  const general = pct(entrega.aciertos, entrega.total);
  const nivelGeneral = nivelDe(general);
  y += 6;
  pdf.rect(MARGEN, y, ANCHO_UTIL, 76, { relleno: PAPEL, borde: TINTA, grosor: 1.5 });
  pdf.texto(MARGEN + 18, y + 46, `${entrega.aciertos}/${entrega.total}`, { tamano: 34, negrita: true });
  pdf.texto(MARGEN + 130, y + 30, `${general} % de aciertos · Calificación ${(general / 10).toFixed(1)}`, { tamano: 13, negrita: true });
  pdf.texto(MARGEN + 130, y + 50, `Nivel general: ${nivelGeneral.nombre}. Promedio de tu grupo: ${grupo.promedio} % (${grupo.entregas} ${grupo.entregas === 1 ? 'entrega' : 'entregas'}).`, {
    tamano: 10,
    color: GRIS
  });
  pdf.rect(MARGEN + ANCHO_UTIL - 18 - 90, y + 16, 90, 20, { relleno: nivelGeneral.color });
  pdf.texto(MARGEN + ANCHO_UTIL - 18 - 45, y + 30, nivelGeneral.nombre, { tamano: 9.5, negrita: true, color: [255, 255, 255], alinear: 'centro' });
  y += 86;

  // ------------------------------------------------------- dominio por tema
  seccion('Dominio por tema');
  const xBarra = MARGEN + 190;
  const anchoBarra = 220;
  for (const tema of temas) {
    asegurar(40);
    const delTema = detalle.filter((d) => d.tema === tema);
    const bien = delTema.filter((d) => d.correcta).length;
    const suyo = pct(bien, delTema.length);
    const nivel = nivelDe(suyo);
    const delGrupo = grupo.porTema[tema] ?? 0;

    pdf.texto(MARGEN, y + 12, tema, { tamano: 11, negrita: true });
    pdf.texto(MARGEN, y + 27, `${bien} de ${delTema.length} · ${suyo} %`, { tamano: 9.5, color: GRIS });
    pdf.rect(xBarra, y + 4, anchoBarra, 14, { relleno: PISTA });
    if (suyo > 0) pdf.rect(xBarra, y + 4, (anchoBarra * suyo) / 100, 14, { relleno: nivel.color });
    // La marca del promedio del grupo
    const xGrupo = xBarra + (anchoBarra * delGrupo) / 100;
    pdf.linea(xGrupo, y, xGrupo, y + 22, { grosor: 2 });
    pdf.texto(xBarra, y + 32, `Tu grupo: ${delGrupo} %`, { tamano: 8.5, color: GRIS });
    pdf.texto(MARGEN + ANCHO_UTIL, y + 15, nivel.nombre, { tamano: 10, negrita: true, color: nivel.color, alinear: 'derecha' });
    y += 42;
  }

  // Leyenda
  asegurar(20);
  let x = MARGEN;
  for (const n of NIVELES) {
    pdf.rect(x, y, 10, 10, { relleno: n.color });
    const texto = n.minimo === 80 ? 'Dominado: 80 % o más' : n.minimo === 60 ? 'En desarrollo: 60 a 79 %' : 'Por reforzar: menos de 60 %';
    pdf.texto(x + 15, y + 9, texto, { tamano: 8.5, color: GRIS });
    x += 15 + anchoTexto(texto, 8.5) + 22;
  }
  pdf.linea(x + 4, y - 1, x + 4, y + 11, { grosor: 2 });
  pdf.texto(x + 10, y + 9, 'promedio del grupo', { tamano: 8.5, color: GRIS });
  y += 22;

  // --------------------------------------------------- qué conviene repasar
  seccion('Qué te conviene repasar');
  const flojos = temas.filter((tema) => {
    const delTema = detalle.filter((d) => d.tema === tema);
    return pct(delTema.filter((d) => d.correcta).length, delTema.length) < 80;
  });
  if (flojos.length === 0) {
    for (const renglon of partir('Dominaste los cinco temas. Si quieres ir más allá, prueba la certificación de entrada de algún proveedor (AWS Cloud Practitioner, Azure Fundamentals o Google Cloud Digital Leader).', ANCHO_UTIL, 10.5)) {
      asegurar(16);
      pdf.texto(MARGEN, y + 11, renglon, { tamano: 10.5 });
      y += 15;
    }
  } else {
    for (const tema of flojos) {
      const lecciones = repaso[tema] ?? [];
      const renglones = partir(`${tema}: vuelve a ${lecciones.map((l) => `«${l}»`).join(', ')}.`, ANCHO_UTIL - 14, 10.5);
      asegurar(renglones.length * 15 + 4);
      pdf.rect(MARGEN, y + 4, 5, 5, { relleno: TINTA });
      for (const renglon of renglones) {
        pdf.texto(MARGEN + 14, y + 11, renglon, { tamano: 10.5 });
        y += 15;
      }
      y += 3;
    }
    asegurar(20);
    pdf.texto(MARGEN, y + 11, 'Las lecciones siguen abiertas en el curso: puedes repasarlas cuando quieras.', { tamano: 9.5, color: GRIS });
    y += 18;
  }

  // ------------------------------------------------- concepto por concepto
  seccion('Concepto por concepto');
  const xTu = MARGEN + ANCHO_UTIL - 150;
  const xGrupo = MARGEN + ANCHO_UTIL;
  const encabezado = () => {
    pdf.texto(MARGEN, y + 9, 'CONCEPTO', { tamano: 8, negrita: true, color: GRIS });
    pdf.texto(xTu, y + 9, 'TÚ', { tamano: 8, negrita: true, color: GRIS, alinear: 'centro' });
    pdf.texto(xGrupo, y + 9, 'LO ACERTÓ TU GRUPO', { tamano: 8, negrita: true, color: GRIS, alinear: 'derecha' });
    y += 16;
  };
  encabezado();

  let temaActual = null;
  detalle.forEach((d) => {
    const pregunta = preguntas.find((p) => p.id === d.id);
    const extra =
      conRespuestas && !d.correcta
        ? partir(`Respuesta correcta: ${pregunta.opciones[pregunta.correcta]}`, ANCHO_UTIL - 200, 8.5)
        : [];
    const alto = 20 + extra.length * 11 + (d.tema !== temaActual ? 20 : 0);
    if (y + alto > LIMITE) {
      pdf.nuevaPagina();
      y = 50;
      encabezado();
      temaActual = null;
    }
    if (d.tema !== temaActual) {
      temaActual = d.tema;
      pdf.texto(MARGEN, y + 12, d.tema, { tamano: 9.5, negrita: true, color: GRIS });
      y += 18;
    }
    const alto2 = 20 + extra.length * 11;
    pdf.rect(MARGEN, y, ANCHO_UTIL, alto2, { relleno: d.correcta ? [240, 250, 245] : [253, 236, 239] });
    pdf.texto(MARGEN + 8, y + 13.5, pregunta.concepto, { tamano: 10 });
    extra.forEach((renglon, i) => pdf.texto(MARGEN + 8, y + 26 + i * 11, renglon, { tamano: 8.5, color: GRIS }));
    const marca = d.correcta ? 'Bien' : d.elegida === null ? 'Sin contestar' : 'Repasar';
    pdf.texto(xTu, y + 13.5, marca, { tamano: 9.5, negrita: true, color: d.correcta ? NIVELES[0].color : NIVELES[2].color, alinear: 'centro' });
    pdf.texto(xGrupo - 8, y + 13.5, `${grupo.porPregunta[d.id] ?? 0} %`, { tamano: 10, alinear: 'derecha' });
    y += alto2 + 3;
  });

  asegurar(34);
  y += 8;
  for (const renglon of partir(
    conRespuestas
      ? 'Los porcentajes del grupo cuentan las entregas que había al momento de descargar este reporte.'
      : 'Este reporte dice qué conceptos repasar, pero no las respuestas: tu docente las revisará con el grupo. Los porcentajes del grupo cuentan las entregas que había al descargarlo.',
    ANCHO_UTIL,
    8.5
  )) {
    pdf.texto(MARGEN, y + 9, renglon, { tamano: 8.5, color: GRIS });
    y += 12;
  }

  // ------------------------------------------------------------------ pies
  const total = pdf.totalPaginas;
  for (let i = 0; i < total; i++) {
    pdf.irA(i);
    pdf.linea(MARGEN, 752, MARGEN + ANCHO_UTIL, 752, { color: LINEA });
    pdf.texto(MARGEN, 766, `${curso} · Folio ${entrega.folio}`, { tamano: 8, color: GRIS });
    pdf.texto(MARGEN + ANCHO_UTIL, 766, `Página ${i + 1} de ${total}`, { tamano: 8, color: GRIS, alinear: 'derecha' });
  }

  return pdf.bytes();
}
