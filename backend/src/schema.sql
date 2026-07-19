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

-- Danh mục "Cước dịch vụ thường dùng" (giống cách tạo/chọn "Mã hàng" trong MISA) — dùng ở vùng
-- "Cước dịch vụ" của tab Debit Note (thu khách), để Senior chọn nhanh thay vì gõ tay Mô tả mỗi
-- lần (xem AI_HANDOVER.md mục 3a). Không có cột charge_type: mọi dòng chọn từ danh mục này khi
-- thêm vào vùng "Cước dịch vụ" đều mặc định charge_type = 'SERVICE' ở tầng ứng dụng.
CREATE TABLE IF NOT EXISTS service_charge_catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  don_vi_tinh TEXT,
  don_gia_mac_dinh REAL,
  created_at TEXT DEFAULT (datetime('now'))
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
  cuoc_dv REAL DEFAULT 0,              -- [DEPRECATED sau UAT] KHÔNG còn dùng để tính doanh thu ở bất
                                        -- kỳ đâu — giữ lại cột chỉ để tương thích dữ liệu cũ (không
                                        -- xoá cột, không đọc/ghi từ Shipment Form nữa). Doanh thu thật
                                        -- giờ tính động từ SUM(shipment_customer_charges), xem
                                        -- utils/revenue.js. Lý do: cước dịch vụ thực tế gồm NHIỀU
                                        -- khoản (phí khai HQ, C/O, chứng từ, vận chuyển, handling,
                                        -- AMS/AFR/ENS...), tất cả đã nhập ở Customer Charges — nhập
                                        -- tay thêm 1 lần nữa ở đây là dữ liệu trùng lặp, dễ lệch nếu
                                        -- sửa Customer Charges mà quên sửa cuoc_dv.
  -- v3 (sau phản hồi: "cước dịch vụ" và "chi hộ" là 2 khoản thu ĐỘC LẬP, thường về 2 tài khoản/
  -- quỹ khác nhau — xem 2 mẫu Debit Note PDF gốc: mỗi mẫu ghi 1 "Người thụ hưởng" riêng). Tách
  -- "Đã thu?" + "Quỹ thu" thành 2 cặp: 1 cho phần Dịch vụ (charge_type != DISBURSEMENT), 1 cho
  -- phần Chi hộ (charge_type = DISBURSEMENT). Số tiền mỗi bên tính động qua
  -- utils/revenue.js#sumCustomerChargesByType — KHÔNG lưu số tiền ở đây.
  cuoc_payment_method_id INTEGER REFERENCES payment_methods(id), -- quỹ nhận CƯỚC DỊCH VỤ (nếu thu ngay)
  cuoc_thu_ngay INTEGER DEFAULT 0,     -- 1 nếu ghi nhận thu CƯỚC DỊCH VỤ ngay khi lưu phiếu
  chi_ho_payment_method_id INTEGER REFERENCES payment_methods(id), -- quỹ nhận CHI HỘ (nếu thu ngay)
  chi_ho_thu_ngay INTEGER DEFAULT 0,   -- 1 nếu ghi nhận thu CHI HỘ ngay khi lưu phiếu
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

-- ================= CUSTOMER CHARGES / "DEBIT NOTE" TAB (khoản sẽ thu khách) =================
-- Đại diện cho toàn bộ khoản SẼ THU KHÁCH của 1 lô hàng — KHÁC với shipment_charges (chi phí
-- THỰC TẾ trả nhà cung cấp). Giá thu khách không nhất thiết bằng chi phí thực tế (ví dụ chi phí
-- nhà xe 10.000 nhưng thu khách 20.000), và có thể có khoản thu trước chưa phát sinh chi phí thật
-- (ví dụ "Dự phòng kiểm hóa"). Quan hệ Cost -> Customer Charges là MỘT CHIỀU và CHỈ COPY 1 LẦN:
-- lúc tạo lô hàng mới (hoặc lần đầu mở tab, với lô hàng cũ tạo trước khi có tính năng này) —
-- sau đó 2 bên hoàn toàn độc lập, sửa Cost về sau KHÔNG đồng bộ lại Customer Charges.
-- source_charge_id chỉ để truy vết dòng này copy từ charge nào lúc khởi tạo, không phải khoá
-- đồng bộ. Thiết kế phẳng, độc lập theo shipment_id (không qua bảng "debit_notes" header) để sau
-- này có thể sinh PDF Debit Note / Invoice / Customer Receivable từ đây mà không cần đổi DB.
CREATE TABLE IF NOT EXISTS shipment_customer_charges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  stt INTEGER NOT NULL DEFAULT 1,
  source_charge_id INTEGER,           -- shipment_charges.id gốc lúc copy lần đầu, chỉ để tham khảo
  mo_ta TEXT NOT NULL,                -- Description
  don_vi_tinh TEXT,                   -- Unit
  so_luong REAL NOT NULL DEFAULT 1,   -- Qty
  don_gia REAL NOT NULL DEFAULT 0,    -- Unit Price — độc lập hoàn toàn với shipment_charges.so_tien
  vat_percent REAL,                   -- NULL = chưa xác định thuế suất; 0/8/10 = % VAT
  -- Charge Type để phục vụ báo cáo (doanh thu, công nợ, lọc Debit Note theo loại):
  --   SERVICE      phí dịch vụ (khai HQ, C/O, chứng từ, vận chuyển, handling, AMS/AFR/ENS...)
  --   DISBURSEMENT phí chi hộ (nâng/hạ cont, lệ phí HQ, lệ phí CO... trả trước rồi thu lại khách)
  --   ADJUSTMENT   điều chỉnh tay (Manual Adjustment)
  --   DISCOUNT     chiết khấu
  charge_type TEXT NOT NULL DEFAULT 'SERVICE'
    CHECK(charge_type IN ('SERVICE','DISBURSEMENT','ADJUSTMENT','DISCOUNT')),
  ghi_chu TEXT                        -- Remark
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

