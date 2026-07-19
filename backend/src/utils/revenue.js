const db = require('../db');

// ================= DOANH THU — Customer Charges là NGUỒN DUY NHẤT (Single Source of Truth) =====
// Trước đây doanh thu = shipments.cuoc_dv (nhập tay) + tổng shipment_charges.la_chi_ho — 2 nguồn dữ
// liệu tách rời nhau, dễ lệch nếu Senior sửa Debit Note (Customer Charges) mà quên sửa cuoc_dv.
// Theo yêu cầu sau UAT: shipments.cuoc_dv KHÔNG còn được dùng để tính toán ở bất kỳ đâu (chỉ giữ
// lại cột trong DB để tương thích dữ liệu cũ). Doanh thu giờ LUÔN tính động từ
// shipment_customer_charges (SUM đơn giá * số lượng, CHƯA gồm VAT — cùng cách hiểu với cuoc_dv cũ).
//
// FALLBACK (tương thích dữ liệu cũ): nếu 1 lô hàng CHƯA từng có dòng nào trong
// shipment_customer_charges (ví dụ lô hàng rất cũ, tạo trước khi tính năng Customer Charges tồn
// tại, và chưa ai mở tab "Debit Note (thu khách)" hay xem chi tiết lô hàng để kích hoạt lazy-copy
// — xem routes/shipments.js), tạm thời fallback đọc từ shipment_charges (Cost) để không bị "mất"
// doanh thu trên báo cáo. Đây CHỈ là fallback đọc (read-only), không ghi gì vào DB, và sẽ tự động
// hết tác dụng ngay khi lô hàng đó có dòng Customer Charges (copy 1 lần, xem schema.sql).

// Subquery tổng thu khách (chưa gồm VAT) của 1 lô hàng, dùng trong câu SELECT lớn (correlated
// subquery, không cần bind param — shipmentIdCol là biểu thức cột, ví dụ 's.id').
function revenueExpr(shipmentIdCol) {
  return `COALESCE(
    (SELECT SUM(don_gia * so_luong) FROM shipment_customer_charges WHERE shipment_id = ${shipmentIdCol}),
    (SELECT SUM(so_tien) FROM shipment_charges WHERE shipment_id = ${shipmentIdCol}),
    0
  )`;
}

// Subquery phần "Chi hộ" (charge_type = DISBURSEMENT) trong Customer Charges của 1 lô hàng — dùng
// cho các báo cáo công nợ vẫn cần tách riêng phần "chi hộ" (thuế, phí HQ, phí CO... trả trước cho
// khách) khỏi phần "phí dịch vụ" thông thường.
function disbursementExpr(shipmentIdCol) {
  return `COALESCE(
    (SELECT SUM(don_gia * so_luong) FROM shipment_customer_charges WHERE shipment_id = ${shipmentIdCol} AND charge_type = 'DISBURSEMENT'),
    (SELECT SUM(so_tien) FROM shipment_charges WHERE shipment_id = ${shipmentIdCol} AND la_chi_ho = 1),
    0
  )`;
}

// Bản JS (bind param) của revenueExpr/disbursementExpr, dùng khi cần tính cho 1 shipmentId cụ thể
// (ví dụ ngay sau khi Lưu lô hàng, để tạo phiếu thu tự động — xem regenerateAutoVouchers).
function sumCustomerCharges(shipmentId) {
  const row = db.prepare(`SELECT ${revenueExpr('?')} as t`).get(shipmentId, shipmentId);
  return row.t || 0;
}

function sumDisbursement(shipmentId) {
  const row = db.prepare(`SELECT ${disbursementExpr('?')} as t`).get(shipmentId, shipmentId);
  return row.t || 0;
}

// Tách doanh thu 1 lô hàng thành 2 phần: "Dịch vụ" (SERVICE + ADJUSTMENT + DISCOUNT — mọi charge_type
// KHÁC DISBURSEMENT) và "Chi hộ" (DISBURSEMENT) — dùng khi cần thu 2 khoản này riêng, vào 2 quỹ khác
// nhau / 2 thời điểm khác nhau (thực tế: 2 khoản này thường thu về 2 tài khoản NGƯỜI THỤ HƯỞNG khác
// nhau — xem 2 mẫu Debit Note PDF gốc, mỗi mẫu ghi 1 số tài khoản riêng). Cùng định nghĩa với
// breakdown cuoc_dv/chi_ho ở routes/reports.js (mục cong-no-kh) để nhất quán toàn hệ thống.
function sumCustomerChargesByType(shipmentId) {
  const total = sumCustomerCharges(shipmentId);
  const disbursement = sumDisbursement(shipmentId);
  return { dichVu: total - disbursement, chiHo: disbursement, total };
}

module.exports = { revenueExpr, disbursementExpr, sumCustomerCharges, sumDisbursement, sumCustomerChargesByType };
