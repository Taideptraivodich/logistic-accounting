import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Form, Input, InputNumber, Select, DatePicker, Checkbox, Button,
  Table, Space, message, Typography, AutoComplete, Popconfirm,
} from 'antd';
import { PlusOutlined, DeleteOutlined, ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api/client';
import { formatMoney } from '../utils/format';

const { Title } = Typography;
const DATE_FMT = 'YYYY-MM-DD';

let tempIdCounter = 0;
const nextTempId = () => `tmp-${Date.now()}-${tempIdCounter++}`;

const moneyProps = {
  min: 0,
  style: { width: '100%' },
  formatter: (val) => (val === undefined || val === null ? '' : `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')),
  parser: (val) => (val ? val.replace(/,/g, '') : ''),
};

export default function ShipmentForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [form] = Form.useForm();

  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [feeTypes, setFeeTypes] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [charges, setCharges] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // ---- Tải danh mục ----
  useEffect(() => {
    (async () => {
      try {
        const [c, s, f, p] = await Promise.all([
          api.get('/customers'),
          api.get('/suppliers'),
          api.get('/fee-types'),
          api.get('/payment-methods'),
        ]);
        setCustomers(c.data);
        setSuppliers(s.data);
        setFeeTypes(f.data);
        setPaymentMethods(p.data);
      } catch {
        message.error('Không tải được danh mục');
      }
    })();
  }, []);

  // ---- Tải lô hàng khi sửa ----
  useEffect(() => {
    if (!isEdit) return;
    setLoading(true);
    api
      .get(`/shipments/${id}`)
      .then(({ data }) => {
        form.setFieldsValue({
          ngay_ct: data.ngay_ct ? dayjs(data.ngay_ct) : null,
          customer_id: data.customer_id,
          invoice: data.invoice,
          so_to_khai: data.so_to_khai,
          ngay_to_khai: data.ngay_to_khai ? dayjs(data.ngay_to_khai) : null,
          so_container: data.so_container,
          so_luong_cont: data.so_luong_cont,
          cuoc_dv: data.cuoc_dv,
          cuoc_payment_method_id: data.cuoc_payment_method_id,
          cuoc_thu_ngay: !!data.cuoc_thu_ngay,
          ghi_chu: data.ghi_chu,
        });
        setCharges(
          (data.charges || []).map((c) => ({
            key: c.id ?? nextTempId(),
            id: c.id,
            loai_phi: c.loai_phi,
            supplier_id: c.supplier_id,
            payment_method_id: c.payment_method_id,
            so_tien: c.so_tien,
            da_thanh_toan: !!c.da_thanh_toan,
            la_chi_ho: !!c.la_chi_ho,
            ghi_chu: c.ghi_chu,
          }))
        );
      })
      .catch(() => message.error('Không tải được lô hàng'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const addCharge = () => {
    setCharges((prev) => [
      ...prev,
      {
        key: nextTempId(),
        loai_phi: null,
        supplier_id: null,
        payment_method_id: null,
        so_tien: 0,
        da_thanh_toan: false,
        la_chi_ho: false,
        ghi_chu: '',
      },
    ]);
  };

  const updateCharge = (key, patch) => {
    setCharges((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  };

  const removeCharge = (key) => {
    setCharges((prev) => prev.filter((c) => c.key !== key));
  };

  // ---- Tính tổng trực tiếp (đồng bộ công thức mới: doanh thu = cước dv + chi hộ) ----
  const cuocDv = Form.useWatch('cuoc_dv', form) || 0;
  const tongChiPhi = useMemo(() => charges.reduce((a, c) => a + (Number(c.so_tien) || 0), 0), [charges]);
  const tongChiHo = useMemo(
    () => charges.reduce((a, c) => a + (c.la_chi_ho ? Number(c.so_tien) || 0 : 0), 0),
    [charges]
  );
  const doanhThuDuKien = cuocDv + tongChiHo;
  const loiNhuanDuKien = doanhThuDuKien - tongChiPhi;

  const columns = [
    {
      title: 'Loại phí',
      dataIndex: 'loai_phi',
      width: 170,
      render: (v, row) => (
        <AutoComplete
          value={v}
          style={{ width: '100%' }}
          options={feeTypes.map((f) => ({ value: f.name }))}
          filterOption={(input, option) => option.value.toLowerCase().includes(input.toLowerCase())}
          onChange={(val) => updateCharge(row.key, { loai_phi: val })}
          placeholder="Loại phí"
        />
      ),
    },
    {
      title: 'Nhà cung cấp',
      dataIndex: 'supplier_id',
      width: 170,
      render: (v, row) => (
        <Select
          value={v}
          style={{ width: '100%' }}
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Chọn NCC"
          options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(val) => updateCharge(row.key, { supplier_id: val })}
        />
      ),
    },
    {
      title: 'Số tiền',
      dataIndex: 'so_tien',
      width: 140,
      render: (v, row) => (
        <InputNumber {...moneyProps} value={v} onChange={(val) => updateCharge(row.key, { so_tien: val || 0 })} />
      ),
    },
    {
      title: 'Đã thanh toán?',
      dataIndex: 'da_thanh_toan',
      width: 110,
      align: 'center',
      render: (v, row) => (
        <Checkbox checked={v} onChange={(e) => updateCharge(row.key, { da_thanh_toan: e.target.checked })} />
      ),
    },
    {
      // MỚI: đánh dấu khoản chi phí này là "chi hộ" khách (mình trả trước cho NCC/HQ,
      // thu lại từ khách sau) -> sẽ được cộng vào "phải thu" của khách hàng ở báo cáo công nợ.
      title: 'Chi hộ?',
      dataIndex: 'la_chi_ho',
      width: 90,
      align: 'center',
      render: (v, row) => (
        <Checkbox checked={v} onChange={(e) => updateCharge(row.key, { la_chi_ho: e.target.checked })} />
      ),
    },
    {
      title: 'Quỹ chi',
      dataIndex: 'payment_method_id',
      width: 140,
      render: (v, row) => (
        <Select
          value={v}
          style={{ width: '100%' }}
          allowClear
          placeholder="Quỹ chi"
          options={paymentMethods.map((p) => ({ value: p.id, label: p.name }))}
          onChange={(val) => updateCharge(row.key, { payment_method_id: val })}
        />
      ),
    },
    {
      title: 'Ghi chú',
      dataIndex: 'ghi_chu',
      render: (v, row) => <Input value={v} onChange={(e) => updateCharge(row.key, { ghi_chu: e.target.value })} />,
    },
    {
      title: '',
      width: 50,
      render: (_, row) => (
        <Popconfirm title="Xoá dòng chi phí này?" onConfirm={() => removeCharge(row.key)}>
          <Button type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  const handleSave = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return; // lỗi hiển thị ngay tại field, không cần message riêng
    }
    setSaving(true);
    try {
      const ngayCtStr = values.ngay_ct ? values.ngay_ct.format(DATE_FMT) : null;
      const payload = {
        ...values,
        ngay_ct: ngayCtStr,
        ngay_to_khai: values.ngay_to_khai ? values.ngay_to_khai.format(DATE_FMT) : null,
        charges: charges.map((c) => ({
          ngay_ct: ngayCtStr,
          loai_phi: c.loai_phi,
          supplier_id: c.supplier_id,
          payment_method_id: c.payment_method_id,
          so_tien: c.so_tien,
          da_thanh_toan: c.da_thanh_toan,
          la_chi_ho: c.la_chi_ho,
          ghi_chu: c.ghi_chu,
        })),
      };
      if (isEdit) {
        await api.put(`/shipments/${id}`, payload);
        message.success('Đã cập nhật lô hàng');
      } else {
        await api.post('/shipments', payload);
        message.success('Đã tạo lô hàng');
      }
      navigate('/shipments');
    } catch (e) {
      message.error(e?.response?.data?.error || 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/shipments')}>
          Quay lại
        </Button>
        <Title level={4} style={{ margin: 0 }}>
          {isEdit ? 'Sửa lô hàng' : 'Tạo lô hàng'}
        </Title>
      </Space>

      <Form form={form} layout="vertical" disabled={loading}>
        <div style={{ background: '#fff', padding: 24, borderRadius: 8, marginBottom: 16 }}>
          <Title level={5}>Thông tin chung</Title>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0 16px' }}>
            <Form.Item label="Ngày chứng từ" name="ngay_ct">
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item>
            <Form.Item
              label="Khách hàng"
              name="customer_id"
              rules={[{ required: true, message: 'Vui lòng chọn khách hàng' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="Chọn khách hàng"
                options={customers.map((c) => ({ value: c.id, label: c.name }))}
                onChange={(val) => {
                  const cust = customers.find((c) => c.id === val);
                  if (cust && !form.getFieldValue('cuoc_dv')) {
                    form.setFieldValue('cuoc_dv', cust.default_cuoc_dv);
                  }
                }}
              />
            </Form.Item>
            <Form.Item label="Invoice" name="invoice">
              <Input />
            </Form.Item>
            <Form.Item label="Số tờ khai" name="so_to_khai">
              <Input />
            </Form.Item>
            <Form.Item label="Ngày tờ khai" name="ngay_to_khai">
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item>
            <Form.Item label="Số container" name="so_container">
              <Input />
            </Form.Item>
            <Form.Item label="Số lượng cont" name="so_luong_cont">
              <Input />
            </Form.Item>
            <Form.Item label="Cước dịch vụ (Doanh thu)" name="cuoc_dv">
              <InputNumber {...moneyProps} />
            </Form.Item>
            <Form.Item label="Quỹ thu cước" name="cuoc_payment_method_id">
              <Select
                allowClear
                placeholder="Chọn quỹ"
                options={paymentMethods.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Form.Item>
            <Form.Item label=" " name="cuoc_thu_ngay" valuePropName="checked">
              <Checkbox>Đã thu cước ngay (tự tạo phiếu thu)</Checkbox>
            </Form.Item>
            <Form.Item label="Ghi chú" name="ghi_chu" style={{ gridColumn: 'span 2' }}>
              <Input />
            </Form.Item>
          </div>
        </div>

        <div style={{ background: '#fff', padding: 24, borderRadius: 8 }}>
          <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
            <Title level={5} style={{ margin: 0 }}>
              Chi phí phát sinh (phải trả nhà cung cấp)
            </Title>
            <Button icon={<PlusOutlined />} onClick={addCharge}>
              Thêm dòng chi phí
            </Button>
          </Space>

          <Table rowKey="key" dataSource={charges} columns={columns} pagination={false} size="small" />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 32, marginTop: 16, flexWrap: 'wrap' }}>
            <span>
              Tổng chi phí: <b>{formatMoney(tongChiPhi)}</b>
            </span>
            <span>
              Trong đó chi hộ: <b>{formatMoney(tongChiHo)}</b>
            </span>
            <span>
              Doanh thu dự kiến: <b>{formatMoney(doanhThuDuKien)}</b>
            </span>
            <span style={{ color: loiNhuanDuKien >= 0 ? '#389e0d' : '#cf1322' }}>
              Lợi nhuận dự kiến: <b>{formatMoney(loiNhuanDuKien)}</b>
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
            <Button onClick={() => navigate('/shipments')}>Huỷ</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
              Lưu
            </Button>
          </div>
        </div>
      </Form>
    </div>
  );
}
