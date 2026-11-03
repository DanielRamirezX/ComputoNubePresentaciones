// El simulacro de la sesión 8: 65 preguntas nuevas al estilo del examen AWS
// Certified Cloud Practitioner (CLF-C02), en 90 minutos.
//
// - Los temas son los cuatro dominios oficiales, con el reparto de la guía:
//   Conceptos 24 % (16), Seguridad 30 % (19), Tecnología 34 % (22) y
//   Facturación 12 % (8). OBJETIVO lo deja escrito y `npm run verificar` lo revisa.
// - Cada pregunta dice de qué sesión de la Ruta sale (`sesion`), para el reporte
//   «Por sesión de la Ruta». La 0 son temas del examen que la Ruta no vio
//   (IA/ML, analítica, IaC, migración, recursos de soporte): se repasan en la
//   lección s8-extras. Reparto: S1 8 · S2 12 · S3 8 · S4 8 · S5 7 · S6 8 · S7 8 · fuera 6.
// - Cinco son de respuesta múltiple («Elige DOS», 5 opciones), como en el
//   examen real: se califican todo o nada. Las otras 60 llevan la clave
//   balanceada (15 por letra, sin rachas de tres) y la correcta casi nunca es la
//   opción más larga.
// - Ninguna repite una pregunta de los exámenes de las sesiones 1 a 7 ni de los
//   simulacros de evaluacion-aws: son escenarios nuevos.
// - Datos revisados contra la guía oficial del CLF-C02 y la documentación de AWS
//   (noviembre de 2026): Amazon Quick es el nombre nuevo de QuickSight y los
//   planes de soporte son Basic, Business Support+, Enterprise y Unified Operations.
//
// Corre `npm run verificar` si cambias algo.

export const TEMAS = ['Conceptos de la nube', 'Seguridad y cumplimiento', 'Tecnología y servicios', 'Facturación, precios y soporte'];

// Preguntas por dominio, con el peso de la guía oficial (lo revisa verificar).
export const OBJETIVO = {
  'Conceptos de la nube': 16,
  'Seguridad y cumplimiento': 19,
  'Tecnología y servicios': 22,
  'Facturación, precios y soporte': 8
};

// Como el examen real: 90 minutos y 700 de 1000 para aprobar.
export const MINUTOS = 90;
export const ESCALA = { maximo: 1000, aprueba: 700 };

// Qué lecciones de la Ruta repasar cuando un dominio sale bajo.
export const REPASO = {
  'Conceptos de la nube': ['s1-global', 's1-precios', 's6-elasticidad', 's7-buenas-practicas', 's8-extras'],
  'Seguridad y cumplimiento': ['s2-identidades', 's2-politicas', 's2-responsabilidad', 's2-servicios', 's3-vpc', 's4-seguridad', 's8-extras'],
  'Tecnología y servicios': ['s1-ec2', 's3-conectar', 's3-borde', 's4-s3', 's4-discos', 's5-relacionales', 's5-nosql', 's6-balanceadores', 's6-serverless', 's8-extras'],
  'Facturación, precios y soporte': ['s7-precios', 's1-precios', 's7-herramientas', 's7-soporte', 's8-extras']
};

// Lo que se muestra antes de empezar y en el desplegable de cada pregunta.
export const CASO = `
  <p>Este simulacro tiene la forma del examen <strong>AWS Certified Cloud Practitioner (CLF-C02)</strong>: <strong>65 preguntas</strong> de los cuatro dominios, con el mismo peso que en el examen real.</p>
  <ul>
    <li><strong>Tecnología y servicios</strong> 34&nbsp;% · <strong>Seguridad y cumplimiento</strong> 30&nbsp;% · <strong>Conceptos de la nube</strong> 24&nbsp;% · <strong>Facturación, precios y soporte</strong> 12&nbsp;%.</li>
    <li>Poco más de <strong>un minuto por pregunta</strong>. Si una te atora, contesta lo que creas y sigue: con la barra de arriba puedes volver a ella.</li>
    <li>Busca la <strong>palabra clave</strong>: “lo más barato”, “sin administrar servidores”, “de inmediato”, “auditar”, “en tiempo real”… y descarta primero las opciones que no la cumplen.</li>
  </ul>`;

