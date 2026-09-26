// La práctica final: un caso y 20 preguntas que validan el curso completo.
// La respuesta correcta vive SOLO en el servidor: `practicaPublica()` la quita
// antes de mandar las preguntas al navegador del alumno.
//
// Mismos criterios que el banco del examen diagnóstico:
//  1. La clave está balanceada: 5 respuestas en A, 5 en B, 5 en C y 5 en D, sin
//     rachas de tres iguales. Corre `npm run verificar` si cambias algo.
//  2. Cada distractor es una confusión real (CapEx contra OpEx, híbrida contra
//     multinube, dato personal contra sensible), no un absurdo.
//
// `concepto` es el nombre corto de lo que mide cada pregunta: sale en el reporte
// del alumno sin revelar la respuesta correcta.
//
// `fijo: true` = las opciones son categorías (IaaS, PaaS, SaaS…) y se muestran
// siempre en ese orden. En las demás, el navegador baraja el orden por alumno
// para que copiar la letra del vecino no sirva de nada.

export const TEMAS = [
  'La nube y su valor',
  'Modelos de servicio',
  'Modelos de despliegue',
  'Datos y normativa',
  'Roles y proveedores'
];

// Qué lecciones del curso repasar cuando un tema sale bajo. Lo usa el reporte
// en PDF que descarga el alumno al entregar.
export const REPASO = {
  'La nube y su valor': ['c1-intro', 'c1-poder'],
  'Modelos de servicio': ['c1-modelos', 'c2-normativa'],
  'Modelos de despliegue': ['c2-despliegue'],
  'Datos y normativa': ['c2-normativa', 'c1-poder'],
  'Roles y proveedores': ['c2-funciones', 'c3-panorama', 'c3-azure']
};

export const CASO = `
  <p><strong>Panaderías Doña Rosca</strong> (empresa ficticia) tiene 14 sucursales en Querétaro. Hoy todo vive en un solo servidor, en la trastienda de la sucursal matriz:</p>
  <ul>
    <li>el <strong>sistema de ventas</strong>, un programa hecho a la medida que solo funciona en Windows Server;</li>
    <li>la <strong>tienda en línea</strong> para apartar roscas y pasteles;</li>
    <li>una hoja de cálculo con los datos de los <strong>9&nbsp;000 clientes</strong> del programa de lealtad: nombre, teléfono, correo, fecha de cumpleaños y, para los pasteles personalizados, sus alergias alimentarias.</li>
  </ul>
  <p>Cada 5 y 6 de enero los pedidos en línea se multiplican por 20 y la tienda se cae. El resto del año, el servidor casi no trabaja. La dueña quiere mudarse a la nube y te contrata como consultor o consultora.</p>`;

