const express = require('express');
const db = require('../db');
const { revenueExpr, disbursementExpr } = require('../utils/revenue');
const router = express.Router();

// ================= CÔNG NỢ KHÁCH HÀNG =================
// Phải thu = SUM(Customer Charges) của toàn bộ lô hàng thuộc khách hàng đó — Single Source of Truth
// doanh thu (xem utils/revenue.js), KHÔNG còn đọc shipments.cuoc_dv. "Cước dịch vụ" (cuoc_dv) và
// "Chi hộ" (chi_ho) bên dưới là 2 breakdown của cùng SUM này theo Charge Type (charge_type khác
// DISBURSEMENT vs = DISBURSEMENT) — cộng lại đúng bằng Phải thu, không phải 2 nguồn số riêng biệt.
// Đã thu = tổng phiếu thu. Còn nợ = Phải thu - Đã thu.
router.get('/cong-no-kh', (req, res) => {
  const { q } = req.query;
  let customers = db.prepare(`SELECT id, name FROM customers ORDER BY name`).all();
  if (q) {
    const like = q.toLowerCase();
    customers = customers.filter((c) => c.name.toLowerCase().includes(like));
  }
  const result = customers.map((c) => {
    const phai_thu =
      db
        .prepare(`SELECT COALESCE(SUM(${revenueExpr('s.id')}),0) as t FROM shipments s WHERE s.customer_id = ?`)
        .get(c.id).t || 0;
    const chi_ho =
      db
        .prepare(`SELECT COALESCE(SUM(${disbursementExpr('s.id')}),0) as t FROM shipments s WHERE s.customer_id = ?`)
        .get(c.id).t || 0;
    const cuoc_dv = phai_thu - chi_ho;
    // Breakdown "Chi hộ" theo mô tả (mo_ta) trong Customer Charges — thay cho loai_phi của
    // shipment_charges cũ, đúng nguyên tắc "mọi báo cáo đọc từ Customer Charges".
    const chi_ho_theo_loai = db
      .prepare(
        `SELECT COALESCE(NULLIF(scc.mo_ta, ''), '(Khác)') as loai_phi, SUM(scc.don_gia * scc.so_luong) as so_tien
         FROM shipment_customer_charges scc JOIN shipments s ON s.id = scc.shipment_id
         WHERE s.customer_id = ? AND scc.charge_type = 'DISBURSEMENT'
         GROUP BY COALESCE(NULLIF(scc.mo_ta, ''), '(Khác)')`
      )
      .all(c.id);
    const da_thu =
      db.prepare(`SELECT COALESCE(SUM(so_tien),0) as t FROM customer_receipts WHERE customer_id = ?`).get(c.id).t || 0;
    return {
      id: c.id,
      name: c.name,
      cuoc_dv,
      chi_ho,
      chi_ho_theo_loai,
      phai_thu,
      da_thu,
      con_no: phai_thu - da_thu,
    };
  });
  res.json(result);
});

// Ledger giao dịch (từng lô hàng / từng phiếu thu) theo thứ tự thời gian
router.get('/cong-no-kh/:customer_id/chi-tiet', (req, res) => {
  const { customer_id } = req.params;
  const shipments = db
    .prepare(
      `SELECT s.id, s.ma_lo, s.ngay_ct, s.invoice,
        ${revenueExpr('s.id')} as phai_thu,
        'lo_hang' as loai
       FROM shipments s WHERE s.customer_id = ?`
    )
    .all(customer_id);
  const receipts = db
    .prepare(
      `SELECT id, so_ct as ma_lo, ngay_ct, ghi_chu as invoice, -so_tien as phai_thu, 'phieu_thu' as loai
       FROM customer_receipts WHERE customer_id = ?`
    )
    .all(customer_id);
  const all = [...shipments, ...receipts].sort((a, b) =>
    (a.ngay_ct || '').localeCompare(b.ngay_ct || '')
  );
  let running = 0;
  const withRunning = all.map((r) => {
    running += r.phai_thu;
    return { ...r, ton_cuoi: running };
  });
  res.json(withRunning);
});

