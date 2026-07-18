const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, '..', 'data.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// ---- Migration bảng cũ (đợt trước customer_id/supplier_id là NOT NULL, giờ cần cho phép NULL
// để hỗ trợ "phiếu thu/chi khác" không gắn khách hàng/NCC). SQLite không hỗ trợ ALTER COLUMN
// để bỏ NOT NULL, nên phải: đổi tên bảng cũ -> để schema.sql tạo bảng mới -> copy dữ liệu cũ qua
// -> xoá bảng cũ. An toàn để chạy lại nhiều lần (idempotent). ----
function startMigrateOwner(table, ownerCol) {
  const tableExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
    .get(table);
  if (!tableExists) return;
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  const ownerInfo = cols.find((c) => c.name === ownerCol);
  const hasCategoryCol = cols.some((c) => c.name === 'category_id');
  if (!ownerInfo) return;
  if (ownerInfo.notnull !== 1 && hasCategoryCol) return; // đã ở dạng mới, không cần migrate
  db.exec(`ALTER TABLE ${table} RENAME TO ${table}_old_migrate`);
}
startMigrateOwner('customer_receipts', 'customer_id');
startMigrateOwner('supplier_payments', 'supplier_id');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

// Copy dữ liệu cũ từ bảng *_old_migrate (nếu có) vào bảng mới rồi xoá bảng tạm.
function finishMigrateOwner(table, columnsInOrder) {
  const oldExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
    .get(`${table}_old_migrate`);
  if (!oldExists) return;
  const cols = columnsInOrder.join(',');
  db.exec(`INSERT INTO ${table} (${cols}) SELECT ${cols} FROM ${table}_old_migrate`);
  db.exec(`DROP TABLE ${table}_old_migrate`);
}
finishMigrateOwner('customer_receipts', [
  'id', 'so_ct', 'customer_id', 'shipment_id', 'ngay_ct', 'so_tien', 'payment_method_id', 'ghi_chu', 'created_at',
]);
finishMigrateOwner('supplier_payments', [
  'id', 'so_ct', 'supplier_id', 'shipment_id', 'ngay_ct', 'so_tien', 'payment_method_id', 'ghi_chu', 'created_at',
]);

// ---- Migrations thủ công khác cho DB đã tồn tại (schema.sql chỉ dùng CREATE TABLE IF NOT EXISTS
// nên không tự thêm cột mới vào bảng cũ). Kiểm tra cột trước khi ALTER để chạy lại an toàn. ----
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
ensureColumn('shipment_charges', 'la_chi_ho', 'la_chi_ho INTEGER DEFAULT 0');
ensureColumn('customer_receipts', 'category_id', 'category_id INTEGER REFERENCES voucher_categories(id)');
ensureColumn('supplier_payments', 'category_id', 'category_id INTEGER REFERENCES voucher_categories(id)');

// Đợt "tự sinh phiếu thu/chi từ Lô hàng (v2)": đánh dấu phiếu nào do hệ thống tự tạo
// (khi tick "Đã thu"/"Đã thanh toán" ở màn Lô hàng) để có thể xoá/tạo lại đúng các phiếu đó
// mỗi khi lô hàng được lưu, mà không đụng tới phiếu Senior tự tạo tay ở màn Phiếu thu/chi.
ensureColumn('customer_receipts', 'auto_generated', 'auto_generated INTEGER DEFAULT 0');
ensureColumn('supplier_payments', 'auto_generated', 'auto_generated INTEGER DEFAULT 0');

// Chi hộ đôi khi có cả phí nhà xe / phí ra vào cổng (không chỉ thuế, phí HQ, phí CO) —
// tự thêm loại phí này vào danh mục nếu Senior chưa có, để chọn nhanh khi nhập lô hàng.
db.exec(`INSERT OR IGNORE INTO fee_types (name) VALUES ('Phí ra vào cổng')`);

// Danh mục thu/chi khác mặc định (chi in hồ sơ, mua văn phòng phẩm...) — tự thêm cho DB đã có
// sẵn của Senior mỗi lần server khởi động, không cần chạy lại seed.js thủ công.
const defaultVoucherCatsChi = [
  'Chi in hồ sơ', 'Chi mua văn phòng phẩm', 'Chi tiếp khách', 'Chi xăng xe',
  'Chi lương/thưởng', 'Chi thuê văn phòng', 'Chi khác',
];
const insCat = db.prepare(`INSERT OR IGNORE INTO voucher_categories (name, type) VALUES (?, ?)`);
for (const name of defaultVoucherCatsChi) insCat.run(name, 'chi');
insCat.run('Thu khác', 'thu');

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