-- ================= THÔNG TIN CÔNG TY (dùng làm phần "Header" khi in Debit Note) =================
-- Bảng 1 dòng duy nhất (id cố định = 1), sửa tại Danh mục > Công ty. Được snapshot vào từng
-- Debit Note lúc tạo (giống snapshot khách hàng/lô hàng) để nếu sau này đổi thông tin công ty,
-- các Debit Note cũ đã phát hành không bị thay đổi theo.
CREATE TABLE IF NOT EXISTS company_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT,
  address TEXT,
  tax_code TEXT,
  phone TEXT,
  email TEXT
);
INSERT OR IGNORE INTO company_settings (id, name) VALUES (1, NULL);

-- ================= DEBIT NOTE (chứng từ xác nhận công nợ gửi khách — KHÔNG phải hoá đơn VAT) =================
-- 1 Shipment có thể có NHIỀU Debit Note (ví dụ: 1 bản "Phí dịch vụ", 1 bản "Phí chi hộ" — xem
-- 2 mẫu PDF gốc, mỗi loại thu về 1 tài khoản ngân hàng khác nhau). Toàn bộ thông tin khách hàng/
-- lô hàng/công ty/ngân hàng được SNAPSHOT (copy) vào chính bảng này tại thời điểm tạo — sau đó
-- KHÔNG bao giờ đọc lại từ customers/shipments/company_settings để hiển thị hay tính tiền, đúng
-- Business Rule 2/3 (Debit Note giữ nguyên dữ liệu dù Shipment/Customer đổi sau này).
-- status: 'draft' (Senior còn sửa tự do) -> 'confirmed' (khoá sửa/xoá, chỉ còn xem + in).
CREATE TABLE IF NOT EXISTS debit_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  so_dn TEXT NOT NULL UNIQUE,                 -- số Debit Note tự sinh, vd DN000001
  loai TEXT NOT NULL DEFAULT 'dich_vu' CHECK(loai IN ('dich_vu','chi_ho')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','confirmed')),
  ngay_ct TEXT,
  shipment_id INTEGER REFERENCES shipments(id) ON DELETE SET NULL, -- để lọc/tra cứu, KHÔNG dùng để hiển thị dữ liệu

  -- Snapshot công ty phát hành (Header)
  company_name TEXT,
  company_address TEXT,
  company_tax_code TEXT,
  company_phone TEXT,
  company_email TEXT,

  -- Snapshot khách hàng (Customer Information)
  customer_id INTEGER REFERENCES customers(id),
  customer_name TEXT,
  customer_address TEXT,
  customer_tax_code TEXT,
  customer_contact_name TEXT,

  -- Snapshot lô hàng (Shipment Information)
  ma_lo TEXT,
  invoice TEXT,
  so_to_khai TEXT,
  ngay_to_khai TEXT,
  so_container TEXT,
  po TEXT,

  -- Bank Information (tự do, không ràng buộc khoá ngoại — mỗi Debit Note có thể thu về 1 TK khác nhau)
  bank_account_name TEXT,
  bank_account_number TEXT,
  bank_name TEXT,
  bank_swift TEXT,

  -- Signature
  nguoi_ky TEXT,
  chuc_danh_nguoi_ky TEXT,

  ghi_chu TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Charge Details của Debit Note. Giá bán (don_gia) HOÀN TOÀN độc lập với shipment_charges.so_tien
-- (Business Rule: giá thu khách không nhất thiết bằng chi phí thực tế) — source_charge_id chỉ để
-- truy vết dòng này được tạo gợi ý từ charge nào, KHÔNG có ràng buộc/đồng bộ ngược lại.
CREATE TABLE IF NOT EXISTS debit_note_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debit_note_id INTEGER NOT NULL REFERENCES debit_notes(id) ON DELETE CASCADE,
  stt INTEGER NOT NULL DEFAULT 1,
  source_charge_id INTEGER,           -- shipment_charges.id gốc (nếu có) — chỉ để tham khảo/truy vết
  mo_ta TEXT NOT NULL,                -- Description
  don_vi_tinh TEXT,                   -- Unit (Tờ khai, Cont 40H, Bộ...)
  so_luong REAL NOT NULL DEFAULT 1,   -- Qty
  don_gia REAL NOT NULL DEFAULT 0,    -- Unit Price (Senior tự nhập/sửa, không lấy từ Cost)
  vat_percent REAL,                   -- NULL = "No VAT" (ngoài phạm vi thuế); 0/8/10 = % chịu thuế
  so_hoa_don TEXT,                    -- Số hoá đơn (NCC xuất, cho dòng "chi hộ")
  ghi_chu TEXT                        -- Remark
);
