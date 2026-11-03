// Laboratorio de la sesión 6 en el simulador · Escalar y automatizar.
// «La taquería en hora pico»: la versión de simulador del laboratorio de la Ruta
// (s6-lab-escalar). Allá, en DataCamp, el balanceador, la alarma, SNS y SQS
// salen negados; aquí sí se crean y se ven funcionar: el alumno arma la receta
// (plantilla), el que acomoda a los clientes (ALB y grupo de destino), las cajas
// que se abren solas (grupo de Auto Scaling con chequeo ELB), el termostato
// (target tracking), el aviso al gerente (alarma de CloudWatch → SNS → correo) y
// lo pone a prueba con la «hora pico» simulada y una instancia que se cae.
// Bono: las comandas en el riel (cola SQS suscrita al tema).
//
// La cuenta empieza vacía (solo la VPC por omisión). Los datos cambian por
// alumno: nombres con su sufijo, la meta de CPU, el umbral de la alarma y el
// máximo del grupo.

import { anotar, avanzar, cuentaNueva, reloj } from '../consola/modelo.js';
import { bloque, c, scriptApache, vinetas } from './util.js';

export function datosLab(d) {
  const s = d.sufijo;
  return {
    sufijo: s,
    ipCasa: d.ipCasa,
    plantilla: `plantilla-web-${s}`,
    sgWeb: 'web-sg',
    sgAlb: 'alb-sg',
    tg: `tg-web-${s}`,
    alb: `alb-web-${s}`,
    asg: `grupo-web-${s}`,
    nombreInstancias: `web-${s}`,
    zonas: ['us-east-1a', 'us-east-1b'],
    minimo: 2,
    deseado: 2,
    maximo: 3 + (d.octeto % 2), // 3 o 4
    politica: 'Target Tracking Policy',
    objetivoCpu: [40, 50, 60][d.octeto % 3],
    umbral: 70 + (d.octeto % 3) * 5, // 70, 75 u 80
    tema: `alertas-${s}`,
    correo: `gerente.${s}@tacoselguero.mx`,
    alarma: `cpu-alta-${s}`,
    cola: `pedidos-${s}`,
    textoPagina: 'Tacos El Guero',
    textoSucursal: `sucursal ${s}`,
    userData: scriptApache('Tacos El Guero', `Pedidos en linea - sucursal ${s}. Te atiende $(ec2-metadata -i) en $(ec2-metadata -z)`)
  };
}

