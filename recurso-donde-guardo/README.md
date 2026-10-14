# ¿Dónde guardo cada cosa?

Recurso didáctico animado para la **sesión 4 (almacenamiento)** de la Ruta AWS
Cloud Practitioner. Cuenta el viaje de Foti, una foto de las vacaciones de Ana,
por los lugares donde se guarda algo en AWS: sin siglas al principio, con una
bodega, sótanos fríos, un cajón y un estante.

Cero dependencias de npm y nada de internet: un SVG grande, CSS y JavaScript.
En la plataforma aparece en la sección **Recursos didácticos**
(`/m/donde-guardo/`). Es hermano de `recurso-viaje-paquete/` y usa el mismo
motor.

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

Son 29 momentos: entre 9 y 11 minutos si se narra. Cabe en el arranque del
capítulo 1 de la sesión 4, antes de la lección «Amazon S3: el almacén infinito».

## La analogía

| En el mapa | En AWS |
|---|---|
| La bodega que nunca se llena | Amazon S3 |
| Tu cubeta, con nombre único en el mundo | Bucket |
| La cosa y su etiqueta | Objeto y llave (key) |
| Tres copias en tres edificios | Durabilidad de 11 nueves |
| La cortina cerrada | Block Public Access |
| La copia anterior | Versionado |
| El candado de cada caja | Cifrado (SSE-S3) |
| El mostrador, la trastienda, el cuarto frío y el congelador | S3 Standard, Standard-IA, Glacier Flexible Retrieval y Glacier Deep Archive |
| La regla del calendario | Regla de ciclo de vida |
| El bodeguero automático | S3 Intelligent-Tiering |
| El cajón del servidor | Amazon EBS |
| El pizarrón que se borra | Instance store |
| El retrato del cajón | Snapshot de EBS |
| El estante de todos | Amazon EFS |
| El camión de la mudanza | AWS Snowball Edge |

La idea central es la misma de la sesión: **no hay un solo lugar para guardar;
se elige según quién lo usa y qué tan seguido**. Mientras más abajo en los
sótanos, más barato guardar y más lento (o más caro) sacar. El penúltimo momento
del mapa la conecta con el paso 6 del laboratorio (la cubeta que se crea pero
no deja guardar, porque el sandbox niega `s3:PutObject`).

Lo que solo vive en las notas del docente (tecla `N`): One Zone-IA, Glacier
Instant Retrieval, SSE-KMS, FSx, DataSync, Storage Gateway y AWS Backup.

## Cómo está hecho

| Archivo | Qué tiene |
|---|---|
| `mundo.js` | El dibujo completo (3200 × 1800), las rutas por las que viajan Foti y compañía, las figuras sueltas (`PIEZAS`) y los encuadres de cámara |
| `guion.js` | Los 29 momentos: cámara, texto, capas que se encienden y la animación de cada uno |
| `motor.js` | La cámara, el movimiento por las rutas, los globos y sellos, el teclado y las tarjetas |
| `estilos.css` | El rótulo, las tarjetas y las animaciones de ambiente |

Para cambiar un texto, edita `guion.js`. Para mover algo del mapa, edita
`mundo.js`; si mueves un piso o una casa, cambia también su ruta en `RUTAS`.
Cada momento deja el mundo en un estado final declarado (`paq` y capas), así
que se puede saltar a cualquiera sin haber visto los anteriores.

Una capa (`class="capa capa-nombre"`) aparece cuando un momento la enciende con
`mas`. El mismo nombre sirve de bandera de estado: `on-congelada` mete a Foti en
su cubo de hielo, `on-apagada` apaga el servidor, `on-tu-cubeta` cambia el
nombre de la cubeta por el del laboratorio.

La fecha del nombre de la cubeta (`fotos-ana-20261013`) está en `mundo.js`.
