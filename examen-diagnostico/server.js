// Arranque cuando el examen corre solo (en tu laptop o en Render).
//
// Si lo que quieres es servirlo junto con el resto del material de la materia,
// no uses este archivo: la plataforma del curso importa `crearApp` de app.js.

import { crearApp, configuracion } from './app.js';
import { almacen } from './src/almacen.js';

const { PUERTO, CLAVE_POR_DEFECTO } = configuracion;

crearApp().listen(PUERTO, () => {
  console.log(`Examen diagnóstico escuchando en el puerto ${PUERTO} (almacén: ${almacen.motor})`);
  if (CLAVE_POR_DEFECTO) {
    console.warn('AVISO: no definiste CLAVE_DOCENTE. El panel está abierto con la clave "cambiame".');
  }
});
