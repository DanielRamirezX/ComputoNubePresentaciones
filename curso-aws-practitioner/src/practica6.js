// El examen de práctica de la sesión 6 (escalar y automatizar): 20 preguntas al
// estilo del examen AWS Certified Cloud Practitioner (CLF-C02). Mismas reglas
// que los otros bancos (ver src/practica.js): la respuesta correcta vive solo en
// el servidor, la clave está balanceada (5 en A, 5 en B, 5 en C y 5 en D, sin
// rachas de tres) y cada distractor es una confusión real.
// Corre `npm run verificar` si cambias algo.

export const TEMAS = ['Elasticidad y Auto Scaling', 'Balanceo de carga', 'Monitoreo', 'Sin servidores y contenedores', 'Desacoplar aplicaciones'];

// Qué lecciones del curso repasar cuando un tema sale bajo.
export const REPASO = {
  'Elasticidad y Auto Scaling': ['s6-elasticidad', 's6-ex-escalar', 's6-lab-escalar', 's6-ex-madrugada'],
  'Balanceo de carga': ['s6-balanceadores', 's6-ex-balanceador', 's6-ex-quien-escala'],
  'Monitoreo': ['s6-monitorear', 's6-ex-quien-escala'],
  'Sin servidores y contenedores': ['s6-serverless'],
  'Desacoplar aplicaciones': ['s6-serverless', 's6-ex-desacoplar']
};

// Lo que se muestra antes de empezar y en el desplegable de cada pregunta.
export const CASO = `
  <p>Este examen se parece al de la certificación <strong>AWS Certified Cloud Practitioner (CLF-C02)</strong>. Escalar, monitorear y los servicios sin servidores entran en el dominio de <strong>tecnología y servicios</strong> (34&nbsp;%) y en los principios de diseño de <strong>conceptos de la nube</strong>.</p>
  <ul>
    <li>En el examen real son <strong>65 preguntas en 90 minutos</strong> y se aprueba con <strong>700 de 1000</strong>.</li>
    <li>Busca la <strong>palabra clave</strong>: “según la demanda”, “repartir el tráfico”, “quién hizo”, “sin administrar servidores”, “desacoplar”…</li>
    <li>Si la pregunta dice “automáticamente” y “más o menos instancias”, piensa en Auto Scaling; si dice “métrica” o “alarma”, en CloudWatch.</li>
  </ul>`;

