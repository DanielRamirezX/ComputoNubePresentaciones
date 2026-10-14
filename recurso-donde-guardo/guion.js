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
//   sub       qué versión de la tarjeta se ve (la de «tres lugares» tiene dos)
//   mas/menos capas del mundo que se encienden o apagan desde este momento
//   fin       capas que se encienden al terminar la animación del momento
//   paq       dónde queda Foti al terminar: { x, y, etq, ver }
//   rastro    tramos de la ruta que ya quedaron pintados
//   accion    la animación; recibe las herramientas del motor
//   nota      apunte para el docente (tecla N)
// ---------------------------------------------------------------------------

export const TODAS = [
  'bodega-etq', 'nombre', 'cortina-etq', 'sotanos', 'servidores', 'ebs-etq', 'pizarron', 'efs', 'hospital', 'camion-llego'
];

const ROJO = '#ff4f8b';
const VERDE = '#7be495';
const CIAN = '#4cc9f0';
const AMARILLO = '#ffcf3f';
const LILA = '#b69cff';
const HIELO = '#b9e6ff';

const EN_ANA = { x: 690, y: 910, etq: 'playa.jpg' };
const EN_MOSTRADOR = { x: 1500, y: 768, etq: 'vacaciones/playa.jpg' };
const EN_CONGELADOR = { x: 1500, y: 1282, etq: 'día 180' };

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
    titulo: 'Ana volvió de la playa con 500 fotos',
    texto: 'Su celular ya no da para más. Quiere guardarlas en la nube: que <b>no se pierdan</b> y que <b>no le cueste de más</b>. Vamos a seguir a una de ellas.',
    paq: EN_ANA,
    async accion(m) {
      m.foti({ x: 610, y: 950, ver: false });
      await m.espera(700);
      m.foti({ ...EN_ANA, ver: true, nace: true });
      await m.espera(500);
      m.globo(690, 816, '¡Hola! Soy Foti');
    },
    nota: 'Pregunta al grupo: ¿dónde guardan sus fotos? ¿Qué pasa si pierden el celular?'
  },
  {
    id: 'casa',
    cam: 'ana',
    tarjeta: 'tres',
    sub: 0,
    paq: EN_ANA,
    nota: 'La idea de toda la sesión: no hay un solo lugar para guardar, hay uno para cada necesidad.'
  },
  {
    id: 'subir',
    cam: 'subida',
    parada: 'Parada 1 · La bodega',
    titulo: 'Una bodega que nunca se llena',
    texto: 'Foti sube por internet y cae en <b>la bodega de AWS</b>. Aquí cabe cualquier tipo de archivo y no hay que apartar espacio: se paga solo por lo que se guarda.',
    aws: 'Amazon S3',
    mas: ['bodega-etq'],
    paq: { x: 1500, y: 768, etq: 'playa.jpg' },
    rastro: ['subir'],
    async accion(m) {
      await m.espera(1000);
      await m.viajar('subir', 3600, { rastro: true });
      m.globo(1500, 684, '¡Aquí cabe lo que sea!', { escala: 1.5 });
    },
    nota: 'S3 = Simple Storage Service. Sirve para respaldos, fotos, videos, bitácoras y hasta sitios web estáticos.'
  },
  {
    id: 'cubeta',
    cam: 'cubeta',
    parada: 'Parada 1 · La bodega',
    titulo: 'Tu cubeta, con nombre único en el mundo',
    texto: 'Dentro de la bodega cada quien tiene su <b>cubeta</b> (en inglés, <i>bucket</i>). Su nombre no se puede repetir en todo el planeta: por eso la de Ana lleva su nombre y la fecha.',
    aws: 'Bucket',
    mas: ['nombre'],
    paq: { x: 1500, y: 768, etq: 'playa.jpg' },
    async accion(m) {
      m.rastros([]);
      await m.espera(1300);
      m.brilla('tb-nombre');
      await m.espera(1100);
      const otro = m.mini(LILA, '«fotos»', 1130, 480);
      await m.mover(otro, 'rebote', 1500);
      m.globo(1500, 418, '¿«fotos»? Ese nombre ya existe');
      m.sello(1562, 484, false);
      await m.espera(2000);
      await m.mover(otro, 'rebote', 1100, { reversa: true });
      m.quitar(otro);
    },
    nota: 'El bucket vive en una región, pero su nombre es global. Es el paso 3 del laboratorio: fotos-tu-nombre-fecha.'
  },
  {
    id: 'llave',
    cam: 'cubeta',
    parada: 'Parada 1 · La bodega',
    titulo: 'Cada cosa lleva su etiqueta',
    texto: 'Lo que guardas se llama <b>objeto</b>: el archivo y sus datos. Su nombre completo es la <b>llave</b>, como <code>vacaciones/playa.jpg</code>. Las «carpetas» no existen: son parte del nombre.',
    aws: 'Objeto · llave (key)',
    paq: EN_MOSTRADOR,
    async accion(m) {
      await m.espera(1300);
      m.foti({ etq: 'vacaciones/playa.jpg', brinca: true });
      await m.espera(1000);
      m.globo(1500, 684, 'Mi nombre completo es mi llave');
    },
    nota: 'Cada objeto puede pesar hasta 5 TB. En el paso 6 del laboratorio, crear una carpeta resulta ser subir un objeto.'
  },
  {
    id: 'copias',
    cam: 'copias',
    parada: 'Por qué no se pierde',
    titulo: 'Tres copias en tres edificios',
    texto: 'Apenas llega, la bodega saca copias de Foti y las reparte en <b>edificios distintos</b> (zonas de disponibilidad). Si uno se inunda, quedan los otros.',
    aws: '11 nueves de durabilidad',
    mas: ['zonas'],
    fin: ['copias'],
    paq: EN_MOSTRADOR,
    async accion(m) {
      await m.espera(1300);
      const b = m.pieza('foto', '', 1500, 768, 1.2);
      await m.mover(b, 'copia-b', 1500);
      const c = m.pieza('foto', '', 1500, 768, 1.2);
      await m.mover(c, 'copia-c', 1500);
      m.bandera('copias', true);
      m.quitar(b);
      m.quitar(c);
      m.globo(2048, 596, 'Si un edificio falla, quedan dos');
    },
    nota: '99.999999999 %. Durabilidad (no perder el dato) no es disponibilidad (poder leerlo ahora): S3 Standard tiene 11 nueves de durabilidad y 99.99 % de disponibilidad.'
  },
  {
    id: 'cortina',
    cam: 'cubeta',
    parada: 'Cómo se protege',
    titulo: 'La cortina viene cerrada',
    texto: 'Nadie de internet puede asomarse a la cubeta, aunque alguien se equivoque con los permisos. Viene así <b>desde el primer día</b>, y así conviene dejarla.',
    aws: 'Block Public Access',
    mas: ['cortina-etq'],
    paq: EN_MOSTRADOR,
    async accion(m) {
      await m.espera(1100);
      const p = m.mini(ROJO, 'curioso', 900, 770);
      await m.mover(p, 'curioso', 1700);
      m.globo(1140, 730, '¿Me dejas ver las fotos?', { ms: 1700 });
      await m.espera(2000);
      m.brilla('tb-candado');
      m.globo(1262, 706, 'Al público no se le abre', { cola: -48 });
      m.sello(1214, 772, false);
      await m.espera(2000);
      await m.mover(p, 'curioso', 1200, { reversa: true });
      m.quitar(p);
    },
    nota: 'Muchas filtraciones famosas fueron buckets públicos por error. Es el paso 4 del laboratorio: la casilla ya viene marcada.'
  },
  {
    id: 'versiones',
    cam: 'cubeta',
    parada: 'Cómo se protege',
    titulo: 'Si la borras, se puede recuperar',
    texto: 'Con el <b>versionado</b> encendido, la bodega guarda cada versión de cada cosa. Si Ana borra la foto o la sobrescribe por error, la anterior sigue ahí.',
    aws: 'Versionado',
    paq: EN_MOSTRADOR,
    async accion(m) {
      await m.espera(1300);
      m.globo(1500, 684, '¡Ups! Ana me borró', { ms: 1300 });
      await m.espera(1400);
      m.foti({ ver: false });
      m.sello(1500, 768, false, 1300);
      await m.espera(1900);
      m.foti({ ver: true, nace: true });
      await m.espera(500);
      m.globo(1500, 684, 'Mi versión anterior seguía aquí');
      m.sello(1590, 760, true);
    },
    nota: 'Palabra clave del examen: «recuperarse de un borrado accidental» → versionado. Lo encienden en el paso 5 del laboratorio.'
  },
  {
    id: 'cifrado',
    cam: 'cubeta',
    parada: 'Cómo se protege',
    titulo: 'Y cada caja va con candado',
    texto: 'Todo lo que entra se <b>cifra solo</b>: aunque alguien se llevara la caja, no podría leer lo que trae dentro. No hay que pedirlo ni cuesta más.',
    aws: 'Cifrado · SSE-S3',
    mas: ['candados'],
    paq: EN_MOSTRADOR,
    async accion(m) {
      await m.espera(1700);
      m.globo(1500, 684, 'Sin la llave, nadie me puede leer');
    },
    nota: 'SSE-S3 viene por omisión: las llaves las administra S3. Con SSE-KMS la llave es tuya y vive en KMS.'
  },
  {
    id: 'sotanos',
    cam: 'torre',
    parada: 'Parada 2 · Los sótanos',
    titulo: 'Mientras más abajo, más frío y más barato',
    texto: 'Guardar cuesta, pero no todo se usa igual de seguido. Lo que casi no tocas puede bajar a un <b>sótano más barato</b>. A cambio, sacarlo de ahí cuesta más o tarda más.',
    aws: 'Clases de almacenamiento',
    mas: ['sotanos'],
    menos: ['zonas', 'copias', 'cortina-etq'],
    paq: EN_MOSTRADOR,
    nota: 'La pregunta para elegir clase siempre es doble: ¿qué tan seguido lo voy a leer?, y cuando lo lea, ¿qué tan rápido lo necesito?'
  },
  {
    id: 'standard',
    cam: 'piso0',
    parada: 'Planta baja',
    titulo: 'El mostrador: lo de todos los días',
    texto: 'Arriba está lo que se usa seguido: las fotos de esta semana, las imágenes de un sitio web. Sale <b>al instante</b> y sin cobro extra. Es el piso más caro para guardar.',
    aws: 'S3 Standard',
    paq: EN_MOSTRADOR,
    async accion(m) {
      await m.espera(1500);
      m.brilla('tb-piso0');
      m.globo(1500, 684, 'A mí me piden a cada rato');
    }
  },
  {
    id: 'ia',
    cam: 'piso1',
    parada: 'Sótano 1',
    titulo: 'La trastienda: lo que casi no usas',
    texto: 'Respaldos, fotos del año pasado. Guardar aquí es más barato y sale igual de rápido, pero <b>te cobran cada vez que sacas algo</b>.',
    aws: 'S3 Standard-IA',
    paq: EN_MOSTRADOR,
    async accion(m) {
      await m.espera(1500);
      m.brilla('tb-piso1');
      m.mini(LILA, '', 1500, 954, 1.1);
      await m.espera(600);
      m.globo(1500, 928, 'Sacarme cuesta unas monedas');
    },
    nota: 'IA = Infrequent Access. One Zone-IA es todavía más barata porque vive en una sola zona: para lo que se puede volver a crear.'
  },
  {
    id: 'glacier',
    cam: 'piso2',
    parada: 'Sótano 2',
    titulo: 'El cuarto frío: el archivo',
    texto: 'Aquí va lo que se consulta una o dos veces al año. Es muy barato, pero hay que <b>descongelarlo</b>: sacar algo tarda de minutos a horas.',
    aws: 'S3 Glacier Flexible Retrieval',
    paq: EN_MOSTRADOR,
    async accion(m) {
      await m.espera(1500);
      m.brilla('tb-piso2');
      m.mini(CIAN, '', 1500, 1118, 1.1);
      await m.espera(600);
      m.globo(1500, 1092, 'Dame de minutos a horas…');
    },
    nota: 'Glacier Instant Retrieval es la excepción de la familia: archivo que se lee una vez al trimestre y sale en milisegundos.'
  },
  {
    id: 'deep',
    cam: 'piso3',
    parada: 'Sótano 3',
    titulo: 'El congelador del fondo',
    texto: 'Lo que la ley obliga a guardar años y nadie consulta. Es el piso <b>más barato</b> de todos y también el más lento: sacar algo tarda <b>hasta 12 horas</b>.',
    aws: 'S3 Glacier Deep Archive',
    paq: EN_MOSTRADOR,
    async accion(m) {
      await m.espera(1500);
      m.brilla('tb-piso3');
      m.mini(HIELO, '', 1500, 1282, 1.1);
      await m.espera(600);
      m.globo(1500, 1256, 'Vuelve en 12 horas');
    },
    nota: 'Palabra clave del examen: «guardar 7 años por ley, casi nunca se consulta» → Glacier Deep Archive.'
  },
  {
    id: 'ciclo',
    cam: 'torre',
    parada: 'Parada 2 · Los sótanos',
    titulo: 'Nadie baja las cajas a mano',
    texto: 'Ana deja una <b>regla</b>: a los 30 días, a la trastienda; a los 180, al congelador. La bodega la cumple sola, todos los días.',
    aws: 'Regla de ciclo de vida',
    mas: ['regla'],
    fin: ['congelada'],
    paq: EN_CONGELADOR,
    async accion(m) {
      await m.espera(1500);
      m.foti({ etq: 'día 0', brinca: true });
      await m.espera(1300);
      m.brilla('tb-dia30');
      await m.viajar('a-ia', 2200);
      m.foti({ etq: 'día 30', brinca: true });
      await m.espera(1500);
      m.brilla('tb-dia180');
      await m.viajar('a-glacier', 1700);
      await m.viajar('a-deep', 1700);
      m.foti({ etq: 'día 180', brinca: true });
      m.bandera('congelada', true);
      await m.espera(600);
      m.globo(1480, 1198, 'Brrr…', { cola: 20 });
    },
    nota: 'Es la regla «fotos-viejas-a-glacier» de los pasos 7 y 8 del laboratorio. Cada cambio de piso se cobra por objeto: por eso la consola pide aceptar ese costo.'
  },
  {
    id: 'pedir',
    cam: 'izquierda',
    parada: 'Parada 2 · Los sótanos',
    titulo: '¿Y si Ana la quiere ver otra vez?',
    texto: 'Se puede, pero no en este momento: hay que pedirla y esperar a que se descongele. Por eso al congelador solo baja lo que de verdad <b>casi nunca</b> vas a necesitar.',
    aws: 'Recuperación: hasta 12 horas',
    menos: ['regla'],
    paq: EN_CONGELADOR,
    async accion(m) {
      await m.espera(1500);
      const p = m.mini(CIAN, '¿playa.jpg?', 690, 910, 1.4);
      await m.mover(p, 'pedido', 2300);
      m.globo(1010, 604, 'Está congelada. Vuelve en 12 horas', { cola: 152, escala: 1.25 });
      await m.espera(2400);
      m.etqMini(p, 'en 12 horas');
      await m.mover(p, 'pedido', 1900, { reversa: true });
      m.quitar(p);
    },
    nota: 'El costo de guardar baja en cada piso, pero el de sacar sube. Elegir mal de clase puede salir más caro.'
  },
  {
    id: 'inteligente',
    cam: 'torre',
    parada: 'Parada 2 · Los sótanos',
    titulo: '¿Y si no sabes qué tan seguido la usarás?',
    texto: 'Un bodeguero automático vigila cada caja: si nadie la pide, la baja; si alguien la pide, la sube. Tú no haces nada.',
    aws: 'S3 Intelligent-Tiering',
    mas: ['robot'],
    paq: EN_CONGELADOR,
    async accion(m) {
      await m.espera(1500);
      const c = m.mini(AMARILLO, '', 1450, 768, 1.1);
      await m.espera(800);
      m.globo(1960, 684, 'Nadie la pide: va para abajo', { ms: 2400, escala: 1.5, cola: -68 });
      await m.mover(c, 'robot-baja', 2000);
      await m.espera(1300);
      m.globo(1960, 684, '¡La pidieron! De vuelta arriba', { ms: 2600, escala: 1.5, cola: -68 });
      await m.mover(c, 'robot-baja', 2000, { reversa: true });
      m.sello(1450, 716, true);
    },
    nota: 'Palabra clave del examen: «no se sabe con qué frecuencia se accederá» o «patrón de acceso impredecible» → Intelligent-Tiering.'
  },
  {
    id: 'tres',
    cam: 'torre',
    tarjeta: 'tres',
    sub: 1,
    mas: ['servidores'],
    menos: ['robot'],
    paq: EN_CONGELADOR,
    nota: 'Objetos, bloques y archivos: el examen pregunta por los tres tipos y hay que saber cuál servicio va con cuál.'
  },
  {
    id: 'ebs',
    cam: 'ebs',
    parada: 'Parada 3 · Los servidores',
    titulo: 'El cajón del servidor',
    texto: 'Cada servidor tiene su propio <b>disco</b>: ahí vive su sistema y trabaja a diario. Es de <b>un</b> solo servidor, está en <b>una</b> sola zona y no se borra al apagarlo.',
    aws: 'Amazon EBS · bloques',
    mas: ['ebs-etq'],
    paq: EN_CONGELADOR,
    async accion(m) {
      await m.espera(1600);
      m.bandera('apagada', true);
      m.globo(2460, 626, 'Me apagaron…', { ms: 1700 });
      await m.espera(1900);
      m.brilla('cajon');
      m.globo(2640, 714, 'Y aquí sigue todo guardado', { cola: -28 });
      m.sello(2676, 770, true);
      await m.espera(2200);
      m.bandera('apagada', false);
    },
    nota: 'Es el volumen gp3 de la sesión 1 y el que crean hoy en us-east-1a. gp = uso general; io = bases de datos exigentes; st y sc = discos HDD baratos.'
  },
  {
    id: 'efimero',
    cam: 'ebs',
    parada: 'Parada 3 · Los servidores',
    titulo: 'El pizarrón se borra al salir',
    texto: 'Algunos servidores traen además un disco <b>pegado a la máquina</b>: rapidísimo, pero temporal. Si detienes el servidor, se borra. Sirve para apuntes, no para guardar.',
    aws: 'Instance store',
    mas: ['pizarron'],
    fin: ['borrado'],
    paq: EN_CONGELADOR,
    async accion(m) {
      await m.espera(1800);
      m.bandera('apagada', true);
      await m.espera(1000);
      m.bandera('borrado', true);
      m.sello(2396, 716, false);
      m.globo(2352, 700, '¡Se borró todo!');
      await m.espera(2200);
      m.bandera('apagada', false);
    },
    nota: 'Palabra clave del examen: «datos temporales, lo más rápido, no importa perderlos» → instance store.'
  },
  {
    id: 'snapshot',
    cam: 'foto',
    parada: 'Parada 3 · Los servidores',
    titulo: 'Un retrato del cajón',
    texto: 'Un <b>snapshot</b> es una copia del disco tal como está en este momento. Se guarda en la bodega y es <b>incremental</b>: la segunda vez solo guarda lo que cambió.',
    aws: 'Snapshot de EBS',
    paq: EN_CONGELADOR,
    async accion(m) {
      await m.espera(1600);
      m.destello(2612, 762);
      await m.espera(500);
      const uno = m.pieza('retrato', 'copia completa', 2612, 716, 1.5);
      await m.mover(uno, 'retrato', 2800);
      m.quitar(uno);
      m.sello(1500, 650, true, 1400);
      await m.espera(1300);
      m.destello(2612, 762);
      await m.espera(500);
      const dos = m.pieza('retrato', 'solo lo nuevo', 2612, 716, 0.9);
      await m.mover(dos, 'retrato', 2400);
      m.quitar(dos);
      m.sello(1500, 650, true);
    },
    nota: 'Los snapshots viven en S3, pero los administra AWS: no aparecen en tus buckets. Con uno se crea un volumen nuevo, incluso en otra zona. AWS Backup programa todos los respaldos desde un solo lugar.'
  },
  {
    id: 'efs',
    cam: 'efs',
    parada: 'Parada 3 · Los servidores',
    titulo: 'El estante de todos',
    texto: 'Cuando <b>muchos</b> servidores necesitan los mismos archivos al mismo tiempo, comparten un estante. Lo alcanzan desde varias zonas y <b>crece solo</b>.',
    aws: 'Amazon EFS · archivos',
    mas: ['efs'],
    paq: EN_CONGELADOR,
    async accion(m) {
      await m.espera(1700);
      const a = m.mini(AMARILLO, '', 2500, 1070);
      const b = m.mini(ROJO, '', 2910, 1070);
      const c = m.mini(VERDE, '', 2940, 812);
      await m.espera(500);
      await Promise.all([m.mover(a, 'efs-3', 1400), m.mover(b, 'efs-4', 1400), m.mover(c, 'efs-2', 1600)]);
      m.brilla('tb-estante');
      m.globo(2705, 946, 'Los tres ven los mismos archivos');
      await m.espera(2200);
      await Promise.all([
        m.mover(a, 'efs-3', 1300, { reversa: true }),
        m.mover(b, 'efs-4', 1300, { reversa: true }),
        m.mover(c, 'efs-2', 1500, { reversa: true })
      ]);
      m.quitar(a);
      m.quitar(b);
      m.quitar(c);
    },
    nota: 'EFS es para Linux. Para Windows File Server (y Lustre, de alto rendimiento) existe Amazon FSx. Un volumen EBS normal no se comparte: es de una sola instancia.'
  },
  {
    id: 'camion',
    cam: 'camion',
    parada: 'Parada 4 · La mudanza',
    titulo: 'Cuando no cabe por el cable',
    texto: 'Un hospital quiere guardar 120 TB de radiografías. Con su internet tardaría <b>casi un año</b> en subirlas. AWS le manda un aparato: lo llena, lo regresa en camión y listo.',
    aws: 'AWS Snowball Edge',
    mas: ['hospital'],
    menos: ['bodega-etq'],
    fin: ['camion-llego'],
    paq: EN_CONGELADOR,
    async accion(m) {
      await m.espera(1700);
      m.globo(560, 540, 'Por internet: casi un año', { ms: 2300 });
      m.sello(716, 520, false, 2300);
      await m.espera(2600);
      const t = m.pieza('camion', '120 TB', 560, 690);
      await m.espera(700);
      await m.mover(t, 'camion', 3800);
      m.bandera('camion-llego', true);
      m.quitar(t, 350);
      m.confeti(1100, 730);
      m.globo(1100, 728, 'En camión: unos días');
    },
    nota: 'Por la red y de forma automática: AWS DataSync. Almacenamiento híbrido (tus servidores ven una unidad normal, los datos viven en S3): AWS Storage Gateway.'
  },
  {
    id: 'laboratorio',
    cam: 'cubeta',
    parada: 'Lo que vas a ver en el laboratorio',
    titulo: 'Tu cubeta sí se crea, pero no te deja guardar',
    texto: 'Hoy creas tu cubeta con cortina, versionado y regla. Al intentar guardar algo, el sandbox dice que no: <b>crear la cubeta y guardar en ella son permisos distintos</b>.',
    aws: 'CreateBucket ≠ PutObject',
    mas: ['tu-cubeta', 'bodega-etq'],
    menos: ['hospital', 'camion-llego'],
    paq: EN_CONGELADOR,
    async accion(m) {
      await m.espera(1700);
      const f = m.pieza('foto', '', 1130, 480, 1.3);
      await m.mover(f, 'rebote', 1600);
      m.globo(1500, 444, 'Insufficient permission · s3:PutObject');
      m.sello(1566, 486, false);
      await m.espera(2600);
      await m.mover(f, 'rebote', 1200, { reversa: true });
      m.quitar(f);
    },
    nota: 'Es el paso 6 del laboratorio y el mínimo privilegio de la sesión 2. El aviso rojo es su primera evidencia: que le tomen captura.'
  },
  { id: 'repaso', cam: 'mapa', tarjeta: 'repaso', menos: ['tu-cubeta'], temporal: TODAS, paq: { ver: false } },
  { id: 'guia', cam: 'mapa', tarjeta: 'guia', temporal: TODAS, paq: { ver: false }, nota: 'Léanla como preguntas: ¿qué estoy guardando?, ¿quién lo usa?, ¿qué tan seguido?' },
  { id: 'quiz', cam: 'mapa', tarjeta: 'quiz', temporal: TODAS, paq: { ver: false }, nota: 'Que contesten en voz alta antes de tocar la respuesta.' },
  { id: 'fin', cam: 'mapa', tarjeta: 'fin', temporal: TODAS, paq: { ver: false } }
];
