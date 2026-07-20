import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Space, Spin, message } from "antd";
import { ArrowLeftOutlined, PrinterOutlined } from "@ant-design/icons";
import api from "../api/client";
import { formatMoney } from "../utils/format";
import { numberToVietnameseWords } from "../utils/numberToWordsVi";
import "./DebitNotePrint.css";

const SERVICE_SECTION_TITLE = "PHÍ DỊCH VỤ HẢI QUAN";
const DISBURSEMENT_SECTION_TITLE = "PHÍ CHI HỘ";

// Fallback chữ ký khi API trả null — không được để trống (yêu cầu bổ sung).
const DEFAULT_SIGNER_TITLE = "Trưởng phòng kinh doanh";
const DEFAULT_SIGNER_NAME = "Hùng Anh";

// ----------------------------------------------------------------------------------
// CHỈ refactor GIAO DIỆN IN (layout/CSS) cho giống mẫu PDF gốc — KHÔNG đổi business
// logic/API/DB. Toàn bộ số liệu vẫn lấy từ `dn` (kết quả GET /debit-notes/:id) như cũ.
// Toàn bộ CSS đã tách sang DebitNotePrint.css, JSX chỉ dùng className, không dùng
// inline style — xem AI_HANDOVER.md.
//
// Thứ tự block bắt buộc theo PDF mẫu (không đổi):
// Header -> Tiêu đề -> Bảng -> Tổng cộng -> Thành tiền bằng chữ -> Thông tin thanh
// toán -> Xin trân trọng cám ơn -> Khối chữ ký -> Đường kẻ ngang -> Thông tin công ty
// -> DEBIT NOTE — Số...
// ----------------------------------------------------------------------------------

function sumLines(lines) {
  return lines.reduce(
    (acc, l) => ({
      thanh_tien: acc.thanh_tien + l.thanh_tien,
      vat: acc.vat + (l.tong_cong - l.thanh_tien),
      tong_cong: acc.tong_cong + l.tong_cong,
    }),
    { thanh_tien: 0, vat: 0, tong_cong: 0 },
  );
}

function fmtDate(d) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

// ===== HEADER: Kính gửi (trái) + Ngày (phải), rồi câu mở đầu + dòng tờ khai =====
function DebitNoteHeader({ dn }) {
  return (
    <>
      <div className="dn-header">
        <div className="dn-header-left">
          <div>
            Kính gửi: <b>{dn.customer_name}</b>
          </div>
          {dn.customer_address && <div>Địa chỉ: {dn.customer_address}</div>}
          {dn.customer_tax_code && (
            <div>Mã số thuế: {dn.customer_tax_code}</div>
          )}
          {dn.customer_contact_name && (
            <div>Kính gửi: {dn.customer_contact_name}</div>
          )}
        </div>
        <div className="dn-header-right">Ngày: {fmtDate(dn.ngay_ct)}</div>
      </div>

      <div className="dn-intro">
        {dn.company_name || "Công ty"} xin được gửi debit note như sau:
      </div>
    </>
  );
}

