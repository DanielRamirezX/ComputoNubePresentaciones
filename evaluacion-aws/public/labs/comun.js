// Los datos de cada alumno para el laboratorio: salen de su matrícula (o de su
// nombre, si no la dio), así que el mismo alumno siempre recibe los mismos y su
// vecino recibe otros. Copiar la configuración del compañero no sirve: su red,
// sus nombres y «la IP de su casa» son distintos.
//
// Puro (sin window ni document): el servidor lo importa para calificar.

const normal = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** FNV-1a de 32 bits: estable entre navegador y servidor. */
function hash(texto) {
  let h = 2166136261;
  for (const c of texto) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0;
  return h >>> 0;
}

/**
 * `octeto`    → la red del alumno es 10.<octeto>.0.0/16 (entre 20 y 219).
 * `sufijo`    → para nombres que deben ser únicos en el mundo (buckets).
 * `ipCasa`    → la IP pública «de tu casa»: la que la consola pone al elegir
 *               «My IP» y desde la que el navegador simulado abre las páginas.
 * `cuentaId`  → el número de cuenta de AWS que muestra la consola.
 */
export function datosAlumno({ nombre, matricula } = {}) {
  const base = normal(matricula) || normal(nombre) || 'alumno';
  const h = hash(base);
  const h2 = hash(`${base}:cuenta`);
  const h3 = hash(`${base}:ip`);

  const octeto = 20 + (h % 200);
  const limpia = normal(matricula).replace(/[^a-z0-9]/g, '');
  const sufijo = (limpia || h.toString(36)).slice(-10);
  const ipCasa = `187.${190 + (h3 % 10)}.${2 + ((h3 >>> 8) % 250)}.${2 + ((h3 >>> 16) % 250)}`;
  const cuentaId = String(100000000000 + ((h2 * 9973) % 899999999999)).slice(0, 12);

  return {
    nombre: String(nombre ?? '').trim(),
    matricula: String(matricula ?? '').trim(),
    octeto,
    vpcCidr: `10.${octeto}.0.0/16`,
    sufijo,
    ipCasa,
    cuentaId
  };
}
