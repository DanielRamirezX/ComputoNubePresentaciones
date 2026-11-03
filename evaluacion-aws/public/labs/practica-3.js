// Práctica integradora 3 (sesión 11 de la Ruta AWS) · Sin servidores y desacoplado.
// «El Festival Jacaranda vende boletos en hora pico»: el año pasado el servidor
// de la taquilla se cayó a las 10:00:01, cuando abrió la venta. Este año todo
// va sin servidores: el sitio estático en S3 servido con CloudFront y un
// registro Alias de Route 53, los boletos en DynamoDB (llave compuesta y un
// índice global), los pedidos en una cola SQS que procesa una Lambda, avisos
// por SNS (correo + cola), una regla programada de EventBridge y una alarma
// de CloudWatch sobre la cola. El bono es la cola de mensajes muertos (DLQ).
//
// La cuenta empieza con el bucket del sitio que dejó la agencia de diseño:
// PÚBLICO (sin Block Public Access, con una política que deja leer a todos y
// con el alojamiento de sitio web encendido). Hay que volverlo privado y
// servirlo solo por CloudFront con OAC.
//
// Datos distintos por alumno: el bucket y el dominio llevan su sufijo; los
// días de retención de la cola y el umbral de la alarma salen de su octeto.

import { anotar, crearBucket, cuentaNueva, editarPolitica, editarSitioWeb, subirObjetos } from '../consola/modelo.js';
import { c, vinetas } from './util.js';

export function datosLab(d) {
  const dominio = `jacaranda-${d.sufijo}.mx`;
  return {
    sufijo: d.sufijo,
    // El sitio y su dominio
    bucket: `jacaranda-sitio-${d.sufijo}`,
    dominio,
    www: `www.${dominio}`,
    distribucion: 'jacaranda-sitio',
    // Los boletos (DynamoDB)
    tabla: 'jacaranda-boletos',
    pk: 'evento',
    sk: 'asiento',
    gsiPk: 'correo',
    gsi: 'correo-index',
    evento: 'JAC-2026',
    asiento: 'GRAL-0001',
    correoPrueba: `prueba-${d.sufijo}@correo.mx`,
    // Los pedidos (SQS + Lambda)
    cola: 'jacaranda-pedidos',
    retencionDias: [5, 6, 7, 10][d.octeto % 4],
    funcion: 'jacaranda-procesa-pedidos',
    timeout: 30,
    runtimes: ['nodejs24.x', 'nodejs22.x', 'python3.14', 'python3.13'],
    // Los avisos (SNS)
    tema: 'jacaranda-alertas',
    correo: `guardia@${dominio}`,
    colaIncidentes: 'jacaranda-incidentes',
    // La tarea programada (EventBridge)
    regla: 'jacaranda-libera-apartados',
    expresion: 'rate(5 minutes)',
    funcionApartados: 'jacaranda-libera-apartados',
    // La alarma (CloudWatch)
    alarma: 'jacaranda-pedidos-atorados',
    metrica: 'ApproximateNumberOfMessagesVisible',
    umbral: [200, 300, 400, 500][Math.floor(d.octeto / 4) % 4],
    // Bono: la cola de mensajes muertos
    dlq: 'jacaranda-pedidos-dlq',
    intentos: 3
  };
}

/** La página del festival que dejó la agencia (el index.html del bucket). */
function paginaFestival(x) {
  return [
    '<html><head><title>Festival Jacaranda 2026</title></head>',
    '<body style="margin:0;font-family:sans-serif;background:#2b1a4a;color:#fff">',
    '<div style="padding:40px 24px;text-align:center;background:linear-gradient(160deg,#7b3fbf,#c86dd7)">',
    '<h1 style="margin:0 0 8px">Festival Jacaranda 2026</h1>',
    '<p style="margin:0">Tres días de música bajo las jacarandas · Ciudad de México</p>',
    '</div>',
    '<div style="padding:24px;max-width:640px;margin:0 auto;line-height:1.5">',
    '<h2>Boletos a la venta: viernes a las 10:00</h2>',
    '<p>General, Preferente y Abono de 3 días. Compra solo en este sitio oficial.</p>',
    `<p style="opacity:.8">Taquilla en línea · ${x.sufijo}</p>`,
    '</div></body></html>'
  ].join('');
}

