const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = path.join(__dirname, "..", "data.db");
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

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
  const hasCategoryCol = cols.some((c) => c.name === "category_id");
  if (!ownerInfo) return;
  if (ownerInfo.notnull !== 1 && hasCategoryCol) return; // đã ở dạng mới, không cần migrate
  db.exec(`ALTER TABLE ${table} RENAME TO ${table}_old_migrate`);
}
startMigrateOwner("customer_receipts", "customer_id");
startMigrateOwner("supplier_payments", "supplier_id");

const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
db.exec(schema);

// Copy dữ liệu cũ từ bảng *_old_migrate (nếu có) vào bảng mới rồi xoá bảng tạm.
function finishMigrateOwner(table, columnsInOrder) {
  const oldExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
    .get(`${table}_old_migrate`);
  if (!oldExists) return;
  const cols = columnsInOrder.join(",");
  db.exec(
    `INSERT INTO ${table} (${cols}) SELECT ${cols} FROM ${table}_old_migrate`,
  );
  db.exec(`DROP TABLE ${table}_old_migrate`);
}
finishMigrateOwner("customer_receipts", [
  "id",
  "so_ct",
  "customer_id",
  "shipment_id",
  "ngay_ct",
  "so_tien",
  "payment_method_id",
  "ghi_chu",
  "created_at",
]);
finishMigrateOwner("supplier_payments", [
  "id",
  "so_ct",
  "supplier_id",
  "shipment_id",
  "ngay_ct",
  "so_tien",
  "payment_method_id",
  "ghi_chu",
  "created_at",
]);

// ---- Migrations thủ công khác cho DB đã tồn tại (schema.sql chỉ dùng CREATE TABLE IF NOT EXISTS
// nên không tự thêm cột mới vào bảng cũ). Kiểm tra cột trước khi ALTER để chạy lại an toàn. ----
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
ensureColumn("shipment_charges", "la_chi_ho", "la_chi_ho INTEGER DEFAULT 0");
ensureColumn(
  "customer_receipts",
  "category_id",
  "category_id INTEGER REFERENCES voucher_categories(id)",
);
ensureColumn(
  "supplier_payments",
  "category_id",
  "category_id INTEGER REFERENCES voucher_categories(id)",
);

// Đợt "tự sinh phiếu thu/chi từ Lô hàng (v2)": đánh dấu phiếu nào do hệ thống tự tạo
// (khi tick "Đã thu"/"Đã thanh toán" ở màn Lô hàng) để có thể xoá/tạo lại đúng các phiếu đó
// mỗi khi lô hàng được lưu, mà không đụng tới phiếu Senior tự tạo tay ở màn Phiếu thu/chi.
ensureColumn(
  "customer_receipts",
  "auto_generated",
  "auto_generated INTEGER DEFAULT 0",
);
ensureColumn(
  "supplier_payments",
  "auto_generated",
  "auto_generated INTEGER DEFAULT 0",
);

// Đợt "Domain Model doanh thu sau UAT": Customer Charges cần Charge Type để phục vụ báo cáo
// (SERVICE/DISBURSEMENT/ADJUSTMENT/DISCOUNT) và để lọc dòng khi tạo Debit Note theo loại. DB đã
// tồn tại từ trước sẽ chưa có cột này -> ALTER thêm, mặc định 'SERVICE' cho toàn bộ dòng cũ (an
// toàn, không tự suy luận DISBURSEMENT vì source_charge_id không phải khoá đồng bộ ổn định — xem
// ghi chú ở schema.sql — Senior tự chọn lại Charge Type cho các dòng "chi hộ" cũ nếu cần báo cáo
// tách riêng chính xác). SQLite không cho ALTER COLUMN thêm CHECK constraint, ràng buộc giá trị hợp
// lệ được validate ở tầng ứng dụng (routes/shipments.js).
ensureColumn(
  "shipment_customer_charges",
  "charge_type",
  "charge_type TEXT NOT NULL DEFAULT 'SERVICE'",
);

