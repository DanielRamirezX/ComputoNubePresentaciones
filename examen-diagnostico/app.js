import express from 'express';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { almacen } from './src/almacen.js';
import { PREGUNTAS, preguntasPublicas, calificar } from './src/preguntas.js';
import { resumir } from './src/estadisticas.js';
import { generarReporte } from './src/reporte-pdf.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PUERTO = process.env.PORT || 3000;
const MATERIA = process.env.MATERIA || 'Cómputo en la Nube';
const DOCENTE = process.env.DOCENTE || '';
// Qué ve el alumno al terminar: 'resumen' (calificación y temas), 'nada' o 'completo'.
const RETRO = process.env.RETROALIMENTACION || 'resumen';
const CLAVE = process.env.CLAVE_DOCENTE || 'cambiame';
const CLAVE_POR_DEFECTO = !process.env.CLAVE_DOCENTE;

/**
 * Construye la aplicación sin ponerla a escuchar.
 *
 * Así el examen sirve de dos maneras sin duplicar código:
 *   - solo:     `node server.js`  (y el deploy de Render sigue igual)
 *   - montado:  la plataforma del curso hace `app.use('/m/diagnostico', crearApp())`
 *
 * Por eso las rutas del navegador (public/) son relativas: funcionan en la raíz
 * y también colgadas de un subcamino.
 */
export function crearApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
  app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

  const limpio = (v, max = 80) => String(v ?? '').trim().slice(0, max);

  function esDocente(req) {
    const dada = req.get('x-clave-docente') || req.query.clave || '';
    return dada === CLAVE;
  }

  function soloDocente(req, res, next) {
    if (!esDocente(req)) return res.status(401).json({ error: 'Clave incorrecta' });
    next();
  }

  // ---------------------------------------------------------------- alumno

  app.get('/api/examen', (req, res) => {
    res.json({
      materia: MATERIA,
      totalPreguntas: PREGUNTAS.length,
      preguntas: preguntasPublicas()
    });
  });

  app.post('/api/intentos', async (req, res, next) => {
    try {
      const nombre = limpio(req.body?.nombre);
      const grupo = limpio(req.body?.grupo, 30) || 'sin grupo';
      const matricula = limpio(req.body?.matricula, 30);
      if (nombre.length < 3) return res.status(400).json({ error: 'Escribe tu nombre completo' });

      const intento = { id: randomUUID(), nombre, matricula, grupo, inicio: new Date().toISOString() };
      await almacen.crearIntento(intento);
      res.status(201).json({ id: intento.id });
    } catch (e) {
      next(e);
    }
  });

  // Guardado parcial: si el alumno cierra el navegador, no se pierde lo avanzado.
  app.patch('/api/intentos/:id', async (req, res, next) => {
    try {
      const intento = await almacen.obtenerIntento(req.params.id);
      if (!intento) return res.status(404).json({ error: 'Intento no encontrado' });
      if (intento.fin) return res.status(409).json({ error: 'El examen ya fue entregado' });

      const respuestas = req.body?.respuestas;
      if (!respuestas || typeof respuestas !== 'object') {
        return res.status(400).json({ error: 'Respuestas inválidas' });
      }
      await almacen.guardarParcial(req.params.id, JSON.stringify(respuestas));
      res.json({ guardado: true });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/intentos/:id/entregar', async (req, res, next) => {
    try {
      const intento = await almacen.obtenerIntento(req.params.id);
      if (!intento) return res.status(404).json({ error: 'Intento no encontrado' });
      if (intento.fin) return res.status(409).json({ error: 'Este examen ya fue entregado' });

      const respuestas = req.body?.respuestas && typeof req.body.respuestas === 'object'
        ? req.body.respuestas
        : JSON.parse(intento.respuestas || '{}');

      const { aciertos, total, detalle } = calificar(respuestas);
      await almacen.finalizar(req.params.id, {
        fin: new Date().toISOString(),
        aciertos,
        total,
        respuestasJson: JSON.stringify(respuestas)
      });

      if (RETRO === 'nada') return res.json({ entregado: true });

      const temas = {};
      for (const d of detalle) {
        temas[d.tema] ??= { aciertos: 0, total: 0 };
        temas[d.tema].total += 1;
        if (d.correcta) temas[d.tema].aciertos += 1;
      }

      res.json({
        entregado: true,
        aciertos,
        total,
        porcentaje: Math.round((aciertos / total) * 100),
        porTema: Object.entries(temas).map(([tema, v]) => ({
          tema,
          aciertos: v.aciertos,
          total: v.total
        })),
        detalle:
          RETRO === 'completo'
            ? detalle.map((d) => ({
                id: d.id,
                correcta: d.correcta,
                respuestaCorrecta: PREGUNTAS.find((p) => p.id === d.id).correcta
              }))
            : undefined
      });
    } catch (e) {
      next(e);
    }
  });

  // --------------------------------------------------------------- docente

  app.post('/api/docente/entrar', (req, res) => {
    if (limpio(req.body?.clave, 200) !== CLAVE) return res.status(401).json({ error: 'Clave incorrecta' });
    res.json({ ok: true, materia: MATERIA, claveInsegura: CLAVE_POR_DEFECTO, motor: almacen.motor });
  });

  app.get('/api/docente/resumen', soloDocente, async (req, res, next) => {
    try {
      const grupo = limpio(req.query.grupo, 30) || null;
      const filas = await almacen.listarIntentos(grupo);
      res.json({ ...resumir(filas, grupo), grupos: await almacen.listarGrupos(), materia: MATERIA });
    } catch (e) {
      next(e);
    }
  });

  app.get('/api/docente/reporte.pdf', soloDocente, async (req, res, next) => {
    try {
      const grupo = limpio(req.query.grupo, 30) || null;
      const filas = await almacen.listarIntentos(grupo);
      const resumen = resumir(filas, grupo);
      const nombre = `diagnostico-${(grupo || 'todos').replace(/[^\w-]+/g, '-').toLowerCase()}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
      generarReporte(resumen, { materia: MATERIA, docente: DOCENTE }).pipe(res);
    } catch (e) {
      next(e);
    }
  });

  app.get('/api/docente/datos.csv', soloDocente, async (req, res, next) => {
    try {
      const grupo = limpio(req.query.grupo, 30) || null;
      const filas = await almacen.listarIntentos(grupo);
      const { alumnos } = resumir(filas, grupo);
      const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = [
        ['nombre', 'matricula', 'grupo', 'aciertos', 'total', 'porcentaje', 'minutos'].join(','),
        ...alumnos.map((a) =>
          [a.nombre, a.matricula, a.grupo, a.aciertos, a.total, a.porcentaje, a.minutos ?? ''].map(celda).join(',')
        )
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="diagnostico.csv"');
      res.send('\uFEFF' + csv);
    } catch (e) {
      next(e);
    }
  });

  app.delete('/api/docente/intentos', soloDocente, async (req, res, next) => {
    try {
      const grupo = limpio(req.query.grupo, 30) || null;
      const borrados = await almacen.borrarIntentos(grupo);
      res.json({ borrados });
    } catch (e) {
      next(e);
    }
  });

  // ----------------------------------------------------------------- otros

  app.get('/docente', (req, res) => res.sendFile(path.join(__dirname, 'public', 'docente.html')));
  app.get('/salud', (req, res) => res.json({ ok: true, motor: almacen.motor }));

  app.use((err, req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Algo falló en el servidor' });
  });

  return app;
}

export const configuracion = { MATERIA, DOCENTE, CLAVE_POR_DEFECTO, PUERTO };
