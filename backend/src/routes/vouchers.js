const express = require('express');
const db = require('../db');
const router = express.Router();

function nextCode(prefix, table, col) {
  const row = db
    .prepare(`SELECT ${col} as code FROM ${table} WHERE ${col} LIKE ? ORDER BY id DESC LIMIT 1`)
    .get(`${prefix}%`);
  let n = 1;
  if (row && row.code) {
    const m = row.code.match(/(\d+)$/);
    if (m) n = parseInt(m[1], 10) + 1;
  }
  return prefix + String(n).padStart(6, '0');
}

// Tự sinh "Nội dung"/ghi_chú mặc định khi Senior không tự gõ, để Phiếu thu/chi và Sổ quỹ
// không bao giờ hiển thị dòng trống — giống cột "Nội dung" trong sao kê ngân hàng.
// isThu: true = phiếu thu (khách hàng/thu khác), false = phiếu chi (NCC/chi khác).
function buildDefaultGhiChu({ isThu, ownerName, categoryName, maLo }) {
  const doiTuong = ownerName || categoryName || (isThu ? 'thu khác' : 'chi khác');
  const hanhDong = isThu ? 'Thu tiền' : 'Chi tiền';
  const base = ownerName ? `${hanhDong} ${doiTuong}` : doiTuong;
  return maLo ? `${base} - Lô hàng ${maLo}` : base;
}

