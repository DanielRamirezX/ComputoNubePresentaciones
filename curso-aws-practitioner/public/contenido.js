// ---------------------------------------------------------------------------
// RUTA AWS CLOUD PRACTITIONER
//
// La ruta son 8 sesiones de 2 horas. Cada sesión vive en su propio archivo
// (sesion1.js, sesion2.js…) con sus capítulos, su examen de práctica y su plan
// de clase; este archivo solo las junta. Para agregar una sesión: escribe su
// archivo, impórtala aquí, ponla en SESIONES y agrega su banco de preguntas en
// src/practicas.js. `npm run verificar` revisa que todo cuadre.
//
// Tipos de actividad:
//   'leccion'     — láminas que el docente proyecta y el alumno repasa.
//   'opcion'      — opción múltiple con una sola respuesta correcta.
//   'clasificar'  — mandar cada ficha a su grupo (también sirve para V/F).
//   'laboratorio' — pasos en la consola de AWS; cada paso se marca al hacerlo.
//                   Un paso con `evidencia` pide una captura: el alumno la pega
//                   ahí mismo y al final descarga un PDF para Blackboard.
//
// Los ids de actividad llevan el número de sesión (s1-…, s2-…): todas conviven
// en el mismo avance del alumno y no pueden repetirse.
// ---------------------------------------------------------------------------

import { SESION_1 } from './sesion1.js';
import { SESION_2 } from './sesion2.js';

export { SANDBOX } from './sandbox.js';

export const CURSO = {
  id: 'aws-practitioner',
  titulo: 'Ruta AWS Cloud Practitioner'
};

/** Las sesiones ya construidas, en orden. */
export const SESIONES = [SESION_1, SESION_2];

export const sesionDe = (numero) => SESIONES.find((s) => s.numero === Number(numero)) ?? null;

// El camino completo hacia la certificación. Las sesiones que todavía no
// tienen archivo aparecen en el índice como "próximamente".
export const RUTA = [
  { numero: 1, titulo: 'Tu primera máquina en AWS', temas: 'Infraestructura global · EC2 · precios de cómputo', dominios: ['Tecnología', 'Facturación'], sandbox: 45 },
  { numero: 2, titulo: 'Identidad y seguridad', temas: 'IAM: usuarios, grupos, roles y políticas · MFA · responsabilidad compartida · servicios de seguridad', dominios: ['Seguridad'], sandbox: 30 },
  { numero: 3, titulo: 'Redes en AWS', temas: 'VPC, subredes, tablas de rutas, grupos de seguridad y NACL · Route 53 · CloudFront', dominios: ['Tecnología'], sandbox: 60 },
  { numero: 4, titulo: 'Almacenamiento', temas: 'Amazon S3 y sus clases · EBS, EFS y Glacier', dominios: ['Tecnología'], sandbox: 45 },
  { numero: 5, titulo: 'Bases de datos', temas: 'Amazon RDS y Aurora · DynamoDB · ElastiCache · Redshift', dominios: ['Tecnología'], sandbox: 60 },
  { numero: 6, titulo: 'Escalar y automatizar', temas: 'Balanceadores de carga · Auto Scaling · CloudWatch · Lambda · SNS y SQS', dominios: ['Tecnología', 'Conceptos'], sandbox: 60 },
  { numero: 7, titulo: 'Costos, soporte y buenas prácticas', temas: 'Pricing Calculator · Budgets · Cost Explorer · Organizations · planes de soporte · Well-Architected', dominios: ['Facturación', 'Conceptos'], sandbox: 20 },
  { numero: 8, titulo: 'Simulacro de certificación', temas: 'Examen completo de 65 preguntas en 90 minutos, con repaso de errores', dominios: ['Todos'], sandbox: 0 }
].map((r) => ({ ...r, lista: SESIONES.some((s) => s.numero === r.numero) }));
