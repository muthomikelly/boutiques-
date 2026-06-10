const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DB_PATH = process.env.DB_PATH || 'data/boutique.db';
const resolvedPath = path.isAbsolute(DB_PATH)
  ? DB_PATH
  : path.resolve(PROJECT_ROOT, DB_PATH);

let _db = null;

function getRawDb() {
  if (!_db) throw new Error('DB not initialised yet');
  return _db;
}

function initDb() {
  return new Promise((resolve, reject) => {
    try {
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      _db = new DatabaseSync(resolvedPath);
      _db.exec('PRAGMA journal_mode = WAL');
      _db.exec('PRAGMA foreign_keys = ON');

      _db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          name          TEXT    NOT NULL,
          email         TEXT    NOT NULL UNIQUE,
          password      TEXT    NOT NULL,
          role          TEXT    NOT NULL DEFAULT 'customer',
          reset_token   TEXT,
          reset_expires INTEGER,
          created_at    INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS products (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          name        TEXT    NOT NULL,
          description TEXT,
          price       REAL    NOT NULL,
          stock       INTEGER NOT NULL DEFAULT 0,
          image_url   TEXT,
          category    TEXT,
          item_type   TEXT,
          sizes       TEXT,
          colors      TEXT,
          created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS orders (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id          INTEGER NOT NULL REFERENCES users(id),
          status           TEXT    NOT NULL DEFAULT 'pending',
          total            REAL    NOT NULL,
          total_kes        REAL    NOT NULL DEFAULT 0,
          mpesa_checkout_id TEXT,
          shipping_address TEXT,
          created_at       INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS order_items (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id   INTEGER NOT NULL REFERENCES orders(id),
          product_id INTEGER NOT NULL REFERENCES products(id),
          quantity   INTEGER NOT NULL,
          unit_price REAL    NOT NULL,
          size       TEXT,
          color      TEXT
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          sender_id   INTEGER NOT NULL,
          sender_name TEXT    NOT NULL,
          sender_role TEXT    NOT NULL DEFAULT 'customer',
          text        TEXT    NOT NULL,
          created_at  INTEGER NOT NULL DEFAULT (unixepoch())
        );
      `);

      console.log('[db] Initialised at', resolvedPath);

      // Migrations for older local DB files.
      const migrations = [
        "ALTER TABLE users ADD COLUMN reset_token TEXT",
        "ALTER TABLE users ADD COLUMN reset_expires INTEGER",
        "ALTER TABLE products ADD COLUMN sizes TEXT",
        "ALTER TABLE products ADD COLUMN colors TEXT",
        "ALTER TABLE products ADD COLUMN item_type TEXT",
        "ALTER TABLE orders   ADD COLUMN total_kes REAL NOT NULL DEFAULT 0",
        "ALTER TABLE orders   ADD COLUMN mpesa_checkout_id TEXT",
        "ALTER TABLE orders   ADD COLUMN shipping_address TEXT",
        "ALTER TABLE order_items ADD COLUMN size TEXT",
        "ALTER TABLE order_items ADD COLUMN color TEXT",
      ];
      for (const sql of migrations) {
        try { _db.exec(sql); } catch { /* column already exists */ }
      }

      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Returns a db proxy with .prepare(), .transaction(), and .exec()
 * that mimics the better-sqlite3 API used throughout the routes.
 */
function getDb() {
  const raw = getRawDb();

  function prepare(sql) {
    const stmt = raw.prepare(sql);
    return {
      get(...params)  { return stmt.get(...params) ?? null; },
      all(...params)  { return stmt.all(...params); },
      run(...params)  { return stmt.run(...params); },
    };
  }

  function transaction(fn) {
    return (...args) => {
      raw.exec('BEGIN');
      try {
        const result = fn(...args);
        raw.exec('COMMIT');
        return result;
      } catch (err) {
        try { raw.exec('ROLLBACK'); } catch {}
        throw err;
      }
    };
  }

  return { prepare, transaction, exec: (sql) => raw.exec(sql) };
}

module.exports = { initDb, getDb };