export const LAB = {
  id: 'lab-s6',
  titulo: 'La taquería en hora pico',
  minutos: 50,
  pistas: true,
  // En «Tus datos» solo va lo que usa este laboratorio (no hay VPC propia: todo va en la VPC por omisión).
  datosVisibles: ['sufijo', 'ipCasa', 'cuentaId'],
  historia: `
    <p><strong>Tacos El Güero</strong> tiene su página de pedidos en línea en <strong>un solo servidor</strong>. Los viernes en la noche y en quincena la fila «da vuelta a la esquina»: el servidor se satura, la página no abre y se pierden pedidos. Y si ese único servidor se cae, no hay quien lo levante hasta el lunes.</p>
    <p>El dueño quiere lo que viste en la sesión 6: que la página viva en <strong>varias cajas iguales en dos zonas</strong>, con alguien en la puerta que <strong>acomode a los clientes</strong> en la caja libre, que <strong>abra más cajas solo</strong> en la hora pico (y las cierre después), que <strong>reemplace solo</strong> una caja que se descompone y que al gerente le llegue un <strong>correo</strong> cuando la cocina esté al rojo.</p>
    <p>La cuenta está nueva: solo trae la VPC por omisión (<code>172.31.0.0/16</code>), con una subred pública en cada zona. Trabaja en <strong>N. Virginia (us-east-1)</strong>. Te conviene seguir el orden de las tareas: cada pieza usa la anterior.</p>
    <p>En el simulador el tiempo de CloudWatch va acelerado: <strong>un minuto de métricas dura 10 segundos</strong>. Así ves crecer el grupo en clase sin esperar media hora.</p>`,

  estadoInicial(datos) {
    const e = cuentaNueva(datos);
    avanzar(e, reloj.ahora() + 1000);
    e.bitacora = [];
    anotar(e, 'Laboratorio', 'Inicio', 'La cuenta empieza nueva: solo la VPC por omisión con una subred pública por zona.');
    return e;
  },

  tareas(datos) {
    const x = datosLab(datos);
    return [
      {
        id: 'plantilla',
        titulo: 'La receta: una plantilla de lanzamiento',
        puntos: 12,
        html: `
          <p>Cada caja nueva de la taquería debe salir idéntica: mismo sistema, mismo tamaño y la misma página. Esa receta es una <strong>plantilla de lanzamiento</strong> (<em>launch template</em>), y Auto Scaling la usa cada vez que abre una caja.</p>
          ${vinetas([
            `Nombre: ${c(x.plantilla)}. Marca la casilla <em>Auto Scaling guidance</em>.`,
            `Amazon Linux 2023 en ${c('t2.micro')} (o ${c('t3.micro')}).`,
            `<em>Key pair</em> y <em>Subnet</em>: ${c("Don't include in launch template")}. La subred la elige el grupo (por eso puede repartir en dos zonas) y aquí no vas a entrar por SSH.`,
            `Un grupo de seguridad ${c(x.sgWeb)} que deje entrar <strong>HTTP (80)</strong>. Puedes crearlo ahí mismo (<em>Create security group</em> → <em>Add security group rule</em>). Lo ideal es que solo deje entrar al balanceador (origen ${c(x.sgAlb)}): eso lo puedes ajustar después, cuando exista ${c(x.sgAlb)}.`,
            `En <em>Advanced details</em> → <em>User data</em>, este script tal cual (instala Apache y escribe la página de tu sucursal):${bloque(x.userData)}`
          ])}`,
        pista:
          'EC2 → Instances → Launch Templates → Create launch template. Es el mismo asistente de Launch instance, pero al final dice Create launch template. El grupo de seguridad se arma en Network settings → Firewall (security groups) y el script va hasta abajo, en Advanced details → User data.'
      },
      {
        id: 'balanceador',
        titulo: 'El que acomoda a los clientes: balanceador y grupo de destino',
        puntos: 20,
        html: `
          <p>Con varias cajas abiertas, alguien en la puerta tiene que decir «pase a la caja 2, que está libre». Ese es el <strong>Application Load Balancer</strong> (ALB): recibe a todos en <strong>una sola dirección</strong> y reparte entre las instancias <strong>sanas</strong> de un <strong>grupo de destino</strong> (<em>target group</em>).</p>
          ${vinetas([
            `Un grupo de destino ${c(x.tg)}: tipo <em>Instances</em>, protocolo ${c('HTTP')} puerto ${c('80')}, en la VPC por omisión, con el <em>health check</em> HTTP en la ruta ${c('/')}. <strong>No registres instancias a mano</strong>: el grupo de Auto Scaling las va a registrar solo.`,
            `Un grupo de seguridad ${c(x.sgAlb)} (en la VPC por omisión) que deje entrar HTTP (80) desde ${c('0.0.0.0/0')}: el balanceador es la puerta para todos tus clientes.`,
            `Un <em>Application Load Balancer</em> ${c(x.alb)}: <em>Internet-facing</em>, IPv4, en <strong>dos zonas</strong> (${c(x.zonas[0])} y ${c(x.zonas[1])}), con el grupo ${c(x.sgAlb)} y un <em>listener</em> ${c('HTTP:80')} que haga <em>Forward to</em> → ${c(x.tg)}.`,
            'Espera a que su <em>State</em> pase de <em>Provisioning</em> a <em>Active</em> (unos 20 segundos).'
          ])}`,
        pista:
          'Todo está en EC2, en la sección Load Balancing del menú: primero Target Groups → Create target group, luego Load Balancers → Create load balancer → Application Load Balancer. El grupo de seguridad del balanceador se crea en EC2 → Network & Security → Security Groups → Create security group. AWS pide al menos dos zonas para un ALB: si falla una, la otra sigue atendiendo.'
      },
      {
        id: 'grupo',
        titulo: 'Las cajas que se abren solas: el grupo de Auto Scaling',
        puntos: 23,
        html: `
          <p>Ahora junta las piezas: un <strong>grupo de Auto Scaling</strong> que mantenga siempre vivas las instancias de tu receta, las reparta en dos zonas y las meta solito al grupo de destino del balanceador.</p>
          ${vinetas([
            `Nombre ${c(x.asg)}, con la plantilla ${c(x.plantilla)} (versión <em>Default</em> o <em>Latest</em>).`,
            `Red: la VPC por omisión y las subredes de ${c(x.zonas[0])} y ${c(x.zonas[1])}.`,
            `Balanceo: <em>Attach to an existing load balancer</em> → <em>Choose from your load balancer target groups</em> → ${c(x.tg)}. En <em>Health checks</em> marca <em>Turn on Elastic Load Balancing health checks</em>: así el grupo reemplaza también una instancia prendida cuyo Apache no contesta.`,
            `Tamaño: <em>Desired capacity</em> ${c(String(x.deseado))}, <em>Min desired capacity</em> ${c(String(x.minimo))} y <em>Max desired capacity</em> ${c(String(x.maximo))}. El máximo es tu tope de gasto.`,
            `(Opcional) Una etiqueta ${c('Name')} = ${c(x.nombreInstancias)} para reconocer tus instancias en la lista.`,
            `Al final, en ${c(x.tg)} → <em>Targets</em> debe haber <strong>dos instancias healthy</strong>, y el <em>DNS name</em> de ${c(x.alb)} debe abrir la página que dice «Tacos El Guero» y «${x.textoSucursal}». Ábrela con <em>Open in browser</em> y recarga varias veces: cada vez te puede atender otra instancia.`
          ])}`,
        pista:
          'EC2 → Auto Scaling → Auto Scaling Groups → Create Auto Scaling group: es un asistente de 7 pasos (la plantilla, la red y las zonas, el balanceador y los health checks, el tamaño y la política, avisos, etiquetas y revisión). Si los destinos salen unhealthy, revisa que el grupo de seguridad de las instancias deje entrar el 80 desde el balanceador.'
      },
      {
        id: 'politica',
        titulo: 'El termostato: política de seguimiento de objetivo',
        puntos: 10,
        html: `
          <p>Una política de <strong>seguimiento de objetivo</strong> (<em>target tracking</em>) funciona como un termostato: tú dices a qué temperatura quieres la cocina y el grupo abre o cierra cajas para mantenerla, sin pasar del máximo ni bajar del mínimo.</p>
          ${vinetas([
            `En ${c(x.asg)}, una política <em>Target tracking scaling</em> con <em>Metric type</em> ${c('Average CPU utilization')} y <em>Target value</em> ${c(String(x.objetivoCpu))}.`,
            `Puedes crearla en el paso 4 del asistente del grupo o después, en la pestaña <em>Automatic scaling</em>. Deja el nombre ${c(x.politica)}.`,
            'Luego asómate a CloudWatch → Alarms: la política crea sola dos alarmas <code>TargetTracking-…-AlarmHigh</code> y <code>…-AlarmLow</code>. Son las que la disparan; no las edites ni las borres.'
          ])}`,
        pista:
          'EC2 → Auto Scaling Groups → tu grupo → pestaña Automatic scaling → Dynamic scaling policies → Create dynamic scaling policy (Policy type: Target tracking scaling). Si la hiciste en el asistente, ya debe aparecer ahí.'
      },
      {
        id: 'alarma',
        titulo: 'Que el gerente se entere: alarma con aviso por correo',
        puntos: 15,
        html: `
          <p>El gerente quiere un correo cuando la cocina esté al rojo. Eso se arma con dos servicios: <strong>CloudWatch</strong> vigila la métrica y prende la alarma, y <strong>SNS</strong> reparte el aviso a quien esté suscrito.</p>
          ${vinetas([
            `Un tema de SNS <em>Standard</em> llamado ${c(x.tema)}.`,
            `Una suscripción <em>Email</em> a ese tema (puedes usar ${c(x.correo)}). <strong>Confírmala</strong>: abre la «Bandeja de correo (simulada)» y pulsa <em>Confirm subscription</em>. Mientras diga <em>Pending confirmation</em>, no te llega nada.`,
            `Una alarma ${c(x.alarma)} sobre la métrica ${c('CPUUtilization')} de EC2 <strong>por grupo de Auto Scaling</strong> (${c(`AutoScalingGroupName = ${x.asg}`)}), estadística ${c('Average')}, periodo ${c('5 minutes')}, condición <em>Greater</em> que ${c(String(x.umbral))}.`,
            `En sus acciones: <em>Notification</em>, cuando esté <em>In alarm</em>, al tema ${c(x.tema)}.`
          ])}`,
        pista:
          'El tema y la suscripción se hacen en Simple Notification Service (SNS) → Topics → Create topic, y dentro del tema → Create subscription. Para confirmar, el botón «Bandeja de correo (simulada)» está arriba a la derecha de la lista de Topics (y en el menú de la izquierda, sección Simulador). La alarma, en CloudWatch → Alarms → All alarms → Create alarm → Select metric → EC2 → By Auto Scaling Group → CPUUtilization de tu grupo. En el paso Configure actions eliges el tema existente.'
      },
      {
        id: 'pruebas',
        titulo: 'Ponlo a prueba: hora pico y una caja que se cae',
        puntos: 20,
        html: `
          <p>Ya está todo armado. Ahora compruébalo como lo haría el dueño: llena la taquería y luego descompón una caja. <strong>Haz esto al final</strong>, cuando la alarma ya exista y tu correo ya esté confirmado.</p>
          ${vinetas([
            `<strong>Hora pico.</strong> En el detalle de ${c(x.asg)} pulsa el botón del simulador «Simular hora pico». En uno o dos minutos, en la pestaña <em>Activity</em> verás que lanza instancias porque la alarma <em>AlarmHigh</em> disparó tu política (sube hasta ${x.maximo}), y en la Bandeja de correo te llega <em>ALARM: "${x.alarma}"…</em>. Cuando pasa la hora pico, el grupo vuelve a cerrar cajas solo.`,
            `<strong>Una caja que se cae.</strong> En EC2 → Instances termina (<em>Terminate</em>) una instancia de tu grupo. En <em>Activity</em> verás «Terminating EC2 instance» por el <em>health check</em> y luego «Launching a new EC2 instance» para reemplazarla.`,
            'Nadie tuvo que hacer nada: eso es <strong>elasticidad</strong> y <strong>alta disponibilidad</strong>.'
          ])}`,
        pista:
          'Todo se ve en EC2 → Auto Scaling Groups → tu grupo: el botón Simular hora pico está en el detalle y lo que pasa sale en la pestaña Activity (refresca con el botón de las flechas). El correo llega a la Bandeja de correo (simulada): en Simple Notification Service está en el menú de la izquierda, sección Simulador, y como botón arriba a la derecha de las páginas Topics y Subscriptions. Para la caja que se cae: EC2 → Instances → selecciona una del grupo → Instance state → Terminate (delete) instance.'
      },
      {
        id: 'cola',
        titulo: 'Bono: las comandas en el riel (cola SQS)',
        puntos: 10,
        bono: true,
        html: `
          <p>En la taquería el cajero no espera a que salgan los tacos: deja la comanda en el riel y sigue cobrando. Eso es <strong>desacoplar</strong>. Haz que cada aviso del tema quede también guardado en una <strong>cola</strong>, aunque nadie lo esté leyendo en ese momento.</p>
          ${vinetas([
            `Una cola de SQS <em>Standard</em> llamada ${c(x.cola)}.`,
            `Suscríbela al tema ${c(x.tema)} desde la cola, con <em>Subscribe to Amazon SNS topic</em>: así la consola también le da permiso a SNS de escribir en ella.`,
            `Publica un mensaje en ${c(x.tema)} (<em>Publish message</em>) y comprueba que llegó a la cola (<em>Send and receive messages</em> → <em>Poll for messages</em>).`
          ])}
          <p>Es opcional: suma hasta 10 puntos extra para compensar errores, sin pasar de 100.</p>`,
        pista:
          'Simple Queue Service (SQS) → Queues → Create queue (Type: Standard). En el detalle de la cola, pestaña SNS subscriptions → Subscribe to Amazon SNS topic. El mensaje se publica en SNS → Topics → tu tema → Publish message.'
      }
    ];
  }
};
