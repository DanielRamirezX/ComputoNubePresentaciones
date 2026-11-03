// ---------------------------------------------------------------------------
// RUTA AWS CLOUD PRACTITIONER · SESIÓN 11 · PRÁCTICA 3: EL FESTIVAL Y SUS BOLETOS
//
// Tercera práctica integradora: sin servidores y desacoplado. El Festival
// Jacaranda (Ciudad de México) abre la venta de boletos a las 10:00 y el año
// pasado su único servidor se cayó a las 10:00:01. El alumno monta la taquilla
// en el simulador AWS (evaluacion-aws, laboratorio practica-3, que se califica
// solo): el sitio estático en S3, privado y servido con CloudFront (OAC), su
// dominio con un registro Alias de Route 53, los boletos en DynamoDB (llave
// compuesta, índice global y On-demand), una cola SQS de pedidos que procesa
// una Lambda, avisos por SNS (correo + cola), una regla programada de
// EventBridge y una alarma de CloudWatch sobre la cola. El bono es la cola de
// mensajes muertos (DLQ).
//
// La lección agrega lo que el CLF-C02 pregunta de esta familia de servicios y
// la Ruta solo había nombrado: API Gateway, Step Functions, Kinesis, Athena,
// Glue, Amazon Quick (antes QuickSight), EMR, OpenSearch, ECS, EKS, Fargate,
// ECR, ElastiCache y DAX, cada uno con su palabra clave para el examen.
//
// Datos revisados en la documentación oficial de AWS en noviembre de 2026:
// una cola SQS guarda mensajes de 1 minuto a 14 días (4 por omisión) y su
// visibility timeout es de 30 s por omisión; Lambda dura como máximo 15
// minutos y cobra por solicitudes y por duración; Kinesis Data Streams guarda
// los datos 24 horas por omisión y hasta 365 días; Kinesis Data Firehose se
// llama Amazon Data Firehose desde 2024; QuickSight pasó a ser parte de Amazon
// Quick Suite en octubre de 2025 (la guía CLF-C02 v1.3 ya lo llama «Amazon
// Quick»);
// el TTL de DynamoDB borra los ítems vencidos en unos días y sin gastar
// capacidad de escritura; las consultas a un registro Alias que apunta a
// CloudFront no se cobran.
// ---------------------------------------------------------------------------

import { icono, lista, nubi, recuadro } from './piezas.js';

/* ----------------------------------------------------- la arquitectura */

// Una caja del diagrama: título en negritas y renglones chicos debajo.
const caja = (x, y, w, h, relleno, titulo, renglones = [], punteada = false) => `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" class="trazo ${relleno}"${punteada ? ' stroke-dasharray="8 6"' : ''}/>
  <text x="${x + 12}" y="${y + 24}">${titulo}</text>
  ${renglones.map((r, i) => `<text x="${x + 12}" y="${y + 46 + i * 19}" class="etq-chica">${r}</text>`).join('')}`;

