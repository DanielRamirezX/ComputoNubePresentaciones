// El examen de práctica de la sesión 4 (almacenamiento): 20 preguntas al estilo
// del examen AWS Certified Cloud Practitioner (CLF-C02). Mismas reglas que los
// otros bancos (ver src/practica.js): la respuesta correcta vive solo en el
// servidor, la clave está balanceada (5 en A, 5 en B, 5 en C y 5 en D, sin
// rachas de tres) y cada distractor es una confusión real.
// Corre `npm run verificar` si cambias algo.

export const TEMAS = ['Amazon S3', 'Clases de almacenamiento', 'Discos y archivos', 'Respaldos y migración', 'Protección de los datos'];

// Qué lecciones del curso repasar cuando un tema sale bajo.
export const REPASO = {
  'Amazon S3': ['s4-s3', 's4-lab-almacenamiento'],
  'Clases de almacenamiento': ['s4-s3', 's4-ex-clases'],
  'Discos y archivos': ['s4-discos', 's4-ex-disco', 's4-ex-almacen'],
  'Respaldos y migración': ['s4-discos', 's4-mover', 's4-ex-snowball'],
  'Protección de los datos': ['s4-seguridad', 's4-ex-versionado']
};

// Lo que se muestra antes de empezar y en el desplegable de cada pregunta.
export const CASO = `
  <p>Este examen se parece al de la certificación <strong>AWS Certified Cloud Practitioner (CLF-C02)</strong>. El almacenamiento entra en el dominio de <strong>tecnología y servicios</strong>, el que más pesa (34&nbsp;%).</p>
  <ul>
    <li>En el examen real son <strong>65 preguntas en 90 minutos</strong> y se aprueba con <strong>700 de 1000</strong>.</li>
    <li>Busca la <strong>palabra clave</strong>: “casi nunca se consulta”, “varias instancias a la vez”, “conexión lenta”, “borrado accidental”…</li>
    <li>Si dos clases parecen correctas, elige la más barata que cumpla el requisito.</li>
  </ul>`;

