// El examen de práctica de la sesión 9 (Práctica 1 · la tienda en línea):
// 20 preguntas nuevas al estilo del examen AWS Certified Cloud Practitioner
// (CLF-C02) sobre la arquitectura de dos capas que el alumno montó en el
// simulador y sobre lo que agrega la lección: Well-Architected aplicado,
// Elastic Beanstalk, Lightsail, CloudFormation, Amplify y Fargate.
//
// - Cada pregunta dice de qué sesión de la Ruta sale (`sesion`): la 9 son los
//   temas nuevos de hoy. Reparto: S2 2 · S3 1 · S4 1 · S5 2 · S6 5 · S9 9.
// - Dos son de respuesta múltiple («Elige DOS», 5 opciones), todo o nada. Las
//   otras 18 llevan la clave balanceada (A 5, B 4, C 5, D 4, sin rachas de
//   tres) y cada distractor es una confusión real.
// - Ninguna repite una pregunta de otro banco de la Ruta.
// - Datos revisados en la documentación oficial de AWS el 2 de noviembre de
//   2026 (ver el comentario de public/sesion9.js). App Runner salió de la guía
//   CLF-C02 v1.3 (29 de octubre de 2026): la pregunta de contenedores sin
//   servidores es de Fargate.
//
// prepararBanco (src/banco.js) le pone a este banco `practicaPublica` y
// `calificar`: aquí solo van los datos. Corre `npm run verificar` si cambias algo.

export const TEMAS = ['Red y alta disponibilidad', 'Seguridad en capas', 'Monitoreo y avisos', 'Well-Architected aplicado', 'Formas de desplegar'];

// Un reloj de 15 minutos que avisa sin cortar, y el puntaje como en el examen real.
export const MINUTOS = 15;
export const ESCALA = { maximo: 1000, aprueba: 700 };

// Qué lecciones de la Ruta repasar cuando un tema sale bajo.
export const REPASO = {
  'Red y alta disponibilidad': ['s9-caso', 's9-practica', 's3-vpc', 's3-ex-subredes', 's5-disponibilidad', 's6-balanceadores', 's6-elasticidad'],
  'Seguridad en capas': ['s9-caso', 's9-practica', 's2-responsabilidad', 's2-ex-sg-nacl', 's4-seguridad', 's5-relacionales'],
  'Monitoreo y avisos': ['s9-practica', 's6-monitorear', 's6-serverless'],
  'Well-Architected aplicado': ['s9-examen', 's7-buenas-practicas', 's7-ex-pilares'],
  'Formas de desplegar': ['s9-examen', 's9-ex-servicio', 's8-extras']
};

// Lo que se muestra antes de empezar y en el desplegable de cada pregunta.
export const CASO = `
  <p>Este examen se parece al de la certificación <strong>AWS Certified Cloud Practitioner (CLF-C02)</strong>. Pregunta por la tienda de <strong>Barro y Telar</strong> que montaste hoy (dos zonas, balanceador, Auto Scaling, RDS Multi-AZ, S3 y alarmas) y por las formas de desplegar que vimos en la lección.</p>
  <ul>
    <li>En el examen real son <strong>65 preguntas en 90 minutos</strong> y se aprueba con <strong>700 de 1000</strong>. Aquí son 20 en unos 15 minutos.</li>
    <li>Dos preguntas dicen <strong>«(Elige DOS.)»</strong>: marca exactamente dos. Cuentan solo si las dos están bien, como en el examen.</li>
    <li>Busca la <strong>palabra clave</strong>: “si falla una zona”, “solo subir el código”, “plantilla”, “precio fijo”, “imagen de contenedor”, “quién lo hizo”…</li>
  </ul>`;

