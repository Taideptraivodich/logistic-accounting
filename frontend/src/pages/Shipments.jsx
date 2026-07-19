import React, { useEffect, useState } from 'react';
import { Table, Button, Input, Space, Tag, Popconfirm, message } from 'antd';
import { PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined, CopyOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { formatMoney, moneyClass } from '../utils/format';

export default function Shipments() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [duplicating, setDuplicating] = useState(null);
  const navigate = useNavigate();

  const load = (query) => {
    setLoading(true);
    api
      .get('/shipments', { params: query ? { q: query } : {} })
      .then((res) => setRows(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (id) => {
    await api.delete(`/shipments/${id}`);
    message.success('Đã xoá lô hàng');
    load(q);
  };

  // Sao chép 1 lô hàng thành lô hàng MỚI (mã lô mới) với toàn bộ thông tin có sẵn — Chi phí và
  // Debit Note (nếu có) đều được copy sang, chỉ reset lại các cờ "Đã thu?"/"Đã thanh toán?" và
  // Trạng thái về "Nháp" (xem ghi chú ở backend/src/routes/shipments.js). Sau khi tạo xong, chuyển
  // luôn sang màn Sửa của lô hàng mới để Senior chỉnh lại các trường cần thay đổi (Invoice, tờ
  // khai, container...).
  const handleDuplicate = async (id) => {
    setDuplicating(id);
    try {
      const { data } = await api.post(`/shipments/${id}/duplicate`);
      message.success(`Đã sao chép thành lô hàng mới: ${data.ma_lo}`);
      navigate(`/shipments/${data.id}`);
    } catch (e) {
      message.error(e?.response?.data?.error || 'Không sao chép được lô hàng này');
    } finally {
      setDuplicating(null);
    }
  };

  const columns = [
    { title: 'Mã lô', dataIndex: 'ma_lo', width: 110, fixed: 'left' },
    { title: 'Ngày CT', dataIndex: 'ngay_ct', width: 110 },
    { title: 'Khách hàng', dataIndex: 'customer_name', width: 160 },
    { title: 'Invoice', dataIndex: 'invoice', width: 120 },
    { title: 'Số tờ khai', dataIndex: 'so_to_khai', width: 130 },
    { title: 'Số container', dataIndex: 'so_container', width: 140 },
    {
      title: 'Cước DV (Doanh thu)',
      dataIndex: 'doanh_thu',
      width: 150,
      align: 'right',
      render: (v) => <span className="money money-pos">{formatMoney(v)}</span>,
    },
    {
      title: 'Tổng chi phí',
      dataIndex: 'tong_chi_phi',
      width: 130,
      align: 'right',
      render: (v) => <span className="money money-neg">{formatMoney(v)}</span>,
    },
    {
      title: 'Lợi nhuận',
      dataIndex: 'loi_nhuan',
      width: 130,
      align: 'right',
      render: (v) => <span className={`money ${moneyClass(v)}`}>{formatMoney(v)}</span>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 110,
      render: (v) =>
        v === 'hoan_thanh' ? (
          <Tag color="green">Hoàn thành</Tag>
        ) : (
          <Tag color="orange">Nháp</Tag>
        ),
    },
    {
      title: '',
      key: 'actions',
      width: 130,
      fixed: 'right',
      render: (_, r) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => navigate(`/shipments/${r.id}`)}
          />
          <Popconfirm
            title="Sao chép lô hàng này?"
            description="Tạo lô hàng mới với toàn bộ thông tin, chi phí và Debit Note (nếu có) của lô hàng này."
            onConfirm={() => handleDuplicate(r.id)}
          >
            <Button size="small" icon={<CopyOutlined />} loading={duplicating === r.id} />
          </Popconfirm>
          <Popconfirm title="Xoá lô hàng này?" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          placeholder="Tìm mã lô, invoice, tờ khai, container, khách hàng..."
          allowClear
          style={{ width: 340 }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onSearch={(v) => load(v)}
          enterButton={<SearchOutlined />}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/shipments/new')}>
          Tạo lô hàng mới
        </Button>
      </Space>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        scroll={{ x: 1300 }}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        size="middle"
        onRow={(r) => ({ onDoubleClick: () => navigate(`/shipments/${r.id}`) })}
      />
    </div>
  );
}
