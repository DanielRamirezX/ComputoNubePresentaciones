# Simulador AWS · diseño y contratos (noviembre de 2026)

Este documento es el contrato entre las piezas del simulador. Se escribió para
construirlo con varios agentes en paralelo. Complementa a `DISENO.md` (las
evaluaciones de octubre) y a `public/consola/NUCLEO.md` (cómo se escribe una
pantalla de la consola). **Léelos antes que este.**

## 0. Qué pidió el docente (2 de noviembre de 2026)

1. **Un simulador de AWS muy robusto, en un apartado independiente** de la
   plataforma, donde los alumnos practiquen libremente. El mismo simulador
   servirá para el **examen final** (parte teórica tipo CLF-C02 y parte práctica).
2. El simulador se comporta **como AWS real**: no repite las negaciones del
   sandbox de DataCamp. Allá RDS, el Internet Gateway, las alarmas, subir objetos
   a S3, IAM y los balanceadores salen negados; aquí sí se pueden crear.
3. En las sesiones que vienen (**5, 6 y 7** de la Ruta AWS; la siguiente clase es
   la 6) el alumno **elige** dónde hace el laboratorio: en DataCamp, con la guía
   actual y sus capturas, o en el simulador. La versión de simulador tiene sus
   propias tareas y **se califica sola**. El panel del docente muestra quién la
   eligió, en qué va y su calificación.
4. **Sesión 8**: simulacro CLF-C02 de 65 preguntas en 90 minutos, con repaso de
   errores por dominio y por sesión.
5. **Sesiones 9 a 13** (después del 10 de noviembre): cinco **prácticas
   completas** con casos reales simulados. Cada una integra el temario del examen
   montando infraestructura en el simulador.
6. **Auditar las guías y los exámenes** de las sesiones 1 a 7 para que el alumno
   llegue listo al final.

Público: universitarios en México que empiezan. Todo el texto para el alumno va
en español claro, estilo «for dummies», tuteando. La interfaz de la consola va
en inglés, igual que AWS en 2026. Las ayudas «Info» y los avisos propios del
simulador van en español.

## 1. Reglas para todos los agentes

- **Cero dependencias de npm** en `evaluacion-aws/`, `curso-aws-practitioner/` y
  `plataforma/`: Render solo instala dos carpetas.
- **Solo tocas tus archivos** (tabla de la sección 9). Si necesitas un cambio en
  un archivo ajeno (`ui.js`, `consola.js`, `modelo.js`, `app.js`…), **no lo
  hagas**: descríbelo en tu respuesta final, bajo «Cambios que pido en archivos
  ajenos», con el texto exacto, y el coordinador los aplica.
- Varios archivos usan CRLF (`modelo.js`, `ui.js`…). La herramienta Edit los
  respeta; si los editas con un script, conserva el fin de línea.
- Las pantallas siguen `public/consola/NUCLEO.md` sin excepción: `cx.hacer`,
  `ui.tabla`, `cx.vivo`, `ErrorAws` con el mensaje en inglés de AWS, confirmaciones
  con palabra… La referencia de un servicio grande es `servicios/ec2-instancias.js`.
- Los estilos van en **tu** `public/consola/servicios/css/<tuyo>.css`, ya
  importado desde `consola.css`. Todo bajo `.cx`, con clases `cx-…`. Los
  breakpoints son `@container cx`, no `@media`. Primero usa las clases que ya existen.
- El estado debe ser **JSON puro** y caber en 512 KB aun después de una hora de
  uso. Recorta toda lista que crezca sola: actividad, logs, mensajes, historial
  y datos de métricas. No guardes series de métricas: **calcúlalas**.
- Sin `eval`, sin `new Function` y sin `innerHTML` con datos del alumno.
- **Prueba lo que haces**, en dos niveles:
  1. **Modelo:** escribe `evaluacion-aws/src/pruebas/<tuyo>.js` (formato en
     `src/pruebas/LEEME.md`). `npm run verificar` lo corre. Prueba las acciones,
     los errores de AWS, `avanzar` con el reloj fijo y que una cuenta vieja (sin
     tu colección) no truena.
  2. **Pantallas:** hay un banco de pruebas con Edge sin ventana en
     `<scratchpad>/prueba/`. El servidor ya corre en
     `http://localhost:4791/__prueba.html?ruta=<ruta>`. Úsalo con
     `import { abrir } from '<scratchpad>/prueba/consola.mjs'` y lee el
     comentario de ese archivo.
     - En la página, `window.m` es `modelo.js` y `window.montar(estado, {ruta})`
       vuelve a montar la consola. `window.estado` es el estado vivo y
       `window.erroresPagina` lista los errores.
     - Para correr Edge, la herramienta Bash necesita
       `dangerouslyDisableSandbox: true`.
     - Hay como máximo 3 Edge a la vez y el candado espera solo. **Cierra
       siempre** con `await cerrar()` dentro de un `finally`.
     - Guarda tus capturas en `<scratchpad>/prueba/capturas/<tuyo>/` y míralas
       con Read: así compruebas que se ven como en AWS.
- Los textos de AWS (botones, columnas, errores) van como en la consola real de
  2026. En `<scratchpad>/mapa/labs-5-6-7.md` hay un inventario de pantallas,
  botones y campos por servicio: úsalo.

`<scratchpad>` = `C:/Users/danie/AppData/Local/Temp/claude/C--Users-danie-Repositories-Computo-en-la-nube/a60f99c6-a795-4922-bb56-507816007ba0/scratchpad`.

Hay reportes técnicos del código actual en `<scratchpad>/mapa/`:

