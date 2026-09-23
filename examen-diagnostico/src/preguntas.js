// Banco del examen diagnóstico.
// La respuesta correcta vive SOLO en el servidor: nunca se envía al navegador del alumno.
//
// Dos criterios al escribir preguntas nuevas:
//  1. La clave está balanceada: 5 respuestas en A, 5 en B, 5 en C y 5 en D.
//     Si agregas o cambias una, corre `node src/verificar-banco.js` para no
//     volver a cargar una sola letra.
//  2. Cada distractor es una confusión real (RAM contra disco, DNS contra DHCP,
//     if contra while, API contra interfaz de usuario), no un absurdo.
//     Un distractor ridículo se descarta sin saber nada y te infla el promedio.

export const TEMAS = [
  'Hardware y arquitectura',
  'Sistema operativo y virtualización',
  'Redes e Internet',
  'Programación',
  'Datos y servicios'
];

export const PREGUNTAS = [
  {
    id: 'hw1',
    tema: 'Hardware y arquitectura',
    texto: '¿Cuál es la función principal del procesador (CPU)?',
    opciones: [
      'Almacenar los programas y los datos mientras el equipo está encendido',
      'Guardar los archivos para que sigan ahí después de apagar el equipo',
      'Ejecutar las instrucciones de los programas',
      'Generar la imagen que se ve en la pantalla'
    ],
    correcta: 2
  },
  {
    id: 'hw2',
    tema: 'Hardware y arquitectura',
    texto: 'Se va la luz de golpe mientras trabajas. ¿Qué información se pierde?',
    opciones: [
      'Lo que estaba en la memoria RAM y todavía no se había guardado',
      'Nada, porque el sistema operativo guarda cada cambio automáticamente',
      'Lo que estaba en el disco, que es donde el programa trabaja',
      'Los archivos del disco se dañan y hay que instalar todo de nuevo'
    ],
    correcta: 0
  },
  {
    id: 'hw3',
    tema: 'Hardware y arquitectura',
    texto:
      'Un video pesa 4 GB y una foto pesa 3 MB. ¿Cuántas fotos caben, aproximadamente, en el espacio que ocupa el video?',
    opciones: ['Unas 13', 'Unas 130', 'Unas 1 300', 'Unas 130 000'],
    correcta: 2
  },
  {
    id: 'hw4',
    tema: 'Hardware y arquitectura',
    texto: 'Un servidor tiene un procesador de 4 núcleos. En la práctica eso significa que:',
    opciones: [
      'Cada programa se ejecuta cuatro veces más rápido que en un solo núcleo',
      'Puede trabajar en cuatro tareas realmente al mismo tiempo',
      'Puede tener instalados hasta cuatro sistemas operativos',
      'Puede atender como máximo a cuatro usuarios conectados a la vez'
    ],
    correcta: 1
  },
  {
    id: 'so1',
    tema: 'Sistema operativo y virtualización',
    texto: '¿Cuál es el trabajo principal de un sistema operativo como Windows, Linux o macOS?',
    opciones: [
      'Administrar el hardware y repartirlo entre los programas que se ejecutan',
      'Traducir el código que escribe el programador a instrucciones del procesador',
      'Proteger al equipo de virus y de accesos no autorizados',
      'Dibujar el escritorio y las ventanas con las que trabaja el usuario'
    ],
    correcta: 0
  },
  {
    id: 'so2',
    tema: 'Sistema operativo y virtualización',
    texto: '¿Qué es una máquina virtual?',
    opciones: [
      'Un servidor físico al que se entra por Internet en vez de estar frente a él',
      'Una copia de seguridad del sistema que se puede restaurar si algo falla',
      'Un programa que permite abrir varias ventanas del mismo sistema a la vez',
      'Una computadora completa simulada por software que corre dentro de otra'
    ],
    correcta: 3
  },
  {
    id: 'so3',
    tema: 'Sistema operativo y virtualización',
    texto: 'Un programa se queda congelado y consume el 100% del CPU. La causa más probable es que:',
    opciones: [
      'Se quedó sin memoria RAM disponible',
      'Está atrapado en un ciclo que nunca termina',
      'Está esperando una respuesta de la red que no llega',
      'El disco está lleno y no puede escribir sus archivos temporales'
    ],
    correcta: 1
  },
  {
    id: 'red1',
    tema: 'Redes e Internet',
    texto: '¿Qué es una dirección IP?',
    opciones: [
      'El nombre que se escribe en el navegador para llegar a un sitio',
      'El código de fábrica que identifica a la tarjeta de red del equipo',
      'El número que identifica a un equipo dentro de una red',
      'La ruta que siguen los datos desde el origen hasta el destino'
    ],
    correcta: 2
  },
  {
    id: 'red2',
    tema: 'Redes e Internet',
    texto: '¿Para qué sirve el DNS?',
    opciones: [
      'Asignarle automáticamente una dirección IP a cada equipo que se conecta',
      'Traducir un nombre como unitec.mx a la dirección IP del servidor',
      'Comprobar que el sitio al que entras sea auténtico y no una copia falsa',
      'Guardar en tu equipo las páginas ya visitadas para que abran más rápido'
    ],
    correcta: 1
  },
  {
    id: 'red3',
    tema: 'Redes e Internet',
    texto: 'La diferencia principal entre HTTP y HTTPS es que:',
    opciones: [
      'HTTPS cifra la información que viaja entre el navegador y el servidor',
      'HTTPS garantiza que el contenido del sitio sea verdadero y confiable',
      'HTTPS comprime los datos para que las páginas carguen más rápido',
      'HTTPS mantiene la sesión abierta para no tener que entrar otra vez'
    ],
    correcta: 0
  },
  {
    id: 'red4',
    tema: 'Redes e Internet',
    texto: 'La latencia de una conexión mide:',
    opciones: [
      'La cantidad de datos que caben por segundo en la conexión',
      'El porcentaje de datos que se pierden en el camino',
      'La cantidad de equipos que pueden conectarse al mismo tiempo',
      'El tiempo que tarda un dato en ir hasta el servidor y regresar'
    ],
    correcta: 3
  },
  {
    id: 'red5',
    tema: 'Redes e Internet',
    texto: 'En el modelo cliente-servidor, el servidor es:',
    opciones: [
      'El equipo desde donde el usuario abre el navegador y hace la consulta',
      'Cualquier equipo de la red que comparte sus archivos con los demás',
      'El equipo o programa que recibe las peticiones y las responde',
      'El equipo que tiene la conexión más rápida de toda la red'
    ],
    correcta: 2
  },
  {
    id: 'prog1',
    tema: 'Programación',
    texto: 'En programación, una variable es:',
    opciones: [
      'Un espacio con nombre donde se guarda un valor que puede cambiar',
      'Un dato escrito directamente en el código que ya no cambia',
      'Una instrucción que le indica al programa qué hacer en ese paso',
      'El nombre con el que se guarda el archivo del programa'
    ],
    correcta: 0
  },
  {
    id: 'prog2',
    tema: 'Programación',
    texto: '¿Qué hace una estructura condicional (if)?',
    opciones: [
      'Repite un bloque de instrucciones mientras se cumpla una condición',
      'Ejecuta un bloque de instrucciones solo si se cumple una condición',
      'Compara dos valores y guarda el resultado en una variable',
      'Detiene el programa cuando encuentra un error'
    ],
    correcta: 1
  },
  {
    id: 'prog3',
    tema: 'Programación',
    texto: '¿Qué imprime este pseudocódigo?\n\ntotal = 0\npara i desde 1 hasta 4:\n    total = total + i\nimprimir(total)',
    opciones: ['4', '10', '15', '24'],
    correcta: 1
  },
  {
    id: 'prog4',
    tema: 'Programación',
    texto: '¿Para qué sirve una función dentro de un programa?',
    opciones: [
      'Para guardar los datos que el programa va a necesitar más adelante',
      'Para separar el código en varios archivos y que sea más fácil de leer',
      'Para indicar el orden en que se ejecutan las líneas del programa',
      'Para agrupar instrucciones y poder reutilizarlas cuando se necesiten'
    ],
    correcta: 3
  },
  {
    id: 'prog5',
    tema: 'Programación',
    texto: '¿Qué es una API?',
    opciones: [
      'La pantalla con la que el usuario interactúa con el programa',
      'El lenguaje de programación en el que está escrito un sistema',
      'El cable o la conexión de red que une a dos servidores',
      'Un conjunto de operaciones que un programa ofrece para que otros lo usen'
    ],
    correcta: 3
  },
  {
    id: 'dat1',
    tema: 'Datos y servicios',
    texto: '¿Qué es JSON?',
    opciones: [
      'Un formato de texto para intercambiar datos entre sistemas',
      'Un lenguaje de programación para hacer aplicaciones web',
      'Un tipo de base de datos donde se guarda la información',
      'Un método para comprimir archivos y que ocupen menos espacio'
    ],
    correcta: 0
  },
  {
    id: 'dat2',
    tema: 'Datos y servicios',
    texto: 'En una base de datos relacional, la información se organiza en:',
    opciones: [
      'Archivos de texto repartidos en carpetas organizadas por tema',
      'Un archivo grande donde cada dato se busca por su nombre',
      'Tablas con filas y columnas que se relacionan entre sí',
      'Bloques de datos enlazados uno tras otro en orden de llegada'
    ],
    correcta: 2
  },
  {
    id: 'dat3',
    tema: 'Datos y servicios',
    texto: 'Que un servicio "esté en la nube" significa que:',
    opciones: [
      'Los datos viajan por Internet sin quedarse guardados en ningún servidor',
      'El programa se instala en tu equipo y se actualiza solo desde Internet',
      'La información se reparte entre las computadoras de todos los usuarios',
      'Se ejecuta en servidores de un proveedor y se usa a través de Internet'
    ],
    correcta: 3
  }
];

/** Versión pública: sin la respuesta correcta. */
export function preguntasPublicas() {
  return PREGUNTAS.map(({ id, tema, texto, opciones }) => ({ id, tema, texto, opciones }));
}

/** Califica un objeto { idPregunta: indiceElegido }. */
export function calificar(respuestas = {}) {
  const detalle = PREGUNTAS.map((p) => {
    const elegida = respuestas[p.id];
    const contestada = Number.isInteger(elegida) && elegida >= 0 && elegida < p.opciones.length;
    return {
      id: p.id,
      tema: p.tema,
      elegida: contestada ? elegida : null,
      correcta: contestada && elegida === p.correcta
    };
  });
  const aciertos = detalle.filter((d) => d.correcta).length;
  return { aciertos, total: PREGUNTAS.length, detalle };
}
