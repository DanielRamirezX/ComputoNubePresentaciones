// Las evidencias del laboratorio: las capturas que pide un paso con `evidencia`.
//
// Nunca salen del navegador del alumno. Se guardan en IndexedDB (localStorage
// no alcanza para imágenes) y al terminar se arman aquí mismo en un PDF, que el
// alumno descarga y sube a Blackboard. El servidor del curso no las ve.
//
// En el salón varias personas usan la misma computadora: cada captura se
// guarda con el id del perfil, así nadie entrega la de otro por accidente.

import { ANCHO, anchoTexto, crearPdf, partir } from './pdf.js';

const BASE = 'aws-practitioner-evidencias';
const ALMACEN = 'capturas';
// Una captura de pantalla completa pesa varios MB en PNG. A 1600 px de ancho y
// JPEG se lee perfecto en el PDF y cada una queda en unos cientos de KB.
const ANCHO_MAXIMO = 1600;
const CALIDAD = 0.85;
const PESO_MAXIMO = 25 * 1024 * 1024;

/* ------------------------------------------------------------ almacén */

// Si el navegador no deja usar IndexedDB (algunas ventanas privadas), las
// capturas viven en memoria mientras la pestaña siga abierta.
const enMemoria = new Map();
let conexion = null;

function abrir() {
  if (conexion) return conexion;
  conexion = new Promise((resolver) => {
    let peticion;
    try {
      peticion = indexedDB.open(BASE, 1);
    } catch {
      resolver(null);
      return;
    }
    peticion.onupgradeneeded = () => peticion.result.createObjectStore(ALMACEN);
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => resolver(null);
    peticion.onblocked = () => resolver(null);
  });
  return conexion;
}

async function operacion(modo, hacer) {
  const db = await abrir();
  if (!db) return null;
  return new Promise((resolver, rechazar) => {
    const tx = db.transaction(ALMACEN, modo);
    const peticion = hacer(tx.objectStore(ALMACEN));
    tx.oncomplete = () => resolver(peticion?.result ?? null);
    tx.onerror = () => rechazar(tx.error);
    tx.onabort = () => rechazar(tx.error);
  });
}

/** Si las capturas sobreviven a cerrar la pestaña. */
export async function almacenDuradero() {
  return (await abrir()) !== null;
}

export const claveEvidencia = (perfilId, actividadId, evidenciaId) => `${perfilId}:${actividadId}:${evidenciaId}`;

export async function leerEvidencia(clave) {
  if (!(await almacenDuradero())) return enMemoria.get(clave) ?? null;
  return (await operacion('readonly', (almacen) => almacen.get(clave))) ?? null;
}

export async function guardarEvidencia(clave, registro) {
  if (!(await almacenDuradero())) {
    enMemoria.set(clave, registro);
    return;
  }
  await operacion('readwrite', (almacen) => almacen.put(registro, clave));
}

export async function borrarEvidencia(clave) {
  if (!(await almacenDuradero())) {
    enMemoria.delete(clave);
    return;
  }
  await operacion('readwrite', (almacen) => almacen.delete(clave));
}

/* ------------------------------------------------------------ la imagen */

