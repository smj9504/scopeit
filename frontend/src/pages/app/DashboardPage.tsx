/**
 * ScopeIt - Dashboard Page
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Card, Button, Empty, Spin } from 'antd';
import {
  FileTextOutlined,
  DollarOutlined,
  UserOutlined,
  PlusOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { useIsMobile } from '@/hooks/useIsMobile';
import { colors, fonts } from '@/styles/theme';
import { formatCurrency } from '@/utils/formatters';
import { dashboardService, DashboardData } from '@/services/dashboardService';

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isMobile = useIsMobile();

  // Fetch dashboard data
  const { data: dashboardData, isLoading, error } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: dashboardService.getDashboard,
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: true,
  });

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  const StatCard = ({
    icon,
    title,
    value,
    suffix,
    onClick,
  }: {
    icon: React.ReactNode;
    title: string;
    value: number | string;
    suffix?: string;
    onClick?: () => void;
  }) => (
    <motion.div variants={itemVariants}>
      <Card
        hoverable
        onClick={onClick}
        style={{
          borderRadius: 12,
          cursor: onClick ? 'pointer' : 'default',
        }}
        styles={{ body: { padding: isMobile ? 16 : 24 } }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: isMobile ? 12 : 16 }}>
          <div
            style={{
              width: isMobile ? 40 : 48,
              height: isMobile ? 40 : 48,
              borderRadius: 10,
              background: colors.bgLight,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: isMobile ? 17 : 20,
              color: colors.primary,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                color: colors.textSecondary,
                marginBottom: 4,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {title}
            </div>
            <div
              style={{
                fontFamily: fonts.heading,
                fontSize: isMobile ? 22 : 28,
                fontWeight: 700,
                color: colors.textPrimary,
                lineHeight: 1.2,
              }}
            >
              {value}
              {suffix && (
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: colors.textSecondary,
                    marginLeft: 4,
                  }}
                >
                  {suffix}
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
      case 'paid':
        return colors.success;
      case 'sent':
      case 'viewed':
        return colors.info;
      case 'overdue':
      case 'declined':
        return colors.error;
      default:
        return colors.textMuted;
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    );
  }

  // Default values for dashboard data
  const stats = {
    estimatesThisMonth: dashboardData?.estimates_this_month ?? 0,
    invoicesThisMonth: dashboardData?.invoices_this_month ?? 0,
    totalCustomers: dashboardData?.total_customers ?? 0,
    pendingPayments: dashboardData?.pending_payments ?? 0,
    recentEstimates: dashboardData?.recent_estimates ?? [],
    recentInvoices: dashboardData?.recent_invoices ?? [],
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div variants={itemVariants} style={{ marginBottom: isMobile ? 20 : 32 }}>
        <h1
          style={{
            fontFamily: fonts.heading,
            fontSize: isMobile ? 22 : 28,
            fontWeight: 700,
            color: colors.textPrimary,
            margin: 0,
            marginBottom: 4,
          }}
        >
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {user?.fullName?.split(' ')[0] || 'there'}
        </h1>
        <p style={{ color: colors.textSecondary, fontSize: isMobile ? 13 : 15, margin: 0 }}>
          Here's what's happening with your business today.
        </p>
      </motion.div>

      {/* Quick Actions */}
      <motion.div variants={itemVariants} style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/app/estimates/new')}
            style={{
              background: colors.primary,
              fontWeight: 600,
              borderRadius: 8,
              flex: isMobile ? '1 1 auto' : undefined,
            }}
          >
            New Estimate
          </Button>
          <Button
            icon={<PlusOutlined />}
            onClick={() => navigate('/app/invoices/new')}
            style={{
              fontWeight: 600,
              borderRadius: 8,
              flex: isMobile ? '1 1 auto' : undefined,
            }}
          >
            New Invoice
          </Button>
        </div>
      </motion.div>

      {/* Stats */}
      <Row gutter={[16, 16]} style={{ marginBottom: 32 }}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            icon={<FileTextOutlined />}
            title="Estimates this month"
            value={stats.estimatesThisMonth}
            onClick={() => navigate('/app/estimates')}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            icon={<DollarOutlined />}
            title="Invoices this month"
            value={stats.invoicesThisMonth}
            onClick={() => navigate('/app/invoices')}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            icon={<UserOutlined />}
            title="Total customers"
            value={stats.totalCustomers}
            onClick={() => navigate('/app/customers')}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            icon={<DollarOutlined />}
            title="Pending payments"
            value={formatCurrency(stats.pendingPayments)}
          />
        </Col>
      </Row>

      {/* Recent Activity */}
      <Row gutter={[16, 16]}>
        {/* Recent Estimates */}
        <Col xs={24} lg={12}>
          <motion.div variants={itemVariants}>
            <Card
              title={
                <span style={{ fontFamily: fonts.heading, fontWeight: 600 }}>
                  Recent Estimates
                </span>
              }
              extra={
                <Button
                  type="link"
                  onClick={() => navigate('/app/estimates')}
                  style={{ color: colors.textSecondary, padding: 0 }}
                >
                  View all <ArrowRightOutlined />
                </Button>
              }
              style={{ borderRadius: 12 }}
              styles={{ body: { padding: 0 } }}
            >
              {stats.recentEstimates.length > 0 ? (
                <div>
                  {stats.recentEstimates.map((est) => (
                    <div
                      key={est.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: isMobile ? '12px 16px' : '16px 24px',
                        borderBottom: `1px solid ${colors.border}`,
                        cursor: 'pointer',
                        transition: 'background 0.2s ease',
                        gap: 8,
                      }}
                      onClick={() => navigate(`/app/estimates/${est.id}`)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = colors.bgLight;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            color: colors.textPrimary,
                            marginBottom: 2,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {est.estimate_number}
                        </div>
                        <div style={{ fontSize: 13, color: colors.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {est.customer_name || 'No customer'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            color: colors.textPrimary,
                            marginBottom: 2,
                          }}
                        >
                          {formatCurrency(est.total)}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 500,
                            color: getStatusColor(est.status),
                            textTransform: 'capitalize',
                          }}
                        >
                          {est.status}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="No estimates yet"
                  style={{ padding: 40 }}
                />
              )}
            </Card>
          </motion.div>
        </Col>

        {/* Recent Invoices */}
        <Col xs={24} lg={12}>
          <motion.div variants={itemVariants}>
            <Card
              title={
                <span style={{ fontFamily: fonts.heading, fontWeight: 600 }}>
                  Recent Invoices
                </span>
              }
              extra={
                <Button
                  type="link"
                  onClick={() => navigate('/app/invoices')}
                  style={{ color: colors.textSecondary, padding: 0 }}
                >
                  View all <ArrowRightOutlined />
                </Button>
              }
              style={{ borderRadius: 12 }}
              styles={{ body: { padding: 0 } }}
            >
              {stats.recentInvoices.length > 0 ? (
                <div>
                  {stats.recentInvoices.map((inv) => (
                    <div
                      key={inv.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: isMobile ? '12px 16px' : '16px 24px',
                        borderBottom: `1px solid ${colors.border}`,
                        cursor: 'pointer',
                        transition: 'background 0.2s ease',
                        gap: 8,
                      }}
                      onClick={() => navigate(`/app/invoices/${inv.id}`)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = colors.bgLight;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            color: colors.textPrimary,
                            marginBottom: 2,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {inv.invoice_number}
                        </div>
                        <div style={{ fontSize: 13, color: colors.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {inv.customer_name || 'No customer'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            color: colors.textPrimary,
                            marginBottom: 2,
                          }}
                        >
                          {formatCurrency(inv.total)}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 500,
                            color: getStatusColor(inv.status),
                            textTransform: 'capitalize',
                          }}
                        >
                          {inv.status}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="No invoices yet"
                  style={{ padding: 40 }}
                />
              )}
            </Card>
          </motion.div>
        </Col>
      </Row>
    </motion.div>
  );
};

export default DashboardPage;
