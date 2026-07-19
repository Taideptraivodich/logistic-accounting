import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Form, Input, InputNumber, Select, DatePicker, Checkbox, Button,
  Table, Space, message, Typography, AutoComplete, Popconfirm, Tabs,
} from 'antd';
import { PlusOutlined, DeleteOutlined, ArrowLeftOutlined, SaveOutlined, FilePdfOutlined } from '@ant-design/icons';
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

// ================= TAB "DEBIT NOTE" (Customer Charges) =================
// Khoản SẼ THU KHÁCH của lô hàng — độc lập hoàn toàn với Cost sau lần copy đầu tiên (xem ghi chú
// ở schema.sql / routes/shipments.js). Chỉ hoạt động được sau khi lô hàng đã Lưu (có shipmentId
// thật), vì lần copy đầu tiên diễn ra ở backend lúc tạo lô hàng / lần đầu GET tab này.
const VAT_OPTIONS = [
  { value: null, label: 'No VAT' },
  { value: 0, label: '0%' },
  { value: 8, label: '8%' },
  { value: 10, label: '10%' },
];

function CustomerChargesTab({ shipmentId, navigate }) {
  const [lines, setLines] = useState([]);
  const [totals, setTotals] = useState({ subtotal: 0, vat: 0, grand_total: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .get(`/shipments/${shipmentId}/customer-charges`)
      .then(({ data }) => {
        setLines(
          data.lines.map((l) => ({
            key: l.id ?? nextTempId(),
            mo_ta: l.mo_ta,
            don_vi_tinh: l.don_vi_tinh,
            so_luong: l.so_luong,
            don_gia: l.don_gia,
            vat_percent: l.vat_percent,
            ghi_chu: l.ghi_chu,
            source_charge_id: l.source_charge_id,
          }))
        );
        setTotals({ subtotal: data.subtotal, vat: data.vat, grand_total: data.grand_total });
        setDirty(false);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [shipmentId]);

  const updateLine = (key, field, value) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
    setDirty(true);
  };
  const addLine = () => {
    setLines((prev) => [...prev, { key: nextTempId(), mo_ta: '', don_vi_tinh: '', so_luong: 1, don_gia: 0, vat_percent: null, ghi_chu: '' }]);
    setDirty(true);
  };
  const removeLine = (key) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
    setDirty(true);
  };

  const localTotals = useMemo(() => {
    return lines.reduce(
      (acc, l) => {
        const thanhTien = (l.don_gia || 0) * (l.so_luong || 0);
        const vatAmount = l.vat_percent != null ? (thanhTien * l.vat_percent) / 100 : 0;
        return { subtotal: acc.subtotal + thanhTien, vat: acc.vat + vatAmount, grand_total: acc.grand_total + thanhTien + vatAmount };
      },
      { subtotal: 0, vat: 0, grand_total: 0 }
    );
  }, [lines]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/shipments/${shipmentId}/customer-charges`, {
        lines: lines.map((l) => ({
          mo_ta: l.mo_ta,
          don_vi_tinh: l.don_vi_tinh,
          so_luong: l.so_luong,
          don_gia: l.don_gia,
          vat_percent: l.vat_percent,
          ghi_chu: l.ghi_chu,
          source_charge_id: l.source_charge_id,
        })),
      });
      message.success('Đã lưu Debit Note');
      load();
    } catch (e) {
      message.error(e?.response?.data?.error || 'Không lưu được Debit Note');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      title: 'Description',
      dataIndex: 'mo_ta',
      render: (v, r) => <Input value={v} onChange={(e) => updateLine(r.key, 'mo_ta', e.target.value)} placeholder="Mô tả" />,
    },
    {
      title: 'Unit',
      dataIndex: 'don_vi_tinh',
      width: 110,
      render: (v, r) => <Input value={v} onChange={(e) => updateLine(r.key, 'don_vi_tinh', e.target.value)} />,
    },
    {
      title: 'Qty',
      dataIndex: 'so_luong',
      width: 80,
      render: (v, r) => <InputNumber style={{ width: '100%' }} value={v} min={0} onChange={(val) => updateLine(r.key, 'so_luong', val)} />,
    },
    {
      title: 'Unit Price',
      dataIndex: 'don_gia',
      width: 140,
      render: (v, r) => (
        <InputNumber
          style={{ width: '100%' }}
          value={v}
          min={0}
          formatter={(val) => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
          parser={(val) => val.replace(/,/g, '')}
          onChange={(val) => updateLine(r.key, 'don_gia', val)}
        />
      ),
    },
    {
      title: 'VAT',
      dataIndex: 'vat_percent',
      width: 100,
      render: (v, r) => (
        <Select style={{ width: '100%' }} value={v} options={VAT_OPTIONS} onChange={(val) => updateLine(r.key, 'vat_percent', val)} />
      ),
    },
    {
      title: 'Remark',
      dataIndex: 'ghi_chu',
      render: (v, r) => <Input value={v} onChange={(e) => updateLine(r.key, 'ghi_chu', e.target.value)} placeholder="Ghi chú" />,
    },
    {
      title: '',
      width: 50,
      render: (_, r) => (
        <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeLine(r.key)} />
      ),
    },
  ];

  return (
    <div>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
        Đây là khoản SẼ THU KHÁCH — độc lập hoàn toàn với Cost bên tab "Chi phí" (giá bán không
        nhất thiết bằng chi phí thực tế). Lần đầu mở tab này, dữ liệu được copy từ Cost sang; sau
        đó sửa ở đây không ảnh hưởng Cost, và ngược lại.
      </Typography.Text>
      <Table rowKey="key" dataSource={lines} columns={columns} loading={loading} pagination={false} size="small" />
      <Button icon={<PlusOutlined />} style={{ marginTop: 8 }} onClick={addLine}>
        Thêm dòng
      </Button>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 32, marginTop: 16, flexWrap: 'wrap' }}>
        <span>Subtotal: <b>{formatMoney(localTotals.subtotal)}</b></span>
        <span>VAT: <b>{formatMoney(localTotals.vat)}</b></span>
        <span>Grand Total: <b>{formatMoney(localTotals.grand_total)}</b></span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <Button icon={<FilePdfOutlined />} onClick={() => navigate(`/debit-notes/new?shipment_id=${shipmentId}`)}>
          Tạo Debit Note từ đây
        </Button>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave} disabled={!dirty}>
          Lưu Debit Note
        </Button>
      </div>
    </div>
  );
}

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
  const [newSupplierName, setNewSupplierName] = useState('');
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [maLo, setMaLo] = useState(null);
  const [linkedReceipts, setLinkedReceipts] = useState([]);
  const [linkedPayments, setLinkedPayments] = useState([]);
  const [customerName, setCustomerName] = useState(null);

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
          po: data.po,
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
        setMaLo(data.ma_lo);
        setCustomerName(data.customer_name);
        setLinkedReceipts(data.linked_receipts || []);
        setLinkedPayments(data.linked_payments || []);
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

  // Thêm nhanh NCC ngay trong dòng chi phí (vd nhà xe chở hàng chưa có trong danh mục) —
  // để không phải chuyển qua màn Danh mục chỉ để thêm 1 NCC khi đang nhập chi hộ.
  const quickAddSupplier = async (rowKey) => {
    const name = newSupplierName.trim();
    if (!name) return;
    setAddingSupplier(true);
    try {
      const { data } = await api.post('/suppliers', { name });
      setSuppliers((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      updateCharge(rowKey, { supplier_id: data.id });
      setNewSupplierName('');
      message.success(`Đã thêm NCC "${name}"`);
    } catch (e) {
      message.error(e?.response?.data?.error || 'Không thêm được NCC (có thể tên đã tồn tại)');
    } finally {
      setAddingSupplier(false);
    }
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
      width: 190,
      render: (v, row) => (
        <Select
          value={v}
          style={{ width: '100%' }}
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Chọn hoặc thêm NCC"
          options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(val) => updateCharge(row.key, { supplier_id: val })}
          dropdownRender={(menu) => (
            <div>
              {menu}
              <div style={{ display: 'flex', gap: 4, padding: 8, borderTop: '1px solid #f0f0f0' }}>
                <Input
                  size="small"
                  placeholder="Tên NCC mới..."
                  value={newSupplierName}
                  onChange={(e) => setNewSupplierName(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  onPressEnter={() => quickAddSupplier(row.key)}
                />
                <Button
                  size="small"
                  type="primary"
                  loading={addingSupplier}
                  onClick={() => quickAddSupplier(row.key)}
                >
                  Thêm
                </Button>
              </div>
            </div>
          )}
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
      title: (
        <span>
          Đã thanh toán?{' '}
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            (tick sẽ tự tạo phiếu chi khi Lưu)
          </Typography.Text>
        </span>
      ),
      dataIndex: 'da_thanh_toan',
      width: 130,
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

  // v2: KHÔNG còn điều hướng sang màn Phiếu thu/chi để tạo tay nữa — tick "Đã thu" (cước) /
  // "Đã thanh toán" (từng dòng chi phí) rồi Lưu là backend tự tạo phiếu thật (xem
  // regenerateAutoVouchers trong backend/src/routes/shipments.js). Phiếu tạo tay vẫn làm được
  // bình thường ở màn "Phiếu thu / chi" hoặc "Công nợ KH/NCC" như trước, độc lập với cơ chế này.

  const linkedColumns = (isThu) => [
    { title: 'Số CT', dataIndex: 'so_ct', width: 110 },
    { title: 'Ngày', dataIndex: 'ngay_ct', width: 110 },
    { title: 'Nội dung', dataIndex: 'ghi_chu' },
    {
      title: 'Số tiền',
      dataIndex: 'so_tien',
      align: 'right',
      width: 140,
      render: (v) => <span style={{ color: isThu ? '#389e0d' : '#cf1322' }}>{formatMoney(v)}</span>,
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
            <Form.Item
              label="Ngày chứng từ"
              name="ngay_ct"
              initialValue={dayjs()}
              rules={[{ required: true, message: 'Vui lòng chọn ngày chứng từ' }]}
              tooltip="Ngày này dùng để gom lô hàng vào đúng tháng phát sinh ở báo cáo công nợ / doanh thu — bắt buộc nhập."
            >
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
            <Form.Item label="PO" name="po" tooltip="Dùng để hiển thị trên Debit Note (nếu có)">
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
            <Form.Item
              label="Quỹ thu cước"
              name="cuoc_payment_method_id"
              tooltip="Quỹ nhận tiền cước. Tick 'Đã thu?' bên cạnh rồi Lưu để tự tạo phiếu thu thật vào quỹ này."
            >
              <Select
                allowClear
                placeholder="Chọn quỹ"
                options={paymentMethods.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Form.Item>
            <Form.Item
              label="Đã thu?"
              name="cuoc_thu_ngay"
              valuePropName="checked"
              initialValue={false}
              tooltip="Tick khi đã thu tiền cước thật — Lưu sẽ tự tạo phiếu thu (nội dung tự sinh theo mẫu 'Thu cước ...'). Bỏ tick rồi Lưu sẽ tự xoá phiếu thu tương ứng."
            >
              <Checkbox>Đã thu tiền cước</Checkbox>
            </Form.Item>
            <Form.Item label="Ghi chú" name="ghi_chu" style={{ gridColumn: 'span 2' }}>
              <Input />
            </Form.Item>
          </div>
        </div>

        <div style={{ background: '#fff', padding: 24, borderRadius: 8 }}>
          <Tabs
            items={[
              {
                key: 'cost',
                label: 'Chi phí (phải trả nhà cung cấp)',
                children: (
                  <>
                    <Space style={{ width: '100%', justifyContent: 'flex-end', marginBottom: 12 }}>
                      <Button icon={<PlusOutlined />} onClick={addCharge}>
                        Thêm dòng chi phí
                      </Button>
                    </Space>

                    <Table rowKey="key" dataSource={charges} columns={columns} pagination={false} size="small" />

                    <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
                      Lưu ý: Lưu lô hàng sẽ tự tạo (hoặc cập nhật lại) phiếu thu/phiếu chi thật cho những
                      khoản đã tick "Đã thu?" (cước) / "Đã thanh toán?" (từng dòng chi phí) — nội dung tự
                      sinh theo mẫu "TK {'{'}số tờ khai{'}'} - Thu cước/Chi {'{...}'} - {'{'}mã lô{'}'}". Bỏ tick rồi Lưu sẽ tự
                      xoá phiếu tương ứng. Vẫn có thể tạo phiếu tay khác (không gắn theo cơ chế này) ở menu
                      "Phiếu thu / chi" hoặc "Công nợ KH/NCC".
                    </Typography.Text>
                  </>
                ),
              },
              {
                key: 'debit-note',
                label: 'Debit Note (thu khách)',
                disabled: !isEdit,
                children: isEdit ? (
                  <CustomerChargesTab shipmentId={id} navigate={navigate} />
                ) : (
                  <Typography.Text type="secondary">Lưu lô hàng trước để dùng tab này.</Typography.Text>
                ),
              },
            ]}
          />

          {isEdit && (
            <div style={{ marginTop: 24 }}>
              <Title level={5}>Phiếu thu / chi đã gắn với lô hàng này</Title>
              <Typography.Text strong style={{ display: 'block', marginBottom: 4 }}>
                Phiếu thu ({linkedReceipts.length})
              </Typography.Text>
              <Table
                rowKey="id"
                size="small"
                columns={linkedColumns(true)}
                dataSource={linkedReceipts}
                pagination={false}
                locale={{ emptyText: 'Chưa có phiếu thu nào gắn lô này' }}
                style={{ marginBottom: 16 }}
              />
              <Typography.Text strong style={{ display: 'block', marginBottom: 4 }}>
                Phiếu chi ({linkedPayments.length})
              </Typography.Text>
              <Table
                rowKey="id"
                size="small"
                columns={linkedColumns(false)}
                dataSource={linkedPayments}
                pagination={false}
                locale={{ emptyText: 'Chưa có phiếu chi nào gắn lô này' }}
              />
              <Button
                size="small"
                style={{ marginTop: 8 }}
                onClick={() => navigate('/vouchers')}
              >
                Xem/sửa tại màn Phiếu thu / chi
              </Button>
            </div>
          )}

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
