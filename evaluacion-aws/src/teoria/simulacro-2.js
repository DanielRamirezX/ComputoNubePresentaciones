// Parte teórica del simulacro 2 (viernes 23 de octubre de 2026): 5 casos de
// negocio con 5 preguntas cada uno, al estilo del examen AWS Certified Cloud
// Practitioner (CLF-C02), sobre las sesiones 1 a 4 de la Ruta AWS. Las empresas
// y las situaciones son otras que las del simulacro 1; algunos conceptos se
// repiten, vistos desde otro ángulo. La respuesta correcta y la
// retroalimentación viven solo en el servidor; la clave está balanceada (6 en
// A, 6 en B, 7 en C y 6 en D, sin rachas de tres). Después del simulacro 1
// (teórica con mediana de 64 %) se simplificó: menos servicios especializados
// y, en las preguntas difíciles, un solo distractor que se confunde de verdad. Cada pregunta trae `repaso`: la lámina de la Ruta AWS donde
// se explica su tema ('s3-vpc/2'), o un arreglo con esa lámina y el paso del
// laboratorio donde se practicó; el catálogo está en src/repaso.js. Todo lo que
// se pregunta se vio en esas láminas: no hay que hacer cuentas ni saber detalles
// que no se enseñaron (lo que va de más se marca en la retro como «Dato extra»).
// Corre `node src/teoria/verificar-teoria.js` y `npm run verificar` si cambias algo.

import { bancoPublico, calificarBanco } from './comun.js';

export const TEMAS = ['Fundamentos y EC2', 'Identidad y seguridad', 'Redes', 'Almacenamiento'];

export const MINUTOS = 45;

// Lo que se muestra antes de empezar.
export const CASO = `
  <p>Segundo simulacro, con <strong>empresas y problemas nuevos</strong>. Igual que en el examen <strong>AWS Certified Cloud Practitioner (CLF-C02)</strong>, cada pregunta describe una situación y te pide la mejor opción. Son <strong>5 casos con 5 preguntas cada uno, en 45 minutos</strong>.</p>
  <ul>
    <li><strong>Lee la historia completa</strong> antes de contestar: los datos que deciden la respuesta (cuántos equipos, qué tan seguido se consulta algo, qué rango de IP tienen) están ahí.</li>
    <li>Busca la <strong>palabra clave</strong>: “no puede interrumpirse”, “se regeneran”, “sin salir a internet”, “nadie, ni los administradores”, “si una región falla”…</li>
    <li>Si dos opciones funcionan, quédate con la que <strong>cumple todo con menos costo y menos trabajo</strong>.</li>
    <li>Una pregunta sin contestar cuenta como error: no dejes ninguna en blanco.</li>
  </ul>`;

