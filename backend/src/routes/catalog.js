const express = require('express');
const db = require('../db');
const router = express.Router();

function makeCrud(table, extraCols = []) {
  const cols = ['name', ...extraCols];
  return {
    list: (req, res) => {
      res.json(db.prepare(`SELECT * FROM ${table} ORDER BY name`).all());
    },
    create: (req, res) => {
      const values = cols.map((c) => req.body[c] ?? null);
      const placeholders = cols.map(() => '?').join(',');
      try {
        const info = db
          .prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`)
          .run(...values);
        res.json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(info.lastInsertRowid));
      } catch (e) {
        res.status(400).json({ error: e.message });
      }
    },
    update: (req, res) => {
      const set = cols.map((c) => `${c} = ?`).join(',');
      const values = cols.map((c) => req.body[c] ?? null);
      try {
        db.prepare(`UPDATE ${table} SET ${set} WHERE id = ?`).run(...values, req.params.id);
        res.json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id));
      } catch (e) {
        res.status(400).json({ error: e.message });
      }
    },
    remove: (req, res) => {
      try {
        db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(req.params.id);
        res.json({ ok: true });
      } catch (e) {
        res.status(400).json({ error: 'Không thể xoá (đang được sử dụng ở phiếu khác).' });
      }
    },
  };
}

const customerCrud = makeCrud('customers', ['default_cuoc_dv', 'note', 'address', 'tax_code', 'contact_name']);
router.get('/customers', customerCrud.list);
router.post('/customers', customerCrud.create);
router.put('/customers/:id', customerCrud.update);
router.delete('/customers/:id', customerCrud.remove);

const supplierCrud = makeCrud('suppliers', ['note']);
router.get('/suppliers', supplierCrud.list);
router.post('/suppliers', supplierCrud.create);
router.put('/suppliers/:id', supplierCrud.update);
router.delete('/suppliers/:id', supplierCrud.remove);

const feeTypeCrud = makeCrud('fee_types');
router.get('/fee-types', feeTypeCrud.list);
router.post('/fee-types', feeTypeCrud.create);
router.put('/fee-types/:id', feeTypeCrud.update);
router.delete('/fee-types/:id', feeTypeCrud.remove);

const pmCrud = makeCrud('payment_methods', [
  'opening_balance', 'bank_account_name', 'bank_account_number', 'bank_name', 'bank_swift',
]);
router.get('/payment-methods', pmCrud.list);
router.post('/payment-methods', pmCrud.create);
router.put('/payment-methods/:id', pmCrud.update);
router.delete('/payment-methods/:id', pmCrud.remove);

// ================= THÔNG TIN CÔNG TY (Header khi in Debit Note) =================
// Bảng 1 dòng cố định (id=1) — không dùng makeCrud (không có "name" là khoá danh mục kiểu list).
router.get('/company-settings', (req, res) => {
  res.json(db.prepare(`SELECT * FROM company_settings WHERE id = 1`).get());
});
router.put('/company-settings', (req, res) => {
  const { name, address, tax_code, phone, email } = req.body;
  db.prepare(
    `UPDATE company_settings SET name=?, address=?, tax_code=?, phone=?, email=? WHERE id=1`
  ).run(name || null, address || null, tax_code || null, phone || null, email || null);
  res.json(db.prepare(`SELECT * FROM company_settings WHERE id = 1`).get());
});

// ================= DANH MỤC THU/CHI KHÁC =================
// Dùng cho phiếu thu/chi không gắn khách hàng / NCC cụ thể (chi in hồ sơ, mua văn phòng phẩm...).
// Lọc theo ?type=thu|chi khi liệt kê; khi tạo mới phải truyền type trong body.
router.get('/voucher-categories', (req, res) => {
  const { type } = req.query;
  if (type) {
    res.json(db.prepare(`SELECT * FROM voucher_categories WHERE type = ? ORDER BY name`).all(type));
  } else {
    res.json(db.prepare(`SELECT * FROM voucher_categories ORDER BY type, name`).all());
  }
});
router.post('/voucher-categories', (req, res) => {
  const { name, type } = req.body;
  if (!name || !['thu', 'chi'].includes(type)) {
    return res.status(400).json({ error: 'Thiếu tên hoặc loại danh mục (thu/chi) không hợp lệ' });
  }
  try {
    const info = db.prepare(`INSERT INTO voucher_categories (name, type) VALUES (?, ?)`).run(name, type);
    res.json(db.prepare(`SELECT * FROM voucher_categories WHERE id = ?`).get(info.lastInsertRowid));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
router.put('/voucher-categories/:id', (req, res) => {
  const { name, type } = req.body;
  if (!name || !['thu', 'chi'].includes(type)) {
    return res.status(400).json({ error: 'Thiếu tên hoặc loại danh mục (thu/chi) không hợp lệ' });
  }
  try {
    db.prepare(`UPDATE voucher_categories SET name = ?, type = ? WHERE id = ?`).run(name, type, req.params.id);
    res.json(db.prepare(`SELECT * FROM voucher_categories WHERE id = ?`).get(req.params.id));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
router.delete('/voucher-categories/:id', (req, res) => {
  try {
    db.prepare(`DELETE FROM voucher_categories WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Không thể xoá (đang được sử dụng ở phiếu khác).' });
  }
});

module.exports = router;
