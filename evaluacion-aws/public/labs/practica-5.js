// Práctica integradora 5 · sesión 13 de la Ruta AWS · el ensayo del examen final.
// «La universidad migra a la nube»: la Universidad del Altiplano muda su portal
// de servicios escolares (inscripciones y kardex) de un servidor en un cuarto
// de la rectoría a AWS, con la estrategia «rehost» (lift and shift).
//
// Integra todo el temario: la red ya está hecha (la dejó el área de redes) y el
// alumno monta encima el cómputo que escala (ALB + Auto Scaling en dos zonas,
// con los servidores en subredes privadas), arregla las puertas (grupos de
// seguridad encadenados), crea la base administrada (RDS Multi-AZ, privada, con
// respaldos y un snapshot), el EFS compartido, endereza el bucket de las actas
// (bloqueo público, versionado y ciclo de vida a Deep Archive), pone la alarma
// que avisa por el tema de SNS que TI ya tiene, el rol de IAM mínimo para los
// servidores y el presupuesto. El bono: que el portal crezca solo (target
// tracking). Como el final dura 60 minutos, la red y el tema de avisos ya
// vienen hechos: el alumno gasta el tiempo en decidir, no en repetir.
//
// Pide RESULTADOS de negocio, no clics: las pistas solo dicen en qué servicio y
// pantalla se hace cada cosa.
//
// Datos distintos por alumno: la red sale de su octeto, los nombres llevan su
// sufijo y los días de respaldo, de archivo, el umbral de la alarma y el monto
// del presupuesto cambian con su octeto.

import {
  anotar,
  avanzar,
  confirmarSuscripcion,
  crearBucket,
  crearGrupoSeguridad,
  crearGrupoSubredesRds,
  crearSuscripcion,
  crearTema,
  crearVpcCompleta,
  cuentaNueva,
  reloj,
  subirObjetos
} from '../consola/modelo.js';
import { bloque, c, vinetas } from './util.js';

/** El script que instala el portal: cada servidor dice en qué zona vive. */
const scriptPortal = (sufijo) =>
  [
    '#!/bin/bash',
    'dnf install -y httpd',
    `echo "<h1>Universidad del Altiplano</h1><p>Servicios escolares - campus ${sufijo}</p><p>Te atiende el servidor de la zona $(ec2-metadata -z | cut -d ' ' -f 2)</p>" > /var/www/html/index.html`,
    'systemctl enable --now httpd'
  ].join('\n');

export function datosLab(d) {
  const red = `10.${d.octeto}`;
  const v = d.octeto % 4;
  const w = Math.floor(d.octeto / 4) % 4;
  return {
    sufijo: d.sufijo,
    ipCasa: d.ipCasa,
    // La red que dejó el área de redes
    vpcCidr: d.vpcCidr,
    prefijo: 'campus',
    vpcNombre: 'campus-vpc',
    publicas: [`${red}.0.0/24`, `${red}.1.0/24`],
    privadas: [`${red}.10.0/24`, `${red}.11.0/24`],
    zonas: ['us-east-1a', 'us-east-1b'],
    grupoDb: 'campus-db-subnets',
    sgAlb: 'campus-alb-sg',
    sgWeb: 'portal-web-sg',
    // El portal (nombres sugeridos: no se califican)
    plantilla: 'portal-plantilla',
    tg: 'portal-tg',
    alb: 'portal-alb',
    asg: 'portal-asg',
    textoPagina: `campus ${d.sufijo}`,
    userData: scriptPortal(d.sufijo),
    // La base de datos
    db: `kardex-${d.sufijo}`,
    snap: `kardex-premigracion-${d.sufijo}`,
    sgDb: 'kardex-db-sg',
    puerto: 3306,
    retencion: [14, 21, 28, 35][v],
    // Los archivos compartidos
    efs: 'portal-archivos',
    sgEfs: 'portal-efs-sg',
    // Las actas
    bucket: `altiplano-actas-${d.sufijo}`,
    diasArchivo: [90, 120, 180, 365][w],
    // El monitoreo
    tema: 'alertas-portal',
    correo: 'ti@uni-altiplano.mx',
    umbral: [70, 75, 80, 85][w],
    // El acceso de los servidores
    rol: 'portal-ec2-rol',
    politica: 'AmazonS3ReadOnlyAccess',
    // Los costos
    presupuesto: 'altiplano-nube-mensual',
    monto: [300, 350, 400, 450][v],
    porcentaje: 80,
    // El bono
    objetivoCpu: 50,
    maximo: 4
  };
}

