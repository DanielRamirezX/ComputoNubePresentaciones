// ---------------------------------------------------------------------------
// EL CURSO COMPLETO: capítulos, lecciones, ejercicios y el plan de la clase.
//
// Es un módulo sin dependencias que leen tres lados distintos:
//   - el navegador del alumno   (public/app.js)
//   - el panel del docente      (public/docente.js)
//   - el servidor y el verificador (app.js, src/verificar.js)
// Por eso aquí solo hay datos y funciones que arman texto: nada de `document`
// ni de `window`.
//
// Tipos de actividad:
//   'leccion'    — láminas que el docente proyecta y el alumno repasa.
//   'opcion'     — opción múltiple con una sola respuesta correcta.
//   'clasificar' — mandar cada ficha a su grupo (también sirve para V/F).
//
// Las respuestas de estos ejercicios viajan al navegador a propósito: son
// práctica con retroalimentación inmediata. La práctica final, la que sí
// cuenta, vive en src/practica.js y nunca sale del servidor.
//
// Datos verificados en septiembre de 2026. No cambies cifras sin revisar la
// fuente: cuotas de mercado (Synergy Research Group, 2.º trimestre de 2026),
// LFPDPPP (DOF 20-03-2025), caso Netflix (blog de Netflix, 2016) y caso
// Spotify (Computerworld, 2018).
// ---------------------------------------------------------------------------

/* ------------------------------------------------------------ piezas */

const ICONO_RECUADRO = {
  recuerda: 'foco',
  consejo: 'check',
  cuidado: 'alerta',
  tecnico: 'engrane',
  sabias: 'estrella'
};

const ETIQUETA_RECUADRO = {
  recuerda: 'Recuerda',
  consejo: 'Consejo',
  cuidado: 'Cuidado',
  tecnico: 'Cosas técnicas',
  sabias: '¿Sabías que?'
};

const icono = (nombre) => `<svg class="icono" aria-hidden="true"><use href="#i-${nombre}"></use></svg>`;

const recuadro = (tipo, html) => `
  <div class="recuadro recuadro--${tipo}">
    <svg class="recuadro__icono" aria-hidden="true"><use href="#i-${ICONO_RECUADRO[tipo]}"></use></svg>
    <div><span class="recuadro__etiqueta">${ETIQUETA_RECUADRO[tipo]}</span><p>${html}</p></div>
  </div>`;

const nubi = (html, cara = 'nubi') => `
  <div class="nubi">
    <svg class="nubi__imagen" viewBox="0 0 160 120" aria-hidden="true"><use href="#${cara}"></use></svg>
    <p class="nubi__globo">${html}</p>
  </div>`;

const chip = (proveedor, texto) => `<span class="chip chip--${proveedor}">${texto}</span>`;

const barras = (valores, clase) =>
  `<div class="barras ${clase}" aria-hidden="true">${valores.map((v) => `<span style="--h:${v}%"></span>`).join('')}</div>`;

const lista = (elementos) => `<ul>${elementos.map((e) => `<li>${e}</li>`).join('')}</ul>`;

// La tabla de las 9 capas. El reparto es el mismo de la presentación
// "IaaS, PaaS y SaaS": las primeras N capas (de arriba hacia abajo) son tuyas.
const CAPAS = [
  'Aplicación',
  'Datos',
  'Entorno de ejecución',
  'Middleware',
  'Sistema operativo',
  'Virtualización',
  'Servidores',
  'Almacenamiento',
  'Red'
];

const MODELOS = [
  { id: 'onprem', nombre: 'On-premises', tuyas: 9 },
  { id: 'iaas', nombre: 'IaaS', tuyas: 5 },
  { id: 'paas', nombre: 'PaaS', tuyas: 2 },
  { id: 'saas', nombre: 'SaaS', tuyas: 0 }
];

function pila() {
  const cabeza = MODELOS.map((m) => `<th scope="col" class="pila__modelo pila__modelo--${m.id}">${m.nombre}</th>`).join('');
  const filas = CAPAS.map(
    (capa, i) =>
      `<tr><th scope="row">${capa}</th>${MODELOS.map((m) =>
        i < m.tuyas ? '<td class="pila__tu">Tú</td>' : `<td class="pila__prov pila__prov--${m.id}">Proveedor</td>`
      ).join('')}</tr>`
  ).join('');
  const pie = MODELOS.map((m) => `<td><strong>${m.tuyas}</strong> de 9</td>`).join('');
  return `
    <div class="tabla-envoltura">
      <table class="pila">
        <caption class="solo-lectores">Quién administra cada capa en cada modelo</caption>
        <thead><tr><th scope="col">Capa</th>${cabeza}</tr></thead>
        <tbody>${filas}</tbody>
        <tfoot><tr><th scope="row">Tú administras</th>${pie}</tr></tfoot>
      </table>
    </div>
    <p class="leyenda"><span class="muestra muestra--tu"></span> Tú administras <span class="muestra muestra--prov"></span> El proveedor administra</p>`;
}

/* ------------------------------------------------------------ diagramas */

const SVG_CONEXION = `
<svg class="diagrama__svg" viewBox="0 0 640 185" role="img" aria-label="Tu celular se conecta por internet a los servidores de un centro de datos">
  <path class="flujo" d="M104 88H512"/>
  <g class="trazo">
    <rect x="44" y="38" width="54" height="96" rx="11" class="relleno-blanco"/>
    <rect x="53" y="50" width="36" height="64" rx="3" class="relleno-amarillo"/>
    <circle cx="71" cy="123" r="4" class="relleno-tinta"/>
    <path class="relleno-blanco" d="M275.6 127.4h91a26 26 0 0 0 2.6-52 41.6 41.6 0 0 0-78-7.8A31.2 31.2 0 0 0 275.6 127.4Z"/>
    <rect x="512" y="30" width="44" height="112" rx="5" class="relleno-blanco"/>
    <rect x="566" y="30" width="44" height="112" rx="5" class="relleno-blanco"/>
    <path d="M522 56h24M522 78h24M522 100h24M522 122h24M576 56h24M576 78h24M576 100h24M576 122h24"/>
  </g>
  <g class="leds">
    <circle cx="534" cy="44" r="3.5"/><circle cx="588" cy="44" r="3.5"/>
  </g>
  <text x="71" y="170" text-anchor="middle">Tú</text>
  <text x="323" y="170" text-anchor="middle">Internet</text>
  <text x="561" y="170" text-anchor="middle">Centro de datos</text>
</svg>`;

const SVG_VERTICAL = `
<svg class="diagrama__svg" viewBox="0 0 300 165" role="img" aria-label="Escalar verticalmente: una máquina pequeña se cambia por una más grande">
  <g class="trazo">
    <rect x="24" y="86" width="64" height="52" rx="6" class="relleno-blanco"/>
    <path d="M38 104h36M38 120h24"/>
    <path class="flecha" d="M104 112h50m-12-12 12 12-12 12"/>
    <rect x="172" y="14" width="104" height="124" rx="8" class="relleno-azul"/>
    <path d="M190 38h68M190 60h68M190 82h68M190 104h44"/>
  </g>
  <text x="56" y="158" text-anchor="middle" class="etq-chica">2 vCPU · 4 GB</text>
  <text x="224" y="158" text-anchor="middle" class="etq-chica">8 vCPU · 32 GB</text>
</svg>`;

const SVG_HORIZONTAL = `
<svg class="diagrama__svg" viewBox="0 0 300 165" role="img" aria-label="Escalar horizontalmente: un balanceador reparte el trabajo entre cuatro máquinas iguales">
  <g class="trazo">
    <rect x="8" y="60" width="54" height="40" rx="6" class="relleno-blanco"/>
    <path d="M18 74h34M18 86h22"/>
    <path class="flecha" d="M70 80h32m-10-10 10 10-10 10"/>
    <path d="M160 80 206 24M160 80 206 62M160 80 206 100M160 80 206 138"/>
    <rect x="110" y="62" width="50" height="36" rx="18" class="relleno-amarillo"/>
    <rect x="206" y="10" width="64" height="28" rx="5" class="relleno-verde"/>
    <rect x="206" y="48" width="64" height="28" rx="5" class="relleno-verde"/>
    <rect x="206" y="86" width="64" height="28" rx="5" class="relleno-verde"/>
    <rect x="206" y="124" width="64" height="28" rx="5" class="relleno-verde"/>
  </g>
  <text x="135" y="120" text-anchor="middle" class="etq-chica">balanceador</text>
</svg>`;

// Demanda ilustrativa de una tienda en línea, de enero a diciembre.
// y = 250 − demanda × 2.1 ; la capacidad comprada está en 75 (y = 92.5).
const DEMANDA = 'M80 187L127 195.4L174 191.2L221 187L268 178.6L315 182.8L362 174.4L409 170.2L456 178.6L503 161.8L550 56.8L597 103';
const AREA = '80,187 127,195.4 174,191.2 221,187 268,178.6 315,182.8 362,174.4 409,170.2 456,178.6 503,161.8 550,56.8 597,103 597,250 80,250';
const NUBE = 'M80 174.4L127 182.8L174 178.6L221 174.4L268 166L315 170.2L362 161.8L409 157.6L456 166L503 149.2L550 44.2L597 90.4';
const MESES = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

const SVG_DEMANDA = `
<svg class="diagrama__svg" viewBox="0 0 640 300" role="img" aria-label="Demanda de usuarios durante un año. Con servidores propios la capacidad es fija: sobra casi todo el año y no alcanza en el Buen Fin. Con la nube la capacidad sigue a la demanda.">
  <defs>
    <pattern id="patron-ocioso" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3.5" height="9" fill="#d6cdbb"/></pattern>
    <clipPath id="recorte-pico"><rect x="0" y="0" width="640" height="92.5"/></clipPath>
  </defs>
  <path class="eje" d="M60 30V250H620"/>
  <text x="66" y="22" class="etq-chica">Usuarios</text>
  <rect class="solo-propio" x="80" y="92.5" width="517" height="157.5" fill="url(#patron-ocioso)"/>
  <polygon class="area-demanda" points="${AREA}"/>
  <g class="solo-propio">
    <polygon class="area-caida" clip-path="url(#recorte-pico)" points="${AREA}"/>
    <path class="linea-capacidad" d="M80 92.5H597"/>
    <text x="84" y="84" class="etq-chica">Capacidad comprada</text>
    <text x="300" y="134" class="etq-ocioso" text-anchor="middle">Pagado sin usar</text>
    <text x="528" y="72" class="etq-caida" text-anchor="end">¡Se cae!</text>
  </g>
  <g class="solo-nube">
    <path class="linea-nube" pathLength="1" d="${NUBE}"/>
    <text x="300" y="134" class="etq-nube" text-anchor="middle">Pagas solo lo que usas</text>
  </g>
  <path class="linea-demanda" pathLength="1" d="${DEMANDA}"/>
  <text x="456" y="206" class="etq-demanda" text-anchor="middle">Demanda</text>
  <g class="meses">${MESES.map((m, i) => `<text x="${80 + 47 * i}" y="272" text-anchor="middle">${m}</text>`).join('')}</g>
  <text x="550" y="292" class="etq-chica" text-anchor="middle">Buen Fin</text>
</svg>`;

/* ------------------------------------------------------------ el curso */

