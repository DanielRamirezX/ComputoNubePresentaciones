// Las tres evaluaciones del bimestre. Este archivo es el registro: qué partes
// tiene cada una, cuándo se aplica y cómo arranca su configuración. Lo que el
// docente cambia en el panel (abrir, cerrar, retroalimentación, autorrevisión)
// vive en el almacén; aquí solo están los valores con los que empieza.
//
// `teoria` es el id del banco en src/teoria/index.js (TEORIA) y `lab` el del
// laboratorio en src/rubricas/index.js (RUBRICAS) y public/labs/index.js
// (LABS). Si todavía no existe el banco o la rúbrica, la parte aparece como
// «en preparación» y nadie la puede abrir por accidente.

export const EVALUACIONES = [
  {
    id: 'simulacro-1',
    titulo: 'Simulacro 1',
    fecha: '2026-10-20',
    fechaTexto: 'martes 20 de octubre de 2026',
    resumen: 'Ensayo completo del examen: casos de negocio y un laboratorio en la consola simulada.',
    teoria: 'simulacro-1',
    lab: 'simulacro-1',
    // La calificación combinada: 60 % la teórica y 40 % la práctica.
    pesos: { teoria: 60, practica: 40 },
    retro: 'completa',
    autorrevision: true,
    // Quien ya entregó puede repetir cada parte para practicar. Solo cuenta la
    // primera entrega: los intentos se califican y no se guardan.
    reintentos: true,
    // Ya se aplicó (20 de octubre): queda abierto para quien faltó, aunque
    // Render reinicie el servidor. El docente aún puede cerrarlo en el panel.
    abierta: { teoria: true, practica: true }
  },
  {
    id: 'simulacro-2',
    titulo: 'Simulacro 2',
    fecha: '2026-10-23',
    fechaTexto: 'viernes 23 de octubre de 2026',
    resumen: 'Segundo ensayo, con casos y laboratorio distintos a los del simulacro 1.',
    teoria: 'simulacro-2',
    lab: 'simulacro-2',
    pesos: { teoria: 60, practica: 40 },
    retro: 'completa',
    autorrevision: true,
    reintentos: true
  },
  {
    id: 'bimestral',
    titulo: 'Examen bimestral · parte práctica',
    fecha: '2026-10-27',
    fechaTexto: 'martes 27 de octubre de 2026',
    resumen: 'La parte práctica del examen bimestral: un laboratorio en la consola simulada. La teórica la aplica tu docente por su cuenta.',
    teoria: null,
    lab: 'bimestral',
    pesos: { practica: 100 },
    retro: 'calificacion',
    autorrevision: false,
    reintentos: false
  }
];

const POR_ID = new Map(EVALUACIONES.map((e) => [e.id, e]));

/** La evaluación con ese id, o null. */
export const evaluacionDe = (id) => POR_ID.get(String(id ?? '')) ?? null;

export const PARTES = ['teoria', 'practica'];
export const RETROS = ['completa', 'calificacion'];

/** ¿Esta evaluación tiene esa parte? (el bimestral no tiene teórica). */
export const tieneParte = (ev, parte) => (parte === 'teoria' ? Boolean(ev.teoria) : Boolean(ev.lab));

/**
 * La calificación combinada (0 a 100, con un decimal) a partir del porcentaje
 * de cada parte. Solo existe cuando ya están todas las partes que pesan.
 */
export function combinada(ev, porcentajes) {
  let suma = 0;
  for (const [parte, peso] of Object.entries(ev.pesos)) {
    const p = porcentajes[parte];
    if (typeof p !== 'number' || !Number.isFinite(p)) return null;
    suma += (p * peso) / 100;
  }
  return Math.round(suma * 10) / 10;
}
