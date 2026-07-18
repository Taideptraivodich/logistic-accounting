const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, '..', 'data.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

// ---- Migrations thủ công cho DB đã tồn tại (schema.sql chỉ dùng CREATE TABLE IF NOT EXISTS
// nên không tự thêm cột mới vào bảng cũ). Kiểm tra cột trước khi ALTER để chạy lại an toàn. ----
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
ensureColumn('shipment_charges', 'la_chi_ho', 'la_chi_ho INTEGER DEFAULT 0');

// node:sqlite không có db.transaction() như better-sqlite3, nên tự bọc thủ công.
// Cách dùng: db.transaction(() => { ... các lệnh ghi ... })()
db.transaction = (fn) => {
  return (...args) => {
    db.exec('BEGIN');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };
};

module.exports = db;

