// Un examen de práctica por sesión. Cada banco vive en su archivo con las
// mismas exportaciones (TEMAS, REPASO, CASO, PREGUNTAS, practicaPublica,
// calificar); aquí se juntan por número de sesión.

import * as sesion1 from './practica.js';
import * as sesion2 from './practica2.js';

export const BANCOS = new Map([
  [1, sesion1],
  [2, sesion2]
]);

/** El número de sesión que pide el navegador, o null si no existe. */
export function sesionValida(valor) {
  const n = Number(valor ?? 1);
  return BANCOS.has(n) ? n : null;
}