// Bảng công nợ theo THÁNG PHÁT SINH, trừ nợ cuốn chiếu từ tháng cũ nhất xuống bằng tổng các
// phiếu thu đã có (không gắn theo lô hàng cụ thể) — giống mẫu Excel gốc.
router.get('/cong-no-kh/:customer_id/theo-thang', (req, res) => {
  const { customer_id } = req.params;
  const customer = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(customer_id);
  if (!customer) return res.status(404).json({ error: 'Không tìm thấy khách hàng' });

  // Lưu ý: nếu Senior lỡ không nhập "Ngày chứng từ" khi tạo lô hàng, dùng "Ngày tờ khai"
  // làm ngày phát sinh dự phòng — tránh trường hợp lô hàng bị "biến mất" khỏi bảng công nợ
  // theo tháng chỉ vì thiếu ngày chứng từ.
  const shipmentRows = db
    .prepare(
      `SELECT COALESCE(NULLIF(s.ngay_ct, ''), NULLIF(s.ngay_to_khai, '')) as ngay_hieu_luc,
        ${revenueExpr('s.id')} as revenue_total,
        ${disbursementExpr('s.id')} as chi_ho
       FROM shipments s
       WHERE s.customer_id = ?
       ORDER BY ngay_hieu_luc`
    )
    .all(customer_id);

  const monthMap = new Map();
  for (const s of shipmentRows) {
    const cuoc = (s.revenue_total || 0) - (s.chi_ho || 0);
    const key = (s.ngay_hieu_luc || '').slice(0, 7); // YYYY-MM
    if (key.length !== 7) {
      // Không có cả ngày chứng từ lẫn ngày tờ khai -> gom vào nhóm "Chưa xác định ngày"
      const k = '__no_date__';
      if (!monthMap.has(k)) monthMap.set(k, { cuoc: 0, chi_ho: 0 });
      const m = monthMap.get(k);
      m.cuoc += cuoc;
      m.chi_ho += s.chi_ho || 0;
      continue;
    }
    if (!monthMap.has(key)) monthMap.set(key, { cuoc: 0, chi_ho: 0 });
    const m = monthMap.get(key);
    m.cuoc += cuoc;
    m.chi_ho += s.chi_ho || 0;
  }
  const months = [...monthMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, v]) => {
      const nhan =
        key === '__no_date__' ? 'Chưa xác định ngày' : `Tháng ${key.split('-')[1]}/${key.slice(2, 4)}`;
      return { key, nhan, cuoc: v.cuoc, chi_ho: v.chi_ho, phat_sinh: v.cuoc + v.chi_ho };
    });

  const tong_da_thu =
    db.prepare(`SELECT COALESCE(SUM(so_tien),0) as t FROM customer_receipts WHERE customer_id = ?`).get(customer_id).t ||
    0;

  let pool = tong_da_thu;
  let tong_phai_thu = 0;
  const noteMap = new Map(
    db
      .prepare(`SELECT month_key, ghi_chu, la_no_xau FROM cong_no_notes WHERE doi_tuong_type = 'kh' AND doi_tuong_id = ?`)
      .all(customer_id)
      .map((n) => [n.month_key, n])
  );
  const rows = months.map((m) => {
    const da_thu = Math.min(pool, m.phat_sinh);
    pool -= da_thu;
    tong_phai_thu += m.phat_sinh;
    const note = noteMap.get(m.key);
    return {
      ...m,
      da_thu,
      con_no: m.phat_sinh - da_thu,
      ghi_chu: note?.ghi_chu || '',
      la_no_xau: !!note?.la_no_xau,
    };
  });

  const receipts = db
    .prepare(
      `SELECT so_ct, ngay_ct, so_tien, ghi_chu FROM customer_receipts WHERE customer_id = ? ORDER BY ngay_ct, id`
    )
    .all(customer_id);

  res.json({
    customer_id: Number(customer_id),
    customer_name: customer.name,
    rows,
    tong_phai_thu,
    tong_da_thu,
    tong_con_no: tong_phai_thu - tong_da_thu,
    receipts,
  });
});

