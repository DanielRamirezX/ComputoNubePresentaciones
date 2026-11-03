// Parte teórica del examen final (SIMULADOR.md §6.4): 8 casos de negocio con 5
// preguntas cada uno, 40 preguntas en 50 minutos, al estilo del examen AWS
// Certified Cloud Practitioner (CLF-C02). Cubre todo el temario de la Ruta AWS:
// las sesiones 1 a 7 y los temas que agregan las prácticas 9 a 13 (migración y
// las 7R, IA/ML, analítica, seguridad avanzada, gobierno y despliegue).
//
// Los temas son los cuatro dominios del CLF-C02, con un reparto cercano a sus
// pesos oficiales: Conceptos 9 (24 %), Seguridad 12 (30 %), Tecnología 14
// (34 %) y Facturación 5 (12 %). Por sesión: S1 2 · S2 5 · S3 3 · S4 2 · S5 4 ·
// S6 6 · S7 8 · S8 6 (los temas de «Lo que el examen pregunta y la Ruta no
// vio») · S10 1 · S11 1 · S13 2. La clave está balanceada (10 por letra, sin
// rachas de tres) y la correcta casi nunca es la más larga.
//
// Las preguntas son nuevas: no copian las de los simulacros ni las de los
// bancos de la Ruta, pero algunos conceptos se repiten (a veces con un escenario
// parecido) porque son los que más pregunta el CLF-C02. La
// respuesta correcta y la retroalimentación viven solo en el servidor.
//
// `repaso` apunta a la lámina de la Ruta donde se explica el tema (catálogo en
// src/repaso.js). Los temas que la Ruta no vio en las sesiones 1 a 7 apuntan a
// su lección de las prácticas (s10-examen, s11-examen, s13-examen) o a
// 's8-extras'. Elastic Disaster Recovery (c1p3) todavía no tiene lámina propia:
// apunta a «Planear la mudanza» de la sesión 13.
// Corre `node src/teoria/verificar-teoria.js` y `npm run verificar` si cambias algo.

import { bancoPublico, calificarBanco } from './comun.js';

export const TEMAS = ['Conceptos de la nube', 'Seguridad y cumplimiento', 'Tecnología y servicios', 'Facturación, precios y soporte'];

export const MINUTOS = 50;

// Las reglas que revisa verificar-teoria.js (SIMULADOR.md §6: 8 × 5 en 50 minutos).
export const REGLAS = {
  casos: 8,
  preguntasPorCaso: 5,
  minutos: MINUTOS,
  temas: TEMAS,
  porTema: {
    'Conceptos de la nube': [9, 10],
    'Seguridad y cumplimiento': [11, 12],
    'Tecnología y servicios': [13, 14],
    'Facturación, precios y soporte': [5, 6]
  },
  sesiones: [0, 13]
};

// Lo que se muestra antes de empezar.
export const CASO = `
  <p>Parte teórica del <strong>examen final</strong>. Igual que en el examen <strong>AWS Certified Cloud Practitioner (CLF-C02)</strong>, cada pregunta describe una situación y te pide la mejor opción. Son <strong>8 casos con 5 preguntas cada uno: 40 preguntas en 50 minutos</strong>, con todo lo que vimos en la Ruta y de los cuatro dominios del examen.</p>
  <ul>
    <li><strong>Lee la historia completa</strong> antes de contestar: los datos que deciden la respuesta (cuánto tráfico, cuántos terabytes, qué tan rápido deben responder) están ahí.</li>
    <li>Busca la <strong>palabra clave</strong>: “tal como están”, “en tiempo real”, “sin servidores”, “hardware dedicado”, “antes de que pase”, “el más barato que cumple”…</li>
    <li>Si dos opciones funcionan, quédate con la que <strong>cumple todo con menos costo y menos trabajo</strong>.</li>
    <li>Tienes unos <strong>75 segundos por pregunta</strong>: si una se te atora, marca tu mejor opción y sigue. Una pregunta sin contestar cuenta como error.</li>
  </ul>`;

export const CASOS = [
  {
    id: 'c1',
    empresa: 'Viajes Sol Caribe',
    titulo: 'La mudanza antes de los huracanes',
    historia: `
      <p><strong>Viajes Sol Caribe</strong> es una agencia de viajes de Cancún con 30 años de historia. Su centro de datos está en una bodega rentada cuyo contrato <strong>vence en 8 meses</strong>, justo antes de la temporada de huracanes, y la dirección no quiere volver a comprar servidores cada cinco años.</p>
      <p>Tiene <strong>40 servidores virtuales</strong> con el sistema de reservas, que quiere mover tal como están, sin reescribir nada. Su base de datos <strong>Oracle</strong> de 2 TB pasará a <strong>Aurora PostgreSQL</strong> para dejar de pagar licencias, sin dejar de vender durante la mudanza. Y si un huracán apaga la bodega antes de terminar la mudanza, quieren <strong>levantar sus servidores en AWS en minutos</strong>, perdiendo solo segundos de datos.</p>
      <p>El director de sistemas teme que su equipo de 6 personas no sepa operar la nube.</p>`
  },
  {
    id: 'c2',
    empresa: 'Súper La Norteña',
    titulo: 'El Buen Fin sin caídas',
    historia: `
      <p><strong>Súper La Norteña</strong> tiene 45 supermercados en Nuevo León y Coahuila y una tienda en línea que corre en <strong>4 instancias EC2 fijas</strong>, todas en la misma zona de disponibilidad. En el Buen Fin las visitas se multiplican por 8 durante 4 días; el año pasado el sitio se cayó el viernes y perdieron ventas.</p>
      <p>Cuando entran miles de pedidos al mismo tiempo, el <strong>sistema de cobro</strong> se satura y algunos pedidos se pierden. Cada noche corren <strong>reportes de inventario</strong> de 3 horas; si se interrumpen, se reanudan al día siguiente sin problema.</p>
      <p>El martes pasado alguien <strong>terminó una instancia</strong> de producción y nadie confiesa quién fue.</p>`
  },
  {
    id: 'c3',
    empresa: 'Seguros Alcance',
    titulo: 'Una aseguradora bajo la lupa',
    historia: `
      <p><strong>Seguros Alcance</strong> vende seguros de auto desde la Ciudad de México y tiene 300 empleados. La Comisión Nacional de Seguros y Fianzas (CNSF) le pidió los <strong>reportes ISO 27001 y SOC 2</strong> de su proveedor de nube.</p>
      <p>Sus ajustadores suben las fotos de cada choque a un bucket de S3, y una aplicación en EC2 debe leerlas. En una revisión descubrieron <strong>llaves de acceso escritas en el código</strong>. También quieren enterarse si alguien usa su cuenta desde direcciones sospechosas o si una instancia empieza a minar criptomonedas.</p>
      <p>Sus llaves de cifrado deben vivir en <strong>hardware dedicado solo para ellos</strong>, que únicamente su equipo controle. Su centro de datos corporativo, al que se conectan sus <strong>30 oficinas</strong>, debe llegar a AWS por una conexión privada y estable que no pase por internet.</p>`
  },
  {
    id: 'c4',
    empresa: 'Antojo Ya',
    titulo: 'Pedidos a la hora de la comida',
    historia: `
      <p><strong>Antojo Ya</strong> es una app de comida a domicilio de Guadalajara con <strong>200,000 usuarios</strong>. Su tráfico es impredecible: casi nada de madrugada, picos de 13:00 a 16:00 y avalanchas en los partidos de las Chivas. Sus 5 desarrolladores escribieron la lógica en <strong>funciones de AWS Lambda</strong> para no administrar servidores.</p>
      <p>La app móvil necesita una <strong>API REST</strong> que llame a esas funciones y limite las peticiones de cada usuario. Los clientes se registran con su correo o con su cuenta de Google. Los carritos y pedidos se guardan en una tabla de llave y valor que debe responder en milisegundos con cualquier nivel de tráfico.</p>
      <p>El director financiero quiere entender cómo cobra Lambda antes de aprobar el presupuesto.</p>`
  },
  {
    id: 'c5',
    empresa: 'TeleBajío Noticias',
    titulo: 'Noticias para los paisanos',
    historia: `
      <p><strong>TeleBajío Noticias</strong> es una televisora de León, Guanajuato. Publica sus noticieros en video en su sitio, servido con CloudFront desde un bucket de S3. Ahora quiere abrir una <strong>edición para los paisanos en Estados Unidos</strong>, con servidores cerca de ellos, en semanas y sin construir nada allá.</p>
      <p>Quiere <strong>subtítulos automáticos</strong> en español y en inglés de cada noticiero, y un <strong>resumen de cada nota</strong> escrito con inteligencia artificial generativa, sin entrenar un modelo propio. Los videos se ven mucho la primera semana; después de 30 días casi nadie los busca, pero por ley se conservan <strong>10 años</strong> (luego se borran) y, si alguien los pide, puede esperar 12 horas.</p>
      <p>Hoy cualquiera con la liga directa del bucket descarga los videos sin pasar por el sitio.</p>`
  },
  {
    id: 'c6',
    empresa: 'Frutas Tierra Fértil',
    titulo: 'Los datos del campo',
    historia: `
      <p><strong>Frutas Tierra Fértil</strong> exporta zarzamoras y arándanos desde Zamora, Michoacán, a Estados Unidos y Europa. En sus invernaderos hay <strong>2,000 sensores</strong> que mandan humedad y temperatura cada segundo, y quiere ver esos datos en tiempo real para regar a tiempo.</p>
      <p>Guarda 8 años de cosechas como archivos <strong>CSV en S3</strong> y quiere consultarlos con SQL, sin montar servidores ni cargarlos a una base. Su sistema de nómina corre en un servidor viejo: lo cambiará por un servicio de nómina en línea que se paga por empleado.</p>
      <p>Detectaron que una <strong>dirección IP extraña</strong> escanea todos los servidores de una subred. Además, sus clientes europeos le piden <strong>medir y reducir el impacto ambiental</strong> de su tecnología.</p>`
  },
  {
    id: 'c7',
    empresa: 'Gimnasios Fortaleza',
    titulo: 'Doce cuentas y una sola factura',
    historia: `
      <p><strong>Gimnasios Fortaleza</strong> tiene 60 gimnasios en 12 estados. Cada estado abrió su propia cuenta de AWS y paga su propia factura; ahora la dirección quiere <strong>una sola factura</strong> y aprovechar los descuentos por volumen.</p>
      <p>Van a reorganizar todo en un entorno de varias cuentas con <strong>buenas prácticas ya aplicadas</strong> (registros centralizados y controles de seguridad), sin armarlo pieza por pieza. El director financiero quiere un correo <strong>antes</strong> de que el gasto del mes pase de 3,000 dólares, no después.</p>
      <p>Su app de reservas es crítica: si se cae, necesitan respuesta de AWS en <strong>menos de 15 minutos</strong> y un experto de AWS asignado que conozca su arquitectura. Sus servidores de pruebas pasan la noche encendidos y casi no usan CPU.</p>`
  },
  {
    id: 'c8',
    empresa: 'Pizarrón Digital',
    titulo: 'Tareas en línea para primarias',
    historia: `
      <p><strong>Pizarrón Digital</strong> es una startup de Puebla con una plataforma de tareas para 300 primarias. Su sitio corre en instancias EC2 en una subred pública y su base <strong>MySQL en Amazon RDS</strong>, en una subred privada. Si falla el centro de datos donde está la base, esta debe seguir funcionando sola.</p>
      <p>Hoy crean la red y los servidores a mano en la consola, y cada ambiente (pruebas y producción) queda un poco distinto. La <strong>contraseña de la base</strong> está escrita en el código y nunca se cambia, y la base solo debe recibir conexiones de los servidores web.</p>
      <p>El socio fundador cree que, como RDS es administrado, <strong>AWS se encarga de toda la seguridad</strong>.</p>`
  }
];

