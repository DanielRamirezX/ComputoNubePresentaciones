// ---------------------------------------------------------------------------
// RUTA AWS CLOUD PRACTITIONER · SESIÓN 4 · ALMACENAMIENTO
//
// Amazon S3 y sus clases, seguridad de los datos, discos EBS, archivos
// compartidos (EFS y FSx), respaldos y cómo mover muchos datos a AWS.
// Dominio "Tecnología y servicios" del CLF-C02.
//
// El sandbox deja crear buckets y configurarlos, pero niega s3:PutObject: no
// se pueden subir archivos ni crear carpetas. El laboratorio se enfoca en lo
// que sí se puede (bloqueo público, versionado, cifrado, ciclo de vida hacia
// Glacier, discos EBS y snapshots) y usa el error de PutObject como lección de
// permisos. Todo verificado en el sandbox el 4 de octubre de 2026.
// ---------------------------------------------------------------------------

import { boton, capturasDe, icono, lista, nubi, recuadro } from './piezas.js';

const captura = capturasDe('s4');
const capturaS1 = capturasDe('s1');

export const SESION_4 = {
  numero: 4,
  titulo: 'Almacenamiento',
  subtitulo: 'Sesión 4 · Almacenamiento',
  resumen:
    'Dónde guardar cada cosa en AWS: objetos en Amazon S3 y sus clases (de Standard a Glacier), discos EBS para tus servidores, archivos compartidos con EFS, respaldos y cómo mover terabytes a la nube. En el sandbox creas un bucket seguro con versionado, le pones una regla que manda los datos viejos a Glacier y respaldas un disco con un snapshot.',
  duracion: '2 horas',
  minutosSandbox: 25,

  practica: {
    titulo: 'Examen de práctica · Sesión 4',
    corto: 'Examen de práctica',
    resumen: '20 preguntas de almacenamiento al estilo del examen de certificación, unos 17 minutos, una sola entrega.',
    plegable: 'Ver cómo es el examen real'
  },

  capitulos: [
    /* ================================================================ 1 */
    {
      numero: 1,
      titulo: 'Antes de encender el sandbox',
      descripcion:
        'Cómo guarda S3 tus archivos y cuánto cobra según qué tan seguido los usas, cómo se protegen los datos, en qué se diferencian un disco, una carpeta compartida y un bucket, y cómo se mueven datos a AWS. Este capítulo se hace con el sandbox apagado.',
      actividades: [
        {
          id: 's4-s3',
          tipo: 'leccion',
          titulo: 'Amazon S3: el almacén infinito',
          xp: 50,
          minutos: 7,
          laminas: [
            {
              titulo: 'Buckets y objetos',
              html: `
                <p class="entrada"><strong>Amazon S3</strong> (Simple Storage Service) guarda archivos de cualquier tipo, llamados <strong>objetos</strong>, dentro de contenedores llamados <strong>buckets</strong>. No hay que reservar espacio: pagas lo que guardas.</p>
                <div class="rejilla rejilla--3 roles">
                  <article class="rol">${icono('disco')}<h3>Bucket</h3><p>El contenedor. Su nombre es <strong>único en todo el mundo</strong> y vive en una región.</p></article>
                  <article class="rol">${icono('imagen')}<h3>Objeto</h3><p>Un archivo y sus datos (metadatos). Cada uno puede pesar hasta <strong>5 TB</strong>.</p></article>
                  <article class="rol">${icono('llave')}<h3>Llave (key)</h3><p>El nombre completo del objeto, como <em>vacaciones/playa.jpg</em>. Las “carpetas” son solo parte del nombre.</p></article>
                </div>
                <div class="rejilla rejilla--3 valores">
                  <div>${icono('escudo')}<strong>11 nueves de durabilidad</strong><p>99.999999999&nbsp;%: guarda copias en varias zonas. Perder un archivo es casi imposible.</p></div>
                  <div>${icono('nube')}<strong>Sin límite</strong><p>Puedes guardar tantos objetos como quieras.</p></div>
                  <div>${icono('cohete')}<strong>Para todo</strong><p>Respaldos, fotos, videos, bitácoras, datos para análisis y hasta sitios web estáticos.</p></div>
                </div>`,
              notas: 'Durabilidad (no perder datos) no es lo mismo que disponibilidad (poder leerlos en este momento). S3 Standard: 11 nueves de durabilidad y 99.99 % de disponibilidad.'
            },
            {
              titulo: 'Las clases de almacenamiento',
              html: `
                <p class="entrada">Mientras <strong>menos seguido</strong> lees un archivo, <strong>más barato</strong> lo puedes guardar. A cambio, leerlo cuesta más o tarda más.</p>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Clase</th><th scope="col">Para datos que…</th><th scope="col">Recuperación</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">S3 Standard</th><td>Se usan seguido</td><td>Inmediata</td></tr>
                      <tr><th scope="row">S3 Intelligent-Tiering</th><td>No sabes qué tan seguido se usarán: AWS los mueve solo</td><td>Inmediata</td></tr>
                      <tr><th scope="row">S3 Standard-IA</th><td>Se leen poco (una vez al mes)</td><td>Inmediata, con cobro por lectura</td></tr>
                      <tr><th scope="row">S3 One Zone-IA</th><td>Se leen poco y se pueden volver a crear (una sola zona)</td><td>Inmediata</td></tr>
                      <tr><th scope="row">Glacier Instant Retrieval</th><td>Archivo que se lee una vez al trimestre</td><td>Milisegundos</td></tr>
                      <tr><th scope="row">Glacier Flexible Retrieval</th><td>Archivo que se lee una o dos veces al año</td><td>Minutos a horas</td></tr>
                      <tr><th scope="row">Glacier Deep Archive</th><td>Se guardan años por ley y casi nunca se leen</td><td>Hasta 12 horas (la más barata)</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('examen', '<em>“No se sabe con qué frecuencia se accederá”</em> → <strong>Intelligent-Tiering</strong>. <em>“Guardar 7 años por ley, casi nunca se consulta”</em> → <strong>Glacier Deep Archive</strong>. <em>“Se puede volver a generar”</em> → <strong>One Zone-IA</strong>.')}`,
              notas: 'En el laboratorio verán esta misma lista en la consola, con la duración mínima de cada clase.'
            },
            {
              titulo: 'Reglas de ciclo de vida',
              html: `
                <p class="entrada">Una <strong>regla de ciclo de vida</strong> mueve los objetos a clases más baratas según su edad, o los borra cuando ya no sirven. Se configura una vez y S3 la aplica todos los días.</p>
                <div class="carrera">
                  <div class="carrera__fila carrera__fila--nube"><span class="carrera__quien">Día 0</span><ol><li>Subes la foto a S3 Standard</li></ol><span class="carrera__tiempo">se ve mucho</span></div>
                  <div class="carrera__fila"><span class="carrera__quien">Día 30</span><ol><li>Pasa a Standard-IA</li></ol><span class="carrera__tiempo">se ve poco</span></div>
                  <div class="carrera__fila carrera__fila--propio"><span class="carrera__quien">Día 180</span><ol><li>Pasa a Glacier Deep Archive</li></ol><span class="carrera__tiempo">casi nunca</span></div>
                </div>
                ${nubi('Esta misma regla la vas a crear en el laboratorio.', 'nubi-feliz')}`,
              notas: 'Las transiciones se cobran por objeto: por eso la consola pide aceptar ese costo.'
            }
          ]
        },
        {
          id: 's4-ex-clases',
          tipo: 'clasificar',
          titulo: '¿Qué clase de S3?',
          xp: 50,
          minutos: 3,
          contexto: '<p>Una universidad guarda todo tipo de archivos en S3 y quiere pagar lo justo.</p>',
          pregunta: 'Elige la clase de almacenamiento para cada caso.',
          grupos: [
            { id: 'standard', nombre: 'S3 Standard', color: 'green' },
            { id: 'intelligent', nombre: 'Intelligent-Tiering', color: 'blue' },
            { id: 'ia', nombre: 'Standard-IA', color: 'yellow' },
            { id: 'deep', nombre: 'Glacier Deep Archive', color: 'purple' }
          ],
          fichas: [
            { texto: 'Las fotos del sitio web, que se ven todo el día', grupo: 'standard', retro: 'Acceso frecuente: Standard.' },
            { texto: 'Expedientes que la ley obliga a guardar 10 años y nadie consulta', grupo: 'deep', retro: 'Archivo a largo plazo y casi sin lecturas: la clase más barata.' },
            { texto: 'Archivos de un proyecto nuevo: no se sabe cuánto se usarán', grupo: 'intelligent', retro: 'Patrón de acceso desconocido: Intelligent-Tiering los mueve solo.' },
            { texto: 'Respaldos semanales que solo se leen si algo falla', grupo: 'ia', retro: 'Pocas lecturas pero, cuando se necesitan, deben estar al instante.' },
            { texto: 'Los videos de la clase de esta semana', grupo: 'standard', retro: 'Se ven mucho ahora: Standard.' },
            { texto: 'Grabaciones de cámaras de hace 3 años que se guardan por si acaso', grupo: 'deep', retro: 'Casi nunca se leen: Deep Archive.' },
            { texto: 'Datos de una app con picos impredecibles de uso', grupo: 'intelligent', retro: 'Cuando el uso cambia sin aviso, Intelligent-Tiering.' },
            { texto: 'Los exámenes del semestre pasado, que se revisan de vez en cuando', grupo: 'ia', retro: 'Acceso poco frecuente pero inmediato: Standard-IA.' }
          ],
          cierre: 'Standard: se usa seguido. Intelligent-Tiering: no se sabe. Standard-IA: poco, pero al instante. Glacier Deep Archive: años guardado y casi nunca leído.',
          pista: '¿Qué tan seguido se va a leer, y qué tan rápido hay que tenerlo cuando se lea?'
        },
        {
          id: 's4-seguridad',
          tipo: 'leccion',
          titulo: 'Proteger los datos de S3',
          xp: 50,
          minutos: 5,
          laminas: [
            {
              titulo: 'Cuatro defensas de un bucket',
              html: `
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Defensa</th><th scope="col">Qué hace</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Block Public Access</th><td>Impide que el bucket o sus objetos se vuelvan públicos por error. Viene <strong>encendido</strong> por omisión.</td></tr>
                      <tr><th scope="row">Políticas del bucket</th><td>Una política basada en recursos que dice quién puede leer o escribir (la viste en la sesión 2).</td></tr>
                      <tr><th scope="row">Versionado</th><td>Guarda cada versión de un objeto: si alguien lo borra o lo sobrescribe, se recupera.</td></tr>
                      <tr><th scope="row">Cifrado</th><td>Todo objeto nuevo se cifra solo (SSE-S3). También se puede usar una llave de KMS (SSE-KMS).</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('examen', '<em>“Recuperarse de un borrado accidental”</em> → <strong>versionado</strong>. <em>“Evitar que los datos queden expuestos en internet”</em> → <strong>Block Public Access</strong>.')}
                ${recuadro('sabias', 'Hay más: <strong>MFA Delete</strong> pide un segundo factor para borrar versiones, y <strong>Object Lock</strong> impide borrar objetos durante un tiempo (útil para cumplir leyes).')}`,
              notas: 'Muchas filtraciones famosas fueron buckets públicos por error. Por eso AWS enciende Block Public Access por omisión.'
            }
          ]
        },
        {
          id: 's4-discos',
          tipo: 'leccion',
          titulo: 'Discos, carpetas compartidas y objetos',
          xp: 50,
          minutos: 6,
          laminas: [
            {
              titulo: 'Bloque, archivo u objeto',
              html: `
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Tipo</th><th scope="col">Servicio</th><th scope="col">Cómo se usa</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Bloque</th><td><strong>Amazon EBS</strong></td><td>El disco duro de <strong>una</strong> instancia EC2, en <strong>una</strong> zona. Persiste aunque apagues la instancia.</td></tr>
                      <tr><th scope="row">Bloque temporal</th><td><strong>Instance store</strong></td><td>Disco pegado físicamente al servidor: muy rápido, pero <strong>se borra</strong> al detener la instancia.</td></tr>
                      <tr><th scope="row">Archivos (Linux)</th><td><strong>Amazon EFS</strong></td><td>Una carpeta compartida que <strong>muchas</strong> instancias usan a la vez, en varias zonas. Crece sola.</td></tr>
                      <tr><th scope="row">Archivos (Windows y otros)</th><td><strong>Amazon FSx</strong></td><td>Sistemas de archivos administrados: Windows File Server, Lustre (alto rendimiento) y otros.</td></tr>
                      <tr><th scope="row">Objetos</th><td><strong>Amazon S3</strong></td><td>Archivos por internet o por API, sin límite, desde cualquier lugar.</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('examen', '<em>“Varias instancias Linux deben leer y escribir los mismos archivos”</em> → <strong>EFS</strong>. <em>“Disco para la base de datos de una instancia”</em> → <strong>EBS</strong>. <em>“Datos temporales, el más rápido, no importa perderlos”</em> → <strong>instance store</strong>.')}`,
              notas: 'Un volumen EBS está en una zona y se conecta a instancias de esa misma zona. Por eso en el laboratorio el volumen se crea en us-east-1a.'
            },
            {
              titulo: 'Los tipos de disco EBS y sus snapshots',
              html: `
                <div class="rejilla rejilla--3 valores">
                  <div>${icono('cpu')}<strong>SSD de uso general (gp3, gp2)</strong><p>Para casi todo: sistemas operativos, servidores web. Lo que usaste en la sesión 1.</p></div>
                  <div>${icono('cohete')}<strong>SSD de IOPS provisionadas (io1, io2)</strong><p>Bases de datos exigentes que necesitan muchas operaciones por segundo.</p></div>
                  <div>${icono('disco')}<strong>HDD (st1, sc1)</strong><p>Discos baratos para leer mucho en secuencia (bitácoras, big data) o datos fríos.</p></div>
                </div>
                <p>Un <strong>snapshot</strong> es una foto de un volumen EBS en un momento. Se guarda en S3 y es <strong>incremental</strong>: después de la primera, solo guarda lo que cambió. Con un snapshot puedes crear un volumen nuevo, incluso en otra zona.</p>
                ${recuadro('consejo', '<strong>AWS Backup</strong> programa y centraliza los respaldos de EBS, RDS, EFS, DynamoDB y más, desde un solo lugar.')}`,
              notas: 'En el laboratorio el snapshot de un disco vacío pesa 0 B: es la prueba de que solo guarda bloques con datos.'
            }
          ]
        },
        {
          id: 's4-ex-disco',
          tipo: 'opcion',
          titulo: '¿Dónde guardarlo?',
          xp: 50,
          minutos: 2,
          contexto:
            '<p>Diez servidores Linux de una agencia de diseño, repartidos en dos zonas, deben <strong>abrir y guardar los mismos archivos al mismo tiempo</strong>, como si fuera una carpeta de red.</p>',
          pregunta: '¿Qué servicio usan?',
          opciones: [
            { texto: 'Un volumen EBS conectado a los diez servidores.', retro: 'Un volumen EBS normal se conecta a una sola instancia y vive en una sola zona.' },
            { texto: 'El instance store de cada servidor.', retro: 'El instance store es de cada servidor y se borra al detenerlo; no se comparte.' },
            { texto: 'Amazon EFS, una carpeta compartida para muchas instancias.', correcta: true, retro: '¡Correcto! EFS es un sistema de archivos compartido que montan muchas instancias Linux, en varias zonas.' },
            { texto: 'S3 Glacier Deep Archive.', retro: 'Glacier es para archivo de largo plazo; tarda horas en devolver los datos.' }
          ],
          pista: 'Busca la palabra clave: “los mismos archivos al mismo tiempo”.'
        },
        {
          id: 's4-mover',
          tipo: 'leccion',
          titulo: 'Mover datos a AWS',
          xp: 50,
          minutos: 5,
          laminas: [
            {
              titulo: 'Cuando los datos no caben por el cable',
              html: `
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Servicio</th><th scope="col">Para qué</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">AWS Snowball Edge</th><td>Un aparato físico que AWS te envía: lo llenas con decenas de terabytes y lo regresas. Para cuando subirlos por internet tardaría meses.</td></tr>
                      <tr><th scope="row">AWS DataSync</th><td>Copia y sincroniza datos por la red, de tu centro de datos a S3, EFS o FSx, de forma automática.</td></tr>
                      <tr><th scope="row">AWS Storage Gateway</th><td>Almacenamiento <strong>híbrido</strong>: tus servidores locales ven una unidad normal, pero los datos viven en S3.</td></tr>
                      <tr><th scope="row">AWS Transfer Family</th><td>Recibe archivos por SFTP o FTP y los guarda directo en S3.</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('examen', '<em>“Migrar 80 TB con una conexión lenta”</em> → <strong>Snowball</strong>. <em>“Seguir usando el almacenamiento local pero con respaldo en la nube”</em> → <strong>Storage Gateway</strong>.')}`,
              notas: 'La familia Snow es para mover datos “a pie” cuando la red no alcanza.'
            }
          ]
        },
        {
          id: 's4-ex-snowball',
          tipo: 'opcion',
          titulo: 'Una mudanza enorme',
          xp: 50,
          minutos: 2,
          contexto:
            '<p>Un hospital quiere pasar a S3 <strong>120 TB</strong> de estudios de rayos X. Su conexión a internet es lenta: subirlos tardaría casi un año.</p>',
          pregunta: '¿Qué le recomiendas?',
          opciones: [
            { texto: 'Pedir dispositivos AWS Snowball Edge, llenarlos y enviarlos de regreso a AWS.', correcta: true, retro: '¡Correcto! Snowball mueve grandes volúmenes de datos de forma física cuando la red no alcanza.' },
            { texto: 'Subir los archivos uno por uno desde la consola de S3.', retro: 'Funciona en teoría, pero con esa conexión tardaría meses.' },
            { texto: 'Crear un volumen EBS de 120 TB.', retro: 'EBS es un disco para instancias; no resuelve cómo llegan los datos a AWS.' },
            { texto: 'Configurar una regla de ciclo de vida hacia Glacier.', retro: 'El ciclo de vida mueve datos que ya están en S3; primero hay que llevarlos.' }
          ],
          pista: '¿Qué hacer cuando el cable no alcanza?'
        }
      ]
    },

    /* ================================================================ 2 */
    {
      numero: 2,
      titulo: 'Laboratorio guiado en AWS',
      descripcion:
        'Enciendes el sandbox, creas un bucket de S3 con las defensas correctas, descubres que el sandbox no deja subir archivos, programas una regla que manda los datos viejos a Glacier, creas un disco EBS, lo respaldas con un snapshot y limpias todo.',
      actividades: [
        {
          id: 's4-lab-almacenamiento',
          tipo: 'laboratorio',
          titulo: 'Laboratorio: un bucket seguro y un disco respaldado',
          xp: 300,
          minutos: 45,
          objetivo:
            'Crear un bucket de S3 con acceso público bloqueado, versionado y cifrado; programarle una regla de ciclo de vida hacia Glacier; crear un volumen EBS, respaldarlo con un snapshot y borrar todo.',
          necesitas: [
            'Tu sesión de DataCamp abierta (el sandbox todavía apagado).',
            'Esta guía abierta en otra pestaña o en tu celular.',
            'Unos 25 minutos de sandbox.',
            'Una forma de tomar capturas de pantalla.'
          ],
          pasos: [
            {
              titulo: 'Prepárate antes de encender',
              html: `
                <p>Todavía <strong>no</strong> enciendas el sandbox. Estos son los datos que vas a usar:</p>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Recurso</th><th scope="col">Nombre</th><th scope="col">Detalle</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Bucket de S3</th><td><kbd>fotos-tu-nombre-fecha</kbd></td><td>Por ejemplo, <em>fotos-mariana-20261004</em>. Solo minúsculas, números y guiones.</td></tr>
                      <tr><th scope="row">Regla de ciclo de vida</th><td><kbd>fotos-viejas-a-glacier</kbd></td><td>Día 30 a Standard-IA; día 180 a Glacier Deep Archive</td></tr>
                      <tr><th scope="row">Volumen EBS</th><td><kbd>disco-tu-nombre</kbd></td><td>gp3, 1 GiB, us-east-1a</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('cuidado', 'El nombre del bucket debe ser <strong>único en todo el mundo</strong>. Por eso lleva tu nombre y la fecha.')}
                ${recuadro('consejo', 'Las imágenes son capturas reales del sandbox. Tócalas para verlas en grande.')}`,
              ver: 'Tienes a la mano la tabla con los nombres, y el sandbox sigue apagado.',
              sandbox: false
            },
            {
              titulo: 'Enciende el sandbox y abre S3',
              html: `
                <ol class="pasos-consola">
                  <li>En DataCamp abre <strong>Sandbox</strong> y, en la tarjeta de <strong>AWS</strong>, pulsa ${boton('Open Sandbox', 'abrir sandbox')}.</li>
                </ol>
                ${capturaS1('01-sandbox-datacamp', 'Página Sandbox de DataCamp con la tarjeta de AWS', [[93.7, 63.1, '<strong>Open Sandbox</strong> en la tarjeta de AWS']])}
                <ol class="pasos-consola" start="2" style="counter-reset: paso 1">
                  <li>En la consola, busca <kbd>S3</kbd> y ábrelo.</li>
                  <li>Pulsa ${boton('Create bucket', 'crear bucket')}.</li>
                </ol>
                ${captura('01-s3-inicio', 'La página de inicio de Amazon S3', [
                  [40.1, 50.7, 'S3: guarda cualquier cantidad de datos'],
                  [72.6, 77.3, '<strong>Create bucket</strong>']
                ])}
                ${recuadro('cuidado', 'Si la tarjeta de AWS dice <em>Continue</em> o te sale <em>You already have an active Sandbox Session running</em>, es una sesión anterior que no se cerró: pulsa <em>Exit Session</em>, espera unos segundos y vuelve a entrar.')}`,
              ver: 'El formulario “Create bucket” con la región US East (N. Virginia).',
              problemas: [
                ['Sale “Oops, something went wrong”', 'Pulsa Restart Session y espera unos segundos.'],
                ['La tarjeta dice “Existing Connection” y no deja entrar', 'Espera medio minuto y recarga la página de DataCamp.']
              ],
              sandbox: true
            },
            {
              titulo: 'El nombre del bucket',
              html: `
                <ol class="pasos-consola">
                  <li>Deja <strong>Bucket type</strong> en <strong>General purpose</strong>.</li>
                  <li>En <strong>Bucket name</strong> escribe <kbd>fotos-tu-nombre-fecha</kbd>.</li>
                </ol>
                ${captura('02-bucket-nombre', 'La configuración general del bucket con el nombre escrito', [
                  [4.5, 41.3, '<strong>General purpose</strong>'],
                  [33.8, 81.7, 'Tu nombre de bucket'],
                  [22.3, 86.2, 'Debe ser único en todo el mundo']
                ])}
                ${recuadro('sabias', 'Aunque el bucket vive en una región, su nombre es global: si alguien en otro país ya usó <em>fotos</em>, tú no puedes. Por eso tiene que ser tan específico.')}`,
              ver: 'El nombre de tu bucket escrito en Bucket name, sin errores en rojo.',
              problemas: [['Sale “Bucket with the same name already exists”', 'Alguien ya lo usa en algún lugar del mundo. Agrega algo más, como tu matrícula.']],
              sandbox: true
            },
            {
              titulo: 'Bloquea el acceso público',
              html: `
                <ol class="pasos-consola">
                  <li>Baja hasta <strong>Block Public Access settings for this bucket</strong>.</li>
                  <li>Deja marcada la casilla <strong>Block <em>all</em> public access</strong>. Ya viene así.</li>
                </ol>
                ${captura('03-bloqueo-publico', 'Block Public Access con la casilla Block all public access marcada', [
                  [3.6, 29.0, '<strong>Block all public access</strong>: déjala marcada'],
                  [8.8, 79.4, 'Lo que sigue: el versionado']
                ])}
                ${recuadro('recuerda', 'Nadie de internet podrá leer tu bucket, aunque alguien se equivoque al darle permisos. Así es como viene por omisión, por seguridad.')}`,
              ver: 'Block all public access marcado, con las cuatro casillas de abajo en gris.',
              sandbox: true
            },
            {
              titulo: 'Versionado y cifrado',
              html: `
                <ol class="pasos-consola">
                  <li>En <strong>Bucket Versioning</strong> elige <strong>Enable</strong>.</li>
                  <li>Baja a <strong>Default encryption</strong>: deja <strong>SSE-S3</strong> (llaves que administra S3).</li>
                </ol>
                ${captura('04-versionado', 'Bucket Versioning en Enable y el cifrado por omisión', [
                  [3.7, 16.0, 'Versioning: <strong>Enable</strong>'],
                  [3.6, 94.5, 'Cifrado: SSE-S3']
                ])}
                <ol class="pasos-consola" start="3" style="counter-reset: paso 2">
                  <li>Baja hasta el final y pulsa ${boton('Create bucket', 'crear bucket')}.</li>
                </ol>
                ${captura('05-crear-bucket', 'Las opciones de cifrado y el botón Create bucket', [
                  [3.6, 26.2, 'SSE-S3, el cifrado por omisión'],
                  [92.6, 90.8, '<strong>Create bucket</strong>']
                ])}
                ${recuadro('examen', 'Con el versionado encendido, si alguien borra o sobrescribe un archivo, la versión anterior sigue guardada y se puede recuperar.')}`,
              ver: 'El aviso verde “Successfully created bucket” con el nombre de tu bucket.',
              sandbox: true
            },
            {
              titulo: 'Intenta guardar algo',
              html: `
                <ol class="pasos-consola">
                  <li>Ya dentro de tu bucket, en la pestaña <strong>Objects</strong>, pulsa ${boton('Create folder', 'crear carpeta')}.</li>
                </ol>
                ${captura('06-bucket-creado', 'Tu bucket recién creado, sin objetos', [
                  [16.4, 6.2, 'Bucket creado'],
                  [84.2, 43.2, '<strong>Create folder</strong>'],
                  [93.1, 43.2, 'Upload: subir archivos'],
                  [44.9, 28.7, 'Management: lo usarás después']
                ])}
                <ol class="pasos-consola" start="2" style="counter-reset: paso 1">
                  <li>Escribe <kbd>vacaciones</kbd> en <strong>Folder name</strong> y pulsa ${boton('Create folder', 'crear carpeta')}.</li>
                  <li>Lee el aviso rojo de abajo.</li>
                </ol>
                ${captura('07-putobject-denegado', 'El aviso Insufficient permission to create folder', [
                  [31.2, 13.7, 'La carpeta vacaciones'],
                  [13.4, 92.6, '<strong>Insufficient permission</strong>: falta <em>s3:PutObject</em>']
                ])}
                <p>En S3 las carpetas son objetos vacíos, así que crear una es <strong>subir un objeto</strong> (<em>s3:PutObject</em>). El sandbox no te da ese permiso: puedes crear y configurar buckets, pero no guardar archivos.</p>
                ${recuadro('recuerda', 'Es el mínimo privilegio de la sesión 2: crear el bucket (<em>CreateBucket</em>) y guardar en él (<em>PutObject</em>) son permisos distintos.')}`,
              ver: 'El aviso rojo “Insufficient permission to create folder” que menciona s3:PutObject. Tómale captura: es tu primera evidencia.',
              evidencia: {
                id: 'putobject-denegado',
                titulo: 'El permiso que faltó',
                pide: 'El aviso rojo “Insufficient permission to create folder”, donde se lea la acción s3:PutObject.'
              },
              sandbox: true
            },
            {
              titulo: 'Empieza una regla de ciclo de vida',
              html: `
                <ol class="pasos-consola">
                  <li>Regresa a tu bucket (pulsa su nombre arriba, en la ruta) y abre la pestaña <strong>Management</strong>.</li>
                  <li>Pulsa ${boton('Create lifecycle rule', 'crear regla de ciclo de vida')}.</li>
                </ol>
                ${captura('08-ciclo-vida', 'La pestaña Management con Lifecycle rules vacía', [
                  [44.9, 16.0, '<strong>Management</strong>'],
                  [89.8, 54.3, '<strong>Create lifecycle rule</strong>']
                ])}
                <ol class="pasos-consola" start="3" style="counter-reset: paso 2">
                  <li>Nombre: <kbd>fotos-viejas-a-glacier</kbd>. En <strong>rule scope</strong> elige <strong>Apply to all objects in the bucket</strong> y marca la casilla de aviso que aparece.</li>
                  <li>En <strong>Lifecycle rule actions</strong> marca <strong>Transition current versions of objects between storage classes</strong>.</li>
                  <li>En la primera transición deja <strong>Standard-IA</strong> y escribe <kbd>30</kbd> días.</li>
                  <li>Pulsa ${boton('Add transition', 'agregar transición')} y abre la lista de la segunda. Lee cada clase.</li>
                </ol>
                ${captura('09-clases-1', 'Las clases Standard-IA, Intelligent-Tiering, One Zone-IA y Glacier Instant Retrieval', [
                  [14.6, 26.5, 'Intelligent-Tiering: acceso desconocido'],
                  [11.3, 47.3, 'One Zone-IA: una sola zona'],
                  [18.5, 68.0, 'Glacier Instant Retrieval: 90 días mínimo']
                ])}
                ${captura('10-clases-2', 'Las clases Glacier Flexible Retrieval y Glacier Deep Archive', [
                  [30.4, 61.8, 'Glacier Flexible: minutos a horas'],
                  [16.3, 82.5, '<strong>Glacier Deep Archive</strong>'],
                  [23.9, 93.8, '180 días mínimo']
                ])}`,
              ver: 'La lista de clases de almacenamiento abierta, con la duración mínima de cada una.',
              sandbox: true
            },
            {
              titulo: 'Manda los datos viejos a Glacier',
              html: `
                <ol class="pasos-consola">
                  <li>Elige <strong>Glacier Deep Archive</strong> y escribe <kbd>180</kbd> días.</li>
                  <li>Baja a <strong>Review transition and expiration actions</strong>: verás la línea de tiempo.</li>
                </ol>
                ${captura('11-linea-tiempo', 'La línea de tiempo de la regla: día 0, 30 y 180', [
                  [11.4, 49.1, 'Día 30: a Standard-IA'],
                  [13.2, 71.5, 'Día 180: a Glacier Deep Archive'],
                  [93.3, 89.4, '<strong>Create rule</strong>']
                ])}
                <ol class="pasos-consola" start="3" style="counter-reset: paso 2">
                  <li>Pulsa ${boton('Create rule', 'crear regla')}. Si te regresa arriba con un aviso amarillo, marca <strong>I acknowledge that this lifecycle rule will incur a transition cost per request</strong> y vuelve a pulsar ${boton('Create rule', 'crear regla')}.</li>
                </ol>
                ${captura('12-costo-transicion', 'El aviso de que cada transición tiene costo', [
                  [3.6, 5.7, 'Transiciones entre clases, marcada'],
                  [6.5, 65.1, 'Acepta el costo por transición']
                ])}
                ${captura('13-regla-creada', 'La regla fotos-viejas-a-glacier creada y habilitada', [
                  [29.0, 6.2, 'Regla agregada'],
                  [22.7, 93.6, 'Status: <strong>Enabled</strong>'],
                  [35.8, 93.6, 'Para todo el bucket']
                ])}
                ${recuadro('sabias', 'Mover cada objeto entre clases cuesta un poco. Por eso S3 no mueve objetos de menos de 128 KB: saldría más caro que guardarlos donde están.')}`,
              ver: 'La regla fotos-viejas-a-glacier en la lista, con Status Enabled. Tómale captura: es tu segunda evidencia.',
              evidencia: {
                id: 'regla-glacier',
                titulo: 'Tu regla de ciclo de vida',
                pide: 'La lista Lifecycle rules con tu regla fotos-viejas-a-glacier en estado Enabled.'
              },
              problemas: [['Sale “You must select the checkbox to acknowledge…”', 'Sube un poco: marca la casilla del aviso amarillo de costos y vuelve a pulsar Create rule.']],
              sandbox: true
            },
            {
              titulo: 'Crea un disco EBS',
              html: `
                <ol class="pasos-consola">
                  <li>Busca <kbd>EC2</kbd> y ábrelo. En el panel, en <strong>Resources</strong>, pulsa <strong>Volumes</strong>.</li>
                  <li>Pulsa ${boton('Create volume', 'crear volumen')} y abre la lista <strong>Volume type</strong>.</li>
                </ol>
                ${captura('14-tipos-ebs', 'La lista de tipos de volumen EBS', [
                  [19.0, 49.9, 'gp3: SSD de uso general'],
                  [19.0, 71.4, 'io2: muchas IOPS para bases de datos'],
                  [14.0, 78.7, 'sc1: HDD frío, el más barato'],
                  [21.6, 85.7, 'st1: HDD para leer en secuencia']
                ])}
                <ol class="pasos-consola" start="3" style="counter-reset: paso 2">
                  <li>Deja <strong>gp3</strong>. En <strong>Size (GiB)</strong> borra el 100 y escribe <kbd>1</kbd>.</li>
                  <li>En <strong>Availability Zone</strong> deja <strong>us-east-1a</strong>.</li>
                </ol>
                ${captura('15-volumen-1gib', 'El formulario Create volume con gp3, 1 GiB y us-east-1a', [
                  [18.6, 31.1, 'Tipo: gp3'],
                  [12.6, 44.7, 'Tamaño: <strong>1</strong> GiB'],
                  [14.3, 96.1, 'Zona: us-east-1a']
                ])}
                ${recuadro('cuidado', 'El sandbox solo permite discos de hasta 20 GiB, y solo gp2 o gp3. Con 1 GiB basta para practicar.')}`,
              ver: 'Volume type gp3, Size 1 y Availability Zone us-east-1a.',
              sandbox: true
            },
            {
              titulo: 'Nómbralo y créalo',
              html: `
                <ol class="pasos-consola">
                  <li>Baja a <strong>Tags</strong> y pulsa ${boton('Add new tag', 'agregar etiqueta')}. Key: <kbd>Name</kbd>; Value: <kbd>disco-tu-nombre</kbd>.</li>
                  <li>Pulsa ${boton('Create volume', 'crear volumen')}.</li>
                </ol>
                ${captura('16-volumen-etiqueta', 'La etiqueta Name con disco-mariana y el botón Create volume', [
                  [6.7, 49.0, 'Key: Name'],
                  [43.9, 49.0, 'Value: disco-tu-nombre'],
                  [92.6, 96.7, '<strong>Create volume</strong>']
                ])}
                <ol class="pasos-consola" start="3" style="counter-reset: paso 2">
                  <li>En la lista, pulsa la flecha circular de refrescar y marca tu volumen.</li>
                </ol>
                ${captura('17-volumen-creado', 'Tu volumen en la lista, con sus detalles abajo', [
                  [3.7, 34.9, 'Márcalo'],
                  [39.0, 34.9, 'gp3, 1 GiB'],
                  [32.3, 89.2, 'Volume state: <strong>Available</strong>'],
                  [33.8, 99.3, 'Vive en us-east-1a']
                ])}
                ${recuadro('recuerda', '<em>Available</em> significa que existe, pero no está conectado a ninguna instancia. Solo se podría conectar a una instancia de us-east-1a.')}`,
              ver: 'Tu volumen disco-tu-nombre en la lista: gp3, 1 GiB y estado Available.',
              sandbox: true
            },
            {
              titulo: 'Respáldalo con un snapshot',
              html: `
                <ol class="pasos-consola">
                  <li>Con tu volumen marcado, abre ${boton('Actions', 'acciones')} y elige <strong>Create snapshot</strong>.</li>
                </ol>
                ${captura('18-snapshot-menu', 'El menú Actions del volumen con Create snapshot', [
                  [80.0, 19.0, '<strong>Actions</strong>'],
                  [69.5, 34.2, '<strong>Create snapshot</strong>']
                ])}
                <ol class="pasos-consola" start="2" style="counter-reset: paso 1">
                  <li>En <strong>Description</strong> escribe <kbd>Respaldo de disco-tu-nombre</kbd> y pulsa ${boton('Create snapshot', 'crear snapshot')}.</li>
                </ol>
                ${captura('19-snapshot-descripcion', 'El formulario Create snapshot', [
                  [40.5, 11.8, 'El respaldo se guarda en <strong>Amazon S3</strong>'],
                  [9.7, 71.6, 'Tu descripción'],
                  [6.2, 91.8, 'Sin cifrar: el volumen tampoco lo estaba']
                ])}
                ${captura('20-snapshot-creado', 'El aviso Successfully created snapshot', [[30.1, 11.5, 'Snapshot creado']])}
                <ol class="pasos-consola" start="3" style="counter-reset: paso 2">
                  <li>En el menú izquierdo, en <strong>Elastic Block Store</strong>, pulsa <strong>Snapshots</strong>. Espera a que diga <strong>Completed</strong>.</li>
                </ol>
                ${captura('21-snapshot-lista', 'La lista de snapshots con el tuyo completado', [
                  [52.2, 78.9, 'Volumen de 1 GiB…'],
                  [37.0, 78.9, '…pero el snapshot pesa <strong>0 B</strong>'],
                  [94.2, 78.9, '<strong>Completed</strong>']
                ])}
                ${recuadro('examen', 'Pesa 0 B porque el disco está vacío: los snapshots son <strong>incrementales</strong> y solo guardan los bloques con datos. El siguiente snapshot solo guardaría lo que cambió.')}`,
              ver: 'Tu snapshot en la lista, en estado Completed y con Full snapshot size 0 B. Tómale captura: es tu tercera evidencia.',
              evidencia: {
                id: 'snapshot',
                titulo: 'Tu snapshot',
                pide: 'La lista de Snapshots con el respaldo de tu disco en estado Completed.'
              },
              problemas: [['No encuentro Snapshots en el menú', 'El menú izquierdo es largo: baja hasta la sección Elastic Block Store.']],
              sandbox: true
            },
            {
              titulo: 'Cómo se restaura, y un vistazo a EFS',
              html: `
                <ol class="pasos-consola">
                  <li>Marca tu snapshot y abre ${boton('Actions', 'acciones')}. Fíjate en la primera opción, <strong>Create volume from snapshot</strong>: así se restaura un respaldo. No la uses; cierra el menú con <kbd>Esc</kbd>.</li>
                </ol>
                ${captura('22-snapshot-acciones', 'El menú Actions del snapshot', [
                  [71.8, 20.4, '<strong>Create volume from snapshot</strong>: restaurar'],
                  [68.3, 60.7, 'Delete snapshot: lo usarás al limpiar']
                ])}
                <ol class="pasos-consola" start="2" style="counter-reset: paso 1">
                  <li>Busca <kbd>EFS</kbd> y ábrelo. Lee qué es; no crees nada.</li>
                </ol>
                ${captura('23-efs', 'La página de inicio de Amazon EFS', [
                  [35.7, 55.6, 'Un sistema de archivos NFS…'],
                  [74.0, 64.8, '…que se crea en un clic']
                ])}
                ${recuadro('sabias', 'Desde un snapshot puedes crear un volumen en <strong>otra zona</strong>, o copiarlo a otra región. Así se mueve un disco de un lugar a otro.')}`,
              ver: 'El menú Actions del snapshot con Create volume from snapshot, y la página de Amazon EFS.',
              sandbox: true
            },
            {
              titulo: 'Limpia: snapshot y volumen',
              html: `
                <ol class="pasos-consola">
                  <li>Regresa a <strong>EC2 › Snapshots</strong>, marca tu snapshot, abre ${boton('Actions', 'acciones')} y elige <strong>Delete snapshot</strong>. Escribe <kbd>delete</kbd> y confirma.</li>
                  <li>Ve a <strong>Volumes</strong>, marca tu volumen, abre ${boton('Actions', 'acciones')} y elige <strong>Delete volume</strong>.</li>
                </ol>
                ${captura('24-borrar-volumen', 'La ventana para borrar el volumen', [
                  [49.8, 29.8, 'Los datos se borran para siempre'],
                  [8.7, 70.5, 'Escribe <em>delete</em>'],
                  [89.0, 90.2, '<strong>Delete</strong>']
                ])}
                ${captura('25-volumen-borrado', 'El aviso Successfully deleted volume', [[19.4, 11.5, 'Volumen borrado']])}
                ${recuadro('recuerda', 'En una cuenta real, un volumen o un snapshot olvidado se sigue cobrando cada mes, aunque nadie lo use.')}`,
              ver: 'Los avisos verdes de snapshot y volumen borrados, y “You currently have no volumes in this region”.',
              sandbox: true
            },
            {
              titulo: 'Limpia: borra el bucket',
              html: `
                <ol class="pasos-consola">
                  <li>Vuelve a <strong>S3</strong>. Marca tu bucket y pulsa ${boton('Delete', 'borrar')}.</li>
                  <li>Escribe el nombre exacto de tu bucket y pulsa ${boton('Delete bucket', 'borrar bucket')}.</li>
                </ol>
                ${captura('26-borrar-bucket', 'La página Delete bucket con el nombre escrito', [
                  [13.0, 24.3, 'No se puede deshacer'],
                  [9.5, 75.7, 'El nombre exacto de tu bucket'],
                  [93.7, 92.0, '<strong>Delete bucket</strong>']
                ])}
                ${captura('27-bucket-borrado', 'El aviso Successfully deleted bucket', [
                  [16.4, 6.5, 'Bucket borrado'],
                  [33.7, 77.3, 'Ya no hay buckets']
                ])}
                ${recuadro('sabias', 'Un bucket solo se borra si está vacío. El tuyo lo está, porque el sandbox no dejó guardar nada. Con objetos, primero se usa <em>Empty</em>.')}`,
              ver: 'El aviso verde “Successfully deleted bucket” y la lista de buckets vacía.',
              sandbox: true
            },
            {
              titulo: 'Apaga el sandbox y entrega tus evidencias',
              html: `
                <ol class="pasos-consola">
                  <li>En la barra de DataCamp pulsa <strong>Exit Session</strong> y confirma con ${boton('End Session', 'terminar sesión')}.</li>
                  <li>Revisa que la tarjeta de AWS vuelva a decir <strong>Open Sandbox</strong>. Si dice <em>Continue</em>, la sesión sigue abierta: entra y vuelve a salir.</li>
                </ol>
                ${capturaS1('24-salir', 'Aviso de DataCamp antes de terminar la sesión del sandbox', [
                  [93.1, 4.6, '<strong>Exit Session</strong>'],
                  [23.9, 92.7, '<strong>End Session</strong>']
                ])}
                <ol class="pasos-consola" start="3" style="counter-reset: paso 2">
                  <li>Al pulsar <strong>Terminar laboratorio</strong>, el contador de este curso se detiene.</li>
                  <li>Abajo están tus tres capturas. Descarga tu <strong>PDF de evidencias</strong> y súbelo a Blackboard.</li>
                </ol>
                ${nubi('¡Listo! Tus datos quedaron protegidos, con fecha de mudanza a Glacier y un respaldo de disco.', 'nubi-feliz')}`,
              ver: 'La tarjeta de AWS en DataCamp dice “Open Sandbox”, y el contador de este curso está detenido.',
              sandbox: false
            }
          ],
          cierre:
            'Creaste un bucket con acceso público bloqueado, versionado y cifrado; comprobaste que guardar exige s3:PutObject; programaste el paso a Standard-IA y a Glacier Deep Archive; respaldaste un disco EBS con un snapshot incremental y limpiaste todo.'
        },
        {
          id: 's4-ex-almacen',
          tipo: 'clasificar',
          titulo: '¿Bloque, archivo u objeto?',
          xp: 50,
          minutos: 3,
          contexto: '<p>Ya tocaste S3 y EBS en el laboratorio. Ahora junta cada necesidad con su servicio.</p>',
          pregunta: 'Elige el servicio de almacenamiento para cada caso.',
          grupos: [
            { id: 'ebs', nombre: 'Amazon EBS', color: 'blue' },
            { id: 'efs', nombre: 'Amazon EFS', color: 'green' },
            { id: 's3', nombre: 'Amazon S3', color: 'yellow' }
          ],
          fichas: [
            { texto: 'El disco donde vive el sistema operativo de una instancia', grupo: 'ebs', retro: 'El disco de arranque de EC2 es un volumen EBS.' },
            { texto: 'Una carpeta que comparten 20 servidores Linux', grupo: 'efs', retro: 'Carpeta compartida entre muchas instancias: EFS.' },
            { texto: 'Millones de fotos que una app muestra por internet', grupo: 's3', retro: 'Objetos accesibles por internet o API: S3.' },
            { texto: 'La base de datos de un solo servidor, con muchas IOPS', grupo: 'ebs', retro: 'Un volumen io2 conectado a la instancia.' },
            { texto: 'Respaldos que pasan a Glacier después de 6 meses', grupo: 's3', retro: 'Las clases y el ciclo de vida son de S3.' },
            { texto: 'Archivos de trabajo que crecen solos sin reservar espacio y se montan con NFS', grupo: 'efs', retro: 'EFS crece y se encoge solo, y se monta por NFS.' }
          ],
          cierre: 'EBS: el disco de una instancia. EFS: una carpeta compartida por muchas instancias. S3: objetos sin límite, accesibles desde cualquier lugar.',
          pista: '¿Lo usa un solo servidor, varios a la vez, o cualquiera por internet?'
        },
        {
          id: 's4-ex-versionado',
          tipo: 'opcion',
          titulo: 'El archivo borrado',
          xp: 50,
          minutos: 2,
          contexto:
            '<p>Un empleado borró por error el contrato más importante del bucket de la empresa. Por suerte, el bucket se creó como en tu laboratorio.</p>',
          pregunta: '¿Qué configuración permite recuperarlo?',
          opciones: [
            { texto: 'El cifrado SSE-S3.', retro: 'El cifrado protege los datos de miradas ajenas, pero no guarda copias de lo borrado.' },
            { texto: 'Block Public Access.', retro: 'Impide que el bucket sea público; no ayuda con un borrado.' },
            { texto: 'La regla de ciclo de vida hacia Glacier.', retro: 'El ciclo de vida mueve objetos por su edad; no deshace un borrado.' },
            { texto: 'El versionado, que guarda las versiones anteriores de cada objeto.', correcta: true, retro: '¡Correcto! Con el versionado, borrar solo agrega una marca de borrado: la versión anterior sigue ahí y se puede recuperar.' }
          ],
          pista: '¿Cuál de las opciones guarda copias anteriores?'
        }
      ]
    },

    /* ================================================================ 3 */
    {
      numero: 3,
      titulo: 'Repaso para el examen',
      descripcion: 'Lo que la certificación pregunta de almacenamiento, en una sola página, y un verdadero o falso para calentar antes del examen de práctica.',
      actividades: [
        {
          id: 's4-repaso',
          tipo: 'leccion',
          titulo: 'Lo que el examen te va a preguntar',
          xp: 50,
          minutos: 5,
          laminas: [
            {
              titulo: 'La sesión 4 en una hoja',
              html: `
                <div class="repaso">
                  <div class="repaso__capitulo"><span class="repaso__numero">1</span>${lista([
                    '<strong>S3</strong>: objetos en buckets con nombre único global; 11 nueves de durabilidad; hasta 5 TB por objeto.',
                    '<strong>Clases</strong>: Standard, Intelligent-Tiering (no se sabe), Standard-IA, One Zone-IA (se puede recrear), Glacier Instant, Flexible y Deep Archive (la más barata).',
                    '<strong>Ciclo de vida</strong>: mueve o borra objetos por edad.'
                  ])}</div>
                  <div class="repaso__capitulo"><span class="repaso__numero">2</span>${lista([
                    '<strong>Block Public Access</strong>: viene encendido. <strong>Versionado</strong>: recupera borrados. <strong>Cifrado</strong>: SSE-S3 o SSE-KMS.',
                    '<strong>EBS</strong>: disco de una instancia, en una zona. <strong>Instance store</strong>: rápido pero temporal.',
                    '<strong>EFS</strong>: carpeta compartida Linux. <strong>FSx</strong>: Windows y Lustre.'
                  ])}</div>
                  <div class="repaso__capitulo"><span class="repaso__numero">3</span>${lista([
                    '<strong>Snapshots</strong>: respaldos incrementales de EBS, guardados en S3. <strong>AWS Backup</strong>: respaldos centralizados.',
                    '<strong>Snowball</strong>: mover terabytes a pie. <strong>DataSync</strong>: copiar por la red. <strong>Storage Gateway</strong>: almacenamiento híbrido.',
                    '<strong>Transfer Family</strong>: SFTP directo a S3.'
                  ])}</div>
                </div>`,
              notas: 'Pide que alguien diga en voz alta la diferencia entre EBS y EFS antes de abrir el examen.'
            }
          ]
        },
        {
          id: 's4-vf',
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
            { texto: 'El nombre de un bucket de S3 debe ser único en todo el mundo.', grupo: 'v', retro: 'Verdadero: no pueden existir dos buckets con el mismo nombre.' },
            { texto: 'Un volumen EBS se puede conectar a una instancia de cualquier zona.', grupo: 'f', retro: 'Falso: solo a instancias de su misma zona.' },
            { texto: 'Glacier Deep Archive es la clase más barata de S3.', grupo: 'v', retro: 'Verdadero, a cambio de tardar horas en recuperar.' },
            { texto: 'Los datos del instance store sobreviven si detienes la instancia.', grupo: 'f', retro: 'Falso: el instance store es temporal.' },
            { texto: 'Los snapshots de EBS solo guardan los bloques que cambiaron.', grupo: 'v', retro: 'Verdadero: son incrementales.' },
            { texto: 'Block Public Access viene apagado al crear un bucket.', grupo: 'f', retro: 'Falso: viene encendido por omisión.' },
            { texto: 'EFS permite que muchas instancias usen los mismos archivos a la vez.', grupo: 'v', retro: 'Verdadero: es una carpeta compartida.' },
            { texto: 'Snowball se usa para recibir archivos por SFTP.', grupo: 'f', retro: 'Falso: eso es Transfer Family. Snowball es un aparato físico para mover datos.' }
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
      hasta: 5,
      titulo: 'Arranque',
      pasos: [
        'Proyecta el QR de la plataforma y que abran “Ruta AWS Cloud Practitioner”, sesión 4.',
        'Pregunta rápida: ¿dónde guardan sus fotos del celular, y cuántas veces al año vuelven a ver las viejas? Así funcionan las clases de S3.'
      ],
      vigila: 'Que nadie encienda el sandbox todavía.'
    },
    {
      desde: 5,
      hasta: 38,
      titulo: 'Capítulo 1 · Antes de encender el sandbox',
      capitulo: 1,
      pasos: [
        'Proyecta las lecciones: S3 y sus clases, seguridad de los datos, discos y carpetas compartidas, y cómo mover datos a AWS.',
        'La tabla de clases de S3 es la más preguntada: quédense con la columna “para datos que…”.',
        'Los ejercicios los resuelven solos, dos o tres minutos cada uno.'
      ],
      vigila: 'No se pierdan en los nombres de Glacier: basta con saber que Deep Archive es el más barato y el más lento.'
    },
    {
      desde: 38,
      hasta: 92,
      titulo: 'Capítulo 2 · Laboratorio guiado',
      capitulo: 2,
      pasos: [
        'Proyecta el laboratorio y avanza paso a paso; que cada quien marque “Ya lo hice”.',
        'En el paso 6 avisa que el aviso rojo es esperado: el sandbox no deja subir archivos.',
        'En el paso 11 pide que alguien explique por qué el snapshot pesa 0 B.',
        'Antes de terminar, revisa que todos borraron snapshot, volumen y bucket, y que su tarjeta de AWS diga “Open Sandbox”.'
      ],
      vigila: 'En “Avance en vivo” se ve en qué paso va cada quien. El paso 8 (el aviso de costos de la regla) es donde más se atoran.'
    },
    {
      desde: 92,
      hasta: 100,
      titulo: 'Capítulo 3 · Repaso',
      capitulo: 3,
      pasos: ['Proyecta la hoja de repaso.', 'El verdadero o falso es el termómetro antes del examen.'],
      vigila: 'Cuando casi todos terminen, abre el examen de práctica de la sesión 4.'
    },
    {
      desde: 100,
      hasta: 117,
      titulo: 'Examen de práctica',
      pasos: [
        'En el panel elige la sesión 4 y abre el examen en la pestaña “Práctica final”.',
        '20 preguntas de almacenamiento al estilo de la certificación, una sola entrega.',
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
