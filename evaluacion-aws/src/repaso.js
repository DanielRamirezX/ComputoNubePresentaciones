// Dónde repasar cada tema: las lecciones y los laboratorios de las sesiones 1
// a 4 de la Ruta AWS (curso-aws-practitioner), con sus láminas o pasos en
// orden. Cada pregunta teórica (campo `repaso`) y cada punto de las rúbricas
// (`REPASO` de cada rúbrica) apunta aquí con una referencia «lección/número»,
// por ejemplo 's3-vpc/3'; la retroalimentación la muestra como enlace a la Ruta.
// `npm run verificar` comprueba que este catálogo siga igual que la Ruta.

/** Dónde vive la Ruta AWS, relativo a /m/evaluacion/. */
export const RUTA_URL = '../aws-practitioner/';

export const LECCIONES = {
  "s1-ruta": { sesion: 1, titulo: "Tu ruta hacia la certificación", partes: ["La meta: AWS Certified Cloud Practitioner","Los cuatro temas del examen","Tu sandbox: un AWS de verdad, con reloj"] },
  "s1-global": { sesion: 1, titulo: "La infraestructura global de AWS", partes: ["Regiones, zonas y ubicaciones de borde","¿Cómo se elige una región?"] },
  "s1-ec2": { sesion: 1, titulo: "Amazon EC2 en seis piezas", partes: ["Rentar una computadora tiene seis piezas","Cómo leer un tipo de instancia","La vida de una instancia"] },
  "s1-precios": { sesion: 1, titulo: "Cómo te cobra EC2", partes: ["Cinco formas de pagar una instancia"] },
  "s1-lab-ec2": { sesion: 1, titulo: "Laboratorio: tu primer servidor web en EC2", partes: ["Prepárate antes de encender","Enciende el sandbox de AWS en DataCamp","Ubícate: la región y el servicio EC2","Empieza a crear la instancia","Pieza 1: la AMI (el sistema operativo)","Pieza 2: el tipo de instancia","Pieza 3: el par de llaves","Pieza 4: la red y el grupo de seguridad","Piezas 5 y 6: el disco y los datos de usuario","Lanza la instancia","Visita tu página web","Mira por dentro: el registro de arranque","Detén la instancia (Stop)","Elimina la instancia (Terminate)","Apaga el sandbox y entrega tus evidencias"] },
  "s1-repaso": { sesion: 1, titulo: "Lo que el examen te va a preguntar", partes: ["La sesión 1 en una hoja"] },
  "s2-identidades": { sesion: 2, titulo: "Quién puede entrar a tu cuenta", partes: ["Las piezas de IAM","El usuario raíz: guárdalo bajo llave","Cómo se entra: contraseña, llaves y MFA"] },
  "s2-politicas": { sesion: 2, titulo: "Las políticas y quién gana", partes: ["Cómo se lee una política","Quién gana cuando las reglas chocan","Las SCP: el techo de una organización"] },
  "s2-responsabilidad": { sesion: 2, titulo: "Responsabilidad compartida y cumplimiento", partes: ["De la nube y en la nube","Cumplimiento: AWS Artifact"] },
  "s2-servicios": { sesion: 2, titulo: "Los servicios de seguridad", partes: ["Proteger: cifrado y secretos","Vigilar y detectar","Defender la red"] },
  "s2-lab-seguridad": { sesion: 2, titulo: "Laboratorio: seguridad en la consola", partes: ["Prepárate antes de encender","Enciende el sandbox de AWS en DataCamp","Visita IAM y lee el “Access denied”","¿Quién eres en esta cuenta?","Empieza a guardar un secreto","El tipo de secreto y sus datos","La llave de cifrado (KMS)","Nombre y permisos del secreto","Rotación, revisión y guardar","Tu secreto y los dos tipos de “no”","Intenta leer el secreto","CloudTrail: quién hizo qué","Crea un grupo de seguridad con mínimo privilegio","Las reglas de entrada","Revisa tu grupo y compáralo con una NACL","Limpia: borra el secreto y el grupo","Apaga el sandbox y entrega tus evidencias"] },
  "s2-repaso": { sesion: 2, titulo: "Lo que el examen te va a preguntar", partes: ["La sesión 2 en una hoja"] },
  "s3-vpc": { sesion: 3, titulo: "Tu propia red en la nube", partes: ["Una VPC es tu fraccionamiento privado","Cómo se mide una red: el CIDR","¿Qué hace pública a una subred?"] },
  "s3-conectar": { sesion: 3, titulo: "Conectar redes entre sí", partes: ["Del aula a la nube: cómo se conectan las redes","Llegar a servicios de AWS sin salir a internet"] },
  "s3-borde": { sesion: 3, titulo: "La red en el borde", partes: ["Route 53: la agenda de internet","CloudFront y Global Accelerator"] },
  "s3-lab-vpc": { sesion: 3, titulo: "Laboratorio: construye tu propia VPC", partes: ["Prepárate antes de encender","Enciende el sandbox y abre VPC","Lo que ya trae tu cuenta","Conoce la VPC por omisión","La ruta que la hace pública","Mira el plano de una red completa","Crea tu VPC","La subred “pública”","La subred privada y crea las dos","Intenta crear tu puerta a internet","¿Tus subredes son públicas?","Compara los mapas","Asómate al borde: CloudFront y Route 53","Limpia: borra tu VPC","Apaga el sandbox y entrega tus evidencias"] },
  "s3-repaso": { sesion: 3, titulo: "Lo que el examen te va a preguntar", partes: ["La sesión 3 en una hoja"] },
  "s4-s3": { sesion: 4, titulo: "Amazon S3: el almacén infinito", partes: ["Buckets y objetos","Las clases de almacenamiento","Reglas de ciclo de vida"] },
  "s4-seguridad": { sesion: 4, titulo: "Proteger los datos de S3", partes: ["Cuatro defensas de un bucket"] },
  "s4-discos": { sesion: 4, titulo: "Discos, carpetas compartidas y objetos", partes: ["Bloque, archivo u objeto","Los tipos de disco EBS y sus snapshots"] },
  "s4-mover": { sesion: 4, titulo: "Mover datos a AWS", partes: ["Cuando los datos no caben por el cable"] },
  "s4-lab-almacenamiento": { sesion: 4, titulo: "Laboratorio: un bucket seguro y un disco respaldado", partes: ["Prepárate antes de encender","Enciende el sandbox y abre S3","El nombre del bucket","Bloquea el acceso público","Versionado y cifrado","Intenta guardar algo","Empieza una regla de ciclo de vida","Manda los datos viejos a Glacier","Crea un disco EBS","Nómbralo y créalo","Respáldalo con un snapshot","Cómo se restaura, y un vistazo a EFS","Limpia: snapshot y volumen","Limpia: borra el bucket","Apaga el sandbox y entrega tus evidencias"] },
  "s4-repaso": { sesion: 4, titulo: "Lo que el examen te va a preguntar", partes: ["La sesión 4 en una hoja"] }
};

