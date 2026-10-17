import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { almacen } from './src/almacen.js';
import { calificarCuenta, conRepaso, datosDe, hayRubrica } from './src/calificar.js';
import { repasosDe } from './src/repaso.js';
import { EVALUACIONES, RETROS, combinada, evaluacionDe, tieneParte } from './src/evaluaciones.js';
import { pct, resumen, resumirPractica, resumirTeoria } from './src/estadisticas.js';
import { crearFirmador } from './src/firma.js';
import { crearEnrutador, enviarDescarga, enviarJson, fallo, leerJson, servirArchivos } from './src/servidor.js';
import { TEORIA } from './src/teoria/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PUERTO = Number(process.env.PORT || 3000);
const MATERIA = process.env.MATERIA || 'Cómputo en la Nube';
// La misma variable que usan el examen diagnóstico y la Ruta AWS: una sola clave para todo.
const CLAVE = process.env.CLAVE_DOCENTE || 'cambiame';
const CLAVE_POR_DEFECTO = !process.env.CLAVE_DOCENTE;
const ZONA_HORARIA = process.env.ZONA_HORARIA || 'America/Mexico_City';

// Un alumno cuenta como "activo" si su navegador dio señales hace poco (el
// latido de la página es cada 10 s).
const VENTANA_ACTIVO_MS = 2 * 60 * 1000;

// La cuenta de la consola simulada viaja completa en cada copia. 512 KB es
// mucho más de lo que ocupa un laboratorio de una hora; el tope evita que
// alguien mande megas a propósito.
const LIMITE_CUENTA = 512 * 1024;
const LIMITE_CUERPO_CUENTA = LIMITE_CUENTA + 16 * 1024;
const LIMITE_RESTAURAR = 256 * 1024;

const textoOpcion = (o) => (typeof o === 'string' ? o : String(o?.texto ?? ''));
const retroOpcion = (o) => (typeof o === 'string' ? '' : String(o?.retro ?? ''));
const calificacion10 = (porcentaje) => Math.round(porcentaje) / 10;
const minutosDesde = (iso, ahora) => (iso ? Math.max(0, Math.floor((ahora - new Date(iso)) / 60000)) : null);

