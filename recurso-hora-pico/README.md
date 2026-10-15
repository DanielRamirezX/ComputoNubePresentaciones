# La taquería en hora pico

Recurso didáctico animado para la **sesión 6 (escalar y automatizar)** de la Ruta
AWS Cloud Practitioner. Cuenta cómo una taquería atiende la hora pico sin
quebrar: planchas que se abren solas, un gerente que lleva la cuenta, un
anfitrión en la puerta, una pizarra con su campanita y un ayudante que solo
llega con el timbre. Seguimos a Chuy, un cliente con hambre.

Cero dependencias de npm y nada de internet: un SVG grande, CSS y JavaScript.
En la plataforma aparece en la sección **Recursos didácticos**
(`/m/hora-pico/`). Es hermano de `recurso-viaje-paquete/` y
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

Son 28 momentos: entre 10 y 12 minutos si se narra. Cabe al arranque del
capítulo 1 de la sesión 6, antes de la lección de elasticidad.

## La analogía

| En la taquería | En AWS |
|---|---|
| Cada cliente que llega | Una petición |
| Un taquero en su plancha | Una instancia EC2 |
| Un taquero más grande | Escalar verticalmente |
| Más planchas con taqueros iguales | Escalar horizontalmente |
| La receta de la casa | Plantilla de lanzamiento (con user data) |
| El gerente: mínimo 1, deseado 2, máximo 3 | Grupo de EC2 Auto Scaling |
| Un taquero en cada local | Zonas de disponibilidad |
| El gerente cambia al taquero enfermo | Revisión de salud y reemplazo |
| La pizarra de la cocina | Métricas de Amazon CloudWatch |
| La campanita del 70 % | Alarma y política de escalado |
| La bitácora de la oficina | AWS CloudTrail |
| El anfitrión de la puerta | Elastic Load Balancing (ALB, NLB, GWLB) |
| El riel de las comandas | Amazon SQS |
| El megáfono del gerente | Amazon SNS |
| El ayudante que llega con el timbre | AWS Lambda |
| El reloj de pared | Amazon EventBridge |

La idea central de la sesión es la **elasticidad**: crecer cuando llega la
gente, encogerse cuando se va y pagar solo lo que se usa. Varios momentos se
conectan con el laboratorio: la receta y el gerente (pasos de la plantilla y del
grupo), el reemplazo del taquero enfermo (lo que se ve en *Activity*) y la
campanita que el sandbox no deja colgar (el aviso rojo *Failed to create 1
Scaling policy*, porque niega `cloudwatch:PutMetricAlarm`).

Lo que solo vive en las notas del docente (tecla `N`): métricas de EC2 cada 5
minutos, la duración máxima de Lambda, la capa gratuita de Lambda, Fargate, ECS
y EKS, y la diferencia entre CloudWatch y CloudTrail.

## Cómo está hecho

| Archivo | Qué tiene |
|---|---|
| `mundo.js` | El dibujo completo (3200 × 1800): la calle y la fila, la taquería de dos pisos, la oficina y la ventanilla del ayudante; las rutas, las figuras sueltas (`PIEZAS`) y los encuadres de cámara |
| `guion.js` | Los 28 momentos: cámara, texto, capas que se encienden y la animación de cada uno |
| `motor.js` | La cámara, el movimiento por las rutas, los globos y sellos, el teclado y las tarjetas |
| `estilos.css` | El rótulo, las tarjetas y las animaciones de ambiente |

Para cambiar un texto, edita `guion.js`. Para mover algo del mapa, edita
`mundo.js`; si mueves una plancha o la oficina, cambia también sus rutas en
`RUTAS` y los globos del guion que apuntan ahí. La oficina se dibuja 100 px más
abajo de sus coordenadas (`translate(0 100)`): los globos del guion ya usan la
posición final.

Cada momento deja el mundo en un estado final declarado (`chuy` y capas), así
que se puede saltar a cualquiera sin haber visto los anteriores.

Una capa (`class="capa capa-nombre"`) aparece cuando un momento la enciende con
`mas`. El mismo nombre sirve de bandera de estado: `on-pico` pone a sudar al
taquero 1, `on-grande` lo agranda, `on-enfermo1` y `on-enfermo2` enferman a un
taquero, `on-sinluz` apaga el local a, `on-d3` cambia el deseado a 3, `on-alto`
sube la gráfica y el termómetro, `on-suena` hace sonar la campanita,
`on-negada` la tacha y `on-ayudante` asoma al ayudante en su ventanilla.
