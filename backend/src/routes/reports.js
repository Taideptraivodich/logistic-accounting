const express = require('express');
const db = require('../db');
const router = express.Router();

// ================= CÔNG NỢ KHÁCH HÀNG =================
// Phải thu = cước dịch vụ (doanh thu) + các khoản CHI HỘ (sc.la_chi_ho = 1) của lô hàng KH đó.
// Đã thu = tổng phiếu thu. Còn nợ = Phải thu - Đã thu.
router.get('/cong-no-kh', (req, res) => {
  const { q } = req.query;
  let customers = db.prepare(`SELECT id, name FROM customers ORDER BY name`).all();
  if (q) {
    const like = q.toLowerCase();
    customers = customers.filter((c) => c.name.toLowerCase().includes(like));
  }
  const result = customers.map((c) => {
    const cuoc_dv =
      db.prepare(`SELECT COALESCE(SUM(cuoc_dv),0) as t FROM shipments WHERE customer_id = ?`).get(c.id).t || 0;
    const chi_ho =
      db
        .prepare(
          `SELECT COALESCE(SUM(sc.so_tien),0) as t
           FROM shipment_charges sc JOIN shipments s ON s.id = sc.shipment_id
           WHERE s.customer_id = ? AND sc.la_chi_ho = 1`
        )
        .get(c.id).t || 0;
    const chi_ho_theo_loai = db
      .prepare(
        `SELECT COALESCE(sc.loai_phi, '(Khác)') as loai_phi, SUM(sc.so_tien) as so_tien
         FROM shipment_charges sc JOIN shipments s ON s.id = sc.shipment_id
         WHERE s.customer_id = ? AND sc.la_chi_ho = 1
         GROUP BY COALESCE(sc.loai_phi, '(Khác)')`
      )
      .all(c.id);
    const da_thu =
      db.prepare(`SELECT COALESCE(SUM(so_tien),0) as t FROM customer_receipts WHERE customer_id = ?`).get(c.id).t || 0;
    const phai_thu = cuoc_dv + chi_ho;
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
        (s.cuoc_dv + COALESCE((SELECT SUM(so_tien) FROM shipment_charges WHERE shipment_id = s.id AND la_chi_ho = 1), 0)) as phai_thu,
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
      `SELECT COALESCE(NULLIF(s.ngay_ct, ''), NULLIF(s.ngay_to_khai, '')) as ngay_hieu_luc, s.cuoc_dv,
        COALESCE((SELECT SUM(so_tien) FROM shipment_charges WHERE shipment_id = s.id AND la_chi_ho = 1), 0) as chi_ho
       FROM shipments s
       WHERE s.customer_id = ?
       ORDER BY ngay_hieu_luc`
    )
    .all(customer_id);

  const monthMap = new Map();
  for (const s of shipmentRows) {
    const key = (s.ngay_hieu_luc || '').slice(0, 7); // YYYY-MM
    if (key.length !== 7) {
      // Không có cả ngày chứng từ lẫn ngày tờ khai -> gom vào nhóm "Chưa xác định ngày"
      const k = '__no_date__';
      if (!monthMap.has(k)) monthMap.set(k, { cuoc: 0, chi_ho: 0 });
      const m = monthMap.get(k);
      m.cuoc += s.cuoc_dv || 0;
      m.chi_ho += s.chi_ho || 0;
      continue;
    }
    if (!monthMap.has(key)) monthMap.set(key, { cuoc: 0, chi_ho: 0 });
    const m = monthMap.get(key);
    m.cuoc += s.cuoc_dv || 0;
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
router.get('/so-quy', (req, res) => {
  const methods = db.prepare(`SELECT * FROM payment_methods ORDER BY name`).all();
  const result = methods.map((pm) => {
    const thu =
      db
        .prepare(`SELECT COALESCE(SUM(so_tien),0) as t FROM customer_receipts WHERE payment_method_id = ?`)
        .get(pm.id).t || 0;
    // Lưu ý: khi chi phí lô hàng được đánh dấu "đã thanh toán", hệ thống tự sinh
    // 1 bản ghi trong supplier_payments — nên chỉ cần tính tổng từ supplier_payments
    // để tránh đếm trùng với shipment_charges.
    const chi =
      db
        .prepare(`SELECT COALESCE(SUM(so_tien),0) as t FROM supplier_payments WHERE payment_method_id = ?`)
        .get(pm.id).t || 0;
    return {
      ...pm,
      thu,
      chi,
      ton_cuoi: pm.opening_balance + thu - chi,
    };
  });
  res.json(result);
});

router.get('/so-quy/:pm_id/chi-tiet', (req, res) => {
  const { pm_id } = req.params;
  const receipts = db
    .prepare(
      `SELECT r.id, r.so_ct, r.ngay_ct, c.name as doi_tuong, r.ghi_chu, r.so_tien as thu, 0 as chi
       FROM customer_receipts r LEFT JOIN customers c ON c.id = r.customer_id
       WHERE r.payment_method_id = ?`
    )
    .all(pm_id);
  const payments = db
    .prepare(
      `SELECT p.id, p.so_ct, p.ngay_ct, sup.name as doi_tuong, p.ghi_chu, 0 as thu, p.so_tien as chi
       FROM supplier_payments p LEFT JOIN suppliers sup ON sup.id = p.supplier_id
       WHERE p.payment_method_id = ?`
    )
    .all(pm_id);
  const all = [...receipts, ...payments].sort((a, b) =>
    (a.ngay_ct || '').localeCompare(b.ngay_ct || '')
  );
  const pm = db.prepare(`SELECT * FROM payment_methods WHERE id = ?`).get(pm_id);
  let running = pm ? pm.opening_balance : 0;
  const withRunning = all.map((r) => {
    running += r.thu - r.chi;
    return { ...r, ton_cuoi: running };
  });
  res.json(withRunning);
});

// ================= DOANH THU (theo lô hàng) =================
// Doanh thu = cước dịch vụ (cuoc_dv) + các khoản CHI HỘ (phải thu lại từ khách).
// Chi phí = toàn bộ shipment_charges (kể cả phần chi hộ, vì tiền đã thực chi ra cho NCC/HQ).
// Lợi nhuận = Doanh thu - Chi phí (phần chi hộ tự triệt tiêu nếu thu đúng bằng số đã chi hộ).
router.get('/doanh-thu', (req, res) => {
  const { from, to, q } = req.query;
  let sql = `
    SELECT s.id, s.ma_lo, s.ngay_ct, c.name as customer_name, s.invoice,
      s.so_to_khai, s.ngay_to_khai, s.so_container, s.so_luong_cont,
      s.cuoc_dv,
      COALESCE((SELECT SUM(so_tien) FROM shipment_charges WHERE shipment_id = s.id), 0) as chi_phi,
      COALESCE((SELECT SUM(so_tien) FROM shipment_charges WHERE shipment_id = s.id AND la_chi_ho = 1), 0) as chi_ho
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

  // Lấy breakdown chi phí theo TỪNG loại phí cho mỗi lô hàng (giống bố cục file Excel gốc:
  // mỗi loại phí 1 cột riêng, ví dụ Chi hải quan / Phí nâng / Phí hạ / Thuế / Lệ phí ...).
  const shipmentIds = rows.map((r) => r.id);
  const byTypeMap = new Map(); // shipment_id -> { loai_phi: so_tien }
  const feeTypeSet = new Set();
  if (shipmentIds.length) {
    const placeholders = shipmentIds.map(() => '?').join(',');
    const chargeRows = db
      .prepare(
        `SELECT shipment_id, COALESCE(NULLIF(loai_phi, ''), '(Khác)') as loai_phi, SUM(so_tien) as so_tien
         FROM shipment_charges WHERE shipment_id IN (${placeholders})
         GROUP BY shipment_id, COALESCE(NULLIF(loai_phi, ''), '(Khác)')`
      )
      .all(...shipmentIds);
    for (const c of chargeRows) {
      feeTypeSet.add(c.loai_phi);
      if (!byTypeMap.has(c.shipment_id)) byTypeMap.set(c.shipment_id, {});
      byTypeMap.get(c.shipment_id)[c.loai_phi] = c.so_tien || 0;
    }
  }
  // Sắp xếp cột loại phí theo đúng thứ tự trong danh mục "Loại phí" (nếu có), phần còn lại xếp sau.
  const feeTypeOrder = db.prepare(`SELECT name FROM fee_types ORDER BY name`).all().map((f) => f.name);
  const fee_types = [...feeTypeOrder.filter((f) => feeTypeSet.has(f)), ...[...feeTypeSet].filter((f) => !feeTypeOrder.includes(f))];

  const result = rows.map((r) => {
    const doanh_thu = (r.cuoc_dv || 0) + (r.chi_ho || 0);
    return { ...r, by_type: byTypeMap.get(r.id) || {}, doanh_thu, loi_nhuan: doanh_thu - r.chi_phi };
  });
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
  const cuocDvTotal = db.prepare(`SELECT COALESCE(SUM(cuoc_dv),0) as t FROM shipments`).get().t || 0;
  const chiHoTotal =
    db.prepare(`SELECT COALESCE(SUM(so_tien),0) as t FROM shipment_charges WHERE la_chi_ho = 1`).get().t || 0;
  const doanhThu = cuocDvTotal + chiHoTotal;
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
