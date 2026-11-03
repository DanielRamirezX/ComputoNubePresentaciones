// La rúbrica de cada laboratorio, por id. Vive solo en el servidor: el
// navegador recibe las tareas, nunca cómo se califican. `repaso` dice en qué
// lección de la Ruta se repasa cada punto (ver src/repaso.js).

import * as bimestral from './bimestral.js';
import * as simulacro1 from './simulacro-1.js';
import * as simulacro2 from './simulacro-2.js';
import * as labS5 from './lab-s5.js';
import * as labS6 from './lab-s6.js';
import * as labS7 from './lab-s7.js';
import * as practica1 from './practica-1.js';
import * as practica2 from './practica-2.js';
import * as practica3 from './practica-3.js';
import * as practica4 from './practica-4.js';
import * as practica5 from './practica-5.js';
import * as final from './final.js';

export const RUBRICAS = new Map([
  ['simulacro-1', { revisar: simulacro1.revisar, solucion: simulacro1.solucion, repaso: simulacro1.REPASO ?? {} }],
  ['simulacro-2', { revisar: simulacro2.revisar, solucion: simulacro2.solucion, repaso: simulacro2.REPASO ?? {} }],
  ['bimestral', { revisar: bimestral.revisar, solucion: bimestral.solucion, repaso: bimestral.REPASO ?? {} }],
  ...[
    ['lab-s5', labS5],
    ['lab-s6', labS6],
    ['lab-s7', labS7],
    ['practica-1', practica1],
    ['practica-2', practica2],
    ['practica-3', practica3],
    ['practica-4', practica4],
    ['practica-5', practica5],
    ['final', final]
  ]
    .filter(([, m]) => typeof m.revisar === 'function') // un marcador todavía no cuenta
    .map(([id, m]) => [id, { revisar: m.revisar, solucion: m.solucion, repaso: m.REPASO ?? {} }])
]);
