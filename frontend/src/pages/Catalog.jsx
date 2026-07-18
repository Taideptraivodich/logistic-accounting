import React, { useEffect, useState } from 'react';
import { Tabs, Table, Button, Modal, Form, Input, InputNumber, Space, Popconfirm, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../api/client';
import { formatMoney } from '../utils/format';

function GenericCatalog({ endpoint, title, extraFields }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const load = () => {
    setLoading(true);
    api.get(`/${endpoint}`).then((res) => setRows(res.data)).finally(() => setLoading(false));
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
      if (editing) {
        await api.put(`/${endpoint}/${editing.id}`, v);
        message.success('Đã cập nhật');
      } else {
        await api.post(`/${endpoint}`, v);
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
      render: f.type === 'number' ? (v) => formatMoney(v) : undefined,
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
      <Button type="primary" icon={<PlusOutlined />} onClick={openNew} style={{ marginBottom: 12 }}>
        Thêm {title.toLowerCase()}
      </Button>
      <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} pagination={{ pageSize: 15 }} size="small" />

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
      key: 'payment-methods',
      label: 'Hình thức thanh toán / Quỹ',
      children: (
        <GenericCatalog
          endpoint="payment-methods"
          title="Hình thức thanh toán"
          extraFields={[{ name: 'opening_balance', label: 'Số dư đầu kỳ', type: 'number' }]}
        />
      ),
    },
  ];

  return <Tabs items={items} />;
}
