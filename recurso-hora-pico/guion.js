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
//   mas/menos capas del mundo que se encienden o apagan desde este momento
//   fin       capas que se encienden al terminar la animación del momento
//   temporal  capas que solo se ven en este momento (las tarjetas)
//   chuy      dónde queda Chuy al terminar: { x, y, etq, ver }
//   accion    la animación; recibe las herramientas del motor
//   nota      apunte para el docente (tecla N)
//
// Las capas también sirven de banderas: on-pico pone a sudar al taquero 1,
// on-enfermo1 lo enferma, on-d3 cambia el deseado del tablero a 3, on-alto
// sube la gráfica y el termómetro, on-suena hace sonar la campanita, etc.
// ---------------------------------------------------------------------------

export const TODAS = [
  'fila', 't1', 't2', 't3', 'zonas', 'tablero', 'receta', 'pizarra', 'campana', 'bitacora', 'anfitrion', 'caja', 'riel', 'ventanilla', 'reloj', 'contador', 'd3'
];

const ROJO = '#ff4f8b';
const VERDE = '#7be495';
const CIAN = '#4cc9f0';
const AMARILLO = '#ffcf3f';
const LILA = '#b69cff';
const TEAL = '#2ee6c5';

const Y = 1115; // la altura de Chuy y los clientes, parados en la banqueta
const EN_CALLE = { x: 700, y: Y, etq: 'hambre: 3 tacos' };
const EN_P1 = { x: 1500, y: Y, etq: '¡mis tacos!' };
const EN_P2 = { x: 2200, y: Y, etq: 'a la plancha 2' };
const EN_P3 = { x: 1800, y: Y, etq: 'a la plancha 3' };
const EN_KIOSKO = { x: 2770, y: Y, etq: '¿y la salsa?' };

