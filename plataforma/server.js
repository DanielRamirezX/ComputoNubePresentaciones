import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

import { CURSO } from './curso.js';
import { montarModulos, BASE_MODULOS } from './src/montar.js';
import { direccionesLan, direccionPrincipal, urlPublica } from './src/red.js';
import { estaVisible, fijarVisible } from './src/indice.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PUERTO = Number(process.env.PORT || 3000);
const MATERIA = process.env.MATERIA || CURSO.materia;
const DOCENTE = process.env.DOCENTE || CURSO.docente;
const GRUPO = process.env.GRUPO || CURSO.grupo;
// La misma clave que leen los módulos: corren en este mismo proceso.
const CLAVE = process.env.CLAVE_DOCENTE || 'cambiame';
const CLAVE_POR_DEFECTO = !process.env.CLAVE_DOCENTE;

const app = express();
app.disable('x-powered-by');

// ------------------------------------------------- quién está conectado
// Sin base de datos: un mapa en memoria de "IP vista hace poco". Sirve para
// saber en el proyector cuántos ya entraron. Se vacía al reiniciar y ya.
const VENTANA_MS = 3 * 60 * 1000;
const vistos = new Map();

function registrarVisita(req) {
  const ip = req.ip || req.socket.remoteAddress || 'desconocida';
  vistos.set(ip, Date.now());
}

function conectados() {
  const corte = Date.now() - VENTANA_MS;
  for (const [ip, t] of vistos) if (t < corte) vistos.delete(ip);
  return vistos.size;
}

// ------------------------------------------------------------ los módulos
const modulos = await montarModulos(app, CURSO, __dirname);

// --------------------------------------------------------------------- api

app.get('/api/curso', (req, res) => {
  registrarVisita(req);
  // `publica` le dice al navegador dónde está corriendo esto, para no afirmar
  // que vive en la laptop del docente cuando ya está desplegado.
  // Las tarjetas que el docente ocultó desde el tablero no salen; su dirección
  // directa sigue abriendo.
  const visibles = modulos.filter((m) => estaVisible(m.tarjeta));
  res.json({ materia: MATERIA, docente: DOCENTE, grupo: GRUPO, modulos: visibles, publica: Boolean(urlPublica()) });
});

app.get('/api/red', (req, res) => {
  const publica = urlPublica();
  res.json({
    puerto: PUERTO,
    principal: direccionPrincipal(PUERTO),
    // Desplegado no hay direcciones alternas que ofrecer: solo la pública.
    direcciones: publica ? [] : direccionesLan(PUERTO),
    publica: Boolean(publica),
    conectados: conectados()
  });
});

app.get('/qr.svg', async (req, res, next) => {
  try {
    const destino = String(req.query.u || direccionPrincipal(PUERTO)).slice(0, 500);
    const svg = await QRCode.toString(destino, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      color: { dark: '#16181d', light: '#fffef9' }
    });
    res.type('image/svg+xml').set('Cache-Control', 'no-store').send(svg);
  } catch (e) {
    next(e);
  }
});

// ------------------------------------------------------- tablero docente
// La misma regla que los paneles de cada módulo: la cabecera x-clave-docente
// (o ?clave=) contra CLAVE_DOCENTE. Aquí solo vive lo que es de la plataforma
// (qué tarjetas ven los alumnos); los controles de cada módulo los da el módulo
// en /m/<id>/api/docente/tablero.

const limpio = (v) => String(v ?? '').trim().slice(0, 200);
const esDocente = (req) => limpio(req.get('x-clave-docente') || req.query.clave) === CLAVE;
const soloDocente = (req, res, next) => (esDocente(req) ? next() : res.status(401).json({ error: 'Clave incorrecta' }));
const cuerpoJson = express.json({ limit: '4kb' });

