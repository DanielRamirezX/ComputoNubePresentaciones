// Los bancos teóricos de cada evaluación, por id. La parte teórica solo existe
// en los simulacros: la del examen bimestral la aplica el docente por su cuenta.

import * as simulacro1 from './simulacro-1.js';
import * as simulacro2 from './simulacro-2.js';

export const TEORIA = new Map([
  ['simulacro-1', simulacro1],
  ['simulacro-2', simulacro2]
]);
