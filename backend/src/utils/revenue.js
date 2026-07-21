const db = require('../db');

// ================= DOANH THU — Customer Charges là NGUỒN DUY NHẤT (Single Source of Truth) =====
// Trước đây doanh thu = shipments.cuoc_dv (nhập tay) + tổng shipment_charges.la_chi_ho — 2 nguồn dữ
// liệu tách rời nhau, dễ lệch nếu Senior sửa Debit Note (Customer Charges) mà quên sửa cuoc_dv.
// Theo yêu cầu sau UAT: shipments.cuoc_dv KHÔNG còn được dùng để tính toán ở bất kỳ đâu (chỉ giữ
// lại cột trong DB để tương thích dữ liệu cũ). Doanh thu giờ LUÔN tính động từ
// shipment_customer_charges, nhưng KHÔNG cùng 1 cách tính VAT cho mọi dòng — xem giải thích ở
// revenueExpr bên dưới.
//
// FALLBACK (tương thích dữ liệu cũ): nếu 1 lô hàng CHƯA từng có dòng nào trong
// shipment_customer_charges (ví dụ lô hàng rất cũ, tạo trước khi tính năng Customer Charges tồn
// tại, và chưa ai mở tab "Debit Note (thu khách)" hay xem chi tiết lô hàng để kích hoạt lazy-copy
// — xem routes/shipments.js), tạm thời fallback đọc từ shipment_charges (Cost) để không bị "mất"
// doanh thu trên báo cáo. Đây CHỈ là fallback đọc (read-only), không ghi gì vào DB, và sẽ tự động
// hết tác dụng ngay khi lô hàng đó có dòng Customer Charges (copy 1 lần, xem schema.sql).

// Subquery DOANH THU (kế toán) của 1 lô hàng, dùng trong câu SELECT lớn (correlated subquery,
// không cần bind param — shipmentIdCol là biểu thức cột, ví dụ 's.id'). CÔNG THỨC:
//   - Dòng "Dịch vụ" (charge_type khác DISBURSEMENT — hoá đơn CÔNG TY MÌNH xuất cho khách): lấy
//     giá TRƯỚC thuế. VAT phần này là thuế đầu ra, công ty phải nộp lại nhà nước, không phải doanh
//     thu thực của mình.
//   - Dòng "Chi hộ" (charge_type = DISBURSEMENT — ví dụ phí nâng/hạ do CẢNG xuất hoá đơn THẲNG CHO
//     KHÁCH, không phải cho công ty mình): lấy giá SAU thuế (đã gồm VAT). Vì hoá đơn không đứng tên
//     công ty nên công ty KHÔNG được khấu trừ VAT đầu vào — toàn bộ số tiền (gồm cả thuế) chỉ là
//     tiền chi hộ, thu lại nguyên vẹn từ khách, nên phải tính đủ vào doanh thu/số tiền thu, không
//     được trừ thuế ra như dòng dịch vụ.
function revenueExpr(shipmentIdCol) {
  return `ROUND(COALESCE(
    (SELECT SUM(
       CASE WHEN charge_type = 'DISBURSEMENT'
         THEN don_gia * so_luong * (1 + COALESCE(vat_percent, 0) / 100.0)
         ELSE don_gia * so_luong
       END
     ) FROM shipment_customer_charges WHERE shipment_id = ${shipmentIdCol}),
    (SELECT SUM(so_tien) FROM shipment_charges WHERE shipment_id = ${shipmentIdCol}),
    0
  ), 0)`;
}

// Subquery phần "Chi hộ" (charge_type = DISBURSEMENT) trong Customer Charges của 1 lô hàng — ĐÃ GỒM
// VAT (xem giải thích ở revenueExpr: hoá đơn của dòng chi hộ xuất thẳng cho khách, công ty không
// khấu trừ được thuế nên phần thuế này vẫn tính vào tiền chi hộ). Dùng cho các báo cáo công nợ/doanh
// thu cần tách riêng phần "chi hộ" khỏi phần "phí dịch vụ" thông thường.
function disbursementExpr(shipmentIdCol) {
  return `ROUND(COALESCE(
    (SELECT SUM(don_gia * so_luong * (1 + COALESCE(vat_percent, 0) / 100.0)) FROM shipment_customer_charges WHERE shipment_id = ${shipmentIdCol} AND charge_type = 'DISBURSEMENT'),
    (SELECT SUM(so_tien) FROM shipment_charges WHERE shipment_id = ${shipmentIdCol} AND la_chi_ho = 1),
    0
  ), 0)`;
}

