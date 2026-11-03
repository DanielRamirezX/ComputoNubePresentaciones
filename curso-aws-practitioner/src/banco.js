// Lo que comparten todos los bancos de preguntas: qué ve el alumno, qué
// respuesta es válida y cómo se califica. src/practicas.js se lo pone a cada
// banco, así que un banco nuevo solo exporta sus datos (TEMAS, REPASO, CASO,
// PREGUNTAS y, si quiere, MINUTOS, ESCALA y OBJETIVO).
//
// Hay dos formas de pregunta, como en el examen CLF-C02:
//   - Una sola respuesta: 4 opciones y `correcta` es un índice (0 a 3).
//   - Respuesta múltiple («Elige DOS»): 5 opciones, `correcta` es un arreglo de
//     índices y `elige` dice cuántas marcar. Se califica todo o nada: si falta
//     una o sobra una, es error, igual que en el examen real.
//
// El campo opcional `sesion` (1 a 13; 0 = un tema del examen que la Ruta no
// vio) da el reporte «Por sesión de la Ruta».

import { RUTA } from '../public/contenido.js';

export const esMultiple = (p) => Array.isArray(p.correcta);

/**
 * La respuesta del navegador, limpia, o null si no sirve: un índice para las
 * de una sola respuesta; un arreglo ordenado de índices distintos (hasta
 * `elige`) para las de respuesta múltiple.
 */
export function respuestaValida(p, valor) {
  const indice = (i) => Number.isInteger(i) && i >= 0 && i < p.opciones.length;
  if (!esMultiple(p)) return indice(valor) ? valor : null;
  if (!Array.isArray(valor)) return null;
  const marcadas = [...new Set(valor)];
  if (marcadas.length === 0 || marcadas.length > p.elige || !marcadas.every(indice)) return null;
  return marcadas.sort((a, b) => a - b);
}

/** ¿La respuesta (ya validada) es la correcta? Las múltiples, todo o nada. */
export function acerto(p, elegida) {
  if (elegida === null || elegida === undefined) return false;
  if (!esMultiple(p)) return elegida === p.correcta;
  return elegida.length === p.correcta.length && p.correcta.every((i) => elegida.includes(i));
}

/** Los textos de las opciones correctas, para el reporte y la revisión. */
export const textoCorrecta = (p) => (esMultiple(p) ? p.correcta.map((i) => p.opciones[i]).join(' + ') : p.opciones[p.correcta]);

/** Los textos de lo que marcó el alumno, o null si no contestó. */
export const textoElegida = (p, elegida) =>
  elegida === null || elegida === undefined ? null : esMultiple(p) ? elegida.map((i) => p.opciones[i]).join(' + ') : p.opciones[elegida];

/** Lo que sí puede ver el alumno: sin la correcta, la explicación ni la sesión. */
export function preguntasPublicas(PREGUNTAS) {
  return PREGUNTAS.map(({ id, tema, texto, opciones, fijo, elige, correcta }) => ({
    id,
    tema,
    texto,
    opciones,
    fijo: Boolean(fijo),
    ...(Array.isArray(correcta) ? { elige } : {})
  }));
}

/** Califica un objeto { p01: 2, p40: [1, 3], … }. Lo que no sea válido cuenta como error. */
export function calificarPreguntas(PREGUNTAS, respuestas) {
  const detalle = PREGUNTAS.map((p) => {
    const elegida = respuestaValida(p, respuestas?.[p.id]);
    return {
      id: p.id,
      tema: p.tema,
      ...(p.sesion !== undefined ? { sesion: p.sesion } : {}),
      elegida,
      correcta: acerto(p, elegida)
    };
  });
  return { aciertos: detalle.filter((d) => d.correcta).length, total: PREGUNTAS.length, detalle };
}

/** Las sesiones de la Ruta que toca el banco, en orden (la 0 al final), o [] si no usa `sesion`. */
export function sesionesDelBanco(PREGUNTAS) {
  if (!PREGUNTAS.some((p) => p.sesion !== undefined)) return [];
  const numeros = [...new Set(PREGUNTAS.map((p) => p.sesion ?? 0))];
  return numeros.sort((a, b) => (a === 0) - (b === 0) || a - b);
}

/** «Sesión 3 · Redes en AWS», o el nombre de los temas que la Ruta no vio. */
export function tituloDeSesion(n) {
  if (n === 0) return 'Fuera de la Ruta · temas extra del examen';
  const r = RUTA.find((x) => x.numero === n);
  return r ? `Sesión ${n} · ${r.titulo}` : `Sesión ${n}`;
}

/** El puntaje escalado estimado (de 0 a `maximo`) y si alcanzaría para aprobar. */
export function escalado(ESCALA, aciertos, total) {
  if (!ESCALA) return null;
  const puntaje = total ? Math.round((aciertos / total) * ESCALA.maximo) : 0;
  return { puntaje, maximo: ESCALA.maximo, aprueba: ESCALA.aprueba, aprobado: puntaje >= ESCALA.aprueba };
}

/** El porcentaje mínimo aprobatorio: el del curso (60) o el del examen real (700 de 1000 = 70). */
export const aprobatorioDe = (ESCALA, porOmision) => (ESCALA ? Math.round((ESCALA.aprueba / ESCALA.maximo) * 100) : porOmision);

/**
 * El banco listo para el motor: sus datos tal cual, más `practicaPublica` y
 * `calificar` comunes. Si el banco trae las suyas, se usan estas: así una
 * pregunta de respuesta múltiple se califica igual en todos los bancos.
 */
export function prepararBanco(modulo) {
  const { PREGUNTAS } = modulo;
  return Object.freeze({
    ...modulo,
    practicaPublica: () => preguntasPublicas(PREGUNTAS),
    calificar: (respuestas) => calificarPreguntas(PREGUNTAS, respuestas)
  });
}
