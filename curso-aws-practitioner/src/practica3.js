// El examen de práctica de la sesión 3 (redes en AWS): 20 preguntas al estilo
// del examen AWS Certified Cloud Practitioner (CLF-C02). Mismas reglas que los
// otros bancos (ver src/practica.js): la respuesta correcta vive solo en el
// servidor, la clave está balanceada (5 en A, 5 en B, 5 en C y 5 en D, sin
// rachas de tres) y cada distractor es una confusión real.
// Corre `npm run verificar` si cambias algo.

export const TEMAS = ['VPC y subredes', 'Rutas y gateways', 'Conectar redes', 'DNS y entrega de contenido', 'Seguridad de la red'];

// Qué lecciones del curso repasar cuando un tema sale bajo.
export const REPASO = {
  'VPC y subredes': ['s3-vpc', 's3-ex-subredes'],
  'Rutas y gateways': ['s3-vpc', 's3-lab-vpc', 's3-ex-destinos'],
  'Conectar redes': ['s3-conectar', 's3-ex-conexion'],
  'DNS y entrega de contenido': ['s3-borde', 's3-ex-borde'],
  'Seguridad de la red': ['s3-vpc', 's3-ex-tu-subred']
};

// Lo que se muestra antes de empezar y en el desplegable de cada pregunta.
export const CASO = `
  <p>Este examen se parece al de la certificación <strong>AWS Certified Cloud Practitioner (CLF-C02)</strong>. Las redes entran en el dominio de <strong>tecnología y servicios</strong>, el que más pesa (34&nbsp;%).</p>
  <ul>
    <li>En el examen real son <strong>65 preguntas en 90 minutos</strong> y se aprueba con <strong>700 de 1000</strong>.</li>
    <li>Busca la <strong>palabra clave</strong>: “sin pasar por internet”, “usuarios de todo el mundo”, “si la región falla”, “solo salir”…</li>
    <li>Recuerda qué es global (Route 53, CloudFront) y qué es regional (VPC).</li>
  </ul>`;

