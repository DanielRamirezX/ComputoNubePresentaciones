// Calificar una cuenta de la consola simulada con la rúbrica de su laboratorio.
// Lo usan el servidor (autorrevisión, entrega, avance en vivo del panel) y
// `npm run verificar`, para que los dos califiquen exactamente igual.

import { avanzar } from '../public/consola/modelo.js';
import { datosAlumno } from '../public/labs/comun.js';
import { anotarRepaso } from './repaso.js';
import { RUBRICAS } from './rubricas/index.js';

// Lo que el alumno ya dejó en camino cuenta como terminado: si lanzó la
// instancia y entregó cuando aún decía «pending», en AWS estaría «running» unos
// segundos después. Se avanza el reloj de la cuenta un minuto antes de calificar.
const MARGEN_MS = 60 * 1000;

const numero = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : 0);
const texto = (v) => String(v ?? '');

/** La salida de `revisar` con la forma del contrato, pase lo que pase. */
function normalizar(r) {
  const tareas = (Array.isArray(r?.tareas) ? r.tareas : []).map((t) => ({
    id: texto(t.id),
    titulo: texto(t.titulo),
    puntos: numero(t.puntos),
    obtenidos: numero(t.obtenidos),
    ...(t.bono === true ? { bono: true } : {}), // tarea opcional: suma encima, sin pasar de 100
    checks: (Array.isArray(t.checks) ? t.checks : []).map((c) => ({
      id: texto(c.id),
      texto: texto(c.texto),
      puntos: numero(c.puntos),
      ok: c.ok === true,
      retro: texto(c.retro)
    }))
  }));
  return {
    obtenidos: numero(r?.obtenidos ?? Math.min(100, tareas.reduce((s, t) => s + t.obtenidos, 0))),
    total: numero(r?.total ?? tareas.filter((t) => !t.bono).reduce((s, t) => s + t.puntos, 0)) || 100,
    tareas
  };
}

export const hayRubrica = (labId) => RUBRICAS.has(labId);

/** Le pone a cada punto de la rúbrica dónde repasarlo (también a entregas viejas). */
export const conRepaso = (labId, resultado) => anotarRepaso(resultado, RUBRICAS.get(labId)?.repaso);

/** Los datos del laboratorio de un alumno (rangos, sufijo, su IP…). */
export const datosDe = (identidad) => datosAlumno({ nombre: identidad?.nombre ?? '', matricula: identidad?.matricula ?? '' });

/**
 * Avanza una COPIA de la cuenta hasta ahora y la califica.
 * Devuelve { cuenta, resultado }: la cuenta avanzada (la que se guarda al
 * entregar) y el desglose de la rúbrica.
 */
export function calificarCuenta(labId, estado, identidad, ahora = Date.now()) {
  const rubrica = RUBRICAS.get(labId);
  if (!rubrica) throw new Error(`no hay rúbrica para el laboratorio ${labId}`);
  const cuenta = structuredClone(estado);
  avanzar(cuenta, ahora + MARGEN_MS);
  const datos = datosDe(identidad);
  return { cuenta, datos, resultado: conRepaso(labId, normalizar(rubrica.revisar(cuenta, datos))) };
}

/** Una cuenta resuelta (para verificar que la rúbrica da 100). */
export const solucionDe = (labId, datos) => RUBRICAS.get(labId).solucion(datos);
