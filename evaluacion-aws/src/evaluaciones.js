// Todo lo que se aplica en la consola simulada. Este archivo es el registro:
// qué partes tiene cada evaluación, cuándo se aplica y cómo arranca su
// configuración. Lo que el docente cambia en el panel (abrir, cerrar,
// retroalimentación, autorrevisión) vive en el almacén; aquí solo están los
// valores con los que empieza.
//
// `teoria` es el id del banco en src/teoria/index.js (TEORIA) y `lab` el del
// laboratorio en src/rubricas/index.js (RUBRICAS) y public/labs/index.js
// (LABS). Si todavía no existe el banco o la rúbrica, la parte aparece como
// «en preparación» y nadie la puede abrir por accidente.
//
// `tipo` dice cómo se comporta cada una (ver TIPOS y SIMULADOR.md §6):
//   'evaluacion'  — los simulacros y el bimestral de octubre (sin cambios).
//   'laboratorio' — la versión de simulador del laboratorio de una sesión de
//                   la Ruta (5, 6 y 7): abierta siempre, se entrega como
//                   evidencia y después se puede repetir.
//   'practica'    — las prácticas integradoras de las sesiones 9 a 13: el
//                   docente las abre en clase; una entrega y luego reintentos.
//   'final'       — el examen final: teórica y práctica, una sola entrega.

/**
 * Lo que cambia según el tipo. `minutos` y `tareas` (requeridas, sin contar el
 * bono) son los topes que revisa `npm run verificar`; `minutosTeoria`, el reloj
 * de la parte teórica.
 */
export const TIPOS = {
  evaluacion: { nombre: 'Evaluación', plural: 'Evaluaciones de octubre', minutos: 60, tareas: [4, 6], minutosTeoria: 45 },
  laboratorio: { nombre: 'Laboratorio de sesión', plural: 'Laboratorios de sesión', minutos: 55, tareas: [4, 7] },
  practica: { nombre: 'Práctica integradora', plural: 'Prácticas integradoras', minutos: 100, tareas: [5, 9] },
  final: { nombre: 'Examen final', plural: 'Examen final', minutos: 60, tareas: [5, 8], minutosTeoria: 50 }
};

// Los valores de arranque de cada tipo nuevo. Cada entrada de abajo los toma
// y agrega lo suyo; el docente cambia en el panel lo que haga falta.
const LABORATORIO = {
  tipo: 'laboratorio',
  teoria: null,
  pesos: { practica: 100 },
  retro: 'completa',
  autorrevision: true,
  // La entrega queda como evidencia; después puede repetirlo para practicar.
  reintentos: true,
  // Siempre abierto: el alumno elige si lo hace en DataCamp o aquí.
  abierta: { practica: true },
  asistente: false,
  preguntasAsistente: 10
};

const PRACTICA = {
  tipo: 'practica',
  teoria: null,
  pesos: { practica: 100 },
  retro: 'completa',
  autorrevision: true,
  reintentos: true,
  // Cerrada hasta que el docente la abre en clase.
  abierta: {},
  // El asistente de IA es opcional para el alumno: 10 preguntas por práctica.
  asistente: true,
  preguntasAsistente: 10
};

