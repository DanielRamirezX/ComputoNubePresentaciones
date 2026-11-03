// ---------------------------------------------------------------------------
// RUTA AWS CLOUD PRACTITIONER
//
// La ruta son 13 sesiones de 2 horas: siete de temas (1 a 7), el simulacro
// completo del examen (8) y cinco prácticas integradoras en el simulador AWS
// de evaluacion-aws (9 a 13). Cada sesión vive en su propio archivo
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
//                   Con `simulador: { lab: 'lab-s6', minutos: 50, nota: '…' }`
//                   el alumno elige si lo hace en DataCamp (con esta guía) o en
//                   el simulador AWS, donde se califica solo. Opcional dentro
//                   de `simulador`: `tareas: ['…']`, el resumen de lo que pide.
//   'simulador'   — una práctica que se hace solo en el simulador AWS:
//                   { id, tipo: 'simulador', titulo, xp, minutos, lab: 'practica-1',
//                     objetivo, caso: '<p>…</p>', arquitectura?: '<figure>…</figure>',
//                     tareas: ['…'], necesitas: ['…'] }
//                   El caso, la arquitectura y las tareas son HTML, como las láminas.
//
// Los ids de actividad llevan el número de sesión (s1-…, s2-…): todas conviven
// en el mismo avance del alumno y no pueden repetirse.
// ---------------------------------------------------------------------------

import { SESION_1 } from './sesion1.js';
import { SESION_2 } from './sesion2.js';
import { SESION_3 } from './sesion3.js';
import { SESION_4 } from './sesion4.js';
import { SESION_5 } from './sesion5.js';
import { SESION_6 } from './sesion6.js';
import { SESION_7 } from './sesion7.js';
// De la 8 en adelante: mientras su archivo exporte null, la sesión sale como
// «próximamente» en la ruta y no se carga.
import { SESION_8 } from './sesion8.js';
import { SESION_9 } from './sesion9.js';
import { SESION_10 } from './sesion10.js';
import { SESION_11 } from './sesion11.js';
import { SESION_12 } from './sesion12.js';
import { SESION_13 } from './sesion13.js';

export { SANDBOX } from './sandbox.js';

export const CURSO = {
  id: 'aws-practitioner',
  titulo: 'Ruta AWS Cloud Practitioner'
};

/** Las sesiones ya construidas, en orden. */
export const SESIONES = [SESION_1, SESION_2, SESION_3, SESION_4, SESION_5, SESION_6, SESION_7, SESION_8, SESION_9, SESION_10, SESION_11, SESION_12, SESION_13].filter(Boolean);

export const sesionDe = (numero) => SESIONES.find((s) => s.numero === Number(numero)) ?? null;

// El camino completo hacia la certificación. Las sesiones que todavía no
// tienen archivo aparecen en el índice como "próximamente". `sandbox` son los
// minutos de DataCamp; 0 si la sesión no lo usa (el simulacro y las prácticas
// en el simulador AWS).
export const RUTA = [
  { numero: 1, titulo: 'Tu primera máquina en AWS', temas: 'Infraestructura global · EC2 · precios de cómputo', dominios: ['Tecnología', 'Facturación'], sandbox: 45 },
  { numero: 2, titulo: 'Identidad y seguridad', temas: 'IAM: usuarios, grupos, roles y políticas · MFA · responsabilidad compartida · servicios de seguridad', dominios: ['Seguridad'], sandbox: 30 },
  { numero: 3, titulo: 'Redes en AWS', temas: 'VPC, subredes, tablas de rutas y gateways · VPN, Direct Connect y peering · Route 53 · CloudFront', dominios: ['Tecnología'], sandbox: 25 },
  { numero: 4, titulo: 'Almacenamiento', temas: 'Amazon S3 y sus clases · ciclo de vida y Glacier · EBS, EFS y snapshots · Snowball y Storage Gateway', dominios: ['Tecnología'], sandbox: 25 },
  { numero: 5, titulo: 'Bases de datos', temas: 'Amazon RDS y Aurora · DynamoDB · ElastiCache · Redshift', dominios: ['Tecnología'], sandbox: 25 },
  { numero: 6, titulo: 'Escalar y automatizar', temas: 'Balanceadores de carga · Auto Scaling · CloudWatch · Lambda · SNS y SQS', dominios: ['Tecnología', 'Conceptos'], sandbox: 35 },
  { numero: 7, titulo: 'Costos, soporte y buenas prácticas', temas: 'Pricing Calculator · Budgets · Cost Explorer · Organizations · planes de soporte · Well-Architected', dominios: ['Facturación', 'Conceptos'], sandbox: 15 },
  { numero: 8, titulo: 'Simulacro de certificación', temas: 'Examen completo de 65 preguntas en 90 minutos, con repaso de errores', dominios: ['Todos'], sandbox: 0 },
  {
    numero: 9,
    titulo: 'Práctica 1 · La tienda en línea',
    temas: 'Web de dos capas con alta disponibilidad: VPC con subredes públicas y privadas, ALB y Auto Scaling, RDS Multi-AZ, S3 y alarmas con SNS · Well-Architected, Elastic Beanstalk, Lightsail, CloudFormation, Amplify y ECS con Fargate',
    dominios: ['Tecnología', 'Conceptos'],
    sandbox: 0
  },
  {
    numero: 10,
    titulo: 'Práctica 2 · La clínica y sus expedientes',
    temas: 'Seguridad y cumplimiento: IAM con mínimo privilegio y MFA, KMS, S3 cifrado con retención, Secrets Manager, RDS privado y CloudTrail · Artifact, Macie, GuardDuty, Inspector, Shield, WAF, Config, Security Hub y Cognito',
    dominios: ['Seguridad'],
    sandbox: 0
  },
  {
    numero: 11,
    titulo: 'Práctica 3 · El festival y sus boletos',
    temas: 'Sin servidores y desacoplado: S3 con CloudFront y Route 53, DynamoDB, SQS, Lambda, SNS y EventBridge · API Gateway, Step Functions, Kinesis, Athena, Glue, Amazon Quick, ECS, EKS y Fargate',
    dominios: ['Tecnología'],
    sandbox: 0
  },
  {
    numero: 12,
    titulo: 'Práctica 4 · Cuentas y factura bajo control',
    temas: 'Gobierno y costos: Organizations y SCP, Budgets, etiquetas y Cost Explorer, Pricing Calculator, Trusted Advisor, right-sizing y planes de soporte · Control Tower, Compute Optimizer, Service Quotas, Marketplace y Health Dashboard',
    dominios: ['Facturación', 'Seguridad'],
    sandbox: 0
  },
  {
    numero: 13,
    titulo: 'Práctica 5 · La universidad migra (ensayo del final)',
    temas: 'Todo integrado en 60 minutos y sin pistas paso a paso · migración (las 7R, CAF, DMS, familia Snow), híbrido y borde (Direct Connect, Outposts, Local Zones) e IA/ML (SageMaker, Bedrock, Amazon Q)',
    dominios: ['Todos'],
    sandbox: 0
  }
].map((r) => ({ ...r, lista: SESIONES.some((s) => s.numero === r.numero) }));