// v3: tách "Đã thu?" / "Quỹ thu cước" thành 2 phần độc lập — Dịch vụ (cột cuoc_* có sẵn, giữ nguyên
// tên/ý nghĩa cũ) và Chi hộ (2 cột MỚI dưới đây) — vì 2 khoản này thực tế thu về 2 tài khoản khác
// nhau (xem ghi chú ở schema.sql). DB cũ chưa có 2 cột chi_ho_* -> ALTER thêm, mặc định NULL/0 (an
// toàn — Senior tự chọn quỹ + tick lại cho từng lô hàng cần thu chi hộ).
ensureColumn(
  "shipments",
  "chi_ho_payment_method_id",
  "chi_ho_payment_method_id INTEGER REFERENCES payment_methods(id)",
);
ensureColumn(
  "shipments",
  "chi_ho_thu_ngay",
  "chi_ho_thu_ngay INTEGER DEFAULT 0",
);

// Chi hộ đôi khi có cả phí nhà xe / phí ra vào cổng (không chỉ thuế, phí HQ, phí CO) —
// tự thêm loại phí này vào danh mục nếu Senior chưa có, để chọn nhanh khi nhập lô hàng.
db.exec(`INSERT OR IGNORE INTO fee_types (name) VALUES ('Phí ra vào cổng')`);

// Đợt "Debit Note": Debit Note bắt buộc phải có Địa chỉ + Mã số thuế khách hàng (theo mẫu),
// nhưng customers trước giờ chỉ có name/default_cuoc_dv/note — bổ sung thêm, không đụng cột cũ.
ensureColumn("customers", "address", "address TEXT");
ensureColumn("customers", "tax_code", "tax_code TEXT");
ensureColumn("customers", "contact_name", "contact_name TEXT");
// Bổ sung SĐT khách hàng vào danh mục Khách hàng + snapshot Debit Note (yêu cầu thêm sau đợt trên).
ensureColumn("customers", "phone", "phone TEXT");
ensureColumn("debit_notes", "customer_phone", "customer_phone TEXT");
// company_settings có sẵn ở schema.sql (INSERT OR IGNORE id=1) nhưng trước giờ CHƯA có UI ở
// "Danh mục" để Senior tự nhập -> mọi Debit Note tạo ra đều bị NULL hết company_name/address/...
// -> khối "thông tin BAYKAO" ở đầu phiếu in không hiện được (không phải lỗi hiển thị, mà do
// không có dữ liệu). Seed sẵn đúng thông tin BAYKAO thật (theo mẫu PDF gốc) làm mặc định — chỉ
// khi CHƯA có ai điền (name IS NULL), không ghi đè nếu Senior đã tự sửa qua tab "Công ty" mới.
db.prepare(
  `UPDATE company_settings SET name = ?, address = ?, tax_code = ?, phone = ?, email = ?
   WHERE id = 1 AND name IS NULL`,
).run(
  "CÔNG TY TNHH BAYKAO",
  "Số 1770, Đường Nguyễn Ái Quốc, Phường Trấn Biên, Tỉnh Đồng Nai, Việt Nam",
  "3603654216",
  "(84) 0984.722.669 ~ 0826 114 716",
  "baykaoltd@gmail.com",
);
// PO thuộc về lô hàng (dùng chung cho mọi Debit Note tạo từ lô hàng đó), tương tự so_to_khai.
ensureColumn("shipments", "po", "po TEXT");
// Tận dụng lại "Quỹ" (payment_methods) làm nguồn gợi ý tài khoản ngân hàng cho Debit Note, thay
// vì tạo thêm 1 bảng tài khoản ngân hàng riêng — đỡ trùng lặp dữ liệu.
ensureColumn("payment_methods", "bank_account_name", "bank_account_name TEXT");
ensureColumn(
  "payment_methods",
  "bank_account_number",
  "bank_account_number TEXT",
);
ensureColumn("payment_methods", "bank_name", "bank_name TEXT");
ensureColumn("payment_methods", "bank_swift", "bank_swift TEXT");