// Lưu ghi chú / đánh dấu "nợ xấu" cho 1 dòng tháng phát sinh trong bảng công nợ KH — kiểu Excel
// (Senior gõ chú thích tự do như "TT tiền hàng + chi hộ ngày 14/01/2026").
router.put('/cong-no-kh/:customer_id/notes/:month_key', (req, res) => {
  const { customer_id, month_key } = req.params;
  const { ghi_chu, la_no_xau } = req.body;
  db.prepare(
    `INSERT INTO cong_no_notes (doi_tuong_type, doi_tuong_id, month_key, ghi_chu, la_no_xau)
     VALUES ('kh', ?, ?, ?, ?)
     ON CONFLICT(doi_tuong_type, doi_tuong_id, month_key) DO UPDATE SET ghi_chu = excluded.ghi_chu, la_no_xau = excluded.la_no_xau`
  ).run(customer_id, month_key, ghi_chu || null, la_no_xau ? 1 : 0);
  res.json({ ok: true });
});

// ================= CÔNG NỢ NHÀ CUNG CẤP =================
// Phải trả = tổng shipment_charges gắn NCC. Đã trả = tổng phiếu chi NCC. Còn nợ = Phải trả - Đã trả
router.get('/cong-no-ncc', (req, res) => {
  const { q } = req.query;
  let sql = `SELECT s.id, s.name,
        COALESCE((SELECT SUM(so_tien) FROM shipment_charges WHERE supplier_id = s.id), 0) as phai_tra,
        COALESCE((SELECT SUM(so_tien) FROM shipment_charges WHERE supplier_id = s.id AND la_chi_ho = 1), 0) as chi_ho,
        COALESCE((SELECT SUM(so_tien) FROM supplier_payments WHERE supplier_id = s.id), 0) as da_tra
       FROM suppliers s`;
  const params = [];
  if (q) {
    sql += ' WHERE s.name LIKE ?';
    params.push(`%${q}%`);
  }
  sql += ' ORDER BY s.name';
  const rows = db.prepare(sql).all(...params);
  res.json(
    rows.map((r) => ({
      ...r,
      cuoc_van_chuyen: r.phai_tra - r.chi_ho, // cước vận chuyển / phí thường (không phải chi hộ)
      con_no: r.phai_tra - r.da_tra,
    }))
  );
});

router.get('/cong-no-ncc/:supplier_id/chi-tiet', (req, res) => {
  const { supplier_id } = req.params;
  const charges = db
    .prepare(
      `SELECT sc.id, s.ma_lo, sc.ngay_ct, sc.loai_phi, sc.so_tien as phai_tra, 'chi_phi' as loai
       FROM shipment_charges sc
       LEFT JOIN shipments s ON s.id = sc.shipment_id
       WHERE sc.supplier_id = ?`
    )
    .all(supplier_id);
  const payments = db
    .prepare(
      `SELECT p.id, p.so_ct as ma_lo, p.ngay_ct, p.ghi_chu as loai_phi, -p.so_tien as phai_tra, 'phieu_chi' as loai
       FROM supplier_payments p WHERE p.supplier_id = ?`
    )
    .all(supplier_id);
  const all = [...charges, ...payments].sort((a, b) =>
    (a.ngay_ct || '').localeCompare(b.ngay_ct || '')
  );
  let running = 0;
  const withRunning = all.map((r) => {
    running += r.phai_tra;
    return { ...r, ton_cuoi: running };
  });
  res.json(withRunning);
});

