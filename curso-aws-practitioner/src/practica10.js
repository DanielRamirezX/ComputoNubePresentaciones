// El examen de práctica de la sesión 10 (Práctica 2: la clínica y sus
// expedientes): 20 preguntas nuevas al estilo del examen AWS Certified Cloud
// Practitioner (CLF-C02), todas del dominio de seguridad y cumplimiento.
//
// - Mitad sobre el caso (IAM, MFA, roles, KMS, Secrets Manager, S3, RDS, EBS y
//   CloudTrail) y mitad sobre los servicios que agrega la lección s10-examen
//   (Shield, WAF, Firewall Manager, el reporte de credenciales, CloudHSM,
//   GuardDuty, Inspector, Macie, Config, Detective, Cognito, IAM Identity Center y Artifact).
// - `sesion` dice de qué sesión de la Ruta sale cada pregunta: 2, 4 y 5 para
//   lo que ya se vio ahí, 10 para lo nuevo de hoy.
// - Dos son de respuesta múltiple («Elige DOS», 5 opciones), como en el examen
//   real. Las otras 18 llevan la clave balanceada (A 5, B 4, C 5, D 4, sin
//   rachas de tres) y la correcta casi nunca es la opción más larga.
// - Ninguna repite el escenario de otro banco de la Ruta: por ejemplo, el
//   reporte SOC 2, el tablero de Security Hub, el HSM bancario o la llave de
//   SSE-KMS de la clínica ya salen en las sesiones 2 y 8.
// - Datos revisados en la documentación de AWS (noviembre de 2026).
//
// Corre `npm run verificar` si cambias algo.

export const TEMAS = ['Identidades y accesos', 'Cifrado y secretos', 'Datos y red de la clínica', 'Detección y cumplimiento', 'Defensa de la red'];

// 20 preguntas en 15 minutos, con la escala del examen real (700 de 1000).
export const MINUTOS = 15;
export const ESCALA = { maximo: 1000, aprueba: 700 };

// Qué lecciones de la Ruta repasar cuando un tema sale bajo.
export const REPASO = {
  'Identidades y accesos': ['s10-caso', 's10-examen', 's2-identidades', 's2-politicas'],
  'Cifrado y secretos': ['s10-caso', 's10-practica', 's2-servicios', 's10-examen'],
  'Datos y red de la clínica': ['s10-practica', 's4-seguridad', 's4-s3', 's4-discos', 's5-relacionales'],
  'Detección y cumplimiento': ['s10-examen', 's10-ex-servicio', 's2-servicios'],
  'Defensa de la red': ['s10-examen', 's2-servicios', 's3-vpc']
};

// Lo que se muestra antes de empezar y en el desplegable de cada pregunta.
export const CASO = `
  <p>Este examen se parece al de la certificación <strong>AWS Certified Cloud Practitioner (CLF-C02)</strong>. Todo es del dominio de <strong>seguridad y cumplimiento</strong>, el segundo más pesado del examen (30&nbsp;%).</p>
  <ul>
    <li>En el examen real son <strong>65 preguntas en 90 minutos</strong> y se aprueba con <strong>700 de 1000</strong>. Hoy son 20 en unos 15 minutos.</li>
    <li>Busca la <strong>palabra clave</strong>: “DDoS”, “inyección SQL”, “vulnerabilidades”, “datos personales en S3”, “actividad sospechosa”, “quién hizo qué”, “usuarios de la app”, “reporte de cumplimiento”…</li>
    <li>Las de <strong>respuesta múltiple</strong> dicen «(Elige DOS.)» y solo cuentan si marcas las dos correctas.</li>
  </ul>`;

