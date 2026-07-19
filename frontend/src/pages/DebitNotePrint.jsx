import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Space, Spin, message } from 'antd';
import { ArrowLeftOutlined, PrinterOutlined } from '@ant-design/icons';
import api from '../api/client';
import { formatMoney } from '../utils/format';
import { numberToVietnameseWords } from '../utils/numberToWordsVi';

const SECTION_TITLE = { dich_vu: 'PHÍ DỊCH VỤ HẢI QUAN', chi_ho: 'PHÍ CHI HỘ' };
const DOC_TITLE = { dich_vu: 'DEBIT NOTE', chi_ho: 'DEBIT NOTE CHI HỘ' };

function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
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

  const isChiHo = dn.loai === 'chi_ho';

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
      `}</style>

      <Space className="no-print" style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/debit-notes')}>
          Quay lại
        </Button>
        <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>
          In
        </Button>
      </Space>

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

        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 15, margin: '8px 0 2px' }}>
          {SECTION_TITLE[dn.loai] || ''}
        </div>
        <div style={{ fontSize: 12.5, marginBottom: 8 }}>
          {dn.so_to_khai && `Tờ Khai ${dn.so_to_khai}`}
          {dn.ngay_to_khai && ` ngày ${fmtDate(dn.ngay_to_khai)}`}
          {dn.po && ` PO#${dn.po}`}
        </div>

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
              {isChiHo && <th style={{ width: 80 }}>Số Hóa Đơn</th>}
              <th style={{ width: 100 }}>Ghi Chú</th>
            </tr>
          </thead>
          <tbody>
            {dn.lines.map((l, idx) => (
              <tr key={l.id}>
                <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                <td>{l.mo_ta}</td>
                <td style={{ textAlign: 'center' }}>{l.don_vi_tinh}</td>
                <td style={{ textAlign: 'right' }}>{formatMoney(l.don_gia)}</td>
                <td style={{ textAlign: 'center' }}>{l.so_luong}</td>
                <td style={{ textAlign: 'right' }}>{formatMoney(l.thanh_tien)}</td>
                <td style={{ textAlign: 'center' }}>{l.vat_percent === null ? 'No VAT' : `${l.vat_percent}%`}</td>
                <td style={{ textAlign: 'right' }}>{formatMoney(l.tong_cong)}</td>
                {isChiHo && <td style={{ textAlign: 'center' }}>{l.so_hoa_don}</td>}
                <td>{l.ghi_chu}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={isChiHo ? 5 : 5} style={{ textAlign: 'right', fontWeight: 700 }}>
                TỔNG CỘNG
              </td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoney(dn.tong.thanh_tien)}</td>
              <td />
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoney(dn.tong.tong_cong)}</td>
              {isChiHo && <td />}
              <td />
            </tr>
          </tbody>
        </table>

        <div style={{ marginTop: 10, fontSize: 13 }}>
          Thành Tiền: <b>{numberToVietnameseWords(dn.tong.tong_cong)}</b>./.
        </div>

        <div style={{ marginTop: 14, fontSize: 13, lineHeight: 1.7 }}>
          Kính đề nghị Quý Công ty Thanh Toán qua TK sau:
          <br />
          {dn.bank_account_number && <>Số Tài khoản VND: {dn.bank_account_number}<br /></>}
          {dn.bank_name && <>Ngân hàng: {dn.bank_name}<br /></>}
          {dn.bank_swift && <>SWIFT Code: {dn.bank_swift}<br /></>}
          {dn.bank_account_name && <>Người Thụ Hưởng: {dn.bank_account_name}<br /></>}
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
          {DOC_TITLE[dn.loai]} — Số: {dn.so_dn}
        </div>
      </div>
    </div>
  );
}