// ===== TIÊU ĐỀ + DÒNG TỜ KHAI (ngay dưới tiêu đề) + BẢNG + TỔNG CỘNG =====
function DebitNoteTable({ title, dn, lines, withInvoiceCol }) {
  if (lines.length === 0) return null;
  const totals = sumLines(lines);
  return (
    <>
      <div className="dn-title">{title}</div>

      {(dn.so_to_khai || dn.po) && (
        <div className="dn-declaration">
          {dn.so_to_khai && `Tờ Khai ${dn.so_to_khai}`}
          {dn.ngay_to_khai && ` ngày ${fmtDate(dn.ngay_to_khai)}`}
          {dn.po && ` PO#${dn.po}`}
        </div>
      )}

      <table className="dn-table">
        <thead>
          <tr>
            <th>STT</th>
            <th>CHI TIẾT</th>
            <th>ĐVT</th>
            <th>ĐƠN GIÁ (VND)</th>
            <th>SL</th>
            <th>THÀNH TIỀN (VND)</th>
            <th>VAT</th>
            <th>TỔNG TIỀN GỒM VAT</th>
            {withInvoiceCol && <th>SỐ HÓA ĐƠN</th>}
            <th>GHI CHÚ</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, idx) => (
            <tr key={l.id}>
              <td>{idx + 1}</td>
              <td className="dn-col-detail">{l.mo_ta}</td>
              <td>{l.don_vi_tinh}</td>
              <td className="dn-col-money">{formatMoney(l.don_gia)}</td>
              <td>{l.so_luong}</td>
              <td className="dn-col-money">{formatMoney(l.thanh_tien)}</td>
              <td>{l.vat_percent === null ? "" : `${l.vat_percent}%`}</td>
              <td className="dn-col-money">{formatMoney(l.tong_cong)}</td>
              {withInvoiceCol && <td>{l.so_hoa_don}</td>}
              <td className="dn-col-detail">{l.ghi_chu}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={5} className="dn-total-label">
              TỔNG CỘNG
            </td>
            <td className="dn-total-money">{formatMoney(totals.thanh_tien)}</td>
            <td className="dn-total-money">{formatMoney(totals.vat)}</td>
            <td className="dn-total-money">{formatMoney(totals.tong_cong)}</td>
            {withInvoiceCol && <td />}
            <td />
          </tr>
        </tbody>
      </table>
    </>
  );
}

// ===== THÀNH TIỀN BẰNG CHỮ + THÔNG TIN THANH TOÁN =====
function DebitNotePaymentBlock({ totals, bank }) {
  return (
    <>
      <div className="dn-amount-words">
        Thành Tiền: <b>{numberToVietnameseWords(totals.tong_cong)}</b>./.
      </div>

      <div className="dn-payment-info">
        Kính đề nghị Quý Công ty Thanh Toán qua TK sau:
        <br />
        {bank.account_number && (
          <>
            Số Tài khoản VND: {bank.account_number}
            <br />
          </>
        )}
        {bank.bank_name && (
          <>
            Ngân hàng: {bank.bank_name}
            <br />
          </>
        )}
        {bank.swift && (
          <>
            SWIFT Code: {bank.swift}
            <br />
          </>
        )}
        {bank.account_name && (
          <>
            Người Thụ Hưởng: {bank.account_name}
            <br />
          </>
        )}
      </div>
    </>
  );
}

// ===== XIN TRÂN TRỌNG CÁM ƠN + KHỐI CHỮ KÝ =====
// Fallback bắt buộc: nếu API trả null cho chuc_danh_nguoi_ky / nguoi_ky thì dùng giá
// trị mặc định của mẫu PDF gốc — không được để trống.
function DebitNoteSignature({ dn }) {
  const signerTitle = dn.chuc_danh_nguoi_ky || DEFAULT_SIGNER_TITLE;
  const signerName = dn.nguoi_ky || DEFAULT_SIGNER_NAME;
  return (
    <>
      <div className="dn-thanks">Xin trân trọng cám ơn!</div>

      <div className="dn-signature">
        <div className="dn-signature-title">{signerTitle}</div>
        <div className="dn-signature-space" />
        <div className="dn-signature-name">{signerName}</div>
      </div>
    </>
  );
}

// ===== ĐƯỜNG KẺ NGANG + THÔNG TIN CÔNG TY + DEBIT NOTE — SỐ... =====
function DebitNoteFooter({ dn, docTitle, pageLabel }) {
  return (
    <>
      <div className="dn-company-footer">
        <div className="dn-company-name">{dn.company_name}</div>
        {dn.company_address && <div>{dn.company_address}</div>}
        <div>
          {dn.company_tax_code && `MST: ${dn.company_tax_code}`}
          {dn.company_phone && ` — Điện thoại: ${dn.company_phone}`}
          {dn.company_email && ` — Email: ${dn.company_email}`}
        </div>
      </div>

      <div className="dn-doc-title">
        {docTitle} — Số: {dn.so_dn}
        {pageLabel && <span className="dn-page-label"> ({pageLabel})</span>}
      </div>
    </>
  );
}