export const PREGUNTAS = [
  {
    id: 'p01',
    tema: 'Identidades y accesos',
    sesion: 2,
    concepto: 'MFA',
    texto: 'Alguien consiguió la contraseña de consola del encargado de sistemas de una clínica, pero aun así no pudo entrar a la cuenta de AWS. ¿Qué control lo detuvo con más probabilidad?',
    opciones: [
      'Una política de contraseñas que exige 14 caracteres',
      'La autenticación multifactor (MFA) del usuario',
      'Un trail de AWS CloudTrail que registró el intento',
      'El bloqueo de acceso público de los buckets de S3'
    ],
    correcta: 1,
    explicacion: 'Con MFA, la contraseña sola no basta: también se necesita el código del dispositivo del usuario. La política de contraseñas no ayuda si ya la robaron, y CloudTrail registra, pero no impide.'
  },
  {
    id: 'p02',
    tema: 'Datos y red de la clínica',
    sesion: 10,
    concepto: 'S3 Object Lock',
    texto: 'Una norma obliga a conservar cada expediente guardado en S3 durante cinco años, y exige que en ese plazo nadie, ni siquiera el usuario raíz, pueda borrarlo ni sobrescribirlo. ¿Qué se configura en el bucket?',
    opciones: [
      'El versionado del bucket',
      'Una regla de ciclo de vida que los pase a S3 Glacier Deep Archive',
      'El bloqueo de acceso público en todas sus opciones',
      'S3 Object Lock en modo compliance con retención de cinco años'
    ],
    correcta: 3,
    explicacion: 'S3 Object Lock guarda los objetos en modo WORM (se escriben una vez y no se cambian). En modo compliance nadie, ni la raíz, puede borrarlos ni acortar la retención. El versionado ayuda a recuperar, pero alguien con permisos puede borrar versiones.'
  },
  {
    id: 'p03',
    tema: 'Detección y cumplimiento',
    sesion: 10,
    concepto: 'Amazon GuardDuty',
    texto: 'Una clínica quiere enterarse si sus llaves de acceso se usan desde un país donde no opera o si una instancia empieza a minar criptomonedas, sin instalar agentes en sus servidores. ¿Qué servicio activa?',
    opciones: [
      'Amazon GuardDuty',
      'Amazon Inspector',
      'AWS Config y sus reglas',
      'Amazon Macie'
    ],
    correcta: 0,
    explicacion: 'GuardDuty detecta amenazas analizando los eventos de CloudTrail, el tráfico de la VPC (Flow Logs) y las consultas DNS, sin instalar nada. Inspector busca software vulnerable, Config revisa configuraciones y Macie busca datos sensibles en S3.'
  },
  {
    id: 'p04',
    tema: 'Defensa de la red',
    sesion: 10,
    concepto: 'AWS WAF (reglas por frecuencia)',
    texto: 'Un robot manda miles de intentos por minuto al formulario de inicio de sesión de un portal de citas, siempre desde las mismas direcciones IP. El portal está detrás de un Application Load Balancer. ¿Qué bloquea esas peticiones en cuanto pasan de un límite?',
    opciones: [
      'AWS Shield Standard, que ya viene activado',
      'Una Network ACL que niegue todo el puerto 443',
      'Una regla basada en frecuencia (rate-based) de AWS WAF en el balanceador',
      'Un escaneo de Amazon Inspector sobre el balanceador'
    ],
    correcta: 2,
    explicacion: 'AWS WAF revisa cada petición HTTP que llega al ALB, CloudFront o API Gateway, y una regla rate-based bloquea las IP que pasan de cierto número de peticiones. Negar el 443 en la NACL dejaría fuera a todos los pacientes.'
  },
  {
    id: 'p05',
    tema: 'Identidades y accesos',
    sesion: 2,
    concepto: 'Mínimo privilegio',
    texto: 'Una auditora interna debe revisar quién hizo qué en la cuenta de AWS, pero no debe cambiar nada ni poder abrir los expedientes de los pacientes que están en S3. ¿Qué acceso le das?',
    opciones: [
      'Un grupo con AWSCloudTrail_ReadOnlyAccess, con ella como miembro',
      'La política ReadOnlyAccess, porque solo permite leer',
      'AdministratorAccess, siempre que tenga MFA activado',
      'Las credenciales del usuario raíz, solo mientras dura la auditoría'
    ],
    correcta: 0,
    explicacion: 'Mínimo privilegio: solo lo que necesita para su trabajo. AWSCloudTrail_ReadOnlyAccess deja ver la actividad sin cambiar nada. ReadOnlyAccess parece inofensiva, pero deja leer todo, incluidos los objetos de los buckets.'
  },
  {
    id: 'p06',
    tema: 'Cifrado y secretos',
    sesion: 10,
    concepto: 'Rotación de llaves de KMS',
    texto: 'Una clínica activa la rotación automática de su llave customer managed de AWS KMS. ¿Qué pasa con los expedientes que ya estaban cifrados antes de la rotación?',
    opciones: [
      'Quedan ilegibles hasta que alguien los vuelva a cifrar a mano',
      'KMS los vuelve a cifrar uno por uno en cada rotación',
      'Se pueden seguir descifrando sin hacer nada: KMS guarda el material anterior',
      'Se borran para que no quede nada cifrado con la llave vieja'
    ],
    correcta: 2,
    explicacion: 'Al rotar, KMS crea material criptográfico nuevo para lo que se cifre desde ese día y conserva el anterior para descifrar lo viejo. La llave mantiene su id y su alias, y no hay que volver a cifrar nada. Por omisión rota cada 365 días.'
  },
  {
    id: 'p07',
    tema: 'Datos y red de la clínica',
    sesion: 5,
    concepto: 'Base de datos privada',
    texto: 'La base de datos de citas de una clínica en Amazon RDS solo debe aceptar conexiones del servidor web y nunca desde internet. ¿Qué combinación lo logra?',
    opciones: [
      'Public access: Yes, con una contraseña larga y cifrado',
      'Public access: No, subredes privadas y un grupo de seguridad que solo deja entrar al grupo del servidor web',
      'Una subred pública con el puerto 3306 abierto a 0.0.0.0/0 y Multi-AZ',
      'Cifrado en reposo con KMS, que por sí solo rechaza conexiones de internet'
    ],
    correcta: 1,
    explicacion: 'Sin acceso público y en subredes privadas, internet no llega a la base. Y con el grupo de seguridad del servidor como origen, solo esas instancias entran al puerto. El cifrado protege los datos guardados, pero no decide quién se conecta.'
  },
  {
    id: 'p08',
    tema: 'Detección y cumplimiento',
    sesion: 10,
    concepto: 'Amazon Inspector',
    texto: 'Tras una noticia sobre una falla grave en una librería de Linux, una clínica quiere saber cuáles de sus instancias EC2 tienen instalada la versión vulnerable y qué tan grave es en cada una. ¿Qué servicio se lo dice?',
    opciones: [
      'Amazon GuardDuty',
      'Amazon Detective',
      'AWS Trusted Advisor',
      'Amazon Inspector'
    ],
    correcta: 3,
    explicacion: 'Amazon Inspector revisa de forma continua el software de las instancias EC2, las imágenes de contenedor y las funciones Lambda contra las vulnerabilidades conocidas (CVE), y les pone una calificación de gravedad.'
  },
  {
    id: 'p09',
    tema: 'Datos y red de la clínica',
    sesion: 4,
    concepto: 'Cifrado de EBS',
    texto: 'Un servidor tiene conectado un volumen EBS que se creó con el cifrado activado. Además de los datos guardados en el volumen, ¿qué otras dos cosas quedan cifradas? (Elige DOS.)',
    opciones: [
      'Los snapshots que se hagan de ese volumen',
      'Los objetos que la instancia sube a Amazon S3',
      'La memoria RAM de la instancia',
      'Los datos que viajan entre la instancia y el volumen',
      'El tráfico entre la instancia y los navegadores de los usuarios'
    ],
    correcta: [0, 3],
    elige: 2,
    explicacion: 'Un volumen EBS cifrado cifra sus datos en reposo, los que viajan entre la instancia y el volumen, los snapshots que salen de él y los volúmenes que se creen con esos snapshots. Lo que sale a S3 o a internet se protege aparte (SSE en S3, TLS en tránsito).'
  },
  {
    id: 'p10',
    tema: 'Identidades y accesos',
    sesion: 10,
    concepto: 'Cognito e IAM Identity Center',
    texto: 'Una clínica tiene dos tipos de personas: pacientes, que crean su propia cuenta en el portal de citas, y empleados, que deben entrar con un solo inicio de sesión a las tres cuentas de AWS de la clínica. ¿Qué servicio usa para cada grupo?',
    opciones: [
      'Pacientes: AWS IAM Identity Center. Empleados: Amazon Cognito.',
      'Pacientes: un usuario de IAM por persona. Empleados: Amazon Cognito.',
      'Pacientes: Amazon Cognito. Empleados: AWS IAM Identity Center.',
      'Ambos: usuarios de IAM que compartan una contraseña por área.'
    ],
    correcta: 2,
    explicacion: 'Amazon Cognito maneja el registro y el inicio de sesión de los usuarios de tus aplicaciones, aunque sean millones. AWS IAM Identity Center da a los empleados un inicio de sesión único para varias cuentas de AWS y aplicaciones.'
  },
  {
    id: 'p11',
    tema: 'Defensa de la red',
    sesion: 10,
    concepto: 'AWS Shield Advanced',
    texto: 'El portal de una clínica sufrió un ataque DDoS muy grande. Ahora quiere un equipo de AWS que la apoye 24/7 durante el ataque y protección contra el aumento de la factura que provoca el escalado por ese tráfico. ¿Qué contrata?',
    opciones: [
      'AWS Shield Advanced',
      'AWS Shield Standard',
      'Amazon GuardDuty',
      'AWS Network Firewall'
    ],
    correcta: 0,
    explicacion: 'Shield Standard protege gratis contra los ataques más comunes. Shield Advanced, de pago, agrega el AWS Shield Response Team (SRT) disponible 24/7, más visibilidad y protección de costos: AWS compensa el cobro extra que causó el ataque.'
  },
  {
    id: 'p12',
    tema: 'Cifrado y secretos',
    sesion: 2,
    concepto: 'AWS Secrets Manager',
    texto: 'El código del portal de una clínica tiene escrita la contraseña de su base de datos. ¿Qué cambio la saca del código y deja que la app la pida al arrancar, cifrada y con registro de cada vez que se lee?',
    opciones: [
      'Escribirla en los datos de usuario (user data) al lanzar la instancia',
      'Guardarla como etiqueta (tag) de la instancia EC2',
      'Mandarla al servidor en un correo con Amazon SNS',
      'Guardarla en AWS Secrets Manager y dejar que el rol de la app la lea'
    ],
    correcta: 3,
    explicacion: 'Secrets Manager guarda el secreto cifrado con KMS; la app lo pide con su rol cuando lo necesita y cada lectura queda en CloudTrail. Además puede rotarlo solo. Los user data y las etiquetas los puede ver cualquiera con acceso a la instancia.'
  },
  {
    id: 'p13',
    tema: 'Detección y cumplimiento',
    sesion: 10,
    concepto: 'AWS Artifact (acuerdos)',
    texto: 'Antes de guardar en AWS datos de salud de pacientes de Estados Unidos, un hospital necesita revisar y aceptar con AWS el acuerdo que pide la ley HIPAA (Business Associate Addendum). ¿Dónde lo hace?',
    opciones: [
      'En AWS Config',
      'En AWS Artifact',
      'En AWS Security Hub',
      'En AWS Trusted Advisor'
    ],
    correcta: 1,
    explicacion: 'AWS Artifact tiene dos partes: Reports, para descargar los reportes de cumplimiento de AWS (SOC, ISO, PCI), y Agreements, para revisar y aceptar acuerdos como el BAA, sin costo.'
  },
  {
    id: 'p14',
    tema: 'Datos y red de la clínica',
    sesion: 4,
    concepto: 'Ciclo de vida a Glacier Deep Archive',
    texto: 'Los expedientes de más de seis meses casi nunca se consultan, pero si un juez pide uno hay que entregarlo en menos de un día. La clínica quiere pagar lo menos posible por guardarlos sin borrar ninguno. ¿Qué hace?',
    opciones: [
      'Una regla de ciclo de vida que los expire (borre) a los 180 días',
      'Dejarlos en S3 Standard y activar el versionado',
      'Una regla de ciclo de vida que los pase a S3 Glacier Deep Archive a los 180 días',
      'Copiarlos a un volumen EBS gp3 y apagar la instancia'
    ],
    correcta: 2,
    explicacion: 'Glacier Deep Archive es la clase más barata de S3 y devuelve un archivo en unas 12 horas (recuperación estándar), así que cumple el plazo de un día. Expirarlos los borraría, y S3 Standard o un disco EBS cuestan mucho más por gigabyte.'
  },
  {
    id: 'p15',
    tema: 'Identidades y accesos',
    sesion: 10,
    concepto: 'Reporte de credenciales de IAM',
    texto: 'Para la auditoría anual, la clínica necesita una lista de todos sus usuarios de IAM que diga si cada uno tiene MFA, cuándo usó su contraseña por última vez y qué tan viejas son sus llaves de acceso. ¿Qué la genera?',
    opciones: [
      'El reporte de credenciales (credential report) de IAM',
      'Un reporte de cumplimiento descargado de AWS Artifact',
      'Un escaneo de Amazon Inspector sobre la cuenta',
      'El tablero de chequeos de AWS Trusted Advisor del plan Basic'
    ],
    correcta: 0,
    explicacion: 'El credential report de IAM es un archivo CSV con todos los usuarios de la cuenta y el estado de sus credenciales: contraseña, MFA, llaves de acceso y su último uso. Es uno de los «reportes de acceso» que menciona la guía del examen. Artifact entrega reportes sobre AWS, no sobre tu cuenta; Inspector busca software vulnerable, y los chequeos de Trusted Advisor del plan Basic solo revisan unos pocos puntos, como el MFA de la raíz.'
  },
  {
    id: 'p16',
    tema: 'Detección y cumplimiento',
    sesion: 10,
    concepto: 'Config y Detective',
    texto: 'El equipo de seguridad de una clínica confunde los servicios de detección. ¿Qué dos afirmaciones son correctas? (Elige DOS.)',
    opciones: [
      'Amazon Inspector encuentra datos personales en los buckets de S3',
      'AWS Config guarda el historial de configuración de los recursos y revisa si cumplen tus reglas',
      'AWS Security Hub bloquea los ataques DDoS antes de que lleguen a la VPC',
      'Amazon GuardDuty instala los parches que faltan en las instancias',
      'Amazon Detective ayuda a investigar la causa de raíz de un hallazgo de seguridad'
    ],
    correcta: [1, 4],
    elige: 2,
    explicacion: 'Config registra cómo está y cómo estaba configurado cada recurso y evalúa reglas de cumplimiento. Detective relaciona usuarios, IP y recursos para investigar un hallazgo. Los datos personales en S3 los busca Macie, el DDoS lo frena Shield y GuardDuty detecta, pero no parcha.'
  },
  {
    id: 'p17',
    tema: 'Identidades y accesos',
    sesion: 2,
    concepto: 'Roles para EC2',
    texto: '¿Por qué es más seguro darle a una instancia EC2 un rol de IAM que guardar en su disco las llaves de acceso de un usuario?',
    opciones: [
      'Porque un rol le da a la instancia todos los permisos de la cuenta sin configurarlos',
      'Porque el rol entrega credenciales temporales que se renuevan solas',
      'Porque una instancia con rol ya no necesita grupo de seguridad ni subred privada',
      'Porque el rol cifra automáticamente el disco y la memoria de la instancia'
    ],
    correcta: 1,
    explicacion: 'Las credenciales de un rol duran poco y AWS las renueva solo, así que no hay una llave fija que alguien pueda copiar del disco y usar por meses. El rol da solo los permisos de sus políticas; no cifra nada ni sustituye a la red.'
  },
  {
    id: 'p18',
    tema: 'Detección y cumplimiento',
    sesion: 10,
    concepto: 'Amazon Macie',
    texto: '¿En dónde busca Amazon Macie datos sensibles, como nombres, direcciones o números de tarjeta?',
    opciones: [
      'En las tablas de las bases de Amazon RDS',
      'En el tráfico de red que entra y sale de la VPC de la clínica',
      'En los discos EBS conectados a las instancias',
      'En los objetos guardados en buckets de Amazon S3'
    ],
    correcta: 3,
    explicacion: 'Macie revisa los buckets de Amazon S3: con aprendizaje automático y patrones encuentra datos personales o financieros, y además avisa si un bucket es público o no está cifrado.'
  },
  {
    id: 'p19',
    tema: 'Cifrado y secretos',
    sesion: 10,
    concepto: 'CloudHSM y KMS',
    texto: '¿Qué distingue a AWS CloudHSM de AWS KMS?',
    opciones: [
      'CloudHSM no cuesta nada y KMS cobra por cada llave',
      'Solo CloudHSM puede cifrar los objetos de Amazon S3',
      'CloudHSM da HSM dedicados de un solo inquilino, y solo el cliente administra sus llaves',
      'KMS guarda contraseñas y CloudHSM guarda certificados TLS'
    ],
    correcta: 2,
    explicacion: 'CloudHSM te da módulos de seguridad de hardware dedicados a ti: tú administras las llaves y sus usuarios, y AWS no tiene acceso a ellas. KMS es un servicio compartido y administrado por AWS, más sencillo, que se integra con S3, EBS, RDS y casi todo.'
  },
  {
    id: 'p20',
    tema: 'Detección y cumplimiento',
    sesion: 10,
    concepto: 'Validación de los registros de CloudTrail',
    texto: 'Un auditor quiere pruebas de que nadie modificó ni borró los archivos de registro de CloudTrail después de que AWS los entregó en el bucket. ¿Qué se activa en el trail?',
    opciones: [
      'La validación de integridad de los archivos de registro (log file validation)',
      'Activar CloudTrail Insights, que detecta llamadas a la API fuera de lo normal',
      'Los eventos de datos de S3, para anotar cada lectura de objetos',
      'Que el trail registre todas las regiones de la cuenta'
    ],
    correcta: 0,
    explicacion: 'Con log file validation, CloudTrail entrega cada hora un archivo resumen (digest) firmado con los hashes de los registros. Con él se comprueba si algún archivo se cambió o se borró después de entregarse.'
  }
];