| Reporte | Qué cubre |
|---|---|
| `consola-nucleo.md` | modelo, red, consola y EC2 |
| `evaluacion-servidor.md` | servidor, alumno y panel |
| `ruta-motor.md` | motor de la Ruta |
| `labs-5-6-7.md` | laboratorios y pantallas necesarias |
| `sesion8-y-examen.md` | sesión 8, huecos del CLF-C02 y examen final |

## 2. El modelo: extensiones

Lo que ya existía (EC2, VPC, S3, IAM) sigue en `public/consola/modelo.js`. Cada
servicio nuevo vive en **su archivo** `public/consola/modelo/<archivo>.js`, que
ya existe como marcador. Ese archivo se registra solo en `modelo/registro.js`:

```js
import { registrarExtension, llamar } from './registro.js';
import { anotar, buscar, errorAws, iso, nombreLimpio, nuevoId, reloj, lanzarInstancias /* … */ } from '../modelo.js';

export function crearGrupoAutoScaling(estado, p) { iniciar(estado); /* … */ }

function iniciar(estado) { estado.autoscaling ??= { plantillas: [], grupos: [] }; }

registrarExtension({
  id: 'autoscaling',
  orden: 20,
  iniciar,
  avanzar(estado, ahora) { /* … */ return cambio; },
  dependenciasVpc(estado, vpcId) { /* lanza errorAws('DependencyViolation', …) */ },
  dependenciasSubred(estado, subredId) {},
  dependenciasGrupo(estado, sgId) {},
  funciones: { ejecutarPolitica, grupoAutoScalingDe }    // lo que ofreces a otras extensiones
});
```

Lo que debes cumplir:

- **Ciclo de módulos.** `modelo.js` importa tu archivo y tú importas
  `modelo.js`. Por eso **nunca uses nada importado de `modelo.js` en el nivel
  superior** del archivo, solo dentro de funciones: ni constantes calculadas ni
  llamadas al cargar.
- **Llamadas entre extensiones.** Se hacen **solo** con `llamar('nombre', …)`
  (sección 4). No importes otra extensión. Si la otra todavía no existe,
  `llamar` devuelve `undefined` y tu código debe tolerarlo.
- `modelo.js` ya llama a `iniciar` en `cuentaNueva` y al principio de cada
  `avanzar`. Aun así, **cada acción tuya llama `iniciar(estado)` primero**: una
  cuenta guardada en octubre no trae tu colección.
- `modelo.js` reexporta todo lo tuyo (`export * from './modelo/<tuyo>.js'`).
  Las rúbricas y las pantallas importan de `modelo.js` o de tu archivo, como
  prefieran. **Los nombres exportados no pueden repetirse** entre extensiones:
  usa nombres del dominio (`crearAlarma`, `crearTablaDynamo`, `crearBaseRds`…).
- `modelo.js` exporta para ti estas ayudas internas: `errorAws(codigo, mensaje)`
  (crea un `ErrorAws`), `iso(ms?)`, `nombreLimpio(v, max)`,
  `buscar(lista, id, tipo, codigo)`, `ipPublicaNueva`, `ipPrivadaNueva`,
  `aleatorio`, `hexAzar(n)`, además de `nuevoId`, `anotar`, `reloj`, `ZONAS`,
  `REGION`, `TIPOS_INSTANCIA`, `lanzarInstancias`, `terminarInstancia` y todo
  lo que ya exportaba.
- Anota en la bitácora con el nombre del servicio como lo escribe CloudTrail
  (`'AutoScaling'`, `'ELB'`, `'CloudWatch'`, `'SNS'`, `'SQS'`, `'Lambda'`, `'RDS'`,
  `'DynamoDB'`, `'Budgets'`…) y el nombre de la API (`'CreateAutoScalingGroup'`).
- `orden` de `avanzar`:

  | orden | extensiones |
  |---|---|
  | 10 | elb |
  | 20 | autoscaling |
  | 30 | cloudwatch |
  | 40 | mensajeria |
  | 45 | lambda |
  | 50 | rds |
  | 55 | dynamodb |
  | 60 | borde |
  | 65 | secretos |
  | 66 | efs |
  | 80 | costos |
  | 90 | gobierno |

### 2.1 Las colecciones (nombres fijos: otros las leen)

Cada extensión documenta la forma interna en el comentario de cabecera de su
archivo. Los nombres de primer nivel son estos:

| Archivo | Colecciones en el estado |
|---|---|
| `elb.js` | `estado.elb = { balanceadores: [], gruposDestino: [] }` |
| `autoscaling.js` | `estado.autoscaling = { plantillas: [], grupos: [] }` |
| `cloudwatch.js` | `estado.cloudwatch = { alarmas: [], tableros: [], gruposLogs: [], carga: {} }` |
| `mensajeria.js` | `estado.sns = { temas: [], buzon: [] }` y `estado.sqs = { colas: [] }` |
| `lambda.js` | `estado.lambda = { funciones: [] }` y `estado.eventbridge = { reglas: [] }` |
| `rds.js` | `estado.rds = { instancias: [], snapshots: [], gruposSubredes: [] }` y `estado.elasticache = { caches: [] }` |
| `dynamodb.js` | `estado.dynamodb = { tablas: [] }` |
| `costos.js` | `estado.costos = { estimaciones: [], presupuestos: [], etiquetasActivas: [], planSoporte: 'basic', advisor: {…}, historico: [] }` |
| `gobierno.js` | `estado.organizations = null \| {…}` y `estado.wellarchitected = { cargas: [] }` |
| `borde.js` | `estado.cloudfront = { distribuciones: [] }` y `estado.route53 = { zonas: [], chequeos: [] }` |
| `secretos.js` | `estado.secretos = { secretos: [] }` y `estado.kms = { llaves: [] }` |
| `efs.js` | `estado.efs = { sistemas: [] }` |

Los ARN usan `estado.cuenta.id` y `us-east-1`, con el formato real de cada
servicio.

