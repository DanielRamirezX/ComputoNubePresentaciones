// ---------------------------------------------------------------------------
// RUTA AWS CLOUD PRACTITIONER · SESIÓN 3 · REDES EN AWS
//
// VPC, subredes, tablas de rutas y gateways; cómo se conectan las redes entre
// sí y con la oficina; y la red en el borde (Route 53, CloudFront, Global
// Accelerator). Dominio "Tecnología y servicios" del CLF-C02.
//
// El sandbox deja crear VPC y subredes, pero una SCP niega crear un Internet
// Gateway. El laboratorio lo aprovecha: el alumno compara la VPC por omisión
// (con su ruta 0.0.0.0/0 hacia el igw) contra la suya (solo ruta local) y
// descubre que lo que hace pública a una subred es su tabla de rutas, no su
// nombre. Todo verificado en el sandbox el 4 de octubre de 2026.
// ---------------------------------------------------------------------------

import { boton, capturasDe, icono, lista, nubi, recuadro } from './piezas.js';

const captura = capturasDe('s3');
const capturaS1 = capturasDe('s1');
const capturaS2 = capturasDe('s2');

export const SESION_3 = {
  numero: 3,
  titulo: 'Redes en AWS',
  subtitulo: 'Sesión 3 · Redes en AWS',
  resumen:
    'Cómo se arma una red privada en la nube: VPC, subredes públicas y privadas, tablas de rutas y gateways; cómo se conecta con otras redes y con tu oficina; y cómo Route 53 y CloudFront acercan tu aplicación a los usuarios. En el sandbox construyes tu propia VPC y descubres qué hace pública a una subred.',
  duracion: '2 horas',
  minutosSandbox: 25,

  practica: {
    titulo: 'Examen de práctica · Sesión 3',
    corto: 'Examen de práctica',
    resumen: '20 preguntas de redes al estilo del examen de certificación, unos 17 minutos, una sola entrega.',
    plegable: 'Ver cómo es el examen real'
  },

  capitulos: [
    /* ================================================================ 1 */
    {
      numero: 1,
      titulo: 'Antes de encender el sandbox',
      descripcion:
        'Las piezas de una red en AWS, cómo se mide su tamaño, qué hace pública o privada a una subred, cómo se conectan las redes entre sí y cómo llega tu aplicación a usuarios de todo el mundo. Este capítulo se hace con el sandbox apagado.',
      actividades: [
        {
          id: 's3-vpc',
          tipo: 'leccion',
          titulo: 'Tu propia red en la nube',
          xp: 50,
          minutos: 7,
          laminas: [
            {
              titulo: 'Una VPC es tu fraccionamiento privado',
              html: `
                <p class="entrada">Una <strong>VPC</strong> (Virtual Private Cloud) es una red privada y aislada dentro de una región de AWS. Ahí viven tus servidores, bases de datos y balanceadores.</p>
                <div class="rejilla rejilla--3 roles">
                  <article class="rol">${icono('mapa')}<h3>VPC</h3><p>El fraccionamiento completo, con su rango de direcciones. Vive en <strong>una región</strong>.</p></article>
                  <article class="rol">${icono('casa')}<h3>Subred</h3><p>Una calle del fraccionamiento. Vive en <strong>una sola zona de disponibilidad</strong>.</p></article>
                  <article class="rol">${icono('libro')}<h3>Tabla de rutas</h3><p>Los letreros: dicen a dónde va el tráfico que sale de cada subred.</p></article>
                  <article class="rol">${icono('nube')}<h3>Internet Gateway</h3><p>La puerta principal: conecta la VPC con internet, de ida y de vuelta.</p></article>
                  <article class="rol">${icono('flecha')}<h3>NAT Gateway</h3><p>Una salida solo de ida: lo privado sale a internet, pero nadie de afuera puede entrar.</p></article>
                  <article class="rol">${icono('escudo')}<h3>Grupos de seguridad y NACL</h3><p>Los guardias de cada casa y de cada calle (los viste en la sesión 2).</p></article>
                </div>
                ${recuadro('recuerda', 'Cada cuenta trae una <strong>VPC por omisión</strong> en cada región, lista para usarse: en ella lanzaste tu servidor de la sesión 1.')}`,
              notas: 'La analogía del fraccionamiento se usa en todo el laboratorio: la VPC es el terreno, las subredes las calles y el Internet Gateway la puerta.'
            },
            {
              titulo: 'Cómo se mide una red: el CIDR',
              html: `
                <p class="entrada">El tamaño de una red se escribe en notación <strong>CIDR</strong>: una dirección y una diagonal. Mientras <strong>más chico</strong> el número después de la diagonal, <strong>más grande</strong> la red.</p>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">CIDR</th><th scope="col">Direcciones</th><th scope="col">Uso típico</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">10.0.0.0/16</th><td>65,536</td><td>Toda una VPC (el máximo permitido)</td></tr>
                      <tr><th scope="row">10.0.1.0/24</th><td>256</td><td>Una subred</td></tr>
                      <tr><th scope="row">10.0.1.0/28</th><td>16</td><td>La subred más chica permitida</td></tr>
                      <tr><th scope="row">0.0.0.0/0</th><td>Todas</td><td>“Cualquier lugar”: todo internet</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('tecnico', 'AWS se queda con 5 direcciones de cada subred para su propio uso. En una /24 te quedan 251 para tus recursos.')}
                ${recuadro('consejo', 'No hay que hacer cuentas en el examen. Basta con saber que /16 es grande, /24 es mediana y que 0.0.0.0/0 significa “todo internet”.')}`,
              notas: 'Si alguien pregunta: cada número menos en la diagonal duplica las direcciones. /24 = 256, /23 = 512, /16 = 65,536.'
            },
            {
              titulo: '¿Qué hace pública a una subred?',
              html: `
                <p class="entrada">No es su nombre ni su zona. Una subred es <strong>pública</strong> cuando su tabla de rutas manda <strong>0.0.0.0/0</strong> a un <strong>Internet Gateway</strong>. Si no, es <strong>privada</strong>.</p>
                <div class="carrera">
                  <div class="carrera__fila carrera__fila--nube"><span class="carrera__quien">Subred pública</span><ol><li>0.0.0.0/0 → Internet Gateway</li><li>Servidores web, balanceadores</li></ol><span class="carrera__tiempo">entra y sale</span></div>
                  <div class="carrera__fila"><span class="carrera__quien">Privada con NAT</span><ol><li>0.0.0.0/0 → NAT Gateway</li><li>Servidores de aplicación que descargan parches</li></ol><span class="carrera__tiempo">solo sale</span></div>
                  <div class="carrera__fila carrera__fila--propio"><span class="carrera__quien">Privada aislada</span><ol><li>Solo la ruta local</li><li>Bases de datos</li></ol><span class="carrera__tiempo">ni entra ni sale</span></div>
                </div>
                ${recuadro('examen', 'Patrón clásico: el <strong>servidor web</strong> en una subred <strong>pública</strong> y la <strong>base de datos</strong> en una subred <strong>privada</strong>. Para alta disponibilidad, se repite en <strong>dos zonas</strong>.')}`,
              notas: 'Toda tabla de rutas trae la ruta "local": el tráfico dentro de la VPC siempre fluye entre subredes.'
            }
          ]
        },
        {
          id: 's3-ex-subredes',
          tipo: 'clasificar',
          titulo: '¿Pública o privada?',
          xp: 50,
          minutos: 3,
          contexto: '<p>Estás diseñando la red de una tienda en línea con alta disponibilidad.</p>',
          pregunta: 'Decide en qué tipo de subred va cada cosa.',
          grupos: [
            { id: 'publica', nombre: 'Subred pública', color: 'green' },
            { id: 'privada', nombre: 'Subred privada', color: 'blue' }
          ],
          fichas: [
            { texto: 'El balanceador de carga que reciben los clientes', grupo: 'publica', retro: 'Los clientes llegan desde internet: va en una subred pública.' },
            { texto: 'La base de datos de pedidos', grupo: 'privada', retro: 'Nadie de internet debe llegar directo a la base de datos.' },
            { texto: 'El NAT Gateway', grupo: 'publica', retro: 'El NAT Gateway necesita salir por el Internet Gateway, así que vive en una subred pública.' },
            { texto: 'Los servidores que procesan los pagos', grupo: 'privada', retro: 'La lógica de negocio va protegida en una subred privada.' },
            { texto: 'Un servidor que necesita una IP pública para recibir visitas', grupo: 'publica', retro: 'Recibir tráfico de internet exige una ruta al Internet Gateway.' },
            { texto: 'El caché de sesiones de los usuarios', grupo: 'privada', retro: 'Solo lo usan los servidores internos: va en privada.' }
          ],
          cierre: 'Lo que recibe tráfico de internet va en subredes públicas; lo que guarda o procesa datos va en privadas. El NAT Gateway vive en la pública para que las privadas puedan salir.',
          pista: '¿Alguien de internet necesita llegar directo a esa pieza?'
        },
        {
          id: 's3-conectar',
          tipo: 'leccion',
          titulo: 'Conectar redes entre sí',
          xp: 50,
          minutos: 6,
          laminas: [
            {
              titulo: 'Del aula a la nube: cómo se conectan las redes',
              html: `
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Servicio</th><th scope="col">Qué conecta</th><th scope="col">Palabra clave del examen</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">VPC Peering</th><td>Dos VPC, de forma directa y privada</td><td>“conectar dos VPC”</td></tr>
                      <tr><th scope="row">Transit Gateway</th><td>Muchas VPC y redes en un solo punto central</td><td>“cientos de VPC”, “hub”</td></tr>
                      <tr><th scope="row">Site-to-Site VPN</th><td>Tu oficina con AWS, cifrado, por internet</td><td>“rápido de configurar”, “por internet”</td></tr>
                      <tr><th scope="row">AWS Direct Connect</th><td>Tu centro de datos con AWS por una línea <strong>dedicada</strong></td><td>“sin pasar por internet”, “ancho de banda constante”</td></tr>
                      <tr><th scope="row">Client VPN</th><td>Cada empleado desde su laptop</td><td>“trabajo remoto”</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('examen', 'VPN y Direct Connect se confunden mucho. <strong>VPN</strong>: viaja cifrada por internet y se arma en minutos. <strong>Direct Connect</strong>: una conexión física privada que tarda semanas en instalarse, pero es estable y no toca internet.')}`,
              notas: 'Una empresa puede usar VPN como respaldo de Direct Connect.'
            },
            {
              titulo: 'Llegar a servicios de AWS sin salir a internet',
              html: `
                <p class="entrada">Una instancia en una subred privada no tiene salida a internet. ¿Cómo lee S3? Con un <strong>VPC endpoint</strong>: una entrada privada a un servicio de AWS.</p>
                <div class="rejilla rejilla--3 valores">
                  <div>${icono('disco')}<strong>Gateway endpoint</strong><p>Para S3 y DynamoDB. Es una ruta más en la tabla de rutas, sin costo.</p></div>
                  <div>${icono('red')}<strong>Interface endpoint</strong><p>Para casi todos los demás servicios, con AWS PrivateLink.</p></div>
                  <div>${icono('escudo')}<strong>Más seguro</strong><p>El tráfico nunca sale de la red de AWS ni pasa por un NAT.</p></div>
                </div>
                ${nubi('En el laboratorio vas a ver el asistente de AWS proponiendo un endpoint de S3 para las subredes privadas.', 'nubi-feliz')}`,
              notas: 'Es un tema secundario para el CLF-C02; basta con la idea de “acceso privado a servicios”.'
            }
          ]
        },
        {
          id: 's3-ex-conexion',
          tipo: 'opcion',
          titulo: '¿Cómo los conectas?',
          xp: 50,
          minutos: 2,
          contexto:
            '<p>Un banco quiere conectar su centro de datos con AWS. Pide una conexión <strong>privada que no pase por internet</strong> y con un <strong>ancho de banda constante</strong>, aunque tarde semanas en instalarse.</p>',
          pregunta: '¿Qué servicio le recomiendas?',
          opciones: [
            { texto: 'Una Site-to-Site VPN.', retro: 'La VPN se cifra, pero viaja por internet y su velocidad depende de él.' },
            { texto: 'AWS Direct Connect.', correcta: true, retro: '¡Correcto! Direct Connect es una conexión física dedicada: no toca internet y su ancho de banda es estable.' },
            { texto: 'VPC Peering.', retro: 'El peering conecta dos VPC, no un centro de datos propio.' },
            { texto: 'Un Internet Gateway.', retro: 'El Internet Gateway conecta con internet, justo lo que el banco quiere evitar.' }
          ],
          pista: 'Busca las palabras clave: “no pase por internet” y “ancho de banda constante”.'
        },
        {
          id: 's3-borde',
          tipo: 'leccion',
          titulo: 'La red en el borde',
          xp: 50,
          minutos: 6,
          laminas: [
            {
              titulo: 'Route 53: la agenda de internet',
              html: `
                <p class="entrada"><strong>Amazon Route 53</strong> es el servicio <strong>DNS</strong> de AWS: traduce nombres como <em>tienda.com</em> a direcciones IP. También registra dominios y revisa si tus servidores están vivos (<em>health checks</em>).</p>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Política de enrutamiento</th><th scope="col">Manda a cada usuario…</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Simple</th><td>A un solo recurso</td></tr>
                      <tr><th scope="row">Ponderada (weighted)</th><td>A varios, en porcentajes (90&nbsp;% a la versión vieja, 10&nbsp;% a la nueva)</td></tr>
                      <tr><th scope="row">Por latencia</th><td>A la región que le responde más rápido</td></tr>
                      <tr><th scope="row">Conmutación por error (failover)</th><td>Al respaldo si el principal falla</td></tr>
                      <tr><th scope="row">Por geolocalización</th><td>Según el país desde donde se conecta</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('sabias', 'Se llama 53 porque el DNS usa el puerto 53. Y es de los pocos servicios de AWS con disponibilidad del 100&nbsp;% en su contrato de nivel de servicio.')}`,
              notas: 'Route 53 y CloudFront son servicios globales: en la consola la región dice "Global". Lo verán en el laboratorio.'
            },
            {
              titulo: 'CloudFront y Global Accelerator',
              html: `
                <div class="rejilla rejilla--3 valores">
                  <div>${icono('nube')}<strong>Amazon CloudFront</strong><p>Red de entrega de contenido (CDN): copia tus fotos, videos y páginas en <strong>ubicaciones de borde</strong> cerca de los usuarios.</p></div>
                  <div>${icono('cohete')}<strong>AWS Global Accelerator</strong><p>Lleva el tráfico por la red privada de AWS desde el borde hasta tu aplicación, con dos IP fijas. Sirve también para tráfico que no es web.</p></div>
                  <div>${icono('escudo')}<strong>Protección en el borde</strong><p>CloudFront trabaja junto con AWS Shield y AWS WAF para frenar ataques antes de que lleguen a tus servidores.</p></div>
                </div>
                ${recuadro('examen', '<em>“Usuarios de todo el mundo ven lento el contenido estático”</em> → <strong>CloudFront</strong>. <em>“Mejorar la disponibilidad y el rendimiento de una aplicación TCP o UDP global, con IP fijas”</em> → <strong>Global Accelerator</strong>.')}`,
              notas: 'Conecta con la sesión 1: las ubicaciones de borde son más numerosas que las regiones.'
            }
          ]
        },
        {
          id: 's3-ex-borde',
          tipo: 'opcion',
          titulo: '¿Qué servicio de borde?',
          xp: 50,
          minutos: 2,
          contexto:
            '<p>Una tienda tiene su sitio en dos regiones. Si la región principal se cae, los clientes deben llegar <strong>automáticamente</strong> a la región de respaldo usando el mismo nombre de dominio.</p>',
          pregunta: '¿Qué usa?',
          opciones: [
            { texto: 'Amazon CloudFront con más ubicaciones de borde.', retro: 'CloudFront acerca el contenido, pero no decide a qué región mandar a los clientes si una falla.' },
            { texto: 'Un VPC Peering entre las dos regiones.', retro: 'El peering conecta redes, pero no cambia a dónde apunta el dominio.' },
            { texto: 'AWS Direct Connect en cada región.', retro: 'Direct Connect conecta tu centro de datos; no tiene que ver con el dominio.' },
            { texto: 'Route 53 con enrutamiento de conmutación por error y health checks.', correcta: true, retro: '¡Correcto! Route 53 revisa la salud de la región principal y, si falla, responde con la del respaldo.' }
          ],
          pista: '¿Qué servicio traduce el nombre de dominio a una dirección?'
        },
        {
          id: 's3-ex-cidr',
          tipo: 'opcion',
          titulo: 'Lee el CIDR',
          xp: 50,
          minutos: 2,
          contexto: '<p>Tu compañero creó una VPC con el bloque <strong>10.0.0.0/16</strong> y quiere crear una subred dentro de ella.</p>',
          pregunta: '¿Cuál de estos bloques sirve para la subred?',
          opciones: [
            { texto: '10.0.1.0/24, que cabe dentro del rango de la VPC.', correcta: true, retro: '¡Correcto! 10.0.1.0/24 son 256 direcciones dentro de 10.0.0.0/16.' },
            { texto: '10.1.0.0/24, porque empieza con 10.', retro: '10.1.x.x queda fuera de 10.0.0.0/16: la subred debe caber dentro del rango de la VPC.' },
            { texto: '10.0.0.0/8, para tener más direcciones.', retro: 'Una subred no puede ser más grande que su VPC, y /8 es mucho más grande que /16.' },
            { texto: '0.0.0.0/0, para que sea pública.', retro: '0.0.0.0/0 significa “todo internet” y se usa en las rutas, no como rango de una subred.' }
          ],
          pista: 'Una subred es un pedazo de la VPC: tiene que caber dentro de 10.0.x.x.'
        }
      ]
    },

    /* ================================================================ 2 */
    {
      numero: 2,
      titulo: 'Laboratorio guiado en AWS',
      descripcion:
        'Enciendes el sandbox y exploras una red de verdad: la VPC por omisión y su ruta a internet, el plano completo de una red con subredes públicas y privadas, y luego construyes tu propia VPC con dos subredes. Descubres por qué tus subredes son privadas aunque una se llame “pública”, y dejas todo limpio.',
      actividades: [
        {
          id: 's3-lab-vpc',
          tipo: 'laboratorio',
          titulo: 'Laboratorio: construye tu propia VPC',
          xp: 300,
          minutos: 45,
          objetivo:
            'Leer la red por omisión de AWS, crear una VPC con una subred en cada zona, comprobar qué hace pública a una subred y borrar lo que creaste.',
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
                <p>Todavía <strong>no</strong> enciendas el sandbox. Este es el plan, con los datos que vas a usar:</p>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Recurso</th><th scope="col">Nombre</th><th scope="col">CIDR</th><th scope="col">Zona</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">VPC</th><td><kbd>red-tu-nombre</kbd></td><td><kbd>10.0.0.0/16</kbd></td><td>Toda la región</td></tr>
                      <tr><th scope="row">Subred 1</th><td><kbd>publica-1a</kbd></td><td><kbd>10.0.1.0/24</kbd></td><td>us-east-1a</td></tr>
                      <tr><th scope="row">Subred 2</th><td><kbd>privada-1b</kbd></td><td><kbd>10.0.2.0/24</kbd></td><td>us-east-1b</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('cuidado', 'Al final borrarás <strong>solo tu VPC</strong>. Nunca borres la que se llama <em>datacampvpc</em>: es la red por omisión del sandbox.')}
                ${recuadro('consejo', 'Las imágenes son capturas reales del sandbox. Tócalas para verlas en grande.')}`,
              ver: 'Tienes a la mano la tabla con los nombres y los CIDR, y el sandbox sigue apagado.',
              sandbox: false
            },
            {
              titulo: 'Enciende el sandbox y abre VPC',
              html: `
                <ol class="pasos-consola">
                  <li>En DataCamp abre <strong>Sandbox</strong> y, en la tarjeta de <strong>AWS</strong>, pulsa ${boton('Open Sandbox', 'abrir sandbox')}.</li>
                </ol>
                ${capturaS1('01-sandbox-datacamp', 'Página Sandbox de DataCamp con la tarjeta de AWS', [[93.7, 63.1, '<strong>Open Sandbox</strong> en la tarjeta de AWS']])}
                <ol class="pasos-consola" start="2" style="counter-reset: paso 1">
                  <li>En la consola, en la barra de búsqueda, escribe <kbd>VPC</kbd> y elige <strong>VPC</strong> (Isolated Cloud Resources).</li>
                  <li>Revisa que la región diga <strong>United States (N. Virginia)</strong>.</li>
                </ol>
                ${capturaS2('01-consola-inicio', 'La consola de AWS en Console Home', [
                  [21.9, 27.2, 'Barra de búsqueda: escribe VPC'],
                  [80.8, 27.2, 'Región: N. Virginia']
                ])}
                ${recuadro('cuidado', 'Deja la pestaña del sandbox al frente. Si la ocultas mucho tiempo, la sesión puede caerse: pulsa <em>Restart Session</em>.')}`,
              ver: 'El VPC dashboard con la lista “Resources by Region”.',
              problemas: [['Sale “Oops, something went wrong”', 'Pulsa Restart Session y espera unos segundos.']],
              sandbox: true
            },
            {
              titulo: 'Lo que ya trae tu cuenta',
              html: `
                <ol class="pasos-consola">
                  <li>En <strong>Resources by Region</strong> espera a que aparezcan los números (tardan unos segundos).</li>
                  <li>Fíjate: hay <strong>1 VPC</strong>, <strong>6 subredes</strong> y <strong>1 Internet Gateway</strong>. Es la red por omisión de la cuenta.</li>
                  <li>En el menú izquierdo pulsa <strong>Your VPCs</strong>.</li>
                </ol>
                ${captura('01-vpc-panel', 'El VPC dashboard con los recursos de la región', [
                  [4.2, 36.2, '<strong>Your VPCs</strong>'],
                  [43.6, 34.5, '1 VPC'],
                  [43.6, 49.4, '6 subredes'],
                  [43.6, 79.0, '1 Internet Gateway']
                ])}
                ${recuadro('sabias', 'Seis subredes porque N. Virginia tiene seis zonas de disponibilidad: la VPC por omisión trae una subred en cada una.')}`,
              ver: 'La lista Your VPCs con una sola VPC, datacampvpc.',
              sandbox: true
            },
            {
              titulo: 'Conoce la VPC por omisión',
              html: `
                <ol class="pasos-consola">
                  <li>Marca la casilla de <strong>datacampvpc</strong>. Abajo se abren sus detalles.</li>
                  <li>Lee tres datos: <strong>IPv4 CIDR</strong>, <strong>Default VPC</strong> y <strong>Main route table</strong>.</li>
                </ol>
                ${captura('02-tu-vpc', 'Los detalles de la VPC datacampvpc', [
                  [9.6, 36.1, 'Márcala'],
                  [53.3, 95.4, 'IPv4 CIDR: <strong>172.31.0.0/16</strong>'],
                  [27.4, 95.4, 'Default VPC: <strong>Yes</strong>'],
                  [79.1, 85.9, 'Su tabla de rutas principal']
                ])}
                <ol class="pasos-consola" start="3" style="counter-reset: paso 2">
                  <li>Abre la VPC con un clic en su ID (<em>vpc-…</em>) y baja hasta <strong>Resource map</strong>. Desliza el mapa a la derecha con la barra de abajo.</li>
                </ol>
                ${captura('03-mapa-default', 'El mapa de recursos de la VPC por omisión', [
                  [4.2, 30.8, 'Una subred por zona, en <strong>verde</strong>'],
                  [49.4, 26.8, 'Todas usan una tabla de rutas…'],
                  [83.1, 26.8, '…que sale por el <strong>Internet Gateway</strong> (igw)']
                ])}
                ${recuadro('recuerda', 'Las subredes en verde son <strong>públicas</strong>: su tabla de rutas llega al Internet Gateway. Por eso tu servidor de la sesión 1 tenía página web.')}`,
              ver: 'El Resource map con 6 subredes, 1 tabla de rutas y, en Network Connections, un igw.',
              sandbox: true
            },
            {
              titulo: 'La ruta que la hace pública',
              html: `
                <ol class="pasos-consola">
                  <li>En el menú izquierdo pulsa <strong>Route tables</strong> y marca la única tabla.</li>
                  <li>Abajo, abre la pestaña <strong>Routes</strong>.</li>
                </ol>
                ${captura('04-rutas-default', 'Las rutas de la tabla principal de la VPC por omisión', [
                  [14.2, 26.4, 'Pestaña <strong>Routes</strong>'],
                  [8.2, 81.5, '<strong>0.0.0.0/0</strong>: todo internet…'],
                  [30.5, 81.5, '…va al Internet Gateway'],
                  [25.2, 92.1, '<strong>local</strong>: el tráfico dentro de la VPC']
                ])}
                <p>Se lee así: <em>“Lo que vaya a una dirección de esta VPC se queda adentro (local). Lo que vaya a cualquier otro lado sale por el Internet Gateway.”</em></p>`,
              ver: 'Dos rutas: 0.0.0.0/0 hacia igw-… y 172.31.0.0/16 hacia local. Tómale captura: es tu primera evidencia.',
              evidencia: {
                id: 'rutas-publicas',
                titulo: 'La ruta a internet',
                pide: 'La pestaña Routes de la tabla de la VPC por omisión, con 0.0.0.0/0 hacia el Internet Gateway y la ruta local.'
              },
              sandbox: true
            },
            {
              titulo: 'Mira el plano de una red completa',
              html: `
                <ol class="pasos-consola">
                  <li>Pulsa <strong>Your VPCs</strong> y luego ${boton('Create VPC', 'crear VPC')}.</li>
                  <li>Elige <strong>VPC and more</strong>. A la derecha aparece un <strong>Preview</strong> con todo lo que AWS crearía. <strong>No lo crees</strong>: solo míralo.</li>
                </ol>
                ${captura('05-vpc-and-more', 'El asistente VPC and more con su vista previa', [
                  [19.8, 22.9, '<strong>VPC and more</strong>'],
                  [5.5, 72.4, 'CIDR de la VPC: 10.0.0.0/16'],
                  [81.9, 47.8, 'Una subred pública…'],
                  [81.9, 55.1, '…y una privada en cada zona']
                ])}
                <ol class="pasos-consola" start="3" style="counter-reset: paso 2">
                  <li>Desliza el Preview a la derecha para ver las tablas de rutas y las conexiones.</li>
                </ol>
                ${captura('06-vpc-and-more-rutas', 'Las tablas de rutas y conexiones de la vista previa', [
                  [26.1, 37.7, 'La tabla <strong>pública</strong>…'],
                  [67.1, 37.7, '…sale por el Internet Gateway'],
                  [68.6, 47.1, 'Las privadas llegan a S3 por un <strong>endpoint</strong>']
                ])}
                <ol class="pasos-consola" start="4" style="counter-reset: paso 3">
                  <li>Baja en el formulario hasta <strong>NAT gateways</strong> y <strong>VPC endpoints</strong>.</li>
                </ol>
                ${captura('07-nat', 'Las opciones NAT gateways y VPC endpoints del asistente', [
                  [8.7, 4.8, 'NAT gateways tiene <strong>($)</strong>: cuesta por hora'],
                  [10.6, 57.8, 'Endpoint de S3: gratis']
                ])}
                ${recuadro('cuidado', 'No pulses <em>Create VPC</em> en esta pantalla: el sandbox no permite crear el Internet Gateway y quedaría a medias. En el siguiente paso usas <strong>VPC only</strong>.')}`,
              ver: 'El Preview con 4 subredes, 3 tablas de rutas y las conexiones project-igw y project-vpce-s3.',
              sandbox: true
            },
            {
              titulo: 'Crea tu VPC',
              html: `
                <ol class="pasos-consola">
                  <li>Arriba, cambia a <strong>VPC only</strong>.</li>
                  <li>En <strong>Name tag</strong> escribe <kbd>red-tu-nombre</kbd>.</li>
                  <li>En <strong>IPv4 CIDR</strong> escribe <kbd>10.0.0.0/16</kbd>. Lo demás déjalo como viene.</li>
                </ol>
                ${captura('08-vpc-only', 'El formulario Create VPC con VPC only', [
                  [4.0, 39.1, '<strong>VPC only</strong>'],
                  [7.1, 57.9, 'Name tag: red-tu-nombre'],
                  [7.1, 89.7, 'IPv4 CIDR: 10.0.0.0/16']
                ])}
                <ol class="pasos-consola" start="4" style="counter-reset: paso 3">
                  <li>Baja hasta el final y pulsa ${boton('Create VPC', 'crear VPC')}.</li>
                </ol>
                ${captura('09-vpc-creada', 'Tu VPC recién creada', [
                  [20.3, 3.1, 'Creada con éxito'],
                  [53.8, 47.5, 'Su CIDR: 10.0.0.0/16'],
                  [27.8, 47.5, 'Default VPC: <strong>No</strong>'],
                  [42.1, 97.6, 'Todavía sin subredes']
                ])}
                ${recuadro('sabias', 'AWS creó solo, junto con tu VPC, una tabla de rutas principal, una NACL y un grupo de seguridad por omisión.')}`,
              ver: 'El aviso verde “You successfully created vpc-… / red-tu-nombre” y Subnets (0).',
              problemas: [['Sale un error sobre el CIDR', 'Revisa que escribiste 10.0.0.0/16 exactamente, sin espacios. El tamaño debe estar entre /16 y /28.']],
              sandbox: true
            },
            {
              titulo: 'La subred “pública”',
              html: `
                <ol class="pasos-consola">
                  <li>En el menú izquierdo pulsa <strong>Subnets</strong> y luego ${boton('Create subnet', 'crear subred')}.</li>
                  <li>En <strong>VPC ID</strong> abre la lista y elige tu VPC, <strong>red-tu-nombre</strong>.</li>
                </ol>
                ${captura('10-subred-vpc', 'Create subnet con tu VPC elegida', [
                  [14.9, 49.5, 'Tu VPC'],
                  [5.2, 89.8, 'Su rango: 10.0.0.0/16']
                ])}
                <ol class="pasos-consola" start="3" style="counter-reset: paso 2">
                  <li>En <strong>Subnet name</strong> escribe <kbd>publica-1a</kbd>.</li>
                  <li>En <strong>Availability Zone</strong> elige <strong>us-east-1a</strong>.</li>
                </ol>
                ${captura('11-zonas', 'La lista de zonas de disponibilidad de N. Virginia', [
                  [19.4, 35.8, 'us-east-1a para la primera'],
                  [19.4, 46.8, 'us-east-1b para la segunda']
                ])}
                <ol class="pasos-consola" start="5" style="counter-reset: paso 4">
                  <li>En <strong>IPv4 subnet CIDR block</strong> borra lo que trae y escribe <kbd>10.0.1.0/24</kbd>. A la derecha dice <em>256 IPs</em>.</li>
                </ol>
                ${captura('12-subred-publica', 'La primera subred con zona, CIDR y nombre', [
                  [12.9, 11.2, 'Zona: us-east-1a'],
                  [3.9, 41.1, 'CIDR: 10.0.1.0/24'],
                  [62.3, 40.8, '256 direcciones'],
                  [43.0, 65.5, 'Nombre: publica-1a']
                ])}`,
              ver: 'La subred 1 de 1 con publica-1a, us-east-1a y 10.0.1.0/24 (256 IPs). Todavía sin crear.',
              sandbox: true
            },
            {
              titulo: 'La subred privada y crea las dos',
              html: `
                <ol class="pasos-consola">
                  <li>Abajo pulsa ${boton('Add new subnet', 'agregar subred')}. Aparece “Subnet 2 of 2”.</li>
                  <li>Nombre <kbd>privada-1b</kbd>, zona <strong>us-east-1b</strong> y CIDR <kbd>10.0.2.0/24</kbd>.</li>
                  <li>Pulsa ${boton('Create subnet', 'crear subred')}.</li>
                </ol>
                ${captura('13-subred-privada', 'La segunda subred en us-east-1b', [
                  [12.9, 9.9, 'Zona: us-east-1b'],
                  [3.9, 36.4, 'CIDR: 10.0.2.0/24'],
                  [43.0, 58.1, 'Nombre: privada-1b'],
                  [95.1, 95.5, '<strong>Create subnet</strong>']
                ])}
                ${captura('14-subredes-creadas', 'El aviso de que se crearon las dos subredes', [
                  [30.1, 7.2, '<em>You have successfully created 2 subnets</em>'],
                  [8.7, 82.1, 'Tus subredes en la lista']
                ])}
                ${recuadro('examen', 'Dos subredes en <strong>dos zonas distintas</strong>: así se arma la alta disponibilidad. Si una zona falla, la otra sigue funcionando.')}`,
              ver: 'El aviso verde “You have successfully created 2 subnets”.',
              problemas: [['Sale “CIDR conflicts with another subnet”', 'Las dos subredes no pueden encimarse: revisa que una sea 10.0.1.0/24 y la otra 10.0.2.0/24.']],
              sandbox: true
            },
            {
              titulo: 'Intenta crear tu puerta a internet',
              html: `
                <ol class="pasos-consola">
                  <li>En el menú izquierdo pulsa <strong>Internet gateways</strong>. Solo hay uno, y es de <em>datacampvpc</em>.</li>
                  <li>Pulsa ${boton('Create internet gateway', 'crear internet gateway')}, escribe el nombre <kbd>igw-tu-nombre</kbd> y confirma con el botón naranja.</li>
                </ol>
                ${captura('15-igw-lista', 'La lista de Internet gateways con el de la VPC por omisión', [
                  [59.0, 63.4, 'Attached: conectado…'],
                  [78.2, 63.4, '…a datacampvpc'],
                  [90.7, 9.7, '<strong>Create internet gateway</strong>']
                ])}
                <ol class="pasos-consola" start="3" style="counter-reset: paso 2">
                  <li>Sale un aviso rojo. Lee el final de su primer renglón y el principio del segundo.</li>
                </ol>
                ${captura('16-igw-denegado', 'El aviso rojo al intentar crear un Internet Gateway', [
                  [71.9, 4.4, 'La acción: <em>ec2:CreateInternetGateway</em>'],
                  [48.7, 9.1, '<em>explicit deny in a service control policy</em>']
                ])}
                <p>Es la <strong>denegación explícita de una SCP</strong> que conociste en la sesión 2: DataCamp no deja que nadie abra puertas a internet en el sandbox.</p>`,
              ver: 'El aviso rojo con ec2:CreateInternetGateway y “explicit deny in a service control policy”. Tómale captura: es tu segunda evidencia.',
              evidencia: {
                id: 'igw-denegado',
                titulo: 'La puerta que no se pudo abrir',
                pide: 'El aviso rojo al crear el Internet Gateway, donde se lean ec2:CreateInternetGateway y “explicit deny in a service control policy”.'
              },
              sandbox: true
            },
            {
              titulo: '¿Tus subredes son públicas?',
              html: `
                <ol class="pasos-consola">
                  <li>Pulsa <strong>Cancel</strong> y ve a <strong>Route tables</strong>. Ahora hay dos tablas: marca la que es de <strong>tu VPC</strong> (la columna VPC dice <em>red-tu-nombre</em>).</li>
                  <li>Abre la pestaña <strong>Routes</strong>.</li>
                </ol>
                ${captura('17-rutas-propias', 'Las rutas de la tabla de tu VPC', [
                  [8.3, 88.2, 'Solo 10.0.0.0/16…'],
                  [25.2, 88.2, '…hacia local']
                ])}
                <ol class="pasos-consola" start="3" style="counter-reset: paso 2">
                  <li>Pulsa ${boton('Edit routes', 'editar rutas')} y luego ${boton('Add route', 'agregar ruta')}.</li>
                  <li>En <strong>Destination</strong> elige <kbd>0.0.0.0/0</kbd> y abre la lista <strong>Target</strong> para ver a dónde puede ir el tráfico.</li>
                </ol>
                ${captura('18-targets', 'La lista Target al agregar la ruta 0.0.0.0/0', [
                  [7.1, 32.1, 'Destino: todo internet'],
                  [31.3, 64.8, '<strong>Internet Gateway</strong>: subred pública'],
                  [30.4, 75.4, '<strong>NAT Gateway</strong>: privada con salida'],
                  [31.8, 91.3, '<strong>Peering Connection</strong>: hacia otra VPC']
                ])}
                <ol class="pasos-consola" start="5" style="counter-reset: paso 4">
                  <li>Pulsa <kbd>Esc</kbd> y luego <strong>Cancel</strong>: <strong>no guardes</strong> la ruta. No tienes un Internet Gateway a dónde mandarla.</li>
                </ol>
                ${recuadro('examen', 'Tu subred se llama <em>publica-1a</em>, pero es <strong>privada</strong>: su tabla de rutas no tiene 0.0.0.0/0 hacia un Internet Gateway. El nombre no cambia nada; la ruta sí.')}`,
              ver: 'Tu tabla de rutas con una sola ruta, 10.0.0.0/16 → local, y la lista de Targets que podría tener.',
              sandbox: true
            },
            {
              titulo: 'Compara los mapas',
              html: `
                <ol class="pasos-consola">
                  <li>Ve a <strong>Your VPCs</strong> y abre <strong>tu VPC</strong> con un clic en su ID (no en la de datacampvpc).</li>
                  <li>Baja hasta <strong>Resource map</strong>.</li>
                </ol>
                ${captura('21-mapa-propio', 'El mapa de recursos de tu VPC', [
                  [39.5, 62.9, 'publica-1a en <strong>azul</strong>: privada'],
                  [39.5, 85.1, 'privada-1b, también en azul'],
                  [84.8, 55.6, 'Una tabla de rutas… y ninguna conexión']
                ])}
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col"></th><th scope="col">VPC por omisión</th><th scope="col">Tu VPC</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Color de las subredes</th><td>Verde (públicas)</td><td>Azul (privadas)</td></tr>
                      <tr><th scope="row">Ruta 0.0.0.0/0</th><td>Hacia el igw</td><td>No existe</td></tr>
                      <tr><th scope="row">Network connections</th><td>1 Internet Gateway</td><td>Ninguna</td></tr>
                    </tbody>
                  </table>
                </div>`,
              ver: 'El mapa de tu VPC con publica-1a y privada-1b en azul y sin Network connections. Tómale captura: es tu tercera evidencia.',
              evidencia: {
                id: 'mapa-propio',
                titulo: 'El mapa de tu VPC',
                pide: 'El Resource map de tu VPC, con tus dos subredes en azul y una sola tabla de rutas.'
              },
              sandbox: true
            },
            {
              titulo: 'Asómate al borde: CloudFront y Route 53',
              html: `
                <ol class="pasos-consola">
                  <li>Busca <kbd>CloudFront</kbd> y ábrelo. Fíjate en el selector de región, arriba a la derecha.</li>
                </ol>
                ${captura('19-cloudfront', 'La lista de distribuciones de CloudFront', [
                  [82.5, 5.8, 'La región dice <strong>Global</strong>'],
                  [26.8, 30.0, 'Distribuciones: tus CDN (aquí, 0)']
                ])}
                <ol class="pasos-consola" start="2" style="counter-reset: paso 1">
                  <li>Ahora busca <kbd>Route 53</kbd> y ábrelo. También dice <strong>Global</strong>.</li>
                </ol>
                ${captura('20-route53', 'La página de inicio de Amazon Route 53', [
                  [82.0, 5.0, 'También <strong>Global</strong>'],
                  [28.6, 42.4, 'Route 53: el DNS de AWS']
                ])}
                ${recuadro('examen', 'Servicios <strong>globales</strong> que salen en el examen: IAM, Route 53, CloudFront y WAF para CloudFront. Casi todo lo demás (EC2, VPC, RDS) es <strong>regional</strong>.')}`,
              ver: 'CloudFront y Route 53 abiertos, con la región “Global” arriba a la derecha.',
              sandbox: true
            },
            {
              titulo: 'Limpia: borra tu VPC',
              html: `
                <ol class="pasos-consola">
                  <li>Vuelve a <strong>VPC › Your VPCs</strong> y abre <strong>tu VPC</strong> con un clic en su ID.</li>
                  <li>Revisa el título: debe decir <strong>red-tu-nombre</strong>. Pulsa ${boton('Actions', 'acciones')} y elige <strong>Delete VPC</strong>.</li>
                </ol>
                ${captura('22-borrar-menu', 'El menú Actions de tu VPC con Delete VPC', [
                  [93.1, 7.7, '<strong>Actions</strong>'],
                  [83.8, 91.9, '<strong>Delete VPC</strong>']
                ])}
                ${recuadro('cuidado', 'Hazlo desde la página de tu VPC, no desde la lista: la lista a veces recuerda marcada la <em>datacampvpc</em>, y esa no se borra.')}
                <ol class="pasos-consola" start="3" style="counter-reset: paso 2">
                  <li>La ventana dice que también borrará tus dos subredes. Escribe <kbd>delete</kbd> y pulsa ${boton('Delete', 'borrar')}.</li>
                </ol>
                ${captura('23-borrar-confirmar', 'La ventana Delete VPC con las dos subredes', [
                  [9.8, 62.5, 'También se borran tus subredes'],
                  [6.5, 85.5, 'Escribe <em>delete</em>'],
                  [92.3, 95.2, '<strong>Delete</strong>']
                ])}
                ${captura('24-borrada', 'El aviso de VPC borrada', [[28.0, 9.7, '<em>successfully deleted … and 2 other resources</em>']])}`,
              ver: 'El aviso verde “You successfully deleted vpc-… / red-tu-nombre and 2 other resources” y solo datacampvpc en la lista.',
              problemas: [['Sale que la VPC tiene dependencias', 'Algo sigue dentro, como una instancia o una interfaz de red. Bórralo primero y vuelve a intentar.']],
              sandbox: true
            },
            {
              titulo: 'Apaga el sandbox y entrega tus evidencias',
              html: `
                <ol class="pasos-consola">
                  <li>En la barra de DataCamp pulsa <strong>Exit Session</strong> y confirma con ${boton('End Session', 'terminar sesión')}.</li>
                </ol>
                ${capturaS1('24-salir', 'Aviso de DataCamp antes de terminar la sesión del sandbox', [
                  [93.1, 4.6, '<strong>Exit Session</strong>'],
                  [23.9, 92.7, '<strong>End Session</strong>']
                ])}
                <ol class="pasos-consola" start="2" style="counter-reset: paso 1">
                  <li>Al pulsar <strong>Terminar laboratorio</strong>, el contador de este curso se detiene.</li>
                  <li>Abajo están tus tres capturas. Descarga tu <strong>PDF de evidencias</strong> y súbelo a Blackboard.</li>
                </ol>
                ${nubi('¡Armaste tu propia red en la nube! Y ahora sabes que una subred pública no se nombra: se enruta.', 'nubi-feliz')}`,
              ver: 'La página Sandbox de DataCamp otra vez, y el contador de este curso detenido.',
              sandbox: false
            }
          ],
          cierre:
            'Leíste la red por omisión de AWS, viste el plano de una red completa, creaste una VPC con dos subredes en dos zonas, comprobaste que sin ruta al Internet Gateway una subred es privada y la borraste.'
        },
        {
          id: 's3-ex-destinos',
          tipo: 'clasificar',
          titulo: '¿A dónde va la ruta?',
          xp: 50,
          minutos: 3,
          contexto: '<p>Viste la lista de <em>Targets</em> al editar una tabla de rutas.</p>',
          pregunta: 'Elige el destino correcto para cada tipo de tráfico.',
          grupos: [
            { id: 'local', nombre: 'local', color: 'yellow' },
            { id: 'igw', nombre: 'Internet Gateway', color: 'green' },
            { id: 'nat', nombre: 'NAT Gateway', color: 'blue' },
            { id: 'endpoint', nombre: 'VPC endpoint', color: 'purple' }
          ],
          fichas: [
            { texto: 'Un servidor web habla con la base de datos de su misma VPC', grupo: 'local', retro: 'Dentro de la VPC el tráfico siempre usa la ruta local.' },
            { texto: 'Clientes de internet entran a la tienda', grupo: 'igw', retro: 'Entrar desde internet solo es posible por un Internet Gateway.' },
            { texto: 'Una base de datos privada descarga sus parches', grupo: 'nat', retro: 'El NAT Gateway deja salir lo privado sin que nadie de afuera pueda entrar.' },
            { texto: 'Una instancia privada lee archivos de S3 sin salir a internet', grupo: 'endpoint', retro: 'El gateway endpoint de S3 es una ruta privada al servicio.' },
            { texto: 'Dos subredes de la misma VPC intercambian datos', grupo: 'local', retro: 'Todas las subredes de una VPC se ven entre sí por la ruta local.' },
            { texto: 'Un servidor público responde a sus visitantes', grupo: 'igw', retro: 'La respuesta vuelve por el mismo Internet Gateway.' },
            { texto: 'Servidores de aplicación privados llaman a una API externa de pagos', grupo: 'nat', retro: 'Salir a internet desde lo privado: NAT Gateway.' },
            { texto: 'Una función privada escribe en DynamoDB por la red de AWS', grupo: 'endpoint', retro: 'DynamoDB también tiene gateway endpoint.' }
          ],
          cierre: 'local: dentro de la VPC. Internet Gateway: entrar y salir de internet. NAT Gateway: solo salir desde lo privado. VPC endpoint: llegar a servicios de AWS sin pasar por internet.',
          pista: '¿El tráfico se queda adentro, entra desde internet, solo sale, o va a un servicio de AWS?'
        },
        {
          id: 's3-ex-tu-subred',
          tipo: 'opcion',
          titulo: 'Tu subred “pública”',
          xp: 50,
          minutos: 2,
          contexto:
            '<p>En tu VPC del laboratorio lanzas una instancia en la subred <strong>publica-1a</strong> y le asignas una IP pública. La tabla de rutas de la VPC solo tiene <strong>10.0.0.0/16 → local</strong>.</p>',
          pregunta: '¿Alguien de internet puede abrir su página web?',
          opciones: [
            { texto: 'Sí, porque la subred se llama pública.', retro: 'El nombre es solo una etiqueta; AWS no lo usa para decidir nada.' },
            { texto: 'Sí, porque la instancia tiene una IP pública.', retro: 'La IP pública no basta: sin ruta al Internet Gateway, el tráfico no tiene por dónde entrar ni salir.' },
            { texto: 'No: falta una ruta 0.0.0.0/0 hacia un Internet Gateway conectado a la VPC.', correcta: true, retro: '¡Correcto! Eso es lo que convierte a una subred en pública.' },
            { texto: 'No, porque las subredes en us-east-1a nunca son públicas.', retro: 'La zona no tiene que ver: cualquier zona puede tener subredes públicas.' }
          ],
          pista: 'Recuerda qué tenía la tabla de rutas de la VPC por omisión y la tuya no.'
        }
      ]
    },

    /* ================================================================ 3 */
    {
      numero: 3,
      titulo: 'Repaso para el examen',
      descripcion: 'Lo que la certificación pregunta de redes, en una sola página, y un verdadero o falso para calentar antes del examen de práctica.',
      actividades: [
        {
          id: 's3-repaso',
          tipo: 'leccion',
          titulo: 'Lo que el examen te va a preguntar',
          xp: 50,
          minutos: 5,
          laminas: [
            {
              titulo: 'La sesión 3 en una hoja',
              html: `
                <div class="repaso">
                  <div class="repaso__capitulo"><span class="repaso__numero">1</span>${lista([
                    '<strong>VPC</strong>: red privada en una región. <strong>Subred</strong>: en una sola zona. <strong>CIDR</strong>: /16 grande, /24 mediana; 0.0.0.0/0 = todo internet.',
                    '<strong>Pública</strong> = ruta 0.0.0.0/0 → <strong>Internet Gateway</strong>. <strong>NAT Gateway</strong>: lo privado sale pero nadie entra.',
                    'Web en pública, base de datos en privada, y todo repetido en <strong>dos zonas</strong>.'
                  ])}</div>
                  <div class="repaso__capitulo"><span class="repaso__numero">2</span>${lista([
                    '<strong>VPC Peering</strong>: dos VPC. <strong>Transit Gateway</strong>: muchas VPC en un hub.',
                    '<strong>Site-to-Site VPN</strong>: oficina–AWS cifrada por internet. <strong>Direct Connect</strong>: línea dedicada, sin internet.',
                    '<strong>VPC endpoint</strong>: llegar a S3 y otros servicios sin salir a internet.'
                  ])}</div>
                  <div class="repaso__capitulo"><span class="repaso__numero">3</span>${lista([
                    '<strong>Route 53</strong>: DNS, dominios, health checks y políticas (simple, ponderada, latencia, failover, geolocalización).',
                    '<strong>CloudFront</strong>: CDN en ubicaciones de borde. <strong>Global Accelerator</strong>: red de AWS e IP fijas.',
                    'Globales: IAM, Route 53, CloudFront. Regionales: VPC, EC2, RDS.'
                  ])}</div>
                </div>`,
              notas: 'Pide que alguien explique en voz alta qué hace pública a una subred antes de abrir el examen.'
            }
          ]
        },
        {
          id: 's3-vf',
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
            { texto: 'Una subred puede extenderse por dos zonas de disponibilidad.', grupo: 'f', retro: 'Falso: cada subred vive en una sola zona.' },
            { texto: 'Una VPC vive dentro de una sola región.', grupo: 'v', retro: 'Verdadero: para otra región se crea otra VPC.' },
            { texto: 'Un NAT Gateway deja que internet entre a tus instancias privadas.', grupo: 'f', retro: 'Falso: solo deja salir; nadie de afuera puede entrar.' },
            { texto: 'Una subred es pública si su tabla de rutas llega a un Internet Gateway.', grupo: 'v', retro: 'Verdadero: eso es lo único que la hace pública.' },
            { texto: 'Direct Connect viaja cifrado por internet.', grupo: 'f', retro: 'Falso: eso es una VPN. Direct Connect es una línea privada dedicada.' },
            { texto: 'CloudFront guarda copias del contenido en ubicaciones de borde.', grupo: 'v', retro: 'Verdadero: así lo sirve cerca de los usuarios.' },
            { texto: 'Route 53 puede mandar a los usuarios a la región de respaldo si la principal falla.', grupo: 'v', retro: 'Verdadero: con health checks y enrutamiento de conmutación por error.' },
            { texto: '10.0.0.0/24 es una red más grande que 10.0.0.0/16.', grupo: 'f', retro: 'Falso: /24 son 256 direcciones y /16 son 65,536.' }
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
        'Proyecta el QR de la plataforma y que abran “Ruta AWS Cloud Practitioner”, sesión 3.',
        'Pregunta rápida: ¿por qué tu servidor de la sesión 1 se podía ver desde internet? Hoy lo descubren.'
      ],
      vigila: 'Que nadie encienda el sandbox todavía.'
    },
    {
      desde: 5,
      hasta: 38,
      titulo: 'Capítulo 1 · Antes de encender el sandbox',
      capitulo: 1,
      pasos: [
        'Proyecta las lecciones: VPC y CIDR, subredes públicas y privadas, conectar redes y la red en el borde.',
        'La lámina “¿Qué hace pública a una subred?” es la idea central: el laboratorio la comprueba.',
        'Los ejercicios los resuelven solos, dos o tres minutos cada uno.'
      ],
      vigila: 'No se atoren en el CIDR: basta con saber que /16 es grande y /24 mediana.'
    },
    {
      desde: 38,
      hasta: 92,
      titulo: 'Capítulo 2 · Laboratorio guiado',
      capitulo: 2,
      pasos: [
        'Proyecta el laboratorio y avanza paso a paso; que cada quien marque “Ya lo hice”.',
        'En el paso 6 insiste: miren el asistente, pero NO pulsen Create VPC en “VPC and more”.',
        'En el paso 11 pide que alguien explique por qué su subred “publica-1a” es privada.',
        'Antes de terminar, revisa que todos borraron SU VPC (no la datacampvpc) y cerraron el sandbox.'
      ],
      vigila: 'En “Avance en vivo” se ve en qué paso va cada quien. Los pasos 8 y 9 (crear subredes) son donde más se atoran con el CIDR.'
    },
    {
      desde: 92,
      hasta: 100,
      titulo: 'Capítulo 3 · Repaso',
      capitulo: 3,
      pasos: ['Proyecta la hoja de repaso.', 'El verdadero o falso es el termómetro antes del examen.'],
      vigila: 'Cuando casi todos terminen, abre el examen de práctica de la sesión 3.'
    },
    {
      desde: 100,
      hasta: 117,
      titulo: 'Examen de práctica',
      pasos: [
        'En el panel elige la sesión 3 y abre el examen en la pestaña “Práctica final”.',
        '20 preguntas de redes al estilo de la certificación, una sola entrega.',
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
