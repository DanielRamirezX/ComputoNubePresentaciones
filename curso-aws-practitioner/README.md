# Ruta AWS Cloud Practitioner

Una ruta de 8 sesiones para que el grupo termine la materia listo para la
certificación **AWS Certified Cloud Practitioner (CLF-C02)**, aprovechando el
sandbox de AWS de DataCamp. Cada sesión combina lecciones cortas, ejercicios con
XP, un **laboratorio guiado paso a paso en la consola de AWS** y un examen de
práctica al estilo de la certificación.

Es el mismo motor, diseño e interacción del curso *Comprender la computación en
la nube* (`../curso-comprender-nube`), con piezas nuevas:

- **Laboratorios.** Cada paso dice exactamente dónde hacer clic (con los botones
  de la consola en inglés, como los ve el alumno), trae un recuadro de “Deberías
  ver” y un “¿Algo salió mal?” con las fallas comunes. El alumno marca “Ya lo
  hice” y el docente ve en vivo en qué paso va cada quien.
- **Contador del sandbox.** Arranca solo al llegar al primer paso que necesita el
  sandbox y se detiene al terminar el laboratorio. Lleva los minutos de la semana
  y los traduce a tokens (10 000 tokens ≈ 330 minutos, la cuenta del docente).
  Es una estimación local: la cifra real está en el panel del sandbox de
  DataCamp.
- **Capturas reales de la consola** en cada paso, con círculos numerados sobre
  lo que hay que tocar; se amplían al tocarlas. Las tomó el docente (con
  Claude) en su propio sandbox, con el número de cuenta tapado.
- **Evidencias.** Algunos pasos piden una captura; al final el alumno descarga
  un PDF con todas para subirlo a Blackboard.
- **Varias sesiones.** El alumno cambia de sesión desde arriba del índice; el
  panel docente tiene un selector de sesión y cada sesión tiene su propio
  examen de práctica (abrir, cerrar, entregas, CSV y reporte PDF).

Dentro de la plataforma vive en `/m/aws-practitioner/`; el panel del docente, en
`/m/aws-practitioner/docente` (misma `CLAVE_DOCENTE` que los demás paneles).

## Estado de la ruta

| Sesión | Tema | Sandbox | Estado |
|---|---|---|---|
| 1 | Tu primera máquina en AWS: infraestructura global, EC2 y sus precios | ≈ 45 min | **Lista** |
| 2 | Identidad y seguridad: IAM, políticas y SCP, responsabilidad compartida, servicios de seguridad | ≈ 30 min | **Lista** |
| 3 | Redes: VPC, subredes, tablas de rutas y gateways, VPN y Direct Connect, Route 53, CloudFront | ≈ 25 min | **Lista** |
| 4 | Almacenamiento: S3 y sus clases, ciclo de vida, EBS y snapshots, EFS, Snowball y Storage Gateway | ≈ 25 min | **Lista** |
| 5 | Bases de datos: RDS y Aurora, Multi-AZ y réplicas, DynamoDB, ElastiCache, Redshift, migración | ≈ 25 min | **Lista** |
| 6 | Escalar y automatizar: ELB, Auto Scaling, CloudWatch, Lambda, SNS y SQS | ≈ 35 min | **Lista** |
| 7 | Costos, soporte y buenas prácticas: calculadora, Budgets, Organizations, Well-Architected | ≈ 15 min | **Lista** |
| 8 | Simulacro completo de 65 preguntas | — | Pendiente |

Con 330 minutos de sandbox a la semana, cada sesión deja tiempo de sobra para
repetir el laboratorio en casa.

## Sesión 1: Tu primera máquina en AWS (2 horas)

| Minutos | Bloque | Sandbox |
|---|---|---|
| 0:00 – 0:05 | Arranque y registro | Apagado |
| 0:05 – 0:37 | Capítulo 1: el examen, el sandbox, regiones y zonas, las seis piezas de EC2, precios | Apagado |
| 0:37 – 1:32 | Capítulo 2: laboratorio de 15 pasos; servidor web en EC2, registro de arranque, Stop y Terminate | **Encendido ≈ 45 min** |
| 1:32 – 1:40 | Capítulo 3: hoja de repaso y verdadero o falso | Apagado |
| 1:40 – 1:57 | Examen de práctica: 20 preguntas estilo CLF-C02, con reporte PDF | Apagado |
| 1:57 – 2:00 | Cierre | — |

