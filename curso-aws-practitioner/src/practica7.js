// El examen de práctica de la sesión 7 (costos, soporte y buenas prácticas):
// 20 preguntas al estilo del examen AWS Certified Cloud Practitioner (CLF-C02).
// Mismas reglas que los otros bancos (ver src/practica.js): la respuesta
// correcta vive solo en el servidor, la clave está balanceada (5 en A, 5 en B,
// 5 en C y 5 en D, sin rachas de tres) y cada distractor es una confusión real.
// Los planes de soporte cambiaron de nombre en la consola; las preguntas usan
// solo lo que no cambia (Basic gratis, TAM en Enterprise).
// Corre `npm run verificar` si cambias algo.

export const TEMAS = ['Modelos de precio', 'Herramientas de costos', 'Cuentas y gobierno', 'Soporte y asesoría', 'Buenas prácticas'];

// Qué lecciones del curso repasar cuando un tema sale bajo.
export const REPASO = {
  'Modelos de precio': ['s7-precios', 's7-ex-precio', 's1-precios', 's7-lab-costos'],
  'Herramientas de costos': ['s7-herramientas', 's7-ex-herramienta', 's7-ex-cual-herramienta'],
  'Cuentas y gobierno': ['s7-herramientas', 's7-ex-organizations'],
  'Soporte y asesoría': ['s7-soporte', 's7-ex-soporte'],
  'Buenas prácticas': ['s7-buenas-practicas', 's7-ex-pilares']
};

// Lo que se muestra antes de empezar y en el desplegable de cada pregunta.
export const CASO = `
  <p>Este examen se parece al de la certificación <strong>AWS Certified Cloud Practitioner (CLF-C02)</strong>. Los costos y el soporte forman el dominio de <strong>facturación, precios y soporte</strong> (12&nbsp;%); Well-Architected entra en <strong>conceptos de la nube</strong> (24&nbsp;%).</p>
  <ul>
    <li>En el examen real son <strong>65 preguntas en 90 minutos</strong> y se aprueba con <strong>700 de 1000</strong>.</li>
    <li>Busca la <strong>palabra clave</strong>: “antes de crear”, “ya gastado”, “alerta”, “una sola factura”, “persona asignada”, “buenas prácticas”…</li>
    <li>Distingue lo que <strong>revisa tu cuenta</strong> (Trusted Advisor) de lo que <strong>informa sobre AWS</strong> (Health Dashboard).</li>
  </ul>`;

