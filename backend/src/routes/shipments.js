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

// ================= TỰ SINH PHIẾU THU/CHI TỪ LÔ HÀNG (v2 — theo yêu cầu Senior) =================
// Đảo ngược quyết định đợt trước (khi đó chủ động BỎ auto-gen để tránh lệch số khi sửa lô hàng).
// Lần này Senior yêu cầu lại rõ ràng: tick "Đã thu" (cước) / "Đã thanh toán" (từng dòng chi phí)
// thì tự tạo luôn phiếu thu/chi thật, nội dung theo đúng quy cách Senior đưa ra. Để tránh lệch số
// khi Senior sửa lô hàng nhiều lần, cách làm là: mỗi lần lưu lô hàng, XOÁ HẾT các phiếu tự sinh
// (auto_generated=1) đang gắn với lô này rồi TẠO LẠI từ đầu theo dữ liệu mới nhất — chỉ áp dụng
// cho phiếu có auto_generated=1, không đụng tới phiếu Senior tự tạo tay ở màn Phiếu thu/chi (dù
// phiếu tay đó có gắn "Lô hàng liên kết" trùng lô này).
// LƯU Ý CHO PHIÊN SAU: nếu Senior tự sửa tay 1 phiếu tự sinh (vd đổi quỹ) rồi sau đó sửa lại lô
// hàng, phiếu tự sinh đó sẽ bị xoá/tạo lại và MẤT chỉnh sửa tay đó — đây là đánh đổi đã biết,
// chưa xử lý (có thể cần bàn thêm với Senior nếu phát sinh khó chịu trong thực tế).

function buildAutoContentThu({ soToKhai, customerName, maLo }) {
  const tkPart = soToKhai ? `TK ${soToKhai} - ` : '';
  return `${tkPart}Thu cước ${customerName || ''} - ${maLo}`.replace(/\s+/g, ' ').trim();
}

function buildAutoContentChi({ soToKhai, loaiPhi, maLo }) {
  const tkPart = soToKhai ? `TK ${soToKhai} - ` : '';
  return `${tkPart}Chi ${loaiPhi || 'phí'} - ${maLo}`.replace(/\s+/g, ' ').trim();
}

// Xoá hết phiếu tự sinh cũ đang gắn với lô hàng này, rồi tạo lại theo dữ liệu mới nhất.
// Gọi bên trong transaction lưu lô hàng, sau khi đã có shipmentId + charges đã lưu.
function regenerateAutoVouchers(shipmentId, { soToKhai, customerId, customerName, maLo, ngayCt, cuocDv, cuocPaymentMethodId, cuocThuNgay, charges }) {
  db.prepare(`DELETE FROM customer_receipts WHERE shipment_id = ? AND auto_generated = 1`).run(shipmentId);
  db.prepare(`DELETE FROM supplier_payments WHERE shipment_id = ? AND auto_generated = 1`).run(shipmentId);

  if (cuocThuNgay && customerId && (cuocDv || 0) > 0) {
    const so_ct = nextCode('PT', 'customer_receipts', 'so_ct');
    const ghi_chu = buildAutoContentThu({ soToKhai, customerName, maLo });
    db.prepare(
      `INSERT INTO customer_receipts (so_ct, customer_id, shipment_id, ngay_ct, so_tien, payment_method_id, ghi_chu, auto_generated)
       VALUES (?,?,?,?,?,?,?,1)`
    ).run(so_ct, customerId, shipmentId, ngayCt || null, cuocDv, cuocPaymentMethodId || null, ghi_chu);
  }

  for (const c of charges) {
    if (!c.da_thanh_toan || !c.supplier_id || !(c.so_tien > 0)) continue;
    const so_ct = nextCode('PC', 'supplier_payments', 'so_ct');
    const ghi_chu = buildAutoContentChi({ soToKhai, loaiPhi: c.loai_phi, maLo });
    db.prepare(
      `INSERT INTO supplier_payments (so_ct, supplier_id, shipment_id, ngay_ct, so_tien, payment_method_id, ghi_chu, auto_generated)
       VALUES (?,?,?,?,?,?,?,1)`
    ).run(so_ct, c.supplier_id, shipmentId, c.ngay_ct || ngayCt || null, c.so_tien, c.payment_method_id || null, ghi_chu);
  }
}