## 3. El tiempo del simulador (comprimido)

Una clase dura 2 horas y un laboratorio, 50 minutos. Por eso el tiempo de
CloudWatch, Auto Scaling y facturación va **acelerado**. Valores fijos que todos
respetan; cada uno se declara en `DURACION` dentro de tu archivo y se exporta
con un nombre propio para no chocar:

| Qué | Tiempo real en el simulador |
|---|---|
| Un periodo de una métrica de CloudWatch (1 o 5 min en AWS) | **10 s** |
| Una alarma: N puntos fuera del umbral | N × 10 s |
| Health check de un grupo de destino (intervalo) | 5 s; healthy/unhealthy tras los umbrales (2 por omisión) |
| Gracia del health check de Auto Scaling (300 s en AWS) | 15 s |
| Cooldown o warmup de una política de escalado | 20 s |
| Balanceador `provisioning` → `active` | 20 s |
| RDS `creating` → `backing-up` → `available` | 25 s + 5 s; réplica 25 s; snapshot manual 10 s; modificar 10 s |
| ElastiCache `creating` → `available` | 20 s |
| DynamoDB `CREATING` → `ACTIVE` | 3 s |
| CloudFront `Deploying` → `Enabled` | 30 s |
| EFS `creating` → `available` | 5 s |

La **CPU sintética** de cada instancia `running` es una base estable de 3 a
15 %, que sale de su id, más la carga simulada que esté vigente (sección 4,
`simularCarga`). Las métricas se **calculan** en el momento, no se guardan.

**Facturación:** por cada recurso, el costo en dólares es `precio por hora ×
horas`. Las horas de uso se cuentan como **1 hora simulada = 1 minuto real**,
más un histórico sintético de meses anteriores por cuenta. Así un laboratorio
de 50 minutos genera un gasto visible, pero chico.

## 4. Funciones entre extensiones (`llamar`)

Firmas fijas. Quien la **ofrece** la registra en `funciones`. Quien la **usa**
llama `llamar('nombre', …)` y tolera `undefined`.

| Función | La ofrece | Para qué |
|---|---|---|
| `registrarDestinos(estado, tgArn, instanciaIds)` | elb | Auto Scaling registra sus instancias en los grupos de destino |
| `quitarDestinos(estado, tgArn, instanciaIds)` | elb | Auto Scaling, al terminar una instancia (pasa a `draining` y luego sale) |
| `saludDestino(estado, tgArn, instanciaId)` | elb | → `'initial' \| 'healthy' \| 'unhealthy' \| 'unused' \| 'draining' \| null`; el ASG con chequeo ELB reemplaza las `unhealthy` |
| `grupoDestinoDe(estado, arnONombre)` | elb | → el grupo de destino o `null` |
| `balanceadorPorDns(estado, dns)` | elb | → el balanceador o `null` (lo usa `red.js` para «¿abre la página?») |
| `ejecutarPolitica(estado, politicaArn, { alarma })` | autoscaling | una alarma en ALARM dispara una política simple o de pasos |
| `ajusteSeguimiento(estado, asgNombre)` | autoscaling | lo llama cloudwatch al evaluar las alarmas `TargetTracking-…`; o bien el propio autoscaling hace la cuenta en su `avanzar` |
| `grupoAutoScalingDe(estado, nombre)` | autoscaling | → el grupo o `null` |
| `crearAlarmaInterna(estado, alarma)` | cloudwatch | Auto Scaling crea las alarmas `TargetTracking-<asg>-AlarmHigh-<uuid>` / `AlarmLow` (`creadaPor: 'autoscaling'`) |
| `eliminarAlarmasInternas(estado, nombres)` | cloudwatch | al borrar la política o el grupo |
| `valorMetrica(estado, { namespace, metrica, dimensiones, estadistica }, ahora)` | cloudwatch | → número o `null`. La usan Auto Scaling, los tableros y Billing |
| `simularCarga(estado, { asg?, instanciaId?, cpu, minutos })` | cloudwatch | «Simular hora pico»: vale como «minutos» del simulador, es decir, `minutos × 10 s` reales |
| `escribirLog(estado, grupo, flujo, mensaje)` | cloudwatch | Lambda escribe `/aws/lambda/<fn>`; crea el grupo si no existe |
| `publicarEnTema(estado, temaArn, { asunto, mensaje, origen })` | mensajeria | las alarmas avisan por SNS; reparte a email (al `buzon`), SQS y Lambda |
| `enviarACola(estado, colaArnOUrl, cuerpo, { origen })` | mensajeria | SNS → SQS, EventBridge → SQS |
| `invocarLambda(estado, arnONombre, evento, { origen })` | lambda | SNS, SQS, EventBridge o alarma → Lambda |
| `costoMensual(estado, { servicio? })` | costos | lo usan Budgets y la portada de Billing |

Las acciones de una alarma son ARN, y `cloudwatch.js` los despacha así:

- `arn:aws:sns:…` → `publicarEnTema`.
- `arn:aws:autoscaling:…:scalingPolicy:…` → `ejecutarPolitica`.
- `arn:aws:automate:us-east-1:ec2:stop|terminate|reboot|recover` → las funciones
  de `modelo.js` (`detenerInstancia`, `terminarInstancia`, `reiniciarInstancia`).
- `arn:aws:lambda:…` → `invocarLambda`.

### 4.1 Red: el tráfico por el balanceador

`public/consola/red.js` es del agente de ELB. `probarPagina(estado, direccion)`
debe aceptar también el DNS de un ALB, con el formato
`<nombre>-<n>.us-east-1.elb.amazonaws.com`. El flujo es este:

1. Resolver el balanceador.
2. Comprobar que esté `active`, que sea `internet-facing` y que su grupo de
   seguridad deje entrar el 80 desde la IP de la casa del alumno.