// Bảng công nợ NCC theo THÁNG PHÁT SINH, trừ cuốn chiếu bằng tổng phiếu chi đã có — tương tự KH
router.get('/cong-no-ncc/:supplier_id/theo-thang', (req, res) => {
  const { supplier_id } = req.params;
  const supplier = db.prepare(`SELECT * FROM suppliers WHERE id = ?`).get(supplier_id);
  if (!supplier) return res.status(404).json({ error: 'Không tìm thấy nhà cung cấp' });

  // Dự phòng: nếu dòng chi phí thiếu ngày chứng từ riêng, lấy ngày chứng từ / ngày tờ khai
  // của lô hàng gắn kèm, để không bị rơi mất khỏi bảng công nợ theo tháng.
  const chargeRows = db
    .prepare(
      `SELECT COALESCE(
          NULLIF(sc.ngay_ct, ''), NULLIF(s.ngay_ct, ''), NULLIF(s.ngay_to_khai, '')
        ) as ngay_hieu_luc, sc.so_tien, sc.la_chi_ho
       FROM shipment_charges sc
       LEFT JOIN shipments s ON s.id = sc.shipment_id
       WHERE sc.supplier_id = ?
       ORDER BY ngay_hieu_luc`
    )
    .all(supplier_id);

  const monthMap = new Map();
  for (const c of chargeRows) {
    const key = (c.ngay_hieu_luc || '').length === 7 ? c.ngay_hieu_luc.slice(0, 7) : (c.ngay_hieu_luc || '').slice(0, 7);
    const finalKey = key.length === 7 ? key : '__no_date__';
    if (!monthMap.has(finalKey)) monthMap.set(finalKey, { cuoc_van_chuyen: 0, chi_ho: 0 });
    const m = monthMap.get(finalKey);
    if (c.la_chi_ho) m.chi_ho += c.so_tien || 0;
    else m.cuoc_van_chuyen += c.so_tien || 0;
  }
  const months = [...monthMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, v]) => {
      const nhan =
        key === '__no_date__' ? 'Chưa xác định ngày' : `Tháng ${key.split('-')[1]}/${key.slice(2, 4)}`;
      return { key, nhan, cuoc_van_chuyen: v.cuoc_van_chuyen, chi_ho: v.chi_ho, phat_sinh: v.cuoc_van_chuyen + v.chi_ho };
    });

  const tong_da_tra =
    db.prepare(`SELECT COALESCE(SUM(so_tien),0) as t FROM supplier_payments WHERE supplier_id = ?`).get(supplier_id)
      .t || 0;

  let pool = tong_da_tra;
  let tong_phai_tra = 0;
  const noteMapNcc = new Map(
    db
      .prepare(`SELECT month_key, ghi_chu, la_no_xau FROM cong_no_notes WHERE doi_tuong_type = 'ncc' AND doi_tuong_id = ?`)
      .all(supplier_id)
      .map((n) => [n.month_key, n])
  );
  const rows = months.map((m) => {
    const da_tra = Math.min(pool, m.phat_sinh);
    pool -= da_tra;
    tong_phai_tra += m.phat_sinh;
    const note = noteMapNcc.get(m.key);
    return {
      ...m,
      da_tra,
      con_no: m.phat_sinh - da_tra,
      ghi_chu: note?.ghi_chu || '',
      la_no_xau: !!note?.la_no_xau,
    };
  });

  const payments = db
    .prepare(
      `SELECT so_ct, ngay_ct, so_tien, ghi_chu FROM supplier_payments WHERE supplier_id = ? ORDER BY ngay_ct, id`
    )
    .all(supplier_id);

  res.json({
    supplier_id: Number(supplier_id),
    supplier_name: supplier.name,
    rows,
    tong_phai_tra,
    tong_da_tra,
    tong_con_no: tong_phai_tra - tong_da_tra,
    payments,
  });
});

// Lưu ghi chú / đánh dấu "nợ xấu" cho 1 dòng tháng phát sinh trong bảng công nợ NCC.
router.put('/cong-no-ncc/:supplier_id/notes/:month_key', (req, res) => {
  const { supplier_id, month_key } = req.params;
  const { ghi_chu, la_no_xau } = req.body;
  db.prepare(
    `INSERT INTO cong_no_notes (doi_tuong_type, doi_tuong_id, month_key, ghi_chu, la_no_xau)
     VALUES ('ncc', ?, ?, ?, ?)
     ON CONFLICT(doi_tuong_type, doi_tuong_id, month_key) DO UPDATE SET ghi_chu = excluded.ghi_chu, la_no_xau = excluded.la_no_xau`
  ).run(supplier_id, month_key, ghi_chu || null, la_no_xau ? 1 : 0);
  res.json({ ok: true });
});