async function decodificar(archivo) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(archivo);
    } catch {
      /* algunos formatos solo los abre <img>: se intenta abajo */
    }
  }
  const url = URL.createObjectURL(archivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Convierte cualquier imagen (PNG del recorte de Windows, JPG del celular,
 * WebP…) en el JPEG que va al PDF. Lanza con un mensaje para el alumno si no
 * es una imagen que el navegador sepa abrir.
 */
export async function prepararCaptura(archivo) {
  if (!archivo || !String(archivo.type).startsWith('image/')) {
    throw new Error('Eso no es una imagen. Usa una captura de pantalla (PNG o JPG).');
  }
  if (archivo.size > PESO_MAXIMO) throw new Error('La imagen pesa más de 25 MB. Toma la captura de nuevo, solo de la ventana.');
  let imagen;
  try {
    imagen = await decodificar(archivo);
  } catch {
    throw new Error('El navegador no pudo abrir esa imagen. Prueba con una captura en PNG o JPG.');
  }
  const escala = Math.min(1, ANCHO_MAXIMO / imagen.width);
  const ancho = Math.max(1, Math.round(imagen.width * escala));
  const alto = Math.max(1, Math.round(imagen.height * escala));
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext('2d');
  // JPEG no tiene transparencia: lo transparente de un PNG saldría negro.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, ancho, alto);
  ctx.drawImage(imagen, 0, 0, ancho, alto);
  imagen.close?.();
  const blob = await new Promise((resolver) => lienzo.toBlob(resolver, 'image/jpeg', CALIDAD));
  if (!blob) throw new Error('No se pudo preparar la imagen. Inténtalo de nuevo.');
  return {
    blob,
    ancho,
    alto,
    nombre: archivo.name && archivo.name !== 'image.png' ? archivo.name : 'Captura pegada',
    fecha: new Date().toISOString()
  };
}

/* ------------------------------------------------------------ el PDF */

const MARGEN = 50;
const ANCHO_UTIL = ANCHO - MARGEN * 2;
const LIMITE = 730; // debajo va el pie

const TINTA = [22, 24, 29];
const GRIS = [75, 81, 96];
const LINEA = [214, 205, 187];
const AMARILLO = [255, 210, 63];
const PAPEL = [251, 248, 239];

const fechaLarga = (iso, zona) =>
  new Date(iso).toLocaleString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(zona ? { timeZone: zona } : {})
  });

/**
 * Arma el PDF de evidencias. Es una función pura (no toca el navegador), así
 * que también se prueba en Node.
 *
 * @param {object} datos
 * @param {string} datos.curso        'Ruta AWS Cloud Practitioner'
 * @param {string} datos.sesion       'Sesión 1 · Tu primera máquina en AWS'
 * @param {string} datos.laboratorio  el título del laboratorio
 * @param {{nombre: string, matricula?: string, grupo: string}} datos.alumno
 * @param {Array<{paso: number, tituloPaso: string, titulo: string, pide: string,
 *   captura: {bytes: Uint8Array, ancho: number, alto: number, nombre: string, fecha: string}}>} datos.evidencias
 * @param {string} datos.fecha        cuándo se generó (ISO)
 * @param {string} [datos.zona]       zona horaria para las fechas
 * @returns {Uint8Array}
 */
