/**
 * Database helper - wraps sql.js with a better-sqlite3-like API
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

// Ensure data directory exists
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

let db = null;

/**
 * Initialize and return the database instance
 */
export async function getDb() {
  if (db) return db;
  
  const SQL = await initSqlJs();
  
  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  
  return db;
}

/**
 * Save database to disk
 */
export function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  writeFileSync(DB_PATH, buffer);
}

/**
 * Helper: Run a query and return all results as objects
 */
export function all(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/**
 * Helper: Run a query and return first result as object
 */
export function get(sql, params = []) {
  const results = all(sql, params);
  return results[0] || null;
}

/**
 * Helper: Execute a statement (INSERT, UPDATE, DELETE)
 */
export function run(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  db.run(sql, params);
  return { changes: db.getRowsModified() };
}

/**
 * Helper: Execute raw SQL (for schema creation)
 */
export function exec(sql) {
  if (!db) throw new Error('Database not initialized');
  db.exec(sql);
}

/**
 * Get the DB_PATH for reference
 */
export function getDbPath() {
  return DB_PATH;
}

export default { getDb, saveDb, all, get, run, exec, getDbPath };
