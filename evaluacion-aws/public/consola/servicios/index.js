// ---------------------------------------------------------------------------
// EL REGISTRO DE SERVICIOS
//
// La consola pinta su barra de favoritos, el buscador, el menú de servicios y
// el enrutador a partir de esta lista. Para agregar un servicio: crea
// servicios/<id>.js con el formato de ec2.js (ver NUCLEO.md), impórtalo aquí y
// ponlo en SERVICIOS en lugar de su marcador «próximamente».
// ---------------------------------------------------------------------------

import inicio from './inicio.js';
import ec2 from './ec2.js';
import vpc from './vpc.js';
import s3 from './s3.js';
import iam from './iam.js';
import cloudwatch from './cloudwatch.js';
import cloudtrail from './cloudtrail.js';
import sns from './sns.js';
import sqs from './sqs.js';
import lambda from './lambda.js';
import eventbridge from './eventbridge.js';
import rds from './rds.js';
import elasticache from './elasticache.js';
import dynamodb from './dynamodb.js';
import billing from './billing.js';
import trustedadvisor from './trustedadvisor.js';
import support from './support.js';
import organizations from './organizations.js';
import wellarchitected from './wellarchitected.js';
import cloudfront from './cloudfront.js';
import route53 from './route53.js';
import secretsmanager from './secretsmanager.js';
import kms from './kms.js';
import efs from './efs.js';

export { proximamente } from './proximamente.js';

export const SERVICIOS = [
  inicio,
  ec2,
  vpc,
  s3,
  iam,
  rds,
  dynamodb,
  elasticache,
  lambda,
  cloudwatch,
  cloudtrail,
  sns,
  sqs,
  eventbridge,
  cloudfront,
  route53,
  efs,
  secretsmanager,
  kms,
  billing,
  trustedadvisor,
  support,
  organizations,
  wellarchitected
];