// Danh mục thu/chi khác mặc định (chi in hồ sơ, mua văn phòng phẩm...) — tự thêm cho DB đã có
// sẵn của Senior mỗi lần server khởi động, không cần chạy lại seed.js thủ công.
const defaultVoucherCatsChi = [
  "Chi in hồ sơ",
  "Chi mua văn phòng phẩm",
  "Chi tiếp khách",
  "Chi xăng xe",
  "Chi lương/thưởng",
  "Chi thuê văn phòng",
  "Chi khác",
];
const insCat = db.prepare(
  `INSERT OR IGNORE INTO voucher_categories (name, type) VALUES (?, ?)`,
);
for (const name of defaultVoucherCatsChi) insCat.run(name, "chi");
insCat.run("Thu khác", "thu");

// Đợt "gộp Debit Note 1 loại duy nhất" (không còn tách "Phí dịch vụ"/"Phí chi hộ" thành 2 Debit
// Note riêng): mỗi DÒNG debit_note_lines giờ tự mang charge_type của mình. DB cũ chưa có cột này
// -> ALTER thêm, mặc định 'SERVICE'. Sau đó chạy 1 lần (an toàn, chạy lại nhiều lần không sao) để
// SỬA LẠI đúng dữ liệu cũ: những dòng thuộc về 1 Debit Note mà trước đây có loai='chi_ho' thì chắc
// chắn TOÀN BỘ dòng của nó là Chi hộ (đúng theo model cũ: 1 Debit Note = 1 loại) -> set lại
// charge_type='DISBURSEMENT' cho các dòng đó. Nhờ vậy sau bước này, mọi nơi khác trong code có thể
// tin tưởng hoàn toàn vào debit_note_lines.charge_type (không cần suy luận lại từ debit_notes.loai
// nữa) — xem routes/debit-notes.js.
ensureColumn(
  "debit_note_lines",
  "charge_type",
  "charge_type TEXT NOT NULL DEFAULT 'SERVICE'",
);
db.exec(
  `UPDATE debit_note_lines SET charge_type = 'DISBURSEMENT'
   WHERE charge_type = 'SERVICE'
     AND debit_note_id IN (SELECT id FROM debit_notes WHERE loai = 'chi_ho')`,
);

// Danh mục "Cước dịch vụ thường dùng": thêm VAT mặc định để tự điền VAT % khi Senior chọn 1 dòng
// từ danh mục này ở tab Debit Note (thu khách) — DB cũ chưa có cột, mặc định NULL ("No VAT").
ensureColumn(
  "service_charge_catalog",
  "vat_percent_mac_dinh",
  "vat_percent_mac_dinh REAL",
);

// Đợt "tách Thông tin nhận tiền theo vùng": trước đây debit_notes chỉ có 1 bộ bank_* dùng chung
// cho cả "Cước dịch vụ" và "Chi hộ". Giờ tách riêng 2 bộ (dv_bank_*/chi_ho_bank_*) vì thực tế đôi
// khi 2 khoản này thu về CÙNG 1 tài khoản, đôi khi lại KHÁC — Senior cần tự chọn/sửa riêng từng
// bên. DB cũ chưa có 8 cột mới -> ALTER thêm, rồi BACKFILL 1 lần từ bộ bank_* cũ (giữ đúng hành vi
// trước đây "1 tài khoản dùng chung") vào CẢ HAI bộ mới cho các Debit Note đã tồn tại — Senior có
// thể sửa lại riêng từng bên sau nếu cần tách ra 2 tài khoản khác nhau. Chỉ backfill khi cột mới
// đang NULL (an toàn để chạy lại nhiều lần, không đè lên dữ liệu đã tách riêng).
ensureColumn(
  "debit_notes",
  "dv_bank_account_name",
  "dv_bank_account_name TEXT",
);
ensureColumn(
  "debit_notes",
  "dv_bank_account_number",
  "dv_bank_account_number TEXT",
);
ensureColumn("debit_notes", "dv_bank_name", "dv_bank_name TEXT");
ensureColumn("debit_notes", "dv_bank_swift", "dv_bank_swift TEXT");
ensureColumn(
  "debit_notes",
  "chi_ho_bank_account_name",
  "chi_ho_bank_account_name TEXT",
);
ensureColumn(
  "debit_notes",
  "chi_ho_bank_account_number",
  "chi_ho_bank_account_number TEXT",
);
ensureColumn("debit_notes", "chi_ho_bank_name", "chi_ho_bank_name TEXT");
ensureColumn("debit_notes", "chi_ho_bank_swift", "chi_ho_bank_swift TEXT");
db.exec(`
  UPDATE debit_notes SET
    dv_bank_account_name = COALESCE(dv_bank_account_name, bank_account_name),
    dv_bank_account_number = COALESCE(dv_bank_account_number, bank_account_number),
    dv_bank_name = COALESCE(dv_bank_name, bank_name),
    dv_bank_swift = COALESCE(dv_bank_swift, bank_swift),
    chi_ho_bank_account_name = COALESCE(chi_ho_bank_account_name, bank_account_name),
    chi_ho_bank_account_number = COALESCE(chi_ho_bank_account_number, bank_account_number),
    chi_ho_bank_name = COALESCE(chi_ho_bank_name, bank_name),
    chi_ho_bank_swift = COALESCE(chi_ho_bank_swift, bank_swift)
  WHERE bank_account_name IS NOT NULL OR bank_account_number IS NOT NULL
     OR bank_name IS NOT NULL OR bank_swift IS NOT NULL
`);

