# ¿Cuánto cuesta la nube?

Recurso didáctico animado para la **sesión 7 (costos, soporte y buenas
prácticas)** de la Ruta AWS Cloud Practitioner. Cuenta el viaje de Moni, una
moneda de la tienda en línea de Lupe, por todo lo que cuesta (y lo que vigila)
la nube: sin siglas al principio, con un cotizador, una avenida de formas de
pagar el viaje, un banco, una cartera familiar, un mecánico y una casa con seis
pilares.

Cero dependencias de npm y nada de internet: un SVG grande, CSS y JavaScript.
En la plataforma aparece en la sección **Recursos didácticos**
(`/m/cuanto-cuesta/`). Es hermano de `recurso-viaje-paquete/` y
`recurso-donde-guardo/` y usa el mismo motor.

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

Son 27 momentos: entre 9 y 11 minutos si se narra. Cabe en el arranque del
capítulo 1 de la sesión 7, antes de la lección «Cómo cobra AWS».

## La analogía

| En el mapa | En AWS |
|---|---|
| Cotizar antes de salir | AWS Pricing Calculator |
| El taxi: pagas cada viaje | On-Demand |
| El abono para cualquier ruta, 1 o 3 años | Compute Savings Plans (hasta 66 %) |
| El mismo auto todo el año | EC2 Instance Savings Plans e instancias reservadas (hasta 72 %) |
| El último asiento libre, que te pueden quitar | Instancias Spot |
| El auto solo tuyo | Dedicated Hosts |
| El estado de cuenta | AWS Cost Explorer |
| Cada gasto con su etiqueta | Etiquetas de asignación de costos |
| La tarjeta que avisa al 85 % y al 100 % | AWS Budgets |
| El perro guardián | Cost Anomaly Detection |
| La cartera de la familia y una sola factura | AWS Organizations · facturación consolidada |
| Las reglas del titular para todas las tarjetas | Políticas de control de servicios (SCP) |
| El mecánico y sus seis luces | AWS Trusted Advisor |
| Los planes de asistencia y el asesor personal | Planes de soporte · TAM |
| El tablero de avisos de tránsito | AWS Health Dashboard |
| La casa de seis pilares | AWS Well-Architected |

La idea central es la de la sesión: **antes se cotiza, durante se vigila y
después se analiza**. Los números son los del laboratorio: dos t2.micro cuestan
16.94 USD al mes bajo demanda (203.28 al año) y 8.47 con un Compute Savings Plan
a 3 años; el sandbox muestra 1.49 USD en seis meses en 17 servicios. El
penúltimo momento del mapa lo conecta con lo que pasa en el sandbox: se puede
ver la facturación, pero crear un presupuesto da `budgets:ModifyBudget`.

Los planes de soporte están como los muestra hoy la consola (Basic, Business
Support+, Enterprise y Unified Operations); la nota del docente avisa que el
examen puede usar los nombres anteriores.

## Cómo está hecho

| Archivo | Qué tiene |
|---|---|
| `mundo.js` | El dibujo completo (3200 × 1800), las rutas por las que viaja Moni, las figuras sueltas (`PIEZAS`) y los encuadres de cámara |
| `guion.js` | Los 27 momentos: cámara, texto, capas, textos de las pantallas y la animación de cada uno |
| `motor.js` | La cámara, el movimiento por las rutas, los globos, sellos y monedas, el teclado y las tarjetas |
| `estilos.css` | El rótulo, las tarjetas y las animaciones de ambiente |

Para cambiar un texto, edita `guion.js`. Para mover algo del mapa, edita
`mundo.js`; si mueves una parada, cambia también su ruta en `RUTAS`.
Cada momento deja el mundo en un estado final declarado (`paq`, capas y
`textos`), así que se puede saltar a cualquiera sin haber visto los anteriores.

Una capa (`class="capa capa-nombre"`) aparece cuando un momento la enciende con
`mas`. El mismo nombre sirve de bandera de estado: `on-grafica` hace crecer las
barras del estado de cuenta, `on-b85` y `on-b100` llenan el medidor de la
tarjeta, `on-ta-basico` y `on-ta-todo` prenden las luces del mecánico y
`on-garage-abierto` abre el garage.

Lo que este motor agrega a los anteriores:

- `textos` en el guion: el número del cotizador, el del taxímetro y el tablero de
  avisos quedan como diga cada momento, también al saltar.
- `m.contador(id, hasta, ms)`: un número que sube o baja poco a poco.
- `m.monedas(x0, y0, x1, y1, cuantas)`: monedas que vuelan en arco.
- `m.texto(id, valor)`: cambia un texto del mundo durante la animación.