export const CASOS = [
  {
    id: 'c1',
    empresa: 'Ramírez & Garza Contadores',
    titulo: 'La temporada de declaraciones',
    historia: `
      <p><strong>Ramírez &amp; Garza</strong> es un despacho contable de Monterrey con <strong>25 contadores</strong> que trabajan en computadoras con Windows. Comparten una carpeta de red (la unidad <em>Z:</em>) en un servidor viejo con Windows Server, con permisos por usuario, y quieren pasarla a AWS sin cambiar su forma de trabajar.</p>
      <p>De febrero a abril, en la temporada de declaraciones anuales, necesitan <strong>8 servidores extra</strong> para calcular impuestos; ese trabajo no puede interrumpirse porque hay fechas límite del SAT. El resto del año no los usan.</p>
      <p>Deben conservar las facturas (CFDI) de sus clientes <strong>5 años</strong>: el primer año se consultan seguido; después, solo si hay una revisión del SAT, y para eso pueden esperar un día. Su aviso de privacidad promete borrarlas al cumplir 5 años. En mayo, un auditor externo revisará su cuenta de AWS durante dos semanas.</p>`
  },
  {
    id: 'c2',
    empresa: 'Hoteles Casa Maya',
    titulo: 'Reservas desde todo el mundo',
    historia: `
      <p><strong>Casa Maya</strong> tiene tres hoteles boutique en Mérida, Tulum y Bacalar. El <strong>60&nbsp;%</strong> de sus huéspedes reserva desde Canadá, Estados Unidos y Europa. Su sitio de reservas corre en <strong>dos instancias EC2</strong> del mismo tipo en mx-central-1, encendidas 24/7, y no cambiarán de tipo en los próximos <strong>3 años</strong>. Las fotos y videos de las habitaciones están en un bucket de S3.</p>
      <p>Los huéspedes de la Unión Europea deben ver una versión del sitio en euros, con el aviso de privacidad europeo, alojada en la región de España. El buscador de disponibilidad escribe archivos temporales que se regeneran en cada búsqueda.</p>
      <p>Desde hace un mes, el portal de huéspedes recibe <strong>miles de intentos de inicio de sesión por minuto</strong> con contraseñas robadas, desde cientos de direcciones IP que cambian cada hora.</p>`
  },
  {
    id: 'c3',
    empresa: 'Laboratorios Biomédica del Bajío',
    titulo: 'Resultados que nadie más debe ver',
    historia: `
      <p><strong>Biomédica del Bajío</strong> es una cadena de laboratorios de análisis clínicos con <strong>14 sucursales</strong> en Guanajuato y unos 1,200 pacientes al día. Los resultados se guardan como PDF en un bucket de S3 y cada paciente los descarga desde el sitio.</p>
      <p>La ley de protección de datos personales les exige cuidar nombres, CURP y diagnósticos. Con los años se crearon <strong>40 buckets</strong> y nadie sabe si en alguno quedaron PDF de pacientes. La auditoría de diciembre pide revisar las vulnerabilidades de sus <strong>6 instancias EC2</strong> y cifrar los resultados con llaves que el laboratorio controle.</p>
      <p>Los servidores que generan los PDF viven en una subred privada <strong>sin salida a internet</strong>. El área de investigación guarda <strong>30 TB</strong> de imágenes de microscopía: unas se consultan a diario, otras nunca, y eso cambia con cada estudio.</p>`
  },
  {
    id: 'c4',
    empresa: 'Instituto de Ciencias del Clima',
    titulo: 'Pronósticos que no se detienen',
    historia: `
      <p>El <strong>Instituto de Ciencias del Clima</strong>, de una universidad pública de Hermosillo, publica cada hora alertas de ondas de calor para Sonora. Su modelo de pronóstico corre <strong>24/7</strong> en un clúster de <strong>200 nodos</strong> que usa mucho procesador y poca memoria, y no puede interrumpirse. En los próximos 3 años piensan cambiar varias veces de tipo de instancia y, quizá, de región.</p>
      <p>Cada nodo guarda sus cálculos en un <strong>volumen EBS</strong>. Antes de cada actualización del modelo quieren respaldar esos discos, por si algo sale mal.</p>
      <p>El instituto tiene <strong>12 VPC</strong>, una por proyecto de investigación, más la red del campus conectada por VPN, y todas deben poder hablar entre sí. Las alertas se publican en un <strong>sitio web</strong> que corre en una instancia EC2 de una subred pública.</p>`
  },
  {
    id: 'c5',
    empresa: 'Tandapp',
    titulo: 'Una fintech que crece rápido',
    historia: `
      <p><strong>Tandapp</strong> es una startup de la Ciudad de México con una app para organizar tandas entre amigos: ya tiene <strong>50,000 usuarios</strong> y 8 desarrolladores. Usa AWS Organizations con <strong>4 cuentas miembro</strong> (desarrollo, pruebas, producción y seguridad). Su regla de oro: <strong>nadie, ni los administradores de cada cuenta, puede apagar CloudTrail</strong> ni borrar sus registros.</p>
      <p>Su API, <em>api.tandapp.mx</em>, necesita HTTPS y corre en dos regiones: México y, de respaldo, Virginia del Norte. <strong>Si la región de México falla</strong>, los usuarios deben pasar solos a Virginia, sin que nadie cambie nada a mano.</p>
      <p>Su panel interno lo usan 8 personas: casi no consume procesador, salvo 10 minutos a las 9:00. Además, el equipo quiere probar con datos ficticios un servicio nuevo de AWS que todavía no existe en mx-central-1.</p>`
  }
];

