// ---------------------------------------------------------------------------
// RUTA AWS CLOUD PRACTITIONER · SESIÓN 6 · ESCALAR Y AUTOMATIZAR
//
// Elasticidad, balanceadores de carga, EC2 Auto Scaling, CloudWatch y
// CloudTrail, cómputo sin servidores (Lambda, Fargate) y cómo desacoplar una
// aplicación (SQS, SNS, EventBridge). Dominio "Tecnología y servicios" y los
// principios de diseño del dominio "Conceptos de la nube" del CLF-C02.
//
// El sandbox deja crear plantillas de lanzamiento y grupos de Auto Scaling de
// hasta 3 instancias, y ver las métricas de CloudWatch. Niega los
// balanceadores (DescribeLoadBalancers), crear alarmas y tableros de
// CloudWatch (PutMetricAlarm), y no ofrece Lambda, SNS ni SQS. Por eso la
// política de escalado automático falla al crear el grupo: necesita una
// alarma. El laboratorio se apoya en lo que sí funciona: el grupo reemplaza
// solo una instancia que se termina y crece cuando se le pide. Todo verificado
// en el sandbox el 15 de octubre de 2026.
// ---------------------------------------------------------------------------

import { boton, capturasDe, codigo, icono, lista, nubi, recuadro } from './piezas.js';

const captura = capturasDe('s6');
const capturaS1 = capturasDe('s1');
const capturaS2 = capturasDe('s2');

const SCRIPT = `#!/bin/bash
dnf install -y httpd
echo "<h1>Hola desde el grupo de Auto Scaling</h1><p>Te atiende $(ec2-metadata -i) en $(ec2-metadata -z)</p>" > /var/www/html/index.html
systemctl enable --now httpd`;