3. Comprobar que el listener haga forward al grupo de destino.
4. Elegir un destino `healthy` por turnos.
5. Evaluar la instancia **con origen en el grupo de seguridad del ALB**.
   `gruposPermiten` necesita una variante que acepte el `sg-…` de origen.
6. Responder con la página de la instancia.

Ya sin balanceador, `sustituir()` debe entender `$(ec2-metadata -i)` →
`instance-id: i-…` y `$(ec2-metadata -z)` → `placement: us-east-1a`. Lo usa el
script de la sesión 6.

## 5. Los servicios: qué tiene cada uno

El detalle de pantallas, botones y campos está en
`<scratchpad>/mapa/labs-5-6-7.md` (secciones 1.4, 1.5, 2.4 y 3.4). Lo mínimo que
debe funcionar está abajo. Todo lo que la consola real tiene y aquí no va
`desactivado` o con `ui.noDisponible`.

### 5.1 EC2 → Launch Templates y Auto Scaling Groups

Archivos: `servicios/ec2-escalar.js` y `modelo/autoscaling.js`. Reúsa el
asistente de *Launch instance*: parametrízalo en `ec2-instancias.js` con un modo
plantilla, sin duplicarlo.

- **Plantillas:** con versiones, *Auto Scaling guidance*, «Don't include in
  launch template» para el par de llaves y la subred, user data, y Actions →
  Modify (nueva versión) / Delete / Launch instance from template.
- **Grupos de Auto Scaling:**
  - Asistente de 7 pasos: sin balanceador, conectado a un grupo de destino
    existente, o con un **balanceador nuevo** creado en línea mediante
    `llamar`, con chequeos EC2 o ELB, gracia, deseado/mín/máx, target tracking
    (CPU, red, peticiones por destino) y etiquetas.
  - Detalle con las pestañas Details (Edit de capacidad, *Group size*),
    Activity (con las causas en el texto de AWS), Automatic scaling (dinámicas
    target tracking, step y simple; scheduled actions), Instance management y
    Monitoring.
  - **Autocuración:** una instancia `terminated`, `stopped` o (con chequeo ELB)
    `unhealthy` se reemplaza.
  - **Escalado** por alarmas de target tracking.
  - Borrado en dos fases: `Deleting` con deseado 0 y luego desaparece.
  - Botón propio del simulador en el detalle: **«Simular hora pico»**
    (`simularCarga`). Sin él no se puede ver escalar en clase.
- Contadores del tablero de EC2: Auto Scaling Groups, Load balancers e
  *Instance alarms*.

### 5.2 EC2 → Load Balancers y Target Groups

Archivos: `servicios/ec2-balanceo.js`, `modelo/elb.js` y `red.js`.

- **ALB funcional:**
  - Mínimo 2 subredes en 2 zonas: «At least two subnets in two different
    Availability Zones must be specified».
  - Grupo de seguridad, listener HTTP:80 → forward, reglas por ruta
    (*path pattern*) opcionales y DNS copiable.
  - Botón propio del simulador: «Open in browser», con `cx.navegador`.
- **NLB y GWLB:** se pueden crear o mostrar, sin tráfico.
- **Grupos de destino:** tipo instance, health checks, Register targets y salud
  calculada con `red.js`.

### 5.3 CloudWatch y CloudTrail

Archivos: `servicios/cloudwatch.js`, `servicios/cloudtrail.js` y
`modelo/cloudwatch.js`.

- **All metrics:** espacios de nombres AWS/EC2 (por instancia y *By Auto Scaling
  Group*), AWS/ApplicationELB, AWS/AutoScaling, AWS/SQS, AWS/Lambda, AWS/RDS,
  AWS/DynamoDB y AWS/Billing (EstimatedCharges), con gráfica SVG.
- **Create alarm:** asistente de 4 pasos con notificación SNS (tema existente o
  nuevo con su email), acción de Auto Scaling, acción de EC2 y «Proceed without
  actions».
- **Lista y detalle de alarmas:** In alarm / OK / Insufficient data, historial y
  las alarmas de target tracking.
- **Dashboards:** automáticos y propios.
- **Log groups:** retención y eventos.
- **CloudTrail:** Event history sacado de `estado.bitacora`, con filtros (Event
  name, User name, Event source) y el detalle del evento en JSON.

### 5.4 SNS, SQS, Lambda y EventBridge

Archivos: `servicios/sns.js`, `servicios/sqs.js`, `servicios/lambda.js`,
`servicios/eventbridge.js`, `modelo/mensajeria.js` y `modelo/lambda.js`.

- **SNS:**
  - Temas Standard y FIFO, suscripciones (Email, SQS, Lambda…), Publish message
    y Delete con «delete me».
  - Email queda en `Pending confirmation` hasta que el alumno confirma.
  - **Buzón simulado:** un botón propio del simulador, «Bandeja de correo
    (simulada)», muestra los correos de AWS Notifications con su enlace
    «Confirm subscription» y los avisos de alarmas y presupuestos.
- **SQS:** Standard y FIFO (`.fifo`), configuración, Send and receive messages
  (Poll, visibilidad, borrar), Subscribe to Amazon SNS topic, Purge y Delete.
- **Lambda:**
  - Create function (Author from scratch, runtimes Node.js 22.x y Python 3.13)
    con el rol básico (`AWSLambdaBasicExecutionRole`).
  - Editor de código y Deploy, Test con eventos guardados, triggers (SNS, SQS,
    EventBridge, S3) y Configuration (timeout de 900 s como máximo, memoria).
  - **Nunca se ejecuta el código del alumno.** La respuesta de Test se
    **interpreta** con un subconjunto seguro: si el código hace
    `return { statusCode, body }` con literales, o `return event`, se devuelve
    eso; si no, `null`. Las líneas `console.log('…')` con literales salen en el
    log. Siempre aparecen START, END y REPORT.
