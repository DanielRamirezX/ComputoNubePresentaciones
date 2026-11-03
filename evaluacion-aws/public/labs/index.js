// Los laboratorios de la consola simulada, por id (lo que ve el alumno).

import { LAB as bimestral } from './bimestral.js';
import { LAB as simulacro1 } from './simulacro-1.js';
import { LAB as simulacro2 } from './simulacro-2.js';
// Los del simulador (SIMULADOR.md §6). Un marcador exporta LAB = null y no se registra.
import { LAB as labS5 } from './lab-s5.js';
import { LAB as labS6 } from './lab-s6.js';
import { LAB as labS7 } from './lab-s7.js';
import { LAB as practica1 } from './practica-1.js';
import { LAB as practica2 } from './practica-2.js';
import { LAB as practica3 } from './practica-3.js';
import { LAB as practica4 } from './practica-4.js';
import { LAB as practica5 } from './practica-5.js';
import { LAB as final } from './final.js';

export const LABS = new Map(
  [simulacro1, simulacro2, bimestral, labS5, labS6, labS7, practica1, practica2, practica3, practica4, practica5, final]
    .filter(Boolean)
    .map((lab) => [lab.id, lab])
);
