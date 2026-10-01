// El examen de práctica de la sesión 2 (identidad y seguridad): 20 preguntas
// al estilo del examen AWS Certified Cloud Practitioner (CLF-C02). Mismas
// reglas que el banco de la sesión 1 (ver src/practica.js): la respuesta
// correcta vive solo en el servidor, la clave está balanceada (5 en A, 5 en B,
// 5 en C y 5 en D, sin rachas de tres) y cada distractor es una confusión real.
// Corre `npm run verificar` si cambias algo.

export const TEMAS = [
  'Identidades de IAM',
  'Políticas y permisos',
  'Responsabilidad y cumplimiento',
  'Servicios de seguridad',
  'Seguridad de la red'
];

// Qué lecciones del curso repasar cuando un tema sale bajo.
export const REPASO = {
  'Identidades de IAM': ['s2-identidades', 's2-ex-identidades'],
  'Políticas y permisos': ['s2-politicas', 's2-lab-seguridad'],
  'Responsabilidad y cumplimiento': ['s2-responsabilidad', 's2-ex-responsabilidad'],
  'Servicios de seguridad': ['s2-servicios', 's2-lab-seguridad'],
  'Seguridad de la red': ['s2-servicios', 's2-ex-sg-nacl']
};

// Lo que se muestra antes de empezar y en el desplegable de cada pregunta.
export const CASO = `
  <p>Este examen se parece al de la certificación <strong>AWS Certified Cloud Practitioner (CLF-C02)</strong>. La seguridad es el <strong>30&nbsp;%</strong> del examen real.</p>
  <ul>
    <li>En el examen real son <strong>65 preguntas en 90 minutos</strong> y se aprueba con <strong>700 de 1000</strong>.</li>
    <li>Busca la <strong>palabra clave</strong>: “quién hizo qué”, “credenciales temporales”, “rotar automáticamente”, “datos sensibles”…</li>
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
    concepto: 'Grupos de IAM',
    tema: 'Identidades de IAM',
    texto: 'Treinta analistas necesitan exactamente los mismos permisos. ¿Cómo se administran con menos trabajo?',
    opciones: [
      'Se meten en un grupo y la política se le asigna al grupo',
      'Se le asigna la misma política a cada usuario, uno por uno',
      'Comparten un solo usuario con la misma contraseña',
      'Se crea una cuenta de AWS para cada analista'
    ],
    correcta: 0,
    explicacion: 'Un grupo junta usuarios con los mismos permisos: la política se asigna una vez y todos la heredan. Compartir un usuario impide saber quién hizo qué.'
  },
  {
    id: 'p04',
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
    id: 'p05',
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
    id: 'p06',
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
    id: 'p07',
    concepto: 'Mínimo privilegio',
    tema: 'Políticas y permisos',
    texto: 'Un practicante solo debe consultar facturas. ¿Qué principio se sigue al darle únicamente ese permiso?',
    opciones: [
      'Alta disponibilidad',
      'Defensa en profundidad',
      'Responsabilidad compartida',
      'Mínimo privilegio'
    ],
    correcta: 3,
    explicacion: 'Mínimo privilegio: cada identidad recibe solo los permisos necesarios para su trabajo, ni uno más.'
  },
  {
    id: 'p08',
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
    id: 'p09',
    concepto: 'Seguridad física',
    tema: 'Responsabilidad y cumplimiento',
    texto: 'Según el modelo de responsabilidad compartida, ¿qué es responsabilidad de AWS?',
    opciones: [
      'La seguridad física de los centros de datos',
      'Los permisos de los usuarios de IAM de la cuenta',
      'Las reglas de los grupos de seguridad',
      'El cifrado de los datos del cliente'
    ],
    correcta: 0,
    explicacion: 'AWS se encarga de la seguridad DE la nube: edificios, hardware y red física. Permisos, firewall y cifrado los configura el cliente.'
  },
  {
    id: 'p10',
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
    id: 'p11',
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
    id: 'p12',
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
    id: 'p13',
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
    id: 'p14',
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
    id: 'p15',
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
    id: 'p16',
    concepto: 'Datos sensibles en S3',
    tema: 'Servicios de seguridad',
    texto: 'Una empresa sospecha que hay números de tarjeta de crédito guardados en sus buckets de S3. ¿Qué servicio los encuentra?',
    opciones: [
      'Amazon Inspector',
      'AWS WAF',
      'AWS Shield Advanced',
      'Amazon Macie'
    ],
    correcta: 3,
    explicacion: 'Macie usa aprendizaje automático para descubrir datos personales y sensibles en S3. Inspector busca vulnerabilidades en instancias y contenedores.'
  },
  {
    id: 'p17',
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
    id: 'p18',
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
    id: 'p19',
    concepto: 'Protección contra DDoS',
    tema: 'Seguridad de la red',
    texto: '¿Qué protección contra ataques DDoS reciben todos los clientes de AWS sin pagar nada extra?',
    opciones: [
      'AWS Shield Advanced',
      'AWS Firewall Manager',
      'AWS Shield Standard',
      'Amazon Detective'
    ],
    correcta: 2,
    explicacion: 'Shield Standard viene incluido y es automático. Shield Advanced es de pago y suma un equipo de respuesta y protección de costos.'
  },
  {
    id: 'p20',
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