- **EventBridge:** Rules → Create rule de tipo Schedule (`rate(5 minutes)` o
  cron) o Event pattern, con destino Lambda, SQS o SNS. Una regla `rate(N
  minutes)` dispara cada `N × 10 s`. Basta Rules; Event buses va como
  `noDisponible`.

### 5.5 RDS y ElastiCache

Archivos: `servicios/rds.js`, `servicios/elasticache.js` y `modelo/rds.js`.

- **Create database:**
  - Standard o Easy create, con los motores MySQL, PostgreSQL, MariaDB, Aurora
    MySQL y Aurora PostgreSQL. Oracle, SQL Server y Db2 se ven, pero
    desactivados.
  - Plantillas Production / Dev/Test / Free tier y despliegue Single-AZ,
    Multi-AZ DB instance o Multi-AZ DB cluster.
  - Clase, almacenamiento, conectividad (VPC, *DB subnet group*, Public access
    y grupo de seguridad), respaldo de 0 a 35 días, cifrado y *Deletion
    protection*.
  - **No se guardan contraseñas:** solo `contrasenaDefinida: true`.
- **Acciones:** Modify (*Apply immediately*), Create read replica, Take snapshot,
  Restore to point in time (crea otra instancia), Reboot (*with failover*: la
  zona principal y la standby se intercambian), Stop temporarily y Delete
  (snapshot final, «delete me», protección).
- **Más pantallas:** Subnet groups, Snapshots y Automated backups.
- **Errores reales:** `DBSubnetGroupDoesNotCoverEnoughAZs`, réplica sin
  respaldos (`InvalidDBInstanceState`) y borrar una base protegida.
- **ElastiCache:** caché *serverless* Valkey, Redis OSS o Memcached, y *Design
  your own cache*. Basta con el recurso y sus estados.
- **«¿Se conecta?»:** una función pura `conexionBase(estado, instanciaId,
  baseId)` dice si una instancia EC2 llega a la base por VPC y grupos de
  seguridad (puerto 3306 o 5432). La usan las rúbricas.

### 5.6 DynamoDB

Archivos: `servicios/dynamodb.js` y `modelo/dynamodb.js`.

- **Create table:** partición y ordenamiento, Default o Customize, on-demand o
  provisioned (con autoescalado), clase de tabla, cifrado y protección.
- **Explore items:** Scan o Query, con condiciones sobre la sort key y filtros.
  Muestra el banner «Items returned · Items scanned · Efficiency · RCUs
  consumed».
- **Ítems:** Create item, en vista Form y JSON, con todos los tipos. PutItem
  sobrescribe un ítem con la misma llave.
- **Más:** Edit y Delete items, índices globales (GSI) con Query sobre el
  índice, Backups con PITR y respaldo bajo demanda, Global tables (réplica en
  otra región, que se ve pero no se usa) y Delete table con «confirm».

### 5.7 Costos, Trusted Advisor y Support

Archivos: `servicios/billing.js`, `servicios/trustedadvisor.js`,
`servicios/support.js` y `modelo/costos.js`.

- **Billing and Cost Management:**
  - Home con Cost summary, Bills, Cost Explorer (agrupar por servicio o tag, y
    pronóstico) y Free Tier.
  - **Budgets** con plantillas o personalizados y alertas reales o
    pronosticadas. Las alertas que se disparan mandan un correo al buzón SNS
    simulado mediante `llamar('publicarEnTema'…)`, o escriben directo en
    `estado.sns.buzon`.
  - **Cost allocation tags** (Activate), Cost Anomaly Detection (puede ser
    simple) y Savings Plans y Reservations en vista de solo lectura, con
    recomendaciones.
- **Pricing Calculator** dentro de Billing: EC2 con sus formas de pago, más S3,
  RDS y DynamoDB básicos. My Estimate con grupos y Export.
- **Trusted Advisor:**
  - Chequeos calculados del estado: EBS y RDS Public Snapshots, S3 Bucket
    Permissions, MFA on Root Account, Security Groups con puertos sin
    restricción, IAM Use, Unassociated Elastic IP Addresses, Low Utilization
    EC2, Amazon RDS Multi-AZ y límites de servicio.
  - Refresh all checks.
  - Con el plan Basic, los chequeos de un plan mayor salen bloqueados.
- **Support:** Support Center, Manage Support Plan (Basic, Business Support+,
  Enterprise y Unified Operations, con precios y tiempos de respuesta) y
  Create case con las categorías.

### 5.8 Organizations y Well-Architected

Archivos: `servicios/organizations.js`, `servicios/wellarchitected.js` y
`modelo/gobierno.js`.

- **Organizations:**
  - Create an organization, unidades organizativas y cuentas (Create/Invite y
    Move).
  - SCP: Enable, Create policy con editor JSON validado, Attach/Detach y
    `FullAWSAccess`.
  - Facturación consolidada visible.
  - Una función pura `accionPermitidaPorScp(estado, cuentaId, accion)` →
    `{ permitida, politica }` para explicar el «explicit deny».
- **Well-Architected Tool:**
  - Define workload y *lens* AWS Well-Architected Framework.
  - Banco reducido de 2 o 3 preguntas reales por pilar, de los seis pilares.
  - Riesgos alto y medio, milestones y Improvement plan.

### 5.9 CloudFront y Route 53

Archivos: `servicios/cloudfront.js`, `servicios/route53.js` y `modelo/borde.js`.