// ================= PHIẾU THU KHÁCH HÀNG (hoặc "thu khác" không gắn khách hàng) =================
// Ghi chú: KHÔNG còn tự sinh từ lô hàng nữa — Senior luôn tạo tay tại đây (kể cả khi thu cước
// một lô hàng cụ thể, chọn "Khách hàng" + tuỳ chọn gắn "Lô hàng liên kết").
router.get('/receipts', (req, res) => {
  const { customer_id, category_id, payment_method_id, q } = req.query;
  let sql = `
    SELECT r.*, c.name as customer_name, vc.name as category_name,
      pm.name as payment_method_name, s.ma_lo
    FROM customer_receipts r
    LEFT JOIN customers c ON c.id = r.customer_id
    LEFT JOIN voucher_categories vc ON vc.id = r.category_id
    LEFT JOIN payment_methods pm ON pm.id = r.payment_method_id
    LEFT JOIN shipments s ON s.id = r.shipment_id
    WHERE 1=1`;
  const params = [];
  if (customer_id) {
    sql += ' AND r.customer_id = ?';
    params.push(customer_id);
  }
  if (category_id) {
    sql += ' AND r.category_id = ?';
    params.push(category_id);
  }
  if (payment_method_id) {
    sql += ' AND r.payment_method_id = ?';
    params.push(payment_method_id);
  }
  if (q) {
    sql += ' AND (r.so_ct LIKE ? OR r.ghi_chu LIKE ? OR c.name LIKE ? OR vc.name LIKE ? OR s.ma_lo LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  sql += ' ORDER BY r.id DESC';
  res.json(db.prepare(sql).all(...params));
});

router.post('/receipts', (req, res) => {
  const { customer_id, category_id, shipment_id, ngay_ct, so_tien, payment_method_id, ghi_chu } = req.body;
  if (!customer_id && !category_id) {
    return res.status(400).json({ error: 'Vui lòng chọn khách hàng hoặc danh mục thu khác' });
  }
  if (!so_tien) return res.status(400).json({ error: 'Thiếu số tiền' });
  const so_ct = nextCode('PT', 'customer_receipts', 'so_ct');
  let finalGhiChu = ghi_chu;
  if (!finalGhiChu) {
    const ownerName = customer_id
      ? db.prepare(`SELECT name FROM customers WHERE id = ?`).get(customer_id)?.name
      : null;
    const categoryName = category_id
      ? db.prepare(`SELECT name FROM voucher_categories WHERE id = ?`).get(category_id)?.name
      : null;
    const maLo = shipment_id
      ? db.prepare(`SELECT ma_lo FROM shipments WHERE id = ?`).get(shipment_id)?.ma_lo
      : null;
    finalGhiChu = buildDefaultGhiChu({ isThu: true, ownerName, categoryName, maLo });
  }
  const info = db
    .prepare(
      `INSERT INTO customer_receipts (so_ct, customer_id, category_id, shipment_id, ngay_ct, so_tien, payment_method_id, ghi_chu)
       VALUES (?,?,?,?,?,?,?,?)`
    )
    .run(
      so_ct, customer_id || null, category_id || null, shipment_id || null,
      ngay_ct || null, so_tien, payment_method_id || null, finalGhiChu
    );
  res.json(db.prepare(`SELECT * FROM customer_receipts WHERE id = ?`).get(info.lastInsertRowid));
});

router.put('/receipts/:id', (req, res) => {
  const { customer_id, category_id, shipment_id, ngay_ct, so_tien, payment_method_id, ghi_chu } = req.body;
  if (!customer_id && !category_id) {
    return res.status(400).json({ error: 'Vui lòng chọn khách hàng hoặc danh mục thu khác' });
  }
  if (!so_tien) return res.status(400).json({ error: 'Thiếu số tiền' });
  let finalGhiChu = ghi_chu;
  if (!finalGhiChu) {
    const ownerName = customer_id
      ? db.prepare(`SELECT name FROM customers WHERE id = ?`).get(customer_id)?.name
      : null;
    const categoryName = category_id
      ? db.prepare(`SELECT name FROM voucher_categories WHERE id = ?`).get(category_id)?.name
      : null;
    const maLo = shipment_id
      ? db.prepare(`SELECT ma_lo FROM shipments WHERE id = ?`).get(shipment_id)?.ma_lo
      : null;
    finalGhiChu = buildDefaultGhiChu({ isThu: true, ownerName, categoryName, maLo });
  }
  db.prepare(
    `UPDATE customer_receipts SET customer_id=?, category_id=?, shipment_id=?, ngay_ct=?, so_tien=?, payment_method_id=?, ghi_chu=?
     WHERE id=?`
  ).run(
    customer_id || null, category_id || null, shipment_id || null, ngay_ct || null,
    so_tien, payment_method_id || null, finalGhiChu, req.params.id
  );
  res.json(db.prepare(`SELECT * FROM customer_receipts WHERE id = ?`).get(req.params.id));
});

router.delete('/receipts/:id', (req, res) => {
  db.prepare(`DELETE FROM customer_receipts WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// ================= PHIẾU CHI NHÀ CUNG CẤP (hoặc "chi khác" không gắn NCC) =================
router.get('/payments', (req, res) => {
  const { supplier_id, category_id, payment_method_id, q } = req.query;
  let sql = `
    SELECT p.*, sup.name as supplier_name, vc.name as category_name,
      pm.name as payment_method_name, s.ma_lo
    FROM supplier_payments p
    LEFT JOIN suppliers sup ON sup.id = p.supplier_id
    LEFT JOIN voucher_categories vc ON vc.id = p.category_id
    LEFT JOIN payment_methods pm ON pm.id = p.payment_method_id
    LEFT JOIN shipments s ON s.id = p.shipment_id
    WHERE 1=1`;
  const params = [];
  if (supplier_id) {
    sql += ' AND p.supplier_id = ?';
    params.push(supplier_id);
  }
  if (category_id) {
    sql += ' AND p.category_id = ?';
    params.push(category_id);
  }
  if (payment_method_id) {
    sql += ' AND p.payment_method_id = ?';
    params.push(payment_method_id);
  }
  if (q) {
    sql += ' AND (p.so_ct LIKE ? OR p.ghi_chu LIKE ? OR sup.name LIKE ? OR vc.name LIKE ? OR s.ma_lo LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  sql += ' ORDER BY p.id DESC';
  res.json(db.prepare(sql).all(...params));
});

router.post('/payments', (req, res) => {
  const { supplier_id, category_id, shipment_id, ngay_ct, so_tien, payment_method_id, ghi_chu } = req.body;
  if (!supplier_id && !category_id) {
    return res.status(400).json({ error: 'Vui lòng chọn nhà cung cấp hoặc danh mục chi khác' });
  }
  if (!so_tien) return res.status(400).json({ error: 'Thiếu số tiền' });
  const so_ct = nextCode('PC', 'supplier_payments', 'so_ct');
  let finalGhiChu = ghi_chu;
  if (!finalGhiChu) {
    const ownerName = supplier_id
      ? db.prepare(`SELECT name FROM suppliers WHERE id = ?`).get(supplier_id)?.name
      : null;
    const categoryName = category_id
      ? db.prepare(`SELECT name FROM voucher_categories WHERE id = ?`).get(category_id)?.name
      : null;
    const maLo = shipment_id
      ? db.prepare(`SELECT ma_lo FROM shipments WHERE id = ?`).get(shipment_id)?.ma_lo
      : null;
    finalGhiChu = buildDefaultGhiChu({ isThu: false, ownerName, categoryName, maLo });
  }
  const info = db
    .prepare(
      `INSERT INTO supplier_payments (so_ct, supplier_id, category_id, shipment_id, ngay_ct, so_tien, payment_method_id, ghi_chu)
       VALUES (?,?,?,?,?,?,?,?)`
    )
    .run(
      so_ct, supplier_id || null, category_id || null, shipment_id || null,
      ngay_ct || null, so_tien, payment_method_id || null, finalGhiChu
    );
  res.json(db.prepare(`SELECT * FROM supplier_payments WHERE id = ?`).get(info.lastInsertRowid));
});

router.put('/payments/:id', (req, res) => {
  const { supplier_id, category_id, shipment_id, ngay_ct, so_tien, payment_method_id, ghi_chu } = req.body;
  if (!supplier_id && !category_id) {
    return res.status(400).json({ error: 'Vui lòng chọn nhà cung cấp hoặc danh mục chi khác' });
  }
  if (!so_tien) return res.status(400).json({ error: 'Thiếu số tiền' });
  let finalGhiChu = ghi_chu;
  if (!finalGhiChu) {
    const ownerName = supplier_id
      ? db.prepare(`SELECT name FROM suppliers WHERE id = ?`).get(supplier_id)?.name
      : null;
    const categoryName = category_id
      ? db.prepare(`SELECT name FROM voucher_categories WHERE id = ?`).get(category_id)?.name
      : null;
    const maLo = shipment_id
      ? db.prepare(`SELECT ma_lo FROM shipments WHERE id = ?`).get(shipment_id)?.ma_lo
      : null;
    finalGhiChu = buildDefaultGhiChu({ isThu: false, ownerName, categoryName, maLo });
  }
  db.prepare(
    `UPDATE supplier_payments SET supplier_id=?, category_id=?, shipment_id=?, ngay_ct=?, so_tien=?, payment_method_id=?, ghi_chu=?
     WHERE id=?`
  ).run(
    supplier_id || null, category_id || null, shipment_id || null, ngay_ct || null,
    so_tien, payment_method_id || null, finalGhiChu, req.params.id
  );
  res.json(db.prepare(`SELECT * FROM supplier_payments WHERE id = ?`).get(req.params.id));
});

router.delete('/payments/:id', (req, res) => {
  db.prepare(`DELETE FROM supplier_payments WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
