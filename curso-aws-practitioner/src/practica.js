// El examen de práctica de la sesión 1: 20 preguntas al estilo del examen
// AWS Certified Cloud Practitioner (CLF-C02). La respuesta correcta vive SOLO
// en el servidor: `practicaPublica()` la quita antes de mandar las preguntas al
// navegador del alumno.
//
// Mismos criterios que los otros bancos de la materia:
//  1. La clave está balanceada: 5 respuestas en A, 5 en B, 5 en C y 5 en D, sin
//     rachas de tres iguales. Corre `npm run verificar` si cambias algo.
//  2. Cada distractor es una confusión real (Stop contra Terminate, región
//     contra zona, Spot contra reservadas), no un absurdo.
//
// `concepto` es el nombre corto de lo que mide cada pregunta: sale en el reporte
// PDF del alumno sin revelar la respuesta correcta.
//
// `fijo: true` = las opciones se muestran siempre en ese orden. En las demás, el
// navegador baraja el orden por alumno para que copiar la letra no sirva.

export const TEMAS = [
  'Infraestructura global',
  'Cómputo con EC2',
  'Ciclo de vida y almacenamiento',
  'Precios de EC2',
  'Seguridad y responsabilidad compartida'
];

// Qué lecciones del curso repasar cuando un tema sale bajo.
export const REPASO = {
  'Infraestructura global': ['s1-global'],
  'Cómputo con EC2': ['s1-ec2', 's1-lab-ec2'],
  'Ciclo de vida y almacenamiento': ['s1-ec2', 's1-lab-ec2'],
  'Precios de EC2': ['s1-precios'],
  'Seguridad y responsabilidad compartida': ['s1-ec2', 's1-ex-responsabilidad']
};

// Lo que se muestra antes de empezar y en el desplegable de cada pregunta.
export const CASO = `
  <p>Este examen se parece al de la certificación <strong>AWS Certified Cloud Practitioner (CLF-C02)</strong>: preguntas cortas con un escenario y cuatro opciones.</p>
  <ul>
    <li>En el examen real son <strong>65 preguntas en 90 minutos</strong> y se aprueba con <strong>700 de 1000</strong>.</li>
    <li>Busca la <strong>palabra clave</strong> del escenario: “alta disponibilidad”, “puede interrumpirse”, “24/7 por tres años”, “la ley exige”…</li>
    <li>Si dudas, descarta primero las opciones imposibles. No dejes ninguna en blanco: adivinar no resta.</li>
  </ul>`;