- **CloudFront:**
  - Create distribution con *origin* S3 (bucket con sitio web, o con OAC) o con
    un ALB, *default root object*, caché, WAF (solo la elección) y *price
    class*.
  - Pasa de `Deploying` a `Enabled` y tiene dominio `d1234abcd.cloudfront.net`.
  - Invalidations.
  - `probarPagina` sobre ese dominio lo pide al origen: coordínalo con `red.js`
    mediante `llamar('distribucionPorDominio', …)`, que ofreces tú.
- **Route 53:**
  - Hosted zones públicas y privadas y registros A, AAAA, CNAME, MX y TXT, y
    **Alias** a ALB, CloudFront o un bucket S3.
  - Políticas de enrutamiento: simple, weighted, latency y failover con health
    check.
  - Health checks.
  - El registro de dominios se ve, pero desactivado.

### 5.10 Secrets Manager, KMS y EFS

Archivos: `servicios/secretsmanager.js`, `servicios/kms.js`,
`servicios/efs.js`, `modelo/secretos.js` y `modelo/efs.js`.

- **Secrets Manager:**
  - Store a new secret: *Credentials for Amazon RDS database*, *Other type of
    secret* con pares llave/valor, llave KMS y rotación (cada N días, con
    Lambda).
  - Retrieve secret value **sí funciona aquí**, aunque en DataCamp no.
  - Delete con ventana de 7 a 30 días.
- **KMS:**
  - Customer managed keys, simétrica o asimétrica, con alias, administradores y
    usuarios (de IAM) y rotación anual.
  - Las AWS managed keys (`aws/s3`, `aws/rds`, `aws/ebs`…) se ven en solo
    lectura.
  - Schedule key deletion de 7 a 30 días.
- **EFS:**
  - Create file system (Regional o One Zone, clases de almacenamiento y ciclo
    de vida, *mount targets* por zona con grupo de seguridad).
  - «Attach» muestra el comando `mount`.
  - Una función pura `montajeEfs(estado, instanciaId, efsId)` dice si la
    instancia llega por NFS 2049.

## 6. Laboratorios, prácticas y examen final (`evaluacion-aws`)

Todos usan el contrato 3 de `DISENO.md`: `public/labs/<id>.js` para la parte
pública y `src/rubricas/<id>.js` para la rúbrica. Cada uno se registra en
`EVALUACIONES` (`src/evaluaciones.js`) con un campo nuevo, **`tipo`**:

| tipo | ids | Abierto por omisión | Minutos | Tareas | Entrega y reintentos |
|---|---|---|---|---|---|
| `evaluacion` | `simulacro-1`, `simulacro-2`, `bimestral` (los de octubre, sin cambios) | como hoy | ≤ 60 | 4 a 6 | como hoy |
| `laboratorio` | `lab-s5`, `lab-s6`, `lab-s7` | **sí**, solo práctica | ≤ 55 | 4 a 7 (+ bono) | se entrega como evidencia; después, «Intentar de nuevo» |
| `practica` | `practica-1` … `practica-5` | no: el docente la abre en clase | ≤ 100 | 5 a 9 (+ bono) | una entrega y luego reintentos; pistas generales; asistente opcional (10 preguntas) |
| `final` | `final` | no | teórica 50, práctica ≤ 60 | 5 a 8 (+ bono) | una entrega, sin reintentos, sin pistas, sin «Revisar mi avance» por omisión |

### 6.1 El apartado «Simulador AWS» (ruta `#/simulador` de evaluacion-aws)

Es una página propia con cuatro bloques:

1. **Consola libre**:
   - Una cuenta nueva (`cuentaNueva(datosAlumno(perfil))`), sin tareas ni
     calificación, guardada en `localStorage` (`evaluacion-aws:libre-<perfil>`).
   - Botones «Reiniciar mi cuenta» y «Descargar / Cargar mi cuenta (JSON)».
   - Una tarjeta de «Ideas para practicar» con retos cortos sin calificar, en
     español.
2. **Laboratorios de sesión**: tarjetas de `lab-s5`, `lab-s6` y `lab-s7`, con su
   estado (sin empezar, en curso con X de Y tareas, entregado con su
   calificación).
3. **Prácticas integradoras**: `practica-1` … `practica-5`, con «Tu docente la
   abre en clase» si está cerrada.
4. **Examen final**: aparece solo cuando el docente lo abre.

En la plataforma, el módulo `evaluacion` muestra una tarjeta **«Simulador AWS»**
(`ruta: '#/simulador'`) en una sección propia, «Simulador AWS». Para eso
`plataforma` debe aceptar `seccion` por acceso. Las tarjetas de los simulacros
siguen en «Evaluación».

### 6.2 La elección en la Ruta (`curso-aws-practitioner`)

Una actividad `laboratorio` puede traer:

```js
simulador: { lab: 'lab-s6', minutos: 50, nota: 'Aquí sí puedes crear el balanceador y la alarma.' }
```

- En el paso 1 aparece «¿Dónde harás este laboratorio?» con dos botones:
  **DataCamp** y **Simulador**.
- Si elige el simulador:
  - Se ve un resumen de las tareas del lab y un botón «Abrir el simulador» que
    lleva a `../evaluacion/#/lab-s6`. Esa liga solo existe dentro de la
    plataforma; suelto se oculta.
  - El contador del sandbox no corre y no se piden las capturas de DataCamp.
  - Un botón «Ya lo terminé en el simulador» completa la actividad.
- Si es posible, la Ruta muestra el avance real leyendo
  `../evaluacion/api/estado?a=<id>`. El perfil es el mismo id: evaluacion-aws ya
  reutiliza `aws-practitioner:perfil`.
- La elección (`lugares`) viaja con `api/progreso`. El panel de la Ruta muestra
  «DataCamp X · Simulador Y · sin elegir Z» por laboratorio.

Las sesiones 9 a 13 usan una actividad nueva, **`tipo: 'simulador'`**:

