import React, { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Spin } from 'antd';
import {
  ContainerOutlined,
  RiseOutlined,
  FallOutlined,
  DollarOutlined,
  TeamOutlined,
  ShopOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import api from '../api/client';
import { formatMoney } from '../utils/format';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/reports/dashboard')
      .then((res) => setData(res.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spin style={{ marginTop: 40 }} />;
  if (!data) return null;

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={8} lg={6}>
          <Card>
            <Statistic
              title="Số lô hàng"
              value={data.so_lo_hang}
              prefix={<ContainerOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <Card>
            <Statistic
              title="Doanh thu (cước DV)"
              value={formatMoney(data.doanh_thu)}
              prefix={<RiseOutlined style={{ color: '#2f9e44' }} />}
              valueStyle={{ color: '#2f9e44' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <Card>
            <Statistic
              title="Chi phí"
              value={formatMoney(data.chi_phi)}
              prefix={<FallOutlined style={{ color: '#e03131' }} />}
              valueStyle={{ color: '#e03131' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <Card>
            <Statistic
              title="Lợi nhuận"
              value={formatMoney(data.loi_nhuan)}
              prefix={<DollarOutlined />}
              valueStyle={{ color: data.loi_nhuan >= 0 ? '#2f9e44' : '#e03131' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} lg={8}>
          <Card>
            <Statistic
              title="Công nợ phải thu (KH)"
              value={formatMoney(data.cong_no_kh)}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} lg={8}>
          <Card>
            <Statistic
              title="Công nợ phải trả (NCC)"
              value={formatMoney(data.cong_no_ncc)}
              prefix={<ShopOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} lg={8}>
          <Card>
            <Statistic
              title="Tồn quỹ hiện tại"
              value={formatMoney(data.ton_quy)}
              prefix={<WalletOutlined />}
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
