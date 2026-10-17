// Parte teórica del simulacro 1 (martes 20 de octubre de 2026): 5 casos de
// negocio con 5 preguntas cada uno, al estilo del examen AWS Certified Cloud
// Practitioner (CLF-C02), sobre las sesiones 1 a 4 de la Ruta AWS. La respuesta
// correcta y la retroalimentación viven solo en el servidor; la clave está
// balanceada (7 en A, 6 en B, 6 en C y 6 en D, sin rachas de tres) y cada
// distractor es una confusión real. Los casos del simulacro 2 son otros.
// Corre `node src/teoria/verificar-teoria.js` si cambias algo.

import { bancoPublico, calificarBanco } from './comun.js';

export const TEMAS = ['Fundamentos y EC2', 'Identidad y seguridad', 'Redes', 'Almacenamiento'];

export const MINUTOS = 45;

// Lo que se muestra antes de empezar.
export const CASO = `
  <p>Este simulacro se parece al examen <strong>AWS Certified Cloud Practitioner (CLF-C02)</strong>, pero cada pregunta sale de un <strong>caso de negocio</strong>: una empresa mexicana con un problema concreto. Son <strong>5 casos con 5 preguntas cada uno, en 45 minutos</strong>.</p>
  <ul>
    <li><strong>Lee primero la historia</strong> del caso: ahí están los números que vas a necesitar (usuarios, GB, horarios, rangos de IP, presupuesto).</li>
    <li>En cada pregunta busca la <strong>palabra clave</strong>: “lo más barato”, “sin administrar servidores”, “casi nunca se consulta”, “mínimo privilegio”, “sin pasar por internet”…</li>
    <li>Descarta las opciones que <strong>no cumplen</strong> algún requisito del caso; entre las que sí, elige <strong>la más sencilla y barata</strong>.</li>
    <li>Una pregunta sin contestar cuenta como error: no dejes ninguna en blanco.</li>
  </ul>`;

export const CASOS = [
  {
    id: 'c1',
    empresa: 'Clínica Dental Sonrisa Plena',
    titulo: 'Radiografías que no deben perderse',
    historia: `
      <p><strong>Sonrisa Plena</strong> es una clínica dental con tres sucursales en la zona metropolitana de Guadalajara: 12 dentistas y 4 recepcionistas. Guarda radiografías y expedientes en una sola computadora de la recepción, que ya se llenó: son <strong>2 TB</strong>. Su agenda de citas será una aplicación web en EC2.</p>
      <p>Cada radiografía se abre varias veces al día durante las primeras <strong>4 semanas</strong> del tratamiento; después casi nadie la ve, salvo que el paciente regrese (una o dos veces al año), y entonces el dentista la necesita <strong>en ese momento</strong>. La norma de salud obliga a conservar los expedientes <strong>al menos 5 años</strong> y el abogado pide que los datos <strong>no salgan de México</strong>.</p>
      <p>El mes pasado un dentista borró por error la carpeta de un paciente y no hubo forma de recuperarla. Las recepcionistas solo deben ver la agenda; los dentistas, los expedientes, incluso desde su casa.</p>`
  },
  {
    id: 'c2',
    empresa: 'Barro Negro Shop',
    titulo: 'Una tienda que vive de las temporadas',
    historia: `
      <p><strong>Barro Negro Shop</strong> es una tienda en línea de Oaxaca que vende alebrijes y piezas de barro negro; el 40&nbsp;% de sus clientes está en Estados Unidos. Su sitio corre en <strong>un servidor EC2 encendido todo el año</strong> y su dominio, <em>barronegro.mx</em>, está en Route 53.</p>
      <p>En Día de Muertos y en los <strong>4 días del Buen Fin</strong> las visitas se multiplican por ocho y hacen falta <strong>6 servidores extra</strong>, que no pueden caerse a media venta. La base de datos de pedidos corre en otra instancia EC2 y en esos días su disco recibe miles de lecturas y escrituras por segundo.</p>
      <p>El Buen Fin pasado, un ataque DDoS tumbó la página dos horas. Además, un empleado abrió el puerto 22 a todo internet “para probar” y nadie lo notó en semanas. Ahora quieren estrenar un sitio nuevo, pero primero mostrárselo solo al <strong>10&nbsp;%</strong> de los visitantes.</p>`
  },
  {
    id: 'c3',
    empresa: 'Preparatoria Sor Juana',
    titulo: 'Una prepa que estrena plataforma',
    historia: `
      <p>La <strong>Preparatoria Sor Juana</strong>, en Morelia, tiene 900 alumnos y 45 maestros. Su plataforma de tareas (Moodle) corre en <strong>dos instancias EC2 con Linux</strong>, una en cada zona de disponibilidad, que deben leer y escribir <strong>la misma carpeta de tareas</strong> al mismo tiempo.</p>
      <p>El área de sistemas creó la VPC <strong>172.16.0.0/16</strong>. Ahí vivirá un laboratorio virtual de programación que, en semana de exámenes, llega a tener <strong>350 instancias</strong> encendidas a la vez, todas con Python y VS Code. Cada semestre se vuelven a crear y deben quedar listas en segundos.</p>
      <p>Los alumnos entran a Moodle desde su casa por HTTPS; los administradores, por SSH y solo desde la red de la escuela, cuya IP pública es <strong>200.57.123.10</strong>. La semana pasada, un becario subió a un repositorio público de GitHub un script con las llaves de acceso de su usuario de IAM.</p>`
  },
  {
    id: 'c4',
    empresa: 'Ayuntamiento de Santa Lucía del Valle',
    titulo: 'Un municipio que digitaliza su archivo',
    historia: `
      <p>El <strong>Ayuntamiento de Santa Lucía del Valle</strong>, en Hidalgo (85,000 habitantes), mudó a AWS su portal de trámites, donde se paga el predial. Usa dos VPC: <em>trámites</em> (10.20.0.0/16) y <em>catastro</em> (10.30.0.0/16); solo la primera necesita consultar a la segunda.</p>
      <p>De enero a marzo enciende servidores extra para el predial y en abril los detiene (<em>Stop</em>) hasta el año siguiente. Un script en sus datos de usuario descarga las tarifas del año.</p>
      <p>El archivo histórico, con actas digitalizadas desde 1950, ocupa <strong>60 TB</strong> en discos del palacio municipal, cuyo internet es de <strong>50 Mbps</strong>. Cada semana se agregan unos <strong>20 GB</strong> de actas nuevas. Por la ley de transparencia debe publicar en internet sus presupuestos y contratos en PDF, pero las actas tienen datos personales y deben quedar privadas.</p>`
  },
  {
    id: 'c5',
    empresa: 'RutaFresca',
    titulo: 'Una startup que reparte desde la Central de Abasto',
    historia: `
      <p><strong>RutaFresca</strong> es una startup de la Ciudad de México que lleva frutas y verduras de la Central de Abasto a 300 restaurantes, con 40 repartidores y unos 2,500 pedidos al día. Su API recibe a los repartidores por HTTPS (puerto 443) en una subred pública.</p>
      <p>Cada madrugada, de 1:00 a 5:00, un optimizador calcula las rutas del día: carga el mapa completo de la ciudad en memoria y necesita <strong>256 GiB de RAM</strong>, pero poco procesador. Si se interrumpe, puede seguir desde su último avance guardado.</p>
      <p>Sus servidores privados suben unos <strong>2 TB al mes</strong> de fotos de entregas a S3 a través de un NAT Gateway, y esa factura ya preocupa. Una contadora externa revisa las facturas del bucket <em>rutafresca-facturas</em>. El presupuesto es corto: todo debe ser lo más barato posible.</p>`
  }
];

