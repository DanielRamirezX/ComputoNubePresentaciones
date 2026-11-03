// Práctica integradora 1 (sesión 9 de la Ruta AWS) · La tienda de artesanías de Oaxaca.
// «Barro y Telar», una cooperativa de artesanos de los Valles Centrales, vende
// en línea. Su tienda vivía en un solo servidor y en el Buen Fin pasado se cayó
// dos veces. El alumno monta la arquitectura clásica de dos capas con alta
// disponibilidad: VPC propia con subredes públicas y privadas en dos zonas,
// grupos de seguridad encadenados (balanceador → web → base), una plantilla de
// lanzamiento con user data, un grupo de Auto Scaling detrás de un Application
// Load Balancer, una base RDS MySQL Multi-AZ en las privadas, un bucket para
// las fotos y una alarma de CPU que avisa por SNS. El bono es «la prueba del
// Buen Fin»: simular la hora pico y ver que la alarma avisa y el grupo crece.
//
// La cuenta empieza vacía (solo la VPC por omisión): todo lo construye el alumno.
// Datos distintos por alumno: su VPC (10.<octeto>.0.0/16), el sufijo del bucket
// y de la página, el objetivo de CPU de la política, el umbral de la alarma y
// los días de respaldo de la base.

import { anotar, cuentaNueva } from '../consola/modelo.js';
import { bloque, c, scriptApache, vinetas } from './util.js';

export function datosLab(d) {
  return {
    sufijo: d.sufijo,
    ipCasa: d.ipCasa,
    // La red
    vpcCidr: d.vpcCidr,
    vpcNombre: 'tienda-vpc',
    // Los grupos de seguridad encadenados
    sgAlb: 'tienda-alb-sg',
    sgWeb: 'tienda-web-sg',
    sgDb: 'tienda-db-sg',
    puertoDb: 3306,
    // Los servidores web
    plantilla: 'tienda-web',
    asg: 'tienda-asg',
    tipos: ['t2.micro', 't3.micro'],
    min: 2,
    deseado: 2,
    max: 4,
    objetivoCpu: [50, 60][d.octeto % 2],
    // El balanceador
    tg: 'tienda-tg',
    alb: 'tienda-alb',
    textoPagina: 'Barro y Telar',
    textoTaller: `taller ${d.sufijo}`,
    userData: scriptApache('Barro y Telar', `Artesanias de Oaxaca - taller ${d.sufijo} - te atiende el servidor $(ec2-metadata -i) en $(ec2-metadata -z)`),
    // La base de datos
    db: 'tienda-db',
    subnetGroup: 'tienda-db-privadas',
    retencion: [7, 10, 14][d.octeto % 3],
    // Las fotos
    bucket: `barroytelar-fotos-${d.sufijo}`,
    // Las alertas
    tema: 'tienda-alertas',
    alarma: 'tienda-cpu-alta',
    umbral: [70, 75, 80][d.octeto % 3]
  };
}

