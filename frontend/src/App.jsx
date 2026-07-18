import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Typography } from 'antd';
import {
  DashboardOutlined,
  ContainerOutlined,
  TeamOutlined,
  ShopOutlined,
  WalletOutlined,
  FileTextOutlined,
  BarChartOutlined,
  SettingOutlined,
} from '@ant-design/icons';

import Dashboard from './pages/Dashboard.jsx';
import Shipments from './pages/Shipments.jsx';
import ShipmentForm from './pages/ShipmentForm.jsx';
import CongNoKH from './pages/CongNoKH.jsx';
import CongNoNCC from './pages/CongNoNCC.jsx';
import SoQuy from './pages/SoQuy.jsx';
import DoanhThu from './pages/DoanhThu.jsx';
import Catalog from './pages/Catalog.jsx';
import Vouchers from './pages/Vouchers.jsx';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: 'Tổng quan' },
  { key: '/shipments', icon: <ContainerOutlined />, label: 'Lô hàng' },
  { key: '/cong-no-kh', icon: <TeamOutlined />, label: 'Công nợ Khách hàng' },
  { key: '/cong-no-ncc', icon: <ShopOutlined />, label: 'Công nợ Nhà cung cấp' },
  { key: '/so-quy', icon: <WalletOutlined />, label: 'Sổ quỹ' },
  { key: '/vouchers', icon: <FileTextOutlined />, label: 'Phiếu thu / chi' },
  { key: '/doanh-thu', icon: <BarChartOutlined />, label: 'Doanh thu' },
  { key: '/catalog', icon: <SettingOutlined />, label: 'Danh mục' },
];

function Shell() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const selectedKey =
    menuItems.find((m) => location.pathname === m.key || location.pathname.startsWith(m.key + '/'))
      ?.key || '/';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} theme="light" width={230}>
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: collapsed ? 14 : 16,
            color: '#1677ff',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          {collapsed ? 'LOGI' : 'LOGISTICS MANAGER'}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={(e) => navigate(e.key)}
          style={{ borderRight: 0 }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 20px',
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Typography.Title level={5} style={{ margin: 0 }}>
            {menuItems.find((m) => m.key === selectedKey)?.label || ''}
          </Typography.Title>
        </Header>
        <Content style={{ margin: 16 }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/shipments" element={<Shipments />} />
            <Route path="/shipments/new" element={<ShipmentForm />} />
            <Route path="/shipments/:id" element={<ShipmentForm />} />
            <Route path="/cong-no-kh" element={<CongNoKH />} />
            <Route path="/cong-no-ncc" element={<CongNoNCC />} />
            <Route path="/so-quy" element={<SoQuy />} />
            <Route path="/vouchers" element={<Vouchers />} />
            <Route path="/doanh-thu" element={<DoanhThu />} />
            <Route path="/catalog" element={<Catalog />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}
