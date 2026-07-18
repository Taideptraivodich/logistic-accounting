import React, { useEffect, useState } from 'react';
import { Table, DatePicker, Space, Card, Statistic, Row, Col } from 'antd';
import dayjs from 'dayjs';
import api from '../api/client';
import { formatMoney, moneyClass } from '../utils/format';

const { RangePicker } = DatePicker;

export default function DoanhThu() {
  const [rows, setRows] = useState([]);
  const [tong, setTong] = useState({ doanh_thu: 0, chi_phi: 0, loi_nhuan: 0 });
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(null);

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
        setTong(res.data.tong);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const columns = [
    { title: 'Mã lô', dataIndex: 'ma_lo', width: 110 },
    { title: 'Ngày CT', dataIndex: 'ngay_ct', width: 100 },
    { title: 'Khách hàng', dataIndex: 'customer_name', width: 160 },
    { title: 'Invoice', dataIndex: 'invoice', width: 120 },
    { title: 'Container', dataIndex: 'so_container', width: 140 },
    {
      title: 'Doanh thu',
      dataIndex: 'doanh_thu',
      align: 'right',
      render: (v) => <span className="money money-pos">{formatMoney(v)}</span>,
    },
    {
      title: 'Chi phí',
      dataIndex: 'chi_phi',
      align: 'right',
      render: (v) => <span className="money money-neg">{formatMoney(v)}</span>,
    },
    {
      title: 'Lợi nhuận',
      dataIndex: 'loi_nhuan',
      align: 'right',
      render: (v) => <span className={`money ${moneyClass(v)}`}>{formatMoney(v)}</span>,
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <RangePicker
          format="DD/MM/YYYY"
          onChange={(r) => {
            setRange(r);
            load(r);
          }}
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
        dataSource={rows}
        loading={loading}
        pagination={{ pageSize: 20 }}
        size="middle"
      />
    </div>
  );
}
