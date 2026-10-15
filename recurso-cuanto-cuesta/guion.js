// ---------------------------------------------------------------------------
// EL GUION
//
// Cada entrada es un momento de la animación: a dónde mira la cámara, qué dice
// el rótulo y qué pasa en el mundo. Avanzar (→) pasa al siguiente momento.
//
//   cam       nombre de un encuadre de CAM (mundo.js)
//   parada    la etiqueta chica de arriba del título
//   titulo, texto   lo que se lee en el rótulo (texto acepta HTML)
//   aws       cómo se llama eso en AWS
//   tarjeta   en lugar del rótulo, muestra una tarjeta a pantalla completa
//   sub       qué versión de la tarjeta se ve (la de «tres» tiene dos)
//   mas/menos capas del mundo que se encienden o apagan desde este momento
//   fin       capas que se encienden al terminar la animación del momento
//   textos    textos del mundo (pantallas, tableros) que quedan así desde aquí
//   paq       dónde queda Moni al terminar: { x, y, etq, ver }
//   rastro    tramos de la ruta que ya quedaron pintados
//   accion    la animación; recibe las herramientas del motor
//   nota      apunte para el docente (tecla N)
// ---------------------------------------------------------------------------

export const TODAS = ['grafica', 'etiquetas', 'b40', 'scp', 'volumen', 'escalones', 'tam', 'ta-basico', 'ta-todo'];

const ROJO = '#ff4f8b';
const AMARILLO = '#ffcf3f';
const LILA = '#b69cff';

const EN_ALCANCIA = { x: 850, y: 930, etq: 'Moni' };
const EN_COTIZA = { x: 330, y: 990, etq: '' };
const EN_TAXI = { x: 1040, y: 690, etq: '' };
const EN_ABONO = { x: 1300, y: 690, etq: '' };
const EN_RENTA = { x: 1560, y: 690, etq: '' };
const EN_SPOT = { x: 2000, y: 690, etq: '' };
const EN_GARAGE = { x: 2050, y: 690, etq: '' };
const EN_BANCO = { x: 1460, y: 1295, etq: '' };
const EN_FAMILIA = { x: 2470, y: 570, etq: '' };
const EN_TALLER = { x: 2400, y: 1130, etq: '' };
const EN_PILARES = { x: 2540, y: 1515, etq: '' };