export const PREGUNTAS = [
  {
    id: 'p01',
    concepto: 'On-Demand',
    tema: 'Modelos de precio',
    texto: 'Un equipo necesita un servidor por unos días para una prueba cuya duración no conoce, y no quiere ningún compromiso. ¿Qué opción de compra usa?',
    opciones: [
      'Instancias On-Demand',
      'Instancias reservadas por un año',
      'Un Savings Plan a tres años',
      'Dedicated Hosts'
    ],
    correcta: 0,
    explicacion: 'On-Demand cobra por segundo u hora sin compromiso: ideal para cargas cortas o impredecibles.'
  },
  {
    id: 'p02',
    concepto: 'Instancias Spot',
    tema: 'Modelos de precio',
    texto: 'Un proceso de análisis puede detenerse en cualquier momento y continuar después. La empresa quiere el menor costo posible de cómputo. ¿Qué elige?',
    opciones: [
      'Dedicated Hosts',
      'On-Demand',
      'Instancias Spot',
      'Instancias reservadas'
    ],
    correcta: 2,
    explicacion: 'Spot usa capacidad sobrante con descuentos de hasta 90 %; a cambio, AWS puede recuperar la instancia. Sirve para trabajos tolerantes a interrupciones.'
  },
  {
    id: 'p03',
    concepto: 'Savings Plans',
    tema: 'Modelos de precio',
    texto: '¿Qué describe mejor un Compute Savings Plan?',
    opciones: [
      'Un servidor físico dedicado a una sola cuenta',
      'Un compromiso de gasto por hora durante 1 o 3 años a cambio de descuento en cómputo',
      'Una alerta que avisa cuando el gasto de cómputo sube',
      'Capacidad sobrante que AWS puede recuperar con dos minutos de aviso'
    ],
    correcta: 1,
    explicacion: 'Con un Savings Plan te comprometes a gastar cierto monto por hora durante 1 o 3 años. El de tipo Compute se aplica a EC2, Fargate y Lambda, en cualquier región.'
  },
  {
    id: 'p04',
    concepto: 'Dedicated Hosts',
    tema: 'Modelos de precio',
    texto: 'Una empresa tiene licencias de software que se cobran por servidor físico y quiere usarlas en AWS. ¿Qué opción de EC2 le sirve?',
    opciones: [
      'Instancias Spot',
      'AWS Budgets',
      'Un Compute Savings Plan',
      'Dedicated Hosts'
    ],
    correcta: 3,
    explicacion: 'Un Dedicated Host es un servidor físico solo para ti: permite usar licencias ligadas al hardware y cumplir reglas de aislamiento.'
  },
  {
    id: 'p05',
    concepto: 'Costo de transferencia de datos',
    tema: 'Modelos de precio',
    texto: '¿Qué movimiento de datos normalmente NO se cobra en AWS?',
    opciones: [
      'Los datos que salen de AWS hacia internet',
      'Los datos que entran a AWS desde internet',
      'Los datos guardados en un volumen EBS cada mes',
      'Los datos guardados en S3 Standard cada mes'
    ],
    correcta: 1,
    explicacion: 'La entrada de datos a AWS no se cobra; la salida hacia internet sí. El almacenamiento se cobra por gigabyte al mes.'
  },
  {
    id: 'p06',
    concepto: 'AWS Pricing Calculator',
    tema: 'Herramientas de costos',
    texto: 'Un cliente quiere saber cuánto le costaría al mes una arquitectura con EC2 y S3 antes de crear cualquier recurso. ¿Qué herramienta usa?',
    opciones: [
      'AWS Pricing Calculator',
      'AWS Cost Explorer',
      'AWS Trusted Advisor',
      'AWS Health Dashboard'
    ],
    correcta: 0,
    explicacion: 'La calculadora de precios estima costos antes de crear recursos. Es pública y no necesita cuenta. Cost Explorer solo analiza lo ya gastado.'
  },
  {
    id: 'p07',
    concepto: 'AWS Cost Explorer',
    tema: 'Herramientas de costos',
    texto: 'Finanzas quiere ver en una gráfica en qué servicios se gastó el dinero los últimos seis meses y un pronóstico del próximo. ¿Qué usa?',
    opciones: [
      'AWS Pricing Calculator',
      'AWS Organizations',
      'AWS Marketplace',
      'AWS Cost Explorer'
    ],
    correcta: 3,
    explicacion: 'Cost Explorer muestra el gasto pasado agrupado por servicio, cuenta o etiqueta, y pronostica el gasto futuro.'
  },
  {
    id: 'p08',
    concepto: 'AWS Budgets',
    tema: 'Herramientas de costos',
    texto: 'Un gerente quiere recibir un correo cuando el gasto pronosticado del mes vaya a superar 500 dólares. ¿Qué configura?',
    opciones: [
      'Un reporte de Cost Explorer',
      'Un chequeo de Trusted Advisor',
      'Un presupuesto en AWS Budgets',
      'Una estimación en Pricing Calculator'
    ],
    correcta: 2,
    explicacion: 'AWS Budgets manda alertas cuando el gasto real o el pronosticado pasa del límite que defines.'
  },
  {
    id: 'p09',
    concepto: 'Etiquetas de asignación de costos',
    tema: 'Herramientas de costos',
    texto: 'Una empresa usa una sola cuenta para tres proyectos y quiere saber cuánto gasta cada uno. ¿Qué le ayuda?',
    opciones: [
      'Etiquetas de asignación de costos en los recursos',
      'Cambiar todos los servidores a instancias Spot',
      'Contratar un plan de soporte superior',
      'Activar el versionado en los buckets'
    ],
    correcta: 0,
    explicacion: 'Las etiquetas (como Proyecto=tienda) permiten agrupar y filtrar los costos por proyecto en Cost Explorer y en los reportes.'
  },
  {
    id: 'p10',
    concepto: 'Cost Anomaly Detection',
    tema: 'Herramientas de costos',
    texto: '¿Qué servicio detecta automáticamente gastos inusuales con aprendizaje automático, sin que tengas que fijar un límite?',
    opciones: [
      'AWS Pricing Calculator',
      'AWS Cost Anomaly Detection',
      'AWS Control Tower',
      'Amazon CloudFront'
    ],
    correcta: 1,
    explicacion: 'Cost Anomaly Detection aprende el patrón normal de gasto y avisa cuando algo se sale de lo esperado. Budgets, en cambio, compara contra un límite que tú pones.'
  },
  {
    id: 'p11',
    concepto: 'Facturación consolidada',
    tema: 'Cuentas y gobierno',
    texto: 'Una empresa con varias cuentas de AWS quiere una sola factura y que el uso combinado alcance descuentos por volumen. ¿Qué usa?',
    opciones: [
      'AWS Budgets en cada cuenta',
      'Un plan Enterprise Support',
      'La facturación consolidada de AWS Organizations',
      'Etiquetas de asignación de costos'
    ],
    correcta: 2,
    explicacion: 'La facturación consolidada de Organizations junta las cuentas en una factura y suma su uso para los descuentos por volumen.'
  },
  {
    id: 'p12',
    concepto: 'Políticas de control de servicios',
    tema: 'Cuentas y gobierno',
    texto: 'Una empresa quiere impedir que las cuentas de pruebas usen servicios fuera de una lista aprobada, sin importar los permisos de IAM de cada usuario. ¿Qué usa?',
    opciones: [
      'Un presupuesto de AWS Budgets',
      'Un chequeo de Trusted Advisor',
      'Una estimación compartida',
      'Una política de control de servicios (SCP) en AWS Organizations'
    ],
    correcta: 3,
    explicacion: 'Una SCP pone el límite máximo de lo que pueden hacer las cuentas de una unidad organizativa. Lo que la SCP niega, ningún permiso de IAM lo permite.'
  },
  {
    id: 'p13',
    concepto: 'AWS Control Tower',
    tema: 'Cuentas y gobierno',
    texto: '¿Qué servicio prepara rápidamente un entorno con varias cuentas que ya sigue las buenas prácticas de AWS (una landing zone)?',
    opciones: [
      'AWS Cost Explorer',
      'AWS Marketplace',
      'AWS Control Tower',
      'Amazon CloudWatch'
    ],
    correcta: 2,
    explicacion: 'Control Tower automatiza la creación de un entorno multicuenta con Organizations, controles y registros ya configurados.'
  },
  {
    id: 'p14',
    concepto: 'Plan Basic',
    tema: 'Soporte y asesoría',
    texto: '¿Qué plan de soporte viene incluido sin costo en todas las cuentas de AWS?',
    opciones: [
      'Basic Support',
      'Enterprise Support',
      'Un plan que se elige al pagar la primera factura',
      'Ninguno: todo soporte tiene costo'
    ],
    correcta: 0,
    explicacion: 'Basic Support es gratuito: incluye atención de facturación y cuotas, AWS Health Dashboard y algunos chequeos de Trusted Advisor.'
  },
  {
    id: 'p15',
    concepto: 'Technical Account Manager',
    tema: 'Soporte y asesoría',
    texto: '¿Con qué plan de soporte una empresa tiene acceso a un Technical Account Manager (TAM)?',
    opciones: [
      'Basic Support',
      'Enterprise Support',
      'Con cualquier plan, si lo pide por correo',
      'Solo comprándolo en AWS Marketplace'
    ],
    correcta: 1,
    explicacion: 'El Technical Account Manager es parte de Enterprise Support (y de los planes superiores): una persona de AWS que conoce tu arquitectura y te guía.'
  },
  {
    id: 'p16',
    concepto: 'AWS Trusted Advisor',
    tema: 'Soporte y asesoría',
    texto: '¿Qué servicio revisa tu cuenta y recomienda mejoras en costos, rendimiento, seguridad, tolerancia a fallas y límites de servicio?',
    opciones: [
      'AWS Health Dashboard',
      'AWS Pricing Calculator',
      'AWS Organizations',
      'AWS Trusted Advisor'
    ],
    correcta: 3,
    explicacion: 'Trusted Advisor compara tu cuenta con buenas prácticas en esas cinco categorías. Con el plan Basic muestra solo algunos chequeos.'
  },
  {
    id: 'p17',
    concepto: 'AWS Health Dashboard',
    tema: 'Soporte y asesoría',
    texto: 'Un administrador quiere saber si un problema en un servicio de AWS está afectando a sus propias instancias. ¿Dónde lo revisa?',
    opciones: [
      'AWS Health Dashboard',
      'AWS Trusted Advisor',
      'AWS Cost Explorer',
      'AWS Budgets'
    ],
    correcta: 0,
    explicacion: 'AWS Health Dashboard informa de eventos de AWS que afectan tus recursos y del mantenimiento programado. Trusted Advisor revisa la configuración de tu cuenta.'
  },
  {
    id: 'p18',
    concepto: 'Pilares de Well-Architected',
    tema: 'Buenas prácticas',
    texto: '¿Cuál de estos NO es uno de los seis pilares del AWS Well-Architected Framework?',
    opciones: [
      'Sostenibilidad',
      'Fiabilidad',
      'Optimización de costos',
      'Portabilidad'
    ],
    correcta: 3,
    explicacion: 'Los seis pilares son excelencia operativa, seguridad, fiabilidad, eficiencia del rendimiento, optimización de costos y sostenibilidad.'
  },
  {
    id: 'p19',
    concepto: 'Pilar de fiabilidad',
    tema: 'Buenas prácticas',
    texto: 'Un sistema debe recuperarse solo de fallas y seguir atendiendo aunque caiga una zona de disponibilidad. ¿A qué pilar corresponde?',
    opciones: [
      'Optimización de costos',
      'Fiabilidad',
      'Excelencia operativa',
      'Sostenibilidad'
    ],
    correcta: 1,
    explicacion: 'El pilar de fiabilidad trata de recuperarse de fallas y cumplir la demanda: varias zonas, Auto Scaling y respaldos.'
  },
  {
    id: 'p20',
    concepto: 'AWS Marketplace',
    tema: 'Buenas prácticas',
    texto: 'Una empresa quiere comprar un firewall de otro fabricante, listo para correr en AWS y cobrado en su misma factura. ¿Dónde lo busca?',
    opciones: [
      'AWS Trusted Advisor',
      'AWS Well-Architected Tool',
      'AWS Marketplace',
      'AWS Pricing Calculator'
    ],
    correcta: 2,
    explicacion: 'AWS Marketplace es la tienda de software de terceros que se despliega en AWS y se cobra en la factura de AWS.'
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