/** Todas las tarjetas del índice, ocultas incluidas, para el tablero. */
const tarjetasIndice = () => ({
  tarjetas: modulos.map((m) => ({
    id: m.tarjeta,
    modulo: m.modulo,
    titulo: m.titulo,
    etiqueta: m.etiqueta,
    seccion: m.seccion,
    estado: m.estado,
    url: m.url,
    visible: estaVisible(m.tarjeta)
  })),
  // Los módulos con servidor propio: son los únicos que pueden traer panel docente.
  modulos: [...new Map(modulos.filter((m) => m.tipo === 'express').map((m) => [m.modulo, m])).values()].map((m) => ({
    id: m.modulo,
    titulo: CURSO.modulos.find((c) => c.id === m.modulo)?.titulo ?? m.titulo,
    url: m.estado === 'ok' ? `${BASE_MODULOS}/${m.modulo}/` : null,
    estado: m.estado,
    detalle: m.detalle ?? null
  }))
});

app.post('/api/docente/entrar', cuerpoJson, (req, res) => {
  if (limpio(req.body?.clave) !== CLAVE) return res.status(401).json({ error: 'Clave incorrecta' });
  res.json({ ok: true, claveInsegura: CLAVE_POR_DEFECTO });
});

app.get('/api/docente/indice', soloDocente, (req, res) => res.json(tarjetasIndice()));

app.put('/api/docente/indice', soloDocente, cuerpoJson, (req, res) => {
  const { id, visible } = req.body ?? {};
  if (!modulos.some((m) => m.tarjeta === id)) return res.status(400).json({ error: 'No existe esa tarjeta en el índice' });
  if (typeof visible !== 'boolean') return res.status(400).json({ error: 'visible debe ser true o false' });
  fijarVisible(id, visible);
  res.json(tarjetasIndice());
});

app.get('/salud', (req, res) => {
  const rotos = modulos.filter((m) => m.estado === 'error').map((m) => m.id);
  res.json({ ok: rotos.length === 0, modulos: modulos.length, rotos });
});

// ------------------------------------------------------------------ vistas

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '5m' }));
app.get('/proyectar', (req, res) => res.sendFile(path.join(__dirname, 'public', 'proyectar.html')));
// Con la diagonal final (/docente/), las rutas relativas de la página caerían
// en /docente/…: se manda a la dirección sin diagonal.
app.get('/docente', (req, res) => {
  if (req.path.endsWith('/')) return res.redirect(301, '/docente');
  res.sendFile(path.join(__dirname, 'public', 'docente.html'));
});

app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, req, res, _next) => {
  // Un cuerpo roto o enorme es error de quien llama (400/413), no del servidor:
  // así contestan también los módulos.
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'La solicitud no es un JSON válido' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'La solicitud es demasiado grande' });
  console.error(err);
  res.status(500).json({ error: 'Algo falló en el servidor' });
});

// ------------------------------------------------------------------ arranque

// 0.0.0.0 = "escucha también a los demás equipos de la red", no solo a esta
// laptop. Sin esto, el QR apunta a un servidor que nadie más alcanza.
app.listen(PUERTO, '0.0.0.0', () => {
  const direcciones = direccionesLan(PUERTO);
  const publica = urlPublica();
  const raya = '─'.repeat(52);

  console.log(`\n${raya}`);
  console.log(`  ${MATERIA}`);
  console.log(raya);

  if (publica) {
    console.log(`  Desplegado en: ${publica}`);
  } else if (direcciones.length === 0) {
    console.log('  No detecté red. Conéctate al Wi-Fi del salón y reinicia.');
    console.log(`  Mientras tanto: http://localhost:${PUERTO}`);
  } else {
    console.log('  Los alumnos abren:');
    for (const [i, d] of direcciones.entries()) {
      console.log(`    ${i === 0 ? '→' : ' '} ${d.url}${i === 0 ? '' : `   (${d.nombre})`}`);
    }
  }

  console.log(`\n  Para proyectar el QR:  http://localhost:${PUERTO}/proyectar`);
  console.log(`  Tablero del docente:  http://localhost:${PUERTO}/docente`);
  console.log(raya);

  for (const m of modulos) {
    const marca = m.estado === 'ok' ? '✓' : '✗';
    console.log(`  ${marca} ${m.titulo}${m.estado === 'ok' ? '' : ` — ${m.detalle}`}`);
  }

  console.log(`${raya}\n  Ctrl+C para detener.\n`);
});
