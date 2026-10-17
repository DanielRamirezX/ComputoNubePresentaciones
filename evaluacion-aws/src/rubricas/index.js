// La rúbrica de cada laboratorio, por id. Vive solo en el servidor: el
// navegador recibe las tareas, nunca cómo se califican. `repaso` dice en qué
// lección de la Ruta se repasa cada punto (ver src/repaso.js).

import * as bimestral from './bimestral.js';
import * as simulacro1 from './simulacro-1.js';
import * as simulacro2 from './simulacro-2.js';

export const RUBRICAS = new Map([
  ['simulacro-1', { revisar: simulacro1.revisar, solucion: simulacro1.solucion, repaso: simulacro1.REPASO ?? {} }],
  ['simulacro-2', { revisar: simulacro2.revisar, solucion: simulacro2.solucion, repaso: simulacro2.REPASO ?? {} }],
  ['bimestral', { revisar: bimestral.revisar, solucion: bimestral.solucion, repaso: bimestral.REPASO ?? {} }]
]);
