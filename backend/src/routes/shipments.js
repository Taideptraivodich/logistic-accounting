const express = require('express');
const db = require('../db');
const { revenueExpr, sumCustomerChargesByType } = require('../utils/revenue');
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
// CẬP NHẬT: "Nhà cung cấp" ở dòng chi phí KHÔNG bắt buộc để tự sinh phiếu chi, trong MỌI trường
// hợp (kể cả dòng "Chi hộ"). Chỉ cần tick "Đã thanh toán?" + Số tiền > 0. Đã thử 2 phương án:
// (1) bắt buộc supplier_id cho mọi dòng — sai, chặn cả chi phí thường không cần NCC;
// (2) chỉ bắt buộc supplier_id khi la_chi_ho=true — cũng sai, thực tế Senior vẫn muốn tự tạo
// phiếu chi hộ dù chưa chọn NCC. Chốt: KHÔNG có điều kiện supplier_id nào cả, xem vòng lặp charges.

function buildAutoContentThu({ soToKhai, customerName, maLo, label }) {
  const tkPart = soToKhai ? `TK ${soToKhai} - ` : '';
  return `${tkPart}Thu ${label} ${customerName || ''} - ${maLo}`.replace(/\s+/g, ' ').trim();
}

function buildAutoContentChi({ soToKhai, loaiPhi, maLo }) {
  const tkPart = soToKhai ? `TK ${soToKhai} - ` : '';
  return `${tkPart}Chi ${loaiPhi || 'phí'} - ${maLo}`.replace(/\s+/g, ' ').trim();
}

// Xoá hết phiếu tự sinh cũ đang gắn với lô hàng này, rồi tạo lại theo dữ liệu mới nhất.
// Gọi bên trong transaction lưu lô hàng, sau khi đã có shipmentId + charges đã lưu.
function regenerateAutoVouchers(shipmentId, {
  soToKhai, customerId, customerName, maLo, ngayCt,
  dichVuAmount, cuocPaymentMethodId, cuocThuNgay,
  chiHoAmount, chiHoPaymentMethodId, chiHoThuNgay,
  charges,
}) {
  db.prepare(`DELETE FROM customer_receipts WHERE shipment_id = ? AND auto_generated = 1`).run(shipmentId);
  db.prepare(`DELETE FROM supplier_payments WHERE shipment_id = ? AND auto_generated = 1`).run(shipmentId);

  // v3: "Cước dịch vụ" và "Chi hộ" là 2 khoản thu ĐỘC LẬP (thường về 2 tài khoản/quỹ khác nhau —
  // xem 2 mẫu Debit Note PDF gốc, mỗi mẫu ghi 1 "Người thụ hưởng" riêng) -> tự sinh TỐI ĐA 2 phiếu
  // thu riêng biệt, mỗi phiếu đúng số tiền phần mình (sumCustomerChargesByType — Single Source of
  // Truth, xem utils/revenue.js), KHÔNG gộp chung 1 phiếu như trước nữa.
  if (cuocThuNgay && customerId && (dichVuAmount || 0) > 0) {
    const so_ct = nextCode('PT', 'customer_receipts', 'so_ct');
    const ghi_chu = buildAutoContentThu({ soToKhai, customerName, maLo, label: 'cước dịch vụ' });
    db.prepare(
      `INSERT INTO customer_receipts (so_ct, customer_id, shipment_id, ngay_ct, so_tien, payment_method_id, ghi_chu, auto_generated)
       VALUES (?,?,?,?,?,?,?,1)`
    ).run(so_ct, customerId, shipmentId, ngayCt || null, dichVuAmount, cuocPaymentMethodId || null, ghi_chu);
  }
  if (chiHoThuNgay && customerId && (chiHoAmount || 0) > 0) {
    const so_ct = nextCode('PT', 'customer_receipts', 'so_ct');
    const ghi_chu = buildAutoContentThu({ soToKhai, customerName, maLo, label: 'chi hộ' });
    db.prepare(
      `INSERT INTO customer_receipts (so_ct, customer_id, shipment_id, ngay_ct, so_tien, payment_method_id, ghi_chu, auto_generated)
       VALUES (?,?,?,?,?,?,?,1)`
    ).run(so_ct, customerId, shipmentId, ngayCt || null, chiHoAmount, chiHoPaymentMethodId || null, ghi_chu);
  }

  for (const c of charges) {
    if (!c.da_thanh_toan || !(c.so_tien > 0)) continue;
    // NCC KHÔNG bắt buộc để tự tạo phiếu chi, kể cả khi dòng đó là "Chi hộ" — thực tế Senior vẫn
    // muốn tự tạo phiếu chi vào đúng Quỹ chi đã chọn dù chưa/không chọn NCC (đã xác nhận qua test
    // thực tế: dòng "Chi hộ" + "Đã thanh toán" nhưng chưa chọn NCC vẫn phải tự sinh phiếu). Đợt
    // trước có thêm điều kiện bắt buộc supplier_id khi la_chi_ho=true — ĐÃ BỎ vì sai, chỉ cần
    // "Đã thanh toán?" + Số tiền > 0 là đủ cho MỌI dòng, không phân biệt Chi hộ hay không.
    const so_ct = nextCode('PC', 'supplier_payments', 'so_ct');
    const ghi_chu = buildAutoContentChi({ soToKhai, loaiPhi: c.loai_phi, maLo });
    db.prepare(
      `INSERT INTO supplier_payments (so_ct, supplier_id, shipment_id, ngay_ct, so_tien, payment_method_id, ghi_chu, auto_generated)
       VALUES (?,?,?,?,?,?,?,1)`
    ).run(so_ct, c.supplier_id || null, shipmentId, c.ngay_ct || ngayCt || null, c.so_tien, c.payment_method_id || null, ghi_chu);
  }
}

