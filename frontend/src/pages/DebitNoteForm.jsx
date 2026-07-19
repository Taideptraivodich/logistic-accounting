import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Form, Input, InputNumber, Select, DatePicker, Button,
  Table, Space, message, Typography, Card, Row, Col, Alert,
} from 'antd';
import { PlusOutlined, DeleteOutlined, ArrowLeftOutlined, SaveOutlined, SyncOutlined, PrinterOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api/client';
import { formatMoney } from '../utils/format';

const { Title, Text } = Typography;
const DATE_FMT = 'YYYY-MM-DD';

let tempIdCounter = 0;
const nextTempId = () => `tmp-${Date.now()}-${tempIdCounter++}`;

const VAT_OPTIONS = [
  { value: null, label: 'No VAT' },
  { value: 0, label: '0%' },
  { value: 8, label: '8%' },
  { value: 10, label: '10%' },
];

const moneyInputProps = {
  min: 0,
  style: { width: '100%' },
  formatter: (val) => (val === undefined || val === null ? '' : `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')),
  parser: (val) => (val ? val.replace(/,/g, '') : ''),
};

function normalizeChargeType(t) {
  return t === 'DISBURSEMENT' ? 'DISBURSEMENT' : 'SERVICE';
}

// Chuyển 1 dòng "gợi ý" (từ GET /debit-notes/suggest-lines, thực chất là 1 row của
// shipment_customer_charges) thành 1 dòng local trong bảng "Chi tiết chi phí" của Debit Note.
// charge_type đi kèm để biết dòng này thuộc vùng "Cước dịch vụ" hay "Chi hộ" (xem DebitNoteBody).
const chargeToLine = (l) => ({
  key: nextTempId(),
  mo_ta: l.mo_ta,
  don_vi_tinh: l.don_vi_tinh,
  so_luong: l.so_luong,
  don_gia: l.don_gia,
  vat_percent: l.vat_percent,
  so_hoa_don: '',
  ghi_chu: l.ghi_chu,
  source_charge_id: l.source_charge_id,
  charge_type: normalizeChargeType(l.charge_type),
});

// Chuyển 1 dòng debit_note_lines đã lưu trong DB thành dòng local (dùng lúc load lại 1 Debit Note
// đã tồn tại để sửa). Nhờ migration 1 lần ở backend/src/db.js, charge_type của dữ liệu CŨ (từ
// trước đợt gộp "1 Debit Note = 1 loại duy nhất") đã được sửa lại đúng — nên ở đây chỉ cần tin
// tưởng thẳng vào l.charge_type, không cần suy luận thêm từ trường "loai" (đã deprecated) nữa.
const dnLineToLocal = (l) => ({
  key: l.id ?? nextTempId(),
  mo_ta: l.mo_ta,
  don_vi_tinh: l.don_vi_tinh,
  so_luong: l.so_luong,
  don_gia: l.don_gia,
  vat_percent: l.vat_percent,
  so_hoa_don: l.so_hoa_don,
  ghi_chu: l.ghi_chu,
  source_charge_id: l.source_charge_id,
  charge_type: normalizeChargeType(l.charge_type),
});

// So khớp các dòng "gợi ý" mới lấy từ lô hàng với các dòng ĐANG CÓ trong Debit Note, chỉ trả về
// những dòng THỰC SỰ MỚI (chưa có trong Debit Note) — dùng để "đồng bộ" (cộng thêm) thay vì thay
// thế toàn bộ, tránh mất các dòng Senior đã tự sửa tay (Số hoá đơn, Ghi chú...) hoặc tự thêm.
//
// Lưu ý quan trọng: `source_charge_id` tham chiếu tới `shipment_charges.id` GỐC lúc lô hàng được
// copy sang Customer Charges lần đầu — giá trị này ổn định qua các lần Sửa lô hàng (Customer
// Charges độc lập với Cost sau lần copy đầu). Nhưng những dòng Senior TỰ THÊM thẳng ở tab "Debit
// Note (thu khách)" (không qua Cost) thì không có `source_charge_id` (null) — với các dòng này,
// so khớp tạm theo Mô tả (không phân biệt hoa/thường, bỏ khoảng trắng thừa) để tránh cộng trùng
// khi bấm "Đồng bộ" nhiều lần.
function findNewLinesFromShipment(currentLines, suggestedRows) {
  const bySource = new Set(currentLines.filter((l) => l.source_charge_id).map((l) => l.source_charge_id));
  const byDesc = new Set(
    currentLines.filter((l) => !l.source_charge_id).map((l) => (l.mo_ta || '').trim().toLowerCase())
  );
  const result = [];
  (suggestedRows || []).forEach((l) => {
    if (l.source_charge_id) {
      if (bySource.has(l.source_charge_id)) return;
    } else {
      const key = (l.mo_ta || '').trim().toLowerCase();
      if (byDesc.has(key)) return;
    }
    result.push(chargeToLine(l));
  });
  return result;
}

function computeTotals(lines) {
  return lines.reduce(
    (acc, l) => {
      const thanhTien = (l.don_gia || 0) * (l.so_luong || 0);
      const vatAmount = l.vat_percent != null ? (thanhTien * l.vat_percent) / 100 : 0;
      return { thanh_tien: acc.thanh_tien + thanhTien, vat: acc.vat + vatAmount, tong_cong: acc.tong_cong + thanhTien + vatAmount };
    },
    { thanh_tien: 0, vat: 0, tong_cong: 0 }
  );
}

// columns dùng chung cho cả 2 vùng (Cước dịch vụ / Chi hộ) — chỉ khác đúng 1 cột "Số hoá đơn"
// (chỉ có nghĩa với Chi hộ, nơi NCC/Hải quan xuất hoá đơn cho khoản chi hộ đó).
function buildLineColumns(withInvoiceCol, updateLine, removeLine) {
  return [
    { title: 'STT', width: 50, render: (_, __, idx) => idx + 1 },
    {
      title: 'Chi tiết',
      dataIndex: 'mo_ta',
      render: (v, r) => <Input value={v} onChange={(e) => updateLine(r.key, 'mo_ta', e.target.value)} placeholder="Mô tả" />,
    },
    {
      title: 'ĐVT',
      dataIndex: 'don_vi_tinh',
      width: 100,
      render: (v, r) => <Input value={v} onChange={(e) => updateLine(r.key, 'don_vi_tinh', e.target.value)} />,
    },
    {
      title: 'Đơn giá',
      dataIndex: 'don_gia',
      width: 130,
      render: (v, r) => <InputNumber {...moneyInputProps} value={v} onChange={(val) => updateLine(r.key, 'don_gia', val || 0)} />,
    },
    {
      title: 'SL',
      dataIndex: 'so_luong',
      width: 70,
      render: (v, r) => <InputNumber style={{ width: '100%' }} min={0} value={v} onChange={(val) => updateLine(r.key, 'so_luong', val || 0)} />,
    },
    {
      title: 'VAT',
      dataIndex: 'vat_percent',
      width: 100,
      render: (v, r) => <Select style={{ width: '100%' }} value={v} options={VAT_OPTIONS} onChange={(val) => updateLine(r.key, 'vat_percent', val)} />,
    },
    ...(withInvoiceCol
      ? [
          {
            title: 'Số hoá đơn',
            dataIndex: 'so_hoa_don',
            width: 110,
            render: (v, r) => <Input value={v} onChange={(e) => updateLine(r.key, 'so_hoa_don', e.target.value)} />,
          },
        ]
      : []),
    {
      title: 'Ghi chú',
      dataIndex: 'ghi_chu',
      render: (v, r) => <Input value={v} onChange={(e) => updateLine(r.key, 'ghi_chu', e.target.value)} />,
    },
    {
      title: '',
      width: 40,
      render: (_, r) => <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeLine(r.key)} />,
    },
  ];
}

// ================= Khối "Thông tin nhận tiền / chữ ký" + 2 VÙNG dòng chi phí + tổng =================
// SỬA LẠI theo yêu cầu: trước đây tab "Phí dịch vụ" và "Phí chi hộ" là 2 Form/Debit Note HOÀN TOÀN
// riêng biệt (lặp lại y hệt Ngày chứng từ, Khách hàng, Thông tin nhận tiền/chữ ký... 2 lần, và Lưu
// ra 2 Debit Note khác nhau cho cùng 1 lô hàng). Giờ CHỈ 1 Form/Debit Note duy nhất — các trường
// dùng chung (Ngày chứng từ, Khách hàng, Thông tin nhận tiền/chữ ký...) nhập ĐÚNG 1 LẦN; khác biệt
// DUY NHẤT nằm ở vùng "Chi tiết chi phí", tách làm 2 bảng con (Cước dịch vụ / Chi hộ) trên CÙNG 1
// mảng `lines` phẳng (mỗi dòng tự mang charge_type SERVICE/DISBURSEMENT) — giống hệt cách tab
// "Debit Note (thu khách)" ở ShipmentForm.jsx đã làm (xem CustomerChargesTab ở đó).
function DebitNoteBody({ form, lines, setLines, paymentMethods, customers, totals, extraHeader }) {
  const updateLine = (key, field, value) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  const addLine = (chargeType) =>
    setLines((prev) => [
      ...prev,
      { key: nextTempId(), mo_ta: '', don_vi_tinh: '', so_luong: 1, don_gia: 0, vat_percent: null, so_hoa_don: '', ghi_chu: '', charge_type: chargeType },
    ]);
  const removeLine = (key) => setLines((prev) => prev.filter((l) => l.key !== key));

  const serviceLines = lines.filter((l) => l.charge_type !== 'DISBURSEMENT');
  const disbursementLines = lines.filter((l) => l.charge_type === 'DISBURSEMENT');
  const serviceColumns = buildLineColumns(false, updateLine, removeLine);
  const disbursementColumns = buildLineColumns(true, updateLine, removeLine);

  const onPickPaymentMethod = (pmId) => {
    const pm = paymentMethods.find((p) => p.id === pmId);
    if (!pm) return;
    form.setFieldsValue({
      bank_account_name: pm.bank_account_name || form.getFieldValue('bank_account_name'),
      bank_account_number: pm.bank_account_number || form.getFieldValue('bank_account_number'),
      bank_name: pm.bank_name || form.getFieldValue('bank_name'),
      bank_swift: pm.bank_swift || form.getFieldValue('bank_swift'),
    });
  };

  return (
    <>
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label="Ngày chứng từ" name="ngay_ct">
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="Khách hàng" name="customer_id" rules={[{ required: true, message: 'Chọn khách hàng' }]}>
              <Select showSearch optionFilterProp="label" placeholder="Chọn khách hàng" options={customers.map((c) => ({ value: c.id, label: c.name }))} />
            </Form.Item>
          </Col>
          <Col span={8}>{extraHeader}</Col>
        </Row>
      </Card>

      <Card title="Thông tin nhận tiền / chữ ký" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={6}>
            <Form.Item label="Chọn quỹ để tự điền TK ngân hàng">
              <Select allowClear placeholder="Chọn quỹ" options={paymentMethods.map((p) => ({ value: p.id, label: p.name }))} onChange={onPickPaymentMethod} />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label="Số tài khoản" name="bank_account_number">
              <Input />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label="Ngân hàng" name="bank_name">
              <Input />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label="SWIFT Code" name="bank_swift">
              <Input />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label="Người thụ hưởng" name="bank_account_name">
              <Input />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label="Người ký" name="nguoi_ky">
              <Input />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label="Chức danh" name="chuc_danh_nguoi_ky">
              <Input placeholder="Trưởng phòng kinh doanh" />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label="Ghi chú chung" name="ghi_chu">
              <Input />
            </Form.Item>
          </Col>
        </Row>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
          <Title level={5} style={{ margin: 0 }}>
            Cước dịch vụ
          </Title>
          <Button icon={<PlusOutlined />} onClick={() => addLine('SERVICE')}>
            Thêm dòng Cước dịch vụ
          </Button>
        </Space>
        <Table rowKey="key" dataSource={serviceLines} columns={serviceColumns} pagination={false} size="small" />
      </Card>

      <Card>
        <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
          <Title level={5} style={{ margin: 0 }}>
            Chi hộ
          </Title>
          <Button icon={<PlusOutlined />} onClick={() => addLine('DISBURSEMENT')}>
            Thêm dòng Chi hộ
          </Button>
        </Space>
        <Table rowKey="key" dataSource={disbursementLines} columns={disbursementColumns} pagination={false} size="small" />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 32, marginTop: 16 }}>
          <span>Thành tiền: <b className="money">{formatMoney(totals.thanh_tien)}</b></span>
          <span>Thuế VAT: <b className="money">{formatMoney(totals.vat)}</b></span>
          <span>Tổng cộng: <b className="money">{formatMoney(totals.tong_cong)}</b></span>
        </div>
      </Card>
    </>
  );
}

// ================= Debit Note của 1 lô hàng (Tạo mới, khi chọn lô hàng ở màn "Tạo Debit Note") =====
// CHỈ 1 panel duy nhất cho mỗi lô hàng (không còn 2 tab Phí dịch vụ/Phí chi hộ riêng biệt nữa) — tự
// tìm Debit Note NHÁP sẵn có của lô hàng này (GET /debit-notes/by-shipment/:id, backend tự gộp các
// bản nháp cũ trùng lặp từ trước đợt gộp này nếu có) để sửa tiếp; nếu chưa có thì tự khởi tạo dòng
// từ Customer Charges (cả 2 vùng) của lô hàng. Lưu là POST/PUT ĐÚNG 1 Debit Note duy nhất.
function ShipmentDebitNotePanel({ shipmentId, customers, paymentMethods, navigate }) {
  const [form] = Form.useForm();
  const [dnId, setDnId] = useState(null);
  const [lockedConfirmed, setLockedConfirmed] = useState([]); // Debit Note cũ đã Xác nhận (nếu có) — không đụng vào
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/debit-notes/by-shipment/${shipmentId}`);
      setLockedConfirmed(data.confirmed || []);
      if (data.draft) {
        setDnId(data.draft.id);
        form.setFieldsValue({
          ngay_ct: data.draft.ngay_ct ? dayjs(data.draft.ngay_ct) : null,
          customer_id: data.draft.customer_id,
          bank_account_name: data.draft.bank_account_name,
          bank_account_number: data.draft.bank_account_number,
          bank_name: data.draft.bank_name,
          bank_swift: data.draft.bank_swift,
          nguoi_ky: data.draft.nguoi_ky,
          chuc_danh_nguoi_ky: data.draft.chuc_danh_nguoi_ky,
          ghi_chu: data.draft.ghi_chu,
        });
        setLines(data.draft.lines.map(dnLineToLocal));
      } else {
        setDnId(null);
        const [{ data: shipment }, { data: suggest }] = await Promise.all([
          api.get(`/shipments/${shipmentId}`),
          api.get('/debit-notes/suggest-lines', { params: { shipment_id: shipmentId } }),
        ]);
        form.setFieldsValue({ ngay_ct: dayjs(), customer_id: shipment.customer_id || undefined });
        setLines((suggest.lines || []).map(chargeToLine));
      }
    } catch {
      message.error('Không tải được Debit Note của lô hàng này');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipmentId]);

  const syncFromShipment = async () => {
    setSyncing(true);
    try {
      const { data } = await api.get('/debit-notes/suggest-lines', { params: { shipment_id: shipmentId } });
      const toAdd = findNewLinesFromShipment(lines, data.lines);
      if (toAdd.length === 0) {
        message.info('Không có dòng chi phí mới nào từ lô hàng.');
      } else {
        setLines((prev) => [...prev, ...toAdd]);
        message.success(`Đã đồng bộ thêm ${toAdd.length} dòng chi phí mới từ lô hàng.`);
      }
    } catch {
      message.error('Không đồng bộ được từ lô hàng');
    } finally {
      setSyncing(false);
    }
  };

  const totals = useMemo(() => computeTotals(lines), [lines]);

  const handleSave = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    if (lines.length === 0) {
      message.error('Cần ít nhất 1 dòng chi phí');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        shipment_id: shipmentId,
        ...values,
        ngay_ct: values.ngay_ct ? values.ngay_ct.format(DATE_FMT) : null,
        lines: lines.map((l) => ({
          mo_ta: l.mo_ta,
          don_vi_tinh: l.don_vi_tinh,
          so_luong: l.so_luong,
          don_gia: l.don_gia,
          vat_percent: l.vat_percent,
          so_hoa_don: l.so_hoa_don,
          ghi_chu: l.ghi_chu,
          source_charge_id: l.source_charge_id,
          charge_type: l.charge_type,
        })),
      };
      if (dnId) {
        await api.put(`/debit-notes/${dnId}`, payload);
        message.success('Đã lưu Debit Note');
      } else {
        const { data } = await api.post('/debit-notes', payload);
        setDnId(data.id);
        message.success('Đã tạo Debit Note');
      }
    } catch (e) {
      message.error(e?.response?.data?.error || 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {lockedConfirmed.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`Lô hàng này đã có ${lockedConfirmed.length} Debit Note cũ đã Xác nhận (${lockedConfirmed.map((c) => c.so_dn).join(', ')})`}
          description="Không thuộc bản nháp đang sửa ở đây. Vào danh sách Debit Note để xem/in, hoặc Huỷ xác nhận trước nếu cần gộp/sửa lại."
        />
      )}
      <Form form={form} layout="vertical" disabled={loading}>
        <DebitNoteBody
          form={form}
          lines={lines}
          setLines={setLines}
          paymentMethods={paymentMethods}
          customers={customers}
          totals={totals}
          extraHeader={
            <Form.Item label=" ">
              <Button icon={<SyncOutlined spin={syncing} />} onClick={syncFromShipment} loading={syncing}>
                Đồng bộ từ lô hàng
              </Button>
            </Form.Item>
          }
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          {dnId && (
            <Button icon={<PrinterOutlined />} onClick={() => navigate(`/debit-notes/${dnId}/print`)}>
              Xem / In
            </Button>
          )}
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
            Lưu Debit Note
          </Button>
        </div>
      </Form>
    </div>
  );
}

