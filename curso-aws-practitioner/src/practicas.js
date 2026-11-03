// Un examen de práctica por sesión. Cada banco vive en su archivo con las
// mismas exportaciones (TEMAS, REPASO, CASO, PREGUNTAS); aquí se juntan por
// número de sesión. prepararBanco (src/banco.js) les pone a todos el mismo
// `practicaPublica` y el mismo `calificar`, que ya entienden las preguntas de
// respuesta múltiple.
//
// Opcionales por banco (los usan el simulacro y las prácticas, sesiones 8 a 13):
//   export const MINUTOS = 90;                              reloj que avisa, sin cortar
//   export const ESCALA = { maximo: 1000, aprueba: 700 };   puntaje escalado estimado
//   export const OBJETIVO = { 'Conceptos de la nube': 16 }; preguntas por tema (lo revisa verificar)
//
// Para registrar un banco nuevo: impórtalo y agrega su línea a MODULOS.

import { prepararBanco } from './banco.js';
import * as sesion1 from './practica.js';
import * as sesion2 from './practica2.js';
import * as sesion3 from './practica3.js';
import * as sesion4 from './practica4.js';
import * as sesion5 from './practica5.js';
import * as sesion6 from './practica6.js';
import * as sesion7 from './practica7.js';
import * as sesion8 from './practica8.js';
import * as sesion9 from './practica9.js';
import * as sesion10 from './practica10.js';
import * as sesion11 from './practica11.js';
import * as sesion12 from './practica12.js';
import * as sesion13 from './practica13.js';

const MODULOS = [
  [1, sesion1],
  [2, sesion2],
  [3, sesion3],
  [4, sesion4],
  [5, sesion5],
  [6, sesion6],
  [7, sesion7],
  [8, sesion8],
  [9, sesion9],
  [10, sesion10],
  [11, sesion11],
  [12, sesion12],
  [13, sesion13]
].filter(([, modulo]) => modulo.PREGUNTAS); // un marcador (PREGUNTAS = null) todavía no cuenta

export const BANCOS = new Map(MODULOS.map(([n, modulo]) => [n, prepararBanco(modulo)]));

/** El número de sesión que pide el navegador, o null si no existe. */
export function sesionValida(valor) {
  const n = Number(valor ?? 1);
  return BANCOS.has(n) ? n : null;
}
