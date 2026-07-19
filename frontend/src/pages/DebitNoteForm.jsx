import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Form, Input, InputNumber, Select, DatePicker, Radio, Button,
  Table, Space, message, Typography, Card, Row, Col, Tabs, Alert,
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

const LOAI_LABEL = { dich_vu: 'Phí dịch vụ', chi_ho: 'Phí chi hộ' };

const moneyInputProps = {
  min: 0,
  style: { width: '100%' },
  formatter: (val) => (val === undefined || val === null ? '' : `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')),
  parser: (val) => (val ? val.replace(/,/g, '') : ''),
};

// Chuyển 1 dòng "gợi ý" (từ GET /debit-notes/suggest-lines, thực chất là 1 row của
// shipment_customer_charges) thành 1 dòng local trong bảng "Chi tiết chi phí" của Debit Note.
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
});

// Chuyển 1 dòng debit_note_lines đã lưu trong DB thành dòng local (dùng lúc load lại 1 Debit Note
// đã tồn tại để sửa).
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

function buildLineColumns(loai, updateLine, removeLine) {
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
    ...(loai === 'chi_ho'
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

// ================= Khối "Thông tin nhận tiền / chữ ký" + bảng dòng chi phí + tổng + nút Lưu =====
// Dùng chung cho cả 2 chế độ: sửa 1 Debit Note theo id, và mỗi tab Phí dịch vụ/Phí chi hộ khi tạo
// từ lô hàng — tách ra đây để không lặp code, và để mỗi nơi gọi tự quản lý state `lines`/form của
// riêng nó (không dùng chung 1 state, tránh đúng lỗi cũ là 2 loại giẫm lên nhau).
function DebitNoteBody({ form, loai, lines, setLines, paymentMethods, customers, totals, extraHeader }) {
  const updateLine = (key, field, value) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  const addLine = () =>
    setLines((prev) => [
      ...prev,
      { key: nextTempId(), mo_ta: '', don_vi_tinh: '', so_luong: 1, don_gia: 0, vat_percent: null, so_hoa_don: '', ghi_chu: '' },
    ]);
  const removeLine = (key) => setLines((prev) => prev.filter((l) => l.key !== key));
  const columns = buildLineColumns(loai, updateLine, removeLine);

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

      <Card>
        <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
          <Title level={5} style={{ margin: 0 }}>
            Chi tiết chi phí
          </Title>
          <Button icon={<PlusOutlined />} onClick={addLine}>
            Thêm dòng
          </Button>
        </Space>

        <Table rowKey="key" dataSource={lines} columns={columns} pagination={false} size="small" />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 32, marginTop: 16 }}>
          <span>Thành tiền: <b className="money">{formatMoney(totals.thanh_tien)}</b></span>
          <span>Thuế VAT: <b className="money">{formatMoney(totals.vat)}</b></span>
          <span>Tổng cộng: <b className="money">{formatMoney(totals.tong_cong)}</b></span>
        </div>
      </Card>
    </>
  );
}

// ================= 1 TAB "Phí dịch vụ" / "Phí chi hộ" khi tạo Debit Note từ 1 lô hàng ===========
// Tự tìm Debit Note nháp SẴN CÓ của đúng (shipment_id, loai) này để sửa tiếp; nếu chưa có thì tự
// khởi tạo dòng từ Customer Charges của lô hàng (không cần bấm nút "Lấy dòng" mới thấy dữ liệu).
// Mỗi tab lưu ĐỘC LẬP (Form + `lines` + "Thông tin nhận tiền/chữ ký" riêng, POST/PUT riêng) — bấm
// tab kia không mất dữ liệu tab này. Nút "Đồng bộ từ lô hàng" chỉ CỘNG THÊM dòng mới phát sinh ở
// lô hàng (vd Senior mới thêm "Phí vận chuyển"), không xoá/ghi đè dòng đã có.
function ShipmentDebitNoteTab({ shipmentId, loai, customers, paymentMethods, navigate }) {
  const [form] = Form.useForm();
  const [dnId, setDnId] = useState(null);
  const [lockedConfirmed, setLockedConfirmed] = useState(null); // Debit Note đã Xác nhận (nếu có), không cho sửa tiếp ở đây
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    setLoading(true);
    setLockedConfirmed(null);
    try {
      const { data: list } = await api.get('/debit-notes', { params: { shipment_id: shipmentId, loai } });
      const draft = list.find((r) => r.status === 'draft');
      if (draft) {
        const { data } = await api.get(`/debit-notes/${draft.id}`);
        setDnId(data.id);
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
        setLines(data.lines.map(dnLineToLocal));
      } else if (list.length > 0) {
        // Chỉ có bản đã "Xác nhận" — khoá, không cho sửa tiếp ở màn này (tránh tạo trùng/lệch số
        // với bản đã chốt). Senior cần vào danh sách Debit Note, "Huỷ xác nhận" trước nếu muốn sửa.
        setLockedConfirmed(list[0]);
        setDnId(null);
        setLines([]);
      } else {
        // Chưa có Debit Note nào cho (lô hàng, loại) này -> tự khởi tạo từ Customer Charges, không
        // cần Senior bấm nút mới thấy dữ liệu.
        setDnId(null);
        const [{ data: shipment }, { data: suggest }] = await Promise.all([
          api.get(`/shipments/${shipmentId}`),
          api.get('/debit-notes/suggest-lines', { params: { shipment_id: shipmentId, loai } }),
        ]);
        form.setFieldsValue({ ngay_ct: dayjs(), customer_id: shipment.customer_id || undefined });
        setLines((suggest.lines || []).map(chargeToLine));
      }
    } catch {
      message.error(`Không tải được dữ liệu "${LOAI_LABEL[loai]}" của lô hàng này`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipmentId, loai]);

  const syncFromShipment = async () => {
    setSyncing(true);
    try {
      const { data } = await api.get('/debit-notes/suggest-lines', { params: { shipment_id: shipmentId, loai } });
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
        loai,
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
        })),
      };
      if (dnId) {
        await api.put(`/debit-notes/${dnId}`, payload);
        message.success(`Đã lưu Debit Note "${LOAI_LABEL[loai]}"`);
      } else {
        const { data } = await api.post('/debit-notes', payload);
        setDnId(data.id);
        message.success(`Đã tạo Debit Note "${LOAI_LABEL[loai]}"`);
      }
    } catch (e) {
      message.error(e?.response?.data?.error || 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  if (lockedConfirmed) {
    return (
      <Alert
        type="warning"
        showIcon
        message={`Debit Note "${LOAI_LABEL[loai]}" của lô hàng này đã Xác nhận (Số ${lockedConfirmed.so_dn})`}
        description="Không thể sửa tiếp ở đây. Vào danh sách Debit Note để xem/in, hoặc Huỷ xác nhận trước nếu cần sửa."
        action={
          <Button size="small" onClick={() => navigate(`/debit-notes/${lockedConfirmed.id}/print`)}>
            Xem / In
          </Button>
        }
      />
    );
  }

  return (
    <Form form={form} layout="vertical" disabled={loading}>
      <DebitNoteBody
        form={form}
        loai={loai}
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
          Lưu {LOAI_LABEL[loai]}
        </Button>
      </div>
    </Form>
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

  // Chọn lô hàng khi TẠO MỚI (chưa lưu) — quyết định có chuyển sang UI "2 tab" hay không.
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
          loai: data.loai,
          ngay_ct: data.ngay_ct ? dayjs(data.ngay_ct) : null,
          shipment_id: data.shipment_id,
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

        // FIX: trước đây khi Sửa 1 Debit Note đã gắn sẵn Lô hàng, các dòng chi phí MỚI PHÁT SINH
        // ở lô hàng đó sau khi Debit Note đã được tạo (vd Senior thêm "Phí vận chuyển" ở tab
        // "Debit Note (thu khách)" của lô hàng rồi Lưu) sẽ KHÔNG tự xuất hiện lại — Senior phải tự
        // nhớ bấm "Lấy dòng" (mà bấm vào lại XOÁ HẾT các dòng đã sửa tay để thay bằng danh sách
        // mới, rất dễ mất dữ liệu). Giờ tự động ĐỒNG BỘ (chỉ cộng thêm dòng mới, không xoá gì) ngay
        // khi mở màn Sửa, để Senior thấy đúng dòng "Phí vận chuyển" mới mà không cần làm gì thêm;
        // bấm Lưu là dòng mới được lưu lại luôn.
        if (data.shipment_id) {
          try {
            const { data: suggest } = await api.get('/debit-notes/suggest-lines', {
              params: { shipment_id: data.shipment_id, loai: data.loai },
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
      const loai = form.getFieldValue('loai');
      const { data } = await api.get('/debit-notes/suggest-lines', { params: { shipment_id: dnShipmentId, loai } });
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
  const loaiWatch = Form.useWatch('loai', form);

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
  const freeLoaiWatch = Form.useWatch('loai', freeForm);
  const freeTotals = useMemo(() => computeTotals(freeLines), [freeLines]);
  useEffect(() => {
    if (!isEdit) freeForm.setFieldsValue({ loai: 'dich_vu', ngay_ct: dayjs() });
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
          <Card style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col span={6}>
                <Form.Item label="Loại" name="loai">
                  {/* Loại không đổi được sau khi tạo (mỗi Debit Note thuộc đúng 1 loại cố định ở
                      backend) — chỉ hiển thị, khoá cứng, không phải Radio để tránh hiểu nhầm là
                      đổi được như trước (đổi trên UI nhưng backend không lưu, gây sai lệch). */}
                  <Radio.Group
                    disabled
                    options={[
                      { value: 'dich_vu', label: 'Phí dịch vụ' },
                      { value: 'chi_ho', label: 'Phí chi hộ' },
                    ]}
                    optionType="button"
                    buttonStyle="solid"
                  />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label="Lô hàng">
                  <Input
                    disabled
                    value={dnShipmentId ? shipments.find((s) => s.id === dnShipmentId)?.ma_lo || `#${dnShipmentId}` : '(không gắn lô hàng)'}
                  />
                </Form.Item>
              </Col>
              {dnShipmentId && (
                <Col span={12} style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <Form.Item label=" ">
                    <Button icon={<SyncOutlined spin={pulling} />} onClick={syncFromShipmentEdit} loading={pulling}>
                      Đồng bộ từ lô hàng (chỉ thêm dòng mới)
                    </Button>
                  </Form.Item>
                </Col>
              )}
            </Row>
          </Card>

          <DebitNoteBody
            form={form}
            loai={loaiWatch}
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
            placeholder="Chọn lô hàng để tạo Debit Note theo 2 tab Phí dịch vụ / Phí chi hộ"
            value={newShipmentId}
            options={shipments.map((s) => ({ value: s.id, label: `${s.ma_lo} — ${s.customer_name || ''}` }))}
            onChange={(val) => setNewShipmentId(val)}
          />
        </Form.Item>
        {!newShipmentId && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            Chưa chọn lô hàng: tạo Debit Note tự do (không gắn lô hàng, không có danh mục Cước dịch vụ gợi ý).
          </Text>
        )}
      </Card>

      {newShipmentId ? (
        <Tabs
          items={[
            {
              key: 'dich_vu',
              label: 'Phí dịch vụ',
              children: (
                <ShipmentDebitNoteTab
                  key={`dich_vu-${newShipmentId}`}
                  shipmentId={newShipmentId}
                  loai="dich_vu"
                  customers={customers}
                  paymentMethods={paymentMethods}
                  navigate={navigate}
                />
              ),
            },
            {
              key: 'chi_ho',
              label: 'Phí chi hộ',
              children: (
                <ShipmentDebitNoteTab
                  key={`chi_ho-${newShipmentId}`}
                  shipmentId={newShipmentId}
                  loai="chi_ho"
                  customers={customers}
                  paymentMethods={paymentMethods}
                  navigate={navigate}
                />
              ),
            },
          ]}
        />
      ) : (
        <Form form={freeForm} layout="vertical">
          <Card style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col span={6}>
                <Form.Item label="Loại" name="loai" rules={[{ required: true }]}>
                  <Radio.Group
                    options={[
                      { value: 'dich_vu', label: 'Phí dịch vụ' },
                      { value: 'chi_ho', label: 'Phí chi hộ' },
                    ]}
                    optionType="button"
                    buttonStyle="solid"
                  />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <DebitNoteBody
            form={freeForm}
            loai={freeLoaiWatch}
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
