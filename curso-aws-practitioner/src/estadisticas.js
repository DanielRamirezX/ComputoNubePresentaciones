import { acerto, aprobatorioDe, respuestaValida, sesionesDelBanco, tituloDeSesion } from './banco.js';

// Mismo umbral que el examen diagnóstico: debajo de 60 % se pinta en rojo. Los
// bancos con ESCALA (el simulacro CLF-C02) usan el del examen real: 700 de
// 1000, o sea 70 %.
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
 * `banco` es el examen de la sesión: sus PREGUNTAS, sus TEMAS y, si trae,
 * su ESCALA.
 *
 * En una pregunta de respuesta múltiple, `elegidas[i]` cuenta a quienes
 * marcaron la opción i (cada alumno marca varias) y `porcentaje` es quién
 * acertó la combinación completa.
 */
export function resumirPractica(entregas, { PREGUNTAS, TEMAS, ESCALA }) {
  const calificaciones = entregas.map((e) => pct(e.aciertos, e.total));
  const n = entregas.length;
  const aprobatorio = aprobatorioDe(ESCALA, APROBATORIO);

  const preguntas = PREGUNTAS.map((p) => {
    const elegidas = p.opciones.map(() => 0);
    let sinContestar = 0;
    let aciertos = 0;
    for (const e of entregas) {
      const valor = respuestaValida(p, e.respuestas?.[p.id]);
      if (valor === null) sinContestar += 1;
      else for (const i of [valor].flat()) elegidas[i] += 1;
      if (acerto(p, valor)) aciertos += 1;
    }
    return {
      id: p.id,
      tema: p.tema,
      ...(p.sesion !== undefined ? { sesion: p.sesion } : {}),
      texto: p.texto,
      opciones: p.opciones,
      correcta: p.correcta,
      ...(Array.isArray(p.correcta) ? { elige: p.elige } : {}),
      explicacion: p.explicacion,
      elegidas,
      sinContestar,
      aciertos,
      porcentaje: pct(aciertos, n)
    };
  });

  const porTema = TEMAS.map((tema) => {
    const delTema = preguntas.filter((p) => p.tema === tema);
    const aciertos = delTema.reduce((suma, p) => suma + p.aciertos, 0);
    return { tema, preguntas: delTema.length, porcentaje: pct(aciertos, delTema.length * n) };
  });

  // «Por sesión de la Ruta»: qué sesión conviene repasar con el grupo.
  const porSesion = sesionesDelBanco(PREGUNTAS).map((s) => {
    const deLaSesion = preguntas.filter((p) => (p.sesion ?? 0) === s);
    const aciertos = deLaSesion.reduce((suma, p) => suma + p.aciertos, 0);
    return { sesion: s, titulo: tituloDeSesion(s), preguntas: deLaSesion.length, porcentaje: pct(aciertos, deLaSesion.length * n) };
  });

  return {
    entregadas: n,
    promedio: n === 0 ? 0 : Math.round((calificaciones.reduce((a, b) => a + b, 0) / n) * 10) / 10,
    mediana: Math.round(mediana(calificaciones) * 10) / 10,
    minimo: n ? Math.min(...calificaciones) : 0,
    maximo: n ? Math.max(...calificaciones) : 0,
    aprobados: calificaciones.filter((c) => c >= aprobatorio).length,
    aprobatorio,
    escala: ESCALA ?? null,
    distribucion: RANGOS.map((r) => ({
      etiqueta: r.etiqueta,
      alumnos: calificaciones.filter((c) => c >= r.min && c <= r.max).length
    })),
    porTema: porTema.sort((a, b) => a.porcentaje - b.porcentaje),
    porSesion: porSesion.sort((a, b) => a.porcentaje - b.porcentaje),
    preguntas: preguntas.sort((a, b) => a.porcentaje - b.porcentaje)
  };
}
