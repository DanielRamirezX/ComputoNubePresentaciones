// Dónde viven los registros de la evaluación: archivos JSON en data/.
//
// Igual que la Ruta AWS (../curso-aws-practitioner/src/almacen.js): el módulo
// no instala nada, y para uno o dos grupos un JSON sobra. Cabe en memoria, se
// lee completo al arrancar y se reescribe en cada cambio, primero a un archivo
// temporal y luego renombrándolo, para que un apagón a media escritura no deje
// el archivo roto.
//
// Son dos archivos:
//   - evaluacion-aws.json         alumnos, configuración de cada evaluación,
//                                 horas de inicio y entregas. Se escribe al
//                                 momento: es lo que vale.
//   - evaluacion-aws-copias.json  la última copia del laboratorio de cada
//                                 alumno. Llega cada pocos segundos por alumno
//                                 y puede pesar cientos de KB, así que se
//                                 escribe como mucho cada 3 s. Si se pierde, el
//                                 navegador del alumno conserva la suya.
//
// En el plan gratis de Render el disco es efímero: se borra en cada
// redespliegue o cuando el servicio se duerme. Por eso cada entrega regresa con
// un comprobante firmado (src/firma.js) y el docente descarga el CSV al
// terminar la clase.

import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { EVALUACIONES, evaluacionDe } from './evaluaciones.js';
import { fallo } from './servidor.js';

// La carpeta del módulo, no la de quien lo arrancó: montado en la plataforma,
// process.cwd() es ../plataforma y los datos terminarían en otro lado.
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = process.env.DATA_DIR || path.join(RAIZ, 'data');
const ARCHIVO = path.join(DIR, 'evaluacion-aws.json');
const ARCHIVO_COPIAS = path.join(DIR, 'evaluacion-aws-copias.json');

// Un tope generoso para que nadie llene la memoria del servidor a propósito.
const MAX_ALUMNOS = 3000;
const ESPERA_COPIAS_MS = 3000;

// La generación identifica este archivo de datos: nace al azar cuando el
// archivo se crea. Si Render borra el disco, la siguiente es otra (ver firma.js).
const vacio = () => ({
  version: 1,
  generacion: randomBytes(8).toString('hex'),
  creado: new Date().toISOString(),
  alumnos: {},
  evaluaciones: {}
});