## Sesión 2: Identidad y seguridad (2 horas)

| Minutos | Bloque | Sandbox |
|---|---|---|
| 0:00 – 0:04 | Arranque | Apagado |
| 0:04 – 0:39 | Capítulo 1: IAM (raíz, usuarios, grupos, roles), políticas y SCP, responsabilidad compartida y Artifact, servicios de seguridad | Apagado |
| 0:39 – 1:30 | Capítulo 2: laboratorio de 17 pasos; leer los “Access denied”, guardar un secreto cifrado con KMS, grupo de seguridad con mínimo privilegio, NACL y limpieza | **Encendido ≈ 30 min** |
| 1:30 – 1:38 | Capítulo 3: hoja de repaso y verdadero o falso | Apagado |
| 1:38 – 1:58 | Examen acumulativo: 25 preguntas (15 de seguridad y 10 de repaso de fundamentos de la nube y de la sesión 1), con reporte PDF | Apagado |
| 1:58 – 2:00 | Cierre | — |

El examen de esta sesión es acumulativo. En el panel, los temas «Repaso: fundamentos de la nube» y «Repaso: EC2 e infraestructura» muestran qué se olvidó de las clases anteriores.

## Sesión 3: Redes en AWS (2 horas)

| Minutos | Bloque | Sandbox |
|---|---|---|
| 0:00 – 0:05 | Arranque | Apagado |
| 0:05 – 0:38 | Capítulo 1: VPC y CIDR, subredes públicas y privadas, conectar redes (peering, Transit Gateway, VPN, Direct Connect, endpoints), Route 53, CloudFront y Global Accelerator | Apagado |
| 0:38 – 1:32 | Capítulo 2: laboratorio de 15 pasos; leer la VPC por omisión y su ruta al Internet Gateway, crear una VPC con dos subredes, comprobar que sin esa ruta son privadas y borrarla | **Encendido ≈ 25 min** |
| 1:32 – 1:40 | Capítulo 3: hoja de repaso y verdadero o falso | Apagado |
| 1:40 – 1:57 | Examen de práctica: 20 preguntas de redes, con reporte PDF | Apagado |
| 1:57 – 2:00 | Cierre | — |

## Sesión 4: Almacenamiento (2 horas)

| Minutos | Bloque | Sandbox |
|---|---|---|
| 0:00 – 0:05 | Arranque | Apagado |
| 0:05 – 0:38 | Capítulo 1: S3 y sus clases, ciclo de vida, seguridad de los datos, EBS, instance store, EFS y FSx, snapshots y AWS Backup, Snowball, DataSync y Storage Gateway | Apagado |
| 0:38 – 1:32 | Capítulo 2: laboratorio de 15 pasos; bucket con acceso público bloqueado, versionado y cifrado, el PutObject negado, regla de ciclo de vida hacia Glacier, volumen EBS y snapshot, y limpieza | **Encendido ≈ 25 min** |
| 1:32 – 1:40 | Capítulo 3: hoja de repaso y verdadero o falso | Apagado |
| 1:40 – 1:57 | Examen de práctica: 20 preguntas de almacenamiento, con reporte PDF | Apagado |
| 1:57 – 2:00 | Cierre | — |

## Sesión 5: Bases de datos (2 horas)

| Minutos | Bloque | Sandbox |
|---|---|---|
| 0:00 – 0:05 | Arranque | Apagado |
| 0:05 – 0:38 | Capítulo 1: RDS y Aurora, quién administra qué, Multi-AZ, réplicas y respaldos, DynamoDB, bases de propósito específico y migración (DMS) | Apagado |
| 0:38 – 1:32 | Capítulo 2: laboratorio de 15 pasos; una base MariaDB instalada a mano en EC2 (se lee en el System log), el intento de crear Aurora y su *explicit deny*, una tabla de DynamoDB con elementos de forma distinta y una consulta por llave, y limpieza | **Encendido ≈ 25 min** |
| 1:32 – 1:40 | Capítulo 3: hoja de repaso y verdadero o falso | Apagado |
| 1:40 – 1:57 | Examen de práctica: 20 preguntas de bases de datos, con reporte PDF | Apagado |
| 1:57 – 2:00 | Cierre | — |

