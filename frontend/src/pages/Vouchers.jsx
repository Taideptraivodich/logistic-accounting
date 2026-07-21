import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Tabs, Table, Button, Modal, Form, Select, InputNumber, DatePicker,
  Input, Space, Popconfirm, message, Radio, Tag,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, CopyOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api/client';
import { formatMoney } from '../utils/format';

const moneyProps = {
  style: { width: '100%' },
  min: 0,
  formatter: (v) => (v === undefined || v === null ? '' : `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')),
  parser: (v) => (v ? v.replace(/,/g, '') : ''),
};

// kind: 'receipts' | 'payments'. Mỗi phiếu giờ có thể gắn với 1 trong 2 dạng đối tượng:
//  - "owner" (Khách hàng cho phiếu thu / Nhà cung cấp cho phiếu chi), HOẶC
//  - "category" (danh mục thu/chi khác — chi in hồ sơ, mua văn phòng phẩm, thu khác...)
// không nhất thiết phải là thu KH / chi NCC như trước.
function VoucherTable({
  kind, ownerOptions, ownerField, ownerLabel, categoryOptions,
  paymentMethods, shipments, presetOwnerId, presetPaymentMethodId,
  presetShipmentId, presetAmount, presetGhiChu, autoOpenNew, onAutoOpened,
}) {
  const isThu = kind === 'receipts';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [ownerFilter, setOwnerFilter] = useState(presetOwnerId ? Number(presetOwnerId) : undefined);
  const [pmFilter, setPmFilter] = useState(presetPaymentMethodId ? Number(presetPaymentMethodId) : undefined);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [targetType, setTargetType] = useState('owner'); // 'owner' | 'category'
  const [form] = Form.useForm();

  const load = () => {
    setLoading(true);
    const params = {};
    if (ownerFilter) params[ownerField] = ownerFilter;
    if (pmFilter) params.payment_method_id = pmFilter;
    api
      .get(`/vouchers/${kind}`, { params })
      .then((res) => setRows(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerFilter, pmFilter]);

  const filteredRows = useMemo(() => {
    if (!q.trim()) return rows;
    const like = q.trim().toLowerCase();
    return rows.filter((r) =>
      [r.so_ct, r.ghi_chu, r.ma_lo, isThu ? r.customer_name : r.supplier_name, r.category_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(like))
    );
  }, [rows, q, isThu]);

  const openNew = () => {
    setEditing(null);
    setTargetType('owner');
    form.resetFields();
    form.setFieldsValue({
      ngay_ct: dayjs(),
      [ownerField]: presetOwnerId ? Number(presetOwnerId) : ownerFilter,
      shipment_id: presetShipmentId ? Number(presetShipmentId) : undefined,
      so_tien: presetAmount ? Number(presetAmount) : undefined,
      ghi_chu: presetGhiChu || undefined,
    });
    setModalOpen(true);
  };

  // Nếu được điều hướng tới từ màn Lô hàng / Công nợ kèm dữ liệu tạo sẵn (?new=1&shipment_id=...&amount=...&ghi_chu=...),
  // tự mở modal "Tạo phiếu" luôn kèm dữ liệu điền sẵn, khỏi phải bấm lại và nhập lại từ đầu.
  useEffect(() => {
    if (autoOpenNew) {
      openNew();
      onAutoOpened?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenNew]);

  // Chọn "Lô hàng liên kết" trong modal -> tự gen Nội dung + Số tiền, theo quy cách:
  // Thu: "TK {số tờ khai} - Thu cước {tên khách hàng} - {mã lô}", số tiền = s.con_no (phải thu ĐÃ
  // GỒM VAT, trừ đi các phiếu thu đã có gắn với lô này — xem backend routes/shipments.js
  // getShipmentFull) — KHÔNG dùng s.doanh_thu (trước thuế) hay tổng gộp nữa, vì Senior tạo phiếu
  // thu tay ở đây thường là để thu PHẦN CÒN THIẾU (ví dụ phần VAT bị thiếu ở phiếu tự sinh), không
  // phải thu lại từ đầu toàn bộ giá trị lô hàng.
  // Chi: "TK {số tờ khai} - Chi {các loại phí} - {mã lô}", số tiền = tổng chi phí (đã gồm chi hộ).
  // Lấy chi tiết đầy đủ (charges) qua GET /shipments/:id thay vì chỉ dùng danh sách rút gọn,
  // để liệt kê đúng các "loại phí" thật của lô hàng cho phần chi.
  const onShipmentPick = async (shipmentId) => {
    if (!shipmentId) return;
    try {
      const { data: s } = await api.get(`/shipments/${shipmentId}`);
      const tkPart = s.so_to_khai ? `TK ${s.so_to_khai} - ` : '';
      if (isThu) {
        const soTien = Math.max(s.con_no ?? s.phai_thu ?? 0, 0);
        const ghiChu = `${tkPart}Thu cước ${s.customer_name || ''} - ${s.ma_lo}`.replace(/\s+/g, ' ').trim();
        setTargetType('owner');
        form.setFieldsValue({ so_tien: soTien, ghi_chu: ghiChu, [ownerField]: s.customer_id });
      } else {
        const soTien = s.tong_chi_phi || 0;
        const loaiPhiList = [...new Set((s.charges || []).map((c) => c.loai_phi).filter(Boolean))];
        const loaiPhiPart = loaiPhiList.length ? loaiPhiList.join(' + ') : 'phí';
        const ghiChu = `${tkPart}Chi ${loaiPhiPart} - ${s.ma_lo}`.replace(/\s+/g, ' ').trim();
        form.setFieldsValue({ so_tien: soTien, ghi_chu: ghiChu });
      }
    } catch {
      // Không chặn luồng nhập liệu nếu lấy chi tiết lô hàng thất bại — Senior vẫn tự gõ tay được.
    }
  };

  const openEdit = (r) => {
    setEditing(r);
    setTargetType(r.category_id ? 'category' : 'owner');
    form.setFieldsValue({
      [ownerField]: r[ownerField],
      category_id: r.category_id,
      shipment_id: r.shipment_id,
      ngay_ct: r.ngay_ct ? dayjs(r.ngay_ct) : null,
      so_tien: r.so_tien,
      payment_method_id: r.payment_method_id,
      ghi_chu: r.ghi_chu,
    });
    setModalOpen(true);
  };

  // Nhân bản phiếu: mở modal "Tạo phiếu" (không phải Sửa — editing=null nên Lưu sẽ POST tạo mới,
  // backend tự sinh Số CT mới) với dữ liệu điền sẵn giống phiếu gốc. Ngày chứng từ mặc định là
  // hôm nay (trường hợp dùng phổ biến nhất: lặp lại 1 khoản thu/chi tương tự cho lần phát sinh
  // mới) — Senior vẫn sửa lại ngày/số tiền/nội dung tự do trước khi Lưu.
  const openDuplicate = (r) => {
    setEditing(null);
    setTargetType(r.category_id ? 'category' : 'owner');
    form.setFieldsValue({
      [ownerField]: r[ownerField],
      category_id: r.category_id,
      shipment_id: r.shipment_id,
      ngay_ct: dayjs(),
      so_tien: r.so_tien,
      payment_method_id: r.payment_method_id,
      ghi_chu: r.ghi_chu,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const v = await form.validateFields();
      const payload = {
        ...v,
        ngay_ct: v.ngay_ct ? v.ngay_ct.format('YYYY-MM-DD') : null,
        [ownerField]: targetType === 'owner' ? v[ownerField] : null,
        category_id: targetType === 'category' ? v.category_id : null,
      };
      if (editing) {
        await api.put(`/vouchers/${kind}/${editing.id}`, payload);
        message.success('Đã cập nhật phiếu');
      } else {
        await api.post(`/vouchers/${kind}`, payload);
        message.success('Đã tạo phiếu');
      }
      setModalOpen(false);
      load();
    } catch (e) {
      if (!e?.errorFields) message.error(e?.response?.data?.error || 'Có lỗi xảy ra');
    }
  };

  const handleDelete = async (id) => {
    await api.delete(`/vouchers/${kind}/${id}`);
    message.success('Đã xoá phiếu');
    load();
  };

  const columns = [
    { title: 'Số CT', dataIndex: 'so_ct', width: 110 },
    { title: 'Ngày CT', dataIndex: 'ngay_ct', width: 100 },
    {
      title: 'Đối tượng',
      width: 190,
      render: (_, r) => (
        <span>
          {r.category_id ? (
            <span style={{ color: '#8c8c8c' }}>{r.category_name} <i>(khác)</i></span>
          ) : (
            isThu ? r.customer_name : r.supplier_name
          )}
          {r.auto_generated ? (
            <Tag color="blue" style={{ marginLeft: 6 }}>Tự động</Tag>
          ) : null}
        </span>
      ),
    },
    { title: 'Mã lô liên kết', dataIndex: 'ma_lo', width: 110, render: (v) => v || <span style={{ color: '#999' }}>—</span> },
    {
      title: 'Số tiền',
      dataIndex: 'so_tien',
      align: 'right',
      width: 130,
      render: (v) => <span className={`money ${isThu ? 'money-pos' : 'money-neg'}`}>{formatMoney(v)}</span>,
    },
    { title: 'Quỹ', dataIndex: 'payment_method_name', width: 110 },
    { title: 'Nội dung', dataIndex: 'ghi_chu' },
    {
      title: '',
      width: 90,
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} title="Sửa" />
          <Button size="small" icon={<CopyOutlined />} onClick={() => openDuplicate(r)} title="Nhân bản" />
          <Popconfirm title="Xoá phiếu này?" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} title="Xoá" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 12 }} wrap>
        <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>
          {isThu ? 'Tạo phiếu thu' : 'Tạo phiếu chi'}
        </Button>
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder={`Lọc theo ${ownerLabel.toLowerCase()}`}
          style={{ width: 220 }}
          value={ownerFilter}
          onChange={setOwnerFilter}
          options={ownerOptions}
        />
        <Select
          allowClear
          placeholder="Lọc theo quỹ"
          style={{ width: 160 }}
          value={pmFilter}
          onChange={setPmFilter}
          options={paymentMethods.map((p) => ({ label: p.name, value: p.id }))}
        />
        <Input
          placeholder="Tìm số CT, ghi chú, mã lô..."
          allowClear
          style={{ width: 260 }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          prefix={<SearchOutlined />}
        />
      </Space>
      <Table rowKey="id" columns={columns} dataSource={filteredRows} loading={loading} pagination={{ pageSize: 20 }} size="small" />

      <Modal
        title={editing ? `Sửa ${isThu ? 'phiếu thu' : 'phiếu chi'}` : `Tạo ${isThu ? 'phiếu thu' : 'phiếu chi'}`}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        okText="Lưu"
      >
        <Form form={form} layout="vertical">
          <Form.Item label="Loại đối tượng">
            <Radio.Group value={targetType} onChange={(e) => setTargetType(e.target.value)}>
              <Radio.Button value="owner">{ownerLabel}</Radio.Button>
              <Radio.Button value="category">{isThu ? 'Thu khác' : 'Chi khác'}</Radio.Button>
            </Radio.Group>
          </Form.Item>

          {targetType === 'owner' ? (
            <Form.Item
              label={ownerLabel}
              name={ownerField}
              rules={[{ required: targetType === 'owner', message: `Vui lòng chọn ${ownerLabel.toLowerCase()}` }]}
            >
              <Select options={ownerOptions} showSearch optionFilterProp="label" />
            </Form.Item>
          ) : (
            <Form.Item
              label={isThu ? 'Danh mục thu khác' : 'Danh mục chi khác'}
              name="category_id"
              rules={[{ required: targetType === 'category', message: 'Vui lòng chọn danh mục' }]}
            >
              <Select
                options={categoryOptions}
                showSearch
                optionFilterProp="label"
                placeholder={isThu ? 'VD: Thu khác' : 'VD: Chi in hồ sơ, Chi mua văn phòng phẩm...'}
              />
            </Form.Item>
          )}

          <Form.Item label="Lô hàng liên kết (không bắt buộc)" name="shipment_id">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Chọn lô hàng nếu có — chọn xong sẽ tự điền Nội dung và Số tiền (tổng)"
              options={shipments.map((s) => ({ value: s.id, label: `${s.ma_lo} — ${s.customer_name || ''}` }))}
              onChange={(shipmentId) => onShipmentPick(shipmentId)}
            />
          </Form.Item>
          <Form.Item label="Ngày chứng từ" name="ngay_ct">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item label="Số tiền" name="so_tien" rules={[{ required: true, message: 'Vui lòng nhập số tiền' }]}>
            <InputNumber {...moneyProps} />
          </Form.Item>
          <Form.Item label={isThu ? 'Thu vào quỹ' : 'Chi từ quỹ'} name="payment_method_id">
            <Select options={paymentMethods.map((p) => ({ label: p.name, value: p.id }))} allowClear />
          </Form.Item>
          <Form.Item label="Nội dung" name="ghi_chu">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default function Vouchers() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [categoriesThu, setCategoriesThu] = useState([]);
  const [categoriesChi, setCategoriesChi] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [shipments, setShipments] = useState([]);

  useEffect(() => {
    api.get('/customers').then((res) => setCustomers(res.data));
    api.get('/suppliers').then((res) => setSuppliers(res.data));
    api.get('/voucher-categories', { params: { type: 'thu' } }).then((res) => setCategoriesThu(res.data));
    api.get('/voucher-categories', { params: { type: 'chi' } }).then((res) => setCategoriesChi(res.data));
    api.get('/payment-methods').then((res) => setPaymentMethods(res.data));
    api.get('/shipments').then((res) => setShipments(res.data));
  }, []);

  const activeTab = searchParams.get('tab') === 'chi' ? 'chi' : 'thu';
  const wantsAutoNew = searchParams.get('new') === '1';

  const clearAutoNewParam = () => {
    setSearchParams((p) => {
      const next = Object.fromEntries(p);
      delete next.new;
      delete next.shipment_id;
      delete next.amount;
      delete next.ghi_chu;
      return next;
    });
  };

  const items = [
    {
      key: 'thu',
      label: 'Phiếu thu',
      children: (
        <VoucherTable
          kind="receipts"
          ownerField="customer_id"
          ownerLabel="Khách hàng"
          ownerOptions={customers.map((c) => ({ label: c.name, value: c.id }))}
          categoryOptions={categoriesThu.map((c) => ({ label: c.name, value: c.id }))}
          paymentMethods={paymentMethods}
          shipments={shipments}
          presetOwnerId={searchParams.get('customer_id')}
          presetPaymentMethodId={searchParams.get('payment_method_id')}
          presetShipmentId={searchParams.get('shipment_id')}
          presetAmount={searchParams.get('amount')}
          presetGhiChu={searchParams.get('ghi_chu')}
          autoOpenNew={activeTab === 'thu' && wantsAutoNew}
          onAutoOpened={clearAutoNewParam}
        />
      ),
    },
    {
      key: 'chi',
      label: 'Phiếu chi',
      children: (
        <VoucherTable
          kind="payments"
          ownerField="supplier_id"
          ownerLabel="Nhà cung cấp"
          ownerOptions={suppliers.map((s) => ({ label: s.name, value: s.id }))}
          categoryOptions={categoriesChi.map((c) => ({ label: c.name, value: c.id }))}
          paymentMethods={paymentMethods}
          shipments={shipments}
          presetOwnerId={searchParams.get('supplier_id')}
          presetPaymentMethodId={searchParams.get('payment_method_id')}
          presetShipmentId={searchParams.get('shipment_id')}
          presetAmount={searchParams.get('amount')}
          presetGhiChu={searchParams.get('ghi_chu')}
          autoOpenNew={activeTab === 'chi' && wantsAutoNew}
          onAutoOpened={clearAutoNewParam}
        />
      ),
    },
  ];

  return (
    <Tabs
      items={items}
      activeKey={activeTab}
      onChange={(key) => setSearchParams((p) => ({ ...Object.fromEntries(p), tab: key }))}
    />
  );
}
