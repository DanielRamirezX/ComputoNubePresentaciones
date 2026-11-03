// ---------------------------------------------------------------------------
// RUTA AWS CLOUD PRACTITIONER · SESIÓN 8 · SIMULACRO DE CERTIFICACIÓN
//
// La clase gira alrededor del simulacro: 65 preguntas de los cuatro dominios
// del CLF-C02 en 90 minutos (src/practica8.js), con puntaje estimado de 1000 y
// reporte por dominio y por sesión de la Ruta. No hay laboratorio ni sandbox.
//
// Capítulo 1 (antes del simulacro): cómo es el examen real y cómo se contesta,
// y lo que el examen pregunta y la Ruta no vio (IA/ML, analítica, despliegue e
// IaC, migración, borde e híbrido, servicios de seguridad que solo salieron
// como distractores y recursos de soporte). s8-extras es el destino de REPASO
// para las preguntas «fuera de la Ruta» (sesion: 0).
//
// Capítulo 2 (después): cómo leer el reporte y armar un plan de estudio. El
// alumno que sigue el orden lo ve antes del examen, por eso está escrito en
// condicional («cuando entregues…»).
//
// Datos revisados contra la guía oficial del CLF-C02 (servicios en alcance y
// tareas de cada dominio) en noviembre de 2026.
// ---------------------------------------------------------------------------

import { icono, lista, nubi, recuadro } from './piezas.js';

