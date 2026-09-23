import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const BASE_MODULOS = '/m';

/**
 * Si el alumno abre /m/iaas-paas-saas (sin la diagonal final), el navegador cree
 * que la carpeta base es /m/ y pide /m/estilos.css. Con la diagonal, todo lo
 * relativo cae en su lugar. Por eso este redirect existe.
 */
function redirigirADiagonal(app, ruta) {
  app.get(ruta, (req, res, next) => {
    if (req.originalUrl.split('?')[0].endsWith('/')) return next();
    const [, query = ''] = req.originalUrl.split('?');
    res.redirect(301, ruta + '/' + (query ? '?' + query : ''));
  });
}

function montarEstatico(app, modulo, carpeta) {
  const indice = path.join(carpeta, 'index.html');
  if (!fs.existsSync(indice)) {
    throw new Error(`no encontré index.html en ${carpeta}`);
  }
  const ruta = `${BASE_MODULOS}/${modulo.id}`;
  redirigirADiagonal(app, ruta);
  app.use(ruta, express.static(carpeta, { maxAge: '1h' }));
  return ruta + '/';
}

async function montarExpress(app, modulo, carpeta) {
  const entrada = path.join(carpeta, 'app.js');
  if (!fs.existsSync(entrada)) {
    throw new Error(`falta ${path.relative(process.cwd(), entrada)} (el módulo debe exportar crearApp)`);
  }

  let crearApp;
  try {
    ({ crearApp } = await import(pathToFileURL(entrada).href));
  } catch (e) {
    // El caso común: nunca se corrió `npm install` dentro de esa carpeta.
    if (e.code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error(`le faltan dependencias. Corre: cd ${modulo.ruta} && npm install`);
    }
    throw e;
  }

  if (typeof crearApp !== 'function') {
    throw new Error(`${modulo.ruta}/app.js no exporta crearApp()`);
  }

  const ruta = `${BASE_MODULOS}/${modulo.id}`;
  redirigirADiagonal(app, ruta);
  app.use(ruta, crearApp());
  return ruta + '/';
}

/**
 * Monta todos los módulos del curso. Un módulo roto NO tumba el servidor:
 * se marca con su motivo y aparece así en el índice, para que en clase sepas
 * de inmediato qué falta en lugar de ver una pantalla en blanco.
 */
export async function montarModulos(app, curso, raiz) {
  const reporte = [];

  for (const modulo of curso.modulos) {
    const publico = {
      id: modulo.id,
      titulo: modulo.titulo,
      resumen: modulo.resumen ?? '',
      etiqueta: modulo.etiqueta ?? '',
      tipo: modulo.tipo
    };

    if (modulo.tipo === 'enlace') {
      reporte.push({ ...publico, estado: 'ok', url: modulo.url, externo: true });
      continue;
    }

    const carpeta = path.resolve(raiz, modulo.ruta);

    try {
      if (!fs.existsSync(carpeta)) throw new Error(`no existe la carpeta ${modulo.ruta}`);

      const url =
        modulo.tipo === 'estatico'
          ? montarEstatico(app, modulo, carpeta)
          : await montarExpress(app, modulo, carpeta);

      reporte.push({ ...publico, estado: 'ok', url });
    } catch (e) {
      reporte.push({ ...publico, estado: 'error', url: null, detalle: e.message });
    }
  }

  return reporte;
}
