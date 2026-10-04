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
| 5 | Bases de datos: RDS, Aurora, DynamoDB, ElastiCache, Redshift | ≈ 60 min | Pendiente |
| 6 | Escalar y automatizar: ELB, Auto Scaling, CloudWatch, Lambda, SNS y SQS | ≈ 60 min | Pendiente |
| 7 | Costos, soporte y buenas prácticas: calculadora, Budgets, Organizations, Well-Architected | ≈ 20 min | Pendiente |
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
| 0:00 – 0:05 | Arranque | Apagado |
| 0:05 – 0:41 | Capítulo 1: IAM (raíz, usuarios, grupos, roles), políticas y SCP, responsabilidad compartida y Artifact, servicios de seguridad | Apagado |
| 0:41 – 1:32 | Capítulo 2: laboratorio de 17 pasos; leer los “Access denied”, guardar un secreto cifrado con KMS, grupo de seguridad con mínimo privilegio, NACL y limpieza | **Encendido ≈ 30 min** |
| 1:32 – 1:40 | Capítulo 3: hoja de repaso y verdadero o falso | Apagado |
| 1:40 – 1:57 | Examen de práctica: 20 preguntas de seguridad, con reporte PDF | Apagado |
| 1:57 – 2:00 | Cierre | — |

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

## Lo que permite el sandbox de DataCamp

Verificado en el sandbox del docente el 27 y el 30 de septiembre y el 4 de
octubre de 2026 (dos recorridos). Las
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
- Si al entrar sale *You already have an active Sandbox Session running*, la
  sesión anterior no se cerró: *Exit Session* y volver a entrar.
- Según la tabla de DataCamp: sin Lambda, DynamoDB, SNS/SQS ni API Gateway; S3
  sin subir archivos; balanceadores con *Access denied*; no se puede crear un
  Internet Gateway; CloudWatch completo; Auto Scaling hasta 3 instancias.

## Correr y editar

Como el otro curso, **no tiene dependencias de npm**: se monta en la plataforma
sin `npm install` y sin tocar el build de Render.

```powershell
cd curso-aws-practitioner
$env:CLAVE_DOCENTE = "loquesea"
npm start            # suelto, en http://localhost:3000
npm run verificar    # revisa ejercicios, laboratorios, examen y tiempos
```

- Cada sesión vive en su archivo: `public/sesion1.js`, `public/sesion2.js`,
  `public/sesion3.js`, `public/sesion4.js`
  (lecciones, ejercicios, laboratorio, examen y plan de clase).
  `public/contenido.js` las junta y tiene la ruta completa; los números del
  sandbox están en `public/sandbox.js`.
- Las piezas para escribir sesiones (recuadros, código, botones de la consola y
  capturas con marcas) están en `public/piezas.js`; las imágenes, en
  `public/capturas/s1`, `s2`…, con su tamaño registrado en `TAMANOS`.
- Exámenes de práctica: `src/practica.js` (sesión 1) y `src/practica2.js` a
  `src/practica4.js`, juntos en `src/practicas.js`. Misma estructura del otro
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
