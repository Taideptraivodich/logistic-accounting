import React, { useEffect, useState } from 'react';
import { Table, Button, Input, Space, Tag, Popconfirm, message } from 'antd';
import { PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { formatMoney, moneyClass } from '../utils/format';

export default function Shipments() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
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

  const columns = [
    { title: 'Mã lô', dataIndex: 'ma_lo', width: 110, fixed: 'left' },
    { title: 'Ngày CT', dataIndex: 'ngay_ct', width: 110 },
    { title: 'Khách hàng', dataIndex: 'customer_name', width: 160 },
    { title: 'Invoice', dataIndex: 'invoice', width: 120 },
    { title: 'Số tờ khai', dataIndex: 'so_to_khai', width: 130 },
    { title: 'Số container', dataIndex: 'so_container', width: 140 },
    {
      title: 'Cước DV (Doanh thu)',
      dataIndex: 'cuoc_dv',
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
      width: 90,
      fixed: 'right',
      render: (_, r) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => navigate(`/shipments/${r.id}`)}
          />
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
