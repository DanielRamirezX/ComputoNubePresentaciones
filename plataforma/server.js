import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

import { CURSO } from './curso.js';
import { montarModulos, BASE_MODULOS } from './src/montar.js';
import { direccionesLan, direccionPrincipal, urlPublica } from './src/red.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PUERTO = Number(process.env.PORT || 3000);
const MATERIA = process.env.MATERIA || CURSO.materia;
const DOCENTE = process.env.DOCENTE || CURSO.docente;
const GRUPO = process.env.GRUPO || CURSO.grupo;

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
  res.json({ materia: MATERIA, docente: DOCENTE, grupo: GRUPO, modulos, publica: Boolean(urlPublica()) });
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

app.get('/salud', (req, res) => {
  const rotos = modulos.filter((m) => m.estado === 'error').map((m) => m.id);
  res.json({ ok: rotos.length === 0, modulos: modulos.length, rotos });
});

// ------------------------------------------------------------------ vistas

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '5m' }));
app.get('/proyectar', (req, res) => res.sendFile(path.join(__dirname, 'public', 'proyectar.html')));

app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, req, res, _next) => {
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
  console.log(raya);

  for (const m of modulos) {
    const marca = m.estado === 'ok' ? '✓' : '✗';
    console.log(`  ${marca} ${m.titulo}${m.estado === 'ok' ? '' : ` — ${m.detalle}`}`);
  }

  console.log(`${raya}\n  Ctrl+C para detener.\n`);
});
