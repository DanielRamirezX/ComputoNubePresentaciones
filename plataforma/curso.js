// ---------------------------------------------------------------------------
// EL ÍNDICE DE LA MATERIA
//
// Este archivo es la única fuente de verdad: lo que esté aquí es lo que se
// monta y lo que ven los alumnos. Para agregar material nuevo, pon la carpeta
// como hermana de `plataforma/` y añade un objeto a `modulos`.
//
// Tipos de módulo:
//   'estatico' — una carpeta con index.html (una presentación). No necesita nada.
//   'express'  — un proyecto Node que exporta `crearApp()` desde `app.js`.
//   'enlace'   — algo que vive fuera (una liga). Solo aparece en el índice.
//
// `seccion` (opcional) agrupa el módulo bajo un título aparte en el índice,
// después de las clases. Hoy existen dos: «Evaluación» (con su propio tono) y
// «Recursos didácticos».
//
// `accesos` (opcional) muestra un módulo como varias tarjetas, cada una con su
// `ruta` dentro del módulo (por ejemplo '#/simulacro-1').
// ---------------------------------------------------------------------------

export const CURSO = {
  materia: 'Cómputo en la Nube',
  docente: 'Por definir',
  grupo: 'Por definir',

  modulos: [
    {
      id: 'diagnostico',
      titulo: 'Examen diagnóstico',
      resumen: '20 preguntas de fundamentos para arrancar el curso.',
      etiqueta: 'Examen',
      tipo: 'express',
      ruta: '../examen-diagnostico'
    },
    {
      id: 'iaas-paas-saas',
      titulo: 'IaaS, PaaS y SaaS',
      resumen: 'La nube explicada fácil: los tres modelos, los tres grandes y cómo te cobran.',
      etiqueta: 'Presentación',
      tipo: 'estatico',
      ruta: '../presentacion-iaas-paas-saas'
    },
    {
      id: 'virtualizacion',
      titulo: 'La nube por dentro',
      resumen: 'Hilos, núcleos y máquinas virtuales. Incluye la práctica guiada de VirtualBox.',
      etiqueta: 'Presentación',
      tipo: 'estatico',
      ruta: '../presentacion-virtualizacion'
    },
    {
      id: 'comprender-nube',
      titulo: 'Comprender la computación en la nube',
      resumen: 'Curso guiado de 2 horas: lecciones, ejercicios con XP y una práctica final con un caso real.',
      etiqueta: 'Curso',
      tipo: 'express',
      ruta: '../curso-comprender-nube'
    },
    {
      id: 'aws-practitioner',
      titulo: 'Ruta AWS Cloud Practitioner',
      resumen: 'Guía paso a paso en el sandbox de AWS hacia la certificación. Sesión 1: tu primera máquina en EC2. Sesión 2: identidad y seguridad. Sesión 3: redes. Sesión 4: almacenamiento. Sesión 5: bases de datos. Sesión 6: escalar y automatizar. Sesión 7: costos, soporte y buenas prácticas.',
      etiqueta: 'Laboratorio',
      tipo: 'express',
      ruta: '../curso-aws-practitioner'
    },
    {
      id: 'evaluacion',
      titulo: 'Evaluación AWS',
      etiqueta: 'Evaluación',
      tipo: 'express',
      ruta: '../evaluacion-aws',
      seccion: 'Evaluación',
      accesos: [
        {
          titulo: 'Simulacro 1',
          etiqueta: 'Martes 20 de octubre',
          resumen: 'Ensayo del examen: casos de negocio de las sesiones 1 a 4 y un laboratorio de una hora en una consola de AWS simulada. Tu docente lo abre en clase.',
          ruta: '#/simulacro-1'
        },
        {
          titulo: 'Simulacro 2',
          etiqueta: 'Viernes 23 de octubre',
          resumen: 'Segundo ensayo con casos y laboratorio distintos. Al entregar ves qué hiciste bien y qué te faltó.',
          ruta: '#/simulacro-2'
        },
        {
          titulo: 'Examen bimestral · parte práctica',
          etiqueta: 'Martes 27 de octubre',
          resumen: 'El laboratorio del examen en la consola simulada: máximo una hora. Tu docente lo abre en clase.',
          ruta: '#/bimestral'
        }
      ]
    },
    {
      id: 'viaje-paquete',
      titulo: '¿Cómo llega un paquete a su domicilio?',
      resumen: 'Animación paso a paso: el viaje de un paquete por una red de AWS, con direcciones IP, letreros y guardias en lugar de nombres de calles. Acompaña la sesión 3 (redes).',
      etiqueta: 'Animación',
      tipo: 'estatico',
      ruta: '../recurso-viaje-paquete',
      seccion: 'Recursos didácticos'
    },
    {
      id: 'donde-guardo',
      titulo: '¿Dónde guardo cada cosa?',
      resumen: 'Animación paso a paso: el viaje de una foto por el almacenamiento de AWS, con una bodega, sótanos fríos, un cajón y un estante en lugar de siglas. Acompaña la sesión 4 (almacenamiento).',
      etiqueta: 'Animación',
      tipo: 'estatico',
      ruta: '../recurso-donde-guardo',
      seccion: 'Recursos didácticos'
    },
    {
      id: 'donde-apunto',
      titulo: '¿Dónde se apunta cada dato?',
      resumen: 'Animación paso a paso: el viaje de una nota de venta por las bases de datos de AWS, con una libreta, un archivo con encargado, un guardarropa de fichas y una libretita de lo más pedido en lugar de siglas. Acompaña la sesión 5 (bases de datos).',
      etiqueta: 'Animación',
      tipo: 'estatico',
      ruta: '../recurso-donde-apunto',
      seccion: 'Recursos didácticos'
    },
    {
      id: 'hora-pico',
      titulo: 'La taquería en hora pico',
      resumen: 'Animación paso a paso: una taquería en hora pico explica el escalado vertical y horizontal, Auto Scaling, los balanceadores, CloudWatch, SQS, SNS y Lambda con planchas, un gerente, un anfitrión y un ayudante que llega con el timbre. Acompaña la sesión 6 (escalar y automatizar).',
      etiqueta: 'Animación',
      tipo: 'estatico',
      ruta: '../recurso-hora-pico',
      seccion: 'Recursos didácticos'
    },
    {
      id: 'cuanto-cuesta',
      titulo: '¿Cuánto cuesta la nube?',
      resumen: 'Animación paso a paso: el viaje de una moneda por los costos de AWS, con un cotizador, un taxi, un abono, una tarjeta que avisa, un mecánico y una casa de seis pilares en lugar de siglas. Acompaña la sesión 7 (costos, soporte y buenas prácticas).',
      etiqueta: 'Animación',
      tipo: 'estatico',
      ruta: '../recurso-cuanto-cuesta',
      seccion: 'Recursos didácticos'
    }
  ]
};