// Subquery TỔNG PHẢI THU (đã gồm VAT trên MỌI dòng, kể cả dòng dịch vụ) của 1 lô hàng — đây là số
// tiền KHÁCH THỰC SỰ PHẢI THANH TOÁN (khớp với "Grand Total" trên form lô hàng: Subtotal + VAT).
// Khác với revenueExpr ở trên (doanh thu kế toán — dòng dịch vụ trước thuế, dòng chi hộ sau thuế).
// Dùng cho mọi chỗ liên quan CÔNG NỢ KHÁCH HÀNG (phải thu, còn nợ, ledger, bảng công nợ theo
// tháng...) — KHÔNG dùng cho báo cáo Doanh thu/Lợi nhuận. Fallback shipment_charges (dữ liệu cũ
// trước khi có Customer Charges/VAT) không có VAT nên giữ nguyên so_tien, không nhân thêm thuế.
function receivableExpr(shipmentIdCol) {
  return `ROUND(COALESCE(
    (SELECT SUM(don_gia * so_luong * (1 + COALESCE(vat_percent, 0) / 100.0)) FROM shipment_customer_charges WHERE shipment_id = ${shipmentIdCol}),
    (SELECT SUM(so_tien) FROM shipment_charges WHERE shipment_id = ${shipmentIdCol}),
    0
  ), 0)`;
}

// Bản JS (bind param) của revenueExpr/disbursementExpr/receivableExpr, dùng khi cần tính cho 1
// shipmentId cụ thể (ví dụ ngay sau khi Lưu lô hàng, để tạo phiếu thu tự động — xem
// regenerateAutoVouchers).
function sumCustomerCharges(shipmentId) {
  const row = db.prepare(`SELECT ${revenueExpr('?')} as t`).get(shipmentId, shipmentId);
  return Math.round(row.t || 0);
}

function sumDisbursement(shipmentId) {
  const row = db.prepare(`SELECT ${disbursementExpr('?')} as t`).get(shipmentId, shipmentId);
  return Math.round(row.t || 0);
}

function sumReceivable(shipmentId) {
  const row = db.prepare(`SELECT ${receivableExpr('?')} as t`).get(shipmentId, shipmentId);
  return Math.round(row.t || 0);
}

// Tách doanh thu 1 lô hàng thành 2 phần: "Dịch vụ" (SERVICE + ADJUSTMENT + DISCOUNT — mọi charge_type
// KHÁC DISBURSEMENT, trước thuế) và "Chi hộ" (DISBURSEMENT, đã gồm thuế — xem revenueExpr) — dùng khi
// cần thu 2 khoản này riêng, vào 2 quỹ khác nhau / 2 thời điểm khác nhau (thực tế: 2 khoản này thường
// thu về 2 tài khoản NGƯỜI THỤ HƯỞNG khác nhau — xem 2 mẫu Debit Note PDF gốc, mỗi mẫu ghi 1 số tài
// khoản riêng). Cùng định nghĩa với breakdown cuoc_dv/chi_ho ở routes/reports.js (mục cong-no-kh) để
// nhất quán toàn hệ thống. total = dichVu + chiHo = đúng bằng revenueExpr (Doanh thu).
function sumCustomerChargesByType(shipmentId) {
  const total = sumCustomerCharges(shipmentId);
  const disbursement = sumDisbursement(shipmentId);
  return { dichVu: total - disbursement, chiHo: disbursement, total };
}

// Bản dùng cho PHIẾU THU thực tế (số tiền khách phải trả) — khác sumCustomerChargesByType ở chỗ
// phần "Dịch vụ" ở đây CŨNG gồm VAT (vì khách vẫn phải trả đủ cả thuế dịch vụ, chỉ là công ty không
// tính thuế đó vào doanh thu kế toán của mình). total = sumReceivable (Grand Total, đã gồm VAT mọi
// dòng). chiHo dùng chung định nghĩa với disbursementExpr (đã gồm VAT).
function sumReceivableByType(shipmentId) {
  const total = sumReceivable(shipmentId);
  const chiHo = sumDisbursement(shipmentId);
  return { dichVu: total - chiHo, chiHo, total };
}

module.exports = {
  revenueExpr,
  disbursementExpr,
  receivableExpr,
  sumCustomerCharges,
  sumDisbursement,
  sumReceivable,
  sumCustomerChargesByType,
  sumReceivableByType,
};