// "Debit Note" / Customer Charges: copy từ Cost (shipment_charges) sang shipment_customer_charges.
// Dùng ở 3 nơi: (1) tạo lô hàng mới (copy TOÀN BỘ, startStt=0), (2) "lazy copy" lần đầu GET tab
// Customer Charges của 1 lô hàng cũ (đã có Cost nhưng chưa có dòng nào ở đây, startStt=0), và
// (3) Sửa lô hàng có THÊM dòng chi phí mới (chỉ copy đúng các dòng MỚI đó, nối tiếp sau các dòng đã
// có sẵn — startStt = stt lớn nhất hiện tại, xem route PUT bên dưới). startStt cho phép gọi hàm này
// nhiều lần cho cùng 1 shipment mà không đè lên các dòng đã có.
function copyChargesToCustomerCharges(shipmentId, charges, startStt = 0) {
  if (!charges || charges.length === 0) return;
  const insert = db.prepare(
    `INSERT INTO shipment_customer_charges (shipment_id, stt, source_charge_id, mo_ta, don_vi_tinh, so_luong, don_gia, vat_percent, charge_type, ghi_chu)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  );
  let stt = startStt;
  charges.forEach((c) => {
    stt += 1;
    // Chi hộ (la_chi_ho=1) -> charge_type DISBURSEMENT, còn lại mặc định SERVICE. Senior tự sửa lại
    // Charge Type từng dòng ở tab Debit Note (Customer Charges) nếu cần phân loại ADJUSTMENT/DISCOUNT.
    const charge_type = c.la_chi_ho ? 'DISBURSEMENT' : 'SERVICE';
    insert.run(shipmentId, stt, c.id || null, c.loai_phi || '(chưa đặt tên)', null, 1, c.so_tien || 0, null, charge_type, null);
  });
}

const CHARGE_TYPES = ['SERVICE', 'DISBURSEMENT', 'ADJUSTMENT', 'DISCOUNT'];
function normalizeChargeType(t) {
  return CHARGE_TYPES.includes(t) ? t : 'SERVICE';
}

function withCustomerChargeTotals(rows) {
  const lines = rows.map((r) => {
    const thanh_tien = (r.don_gia || 0) * (r.so_luong || 0);
    const vat_amount = r.vat_percent != null ? (thanh_tien * r.vat_percent) / 100 : 0;
    return { ...r, thanh_tien, vat_amount, tong_cong: thanh_tien + vat_amount };
  });
  const tong = lines.reduce(
    (acc, l) => ({
      subtotal: acc.subtotal + l.thanh_tien,
      vat: acc.vat + l.vat_amount,
      grand_total: acc.grand_total + l.tong_cong,
    }),
    { subtotal: 0, vat: 0, grand_total: 0 }
  );
  return { lines, ...tong };
}

function getShipmentFull(id) {
  const shipment = db
    .prepare(
      `SELECT s.*, c.name as customer_name, c.address as customer_address, c.tax_code as customer_tax_code,
        c.contact_name as customer_contact_name, c.phone as customer_phone, pm.name as cuoc_payment_method_name,
        pm2.name as chi_ho_payment_method_name
       FROM shipments s
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN payment_methods pm ON pm.id = s.cuoc_payment_method_id
       LEFT JOIN payment_methods pm2 ON pm2.id = s.chi_ho_payment_method_id
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
  // Doanh thu = SUM(Customer Charges) — Single Source of Truth (xem utils/revenue.js). KHÔNG còn
  // đọc shipment.cuoc_dv. tong_chi_ho ở trên vẫn giữ để hiển thị breakdown phía Cost (tab "Chi phí"),
  // không liên quan tới công thức doanh thu nữa. doanh_thu_dich_vu/doanh_thu_chi_ho: breakdown theo
  // charge_type — 2 khoản thu ĐỘC LẬP (thường về 2 quỹ khác nhau, xem regenerateAutoVouchers).
  const { dichVu: doanh_thu_dich_vu, chiHo: doanh_thu_chi_ho, total: doanh_thu } = sumCustomerChargesByType(id);
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
    doanh_thu_dich_vu,
    doanh_thu_chi_ho,
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
      COALESCE((SELECT SUM(so_tien) FROM shipment_charges WHERE shipment_id = s.id AND la_chi_ho = 1), 0) as tong_chi_ho,
      ${revenueExpr('s.id')} as doanh_thu
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
  // Doanh thu = SUM(Customer Charges) — xem revenueExpr trong utils/revenue.js. Lợi nhuận =
  // Doanh thu - SUM(Supplier Costs), không còn công thức "cuoc_dv + chi_ho - chi_phi" cũ.
  const result = rows.map((r) => ({ ...r, loi_nhuan: r.doanh_thu - r.tong_chi_phi }));
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
    so_container, so_luong_cont, cuoc_dv, ghi_chu, status, po,
    cuoc_payment_method_id, cuoc_thu_ngay,
    chi_ho_payment_method_id, chi_ho_thu_ngay, charges = [],
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
         (ma_lo, ngay_ct, customer_id, invoice, so_to_khai, ngay_to_khai, so_container, so_luong_cont, cuoc_dv, ghi_chu, status, po, cuoc_payment_method_id, cuoc_thu_ngay, chi_ho_payment_method_id, chi_ho_thu_ngay)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        ma_lo, ngayCtHieuLuc, customer_id, invoice || null, so_to_khai || null,
        ngay_to_khai || null, so_container || null, so_luong_cont || null,
        cuoc_dv || 0, ghi_chu || null, status || 'hoan_thanh', po || null,
        cuoc_payment_method_id || null, cuoc_thu_ngay ? 1 : 0,
        chi_ho_payment_method_id || null, chi_ho_thu_ngay ? 1 : 0
      );
    const shipmentId = info.lastInsertRowid;

    const insCharge = db.prepare(
      `INSERT INTO shipment_charges (shipment_id, ngay_ct, loai_phi, supplier_id, payment_method_id, so_tien, da_thanh_toan, la_chi_ho, ghi_chu)
       VALUES (?,?,?,?,?,?,?,?,?)`
    );
    const insertedCharges = [];
    for (const c of charges) {
      const chargeInfo = insCharge.run(
        shipmentId, c.ngay_ct || ngayCtHieuLuc, c.loai_phi || null,
        c.supplier_id || null, c.payment_method_id || null,
        c.so_tien || 0, c.da_thanh_toan ? 1 : 0, c.la_chi_ho ? 1 : 0, c.ghi_chu || null
      );
      insertedCharges.push({ id: chargeInfo.lastInsertRowid, loai_phi: c.loai_phi, so_tien: c.so_tien || 0, la_chi_ho: c.la_chi_ho ? 1 : 0 });
    }

    // "Debit Note" (Customer Charges): lô hàng MỚI tạo -> tự copy 1 LẦN từ Cost vừa lưu ở trên
    // sang shipment_customer_charges (xem ghi chú ở schema.sql). Sau lần copy này, 2 bên độc lập
    // hoàn toàn — sửa Cost về sau (route PUT bên dưới) KHÔNG đụng tới bảng này nữa.
    copyChargesToCustomerCharges(shipmentId, insertedCharges);

    // v3: "Cước dịch vụ" và "Chi hộ" tự sinh 2 phiếu thu ĐỘC LẬP, mỗi phiếu đúng số tiền phần
    // mình (xem regenerateAutoVouchers) — KHÔNG còn dùng cuoc_dv nhập tay.
    const customerName = db.prepare(`SELECT name FROM customers WHERE id = ?`).get(customer_id)?.name;
    const { dichVu, chiHo } = sumCustomerChargesByType(shipmentId);
    regenerateAutoVouchers(shipmentId, {
      soToKhai: so_to_khai, customerId: customer_id, customerName, maLo: ma_lo, ngayCt: ngayCtHieuLuc,
      dichVuAmount: dichVu, cuocPaymentMethodId: cuoc_payment_method_id, cuocThuNgay: !!cuoc_thu_ngay,
      chiHoAmount: chiHo, chiHoPaymentMethodId: chi_ho_payment_method_id, chiHoThuNgay: !!chi_ho_thu_ngay,
      charges,
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
    so_container, so_luong_cont, cuoc_dv, ghi_chu, status, po,
    cuoc_payment_method_id, cuoc_thu_ngay,
    chi_ho_payment_method_id, chi_ho_thu_ngay, charges = [],
  } = req.body;

  const ngayCtHieuLuc = ngay_ct || ngay_to_khai || null;

  const trx = db.transaction(() => {
    db.prepare(
      `UPDATE shipments SET ngay_ct=?, customer_id=?, invoice=?, so_to_khai=?, ngay_to_khai=?,
       so_container=?, so_luong_cont=?, cuoc_dv=?, ghi_chu=?, status=?, po=?, cuoc_payment_method_id=?, cuoc_thu_ngay=?,
       chi_ho_payment_method_id=?, chi_ho_thu_ngay=?, updated_at=datetime('now')
       WHERE id=?`
    ).run(
      ngayCtHieuLuc, customer_id, invoice || null, so_to_khai || null, ngay_to_khai || null,
      so_container || null, so_luong_cont || null, cuoc_dv || 0, ghi_chu || null,
      status || 'hoan_thanh', po || null, cuoc_payment_method_id || null, cuoc_thu_ngay ? 1 : 0,
      chi_ho_payment_method_id || null, chi_ho_thu_ngay ? 1 : 0, req.params.id
    );

    // Các dòng chi phí ĐÃ CÓ SẴN từ trước (Senior chỉ sửa lại giá trị) thì KHÔNG đụng tới Customer
    // Charges tương ứng — giữ đúng nguyên tắc "copy 1 lần, sau đó độc lập hoàn toàn". NHƯNG nếu
    // Senior THÊM DÒNG CHI PHÍ MỚI (vd "Phí vận chuyển") khi Sửa lô hàng, dòng đó chưa từng được
    // copy sang Customer Charges lần nào — Debit Note phải tự sinh thêm dòng tương ứng NGAY, giống
    // hệt hành vi lúc Tạo lô hàng lần đầu (trước đây bug này khiến Senior phải tự vào tab Debit Note
    // để thêm tay dòng mới). Do bảng shipment_charges được xoá/tạo lại toàn bộ mỗi lần Lưu (id mới
    // hoàn toàn mỗi lần), backend không thể tự suy ra dòng nào "mới" chỉ dựa vào id — nên dựa vào cờ
    // `is_new_charge` mà Frontend tự đánh dấu (dòng KHÔNG có `id` cũ khi gửi lên, tức Senior vừa bấm
    // "Thêm dòng chi phí" trong lần sửa này, không phải dòng tải sẵn từ server).
    db.prepare(`DELETE FROM shipment_charges WHERE shipment_id = ?`).run(req.params.id);
    const insCharge = db.prepare(
      `INSERT INTO shipment_charges (shipment_id, ngay_ct, loai_phi, supplier_id, payment_method_id, so_tien, da_thanh_toan, la_chi_ho, ghi_chu)
       VALUES (?,?,?,?,?,?,?,?,?)`
    );
    const newlyAddedCharges = [];
    for (const c of charges) {
      const chargeInfo = insCharge.run(
        req.params.id, c.ngay_ct || ngayCtHieuLuc, c.loai_phi || null,
        c.supplier_id || null, c.payment_method_id || null,
        c.so_tien || 0, c.da_thanh_toan ? 1 : 0, c.la_chi_ho ? 1 : 0, c.ghi_chu || null
      );
      if (c.is_new_charge) {
        newlyAddedCharges.push({
          id: chargeInfo.lastInsertRowid, loai_phi: c.loai_phi, so_tien: c.so_tien || 0,
          la_chi_ho: c.la_chi_ho ? 1 : 0,
        });
      }
    }
    if (newlyAddedCharges.length > 0) {
      const maxSttRow = db
        .prepare(`SELECT COALESCE(MAX(stt), 0) as maxStt FROM shipment_customer_charges WHERE shipment_id = ?`)
        .get(req.params.id);
      copyChargesToCustomerCharges(req.params.id, newlyAddedCharges, maxSttRow?.maxStt || 0);
    }

    // v3: xoá/tạo lại phiếu tự sinh theo dữ liệu vừa lưu (xem ghi chú ở regenerateAutoVouchers).
    // shipment_customer_charges KHÔNG bị đụng ở route PUT này (độc lập với Cost) nên số tiền mỗi
    // phiếu thu lấy đúng phần Dịch vụ / Chi hộ hiện có của lô hàng — Single Source of Truth.
    const ma_lo = db.prepare(`SELECT ma_lo FROM shipments WHERE id = ?`).get(req.params.id)?.ma_lo;
    const customerName = db.prepare(`SELECT name FROM customers WHERE id = ?`).get(customer_id)?.name;
    const { dichVu, chiHo } = sumCustomerChargesByType(req.params.id);
    regenerateAutoVouchers(req.params.id, {
      soToKhai: so_to_khai, customerId: customer_id, customerName, maLo: ma_lo, ngayCt: ngayCtHieuLuc,
      dichVuAmount: dichVu, cuocPaymentMethodId: cuoc_payment_method_id, cuocThuNgay: !!cuoc_thu_ngay,
      chiHoAmount: chiHo, chiHoPaymentMethodId: chi_ho_payment_method_id, chiHoThuNgay: !!chi_ho_thu_ngay,
      charges,
    });
  });
  trx();
  res.json(getShipmentFull(req.params.id));
});