export const LAB = {
  id: 'practica-5',
  titulo: 'La universidad migra a la nube',
  minutos: 60,
  pistas: true,
  // La VPC ya existe; la IP de casa no hace falta («My IP» la pone la consola).
  datosVisibles: ['vpcCidr', 'sufijo', 'cuentaId'],
  etiquetasDatos: { vpcCidr: ['Rango de campus-vpc', 'Ya existe: no crees otra.'] },
  historia: `
    <p>La <strong>Universidad del Altiplano</strong>, en San Luis Potosí, tiene su portal de servicios escolares (inscripciones y kardex de 9,000 alumnos) en <strong>un solo servidor</strong> en un cuarto de la rectoría. En cada semana de inscripciones el portal se cae, y en agosto un apagón lo dejó tres días fuera de línea.</p>
    <p>La rectoría aprobó <strong>migrar a AWS</strong> con la estrategia <em>rehost</em> («lift and shift»: llevar la misma aplicación, sin reescribirla). El área de redes ya dejó lista la red <code>campus-vpc</code> con dos subredes <strong>públicas</strong> y dos <strong>privadas</strong> en <code>us-east-1a</code> y <code>us-east-1b</code>, su Internet Gateway, un NAT gateway y el DB subnet group <code>campus-db-subnets</code>. También existen el grupo de seguridad <code>campus-alb-sg</code> (para el balanceador), el grupo <code>portal-web-sg</code> que dejó el proveedor anterior (revísalo), el tema de SNS <code>alertas-portal</code> con el correo de TI ya confirmado y el bucket con las actas históricas, que el área de TI ya copió con AWS DataSync.</p>
    <p>Te toca montar lo demás y entregarlo funcionando. Cada tarea dice el <strong>resultado</strong> que necesita la universidad, no los clics: tú decides cómo llegar ahí. Este es el <strong>ensayo del examen final</strong> (60 minutos): las pistas solo dicen en qué servicio y pantalla se hace cada cosa.</p>
    <p>Todo va en <strong>N. Virginia (us-east-1)</strong>. Algunas cosas tardan (la base unos 30 segundos, los servidores y el balanceador unos 20): mientras esperas, avanza con otra tarea. Las ocho tareas requeridas suman 100 puntos. La novena es un <strong>bono opcional</strong> que compensa errores, pero tu calificación nunca pasa de 100.</p>`,

  estadoInicial(datos) {
    const x = datosLab(datos);
    const e = cuentaNueva(datos);

    // La red que dejó el área de redes: 2 públicas y 2 privadas en 2 zonas, IGW y un NAT.
    const { vpc, publicas, privadas } = crearVpcCompleta(e, {
      prefijo: x.prefijo,
      cidr: x.vpcCidr,
      zonas: 2,
      publicas: 2,
      privadas: 2,
      nat: 'una',
      bloquesPublicos: x.publicas,
      bloquesPrivados: x.privadas
    });
    crearGrupoSubredesRds(e, { nombre: x.grupoDb, descripcion: 'Subredes privadas del campus para bases de datos', vpcId: vpc.id, subredes: privadas.map((s) => s.id) });

    // La puerta del balanceador (bien) y la del proveedor anterior (abierta de más).
    crearGrupoSeguridad(e, { nombre: x.sgAlb, descripcion: 'Balanceador del portal: HTTP desde internet', vpcId: vpc.id, entrada: [{ protocolo: 'tcp', desde: 80, hasta: 80, origen: '0.0.0.0/0' }] });
    crearGrupoSeguridad(e, {
      nombre: x.sgWeb,
      descripcion: 'Servidores del portal (proveedor anterior)',
      vpcId: vpc.id,
      entrada: [
        { protocolo: 'tcp', desde: 80, hasta: 80, origen: '0.0.0.0/0' },
        { protocolo: 'tcp', desde: 22, hasta: 22, origen: '0.0.0.0/0' }
      ]
    });

    // Las actas que el área de TI copió con DataSync: alguien quitó el bloqueo público «para compartir una liga».
    crearBucket(e, { nombre: x.bucket, bloqueoPublico: { aclsNuevas: false, aclsCualquiera: false, politicasNuevas: false, politicasCualquiera: false } });
    subirObjetos(e, x.bucket, [
      { llave: 'actas/2019/acta-titulacion-2019.pdf', tamano: 2_480_000, tipo: 'application/pdf' },
      { llave: 'actas/2020/acta-titulacion-2020.pdf', tamano: 2_910_000, tipo: 'application/pdf' },
      { llave: 'actas/2021/acta-titulacion-2021.pdf', tamano: 3_120_000, tipo: 'application/pdf' },
      { llave: 'kardex/historico-2015-2022.csv', tamano: 18_400_000, tipo: 'text/csv' }
    ]);

    // El tema de avisos que TI ya usaba con el servidor viejo, con su correo confirmado.
    const tema = crearTema(e, { nombre: x.tema, nombreMostrar: 'TI Altiplano' });
    const suscripcion = crearSuscripcion(e, { temaArn: tema.arn, protocolo: 'email', endpoint: x.correo });
    confirmarSuscripcion(e, suscripcion.arn);

    avanzar(e, reloj.ahora() + 60_000);
    e.bitacora = [];
    anotar(e, 'Laboratorio', 'Inicio', `La cuenta empieza con campus-vpc (${publicas.length} públicas, ${privadas.length} privadas, NAT), campus-db-subnets, campus-alb-sg, portal-web-sg, el tema ${x.tema} y el bucket ${x.bucket}.`);
    return e;
  },

  tareas(datos) {
    const x = datosLab(datos);
    return [
      {
        id: 'portal',
        titulo: 'El portal aguanta las inscripciones',
        puntos: 25,
        html: `
          <p>El portal debe seguir en línea aunque se caiga un servidor o una zona completa, y los servidores no deben quedar expuestos a internet. Todo dentro de ${c(x.vpcNombre)} (${c(x.vpcCidr)}).</p>
          ${vinetas([
            `Un <strong>Application Load Balancer</strong> <em>internet-facing</em>, en las dos subredes <strong>públicas</strong>, que reciba HTTP (80) y reparta a un grupo de destino.`,
            `Un <strong>grupo de Auto Scaling</strong> que use una <em>launch template</em> (Amazon Linux 2023, ${c('t3.micro')} o ${c('t2.micro')}) con este script en <em>User data</em>, tal cual:`
          ])}
          ${bloque(x.userData)}
          ${vinetas([
            'Los servidores viven en las dos subredes <strong>privadas</strong> y no tienen IP pública.',
            'Siempre hay <strong>al menos 2</strong> servidores sanos, uno en cada zona.',
            'Si la aplicación de un servidor deja de contestar, el grupo lo reemplaza solo: usa las revisiones de salud del balanceador (<em>ELB health checks</em>).'
          ])}
          <p>Al final, el DNS del balanceador debe abrir la página y decir «${x.textoPagina}». Nombres sugeridos: ${c(x.plantilla)}, ${c(x.tg)}, ${c(x.alb)} y ${c(x.asg)}.</p>`,
        pista:
          'Se hace en EC2: Launch Templates, Target Groups, Load Balancers y Auto Scaling Groups (en ese orden conviene). Las subredes públicas y privadas se reconocen por su nombre en VPC → Subnets.'
      },
      {
        id: 'puertas',
        titulo: 'Nadie se salta al balanceador',
        puntos: 10,
        html: `
          <p>El grupo ${c(x.sgWeb)} lo dejó el proveedor anterior. Revisa las puertas de los servidores del portal:</p>
          ${vinetas([
            `A los servidores solo les llega HTTP (80) <strong>desde el balanceador</strong> (desde su grupo ${c(x.sgAlb)}), nunca directo desde una IP de internet.`,
            `Nadie de internet puede intentar entrar por SSH (22) a los servidores.`,
            `El balanceador sí recibe HTTP (80) de cualquier lugar: es la puerta pública del portal.`
          ])}`,
        pista: 'Se hace en EC2 → Security Groups (Edit inbound rules). Una regla puede tener como origen otro grupo de seguridad.'
      },
      {
        id: 'base',
        titulo: 'El kardex en una base administrada',
        puntos: 25,
        html: `
          <p>El kardex vivía en un MySQL instalado a mano. Muévelo a una base que AWS administre:</p>
          ${vinetas([
            `Una base <strong>MySQL</strong> en RDS con el identificador ${c(x.db)}, en ${c(x.vpcNombre)}, que <strong>siga funcionando si se cae una zona</strong>: despliegue ${c('Multi-AZ DB instance deployment (2 instances)')}, una principal y una copia en espera en otra zona.`,
            'Nadie de internet la puede alcanzar: sin acceso público y en las subredes <strong>privadas</strong>. Sus datos van <strong>cifrados</strong>.',
            `Solo los servidores del portal se conectan a ella (MySQL, puerto ${c(String(x.puerto))}); ninguna regla de su grupo abre ese puerto a una dirección IP o red. Nombre sugerido para su grupo: ${c(x.sgDb)}.`,
            `El reglamento escolar pide guardar los respaldos automáticos <strong>${x.retencion} días</strong>.`,
            `Antes de mudar los datos, deja un <strong>snapshot manual</strong> de la base (nombre sugerido: ${c(x.snap)}).`
          ])}`,
        pista: 'Se hace en Aurora and RDS → Databases (Create database y, para la foto, Actions). El DB subnet group y el grupo de seguridad se eligen en la sección Connectivity.'
      },
      {
        id: 'archivos',
        titulo: 'Una carpeta que comparten todos los servidores',
        puntos: 10,
        html: `
          <p>El portal genera constancias en PDF. Como un alumno puede caer en cualquier servidor, todos deben ver la <strong>misma carpeta</strong>:</p>
          ${vinetas([
            `Un sistema de archivos <strong>EFS</strong> <em>Regional</em> y cifrado en ${c(x.vpcNombre)} (nombre sugerido: ${c(x.efs)}).`,
            'Con un punto de montaje (<em>mount target</em>) en <strong>cada zona</strong> donde viven los servidores del portal.',
            `<strong>Todos</strong> los servidores del portal lo pueden montar por NFS (2049), y ese puerto no queda abierto a ${c('0.0.0.0/0')}. Nombre sugerido para su grupo: ${c(x.sgEfs)}.`
          ])}`,
        pista: 'Se hace en EFS → File systems (Create file system → Customize) y, para cambiar los grupos después, en la pestaña Network. El grupo de seguridad de los mount targets se crea en EC2 → Security Groups.'
      },
      {
        id: 'actas',
        titulo: 'Las actas históricas, seguras y baratas',
        puntos: 10,
        html: `
          <p>Las actas de titulación ya están en el bucket ${c(x.bucket)}. Se guardan <strong>para siempre</strong>, casi nadie las consulta y, cuando la SEP pide una, puede esperar un día.</p>
          ${vinetas([
            'Nadie de internet puede ver las actas: <strong>todo</strong> el acceso público bloqueado.',
            'Si alguien sobrescribe o borra un acta por error, se puede recuperar.',
            `Todos los objetos del bucket pasan a ${c('Glacier Deep Archive')} a los <strong>${x.diasArchivo} días</strong>, y <strong>ninguna</strong> regla los borra.`
          ])}`,
        pista: 'Se hace en S3, dentro del bucket: pestañas Permissions, Properties y Management.'
      },
      {
        id: 'alertas',
        titulo: 'TI se entera antes que los alumnos',
        puntos: 10,
        html: `
          <p>En el servidor viejo, TI se enteraba de las caídas por las quejas de los alumnos. Ya existe el tema de SNS ${c(x.tema)}, con el correo ${c(x.correo)} confirmado.</p>
          ${vinetas([
            `Una alarma de CloudWatch que vigile la <strong>CPU promedio de todo el grupo</strong> de Auto Scaling del portal (no la de un solo servidor) y se active cuando pase de <strong>${x.umbral} %</strong>.`,
            `Cuando la alarma se active, TI recibe un correo a través del tema ${c(x.tema)}.`
          ])}`,
        pista: 'Se hace en CloudWatch → Alarms → Create alarm. La métrica del grupo está en EC2 → By Auto Scaling Group.'
      },
      {
        id: 'accesos',
        titulo: 'Los servidores leen las actas sin llaves',
        puntos: 5,
        html: `
          <p>El portal necesita <strong>leer</strong> las actas del bucket, pero no debe poder borrarlas ni cambiar nada más, y nadie debe guardar llaves de acceso en el código.</p>
          ${vinetas([
            `Un rol de IAM para EC2 (nombre sugerido: ${c(x.rol)}) con permisos de <strong>solo lectura de S3</strong> y nada más.`,
            '<strong>Todos</strong> los servidores del portal usan ese rol.'
          ])}`,
        pista: 'El rol se crea en IAM → Roles. Los servidores lo toman de la launch template (Advanced details → IAM instance profile): ojo, un servidor ya lanzado no cambia si solo cambias la plantilla.'
      },
      {
        id: 'presupuesto',
        titulo: 'Que la nube no se coma el presupuesto',
        puntos: 5,
        html: `
          <p>La rectoría autorizó <strong>${x.monto} USD al mes</strong> para la nube.</p>
          ${vinetas([
            `Un presupuesto de costo <strong>mensual</strong> de ${c(`${x.monto}`)} USD (nombre sugerido: ${c(x.presupuesto)}).`,
            `Que avise por correo cuando el gasto <strong>real</strong> llegue al <strong>${x.porcentaje} %</strong> de ese monto.`
          ])}`,
        pista: 'Se hace en Billing and Cost Management → Budgets → Create budget (Customize).'
      },
      {
        id: 'escala',
        titulo: 'Que el portal crezca solo',
        puntos: 8,
        bono: true,
        html: `
          <p><strong>Opcional.</strong> El día que abren inscripciones, el tráfico se multiplica por cinco. Si te sobra tiempo, haz que el portal crezca y se encoja solo: suma hasta <strong>8 puntos extra</strong>, que compensan errores de las otras tareas, pero tu calificación nunca pasa de 100.</p>
          ${vinetas([
            `Una política de escalado de <em>target tracking</em> en el grupo del portal que mantenga la CPU promedio cerca del <strong>${x.objetivoCpu} %</strong>.`,
            `Espacio para crecer: capacidad máxima de <strong>${x.maximo} a 10</strong> servidores.`
          ])}`,
        pista: 'Se hace en EC2 → Auto Scaling Groups → tu grupo: la capacidad en Details (Edit) y la política en Automatic scaling. Con «Simular hora pico» puedes verlo crecer.'
      }
    ];
  }
};
