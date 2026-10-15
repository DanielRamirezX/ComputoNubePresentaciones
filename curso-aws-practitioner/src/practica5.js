// El examen de práctica de la sesión 5 (bases de datos): 20 preguntas al estilo
// del examen AWS Certified Cloud Practitioner (CLF-C02). Mismas reglas que los
// otros bancos (ver src/practica.js): la respuesta correcta vive solo en el
// servidor, la clave está balanceada (5 en A, 5 en B, 5 en C y 5 en D, sin
// rachas de tres) y cada distractor es una confusión real.
// Corre `npm run verificar` si cambias algo.

export const TEMAS = ['Bases relacionales', 'Disponibilidad y respaldos', 'NoSQL y DynamoDB', 'Caché y análisis', 'Elegir y migrar'];

// Qué lecciones del curso repasar cuando un tema sale bajo.
export const REPASO = {
  'Bases relacionales': ['s5-relacionales', 's5-ex-administrada', 's5-lab-bases'],
  'Disponibilidad y respaldos': ['s5-disponibilidad', 's5-ex-replica'],
  'NoSQL y DynamoDB': ['s5-nosql', 's5-ex-cual-base'],
  'Caché y análisis': ['s5-otras', 's5-ex-cual-base'],
  'Elegir y migrar': ['s5-otras', 's5-ex-migrar', 's5-ex-quien']
};

// Lo que se muestra antes de empezar y en el desplegable de cada pregunta.
export const CASO = `
  <p>Este examen se parece al de la certificación <strong>AWS Certified Cloud Practitioner (CLF-C02)</strong>. Las bases de datos entran en el dominio de <strong>tecnología y servicios</strong>, el que más pesa (34&nbsp;%).</p>
  <ul>
    <li>En el examen real son <strong>65 preguntas en 90 minutos</strong> y se aprueba con <strong>700 de 1000</strong>.</li>
    <li>Busca la <strong>palabra clave</strong>: “relacional”, “clave-valor”, “milisegundos”, “otra zona”, “más lecturas”, “almacén de datos”…</li>
    <li>Si la pregunta dice “administrado” o “sin administrar servidores”, la respuesta casi nunca es instalar la base en EC2.</li>
  </ul>`;