// ================= TAB "DEBIT NOTE" / CUSTOMER CHARGES =================
// GET: trả về danh sách dòng thu khách của lô hàng. Nếu lô hàng chưa có dòng nào (ví dụ lô hàng
// tạo trước khi có tính năng này) mà đã có Cost -> tự copy 1 lần (lazy copy) rồi trả về, đúng
// nghiệp vụ "khi mở tab Debit Note lần đầu, hệ thống sẽ copy toàn bộ dòng từ tab Chi phí sang".
router.get('/:id/customer-charges', (req, res) => {
  const shipmentId = req.params.id;
  let rows = db
    .prepare(`SELECT * FROM shipment_customer_charges WHERE shipment_id = ? ORDER BY stt, id`)
    .all(shipmentId);
  if (rows.length === 0) {
    const charges = db.prepare(`SELECT * FROM shipment_charges WHERE shipment_id = ? ORDER BY id`).all(shipmentId);
    if (charges.length > 0) {
      copyChargesToCustomerCharges(shipmentId, charges);
      rows = db
        .prepare(`SELECT * FROM shipment_customer_charges WHERE shipment_id = ? ORDER BY stt, id`)
        .all(shipmentId);
    }
  }
  res.json(withCustomerChargeTotals(rows));
});

// PUT: lưu lại toàn bộ dòng Customer Charges đã sửa (thêm/sửa/xoá dòng tự do) — xoá hết rồi tạo
// lại theo đúng thứ tự gửi lên, cùng cách làm với shipment_charges. ĐỘC LẬP hoàn toàn với Cost —
// route này không đọc/ghi gì vào shipment_charges.
router.put('/:id/customer-charges', (req, res) => {
  const { lines = [] } = req.body;
  const shipmentId = req.params.id;
  const trx = db.transaction(() => {
    db.prepare(`DELETE FROM shipment_customer_charges WHERE shipment_id = ?`).run(shipmentId);
    const insert = db.prepare(
      `INSERT INTO shipment_customer_charges (shipment_id, stt, source_charge_id, mo_ta, don_vi_tinh, so_luong, don_gia, vat_percent, charge_type, ghi_chu)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    );
    lines.forEach((l, idx) => {
      insert.run(
        shipmentId, idx + 1, l.source_charge_id || null, l.mo_ta || '', l.don_vi_tinh || null,
        l.so_luong ?? 1, l.don_gia ?? 0, l.vat_percent === '' || l.vat_percent === undefined ? null : l.vat_percent,
        normalizeChargeType(l.charge_type), l.ghi_chu || null
      );
    });
  });
  trx();
  const rows = db
    .prepare(`SELECT * FROM shipment_customer_charges WHERE shipment_id = ? ORDER BY stt, id`)
    .all(shipmentId);
  res.json(withCustomerChargeTotals(rows));
});

// ================= SAO CHÉP LÔ HÀNG =================
// Tạo 1 lô hàng MỚI (mã lô mới tự sinh) với toàn bộ thông tin sao chép từ lô hàng nguồn: các
// trường Thông tin chung, toàn bộ dòng "Chi phí" (tab Cost) và toàn bộ dòng "Debit Note (thu
// khách)" hiện có (tab Customer Charges — copy trực tiếp, KHÔNG suy luận lại từ Cost, vì 2 bên có
// thể đã bị Senior sửa khác đi sau lần copy đầu). Reset các cờ "Đã thu?"/"Đã thanh toán?" về false
// và Trạng thái về "nhap" (nháp) cho lô hàng mới — vì đây là 1 phiếu MỚI, chưa thực sự có phát sinh
// thu/chi tiền, tránh vô tình tự sinh phiếu thu/chi trùng với lô hàng gốc. Ngày chứng từ mặc định
// = hôm nay (Senior có thể tự sửa lại ngay ở màn Sửa lô hàng vừa tạo).
router.post('/:id/duplicate', (req, res) => {
  const source = getShipmentFull(req.params.id);
  if (!source) return res.status(404).json({ error: 'Không tìm thấy lô hàng để sao chép' });

  const todayStr = new Date().toISOString().slice(0, 10);

  const trx = db.transaction(() => {
    const ma_lo = nextCode('LO', 'shipments', 'ma_lo');
    const info = db
      .prepare(
        `INSERT INTO shipments
         (ma_lo, ngay_ct, customer_id, invoice, so_to_khai, ngay_to_khai, so_container, so_luong_cont, cuoc_dv, ghi_chu, status, po, cuoc_payment_method_id, cuoc_thu_ngay, chi_ho_payment_method_id, chi_ho_thu_ngay)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        ma_lo, todayStr, source.customer_id, source.invoice || null, source.so_to_khai || null,
        source.ngay_to_khai || null, source.so_container || null, source.so_luong_cont || null,
        0, source.ghi_chu || null, 'nhap', source.po || null,
        source.cuoc_payment_method_id || null, 0,
        source.chi_ho_payment_method_id || null, 0
      );
    const shipmentId = info.lastInsertRowid;

    const insCharge = db.prepare(
      `INSERT INTO shipment_charges (shipment_id, ngay_ct, loai_phi, supplier_id, payment_method_id, so_tien, da_thanh_toan, la_chi_ho, ghi_chu)
       VALUES (?,?,?,?,?,?,0,?,?)`
    );
    for (const c of source.charges) {
      insCharge.run(
        shipmentId, todayStr, c.loai_phi || null, c.supplier_id || null,
        c.payment_method_id || null, c.so_tien || 0, c.la_chi_ho ? 1 : 0, c.ghi_chu || null
      );
    }

    // Copy trực tiếp các dòng "Debit Note (thu khách)" hiện có của lô hàng nguồn (nếu đã từng mở
    // tab đó / đã tự lazy-copy) — KHÔNG copy lại từ Cost để giữ đúng số tiền Senior đã sửa riêng ở
    // đó. Nếu lô hàng nguồn CHƯA có dòng nào ở đây (chưa từng mở tab Debit Note), bỏ qua — lô hàng
    // mới sẽ tự lazy-copy từ Cost của chính nó khi Senior mở tab đó lần đầu, giống hành vi bình
    // thường của 1 lô hàng mới có Cost.
    const sourceCustomerCharges = db
      .prepare(`SELECT * FROM shipment_customer_charges WHERE shipment_id = ? ORDER BY stt, id`)
      .all(req.params.id);
    if (sourceCustomerCharges.length > 0) {
      const insCc = db.prepare(
        `INSERT INTO shipment_customer_charges (shipment_id, stt, source_charge_id, mo_ta, don_vi_tinh, so_luong, don_gia, vat_percent, charge_type, ghi_chu)
         VALUES (?,?,?,?,?,?,?,?,?,?)`
      );
      sourceCustomerCharges.forEach((l) => {
        insCc.run(shipmentId, l.stt, null, l.mo_ta, l.don_vi_tinh, l.so_luong, l.don_gia, l.vat_percent, l.charge_type, l.ghi_chu);
      });
    }

    return shipmentId;
  });

  const newId = trx();
  res.json(getShipmentFull(newId));
});

// ---- DELETE ----
router.delete('/:id', (req, res) => {
  db.prepare(`DELETE FROM shipments WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
