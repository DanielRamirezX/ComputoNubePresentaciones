// El examen de práctica de la sesión 11 (Práctica 3: el festival y sus
// boletos): 20 preguntas nuevas al estilo del examen AWS Certified Cloud
// Practitioner (CLF-C02), casi todas del dominio de tecnología.
//
// - La mitad sobre el caso (S3 con CloudFront, Route 53, DynamoDB, SQS,
//   Lambda, SNS y CloudWatch) y la otra mitad sobre lo que agrega la lección
//   s11-examen (API Gateway, Step Functions, Kinesis, Athena, Glue,
//   Amazon Quick, EMR, OpenSearch, Fargate y ElastiCache).
// - `sesion` dice de qué sesión de la Ruta sale cada pregunta: 3, 5 y 6 para
//   lo que ya se vio ahí, 11 para lo nuevo de hoy.
// - Dos son de respuesta múltiple («Elige DOS», 5 opciones), como en el examen
//   real. Las otras 18 llevan la clave balanceada (A 5, B 4, C 5, D 4, sin
//   rachas de tres) y la correcta casi nunca es la opción más larga.
// - Ninguna repite el escenario de otro banco de la Ruta: desacoplar con SQS,
//   el fan-out de SNS, la regla nocturna de EventBridge, los clics en tiempo
//   real con Kinesis, la API REST con límite por cliente, OAC, DAX y el modo
//   On-demand ya salen en las sesiones 5, 6 y 8.
// - Datos revisados en la documentación de AWS (noviembre de 2026).
//
// Corre `npm run verificar` si cambias algo.

export const TEMAS = ['El sitio y los boletos', 'Colas, funciones y avisos', 'Orquestar, API y contenedores', 'Datos y analítica'];

// 20 preguntas en 15 minutos, con la escala del examen real (700 de 1000).
export const MINUTOS = 15;
export const ESCALA = { maximo: 1000, aprueba: 700 };

// Qué lecciones de la Ruta repasar cuando un tema sale bajo.
export const REPASO = {
  'El sitio y los boletos': ['s11-caso', 's11-practica', 's3-borde', 's5-nosql'],
  'Colas, funciones y avisos': ['s11-caso', 's11-practica', 's6-serverless', 's6-monitorear'],
  'Orquestar, API y contenedores': ['s11-examen', 's11-ex-servicio', 's6-serverless'],
  'Datos y analítica': ['s11-examen', 's11-ex-servicio', 's5-otras', 's8-extras']
};

// Lo que se muestra antes de empezar y en el desplegable de cada pregunta.
export const CASO = `
  <p>Este examen se parece al de la certificación <strong>AWS Certified Cloud Practitioner (CLF-C02)</strong>. Casi todo es del dominio de <strong>tecnología y servicios de la nube</strong>, el más pesado del examen (34&nbsp;%).</p>
  <ul>
    <li>En el examen real son <strong>65 preguntas en 90 minutos</strong> y se aprueba con <strong>700 de 1000</strong>. Hoy son 20 en unos 15 minutos.</li>
    <li>Busca la <strong>palabra clave</strong>: “desacoplar”, “en orden”, “tiempo real”, “SQL sobre S3”, “ETL”, “tableros”, “orquestar”, “publicar una API”, “Kubernetes”, “en memoria”…</li>
    <li>Las de <strong>respuesta múltiple</strong> dicen «(Elige DOS.)» y solo cuentan si marcas las dos correctas.</li>
  </ul>`;

