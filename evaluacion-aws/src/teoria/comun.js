// Lo que comparten los bancos teóricos de los simulacros: cómo se ve un banco
// desde el lado del alumno y cómo se califica. Cada banco (simulacro-1.js,
// simulacro-2.js) exporta sus propias `publica()` y `calificar()` usando estas
// dos funciones, para que las reglas sean idénticas en ambos.

/** Casos y preguntas sin la respuesta correcta, sin retroalimentación y sin metadatos internos. */
export function bancoPublico(caso, casos, preguntas) {
  return {
    caso,
    casos: casos.map(({ id, empresa, titulo, historia }) => ({ id, empresa, titulo, historia })),
    preguntas: preguntas.map(({ id, caso: idCaso, tema, texto, opciones }) => ({
      id,
      caso: idCaso,
      tema,
      texto,
      opciones: opciones.map((o) => o.texto)
    }))
  };
}

/** Califica `{ c1p1: 2, c1p2: 0, … }`. Lo que no sea un índice válido cuenta como error (elegida: null). */
export function calificarBanco(preguntas, respuestas) {
  const detalle = preguntas.map((p) => {
    const elegida = respuestas?.[p.id];
    const valida = Number.isInteger(elegida) && elegida >= 0 && elegida < p.opciones.length;
    return {
      id: p.id,
      caso: p.caso,
      tema: p.tema,
      elegida: valida ? elegida : null,
      correcta: valida && elegida === p.correcta
    };
  });
  return { aciertos: detalle.filter((d) => d.correcta).length, total: preguntas.length, detalle };
}
