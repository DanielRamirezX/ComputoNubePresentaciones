// ---------------------------------------------------------------------------
// EL REGISTRO DE EXTENSIONES DEL MODELO
//
// Los servicios que llegaron después de EC2, VPC, S3 e IAM (Auto Scaling, ELB,
// CloudWatch, RDS…) viven cada uno en su archivo de esta carpeta. Al cargarse,
// cada archivo se registra aquí con registrarExtension(). modelo.js recorre la
// lista al crear una cuenta, en cada avanzar() y antes de borrar una VPC, una
// subred o un grupo de seguridad.
//
// Las extensiones se llaman entre sí con llamar('nombre', …), nunca con un
// import directo de otra extensión: así no hay ciclos y una extensión que
// todavía no exista simplemente no responde (llamar devuelve undefined).
//
// Este archivo no importa nada: lo puede cargar cualquiera, sin ciclos.
// ---------------------------------------------------------------------------

/**
 * @typedef {object} Extension
 * @property {string} id                         'autoscaling', 'elb'…
 * @property {number} orden                      en qué orden corre avanzar (menor primero)
 * @property {(estado) => void} iniciar          crea sus colecciones con ??= (idempotente; también migra cuentas viejas)
 * @property {(estado, ahora:number) => boolean} [avanzar]   resuelve transiciones; true si cambió algo
 * @property {(estado, vpcId) => void} [dependenciasVpc]      lanza ErrorAws DependencyViolation si algo suyo usa la VPC
 * @property {(estado, subredId) => void} [dependenciasSubred]
 * @property {(estado, grupoId) => void} [dependenciasGrupo]
 * @property {Record<string, Function>} [funciones]          lo que ofrece a las demás vía llamar()
 */

export const EXTENSIONES = [];
const FUNCIONES = new Map();

export function registrarExtension(ext) {
  if (EXTENSIONES.some((e) => e.id === ext.id)) return;
  EXTENSIONES.push(ext);
  EXTENSIONES.sort((a, b) => (a.orden ?? 100) - (b.orden ?? 100));
  for (const [nombre, fn] of Object.entries(ext.funciones ?? {})) {
    if (FUNCIONES.has(nombre)) throw new Error(`La función «${nombre}» ya la ofrece otra extensión`);
    FUNCIONES.set(nombre, fn);
  }
}

/** Llama una función que ofrece otra extensión. Devuelve undefined si nadie la ofrece. */
export function llamar(nombre, ...args) {
  const fn = FUNCIONES.get(nombre);
  return fn ? fn(...args) : undefined;
}

export const existeFuncion = (nombre) => FUNCIONES.has(nombre);

/** Crea las colecciones de todas las extensiones (idempotente). */
export function iniciarExtensiones(estado) {
  for (const ext of EXTENSIONES) ext.iniciar?.(estado);
}

export function avanzarExtensiones(estado, ahora) {
  let cambio = false;
  for (const ext of EXTENSIONES) if (ext.avanzar?.(estado, ahora)) cambio = true;
  return cambio;
}

export function revisarDependencias(tipo, estado, id) {
  const gancho = { vpc: 'dependenciasVpc', subred: 'dependenciasSubred', grupo: 'dependenciasGrupo' }[tipo];
  for (const ext of EXTENSIONES) ext[gancho]?.(estado, id);
}
