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
//   sub       qué versión de la tarjeta se ve (la de «formas de anotar» tiene dos)
//   mas/menos capas del mundo que se encienden o apagan desde este momento
//   fin       capas que se encienden al terminar la animación del momento
//   temporal  capas que solo valen en este momento
//   paq       dónde queda Tiki al terminar: { x, y, etq, ver }
//   rastro    tramos de la ruta que ya quedaron pintados
//   accion    la animación; recibe las herramientas del motor
//   nota      apunte para el docente (tecla N)
// ---------------------------------------------------------------------------

/** Lo que se ve de fondo en las tarjetas del mapa completo. */
export const TODAS = ['sucursal', 'seis', 'dormilon', 'replicas', 'album', 'cache', 'dax', 'encargado-etq'];

const ROJO = '#ff4f8b';
const VERDE = '#7be495';
const CIAN = '#4cc9f0';
const AMARILLO = '#ffcf3f';
const LILA = '#b69cff';
const NARANJA = '#ff8a3c';

const EN_TIENDA = { x: 600, y: 948, etq: 'Ana · $45' };
const EN_ARCHIVO = { x: 1500, y: 700, etq: 'Ana · $45' };
const EN_GUARDA = { x: 1965, y: 1405, etq: 'ficha: ana' };

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
    titulo: 'Don Beto apunta todo en su libreta',
    texto: 'Cada venta de la papelería es un <b>dato</b>: quién compró y cuánto pagó. Vamos a seguir a uno de ellos: Tiki, la nota de lo que compró Ana.',
    paq: EN_TIENDA,
    async accion(m) {
      m.tiki({ ver: false });
      await m.espera(900);
      m.tiki({ ...EN_TIENDA, ver: true, nace: true });
      await m.espera(500);
      m.globo(600, 866, '¡Hola! Soy Tiki');
    },
    nota: 'Pregunta al grupo: ¿dónde guardan sus datos los negocios de su colonia? ¿En una libreta, en Excel, en una app?'
  },
  {
    id: 'formas',
    cam: 'tienda',
    tarjeta: 'formas',
    sub: 0,
    paq: EN_TIENDA,
    nota: 'La idea de toda la sesión: no hay una sola base de datos para todo; hay una forma de anotar para cada necesidad.'
  },
  {
    id: 'libreta',
    cam: 'libreta',
    parada: 'Parada 1 · La libreta',
    titulo: 'Una libreta con columnas',
    texto: 'Cada renglón es una venta y cada columna dice qué va ahí: <b>quién</b> y <b>cuánto</b>. Todos los renglones tienen la misma forma. Para preguntarle algo a la libreta hay un idioma especial: <b>SQL</b>.',
    aws: 'Base de datos relacional',
    paq: EN_TIENDA,
    async accion(m) {
      await m.espera(1400);
      m.brilla('libreta');
      m.globo(600, 866, 'Mi renglón: Ana · $45', { ms: 2600 });
      await m.espera(2900);
      const raro = m.mini(LILA, 'color: azul', 350, 952);
      await m.espera(700);
      m.globo(390, 868, '¿«color»? Esa columna no existe', { cola: -20 });
      m.sello(386, 922, false);
      await m.espera(2000);
      m.quitar(raro);
    },
    nota: 'El esquema (qué columnas hay y de qué tipo) se define antes de guardar; lo que no cumple, se rechaza. SQL es el idioma con que se consulta una base relacional.'
  },
  {
    id: 'mano',
    cam: 'tienda',
    parada: 'Parada 1 · La libreta',
    titulo: 'Si la libreta es tuya, todo te toca',
    texto: 'Don Beto compró su libreta, la cuida y la guarda. Si se moja, si se llena o si hay que sacarle copia, <b>es su trabajo</b>. Así es instalar tu propia base de datos en un servidor.',
    aws: 'Base de datos en EC2',
    paq: EN_TIENDA,
    async accion(m) {
      await m.espera(1300);
      const tareas = ['Sacarle copia…', 'Cambiar la hoja…', 'Arreglar renglones…'];
      for (const t of tareas) {
        m.globo(410, 836, t, { ms: 1300 });
        await m.espera(1500);
      }
      m.globo(410, 836, '¡Y además atender la tienda!');
      m.sello(520, 870, false);
    },
    nota: 'En el laboratorio instalan MariaDB en una instancia EC2 con un script. Funciona, pero los parches, los respaldos y la copia en otra zona serían trabajo suyo.'
  },
  {
    id: 'archivo',
    cam: 'mudanza',
    parada: 'Parada 2 · El archivo',
    titulo: 'O se la encargas al archivo',
    texto: 'En el archivo hay un <b>encargado</b> que cuida las libretas: les saca copia, las cambia cuando se gastan y las arregla de noche. Tú solo decides qué se anota y quién lo puede ver.',
    aws: 'Amazon RDS',
    mas: ['encargado-etq'],
    paq: EN_ARCHIVO,
    rastro: ['archivo'],
    async accion(m) {
      await m.espera(1000);
      await m.viajar('archivo', 3400, { rastro: true });
      m.brilla('encargado');
      m.globo(1640, 610, 'Yo la cuido: copias, arreglos, todo', { escala: 1.4, cola: -30 });
    },
    nota: 'RDS = Relational Database Service. Motores: MySQL, PostgreSQL, MariaDB, Oracle, SQL Server y Db2. AWS parcha el motor y saca respaldos; las tablas, los datos y los permisos siguen siendo tuyos.'
  },
  {
    id: 'aurora',
    cam: 'aurora',
    parada: 'Parada 2 · El archivo',
    titulo: 'El archivo de lujo: seis copias en tres edificios',
    texto: 'AWS tiene su propio archivo, más rápido. Cada libreta se guarda <b>seis veces</b>, repartida en <b>tres edificios</b>. Y habla el mismo idioma que las libretas de siempre.',
    aws: 'Amazon Aurora',
    fin: ['seis'],
    paq: EN_ARCHIVO,
    async accion(m) {
      m.rastros([]);
      await m.espera(1300);
      const b = m.pieza('hoja', '', 2450, 590, 1.2);
      const c = m.pieza('hoja', '', 2450, 590, 1.2);
      await Promise.all([m.mover(b, 'aur-2', 1500), m.mover(c, 'aur-3', 1900)]);
      m.bandera('seis', true);
      m.quitar(b);
      m.quitar(c);
      await m.espera(700);
      m.globo(2650, 400, '6 copias · 3 edificios', { escala: 1.2 });
    },
    nota: 'Aurora es compatible con MySQL y PostgreSQL y es más rápida que ellos. Palabra clave del examen: «compatible con MySQL o PostgreSQL, con más rendimiento y alta disponibilidad» → Aurora.'
  },
  {
    id: 'dormilon',
    cam: 'aurora',
    parada: 'Parada 2 · El archivo',
    titulo: 'Y uno que se duerme si nadie lo usa',
    texto: 'El archivero dormilón crece cuando llegan muchos pedidos y se encoge cuando bajan. Si no llega nadie, <b>se duerme</b>, y mientras duerme no cobra por trabajar.',
    aws: 'Aurora Serverless',
    mas: ['dormilon'],
    paq: EN_ARCHIVO,
    async accion(m) {
      await m.espera(2000);
      const p = m.mini(AMARILLO, 'pedido', 2760, 600);
      await m.mover(p, 'despierta', 1600);
      m.bandera('despierto', true);
      m.globo(3010, 506, '¡Ya voy, ya voy!', { cola: 20 });
      m.sello(2930, 560, true, 2000);
      await m.espera(2600);
      m.quitar(p);
      await m.espera(800);
      m.bandera('despierto', false);
      m.globo(3010, 506, 'Ya no hay nadie… zzz', { cola: 20 });
    },
    nota: 'En el laboratorio, la configuración exprés de Aurora propone justo esto: Aurora Serverless con mínimo de 0 ACU, que se pausa a los 5 minutos sin uso.'
  },
  {
    id: 'multiaz',
    cam: 'sucursal',
    parada: 'Parada 3 · Que no se pierda',
    titulo: 'Una copia en espera, en otra sucursal',
    texto: 'El archivo manda cada renglón <b>al instante</b> a otra sucursal, en otra zona. Esa copia no atiende a nadie: solo espera. Si el archivo se queda sin luz, la sucursal toma su lugar sola.',
    aws: 'Multi-AZ',
    mas: ['sucursal', 'multiaz'],
    fin: ['apagada', 'corona'],
    paq: EN_ARCHIVO,
    async accion(m) {
      await m.espera(1300);
      const h = m.pieza('hoja', '', 1700, 650, 1.1);
      await m.mover(h, 'sync', 1300);
      m.quitar(h);
      m.sello(2070, 640, true, 1500);
      await m.espera(1400);
      const cliente = m.mini(ROJO, 'cliente', 1800, 905);
      await m.mover(cliente, 'pide-a', 1300);
      await m.espera(500);
      await m.mover(cliente, 'pide-a', 1000, { reversa: true });
      m.bandera('apagada', true);
      m.globo(1500, 520, '¡Se fue la luz!', { ms: 2200, escala: 1.3 });
      await m.espera(1400);
      await m.mover(cliente, 'pide-b', 1300);
      m.bandera('corona', true);
      m.globo(2070, 520, 'Ahora atiendo yo', { escala: 1.3 });
      await m.espera(1600);
      m.quitar(cliente);
    },
    nota: 'En la forma clásica de Multi-AZ la copia en espera no atiende consultas: es para disponibilidad. Palabra clave del examen: «seguir funcionando si falla una zona» → Multi-AZ.'
  },
  {
    id: 'replicas',
    cam: 'replicas',
    parada: 'Parada 4 · Que no se sature',
    titulo: 'Fotocopias para los que solo leen',
    texto: 'Hay días en que medio barrio quiere <b>consultar</b> el archivo. Se sacan fotocopias para que lean ahí, y el archivo queda libre para <b>anotar</b> lo nuevo.',
    aws: 'Réplicas de lectura',
    mas: ['replicas'],
    menos: ['apagada', 'corona', 'multiaz'],
    paq: EN_ARCHIVO,
    async accion(m) {
      await m.espera(1300);
      const a = m.pieza('hoja', '', 1500, 720, 1.1);
      const b = m.pieza('hoja', '', 1500, 720, 1.1);
      await Promise.all([m.mover(a, 'copia-1', 1500), m.mover(b, 'copia-2', 1500)]);
      m.quitar(a);
      m.quitar(b);
      m.globo(1190, 876, 'Yo solo vengo a leer', { ms: 2400 });
      await m.espera(1200);
      m.globo(1810, 876, 'Y yo también');
      m.sello(1500, 800, true);
    },
    nota: 'Las réplicas reparten las lecturas; pueden estar en otra zona o en otra región. Palabra clave del examen: «muchas más lecturas que escrituras, la base va lenta» → réplicas de lectura.'
  },
  {
    id: 'error',
    cam: 'replicas',
    parada: 'Parada 4 · Que no se sature',
    titulo: 'Ojo: las fotocopias copian también los errores',
    texto: 'Si alguien tacha por error un renglón del archivo, la fotocopia sale tachada igual, y la copia de la otra sucursal también. Las copias sirven para que no se caiga ni se sature, <b>no para deshacer errores</b>.',
    aws: 'Una réplica no es un respaldo',
    temporal: ['error', 'error2'],
    paq: EN_ARCHIVO,
    async accion(m) {
      await m.espera(1300);
      m.bandera('error', true);
      m.globo(1440, 580, '¡Ups! Taché un renglón', { ms: 2000 });
      await m.espera(1800);
      const a = m.pieza('hoja', '', 1500, 720, 1.1);
      const b = m.pieza('hoja', '', 1500, 720, 1.1);
      await Promise.all([m.mover(a, 'copia-1', 1400), m.mover(b, 'copia-2', 1400)]);
      m.quitar(a);
      m.quitar(b);
      m.bandera('error2', true);
      m.globo(1500, 820, '¡Salieron tachadas también!', { escala: 1.15 });
    },
    nota: 'Lo mismo pasa con la copia en espera de Multi-AZ. Contra un borrado o un error, lo que sirve son los respaldos.'
  },
  {
    id: 'respaldos',
    cam: 'respaldos',
    parada: 'Parada 4 · Que no se sature',
    titulo: 'El álbum de cada día',
    texto: 'El encargado guarda una foto del archivo <b>cada día</b> y anota cada cambio. Si a las 10:15 alguien tachó un renglón, se puede volver a como estaba a las <b>10:14</b>. Guarda hasta 35 días.',
    aws: 'Respaldos automáticos',
    mas: ['album'],
    paq: EN_ARCHIVO,
    async accion(m) {
      m.bandera('error', true);
      m.bandera('error2', true);
      await m.espera(1400);
      const p = m.pieza('hoja', '', 1500, 720, 1.1);
      await m.mover(p, 'pagina', 1900);
      m.quitar(p);
      m.brilla('reloj');
      m.globo(2398, 672, 'Volvamos a las 10:14', { escala: 1.2 });
      await m.espera(2400);
      m.bandera('error', false);
      m.bandera('error2', false);
      m.globo(2253, 720, 'Renglón recuperado');
      m.sello(2340, 730, true);
    },
    nota: 'Los respaldos automáticos guardan hasta 35 días y permiten restaurar a un punto en el tiempo. Los snapshots manuales duran lo que tú quieras.'
  },
  {
    id: 'formas2',
    cam: 'guarda',
    tarjeta: 'formas',
    sub: 1,
    menos: ['replicas', 'album'],
    paq: EN_ARCHIVO,
    nota: 'Relacional: tablas con columnas y SQL. Clave-valor: una llave y lo que quieras. Caché: lo más pedido, en memoria.'
  },
  {
    id: 'guardarropa',
    cam: 'guarda',
    parada: 'Parada 5 · El guardarropa',
    titulo: 'Una ficha, y lo que quieras dentro',
    texto: 'En el guardarropa no hay columnas. Cada cosa se busca por su <b>ficha</b> y cada bolsa trae lo que quiera: una mochila, una maleta, un sombrero. Nadie revisa que todas sean iguales.',
    aws: 'Amazon DynamoDB',
    paq: EN_GUARDA,
    rastro: [],
    async accion(m) {
      m.tiki({ ...EN_ARCHIVO });
      await m.espera(500);
      await m.viajar('baja', 2600);
      m.tiki({ etq: 'ficha: ana', brinca: true });
      await m.espera(700);
      m.brilla('bolsa-ana');
      m.globo(1965, 1318, 'Mi ficha es «ana»', { cola: 20 });
    },
    nota: 'DynamoDB es una base NoSQL de clave-valor: solo exige la llave de partición; lo demás puede variar de un elemento a otro. No hay servidores que elegir.'
  },
  {
    id: 'distintas',
    cam: 'ganchos',
    parada: 'Parada 5 · El guardarropa',
    titulo: 'Cada bolsa, distinta',
    texto: 'La bolsa de <b>ana</b> trae solo un suéter. La de <b>luis</b> trae paraguas, gorra y un libro. En la libreta con columnas eso no se podría; aquí sí, porque <b>solo la ficha es obligatoria</b>.',
    aws: 'Llave de partición · sin esquema fijo',
    paq: EN_GUARDA,
    async accion(m) {
      await m.espera(1300);
      m.brilla('bolsa-ana');
      m.globo(1390, 1206, 'un suéter', { ms: 2600 });
      await m.espera(1700);
      m.brilla('bolsa-luis');
      m.globo(1610, 1206, 'paraguas · gorra · libro');
    },
    nota: 'Es lo que ven en el paso 9 del laboratorio: luis tiene un atributo que ana no tiene, y la tabla acepta a los dos.'
  },
  {
    id: 'query',
    cam: 'ganchos',
    parada: 'Parada 5 · El guardarropa',
    titulo: 'Buscar por ficha es rapidísimo',
    texto: 'Con la ficha, el encargado va <b>directo</b> al gancho. Sin ficha tendría que revisar <b>bolsa por bolsa</b>. En DynamoDB lo primero se llama <i>Query</i>; lo segundo, <i>Scan</i>.',
    aws: 'Query · Scan',
    paq: EN_GUARDA,
    async accion(m) {
      await m.espera(1300);
      const q = m.mini(VERDE, 'ficha: ana', 1500, 1386);
      await m.mover(q, 'query', 800);
      m.sello(1450, 1252, true, 1800);
      m.globo(1390, 1250, 'Directo: 1 bolsa', { ms: 1900 });
      await m.espera(1900);
      m.quitar(q);
      await m.espera(400);
      const s = m.mini(ROJO, 'sin ficha', 1500, 1386);
      await m.mover(s, 'scan', 4400);
      m.globo(1500, 1300, 'Revisé las 7 bolsas…', { escala: 1.1 });
    },
    nota: 'En el laboratorio lo comprueban: el Query devuelve 1 elemento, revisa 1 y tiene eficiencia del 100 %. En una tabla de millones, la diferencia es enorme en tiempo y en costo.'
  },
  {
    id: 'muchos',
    cam: 'guarda',
    parada: 'Parada 5 · El guardarropa',
    titulo: 'Rápido aunque lleguen miles',
    texto: 'Pueden llegar mil personas a la vez y cada una recibe su bolsa en <b>milisegundos</b>. Y no se paga por tener ganchos vacíos: se paga <b>cada vez</b> que alguien deja o recoge algo.',
    aws: 'Milisegundos · bajo demanda',
    paq: EN_GUARDA,
    async accion(m) {
      await m.espera(1200);
      const colores = [ROJO, AMARILLO, VERDE, CIAN, LILA, NARANJA];
      const vueltas = colores.map(async (c, i) => {
        await m.espera(i * 350);
        const p = m.mini(c, '', 1080, 1395);
        await m.mover(p, 'a-guarda', 800);
        m.sello(1440, 1340, true, 500);
        m.quitar(p, 200);
      });
      await Promise.all(vueltas);
      m.globo(1500, 1300, 'Pagas por cada entrega', { escala: 1.2 });
    },
    nota: 'Bajo demanda: tráfico impredecible, pagas por petición. Provisionada: tráfico estable, reservas capacidad y sale más barato. Tablas globales: copias en varias regiones.'
  },
  {
    id: 'cache',
    cam: 'cache',
    parada: 'Parada 6 · Más formas de anotar',
    titulo: 'La libretita de lo más pedido',
    texto: 'Todo el día preguntan lo mismo: «¿cuánto cuesta el cuaderno?». En vez de ir al archivo cada vez, la respuesta está en una <b>libretita</b> a la mano. Contestar de ahí es muchísimo más rápido.',
    aws: 'Amazon ElastiCache',
    paq: EN_GUARDA,
    async accion(m) {
      await m.espera(1200);
      const a = m.mini(AMARILLO, '¿precio?', 1070, 702);
      await m.mover(a, 'adentro', 1500);
      m.globo(1610, 600, 'Déjame buscar…', { ms: 1800, cola: -20 });
      await m.espera(2000);
      await m.mover(a, 'adentro', 1100, { reversa: true });
      m.quitar(a);
      m.bandera('cache', true);
      await m.espera(1000);
      const b = m.mini(AMARILLO, '¿precio?', 1070, 702);
      await m.mover(b, 'postit', 700);
      m.brilla('postits');
      m.globo(1218, 520, '¡Aquí está! Al instante');
      m.sello(1290, 640, true);
    },
    fin: ['cache'],
    nota: 'ElastiCache (Valkey, Redis OSS o Memcached) guarda en memoria lo que se pide una y otra vez, y la base descansa. Palabras clave: «microsegundos», «sesiones», «lo más consultado».'
  },
  {
    id: 'dax',
    cam: 'guarda',
    parada: 'Parada 6 · Más formas de anotar',
    titulo: 'El guardarropa también tiene su libretita',
    texto: 'Para el guardarropa hay una libretita hecha a su medida: lo que antes salía en milisegundos sale en <b>microsegundos</b>.',
    aws: 'DynamoDB Accelerator (DAX)',
    mas: ['dax'],
    paq: EN_GUARDA,
    async accion(m) {
      await m.espera(1300);
      const p = m.mini(CIAN, '', 1180, 1452);
      await m.mover(p, 'a-dax', 600);
      m.brilla('tb-dax');
      m.globo(1048, 1290, '¡Microsegundos!', { escala: 1.1 });
      m.sello(1112, 1360, true);
    },
    nota: 'DAX es una caché en memoria solo para DynamoDB. Palabra clave: «microsegundos para DynamoDB» → DAX.'
  },
  {
    id: 'otras',
    cam: 'otras',
    parada: 'Parada 6 · Más formas de anotar',
    titulo: 'El contador y el tablero de corcho',
    texto: 'Para estudiar <b>años</b> de ventas hay un contador con su propia oficina: no atiende el mostrador, analiza. Y para saber <b>quién conoce a quién</b>, un tablero de corcho con hilos.',
    aws: 'Amazon Redshift · Amazon Neptune',
    fin: ['analiza'],
    paq: EN_GUARDA,
    async accion(m) {
      await m.espera(1200);
      m.bandera('analiza', true);
      m.brilla('barras');
      m.globo(2480, 1080, 'En 2026 vendimos más', { ms: 2600 });
      await m.espera(2700);
      m.brilla('corcho');
      m.globo(2890, 1076, 'Amigos de amigos');
    },
    nota: 'Redshift es el almacén de datos (data warehouse); Neptune, la base de grafos. Hay más: DocumentDB (compatible con MongoDB), Keyspaces (con Cassandra) y Athena, que consulta con SQL archivos que ya están en S3.'
  },
  {
    id: 'mudanza',
    cam: 'mudanza',
    parada: 'Parada 7 · La mudanza',
    titulo: 'Mudarse sin cerrar la tienda',
    texto: 'Don Beto quiere pasar sus libretas al archivo sin cerrar ni un día. Un ayudante copia todo y sigue copiando cada venta nueva mientras la tienda <b>sigue abierta</b>. Si el archivo habla otro idioma, también se traduce.',
    aws: 'AWS DMS · conversión de esquema',
    menos: ['analiza'],
    paq: EN_GUARDA,
    async accion(m) {
      m.rastros([]);
      await m.espera(1200);
      m.brilla('tb-abierto');
      const c = m.pieza('carrito', 'libretas', 700, 1010, 1.4);
      await m.espera(500);
      await m.mover(c, 'mudanza', 3600);
      m.quitar(c, 300);
      m.confeti(1430, 740);
      m.globo(1500, 560, 'Y la tienda nunca cerró', { escala: 1.4 });
    },
    nota: 'DMS = Database Migration Service: copia los datos y los cambios en vivo, y el corte final dura minutos. Si se cambia de motor (de Oracle a PostgreSQL, por ejemplo), se usa además la conversión de esquema (SCT).'
  },
  {
    id: 'lab-candado',
    cam: 'archivo',
    parada: 'Lo que vas a ver en el laboratorio',
    titulo: 'El archivo tiene candado',
    texto: 'En el sandbox, la organización le puso un candado al archivo: nadie puede crear bases RDS ni Aurora. Una negación así <b>gana a cualquier permiso</b>.',
    aws: 'SCP · explicit deny',
    mas: ['candado'],
    paq: EN_GUARDA,
    async accion(m) {
      await m.espera(1500);
      m.brilla('tb-candado');
      const p = m.mini(LILA, 'nueva base', 1260, 660);
      await m.mover(p, 'rebote', 1400);
      m.globo(1500, 548, 'explicit deny · rds:CreateDBCluster', { escala: 1.05 });
      m.sello(1560, 610, false);
      await m.espera(2400);
      await m.mover(p, 'rebote', 1100, { reversa: true });
      m.quitar(p);
    },
    nota: 'Es el paso 5 del laboratorio y su primera evidencia. La SCP es la de la sesión 2: pone el límite de toda la cuenta.'
  },
  {
    id: 'lab-libreta',
    cam: 'tienda',
    parada: 'Lo que vas a ver en el laboratorio',
    titulo: 'Tu propia libreta sí funcionó',
    texto: 'En tu servidor instalas una base a mano. No tiene pantalla, pero lo que imprime aparece en su <b>registro de arranque</b>: Ana 95, Mariana 92 y Luis 88.',
    aws: 'MariaDB en EC2 · System log',
    mas: ['log'],
    menos: ['candado'],
    paq: EN_GUARDA,
    async accion(m) {
      await m.espera(2600);
      m.globo(410, 836, 'Funciona… y todo me toca a mí', { escala: 1.05 });
    },
    nota: 'Pasos 3 y 11 del laboratorio; es su tercera evidencia. Si el registro sale vacío, la instalación aún no termina: que esperen y refresquen.'
  },
  {
    id: 'lab-guarda',
    cam: 'ganchos',
    parada: 'Lo que vas a ver en el laboratorio',
    titulo: 'Y un guardarropa de verdad',
    texto: 'Creas una tabla de DynamoDB con la ficha <code>jugador</code>. Guardas a <b>ana</b> con su puntaje y a <b>luis</b> con puntaje y nivel: la tabla acepta a los dos.',
    aws: 'Tu tabla de DynamoDB',
    menos: ['log'],
    paq: EN_GUARDA,
    async accion(m) {
      await m.espera(1300);
      m.brilla('bolsa-ana');
      m.globo(1390, 1206, 'puntaje: 950', { ms: 2600 });
      await m.espera(1700);
      m.brilla('bolsa-luis');
      m.globo(1610, 1206, 'puntaje: 720 · nivel: experto');
    },
    nota: 'Pasos 6 a 10 del laboratorio: su segunda evidencia. A diferencia de S3 en la sesión 4, aquí el sandbox sí deja escribir.'
  },
  { id: 'repaso', cam: 'mapa', tarjeta: 'repaso', temporal: TODAS, paq: { ver: false } },
  { id: 'guia', cam: 'mapa', tarjeta: 'guia', temporal: TODAS, paq: { ver: false }, nota: 'Léanla como preguntas: ¿cómo es lo que guardo?, ¿quién lo pide y qué tan seguido?, ¿qué pasa si falla?' },
  { id: 'quiz', cam: 'mapa', tarjeta: 'quiz', temporal: TODAS, paq: { ver: false }, nota: 'Que contesten en voz alta antes de tocar la respuesta.' },
  { id: 'fin', cam: 'mapa', tarjeta: 'fin', temporal: TODAS, paq: { ver: false } }
];
