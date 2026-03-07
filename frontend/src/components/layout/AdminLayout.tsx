/**
 * ScopeIt - Admin Layout
 * Mobile-responsive layout wrapper for admin pages with drawer navigation
 */
import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Typography, Button, Space, Avatar, Drawer } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  BarChartOutlined,
  ArrowLeftOutlined,
  SettingOutlined,
  MenuOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/stores/authStore';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

// Breakpoint for mobile/desktop
const MOBILE_BREAKPOINT = 768;

// Custom hook for responsive detection
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false
  );

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile;
};

const AdminLayout: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  const isMobile = useIsMobile();

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const menuItems = [
    {
      key: '/admin/dashboard',
      icon: <DashboardOutlined />,
      label: 'Dashboard',
    },
    {
      key: '/admin/users',
      icon: <UserOutlined />,
      label: 'Users',
    },
    {
      key: '/admin/analytics',
      icon: <BarChartOutlined />,
      label: 'Analytics',
    },
  ];

  const selectedKey = menuItems.find((item) =>
    location.pathname.startsWith(item.key)
  )?.key || '/admin/dashboard';

  const handleMenuClick = (key: string) => {
    navigate(key);
    if (isMobile) {
      setMobileMenuOpen(false);
    }
  };

  // Sidebar content (shared between desktop Sider and mobile Drawer)
  const SidebarContent = () => (
    <>
      {/* Logo/Title */}
      <div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <Text
          strong
          style={{ color: '#fff', fontSize: 18 }}
        >
          <SettingOutlined style={{ marginRight: 8 }} />
          Admin Panel
        </Text>
      </div>

      {/* Menu */}
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[selectedKey]}
        items={menuItems}
        onClick={({ key }) => handleMenuClick(key)}
        style={{ borderRight: 0, marginTop: 8, flex: 1 }}
      />

      {/* Back to App */}
      <div
        style={{
          padding: 16,
          borderTop: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <Button
          type="default"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/app/dashboard')}
          block
          style={{
            background: 'rgba(255,255,255,0.1)',
            color: '#fff',
            border: 'none',
            minHeight: 44,
          }}
        >
          Back to App
        </Button>
      </div>
    </>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Desktop Sidebar */}
      {!isMobile && (
        <Sider
          width={220}
          style={{
            background: '#001529',
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <SidebarContent />
        </Sider>
      )}

      {/* Mobile Drawer */}
      <Drawer
        placement="left"
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        width={280}
        styles={{
          body: {
            padding: 0,
            background: '#001529',
            display: 'flex',
            flexDirection: 'column',
          },
          header: {
            display: 'none',
          },
        }}
        style={{
          zIndex: 1001,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            background: '#001529',
          }}
        >
          {/* Close button row */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              padding: '12px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <Button
              type="text"
              icon={<CloseOutlined />}
              onClick={() => setMobileMenuOpen(false)}
              style={{
                width: 44,
                height: 44,
                color: '#fff',
              }}
            />
          </div>
          <SidebarContent />
        </div>
      </Drawer>

      <Layout style={{ marginLeft: isMobile ? 0 : 220, transition: 'margin-left 0.2s ease' }}>
        {/* Header */}
        <Header
          style={{
            background: '#fff',
            padding: `env(safe-area-inset-top) ${isMobile ? 16 : 24}px 0 ${isMobile ? 16 : 24}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #f0f0f0',
            position: 'sticky',
            top: 0,
            zIndex: 10,
            height: 64,
          }}
        >
          {/* Left side */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isMobile && (
              <Button
                type="text"
                icon={<MenuOutlined />}
                onClick={() => setMobileMenuOpen(true)}
                style={{
                  fontSize: 18,
                  width: 44,
                  height: 44,
                }}
                aria-label="Open menu"
              />
            )}
            <Text type="secondary" className="desktop-only">
              Superuser Admin Console
            </Text>
            {isMobile && (
              <Text strong style={{ fontSize: 16 }}>
                Admin
              </Text>
            )}
          </div>

          {/* Right side */}
          <Space>
            {!isMobile && <Text>{user?.fullName || user?.email}</Text>}
            <Avatar
              icon={<UserOutlined />}
              src={user?.avatarUrl}
              style={{ width: isMobile ? 32 : 36, height: isMobile ? 32 : 36 }}
            />
          </Space>
        </Header>

        {/* Content */}
        <Content
          style={{
            background: '#f5f5f5',
            minHeight: 'calc(100vh - 64px)',
            padding: isMobile ? 16 : 0,
            paddingBottom: isMobile ? 'calc(16px + env(safe-area-inset-bottom))' : 0,
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default AdminLayout;