/**
 * 's3-vpc/3' → { ref, sesion, leccion, parte, ruta }. Sin número apunta a la
 * lección completa. Devuelve null si la referencia no existe.
 */
export function resolverRepaso(ref) {
  const [id, n] = String(ref ?? '').split('/');
  const l = LECCIONES[id];
  if (!l) return null;
  const i = n === undefined ? 0 : Number(n);
  if (!Number.isInteger(i) || i < 0 || i > l.partes.length) return null;
  return { ref: String(ref), sesion: l.sesion, leccion: l.titulo, parte: i ? l.partes[i - 1] : '', ruta: i ? `${id}/${i}` : id };
}

/** Una referencia o una lista de referencias → lista de repasos válidos (sin repetir). */
export function repasosDe(refs) {
  const lista = Array.isArray(refs) ? refs : refs ? [refs] : [];
  const vistos = new Set();
  return lista.map(resolverRepaso).filter((r) => r && !vistos.has(r.ruta) && vistos.add(r.ruta));
}

/**
 * Pone `repaso` a cada punto de un resultado de rúbrica. `mapa` es el REPASO
 * de la rúbrica: 'tarea/check' gana sobre 'tarea'. No cambia el resultado original.
 */
export function anotarRepaso(resultado, mapa = {}) {
  if (!resultado?.tareas) return resultado;
  return {
    ...resultado,
    tareas: resultado.tareas.map((t) => ({
      ...t,
      ...(t.checks ? { checks: t.checks.map((c) => ({ ...c, repaso: repasosDe(mapa[`${t.id}/${c.id}`] ?? mapa[t.id]) })) } : {})
    }))
  };
}
