// El examen de la sesión 2 (identidad y seguridad) es ACUMULATIVO: 25 preguntas
// al estilo del examen AWS Certified Cloud Practitioner (CLF-C02). Las primeras
// 15 son de la sesión de hoy (3 por tema) y las últimas 10 repasan lo anterior:
// 5 de fundamentos de la nube (el curso «Comprender la computación en la nube»)
// y 5 de la sesión 1 (infraestructura global y EC2). Así el docente ve en el
// panel, tema por tema, qué se quedó y qué hay que volver a explicar.
//
// Mismas reglas que el banco de la sesión 1 (ver src/practica.js): la respuesta
// correcta vive solo en el servidor, la clave está balanceada (6 o 7 por letra,
// sin rachas de tres) y cada distractor es una confusión real.
// Corre `npm run verificar` si cambias algo.

export const TEMAS = [
  'Identidades de IAM',
  'Políticas y permisos',
  'Responsabilidad y cumplimiento',
  'Servicios de seguridad',
  'Seguridad de la red',
  'Repaso: fundamentos de la nube',
  'Repaso: EC2 e infraestructura'
];

// Qué repasar cuando un tema sale bajo: actividades de esta sesión o de las
// anteriores. Lo que no es un id de actividad se imprime tal cual en el reporte.
export const REPASO = {
  'Identidades de IAM': ['s2-identidades', 's2-ex-identidades'],
  'Políticas y permisos': ['s2-politicas', 's2-lab-seguridad'],
  'Responsabilidad y cumplimiento': ['s2-responsabilidad', 's2-ex-responsabilidad'],
  'Servicios de seguridad': ['s2-servicios', 's2-lab-seguridad'],
  'Seguridad de la red': ['s2-servicios', 's2-ex-sg-nacl'],
  'Repaso: fundamentos de la nube': ['el curso Comprender la computación en la nube (capítulos 1 y 2)'],
  'Repaso: EC2 e infraestructura': ['s1-global', 's1-ec2', 's1-precios']
};

// Lo que se muestra antes de empezar y en el desplegable de cada pregunta.
export const CASO = `
  <p>Este examen se parece al de la certificación <strong>AWS Certified Cloud Practitioner (CLF-C02)</strong> y es <strong>acumulativo</strong>, como el real.</p>
  <ul>
    <li>Las primeras <strong>15 preguntas</strong> son de hoy (identidad y seguridad). Las últimas <strong>10</strong> repasan las clases anteriores: fundamentos de la nube, regiones y EC2.</li>
    <li>En el examen real son <strong>65 preguntas en 90 minutos</strong> y se aprueba con <strong>700 de 1000</strong>. La seguridad es el <strong>30&nbsp;%</strong>.</li>
    <li>Busca la <strong>palabra clave</strong>: “quién hizo qué”, “credenciales temporales”, “rotar automáticamente”, “puede interrumpirse”…</li>
    <li>Si dos respuestas parecen correctas, en seguridad gana la que da <strong>menos permisos</strong>.</li>
  </ul>`;

