import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Space, Spin, message } from 'antd';
import { ArrowLeftOutlined, PrinterOutlined } from '@ant-design/icons';
import api from '../api/client';
import { formatMoney } from '../utils/format';
import { numberToVietnameseWords } from '../utils/numberToWordsVi';

const SERVICE_SECTION_TITLE = 'PHÍ DỊCH VỤ HẢI QUAN';
const DISBURSEMENT_SECTION_TITLE = 'PHÍ CHI HỘ';

function sumLines(lines) {
  return lines.reduce(
    (acc, l) => ({ thanh_tien: acc.thanh_tien + l.thanh_tien, tong_cong: acc.tong_cong + l.tong_cong }),
    { thanh_tien: 0, tong_cong: 0 }
  );
}

// 1 khối bảng "CHI TIẾT" cho 1 vùng (Dịch vụ / Chi hộ) — Debit Note giờ có thể chứa CẢ 2 vùng cùng
// lúc (xem AI_HANDOVER.md, "gộp Debit Note 1 loại duy nhất"), nên in ra như 2 khối riêng nếu cả 2
// đều có dòng; chỉ 1 khối (không cần tiêu đề phụ) nếu Debit Note này chỉ có đúng 1 vùng.
function LineSection({ title, lines, withInvoiceCol, showTitle }) {
  if (lines.length === 0) return null;
  const totals = sumLines(lines);
  return (
    <div style={{ marginBottom: 14 }}>
      {showTitle && (
        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 15, margin: '8px 0 2px' }}>{title}</div>
      )}
      <table>
        <thead>
          <tr>
            <th style={{ width: 32 }}>STT</th>
            <th>CHI TIẾT</th>
            <th style={{ width: 70 }}>ĐVT</th>
            <th style={{ width: 90 }}>Đơn giá (VND)</th>
            <th style={{ width: 50 }}>SL</th>
            <th style={{ width: 100 }}>THÀNH TIỀN (VND)</th>
            <th style={{ width: 90 }}>VAT</th>
            <th style={{ width: 100 }}>Tổng tiền gồm VAT</th>
            {withInvoiceCol && <th style={{ width: 80 }}>Số Hóa Đơn</th>}
            <th style={{ width: 100 }}>Ghi Chú</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, idx) => (
            <tr key={l.id}>
              <td style={{ textAlign: 'center' }}>{idx + 1}</td>
              <td>{l.mo_ta}</td>
              <td style={{ textAlign: 'center' }}>{l.don_vi_tinh}</td>
              <td style={{ textAlign: 'right' }}>{formatMoney(l.don_gia)}</td>
              <td style={{ textAlign: 'center' }}>{l.so_luong}</td>
              <td style={{ textAlign: 'right' }}>{formatMoney(l.thanh_tien)}</td>
              <td style={{ textAlign: 'center' }}>{l.vat_percent === null ? 'No VAT' : `${l.vat_percent}%`}</td>
              <td style={{ textAlign: 'right' }}>{formatMoney(l.tong_cong)}</td>
              {withInvoiceCol && <td style={{ textAlign: 'center' }}>{l.so_hoa_don}</td>}
              <td>{l.ghi_chu}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700 }}>
              TỔNG CỘNG
            </td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoney(totals.thanh_tien)}</td>
            <td />
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoney(totals.tong_cong)}</td>
            {withInvoiceCol && <td />}
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