// 1 TRANG in hoàn chỉnh, đúng thứ tự PDF: Header -> Tiêu đề -> Bảng -> Tổng cộng ->
// Thành tiền bằng chữ -> Thông tin thanh toán -> Cảm ơn -> Chữ ký -> Đường kẻ ngang ->
// Thông tin công ty -> DEBIT NOTE — Số...
function DnPage({
  dn,
  sectionTitle,
  lines,
  withInvoiceCol,
  docTitle,
  pageLabel,
  bank,
}) {
  const totals = sumLines(lines);
  return (
    <div className="dn-sheet">
      <DebitNoteHeader dn={dn} />
      <DebitNoteTable
        title={sectionTitle}
        dn={dn}
        lines={lines}
        withInvoiceCol={withInvoiceCol}
      />
      <DebitNotePaymentBlock totals={totals} bank={bank} />
      <DebitNoteSignature dn={dn} />
      <DebitNoteFooter dn={dn} docTitle={docTitle} pageLabel={pageLabel} />
    </div>
  );
}

export default function DebitNotePrint() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [dn, setDn] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get(`/debit-notes/${id}`)
      .then(({ data }) => setDn(data))
      .catch(() => message.error("Không tải được Debit Note"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 60 }}>
        <Spin size="large" />
      </div>
    );
  }
  if (!dn) return null;

  const serviceLines = dn.lines.filter((l) => l.charge_type !== "DISBURSEMENT");
  const disbursementLines = dn.lines.filter(
    (l) => l.charge_type === "DISBURSEMENT",
  );
  const hasService = serviceLines.length > 0;
  const hasDisbursement = disbursementLines.length > 0;
  const isCombined = hasService && hasDisbursement;

  return (
    <div>
      <Space className="no-print dn-page-toolbar">
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate("/debit-notes")}
        >
          Quay lại
        </Button>
        <Button
          type="primary"
          icon={<PrinterOutlined />}
          onClick={() => window.print()}
        >
          In
        </Button>
      </Space>

      {/* MỖI vùng (Cước dịch vụ / Chi hộ) in ra 1 TRANG riêng biệt, đầy đủ như 1 phiếu Debit Note
          hoàn chỉnh — nếu Debit Note này gộp cả 2 vùng thì có 2 trang, ngắt trang khi in
          (CSS .dn-sheet + .dn-sheet { break-before: page } trong DebitNotePrint.css). Nếu chỉ có
          đúng 1 vùng thì chỉ in ra 1 trang như trước. */}
      {hasService && (
        <DnPage
          dn={dn}
          sectionTitle={SERVICE_SECTION_TITLE}
          lines={serviceLines}
          withInvoiceCol={false}
          docTitle="DEBIT NOTE"
          pageLabel={isCombined ? "Trang 1/2" : null}
          bank={{
            account_number: dn.dv_bank_account_number,
            bank_name: dn.dv_bank_name,
            swift: dn.dv_bank_swift,
            account_name: dn.dv_bank_account_name,
          }}
        />
      )}
      {hasDisbursement && (
        <DnPage
          dn={dn}
          sectionTitle={DISBURSEMENT_SECTION_TITLE}
          lines={disbursementLines}
          withInvoiceCol={true}
          docTitle={isCombined ? "DEBIT NOTE" : "DEBIT NOTE CHI HỘ"}
          pageLabel={isCombined ? "Trang 2/2" : null}
          bank={{
            account_number: dn.chi_ho_bank_account_number,
            bank_name: dn.chi_ho_bank_name,
            swift: dn.chi_ho_bank_swift,
            account_name: dn.chi_ho_bank_account_name,
          }}
        />
      )}
    </div>
  );
}
