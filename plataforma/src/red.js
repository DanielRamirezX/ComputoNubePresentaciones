import os from 'node:os';

// Las redes de salón casi siempre son privadas. Si hay varias tarjetas
// (Wi-Fi, Ethernet, WSL, VirtualBox...), estas van primero.
const PREFERIDAS = [/^192\.168\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./];

// Adaptadores virtuales que nunca sirven para que un alumno te alcance.
const VIRTUALES = /(vEthernet|VirtualBox|VMware|Hyper-V|Loopback|Docker|WSL|Tailscale|ZeroTier)/i;

function prioridad(dir, nombre) {
  if (VIRTUALES.test(nombre)) return 99;
  const i = PREFERIDAS.findIndex((re) => re.test(dir));
  return i === -1 ? 50 : i;
}

/**
 * Direcciones IPv4 por las que un teléfono del salón puede alcanzar este
 * servidor, de la más probable a la menos.
 */
export function direccionesLan(puerto) {
  const encontradas = [];

  for (const [nombre, tarjetas] of Object.entries(os.networkInterfaces())) {
    for (const t of tarjetas ?? []) {
      if (t.family !== 'IPv4' && t.family !== 4) continue;
      if (t.internal) continue;
      encontradas.push({
        nombre,
        direccion: t.address,
        url: `http://${t.address}:${puerto}`,
        prioridad: prioridad(t.address, nombre)
      });
    }
  }

  encontradas.sort((a, b) => a.prioridad - b.prioridad || a.direccion.localeCompare(b.direccion));
  return encontradas;
}

/**
 * Si la plataforma está desplegada, su dirección pública. En Render llega sola
 * por RENDER_EXTERNAL_URL; en otro proveedor, define URL_PUBLICA a mano.
 *
 * Sin esto, en la nube el QR apuntaría a la IP interna del contenedor
 * (algo como 10.28.134.228), que no alcanza nadie.
 */
export function urlPublica() {
  const dada = process.env.URL_PUBLICA || process.env.RENDER_EXTERNAL_URL || '';
  return dada.trim().replace(/\/+$/, '') || null;
}

/**
 * La dirección que va en el QR: la pública si está desplegada, si no la de la
 * red local. Si no hay ninguna (laptop sin Wi-Fi), localhost para que al menos
 * tú puedas trabajar.
 */
export function direccionPrincipal(puerto) {
  const publica = urlPublica();
  if (publica) return publica;
  const [primera] = direccionesLan(puerto);
  return primera?.url ?? `http://localhost:${puerto}`;
}
