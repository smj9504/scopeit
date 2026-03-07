/**
 * ScopeIt - App Layout
 * Mobile-responsive layout with drawer navigation
 */
import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { Layout, Menu, Button, Dropdown, Avatar, Badge, Drawer } from 'antd';
import {
  FileTextOutlined,
  DollarOutlined,
  UserOutlined,
  UnorderedListOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  LogoutOutlined,
  HomeOutlined,
  MenuOutlined,
  CloseOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/stores/authStore';
import { colors, fonts } from '@/styles/theme';

const { Sider, Content, Header } = Layout;

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

const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const isMobile = useIsMobile();

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const menuItems = [
    {
      key: '/app/dashboard',
      icon: <HomeOutlined />,
      label: 'Dashboard',
    },
    {
      key: '/app/estimates',
      icon: <FileTextOutlined />,
      label: 'Estimates',
    },
    {
      key: '/app/invoices',
      icon: <DollarOutlined />,
      label: 'Invoices',
    },
    {
      key: '/app/customers',
      icon: <UserOutlined />,
      label: 'Customers',
    },
    {
      key: '/app/line-items',
      icon: <UnorderedListOutlined />,
      label: 'Line Items',
    },
    {
      key: '/app/tools',
      icon: <AppstoreOutlined />,
      label: 'Tools',
    },
    {
      key: '/app/settings',
      icon: <SettingOutlined />,
      label: 'Settings',
    },
  ];

  const userMenuItems = [
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Settings',
      onClick: () => navigate('/app/settings'),
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Logout',
      onClick: () => {
        logout();
        navigate('/login');
      },
    },
  ];

  const getSelectedKey = () => {
    const path = location.pathname;
    const item = menuItems.find((item) => path.startsWith(item.key));
    return item?.key || '/app/dashboard';
  };

  const handleMenuClick = (key: string) => {
    navigate(key);
    if (isMobile) {
      setMobileMenuOpen(false);
    }
  };

  // Sidebar content (shared between desktop Sider and mobile Drawer)
  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div
        style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
          padding: collapsed && !isMobile ? 0 : '0 24px',
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <Link to="/app/dashboard" style={{ textDecoration: 'none' }}>
          <span
            style={{
              fontFamily: fonts.heading,
              fontSize: collapsed && !isMobile ? 18 : 20,
              fontWeight: 700,
              color: colors.primary,
            }}
          >
            {collapsed && !isMobile ? 'S' : 'ScopeIt'}
          </span>
        </Link>
      </div>

      {/* Menu */}
      <Menu
        mode="inline"
        selectedKeys={[getSelectedKey()]}
        items={menuItems}
        onClick={({ key }) => handleMenuClick(key)}
        style={{
          border: 'none',
          padding: '12px 8px',
          flex: 1,
        }}
      />

      {/* Beta Badge */}
      {(!collapsed || isMobile) && (
        <div
          style={{
            padding: '16px 24px 24px',
          }}
        >
          <Badge.Ribbon text="Beta" color={colors.primary}>
            <div
              style={{
                background: colors.bgLight,
                borderRadius: 8,
                padding: '12px 50px 12px 16px',
                fontSize: 13,
                color: colors.textSecondary,
              }}
            >
              All features free during beta
            </div>
          </Badge.Ribbon>
        </div>
      )}
    </>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Desktop Sidebar */}
      {!isMobile && (
        <Sider
          trigger={null}
          collapsible
          collapsed={collapsed}
          width={240}
          collapsedWidth={80}
          style={{
            background: colors.bgWhite,
            borderRight: `1px solid ${colors.border}`,
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            zIndex: 100,
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
            background: colors.bgWhite,
          }}
        >
          {/* Close button row */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              padding: '12px 16px',
              borderBottom: `1px solid ${colors.border}`,
            }}
          >
            <Button
              type="text"
              icon={<CloseOutlined />}
              onClick={() => setMobileMenuOpen(false)}
              style={{
                width: 44,
                height: 44,
              }}
            />
          </div>
          <SidebarContent />
        </div>
      </Drawer>

      {/* Main Content */}
      <Layout
        style={{
          marginLeft: isMobile ? 0 : collapsed ? 80 : 240,
          transition: 'margin-left 0.2s ease',
        }}
      >
        {/* Header */}
        <Header
          style={{
            background: colors.bgWhite,
            borderBottom: `1px solid ${colors.border}`,
            padding: `env(safe-area-inset-top) ${isMobile ? 16 : 24}px 0 ${isMobile ? 16 : 24}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 99,
            height: 64,
          }}
        >
          {/* Left side - Menu toggle */}
          {isMobile ? (
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
          ) : (
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{
                fontSize: 16,
                width: 40,
                height: 40,
              }}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            />
          )}

          {/* Center - Logo on mobile */}
          {isMobile && (
            <Link to="/app/dashboard" style={{ textDecoration: 'none' }}>
              <span
                style={{
                  fontFamily: fonts.heading,
                  fontSize: 18,
                  fontWeight: 700,
                  color: colors.primary,
                }}
              >
                ScopeIt
              </span>
            </Link>
          )}

          {/* Right side - User menu */}
          <Dropdown menu={{ items: userMenuItems }} trigger={['click']}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: isMobile ? 8 : 12,
                cursor: 'pointer',
                padding: '8px 12px',
                borderRadius: 8,
                transition: 'background 0.2s ease',
                minHeight: 44,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = colors.bgLight;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <Avatar
                style={{
                  background: colors.primary,
                  color: colors.textWhite,
                  width: isMobile ? 32 : 36,
                  height: isMobile ? 32 : 36,
                  lineHeight: isMobile ? '32px' : '36px',
                }}
              >
                {user?.fullName?.charAt(0).toUpperCase() || 'U'}
              </Avatar>
              {!isMobile && (
                <span
                  style={{
                    fontWeight: 500,
                    color: colors.textPrimary,
                  }}
                >
                  {user?.fullName || 'User'}
                </span>
              )}
            </div>
          </Dropdown>
        </Header>

        {/* Content */}
        <Content
          style={{
            padding: isMobile ? 16 : 24,
            minHeight: 'calc(100vh - 64px)',
            background: colors.bgLight,
            // Safe area for bottom notch
            paddingBottom: isMobile ? 'calc(16px + env(safe-area-inset-bottom))' : 24,
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
