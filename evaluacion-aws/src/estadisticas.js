// Lo que el panel necesita para el cierre de la clase: cómo le fue al grupo,
// qué preguntas se fallaron más (y con qué opción se confundieron) y qué
// puntos del laboratorio casi nadie cumplió. Mismo umbral y mismos rangos que
// la Ruta AWS: debajo de 60 % se pinta en rojo.

export const APROBATORIO = 60;

const RANGOS = [
  { etiqueta: '0 a 39', min: 0, max: 39.999 },
  { etiqueta: '40 a 59', min: 40, max: 59.999 },
  { etiqueta: '60 a 69', min: 60, max: 69.999 },
  { etiqueta: '70 a 84', min: 70, max: 84.999 },
  { etiqueta: '85 a 100', min: 85, max: 100 }
];

export const pct = (parte, total) => (total === 0 ? 0 : Math.round((parte / total) * 1000) / 10);

function mediana(valores) {
  if (valores.length === 0) return 0;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Promedio, mediana, extremos y reparto de una lista de porcentajes. */
export function resumen(porcentajes) {
  const n = porcentajes.length;
  const redondo = (x) => Math.round(x * 10) / 10;
  return {
    entregadas: n,
    promedio: n ? redondo(porcentajes.reduce((a, b) => a + b, 0) / n) : 0,
    mediana: redondo(mediana(porcentajes)),
    minimo: n ? Math.min(...porcentajes) : 0,
    maximo: n ? Math.max(...porcentajes) : 0,
    aprobados: porcentajes.filter((c) => c >= APROBATORIO).length,
    aprobatorio: APROBATORIO,
    distribucion: RANGOS.map((r) => ({ etiqueta: r.etiqueta, alumnos: porcentajes.filter((c) => c >= r.min && c <= r.max).length }))
  };
}

const textoOpcion = (o) => (typeof o === 'string' ? o : o?.texto ?? '');

/**
 * La parte teórica: por pregunta, cuántos eligieron cada opción. El distractor
 * más elegido dice qué confusión repasar.
 */
export function resumirTeoria(entregas, banco) {
  const { PREGUNTAS, TEMAS = [], CASOS = [] } = banco;
  const n = entregas.length;

  const preguntas = PREGUNTAS.map((p) => {
    const elegidas = p.opciones.map(() => 0);
    let sinContestar = 0;
    for (const e of entregas) {
      const i = e.respuestas?.[p.id];
      if (Number.isInteger(i) && i >= 0 && i < p.opciones.length) elegidas[i] += 1;
      else sinContestar += 1;
    }
    const masVeces = Math.max(0, ...elegidas);
    const indice = masVeces ? elegidas.indexOf(masVeces) : null;
    return {
      id: p.id,
      caso: p.caso,
      tema: p.tema,
      texto: p.texto,
      opciones: p.opciones.map(textoOpcion),
      correcta: p.correcta,
      retroCorrecta: p.opciones[p.correcta]?.retro ?? '',
      elegidas,
      sinContestar,
      porcentaje: pct(elegidas[p.correcta] ?? 0, n),
      masElegida: indice === null ? null : { indice, veces: masVeces, esCorrecta: indice === p.correcta }
    };
  });

  const agrupar = (clave, valores) =>
    valores.map((v) => {
      const del = preguntas.filter((p) => p[clave] === (v.id ?? v));
      const aciertos = del.reduce((s, p) => s + (p.elegidas[p.correcta] ?? 0), 0);
      return { ...(typeof v === 'string' ? { tema: v } : { id: v.id, titulo: v.titulo, empresa: v.empresa }), preguntas: del.length, porcentaje: pct(aciertos, del.length * n) };
    });

  return {
    ...resumen(entregas.map((e) => pct(e.aciertos, e.total))),
    porTema: agrupar('tema', TEMAS).sort((a, b) => a.porcentaje - b.porcentaje),
    porCaso: agrupar('caso', CASOS),
    preguntas: preguntas.sort((a, b) => a.porcentaje - b.porcentaje)
  };
}

/**
 * La parte práctica: promedio por tarea y, por cada punto de la rúbrica, qué
 * porcentaje del grupo lo cumplió (de lo menos cumplido a lo más).
 */
export function resumirPractica(entregas) {
  const tareas = new Map();
  const checks = new Map();
  for (const e of entregas) {
    for (const t of e.tareas ?? []) {
      const tarea = tareas.get(t.id) ?? { id: t.id, titulo: t.titulo, puntos: t.puntos, ...(t.bono ? { bono: true } : {}), suma: 0, completas: 0, n: 0 };
      tarea.suma += t.obtenidos;
      tarea.n += 1;
      if (t.obtenidos >= t.puntos) tarea.completas += 1;
      tareas.set(t.id, tarea);
      for (const c of t.checks ?? []) {
        const k = `${t.id}/${c.id}`;
        const check = checks.get(k) ?? { tarea: t.id, tareaTitulo: t.titulo, ...(t.bono ? { bono: true } : {}), id: c.id, texto: c.texto, puntos: c.puntos, cumplidos: 0, n: 0 };
        check.n += 1;
        if (c.ok) check.cumplidos += 1;
        checks.set(k, check);
      }
    }
  }
  return {
    ...resumen(entregas.map((e) => pct(e.obtenidos, e.total))),
    tareas: [...tareas.values()].map(({ suma, n, ...t }) => ({
      ...t,
      promedio: n ? Math.round((suma / n) * 10) / 10 : 0,
      porcentaje: pct(suma, t.puntos * n)
    })),
    checks: [...checks.values()].map((c) => ({ ...c, porcentaje: pct(c.cumplidos, c.n) })).sort((a, b) => a.porcentaje - b.porcentaje)
  };
}
