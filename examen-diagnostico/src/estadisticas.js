import { PREGUNTAS, TEMAS } from './preguntas.js';

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

function desviacion(valores) {
  if (valores.length < 2) return 0;
  const media = valores.reduce((a, b) => a + b, 0) / valores.length;
  const varianza = valores.reduce((a, b) => a + (b - media) ** 2, 0) / (valores.length - 1);
  return Math.sqrt(varianza);
}

/**
 * Recibe las filas crudas de la base y devuelve todo lo que necesitan
 * el panel y el PDF.
 */
export function resumir(filas, grupo = null) {
  const terminados = filas.filter((f) => f.fin);
  const calificaciones = terminados.map((f) => pct(f.aciertos, f.total || PREGUNTAS.length));

  // Aciertos por pregunta y por tema
  const porPregunta = PREGUNTAS.map((p) => ({
    id: p.id,
    tema: p.tema,
    texto: p.texto.split('\n')[0],
    aciertos: 0,
    sinContestar: 0
  }));
  const indice = Object.fromEntries(porPregunta.map((p, i) => [p.id, i]));

  for (const f of terminados) {
    let respuestas = {};
    try {
      respuestas = JSON.parse(f.respuestas || '{}');
    } catch {
      respuestas = {};
    }
    for (const p of PREGUNTAS) {
      const elegida = respuestas[p.id];
      const slot = porPregunta[indice[p.id]];
      if (!Number.isInteger(elegida)) slot.sinContestar += 1;
      else if (elegida === p.correcta) slot.aciertos += 1;
    }
  }

  const n = terminados.length;
  const preguntas = porPregunta.map((p) => ({
    ...p,
    porcentaje: pct(p.aciertos, n)
  }));

  const porTema = TEMAS.map((tema) => {
    const delTema = preguntas.filter((p) => p.tema === tema);
    const aciertos = delTema.reduce((a, p) => a + p.aciertos, 0);
    return {
      tema,
      preguntas: delTema.length,
      porcentaje: pct(aciertos, delTema.length * n)
    };
  });

  const distribucion = RANGOS.map((r) => ({
    etiqueta: r.etiqueta,
    alumnos: calificaciones.filter((c) => c >= r.min && c <= r.max).length
  }));

  const alumnos = terminados
    .map((f) => ({
      nombre: f.nombre,
      matricula: f.matricula || '',
      grupo: f.grupo,
      aciertos: f.aciertos,
      total: f.total || PREGUNTAS.length,
      porcentaje: pct(f.aciertos, f.total || PREGUNTAS.length),
      minutos: f.fin && f.inicio ? Math.max(1, Math.round((new Date(f.fin) - new Date(f.inicio)) / 60000)) : null
    }))
    .sort((a, b) => b.porcentaje - a.porcentaje);

  const promedio = n === 0 ? 0 : Math.round((calificaciones.reduce((a, b) => a + b, 0) / n) * 10) / 10;

  return {
    grupo,
    generado: new Date().toISOString(),
    totalIntentos: filas.length,
    terminados: n,
    enProceso: filas.length - n,
    promedio,
    mediana: Math.round(mediana(calificaciones) * 10) / 10,
    minimo: n ? Math.min(...calificaciones) : 0,
    maximo: n ? Math.max(...calificaciones) : 0,
    desviacion: Math.round(desviacion(calificaciones) * 10) / 10,
    aprobados: calificaciones.filter((c) => c >= 60).length,
    distribucion,
    porTema: porTema.sort((a, b) => a.porcentaje - b.porcentaje),
    preguntas: preguntas.sort((a, b) => a.porcentaje - b.porcentaje),
    alumnos
  };
}
