import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Form, Input, InputNumber, Select, DatePicker, Radio, Button,
  Table, Space, message, Typography, Popconfirm, Card, Row, Col,
} from 'antd';
import { PlusOutlined, DeleteOutlined, ArrowLeftOutlined, SaveOutlined, SyncOutlined } from '@ant-design/icons';
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
  const [status, setStatus] = useState('draft');

  useEffect(() => {
    Promise.all([api.get('/shipments'), api.get('/customers'), api.get('/payment-methods')])
      .then(([s, c, p]) => {
        setShipments(s.data);
        setCustomers(c.data);
        setPaymentMethods(p.data);
      })
      .catch(() => message.error('Không tải được danh mục'));
  }, []);

  useEffect(() => {
    if (isEdit) {
      setLoading(true);
      api
        .get(`/debit-notes/${id}`)
        .then(({ data }) => {
          if (data.status !== 'draft') {
            message.warning('Debit Note đã xác nhận, chuyển sang chế độ xem.');
            navigate(`/debit-notes/${id}/print`, { replace: true });
            return;
          }
          setStatus(data.status);
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
          setLines(
            data.lines.map((l) => ({
              key: l.id ?? nextTempId(),
              mo_ta: l.mo_ta,
              don_vi_tinh: l.don_vi_tinh,
              so_luong: l.so_luong,
              don_gia: l.don_gia,
              vat_percent: l.vat_percent,
              so_hoa_don: l.so_hoa_don,
              ghi_chu: l.ghi_chu,
              source_charge_id: l.source_charge_id,
            }))
          );
        })
        .catch(() => message.error('Không tải được Debit Note'))
        .finally(() => setLoading(false));
    } else {
      form.setFieldsValue({ loai: 'dich_vu', ngay_ct: dayjs(), shipment_id: prefillShipmentId ? Number(prefillShipmentId) : undefined });
      if (prefillShipmentId) pullFromShipment(Number(prefillShipmentId), true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const pullFromShipment = async (shipmentId, silent) => {
    if (!shipmentId) return;
    setPulling(true);
    try {
      const { data: shipment } = await api.get(`/shipments/${shipmentId}`);
      if (shipment.customer_id) form.setFieldValue('customer_id', shipment.customer_id);
      const loai = form.getFieldValue('loai');
      // Lọc theo Charge Type: "Phí dịch vụ" chỉ lấy dòng SERVICE, "Phí chi hộ" chỉ lấy dòng
      // DISBURSEMENT (mục 6 yêu cầu sau UAT — không kéo lẫn 2 loại vào 1 Debit Note nữa).
      const { data } = await api.get('/debit-notes/suggest-lines', { params: { shipment_id: shipmentId, loai } });
      const newLines = (data.lines || []).map((l) => ({
        key: nextTempId(),
        mo_ta: l.mo_ta,
        don_vi_tinh: l.don_vi_tinh,
        so_luong: l.so_luong,
        don_gia: l.don_gia,
        vat_percent: l.vat_percent,
        so_hoa_don: '',
        ghi_chu: l.ghi_chu,
        source_charge_id: l.source_charge_id,
      }));
      setLines(newLines);
      if (!silent) message.success(`Đã lấy ${newLines.length} dòng từ Customer Charges của lô hàng (đúng loại "${loai === 'chi_ho' ? 'Chi hộ' : 'Dịch vụ'}")`);
    } catch (e) {
      if (!silent) message.error('Không lấy được Customer Charges của lô hàng này');
    } finally {
      setPulling(false);
    }
  };

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

  const updateLine = (key, field, value) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  const addLine = () =>
    setLines((prev) => [
      ...prev,
      { key: nextTempId(), mo_ta: '', don_vi_tinh: '', so_luong: 1, don_gia: 0, vat_percent: null, so_hoa_don: '', ghi_chu: '' },
    ]);
  const removeLine = (key) => setLines((prev) => prev.filter((l) => l.key !== key));

  const loaiWatch = Form.useWatch('loai', form);

  // HOTFIX (xem AI_HANDOVER.md mục 1): trước đây đổi Radio "Loại" KHÔNG re-fetch/xoá `lines`, nên
  // nếu Senior bấm "Lấy dòng" lúc đang ở "Phí dịch vụ" rồi mới đổi sang "Phí chi hộ", bảng vẫn giữ
  // nguyên các dòng cũ (sai loại) — lưu lại thì Debit Note chứa nhầm dòng của loại kia.
  // Chọn phương án "an toàn": khi Loại đổi (không phải lần set giá trị ban đầu lúc mount/load dữ
  // liệu), xoá sạch `lines` + nhắc Senior chủ động bấm lại "Lấy dòng" — không tự động gọi API ngầm
  // để tránh gây khó hiểu.
  const prevLoaiRef = useRef(undefined);
  useEffect(() => {
    if (loaiWatch === undefined) return;
    if (prevLoaiRef.current !== undefined && prevLoaiRef.current !== loaiWatch) {
      setLines([]);
      message.info('Đã đổi "Loại" — các dòng cũ (thuộc loại trước) đã được xoá để tránh lấy nhầm. Bấm "Lấy dòng từ Customer Charges của lô hàng này" để lấy lại đúng loại mới.');
    }
    prevLoaiRef.current = loaiWatch;
  }, [loaiWatch]);

  const totals = useMemo(
    () =>
      lines.reduce(
        (acc, l) => {
          const thanhTien = (l.don_gia || 0) * (l.so_luong || 0);
          const vatAmount = l.vat_percent != null ? (thanhTien * l.vat_percent) / 100 : 0;
          return { thanh_tien: acc.thanh_tien + thanhTien, vat: acc.vat + vatAmount, tong_cong: acc.tong_cong + thanhTien + vatAmount };
        },
        { thanh_tien: 0, vat: 0, tong_cong: 0 }
      ),
    [lines]
  );

  const columns = [
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
    ...(loaiWatch === 'chi_ho'
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
      let dnId = id;
      if (isEdit) {
        await api.put(`/debit-notes/${id}`, payload);
        message.success('Đã lưu Debit Note');
      } else {
        const { data } = await api.post('/debit-notes', payload);
        dnId = data.id;
        message.success('Đã tạo Debit Note');
      }
      navigate(`/debit-notes/${dnId}/print`);
    } catch (e) {
      message.error(e?.response?.data?.error || 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  const shipmentIdWatch = Form.useWatch('shipment_id', form);

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/debit-notes')}>
          Quay lại
        </Button>
        <Title level={4} style={{ margin: 0 }}>
          {isEdit ? 'Sửa Debit Note' : 'Tạo Debit Note'}
        </Title>
      </Space>

      <Form form={form} layout="vertical" disabled={loading}>
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
            <Col span={6}>
              <Form.Item label="Ngày chứng từ" name="ngay_ct">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="Lô hàng (tuỳ chọn)" name="shipment_id">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="Chọn lô hàng"
                  options={shipments.map((s) => ({ value: s.id, label: `${s.ma_lo} — ${s.customer_name || ''}` }))}
                  onChange={(val) => pullFromShipment(val, false)}
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="Khách hàng" name="customer_id" rules={[{ required: true, message: 'Chọn khách hàng' }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Chọn khách hàng"
                  options={customers.map((c) => ({ value: c.id, label: c.name }))}
                />
              </Form.Item>
            </Col>
          </Row>
          {shipmentIdWatch && (
            <Button size="small" icon={<SyncOutlined spin={pulling} />} onClick={() => pullFromShipment(shipmentIdWatch, false)}>
              Lấy dòng từ Customer Charges của lô hàng này
            </Button>
          )}
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

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
            <Button onClick={() => navigate('/debit-notes')}>Huỷ</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
              Lưu
            </Button>
          </div>
        </Card>
      </Form>
    </div>
  );
}
