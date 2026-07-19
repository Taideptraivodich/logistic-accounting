const express = require('express');
const db = require('../db');
const { nextCode } = require('../utils/nextCode');
const router = express.Router();

// [LEGACY] Loại Debit Note -> Charge Type tương ứng — trước đây mỗi Debit Note chỉ thuộc đúng 1
// loại (dich_vu HOẶC chi_ho), dùng để lọc dòng gợi ý theo đúng loại. Giờ 1 Debit Note có thể chứa
// CẢ 2 vùng (mỗi DÒNG debit_note_lines tự mang charge_type riêng — xem schema.sql), nên mặc định
// KHÔNG còn lọc theo "loai" nữa khi lấy gợi ý (trả về toàn bộ, Frontend tự tách 2 vùng để hiển thị,
// giống hệt cách tab "Debit Note (thu khách)" ở ShipmentForm.jsx đã làm). Giữ lại map này + query
// "loai" (không bắt buộc) chỉ để tương thích ngược nếu nơi nào đó vẫn còn gọi kiểu cũ.
const LOAI_TO_CHARGE_TYPE = { dich_vu: 'SERVICE', chi_ho: 'DISBURSEMENT' };

function normalizeLineChargeType(t) {
  return t === 'DISBURSEMENT' ? 'DISBURSEMENT' : 'SERVICE';
}

// ================= GỢI Ý DÒNG TỪ CUSTOMER CHARGES =================
// Trả về các dòng shipment_customer_charges của 1 lô hàng — dùng để tự điền khi tạo/đồng bộ Debit
// Note. KHÔNG ghi gì vào DB (chỉ đọc). Tham số "loai" không còn bắt buộc (xem ghi chú ở trên); nếu
// Frontend vẫn truyền (tương thích ngược), sẽ lọc đúng như cũ.
router.get('/suggest-lines', (req, res) => {
  const { shipment_id, loai } = req.query;
  if (!shipment_id) return res.status(400).json({ error: 'Thiếu shipment_id' });
  const chargeType = LOAI_TO_CHARGE_TYPE[loai];
  let rows;
  if (chargeType) {
    rows = db
      .prepare(
        `SELECT * FROM shipment_customer_charges WHERE shipment_id = ? AND charge_type = ? ORDER BY stt, id`
      )
      .all(shipment_id, chargeType);
  } else {
    rows = db
      .prepare(`SELECT * FROM shipment_customer_charges WHERE shipment_id = ? ORDER BY stt, id`)
      .all(shipment_id);
  }
  res.json({ lines: rows });
});

// Tính tiền cho 1 dòng: thành_tiền = đơn giá * số lượng, thuế = thành_tiền * vat% (NULL = "No VAT"
// -> không tính thuế), tổng = thành_tiền + thuế. Tính động lúc đọc (không lưu sẵn trong DB) vì
// don_gia/so_luong/vat_percent đã tự nó LÀ snapshot bất biến sau khi debit_note.status='confirmed'
// (route PUT chặn sửa khi đã confirmed) — không cần lưu thêm cột tổng để tránh lệch dữ liệu.
function withLineTotals(line) {
  const thanh_tien = (line.don_gia || 0) * (line.so_luong || 0);
  const vat_amount = line.vat_percent != null ? (thanh_tien * line.vat_percent) / 100 : 0;
  return { ...line, thanh_tien, vat_amount, tong_cong: thanh_tien + vat_amount };
}

function getDebitNoteFull(id) {
  const dn = db.prepare(`SELECT * FROM debit_notes WHERE id = ?`).get(id);
  if (!dn) return null;
  const lines = db
    .prepare(`SELECT * FROM debit_note_lines WHERE debit_note_id = ? ORDER BY stt, id`)
    .all(id)
    .map(withLineTotals);
  const tong = lines.reduce(
    (acc, l) => ({
      thanh_tien: acc.thanh_tien + l.thanh_tien,
      vat_amount: acc.vat_amount + l.vat_amount,
      tong_cong: acc.tong_cong + l.tong_cong,
    }),
    { thanh_tien: 0, vat_amount: 0, tong_cong: 0 }
  );
  return { ...dn, lines, tong };
}

