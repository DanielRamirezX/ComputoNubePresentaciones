import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { CURSO } from './public/contenido.js';
import { almacen } from './src/almacen.js';
import { CASO, PREGUNTAS, REPASO, TEMAS, practicaPublica, calificar } from './src/practica.js';
import { reporteDominio } from './src/reporte-pdf.js';
import { resumirPractica } from './src/estadisticas.js';
import { crearEnrutador, enviarDescarga, enviarJson, fallo, leerJson, servirArchivos } from './src/servidor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PUERTO = Number(process.env.PORT || 3000);
const MATERIA = process.env.MATERIA || 'Cómputo en la Nube';
// La misma variable que usa el examen diagnóstico: una sola clave para todo.
const CLAVE = process.env.CLAVE_DOCENTE || 'cambiame';
const CLAVE_POR_DEFECTO = !process.env.CLAVE_DOCENTE;
// Qué ve el alumno al entregar: 'resumen' (calificación y temas), 'completo'
// (además, pregunta por pregunta con la respuesta correcta) o 'nada'.
const RETRO = process.env.RETROALIMENTACION || 'resumen';
const ZONA_HORARIA = process.env.ZONA_HORARIA || 'America/Mexico_City';

// Un alumno cuenta como "activo" si su navegador dio señales hace poco.
const VENTANA_ACTIVO_MS = 2 * 60 * 1000;

const XP_MAXIMA = new Map(CURSO.capitulos.flatMap((c) => c.actividades).map((a) => [a.id, a.xp]));
const TITULOS = new Map(
  CURSO.capitulos.flatMap((c) => c.actividades.map((a) => [a.id, `${a.titulo} (capítulo ${c.numero})`]))
);
const TOTAL_ACTIVIDADES = XP_MAXIMA.size;

/**
 * Construye el manejador del curso sin ponerlo a escuchar.
 *
 * Así sirve de dos maneras sin duplicar código:
 *   - solo:     `node server.js`
 *   - montado:  la plataforma hace `app.use('/m/comprender-nube', crearApp())`
 *
 * Por eso todo lo del navegador (public/) usa rutas relativas.
 */