export const PREGUNTAS = [
  /* ----------------------------------------------- Infraestructura global */
  {
    id: 'p01',
    concepto: 'Elegir región por cercanía',
    tema: 'Infraestructura global',
    texto: 'Una tienda en línea quiere que sus clientes en México tengan la menor latencia posible. ¿Qué debe elegir?',
    opciones: [
      'Una ubicación de borde para ejecutar ahí sus servidores',
      'Una región cercana a sus usuarios, como la de Querétaro',
      'La región con más servicios, sin importar dónde esté',
      'Dos cuentas de AWS en la misma zona de disponibilidad'
    ],
    correcta: 1,
    explicacion: 'Entre más cerca estén los servidores de los usuarios, menor latencia. Las ubicaciones de borde entregan contenido en caché, pero los servidores viven en una región.'
  },
  {
    id: 'p02',
    concepto: 'Qué es una zona de disponibilidad',
    tema: 'Infraestructura global',
    texto: '¿Qué es una zona de disponibilidad (Availability Zone)?',
    opciones: [
      'Un país completo donde AWS vende sus servicios en la nube',
      'Un sitio que guarda copias del contenido cerca de los usuarios',
      'Uno o más centros de datos separados, con energía y red propias, dentro de una región',
      'Una red privada virtual que aísla los recursos de una cuenta de las demás cuentas'
    ],
    correcta: 2,
    explicacion: 'Una zona de disponibilidad es uno o más centros de datos con energía, red y conectividad redundantes, dentro de una región. La red privada es una VPC; el sitio con copias es una ubicación de borde.'
  },
  {
    id: 'p03',
    concepto: 'Alta disponibilidad con varias zonas',
    tema: 'Infraestructura global',
    texto: '¿Por qué conviene repartir una aplicación en dos o más zonas de disponibilidad?',
    opciones: [
      'Para pagar menos por cada hora de cómputo',
      'Para cumplir automáticamente con cualquier ley de datos',
      'Porque AWS lo exige para las instancias de producción',
      'Para que siga disponible si falla un centro de datos'
    ],
    correcta: 3,
    explicacion: 'Las zonas están aisladas entre sí: si una falla, la aplicación sigue atendiendo desde la otra. Eso es alta disponibilidad.'
  },
  {
    id: 'p04',
    concepto: 'Elegir región por cumplimiento',
    tema: 'Infraestructura global',
    texto: 'Una aseguradora europea debe guardar los datos de sus clientes dentro de la Unión Europea. ¿Qué factor decide la región?',
    opciones: [
      'El cumplimiento de la ley sobre dónde viven los datos',
      'El precio por hora de las instancias en cada región',
      'La cantidad de ubicaciones de borde de cada país',
      'La latencia hacia sus clientes que viven en Asia'
    ],
    correcta: 0,
    explicacion: 'Cuando una ley o un contrato dicen dónde deben vivir los datos, el cumplimiento manda sobre la cercanía, los servicios y el precio.'
  },

  /* ------------------------------------------------------ Cómputo con EC2 */
  {
    id: 'p05',
    concepto: 'Qué es Amazon EC2',
    tema: 'Cómputo con EC2',
    texto: '¿Qué servicio de AWS renta servidores virtuales en los que tú administras el sistema operativo?',
    opciones: ['Amazon S3', 'AWS Lambda', 'Amazon EC2', 'Amazon RDS'],
    correcta: 2,
    fijo: true,
    explicacion: 'Amazon EC2 renta instancias (servidores virtuales): es IaaS. S3 guarda archivos, Lambda ejecuta funciones sin servidor y RDS administra bases de datos.'
  },
  {
    id: 'p06',
    concepto: 'La AMI',
    tema: 'Cómputo con EC2',
    texto: '¿Qué define el sistema operativo y el software con el que arranca una instancia?',
    opciones: ['El tipo de instancia', 'La AMI (Amazon Machine Image)', 'El grupo de seguridad', 'El par de llaves'],
    correcta: 1,
    explicacion: 'La AMI es la plantilla de arranque. El tipo define CPU y memoria; el grupo de seguridad, el tráfico permitido; el par de llaves, el acceso por SSH.'
  },
  {
    id: 'p07',
    concepto: 'Cómo leer un tipo de instancia',
    tema: 'Cómputo con EC2',
    texto: 'En el tipo de instancia t3.micro, ¿qué indica la palabra “micro”?',
    opciones: [
      'El tamaño: cuántos vCPU y cuánta memoria tiene',
      'La generación del procesador que usa',
      'La familia de propósito general a la que pertenece',
      'La región en la que está disponible ese tipo'
    ],
    correcta: 0,
    explicacion: 'En t3.micro, “t” es la familia, “3” la generación y “micro” el tamaño.'
  },
  {
    id: 'p08',
    concepto: 'Datos de usuario',
    tema: 'Cómputo con EC2',
    texto: 'Quieres que una instancia instale un servidor web sola la primera vez que arranca. ¿Dónde pones el script?',
    opciones: [
      'En las etiquetas (tags) de la instancia',
      'En las reglas del grupo de seguridad',
      'En el nombre del volumen EBS',
      'En los datos de usuario (user data)'
    ],
    correcta: 3,
    explicacion: 'Los datos de usuario son un script que la instancia ejecuta al arrancar por primera vez. Es lo que usaste en el laboratorio.'
  },

  /* ------------------------------------------ Ciclo de vida y almacenamiento */
  {
    id: 'p09',
    concepto: 'Qué se cobra con la instancia detenida',
    tema: 'Ciclo de vida y almacenamiento',
    texto: 'Detuviste (Stop) una instancia que tiene un volumen EBS. ¿Qué se te sigue cobrando?',
    opciones: [
      'Las horas de cómputo, como si siguiera encendida',
      'La transferencia de datos de la consola web',
      'El almacenamiento de su volumen EBS',
      'Nada: detener es lo mismo que eliminar'
    ],
    correcta: 2,
    explicacion: 'Detenida no cobra cómputo, pero el volumen EBS sigue existiendo y se cobra por GB al mes.'
  },
  {
    id: 'p10',
    concepto: 'Qué hace Terminate',
    tema: 'Ciclo de vida y almacenamiento',
    texto: '¿Qué pasa al terminar (Terminate) una instancia con la configuración predeterminada?',
    opciones: [
      'Se apaga y puedes volver a encenderla cuando quieras',
      'Se elimina, y su volumen raíz EBS también se borra',
      'Se convierte en una AMI que puedes volver a usar',
      'Se mueve a otra zona de disponibilidad más barata'
    ],
    correcta: 1,
    explicacion: 'Terminate elimina la instancia para siempre y, por omisión, también su volumen raíz (Delete on termination).'
  },
  {
    id: 'p11',
    concepto: 'Amazon EBS',
    tema: 'Ciclo de vida y almacenamiento',
    texto: '¿Qué servicio ofrece discos persistentes que se conectan a una instancia EC2?',
    opciones: ['Amazon S3 Glacier', 'Amazon CloudFront', 'AWS Snowball', 'Amazon EBS'],
    correcta: 3,
    explicacion: 'Amazon EBS (Elastic Block Store) son los discos de las instancias. Glacier archiva datos, CloudFront entrega contenido y Snowball mueve datos en un dispositivo físico.'
  },
  {
    id: 'p12',
    concepto: 'La IP pública al detener y encender',
    tema: 'Ciclo de vida y almacenamiento',
    texto: 'Detienes y vuelves a encender una instancia que no tiene IP elástica. ¿Qué cambia normalmente?',
    opciones: [
      'Su sistema operativo',
      'Su ID de instancia',
      'Su dirección IPv4 pública',
      'Los archivos de su volumen raíz'
    ],
    correcta: 2,
    explicacion: 'Al detenerla pierde su IP pública y al encenderla recibe otra. El ID, el sistema y los archivos del volumen se conservan.'
  },

  /* ------------------------------------------------------- Precios de EC2 */
  {
    id: 'p13',
    concepto: 'Instancias Spot',
    tema: 'Precios de EC2',
    texto: 'Un proceso por lotes puede interrumpirse y reanudarse sin problema. ¿Qué opción de compra es la más barata?',
    opciones: ['Instancias On-Demand', 'Instancias Spot', 'Dedicated Hosts', 'Instancias reservadas por 1 año'],
    correcta: 1,
    explicacion: 'Spot usa capacidad sobrante con hasta 90 % de descuento; AWS puede recuperarla con dos minutos de aviso, lo que no afecta a un trabajo que se reanuda.'
  },
  {
    id: 'p14',
    concepto: 'Savings Plans e instancias reservadas',
    tema: 'Precios de EC2',
    texto: 'Una aplicación correrá 24/7 durante tres años con un uso estable. ¿Qué opción reduce más el costo sin riesgo de interrupción?',
    opciones: [
      'Instancias Spot con aviso de dos minutos',
      'Instancias On-Demand sin compromiso',
      'Dedicated Hosts para toda la aplicación',
      'Un Savings Plan a tres años'
    ],
    correcta: 3,
    explicacion: 'Con uso estable y largo plazo, un compromiso de 1 o 3 años (Savings Plans o instancias reservadas) ahorra hasta 72 % sin interrupciones.'
  },
  {
    id: 'p15',
    concepto: 'Instancias On-Demand',
    tema: 'Precios de EC2',
    texto: '¿Qué opción conviene para una prueba corta e impredecible de unas cuantas horas?',
    opciones: ['On-Demand', 'Instancias reservadas por 1 año', 'Savings Plans por 3 años', 'Dedicated Hosts'],
    correcta: 0,
    explicacion: 'On-Demand no tiene compromiso: pagas por segundo lo que usas. Los compromisos solo convienen para uso largo y estable.'
  },
  {
    id: 'p16',
    concepto: 'Dedicated Hosts',
    tema: 'Precios de EC2',
    texto: 'Una empresa tiene licencias de software que se cuentan por servidor físico y reglas que le piden hardware exclusivo. ¿Qué elige?',
    opciones: ['Instancias Spot', 'Dedicated Hosts', 'Instancias On-Demand', 'Savings Plans'],
    correcta: 1,
    explicacion: 'Un Dedicated Host es un servidor físico solo para ti: sirve para licencias ligadas al hardware y requisitos de cumplimiento.'
  },

  /* ------------------------------------- Seguridad y responsabilidad compartida */
  {
    id: 'p17',
    concepto: 'Quién parcha el sistema operativo en EC2',
    tema: 'Seguridad y responsabilidad compartida',
    texto: 'En Amazon EC2, ¿quién instala los parches de seguridad del sistema operativo de la instancia?',
    opciones: [
      'El cliente',
      'AWS, solo en instancias de producción',
      'El fabricante del sistema operativo, a distancia',
      'El plan de soporte Basic de AWS'
    ],
    correcta: 0,
    explicacion: 'En EC2 (IaaS) el sistema operativo invitado es del cliente: él lo actualiza. AWS cuida el hardware, la red y el hipervisor.'
  },
  {
    id: 'p18',
    concepto: 'Lo que le toca a AWS',
    tema: 'Seguridad y responsabilidad compartida',
    texto: 'Según el modelo de responsabilidad compartida, ¿qué le toca a AWS?',
    opciones: [
      'Configurar los grupos de seguridad de tus instancias',
      'Cifrar los datos que guardas en tus volúmenes',
      'La seguridad física de los centros de datos',
      'Crear y rotar las contraseñas de tus usuarios'
    ],
    correcta: 2,
    explicacion: 'AWS protege la nube: edificios, hardware, red e hipervisor. Grupos de seguridad, cifrado y contraseñas son configuración del cliente.'
  },
  {
    id: 'p19',
    concepto: 'Qué hace un grupo de seguridad',
    tema: 'Seguridad y responsabilidad compartida',
    texto: '¿Qué hace un grupo de seguridad (security group)?',
    opciones: [
      'Cifra el disco de la instancia',
      'Activa la autenticación de dos pasos en la cuenta',
      'Bloquea ataques de denegación de servicio en todo AWS',
      'Controla qué tráfico puede llegar a la instancia'
    ],
    correcta: 3,
    explicacion: 'Un grupo de seguridad es el firewall de la instancia: con reglas para permitir, decide qué tráfico entra. Lo que no está permitido, se bloquea.'
  },
  {
    id: 'p20',
    concepto: 'Diagnosticar una página que no abre',
    tema: 'Seguridad y responsabilidad compartida',
    texto: 'Tu instancia está en Running, pero la página web no abre en el navegador. ¿Qué revisas primero?',
    opciones: [
      'Que el grupo de seguridad permita HTTP (puerto 80)',
      'Que la AMI sea Amazon Linux y no otra',
      'Que el tipo de instancia sea más grande',
      'Que el volumen EBS sea de tipo gp3'
    ],
    correcta: 0,
    explicacion: 'Si la instancia está encendida pero nadie la alcanza, lo primero es el grupo de seguridad: sin una regla para el puerto 80, el tráfico web no entra.'
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
