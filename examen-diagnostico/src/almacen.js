// Capa de almacenamiento con dos implementaciones intercambiables.
//
//  - Sin DATABASE_URL  -> SQLite en disco local (rápido, cero configuración).
//  - Con DATABASE_URL  -> Postgres (necesario si quieres que los intentos
//    sobrevivan a los reinicios del plan gratuito de Render).
//
// Ambas exponen las mismas funciones async, así que el resto del servidor
// no sabe cuál está corriendo.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// better-sqlite3 es CommonJS; en ESM se carga con createRequire.
const require = createRequire(import.meta.url);

const USA_POSTGRES = Boolean(process.env.DATABASE_URL);

// La carpeta del examen, no la de quien lo arrancó: montado dentro de la
// plataforma del curso, process.cwd() es ../plataforma y la base de datos
// terminaría en otro lado. Los intentos deben vivir siempre aquí.
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function crearSqlite() {
  const Database = require('better-sqlite3');
  const dir = process.env.DATA_DIR || path.join(RAIZ, 'data');
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, 'examen.db'));
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS intentos (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      matricula TEXT,
      grupo TEXT NOT NULL,
      inicio TEXT NOT NULL,
      fin TEXT,
      aciertos INTEGER,
      total INTEGER,
      respuestas TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_intentos_grupo ON intentos(grupo);
  `);

  return {
    motor: 'sqlite',
    async crearIntento(i) {
      db.prepare(
        `INSERT INTO intentos (id, nombre, matricula, grupo, inicio, respuestas)
         VALUES (?, ?, ?, ?, ?, '{}')`
      ).run(i.id, i.nombre, i.matricula, i.grupo, i.inicio);
    },
    async obtenerIntento(id) {
      return db.prepare('SELECT * FROM intentos WHERE id = ?').get(id) || null;
    },
    async guardarParcial(id, respuestasJson) {
      db.prepare('UPDATE intentos SET respuestas = ? WHERE id = ? AND fin IS NULL').run(
        respuestasJson,
        id
      );
    },
    async finalizar(id, { fin, aciertos, total, respuestasJson }) {
      db.prepare(
        'UPDATE intentos SET fin = ?, aciertos = ?, total = ?, respuestas = ? WHERE id = ?'
      ).run(fin, aciertos, total, respuestasJson, id);
    },
    async listarIntentos(grupo) {
      const sql = grupo
        ? 'SELECT * FROM intentos WHERE grupo = ? ORDER BY inicio ASC'
        : 'SELECT * FROM intentos ORDER BY inicio ASC';
      return grupo ? db.prepare(sql).all(grupo) : db.prepare(sql).all();
    },
    async listarGrupos() {
      return db
        .prepare('SELECT DISTINCT grupo FROM intentos ORDER BY grupo ASC')
        .all()
        .map((r) => r.grupo);
    },
    async borrarIntentos(grupo) {
      const r = grupo
        ? db.prepare('DELETE FROM intentos WHERE grupo = ?').run(grupo)
        : db.prepare('DELETE FROM intentos').run();
      return r.changes;
    }
  };
}

async function crearPostgres() {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'off' ? false : { rejectUnauthorized: false },
    max: 5
  });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS intentos (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      matricula TEXT,
      grupo TEXT NOT NULL,
      inicio TEXT NOT NULL,
      fin TEXT,
      aciertos INTEGER,
      total INTEGER,
      respuestas TEXT NOT NULL DEFAULT '{}'
    )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_intentos_grupo ON intentos(grupo)');

  return {
    motor: 'postgres',
    async crearIntento(i) {
      await pool.query(
        `INSERT INTO intentos (id, nombre, matricula, grupo, inicio, respuestas)
         VALUES ($1, $2, $3, $4, $5, '{}')`,
        [i.id, i.nombre, i.matricula, i.grupo, i.inicio]
      );
    },
    async obtenerIntento(id) {
      const r = await pool.query('SELECT * FROM intentos WHERE id = $1', [id]);
      return r.rows[0] || null;
    },
    async guardarParcial(id, respuestasJson) {
      await pool.query(
        'UPDATE intentos SET respuestas = $1 WHERE id = $2 AND fin IS NULL',
        [respuestasJson, id]
      );
    },
    async finalizar(id, { fin, aciertos, total, respuestasJson }) {
      await pool.query(
        'UPDATE intentos SET fin = $1, aciertos = $2, total = $3, respuestas = $4 WHERE id = $5',
        [fin, aciertos, total, respuestasJson, id]
      );
    },
    async listarIntentos(grupo) {
      const r = grupo
        ? await pool.query('SELECT * FROM intentos WHERE grupo = $1 ORDER BY inicio ASC', [grupo])
        : await pool.query('SELECT * FROM intentos ORDER BY inicio ASC');
      return r.rows;
    },
    async listarGrupos() {
      const r = await pool.query('SELECT DISTINCT grupo FROM intentos ORDER BY grupo ASC');
      return r.rows.map((x) => x.grupo);
    },
    async borrarIntentos(grupo) {
      const r = grupo
        ? await pool.query('DELETE FROM intentos WHERE grupo = $1', [grupo])
        : await pool.query('DELETE FROM intentos');
      return r.rowCount;
    }
  };
}

export const almacen = USA_POSTGRES ? await crearPostgres() : crearSqlite();