## Sesión 6: Escalar y automatizar (2 horas)

| Minutos | Bloque | Sandbox |
|---|---|---|
| 0:00 – 0:04 | Arranque | Apagado |
| 0:04 – 0:36 | Capítulo 1: elasticidad y escalado, balanceadores (ALB, NLB, GWLB), CloudWatch contra CloudTrail, Lambda y contenedores, SQS, SNS y EventBridge | Apagado |
| 0:36 – 1:32 | Capítulo 2: laboratorio de 19 pasos; plantilla de lanzamiento, grupo de Auto Scaling con dos instancias en dos zonas, una instancia terminada que el grupo reemplaza solo, crecer a tres, métricas de CloudWatch, la alarma negada, un vistazo a balanceadores y Lambda, y limpieza | **Encendido ≈ 35 min** |
| 1:32 – 1:40 | Capítulo 3: hoja de repaso y verdadero o falso | Apagado |
| 1:40 – 1:57 | Examen de práctica: 20 preguntas de escalado y automatización, con reporte PDF | Apagado |
| 1:57 – 2:00 | Cierre | — |

## Sesión 7: Costos, soporte y buenas prácticas (2 horas)

| Minutos | Bloque | Sandbox |
|---|---|---|
| 0:00 – 0:05 | Arranque | Apagado |
| 0:05 – 0:40 | Capítulo 1: formas de pago de EC2, herramientas de costos, Organizations, planes de soporte, Trusted Advisor y Well-Architected | Apagado |
| 0:40 – 1:32 | Capítulo 2: laboratorio de 12 pasos; primero una estimación en AWS Pricing Calculator (sin sandbox), luego en la consola el gasto real con Cost Explorer, un presupuesto que no se deja crear, Trusted Advisor, los planes de soporte, Organizations y Well-Architected | **Encendido ≈ 15 min** |
| 1:32 – 1:40 | Capítulo 3: hoja de repaso y verdadero o falso | Apagado |
| 1:40 – 1:57 | Examen de práctica: 20 preguntas de costos, soporte y buenas prácticas, con reporte PDF | Apagado |
| 1:57 – 2:00 | Cierre | — |

## Lo que permite el sandbox de DataCamp

Verificado en el sandbox del docente el 27 y el 30 de septiembre y el 4 y el
15 de octubre de 2026. Las
guías ya lo toman en cuenta; sirve para diseñar las sesiones que faltan.

- Región **us-east-1** (N. Virginia). Una sola sesión a la vez; al salir se
  borra todo. Si la pestaña se oculta mucho tiempo, la sesión se cae (*Restart
  Session* la recupera).
- **EC2**: solo t2.nano, t2.micro y t2.small. No hay terminal: EC2 Instance
  Connect y CloudShell fallan; el sustituto es *Get system log*. El escritorio
  remoto no alcanza la IP pública de las instancias (se abre desde el navegador
  del alumno).
- **IAM**: todo sale *Access denied* (ni el tablero ni las políticas). La
  sesión 2 usa esos mensajes como material de clase.
- **Secrets Manager**: crear y borrar sí; leer el valor (*GetSecretValue*) no.
  **KMS**: se puede cifrar con la llave administrada, no listar llaves.
- **CloudTrail**: *AccessDeniedException*. **RDS**: negado por una SCP de la
  organización (*explicit deny*). Tampoco Redshift ni DocumentDB.
- **Grupos de seguridad y NACL**: se pueden crear, ver y borrar.
- **VPC**: se pueden crear VPC y subredes y editar tablas de rutas, pero crear
  un **Internet Gateway** está negado por una SCP (*explicit deny*). La VPC por
  omisión (172.31.0.0/16) trae 6 subredes, una por zona, y su igw.
- **CloudFront** y **Route 53**: se pueden abrir y ver (región *Global*).
- **S3**: crear, configurar (versionado, cifrado, ciclo de vida) y borrar
  buckets sí; guardar objetos no (*s3:PutObject* negado, ni carpetas).
- **EBS**: crear volúmenes gp2/gp3 de hasta 20 GiB y sus snapshots, y
  borrarlos. **EFS** se puede abrir.
- **RDS y Aurora** (15 oct): la configuración exprés de Aurora Serverless se
  abre, pero *Create database* da *rds:CreateDBCluster … explicit deny in a
  service control policy*. La configuración completa no carga los motores
  (*Error loading resource*).
