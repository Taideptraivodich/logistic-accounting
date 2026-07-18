const express = require('express');
const db = require('../db');
const { nextCode } = require('../utils/nextCode');
const router = express.Router();

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

// ================= DANH SÁCH =================
router.get('/', (req, res) => {
  const { shipment_id, customer_id, status, q } = req.query;
  let sql = `
    SELECT dn.*,
      (SELECT COALESCE(SUM(l.don_gia * l.so_luong * (1 + COALESCE(l.vat_percent,0)/100.0)), 0)
       FROM debit_note_lines l WHERE l.debit_note_id = dn.id) as tong_cong
    FROM debit_notes dn WHERE 1=1`;
  const params = [];
  if (shipment_id) {
    sql += ' AND dn.shipment_id = ?';
    params.push(shipment_id);
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
// Body: { loai, ngay_ct, shipment_id?, customer_id, bank_account_name/number/bank_name/bank_swift,
//         nguoi_ky, chuc_danh_nguoi_ky, ghi_chu, lines: [{ mo_ta, don_vi_tinh, so_luong, don_gia,
//         vat_percent, so_hoa_don, ghi_chu, source_charge_id? }] }
// customer_id bắt buộc để snapshot thông tin KH; shipment_id không bắt buộc (Debit Note có thể
// không gắn lô hàng cụ thể) nhưng nếu có sẽ snapshot thêm thông tin lô hàng.
router.post('/', (req, res) => {
  const {
    loai, ngay_ct, shipment_id, customer_id,
    bank_account_name, bank_account_number, bank_name, bank_swift,
    nguoi_ky, chuc_danh_nguoi_ky, ghi_chu, lines,
  } = req.body;

  if (!['dich_vu', 'chi_ho'].includes(loai)) {
    return res.status(400).json({ error: 'Loại Debit Note không hợp lệ (dich_vu | chi_ho)' });
  }
  if (!customer_id) return res.status(400).json({ error: 'Vui lòng chọn khách hàng' });
  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: 'Debit Note cần ít nhất 1 dòng chi phí' });
  }

  const customer = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(customer_id);
  if (!customer) return res.status(400).json({ error: 'Khách hàng không tồn tại' });
  const shipment = shipment_id ? db.prepare(`SELECT * FROM shipments WHERE id = ?`).get(shipment_id) : null;
  const company = db.prepare(`SELECT * FROM company_settings WHERE id = 1`).get() || {};

  const so_dn = nextCode('DN', 'debit_notes', 'so_dn');

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
      debit_note_id, stt, source_charge_id, mo_ta, don_vi_tinh, so_luong, don_gia, vat_percent, so_hoa_don, ghi_chu
    ) VALUES (?,?,?,?,?,?,?,?,?,?)`
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
        l.so_hoa_don || null, l.ghi_chu || null
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
      debit_note_id, stt, source_charge_id, mo_ta, don_vi_tinh, so_luong, don_gia, vat_percent, so_hoa_don, ghi_chu
    ) VALUES (?,?,?,?,?,?,?,?,?,?)`
  );

  const run = db.transaction(() => {
    db.prepare(
      `UPDATE debit_notes SET ngay_ct=?, bank_account_name=?, bank_account_number=?, bank_name=?, bank_swift=?,
       nguoi_ky=?, chuc_danh_nguoi_ky=?, ghi_chu=?, updated_at=datetime('now') WHERE id=?`
    ).run(
      ngay_ct || null, bank_account_name || null, bank_account_number || null, bank_name || null,
      bank_swift || null, nguoi_ky || null, chuc_danh_nguoi_ky || null, ghi_chu || null, req.params.id
    );
    // Cách làm giống shipment_charges: xoá hết dòng cũ rồi tạo lại theo dữ liệu mới nhất — đơn
    // giản và an toàn vì debit_note_lines không có bảng con nào tham chiếu tới nó.
    db.prepare(`DELETE FROM debit_note_lines WHERE debit_note_id = ?`).run(req.params.id);
    lines.forEach((l, idx) => {
      insertLine.run(
        req.params.id, idx + 1, l.source_charge_id || null, l.mo_ta || '', l.don_vi_tinh || null,
        l.so_luong ?? 1, l.don_gia ?? 0, l.vat_percent === '' || l.vat_percent === undefined ? null : l.vat_percent,
        l.so_hoa_don || null, l.ghi_chu || null
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