export const LAB = {
  id: 'practica-3',
  titulo: 'El Festival Jacaranda vende boletos en hora pico',
  minutos: 85,
  pistas: true,
  // En «Tus datos» solo va lo que usa esta práctica: no hay VPC ni grupos de seguridad.
  datosVisibles: ['sufijo', 'cuentaId'],
  historia: `
    <p>El <strong>Festival Jacaranda</strong> llena un parque de la Ciudad de México tres días cada marzo. El año pasado la venta de boletos abrió a las 10:00 y a las <strong>10:00:01</strong> el servidor de la taquilla se cayó: 40 000 personas entraron al mismo tiempo, la mitad se quedó sin boleto y las redes sociales ardieron.</p>
    <p>Este año la dueña, <strong>Mariana Ocampo</strong>, no quiere servidores que se saturen ni que haya que encender a mano. Te contrató para montar la taquilla <strong>sin servidores y desacoplada</strong>:</p>
    <ul>
      <li>El sitio es <strong>estático</strong> (HTML e imágenes): vive en S3 y lo reparte <strong>CloudFront</strong> desde sus ubicaciones de borde, con su dominio en <strong>Route 53</strong>.</li>
      <li>Cada compra entra a una <strong>cola de SQS</strong>. La cola aguanta el golpe de la hora pico y una función <strong>Lambda</strong> procesa los pedidos a su ritmo: si se tarda, nadie pierde su lugar.</li>
      <li>Los boletos se guardan en <strong>DynamoDB</strong>, que crece solo y cobra por petición.</li>
      <li>Si algo se atora, <strong>CloudWatch</strong> lo detecta y <strong>SNS</strong> avisa al equipo de guardia.</li>
    </ul>
    <p>La agencia de diseño ya subió el sitio al bucket <code>jacaranda-sitio-…</code>, pero para «verlo rápido» lo dejó <strong>público</strong>. Eso se corrige: nadie debe entrar directo al bucket, solo a través de CloudFront.</p>
    <p>Todo va en <strong>N. Virginia (us-east-1)</strong>; CloudFront y Route 53 son globales. Puedes hacer las tareas en el orden que quieras, aunque algunas usan lo que creaste en otras (la alarma necesita la cola y el tema, por ejemplo). Las ocho primeras valen 100 puntos; la última es un <strong>bono opcional</strong> que suma encima, sin pasar de 100.</p>`,

  estadoInicial(datos) {
    const x = datosLab(datos);
    const e = cuentaNueva(datos);

    // El bucket que dejó la agencia: público para «verlo rápido».
    crearBucket(e, { nombre: x.bucket, bloqueoPublico: { aclsNuevas: false, aclsCualquiera: false, politicasNuevas: false, politicasCualquiera: false } });
    editarSitioWeb(e, x.bucket, { habilitado: true, indice: 'index.html', error: 'error.html' });
    editarPolitica(
      e,
      x.bucket,
      JSON.stringify(
        {
          Version: '2012-10-17',
          Statement: [{ Sid: 'PublicReadGetObject', Effect: 'Allow', Principal: '*', Action: 's3:GetObject', Resource: `arn:aws:s3:::${x.bucket}/*` }]
        },
        null,
        2
      )
    );
    const subidos = subirObjetos(e, x.bucket, [
      { llave: 'index.html', tamano: 2310, tipo: 'text/html' },
      { llave: 'error.html', tamano: 860, tipo: 'text/html' },
      { llave: 'img/cartel-2026.jpg', tamano: 845120, tipo: 'image/jpeg' },
      { llave: 'img/mapa-escenarios.png', tamano: 312400, tipo: 'image/png' },
      { llave: 'css/estilos.css', tamano: 5120, tipo: 'text/css' }
    ]);
    // El contenido de las dos páginas (lo que el navegador simulado muestra).
    subidos[0].contenido = paginaFestival(x);
    subidos[1].contenido = '<html><head><title>Festival Jacaranda · página no encontrada</title></head><body style="font-family:sans-serif;padding:24px"><h1>Ups, esa página no existe</h1><p>Regresa al inicio del Festival Jacaranda.</p></body></html>';

    e.bitacora = [];
    anotar(e, 'Laboratorio', 'Inicio', `La cuenta empieza con el bucket ${x.bucket} de la agencia: público, con sitio web y una política que deja leer a todos.`);
    return e;
  },

  tareas(datos) {
    const x = datosLab(datos);
    return [
      {
        id: 'sitio',
        titulo: 'El sitio, privado y servido por CloudFront',
        puntos: 16,
        html: `
          <p>El viernes a las 10:00 todos van a abrir el sitio al mismo tiempo. Que lo reparta CloudFront desde sus ubicaciones de borde, y que <strong>nadie</strong> pueda leer el bucket directo.</p>
          ${vinetas([
            `El bucket ${c(x.bucket)} con <strong>Block all public access</strong> encendido (las cuatro casillas).`,
            'Su política ya no deja leer a todo el mundo: borra lo que puso la agencia (<code>"Principal": "*"</code>) <strong>antes</strong> de crear la distribución.',
            `Una distribución de CloudFront (puedes llamarla ${c(x.distribucion)}) cuyo origen sea el <strong>bucket</strong> ${c(`${x.bucket}.s3.us-east-1.amazonaws.com`)} con <strong>Origin access control</strong> (no el <em>website endpoint</em>, que exige un bucket público).`,
            `<em>Default root object</em>: ${c('index.html')}.`,
            'Al final, el dominio de la distribución (<code>d….cloudfront.net</code>) debe abrir la página del festival.'
          ])}`,
        pista:
          'El bucket se arregla en S3 → Buckets → tu bucket → Permissions: primero borra la Bucket policy de la agencia (Delete) y luego edita Block public access y marca todo. La distribución se crea en CloudFront → Distributions → Create distribution; en Specify origin elige Amazon S3, el bucket (no la opción «website endpoint» que te sugiere la consola) y «Origin access control settings»: CloudFront agrega a la política el permiso para él solo. Si al crearla sale «Failed to create distribution … conflicts with your Block Public Access settings», es que la política pública de la agencia sigue ahí: CloudFront no puede sumarle su permiso con el bloqueo encendido. Bórrala y vuelve a crear la distribución. Tarda unos 30 segundos en desplegarse; prueba con el botón «Open in browser».'
      },
      {
        id: 'dominio',
        titulo: 'El dominio del festival',
        puntos: 10,
        html: `
          <p>Nadie va a recordar <code>d1a2b3….cloudfront.net</code>. El festival ya compró su dominio ${c(x.dominio)}.</p>
          ${vinetas([
            `Una zona hospedada <strong>pública</strong> ${c(x.dominio)} en Route 53.`,
            `Un registro ${c(x.www)} de tipo <strong>A</strong> con <strong>Alias</strong> a tu distribución de CloudFront (un Alias no cuesta por consulta y sigue a la distribución aunque cambien sus IP).`,
            `Tu distribución acepta ese nombre: ${c(x.www)} en sus <em>Alternate domain names</em>.`,
            `Al final, ${c(`https://${x.www}`)} debe abrir la página del festival.`
          ])}
          <p><em>En AWS real, CloudFront además te pide un certificado de ACM para ese nombre; el simulador lo da por hecho.</em></p>`,
        pista:
          'La zona se crea en Route 53 → Hosted zones → Create hosted zone (Public hosted zone). Dentro de la zona, Create record: escribe «www» en Record name, tipo A, prende el interruptor Alias y en «Route traffic to» elige «Alias to CloudFront distribution». El nombre alterno se agrega en CloudFront → tu distribución → General → Settings → Edit → Alternate domain names (o en el paso Get started al crearla). Si la página contesta 403, revisa ese nombre alterno.'
      },
      {
        id: 'boletos',
        titulo: 'La tabla de boletos',
        puntos: 14,
        html: `
          <p>Cada boleto es un asiento de un evento. La gente también pide «ver mis boletos» con su correo, y la tabla debe aguantar la hora pico sin que calcules capacidad.</p>
          ${vinetas([
            `Una tabla de DynamoDB ${c(x.tabla)} con llave <strong>compuesta</strong>: <em>Partition key</em> ${c(x.pk)} (String) y <em>Sort key</em> ${c(x.sk)} (String).`,
            'Capacidad <strong>On-demand</strong>: pagas por petición y escala sola.',
            `Un <strong>índice global secundario</strong> (GSI) cuya partition key sea ${c(x.gsiPk)} (String); puedes llamarlo ${c(x.gsi)}.`,
            `Un boleto de prueba: ${c(x.pk)} = ${c(x.evento)}, ${c(x.sk)} = ${c(x.asiento)} y ${c(x.gsiPk)} = ${c(x.correoPrueba)}. Búscalo con <strong>Query</strong> sobre el índice para comprobar que lo encuentra por correo.`
          ])}`,
        pista:
          'Todo está en DynamoDB. La tabla se crea en Tables → Create table; el índice se agrega con «Customize settings» → Secondary indexes → Create global index (o después, en la pestaña Indexes de la tabla). La capacidad está en «Read/write capacity settings». El boleto se agrega en Explore items → tu tabla → Create item (Add new attribute → String para el correo). Para buscar, en Explore items cambia a Query y elige el índice en «Select a table or index».'
      },
      {
        id: 'pedidos',
        titulo: 'La cola de pedidos',
        puntos: 8,
        html: `
          <p>A las 10:00 llegan miles de compras por segundo. En vez de que el sistema de pagos las atienda todas a la vez, se forman en una cola.</p>
          ${vinetas([
            `Una cola <strong>Standard</strong> de SQS llamada ${c(x.cola)} (Standard aguanta casi cualquier cantidad de mensajes por segundo).`,
            'Cifrado en reposo encendido: los pedidos traen nombres y correos. (Las colas nuevas ya traen SSE-SQS encendido; revisa que no lo apagues).',
            `Que un pedido pueda esperar en la cola hasta <strong>${x.retencionDias} días</strong>: <em>Message retention period</em> de exactamente ${x.retencionDias} días, por si el procesador se cae un fin de semana.`
          ])}`,
        pista:
          'Se hace en Simple Queue Service → Queues → Create queue (tipo Standard). En Configuration está «Message retention period» (elige Days); el cifrado está en Encryption (Server-side encryption: Enabled). Si ya la creaste, cámbiala con Edit.'
      },
      {
        id: 'procesar',
        titulo: 'La función que procesa los pedidos',
        puntos: 14,
        html: `
          <p>Una función Lambda toma los pedidos de la cola y cobra cada uno. Solo corre (y solo cuesta) cuando hay pedidos.</p>
          ${vinetas([
            `Una función ${c(x.funcion)} con <em>runtime</em> ${c('Node.js 22.x')} o ${c('Python 3.13')} (uno más nuevo también vale).`,
            `Un <strong>timeout</strong> de ${c(`${x.timeout} seconds`)}: el banco a veces tarda en contestar y los 3 segundos de omisión no alcanzan.`,
            `Un <strong>disparador de SQS</strong> (trigger) desde ${c(x.cola)}, habilitado.`,
            `Mínimo privilegio: su rol de ejecución <strong>no</strong> lleva ${c('AdministratorAccess')} ni ${c('PowerUserAccess')}.`,
            `Prueba de punta a punta: manda un pedido de prueba a ${c(x.cola)} (por ejemplo ${c(`{"evento":"${x.evento}","asiento":"${x.asiento}"}`)}) y comprueba que la función lo procesó (la cola se vacía y la función registra la invocación).`
          ])}`,
        pista:
          'La función se crea en Lambda → Functions → Create function (Author from scratch). El timeout está en la pestaña Configuration → General configuration → Edit. El disparador se agrega con «+ Add trigger» en el diagrama (elige SQS y tu cola). Si al agregar el disparador sale «The provided execution role does not have permissions to call ReceiveMessage on SQS», agrégale al rol de la función la política AWSLambdaSQSQueueExecutionRole (IAM → Roles → Add permissions): es lo mínimo para leer colas, nada de AdministratorAccess. Si sale «Queue visibility timeout: 30 seconds is less than Function timeout», le pusiste a la función más tiempo que el Visibility timeout de la cola (30 s): mientras la función trabaja, el pedido volvería a aparecer y se cobraría dos veces. Deja la función en 30 s o sube el Visibility timeout de la cola. El pedido de prueba se manda en SQS → tu cola → Send and receive messages → Send message; la invocación la ves en la pestaña Monitor de la función.'
      },
      {
        id: 'avisos',
        titulo: 'Los avisos al equipo de guardia',
        puntos: 12,
        html: `
          <p>Cuando algo falle, el equipo de guardia debe enterarse por correo y, además, el aviso debe quedar en la cola de incidentes que lee su sistema de tickets (un aviso, varios destinos: <em>fan-out</em>).</p>
          ${vinetas([
            `Un tema <strong>Standard</strong> de SNS llamado ${c(x.tema)}.`,
            `Una suscripción <strong>Email</strong> a ${c(x.correo)}, <strong>confirmada</strong>.`,
            `Una cola Standard ${c(x.colaIncidentes)} suscrita al tema.`,
            `La política de acceso de ${c(x.colaIncidentes)} deja que el tema le mande mensajes (si no, SNS no puede entregarle nada).`
          ])}`,
        pista:
          'El tema y la suscripción de correo se hacen en Simple Notification Service → Topics → Create topic, y luego Create subscription (Protocol: Email). El correo de confirmación llega a la «Bandeja de correo (simulada)», en el menú izquierdo de SNS (sección Simulador): ábrelo y dale Confirm subscription. Para la cola, lo más fácil es SQS → jacaranda-incidentes → «Subscribe to Amazon SNS topic»: así la consola también agrega el permiso a la política de la cola.'
      },
      {
        id: 'programado',
        titulo: 'Liberar los apartados vencidos',
        puntos: 10,
        html: `
          <p>Quien aparta un asiento tiene 10 minutos para pagar. Cada 5 minutos, una tarea automática libera los apartados que no se pagaron, sin que nadie tenga que acordarse.</p>
          ${vinetas([
            `Una regla de EventBridge (puedes llamarla ${c(x.regla)}) de tipo <strong>Schedule</strong> que corra ${c(x.expresion)}.`,
            'La regla habilitada (<em>Enabled</em>).',
            `Su destino (<em>target</em>) es una función Lambda: puedes crear ${c(x.funcionApartados)} o, para la práctica, usar ${c(x.funcion)}.`
          ])}`,
        pista:
          'Se hace en Amazon EventBridge → Rules → Create rule; en Rule type elige «Schedule» y luego «Continue to create rule» (no hace falta EventBridge Scheduler); en el horario, «A schedule that runs at a regular rate», con 5 minutes. En Select target(s) elige «Lambda function» y tu función. En el simulador, cada «minuto» de una regla dura 10 segundos reales.'
      },
      {
        id: 'alarma',
        titulo: 'La alarma de la cola atorada',
        puntos: 16,
        html: `
          <p>Si los pedidos se acumulan es que la función no se da abasto o está fallando. El equipo de guardia debe saberlo antes que Twitter.</p>
          ${vinetas([
            `Una alarma de CloudWatch (puedes llamarla ${c(x.alarma)}) sobre la métrica ${c(x.metrica)} de la cola ${c(x.cola)} (espacio de nombres ${c('AWS/SQS')}).`,
            `Que se dispare cuando haya <strong>más de ${x.umbral}</strong> mensajes esperando (<em>Greater &gt; ${x.umbral}</em>).`,
            `Que, en estado <em>In alarm</em>, avise por SNS al tema ${c(x.tema)} (o a otro tema con un correo confirmado).`
          ])}`,
        pista:
          'Se hace en CloudWatch → Alarms → All alarms → Create alarm → Select metric → SQS → Queue Metrics, y buscas la fila de tu cola con ApproximateNumberOfMessagesVisible. En Conditions eliges Greater y escribes el umbral. En Configure actions, «In alarm» y «Select an existing SNS topic». Si todavía no ves la métrica, primero crea la cola.'
      },
      {
        id: 'dlq',
        titulo: 'Que ningún pedido se pierda ni se cicle',
        puntos: 6,
        bono: true,
        html: `
          <p><strong>Opcional.</strong> Si un pedido viene mal escrito, la función fallará con él una y otra vez. Si te sobra tiempo, apártalo en una cola de mensajes muertos para revisarlo a mano: suma hasta <strong>6 puntos extra</strong>, que compensan errores de las otras tareas, pero tu calificación nunca pasa de 100.</p>
          ${vinetas([
            `Una cola Standard ${c(x.dlq)}.`,
            `${c(x.cola)} con <strong>Dead-letter queue</strong> encendida apuntando a ${c(x.dlq)}, con <em>Maximum receives</em> = ${c(String(x.intentos))}.`
          ])}`,
        pista:
          'Primero crea la cola jacaranda-pedidos-dlq (Standard, como la original). Luego, en SQS → jacaranda-pedidos → Edit → Dead-letter queue: Enabled, elige la cola nueva y escribe Maximum receives.'
      }
    ];
  }
};
