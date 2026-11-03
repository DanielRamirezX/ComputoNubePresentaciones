// Qué tarjetas del índice ven los alumnos.
//
// El docente puede ocultar una tarjeta desde el tablero (/docente). Ocultar es
// SOLO quitarla del índice: el módulo sigue montado y su dirección directa sigue
// abriendo, para que el docente lo pruebe o abra su panel sin enseñárselo aún al
// grupo. Nada se borra.
//
// Se guarda en un JSON chiquito, con el mismo cuidado que los módulos: primero a
// un archivo temporal y luego se renombra, para que un apagón a media escritura
// no deje el archivo roto. En el plan gratis de Render el disco es efímero: si
// se borra, todas las tarjetas vuelven a estar visibles (lo seguro).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// La carpeta de la plataforma, no la de quien la arrancó.
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'plataforma') : path.join(RAIZ, 'data');
const ARCHIVO = path.join(DIR, 'indice.json');

const vacio = () => ({ version: 1, ocultas: [] });

function cargar() {
  let texto;
  try {
    texto = fs.readFileSync(ARCHIVO, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') console.error(`No pude leer ${ARCHIVO}:`, e.message);
    return vacio();
  }
  try {
    const datos = JSON.parse(texto);
    return { ...vacio(), ocultas: Array.isArray(datos.ocultas) ? datos.ocultas.filter((id) => typeof id === 'string') : [] };
  } catch {
    // Nunca se sobrescribe un archivo que no se entendió: se aparta para revisarlo.
    const copia = `${ARCHIVO}.danado-${Date.now()}`;
    fs.renameSync(ARCHIVO, copia);
    console.error(`El archivo del índice estaba dañado; lo aparté en ${copia} y muestro todo.`);
    return vacio();
  }
}

let estado = cargar();
const ocultas = new Set(estado.ocultas);

function guardar() {
  estado = { version: 1, ocultas: [...ocultas] };
  fs.mkdirSync(DIR, { recursive: true });
  const texto = JSON.stringify(estado);
  const temporal = `${ARCHIVO}.tmp`;
  fs.writeFileSync(temporal, texto);
  try {
    fs.renameSync(temporal, ARCHIVO);
  } catch {
    // En Windows, un antivirus o un respaldo puede tener abierto el archivo un instante.
    fs.writeFileSync(ARCHIVO, texto);
    fs.rmSync(temporal, { force: true });
  }
}

export const estaVisible = (id) => !ocultas.has(id);

/** Cambia la visibilidad de una tarjeta. Si no cambia nada, no toca el disco. */
export function fijarVisible(id, visible) {
  if (visible === estaVisible(id)) return;
  if (visible) ocultas.delete(id);
  else ocultas.add(id);
  try {
    guardar();
  } catch (e) {
    // Si no se pudo escribir, se deshace en memoria: lo que ven los alumnos no
    // debe quedar distinto de lo que el tablero muestra ni de lo que hay en disco.
    if (visible) ocultas.add(id);
    else ocultas.delete(id);
    estado = { version: 1, ocultas: [...ocultas] };
    throw e;
  }
}