export const PREGUNTAS = [
  {
    id: 'p01',
    concepto: 'Qué guarda S3',
    tema: 'Amazon S3',
    texto: '¿Qué tipo de almacenamiento ofrece Amazon S3?',
    opciones: [
      'Almacenamiento en bloque para una instancia',
      'Almacenamiento de objetos dentro de buckets',
      'Un sistema de archivos compartido por NFS',
      'Una base de datos relacional administrada'
    ],
    correcta: 1,
    explicacion: 'S3 guarda objetos (archivos y sus metadatos) dentro de buckets. El bloque es EBS y el sistema de archivos compartido es EFS.'
  },
  {
    id: 'p02',
    concepto: 'Durabilidad de S3',
    tema: 'Amazon S3',
    texto: '¿Qué durabilidad ofrece S3 Standard para los objetos?',
    opciones: [
      '99.9 %, igual que un disco de computadora',
      '99 % durante el primer año',
      '50 % si el objeto pesa más de 5 GB',
      '99.999999999 % (11 nueves)'
    ],
    correcta: 3,
    explicacion: 'S3 guarda copias en varias zonas y ofrece 11 nueves de durabilidad: perder un objeto es prácticamente imposible.'
  },
  {
    id: 'p03',
    concepto: 'Nombres de bucket',
    tema: 'Amazon S3',
    texto: 'Un alumno no puede crear el bucket “fotos” aunque nunca lo había usado. ¿Por qué?',
    opciones: [
      'Los nombres de bucket son únicos en todo el mundo y alguien más ya lo tiene',
      'Los nombres de bucket deben llevar mayúsculas',
      'Solo el usuario raíz puede crear buckets',
      'Cada región admite un solo bucket'
    ],
    correcta: 0,
    explicacion: 'Aunque el bucket vive en una región, su nombre es global: si otra cuenta de AWS ya usa “fotos”, nadie más puede usarlo.'
  },
  {
    id: 'p04',
    concepto: 'Sitio web estático',
    tema: 'Amazon S3',
    texto: 'Una escuela quiere publicar un sitio web hecho solo con HTML, CSS e imágenes, sin servidores que administrar. ¿Qué servicio usa?',
    opciones: [
      'Un volumen EBS conectado a un servidor web que hay que mantener',
      'Amazon EFS',
      'Amazon S3 con alojamiento de sitio web estático',
      'Un instance store'
    ],
    correcta: 2,
    explicacion: 'S3 puede servir sitios web estáticos directamente, sin servidores. Se suele combinar con CloudFront.'
  },
  {
    id: 'p05',
    concepto: 'Intelligent-Tiering',
    tema: 'Clases de almacenamiento',
    texto: 'Una empresa no sabe qué tan seguido se consultarán unos datos y quiere ahorrar sin vigilarlos. ¿Qué clase usa?',
    opciones: [
      'S3 Intelligent-Tiering',
      'S3 Glacier Deep Archive',
      'S3 One Zone-IA',
      'S3 Standard'
    ],
    correcta: 0,
    explicacion: 'Intelligent-Tiering mueve los objetos solo entre niveles según su uso real. Es la respuesta cuando el patrón de acceso es desconocido.'
  },
  {
    id: 'p06',
    concepto: 'Glacier Deep Archive',
    tema: 'Clases de almacenamiento',
    texto: 'Un banco debe guardar registros durante 10 años por ley y casi nunca los consulta. Puede esperar horas si alguna vez los necesita. ¿Qué clase es la más barata?',
    opciones: [
      'S3 Standard',
      'S3 Standard-IA',
      'S3 Glacier Deep Archive',
      'S3 Intelligent-Tiering'
    ],
    correcta: 2,
    explicacion: 'Glacier Deep Archive es la clase más barata de S3, pensada para archivo de largo plazo con recuperación en horas.'
  },
  {
    id: 'p07',
    concepto: 'One Zone-IA',
    tema: 'Clases de almacenamiento',
    texto: 'Unas miniaturas de imágenes se leen poco y, si se pierden, se pueden volver a generar. ¿Qué clase conviene para ahorrar?',
    opciones: [
      'S3 Glacier Deep Archive',
      'S3 One Zone-IA',
      'S3 Standard',
      'Un volumen EBS io2'
    ],
    correcta: 1,
    explicacion: 'One Zone-IA guarda los datos en una sola zona y cuesta menos. Sirve para datos poco usados que se pueden recrear.'
  },
  {
    id: 'p08',
    concepto: 'Reglas de ciclo de vida',
    tema: 'Clases de almacenamiento',
    texto: 'Una empresa quiere que sus archivos pasen solos a Standard-IA a los 30 días y a Glacier al año. ¿Qué configura?',
    opciones: [
      'Block Public Access',
      'Una réplica de los objetos en otra región de AWS',
      'Un snapshot de EBS',
      'Una regla de ciclo de vida en el bucket'
    ],
    correcta: 3,
    explicacion: 'Las reglas de ciclo de vida mueven objetos entre clases o los borran según su edad, de forma automática.'
  },
  {
    id: 'p09',
    concepto: 'Amazon EBS',
    tema: 'Discos y archivos',
    texto: '¿Qué servicio ofrece los discos que usan las instancias EC2 para su sistema operativo?',
    opciones: [
      'Amazon EBS',
      'Amazon S3 Glacier',
      'AWS Snowball',
      'Amazon CloudFront'
    ],
    correcta: 0,
    explicacion: 'Amazon EBS da volúmenes de bloque, como discos duros, para las instancias EC2. Persisten aunque se detenga la instancia.'
  },
  {
    id: 'p10',
    concepto: 'Amazon EFS',
    tema: 'Discos y archivos',
    texto: 'Varias instancias Linux en distintas zonas deben leer y escribir los mismos archivos al mismo tiempo. ¿Qué servicio usan?',
    opciones: [
      'Un volumen EBS por instancia',
      'Amazon EFS',
      'El instance store',
      'S3 Glacier Flexible Retrieval'
    ],
    correcta: 1,
    explicacion: 'EFS es un sistema de archivos compartido (NFS) que montan muchas instancias Linux a la vez, en varias zonas.'
  },
  {
    id: 'p11',
    concepto: 'Instance store',
    tema: 'Discos y archivos',
    texto: '¿Qué pasa con los datos del instance store cuando se detiene la instancia?',
    opciones: [
      'Se copian solos a un snapshot',
      'Se mueven a S3 Standard',
      'Se pierden: el instance store es temporal',
      'Se conservan en el disco durante 30 días más'
    ],
    correcta: 2,
    explicacion: 'El instance store es un disco pegado al servidor físico: es muy rápido, pero sus datos se pierden al detener o terminar la instancia.'
  },
  {
    id: 'p12',
    concepto: 'Zona de un volumen EBS',
    tema: 'Discos y archivos',
    texto: 'Un volumen EBS creado en us-east-1a debe usarse en una instancia de us-east-1b. ¿Qué se hace?',
    opciones: [
      'Se conecta directo a la instancia, porque ambas están en la misma región',
      'Se cambia su clase a Intelligent-Tiering',
      'Se le activa el versionado',
      'Se toma un snapshot y se crea un volumen nuevo en us-east-1b'
    ],
    correcta: 3,
    explicacion: 'Un volumen EBS solo se conecta a instancias de su misma zona. Para moverlo se toma un snapshot y se crea un volumen en la otra zona.'
  },
  {
    id: 'p13',
    concepto: 'Snapshots incrementales',
    tema: 'Respaldos y migración',
    texto: '¿Qué guarda el segundo snapshot de un mismo volumen EBS?',
    opciones: [
      'Una copia completa del volumen otra vez',
      'Solo los bloques que cambiaron desde el anterior',
      'Únicamente los archivos de configuración',
      'Nada: solo se permite un snapshot por volumen'
    ],
    correcta: 1,
    explicacion: 'Los snapshots son incrementales: después del primero, cada uno guarda solo los bloques que cambiaron. Por eso son baratos.'
  },
  {
    id: 'p14',
    concepto: 'AWS Snowball',
    tema: 'Respaldos y migración',
    texto: 'Un hospital debe mover 100 TB a AWS y su conexión a internet es lenta. ¿Qué servicio lo resuelve?',
    opciones: [
      'AWS Snowball Edge',
      'Amazon EFS',
      'Un VPC endpoint de S3',
      'S3 Transfer Acceleration'
    ],
    correcta: 0,
    explicacion: 'Snowball Edge es un aparato físico que AWS envía: se llena con los datos y se regresa. Sirve cuando la red tardaría demasiado.'
  },
  {
    id: 'p15',
    concepto: 'Storage Gateway',
    tema: 'Respaldos y migración',
    texto: 'Una oficina quiere que sus servidores locales sigan viendo una unidad de red normal, pero que los datos se guarden en S3. ¿Qué usa?',
    opciones: [
      'AWS Snowball',
      'Amazon EBS',
      'AWS Transfer Family',
      'AWS Storage Gateway'
    ],
    correcta: 3,
    explicacion: 'Storage Gateway es almacenamiento híbrido: presenta una unidad local a los servidores y guarda los datos en la nube.'
  },
  {
    id: 'p16',
    concepto: 'AWS Backup',
    tema: 'Respaldos y migración',
    texto: 'Una empresa quiere programar y revisar desde un solo lugar los respaldos de sus volúmenes EBS, bases de datos RDS y sistemas EFS. ¿Qué servicio usa?',
    opciones: [
      'Amazon S3 Glacier',
      'AWS DataSync',
      'AWS Backup',
      'Amazon CloudWatch'
    ],
    correcta: 2,
    explicacion: 'AWS Backup centraliza y automatiza los respaldos de muchos servicios (EBS, RDS, EFS, DynamoDB y más) con políticas.'
  },
  {
    id: 'p17',
    concepto: 'Versionado',
    tema: 'Protección de los datos',
    texto: '¿Qué configuración de S3 permite recuperar un objeto que alguien borró o sobrescribió por error?',
    opciones: [
      'El cifrado SSE-S3',
      'Block Public Access',
      'La clase One Zone-IA',
      'El versionado del bucket'
    ],
    correcta: 3,
    explicacion: 'Con el versionado, S3 guarda cada versión de un objeto. Un borrado solo agrega una marca y la versión anterior se puede recuperar.'
  },
  {
    id: 'p18',
    concepto: 'Block Public Access',
    tema: 'Protección de los datos',
    texto: '¿Qué función de S3 evita que un bucket o sus objetos queden públicos en internet por un error de configuración?',
    opciones: [
      'Las reglas de ciclo de vida',
      'S3 Block Public Access',
      'S3 Intelligent-Tiering',
      'Los snapshots de EBS'
    ],
    correcta: 1,
    explicacion: 'Block Public Access bloquea cualquier acceso público al bucket, aunque alguien le dé permisos por error. Viene encendido por omisión.'
  },
  {
    id: 'p19',
    concepto: 'Cifrado en reposo',
    tema: 'Protección de los datos',
    texto: '¿Cómo se cifran por omisión los objetos nuevos que se guardan en S3?',
    opciones: [
      'No se cifran hasta que el cliente lo pida',
      'Con una contraseña que escribe cada usuario',
      'Automáticamente, con llaves administradas por S3 (SSE-S3)',
      'Solo si el bucket está en la región de N. Virginia'
    ],
    correcta: 2,
    explicacion: 'S3 cifra automáticamente todo objeto nuevo con SSE-S3. Si se necesita más control, se puede usar una llave de KMS (SSE-KMS).'
  },
  {
    id: 'p20',
    concepto: 'Permisos para guardar en S3',
    tema: 'Protección de los datos',
    texto: 'Un usuario puede crear buckets pero, al subir un archivo, recibe “Insufficient permission” por s3:PutObject. ¿Qué pasa?',
    opciones: [
      'Le falta el permiso para guardar objetos: crear buckets y subir archivos son acciones distintas',
      'El bucket está lleno y no admite más objetos',
      'Solo se pueden subir archivos a buckets de Glacier',
      'Hay que activar el versionado del bucket antes de poder subir cualquier archivo'
    ],
    correcta: 0,
    explicacion: 'En IAM cada acción es un permiso aparte. Tener s3:CreateBucket no da s3:PutObject. Lo viste en el laboratorio.'
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