export function documentoEvidencias({ curso, sesion, laboratorio, alumno, evidencias, fecha, zona }) {
  const pdf = crearPdf({ titulo: `Evidencias de ${alumno.nombre} · ${laboratorio}` });

  // --------------------------------------------------------------- portada
  pdf.rect(0, 0, ANCHO, 100, { relleno: AMARILLO });
  pdf.linea(0, 100, ANCHO, 100, { grosor: 2 });
  pdf.texto(MARGEN, 34, `${curso} · Evidencias del laboratorio`.toUpperCase(), { tamano: 8.5, negrita: true, color: GRIS });
  // El título cabe en un renglón para cualquier laboratorio razonable; si no,
  // se achica en vez de encimarse con la sesión.
  const tamanoTitulo = anchoTexto(laboratorio, 20, true) <= ANCHO_UTIL ? 20 : 15;
  pdf.texto(MARGEN, 62, partir(laboratorio, ANCHO_UTIL, tamanoTitulo, true)[0], { tamano: tamanoTitulo, negrita: true });
  pdf.texto(MARGEN, 84, sesion, { tamano: 11, color: GRIS });
  let y = 124;

  const filas = [
    ['Nombre', alumno.nombre],
    ['Matrícula', alumno.matricula || '—'],
    ['Grupo', alumno.grupo || '—'],
    ['Generado', fechaLarga(fecha, zona)],
    ['Evidencias', `${evidencias.length}`]
  ];
  for (const [etiqueta, valor] of filas) {
    pdf.texto(MARGEN, y, etiqueta.toUpperCase(), { tamano: 8, negrita: true, color: GRIS });
    pdf.texto(MARGEN + 80, y, valor, { tamano: 11, negrita: etiqueta === 'Nombre' });
    y += 17;
  }
  y += 4;

  // ----------------------------------------------------------- evidencias
  evidencias.forEach((ev, n) => {
    const cabeza = partir(`Evidencia ${n + 1} · ${ev.titulo}`, ANCHO_UTIL, 13, true);
    const pide = partir(`Debe verse: ${ev.pide}`, ANCHO_UTIL - 20, 9.5);
    const altoTexto = 18 + cabeza.length * 16 + 16 + pide.length * 12 + 20 + 16;

    // La imagen ocupa todo el ancho útil salvo que sea tan alta que no quepa ni
    // en una hoja sola: entonces se achica para que quepa entera.
    const altoDisponible = LIMITE - 50 - altoTexto - 10;
    let ancho = ANCHO_UTIL;
    let alto = (ev.captura.alto / ev.captura.ancho) * ancho;
    if (alto > altoDisponible) {
      alto = altoDisponible;
      ancho = (ev.captura.ancho / ev.captura.alto) * alto;
    }

    // Cada evidencia va completa en una hoja: su texto nunca queda separado de su imagen.
    if (y + altoTexto + alto + 10 > LIMITE) {
      pdf.nuevaPagina();
      y = 50;
    } else {
      y += 10;
    }

    pdf.linea(MARGEN, y, MARGEN + ANCHO_UTIL, y, { color: TINTA, grosor: 1.5 });
    y += 18;
    cabeza.forEach((renglon) => {
      pdf.texto(MARGEN, y, renglon, { tamano: 13, negrita: true });
      y += 16;
    });
    pdf.texto(MARGEN, y, `Paso ${ev.paso}: ${ev.tituloPaso}`, { tamano: 9.5, color: GRIS });
    y += 16;
    const altoPide = pide.length * 12 + 10;
    pdf.rect(MARGEN, y - 11, ANCHO_UTIL, altoPide, { relleno: PAPEL });
    pide.forEach((renglon) => {
      pdf.texto(MARGEN + 10, y + 1, renglon, { tamano: 9.5 });
      y += 12;
    });
    y += 20;
    pdf.texto(MARGEN, y - 6, `Captura agregada el ${fechaLarga(ev.captura.fecha, zona)} · ${ev.captura.nombre}`, { tamano: 8.5, color: GRIS });
    y += 6;

    const x = MARGEN + (ANCHO_UTIL - ancho) / 2;
    pdf.imagen(x, y, ancho, alto, ev.captura);
    pdf.rect(x, y, ancho, alto, { borde: LINEA, grosor: 0.75 });
    y += alto;
  });

  // ------------------------------------------------------------------ pies
  const total = pdf.totalPaginas;
  for (let i = 0; i < total; i++) {
    pdf.irA(i);
    pdf.linea(MARGEN, 752, MARGEN + ANCHO_UTIL, 752, { color: LINEA });
    pdf.texto(MARGEN, 766, `${alumno.nombre}${alumno.matricula ? ` · ${alumno.matricula}` : ''} · ${laboratorio}`, { tamano: 8, color: GRIS });
    pdf.texto(MARGEN + ANCHO_UTIL, 766, `Página ${i + 1} de ${total}`, { tamano: 8, color: GRIS, alinear: 'derecha' });
  }

  return pdf.bytes();
}

/** Nombre del archivo: sin acentos ni espacios, para que Blackboard no lo cambie. */
export function nombreArchivo(alumno, actividadId) {
  const limpio = (t) =>
    String(t ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
  const quien = [limpio(alumno.matricula), limpio(alumno.nombre)].filter(Boolean).join('-');
  return `evidencias-${limpio(actividadId)}-${quien || 'alumno'}.pdf`;
}
