// Arranque cuando el curso corre solo (en tu laptop o en un servicio aparte).
//
// Para servirlo junto con el resto del material de la materia no uses este
// archivo: la plataforma del curso importa `crearApp` de app.js.

import http from 'node:http';

import { crearApp, configuracion } from './app.js';
import { almacen } from './src/almacen.js';

const { PUERTO, CLAVE_POR_DEFECTO } = configuracion;
const manejar = crearApp();

http
  .createServer((req, res) =>
    manejar(req, res, () => {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('No encontrado');
    })
  )
  .listen(PUERTO, '0.0.0.0', () => {
    console.log(`Comprender la computación en la nube: http://localhost:${PUERTO}`);
    console.log(`Panel docente: http://localhost:${PUERTO}/docente  (datos en ${almacen.archivo})`);
    if (CLAVE_POR_DEFECTO) {
      console.warn('AVISO: no definiste CLAVE_DOCENTE. El panel está abierto con la clave "cambiame".');
    }
  });
