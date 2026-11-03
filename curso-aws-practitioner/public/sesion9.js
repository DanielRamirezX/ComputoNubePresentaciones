// ---------------------------------------------------------------------------
// RUTA AWS CLOUD PRACTITIONER · SESIÓN 9 · PRÁCTICA 1: LA TIENDA EN LÍNEA
//
// Primera práctica integradora: una web de dos capas con alta disponibilidad.
// «Barro y Telar», una cooperativa de artesanos de los Valles Centrales de
// Oaxaca, vende en línea y su tienda se cayó dos veces en el Buen Fin. El
// alumno la monta en el simulador AWS (evaluacion-aws, laboratorio practica-1,
// que se califica solo): VPC propia con subredes públicas y privadas en dos
// zonas, grupos de seguridad encadenados (balanceador → web → base), plantilla
// de lanzamiento con user data, Auto Scaling detrás de un Application Load
// Balancer, RDS MySQL Multi-AZ en las privadas, un bucket para las fotos y una
// alarma de CPU que avisa por SNS.
//
// La lección agrega lo que el CLF-C02 pregunta de esta arquitectura y la Ruta
// no había visto: Well-Architected aplicado (los principios generales de
// diseño), Elastic Beanstalk y Lightsail, CloudFormation, Amplify y Amazon ECS
// con AWS Fargate, cada uno con su palabra clave para el examen.
//
// Datos revisados en la documentación oficial de AWS el 2 de noviembre de 2026:
// Elastic Beanstalk no cobra extra (pagas lo que crea) y soporta Go, Java,
// .NET, Node.js, PHP, Python, Ruby y Docker; Lightsail cobra un paquete mensual
// fijo (desde 5 USD con IPv4 pública: servidor, disco SSD y 1 TB de
// transferencia); Amplify Hosting publica desde Git con despliegue continuo;
// App Runner está cerrado a clientes nuevos desde el 30 de abril de 2026 (los
// que ya lo usan siguen igual y AWS recomienda Amazon ECS Express Mode) y ya no
// aparece en la guía CLF-C02 v1.3 (29 de octubre de 2026), que para
// contenedores sin servidores nombra AWS Fargate; los seis principios
// generales de diseño de Well-Architected son los de la lámina.
// ---------------------------------------------------------------------------

import { icono, lista, nubi, recuadro } from './piezas.js';

/* ----------------------------------------------------- la arquitectura */

// Una caja del diagrama: título en negritas y renglones chicos debajo.
const caja = (x, y, w, h, relleno, titulo, renglones = []) => `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" class="trazo ${relleno}"/>
  <text x="${x + 12}" y="${y + 24}">${titulo}</text>
  ${renglones.map((r, i) => `<text x="${x + 12}" y="${y + 44 + i * 18}" class="etq-chica">${r}</text>`).join('')}`;