export const SESION_8 = {
  numero: 8,
  titulo: 'Simulacro de certificación',
  subtitulo: 'Sesión 8 · Simulacro de certificación',
  resumen:
    'El ensayo general: un simulacro de 65 preguntas de los cuatro dominios en 90 minutos, igual que el examen AWS Certified Cloud Practitioner. Antes, la estrategia para contestar y un repaso de lo que el examen pregunta y la Ruta no vio; después, cómo leer tu reporte por dominio y por sesión para saber qué estudiar.',
  duracion: '2 horas',
  minutosSandbox: 0,

  practica: {
    titulo: 'Simulacro CLF-C02 · Sesión 8',
    corto: 'Simulacro',
    resumen: '65 preguntas de los cuatro dominios en 90 minutos, con puntaje estimado de 1000 y reporte por dominio. Una sola entrega.',
    plegable: 'Ver cómo es el examen real',
    sobre: 'los cuatro dominios del examen CLF-C02'
  },

  capitulos: [
    /* ================================================================ 1 */
    {
      numero: 1,
      titulo: 'Antes del simulacro',
      descripcion:
        'Cómo es el examen real, cómo leer cada pregunta para no caer en las trampas, y un mapa rápido de los temas que el examen pregunta y que en la Ruta no tocamos con las manos.',
      actividades: [
        {
          id: 's8-estrategia',
          tipo: 'leccion',
          titulo: 'Cómo se contesta el examen',
          xp: 50,
          minutos: 4,
          laminas: [
            {
              titulo: 'Así es el examen real',
              html: `
                <p class="entrada">El simulacro de hoy tiene la misma forma que el <strong>CLF-C02</strong>. Si hoy te va bien con el reloj corriendo, el día del examen nada te va a sorprender.</p>
                <div class="rejilla rejilla--3 valores">
                  <div>${icono('reloj')}<strong>65 preguntas en 90 minutos</strong><p>Unos 80 segundos por pregunta. 50 cuentan y 15 son de prueba, pero no sabes cuáles: todas valen igual para ti.</p></div>
                  <div>${icono('check')}<strong>Dos tipos de pregunta</strong><p><strong>Opción múltiple</strong>: una correcta de cuatro. <strong>Respuesta múltiple</strong>: dice «(Elige DOS.)» y solo cuenta si marcas todas las correctas.</p></div>
                  <div>${icono('estrella')}<strong>700 de 1000 para aprobar</strong><p>Es una escala, no un porcentaje exacto. Se aprueba con el total: no hace falta aprobar cada dominio.</p></div>
                </div>
                ${recuadro('recuerda', 'Una pregunta en blanco es un error seguro, y adivinar no resta. <strong>Contesta todas</strong>, aunque sea con tu mejor intuición, y márcala para revisarla si te sobra tiempo.')}`,
              notas: 'Datos de la guía oficial del CLF-C02: 50 preguntas con calificación y 15 sin ella, escala de 100 a 1000, aprobatorio de 700 y modelo compensatorio. El puntaje del simulacro es una estimación lineal: AWS no publica su conversión.'
            },
            {
              titulo: 'Leer, descartar y elegir',
              html: `
                <div class="carrera">
                  <div class="carrera__fila carrera__fila--nube"><span class="carrera__quien">1 · Lee el final</span><ol><li>La última línea dice qué te piden: ¿un servicio, un beneficio, quién es responsable?</li></ol><span class="carrera__tiempo">qué buscan</span></div>
                  <div class="carrera__fila"><span class="carrera__quien">2 · Palabra clave</span><ol><li>“lo más barato”, “sin administrar servidores”, “en tiempo real”, “auditar”, “de inmediato”, “sin compromiso”</li></ol><span class="carrera__tiempo">la pista</span></div>
                  <div class="carrera__fila"><span class="carrera__quien">3 · Descarta</span><ol><li>Casi siempre hay dos opciones que no tienen nada que ver. Táchalas primero.</li></ol><span class="carrera__tiempo">quedan dos</span></div>
                  <div class="carrera__fila carrera__fila--propio"><span class="carrera__quien">4 · Elige</span><ol><li>Entre las dos que quedan, la que cumple <strong>todo</strong> lo que pide el caso, no solo una parte.</li></ol><span class="carrera__tiempo">la mejor</span></div>
                </div>
                ${recuadro('cuidado', 'Las trampas más comunes: una opción <strong>verdadera</strong> que no responde a lo que preguntan, un servicio con <strong>nombre parecido</strong> (CloudTrail y CloudWatch, Inspector y GuardDuty) y las palabras <strong>“siempre”</strong> o <strong>“nunca”</strong>.')}`,
              notas: 'Haz en voz alta el paso 2 con una pregunta cualquiera de la sesión 7: que el grupo diga cuál es la palabra clave antes de ver las opciones.'
            }
          ]
        },
        {
          id: 's8-extras',
          tipo: 'leccion',
          titulo: 'Lo que el examen pregunta y la Ruta no vio',
          xp: 50,
          minutos: 7,
          laminas: [
            {
              titulo: 'Inteligencia artificial y análisis de datos',
              html: `
                <p class="entrada">El examen no te pide saber entrenar modelos: te pide <strong>reconocer qué servicio hace qué</strong>. Fíjate en el verbo.</p>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Si el caso dice…</th><th scope="col">Servicio</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Reconocer caras u objetos en fotos y video</th><td>Amazon Rekognition</td></tr>
                      <tr><th scope="row">Voz a texto · texto a voz</th><td>Amazon Transcribe · Amazon Polly</td></tr>
                      <tr><th scope="row">Sentimiento o temas de un texto · traducir</th><td>Amazon Comprehend · Amazon Translate</td></tr>
                      <tr><th scope="row">Sacar texto y tablas de documentos escaneados</th><td>Amazon Textract</td></tr>
                      <tr><th scope="row">Un chatbot de voz o texto</th><td>Amazon Lex</td></tr>
                      <tr><th scope="row">Generar textos, resúmenes o imágenes con modelos ya entrenados (IA generativa) en tu propia aplicación</th><td>Amazon Bedrock</td></tr>
                      <tr><th scope="row">Un asistente de IA generativa para programar u operar en AWS, o para responder preguntas con los datos de la empresa</th><td>Amazon Q</td></tr>
                      <tr><th scope="row">Construir y entrenar <em>tus propios</em> modelos</th><td>Amazon SageMaker AI</td></tr>
                    </tbody>
                  </table>
                </div>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Análisis de datos</th><th scope="col">Para qué</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Amazon Kinesis</th><td>Recibir y procesar datos <strong>en tiempo real</strong> (clics, sensores, registros).</td></tr>
                      <tr><th scope="row">AWS Glue</th><td>Preparar y transformar datos (ETL) y catalogarlos.</td></tr>
                      <tr><th scope="row">Amazon EMR</th><td>Procesar grandes volúmenes con Spark o Hadoop.</td></tr>
                      <tr><th scope="row">Amazon OpenSearch Service</th><td>Búsqueda de texto y análisis de registros.</td></tr>
                      <tr><th scope="row">Amazon Quick</th><td>Tableros e inteligencia de negocios (antes se llamaba QuickSight; hoy sus tableros son «Quick Sight»).</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('recuerda', 'Athena (SQL sobre archivos en S3) y Redshift (almacén de datos) ya los viste en la sesión 5.')}`,
              notas: 'Truco: Polly “habla” (como un perico), Transcribe “escribe”, Comprehend “entiende”, Rekognition “ve”. En la guía de 2026 QuickSight aparece como Amazon Quick.'
            },
            {
              titulo: 'Desplegar y operar',
              html: `
                <p class="entrada">En la Ruta usaste la <strong>consola</strong>. En el trabajo, lo que se repite se automatiza.</p>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Servicio o forma</th><th scope="col">Cuándo</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">AWS CLI y SDK</th><td>Acceso <strong>programático</strong>: scripts y aplicaciones que llaman a las API de AWS.</td></tr>
                      <tr><th scope="row">AWS CloudFormation</th><td><strong>Infraestructura como código</strong>: una plantilla crea la misma red y servidores cuantas veces quieras.</td></tr>
                      <tr><th scope="row">AWS Elastic Beanstalk</th><td>Subes tu código y AWS monta servidores, balanceador y escalado (PaaS).</td></tr>
                      <tr><th scope="row">Amazon Lightsail</th><td>Servidores y sitios sencillos con precio mensual fijo.</td></tr>
                      <tr><th scope="row">AWS Amplify</th><td>Crear y publicar aplicaciones web y móviles (frontend).</td></tr>
                      <tr><th scope="row">CodeBuild · CodePipeline · X-Ray</th><td>Compilar y probar · automatizar despliegues · rastrear peticiones para hallar errores.</td></tr>
                      <tr><th scope="row">AWS Systems Manager</th><td>Administrar flotas de servidores: parches, comandos y Session Manager sin abrir el puerto 22.</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('examen', '<em>“Repetible”</em>, <em>“plantilla”</em>, <em>“versionar la infraestructura”</em> → <strong>CloudFormation</strong>. <em>“Solo subir el código”</em> → <strong>Elastic Beanstalk</strong>. Otros que pueden salir: <strong>WorkSpaces</strong> (escritorios virtuales), <strong>AppStream 2.0</strong> (apps por streaming; desde 2025 se llama Amazon WorkSpaces Applications), <strong>IoT Core</strong> (dispositivos), <strong>Amazon Connect</strong> (centro de llamadas) y <strong>SES</strong> (correos masivos).')}`,
              notas: 'Conecta con la sesión 6: el Auto Scaling que armaron a mano es lo que Beanstalk monta solo.'
            },
            {
              titulo: 'Migrar a la nube: las 7 R',
              html: `
                <p class="entrada">No todo se muda igual. Para cada aplicación se elige una estrategia:</p>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Estrategia</th><th scope="col">Qué significa</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Rehost (realojar)</th><td>Mover tal cual, “lift and shift”. Lo más rápido. Herramienta: <strong>Application Migration Service</strong>.</td></tr>
                      <tr><th scope="row">Replatform</th><td>Mover con pequeños ajustes para usar algo administrado (tu MySQL a RDS, tu app a Beanstalk).</td></tr>
                      <tr><th scope="row">Repurchase (recomprar)</th><td>Cambiar el software por otro producto, normalmente un SaaS.</td></tr>
                      <tr><th scope="row">Refactor</th><td>Reescribir la aplicación para aprovechar la nube (por ejemplo, sin servidores).</td></tr>
                      <tr><th scope="row">Relocate</th><td>Mover un entorno completo de VMware a la nube sin cambiarlo.</td></tr>
                      <tr><th scope="row">Retain · Retire</th><td>Dejarla donde está por ahora · apagarla porque ya no sirve.</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('sabias', 'Para planear la mudanza: <strong>Migration Hub</strong> (seguimiento), <strong>Application Discovery Service</strong> (inventario de servidores) y <strong>Migration Evaluator</strong> (caso de negocio). Migration Hub y Discovery Service ya no aceptan clientes nuevos desde noviembre de 2025 (AWS recomienda AWS Transform), pero siguen en la guía del examen. Para bases de datos: <strong>DMS</strong> y <strong>SCT</strong>. El <strong>CAF</strong> de la sesión 7 promete cuatro beneficios: menos riesgo, mejor desempeño ESG, más ingresos y más eficiencia operativa.')}`,
              notas: 'Las 7 R se confunden en pares: rehost (tal cual) contra replatform (con ajustes), y repurchase (comprar otro) contra refactor (reescribir).'
            },
            {
              titulo: 'Borde, híbrido y la seguridad que solo viste de lejos',
              html: `
                <div class="rejilla rejilla--3 roles">
                  <article class="rol">${icono('edificio')}<h3>AWS Outposts</h3><p>Racks de AWS <strong>dentro de tu propio centro de datos</strong>, con los mismos servicios y API. Para datos que no pueden salir del edificio.</p></article>
                  <article class="rol">${icono('mapa')}<h3>Local Zones</h3><p>Una extensión de una región <strong>en una gran ciudad</strong>, para latencia de milisegundos de un dígito.</p></article>
                  <article class="rol">${icono('red')}<h3>Wavelength</h3><p>Cómputo de AWS <strong>dentro de la red 5G</strong> de un operador de telefonía. <em>Ojo: la guía del CLF-C02 lo deja fuera del examen.</em></p></article>
                </div>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Servicio</th><th scope="col">La frase que lo delata</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Amazon Inspector</th><td>Vulnerabilidades de software en instancias, contenedores y Lambda.</td></tr>
                      <tr><th scope="row">Amazon Macie</th><td>Datos personales o financieros escondidos en S3.</td></tr>
                      <tr><th scope="row">AWS Config</th><td>Historial de configuración y reglas de cumplimiento.</td></tr>
                      <tr><th scope="row">Security Hub · Detective</th><td>Todos los hallazgos en un tablero · investigar la causa de raíz.</td></tr>
                      <tr><th scope="row">Shield Standard · Advanced</th><td>DDoS gratis para todos · protección avanzada con equipo de respuesta.</td></tr>
                      <tr><th scope="row">Firewall Manager</th><td>Las mismas reglas de firewall en todas las cuentas.</td></tr>
                      <tr><th scope="row">KMS · CloudHSM · ACM</th><td>Llaves de cifrado · HSM dedicado solo para ti · certificados TLS gratis.</td></tr>
                    </tbody>
                  </table>
                </div>`,
              notas: 'Estos servicios aparecieron como distractores en los exámenes de práctica de las sesiones 1 a 7; en el simulacro varios son la respuesta correcta.'
            },
            {
              titulo: '¿Dónde pido ayuda?',
              html: `
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Necesito…</th><th scope="col">Recurso</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Preguntarle a la comunidad, gratis</th><td><strong>AWS re:Post</strong> (y el <strong>Knowledge Center</strong> con respuestas a dudas comunes)</td></tr>
                      <tr><th scope="row">Guías, whitepapers y buenas prácticas</th><td>Documentación de AWS, blogs y <strong>AWS Prescriptive Guidance</strong></td></tr>
                      <tr><th scope="row">Una empresa que me ayude a migrar o construir</th><td><strong>AWS Partner Network</strong> (integradores y vendedores de software)</td></tr>
                      <tr><th scope="row">Expertos de AWS para un proyecto grande</th><td><strong>AWS Professional Services</strong> y los <strong>solutions architects</strong></td></tr>
                      <tr><th scope="row">Reportar que un recurso de AWS me está atacando o mandando spam</th><td>El equipo de <strong>AWS Trust &amp; Safety</strong></td></tr>
                      <tr><th scope="row">Saber si una falla de AWS afecta mis recursos</th><td><strong>AWS Health Dashboard</strong> (y la AWS Health API)</td></tr>
                    </tbody>
                  </table>
                </div>
                ${nubi('No te aprendas todo de memoria: quédate con la frase que delata a cada servicio. Eso es lo que pregunta el examen.', 'nubi-feliz')}`,
              notas: 'Los planes de soporte y Trusted Advisor ya se vieron en la sesión 7. AWS IQ ya no aparece en la guía vigente del examen.'
            },
            {
              titulo: 'Otros que pueden salir',
              html: `
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Servicio</th><th scope="col">La frase que lo delata</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Service Quotas</th><td>Ver y pedir que suban los límites de tu cuenta (por ejemplo, cuántas instancias puedes lanzar).</td></tr>
                      <tr><th scope="row">AWS Resource Access Manager (RAM)</th><td>Compartir recursos, como subredes o un Transit Gateway, con otras cuentas de tu organización.</td></tr>
                      <tr><th scope="row">AWS Elastic Disaster Recovery</th><td>Replicar tus servidores a AWS y levantarlos en minutos si tu centro de datos falla.</td></tr>
                      <tr><th scope="row">Amazon WorkSpaces Secure Browser</th><td>Un navegador seguro en la nube para entrar a sitios internos sin instalar nada.</td></tr>
                      <tr><th scope="row">Reporte de credenciales de IAM</th><td>Lista de todos los usuarios con su MFA, contraseña y llaves de acceso, para auditar.</td></tr>
                      <tr><th scope="row">AWS Support Center</th><td>Donde abres y sigues tus casos de soporte.</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('examen', 'Ser <strong>AWS Partner</strong> da capacitación y certificación, eventos y descuentos por volumen. <strong>AWS Marketplace</strong> vende software de terceros y además ayuda a controlar sus costos, su gobierno y sus licencias (<em>entitlements</em>).')}`,
              notas: 'Son temas de la guía oficial del CLF-C02 que ninguna sesión de la Ruta había tocado con las manos.'
            }
          ]
        },
        {
          id: 's8-ex-palabras',
          tipo: 'clasificar',
          titulo: 'La palabra clave delata al servicio',
          xp: 50,
          minutos: 3,
          contexto: '<p>Calentamiento antes del simulacro: en cada caso hay una palabra clave que te lleva directo al servicio.</p>',
          pregunta: 'Manda cada caso a su servicio.',
          grupos: [
            { id: 'rekognition', nombre: 'Amazon Rekognition', color: 'blue' },
            { id: 'comprehend', nombre: 'Amazon Comprehend', color: 'green' },
            { id: 'kinesis', nombre: 'Amazon Kinesis', color: 'yellow' },
            { id: 'cloudformation', nombre: 'AWS CloudFormation', color: 'purple' }
          ],
          fichas: [
            { texto: 'Detectar si en una foto de credencial aparece una cara', grupo: 'rekognition', retro: 'Imágenes y video: Rekognition.' },
            { texto: 'Saber si las reseñas de un restaurante son positivas o negativas', grupo: 'comprehend', retro: 'El sentimiento de un texto: Comprehend.' },
            { texto: 'Procesar en tiempo real las lecturas de mil sensores de una fábrica', grupo: 'kinesis', retro: '“En tiempo real” con muchos datos llegando: Kinesis.' },
            { texto: 'Crear la misma VPC con sus servidores en tres regiones desde una plantilla', grupo: 'cloudformation', retro: 'Plantilla repetible: infraestructura como código con CloudFormation.' },
            { texto: 'Revisar los videos de una tienda para contar cuántas personas entran', grupo: 'rekognition', retro: 'Analizar video: Rekognition.' },
            { texto: 'Encontrar los temas de los que más se quejan los clientes en sus correos', grupo: 'comprehend', retro: 'Temas y frases clave de un texto: Comprehend.' },
            { texto: 'Recibir al instante los clics de miles de jugadores para un ranking en vivo', grupo: 'kinesis', retro: 'Un flujo continuo de eventos: Kinesis.' },
            { texto: 'Guardar la infraestructura en el repositorio y versionarla como el código', grupo: 'cloudformation', retro: 'Versionar la infraestructura: CloudFormation.' }
          ],
          cierre: 'Rekognition ve, Comprehend entiende el texto, Kinesis recibe datos en tiempo real y CloudFormation crea infraestructura desde plantillas.',
          pista: '¿Son imágenes, texto, datos que llegan sin parar o infraestructura que se repite?'
        }
      ]
    },

    /* ================================================================ 2 */
    {
      numero: 2,
      titulo: 'Después del simulacro: repaso de errores',
      descripcion:
        'Cómo leer tu reporte por dominio y por sesión de la Ruta, y cómo convertirlo en un plan de estudio para el examen real. Si llegas aquí antes del simulacro, léelo: te dirá qué mirar cuando entregues.',
      actividades: [
        {
          id: 's8-errores',
          tipo: 'leccion',
          titulo: 'Tu reporte, en un plan de estudio',
          xp: 50,
          minutos: 5,
          laminas: [
            {
              titulo: 'Lee tu reporte en tres capas',
              html: `
                <p class="entrada">Cuando entregues el simulacro verás tu resultado y podrás descargar tu reporte en PDF. Léelo de lo general a lo particular.</p>
                <div class="rejilla rejilla--3 valores">
                  <div>${icono('estrella')}<strong>1 · Tu puntaje de 1000</strong><p>Es una estimación: AWS no publica su conversión. Apunta a <strong>750 o más</strong> para llegar con colchón al real.</p></div>
                  <div>${icono('mapa')}<strong>2 · Por dominio</strong><p>Te dice <em>qué tipo</em> de preguntas fallas. Recuerda el peso: Tecnología vale casi el triple que Facturación.</p></div>
                  <div>${icono('libro')}<strong>3 · Por sesión de la Ruta</strong><p>Te dice <em>qué sesión volver a abrir</em>. “Fuera de la Ruta” te manda a la lección de temas extra de esta sesión.</p></div>
                </div>
                ${recuadro('consejo', 'En cada pregunta fallada, el reporte trae la explicación: lee <strong>por qué tu opción estaba mal</strong>, no solo cuál era la buena. Ahí está lo que de verdad no sabías.')}`,
              notas: 'En el bloque de repaso, proyecta la pestaña “Práctica final” del panel: las preguntas salen ordenadas de la más fallada a la menos fallada, con el distractor más elegido. Cuida de no mostrar nombres.'
            },
            {
              titulo: 'Tres tipos de error, tres remedios',
              html: `
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Si fallaste porque…</th><th scope="col">Haz esto</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">No conocías el servicio</th><td>Vuelve a la lámina de esa sesión (o a la de temas extra) y escribe en una tarjeta su “frase que lo delata”.</td></tr>
                      <tr><th scope="row">Confundiste dos servicios</th><td>Haz una tabla de dos columnas: CloudTrail contra Config, Trusted Advisor contra Health, Budgets contra Cost Explorer, grupo de seguridad contra NACL, Multi-AZ contra réplica de lectura.</td></tr>
                      <tr><th scope="row">Leíste mal la pregunta</th><td>No es falta de estudio: practica el paso “lee el final y busca la palabra clave” en el examen de práctica de cualquier sesión.</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('recuerda', 'Un plan realista: <strong>20 a 30 minutos al día</strong>, empezando por el dominio que más puntos te puede dar (mucho peso y bajo porcentaje). Antes del examen real, repite el examen de práctica de las sesiones que salieron bajas.')}`,
              notas: 'Pide a cada alumno que escriba en su cuaderno sus dos dominios más bajos y las dos sesiones que va a repasar esta semana.'
            }
          ]
        },
        {
          id: 's8-ex-plan',
          tipo: 'opcion',
          titulo: '¿Por dónde empieza Sofía?',
          xp: 50,
          minutos: 2,
          contexto:
            '<p>Sofía sacó un puntaje estimado de <strong>650</strong>. Su reporte por dominio dice: Conceptos de la nube <strong>81&nbsp;%</strong> (pesa 24&nbsp;%), Seguridad y cumplimiento <strong>58&nbsp;%</strong> (pesa 30&nbsp;%), Tecnología y servicios <strong>66&nbsp;%</strong> (pesa 34&nbsp;%) y Facturación, precios y soporte <strong>50&nbsp;%</strong> (pesa 12&nbsp;%). Tiene una semana.</p>',
          pregunta: '¿Qué le conviene estudiar primero?',
          opciones: [
            { texto: 'Facturación, porque es su porcentaje más bajo.', retro: 'Es su peor porcentaje, pero pesa solo 12 %: aunque lo suba mucho, gana pocas preguntas.' },
            { texto: 'Seguridad y cumplimiento: pesa mucho y va bajo.', correcta: true, retro: '¡Correcto! Pesa 30 % y le falta mucho para llegar a 80 %: es donde más preguntas puede ganar en una semana.' },
            { texto: 'Conceptos de la nube, para asegurar lo que ya domina.', retro: 'Ya va en 81 %: ahí casi no hay puntos que ganar.' },
            { texto: 'Repetir el mismo simulacro hasta sacar 100.', retro: 'Repetir las mismas preguntas mide memoria, no comprensión: el examen real trae preguntas distintas.' }
          ],
          pista: 'Multiplica: ¿dónde se junta mucho peso con mucho por mejorar?'
        },
        {
          id: 's8-vf',
          tipo: 'clasificar',
          titulo: '¿Verdadero o falso?',
          xp: 100,
          minutos: 3,
          contexto: '<p>Lo que hay que tener claro del examen y de los temas extra.</p>',
          pregunta: 'Decide si cada afirmación es verdadera o falsa.',
          grupos: [
            { id: 'v', nombre: 'Verdadero', color: 'green' },
            { id: 'f', nombre: 'Falso', color: 'red' }
          ],
          fichas: [
            { texto: 'En el examen real, una pregunta sin contestar cuenta como error.', grupo: 'v', retro: 'Verdadero: y adivinar no resta, así que nunca dejes una en blanco.' },
            { texto: 'Para aprobar hay que sacar al menos 70 % en cada dominio.', grupo: 'f', retro: 'Falso: el modelo es compensatorio; se aprueba con el total.' },
            { texto: 'En una pregunta de “Elige DOS”, acertar una de las dos da medio punto.', grupo: 'f', retro: 'Falso: solo cuenta si marcas todas las correctas.' },
            { texto: 'Amazon Polly convierte texto en voz.', grupo: 'v', retro: 'Verdadero: Polly habla; Transcribe hace lo contrario.' },
            { texto: 'AWS Outposts pone hardware de AWS dentro de tu propio centro de datos.', grupo: 'v', retro: 'Verdadero: los mismos servicios y API, en tu edificio.' },
            { texto: 'Rehost significa reescribir la aplicación para que sea sin servidores.', grupo: 'f', retro: 'Falso: rehost es moverla tal cual; reescribirla es refactor.' },
            { texto: 'Amazon Inspector busca vulnerabilidades de software en instancias y contenedores.', grupo: 'v', retro: 'Verdadero: es su trabajo; GuardDuty, en cambio, detecta actividad maliciosa.' },
            { texto: 'Para reportar spam que sale de una IP de AWS, se le escribe al Technical Account Manager.', grupo: 'f', retro: 'Falso: los abusos se reportan al equipo de AWS Trust & Safety.' }
          ],
          cierre: 'Cuatro verdaderas y cuatro falsas. Si fallaste alguna del examen, relee “Cómo se contesta el examen”; si fue de un servicio, la lámina de temas extra.',
          pista: 'Hay cuatro verdaderas y cuatro falsas.'
        }
      ]
    }
  ],

  /* ---------------------------------------------------------- el plan */

  plan: [
    {
      desde: 0,
      hasta: 2,
      titulo: 'Arranque',
      pasos: [
        'Proyecta el QR de la plataforma y que abran “Ruta AWS Cloud Practitioner”, sesión 8.',
        'Hoy no hay sandbox ni laboratorio: solo hace falta el celular o la computadora con batería para 90 minutos.'
      ],
      vigila: 'Que todos entren con su perfil de siempre: el reporte del simulacro se guarda con él.'
    },
    {
      desde: 2,
      hasta: 16,
      titulo: 'Capítulo 1 · Antes del simulacro',
      capitulo: 1,
      pasos: [
        'Proyecta “Cómo se contesta el examen”: el formato real y los cuatro pasos para leer una pregunta.',
        'Pasa rápido por “Lo que el examen pregunta y la Ruta no vio”: no es para memorizar hoy, es el mapa para estudiar después.',
        'El ejercicio de palabra clave lo resuelven solos, en tres minutos.'
      ],
      vigila: 'No te detengas en la lección de temas extra: el simulacro necesita sus 90 minutos completos.'
    },
    {
      desde: 16,
      hasta: 106,
      titulo: 'Simulacro: 65 preguntas en 90 minutos',
      pasos: [
        'En el panel elige la sesión 8 y abre el simulacro en la pestaña “Práctica final”.',
        'Cada alumno ve un reloj de 90 minutos que avisa cuando quedan 10; no se corta solo.',
        'Pide silencio y celulares solo para el simulacro, como en el examen real.',
        'Quien termine antes puede descargar su reporte en PDF y empezar el capítulo 2.'
      ],
      vigila: 'No proyectes el panel mientras contestan: muestra nombres y calificaciones.'
    },
    {
      desde: 106,
      hasta: 118,
      titulo: 'Capítulo 2 · Repaso de errores',
      capitulo: 2,
      pasos: [
        'Proyecta “Tu reporte, en un plan de estudio”.',
        'Proyecta el repaso de las preguntas más falladas del panel y comenta las tres o cuatro peores: ¿qué distractor eligieron y por qué?',
        'El ejercicio de Sofía y el verdadero o falso los resuelven solos.'
      ],
      vigila: 'Que cada quien anote sus dos dominios más bajos y las sesiones que va a repasar.'
    },
    {
      desde: 118,
      hasta: 120,
      titulo: 'Cierre',
      pasos: ['Cierra el simulacro y descarga el CSV antes de apagar.', 'Anuncia la sesión 9: la primera práctica integradora en el simulador de AWS.'],
      vigila: 'Recuérdales descargar su reporte en PDF: es su guía de estudio.'
    }
  ]
};