export const PREGUNTAS = [
  {
    id: 'p01',
    tema: 'El sitio y los boletos',
    sesion: 3,
    concepto: 'Invalidaciones de CloudFront',
    texto: 'Un festival cambió el cartel de su sitio en el bucket de S3, pero muchos visitantes siguen viendo el cartel viejo porque CloudFront tiene guardada la copia anterior. ¿Qué hace para que se vea el nuevo cuanto antes?',
    opciones: [
      'Borrar la distribución de CloudFront y crearla de nuevo',
      'Activar el versionado del bucket de S3',
      'Crear una invalidación en CloudFront para ese archivo',
      'Cambiar la clase de almacenamiento del cartel a S3 Standard-IA'
    ],
    correcta: 2,
    explicacion: 'Una invalidación le dice a CloudFront que borre de sus ubicaciones de borde la copia de esos archivos; la siguiente petición la va a buscar al origen. Borrar la distribución cambiaría su dominio y tardaría mucho más, y el versionado de S3 no toca la caché.'
  },
  {
    id: 'p02',
    tema: 'El sitio y los boletos',
    sesion: 3,
    concepto: 'Registro Alias de Route 53',
    texto: 'Un festival quiere que su dominio raíz, sin www, abra su distribución de Amazon CloudFront, y no quiere pagar por esas consultas de DNS. ¿Qué registro crea en Route 53?',
    opciones: [
      'Un registro A de tipo Alias que apunte a la distribución',
      'Un registro CNAME en el dominio raíz que apunte a la distribución',
      'Un registro MX con el dominio de la distribución',
      'Un registro A con las direcciones IP que hoy tiene CloudFront'
    ],
    correcta: 0,
    explicacion: 'Un Alias puede vivir en el dominio raíz (un CNAME no), sigue a la distribución aunque cambien sus IP y Route 53 no cobra las consultas a un Alias que apunta a CloudFront. Escribir IP fijas fallaría en cuanto CloudFront las cambie.'
  },
  {
    id: 'p03',
    tema: 'El sitio y los boletos',
    sesion: 11,
    concepto: 'Llave compuesta de DynamoDB',
    texto: 'En una tabla de DynamoDB, la taquilla quiere traer de una sola consulta todos los asientos de un evento, ordenados por número de asiento. ¿Qué llave primaria le conviene a la tabla?',
    opciones: [
      'Solo una partition key con el número de asiento',
      'Una partition key con el correo del comprador',
      'Una llave aleatoria y un Scan con filtro por evento',
      'Partition key: el evento. Sort key: el asiento.'
    ],
    correcta: 3,
    explicacion: 'Con una llave compuesta, todos los ítems de un mismo evento quedan juntos (misma partition key) y ordenados por la sort key, así que un Query los trae de una vez. Un Scan lee la tabla completa: es lento y gasta mucha más capacidad.'
  },
  {
    id: 'p04',
    tema: 'El sitio y los boletos',
    sesion: 11,
    concepto: 'Índice global secundario (GSI)',
    texto: 'La tabla de boletos tiene como llave el evento y el asiento. Ahora los compradores piden la opción «ver mis boletos» escribiendo su correo. ¿Qué agrega el equipo para buscarlos sin leer toda la tabla?',
    opciones: [
      'Una réplica de la tabla en otra región',
      'Más capacidad de lectura en modo provisionado',
      'Un caché de Amazon ElastiCache delante de la tabla',
      'Un índice global secundario cuya partition key sea el correo'
    ],
    correcta: 3,
    explicacion: 'Un índice global secundario (GSI) organiza los mismos ítems con otra llave, aquí el correo, y permite hacer Query sobre él. Sin el índice habría que hacer un Scan de toda la tabla, por más capacidad o caché que se agregue.'
  },
  {
    id: 'p05',
    tema: 'Colas, funciones y avisos',
    sesion: 11,
    concepto: 'Visibility timeout de SQS',
    texto: 'Una función Lambda tarda hasta 45 segundos en cobrar cada pedido que saca de una cola SQS, y algunos clientes aparecen cobrados dos veces porque el pedido vuelve a la cola antes de terminar. ¿Qué ajusta el equipo?',
    opciones: [
      'Cambia la cola a una de tipo FIFO con el mismo nombre',
      'Baja el periodo de retención de la cola a un minuto',
      'Sube el visibility timeout a más de 45 segundos',
      'Le quita el cifrado a la cola para que entregue más rápido'
    ],
    correcta: 2,
    explicacion: 'Mientras alguien procesa un mensaje, SQS lo esconde durante el visibility timeout (30 segundos por omisión). Si la función tarda más, el mensaje reaparece y otro lo vuelve a procesar. Por eso el visibility timeout debe ser mayor que el timeout de la función.'
  },
  {
    id: 'p06',
    tema: 'Colas, funciones y avisos',
    sesion: 6,
    concepto: 'Cómo cobra AWS Lambda',
    texto: 'La taquilla de un festival solo tiene movimiento unos días al año. ¿Cómo le cobra AWS Lambda por la función que procesa los pedidos?',
    opciones: [
      'Por el número de ejecuciones y el tiempo que corre cada una, según su memoria',
      'Una cuota mensual fija por cada función creada en la cuenta',
      'Por cada hora que la función está desplegada, aunque nadie la llame',
      'Por el tamaño del código que subiste, aunque no se ejecute'
    ],
    correcta: 0,
    explicacion: 'Lambda cobra por número de solicitudes y por duración (en milisegundos, según la memoria que le asignes). Si nadie la llama, no se cobra la ejecución: por eso conviene a cargas con picos y ratos sin uso.'
  },
  {
    id: 'p07',
    tema: 'Orquestar, API y contenedores',
    sesion: 11,
    concepto: 'AWS Step Functions',
    texto: 'Comprar un boleto implica apartar el asiento, cobrar y mandar el boleto por correo, en ese orden. Si el cobro falla, hay que reintentarlo dos veces y luego liberar el asiento, y el equipo quiere ver en un diagrama en qué paso va cada compra. ¿Qué servicio coordina ese proceso?',
    opciones: [
      'Amazon SNS',
      'AWS Step Functions',
      'AWS Glue',
      'Amazon Kinesis Data Streams'
    ],
    correcta: 1,
    explicacion: 'Step Functions orquesta flujos de varios pasos como una máquina de estados visual: define el orden, las decisiones, los reintentos y qué hacer cuando un paso falla, y llama a funciones Lambda y otros servicios.'
  },
  {
    id: 'p08',
    tema: 'Colas, funciones y avisos',
    sesion: 6,
    concepto: 'Beneficios de una cola SQS',
    texto: 'Un festival pone una cola de Amazon SQS entre su página de compra y la función que cobra los pedidos. ¿Qué dos beneficios obtiene? (Elige DOS.)',
    opciones: [
      'Si la función se cae o se satura, los pedidos esperan en la cola en vez de perderse',
      'Cada pedido se procesa exactamente una vez y en el orden en que llegó, con cualquier tipo de cola',
      'Ya no necesita guardar los boletos en una base de datos',
      'La página y la función escalan y fallan por separado, sin esperarse una a la otra',
      'La cola cifra el tráfico entre el navegador del comprador y la página'
    ],
    correcta: [0, 3],
    elige: 2,
    explicacion: 'La cola amortigua los picos y desacopla las partes: los pedidos se guardan (hasta 14 días) mientras la función los procesa a su ritmo, y cada parte escala por su cuenta. El orden estricto y procesar una sola vez son de las colas FIFO; una Standard puede entregar un mensaje más de una vez.'
  },
  {
    id: 'p09',
    tema: 'Datos y analítica',
    sesion: 11,
    concepto: 'Amazon Kinesis Data Streams',
    texto: 'Las pulseras de acceso de 40 000 asistentes mandan una lectura cada vez que alguien cruza una puerta. Tres sistemas distintos (aforo, seguridad y patrocinadores) deben leer esas lecturas en tiempo real, y poder volver a leer las de las últimas horas. ¿Qué servicio recibe el flujo?',
    opciones: [
      'Amazon S3 Glacier Flexible Retrieval',
      'Amazon Kinesis Data Streams',
      'Amazon SNS con suscripciones de correo',
      'Amazon Athena'
    ],
    correcta: 1,
    explicacion: 'Kinesis Data Streams recibe datos en tiempo real y los guarda en orden (24 horas por omisión, hasta 365 días), así que varias aplicaciones pueden leer el mismo flujo, cada una a su paso, y volver a leerlo. Athena consulta archivos que ya están en S3, no un flujo en vivo.'
  },
  {
    id: 'p10',
    tema: 'Orquestar, API y contenedores',
    sesion: 11,
    concepto: 'API Gateway: claves y planes de uso',
    texto: 'Tres boleteras asociadas consultarán la disponibilidad de asientos del festival con una URL HTTPS que llama a una función Lambda. El festival quiere darle a cada boletera su propia clave y una cuota mensual de consultas. ¿Qué usa?',
    opciones: [
      'Amazon API Gateway con claves de API y planes de uso',
      'Una cola SQS distinta para cada boletera',
      'Un Network Load Balancer con un listener por boletera',
      'Un usuario de IAM con AdministratorAccess por boletera'
    ],
    correcta: 0,
    explicacion: 'API Gateway publica la API delante de Lambda y, con claves de API y planes de uso (usage plans), controla cuántas peticiones puede hacer cada cliente por segundo y por mes. Un balanceador reparte tráfico entre servidores, pero no maneja cuotas por cliente.'
  },
  {
    id: 'p11',
    tema: 'Colas, funciones y avisos',
    sesion: 11,
    concepto: 'Cola de mensajes muertos (DLQ)',
    texto: 'Un pedido mal escrito hace fallar a la función que procesa la cola. El mensaje regresa a la cola y vuelve a fallar una y otra vez, gastando ejecuciones. ¿Qué configura el equipo para apartarlo y revisarlo a mano?',
    opciones: [
      'Un tema de SNS que reenvíe el pedido a todos los suscriptores',
      'Un timeout de 15 minutos en la función Lambda',
      'Una cola de mensajes muertos (dead-letter queue) con un máximo de intentos',
      'Una regla de EventBridge que borre la cola cada noche'
    ],
    correcta: 2,
    explicacion: 'Con una dead-letter queue, cuando un mensaje se recibe más veces que el máximo (Maximum receives), SQS lo mueve a otra cola. Así deja de ciclarse y alguien puede revisarlo. Subir el timeout no arregla un mensaje mal escrito.'
  },
  {
    id: 'p12',
    tema: 'Datos y analítica',
    sesion: 5,
    concepto: 'Amazon Athena',
    texto: 'Al terminar el festival, 50 000 respuestas de la encuesta de satisfacción quedaron en archivos JSON dentro de un bucket de S3. La dueña quiere preguntarles con SQL qué escenario gustó más, sin montar ni administrar una base de datos. ¿Qué servicio usa?',
    opciones: [
      'Amazon RDS for MySQL',
      'Amazon EMR con un clúster de Hadoop',
      'Amazon ElastiCache',
      'Amazon Athena'
    ],
    correcta: 3,
    explicacion: 'Athena ejecuta SQL directo sobre los archivos en S3 (CSV, JSON, Parquet…), sin servidores ni cargas previas, y cobra por los datos que lee cada consulta. RDS obligaría a crear una base y cargar los datos; EMR es para procesar volúmenes enormes con Spark o Hadoop.'
  },
  {
    id: 'p13',
    tema: 'Colas, funciones y avisos',
    sesion: 11,
    concepto: 'Colas FIFO de SQS',
    texto: 'Un cliente puede apartar, cambiar y cancelar su asiento en segundos. Esos tres mensajes deben procesarse justo en el orden en que llegaron y ninguno debe procesarse dos veces. ¿Qué tipo de cola usa el festival?',
    opciones: [
      'Una cola Standard con la retención en 14 días',
      'Una cola FIFO de Amazon SQS',
      'Un tema Standard de Amazon SNS',
      'Una cola Standard con cifrado SSE-SQS'
    ],
    correcta: 1,
    explicacion: 'Las colas FIFO (su nombre termina en .fifo) respetan el orden de llegada y procesan cada mensaje una sola vez. Las Standard aguantan más volumen, pero el orden es aproximado y pueden entregar un mensaje más de una vez.'
  },
  {
    id: 'p14',
    tema: 'Orquestar, API y contenedores',
    sesion: 6,
    concepto: 'Fargate y la responsabilidad compartida',
    texto: 'La app de reventa oficial del festival corre en contenedores de Amazon ECS. Si el equipo cambia de instancias EC2 a AWS Fargate, ¿qué deja de ser su responsabilidad?',
    opciones: [
      'Escribir el código de la app y construir la imagen del contenedor',
      'Decidir cuánta CPU y memoria necesita cada contenedor',
      'Parchar y escalar los servidores de los contenedores',
      'Proteger los datos de los clientes que guarda la app'
    ],
    correcta: 2,
    explicacion: 'Con Fargate, AWS pone, parcha y escala la máquina donde corre cada contenedor: tú solo indicas CPU y memoria. El código, la imagen y los datos de los clientes siguen siendo tu parte del modelo de responsabilidad compartida.'
  },
  {
    id: 'p15',
    tema: 'Datos y analítica',
    sesion: 11,
    concepto: 'AWS Glue',
    texto: 'Las ventas llegan de tres boleteras, cada una con su propio formato de archivo y nombres de columna. Antes de analizarlas, el festival quiere limpiarlas, unirlas en un solo formato y registrar qué tablas y columnas hay, sin administrar servidores. ¿Qué servicio usa?',
    opciones: [
      'AWS Glue',
      'Amazon Quick',
      'Amazon Route 53',
      'AWS Step Functions'
    ],
    correcta: 0,
    explicacion: 'AWS Glue es un servicio de ETL (extraer, transformar y cargar) sin servidores, y su Data Catalog guarda la descripción de las tablas y columnas para que Athena u otros servicios las consulten. Amazon Quick dibuja tableros, pero no limpia los datos.'
  },
  {
    id: 'p16',
    tema: 'El sitio y los boletos',
    sesion: 11,
    concepto: 'TTL de DynamoDB',
    texto: 'La tabla de apartados del festival acumula millones de registros vencidos de festivales pasados. El equipo quiere que DynamoDB los borre solo, sin escribir un programa de limpieza y sin gastar capacidad de escritura. ¿Qué activa?',
    opciones: [
      'La recuperación a un punto en el tiempo (PITR)',
      'Las tablas globales en una segunda región',
      'El modo de capacidad On-demand',
      'Time to Live (TTL) con un atributo de fecha de vencimiento'
    ],
    correcta: 3,
    explicacion: 'Con TTL, cada ítem guarda su fecha de vencimiento y DynamoDB lo borra solo unos días después de que vence, sin consumir capacidad de escritura. PITR sirve para restaurar la tabla, no para borrar ítems viejos.'
  },
  {
    id: 'p17',
    tema: 'Datos y analítica',
    sesion: 11,
    concepto: 'EMR y OpenSearch',
    texto: 'El área de datos del festival repasa los servicios de analítica. ¿Qué dos descripciones son correctas? (Elige DOS.)',
    opciones: [
      'AWS Glue dibuja tableros interactivos para la dirección',
      'Amazon EMR procesa grandes volúmenes de datos con clústeres de Apache Spark o Hadoop',
      'Amazon Athena recibe flujos de datos en tiempo real desde sensores',
      'Amazon Quick es un almacén de datos donde se guardan las ventas',
      'Amazon OpenSearch Service sirve para buscar en texto y analizar registros (logs)'
    ],
    correcta: [1, 4],
    elige: 2,
    explicacion: 'EMR monta clústeres administrados de big data (Spark, Hadoop, Hive…). OpenSearch Service indexa texto y registros para buscar y analizarlos casi en tiempo real. Los tableros son de Amazon Quick, los flujos en tiempo real de Kinesis y el almacén de datos es Redshift.'
  },
  {
    id: 'p18',
    tema: 'Datos y analítica',
    sesion: 11,
    concepto: 'Amazon Quick',
    texto: 'La dueña del festival quiere ver en su navegador gráficas interactivas de boletos vendidos por hora y por tipo, y compartirlas con sus socios sin instalar programas. ¿Qué servicio de AWS le arma esos tableros?',
    opciones: [
      'Amazon Kinesis Data Streams',
      'Amazon Quick',
      'AWS Glue Data Catalog',
      'Amazon CloudWatch Logs'
    ],
    correcta: 1,
    explicacion: 'Amazon Quick (antes QuickSight) es el servicio de inteligencia de negocios (BI) de AWS: tableros interactivos que se comparten en el navegador. Glue prepara los datos y Kinesis los recibe, pero ninguno dibuja tableros.'
  },
  {
    id: 'p19',
    tema: 'Colas, funciones y avisos',
    sesion: 6,
    concepto: 'Alarma sobre una cola SQS',
    texto: 'Si la función que procesa los pedidos empieza a fallar, los mensajes se acumulan en la cola. ¿Cómo se entera el equipo de guardia antes que los clientes?',
    opciones: [
      'Con un trail de CloudTrail que guarde en S3 cada llamada a la API de SQS',
      'Revisando cada hora la consola de SQS',
      'Con una alarma de CloudWatch sobre la cola que avise por SNS',
      'Activando el cifrado de la cola con una llave de KMS'
    ],
    correcta: 2,
    explicacion: 'SQS manda a CloudWatch métricas como ApproximateNumberOfMessagesVisible. Una alarma que pase a In alarm cuando ese número supera un umbral puede publicar en un tema de SNS y avisar por correo. CloudTrail registra llamadas a la API, no vigila la cola.'
  },
  {
    id: 'p20',
    tema: 'El sitio y los boletos',
    sesion: 5,
    concepto: 'Amazon ElastiCache',
    texto: 'La página de «asientos disponibles» de la tienda de recuerdos consulta su base de Amazon RDS miles de veces por segundo y casi siempre recibe el mismo resultado. La base va lenta. ¿Qué agregan para guardar ese resultado en memoria y aliviarla?',
    opciones: [
      'Amazon ElastiCache',
      'Amazon S3 Glacier Deep Archive',
      'Un trabajo ETL de AWS Glue',
      'Un tema de Amazon SNS'
    ],
    correcta: 0,
    explicacion: 'ElastiCache (Valkey, Redis OSS o Memcached) guarda en memoria los resultados que se piden mucho y responde en menos de un milisegundo, así la base recibe muchas menos consultas. DAX hace lo mismo, pero solo para DynamoDB.'
  }
];