```js
{ id: 's9-practica', tipo: 'simulador', titulo, xp, minutos, lab: 'practica-1',
  objetivo, caso: '<p>…</p>', tareas: ['…'], necesitas: ['…'] }
```

- Pinta el caso, la arquitectura y la lista de tareas.
- Tiene el botón «Abrir la práctica en el simulador» y el avance real.
- Tiene el botón «Ya terminé» para completar la actividad.
- `src/verificar.js` debe validarla.

### 6.3 El examen de práctica de la Ruta (sesiones 8 a 13)

Los bancos de `src/practicaN.js` admiten estas exportaciones opcionales:

- `export const MINUTOS = 90`: reloj que avisa a los 10 min y a los 0 min, sin
  cortar. Sustituye el texto fijo «en unos 20 minutos».
- `export const ESCALA = { maximo: 1000, aprueba: 700 }`: puntaje escalado
  estimado, con la leyenda de que AWS no publica la conversión exacta. En el
  panel y en el PDF el umbral de aprobación pasa a 70 %.
- `export const OBJETIVO = { 'Conceptos de la nube': 16, … }`: conteo por tema
  que `verificar` comprueba.
- **Campo `sesion`** en cada pregunta, de 1 a 13 (0 = fuera de la Ruta): da el
  reporte «Por sesión de la Ruta» en el resultado, en el PDF y en el panel.
- **Respuesta múltiple**, como en el CLF-C02:

  ```js
  { id: 'p40', tema, sesion, concepto, texto: '¿… ? (Elige DOS.)', opciones: [5 textos], correcta: [1, 3], elige: 2, explicacion }
  ```

  - Se califica todo o nada.
  - Las letras de las preguntas de una sola respuesta siguen balanceadas; las
    de respuesta múltiple se revisan aparte (5 opciones distintas,
    `correcta.length === elige`).
  - En el navegador, el alumno marca hasta `elige` opciones y el botón
    Siguiente se habilita solo con esa cantidad.
- `verificar` revisa además que **ningún `texto` de pregunta se repita** entre
  bancos (normalizado).

### 6.4 Los casos de las prácticas integradoras (sesiones 9 a 13)

Cada práctica es una sesión de 2 horas de la Ruta:

| Tramo | Contenido |
|---|---|
| 15 min | Lección del caso y su arquitectura |
| 85 a 90 min | Práctica en el simulador |
| 15 min | Examen de 20 preguntas estilo CLF-C02 con los temas del caso y temas del examen que la Ruta no vio |

Más su laboratorio en evaluacion-aws (`practica-N`), con rúbrica de 5 a 9
tareas. Los datos cambian por alumno.

| Sesión | Lab | Caso | Se monta en el simulador | Temas del CLF-C02 que agrega la lección |
|---|---|---|---|---|
| 9 | `practica-1` | **La tienda de artesanías de Oaxaca vende en línea**: web de dos capas, alta disponibilidad | VPC propia con subredes públicas y privadas en 2 zonas, IGW, ALB + Auto Scaling (plantilla con user data), RDS MySQL Multi-AZ en privadas, grupos de seguridad encadenados (alb → web → db), bucket S3 para fotos con bloqueo público, alarma de CPU con SNS | Well-Architected aplicado, Elastic Beanstalk y Lightsail (PaaS), CloudFormation (IaC), Amplify, App Runner |
| 10 | `practica-2` | **La clínica guarda expedientes**: seguridad y cumplimiento | IAM (grupos con mínimo privilegio, MFA, un rol para EC2), KMS (llave propia con rotación), S3 con SSE-KMS, versionado, bloqueo público y ciclo de vida a Glacier (retención), Secrets Manager con las credenciales de RDS, RDS cifrado y privado, CloudTrail para auditar quién hizo qué, EBS cifrado | Artifact, Macie, GuardDuty, Inspector, Shield, WAF, Config, Security Hub, Detective, CloudHSM, Network Firewall, Cognito, IAM Identity Center |
| 11 | `practica-3` | **El festival vende boletos en hora pico**: sin servidores y desacoplado | sitio estático en S3 servido con CloudFront y un registro Alias en Route 53, DynamoDB para boletos (llave compuesta y GSI), cola SQS de pedidos, Lambda que procesa (trigger SQS), SNS que avisa (email + SQS), EventBridge programado, alarma de la cola | API Gateway, Step Functions, Kinesis, Athena, Glue, QuickSight, EMR, OpenSearch, ECS, EKS, Fargate, ElastiCache/DAX |
| 12 | `practica-4` | **La cadena de cafeterías ordena cuentas y factura**: gobierno y costos | Organizations (OU Producción/Pruebas, SCP que niega regiones o servicios), Budgets con alertas, etiquetas de asignación de costos activadas, Cost Explorer por etiqueta, Pricing Calculator (On-Demand contra Savings Plans), atender Trusted Advisor (EIP suelta, snapshot público, MFA de la raíz, SSH abierto), right-sizing (cambiar el tipo), elegir plan de soporte, revisión Well-Architected | Control Tower, Billing Conductor, Compute Optimizer, License Manager, Service Catalog, Marketplace, re:Post, IQ, Partner Network, Professional Services, TAM, Health Dashboard, Personal Health |
| 13 | `practica-5` | **La universidad migra a la nube** (ensayo del final, 60 min y sin pistas paso a paso) | integra todo: red, cómputo escalable, base administrada, EFS compartido, S3 con ciclo de vida, monitoreo y alertas, respaldo (snapshots), presupuesto y la IAM mínima | migración (las 7R, CAF, DMS y SCT, Application Migration Service, Migration Hub, familia Snow, DataSync, Storage Gateway, Transfer Family), híbrido y borde (Direct Connect, VPN, Outposts, Local Zones, Wavelength), IA/ML (SageMaker, Rekognition, Comprehend, Polly, Lex, Transcribe, Translate, Textract, Kendra, Bedrock, Amazon Q) |

