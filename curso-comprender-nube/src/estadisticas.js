import { PREGUNTAS, TEMAS } from './practica.js';

// Mismo umbral que el examen diagnóstico: debajo de 60 % se pinta en rojo.
export const APROBATORIO = 60;

const RANGOS = [
  { etiqueta: '0 a 39', min: 0, max: 39.999 },
  { etiqueta: '40 a 59', min: 40, max: 59.999 },
  { etiqueta: '60 a 69', min: 60, max: 69.999 },
  { etiqueta: '70 a 84', min: 70, max: 84.999 },
  { etiqueta: '85 a 100', min: 85, max: 100 }
];

const pct = (parte, total) => (total === 0 ? 0 : Math.round((parte / total) * 1000) / 10);

function mediana(valores) {
  if (valores.length === 0) return 0;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/**
 * Todo lo que necesita la pestaña "Práctica final" del panel: promedio,
 * reparto, dominio por tema y, por pregunta, cuántos eligieron cada opción
 * (el distractor más elegido dice qué confusión repasar en el cierre).
 */
export function resumirPractica(entregas) {
  const calificaciones = entregas.map((e) => pct(e.aciertos, e.total));
  const n = entregas.length;

  const preguntas = PREGUNTAS.map((p) => {
    const elegidas = p.opciones.map(() => 0);
    let sinContestar = 0;
    for (const e of entregas) {
      const i = e.respuestas?.[p.id];
      if (Number.isInteger(i) && i >= 0 && i < p.opciones.length) elegidas[i] += 1;
      else sinContestar += 1;
    }
    return {
      id: p.id,
      tema: p.tema,
      texto: p.texto,
      opciones: p.opciones,
      correcta: p.correcta,
      explicacion: p.explicacion,
      elegidas,
      sinContestar,
      porcentaje: pct(elegidas[p.correcta], n)
    };
  });

  const porTema = TEMAS.map((tema) => {
    const delTema = preguntas.filter((p) => p.tema === tema);
    const aciertos = delTema.reduce((suma, p) => suma + p.elegidas[p.correcta], 0);
    return { tema, preguntas: delTema.length, porcentaje: pct(aciertos, delTema.length * n) };
  });

  return {
    entregadas: n,
    promedio: n === 0 ? 0 : Math.round((calificaciones.reduce((a, b) => a + b, 0) / n) * 10) / 10,
    mediana: Math.round(mediana(calificaciones) * 10) / 10,
    minimo: n ? Math.min(...calificaciones) : 0,
    maximo: n ? Math.max(...calificaciones) : 0,
    aprobados: calificaciones.filter((c) => c >= APROBATORIO).length,
    aprobatorio: APROBATORIO,
    distribucion: RANGOS.map((r) => ({
      etiqueta: r.etiqueta,
      alumnos: calificaciones.filter((c) => c >= r.min && c <= r.max).length
    })),
    porTema: porTema.sort((a, b) => a.porcentaje - b.porcentaje),
    preguntas: preguntas.sort((a, b) => a.porcentaje - b.porcentaje)
  };
}