function getShipmentFull(id) {
  const shipment = db
    .prepare(
      `SELECT s.*, c.name as customer_name, pm.name as cuoc_payment_method_name
       FROM shipments s
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN payment_methods pm ON pm.id = s.cuoc_payment_method_id
       WHERE s.id = ?`
    )
    .get(id);
  if (!shipment) return null;
  const charges = db
    .prepare(
      `SELECT sc.*, sup.name as supplier_name, pm.name as payment_method_name
       FROM shipment_charges sc
       LEFT JOIN suppliers sup ON sup.id = sc.supplier_id
       LEFT JOIN payment_methods pm ON pm.id = sc.payment_method_id
       WHERE sc.shipment_id = ?
       ORDER BY sc.id`
    )
    .all(id);
  const tong_chi_phi = charges.reduce((a, c) => a + (c.so_tien || 0), 0);
  const tong_chi_ho = charges.reduce((a, c) => a + (c.la_chi_ho ? c.so_tien || 0 : 0), 0);
  const doanh_thu = (shipment.cuoc_dv || 0) + tong_chi_ho;
  // Phiếu thu/chi liên kết lô hàng này (tạo tay ở màn Phiếu thu/chi) — hiển thị để Senior biết
  // đã thu/chi tiền cho lô này chưa, không phải để tính lại công thức trên.
  const linked_receipts = db
    .prepare(`SELECT * FROM customer_receipts WHERE shipment_id = ? ORDER BY id`)
    .all(id);
  const linked_payments = db
    .prepare(`SELECT * FROM supplier_payments WHERE shipment_id = ? ORDER BY id`)
    .all(id);
  return {
    ...shipment,
    charges,
    tong_chi_phi,
    tong_chi_ho,
    doanh_thu,
    loi_nhuan: doanh_thu - tong_chi_phi,
    linked_receipts,
    linked_payments,
  };
}