export const PREGUNTAS = [
  {
    id: 'p01',
    tema: 'Red y alta disponibilidad',
    sesion: 6,
    concepto: 'Balanceador en dos zonas',
    texto: 'La tienda tiene un servidor web en us-east-1a y otro en us-east-1b detrás de un Application Load Balancer. Una mañana falla toda la zona us-east-1a. ¿Qué pasa con los clientes?',
    opciones: [
      'El balanceador deja de enviar tráfico al servidor caído y siguen comprando con el de us-east-1b',
      'La tienda se cae hasta que AWS repare la zona, porque el balanceador vive solo en us-east-1a',
      'Cada cliente debe cambiar a mano a otra dirección que apunte a la zona sana',
      'AWS mueve los dos servidores a otra región para que la tienda siga en línea'
    ],
    correcta: 0,
    explicacion:
      'Un ALB vive en al menos dos zonas y solo manda tráfico a los destinos sanos (healthy): si una zona falla, atiende con la otra, y Auto Scaling lanza un reemplazo en la zona que sigue en pie. El DNS del balanceador no cambia, y AWS no mueve tus recursos de región por su cuenta.'
  },
  {
    id: 'p02',
    tema: 'Red y alta disponibilidad',
    sesion: 5,
    concepto: 'RDS Multi-AZ',
    texto: 'La base de pedidos es Amazon RDS con despliegue Multi-AZ DB instance. ¿Para qué sirve la instancia en espera (standby) que está en otra zona?',
    opciones: [
      'Para atender las consultas de lectura y que el catálogo cargue más rápido',
      'Para tomar el lugar de la principal si esta falla',
      'Para guardar los respaldos automáticos en otra región',
      'Para que los clientes se conecten a ella directo desde internet'
    ],
    correcta: 1,
    explicacion:
      'En una Multi-AZ DB instance, RDS copia los datos de forma síncrona a una standby en otra zona y, si la principal falla, cambia a ella sola (failover) con el mismo endpoint. Esa standby no atiende lecturas: para repartir lecturas están las réplicas de lectura.'
  },
  {
    id: 'p03',
    tema: 'Red y alta disponibilidad',
    sesion: 6,
    concepto: 'Límites de Auto Scaling',
    texto: 'El grupo de Auto Scaling de la tienda tiene mínimo 2, deseada 2 y máximo 4. En el Buen Fin creció a 4 servidores. Al terminar, la CPU baja al 10 %. ¿Qué hace el grupo con su política de seguimiento de objetivo?',
    opciones: [
      'Apaga todos los servidores hasta que vuelva a subir la carga',
      'Se queda con 4 servidores hasta que alguien cambie la capacidad a mano',
      'Quita servidores, sin bajar de 2',
      'Cambia los servidores a instancias Spot para gastar menos'
    ],
    correcta: 2,
    explicacion:
      'Con target tracking el grupo crece cuando la métrica pasa del objetivo y se encoge cuando baja, pero nunca sale de sus límites: no baja del mínimo (2) ni pasa del máximo (4). Auto Scaling no cambia la forma de pago de las instancias.'
  },
  {
    id: 'p04',
    tema: 'Red y alta disponibilidad',
    sesion: 3,
    concepto: 'Subred pública',
    texto: 'Al revisar la VPC de la tienda, ¿qué dos cosas hacen que una subred sea pública? (Elige DOS.)',
    opciones: [
      'Que su nombre incluya la palabra «public»',
      'Un Internet Gateway conectado a la VPC',
      'Una NAT gateway dentro de la subred',
      'Una ruta 0.0.0.0/0 hacia el Internet Gateway en la tabla de rutas de la subred',
      'Un grupo de seguridad que permita el puerto 80 desde cualquier lugar'
    ],
    correcta: [1, 3],
    elige: 2,
    explicacion:
      'Una subred es pública cuando su tabla de rutas manda 0.0.0.0/0 a un Internet Gateway conectado a la VPC. El nombre es solo una etiqueta; una NAT gateway sirve para que las subredes privadas salgan a internet, y un grupo de seguridad filtra el tráfico, pero no da un camino a internet.'
  },
  {
    id: 'p05',
    tema: 'Seguridad en capas',
    sesion: 2,
    concepto: 'Grupos de seguridad encadenados',
    texto: 'El grupo de seguridad de los servidores web de la tienda permite HTTP (80) solo con origen en el grupo de seguridad del balanceador. ¿Qué logra esa regla?',
    opciones: [
      'Que solo lo que pasa por el balanceador llegue a los servidores, aunque cambien sus IP',
      'Que los servidores web puedan salir a internet a descargar actualizaciones',
      'Que el tráfico entre el balanceador y los servidores viaje cifrado con HTTPS',
      'Que cualquier instancia de la misma VPC pueda conectarse a los servidores web'
    ],
    correcta: 0,
    explicacion:
      'Usar un grupo de seguridad como origen deja entrar a cualquier recurso que tenga ese grupo, sin importar su IP. Así nadie de internet llega directo a los servidores: solo el balanceador. La regla no cifra nada, no controla la salida y no admite a toda la VPC.'
  },
  {
    id: 'p06',
    tema: 'Seguridad en capas',
    sesion: 5,
    concepto: 'Public access en RDS',
    texto: 'Al crear la base de pedidos en Amazon RDS, ¿qué opción evita que la base tenga una dirección a la que se pueda llegar desde internet?',
    opciones: [
      'Deletion protection',
      'Multi-AZ DB instance',
      'Encryption con una llave de AWS KMS',
      'Public access: No'
    ],
    correcta: 3,
    explicacion:
      'Con Public access en No, RDS no le da a la base una IP pública: solo se llega a ella desde dentro de la VPC, y el grupo de seguridad decide quién. Deletion protection evita borrarla, Multi-AZ da una copia en espera y el cifrado protege los datos guardados, pero ninguno la esconde de internet.'
  },
  {
    id: 'p07',
    tema: 'Seguridad en capas',
    sesion: 4,
    concepto: 'Versionado de S3',
    texto: 'Una empleada borró por error la foto principal de un alebrije en el bucket de la tienda. ¿Qué configuración, activada desde antes, le permite recuperarla?',
    opciones: [
      'Block Public Access en el bucket',
      'S3 Versioning',
      'S3 Transfer Acceleration',
      'Cifrado del lado del servidor con SSE-S3'
    ],
    correcta: 1,
    explicacion:
      'Con el versionado, borrar un objeto solo agrega un marcador de borrado: la versión anterior sigue ahí y se puede recuperar. Block Public Access impide que se vea desde afuera, Transfer Acceleration acelera las subidas desde lejos y el cifrado protege los datos, pero ninguno guarda versiones.'
  },
  {
    id: 'p08',
    tema: 'Seguridad en capas',
    sesion: 2,
    concepto: 'Responsabilidad compartida',
    texto: 'En la arquitectura de la tienda, ¿qué le toca a la cooperativa y no a AWS?',
    opciones: [
      'Configurar los grupos de seguridad y parchar el sistema operativo de sus instancias EC2',
      'Aplicar los parches del motor MySQL en la base de Amazon RDS',
      'Reemplazar los discos dañados en los centros de datos de cada zona',
      'Mantener la red física que une las zonas de disponibilidad'
    ],
    correcta: 0,
    explicacion:
      'En EC2 (IaaS) el cliente administra el sistema operativo, sus parches y los grupos de seguridad. En RDS, AWS aplica los parches del motor y del sistema operativo de la base (tú eliges la ventana de mantenimiento). El hardware, los centros de datos y la red entre zonas son la seguridad «de» la nube: le tocan a AWS.'
  },
  {
    id: 'p09',
    tema: 'Monitoreo y avisos',
    sesion: 6,
    concepto: 'Suscripción de SNS',
    texto: 'La alarma tienda-cpu-alta ya pasó a In alarm y su acción publica en un tema de SNS con una suscripción de tipo Email, pero no llega ningún correo. ¿Cuál es la causa más probable?',
    opciones: [
      'Las alarmas de CloudWatch no pueden publicar en temas de SNS',
      'SNS solo manda mensajes de texto al celular, no correos',
      'La suscripción sigue en Pending confirmation: nadie la confirmó',
      'Falta activar AWS CloudTrail en la cuenta'
    ],
    correcta: 2,
    explicacion:
      'Una suscripción Email queda en Pending confirmation hasta que el dueño del correo pulsa «Confirm subscription»; mientras tanto, SNS no le entrega mensajes. CloudWatch sí publica en SNS, SNS sí manda correos y CloudTrail no participa en los avisos.'
  },
  {
    id: 'p10',
    tema: 'Monitoreo y avisos',
    sesion: 6,
    concepto: 'Alarma sobre el grupo',
    texto: '¿Por qué la alarma de CPU de la tienda vigila la métrica del grupo de Auto Scaling (AutoScalingGroupName) y no la de una sola instancia?',
    opciones: [
      'Porque CloudWatch solo permite alarmas sobre grupos, no sobre instancias sueltas',
      'Porque las instancias sueltas no publican la métrica CPUUtilization en CloudWatch',
      'Porque así la alarma también puede reiniciar la base de datos',
      'Porque el grupo reemplaza instancias y la alarma vigilaría una que ya no existe'
    ],
    correcta: 3,
    explicacion:
      'Auto Scaling termina y lanza instancias: una alarma atada al id de una instancia se queda vigilando una máquina que ya no existe. La métrica por AutoScalingGroupName promedia a todas las que estén vivas. Cada instancia sí publica su CPU, CloudWatch sí permite alarmas por instancia y una alarma de CPU no reinicia bases.'
  },
  {
    id: 'p11',
    tema: 'Monitoreo y avisos',
    sesion: 6,
    concepto: 'AWS CloudTrail',
    texto: 'Un lunes, el grupo de seguridad de la base de la tienda amaneció con una regla abierta a 0.0.0.0/0. ¿Qué servicio dice qué usuario la agregó y cuándo?',
    opciones: [
      'Amazon CloudWatch',
      'AWS CloudTrail',
      'Amazon SNS',
      'AWS Trusted Advisor'
    ],
    correcta: 1,
    explicacion:
      'CloudTrail registra cada llamada a la API (como AuthorizeSecurityGroupIngress): quién, qué, cuándo y desde dónde. CloudWatch mide y alarma, SNS reparte avisos y Trusted Advisor puede señalar el puerto abierto, pero no dice quién lo abrió.'
  },
  {
    id: 'p12',
    tema: 'Well-Architected aplicado',
    sesion: 9,
    concepto: 'Pilar de optimización de costos',
    texto: '¿Qué decisión de la arquitectura de la tienda atiende sobre todo el pilar de optimización de costos de Well-Architected?',
    opciones: [
      'Encadenar los grupos de seguridad del balanceador, la web y la base',
      'Poner la base de pedidos con despliegue Multi-AZ',
      'Que el grupo de Auto Scaling quite servidores cuando baja la carga',
      'Cifrar la base de pedidos con una llave de AWS KMS'
    ],
    correcta: 2,
    explicacion:
      'Quitar servidores cuando no hacen falta es pagar solo lo que se usa: optimización de costos (y de paso, sostenibilidad). Los grupos encadenados y el cifrado son del pilar de seguridad, y Multi-AZ es del pilar de fiabilidad.'
  },
  {
    id: 'p13',
    tema: 'Well-Architected aplicado',
    sesion: 9,
    concepto: 'Probar a escala de producción',
    texto: 'Antes del Buen Fin, el equipo crea por unas horas una copia idéntica de la tienda, le manda tráfico como el de la hora pico, mide y la borra, pagando solo esas horas. ¿Qué principio general de diseño de Well-Architected aplica?',
    opciones: [
      'Probar los sistemas a escala de producción',
      'Dejar de adivinar la capacidad',
      'Considerar arquitecturas que evolucionan con el negocio',
      'Decidir la arquitectura con base en datos'
    ],
    correcta: 0,
    explicacion:
      '«Test systems at production scale»: en la nube puedes crear un entorno de prueba del tamaño real, usarlo solo mientras pruebas y pagar solo ese rato. Dejar de adivinar la capacidad es escalar en vez de comprar para el peor día, las arquitecturas evolutivas cambian con el negocio y decidir con datos usa métricas para elegir.'
  },
  {
    id: 'p14',
    tema: 'Well-Architected aplicado',
    sesion: 9,
    concepto: 'Game days',
    texto: 'Cada trimestre, el equipo de la tienda apaga a propósito los servidores de una zona, en un ensayo planeado, para practicar cómo responden el sistema y las personas. ¿Qué principio de diseño de Well-Architected aplica?',
    opciones: [
      'Dejar de adivinar la capacidad',
      'Automatizar pensando en experimentar',
      'Considerar arquitecturas que evolucionan con el negocio',
      'Mejorar mediante simulacros (game days)'
    ],
    correcta: 3,
    explicacion:
      '«Improve through game days»: ensayar con regularidad eventos de producción, como la caída de una zona, para descubrir qué mejorar y que el equipo gane práctica. La «prueba del Buen Fin» del bono de la práctica es un pequeño game day.'
  },
  {
    id: 'p15',
    tema: 'Formas de desplegar',
    sesion: 9,
    concepto: 'AWS Elastic Beanstalk',
    texto: 'Un programador de la cooperativa quiere subir el código PHP de la tienda y que AWS se encargue de crear los servidores, el balanceador, el escalado y el monitoreo de salud, sin perder acceso a esos recursos. ¿Qué servicio usa?',
    opciones: [
      'Amazon Lightsail',
      'AWS Elastic Beanstalk',
      'AWS CloudFormation',
      'Amazon S3 con alojamiento de sitio web estático'
    ],
    correcta: 1,
    explicacion:
      'Elastic Beanstalk recibe el código y arma la plataforma: instancias EC2, balanceador, Auto Scaling y monitoreo de salud, que quedan en tu cuenta y puedes ajustar. Con CloudFormation tendrías que describir cada recurso en una plantilla, Lightsail da servidores sencillos a precio fijo y S3 solo sirve sitios estáticos, no PHP.'
  },
  {
    id: 'p16',
    tema: 'Formas de desplegar',
    sesion: 9,
    concepto: 'Plataforma como servicio (PaaS)',
    texto: 'En la práctica montaste la tienda pieza por pieza con EC2, que es infraestructura como servicio (IaaS). ¿Cuál de estos servicios es un ejemplo de plataforma como servicio (PaaS)?',
    opciones: [
      'Amazon EC2',
      'Amazon VPC',
      'Amazon Elastic Block Store (EBS)',
      'AWS Elastic Beanstalk'
    ],
    correcta: 3,
    explicacion:
      'En PaaS tú pones la aplicación y el proveedor administra la plataforma donde corre: eso hace Elastic Beanstalk. EC2, VPC y EBS son piezas de infraestructura (IaaS) que tú eliges y configuras.'
  },
  {
    id: 'p17',
    tema: 'Formas de desplegar',
    sesion: 9,
    concepto: 'Amazon Lightsail',
    texto: 'Una artesana quiere un sitio web sencillo para su taller, con servidor, disco y transferencia de datos por un precio mensual fijo y predecible, sin aprender VPC ni Auto Scaling. ¿Qué le recomiendas?',
    opciones: [
      'Amazon EC2 con instancias reservadas a 3 años',
      'AWS Elastic Beanstalk con un balanceador de carga',
      'Amazon Lightsail',
      'AWS Outposts'
    ],
    correcta: 2,
    explicacion:
      'Lightsail vende paquetes con precio mensual fijo que incluyen servidor, disco SSD y transferencia de datos: lo más sencillo de AWS para sitios pequeños. EC2 y Beanstalk cobran por uso y piden más configuración, y Outposts lleva hardware de AWS a tu propio centro de datos.'
  },
  {
    id: 'p18',
    tema: 'Formas de desplegar',
    sesion: 9,
    concepto: 'AWS Amplify',
    texto: 'El equipo hará una app web en React para que las clientas sigan sus pedidos. Quiere conectar su repositorio de GitHub y que cada cambio se publique solo, con su propio dominio. ¿Qué servicio está pensado para eso?',
    opciones: [
      'AWS Amplify',
      'Amazon CloudWatch',
      'AWS CloudTrail',
      'Amazon Lightsail'
    ],
    correcta: 0,
    explicacion:
      'Amplify sirve para crear y publicar apps web y móviles: Amplify Hosting se conecta al repositorio de Git y publica cada cambio con despliegue continuo y dominio propio. CloudWatch y CloudTrail vigilan y registran, y Lightsail da servidores sencillos sin ese flujo desde Git.'
  },
  {
    id: 'p19',
    tema: 'Formas de desplegar',
    sesion: 9,
    concepto: 'AWS Fargate',
    texto: 'La cooperativa empaquetó la API de pedidos en una imagen de contenedor y la va a correr en Amazon ECS. No quiere elegir, parchar ni escalar las instancias EC2 donde viven los contenedores. ¿Qué opción usa?',
    opciones: [
      'Instancias EC2 en el clúster de ECS, con Auto Scaling',
      'AWS CloudFormation',
      'AWS Fargate',
      'AWS Direct Connect'
    ],
    correcta: 2,
    explicacion:
      'Con Fargate, Amazon ECS (o EKS) corre los contenedores sin que elijas, parches ni escales instancias: indicas CPU y memoria y AWS pone la máquina. Con instancias EC2 en el clúster sigues administrando servidores, CloudFormation solo crea lo que describas en una plantilla y Direct Connect es una conexión de red privada. (App Runner hacía algo parecido, pero ya no acepta clientes nuevos y salió de la guía del examen.)'
  },
  {
    id: 'p20',
    tema: 'Formas de desplegar',
    sesion: 9,
    concepto: 'AWS CloudFormation',
    texto: '¿Qué dos afirmaciones sobre AWS CloudFormation son correctas? (Elige DOS.)',
    opciones: [
      'Describe la infraestructura en una plantilla de texto, en JSON o YAML',
      'Estima cuánto costará la arquitectura antes de crearla',
      'Cobra una cuota mensual fija por cada pila (stack)',
      'Con la misma plantilla crea la misma arquitectura en otra región',
      'Solo puede crear instancias EC2, no redes ni bases de datos'
    ],
    correcta: [0, 3],
    elige: 2,
    explicacion:
      'CloudFormation es infraestructura como código: una plantilla JSON o YAML describe los recursos y se despliega igual en otra región o cuenta. No estima costos (eso es Pricing Calculator), no cobra extra por los recursos de AWS (pagas lo que crea) y maneja casi cualquier servicio: VPC, balanceadores, bases y más.'
  }
];
