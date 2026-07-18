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

const customerCrud = makeCrud('customers', ['default_cuoc_dv', 'note']);
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

const pmCrud = makeCrud('payment_methods', ['opening_balance']);
router.get('/payment-methods', pmCrud.list);
router.post('/payment-methods', pmCrud.create);
router.put('/payment-methods/:id', pmCrud.update);
router.delete('/payment-methods/:id', pmCrud.remove);

module.exports = router;
