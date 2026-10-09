# ¿Cómo llega un paquete a su domicilio?

Recurso didáctico animado para la **sesión 3 (redes)** de la Ruta AWS Cloud
Practitioner. Cuenta el viaje de un paquete desde el celular de Ana hasta el
servidor `10.0.1.25`, como quien pregunta cómo llegar a un domicilio, pero sin
nombres de calles: con direcciones IP, letreros y guardias.

Cero dependencias de npm y nada de internet: un SVG grande, CSS y JavaScript.
En la plataforma aparece en la sección **Recursos didácticos**
(`/m/viaje-paquete/`).

## Presentar en clase

Ábrelo desde la plataforma y pulsa `F` para pantalla completa.

| Tecla | Qué hace |
|---|---|
| `→`, espacio, `Enter` o un toque | Avanza al siguiente momento |
| `←` | Regresa |
| `R` | Repite la animación del momento |
| `N` | Muestra las notas para el docente |
| `F` | Pantalla completa |
| `Inicio` / `Fin` | Primer y último momento |

La barra de abajo salta a cualquier momento y la dirección (`#/7`) guarda dónde
vas, por si recargas. En un celular en vertical, el mapa queda arriba y el texto
abajo; se avanza deslizando o con los botones.

Dura entre 8 y 10 minutos si se narra. Cabe en el arranque del capítulo 1 de la
sesión 3, antes de la lección «Tu propia red en la nube».

## La analogía

| En el mapa | En AWS |
|---|---|
| Fraccionamiento con barda | VPC |
| Calle: un grupo de direcciones | Subred (`10.0.1.0/24`) |
| Número de la casa | IP privada |
| La agenda de internet | DNS · Route 53 |
| La puerta principal | Internet Gateway |
| El letrero de la esquina | Tabla de rutas |
| La caseta de la calle | NACL |
| El guardia de la casa | Grupo de seguridad |
| Puerta giratoria de solo salida | NAT Gateway |

La idea central es la misma de la sesión: **una calle es pública porque su
letrero manda `0.0.0.0/0` a la puerta, no por su nombre**. El penúltimo momento
del mapa la conecta con el paso 11 del laboratorio (la subred «publica-1a» que
resulta privada).

Las direcciones públicas del ejemplo (`203.0.113.10`) son de un rango reservado
para documentación.

## Cómo está hecho

| Archivo | Qué tiene |
|---|---|
| `mundo.js` | El dibujo completo (3200 × 1800), las rutas de los paquetes y los encuadres de cámara |
| `guion.js` | Los 27 momentos: cámara, texto, capas que se encienden y la animación de cada uno |
| `motor.js` | La cámara, el movimiento por las rutas, los globos y sellos, el teclado y las tarjetas |
| `estilos.css` | El rótulo, las tarjetas y las animaciones de ambiente |

Para cambiar un texto, edita `guion.js`. Para mover una casa o un letrero, edita
`mundo.js`; si cambias una calle, cambia también su ruta en `RUTAS`. Cada momento
deja el mundo en un estado final declarado (`paq`, `rastro` y capas), así que se
puede saltar a cualquiera sin haber visto los anteriores.