export const PREGUNTAS = [
  {
    id: 'p01',
    concepto: 'Qué administra RDS',
    tema: 'Bases relacionales',
    texto: 'Una empresa pasa su base MySQL de un servidor propio a Amazon RDS. ¿Qué tarea deja de hacer ella y pasa a hacer AWS?',
    opciones: [
      'Diseñar las tablas y escribir las consultas',
      'Instalar los parches del motor y sacar los respaldos automáticos',
      'Decidir quién de su equipo puede leer y modificar los datos de los clientes',
      'Cargar los datos de sus clientes'
    ],
    correcta: 1,
    explicacion: 'En RDS, AWS se encarga del hardware, del sistema operativo, de los parches del motor y de los respaldos automáticos. Las tablas, las consultas, los datos y los permisos siguen siendo del cliente.'
  },
  {
    id: 'p02',
    concepto: 'Motores de RDS',
    tema: 'Bases relacionales',
    texto: '¿Cuál de estos motores NO se puede elegir al crear una base en Amazon RDS?',
    opciones: [
      'PostgreSQL',
      'Microsoft SQL Server',
      'MariaDB',
      'Apache Cassandra'
    ],
    correcta: 3,
    explicacion: 'RDS ofrece Aurora, MySQL, MariaDB, PostgreSQL, Oracle, SQL Server y Db2: todos relacionales. Cassandra es NoSQL; en AWS su equivalente es Amazon Keyspaces.'
  },
  {
    id: 'p03',
    concepto: 'Amazon Aurora',
    tema: 'Bases relacionales',
    texto: '¿Qué describe mejor a Amazon Aurora?',
    opciones: [
      'Una base relacional de AWS compatible con MySQL y PostgreSQL, con más rendimiento y seis copias en tres zonas',
      'Una base NoSQL de clave-valor que responde en milisegundos',
      'Un almacén de datos para consultas de análisis sobre petabytes',
      'Una caché en memoria que se pone delante de otra base'
    ],
    correcta: 0,
    explicacion: 'Aurora es la base relacional hecha por AWS: compatible con MySQL y PostgreSQL, más rápida que ellas y con seis copias de los datos repartidas en tres zonas de disponibilidad.'
  },
  {
    id: 'p04',
    concepto: 'Base en EC2 contra RDS',
    tema: 'Bases relacionales',
    texto: 'Un equipo instala MySQL por su cuenta en una instancia EC2. Según el modelo de responsabilidad compartida, ¿quién parcha el sistema operativo y el motor?',
    opciones: [
      'AWS, porque la instancia vive en su centro de datos',
      'Nadie: EC2 se actualiza solo',
      'El cliente, porque administra la instancia y todo lo que instala en ella',
      'AWS parcha el sistema operativo y el cliente nunca toca el motor'
    ],
    correcta: 2,
    explicacion: 'En EC2 el cliente administra el sistema operativo y lo que instala. Si quiere que AWS se encargue de los parches del motor, usa RDS.'
  },
  {
    id: 'p05',
    concepto: 'Multi-AZ',
    tema: 'Disponibilidad y respaldos',
    texto: 'Una base RDS debe seguir funcionando aunque falle toda una zona de disponibilidad. ¿Qué se activa?',
    opciones: [
      'Una réplica de lectura en la misma zona de disponibilidad, para tener dos copias',
      'Una implementación Multi-AZ, con una copia en espera en otra zona',
      'Una regla de ciclo de vida hacia Glacier',
      'Más memoria en el tipo de instancia'
    ],
    correcta: 1,
    explicacion: 'Multi-AZ mantiene una copia sincronizada en otra zona. Si la principal falla, RDS cambia sola a la copia (failover) sin que la aplicación cambie de dirección.'
  },
  {
    id: 'p06',
    concepto: 'Réplicas de lectura',
    tema: 'Disponibilidad y respaldos',
    texto: 'Una tienda en línea tiene muchas más consultas de lectura que escrituras y su base RDS ya va lenta. ¿Qué le ayuda a repartir las lecturas?',
    opciones: [
      'Crear réplicas de lectura (read replicas)',
      'Activar el cifrado con KMS',
      'Cambiar el motor a SQL Server',
      'Bajar el periodo de respaldos automáticos a un solo día para que pese menos'
    ],
    correcta: 0,
    explicacion: 'Las réplicas de lectura reciben una copia de los datos y atienden consultas de solo lectura. Así la base principal queda libre para las escrituras.'
  },
  {
    id: 'p07',
    concepto: 'Respaldos automáticos',
    tema: 'Disponibilidad y respaldos',
    texto: 'Alguien borró una tabla a las 10:15. ¿Qué función de RDS permite regresar la base a como estaba a las 10:14?',
    opciones: [
      'Las réplicas de lectura',
      'Block Public Access',
      'El cambio automático a la copia en espera de otra zona de disponibilidad (failover)',
      'Los respaldos automáticos con restauración a un punto en el tiempo'
    ],
    correcta: 3,
    explicacion: 'Los respaldos automáticos guardan la base y sus cambios durante hasta 35 días: se puede restaurar a cualquier segundo de ese periodo. Una réplica copiaría también el borrado.'
  },
  {
    id: 'p08',
    concepto: 'Multi-AZ no escala lecturas',
    tema: 'Disponibilidad y respaldos',
    texto: 'Un alumno dice: “Con Multi-AZ tengo dos bases, así que reparto las consultas entre las dos”. ¿Qué está mal?',
    opciones: [
      'Nada, Multi-AZ sirve exactamente para eso',
      'Multi-AZ solo funciona con DynamoDB',
      'La copia en espera de Multi-AZ es para disponibilidad: para repartir lecturas se usan réplicas de lectura',
      'Multi-AZ guarda las copias en otra región'
    ],
    correcta: 2,
    explicacion: 'En la forma clásica de Multi-AZ la copia en espera no atiende consultas: solo entra si falla la principal. Para repartir lecturas existen las réplicas de lectura.'
  },
  {
    id: 'p09',
    concepto: 'Amazon DynamoDB',
    tema: 'NoSQL y DynamoDB',
    texto: 'Una app de videojuegos necesita guardar el puntaje de millones de jugadores y leerlo en milisegundos, sin administrar servidores. ¿Qué servicio usa?',
    opciones: [
      'Amazon Redshift',
      'Amazon RDS for Oracle',
      'Amazon DynamoDB',
      'Amazon Neptune'
    ],
    correcta: 2,
    explicacion: 'DynamoDB es una base NoSQL de clave-valor, sin servidores, que responde en milisegundos a cualquier escala.'
  },
  {
    id: 'p10',
    concepto: 'Capacidad bajo demanda',
    tema: 'NoSQL y DynamoDB',
    texto: 'Una tabla de DynamoDB recibe tráfico impredecible: días sin uso y picos repentinos. ¿Qué modo de capacidad conviene?',
    opciones: [
      'Bajo demanda (on-demand): paga por cada lectura y escritura',
      'Provisionado, reservando todo el año la capacidad que se necesita en el pico',
      'Una instancia reservada por tres años',
      'Multi-AZ'
    ],
    correcta: 0,
    explicacion: 'En modo bajo demanda DynamoDB atiende lo que llegue y cobra por petición. El modo provisionado conviene cuando el tráfico es estable y predecible.'
  },
  {
    id: 'p11',
    concepto: 'Tablas globales',
    tema: 'NoSQL y DynamoDB',
    texto: 'Una app tiene usuarios en América y en Europa, y quiere que cada uno lea y escriba en una tabla de DynamoDB cercana. ¿Qué usa?',
    opciones: [
      'Una réplica de lectura de RDS',
      'Amazon ElastiCache',
      'Una VPC con dos subredes',
      'DynamoDB Global Tables'
    ],
    correcta: 3,
    explicacion: 'Las tablas globales replican una tabla de DynamoDB en varias regiones, y en todas se puede leer y escribir.'
  },
  {
    id: 'p12',
    concepto: 'Relacional contra NoSQL',
    tema: 'NoSQL y DynamoDB',
    texto: '¿Cuál es una diferencia real entre una base relacional y DynamoDB?',
    opciones: [
      'La relacional no puede guardar números',
      'La relacional usa tablas con esquema fijo y relaciones (SQL); DynamoDB guarda elementos por clave y cada uno puede tener atributos distintos',
      'DynamoDB solo funciona en una zona de disponibilidad',
      'Las bases relacionales no se pueden respaldar'
    ],
    correcta: 1,
    explicacion: 'Una base relacional exige un esquema y une tablas con SQL. DynamoDB busca por clave y no exige que todos los elementos tengan las mismas columnas.'
  },
  {
    id: 'p13',
    concepto: 'Amazon ElastiCache',
    tema: 'Caché y análisis',
    texto: 'Una página consulta mil veces por minuto los mismos productos y la base RDS ya no aguanta. ¿Qué servicio guarda esas respuestas en memoria?',
    opciones: [
      'Amazon ElastiCache',
      'Amazon S3 Glacier',
      'AWS DMS',
      'Amazon Redshift'
    ],
    correcta: 0,
    explicacion: 'ElastiCache (Redis, Valkey o Memcached) guarda en memoria las respuestas más pedidas: la app lee de la caché en microsegundos y la base descansa.'
  },
  {
    id: 'p14',
    concepto: 'DynamoDB Accelerator',
    tema: 'Caché y análisis',
    texto: 'Una tabla de DynamoDB ya responde en milisegundos, pero una función necesita microsegundos al leer. ¿Qué se agrega?',
    opciones: [
      'Una réplica de lectura de Aurora',
      'Amazon Athena',
      'DynamoDB Accelerator (DAX)',
      'Un volumen EBS io2'
    ],
    correcta: 2,
    explicacion: 'DAX es una caché en memoria hecha para DynamoDB: baja las lecturas de milisegundos a microsegundos sin cambiar la forma de consultar.'
  },
  {
    id: 'p15',
    concepto: 'Amazon Redshift',
    tema: 'Caché y análisis',
    texto: 'El área de finanzas quiere analizar diez años de ventas, con consultas que suman y comparan miles de millones de filas. ¿Qué servicio está hecho para eso?',
    opciones: [
      'Amazon DynamoDB',
      'Amazon ElastiCache',
      'Amazon RDS for MySQL con una réplica',
      'Amazon Redshift'
    ],
    correcta: 3,
    explicacion: 'Redshift es el almacén de datos (data warehouse) de AWS: está hecho para análisis sobre enormes volúmenes, no para las transacciones del día a día.'
  },
  {
    id: 'p16',
    concepto: 'Amazon Athena',
    tema: 'Caché y análisis',
    texto: 'Unos archivos de registros ya están en S3 y se quieren consultar con SQL, sin cargar nada en una base ni administrar servidores. ¿Qué se usa?',
    opciones: [
      'Amazon Neptune',
      'Amazon Athena',
      'Amazon ElastiCache',
      'AWS Snowball'
    ],
    correcta: 1,
    explicacion: 'Athena consulta con SQL los archivos que ya viven en S3. No hay servidores y se paga por los datos que lee cada consulta.'
  },
  {
    id: 'p17',
    concepto: 'Bases para cada propósito',
    tema: 'Elegir y migrar',
    texto: 'Una red social quiere sugerir “amigos de tus amigos” recorriendo millones de relaciones entre personas. ¿Qué base está hecha para eso?',
    opciones: [
      'Amazon Neptune, una base de grafos',
      'Amazon Redshift',
      'S3 Standard',
      'Amazon DocumentDB'
    ],
    correcta: 0,
    explicacion: 'Neptune es la base de grafos de AWS: guarda nodos y relaciones, ideal para redes sociales, recomendaciones y detección de fraudes.'
  },
  {
    id: 'p18',
    concepto: 'AWS DMS',
    tema: 'Elegir y migrar',
    texto: 'Una empresa quiere pasar su base de datos a AWS sin detener su sistema: la base original debe seguir funcionando durante la migración. ¿Qué servicio usa?',
    opciones: [
      'AWS Snowball Edge',
      'Amazon Athena',
      'AWS Database Migration Service (DMS)',
      'Amazon CloudFront'
    ],
    correcta: 2,
    explicacion: 'DMS copia los datos y los cambios que siguen llegando mientras la base original sigue en uso, así que el corte final es de minutos.'
  },
  {
    id: 'p19',
    concepto: 'Amazon DocumentDB',
    tema: 'Elegir y migrar',
    texto: 'Una aplicación usa MongoDB y su equipo quiere una base administrada compatible, sin reescribir el código. ¿Cuál elige?',
    opciones: [
      'Amazon Aurora PostgreSQL',
      'Amazon Keyspaces',
      'Amazon Redshift',
      'Amazon DocumentDB'
    ],
    correcta: 3,
    explicacion: 'DocumentDB es la base de documentos (JSON) de AWS, compatible con MongoDB. Keyspaces es la compatible con Cassandra.'
  },
  {
    id: 'p20',
    concepto: 'La negación explícita',
    tema: 'Elegir y migrar',
    texto: 'En el laboratorio, al pulsar Create database apareció “explicit deny in a service control policy”. ¿Qué significa?',
    opciones: [
      'Que faltaba elegir el motor de la base',
      'Que una política de la organización niega esa acción, y una negación explícita gana a cualquier permiso',
      'Que la región us-east-1 no ofrece RDS',
      'Que hay que pagar la capa gratuita antes de crear una base'
    ],
    correcta: 1,
    explicacion: 'Una SCP pone el límite de lo que puede hacer una cuenta. Si niega algo de forma explícita, ningún permiso lo puede volver a permitir. Lo viste en la sesión 2 y otra vez en este laboratorio.'
  }
];

/** Lo que sí puede ver el alumno: sin la correcta ni la explicación. */
export function practicaPublica() {
  return PREGUNTAS.map(({ id, tema, texto, opciones, fijo }) => ({ id, tema, texto, opciones, fijo: Boolean(fijo) }));
}

/** Califica un objeto { p01: 2, p02: 0, … }. Lo que no sea un índice válido cuenta como error. */
export function calificar(respuestas) {
  const detalle = PREGUNTAS.map((p) => {
    const elegida = respuestas?.[p.id];
    const valida = Number.isInteger(elegida) && elegida >= 0 && elegida < p.opciones.length;
    return {
      id: p.id,
      tema: p.tema,
      elegida: valida ? elegida : null,
      correcta: valida && elegida === p.correcta
    };
  });
  return { aciertos: detalle.filter((d) => d.correcta).length, total: PREGUNTAS.length, detalle };
}