export function crearApp() {
  const app = crearEnrutador();
  const estaticos = servirArchivos(path.join(__dirname, 'public'), {
    '/': '/index.html',
    '/docente': '/docente.html'
  });

  // Última señal de cada navegador. Vive en memoria: se vacía al reiniciar y ya.
  const vistos = new Map();

  const limpio = (v, max = 80) => String(v ?? '').trim().slice(0, max);
  const renglon = (v, max) => limpio(v, max).replace(/\s+/g, ' ');
  const grupoDe = (v) => renglon(v, 30).toUpperCase() || 'SIN GRUPO';
  const idValido = (v) => typeof v === 'string' && /^[a-f0-9]{16,40}$/.test(v);

  /** El alumno que manda el navegador, validado y dado de alta si hace falta. */
  function alumnoDe(cuerpo, completados) {
    const a = cuerpo?.alumno ?? {};
    if (!idValido(a.id)) throw fallo(400, 'Tu registro está incompleto. Recarga la página.');
    const nombre = renglon(a.nombre, 80);
    if (nombre.length < 3) throw fallo(400, 'Escribe tu nombre completo');
    vistos.set(a.id, Date.now());
    return almacen.registrar(
      { id: a.id, nombre, matricula: renglon(a.matricula, 30), grupo: grupoDe(a.grupo) },
      completados
    );
  }

  /** Solo actividades que existen y nunca más XP de lo que valen. */
  function completadosValidos(datos) {
    const limpios = {};
    for (const [id, xp] of Object.entries(datos && typeof datos === 'object' ? datos : {})) {
      const maxima = XP_MAXIMA.get(id);
      const valor = Math.round(Number(xp));
      if (maxima !== undefined && Number.isFinite(valor)) limpios[id] = Math.min(Math.max(valor, 0), maxima);
    }
    return limpios;
  }

  function respuestasValidas(datos) {
    const limpias = {};
    for (const p of PREGUNTAS) {
      const i = datos?.[p.id];
      if (Number.isInteger(i) && i >= 0 && i < p.opciones.length) limpias[p.id] = i;
    }
    return limpias;
  }

  // El folio es el principio del id de la entrega: corto para dictarlo, único
  // para buscarlo en el panel.
  const folioDe = (id) => {
    const hex = id.replace(/-/g, '').slice(0, 8).toUpperCase();
    return `${hex.slice(0, 4)}-${hex.slice(4)}`;
  };

  function resultadoPara(e) {
    const base = { folio: e.folio, fin: e.fin, nombre: e.nombre, matricula: e.matricula, grupo: e.grupo };
    if (RETRO === 'nada') return base;

    const { detalle } = calificar(e.respuestas);
    const porcentaje = Math.round((e.aciertos / e.total) * 100);
    return {
      ...base,
      aciertos: e.aciertos,
      total: e.total,
      porcentaje,
      calificacion: porcentaje / 10,
      porTema: TEMAS.map((tema) => {
        const delTema = detalle.filter((d) => d.tema === tema);
        return { tema, aciertos: delTema.filter((d) => d.correcta).length, total: delTema.length };
      }),
      detalle:
        RETRO === 'completo'
          ? detalle.map((d) => {
              const p = PREGUNTAS.find((x) => x.id === d.id);
              return {
                id: d.id,
                texto: p.texto,
                correcta: d.correcta,
                elegida: d.elegida === null ? null : p.opciones[d.elegida],
                respuesta: p.opciones[p.correcta],
                explicacion: p.explicacion
              };
            })
          : undefined
    };
  }

  // ---------------------------------------------------------------- alumno

  app.get('/api/estado', (req, res, { query }) => {
    // Solo cuenta la señal de quien ya se registró: nadie llena la memoria con ids inventados.
    if (idValido(query.a) && almacen.existe(query.a)) vistos.set(query.a, Date.now());
    enviarJson(res, 200, { materia: MATERIA, practicaAbierta: almacen.practicaAbierta() });
  });

  // El navegador manda su avance completo cada vez: si el servidor se reinició
  // (o Render borró el disco), se reconstruye solo con el siguiente movimiento.
  app.post('/api/progreso', async (req, res) => {
    const cuerpo = await leerJson(req);
    alumnoDe(cuerpo, completadosValidos(cuerpo.completados));
    enviarJson(res, 200, { guardado: true, practicaAbierta: almacen.practicaAbierta() });
  });

  // El caso sin preguntas: es lo que se proyecta en el salón.
  app.get('/api/caso', (req, res) => enviarJson(res, 200, { caso: CASO }));

  app.post('/api/practica', async (req, res) => {
    const alumno = alumnoDe(await leerJson(req));
    const entrega = almacen.entregaDe(alumno);
    if (entrega) return enviarJson(res, 200, { estado: 'entregada', resultado: resultadoPara(entrega) });
    if (!almacen.practicaAbierta()) return enviarJson(res, 200, { estado: 'cerrada' });

    almacen.iniciarPractica(alumno.id);
    enviarJson(res, 200, { estado: 'abierta', caso: CASO, preguntas: practicaPublica() });
  });

  app.post('/api/practica/entregar', async (req, res) => {
    const cuerpo = await leerJson(req);
    const alumno = alumnoDe(cuerpo);

    const previa = almacen.entregaDe(alumno);
    if (previa) {
      return enviarJson(res, 409, { error: 'Ya habías entregado esta práctica', resultado: resultadoPara(previa) });
    }
    if (!almacen.practicaAbierta()) {
      return enviarJson(res, 423, { error: 'La práctica ya está cerrada. Avísale a tu docente' });
    }

    const respuestas = respuestasValidas(cuerpo.respuestas);
    const { aciertos, total } = calificar(respuestas);
    const id = randomUUID();
    const entrega = {
      id,
      alumnoId: alumno.id,
      nombre: alumno.nombre,
      matricula: alumno.matricula,
      grupo: alumno.grupo,
      inicio: alumno.inicioPractica ?? null,
      fin: new Date().toISOString(),
      respuestas,
      aciertos,
      total,
      folio: folioDe(id)
    };
    almacen.guardarEntrega(entrega);
    enviarJson(res, 201, { estado: 'entregada', resultado: resultadoPara(entrega) });
  });

  // El reporte en PDF que el alumno descarga al terminar. Se pide con el id que
  // solo conoce su navegador; si entregó desde otro celular, se encuentra igual.
  app.get('/api/practica/reporte.pdf', (req, res, { query }) => {
    if (RETRO === 'nada') return enviarJson(res, 403, { error: 'Los resultados se revisan en clase' });
    const alumno = idValido(query.a) ? almacen.alumno(query.a) : null;
    const entrega = alumno && almacen.entregaDe(alumno);
    if (!entrega) return enviarJson(res, 404, { error: 'No encontré tu práctica entregada' });

    // Cómo le fue al grupo, contando las entregas que hay en este momento.
    const delGrupo = almacen.entregas(entrega.grupo).map((e) => calificar(e.respuestas).detalle);
    const aciertoGrupo = (filtro) => {
      const casos = delGrupo.flat().filter(filtro);
      return casos.length ? Math.round((casos.filter((d) => d.correcta).length / casos.length) * 100) : 0;
    };
    const grupo = {
      entregas: delGrupo.length,
      promedio: aciertoGrupo(() => true),
      porPregunta: Object.fromEntries(PREGUNTAS.map((p) => [p.id, aciertoGrupo((d) => d.id === p.id)])),
      porTema: Object.fromEntries(TEMAS.map((t) => [t, aciertoGrupo((d) => d.tema === t)]))
    };

    const pdf = reporteDominio({
      entrega,
      preguntas: PREGUNTAS,
      temas: TEMAS,
      detalle: calificar(entrega.respuestas).detalle,
      grupo,
      repaso: Object.fromEntries(Object.entries(REPASO).map(([t, ids]) => [t, ids.map((id) => TITULOS.get(id))])),
      conRespuestas: RETRO === 'completo',
      materia: MATERIA,
      curso: CURSO.titulo,
      fecha: new Date(entrega.fin).toLocaleString('es-MX', { timeZone: ZONA_HORARIA, dateStyle: 'long', timeStyle: 'short' })
    });
    enviarDescarga(res, `reporte-${entrega.folio}.pdf`, 'application/pdf', pdf);
  });

  // --------------------------------------------------------------- docente

  const esDocente = (req, query) => limpio(req.headers['x-clave-docente'] || query.clave, 200) === CLAVE;
  const soloDocente = (manejador) => (req, res, contexto) =>
    esDocente(req, contexto.query) ? manejador(req, res, contexto) : enviarJson(res, 401, { error: 'Clave incorrecta' });
  const grupoPedido = (query) => renglon(query.grupo, 30).toUpperCase() || null;

  app.post('/api/docente/entrar', async (req, res) => {
    const { clave } = await leerJson(req);
    if (limpio(clave, 200) !== CLAVE) return enviarJson(res, 401, { error: 'Clave incorrecta' });
    enviarJson(res, 200, { ok: true, materia: MATERIA, claveInsegura: CLAVE_POR_DEFECTO, motor: almacen.motor });
  });

  app.get(
    '/api/docente/resumen',
    soloDocente((req, res, { query }) => {
      const grupo = grupoPedido(query);
      const ahora = Date.now();
      const entregas = almacen.entregas(grupo);

      const alumnos = almacen.alumnos(grupo).map((a) => {
        // Si entró desde varios celulares, cuenta la señal más reciente de cualquiera.
        const visto = Math.max(0, ...a.ids.map((id) => vistos.get(id) ?? 0)) || null;
        const e = almacen.entregaDe(a);
        return {
          id: a.id,
          nombre: a.nombre,
          matricula: a.matricula,
          grupo: a.grupo,
          alta: a.alta,
          completados: a.completados,
          xp: Object.values(a.completados).reduce((s, x) => s + x, 0),
          visto: visto && new Date(visto).toISOString(),
          activo: visto !== null && ahora - visto < VENTANA_ACTIVO_MS,
          entrega: e && {
            alumnoId: e.alumnoId,
            aciertos: e.aciertos,
            total: e.total,
            porcentaje: Math.round((e.aciertos / e.total) * 1000) / 10,
            folio: e.folio,
            inicio: e.inicio,
            fin: e.fin
          }
        };
      });

      enviarJson(res, 200, {
        materia: MATERIA,
        practicaAbierta: almacen.practicaAbierta(),
        grupos: almacen.grupos(),
        totalActividades: TOTAL_ACTIVIDADES,
        alumnos,
        practica: resumirPractica(entregas),
        generado: new Date(ahora).toISOString()
      });
    })
  );

  app.put(
    '/api/docente/practica',
    soloDocente(async (req, res) => {
      const { abierta } = await leerJson(req);
      almacen.abrirPractica(abierta === true);
      enviarJson(res, 200, { practicaAbierta: almacen.practicaAbierta() });
    })
  );

  app.delete(
    '/api/docente/entregas/:alumnoId',
    soloDocente((req, res, { params }) => {
      if (!almacen.borrarEntrega(params.alumnoId)) return enviarJson(res, 404, { error: 'Ese alumno no tenía entrega' });
      enviarJson(res, 200, { borrada: true });
    })
  );

  app.delete(
    '/api/docente/datos',
    soloDocente((req, res, { query }) => enviarJson(res, 200, almacen.borrar(grupoPedido(query))))
  );

  app.get(
    '/api/docente/datos.csv',
    soloDocente((req, res, { query }) => {
      const grupo = grupoPedido(query);
      const fecha = (iso) => (iso ? new Date(iso).toLocaleString('es-MX', { timeZone: ZONA_HORARIA }) : '');
      const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

      const filas = almacen
        .alumnos(grupo)
        .sort((a, b) => a.grupo.localeCompare(b.grupo) || a.nombre.localeCompare(b.nombre, 'es'))
        .map((a) => {
          const e = almacen.entregaDe(a);
          const porcentaje = e ? Math.round((e.aciertos / e.total) * 1000) / 10 : '';
          return [
            a.nombre,
            a.matricula,
            a.grupo,
            Object.values(a.completados).reduce((s, x) => s + x, 0),
            `${Object.keys(a.completados).length}/${TOTAL_ACTIVIDADES}`,
            e?.aciertos ?? '',
            e?.total ?? '',
            porcentaje,
            e ? Math.round(porcentaje) / 10 : '',
            e?.folio ?? '',
            fecha(e?.fin)
          ];
        });

      const csv = [
        ['nombre', 'matricula', 'grupo', 'xp', 'actividades', 'practica_aciertos', 'practica_total', 'practica_porcentaje', 'calificacion', 'folio', 'entregada'],
        ...filas
      ]
        .map((fila) => fila.map(celda).join(','))
        .join('\n');

      const nombre = `comprender-nube-${(grupo || 'todos').replace(/[^\w-]+/g, '-').toLowerCase()}.csv`;
      // El BOM hace que Excel abra los acentos bien.
      enviarDescarga(res, nombre, 'text/csv; charset=utf-8', '﻿' + csv);
    })
  );

  app.get('/salud', (req, res) => enviarJson(res, 200, { ok: true, motor: almacen.motor }));

  // ----------------------------------------------------------- el manejador

  return async function manejar(req, res, next) {
    try {
      if (await app.atender(req, res)) return;
      if (await estaticos(req, res)) return;
      if (req.url.startsWith('/api/')) return enviarJson(res, 404, { error: 'No existe esa ruta' });
      // Montado, lo que no es nuestro lo decide la plataforma; suelto, es un 404.
      if (next) return next();
      enviarJson(res, 404, { error: 'No encontrado' });
    } catch (e) {
      if (!e.estado) console.error(e);
      if (res.headersSent) return res.end();
      enviarJson(res, e.estado || 500, { error: e.estado ? e.message : 'Algo falló en el servidor' });
    }
  };
}

export const configuracion = { MATERIA, CLAVE_POR_DEFECTO, PUERTO };