function leerArchivo(archivo, alFaltar) {
  let texto;
  try {
    texto = fs.readFileSync(archivo, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') console.error(`No pude leer ${archivo}:`, e.message);
    return alFaltar();
  }
  try {
    return JSON.parse(texto);
  } catch {
    // Nunca se sobrescribe un archivo que no se entendió: se aparta para revisarlo.
    const copia = `${archivo}.danado-${Date.now()}`;
    fs.renameSync(archivo, copia);
    console.error(`El archivo de datos estaba dañado; lo aparté en ${copia} y arranco vacío.`);
    return alFaltar();
  }
}

function escribirArchivo(archivo, datos) {
  fs.mkdirSync(DIR, { recursive: true });
  const texto = JSON.stringify(datos);
  const temporal = `${archivo}.tmp`;
  fs.writeFileSync(temporal, texto);
  try {
    fs.renameSync(temporal, archivo);
  } catch {
    // En Windows, un antivirus o un respaldo puede tener abierto el archivo un instante.
    fs.writeFileSync(archivo, texto);
    fs.rmSync(temporal, { force: true });
  }
}

let estado = { ...vacio(), ...leerArchivo(ARCHIVO, vacio) };
let copias = leerArchivo(ARCHIVO_COPIAS, () => ({}));
const nuevo = !fs.existsSync(ARCHIVO);

const guardar = () => escribirArchivo(ARCHIVO, estado);
if (nuevo) guardar(); // así la generación queda fija desde el arranque

let esperaCopias = null;
function guardarCopiasPronto() {
  if (esperaCopias) return;
  esperaCopias = setTimeout(() => {
    esperaCopias = null;
    try {
      escribirArchivo(ARCHIVO_COPIAS, copias);
    } catch (e) {
      console.error('No pude guardar las copias de los laboratorios:', e.message);
    }
  }, ESPERA_COPIAS_MS);
  esperaCopias.unref?.();
}

// Quién es quién aunque cambie de equipo: la matrícula si la dio; si no, el
// nombre sin acentos ni mayúsculas dentro de su grupo.
const normal = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export const llave = (a) => (a.matricula ? `m:${normal(a.matricula)}` : `n:${normal(a.nombre)}|${a.grupo}`);
const delGrupo = (grupo) => (x) => !grupo || x.grupo === grupo;

/** Lo guardado de una evaluación, creándolo si todavía no existe. */
function evaluacion(evId) {
  const e = (estado.evaluaciones[evId] ??= {});
  // Sin `abierta` guardado, manda el valor de arranque de la evaluación (config).
  e.teoria ??= {};
  e.practica ??= {};
  e.inicios ??= { teoria: {}, practica: {} };
  e.entregas ??= { teoria: {}, practica: {} };
  return e;
}

/** Lo de este alumno o, si entró desde otro equipo, lo de otro registro suyo. */
function delAlumno(mapa, alumno) {
  if (!mapa) return null;
  if (Object.hasOwn(mapa, alumno.id)) return mapa[alumno.id];
  const k = llave(alumno);
  return Object.values(mapa).find((x) => x.llave === k) ?? null;
}

export const almacen = {
  motor: 'archivo JSON',
  archivo: ARCHIVO,
  get generacion() {
    return estado.generacion;
  },

  existe: (id) => Object.hasOwn(estado.alumnos, id),
  alumno: (id) => (Object.hasOwn(estado.alumnos, id) ? estado.alumnos[id] : null),

  /** Da de alta al alumno o actualiza sus datos. Solo escribe si algo cambió. */
  registrar({ id, nombre, matricula, grupo }) {
    let alumno = estado.alumnos[id];
    if (!alumno) {
      if (Object.keys(estado.alumnos).length >= MAX_ALUMNOS) {
        throw fallo(507, 'Ya no caben más alumnos en esta evaluación');
      }
      alumno = estado.alumnos[id] = { id, nombre, matricula, grupo, alta: new Date().toISOString() };
      guardar();
      return alumno;
    }
    if (alumno.nombre !== nombre || alumno.matricula !== matricula || alumno.grupo !== grupo) {
      Object.assign(alumno, { nombre, matricula, grupo, cambio: new Date().toISOString() });
      guardar();
    }
    return alumno;
  },

  /** Abierta/cerrada, retroalimentación y autorrevisión, con sus valores de arranque. */
  config(evId) {
    const ev = evaluacionDe(evId);
    const e = estado.evaluaciones[evId];
    return {
      teoria: { abierta: e?.teoria?.abierta ?? Boolean(ev.abierta?.teoria) },
      practica: { abierta: e?.practica?.abierta ?? Boolean(ev.abierta?.practica) },
      retro: e?.retro ?? ev.retro,
      autorrevision: e?.autorrevision ?? ev.autorrevision
    };
  },

  configurar(evId, { teoria, practica, retro, autorrevision }) {
    const e = evaluacion(evId);
    if (typeof teoria === 'boolean') e.teoria.abierta = teoria;
    if (typeof practica === 'boolean') e.practica.abierta = practica;
    if (retro !== undefined) e.retro = retro;
    if (typeof autorrevision === 'boolean') e.autorrevision = autorrevision;
    guardar();
    return this.config(evId);
  },

  /** { hora, identidad } de cuando el alumno empezó esa parte, o null. */
  inicio: (alumno, evId, parte) => delAlumno(estado.evaluaciones[evId]?.inicios?.[parte], alumno),

  /**
   * Anota la hora en que el alumno empezó (solo la primera vez). En la práctica
   * se guarda también con qué nombre y matrícula empezó: de ahí salen sus
   * datos del laboratorio (rangos, sufijos) y no deben cambiar a media prueba.
   */
  iniciar(alumno, evId, parte) {
    const previo = this.inicio(alumno, evId, parte);
    if (previo) return previo;
    const inicio = {
      hora: new Date().toISOString(),
      llave: llave(alumno),
      identidad: { nombre: alumno.nombre, matricula: alumno.matricula }
    };
    evaluacion(evId).inicios[parte][alumno.id] = inicio;
    guardar();
    return inicio;
  },

  entregaDe: (alumno, evId, parte) => delAlumno(estado.evaluaciones[evId]?.entregas?.[parte], alumno),

  guardarEntrega(evId, parte, entrega) {
    evaluacion(evId).entregas[parte][entrega.alumnoId] = { ...entrega, llave: llave(entrega) };
    guardar();
  },

  entregas: (grupo, evId, parte) => Object.values(estado.evaluaciones[evId]?.entregas?.[parte] ?? {}).filter(delGrupo(grupo)),

  /**
   * Permite que el alumno repita una parte: se borra su entrega y su hora de
   * inicio (el reloj vuelve a empezar). La copia del laboratorio se queda: si
   * repite la práctica, sigue desde donde iba o reinicia su cuenta él mismo.
   */
  borrarEntrega(alumnoId, evId, parte) {
    const e = estado.evaluaciones[evId];
    const entrega = e?.entregas?.[parte]?.[alumnoId];
    if (!entrega) return false;
    delete e.entregas[parte][alumnoId];
    for (const [id, inicio] of Object.entries(e.inicios[parte])) {
      if (id === alumnoId || inicio.llave === entrega.llave) delete e.inicios[parte][id];
    }
    guardar();
    return true;
  },

  /** La copia más reciente del laboratorio del alumno (de cualquiera de sus equipos). */
  copiaDe(alumno, evId) {
    const delEv = copias[evId];
    if (!delEv) return null;
    const k = llave(alumno);
    let mejor = Object.hasOwn(delEv, alumno.id) ? delEv[alumno.id] : null;
    for (const c of Object.values(delEv)) {
      if (c.llave === k && (!mejor || c.hora > mejor.hora)) mejor = c;
    }
    return mejor;
  },

  guardarCopia(alumno, evId, { estado: cuenta, rev, identidad }) {
    copias[evId] ??= {};
    const copia = { alumnoId: alumno.id, llave: llave(alumno), estado: cuenta, rev, identidad, hora: new Date().toISOString() };
    copias[evId][alumno.id] = copia;
    guardarCopiasPronto();
    return copia;
  },

  /**
   * Los alumnos del grupo. Si alguien entró desde dos equipos, sus registros
   * se funden en uno: el docente ve a una persona.
   */
  alumnos(grupo) {
    const porLlave = new Map();
    for (const a of Object.values(estado.alumnos).filter(delGrupo(grupo))) {
      const k = llave(a);
      const previo = porLlave.get(k);
      if (!previo) {
        porLlave.set(k, { ...a, ids: [a.id] });
        continue;
      }
      previo.ids.push(a.id);
      // El nombre que se queda es el del registro más reciente.
      if ((a.cambio ?? a.alta) > (previo.cambio ?? previo.alta)) {
        Object.assign(previo, { nombre: a.nombre, matricula: a.matricula, cambio: a.cambio ?? a.alta });
      }
      if (a.alta < previo.alta) previo.alta = a.alta;
    }
    return [...porLlave.values()];
  },

  /** El alumno (fundido) al que pertenece ese id, o null. */
  alumnoFundido(id) {
    const a = this.alumno(id);
    if (!a) return null;
    return this.alumnos(a.grupo).find((x) => x.ids.includes(id)) ?? null;
  },

  grupos() {
    const entregas = Object.values(estado.evaluaciones).flatMap((e) =>
      Object.values(e.entregas ?? {}).flatMap((p) => Object.values(p))
    );
    return [...new Set([...Object.values(estado.alumnos), ...entregas].map((x) => x.grupo))].sort();
  }
};

// Que ninguna evaluación del registro se quede sin su lugar en el archivo.
for (const ev of EVALUACIONES) evaluacion(ev.id);