// ================= "1 SHIPMENT = 1 DEBIT NOTE" (tìm bản nháp hiện có, gộp bản nháp cũ nếu có) =====
// Trước đây 1 lô hàng có thể sinh ra 2 Debit Note nháp riêng biệt (1 "Phí dịch vụ" + 1 "Phí chi
// hộ", xem model cũ). Giờ chỉ dùng ĐÚNG 1 Debit Note / lô hàng (chứa cả 2 vùng dòng). Route này:
// - Nếu tìm thấy nhiều hơn 1 bản NHÁP cho cùng shipment_id (dữ liệu cũ từ trước đợt gộp) -> tự động
//   GỘP: dồn hết dòng chi phí về bản nháp có id nhỏ nhất (tạo trước), xoá các bản nháp còn lại. Chỉ
//   chạy 1 lần cho mỗi lô hàng (sau khi gộp chỉ còn 1 bản nháp, lần gọi sau sẽ không cần gộp nữa).
// - Các bản đã "Xác nhận" (status=confirmed) KHÔNG được gộp (đã khoá, không đụng vào) — trả về riêng
//   để Frontend hiển thị cảnh báo (Senior cần "Huỷ xác nhận" thủ công nếu muốn gộp/sửa).
// ĐẶT TRƯỚC route GET /:id để không bị nuốt route (path cố định, không phải :id).
router.get('/by-shipment/:shipmentId', (req, res) => {
  const shipmentId = req.params.shipmentId;
  let drafts = db
    .prepare(`SELECT * FROM debit_notes WHERE shipment_id = ? AND status = 'draft' ORDER BY id`)
    .all(shipmentId);

  if (drafts.length > 1) {
    const primaryId = drafts[0].id;
    const maxSttRow = db
      .prepare(`SELECT COALESCE(MAX(stt), 0) as m FROM debit_note_lines WHERE debit_note_id = ?`)
      .get(primaryId);
    const moveLine = db.prepare(`UPDATE debit_note_lines SET debit_note_id = ?, stt = ? WHERE id = ?`);
    const run = db.transaction(() => {
      let stt = maxSttRow.m;
      for (let i = 1; i < drafts.length; i++) {
        const extraLines = db
          .prepare(`SELECT id FROM debit_note_lines WHERE debit_note_id = ? ORDER BY stt, id`)
          .all(drafts[i].id);
        for (const l of extraLines) {
          stt += 1;
          moveLine.run(primaryId, stt, l.id);
        }
        db.prepare(`DELETE FROM debit_notes WHERE id = ?`).run(drafts[i].id);
      }
    });
    run();
    drafts = [db.prepare(`SELECT * FROM debit_notes WHERE id = ?`).get(primaryId)];
  }

  const confirmed = db
    .prepare(`SELECT id, so_dn, loai FROM debit_notes WHERE shipment_id = ? AND status = 'confirmed' ORDER BY id`)
    .all(shipmentId);

  res.json({
    draft: drafts[0] ? getDebitNoteFull(drafts[0].id) : null,
    confirmed,
  });
});