// El folio es el principio del id de la entrega: corto para dictarlo, único
// para buscarlo en el panel.
const folioDe = (id) => {
  const hex = id.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4)}`;
};

/**
 * Construye el manejador del módulo sin ponerlo a escuchar.
 *
 * Así sirve de dos maneras sin duplicar código:
 *   - solo:     `node server.js`
 *   - montado:  la plataforma hace `app.use('/m/evaluacion', crearApp())`
 *
 * Por eso todo lo del navegador (public/) usa rutas relativas.
 */
export function crearApp() {
  const app = crearEnrutador();
  const estaticos = servirArchivos(path.join(__dirname, 'public'), {
    '/': '/index.html',
    '/docente': '/docente.html'
  });
  const firmador = crearFirmador(CLAVE);

  // Última señal de cada navegador. Vive en memoria: se vacía al reiniciar y ya.
  const vistos = new Map();

  const limpio = (v, max = 80) => String(v ?? '').trim().slice(0, max);
  const renglon = (v, max) => limpio(v, max).replace(/\s+/g, ' ');
  const grupoDe = (v) => renglon(v, 30).toUpperCase() || 'SIN GRUPO';
  const idValido = (v) => typeof v === 'string' && /^[a-f0-9]{16,40}$/.test(v);

  /** El alumno que manda el navegador, validado y dado de alta si hace falta. */
  function alumnoDe(cuerpo) {
    const a = cuerpo?.alumno ?? {};
    if (!idValido(a.id)) throw fallo(400, 'Tu registro está incompleto. Recarga la página.');
    const nombre = renglon(a.nombre, 80);
    if (nombre.length < 3) throw fallo(400, 'Escribe tu nombre completo');
    vistos.set(a.id, Date.now());
    return almacen.registrar({ id: a.id, nombre, matricula: renglon(a.matricula, 30), grupo: grupoDe(a.grupo) });
  }

  function evaluacionPedida(valor) {
    const ev = evaluacionDe(valor);
    if (!ev) throw fallo(400, 'Esa evaluación no existe');
    return ev;
  }

  function exigirParte(ev, parte) {
    if (!tieneParte(ev, parte)) {
      throw fallo(404, parte === 'teoria' ? `${ev.titulo} no tiene parte teórica` : `${ev.titulo} no tiene parte práctica`);
    }
  }

  const bancoDe = (ev) => (ev.teoria ? TEORIA.get(ev.teoria) ?? null : null);
  const disponible = (ev, parte) => (parte === 'teoria' ? Boolean(bancoDe(ev)) : hayRubrica(ev.lab));

  /** La cuenta de la consola que manda el navegador: un objeto y no más grande de la cuenta. */
  function cuentaDe(cuerpo) {
    const cuenta = cuerpo?.estado;
    if (!cuenta || typeof cuenta !== 'object' || Array.isArray(cuenta)) {
      throw fallo(400, 'No llegó el estado de tu cuenta. Recarga la página: tu avance sigue guardado en este equipo.');
    }
    if (JSON.stringify(cuenta).length > LIMITE_CUENTA) throw fallo(413, 'Tu cuenta pesa demasiado para guardarse');
    return cuenta;
  }
  const revDe = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);

  /** Califica la cuenta; si la rúbrica truena con un estado raro, es un 400 y no un 500. */
  function calificar(ev, cuenta, identidad) {
    try {
      return calificarCuenta(ev.lab, cuenta, identidad);
    } catch (e) {
      console.error(`No pude calificar el laboratorio ${ev.lab}:`, e);
      throw fallo(400, 'No pude revisar tu cuenta. Avísale a tu docente: tu avance sigue guardado en este equipo.');
    }
  }

  // ------------------------------------------------------------ la teórica

  /** Casos y preguntas sin `correcta` ni `retro`: se arma aquí, campo por campo. */
  function teoriaPublica(banco) {
    const caso = banco.CASO;
    return {
      minutos: Number(banco.MINUTOS) || 45,
      temas: banco.TEMAS ?? [],
      presentacion: typeof caso === 'string' ? caso : String(caso?.historia ?? caso?.html ?? ''),
      casos: (banco.CASOS ?? []).map((c) => ({ id: c.id, empresa: c.empresa ?? '', titulo: c.titulo ?? '', historia: c.historia ?? '' })),
      preguntas: banco.PREGUNTAS.map((p) => ({
        id: p.id,
        caso: p.caso,
        tema: p.tema,
        sesion: p.sesion,
        texto: p.texto,
        opciones: p.opciones.map(textoOpcion)
      }))
    };
  }

  function respuestasValidas(datos, { PREGUNTAS }) {
    const limpias = {};
    for (const p of PREGUNTAS) {
      const i = datos?.[p.id];
      if (Number.isInteger(i) && i >= 0 && i < p.opciones.length) limpias[p.id] = i;
    }
    return limpias;
  }

  function calificarTeoria(banco, respuestas) {
    if (typeof banco.calificar === 'function') {
      const { aciertos, total } = banco.calificar(respuestas);
      if (Number.isFinite(aciertos) && Number.isFinite(total)) return { aciertos, total };
    }
    return { aciertos: banco.PREGUNTAS.filter((p) => respuestas[p.id] === p.correcta).length, total: banco.PREGUNTAS.length };
  }

  /**
   * Lo que ve el alumno de su teórica. Se calcula cada vez que lo pide (no se
   * congela al entregar): si el docente cambia a retroalimentación completa,
   * el alumno que regresa ya la ve.
   */
  function resultadoTeoria(ev, e, retro) {
    const porcentaje = pct(e.aciertos, e.total);
    const base = {
      parte: 'teoria',
      evaluacion: ev.id,
      folio: e.folio,
      inicio: e.inicio,
      fin: e.fin,
      nombre: e.nombre,
      matricula: e.matricula,
      grupo: e.grupo,
      aciertos: e.aciertos,
      total: e.total,
      porcentaje,
      calificacion: calificacion10(porcentaje),
      retro
    };
    const banco = bancoDe(ev);
    if (!banco) return base;

    const acerto = (p) => e.respuestas?.[p.id] === p.correcta;
    const conteo = (filtro) => {
      const del = banco.PREGUNTAS.filter(filtro);
      return { aciertos: del.filter(acerto).length, total: del.length };
    };
    base.porTema = (banco.TEMAS ?? []).map((tema) => ({ tema, ...conteo((p) => p.tema === tema) })).filter((t) => t.total);
    base.porCaso = (banco.CASOS ?? []).map((c) => ({ id: c.id, titulo: c.titulo, empresa: c.empresa, ...conteo((p) => p.caso === c.id) }));

    if (retro === 'completa') {
      base.detalle = banco.PREGUNTAS.map((p) => {
        const i = e.respuestas?.[p.id];
        const elegida = Number.isInteger(i) && p.opciones[i] ? { indice: i, texto: textoOpcion(p.opciones[i]), retro: retroOpcion(p.opciones[i]) } : null;
        return {
          id: p.id,
          caso: p.caso,
          tema: p.tema,
          texto: p.texto,
          acerto: acerto(p),
          repaso: repasosDe(p.repaso),
          elegida,
          correcta: { indice: p.correcta, texto: textoOpcion(p.opciones[p.correcta]), retro: retroOpcion(p.opciones[p.correcta]) }
        };
      });
    }
    return base;
  }

  // ------------------------------------------------------------ la práctica

  function resultadoPractica(ev, e, retro) {
    const porcentaje = pct(e.obtenidos, e.total);
    return {
      parte: 'practica',
      evaluacion: ev.id,
      folio: e.folio,
      inicio: e.inicio,
      fin: e.fin,
      nombre: e.nombre,
      matricula: e.matricula,
      grupo: e.grupo,
      obtenidos: e.obtenidos,
      total: e.total,
      porcentaje,
      calificacion: calificacion10(porcentaje),
      retro,
      tareas: (retro === 'completa' ? conRepaso(ev.lab, { tareas: e.tareas ?? [] }).tareas : e.tareas ?? []).map((t) =>
        retro === 'completa' ? t : { id: t.id, titulo: t.titulo, puntos: t.puntos, obtenidos: t.obtenidos, ...(t.bono ? { bono: true } : {}) }
      )
    };
  }

  const resultadoDe = (ev, parte, e, retro) => (parte === 'teoria' ? resultadoTeoria(ev, e, retro) : resultadoPractica(ev, e, retro));

  /** Lo esencial de la entrega, firmado. La cuenta completa no viaja (ver src/firma.js). */
  function comprobanteDe(ev, parte, entrega) {
    const { estado: _cuenta, llave: _llave, ...esencial } = entrega;
    return firmador.firmar({ tipo: parte, evaluacion: ev.id, generacion: almacen.generacion, entrega: esencial });
  }

  /** Respuesta de "ya entregaste": resultado según la retroalimentación de hoy + comprobante fresco. */
  const respuestaEntregada = (ev, parte, entrega) => ({
    estado: 'entregada',
    resultado: resultadoDe(ev, parte, entrega, almacen.config(ev.id).retro),
    comprobante: comprobanteDe(ev, parte, entrega)
  });

  const porcentajeEntrega = (parte, e) => (parte === 'teoria' ? pct(e.aciertos, e.total) : pct(e.obtenidos, e.total));

  /** Cómo ve el alumno cada evaluación en su inicio. */
  function estadoPublico(ev, alumno) {
    const cfg = almacen.config(ev.id);
    const porcentajes = {};
    const parte = (p) => {
      if (!tieneParte(ev, p)) return null;
      const entrega = alumno && almacen.entregaDe(alumno, ev.id, p);
      const inicio = alumno && almacen.inicio(alumno, ev.id, p);
      if (entrega) porcentajes[p] = porcentajeEntrega(p, entrega);
      return {
        estado: !disponible(ev, p) ? 'preparacion' : cfg[p].abierta ? 'abierta' : 'cerrada',
        empezada: Boolean(inicio),
        inicio: inicio?.hora ?? null,
        entrega: entrega
          ? {
              id: entrega.id,
              folio: entrega.folio,
              fin: entrega.fin,
              ...(p === 'teoria' ? { aciertos: entrega.aciertos, total: entrega.total } : { obtenidos: entrega.obtenidos, total: entrega.total }),
              porcentaje: porcentajes[p],
              calificacion: calificacion10(porcentajes[p])
            }
          : null
      };
    };
    const partes = { teoria: parte('teoria'), practica: parte('practica') };
    return {
      id: ev.id,
      titulo: ev.titulo,
      fecha: ev.fecha,
      fechaTexto: ev.fechaTexto,
      resumen: ev.resumen,
      lab: ev.lab,
      pesos: ev.pesos,
      retro: cfg.retro,
      autorrevision: cfg.autorrevision,
      partes,
      combinada: combinada(ev, porcentajes)
    };
  }

  const marca = () => ({ generacion: almacen.generacion, ahora: new Date().toISOString() });

  // ---------------------------------------------------------------- alumno

  app.get('/api/estado', (req, res, { query }) => {
    // Solo cuenta la señal de quien ya se registró: nadie llena la memoria con ids inventados.
    const alumno = idValido(query.a) ? almacen.alumno(query.a) : null;
    if (alumno) vistos.set(alumno.id, Date.now());
    enviarJson(res, 200, {
      ...marca(),
      materia: MATERIA,
      registrado: Boolean(alumno),
      evaluaciones: EVALUACIONES.map((ev) => estadoPublico(ev, alumno))
    });
  });

  // Los resultados ya entregados de una evaluación, sin arrancar nada.
  app.get('/api/resultado', (req, res, { query }) => {
    const ev = evaluacionPedida(query.evaluacion);
    const alumno = idValido(query.a) ? almacen.alumno(query.a) : null;
    const cfg = almacen.config(ev.id);
    const datos = { ...marca(), evaluacion: estadoPublico(ev, alumno) };
    for (const parte of ['teoria', 'practica']) {
      const e = alumno && tieneParte(ev, parte) && almacen.entregaDe(alumno, ev.id, parte);
      datos[parte] = e ? { resultado: resultadoDe(ev, parte, e, cfg.retro), comprobante: comprobanteDe(ev, parte, e) } : null;
    }
    enviarJson(res, 200, datos);
  });

  app.post('/api/teoria', async (req, res) => {
    const cuerpo = await leerJson(req);
    const ev = evaluacionPedida(cuerpo.evaluacion);
    exigirParte(ev, 'teoria');
    const alumno = alumnoDe(cuerpo);

    const entrega = almacen.entregaDe(alumno, ev.id, 'teoria');
    if (entrega) return enviarJson(res, 200, { ...marca(), ...respuestaEntregada(ev, 'teoria', entrega) });
    const banco = bancoDe(ev);
    if (!banco) return enviarJson(res, 200, { ...marca(), estado: 'preparacion' });
    if (!almacen.config(ev.id).teoria.abierta) return enviarJson(res, 200, { ...marca(), estado: 'cerrada' });

    const inicio = almacen.iniciar(alumno, ev.id, 'teoria');
    enviarJson(res, 200, { ...marca(), estado: 'abierta', inicio: inicio.hora, ...teoriaPublica(banco) });
  });

  app.post('/api/teoria/entregar', async (req, res) => {
    const cuerpo = await leerJson(req);
    const ev = evaluacionPedida(cuerpo.evaluacion);
    exigirParte(ev, 'teoria');
    const alumno = alumnoDe(cuerpo);

    const previa = almacen.entregaDe(alumno, ev.id, 'teoria');
    if (previa) {
      return enviarJson(res, 409, { ...marca(), error: 'Ya habías entregado esta parte', ...respuestaEntregada(ev, 'teoria', previa) });
    }
    const banco = bancoDe(ev);
    if (!banco || !almacen.config(ev.id).teoria.abierta) {
      return enviarJson(res, 423, { error: 'La parte teórica ya está cerrada. Avísale a tu docente: tus respuestas siguen guardadas en este equipo' });
    }

    const respuestas = respuestasValidas(cuerpo.respuestas, banco);
    const { aciertos, total } = calificarTeoria(banco, respuestas);
    const id = randomUUID();
    const entrega = {
      id,
      evaluacion: ev.id,
      parte: 'teoria',
      alumnoId: alumno.id,
      nombre: alumno.nombre,
      matricula: alumno.matricula,
      grupo: alumno.grupo,
      inicio: almacen.inicio(alumno, ev.id, 'teoria')?.hora ?? null,
      fin: new Date().toISOString(),
      respuestas,
      aciertos,
      total,
      folio: folioDe(id)
    };
    almacen.guardarEntrega(ev.id, 'teoria', entrega);
    enviarJson(res, 201, { ...marca(), ...respuestaEntregada(ev, 'teoria', entrega) });
  });

  app.post('/api/practica', async (req, res) => {
    const cuerpo = await leerJson(req);
    const ev = evaluacionPedida(cuerpo.evaluacion);
    exigirParte(ev, 'practica');
    const alumno = alumnoDe(cuerpo);

    const entrega = almacen.entregaDe(alumno, ev.id, 'practica');
    if (entrega) return enviarJson(res, 200, { ...marca(), ...respuestaEntregada(ev, 'practica', entrega) });
    if (!hayRubrica(ev.lab)) return enviarJson(res, 200, { ...marca(), estado: 'preparacion' });
    const cfg = almacen.config(ev.id);
    if (!cfg.practica.abierta) return enviarJson(res, 200, { ...marca(), estado: 'cerrada' });

    const inicio = almacen.iniciar(alumno, ev.id, 'practica');
    const copia = almacen.copiaDe(alumno, ev.id);
    enviarJson(res, 200, {
      ...marca(),
      estado: 'abierta',
      lab: ev.lab,
      inicio: inicio.hora,
      // Con este nombre y matrícula se calculan sus datos del laboratorio.
      identidad: inicio.identidad,
      autorrevision: cfg.autorrevision,
      retro: cfg.retro,
      copia: copia ? { estado: copia.estado, rev: copia.rev, hora: copia.hora } : null
    });
  });

  // La copia del avance: el docente la ve en vivo y, si el alumno cambia de
  // equipo, la recupera. Se acepta aunque la práctica ya esté cerrada, para que
  // no se pierda lo que hizo; lo que no se acepta es cambiar una entrega.
  app.post('/api/practica/guardar', async (req, res) => {
    const cuerpo = await leerJson(req, LIMITE_CUERPO_CUENTA);
    const ev = evaluacionPedida(cuerpo.evaluacion);
    exigirParte(ev, 'practica');
    const alumno = alumnoDe(cuerpo);
    if (almacen.entregaDe(alumno, ev.id, 'practica')) return enviarJson(res, 200, { ...marca(), guardado: false, estado: 'entregada' });

    const cuenta = cuentaDe(cuerpo);
    // Si el servidor perdió el disco a media práctica, la hora de inicio vuelve a empezar aquí.
    const inicio = almacen.inicio(alumno, ev.id, 'practica') ?? almacen.iniciar(alumno, ev.id, 'practica');
    const copia = almacen.guardarCopia(alumno, ev.id, { estado: cuenta, rev: revDe(cuerpo.rev), identidad: inicio.identidad });
    const cfg = almacen.config(ev.id);
    enviarJson(res, 200, { ...marca(), guardado: true, hora: copia.hora, abierta: cfg.practica.abierta, autorrevision: cfg.autorrevision });
  });

  // La rúbrica a medio camino. No guarda ninguna entrega: es para que el
  // alumno vea qué le falta, si el docente lo permite.
  app.post('/api/practica/revisar', async (req, res) => {
    const cuerpo = await leerJson(req, LIMITE_CUERPO_CUENTA);
    const ev = evaluacionPedida(cuerpo.evaluacion);
    exigirParte(ev, 'practica');
    const alumno = alumnoDe(cuerpo);
    if (!almacen.config(ev.id).autorrevision) {
      return enviarJson(res, 403, { error: 'En esta evaluación tu docente no activó «Revisar mi avance»' });
    }
    const entrega = almacen.entregaDe(alumno, ev.id, 'practica');
    if (entrega) return enviarJson(res, 409, { ...marca(), error: 'Ya entregaste este laboratorio', ...respuestaEntregada(ev, 'practica', entrega) });
    if (!hayRubrica(ev.lab)) return enviarJson(res, 423, { error: 'Este laboratorio todavía está en preparación' });

    const cuenta = cuentaDe(cuerpo);
    const inicio = almacen.inicio(alumno, ev.id, 'practica') ?? almacen.iniciar(alumno, ev.id, 'practica');
    almacen.guardarCopia(alumno, ev.id, { estado: cuenta, rev: revDe(cuerpo.rev), identidad: inicio.identidad });
    const { resultado } = calificar(ev, cuenta, inicio.identidad);
    enviarJson(res, 200, { ...marca(), revision: { ...resultado, porcentaje: pct(resultado.obtenidos, resultado.total) } });
  });

  app.post('/api/practica/entregar', async (req, res) => {
    const cuerpo = await leerJson(req, LIMITE_CUERPO_CUENTA);
    const ev = evaluacionPedida(cuerpo.evaluacion);
    exigirParte(ev, 'practica');
    const alumno = alumnoDe(cuerpo);

    const previa = almacen.entregaDe(alumno, ev.id, 'practica');
    if (previa) {
      return enviarJson(res, 409, { ...marca(), error: 'Ya habías entregado este laboratorio', ...respuestaEntregada(ev, 'practica', previa) });
    }
    if (!hayRubrica(ev.lab) || !almacen.config(ev.id).practica.abierta) {
      return enviarJson(res, 423, { error: 'La parte práctica ya está cerrada. Avísale a tu docente: tu cuenta sigue guardada en este equipo' });
    }

    const cuenta = cuentaDe(cuerpo);
    const inicio = almacen.inicio(alumno, ev.id, 'practica');
    const identidad = inicio?.identidad ?? { nombre: alumno.nombre, matricula: alumno.matricula };
    const { cuenta: final, resultado } = calificar(ev, cuenta, identidad);
    const id = randomUUID();
    const entrega = {
      id,
      evaluacion: ev.id,
      parte: 'practica',
      alumnoId: alumno.id,
      nombre: alumno.nombre,
      matricula: alumno.matricula,
      grupo: alumno.grupo,
      identidad,
      inicio: inicio?.hora ?? null,
      fin: new Date().toISOString(),
      obtenidos: resultado.obtenidos,
      total: resultado.total,
      tareas: resultado.tareas,
      estado: final,
      folio: folioDe(id)
    };
    almacen.guardarEntrega(ev.id, 'practica', entrega);
    enviarJson(res, 201, { ...marca(), ...respuestaEntregada(ev, 'practica', entrega) });
  });

  // El navegador regresa los comprobantes de entregas que el servidor ya no
  // tiene (Render borró el disco). Ver el comentario largo de src/firma.js.
  app.post('/api/restaurar', async (req, res) => {
    const cuerpo = await leerJson(req, LIMITE_RESTAURAR);
    alumnoDe(cuerpo);
    const lista = Array.isArray(cuerpo.comprobantes) ? cuerpo.comprobantes.slice(0, 12) : [];

    const resultados = lista.map((comprobante) => {
      const datos = firmador.abrir(comprobante);
      const ev = datos && evaluacionDe(datos.evaluacion);
      const parte = datos?.tipo;
      const e = datos?.entrega;
      if (!ev || !tieneParte(ev, parte) || !e?.id || !idValido(e.alumnoId)) return { estado: 'invalido' };
      const cual = { evaluacion: ev.id, parte, id: e.id };

      const duenio =
        almacen.alumno(e.alumnoId) ??
        almacen.registrar({ id: e.alumnoId, nombre: renglon(e.nombre, 80), matricula: renglon(e.matricula, 30), grupo: grupoDe(e.grupo) });
      const actual = almacen.entregaDe(duenio, ev.id, parte);
      if (actual) return { ...cual, estado: actual.id === e.id ? 'ya-estaba' : 'otra' };
      // Misma generación = este servidor nunca perdió el disco: el docente la borró a propósito.
      if (datos.generacion === almacen.generacion) return { ...cual, estado: 'borrada' };

      almacen.guardarEntrega(ev.id, parte, { ...e, restaurada: new Date().toISOString() });
      return { ...cual, estado: 'restaurada' };
    });
    enviarJson(res, 200, { ...marca(), resultados });
  });

  // --------------------------------------------------------------- docente

  const esDocente = (req, query) => limpio(req.headers['x-clave-docente'] || query.clave, 200) === CLAVE;
  const soloDocente = (manejador) => (req, res, contexto) =>
    esDocente(req, contexto.query) ? manejador(req, res, contexto) : enviarJson(res, 401, { error: 'Clave incorrecta' });
  const grupoPedido = (query) => renglon(query.grupo, 30).toUpperCase() || null;

  /** La configuración de una evaluación tal como la ve el panel. */
  const configPanel = (ev) => ({
    id: ev.id,
    titulo: ev.titulo,
    fecha: ev.fecha,
    fechaTexto: ev.fechaTexto,
    lab: ev.lab,
    teoria: ev.teoria,
    pesos: ev.pesos,
    partes: ['teoria', 'practica'].filter((p) => tieneParte(ev, p)),
    disponible: { teoria: tieneParte(ev, 'teoria') && disponible(ev, 'teoria'), practica: disponible(ev, 'practica') },
    minutosTeoria: Number(bancoDe(ev)?.MINUTOS) || null,
    preguntas: bancoDe(ev)?.PREGUNTAS?.length ?? null,
    ...almacen.config(ev.id)
  });

  // Cuántas tareas lleva cada quien según su última copia. Calificar en cada
  // refresco del panel (cada 5 s) sería desperdicio: se recuerda por copia.
  const avances = new Map();
  function avanceDe(ev, copia) {
    if (!copia || !hayRubrica(ev.lab)) return null;
    const k = `${ev.id}:${copia.alumnoId}`;
    const previo = avances.get(k);
    if (previo?.hora === copia.hora) return previo.avance;
    let avance;
    try {
      const { resultado } = calificarCuenta(ev.lab, copia.estado, copia.identidad);
      avance = {
        obtenidos: resultado.obtenidos,
        total: resultado.total,
        // Las tareas bono (opcionales) no cuentan en «X de Y tareas».
        tareasLogradas: resultado.tareas.filter((t) => !t.bono && t.puntos > 0 && t.obtenidos >= t.puntos).length,
        tareasTotal: resultado.tareas.filter((t) => !t.bono).length
      };
    } catch {
      avance = { error: true };
    }
    avances.set(k, { hora: copia.hora, avance });
    return avance;
  }

  /** Una fila de la tabla del panel: cómo va el alumno en cada parte. */
  function filaAlumno(ev, a, ahora) {
    const copia = tieneParte(ev, 'practica') ? almacen.copiaDe(a, ev.id) : null;
    // Si entró desde varios equipos, cuenta la señal más reciente de cualquiera.
    const senal = Math.max(0, ...a.ids.map((id) => vistos.get(id) ?? 0), copia ? new Date(copia.hora).getTime() : 0) || null;
    const porcentajes = {};

    const parte = (p) => {
      if (!tieneParte(ev, p)) return null;
      const e = almacen.entregaDe(a, ev.id, p);
      const inicio = almacen.inicio(a, ev.id, p);
      if (e) {
        porcentajes[p] = porcentajeEntrega(p, e);
        return {
          estado: 'entregada',
          alumnoId: e.alumnoId,
          folio: e.folio,
          inicio: e.inicio,
          fin: e.fin,
          minutos: e.inicio ? Math.max(1, Math.round((new Date(e.fin) - new Date(e.inicio)) / 60000)) : null,
          porcentaje: porcentajes[p],
          restaurada: Boolean(e.restaurada),
          ...(p === 'teoria'
            ? { aciertos: e.aciertos, total: e.total }
            : {
                obtenidos: e.obtenidos,
                total: e.total,
                tareasLogradas: (e.tareas ?? []).filter((t) => !t.bono && t.puntos > 0 && t.obtenidos >= t.puntos).length,
                tareasTotal: (e.tareas ?? []).filter((t) => !t.bono).length
              })
        };
      }
      if (!inicio) return { estado: 'sin-empezar' };
      return {
        estado: 'en-curso',
        inicio: inicio.hora,
        minutos: minutosDesde(inicio.hora, ahora),
        ...(p === 'practica' ? { guardado: copia?.hora ?? null, ...avanceDe(ev, copia) } : {})
      };
    };

    const teoria = parte('teoria');
    const practica = parte('practica');
    return {
      id: a.id,
      ids: a.ids,
      nombre: a.nombre,
      matricula: a.matricula,
      grupo: a.grupo,
      visto: senal && new Date(senal).toISOString(),
      activo: senal !== null && ahora - senal < VENTANA_ACTIVO_MS,
      teoria,
      practica,
      combinada: combinada(ev, porcentajes)
    };
  }

  app.post('/api/docente/entrar', async (req, res) => {
    const { clave } = await leerJson(req);
    if (limpio(clave, 200) !== CLAVE) return enviarJson(res, 401, { error: 'Clave incorrecta' });
    enviarJson(res, 200, {
      ok: true,
      materia: MATERIA,
      claveInsegura: CLAVE_POR_DEFECTO,
      motor: almacen.motor,
      evaluaciones: EVALUACIONES.map(configPanel)
    });
  });

  app.get(
    '/api/docente/resumen',
    soloDocente((req, res, { query }) => {
      const ev = evaluacionPedida(query.evaluacion);
      const grupo = grupoPedido(query);
      const ahora = Date.now();
      const alumnos = almacen.alumnos(grupo).map((a) => filaAlumno(ev, a, ahora));

      const conteo = (p) =>
        tieneParte(ev, p)
          ? {
              empezaron: alumnos.filter((a) => a[p].estado !== 'sin-empezar').length,
              enCurso: alumnos.filter((a) => a[p].estado === 'en-curso').length,
              entregaron: alumnos.filter((a) => a[p].estado === 'entregada').length
            }
          : null;

      const banco = bancoDe(ev);
      const entregasTeoria = tieneParte(ev, 'teoria') ? almacen.entregas(grupo, ev.id, 'teoria') : [];
      const combinadas = alumnos.map((a) => a.combinada).filter((c) => c !== null);

      enviarJson(res, 200, {
        materia: MATERIA,
        evaluacion: configPanel(ev),
        grupos: almacen.grupos(),
        alumnos,
        conteos: { registrados: alumnos.length, activos: alumnos.filter((a) => a.activo).length, teoria: conteo('teoria'), practica: conteo('practica') },
        estadisticas: {
          teoria: banco ? resumirTeoria(entregasTeoria, banco) : null,
          practica: tieneParte(ev, 'practica') ? resumirPractica(almacen.entregas(grupo, ev.id, 'practica')) : null,
          combinada: resumen(combinadas)
        },
        generado: new Date(ahora).toISOString()
      });
    })
  );

  // Abrir o cerrar cada parte, y cambiar retroalimentación y autorrevisión.
  app.put(
    '/api/docente/evaluacion',
    soloDocente(async (req, res) => {
      const cuerpo = await leerJson(req);
      const ev = evaluacionPedida(cuerpo.evaluacion);
      const cambios = {};
      for (const parte of ['teoria', 'practica']) {
        if (cuerpo[parte] === undefined) continue;
        if (typeof cuerpo[parte] !== 'boolean') throw fallo(400, `«${parte}» debe ser true o false`);
        exigirParte(ev, parte);
        cambios[parte] = cuerpo[parte];
      }
      if (cuerpo.retro !== undefined) {
        if (!RETROS.includes(cuerpo.retro)) throw fallo(400, 'La retroalimentación es «completa» o «calificacion»');
        cambios.retro = cuerpo.retro;
      }
      if (cuerpo.autorrevision !== undefined) {
        if (typeof cuerpo.autorrevision !== 'boolean') throw fallo(400, '«autorrevision» debe ser true o false');
        cambios.autorrevision = cuerpo.autorrevision;
      }
      almacen.configurar(ev.id, cambios);
      enviarJson(res, 200, { evaluacion: configPanel(ev) });
    })
  );

  // Todo lo de un alumno: respuestas con su retro, la rúbrica completa, su
  // cuenta para verla en la consola en solo lectura y la bitácora.
  app.get(
    '/api/docente/detalle',
    soloDocente((req, res, { query }) => {
      const ev = evaluacionPedida(query.evaluacion);
      const a = idValido(query.alumno) ? almacen.alumnoFundido(query.alumno) : null;
      if (!a) return enviarJson(res, 404, { error: 'No encontré a ese alumno' });
      const ahora = Date.now();
      const fila = filaAlumno(ev, a, ahora);

      let teoria = null;
      if (tieneParte(ev, 'teoria')) {
        const e = almacen.entregaDe(a, ev.id, 'teoria');
        teoria = { ...fila.teoria, resultado: e ? resultadoTeoria(ev, e, 'completa') : null };
      }

      let practica = null;
      if (tieneParte(ev, 'practica')) {
        const e = almacen.entregaDe(a, ev.id, 'practica');
        const copia = almacen.copiaDe(a, ev.id);
        const inicio = almacen.inicio(a, ev.id, 'practica');
        const identidad = e?.identidad ?? copia?.identidad ?? inicio?.identidad ?? { nombre: a.nombre, matricula: a.matricula };
        const cuenta = e?.estado ?? copia?.estado ?? null;
        let enCurso = null;
        if (!e && copia && hayRubrica(ev.lab)) {
          try {
            enCurso = calificarCuenta(ev.lab, copia.estado, identidad).resultado;
          } catch {
            enCurso = null;
          }
        }
        let datos = null;
        try {
          datos = datosDe(identidad);
        } catch {
          datos = null;
        }
        practica = {
          ...fila.practica,
          resultado: e ? resultadoPractica(ev, e, 'completa') : null,
          enCurso,
          identidad,
          datos,
          cuenta,
          // De dónde salió la cuenta que se muestra: la entregada o la última copia.
          fuente: e?.estado ? 'entrega' : copia ? 'copia' : null,
          guardado: copia?.hora ?? null,
          bitacora: Array.isArray(cuenta?.bitacora) ? cuenta.bitacora : []
        };
      }

      enviarJson(res, 200, { evaluacion: configPanel(ev), alumno: fila, teoria, practica, generado: new Date(ahora).toISOString() });
    })
  );

  app.delete(
    '/api/docente/entregas/:alumnoId',
    soloDocente((req, res, { params, query }) => {
      const ev = evaluacionPedida(query.evaluacion);
      const parte = query.parte;
      if (parte !== 'teoria' && parte !== 'practica') throw fallo(400, 'Indica la parte: teoria o practica');
      exigirParte(ev, parte);
      if (!almacen.borrarEntrega(params.alumnoId, ev.id, parte)) return enviarJson(res, 404, { error: 'Ese alumno no tenía entrega en esa parte' });
      enviarJson(res, 200, { borrada: true });
    })
  );

  app.get(
    '/api/docente/datos.csv',
    soloDocente((req, res, { query }) => {
      const ev = evaluacionPedida(query.evaluacion);
      const grupo = grupoPedido(query);
      const fecha = (iso) => (iso ? new Date(iso).toLocaleString('es-MX', { timeZone: ZONA_HORARIA }) : '');
      const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const conTeoria = tieneParte(ev, 'teoria');

      // Las columnas de tareas salen de las entregas (todas usan la misma rúbrica).
      const tareas = new Map();
      for (const e of almacen.entregas(grupo, ev.id, 'practica')) {
        for (const t of e.tareas ?? []) if (!tareas.has(t.id)) tareas.set(t.id, t);
      }

      const encabezado = [
        'nombre',
        'matricula',
        'grupo',
        'evaluacion',
        ...(conTeoria ? ['teoria_aciertos', 'teoria_total', 'teoria_porcentaje', 'teoria_folio', 'teoria_inicio', 'teoria_entregada'] : []),
        ...[...tareas.values()].map((t) => (t.bono ? `practica_${t.id} (bono opcional, hasta +${t.puntos})` : `practica_${t.id} (de ${t.puntos})`)),
        'practica_puntos',
        'practica_total',
        'practica_folio',
        'practica_inicio',
        'practica_entregada',
        'combinada_porcentaje',
        'calificacion'
      ];

      const filas = almacen
        .alumnos(grupo)
        .sort((a, b) => a.grupo.localeCompare(b.grupo) || a.nombre.localeCompare(b.nombre, 'es'))
        .map((a) => {
          const t = conTeoria ? almacen.entregaDe(a, ev.id, 'teoria') : null;
          const p = almacen.entregaDe(a, ev.id, 'practica');
          const porcentajes = {};
          if (t) porcentajes.teoria = pct(t.aciertos, t.total);
          if (p) porcentajes.practica = pct(p.obtenidos, p.total);
          const comb = combinada(ev, porcentajes);
          const puntosTarea = new Map((p?.tareas ?? []).map((x) => [x.id, x.obtenidos]));
          return [
            a.nombre,
            a.matricula,
            a.grupo,
            ev.titulo,
            ...(conTeoria ? [t?.aciertos ?? '', t?.total ?? '', porcentajes.teoria ?? '', t?.folio ?? '', fecha(t?.inicio), fecha(t?.fin)] : []),
            ...[...tareas.keys()].map((id) => (p ? puntosTarea.get(id) ?? 0 : '')),
            p?.obtenidos ?? '',
            p?.total ?? '',
            p?.folio ?? '',
            fecha(p?.inicio),
            fecha(p?.fin),
            comb ?? '',
            comb === null ? '' : calificacion10(comb)
          ];
        });

      const csv = [encabezado, ...filas].map((fila) => fila.map(celda).join(',')).join('\n');
      const nombre = `evaluacion-${ev.id}-${(grupo || 'todos').replace(/[^\w-]+/g, '-').toLowerCase()}.csv`;
      // El BOM hace que Excel abra los acentos bien.
      enviarDescarga(res, nombre, 'text/csv; charset=utf-8', String.fromCharCode(0xfeff) + csv);
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
