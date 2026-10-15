// ---------------------------------------------------------------------------
// RUTA AWS CLOUD PRACTITIONER · SESIÓN 5 · BASES DE DATOS
//
// Bases relacionales administradas (RDS y Aurora), alta disponibilidad y
// respaldos, NoSQL con DynamoDB, cachés, almacenes de datos y migración.
// Dominio "Tecnología y servicios" del CLF-C02.
//
// El sandbox niega RDS con una SCP (explicit deny), así que el laboratorio
// compara tres caminos: una base MariaDB instalada a mano en EC2 (se ve su
// resultado en el System log), el intento de crear Aurora (y su negación) y
// una tabla real de DynamoDB, que sí se puede crear, llenar y consultar.
// Todo verificado en el sandbox el 15 de octubre de 2026.
// ---------------------------------------------------------------------------

import { boton, capturasDe, codigo, icono, lista, nubi, recuadro } from './piezas.js';

const captura = capturasDe('s5');
const capturaS1 = capturasDe('s1');

const SCRIPT_BASE = `#!/bin/bash
dnf install -y mariadb105-server
systemctl enable --now mariadb
mysql -t -e "
CREATE DATABASE escuela;
CREATE TABLE escuela.alumnos (id INT PRIMARY KEY, nombre VARCHAR(30), calificacion INT);
INSERT INTO escuela.alumnos VALUES (1,'Ana',95), (2,'Luis',88), (3,'Mariana',92);
SELECT * FROM escuela.alumnos ORDER BY calificacion DESC;"`;

