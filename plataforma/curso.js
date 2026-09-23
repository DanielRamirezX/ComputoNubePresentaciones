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
    }
  ]
};