export const PREGUNTAS = [
  {
    id: 'p01',
    tema: 'Conceptos de la nube',
    sesion: 1,
    concepto: 'Alcance global',
    texto: 'Una startup de Monterrey vende boletos en línea y quiere abrir operaciones en España el próximo mes, sin comprar ni rentar un centro de datos allá. ¿Qué beneficio de la nube de AWS aprovecha?',
    opciones: [
      'Desplegar en otra región del mundo en minutos',
      'Pasar el costo fijo de sus servidores a costo variable',
      'Recibir descuentos por volumen en S3',
      'Delegar a AWS la seguridad de sus aplicaciones'
    ],
    correcta: 0,
    explicacion:
      'AWS tiene regiones en muchos países: la startup puede lanzar su sistema en una región de Europa en minutos (“volverse global en minutos”). Pasar a costo variable es otro beneficio, pero no resuelve llegar a otro país; los descuentos por volumen no tienen que ver, y la seguridad de sus aplicaciones sigue siendo suya (responsabilidad compartida).'
  },
  {
    id: 'p02',
    tema: 'Seguridad y cumplimiento',
    sesion: 2,
    concepto: 'Amazon Inspector',
    texto: 'Cada vez que un equipo sube una imagen de contenedor nueva a Amazon ECR, quiere saber antes de desplegarla si trae paquetes con fallas de seguridad publicadas (CVE) y qué tan graves son. ¿Qué servicio lo revisa?',
    opciones: [
      'Amazon GuardDuty',
      'Amazon Macie',
      'Amazon Inspector',
      'AWS Shield Advanced'
    ],
    correcta: 2,
    explicacion:
      'Amazon Inspector escanea instancias EC2, imágenes de contenedor en ECR y funciones Lambda en busca de vulnerabilidades de software y puertos expuestos. GuardDuty detecta actividad maliciosa en los registros, no software vulnerable; Macie busca datos sensibles en S3, y Shield Advanced protege contra ataques DDoS.'
  },
  {
    id: 'p03',
    tema: 'Tecnología y servicios',
    sesion: 3,
    concepto: 'Ubicaciones de borde',
    texto: 'En la infraestructura global de AWS, ¿qué es una ubicación de borde (edge location)?',
    opciones: [
      'Una zona de disponibilidad pequeña que solo admite instancias EC2',
      'Un sitio donde CloudFront guarda copias del contenido cerca de los usuarios',
      'La región de respaldo que AWS asigna a cada cuenta para recuperarse de desastres',
      'El centro de datos del cliente conectado a AWS por Direct Connect'
    ],
    correcta: 1,
    explicacion:
      'Las ubicaciones de borde están en muchas más ciudades que las regiones; ahí CloudFront (y servicios como Route 53) atienden a los usuarios desde cerca, con menos latencia. No son zonas de disponibilidad para EC2, AWS no asigna una región de respaldo automática, y tu centro de datos no es parte de la infraestructura de AWS.'
  },
  {
    id: 'p04',
    tema: 'Facturación, precios y soporte',
    sesion: 7,
    concepto: 'Activar etiquetas de costos',
    texto: 'Una empresa etiquetó todos sus recursos con Area=Ventas o Area=Marketing, pero en Cost Explorer no puede agrupar el gasto por esa etiqueta. ¿Qué le falta?',
    opciones: [
      'Contratar el plan Business Support+ para poder ver las etiquetas en Cost Explorer',
      'Crear un presupuesto de AWS Budgets por cada área',
      'Mover cada área a su propia región de AWS',
      'Activar Area como etiqueta de asignación de costos en Billing'
    ],
    correcta: 3,
    explicacion:
      'Las etiquetas que tú creas solo aparecen en Cost Explorer y en los reportes de costos después de activarlas como etiquetas de asignación de costos en la consola de Billing (tarda hasta 24 horas). Ningún plan de soporte hace falta para eso; un presupuesto avisa del gasto pero no agrupa, y cambiar de región no reparte el costo por área.'
  },
  {
    id: 'p05',
    tema: 'Tecnología y servicios',
    sesion: 5,
    concepto: 'Cuándo usar una base relacional',
    texto: 'El sistema contable de una cadena de farmacias registra pólizas que tocan varias tablas a la vez y necesita reportes en SQL que unen esas tablas con JOIN. ¿Qué servicio de base de datos conviene?',
    opciones: [
      'Amazon DynamoDB',
      'Amazon RDS para PostgreSQL',
      'Amazon ElastiCache',
      'Amazon Neptune'
    ],
    correcta: 1,
    explicacion:
      'Transacciones que afectan varias tablas y consultas SQL con JOIN son el terreno de una base relacional como RDS para PostgreSQL. DynamoDB es NoSQL de llave-valor y no hace JOIN; ElastiCache es una caché en memoria, y Neptune es una base de grafos para relaciones entre entidades.'
  },
  {
    id: 'p06',
    tema: 'Conceptos de la nube',
    sesion: 6,
    concepto: 'Dejar de adivinar la capacidad',
    texto: 'Una tienda departamental compra cada año servidores suficientes para aguantar diciembre, y el resto del año pasan casi vacíos. ¿Qué ventaja de la nube elimina ese problema?',
    opciones: [
      'La alta durabilidad de los datos en varias copias',
      'El acceso a la consola desde cualquier navegador',
      'La responsabilidad compartida con AWS',
      'Dejar de adivinar la capacidad que se necesitará'
    ],
    correcta: 3,
    explicacion:
      'En la nube no tienes que comprar por adelantado para el peor día: aumentas recursos en diciembre y los reduces después (elasticidad). La durabilidad protege los datos, la consola es solo una forma de administrar, y la responsabilidad compartida reparte tareas de seguridad; ninguna evita comprar servidores de más.'
  },
  {
    id: 'p07',
    tema: 'Seguridad y cumplimiento',
    sesion: 2,
    concepto: 'Amazon Cognito',
    texto: 'Una app móvil de recetas quiere que sus clientes se registren con su correo o entren con su cuenta de Google, y que la app solo vea su información. ¿Qué servicio maneja el registro y el inicio de sesión de esos clientes?',
    opciones: [
      'Amazon Cognito',
      'AWS IAM Identity Center',
      'Un usuario de IAM para cada cliente',
      'AWS Directory Service'
    ],
    correcta: 0,
    explicacion:
      'Amazon Cognito da registro, inicio de sesión y federación con Google, Apple o Facebook a los usuarios de tus aplicaciones web y móviles. IAM Identity Center es para que los empleados entren a las cuentas de AWS; los usuarios de IAM son para quien administra AWS, no para miles de clientes, y Directory Service es un Active Directory administrado.'
  },
  {
    id: 'p08',
    tema: 'Tecnología y servicios',
    sesion: 4,
    concepto: 'S3 Standard-IA',
    texto: 'Un despacho guarda en S3 los contratos firmados. Se consultan más o menos una vez al mes, deben abrirse en milisegundos cuando alguien los pide y deben sobrevivir aunque falle una zona de disponibilidad. ¿Qué clase de almacenamiento cuesta menos y cumple todo?',
    opciones: [
      'S3 Standard',
      'S3 Glacier Deep Archive',
      'S3 Standard-Infrequent Access',
      'S3 One Zone-Infrequent Access'
    ],
    correcta: 2,
    explicacion:
      'Standard-IA es para datos de acceso poco frecuente que se necesitan al instante, guardados en varias zonas, y cuesta menos por GB que Standard. S3 Standard cumple pero cuesta más; Glacier Deep Archive tarda horas en devolver un archivo, y One Zone-IA guarda los datos en una sola zona, así que no sobrevive a su falla.'
  },
  {
    id: 'p09',
    tema: 'Seguridad y cumplimiento',
    sesion: 2,
    concepto: 'Tareas exclusivas del usuario raíz',
    texto: 'Una empresa tiene una sola cuenta de AWS, sin AWS Organizations. ¿Qué dos tareas solo puede hacer el usuario raíz de esa cuenta? (Elige DOS.)',
    opciones: [
      'Crear usuarios y grupos de IAM',
      'Cerrar la cuenta de AWS',
      'Cambiar el plan de soporte',
      'Cambiar el correo electrónico del usuario raíz',
      'Ver la factura del mes en Billing'
    ],
    correcta: [1, 3],
    elige: 2,
    explicacion:
      'En una cuenta independiente, cerrar la cuenta y cambiar el correo (o la contraseña) del usuario raíz exigen entrar como raíz. Crear usuarios de IAM y ver la factura lo puede hacer un usuario de IAM con los permisos adecuados, y desde 2022 el plan de soporte también se cambia con permisos de IAM.'
  },
  {
    id: 'p10',
    tema: 'Conceptos de la nube',
    sesion: 0,
    concepto: 'Migración: rehost',
    texto: 'Un hospital debe cerrar su centro de datos en tres meses. Su plan es copiar sus 200 máquinas virtuales tal como están a instancias EC2 con AWS Application Migration Service, sin cambiar las aplicaciones. ¿Qué estrategia de migración usa?',
    opciones: [
      'Refactorizar (refactor)',
      'Recomprar (repurchase)',
      'Realojar (rehost)',
      'Retirar (retire)'
    ],
    correcta: 2,
    explicacion:
      'Rehost, o “lift and shift”, mueve los servidores tal cual a la nube; es la estrategia más rápida y Application Migration Service está hecho para eso. Refactor reescribe la app para aprovechar la nube; repurchase cambia el software por otro (por ejemplo, un SaaS), y retire apaga lo que ya no se usa.'
  },
  {
    id: 'p11',
    tema: 'Seguridad y cumplimiento',
    sesion: 1,
    concepto: 'Responsabilidad compartida en EC2',
    texto: 'Según el modelo de responsabilidad compartida, ¿qué tarea le toca a AWS cuando usas Amazon EC2?',
    opciones: [
      'Mantener el hipervisor y el hardware de los servidores',
      'Configurar las reglas del grupo de seguridad de cada instancia',
      'Instalar las actualizaciones del sistema operativo invitado',
      'Decidir qué usuarios de IAM pueden detener las instancias'
    ],
    correcta: 0,
    explicacion:
      'AWS se encarga de la seguridad “de” la nube: los edificios, el hardware, la red física y la capa de virtualización (el hipervisor). En EC2 el cliente configura sus grupos de seguridad, parcha el sistema operativo de sus instancias y decide quién tiene permisos.'
  },
  {
    id: 'p12',
    tema: 'Seguridad y cumplimiento',
    sesion: 3,
    concepto: 'Network ACL sin estado',
    texto: 'La Network ACL de una subred permite la entrada al puerto 443, pero los visitantes nunca reciben la respuesta del servidor web. El grupo de seguridad está bien. ¿Cuál es la causa más probable?',
    opciones: [
      'Los grupos de seguridad bloquean las respuestas de salida por omisión',
      'El puerto 443 solo funciona si la instancia tiene una IP elástica',
      'Las Network ACL solo se aplican al tráfico que sale hacia internet',
      'La NACL no tiene estado: falta permitir la salida de las respuestas'
    ],
    correcta: 3,
    explicacion:
      'Las Network ACL no recuerdan las conexiones (stateless): además de la regla de entrada, necesitan una regla de salida hacia los puertos efímeros del cliente. Los grupos de seguridad sí tienen estado y dejan salir la respuesta solos; HTTPS no depende de una IP elástica, y las NACL revisan tanto la entrada como la salida.'
  },
  {
    id: 'p13',
    tema: 'Tecnología y servicios',
    sesion: 6,
    concepto: 'Amazon EKS',
    texto: 'Una fintech ya administra sus contenedores con Kubernetes en su propio centro de datos y quiere seguir usando las mismas herramientas y manifiestos en AWS. ¿Qué servicio elige?',
    opciones: [
      'Amazon Elastic Container Service (ECS)',
      'Amazon Elastic Kubernetes Service (EKS)',
      'AWS Elastic Beanstalk',
      'Amazon Lightsail'
    ],
    correcta: 1,
    explicacion:
      'EKS es Kubernetes administrado: el equipo conserva sus herramientas y manifiestos. ECS también corre contenedores, pero con el orquestador propio de AWS, no con Kubernetes; Beanstalk despliega aplicaciones a partir del código, y Lightsail ofrece servidores sencillos a precio fijo.'
  },
  {
    id: 'p14',
    tema: 'Conceptos de la nube',
    sesion: 2,
    concepto: 'Economías de escala',
    texto: 'Un director pregunta por qué AWS puede cobrar por hora de servidor menos de lo que le costaría a su empresa tener su propio equipo. ¿Qué ventaja de la nube lo explica?',
    opciones: [
      'La elasticidad, que apaga los servidores de noche',
      'La alta disponibilidad de varias zonas',
      'El modelo de responsabilidad compartida',
      'Las economías de escala que logra AWS'
    ],
    correcta: 3,
    explicacion:
      'Como AWS compra y opera infraestructura para cientos de miles de clientes, su costo por unidad es menor y lo traslada en precios más bajos: son las economías de escala. La elasticidad ahorra ajustando tu propio uso, la alta disponibilidad trata de no caerse, y la responsabilidad compartida reparte tareas de seguridad.'
  },
  {
    id: 'p15',
    tema: 'Facturación, precios y soporte',
    sesion: 7,
    concepto: 'Instancias reservadas en Organizations',
    texto: 'En una organización con facturación consolidada, la cuenta de Producción compró instancias reservadas que no está usando completas. ¿Qué pasa con ese descuento?',
    opciones: [
      'Se pierde, porque cada reserva solo vale dentro de la cuenta que la compró',
      'Puede aplicarse al uso que coincida en otras cuentas de la organización',
      'AWS lo devuelve en efectivo al final del mes',
      'Se convierte en créditos de AWS Marketplace'
    ],
    correcta: 1,
    explicacion:
      'Con facturación consolidada, los descuentos de instancias reservadas y Savings Plans se comparten por omisión con las demás cuentas de la organización que tengan uso compatible (se puede desactivar). No se pierden necesariamente, AWS no los reembolsa en efectivo y no se vuelven créditos de Marketplace.'
  },
  {
    id: 'p16',
    tema: 'Seguridad y cumplimiento',
    sesion: 4,
    concepto: 'URL prefirmada de S3',
    texto: 'Un estudio de diseño debe compartir con un cliente un archivo de un bucket privado durante 24 horas, sin hacer público el bucket ni crearle un usuario. ¿Qué usa?',
    opciones: [
      'Desactivar S3 Block Public Access por un día',
      'Una política de bucket que permita a todo internet leer',
      'Una URL prefirmada que vence en 24 horas',
      'Copiar el archivo a la clase S3 One Zone-IA'
    ],
    correcta: 2,
    explicacion:
      'Una URL prefirmada da acceso temporal a un objeto privado con los permisos de quien la firma, y deja de servir cuando vence. Quitar Block Public Access o abrir el bucket a todo internet expone todos los archivos; cambiar la clase de almacenamiento no cambia quién puede leerlo.'
  },
  {
    id: 'p17',
    tema: 'Seguridad y cumplimiento',
    sesion: 5,
    concepto: 'Cifrar una base RDS existente',
    texto: 'Una base de datos de Amazon RDS se creó sin cifrado y ahora una auditoría exige que sus datos queden cifrados en reposo. ¿Cómo se logra?',
    opciones: [
      'Copiar un snapshot con cifrado y restaurar desde él una base nueva',
      'Activar la casilla de cifrado con Modify y aplicar el cambio de inmediato',
      'Activar Multi-AZ, porque la copia en espera siempre va cifrada',
      'Crear una réplica de lectura, que se cifra sola al crearse'
    ],
    correcta: 0,
    explicacion:
      'El cifrado de RDS se elige al crear la base y no se puede encender después con Modify. La salida es copiar un snapshot con cifrado (KMS) y restaurar una base nueva desde él. Multi-AZ y las réplicas de una base sin cifrar también quedan sin cifrar.'
  },
  {
    id: 'p18',
    tema: 'Tecnología y servicios',
    sesion: 1,
    concepto: 'Instancias optimizadas para almacenamiento',
    texto: 'Una base NoSQL que la empresa administra ella misma necesita discos locales con muchísimas lecturas y escrituras por segundo y muy baja latencia. ¿Qué familia de instancias EC2 conviene?',
    opciones: [
      'Optimizada para almacenamiento',
      'De propósito general',
      'Optimizada para memoria',
      'De cómputo acelerado (GPU)'
    ],
    correcta: 0,
    explicacion:
      'Las instancias optimizadas para almacenamiento (como la familia i) traen discos NVMe locales para millones de operaciones por segundo con baja latencia. Las de propósito general equilibran recursos, las de memoria priorizan RAM y las aceleradas traen GPU para gráficos o aprendizaje automático.'
  },
  {
    id: 'p19',
    tema: 'Seguridad y cumplimiento',
    sesion: 2,
    concepto: 'Amazon Macie',
    texto: 'Antes de una auditoría de protección de datos, una aseguradora quiere un solo servicio que le diga cuáles de sus buckets son públicos o no están cifrados y en cuáles hay números de tarjeta o datos personales. ¿Cuál usa?',
    opciones: [
      'Amazon Inspector',
      'AWS Config',
      'Amazon Detective',
      'Amazon Macie'
    ],
    correcta: 3,
    explicacion:
      'Amazon Macie mantiene un inventario de tus buckets de S3 (si son públicos, si están cifrados, con quién se comparten) y usa aprendizaje automático para descubrir datos sensibles, como información personal o financiera. Inspector busca vulnerabilidades de software, Config registra la configuración de los recursos, y Detective ayuda a investigar hallazgos de seguridad.'
  },
  {
    id: 'p20',
    tema: 'Tecnología y servicios',
    sesion: 0,
    concepto: 'Amazon Kinesis',
    texto: 'Una plataforma de series y películas por suscripción quiere recibir los clics de miles de usuarios por segundo y procesarlos en tiempo real para recomendar contenido al momento. ¿Qué servicio recibe ese flujo de datos?',
    opciones: [
      'Amazon Athena',
      'Amazon Kinesis Data Streams',
      'AWS Glue',
      'Amazon Redshift'
    ],
    correcta: 1,
    explicacion:
      'Kinesis Data Streams recibe y guarda flujos de datos en tiempo real para procesarlos en segundos. Athena consulta con SQL archivos que ya están en S3, Glue prepara y transforma datos (ETL), y Redshift es un almacén de datos para análisis de lo que ya se cargó.'
  },
  {
    id: 'p21',
    tema: 'Seguridad y cumplimiento',
    sesion: 6,
    concepto: 'Responsabilidad compartida en Lambda',
    texto: 'Una empresa mueve su lógica de pagos a funciones de AWS Lambda. Según el modelo de responsabilidad compartida, ¿qué le sigue tocando a la empresa?',
    opciones: [
      'Parchar el sistema operativo de los servidores donde corre Lambda',
      'Actualizar la versión del entorno de ejecución en cada servidor',
      'El código de la función y los permisos de su rol de ejecución',
      'Reemplazar el hardware cuando falla un servidor'
    ],
    correcta: 2,
    explicacion:
      'En Lambda, AWS administra los servidores, el sistema operativo, los parches del entorno de ejecución y el hardware. Al cliente le quedan su código, sus datos y los permisos de IAM que le da a la función: por eso la seguridad del código y el mínimo privilegio siguen siendo suyos.'
  },
  {
    id: 'p22',
    tema: 'Tecnología y servicios',
    sesion: 3,
    concepto: 'Beneficios de CloudFront',
    texto: 'Una revista digital pone Amazon CloudFront delante de su sitio, que vive en un bucket de S3. ¿Qué dos beneficios obtiene? (Elige DOS.)',
    opciones: [
      'Menor latencia, porque el contenido se sirve desde ubicaciones de borde',
      'Una copia automática del bucket en otra región',
      'Ya no necesita grupos de seguridad en ninguna instancia',
      'Protección básica contra DDoS de AWS Shield Standard, sin costo extra',
      'Un precio menor por GB almacenado en S3'
    ],
    correcta: [0, 3],
    elige: 2,
    explicacion:
      'CloudFront guarda el contenido en ubicaciones de borde cercanas a los lectores (menos latencia) y viene protegido por Shield Standard sin costo adicional. No copia el bucket a otra región (eso es la replicación de S3), no sustituye a los grupos de seguridad y no cambia lo que cuesta guardar en S3.'
  },
  {
    id: 'p23',
    tema: 'Conceptos de la nube',
    sesion: 7,
    concepto: 'Pilar de sostenibilidad',
    texto: 'Una empresa cambia sus instancias a procesadores AWS Graviton, que hacen el mismo trabajo con menos energía, y apaga los ambientes de pruebas que nadie usa. Su meta es reducir el impacto ambiental. ¿Qué pilar del Well-Architected Framework aplica?',
    opciones: [
      'Excelencia operativa',
      'Fiabilidad',
      'Sostenibilidad',
      'Seguridad'
    ],
    correcta: 2,
    explicacion:
      'El pilar de sostenibilidad busca reducir el impacto ambiental usando menos recursos y más eficientes para el mismo resultado. Excelencia operativa trata de operar y mejorar los procesos, fiabilidad de recuperarse de fallas y seguridad de proteger datos y accesos.'
  },
  {
    id: 'p24',
    tema: 'Seguridad y cumplimiento',
    sesion: 2,
    concepto: 'AWS Security Hub',
    texto: 'El equipo de seguridad quiere ver en un solo tablero los hallazgos de GuardDuty, Inspector y Macie de todas sus cuentas, y saber qué tanto cumple con estándares de buenas prácticas. ¿Qué servicio usa?',
    opciones: [
      'AWS Trusted Advisor',
      'AWS Security Hub',
      'Amazon CloudWatch',
      'AWS Artifact'
    ],
    correcta: 1,
    explicacion:
      'Security Hub junta los hallazgos de varios servicios de seguridad y revisa las cuentas contra estándares como las buenas prácticas de AWS o CIS. Trusted Advisor da recomendaciones generales de la cuenta, CloudWatch vigila métricas y registros, y Artifact entrega los reportes de cumplimiento de AWS.'
  },
  {
    id: 'p25',
    tema: 'Tecnología y servicios',
    sesion: 4,
    concepto: 'Amazon FSx for Windows File Server',
    texto: 'Una constructora tiene servidores Windows que comparten planos en una carpeta de red con el protocolo SMB y permisos de Active Directory. Quiere lo mismo en AWS, ya administrado. ¿Qué servicio elige?',
    opciones: [
      'Amazon EFS',
      'Amazon S3 Glacier',
      'Un volumen de Amazon EBS',
      'Amazon FSx for Windows File Server'
    ],
    correcta: 3,
    explicacion:
      'FSx for Windows File Server es un sistema de archivos administrado, compatible con SMB y con Active Directory. EFS está pensado para Linux con el protocolo NFS, Glacier es para archivar a largo plazo, y un volumen EBS se conecta a una instancia, no es una carpeta compartida administrada.'
  },
  {
    id: 'p26',
    tema: 'Tecnología y servicios',
    sesion: 3,
    concepto: 'Enrutamiento por latencia en Route 53',
    texto: 'Una app de videollamadas corre en dos regiones, Norte de Virginia y Tokio. Cada usuario debe llegar a la copia que le responda más rápido desde donde está. ¿Qué política de Route 53 configura?',
    opciones: [
      'Enrutamiento basado en latencia',
      'Enrutamiento simple',
      'Enrutamiento ponderado',
      'Enrutamiento por conmutación por error'
    ],
    correcta: 0,
    explicacion:
      'La política de latencia manda a cada usuario a la región con menor latencia para él. La simple devuelve siempre el mismo destino, la ponderada reparte por porcentajes y la de conmutación por error manda todo a un sitio principal y cambia al de respaldo solo si el principal falla.'
  },
  {
    id: 'p27',
    tema: 'Tecnología y servicios',
    sesion: 5,
    concepto: 'Base de datos en EC2 o administrada',
    texto: 'El proveedor de un sistema de nómina exige acceso de administrador al sistema operativo del servidor de base de datos y una versión del motor que Amazon RDS no ofrece. ¿Qué opción cumple?',
    opciones: [
      'Amazon RDS con Multi-AZ activado',
      'Instalar y administrar el motor en una instancia EC2',
      'Amazon Aurora Serverless',
      'Amazon DynamoDB con capacidad bajo demanda'
    ],
    correcta: 1,
    explicacion:
      'Cuando se necesita control total del sistema operativo o una versión que el servicio administrado no tiene, se instala la base en EC2, aceptando que el cliente la parcha y respalda. RDS y Aurora no ofrecen esa versión ni, en general, acceso al sistema operativo (solo la variante RDS Custom, para Oracle y SQL Server, lo da), y DynamoDB es NoSQL, no el motor que pide el proveedor.'
  },
  {
    id: 'p28',
    tema: 'Conceptos de la nube',
    sesion: 2,
    concepto: 'Costos ocultos de tener servidores propios',
    texto: 'Al comparar su centro de datos propio contra AWS, una empresa solo sumó el precio de los servidores. ¿Qué costos le faltaron en el lado de tener servidores propios?',
    opciones: [
      'Electricidad, enfriamiento, espacio y el personal que mantiene el hardware',
      'La transferencia de datos que entra desde internet',
      'Las licencias de la consola de administración de AWS',
      'El plan de soporte Basic, que AWS cobra por cada servidor que tengas en tu centro'
    ],
    correcta: 0,
    explicacion:
      'Un centro de datos propio cuesta mucho más que los servidores: energía, aire acondicionado, renta del espacio, seguridad física y las personas que lo mantienen. En AWS la entrada de datos no se cobra, la consola no tiene licencia y el soporte Basic es gratis.'
  },
  {
    id: 'p29',
    tema: 'Facturación, precios y soporte',
    sesion: 7,
    concepto: 'Costos de transferencia de datos',
    texto: 'Una empresa mueve datos todos los días entre varios lugares. ¿Cuál de estos movimientos genera un cobro de transferencia de datos?',
    opciones: [
      'Subir archivos desde su oficina a un bucket de S3',
      'Tráfico con IP privada entre dos instancias de la misma zona de disponibilidad',
      'Copiar datos de us-east-1 a una región en Europa',
      'Recibir peticiones de clientes que entran desde internet'
    ],
    correcta: 2,
    explicacion:
      'Mover datos entre regiones se cobra por GB. Los datos que entran a AWS desde internet (subir archivos o recibir peticiones) no se cobran, y el tráfico con IP privada dentro de la misma zona de disponibilidad tampoco.'
  },
  {
    id: 'p30',
    tema: 'Conceptos de la nube',
    sesion: 1,
    concepto: 'Zonas de disponibilidad aisladas',
    texto: '¿Qué afirmación sobre las zonas de disponibilidad de una misma región es correcta?',
    opciones: [
      'Cada una está en un país distinto para cumplir leyes locales',
      'Comparten la misma fuente de energía y la misma red para mantenerse sincronizadas',
      'Son lo mismo que las ubicaciones de borde de CloudFront',
      'Están aisladas entre sí, pero conectadas con enlaces de baja latencia'
    ],
    correcta: 3,
    explicacion:
      'Las zonas de una región están físicamente separadas, con energía y red propias para no compartir un punto único de falla, y se unen con enlaces rápidos que permiten replicar datos. Todas las zonas de una región están en la misma zona geográfica, y las ubicaciones de borde son otra cosa.'
  },
  {
    id: 'p31',
    tema: 'Tecnología y servicios',
    sesion: 6,
    concepto: 'Amazon API Gateway',
    texto: 'Un equipo escribió funciones Lambda para su app de pedidos y quiere publicarlas como una API REST segura, con autenticación y un límite de peticiones por cliente. ¿Qué servicio pone delante?',
    opciones: [
      'Amazon CloudFront',
      'Network Load Balancer',
      'Amazon SQS',
      'Amazon API Gateway'
    ],
    correcta: 3,
    explicacion:
      'API Gateway crea, publica y protege APIs (REST, HTTP y WebSocket) con autenticación, límites de peticiones y monitoreo, y puede invocar Lambda directamente. CloudFront distribuye contenido, el NLB reparte conexiones TCP y SQS es una cola de mensajes, no una API para clientes.'
  },
  {
    id: 'p32',
    tema: 'Seguridad y cumplimiento',
    sesion: 2,
    concepto: 'AWS CloudHSM',
    texto: 'Una regulación bancaria exige que las llaves de cifrado vivan en un módulo de seguridad de hardware (HSM) dedicado, de un solo inquilino, que solo el banco controla. ¿Qué servicio cumple?',
    opciones: [
      'AWS Secrets Manager',
      'AWS Certificate Manager',
      'AWS CloudHSM',
      'Amazon Macie'
    ],
    correcta: 2,
    explicacion:
      'CloudHSM da módulos de hardware dedicados solo a tu cuenta, donde tú administras las llaves. Secrets Manager guarda contraseñas y otros secretos, Certificate Manager emite certificados TLS y Macie busca datos sensibles en S3. (KMS también cifra con HSM, pero compartidos y administrados por AWS.)'
  },
  {
    id: 'p33',
    tema: 'Conceptos de la nube',
    sesion: 4,
    concepto: 'Pagar solo lo que usas',
    texto: 'Una agencia compró un NAS de 50 TB hace dos años y hoy solo ocupa 10 TB. Al pasar sus archivos a Amazon S3, ¿qué cambia en la forma de pagar?',
    opciones: [
      'Paga cada mes solo por los GB que guarda, sin comprar por adelantado',
      'Debe reservar los 50 TB en S3 para no perder su espacio',
      'Paga una cuota fija por cada bucket que crea, sin importar cuánto guarde en él',
      'Paga lo mismo, pero AWS le regala el respaldo'
    ],
    correcta: 0,
    explicacion:
      'S3 cobra por GB-mes realmente guardado: no hay que comprar ni reservar capacidad, y si crece o se reduce, el cobro se ajusta. Es el cambio de un costo fijo a uno variable. S3 no tiene cuota por bucket ni capacidad que reservar.'
  },
  {
    id: 'p34',
    tema: 'Seguridad y cumplimiento',
    sesion: 3,
    concepto: 'Session Manager',
    texto: 'El área de sistemas quiere entrar a la terminal de instancias en subredes privadas sin abrir el puerto 22, sin servidor bastión y sin repartir llaves SSH, dejando registro de cada sesión. ¿Qué usa?',
    opciones: [
      'Una regla SSH desde 0.0.0.0/0 en el grupo de seguridad',
      'AWS Systems Manager Session Manager',
      'Un Internet Gateway en la subred privada',
      'AWS Direct Connect hacia cada instancia'
    ],
    correcta: 1,
    explicacion:
      'Session Manager abre una terminal desde la consola o la CLI a través del agente de Systems Manager, sin puertos de entrada ni llaves, y puede registrar cada sesión. Abrir SSH a todo internet es justo lo que se quiere evitar, un Internet Gateway volvería pública la subred y Direct Connect es un enlace privado con tu oficina.'
  },
  {
    id: 'p35',
    tema: 'Facturación, precios y soporte',
    sesion: 4,
    concepto: 'Qué se cobra en S3',
    texto: 'Al estimar en AWS Pricing Calculator el costo de un bucket de S3 con fotos de productos, ¿qué dos conceptos sí se cobran? (Elige DOS.)',
    opciones: [
      'Los GB almacenados al mes, según la clase de almacenamiento',
      'Una cuota mensual fija por cada bucket creado',
      'Los datos que salen de S3 hacia internet',
      'Las fotos que se suben a S3 desde internet',
      'Cada usuario de IAM que tiene permiso de leer el bucket'
    ],
    correcta: [0, 2],
    elige: 2,
    explicacion:
      'S3 cobra por GB guardado al mes (más barato en las clases de acceso poco frecuente), por las solicitudes y por los datos que salen hacia internet. No hay cuota por bucket, subir datos desde internet no se cobra, y los usuarios de IAM no tienen costo.'
  },
  {
    id: 'p36',
    tema: 'Tecnología y servicios',
    sesion: 0,
    concepto: 'Infraestructura como código',
    texto: 'Una empresa necesita levantar la misma red, servidores y base de datos en tres regiones, idénticos, y guardar la definición en su repositorio para repetirla cuando quiera. ¿Qué servicio usa?',
    opciones: [
      'AWS CloudFormation',
      'AWS Elastic Beanstalk',
      'La consola de AWS, paso a paso en cada región',
      'Amazon Lightsail'
    ],
    correcta: 0,
    explicacion:
      'CloudFormation es infraestructura como código: describes los recursos en una plantilla y la despliegas igual cuantas veces quieras, en cualquier región. Elastic Beanstalk despliega una aplicación a partir de su código, hacerlo a mano en la consola no es repetible, y Lightsail da servidores sencillos.'
  },
  {
    id: 'p37',
    tema: 'Facturación, precios y soporte',
    sesion: 7,
    concepto: 'Business Support+',
    texto: 'Una startup tiene su app en producción y quiere ingenieros de AWS disponibles 24/7 que respondan rápido si el sistema se cae, más todos los chequeos de Trusted Advisor, sin pagar miles de dólares al mes. ¿Qué plan de soporte elige?',
    opciones: [
      'Basic Support',
      'Business Support+',
      'Enterprise Support',
      'Unified Operations'
    ],
    correcta: 1,
    explicacion:
      'Business Support+ empieza en unas decenas de dólares al mes, da expertos 24/7 con respuesta en menos de 30 minutos si producción se cae y todos los chequeos de Trusted Advisor. Basic no incluye soporte técnico, y Enterprise y Unified Operations cuestan miles de dólares al mes.'
  },
  {
    id: 'p38',
    tema: 'Tecnología y servicios',
    sesion: 5,
    concepto: 'Recuperación a un punto en el tiempo en DynamoDB',
    texto: 'Un error en una actualización corrompió parte de una tabla de DynamoDB hace dos horas. ¿Qué función permite restaurar la tabla a cualquier segundo de los últimos 35 días?',
    opciones: [
      'DynamoDB Accelerator (DAX)',
      'Las tablas globales de DynamoDB',
      'La capacidad bajo demanda',
      'La recuperación a un punto en el tiempo (PITR)'
    ],
    correcta: 3,
    explicacion:
      'Con PITR activado, DynamoDB guarda respaldos continuos y deja restaurar la tabla a cualquier segundo del periodo de retención (hasta 35 días). DAX es una caché, las tablas globales replican a otras regiones (y replican también el error), y el modo bajo demanda solo cambia cómo pagas.'
  },
  {
    id: 'p39',
    tema: 'Seguridad y cumplimiento',
    sesion: 2,
    concepto: 'AWS Firewall Manager',
    texto: 'Una empresa con 30 cuentas en AWS Organizations quiere aplicar las mismas reglas de AWS WAF y de grupos de seguridad en todas, desde un solo lugar, incluso en las cuentas nuevas. ¿Qué servicio usa?',
    opciones: [
      'Amazon GuardDuty',
      'AWS Shield Standard',
      'AWS Firewall Manager',
      'AWS Control Tower'
    ],
    correcta: 2,
    explicacion:
      'Firewall Manager administra de forma central reglas de WAF, Shield Advanced, grupos de seguridad y firewalls de red en todas las cuentas de la organización, y las aplica a los recursos nuevos. GuardDuty detecta amenazas, Shield Standard protege contra DDoS y Control Tower prepara el entorno multicuenta, pero no administra reglas de firewall.'
  },
  {
    id: 'p40',
    tema: 'Seguridad y cumplimiento',
    sesion: 6,
    concepto: 'Un trail de CloudTrail',
    texto: 'Un auditor pide conservar durante cinco años el registro de todas las llamadas a la API de la cuenta, en todas las regiones. El historial de eventos de CloudTrail solo muestra 90 días. ¿Qué se configura?',
    opciones: [
      'Una alarma de CloudWatch para cada acción importante de cada región',
      'AWS Config con todas sus reglas administradas',
      'Un trail multirregión de CloudTrail que guarde los eventos en S3',
      'VPC Flow Logs en todas las VPC de la cuenta'
    ],
    correcta: 2,
    explicacion:
      'El Event history guarda 90 días; para conservar más se crea un trail que entrega los eventos a S3, donde se guardan el tiempo que haga falta (con ciclo de vida si se quiere). Las alarmas avisan de métricas, Config registra la configuración de los recursos y Flow Logs registra tráfico de red, no llamadas a la API.'
  },
  {
    id: 'p41',
    tema: 'Facturación, precios y soporte',
    sesion: 1,
    concepto: 'Reservas de capacidad bajo demanda',
    texto: 'Durante una auditoría de dos semanas, un hospital necesita la seguridad de que habrá instancias de cierto tipo disponibles en una zona específica, sin firmar un compromiso de 1 o 3 años. ¿Qué opción de compra usa?',
    opciones: [
      'Instancias Spot',
      'Un Savings Plan de un año',
      'Un Dedicated Host',
      'Reservas de capacidad bajo demanda'
    ],
    correcta: 3,
    explicacion:
      'Las On-Demand Capacity Reservations apartan capacidad en una zona de disponibilidad por el tiempo que quieras, sin plazo de compromiso, y se pagan a precio On-Demand. Spot puede interrumpirse, un Savings Plan pide compromiso de 1 o 3 años y un Dedicated Host es un servidor físico completo para ti.'
  },
  {
    id: 'p42',
    tema: 'Tecnología y servicios',
    sesion: 3,
    concepto: 'VPN como respaldo de Direct Connect',
    texto: 'Una empresa ya conecta su centro de datos a AWS con Direct Connect y quiere un respaldo cifrado y económico por si ese enlace se cae. ¿Qué agrega?',
    opciones: [
      'Una segunda VPC con VPC Peering',
      'Una AWS Site-to-Site VPN por internet',
      'Un NAT Gateway en cada subred privada',
      'Amazon CloudFront delante de la VPC'
    ],
    correcta: 1,
    explicacion:
      'Una Site-to-Site VPN viaja cifrada por internet, se crea en minutos y cuesta poco: es el respaldo típico de Direct Connect. Peering une VPC entre sí, no con tu oficina; un NAT Gateway da salida a internet a subredes privadas, y CloudFront distribuye contenido a usuarios.'
  },
  {
    id: 'p43',
    tema: 'Conceptos de la nube',
    sesion: 5,
    concepto: 'Servicios administrados',
    texto: 'Desde que una empresa pasó a servicios administrados, su equipo ya no instala parches ni saca respaldos de la base de datos y dedica ese tiempo a nuevas funciones de su producto. ¿Qué beneficio de la nube describe?',
    opciones: [
      'Enfocarse en lo que distingue al negocio y no en operar infraestructura',
      'Volverse global en minutos con varias regiones',
      'Obtener descuentos por compromiso de uso',
      'Cumplir automáticamente con cualquier regulación de su industria y de su país'
    ],
    correcta: 0,
    explicacion:
      'Al dejar en manos de AWS el trabajo pesado que no distingue al negocio (parches, respaldos, hardware), el equipo se concentra en su producto. Volverse global y los descuentos por compromiso son otros beneficios, y el cumplimiento sigue siendo responsabilidad compartida: no es automático.'
  },
  {
    id: 'p44',
    tema: 'Seguridad y cumplimiento',
    sesion: 2,
    concepto: 'Cifrado en tránsito',
    texto: 'Un auditor pregunta cómo protege una tienda los datos de tarjeta mientras viajan del navegador del cliente a su Application Load Balancer. La base ya está cifrada en reposo. ¿Qué le falta para cifrar en tránsito?',
    opciones: [
      'Cifrar los volúmenes EBS de los servidores con KMS',
      'Un listener HTTPS con un certificado de AWS Certificate Manager',
      'Activar Amazon Macie en los buckets de la tienda',
      'Guardar la contraseña de la base en Secrets Manager'
    ],
    correcta: 1,
    explicacion:
      'Cifrar en tránsito es proteger los datos mientras viajan por la red: un listener HTTPS (TLS) en el balanceador, con un certificado público de ACM, gratis y con renovación automática. Cifrar EBS con KMS es cifrado en reposo, Macie descubre datos sensibles y Secrets Manager guarda credenciales; nada de eso cifra la conexión del cliente.'
  },
  {
    id: 'p45',
    tema: 'Tecnología y servicios',
    sesion: 4,
    concepto: 'Instance store',
    texto: 'Un proceso de renderizado usa una carpeta temporal de trabajo que necesita el disco más rápido posible y que se puede volver a generar si se pierde. ¿Qué almacenamiento conviene?',
    opciones: [
      'Un volumen EBS de uso general',
      'Un bucket de S3',
      'El instance store de la instancia',
      'Un sistema de archivos EFS'
    ],
    correcta: 2,
    explicacion:
      'El instance store son discos físicamente conectados al servidor: muy rápidos y sin costo extra, pero se borran al detener o terminar la instancia, así que sirven para datos temporales que se pueden regenerar. EBS y EFS persisten pero van por la red, y S3 es almacenamiento de objetos, no un disco de trabajo.'
  },
  {
    id: 'p46',
    tema: 'Conceptos de la nube',
    sesion: 7,
    concepto: 'Beneficios del AWS CAF',
    texto: 'Según el AWS Cloud Adoption Framework (AWS CAF), ¿cuál de estos es un beneficio de negocio que una organización puede lograr al adoptar la nube?',
    opciones: [
      'Mejorar su desempeño ambiental, social y de gobernanza (ESG)',
      'Pasarle a AWS toda la responsabilidad de su seguridad',
      'Garantizar que sus aplicaciones nunca tendrán una falla',
      'Dejar de pagar cualquier licencia de software'
    ],
    correcta: 0,
    explicacion:
      'El AWS CAF habla de cuatro beneficios: reducir el riesgo del negocio, mejorar el desempeño ESG, aumentar los ingresos y aumentar la eficiencia operativa. La seguridad sigue siendo compartida, ninguna nube garantiza cero fallas, y las licencias se siguen pagando (incluidas en el precio o traídas por el cliente).'
  },
  {
    id: 'p47',
    tema: 'Conceptos de la nube',
    sesion: 6,
    concepto: 'Acoplamiento débil',
    texto: 'Cuando el módulo de facturación de una tienda falla, se cae toda la tienda, porque cada componente llama directamente al siguiente y espera su respuesta. ¿Qué principio de diseño de la nube le falta aplicar?',
    opciones: [
      'Escalar verticalmente cada componente',
      'Poner todos los componentes en una sola zona de disponibilidad para que respondan más rápido',
      'Centralizar todo en un servidor más grande',
      'Desacoplar los componentes, por ejemplo con colas de mensajes'
    ],
    correcta: 3,
    explicacion:
      'Con acoplamiento débil, un componente deja su trabajo en una cola (como SQS) y sigue; si otro falla, los mensajes esperan y el resto sigue funcionando. Hacer más grande un servidor o juntarlo todo en uno solo, o en una sola zona, aumenta el punto único de falla.'
  },
  {
    id: 'p48',
    tema: 'Tecnología y servicios',
    sesion: 1,
    concepto: 'Cuándo usar varias regiones',
    texto: 'Una empresa ya reparte su aplicación en tres zonas de disponibilidad de una región. ¿Qué dos motivos justificarían desplegarla además en otra región? (Elige DOS.)',
    opciones: [
      'Las zonas de una misma región comparten el mismo centro de datos',
      'Seguir operando si toda la región principal tiene un problema grave',
      'Dejar de pagar la transferencia de datos entre servicios',
      'Obtener automáticamente un descuento por usar dos regiones',
      'Dar menor latencia a clientes que están en otro continente'
    ],
    correcta: [1, 4],
    elige: 2,
    explicacion:
      'Otra región sirve para la recuperación ante desastres y la continuidad del negocio, para dar baja latencia a usuarios lejanos y para cumplir reglas de residencia de datos. Las zonas no comparten centro de datos, copiar datos entre regiones sí se cobra, y usar dos regiones no da descuento.'
  },
  {
    id: 'p49',
    tema: 'Facturación, precios y soporte',
    sesion: 0,
    concepto: 'AWS Trust & Safety',
    texto: 'Una escuela recibe todos los días correos de spam e intentos de ataque que vienen de direcciones IP que pertenecen a AWS. ¿Con quién lo reporta?',
    opciones: [
      'Con su Technical Account Manager',
      'En AWS re:Post, como pregunta pública',
      'Con AWS Marketplace',
      'Con el equipo de AWS Trust & Safety'
    ],
    correcta: 3,
    explicacion:
      'El equipo de Trust & Safety atiende los reportes de abuso que salen de recursos de AWS (spam, escaneo de puertos, ataques), aunque quien reporta no sea cliente. Un TAM solo existe en planes Enterprise y atiende tu cuenta, re:Post es una comunidad de preguntas y Marketplace vende software.'
  },
  {
    id: 'p50',
    tema: 'Seguridad y cumplimiento',
    sesion: 3,
    concepto: 'Control de acceso al origen (OAC)',
    texto: 'Una revista sirve sus imágenes con CloudFront desde un bucket de S3 y descubrió que algunos usuarios descargan las imágenes directo del bucket, saltándose CloudFront. ¿Cómo lo evita?',
    opciones: [
      'Configurando Origin Access Control para que solo CloudFront lea el bucket',
      'Activando el versionado del bucket',
      'Moviendo las imágenes a S3 Glacier',
      'Agregando una Network ACL a la distribución de CloudFront que bloquee el acceso al bucket'
    ],
    correcta: 0,
    explicacion:
      'Con Origin Access Control (OAC), el bucket queda privado y su política solo deja leer a la distribución de CloudFront. El versionado guarda versiones anteriores, Glacier haría lentas las descargas y las Network ACL se aplican a subredes de una VPC, no a CloudFront.'
  },
  {
    id: 'p51',
    tema: 'Tecnología y servicios',
    sesion: 5,
    concepto: 'AWS Schema Conversion Tool',
    texto: 'Una aseguradora quiere pasar su base Oracle a Amazon Aurora PostgreSQL. Además de mover los datos, debe traducir el esquema y los procedimientos almacenados al nuevo motor. ¿Qué herramienta hace esa traducción?',
    opciones: [
      'AWS DataSync',
      'AWS Schema Conversion Tool (AWS SCT)',
      'AWS Snowball Edge',
      'AWS Storage Gateway'
    ],
    correcta: 1,
    explicacion:
      'AWS SCT convierte el esquema y el código de la base (procedimientos, funciones) de un motor a otro; luego DMS mueve los datos. DataSync copia archivos, Snowball traslada grandes volúmenes en un dispositivo físico y Storage Gateway conecta almacenamiento local con AWS.'
  },
  {
    id: 'p52',
    tema: 'Seguridad y cumplimiento',
    sesion: 2,
    concepto: 'AWS Config',
    texto: 'Una norma interna exige que todos los volúmenes EBS estén cifrados. El equipo de cumplimiento quiere una lista siempre al día de los volúmenes que no cumplen y el historial de cambios de cada uno. ¿Qué servicio lo resuelve?',
    opciones: [
      'Amazon Inspector',
      'AWS Trusted Advisor',
      'AWS Config',
      'Amazon GuardDuty'
    ],
    correcta: 2,
    explicacion:
      'AWS Config guarda el historial de configuración de cada recurso y evalúa reglas de cumplimiento (como «volúmenes EBS cifrados»), marcando los que no las cumplen. Inspector busca vulnerabilidades de software, Trusted Advisor da recomendaciones generales sin historial por recurso, y GuardDuty detecta actividad maliciosa.'
  },
  {
    id: 'p53',
    tema: 'Tecnología y servicios',
    sesion: 1,
    concepto: 'Dirección IP elástica',
    texto: 'El servidor de un sistema de facturación debe conservar siempre la misma IP pública, porque los bancos la tienen registrada en sus listas de acceso, aunque el servidor se detenga y se vuelva a encender. ¿Qué se le asigna?',
    opciones: [
      'Una dirección IP elástica',
      'Una IP privada fija dentro de la VPC',
      'Un nuevo grupo de seguridad',
      'Una ubicación de borde de CloudFront'
    ],
    correcta: 0,
    explicacion:
      'Una IP elástica es una IPv4 pública fija que se queda en tu cuenta y se asocia a la instancia; no cambia al detenerla y encenderla. Una IP privada no se ve desde internet, el grupo de seguridad filtra tráfico y no da direcciones, y CloudFront no asigna IP fijas a una instancia.'
  },
  {
    id: 'p54',
    tema: 'Facturación, precios y soporte',
    sesion: 7,
    concepto: 'AWS Cost and Usage Report',
    texto: 'El área de finanzas quiere el detalle más fino posible de su factura de AWS, renglón por renglón, por hora y por recurso, para cargarlo en su propia herramienta de inteligencia de negocios. ¿Qué usa?',
    opciones: [
      'AWS Budgets',
      'AWS Pricing Calculator',
      'AWS Cost and Usage Report',
      'La página de inicio de Billing and Cost Management'
    ],
    correcta: 2,
    explicacion:
      'El Cost and Usage Report (hoy se configura en Data Exports) entrega a un bucket de S3 el detalle más completo del uso y los costos, listo para analizarlo con otras herramientas. Budgets manda alertas, la calculadora estima antes de crear y la página de inicio de Billing solo muestra resúmenes.'
  },
  {
    id: 'p55',
    tema: 'Tecnología y servicios',
    sesion: 6,
    concepto: 'Seguimiento de destino en Auto Scaling',
    texto: 'Un equipo quiere que su grupo de Auto Scaling agregue o quite instancias solo para mantener la CPU promedio cerca de 50 %, sin calcular pasos ni crear alarmas a mano. ¿Qué política usa?',
    opciones: [
      'Una acción programada cada hora',
      'Escalado simple con una alarma propia',
      'Escalado manual: cambiar la capacidad deseada cuando haga falta',
      'Una política de seguimiento de destino (target tracking)'
    ],
    correcta: 3,
    explicacion:
      'Con target tracking eliges la métrica y el valor (CPU al 50 %) y Auto Scaling crea y administra las alarmas para mantenerse cerca. Las acciones programadas sirven para horarios conocidos, el escalado simple exige crear tu alarma y decidir cuánto sumar, y el manual no responde solo a la carga.'
  },
  {
    id: 'p56',
    tema: 'Seguridad y cumplimiento',
    sesion: 4,
    concepto: 'SSE-KMS',
    texto: 'Una clínica quiere que el cifrado de sus objetos en S3 use una llave que ella controle: decidir quién puede usarla, rotarla y ver en CloudTrail cada vez que se usa. ¿Qué opción de cifrado elige?',
    opciones: [
      'SSE-S3, con llaves administradas por S3',
      'SSE-KMS, con una llave administrada por el cliente en AWS KMS',
      'Ninguna: S3 Block Public Access ya cifra los objetos con la llave de la clínica',
      'El versionado del bucket con MFA Delete'
    ],
    correcta: 1,
    explicacion:
      'Con SSE-KMS y una llave administrada por el cliente, la clínica define en la política de la llave quién la usa, activa su rotación y cada uso queda en CloudTrail. SSE-S3 cifra, pero S3 controla las llaves; Block Public Access no cifra nada, y el versionado protege contra borrados, no cifra.'
  },
  {
    id: 'p57',
    tema: 'Conceptos de la nube',
    sesion: 0,
    concepto: 'Migración: replatform',
    texto: 'Una universidad mueve su aplicación Java de inscripciones de sus servidores a AWS Elastic Beanstalk, con ajustes mínimos y sin reescribirla, para dejar de administrar los servidores. ¿Qué estrategia de migración aplica?',
    opciones: [
      'Retener (retain)',
      'Redefinir la plataforma (replatform)',
      'Recomprar (repurchase)',
      'Realojar (rehost)'
    ],
    correcta: 1,
    explicacion:
      'Replatform (“lift, tinker and shift”) mueve la app con pequeños ajustes para aprovechar un servicio administrado, como Beanstalk o RDS, sin cambiar su arquitectura. Rehost la movería tal cual a EC2, repurchase la cambiaría por otro producto, y retain la dejaría donde está.'
  },
  {
    id: 'p58',
    tema: 'Conceptos de la nube',
    sesion: 6,
    concepto: 'Agilidad',
    texto: 'Un equipo de innovación prueba una idea nueva en una tarde: crea servidores y una base de datos, mide los resultados y lo borra todo al día siguiente, pagando solo unas horas. ¿Qué beneficio de la nube aprovecha?',
    opciones: [
      'La durabilidad de once nueves de S3',
      'La facturación consolidada',
      'El modelo de responsabilidad compartida',
      'La agilidad para experimentar rápido y barato'
    ],
    correcta: 3,
    explicacion:
      'La agilidad es poder conseguir recursos en minutos, probar y desechar sin haber comprado hardware: experimentar sale barato. La durabilidad protege datos guardados, la facturación consolidada junta facturas de varias cuentas y la responsabilidad compartida reparte tareas de seguridad.'
  },
  {
    id: 'p59',
    tema: 'Conceptos de la nube',
    sesion: 1,
    concepto: 'Licencias: BYOL o incluidas',
    texto: 'Una empresa ya pagó licencias de su motor de base de datos comercial que se pueden llevar a la nube y no quiere volver a pagarlas dentro del precio por hora de sus instancias. ¿Qué modelo de licenciamiento usa?',
    opciones: [
      'Licencia incluida en el precio de la instancia',
      'Instancias Spot con licencia temporal',
      'Traer su propia licencia (BYOL)',
      'Comprar la licencia en AWS Artifact'
    ],
    correcta: 2,
    explicacion:
      'Con BYOL (Bring Your Own License) usas en AWS licencias que ya tienes, cuando las condiciones del fabricante lo permiten; a veces se combina con Dedicated Hosts. Con licencia incluida pagas la licencia otra vez dentro del precio por hora, Spot es una forma de pagar el cómputo y Artifact entrega reportes de cumplimiento, no vende licencias.'
  },
  {
    id: 'p60',
    tema: 'Seguridad y cumplimiento',
    sesion: 2,
    concepto: 'Amazon Detective',
    texto: 'GuardDuty reportó que una instancia se comunica con una IP sospechosa. El equipo quiere investigar la causa de raíz: qué usuarios, IPs y recursos estuvieron involucrados y cómo se relacionan en el tiempo. ¿Qué servicio le ayuda?',
    opciones: [
      'Amazon Detective',
      'AWS Artifact',
      'AWS Shield Advanced',
      'Amazon Macie'
    ],
    correcta: 0,
    explicacion:
      'Amazon Detective junta datos de CloudTrail, Flow Logs y GuardDuty y los muestra como gráficas de relaciones para investigar un hallazgo. Artifact entrega documentos de cumplimiento, Shield Advanced protege contra DDoS y Macie busca datos sensibles en S3.'
  },
  {
    id: 'p61',
    tema: 'Tecnología y servicios',
    sesion: 0,
    concepto: 'Servicios de IA: Transcribe y Comprehend',
    texto: 'Un call center quiere convertir a texto las llamadas grabadas con sus clientes y después detectar en ese texto si el cliente estaba molesto o contento. ¿Qué dos servicios usa? (Elige DOS.)',
    opciones: [
      'Amazon Polly',
      'Amazon Rekognition',
      'Amazon Transcribe',
      'Amazon Comprehend',
      'Amazon Translate'
    ],
    correcta: [2, 3],
    elige: 2,
    explicacion:
      'Amazon Transcribe convierte voz en texto, y Amazon Comprehend analiza texto para encontrar el sentimiento, las entidades y las frases clave. Polly hace lo contrario (texto a voz), Rekognition analiza imágenes y video, y Translate traduce entre idiomas.'
  },
  {
    id: 'p62',
    tema: 'Conceptos de la nube',
    sesion: 7,
    concepto: 'Ajustar el tamaño (right-sizing)',
    texto: 'Una instancia m5.4xlarge lleva tres meses con la CPU entre 5 y 8 %. El equipo la cambia por un tipo más chico que cubre la misma carga y paga menos. ¿Cómo se llama esta práctica?',
    opciones: [
      'Escalado horizontal',
      'Alta disponibilidad',
      'Ajustar el tamaño (right-sizing)',
      'Facturación consolidada'
    ],
    correcta: 2,
    explicacion:
      'Right-sizing es elegir el tipo y tamaño de recurso que de verdad necesita la carga, según su uso real; herramientas como AWS Compute Optimizer lo recomiendan. Escalar horizontalmente es agregar más instancias, alta disponibilidad es seguir funcionando ante fallas y la facturación consolidada junta cuentas.'
  },
  {
    id: 'p63',
    tema: 'Tecnología y servicios',
    sesion: 5,
    concepto: 'Características de DynamoDB',
    texto: 'Un equipo compara opciones para el carrito de compras de su app. ¿Qué característica describe a Amazon DynamoDB?',
    opciones: [
      'Es sin servidores y responde en milisegundos de un dígito a cualquier escala',
      'Requiere elegir una clase de instancia, como db.t3.micro',
      'Está hecha para consultas SQL con JOIN entre muchas tablas relacionadas entre sí',
      'Solo puede crearse en una zona de disponibilidad'
    ],
    correcta: 0,
    explicacion:
      'DynamoDB es una base NoSQL totalmente administrada y sin servidores: no eliges instancias y da respuestas en milisegundos aunque crezca mucho. Elegir una clase de instancia es cosa de RDS, los JOIN son de bases relacionales y DynamoDB replica sus datos en varias zonas de la región.'
  },
  {
    id: 'p64',
    tema: 'Tecnología y servicios',
    sesion: 4,
    concepto: 'Ciclo de vida: expiración',
    texto: 'Los registros de acceso de una app llegan cada día a un bucket de S3 y la política de la empresa dice que se borren a los 90 días. ¿Cómo se automatiza sin escribir código?',
    opciones: [
      'Activando el versionado del bucket',
      'Con una regla de ciclo de vida que los expire a los 90 días',
      'Con S3 Intelligent-Tiering',
      'Con S3 Object Lock en modo de cumplimiento'
    ],
    correcta: 1,
    explicacion:
      'Las reglas de ciclo de vida de S3 pueden mover objetos a otra clase o hacerlos expirar (borrarlos) después de cierto número de días. El versionado guarda versiones en lugar de borrar, Intelligent-Tiering mueve datos entre niveles pero no los borra, y Object Lock impide borrarlos.'
  },
  {
    id: 'p65',
    tema: 'Conceptos de la nube',
    sesion: 3,
    concepto: 'Diseñar para las fallas',
    texto: 'Un arquitecto repite: “Todo falla todo el tiempo, así que diseña pensando en eso”. ¿Qué práctica sigue esa idea?',
    opciones: [
      'Comprar el servidor más caro para que nunca falle',
      'Revisar los servidores a mano cada mañana',
      'Usar una sola instancia muy grande para tener menos piezas que puedan fallar',
      'Repartir los recursos en varias zonas y automatizar la recuperación'
    ],
    correcta: 3,
    explicacion:
      'Diseñar para las fallas significa suponer que cualquier pieza puede caer: se reparte en varias zonas, se evitan puntos únicos de falla y la recuperación es automática (health checks, Auto Scaling). Un servidor caro o una sola instancia siguen siendo un punto único de falla, y revisar a mano no recupera nada solo.'
  }
];