export const GUION = [
  {
    id: 'portada',
    cam: 'mapa',
    tarjeta: 'portada',
    temporal: TODAS,
    chuy: { ver: false },
    nota: 'Deja la portada mientras entran. La pregunta de hoy: ¿cómo atiende una página a mil personas a la vez sin quebrar ni desperdiciar?'
  },
  {
    id: 'chuy',
    cam: 'calle',
    parada: 'El punto de partida',
    titulo: 'Chuy tiene hambre',
    texto: 'En la taquería de la esquina hay <b>un solo taquero</b>. Cada cliente que llega es como alguien que abre tu página web: una <b>petición</b> que hay que atender.',
    aws: 'Una petición (request)',
    mas: ['t1', 'fila'],
    chuy: EN_CALLE,
    async accion(m) {
      m.chuy({ ...EN_CALLE, ver: false });
      await m.espera(900);
      m.chuy({ ver: true, nace: true });
      await m.espera(500);
      m.globo(700, 1020, '¡Hola! Soy Chuy');
    },
    nota: 'Pregunta al grupo: ¿qué pasa con la página de inscripciones el primer día? ¿Y con la de una tienda en el Buen Fin?'
  },
  {
    id: 'uno',
    cam: 'cocina-a',
    parada: 'Un servidor',
    titulo: 'Un taquero, una plancha',
    texto: 'Con poca gente, <b>un taquero basta</b>: recibe el pedido, prepara los tacos y atiende al siguiente. En la nube, ese taquero es un <b>servidor</b> que contesta las peticiones.',
    aws: 'Una instancia EC2',
    chuy: EN_P1,
    async accion(m) {
      m.chuy({ x: 1040, y: Y, etq: 'hambre: 3 tacos' });
      await m.espera(700);
      await m.viajar('p1', 2000);
      m.globo(1500, 830, '¡Tres de pastor, marchando!', { ms: 1800 });
      await m.espera(1600);
      const t = m.pieza('taco', '', 1460, 1030);
      await m.mover(t, 'taco-1', 1100);
      m.quitar(t);
      m.chuy({ etq: '¡mis tacos!', brinca: true });
      m.sello(1556, 1020, true);
    },
    nota: 'Es la instancia de la sesión 1: un servidor web con Apache. Hoy la vamos a multiplicar.'
  },
  {
    id: 'pico',
    cam: 'calle-ancha',
    parada: 'El problema',
    titulo: 'Llega la hora pico',
    texto: 'A las dos de la tarde la fila da vuelta a la esquina. El taquero <b>ya no se da abasto</b>: los pedidos se atrasan y algunos clientes se van.',
    aws: 'La demanda cambia',
    fin: ['fila-larga', 'pico'],
    chuy: EN_P1,
    async accion(m) {
      await m.espera(800);
      m.bandera('fila-larga', true);
      await m.espera(2400);
      m.bandera('pico', true);
      m.globo(1500, 815, '¡No me doy abasto!', { escala: 1.6 });
      await m.espera(1500);
      const c = m.mini(ROJO, 'me voy', 1040, Y, 1.3);
      m.sello(1040, 1040, false, 1800);
      await m.mover(c, 'vete', 2200);
      m.quitar(c);
    },
    nota: 'En internet pasa con las inscripciones, el Buen Fin o un video que se vuelve viral. Si la página no responde, la gente se va con la competencia.'
  },
  {
    id: 'vertical',
    cam: 'cocina-a',
    parada: 'Primera idea',
    titulo: '¿Un taquero gigante?',
    texto: 'Podrías cambiarlo por uno <b>más grande y más rápido</b>. Atiende más, pero tiene un tope, hay que cerrar para cambiarlo y, si se enferma, <b>se acaba todo</b>.',
    aws: 'Escalar verticalmente',
    fin: ['grande'],
    chuy: EN_P1,
    async accion(m) {
      await m.espera(1200);
      m.destello(1500, 930);
      m.bandera('grande', true);
      await m.espera(1300);
      m.globo(1500, 760, 'Soy más rápido… pero sigo siendo uno', { escala: 1.15 });
      await m.espera(1600);
      m.sello(1640, 860, false);
    },
    nota: 'Vertical = un servidor más grande (de t2.micro a una instancia con más CPU y memoria). Tiene tope y es un solo punto de falla.'
  },
  {
    id: 'horizontal',
    cam: 'cocina',
    parada: 'Mejor idea',
    titulo: 'Mejor, más planchas iguales',
    texto: 'Abre otra plancha con <b>otro taquero igual</b>. Si llega más gente, abres otra; cuando se va, cierras. Y si uno falla, los demás siguen.',
    aws: 'Escalar horizontalmente',
    menos: ['grande', 'pico', 'fila-larga'],
    fin: ['t2'],
    chuy: EN_P1,
    async accion(m) {
      await m.espera(1400);
      m.destello(2200, 930);
      m.bandera('t2', true);
      await m.espera(900);
      m.globo(2200, 830, '¡Llegué a ayudar!');
      await m.espera(900);
      m.sello(2280, 860, true);
    },
    nota: 'La nube premia lo horizontal: muchos servidores chicos e iguales. Esa es la elasticidad: crecer y encogerse según la gente.'
  },
  {
    id: 'receta',
    cam: 'edificio',
    parada: 'Que todos cocinen igual',
    titulo: 'La receta de la casa',
    texto: 'El taquero nuevo no improvisa: sigue una <b>receta escrita</b> con todo, desde la tortilla hasta qué hacer al llegar. Así cualquier taquero nuevo sale igualito.',
    aws: 'Plantilla de lanzamiento',
    mas: ['receta'],
    chuy: EN_P1,
    async accion(m) {
      await m.espera(1400);
      m.brilla('tb-receta');
      await m.espera(800);
      const r = m.pieza('receta', '', 1975, 570, 1.2);
      await m.mover(r, 'receta-2', 1900);
      m.quitar(r);
      m.globo(2200, 830, 'Leí la receta: quedan igualitos', { escala: 1.3 });
    },
    nota: 'La plantilla guarda la AMI, el tipo t2.micro, el grupo de seguridad y el user data («al llegar: prende la plancha» = instalar Apache). Es la que crean en los pasos 2 a 5 del laboratorio.'
  },
  {
    id: 'gerente',
    cam: 'edificio',
    parada: 'El que lleva la cuenta',
    titulo: 'El gerente cuida los números',
    texto: 'En su tablero dice: <b>mínimo 1</b> taquero, <b>normalmente 2</b>, <b>nunca más de 3</b>. Él solo llama o manda a casa taqueros para cumplirlo, usando la receta.',
    aws: 'Grupo de Auto Scaling',
    mas: ['tablero'],
    chuy: EN_P1,
    async accion(m) {
      await m.espera(1500);
      m.brilla('tb-min');
      await m.espera(1000);
      m.brilla('tb-des');
      await m.espera(1000);
      m.brilla('tb-max');
      await m.espera(700);
      m.globo(1880, 580, 'Mínimo 1, deseado 2, máximo 3', { escala: 1.3, cola: -90 });
    },
    nota: 'Mínimo, deseado y máximo: son los tres números del paso 9 del laboratorio (1, 2 y 3). El máximo también es un tope de gasto.'
  },
  {
    id: 'zonas',
    cam: 'cocina',
    parada: 'Que no dependa de un lugar',
    titulo: 'Uno en cada local',
    texto: 'El gerente reparte a sus taqueros en <b>dos locales</b>. Si en uno se va la luz, el otro sigue vendiendo.',
    aws: 'Varias zonas de disponibilidad',
    mas: ['zonas'],
    chuy: EN_P1,
    async accion(m) {
      await m.espera(1500);
      m.bandera('sinluz', true);
      m.globo(1585, 860, '¡Se fue la luz!', { ms: 2400 });
      await m.espera(1600);
      m.globo(2200, 830, 'Aquí seguimos vendiendo');
      m.sello(2290, 860, true);
      await m.espera(2400);
      m.bandera('sinluz', false);
    },
    nota: 'Cada local es una zona de disponibilidad: un centro de datos con su propia luz y red. En el laboratorio eligen us-east-1a y us-east-1b.'
  },
  {
    id: 'enfermo',
    cam: 'edificio',
    parada: 'Se cura solo',
    titulo: 'Un taquero se enferma',
    texto: 'El gerente revisa a cada taquero. Si uno no responde, lo manda a casa y <b>llama a otro con la misma receta</b>. Nadie tuvo que avisarle.',
    aws: 'Revisión de salud · reemplazo',
    chuy: EN_P1,
    async accion(m) {
      await m.espera(1300);
      m.bandera('enfermo1', true);
      m.globo(1500, 830, 'Me siento mal…', { ms: 2000, escala: 1.3 });
      await m.espera(2100);
      m.globo(1880, 580, '¡El taquero 1 no responde!', { ms: 2000, escala: 1.3, cola: -90 });
      await m.espera(1800);
      m.bandera('t1', false);
      await m.espera(1100);
      m.bandera('enfermo1', false);
      const r = m.pieza('receta', '', 1975, 570, 1.2);
      await m.mover(r, 'receta-1', 1700);
      m.quitar(r);
      m.destello(1500, 930);
      m.bandera('t1', true);
      await m.espera(800);
      m.globo(1500, 830, 'Taquero nuevo, misma receta', { escala: 1.3 });
      m.sello(1580, 860, true);
    },
    nota: 'Es lo que ven en el laboratorio: terminan una instancia y en Activity aparece «Terminating… EC2 health check» y luego «Launching a new EC2 instance… unhealthy instance needing to be replaced».'
  },
  {
    id: 'pizarra',
    cam: 'pizarra',
    parada: 'Mirar cómo va',
    titulo: 'La pizarra de la cocina',
    texto: 'Cada minuto se apunta <b>qué tan ocupada</b> está cada plancha. De un vistazo se ve si la cocina va tranquila o a reventar.',
    aws: 'Amazon CloudWatch · métricas',
    mas: ['pizarra'],
    fin: ['alto'],
    chuy: EN_P1,
    async accion(m) {
      await m.espera(1600);
      m.globo(2610, 560, 'Va tranquila: 35 %', { ms: 2000, cola: -120 });
      await m.espera(2200);
      m.bandera('alto', true);
      await m.espera(1500);
      m.globo(2610, 560, '¡Ya va en 85 %!', { escala: 1.15, cola: -110 });
    },
    nota: 'CloudWatch junta las métricas de casi todo AWS: CPU de las instancias, peticiones, errores. Las métricas básicas de EC2 llegan cada 5 minutos sin costo.'
  },
  {
    id: 'campana',
    cam: 'edificio',
    parada: 'Que reaccione solo',
    titulo: 'La campanita avisa sola',
    texto: 'Una regla: si la ocupación pasa de <b>70 %</b>, suena la campana. El gerente la oye y <b>abre otra plancha</b> sin que nadie se lo pida.',
    aws: 'Alarma + política de escalado',
    mas: ['campana'],
    fin: ['t3', 'd3'],
    chuy: EN_P1,
    async accion(m) {
      await m.espera(1400);
      m.bandera('suena', true);
      m.globo(2580, 430, '¡Tilín, tilín!', { ms: 2000, escala: 1.3 });
      await m.espera(1800);
      m.bandera('suena', false);
      m.globo(1880, 580, 'Subo el deseado a 3', { ms: 2000, escala: 1.3, cola: -90 });
      m.bandera('d3', true);
      m.brilla('tb-des');
      await m.espera(1600);
      const r = m.pieza('receta', '', 1975, 570, 1.2);
      await m.mover(r, 'receta-3', 1500);
      m.quitar(r);
      m.destello(1800, 930);
      m.bandera('t3', true);
      await m.espera(700);
      m.globo(1800, 830, '¡A sus órdenes!', { escala: 1.3 });
    },
    nota: 'Es la política de seguimiento de objetivo del paso 9: «mantén la CPU promedio en 50 %». Cuando baja la gente, también cierra planchas, sin pasar del mínimo.'
  },
  {
    id: 'tope',
    cam: 'cocina',
    parada: 'Hasta aquí',
    titulo: '¿Y si sigue llegando gente?',
    texto: 'Hay una cuarta plancha libre, pero el gerente <b>no pasa del máximo</b>: tres. Es el tope que tú pusiste, también para que la cuenta no se dispare.',
    aws: 'Capacidad máxima',
    chuy: EN_P1,
    async accion(m) {
      await m.espera(1500);
      m.brilla('hueco-4');
      m.globo(2420, 880, '¿Un cuarto taquero? No: el máximo es 3', { escala: 1.1, cola: 110 });
      m.sello(2540, 960, false);
    },
    nota: 'Si el negocio crece, subes el máximo. El sandbox de DataCamp no deja pasar de 3 instancias en un grupo.'
  },
  {
    id: 'sandbox',
    cam: 'edificio',
    parada: 'Lo que vas a ver en el laboratorio',
    titulo: 'En el sandbox, la campana no se deja colgar',
    texto: 'El sandbox no deja crear alarmas. Por eso, al crear el grupo, la regla del 50 % sale con un <b>aviso rojo</b>. El gerente sí reemplaza enfermos; el deseado lo subes tú.',
    aws: 'cloudwatch:PutMetricAlarm negado',
    fin: ['negada'],
    chuy: EN_P1,
    async accion(m) {
      await m.espera(1500);
      m.bandera('negada', true);
      m.globo(2580, 430, 'Failed to create 1 Scaling policy', { escala: 1.05, cola: 60 });
      m.sello(2650, 530, false);
      await m.espera(2400);
      m.brilla('tb-des');
      m.globo(1880, 580, 'El deseado lo cambias tú', { ms: 2600, escala: 1.3, cola: -90 });
    },
    nota: 'El grupo se crea y funciona: el aviso rojo es esperado. En el paso 13 del laboratorio suben el deseado a 3 con Edit.'
  },
  {
    id: 'bitacora',
    cam: 'oficina',
    parada: 'Quién hizo qué',
    titulo: 'La bitácora de la oficina',
    texto: 'La pizarra dice <b>cómo va</b> la cocina. La bitácora apunta <b>quién hizo qué</b>: quién apagó una plancha, a qué hora y desde dónde.',
    aws: 'AWS CloudTrail',
    mas: ['bitacora'],
    menos: ['negada'],
    chuy: EN_P1,
    async accion(m) {
      await m.espera(1500);
      m.brilla('tb-bitacora');
      await m.espera(500);
      m.globo(2500, 600, '14:02 · Mariana apagó la plancha 1', { escala: 1.15, cola: 95 });
    },
    nota: 'Confusión clásica del examen: CloudWatch mide (rendimiento, alarmas); CloudTrail registra las llamadas a la API (auditoría). En el sandbox CloudTrail está negado.'
  },
  {
    id: 'anfitrion',
    cam: 'puerta',
    parada: 'La puerta',
    titulo: 'El anfitrión reparte a los clientes',
    texto: 'Ya hay tres planchas, pero los clientes solo ven <b>una puerta</b>. El anfitrión recibe a cada uno y lo manda a la plancha que esté más libre.',
    aws: 'Elastic Load Balancing',
    mas: ['anfitrion'],
    chuy: EN_P2,
    async accion(m) {
      m.chuy({ x: 1040, y: Y, etq: 'hambre: 3 tacos' });
      await m.espera(1400);
      m.globo(1110, 990, 'Pase a la 1', { ms: 1200, escala: 1.35 });
      const a = m.mini(TEAL, '', 1040, Y);
      await m.mover(a, 'p1', 1500);
      m.globo(1110, 990, 'Usted a la 3', { ms: 1200, escala: 1.35 });
      const b = m.mini(LILA, '', 1040, Y);
      await m.mover(b, 'p3', 1700);
      m.globo(1110, 990, 'Y tú, a la 2', { ms: 1300, escala: 1.35 });
      await m.viajar('p2', 2300);
      m.chuy({ etq: 'a la plancha 2', brinca: true });
      m.sello(2270, 1030, true);
      m.quitar(a, 400);
      m.quitar(b, 400);
    },
    nota: 'Los clientes conocen la dirección del balanceador, no la de cada servidor. En el sandbox los balanceadores están negados; por eso el laboratorio usa la IP de cada instancia.'
  },
  {
    id: 'apagada',
    cam: 'puerta',
    parada: 'La puerta',
    titulo: 'A la plancha apagada no manda a nadie',
    texto: 'El anfitrión también revisa las planchas. Si una deja de responder, <b>deja de mandarle clientes</b> y reparte entre las demás.',
    aws: 'Revisión de salud del balanceador',
    fin: ['enfermo2'],
    chuy: EN_P3,
    async accion(m) {
      m.chuy({ x: 1040, y: Y, etq: 'hambre: 3 tacos' });
      await m.espera(1300);
      m.bandera('enfermo2', true);
      m.sello(2200, 880, false, 2200);
      await m.espera(1200);
      m.globo(1190, 990, 'La 2 no contesta: vaya a la 3', { escala: 1.35, cola: -60 });
      await m.viajar('p3', 2100);
      m.chuy({ etq: 'a la plancha 3', brinca: true });
    },
    nota: 'El balanceador solo deja de mandarle tráfico; el que reemplaza al enfermo es Auto Scaling. Juntos: el balanceador reparte y el grupo mantiene el número de servidores sanos.'
  },
  {
    id: 'balanceadores',
    cam: 'puerta',
    tarjeta: 'tres',
    chuy: EN_P3,
    nota: 'El examen pregunta cuál elegir: rutas por URL o HTTP/HTTPS → ALB; millones de conexiones TCP/UDP, IP fija, latencia mínima → NLB; firewalls de terceros → GWLB.'
  },
  {
    id: 'riel',
    cam: 'riel',
    parada: 'Que no se pierdan los pedidos',
    titulo: 'Las comandas esperan su turno',
    texto: 'La cajera ya no le grita al taquero: <b>cuelga la comanda en el riel</b>. Cada taquero toma la siguiente cuando puede. Si uno se tarda, la comanda espera; no se pierde.',
    aws: 'Amazon SQS · una cola',
    mas: ['caja', 'riel'],
    menos: ['enfermo2'],
    chuy: EN_P3,
    async accion(m) {
      await m.espera(1400);
      const a = m.pieza('comanda', '', 1300, 990, 1.4);
      await m.mover(a, 'riel-1', 1700);
      m.sello(1560, 880, true, 1400);
      m.quitar(a, 300);
      const b = m.pieza('comanda', '', 1300, 990, 1.4);
      await m.mover(b, 'riel-3', 2000);
      m.sello(1860, 880, true, 1400);
      m.quitar(b, 300);
      const c = m.pieza('comanda', '', 1300, 990, 1.4);
      await m.mover(c, 'riel-2', 2400);
      m.globo(2200, 800, 'Espero aquí hasta que me tomen', { ms: 2300, escala: 1.2 });
      await m.espera(2400);
      m.sello(2260, 880, true);
      m.quitar(c, 300);
    },
    nota: 'SQS desacopla: quien produce (la caja) y quien consume (el taquero) no tienen que ir al mismo ritmo. Palabra clave: «que no se pierdan los pedidos si el sistema de envíos se satura».'
  },
  {
    id: 'megafono',
    cam: 'megafono',
    parada: 'Avisar a muchos',
    titulo: 'Un aviso, muchos oídos',
    texto: 'Cuando alguien paga, el gerente lo dice <b>una vez</b> por el megáfono y le llega a todos los que se apuntaron: un correo, un mensaje al celular de Chuy y el timbre del ayudante.',
    aws: 'Amazon SNS',
    mas: ['megafono', 'ventanilla'],
    menos: ['caja', 'riel'],
    chuy: { ...EN_CALLE, etq: 'ya pagué' },
    async accion(m) {
      m.chuy({ ...EN_CALLE, etq: 'ya pagué' });
      await m.espera(1500);
      m.globo(1880, 580, '¡Pedido pagado!', { escala: 2.1, cola: -40 });
      await m.espera(900);
      const s = m.pieza('celular', '', 1745, 620, 2);
      const c = m.pieza('sobre', '', 1745, 620, 2);
      const t = m.pieza('campanita', '', 1835, 620, 2);
      await Promise.all([m.mover(s, 'mega-sms', 2400), m.mover(c, 'mega-correo', 2200), m.mover(t, 'mega-timbre', 2400)]);
      m.brilla('tb-timbre');
      m.sello(930, 880, true);
      m.chuy({ etq: '¡me llegó!', brinca: true });
    },
    nota: 'SNS = publicar y suscribirse: un mensaje, muchos destinos (correo, SMS, Lambda, colas SQS). SQS en cambio guarda el mensaje para un solo consumidor.'
  },
  {
    id: 'ayudante',
    cam: 'ventanilla',
    parada: 'Sin servidores',
    titulo: 'El ayudante que llega con el timbre',
    texto: 'No tiene plancha ni horario: <b>aparece cuando suena el timbre</b>, hace su trabajo, como una salsa, y se va. Solo se le paga cada vez que lo llaman.',
    aws: 'AWS Lambda',
    menos: ['megafono'],
    chuy: EN_KIOSKO,
    async accion(m) {
      m.chuy({ ...EN_KIOSKO });
      await m.espera(1400);
      m.brilla('tb-timbre');
      m.globo(2885, 960, '¡Ring!', { ms: 1400 });
      await m.espera(900);
      m.bandera('ayudante', true);
      await m.espera(1100);
      const s = m.pieza('molcajete', '', 2990, 1010, 1.1);
      m.globo(2990, 930, '¡Salsa lista!', { ms: 2200 });
      await m.espera(2400);
      m.quitar(s);
      m.bandera('ayudante', false);
      m.globo(2990, 930, '…y se fue', { ms: 1800 });
    },
    nota: 'Lambda corre código cuando pasa algo (una foto que se sube, un pedido pagado) sin administrar servidores. Cada ejecución dura máximo 15 minutos.'
  },
  {
    id: 'escala',
    cam: 'ventanilla',
    parada: 'Sin servidores',
    titulo: '¿Y si suena medio millón de veces?',
    texto: 'Llegan tantos ayudantes como timbrazos, y cada uno trabaja <b>máximo 15 minutos</b>. En la demostración de la consola: 494,077 llamadas y $0.00 de costo.',
    aws: 'Lambda escala solo',
    mas: ['contador'],
    chuy: EN_KIOSKO,
    async accion(m) {
      await m.espera(1300);
      const puntos = [[2860, 820], [3120, 840], [2800, 960], [3170, 990], [2930, 760], [3070, 760], [3200, 900]];
      for (const [x, y] of puntos) {
        const a = m.mini(LILA, 'λ', x, y, 0.8);
        m.quitar(a, 1800);
        await m.espera(260);
      }
      m.brilla('tb-contador');
      await m.espera(800);
      m.globo(2990, 930, 'Se paga por llamada, no por hora', { escala: 1.1 });
    },
    nota: 'La demo de la portada de Lambda es una simulación; en una cuenta real, el primer millón de solicitudes al mes entra en la capa gratuita.'
  },
  {
    id: 'reloj',
    cam: 'ventanilla',
    parada: 'Cuando pasa algo',
    titulo: 'El reloj de pared también llama',
    texto: 'A las <b>2:00 a. m.</b> el reloj toca el timbre para que el ayudante limpie la cocina. Otros avisos también pueden llamarlo: «se acabaron las tortillas».',
    aws: 'Amazon EventBridge',
    mas: ['reloj'],
    chuy: EN_KIOSKO,
    async accion(m) {
      await m.espera(1400);
      m.brilla('tb-reloj');
      m.globo(2990, 760, '¡Son las 2:00!', { ms: 1800 });
      await m.espera(1600);
      m.bandera('ayudante', true);
      await m.espera(900);
      m.globo(2990, 930, 'A limpiar la cocina', { ms: 2200 });
      await m.espera(2400);
      m.bandera('ayudante', false);
    },
    nota: 'EventBridge dispara acciones por horario (como un cron) o por eventos de otros servicios. Breve: Fargate corre contenedores sin administrar servidores; ECS y EKS los orquestan.'
  },
  {
    id: 'laboratorio',
    cam: 'edificio',
    parada: 'Lo que vas a hacer en el laboratorio',
    titulo: 'Tu receta, tu gerente y dos taqueros',
    texto: 'Creas la receta y el grupo con <b>2 taqueros en dos locales</b>. Luego despides a uno… y el gerente pone otro solo. Al final subes el deseado a 3 y borras todo.',
    aws: 'Plantilla + grupo de Auto Scaling',
    menos: ['ventanilla', 'contador', 'reloj'],
    chuy: EN_P3,
    async accion(m) {
      await m.espera(1500);
      m.sello(1500, 880, false, 1600);
      m.globo(1500, 820, 'Terminate (delete)', { ms: 1600, escala: 1.3 });
      await m.espera(1400);
      m.bandera('t1', false);
      await m.espera(1500);
      m.globo(1880, 580, 'Falta uno: llamo a otro', { ms: 2200, escala: 1.3, cola: -90 });
      await m.espera(1200);
      const r = m.pieza('receta', '', 1975, 570, 1.2);
      await m.mover(r, 'receta-1', 1600);
      m.quitar(r);
      m.destello(1500, 930);
      m.bandera('t1', true);
      m.confeti(1500, 860);
    },
    nota: 'Evidencias del laboratorio: la página servida por una instancia del grupo, el reemplazo en Activity y el grupo con 3 instancias. Recuérdales borrar el grupo, la plantilla y el grupo de seguridad.'
  },
  { id: 'repaso', cam: 'mapa', tarjeta: 'repaso', temporal: TODAS, chuy: { ver: false } },
  { id: 'guia', cam: 'mapa', tarjeta: 'guia', temporal: TODAS, chuy: { ver: false }, nota: 'Léanla como preguntas del examen: busquen la palabra clave de cada caso.' },
  { id: 'quiz', cam: 'mapa', tarjeta: 'quiz', temporal: TODAS, chuy: { ver: false }, nota: 'Que contesten en voz alta antes de tocar la respuesta.' },
  { id: 'fin', cam: 'mapa', tarjeta: 'fin', temporal: TODAS, chuy: { ver: false } }
];
