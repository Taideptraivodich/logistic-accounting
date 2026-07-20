import React, { useState } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from 'react-router-dom';
import { Layout, Menu, Typography, Dropdown, Avatar, Spin } from 'antd';
import {
  DashboardOutlined,
  ContainerOutlined,
  TeamOutlined,
  ShopOutlined,
  WalletOutlined,
  FileTextOutlined,
  BarChartOutlined,
  SettingOutlined,
  FilePdfOutlined,
  UserOutlined,
  LogoutOutlined,
  KeyOutlined,
} from '@ant-design/icons';

import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Shipments from './pages/Shipments.jsx';
import ShipmentForm from './pages/ShipmentForm.jsx';
import CongNoKH from './pages/CongNoKH.jsx';
import CongNoNCC from './pages/CongNoNCC.jsx';
import SoQuy from './pages/SoQuy.jsx';
import DoanhThu from './pages/DoanhThu.jsx';
import Catalog from './pages/Catalog.jsx';
import Vouchers from './pages/Vouchers.jsx';
import DebitNotes from './pages/DebitNotes.jsx';
import DebitNoteForm from './pages/DebitNoteForm.jsx';
import DebitNotePrint from './pages/DebitNotePrint.jsx';
import ChangePassword from './pages/ChangePassword.jsx';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: 'Tổng quan' },
  { key: '/shipments', icon: <ContainerOutlined />, label: 'Lô hàng' },
  { key: '/cong-no-kh', icon: <TeamOutlined />, label: 'Công nợ Khách hàng' },
  { key: '/cong-no-ncc', icon: <ShopOutlined />, label: 'Công nợ Nhà cung cấp' },
  { key: '/so-quy', icon: <WalletOutlined />, label: 'Sổ quỹ' },
  { key: '/vouchers', icon: <FileTextOutlined />, label: 'Phiếu thu / chi' },
  { key: '/debit-notes', icon: <FilePdfOutlined />, label: 'Debit Note' },
  { key: '/doanh-thu', icon: <BarChartOutlined />, label: 'Doanh thu' },
  { key: '/catalog', icon: <SettingOutlined />, label: 'Danh mục' },
];

// Bọc quanh khu vực cần đăng nhập mới xem được: nếu chưa có token thì đá về /login
// (nhớ lại trang đang định vào để sau khi đăng nhập xong quay lại đúng chỗ đó).
function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

function Shell() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const userMenuItems = [
    {
      key: 'change-password',
      icon: <KeyOutlined />,
      label: 'Đổi mật khẩu',
      onClick: () => navigate('/change-password'),
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Đăng xuất',
      onClick: () => {
        logout();
        navigate('/login', { replace: true });
      },
    },
  ];

  const selectedKey =
    menuItems.find((m) => location.pathname === m.key || location.pathname.startsWith(m.key + '/'))
      ?.key || '/';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} theme="light" width={230} className="no-print">
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
          className="no-print"
          style={{
            background: '#fff',
            padding: '0 20px',
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Typography.Title level={5} style={{ margin: 0, flex: 1 }}>
            {menuItems.find((m) => m.key === selectedKey)?.label || ''}
          </Typography.Title>
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <Avatar size="small" icon={<UserOutlined />} />
              <Typography.Text>{user?.fullName || user?.username}</Typography.Text>
            </div>
          </Dropdown>
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
            <Route path="/debit-notes" element={<DebitNotes />} />
            <Route path="/debit-notes/new" element={<DebitNoteForm />} />
            <Route path="/debit-notes/:id/edit" element={<DebitNoteForm />} />
            <Route path="/debit-notes/:id/print" element={<DebitNotePrint />} />
            <Route path="/doanh-thu" element={<DoanhThu />} />
            <Route path="/catalog" element={<Catalog />} />
            <Route path="/change-password" element={<ChangePassword />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <RequireAuth>
                <Shell />
              </RequireAuth>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