const flecha = (x1, y1, x2, y2, punteada = false) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="trazo" marker-end="url(#s11-punta)"${punteada ? ' stroke-dasharray="7 6" style="stroke-width:2"' : ''}/>`;

// El mismo diagrama sale en la lección del caso y en la práctica. Tres
// carriles: el sitio (lo que ve la gente), la compra (desacoplada) y la
// vigilancia. En el celular se desplaza de lado dentro de su caja.
const ARQUITECTURA = `
  <figure class="diagrama">
    <div style="overflow-x:auto">
      <svg class="diagrama__svg" style="min-width:660px;max-height:none" viewBox="0 0 880 580" role="img" aria-labelledby="s11-arq-titulo s11-arq-desc">
        <title id="s11-arq-titulo">La taquilla del festival después de la práctica</title>
        <desc id="s11-arq-desc">Tres carriles. Uno: los visitantes preguntan a Route 53 por www, que con un registro Alias los manda a CloudFront, y CloudFront entrega el sitio desde el bucket privado de S3. Dos: cada compra entra como mensaje a la cola SQS de pedidos, una función Lambda la procesa y guarda el boleto en la tabla de DynamoDB; los pedidos que fallan tres veces van a la cola de mensajes muertos. Tres: una alarma de CloudWatch vigila la cola y avisa al tema de SNS, que manda un correo y deja el aviso en la cola de incidentes; una regla de EventBridge corre cada 5 minutos una función que libera los apartados.</desc>
        <defs>
          <marker id="s11-punta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="relleno-tinta"/></marker>
        </defs>
        <text x="24" y="30">Taquilla del Festival Jacaranda · N. Virginia (us-east-1)</text>

        <text x="24" y="62" class="etq-chica">1 · EL SITIO: LO QUE VE LA GENTE (CloudFront y Route 53 son globales)</text>
        ${caja(24, 74, 150, 104, 'relleno-blanco', 'Visitantes', ['40 000 personas', 'a las 10:00'])}
        ${caja(204, 74, 180, 104, 'relleno-blanco', 'Route 53', ['www.jacaranda-….mx', 'registro A · Alias'])}
        ${caja(414, 74, 200, 104, 'relleno-verde', 'CloudFront', ['copia en el borde', 'origen S3 con OAC', 'raíz: index.html'])}
        ${caja(644, 74, 212, 104, 'relleno-amarillo', 'S3 · el sitio', ['jacaranda-sitio-…', 'bloqueo público: todo', 'solo CloudFront lee'])}
        ${flecha(174, 126, 202, 126)}
        ${flecha(384, 126, 412, 126)}
        ${flecha(614, 126, 642, 126)}

        <text x="24" y="212" class="etq-chica">2 · LA COMPRA: DESACOPLADA Y SIN SERVIDORES</text>
        ${caja(24, 224, 150, 112, 'relleno-blanco', 'Pedido', ['cada compra es', 'un mensaje'])}
        ${caja(204, 224, 180, 112, 'relleno-azul', 'SQS · pedidos', ['jacaranda-pedidos', 'Standard · cifrada', 'aguanta el golpe'])}
        ${caja(414, 224, 200, 112, 'relleno-blanco', 'Lambda', ['procesa los pedidos', 'trigger SQS · 30 s', 'rol con lo mínimo'])}
        ${caja(644, 224, 212, 112, 'relleno-amarillo', 'DynamoDB', ['evento + asiento', 'índice correo-index', 'On-demand'])}
        ${flecha(174, 280, 202, 280)}
        ${flecha(384, 280, 412, 280)}
        ${flecha(614, 280, 642, 280)}
        ${caja(24, 358, 150, 64, 'relleno-blanco', 'DLQ (bono)', ['tras 3 intentos'], true)}
        ${flecha(214, 336, 177, 372, true)}

        <text x="24" y="450" class="etq-chica">3 · VIGILAR Y AUTOMATIZAR</text>
        ${caja(204, 462, 180, 100, 'relleno-blanco', 'CloudWatch', ['alarma: pedidos', 'atorados en la cola'])}
        ${caja(414, 462, 200, 100, 'relleno-blanco', 'SNS · alertas', ['correo de guardia', 'cola de incidentes'])}
        ${caja(644, 462, 212, 100, 'relleno-blanco', 'EventBridge', ['rate(5 minutes)', 'libera los apartados'])}
        ${flecha(294, 338, 294, 460, true)}
        ${flecha(384, 512, 412, 512)}
        ${flecha(690, 462, 604, 340)}
        <text x="24" y="490" class="etq-chica">Nada que encender</text>
        <text x="24" y="509" class="etq-chica">ni parchar: cada</text>
        <text x="24" y="528" class="etq-chica">pieza crece sola</text>
        <text x="24" y="547" class="etq-chica">y cobra por uso.</text>
      </svg>
    </div>
    <figcaption class="sutil">Línea continua: por dónde viaja la petición o el mensaje. Punteada: la alarma vigila la cola, y los pedidos que fallan tres veces se apartan en la DLQ.</figcaption>
  </figure>`;

export const SESION_11 = {
  numero: 11,
  titulo: 'Práctica 3 · El festival y sus boletos',
  subtitulo: 'Sesión 11 · Práctica 3: el festival y sus boletos',
  resumen:
    'Un festival de música de la Ciudad de México abre su venta de boletos a las 10:00 y el año pasado su servidor se cayó en un segundo. En el simulador AWS montas una taquilla sin servidores y desacoplada: el sitio en S3 con CloudFront y Route 53, los boletos en DynamoDB, una cola SQS con una Lambda que procesa los pedidos, avisos por SNS, una tarea programada de EventBridge y una alarma. Además repasas lo que el examen pregunta de API Gateway, Step Functions, analítica y contenedores.',
  duracion: '2 horas',
  minutosSandbox: 0,

  practica: {
    titulo: 'Examen de práctica · Sesión 11',
    corto: 'Examen de práctica',
    resumen: '20 preguntas sobre arquitecturas sin servidores, analítica y contenedores al estilo del examen de certificación, dos de respuesta múltiple, en unos 15 minutos y una sola entrega.',
    plegable: 'Ver cómo es el examen real',
    sobre: 'la taquilla del festival, los servicios sin servidores, la analítica y los contenedores'
  },

  capitulos: [
    /* ================================================================ 1 */
    {
      numero: 1,
      titulo: 'El caso y lo que pide el examen',
      descripcion:
        'Por qué se cayó la taquilla del festival, cómo queda cuando termines y qué servicio hace cada cosa. Después, los servicios que el examen pregunta aunque hoy no los toques, con la palabra clave para reconocer cada uno.',
      actividades: [
        {
          id: 's11-caso',
          tipo: 'leccion',
          titulo: 'La taquilla que se cayó',
          xp: 50,
          minutos: 5,
          laminas: [
            {
              titulo: 'Las 10:00:01 del año pasado',
              html: `
                <p class="entrada">El <strong>Festival Jacaranda</strong> llena un parque de la Ciudad de México tres días cada marzo. El año pasado la venta abrió a las 10:00 y a las <strong>10:00:01</strong> la taquilla en línea se cayó: <strong>40 000 personas</strong> entraron al mismo tiempo a un solo servidor.</p>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Lo que pasó</th><th scope="col">Por qué falló</th><th scope="col">Cómo lo resuelves este año</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Un servidor daba la página, cobraba y guardaba los boletos</th><td>Todo dependía de una máquina: si se saturaba, se caía todo junto.</td><td>Cada parte en su servicio: la página en <strong>S3 + CloudFront</strong>, los pedidos en <strong>SQS</strong>, el cobro en <strong>Lambda</strong>.</td></tr>
                      <tr><th scope="row">Cada compra esperaba la respuesta del banco</th><td>Si el banco tardaba, las peticiones se amontonaban hasta tumbar el servidor.</td><td>La compra entra a una <strong>cola</strong> y la función la procesa a su ritmo: nadie pierde su lugar.</td></tr>
                      <tr><th scope="row">La base de datos vivía en el mismo servidor</th><td>No podía crecer en el momento del pico.</td><td><strong>DynamoDB On-demand</strong>: crece sola y cobra por petición.</td></tr>
                      <tr><th scope="row">Se enteraron por las redes sociales</th><td>Nadie vigilaba.</td><td>Una <strong>alarma de CloudWatch</strong> que avisa por <strong>SNS</strong>.</td></tr>
                      <tr><th scope="row">La agencia dejó el bucket del sitio público</th><td>Cualquiera lee el bucket directo y se salta la caché.</td><td>Bucket privado y servido <strong>solo por CloudFront</strong> (OAC).</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('sabias', '<strong>Sin servidores</strong> (<em>serverless</em>) no quiere decir que no haya servidores: quiere decir que <strong>tú no los administras</strong>. AWS los enciende, los parcha y los multiplica cuando llega la gente, y tú pagas por lo que usas.')}`,
              notas: 'Pregunta al grupo antes de mostrar la tercera columna: si a las 10:00 llegan 40 000 compras, ¿qué harían para que no se caiga? Casi siempre dicen «un servidor más grande». La idea de hoy es otra: que nada dependa de un solo servidor.'
            },
            {
              titulo: 'La arquitectura que vas a montar',
              html: `
                ${ARQUITECTURA}
                ${recuadro('recuerda', '<strong>Desacoplar</strong> es poner algo en medio (una cola, un tema) para que una pieza no espere a la otra. Si la función que cobra se cae o se tarda, los pedidos esperan en la cola en vez de perderse, y cada parte <strong>escala y falla por separado</strong>.')}`,
              notas: 'Recorre los tres carriles: lo que ve la gente (de arriba), lo que pasa con cada compra (en medio) y quién vigila y automatiza (abajo). Señala que ninguna caja es un servidor EC2.'
            },
            {
              titulo: 'Tres formas de pasar mensajes',
              html: `
                <p class="entrada">Hoy usas tres servicios que mueven mensajes. Se parecen, pero el examen los distingue muy bien.</p>
                <div class="rejilla rejilla--2 roles">
                  <article class="rol">${icono('maleta')}<h3>Amazon SQS · una cola</h3><p>Los mensajes <strong>esperan</strong> hasta que alguien los saca y los procesa; cada mensaje lo atiende un solo consumidor. Guarda los mensajes de 1 minuto a 14 días (4 por omisión). <strong>Standard</strong> aguanta casi cualquier volumen; <strong>FIFO</strong> respeta el orden y no duplica.</p></article>
                  <article class="rol">${icono('alerta')}<h3>Amazon SNS · un tema</h3><p>Publicas <strong>una vez</strong> y el tema lo <strong>empuja</strong> al instante a todos sus suscriptores: correo, SMS, colas SQS o funciones Lambda. No guarda los mensajes para después.</p></article>
                  <article class="rol">${icono('reloj')}<h3>Amazon EventBridge · reglas</h3><p>Reacciona a <strong>eventos</strong> («se creó un objeto», «una instancia se detuvo») o a un <strong>horario</strong> (<code>rate(5 minutes)</code>, cron) y llama al destino: una Lambda, una cola o un tema.</p></article>
                  <article class="rol">${icono('codigo')}<h3>AWS Lambda · la función</h3><p>Tu código corre <strong>solo cuando algo lo llama</strong> (un mensaje, un evento, una petición), hasta 15 minutos por vez. Pagas por número de ejecuciones y por el tiempo que corre.</p></article>
                </div>
                ${recuadro('examen', '<em>“Desacoplar”, “amortiguar picos”, “que no se pierdan pedidos”</em> → <strong>SQS</strong>. <em>“Avisar a muchos a la vez”, “fan-out”, “notificación push”</em> → <strong>SNS</strong>. <em>“Cada 5 minutos”, “cuando ocurra tal evento”</em> → <strong>EventBridge</strong>.')}`,
              notas: 'Analogía: SQS es la fila de las tortillas (cada quien espera su turno y lo atiende una persona); SNS es el altavoz del mercado (todos lo oyen a la vez, y si no estabas, no lo oíste); EventBridge es la alarma del despertador o el sensor de la puerta.'
            }
          ]
        },
        {
          id: 's11-examen',
          tipo: 'leccion',
          titulo: 'Lo que el examen también pregunta',
          xp: 50,
          minutos: 6,
          laminas: [
            {
              titulo: 'Conectar y orquestar',
              html: `
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Servicio</th><th scope="col">Qué hace</th><th scope="col">Palabra clave del examen</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Amazon API Gateway</th><td>La <strong>puerta de entrada</strong> de tus apps: crea y publica API REST, HTTP y WebSocket que llaman a Lambda u otros servicios. Pone límites de peticiones, claves de API con planes de uso, autenticación y caché. Sin servidores.</td><td>“crear y publicar una API”, “límite de peticiones”</td></tr>
                      <tr><th scope="row">AWS Step Functions</th><td>Coordina un <strong>flujo de varios pasos</strong> (máquina de estados) con un diagrama visual: qué paso sigue, decisiones, esperas, <strong>reintentos</strong> y qué hacer si algo falla. Junta Lambdas y otros servicios.</td><td>“orquestar”, “flujo de trabajo”, “pasos en orden”</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('cuidado', '<strong>SQS</strong> guarda mensajes para que otro los procese; <strong>Step Functions</strong> decide <em>qué paso sigue</em> en un proceso. Ejemplo del festival: apartar el asiento → cobrar → mandar el boleto, y si el cobro falla, liberar el asiento. Eso es Step Functions.')}`,
              notas: 'API Gateway no es un balanceador: es para API (peticiones de apps), con claves, cuotas y límites por cliente. Un ALB reparte tráfico entre servidores.'
            },
            {
              titulo: 'Datos en movimiento y analítica',
              html: `
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Servicio</th><th scope="col">Qué hace</th><th scope="col">Palabra clave del examen</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Amazon Kinesis</th><td><strong>Data Streams</strong> recibe datos <strong>en tiempo real</strong> (sensores, clics, registros) y varias apps los leen; los guarda 24 horas o hasta 365 días. <strong>Amazon Data Firehose</strong> (antes Kinesis Data Firehose) los entrega por sí mismo a destinos como S3, Redshift u OpenSearch.</td><td>“tiempo real”, “streaming”</td></tr>
                      <tr><th scope="row">Amazon Athena</th><td>Consultas <strong>SQL directo sobre archivos en S3</strong>, sin cargar nada a una base ni administrar servidores. Pagas por los datos que lee cada consulta.</td><td>“SQL sobre S3”</td></tr>
                      <tr><th scope="row">AWS Glue</th><td><strong>ETL</strong> sin servidores: extrae, limpia y transforma datos; su <strong>Data Catalog</strong> anota qué tablas y columnas hay (Athena lo usa).</td><td>“ETL”, “preparar y catalogar datos”</td></tr>
                      <tr><th scope="row">Amazon Quick (antes QuickSight)</th><td><strong>Tableros</strong> e inteligencia de negocios (BI) que se comparten en el navegador. Hasta 2025 se llamaba QuickSight; hoy sus tableros son «Quick Sight».</td><td>“tableros”, “visualizar”, “BI”</td></tr>
                      <tr><th scope="row">Amazon EMR</th><td><strong>Clústeres de big data</strong> con Apache Spark, Hadoop y similares, para procesar volúmenes enormes.</td><td>“Spark”, “Hadoop”</td></tr>
                      <tr><th scope="row">Amazon OpenSearch Service</th><td><strong>Búsqueda de texto</strong> y análisis de registros casi en tiempo real.</td><td>“buscar en texto”, “analizar logs”</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('examen', 'Piensa en el camino de los datos: <strong>Kinesis</strong> los recibe → <strong>Glue</strong> los limpia → <strong>Athena</strong> los consulta en S3 → <strong>Amazon Quick</strong> los dibuja. Si dice “Spark o Hadoop”, es <strong>EMR</strong>.')}`,
              notas: 'En 2025 AWS integró QuickSight a Amazon Quick Suite, y la guía CLF-C02 v1.3 ya lo llama «Amazon Quick». En bancos viejos sale como QuickSight: para el examen, basta reconocer «tableros de BI».'
            },
            {
              titulo: 'Contenedores y cachés',
              html: `
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Servicio</th><th scope="col">Qué hace</th><th scope="col">Palabra clave del examen</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Amazon ECS</th><td>El orquestador de <strong>contenedores propio de AWS</strong>: arranca, reparte y reemplaza tus contenedores.</td><td>“contenedores Docker”</td></tr>
                      <tr><th scope="row">Amazon EKS</th><td><strong>Kubernetes</strong> administrado: AWS se encarga del plano de control.</td><td>“Kubernetes”</td></tr>
                      <tr><th scope="row">AWS Fargate</th><td>Corre los contenedores de ECS o EKS <strong>sin servidores que administrar</strong>: das CPU y memoria y AWS pone, parcha y escala la máquina.</td><td>“contenedores sin servidores”</td></tr>
                      <tr><th scope="row">Amazon ECR</th><td>El <strong>registro de imágenes</strong> de contenedor, privado y administrado.</td><td>“guardar imágenes de contenedor”</td></tr>
                      <tr><th scope="row">Amazon ElastiCache</th><td><strong>Caché en memoria</strong> (Valkey, Redis OSS o Memcached) delante de cualquier base o app: guarda lo que se pide mucho.</td><td>“en memoria”, “sesiones”, “aliviar la base”</td></tr>
                      <tr><th scope="row">Amazon DynamoDB Accelerator (DAX)</th><td>Caché en memoria hecha <strong>solo para DynamoDB</strong>: lecturas en <strong>microsegundos</strong>.</td><td>“microsegundos en DynamoDB”</td></tr>
                    </tbody>
                  </table>
                </div>
                ${nubi('Truco: <strong>ECS</strong> o <strong>EKS</strong> deciden <em>qué</em> contenedores corren; <strong>Fargate</strong> o EC2 son <em>dónde</em> corren. Y si el examen dice “microsegundos” con DynamoDB, es <strong>DAX</strong>; con cualquier otra base, <strong>ElastiCache</strong>.')}`,
              notas: 'Lambda o Fargate: Lambda corre funciones cortas (hasta 15 minutos) cuando llega un evento; Fargate corre contenedores el tiempo que haga falta. Los dos son «sin servidores».'
            }
          ]
        },
        {
          id: 's11-ex-servicio',
          tipo: 'clasificar',
          titulo: '¿Qué servicio lo resuelve?',
          xp: 50,
          minutos: 3,
          contexto: '<p>El festival ya tiene su taquilla. Ahora el equipo pide cuatro cosas más, y cada una se resuelve con uno de estos servicios.</p>',
          pregunta: 'Manda cada pedido al servicio que lo resuelve.',
          grupos: [
            { id: 'apigw', nombre: 'API Gateway', color: 'blue' },
            { id: 'stepfn', nombre: 'Step Functions', color: 'purple' },
            { id: 'kinesis', nombre: 'Kinesis', color: 'yellow' },
            { id: 'athena', nombre: 'Athena', color: 'green' }
          ],
          fichas: [
            { texto: 'Darle a la app móvil del festival una dirección HTTPS que llame a una función Lambda', grupo: 'apigw', retro: 'Publicar una API delante de Lambda: API Gateway.' },
            { texto: 'Que el mapa en vivo del festival mantenga una conexión abierta (WebSocket) con cada teléfono', grupo: 'apigw', retro: 'API Gateway también crea API WebSocket, con conexión de ida y vuelta.' },
            { texto: 'Apartar el asiento, cobrar y mandar el boleto en orden; si el cobro falla, liberar el asiento', grupo: 'stepfn', retro: 'Pasos en orden con manejo de errores: Step Functions.' },
            { texto: 'Un proceso de reembolso con reintentos y un diagrama que muestra en qué paso va cada caso', grupo: 'stepfn', retro: 'Un flujo de trabajo visual con reintentos: Step Functions.' },
            { texto: 'Recibir al segundo las lecturas de los sensores de aforo de cada escenario', grupo: 'kinesis', retro: 'Datos que llegan sin parar, en tiempo real: Kinesis.' },
            { texto: 'Juntar en un flujo continuo las publicaciones con #Jacaranda para mostrarlas en vivo', grupo: 'kinesis', retro: 'Un flujo continuo de eventos para procesar al momento: Kinesis.' },
            { texto: 'Preguntar con SQL a los archivos de ventas del año pasado que están en S3, sin cargarlos a una base', grupo: 'athena', retro: 'SQL directo sobre archivos en S3: Athena.' },
            { texto: 'Revisar con una consulta SQL las bitácoras de CloudFront guardadas en un bucket', grupo: 'athena', retro: 'Las bitácoras viven en S3 y se consultan con SQL: Athena.' }
          ],
          cierre: 'API Gateway publica API, Step Functions coordina pasos, Kinesis recibe datos en tiempo real y Athena consulta con SQL lo que ya está en S3.',
          pista: '¿Es una puerta de entrada para apps, un proceso de varios pasos, datos que llegan sin parar o una consulta a archivos guardados?'
        }
      ]
    },

    /* ================================================================ 2 */
    {
      numero: 2,
      titulo: 'Práctica en el simulador AWS',
      descripcion:
        'La práctica completa en el simulador AWS: montas la taquilla del festival sin servidores y desacoplada. Se califica sola mientras avanzas y tu docente ve tu progreso.',
      actividades: [
        {
          id: 's11-practica',
          tipo: 'simulador',
          titulo: 'Práctica 3: el festival vende boletos en hora pico',
          xp: 400,
          minutos: 84,
          lab: 'practica-3',
          objetivo:
            'Montar la taquilla del festival sin servidores y desacoplada: el sitio privado servido por CloudFront con su dominio, los boletos en DynamoDB, los pedidos en una cola que procesa una función Lambda, avisos al equipo de guardia, una tarea programada y una alarma que detecta pedidos atorados.',
          necesitas: [
            'Tu perfil de la Ruta: el simulador lo reconoce y le muestra tu avance a tu docente.',
            'Que tu docente abra la Práctica 3 en su panel.',
            'Una computadora o tableta: la consola en el celular es incómoda.',
            'No necesitas DataCamp ni tarjeta: todo es simulado y no cuesta nada.'
          ],
          caso: `
            <p>El <strong>Festival Jacaranda</strong> abre la venta de boletos el viernes a las 10:00. Su dueña, <strong>Mariana Ocampo</strong>, no quiere servidores que se saturen ni que haya que encender a mano: te contrató para montar la taquilla <strong>sin servidores y desacoplada</strong>.</p>
            <p>En tu cuenta del simulador ya está el bucket <code>jacaranda-sitio-…</code> con la página que subió la agencia de diseño, pero lo dejó <strong>público</strong> para «verlo rápido». Lo demás lo creas tú. Todo va en <strong>N. Virginia (us-east-1)</strong>; CloudFront y Route 53 son globales. Algunos nombres y números llevan tu sufijo o cambian por alumno: el simulador te dice los tuyos en cada tarea.</p>
            ${recuadro('consejo', 'Un orden que funciona: el bucket (primero borra la política pública) → la distribución de CloudFront, que tarda unos 30 segundos, y mientras tanto la tabla de DynamoDB → el dominio en Route 53 → la cola → la función con su disparador → el tema de SNS (confirma el correo en la bandeja simulada) → la regla de EventBridge → la alarma → el bono si te sobra tiempo.')}
            ${recuadro('recuerda', 'Cada tarea pide un <strong>resultado</strong>, no una lista de clics. La <strong>pista</strong> de cada tarea te dice en qué servicio y pantalla se hace. Con «Revisar mi avance» ves qué te falta.')}`,
          arquitectura: ARQUITECTURA,
          tareas: [
            '<strong>El sitio, privado y servido por CloudFront.</strong> El bucket del sitio sin la política pública de la agencia y con <em>Block all public access</em>; una distribución de CloudFront con el bucket como origen y <em>Origin access control</em> (no el <em>website endpoint</em>), <em>Default root object</em> <code>index.html</code>, y su dominio <code>d….cloudfront.net</code> abriendo la página.',
            '<strong>El dominio del festival.</strong> Una zona hospedada pública <code>jacaranda-…mx</code> en Route 53, un registro <code>www</code> de tipo A con <strong>Alias</strong> a tu distribución, ese nombre en sus <em>Alternate domain names</em>, y <code>https://www.…</code> abriendo la página.',
            '<strong>La tabla de boletos.</strong> Una tabla de DynamoDB <code>jacaranda-boletos</code> con llave compuesta (<code>evento</code> + <code>asiento</code>), capacidad <strong>On-demand</strong>, un índice global secundario por <code>correo</code> y un boleto de prueba que encuentres con <strong>Query</strong> sobre el índice.',
            '<strong>La cola de pedidos.</strong> Una cola SQS <strong>Standard</strong> <code>jacaranda-pedidos</code>, cifrada, con la retención de mensajes en los días que te toquen.',
            '<strong>La función que procesa los pedidos.</strong> Una Lambda <code>jacaranda-procesa-pedidos</code> (Node.js 22.x o Python 3.13, o más nuevos) con timeout de 30 segundos, un disparador de SQS desde la cola, un rol sin <code>AdministratorAccess</code> ni <code>PowerUserAccess</code>, y un pedido de prueba procesado de punta a punta.',
            '<strong>Los avisos al equipo de guardia.</strong> Un tema SNS Standard <code>jacaranda-alertas</code> con una suscripción de correo <strong>confirmada</strong> y la cola <code>jacaranda-incidentes</code> suscrita, con su política de acceso dejando entrar al tema (<em>fan-out</em>).',
            '<strong>Liberar los apartados vencidos.</strong> Una regla de EventBridge de tipo <em>Schedule</em> con <code>rate(5 minutes)</code>, habilitada, cuyo destino sea una función Lambda.',
            '<strong>La alarma de la cola atorada.</strong> Una alarma de CloudWatch sobre <code>Approximate<wbr>NumberOf<wbr>Messages<wbr>Visible</code> de <code>jacaranda-pedidos</code>, mayor que tu umbral, que en <em>In alarm</em> avise al tema de SNS.',
            '<strong>Bono opcional:</strong> una cola de mensajes muertos <code>jacaranda-pedidos-dlq</code> conectada a la cola de pedidos con <em>Maximum receives</em> = 3. Suma puntos extra, pero tu calificación no pasa de 100.'
          ]
        }
      ]
    },

    /* ================================================================ 3 */
    {
      numero: 3,
      titulo: 'Repaso para el examen',
      descripcion: 'Lo que montaste hoy y los servicios que el examen pregunta, en una hoja, y un verdadero o falso para calentar antes del examen de práctica.',
      actividades: [
        {
          id: 's11-repaso',
          tipo: 'leccion',
          titulo: 'Sin servidores en una hoja',
          xp: 50,
          minutos: 3,
          laminas: [
            {
              titulo: 'La sesión 11 en una hoja',
              html: `
                <div class="repaso">
                  <div class="repaso__capitulo"><span class="repaso__numero">1</span>${lista([
                    '<strong>S3 + CloudFront</strong>: el bucket privado y solo CloudFront lo lee (OAC). Si cambias un archivo, una <strong>invalidación</strong> borra la copia vieja del borde.',
                    '<strong>Route 53</strong>: un registro <strong>Alias</strong> apunta a CloudFront, un ALB o S3, sirve hasta en el dominio raíz y no cobra esas consultas.',
                    '<strong>DynamoDB</strong>: llave compuesta (partición + ordenamiento), <strong>GSI</strong> para buscar por otro atributo, On-demand para picos y TTL para borrar lo viejo.'
                  ])}</div>
                  <div class="repaso__capitulo"><span class="repaso__numero">2</span>${lista([
                    '<strong>SQS</strong> amortigua y desacopla; <strong>FIFO</strong> si importa el orden; <strong>visibility timeout</strong> mayor que lo que tarda la función; <strong>DLQ</strong> para los que fallan siempre.',
                    '<strong>Lambda</strong>: corre por evento, hasta 15 min, cobra por ejecuciones y duración. <strong>SNS</strong>: un aviso a muchos (fan-out). <strong>EventBridge</strong>: eventos y horarios.',
                    '<strong>CloudWatch</strong>: una alarma sobre los mensajes visibles de la cola detecta pedidos atorados.'
                  ])}</div>
                  <div class="repaso__capitulo"><span class="repaso__numero">3</span>${lista([
                    '<strong>API Gateway</strong>: publicar API. <strong>Step Functions</strong>: orquestar pasos con reintentos.',
                    '<strong>Kinesis</strong>: tiempo real. <strong>Glue</strong>: ETL y catálogo. <strong>Athena</strong>: SQL sobre S3. <strong>Amazon Quick</strong> (antes QuickSight): tableros. <strong>EMR</strong>: Spark y Hadoop. <strong>OpenSearch</strong>: búsqueda y logs.',
                    '<strong>ECS</strong>: contenedores de AWS. <strong>EKS</strong>: Kubernetes. <strong>Fargate</strong>: sin servidores. <strong>ECR</strong>: imágenes. <strong>ElastiCache</strong> y <strong>DAX</strong>: caché en memoria.'
                  ])}</div>
                </div>`,
              notas: 'Pide que alguien explique en voz alta la diferencia entre SQS y SNS, y entre Step Functions y una cola.'
            }
          ]
        },
        {
          id: 's11-vf',
          tipo: 'clasificar',
          titulo: '¿Verdadero o falso?',
          xp: 100,
          minutos: 4,
          contexto: '<p>Calentamiento antes del examen de práctica.</p>',
          pregunta: 'Decide si cada afirmación es verdadera o falsa.',
          grupos: [
            { id: 'v', nombre: 'Verdadero', color: 'green' },
            { id: 'f', nombre: 'Falso', color: 'red' }
          ],
          fichas: [
            { texto: 'Una cola de SQS guarda los pedidos aunque la función que los procesa esté caída.', grupo: 'v', retro: 'Verdadero: los mensajes esperan en la cola (hasta 14 días) y se procesan cuando la función vuelve.' },
            { texto: 'Amazon SNS guarda cada mensaje hasta que alguien pasa a recogerlo, como una cola.', grupo: 'f', retro: 'Falso: SNS empuja el mensaje al instante a sus suscriptores. Para que espere, suscribe una cola SQS al tema.' },
            { texto: 'Un registro Alias de Route 53 puede apuntar el dominio raíz (sin www) a una distribución de CloudFront.', grupo: 'v', retro: 'Verdadero: un CNAME no se permite en el dominio raíz, pero un Alias sí.' },
            { texto: 'Para usar Amazon Athena primero hay que cargar los datos en una base de datos.', grupo: 'f', retro: 'Falso: Athena consulta con SQL los archivos directo en S3.' },
            { texto: 'AWS Step Functions puede reintentar un paso que falló y seguir con el resto del flujo.', grupo: 'v', retro: 'Verdadero: cada paso puede tener reintentos y un camino para cuando falla.' },
            { texto: 'Amazon EKS es el orquestador de contenedores propio de AWS, distinto de Kubernetes.', grupo: 'f', retro: 'Falso: EKS es Kubernetes administrado. El orquestador propio de AWS es ECS.' },
            { texto: 'En DynamoDB, un índice global secundario permite buscar por un atributo que no es la llave de la tabla.', grupo: 'v', retro: 'Verdadero: por eso la taquilla encuentra los boletos por correo.' },
            { texto: 'AWS Lambda cobra por cada hora que la función existe, aunque nadie la llame.', grupo: 'f', retro: 'Falso: Lambda cobra por ejecuciones y por el tiempo que corre. Si nadie la llama, no cuesta.' }
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
      hasta: 14,
      titulo: 'Arranque y capítulo 1 · El caso y lo que pide el examen',
      capitulo: 1,
      pasos: [
        'Proyecta el QR de la plataforma y que abran “Ruta AWS Cloud Practitioner”, sesión 11. Hoy no hay sandbox de DataCamp.',
        'Proyecta “La taquilla que se cayó”: que el grupo proponga cómo aguantar 40 000 compras antes de ver la tercera columna.',
        'En “Tres formas de pasar mensajes” usa la analogía de la fila de las tortillas (SQS) y el altavoz del mercado (SNS).',
        'Pasa rápido por “Lo que el examen también pregunta” y, mientras resuelven “¿Qué servicio lo resuelve?”, abre la Práctica 3 en el panel de Evaluación.'
      ],
      vigila: 'No te alargues en las tablas de analítica y contenedores: el examen de práctica las vuelve a preguntar y el simulador necesita su tiempo.'
    },
    {
      desde: 14,
      hasta: 98,
      titulo: 'Capítulo 2 · Práctica en el simulador',
      capitulo: 2,
      pasos: [
        'En el panel de Evaluación abre la Práctica 3 (el festival). Que cada quien entre desde la actividad con «Abrir la práctica en el simulador».',
        'Lee el caso en voz alta y remarca el primer tropiezo: hay que borrar la política pública del bucket antes de crear la distribución.',
        'Recuerda que la distribución tarda unos 30 segundos en desplegarse: mientras, que avancen con DynamoDB.',
        'A la mitad, pregunta quién ya confirmó el correo de SNS en la «Bandeja de correo (simulada)»: es lo que más se olvida.',
        'Recorre el salón con el panel abierto en tu equipo: muestra quién va atorado en qué tarea.',
        'Diez minutos antes del final avisa que entreguen, aunque les falte algo: después pueden reintentar.'
      ],
      vigila: 'Que nadie le ponga AdministratorAccess al rol de la función «para que funcione»: la política mínima es AWSLambdaSQSQueueExecutionRole.'
    },
    {
      desde: 98,
      hasta: 105,
      titulo: 'Capítulo 3 · Repaso',
      capitulo: 3,
      pasos: ['Proyecta la hoja de repaso.', 'El verdadero o falso es el termómetro antes del examen.'],
      vigila: 'Cuando casi todos terminen, abre el examen de práctica de la sesión 11.'
    },
    {
      desde: 105,
      hasta: 120,
      titulo: 'Examen de práctica y cierre',
      pasos: [
        'En el panel elige la sesión 11 y abre el examen en la pestaña “Práctica final”.',
        '20 preguntas en 15 minutos; dos son de respuesta múltiple («Elige DOS»). Una sola entrega.',
        'Al final, cierra el examen, proyecta las preguntas más falladas y descarga el CSV.',
        'Anuncia la sesión 12: la cadena de cafeterías que ordena sus cuentas y su factura.'
      ],
      vigila: 'No proyectes el panel mientras contestan: muestra nombres y calificaciones.'
    }
  ]
};
