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

// ================= PHIẾU THU KHÁCH HÀNG =================
router.get('/receipts', (req, res) => {
  const { customer_id, payment_method_id, q } = req.query;
  let sql = `
    SELECT r.*, c.name as customer_name, pm.name as payment_method_name, s.ma_lo
    FROM customer_receipts r
    LEFT JOIN customers c ON c.id = r.customer_id
    LEFT JOIN payment_methods pm ON pm.id = r.payment_method_id
    LEFT JOIN shipments s ON s.id = r.shipment_id
    WHERE 1=1`;
  const params = [];
  if (customer_id) {
    sql += ' AND r.customer_id = ?';
    params.push(customer_id);
  }
  if (payment_method_id) {
    sql += ' AND r.payment_method_id = ?';
    params.push(payment_method_id);
  }
  if (q) {
    sql += ' AND (r.so_ct LIKE ? OR r.ghi_chu LIKE ? OR c.name LIKE ? OR s.ma_lo LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  sql += ' ORDER BY r.id DESC';
  res.json(db.prepare(sql).all(...params));
});

router.post('/receipts', (req, res) => {
  const { customer_id, shipment_id, ngay_ct, so_tien, payment_method_id, ghi_chu } = req.body;
  if (!customer_id || !so_tien) return res.status(400).json({ error: 'Thiếu khách hàng hoặc số tiền' });
  const so_ct = nextCode('PT', 'customer_receipts', 'so_ct');
  const info = db
    .prepare(
      `INSERT INTO customer_receipts (so_ct, customer_id, shipment_id, ngay_ct, so_tien, payment_method_id, ghi_chu)
       VALUES (?,?,?,?,?,?,?)`
    )
    .run(so_ct, customer_id, shipment_id || null, ngay_ct || null, so_tien, payment_method_id || null, ghi_chu || null);
  res.json(db.prepare(`SELECT * FROM customer_receipts WHERE id = ?`).get(info.lastInsertRowid));
});

router.put('/receipts/:id', (req, res) => {
  const { customer_id, shipment_id, ngay_ct, so_tien, payment_method_id, ghi_chu } = req.body;
  if (!customer_id || !so_tien) return res.status(400).json({ error: 'Thiếu khách hàng hoặc số tiền' });
  db.prepare(
    `UPDATE customer_receipts SET customer_id=?, shipment_id=?, ngay_ct=?, so_tien=?, payment_method_id=?, ghi_chu=?
     WHERE id=?`
  ).run(customer_id, shipment_id || null, ngay_ct || null, so_tien, payment_method_id || null, ghi_chu || null, req.params.id);
  res.json(db.prepare(`SELECT * FROM customer_receipts WHERE id = ?`).get(req.params.id));
});

router.delete('/receipts/:id', (req, res) => {
  db.prepare(`DELETE FROM customer_receipts WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// ================= PHIẾU CHI NHÀ CUNG CẤP =================
router.get('/payments', (req, res) => {
  const { supplier_id, payment_method_id, q } = req.query;
  let sql = `
    SELECT p.*, sup.name as supplier_name, pm.name as payment_method_name, s.ma_lo
    FROM supplier_payments p
    LEFT JOIN suppliers sup ON sup.id = p.supplier_id
    LEFT JOIN payment_methods pm ON pm.id = p.payment_method_id
    LEFT JOIN shipments s ON s.id = p.shipment_id
    WHERE 1=1`;
  const params = [];
  if (supplier_id) {
    sql += ' AND p.supplier_id = ?';
    params.push(supplier_id);
  }
  if (payment_method_id) {
    sql += ' AND p.payment_method_id = ?';
    params.push(payment_method_id);
  }
  if (q) {
    sql += ' AND (p.so_ct LIKE ? OR p.ghi_chu LIKE ? OR sup.name LIKE ? OR s.ma_lo LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  sql += ' ORDER BY p.id DESC';
  res.json(db.prepare(sql).all(...params));
});

router.post('/payments', (req, res) => {
  const { supplier_id, shipment_id, ngay_ct, so_tien, payment_method_id, ghi_chu } = req.body;
  if (!supplier_id || !so_tien) return res.status(400).json({ error: 'Thiếu nhà cung cấp hoặc số tiền' });
  const so_ct = nextCode('PC', 'supplier_payments', 'so_ct');
  const info = db
    .prepare(
      `INSERT INTO supplier_payments (so_ct, supplier_id, shipment_id, ngay_ct, so_tien, payment_method_id, ghi_chu)
       VALUES (?,?,?,?,?,?,?)`
    )
    .run(so_ct, supplier_id, shipment_id || null, ngay_ct || null, so_tien, payment_method_id || null, ghi_chu || null);
  res.json(db.prepare(`SELECT * FROM supplier_payments WHERE id = ?`).get(info.lastInsertRowid));
});

router.put('/payments/:id', (req, res) => {
  const { supplier_id, shipment_id, ngay_ct, so_tien, payment_method_id, ghi_chu } = req.body;
  if (!supplier_id || !so_tien) return res.status(400).json({ error: 'Thiếu nhà cung cấp hoặc số tiền' });
  db.prepare(
    `UPDATE supplier_payments SET supplier_id=?, shipment_id=?, ngay_ct=?, so_tien=?, payment_method_id=?, ghi_chu=?
     WHERE id=?`
  ).run(supplier_id, shipment_id || null, ngay_ct || null, so_tien, payment_method_id || null, ghi_chu || null, req.params.id);
  res.json(db.prepare(`SELECT * FROM supplier_payments WHERE id = ?`).get(req.params.id));
});

router.delete('/payments/:id', (req, res) => {
  db.prepare(`DELETE FROM supplier_payments WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
