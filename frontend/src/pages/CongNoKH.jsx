import React, { useEffect, useMemo, useState } from 'react';
import { Table, Drawer, Button, Modal, Form, Select, InputNumber, DatePicker, Input, message, Space, Typography, Empty, Tag } from 'antd';
import { EyeOutlined, PlusOutlined, SearchOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import api from '../api/client';
import { formatMoney, moneyClass } from '../utils/format';

export default function CongNoKH() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState(null); // { id, name }
  const [detailData, setDetailData] = useState(null); // response từ /theo-thang
  const [detailLoading, setDetailLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [form] = Form.useForm();
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    api.get('/reports/cong-no-kh').then((res) => setRows(res.data)).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api.get('/customers').then((res) => setCustomers(res.data));
    api.get('/payment-methods').then((res) => setPaymentMethods(res.data));
    api.get('/shipments').then((res) => setShipments(res.data));
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
      .get(`/reports/cong-no-kh/${r.id}/theo-thang`)
      .then((res) => setDetailData(res.data))
      .finally(() => setDetailLoading(false));
  };

  // Lưu ghi chú tự do / đánh dấu "nợ xấu" cho 1 dòng tháng — kiểu Excel gốc Senior gửi
  // (ví dụ "TT tiền hàng + chi hộ ngày 14/01/2026", "Đã cấn trừ vào lô hàng ngày 10/06/2026").
  const saveNote = async (monthKey, patch) => {
    if (!detail) return;
    const current = (detailData?.rows || []).find((r) => r.key === monthKey) || {};
    const ghi_chu = patch.ghi_chu !== undefined ? patch.ghi_chu : current.ghi_chu;
    const la_no_xau = patch.la_no_xau !== undefined ? patch.la_no_xau : current.la_no_xau;
    setDetailData((prev) => ({
      ...prev,
      rows: prev.rows.map((r) => (r.key === monthKey ? { ...r, ghi_chu, la_no_xau } : r)),
    }));
    try {
      await api.put(`/reports/cong-no-kh/${detail.id}/notes/${monthKey}`, { ghi_chu, la_no_xau });
    } catch {
      message.error('Không lưu được ghi chú');
    }
  };

  const handleCreateReceipt = async () => {
    try {
      const v = await form.validateFields();
      await api.post('/vouchers/receipts', {
        ...v,
        ngay_ct: v.ngay_ct ? v.ngay_ct.format('YYYY-MM-DD') : null,
      });
      message.success('Đã tạo phiếu thu');
      setModalOpen(false);
      form.resetFields();
      load();
      if (detail) openDetail(detail);
    } catch (e) {
      if (!e?.errorFields) message.error('Có lỗi xảy ra');
    }
  };

  const columns = [
    { title: 'Khách hàng', dataIndex: 'name' },
    {
      title: 'Cước DV',
      dataIndex: 'cuoc_dv',
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
      title: 'Phải thu',
      dataIndex: 'phai_thu',
      align: 'right',
      render: (v) => <span className="money">{formatMoney(v)}</span>,
    },
    {
      title: 'Đã thu',
      dataIndex: 'da_thu',
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
    { title: 'Tháng phát sinh', dataIndex: 'nhan', width: 130 },
    {
      title: 'Cước DV',
      dataIndex: 'cuoc',
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
      title: 'Cước + chi hộ phải thu',
      dataIndex: 'phat_sinh',
      align: 'right',
      render: (v) => <span className="money">{formatMoney(v)}</span>,
    },
    {
      title: 'Đã thu',
      dataIndex: 'da_thu',
      align: 'right',
      render: (v) => <span className="money money-pos">{formatMoney(v)}</span>,
    },
    {
      title: 'Còn nợ',
      dataIndex: 'con_no',
      align: 'right',
      render: (v) => <span className={`money ${moneyClass(v)}`}>{formatMoney(v)}</span>,
    },
    {
      title: 'Ghi chú',
      dataIndex: 'ghi_chu',
      width: 220,
      render: (v, r) => (
        <Typography.Text
          editable={{
            onChange: (val) => saveNote(r.key, { ghi_chu: val }),
            autoSize: { minRows: 1, maxRows: 3 },
          }}
          style={{ fontSize: 12 }}
        >
          {v || ''}
        </Typography.Text>
      ),
    },
    {
      title: 'Nợ xấu',
      dataIndex: 'la_no_xau',
      width: 80,
      align: 'center',
      render: (v, r) => (
        <Tag
          color={v ? 'red' : 'default'}
          style={{ cursor: 'pointer' }}
          onClick={() => saveNote(r.key, { la_no_xau: !v })}
        >
          {v ? 'Nợ xấu' : 'Đánh dấu'}
        </Tag>
      ),
    },
  ];

  const receiptColumns = [
    { title: 'Số CT', dataIndex: 'so_ct', width: 110 },
    { title: 'Ngày', dataIndex: 'ngay_ct', width: 110 },
    { title: 'Ghi chú', dataIndex: 'ghi_chu' },
    {
      title: 'Số tiền',
      dataIndex: 'so_tien',
      align: 'right',
      render: (v) => <span className="money money-pos">{formatMoney(v)}</span>,
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="Tìm khách hàng..."
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
              onClick={() => navigate(`/vouchers?tab=thu&customer_id=${detail?.id}`)}
            >
              Quản lý phiếu thu
            </Button>
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => {
                form.setFieldsValue({
                  customer_id: detail?.id,
                  ghi_chu: `Thu tiền khách hàng ${detail?.name || ''}`.trim(),
                });
                setModalOpen(true);
              }}
            >
              Tạo phiếu thu
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
          bordered
          rowClassName={(r) => (r.la_no_xau ? 'row-no-xau' : '')}
          locale={{ emptyText: <Empty description="Chưa có lô hàng nào phát sinh" /> }}
          summary={() =>
            detailData ? (
              <Table.Summary.Row className="row-tong-cong-no">
                <Table.Summary.Cell index={0}>
                  <b>Tổng nợ phải thu</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} />
                <Table.Summary.Cell index={2} />
                <Table.Summary.Cell index={3} align="right">
                  <b>{formatMoney(detailData.tong_phai_thu)}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right">
                  <b>{formatMoney(detailData.tong_da_thu)}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="right">
                  <b className={moneyClass(detailData.tong_con_no)}>{formatMoney(detailData.tong_con_no)}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={6} />
                <Table.Summary.Cell index={7} />
              </Table.Summary.Row>
            ) : null
          }
        />

        <Typography.Title level={5} style={{ marginTop: 24 }}>
          Các phiếu thu đã có
        </Typography.Title>
        <Table
          rowKey="so_ct"
          columns={receiptColumns}
          dataSource={detailData?.receipts || []}
          pagination={false}
          size="small"
        />
      </Drawer>

      <Modal
        title="Tạo phiếu thu khách hàng"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleCreateReceipt}
        okText="Lưu"
      >
        <Form form={form} layout="vertical">
          <Form.Item label="Khách hàng" name="customer_id" rules={[{ required: true }]}>
            <Select
              options={customers.map((c) => ({ label: c.name, value: c.id }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item label="Ngày chứng từ" name="ngay_ct" initialValue={dayjs()}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item label="Lô hàng liên kết (không bắt buộc)" name="shipment_id">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Chọn lô hàng nếu có"
              options={shipments
                .filter((s) => !detail || s.customer_id === detail.id)
                .map((s) => ({ value: s.id, label: `${s.ma_lo} — ${s.customer_name || ''}` }))}
            />
          </Form.Item>
          <Form.Item label="Số tiền" name="so_tien" rules={[{ required: true }]}>
            <InputNumber
              style={{ width: '100%' }}
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(v) => v.replace(/,/g, '')}
            />
          </Form.Item>
          <Form.Item label="Thu vào quỹ" name="payment_method_id">
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
