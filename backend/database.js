const Database = require('better-sqlite3');
const path = require('path');

const database = new Database(process.env.DB_PATH || path.join(__dirname, 'partspal.db'));

database.pragma('foreign_keys = ON');

database.exec(`
  CREATE TABLE IF NOT EXISTS parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    total_quantity INTEGER NOT NULL DEFAULT 0,
    available_quantity INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS kits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS kit_parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kit_id INTEGER NOT NULL,
    part_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    FOREIGN KEY (kit_id) REFERENCES kits(id),
    FOREIGN KEY (part_id) REFERENCES parts(id)
  );

  CREATE TABLE IF NOT EXISTS issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    part_id INTEGER,
    kit_id INTEGER,
    member_name TEXT NOT NULL,
    registration_number TEXT NOT NULL,
    due_date TEXT NOT NULL,
    issued_at TEXT NOT NULL,
    returned_at TEXT,
    status TEXT NOT NULL DEFAULT 'issued',
    quantity INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (part_id) REFERENCES parts(id),
    FOREIGN KEY (kit_id) REFERENCES kits(id)
  );
`);

module.exports = database;