// ---- LIST (kèm doanh thu / chi phí / lợi nhuận tóm tắt) ----
router.get('/', (req, res) => {
  const { customer_id, from, to, q } = req.query;
  let sql = `
    SELECT s.*, c.name as customer_name,
      COALESCE((SELECT SUM(so_tien) FROM shipment_charges WHERE shipment_id = s.id), 0) as tong_chi_phi,
      COALESCE((SELECT SUM(so_tien) FROM shipment_charges WHERE shipment_id = s.id AND la_chi_ho = 1), 0) as tong_chi_ho
    FROM shipments s
    LEFT JOIN customers c ON c.id = s.customer_id
    WHERE 1=1
  `;
  const params = [];
  if (customer_id) {
    sql += ' AND s.customer_id = ?';
    params.push(customer_id);
  }
  if (from) {
    sql += ' AND s.ngay_ct >= ?';
    params.push(from);
  }
  if (to) {
    sql += ' AND s.ngay_ct <= ?';
    params.push(to);
  }
  if (q) {
    sql += ' AND (s.ma_lo LIKE ? OR s.invoice LIKE ? OR s.so_to_khai LIKE ? OR s.so_container LIKE ? OR c.name LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  sql += ' ORDER BY s.id DESC';
  const rows = db.prepare(sql).all(...params);
  const result = rows.map((r) => {
    const doanh_thu = (r.cuoc_dv || 0) + (r.tong_chi_ho || 0);
    return { ...r, doanh_thu, loi_nhuan: doanh_thu - r.tong_chi_phi };
  });
  res.json(result);
});

// ---- DETAIL ----
router.get('/:id', (req, res) => {
  const shipment = getShipmentFull(req.params.id);
  if (!shipment) return res.status(404).json({ error: 'Không tìm thấy lô hàng' });
  res.json(shipment);
});

// ---- CREATE (kèm danh sách chi phí, và tuỳ chọn ghi thu ngay) ----
router.post('/', (req, res) => {
  const {
    ngay_ct, customer_id, invoice, so_to_khai, ngay_to_khai,
    so_container, so_luong_cont, cuoc_dv, ghi_chu, status,
    cuoc_payment_method_id, cuoc_thu_ngay, charges = [],
  } = req.body;

  if (!customer_id) return res.status(400).json({ error: 'Vui lòng chọn khách hàng' });

  // Dự phòng: nếu quên nhập "Ngày chứng từ", dùng "Ngày tờ khai" làm ngày phát sinh —
  // tránh lô hàng bị thiếu ngày -> "biến mất" khỏi báo cáo công nợ theo tháng / doanh thu.
  const ngayCtHieuLuc = ngay_ct || ngay_to_khai || null;

  const trx = db.transaction(() => {
    const ma_lo = nextCode('LO', 'shipments', 'ma_lo');
    const info = db
      .prepare(
        `INSERT INTO shipments
         (ma_lo, ngay_ct, customer_id, invoice, so_to_khai, ngay_to_khai, so_container, so_luong_cont, cuoc_dv, ghi_chu, status, cuoc_payment_method_id, cuoc_thu_ngay)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        ma_lo, ngayCtHieuLuc, customer_id, invoice || null, so_to_khai || null,
        ngay_to_khai || null, so_container || null, so_luong_cont || null,
        cuoc_dv || 0, ghi_chu || null, status || 'hoan_thanh',
        cuoc_payment_method_id || null, cuoc_thu_ngay ? 1 : 0
      );
    const shipmentId = info.lastInsertRowid;

    const insCharge = db.prepare(
      `INSERT INTO shipment_charges (shipment_id, ngay_ct, loai_phi, supplier_id, payment_method_id, so_tien, da_thanh_toan, la_chi_ho, ghi_chu)
       VALUES (?,?,?,?,?,?,?,?,?)`
    );
    for (const c of charges) {
      insCharge.run(
        shipmentId, c.ngay_ct || ngayCtHieuLuc, c.loai_phi || null,
        c.supplier_id || null, c.payment_method_id || null,
        c.so_tien || 0, c.da_thanh_toan ? 1 : 0, c.la_chi_ho ? 1 : 0, c.ghi_chu || null
      );
    }

    // v2: tick "Đã thu cước ngay" / "Đã thanh toán?" giờ tự sinh luôn phiếu thu/chi thật
    // (xem regenerateAutoVouchers ở trên) — không còn chỉ là cờ đánh dấu như đợt trước.
    const customerName = db.prepare(`SELECT name FROM customers WHERE id = ?`).get(customer_id)?.name;
    regenerateAutoVouchers(shipmentId, {
      soToKhai: so_to_khai, customerId: customer_id, customerName, maLo: ma_lo,
      ngayCt: ngayCtHieuLuc, cuocDv: cuoc_dv || 0, cuocPaymentMethodId: cuoc_payment_method_id,
      cuocThuNgay: !!cuoc_thu_ngay, charges,
    });

    return shipmentId;
  });

  const id = trx();
  res.json(getShipmentFull(id));
});

// ---- UPDATE ----
router.put('/:id', (req, res) => {
  const {
    ngay_ct, customer_id, invoice, so_to_khai, ngay_to_khai,
    so_container, so_luong_cont, cuoc_dv, ghi_chu, status,
    cuoc_payment_method_id, cuoc_thu_ngay, charges = [],
  } = req.body;

  const ngayCtHieuLuc = ngay_ct || ngay_to_khai || null;

  const trx = db.transaction(() => {
    db.prepare(
      `UPDATE shipments SET ngay_ct=?, customer_id=?, invoice=?, so_to_khai=?, ngay_to_khai=?,
       so_container=?, so_luong_cont=?, cuoc_dv=?, ghi_chu=?, status=?, cuoc_payment_method_id=?, cuoc_thu_ngay=?, updated_at=datetime('now')
       WHERE id=?`
    ).run(
      ngayCtHieuLuc, customer_id, invoice || null, so_to_khai || null, ngay_to_khai || null,
      so_container || null, so_luong_cont || null, cuoc_dv || 0, ghi_chu || null,
      status || 'hoan_thanh', cuoc_payment_method_id || null, cuoc_thu_ngay ? 1 : 0, req.params.id
    );

    db.prepare(`DELETE FROM shipment_charges WHERE shipment_id = ?`).run(req.params.id);
    const insCharge = db.prepare(
      `INSERT INTO shipment_charges (shipment_id, ngay_ct, loai_phi, supplier_id, payment_method_id, so_tien, da_thanh_toan, la_chi_ho, ghi_chu)
       VALUES (?,?,?,?,?,?,?,?,?)`
    );
    for (const c of charges) {
      insCharge.run(
        req.params.id, c.ngay_ct || ngayCtHieuLuc, c.loai_phi || null,
        c.supplier_id || null, c.payment_method_id || null,
        c.so_tien || 0, c.da_thanh_toan ? 1 : 0, c.la_chi_ho ? 1 : 0, c.ghi_chu || null
      );
    }

    // v2: xoá/tạo lại phiếu tự sinh theo dữ liệu vừa lưu (xem ghi chú ở regenerateAutoVouchers).
    const ma_lo = db.prepare(`SELECT ma_lo FROM shipments WHERE id = ?`).get(req.params.id)?.ma_lo;
    const customerName = db.prepare(`SELECT name FROM customers WHERE id = ?`).get(customer_id)?.name;
    regenerateAutoVouchers(req.params.id, {
      soToKhai: so_to_khai, customerId: customer_id, customerName, maLo: ma_lo,
      ngayCt: ngayCtHieuLuc, cuocDv: cuoc_dv || 0, cuocPaymentMethodId: cuoc_payment_method_id,
      cuocThuNgay: !!cuoc_thu_ngay, charges,
    });
  });
  trx();
  res.json(getShipmentFull(req.params.id));
});

// ---- DELETE ----
router.delete('/:id', (req, res) => {
  db.prepare(`DELETE FROM shipments WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