export const PREGUNTAS = [
  {
    id: 'p01',
    concepto: 'Proteger el usuario raíz',
    tema: 'Identidades de IAM',
    texto: 'Una empresa acaba de abrir su cuenta de AWS. ¿Qué debe hacer primero con el usuario raíz?',
    opciones: [
      'Crearle llaves de acceso para automatizar las tareas de todos los días',
      'Activarle MFA y usar otro usuario para el trabajo diario',
      'Compartir su contraseña con el equipo de TI',
      'Borrarlo para que nadie pueda usarlo'
    ],
    correcta: 1,
    explicacion: 'El usuario raíz puede todo. Se protege con MFA, no se le crean llaves de acceso y se usa solo para las pocas tareas que lo exigen. No se puede borrar.'
  },
  {
    id: 'p02',
    concepto: 'Credenciales para una instancia EC2',
    tema: 'Identidades de IAM',
    texto: 'Una aplicación en EC2 necesita leer archivos de un bucket de S3. ¿Cuál es la forma más segura de darle acceso?',
    opciones: [
      'Escribir llaves de acceso de un usuario en el código',
      'Guardar la contraseña del usuario raíz en la instancia',
      'Hacer público el bucket para que cualquiera lo lea',
      'Asignarle a la instancia un rol de IAM con permiso de lectura'
    ],
    correcta: 3,
    explicacion: 'Un rol da credenciales temporales que AWS rota solas. Así no hay llaves escritas en el código que alguien pueda robar.'
  },
  {
    id: 'p03',
    concepto: 'Inicio de sesión único entre cuentas',
    tema: 'Identidades de IAM',
    texto: 'Los empleados de una empresa con 15 cuentas de AWS deben entrar a todas con un solo usuario y contraseña. ¿Qué servicio lo resuelve?',
    opciones: [
      'Amazon Cognito',
      'AWS Artifact',
      'AWS IAM Identity Center',
      'AWS Secrets Manager'
    ],
    correcta: 2,
    explicacion: 'IAM Identity Center da un solo inicio de sesión (SSO) para los empleados en muchas cuentas. Cognito es para los usuarios de tus aplicaciones, no para tus empleados.'
  },
  {
    id: 'p04',
    concepto: 'Denegación implícita',
    tema: 'Políticas y permisos',
    texto: 'Se crea un usuario de IAM nuevo y no se le asigna ninguna política. ¿Qué puede hacer en la cuenta?',
    opciones: [
      'Nada: todo está negado hasta que una política lo permita',
      'Todo, hasta que un administrador le quite los permisos que no necesita',
      'Solo leer, pero no crear ni borrar',
      'Lo mismo que el usuario que lo creó'
    ],
    correcta: 0,
    explicacion: 'Por omisión todo está negado (denegación implícita). Un usuario nuevo empieza sin ningún permiso.'
  },
  {
    id: 'p05',
    concepto: 'Denegación explícita contra permiso',
    tema: 'Políticas y permisos',
    texto: 'Una política de un usuario permite ec2:TerminateInstances y otra política suya lo niega de forma explícita. ¿Qué pasa si intenta terminar una instancia?',
    opciones: [
      'Se permite, porque gana la política que se le asignó más recientemente',
      'No se permite: la denegación explícita siempre gana',
      'Se permite solo si la instancia es suya',
      'AWS le pide que elija cuál de las dos aplicar'
    ],
    correcta: 1,
    explicacion: 'Primero se revisan las denegaciones explícitas. Si una aplica, no importa cuántos permisos haya.'
  },
  {
    id: 'p06',
    concepto: 'Service Control Policies',
    tema: 'Políticas y permisos',
    texto: 'Una empresa quiere impedir que CUALQUIER usuario, incluso los administradores, use ciertos servicios en todas sus cuentas. ¿Qué usa?',
    opciones: [
      'Un grupo de seguridad en cada cuenta',
      'Una política de contraseñas',
      'Una SCP de AWS Organizations',
      'Un rol de IAM en cada cuenta'
    ],
    correcta: 2,
    explicacion: 'Una Service Control Policy pone el techo de lo que se puede hacer en las cuentas de una organización, y aplica a todos, administradores incluidos.'
  },
  {
    id: 'p07',
    concepto: 'Parches en un servicio administrado',
    tema: 'Responsabilidad y cumplimiento',
    texto: 'Una empresa usa Amazon RDS para su base de datos. ¿Quién parcha el motor de base de datos?',
    opciones: [
      'El cliente, igual que en EC2',
      'Nadie: RDS no necesita parches',
      'AWS, porque RDS es un servicio administrado',
      'Un socio de AWS contratado aparte'
    ],
    correcta: 2,
    explicacion: 'En servicios administrados como RDS, AWS parcha el sistema operativo y el motor. En EC2, en cambio, el sistema operativo es del cliente.'
  },
  {
    id: 'p08',
    concepto: 'AWS Artifact',
    tema: 'Responsabilidad y cumplimiento',
    texto: 'Un auditor pide el reporte SOC 2 de AWS. ¿Dónde lo descarga la empresa?',
    opciones: [
      'En AWS Config',
      'En AWS CloudTrail',
      'En AWS Trusted Advisor',
      'En AWS Artifact'
    ],
    correcta: 3,
    explicacion: 'AWS Artifact entrega, sin costo, los reportes de auditoría y cumplimiento de AWS hechos por terceros (SOC, ISO, PCI).'
  },
  {
    id: 'p09',
    concepto: 'Lo que siempre es del cliente',
    tema: 'Responsabilidad y cumplimiento',
    texto: '¿Qué es responsabilidad del cliente en CUALQUIER servicio de AWS?',
    opciones: [
      'Reemplazar el hardware que falla',
      'Decidir quién tiene acceso a sus datos',
      'Mantener el hipervisor',
      'Proteger la red física entre regiones'
    ],
    correcta: 1,
    explicacion: 'Los datos y quién puede acceder a ellos siempre son del cliente. El hardware, el hipervisor y la red física son de AWS.'
  },
  {
    id: 'p10',
    concepto: 'CloudTrail',
    tema: 'Servicios de seguridad',
    texto: 'Alguien borró un bucket de S3 y hay que saber qué usuario lo hizo y a qué hora. ¿Qué servicio lo muestra?',
    opciones: [
      'AWS CloudTrail',
      'Amazon Inspector',
      'AWS Shield',
      'Amazon Macie'
    ],
    correcta: 0,
    explicacion: 'CloudTrail registra cada llamada a la API de la cuenta: quién, qué, cuándo y desde dónde.'
  },
  {
    id: 'p11',
    concepto: 'Rotación de credenciales',
    tema: 'Servicios de seguridad',
    texto: 'Una aplicación guarda la contraseña de su base de datos y la empresa quiere que cambie automáticamente cada 30 días. ¿Qué servicio usa?',
    opciones: [
      'AWS Certificate Manager',
      'AWS Secrets Manager',
      'Amazon GuardDuty',
      'AWS Artifact'
    ],
    correcta: 1,
    explicacion: 'Secrets Manager guarda secretos cifrados y puede rotarlos automáticamente. Certificate Manager es para certificados SSL/TLS.'
  },
  {
    id: 'p12',
    concepto: 'Detección de amenazas',
    tema: 'Servicios de seguridad',
    texto: '¿Qué servicio analiza registros de la cuenta para detectar actividad maliciosa, como accesos desde direcciones sospechosas?',
    opciones: [
      'AWS Config',
      'AWS Artifact',
      'Amazon GuardDuty',
      'AWS KMS'
    ],
    correcta: 2,
    explicacion: 'GuardDuty detecta amenazas analizando registros como los de CloudTrail y el tráfico de la red. Config revisa la configuración de los recursos.'
  },
  {
    id: 'p13',
    concepto: 'Grupo de seguridad stateful',
    tema: 'Seguridad de la red',
    texto: 'Un grupo de seguridad permite la entrada por el puerto 80. ¿Qué pasa con la respuesta del servidor?',
    opciones: [
      'Se bloquea hasta agregar una regla de salida al puerto 80',
      'Sale sola, porque los grupos de seguridad recuerdan las conexiones',
      'Sale solo si la NACL también tiene una regla de entrada',
      'Sale por el puerto 443 de forma automática'
    ],
    correcta: 1,
    explicacion: 'Los grupos de seguridad son stateful: si una petición entra, su respuesta sale sin otra regla. Las NACL son stateless y sí necesitan ambas reglas.'
  },
  {
    id: 'p14',
    concepto: 'Negar una dirección IP en la subred',
    tema: 'Seguridad de la red',
    texto: 'Hay que bloquear una dirección IP atacante para TODA una subred. ¿Qué se usa?',
    opciones: [
      'Una regla de denegación en la Network ACL de la subred',
      'Una regla de denegación en el grupo de seguridad',
      'Una política de IAM con Deny',
      'Un rol de IAM con permisos limitados'
    ],
    correcta: 0,
    explicacion: 'Las NACL actúan sobre subredes y aceptan reglas de denegación. Los grupos de seguridad solo tienen reglas para permitir.'
  },
  {
    id: 'p15',
    concepto: 'Ataques a aplicaciones web',
    tema: 'Seguridad de la red',
    texto: 'Una tienda en línea recibe intentos de inyección SQL en su formulario de búsqueda. ¿Qué servicio los bloquea?',
    opciones: [
      'Una Network ACL',
      'AWS Shield Standard',
      'Amazon Inspector',
      'AWS WAF'
    ],
    correcta: 3,
    explicacion: 'AWS WAF es un firewall de aplicaciones web: revisa las peticiones HTTP y bloquea patrones como inyección SQL o XSS.'
  },

  /* ------------------------------------------- repaso de clases anteriores */
  {
    id: 'p16',
    concepto: 'CapEx y OpEx',
    tema: 'Repaso: fundamentos de la nube',
    texto: 'Una empresa deja de comprar servidores cada cinco años y ahora paga cada mes solo por lo que usa. ¿Qué cambio describe?',
    opciones: [
      'Pasa de gasto de capital (CapEx) a gasto operativo (OpEx)',
      'Pasa de gasto operativo (OpEx) a gasto de capital (CapEx)',
      'Pasa de una nube pública a una nube privada dentro de su edificio',
      'Pasa de software como servicio a infraestructura como servicio'
    ],
    correcta: 0,
    explicacion: 'La nube cambia CapEx por OpEx: en lugar de una compra grande por adelantado, se paga según el uso, mes con mes.'
  },
  {
    id: 'p17',
    concepto: 'Elasticidad',
    tema: 'Repaso: fundamentos de la nube',
    texto: 'Una tienda recibe diez veces más visitas durante el Buen Fin y vuelve a lo normal una semana después. ¿Qué característica de la nube le permite pagar solo por ese pico?',
    opciones: [
      'Alta disponibilidad',
      'Residencia de los datos',
      'Elasticidad',
      'Responsabilidad compartida'
    ],
    correcta: 2,
    explicacion: 'Elasticidad: los recursos crecen cuando llega la demanda y se encogen cuando se va, y solo se paga lo que se usó. Alta disponibilidad es seguir funcionando aunque algo falle.'
  },
  {
    id: 'p18',
    concepto: 'PaaS',
    tema: 'Repaso: fundamentos de la nube',
    texto: 'Un equipo sube solo su código y el proveedor se encarga de los servidores, el sistema operativo y el entorno de ejecución. ¿Qué modelo de servicio es?',
    opciones: [
      'Infraestructura como servicio (IaaS)',
      'Software como servicio (SaaS)',
      'Centro de datos propio (on-premises)',
      'Plataforma como servicio (PaaS)'
    ],
    correcta: 3,
    explicacion: 'En PaaS tú pones el código y los datos; la plataforma pone lo demás. En IaaS todavía administras el sistema operativo; en SaaS solo usas la aplicación ya hecha.'
  },
  {
    id: 'p19',
    concepto: 'Nube híbrida',
    tema: 'Repaso: fundamentos de la nube',
    texto: 'Un banco deja su sistema central en su propio centro de datos y lo conecta con las aplicaciones nuevas que tiene en AWS. ¿Qué modelo de despliegue usa?',
    opciones: [
      'Nube híbrida',
      'Nube pública',
      'Multinube',
      'Nube privada'
    ],
    correcta: 0,
    explicacion: 'Híbrida = infraestructura propia conectada con una nube pública. Multinube es usar varios proveedores de nube pública a la vez.'
  },
  {
    id: 'p20',
    concepto: 'Reconocer un servicio IaaS',
    tema: 'Repaso: fundamentos de la nube',
    texto: '¿Cuál de estos servicios es un ejemplo de infraestructura como servicio (IaaS)?',
    opciones: [
      'Gmail, el correo de Google',
      'Amazon EC2',
      'Microsoft 365',
      'Netflix'
    ],
    correcta: 1,
    explicacion: 'EC2 renta servidores virtuales y tú administras el sistema operativo: eso es IaaS. Gmail, Microsoft 365 y Netflix son aplicaciones listas para usar (SaaS).'
  },
  {
    id: 'p21',
    concepto: 'Alta disponibilidad con varias zonas',
    tema: 'Repaso: EC2 e infraestructura',
    texto: 'Una aplicación debe seguir funcionando aunque se caiga un centro de datos completo. ¿Qué se hace?',
    opciones: [
      'Cambiarla a un tipo de instancia más grande',
      'Guardar un respaldo del disco cada noche',
      'Elegir la región con el precio más bajo',
      'Repartirla en dos zonas de disponibilidad'
    ],
    correcta: 3,
    explicacion: 'Cada zona de disponibilidad tiene centros de datos separados. Si la aplicación vive en dos zonas, la falla de una no la tumba. Una instancia más grande sigue estando en un solo lugar.'
  },
  {
    id: 'p22',
    concepto: 'Qué decide el tipo de instancia',
    tema: 'Repaso: EC2 e infraestructura',
    texto: 'En la sesión 1 lanzaste una instancia t2.micro. ¿Qué decides al escoger el tipo de instancia?',
    opciones: [
      'Cuánta CPU y memoria tendrá la máquina',
      'El sistema operativo con el que arranca',
      'Los puertos que quedan abiertos a Internet',
      'La región donde se guardarán sus datos'
    ],
    correcta: 0,
    explicacion: 'El tipo de instancia (t2.micro, m5.large…) define el hardware: CPU, memoria y red. El sistema operativo lo define la AMI y los puertos, el grupo de seguridad.'
  },
  {
    id: 'p23',
    concepto: 'Stop contra Terminate',
    tema: 'Repaso: EC2 e infraestructura',
    texto: 'Quieres dejar de pagar el cómputo de una instancia esta noche y seguir usándola mañana con los mismos datos. ¿Qué haces?',
    opciones: [
      'Terminarla (Terminate)',
      'Reiniciarla (Reboot)',
      'Detenerla (Stop)',
      'Quitarle el grupo de seguridad'
    ],
    correcta: 2,
    explicacion: 'Stop apaga la máquina: deja de cobrarse el cómputo y el disco EBS se conserva (ese sí se sigue cobrando). Terminate la borra para siempre.'
  },
  {
    id: 'p24',
    concepto: 'Savings Plans',
    tema: 'Repaso: EC2 e infraestructura',
    texto: 'Una empresa se compromete a gastar cierta cantidad por hora en cómputo durante tres años, a cambio de un descuento de hasta 72 %. ¿Qué opción de compra es?',
    opciones: [
      'On-Demand',
      'Instancias Spot',
      'Dedicated Hosts',
      'Savings Plans'
    ],
    correcta: 3,
    explicacion: 'Savings Plans: compromiso de gasto por hora durante 1 o 3 años a cambio de descuento. Spot también es barato, pero AWS puede interrumpirlo; On-Demand no tiene compromiso ni descuento.'
  },
  {
    id: 'p25',
    concepto: 'Región, zona y punto de presencia',
    tema: 'Repaso: EC2 e infraestructura',
    texto: '¿Qué es una región de AWS?',
    opciones: [
      'Una zona geográfica con varias zonas de disponibilidad',
      'Un solo centro de datos con energía y red de respaldo',
      'Un punto de presencia que guarda copias de contenido cerca del usuario',
      'Una red privada que cada cliente crea dentro de su cuenta'
    ],
    correcta: 0,
    explicacion: 'Una región (por ejemplo us-east-1) es un área geográfica con tres o más zonas de disponibilidad. Los puntos de presencia son de CloudFront y la red privada del cliente es la VPC.'
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