export const PREGUNTAS = [
  {
    id: 'p01',
    concepto: 'Qué es una VPC',
    tema: 'VPC y subredes',
    texto: '¿Qué es una Amazon VPC?',
    opciones: [
      'Un servidor virtual que se renta por segundo',
      'Un disco que se conecta a una instancia',
      'Una red virtual privada y aislada dentro de una región de AWS',
      'Un servicio para registrar nombres de dominio'
    ],
    correcta: 2,
    explicacion: 'Una VPC es tu propia red aislada dentro de una región: ahí lanzas instancias, bases de datos y balanceadores.'
  },
  {
    id: 'p02',
    concepto: 'Dónde vive una subred',
    tema: 'VPC y subredes',
    texto: 'Al crear una subred, ¿dónde queda?',
    opciones: [
      'En una sola zona de disponibilidad',
      'En todas las zonas de la región a la vez',
      'En una ubicación de borde cerca de los usuarios',
      'En varias regiones para tener respaldo'
    ],
    correcta: 0,
    explicacion: 'Cada subred vive en una sola zona de disponibilidad. Para alta disponibilidad se crean subredes en varias zonas.'
  },
  {
    id: 'p03',
    concepto: 'Alta disponibilidad en la red',
    tema: 'VPC y subredes',
    texto: 'Una aplicación debe seguir funcionando si se cae un centro de datos completo. ¿Cómo se distribuyen sus servidores?',
    opciones: [
      'Todos en una subred grande con un CIDR /16',
      'En una sola zona, pero con instancias más grandes',
      'En una ubicación de borde de CloudFront',
      'En subredes de al menos dos zonas de disponibilidad'
    ],
    correcta: 3,
    explicacion: 'Las zonas de disponibilidad son centros de datos separados. Repartir la aplicación en dos o más zonas la protege si una falla.'
  },
  {
    id: 'p04',
    concepto: 'Dónde va la base de datos',
    tema: 'VPC y subredes',
    texto: 'En una aplicación web de tres capas, ¿dónde se recomienda colocar la base de datos?',
    opciones: [
      'En una subred pública, para que los clientes la consulten directo',
      'En una subred privada, sin acceso directo desde internet',
      'Fuera de la VPC, en una ubicación de borde',
      'En la misma subred pública que el balanceador de carga'
    ],
    correcta: 1,
    explicacion: 'Lo que guarda datos va en subredes privadas: nadie de internet debe llegar a la base de datos directamente.'
  },
  {
    id: 'p05',
    concepto: 'Qué hace pública a una subred',
    tema: 'Rutas y gateways',
    texto: '¿Qué convierte a una subred en pública?',
    opciones: [
      'Una ruta 0.0.0.0/0 hacia un Internet Gateway en su tabla de rutas',
      'Ponerle un nombre que empiece con “publica”',
      'Crearla en la zona us-east-1a',
      'Asignarle un CIDR más grande que /24'
    ],
    correcta: 0,
    explicacion: 'Una subred es pública cuando su tabla de rutas manda el tráfico de internet (0.0.0.0/0) a un Internet Gateway. El nombre y la zona no importan.'
  },
  {
    id: 'p06',
    concepto: 'NAT Gateway',
    tema: 'Rutas y gateways',
    texto: 'Servidores en una subred privada deben descargar actualizaciones de internet, pero nadie de internet debe poder conectarse a ellos. ¿Qué se usa?',
    opciones: [
      'Un Internet Gateway en la subred privada',
      'Una IP pública para cada servidor',
      'Un NAT Gateway en una subred pública',
      'Un VPC Peering con otra cuenta de AWS'
    ],
    correcta: 2,
    explicacion: 'El NAT Gateway deja salir el tráfico de lo privado hacia internet y bloquea las conexiones que empiezan afuera.'
  },
  {
    id: 'p07',
    concepto: 'Tablas de rutas',
    tema: 'Rutas y gateways',
    texto: '¿Qué controla una tabla de rutas?',
    opciones: [
      'Qué usuarios de IAM pueden entrar a la VPC',
      'Hacia dónde se dirige el tráfico que sale de una subred',
      'Qué puertos están abiertos en cada instancia',
      'Cuánto cuesta el tráfico entre regiones'
    ],
    correcta: 1,
    explicacion: 'La tabla de rutas dice a dónde va el tráfico de cada subred: dentro de la VPC (local), a internet, a un NAT o a otra red. Los puertos los controlan los grupos de seguridad y las NACL.'
  },
  {
    id: 'p08',
    concepto: 'Gateway endpoint de S3',
    tema: 'Rutas y gateways',
    texto: 'Instancias en una subred privada deben leer archivos de S3 sin que el tráfico salga a internet. ¿Qué se agrega?',
    opciones: [
      'Un Internet Gateway',
      'Una distribución de CloudFront',
      'Una conexión Site-to-Site VPN',
      'Un VPC endpoint de tipo gateway para S3'
    ],
    correcta: 3,
    explicacion: 'El gateway endpoint de S3 agrega una ruta privada al servicio: el tráfico nunca sale de la red de AWS.'
  },
  {
    id: 'p09',
    concepto: 'Direct Connect',
    tema: 'Conectar redes',
    texto: 'Una empresa quiere una conexión privada y dedicada entre su centro de datos y AWS, que no pase por internet. ¿Qué servicio usa?',
    opciones: [
      'AWS Site-to-Site VPN',
      'Amazon CloudFront',
      'AWS Direct Connect',
      'VPC Peering'
    ],
    correcta: 2,
    explicacion: 'Direct Connect es una línea física dedicada hasta AWS: no usa internet y su ancho de banda es estable.'
  },
  {
    id: 'p10',
    concepto: 'Site-to-Site VPN',
    tema: 'Conectar redes',
    texto: 'Una oficina pequeña necesita conectarse con su VPC esta misma semana, de forma cifrada y con poco presupuesto. ¿Qué conviene?',
    opciones: [
      'Una AWS Site-to-Site VPN',
      'AWS Direct Connect',
      'Un AWS Transit Gateway para cientos de VPC',
      'Amazon Route 53 con health checks'
    ],
    correcta: 0,
    explicacion: 'La VPN se configura en minutos, cifra el tráfico y viaja por internet. Direct Connect tarda semanas en instalarse y cuesta más.'
  },
  {
    id: 'p11',
    concepto: 'VPC Peering',
    tema: 'Conectar redes',
    texto: '¿Qué permite un VPC Peering?',
    opciones: [
      'Conectar una VPC con la oficina por una línea dedicada',
      'Conectar dos VPC para que se comuniquen con IP privadas',
      'Repartir tráfico web entre varias instancias',
      'Registrar un nombre de dominio para la VPC'
    ],
    correcta: 1,
    explicacion: 'Un VPC Peering une dos VPC (incluso de otra cuenta o región) para que hablen por IP privadas, sin pasar por internet.'
  },
  {
    id: 'p12',
    concepto: 'Transit Gateway',
    tema: 'Conectar redes',
    texto: 'Una empresa tiene 80 VPC y varias oficinas, y conectarlas todas por pares se volvió inmanejable. ¿Qué servicio simplifica la red?',
    opciones: [
      'Un VPC Peering entre cada par de VPC',
      'Un Internet Gateway por cada VPC',
      'Amazon CloudFront con muchas ubicaciones de borde',
      'AWS Transit Gateway como punto central'
    ],
    correcta: 3,
    explicacion: 'Transit Gateway funciona como un hub: cada VPC y cada oficina se conecta una vez y todas se pueden comunicar.'
  },
  {
    id: 'p13',
    concepto: 'Route 53',
    tema: 'DNS y entrega de contenido',
    texto: '¿Qué servicio de AWS traduce nombres de dominio a direcciones IP y permite registrar dominios?',
    opciones: [
      'Amazon Route 53',
      'Amazon CloudFront',
      'AWS Global Accelerator',
      'Amazon VPC'
    ],
    correcta: 0,
    explicacion: 'Route 53 es el servicio DNS de AWS: registra dominios, responde consultas DNS y revisa la salud de los servidores.'
  },
  {
    id: 'p14',
    concepto: 'CloudFront',
    tema: 'DNS y entrega de contenido',
    texto: 'Usuarios de Asia y Europa se quejan de que las imágenes de un sitio alojado en N. Virginia cargan lento. ¿Qué lo mejora?',
    opciones: [
      'Un NAT Gateway en cada región',
      'Más subredes en la VPC de N. Virginia',
      'Amazon CloudFront para servir las imágenes desde ubicaciones de borde',
      'Un VPC Peering con regiones de Asia y Europa'
    ],
    correcta: 2,
    explicacion: 'CloudFront guarda copias del contenido en ubicaciones de borde cerca de los usuarios, así cargan mucho más rápido.'
  },
  {
    id: 'p15',
    concepto: 'Enrutamiento por conmutación por error',
    tema: 'DNS y entrega de contenido',
    texto: 'Si la región principal de una aplicación falla, los usuarios deben llegar automáticamente a la región de respaldo. ¿Qué se configura?',
    opciones: [
      'Una distribución de CloudFront sin caché',
      'Un NAT Gateway en la región de respaldo',
      'Un VPC Peering entre las dos regiones',
      'Route 53 con health checks y enrutamiento de conmutación por error'
    ],
    correcta: 3,
    explicacion: 'Route 53 revisa la salud de la región principal y, si falla, responde con la dirección del respaldo.'
  },
  {
    id: 'p16',
    concepto: 'Global Accelerator',
    tema: 'DNS y entrega de contenido',
    texto: 'Un videojuego en línea usa UDP y necesita dos IP fijas y menor latencia para jugadores de todo el mundo. ¿Qué servicio lo resuelve?',
    opciones: [
      'Amazon CloudFront',
      'AWS Global Accelerator',
      'AWS Site-to-Site VPN',
      'Un Internet Gateway adicional'
    ],
    correcta: 1,
    explicacion: 'Global Accelerator da IP fijas y lleva el tráfico, incluido el que no es web como UDP, por la red privada de AWS. CloudFront es sobre todo para contenido web.'
  },
  {
    id: 'p17',
    concepto: 'Servicios globales',
    tema: 'Seguridad de la red',
    texto: '¿Cuál de estos servicios es global y no pertenece a una sola región?',
    opciones: [
      'Amazon VPC',
      'Las subredes',
      'Los NAT Gateway',
      'Amazon CloudFront'
    ],
    correcta: 3,
    explicacion: 'CloudFront, Route 53 e IAM son globales. Las VPC, sus subredes y los NAT Gateway son regionales.'
  },
  {
    id: 'p18',
    concepto: 'Capas de seguridad de la red',
    tema: 'Seguridad de la red',
    texto: '¿Qué capa de seguridad actúa a nivel de subred y acepta reglas para negar tráfico?',
    opciones: [
      'La Network ACL',
      'El grupo de seguridad',
      'La tabla de rutas',
      'El Internet Gateway'
    ],
    correcta: 0,
    explicacion: 'La NACL protege subredes completas y acepta reglas de permitir y de negar. El grupo de seguridad protege instancias y solo permite.'
  },
  {
    id: 'p19',
    concepto: 'Registros del tráfico de red',
    tema: 'Seguridad de la red',
    texto: 'Un equipo de seguridad quiere registrar qué tráfico entra y sale de las interfaces de red de su VPC. ¿Qué activa?',
    opciones: [
      'AWS Artifact',
      'Amazon Route 53',
      'VPC Flow Logs',
      'AWS Direct Connect'
    ],
    correcta: 2,
    explicacion: 'VPC Flow Logs registra el tráfico IP que pasa por las interfaces de red de la VPC: sirve para auditar y para resolver problemas.'
  },
  {
    id: 'p20',
    concepto: 'Una instancia sin acceso a internet',
    tema: 'Seguridad de la red',
    texto: 'Una instancia con IP pública está en una subred cuya tabla de rutas solo tiene la ruta local. ¿Qué pasa si alguien intenta abrir su página web?',
    opciones: [
      'Abre, porque la instancia tiene IP pública',
      'No abre: falta una ruta hacia un Internet Gateway',
      'Abre, pero solo desde la misma región',
      'No abre, porque las IP públicas no funcionan en subredes'
    ],
    correcta: 1,
    explicacion: 'Sin ruta 0.0.0.0/0 hacia un Internet Gateway la subred es privada: la IP pública sola no basta. Lo comprobaste en el laboratorio.'
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
