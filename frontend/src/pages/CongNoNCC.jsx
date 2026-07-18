import React, { useEffect, useState } from 'react';
import { Table, Drawer, Button, Modal, Form, Select, InputNumber, DatePicker, Input, message } from 'antd';
import { EyeOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api/client';
import { formatMoney, moneyClass } from '../utils/format';

export default function CongNoNCC() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [detailRows, setDetailRows] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [form] = Form.useForm();

  const load = () => {
    setLoading(true);
    api.get('/reports/cong-no-ncc').then((res) => setRows(res.data)).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api.get('/suppliers').then((res) => setSuppliers(res.data));
    api.get('/payment-methods').then((res) => setPaymentMethods(res.data));
  }, []);

  const openDetail = (r) => {
    setDetail(r);
    api.get(`/reports/cong-no-ncc/${r.id}/chi-tiet`).then((res) => setDetailRows(res.data));
  };

  const handleCreatePayment = async () => {
    try {
      const v = await form.validateFields();
      await api.post('/vouchers/payments', {
        ...v,
        ngay_ct: v.ngay_ct ? v.ngay_ct.format('YYYY-MM-DD') : null,
      });
      message.success('Đã tạo phiếu chi');
      setModalOpen(false);
      form.resetFields();
      load();
      if (detail) openDetail(detail);
    } catch (e) {
      if (!e?.errorFields) message.error('Có lỗi xảy ra');
    }
  };

  const columns = [
    { title: 'Nhà cung cấp', dataIndex: 'name' },
    {
      title: 'Phải trả',
      dataIndex: 'phai_tra',
      align: 'right',
      render: (v) => <span className="money">{formatMoney(v)}</span>,
    },
    {
      title: 'Đã trả',
      dataIndex: 'da_tra',
      align: 'right',
      render: (v) => <span className="money">{formatMoney(v)}</span>,
    },
    {
      title: 'Còn nợ',
      dataIndex: 'con_no',
      align: 'right',
      render: (v) => <span className={`money ${moneyClass(v)}`}>{formatMoney(v)}</span>,
    },
    {
      title: '',
      width: 90,
      render: (_, r) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(r)}>
          Chi tiết
        </Button>
      ),
    },
  ];

  const detailColumns = [
    { title: 'Ngày CT', dataIndex: 'ngay_ct', width: 100 },
    { title: 'Số CT / Mã lô', dataIndex: 'ma_lo', width: 120 },
    { title: 'Nội dung', dataIndex: 'loai_phi' },
    {
      title: 'Phát sinh',
      dataIndex: 'phai_tra',
      align: 'right',
      render: (v) => <span className={`money ${moneyClass(v)}`}>{formatMoney(v)}</span>,
    },
    {
      title: 'Tồn cuối',
      dataIndex: 'ton_cuoi',
      align: 'right',
      render: (v) => <span className={`money ${moneyClass(v)}`}>{formatMoney(v)}</span>,
    },
  ];

  return (
    <div>
      <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} pagination={false} />

      <Drawer
        title={`Chi tiết công nợ: ${detail?.name || ''}`}
        width={720}
        open={!!detail}
        onClose={() => setDetail(null)}
        extra={
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => {
              form.setFieldsValue({ supplier_id: detail?.id });
              setModalOpen(true);
            }}
          >
            Tạo phiếu chi
          </Button>
        }
      >
        <Table
          rowKey="id"
          columns={detailColumns}
          dataSource={detailRows}
          pagination={false}
          size="small"
        />
      </Drawer>

      <Modal
        title="Tạo phiếu chi nhà cung cấp"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleCreatePayment}
        okText="Lưu"
      >
        <Form form={form} layout="vertical">
          <Form.Item label="Nhà cung cấp" name="supplier_id" rules={[{ required: true }]}>
            <Select
              options={suppliers.map((s) => ({ label: s.name, value: s.id }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item label="Ngày chứng từ" name="ngay_ct" initialValue={dayjs()}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item label="Số tiền" name="so_tien" rules={[{ required: true }]}>
            <InputNumber
              style={{ width: '100%' }}
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(v) => v.replace(/,/g, '')}
            />
          </Form.Item>
          <Form.Item label="Chi từ quỹ" name="payment_method_id">
            <Select options={paymentMethods.map((p) => ({ label: p.name, value: p.id }))} allowClear />
          </Form.Item>
          <Form.Item label="Ghi chú" name="ghi_chu">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