export default function DebitNoteForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const [searchParams] = useSearchParams();
  const prefillShipmentId = searchParams.get('shipment_id');
  const navigate = useNavigate();
  const [form] = Form.useForm();

  const [shipments, setShipments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [dnShipmentId, setDnShipmentId] = useState(null); // shipment đã lưu sẵn trong Debit Note đang sửa (nếu có)

  // Chọn lô hàng khi TẠO MỚI (chưa lưu) — quyết định có chuyển sang panel theo lô hàng hay không.
  const [newShipmentId, setNewShipmentId] = useState(prefillShipmentId ? Number(prefillShipmentId) : undefined);

  useEffect(() => {
    Promise.all([api.get('/shipments'), api.get('/customers'), api.get('/payment-methods')])
      .then(([s, c, p]) => {
        setShipments(s.data);
        setCustomers(c.data);
        setPaymentMethods(p.data);
      })
      .catch(() => message.error('Không tải được danh mục'));
  }, []);

  // ================= CHẾ ĐỘ SỬA 1 DEBIT NOTE THEO ID (vào từ danh sách, nút "Sửa") =============
  useEffect(() => {
    if (!isEdit) return;
    setLoading(true);
    api
      .get(`/debit-notes/${id}`)
      .then(async ({ data }) => {
        if (data.status !== 'draft') {
          message.warning('Debit Note đã xác nhận, chuyển sang chế độ xem.');
          navigate(`/debit-notes/${id}/print`, { replace: true });
          return;
        }
        setDnShipmentId(data.shipment_id || null);
        form.setFieldsValue({
          ngay_ct: data.ngay_ct ? dayjs(data.ngay_ct) : null,
          customer_id: data.customer_id,
          bank_account_name: data.bank_account_name,
          bank_account_number: data.bank_account_number,
          bank_name: data.bank_name,
          bank_swift: data.bank_swift,
          nguoi_ky: data.nguoi_ky,
          chuc_danh_nguoi_ky: data.chuc_danh_nguoi_ky,
          ghi_chu: data.ghi_chu,
        });
        const loadedLines = data.lines.map(dnLineToLocal);
        setLines(loadedLines);

        // FIX: trước đây khi Sửa 1 Debit Note đã gắn sẵn Lô hàng, các dòng chi phí MỚI PHÁT SINH ở
        // lô hàng đó sau khi Debit Note đã được tạo (vd Senior thêm "Phí vận chuyển" ở tab "Debit
        // Note (thu khách)" của lô hàng rồi Lưu) sẽ KHÔNG tự xuất hiện lại — Senior phải tự nhớ bấm
        // "Đồng bộ". Giờ tự động ĐỒNG BỘ (chỉ cộng thêm dòng mới, không xoá gì) ngay khi mở màn Sửa.
        if (data.shipment_id) {
          try {
            const { data: suggest } = await api.get('/debit-notes/suggest-lines', {
              params: { shipment_id: data.shipment_id },
            });
            const toAdd = findNewLinesFromShipment(loadedLines, suggest.lines);
            if (toAdd.length > 0) {
              setLines((prev) => [...prev, ...toAdd]);
              message.info(`Đã tự động đồng bộ thêm ${toAdd.length} dòng chi phí mới từ lô hàng vào Debit Note này.`);
            }
          } catch {
            // Không chặn luồng sửa nếu đồng bộ tự động thất bại (vd mất mạng) — Senior vẫn có nút
            // "Đồng bộ từ lô hàng" để tự bấm lại.
          }
        }
      })
      .catch(() => message.error('Không tải được Debit Note'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // "Đồng bộ từ lô hàng" khi Sửa 1 Debit Note theo id — CHỈ cộng thêm dòng mới, không thay thế
  // toàn bộ (khác hẳn hành vi cũ của nút "Lấy dòng", vốn ghi đè mất dữ liệu Senior đã sửa tay).
  const syncFromShipmentEdit = async () => {
    if (!dnShipmentId) return;
    setPulling(true);
    try {
      const { data } = await api.get('/debit-notes/suggest-lines', { params: { shipment_id: dnShipmentId } });
      const toAdd = findNewLinesFromShipment(lines, data.lines);
      if (toAdd.length === 0) {
        message.info('Không có dòng chi phí mới nào từ lô hàng.');
      } else {
        setLines((prev) => [...prev, ...toAdd]);
        message.success(`Đã đồng bộ thêm ${toAdd.length} dòng chi phí mới từ lô hàng.`);
      }
    } catch {
      message.error('Không đồng bộ được từ lô hàng này');
    } finally {
      setPulling(false);
    }
  };

  const totals = useMemo(() => computeTotals(lines), [lines]);

  const handleSaveEdit = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    if (lines.length === 0) {
      message.error('Cần ít nhất 1 dòng chi phí');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...values,
        ngay_ct: values.ngay_ct ? values.ngay_ct.format(DATE_FMT) : null,
        lines: lines.map((l) => ({
          mo_ta: l.mo_ta,
          don_vi_tinh: l.don_vi_tinh,
          so_luong: l.so_luong,
          don_gia: l.don_gia,
          vat_percent: l.vat_percent,
          so_hoa_don: l.so_hoa_don,
          ghi_chu: l.ghi_chu,
          source_charge_id: l.source_charge_id,
          charge_type: l.charge_type,
        })),
      };
      await api.put(`/debit-notes/${id}`, payload);
      message.success('Đã lưu Debit Note');
      navigate(`/debit-notes/${id}/print`);
    } catch (e) {
      message.error(e?.response?.data?.error || 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  // ================= CHẾ ĐỘ TẠO MỚI KHÔNG GẮN LÔ HÀNG (Debit Note tự do) =========================
  const [freeForm] = Form.useForm();
  const [freeLines, setFreeLines] = useState([]);
  const [freeSaving, setFreeSaving] = useState(false);
  const freeTotals = useMemo(() => computeTotals(freeLines), [freeLines]);
  useEffect(() => {
    if (!isEdit) freeForm.setFieldsValue({ ngay_ct: dayjs() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const handleSaveFree = async () => {
    let values;
    try {
      values = await freeForm.validateFields();
    } catch {
      return;
    }
    if (freeLines.length === 0) {
      message.error('Cần ít nhất 1 dòng chi phí');
      return;
    }
    setFreeSaving(true);
    try {
      const payload = {
        ...values,
        ngay_ct: values.ngay_ct ? values.ngay_ct.format(DATE_FMT) : null,
        lines: freeLines.map((l) => ({
          mo_ta: l.mo_ta,
          don_vi_tinh: l.don_vi_tinh,
          so_luong: l.so_luong,
          don_gia: l.don_gia,
          vat_percent: l.vat_percent,
          so_hoa_don: l.so_hoa_don,
          ghi_chu: l.ghi_chu,
          charge_type: l.charge_type,
        })),
      };
      const { data } = await api.post('/debit-notes', payload);
      message.success('Đã tạo Debit Note');
      navigate(`/debit-notes/${data.id}/print`);
    } catch (e) {
      message.error(e?.response?.data?.error || 'Lưu thất bại');
    } finally {
      setFreeSaving(false);
    }
  };

  if (isEdit) {
    return (
      <div>
        <Space style={{ marginBottom: 16 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/debit-notes')}>
            Quay lại
          </Button>
          <Title level={4} style={{ margin: 0 }}>
            Sửa Debit Note
          </Title>
        </Space>

        <Form form={form} layout="vertical" disabled={loading}>
          {dnShipmentId && (
            <Card style={{ marginBottom: 16 }}>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label="Lô hàng">
                    <Input disabled value={shipments.find((s) => s.id === dnShipmentId)?.ma_lo || `#${dnShipmentId}`} />
                  </Form.Item>
                </Col>
                <Col span={12} style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <Form.Item label=" ">
                    <Button icon={<SyncOutlined spin={pulling} />} onClick={syncFromShipmentEdit} loading={pulling}>
                      Đồng bộ từ lô hàng (chỉ thêm dòng mới)
                    </Button>
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          )}

          <DebitNoteBody
            form={form}
            lines={lines}
            setLines={setLines}
            paymentMethods={paymentMethods}
            customers={customers}
            totals={totals}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Button onClick={() => navigate('/debit-notes')}>Huỷ</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSaveEdit}>
              Lưu
            </Button>
          </div>
        </Form>
      </div>
    );
  }

  // ================= CHẾ ĐỘ TẠO MỚI =================
  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/debit-notes')}>
          Quay lại
        </Button>
        <Title level={4} style={{ margin: 0 }}>
          Tạo Debit Note
        </Title>
      </Space>

      <Card style={{ marginBottom: 16 }}>
        <Form.Item label="Lô hàng (tuỳ chọn)" style={{ marginBottom: 0 }}>
          <Select
            allowClear
            showSearch
            style={{ maxWidth: 420 }}
            optionFilterProp="label"
            placeholder="Chọn lô hàng để tự điền Cước dịch vụ / Chi hộ từ Customer Charges"
            value={newShipmentId}
            options={shipments.map((s) => ({ value: s.id, label: `${s.ma_lo} — ${s.customer_name || ''}` }))}
            onChange={(val) => setNewShipmentId(val)}
          />
        </Form.Item>
        {!newShipmentId && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            Chưa chọn lô hàng: tạo Debit Note tự do (không gắn lô hàng, không có dòng gợi ý sẵn).
          </Text>
        )}
      </Card>

      {newShipmentId ? (
        <ShipmentDebitNotePanel
          key={newShipmentId}
          shipmentId={newShipmentId}
          customers={customers}
          paymentMethods={paymentMethods}
          navigate={navigate}
        />
      ) : (
        <Form form={freeForm} layout="vertical">
          <DebitNoteBody
            form={freeForm}
            lines={freeLines}
            setLines={setFreeLines}
            paymentMethods={paymentMethods}
            customers={customers}
            totals={freeTotals}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Button onClick={() => navigate('/debit-notes')}>Huỷ</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={freeSaving} onClick={handleSaveFree}>
              Lưu
            </Button>
          </div>
        </Form>
      )}
    </div>
  );
}