- **DynamoDB** (15 oct): **sí funciona**, aunque la tabla de DataCamp diga lo
  contrario: crear tablas bajo demanda, crear elementos, Scan, Query y borrar.
  Los respaldos (PITR) salen *Unavailable* y el autoescalado de la tabla no.
- **EC2 con user data** sirve para «ver por dentro» sin terminal: lo que
  imprime el script sale en *Get system log* (así se ve la tabla de MariaDB).
- **ElastiCache**: la portada se abre (no se probó crear).
- **Auto Scaling** (15 oct): plantillas de lanzamiento y grupos sí (hasta 3
  instancias, en varias zonas), con reemplazo automático de una instancia
  terminada. La política de seguimiento de CPU falla al crearse (*Failed to
  create 1 Scaling policy*) porque necesita una alarma.
- **CloudWatch**: métricas y tableros automáticos sí; crear alarmas
  (*cloudwatch:PutMetricAlarm*) y tableros propios, no.
- **Balanceadores**: *AccessDenied* en *DescribeLoadBalancers*; el asistente
  muestra los tres tipos. **Lambda**: no se crean funciones, pero la demostración
  *How it works* de su portada corre sin permisos.
- **Facturación** (15 oct): la página de Billing and Cost Management y Cost
  Explorer se leen con datos reales; Budgets se ve pero crear da
  *budgets:ModifyBudget*; Trusted Advisor y el Support Center (plan Basic y la
  comparación de planes) se leen; Free Tier da error; Organizations niega el
  acceso; Well-Architected deja llenar la carga pero falla en
  *wellarchitected:ListLenses*. AWS Pricing Calculator es pública y no usa el
  sandbox.
- Un recorrido de las tres sesiones (5, 6 y 7) costó unos 180 tokens.
- Si al entrar sale *You already have an active Sandbox Session running*, la
  sesión anterior no se cerró: *Exit Session* y volver a entrar.
- Según la tabla de DataCamp: sin Lambda, DynamoDB, SNS/SQS ni API Gateway; S3
  sin subir archivos; balanceadores con *Access denied*; no se puede crear un
  Internet Gateway; CloudWatch completo; Auto Scaling hasta 3 instancias. Ojo:
  en la práctica DynamoDB sí funciona y CloudWatch no deja crear alarmas ni
  tableros (ver arriba).

## Correr y editar

Como el otro curso, **no tiene dependencias de npm**: se monta en la plataforma
sin `npm install` y sin tocar el build de Render.

```powershell
cd curso-aws-practitioner
$env:CLAVE_DOCENTE = "loquesea"
npm start            # suelto, en http://localhost:3000
npm run verificar    # revisa ejercicios, laboratorios, examen y tiempos
```

- Cada sesión vive en su archivo: `public/sesion1.js` a `public/sesion7.js`
  (lecciones, ejercicios, laboratorio, examen y plan de clase).
  `public/contenido.js` las junta y tiene la ruta completa; los números del
  sandbox están en `public/sandbox.js`.
- Las piezas para escribir sesiones (recuadros, código, botones de la consola y
  capturas con marcas) están en `public/piezas.js`; las imágenes, en
  `public/capturas/s1`, `s2`…, con su tamaño registrado en `TAMANOS`.
- Exámenes de práctica: `src/practica.js` (sesión 1) y `src/practica2.js` a
  `src/practica7.js`, juntos en `src/practicas.js`. Misma estructura del otro
  curso: `correcta`, `explicacion`, `concepto` y el mapa `REPASO`.
- **Para agregar una sesión:** escribe `public/sesionN.js` y `src/practicaN.js`,
  agrégalos a `public/contenido.js` y `src/practicas.js`, y corre
  `npm run verificar`.
- Los datos se guardan en `data/aws-practitioner.json`. En Render el disco es
  efímero: descarga el CSV antes de salir del salón.

## Fuentes

- Guía oficial del examen AWS Certified Cloud Practitioner (CLF-C02): 65
  preguntas (50 con calificación y 15 sin ella), 90 minutos, 700 de 1000 para
  aprobar y los cuatro dominios con sus pesos.
- Sandbox de DataCamp: los tokens se renuevan cada semana, corre una sesión a la
  vez y se reinicia al cerrar la pestaña o tras un rato de inactividad.