// ================= SỔ QUỸ (theo hình thức thanh toán) =================
// Hỗ trợ lọc theo khoảng ngày (?from=YYYY-MM-DD&to=YYYY-MM-DD), giống khung lọc "sao kê" ngân
// hàng. Khi có "from": "Đầu kỳ" = opening_balance (số dư gốc, nhập tay 1 lần trong Danh mục Quỹ)
// cộng dồn mọi phát sinh TRƯỚC ngày "from" — tức số dư luỹ kế tính đến ngay trước đầu kỳ đang xem.
// Khi KHÔNG lọc ngày (from/to rỗng): "Đầu kỳ" = opening_balance gốc, Tổng thu/chi = toàn bộ từ
// trước tới nay — giữ nguyên hành vi cũ (không phá vỡ màn hình hiện tại khi chưa dùng bộ lọc).
router.get('/so-quy', (req, res) => {
  const { from, to } = req.query;
  const methods = db.prepare(`SELECT * FROM payment_methods ORDER BY name`).all();
  const result = methods.map((pm) => {
    // Luỹ kế thu/chi trước "from" để dồn vào Đầu kỳ (bỏ qua nếu không lọc ngày).
    const thuTruocKy = from
      ? db.prepare(`SELECT COALESCE(SUM(so_tien),0) as t FROM customer_receipts WHERE payment_method_id = ? AND ngay_ct < ?`).get(pm.id, from).t || 0
      : 0;
    const chiTruocKy = from
      ? db.prepare(`SELECT COALESCE(SUM(so_tien),0) as t FROM supplier_payments WHERE payment_method_id = ? AND ngay_ct < ?`).get(pm.id, from).t || 0
      : 0;
    const dau_ky = pm.opening_balance + thuTruocKy - chiTruocKy;

    // Lưu ý (v2): khi chi phí lô hàng được đánh dấu "đã thanh toán" (hoặc cước được tick "đã thu"),
    // hệ thống tự sinh 1 bản ghi auto_generated=1 trong supplier_payments/customer_receipts (xem
    // regenerateAutoVouchers trong routes/shipments.js) — nên chỉ cần tính tổng từ 2 bảng này để
    // tránh đếm trùng với shipment_charges.
    let thuSql = `SELECT COALESCE(SUM(so_tien),0) as t FROM customer_receipts WHERE payment_method_id = ?`;
    let chiSql = `SELECT COALESCE(SUM(so_tien),0) as t FROM supplier_payments WHERE payment_method_id = ?`;
    const thuParams = [pm.id];
    const chiParams = [pm.id];
    if (from) { thuSql += ' AND ngay_ct >= ?'; chiSql += ' AND ngay_ct >= ?'; thuParams.push(from); chiParams.push(from); }
    if (to) { thuSql += ' AND ngay_ct <= ?'; chiSql += ' AND ngay_ct <= ?'; thuParams.push(to); chiParams.push(to); }
    const thu = db.prepare(thuSql).get(...thuParams).t || 0;
    const chi = db.prepare(chiSql).get(...chiParams).t || 0;

    return {
      ...pm,
      dau_ky,
      thu,
      chi,
      ton_cuoi: dau_ky + thu - chi,
    };
  });
  res.json(result);
});

