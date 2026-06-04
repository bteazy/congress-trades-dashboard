/**
 * Database helper - wraps sql.js with a synchronous API
 * sql.js is pure JavaScript SQLite (no native compilation needed)
 */

import initSqlJs from 'sql.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_PATH = join(__dirname, '..', 'data', 'trades.db');
const DATA_DIR = join(__dirname, '..', 'data');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

let db = null;

export async function getDb() {
  if (db) return db;
  const SQL = await initSqlJs();
  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  // Enable WAL mode for better concurrent read performance
  db.run('PRAGMA journal_mode=WAL');
  return db;
}

export function saveDb() {
  if (!db) return;
  const data = db.export();
  writeFileSync(DB_PATH, Buffer.from(data));
}

export function all(sql, params = []) {
  if (!db) throw new Error('Database not initialized. Call getDb() first.');
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

export function get(sql, params = []) {
  const results = all(sql, params);
  return results[0] || null;
}

export function run(sql, params = []) {
  if (!db) throw new Error('Database not initialized. Call getDb() first.');
  db.run(sql, params);
  return { changes: db.getRowsModified() };
}

export function exec(sql) {
  if (!db) throw new Error('Database not initialized. Call getDb() first.');
  db.exec(sql);
}

export function getDbPath() {
  return DB_PATH;
}

export default { getDb, saveDb, all, get, run, exec, getDbPath };
