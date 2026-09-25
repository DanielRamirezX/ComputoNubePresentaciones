// Dónde viven los registros del curso: un archivo JSON en data/.
//
// ¿Por qué no SQLite como el examen? Este módulo no instala nada (ver
// src/servidor.js), y para uno o dos grupos un JSON sobra: cabe en memoria, se
// lee completo al arrancar y se reescribe en cada cambio. Se escribe primero a
// un archivo temporal y luego se renombra, para que un apagón a media escritura
// no deje el archivo roto.
//
// Igual que el examen: en el plan gratis de Render el disco es efímero y el
// archivo se borra en cada redespliegue o cuando el servicio se duerme.
// Descarga el CSV antes de salir del salón.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fallo } from './servidor.js';

// La carpeta del curso, no la de quien lo arrancó: montado en la plataforma,
// process.cwd() es ../plataforma y los datos terminarían en otro lado.
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = process.env.DATA_DIR || path.join(RAIZ, 'data');
const ARCHIVO = path.join(DIR, 'comprender-nube.json');

// Un tope generoso para que nadie llene la memoria del servidor a propósito.
const MAX_ALUMNOS = 3000;

const vacio = () => ({ version: 1, practicaAbierta: false, alumnos: {}, entregas: {} });

function cargar() {
  let texto;
  try {
    texto = fs.readFileSync(ARCHIVO, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') console.error(`No pude leer ${ARCHIVO}:`, e.message);
    return vacio();
  }
  try {
    return { ...vacio(), ...JSON.parse(texto) };
  } catch {
    // Nunca se sobrescribe un archivo que no se entendió: se aparta para revisarlo.
    const copia = `${ARCHIVO}.danado-${Date.now()}`;
    fs.renameSync(ARCHIVO, copia);
    console.error(`El archivo de datos estaba dañado; lo aparté en ${copia} y arranco vacío.`);
    return vacio();
  }
}

let estado = cargar();

function guardar() {
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

// Quién es quién aunque cambie de celular: la matrícula si la dio; si no, el
// nombre sin acentos ni mayúsculas dentro de su grupo.
const normal = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const llave = (a) => (a.matricula ? `m:${normal(a.matricula)}` : `n:${normal(a.nombre)}|${a.grupo}`);
const delGrupo = (grupo) => (x) => !grupo || x.grupo === grupo;

export const almacen = {
  motor: 'archivo JSON',
  archivo: ARCHIVO,

  practicaAbierta: () => estado.practicaAbierta,

  existe: (id) => Object.hasOwn(estado.alumnos, id),

  abrirPractica(abierta) {
    estado.practicaAbierta = Boolean(abierta);
    guardar();
  },

  /** Da de alta al alumno o actualiza sus datos y su avance. */
  registrar({ id, nombre, matricula, grupo }, completados) {
    let alumno = estado.alumnos[id];
    if (!alumno) {
      if (Object.keys(estado.alumnos).length >= MAX_ALUMNOS) {
        throw fallo(507, 'Ya no caben más alumnos en este curso');
      }
      alumno = estado.alumnos[id] = { id, alta: new Date().toISOString(), completados: {} };
    }
    Object.assign(alumno, { nombre, matricula, grupo });
    if (completados) {
      alumno.completados = completados;
      alumno.ultimoAvance = new Date().toISOString();
    }
    guardar();
    return alumno;
  },

  iniciarPractica(id) {
    const alumno = estado.alumnos[id];
    if (alumno && !alumno.inicioPractica) {
      alumno.inicioPractica = new Date().toISOString();
      guardar();
    }
  },

  /**
   * Los alumnos del grupo. Si alguien entró desde dos celulares, sus registros
   * se funden en uno: el docente ve a una persona, con todo lo que avanzó.
   */
  alumnos(grupo) {
    const porLlave = new Map();
    for (const a of Object.values(estado.alumnos).filter(delGrupo(grupo))) {
      const k = llave(a);
      const previo = porLlave.get(k);
      if (!previo) {
        porLlave.set(k, { ...a, ids: [a.id], completados: { ...a.completados } });
        continue;
      }
      previo.ids.push(a.id);
      for (const [id, xp] of Object.entries(a.completados)) {
        previo.completados[id] = Math.max(previo.completados[id] ?? 0, xp);
      }
      // El nombre que se queda es el del registro que se movió más recientemente.
      if ((a.ultimoAvance ?? a.alta) > (previo.ultimoAvance ?? previo.alta)) {
        Object.assign(previo, { nombre: a.nombre, matricula: a.matricula, ultimoAvance: a.ultimoAvance });
      }
      if (a.alta < previo.alta) previo.alta = a.alta;
      if (a.inicioPractica && (!previo.inicioPractica || a.inicioPractica < previo.inicioPractica)) {
        previo.inicioPractica = a.inicioPractica;
      }
    }
    return [...porLlave.values()];
  },

  /** La entrega de este alumno, o la de otro registro suyo (otro celular). */
  entregaDe(alumno) {
    return estado.entregas[alumno.id] ?? Object.values(estado.entregas).find((e) => e.llave === llave(alumno)) ?? null;
  },

  guardarEntrega(entrega) {
    estado.entregas[entrega.alumnoId] = { ...entrega, llave: llave(entrega) };
    guardar();
  },

  entregas: (grupo) => Object.values(estado.entregas).filter(delGrupo(grupo)),

  grupos: () =>
    [...new Set([...Object.values(estado.alumnos), ...Object.values(estado.entregas)].map((x) => x.grupo))].sort(),

  /** Permite que un alumno vuelva a contestar la práctica. */
  borrarEntrega(alumnoId) {
    if (!estado.entregas[alumnoId]) return false;
    delete estado.entregas[alumnoId];
    guardar();
    return true;
  },

  /** Borra alumnos y entregas de un grupo, o de todos. */
  borrar(grupo) {
    let alumnos = 0;
    let entregas = 0;
    for (const [id, a] of Object.entries(estado.alumnos)) {
      if (delGrupo(grupo)(a)) {
        delete estado.alumnos[id];
        alumnos += 1;
      }
    }
    for (const [id, e] of Object.entries(estado.entregas)) {
      if (delGrupo(grupo)(e)) {
        delete estado.entregas[id];
        entregas += 1;
      }
    }
    guardar();
    return { alumnos, entregas };
  }
};