router.get('/so-quy/:pm_id/chi-tiet', (req, res) => {
  const { pm_id } = req.params;
  const { from, to } = req.query;
  let receiptSql = `SELECT r.id, r.so_ct, r.ngay_ct, c.name as doi_tuong, r.ghi_chu, r.so_tien as thu, 0 as chi
       FROM customer_receipts r LEFT JOIN customers c ON c.id = r.customer_id
       WHERE r.payment_method_id = ?`;
  let paymentSql = `SELECT p.id, p.so_ct, p.ngay_ct, sup.name as doi_tuong, p.ghi_chu, 0 as thu, p.so_tien as chi
       FROM supplier_payments p LEFT JOIN suppliers sup ON sup.id = p.supplier_id
       WHERE p.payment_method_id = ?`;
  const receiptParams = [pm_id];
  const paymentParams = [pm_id];
  if (from) { receiptSql += ' AND r.ngay_ct >= ?'; paymentSql += ' AND p.ngay_ct >= ?'; receiptParams.push(from); paymentParams.push(from); }
  if (to) { receiptSql += ' AND r.ngay_ct <= ?'; paymentSql += ' AND p.ngay_ct <= ?'; receiptParams.push(to); paymentParams.push(to); }
  const receipts = db.prepare(receiptSql).all(...receiptParams);
  const payments = db.prepare(paymentSql).all(...paymentParams);
  const all = [...receipts, ...payments].sort((a, b) =>
    (a.ngay_ct || '').localeCompare(b.ngay_ct || '')
  );
  const pm = db.prepare(`SELECT * FROM payment_methods WHERE id = ?`).get(pm_id);
  // Đầu kỳ của chi tiết: giống hệt cách tính ở /so-quy (opening_balance + luỹ kế trước "from").
  const thuTruocKy = from && pm
    ? db.prepare(`SELECT COALESCE(SUM(so_tien),0) as t FROM customer_receipts WHERE payment_method_id = ? AND ngay_ct < ?`).get(pm_id, from).t || 0
    : 0;
  const chiTruocKy = from && pm
    ? db.prepare(`SELECT COALESCE(SUM(so_tien),0) as t FROM supplier_payments WHERE payment_method_id = ? AND ngay_ct < ?`).get(pm_id, from).t || 0
    : 0;
  const dau_ky = (pm ? pm.opening_balance : 0) + thuTruocKy - chiTruocKy;
  let running = dau_ky;
  const withRunning = all.map((r) => {
    running += r.thu - r.chi;
    return { ...r, ton_cuoi: running };
  });
  res.json({ dau_ky, rows: withRunning, ton_cuoi: running });
});

// ================= DOANH THU (theo lô hàng) =================
// Doanh thu = SUM(Customer Charges) — Single Source of Truth (xem utils/revenue.js). KHÔNG còn đọc
// shipments.cuoc_dv. Chi phí = toàn bộ shipment_charges (Supplier Costs — SSOT riêng cho khoản chi,
// không đổi). Lợi nhuận = Doanh thu - Chi phí.
router.get('/doanh-thu', (req, res) => {
  const { from, to, q } = req.query;
  let sql = `
    SELECT s.id, s.ma_lo, s.ngay_ct, c.name as customer_name, s.invoice,
      s.so_to_khai, s.ngay_to_khai, s.so_container, s.so_luong_cont,
      COALESCE((SELECT SUM(so_tien) FROM shipment_charges WHERE shipment_id = s.id), 0) as chi_phi,
      ${revenueExpr('s.id')} as doanh_thu,
      ${disbursementExpr('s.id')} as chi_ho
    FROM shipments s
    LEFT JOIN customers c ON c.id = s.customer_id
    WHERE 1=1`;
  const params = [];
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
  sql += ' ORDER BY s.ngay_ct, s.id';
  const rows = db.prepare(sql).all(...params);

  // Breakdown DOANH THU theo TỪNG khoản trong Customer Charges (giống bố cục file Excel gốc: mỗi
  // khoản 1 cột riêng) — thay cho breakdown CHI PHÍ theo loai_phi của shipment_charges cũ, đúng
  // nguyên tắc "mọi báo cáo doanh thu đọc từ Customer Charges, không đọc từ Shipment.service_fee".
  const shipmentIds = rows.map((r) => r.id);
  const byTypeMap = new Map(); // shipment_id -> { mo_ta: so_tien }
  const feeTypeSet = new Set();
  if (shipmentIds.length) {
    const placeholders = shipmentIds.map(() => '?').join(',');
    const chargeRows = db
      .prepare(
        `SELECT shipment_id, COALESCE(NULLIF(mo_ta, ''), '(Khác)') as mo_ta, SUM(don_gia * so_luong) as so_tien
         FROM shipment_customer_charges WHERE shipment_id IN (${placeholders})
         GROUP BY shipment_id, COALESCE(NULLIF(mo_ta, ''), '(Khác)')`
      )
      .all(...shipmentIds);
    for (const c of chargeRows) {
      feeTypeSet.add(c.mo_ta);
      if (!byTypeMap.has(c.shipment_id)) byTypeMap.set(c.shipment_id, {});
      byTypeMap.get(c.shipment_id)[c.mo_ta] = c.so_tien || 0;
    }
  }
  // Sắp xếp cột theo đúng thứ tự trong danh mục "Loại phí" (nếu tên trùng khớp), phần còn lại xếp sau.
  const feeTypeOrder = db.prepare(`SELECT name FROM fee_types ORDER BY name`).all().map((f) => f.name);
  const fee_types = [...feeTypeOrder.filter((f) => feeTypeSet.has(f)), ...[...feeTypeSet].filter((f) => !feeTypeOrder.includes(f))];

  const result = rows.map((r) => ({
    ...r,
    cuoc_dv: (r.doanh_thu || 0) - (r.chi_ho || 0),
    by_type: byTypeMap.get(r.id) || {},
    loi_nhuan: r.doanh_thu - r.chi_phi,
  }));
  const tong = result.reduce(
    (acc, r) => ({
      doanh_thu: acc.doanh_thu + r.doanh_thu,
      chi_phi: acc.chi_phi + r.chi_phi,
      loi_nhuan: acc.loi_nhuan + r.loi_nhuan,
    }),
    { doanh_thu: 0, chi_phi: 0, loi_nhuan: 0 }
  );
  res.json({ rows: result, fee_types, tong });
});

