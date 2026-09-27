// ---------------------------------------------------------------------------
// RUTA AWS CLOUD PRACTITIONER · SESIÓN 1
//
// Mismo motor que el curso "Comprender la computación en la nube": lecciones,
// ejercicios con XP y un examen final calificado en el servidor. Lo nuevo es la
// actividad 'laboratorio': pasos exactos para hacerlo en la consola de AWS del
// sandbox de DataCamp, con un contador de minutos y tokens.
//
// Tipos de actividad:
//   'leccion'     — láminas que el docente proyecta y el alumno repasa.
//   'opcion'      — opción múltiple con una sola respuesta correcta.
//   'clasificar'  — mandar cada ficha a su grupo (también sirve para V/F).
//   'laboratorio' — pasos en la consola de AWS; cada paso se marca al hacerlo.
//
// Los nombres de botones de la consola van en inglés, como los ve el alumno, y
// su traducción entre paréntesis. Datos del examen verificados en septiembre de
// 2026 (guía oficial del CLF-C02).
// ---------------------------------------------------------------------------

/* ------------------------------------------------------------ piezas */

const ICONO_RECUADRO = { recuerda: 'foco', consejo: 'check', cuidado: 'alerta', tecnico: 'engrane', sabias: 'estrella', examen: 'insignia' };
const ETIQUETA_RECUADRO = {
  recuerda: 'Recuerda',
  consejo: 'Consejo',
  cuidado: 'Cuidado',
  tecnico: 'Cosas técnicas',
  sabias: '¿Sabías que?',
  examen: 'Así lo pregunta el examen'
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

const lista = (elementos) => `<ul>${elementos.map((e) => `<li>${e}</li>`).join('')}</ul>`;

// Un botón de la consola de AWS, dibujado para que el alumno lo reconozca.
const boton = (texto, traduccion) =>
  `<span class="consola-boton">${texto}</span>${traduccion ? ` <span class="traduccion">(${traduccion})</span>` : ''}`;

// Un bloque de código con botón de copiar (el botón lo agrega app.js).
const codigo = (texto) => `<pre class="codigo"><code>${texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;

/* ------------------------------------------------------------ el sandbox */

// Los números de la cuenta del docente: 10 000 tokens a la semana rinden unas
// 5.5 horas de AWS. Si cambian, se ajustan aquí y todo lo demás se recalcula.
export const SANDBOX = {
  tokensSemana: 10000,
  minutosSemana: 330,
  minutosLaboratorio: 45
};

/* ------------------------------------------------------------ la ruta */

// El camino completo hacia la certificación. Solo la sesión 1 está construida;
// las demás aparecen en el índice como "próximamente".
export const RUTA = [
  { numero: 1, titulo: 'Tu primera máquina en AWS', temas: 'Infraestructura global · EC2 · precios de cómputo', dominios: ['Tecnología', 'Facturación'], sandbox: 45, lista: true },
  { numero: 2, titulo: 'Identidad y seguridad', temas: 'IAM: usuarios, grupos, roles y políticas · MFA · responsabilidad compartida', dominios: ['Seguridad'], sandbox: 40 },
  { numero: 3, titulo: 'Redes en AWS', temas: 'VPC, subredes públicas y privadas, tablas de rutas, grupos de seguridad y NACL · Route 53 · CloudFront', dominios: ['Tecnología'], sandbox: 60 },
  { numero: 4, titulo: 'Almacenamiento', temas: 'Amazon S3 y sus clases · sitio web estático · EBS, EFS y Glacier', dominios: ['Tecnología'], sandbox: 45 },
  { numero: 5, titulo: 'Bases de datos', temas: 'Amazon RDS y Aurora · DynamoDB · ElastiCache · Redshift', dominios: ['Tecnología'], sandbox: 60 },
  { numero: 6, titulo: 'Escalar y automatizar', temas: 'Balanceadores de carga · Auto Scaling · CloudWatch · Lambda · SNS y SQS', dominios: ['Tecnología', 'Conceptos'], sandbox: 60 },
  { numero: 7, titulo: 'Costos, soporte y buenas prácticas', temas: 'Pricing Calculator · Budgets · Cost Explorer · Organizations · planes de soporte · Well-Architected', dominios: ['Facturación', 'Conceptos'], sandbox: 20 },
  { numero: 8, titulo: 'Simulacro de certificación', temas: 'Examen completo de 65 preguntas en 90 minutos, con repaso de errores', dominios: ['Todos'], sandbox: 0 }
];

/* ------------------------------------------------------------ el curso */

export const CURSO = {
  id: 'aws-practitioner',
  titulo: 'Ruta AWS Cloud Practitioner',
  subtitulo: 'Sesión 1 · Tu primera máquina en AWS',
  resumen:
    'Aprende cómo está organizada la nube de AWS y levanta con tus propias manos un servidor web en Amazon EC2, paso a paso y sin gastar de más tu tiempo de sandbox. Terminas con un examen al estilo de la certificación.',
  duracion: '2 horas',

  practica: {
    titulo: 'Examen de práctica · Sesión 1',
    corto: 'Examen de práctica',
    resumen: '20 preguntas al estilo del examen de certificación, unos 17 minutos, una sola entrega.',
    plegable: 'Ver cómo es el examen real'
  },

  capitulos: [
    /* ================================================================ 1 */
    {
      numero: 1,
      titulo: 'Antes de encender el sandbox',
      descripcion:
        'Todo lo que necesitas entender antes de gastar un solo token: cómo es el examen, cómo rinde tu sandbox, cómo está repartida la nube de AWS por el mundo, de qué piezas está hecho un servidor en EC2 y cómo te lo cobran. Este capítulo se hace con el sandbox apagado.',
      actividades: [
        {
          id: 's1-ruta',
          tipo: 'leccion',
          titulo: 'Tu ruta hacia la certificación',
          xp: 50,
          minutos: 5,
          laminas: [
            {
              titulo: 'La meta: AWS Certified Cloud Practitioner',
              html: `
                <p class="entrada">Es la certificación de entrada de AWS. Demuestra que entiendes qué es la nube de AWS, para qué sirve cada servicio importante y cómo se cobra. <strong>No necesitas saber programar.</strong></p>
                <div class="rejilla rejilla--3 valores">
                  <div>${icono('reloj')}<strong>65 preguntas en 90 minutos</strong><p>Opción múltiple (una correcta) y respuesta múltiple (dos o más correctas).</p></div>
                  <div>${icono('estrella')}<strong>700 de 1000 para aprobar</strong><p>15 preguntas no cuentan, pero no sabes cuáles: contesta todas.</p></div>
                  <div>${icono('dinero')}<strong>US$100</strong><p>Clave del examen: CLF-C02. Se presenta en un centro de pruebas o en línea.</p></div>
                </div>
                ${recuadro('recuerda', 'Una pregunta sin contestar cuenta como error y no se castiga adivinar. <strong>Nunca dejes una en blanco.</strong>')}`,
              notas: 'Datos de la guía oficial del examen CLF-C02. El precio puede cambiar; revísalo en la página de AWS Certification antes de que se inscriban.'
            },
            {
              titulo: 'Los cuatro temas del examen',
              html: `
                <p class="entrada">El examen está dividido en cuatro dominios. Esta ruta de 8 sesiones los cubre todos, con práctica real en AWS.</p>
                <div class="cuotas" role="img" aria-label="Peso de cada dominio: Tecnología y servicios 34 %, Seguridad y cumplimiento 30 %, Conceptos de la nube 24 %, Facturación, precios y soporte 12 %">
                  <div class="cuota cuota--aws" style="--v:34"><span class="cuota__nombre">Tecnología y servicios de la nube</span><span class="cuota__pista"><span class="cuota__barra"></span></span><span class="cuota__valor">34&nbsp;%</span></div>
                  <div class="cuota cuota--azure" style="--v:30"><span class="cuota__nombre">Seguridad y cumplimiento</span><span class="cuota__pista"><span class="cuota__barra"></span></span><span class="cuota__valor">30&nbsp;%</span></div>
                  <div class="cuota cuota--gcp" style="--v:24"><span class="cuota__nombre">Conceptos de la nube</span><span class="cuota__pista"><span class="cuota__barra"></span></span><span class="cuota__valor">24&nbsp;%</span></div>
                  <div class="cuota cuota--otros" style="--v:12"><span class="cuota__nombre">Facturación, precios y soporte</span><span class="cuota__pista"><span class="cuota__barra"></span></span><span class="cuota__valor">12&nbsp;%</span></div>
                </div>
                ${recuadro('consejo', 'Casi dos terceras partes del examen son servicios y seguridad. Por eso cada sesión combina teoría con un laboratorio en la consola: lo que haces con tus manos se te olvida menos.')}`,
              notas: 'Pesos de la guía oficial CLF-C02. En el índice del curso aparece la ruta completa de 8 sesiones.'
            },
            {
              titulo: 'Tu sandbox: un AWS de verdad, con reloj',
              html: `
                <p class="entrada">DataCamp te presta una cuenta real de AWS por un rato: el <strong>sandbox</strong>. Cada minuto encendido gasta tokens, y los tokens se renuevan cada semana.</p>
                <div class="rejilla rejilla--3 valores">
                  <div>${icono('dinero')}<strong>${SANDBOX.tokensSemana.toLocaleString('es-MX')} tokens por semana</strong><p>Rinden unas <strong>${(SANDBOX.minutosSemana / 60).toFixed(1)} horas</strong> de AWS.</p></div>
                  <div>${icono('reloj')}<strong>Una sesión a la vez</strong><p>Si cierras la pestaña o te quedas inactivo, el sandbox se reinicia.</p></div>
                  <div>${icono('alerta')}<strong>Empieza siempre en blanco</strong><p>Lo que construyas se borra al terminar. Guarda tus evidencias con capturas.</p></div>
                </div>
                ${recuadro('cuidado', '<strong>La regla de oro:</strong> lee la guía con el sandbox apagado y enciéndelo solo cuando el laboratorio te lo pida. Al terminar, ciérralo. El contador de minutos de este curso te ayuda a llevar la cuenta.')}
                ${nubi('Plan de la semana: unos 45 minutos de sandbox en clase y lo demás para repasar en casa.', 'nubi-feliz')}`,
              notas: 'Los tokens por semana son los de la cuenta del docente (10 000 ≈ 5.5 h). La cuenta Premium estándar de DataCamp trae menos; si un alumno usa su propia cuenta, que ajuste sus expectativas.'
            }
          ]
        },
        {
          id: 's1-global',
          tipo: 'leccion',
          titulo: 'La infraestructura global de AWS',
          xp: 50,
          minutos: 5,
          laminas: [
            {
              titulo: 'Regiones, zonas y ubicaciones de borde',
              html: `
                <p class="entrada">AWS reparte sus centros de datos por el mundo en tres niveles. El examen los pregunta <strong>siempre</strong>.</p>
                <div class="rejilla rejilla--3">
                  <article class="modelo modelo--iaas"><span class="modelo__sigla">Región</span><h3>Un lugar del mundo</h3><p>Una zona geográfica con varias zonas de disponibilidad aisladas entre sí. Cada región es independiente de las demás.</p><p class="modelo__ejemplos">us-east-1 (Virginia del Norte) · mx-central-1 (Querétaro)</p></article>
                  <article class="modelo modelo--paas"><span class="modelo__sigla">Zona de disponibilidad</span><h3>Centros de datos separados</h3><p>Uno o más centros de datos con su propia energía, red y conectividad, dentro de una región. Normalmente hay tres o más por región.</p><p class="modelo__ejemplos">us-east-1a · us-east-1b · us-east-1c</p></article>
                  <article class="modelo modelo--saas"><span class="modelo__sigla">Ubicación de borde</span><h3>Cerca de tus usuarios</h3><p>Sitios más pequeños y mucho más numerosos que las regiones. Guardan copias de contenido (Amazon CloudFront) y responden consultas de DNS (Route 53).</p><p class="modelo__ejemplos">Más que regiones, en muchas ciudades</p></article>
                </div>
                ${recuadro('examen', 'Si la pregunta dice <em>“alta disponibilidad”</em> o <em>“si falla un centro de datos”</em>, la respuesta casi siempre es <strong>usar varias zonas de disponibilidad</strong>.')}`,
              notas: 'Conecta con la clase de Comprender la nube: ahí vieron regiones y zonas en general; aquí se nombran como en AWS.'
            },
            {
              titulo: '¿Cómo se elige una región?',
              html: `
                <p class="entrada">Cuatro preguntas, en este orden de importancia:</p>
                <ol class="cinco">
                  <li><strong>Cumplimiento.</strong> ¿Alguna ley o contrato obliga a que los datos vivan en cierto país? Eso manda sobre todo lo demás.</li>
                  <li><strong>Cercanía.</strong> Entre más cerca de tus usuarios, menos latencia: la página responde más rápido.</li>
                  <li><strong>Servicios disponibles.</strong> No todos los servicios existen en todas las regiones; los nuevos suelen llegar primero a unas cuantas.</li>
                  <li><strong>Precio.</strong> El mismo servicio puede costar distinto según la región.</li>
                </ol>
                ${recuadro('sabias', 'Desde enero de 2025 AWS tiene una región en México: <strong>mx-central-1</strong>, en Querétaro, con tres zonas de disponibilidad.')}`,
              notas: 'Los cuatro factores (cumplimiento, cercanía, servicios y precio) son un clásico del examen.'
            }
          ]
        },
        {
          id: 's1-ex-region',
          tipo: 'opcion',
          titulo: 'Elegir la región correcta',
          xp: 50,
          minutos: 2,
          contexto:
            '<p>Un hospital de Monterrey va a guardar expedientes clínicos en AWS. Su área legal exige que <strong>los datos no salgan de México</strong>. Otra región de Estados Unidos es 8&nbsp;% más barata.</p>',
          pregunta: '¿Qué debe decidir la región?',
          opciones: [
            { texto: 'El precio: la región más barata ahorra dinero todos los meses.', retro: 'El precio importa, pero nunca por encima de una obligación legal.' },
            { texto: 'El cumplimiento: debe ser una región en México, como mx-central-1.', correcta: true, retro: '¡Exacto! Si la ley o el contrato piden que los datos vivan en un país, ese factor manda.' },
            { texto: 'La cantidad de servicios: la región más grande siempre es mejor.', retro: 'Tener más servicios ayuda, pero aquí hay una restricción legal que decide primero.' },
            { texto: 'La ubicación de borde más cercana, porque ahí guardarán los datos.', retro: 'Las ubicaciones de borde guardan copias temporales de contenido; los datos viven en una región.' }
          ],
          pista: 'Busca la palabra “exige” en el contexto.'
        },
        {
          id: 's1-ex-infra',
          tipo: 'clasificar',
          titulo: '¿Región, zona o borde?',
          xp: 50,
          minutos: 3,
          contexto: '<p>Tres niveles de la infraestructura global de AWS, ocho descripciones.</p>',
          pregunta: 'Clasifica cada descripción en el nivel que le corresponde.',
          grupos: [
            { id: 'region', nombre: 'Región', color: 'blue' },
            { id: 'az', nombre: 'Zona de disponibilidad', color: 'green' },
            { id: 'borde', nombre: 'Ubicación de borde', color: 'coral' }
          ],
          fichas: [
            { texto: 'mx-central-1, en Querétaro', grupo: 'region', retro: 'mx-central-1 es el código de una región completa.' },
            { texto: 'Uno o más centros de datos con energía y red propias', grupo: 'az', retro: 'Eso describe una zona de disponibilidad.' },
            { texto: 'Donde Amazon CloudFront guarda copias del contenido', grupo: 'borde', retro: 'CloudFront entrega contenido desde ubicaciones de borde.' },
            { texto: 'us-east-1b', grupo: 'az', retro: 'La letra al final indica una zona dentro de la región us-east-1.' },
            { texto: 'La eliges por leyes, cercanía, servicios y precio', grupo: 'region', retro: 'Esos cuatro factores sirven para elegir región.' },
            { texto: 'Hay muchas más de estas que regiones', grupo: 'borde', retro: 'Las ubicaciones de borde son muchísimas más que las regiones.' },
            { texto: 'Repartir tu app en varias te protege si falla un centro de datos', grupo: 'az', retro: 'Varias zonas de disponibilidad = alta disponibilidad.' },
            { texto: 'Es independiente de las demás de su tipo', grupo: 'region', retro: 'Las regiones están aisladas entre sí.' }
          ],
          cierre: 'Región: un lugar del mundo (us-east-1). Zona de disponibilidad: centros de datos separados dentro de ella (us-east-1b). Ubicación de borde: sitios cerca de los usuarios para CloudFront y Route 53.',
          pista: 'Si trae una letra al final (us-east-1b) es una zona; si solo tiene número (us-east-1), es una región.'
        },
        {
          id: 's1-ec2',
          tipo: 'leccion',
          titulo: 'Amazon EC2 en seis piezas',
          xp: 50,
          minutos: 6,
          laminas: [
            {
              titulo: 'Rentar una computadora tiene seis piezas',
              html: `
                <p class="entrada"><strong>Amazon EC2</strong> (Elastic Compute Cloud) renta servidores virtuales: se llaman <strong>instancias</strong>. Al crear una, eliges estas seis piezas:</p>
                <div class="rejilla rejilla--3 roles">
                  <article class="rol">${icono('disco')}<h3>AMI</h3><p>La plantilla: sistema operativo y software con que arranca. Hoy: <em>Amazon Linux 2023</em>.</p></article>
                  <article class="rol">${icono('cpu')}<h3>Tipo de instancia</h3><p>Cuántos vCPU y cuánta RAM. Hoy: una <em>t3.micro</em> o <em>t2.micro</em>.</p></article>
                  <article class="rol">${icono('llave')}<h3>Par de llaves</h3><p>La llave para entrar por SSH. Hoy entraremos desde el navegador, sin llave.</p></article>
                  <article class="rol">${icono('escudo')}<h3>Grupo de seguridad</h3><p>El firewall de la instancia: qué tráfico puede entrar. Hoy: SSH (22) y web (80).</p></article>
                  <article class="rol">${icono('base-datos')}<h3>Volumen EBS</h3><p>El disco. Sigue existiendo aunque apagues la instancia. Hoy: 8 GiB.</p></article>
                  <article class="rol">${icono('codigo')}<h3>Datos de usuario</h3><p>Un script que corre solo la primera vez que arranca. Hoy instalará un servidor web.</p></article>
                </div>`,
              notas: 'Es la lámina más importante de la sesión: el laboratorio recorre estas seis piezas en el mismo orden.'
            },
            {
              titulo: 'Cómo leer un tipo de instancia',
              html: `
                <div class="tipo-instancia" aria-label="t3.micro: familia t, generación 3, tamaño micro">
                  <span class="tipo-instancia__parte tipo-instancia__parte--familia">t<small>familia</small></span>
                  <span class="tipo-instancia__parte tipo-instancia__parte--generacion">3<small>generación</small></span>
                  <span class="tipo-instancia__punto">.</span>
                  <span class="tipo-instancia__parte tipo-instancia__parte--tamano">micro<small>tamaño</small></span>
                </div>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Familia</th><th scope="col">Para qué</th><th scope="col">Ejemplo</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Propósito general (t, m)</th><td>Equilibrio de CPU y memoria: páginas web, pruebas</td><td>t3.micro, m7i.large</td></tr>
                      <tr><th scope="row">Optimizadas para cómputo (c)</th><td>Mucho procesador: videojuegos, cálculos científicos</td><td>c7i.xlarge</td></tr>
                      <tr><th scope="row">Optimizadas para memoria (r, x)</th><td>Mucha RAM: bases de datos en memoria</td><td>r7i.large</td></tr>
                      <tr><th scope="row">Cómputo acelerado (p, g)</th><td>GPU: inteligencia artificial, gráficos</td><td>g5.xlarge</td></tr>
                      <tr><th scope="row">Optimizadas para almacenamiento (i, d)</th><td>Mucho disco rápido y local</td><td>i4i.large</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('tecnico', 'Las <strong>t</strong> son “ampliables” (burstable): acumulan créditos de CPU cuando están tranquilas y los gastan en los picos. Perfectas para practicar.')}`,
              notas: 'No hay que memorizar nombres de instancias; el examen pregunta por la familia según el caso (“mucha memoria” → optimizadas para memoria).'
            },
            {
              titulo: 'La vida de una instancia',
              html: `
                <div class="carrera">
                  <div class="carrera__fila carrera__fila--nube"><span class="carrera__quien">Running (encendida)</span><ol><li>Cobra cómputo por segundo</li><li>Cobra el disco EBS</li></ol><span class="carrera__tiempo">pagas todo</span></div>
                  <div class="carrera__fila"><span class="carrera__quien">Stopped (detenida)</span><ol><li>No cobra cómputo</li><li>Sí cobra el disco EBS</li><li>Al encenderla cambia su IP pública</li></ol><span class="carrera__tiempo">pagas el disco</span></div>
                  <div class="carrera__fila carrera__fila--propio"><span class="carrera__quien">Terminated (eliminada)</span><ol><li>Se borra la instancia</li><li>Por omisión, también su disco raíz</li></ol><span class="carrera__tiempo">no hay vuelta atrás</span></div>
                </div>
                ${recuadro('cuidado', '<em>Stop</em> es apagar; <em>Terminate</em> es tirar la computadora a la basura. En la consola, <strong>Terminate</strong> dice “(delete)” por algo.')}
                ${recuadro('sabias', 'Las instancias con Linux se cobran por segundo, con un mínimo de 60 segundos.')}`,
              notas: 'En el laboratorio harán las dos cosas: primero Stop, luego Terminate.'
            }
          ]
        },
        {
          id: 's1-ex-piezas',
          tipo: 'clasificar',
          titulo: 'Las piezas de una instancia',
          xp: 50,
          minutos: 3,
          contexto: '<p>Estás por crear tu primera instancia y tu compañero te lee lo que necesita.</p>',
          pregunta: 'Relaciona cada necesidad con la pieza de EC2 que la resuelve.',
          grupos: [
            { id: 'ami', nombre: 'AMI', color: 'purple' },
            { id: 'tipo', nombre: 'Tipo de instancia', color: 'blue' },
            { id: 'sg', nombre: 'Grupo de seguridad', color: 'red' },
            { id: 'userdata', nombre: 'Datos de usuario', color: 'green' }
          ],
          fichas: [
            { texto: 'Que arranque con Amazon Linux 2023', grupo: 'ami', retro: 'El sistema operativo viene en la AMI.' },
            { texto: 'Que tenga 2 vCPU y 1 GiB de RAM', grupo: 'tipo', retro: 'CPU y memoria los define el tipo de instancia.' },
            { texto: 'Que cualquiera pueda abrir la página por el puerto 80', grupo: 'sg', retro: 'Qué tráfico entra lo decide el grupo de seguridad.' },
            { texto: 'Que instale un servidor web sola la primera vez', grupo: 'userdata', retro: 'Un script de arranque va en los datos de usuario.' },
            { texto: 'Bloquear todo lo demás que intente entrar', grupo: 'sg', retro: 'Lo que no está permitido en el grupo de seguridad, no entra.' },
            { texto: 'Usar una plantilla con software ya instalado por tu empresa', grupo: 'ami', retro: 'Puedes crear tus propias AMI con tu software.' },
            { texto: 'Pasar a una máquina con más memoria para una base de datos', grupo: 'tipo', retro: 'Cambiar CPU o RAM es cambiar de tipo de instancia.' },
            { texto: 'Escribir un mensaje de bienvenida en la página al arrancar', grupo: 'userdata', retro: 'Cualquier configuración inicial automática va en los datos de usuario.' }
          ],
          cierre: 'AMI: con qué arranca. Tipo: qué tan grande es. Grupo de seguridad: qué puede entrar. Datos de usuario: qué hace sola al arrancar la primera vez.',
          pista: '¿Es sobre el sistema, el tamaño, el tráfico o algo que se ejecuta al arrancar?'
        },
        {
          id: 's1-precios',
          tipo: 'leccion',
          titulo: 'Cómo te cobra EC2',
          xp: 50,
          minutos: 4,
          laminas: [
            {
              titulo: 'Cinco formas de pagar una instancia',
              html: `
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Opción</th><th scope="col">Cómo funciona</th><th scope="col">Ahorro</th><th scope="col">Úsala para</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">On-Demand</th><td>Pagas por segundo, sin compromiso</td><td>Ninguno</td><td>Pruebas cortas y cargas impredecibles</td></tr>
                      <tr><th scope="row">Savings Plans</th><td>Te comprometes a gastar cierto monto por hora durante 1 o 3 años</td><td>Hasta 72&nbsp;%</td><td>Uso constante, con flexibilidad de tipo y región</td></tr>
                      <tr><th scope="row">Instancias reservadas</th><td>Reservas un tipo de instancia por 1 o 3 años</td><td>Hasta 72&nbsp;%</td><td>Servidores que corren siempre, como una base de datos</td></tr>
                      <tr><th scope="row">Instancias Spot</th><td>Usas capacidad sobrante; AWS puede recuperarla con 2 minutos de aviso</td><td>Hasta 90&nbsp;%</td><td>Trabajos que se pueden interrumpir y reanudar</td></tr>
                      <tr><th scope="row">Dedicated Hosts</th><td>Un servidor físico solo para ti</td><td>—</td><td>Licencias ligadas al hardware y reglas de cumplimiento</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('examen', 'Palabras clave: <em>“puede interrumpirse”</em> → Spot. <em>“24/7 durante años”</em> → Savings Plans o reservadas. <em>“corto e impredecible”</em> → On-Demand. <em>“licencias por servidor” o “hardware exclusivo”</em> → Dedicated Hosts.')}`,
              notas: 'Conecta con la clase de IaaS: el taxi (On-Demand), el contrato de renta (compromiso) y el vuelo de última hora (Spot).'
            }
          ]
        },
        {
          id: 's1-ex-precio',
          tipo: 'opcion',
          titulo: '¿Qué opción de compra?',
          xp: 50,
          minutos: 2,
          contexto:
            '<p>Una universidad procesa cada noche miles de fotos de su archivo histórico. Si el proceso se interrumpe, <strong>continúa donde se quedó</strong> a la noche siguiente. Quiere gastar lo menos posible.</p>',
          pregunta: '¿Qué opción de compra le conviene?',
          opciones: [
            { texto: 'On-Demand, porque no tiene compromiso.', retro: 'Funciona, pero es la opción más cara por hora.' },
            { texto: 'Dedicated Hosts, para tener hardware exclusivo.', retro: 'Nada en el caso pide hardware exclusivo, y es de lo más caro.' },
            { texto: 'Instancias Spot, porque el trabajo tolera interrupciones.', correcta: true, retro: '¡Correcto! Spot ahorra hasta 90&nbsp;% y el proceso puede reanudarse si AWS recupera la capacidad.' },
            { texto: 'Instancias reservadas por 3 años.', retro: 'Ahorran mucho, pero Spot es aún más barato para trabajos que toleran interrupciones.' }
          ],
          pista: 'Busca la palabra clave: “continúa donde se quedó”.'
        },
        {
          id: 's1-ex-responsabilidad',
          tipo: 'opcion',
          titulo: 'Responsabilidad compartida en EC2',
          xp: 50,
          minutos: 2,
          contexto: '<p>Tu instancia EC2 con Amazon Linux tiene una vulnerabilidad en el sistema operativo y ya salió el parche.</p>',
          pregunta: '¿Quién debe instalarlo?',
          opciones: [
            { texto: 'Tú, el cliente: el sistema operativo invitado es tu responsabilidad.', correcta: true, retro: 'Correcto. En EC2 (IaaS), AWS cuida el hardware, la red y el hipervisor; el sistema operativo y lo de arriba son tuyos.' },
            { texto: 'AWS, porque la AMI de Amazon Linux es de Amazon.', retro: 'Que AWS publique la AMI no lo hace responsable de parchar tu instancia.' },
            { texto: 'Nadie: las instancias se actualizan solas por la noche.', retro: 'No hay actualizaciones automáticas por omisión; hay herramientas para automatizarlo, pero las configuras tú.' },
            { texto: 'El equipo de soporte de AWS, si pagas el plan Basic.', retro: 'El plan Basic de soporte no incluye administrar tus servidores.' }
          ],
          pista: 'Recuerda la tabla de las 9 capas: en IaaS, ¿de quién es el sistema operativo?'
        }
      ]
    },

    /* ================================================================ 2 */
    {
      numero: 2,
      titulo: 'Laboratorio guiado en AWS',
      descripcion:
        'Ahora sí: enciendes el sandbox y levantas un servidor web real en Amazon EC2, lo visitas desde tu navegador, entras a su terminal, lo detienes y lo eliminas. Cada paso dice exactamente dónde hacer clic y qué deberías ver.',
      actividades: [
        {
          id: 's1-lab-ec2',
          tipo: 'laboratorio',
          titulo: 'Laboratorio: tu primer servidor web en EC2',
          xp: 300,
          minutos: 50,
          objetivo: 'Crear una instancia EC2 que muestre una página web propia, entrar a su terminal desde el navegador, detenerla y eliminarla.',
          necesitas: [
            'Tu sesión de DataCamp abierta (el sandbox todavía apagado).',
            'Esta guía abierta en otra pestaña o en tu celular.',
            'Unos 45 minutos de sandbox.',
            'Una forma de tomar capturas de pantalla.'
          ],
          pasos: [
            {
              titulo: 'Prepárate antes de encender',
              html: `
                <p>Todavía <strong>no</strong> enciendas el sandbox. Primero ten a la mano el script que vas a pegar en el paso 9. Cópialo a un bloc de notas o déjalo en esta pestaña:</p>
                ${codigo(`#!/bin/bash
dnf install -y httpd
echo "<h1>Hola desde EC2</h1><p>Servidor de $(hostname -f)</p>" > /var/www/html/index.html
systemctl enable --now httpd`)}
                <p>Qué hace, renglón por renglón: instala Apache (un servidor web), escribe una página de bienvenida y deja el servidor encendido, también después de reiniciar.</p>
                ${recuadro('consejo', 'Al pasar al siguiente paso, el contador del sandbox (arriba) arranca solo. Así sabrás cuántos minutos gastaste.')}`,
              ver: 'Tienes el script copiado o visible, y el sandbox sigue apagado.',
              sandbox: false
            },
            {
              titulo: 'Enciende el sandbox de AWS en DataCamp',
              html: `
                <ol class="pasos-consola">
                  <li>En DataCamp, abre la sección <strong>Sandbox</strong> desde el menú.</li>
                  <li>Elige la tarjeta de <strong>AWS</strong> y pulsa el botón para iniciar la sesión.</li>
                  <li>Espera a que termine de prepararse. No cierres la pestaña: si la cierras, el sandbox se reinicia.</li>
                  <li>Cuando esté listo, abre la <strong>consola de AWS</strong> desde el mismo panel del sandbox.</li>
                                  </ol>
                ${recuadro('cuidado', 'Si tu pantalla de DataCamp se ve un poco distinta, busca las mismas ideas: “Sandbox”, “AWS” y el botón para lanzar la sesión. Si algo no aparece, levanta la mano antes de gastar minutos buscando.')}`,
              ver: 'La consola de AWS abierta, con la página de inicio (Console Home) y la barra de búsqueda arriba.',
              problemas: [
                ['Dice que no tienes tokens suficientes', 'Revisa en el panel del sandbox cuántos te quedan y cuándo se renuevan. Avísale al docente.'],
                ['Ya tenías otra sesión abierta', 'Solo corre una sesión a la vez: cierra la otra desde el panel del sandbox.']
              ],
              sandbox: true
            },
            {
              titulo: 'Ubícate: la región y el servicio EC2',
              html: `
                <ol class="pasos-consola">
                  <li>Arriba a la derecha está el <strong>selector de región</strong>. Anota cuál aparece (por ejemplo, <em>N. Virginia · us-east-1</em>).</li>
                  <li><strong>No la cambies</strong> durante todo el laboratorio: lo que crees en una región no se ve en otra.</li>
                  <li>En la barra de búsqueda de arriba escribe <kbd>EC2</kbd> y elige <strong>EC2</strong> (Virtual Servers in the Cloud).</li>
                </ol>
                ${recuadro('sabias', 'Los sandbox suelen limitarse a ciertas regiones. Quédate en la que te abrió; si al crear algo aparece <em>“not authorized”</em> o <em>“AccessDenied”</em>, es una restricción del sandbox, no un error tuyo.')}`,
              ver: 'El panel de EC2 (EC2 Dashboard) con un menú a la izquierda: Instances, Images, Elastic Block Store, Network &amp; Security…',
              sandbox: true
            },
            {
              titulo: 'Empieza a crear la instancia',
              html: `
                <ol class="pasos-consola">
                  <li>En el panel de EC2 pulsa el botón naranja ${boton('Launch instance', 'lanzar instancia')}.</li>
                  <li>Se abre un formulario largo, dividido en secciones. A la derecha hay un resumen (<strong>Summary</strong>) que se va llenando.</li>
                  <li>En <strong>Name and tags</strong> (nombre y etiquetas), escribe el nombre: <kbd>web-tu-nombre</kbd> (por ejemplo, <em>web-mariana</em>).</li>
                </ol>
                ${recuadro('tecnico', 'El nombre en realidad es una <strong>etiqueta</strong> (tag) con clave <em>Name</em>. Las etiquetas sirven para organizar recursos y repartir costos por proyecto.')}`,
              ver: 'La página “Launch an instance” con tu nombre escrito en Name and tags.',
              sandbox: true
            },
            {
              titulo: 'Pieza 1: la AMI (el sistema operativo)',
              html: `
                <ol class="pasos-consola">
                  <li>Baja a <strong>Application and OS Images (Amazon Machine Image)</strong>.</li>
                  <li>En <strong>Quick Start</strong> deja seleccionado <strong>Amazon Linux</strong>.</li>
                  <li>En la lista de AMI elige <strong>Amazon Linux 2023 AMI</strong>. Debe decir <em>Free tier eligible</em>.</li>
                  <li>En <strong>Architecture</strong> deja <strong>64-bit (x86)</strong>.</li>
                </ol>`,
              ver: 'Amazon Linux 2023 AMI seleccionada, con la etiqueta “Free tier eligible”.',
              sandbox: true
            },
            {
              titulo: 'Pieza 2: el tipo de instancia',
              html: `
                <ol class="pasos-consola">
                  <li>En <strong>Instance type</strong> abre la lista.</li>
                  <li>Elige <strong>t3.micro</strong> o <strong>t2.micro</strong>: la que diga <em>Free tier eligible</em>. Las dos tienen 1 GiB de memoria; alcanza de sobra para una página web.</li>
                </ol>
                ${recuadro('cuidado', 'No elijas tipos grandes “para que vaya rápido”. En el sandbox pueden estar bloqueados, y en una cuenta real cuestan mucho más.')}`,
              ver: 'Instance type: t3.micro (o t2.micro), con “Free tier eligible”.',
              problemas: [['Al lanzar sale un error sobre el tipo de instancia', 'El sandbox puede permitir solo ciertos tipos. Regresa a este paso y prueba con el otro (t2.micro o t3.micro).']],
              sandbox: true
            },
            {
              titulo: 'Pieza 3: el par de llaves',
              html: `
                <ol class="pasos-consola">
                  <li>En <strong>Key pair (login)</strong> abre la lista.</li>
                  <li>Elige <strong>Proceed without a key pair (Not recommended)</strong> (continuar sin par de llaves).</li>
                </ol>
                <p>¿Por qué? Vamos a entrar con <strong>EC2 Instance Connect</strong>, que abre la terminal en tu navegador y crea una llave temporal por ti. Así nadie pierde tiempo peleando con archivos <em>.pem</em>.</p>
                ${recuadro('tecnico', 'En un trabajo real sí crearías un par de llaves y guardarías el archivo .pem en un lugar seguro: es la llave de tu servidor.')}`,
              ver: 'Key pair: “Proceed without a key pair”.',
              sandbox: true
            },
            {
              titulo: 'Pieza 4: la red y el grupo de seguridad',
              html: `
                <ol class="pasos-consola">
                  <li>En <strong>Network settings</strong> (configuración de red) deja la VPC y la subred que vienen por omisión.</li>
                  <li>Revisa que <strong>Auto-assign public IP</strong> diga <strong>Enable</strong>. Si no se ve, pulsa ${boton('Edit', 'editar')} en esa sección para comprobarlo.</li>
                  <li>En <strong>Firewall (security groups)</strong> deja marcado <strong>Create security group</strong>.</li>
                  <li>Deja marcado <strong>Allow SSH traffic from</strong> <em>Anywhere 0.0.0.0/0</em>.</li>
                  <li>Marca también <strong>Allow HTTP traffic from the internet</strong> (permitir tráfico web).</li>
                </ol>
                ${recuadro('cuidado', 'Abrir SSH a todo internet (0.0.0.0/0) está bien para un laboratorio de 45 minutos. En producción, solo se abre a las direcciones que lo necesitan.')}
                ${recuadro('examen', 'Los grupos de seguridad solo tienen reglas para <strong>permitir</strong>; todo lo que no permites queda bloqueado. Y recuerdan las conexiones: si dejas entrar una petición, su respuesta sale sola (son <em>stateful</em>).')}`,
              ver: 'Tres casillas: Create security group, Allow SSH traffic y Allow HTTP traffic, las tres marcadas.',
              sandbox: true
            },
            {
              titulo: 'Piezas 5 y 6: el disco y los datos de usuario',
              html: `
                <ol class="pasos-consola">
                  <li>En <strong>Configure storage</strong> deja <strong>8 GiB gp3</strong>: es el volumen EBS raíz.</li>
                  <li>Abre <strong>Advanced details</strong> (detalles avanzados). Es una sección plegada al final del formulario.</li>
                  <li>Baja hasta el último campo, <strong>User data</strong> (datos de usuario).</li>
                  <li>Pega ahí el script del paso 1.</li>
                </ol>
                ${codigo(`#!/bin/bash
dnf install -y httpd
echo "<h1>Hola desde EC2</h1><p>Servidor de $(hostname -f)</p>" > /var/www/html/index.html
systemctl enable --now httpd`)}
                ${recuadro('recuerda', 'Los datos de usuario se ejecutan <strong>una sola vez</strong>, como administrador, la primera vez que arranca la instancia.')}`,
              ver: 'El script pegado en el cuadro User data, empezando con #!/bin/bash.',
              sandbox: true
            },
            {
              titulo: 'Lanza la instancia',
              html: `
                <ol class="pasos-consola">
                  <li>Revisa el <strong>Summary</strong> de la derecha: 1 instancia, Amazon Linux 2023, t3.micro (o t2.micro), un grupo de seguridad nuevo y 8 GiB.</li>
                  <li>Pulsa ${boton('Launch instance', 'lanzar instancia')}.</li>
                  <li>Aparece un aviso verde de <strong>Success</strong> con el ID de tu instancia (empieza con <em>i-</em>).</li>
                  <li>Pulsa ${boton('View all instances', 'ver todas las instancias')}.</li>
                </ol>`,
              ver: 'La lista de instancias con la tuya en estado Pending (pendiente) y, en unos segundos, Running (encendida).',
              problemas: [['Sale “You are not authorized to perform this operation”', 'Es una restricción del sandbox. Anota el mensaje exacto, regresa al paso 6 y prueba con el otro tipo de instancia; si sigue, avísale al docente.']],
              sandbox: true
            },
            {
              titulo: 'Visita tu página web',
              html: `
                <ol class="pasos-consola">
                  <li>Espera a que <strong>Instance state</strong> diga <strong>Running</strong> y <strong>Status check</strong> diga <em>2/2</em> o <em>3/3 checks passed</em>. Toma uno o dos minutos; usa el botón de refrescar (la flecha circular).</li>
                  <li>Selecciona tu instancia (la casilla de la izquierda). Abajo se abren sus detalles.</li>
                  <li>Copia la <strong>Public IPv4 address</strong> (dirección IPv4 pública) con el icono de copiar.</li>
                  <li>En una pestaña nueva escribe <kbd>http://</kbd> y pega la dirección. Por ejemplo: <em>http://3.84.12.201</em>.</li>
                </ol>
                ${recuadro('cuidado', 'Escribe <strong>http://</strong> a mano. Si el navegador intenta <em>https://</em>, la página no abre: nuestro servidor solo habla HTTP.')}`,
              ver: 'Una página blanca que dice “Hola desde EC2” y el nombre interno del servidor. Tómale captura: es una de tus evidencias.',
              problemas: [
                ['La página no carga', 'Espera un minuto más: el script instala Apache después de arrancar. Luego revisa que usaste http:// y no https://.'],
                ['Sigue sin cargar', 'Revisa la pestaña Security de la instancia: el grupo de seguridad debe permitir HTTP (puerto 80). Si falta, se agrega desde Edit inbound rules.']
              ],
              sandbox: true
            },
            {
              titulo: 'Entra a la terminal de tu servidor',
              html: `
                <ol class="pasos-consola">
                  <li>Con tu instancia seleccionada, pulsa ${boton('Connect', 'conectar')} arriba de la lista.</li>
                  <li>Queda abierta la pestaña <strong>EC2 Instance Connect</strong>. Deja el usuario <strong>ec2-user</strong>.</li>
                  <li>Pulsa ${boton('Connect', 'conectar')}. Se abre una terminal negra en el navegador.</li>
                  <li>Escribe estos comandos, uno por uno, y lee lo que responden:</li>
                </ol>
                ${codigo(`whoami
cat /etc/os-release | head -2
df -h /
curl -s localhost`)}
                <p>Ahora pregúntale a la instancia <strong>en qué zona de disponibilidad vive</strong>:</p>
                ${codigo(`TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/placement/availability-zone; echo`)}`,
              ver: 'ec2-user, “Amazon Linux 2023”, un disco de unos 8 GB, tu página en HTML y una zona como us-east-1b. Tómale captura a la terminal: es una de tus evidencias.',
              problemas: [['Instance Connect no conecta', 'Revisa que el grupo de seguridad permita SSH (puerto 22) desde 0.0.0.0/0 y que la instancia tenga IP pública.']],
              sandbox: true
            },
            {
              titulo: 'Detén la instancia (Stop)',
              html: `
                <ol class="pasos-consola">
                  <li>Regresa a la lista de instancias. Anota la <strong>IP pública</strong> actual.</li>
                  <li>Con tu instancia seleccionada, abre ${boton('Instance state', 'estado de la instancia')} y elige <strong>Stop instance</strong> (detener).</li>
                  <li>Confirma con ${boton('Stop', 'detener')}.</li>
                  <li>Espera a que diga <strong>Stopped</strong>. Fíjate: ya no tiene IP pública.</li>
                </ol>
                <p>Detenida no cobra cómputo, pero su disco EBS sigue existiendo (y en una cuenta real, se sigue cobrando).</p>`,
              ver: 'Instance state: Stopped, sin Public IPv4 address.',
              sandbox: true
            },
            {
              titulo: 'Elimina la instancia (Terminate)',
              html: `
                <ol class="pasos-consola">
                  <li>Con tu instancia seleccionada, abre ${boton('Instance state', 'estado de la instancia')} y elige <strong>Terminate (delete) instance</strong>.</li>
                  <li>Confirma con ${boton('Terminate (delete)', 'eliminar')}.</li>
                  <li>Espera a que diga <strong>Terminated</strong>. Desaparecerá de la lista en un rato.</li>
                  <li>Abre <strong>Elastic Block Store → Volumes</strong> en el menú izquierdo: el volumen de 8 GiB también se borró.</li>
                </ol>
                ${recuadro('recuerda', 'Terminate no tiene vuelta atrás. En una cuenta real, lo que se te olvida terminar se sigue cobrando cada segundo.')}`,
              ver: 'Instance state: Terminated, y ningún volumen de tu instancia en Volumes.',
              sandbox: true
            },
            {
              titulo: 'Apaga el sandbox y entrega tus evidencias',
              html: `
                <ol class="pasos-consola">
                  <li>Regresa a DataCamp y <strong>termina la sesión del sandbox</strong> desde su panel. No basta con cerrar la consola de AWS.</li>
                  <li>Al pulsar <strong>Terminar laboratorio</strong>, el contador se detiene solo y verás cuántos minutos gastaste.</li>
                  <li>Revisa que tengas tus dos capturas: la página “Hola desde EC2” y la terminal con la zona de disponibilidad.</li>
                </ol>
                ${nubi('¡Levantaste tu primer servidor en AWS! Eso es exactamente IaaS: rentaste la máquina y tú pusiste el software.', 'nubi-feliz')}`,
              ver: 'El sandbox cerrado en DataCamp y el contador detenido.',
              sandbox: false
            }
          ],
          cierre: 'Creaste una instancia EC2 con sus seis piezas, publicaste una página web, entraste a su terminal, la detuviste y la eliminaste.'
        },
        {
          id: 's1-ex-stop',
          tipo: 'opcion',
          titulo: 'Detenida no es eliminada',
          xp: 50,
          minutos: 2,
          contexto: '<p>Al terminar una práctica en una cuenta real, detuviste tu instancia con <strong>Stop</strong> y te fuiste de vacaciones un mes.</p>',
          pregunta: '¿Qué te van a cobrar ese mes?',
          opciones: [
            { texto: 'Nada: una instancia detenida no genera ningún cargo.', retro: 'La instancia no cobra cómputo, pero su disco sigue existiendo.' },
            { texto: 'Las horas de cómputo, como si siguiera encendida.', retro: 'Detenida no cobra cómputo.' },
            { texto: 'El almacenamiento de su volumen EBS.', correcta: true, retro: 'Correcto. El disco EBS sigue guardado y se cobra por GB al mes. Si no lo necesitas, termina la instancia.' },
            { texto: 'Una multa por dejar recursos sin usar.', retro: 'AWS no cobra multas; cobra lo que sigue existiendo.' }
          ],
          pista: 'Piensa qué pieza sigue existiendo cuando la instancia está Stopped.'
        },
        {
          id: 's1-ex-ciclo',
          tipo: 'clasificar',
          titulo: 'Stop o Terminate',
          xp: 50,
          minutos: 3,
          contexto: '<p>Dos botones parecidos, consecuencias muy distintas.</p>',
          pregunta: 'Clasifica cada efecto según la acción que lo provoca.',
          grupos: [
            { id: 'stop', nombre: 'Stop (detener)', color: 'yellow' },
            { id: 'terminate', nombre: 'Terminate (eliminar)', color: 'red' }
          ],
          fichas: [
            { texto: 'Puedes volver a encenderla después', grupo: 'stop', retro: 'Una instancia detenida se puede volver a encender.' },
            { texto: 'La instancia deja de existir', grupo: 'terminate', retro: 'Terminate la elimina para siempre.' },
            { texto: 'Por omisión, se borra también el disco raíz', grupo: 'terminate', retro: 'El volumen raíz tiene “Delete on termination” activado por omisión.' },
            { texto: 'El disco EBS se conserva y se sigue cobrando', grupo: 'stop', retro: 'Detenida, el disco sigue ahí.' },
            { texto: 'Al volver a encenderla, cambia su IP pública', grupo: 'stop', retro: 'Sin IP elástica, cada arranque recibe otra IP pública.' },
            { texto: 'No hay forma de deshacerlo', grupo: 'terminate', retro: 'Terminate no tiene vuelta atrás.' }
          ],
          cierre: 'Stop: apagada, se conserva el disco y se puede encender otra vez. Terminate: eliminada para siempre, con su disco raíz.',
          pista: '¿Se puede recuperar después o no?'
        }
      ]
    },

    /* ================================================================ 3 */
    {
      numero: 3,
      titulo: 'Repaso para el examen',
      descripcion: 'Lo que la certificación pregunta de esta sesión, en una sola página, y un verdadero o falso para calentar antes del examen de práctica.',
      actividades: [
        {
          id: 's1-repaso',
          tipo: 'leccion',
          titulo: 'Lo que el examen te va a preguntar',
          xp: 50,
          minutos: 5,
          laminas: [
            {
              titulo: 'La sesión 1 en una hoja',
              html: `
                <div class="repaso">
                  <div class="repaso__capitulo"><span class="repaso__numero">1</span>${lista([
                    '<strong>Región</strong>: lugar del mundo; se elige por cumplimiento, cercanía, servicios y precio.',
                    '<strong>Zona de disponibilidad</strong>: centros de datos separados; usar varias = alta disponibilidad.',
                    '<strong>Ubicación de borde</strong>: cerca de los usuarios; CloudFront y Route 53.'
                  ])}</div>
                  <div class="repaso__capitulo"><span class="repaso__numero">2</span>${lista([
                    '<strong>EC2</strong> = servidores virtuales (IaaS). Piezas: AMI, tipo, par de llaves, grupo de seguridad, EBS y datos de usuario.',
                    '<strong>Grupo de seguridad</strong>: firewall de la instancia, solo reglas para permitir.',
                    '<strong>Stop</strong> conserva el disco; <strong>Terminate</strong> borra todo.'
                  ])}</div>
                  <div class="repaso__capitulo"><span class="repaso__numero">3</span>${lista([
                    '<strong>On-Demand</strong>: corto e impredecible. <strong>Savings Plans / reservadas</strong>: estable por 1 o 3 años (hasta 72&nbsp;%).',
                    '<strong>Spot</strong>: puede interrumpirse (hasta 90&nbsp;%). <strong>Dedicated Hosts</strong>: licencias y hardware exclusivo.',
                    '<strong>Responsabilidad compartida</strong>: en EC2, el sistema operativo es tuyo.'
                  ])}</div>
                </div>`,
              notas: 'Pide que alguien diga en voz alta la diferencia entre Stop y Terminate antes de abrir el examen.'
            }
          ]
        },
        {
          id: 's1-vf',
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
            { texto: 'Una región tiene varias zonas de disponibilidad.', grupo: 'v', retro: 'Verdadero: normalmente tres o más.' },
            { texto: 'Los grupos de seguridad pueden tener reglas para denegar tráfico.', grupo: 'f', retro: 'Falso: solo tienen reglas para permitir.' },
            { texto: 'Las instancias Spot pueden interrumpirse con dos minutos de aviso.', grupo: 'v', retro: 'Verdadero: por eso son tan baratas.' },
            { texto: 'AWS parcha el sistema operativo de tus instancias EC2.', grupo: 'f', retro: 'Falso: en EC2 el sistema operativo es tuyo.' },
            { texto: 'Los datos de usuario se ejecutan cada vez que la instancia arranca.', grupo: 'f', retro: 'Falso: por omisión corren solo en el primer arranque.' },
            { texto: 'Una instancia detenida sigue cobrando su disco EBS.', grupo: 'v', retro: 'Verdadero: el disco sigue existiendo.' },
            { texto: 'Las ubicaciones de borde son más numerosas que las regiones.', grupo: 'v', retro: 'Verdadero: hay muchísimas más.' },
            { texto: 'Para una base de datos que corre 24/7 por tres años conviene Spot.', grupo: 'f', retro: 'Falso: conviene Savings Plans o instancias reservadas.' }
          ],
          cierre: 'Cuatro verdaderas y cuatro falsas. Si fallaste alguna, repasa esa lámina antes del examen.',
          pista: 'Hay cuatro verdaderas y cuatro falsas.'
        }
      ]
    }
  ]
};

/* ------------------------------------------------------------ el plan */

export const PLAN = [
  {
    desde: 0,
    hasta: 5,
    titulo: 'Arranque',
    pasos: [
      'Proyecta el QR de la plataforma y que abran “Ruta AWS Cloud Practitioner”.',
      'Que se registren. Recuérdales: el sandbox se queda APAGADO hasta el laboratorio.'
    ],
    vigila: 'En “Avance en vivo”, espera a que casi todo el grupo esté registrado.'
  },
  {
    desde: 5,
    hasta: 37,
    titulo: 'Capítulo 1 · Antes de encender el sandbox',
    capitulo: 1,
    pasos: [
      'Proyecta las lecciones: examen, sandbox, infraestructura global, EC2 y precios.',
      'La lámina de las seis piezas de EC2 es la más importante: el laboratorio las recorre en el mismo orden.',
      'Los ejercicios los resuelven solos, dos o tres minutos cada uno.'
    ],
    vigila: 'Nadie debe encender el sandbox todavía: cada minuto cuesta tokens.'
  },
  {
    desde: 37,
    hasta: 92,
    titulo: 'Capítulo 2 · Laboratorio guiado',
    capitulo: 2,
    pasos: [
      'Proyecta el laboratorio y avanza paso a paso con el grupo; que cada quien marque “Ya lo hice”.',
      'En el paso de la página web, pide que levanten la mano quienes ya la ven.',
      'Antes de terminar, asegúrate de que TODOS eliminaron su instancia y cerraron el sandbox.'
    ],
    vigila: 'En “Avance en vivo” se ve en qué paso va cada quien: acércate a los que se atoren en el mismo paso.'
  },
  {
    desde: 92,
    hasta: 100,
    titulo: 'Capítulo 3 · Repaso',
    capitulo: 3,
    pasos: ['Proyecta la hoja de repaso.', 'El verdadero o falso es el termómetro antes del examen.'],
    vigila: 'Cuando casi todos terminen, abre el examen de práctica.'
  },
  {
    desde: 100,
    hasta: 117,
    titulo: 'Examen de práctica',
    pasos: [
      'Abre el examen en la pestaña “Práctica final”.',
      '20 preguntas al estilo de la certificación, una sola entrega.',
      'Al entregar, cada alumno puede descargar su reporte en PDF.'
    ],
    vigila: 'No proyectes el panel mientras contestan: muestra nombres y calificaciones.'
  },
  {
    desde: 117,
    hasta: 120,
    titulo: 'Cierre',
    pasos: ['Cierra el examen y proyecta el repaso de las preguntas más falladas.', 'Descarga el CSV antes de apagar.'],
    vigila: 'Recuérdales: la sesión 2 usa el sandbox otra vez; que no gasten sus tokens de la semana.'
  }
];
