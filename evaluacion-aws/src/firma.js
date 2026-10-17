// Comprobantes firmados: la red de seguridad contra el disco que se borra.
//
// El problema: en el plan gratis de Render el disco es efímero. Cada
// despliegue o reinicio (y el servicio se duerme cuando nadie lo usa) deja
// data/ vacío. Si eso pasa entre la entrega de un alumno y el momento en que
// el docente descarga el CSV, la entrega se pierde y el alumno tendría que
// repetir un examen que ya hizo.
//
// La solución: cada entrega regresa al navegador del alumno con un
// «comprobante» = los datos esenciales de la entrega (quién, qué contestó,
// cuántos puntos sacó, folio, horas) + una firma HMAC-SHA256. El navegador lo
// guarda en localStorage. Cuando el servidor dice que no tiene esa entrega
// (api/estado, o la respuesta de api/teoria o api/practica), el navegador le
// regresa el comprobante a api/restaurar; si la firma es válida, el servidor
// vuelve a registrar la entrega tal cual estaba.
//
// ¿Por qué no se puede inventar uno? La firma se calcula con una clave que
// solo conoce el servidor (derivada de CLAVE_DOCENTE). Si el alumno cambia una
// sola cifra del comprobante, la firma ya no coincide y se rechaza. Ojo: si el
// servidor corre con la clave por defecto («cambiame»), cualquiera que lea
// este código podría firmar: define CLAVE_DOCENTE en Render.
//
// ¿Y si el docente borró la entrega a propósito para que el alumno repita? Cada
// archivo de datos nace con una «generación» al azar, y el comprobante la
// lleva. Si el servidor tiene la misma generación que el comprobante, nunca
// perdió el disco: la entrega falta porque el docente la borró, y el navegador
// tira el comprobante. Solo se restaura cuando la generación es otra (el disco
// se borró después de entregar).

import { createHmac, timingSafeEqual } from 'node:crypto';

const VERSION = 1;

/** JSON con las llaves ordenadas: la misma entrega siempre da el mismo texto. */
function canonico(valor) {
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(',')}]`;
  if (valor && typeof valor === 'object') {
    return `{${Object.keys(valor)
      .filter((k) => valor[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonico(valor[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(valor ?? null);
}

/**
 * Prepara el firmador con la clave del docente. La clave de firma se deriva de
 * ella con un propósito fijo, para no usar la contraseña del panel tal cual.
 */
export function crearFirmador(claveDocente) {
  const clave = createHmac('sha256', String(claveDocente)).update('evaluacion-aws:comprobantes').digest();
  const firmaDe = (datos) => createHmac('sha256', clave).update(`v${VERSION}.${canonico(datos)}`).digest('base64url');

  return {
    /** { v, datos, firma } listo para mandarse al navegador. */
    firmar(datos) {
      return { v: VERSION, datos, firma: firmaDe(datos) };
    },

    /** Los datos del comprobante si la firma es buena; si no, null. */
    abrir(comprobante) {
      if (!comprobante || typeof comprobante !== 'object' || comprobante.v !== VERSION) return null;
      const { datos, firma } = comprobante;
      if (!datos || typeof datos !== 'object' || typeof firma !== 'string') return null;
      const esperada = Buffer.from(firmaDe(datos));
      const recibida = Buffer.from(firma);
      if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
      return datos;
    }
  };
}