// ================= DASHBOARD TỔNG QUAN =================
router.get('/dashboard', (req, res) => {
  const soLoHang = db.prepare(`SELECT COUNT(*) as c FROM shipments`).get().c;
  // Doanh thu = SUM(Customer Charges) toàn hệ thống — Single Source of Truth (xem utils/revenue.js).
  // KHÔNG còn cộng shipments.cuoc_dv + shipment_charges.la_chi_ho như trước.
  const doanhThu =
    db.prepare(`SELECT COALESCE(SUM(${revenueExpr('s.id')}),0) as t FROM shipments s`).get().t || 0;
  const chiPhi = db.prepare(`SELECT COALESCE(SUM(so_tien),0) as t FROM shipment_charges`).get().t || 0;
  const daThuKH = db.prepare(`SELECT COALESCE(SUM(so_tien),0) as t FROM customer_receipts`).get().t || 0;
  const daTraNCC = db.prepare(`SELECT COALESCE(SUM(so_tien),0) as t FROM supplier_payments`).get().t || 0;
  const congNoKH = doanhThu - daThuKH;
  const congNoNCC = chiPhi - daTraNCC;

  // Tồn quỹ theo TỪNG sổ quỹ riêng biệt (không gộp chung, không đếm trùng — chỉ tính từ
  // customer_receipts/supplier_payments, xem lưu ý chống đếm trùng ở '/so-quy' phía trên).
  const methods = db.prepare(`SELECT * FROM payment_methods ORDER BY name`).all();
  const quy = methods.map((pm) => {
    const thu =
      db.prepare(`SELECT COALESCE(SUM(so_tien),0) as t FROM customer_receipts WHERE payment_method_id = ?`).get(pm.id)
        .t || 0;
    const chi =
      db.prepare(`SELECT COALESCE(SUM(so_tien),0) as t FROM supplier_payments WHERE payment_method_id = ?`).get(pm.id)
        .t || 0;
    return {
      id: pm.id,
      name: pm.name,
      opening_balance: pm.opening_balance,
      thu,
      chi,
      ton_cuoi: pm.opening_balance + thu - chi,
    };
  });
  const tonQuy = quy.reduce((a, q) => a + q.ton_cuoi, 0);

  res.json({
    so_lo_hang: soLoHang,
    doanh_thu: doanhThu,
    chi_phi: chiPhi,
    loi_nhuan: doanhThu - chiPhi,
    cong_no_kh: congNoKH,
    cong_no_ncc: congNoNCC,
    ton_quy: tonQuy,
    quy,
  });
});

module.exports = router;
