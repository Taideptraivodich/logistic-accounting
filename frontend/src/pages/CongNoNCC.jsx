import React, { useEffect, useMemo, useState } from 'react';
import { Table, Drawer, Button, Modal, Form, Select, InputNumber, DatePicker, Input, message, Space, Typography, Empty, Tag } from 'antd';
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
  const [shipments, setShipments] = useState([]);
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
      .get(`/reports/cong-no-ncc/${r.id}/theo-thang`)
      .then((res) => setDetailData(res.data))
      .finally(() => setDetailLoading(false));
  };

  // Lưu ghi chú tự do / đánh dấu "nợ xấu" cho 1 dòng tháng — kiểu Excel gốc.
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
      await api.put(`/reports/cong-no-ncc/${detail.id}/notes/${monthKey}`, { ghi_chu, la_no_xau });
    } catch {
      message.error('Không lưu được ghi chú');
    }
  };

  // Chọn "Lô hàng liên kết" -> tự gen Nội dung + Số tiền. Số tiền phải LỌC THEO ĐÚNG NCC đang chọn
  // ở field "Nhà cung cấp" (form supplier_id) — một lô hàng có nhiều dòng chi phí của NHIỀU NCC khác
  // nhau (xem shipment_charges.supplier_id), không được lấy s.tong_chi_phi (tổng CẢ lô, mọi NCC)
  // như trước. Đồng thời trừ đi phần đã chi cho đúng NCC này (linked_payments lọc theo supplier_id)
  // để ra đúng số CÒN PHẢI TRẢ, giống cách Vouchers.jsx/CongNoKH.jsx đã làm cho bên Phải thu.
  const onShipmentPick = async (shipmentId) => {
    if (!shipmentId) return;
    const supplierId = form.getFieldValue('supplier_id');
    if (!supplierId) {
      message.warning('Chọn Nhà cung cấp trước khi chọn Lô hàng liên kết để tính đúng số tiền');
      return;
    }
    try {
      const { data: s } = await api.get(`/shipments/${shipmentId}`);
      const tkPart = s.so_to_khai ? `TK ${s.so_to_khai} - ` : '';
      const myCharges = (s.charges || []).filter((c) => c.supplier_id === supplierId);
      const phaiTraNcc = myCharges.reduce((a, c) => a + (c.so_tien || 0), 0);
      const daTraNcc = (s.linked_payments || [])
        .filter((p) => p.supplier_id === supplierId)
        .reduce((a, p) => a + (p.so_tien || 0), 0);
      const soTien = Math.max(phaiTraNcc - daTraNcc, 0);
      const loaiPhiList = [...new Set(myCharges.map((c) => c.loai_phi).filter(Boolean))];
      const loaiPhiPart = loaiPhiList.length ? loaiPhiList.join(' + ') : 'phí';
      const ghiChu = `${tkPart}Chi ${loaiPhiPart} - ${s.ma_lo}`.replace(/\s+/g, ' ').trim();
      form.setFieldsValue({ so_tien: soTien, ghi_chu: ghiChu });
    } catch {
      // Không chặn luồng nhập liệu nếu lấy chi tiết lô hàng thất bại.
    }
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
    { title: 'Tháng phát sinh', dataIndex: 'nhan', width: 130 },
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

  const paymentColumns = [
    { title: 'Số CT', dataIndex: 'so_ct', width: 110 },
    { title: 'Ngày', dataIndex: 'ngay_ct', width: 110 },
    { title: 'Nội dung', dataIndex: 'ghi_chu' },
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
                form.setFieldsValue({
                  supplier_id: detail?.id,
                  ghi_chu: `Chi trả nhà cung cấp ${detail?.name || ''}`.trim(),
                });
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
          bordered
          rowClassName={(r) => (r.la_no_xau ? 'row-no-xau' : '')}
          locale={{ emptyText: <Empty description="Chưa có chi phí nào phát sinh" /> }}
          summary={() =>
            detailData ? (
              <Table.Summary.Row className="row-tong-cong-no">
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
                <Table.Summary.Cell index={6} />
                <Table.Summary.Cell index={7} />
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
          <Form.Item label="Lô hàng liên kết (không bắt buộc)" name="shipment_id">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Chọn lô hàng nếu có — chọn xong sẽ tự điền Nội dung và Số tiền của đúng NCC đang chọn"
              options={shipments.map((s) => ({ value: s.id, label: `${s.ma_lo} — ${s.customer_name || ''}` }))}
              onChange={onShipmentPick}
            />
          </Form.Item>
          <Form.Item label="Số tiền" name="so_tien" rules={[{ required: true }]}>
            <InputNumber
              style={{ width: '100%' }}
              formatter={(v) => (v === undefined || v === null || v === '' ? '' : `${Math.round(v)}`.replace(/\B(?=(\d{3})+(?!\d))/g, ','))}
              parser={(v) => (v ? v.replace(/,/g, '') : '')}
            />
          </Form.Item>
          <Form.Item label="Chi từ quỹ" name="payment_method_id">
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
