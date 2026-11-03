// El examen de práctica de la sesión 13 (Práctica 5: la universidad migra a la
// nube, el ensayo del final): 20 preguntas nuevas al estilo del examen AWS
// Certified Cloud Practitioner (CLF-C02).
//
// - Ocho sobre la arquitectura del caso (Auto Scaling con ELB health checks,
//   RDS Multi-AZ y snapshots, EFS, Deep Archive, el rol mínimo y el NAT) y
//   doce sobre lo que agrega la lección s13-examen: las 7 R, el CAF,
//   Application Migration Service, SCT, DataSync, Outposts, Elastic Disaster
//   Recovery y los servicios de IA (Bedrock, SageMaker AI, Textract, Polly y
//   Translate).
// - `sesion` dice de qué sesión de la Ruta sale cada pregunta: 2 a 6 para lo
//   que ya se vio ahí, 13 para lo nuevo de hoy.
// - Dos son de respuesta múltiple («Elige DOS», 5 opciones), como en el examen
//   real. Las otras 18 llevan la clave balanceada (A 5, B 4, C 5, D 4, sin
//   rachas de tres) y la correcta casi nunca es la opción más larga.
// - No repite los escenarios de otros bancos: el rehost del hospital, el
//   replatform a Beanstalk, los beneficios del CAF, Transcribe con Comprehend,
//   los 100 TB en Snowball y la VPN de respaldo ya salen en las sesiones 3, 4,
//   5 y 8.
// - Datos revisados en la documentación de AWS (noviembre de 2026).
//
// Corre `npm run verificar` si cambias algo.

export const TEMAS = ['El portal en AWS', 'Estrategias de migración', 'Mover los datos', 'Híbrido y borde', 'Inteligencia artificial'];

// 20 preguntas en 15 minutos, con la escala del examen real (700 de 1000).
export const MINUTOS = 15;
export const ESCALA = { maximo: 1000, aprueba: 700 };

// Qué lecciones de la Ruta repasar cuando un tema sale bajo.
export const REPASO = {
  'El portal en AWS': ['s13-caso', 's13-practica', 's6-balanceadores', 's5-disponibilidad', 's4-discos'],
  'Estrategias de migración': ['s13-examen', 's13-ex-7r', 's8-extras'],
  'Mover los datos': ['s13-examen', 's4-mover', 's5-otras'],
  'Híbrido y borde': ['s13-examen', 's3-conectar', 's1-global'],
  'Inteligencia artificial': ['s13-examen', 's8-extras']
};

// Lo que se muestra antes de empezar y en el desplegable de cada pregunta.
export const CASO = `
  <p>Este examen se parece al de la certificación <strong>AWS Certified Cloud Practitioner (CLF-C02)</strong>. Mezcla la arquitectura del portal de la universidad con los temas que faltaban: migración, nube híbrida y borde, e inteligencia artificial.</p>
  <ul>
    <li>En el examen real son <strong>65 preguntas en 90 minutos</strong> y se aprueba con <strong>700 de 1000</strong>. Hoy son 20 en unos 15 minutos.</li>
    <li>Busca la <strong>palabra clave</strong>: “tal cual”, “ajustes mínimos”, “SaaS”, “ya nadie lo usa”, “SFTP”, “copiar por la red”, “en mi edificio”, “5G”, “modelos fundacionales”, “documentos escaneados”…</li>
    <li>Las de <strong>respuesta múltiple</strong> dicen «(Elige DOS.)» y solo cuentan si marcas las dos correctas.</li>
  </ul>`;