export const PREGUNTAS = [
  /* ---------------------------------------------- c1 · Viajes Sol Caribe */
  {
    id: 'c1p1',
    caso: 'c1',
    tema: 'Conceptos de la nube',
    sesion: 8,
    concepto: 'Las 7R de migración: rehost',
    repaso: ['s8-extras/3', 's7-buenas-practicas/2'],
    texto: 'Los 40 servidores del sistema de reservas deben llegar a AWS antes de que venza la renta, tal como están y sin reescribir nada. ¿Qué estrategia de migración es?',
    opciones: [
      {
        texto: 'Rehost (lift and shift): moverlos tal cual',
        retro: '¡Correcto! Rehost es “levantar y mover”: la aplicación llega igual y solo cambia dónde corre. Es la más rápida cuando hay fecha límite, y AWS Application Migration Service la automatiza. Ya en la nube pueden optimizarla con calma.'
      },
      {
        texto: 'Refactor: rediseñarlos para la nube',
        retro: 'Refactor (rearquitectar) reescribe la aplicación, por ejemplo en microservicios o sin servidores. Da más beneficios, pero tarda mucho y aquí piden no reescribir nada.'
      },
      {
        texto: 'Retire: apagarlos para siempre',
        retro: 'Retire es dar de baja lo que ya no sirve. El sistema de reservas es el corazón de la agencia: hay que moverlo, no apagarlo.'
      },
      {
        texto: 'Repurchase: cambiarlos por un software SaaS',
        retro: 'Repurchase es dejar tu sistema y pasarte a un producto como servicio (SaaS). Cambiaría la forma de trabajar y no sería “tal como están”.'
      }
    ],
    correcta: 0
  },
  {
    id: 'c1p2',
    caso: 'c1',
    tema: 'Tecnología y servicios',
    sesion: 5,
    concepto: 'AWS DMS con conversión de esquemas (SCT)',
    repaso: 's5-otras/2',
    texto: 'La base Oracle de 2 TB debe pasar a Aurora PostgreSQL mientras el sistema de reservas sigue vendiendo. ¿Qué usan?',
    opciones: [
      {
        texto: 'AWS DataSync para copiar los archivos de la base',
        retro: 'DataSync copia archivos y carpetas entre tu almacenamiento y AWS. No traduce una base Oracle a PostgreSQL ni la mantiene sincronizada mientras se usa.'
      },
      {
        texto: 'Amazon Athena para leer la base desde S3',
        retro: 'Athena consulta con SQL archivos guardados en S3; no migra una base en uso ni convierte su esquema.'
      },
      {
        texto: 'AWS DMS, con la conversión de esquemas (SCT)',
        retro: '¡Correcto! DMS (Database Migration Service) copia los datos mientras la base de origen sigue funcionando y, como el motor cambia (Oracle → PostgreSQL), la conversión de esquemas (SCT) traduce las tablas y el código. Base que cambia de motor → DMS + SCT.'
      },
      {
        texto: 'Un snapshot de RDS que se restaura en Aurora',
        retro: 'La base Oracle vive en su centro de datos, no en RDS: no hay un snapshot de RDS que restaurar. Y un snapshot no cambia el motor de la base.'
      }
    ],
    correcta: 2
  },
  {
    id: 'c1p3',
    caso: 'c1',
    tema: 'Tecnología y servicios',
    sesion: 13,
    concepto: 'AWS Elastic Disaster Recovery',
    repaso: ['s13-examen/2', 's1-global/1'],
    texto: 'Mientras termina la mudanza, si un huracán apaga la bodega, quieren que sus servidores arranquen en AWS en minutos con los datos de unos segundos antes. ¿Qué servicio usan?',
    opciones: [
      {
        texto: 'Snapshots manuales de EBS cada fin de semana',
        retro: 'Un snapshot semanal perdería hasta una semana de datos y alguien tendría que restaurarlo a mano. Además, sus servidores todavía viven en la bodega, no en EBS.'
      },
      {
        texto: 'AWS Elastic Disaster Recovery',
        retro: '¡Exacto! Elastic Disaster Recovery replica sin parar los servidores de la bodega a un área de bajo costo en AWS, con un punto de recuperación de segundos, y si hay un desastre los levanta en EC2 en minutos. Recuperar servidores ante un desastre → Elastic Disaster Recovery.'
      },
      {
        texto: 'Una AWS Site-to-Site VPN entre la bodega y AWS',
        retro: 'La VPN conecta las dos redes, pero no copia ni levanta ningún servidor si la bodega se apaga.'
      },
      {
        texto: 'AWS Storage Gateway con copias diarias',
        retro: 'Storage Gateway lleva archivos a la nube, pero no replica servidores completos ni los arranca en minutos, y con copias diarias perderían hasta un día de datos.'
      }
    ],
    correcta: 1
  },
  {
    id: 'c1p4',
    caso: 'c1',
    tema: 'Conceptos de la nube',
    sesion: 7,
    concepto: 'Perspectiva de Personas del CAF',
    repaso: 's7-buenas-practicas/2',
    texto: 'El director de sistemas quiere un plan de capacitación para su equipo de 6 personas y definir los nuevos puestos que pedirá la nube. ¿Qué perspectiva del AWS Cloud Adoption Framework (CAF) atiende eso?',
    opciones: [
      {
        texto: 'Plataforma',
        retro: 'Plataforma trata de cómo construir la arquitectura en la nube, no de preparar a la gente.'
      },
      {
        texto: 'Gobernanza',
        retro: 'Gobernanza cuida el riesgo, el presupuesto y los beneficios de la migración; la capacitación es de otra perspectiva.'
      },
      {
        texto: 'Operaciones',
        retro: 'Operaciones trata de mantener funcionando lo que ya se migró (monitoreo, incidentes), no de capacitar al equipo.'
      },
      {
        texto: 'Personas',
        retro: '¡Correcto! La perspectiva de Personas cubre la cultura, la capacitación y los nuevos roles. Es una de las tres de negocio, junto con Negocio y Gobernanza.'
      }
    ],
    correcta: 3
  },
  {
    id: 'c1p5',
    caso: 'c1',
    tema: 'Conceptos de la nube',
    sesion: 7,
    concepto: 'Gasto fijo contra gasto variable',
    repaso: 's7-precios/1',
    texto: 'Ya en AWS, la agencia apagará en temporada baja la mitad de sus servidores. El contador pregunta qué pasará con la factura de esos meses. ¿Qué le contestan?',
    opciones: [
      {
        texto: 'Baja, porque en la nube el gasto es variable y sigue al uso',
        retro: '¡Exacto! En la nube cambias gasto fijo por gasto variable: una instancia detenida deja de cobrar horas de cómputo (sus discos EBS sí se siguen cobrando). Con servidores propios, el equipo ya estaba pagado aunque lo apagaras.'
      },
      {
        texto: 'Sigue igual, porque los servidores ya se pagaron por adelantado',
        retro: 'Eso pasaba en la bodega: el equipo se pagaba de golpe. En AWS On-Demand no hay pago adelantado por los servidores.'
      },
      {
        texto: 'Sube, porque AWS cobra una multa por apagar servidores',
        retro: 'No hay ninguna multa: detener una instancia solo deja de sumar horas de cómputo.'
      },
      {
        texto: 'Sigue igual, porque AWS cobra una tarifa fija por cuenta',
        retro: 'Una cuenta de AWS no tiene cuota fija: pagas por lo que usas.'
      }
    ],
    correcta: 0
  },

  /* ---------------------------------------------- c2 · Súper La Norteña */
  {
    id: 'c2p1',
    caso: 'c2',
    tema: 'Conceptos de la nube',
    sesion: 6,
    concepto: 'Elasticidad',
    repaso: 's6-elasticidad/1',
    texto: 'La Norteña quiere tener más servidores solo durante los 4 días del Buen Fin y volver a los de siempre después, pagando solo lo que usa. ¿Qué característica de la nube aprovecha?',
    opciones: [
      {
        texto: 'Alta disponibilidad',
        retro: 'La alta disponibilidad es seguir funcionando aunque algo falle (por ejemplo, una zona). Aquí se habla de ajustar la cantidad de servidores a la demanda.'
      },
      {
        texto: 'Economías de escala',
        retro: 'Las economías de escala son la razón de que AWS baje precios por su tamaño; no describen crecer y encogerse según las visitas.'
      },
      {
        texto: 'Elasticidad',
        retro: '¡Correcto! Elasticidad es crecer cuando sube la demanda y encogerse cuando baja, en automático, pagando solo lo que usas. En AWS la logras con Auto Scaling.'
      },
      {
        texto: 'Durabilidad',
        retro: 'La durabilidad es que los datos no se pierdan (como los once nueves de S3); no tiene que ver con cuántos servidores corren.'
      }
    ],
    correcta: 2
  },
  {
    id: 'c2p2',
    caso: 'c2',
    tema: 'Tecnología y servicios',
    sesion: 6,
    concepto: 'Auto Scaling en varias zonas con un balanceador',
    repaso: ['s6-elasticidad/2', 's6-balanceadores/1'],
    texto: 'Además de crecer en el Buen Fin, el sitio debe seguir vendiendo aunque falle una zona de disponibilidad completa. ¿Qué arquitectura cumple todo?',
    opciones: [
      {
        texto: 'Una sola instancia mucho más grande en la misma zona',
        retro: 'Crecer hacia arriba (escalar verticalmente) tiene límite y sigue dependiendo de una zona: si esa zona falla, el sitio se cae.'
      },
      {
        texto: 'Auto Scaling en 2 zonas con un Application Load Balancer',
        retro: '¡Exacto! Auto Scaling agrega y quita instancias según la carga y las reparte en varias zonas; el balanceador manda a los clientes solo a las sanas. Si una zona cae, el grupo lanza reemplazos en la otra.'
      },
      {
        texto: '32 instancias encendidas todo noviembre en la misma zona',
        retro: 'Pagarían 32 servidores todo el mes para usarlos 4 días y, si la zona falla, caen todos juntos.'
      },
      {
        texto: 'Una copia en otra región que encienden a mano si hay tráfico',
        retro: 'Depende de que alguien reaccione a tiempo y no ajusta sola la cantidad de servidores. Para sobrevivir a la falla de una zona basta con usar varias zonas de la misma región.'
      }
    ],
    correcta: 1
  },
  {
    id: 'c2p3',
    caso: 'c2',
    tema: 'Tecnología y servicios',
    sesion: 6,
    concepto: 'Desacoplar con Amazon SQS',
    repaso: 's6-serverless/2',
    texto: 'Cuando llegan miles de pedidos juntos, el sistema de cobro se satura y algunos pedidos se pierden. ¿Qué evita que se pierdan, sin agrandar el cobro al tamaño del pico?',
    opciones: [
      {
        texto: 'Un tema de Amazon SNS que avise a cada cliente que reintente',
        retro: 'SNS reparte un aviso a muchos suscriptores al mismo tiempo, pero no guarda los pedidos en espera: si el cobro está saturado, el pedido igual se pierde.'
      },
      {
        texto: 'Amazon CloudFront delante del sistema de cobro',
        retro: 'CloudFront guarda copias de contenido cerca de los usuarios. Un cobro no se puede “cachear”: cada pedido debe procesarse.'
      },
      {
        texto: 'Una alarma de CloudWatch que reinicie el cobro',
        retro: 'Reiniciar un sistema saturado no recupera los pedidos que ya se perdieron; solo cambia el momento de la caída.'
      },
      {
        texto: 'Una cola de Amazon SQS entre la tienda y el cobro',
        retro: '¡Correcto! La tienda deja cada pedido en la cola y el cobro los toma a su ritmo: si se atrasa, los pedidos esperan, no se pierden. Eso es desacoplar.'
      }
    ],
    correcta: 3
  },
  {
    id: 'c2p4',
    caso: 'c2',
    tema: 'Facturación, precios y soporte',
    sesion: 1,
    concepto: 'Instancias Spot para trabajos que toleran interrupciones',
    repaso: 's1-precios/1',
    texto: 'Los reportes de inventario corren 3 horas cada noche y, si se interrumpen, se reanudan al día siguiente sin problema. ¿Qué forma de pago de EC2 les sale más barata?',
    opciones: [
      {
        texto: 'Instancias Spot',
        retro: '¡Exacto! Spot usa la capacidad sobrante de AWS con descuentos de hasta 90 %. AWS puede recuperarla con dos minutos de aviso, pero a estos reportes no les importa: se reanudan después.'
      },
      {
        texto: 'On-Demand',
        retro: 'On-Demand no exige compromiso ni se interrumpe, pero es la tarifa completa. Si el trabajo tolera interrupciones, hay una opción mucho más barata.'
      },
      {
        texto: 'Compute Savings Plans por 3 años',
        retro: 'Un Savings Plan descuenta a cambio de comprometer un gasto por hora durante 1 o 3 años, y ese compromiso se paga las 24 horas aunque solo uses 3. Spot sale más barato.'
      },
      {
        texto: 'Dedicated Hosts',
        retro: 'Un servidor físico solo para ti: es para licencias por servidor o reglas de cumplimiento, y es de lo más caro.'
      }
    ],
    correcta: 0
  },
  {
    id: 'c2p5',
    caso: 'c2',
    tema: 'Seguridad y cumplimiento',
    sesion: 6,
    concepto: 'AWS CloudTrail: quién hizo qué',
    repaso: 's6-monitorear/1',
    texto: '¿Dónde averigua La Norteña quién terminó la instancia de producción el martes pasado?',
    opciones: [
      {
        texto: 'En las métricas de la instancia en Amazon CloudWatch',
        retro: 'CloudWatch mide cómo se comportan los recursos (CPU, red, alarmas); no registra qué usuario hizo cada acción.'
      },
      {
        texto: 'En los VPC Flow Logs de la subred',
        retro: 'Los Flow Logs registran el tráfico de red (qué IP habló con cuál), no las llamadas a la API como TerminateInstances.'
      },
      {
        texto: 'En el historial de eventos de AWS CloudTrail',
        retro: '¡Correcto! CloudTrail registra cada llamada a la API: quién, cuándo, desde qué IP y qué hizo. Busca el evento TerminateInstances. CloudTrail = auditoría; CloudWatch = desempeño.'
      },
      {
        texto: 'En el AWS Health Dashboard',
        retro: 'El Health Dashboard avisa de problemas y mantenimientos de AWS que afectan tus recursos; no dice qué hizo cada usuario de tu cuenta.'
      }
    ],
    correcta: 2
  },

  /* ---------------------------------------------- c3 · Seguros Alcance */
  {
    id: 'c3p1',
    caso: 'c3',
    tema: 'Seguridad y cumplimiento',
    sesion: 2,
    concepto: 'AWS Artifact',
    repaso: 's2-responsabilidad/2',
    texto: 'La CNSF pide los reportes ISO 27001 y SOC 2 que demuestran cómo protege AWS sus centros de datos. ¿De dónde los saca Seguros Alcance?',
    opciones: [
      {
        texto: 'De AWS Config',
        retro: 'Config registra la configuración de tus recursos y revisa si cumplen tus reglas. No guarda las auditorías que otros le hacen a AWS.'
      },
      {
        texto: 'De AWS Artifact',
        retro: '¡Correcto! AWS Artifact es el portal gratuito de autoservicio donde descargas los reportes de cumplimiento de AWS (ISO, SOC, PCI) y aceptas acuerdos como el BAA.'
      },
      {
        texto: 'De Amazon Inspector',
        retro: 'Inspector busca vulnerabilidades en tus instancias, contenedores y funciones Lambda; no entrega certificaciones de AWS.'
      },
      {
        texto: 'De AWS Trusted Advisor',
        retro: 'Trusted Advisor recomienda mejoras para tu cuenta (costos, seguridad, límites), pero no tiene los reportes de auditoría de AWS.'
      }
    ],
    correcta: 1
  },
  {
    id: 'c3p2',
    caso: 'c3',
    tema: 'Seguridad y cumplimiento',
    sesion: 2,
    concepto: 'Rol de IAM para una instancia EC2',
    repaso: 's2-identidades/1',
    texto: 'La aplicación en EC2 debe leer las fotos del bucket, y en su código ya no debe haber llaves de acceso. ¿Qué hacen?',
    opciones: [
      {
        texto: 'Crear un usuario de IAM para la aplicación y guardar sus llaves en el servidor',
        retro: 'Siguen siendo llaves permanentes guardadas en la instancia: si alguien entra al servidor o copia su disco, se las lleva.'
      },
      {
        texto: 'Volver público el bucket, pero solo para lectura',
        retro: 'Así cualquiera en internet vería las fotos de los choques, con placas y personas. Nunca se abre un bucket para resolver un permiso interno.'
      },
      {
        texto: 'Guardar las llaves del desarrollador en AWS Secrets Manager',
        retro: 'Secrets Manager guarda secretos muy bien, pero seguirían siendo las llaves permanentes de una persona. Para que un recurso de AWS tenga permisos hay algo mejor.'
      },
      {
        texto: 'Asignar a la instancia un rol de IAM que solo pueda leer ese bucket',
        retro: '¡Exacto! Un rol da a la instancia credenciales temporales que AWS renueva solo; nadie las ve ni las escribe. Y con permiso de solo lectura sobre ese bucket aplicas el mínimo privilegio.'
      }
    ],
    correcta: 3
  },
  {
    id: 'c3p3',
    caso: 'c3',
    tema: 'Seguridad y cumplimiento',
    sesion: 2,
    concepto: 'Amazon GuardDuty',
    repaso: 's2-servicios/2',
    texto: 'Quieren enterarse, sin revisar registros a mano, si alguien usa la cuenta desde direcciones IP sospechosas o si una instancia empieza a minar criptomonedas. ¿Qué servicio activan?',
    opciones: [
      {
        texto: 'Amazon GuardDuty',
        retro: '¡Correcto! GuardDuty analiza por su cuenta los registros de CloudTrail, de la VPC y del DNS (y otras fuentes que actives) para detectar amenazas: accesos desde IP maliciosas, minería de criptomonedas, credenciales robadas. Es el guardia de la cuenta.'
      },
      {
        texto: 'Amazon Macie',
        retro: 'Macie busca datos personales o sensibles dentro de S3 (por ejemplo, CURP o tarjetas); no vigila accesos raros ni instancias.'
      },
      {
        texto: 'Amazon Inspector',
        retro: 'Inspector revisa vulnerabilidades conocidas (software sin parchar, puertos expuestos), no comportamiento sospechoso en la cuenta.'
      },
      {
        texto: 'AWS Shield Standard',
        retro: 'Shield Standard protege contra ataques DDoS; no detecta accesos desde IP sospechosas ni minería dentro de tus instancias.'
      }
    ],
    correcta: 0
  },
  {
    id: 'c3p4',
    caso: 'c3',
    tema: 'Seguridad y cumplimiento',
    sesion: 8,
    concepto: 'AWS CloudHSM',
    repaso: ['s8-extras/4', 's2-servicios/1'],
    texto: 'Las llaves de cifrado deben vivir en un módulo de hardware dedicado solo a la aseguradora (un solo inquilino), que únicamente su equipo administre. ¿Qué usan?',
    opciones: [
      {
        texto: 'Llaves administradas por AWS en AWS KMS (como aws/s3)',
        retro: 'Las llaves administradas por AWS las crea y controla AWS, y el hardware de KMS se comparte entre clientes. Piden hardware dedicado bajo su propio control.'
      },
      {
        texto: 'AWS Secrets Manager',
        retro: 'Secrets Manager guarda y rota contraseñas y llaves de API, pero no es un módulo de hardware dedicado para llaves de cifrado.'
      },
      {
        texto: 'AWS CloudHSM',
        retro: '¡Correcto! CloudHSM te da módulos de seguridad de hardware (HSM) dedicados, dentro de tu VPC, y solo tú administras las llaves: AWS no puede usarlas. “HSM dedicado, un solo inquilino” → CloudHSM.'
      },
      {
        texto: 'AWS Certificate Manager',
        retro: 'Certificate Manager emite y renueva certificados SSL/TLS para HTTPS; no guarda las llaves de cifrado de los datos en hardware dedicado.'
      }
    ],
    correcta: 2
  },
  {
    id: 'c3p5',
    caso: 'c3',
    tema: 'Tecnología y servicios',
    sesion: 3,
    concepto: 'AWS Direct Connect',
    repaso: 's3-conectar/1',
    texto: 'El centro de datos corporativo, al que se conectan las 30 oficinas, debe llegar a AWS por una conexión privada y estable que no pase por internet. ¿Qué contratan?',
    opciones: [
      {
        texto: 'Una AWS Site-to-Site VPN',
        retro: 'La VPN viaja cifrada, pero por internet, y su velocidad depende del tráfico de internet. Piden una conexión que no pase por ahí.'
      },
      {
        texto: 'AWS Direct Connect',
        retro: '¡Exacto! Direct Connect es una línea física privada entre tu centro de datos y AWS: estable y sin pasar por internet. Tarda semanas en instalarse y, si además piden cifrado, se monta una VPN encima.'
      },
      {
        texto: 'Un VPC peering con la red de las oficinas',
        retro: 'El peering conecta dos VPC entre sí, no un centro de datos con AWS.'
      },
      {
        texto: 'Un Internet Gateway en la VPC',
        retro: 'El Internet Gateway conecta la VPC con internet: justo lo contrario de lo que piden.'
      }
    ],
    correcta: 1
  },

  /* ---------------------------------------------- c4 · Antojo Ya */
  {
    id: 'c4p1',
    caso: 'c4',
    tema: 'Tecnología y servicios',
    sesion: 11,
    concepto: 'Amazon API Gateway',
    repaso: ['s11-examen/1', 's6-serverless/1'],
    texto: 'La app móvil necesita una API REST (api.antojoya.mx/pedidos) que llame a las funciones Lambda y limite cuántas peticiones hace cada usuario. ¿Qué servicio la publica?',
    opciones: [
      {
        texto: 'AWS Direct Connect',
        retro: 'Direct Connect es una línea privada entre un centro de datos y AWS; los celulares de los clientes no llegan por ahí.'
      },
      {
        texto: 'Amazon Route 53',
        retro: 'Route 53 traduce api.antojoya.mx a una dirección, pero no recibe ni controla las peticiones a la API.'
      },
      {
        texto: 'AWS Step Functions',
        retro: 'Step Functions coordina los pasos de un proceso (cobrar, avisar, asignar repartidor); no publica una API para la app.'
      },
      {
        texto: 'Amazon API Gateway',
        retro: '¡Correcto! API Gateway publica y protege APIs REST, HTTP o WebSocket: recibe las peticiones, se las pasa a Lambda y limita cuántas hace cada cliente (throttling).'
      }
    ],
    correcta: 3
  },
  {
    id: 'c4p2',
    caso: 'c4',
    tema: 'Tecnología y servicios',
    sesion: 5,
    concepto: 'DynamoDB en modo bajo demanda',
    repaso: 's5-nosql/2',
    texto: 'Para la tabla de carritos y pedidos, con un tráfico que nadie puede pronosticar, ¿qué opción responde en milisegundos sin que tengan que calcular capacidad?',
    opciones: [
      {
        texto: 'Amazon DynamoDB en modo bajo demanda (on-demand)',
        retro: '¡Exacto! DynamoDB es llave-valor, sin servidores, y responde en milisegundos; en modo bajo demanda se ajusta solo al tráfico y pagas por cada lectura y escritura. Tráfico impredecible → on-demand.'
      },
      {
        texto: 'DynamoDB aprovisionado con capacidad fija para el pico',
        retro: 'Funcionaría en el pico, pero pagarías esa capacidad las 24 horas, aunque de madrugada no haya pedidos. Con tráfico impredecible conviene el otro modo.'
      },
      {
        texto: 'Amazon RDS for MySQL en una instancia grande',
        retro: 'RDS es relacional y tiene un tamaño de instancia fijo que tú escoges y escalas. Piden llave-valor que se ajuste solo.'
      },
      {
        texto: 'Amazon Redshift',
        retro: 'Redshift es un almacén de datos para análisis (reportes sobre millones de filas), no la base de una app que guarda carritos en milisegundos.'
      }
    ],
    correcta: 0
  },
  {
    id: 'c4p3',
    caso: 'c4',
    tema: 'Seguridad y cumplimiento',
    sesion: 10,
    concepto: 'Amazon Cognito para los usuarios de tu app',
    repaso: ['s10-examen/3', 's2-identidades/1'],
    texto: 'Los clientes deben registrarse e iniciar sesión en la app con su correo o con su cuenta de Google, sin que Antojo Ya programe todo eso desde cero. ¿Qué servicio usan?',
    opciones: [
      {
        texto: 'Usuarios de IAM, uno por cliente',
        retro: 'IAM es para las personas y los servicios que administran la cuenta de AWS, no para los 200,000 clientes de una app.'
      },
      {
        texto: 'AWS IAM Identity Center',
        retro: 'Identity Center da un solo inicio de sesión a los empleados para entrar a varias cuentas de AWS y a sus aplicaciones de trabajo; no es para los clientes de tu app.'
      },
      {
        texto: 'Amazon Cognito',
        retro: '¡Correcto! Cognito maneja el registro y el inicio de sesión de los usuarios de TUS aplicaciones, con correo y contraseña o con Google, Facebook o Apple. Empleados → IAM o Identity Center; clientes de tu app → Cognito.'
      },
      {
        texto: 'AWS Secrets Manager',
        retro: 'Secrets Manager guarda los secretos de tus sistemas (contraseñas de bases, llaves de API), no las cuentas de los clientes.'
      }
    ],
    correcta: 2
  },
  {
    id: 'c4p4',
    caso: 'c4',
    tema: 'Conceptos de la nube',
    sesion: 6,
    concepto: 'Servicios administrados: menos trabajo pesado',
    repaso: 's6-serverless/1',
    texto: 'Con Lambda y DynamoDB, los 5 desarrolladores ya no instalan parches, ni compran servidores, ni calculan cuántos necesitan. ¿Qué beneficio de la nube describe mejor eso?',
    opciones: [
      {
        texto: 'Tener control total del hardware donde corre su código',
        retro: 'Al contrario: sin servidores tienes menos control del hardware, porque AWS se encarga de él. A cambio, te olvidas de mantenerlo.'
      },
      {
        texto: 'Concentrarse en la app en lugar de mantener infraestructura',
        retro: '¡Correcto! Con servicios administrados y sin servidores, AWS hace el trabajo pesado (parches, capacidad, hardware) y el equipo dedica su tiempo a lo que distingue al negocio: la app. “Sin servidores” no significa que no existan: significa que no son tu problema.'
      },
      {
        texto: 'Pagar una tarifa fija y conocida cada mes, pase lo que pase',
        retro: 'Con Lambda y DynamoDB bajo demanda pagas por uso: la factura sube y baja con los pedidos. No es una tarifa fija.'
      },
      {
        texto: 'Garantizar que nunca habrá fallas',
        retro: 'Ningún servicio garantiza cero fallas. AWS publica acuerdos de nivel de servicio (SLA), pero diseñar pensando en las fallas sigue siendo tu trabajo.'
      }
    ],
    correcta: 1
  },
  {
    id: 'c4p5',
    caso: 'c4',
    tema: 'Facturación, precios y soporte',
    sesion: 6,
    concepto: 'Cómo cobra AWS Lambda: duración según la memoria',
    repaso: 's6-serverless/1',
    texto: 'El mes pasado la factura de Lambda subió aunque Antojo Ya recibió los mismos pedidos. Un desarrollador le había subido la memoria a las funciones de 128 MB a 1 GB. ¿Por qué subió el costo?',
    opciones: [
      {
        texto: 'Porque Lambda cobra una tarifa fija por cada función que existe',
        retro: 'Lambda no cobra por existir: cobra por petición y por duración. Una función que no se ejecuta no cuesta.'
      },
      {
        texto: 'Porque ahora AWS le cobra los servidores que usa por debajo',
        retro: 'Los servidores de Lambda los administra AWS: no los ves ni los pagas directamente.'
      },
      {
        texto: 'Porque la capa gratuita de Lambda se acaba al cambiar la memoria',
        retro: 'La capa gratuita (1 millón de peticiones y 400 000 GB-segundo al mes) no se pierde por cambiar la memoria; solo se gasta más rápido.'
      },
      {
        texto: 'Porque el precio por milisegundo depende de la memoria asignada',
        retro: '¡Exacto! Lambda cobra por petición y por duración, y cada milisegundo cuesta más cuanta más memoria le asignas. Con ocho veces más memoria, cada ejecución puede costar más aunque los pedidos sean los mismos.'
      }
    ],
    correcta: 3
  },

  /* ---------------------------------------------- c5 · TeleBajío Noticias */
  {
    id: 'c5p1',
    caso: 'c5',
    tema: 'Conceptos de la nube',
    sesion: 1,
    concepto: 'Volverse global en minutos',
    repaso: 's1-global/1',
    texto: 'TeleBajío quiere servidores cerca de los paisanos en Estados Unidos en unas semanas, sin construir ni rentar un centro de datos allá. ¿Qué ventaja de la nube aprovecha?',
    opciones: [
      {
        texto: 'Volverse global en minutos',
        retro: '¡Correcto! Con las regiones de AWS repartidas por el mundo, pones tu aplicación cerca de tus usuarios (por ejemplo, en Ohio o en Oregón) con unos clics. Antes eso exigía construir o rentar un centro de datos en otro país.'
      },
      {
        texto: 'Cambiar gasto fijo por gasto variable',
        retro: 'Es una ventaja real, pero habla de cómo pagas, no de llegar rápido a otro país.'
      },
      {
        texto: 'Durabilidad de los datos',
        retro: 'La durabilidad es que los datos no se pierdan; no tiene que ver con acercar los servidores a otro país.'
      },
      {
        texto: 'Elasticidad',
        retro: 'La elasticidad ajusta la cantidad de servidores a la demanda; la historia habla de llegar a otro país.'
      }
    ],
    correcta: 0
  },
  {
    id: 'c5p2',
    caso: 'c5',
    tema: 'Tecnología y servicios',
    sesion: 8,
    concepto: 'Amazon Transcribe y Amazon Translate',
    repaso: 's8-extras/1',
    texto: 'Para subtitular cada noticiero hay que pasar la voz a texto y luego traducir ese texto al inglés. ¿Qué par de servicios lo hace?',
    opciones: [
      {
        texto: 'Amazon Polly y Amazon Comprehend',
        retro: 'Polly hace lo contrario (convierte texto en voz) y Comprehend analiza textos (sentimiento, temas, entidades); ninguno traduce.'
      },
      {
        texto: 'Amazon Transcribe y Amazon Translate',
        retro: '¡Correcto! Transcribe convierte la voz en texto (con marcas de tiempo, perfecto para subtítulos) y Translate traduce ese texto a otro idioma. Voz → texto: Transcribe; idioma → idioma: Translate.'
      },
      {
        texto: 'Amazon Rekognition y Amazon Textract',
        retro: 'Rekognition analiza imágenes y video (rostros, objetos) y Textract extrae texto de documentos escaneados; ninguno entiende la voz.'
      },
      {
        texto: 'Amazon Lex y Amazon Kendra',
        retro: 'Lex sirve para construir chatbots de voz o texto y Kendra para buscar en los documentos de una empresa; no subtitulan ni traducen.'
      }
    ],
    correcta: 1
  },
  {
    id: 'c5p3',
    caso: 'c5',
    tema: 'Tecnología y servicios',
    sesion: 13,
    concepto: 'Amazon Bedrock (IA generativa)',
    repaso: ['s13-examen/6', 's8-extras/1'],
    texto: 'Quieren que una IA generativa escriba el resumen de cada nota con modelos ya entrenados (modelos fundacionales), sin entrenar uno propio ni administrar servidores. ¿Qué servicio usan?',
    opciones: [
      {
        texto: 'Amazon Translate',
        retro: 'Translate traduce textos de un idioma a otro, pero no redacta un resumen nuevo de la nota.'
      },
      {
        texto: 'Amazon Lex',
        retro: 'Lex sirve para construir chatbots de voz y texto (la tecnología de Alexa); no resume notas.'
      },
      {
        texto: 'Amazon Comprehend',
        retro: 'Comprehend analiza textos (sentimiento, frases clave, temas), pero no redacta textos nuevos como un resumen.'
      },
      {
        texto: 'Amazon Bedrock',
        retro: '¡Exacto! Bedrock da acceso por API a modelos fundacionales de varias empresas (Amazon, Anthropic, Meta y otras) para generar textos, resúmenes o imágenes, sin administrar servidores. IA generativa con modelos listos → Bedrock.'
      }
    ],
    correcta: 3
  },
  {
    id: 'c5p4',
    caso: 'c5',
    tema: 'Tecnología y servicios',
    sesion: 4,
    concepto: 'Ciclo de vida hacia Glacier Deep Archive',
    repaso: ['s4-s3/3', 's4-s3/2'],
    texto: 'Los videos casi no se buscan después de 30 días, se conservan 10 años y, si alguien pide uno, puede esperar 12 horas. ¿Qué configuran en el bucket para pagar lo menos posible?',
    opciones: [
      {
        texto: 'Dejarlos los 10 años en S3 Standard, por si alguien los pide',
        retro: 'Funciona, pero pagarían la clase más cara durante años por videos que casi nadie ve.'
      },
      {
        texto: 'Pasarlos a mano a S3 One Zone-IA cada mes y nunca borrarlos',
        retro: 'One Zone-IA guarda en una sola zona (si esa zona se pierde, se pierden los videos) y no es la más barata para archivar. Además, hacerlo a mano y guardarlos para siempre cuesta de más.'
      },
      {
        texto: 'Ciclo de vida: a Glacier Deep Archive a los 30 días y borrar a los 10 años',
        retro: '¡Correcto! Una regla de ciclo de vida los mueve sola a Glacier Deep Archive (la clase más barata, con recuperación de hasta 12 horas) y los borra al cumplir 10 años. Archivo por ley + puede esperar horas → Deep Archive.'
      },
      {
        texto: 'Copiarlos a volúmenes EBS de bajo costo (sc1) a los 30 días',
        retro: 'EBS es el disco de una instancia EC2: pagas el tamaño que reservas y no está hecho para archivar años de videos. S3 con su clase de archivo sale mucho más barato.'
      }
    ],
    correcta: 2
  },
  {
    id: 'c5p5',
    caso: 'c5',
    tema: 'Seguridad y cumplimiento',
    sesion: 4,
    concepto: 'Bucket privado detrás de CloudFront',
    repaso: ['s4-seguridad/1', 's3-borde/2'],
    texto: 'Hoy cualquiera con la liga directa del bucket descarga los videos sin pasar por el sitio. Quieren que solo se vean a través de CloudFront. ¿Qué hacen?',
    opciones: [
      {
        texto: 'Bloquear el acceso público y permitir leer solo a CloudFront',
        retro: '¡Correcto! Con Block Public Access nadie entra directo al bucket, y la política del bucket deja leer solo a la distribución de CloudFront (con Origin Access Control, OAC). Así los videos salen únicamente por el sitio.'
      },
      {
        texto: 'Ponerle al bucket un nombre larguísimo y difícil de adivinar',
        retro: 'Esconder no es proteger: los nombres de bucket se filtran y el bucket seguiría siendo público.'
      },
      {
        texto: 'Cifrar los videos con SSE-S3',
        retro: 'El cifrado en reposo protege los discos de AWS, pero S3 descifra al entregar: si el bucket es público, cualquiera sigue descargando.'
      },
      {
        texto: 'Activar el versionado del bucket',
        retro: 'El versionado protege de borrados y sobrescrituras; no decide quién puede descargar.'
      }
    ],
    correcta: 0
  },

  /* ---------------------------------------------- c6 · Frutas Tierra Fértil */
  {
    id: 'c6p1',
    caso: 'c6',
    tema: 'Tecnología y servicios',
    sesion: 8,
    concepto: 'Amazon Kinesis Data Streams',
    repaso: 's8-extras/1',
    texto: 'Los 2,000 sensores mandan datos cada segundo y Tierra Fértil quiere recibirlos y procesarlos en tiempo real. ¿Qué servicio está hecho para eso?',
    opciones: [
      {
        texto: 'AWS Snowball Edge',
        retro: 'Snowball Edge sirve para llevar muchos datos a AWS en un aparato físico, por paquetería: lo contrario del tiempo real.'
      },
      {
        texto: 'Amazon Athena',
        retro: 'Athena consulta con SQL archivos que ya están guardados en S3; no recibe datos que llegan cada segundo.'
      },
      {
        texto: 'Amazon Kinesis Data Streams',
        retro: '¡Correcto! Kinesis recibe flujos continuos de datos (sensores, clics, registros) y permite procesarlos en tiempo real, en segundos. Datos en streaming → Kinesis.'
      },
      {
        texto: 'AWS Glue',
        retro: 'Glue prepara y transforma datos (ETL) y lleva el catálogo de tus datos; para recibir el flujo continuo de 2,000 sensores se usa otro servicio.'
      }
    ],
    correcta: 2
  },
  {
    id: 'c6p2',
    caso: 'c6',
    tema: 'Tecnología y servicios',
    sesion: 5,
    concepto: 'Amazon Athena: SQL sobre S3',
    repaso: 's5-otras/1',
    texto: 'Quieren hacer consultas SQL sobre los 8 años de archivos CSV que ya están en S3, sin servidores y sin cargarlos a una base. ¿Qué usan?',
    opciones: [
      {
        texto: 'Amazon RDS for PostgreSQL',
        retro: 'Tendrían que crear la base y cargar ahí todos los archivos; piden consultarlos donde están.'
      },
      {
        texto: 'Amazon DynamoDB',
        retro: 'DynamoDB es una base llave-valor para aplicaciones; no consulta con SQL archivos CSV guardados en S3.'
      },
      {
        texto: 'Amazon ElastiCache',
        retro: 'ElastiCache es una caché en memoria para acelerar lecturas; no consulta archivos en S3.'
      },
      {
        texto: 'Amazon Athena',
        retro: '¡Exacto! Athena consulta con SQL los archivos tal como están en S3 (CSV, JSON, Parquet), sin servidores, y cobra por los datos que revisa cada consulta. SQL sobre S3 sin servidores → Athena.'
      }
    ],
    correcta: 3
  },
  {
    id: 'c6p3',
    caso: 'c6',
    tema: 'Seguridad y cumplimiento',
    sesion: 3,
    concepto: 'Orden de las reglas de una Network ACL',
    repaso: 's2-servicios/3',
    texto: 'Ya agregaron en la Network ACL de la subred una regla número 200 que niega la IP extraña, pero el escaneo sigue. Antes está la regla 100, que permite todo el tráfico de entrada. ¿Qué cambian?',
    opciones: [
      {
        texto: 'Mover esa regla de denegación al grupo de seguridad de cada servidor',
        retro: 'Los grupos de seguridad solo tienen reglas que permiten: ahí no se puede negar una IP.'
      },
      {
        texto: 'Darle a la regla de denegación un número menor que 100',
        retro: '¡Correcto! La NACL revisa sus reglas en orden, del número más bajo al más alto, y aplica la primera que coincide. Si la 100 deja pasar todo, la 200 nunca se evalúa.'
      },
      {
        texto: 'Una alarma de CloudWatch sobre esa IP',
        retro: 'Una alarma avisa cuando una métrica pasa un umbral; no bloquea tráfico.'
      },
      {
        texto: 'Quitar la ruta a internet de la tabla de rutas de la subred',
        retro: 'La tabla de rutas decide hacia dónde sale el tráfico, no quién puede entrar. Y cortaría también a todos los clientes legítimos.'
      }
    ],
    correcta: 1
  },
  {
    id: 'c6p4',
    caso: 'c6',
    tema: 'Conceptos de la nube',
    sesion: 8,
    concepto: 'Las 7R de migración: repurchase',
    repaso: 's8-extras/3',
    texto: 'Su sistema de nómina, que corre en un servidor viejo, será reemplazado por un servicio de nómina en línea (SaaS) que se paga por empleado. ¿Qué estrategia de migración es?',
    opciones: [
      {
        texto: 'Repurchase (recomprar)',
        retro: '¡Correcto! Repurchase es dejar tu aplicación y pasarte a un producto como servicio (SaaS). No mueves el servidor: cambias de producto.'
      },
      {
        texto: 'Rehost (lift and shift)',
        retro: 'Rehost movería el mismo servidor de nómina a EC2 tal como está. Aquí lo van a reemplazar por otro producto.'
      },
      {
        texto: 'Replatform',
        retro: 'Replatform mueve la aplicación con pequeños ajustes (por ejemplo, pasar su base a RDS). La nómina no se mueve: se sustituye.'
      },
      {
        texto: 'Retain (conservar)',
        retro: 'Retain es dejar el sistema donde está, por ahora. Ellos sí lo van a cambiar.'
      }
    ],
    correcta: 0
  },
  {
    id: 'c6p5',
    caso: 'c6',
    tema: 'Conceptos de la nube',
    sesion: 7,
    concepto: 'Pilar de sostenibilidad',
    repaso: 's7-buenas-practicas/1',
    texto: 'Sus clientes europeos le piden medir y reducir el impacto ambiental de su tecnología. ¿Qué pilar del AWS Well-Architected Framework trata ese tema?',
    opciones: [
      {
        texto: 'Eficiencia del rendimiento',
        retro: 'Eficiencia del rendimiento busca usar el recurso adecuado para que el sistema responda bien. Ayuda de paso, pero hay un pilar dedicado al impacto ambiental.'
      },
      {
        texto: 'Optimización de costos',
        retro: 'Gastar menos suele reducir recursos, pero este pilar mira el dinero, no el impacto ambiental.'
      },
      {
        texto: 'Sostenibilidad',
        retro: '¡Exacto! Sostenibilidad es el sexto pilar: usar menos recursos y energía para lo mismo (apagar lo ocioso, elegir el tamaño justo). Dato extra: en Billing and Cost Management, la Customer Carbon Footprint Tool estima las emisiones de tu uso de AWS.'
      },
      {
        texto: 'Fiabilidad',
        retro: 'Fiabilidad trata de recuperarse de las fallas; no mide el impacto ambiental.'
      }
    ],
    correcta: 2
  },

  /* ---------------------------------------------- c7 · Gimnasios Fortaleza */
  {
    id: 'c7p1',
    caso: 'c7',
    tema: 'Facturación, precios y soporte',
    sesion: 7,
    concepto: 'Facturación consolidada: descuentos compartidos',
    repaso: 's7-herramientas/2',
    texto: 'El estado de Jalisco compró un Savings Plan que le sobra, mientras otros estados pagan On-Demand completo. ¿Qué les da una sola factura y hace que ese descuento sobrante se aplique al uso de las demás cuentas?',
    opciones: [
      {
        texto: 'AWS Cost Explorer',
        retro: 'Cost Explorer analiza y grafica el gasto; no junta las facturas de varias cuentas.'
      },
      {
        texto: 'La facturación consolidada de AWS Organizations',
        retro: '¡Correcto! Con la facturación consolidada de Organizations, la cuenta de administración paga una sola factura, el uso de todas se suma para los precios por volumen y el descuento de Savings Plans o Reserved Instances que una cuenta no usa se aplica al de las demás (se puede apagar). Organizations no cuesta extra.'
      },
      {
        texto: 'AWS Pricing Calculator',
        retro: 'La calculadora estima costos antes de crear recursos; no cambia cómo se paga lo que ya usan.'
      },
      {
        texto: 'Un presupuesto en AWS Budgets para cada uno de los estados',
        retro: 'Budgets avisa cuando el gasto pasa de un límite, pero cada cuenta seguiría con su propia factura y su descuento sobrante.'
      }
    ],
    correcta: 1
  },
  {
    id: 'c7p2',
    caso: 'c7',
    tema: 'Seguridad y cumplimiento',
    sesion: 7,
    concepto: 'AWS Control Tower (landing zone)',
    repaso: 's7-herramientas/2',
    texto: 'Quieren montar en pocos clics un entorno de varias cuentas con buenas prácticas ya aplicadas: registros centralizados y controles de seguridad (guardrails). ¿Qué servicio lo hace?',
    opciones: [
      {
        texto: 'AWS Control Tower',
        retro: '¡Correcto! Control Tower arma una landing zone: un entorno multicuenta sobre Organizations, con CloudTrail centralizado y controles preventivos y de detección ya aplicados.'
      },
      {
        texto: 'AWS Trusted Advisor',
        retro: 'Trusted Advisor revisa una cuenta y recomienda mejoras; no crea un entorno de varias cuentas.'
      },
      {
        texto: 'AWS Artifact',
        retro: 'Artifact entrega los reportes de cumplimiento de AWS; no configura cuentas.'
      },
      {
        texto: 'AWS Well-Architected Tool',
        retro: 'La Well-Architected Tool te hace preguntas para revisar una carga de trabajo; no crea cuentas ni aplica controles.'
      }
    ],
    correcta: 0
  },
  {
    id: 'c7p3',
    caso: 'c7',
    tema: 'Facturación, precios y soporte',
    sesion: 7,
    concepto: 'AWS Budgets con alerta pronosticada',
    repaso: 's7-herramientas/1',
    texto: 'El director financiero quiere un correo antes de que el gasto del mes pase de 3,000 dólares, no cuando ya pasó. ¿Qué configuran?',
    opciones: [
      {
        texto: 'Un reporte de Cost Explorer que alguien revise cada fin de mes',
        retro: 'Cost Explorer muestra lo que ya gastaste y un pronóstico, pero revisarlo a fin de mes es enterarse tarde y no manda alertas.'
      },
      {
        texto: 'Una alarma de AWS CloudTrail',
        retro: 'CloudTrail registra quién hizo qué en la cuenta; no vigila el gasto.'
      },
      {
        texto: 'Un presupuesto de AWS Budgets con alerta por gasto pronosticado',
        retro: '¡Exacto! Budgets avisa cuando el gasto real o el pronosticado pasa del límite. Con la alerta sobre el pronóstico, el correo llega antes de que el mes cierre por encima de 3,000 dólares.'
      },
      {
        texto: 'Una revisión mensual de los chequeos de costo de Trusted Advisor',
        retro: 'Trusted Advisor recomienda ahorros, pero no avisa cuando el gasto se acerca a un límite.'
      }
    ],
    correcta: 2
  },
  {
    id: 'c7p4',
    caso: 'c7',
    tema: 'Facturación, precios y soporte',
    sesion: 7,
    concepto: 'Plan de soporte con TAM',
    repaso: 's7-soporte/1',
    texto: 'Si la app de reservas se cae, necesitan respuesta de AWS en menos de 15 minutos y un Technical Account Manager (TAM) que conozca su arquitectura. ¿Cuál es el plan de soporte más barato que lo cumple?',
    opciones: [
      {
        texto: 'Basic Support',
        retro: 'Basic es gratis: atención de facturación y cuotas, documentación y Trusted Advisor limitado. No da soporte técnico con tiempos de respuesta.'
      },
      {
        texto: 'Business Support+',
        retro: 'Business Support+ da expertos 24/7 con respuesta en menos de 30 minutos si tu sistema cae, pero no llega a 15 minutos ni incluye un TAM.'
      },
      {
        texto: 'Unified Operations',
        retro: 'Unified Operations sí lo cumple (responde en 5 minutos), pero cuesta desde 50,000 dólares al mes: no es el más barato que cumple.'
      },
      {
        texto: 'Enterprise Support',
        retro: '¡Correcto! Enterprise Support responde en menos de 15 minutos cuando un sistema crítico cae e incluye un Technical Account Manager. Ojo: muchos bancos de preguntas viejos usan los nombres Developer, Business y Enterprise On-Ramp.'
      }
    ],
    correcta: 3
  },
  {
    id: 'c7p5',
    caso: 'c7',
    tema: 'Conceptos de la nube',
    sesion: 7,
    concepto: 'Pilar de optimización de costos',
    repaso: 's7-buenas-practicas/1',
    texto: 'Los servidores de pruebas pasan la noche encendidos y casi no usan CPU. Apagarlos fuera de horario y elegir un tipo de instancia más chico, ¿a qué pilar de Well-Architected corresponde?',
    opciones: [
      {
        texto: 'Fiabilidad',
        retro: 'Fiabilidad es recuperarse de las fallas; apagar servidores ociosos no la mejora.'
      },
      {
        texto: 'Optimización de costos',
        retro: '¡Correcto! Pagar solo por lo que sirve: apagar lo ocioso y elegir el tamaño justo (right-sizing) es la base del pilar de optimización de costos. Dato extra: AWS Compute Optimizer recomienda el tamaño adecuado para tus instancias.'
      },
      {
        texto: 'Excelencia operativa',
        retro: 'Excelencia operativa trata de operar y mejorar los sistemas (automatizar, cambios pequeños, aprender de las fallas). Aquí el objetivo es dejar de pagar lo que no se usa.'
      },
      {
        texto: 'Seguridad',
        retro: 'Seguridad protege datos y accesos; no tiene que ver con servidores ociosos.'
      }
    ],
    correcta: 1
  },

  /* ---------------------------------------------- c8 · Pizarrón Digital */
  {
    id: 'c8p1',
    caso: 'c8',
    tema: 'Tecnología y servicios',
    sesion: 8,
    concepto: 'AWS CloudFormation (infraestructura como código)',
    repaso: 's8-extras/2',
    texto: 'Quieren crear la red, los servidores y la base desde un archivo de plantilla, para que pruebas y producción queden idénticos y se puedan recrear en minutos. ¿Qué servicio usan?',
    opciones: [
      {
        texto: 'AWS Systems Manager',
        retro: 'Systems Manager administra y parcha instancias que ya existen (y guarda parámetros); no crea toda la infraestructura desde una plantilla.'
      },
      {
        texto: 'Amazon Lightsail',
        retro: 'Lightsail ofrece servidores sencillos con precio fijo para proyectos pequeños; no describe tu infraestructura en una plantilla.'
      },
      {
        texto: 'AWS Trusted Advisor',
        retro: 'Trusted Advisor revisa la cuenta y recomienda mejoras; no crea recursos.'
      },
      {
        texto: 'AWS CloudFormation',
        retro: '¡Correcto! CloudFormation es infraestructura como código: describes los recursos en una plantilla (YAML o JSON) y AWS crea la pila completa, igual cada vez. Ambientes idénticos y repetibles → CloudFormation.'
      }
    ],
    correcta: 3
  },
  {
    id: 'c8p2',
    caso: 'c8',
    tema: 'Tecnología y servicios',
    sesion: 5,
    concepto: 'RDS Multi-AZ',
    repaso: 's5-disponibilidad/1',
    texto: 'Si falla el centro de datos donde vive la base, esta debe seguir funcionando sola, sin que nadie haga nada. ¿Qué activan en RDS?',
    opciones: [
      {
        texto: 'Una réplica de lectura en la misma zona',
        retro: 'Las réplicas de lectura reparten las consultas; además, en la misma zona caerían juntas. Para que la base siga sola si falla una zona hay otra opción.'
      },
      {
        texto: 'Snapshots manuales cada noche',
        retro: 'Un snapshot sirve para restaurar, pero alguien tiene que hacerlo y se pierde lo de las últimas horas. No es “seguir funcionando sola”.'
      },
      {
        texto: 'Un despliegue Multi-AZ',
        retro: '¡Exacto! Multi-AZ mantiene una copia en espera en otra zona, sincronizada al instante; si la principal falla, RDS cambia sola a la copia (failover) y el nombre de conexión no cambia.'
      },
      {
        texto: 'Una instancia de base más grande',
        retro: 'Más grande es más rápida, pero sigue siendo una sola base en una sola zona.'
      }
    ],
    correcta: 2
  },
  {
    id: 'c8p3',
    caso: 'c8',
    tema: 'Seguridad y cumplimiento',
    sesion: 3,
    concepto: 'Un grupo de seguridad como origen',
    repaso: 's2-servicios/3',
    texto: 'La base solo debe aceptar conexiones de los servidores web, aunque estos cambien de IP. ¿Cómo se configura el grupo de seguridad de la base?',
    opciones: [
      {
        texto: 'Permitir el 3306 con origen en el grupo de seguridad web',
        retro: '¡Correcto! Un grupo de seguridad puede usar otro grupo como origen: entra cualquier instancia que tenga el grupo de los web, cambie o no su IP. 3306 es el puerto de MySQL.'
      },
      {
        texto: 'Permitir el puerto 3306 desde 0.0.0.0/0',
        retro: 'Abriría la base a cualquier dirección. Aunque esté en una subred privada, es lo contrario del mínimo privilegio.'
      },
      {
        texto: 'Permitir el puerto 22 desde la IP de cada servidor web',
        retro: 'El 22 es SSH, no MySQL; y las IP de los servidores cambian, así que habría que corregir la regla cada vez.'
      },
      {
        texto: 'Agregar una regla que niegue todo lo que no venga de los web',
        retro: 'Los grupos de seguridad no tienen reglas para negar: todo lo que no permites ya está negado. Lo que falta es la regla que permite.'
      }
    ],
    correcta: 0
  },
  {
    id: 'c8p4',
    caso: 'c8',
    tema: 'Seguridad y cumplimiento',
    sesion: 2,
    concepto: 'Secrets Manager con rotación automática',
    repaso: 's2-servicios/1',
    texto: 'La contraseña de la base está escrita en el código y nunca se cambia. ¿Qué servicio la guarda cifrada y la cambia sola cada cierto tiempo?',
    opciones: [
      {
        texto: 'AWS Certificate Manager',
        retro: 'Certificate Manager maneja certificados SSL/TLS para HTTPS, no contraseñas de bases.'
      },
      {
        texto: 'AWS Secrets Manager',
        retro: '¡Correcto! Secrets Manager guarda la contraseña cifrada con KMS, la app la pide cuando la necesita y puede rotarla automáticamente, también la de RDS. “Rotación automática de credenciales” → Secrets Manager.'
      },
      {
        texto: 'Amazon Macie',
        retro: 'Macie encuentra datos sensibles en S3, pero no guarda ni rota contraseñas.'
      },
      {
        texto: 'AWS IAM Identity Center',
        retro: 'Identity Center da un solo inicio de sesión a los empleados; no administra la contraseña que la app usa para su base.'
      }
    ],
    correcta: 1
  },
  {
    id: 'c8p5',
    caso: 'c8',
    tema: 'Seguridad y cumplimiento',
    sesion: 2,
    concepto: 'Responsabilidad compartida en RDS',
    repaso: 's2-responsabilidad/1',
    texto: 'El socio fundador cree que, como RDS es administrado, AWS se encarga de toda la seguridad de la base. Según el modelo de responsabilidad compartida, ¿qué sigue siendo trabajo de Pizarrón Digital?',
    opciones: [
      {
        texto: 'Instalar los parches del sistema operativo del servidor de RDS',
        retro: 'En RDS, AWS parcha el sistema operativo y el motor de la base (en la ventana de mantenimiento que eliges). Eso es seguridad “de la nube”.'
      },
      {
        texto: 'Reemplazar los discos dañados del centro de datos',
        retro: 'El hardware y los centros de datos son siempre responsabilidad de AWS.'
      },
      {
        texto: 'Mantener la red física entre las zonas de disponibilidad',
        retro: 'La red física que une las zonas es responsabilidad de AWS.'
      },
      {
        texto: 'Decidir quién se conecta a la base y si se cifran los datos',
        retro: '¡Exacto! Aun en un servicio administrado, tú decides los accesos (usuarios, grupos de seguridad) y si cifras los datos. AWS cuida la seguridad DE la nube; tú, la seguridad EN la nube.'
      }
    ],
    correcta: 3
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