export const PREGUNTAS = [
  {
    id: 'p01',
    concepto: 'Elasticidad',
    tema: 'Elasticidad y Auto Scaling',
    texto: '¿Qué describe mejor la elasticidad de la nube?',
    opciones: [
      'Guardar los datos en varias regiones al mismo tiempo',
      'Comprar servidores por adelantado para el pico del año',
      'Aumentar y reducir los recursos automáticamente según la demanda',
      'Cifrar todos los datos con llaves administradas'
    ],
    correcta: 2,
    explicacion: 'Elasticidad es crecer cuando la demanda sube y encogerse cuando baja, de forma automática, pagando solo por lo que se usa.'
  },
  {
    id: 'p02',
    concepto: 'Escalar horizontal',
    tema: 'Elasticidad y Auto Scaling',
    texto: 'Un equipo pasa de 2 a 8 servidores web iguales para aguantar más visitas. ¿Cómo se llama eso?',
    opciones: [
      'Escalar horizontalmente',
      'Escalar verticalmente',
      'Migrar a otra región',
      'Reservar capacidad'
    ],
    correcta: 0,
    explicacion: 'Agregar más instancias iguales es escalar horizontal. Escalar vertical es cambiar una instancia por otra más grande.'
  },
  {
    id: 'p03',
    concepto: 'Capacidad máxima',
    tema: 'Elasticidad y Auto Scaling',
    texto: 'En un grupo de Auto Scaling, ¿para qué sirve la capacidad máxima?',
    opciones: [
      'Para fijar cuántas instancias se lanzan al crear el grupo',
      'Para indicar cuántas zonas de disponibilidad usa el grupo',
      'Para decidir cuánta memoria tiene cada instancia',
      'Para poner un tope al número de instancias y al gasto'
    ],
    correcta: 3,
    explicacion: 'El máximo es el tope: aunque la demanda siga subiendo, el grupo nunca tendrá más instancias. El número inicial es la capacidad deseada.'
  },
  {
    id: 'p04',
    concepto: 'Reemplazo de instancias',
    tema: 'Elasticidad y Auto Scaling',
    texto: 'Una instancia de un grupo de Auto Scaling deja de pasar sus revisiones de salud. ¿Qué hace el grupo?',
    opciones: [
      'Manda un correo y espera a que alguien la repare',
      'La termina y lanza otra para mantener la capacidad deseada',
      'Cambia la instancia por una de mayor tamaño',
      'Mueve el grupo completo a otra región'
    ],
    correcta: 1,
    explicacion: 'Auto Scaling reemplaza solo las instancias no sanas para mantener la capacidad deseada. Lo viste en el laboratorio.'
  },
  {
    id: 'p05',
    concepto: 'Escalado programado',
    tema: 'Elasticidad y Auto Scaling',
    texto: 'Una universidad sabe que cada lunes a las 8:00 entran miles de alumnos a su plataforma. ¿Qué tipo de escalado conviene?',
    opciones: [
      'Escalado programado para esa hora',
      'Un solo servidor más grande todo el año',
      'Un snapshot de EBS cada lunes',
      'Una regla de ciclo de vida de S3'
    ],
    correcta: 0,
    explicacion: 'Cuando el pico se conoce de antemano, el escalado programado sube la capacidad justo antes y la baja después.'
  },
  {
    id: 'p06',
    concepto: 'Elastic Load Balancing',
    tema: 'Balanceo de carga',
    texto: '¿Qué servicio reparte el tráfico de los usuarios entre varias instancias EC2 en distintas zonas de disponibilidad?',
    opciones: [
      'Amazon CloudFront',
      'AWS CloudTrail',
      'Elastic Load Balancing',
      'Amazon Route 53 Resolver'
    ],
    correcta: 2,
    explicacion: 'Elastic Load Balancing recibe el tráfico en una sola dirección y lo reparte entre las instancias sanas de varias zonas.'
  },
  {
    id: 'p07',
    concepto: 'Application Load Balancer',
    tema: 'Balanceo de carga',
    texto: 'Un sitio quiere mandar las peticiones de /api a unos servidores y las de /imagenes a otros. ¿Qué balanceador usa?',
    opciones: [
      'Network Load Balancer',
      'Application Load Balancer',
      'Gateway Load Balancer',
      'Un grupo de seguridad'
    ],
    correcta: 1,
    explicacion: 'El Application Load Balancer trabaja con HTTP y HTTPS (capa 7) y puede decidir a dónde mandar cada petición según la ruta o el dominio.'
  },
  {
    id: 'p08',
    concepto: 'Network Load Balancer',
    tema: 'Balanceo de carga',
    texto: 'Una aplicación de mensajería necesita repartir millones de conexiones TCP por segundo, con muy poca latencia y una IP estática. ¿Qué balanceador elige?',
    opciones: [
      'Application Load Balancer',
      'Gateway Load Balancer',
      'Amazon API Gateway',
      'Network Load Balancer'
    ],
    correcta: 3,
    explicacion: 'El Network Load Balancer trabaja en capa 4 (TCP, UDP, TLS), maneja millones de peticiones por segundo y ofrece IP estática.'
  },
  {
    id: 'p09',
    concepto: 'Gateway Load Balancer',
    tema: 'Balanceo de carga',
    texto: 'Una empresa quiere que todo su tráfico pase por firewalls virtuales de otra marca antes de llegar a sus servidores. ¿Qué le ayuda a desplegarlos y escalarlos?',
    opciones: [
      'Amazon CloudWatch',
      'Application Load Balancer',
      'EC2 Auto Scaling sin balanceador',
      'Gateway Load Balancer'
    ],
    correcta: 3,
    explicacion: 'El Gateway Load Balancer está hecho para desplegar y escalar aparatos virtuales de terceros, como firewalls y sistemas de inspección.'
  },
  {
    id: 'p10',
    concepto: 'Revisiones de salud del balanceador',
    tema: 'Balanceo de carga',
    texto: '¿Qué hace un balanceador de carga cuando una de sus instancias deja de responder?',
    opciones: [
      'Deja de mandarle tráfico y lo reparte entre las sanas',
      'Apaga todas las instancias para reiniciarlas juntas',
      'Borra la instancia y su disco',
      'Cambia la región de la aplicación'
    ],
    correcta: 0,
    explicacion: 'El balanceador revisa la salud de cada instancia y solo manda tráfico a las que responden. Reemplazar la instancia es trabajo de Auto Scaling.'
  },
  {
    id: 'p11',
    concepto: 'Alarmas de CloudWatch',
    tema: 'Monitoreo',
    texto: 'Un administrador quiere recibir un aviso cuando la CPU de sus servidores pase de 80 % durante 10 minutos. ¿Qué usa?',
    opciones: [
      'Un registro de AWS CloudTrail',
      'Una regla de grupo de seguridad',
      'Una alarma de Amazon CloudWatch',
      'AWS Trusted Advisor'
    ],
    correcta: 2,
    explicacion: 'CloudWatch mide la CPU y una alarma se enciende cuando la métrica cruza el umbral; puede avisar por SNS o escalar un grupo.'
  },
  {
    id: 'p12',
    concepto: 'AWS CloudTrail',
    tema: 'Monitoreo',
    texto: 'Ayer alguien borró una instancia importante. ¿Qué servicio dice quién lo hizo, cuándo y desde qué IP?',
    opciones: [
      'Amazon CloudWatch',
      'AWS CloudTrail',
      'Elastic Load Balancing',
      'Amazon SQS'
    ],
    correcta: 1,
    explicacion: 'CloudTrail registra cada llamada a la API de la cuenta: quién, qué, cuándo y desde dónde. CloudWatch mide el funcionamiento, no las acciones de los usuarios.'
  },
  {
    id: 'p13',
    concepto: 'CloudWatch Logs',
    tema: 'Monitoreo',
    texto: 'Un equipo quiere juntar en un solo lugar los registros de errores de sus aplicaciones para buscarlos y conservarlos. ¿Qué usa?',
    opciones: [
      'Amazon CloudWatch Logs',
      'AWS CloudTrail Lake',
      'Amazon S3 Glacier Deep Archive',
      'Elastic Load Balancing'
    ],
    correcta: 0,
    explicacion: 'CloudWatch Logs recibe, guarda y permite buscar los registros de las aplicaciones y de los servicios de AWS.'
  },
  {
    id: 'p14',
    concepto: 'Métricas de EC2',
    tema: 'Monitoreo',
    texto: '¿Cada cuánto envía EC2 sus métricas básicas a CloudWatch sin costo adicional?',
    opciones: [
      'Cada segundo',
      'Una vez al día',
      'Solo cuando se crea una alarma',
      'Cada 5 minutos'
    ],
    correcta: 3,
    explicacion: 'Las métricas básicas de EC2 llegan cada 5 minutos sin costo. El monitoreo detallado, cada minuto, se cobra aparte.'
  },
  {
    id: 'p15',
    concepto: 'AWS Lambda',
    tema: 'Sin servidores y contenedores',
    texto: 'Cada vez que se sube una foto a S3 hay que generar su miniatura, sin administrar servidores y pagando solo cuando ocurre. ¿Qué servicio usan?',
    opciones: [
      'Una instancia EC2 encendida todo el día',
      'AWS Lambda',
      'Amazon EBS',
      'AWS Snowball'
    ],
    correcta: 1,
    explicacion: 'Lambda ejecuta código en respuesta a eventos, como un objeto nuevo en S3, sin servidores que administrar y cobrando por invocación.'
  },
  {
    id: 'p16',
    concepto: 'Límite de Lambda',
    tema: 'Sin servidores y contenedores',
    texto: 'Un proceso de cálculo tarda 3 horas sin parar. ¿Por qué no conviene una función de Lambda?',
    opciones: [
      'Porque Lambda solo acepta código en Java',
      'Porque Lambda solo corre en la región us-east-1',
      'Porque cada ejecución de Lambda dura como máximo 15 minutos',
      'Porque Lambda cobra una cuota fija de inicio'
    ],
    correcta: 2,
    explicacion: 'Una ejecución de Lambda dura como máximo 15 minutos. Un proceso de horas va mejor en EC2, en contenedores con Fargate o en AWS Batch.'
  },
  {
    id: 'p17',
    concepto: 'AWS Fargate',
    tema: 'Sin servidores y contenedores',
    texto: 'Un equipo quiere correr sus contenedores sin administrar los servidores donde viven. ¿Qué usa?',
    opciones: [
      'Amazon EC2 con instancias dedicadas',
      'AWS Fargate',
      'Amazon EBS io2',
      'AWS Direct Connect'
    ],
    correcta: 1,
    explicacion: 'Fargate es cómputo sin servidores para contenedores (con ECS o EKS): tú indicas CPU y memoria, AWS pone y administra la máquina.'
  },
  {
    id: 'p18',
    concepto: 'Amazon SQS',
    tema: 'Desacoplar aplicaciones',
    texto: 'El sitio de una tienda manda los pedidos directo al sistema de envíos, y cuando éste se satura los pedidos se pierden. ¿Qué servicio los desacopla?',
    opciones: [
      'Amazon CloudWatch',
      'AWS CloudTrail',
      'Amazon Route 53',
      'Amazon SQS'
    ],
    correcta: 3,
    explicacion: 'SQS es una cola: el sitio deja los pedidos y el sistema de envíos los procesa a su ritmo. Si se satura, los mensajes esperan en la cola.'
  },
  {
    id: 'p19',
    concepto: 'Amazon SNS',
    tema: 'Desacoplar aplicaciones',
    texto: 'Cuando se paga un pedido, el mismo aviso debe llegar por correo, por SMS y a una función de Lambda. ¿Qué servicio lo reparte?',
    opciones: [
      'Amazon SNS',
      'Amazon SQS',
      'Amazon EFS',
      'AWS Config'
    ],
    correcta: 0,
    explicacion: 'SNS sigue el modelo de publicar y suscribirse: un mensaje publicado en un tema llega a todos sus suscriptores a la vez.'
  },
  {
    id: 'p20',
    concepto: 'Amazon EventBridge',
    tema: 'Desacoplar aplicaciones',
    texto: 'Un equipo quiere que cada noche a las 2:00 se ejecute una función de respaldo, y que ciertos eventos de sus servicios disparen otras acciones. ¿Qué servicio usa?',
    opciones: [
      'Elastic Load Balancing',
      'Amazon CloudFront',
      'Amazon EventBridge',
      'AWS Snowball Edge'
    ],
    correcta: 2,
    explicacion: 'EventBridge es un bus de eventos con reglas: reacciona a eventos de servicios y aplicaciones y también ejecuta tareas por horario.'
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