const flecha = (x1, y1, x2, y2, punteada = false) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="trazo" marker-end="url(#s9-punta)"${punteada ? ' stroke-dasharray="7 6" style="stroke-width:2"' : ''}/>`;

// Una zona o subred: rectángulo con su etiqueta chica arriba a la izquierda.
const area = (x, y, w, h, relleno, etiqueta, extra = '') => `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" class="trazo ${relleno}" ${extra}/>
  <text x="${x + 12}" y="${y + 20}" class="etq-chica">${etiqueta}</text>`;

// El mismo diagrama sale en la lección del caso y en la práctica. En el
// celular se desplaza de lado dentro de su caja para que se pueda leer.
const ARQUITECTURA = `
  <figure class="diagrama">
    <div style="overflow-x:auto">
      <svg class="diagrama__svg" style="min-width:660px;max-height:none" viewBox="0 0 880 540" role="img" aria-labelledby="s9-arq-titulo s9-arq-desc">
        <title id="s9-arq-titulo">La tienda Barro y Telar en AWS, en dos zonas</title>
        <desc id="s9-arq-desc">Los clientes entran desde internet por el Internet Gateway de la VPC tienda-vpc al Application Load Balancer, que está en las subredes públicas de dos zonas. El balanceador reparte a los servidores web de un grupo de Auto Scaling, uno por zona. Los servidores web se conectan por el puerto 3306 a la base RDS MySQL principal, en una subred privada; en la otra zona está la base en espera de Multi-AZ. Fuera de la VPC están el bucket S3 de las fotos, la alarma de CloudWatch que vigila la CPU del grupo y el tema de SNS que manda el correo.</desc>
        <defs>
          <marker id="s9-punta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="relleno-tinta"/></marker>
        </defs>

        ${caja(360, 12, 220, 44, 'relleno-amarillo', 'Clientes en internet')}

        <rect x="24" y="100" width="636" height="426" rx="12" class="trazo relleno-blanco" stroke-dasharray="9 6"/>
        <text x="38" y="128">tienda-vpc</text>
        <text x="136" y="128" class="etq-chica">tu red 10.x.0.0/16 · N. Virginia</text>
        <rect x="400" y="86" width="140" height="30" rx="8" class="trazo relleno-blanco" style="stroke-width:2"/>
        <text x="414" y="106" class="etq-chica">Internet Gateway</text>
        ${flecha(470, 56, 470, 84)}
        ${flecha(470, 116, 470, 196)}

        ${area(40, 140, 300, 374, 'relleno-blanco', 'Zona us-east-1a', 'style="stroke-width:1.5" stroke-dasharray="4 5"')}
        ${area(344, 140, 300, 374, 'relleno-blanco', 'Zona us-east-1b', 'style="stroke-width:1.5" stroke-dasharray="4 5"')}

        ${area(52, 168, 276, 178, 'relleno-verde', 'Subred pública', 'style="stroke-width:2"')}
        ${area(356, 168, 276, 178, 'relleno-verde', 'Subred pública', 'style="stroke-width:2"')}

        ${caja(120, 196, 444, 52, 'relleno-amarillo', 'Application Load Balancer · tienda-alb')}
        <text x="132" y="240" class="etq-chica">tienda-alb-sg: entra el 80 desde 0.0.0.0/0</text>

        <rect x="64" y="262" width="556" height="78" rx="12" class="trazo" stroke-dasharray="6 5" style="stroke-width:2"/>
        ${caja(76, 272, 228, 60, 'relleno-blanco', 'EC2 web (Apache)', ['tienda-web-sg: 80 solo del ALB'])}
        ${caja(380, 272, 228, 60, 'relleno-blanco', 'EC2 web (Apache)', ['tienda-web-sg: 80 solo del ALB'])}
        ${flecha(190, 248, 190, 270)}
        ${flecha(494, 248, 494, 270)}
        <text x="64" y="364" class="etq-chica">Auto Scaling: mín 2 · máx 4</text>

        ${area(52, 374, 276, 128, 'relleno-azul', 'Subred privada', 'style="stroke-width:2"')}
        ${area(356, 374, 276, 128, 'relleno-azul', 'Subred privada', 'style="stroke-width:2"')}
        ${caja(76, 404, 228, 88, 'relleno-blanco', 'RDS MySQL · principal', ['tienda-db-sg: 3306 solo web', 'cifrada · sin acceso público'])}
        ${caja(380, 404, 228, 88, 'relleno-blanco', 'RDS · standby', ['Multi-AZ: toma el lugar', 'si la principal falla'])}
        <line x1="304" y1="448" x2="378" y2="448" class="trazo" stroke-dasharray="7 6" style="stroke-width:2"/>
        ${flecha(280, 332, 280, 402)}
        ${flecha(420, 332, 306, 402)}
        <text x="290" y="366" class="etq-chica">3306</text>

        ${caja(684, 100, 176, 112, 'relleno-amarillo', 'S3 · fotos', ['barroytelar-fotos-…', 'bloqueo público: todo', 'versionado: on'])}
        ${flecha(600, 272, 682, 196, true)}

        ${caja(684, 252, 176, 94, 'relleno-blanco', 'CloudWatch', ['alarma tienda-cpu-alta', 'CPU del grupo > umbral'])}
        ${flecha(620, 312, 682, 304, true)}

        ${caja(684, 386, 176, 94, 'relleno-blanco', 'SNS', ['tema tienda-alertas', '→ correo confirmado'])}
        ${flecha(772, 346, 772, 384, true)}
      </svg>
    </div>
    <figcaption class="sutil">Línea continua: el camino de un cliente (internet → balanceador → servidor web → base). Punteada: las fotos, la vigilancia, el aviso y la copia de la base en la otra zona.</figcaption>
  </figure>`;

export const SESION_9 = {
  numero: 9,
  titulo: 'Práctica 1 · La tienda en línea',
  subtitulo: 'Sesión 9 · Práctica 1: la tienda en línea',
  resumen:
    'Una cooperativa de artesanos de Oaxaca vende en línea y su tienda se cayó dos veces en el Buen Fin. En el simulador AWS la montas como se hace en la nube: red propia en dos zonas, balanceador, servidores que se curan y crecen solos, una base Multi-AZ privada, las fotos a salvo en S3 y una alarma que avisa. Además ves lo que el examen pregunta de esta arquitectura: Well-Architected aplicado, Elastic Beanstalk, Lightsail, CloudFormation, Amplify y Fargate.',
  duracion: '2 horas',
  minutosSandbox: 0,

  practica: {
    titulo: 'Examen de práctica · Sesión 9',
    corto: 'Examen de práctica',
    resumen: '20 preguntas de la tienda en línea y de las formas de desplegar en AWS, al estilo del examen de certificación, dos de respuesta múltiple, en unos 15 minutos y una sola entrega.',
    plegable: 'Ver cómo es el examen real',
    sobre: 'la tienda en línea de dos capas y las formas de desplegar en AWS'
  },

  capitulos: [
    /* ================================================================ 1 */
    {
      numero: 1,
      titulo: 'El caso y lo que pide el examen',
      descripcion:
        'Qué le pasó a la tienda, qué pieza de AWS resuelve cada problema y cómo queda la arquitectura cuando termines. Después, lo que el examen pregunta de esta arquitectura aunque hoy no lo toques: Well-Architected aplicado y las formas de desplegar sin armar cada pieza a mano.',
      actividades: [
        {
          id: 's9-caso',
          tipo: 'leccion',
          titulo: 'La tienda que se cayó en el Buen Fin',
          xp: 50,
          minutos: 4,
          laminas: [
            {
              titulo: 'Barro y Telar necesita no caerse',
              html: `
                <p class="entrada"><strong>Barro y Telar</strong> es una cooperativa de los Valles Centrales de Oaxaca: barro negro, alebrijes y tapetes de lana. Su tienda en línea vive en <strong>una sola computadora</strong>, con la página y la base de datos juntas. En el Buen Fin pasado se cayó dos veces.</p>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Lo que pasó o preocupa</th><th scope="col">La pieza de AWS</th><th scope="col">La viste en</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">El servidor se apagó solo y la tienda quedó fuera</th><td>Todo repartido en <strong>dos zonas de disponibilidad</strong>; un grupo de <strong>Auto Scaling</strong> reemplaza al servidor que falla</td><td>Sesiones 1, 3 y 6</td></tr>
                      <tr><th scope="row">Llegó tanta gente que ya no contestaba</th><td>Un <strong>Application Load Balancer</strong> reparte a los clientes y Auto Scaling agrega servidores en la hora pico (y los quita después)</td><td>Sesión 6</td></tr>
                      <tr><th scope="row">Los pedidos traen nombres, direcciones y teléfonos</th><td><strong>RDS MySQL</strong> en subredes privadas, cifrada, con respaldos y <strong>Multi-AZ</strong></td><td>Sesión 5</td></tr>
                      <tr><th scope="row">Cada pieza es única, y sus fotos también</th><td>Un bucket de <strong>S3</strong> con el acceso público bloqueado y versionado</td><td>Sesión 4</td></tr>
                      <tr><th scope="row">Nadie se entera cuando algo va mal</th><td>Una alarma de <strong>CloudWatch</strong> que avisa por correo con <strong>SNS</strong></td><td>Sesión 6</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('recuerda', 'Hoy no hay piezas nuevas: <strong>juntas</strong> lo que viste en las sesiones 1 a 7. Así se ve casi cualquier página web seria en AWS.')}`,
              notas: 'Pregunta al grupo antes de mostrar la segunda columna: ¿qué harían para que la tienda no se caiga si se apaga el servidor? Casi siempre alguien dice «poner dos». Bien: y ¿dónde pondrían el segundo?'
            },
            {
              titulo: 'La arquitectura que vas a montar',
              html: `
                ${ARQUITECTURA}
                ${recuadro('examen', 'Es una arquitectura de <strong>dos capas</strong>: la capa web (balanceador y servidores) y la capa de datos (la base). Cada capa solo deja entrar a la anterior: los grupos de seguridad usan como origen <strong>el grupo de la capa anterior</strong>, no una IP. Si una zona falla, la otra sigue vendiendo: eso es <strong>alta disponibilidad</strong>.')}`,
              notas: 'Recorre el diagrama con el dedo como si fueras un cliente: entra por el Internet Gateway, llega al balanceador, el balanceador elige un servidor, el servidor le pregunta a la base. Luego tapa con la mano la zona us-east-1a: ¿qué sigue funcionando? Todo, con la mitad de servidores y la base en espera convertida en principal.'
            }
          ]
        },
        {
          id: 's9-examen',
          tipo: 'leccion',
          titulo: 'Lo que el examen también pregunta',
          xp: 50,
          minutos: 6,
          laminas: [
            {
              titulo: 'Well-Architected, aplicado a la tienda',
              html: `
                <p class="entrada">En la sesión 7 viste los <strong>seis pilares</strong>. Hoy los ves en una arquitectura de verdad: cada decisión de la tienda cuida a uno.</p>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Pilar</th><th scope="col">En la tienda</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Fiabilidad</th><td>Dos zonas, base Multi-AZ y Auto Scaling que reemplaza servidores caídos.</td></tr>
                      <tr><th scope="row">Seguridad</th><td>Grupos de seguridad encadenados, base privada y cifrada, bucket sin acceso público.</td></tr>
                      <tr><th scope="row">Eficiencia del rendimiento</th><td>El balanceador reparte la carga y el grupo crece en la hora pico.</td></tr>
                      <tr><th scope="row">Optimización de costos</th><td>El grupo quita servidores cuando baja la carga, tiene un máximo y no hay NAT gateway que nadie usa.</td></tr>
                      <tr><th scope="row">Excelencia operativa</th><td>La alarma avisa sola y la plantilla con <em>user data</em> instala la página sin pasos a mano.</td></tr>
                      <tr><th scope="row">Sostenibilidad</th><td>Servidores encendidos solo cuando hacen falta: menos energía para el mismo trabajo.</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('examen', 'El marco también tiene <strong>principios generales de diseño</strong>: <em>dejar de adivinar la capacidad</em> (escalar en vez de comprar para el peor día), <em>probar a escala de producción</em>, <em>automatizar</em>, <em>arquitecturas que evolucionan</em>, <em>decidir con datos</em> y <em>mejorar con simulacros</em> (<em>game days</em>). La «prueba del Buen Fin» del bono es un pequeño <em>game day</em>.')}`,
              notas: 'Pregunta: antes de la nube, ¿para cuántos clientes compraba servidores la cooperativa? Para el peor día del año, y el resto del año sobraban. Ese es el principio «stop guessing your capacity needs».'
            },
            {
              titulo: 'La misma tienda, sin armarla a mano',
              html: `
                <p class="entrada">Hoy armas cada pieza tú: así entiendes qué hay debajo. En el trabajo, muchas veces un servicio la arma por ti. Mientras más arma AWS, menos controlas y menos administras.</p>
                <div class="rejilla rejilla--3 roles">
                  <article class="rol">${icono('servidor')}<h3>Amazon EC2</h3><p><strong>IaaS</strong>: tú eliges y configuras red, servidores, balanceador y escalado. Es lo que haces hoy.</p></article>
                  <article class="rol">${icono('engrane')}<h3>AWS Elastic Beanstalk</h3><p><strong>PaaS</strong>: subes tu código (Java, PHP, Python, Node.js, .NET, Go, Ruby o Docker) y AWS crea las instancias, el balanceador, el escalado y el monitoreo de salud. Puedes ver y ajustar esos recursos. <strong>No cobra extra</strong>: pagas lo que crea.</p></article>
                  <article class="rol">${icono('nube')}<h3>Amazon Lightsail</h3><p>Lo <strong>más sencillo</strong>: un servidor, sitio o base con <strong>precio mensual fijo</strong> que ya incluye disco y transferencia de datos (desde unos 5 USD). Para un blog, un WordPress o una tienda pequeña, sin aprender VPC.</p></article>
                </div>
                ${recuadro('examen', '<em>“Solo subir el código y que AWS se encargue de la capacidad, el balanceo y el escalado”</em> → <strong>Elastic Beanstalk</strong>. <em>“Sencillo, precio fijo y predecible al mes”</em> → <strong>Lightsail</strong>. <em>“Control total del sistema operativo”</em> → <strong>EC2</strong>.')}`,
              notas: 'Conecta con la responsabilidad compartida: con Beanstalk sigues siendo responsable de tu código y su configuración; AWS opera la plataforma. Lightsail también puede escalar a EC2 si la tienda crece.'
            },
            {
              titulo: 'Plantillas, apps modernas y contenedores',
              html: `
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Servicio</th><th scope="col">Qué hace</th><th scope="col">Palabra clave del examen</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">AWS CloudFormation</th><td><strong>Infraestructura como código</strong>: describes la VPC, el balanceador, el grupo y la base en una <strong>plantilla</strong> (JSON o YAML) y CloudFormation crea todo junto, como una <em>pila</em> (<em>stack</em>). La misma plantilla crea la tienda igualita en otra región. No cobra extra por los recursos de AWS: pagas lo que crea.</td><td>“plantilla”, “repetible”, “infraestructura como código”</td></tr>
                      <tr><th scope="row">AWS Amplify</th><td>Para crear y publicar el <strong>frontend</strong> de apps <strong>web y móviles</strong> (React, Angular, Vue, Next.js…). Conectas tu repositorio de Git y cada cambio se publica solo, con tu dominio.</td><td>“app web o móvil full-stack”, “desde Git”</td></tr>
                      <tr><th scope="row">Amazon ECS con AWS Fargate</th><td>Corre tu <strong>imagen de contenedor</strong> sin elegir, parchar ni escalar servidores: tú indicas CPU y memoria y AWS pone la máquina. Se combina con un balanceador y Auto Scaling.</td><td>“contenedor”, “sin administrar servidores”</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('cuidado', '<strong>AWS App Runner</strong> (de un contenedor a una URL sin administrar nada) ya no acepta clientes nuevos desde el 30 de abril de 2026 (AWS recomienda <strong>Amazon ECS Express Mode</strong>) y <strong>ya no aparece en la guía vigente del examen</strong>. Para contenedores sin servidores, la guía nombra <strong>AWS Fargate</strong>, con Amazon ECS o EKS.')}
                ${nubi('Truco: <strong>Beanstalk</strong> recibe tu <em>código</em>; <strong>CloudFormation</strong> recibe tu <em>plantilla</em>; <strong>Fargate</strong> corre tu <em>contenedor</em>; <strong>Amplify</strong> recibe tu <em>frontend</em>; <strong>Lightsail</strong> te da todo armado a precio fijo.')}`,
              notas: 'CloudFormation es lo que usan por dentro Beanstalk y muchas herramientas. AWS CDK permite escribir la plantilla en TypeScript o Python, y genera CloudFormation. CloudFormation no estima costos: eso es Pricing Calculator.'
            }
          ]
        },
        {
          id: 's9-ex-servicio',
          tipo: 'clasificar',
          titulo: '¿Quién lo despliega?',
          xp: 50,
          minutos: 4,
          contexto: '<p>A la cooperativa le llegan cinco proyectos nuevos. Cada uno pide una forma distinta de llevarlo a AWS.</p>',
          pregunta: 'Manda cada proyecto al servicio que mejor le queda.',
          grupos: [
            { id: 'beanstalk', nombre: 'Elastic Beanstalk', color: 'blue' },
            { id: 'lightsail', nombre: 'Lightsail', color: 'green' },
            { id: 'cloudformation', nombre: 'CloudFormation', color: 'purple' },
            { id: 'amplify', nombre: 'Amplify', color: 'yellow' },
            { id: 'fargate', nombre: 'ECS con Fargate', color: 'red' }
          ],
          fichas: [
            { texto: 'Subir el código PHP de la tienda y que AWS arme servidores, balanceador y escalado', grupo: 'beanstalk', retro: 'Tú das el código, AWS arma la plataforma: Elastic Beanstalk (PaaS).' },
            { texto: 'Desplegar una app Java ya hecha sin administrar la infraestructura, pero pudiendo ver sus instancias EC2', grupo: 'beanstalk', retro: 'Beanstalk crea recursos normales de AWS en tu cuenta, y puedes verlos y ajustarlos.' },
            { texto: 'Un blog en WordPress para la cooperativa, por un precio fijo al mes', grupo: 'lightsail', retro: 'Sencillo y con precio predecible: Lightsail.' },
            { texto: 'Un servidor virtual sencillo con disco y transferencia incluidos, sin configurar una VPC', grupo: 'lightsail', retro: 'Los paquetes de Lightsail ya incluyen disco y transferencia de datos.' },
            { texto: 'Crear la misma VPC, balanceador y base en otra región desde un archivo YAML', grupo: 'cloudformation', retro: 'Una plantilla repetible: infraestructura como código con CloudFormation.' },
            { texto: 'Guardar la infraestructura en Git y revisar cada cambio antes de aplicarlo', grupo: 'cloudformation', retro: 'Si la infraestructura es una plantilla, se versiona y se revisa como el código.' },
            { texto: 'Publicar el catálogo hecho en React cada vez que el equipo sube cambios a GitHub', grupo: 'amplify', retro: 'Frontend web publicado desde Git: Amplify Hosting.' },
            { texto: 'El frontend de una app móvil para que las clientas sigan sus pedidos', grupo: 'amplify', retro: 'Apps web y móviles full-stack: Amplify.' },
            { texto: 'Publicar una API que ya está en una imagen de contenedor, con escalado, sin tocar servidores', grupo: 'fargate', retro: 'Un contenedor sin administrar servidores: Amazon ECS con AWS Fargate.' },
            { texto: 'Correr una imagen de contenedor en ECS indicando solo CPU y memoria, sin elegir instancias EC2', grupo: 'fargate', retro: 'Sin elegir instancias: Fargate pone la máquina; tú solo indicas CPU y memoria.' }
          ],
          cierre: 'Beanstalk: tu código, AWS arma lo demás. Lightsail: sencillo y a precio fijo. CloudFormation: la infraestructura en una plantilla. Amplify: apps web y móviles desde Git. ECS con Fargate: tu contenedor, sin servidores que administrar.',
          pista: '¿Te dan código, una plantilla, un contenedor o un frontend? ¿O solo quieren algo sencillo a precio fijo?'
        }
      ]
    },

    /* ================================================================ 2 */
    {
      numero: 2,
      titulo: 'Práctica en el simulador AWS',
      descripcion:
        'La práctica completa en el simulador AWS: montas la tienda de Barro y Telar desde una cuenta vacía. Se califica sola mientras avanzas y tu docente ve tu progreso.',
      actividades: [
        {
          id: 's9-practica',
          tipo: 'simulador',
          titulo: 'Práctica 1: la tienda de artesanías de Oaxaca vende en línea',
          xp: 400,
          minutos: 84,
          lab: 'practica-1',
          objetivo:
            'Montar la tienda en línea de Barro y Telar como una web de dos capas con alta disponibilidad: red propia en dos zonas, balanceador, servidores que se curan y crecen solos, una base Multi-AZ privada, las fotos a salvo y una alarma que avisa por correo.',
          necesitas: [
            'Tu perfil de la Ruta: el simulador lo reconoce y le muestra tu avance a tu docente.',
            'Que tu docente abra la Práctica 1 en su panel.',
            'Una computadora o tableta: la consola en el celular es incómoda.',
            'No necesitas DataCamp ni tarjeta: todo es simulado y no cuesta nada.'
          ],
          caso: `
            <p><strong>Barro y Telar</strong> vende barro negro, alebrijes y tapetes a todo México y a Estados Unidos. Para este Buen Fin te contratan para montar su tienda <strong>como se hace en la nube</strong>: que no se caiga si falla una zona, que aguante la hora pico, que los pedidos y las fotos estén a salvo y que avise si algo va mal.</p>
            <p>Tu cuenta del simulador empieza <strong>vacía</strong>: solo trae la VPC por omisión, que <strong>no</strong> se usa. Todo va en <strong>N. Virginia (us-east-1)</strong>. Algunos datos son tuyos (el bloque de tu VPC, el sufijo del bucket, el objetivo de CPU, el umbral de la alarma y los días de respaldo): el simulador te los dice en cada tarea.</p>
            ${recuadro('consejo', 'Un orden que funciona: red → grupos de seguridad → plantilla y Auto Scaling → balanceador → base (tarda unos 30 segundos: mientras tanto haz el bucket) → alarma con SNS → el bono si te sobra tiempo.')}
            ${recuadro('recuerda', 'Cada tarea pide un <strong>resultado</strong>, no una lista de clics. La <strong>pista</strong> de cada tarea te dice en qué servicio y pantalla se hace, y puedes hacerle hasta 10 preguntas al asistente. Con «Revisar mi avance» ves qué te falta. Entrega antes de que termine el bloque; después puedes volver a intentarlo.')}`,
          arquitectura: ARQUITECTURA,
          tareas: [
            '<strong>La red, en dos zonas.</strong> Una VPC con tu bloque y un Internet Gateway; dos subredes públicas en zonas distintas con su ruta <code>0.0.0.0/0</code> al Internet Gateway, y dos subredes privadas en zonas distintas sin esa ruta. Vale el asistente «VPC and more» (sin NAT gateway).',
            '<strong>Cada capa solo deja entrar a la anterior.</strong> Tres grupos de seguridad encadenados: <code>tienda-alb-sg</code> con HTTP (80) desde <code>0.0.0.0/0</code>, <code>tienda-web-sg</code> con HTTP (80) solo desde el grupo del balanceador y <code>tienda-db-sg</code> con MYSQL/Aurora (3306) solo desde el grupo web.',
            '<strong>Servidores que se curan y crecen solos.</strong> Una plantilla de lanzamiento <code>tienda-web</code> con Amazon Linux 2023, <code>t2.micro</code> o <code>t3.micro</code>, el grupo web y el <em>user data</em> que te da el simulador; un grupo de Auto Scaling <code>tienda-asg</code> en dos zonas con mínimo 2, deseada 2 y máximo 4, y una política de <em>target tracking</em> de CPU.',
            '<strong>Un balanceador que reparte.</strong> Un grupo de destino <code>tienda-tg</code> (Instances, HTTP:80) y un Application Load Balancer <em>Internet-facing</em> <code>tienda-alb</code> en las dos subredes públicas, con un listener HTTP:80 que manda al grupo de destino. El grupo de Auto Scaling, conectado y con <em>health checks</em> de ELB. Al abrir el DNS del balanceador se ve la página de la tienda.',
            '<strong>La base de pedidos, privada y en dos zonas.</strong> RDS MySQL <code>tienda-db</code> con <em>Multi-AZ DB instance</em>, un <em>DB subnet group</em> con solo las subredes privadas, <em>Public access: No</em>, el grupo <code>tienda-db-sg</code>, cifrada y con los días de respaldo que te tocan.',
            '<strong>Las fotos, a salvo.</strong> Un bucket <code>barroytelar-fotos-</code> con tu sufijo, con todo el acceso público bloqueado y el versionado activado.',
            '<strong>Que la tienda avise.</strong> Un tema de SNS <code>tienda-alertas</code> con una suscripción Email confirmada, y una alarma de CloudWatch <code>tienda-cpu-alta</code> sobre la CPU promedio del grupo de Auto Scaling, arriba de tu umbral, que avise al tema.',
            '<strong>Bono opcional: la prueba del Buen Fin.</strong> Con «Simular hora pico», que la alarma suene, que llegue su correo a la Bandeja (simulada) y que el grupo crezca solo. Suma puntos extra, pero tu calificación no pasa de 100.'
          ]
        }
      ]
    },

    /* ================================================================ 3 */
    {
      numero: 3,
      titulo: 'Repaso para el examen',
      descripcion: 'Lo que montaste hoy y lo que el examen pregunta de esta arquitectura, en una hoja, y un verdadero o falso para calentar antes del examen de práctica.',
      actividades: [
        {
          id: 's9-repaso',
          tipo: 'leccion',
          titulo: 'La tienda en una hoja',
          xp: 50,
          minutos: 3,
          laminas: [
            {
              titulo: 'La sesión 9 en una hoja',
              html: `
                <div class="repaso">
                  <div class="repaso__capitulo"><span class="repaso__numero">1</span>${lista([
                    'Lo que hace pública a una subred es su <strong>ruta 0.0.0.0/0 al Internet Gateway</strong>, no su nombre. La base va en las <strong>privadas</strong>.',
                    '<strong>Alta disponibilidad</strong>: todo en dos zonas. El <strong>ALB</strong> pide al menos dos subredes en dos zonas y solo manda tráfico a destinos sanos.',
                    '<strong>Auto Scaling</strong>: nunca baja del mínimo ni pasa del máximo; reemplaza servidores caídos y crece o se encoge con la carga.'
                  ])}</div>
                  <div class="repaso__capitulo"><span class="repaso__numero">2</span>${lista([
                    '<strong>Grupos de seguridad encadenados</strong>: el origen de la regla es el grupo de la capa anterior. <strong>RDS</strong> con <em>Public access: No</em>.',
                    '<strong>Multi-AZ</strong>: una copia en espera en otra zona que toma el lugar de la principal. Para repartir lecturas, <strong>réplicas de lectura</strong>.',
                    '<strong>S3</strong>: bloqueo público y versionado. <strong>CloudWatch</strong> mide y alarma; <strong>SNS</strong> avisa; <strong>CloudTrail</strong> dice quién hizo qué.'
                  ])}</div>
                  <div class="repaso__capitulo"><span class="repaso__numero">3</span>${lista([
                    '<strong>Beanstalk</strong>: subes el código (PaaS), sin costo extra. <strong>Lightsail</strong>: sencillo y a precio fijo.',
                    '<strong>CloudFormation</strong>: plantilla repetible (IaC). <strong>Amplify</strong>: apps web y móviles desde Git. <strong>Fargate</strong>: contenedores sin administrar servidores.',
                    '<strong>Well-Architected</strong>: dejar de adivinar la capacidad, probar a escala, automatizar y mejorar con <em>game days</em>.'
                  ])}</div>
                </div>`,
              notas: 'Pide que alguien explique en voz alta la diferencia entre Multi-AZ y una réplica de lectura, y entre Elastic Beanstalk y CloudFormation.'
            }
          ]
        },
        {
          id: 's9-vf',
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
            { texto: 'Con Multi-AZ en RDS, si la base principal falla, la que está en espera toma su lugar sola.', grupo: 'v', retro: 'Verdadero: la conmutación es automática y la tienda sigue usando el mismo endpoint.' },
            { texto: 'Una subred es pública porque su nombre dice «public».', grupo: 'f', retro: 'Falso: la hace pública su ruta 0.0.0.0/0 hacia un Internet Gateway.' },
            { texto: 'AWS Elastic Beanstalk no cobra extra: pagas las instancias, el balanceador y lo demás que crea.', grupo: 'v', retro: 'Verdadero: Beanstalk es gratis; se pagan los recursos que usa tu aplicación.' },
            { texto: 'AWS CloudFormation sirve para estimar cuánto costará una arquitectura.', grupo: 'f', retro: 'Falso: estimar es de Pricing Calculator. CloudFormation crea la arquitectura desde una plantilla.' },
            { texto: 'Amplify publica apps web y móviles a partir de un repositorio de Git.', grupo: 'v', retro: 'Verdadero: conectas el repositorio y cada cambio se publica solo.' },
            { texto: 'Un grupo de Auto Scaling con mínimo 2 se queda en 0 servidores si nadie entra a la tienda.', grupo: 'f', retro: 'Falso: nunca baja del mínimo. Por eso pusiste 2, uno por zona.' },
            { texto: 'Lightsail cobra un precio mensual fijo que ya incluye servidor, disco y transferencia de datos.', grupo: 'v', retro: 'Verdadero: es la opción sencilla y predecible.' },
            { texto: 'Con Elastic Beanstalk pierdes todo acceso a las instancias EC2 que crea.', grupo: 'f', retro: 'Falso: los recursos quedan en tu cuenta y puedes verlos y ajustarlos.' }
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
        'Proyecta el QR de la plataforma y que abran “Ruta AWS Cloud Practitioner”, sesión 9. Hoy no hay sandbox de DataCamp.',
        'Proyecta “La tienda que se cayó en el Buen Fin” y recorre el diagrama como si fueras un cliente.',
        'Pasa rápido por “Lo que el examen también pregunta”: Well-Architected aplicado y las cinco formas de desplegar. Remarca que App Runner salió de la guía del examen.',
        'Mientras resuelven “¿Quién lo despliega?”, abre la Práctica 1 en el panel de Evaluación.'
      ],
      vigila: 'No te alargues en las tablas: el examen de práctica las vuelve a preguntar y el simulador necesita su tiempo.'
    },
    {
      desde: 14,
      hasta: 98,
      titulo: 'Capítulo 2 · Práctica en el simulador',
      capitulo: 2,
      pasos: [
        'En el panel de Evaluación abre la Práctica 1 (la tienda). Que cada quien entre desde la actividad con «Abrir la práctica en el simulador».',
        'Lee el caso en voz alta y señala el orden sugerido: red, grupos de seguridad, plantilla y Auto Scaling, balanceador, base, bucket y alarma.',
        'A los 25 minutos pregunta quién ya tiene la red y los tres grupos de seguridad: es donde más se atoran (el origen de la regla es un grupo sg-…, no una IP).',
        'Recorre el salón con el panel abierto en tu equipo: muestra quién va atorado en qué tarea.',
        'Diez minutos antes del final avisa que entreguen, aunque les falte algo: después pueden reintentar.'
      ],
      vigila: 'Que pongan la base en las subredes privadas (su propio DB subnet group) y que la alarma vigile la CPU del grupo, no la de una instancia.'
    },
    {
      desde: 98,
      hasta: 105,
      titulo: 'Capítulo 3 · Repaso',
      capitulo: 3,
      pasos: ['Proyecta la hoja de repaso.', 'El verdadero o falso es el termómetro antes del examen.'],
      vigila: 'Cuando casi todos terminen, abre el examen de práctica de la sesión 9.'
    },
    {
      desde: 105,
      hasta: 120,
      titulo: 'Examen de práctica y cierre',
      pasos: [
        'En el panel elige la sesión 9 y abre el examen en la pestaña “Práctica final”.',
        '20 preguntas en 15 minutos; dos son de respuesta múltiple («Elige DOS»). Una sola entrega.',
        'Al final, cierra el examen, proyecta las preguntas más falladas y descarga el CSV.',
        'Anuncia la sesión 10: la clínica que guarda expedientes y su auditoría de seguridad.'
      ],
      vigila: 'No proyectes el panel mientras contestan: muestra nombres y calificaciones.'
    }
  ]
};