export const CURSO = {
  id: 'comprender-nube',
  titulo: 'Comprender la computación en la nube',
  resumen:
    'Por qué la nube cambió la forma de usar computadoras, cómo se implementa en una empresa y quiénes son los grandes proveedores. Al final, una práctica con un caso real valida lo que aprendiste.',
  duracion: '2 horas',

  capitulos: [
    /* ================================================================ 1 */
    {
      numero: 1,
      titulo: 'Introducción a la computación en la nube',
      descripcion:
        'Vas a entender por qué la nube se volvió la forma normal de usar computadoras, cómo se compara con tener servidores propios y qué la hace tan poderosa. Cierras repasando los tres modelos de servicio (IaaS, PaaS y SaaS) y cómo cada uno responde a necesidades distintas de una empresa.',
      actividades: [
        {
          id: 'c1-intro',
          tipo: 'leccion',
          titulo: 'Introducción a la computación en la nube',
          xp: 50,
          minutos: 5,
          laminas: [
            {
              titulo: 'La nube no está en el cielo',
              html: `
                <p class="entrada">La nube son <span class="marcador">computadoras de alguien más</span> que usas por internet.</p>
                <figure class="diagrama">${SVG_CONEXION}</figure>
                <ul class="ideas">
                  <li>${icono('edificio')}<p><strong>Viven en centros de datos:</strong> edificios reales llenos de servidores, con luz, aire acondicionado y vigilancia las 24 horas.</p></li>
                  <li>${icono('red')}<p><strong>Las usas por internet,</strong> sin tocarlas nunca.</p></li>
                  <li>${icono('dinero')}<p><strong>Pagas por lo que usas,</strong> como el recibo de la luz.</p></li>
                </ul>
                ${nubi('Cada vez que abres Gmail, Netflix o Spotify, estás usando la nube.')}`,
              notas:
                'Pregunta al grupo: “¿Quién usó la nube hoy antes de llegar?”. Casi todos: los respaldos de WhatsApp, Spotify, Gmail. Insiste en que la nube son edificios reales, con electricidad, enfriamiento y seguridad.'
            },
            {
              titulo: 'Antes de la nube, todo era tuyo',
              html: `
                <p class="entrada">Si una empresa quería un sistema, compraba sus propios servidores, los instalaba en su edificio y los cuidaba ella misma. A eso se le llama <strong>on-premises</strong> (“en las instalaciones propias”).</p>
                <div class="rejilla rejilla--2 problemas">
                  <div class="problema">${icono('dinero')}<p><strong>Pagas todo antes de empezar.</strong> Servidores, licencias e instalación.</p></div>
                  <div class="problema">${icono('reloj')}<p><strong>Tarda semanas.</strong> Cotizar, comprar, esperar el envío e instalar.</p></div>
                  <div class="problema">${icono('alerta')}<p><strong>Si llega mucha gente, se cae.</strong> Solo tienes lo que compraste.</p></div>
                  <div class="problema">${icono('servidor')}<p><strong>Si llega poca, desperdicias.</strong> Pagaste equipo que casi no se usa.</p></div>
                </div>
                ${recuadro('recuerda', 'On-premises no es malo: te da control total. El precio es que todo el trabajo y todo el gasto son tuyos, incluidos la luz, los respaldos y las reparaciones.')}`,
              notas:
                'Es un repaso rápido de la clase de IaaS, PaaS y SaaS. Pregunta: “¿Qué le pasa a la página de inscripciones el primer día?”. Se cae porque se compró para un día normal.'
            },
            {
              titulo: 'Comprar o rentar: CapEx contra OpEx',
              html: `
                <p class="entrada">Es la misma decisión que <strong>comprar un coche</strong> o <strong>pedir un taxi</strong> cada vez que lo necesitas.</p>
                <div class="rejilla rejilla--2">
                  <article class="gasto gasto--capex">
                    <h3>CapEx <span>gasto de capital</span></h3>
                    ${barras([100, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7], 'barras--capex')}
                    <p class="gasto__meses">Pago mensual durante un año</p>
                    <p>Compras el equipo <strong>por adelantado</strong>. Pagas mucho al inicio y es tuyo aunque no lo uses.</p>
                    <p class="gasto__ejemplo">Así funciona on-premises.</p>
                  </article>
                  <article class="gasto gasto--opex">
                    <h3>OpEx <span>gasto operativo</span></h3>
                    ${barras([20, 18, 22, 20, 25, 24, 28, 30, 26, 34, 62, 45], 'barras--opex')}
                    <p class="gasto__meses">Pago mensual durante un año</p>
                    <p>Pagas <strong>cada mes lo que usaste</strong>. Nada que comprar al inicio; si dejas de usar, dejas de pagar.</p>
                    <p class="gasto__ejemplo">Así funciona la nube.</p>
                  </article>
                </div>
                ${recuadro('tecnico', 'En contabilidad, el CapEx se registra como una inversión que se deprecia con los años; el OpEx, como un gasto del periodo. Por eso a las áreas de finanzas les importa tanto esta diferencia.')}`,
              notas:
                'La frase para que se lleven: “la nube cambia CapEx por OpEx”. Las barras son ilustrativas, no cifras reales.'
            },
            {
              titulo: 'Las cinco características de la nube',
              html: `
                <p class="entrada">En 2011, el <strong>NIST</strong> (el instituto de estándares de Estados Unidos) publicó la definición de nube más citada. Un servicio es “de nube” si cumple estas cinco:</p>
                <ol class="cinco">
                  <li><strong>Autoservicio bajo demanda.</strong> Pides un servidor en una página web y lo tienes en minutos, sin hablar con nadie.</li>
                  <li><strong>Acceso amplio por red.</strong> Lo usas por internet desde tu laptop, tu celular o tu tablet.</li>
                  <li><strong>Recursos compartidos.</strong> El proveedor reparte sus servidores entre muchos clientes, aislados entre sí: los inquilinos que viste en la clase de virtualización.</li>
                  <li><strong>Elasticidad rápida.</strong> Creces cuando llega mucha gente y encoges cuando se va.</li>
                  <li><strong>Servicio medido.</strong> Se mide lo que consumes y pagas por eso, como el recibo de la luz.</li>
                </ol>
                ${recuadro('consejo', 'Truco para reconocerla: si para tener un servidor tienes que llamar a un vendedor y esperar tres semanas, no es nube.')}`,
              notas:
                'Pide que cada quien diga cuál de las cinco nota más en su vida diaria. Una fácil: el servicio medido de los planes de datos del celular.'
            },
            {
              titulo: '¿Por qué casi todas las empresas ya la usan?',
              html: `
                <div class="rejilla rejilla--3 valores">
                  <div>${icono('dinero')}<strong>Sin inversión inicial</strong><p>Empiezas con casi nada y pagas conforme creces.</p></div>
                  <div>${icono('cohete')}<strong>Velocidad</strong><p>Tienes servidores en minutos, no en semanas.</p></div>
                  <div>${icono('red')}<strong>Escala</strong><p>De 10 a 10&nbsp;000 usuarios sin comprar equipo.</p></div>
                  <div>${icono('mapa')}<strong>Alcance global</strong><p>Regiones en todo el mundo, incluida una en México.</p></div>
                  <div>${icono('engrane')}<strong>Menos mantenimiento</strong><p>El hardware lo cuida el proveedor.</p></div>
                  <div>${icono('escudo')}<strong>Disponibilidad</strong><p>Varios centros de datos por si uno falla.</p></div>
                </div>
                ${recuadro('cuidado', 'La nube no siempre es más barata. Un servidor encendido todo el año sin usarse cobra cada hora. La ventaja es pagar solo lo que usas… si te acuerdas de apagar lo que no usas.')}
                ${nubi('Ahora ponlo a prueba: los dos ejercicios que siguen son rapidísimos.', 'nubi-feliz')}`,
              notas:
                'Deja 20 segundos para que lean. Subraya el recuadro de Cuidado: olvidar apagar recursos es el error más caro de quien empieza.'
            }
          ]
        },
        {
          id: 'c1-valor',
          tipo: 'opcion',
          titulo: 'Valor de la computación en la nube',
          xp: 50,
          minutos: 2,
          contexto:
            '<p>Tres amigos quieren lanzar <strong>Apunta</strong>, una app para compartir apuntes entre estudiantes. No saben si la usarán 50 personas o 50&nbsp;000. Tienen poco dinero y quieren lanzarla el próximo mes.</p>',
          pregunta: '¿Cuál es la principal ventaja de usar la nube en su caso?',
          opciones: [
            {
              texto: 'La nube hace que la app sea gratis para siempre, sin importar cuántos la usen.',
              retro: 'La nube no es gratis: se paga por uso. Hay niveles gratuitos o créditos para empezar, pero tienen límites.'
            },
            {
              texto: 'No invierten al inicio: pagan lo que usen y crecen si la app despega.',
              correcta: true,
              retro: '¡Exacto! Cambian una compra grande e incierta (CapEx) por un pago según el uso (OpEx), y pueden crecer si les va bien.'
            },
            {
              texto: 'Con la nube ya no necesitan programar la app: la plataforma la arma por ellos.',
              retro: 'La nube pone la infraestructura, pero la app la tienen que programar ellos.'
            },
            {
              texto: 'Comprar sus propios servidores sería más rápido para salir el próximo mes.',
              retro: 'Al revés: comprar, recibir e instalar servidores toma semanas. En la nube los tienen en minutos.'
            }
          ],
          pista: 'Piensa en su problema: poco dinero y ninguna idea de cuántos usuarios tendrán.'
        },
        {
          id: 'c1-escalables',
          tipo: 'clasificar',
          titulo: 'Soluciones escalables en la nube',
          xp: 50,
          minutos: 3,
          contexto:
            '<p>Una tienda de tenis en línea debe decidir entre montar sus propios servidores (on-premises) o usar la nube.</p>',
          pregunta: 'Clasifica cada situación: ¿pasa con on-premises o con la nube?',
          grupos: [
            { id: 'onprem', nombre: 'On-premises', color: 'slate' },
            { id: 'nube', nombre: 'Nube', color: 'blue' }
          ],
          fichas: [
            { texto: 'Compran servidores calculando cuánta gente llegará en el Buen Fin.', grupo: 'onprem', retro: 'Comprar por adelantado “por si acaso” es lo típico de on-premises.' },
            { texto: 'Agregan servidores en minutos cuando llega más gente.', grupo: 'nube', retro: 'Tener servidores en minutos es autoservicio y elasticidad: nube.' },
            { texto: 'Pagan solo por las horas que usaron los servidores.', grupo: 'nube', retro: 'Pagar por uso es el servicio medido de la nube.' },
            { texto: 'Esperan tres semanas a que llegue un disco nuevo.', grupo: 'onprem', retro: 'Esperar envíos de equipo es cosa de tener servidores propios.' },
            { texto: 'Apagan los servidores extra el lunes y dejan de pagarlos.', grupo: 'nube', retro: 'Encoger y dejar de pagar solo es posible cuando rentas: nube.' },
            { texto: 'Un técnico de la tienda cambia un disco dañado a las 3 a. m.', grupo: 'onprem', retro: 'Si el hardware es tuyo, las reparaciones también.' }
          ],
          cierre: 'On-premises: compras antes, esperas envíos y reparas tú. Nube: creces en minutos, pagas por uso y dejas de pagar al encoger.',
          pista: 'Pregúntate: ¿el equipo es de la tienda o es rentado por internet?'
        },
        {
          id: 'c1-poder',
          tipo: 'leccion',
          titulo: 'El poder de la nube',
          xp: 50,
          minutos: 5,
          laminas: [
            {
              titulo: 'Escalar: darle más capacidad a tu sistema',
              html: `
                <p class="entrada">Cuando llega más gente, tu sistema necesita más capacidad. Hay dos formas de dársela:</p>
                <div class="rejilla rejilla--2">
                  <article class="escala">
                    <figure class="diagrama diagrama--chico">${SVG_VERTICAL}</figure>
                    <h3>Vertical <span>hacia arriba</span></h3>
                    <p>Una máquina <strong>más grande</strong>: más vCPU y más RAM. Como cambiar tu coche por una camioneta.</p>
                    <p class="sutil">Tiene tope (la máquina más grande que exista) y casi siempre hay que apagarla para cambiarla, como en VirtualBox.</p>
                  </article>
                  <article class="escala">
                    <figure class="diagrama diagrama--chico">${SVG_HORIZONTAL}</figure>
                    <h3>Horizontal <span>hacia afuera</span></h3>
                    <p><strong>Más máquinas</strong> iguales trabajando juntas. Como abrir más cajas en el súper.</p>
                    <p class="sutil">Un <strong>balanceador de carga</strong> reparte a la gente entre ellas. Si una falla, las demás siguen.</p>
                  </article>
                </div>`,
              notas:
                'Pregunta: “¿Qué conviene más para aguantar el Buen Fin?”. La respuesta de la industria: horizontal, porque casi no tiene tope y tolera fallas.'
            },
            {
              titulo: 'Elasticidad: crecer… y también encoger',
              html: `
                <figure class="diagrama diagrama--demanda" data-modo="propio">
                  <div class="alternar" role="group" aria-label="Comparar las dos formas">
                    <button type="button" data-modo-boton="propio" aria-pressed="true">Con servidores propios</button>
                    <button type="button" data-modo-boton="nube" aria-pressed="false">Con la nube</button>
                  </div>
                  ${SVG_DEMANDA}
                  <figcaption>
                    <span class="solo-propio">Compras para el pico: el resto del año pagas equipo ocioso. Y si el pico es más alto de lo que calculaste, el sistema se cae.</span>
                    <span class="solo-nube">La capacidad sigue a la demanda: crece en el Buen Fin y encoge en enero. Pagas lo que usas.</span>
                  </figcaption>
                </figure>
                <div class="rejilla rejilla--2">
                  ${recuadro('recuerda', '<strong>Escalabilidad</strong> es poder crecer. <strong>Elasticidad</strong> es crecer y encoger solo, según la demanda.')}
                  ${recuadro('tecnico', 'Lo hace el <strong>autoescalado</strong>: reglas como “si el CPU pasa de 70&nbsp;% durante 5 minutos, agrega un servidor”.')}
                </div>`,
              notas:
                'Usa el botón para comparar las dos gráficas. La demanda es ilustrativa. Pregunta qué parte de la gráfica le duele más a un dueño: la zona rayada (dinero tirado) o el pico rojo (clientes perdidos).'
            },
            {
              titulo: 'Disponibilidad: que no se caiga',
              html: `
                <p class="entrada">Los proveedores reparten sus centros de datos por el mundo para que una falla no tire todo.</p>
                <div class="rejilla rejilla--2">
                  <div class="definicion"><h3>${icono('mapa')} Región</h3><p>Un lugar del mundo donde el proveedor tiene centros de datos. AWS, Azure y Google Cloud ya tienen una en <strong>Querétaro</strong>.</p></div>
                  <div class="definicion"><h3>${icono('edificio')} Zona de disponibilidad</h3><p>Uno o más centros de datos separados dentro de una región, con su propia luz y su propia red. Si pones tu sistema en dos zonas y una falla, la otra sigue.</p></div>
                </div>
                <div class="rejilla rejilla--2">
                  ${recuadro('tecnico', 'El <strong>SLA</strong> (acuerdo de nivel de servicio) es la promesa por escrito de qué tanto estará disponible un servicio, por ejemplo 99.9&nbsp;% al mes. Si el proveedor no la cumple, te devuelve parte de lo que pagaste en créditos.')}
                  ${recuadro('sabias', '99.9&nbsp;% suena a perfecto, pero permite unos 43 minutos caído al mes.')}
                </div>`,
              notas:
                'Conecta con la clase de IaaS: al crear una VM eliges la región. La región importa por velocidad (latencia) y, como verán en el capítulo 2, por las leyes de datos.'
            },
            {
              titulo: 'Velocidad: de la idea al mercado',
              html: `
                <p class="entrada">El <strong>time to market</strong> es el tiempo entre tener una idea y que tus clientes ya la puedan usar.</p>
                <div class="carrera">
                  <div class="carrera__fila carrera__fila--propio">
                    <span class="carrera__quien">Servidores propios</span>
                    <ol><li>Cotizar</li><li>Comprar</li><li>Esperar el envío</li><li>Instalar</li><li>Configurar</li></ol>
                    <span class="carrera__tiempo">semanas o meses</span>
                  </div>
                  <div class="carrera__fila carrera__fila--nube">
                    <span class="carrera__quien">Nube</span>
                    <ol><li>Crear los recursos en la consola</li></ol>
                    <span class="carrera__tiempo">minutos</span>
                  </div>
                </div>
                <p class="parrafo">Y si la idea no funciona, <strong>apagas todo y dejas de pagar</strong>. Probar ideas se vuelve barato, y eso es lo que más les importa a los negocios.</p>
                ${nubi('Rápida, flexible y sin comprar nada: por eso la nube se volvió la opción normal.', 'nubi-feliz')}`,
              notas:
                'Ejemplo para contar: una cadena de cines quiere probar la venta de boletos por WhatsApp solo en una ciudad durante un mes. En la nube lo monta en días; si funciona, lo extiende; si no, lo apaga.'
            }
          ]
        },
        {
          id: 'c1-velocidad',
          tipo: 'opcion',
          titulo: 'Nube y velocidad del mercado',
          xp: 50,
          minutos: 2,
          contexto:
            '<p>Una cadena de farmacias quiere lanzar en <strong>dos semanas</strong> una app para apartar medicamentos, a tiempo para la temporada de frío. Su área de sistemas calcula que comprar e instalar servidores propios tomaría <strong>tres meses</strong>.</p>',
          pregunta: '¿Qué beneficio de la nube resuelve mejor su problema?',
          opciones: [
            {
              texto: 'La elasticidad, porque la app podrá encoger cuando termine la temporada de frío.',
              retro: 'La elasticidad les servirá después, cuando baje la demanda, pero su problema de hoy es llegar a tiempo.'
            },
            {
              texto: 'La residencia de datos, porque la información se quedaría en México.',
              retro: 'La residencia importa para cumplir leyes, pero no acelera el lanzamiento.'
            },
            {
              texto: 'La velocidad: crean la infraestructura en minutos y lanzan a tiempo.',
              correcta: true,
              retro: 'Correcto. Es el famoso time to market: en la nube no esperas a que llegue el equipo.'
            },
            {
              texto: 'La seguridad, porque el proveedor protege el edificio y los servidores.',
              retro: 'La seguridad del proveedor es importante, pero su problema es el tiempo: tres meses contra dos semanas.'
            }
          ],
          pista: '¿Cuál es su problema principal: el dinero, la seguridad o el tiempo?'
        },
        {
          id: 'c1-trafico',
          tipo: 'clasificar',
          titulo: 'Impacto del aumento del tráfico',
          xp: 50,
          minutos: 3,
          contexto:
            '<p>La página de inscripciones de una universidad se vuelve lentísima el primer día. Su equipo propone varias soluciones.</p>',
          pregunta: 'Clasifica cada solución: ¿escala verticalmente (una máquina más grande) u horizontalmente (más máquinas)?',
          grupos: [
            { id: 'vertical', nombre: 'Vertical', color: 'blue' },
            { id: 'horizontal', nombre: 'Horizontal', color: 'green' }
          ],
          fichas: [
            { texto: 'Cambiar la máquina virtual de 2 a 8 vCPU.', grupo: 'vertical', retro: 'Sigue siendo una sola máquina, solo que más grande: vertical.' },
            { texto: 'Pasar de 2 a 10 servidores detrás de un balanceador de carga.', grupo: 'horizontal', retro: 'Cambió el número de máquinas: horizontal.' },
            { texto: 'Configurar autoescalado para que agregue servidores cuando haya mucha gente.', grupo: 'horizontal', retro: 'El autoescalado agrega o quita máquinas: horizontal.' },
            { texto: 'Subir la RAM del servidor de 8 GB a 32 GB.', grupo: 'vertical', retro: 'Más RAM en la misma máquina: vertical.' },
            { texto: 'Abrir una segunda copia de la página en otra zona de disponibilidad.', grupo: 'horizontal', retro: 'Otra copia es otra máquina más: horizontal.' },
            { texto: 'Mudar la base de datos a una máquina más potente.', grupo: 'vertical', retro: 'Una máquina más potente en lugar de la anterior: vertical.' }
          ],
          cierre: 'Si cambia el tamaño de una máquina, es vertical. Si cambia el número de máquinas, es horizontal.',
          pista: 'Fíjate si cambia el número de máquinas o el tamaño de una sola.'
        },
        {
          id: 'c1-modelos',
          tipo: 'leccion',
          titulo: 'Modelos de servicios en la nube',
          xp: 50,
          minutos: 4,
          laminas: [
            {
              titulo: 'Repaso: ¿quién se encarga de qué?',
              html: `
                <p class="entrada">Ya lo viste en la clase de IaaS, PaaS y SaaS: los modelos de servicio se distinguen por <strong>cuántas capas administras tú</strong>.</p>
                ${pila()}`,
              notas:
                'Es la tabla estrella de la clase pasada. Pide que alguien explique con sus palabras la diferencia entre IaaS y PaaS usando la frontera entre amarillo y color.'
            },
            {
              titulo: 'IaaS, PaaS y SaaS en una frase',
              html: `
                <div class="rejilla rejilla--3">
                  <article class="modelo modelo--iaas">
                    <span class="modelo__sigla">IaaS</span>
                    <h3>Te rentan la infraestructura</h3>
                    <p>Máquinas virtuales, discos y redes. Tú instalas y administras el sistema operativo y todo lo de arriba.</p>
                    <p class="modelo__ejemplos">Amazon EC2 · Azure Virtual Machines · Google Compute Engine</p>
                    <p class="modelo__analogia">${icono('casa')} Departamento vacío</p>
                  </article>
                  <article class="modelo modelo--paas">
                    <span class="modelo__sigla">PaaS</span>
                    <h3>Tú traes tu código</h3>
                    <p>La plataforma lo ejecuta: el sistema operativo, el escalado y el HTTPS van por su cuenta.</p>
                    <p class="modelo__ejemplos">Render · Heroku · Google App Engine · Azure App Service</p>
                    <p class="modelo__analogia">${icono('maleta')} Departamento amueblado</p>
                  </article>
                  <article class="modelo modelo--saas">
                    <span class="modelo__sigla">SaaS</span>
                    <h3>Usas la aplicación terminada</h3>
                    <p>Desde el navegador, sin instalar ni mantener nada.</p>
                    <p class="modelo__ejemplos">Gmail · Microsoft 365 · Zoom · Canva</p>
                    <p class="modelo__analogia">${icono('cama')} Hotel</p>
                  </article>
                </div>
                ${recuadro('sabias', 'Esta misma plataforma es un ejemplo: cuando corre en la laptop del docente es on-premises; cuando corre en Render, es PaaS.')}`,
              notas:
                'Si alguien sigue confundiendo PaaS con SaaS, la pregunta clave es: “¿subes tu código o solo usas la aplicación?”.'
            },
            {
              titulo: '¿Cómo elige una empresa?',
              html: `
                <ol class="decision">
                  <li><span class="decision__pregunta">¿Solo necesitas usar una aplicación que ya existe?</span><span class="decision__modelo decision__modelo--saas">SaaS</span></li>
                  <li><span class="decision__pregunta">¿Vas a programar tu propia aplicación y no quieres administrar servidores?</span><span class="decision__modelo decision__modelo--paas">PaaS</span></li>
                  <li><span class="decision__pregunta">¿Necesitas control total del sistema operativo o un programa con una configuración especial?</span><span class="decision__modelo decision__modelo--iaas">IaaS</span></li>
                </ol>
                <div class="rejilla rejilla--2">
                  ${recuadro('recuerda', 'Más control significa más trabajo; menos trabajo, menos control. No hay un modelo “mejor”: hay uno que le queda a cada necesidad.')}
                  ${recuadro('cuidado', 'Aun en SaaS, tus datos, tus contraseñas y quién tiene acceso siguen siendo tu responsabilidad.')}
                </div>`,
              notas:
                'Antes de los ejercicios, vota a mano alzada con dos ejemplos: Canva (SaaS) y una API publicada en Render (PaaS).'
            }
          ]
        },
        {
          id: 'c1-mejor-modelo',
          tipo: 'opcion',
          titulo: 'Mejor modelo de nube',
          xp: 50,
          minutos: 2,
          contexto:
            '<p>Un equipo de dos desarrolladores terminó su API en Node.js. No saben administrar Linux y no quieren preocuparse por actualizaciones del sistema operativo ni por certificados HTTPS. Solo quieren <strong>subir su código</strong>.</p>',
          pregunta: '¿Qué modelo de servicio les conviene?',
          opciones: [
            {
              texto: 'IaaS',
              retro: 'Con IaaS tendrían que instalar y actualizar el sistema operativo ellos mismos, justo lo que no quieren.'
            },
            {
              texto: 'PaaS',
              correcta: true,
              retro: '¡Eso! Suben su código y la plataforma se encarga del servidor, del sistema operativo y del HTTPS.'
            },
            {
              texto: 'SaaS',
              retro: 'SaaS es usar una aplicación ya hecha. Ellos tienen su propia API que publicar.'
            },
            {
              texto: 'On-premises',
              retro: 'On-premises les daría todavía más trabajo: comprar y cuidar el servidor.'
            }
          ],
          pista: 'Ellos traen su código. ¿Qué modelo pone todo lo demás?'
        },
        {
          id: 'c1-saas',
          tipo: 'clasificar',
          titulo: 'Identificar una empresa SaaS',
          xp: 50,
          minutos: 3,
          contexto:
            '<p>Cambian los nombres, no las ideas. Todos estos son servicios reales que usan millones de personas y empresas.</p>',
          pregunta: 'Clasifica cada producto en su modelo de servicio.',
          grupos: [
            { id: 'iaas', nombre: 'IaaS', color: 'blue' },
            { id: 'paas', nombre: 'PaaS', color: 'green' },
            { id: 'saas', nombre: 'SaaS', color: 'coral' }
          ],
          fichas: [
            { texto: 'Gmail', grupo: 'saas', retro: 'Gmail es una aplicación terminada que usas en el navegador: SaaS.' },
            { texto: 'Amazon EC2', grupo: 'iaas', retro: 'EC2 renta máquinas virtuales: IaaS.' },
            { texto: 'Render', grupo: 'paas', retro: 'En Render conectas tu repositorio y la plataforma ejecuta tu código: PaaS.' },
            { texto: 'Canva', grupo: 'saas', retro: 'Canva se usa tal cual, desde el navegador: SaaS.' },
            { texto: 'Heroku', grupo: 'paas', retro: 'Heroku popularizó el “sube tu código y listo”: PaaS.' },
            { texto: 'Google Compute Engine', grupo: 'iaas', retro: 'Compute Engine son las máquinas virtuales de Google: IaaS.' },
            { texto: 'Zoom', grupo: 'saas', retro: 'Zoom es una aplicación lista para usarse: SaaS.' },
            { texto: 'Google App Engine', grupo: 'paas', retro: 'App Engine ejecuta tu aplicación sin que administres servidores: PaaS.' },
            { texto: 'Azure Virtual Machines', grupo: 'iaas', retro: 'Son las máquinas virtuales de Azure: IaaS.' }
          ],
          cierre: 'IaaS: rentas máquinas (EC2, Compute Engine, Azure Virtual Machines). PaaS: subes tu código (Render, Heroku, App Engine). SaaS: usas la aplicación (Gmail, Canva, Zoom).',
          pista: '¿Lo usas tal cual (SaaS), subes tu código (PaaS) o rentas una máquina (IaaS)?'
        }
      ]
    },

    /* ================================================================ 2 */
    {
      numero: 2,
      titulo: 'Implementación en la nube',
      descripcion:
        'Ya sabes qué es la nube; ahora, dónde vive y bajo qué reglas. Conocerás los modelos de despliegue (pública, privada, híbrida y multinube), cómo la ley de protección de datos cambia las decisiones de infraestructura y quiénes son las personas que hacen realidad un proyecto en la nube.',
      actividades: [
        {
          id: 'c2-despliegue',
          tipo: 'leccion',
          titulo: 'Modelos de despliegue en la nube',
          xp: 50,
          minutos: 5,
          laminas: [
            {
              titulo: 'Qué rentas y dónde vive',
              html: `
                <p class="entrada">El <strong>modelo de servicio</strong> dice <em>qué</em> rentas (IaaS, PaaS o SaaS). El <strong>modelo de despliegue</strong> dice <em>dónde vive</em> la infraestructura y <em>quién más la usa</em>.</p>
                <div class="rejilla rejilla--2 despliegues">
                  <article class="despliegue despliegue--publica"><h3>${icono('nube')} Nube pública</h3><p>Como el <strong>transporte público</strong>: lo comparten muchos, pagas por viaje y el mantenimiento no es tu problema.</p></article>
                  <article class="despliegue despliegue--privada"><h3>${icono('edificio')} Nube privada</h3><p>Como <strong>tu propio coche</strong>: solo tú lo usas y lo configuras a tu gusto, pero lo pagas y lo mantienes completo.</p></article>
                  <article class="despliegue despliegue--hibrida"><h3>${icono('red')} Nube híbrida</h3><p>Llegas en <strong>tu coche a la estación y sigues en metro</strong>: combinas lo propio con lo público.</p></article>
                  <article class="despliegue despliegue--multinube"><h3>${icono('nube')}${icono('nube')} Multinube</h3><p>Pides <strong>Uber o DiDi</strong> según te convenga: varios proveedores públicos a la vez.</p></article>
                </div>`,
              notas:
                'Aclara que son dos preguntas distintas: puedes tener SaaS en una nube pública o IaaS en una nube privada.'
            },
            {
              titulo: 'Nube pública',
              html: `
                <p class="entrada">La infraestructura es <strong>del proveedor</strong> y la comparten <strong>muchos clientes</strong>, cada uno aislado de los demás. La usas por internet y pagas por uso.</p>
                <div class="rejilla rejilla--2">
                  <div class="balanza balanza--pro"><h3>A favor</h3>${lista(['Sin inversión inicial', 'Crece casi sin límite, en minutos', 'El proveedor cuida el hardware'])}</div>
                  <div class="balanza balanza--contra"><h3>En contra</h3>${lista(['Menos control sobre dónde y cómo se guardan las cosas', 'Dependes de las reglas y los precios del proveedor'])}</div>
                </div>
                <p class="parrafo"><strong>Ejemplos:</strong> ${chip('aws', 'AWS')} ${chip('azure', 'Microsoft Azure')} ${chip('gcp', 'Google Cloud')} ${chip('neutro', 'Oracle Cloud')}</p>
                <p class="parrafo"><strong>Ideal para:</strong> startups, tiendas en línea y, en general, casi cualquier empresa.</p>`,
              notas:
                'Recuerda la clase de virtualización: el hipervisor aísla a los inquilinos. Compartir el hardware no significa que otro cliente vea tus datos.'
            },
            {
              titulo: 'Nube privada',
              html: `
                <p class="entrada">Infraestructura de nube para <strong>una sola organización</strong>. Puede estar en su propio centro de datos o en el de un tercero, pero nadie más la usa.</p>
                <div class="rejilla rejilla--2">
                  <div class="balanza balanza--pro"><h3>A favor</h3>${lista(['Control total del hardware y la configuración', 'Más fácil de ajustar a reglas muy estrictas'])}</div>
                  <div class="balanza balanza--contra"><h3>En contra</h3>${lista(['Cara: compras (o rentas en exclusiva) todo el equipo', 'Crece solo hasta donde compraste', 'Necesitas gente que la opere'])}</div>
                </div>
                <p class="parrafo"><strong>Tecnologías típicas:</strong> OpenStack y VMware. <strong>Ideal para:</strong> bancos, gobierno y hospitales grandes con reglas estrictas.</p>
                ${recuadro('cuidado', 'Un servidor en tu oficina no es automáticamente una “nube privada”. Para serlo necesita los rasgos de la nube: autoservicio, elasticidad y servicio medido.')}`,
              notas:
                'Es un error muy común llamar “nube privada” a cualquier servidor propio. La diferencia está en los cinco rasgos del NIST que vieron en el capítulo 1.'
            },
            {
              titulo: 'Nube híbrida y multinube',
              html: `
                <div class="rejilla rejilla--2">
                  <article class="despliegue despliegue--hibrida">
                    <h3>${icono('red')} Nube híbrida</h3>
                    <p>Combina infraestructura <strong>privada o propia</strong> con una <strong>nube pública</strong>, conectadas para trabajar juntas.</p>
                    <p class="despliegue__ejemplo">Un hospital guarda los expedientes en su centro de datos y usa la nube pública para su página web y sus picos de citas.</p>
                    <p class="sutil">Cuando lo propio no alcanza y el excedente se manda a la pública se le llama <em>cloud bursting</em> (desbordamiento a la nube).</p>
                  </article>
                  <article class="despliegue despliegue--multinube">
                    <h3>${icono('nube')}${icono('nube')} Multinube</h3>
                    <p>Usa <strong>dos o más proveedores de nube pública</strong>.</p>
                    <p class="despliegue__ejemplo">La tienda en línea en AWS y el análisis de las ventas en Google Cloud.</p>
                    <p class="sutil">Sirve para aprovechar lo mejor de cada uno y no depender de uno solo, pero suma complejidad: dos consolas, dos facturas, dos formas de hacer las cosas.</p>
                  </article>
                </div>
                ${recuadro('tecnico', 'El NIST define un cuarto modelo: la <strong>nube comunitaria</strong>, compartida por varias organizaciones con necesidades parecidas; por ejemplo, un grupo de universidades.')}`,
              notas:
                'La trampa típica: híbrida NO es “usar dos nubes públicas”. Para que sea híbrida tiene que haber una parte privada o propia.'
            },
            {
              titulo: '¿Cuál conviene?',
              html: `
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col"></th><th scope="col">Pública</th><th scope="col">Privada</th><th scope="col">Híbrida</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Quién la usa</th><td>Muchos clientes</td><td>Una sola organización</td><td>Las dos, conectadas</td></tr>
                      <tr><th scope="row">Inversión inicial</th><td>Casi nada</td><td>Alta</td><td>Media</td></tr>
                      <tr><th scope="row">Control</th><td>Menor</td><td>Total</td><td>Repartido</td></tr>
                      <tr><th scope="row">Crecer</th><td>En minutos</td><td>Hasta donde compraste</td><td>Lo público crece; lo privado, no tanto</td></tr>
                      <tr><th scope="row">Ejemplo</th><td>Una startup</td><td>Un banco</td><td>Un hospital</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('recuerda', 'No es todo o nada: muchas empresas combinan modelos según lo que necesita cada sistema.')}`,
              notas:
                'Deja 30 segundos de lectura en silencio y luego pregunta: “¿Cuál elegirían para la plataforma de esta clase?”.'
            }
          ]
        },
        {
          id: 'c2-privado-publico',
          tipo: 'clasificar',
          titulo: '¿Privado o público?',
          xp: 100,
          minutos: 3,
          contexto:
            '<p>Una consultora le explica a su cliente las diferencias entre nube pública y privada con una lista de afirmaciones.</p>',
          pregunta: 'Clasifica cada afirmación: ¿describe a la nube pública o a la privada?',
          grupos: [
            { id: 'publica', nombre: 'Nube pública', color: 'blue' },
            { id: 'privada', nombre: 'Nube privada', color: 'slate' }
          ],
          fichas: [
            { texto: 'El hardware se comparte con otros clientes, aislados entre sí.', grupo: 'publica', retro: 'Compartir la infraestructura entre muchos clientes es lo que define a la pública.' },
            { texto: 'Solo una organización usa la infraestructura.', grupo: 'privada', retro: 'Una sola organización: nube privada.' },
            { texto: 'Hay que comprar (o rentar en exclusiva) todo el hardware.', grupo: 'privada', retro: 'En la privada el equipo es para ti solo, así que lo pagas completo.' },
            { texto: 'No hay inversión inicial: pagas por hora o por uso.', grupo: 'publica', retro: 'El pago por uso sin inversión inicial es la pública.' },
            { texto: 'Da control total para cumplir reglas muy estrictas.', grupo: 'privada', retro: 'El control total es la gran ventaja de la privada.' },
            { texto: 'Puede crecer casi sin límite en minutos.', grupo: 'publica', retro: 'La privada crece hasta donde compraste; la pública, casi sin límite.' },
            { texto: 'Suele montarse con tecnologías como OpenStack o VMware.', grupo: 'privada', retro: 'OpenStack y VMware son tecnologías típicas para montar nubes privadas.' },
            { texto: 'Ejemplos: AWS, Microsoft Azure y Google Cloud.', grupo: 'publica', retro: 'Son los grandes proveedores de nube pública.' }
          ],
          cierre: 'Pública: compartida, sin inversión inicial y casi sin límite. Privada: de una sola organización, con control total y costo completo.',
          pista: 'Pregúntate: ¿la infraestructura es para muchos clientes o para uno solo?'
        },
        {
          id: 'c2-elige-modelo',
          tipo: 'opcion',
          titulo: 'Elige el mejor modelo',
          xp: 50,
          minutos: 2,
          contexto:
            '<p>Un hospital de Monterrey guarda los expedientes clínicos en su propio centro de datos y no quiere sacarlos de ahí. Pero su página web y su sistema de citas se saturan cada vez que lanza una campaña de vacunación, y quiere que esa parte crezca y encoja según la demanda.</p>',
          pregunta: '¿Qué modelo de despliegue le conviene?',
          opciones: [
            {
              texto: 'Nube pública, migrando todo.',
              retro: 'El hospital quiere que los expedientes se queden en su centro de datos. Mover todo a la pública no respeta esa decisión.'
            },
            {
              texto: 'Nube privada, comprando más servidores para las campañas.',
              retro: 'Funcionaría, pero pagarían todo el año equipo que solo usan durante las campañas.'
            },
            {
              texto: 'Nube híbrida.',
              correcta: true,
              retro: '¡Correcto! Los expedientes se quedan en lo privado y lo que tiene picos (la web y las citas) crece en la pública.'
            },
            {
              texto: 'Multinube.',
              retro: 'Multinube es usar varios proveedores públicos. Aquí la clave es combinar lo propio con lo público.'
            }
          ],
          pista: 'Tiene una parte que no se mueve y otra que necesita elasticidad.'
        },
        {
          id: 'c2-normativa',
          tipo: 'leccion',
          titulo: 'Normativa sobre la nube',
          xp: 50,
          minutos: 5,
          laminas: [
            {
              titulo: 'Tus datos tienen reglas',
              html: `
                <p class="entrada">Guardar datos de personas en la nube no es solo un tema técnico: <strong>es un tema legal</strong>.</p>
                <p class="parrafo">Aunque los datos vivan en los servidores de Amazon, Microsoft o Google, la principal responsable ante la ley es <strong>la empresa que los recabó</strong>: ella decide qué pide, para qué lo usa y con quién lo comparte.</p>
                ${nubi('¿Leíste el aviso que salió cuando te registraste en este curso? Ahí empieza todo.', 'nubi-pensando')}`,
              notas:
                'Muéstrales el aviso del registro: es un aviso de privacidad en versión corta. Pregunta cuántos lo leyeron antes de aceptar.'
            },
            {
              titulo: '¿Qué es un dato personal?',
              html: `
                <p class="entrada">La ley mexicana lo define como <q>cualquier información concerniente a una persona identificada o identificable</q>. En corto: <strong>todo lo que dice quién eres o ayuda a averiguarlo</strong>.</p>
                <div class="semaforo">
                  <div class="semaforo__col semaforo__col--no"><h3>No es dato personal</h3><p>No identifica a nadie.</p>${lista(['El horario de una tienda', 'El total de ventas del mes', 'El precio de un producto'])}</div>
                  <div class="semaforo__col semaforo__col--personal"><h3>Dato personal</h3><p>Dice quién eres.</p>${lista(['Nombre y CURP', 'Correo y teléfono', 'Domicilio, foto y matrícula'])}</div>
                  <div class="semaforo__col semaforo__col--sensible"><h3>Dato sensible</h3><p>Toca lo más íntimo; su mal uso puede discriminarte o ponerte en riesgo grave.</p>${lista(['Origen racial o étnico', 'Estado de salud e información genética', 'Creencias religiosas, filosóficas y morales', 'Opiniones políticas y preferencia sexual'])}</div>
                </div>
                ${recuadro('cuidado', 'Para tratar datos sensibles, la ley pide el consentimiento <strong>expreso y por escrito</strong> de la persona: con firma autógrafa, firma electrónica o un mecanismo de autenticación.')}`,
              notas:
                'La ley dice que la lista de datos sensibles es enunciativa: son ejemplos, no la lista completa. La definición está en el artículo 2 de la LFPDPPP y el consentimiento por escrito, en el artículo 8.'
            },
            {
              titulo: 'La ley en México y en el mundo',
              html: `
                <div class="rejilla rejilla--2">
                  <article class="ley">
                    <span class="ley__lugar">México</span>
                    <h3>Ley Federal de Protección de Datos Personales en Posesión de los Particulares</h3>
                    ${lista([
                      'Versión nueva publicada en el DOF el <strong>20 de marzo de 2025</strong>.',
                      'La autoridad ahora es la <strong>Secretaría Anticorrupción y Buen Gobierno</strong> (antes, el INAI).',
                      '<strong>Aviso de privacidad:</strong> te dice qué datos piden y para qué, desde el momento en que los recaban.',
                      '<strong>Derechos ARCO:</strong> Acceso, Rectificación, Cancelación y Oposición. Ejercerlos es gratis; solo pueden cobrarte copias o envío.'
                    ])}
                  </article>
                  <article class="ley">
                    <span class="ley__lugar">Unión Europea</span>
                    <h3>Reglamento General de Protección de Datos (RGPD o GDPR)</h3>
                    ${lista([
                      'Se aplica desde el <strong>25 de mayo de 2018</strong>.',
                      'También alcanza a empresas de fuera de Europa que ofrecen servicios a personas en la UE.',
                      'Multas de hasta <strong>20 millones de euros o el 4&nbsp;%</strong> de la facturación anual mundial, lo que sea mayor.'
                    ])}
                  </article>
                </div>
                ${recuadro('sabias', 'También hay reglas por sector: HIPAA para los datos de salud en Estados Unidos y PCI DSS, un estándar de la industria, para los pagos con tarjeta.')}`,
              notas:
                'Si alguien pregunta por el INAI: la reforma de 2025 lo extinguió y sus funciones sobre datos personales en manos de particulares pasaron a la Secretaría Anticorrupción y Buen Gobierno.'
            },
            {
              titulo: 'Guarda solo lo necesario, solo el tiempo necesario',
              html: `
                <p class="entrada">La ley mexicana dice que, cuando los datos <strong>dejan de ser necesarios</strong> para las finalidades del aviso de privacidad, <strong>deben suprimirse</strong> (a veces después de un periodo de bloqueo). En Europa a este principio le llaman <em>limitación del plazo de conservación</em>.</p>
                <div class="rejilla rejilla--3 tres-preguntas">
                  <div><span class="numero">1</span><strong>¿Lo necesito?</strong><p>Si no lo vas a usar, no lo pidas.</p></div>
                  <div><span class="numero">2</span><strong>¿Dónde se guarda?</strong><p>La región que eliges decide en qué país viven tus datos.</p></div>
                  <div><span class="numero">3</span><strong>¿Cuándo lo borro?</strong><p>Define el plazo desde el principio.</p></div>
                </div>
                ${recuadro('consejo', 'En la nube puedes automatizarlo con <strong>reglas de ciclo de vida</strong>: por ejemplo, “borra las grabaciones de las cámaras después de 90 días”. Menos datos guardados es menos que se puede filtrar y menos que pagar.')}`,
              notas:
                'El bloqueo es guardar los datos sin usarlos, solo para atender posibles responsabilidades legales, hasta que prescriban; después se suprimen (artículos 2 y 10 de la LFPDPPP).'
            },
            {
              titulo: 'Responsabilidad compartida',
              html: `
                <div class="compartida">
                  <div class="compartida__lado compartida__lado--prov"><h3>El proveedor cuida <em>la</em> nube</h3>${lista(['Edificios y vigilancia', 'Servidores y discos', 'Red y energía', 'El hipervisor'])}</div>
                  <div class="compartida__lado compartida__lado--tu"><h3>Tú cuidas lo que pones <em>en</em> la nube</h3>${lista(['Quién tiene acceso', 'Contraseñas y permisos', 'Qué compartes y con quién', 'Cómo configuras tus servicios'])}</div>
                </div>
                <p class="parrafo">Si un empleado comparte una carpeta de Drive <q>con cualquier persona que tenga el enlace</q> y se filtran datos de clientes, <strong>la culpa no es de Google</strong>.</p>`,
              notas:
                'Conecta con la tabla de capas del capítulo 1: entre más arriba subes (SaaS), menos capas cuidas… pero el acceso y los datos siempre son tuyos.'
            }
          ]
        },
        {
          id: 'c2-limites',
          tipo: 'opcion',
          titulo: 'Límites temporales de almacenamiento de datos',
          xp: 50,
          minutos: 2,
          contexto:
            '<p>Un gimnasio guarda en la nube los datos de todas las personas que alguna vez se inscribieron, incluidas las que cancelaron hace ocho años. “Por si algún día regresan”, dice el gerente.</p>',
          pregunta: 'Según el principio que viste en la lección, ¿qué debería hacer el gimnasio?',
          opciones: [
            {
              texto: 'Suprimir los datos que ya no necesita para la finalidad con que los pidió.',
              correcta: true,
              retro: 'Correcto. Cuando ya no son necesarios, deben suprimirse (a veces después de un periodo de bloqueo).'
            },
            {
              texto: 'Nada: si los datos están cifrados en la nube, pueden guardarse para siempre.',
              retro: 'Cifrar protege los datos, pero no te da permiso de guardarlos para siempre.'
            },
            {
              texto: 'Borrarlos solo si cada persona lo pide por escrito.',
              retro: 'El derecho de cancelación existe, pero el gimnasio no debe esperar a que se lo pidan: tiene que suprimir lo que ya no necesita.'
            },
            {
              texto: 'Pasarlos a un almacenamiento más barato y conservarlos.',
              retro: 'Eso abarata el almacenamiento, pero los datos siguen guardados sin necesidad.'
            }
          ],
          pista: 'La pregunta no es cuánto cuesta guardarlos, sino si todavía los necesita.'
        },
        {
          id: 'c2-datos',
          tipo: 'clasificar',
          titulo: 'Datos personales',
          xp: 100,
          minutos: 3,
          contexto:
            '<p>Una clínica está migrando su sistema a la nube y necesita clasificar la información que guarda para protegerla como corresponde.</p>',
          pregunta: 'Clasifica cada dato según la ley mexicana.',
          grupos: [
            { id: 'no', nombre: 'No es dato personal', color: 'green' },
            { id: 'personal', nombre: 'Dato personal', color: 'yellow' },
            { id: 'sensible', nombre: 'Dato personal sensible', color: 'red' }
          ],
          fichas: [
            { texto: 'Nombre completo del paciente', grupo: 'personal', retro: 'Te identifica directamente: dato personal.' },
            { texto: 'Diagnóstico de diabetes', grupo: 'sensible', retro: 'Revela el estado de salud: dato sensible.' },
            { texto: 'Número total de consultas de marzo', grupo: 'no', retro: 'Es una cifra total que no identifica a nadie: no es dato personal.' },
            { texto: 'CURP', grupo: 'personal', retro: 'La CURP identifica a una persona: dato personal.' },
            { texto: 'Resultado de una prueba genética', grupo: 'sensible', retro: 'La información genética es dato sensible.' },
            { texto: 'Horario de atención de la clínica', grupo: 'no', retro: 'Es información de la clínica, no de una persona.' },
            { texto: 'Teléfono celular del paciente', grupo: 'personal', retro: 'Permite identificar y contactar a alguien: dato personal.' },
            { texto: 'Religión anotada en el expediente', grupo: 'sensible', retro: 'Las creencias religiosas son dato sensible.' }
          ],
          cierre: 'Si identifica a alguien, es dato personal. Si además revela salud, genética, religión, origen, opiniones políticas o preferencia sexual, es sensible. Las cifras totales que no identifican a nadie no son datos personales.',
          pista: 'Primero pregúntate si identifica a alguien. Luego, si toca su salud, su genética o sus creencias.'
        },
        {
          id: 'c2-funciones',
          tipo: 'leccion',
          titulo: 'Funciones de la computación en la nube',
          xp: 50,
          minutos: 4,
          laminas: [
            {
              titulo: 'Detrás de la nube hay personas',
              html: `
                <p class="entrada">Mudarse a la nube no es “subir archivos”. Estos son los roles más comunes; en una empresa pequeña, una sola persona puede tener varios.</p>
                <div class="rejilla rejilla--3 roles">
                  <article class="rol">${icono('mapa')}<h3>Arquitectura de nube</h3><p>Diseña la solución: qué servicios usar, cómo se conectan y cuánto costará. Dibuja el plano.</p></article>
                  <article class="rol">${icono('servidor')}<h3>Ingeniería de nube</h3><p>Construye y opera la infraestructura: redes, máquinas virtuales y bases de datos.</p></article>
                  <article class="rol">${icono('engrane')}<h3>DevOps</h3><p>Automatiza: que cada cambio en el código se pruebe y se publique solo, y que la infraestructura se cree con código.</p></article>
                  <article class="rol">${icono('escudo')}<h3>Seguridad en la nube</h3><p>Decide quién entra a qué, activa el cifrado y revisa que se cumplan las normas.</p></article>
                  <article class="rol">${icono('base-datos')}<h3>Ingeniería de datos</h3><p>Mueve, limpia y organiza los datos para que se puedan analizar.</p></article>
                  <article class="rol">${icono('dinero')}<h3>FinOps</h3><p>Vigila la factura de la nube y encuentra ahorros: apagar lo ocioso y elegir el precio correcto.</p></article>
                </div>`,
              notas:
                'Pregunta: “¿Cuál de estos roles les llama la atención?”. Sirve para conectar la materia con su futuro laboral.'
            },
            {
              titulo: '¿Por dónde se empieza?',
              html: `
                <p class="entrada">Cada proveedor tiene una certificación de entrada. Ninguna exige saber programar:</p>
                <div class="rejilla rejilla--3 certificaciones">
                  <div class="certificacion">${chip('aws', 'AWS')}<h3>AWS Certified Cloud Practitioner</h3></div>
                  <div class="certificacion">${chip('azure', 'Azure')}<h3>Microsoft Certified: Azure Fundamentals (AZ-900)</h3></div>
                  <div class="certificacion">${chip('gcp', 'Google Cloud')}<h3>Google Cloud Digital Leader</h3></div>
                </div>
                <div class="rejilla rejilla--2">
                  ${recuadro('consejo', 'Aprende las ideas, no los botones: las consolas cambian cada año, pero lo que viste hoy te sirve en cualquier nube. Tu tarea de AWS Educate ya es un primer paso.')}
                  ${recuadro('sabias', '<strong>FinOps</strong> junta “finanzas” y “operaciones”. Existe porque en la nube cualquiera puede crear recursos… y cualquiera puede olvidar apagarlos.')}
                </div>`,
              notas:
                'Los precios y los temarios de los exámenes cambian; revisa la página oficial de cada proveedor antes de recomendar una fecha.'
            }
          ]
        },
        {
          id: 'c2-responsabilidad',
          tipo: 'opcion',
          titulo: '¿De quién es la responsabilidad?',
          xp: 50,
          minutos: 2,
          contexto:
            '<p>Una escuela guarda las listas de alumnos en Google Drive (SaaS). Una maestra comparte una carpeta <q>con cualquier persona que tenga el enlace</q>, y el enlace termina publicado en un grupo de Facebook.</p>',
          pregunta: '¿Quién es responsable de esta filtración?',
          opciones: [
            {
              texto: 'Google, porque los datos estaban guardados en sus servidores.',
              retro: 'Google cuida su infraestructura, pero no decide con quién compartes tus archivos.'
            },
            {
              texto: 'Facebook, porque ahí se publicó el enlace de la carpeta.',
              retro: 'Facebook solo fue donde apareció el enlace. El error fue compartir la carpeta con cualquiera.'
            },
            {
              texto: 'Nadie: en la nube la seguridad de los archivos es automática.',
              retro: 'No existe la seguridad automática. La configuración y los permisos los decides tú.'
            },
            {
              texto: 'La escuela: cómo se comparten los datos lo decide el cliente.',
              correcta: true,
              retro: 'Correcto. En la responsabilidad compartida, los permisos y el acceso siempre son del cliente, incluso en SaaS.'
            }
          ],
          pista: 'El proveedor cuida LA nube. ¿Quién cuida lo que se pone EN la nube?'
        },
        {
          id: 'c2-roles',
          tipo: 'clasificar',
          titulo: 'Funciones en la nube',
          xp: 100,
          minutos: 3,
          contexto:
            '<p>Un equipo de nube se reparte el trabajo de la semana. Cada tarea le toca a un rol distinto.</p>',
          pregunta: 'Relaciona cada tarea con el rol que la hace.',
          grupos: [
            { id: 'arquitectura', nombre: 'Arquitectura', color: 'purple' },
            { id: 'devops', nombre: 'DevOps', color: 'blue' },
            { id: 'seguridad', nombre: 'Seguridad', color: 'red' },
            { id: 'finops', nombre: 'FinOps', color: 'green' }
          ],
          fichas: [
            { texto: 'Descubre 20 máquinas virtuales encendidas que nadie usa y propone apagarlas.', grupo: 'finops', retro: 'Encontrar gasto inútil es trabajo de FinOps.' },
            { texto: 'Decide qué servicios usar y cómo se conectan entre sí.', grupo: 'arquitectura', retro: 'Diseñar la solución es arquitectura.' },
            { texto: 'Hace que cada cambio en el código se pruebe y se publique solo.', grupo: 'devops', retro: 'Automatizar pruebas y publicación (CI/CD) es DevOps.' },
            { texto: 'Revisa quién tiene permisos y quita los que sobran.', grupo: 'seguridad', retro: 'Controlar accesos es seguridad.' },
            { texto: 'Crea toda la infraestructura con código para repetirla en minutos.', grupo: 'devops', retro: 'La infraestructura como código es terreno de DevOps.' },
            { texto: 'Dibuja el diagrama de la solución y calcula cuánto costará.', grupo: 'arquitectura', retro: 'El plano y el costo estimado son de arquitectura.' },
            { texto: 'Activa el cifrado de las bases de datos con información de clientes.', grupo: 'seguridad', retro: 'Proteger los datos con cifrado es seguridad.' },
            { texto: 'Cambia los servidores que se usan todo el año a un plan de compromiso más barato.', grupo: 'finops', retro: 'Elegir la forma de pago correcta es FinOps.' }
          ],
          cierre: 'Diseño: arquitectura. Automatización: DevOps. Accesos y cifrado: seguridad. Dinero: FinOps.',
          pista: 'Diseño → arquitectura. Automatizar → DevOps. Accesos → seguridad. Dinero → FinOps.'
        }
      ]
    },

    /* ================================================================ 3 */
    {
      numero: 3,
      titulo: 'Proveedores de la nube y casos prácticos',
      descripcion:
        'Conocerás a los grandes jugadores de la infraestructura en la nube: AWS, Microsoft Azure y Google Cloud. Verás cómo se reparten el mercado, qué servicios ofrecen, qué los distingue y cómo empresas reales como Netflix y Spotify los usan. También, el riesgo de amarrarte a un solo proveedor.',
      actividades: [
        {
          id: 'c3-panorama',
          tipo: 'leccion',
          titulo: 'Una visión general de los proveedores',
          xp: 50,
          minutos: 4,
          laminas: [
            {
              titulo: '¿Quién renta las computadoras del mundo?',
              html: `
                <p class="entrada">Tres empresas concentran cerca del <strong>63&nbsp;%</strong> del mercado mundial de infraestructura en la nube.</p>
                <div class="cuotas" role="img" aria-label="Cuota de mercado: AWS 28 %, Microsoft Azure 20 %, Google Cloud 15 %, todos los demás 37 %">
                  <div class="cuota cuota--aws" style="--v:28"><span class="cuota__nombre">AWS</span><span class="cuota__pista"><span class="cuota__barra"></span></span><span class="cuota__valor">28&nbsp;%</span></div>
                  <div class="cuota cuota--azure" style="--v:20"><span class="cuota__nombre">Microsoft Azure</span><span class="cuota__pista"><span class="cuota__barra"></span></span><span class="cuota__valor">20&nbsp;%</span></div>
                  <div class="cuota cuota--gcp" style="--v:15"><span class="cuota__nombre">Google Cloud</span><span class="cuota__pista"><span class="cuota__barra"></span></span><span class="cuota__valor">15&nbsp;%</span></div>
                  <div class="cuota cuota--otros" style="--v:37"><span class="cuota__nombre">Todos los demás</span><span class="cuota__pista"><span class="cuota__barra"></span></span><span class="cuota__valor">37&nbsp;%</span></div>
                </div>
                <p class="fuente">Fuente: Synergy Research Group, segundo trimestre de 2026. El mercado sumó 143&nbsp;400 millones de dólares en el trimestre, 43&nbsp;% más que un año antes.</p>
                ${recuadro('recuerda', 'La cuota de mercado mide <strong>dinero gastado</strong> en servicios de infraestructura en la nube, no número de usuarios. Cambia cada trimestre.')}`,
              notas:
                'Entre “todos los demás” están Oracle, Alibaba Cloud, IBM y proveedores especializados en GPU para inteligencia artificial.'
            },
            {
              titulo: 'Cambian los nombres, no las ideas',
              html: `
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Lo que necesitas</th><th scope="col">${chip('aws', 'AWS')}</th><th scope="col">${chip('azure', 'Azure')}</th><th scope="col">${chip('gcp', 'Google Cloud')}</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Una máquina virtual</th><td>Amazon EC2</td><td>Azure Virtual Machines</td><td>Compute Engine</td></tr>
                      <tr><th scope="row">Guardar archivos</th><td>Amazon S3</td><td>Azure Blob Storage</td><td>Cloud Storage</td></tr>
                      <tr><th scope="row">Funciones sin servidor</th><td>AWS Lambda</td><td>Azure Functions</td><td>Cloud Run functions</td></tr>
                      <tr><th scope="row">Región en México</th><td>Querétaro, desde 2025</td><td>Querétaro, desde 2024</td><td>Querétaro, desde 2024</td></tr>
                    </tbody>
                  </table>
                </div>
                <p class="parrafo">Los tres cobran por uso y tienen consola web, línea de comandos y niveles gratuitos o créditos para empezar.</p>`,
              notas:
                'Es el diccionario de la clase de IaaS, resumido. Pregunta rápida: “¿Cómo se llama la máquina virtual en Google Cloud?” (Compute Engine).'
            },
            {
              titulo: 'El riesgo de la dependencia del proveedor',
              html: `
                <p class="entrada">La <strong>dependencia del proveedor</strong> (<em>vendor lock-in</em>) ocurre cuando cambiarte de nube sale tan caro o tan difícil que, en la práctica, ya no puedes irte.</p>
                <div class="rejilla rejilla--2">
                  <div class="balanza balanza--contra"><h3>De dónde viene</h3>${lista(['Servicios que solo existen en esa nube', 'Formatos y herramientas propias', 'Costos por sacar tus datos', 'Un equipo que solo sabe usar ese proveedor', 'Contratos de varios años'])}</div>
                  <div class="balanza balanza--pro"><h3>Cómo reducirla</h3>${lista(['Estándares abiertos: contenedores, Kubernetes, PostgreSQL', 'Infraestructura como código', 'Un plan de salida desde el inicio', 'Multinube, con cuidado: suma complejidad'])}</div>
                </div>
                ${recuadro('sabias', 'En 2024, Google Cloud, AWS y Microsoft Azure anunciaron que dejarían de cobrar la salida de datos a quien se muda de forma definitiva a otro proveedor, con condiciones. Lo hicieron, en parte, por una ley europea: la <em>Data Act</em>.')}`,
              notas:
                'La dependencia no siempre es mala: los servicios exclusivos suelen ser los más cómodos. Lo importante es elegirla sabiendo lo que implica.'
            }
          ]
        },
        {
          id: 'c3-tres-grandes',
          tipo: 'clasificar',
          titulo: 'Los tres grandes',
          xp: 100,
          minutos: 2,
          contexto: '<p>Cada proveedor tiene su historia y su personalidad.</p>',
          pregunta: '¿Quién es quién? Relaciona cada dato con su proveedor.',
          grupos: [
            { id: 'aws', nombre: 'AWS', color: 'aws' },
            { id: 'azure', nombre: 'Microsoft Azure', color: 'azure' },
            { id: 'gcp', nombre: 'Google Cloud', color: 'gcp' }
          ],
          fichas: [
            { texto: 'Aquí nació Kubernetes.', grupo: 'gcp', retro: 'Kubernetes lo creó Google y lo liberó como código abierto en 2014.' },
            { texto: 'Fue la pionera: arrancó en 2006 con S3 y EC2.', grupo: 'aws', retro: 'AWS lanzó Amazon S3 y Amazon EC2 en 2006.' },
            { texto: 'Nació en 2010 con el nombre de Windows Azure.', grupo: 'azure', retro: 'Microsoft la lanzó como Windows Azure y la renombró en 2014.' },
            { texto: 'Tiene la mayor cuota del mercado: 28 %.', grupo: 'aws', retro: 'AWS lidera con 28 % (Synergy, 2.º trimestre de 2026).' },
            { texto: 'Su almacén de datos BigQuery es famoso para la analítica.', grupo: 'gcp', retro: 'BigQuery es de Google Cloud.' },
            { texto: 'Se integra con Microsoft 365, Windows Server y Microsoft Entra ID.', grupo: 'azure', retro: 'La integración con el mundo Microsoft es la fuerza de Azure.' }
          ],
          cierre: 'AWS: la pionera y la más grande. Azure: el mundo Microsoft. Google Cloud: datos, contenedores e IA.',
          pista: 'Piensa en la empresa madre: una tienda en línea, la de Windows y la del buscador.'
        },
        {
          id: 'c3-dependencia',
          tipo: 'opcion',
          titulo: 'El riesgo de la dependencia del proveedor',
          xp: 50,
          minutos: 2,
          contexto:
            '<p>Una startup construyó su app con una base de datos, un sistema de colas y un servicio de IA que <strong>solo existen en un proveedor</strong>. Tres años después, otra nube le ofrece un precio 30&nbsp;% menor, pero mudarse implicaría reescribir buena parte de la app.</p>',
          pregunta: '¿Cómo se llama el problema en el que está la startup?',
          opciones: [
            {
              texto: 'Dependencia del proveedor (vendor lock-in).',
              correcta: true,
              retro: 'Exacto: cambiarse es tan caro que, en la práctica, está amarrada a su proveedor.'
            },
            {
              texto: 'Falta de elasticidad.',
              retro: 'Su app puede crecer y encoger sin problema; lo difícil es irse.'
            },
            {
              texto: 'Nube híbrida.',
              retro: 'Híbrida es combinar lo propio con lo público. Aquí todo está en un solo proveedor.'
            },
            {
              texto: 'Residencia de datos.',
              retro: 'La residencia es dónde se guardan los datos; no explica por qué es difícil mudarse.'
            }
          ],
          pista: '¿Qué le impide aceptar la oferta más barata?'
        },
        {
          id: 'c3-aws',
          tipo: 'leccion',
          titulo: 'Amazon Web Services',
          xp: 50,
          minutos: 3,
          laminas: [
            {
              titulo: 'AWS, la pionera',
              html: `
                <div class="proveedor">
                  <div class="proveedor__ficha">
                    ${chip('aws', 'Amazon Web Services')}
                    <dl class="datos">
                      <div><dt>Empresa</dt><dd>Amazon</dd></div>
                      <div><dt>Desde</dt><dd>2006, con Amazon S3 y Amazon EC2</dd></div>
                      <div><dt>Cuota</dt><dd>28&nbsp;%, la mayor</dd></div>
                      <div><dt>En México</dt><dd>Región en Querétaro desde enero de 2025</dd></div>
                    </dl>
                    <p>Conocida por ser la pionera y tener el catálogo de servicios más amplio, con una comunidad enorme.</p>
                  </div>
                  <ul class="servicios">
                    <li><strong>Amazon EC2</strong><span>Máquinas virtuales (IaaS).</span></li>
                    <li><strong>Amazon S3</strong><span>Guardar archivos de cualquier tamaño.</span></li>
                    <li><strong>Amazon RDS</strong><span>Bases de datos relacionales administradas: MySQL, PostgreSQL y otras.</span></li>
                    <li><strong>AWS Lambda</strong><span>Funciones sin servidor: tu código corre solo cuando pasa algo.</span></li>
                  </ul>
                </div>`,
              notas:
                'Es la nube de su tarea de AWS Educate. EC2 es exactamente lo que practicaron en “Getting Started with Compute”.'
            },
            {
              titulo: 'Caso: Netflix se muda a AWS',
              html: `
                <ol class="linea-tiempo">
                  <li><span class="linea-tiempo__fecha">Agosto de 2008</span><p>Una base de datos se corrompe y durante <strong>tres días</strong> Netflix no puede enviar DVD a sus clientes.</p></li>
                  <li><span class="linea-tiempo__fecha">La decisión</span><p>Dejar los sistemas grandes con un solo punto de falla y pasar a sistemas distribuidos en la nube que <strong>escalan horizontalmente</strong>.</p></li>
                  <li><span class="linea-tiempo__fecha">Siete años de trabajo</span><p>No copian sus servidores: <strong>reconstruyen casi toda su tecnología</strong>, de una aplicación monolítica a cientos de microservicios.</p></li>
                  <li><span class="linea-tiempo__fecha">Enero de 2016</span><p>Terminan de mudar su servicio de streaming a AWS.</p></li>
                </ol>
                <p class="parrafo"><strong>Lo que reportó Netflix:</strong> ocho veces más suscriptores de streaming que en 2008, una disponibilidad cercana a su meta de “cuatro nueves” (99.99&nbsp;%) y un costo por reproducción que terminó siendo una fracción del de su centro de datos.</p>
                <p class="fuente">Fuente: blog de Netflix, “Completing the Netflix Cloud Migration”, febrero de 2016.</p>
                ${recuadro('tecnico', 'Mudarse copiando los servidores tal cual a máquinas virtuales se llama <strong>levantar y mover</strong> (<em>lift and shift</em>). Netflix hizo lo contrario: rediseñó su sistema para la nube. A eso se le llama ser <strong>nativo de la nube</strong> (<em>cloud native</em>).')}`,
              notas:
                'Pregunta: “¿Qué tiene que ver esto con el escalamiento horizontal del capítulo 1?”. Todo: Netflix pasó de crecer hacia arriba a crecer hacia afuera.'
            }
          ]
        },
        {
          id: 'c3-netflix',
          tipo: 'opcion',
          titulo: 'Caso Netflix',
          xp: 50,
          minutos: 2,
          contexto:
            '<p>En 2008, una base de datos corrupta dejó a Netflix tres días sin poder enviar DVD. La empresa decidió mudarse a AWS y rediseñar su sistema.</p>',
          pregunta: '¿Qué problema de fondo quería resolver Netflix con la nube?',
          opciones: [
            {
              texto: 'Que sus películas se vieran con mejor calidad de imagen.',
              retro: 'La calidad de imagen depende de cómo se codifica el video, no de mudarse a la nube.'
            },
            {
              texto: 'Pagar menos por las licencias del software de oficina de sus empleados.',
              retro: 'El caso trata de su plataforma de streaming, no del software de oficina.'
            },
            {
              texto: 'Tener un solo punto de falla que, al romperse, tiraba todo el servicio.',
              correcta: true,
              retro: 'Correcto. Pasó de sistemas grandes que escalaban verticalmente a sistemas distribuidos que escalan horizontalmente.'
            },
            {
              texto: 'Cumplir una ley que le prohibía tener centros de datos propios.',
              retro: 'No existía una ley así: fue una decisión técnica y de negocio.'
            }
          ],
          pista: 'Recuerda qué pasó en 2008 con UNA base de datos.'
        },
        {
          id: 'c3-azure',
          tipo: 'leccion',
          titulo: 'Microsoft Azure',
          xp: 50,
          minutos: 3,
          laminas: [
            {
              titulo: 'Azure, la nube del mundo Microsoft',
              html: `
                <div class="proveedor">
                  <div class="proveedor__ficha">
                    ${chip('azure', 'Microsoft Azure')}
                    <dl class="datos">
                      <div><dt>Empresa</dt><dd>Microsoft</dd></div>
                      <div><dt>Desde</dt><dd>2010, como Windows Azure; desde 2014 se llama Microsoft Azure</dd></div>
                      <div><dt>Cuota</dt><dd>20&nbsp;%</dd></div>
                      <div><dt>En México</dt><dd>Región “Mexico Central”, en Querétaro, desde 2024</dd></div>
                    </dl>
                    <p>Conocida por integrarse con lo que muchas empresas ya usan —Windows Server, SQL Server, Microsoft 365 y Microsoft Entra ID (antes Azure Active Directory)— y por su fuerza en nube híbrida.</p>
                  </div>
                  <ul class="servicios">
                    <li><strong>Azure Virtual Machines</strong><span>Máquinas virtuales.</span></li>
                    <li><strong>Azure App Service</strong><span>Publicar aplicaciones web subiendo tu código (PaaS).</span></li>
                    <li><strong>Azure Blob Storage</strong><span>Guardar archivos.</span></li>
                    <li><strong>Azure SQL Database</strong><span>Base de datos SQL Server administrada.</span></li>
                    <li><strong>Azure Functions</strong><span>Funciones sin servidor.</span></li>
                    <li><strong>Microsoft Entra ID</strong><span>Cuentas e inicio de sesión de toda la empresa.</span></li>
                  </ul>
                </div>`,
              notas:
                'Si la escuela les da cuenta de Microsoft 365, ya usan Entra ID sin saberlo: es lo que valida su correo y su contraseña.'
            },
            {
              titulo: '¿Por qué la elige una empresa?',
              html: `
                <div class="rejilla rejilla--2">
                  <article class="razon">${icono('llave')}<h3>Reutiliza sus licencias</h3><p>Si una empresa ya pagó licencias de Windows Server o SQL Server, con ciertas condiciones puede usarlas en Azure y pagar menos por hora. Se llama <strong>Azure Hybrid Benefit</strong>.</p></article>
                  <article class="razon">${icono('usuario')}<h3>Una sola cuenta</h3><p>Sus empleados ya entran a Microsoft 365; con Entra ID usan esa misma cuenta para las aplicaciones en la nube.</p></article>
                </div>
                ${recuadro('consejo', 'La mejor nube no es la más grande: es la que encaja con lo que ya tienes y con lo que sabe hacer tu equipo.')}`,
              notas:
                'Ejemplo típico: una aseguradora con 20 años de sistemas en Windows Server y SQL Server. Para ella, Azure suele ser el camino con menos fricción.'
            }
          ]
        },
        {
          id: 'c3-servicio-azure',
          tipo: 'clasificar',
          titulo: '¿Qué servicio elegir?',
          xp: 100,
          minutos: 2,
          contexto: '<p>Una aseguradora se muda a Azure. Tiene cinco necesidades.</p>',
          pregunta: 'Relaciona cada necesidad con el servicio de Azure que la resuelve.',
          grupos: [
            { id: 'vm', nombre: 'Azure Virtual Machines', color: 'azure' },
            { id: 'app', nombre: 'Azure App Service', color: 'green' },
            { id: 'blob', nombre: 'Azure Blob Storage', color: 'slate' },
            { id: 'functions', nombre: 'Azure Functions', color: 'purple' },
            { id: 'entra', nombre: 'Microsoft Entra ID', color: 'yellow' }
          ],
          fichas: [
            { texto: 'Guardar millones de fotos de siniestros.', grupo: 'blob', retro: 'Guardar archivos es almacenamiento de objetos: Blob Storage.' },
            { texto: 'Correr su sistema viejo, que necesita Windows Server con una configuración especial.', grupo: 'vm', retro: 'Control total del sistema operativo: una máquina virtual (IaaS).' },
            { texto: 'Que los empleados entren a todo con su cuenta de la empresa.', grupo: 'entra', retro: 'Las identidades y el inicio de sesión son Entra ID.' },
            { texto: 'Publicar su portal de clientes subiendo solo el código.', grupo: 'app', retro: 'Subir solo el código es PaaS: App Service.' },
            { texto: 'Ejecutar un código cada vez que llega una foto nueva, sin administrar servidores.', grupo: 'functions', retro: 'Código que corre ante un evento, sin servidores: Azure Functions.' }
          ],
          cierre: 'Máquina con control total: Virtual Machines. Subir código: App Service. Archivos: Blob Storage. Código ante un evento: Functions. Cuentas: Entra ID.',
          pista: 'Busca las palabras clave: “Windows Server”, “subiendo el código”, “fotos”, “cada vez que llega” y “cuenta”.'
        },
        {
          id: 'c3-google',
          tipo: 'leccion',
          titulo: 'Google Cloud',
          xp: 50,
          minutos: 3,
          laminas: [
            {
              titulo: 'Google Cloud: datos, contenedores e IA',
              html: `
                <div class="proveedor">
                  <div class="proveedor__ficha">
                    ${chip('gcp', 'Google Cloud')}
                    <dl class="datos">
                      <div><dt>Empresa</dt><dd>Google</dd></div>
                      <div><dt>Desde</dt><dd>2008, con Google App Engine</dd></div>
                      <div><dt>Cuota</dt><dd>15&nbsp;%</dd></div>
                      <div><dt>En México</dt><dd>Región en Querétaro desde 2024</dd></div>
                    </dl>
                    <p>Conocida por los datos y la analítica, los contenedores (Kubernetes nació en Google) y la inteligencia artificial, incluidos sus propios chips para IA: las TPU.</p>
                  </div>
                  <ul class="servicios">
                    <li><strong>Compute Engine</strong><span>Máquinas virtuales.</span></li>
                    <li><strong>Cloud Storage</strong><span>Guardar archivos.</span></li>
                    <li><strong>Cloud Run</strong><span>Correr contenedores sin administrar servidores.</span></li>
                    <li><strong>BigQuery</strong><span>Almacén de datos para analizar volúmenes enormes con SQL.</span></li>
                    <li><strong>Google Kubernetes Engine</strong><span>Kubernetes administrado (GKE).</span></li>
                  </ul>
                </div>`,
              notas:
                'Kubernetes lo liberó Google como código abierto en 2014 y hoy lo usan las tres nubes. Es un buen ejemplo de estándar abierto contra la dependencia del proveedor.'
            },
            {
              titulo: 'Caso: Spotify deja sus centros de datos',
              html: `
                <ol class="linea-tiempo">
                  <li><span class="linea-tiempo__fecha">Hasta 2016</span><p>Spotify opera sus propios centros de datos.</p></li>
                  <li><span class="linea-tiempo__fecha">Febrero de 2016</span><p>Anuncia que moverá su infraestructura a <strong>Google Cloud</strong>.</p></li>
                  <li><span class="linea-tiempo__fecha">2016 a 2018</span><p>Migra cerca de <strong>1&nbsp;200 microservicios</strong> y unos <strong>20&nbsp;000 trabajos de datos diarios</strong>. A mediados de 2018 ya había cerrado dos de sus cuatro centros de datos.</p></li>
                </ol>
                <blockquote class="cita">
                  <p>Lo que de verdad queremos en Spotify es ser el mejor servicio de música del mundo, y nada del trabajo en centros de datos contribuye directamente a eso.</p>
                  <cite>Ramon van Alteren, director de ingeniería de Spotify, en Computerworld (2018). Traducción libre.</cite>
                </blockquote>
                <p class="parrafo">Además, eligió Google por sus herramientas de datos, como BigQuery.</p>`,
              notas:
                'La idea para llevarse: la nube deja que una empresa se enfoque en su negocio y no en administrar edificios llenos de servidores.'
            }
          ]
        },
        {
          id: 'c3-spotify',
          tipo: 'opcion',
          titulo: 'Caso Spotify',
          xp: 50,
          minutos: 2,
          contexto:
            '<p>En 2016, Spotify anunció que dejaría sus centros de datos para mudarse a Google Cloud.</p>',
          pregunta: '¿Cuál fue la razón principal de Spotify para dejar sus centros de datos?',
          opciones: [
            {
              texto: 'En la nube ya no necesitaría contratar ingenieros de software propios.',
              retro: 'Spotify siguió teniendo muchísimos ingenieros; solo dejaron de dedicarse a los centros de datos.'
            },
            {
              texto: 'Que sus canciones aparecieran mejor posicionadas en el buscador de Google.',
              retro: 'Mudarse a Google Cloud no cambia los resultados del buscador.'
            },
            {
              texto: 'Una ley europea le prohibió seguir operando centros de datos propios.',
              retro: 'No hubo tal ley: fue una decisión de negocio.'
            },
            {
              texto: 'Enfocarse en su servicio de música, no en administrar centros de datos.',
              correcta: true,
              retro: 'Exacto: administrar centros de datos no los acercaba a su meta. Además, les atraían las herramientas de datos de Google.'
            }
          ],
          pista: 'Piensa en la frase de su director de ingeniería.'
        },
        {
          id: 'c3-vf',
          tipo: 'clasificar',
          titulo: '¿Verdadero o falso?',
          xp: 100,
          minutos: 2,
          contexto: '<p>Repaso relámpago de todo el capítulo.</p>',
          pregunta: 'Decide si cada afirmación es verdadera o falsa.',
          grupos: [
            { id: 'v', nombre: 'Verdadero', color: 'green' },
            { id: 'f', nombre: 'Falso', color: 'red' }
          ],
          fichas: [
            { texto: 'AWS, Azure y Google Cloud tienen región de nube en Querétaro.', grupo: 'v', retro: 'Verdadero: las tres abrieron región en Querétaro entre 2024 y 2025.' },
            { texto: 'La cuota de mercado mide cuántos usuarios tiene cada proveedor.', grupo: 'f', retro: 'Falso: mide dinero gastado, no usuarios.' },
            { texto: 'La nube siempre es más barata que tener servidores propios.', grupo: 'f', retro: 'Falso: si dejas recursos encendidos sin usarlos, puede salir más cara.' },
            { texto: 'Kubernetes nació en Google.', grupo: 'v', retro: 'Verdadero: Google lo creó y lo liberó en 2014.' },
            { texto: 'Si usas SaaS, el proveedor decide con quién compartes tus archivos.', grupo: 'f', retro: 'Falso: los permisos y el acceso siempre son del cliente.' },
            { texto: 'Microsoft Azure se lanzó con el nombre de Windows Azure.', grupo: 'v', retro: 'Verdadero: se renombró Microsoft Azure en 2014.' },
            { texto: 'Usar AWS y Google Cloud al mismo tiempo se llama nube privada.', grupo: 'f', retro: 'Falso: usar dos nubes públicas se llama multinube.' },
            { texto: 'Netflix tardó siete años en completar su migración a AWS.', grupo: 'v', retro: 'Verdadero: de 2008 a enero de 2016.' }
          ],
          cierre: 'Cuatro verdaderas y cuatro falsas. Si fallaste alguna, vuelve a la lección de ese tema antes de la práctica.',
          pista: 'Hay cuatro verdaderas y cuatro falsas.'
        },
        {
          id: 'c3-servicios',
          tipo: 'clasificar',
          titulo: 'Los proveedores de la nube y sus servicios',
          xp: 100,
          minutos: 2,
          contexto: '<p>Cambian los nombres, no las ideas: cada nube tiene su versión de los mismos servicios.</p>',
          pregunta: 'Clasifica cada servicio según lo que hace.',
          grupos: [
            { id: 'vm', nombre: 'Máquinas virtuales', color: 'blue' },
            { id: 'archivos', nombre: 'Guardar archivos', color: 'slate' },
            { id: 'funciones', nombre: 'Funciones sin servidor', color: 'purple' }
          ],
          fichas: [
            { texto: 'Amazon EC2', grupo: 'vm', retro: 'EC2 son las máquinas virtuales de AWS.' },
            { texto: 'AWS Lambda', grupo: 'funciones', retro: 'Lambda ejecuta funciones sin servidor.' },
            { texto: 'Azure Blob Storage', grupo: 'archivos', retro: 'Blob Storage guarda archivos en Azure.' },
            { texto: 'Compute Engine', grupo: 'vm', retro: 'Compute Engine son las máquinas virtuales de Google Cloud.' },
            { texto: 'Cloud Storage', grupo: 'archivos', retro: 'Cloud Storage guarda archivos en Google Cloud.' },
            { texto: 'Azure Functions', grupo: 'funciones', retro: 'Azure Functions ejecuta funciones sin servidor.' },
            { texto: 'Amazon S3', grupo: 'archivos', retro: 'S3 guarda archivos en AWS.' },
            { texto: 'Azure Virtual Machines', grupo: 'vm', retro: 'Son las máquinas virtuales de Azure.' },
            { texto: 'Cloud Run functions', grupo: 'funciones', retro: 'Cloud Run functions ejecuta funciones sin servidor en Google Cloud.' }
          ],
          cierre: 'Máquinas virtuales: EC2, Azure Virtual Machines y Compute Engine. Archivos: S3, Blob Storage y Cloud Storage. Funciones: Lambda, Azure Functions y Cloud Run functions.',
          pista: 'EC2, Virtual Machines y Compute Engine son la misma idea con tres nombres.'
        },
        {
          id: 'c3-enhorabuena',
          tipo: 'leccion',
          titulo: '¡Enhorabuena!',
          xp: 50,
          minutos: 2,
          laminas: [
            {
              titulo: 'Mira todo lo que ya sabes',
              html: `
                <div class="repaso">
                  <div class="repaso__capitulo"><span class="repaso__numero">1</span>${lista([
                    'La nube: computadoras de alguien más, por internet, pagando por uso.',
                    'Los cinco rasgos del NIST y el cambio de CapEx a OpEx.',
                    'Escalar vertical y horizontalmente, elasticidad, disponibilidad y velocidad.',
                    'IaaS, PaaS y SaaS: cuánto administras tú.'
                  ])}</div>
                  <div class="repaso__capitulo"><span class="repaso__numero">2</span>${lista([
                    'Nube pública, privada, híbrida y multinube.',
                    'Datos personales y sensibles, aviso de privacidad y derechos ARCO.',
                    'Guardar solo lo necesario y la responsabilidad compartida.',
                    'Los roles de un equipo de nube.'
                  ])}</div>
                  <div class="repaso__capitulo"><span class="repaso__numero">3</span>${lista([
                    'AWS, Azure y Google Cloud: cambian los nombres, no las ideas.',
                    'Los casos de Netflix y Spotify.',
                    'El riesgo de depender de un solo proveedor.'
                  ])}</div>
                </div>`,
              notas: 'Pregunta qué tema se les hizo más difícil: es el que conviene repasar antes de abrir la práctica.'
            },
            {
              titulo: 'Ahora, demuéstralo',
              html: `
                <div class="reto">
                  ${nubi('¡Llegaste al final! Ahora te toca demostrar lo que aprendiste.', 'nubi-feliz')}
                  <div class="reto__texto">
                    <h3>Práctica final: Panaderías Doña Rosca</h3>
                    ${lista([
                      'El caso de una empresa que quiere mudarse a la nube.',
                      '20 preguntas, unos 20 minutos.',
                      'Una sola entrega: revisa antes de enviar.',
                      'Tu docente la abre cuando todo el grupo está listo.'
                    ])}
                  </div>
                </div>`,
              notas: 'Si todos llegaron aquí, abre la práctica desde el panel docente (pestaña “Práctica final”).'
            }
          ]
        }
      ]
    }
  ]
};

