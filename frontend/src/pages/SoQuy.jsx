import React, { useEffect, useState } from 'react';
import { Table, Card, Row, Col, Statistic, Drawer, Button, Space } from 'antd';
import { EyeOutlined, WalletOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { formatMoney, moneyClass } from '../utils/format';

export default function SoQuy() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [detailRows, setDetailRows] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/reports/so-quy').then((res) => setRows(res.data)).finally(() => setLoading(false));
  }, []);

  const openDetail = (r) => {
    setDetail(r);
    api.get(`/reports/so-quy/${r.id}/chi-tiet`).then((res) => setDetailRows(res.data));
  };

  const columns = [
    { title: 'Hình thức thanh toán / Quỹ', dataIndex: 'name' },
    {
      title: 'Số dư đầu kỳ',
      dataIndex: 'opening_balance',
      align: 'right',
      render: (v) => <span className={`money ${moneyClass(v)}`}>{formatMoney(v)}</span>,
    },
    {
      title: 'Tổng thu',
      dataIndex: 'thu',
      align: 'right',
      render: (v) => <span className="money money-pos">{formatMoney(v)}</span>,
    },
    {
      title: 'Tổng chi',
      dataIndex: 'chi',
      align: 'right',
      render: (v) => <span className="money money-neg">{formatMoney(v)}</span>,
    },
    {
      title: 'Tồn cuối',
      dataIndex: 'ton_cuoi',
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
    { title: 'Số CT', dataIndex: 'so_ct', width: 110 },
    { title: 'Đối tượng', dataIndex: 'doi_tuong', width: 150 },
    { title: 'Nội dung', dataIndex: 'ghi_chu' },
    {
      title: 'Thu',
      dataIndex: 'thu',
      align: 'right',
      render: (v) => (v ? <span className="money money-pos">{formatMoney(v)}</span> : '-'),
    },
    {
      title: 'Chi',
      dataIndex: 'chi',
      align: 'right',
      render: (v) => (v ? <span className="money money-neg">{formatMoney(v)}</span> : '-'),
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
      <Row gutter={16} style={{ marginBottom: 16 }}>
        {rows.map((r) => (
          <Col span={8} key={r.id}>
            <Card size="small">
              <Statistic
                title={r.name}
                value={formatMoney(r.ton_cuoi)}
                prefix={<WalletOutlined />}
                valueStyle={{ color: r.ton_cuoi >= 0 ? '#2f9e44' : '#e03131' }}
              />
            </Card>
          </Col>
        ))}
      </Row>
      <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} pagination={false} />

      <Drawer
        title={`Chi tiết sổ quỹ: ${detail?.name || ''}`}
        width={800}
        open={!!detail}
        onClose={() => setDetail(null)}
        extra={
          <Button
            size="small"
            icon={<UnorderedListOutlined />}
            onClick={() => navigate(`/vouchers?payment_method_id=${detail?.id}`)}
          >
            Quản lý phiếu thu / chi
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
    </div>
  );
}
