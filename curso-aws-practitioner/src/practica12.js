// El examen de práctica de la sesión 12 (Práctica 4: Café del Bajío ordena sus
// cuentas y su factura): 20 preguntas nuevas al estilo del examen AWS Certified
// Cloud Practitioner (CLF-C02), del dominio de facturación, precios y soporte, y
// de la parte de gobierno de cuentas del dominio de seguridad.
//
// - Mitad sobre el caso (Organizations y SCP, etiquetas, Budgets, Savings
//   Plans, la IP elástica suelta, el cambio de tamaño, Trusted Advisor, el
//   soporte y Well-Architected) y mitad sobre lo que agrega la lección
//   s12-examen (Control Tower, Service Catalog, License Manager, Compute
//   Optimizer, Service Quotas, re:Post, Professional Services, la Partner
//   Network y el Health Dashboard).
// - `sesion` dice de qué sesión de la Ruta sale cada pregunta: 2 y 7 para lo
//   que ya se vio ahí, 12 para lo nuevo de hoy.
// - Dos son de respuesta múltiple («Elige DOS», 5 opciones), como en el examen
//   real. Las otras 18 llevan la clave balanceada (A 5, B 4, C 5, D 4, sin
//   rachas de tres) y la correcta casi nunca es la opción más larga.
// - Ninguna repite el escenario de otro banco de la Ruta: la landing zone, el
//   TAM, el plan Basic gratis, el firewall de Marketplace, la etiqueta sin
//   activar y el plan Business Support+ ya salen en las sesiones 7 y 8.
// - Datos revisados en la documentación de AWS (noviembre de 2026). AWS IQ
//   cerró el 28 de mayo de 2026, así que ninguna pregunta lo usa.
//
// Corre `npm run verificar` si cambias algo.

export const TEMAS = ['Cuentas y límites', 'Gasto a la vista', 'Pagar lo justo', 'Soporte y ayuda', 'Seguridad y revisión'];

// 20 preguntas en 15 minutos, con la escala del examen real (700 de 1000).
export const MINUTOS = 15;
export const ESCALA = { maximo: 1000, aprueba: 700 };

// Qué lecciones de la Ruta repasar cuando un tema sale bajo.
export const REPASO = {
  'Cuentas y límites': ['s12-caso', 's12-examen', 's12-ex-quien', 's7-ex-organizations'],
  'Gasto a la vista': ['s12-practica', 's12-examen', 's7-herramientas', 's7-ex-cual-herramienta'],
  'Pagar lo justo': ['s12-caso', 's12-examen', 's7-precios', 's1-ec2'],
  'Soporte y ayuda': ['s12-examen', 's7-soporte', 's7-ex-soporte'],
  'Seguridad y revisión': ['s12-caso', 's12-practica', 's2-identidades', 's7-buenas-practicas']
};

// Lo que se muestra antes de empezar y en el desplegable de cada pregunta.
export const CASO = `
  <p>Este examen se parece al de la certificación <strong>AWS Certified Cloud Practitioner (CLF-C02)</strong>. Casi todo es del dominio de <strong>facturación, precios y soporte</strong> (12&nbsp;%), más el gobierno de cuentas, que entra en <strong>seguridad y cumplimiento</strong> (30&nbsp;%).</p>
  <ul>
    <li>En el examen real son <strong>65 preguntas en 90 minutos</strong> y se aprueba con <strong>700 de 1000</strong>. Hoy son 20 en unos 15 minutos.</li>
    <li>Busca la <strong>palabra clave</strong>: “techo de permisos”, “cuentas nuevas con controles”, “solo lo aprobado”, “licencias”, “subir un límite”, “tamaño justo”, “comunidad”, “expertos de AWS”, “¿me afecta a mí?”…</li>
    <li>Las de <strong>respuesta múltiple</strong> dicen «(Elige DOS.)» y solo cuentan si marcas las dos correctas.</li>
  </ul>`;