export const PREGUNTAS = [
  /* ---------------------------------------------- c1 · Ramírez & Garza */
  {
    id: 'c1p1',
    caso: 'c1',
    tema: 'Almacenamiento',
    sesion: 4,
    concepto: 'Amazon FSx for Windows File Server',
    repaso: 's4-discos/1',
    texto: 'Ramírez & Garza quiere pasar su unidad Z: a AWS: una carpeta compartida para 25 equipos Windows, sin cambiar su forma de trabajar. ¿Qué servicio usa?',
    opciones: [
      {
        texto: 'Amazon EFS',
        retro: 'EFS es la carpeta compartida para instancias Linux; no es la que se usa para una oficina llena de equipos Windows.'
      },
      {
        texto: 'Un bucket de Amazon S3',
        retro: 'S3 guarda objetos y se usa por internet o por API, no como una unidad de red Z:. Cambiaría la forma de trabajar del despacho.'
      },
      {
        texto: 'Amazon FSx for Windows File Server',
        retro: '¡Correcto! FSx for Windows File Server es un servidor de archivos Windows que administra AWS: la misma carpeta compartida de siempre, sin tener que mantener el servidor. “Archivos compartidos para Windows” → FSx for Windows.'
      },
      {
        texto: 'Un volumen EBS compartido por los 25 equipos',
        retro: 'EBS es el disco de una instancia EC2 en una zona; las computadoras de la oficina no se conectan a él como carpeta compartida.'
      }
    ],
    correcta: 2
  },
  {
    id: 'c1p2',
    caso: 'c1',
    tema: 'Identidad y seguridad',
    sesion: 2,
    concepto: 'Rol para alguien de otra cuenta',
    repaso: 's2-identidades/1',
    texto: 'El auditor externo revisará la cuenta del despacho durante dos semanas, desde la cuenta de AWS de su propia firma y solo para leer. ¿Cómo se le da acceso?',
    opciones: [
      {
        texto: 'Con un rol de solo lectura que el auditor asume desde su cuenta',
        retro: '¡Exacto! Un rol da credenciales temporales que se renuevan solas, sin crear usuarios ni mandar llaves. Al terminar la auditoría, basta con borrar el rol.'
      },
      {
        texto: 'Con un usuario de IAM y unas llaves de acceso que le mandan por correo',
        retro: 'Funcionaría, pero son credenciales permanentes viajando por correo: si se filtran, sirven hasta que alguien las borre. Para alguien de otra cuenta, lo indicado es un rol.'
      },
      {
        texto: 'Con la contraseña del usuario raíz, quitándole el MFA unas semanas',
        retro: 'El usuario raíz puede todo y nadie lo puede limitar; jamás se comparte ni se le quita el MFA. El auditor solo necesita leer.'
      },
      {
        texto: 'Con el par de llaves (.pem) de las instancias EC2',
        retro: 'El par de llaves sirve para entrar por SSH a una instancia, no para revisar la cuenta de AWS. Además, le daría acceso a los servidores, no solo para leer.'
      }
    ],
    correcta: 0
  },
  {
    id: 'c1p3',
    caso: 'c1',
    tema: 'Fundamentos y EC2',
    sesion: 1,
    concepto: 'On-Demand para una temporada',
    repaso: 's1-precios/1',
    texto: 'Los 8 servidores de la temporada de declaraciones solo se usan de febrero a abril y su trabajo no puede interrumpirse. ¿Qué opción de compra conviene?',
    opciones: [
      {
        texto: 'Instancias Spot, porque tienen hasta 90 % de descuento',
        retro: 'Son las más baratas, pero AWS puede recuperarlas con 2 minutos de aviso. Un cálculo que no puede interrumpirse antes de la fecha del SAT no debe depender de Spot.'
      },
      {
        texto: 'Instancias reservadas por 1 año',
        retro: 'Las reservadas se pagan los 12 meses aunque solo las uses 3. Convienen a servidores que corren todo el año.'
      },
      {
        texto: 'Dedicated Hosts, para tener servidores separados',
        retro: 'Nada en el caso pide hardware exclusivo ni licencias por servidor físico; sería pagar de más.'
      },
      {
        texto: 'Instancias On-Demand, que se apagan al terminar abril',
        retro: '¡Bien! On-Demand no tiene compromiso: pagas por segundo solo los meses que las usas, y AWS no te las quita a media temporada. Uso corto o de temporada → On-Demand.'
      }
    ],
    correcta: 3
  },
  {
    id: 'c1p4',
    caso: 'c1',
    tema: 'Almacenamiento',
    sesion: 4,
    concepto: 'Ciclo de vida con transición y expiración',
    repaso: ['s4-s3/3', 's4-lab-almacenamiento/8'],
    texto: 'Las facturas (CFDI) se consultan seguido el primer año y después casi nunca; al cumplir 5 años deben borrarse. ¿Cómo lo automatiza el despacho en S3?',
    opciones: [
      {
        texto: 'Con Intelligent-Tiering, que también las borra a los 5 años',
        retro: 'Intelligent-Tiering mueve objetos entre niveles según su uso, pero nunca los borra. Además, aquí sí se sabe cuándo bajan las consultas: al año.'
      },
      {
        texto: 'Con una regla de ciclo de vida: a Deep Archive al año y expiración a los 5',
        retro: '¡Correcto! Una sola regla puede cambiar la clase según la edad del objeto y también borrarlo (expiración). Como el despacho puede esperar un día cuando revisa el SAT, Glacier Deep Archive es la clase más barata.'
      },
      {
        texto: 'Activando el versionado durante 5 años',
        retro: 'El versionado guarda cada versión para recuperar lo borrado; no mueve objetos a clases más baratas ni los borra a tiempo. De hecho, guardaría todavía más copias.'
      },
      {
        texto: 'Con S3 Object Lock y una retención de 5 años',
        retro: 'Object Lock impide borrar antes de tiempo, pero no borra nada al terminar el plazo ni abarata el almacenamiento. Aquí hace falta mover y borrar.'
      }
    ],
    correcta: 1
  },
  {
    id: 'c1p5',
    caso: 'c1',
    tema: 'Identidad y seguridad',
    sesion: 2,
    concepto: 'Responsabilidad compartida en un servicio administrado',
    repaso: 's2-responsabilidad/1',
    texto: 'Ya en Amazon FSx, ¿quién instala los parches del Windows Server que hay detrás de la carpeta compartida?',
    opciones: [
      {
        texto: 'El despacho, porque el sistema operativo siempre es del cliente',
        retro: 'Eso pasa en EC2 (IaaS), donde tú administras el sistema operativo. FSx es un servicio administrado: ahí los parches los pone AWS.'
      },
      {
        texto: 'AWS, porque FSx es administrado; el despacho cuida datos y accesos',
        retro: '¡Exacto! En un servicio administrado, AWS parcha y mantiene los servidores. Lo que siempre es tuyo: tus datos, quién tiene permiso y la configuración que eliges.'
      },
      {
        texto: 'AWS, que también decide qué contador puede abrir cada carpeta',
        retro: 'AWS sí parcha el servidor, pero quién tiene acceso a qué siempre es responsabilidad del cliente, en cualquier servicio.'
      },
      {
        texto: 'Cada contador, con Windows Update desde su computadora',
        retro: 'Las actualizaciones de las computadoras de los contadores no tocan el servidor de FSx. Ese servidor lo mantiene AWS.'
      }
    ],
    correcta: 1
  },

  /* ---------------------------------------------- c2 · Hoteles Casa Maya */
  {
    id: 'c2p1',
    caso: 'c2',
    tema: 'Redes',
    sesion: 3,
    concepto: 'CloudFront y las ubicaciones de borde',
    repaso: 's3-borde/2',
    texto: 'Casa Maya pondrá Amazon CloudFront delante de su bucket de fotos para que carguen rápido en Canadá y Europa. ¿Qué pasará con las fotos?',
    opciones: [
      {
        texto: 'CloudFront moverá el bucket a la región más cercana a cada huésped',
        retro: 'CloudFront no mueve tu bucket: el original se queda en su región. Lo que reparte son copias temporales en el borde.'
      },
      {
        texto: 'Se copiarán a las zonas de disponibilidad de cada país',
        retro: 'Las zonas de disponibilidad son parte de una región y ahí corren tus recursos. CloudFront usa otra cosa: ubicaciones de borde, mucho más numerosas.'
      },
      {
        texto: 'Se guardarán en el instance store de las instancias EC2',
        retro: 'El instance store es el disco temporal de una instancia; no tiene nada que ver con acercar contenido a usuarios de otros países.'
      },
      {
        texto: 'Habrá copias en ubicaciones de borde; el original seguirá en S3',
        retro: '¡Bien! CloudFront es una red de entrega de contenido (CDN): guarda copias en ubicaciones de borde y cada huésped las recibe desde la más cercana. El original sigue en el bucket, en su región original.'
      }
    ],
    correcta: 3
  },
  {
    id: 'c2p2',
    caso: 'c2',
    tema: 'Identidad y seguridad',
    sesion: 2,
    concepto: 'AWS WAF',
    repaso: 's2-servicios/3',
    texto: 'El portal de huéspedes recibe miles de intentos de inicio de sesión con contraseñas robadas. Quieren un filtro que revise cada petición web antes de que llegue al portal y bloquee las dañinas. ¿Qué usan?',
    opciones: [
      {
        texto: 'AWS WAF',
        retro: '¡Correcto! WAF es el firewall de las aplicaciones web: revisa cada petición que llega a tu sitio y bloquea las dañinas, como la inyección SQL o el XSS, y también este tipo de ataque al inicio de sesión. “Proteger la aplicación web” → WAF.'
      },
      {
        texto: 'AWS Shield Standard',
        retro: 'Shield Standard frena ataques DDoS de red y ya viene gratis, pero no revisa una por una las peticiones que llegan a tu aplicación web.'
      },
      {
        texto: 'Una NACL con una regla Deny para cada IP',
        retro: 'Una NACL sí puede negar IP, pero tendrías que escribir cientos de reglas a mano cada hora, y no ve qué pide cada petición web. Para filtrar el tráfico de una aplicación web está WAF.'
      },
      {
        texto: 'AWS Artifact',
        retro: 'Artifact es donde descargas los reportes de cumplimiento de AWS (ISO, SOC); no filtra el tráfico de tu sitio.'
      }
    ],
    correcta: 0
  },
  {
    id: 'c2p3',
    caso: 'c2',
    tema: 'Almacenamiento',
    sesion: 4,
    concepto: 'Instance store',
    repaso: 's4-discos/1',
    texto: 'El buscador de disponibilidad escribe archivos temporales que se regeneran en cada búsqueda. Quieren el disco más rápido posible y no les importa perderlos. ¿Qué usan?',
    opciones: [
      {
        texto: 'Un volumen EBS HDD en frío (sc1)',
        retro: 'sc1 es el disco más barato para datos que casi no se leen; es justo lo contrario de “lo más rápido”.'
      },
      {
        texto: 'La clase S3 Glacier Instant Retrieval',
        retro: 'Es una clase de archivo para datos que se leen muy poco. Para archivos temporales que se escriben en cada búsqueda no tiene sentido.'
      },
      {
        texto: 'El instance store de la instancia',
        retro: '¡Exacto! El instance store es un disco pegado físicamente al servidor: el más rápido, pero se borra al detener la instancia. “Temporal, rapidísimo y no importa perderlo” → instance store.'
      },
      {
        texto: 'Un sistema de archivos Amazon EFS',
        retro: 'EFS es una carpeta compartida por la red para muchas instancias. Es persistente, pero no es lo más rápido para los archivos temporales de una sola instancia.'
      }
    ],
    correcta: 2
  },
  {
    id: 'c2p4',
    caso: 'c2',
    tema: 'Redes',
    sesion: 3,
    concepto: 'Enrutamiento por geolocalización',
    repaso: 's3-borde/1',
    texto: 'Los huéspedes que se conectan desde la Unión Europea deben llegar a la versión en euros alojada en España, y el resto, a la de México. ¿Qué enrutamiento de Route 53 usan?',
    opciones: [
      {
        texto: 'Por latencia',
        retro: 'Latencia manda a cada huésped a la región que le responde más rápido; casi siempre coincidiría, pero no lo garantiza por país. Aquí la regla depende del país, por la moneda y el aviso de privacidad.'
      },
      {
        texto: 'Ponderado (weighted)',
        retro: 'El ponderado reparte las visitas en porcentajes, sin fijarse de dónde vienen.'
      },
      {
        texto: 'Por conmutación por error (failover)',
        retro: 'Failover manda todo al sitio principal y usa el otro solo si el principal falla.'
      },
      {
        texto: 'Por geolocalización',
        retro: '¡Correcto! Geolocalización responde según el país o el continente desde donde se conecta el usuario. “Según el país” → geolocalización.'
      }
    ],
    correcta: 3
  },
  {
    id: 'c2p5',
    caso: 'c2',
    tema: 'Fundamentos y EC2',
    sesion: 1,
    concepto: 'Instancias reservadas',
    repaso: 's1-precios/1',
    texto: 'Las dos instancias del sitio de reservas corren 24/7, no pueden interrumpirse y no cambiarán de tipo en 3 años. ¿Qué opción de compra da el mayor ahorro?',
    opciones: [
      {
        texto: 'On-Demand, para no comprometerse',
        retro: 'No tiene compromiso, pero es la opción más cara por hora. Si sabes que la instancia correrá 3 años, comprometerte te ahorra mucho.'
      },
      {
        texto: 'Instancias reservadas por 3 años',
        retro: '¡Bien! Al reservar un tipo de instancia por 1 o 3 años ahorras hasta 72 %. “24/7, estable y por años” → instancias reservadas o Savings Plans.'
      },
      {
        texto: 'Instancias Spot',
        retro: 'Spot es lo más barato, pero puede interrumpirse con 2 minutos de aviso, y el sitio de reservas no puede caerse.'
      },
      {
        texto: 'Dedicated Hosts',
        retro: 'Un servidor físico exclusivo solo se justifica por licencias o reglas de cumplimiento; aquí nada lo pide y cuesta más.'
      }
    ],
    correcta: 1
  },

  /* ------------------------------------------- c3 · Biomédica del Bajío */
  {
    id: 'c3p1',
    caso: 'c3',
    tema: 'Identidad y seguridad',
    sesion: 2,
    concepto: 'Amazon Macie',
    repaso: 's2-servicios/2',
    texto: 'Biomédica quiere revisar sus 40 buckets para encontrar PDF con nombres, CURP o diagnósticos que hayan quedado fuera de lugar. ¿Qué servicio usa?',
    opciones: [
      {
        texto: 'Amazon Macie',
        retro: '¡Exacto! Macie revisa tus buckets de S3 y encuentra datos personales o sensibles, como nombres o números de tarjeta. “Datos personales en S3” → Macie.'
      },
      {
        texto: 'Amazon Inspector',
        retro: 'Inspector busca vulnerabilidades de software en instancias y contenedores, no datos personales dentro de archivos.'
      },
      {
        texto: 'AWS Certificate Manager',
        retro: 'Certificate Manager da certificados para HTTPS; no revisa qué hay dentro de los buckets.'
      },
      {
        texto: 'Amazon CloudFront',
        retro: 'CloudFront reparte contenido desde las ubicaciones de borde para que cargue rápido; no busca datos personales.'
      }
    ],
    correcta: 0
  },
  {
    id: 'c3p2',
    caso: 'c3',
    tema: 'Almacenamiento',
    sesion: 4,
    concepto: 'Cifrado con SSE-KMS',
    repaso: ['s4-seguridad/1', 's2-servicios/1'],
    texto: 'La auditoría pide cifrar los resultados guardados en S3 con una llave que el laboratorio controle. ¿Qué configura en el bucket?',
    opciones: [
      {
        texto: 'El cifrado por omisión, SSE-S3',
        retro: 'Ya viene encendido y protege los datos, pero las llaves las administra S3, no el laboratorio. Para cifrar con una llave propia, SSE-KMS.'
      },
      {
        texto: 'Activar el versionado del bucket',
        retro: 'El versionado guarda las versiones anteriores de cada archivo; no cifra nada.'
      },
      {
        texto: 'SSE-KMS con una llave de KMS del laboratorio',
        retro: '¡Correcto! KMS crea y guarda las llaves de cifrado; con SSE-KMS, S3 cifra cada objeto con una llave de KMS que es del laboratorio. “Llaves de cifrado que controla el cliente” → KMS.'
      },
      {
        texto: 'Un grupo de seguridad para el bucket',
        retro: 'Los grupos de seguridad protegen a las instancias en la red; no se ponen en un bucket ni cifran archivos.'
      }
    ],
    correcta: 2
  },
  {
    id: 'c3p3',
    caso: 'c3',
    tema: 'Identidad y seguridad',
    sesion: 2,
    concepto: 'Amazon Inspector',
    repaso: 's2-servicios/2',
    texto: 'Antes de la auditoría de diciembre, el laboratorio debe saber si sus 6 instancias EC2 tienen software con vulnerabilidades conocidas. ¿Qué servicio lo revisa?',
    opciones: [
      {
        texto: 'Amazon Route 53',
        retro: 'Route 53 es la agenda de internet (DNS): traduce nombres a direcciones. No revisa el software de las instancias.'
      },
      {
        texto: 'Amazon Macie',
        retro: 'Macie busca datos personales en buckets de S3, no vulnerabilidades en servidores.'
      },
      {
        texto: 'Amazon Inspector',
        retro: '¡Bien! Inspector revisa tus instancias EC2 y contenedores, y te dice qué software tiene vulnerabilidades conocidas y qué tan graves son. Truco: Inspector inspecciona servidores.'
      },
      {
        texto: 'AWS Snowball',
        retro: 'Snowball es un equipo físico para mover muchos datos a AWS; no busca vulnerabilidades.'
      }
    ],
    correcta: 2
  },
  {
    id: 'c3p4',
    caso: 'c3',
    tema: 'Redes',
    sesion: 3,
    concepto: 'Qué hace privada a una subred',
    repaso: ['s3-vpc/3', 's3-lab-vpc/11'],
    texto: 'Los servidores que generan los PDF viven en una subred privada, sin salida a internet. ¿Qué es lo que la hace privada?',
    opciones: [
      {
        texto: 'Su tabla de rutas no manda 0.0.0.0/0 a un Internet Gateway',
        retro: '¡Correcto! Lo que vuelve pública o privada a una subred es su tabla de rutas: si manda 0.0.0.0/0 a un Internet Gateway, es pública; si no, es privada. Es justo lo que revisaste en el laboratorio de la sesión 3.'
      },
      {
        texto: 'Que su nombre dice «privada»',
        retro: 'El nombre es solo una etiqueta para las personas: AWS no lo lee. Una subred llamada «privada» con la ruta 0.0.0.0/0 hacia el Internet Gateway sería pública.'
      },
      {
        texto: 'Que está en otra zona de disponibilidad',
        retro: 'La zona dice en qué centro de datos vive la subred, no si tiene salida a internet. En una misma zona puede haber subredes públicas y privadas.'
      },
      {
        texto: 'Que su grupo de seguridad no tiene reglas de salida',
        retro: 'El grupo de seguridad filtra el tráfico de cada instancia, pero no decide si la subred tiene camino a internet. Eso lo decide la tabla de rutas.'
      }
    ],
    correcta: 0
  },
  {
    id: 'c3p5',
    caso: 'c3',
    tema: 'Almacenamiento',
    sesion: 4,
    concepto: 'S3 Intelligent-Tiering',
    repaso: 's4-s3/2',
    texto: 'Para los 30 TB de imágenes de microscopía, cuyo uso cambia con cada estudio, el laboratorio quiere pagar lo menos posible sin crear reglas ni vigilar nada. ¿Qué le conviene?',
    opciones: [
      {
        texto: 'Guardarlas en S3 Standard-IA',
        retro: 'Es barata para lo que se lee poco, pero cobra cada lectura: con las imágenes que se consultan a diario saldría cara. Aquí no sabes cuáles se van a leer.'
      },
      {
        texto: 'Una regla de ciclo de vida a Glacier Flexible a los 90 días',
        retro: 'El ciclo de vida mueve objetos por su edad, pero aquí la edad no dice si se van a usar: una imagen vieja podría necesitarse mañana y tardaría de minutos a horas en volver.'
      },
      {
        texto: 'Guardarlas en S3 Standard',
        retro: 'Funciona, pero pagas precio de acceso frecuente incluso por las imágenes que nadie abre.'
      },
      {
        texto: 'Guardarlas en S3 Intelligent-Tiering',
        retro: '¡Correcto! Intelligent-Tiering mueve cada objeto, solo, entre niveles según su uso, sin cobrarte las lecturas. “No se sabe qué tan seguido se usarán” → Intelligent-Tiering.'
      }
    ],
    correcta: 3
  },

  /* ------------------------------------ c4 · Instituto de Ciencias del Clima */
  {
    id: 'c4p1',
    caso: 'c4',
    tema: 'Fundamentos y EC2',
    sesion: 1,
    concepto: 'Familia optimizada para cómputo',
    repaso: 's1-ec2/2',
    texto: 'El modelo de pronóstico usa mucho procesador y poca memoria. ¿Qué familia de instancias le conviene al clúster?',
    opciones: [
      {
        texto: 'Optimizada para memoria (familia r)',
        retro: 'La familia r da mucha RAM por cada vCPU, ideal para bases de datos en memoria. Aquí sobra memoria y falta procesador.'
      },
      {
        texto: 'Optimizada para cómputo (familia c)',
        retro: '¡Bien! La familia c da mucho procesador por cada GiB de memoria: simulaciones, cálculos científicos y videojuegos. “Mucho procesador” → optimizada para cómputo.'
      },
      {
        texto: 'Cómputo acelerado con GPU (familia g o p)',
        retro: 'Las GPU son para inteligencia artificial y gráficos. El caso habla de procesador (CPU), no de GPU, y las GPU cuestan mucho más.'
      },
      {
        texto: 'Propósito general ampliable (familia t)',
        retro: 'Las t acumulan créditos de CPU para picos cortos; un clúster que trabaja al máximo 24/7 se los acabaría enseguida.'
      }
    ],
    correcta: 1
  },
  {
    id: 'c4p2',
    caso: 'c4',
    tema: 'Almacenamiento',
    sesion: 4,
    concepto: 'Snapshot de un volumen EBS',
    repaso: ['s4-discos/2', 's4-lab-almacenamiento/11'],
    texto: 'Antes de actualizar el modelo, el instituto quiere un respaldo de los volúmenes EBS de los nodos para poder regresar si algo sale mal. ¿Qué hace?',
    opciones: [
      {
        texto: 'Toma un snapshot de cada volumen',
        retro: '¡Bien! Un snapshot es la foto de un volumen en un momento dado: AWS la guarda en S3 y con ella puedes crear otro volumen igual al de antes. Es el respaldo de un disco EBS, como en el laboratorio de la sesión 4.'
      },
      {
        texto: 'Activa el versionado en cada volumen',
        retro: 'El versionado es de los buckets de S3, no de los discos EBS. Para respaldar un volumen se toma un snapshot.'
      },
      {
        texto: 'Copia los cálculos al instance store',
        retro: 'El instance store se borra cuando la instancia se detiene o falla: es lo contrario de un respaldo.'
      },
      {
        texto: 'Cambia los volúmenes a la clase S3 Glacier',
        retro: 'Glacier es una clase de S3 para objetos; un volumen EBS no tiene clases de S3. El respaldo de un volumen es un snapshot.'
      }
    ],
    correcta: 0
  },
  {
    id: 'c4p3',
    caso: 'c4',
    tema: 'Fundamentos y EC2',
    sesion: 1,
    concepto: 'Compute Savings Plans',
    repaso: 's1-precios/1',
    texto: 'El clúster correrá 24/7 los próximos 3 años, pero el instituto cambiará varias veces de tipo de instancia y quizá de región. ¿Qué opción da un buen descuento sin amarrarlo?',
    opciones: [
      {
        texto: 'Instancias reservadas de un tipo fijo',
        retro: 'Ahorran mucho, pero quedan atadas al tipo de instancia que reservaste. Si el instituto cambia de tipo o de región, el descuento ya no le sirve igual.'
      },
      {
        texto: 'Instancias Spot',
        retro: 'Spot es lo más barato, pero puede interrumpirse, y el pronóstico corre 24/7 y no puede detenerse.'
      },
      {
        texto: 'On-Demand',
        retro: 'Es flexible, pero no tiene ningún descuento: para un uso constante de 3 años pagarías de más.'
      },
      {
        texto: 'Un Compute Savings Plan por 3 años',
        retro: '¡Exacto! Con un Savings Plan te comprometes a gastar cierto monto por hora, y el descuento se aplica aunque cambies de tipo de instancia o de región. Compromiso con flexibilidad → Savings Plans.'
      }
    ],
    correcta: 3
  },
  {
    id: 'c4p4',
    caso: 'c4',
    tema: 'Redes',
    sesion: 3,
    concepto: 'Transit Gateway',
    repaso: 's3-conectar/1',
    texto: 'Las 12 VPC del instituto y la red del campus deben poder hablar entre sí. Con VPC Peering harían falta 66 conexiones solo entre las VPC. ¿Qué lo simplifica?',
    opciones: [
      {
        texto: 'Hacer las 66 conexiones de VPC Peering',
        retro: 'Funciona entre VPC, pero es inmanejable y el peering conecta solo de dos en dos: el campus no podría pasar por una VPC para llegar a otra. Para muchas redes hay un punto central.'
      },
      {
        texto: 'Un Internet Gateway en cada VPC',
        retro: 'El tráfico entre proyectos viajaría por internet y seguiría sin haber un punto central. El Internet Gateway es para salir a internet.'
      },
      {
        texto: 'AWS Transit Gateway como punto central',
        retro: '¡Bien! Transit Gateway es un centro de conexiones: cada VPC y la VPN del campus se conectan una sola vez a él, y desde ahí todas se alcanzan. “Muchas VPC” → Transit Gateway.'
      },
      {
        texto: 'Un bucket de S3 compartido por las 12 VPC',
        retro: 'Un bucket guarda archivos; no conecta redes para que sus servidores hablen entre sí.'
      }
    ],
    correcta: 2
  },
  {
    id: 'c4p5',
    caso: 'c4',
    tema: 'Redes',
    sesion: 3,
    concepto: 'El grupo de seguridad recuerda la conexión',
    repaso: ['s2-servicios/3', 's2-lab-seguridad/15'],
    texto: 'El grupo de seguridad del sitio de alertas deja entrar HTTP (puerto 80) desde cualquier lugar. ¿Hace falta otra regla para que la respuesta del servidor regrese al visitante?',
    opciones: [
      {
        texto: 'Sí: una regla de salida por el puerto 80',
        retro: 'La respuesta no regresa por el puerto 80, sino a un puerto alto del visitante. Y de todos modos no hace falta: el grupo de seguridad recuerda la conexión y deja salir la respuesta sola.'
      },
      {
        texto: 'No: el grupo recuerda la conexión y deja salir la respuesta',
        retro: '¡Exacto! El grupo de seguridad tiene estado (stateful): si dejó entrar la petición, deja salir su respuesta sin otra regla. La que no recuerda nada es la NACL, que sí necesita su regla de salida.'
      },
      {
        texto: 'Sí: una regla de salida para los puertos 1024-65535',
        retro: 'Esa regla la necesita una NACL, que no recuerda las conexiones. El grupo de seguridad sí las recuerda: la respuesta sale sola.'
      },
      {
        texto: 'No: el grupo de seguridad no revisa el tráfico web',
        retro: 'Sí lo revisa: por eso hubo que abrir el puerto 80. Lo que pasa es que, una vez que deja entrar la petición, la respuesta sale sola.'
      }
    ],
    correcta: 1
  },

  /* ------------------------------------------------------- c5 · Tandapp */
  {
    id: 'c5p1',
    caso: 'c5',
    tema: 'Identidad y seguridad',
    sesion: 2,
    concepto: 'SCP en AWS Organizations',
    repaso: 's2-politicas/3',
    texto: 'Tandapp quiere que nadie, ni siquiera el administrador de cada una de sus 4 cuentas miembro, pueda apagar CloudTrail ni borrar sus registros. ¿Qué usa?',
    opciones: [
      {
        texto: 'Una política de IAM con Deny pegada a cada usuario',
        retro: 'Ayuda, pero un administrador podría quitársela, y no aplica al usuario raíz de cada cuenta. Para un techo que nadie dentro de la cuenta pueda brincarse está la SCP.'
      },
      {
        texto: 'Activar MFA en el usuario raíz de cada cuenta',
        retro: 'El MFA protege el inicio de sesión, pero un administrador con MFA podría apagar CloudTrail igual. Hace falta un techo que nadie pueda saltarse.'
      },
      {
        texto: 'Un grupo de seguridad que bloquee CloudTrail',
        retro: 'Los grupos de seguridad filtran el tráfico de red de las instancias; no limitan lo que se puede hacer en la cuenta.'
      },
      {
        texto: 'Una SCP con Deny para esas acciones, aplicada a las 4 cuentas',
        retro: '¡Exacto! Una SCP pone el techo de lo que se puede hacer en las cuentas miembro de la organización, incluidos su administrador y su usuario raíz. Y una denegación explícita siempre gana.'
      }
    ],
    correcta: 3
  },
  {
    id: 'c5p2',
    caso: 'c5',
    tema: 'Identidad y seguridad',
    sesion: 2,
    concepto: 'AWS Certificate Manager',
    repaso: 's2-servicios/1',
    texto: 'La API api.tandapp.mx necesita HTTPS con un certificado TLS gratuito que se renueve solo. ¿Qué servicio lo da?',
    opciones: [
      {
        texto: 'AWS Certificate Manager (ACM)',
        retro: '¡Correcto! ACM emite certificados SSL/TLS públicos sin costo para usarlos con servicios de AWS. Dato extra: además, los renueva solo. “Certificado” o “HTTPS” → ACM.'
      },
      {
        texto: 'AWS Key Management Service (KMS)',
        retro: 'KMS crea y guarda las llaves con que se cifran tus datos guardados; no emite certificados para HTTPS.'
      },
      {
        texto: 'Amazon EBS',
        retro: 'EBS es el disco de una instancia; no da certificados para HTTPS.'
      },
      {
        texto: 'AWS Shield Advanced',
        retro: 'Shield protege contra DDoS, pero no da certificados. HTTPS cifra el tráfico; Shield lo defiende de ataques de volumen.'
      }
    ],
    correcta: 0
  },
  {
    id: 'c5p3',
    caso: 'c5',
    tema: 'Redes',
    sesion: 3,
    concepto: 'Route 53 con conmutación por error',
    repaso: 's3-borde/1',
    texto: 'Si la región de México falla, api.tandapp.mx debe mandar a los usuarios a la copia de Virginia del Norte, sin que nadie cambie nada a mano. ¿Qué usa Tandapp?',
    opciones: [
      {
        texto: 'Un Internet Gateway en cada región',
        retro: 'El Internet Gateway conecta una VPC con internet; no decide a qué región llegan los usuarios.'
      },
      {
        texto: 'Route 53 con enrutamiento ponderado (weighted)',
        retro: 'El ponderado reparte a los usuarios por porcentajes (por ejemplo, 90 y 10) aunque las dos regiones estén bien; no espera a que una falle.'
      },
      {
        texto: 'Route 53 con conmutación por error (failover)',
        retro: '¡Correcto! Route 53 revisa si la región principal contesta y, si falla, responde con la dirección de la de respaldo. Es la agenda de internet con plan B.'
      },
      {
        texto: 'VPC Peering entre las dos regiones',
        retro: 'El peering conecta dos VPC para que hablen en privado; no cambia a dónde apunta el nombre api.tandapp.mx.'
      }
    ],
    correcta: 2
  },
  {
    id: 'c5p4',
    caso: 'c5',
    tema: 'Fundamentos y EC2',
    sesion: 1,
    concepto: 'Servicios disponibles por región',
    repaso: 's1-global/2',
    texto: 'El equipo quiere probar, con datos ficticios, un servicio nuevo de AWS que todavía no existe en mx-central-1. ¿Qué hace?',
    opciones: [
      {
        texto: 'Pide que lo activen en otra zona de disponibilidad de mx-central-1',
        retro: 'Las zonas de una región ofrecen los mismos servicios: si el servicio no ha llegado a la región, no está en ninguna de sus zonas.'
      },
      {
        texto: 'Hace la prueba en una región donde sí exista, como us-east-1',
        retro: '¡Correcto! No todos los servicios existen en todas las regiones; los nuevos suelen llegar primero a unas cuantas. Como son datos ficticios, ninguna ley lo obliga a quedarse en México.'
      },
      {
        texto: 'Lo usa desde la ubicación de borde de la Ciudad de México',
        retro: 'Las ubicaciones de borde sirven a CloudFront y Route 53; no ofrecen los servicios que viven en una región.'
      },
      {
        texto: 'Nada: cada cuenta de AWS solo puede usar una región',
        retro: 'Una cuenta puede usar todas las regiones, y tú eliges dónde crear cada recurso.'
      }
    ],
    correcta: 1
  },
  {
    id: 'c5p5',
    caso: 'c5',
    tema: 'Fundamentos y EC2',
    sesion: 1,
    concepto: 'Instancias ampliables (burstable)',
    repaso: 's1-ec2/2',
    texto: 'El panel interno casi no usa procesador, salvo 10 minutos a las 9:00 cuando entran las 8 personas. ¿Qué familia de instancia es la más barata que cumple?',
    opciones: [
      {
        texto: 'Optimizada para cómputo (familia c)',
        retro: 'Tendrías procesador de sobra las 24 horas para usarlo 10 minutos al día: pagarías por una potencia que casi nunca usas.'
      },
      {
        texto: 'Optimizada para memoria (familia r)',
        retro: 'El panel no pide mucha RAM; la familia r cuesta más por algo que no necesitas.'
      },
      {
        texto: 'De propósito general ampliable (familia t)',
        retro: '¡Exacto! Las t son ampliables (burstable): acumulan créditos de CPU mientras están tranquilas y los gastan en el pico de las 9:00. Perfectas para poco uso con picos cortos.'
      },
      {
        texto: 'Cómputo acelerado con GPU (familia g)',
        retro: 'Las GPU son para inteligencia artificial y gráficos; un panel interno no las necesita y son de las más caras.'
      }
    ],
    correcta: 2
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