// Danh mục "Cước dịch vụ thường dùng" (mục 3a AI_HANDOVER.md) — tự thêm cho DB đã có sẵn của
// Senior mỗi lần server khởi động (INSERT OR IGNORE theo UNIQUE(name), không tạo trùng), giống
// cách seed defaultVoucherCatsChi ở trên.
const defaultServiceCharges = [
  "Phí khai báo HQ",
  "Phí C/O",
  "Phí chứng từ",
  "Phí vận chuyển",
  "Phí handling",
  "Phí AMS",
  "Phí AFR",
  "Phí ENS",
];
const insServiceCharge = db.prepare(
  `INSERT OR IGNORE INTO service_charge_catalog (name) VALUES (?)`,
);
for (const name of defaultServiceCharges) insServiceCharge.run(name);

// Đợt "màn hình Login": tạo sẵn 1 tài khoản admin mặc định (username: admin / password: admin123)
// nếu bảng users đang rỗng, để Senior đăng nhập được ngay lần đầu chạy — nhớ đổi mật khẩu sau khi
// đăng nhập lần đầu. Không dùng INSERT OR IGNORE theo username vì mục đích ở đây là "chỉ tạo khi
// CHƯA có tài khoản nào" (nếu Senior đã tự tạo/xoá user khác thì không tự ý chèn lại admin nữa).
const userCount = db.prepare(`SELECT COUNT(*) AS c FROM users`).get().c;
if (userCount === 0) {
  const bcrypt = require("bcryptjs");
  const defaultHash = bcrypt.hashSync("admin123", 10);
  db.prepare(
    `INSERT INTO users (username, password_hash, full_name) VALUES (?, ?, ?)`,
  ).run("admin", defaultHash, "Quản trị viên");
  console.log(
    '[users] Đã tạo tài khoản mặc định: username="admin", password="admin123" — hãy đổi mật khẩu sau khi đăng nhập.',
  );
}

// Đợt "đổi ảnh đại diện": users trước giờ chưa có cột lưu avatar. Lưu trực tiếp dạng data URL
// (base64) trong DB thay vì lưu file riêng trên đĩa, để đơn giản (không cần thêm thư viện upload
// file / thư mục static mới, không phải lo dọn file rác khi user đổi ảnh nhiều lần). DB cũ chưa có
// cột này -> ALTER thêm, mặc định NULL (chưa có ảnh, FE tự hiện icon mặc định).
ensureColumn("users", "avatar_url", "avatar_url TEXT");

// node:sqlite không có db.transaction() như better-sqlite3, nên tự bọc thủ công.
// Cách dùng: db.transaction(() => { ... các lệnh ghi ... })()
db.transaction = (fn) => {
  return (...args) => {
    db.exec("BEGIN");
    try {
      const result = fn(...args);
      db.exec("COMMIT");
      return result;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  };
};

module.exports = db;
