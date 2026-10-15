# ¿Dónde se apunta cada dato?

Recurso didáctico animado para la **sesión 5 (bases de datos)** de la Ruta AWS
Cloud Practitioner. Cuenta el viaje de Tiki, la nota de una venta de la
papelería de don Beto, por las formas de anotar que hay en AWS: sin siglas al
principio, con una libreta, un archivo con encargado, un guardarropa de fichas
y una libretita de lo más pedido.

Cero dependencias de npm y nada de internet: un SVG grande, CSS y JavaScript.
En la plataforma aparece en la sección **Recursos didácticos**
(`/m/donde-apunto/`). Es hermano de `recurso-donde-guardo/` y usa el mismo
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

Son 28 momentos: entre 9 y 11 minutos si se narra. Cabe en el arranque del
capítulo 1 de la sesión 5, antes de la lección «Bases relacionales: RDS y
Aurora».

## La analogía

| En el mapa | En AWS |
|---|---|
| La libreta con columnas | Base de datos relacional (SQL) |
| La libreta que cuida don Beto | Una base instalada a mano en EC2 |
| El archivo con encargado | Amazon RDS |
| El archivo de lujo de tres edificios | Amazon Aurora |
| El archivero dormilón | Aurora Serverless |
| La copia en espera en otra sucursal | Multi-AZ |
| Las fotocopias para los que solo leen | Réplicas de lectura |
| El álbum de cada día | Respaldos automáticos |
| El guardarropa de fichas | Amazon DynamoDB |
| Buscar por ficha o bolsa por bolsa | Query y Scan |
| La libretita de lo más pedido | Amazon ElastiCache (y DAX en el guardarropa) |
| El contador y el tablero de corcho | Amazon Redshift y Amazon Neptune |
| La mudanza sin cerrar la tienda | AWS DMS y la conversión de esquema |
| El candado de la organización | SCP con *explicit deny* |

La idea central es la misma de la sesión: **no hay una sola base de datos para
todo; se elige según cómo es lo que se guarda y cómo se va a buscar**. Un
momento insiste en la confusión más común del examen: las copias (Multi-AZ y
réplicas) también copian los errores; contra un borrado sirven los respaldos.
Los últimos tres momentos del mapa adelantan el laboratorio: el candado de RDS,
la tabla de MariaDB en el *System log* (Ana 95, Mariana 92, Luis 88) y la tabla
de DynamoDB con ana y luis.

Lo que solo vive en las notas del docente (tecla `N`): los motores de RDS, las
ACU de Aurora Serverless, capacidad provisionada y tablas globales de DynamoDB,
DocumentDB, Keyspaces y Athena.

## Cómo está hecho

| Archivo | Qué tiene |
|---|---|
| `mundo.js` | El dibujo completo (3200 × 1800), las rutas por las que viajan Tiki y compañía, las figuras sueltas (`PIEZAS`: una hoja y el carrito de la mudanza) y los encuadres de cámara |
| `guion.js` | Los 28 momentos: cámara, texto, capas que se encienden y la animación de cada uno |
| `motor.js` | La cámara, el movimiento por las rutas, los globos y sellos, el teclado y las tarjetas |
| `estilos.css` | El rótulo, las tarjetas y las animaciones de ambiente |

Para cambiar un texto, edita `guion.js`. Para mover algo del mapa, edita
`mundo.js`; si mueves un edificio, cambia también su ruta en `RUTAS`. Cada
momento deja el mundo en un estado final declarado (`paq` y capas), así que se
puede saltar a cualquiera sin haber visto los anteriores.

Una capa (`class="capa capa-nombre"`) aparece cuando un momento la enciende con
`mas`. El mismo nombre sirve de bandera de estado: `on-apagada` deja sin luz al
archivo, `on-error` y `on-error2` ponen el tache en el archivo y en las copias,
`on-despierto` despierta al dormilón y `on-analiza` hace crecer las barras del
contador.
