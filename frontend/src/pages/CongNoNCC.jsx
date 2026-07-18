import React, { useEffect, useMemo, useState } from 'react';
import { Table, Drawer, Button, Modal, Form, Select, InputNumber, DatePicker, Input, message, Space, Typography, Empty } from 'antd';
import { EyeOutlined, PlusOutlined, SearchOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import api from '../api/client';
import { formatMoney, moneyClass } from '../utils/format';

export default function CongNoNCC() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [form] = Form.useForm();
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    api.get('/reports/cong-no-ncc').then((res) => setRows(res.data)).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api.get('/suppliers').then((res) => setSuppliers(res.data));
    api.get('/payment-methods').then((res) => setPaymentMethods(res.data));
  }, []);

  const filteredRows = useMemo(() => {
    if (!q.trim()) return rows;
    const like = q.trim().toLowerCase();
    return rows.filter((r) => (r.name || '').toLowerCase().includes(like));
  }, [rows, q]);

  const openDetail = (r) => {
    setDetail(r);
    setDetailLoading(true);
    api
      .get(`/reports/cong-no-ncc/${r.id}/theo-thang`)
      .then((res) => setDetailData(res.data))
      .finally(() => setDetailLoading(false));
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
      title: 'Cước vận chuyển',
      dataIndex: 'cuoc_van_chuyen',
      align: 'right',
      render: (v) => <span className="money">{formatMoney(v)}</span>,
    },
    {
      title: 'Chi hộ',
      dataIndex: 'chi_ho',
      align: 'right',
      render: (v) => <span className="money">{formatMoney(v)}</span>,
    },
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

  const monthColumns = [
    { title: 'Tháng phát sinh', dataIndex: 'nhan', width: 140 },
    {
      title: 'Cước vận chuyển',
      dataIndex: 'cuoc_van_chuyen',
      align: 'right',
      render: (v) => <span className="money">{formatMoney(v)}</span>,
    },
    {
      title: 'Chi hộ',
      dataIndex: 'chi_ho',
      align: 'right',
      render: (v) => <span className="money">{formatMoney(v)}</span>,
    },
    {
      title: 'Phải trả',
      dataIndex: 'phat_sinh',
      align: 'right',
      render: (v) => <span className="money">{formatMoney(v)}</span>,
    },
    {
      title: 'Đã trả',
      dataIndex: 'da_tra',
      align: 'right',
      render: (v) => <span className="money money-pos">{formatMoney(v)}</span>,
    },
    {
      title: 'Còn nợ',
      dataIndex: 'con_no',
      align: 'right',
      render: (v) => <span className={`money ${moneyClass(v)}`}>{formatMoney(v)}</span>,
    },
  ];

  const paymentColumns = [
    { title: 'Số CT', dataIndex: 'so_ct', width: 110 },
    { title: 'Ngày', dataIndex: 'ngay_ct', width: 110 },
    { title: 'Ghi chú', dataIndex: 'ghi_chu' },
    {
      title: 'Số tiền',
      dataIndex: 'so_tien',
      align: 'right',
      render: (v) => <span className="money money-neg">{formatMoney(v)}</span>,
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="Tìm nhà cung cấp..."
          allowClear
          style={{ width: 280 }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          prefix={<SearchOutlined />}
        />
      </Space>
      <Table rowKey="id" columns={columns} dataSource={filteredRows} loading={loading} pagination={false} />

      <Drawer
        title={`Chi tiết công nợ: ${detail?.name || ''}`}
        width={760}
        open={!!detail}
        onClose={() => {
          setDetail(null);
          setDetailData(null);
        }}
        extra={
          <Space>
            <Button
              size="small"
              icon={<UnorderedListOutlined />}
              onClick={() => navigate(`/vouchers?tab=chi&supplier_id=${detail?.id}`)}
            >
              Quản lý phiếu chi
            </Button>
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
          </Space>
        }
      >
        <Table
          rowKey="key"
          columns={monthColumns}
          dataSource={detailData?.rows || []}
          loading={detailLoading}
          pagination={false}
          size="small"
          locale={{ emptyText: <Empty description="Chưa có chi phí nào phát sinh" /> }}
          summary={() =>
            detailData ? (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}>
                  <b>Tổng nợ phải trả</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} />
                <Table.Summary.Cell index={2} />
                <Table.Summary.Cell index={3} align="right">
                  <b>{formatMoney(detailData.tong_phai_tra)}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right">
                  <b>{formatMoney(detailData.tong_da_tra)}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="right">
                  <b className={moneyClass(detailData.tong_con_no)}>{formatMoney(detailData.tong_con_no)}</b>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            ) : null
          }
        />

        <Typography.Title level={5} style={{ marginTop: 24 }}>
          Các phiếu chi đã có
        </Typography.Title>
        <Table
          rowKey="so_ct"
          columns={paymentColumns}
          dataSource={detailData?.payments || []}
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