// ================= DANH SÁCH =================
router.get('/', (req, res) => {
  const { shipment_id, customer_id, status, q, loai } = req.query;
  let sql = `
    SELECT dn.*,
      (SELECT COALESCE(SUM(l.don_gia * l.so_luong * (1 + COALESCE(l.vat_percent,0)/100.0)), 0)
       FROM debit_note_lines l WHERE l.debit_note_id = dn.id) as tong_cong,
      (SELECT GROUP_CONCAT(DISTINCT l.charge_type) FROM debit_note_lines l WHERE l.debit_note_id = dn.id) as charge_types
    FROM debit_notes dn WHERE 1=1`;
  const params = [];
  if (shipment_id) {
    sql += ' AND dn.shipment_id = ?';
    params.push(shipment_id);
  }
  // Lọc theo "loai" (dich_vu/chi_ho) — dùng để tìm Debit Note nháp đã có sẵn của 1 lô hàng cho
  // đúng loại, phục vụ UI 2 tab "Phí dịch vụ"/"Phí chi hộ" ở DebitNoteForm.jsx (mỗi tab tự tìm và
  // load lại đúng bản nháp của mình theo shipment_id + loai, không cần Senior tự nhớ chọn).
  if (loai) {
    sql += ' AND dn.loai = ?';
    params.push(loai);
  }
  if (customer_id) {
    sql += ' AND dn.customer_id = ?';
    params.push(customer_id);
  }
  if (status) {
    sql += ' AND dn.status = ?';
    params.push(status);
  }
  if (q) {
    sql += ' AND (dn.so_dn LIKE ? OR dn.customer_name LIKE ? OR dn.ma_lo LIKE ? OR dn.so_to_khai LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  sql += ' ORDER BY dn.id DESC';
  res.json(db.prepare(sql).all(...params));
});

// ================= CHI TIẾT =================
router.get('/:id', (req, res) => {
  const dn = getDebitNoteFull(req.params.id);
  if (!dn) return res.status(404).json({ error: 'Không tìm thấy Debit Note' });
  res.json(dn);
});

// ================= TẠO MỚI (snapshot toàn bộ tại đây) =================
// Body: { ngay_ct, shipment_id?, customer_id, bank_account_name/number/bank_name/bank_swift,
//         nguoi_ky, chuc_danh_nguoi_ky, ghi_chu, lines: [{ mo_ta, don_vi_tinh, so_luong, don_gia,
//         vat_percent, so_hoa_don, ghi_chu, source_charge_id?, charge_type }] }
// customer_id bắt buộc để snapshot thông tin KH; shipment_id không bắt buộc (Debit Note có thể
// không gắn lô hàng cụ thể) nhưng nếu có sẽ snapshot thêm thông tin lô hàng. "loai" KHÔNG còn nhận
// từ Frontend nữa (xem [DEPRECATED] ở schema.sql) — mỗi dòng tự mang charge_type riêng, tự tính ở
// dưới chỉ để giữ cột NOT NULL hợp lệ, không ảnh hưởng gì tới nội dung Debit Note.
router.post('/', (req, res) => {
  const {
    ngay_ct, shipment_id, customer_id,
    bank_account_name, bank_account_number, bank_name, bank_swift,
    nguoi_ky, chuc_danh_nguoi_ky, ghi_chu, lines,
  } = req.body;

  if (!customer_id) return res.status(400).json({ error: 'Vui lòng chọn khách hàng' });
  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: 'Debit Note cần ít nhất 1 dòng chi phí' });
  }

  const customer = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(customer_id);
  if (!customer) return res.status(400).json({ error: 'Khách hàng không tồn tại' });
  const shipment = shipment_id ? db.prepare(`SELECT * FROM shipments WHERE id = ?`).get(shipment_id) : null;
  const company = db.prepare(`SELECT * FROM company_settings WHERE id = 1`).get() || {};

  const so_dn = nextCode('DN', 'debit_notes', 'so_dn');
  // [DEPRECATED] chỉ để hợp lệ CHECK constraint cũ — xem ghi chú ở schema.sql.
  const loai = lines.some((l) => normalizeLineChargeType(l.charge_type) !== 'DISBURSEMENT') ? 'dich_vu' : 'chi_ho';

  const insertDn = db.prepare(
    `INSERT INTO debit_notes (
      so_dn, loai, status, ngay_ct, shipment_id,
      company_name, company_address, company_tax_code, company_phone, company_email,
      customer_id, customer_name, customer_address, customer_tax_code, customer_contact_name,
      ma_lo, invoice, so_to_khai, ngay_to_khai, so_container, po,
      bank_account_name, bank_account_number, bank_name, bank_swift,
      nguoi_ky, chuc_danh_nguoi_ky, ghi_chu
    ) VALUES (?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?,?, ?,?,?,?, ?,?,?)`
  );
  const insertLine = db.prepare(
    `INSERT INTO debit_note_lines (
      debit_note_id, stt, source_charge_id, mo_ta, don_vi_tinh, so_luong, don_gia, vat_percent, so_hoa_don, charge_type, ghi_chu
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  );

  const run = db.transaction(() => {
    const info = insertDn.run(
      so_dn, loai, 'draft', ngay_ct || null, shipment_id || null,
      company.name || null, company.address || null, company.tax_code || null, company.phone || null, company.email || null,
      customer_id, customer.name, customer.address || null, customer.tax_code || null, customer.contact_name || null,
      shipment?.ma_lo || null, shipment?.invoice || null, shipment?.so_to_khai || null,
      shipment?.ngay_to_khai || null, shipment?.so_container || null, shipment?.po || null,
      bank_account_name || null, bank_account_number || null, bank_name || null, bank_swift || null,
      nguoi_ky || null, chuc_danh_nguoi_ky || null, ghi_chu || null
    );
    const dnId = info.lastInsertRowid;
    lines.forEach((l, idx) => {
      insertLine.run(
        dnId, idx + 1, l.source_charge_id || null, l.mo_ta || '', l.don_vi_tinh || null,
        l.so_luong ?? 1, l.don_gia ?? 0, l.vat_percent === '' || l.vat_percent === undefined ? null : l.vat_percent,
        l.so_hoa_don || null, normalizeLineChargeType(l.charge_type), l.ghi_chu || null
      );
    });
    return dnId;
  });

  const dnId = run();
  res.json(getDebitNoteFull(dnId));
});

// ================= SỬA (chỉ khi còn ở trạng thái draft) =================
router.put('/:id', (req, res) => {
  const existing = db.prepare(`SELECT * FROM debit_notes WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy Debit Note' });
  if (existing.status !== 'draft') {
    return res.status(400).json({ error: 'Debit Note đã Xác nhận, không thể sửa. Cần huỷ xác nhận trước.' });
  }
  const {
    ngay_ct, bank_account_name, bank_account_number, bank_name, bank_swift,
    nguoi_ky, chuc_danh_nguoi_ky, ghi_chu, lines,
  } = req.body;
  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: 'Debit Note cần ít nhất 1 dòng chi phí' });
  }

  const insertLine = db.prepare(
    `INSERT INTO debit_note_lines (
      debit_note_id, stt, source_charge_id, mo_ta, don_vi_tinh, so_luong, don_gia, vat_percent, so_hoa_don, charge_type, ghi_chu
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  );
  // [DEPRECATED] cập nhật lại cho gần đúng thực tế (không ảnh hưởng gì tới nội dung Debit Note) —
  // xem ghi chú ở schema.sql / route POST phía trên.
  const loai = lines.some((l) => normalizeLineChargeType(l.charge_type) !== 'DISBURSEMENT') ? 'dich_vu' : 'chi_ho';

  const run = db.transaction(() => {
    db.prepare(
      `UPDATE debit_notes SET ngay_ct=?, bank_account_name=?, bank_account_number=?, bank_name=?, bank_swift=?,
       nguoi_ky=?, chuc_danh_nguoi_ky=?, ghi_chu=?, loai=?, updated_at=datetime('now') WHERE id=?`
    ).run(
      ngay_ct || null, bank_account_name || null, bank_account_number || null, bank_name || null,
      bank_swift || null, nguoi_ky || null, chuc_danh_nguoi_ky || null, ghi_chu || null, loai, req.params.id
    );
    // Cách làm giống shipment_charges: xoá hết dòng cũ rồi tạo lại theo dữ liệu mới nhất — đơn
    // giản và an toàn vì debit_note_lines không có bảng con nào tham chiếu tới nó.
    db.prepare(`DELETE FROM debit_note_lines WHERE debit_note_id = ?`).run(req.params.id);
    lines.forEach((l, idx) => {
      insertLine.run(
        req.params.id, idx + 1, l.source_charge_id || null, l.mo_ta || '', l.don_vi_tinh || null,
        l.so_luong ?? 1, l.don_gia ?? 0, l.vat_percent === '' || l.vat_percent === undefined ? null : l.vat_percent,
        l.so_hoa_don || null, normalizeLineChargeType(l.charge_type), l.ghi_chu || null
      );
    });
  });
  run();
  res.json(getDebitNoteFull(req.params.id));
});

// ================= XÁC NHẬN (khoá sửa) / HUỶ XÁC NHẬN =================
router.post('/:id/confirm', (req, res) => {
  const existing = db.prepare(`SELECT * FROM debit_notes WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy Debit Note' });
  db.prepare(`UPDATE debit_notes SET status='confirmed', updated_at=datetime('now') WHERE id=?`).run(req.params.id);
  res.json(getDebitNoteFull(req.params.id));
});
router.post('/:id/unconfirm', (req, res) => {
  const existing = db.prepare(`SELECT * FROM debit_notes WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy Debit Note' });
  db.prepare(`UPDATE debit_notes SET status='draft', updated_at=datetime('now') WHERE id=?`).run(req.params.id);
  res.json(getDebitNoteFull(req.params.id));
});

// ================= XOÁ (chỉ khi còn draft) =================
router.delete('/:id', (req, res) => {
  const existing = db.prepare(`SELECT * FROM debit_notes WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy Debit Note' });
  if (existing.status !== 'draft') {
    return res.status(400).json({ error: 'Debit Note đã Xác nhận, không thể xoá.' });
  }
  db.prepare(`DELETE FROM debit_notes WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