// 1 TRANG in hoàn chỉnh (Kính gửi / Tờ khai / bảng chi tiết của ĐÚNG 1 vùng / Thành tiền bằng chữ /
// Thông tin nhận tiền / chữ ký / footer công ty / dòng số Debit Note) — trước đây khi 1 Debit Note
// gộp cả 2 vùng (Cước dịch vụ + Chi hộ) thì in ra CÙNG 1 trang, 2 bảng nối tiếp nhau. Theo yêu cầu:
// tách thành 2 TRANG IN riêng biệt, mỗi trang là 1 phiếu Debit Note hoàn chỉnh của đúng 1 vùng —
// giống hệt 2 mẫu PDF gốc trước khi gộp (xem AI_HANDOVER.md). `pageLabel` chỉ hiển thị khi có cả 2
// trang, để phân biệt "Trang 1/2" / "Trang 2/2" (không ảnh hưởng tới việc chỉ có đúng 1 số Debit
// Note cho cả 2 trang — bản chất vẫn là 1 Debit Note, chỉ in tách trang).
function DnPage({ dn, sectionTitle, lines, withInvoiceCol, docTitle, pageLabel, breakBefore, bank }) {
  const totals = sumLines(lines);
  return (
    <div
      className="dn-sheet"
      style={{
        background: '#fff',
        maxWidth: 900,
        margin: '0 auto',
        padding: '32px 40px',
        boxShadow: '0 0 8px rgba(0,0,0,0.1)',
        fontFamily: 'Arial, sans-serif',
        color: '#111',
        breakBefore: breakBefore ? 'page' : 'auto',
      }}
    >
      <div style={{ textAlign: 'right', fontSize: 13 }}>Ngày: {fmtDate(dn.ngay_ct)}</div>

      <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.7 }}>
        <div>Kính gửi: <b>{dn.customer_name}</b></div>
        {dn.customer_address && <div>Địa chỉ: {dn.customer_address}</div>}
        {dn.customer_tax_code && <div>Mã số thuế: {dn.customer_tax_code}</div>}
        {dn.customer_contact_name && <div>Kính gửi: {dn.customer_contact_name}</div>}
      </div>

      <div style={{ margin: '10px 0', fontSize: 13 }}>
        {dn.company_name || 'Công ty'} xin được gửi debit note như sau:
      </div>

      <div style={{ fontSize: 12.5, marginBottom: 8 }}>
        {dn.so_to_khai && `Tờ Khai ${dn.so_to_khai}`}
        {dn.ngay_to_khai && ` ngày ${fmtDate(dn.ngay_to_khai)}`}
        {dn.po && ` PO#${dn.po}`}
      </div>

      <LineSection title={sectionTitle} lines={lines} withInvoiceCol={withInvoiceCol} showTitle />

      <div style={{ marginTop: 10, fontSize: 13 }}>
        Thành Tiền: <b>{numberToVietnameseWords(totals.tong_cong)}</b>./.
      </div>

      <div style={{ marginTop: 14, fontSize: 13, lineHeight: 1.7 }}>
        Kính đề nghị Quý Công ty Thanh Toán qua TK sau:
        <br />
        {bank.account_number && <>Số Tài khoản VND: {bank.account_number}<br /></>}
        {bank.bank_name && <>Ngân hàng: {bank.bank_name}<br /></>}
        {bank.swift && <>SWIFT Code: {bank.swift}<br /></>}
        {bank.account_name && <>Người Thụ Hưởng: {bank.account_name}<br /></>}
      </div>

      <div style={{ marginTop: 10, fontSize: 13 }}>Xin trân trọng cám ơn!</div>

      <div style={{ marginTop: 20, textAlign: 'right', fontSize: 13, paddingRight: 40 }}>
        <div>{dn.chuc_danh_nguoi_ky}</div>
        <div style={{ height: 50 }} />
        <div style={{ fontWeight: 700 }}>{dn.nguoi_ky}</div>
      </div>

      <div style={{ marginTop: 24, borderTop: '1px solid #999', paddingTop: 8, fontSize: 11, textAlign: 'center', color: '#333' }}>
        <div style={{ fontWeight: 700 }}>{dn.company_name}</div>
        {dn.company_address && <div>{dn.company_address}</div>}
        <div>
          {dn.company_tax_code && `MST: ${dn.company_tax_code}`}
          {dn.company_phone && ` — Điện thoại: ${dn.company_phone}`}
          {dn.company_email && ` — Email: ${dn.company_email}`}
        </div>
      </div>

      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 13, marginTop: 6, letterSpacing: 1 }}>
        {docTitle} — Số: {dn.so_dn}
        {pageLabel && <span style={{ fontWeight: 400 }}> ({pageLabel})</span>}
      </div>
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
      .catch(() => message.error('Không tải được Debit Note'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size="large" />
      </div>
    );
  }
  if (!dn) return null;

  const serviceLines = dn.lines.filter((l) => l.charge_type !== 'DISBURSEMENT');
  const disbursementLines = dn.lines.filter((l) => l.charge_type === 'DISBURSEMENT');
  const hasService = serviceLines.length > 0;
  const hasDisbursement = disbursementLines.length > 0;
  const isCombined = hasService && hasDisbursement;

  return (
    <div>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .dn-sheet { box-shadow: none !important; margin: 0 !important; }
          body { background: #fff !important; }
        }
        .dn-sheet table { border-collapse: collapse; width: 100%; font-size: 12.5px; }
        .dn-sheet th, .dn-sheet td { border: 1px solid #444; padding: 4px 6px; }
        .dn-sheet th { background: #f0f0f0; text-align: center; }
        .dn-page-gap { height: 24px; }
        @media print { .dn-page-gap { display: none; } }
      `}</style>

      <Space className="no-print" style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/debit-notes')}>
          Quay lại
        </Button>
        <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>
          In
        </Button>
      </Space>

      {/* MỖI vùng (Cước dịch vụ / Chi hộ) in ra 1 TRANG riêng biệt, đầy đủ như 1 phiếu Debit Note
          hoàn chỉnh — nếu Debit Note này gộp cả 2 vùng thì có 2 trang, ngắt trang khi in
          (breakBefore trên trang thứ 2). Nếu chỉ có đúng 1 vùng thì chỉ in ra 1 trang như trước. */}
      {hasService && (
        <DnPage
          dn={dn}
          sectionTitle={SERVICE_SECTION_TITLE}
          lines={serviceLines}
          withInvoiceCol={false}
          docTitle="DEBIT NOTE"
          pageLabel={isCombined ? 'Trang 1/2' : null}
          breakBefore={false}
          bank={{
            account_number: dn.dv_bank_account_number,
            bank_name: dn.dv_bank_name,
            swift: dn.dv_bank_swift,
            account_name: dn.dv_bank_account_name,
          }}
        />
      )}
      {isCombined && <div className="dn-page-gap" />}
      {hasDisbursement && (
        <DnPage
          dn={dn}
          sectionTitle={DISBURSEMENT_SECTION_TITLE}
          lines={disbursementLines}
          withInvoiceCol={true}
          docTitle={isCombined ? 'DEBIT NOTE' : 'DEBIT NOTE CHI HỘ'}
          pageLabel={isCombined ? 'Trang 2/2' : null}
          breakBefore={isCombined}
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
