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
//   paq       dónde queda el paquete al terminar: { x, y, etq, ver }
//   rastro    tramos de la ruta que ya quedaron pintados
//   accion    la animación; recibe las herramientas del motor
//   nota      apunte para el docente (tecla N)
//
// Direcciones: 203.0.113.x y 198.51.100.x son rangos reservados para ejemplos.
// ---------------------------------------------------------------------------

export const TODAS = [
  'resuelto', 'vpc-etq', 'zonas', 'calles', 'casas', 'ips', 'publica', 'puerta-etq',
  'abierta', 'letrero-cruce', 'letreros', 'casetas', 'guardias', 'nat'
];

const ROJO = '#ff4f8b';
const VERDE = '#7be495';
const CIAN = '#4cc9f0';
const AMARILLO = '#ffcf3f';

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
    id: 'ana',
    cam: 'ana',
    parada: 'El punto de partida',
    titulo: 'Ana quiere entrar a tienda.com',
    texto: 'Toca la pantalla y su celular arma un <b>paquete de datos</b>. Ese paquete tiene que llegar hasta el servidor de la tienda, que vive lejos, en un fraccionamiento de AWS.',
    paq: { x: 690, y: 1000, etq: 'tienda.com' },
    async accion(m) {
      m.paqui({ x: 610, y: 1010, ver: false });
      await m.espera(700);
      m.paqui({ x: 690, y: 1000, etq: 'tienda.com', ver: true, nace: true });
      await m.espera(500);
      m.globo(690, 905, '¡Hola! Soy Paqui');
    },
    nota: 'Pregunta al grupo: ¿cómo sabe el paquete a dónde ir?'
  },
  {
    id: 'direccion',
    cam: 'ana',
    tarjeta: 'direccion',
    paq: { x: 690, y: 1000, etq: 'tienda.com' },
    nota: 'En internet no hay nombres de calles: cada equipo tiene un número. Eso es la dirección IP.'
  },
  {
    id: 'consulta',
    cam: 'consulta',
    parada: 'Parada 1 · La agenda',
    titulo: 'Nadie se aprende los números',
    texto: 'Ana solo sabe el nombre. Su celular le pregunta a <b>la agenda de internet</b>: «¿en qué dirección vive tienda.com?». La agenda contesta con el número.',
    aws: 'DNS · Amazon Route 53',
    mas: ['resuelto'],
    paq: { x: 690, y: 1000, etq: '203.0.113.10' },
    async accion(m) {
      m.bandera('resuelto', false);
      await m.espera(900);
      const pregunta = m.mini(CIAN, '¿tienda.com?', 640, 960);
      await m.mover(pregunta, 'consulta', 1700);
      m.bandera('resuelto', true);
      m.etqMini(pregunta, '203.0.113.10');
      m.sello(1150, 500, true);
      await m.espera(900);
      await m.mover(pregunta, 'consulta', 1500, { reversa: true });
      m.quitar(pregunta);
      m.paqui({ etq: '203.0.113.10', brinca: true });
    },
    nota: 'El DNS traduce nombres a direcciones IP. En AWS el servicio se llama Route 53.'
  },
  {
    id: 'internet',
    cam: 'internet',
    parada: 'Parada 2 · La autopista',
    titulo: 'Con la dirección en la etiqueta, a la carretera',
    texto: 'Internet es una autopista enorme. Miles de paquetes viajan al mismo tiempo y cada uno lleva escrito <b>a qué número va</b>. Ese número, visible para todos, es la dirección pública.',
    aws: 'Dirección IP pública',
    paq: { x: 1690, y: 960, etq: '203.0.113.10' },
    rastro: ['autopista'],
    async accion(m) {
      await m.espera(700);
      await m.viajar('autopista', 4300, { rastro: true });
    }
  },
  {
    id: 'vpc',
    cam: 'vpc',
    parada: 'El destino',
    titulo: 'Un fraccionamiento con barda',
    texto: 'El servidor vive en una red privada. Tiene barda: nada entra ni sale por donde sea. En AWS ese fraccionamiento se llama <b>VPC</b> y es solo tuyo.',
    aws: 'VPC · Virtual Private Cloud',
    mas: ['vpc-etq'],
    paq: { x: 1690, y: 960, etq: '203.0.113.10' },
    rastro: ['autopista'],
    nota: 'La VPC vive en una región. Cada cuenta trae una por omisión: en ella lanzaron su servidor de la sesión 1.'
  },
  { id: 'anatomia', cam: 'vpc', tarjeta: 'anatomia', sub: 0, paq: { x: 1690, y: 960, etq: '203.0.113.10' }, rastro: ['autopista'] },
  { id: 'cidr16', cam: 'vpc', tarjeta: 'anatomia', sub: 1, paq: { x: 1690, y: 960, etq: '203.0.113.10' }, rastro: ['autopista'], nota: 'Mientras más chico el número después de la diagonal, más grande la red.' },
  { id: 'cidr24', cam: 'vpc', tarjeta: 'anatomia', sub: 2, paq: { x: 1690, y: 960, etq: '203.0.113.10' }, rastro: ['autopista'] },
  { id: 'cidr0', cam: 'vpc', tarjeta: 'anatomia', sub: 3, paq: { x: 1690, y: 960, etq: '203.0.113.10' }, rastro: ['autopista'], nota: 'No hay que hacer cuentas en el examen: /16 es grande, /24 mediana y 0.0.0.0/0 es «todo internet».' },
  {
    id: 'calles',
    cam: 'vpc',
    parada: 'Por dentro',
    titulo: 'Las calles son grupos de direcciones',
    texto: 'Cada calle junta las casas cuyo número empieza igual. En AWS una calle se llama <b>subred</b>: <code>10.0.1.0/24</code> son todas las casas «10.0.1.algo».',
    aws: 'Subred',
    mas: ['zonas', 'calles'],
    paq: { x: 1690, y: 960, etq: '203.0.113.10' },
    rastro: ['autopista'],
    nota: 'Una subred vive en una sola zona de disponibilidad.'
  },
  {
    id: 'casas',
    cam: 'vpc',
    parada: 'Por dentro',
    titulo: 'Las casas son los servidores',
    texto: 'Cada casa tiene su número. El servidor web vive en <code>10.0.1.25</code> y la base de datos en <code>10.0.2.40</code>. Ese número solo sirve <b>dentro</b> del fraccionamiento.',
    aws: 'Instancia EC2 · IP privada',
    mas: ['casas', 'ips'],
    paq: { x: 1690, y: 960, etq: '203.0.113.10' },
    rastro: ['autopista']
  },
  {
    id: 'puerta',
    cam: 'puerta',
    parada: 'Parada 3 · La puerta',
    titulo: 'Una sola entrada',
    texto: 'La puerta conecta el fraccionamiento con la autopista. Ahí le cambian la etiqueta al paquete: de la dirección de afuera (<code>203.0.113.10</code>) al número de adentro (<code>10.0.1.25</code>).',
    aws: 'Internet Gateway',
    mas: ['puerta-etq', 'publica'],
    fin: ['abierta'],
    paq: { x: 1880, y: 960, etq: '10.0.1.25' },
    rastro: ['autopista', 'entrar'],
    async accion(m) {
      await m.espera(1100);
      m.bandera('abierta', true);
      await m.espera(700);
      m.paqui({ etq: '10.0.1.25', brinca: true });
      m.sello(1690, 850, true);
      await m.espera(800);
      await m.viajar('entrar', 1500, { rastro: true });
    },
    nota: 'Sin Internet Gateway, la VPC queda aislada de internet. Es lo que les va a negar el sandbox en el paso 10.'
  },
  {
    id: 'cruce',
    cam: 'cruce',
    parada: 'Parada 4 · El letrero',
    titulo: 'El paquete no se sabe el camino',
    texto: 'En cada esquina lee el letrero y busca la regla que describe su destino. <code>10.0.1.25</code> empieza con «10.0»: la regla dice <b>local</b>, vive aquí adentro.',
    aws: 'Tabla de rutas · ruta local',
    mas: ['letrero-cruce'],
    paq: { x: 2060, y: 960, etq: '10.0.1.25' },
    rastro: ['autopista', 'entrar', 'al-cruce'],
    async accion(m) {
      await m.espera(900);
      await m.viajar('al-cruce', 1400, { rastro: true });
      m.brilla('tb-cruce');
      m.globo(2196, 874, '10.0… ¡es aquí adentro!', { cola: -110 });
    },
    nota: 'Toda tabla de rutas trae la ruta local: dentro de la VPC, las subredes siempre se alcanzan entre sí.'
  },
  {
    id: 'caseta',
    cam: 'caseta',
    parada: 'Parada 5 · La caseta',
    titulo: 'El primer guardia cuida toda la calle',
    texto: 'Trae una lista numerada y la lee en orden. Puede <b>permitir</b> y también <b>negar</b>. No tiene memoria: revisa a todos al entrar y otra vez al salir.',
    aws: 'NACL · Network ACL',
    mas: ['casetas'],
    fin: ['caseta-abierta'],
    paq: { x: 2105, y: 850, etq: '10.0.1.25' },
    rastro: ['autopista', 'entrar', 'al-cruce', 'a-caseta'],
    async accion(m) {
      await m.espera(800);
      await m.viajar('a-caseta', 1900, { rastro: true });
      m.globo(2180, 724, 'Regla 100 · puerto 80 · permitir', { cola: -30 });
      await m.espera(1100);
      m.sello(2222, 790, true);
      m.bandera('caseta-abierta', true);
    },
    nota: 'La NACL actúa sobre la subred completa y es stateless. La vieron en la sesión 2.'
  },
  {
    id: 'guardia',
    cam: 'casa',
    parada: 'Parada 6 · La puerta de la casa',
    titulo: 'El segundo guardia cuida una sola casa',
    texto: 'Su lista solo dice a quién <b>sí</b> deja pasar; lo que no está en la lista no entra. Y tiene memoria: si te dejó entrar, tu respuesta sale sin preguntar.',
    aws: 'Grupo de seguridad',
    mas: ['guardias'],
    paq: { x: 2300, y: 850, etq: '10.0.1.25' },
    rastro: ['autopista', 'entrar', 'al-cruce', 'a-caseta', 'a-casa'],
    async accion(m) {
      await m.espera(800);
      await m.viajar('a-casa', 1700, { rastro: true });
      m.globo(2470, 826, '¿Puerto 80? Pásale', { ms: 2000, abajo: true, cola: -84 });
      m.sello(2440, 790, true, 2000);
      await m.espera(2300);
      const intruso = m.mini(ROJO, 'puerto 22', 2060, 850);
      await m.mover(intruso, 'intruso-calle', 1500);
      m.globo(2535, 826, '¿Puerto 22? No estás en mi lista', { abajo: true, cola: -149 });
      m.sello(2440, 790, false);
      await m.espera(1700);
      await m.mover(intruso, 'intruso-calle', 1100, { reversa: true });
      m.quitar(intruso);
    },
    nota: 'El grupo de seguridad es stateful y solo tiene reglas de permitir. Es la diferencia que más pregunta el examen.'
  },
  {
    id: 'entregado',
    cam: 'casa',
    parada: 'El destino',
    titulo: '¡Entregado!',
    texto: 'El servidor web recibe el paquete, arma la página de la tienda y manda la <b>respuesta</b> de regreso al celular de Ana.',
    aws: 'Servidor web en EC2',
    fin: ['entregado'],
    paq: { x: 2300, y: 800, ver: false },
    rastro: ['autopista', 'entrar', 'al-cruce', 'a-caseta', 'a-casa', 'a-puerta'],
    async accion(m) {
      await m.espera(500);
      await m.viajar('a-puerta', 800, { rastro: true });
      m.paqui({ ver: false });
      m.bandera('entregado', true);
      m.confeti(2300, 760);
    }
  },
  {
    id: 'respuesta',
    cam: 'todo',
    parada: 'El regreso',
    titulo: 'La respuesta vuelve por donde vino',
    texto: 'Guardia, caseta, puerta y autopista, ahora de salida. Todo el viaje, de ida y vuelta, tarda <b>milisegundos</b>.',
    aws: 'Tráfico de salida',
    paq: { x: 2300, y: 800, ver: false },
    rastro: [],
    async accion(m) {
      m.rastros(['autopista', 'entrar', 'al-cruce', 'a-caseta', 'a-casa', 'a-puerta']);
      await m.espera(1300);
      const r = m.mini(VERDE, 'página lista', 2300, 850, 1.7);
      await m.mover(r, 'a-casa', 700, { reversa: true });
      await m.mover(r, 'a-caseta', 800, { reversa: true });
      await m.mover(r, 'al-cruce', 500, { reversa: true });
      await m.mover(r, 'entrar', 500, { reversa: true });
      await m.mover(r, 'autopista', 2600, { reversa: true });
      m.quitar(r);
      m.rastros([]);
      m.sello(600, 900, true);
      m.globo(600, 830, '¡Ya cargó la tienda!', { escala: 1.9 });
    }
  },
  {
    id: 'letreros',
    cam: 'calles',
    parada: 'La idea clave',
    titulo: '¿Qué hace pública a una calle?',
    texto: 'Su letrero. La respuesta pudo salir porque el letrero de esa calle dice: «lo que no sea de aquí, a la <b>puerta</b>». <code>0.0.0.0/0</code> significa «cualquier otro lugar».',
    aws: 'Subred pública = ruta 0.0.0.0/0 → Internet Gateway',
    mas: ['letreros'],
    paq: { ver: false },
    async accion(m) {
      await m.espera(1500);
      m.brilla('tb-puerta');
    },
    nota: 'Esta es la idea central de la sesión: lo que hace pública a una subred es su tabla de rutas, no su nombre ni su zona.'
  },
  {
    id: 'privada',
    cam: 'calles',
    parada: 'La idea clave',
    titulo: 'La calle privada no tiene ese letrero',
    texto: 'Aquí vive la base de datos. Su calle solo conoce lo <b>local</b>: el servidor web llega caminando por dentro, pero ningún letrero lleva hacia la puerta.',
    aws: 'Subred privada',
    paq: { ver: false },
    async accion(m) {
      await m.espera(700);
      m.brilla('tb-vacia');
      const p = m.mini(CIAN, '10.0.2.40', 2300, 850);
      await m.espera(600);
      await m.mover(p, 'casa-bd', 2900);
      m.sello(2360, 1120, true);
      await m.espera(1300);
      m.quitar(p);
    },
    nota: 'Patrón clásico del examen: servidor web en subred pública, base de datos en subred privada.'
  },
  {
    id: 'intruso',
    cam: 'intruso',
    parada: 'La idea clave',
    titulo: 'Desde afuera, esa casa no existe',
    texto: '<code>10.0.2.40</code> es un número interior, como decir «la casa 40». En la autopista nadie sabe llegar a un número interior: el paquete curioso se queda afuera.',
    aws: 'IP privada: no se alcanza desde internet',
    paq: { ver: false },
    async accion(m) {
      await m.espera(900);
      const p = m.mini(ROJO, '10.0.2.40', 1420, 1085);
      await m.mover(p, 'intruso', 1900);
      m.globo(1700, 846, '¿10.0.2.40? Aquí afuera no existe');
      m.sello(1764, 958, false);
      await m.espera(2000);
      await m.mover(p, 'intruso', 1300, { reversa: true });
      m.quitar(p);
    }
  },
  {
    id: 'nat',
    cam: 'vpc',
    parada: 'Un caso especial',
    titulo: 'Salir sin que nadie entre',
    texto: 'La base de datos necesita descargar actualizaciones. Sale por una <b>puerta giratoria de solo salida</b>: ella puede ir a internet, pero nadie de internet puede entrar por ahí.',
    aws: 'NAT Gateway',
    mas: ['nat', 'ruta-nat'],
    paq: { ver: false },
    async accion(m) {
      await m.espera(1400);
      m.brilla('tb-nat');
      const p = m.mini(AMARILLO, 'actualización', 2360, 1210, 1.3);
      await m.mover(p, 'bd-nat', 3200);
      m.sello(2700, 690, true, 1400);
      await m.espera(700);
      await m.mover(p, 'nat-fuera', 2600);
      m.quitar(p);
    },
    nota: 'El NAT Gateway vive en una subred pública y da salida a las privadas. Solo de ida.'
  },
  {
    id: 'nombre',
    cam: 'privada',
    parada: 'Lo que vas a ver en el laboratorio',
    titulo: 'El nombre no hace pública a una calle',
    texto: 'Hoy vas a crear una subred llamada <b>«publica-1a»</b>… y va a ser privada. El sandbox no deja crear la puerta, así que su letrero nunca apunta a internet.',
    aws: 'Manda la tabla de rutas, no el nombre',
    mas: ['renombrada'],
    menos: ['nat', 'ruta-nat'],
    paq: { ver: false },
    async accion(m) {
      await m.espera(1600);
      m.brilla('tb-vacia');
    },
    nota: 'Es el paso 11 del laboratorio. Pide que alguien lo explique con sus palabras.'
  },
  { id: 'repaso', cam: 'mapa', tarjeta: 'repaso', menos: ['renombrada'], temporal: TODAS, paq: { ver: false } },
  { id: 'ruta', cam: 'mapa', tarjeta: 'ruta', temporal: TODAS, paq: { ver: false } },
  { id: 'quiz', cam: 'mapa', tarjeta: 'quiz', temporal: TODAS, paq: { ver: false }, nota: 'Que contesten en voz alta antes de tocar la respuesta.' },
  { id: 'fin', cam: 'mapa', tarjeta: 'fin', temporal: TODAS, paq: { ver: false } }
];
