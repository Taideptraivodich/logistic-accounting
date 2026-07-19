import React, { useEffect, useMemo, useState } from 'react';
import { Tabs, Table, Button, Modal, Form, Input, InputNumber, Select, Space, Popconfirm, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import api from '../api/client';
import { formatMoney } from '../utils/format';

function GenericCatalog({ endpoint, title, extraFields, listQuery, fixedFields }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const filteredRows = useMemo(() => {
    if (!q.trim()) return rows;
    const like = q.trim().toLowerCase();
    return rows.filter((r) => (r.name || '').toLowerCase().includes(like));
  }, [rows, q]);

  const load = () => {
    setLoading(true);
    api.get(`/${endpoint}`, { params: listQuery }).then((res) => setRows(res.data)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openNew = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (r) => {
    setEditing(r);
    form.setFieldsValue(r);
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const v = await form.validateFields();
      const payload = { ...v, ...fixedFields };
      if (editing) {
        await api.put(`/${endpoint}/${editing.id}`, payload);
        message.success('Đã cập nhật');
      } else {
        await api.post(`/${endpoint}`, payload);
        message.success('Đã thêm mới');
      }
      setModalOpen(false);
      load();
    } catch (e) {
      if (!e?.errorFields) message.error(e?.response?.data?.error || 'Có lỗi xảy ra');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/${endpoint}/${id}`);
      message.success('Đã xoá');
      load();
    } catch (e) {
      message.error(e?.response?.data?.error || 'Không thể xoá');
    }
  };

  const columns = [
    { title: 'Tên', dataIndex: 'name' },
    ...extraFields.map((f) => ({
      title: f.label,
      dataIndex: f.name,
      align: f.type === 'number' ? 'right' : undefined,
      render: f.type === 'number'
        ? (v) => formatMoney(v)
        : f.type === 'select'
        ? (v) => (f.options.find((o) => o.value === v) || {}).label ?? ''
        : undefined,
    })),
    {
      title: '',
      width: 100,
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="Xoá mục này?" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 12 }} wrap>
        <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>
          Thêm {title.toLowerCase()}
        </Button>
        <Input
          placeholder={`Tìm ${title.toLowerCase()}...`}
          allowClear
          style={{ width: 260 }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          prefix={<SearchOutlined />}
        />
      </Space>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={filteredRows}
        loading={loading}
        pagination={{ pageSize: 15 }}
        size="small"
        scroll={{ x: 'max-content' }}
      />

      <Modal
        title={editing ? `Sửa ${title.toLowerCase()}` : `Thêm ${title.toLowerCase()}`}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        okText="Lưu"
      >
        <Form form={form} layout="vertical">
          <Form.Item label="Tên" name="name" rules={[{ required: true, message: 'Vui lòng nhập tên' }]}>
            <Input />
          </Form.Item>
          {extraFields.map((f) => (
            <Form.Item label={f.label} name={f.name} key={f.name}>
              {f.type === 'number' ? (
                <InputNumber
                  style={{ width: '100%' }}
                  formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={(v) => v.replace(/,/g, '')}
                />
              ) : f.type === 'select' ? (
                <Select style={{ width: '100%' }} options={f.options} allowClear />
              ) : (
                <Input />
              )}
            </Form.Item>
          ))}
        </Form>
      </Modal>
    </div>
  );
}

export default function Catalog() {
  const items = [
    {
      key: 'customers',
      label: 'Khách hàng',
      children: (
        <GenericCatalog
          endpoint="customers"
          title="Khách hàng"
          extraFields={[
            { name: 'default_cuoc_dv', label: 'Cước DV mặc định', type: 'number' },
            { name: 'note', label: 'Ghi chú', type: 'text' },
          ]}
        />
      ),
    },
    {
      key: 'suppliers',
      label: 'Nhà cung cấp',
      children: (
        <GenericCatalog
          endpoint="suppliers"
          title="Nhà cung cấp"
          extraFields={[{ name: 'note', label: 'Ghi chú', type: 'text' }]}
        />
      ),
    },
    {
      key: 'fee-types',
      label: 'Loại phí',
      children: <GenericCatalog endpoint="fee-types" title="Loại phí" extraFields={[]} />,
    },
    {
      key: 'service-charges',
      label: 'Cước dịch vụ',
      children: (
        <GenericCatalog
          endpoint="service-charges"
          title="Cước dịch vụ"
          extraFields={[
            { name: 'don_vi_tinh', label: 'Đơn vị tính', type: 'text' },
            { name: 'don_gia_mac_dinh', label: 'Đơn giá mặc định', type: 'number' },
            {
              name: 'vat_percent_mac_dinh',
              label: 'VAT mặc định',
              type: 'select',
              options: [
                { value: null, label: 'No VAT' },
                { value: 0, label: '0%' },
                { value: 8, label: '8%' },
                { value: 10, label: '10%' },
              ],
            },
          ]}
        />
      ),
    },
    {
      key: 'payment-methods',
      label: 'Hình thức thanh toán / Quỹ',
      children: (
        <GenericCatalog
          endpoint="payment-methods"
          title="Hình thức thanh toán"
          extraFields={[
            { name: 'opening_balance', label: 'Số dư đầu kỳ', type: 'number' },
            // 4 trường dưới đây dùng để tự điền "Thông tin nhận tiền" ở màn Debit Note (Cước dịch vụ
            // / Chi hộ, xem DebitNoteForm.jsx) khi Senior chọn quỹ tương ứng — đỡ phải gõ tay lại
            // mỗi lần lập Debit Note cho cùng 1 quỹ.
            { name: 'bank_account_number', label: 'Số tài khoản', type: 'text' },
            { name: 'bank_name', label: 'Ngân hàng', type: 'text' },
            { name: 'bank_swift', label: 'SWIFT Code', type: 'text' },
            { name: 'bank_account_name', label: 'Người thụ hưởng', type: 'text' },
          ]}
        />
      ),
    },
    {
      key: 'voucher-cats-thu',
      label: 'Danh mục thu khác',
      children: (
        <GenericCatalog
          endpoint="voucher-categories"
          title="Danh mục thu khác"
          extraFields={[]}
          listQuery={{ type: 'thu' }}
          fixedFields={{ type: 'thu' }}
        />
      ),
    },
    {
      key: 'voucher-cats-chi',
      label: 'Danh mục chi khác',
      children: (
        <GenericCatalog
          endpoint="voucher-categories"
          title="Danh mục chi khác"
          extraFields={[]}
          listQuery={{ type: 'chi' }}
          fixedFields={{ type: 'chi' }}
        />
      ),
    },
  ];

  return <Tabs items={items} />;
}
