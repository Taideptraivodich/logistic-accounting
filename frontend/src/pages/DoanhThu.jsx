import React, { useEffect, useMemo, useState } from 'react';
import { Table, DatePicker, Space, Card, Statistic, Row, Col, Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import api from '../api/client';
import { formatMoney, moneyClass } from '../utils/format';

const { RangePicker } = DatePicker;

export default function DoanhThu() {
  const [rows, setRows] = useState([]);
  const [feeTypes, setFeeTypes] = useState([]);
  const [tong, setTong] = useState({ doanh_thu: 0, chi_phi: 0, loi_nhuan: 0 });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const load = (r) => {
    setLoading(true);
    const params = {};
    if (r) {
      params.from = r[0].format('YYYY-MM-DD');
      params.to = r[1].format('YYYY-MM-DD');
    }
    api
      .get('/reports/doanh-thu', { params })
      .then((res) => {
        setRows(res.data.rows);
        setFeeTypes(res.data.fee_types || []);
        setTong(res.data.tong);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const filteredRows = useMemo(() => {
    if (!q.trim()) return rows;
    const like = q.trim().toLowerCase();
    return rows.filter((r) =>
      [r.ma_lo, r.invoice, r.so_to_khai, r.so_container, r.customer_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(like))
    );
  }, [rows, q]);

  // Cột cố định theo đúng bố cục file Excel gốc: Ngày tờ khai, Số tờ khai, Container,
  // Số lượng cont, Cước DV — sau đó tới TỪNG cột loại phí — rồi Tổng chi phí / Doanh thu / Lợi nhuận.
  const columns = [
    { title: 'Mã lô', dataIndex: 'ma_lo', width: 100, fixed: 'left' },
    { title: 'Ngày tờ khai', dataIndex: 'ngay_to_khai', width: 100 },
    { title: 'Số tờ khai', dataIndex: 'so_to_khai', width: 130 },
    { title: 'Khách hàng', dataIndex: 'customer_name', width: 150 },
    { title: 'Số container', dataIndex: 'so_container', width: 130 },
    { title: 'Số lượng cont', dataIndex: 'so_luong_cont', width: 110 },
    {
      title: 'Cước DV',
      dataIndex: 'cuoc_dv',
      width: 110,
      align: 'right',
      render: (v) => <span className="money">{formatMoney(v)}</span>,
    },
    ...feeTypes.map((ft) => ({
      title: ft,
      width: 110,
      align: 'right',
      render: (_, r) => {
        const v = r.by_type?.[ft];
        return v ? <span className="money money-neg">{formatMoney(v)}</span> : '-';
      },
    })),
    {
      title: 'Tổng chi phí',
      dataIndex: 'chi_phi',
      width: 120,
      align: 'right',
      render: (v) => <span className="money money-neg">{formatMoney(v)}</span>,
    },
    {
      title: 'Doanh thu',
      dataIndex: 'doanh_thu',
      width: 120,
      align: 'right',
      render: (v) => <span className="money money-pos">{formatMoney(v)}</span>,
    },
    {
      title: 'Lợi nhuận',
      dataIndex: 'loi_nhuan',
      width: 120,
      align: 'right',
      fixed: 'right',
      render: (v) => <span className={`money ${moneyClass(v)}`}>{formatMoney(v)}</span>,
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <RangePicker format="DD/MM/YYYY" onChange={(r) => load(r)} />
        <Input
          placeholder="Tìm mã lô, invoice, tờ khai, container, khách hàng..."
          allowClear
          style={{ width: 320 }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          prefix={<SearchOutlined />}
        />
      </Space>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small">
            <Statistic title="Tổng doanh thu" value={formatMoney(tong.doanh_thu)} valueStyle={{ color: '#2f9e44' }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic title="Tổng chi phí" value={formatMoney(tong.chi_phi)} valueStyle={{ color: '#e03131' }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title="Tổng lợi nhuận"
              value={formatMoney(tong.loi_nhuan)}
              valueStyle={{ color: tong.loi_nhuan >= 0 ? '#2f9e44' : '#e03131' }}
            />
          </Card>
        </Col>
      </Row>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={filteredRows}
        loading={loading}
        pagination={{ pageSize: 20 }}
        scroll={{ x: 900 + feeTypes.length * 110 }}
        size="middle"
      />
    </div>
  );
}