export const PREGUNTAS = [
  {
    id: 'p01',
    tema: 'Cuentas y límites',
    sesion: 12,
    concepto: 'Las SCP y la cuenta de administración',
    texto: 'Una cadena de cafeterías adjuntó a Root una SCP que niega crear recursos fuera de us-east-1. Un administrador de la cuenta de administración de la organización lanza un servidor en São Paulo (sa-east-1). ¿Qué pasa?',
    opciones: [
      'La SCP lo bloquea, porque se adjuntó a Root y Root incluye a todas las cuentas',
      'Lo lanza sin problema: las SCP nunca limitan a la cuenta de administración',
      'Lo lanza, pero AWS lo detiene a los pocos minutos por violar la SCP',
      'Solo lo bloquea si su usuario de IAM no tiene AdministratorAccess'
    ],
    correcta: 1,
    explicacion: 'Las SCP limitan a las cuentas miembro, incluso a su usuario raíz, pero nunca a la cuenta de administración. Por eso AWS recomienda no correr cargas de trabajo en ella. Una SCP tampoco actúa después: niega la llamada a la API en el momento, o no hace nada.'
  },
  {
    id: 'p02',
    tema: 'Cuentas y límites',
    sesion: 7,
    concepto: 'La SCP es el techo de los permisos',
    texto: 'En una cuenta miembro, la SCP de su OU solo permite Amazon S3 y Amazon EC2. Un usuario de esa cuenta tiene la política AdministratorAccess de IAM. ¿Qué puede hacer ese usuario?',
    opciones: [
      'Todo, porque AdministratorAccess está por encima de cualquier SCP',
      'Nada, porque las SCP y las políticas de IAM se anulan entre sí',
      'Lo que diga la SCP, aunque no tuviera ninguna política de IAM',
      'Solo usar S3 y EC2, lo que permiten a la vez la SCP y IAM'
    ],
    correcta: 3,
    explicacion: 'Una SCP no da permisos: pone el máximo de lo que se puede hacer en la cuenta. El usuario puede hacer solo lo que permiten al mismo tiempo la SCP y sus políticas de IAM. Sin una política de IAM que permita, no podría hacer nada aunque la SCP lo deje.'
  },
  {
    id: 'p03',
    tema: 'Cuentas y límites',
    sesion: 12,
    concepto: 'AWS Service Catalog',
    texto: 'El área de TI de una cadena de cafeterías quiere que cada sucursal lance por su cuenta el servidor de su punto de venta, pero solo con la versión, el tamaño y las etiquetas que TI aprobó, y sin darle permisos amplios. ¿Qué servicio usa?',
    opciones: [
      'AWS Service Catalog',
      'AWS Control Tower',
      'AWS Marketplace',
      'AWS License Manager'
    ],
    correcta: 0,
    explicacion: 'AWS Service Catalog guarda un catálogo de productos aprobados por TI (plantillas de CloudFormation) que los usuarios lanzan en autoservicio, con las opciones que TI permitió. Control Tower crea y gobierna cuentas, y Marketplace vende software de terceros.'
  },
  {
    id: 'p04',
    tema: 'Cuentas y límites',
    sesion: 12,
    concepto: 'Account Factory de Control Tower',
    texto: 'Una empresa abre una sucursal casi cada mes y quiere que cada cuenta de AWS nueva nazca ya dentro de la OU correcta, con CloudTrail encendido y con los controles de la empresa, sin configurarla a mano. ¿Qué usa?',
    opciones: [
      'AWS Organizations solo, creando cada cuenta con «Add an AWS account»',
      'AWS Budgets, con un presupuesto por cada cuenta nueva',
      'El Account Factory de AWS Control Tower',
      'AWS Config, con una regla en cada cuenta'
    ],
    correcta: 2,
    explicacion: 'Control Tower monta una landing zone sobre Organizations, y su Account Factory crea cuentas nuevas ya configuradas y con los controles (preventivos, de detección y proactivos) que la empresa definió. Organizations sola crea la cuenta, pero vacía: lo demás se haría a mano.'
  },
  {
    id: 'p05',
    tema: 'Cuentas y límites',
    sesion: 12,
    concepto: 'AWS License Manager',
    texto: 'Una empresa trae a AWS sus licencias de Microsoft SQL Server (BYOL) y su contrato solo le permite usarlas en 40 núcleos. Quiere llevar la cuenta de esas licencias y que AWS impida lanzar servidores que se pasen del límite. ¿Qué servicio usa?',
    opciones: [
      'AWS License Manager',
      'AWS Artifact',
      'Los chequeos de límites de Trusted Advisor',
      'AWS Budgets'
    ],
    correcta: 0,
    explicacion: 'AWS License Manager lleva la cuenta de las licencias de software que traes (Microsoft, Oracle, SAP…) y puede bloquear los lanzamientos que rompan las reglas de tu contrato. Los límites que revisa Trusted Advisor son las cuotas de servicio de AWS, no tus licencias.'
  },
  {
    id: 'p06',
    tema: 'Cuentas y límites',
    sesion: 12,
    concepto: 'Service Quotas',
    texto: 'Antes de lanzar su app de pedidos, una cadena de cafeterías quiere ver cuántas instancias EC2 le permite AWS correr en la región y pedir que le suban ese límite desde la consola. ¿Qué servicio usa?',
    opciones: [
      'AWS Budgets',
      'Service Quotas',
      'AWS License Manager',
      'AWS Compute Optimizer'
    ],
    correcta: 1,
    explicacion: 'Service Quotas muestra en un solo lugar los límites (cuotas) de cada servicio en tu cuenta y región, y desde ahí pides un aumento. Budgets vigila el gasto, License Manager cuenta tus licencias de software y Compute Optimizer recomienda tamaños.'
  },
  {
    id: 'p07',
    tema: 'Gasto a la vista',
    sesion: 12,
    concepto: 'Alertas y acciones de AWS Budgets',
    texto: 'La contadora de una cadena de cafeterías quiere que AWS Budgets haga algo más que mandarle un correo cuando el gasto ya se pasó. ¿Qué dos cosas puede hacer un presupuesto de AWS Budgets? (Elige DOS.)',
    opciones: [
      'Recomendar el tipo de instancia justo para cada servidor',
      'Avisar cuando el gasto pronosticado del mes vaya a pasar del monto',
      'Dejar de cobrar todo lo que pase del monto del presupuesto',
      'Ejecutar una acción, como aplicar una SCP o detener instancias EC2',
      'Mostrar en gráficas el gasto por servicio de los últimos meses'
    ],
    correcta: [1, 3],
    elige: 2,
    explicacion: 'Budgets avisa por el gasto real o por el pronosticado, y sus acciones pueden aplicar una política de IAM o una SCP, o detener instancias EC2 y RDS cuando se cruza el umbral. AWS no deja de cobrar al llegar al monto. Las gráficas son de Cost Explorer, y el tamaño justo, de Compute Optimizer.'
  },
  {
    id: 'p08',
    tema: 'Gasto a la vista',
    sesion: 12,
    concepto: 'Activar una etiqueta tarda',
    texto: 'Un equipo activó la llave Ambiente como etiqueta de asignación de costos hace una hora, y todavía no puede agrupar el gasto por ella en Cost Explorer. ¿Qué es lo más probable?',
    opciones: [
      'Las etiquetas de costos solo funcionan con el plan de soporte Enterprise',
      'Cost Explorer no agrupa el gasto por etiquetas, solo por servicio',
      'La activación puede tardar hasta 24 horas en verse',
      'Hay que borrar los recursos y volver a crearlos con la etiqueta puesta'
    ],
    correcta: 2,
    explicacion: 'Después de activar una etiqueta de asignación de costos, AWS puede tardar hasta 24 horas en procesarla. Luego Cost Explorer agrupa y filtra por ella. Funciona con cualquier plan de soporte y no hace falta volver a crear nada.'
  },
  {
    id: 'p09',
    tema: 'Gasto a la vista',
    sesion: 7,
    concepto: 'Compute Savings Plans',
    texto: 'Los pedidos en línea de una cafetería necesitarán servidores encendidos todo el día durante al menos un año, pero el equipo quizá cambie de familia de instancias o pase parte del trabajo a AWS Lambda. ¿Qué forma de pago le da descuento sin amarrarlo a un tipo de instancia?',
    opciones: [
      'Instancias On-Demand, que no tienen ningún compromiso',
      'Instancias Spot, que AWS puede interrumpir',
      'Un EC2 Instance Savings Plan de la familia t3',
      'Un Compute Savings Plan a 1 año'
    ],
    correcta: 3,
    explicacion: 'Un Compute Savings Plan da descuento a cambio de comprometer un gasto por hora durante 1 o 3 años, y se aplica a EC2 de cualquier familia, tamaño o región, a Fargate y a Lambda. El EC2 Instance Savings Plan descuenta más, pero lo amarra a una familia en una región. On-Demand no tiene descuento.'
  },
  {
    id: 'p10',
    tema: 'Pagar lo justo',
    sesion: 12,
    concepto: 'IP elásticas que no se usan',
    texto: 'Una empresa apartó tres direcciones IP elásticas para unas sucursales que nunca abrieron, y siguen sin asociarse a nada. ¿Qué le conviene hacer?',
    opciones: [
      'Liberarlas: cada IPv4 pública se cobra por hora, se use o no',
      'Dejarlas así: una IP elástica que no está asociada a nada no cuesta',
      'Asociarlas a una instancia detenida para que dejen de cobrarse',
      'Ponerles una etiqueta para que Cost Explorer no las cuente'
    ],
    correcta: 0,
    explicacion: 'Desde febrero de 2024, AWS cobra cada dirección IPv4 pública por hora, esté asociada o no. Una IP elástica que no se va a usar se libera para dejar de pagarla. Una etiqueta solo sirve para repartir el gasto, no lo quita.'
  },
  {
    id: 'p11',
    tema: 'Pagar lo justo',
    sesion: 12,
    concepto: 'AWS Compute Optimizer',
    texto: 'Una empresa tiene 60 instancias EC2 y varias funciones Lambda, y quiere que AWS le recomiende con aprendizaje automático, según sus métricas reales de uso, cuáles están sobradas o escasas y qué tamaño les conviene. ¿Qué servicio activa?',
    opciones: [
      'AWS Pricing Calculator',
      'AWS Cost Anomaly Detection',
      'AWS Compute Optimizer',
      'Amazon EC2 Auto Scaling'
    ],
    correcta: 2,
    explicacion: 'AWS Compute Optimizer analiza las métricas de CloudWatch (14 días por omisión) y recomienda el tamaño justo de instancias EC2, grupos de Auto Scaling, volúmenes EBS, funciones Lambda y bases RDS. La calculadora estima antes de crear, y Cost Anomaly Detection avisa de gastos raros.'
  },
  {
    id: 'p12',
    tema: 'Pagar lo justo',
    sesion: 12,
    concepto: 'Cambiar el tipo de una instancia',
    texto: 'El servidor m5.large de una cadena de cafeterías casi no usa CPU. El equipo quiere pasarlo a un tipo más barato sin perder su configuración ni sus discos EBS. ¿Qué hace?',
    opciones: [
      'Lo termina y lanza una instancia nueva del tipo más barato con la misma AMI',
      'Lo detiene, le cambia el tipo de instancia y lo vuelve a encender',
      'Le cambia el tipo con la instancia encendida, sin detenerla',
      'Le compra una instancia reservada del mismo tipo m5.large'
    ],
    correcta: 1,
    explicacion: 'En una instancia respaldada por EBS, el tipo se cambia con la instancia detenida (Stop → Change instance type → Start). Conserva su id, sus discos y su configuración. Terminarla borra la instancia, y una reserva abarata el tipo que sobra en vez de ajustarlo.'
  },
  {
    id: 'p13',
    tema: 'Pagar lo justo',
    sesion: 7,
    concepto: 'Trusted Advisor con el plan Basic',
    texto: 'Una cuenta que solo tiene el plan de soporte Basic abre AWS Trusted Advisor. ¿Qué chequeos encuentra disponibles?',
    opciones: [
      'Todos los chequeos de todas las categorías, igual que con Enterprise',
      'Ninguno: Trusted Advisor solo existe a partir de Business Support+',
      'Solo los chequeos de optimización de costos',
      'Chequeos de seguridad esenciales y de cuotas de servicio'
    ],
    correcta: 3,
    explicacion: 'Con Basic, Trusted Advisor ofrece los chequeos de seguridad esenciales (como el MFA de la raíz, los puertos abiertos o los snapshots públicos) y los de cuotas de servicio. El resto de los chequeos, incluidos los de costos, llega con los planes de pago.'
  },
  {
    id: 'p14',
    tema: 'Soporte y ayuda',
    sesion: 12,
    concepto: 'AWS re:Post',
    texto: 'Un programador tiene una duda sobre cómo configurar un bucket de S3 y quiere preguntarle gratis a la comunidad de AWS, sin abrir un caso de soporte. ¿Dónde pregunta?',
    opciones: [
      'AWS re:Post',
      'AWS Professional Services',
      'Con el Technical Account Manager (TAM)',
      'AWS Health Dashboard'
    ],
    correcta: 0,
    explicacion: 'AWS re:Post es la comunidad gratuita de preguntas y respuestas de AWS, con su Knowledge Center de dudas comunes. Professional Services y el TAM son personas de AWS que se contratan, y el Health Dashboard informa de fallas y eventos.'
  },
  {
    id: 'p15',
    tema: 'Soporte y ayuda',
    sesion: 12,
    concepto: 'Professional Services y la Partner Network',
    texto: 'Una cadena de cafeterías quiere que un equipo de personas expertas le ayude a migrar su sistema de cobro a AWS. ¿Qué dos opciones le dan gente que trabaje en su proyecto? (Elige DOS.)',
    opciones: [
      'AWS Professional Services',
      'AWS re:Post, que asigna un ingeniero de AWS a tu proyecto',
      'El plan de soporte Basic, que incluye un arquitecto asignado',
      'AWS Health Dashboard',
      'Una consultora de la AWS Partner Network (APN)'
    ],
    correcta: [0, 4],
    elige: 2,
    explicacion: 'AWS Professional Services es el equipo de expertos de la propia AWS para proyectos como una migración, y la AWS Partner Network reúne consultoras validadas por AWS. re:Post es una comunidad de preguntas, Basic no incluye a nadie asignado y el Health Dashboard solo informa.'
  },
  {
    id: 'p16',
    tema: 'Soporte y ayuda',
    sesion: 12,
    concepto: 'Your account health',
    texto: 'AWS va a retirar el hardware donde corre una de tus instancias y te pide moverla antes de cierta fecha. ¿Dónde aparece ese aviso, junto con los demás eventos programados de tus recursos?',
    opciones: [
      'En AWS Trusted Advisor, en la categoría de rendimiento',
      'En AWS CloudTrail, como un evento de administración',
      'En AWS Health Dashboard, en Your account health',
      'En AWS Cost Explorer, junto al pronóstico del mes'
    ],
    correcta: 2,
    explicacion: 'El AWS Health Dashboard tiene dos partes: Service health, con el estado público de cada servicio, y Your account health (antes Personal Health Dashboard), con las fallas y los mantenimientos programados que tocan tus propios recursos. CloudTrail registra lo que hacen tus usuarios.'
  },
  {
    id: 'p17',
    tema: 'Soporte y ayuda',
    sesion: 7,
    concepto: 'Lo que incluye el plan Basic',
    texto: 'Un sábado se cae la API de cobro de una cadena de cafeterías. Su cuenta solo tiene el plan de soporte Basic. ¿Qué puede hacer con AWS Support?',
    opciones: [
      'Abrir un caso técnico con respuesta en menos de 1 hora',
      'Abrir casos de cuenta y facturación, pero no casos técnicos',
      'Llamar a su Technical Account Manager asignado',
      'Pedirle a AWS Professional Services que lo arregle sin costo extra'
    ],
    correcta: 1,
    explicacion: 'Basic es gratis e incluye atención de cuenta y facturación, la documentación, re:Post, el Health Dashboard y los chequeos esenciales de Trusted Advisor. Para abrir casos técnicos hace falta un plan de pago, y el TAM llega con Enterprise o superior.'
  },
  {
    id: 'p18',
    tema: 'Seguridad y revisión',
    sesion: 12,
    concepto: 'Snapshot de RDS público',
    texto: 'Trusted Advisor avisa que el snapshot manual de la base de clientes en Amazon RDS es público. El equipo necesita conservar ese respaldo. ¿Qué hace?',
    opciones: [
      'Borrar el snapshot y crear otro, porque uno público ya no se puede cambiar',
      'Cifrar la base original para que su snapshot deje de ser público',
      'Mover la base de datos a una subred privada',
      'Cambiar cómo se comparte el snapshot a privado, sin borrarlo'
    ],
    correcta: 3,
    explicacion: 'Un snapshot público lo puede copiar o restaurar cualquier cuenta de AWS. Se arregla en sus opciones para compartir (Share snapshot → Private), sin borrarlo. Cifrar la base o moverla de subred no cambia quién puede usar un snapshot que ya existe.'
  },
  {
    id: 'p19',
    tema: 'Seguridad y revisión',
    sesion: 12,
    concepto: 'Milestones de Well-Architected Tool',
    texto: 'Una empresa contestó la revisión de su carga de trabajo en AWS Well-Architected Tool y quiere guardar cómo estaba hoy para compararla con la siguiente revisión, dentro de seis meses. ¿Qué crea?',
    opciones: [
      'Un milestone de la carga de trabajo',
      'Un snapshot de EBS de sus servidores',
      'Un reporte guardado de Cost Explorer',
      'Una versión nueva del framework Well-Architected'
    ],
    correcta: 0,
    explicacion: 'Un milestone guarda el estado de una carga de trabajo en la Well-Architected Tool (respuestas y riesgos) en un momento dado, para ver después cuánto mejoró. La herramienta es gratis y se usa desde la consola.'
  },
  {
    id: 'p20',
    tema: 'Seguridad y revisión',
    sesion: 2,
    concepto: 'SSH abierto al mundo',
    texto: 'Trusted Advisor marca en rojo que el grupo de seguridad de un servidor web permite el puerto 22 desde 0.0.0.0/0. Los clientes deben seguir entrando a la página por HTTP. ¿Qué cambio lo resuelve?',
    opciones: [
      'Borrar todas las reglas de entrada del grupo de seguridad',
      'Agregar al grupo una regla que niegue el 22 desde 0.0.0.0/0',
      'Quitar la regla del 22 o limitarla a la IP del administrador (/32)',
      'Cerrar el puerto 80 y dejar abierto el 22'
    ],
    correcta: 2,
    explicacion: 'Los grupos de seguridad solo tienen reglas que permiten, así que no se puede agregar una que niegue: se quita la regla del 22 o se limita a una IP conocida. Borrar todas las reglas también cerraría el puerto 80 a los clientes.'
  }
];