export const SESION_5 = {
  numero: 5,
  titulo: 'Bases de datos',
  subtitulo: 'Sesión 5 · Bases de datos',
  resumen:
    'Qué base de datos elegir en AWS: relacionales administradas (RDS y Aurora), cómo se mantienen disponibles y respaldadas, NoSQL con DynamoDB, cachés, almacenes de datos y cómo se migra una base. En el sandbox comparas una base instalada a mano en un servidor con una tabla de DynamoDB que no necesita servidor, y lees por qué te niegan crear Aurora.',
  duracion: '2 horas',
  minutosSandbox: 25,

  practica: {
    titulo: 'Examen de práctica · Sesión 5',
    corto: 'Examen de práctica',
    resumen: '20 preguntas de bases de datos al estilo del examen de certificación, unos 17 minutos, una sola entrega.',
    plegable: 'Ver cómo es el examen real'
  },

  capitulos: [
    /* ================================================================ 1 */
    {
      numero: 1,
      titulo: 'Antes de encender el sandbox',
      descripcion:
        'Qué es una base de datos relacional y quién la administra en AWS, cómo se mantiene viva aunque falle una zona, qué cambia con NoSQL y DynamoDB, y para qué sirven las otras bases “de propósito específico”. Este capítulo se hace con el sandbox apagado.',
      actividades: [
        {
          id: 's5-relacionales',
          tipo: 'leccion',
          titulo: 'Bases relacionales: RDS y Aurora',
          xp: 50,
          minutos: 7,
          laminas: [
            {
              titulo: 'Tablas, filas y SQL',
              html: `
                <p class="entrada">Una <strong>base de datos relacional</strong> guarda la información en <strong>tablas</strong>, como una hoja de cálculo muy estricta: cada fila es un registro y cada columna tiene un tipo fijo. Las tablas se relacionan entre sí y se consultan con <strong>SQL</strong>.</p>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">id</th><th scope="col">nombre</th><th scope="col">calificacion</th></tr></thead>
                    <tbody>
                      <tr><td>1</td><td>Ana</td><td>95</td></tr>
                      <tr><td>2</td><td>Luis</td><td>88</td></tr>
                      <tr><td>3</td><td>Mariana</td><td>92</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('recuerda', 'El <strong>esquema</strong> (qué columnas hay y de qué tipo) se define antes de guardar. Si una fila no cumple, la base la rechaza. Esta misma tabla la vas a crear en el laboratorio.')}`,
              notas: 'Pregunta qué sistemas de la escuela usan tablas así: control escolar, inscripciones, nómina. Casi todo lo transaccional es relacional.'
            },
            {
              titulo: 'Instalarla tú o que AWS la administre',
              html: `
                <p class="entrada">Puedes instalar MySQL en un servidor EC2 y hacer todo tú, o pedir una base <strong>administrada</strong> con <strong>Amazon RDS</strong> (Relational Database Service).</p>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Tarea</th><th scope="col">Base en EC2</th><th scope="col">Amazon RDS</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Hardware y centro de datos</th><td>AWS</td><td>AWS</td></tr>
                      <tr><th scope="row">Parches del sistema operativo</th><td><strong>Tú</strong></td><td>AWS</td></tr>
                      <tr><th scope="row">Instalar y parchar el motor</th><td><strong>Tú</strong></td><td>AWS</td></tr>
                      <tr><th scope="row">Respaldos automáticos</th><td><strong>Tú</strong></td><td>AWS</td></tr>
                      <tr><th scope="row">Copia en otra zona (Multi-AZ)</th><td><strong>Tú</strong></td><td>Un clic</td></tr>
                      <tr><th scope="row">Tablas, consultas, datos y permisos</th><td><strong>Tú</strong></td><td><strong>Tú</strong></td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('examen', '<em>“Reducir la carga de administrar la base: parches, respaldos”</em> → <strong>RDS</strong>. Es el modelo de responsabilidad compartida de la sesión 2: con RDS, AWS sube un piso más.')}`,
              notas: 'Lo que nunca deja de ser del cliente: sus datos, quién entra y cómo se diseñan las tablas.'
            },
            {
              titulo: 'Los motores de RDS y Aurora',
              html: `
                <div class="rejilla rejilla--3 roles">
                  <article class="rol">${icono('base-datos')}<h3>Motores de RDS</h3><p>MySQL, PostgreSQL, MariaDB, Oracle, Microsoft SQL Server e IBM Db2. Eliges el que ya usa tu aplicación.</p></article>
                  <article class="rol">${icono('cohete')}<h3>Amazon Aurora</h3><p>La base relacional hecha por AWS, compatible con <strong>MySQL y PostgreSQL</strong>, más rápida que ellos y con <strong>seis copias en tres zonas</strong>.</p></article>
                  <article class="rol">${icono('nube')}<h3>Aurora Serverless</h3><p>Crece y se encoge sola según el uso, e incluso se pausa si nadie la usa. La verás en el laboratorio.</p></article>
                </div>
                ${recuadro('examen', '<em>“Compatible con MySQL o PostgreSQL, con más rendimiento y alta disponibilidad”</em> → <strong>Aurora</strong>.')}`,
              notas: 'RDS no da acceso al sistema operativo del servidor: si un caso pide control total del sistema operativo, la respuesta es EC2.'
            }
          ]
        },
        {
          id: 's5-ex-administrada',
          tipo: 'opcion',
          titulo: '¿Quién parcha la base?',
          xp: 50,
          minutos: 2,
          contexto:
            '<p>Una farmacia tiene su base MySQL en un servidor de su oficina. Su único técnico pasa los fines de semana instalando parches y revisando que los respaldos funcionen. Quiere que eso deje de ser su problema, sin cambiar de motor.</p>',
          pregunta: '¿Qué le recomiendas?',
          opciones: [
            { texto: 'Instalar MySQL en una instancia EC2 grande.', retro: 'En EC2 el técnico seguiría parchando el sistema operativo, el motor y los respaldos.' },
            { texto: 'Pasar la base a Amazon RDS for MySQL.', correcta: true, retro: '¡Correcto! RDS administra el hardware, los parches del motor y los respaldos automáticos; la farmacia solo cuida sus datos.' },
            { texto: 'Guardar las tablas como archivos en S3 Glacier.', retro: 'Glacier es para archivo de largo plazo; no es una base de datos que responda consultas.' },
            { texto: 'Cambiar a DynamoDB sin modificar la aplicación.', retro: 'DynamoDB es NoSQL: la aplicación tendría que reescribirse para dejar de usar SQL.' }
          ],
          pista: 'Busca la opción que mantiene MySQL pero quita el trabajo de administrarlo.'
        },
        {
          id: 's5-disponibilidad',
          tipo: 'leccion',
          titulo: 'Que la base no se caiga ni se pierda',
          xp: 50,
          minutos: 5,
          laminas: [
            {
              titulo: 'Multi-AZ, réplicas y respaldos',
              html: `
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Función</th><th scope="col">Qué hace</th><th scope="col">Para qué</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Multi-AZ</th><td>Mantiene una copia <strong>en espera</strong> en otra zona, sincronizada al instante. Si la principal falla, RDS cambia sola (<em>failover</em>).</td><td><strong>Disponibilidad</strong></td></tr>
                      <tr><th scope="row">Réplicas de lectura</th><td>Copias que atienden consultas de <strong>solo lectura</strong>. Pueden estar en otra zona o en otra región.</td><td><strong>Rendimiento</strong> (repartir lecturas)</td></tr>
                      <tr><th scope="row">Respaldos automáticos</th><td>Guardan la base y sus cambios hasta <strong>35 días</strong>. Se restaura a cualquier segundo de ese periodo.</td><td><strong>Recuperar</strong> errores</td></tr>
                      <tr><th scope="row">Snapshots manuales</th><td>Una foto de la base que guardas el tiempo que quieras.</td><td>Respaldos de largo plazo</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('examen', '<em>“Seguir funcionando si falla una zona”</em> → <strong>Multi-AZ</strong>. <em>“Muchas más lecturas que escrituras, la base va lenta”</em> → <strong>réplicas de lectura</strong>. <em>“Regresar la base a como estaba ayer a las 10:14”</em> → <strong>respaldos automáticos</strong> (restauración a un punto en el tiempo).')}
                ${nubi('Ojo: una réplica también copia los errores. Si alguien borra una tabla, se borra en la réplica. Contra eso sirven los respaldos.', 'nubi-pensando')}`,
              notas: 'En la forma clásica de Multi-AZ la copia en espera no atiende consultas. Es la confusión más común del examen.'
            }
          ]
        },
        {
          id: 's5-ex-replica',
          tipo: 'opcion',
          titulo: 'La tienda que va lenta',
          xp: 50,
          minutos: 2,
          contexto:
            '<p>Una tienda en línea usa RDS for PostgreSQL. En temporada de ofertas, miles de personas <strong>consultan</strong> el catálogo, pero muy pocas compran. La base va lenta por tantas lecturas.</p>',
          pregunta: '¿Qué agregan para repartir la carga de lectura?',
          opciones: [
            { texto: 'Activar Multi-AZ.', retro: 'Multi-AZ da disponibilidad: la copia en espera no atiende consultas.' },
            { texto: 'Bajar los respaldos automáticos a un día.', retro: 'Los respaldos no cambian el rendimiento de las consultas.' },
            { texto: 'Mover la base a Glacier Deep Archive.', retro: 'Glacier tarda horas en devolver datos; sería mucho peor.' },
            { texto: 'Crear réplicas de lectura y mandarles las consultas del catálogo.', correcta: true, retro: '¡Correcto! Las réplicas de lectura atienden las consultas y la base principal queda libre para las compras.' }
          ],
          pista: 'La palabra clave es “lecturas”.'
        },
        {
          id: 's5-nosql',
          tipo: 'leccion',
          titulo: 'NoSQL: Amazon DynamoDB',
          xp: 50,
          minutos: 6,
          laminas: [
            {
              titulo: 'Una llave y lo que quieras guardar',
              html: `
                <p class="entrada"><strong>Amazon DynamoDB</strong> es una base <strong>NoSQL</strong> de clave-valor. No hay servidores que elegir: creas una tabla y guardas <strong>elementos</strong>. Cada elemento se encuentra por su <strong>llave de partición</strong>, y fuera de esa llave cada uno puede tener atributos distintos.</p>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">jugador (llave)</th><th scope="col">Atributos</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">ana</th><td>puntaje: 950</td></tr>
                      <tr><th scope="row">luis</th><td>puntaje: 720 · nivel: experto</td></tr>
                    </tbody>
                  </table>
                </div>
                <div class="rejilla rejilla--3 valores">
                  <div>${icono('reloj')}<strong>Milisegundos</strong><p>Responde en milisegundos de un dígito, tenga mil o mil millones de elementos.</p></div>
                  <div>${icono('nube')}<strong>Sin servidores</strong><p>AWS reparte los datos y los copia en tres zonas. Tú no administras nada.</p></div>
                  <div>${icono('dinero')}<strong>Pagas por uso</strong><p>Por lo que guardas y por cada lectura y escritura.</p></div>
                </div>`,
              notas: 'Analogía: un guardarropa. Te dan un número (la llave) y con él te devuelven tu chamarra al instante. Lo que dejes ahí puede ser distinto de lo de los demás.'
            },
            {
              titulo: 'Capacidad, tablas globales y DAX',
              html: `
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Función</th><th scope="col">Cuándo usarla</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Bajo demanda (<em>on-demand</em>)</th><td>Tráfico impredecible: pagas por cada petición. Es la que usarás en el laboratorio.</td></tr>
                      <tr><th scope="row">Provisionada</th><td>Tráfico estable: reservas cierta capacidad de lectura y escritura y sale más barato.</td></tr>
                      <tr><th scope="row">Tablas globales</th><td>Usuarios en varios continentes que leen y escriben en una copia cercana.</td></tr>
                      <tr><th scope="row">DAX</th><td>Una caché en memoria para DynamoDB: baja las lecturas de milisegundos a <strong>microsegundos</strong>.</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('examen', '<em>“Clave-valor, sin servidores, milisegundos a cualquier escala”</em> → <strong>DynamoDB</strong>. <em>“Microsegundos para DynamoDB”</em> → <strong>DAX</strong>. <em>“Varias regiones, lectura y escritura”</em> → <strong>Global Tables</strong>.')}`,
              notas: 'Relacional cuando hay relaciones y consultas complejas; DynamoDB cuando el acceso siempre es por llave y la escala es enorme.'
            }
          ]
        },
        {
          id: 's5-ex-cual-base',
          tipo: 'clasificar',
          titulo: '¿Qué base de datos?',
          xp: 50,
          minutos: 3,
          contexto: '<p>Una plataforma de videojuegos en línea necesita guardar muchas cosas distintas.</p>',
          pregunta: 'Elige el servicio para cada necesidad.',
          grupos: [
            { id: 'rds', nombre: 'RDS o Aurora', color: 'blue' },
            { id: 'dynamo', nombre: 'DynamoDB', color: 'green' },
            { id: 'cache', nombre: 'ElastiCache', color: 'yellow' },
            { id: 'redshift', nombre: 'Redshift', color: 'purple' }
          ],
          fichas: [
            { texto: 'Pagos y facturas, con tablas relacionadas y SQL', grupo: 'rds', retro: 'Transacciones con relaciones y SQL: una base relacional.' },
            { texto: 'El puntaje de millones de jugadores, leído por su id en milisegundos', grupo: 'dynamo', retro: 'Acceso por llave a gran escala: DynamoDB.' },
            { texto: 'La tabla de los 100 mejores, consultada mil veces por segundo', grupo: 'cache', retro: 'Datos muy pedidos guardados en memoria: ElastiCache.' },
            { texto: 'Analizar tres años de partidas para ver qué niveles abandonan', grupo: 'redshift', retro: 'Análisis sobre enormes volúmenes: el almacén de datos.' },
            { texto: 'El catálogo de productos de la tienda, que ya funciona con MySQL', grupo: 'rds', retro: 'Si ya usa MySQL, RDS o Aurora sin reescribir nada.' },
            { texto: 'Las sesiones de los jugadores conectados, que deben leerse en microsegundos', grupo: 'cache', retro: 'Sesiones en memoria: ElastiCache.' },
            { texto: 'Los inventarios de cada jugador, cada uno con objetos distintos', grupo: 'dynamo', retro: 'Sin esquema fijo y por llave: DynamoDB.' },
            { texto: 'Los informes trimestrales de ventas para la dirección', grupo: 'redshift', retro: 'Reportes de análisis: Redshift.' }
          ],
          cierre: 'RDS o Aurora: relaciones y SQL. DynamoDB: por llave, a cualquier escala. ElastiCache: lo más pedido, en memoria. Redshift: análisis de muchos datos.',
          pista: '¿Hay relaciones y SQL, acceso por llave, algo que se pide muchísimo o un análisis?'
        },
        {
          id: 's5-otras',
          tipo: 'leccion',
          titulo: 'Bases de propósito específico y migración',
          xp: 50,
          minutos: 5,
          laminas: [
            {
              titulo: 'Una base para cada trabajo',
              html: `
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Servicio</th><th scope="col">Tipo</th><th scope="col">Ejemplo</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Amazon ElastiCache</th><td>Caché en memoria (Valkey, Redis OSS, Memcached)</td><td>Guardar lo más consultado para que la base descanse</td></tr>
                      <tr><th scope="row">Amazon Redshift</th><td>Almacén de datos (<em>data warehouse</em>)</td><td>Analizar años de ventas</td></tr>
                      <tr><th scope="row">Amazon Athena</th><td>SQL sobre archivos en S3, sin servidores</td><td>Consultar bitácoras guardadas en S3</td></tr>
                      <tr><th scope="row">Amazon Neptune</th><td>Grafos</td><td>Redes sociales, recomendaciones, fraude</td></tr>
                      <tr><th scope="row">Amazon DocumentDB</th><td>Documentos JSON, compatible con MongoDB</td><td>Una app que ya usa MongoDB</td></tr>
                      <tr><th scope="row">Amazon Keyspaces</th><td>Compatible con Apache Cassandra</td><td>Migrar un clúster de Cassandra</td></tr>
                    </tbody>
                  </table>
                </div>`,
              notas: 'AWS insiste en “bases de propósito específico”: en lugar de una sola base para todo, la que mejor encaja con cada parte de la aplicación.'
            },
            {
              titulo: 'Mudar una base a AWS',
              html: `
                <div class="rejilla rejilla--3 roles">
                  <article class="rol">${icono('flecha')}<h3>AWS DMS</h3><p><strong>Database Migration Service</strong> copia los datos y los cambios que siguen llegando, <strong>mientras la base original sigue funcionando</strong>. El corte final dura minutos.</p></article>
                  <article class="rol">${icono('engrane')}<h3>Conversión de esquema</h3><p>Si cambias de motor (Oracle a PostgreSQL, por ejemplo), la herramienta de conversión de esquemas (SCT) traduce tablas y código.</p></article>
                  <article class="rol">${icono('base-datos')}<h3>Mismo motor</h3><p>Si no cambias de motor, la migración es directa: de MySQL a RDS for MySQL o a Aurora MySQL.</p></article>
                </div>
                ${recuadro('examen', '<em>“Migrar con el menor tiempo de inactividad”</em> → <strong>DMS</strong>. <em>“Cambiar de Oracle a Aurora PostgreSQL”</em> → <strong>DMS + conversión de esquema (SCT)</strong>.')}`,
              notas: 'Si los datos son demasiados para la red, se combinan con Snowball (sesión 4).'
            }
          ]
        },
        {
          id: 's5-ex-migrar',
          tipo: 'opcion',
          titulo: 'Mudanza sin cerrar la tienda',
          xp: 50,
          minutos: 2,
          contexto:
            '<p>Una aseguradora quiere pasar su base Oracle de su centro de datos a <strong>Aurora PostgreSQL</strong>. El sistema atiende clientes las 24 horas: <strong>no puede apagarse</strong> durante la migración.</p>',
          pregunta: '¿Qué usan?',
          opciones: [
            { texto: 'AWS DMS con conversión de esquema, mientras la base original sigue en uso.', correcta: true, retro: '¡Correcto! DMS copia datos y cambios en vivo y la conversión de esquema traduce de Oracle a PostgreSQL.' },
            { texto: 'Un respaldo de Oracle subido a S3 cada noche.', retro: 'Con eso habría que apagar el sistema para el corte y además no convierte el esquema.' },
            { texto: 'Una réplica de lectura de RDS.', retro: 'Las réplicas copian bases que ya están en RDS; no migran desde Oracle local.' },
            { texto: 'Amazon ElastiCache delante de Oracle.', retro: 'Una caché acelera lecturas, pero no mueve la base a AWS.' }
          ],
          pista: 'Dos pistas: cambia de motor y no puede apagarse.'
        }
      ]
    },

    /* ================================================================ 2 */
    {
      numero: 2,
      titulo: 'Laboratorio guiado en AWS',
      descripcion:
        'Enciendes el sandbox y comparas tres caminos: una base MariaDB instalada a mano en un servidor EC2, el intento de crear una base Aurora administrada (y la regla que lo impide) y una tabla de DynamoDB que llenas y consultas sin ningún servidor. Al final limpias todo.',
      actividades: [
        {
          id: 's5-lab-bases',
          tipo: 'laboratorio',
          titulo: 'Laboratorio: tres maneras de guardar datos',
          xp: 300,
          minutos: 45,
          objetivo:
            'Instalar una base MariaDB en una instancia EC2 y leer su resultado en el registro de arranque, intentar crear una base Aurora y entender la negación, crear y consultar una tabla de DynamoDB, y borrar todo.',
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
                <p>Todavía <strong>no</strong> enciendas el sandbox. Copia a un bloc de notas el script que vas a pegar en el paso 3:</p>
                ${codigo(SCRIPT_BASE)}
                <p>Qué hace: instala MariaDB (un motor compatible con MySQL), lo enciende, crea la base <em>escuela</em> con una tabla de alumnos, guarda tres filas y las muestra ordenadas por calificación.</p>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Recurso</th><th scope="col">Nombre</th><th scope="col">Detalle</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Instancia EC2</th><td><kbd>base-tu-nombre</kbd></td><td>t2.micro, con el script de arriba</td></tr>
                      <tr><th scope="row">Tabla de DynamoDB</th><td><kbd>puntajes-tu-nombre</kbd></td><td>Llave de partición: <kbd>jugador</kbd></td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('consejo', 'Las imágenes son capturas reales del sandbox. Tócalas para verlas en grande.')}`,
              ver: 'Tienes el script copiado y la tabla de nombres a la mano. El sandbox sigue apagado.',
              sandbox: false
            },
            {
              titulo: 'Enciende el sandbox y empieza un servidor',
              html: `
                <ol class="pasos-consola">
                  <li>En DataCamp abre <strong>Sandbox</strong> y, en la tarjeta de <strong>AWS</strong>, pulsa ${boton('Open Sandbox', 'abrir sandbox')}.</li>
                </ol>
                ${capturaS1('01-sandbox-datacamp', 'Página Sandbox de DataCamp con la tarjeta de AWS', [[93.7, 63.1, '<strong>Open Sandbox</strong> en la tarjeta de AWS']])}
                <ol class="pasos-consola" start="2" style="counter-reset: paso 1">
                  <li>Busca <kbd>EC2</kbd>, ábrelo y pulsa ${boton('Launch instance', 'lanzar instancia')}.</li>
                  <li>En <strong>Name</strong> escribe <kbd>base-tu-nombre</kbd>. Deja <strong>Amazon Linux 2023</strong>.</li>
                  <li>En <strong>Instance type</strong> elige <strong>t2.micro</strong>, como en la sesión 1.</li>
                </ol>
                ${capturaS1('06-tipo-elegido', 'Instance type con t2.micro elegida', [
                  [23.6, 77.9, 'Instance type: <strong>t2.micro</strong>'],
                  [70.3, 73.1, 'El Summary también dice t2.micro']
                ])}
                ${recuadro('cuidado', 'Si la tarjeta de AWS dice <em>Continue</em> o te sale <em>You already have an active Sandbox Session running</em>, pulsa <em>Exit Session</em>, espera unos segundos y vuelve a entrar.')}`,
              ver: 'El formulario “Launch an instance” con tu nombre, Amazon Linux 2023 y t2.micro.',
              problemas: [['Sale “Oops, something went wrong”', 'Pulsa Restart Session y espera unos segundos.']],
              sandbox: true
            },
            {
              titulo: 'Una base hecha a mano',
              html: `
                <ol class="pasos-consola">
                  <li>Deja <strong>Key pair</strong> vacío y <strong>Network settings</strong> como vienen.</li>
                  <li>Abre <strong>Advanced details</strong>, baja hasta <strong>User data</strong> y pega el script del paso 1. La casilla de base64 queda <strong>sin marcar</strong>.</li>
                </ol>
                ${captura('01-user-data', 'El script de MariaDB pegado en User data', [
                  [33.3, 40.6, 'El script en <strong>User data</strong>'],
                  [2.8, 94.9, 'La casilla base64: <strong>sin marcar</strong>']
                ])}
                <ol class="pasos-consola" start="3" style="counter-reset: paso 2">
                  <li>Pulsa ${boton('Launch instance', 'lanzar instancia')}. Como no elegiste par de llaves, sale una ventana: elige <strong>Proceed without key pair</strong> y vuelve a pulsar ${boton('Launch instance', 'lanzar instancia')}.</li>
                </ol>
                ${captura('02-sin-llave', 'La ventana para continuar sin par de llaves', [
                  [54.5, 67.3, '<strong>Proceed without key pair</strong>'],
                  [83.9, 89.9, '<strong>Launch instance</strong>']
                ])}
                ${recuadro('recuerda', 'Desde aquí <strong>tú eres el administrador de la base</strong>: si mañana sale un parche de MariaDB, o si el disco se llena, o si quieres respaldos, todo eso te toca. El servidor tardará unos minutos en instalarla; mientras, ve al paso 4.')}`,
              ver: 'El aviso verde “Success” con el ID de tu instancia.',
              problemas: [['Sale “You are not authorized to perform this operation”', 'Revisa que el tipo sea t2.micro: el sandbox no permite otros.']],
              sandbox: true
            },
            {
              titulo: 'Intenta crear una base administrada',
              html: `
                <ol class="pasos-consola">
                  <li>Busca <kbd>RDS</kbd> y abre <strong>Aurora and RDS</strong>.</li>
                  <li>Mira las dos maneras de crear una base y, abajo, cuántas tienes: cero.</li>
                </ol>
                ${captura('03-rds-inicio', 'La página de inicio de Aurora and RDS', [
                  [5.9, 53.9, '<strong>Create</strong>: configuración exprés'],
                  [54.0, 58.1, 'Configuración completa: todos los motores'],
                  [19.5, 90.7, 'DB instances: 0']
                ])}
                <ol class="pasos-consola" start="3" style="counter-reset: paso 2">
                  <li>Pulsa el botón naranja ${boton('Create', 'crear')} de <strong>express configuration</strong> y abre <strong>Configuration details</strong>. Lee lo que AWS haría por ti.</li>
                </ol>
                ${captura('04-aurora-express', 'La configuración exprés de Aurora PostgreSQL Serverless', [
                  [24.1, 18.6, 'Aurora PostgreSQL <strong>Serverless</strong>'],
                  [43.4, 55.1, 'Mínimo 0 ACU: se pausa si nadie la usa'],
                  [44.6, 79.2, 'Cifrada con KMS desde el inicio'],
                  [88.2, 96.8, '<strong>Create database</strong>']
                ])}
                ${recuadro('sabias', 'Las <strong>ACU</strong> (Aurora Capacity Units) miden memoria y CPU. Con 0 ACU de mínimo, la base se pausa tras 5 minutos sin uso y no cobra cómputo mientras duerme.')}`,
              ver: 'La ventana “Create with express configuration in seconds” con Aurora PostgreSQL Serverless.',
              problemas: [['“Create with full configuration” se queda cargando o dice “Error loading resource”', 'Es una restricción del sandbox. Regresa y usa la configuración exprés.']],
              sandbox: true
            },
            {
              titulo: 'Lee la negación',
              html: `
                <ol class="pasos-consola">
                  <li>Pulsa ${boton('Create database', 'crear base')} y lee el aviso rojo que aparece arriba de los botones.</li>
                </ol>
                ${captura('05-rds-denegado', 'El aviso rojo: rds:CreateDBCluster con explicit deny', [
                  [87.2, 33.5, 'La acción negada: <em>rds:CreateDBCluster</em>'],
                  [79.8, 41.0, '<strong>explicit deny</strong> en una política de la organización (SCP)']
                ])}
                <p>Es la sesión 2 en vivo: la cuenta del sandbox pertenece a una <strong>organización</strong> de AWS, y una <strong>SCP</strong> (política de control de servicios) niega crear bases RDS. Una negación explícita gana a cualquier permiso: nadie en esa cuenta puede crearlas.</p>
                <p>Pulsa ${boton('Cancel', 'cancelar')} para cerrar la ventana.</p>
                ${recuadro('recuerda', 'DataCamp lo hace para que nadie deje encendida una base cara. En tu trabajo, las SCP se usan igual: para poner límites a cuentas enteras.')}`,
              ver: 'El aviso rojo que dice “not authorized to perform: rds:CreateDBCluster … with an explicit deny in a service control policy”. Tómale captura: es tu primera evidencia.',
              evidencia: {
                id: 'rds-negado',
                titulo: 'La base que no te dejaron crear',
                pide: 'El aviso rojo de Aurora con rds:CreateDBCluster y las palabras “explicit deny in a service control policy”.'
              },
              sandbox: true
            },
            {
              titulo: 'Crea una tabla de DynamoDB',
              html: `
                <ol class="pasos-consola">
                  <li>Busca <kbd>DynamoDB</kbd> y ábrelo. Pulsa ${boton('Create table', 'crear tabla')}.</li>
                </ol>
                ${captura('06-dynamodb-inicio', 'La página de inicio de Amazon DynamoDB', [
                  [42.3, 34.1, 'NoSQL para cualquier escala'],
                  [76.4, 40.5, '<strong>Create table</strong>'],
                  [84.0, 77.8, 'Cobra por leer, escribir y guardar']
                ])}
                <ol class="pasos-consola" start="2" style="counter-reset: paso 1">
                  <li>En <strong>Table name</strong> escribe <kbd>puntajes-tu-nombre</kbd>.</li>
                  <li>En <strong>Partition key</strong> escribe <kbd>jugador</kbd> y deja el tipo <strong>String</strong>.</li>
                  <li>Deja vacío <strong>Sort key</strong> y deja <strong>Default settings</strong>.</li>
                </ol>
                ${captura('07-tabla-nombre', 'El formulario Create table con el nombre y la llave de partición', [
                  [9.1, 29.2, 'El nombre de tu tabla'],
                  [5.0, 49.8, 'Partition key: <strong>jugador</strong>'],
                  [52.4, 49.8, 'Tipo: String (texto)'],
                  [5.8, 89.4, '<strong>Default settings</strong>']
                ])}
                ${recuadro('sabias', 'Fíjate en lo que <strong>no</strong> pide: ni motor, ni tamaño de servidor, ni columnas. Solo un nombre y una llave. Es una base <em>schemaless</em> (sin esquema fijo).')}`,
              ver: 'Table name con tu nombre, Partition key “jugador” de tipo String y Default settings marcado.',
              sandbox: true
            },
            {
              titulo: 'Revisa los ajustes y créala',
              html: `
                <ol class="pasos-consola">
                  <li>Baja y lee la tabla de ajustes por omisión. Luego pulsa ${boton('Create table', 'crear tabla')}.</li>
                </ol>
                ${captura('08-tabla-ajustes', 'Los ajustes por omisión de la tabla', [
                  [45.0, 9.1, 'Capacity mode: <strong>On-demand</strong>'],
                  [45.8, 35.9, 'Cifrada con una llave de AWS'],
                  [95.6, 95.7, '<strong>Create table</strong>']
                ])}
                <ol class="pasos-consola" start="2" style="counter-reset: paso 1">
                  <li>En unos segundos tu tabla pasa a <strong>Active</strong>. Pulsa la flecha circular si no cambia.</li>
                </ol>
                ${captura('09-tabla-activa', 'La tabla creada y activa', [
                  [13.8, 7.3, 'Tabla creada'],
                  [15.9, 92.7, 'Status: <strong>Active</strong>'],
                  [72.9, 92.7, 'Capacidad bajo demanda']
                ])}
                ${recuadro('recuerda', '<em>On-demand</em> significa que no reservas capacidad: pagas cada lectura y escritura. Ideal cuando no sabes cuánto se va a usar.')}`,
              ver: 'Tu tabla en la lista con Status Active y On-demand.',
              problemas: [['Abajo sale un aviso de que no tienes permiso para auto scaling', 'Es normal en el sandbox: con capacidad bajo demanda no hace falta.']],
              sandbox: true
            },
            {
              titulo: 'Guarda tu primer elemento',
              html: `
                <ol class="pasos-consola">
                  <li>En el menú izquierdo pulsa <strong>Explore items</strong> y marca tu tabla. Pulsa ${boton('Create item', 'crear elemento')}.</li>
                  <li>En el valor de <strong>jugador</strong> escribe <kbd>ana</kbd>.</li>
                  <li>Abre ${boton('Add new attribute', 'agregar atributo')} y elige <strong>Number</strong>. Nómbralo <kbd>puntaje</kbd> con valor <kbd>950</kbd>.</li>
                  <li>Pulsa ${boton('Create item', 'crear elemento')}.</li>
                </ol>
                ${captura('10-elemento-ana', 'El elemento de ana con su puntaje', [
                  [51.0, 60.4, 'jugador: <strong>ana</strong>'],
                  [89.9, 30.6, '<strong>Add new attribute</strong>'],
                  [12.7, 75.3, 'Atributo nuevo: puntaje'],
                  [79.9, 75.3, 'Tipo: Number'],
                  [94.0, 91.8, '<strong>Create item</strong>']
                ])}
                ${recuadro('tecnico', 'Lo que estás haciendo con botones es lo que una aplicación hace con una línea de código: un <em>PutItem</em>. Aquí el sandbox <strong>sí</strong> te deja escribir, a diferencia de S3 en la sesión 4.')}`,
              ver: 'El aviso verde de que el elemento se creó y, en la lista, ana con puntaje 950.',
              sandbox: true
            },
            {
              titulo: 'Un elemento distinto en la misma tabla',
              html: `
                <ol class="pasos-consola">
                  <li>Pulsa otra vez ${boton('Create item', 'crear elemento')}. Jugador: <kbd>luis</kbd>; agrega <kbd>puntaje</kbd> (Number) <kbd>720</kbd>.</li>
                  <li>Agrega un atributo más, de tipo <strong>String</strong>: <kbd>nivel</kbd> con valor <kbd>experto</kbd>. Pulsa ${boton('Create item', 'crear elemento')}.</li>
                </ol>
                ${captura('11-elemento-luis', 'El elemento de luis con puntaje y nivel', [
                  [89.9, 28.5, 'Agrega dos atributos'],
                  [51.2, 80.0, 'nivel: <strong>experto</strong>'],
                  [94.0, 94.2, '<strong>Create item</strong>']
                ])}
                ${captura('12-dos-elementos', 'La tabla con dos elementos de forma distinta', [
                  [8.1, 72.2, 'luis…'],
                  [24.0, 72.2, '…tiene nivel'],
                  [8.1, 88.3, 'ana no lo tiene, y no pasa nada']
                ])}
                <p>En una base relacional, la columna <em>nivel</em> existiría para todos (vacía en ana). En DynamoDB, cada elemento lleva solo los atributos que necesita.</p>`,
              ver: 'La lista “Items returned (2)”: luis con nivel experto y puntaje 720, y ana solo con puntaje 950. Tómale captura: es tu segunda evidencia.',
              evidencia: {
                id: 'dos-elementos',
                titulo: 'Tu tabla de DynamoDB',
                pide: 'La lista de elementos de tu tabla con ana y luis, donde se vea que solo luis tiene el atributo nivel.'
              },
              sandbox: true
            },
            {
              titulo: 'Busca por llave',
              html: `
                <ol class="pasos-consola">
                  <li>Arriba, en <strong>Scan or query items</strong>, cambia a <strong>Query</strong>.</li>
                  <li>En el valor de <strong>jugador</strong> escribe <kbd>ana</kbd> y pulsa ${boton('Run', 'ejecutar')}.</li>
                </ol>
                ${captura('13-consulta', 'Una consulta por llave que devuelve un solo elemento', [
                  [34.2, 11.0, '<strong>Query</strong>'],
                  [58.4, 38.2, 'El valor de la llave: ana'],
                  [5.3, 57.2, '<strong>Run</strong>'],
                  [27.6, 67.4, '1 devuelto, 1 revisado, eficiencia 100 %']
                ])}
                ${recuadro('examen', 'Un <strong>Scan</strong> lee toda la tabla; un <strong>Query</strong> va directo a la llave. En una tabla de millones de elementos, la diferencia es enorme en tiempo y en costo.')}`,
              ver: 'El aviso “Completed · Items returned: 1 · Items scanned: 1 · Efficiency: 100%”.',
              sandbox: true
            },
            {
              titulo: 'Regresa a tu base hecha a mano',
              html: `
                <ol class="pasos-consola">
                  <li>Vuelve a <strong>EC2 › Instances</strong> y marca <strong>base-tu-nombre</strong>. Debe decir <strong>Running</strong>.</li>
                  <li>Abre ${boton('Actions', 'acciones')} › <strong>Monitor and troubleshoot</strong> › <strong>Get system log</strong>, como en la sesión 1.</li>
                </ol>
                ${capturaS1('15-acciones-menu', 'Menú Actions abierto en Monitor and troubleshoot', [
                  [87.8, 4.7, '<strong>Actions</strong>'],
                  [74.4, 41.3, '<strong>Monitor and troubleshoot</strong>'],
                  [16.7, 76.4, '<strong>Get system log</strong>']
                ])}
                <ol class="pasos-consola" start="3" style="counter-reset: paso 2">
                  <li>Baja en el registro hasta encontrar una tablita dibujada con <kbd>+</kbd> y <kbd>|</kbd>.</li>
                </ol>
                ${captura('14-system-log', 'El System log con la tabla de alumnos que imprimió MariaDB', [
                  [60.0, 29.5, '<strong>System log</strong>'],
                  [30.4, 18.6, 'La instancia está sana'],
                  [24.9, 56.1, 'Las columnas de tu tabla'],
                  [25.7, 61.7, 'Ana, Mariana y Luis, por calificación']
                ])}
                <p>Funcionó: tu servidor instaló un motor de base de datos, creó la tabla y respondió una consulta SQL. Pero ahora <strong>esa base es tuya</strong>: nadie la respalda, nadie la parcha y vive en un solo servidor de una sola zona.</p>`,
              ver: 'En el System log, la tabla con id, nombre y calificacion: Ana 95, Mariana 92 y Luis 88. Tómale captura: es tu tercera evidencia.',
              evidencia: {
                id: 'system-log-base',
                titulo: 'La base hecha a mano',
                pide: 'El System log de tu instancia donde se vea la tabla de alumnos que imprimió MariaDB.'
              },
              problemas: [
                ['El registro está vacío o no aparece la tabla', 'La instalación tarda unos minutos. Espera y pulsa la flecha circular de refrescar.'],
                ['Aparece un error de mysql', 'Revisa que el script se haya pegado completo, con las comillas de la cuarta línea y de la última.']
              ],
              sandbox: true
            },
            {
              titulo: 'Un vistazo a ElastiCache',
              html: `
                <ol class="pasos-consola">
                  <li>Busca <kbd>ElastiCache</kbd> y ábrelo. Lee su portada; <strong>no</strong> crees nada.</li>
                </ol>
                ${captura('15-elasticache', 'La página de inicio de Amazon ElastiCache', [
                  [37.9, 23.9, 'Rendimiento en tiempo real'],
                  [24.1, 79.5, 'Serverless: sin servidores que elegir'],
                  [76.4, 33.6, 'Get started (no lo uses)']
                ])}
                ${recuadro('sabias', 'Una caché es como la libreta junto al teléfono con los números que más marcas: no vas a la agenda completa cada vez. ElastiCache guarda en memoria lo que tu aplicación pide una y otra vez.')}`,
              ver: 'La portada de Amazon ElastiCache con Valkey, Memcached y Redis OSS.',
              sandbox: true
            },
            {
              titulo: 'Limpia: borra la tabla',
              html: `
                <ol class="pasos-consola">
                  <li>En <strong>DynamoDB › Tables</strong> marca tu tabla y pulsa ${boton('Delete', 'borrar')}.</li>
                  <li>Deja marcada la casilla de borrar sus alarmas, escribe <kbd>confirm</kbd> y pulsa ${boton('Delete', 'borrar')}.</li>
                </ol>
                ${captura('16-borrar-tabla', 'La ventana Delete table', [
                  [3.3, 38.3, 'Borrar también sus alarmas'],
                  [29.4, 83.6, 'Escribe <em>confirm</em>'],
                  [92.1, 95.0, '<strong>Delete</strong>']
                ])}
                ${captura('17-tabla-borrada', 'La lista de tablas vacía', [
                  [5.9, 5.5, 'Tables (0)'],
                  [50.6, 85.2, 'Ya no tienes tablas']
                ])}`,
              ver: 'La lista de DynamoDB dice “You have no tables in this account in this AWS Region”.',
              problemas: [['Sale un aviso rojo sobre auto scaling al borrar', 'Pulsa la flecha de refrescar: la tabla se borra de todos modos.']],
              sandbox: true
            },
            {
              titulo: 'Limpia: elimina la instancia',
              html: `
                <ol class="pasos-consola">
                  <li>En <strong>EC2 › Instances</strong> marca <strong>base-tu-nombre</strong>.</li>
                  <li>Abre ${boton('Instance state', 'estado de la instancia')}, elige <strong>Terminate (delete) instance</strong> y confirma.</li>
                </ol>
                ${capturaS1('20-terminate-menu', 'Menú Instance state con Terminate (delete) instance', [[82.5, 89.0, '<strong>Terminate (delete) instance</strong>']])}
                ${capturaS1('21-terminate-modal', 'Ventana Terminate (delete) instance', [
                  [50.0, 21.3, 'El disco raíz también se borra'],
                  [86.9, 93.5, '<strong>Terminate (delete)</strong>']
                ])}
                ${recuadro('recuerda', 'Al terminar la instancia se borra su disco, y con él tu base. Con RDS, en cambio, al borrar una base te ofrece guardar un snapshot final.')}`,
              ver: 'Tu instancia base-tu-nombre en estado Shutting-down y luego Terminated.',
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
                ${nubi('¡Listo! Ya viste las dos caras: la base que administras tú y la que administra AWS.', 'nubi-feliz')}`,
              ver: 'La tarjeta de AWS en DataCamp dice “Open Sandbox”, y el contador de este curso está detenido.',
              sandbox: false
            }
          ],
          cierre:
            'Instalaste una base MariaDB en EC2 y la viste responder en el registro de arranque; comprobaste que una SCP niega crear Aurora; creaste una tabla de DynamoDB con elementos de forma distinta, la consultaste por llave y limpiaste todo.'
        },
        {
          id: 's5-ex-quien',
          tipo: 'clasificar',
          titulo: '¿Quién se encarga?',
          xp: 50,
          minutos: 3,
          contexto: '<p>Recuerda tu base hecha a mano en EC2 y compárala con una base en RDS.</p>',
          pregunta: 'Con <strong>Amazon RDS</strong>, ¿de quién es cada tarea?',
          grupos: [
            { id: 'aws', nombre: 'AWS', color: 'yellow' },
            { id: 'cliente', nombre: 'El cliente', color: 'blue' }
          ],
          fichas: [
            { texto: 'Instalar los parches del motor de base de datos', grupo: 'aws', retro: 'En RDS los parches del motor los aplica AWS, en la ventana de mantenimiento.' },
            { texto: 'Diseñar las tablas y escribir las consultas', grupo: 'cliente', retro: 'El diseño y el SQL siempre son del cliente.' },
            { texto: 'Reemplazar un disco dañado del servidor', grupo: 'aws', retro: 'El hardware es de AWS, con o sin RDS.' },
            { texto: 'Decidir quién de la empresa puede conectarse', grupo: 'cliente', retro: 'Los permisos y la red (grupos de seguridad) los configura el cliente.' },
            { texto: 'Sacar los respaldos automáticos', grupo: 'aws', retro: 'RDS los hace solo; el cliente elige cuántos días guardarlos.' },
            { texto: 'Cuidar que los datos guardados sean correctos', grupo: 'cliente', retro: 'Los datos son siempre responsabilidad del cliente.' }
          ],
          cierre: 'Con RDS, AWS se encarga del hardware, el sistema operativo, el motor y los respaldos; el cliente, del diseño, los datos y quién entra.',
          pista: 'Lo que tiene que ver con tu información y tus usuarios nunca deja de ser tuyo.'
        },
        {
          id: 's5-ex-esquema',
          tipo: 'opcion',
          titulo: 'Lo que viste en DynamoDB',
          xp: 50,
          minutos: 2,
          contexto:
            '<p>En el laboratorio, <em>luis</em> tiene el atributo <em>nivel</em> y <em>ana</em> no, y la tabla los aceptó a los dos.</p>',
          pregunta: '¿Qué característica de DynamoDB lo permite?',
          opciones: [
            { texto: 'Que la tabla es relacional y rellena con vacíos lo que falta.', retro: 'DynamoDB no es relacional: no crea columnas vacías.' },
            { texto: 'Que el modo bajo demanda acepta cualquier dato.', retro: 'El modo de capacidad tiene que ver con cómo se cobra, no con el esquema.' },
            { texto: 'Que solo la llave de partición es obligatoria y cada elemento lleva los atributos que necesite.', correcta: true, retro: '¡Correcto! DynamoDB no tiene esquema fijo: solo exige la llave.' },
            { texto: 'Que se cifró con una llave de AWS.', retro: 'El cifrado protege los datos; no cambia su forma.' }
          ],
          pista: '¿Qué te pidió el formulario al crear la tabla?'
        }
      ]
    },

    /* ================================================================ 3 */
    {
      numero: 3,
      titulo: 'Repaso para el examen',
      descripcion: 'Lo que la certificación pregunta de bases de datos, en una sola página, y un verdadero o falso para calentar antes del examen de práctica.',
      actividades: [
        {
          id: 's5-repaso',
          tipo: 'leccion',
          titulo: 'Lo que el examen te va a preguntar',
          xp: 50,
          minutos: 5,
          laminas: [
            {
              titulo: 'La sesión 5 en una hoja',
              html: `
                <div class="repaso">
                  <div class="repaso__capitulo"><span class="repaso__numero">1</span>${lista([
                    '<strong>RDS</strong>: base relacional administrada (MySQL, PostgreSQL, MariaDB, Oracle, SQL Server, Db2). AWS parcha y respalda.',
                    '<strong>Aurora</strong>: compatible con MySQL y PostgreSQL, más rápida, seis copias en tres zonas; existe en versión Serverless.',
                    '<strong>En EC2</strong>: control total, pero todo lo administras tú.'
                  ])}</div>
                  <div class="repaso__capitulo"><span class="repaso__numero">2</span>${lista([
                    '<strong>Multi-AZ</strong>: disponibilidad. <strong>Réplicas de lectura</strong>: repartir lecturas. <strong>Respaldos automáticos</strong>: volver a un punto en el tiempo (hasta 35 días).',
                    '<strong>DynamoDB</strong>: NoSQL clave-valor, sin servidores, milisegundos; bajo demanda o provisionada; tablas globales; <strong>DAX</strong> para microsegundos.'
                  ])}</div>
                  <div class="repaso__capitulo"><span class="repaso__numero">3</span>${lista([
                    '<strong>ElastiCache</strong>: caché en memoria. <strong>Redshift</strong>: almacén de datos. <strong>Athena</strong>: SQL sobre S3.',
                    '<strong>Neptune</strong>: grafos. <strong>DocumentDB</strong>: MongoDB. <strong>Keyspaces</strong>: Cassandra.',
                    '<strong>DMS</strong>: migrar sin apagar; con conversión de esquema si cambias de motor.'
                  ])}</div>
                </div>`,
              notas: 'Pide que alguien explique en voz alta la diferencia entre Multi-AZ y réplica de lectura antes de abrir el examen.'
            }
          ]
        },
        {
          id: 's5-vf',
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
            { texto: 'Aurora es compatible con MySQL y con PostgreSQL.', grupo: 'v', retro: 'Verdadero: son sus dos ediciones.' },
            { texto: 'La copia en espera de Multi-AZ sirve para repartir las lecturas.', grupo: 'f', retro: 'Falso: es para disponibilidad. Las lecturas se reparten con réplicas.' },
            { texto: 'DynamoDB exige definir todas las columnas al crear la tabla.', grupo: 'f', retro: 'Falso: solo pide la llave; lo demás es libre.' },
            { texto: 'Con RDS, AWS aplica los parches del motor de base de datos.', grupo: 'v', retro: 'Verdadero: es la ventaja de una base administrada.' },
            { texto: 'Redshift es la mejor opción para guardar las sesiones de usuarios en microsegundos.', grupo: 'f', retro: 'Falso: eso es una caché (ElastiCache). Redshift es para análisis.' },
            { texto: 'DMS puede migrar una base mientras la original sigue en uso.', grupo: 'v', retro: 'Verdadero: copia los cambios en vivo.' },
            { texto: 'Una réplica de lectura protege contra un borrado accidental.', grupo: 'f', retro: 'Falso: la réplica copia también el borrado. Para eso están los respaldos.' },
            { texto: 'Neptune es una base de datos de grafos.', grupo: 'v', retro: 'Verdadero: para relaciones entre muchos elementos.' }
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
        'Proyecta el QR de la plataforma y que abran “Ruta AWS Cloud Practitioner”, sesión 5.',
        'Pregunta rápida: ¿qué apps usan a diario que guarden información de millones de personas? ¿Será una sola base de datos para todo?'
      ],
      vigila: 'Que nadie encienda el sandbox todavía.'
    },
    {
      desde: 5,
      hasta: 38,
      titulo: 'Capítulo 1 · Antes de encender el sandbox',
      capitulo: 1,
      pasos: [
        'Proyecta las lecciones: relacionales y RDS, disponibilidad y respaldos, DynamoDB, y bases de propósito específico.',
        'La tabla de “quién hace qué” entre EC2 y RDS conecta con la responsabilidad compartida de la sesión 2.',
        'Los ejercicios los resuelven solos, dos o tres minutos cada uno.'
      ],
      vigila: 'La confusión clásica: Multi-AZ (disponibilidad) contra réplicas de lectura (rendimiento).'
    },
    {
      desde: 38,
      hasta: 92,
      titulo: 'Capítulo 2 · Laboratorio guiado',
      capitulo: 2,
      pasos: [
        'Proyecta el laboratorio y avanza paso a paso; que cada quien marque “Ya lo hice”.',
        'El paso 3 lanza el servidor con MariaDB: mientras se instala, siguen con RDS y DynamoDB.',
        'En el paso 5 lean juntos el “explicit deny”: es la SCP de la sesión 2 en vivo.',
        'En el paso 9 pide que alguien explique por qué la tabla aceptó elementos con atributos distintos.',
        'Antes de terminar, revisa que todos borraron la tabla y la instancia, y que su tarjeta de AWS diga “Open Sandbox”.'
      ],
      vigila: 'En “Avance en vivo” se ve en qué paso va cada quien. El paso 11 falla si el script se pegó incompleto: revisen las comillas.'
    },
    {
      desde: 92,
      hasta: 100,
      titulo: 'Capítulo 3 · Repaso',
      capitulo: 3,
      pasos: ['Proyecta la hoja de repaso.', 'El verdadero o falso es el termómetro antes del examen.'],
      vigila: 'Cuando casi todos terminen, abre el examen de práctica de la sesión 5.'
    },
    {
      desde: 100,
      hasta: 117,
      titulo: 'Examen de práctica',
      pasos: [
        'En el panel elige la sesión 5 y abre el examen en la pestaña “Práctica final”.',
        '20 preguntas de bases de datos al estilo de la certificación, una sola entrega.',
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
