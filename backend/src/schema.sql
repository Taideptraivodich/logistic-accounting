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

-- ================= PHIẾU THU KHÁCH HÀNG =================
CREATE TABLE IF NOT EXISTS customer_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  so_ct TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  shipment_id INTEGER REFERENCES shipments(id) ON DELETE SET NULL,
  ngay_ct TEXT,
  so_tien REAL DEFAULT 0,
  payment_method_id INTEGER REFERENCES payment_methods(id),
  ghi_chu TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ================= PHIẾU CHI NHÀ CUNG CẤP =================
CREATE TABLE IF NOT EXISTS supplier_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  so_ct TEXT NOT NULL UNIQUE,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  shipment_id INTEGER REFERENCES shipments(id) ON DELETE SET NULL,
  ngay_ct TEXT,
  so_tien REAL DEFAULT 0,
  payment_method_id INTEGER REFERENCES payment_methods(id),
  ghi_chu TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
