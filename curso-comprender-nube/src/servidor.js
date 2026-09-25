// Lo mínimo de Express que necesita este módulo, sin instalar nada.
//
// ¿Por qué no Express? En Render, el build de la plataforma solo instala las
// dependencias de plataforma/ y de examen-diagnostico/. Un módulo que no
// depende de nada se monta ahí sin tocar la configuración del despliegue, y en
// el salón no hay que correr `npm install` en su carpeta.
//
// Montado en la plataforma, Express nos entrega `req.url` ya recortado
// (/api/estado en lugar de /m/comprender-nube/api/estado), así que las rutas de
// aquí no saben ni les importa dónde viven.

import fs from 'node:fs';
import path from 'node:path';

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

/** Un error que ya trae el código HTTP con el que hay que responder. */
export function fallo(estado, mensaje) {
  return Object.assign(new Error(mensaje), { estado });
}

export function enviarJson(res, estado, datos) {
  const cuerpo = JSON.stringify(datos);
  res.writeHead(estado, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(cuerpo),
    'Cache-Control': 'no-store'
  });
  res.end(cuerpo);
}

export function enviarDescarga(res, nombre, tipo, contenido) {
  res.writeHead(200, {
    'Content-Type': tipo,
    'Content-Length': Buffer.byteLength(contenido),
    'Content-Disposition': `attachment; filename="${nombre}"`,
    'Cache-Control': 'no-store'
  });
  res.end(contenido);
}

/** Lee un cuerpo JSON con límite de tamaño. */
export function leerJson(req, limite = 64 * 1024) {
  // Si algo de más arriba ya lo leyó (un express.json() en la plataforma), se usa eso.
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return Promise.resolve(req.body);

  return new Promise((resolve, reject) => {
    const partes = [];
    let tamano = 0;
    req.on('data', (trozo) => {
      tamano += trozo.length;
      if (tamano > limite) {
        reject(fallo(413, 'La solicitud es demasiado grande'));
        req.destroy();
        return;
      }
      partes.push(trozo);
    });
    req.on('end', () => {
      if (partes.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(partes).toString('utf8')));
      } catch {
        reject(fallo(400, 'La solicitud no es un JSON válido'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Un enrutador con la misma cara que el de Express:
 *   app.get('/api/algo/:id', (req, res, { params, query }) => …)
 */
export function crearEnrutador() {
  const rutas = [];
  const registrar = (metodo) => (patron, manejador) =>
    rutas.push({ metodo, partes: patron.split('/'), manejador });

  function coincide(partes, pathname) {
    const segmentos = pathname.split('/');
    if (segmentos.length !== partes.length) return null;
    const params = {};
    for (let i = 0; i < partes.length; i++) {
      if (partes[i].startsWith(':')) {
        try {
          params[partes[i].slice(1)] = decodeURIComponent(segmentos[i]);
        } catch {
          return null;
        }
      } else if (partes[i] !== segmentos[i]) {
        return null;
      }
    }
    return params;
  }

  return {
    get: registrar('GET'),
    post: registrar('POST'),
    put: registrar('PUT'),
    delete: registrar('DELETE'),

    /** Devuelve true si alguna ruta atendió la solicitud. */
    async atender(req, res) {
      const url = new URL(req.url, 'http://modulo');
      const metodo = req.method === 'HEAD' ? 'GET' : req.method;
      for (const ruta of rutas) {
        if (ruta.metodo !== metodo) continue;
        const params = coincide(ruta.partes, url.pathname);
        if (!params) continue;
        await ruta.manejador(req, res, { params, query: Object.fromEntries(url.searchParams) });
        return true;
      }
      return false;
    }
  };
}

/**
 * Sirve los archivos de una carpeta. `alias` traduce rutas limpias a archivos,
 * por ejemplo { '/': '/index.html' }. Devuelve true si mandó algo.
 */
export function servirArchivos(carpeta, alias = {}) {
  const raiz = path.resolve(carpeta);

  return async function servir(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;

    let ruta;
    try {
      ruta = decodeURIComponent(new URL(req.url, 'http://modulo').pathname);
    } catch {
      return false;
    }
    ruta = alias[ruta] ?? ruta;

    // normalize('/../x') = '/x': nadie se sale de la carpeta pública.
    const archivo = path.join(raiz, path.posix.normalize('/' + ruta));
    if (!archivo.startsWith(raiz + path.sep)) return false;

    let info;
    try {
      info = await fs.promises.stat(archivo);
    } catch {
      return false;
    }
    if (!info.isFile()) return false;

    // no-cache = el navegador revisa cada vez si cambió. Si editas el curso a
    // media clase, basta con que el alumno recargue.
    const modificado = info.mtime.toUTCString();
    if (req.headers['if-modified-since'] === modificado) {
      res.writeHead(304, { 'Last-Modified': modificado, 'Cache-Control': 'no-cache' });
      res.end();
      return true;
    }

    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream',
      'Content-Length': info.size,
      'Last-Modified': modificado,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });
    if (req.method === 'HEAD') {
      res.end();
      return true;
    }
    fs.createReadStream(archivo).pipe(res);
    return true;
  };
}