export const PREGUNTAS = [
  /* ------------------------------------------------ La nube y su valor */
  {
    id: 'p01',
    concepto: 'Qué es la nube',
    tema: 'La nube y su valor',
    texto: 'La dueña te pregunta qué significa exactamente “mudarse a la nube”. ¿Qué le respondes?',
    opciones: [
      'Comprar un servidor más potente e instalarlo en la sucursal matriz.',
      'Usar servidores de un proveedor por internet y pagar según lo que usen.',
      'Guardar cada noche una copia del servidor en un disco duro externo.',
      'Conectar el servidor actual a internet para usarlo desde cualquier lugar.'
    ],
    correcta: 1,
    explicacion:
      'La nube es usar infraestructura de alguien más por internet, pagando por uso. Un servidor más grande, un respaldo o el acceso remoto siguen siendo on-premises.'
  },
  {
    id: 'p02',
    concepto: 'CapEx y OpEx',
    tema: 'La nube y su valor',
    texto:
      'Para aguantar el 6 de enero, hoy tendrían que comprar servidores para 20 veces la demanda normal y pagarlos antes de vender una sola rosca. En la nube pagarían cada mes lo que usen. ¿Cómo se llama ese cambio en la forma de gastar?',
    opciones: [
      'De gasto operativo (OpEx) a gasto de capital (CapEx)',
      'De nube pública a nube privada',
      'De gasto de capital (CapEx) a gasto operativo (OpEx)',
      'De escalamiento vertical a escalamiento horizontal'
    ],
    correcta: 2,
    explicacion: 'Comprar por adelantado es CapEx; pagar cada mes según el uso es OpEx. La nube cambia CapEx por OpEx.'
  },
  {
    id: 'p03',
    concepto: 'Elasticidad',
    tema: 'La nube y su valor',
    texto:
      '¿Qué característica de la nube permite que la tienda tenga muchos más servidores el 6 de enero y vuelva a lo normal el día 7?',
    opciones: ['Acceso amplio por red', 'Servicio medido', 'Recursos compartidos', 'Elasticidad rápida'],
    correcta: 3,
    explicacion: 'La elasticidad es crecer y encoger según la demanda. El servicio medido es cómo se cobra, no cómo se crece.'
  },
  {
    id: 'p04',
    concepto: 'Escalamiento horizontal',
    tema: 'La nube y su valor',
    texto: 'Para el pico, el equipo pone 15 servidores iguales detrás de un balanceador de carga. ¿Qué tipo de escalamiento es?',
    opciones: [
      'Horizontal: más máquinas trabajando juntas',
      'Vertical: una sola máquina más grande',
      'Vertical, porque ahora hay más capacidad total',
      'Ninguno: el balanceador solo sirve de respaldo'
    ],
    correcta: 0,
    explicacion:
      'Horizontal es agregar máquinas; vertical, hacer más grande una. El balanceador reparte a los clientes entre las máquinas.'
  },

  /* ------------------------------------------------ Modelos de servicio */
  {
    id: 'p05',
    concepto: 'SaaS',
    tema: 'Modelos de servicio',
    texto: 'Para el correo de sus empleados contratan Microsoft 365. ¿Qué modelo de servicio es?',
    opciones: ['IaaS', 'PaaS', 'SaaS', 'On-premises'],
    correcta: 2,
    fijo: true,
    explicacion: 'Usan una aplicación terminada desde el navegador, sin instalar ni mantener nada: SaaS.'
  },
  {
    id: 'p06',
    concepto: 'PaaS',
    tema: 'Modelos de servicio',
    texto:
      'El programador quiere publicar la nueva tienda en línea subiendo solo su código, sin instalar ni actualizar sistemas operativos. ¿Qué modelo le conviene?',
    opciones: ['IaaS', 'PaaS', 'SaaS', 'On-premises'],
    correcta: 1,
    fijo: true,
    explicacion: 'En PaaS subes tu código y la plataforma se encarga del servidor, del sistema operativo y del HTTPS.'
  },
  {
    id: 'p07',
    concepto: 'IaaS para sistemas heredados',
    tema: 'Modelos de servicio',
    texto:
      'El sistema de ventas solo funciona en Windows Server, con una configuración muy especial. ¿Qué modelo permite llevarlo a la nube tal como está?',
    opciones: ['IaaS', 'PaaS', 'SaaS', 'Ninguno: los programas viejos no pueden ir a la nube'],
    correcta: 0,
    fijo: true,
    explicacion:
      'Con IaaS rentan una máquina virtual con Windows Server y la configuran como la necesiten. Mover un sistema así, tal cual, se llama levantar y mover (lift and shift).'
  },
  {
    id: 'p08',
    concepto: 'Responsabilidad compartida en IaaS',
    tema: 'Modelos de servicio',
    texto:
      'Si llevan el sistema de ventas a una máquina virtual (IaaS), ¿quién debe instalar los parches de seguridad de Windows Server?',
    opciones: [
      'El proveedor de la nube, porque la máquina vive en sus servidores',
      'Nadie: en la nube el sistema operativo se actualiza solo',
      'Microsoft, de forma automática, sin importar la nube que usen',
      'El equipo de Doña Rosca: en IaaS el sistema operativo es suyo'
    ],
    correcta: 3,
    explicacion:
      'En IaaS el proveedor cuida la virtualización, los servidores, el almacenamiento y la red; el sistema operativo y todo lo de arriba son del cliente.'
  },

  /* ---------------------------------------------- Modelos de despliegue */
  {
    id: 'p09',
    concepto: 'Nube híbrida',
    tema: 'Modelos de despliegue',
    texto:
      'Deciden llevar la tienda en línea a una nube pública y dejar, por ahora, el sistema de ventas en el servidor de la matriz, conectados entre sí. ¿Qué modelo de despliegue es?',
    opciones: ['Nube pública', 'Nube privada', 'Nube híbrida', 'Multinube'],
    correcta: 2,
    fijo: true,
    explicacion: 'Combinar infraestructura propia con una nube pública, conectadas, es una nube híbrida.'
  },
  {
    id: 'p10',
    concepto: 'Nube pública contra privada',
    tema: 'Modelos de despliegue',
    texto: '¿Cuál es la diferencia principal entre una nube pública y una privada?',
    opciones: [
      'La pública es gratuita y en la privada se paga una renta mensual.',
      'La pública se comparte entre muchos clientes; la privada es de uno solo.',
      'La privada funciona sin conexión a internet y la pública la necesita.',
      'La pública sirve solo para páginas web y la privada para bases de datos.'
    ],
    correcta: 1,
    explicacion:
      'La diferencia es quién usa la infraestructura: muchos clientes aislados entre sí (pública) o una sola organización (privada).'
  },
  {
    id: 'p11',
    concepto: 'Multinube',
    tema: 'Modelos de despliegue',
    texto:
      'Dos años después ya no tienen ningún servidor propio: usan AWS para la tienda y Google Cloud para analizar sus ventas con BigQuery. ¿Cómo se llama esto?',
    opciones: ['Nube híbrida', 'Nube privada', 'Nube comunitaria', 'Multinube'],
    correcta: 3,
    fijo: true,
    explicacion:
      'Usar dos o más proveedores de nube pública es multinube. Ya no es híbrida porque no les queda nada propio.'
  },
  {
    id: 'p12',
    concepto: 'Cuándo conviene una nube privada',
    tema: 'Modelos de despliegue',
    texto: 'La dueña pregunta si mejor monta “su propia nube privada” en la matriz. ¿Qué le respondes?',
    opciones: [
      'Sí conviene: la privada es la única opción segura para datos de clientes.',
      'Sí conviene: es más barata porque no le paga nada a ningún proveedor.',
      'No conviene: seguiría comprando y cuidando el hardware que quiere dejar.',
      'No se puede: las nubes privadas solo existen dentro de AWS, Azure o Google.'
    ],
    correcta: 2,
    explicacion:
      'Una nube privada exige comprar y operar la infraestructura. Para 14 panaderías con picos de temporada, lo razonable es la nube pública o una híbrida.'
  },

  /* ------------------------------------------------- Datos y normativa */
  {
    id: 'p13',
    concepto: 'Datos personales sensibles',
    tema: 'Datos y normativa',
    texto: '¿Cuál de estos datos del programa de lealtad es un dato personal SENSIBLE según la ley mexicana?',
    opciones: [
      'El número de teléfono celular del cliente',
      'Las alergias alimentarias del cliente',
      'La fecha de cumpleaños del cliente',
      'El correo electrónico del cliente'
    ],
    correcta: 1,
    explicacion:
      'Las alergias son información de salud, y la ley considera sensibles los datos que revelan el estado de salud. Los demás son datos personales, pero no sensibles.'
  },
  {
    id: 'p14',
    concepto: 'Aviso de privacidad',
    tema: 'Datos y normativa',
    texto: 'Antes de pedirles sus datos a los clientes, ¿qué debe ponerles a disposición Doña Rosca?',
    opciones: [
      'Un contrato de nivel de servicio (SLA)',
      'Los términos de uso de su proveedor de nube',
      'Una factura electrónica (CFDI) de su compra',
      'Un aviso de privacidad'
    ],
    correcta: 3,
    explicacion:
      'El aviso de privacidad informa qué datos se piden y para qué, desde el momento en que se recaban. El SLA es la promesa de disponibilidad de un proveedor.'
  },
  {
    id: 'p15',
    concepto: 'Plazo de conservación de los datos',
    tema: 'Datos y normativa',
    texto:
      'En la hoja de cálculo siguen los datos de clientes que dejaron el programa hace seis años, “por si acaso”. ¿Qué dice la ley?',
    opciones: [
      'Deben suprimirse cuando ya no son necesarios para la finalidad del aviso.',
      'Pueden guardarse sin límite de tiempo si se cifran antes de subirlos a la nube.',
      'Solo hay que borrarlos si cada cliente lo pide por escrito.',
      'Deben conservarse al menos diez años por obligación fiscal.'
    ],
    correcta: 0,
    explicacion:
      'Guarda solo lo necesario, solo el tiempo necesario: los datos que ya no sirven a su finalidad deben suprimirse (a veces después de un periodo de bloqueo).'
  },
  {
    id: 'p16',
    concepto: 'Regiones y residencia de datos',
    tema: 'Datos y normativa',
    texto:
      'La dueña quiere que los datos de sus clientes se guarden físicamente en México. ¿Qué eligen al crear sus recursos en la nube?',
    opciones: [
      'El modelo de servicio: IaaS, PaaS o SaaS',
      'La región, por ejemplo la de Querétaro',
      'El tamaño de la máquina virtual',
      'La zona horaria de la cuenta'
    ],
    correcta: 1,
    explicacion:
      'La región decide en qué parte del mundo viven los recursos. AWS, Azure y Google Cloud tienen región en Querétaro.'
  },

  /* ----------------------------------------------- Roles y proveedores */
  {
    id: 'p17',
    concepto: 'Arquitectura de nube',
    tema: 'Roles y proveedores',
    texto:
      '¿Quién diseña cómo se conectan la tienda, la base de datos y el sistema de ventas, cuidando el costo y la seguridad?',
    opciones: [
      'Quien tiene el rol de arquitectura de nube',
      'Quien tiene el rol de FinOps',
      'Quien tiene el rol de ingeniería de datos',
      'El equipo de soporte técnico del proveedor'
    ],
    correcta: 0,
    explicacion: 'Arquitectura diseña la solución completa: qué servicios usar, cómo se conectan y cuánto costará.'
  },
  {
    id: 'p18',
    concepto: 'FinOps',
    tema: 'Roles y proveedores',
    texto:
      'En febrero la factura llega al triple: después del 6 de enero nadie apagó los servidores extra. ¿Qué función se encarga de vigilar y optimizar ese gasto?',
    opciones: ['Seguridad', 'DevOps', 'FinOps', 'Arquitectura'],
    correcta: 2,
    explicacion: 'FinOps vigila la factura de la nube y encuentra ahorros, como apagar lo que ya no se usa.'
  },
  {
    id: 'p19',
    concepto: 'Elegir proveedor según lo que ya usas',
    tema: 'Roles y proveedores',
    texto:
      'Doña Rosca ya usa Microsoft 365 y su sistema de ventas corre en Windows Server con SQL Server. ¿Qué proveedor le ofrece la integración más natural?',
    opciones: ['Amazon Web Services', 'Google Cloud', 'Oracle Cloud', 'Microsoft Azure'],
    correcta: 3,
    explicacion:
      'Azure comparte las cuentas de Microsoft 365 gracias a Entra ID y, con Azure Hybrid Benefit, les deja reutilizar sus licencias de Windows Server y SQL Server, con ciertas condiciones.'
  },
  {
    id: 'p20',
    concepto: 'Dependencia del proveedor',
    tema: 'Roles y proveedores',
    texto:
      'Si construyen todo con servicios que solo existen en un proveedor, mudarse después podría costar reescribir casi todo. ¿Cómo se llama ese riesgo?',
    opciones: ['Dependencia del proveedor', 'Falta de elasticidad', 'Residencia de datos en el extranjero', 'Nube híbrida'],
    correcta: 0,
    explicacion:
      'Es la dependencia del proveedor (vendor lock-in): cambiarse sale tan caro que, en la práctica, quedas amarrado.'
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