/* ------------------------------------------------------------ el plan */

// Lo que ve el docente en la pestaña "Plan de la clase". Minutos desde el
// inicio; la suma de los `minutos` de cada capítulo cabe en su bloque.
export const PLAN = [
  {
    desde: 0,
    hasta: 7,
    titulo: 'Arranque',
    pasos: [
      'Proyecta la pantalla de conexión de la plataforma (el QR) para que todos entren.',
      'Que abran “Comprender la computación en la nube” y se registren.',
      'Pregunta detonadora: “¿Quién usó la nube hoy antes de llegar a clase?”.'
    ],
    vigila: 'En “Avance en vivo”, espera a que casi todo el grupo aparezca registrado.'
  },
  {
    desde: 7,
    hasta: 36,
    titulo: 'Capítulo 1 · Introducción',
    capitulo: 1,
    pasos: [
      'Proyecta cada lección y explícala; los alumnos pueden seguirla en su celular.',
      'Los ejercicios los resuelven solos: dos o tres minutos cada uno.',
      'Pregunta clave: “¿Por qué se cae la página de inscripciones el primer día?”.'
    ],
    vigila: 'Avanza a la siguiente lección cuando la mayoría haya terminado el ejercicio.'
  },
  {
    desde: 36,
    hasta: 65,
    titulo: 'Capítulo 2 · Implementación',
    capitulo: 2,
    pasos: [
      'En la lección de despliegue, insiste en que híbrida no es “dos nubes públicas”.',
      'En la de normativa, pregunta quién leyó el aviso de privacidad al registrarse.',
      'Cierra con los roles: “¿Cuál les llama la atención?”.'
    ],
    vigila: 'Revisa quién va atrasado y acércate a ayudar.'
  },
  {
    desde: 65,
    hasta: 94,
    titulo: 'Capítulo 3 · Proveedores y casos',
    capitulo: 3,
    pasos: [
      'Casos Netflix y Spotify: pide que alguien explique qué ganó cada empresa.',
      'El verdadero o falso es un buen termómetro antes de la práctica.',
      'En “¡Enhorabuena!”, pregunta qué tema se les hizo más difícil y repásalo.'
    ],
    vigila: 'Cuando casi todos terminen el capítulo, abre la práctica.'
  },
  {
    desde: 94,
    hasta: 115,
    titulo: 'Práctica final',
    pasos: [
      'Abre la práctica en la pestaña “Práctica final”.',
      '20 preguntas, unos 20 minutos, una sola entrega.',
      'No proyectes este panel mientras contestan: muestra nombres y calificaciones.'
    ],
    vigila: 'Sigue las entregas en vivo. Si alguien tiene un problema real, puedes permitirle un reintento.'
  },
  {
    desde: 115,
    hasta: 120,
    titulo: 'Cierre',
    pasos: [
      'Cierra la práctica.',
      'Proyecta el repaso de las preguntas más falladas: no muestra nombres.',
      'Descarga el CSV antes de apagar la laptop.'
    ],
    vigila: 'Si la plataforma corre en Render, el plan gratis borra los datos al dormirse: descarga primero.'
  }
];