export const LAB = {
  id: 'practica-1',
  titulo: 'La tienda de artesanías de Oaxaca vende en línea',
  minutos: 85,
  pistas: true,
  historia: `
    <p><strong>Barro y Telar</strong> es una cooperativa de artesanas y artesanos de los Valles Centrales de Oaxaca: barro negro de San Bartolo Coyotepec, alebrijes de San Martín Tilcajete y tapetes de lana de Teotitlán del Valle. Venden en línea a todo México y a Estados Unidos.</p>
    <p>Hoy su tienda vive en <strong>una sola computadora</strong>, con la página y la base de datos juntas. En el Buen Fin pasado se cayó dos veces: una por tanta gente al mismo tiempo y otra porque el servidor se apagó solo. Esas horas sin tienda fueron pedidos perdidos. Para este Buen Fin te contratan para montarla <strong>como se hace en la nube</strong>:</p>
    <ul>
      <li><strong>Que no se caiga:</strong> todo repartido en <strong>dos zonas de disponibilidad</strong>; si una falla, la otra sigue vendiendo.</li>
      <li><strong>Que aguante la hora pico:</strong> un balanceador reparte a los clientes y un grupo de Auto Scaling agrega servidores cuando sube la carga (y los quita cuando baja, para no pagar de más).</li>
      <li><strong>Que los datos estén a salvo:</strong> la base de pedidos en RDS, privada, cifrada, con respaldos y una copia en espera en otra zona; las fotos de los productos en un bucket que nadie de afuera pueda abrir.</li>
      <li><strong>Que avise:</strong> si la CPU se dispara, que llegue un correo.</li>
    </ul>
    <p>Es una arquitectura de <strong>dos capas</strong>: la capa web (balanceador y servidores) y la capa de datos (la base). Cada capa solo deja entrar a la anterior: internet → balanceador → servidores → base.</p>
    <p>Tu cuenta empieza vacía (solo la VPC por omisión, que <strong>no</strong> se usa). Todo va en <strong>N. Virginia (us-east-1)</strong>. Puedes hacer las tareas en otro orden, pero este funciona bien: red → grupos de seguridad → plantilla y Auto Scaling → balanceador → base → fotos → alarma. Lo que se califica es cómo queda tu cuenta: usa «Revisar mi avance» cuando quieras. La última tarea es un <strong>bono opcional</strong> que suma encima, sin pasar de 100.</p>`,

  estadoInicial(datos) {
    const e = cuentaNueva(datos);
    e.bitacora = [];
    anotar(e, 'Laboratorio', 'Inicio', 'La cuenta empieza vacía: solo la VPC por omisión. La tienda Barro y Telar se monta desde cero.');
    return e;
  },

  tareas(datos) {
    const x = datosLab(datos);
    return [
      {
        id: 'red',
        titulo: 'La red de la tienda, en dos zonas',
        puntos: 15,
        html: `
          <p>La tienda necesita su propia red, separada de todo lo demás y repartida en <strong>dos zonas de disponibilidad</strong> (dos centros de datos distintos de N. Virginia).</p>
          ${vinetas([
            `Una VPC con el bloque ${c(x.vpcCidr)} (puedes llamarla ${c(x.vpcNombre)}), con un Internet Gateway conectado.`,
            'Dos subredes <strong>públicas</strong>, cada una en una zona distinta (por ejemplo us-east-1a y us-east-1b): por ahí entrarán los clientes desde internet. Su tabla de rutas manda <code>0.0.0.0/0</code> al Internet Gateway.',
            'Dos subredes <strong>privadas</strong>, también en dos zonas distintas: ahí vivirá la base de datos y <strong>nadie de internet</strong> debe poder llegar a ellas (su tabla de rutas <strong>no</strong> manda <code>0.0.0.0/0</code> al Internet Gateway).'
          ])}
          <p>Vale usar el asistente que crea todo de una vez.</p>`,
        pista:
          'Todo está en el servicio VPC. El camino corto es Your VPCs → Create VPC → «VPC and more»: eliges 2 Availability Zones, 2 subredes públicas y 2 privadas, y la consola crea el Internet Gateway y las tablas de rutas. En NAT gateways deja «None»: la tienda no lo necesita y cuesta por hora. Recuerda que lo que hace pública a una subred es su tabla de rutas (0.0.0.0/0 → igw-…), no su nombre.'
      },
      {
        id: 'seguridad',
        titulo: 'Cada capa solo deja entrar a la anterior',
        puntos: 15,
        html: `
          <p>Tres grupos de seguridad dentro de tu VPC, <strong>encadenados</strong>: internet → balanceador → servidores web → base de datos.</p>
          ${vinetas([
            `El del balanceador (puedes llamarlo ${c(x.sgAlb)}): los clientes deben poder entrar por <strong>HTTP (80)</strong> desde cualquier lugar (${c('0.0.0.0/0')}).`,
            `El de los servidores web (${c(x.sgWeb)}): HTTP (80) <strong>solo</strong> desde el grupo del balanceador. El origen de la regla es el grupo ${c('sg-…')}, no una IP ni una red. Nadie de internet entra por SSH.`,
            `El de la base (${c(x.sgDb)}): <strong>MYSQL/Aurora (${x.puertoDb})</strong> <strong>solo</strong> desde el grupo de los servidores web. Ninguna IP ni red puede llegar a la base.`
          ])}
          <p>Así, aunque alguien conozca la IP privada de un servidor o de la base, no puede llegarle: solo pasa quien trae el «gafete» del grupo anterior.</p>`,
        pista:
          'Los tres se crean en EC2 → Security Groups → Create security group, eligiendo tu VPC (no la default). Créalos en orden: primero el del balanceador, luego el web y al final el de la base. En la regla de entrada, con Source type «Custom», escribe en Source el nombre del grupo anterior y elige de la lista el grupo (sg-…) que aparece con ese nombre, no la opción «Use: …»: así entra cualquier recurso que tenga ese grupo, aunque cambie su IP. El tipo para la base es «MYSQL/Aurora».'
      },
      {
        id: 'servidores',
        titulo: 'Servidores web que se curan y crecen solos',
        puntos: 20,
        html: `
          ${vinetas([
            `Una plantilla de lanzamiento (<em>Launch template</em>, puedes llamarla ${c(x.plantilla)}) con <strong>Amazon Linux 2023</strong>, tipo ${c('t2.micro')} o ${c('t3.micro')}, el grupo ${c(x.sgWeb)} y este <strong>User data</strong> tal cual:`
          ])}
          ${bloque(x.userData)}
          ${vinetas([
            `Un grupo de Auto Scaling (${c(x.asg)}) que use esa plantilla y reparta sus servidores en <strong>dos zonas</strong>: elige dos subredes de tu VPC en zonas distintas (las públicas sirven).`,
            `Capacidad: <strong>mínimo ${x.min}</strong>, deseada ${x.deseado} y <strong>máximo ${x.max}</strong>. Así nunca baja de un servidor por zona y el gasto tiene un tope.`,
            `Una política de escalado de <strong>seguimiento de objetivo</strong> (<em>Target tracking</em>): CPU promedio al <strong>${x.objetivoCpu} %</strong>.`,
            `Al final, al menos ${x.min} servidores del grupo <strong>en servicio</strong> (InService), en zonas distintas.`
          ])}`,
        pista:
          'La plantilla se crea en EC2 → Launch Templates → Create launch template. En la red de la plantilla no elijas subred («Don\'t include in launch template»): la elige el grupo. El User data está al final, en Advanced details. El grupo se crea en EC2 → Auto Scaling Groups → Create Auto Scaling group: en el paso de red eliges tu VPC y dos subredes de zonas distintas; en el de tamaño pones la capacidad y eliges «Target tracking scaling policy» con Average CPU utilization. El balanceador puedes conectarlo aquí mismo o después (tarea siguiente).'
      },
      {
        id: 'balanceador',
        titulo: 'Un balanceador que reparte a los clientes',
        puntos: 15,
        html: `
          ${vinetas([
            `Un grupo de destino (<em>Target group</em>, puedes llamarlo ${c(x.tg)}) de tipo <strong>Instances</strong>, HTTP en el puerto 80, en tu VPC.`,
            `Un <strong>Application Load Balancer</strong> <em>Internet-facing</em> (${c(x.alb)}) en tus <strong>dos subredes públicas</strong>, con el grupo ${c(x.sgAlb)} y un listener <strong>HTTP:80</strong> que mande (<em>forward</em>) al grupo de destino.`,
            `Tu grupo de Auto Scaling conectado a ese grupo de destino y con revisiones de salud de tipo <strong>ELB</strong>: si Apache deja de contestar, el grupo reemplaza al servidor.`
          ])}
          <p>Al final, cualquier cliente debe poder abrir <code>http://</code> + el <strong>DNS name</strong> del balanceador y ver «${x.textoPagina}» y «${x.textoTaller}». Si recargas, verás que te atienden servidores distintos.</p>`,
        pista:
          'Se hace en EC2 → Target Groups (Create target group) y en EC2 → Load Balancers → Create load balancer → Application Load Balancer. El balanceador pide al menos dos subredes en dos zonas: elige las públicas (en las privadas no le llega nadie de internet). Para conectar tu grupo de Auto Scaling: en su detalle, pestaña Integrations → Load balancing → Edit, y en Health checks prende «Elastic Load Balancing health checks». El DNS name y el botón «Open in browser» están en el detalle del balanceador; tarda unos segundos en quedar Active y los destinos en quedar healthy.'
      },
      {
        id: 'base',
        titulo: 'La base de pedidos: privada y en dos zonas',
        puntos: 15,
        html: `
          ${vinetas([
            `Una base de <strong>Aurora and RDS</strong> con motor <strong>MySQL</strong> (puedes llamarla ${c(x.db)}), con despliegue <strong>Multi-AZ DB instance</strong>: una copia en espera en otra zona que toma el lugar de la principal si esta falla.`,
            `En tu VPC y en tus <strong>subredes privadas</strong> (un <em>DB subnet group</em> con las dos privadas, puedes llamarlo ${c(x.subnetGroup)}), con <strong>Public access: No</strong> y el grupo ${c(x.sgDb)}.`,
            `<strong>Cifrada</strong> (los pedidos traen nombres, direcciones y teléfonos) y con respaldos automáticos de <strong>${x.retencion} días</strong>.`
          ])}
          <p>Al final debe estar <em>Available</em> y los servidores web deben poder conectarse a ella por el puerto ${x.puertoDb}.</p>`,
        pista:
          'Primero crea el DB subnet group en Aurora and RDS → Subnet groups → Create DB subnet group, con tu VPC y solo tus dos subredes privadas: si dejas que la consola lo arme sola, usa todas las subredes de la VPC y la base podría quedar en una pública. Luego Databases → Create database → Standard create, MySQL, plantilla Dev/Test (Free tier no deja Multi-AZ). En Connectivity eliges tu VPC, tu subnet group, Public access «No» y el grupo tienda-db-sg (quita el default). La retención de respaldos y el cifrado están en Additional configuration. Tarda unos 30 segundos.'
      },
      {
        id: 'fotos',
        titulo: 'Las fotos de los productos, a salvo',
        puntos: 10,
        html: `
          <p>Cada pieza es única y sus fotos también: si se pierden, hay que volver a fotografiar todo el catálogo.</p>
          ${vinetas([
            `Un bucket de S3 llamado exactamente ${c(x.bucket)}.`,
            '<strong>Todo</strong> el acceso público bloqueado: las fotos las muestra la tienda, nadie las abre directo del bucket.',
            'Versionado activado: si alguien borra o reemplaza una foto por error, la versión anterior se recupera.'
          ])}`,
        pista:
          'Todo está en S3: Create bucket. El nombre tiene que ser exacto (los nombres de bucket son únicos en todo el mundo, por eso lleva tu sufijo). «Block all public access» viene marcado: déjalo así. El versionado se activa al crearlo (Bucket Versioning → Enable) o después en la pestaña Properties.'
      },
      {
        id: 'alarma',
        titulo: 'Que la tienda avise si algo va mal',
        puntos: 10,
        html: `
          ${vinetas([
            `Un tema de <strong>SNS</strong> (puedes llamarlo ${c(x.tema)}) con una suscripción de tipo <strong>Email</strong> a tu correo, ya <strong>confirmada</strong>.`,
            `Una alarma de <strong>CloudWatch</strong> (${c(x.alarma)}) sobre la <strong>CPU promedio de tu grupo de Auto Scaling</strong> (la métrica CPUUtilization por AutoScalingGroupName, no la de una sola instancia) que se dispare cuando pase de <strong>${x.umbral} %</strong>.`,
            'Cuando entre en alarma (<em>In alarm</em>), que avise a tu tema.'
          ])}`,
        pista:
          'El tema y la suscripción están en Simple Notification Service → Topics → Create topic (Standard) y luego Create subscription con protocolo Email. El correo de confirmación llega a la «Bandeja de correo (simulada)» de SNS: ábrelo y pulsa «Confirm subscription». La alarma: CloudWatch → Alarms → Create alarm → Select metric → EC2 → By Auto Scaling Group → CPUUtilization de tu grupo; condición «Greater» que el umbral, y en las acciones eliges tu tema para «In alarm». Las instancias de un grupo se reemplazan: una alarma sobre una sola instancia se queda vigilando a una que ya no existe.'
      },
      {
        id: 'prueba',
        titulo: 'La prueba del Buen Fin',
        puntos: 10,
        bono: true,
        html: `
          <p><strong>Opcional.</strong> Antes del Buen Fin, la cooperativa quiere ver que todo reacciona solo. Si te sobra tiempo, haz la prueba: suma hasta <strong>10 puntos extra</strong>, que compensan errores de las otras tareas, pero tu calificación nunca pasa de 100.</p>
          ${vinetas([
            `En el detalle de tu grupo de Auto Scaling, usa el botón del simulador <strong>«Simular hora pico»</strong> para subir la CPU de los servidores.`,
            `Tu alarma ${c(x.alarma)} debe pasar a <strong>In alarm</strong> y su correo debe llegar a la Bandeja (simulada).`,
            `El grupo debe <strong>crecer solo</strong> por tu política de seguimiento (lo ves en su pestaña Activity: «a monitor alarm … triggered policy …»).`
          ])}`,
        pista:
          'Simular hora pico está en EC2 → Auto Scaling Groups → tu grupo. En el simulador cada periodo de una métrica dura 10 segundos: la alarma necesita uno o más periodos arriba del umbral y el grupo crece tras 3 periodos arriba del objetivo. Mira CloudWatch → Alarms, la Bandeja de SNS y la pestaña Activity del grupo. Cuando el grupo crece, la CPU promedio baja y la alarma puede volver a OK: su pestaña History guarda que sí sonó. Si no te llega el correo, revisa que tu suscripción esté Confirmed.'
      }
    ];
  }
};