export const EVALUACIONES = [
  {
    id: 'simulacro-1',
    tipo: 'evaluacion',
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
    tipo: 'evaluacion',
    titulo: 'Simulacro 2',
    fecha: '2026-10-23',
    fechaTexto: 'viernes 23 de octubre de 2026',
    resumen: 'Segundo ensayo, con casos y laboratorio distintos a los del simulacro 1.',
    teoria: 'simulacro-2',
    lab: 'simulacro-2',
    pesos: { teoria: 60, practica: 40 },
    retro: 'completa',
    autorrevision: true,
    reintentos: true,
    // Se subió un cambio el 23 de octubre con el simulacro en curso: arranca
    // abierto para que el reinicio de Render no lo cierre a media clase.
    abierta: { teoria: true, practica: true },
    // El asistente de IA del laboratorio (src/asistente.js): ayuda a ubicar
    // dónde está atorado el alumno sin darle la respuesta. El docente lo
    // apaga o lo prende en el panel.
    asistente: true
  },
  {
    id: 'bimestral',
    tipo: 'evaluacion',
    titulo: 'Examen bimestral · parte práctica',
    fecha: '2026-10-27',
    fechaTexto: 'martes 27 de octubre de 2026',
    resumen: 'La parte práctica del examen bimestral: un laboratorio en la consola simulada. La teórica la aplica tu docente por su cuenta.',
    teoria: null,
    lab: 'bimestral',
    pesos: { practica: 100 },
    // El docente pidió (27 de octubre) la misma ayuda que en el simulacro 2,
    // pero con menos preguntas al asistente, y la retro completa al entregar:
    // el resultado queda como evidencia de qué cumplió y qué no.
    retro: 'completa',
    autorrevision: true,
    reintentos: false,
    asistente: true,
    preguntasAsistente: 5
  },

  // ------------------------------------------- laboratorios de sesión (5 a 7)
  // Sin fecha fija: el alumno los hace en la clase de su sesión, o después.

  {
    ...LABORATORIO,
    id: 'lab-s5',
    sesion: 5,
    titulo: 'Laboratorio de la sesión 5 · Bases de datos',
    fecha: null,
    fechaTexto: 'Sesión 5 de la Ruta AWS',
    resumen: 'Una base de datos administrada en RDS, con respaldos y réplica, y una tabla de DynamoDB. Aquí sí se pueden crear.',
    lab: 'lab-s5'
  },
  {
    ...LABORATORIO,
    id: 'lab-s6',
    sesion: 6,
    titulo: 'Laboratorio de la sesión 6 · Escalar y automatizar',
    fecha: null,
    fechaTexto: 'Sesión 6 de la Ruta AWS',
    resumen: 'Una plantilla de lanzamiento, un balanceador, un grupo de Auto Scaling que se cura solo y una alarma que te avisa por correo.',
    lab: 'lab-s6'
  },
  {
    ...LABORATORIO,
    id: 'lab-s7',
    sesion: 7,
    titulo: 'Laboratorio de la sesión 7 · Costos y buenas prácticas',
    fecha: null,
    fechaTexto: 'Sesión 7 de la Ruta AWS',
    resumen: 'Estima antes de crear, pon un presupuesto con alertas, reparte el gasto con etiquetas y atiende a Trusted Advisor.',
    lab: 'lab-s7'
  },

  // ---------------------------------- prácticas integradoras (sesiones 9 a 13)

  {
    ...PRACTICA,
    id: 'practica-1',
    sesion: 9,
    titulo: 'Práctica 1 · La tienda de artesanías de Oaxaca',
    fecha: null,
    fechaTexto: 'Sesión 9 de la Ruta AWS',
    resumen: 'La tienda vende en línea: una web de dos capas que no se cae, con balanceador, Auto Scaling, una base Multi-AZ y alertas.',
    lab: 'practica-1'
  },
  {
    ...PRACTICA,
    id: 'practica-2',
    sesion: 10,
    titulo: 'Práctica 2 · La clínica guarda expedientes',
    fecha: null,
    fechaTexto: 'Sesión 10 de la Ruta AWS',
    resumen: 'Seguridad y cumplimiento: mínimo privilegio, llaves de cifrado, secretos, una base cifrada y quién hizo qué en CloudTrail.',
    lab: 'practica-2'
  },
  {
    ...PRACTICA,
    id: 'practica-3',
    sesion: 11,
    titulo: 'Práctica 3 · El festival vende boletos en hora pico',
    fecha: null,
    fechaTexto: 'Sesión 11 de la Ruta AWS',
    resumen: 'Sin servidores y desacoplado: un sitio en S3 con CloudFront, DynamoDB, una cola, una función Lambda y avisos por SNS.',
    lab: 'practica-3'
  },
  {
    ...PRACTICA,
    id: 'practica-4',
    sesion: 12,
    titulo: 'Práctica 4 · La cadena de cafeterías ordena sus cuentas',
    fecha: null,
    fechaTexto: 'Sesión 12 de la Ruta AWS',
    resumen: 'Gobierno y costos: cuentas con reglas, presupuestos, etiquetas, Trusted Advisor y una revisión Well-Architected.',
    lab: 'practica-4'
  },
  {
    ...PRACTICA,
    id: 'practica-5',
    sesion: 13,
    titulo: 'Práctica 5 · La universidad migra a la nube',
    fecha: null,
    fechaTexto: 'Sesión 13 de la Ruta AWS',
    resumen: 'El ensayo del examen final: integra red, cómputo que escala, base administrada, archivos compartidos, respaldos y alertas.',
    lab: 'practica-5'
  },

  // ------------------------------------------------------------ examen final

  {
    id: 'final',
    tipo: 'final',
    titulo: 'Examen final',
    fecha: null,
    fechaTexto: 'Al cierre del curso',
    resumen: 'Ocho casos de negocio con todo el temario del CLF-C02 y un caso práctico nuevo en el simulador.',
    teoria: 'final',
    lab: 'final',
    // El docente puede ajustar el peso de cada parte aquí.
    pesos: { teoria: 50, practica: 50 },
    // Solo la calificación al entregar: así nadie comparte las respuestas con
    // quien todavía no presenta. El docente la cambia a «completa» al final.
    retro: 'calificacion',
    autorrevision: false,
    reintentos: false,
    abierta: {},
    asistente: false,
    preguntasAsistente: 5
  }
];

const POR_ID = new Map(EVALUACIONES.map((e) => [e.id, e]));

/** La evaluación con ese id, o null. */
export const evaluacionDe = (id) => POR_ID.get(String(id ?? '')) ?? null;

/** El tipo de una evaluación ('evaluacion' si no dice o dice algo que no existe). */
export const tipoDe = (ev) => (Object.hasOwn(TIPOS, ev?.tipo ?? '') ? ev.tipo : 'evaluacion');

/** Lo que vale para el tipo de esa evaluación (topes de minutos y de tareas). */
export const reglasTipo = (ev) => TIPOS[tipoDe(ev)];

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
