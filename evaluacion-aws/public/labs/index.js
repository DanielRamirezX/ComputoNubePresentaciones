// Los laboratorios de la consola simulada, por id (lo que ve el alumno).

import { LAB as bimestral } from './bimestral.js';
import { LAB as simulacro1 } from './simulacro-1.js';
import { LAB as simulacro2 } from './simulacro-2.js';

export const LABS = new Map([
  [simulacro1.id, simulacro1],
  [simulacro2.id, simulacro2],
  [bimestral.id, bimestral]
]);