export const GUION = [
  {
    id: 'portada',
    cam: 'mapa',
    tarjeta: 'portada',
    temporal: TODAS,
    paq: { ver: false },
    nota: 'Deja la portada mientras entran. La pregunta del título es la que contesta toda la animación.'
  },
  {
    id: 'tienda',
    cam: 'tienda',
    parada: 'El punto de partida',
    titulo: 'Lupe abrió su tienda en línea',
    texto: 'Sus dos servidores viven en la nube de AWS. Antes de gastar un peso quiere saber <b>cuánto le va a costar</b> y cómo <b>no llevarse sorpresas</b>. Vamos a seguir a una de sus monedas.',
    paq: EN_ALCANCIA,
    async accion(m) {
      m.moni({ ...EN_ALCANCIA, ver: false });
      await m.espera(900);
      m.moni({ ver: true, nace: true });
      await m.espera(500);
      m.globo(850, 822, '¡Hola! Soy Moni', { escala: 1.3 });
      await m.espera(1600);
      m.globo(640, 892, '¿Cuánto me va a costar?', { ms: 2600, cola: 65, escala: 1.2 });
    },
    nota: 'Pregunta al grupo: ¿alguien ha pagado una suscripción que olvidó cancelar? Así se siente una factura de nube sin vigilar.'
  },
  {
    id: 'como',
    cam: 'tienda',
    tarjeta: 'tres',
    sub: 0,
    paq: EN_ALCANCIA,
    nota: 'Los datos que entran a AWS no se cobran; los que salen a internet sí. Pregunta por qué (AWS quiere que lleves tus datos; sacarlos cuesta).'
  },
  {
    id: 'cotiza',
    cam: 'cotiza',
    parada: 'Parada 1 · Antes de salir',
    titulo: 'Primero se cotiza',
    texto: 'Como cuando calculas un viaje antes de salir: eliges qué servidores vas a usar y la calculadora te dice cuánto costará <b>al mes y al año</b>, sin crear nada.',
    aws: 'AWS Pricing Calculator',
    paq: EN_COTIZA,
    rastro: ['a-cotiza'],
    textos: { 'calc-num': '16.94', 'calc-sub': '203.28 USD al año' },
    async accion(m) {
      await m.espera(900);
      await m.viajar('a-cotiza', 2200, { rastro: true });
      m.brilla('tb-cotiza');
      await m.contador('calc-num', 16.94, 1800);
      await m.espera(400);
      await m.monedas(330, 966, 230, 760, 5, 800);
      m.globo(330, 908, 'Dos servidores chicos: 16.94 al mes', { ms: 2600, escala: 1.3 });
    },
    nota: 'Es la parte A del laboratorio, en calculator.aws, sin sandbox: 2 instancias t2.micro bajo demanda en N. Virginia. Es pública y gratis; no hay que iniciar sesión.'
  },
  {
    id: 'avenida',
    cam: 'avenida',
    parada: 'Parada 2 · La avenida',
    titulo: 'Hay muchas formas de pagar el viaje',
    texto: 'Un servidor se paga como un transporte: puedes pagar <b>cada viaje</b>, comprar un <b>abono</b>, rentar <b>el mismo auto todo el año</b>, tomar el <b>último asiento</b> o tener <b>auto propio</b>.',
    aws: 'Formas de pago de EC2',
    paq: EN_TAXI,
    rastro: ['a-avenida'],
    async accion(m) {
      m.rastros([]);
      await m.espera(1200);
      await m.viajar('a-avenida', 2600, { rastro: true });
      m.globo(1040, 606, '¿Cuál me conviene?');
    },
    nota: 'Es el repaso de la sesión 1, ahora pensando en dinero. Pregunta cuál usarían para una tienda que abre todo el año.'
  },
  {
    id: 'taxi',
    cam: 'taxi',
    parada: 'Parada 2 · La avenida',
    titulo: 'El taxi: pagas cada viaje',
    texto: 'Sin compromiso: te subes cuando quieres y pagas <b>por segundo</b> de uso. Es lo más flexible y también lo más caro por hora. Bueno para lo corto o lo que no sabes cuánto durará.',
    aws: 'On-Demand',
    paq: EN_TAXI,
    textos: { 'taxi-num': '16.94' },
    async accion(m) {
      await m.espera(1300);
      m.brilla('taximetro');
      m.monedas(1040, 670, 1056, 520, 6, 900);
      await m.contador('taxi-num', 16.94, 2400);
      m.globo(1040, 606, 'Pago solo lo que uso', { cola: 0 });
    },
    nota: 'Palabra clave: «corto plazo, impredecible, sin compromiso» → On-Demand.'
  },
  {
    id: 'abono',
    cam: 'abono',
    parada: 'Parada 2 · La avenida',
    titulo: 'El abono: te comprometes y te descuentan',
    texto: 'Prometes gastar cierta cantidad por hora durante <b>1 o 3 años</b>, y a cambio todo te sale más barato. El abono sirve para cualquier ruta: otro tamaño de servidor, otra región, incluso Lambda.',
    aws: 'Compute Savings Plans',
    paq: EN_ABONO,
    rastro: ['t-abono'],
    async accion(m) {
      await m.espera(900);
      await m.viajar('t-abono', 1600, { rastro: true });
      m.brilla('tb-abono');
      await m.espera(800);
      m.brilla('tb-66');
      m.globo(1250, 606, 'Hasta 66 % menos', { cola: 50 });
      m.sello(1356, 640, true);
    },
    nota: 'Compute Savings Plans aplica a EC2, Fargate y Lambda, en cualquier familia y región. Es el compromiso más flexible.'
  },
  {
    id: 'renta',
    cam: 'renta',
    parada: 'Parada 2 · La avenida',
    titulo: 'La renta anual: el mismo auto, más barato',
    texto: 'Si sabes que vas a usar <b>siempre el mismo tipo de servidor</b> en la misma región, el compromiso sale aún más barato. Es la vieja idea de las instancias reservadas.',
    aws: 'EC2 Instance Savings Plans · reservadas',
    paq: EN_RENTA,
    rastro: ['t-renta'],
    async accion(m) {
      m.rastros([]);
      await m.espera(900);
      await m.viajar('t-renta', 1600, { rastro: true });
      m.brilla('tb-72');
      m.globo(1560, 606, 'Hasta 72 % menos');
      m.sello(1616, 640, true);
    },
    nota: 'Palabra clave: «uso constante y predecible por 1 o 3 años» → Savings Plans o instancias reservadas. Mientras menos flexible el compromiso, más descuento.'
  },
  {
    id: 'spot',
    cam: 'spot',
    parada: 'Parada 2 · La avenida',
    titulo: 'El último asiento: baratísimo, pero te pueden bajar',
    texto: 'AWS te vende la capacidad que le sobra con descuentos enormes. El trato: si alguien la necesita, <b>te avisan y te bajan</b>. Sirve para trabajos que pueden pausarse y seguir después.',
    aws: 'Instancias Spot',
    mas: ['asiento-libre'],
    paq: EN_SPOT,
    rastro: ['t-spot'],
    async accion(m) {
      m.rastros([]);
      await m.espera(900);
      await m.viajar('t-spot', 1500, { rastro: true });
      m.brilla('tb-70');
      await m.viajar('asiento', 900);
      m.globo(1888, 532, '¡Qué barato!', { ms: 1500 });
      await m.espera(1700);
      const p = m.mini(LILA, 'paga completo', 2000, 690, 1.1);
      await m.mover(p, 'bajar', 1300, { reversa: true });
      m.globo(1888, 532, 'Aviso: necesito el asiento', { ms: 1800 });
      await m.espera(1900);
      await m.viajar('bajar', 1000);
      m.sello(2060, 640, false, 2400);
      m.globo(2000, 606, '¡Me bajaron! Sigo después');
    },
    nota: 'Spot puede ser hasta 90 % más barato; para una t2.micro la calculadora muestra un descuento histórico de 70 %. AWS avisa dos minutos antes de recuperar la instancia.'
  },
  {
    id: 'garage',
    cam: 'garage',
    parada: 'Parada 2 · La avenida',
    titulo: 'El auto solo tuyo',
    texto: 'Un servidor físico completo para ti, que nadie más usa. Es lo más caro, y sirve cuando una <b>licencia</b> se cobra por servidor físico o una regla exige hardware exclusivo.',
    aws: 'Dedicated Hosts',
    paq: EN_GARAGE,
    rastro: ['t-garage'],
    menos: ['asiento-libre'],
    fin: ['garage-abierto'],
    async accion(m) {
      await m.espera(900);
      await m.viajar('t-garage', 900, { rastro: true });
      await m.espera(400);
      m.bandera('garage-abierto', true);
      await m.espera(1000);
      m.globo(2050, 606, 'Nadie más se sube aquí');
    },
    nota: 'Palabra clave: «licencias por servidor físico» o «cumplimiento que exige hardware dedicado» → Dedicated Hosts.'
  },
  {
    id: 'plan',
    cam: 'cotiza',
    parada: 'De vuelta al cotizador',
    titulo: 'La misma tienda, a mitad de precio',
    texto: 'Lupe regresa a la calculadora y cambia la forma de pago: con un abono de 3 años, sus dos servidores bajan de <b>16.94 a 8.47 USD</b> al mes. A cambio, se compromete.',
    aws: 'Compute Savings Plan · 3 años',
    paq: EN_COTIZA,
    menos: ['garage-abierto'],
    textos: { 'calc-num': '8.47', 'calc-sub': 'con abono de 3 años', 'calc-tit': '2 servidores · con abono' },
    async accion(m) {
      m.rastros([]);
      await m.espera(800);
      await m.viajar('regreso', 3600);
      m.brilla('tb-cotiza');
      await m.contador('calc-num', 8.47, 2000);
      m.confeti(230, 740);
      m.globo(330, 908, '¡La mitad!', { escala: 1.4 });
    },
    nota: 'Son los números reales del laboratorio: Compute Savings Plan a 3 años sin pago inicial, 8.47 USD; bajo demanda, 16.94 USD.'
  },
  {
    id: 'tres',
    cam: 'cotiza',
    tarjeta: 'tres',
    sub: 1,
    paq: EN_COTIZA,
    nota: 'Antes, durante y después: es el esquema para no confundir las tres herramientas en el examen.'
  },
  {
    id: 'estado',
    cam: 'estado',
    parada: 'Parada 3 · El banco',
    titulo: 'El estado de cuenta: en qué se fue el dinero',
    texto: 'Una gráfica de lo que <b>ya gastaste</b>, mes por mes y servicio por servicio, y hasta un pronóstico del mes que viene. Sirve para encontrar lo que sobra.',
    aws: 'AWS Cost Explorer',
    mas: ['grafica'],
    paq: EN_BANCO,
    rastro: ['a-banco'],
    async accion(m) {
      m.bandera('grafica', false);
      await m.espera(700);
      await m.viajar('a-banco', 2600, { rastro: true });
      m.bandera('grafica', true);
      await m.espera(1500);
      m.brilla('tb-total');
      m.globo(1530, 1212, 'Aquí veo todo lo que gasté', { cola: -70 });
    },
    nota: 'Son los datos reales del sandbox en el laboratorio: 1.49 USD en seis meses, en 17 servicios. Palabra clave: «analizar lo que ya gasté» → Cost Explorer.'
  },
  {
    id: 'etiquetas',
    cam: 'estado',
    parada: 'Parada 3 · El banco',
    titulo: 'Cada gasto con su etiqueta',
    texto: 'Si cada recurso lleva una etiqueta como <code>Proyecto=tienda</code>, el estado de cuenta separa lo de la tienda y lo del blog. Así cada área sabe cuánto gasta.',
    aws: 'Etiquetas de asignación de costos',
    mas: ['etiquetas'],
    paq: { ...EN_BANCO, etq: 'Proyecto=tienda' },
    async accion(m) {
      m.rastros([]);
      await m.espera(1200);
      m.moni({ etq: 'Proyecto=tienda', brinca: true });
      await m.espera(900);
      const b = m.pieza('moneda', 'Proyecto=blog', 1620, 1290, 1);
      await m.espera(1600);
      m.globo(1530, 1180, 'Ya no se revuelven', { ms: 2600, cola: -70 });
      m.quitar(b, 2600);
    },
    nota: 'Las etiquetas de asignación de costos hay que activarlas en Billing para que aparezcan en Cost Explorer.'
  },
  {
    id: 'presupuesto',
    cam: 'presupuesto',
    parada: 'Parada 3 · El banco',
    titulo: 'La tarjeta que avisa',
    texto: 'Lupe pone un límite de <b>10 USD al mes</b>. Cuando el gasto llega al 85 %, le llega un aviso; si llega al 100 % (o el pronóstico dice que llegará), otro. Nadie tiene que estar mirando.',
    aws: 'AWS Budgets',
    mas: ['b40'],
    fin: ['b100'],
    paq: EN_BANCO,
    async accion(m) {
      m.moni({ etq: '' });
      await m.espera(1400);
      m.bandera('b85', true);
      await m.espera(1500);
      m.bandera('suena', true);
      m.globo(1800, 1032, '¡Ya vas en 85 %!', { ms: 2000 });
      await m.espera(2300);
      m.bandera('suena', false);
      m.bandera('b100', true);
      await m.espera(1400);
      m.bandera('suena', true);
      m.sello(1790, 1150, false);
      m.globo(1640, 976, 'Llegaste al límite del mes');
      await m.espera(2600);
      m.bandera('suena', false);
    },
    nota: 'Es el presupuesto del laboratorio: plantilla Monthly cost budget, avisos al 85 %, al 100 % y por pronóstico. En el sandbox se puede ver, pero crear da budgets:ModifyBudget.'
  },
  {
    id: 'anomalia',
    cam: 'anomalia',
    parada: 'Parada 3 · El banco',
    titulo: 'El perro guardián',
    texto: 'Aprende cómo gasta Lupe normalmente y <b>ladra</b> cuando algo se sale de lo común, aunque no pase del límite. No hay que decirle cuánto: él solo aprende.',
    aws: 'Cost Anomaly Detection',
    menos: ['b40', 'b100'],
    fin: ['pico'],
    paq: EN_BANCO,
    async accion(m) {
      await m.espera(1500);
      m.bandera('pico', true);
      await m.espera(1300);
      m.bandera('ladra', true);
      m.globo(2240, 1180, '¡Guau! Eso no es normal', { cola: -126 });
      await m.espera(2400);
      m.bandera('ladra', false);
    },
    nota: 'Usa aprendizaje automático. La diferencia con Budgets: Budgets avisa al pasar un límite que tú pones; Anomaly Detection avisa de lo raro, sin límite.'
  },
  {
    id: 'familia',
    cam: 'familia',
    parada: 'Parada 4 · La familia',
    titulo: 'Muchas tarjetas, una sola factura',
    texto: 'La tienda, las pruebas y el blog tienen cada uno su cuenta, como tarjetas adicionales. Todo llega en <b>una sola factura</b>, y como el uso se suma, alcanzan <b>descuentos por volumen</b>.',
    aws: 'AWS Organizations · facturación consolidada',
    menos: ['pico'],
    fin: ['volumen'],
    paq: EN_FAMILIA,
    rastro: ['a-familia'],
    async accion(m) {
      await m.espera(800);
      await m.viajar('a-familia', 2800, { rastro: true });
      await m.espera(500);
      await Promise.all([
        m.monedas(2570, 560, 2700, 400, 4, 900),
        m.monedas(2700, 575, 2700, 400, 4, 900),
        m.monedas(2830, 560, 2700, 400, 4, 900)
      ]);
      m.brilla('factura');
      m.bandera('volumen', true);
      m.globo(2470, 486, 'Una factura para todos');
    },
    nota: 'Organizations no cuesta extra. Agrupa cuentas en unidades organizativas (OU). Control Tower arma en unos clics un entorno de varias cuentas con buenas prácticas.'
  },
  {
    id: 'reglas',
    cam: 'familia',
    parada: 'Parada 4 · La familia',
    titulo: 'Las reglas del titular',
    texto: 'El titular pone reglas que valen para <b>todas</b> las tarjetas, sin importar quién las use: «en pruebas, nada de lujos». Ningún permiso puede saltarse esa regla.',
    aws: 'Políticas de control de servicios (SCP)',
    mas: ['scp'],
    paq: EN_FAMILIA,
    async accion(m) {
      m.rastros([]);
      await m.espera(1500);
      const p = m.mini(ROJO, 'pruebas', 2700, 605, 1.1);
      await m.mover(p, 'lujo', 1500);
      m.globo(2640, 452, '¿Un auto de lujo?', { ms: 1600, cola: -94 });
      await m.espera(1700);
      m.sello(2600, 470, false, 2400);
      m.globo(2530, 350, 'La regla del titular gana', { ms: 2600 });
      await m.espera(2600);
      await m.mover(p, 'lujo', 1200, { reversa: true });
      m.quitar(p);
    },
    nota: 'El sandbox de DataCamp es una cuenta dentro de una organización: los «explicit deny» de RDS o del Internet Gateway son SCP. Lo vieron en las sesiones 2, 3 y 5.'
  },
  {
    id: 'taller',
    cam: 'taller',
    parada: 'Parada 5 · El taller',
    titulo: 'El mecánico que revisa tu auto',
    texto: 'Revisa tu cuenta y te dice qué arreglar: un servidor <b>prendido que nadie usa</b>, un puerto abierto, un límite por agotarse. Gratis revisa lo básico; con un plan de soporte, <b>todo</b>.',
    aws: 'AWS Trusted Advisor',
    mas: ['ta-basico'],
    menos: ['scp', 'volumen'],
    fin: ['ta-todo'],
    paq: EN_TALLER,
    rastro: ['a-taller'],
    async accion(m) {
      m.bandera('ta-basico', false);
      await m.espera(700);
      await m.viajar('a-taller', 2300, { rastro: true });
      m.bandera('ta-basico', true);
      m.globo(2400, 1066, 'Gratis: seguridad y límites', { ms: 2600 });
      await m.espera(2800);
      m.bandera('ta-todo', true);
      m.globo(2620, 1040, 'Este auto está prendido y nadie lo usa', { cola: 60 });
    },
    nota: 'Con Basic solo hay chequeos de seguridad básicos y de límites de servicio; los demás llegan con Business Support+ o superior. Las categorías: costos, rendimiento, seguridad, tolerancia a fallas, límites y excelencia operativa.'
  },
  {
    id: 'soporte',
    cam: 'soporte',
    parada: 'Parada 5 · La asistencia',
    titulo: 'Mientras más pagas, más rápido llegan',
    texto: 'Toda cuenta trae asistencia <b>Basic</b> gratis. Los planes de paga dan expertos 24 horas y respuestas en minutos; con Enterprise llega un <b>asesor personal</b>.',
    aws: 'Planes de soporte · TAM',
    mas: ['escalones'],
    menos: ['ta-basico', 'ta-todo'],
    fin: ['tam'],
    paq: EN_TALLER,
    async accion(m) {
      m.rastros([]);
      m.bandera('escalones', false);
      await m.espera(900);
      m.bandera('escalones', true);
      await m.espera(2200);
      m.bandera('tam', true);
      await m.espera(700);
      m.globo(3100, 958, '¡Hola! Soy tu TAM', { cola: 18 });
    },
    nota: 'Son los planes como los muestra hoy la consola. El examen todavía puede usar los nombres anteriores (Developer, Business, Enterprise On-Ramp, Enterprise). Lo que no cambia: Basic es gratis y el TAM (Technical Account Manager) es de Enterprise.'
  },
  {
    id: 'salud',
    cam: 'salud',
    parada: 'Parada 5 · Los avisos',
    titulo: 'El tablero de avisos',
    texto: 'Como el aviso de tránsito que dice «obras en tu ruta»: AWS te avisa cuando un problema suyo <b>afecta a tus recursos</b> y cuándo hay mantenimientos programados.',
    aws: 'AWS Health Dashboard',
    menos: ['escalones', 'tam'],
    fin: ['obras'],
    textos: { 'salud-txt': 'obras en tu zona', 'salud-sub': 'us-east-1 · EC2' },
    paq: EN_TALLER,
    async accion(m) {
      await m.espera(1400);
      m.bandera('obras', true);
      m.brilla('tablero-salud');
      await m.espera(400);
      m.texto('salud-txt', 'obras en tu zona');
      m.texto('salud-sub', 'us-east-1 · EC2');
      m.globo(2240, 246, 'Esto afecta a tus servidores', { escala: 1.1 });
    },
    nota: 'El Health Dashboard viene con cualquier plan, incluso Basic. Muestra lo que afecta a tu cuenta, no solo el estado general de AWS.'
  },
  {
    id: 'pilares',
    cam: 'pilares',
    parada: 'Parada 6 · La casa',
    titulo: 'Seis pilares para que no se caiga',
    texto: 'AWS resume en seis pilares qué tiene una arquitectura bien hecha: <b>excelencia operativa, seguridad, fiabilidad, eficiencia del rendimiento, optimización de costos y sostenibilidad</b>.',
    aws: 'AWS Well-Architected',
    menos: ['obras'],
    paq: EN_PILARES,
    rastro: ['a-pilares'],
    async accion(m) {
      await m.espera(600);
      await m.viajar('a-pilares', 2300, { rastro: true });
      for (let i = 1; i <= 6; i++) {
        m.brilla(`pilar-${i}`);
        await m.espera(550);
      }
      m.globo(2760, 1276, 'Si falta uno, la casa cojea');
    },
    nota: 'La Well-Architected Tool revisa una carga de trabajo contra los seis pilares con un cuestionario. En el laboratorio se llena el primer paso y el sandbox niega el segundo (wellarchitected:ListLenses).'
  },
  {
    id: 'laboratorio',
    cam: 'lab',
    parada: 'Lo que vas a ver en el laboratorio',
    titulo: 'Mirar sí, crear no',
    texto: 'Hoy cotizas sin sandbox y luego, en la consola, <b>ves</b> la facturación real, Cost Explorer, Trusted Advisor y los planes. Cuando intentes <b>crear</b> un presupuesto, el sandbox dirá que no.',
    aws: 'budgets:ModifyBudget',
    mas: ['grafica', 'b40'],
    paq: EN_BANCO,
    rastro: ['a-lab'],
    async accion(m) {
      await m.espera(600);
      await m.viajar('a-lab', 3000, { rastro: true });
      const f = m.mini(AMARILLO, 'crear presupuesto', 1460, 1270, 1.2);
      await m.mover(f, 'crear', 1500);
      m.globo(1640, 1086, 'Budget creation failed · budgets:ModifyBudget', { escala: 1.05 });
      m.sello(1700, 1160, false);
      await m.espera(2600);
      await m.mover(f, 'crear', 1200, { reversa: true });
      m.quitar(f);
    },
    nota: 'El aviso rojo del presupuesto no es una de las evidencias: las evidencias son la estimación de la calculadora, Cost Explorer y Trusted Advisor.'
  },
  { id: 'repaso', cam: 'mapa', tarjeta: 'repaso', menos: ['grafica', 'b40'], temporal: TODAS, paq: { ver: false } },
  { id: 'guia', cam: 'mapa', tarjeta: 'guia', temporal: TODAS, paq: { ver: false }, nota: 'Léanla como preguntas: ¿quiero estimar, vigilar, analizar, ordenar cuentas o mejorar?' },
  { id: 'quiz', cam: 'mapa', tarjeta: 'quiz', temporal: TODAS, paq: { ver: false }, nota: 'Que contesten en voz alta antes de tocar la respuesta.' },
  { id: 'fin', cam: 'mapa', tarjeta: 'fin', temporal: TODAS, paq: { ver: false } }
];