export const PREGUNTAS = [
  /* ------------------------------------------------ c1 · Sonrisa Plena */
  {
    id: 'c1p1',
    caso: 'c1',
    tema: 'Fundamentos y EC2',
    sesion: 1,
    concepto: 'Alta disponibilidad dentro de una región',
    texto: 'Sonrisa Plena quiere que su agenda de citas en EC2 siga funcionando aunque falle un centro de datos completo, sin sacar los datos de México. ¿Qué hace?',
    opciones: [
      {
        texto: 'Lanza instancias en dos zonas de disponibilidad de mx-central-1',
        retro: '¡Correcto! Una región tiene varias zonas de disponibilidad separadas entre sí: si se cae una, la otra sigue atendiendo, y los datos no salen de México (mx-central-1 está en Querétaro). Recuerda: “si falla un centro de datos” → varias zonas.'
      },
      {
        texto: 'Lanza una instancia en mx-central-1 y una copia en us-east-1',
        retro: 'Tendrías respaldo, pero los datos saldrían de México y el abogado lo prohíbe. Dos zonas dentro de la misma región ya te protegen de la caída de un centro de datos.'
      },
      {
        texto: 'Usa una sola instancia, pero de un tipo más grande y con más memoria',
        retro: 'Un tipo más grande aguanta más trabajo, pero sigue en un solo centro de datos: si ese se cae, la agenda se cae con él. Más tamaño no es más disponibilidad.'
      },
      {
        texto: 'Corre la agenda en la ubicación de borde de Guadalajara',
        retro: 'Las ubicaciones de borde guardan copias de contenido para CloudFront y responden consultas de DNS; no corren tus instancias EC2. Tus servidores viven en las zonas de una región.'
      }
    ],
    correcta: 0
  },
  {
    id: 'c1p2',
    caso: 'c1',
    tema: 'Almacenamiento',
    sesion: 4,
    concepto: 'S3 Glacier Instant Retrieval',
    texto: 'A partir del día 30, ¿a qué clase de S3 conviene mandar las radiografías para pagar lo menos posible sin que el dentista tenga que esperar cuando un paciente regresa?',
    opciones: [
      {
        texto: 'S3 Glacier Deep Archive',
        retro: 'Es la más barata de todas, pero recuperar un archivo tarda hasta 12 horas: el paciente ya se habría ido. Úsala cuando puedes esperar horas, como un archivo legal que casi nunca se lee.'
      },
      {
        texto: 'S3 Glacier Instant Retrieval',
        retro: '¡Bien! Es archivo barato para datos que se leen muy poco (una vez al trimestre o menos) y aun así los devuelve en milisegundos. “Casi nunca, pero al instante” → Glacier Instant Retrieval.'
      },
      {
        texto: 'S3 Standard-IA',
        retro: 'También abre al instante y funcionaría, pero guardar ahí cuesta más que en Glacier Instant Retrieval. Standard-IA conviene para lo que se lee cerca de una vez al mes; estas radiografías, una o dos veces al año.'
      },
      {
        texto: 'S3 One Zone-IA',
        retro: 'Guarda los datos en una sola zona: si esa zona se pierde, se pierden con ella. Solo conviene para datos que se pueden volver a generar, y la radiografía de un paciente no se puede repetir.'
      }
    ],
    correcta: 1
  },
  {
    id: 'c1p3',
    caso: 'c1',
    tema: 'Identidad y seguridad',
    sesion: 2,
    concepto: 'Grupos de IAM',
    texto: 'En la cuenta de AWS, las 4 recepcionistas solo deben ver la agenda y los 12 dentistas, los expedientes. ¿Cuál es la mejor forma de darles sus permisos?',
    opciones: [
      {
        texto: 'Pegar una política distinta a cada uno de los 16 usuarios',
        retro: 'Funciona, pero es fácil equivocarse y cada alta o baja te obliga a repetir el trabajo. Cuando varias personas hacen lo mismo, se agrupan.'
      },
      {
        texto: 'Crear una SCP que les dé permiso de ver la agenda y los expedientes',
        retro: 'Una SCP no da permisos: solo pone el techo de lo que una cuenta puede hacer. Los permisos se dan con políticas de IAM.'
      },
      {
        texto: 'Crear los grupos Recepción y Dentistas, cada uno con su política',
        retro: '¡Exacto! El permiso se define una vez por grupo y cada usuario lo hereda; si llega una recepcionista nueva, solo la metes al grupo. Es mínimo privilegio fácil de mantener.'
      },
      {
        texto: 'Un solo usuario de IAM para la clínica, con una contraseña que todos conozcan',
        retro: 'Así nadie sabe quién hizo qué y las recepcionistas verían los expedientes. Cada persona necesita su propio usuario.'
      }
    ],
    correcta: 2
  },
  {
    id: 'c1p4',
    caso: 'c1',
    tema: 'Almacenamiento',
    sesion: 4,
    concepto: 'Versionado y Object Lock',
    texto: 'Para el bucket de expedientes, la clínica quiere poder recuperar un archivo borrado por error y que ningún expediente pueda eliminarse antes de cumplir 5 años, ni siquiera por un administrador. ¿Qué activa?',
    opciones: [
      {
        texto: 'El versionado y Block Public Access',
        retro: 'El versionado cubre el borrado accidental, pero Block Public Access solo impide que el bucket quede público; no impide borrar. A alguien con permisos le bastaría eliminar todas las versiones.'
      },
      {
        texto: 'Una regla de ciclo de vida que mande todo a Glacier Deep Archive',
        retro: 'El ciclo de vida mueve o borra objetos según su edad, pero no impide que alguien los elimine. Y en Deep Archive cada consulta tardaría horas.'
      },
      {
        texto: 'El cifrado con una llave de KMS (SSE-KMS)',
        retro: 'Cifrar evita que alguien lea los datos sin permiso para usar la llave, pero no evita que los borre. Cifrado y protección contra borrado son defensas distintas.'
      },
      {
        texto: 'El versionado y S3 Object Lock con retención de 5 años',
        retro: '¡Correcto! El versionado guarda cada versión para recuperar lo borrado, y Object Lock impide eliminar los objetos durante el plazo que fijes; en modo de cumplimiento, ni el usuario raíz puede. Object Lock = “nadie lo borra antes de tiempo”.'
      }
    ],
    correcta: 3
  },
  {
    id: 'c1p5',
    caso: 'c1',
    tema: 'Redes',
    sesion: 3,
    concepto: 'Client VPN',
    texto: 'Varios dentistas quieren revisar radiografías desde su casa, cada uno desde su laptop, con una conexión cifrada hacia la VPC de la clínica. ¿Qué servicio usan?',
    opciones: [
      {
        texto: 'AWS Site-to-Site VPN',
        retro: 'También cifra, pero conecta una red completa (una oficina con su router) con la VPC. Para que cada persona entre desde su propia laptop está Client VPN.'
      },
      {
        texto: 'AWS Client VPN',
        retro: '¡Bien! Client VPN le da a cada usuario una conexión cifrada desde su computadora hasta la VPC. Palabras clave: “cada empleado desde su laptop” o “trabajo remoto”.'
      },
      {
        texto: 'AWS Direct Connect',
        retro: 'Direct Connect es una línea física dedicada entre un centro de datos y AWS; tarda semanas en instalarse y no llega a la casa de cada dentista.'
      },
      {
        texto: 'VPC Peering',
        retro: 'El peering conecta dos VPC entre sí, no una laptop con una VPC.'
      }
    ],
    correcta: 1
  },

  /* ---------------------------------------------- c2 · Barro Negro Shop */
  {
    id: 'c2p1',
    caso: 'c2',
    tema: 'Fundamentos y EC2',
    sesion: 1,
    concepto: 'Combinar opciones de compra',
    texto: 'Barro Negro Shop tiene un servidor encendido todo el año y necesita 6 servidores extra solo en temporada, sin que se caigan a media venta. ¿Qué combinación es la más barata?',
    opciones: [
      {
        texto: 'Savings Plan para el servidor base y On-Demand para los 6 extras',
        retro: '¡Exacto! Lo que corre 24/7 se paga con compromiso (hasta 72 % menos) y lo que dura unos días, On-Demand: pagas por segundo y lo apagas al terminar. Cada carga, con su forma de pago.'
      },
      {
        texto: 'Instancias Spot para los 7 servidores, porque son las más baratas',
        retro: 'Spot es lo más barato, pero AWS puede recuperar la instancia con 2 minutos de aviso, y aquí no pueden caerse a media venta. Spot es para trabajos que toleran interrupciones.'
      },
      {
        texto: 'Instancias reservadas por 3 años para los 7 servidores',
        retro: 'Para el servidor de todo el año sí convendría, pero reservar los 6 extras te obligaría a pagarlos los 365 días para usarlos unos cuantos.'
      },
      {
        texto: 'Dedicated Hosts para el servidor base y Spot para los extras',
        retro: 'Nada en el caso pide hardware exclusivo, y Dedicated Hosts es de lo más caro. Además, con Spot los servidores de temporada podrían interrumpirse en plena venta.'
      }
    ],
    correcta: 0
  },
  {
    id: 'c2p2',
    caso: 'c2',
    tema: 'Identidad y seguridad',
    sesion: 2,
    concepto: 'Shield Standard y Shield Advanced',
    texto: 'Después del ataque DDoS del Buen Fin, ¿qué protección contra DDoS ya tenía la tienda sin pagar nada y cuál puede contratar para tener al equipo de respuesta de AWS?',
    opciones: [
      {
        texto: 'Ya tenía Shield Advanced gratis; Shield Standard es la versión de pago',
        retro: 'Es al revés: Standard es la gratuita y automática; Advanced es la de pago, con equipo de respuesta.'
      },
      {
        texto: 'Ya tenía GuardDuty; Amazon Inspector es el de pago con equipo de respuesta',
        retro: 'GuardDuty detecta actividad sospechosa en tu cuenta e Inspector busca vulnerabilidades en tus servidores; ninguno de los dos es la defensa contra DDoS.'
      },
      {
        texto: 'No tenía ninguna; debe contratar AWS WAF, lo único que frena un DDoS',
        retro: 'WAF filtra peticiones web dañinas (como la inyección SQL) y ayuda, pero todos los clientes de AWS ya tienen Shield Standard sin costo. La defensa dedicada contra DDoS es Shield.'
      },
      {
        texto: 'Ya tenía Shield Standard, gratis; puede contratar Shield Advanced',
        retro: '¡Correcto! Shield Standard protege a todos los clientes, sin costo, de los ataques DDoS más comunes. Shield Advanced es de pago y agrega al equipo de respuesta de AWS y una protección más avanzada.'
      }
    ],
    correcta: 3
  },
  {
    id: 'c2p3',
    caso: 'c2',
    tema: 'Redes',
    sesion: 3,
    concepto: 'Enrutamiento ponderado en Route 53',
    texto: 'La tienda quiere mostrar su sitio nuevo solo al 10 % de los visitantes de barronegro.mx y al resto, el sitio actual. ¿Qué configura en Route 53?',
    opciones: [
      {
        texto: 'Enrutamiento por conmutación por error (failover)',
        retro: 'Failover manda todo al sitio principal y solo usa el respaldo si el principal falla. No reparte visitantes en porcentajes.'
      },
      {
        texto: 'Enrutamiento por geolocalización',
        retro: 'Geolocalización decide según el país del visitante (Estados Unidos a un sitio y México a otro, por ejemplo), no según un porcentaje.'
      },
      {
        texto: 'Enrutamiento ponderado (weighted)',
        retro: '¡Bien! El enrutamiento ponderado reparte las visitas según los pesos que tú pones: aquí, 90 al sitio actual y 10 al nuevo. Es la forma clásica de probar una versión nueva con pocos usuarios.'
      },
      {
        texto: 'Enrutamiento por latencia',
        retro: 'Por latencia manda a cada visitante a la región que le responde más rápido; sirve cuando tienes el mismo sitio en varias regiones, no para probar una versión nueva.'
      }
    ],
    correcta: 2
  },
  {
    id: 'c2p4',
    caso: 'c2',
    tema: 'Almacenamiento',
    sesion: 4,
    concepto: 'EBS de IOPS provisionadas',
    texto: 'En el Buen Fin, el disco de la base de datos de pedidos debe sostener miles de lecturas y escrituras por segundo, siempre al mismo nivel y sin perder nada. ¿Qué almacenamiento usa?',
    opciones: [
      {
        texto: 'Un volumen EBS SSD de IOPS provisionadas (io2)',
        retro: '¡Correcto! io1 e io2 son los discos EBS para bases de datos exigentes: tú fijas cuántas operaciones por segundo (IOPS) necesitas, y el disco persiste aunque detengas la instancia.'
      },
      {
        texto: 'Un volumen EBS HDD optimizado para rendimiento (st1)',
        retro: 'st1 es barato y bueno para leer mucho en secuencia, como bitácoras o big data, pero es lento para las miles de operaciones pequeñas y al azar de una base de datos.'
      },
      {
        texto: 'El instance store de la instancia',
        retro: 'Es muy rápido, pero se borra al detener la instancia. Los pedidos no se pueden perder: necesitan un disco persistente como EBS.'
      },
      {
        texto: 'Un sistema de archivos Amazon EFS',
        retro: 'EFS es una carpeta compartida para muchas instancias. Para el disco de una sola base de datos que exige muchas IOPS, lo indicado es almacenamiento en bloque (EBS).'
      }
    ],
    correcta: 0
  },
  {
    id: 'c2p5',
    caso: 'c2',
    tema: 'Identidad y seguridad',
    sesion: 2,
    concepto: 'AWS Config',
    texto: 'La tienda quiere enterarse si alguien vuelve a abrir el puerto 22 a todo internet en un grupo de seguridad, y poder ver cómo estaba configurado antes del cambio. ¿Qué servicio usa?',
    opciones: [
      {
        texto: 'AWS CloudTrail',
        retro: 'CloudTrail registra cada llamada a la API y te diría quién cambió la regla. Pero no evalúa si la configuración cumple tus reglas ni guarda su historial: eso es Config.'
      },
      {
        texto: 'Amazon GuardDuty',
        retro: 'GuardDuty busca amenazas, como accesos desde direcciones maliciosas. No revisa si tus grupos de seguridad cumplen una regla de configuración.'
      },
      {
        texto: 'AWS Config',
        retro: '¡Exacto! Config guarda el historial de configuración de tus recursos y evalúa reglas como “ningún grupo de seguridad abre el 22 a 0.0.0.0/0”. Truco: CloudTrail = quién hizo qué; Config = cómo está y si cumple.'
      },
      {
        texto: 'Amazon Macie',
        retro: 'Macie busca datos personales o sensibles dentro de tus buckets de S3; no revisa grupos de seguridad.'
      }
    ],
    correcta: 2
  },

  /* ---------------------------------------- c3 · Preparatoria Sor Juana */
  {
    id: 'c3p1',
    caso: 'c3',
    tema: 'Redes',
    sesion: 3,
    concepto: 'Tamaño de una subred (CIDR)',
    texto: 'Dentro de la VPC 172.16.0.0/16, ¿qué bloque CIDR sirve para la subred del laboratorio virtual, que llega a tener 350 instancias a la vez?',
    opciones: [
      {
        texto: '172.16.0.0/24',
        retro: 'Cabe en la VPC, pero una /24 tiene 256 direcciones y AWS se queda con 5: solo quedan 251, no alcanzan para 350.'
      },
      {
        texto: '172.16.2.0/23',
        retro: '¡Bien! Cada número menos en la diagonal duplica las direcciones: una /23 tiene 512 y, sin las 5 que reserva AWS, quedan 507. Además está dentro de 172.16.0.0/16.'
      },
      {
        texto: '172.17.0.0/23',
        retro: 'El tamaño alcanzaría, pero 172.17.x.x queda fuera de 172.16.0.0/16. Una subred siempre es un pedazo del rango de su VPC.'
      },
      {
        texto: '172.16.4.0/28',
        retro: 'Una /28 es la subred más chica que permite AWS: 16 direcciones, 11 útiles. Muy lejos de 350.'
      }
    ],
    correcta: 1
  },
  {
    id: 'c3p2',
    caso: 'c3',
    tema: 'Fundamentos y EC2',
    sesion: 1,
    concepto: 'AMI propia',
    texto: 'Cada semestre la prepa vuelve a crear las instancias del laboratorio y quiere que arranquen en segundos, ya con Python y VS Code instalados. ¿Qué conviene?',
    opciones: [
      {
        texto: 'Poner en los datos de usuario un script que instale Python y VS Code',
        retro: 'Funciona, pero cada instancia instalaría todo al arrancar, y eso tarda minutos. Los datos de usuario configuran al arrancar; para tenerlo listo desde antes, una AMI.'
      },
      {
        texto: 'Elegir un tipo de instancia más grande para que instale más rápido',
        retro: 'Más vCPU y RAM aceleran un poco la instalación, pero la seguiría haciendo en cada arranque y costaría más. El tipo decide el tamaño, no el software.'
      },
      {
        texto: 'Usar el mismo par de llaves en todas las instancias',
        retro: 'El par de llaves solo sirve para entrar por SSH; no instala ni lleva software.'
      },
      {
        texto: 'Preparar una instancia modelo y crear con ella una AMI propia',
        retro: '¡Correcto! La AMI es la plantilla con el sistema operativo y el software. Si creas la tuya con Python y VS Code, cada instancia nueva arranca ya con todo instalado.'
      }
    ],
    correcta: 3
  },
  {
    id: 'c3p3',
    caso: 'c3',
    tema: 'Almacenamiento',
    sesion: 4,
    concepto: 'EBS contra EFS',
    texto: 'Para la carpeta de tareas, el área de sistemas propone un volumen EBS conectado a la instancia de Moodle de la primera zona. ¿Sirve?',
    opciones: [
      {
        texto: 'Sí: un volumen EBS se comparte entre zonas si activas su versionado',
        retro: 'El versionado es de S3 (guarda versiones de objetos), no de EBS. Un volumen EBS vive en una sola zona y no se comparte entre zonas.'
      },
      {
        texto: 'No, porque EBS es caro; conviene usar el instance store de cada una',
        retro: 'Cada instance store es de su propio servidor y se borra al detenerlo: cada Moodle vería una carpeta distinta y podrías perder las tareas. El problema de EBS no es el precio, sino que no se comparte.'
      },
      {
        texto: 'No: un EBS vive en una zona y es de una instancia; conviene EFS',
        retro: '¡Exacto! Un volumen EBS está en una sola zona y, normalmente, se conecta a una sola instancia. EFS es un sistema de archivos compartido que muchas instancias Linux montan a la vez, en varias zonas, y crece solo. “Varias instancias, mismos archivos” → EFS.'
      },
      {
        texto: 'No: un EBS vive en una zona; conviene FSx for Windows File Server',
        retro: 'El diagnóstico va bien, pero FSx for Windows es la carpeta compartida pensada para equipos Windows. Moodle corre en Linux: su carpeta compartida natural es EFS.'
      }
    ],
    correcta: 2
  },
  {
    id: 'c3p4',
    caso: 'c3',
    tema: 'Identidad y seguridad',
    sesion: 2,
    concepto: 'Llaves de acceso expuestas',
    texto: 'Las llaves de acceso del becario quedaron publicadas en un repositorio público de GitHub. ¿Qué debe hacer primero el área de sistemas?',
    opciones: [
      {
        texto: 'Desactivar esas llaves en IAM, crear otras y revisar CloudTrail',
        retro: '¡Bien! Unas llaves publicadas se consideran robadas: hay que invalidarlas de inmediato. Después, CloudTrail te dice si alguien las usó y qué hizo con ellas.'
      },
      {
        texto: 'Borrar el repositorio de GitHub: si ya nadie las ve, ya no hay riesgo',
        retro: 'Hay programas que copian llaves de GitHub en segundos. Borrar el repositorio no las invalida: siguen funcionando hasta que las desactives en IAM.'
      },
      {
        texto: 'Cambiar la contraseña de consola del becario',
        retro: 'La contraseña y las llaves de acceso son credenciales separadas: cambiar una no invalida la otra. Las llaves seguirían funcionando.'
      },
      {
        texto: 'Activarle MFA al becario para que sus llaves dejen de servir',
        retro: 'MFA protege el inicio de sesión en la consola, pero por sí solo no invalida las llaves que ya existen. Primero hay que desactivarlas.'
      }
    ],
    correcta: 0
  },
  {
    id: 'c3p5',
    caso: 'c3',
    tema: 'Identidad y seguridad',
    sesion: 2,
    concepto: 'Reglas de un grupo de seguridad',
    texto: 'Siguiendo el mínimo privilegio, ¿qué reglas de entrada lleva el grupo de seguridad de los servidores de Moodle?',
    opciones: [
      {
        texto: 'HTTPS (443) y SSH (22), ambos desde 0.0.0.0/0',
        retro: 'HTTPS abierto a todos está bien, pero SSH desde 0.0.0.0/0 deja que cualquiera en internet intente entrar a administrar. El caso pide SSH solo desde la escuela.'
      },
      {
        texto: 'All traffic desde 0.0.0.0/0 y una regla que niegue lo demás',
        retro: 'Los grupos de seguridad solo tienen reglas para permitir; no existen reglas para negar. Y abrir todo el tráfico es lo contrario del mínimo privilegio.'
      },
      {
        texto: 'HTTPS (443) y SSH (22), los dos solo desde la IP 200.57.123.10/32',
        retro: 'SSH queda bien, pero los alumnos entran desde su casa: si HTTPS solo se permite desde la escuela, nadie podría entregar tareas desde fuera.'
      },
      {
        texto: 'HTTPS (443) desde 0.0.0.0/0 y SSH (22) desde 200.57.123.10/32',
        retro: '¡Correcto! Cada quien entra solo por donde lo necesita: los alumnos por HTTPS desde cualquier lugar y los administradores por SSH desde la IP de la escuela. El /32 significa “solo esa dirección”.'
      }
    ],
    correcta: 3
  },

  /* ------------------------------------ c4 · Ayuntamiento de Santa Lucía */
  {
    id: 'c4p1',
    caso: 'c4',
    tema: 'Almacenamiento',
    sesion: 4,
    concepto: 'Snowball Edge y DataSync',
    texto: 'Subir los 60 TB por el enlace de 50 Mbps, usándolo completo día y noche, tardaría casi cuatro meses. ¿Cómo lleva el ayuntamiento el archivo a S3 y, después, las actas nuevas de cada semana?',
    opciones: [
      {
        texto: 'Con AWS DataSync para todo, aunque la primera copia tarde meses',
        retro: 'DataSync copia por la red: para los 20 GB semanales es perfecto, pero con 50 Mbps los 60 TB tardarían meses y saturarían el internet del palacio.'
      },
      {
        texto: 'Con Snowball Edge para los 60 TB y DataSync para las actas semanales',
        retro: '¡Exacto! Cuando los datos no caben por el cable, Snowball los lleva en un aparato físico; lo que se agrega poco a poco viaja por la red con DataSync. Carga inicial “a pie”, cambios por internet.'
      },
      {
        texto: 'Con un dispositivo Snowball Edge cada semana para las actas',
        retro: 'Snowball sirve para la carga grande, pero pedir un aparato cada semana para 20 GB es lento y caro: esa cantidad viaja sin problema por internet.'
      },
      {
        texto: 'Con AWS Storage Gateway para el archivo y Direct Connect para las actas',
        retro: 'Storage Gateway sirve para que tus servidores locales vean una unidad cuyos datos viven en S3; no acelera una carga de 60 TB. Y Direct Connect tarda semanas en instalarse y es caro para 20 GB por semana.'
      }
    ],
    correcta: 1
  },
  {
    id: 'c4p2',
    caso: 'c4',
    tema: 'Redes',
    sesion: 3,
    concepto: 'VPC Peering',
    texto: 'La VPC de trámites (10.20.0.0/16) debe consultar a la de catastro (10.30.0.0/16) de forma privada. ¿Qué es lo más sencillo y barato?',
    opciones: [
      {
        texto: 'Un Transit Gateway que conecte las dos VPC',
        retro: 'Funciona, pero está pensado para muchas VPC y redes en un solo punto central, y cobra por cada conexión por hora. Para solo dos VPC, el peering es más sencillo.'
      },
      {
        texto: 'Un Internet Gateway en cada VPC',
        retro: 'Así el tráfico saldría a internet, justo lo contrario de “privada”. El Internet Gateway conecta una VPC con internet, no con otra VPC.'
      },
      {
        texto: 'AWS Direct Connect entre las dos VPC',
        retro: 'Direct Connect une tu centro de datos con AWS por una línea física; no se usa para unir dos VPC que ya están en AWS.'
      },
      {
        texto: 'Una conexión de VPC Peering entre las dos',
        retro: '¡Bien! El peering une dos VPC de forma directa y privada. Aquí funciona porque sus rangos (10.20 y 10.30) no se enciman: el peering exige que no se traslapen.'
      }
    ],
    correcta: 3
  },
  {
    id: 'c4p3',
    caso: 'c4',
    tema: 'Fundamentos y EC2',
    sesion: 1,
    concepto: 'Datos de usuario',
    texto: 'En enero encendieron (Start) los servidores del predial que estaban detenidos desde abril, pero el script de datos de usuario no volvió a descargar las tarifas nuevas. ¿Por qué?',
    opciones: [
      {
        texto: 'Porque, por omisión, ese script solo corre en el primer arranque',
        retro: '¡Correcto! El script de datos de usuario corre una sola vez, cuando la instancia arranca por primera vez. Para que algo se haga en cada encendido hay que configurarlo aparte.'
      },
      {
        texto: 'Porque al detener la instancia se borraron sus datos de usuario',
        retro: 'Los datos de usuario se conservan aunque detengas la instancia; simplemente no se vuelven a ejecutar al encenderla.'
      },
      {
        texto: 'Porque al encenderla cambió su IP pública y el script se perdió',
        retro: 'Es cierto que la IP pública cambia al detener y encender, pero eso no borra ni bloquea el script. No corrió porque solo se ejecuta en el primer arranque.'
      },
      {
        texto: 'Porque el grupo de seguridad bloquea los scripts de arranque',
        retro: 'El grupo de seguridad filtra el tráfico de red que entra a la instancia; no decide qué programas corren dentro de ella.'
      }
    ],
    correcta: 0
  },
  {
    id: 'c4p4',
    caso: 'c4',
    tema: 'Redes',
    sesion: 3,
    concepto: 'Leer una tabla de rutas',
    texto: 'La tabla de rutas de la subred del portal dice: 10.20.0.0/16 → local y 0.0.0.0/0 → nat-0a1b2c3d. El servidor tiene IP pública, pero nadie puede abrir el portal desde internet. ¿Qué pasa?',
    opciones: [
      {
        texto: 'Falta la ruta 10.20.0.0/16 hacia el Internet Gateway',
        retro: '10.20.0.0/16 es el tráfico dentro de la propia VPC y ya va a “local”. Lo que decide la salida a internet es la ruta 0.0.0.0/0.'
      },
      {
        texto: 'La IP pública debe cambiarse por una IP elástica',
        retro: 'Una IP elástica solo hace que la dirección no cambie. Con la ruta a internet apuntando al NAT, el portal seguiría sin abrir.'
      },
      {
        texto: 'Es privada: su ruta 0.0.0.0/0 debe ir a un Internet Gateway',
        retro: '¡Exacto! Una subred es pública cuando su ruta 0.0.0.0/0 va a un Internet Gateway. Un NAT Gateway solo deja salir a lo privado; nadie de afuera puede entrar por él.'
      },
      {
        texto: 'Hay que mover el NAT Gateway a la misma subred que el portal',
        retro: 'Moverlo no cambia nada: el NAT solo permite conexiones que salen, nunca las que llegan desde internet. El portal necesita el Internet Gateway.'
      }
    ],
    correcta: 2
  },
  {
    id: 'c4p5',
    caso: 'c4',
    tema: 'Almacenamiento',
    sesion: 4,
    concepto: 'Block Public Access y buckets separados',
    texto: 'El ayuntamiento debe publicar en internet sus presupuestos y contratos en PDF, pero las actas con datos personales deben quedar privadas. ¿Qué hace en S3?',
    opciones: [
      {
        texto: 'Un solo bucket público, con las actas cifradas con SSE-S3',
        retro: 'SSE-S3 cifra lo guardado en disco, pero S3 lo descifra para quien tenga permiso de leer: si el bucket es público, cualquiera leería las actas. Cifrar no es lo mismo que controlar el acceso.'
      },
      {
        texto: 'Dos buckets: uno público de transparencia y otro bloqueado para actas',
        retro: '¡Correcto! Separar lo público de lo privado es lo más seguro: solo el bucket de transparencia se abre, con una política de lectura, y el de actas conserva Block Public Access encendido. Ese bloqueo viene activado por omisión: apágalo solo donde de verdad haga falta.'
      },
      {
        texto: 'Apagar Block Public Access en toda la cuenta para que el portal funcione',
        retro: 'Así cualquier bucket de la cuenta podría quedar público por un error, incluido el de actas. Si algo debe ser público, abre solo ese bucket.'
      },
      {
        texto: 'Activar el versionado en el bucket de actas para que nadie las vea',
        retro: 'El versionado sirve para recuperar archivos borrados o sobrescritos; no controla quién puede leerlos.'
      }
    ],
    correcta: 1
  },

  /* ---------------------------------------------------- c5 · RutaFresca */
  {
    id: 'c5p1',
    caso: 'c5',
    tema: 'Fundamentos y EC2',
    sesion: 1,
    concepto: 'Instancias Spot',
    texto: 'RutaFresca quiere correr el optimizador de rutas en instancias Spot para ahorrar. ¿Qué debe tener en cuenta?',
    opciones: [
      {
        texto: 'Que AWS puede recuperar las instancias con 2 minutos de aviso',
        retro: '¡Bien! Spot usa capacidad sobrante con hasta 90 % de descuento, a cambio de que AWS la pueda pedir de vuelta con 2 minutos de aviso. Por eso el proceso debe guardar su avance seguido, y el optimizador ya lo hace: encaja perfecto.'
      },
      {
        texto: 'Que debe firmar un compromiso de 1 o 3 años, como con las reservadas',
        retro: 'Spot no tiene compromiso: lo usas mientras haya capacidad sobrante. El compromiso de 1 o 3 años es de las instancias reservadas y los Savings Plans.'
      },
      {
        texto: 'Que con Spot tendrá un servidor físico solo para RutaFresca',
        retro: 'Eso es un Dedicated Host, que es de lo más caro. Spot corre en la capacidad compartida que le sobra a AWS.'
      },
      {
        texto: 'Nada especial: Spot es igual que On-Demand, solo que más barato',
        retro: 'El precio no es la única diferencia: una instancia Spot puede interrumpirse. Si el proceso no guardara su avance, perdería el trabajo de la noche.'
      }
    ],
    correcta: 0
  },
  {
    id: 'c5p2',
    caso: 'c5',
    tema: 'Fundamentos y EC2',
    sesion: 1,
    concepto: 'Familia de instancia por memoria',
    texto: 'El optimizador carga el mapa completo de la ciudad y necesita 256 GiB de RAM, pero poco procesador. ¿Qué familia de instancia conviene?',
    opciones: [
      {
        texto: 'Optimizada para cómputo (familia c)',
        retro: 'La familia c da mucho procesador por cada GiB de memoria; aquí sobraría procesador y faltaría RAM.'
      },
      {
        texto: 'De propósito general ampliable (familia t)',
        retro: 'Las t son baratas y acumulan créditos para picos cortos de CPU, pero tienen poca memoria: ni la más grande se acerca a 256 GiB.'
      },
      {
        texto: 'Optimizada para almacenamiento (familia i)',
        retro: 'La familia i trae mucho disco local y rápido. El problema del optimizador es la memoria, no el disco.'
      },
      {
        texto: 'Optimizada para memoria (familia r)',
        retro: '¡Correcto! Las familias r y x dan mucha RAM por cada vCPU, ideales para cargar datos enormes en memoria. Palabra clave: “mucha memoria”.'
      }
    ],
    correcta: 3
  },
  {
    id: 'c5p3',
    caso: 'c5',
    tema: 'Identidad y seguridad',
    sesion: 2,
    concepto: 'Leer una política de IAM',
    texto: 'La contadora externa tiene esta política: "Effect": "Allow", "Action": "s3:GetObject", "Resource": "arn:aws:s3:::rutafresca-facturas/*". ¿Qué puede hacer?',
    opciones: [
      {
        texto: 'Leer y borrar las facturas, porque GetObject da control del objeto',
        retro: 'GetObject es solo descargar. Borrar es otra acción (s3:DeleteObject) y nadie se la dio: en IAM cada acción es un permiso aparte.'
      },
      {
        texto: 'Descargar archivos del bucket rutafresca-facturas, y nada más',
        retro: '¡Exacto! Effect dice “permitir”, Action dice “descargar objetos” y Resource dice “solo de ese bucket”. Ni subir, ni borrar, ni tocar otros buckets; para ver la lista le faltaría s3:ListBucket. Eso es mínimo privilegio.'
      },
      {
        texto: 'Descargar archivos de todos los buckets de la cuenta, por el asterisco',
        retro: 'El * va después de rutafresca-facturas/: significa “todos los objetos de ese bucket”, no todos los buckets.'
      },
      {
        texto: 'Nada, porque la política no tiene un Deny que cierre lo demás',
        retro: 'No hace falta un Deny: lo que no se permite queda negado por omisión (denegación implícita). El Allow abre solo esa puerta.'
      }
    ],
    correcta: 1
  },
  {
    id: 'c5p4',
    caso: 'c5',
    tema: 'Redes',
    sesion: 3,
    concepto: 'Gateway endpoint de S3',
    texto: 'Los servidores privados suben 2 TB al mes de fotos a S3 a través del NAT Gateway, que cobra por cada GB que procesa. ¿Cómo bajan ese costo sin exponer los servidores?',
    opciones: [
      {
        texto: 'Pasando los servidores a una subred pública con Internet Gateway',
        retro: 'Ahorrarías el NAT, pero los servidores quedarían expuestos a internet. Hay una forma de llegar a S3 sin salir de la red de AWS.'
      },
      {
        texto: 'Creando un interface endpoint de S3 con PrivateLink',
        retro: 'También llega a S3 por la red privada, pero los interface endpoints cobran por hora y por GB. Para S3, el gateway endpoint hace lo mismo sin costo.'
      },
      {
        texto: 'Agregando un gateway endpoint de S3 a la tabla de rutas privada',
        retro: '¡Bien! El gateway endpoint es una ruta más hacia S3, sin costo: el tráfico va directo por la red de AWS y deja de pasar por el NAT. Existe para S3 y DynamoDB.'
      },
      {
        texto: 'Contratando AWS Direct Connect para subir las fotos',
        retro: 'Direct Connect une un centro de datos propio con AWS. Estos servidores ya están en AWS; lo que cuesta es el camino que siguen dentro de la VPC.'
      }
    ],
    correcta: 2
  },
  {
    id: 'c5p5',
    caso: 'c5',
    tema: 'Redes',
    sesion: 3,
    concepto: 'NACL sin estado (stateless)',
    texto: 'En la subred de la API pusieron una NACL: la entrada permite el puerto 443 y la salida también permite solo el 443. Desde entonces los repartidores no reciben respuesta. ¿Qué falta?',
    opciones: [
      {
        texto: 'Permitir en la salida de la NACL los puertos efímeros (1024-65535)',
        retro: '¡Correcto! La NACL es stateless (sin estado): revisa la respuesta como si fuera tráfico nuevo, y la respuesta va al puerto temporal (efímero) que abrió el celular del repartidor, no al 443. Por eso hay que permitir esos puertos al salir.'
      },
      {
        texto: 'Una regla de salida en el grupo de seguridad para dejar pasar respuestas',
        retro: 'El grupo de seguridad es stateful: si dejó entrar la petición, deja salir la respuesta solo. La que no recuerda nada es la NACL.'
      },
      {
        texto: 'Borrar la NACL, porque las NACL solo sirven para negar tráfico',
        retro: 'Las NACL tienen reglas para permitir y para negar, con número de orden. No hay que borrarla, sino completar su regla de salida.'
      },
      {
        texto: 'Un NAT Gateway para que las respuestas puedan salir',
        retro: 'El NAT es para que servidores privados inicien conexiones hacia internet. La API está en una subred pública y sus respuestas no pasan por un NAT.'
      }
    ],
    correcta: 0
  }
];

/** Lo que sí puede ver el alumno: casos y preguntas sin la correcta ni la retroalimentación. */
export function publica() {
  return bancoPublico(CASO, CASOS, PREGUNTAS);
}

/** Califica `{ c1p1: 2, c1p2: 0, … }`. Lo que no sea un índice válido cuenta como error. */
export function calificar(respuestas) {
  return calificarBanco(PREGUNTAS, respuestas);
}