export const SESION_6 = {
  numero: 6,
  titulo: 'Escalar y automatizar',
  subtitulo: 'Sesión 6 · Escalar y automatizar',
  resumen:
    'Cómo crece y se encoge una aplicación en AWS sin que nadie se desvele: elasticidad, balanceadores de carga, grupos de Auto Scaling, monitoreo con CloudWatch, código sin servidores con Lambda y colas para desacoplar. En el sandbox armas un grupo de servidores en dos zonas, rompes uno a propósito y ves cómo AWS lo reemplaza solo.',
  duracion: '2 horas',
  minutosSandbox: 35,

  practica: {
    titulo: 'Examen de práctica · Sesión 6',
    corto: 'Examen de práctica',
    resumen: '20 preguntas de escalado, monitoreo y servicios sin servidores al estilo del examen de certificación, unos 17 minutos, una sola entrega.',
    plegable: 'Ver cómo es el examen real'
  },

  capitulos: [
    /* ================================================================ 1 */
    {
      numero: 1,
      titulo: 'Antes de encender el sandbox',
      descripcion:
        'Qué significa que la nube sea elástica, cómo un balanceador reparte a los clientes, cómo un grupo de Auto Scaling agrega y quita servidores, quién vigila todo (CloudWatch y CloudTrail) y cómo se arma una aplicación sin servidores y con piezas desacopladas. Este capítulo se hace con el sandbox apagado.',
      actividades: [
        {
          id: 's6-elasticidad',
          tipo: 'leccion',
          titulo: 'Crecer y encogerse: la elasticidad',
          xp: 50,
          minutos: 7,
          laminas: [
            {
              titulo: 'La taquería en hora pico',
              html: `
                <p class="entrada">Una taquería tiene una sola caja. A las dos de la tarde la fila da vuelta a la esquina. Tiene dos caminos:</p>
                <div class="rejilla rejilla--3 roles">
                  <article class="rol">${icono('cpu')}<h3>Escalar vertical</h3><p>Cambiar al cajero por uno <strong>más rápido</strong>. En AWS: una instancia más grande (de t2.micro a t2.large). Tiene un límite y hay que detener la máquina.</p></article>
                  <article class="rol">${icono('servidor')}<h3>Escalar horizontal</h3><p>Abrir <strong>más cajas</strong>. En AWS: más instancias iguales trabajando juntas. Casi no tiene límite y no hay que apagar nada.</p></article>
                  <article class="rol">${icono('reloj')}<h3>Elasticidad</h3><p>Abrir cajas a la hora pico y <strong>cerrarlas</strong> cuando se va la gente, solo. Pagas por las cajas abiertas, no por las que podrías necesitar.</p></article>
                </div>
                ${recuadro('examen', '<em>“Escalabilidad”</em> es poder crecer. <em>“Elasticidad”</em> es crecer <strong>y encogerse</strong> automáticamente según la demanda. Si la pregunta dice “pagar solo por lo que se usa cuando el tráfico cambia”, la respuesta es elasticidad.')}`,
              notas: 'Pregunta al grupo qué negocio conocen que tenga horas pico (cine, banco en quincena, inscripciones). Ese es el caso típico de elasticidad.'
            },
            {
              titulo: 'El grupo de Auto Scaling',
              html: `
                <p class="entrada"><strong>Amazon EC2 Auto Scaling</strong> maneja un <strong>grupo</strong> de instancias iguales, hechas con una misma <strong>plantilla de lanzamiento</strong> (launch template). Tú solo le das tres números:</p>
                ${captura('32-asg-diagrama', 'El diagrama de Auto Scaling: tamaño mínimo, capacidad deseada y tamaño máximo', [
                  [32.7, 66.7, '<strong>Mínimo</strong>: nunca habrá menos'],
                  [61.4, 66.7, 'Crece cuando hace falta'],
                  [49.9, 86.7, '<strong>Máximo</strong>: nunca habrá más (tope de gasto)']
                ])}
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Política de escalado</th><th scope="col">Cómo decide</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Seguimiento de objetivo (target tracking)</th><td>“Mantén la CPU promedio en 50 %”. Agrega o quita instancias para lograrlo, como un termostato.</td></tr>
                      <tr><th scope="row">Por pasos (step)</th><td>“Si la CPU pasa de 70 %, agrega 2; si pasa de 90 %, agrega 4”.</td></tr>
                      <tr><th scope="row">Programada (scheduled)</th><td>“Los lunes a las 8:00 sube a 6 instancias”. Para picos que ya conoces.</td></tr>
                      <tr><th scope="row">Predictiva</th><td>Aprende de las semanas anteriores y prepara instancias <strong>antes</strong> del pico.</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('recuerda', 'Auto Scaling también <strong>cura</strong>: revisa la salud de cada instancia y, si una falla, la termina y lanza otra. En el laboratorio vas a romper una a propósito para verlo.')}`,
              notas: 'El diagrama es la portada real de Auto Scaling en la consola. Las políticas que dependen de una métrica (objetivo y pasos) usan alarmas de CloudWatch por dentro.'
            }
          ]
        },
        {
          id: 's6-ex-escalar',
          tipo: 'clasificar',
          titulo: '¿Más grande o más copias?',
          xp: 50,
          minutos: 3,
          contexto: '<p>Una tienda en línea se prepara para el Buen Fin. Su equipo discute cómo aguantar la carga.</p>',
          pregunta: 'Decide si cada idea es escalar vertical u horizontal.',
          grupos: [
            { id: 'vertical', nombre: 'Escalar vertical', color: 'blue' },
            { id: 'horizontal', nombre: 'Escalar horizontal', color: 'green' }
          ],
          fichas: [
            { texto: 'Cambiar la instancia t2.micro por una t2.xlarge', grupo: 'vertical', retro: 'Misma máquina, más grande: vertical.' },
            { texto: 'Pasar de 2 a 10 servidores web iguales', grupo: 'horizontal', retro: 'Más copias: horizontal.' },
            { texto: 'Darle más memoria a la base de datos', grupo: 'vertical', retro: 'Crecer la misma máquina: vertical.' },
            { texto: 'Que un grupo de Auto Scaling agregue instancias en la hora pico', grupo: 'horizontal', retro: 'Auto Scaling agrega o quita instancias: horizontal.' },
            { texto: 'Repartir las instancias en tres zonas de disponibilidad', grupo: 'horizontal', retro: 'Varias copias en varias zonas: horizontal, y además más disponible.' },
            { texto: 'Detener el servidor para cambiarle el tipo de instancia', grupo: 'vertical', retro: 'Cambiar el tipo exige detenerla: es la desventaja de escalar vertical.' }
          ],
          cierre: 'Vertical: la misma máquina, más grande, con un límite y casi siempre con una pausa. Horizontal: más máquinas iguales, sin pausa; es lo que hace Auto Scaling.',
          pista: '¿Cambia el tamaño de una máquina o cambia el número de máquinas?'
        },
        {
          id: 's6-balanceadores',
          tipo: 'leccion',
          titulo: 'El balanceador de carga',
          xp: 50,
          minutos: 6,
          laminas: [
            {
              titulo: 'El que acomoda a los clientes',
              html: `
                <p class="entrada">Con diez cajas abiertas, alguien tiene que decir “pase a la caja 4, que está libre”. Eso hace <strong>Elastic Load Balancing</strong> (ELB): recibe a todos los clientes en <strong>una sola dirección</strong> y los reparte entre las instancias sanas, en varias zonas.</p>
                <div class="rejilla rejilla--3 valores">
                  <div>${icono('red')}<strong>Reparte</strong><p>Ninguna instancia se satura mientras otra descansa.</p></div>
                  <div>${icono('check')}<strong>Revisa la salud</strong><p>Si una instancia no responde, deja de mandarle clientes.</p></div>
                  <div>${icono('escudo')}<strong>Varias zonas</strong><p>Si se cae una zona entera, sigue atendiendo con las otras.</p></div>
                </div>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Tipo</th><th scope="col">Trabaja con</th><th scope="col">Para qué</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Application Load Balancer (ALB)</th><td>HTTP y HTTPS (capa 7)</td><td>Sitios y APIs. Decide por la ruta o el dominio: <em>/api</em> a unos servidores, <em>/imagenes</em> a otros.</td></tr>
                      <tr><th scope="row">Network Load Balancer (NLB)</th><td>TCP, UDP y TLS (capa 4)</td><td>Millones de peticiones por segundo con muy poca latencia, e IP fija. Juegos en línea, IoT.</td></tr>
                      <tr><th scope="row">Gateway Load Balancer (GWLB)</th><td>Aparatos virtuales</td><td>Pasar el tráfico por firewalls o sistemas de inspección de otras marcas.</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('examen', '<em>“Repartir el tráfico entre instancias de varias zonas”</em> → <strong>Elastic Load Balancing</strong>. <em>“Enrutar por la ruta de la URL”</em> → <strong>ALB</strong>. <em>“Ultra alto rendimiento, TCP/UDP, IP estática”</em> → <strong>NLB</strong>. <em>“Firewalls de terceros”</em> → <strong>GWLB</strong>.')}`,
              notas: 'Balanceador + Auto Scaling es la pareja clásica: el grupo pone y quita instancias, y el balanceador las agrega a su reparto solo. En el sandbox los balanceadores están negados; en el laboratorio solo verán la pantalla con los tres tipos.'
            }
          ]
        },
        {
          id: 's6-ex-balanceador',
          tipo: 'opcion',
          titulo: '¿Qué balanceador?',
          xp: 50,
          minutos: 2,
          contexto:
            '<p>Una empresa de videojuegos tiene servidores de partidas que hablan por <strong>UDP</strong>. Necesita repartir <strong>millones de conexiones por segundo</strong> con la menor latencia posible y darles a sus jugadores una <strong>IP fija</strong>.</p>',
          pregunta: '¿Qué tipo de balanceador elige?',
          opciones: [
            { texto: 'Application Load Balancer, porque entiende rutas de URL.', retro: 'El ALB trabaja con HTTP y HTTPS; no reparte tráfico UDP.' },
            { texto: 'Gateway Load Balancer, porque inspecciona el tráfico.', retro: 'El GWLB sirve para pasar el tráfico por firewalls y aparatos de terceros.' },
            { texto: 'Network Load Balancer, por su rendimiento con TCP y UDP.', correcta: true, retro: '¡Correcto! El NLB trabaja en capa 4 (TCP, UDP), aguanta millones de peticiones por segundo y puede tener IP fija.' },
            { texto: 'Ninguno: un balanceador solo funciona con sitios web.', retro: 'Hay balanceadores para varios tipos de tráfico; el NLB maneja TCP y UDP.' }
          ],
          pista: 'Busca las palabras clave: UDP, millones por segundo, IP fija.'
        },
        {
          id: 's6-monitorear',
          tipo: 'leccion',
          titulo: 'Quién vigila: CloudWatch y CloudTrail',
          xp: 50,
          minutos: 5,
          laminas: [
            {
              titulo: 'Dos servicios que se confunden',
              html: `
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Servicio</th><th scope="col">Responde a…</th><th scope="col">Qué guarda</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Amazon CloudWatch</th><td>“¿<strong>Cómo</strong> está funcionando?”</td><td><strong>Métricas</strong> (CPU, red, peticiones), <strong>alarmas</strong> que avisan o actúan, <strong>tableros</strong> con gráficas y <strong>Logs</strong> con los mensajes de tus aplicaciones.</td></tr>
                      <tr><th scope="row">AWS CloudTrail</th><td>“¿<strong>Quién</strong> hizo qué, y cuándo?”</td><td>El historial de cada llamada a la API: quién borró la instancia, desde qué IP, a qué hora.</td></tr>
                    </tbody>
                  </table>
                </div>
                <div class="carrera">
                  <div class="carrera__fila carrera__fila--nube"><span class="carrera__quien">Métrica</span><ol><li>La CPU del grupo sube a 85 %</li></ol><span class="carrera__tiempo">CloudWatch mide</span></div>
                  <div class="carrera__fila"><span class="carrera__quien">Alarma</span><ol><li>“CPU mayor que 70 % por 5 minutos”</li></ol><span class="carrera__tiempo">se enciende</span></div>
                  <div class="carrera__fila carrera__fila--propio"><span class="carrera__quien">Acción</span><ol><li>Auto Scaling agrega una instancia, o SNS manda un correo</li></ol><span class="carrera__tiempo">alguien actúa</span></div>
                </div>
                ${recuadro('examen', '<em>“Recibir un aviso cuando la CPU pase de 80 %”</em> → <strong>alarma de CloudWatch</strong>. <em>“Saber quién eliminó un recurso”</em> → <strong>CloudTrail</strong>. <em>“Juntar los registros de una aplicación”</em> → <strong>CloudWatch Logs</strong>.')}`,
              notas: 'Las métricas básicas de EC2 llegan cada 5 minutos sin costo; el monitoreo detallado (cada minuto) se cobra. En el laboratorio verán las métricas reales de su grupo, pero el sandbox no deja crear alarmas.'
            }
          ]
        },
        {
          id: 's6-serverless',
          tipo: 'leccion',
          titulo: 'Sin servidores y desacoplado',
          xp: 50,
          minutos: 6,
          laminas: [
            {
              titulo: 'Código sin servidores, y contenedores',
              html: `
                <p class="entrada">A veces ni siquiera quieres un grupo de servidores. Solo quieres que <strong>tu código corra cuando pase algo</strong>.</p>
                <div class="rejilla rejilla--3 roles">
                  <article class="rol">${icono('codigo')}<h3>AWS Lambda</h3><p>Subes una función y corre cuando llega un <strong>evento</strong> (una foto en S3, una petición web). Escala sola, cobra por petición y por milisegundo, y cada ejecución dura <strong>hasta 15 minutos</strong>.</p></article>
                  <article class="rol">${icono('maleta')}<h3>ECS y EKS</h3><p>Orquestan <strong>contenedores</strong>: ECS es el de AWS y EKS es Kubernetes administrado. Las imágenes se guardan en ECR.</p></article>
                  <article class="rol">${icono('nube')}<h3>AWS Fargate</h3><p>Corre esos contenedores <strong>sin servidores que administrar</strong>: tú dices cuánta CPU y memoria, AWS pone la máquina.</p></article>
                </div>
                ${recuadro('examen', '<em>“Ejecutar código en respuesta a eventos, sin administrar servidores”</em> → <strong>Lambda</strong>. <em>“Contenedores sin administrar servidores”</em> → <strong>Fargate</strong>. <em>“Kubernetes”</em> → <strong>EKS</strong>. Un proceso que tarda dos horas <strong>no</strong> cabe en Lambda.')}`,
              notas: 'Sin servidores no significa que no haya servidores: significa que no son tu problema. En el laboratorio verán la demostración de Lambda que trae la consola; crear funciones no está disponible en el sandbox.'
            },
            {
              titulo: 'Desacoplar: que una pieza no tumbe a las demás',
              html: `
                <p class="entrada">En la taquería, el cajero no espera a que salgan los tacos para cobrarle al siguiente: deja la <strong>comanda</strong> en el riel y sigue. Si la cocina se atrasa, las comandas esperan; nadie se pierde. Eso es <strong>acoplamiento débil</strong>.</p>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Servicio</th><th scope="col">Cómo funciona</th><th scope="col">Ejemplo</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Amazon SQS</th><td>Una <strong>cola</strong>: uno deja mensajes y otro los saca cuando puede.</td><td>Los pedidos esperan en la cola aunque el sistema de envíos esté saturado.</td></tr>
                      <tr><th scope="row">Amazon SNS</th><td><strong>Publicar y suscribirse</strong>: un mensaje llega a muchos a la vez.</td><td>“Pedido pagado” llega por correo, por SMS y a una función Lambda.</td></tr>
                      <tr><th scope="row">Amazon EventBridge</th><td>Un <strong>bus de eventos</strong> con reglas, y también horarios.</td><td>“Cada noche a las 2:00, ejecuta el respaldo”.</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('examen', '<em>“Desacoplar componentes”</em> o <em>“que los mensajes no se pierdan si el otro lado está ocupado”</em> → <strong>SQS</strong>. <em>“Notificar a muchos suscriptores”</em> → <strong>SNS</strong>.')}`,
              notas: 'Desacoplar es uno de los principios de Well-Architected que verán en la sesión 7: diseñar para que una falla no se propague.'
            }
          ]
        },
        {
          id: 's6-ex-desacoplar',
          tipo: 'opcion',
          titulo: 'Los pedidos que se perdían',
          xp: 50,
          minutos: 2,
          contexto:
            '<p>En una tienda, el sitio web llama directo al sistema de facturación. Cuando facturación se satura, <strong>los pedidos se pierden</strong>. Quieren que el sitio siga aceptando pedidos y que facturación los procese a su ritmo.</p>',
          pregunta: '¿Qué servicio ponen entre los dos?',
          opciones: [
            { texto: 'Una cola de Amazon SQS que guarde los pedidos hasta que facturación los procese.', correcta: true, retro: '¡Correcto! La cola desacopla las dos partes: el sitio deja el pedido y facturación lo saca cuando puede, sin que se pierda.' },
            { texto: 'Un tablero de CloudWatch para ver cuántos pedidos se pierden.', retro: 'El tablero muestra el problema, pero no evita que los pedidos se pierdan.' },
            { texto: 'Una instancia más grande para el sitio web.', retro: 'El que se satura es facturación; agrandar el sitio no lo arregla.' },
            { texto: 'AWS CloudTrail para registrar cada pedido.', retro: 'CloudTrail registra las acciones sobre la cuenta de AWS, no los pedidos de tu aplicación.' }
          ],
          pista: '¿Qué pieza deja que cada lado trabaje a su propio ritmo?'
        }
      ]
    },

    /* ================================================================ 2 */
    {
      numero: 2,
      titulo: 'Laboratorio guiado en AWS',
      descripcion:
        'Enciendes el sandbox, haces una plantilla de servidor web, armas con ella un grupo de Auto Scaling en dos zonas, terminas una instancia a propósito para ver cómo se reemplaza sola, lo haces crecer, miras sus métricas en CloudWatch y limpias todo.',
      actividades: [
        {
          id: 's6-lab-escalar',
          tipo: 'laboratorio',
          titulo: 'Laboratorio: un grupo de servidores que se cura solo',
          xp: 300,
          minutos: 46,
          objetivo:
            'Crear una plantilla de lanzamiento y un grupo de Auto Scaling con dos instancias en dos zonas, comprobar que reemplaza sola una instancia terminada, hacerlo crecer a tres, revisar sus métricas en CloudWatch y borrar todo.',
          necesitas: [
            'Tu sesión de DataCamp abierta (el sandbox todavía apagado).',
            'Esta guía abierta en otra pestaña o en tu celular.',
            'Unos 35 minutos de sandbox.',
            'Una forma de tomar capturas de pantalla.'
          ],
          pasos: [
            {
              titulo: 'Prepárate antes de encender',
              html: `
                <p>Todavía <strong>no</strong> enciendas el sandbox. Estos son los nombres que vas a usar:</p>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Recurso</th><th scope="col">Nombre</th><th scope="col">Detalle</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Plantilla de lanzamiento</th><td><kbd>plantilla-web-tu-nombre</kbd></td><td>Amazon Linux 2023, t2.micro, el script de abajo</td></tr>
                      <tr><th scope="row">Grupo de seguridad</th><td><kbd>web-tu-nombre-sg</kbd></td><td>Deja entrar HTTP (puerto 80) desde internet</td></tr>
                      <tr><th scope="row">Grupo de Auto Scaling</th><td><kbd>grupo-web-tu-nombre</kbd></td><td>Mínimo 1, deseado 2, máximo 3, en us-east-1a y us-east-1b</td></tr>
                      <tr><th scope="row">Etiqueta de las instancias</th><td><kbd>web-asg-tu-nombre</kbd></td><td>Así las reconoces en la lista de EC2</td></tr>
                    </tbody>
                  </table>
                </div>
                <p>Ten a la mano el script que pegarás en el paso 5. Cada instancia instala Apache y escribe una página que dice <strong>quién te atiende y en qué zona</strong>:</p>
                ${codigo(SCRIPT)}
                ${recuadro('cuidado', 'El sandbox permite grupos de <strong>hasta 3 instancias</strong>. No pongas un máximo mayor.')}
                ${recuadro('consejo', 'Las imágenes son capturas reales del sandbox. Tócalas para verlas en grande.')}`,
              ver: 'Tienes la tabla de nombres y el script a la mano, y el sandbox sigue apagado.',
              sandbox: false
            },
            {
              titulo: 'Enciende el sandbox y empieza la plantilla',
              html: `
                <ol class="pasos-consola">
                  <li>En DataCamp abre <strong>Sandbox</strong> y, en la tarjeta de <strong>AWS</strong>, pulsa ${boton('Open Sandbox', 'abrir sandbox')}.</li>
                </ol>
                ${capturaS1('01-sandbox-datacamp', 'Página Sandbox de DataCamp con la tarjeta de AWS', [[93.7, 63.1, '<strong>Open Sandbox</strong> en la tarjeta de AWS']])}
                <ol class="pasos-consola" start="2" style="counter-reset: paso 1">
                  <li>Busca <kbd>EC2</kbd> y ábrelo. En el menú izquierdo, en <strong>Instances</strong>, pulsa <strong>Launch Templates</strong> y luego ${boton('Create launch template', 'crear plantilla de lanzamiento')}.</li>
                  <li>En <strong>Launch template name</strong> escribe <kbd>plantilla-web-tu-nombre</kbd>.</li>
                  <li>Marca la casilla de <strong>Auto Scaling guidance</strong>: la consola te avisa qué campos necesita un grupo de Auto Scaling.</li>
                </ol>
                ${captura('01-plantilla-nombre', 'El nombre de la plantilla y la casilla Auto Scaling guidance', [
                  [34.6, 34.9, 'El nombre de tu plantilla'],
                  [4.1, 75.4, '<strong>Auto Scaling guidance</strong>: márcala']
                ])}
                ${recuadro('recuerda', 'Una <strong>plantilla de lanzamiento</strong> es la receta de una instancia: sistema operativo, tipo, red y script. Auto Scaling la usa cada vez que necesita una instancia nueva.')}`,
              ver: 'El formulario “Create launch template” con tu nombre escrito y la casilla de Auto Scaling marcada.',
              problemas: [['Sale “You already have an active Sandbox Session running”', 'Una sesión anterior quedó abierta: pulsa Exit Session, espera unos segundos y vuelve a entrar.']],
              sandbox: true
            },
            {
              titulo: 'La plantilla: sistema operativo y tipo',
              html: `
                <ol class="pasos-consola">
                  <li>En <strong>Application and OS Images</strong> pulsa <strong>Quick Start</strong> y elige <strong>Amazon Linux</strong>. Deja la AMI <strong>Amazon Linux 2023</strong>.</li>
                  <li>En <strong>Instance type</strong> abre la lista, escribe <kbd>t2.micro</kbd> y elígela.</li>
                </ol>
                ${captura('02-plantilla-tipo', 'Amazon Linux 2023 y el tipo t2.micro en la plantilla', [
                  [7.4, 6.9, 'Quick Start: <strong>Amazon Linux</strong>'],
                  [50.5, 26.1, 'Amazon Linux 2023 AMI'],
                  [37.5, 87.6, 'Instance type: <strong>t2.micro</strong>']
                ])}
                ${recuadro('cuidado', 'Igual que en la sesión 1: el sandbox solo permite t2.nano, t2.micro y t2.small. Con otro tipo, el grupo no podrá lanzar instancias.')}`,
              ver: 'Amazon Linux 2023 AMI seleccionada e Instance type: t2.micro.',
              sandbox: true
            },
            {
              titulo: 'La plantilla: red y grupo de seguridad',
              html: `
                <ol class="pasos-consola">
                  <li>En <strong>Key pair</strong> deja <strong>Don't include in launch template</strong>: no entraremos por terminal.</li>
                  <li>En <strong>Network settings</strong> deja <strong>Subnet</strong> en <strong>Don't include in launch template</strong>: las zonas las decide el grupo.</li>
                  <li>En <strong>Firewall (security groups)</strong> elige <strong>Create security group</strong>. Nombre: <kbd>web-tu-nombre-sg</kbd>. Descripción: <kbd>HTTP para el grupo de Auto Scaling</kbd>.</li>
                  <li>Pulsa ${boton('Add security group rule', 'agregar regla')}. En <strong>Type</strong> elige <strong>HTTP</strong>; en <strong>Source</strong> escribe <kbd>0.0.0.0/0</kbd> y pulsa Enter.</li>
                </ol>
                ${captura('03-plantilla-red', 'Network settings de la plantilla con el grupo de seguridad nuevo y la regla HTTP', [
                  [36.7, 30.3, '<strong>Create security group</strong>'],
                  [34.4, 40.3, 'El nombre del grupo'],
                  [34.4, 51.8, 'Su descripción'],
                  [18.5, 82.3, 'Type: <strong>HTTP</strong> (puerto 80)'],
                  [39.6, 97.4, 'Source: <strong>0.0.0.0/0</strong>, todo internet']
                ])}
                ${recuadro('recuerda', 'Sin esta regla nadie podría ver tu página: un grupo de seguridad bloquea todo lo que no permites (sesión 2).')}`,
              ver: 'Create security group con tu nombre y descripción, y una regla HTTP, puerto 80, desde 0.0.0.0/0.',
              problemas: [['La descripción marca error en rojo', 'No uses acentos ni la letra ñ en la descripción del grupo de seguridad: escríbela tal como viene en la guía.']],
              sandbox: true
            },
            {
              titulo: 'La plantilla: el script, y créala',
              html: `
                <ol class="pasos-consola">
                  <li>Abre <strong>Advanced details</strong> al final del formulario y baja hasta <strong>User data</strong>. Pega el script del paso 1.</li>
                  <li>La casilla <strong>User data has already been base64 encoded</strong> queda <strong>sin marcar</strong>.</li>
                </ol>
                ${codigo(SCRIPT)}
                ${captura('04-plantilla-script', 'El script pegado en User data', [
                  [34.4, 54.3, 'El script en <strong>User data</strong>'],
                  [4.1, 94.9, 'La casilla base64: sin marcar']
                ])}
                <ol class="pasos-consola" start="3" style="counter-reset: paso 2">
                  <li>Pulsa ${boton('Create launch template', 'crear plantilla')} en el resumen de la derecha.</li>
                </ol>
                ${captura('05-plantilla-creada', 'El aviso Success de la plantilla creada y el enlace para crear el grupo', [
                  [14.4, 13.1, 'Plantilla creada'],
                  [6.6, 72.1, '<strong>Create Auto Scaling group</strong>: úsalo enseguida']
                ])}
                ${recuadro('sabias', '<em>ec2-metadata</em> le pregunta a la instancia quién es y dónde está. Así cada servidor del grupo escribe su propio nombre y su zona en la página.')}`,
              ver: 'El aviso verde “Success” con el nombre de tu plantilla.',
              sandbox: true
            },
            {
              titulo: 'El grupo: nombre y plantilla',
              html: `
                <ol class="pasos-consola">
                  <li>En el aviso verde pulsa <strong>Create Auto Scaling group</strong>. (O ve a <strong>EC2 › Auto Scaling Groups</strong> y pulsa ${boton('Create Auto Scaling group', 'crear grupo de Auto Scaling')}.)</li>
                  <li>Nombre: <kbd>grupo-web-tu-nombre</kbd>. En <strong>Launch template</strong> debe estar tu plantilla.</li>
                  <li>Revisa que debajo diga <strong>t2.micro</strong> y pulsa ${boton('Next', 'siguiente')}.</li>
                </ol>
                ${captura('06-grupo-nombre', 'El paso 1 del grupo: nombre y plantilla de lanzamiento', [
                  [52.4, 28.8, 'El nombre de tu grupo'],
                  [52.4, 63.9, 'Tu plantilla'],
                  [75.9, 86.4, 'Tipo: t2.micro']
                ])}`,
              ver: 'El paso “Choose instance launch options” del asistente.',
              sandbox: true
            },
            {
              titulo: 'El grupo: dos zonas de disponibilidad',
              html: `
                <ol class="pasos-consola">
                  <li>Deja la VPC por omisión (<em>172.31.0.0/16</em>).</li>
                  <li>En <strong>Availability Zones and subnets</strong> abre la lista y elige las subredes de <strong>us-east-1a</strong> y <strong>us-east-1b</strong>.</li>
                  <li>Deja <strong>Balanced best effort</strong> y pulsa ${boton('Next', 'siguiente')}.</li>
                </ol>
                ${captura('07-grupo-zonas', 'Las subredes de us-east-1a y us-east-1b elegidas para el grupo', [
                  [25.4, 48.2, 'La lista de zonas y subredes'],
                  [16.5, 54.6, 'Subred de <strong>us-east-1a</strong>'],
                  [16.5, 63.7, 'Subred de <strong>us-east-1b</strong>'],
                  [3.4, 85.2, '<strong>Balanced best effort</strong>: reparte entre zonas']
                ])}
                ${recuadro('examen', 'Repartir las instancias en <strong>varias zonas</strong> es lo que hace que la aplicación sea <strong>altamente disponible</strong>: si una zona falla, la otra sigue atendiendo.')}`,
              ver: 'Dos subredes elegidas, una en us-east-1a y otra en us-east-1b.',
              sandbox: true
            },
            {
              titulo: 'Sin balanceador, con revisiones de salud',
              html: `
                <ol class="pasos-consola">
                  <li>En <strong>Load balancing</strong> deja <strong>No load balancer</strong>. En una cuenta real elegirías uno; el sandbox no permite balanceadores.</li>
                </ol>
                ${captura('08-grupo-balanceador', 'Las opciones de balanceo de carga del grupo', [
                  [21.2, 41.4, '<strong>No load balancer</strong>: lo que usamos hoy'],
                  [73.8, 41.4, 'En una cuenta real: un balanceador nuevo']
                ])}
                <ol class="pasos-consola" start="2" style="counter-reset: paso 1">
                  <li>Baja a <strong>Health checks</strong>: las revisiones de EC2 vienen siempre encendidas. Deja el periodo de gracia en <strong>300</strong> segundos.</li>
                  <li>Pulsa ${boton('Next', 'siguiente')}.</li>
                </ol>
                ${captura('09-grupo-salud', 'Health checks del grupo y el periodo de gracia', [
                  [6.2, 24.4, 'Revisiones de EC2: <strong>siempre activas</strong>'],
                  [4.7, 79.1, 'Periodo de gracia: 300 s para arrancar'],
                  [96.4, 95.0, '<strong>Next</strong>']
                ])}
                ${recuadro('recuerda', 'El periodo de gracia le da cinco minutos a cada instancia nueva para arrancar e instalar Apache antes de que la revisen.')}`,
              ver: 'El paso “Configure group size and scaling”.',
              sandbox: true
            },
            {
              titulo: 'Cuántas instancias y cuándo crecer',
              html: `
                <ol class="pasos-consola">
                  <li><strong>Desired capacity</strong>: <kbd>2</kbd>. <strong>Min desired capacity</strong>: <kbd>1</kbd>. <strong>Max desired capacity</strong>: <kbd>3</kbd>.</li>
                  <li>En <strong>Automatic scaling</strong> elige <strong>Target tracking scaling policy</strong>.</li>
                </ol>
                ${captura('10-grupo-tamano', 'Capacidad deseada, mínima y máxima del grupo', [
                  [39.2, 44.1, 'Deseado: <strong>2</strong>'],
                  [29.2, 72.6, 'Mínimo: <strong>1</strong>'],
                  [49.1, 72.6, 'Máximo: <strong>3</strong>'],
                  [21.2, 91.7, 'Sin política: tamaño fijo'],
                  [60.8, 91.7, '<strong>Target tracking scaling policy</strong>']
                ])}
                <ol class="pasos-consola" start="3" style="counter-reset: paso 2">
                  <li>Deja <strong>Average CPU utilization</strong> con objetivo <strong>50</strong>: el grupo intentará mantener la CPU promedio en 50 %.</li>
                  <li>Pulsa ${boton('Next', 'siguiente')}. En <strong>Add notifications</strong> pulsa otra vez ${boton('Next', 'siguiente')}.</li>
                  <li>En <strong>Add tags</strong> pulsa ${boton('Add tag', 'agregar etiqueta')}: Key <kbd>Name</kbd>, Value <kbd>web-asg-tu-nombre</kbd>, con <strong>Tag new instances</strong> marcado. Pulsa ${boton('Next', 'siguiente')}.</li>
                  <li>En <strong>Review</strong> baja hasta el final y pulsa ${boton('Create Auto Scaling group', 'crear grupo')}.</li>
                </ol>
                ${captura('11-politica-cpu', 'La política de seguimiento de objetivo sobre la CPU promedio', [
                  [25.4, 57.1, 'Métrica: <strong>Average CPU utilization</strong>'],
                  [4.7, 71.8, 'Objetivo: <strong>50</strong> %']
                ])}`,
              ver: 'La lista de Auto Scaling groups con tu grupo.',
              sandbox: true
            },
            {
              titulo: 'Tu grupo, y un aviso rojo esperado',
              html: `
                <p>Verás <strong>dos</strong> avisos: el verde dice que el grupo se creó; el rojo, que no se pudo crear la política de escalado.</p>
                ${captura('12-grupo-creado', 'El grupo creado, con el aviso verde y el aviso rojo de la política', [
                  [7.0, 92.7, 'Tu grupo, actualizando su capacidad'],
                  [8.6, 25.0, '<em>Failed to create 1 Scaling policy</em>: esperado'],
                  [61.6, 92.7, 'Capacidad deseada: 2']
                ])}
                <p>La política de seguimiento de objetivo funciona con una <strong>alarma de CloudWatch</strong>, y el sandbox no te deja crear alarmas (<em>cloudwatch:PutMetricAlarm</em>). El grupo se creó igual: solo no crecerá por la CPU. Lo harás crecer tú en el paso 13.</p>
                <ol class="pasos-consola">
                  <li>Espera un minuto, pulsa el nombre de tu grupo y abre la pestaña <strong>Instance management</strong>.</li>
                </ol>
                ${captura('13-instancias-grupo', 'Las dos instancias del grupo, en zonas distintas', [
                  [22.9, 72.4, '<strong>InService</strong>: en servicio'],
                  [69.1, 72.4, 'Una en us-east-1b…'],
                  [69.1, 89.4, '…y otra en us-east-1a'],
                  [79.2, 72.4, '<strong>Healthy</strong>: sana']
                ])}
                ${recuadro('recuerda', 'Tú no lanzaste ninguna instancia: le dijiste al grupo “quiero 2” y él las lanzó, una en cada zona.')}`,
              ver: 'Dos instancias InService y Healthy, una en us-east-1a y otra en us-east-1b.',
              problemas: [['Sale “Error: Failed to create 1 Scaling policy”', 'Es esperado: el sandbox no deja crear la alarma que necesita la política. El grupo sí se creó; sigue adelante.']],
              sandbox: true
            },
            {
              titulo: 'Visita a tus servidores',
              html: `
                <ol class="pasos-consola">
                  <li>Ve a <strong>EC2 › Instances</strong>. Ahí están tus dos instancias con el nombre <em>web-asg-tu-nombre</em>. Espera a que <strong>Status check</strong> deje de decir <em>Initializing</em>.</li>
                  <li>Copia la <strong>Public IPv4 address</strong> de una de ellas.</li>
                </ol>
                ${captura('14-instancias-ec2', 'Las dos instancias del grupo en la lista de EC2, con su IP pública', [
                  [7.5, 76.9, 'Las dos de tu grupo'],
                  [53.7, 76.9, 'us-east-1a'],
                  [53.7, 89.2, 'us-east-1b'],
                  [76.2, 76.9, 'La <strong>IP pública</strong>']
                ])}
                <ol class="pasos-consola" start="3" style="counter-reset: paso 2">
                  <li>En <strong>tu</strong> navegador (no en el del sandbox) abre <kbd>http://</kbd> y la IP. Prueba también la IP de la otra instancia.</li>
                </ol>
                ${captura('15-pagina', 'La página Hola desde el grupo de Auto Scaling', [
                  [25.0, 18.2, 'Tu página'],
                  [38.2, 51.8, 'Qué instancia te atiende y en qué zona']
                ])}
                ${recuadro('sabias', 'Con un balanceador, tus clientes usarían una sola dirección y él repartiría entre las dos. Sin él, cada instancia tiene su propia IP.')}`,
              ver: 'La página “Hola desde el grupo de Auto Scaling” con el id de una instancia y su zona. Tómale captura: es tu primera evidencia.',
              evidencia: {
                id: 'pagina-grupo',
                titulo: 'La página de tu grupo',
                pide: 'La página “Hola desde el grupo de Auto Scaling” abierta en tu navegador, con la IP en la barra de direcciones y la zona de la instancia a la vista.'
              },
              problemas: [
                ['La página no carga', 'Ábrela en tu navegador, no en el del sandbox, y escribe http:// (no https://). Si acaba de arrancar, espera un par de minutos a que termine de instalar Apache.'],
                ['Sigue sin cargar', 'Revisa en la plantilla que el grupo de seguridad tenga la regla HTTP desde 0.0.0.0/0.']
              ],
              sandbox: true
            },
            {
              titulo: 'Rompe una a propósito',
              html: `
                <ol class="pasos-consola">
                  <li>En <strong>EC2 › Instances</strong> marca la instancia de <strong>us-east-1a</strong>.</li>
                  <li>Abre ${boton('Instance state', 'estado de la instancia')} y elige <strong>Terminate (delete) instance</strong>. Confirma con ${boton('Terminate (delete)', 'eliminar')}.</li>
                </ol>
                ${capturaS1('20-terminate-menu', 'Menú Instance state con Terminate (delete) instance', [[82.5, 89.0, '<strong>Terminate (delete) instance</strong>']])}
                ${capturaS1('21-terminate-modal', 'Ventana Terminate (delete) instance con su aviso', [
                  [50.0, 21.3, 'El aviso: también se borra su disco'],
                  [86.9, 93.5, '<strong>Terminate (delete)</strong>']
                ])}
                <ol class="pasos-consola" start="3" style="counter-reset: paso 2">
                  <li>Regresa a <strong>Auto Scaling Groups</strong>, abre tu grupo y la pestaña <strong>Activity</strong>. Espera uno o dos minutos y pulsa la flecha circular de refrescar.</li>
                </ol>
                ${captura('16-actividad', 'El historial de actividad del grupo con el reemplazo automático', [
                  [49.4, 36.7, 'Lanzó otra <em>para reemplazar una instancia no sana</em>'],
                  [49.4, 54.3, 'Detectó la terminada en su <em>health check</em>']
                ])}
                ${recuadro('examen', 'Esto es la <strong>alta disponibilidad</strong> y la <strong>autocuración</strong>: el grupo vigila que siempre haya la capacidad deseada y reemplaza solo lo que falla, sin que nadie se despierte a las 3 de la mañana.')}`,
              ver: 'En Activity, una línea “Terminating EC2 instance” por la revisión de salud y otra “Launching a new EC2 instance” para reemplazarla. Tómale captura: es tu segunda evidencia.',
              evidencia: {
                id: 'autocuracion',
                titulo: 'El grupo se curó solo',
                pide: 'La pestaña Activity de tu grupo con la instancia terminada y la nueva que la reemplazó.'
              },
              problemas: [['Activity no muestra nada nuevo', 'El grupo revisa la salud cada poco tiempo. Espera otro minuto y vuelve a refrescar.']],
              sandbox: true
            },
            {
              titulo: 'Hazlo crecer',
              html: `
                <ol class="pasos-consola">
                  <li>En tu grupo, arriba, en <strong>Capacity overview</strong>, pulsa ${boton('Edit', 'editar')}.</li>
                  <li>Cambia <strong>Desired capacity</strong> a <kbd>3</kbd> y pulsa ${boton('Update', 'actualizar')}.</li>
                </ol>
                ${captura('17-editar-tamano', 'La ventana Group size con la capacidad deseada en 3', [
                  [25.8, 52.8, 'Deseado: <strong>3</strong>'],
                  [74.0, 78.0, 'Máximo: 3, el tope'],
                  [88.6, 94.3, '<strong>Update</strong>']
                ])}
                <ol class="pasos-consola" start="3" style="counter-reset: paso 2">
                  <li>Abre <strong>Instance management</strong> y refresca hasta ver tres instancias.</li>
                </ol>
                ${captura('18-tres-instancias', 'Tres instancias en el grupo, repartidas en dos zonas', [
                  [5.6, 15.5, 'Ahora son <strong>3</strong>'],
                  [69.6, 61.5, 'Dos en us-east-1b…'],
                  [69.6, 90.5, '…y una en us-east-1a']
                ])}
                ${recuadro('sabias', 'Lo que hiciste a mano es lo que haría la política de escalado si pudiera crear su alarma: subir la capacidad deseada cuando la CPU pasa del objetivo, y bajarla cuando se calma.')}`,
              ver: 'Tres instancias InService y Healthy en Instance management. Tómale captura: es tu tercera evidencia.',
              evidencia: {
                id: 'tres-instancias',
                titulo: 'Tu grupo con tres instancias',
                pide: 'La pestaña Instance management de tu grupo con tres instancias InService.'
              },
              problemas: [['Sale un error al poner 4 o más', 'El sandbox solo permite grupos de hasta 3 instancias. Deja el deseado en 3.']],
              sandbox: true
            },
            {
              titulo: 'Las métricas de tu grupo en CloudWatch',
              html: `
                <ol class="pasos-consola">
                  <li>Busca <kbd>CloudWatch</kbd> y ábrelo. En el menú abre <strong>Dashboards</strong>, la pestaña <strong>Automatic dashboards</strong>, y elige <strong>EC2</strong>: es un tablero que AWS arma solo.</li>
                </ol>
                ${captura('21-tablero-ec2', 'El tablero automático de EC2 con la CPU de cada instancia', [
                  [7.6, 10.8, 'Tablero automático de EC2'],
                  [6.2, 22.4, 'La CPU de cada instancia'],
                  [71.9, 52.9, 'El tráfico de red que entra']
                ])}
                <ol class="pasos-consola" start="2" style="counter-reset: paso 1">
                  <li>Ahora busca la métrica de todo el grupo: en el menú abre <strong>Alarms</strong>, pulsa ${boton('Create alarm', 'crear alarma')} y luego ${boton('Select metric', 'elegir métrica')}.</li>
                  <li>En <strong>Browse</strong> elige <strong>EC2</strong>.</li>
                </ol>
                ${captura('19-metricas', 'Los grupos de métricas de CloudWatch', [
                  [5.6, 42.0, '<strong>Browse</strong>: todas las métricas'],
                  [85.1, 60.1, '<strong>EC2</strong>']
                ])}
                <ol class="pasos-consola" start="4" style="counter-reset: paso 3">
                  <li>Elige <strong>By Auto Scaling Group</strong>, busca <kbd>CPUUtilization</kbd>, marca la de tu grupo y pulsa ${boton('Select metric', 'elegir métrica')}.</li>
                </ol>
                ${captura('20-cpu-grupo', 'La CPU promedio del grupo graficada', [
                  [2.5, 69.1, 'Márcala'],
                  [8.5, 69.1, 'Tu grupo'],
                  [95.2, 22.9, 'El dato más reciente: la CPU promedio'],
                  [95.2, 96.5, '<strong>Select metric</strong>']
                ])}
                ${recuadro('recuerda', 'CloudWatch mide sin que instales nada: CPU, red y discos de cada instancia llegan solos cada 5 minutos.')}`,
              ver: 'La gráfica de CPUUtilization de tu grupo y el tablero automático de EC2.',
              problemas: [['No aparece mi grupo en By Auto Scaling Group', 'Las métricas tardan unos minutos en llegar después de crear el grupo. Mientras, revisa el tablero automático de EC2.']],
              sandbox: true
            },
            {
              titulo: 'Intenta una alarma',
              html: `
                <ol class="pasos-consola">
                  <li>Con la métrica de tu grupo elegida, baja a <strong>Conditions</strong>: deja <strong>Greater</strong> y escribe <kbd>70</kbd>. Pulsa ${boton('Next', 'siguiente')}.</li>
                </ol>
                ${captura('22-condicion', 'La condición de la alarma: CPU mayor que 70', [
                  [16.8, 16.0, 'La métrica de tu grupo'],
                  [49.3, 26.1, 'Cada 5 minutos'],
                  [75.9, 22.9, '<strong>Greater</strong>: mayor que…'],
                  [73.2, 46.3, '…<strong>70</strong> %']
                ])}
                <ol class="pasos-consola" start="2" style="counter-reset: paso 1">
                  <li>Lee qué puede hacer una alarma. Quita la notificación con ${boton('Remove', 'quitar')}: el sandbox no tiene SNS.</li>
                  <li>Pulsa ${boton('Next', 'siguiente')}, confirma <strong>Proceed without actions</strong>, ponle de nombre <kbd>cpu-alta-tu-nombre</kbd>, pulsa ${boton('Next', 'siguiente')} y luego ${boton('Create alarm', 'crear alarma')}.</li>
                </ol>
                ${captura('23-acciones', 'Las acciones posibles de una alarma de CloudWatch', [
                  [4.7, 14.6, 'Avisar por SNS (correo, SMS)'],
                  [95.3, 19.8, '<strong>Remove</strong>: quita la notificación'],
                  [6.7, 80.9, 'Ejecutar una función Lambda'],
                  [7.7, 97.2, 'Agregar o quitar instancias de un grupo']
                ])}
                ${captura('24-alarma-denegada', 'El error al crear la alarma: falta cloudwatch:PutMetricAlarm', [
                  [12.0, 30.6, 'No se pudo crear la alarma'],
                  [45.9, 51.4, 'Falta el permiso <em>cloudwatch:PutMetricAlarm</em>']
                ])}
                <p>Es el mismo permiso que le faltó a la política de escalado en el paso 10. Ahora sabes por qué.</p>`,
              ver: 'El aviso rojo “There was an error while creating your alarm” que menciona cloudwatch:PutMetricAlarm.',
              sandbox: true
            },
            {
              titulo: 'Un vistazo: balanceadores y Lambda',
              html: `
                <ol class="pasos-consola">
                  <li>En <strong>EC2</strong>, en el menú, abre <strong>Load Balancers</strong>. Lee el aviso rojo y pulsa ${boton('Create load balancer', 'crear balanceador')}: no crees nada, solo mira los tres tipos.</li>
                </ol>
                ${captura('25-elb-denegado', 'Load balancers con el aviso AccessDenied', [
                  [92.5, 11.2, '<strong>Create load balancer</strong>'],
                  [41.3, 80.6, 'El sandbox no permite balanceadores']
                ])}
                ${captura('26-tipos-elb', 'Los tres tipos de balanceador: Application, Network y Gateway', [
                  [13.7, 22.6, '<strong>Application</strong>: HTTP y HTTPS'],
                  [45.6, 22.6, '<strong>Network</strong>: TCP, UDP y TLS'],
                  [78.8, 22.6, '<strong>Gateway</strong>: aparatos de seguridad']
                ])}
                <ol class="pasos-consola" start="2" style="counter-reset: paso 1">
                  <li>Busca <kbd>Lambda</kbd> y ábrelo. En <strong>How it works</strong> pulsa ${boton('Run', 'ejecutar')}: corre una función de ejemplo.</li>
                  <li>Pulsa <strong>Next</strong> dos veces hasta <strong>Scale seamlessly</strong> y fíjate en el contador.</li>
                </ol>
                ${captura('27-lambda', 'La portada de AWS Lambda con la demostración How it works', [
                  [25.0, 28.2, 'Código sin administrar servidores'],
                  [74.3, 65.7, '<strong>Run</strong>'],
                  [9.4, 73.9, 'La respuesta de la función']
                ])}
                ${captura('28-lambda-escala', 'La demostración Scale seamlessly: cientos de miles de invocaciones', [
                  [71.9, 23.2, 'Miles de invocaciones… por centavos'],
                  [58.0, 57.1, 'Lambda atiende cada evento']
                ])}
                ${recuadro('sabias', 'Crear funciones de Lambda, temas de SNS y colas de SQS no está disponible en el sandbox. La demostración de la portada sí corre: muestra cómo Lambda escala sola y cobra por invocación.')}`,
              ver: 'Los tres tipos de balanceador y la demostración de Lambda con “Hello from Lambda!”.',
              sandbox: true
            },
            {
              titulo: 'Limpia: el grupo y la plantilla',
              html: `
                <ol class="pasos-consola">
                  <li>En <strong>EC2 › Auto Scaling Groups</strong> marca tu grupo, abre ${boton('Actions', 'acciones')} y elige <strong>Delete</strong>. Escribe <kbd>delete</kbd> y confirma.</li>
                </ol>
                ${captura('29-borrar-grupo', 'La ventana Delete Auto Scaling group', [
                  [81.1, 39.2, 'Borra el grupo <strong>y sus instancias</strong>'],
                  [33.6, 69.8, 'Escribe <em>delete</em>'],
                  [91.8, 90.5, '<strong>Delete</strong>']
                ])}
                ${captura('30-grupo-borrando', 'El grupo en estado Deleting con capacidad deseada 0', [
                  [26.2, 78.8, '<em>Deleting</em>'],
                  [71.6, 78.8, 'Deseado 0: termina las instancias solo']
                ])}
                <ol class="pasos-consola" start="2" style="counter-reset: paso 1">
                  <li>Ve a <strong>Launch Templates</strong>, marca tu plantilla, abre ${boton('Actions', 'acciones')}, elige <strong>Delete template</strong>, escribe <kbd>Delete</kbd> y confirma.</li>
                </ol>
                ${captura('31-plantilla-borrada', 'El aviso de plantilla borrada y la lista vacía', [
                  [11.1, 12.2, 'Plantilla borrada'],
                  [50.5, 89.4, 'Ya no hay plantillas']
                ])}
                ${recuadro('cuidado', 'Si terminas las instancias a mano, el grupo lanza otras. Para apagar todo se borra el <strong>grupo</strong>: él se encarga de sus instancias.')}`,
              ver: 'Tu grupo desaparece de la lista en unos minutos y Launch templates dice “You do not have any launch templates in this region”.',
              sandbox: true
            },
            {
              titulo: 'Limpia: el grupo de seguridad',
              html: `
                <ol class="pasos-consola">
                  <li>Espera a que en <strong>EC2 › Instances</strong> tus instancias digan <strong>Terminated</strong>: mientras alguna exista, el grupo de seguridad está en uso.</li>
                  <li>Abre <strong>Security Groups</strong>, marca <em>web-tu-nombre-sg</em>, abre ${boton('Actions', 'acciones')} y elige <strong>Delete security groups</strong>. Confirma con ${boton('Delete', 'borrar')}.</li>
                </ol>
                ${capturaS2('28-borrar-sg-menu', 'El menú Actions de Security Groups con Delete security groups', [
                  [41.5, 42.3, 'Tu grupo marcado'],
                  [82.9, 8.2, '<strong>Actions</strong>'],
                  [85.8, 90.0, '<strong>Delete security groups</strong>']
                ])}
                ${capturaS2('29-borrar-sg', 'La confirmación Delete security groups', [[92.4, 87.2, '<strong>Delete</strong>']])}
                ${capturaS2('30-sg-borrado', 'El aviso verde successfully deleted', [[21.7, 11.2, '<em>successfully deleted</em>']])}`,
              ver: 'El aviso verde de tu grupo de seguridad “successfully deleted”.',
              problemas: [['Sale “has a dependent object” o “in use”', 'Todavía queda una instancia viva. Espera a que todas digan Terminated y vuelve a intentarlo.']],
              sandbox: true
            },
            {
              titulo: 'Apaga el sandbox y entrega tus evidencias',
              html: `
                <ol class="pasos-consola">
                  <li>En la barra de DataCamp pulsa <strong>Exit Session</strong> y confirma con ${boton('End Session', 'terminar sesión')}.</li>
                  <li>Revisa que la tarjeta de AWS vuelva a decir <strong>Open Sandbox</strong>.</li>
                </ol>
                ${capturaS1('24-salir', 'Aviso de DataCamp antes de terminar la sesión del sandbox', [
                  [93.1, 4.6, '<strong>Exit Session</strong>'],
                  [23.9, 92.7, '<strong>End Session</strong>']
                ])}
                <ol class="pasos-consola" start="3" style="counter-reset: paso 2">
                  <li>Al pulsar <strong>Terminar laboratorio</strong>, el contador de este curso se detiene.</li>
                  <li>Abajo están tus tres capturas. Descarga tu <strong>PDF de evidencias</strong> y súbelo a Blackboard.</li>
                </ol>
                ${nubi('¡Listo! Armaste un grupo que se cura solo y crece cuando se lo pides. Eso es la elasticidad de la nube.', 'nubi-feliz')}`,
              ver: 'La tarjeta de AWS en DataCamp dice “Open Sandbox”, y el contador de este curso está detenido.',
              sandbox: false
            }
          ],
          cierre:
            'Hiciste una plantilla de lanzamiento, armaste con ella un grupo de Auto Scaling en dos zonas, viste cómo reemplazó sola una instancia terminada, lo hiciste crecer a tres, leíste sus métricas en CloudWatch, descubriste qué permiso necesitan las alarmas y limpiaste todo.'
        },
        {
          id: 's6-ex-quien-escala',
          tipo: 'clasificar',
          titulo: '¿Quién se encarga?',
          xp: 50,
          minutos: 3,
          contexto: '<p>Ya armaste un grupo de servidores. Ahora reparte las tareas entre los tres servicios que trabajan juntos.</p>',
          pregunta: 'Elige el servicio que hace cada cosa.',
          grupos: [
            { id: 'asg', nombre: 'EC2 Auto Scaling', color: 'green' },
            { id: 'elb', nombre: 'Elastic Load Balancing', color: 'blue' },
            { id: 'cw', nombre: 'Amazon CloudWatch', color: 'yellow' }
          ],
          fichas: [
            { texto: 'Lanzar una instancia nueva cuando una falla', grupo: 'asg', retro: 'Reemplazar instancias no sanas es trabajo del grupo de Auto Scaling.' },
            { texto: 'Dar a los clientes una sola dirección y repartirlos entre las instancias', grupo: 'elb', retro: 'Repartir el tráfico es el trabajo del balanceador.' },
            { texto: 'Medir la CPU promedio de las instancias', grupo: 'cw', retro: 'Las métricas viven en CloudWatch.' },
            { texto: 'Quitar instancias de noche, cuando casi nadie entra', grupo: 'asg', retro: 'Encoger el grupo según la demanda: Auto Scaling.' },
            { texto: 'Dejar de mandar clientes a una instancia que no responde', grupo: 'elb', retro: 'El balanceador revisa la salud y solo usa instancias sanas.' },
            { texto: 'Encender una alarma cuando la CPU pasa de 70 %', grupo: 'cw', retro: 'Las alarmas son de CloudWatch; luego pueden avisarle a Auto Scaling.' }
          ],
          cierre: 'CloudWatch mide y avisa, Auto Scaling pone y quita instancias, y el balanceador reparte a los clientes entre las que están sanas.',
          pista: '¿Es medir, cambiar el número de servidores o repartir clientes?'
        },
        {
          id: 's6-ex-madrugada',
          tipo: 'opcion',
          titulo: 'Las 3 de la mañana',
          xp: 50,
          minutos: 2,
          contexto:
            '<p>Un grupo de Auto Scaling tiene <strong>mínimo 2, deseado 2 y máximo 4</strong>, en dos zonas. A las 3 de la mañana una de sus instancias deja de pasar las revisiones de salud. Nadie del equipo está despierto.</p>',
          pregunta: '¿Qué pasa?',
          opciones: [
            { texto: 'El grupo se queda con una sola instancia hasta que alguien la reinicie.', retro: 'El mínimo es 2: el grupo no se queda abajo de su capacidad deseada.' },
            { texto: 'El grupo termina la instancia enferma y lanza otra para volver a tener 2.', correcta: true, retro: '¡Correcto! Como viste en el laboratorio, el grupo reemplaza solo las instancias no sanas.' },
            { texto: 'El grupo sube a 4 instancias por seguridad.', retro: 'Sin una política que lo pida, el grupo solo vuelve a su capacidad deseada.' },
            { texto: 'CloudTrail reinicia la instancia.', retro: 'CloudTrail solo registra quién hizo qué; no actúa sobre las instancias.' }
          ],
          pista: 'Acuérdate de la pestaña Activity del laboratorio.'
        }
      ]
    },

    /* ================================================================ 3 */
    {
      numero: 3,
      titulo: 'Repaso para el examen',
      descripcion: 'Lo que la certificación pregunta de escalado, monitoreo y servicios sin servidores, en una sola página, y un verdadero o falso para calentar antes del examen de práctica.',
      actividades: [
        {
          id: 's6-repaso',
          tipo: 'leccion',
          titulo: 'Lo que el examen te va a preguntar',
          xp: 50,
          minutos: 5,
          laminas: [
            {
              titulo: 'La sesión 6 en una hoja',
              html: `
                <div class="repaso">
                  <div class="repaso__capitulo"><span class="repaso__numero">1</span>${lista([
                    '<strong>Vertical</strong>: máquina más grande. <strong>Horizontal</strong>: más máquinas. <strong>Elasticidad</strong>: crecer y encogerse solo con la demanda.',
                    '<strong>Auto Scaling</strong>: mínimo, deseado y máximo; políticas de objetivo, por pasos, programadas y predictivas; reemplaza instancias no sanas.',
                    '<strong>Plantilla de lanzamiento</strong>: la receta de cada instancia del grupo.'
                  ])}</div>
                  <div class="repaso__capitulo"><span class="repaso__numero">2</span>${lista([
                    '<strong>ELB</strong>: reparte el tráfico entre instancias sanas de varias zonas.',
                    '<strong>ALB</strong>: HTTP/HTTPS, rutas. <strong>NLB</strong>: TCP/UDP, millones por segundo, IP fija. <strong>GWLB</strong>: firewalls de terceros.',
                    '<strong>CloudWatch</strong>: métricas, alarmas, tableros y Logs. <strong>CloudTrail</strong>: quién hizo qué.'
                  ])}</div>
                  <div class="repaso__capitulo"><span class="repaso__numero">3</span>${lista([
                    '<strong>Lambda</strong>: código por eventos, sin servidores, hasta 15 minutos, paga por uso.',
                    '<strong>ECS</strong> y <strong>EKS</strong> (Kubernetes) orquestan contenedores; <strong>Fargate</strong> los corre sin servidores.',
                    '<strong>SQS</strong>: cola para desacoplar. <strong>SNS</strong>: un mensaje a muchos. <strong>EventBridge</strong>: eventos y horarios.'
                  ])}</div>
                </div>`,
              notas: 'Pide que alguien explique con la taquería la diferencia entre SQS (las comandas en el riel) y SNS (el grito “¡salen los de pastor!” que oyen todos).'
            }
          ]
        },
        {
          id: 's6-vf',
          tipo: 'clasificar',
          titulo: '¿Verdadero o falso?',
          xp: 100,
          minutos: 3,
          contexto: '<p>Calentamiento antes del examen de práctica.</p>',
          pregunta: 'Decide si cada afirmación es verdadera o falsa.',
          grupos: [
            { id: 'v', nombre: 'Verdadero', color: 'green' },
            { id: 'f', nombre: 'Falso', color: 'red' }
          ],
          fichas: [
            { texto: 'Un grupo de Auto Scaling reemplaza las instancias que fallan sus revisiones de salud.', grupo: 'v', retro: 'Verdadero: lo viste en el laboratorio.' },
            { texto: 'Escalar horizontal significa cambiar a una instancia más grande.', grupo: 'f', retro: 'Falso: eso es vertical. Horizontal es agregar más instancias.' },
            { texto: 'CloudTrail registra quién hizo cada acción en la cuenta.', grupo: 'v', retro: 'Verdadero: es el historial de llamadas a la API.' },
            { texto: 'Una función de Lambda puede correr varias horas seguidas.', grupo: 'f', retro: 'Falso: cada ejecución dura como máximo 15 minutos.' },
            { texto: 'El Application Load Balancer puede enrutar según la ruta de la URL.', grupo: 'v', retro: 'Verdadero: trabaja en capa 7, con HTTP y HTTPS.' },
            { texto: 'Amazon SNS guarda los mensajes en una cola hasta que alguien los saque.', grupo: 'f', retro: 'Falso: eso es SQS. SNS publica un mensaje a muchos suscriptores.' },
            { texto: 'Fargate permite correr contenedores sin administrar servidores.', grupo: 'v', retro: 'Verdadero: tú das CPU y memoria, AWS pone la máquina.' },
            { texto: 'Las alarmas de CloudWatch solo pueden mandar correos.', grupo: 'f', retro: 'Falso: también pueden escalar un grupo, ejecutar Lambda o actuar sobre una instancia.' }
          ],
          cierre: 'Cuatro verdaderas y cuatro falsas. Si fallaste alguna, repasa esa lámina antes del examen.',
          pista: 'Hay cuatro verdaderas y cuatro falsas.'
        }
      ]
    }
  ],

  /* ---------------------------------------------------------- el plan */

  plan: [
    {
      desde: 0,
      hasta: 4,
      titulo: 'Arranque',
      pasos: [
        'Proyecta el QR de la plataforma y que abran “Ruta AWS Cloud Practitioner”, sesión 6.',
        'Pregunta rápida: ¿qué pasa en una taquería a las dos de la tarde, y qué hace el dueño? Así funciona Auto Scaling.'
      ],
      vigila: 'Que nadie encienda el sandbox todavía.'
    },
    {
      desde: 4,
      hasta: 36,
      titulo: 'Capítulo 1 · Antes de encender el sandbox',
      capitulo: 1,
      pasos: [
        'Proyecta las lecciones: elasticidad y Auto Scaling, balanceadores, CloudWatch y CloudTrail, y servicios sin servidores.',
        'La tabla de ALB, NLB y GWLB y la diferencia entre CloudWatch y CloudTrail son de las más preguntadas.',
        'Los ejercicios los resuelven solos, dos o tres minutos cada uno.'
      ],
      vigila: 'No se pierdan en Kubernetes: basta con saber que EKS es Kubernetes y Fargate corre contenedores sin servidores.'
    },
    {
      desde: 36,
      hasta: 92,
      titulo: 'Capítulo 2 · Laboratorio guiado',
      capitulo: 2,
      pasos: [
        'Proyecta el laboratorio y avanza paso a paso; que cada quien marque “Ya lo hice”.',
        'En el paso 10 avisa que el aviso rojo de la política es esperado: el sandbox no deja crear alarmas.',
        'En el paso 12 pide que esperen juntos el reemplazo y que alguien lea en voz alta la causa en Activity.',
        'Antes de terminar, revisa que todos borraron grupo, plantilla y grupo de seguridad, y que su tarjeta de AWS diga “Open Sandbox”.'
      ],
      vigila: 'En “Avance en vivo” se ve en qué paso va cada quien. Los pasos 4 (la regla HTTP) y 11 (abrir la página en su propio navegador) son donde más se atoran.'
    },
    {
      desde: 92,
      hasta: 100,
      titulo: 'Capítulo 3 · Repaso',
      capitulo: 3,
      pasos: ['Proyecta la hoja de repaso.', 'El verdadero o falso es el termómetro antes del examen.'],
      vigila: 'Cuando casi todos terminen, abre el examen de práctica de la sesión 6.'
    },
    {
      desde: 100,
      hasta: 117,
      titulo: 'Examen de práctica',
      pasos: [
        'En el panel elige la sesión 6 y abre el examen en la pestaña “Práctica final”.',
        '20 preguntas de escalado, monitoreo y servicios sin servidores al estilo de la certificación, una sola entrega.',
        'Al entregar, cada alumno puede descargar su reporte en PDF.'
      ],
      vigila: 'No proyectes el panel mientras contestan: muestra nombres y calificaciones.'
    },
    {
      desde: 117,
      hasta: 120,
      titulo: 'Cierre',
      pasos: ['Cierra el examen y proyecta el repaso de las preguntas más falladas.', 'Descarga el CSV antes de apagar.'],
      vigila: 'Recuérdales subir su PDF de evidencias a Blackboard.'
    }
  ]
};
