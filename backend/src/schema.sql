-- ================= DANH MỤC =================
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  default_cuoc_dv REAL DEFAULT 0,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fee_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS payment_methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  opening_balance REAL DEFAULT 0
);

-- ================= LÔ HÀNG (PHIẾU CHÍNH) =================
-- Mỗi lô hàng = 1 "phiếu" giống MISA: chọn khách hàng, nhập cước thu (doanh thu),
-- các khoản chi phí đi kèm được ghi trong bảng shipment_charges.
CREATE TABLE IF NOT EXISTS shipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ma_lo TEXT NOT NULL UNIQUE,          -- số phiếu tự sinh, vd LO000001
  ngay_ct TEXT,                        -- ngày chứng từ
  customer_id INTEGER REFERENCES customers(id),
  invoice TEXT,
  so_to_khai TEXT,
  ngay_to_khai TEXT,
  so_container TEXT,
  so_luong_cont TEXT,
  cuoc_dv REAL DEFAULT 0,              -- cước thu của khách hàng (doanh thu)
  cuoc_payment_method_id INTEGER REFERENCES payment_methods(id), -- quỹ nào nhận cước (nếu thu ngay)
  cuoc_thu_ngay INTEGER DEFAULT 0,     -- 1 nếu ghi nhận thu ngay khi lưu phiếu
  ghi_chu TEXT,
  status TEXT DEFAULT 'hoan_thanh',    -- nhap | hoan_thanh
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Chi phí phát sinh của 1 lô hàng (thường trả cho nhà xe / hải quan...)
CREATE TABLE IF NOT EXISTS shipment_charges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  ngay_ct TEXT,
  loai_phi TEXT,
  supplier_id INTEGER REFERENCES suppliers(id),
  payment_method_id INTEGER REFERENCES payment_methods(id),
  so_tien REAL DEFAULT 0,
  da_thanh_toan INTEGER DEFAULT 0,     -- 1 nếu đã chi tiền ngay (trừ quỹ), 0 nếu ghi nợ NCC
  la_chi_ho INTEGER DEFAULT 0,         -- 1 nếu đây là khoản CHI HỘ khách (thuế, phí HQ, phí CO...): mình trả trước cho NCC,
                                        -- sau đó thu lại từ khách -> cộng vào "phải thu" của khách hàng đó
  ghi_chu TEXT
);

-- ================= DANH MỤC THU/CHI KHÁC (không gắn khách hàng / NCC) =================
-- Dùng cho các khoản thu/chi không thuộc về 1 khách hàng hay 1 NCC cụ thể,
-- ví dụ: chi in hồ sơ, chi mua văn phòng phẩm, chi tiếp khách, thu khác...
CREATE TABLE IF NOT EXISTS voucher_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('thu','chi')),
  UNIQUE(name, type)
);

-- ================= PHIẾU THU KHÁCH HÀNG (hoặc thu khác) =================
-- customer_id NULL khi đây là 1 khoản "thu khác" (category_id) không gắn khách hàng cụ thể.
-- auto_generated=1: phiếu do hệ thống tự tạo khi tick "Đã thu" ở màn Lô hàng (v2) — bị xoá/tạo
-- lại mỗi khi lô hàng liên quan được lưu, xem regenerateAutoVouchers trong routes/shipments.js.
-- auto_generated=0: Senior tự tạo tay tại màn Phiếu thu / chi (hoặc Công nợ KH).
CREATE TABLE IF NOT EXISTS customer_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  so_ct TEXT NOT NULL UNIQUE,
  customer_id INTEGER REFERENCES customers(id),
  category_id INTEGER REFERENCES voucher_categories(id),
  shipment_id INTEGER REFERENCES shipments(id) ON DELETE SET NULL,
  ngay_ct TEXT,
  so_tien REAL DEFAULT 0,
  payment_method_id INTEGER REFERENCES payment_methods(id),
  ghi_chu TEXT,
  auto_generated INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ================= PHIẾU CHI NHÀ CUNG CẤP (hoặc chi khác) =================
-- supplier_id NULL khi đây là 1 khoản "chi khác" (category_id), ví dụ chi in hồ sơ,
-- mua văn phòng phẩm... auto_generated=1: phiếu tự tạo khi tick "Đã thanh toán" cho 1 dòng chi
-- phí ở màn Lô hàng (v2) — bị xoá/tạo lại mỗi khi lô hàng liên quan được lưu. auto_generated=0:
-- Senior tự tạo tay tại màn Phiếu thu / chi (hoặc Công nợ NCC).
CREATE TABLE IF NOT EXISTS supplier_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  so_ct TEXT NOT NULL UNIQUE,
  supplier_id INTEGER REFERENCES suppliers(id),
  category_id INTEGER REFERENCES voucher_categories(id),
  shipment_id INTEGER REFERENCES shipments(id) ON DELETE SET NULL,
  ngay_ct TEXT,
  so_tien REAL DEFAULT 0,
  payment_method_id INTEGER REFERENCES payment_methods(id),
  ghi_chu TEXT,
  auto_generated INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ================= GHI CHÚ CÔNG NỢ THEO THÁNG (kiểu Excel) =================
-- Cho phép Senior gõ chú thích tự do cho từng dòng "tháng phát sinh" trong bảng công nợ
-- KH/NCC (ví dụ "TT tiền hàng + chi hộ ngày 14/01/2026"), và đánh dấu "nợ xấu" để tô đỏ dòng.
CREATE TABLE IF NOT EXISTS cong_no_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doi_tuong_type TEXT NOT NULL CHECK(doi_tuong_type IN ('kh','ncc')),
  doi_tuong_id INTEGER NOT NULL,
  month_key TEXT NOT NULL,             -- 'YYYY-MM' hoặc '__no_date__'
  ghi_chu TEXT,
  la_no_xau INTEGER DEFAULT 0,
  UNIQUE(doi_tuong_type, doi_tuong_id, month_key)
);