export const PREGUNTAS = [
  {
    id: 'p01',
    tema: 'El portal en AWS',
    sesion: 6,
    concepto: 'ELB health checks en Auto Scaling',
    texto: 'En el portal de la universidad, la aplicación de un servidor se colgó y ya no contesta, pero la instancia sigue en estado «running» y el grupo de Auto Scaling no la reemplaza. ¿Qué cambio hace que sí lo haga?',
    opciones: [
      'Subir a cuatro la capacidad deseada del grupo de Auto Scaling',
      'Activar en el grupo las revisiones de salud del balanceador (ELB health checks)',
      'Crear una alarma de CloudWatch que vigile la CPU de esa instancia',
      'Mover los servidores del portal a las subredes públicas'
    ],
    correcta: 1,
    explicacion: 'Por omisión, Auto Scaling solo usa las revisiones de estado de EC2, que ven si la máquina está viva, no si la aplicación responde. Con las ELB health checks, cuando el balanceador marca al servidor como no sano, el grupo lo termina y lanza otro. Más capacidad no arregla el servidor colgado, y una alarma solo avisa.'
  },
  {
    id: 'p02',
    tema: 'Estrategias de migración',
    sesion: 13,
    concepto: 'Migración: retire',
    texto: 'Al hacer el inventario para migrar, la universidad descubre que el servidor del viejo sistema de encuestas no lo abre nadie desde 2021. ¿Qué estrategia de migración le corresponde?',
    opciones: ['Realojar (rehost)', 'Retener (retain)', 'Recomprar (repurchase)', 'Retirar (retire)'],
    correcta: 3,
    explicacion: 'Retire es apagar lo que ya no aporta: ahorra licencias, parches y costos, y achica la migración. Retain sería dejarlo donde está por ahora porque todavía se usa o aún no se puede mover. Rehost y repurchase gastarían dinero en algo que nadie usa.'
  },
  {
    id: 'p03',
    tema: 'El portal en AWS',
    sesion: 5,
    concepto: 'Conmutación por error de RDS Multi-AZ',
    texto: 'La base del kardex es Amazon RDS con Multi-AZ. Un día falla la zona de disponibilidad donde está la base principal. ¿Qué pasa?',
    opciones: [
      'RDS cambia sola a la copia en espera de la otra zona y el endpoint sigue siendo el mismo',
      'La base queda fuera de línea hasta que alguien restaure el último snapshot manual',
      'Una réplica de lectura en otra región se vuelve la principal sin que nadie intervenga',
      'El grupo de Auto Scaling del portal lanza una base de datos nueva en la otra zona'
    ],
    correcta: 0,
    explicacion: 'Con Multi-AZ, RDS mantiene una copia en espera sincronizada en otra zona. Si la principal falla, RDS la promueve sola, por lo general en uno o dos minutos, y el nombre DNS del endpoint apunta a ella: la aplicación no cambia su configuración. Auto Scaling maneja instancias EC2, no bases de datos.'
  },
  {
    id: 'p04',
    tema: 'Inteligencia artificial',
    sesion: 13,
    concepto: 'Amazon Bedrock',
    texto: 'La universidad quiere que su portal tenga un asistente que redacte respuestas sobre trámites usando modelos fundacionales de Amazon y de otras empresas, con una sola API y sin administrar servidores ni entrenar un modelo desde cero. ¿Qué servicio usa?',
    opciones: ['Amazon SageMaker AI', 'Amazon Comprehend', 'Amazon Bedrock', 'Amazon Rekognition'],
    correcta: 2,
    explicacion: 'Amazon Bedrock da acceso administrado a modelos fundacionales (de Amazon, Anthropic, Meta, Mistral y otros) por una sola API, y permite personalizarlos con tus datos. SageMaker AI es para construir y entrenar tus propios modelos; Comprehend analiza textos y Rekognition, imágenes.'
  },
  {
    id: 'p05',
    tema: 'El portal en AWS',
    sesion: 4,
    concepto: 'Amazon EFS compartido',
    texto: 'Un servidor del portal genera la constancia en PDF de un alumno y, minutos después, el alumno la descarga desde otro servidor del grupo, que puede estar en la otra zona. ¿Dónde conviene guardar las constancias para que todos los servidores las vean?',
    opciones: [
      'En un sistema de archivos Amazon EFS montado en todos los servidores',
      'En un volumen EBS gp3 conectado a cada servidor del grupo',
      'En el almacén de instancia (instance store) de cada servidor',
      'En la clase S3 Glacier Deep Archive del bucket de actas'
    ],
    correcta: 0,
    explicacion: 'EFS es una carpeta compartida por NFS que muchas instancias montan al mismo tiempo, desde varias zonas. Un volumen EBS normal se conecta a una sola instancia de su misma zona, el instance store se pierde al detener o terminar la instancia y Deep Archive tarda horas en devolver un archivo.'
  },
  {
    id: 'p06',
    tema: 'Mover los datos',
    sesion: 13,
    concepto: 'AWS DataSync',
    texto: 'Antes del cambio, el área de TI debe copiar 30 TB de un servidor de archivos NFS del campus a Amazon S3 por su enlace de red, con transferencias programadas y revisando que cada archivo llegue íntegro. ¿Qué servicio usa?',
    opciones: ['AWS Transfer Family', 'AWS Storage Gateway', 'Amazon CloudFront', 'AWS DataSync'],
    correcta: 3,
    explicacion: 'DataSync copia datos por la red entre tu almacenamiento (NFS, SMB, HDFS u objetos) y S3, EFS o FSx: programa las copias, cifra en tránsito y verifica la integridad. Transfer Family recibe archivos que mandan otros por SFTP o FTP, y Storage Gateway da un acceso híbrido de todos los días, no una mudanza.'
  },
  {
    id: 'p07',
    tema: 'El portal en AWS',
    sesion: 6,
    concepto: 'Sobrevivir a la caída de una zona',
    texto: 'Si una zona de disponibilidad completa de us-east-1 falla, ¿qué dos decisiones de la arquitectura mantienen en línea el portal y su base? (Elige DOS.)',
    opciones: [
      'La base de Amazon RDS con Multi-AZ',
      'El presupuesto mensual en AWS Budgets',
      'La alarma de CloudWatch que avisa por SNS',
      'El grupo de Auto Scaling con subredes en dos zonas, detrás del balanceador',
      'El versionado del bucket de las actas'
    ],
    correcta: [0, 3],
    elige: 2,
    explicacion: 'El balanceador deja de mandar tráfico a la zona caída y Auto Scaling repone los servidores en la que sigue viva; RDS Multi-AZ cambia sola a la copia en espera. La alarma y el presupuesto avisan, pero no mantienen nada en línea, y el versionado protege contra borrados, no contra la caída de una zona.'
  },
  {
    id: 'p08',
    tema: 'Híbrido y borde',
    sesion: 13,
    concepto: 'AWS Outposts',
    texto: 'El hospital universitario debe procesar los estudios de sus pacientes dentro de su propio edificio, pero quiere usar los mismos servicios, API y consola de AWS que el resto de la universidad. ¿Qué le conviene?',
    opciones: ['AWS Local Zones', 'AWS Outposts', 'AWS Direct Connect', 'AWS Wavelength'],
    correcta: 1,
    explicacion: 'Outposts instala racks de AWS administrados por AWS en tu propio centro de datos, con los mismos servicios y API. Local Zones y Wavelength siguen siendo infraestructura de AWS (en una ciudad o en la red 5G), y Direct Connect es solo una conexión de red.'
  },
  {
    id: 'p09',
    tema: 'El portal en AWS',
    sesion: 4,
    concepto: 'Tiempo de recuperación de Deep Archive',
    texto: 'La SEP pide un acta de titulación de 2019 que ya está en S3 Glacier Deep Archive. Con la recuperación estándar, ¿en cuánto tiempo suele estar lista para descargarse?',
    opciones: [
      'En milisegundos, igual que en S3 Standard',
      'Entre 1 y 5 minutos',
      'En un plazo de hasta 12 horas',
      'Hasta 30 días después de pedirla'
    ],
    correcta: 2,
    explicacion: 'Deep Archive es la clase más barata de S3, para lo que casi nunca se consulta: la recuperación estándar tarda hasta 12 horas y la masiva (bulk), hasta 48. Por eso le sirve a las actas: la SEP puede esperar un día. Para minutos existe la recuperación expedita de Glacier Flexible Retrieval, y para milisegundos, Glacier Instant Retrieval.'
  },
  {
    id: 'p10',
    tema: 'Estrategias de migración',
    sesion: 13,
    concepto: 'Perspectivas del AWS CAF',
    texto: 'Según el AWS Cloud Adoption Framework (AWS CAF), ¿qué perspectiva se ocupa de capacitar al personal de TI, cambiar la cultura de trabajo y preparar a los líderes de la universidad para la nube?',
    opciones: [
      'La perspectiva de personas (People)',
      'La perspectiva de plataforma (Platform)',
      'La perspectiva de operaciones (Operations)',
      'La perspectiva de seguridad (Security)'
    ],
    correcta: 0,
    explicacion: 'El CAF tiene seis perspectivas. People, una de las tres de negocio, cuida la cultura, la capacitación, la organización y el liderazgo del cambio. Platform se ocupa de la arquitectura e infraestructura, Operations de que los servicios funcionen día con día y Security de proteger datos y accesos.'
  },
  {
    id: 'p11',
    tema: 'Inteligencia artificial',
    sesion: 13,
    concepto: 'Amazon SageMaker AI',
    texto: 'Un grupo de investigación de la universidad quiere construir, entrenar y desplegar su propio modelo de aprendizaje automático para predecir qué alumnos están en riesgo de abandonar la carrera. ¿Qué servicio de AWS está hecho para eso?',
    opciones: ['Amazon Lex', 'Amazon Kendra', 'Amazon SageMaker AI', 'Amazon Polly'],
    correcta: 2,
    explicacion: 'SageMaker AI es la plataforma para preparar datos y construir, entrenar y desplegar modelos propios de aprendizaje automático. Lex hace chatbots, Kendra busca respuestas en documentos y Polly convierte texto en voz: los tres ya vienen entrenados.'
  },
  {
    id: 'p12',
    tema: 'El portal en AWS',
    sesion: 2,
    concepto: 'Rol de solo lectura para EC2',
    texto: 'Los servidores del portal deben leer las actas del bucket, pero no borrarlas, y nadie debe guardar llaves de acceso en el código. ¿Qué cumple las dos cosas?',
    opciones: [
      'Un usuario de IAM con AmazonS3ReadOnlyAccess cuyas llaves se copian en el User data',
      'Un rol de IAM con AmazonS3FullAccess puesto en la launch template',
      'Una política del bucket que deje leer las actas a cualquiera',
      'Un rol de IAM con AmazonS3ReadOnlyAccess puesto en la launch template'
    ],
    correcta: 3,
    explicacion: 'El rol da credenciales temporales que AWS renueva sola, sin llaves en el código, y AmazonS3ReadOnlyAccess solo deja leer: mínimo privilegio. Las llaves en el User data se pueden copiar, FullAccess permite borrar y una política pública expone las actas a internet.'
  },
  {
    id: 'p13',
    tema: 'Mover los datos',
    sesion: 13,
    concepto: 'AWS SCT y DMS Schema Conversion',
    texto: 'El sistema de la biblioteca usa una base Oracle y la universidad quiere pasarla a Amazon Aurora PostgreSQL. ¿Qué convierte el esquema y el código de la base, como los procedimientos almacenados, al nuevo motor?',
    opciones: [
      'AWS DataSync',
      'AWS Schema Conversion Tool (AWS SCT) o DMS Schema Conversion',
      'AWS Snowball Edge',
      'AWS Storage Gateway'
    ],
    correcta: 1,
    explicacion: 'Cuando la base cambia de motor, AWS SCT (o DMS Schema Conversion, su versión dentro de DMS) traduce el esquema, las vistas y los procedimientos; después DMS copia los datos. DataSync y Snowball Edge mueven archivos, y Storage Gateway conecta almacenamiento local con la nube.'
  },
  {
    id: 'p14',
    tema: 'Estrategias de migración',
    sesion: 13,
    concepto: 'Migración: repurchase',
    texto: 'La universidad apaga su servidor de correo propio y contrata un servicio de correo institucional en la nube que paga por suscripción. ¿Qué estrategia de migración es?',
    opciones: ['Realojar (rehost)', 'Refactorizar (refactor)', 'Recomprar (repurchase)', 'Redefinir la plataforma (replatform)'],
    correcta: 2,
    explicacion: 'Repurchase es cambiar el software por otro producto, casi siempre un SaaS que se paga por suscripción. Rehost movería el mismo servidor a EC2, replatform lo movería con pequeños ajustes y refactor reescribiría la aplicación.'
  },
  {
    id: 'p15',
    tema: 'El portal en AWS',
    sesion: 3,
    concepto: 'Salida a internet desde subredes privadas',
    texto: 'Los servidores del portal viven en subredes privadas y no tienen IP pública, pero al arrancar descargan Apache con dnf desde internet. ¿Qué les permite salir sin que nadie de internet pueda iniciar una conexión hacia ellos?',
    opciones: [
      'Un NAT gateway en una subred pública',
      'Una dirección IP elástica en cada servidor del portal',
      'Una ruta de las subredes privadas que va directo al Internet Gateway',
      'Un VPC peering con la VPC por omisión de la cuenta'
    ],
    correcta: 0,
    explicacion: 'Con la ruta 0.0.0.0/0 de las subredes privadas apuntando a un NAT gateway en una subred pública, los servidores pueden salir a internet, pero nadie de afuera puede abrir una conexión hacia ellos. Una IP elástica o una ruta directa al Internet Gateway los volverían alcanzables desde internet, y el peering no da salida a internet.'
  },
  {
    id: 'p16',
    tema: 'Inteligencia artificial',
    sesion: 13,
    concepto: 'Amazon Textract',
    texto: 'La universidad tiene miles de actas antiguas escaneadas y quiere sacar de ellas, de forma automática, el texto, las tablas de calificaciones y los campos del formulario. ¿Qué servicio usa?',
    opciones: ['Amazon Translate', 'Amazon Textract', 'Amazon Transcribe', 'Amazon Comprehend'],
    correcta: 1,
    explicacion: 'Textract extrae texto impreso y a mano, tablas y campos de formularios de documentos escaneados. Translate traduce, Transcribe convierte audio en texto y Comprehend analiza un texto que ya tienes (sentimiento, temas, entidades).'
  },
  {
    id: 'p17',
    tema: 'Estrategias de migración',
    sesion: 13,
    concepto: 'AWS Application Migration Service',
    texto: 'Para el rehost del portal, la universidad necesita replicar a AWS el disco del servidor de la rectoría de forma continua, probar la copia y hacer el corte final con solo unos minutos fuera de línea. ¿Qué servicio está hecho para eso?',
    opciones: [
      'AWS Database Migration Service (AWS DMS)',
      'AWS DataSync',
      'AWS Transfer Family',
      'AWS Application Migration Service'
    ],
    correcta: 3,
    explicacion: 'Application Migration Service replica a nivel de bloque servidores completos (sistema operativo, aplicaciones y datos) mientras siguen funcionando, lanza instancias de prueba y hace el corte en minutos: es la herramienta del rehost. DMS migra solo bases de datos, y DataSync y Transfer Family mueven archivos.'
  },
  {
    id: 'p18',
    tema: 'El portal en AWS',
    sesion: 5,
    concepto: 'Snapshot manual de RDS',
    texto: 'Antes de mudar los datos, el equipo saca un snapshot manual de la base del kardex. ¿Qué lo distingue de los respaldos automáticos de RDS?',
    opciones: [
      'Se copia solo a otra región y no paga almacenamiento',
      'Permite recuperar la base a cualquier segundo de los últimos días',
      'Se conserva hasta que alguien lo borra, sin importar el periodo de retención',
      'Solo se puede sacar si la base no tiene Multi-AZ'
    ],
    correcta: 2,
    explicacion: 'Los respaldos automáticos se borran solos al pasar su periodo de retención (hasta 35 días) y son los que permiten la recuperación a un punto en el tiempo. Un snapshot manual se queda hasta que tú lo borras, aunque elimines la base: es la foto ideal antes de una mudanza. Sí ocupa almacenamiento que se cobra.'
  },
  {
    id: 'p19',
    tema: 'Híbrido y borde',
    sesion: 13,
    concepto: 'AWS Elastic Disaster Recovery',
    texto: 'Mientras termina de mudarse, la universidad quiere que, si se cae el centro de datos del campus, sus servidores se levanten en AWS en minutos y con datos de hace solo unos segundos. ¿Qué servicio replica esos servidores continuamente para lograrlo?',
    opciones: ['AWS Elastic Disaster Recovery', 'AWS Backup con un respaldo diario', 'AWS Outposts', 'AWS Site-to-Site VPN'],
    correcta: 0,
    explicacion: 'Elastic Disaster Recovery replica de forma continua los servidores del campus (o de otra nube) a AWS y, si el sitio falla, los levanta en minutos con datos de hace segundos. Un respaldo diario de AWS Backup perdería hasta un día de datos, Outposts pone racks de AWS dentro del mismo edificio que se cayó y la VPN solo conecta redes.'
  },
  {
    id: 'p20',
    tema: 'Inteligencia artificial',
    sesion: 13,
    concepto: 'Amazon Polly y Amazon Translate',
    texto: 'Para los alumnos con discapacidad visual, el portal debe leer en voz alta los avisos, y para los alumnos de intercambio debe mostrarlos también en inglés. ¿Qué servicios usa? (Elige DOS.)',
    opciones: ['Amazon Transcribe', 'Amazon Polly', 'Amazon Rekognition', 'Amazon Translate', 'Amazon Lex'],
    correcta: [1, 3],
    elige: 2,
    explicacion: 'Polly convierte texto en voz natural y Translate traduce el texto a otro idioma. Transcribe hace lo contrario de Polly (voz a texto), Rekognition analiza imágenes y Lex sirve para armar chatbots.'
  }
];