El **examen final** (`final`) tiene dos partes:

- **Teórica:** 8 casos de negocio con 5 preguntas cada uno, 40 preguntas en
  50 minutos, con todo el temario y los cuatro dominios.
- **Práctica:** un caso integrador nuevo de 60 minutos, distinto a los cinco
  anteriores.

### 6.5 El avance en un archivo (10 de noviembre de 2026)

El docente pidió que quien no termine en clase no empiece de cero. En los tipos
`laboratorio` y `practica` (no en `final` ni `evaluacion`) el alumno baja su
avance y lo vuelve a cargar, en el mismo equipo o en otro:

```js
{ formato: 'simulador-aws-avance', version: 1, evaluacion: 'practica-1', titulo,
  guardado: '<ISO>', alumno, matricula, rev, estado /* la cuenta de la consola */ }
```

- Todo ocurre en `public/app.js` («el avance, en un archivo»). El servidor no
  cambia: la cuenta cargada le llega por `api/practica/guardar` como una copia
  más, con un `rev` mayor.
- Al cargar se exige `evaluacion === ev.id` y `estado.cuenta.id ===
  datosAlumno(identidad).cuentaId`: el avance de otro laboratorio o de otra
  persona se rechaza (sus tareas piden otros nombres y rangos).
- Un avance cargado antes de empezar se deja en `localStorage` con
  `cargado: true`; esa marca le gana a la copia del servidor al arrancar.
- Retomar días después no cambia la calificación: las soluciones de los ocho
  laboratorios dan 100 con el reloj adelantado 2, 7 y 21 días.

## 7. Verificación

- `evaluacion-aws`: `npm run verificar` corre las pruebas del modelo, las rúbricas
  (la solución da 100 y la cuenta inicial da poco), las teóricas y el catálogo
  de repaso.
- `curso-aws-practitioner`: `npm run verificar` revisa las sesiones, los bancos,
  los tiempos y las capturas.
- Alumnos simulados: agentes que hacen cada laboratorio **desde la pantalla**
  con Edge sin ventana y reportan lo que confunde o truena.

## 8. Fechas

| Sesión | Fecha |
|---|---|
| Sesión 6 | próxima clase (la más urgente) |
| Sesión 7 | siguiente clase |
| Sesión 8 | martes 10 de noviembre |
| Prácticas 1 a 5 | del 13 al 27 de noviembre |
| Examen final | al cierre, por definir |

Ninguna fecha va fija en el código: el docente abre y cierra cada parte desde su
panel.

## 9. Quién es dueño de qué

| Agente | Archivos |
|---|---|
| escalar | `modelo/autoscaling.js`, `servicios/ec2-escalar.js`, `servicios/ec2-instancias.js` (solo para reusar el asistente), `servicios/ec2.js` (contadores del tablero), `servicios/css/escalar.css`, `src/pruebas/autoscaling.js` |
| balanceo | `modelo/elb.js`, `servicios/ec2-balanceo.js`, `red.js`, `navegador.js` (si hace falta), `servicios/css/balanceo.css`, `src/pruebas/elb.js` |
| cloudwatch | `modelo/cloudwatch.js`, `servicios/cloudwatch.js`, `servicios/cloudtrail.js`, `servicios/css/cloudwatch.css`, `src/pruebas/cloudwatch.js` |
| mensajeria | `modelo/mensajeria.js`, `modelo/lambda.js`, `servicios/sns.js`, `servicios/sqs.js`, `servicios/lambda.js`, `servicios/eventbridge.js`, `servicios/css/mensajeria.css`, `src/pruebas/mensajeria.js` |
| rds | `modelo/rds.js`, `servicios/rds.js`, `servicios/elasticache.js`, `servicios/css/rds.css`, `src/pruebas/rds.js` |
| dynamodb | `modelo/dynamodb.js`, `servicios/dynamodb.js`, `servicios/css/dynamodb.css`, `src/pruebas/dynamodb.js` |
| costos | `modelo/costos.js`, `servicios/billing.js`, `servicios/trustedadvisor.js`, `servicios/support.js`, `servicios/css/costos.css`, `src/pruebas/costos.js` |
| gobierno | `modelo/gobierno.js`, `servicios/organizations.js`, `servicios/wellarchitected.js`, `servicios/css/gobierno.css`, `src/pruebas/gobierno.js` |
| borde | `modelo/borde.js`, `servicios/cloudfront.js`, `servicios/route53.js`, `servicios/css/borde.css`, `src/pruebas/borde.js` |
| secretos | `modelo/secretos.js`, `modelo/efs.js`, `servicios/secretsmanager.js`, `servicios/kms.js`, `servicios/efs.js`, `servicios/css/secretos.css`, `src/pruebas/secretos.js` |
| motor-evaluacion | `evaluacion-aws/public/app.js`, `public/estilos.css`, `public/index.html`, `public/docente.*`, `app.js`, `src/evaluaciones.js`, `src/almacen.js`, `src/repaso.js`, `src/verificar.js`, `src/rubricas/verificar-labs.js`, `src/teoria/verificar-teoria.js`, `src/asistente.js`, `src/reporte.js`, `plataforma/**`, `README.md` |
| motor-ruta | `curso-aws-practitioner/public/app.js`, `public/estilos.css`, `public/index.html`, `public/docente.*`, `public/contenido.js`, `app.js`, `src/*.js` salvo los bancos `practicaN.js`, `README.md` |
| contenido-s8 | `curso-aws-practitioner/public/sesion8.js`, `src/practica8.js` |
| auditor-sN | `curso-aws-practitioner/public/sesionN.js`, `src/practicaN.js` (o `practica.js` para la 1) |
