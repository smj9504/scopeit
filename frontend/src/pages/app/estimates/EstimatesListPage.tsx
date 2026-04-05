/**
 * ScopeIt - Estimates List Page
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table,
  Button,
  Input,
  Select,
  Tag,
  Card,
  Dropdown,
  message,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  FileTextOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { estimateService } from '@/services/estimateService';
import { colors, fonts } from '@/styles/theme';
import { formatCurrency } from '@/utils/formatters';
import { useEstimateStatuses, getStatusDisplay } from '@/hooks/useSettings';
import { useIsMobile } from '@/hooks/useIsMobile';
import { ImportExcelModal } from '@/components/common/ImportExcelModal';
import type { Estimate, EstimateStatus, ExcelParsedSection } from '@/types/entities';
import type { ColumnsType } from 'antd/es/table';

const EstimatesListPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [importModalOpen, setImportModalOpen] = useState(false);
  const isMobile = useIsMobile();

  // Fetch estimate statuses
  const { data: statusConfigs } = useEstimateStatuses();

  // Import from Excel mutation
  const importMutation = useMutation({
    mutationFn: (sections: ExcelParsedSection[]) =>
      estimateService.create({ sections } as any),
    onSuccess: (estimate) => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] });
      message.success('Estimate imported successfully');
      setImportModalOpen(false);
      navigate(`/app/estimates/${estimate.id}/edit`);
    },
    onError: () => {
      message.error('Failed to create estimate from import');
    },
  });

  // Fetch estimates
  const { data, isLoading } = useQuery({
    queryKey: ['estimates', { search, status: statusFilter }],
    queryFn: () =>
      estimateService.getList({
        search: search || undefined,
        status: statusFilter,
        limit: 100,
      }),
  });

  const columns: ColumnsType<Estimate> = [
    {
      title: 'Number',
      dataIndex: 'estimateNumber',
      key: 'estimateNumber',
      width: 100,
      render: (text, record) => (
        <span
          style={{ fontWeight: 600, color: colors.textPrimary, cursor: 'pointer' }}
          onClick={() => navigate(`/app/estimates/${record.id}`)}
        >
          {text}
        </span>
      ),
    },
    {
      title: 'Customer',
      dataIndex: 'customerName',
      key: 'customerName',
      width: 140,
      ellipsis: true,
      render: (text) => text || <span style={{ color: colors.textMuted }}>-</span>,
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      width: 150,
      ellipsis: true,
      responsive: ['md'] as const,
      render: (text) =>
        text || <span style={{ color: colors.textMuted }}>Untitled</span>,
    },
    {
      title: 'Date',
      dataIndex: 'estimateDate',
      key: 'estimateDate',
      width: 110,
      responsive: ['sm'] as const,
      render: (date) => dayjs(date).format('MMM D, YYYY'),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (status: EstimateStatus) => {
        const config = getStatusDisplay(status, statusConfigs || []);
        return (
          <Tag
            style={{
              color: config.color,
              background: config.bg,
              border: 'none',
              fontWeight: 500,
            }}
          >
            {config.label}
          </Tag>
        );
      },
    },
    {
      title: 'Total',
      dataIndex: 'total',
      key: 'total',
      width: 100,
      align: 'right',
      render: (total) => (
        <span style={{ fontWeight: 600 }}>{formatCurrency(total)}</span>
      ),
    },
  ];

  const estimates = data?.items || [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'stretch' : 'center',
          flexDirection: isMobile ? 'column' : 'row',
          marginBottom: 24,
          gap: 12,
        }}
      >
        <h1
          style={{
            fontFamily: fonts.heading,
            fontSize: isMobile ? 20 : 24,
            fontWeight: 700,
            color: colors.textPrimary,
            margin: 0,
          }}
        >
          Estimates
        </h1>
        <Dropdown.Button
          type="primary"
          onClick={() => navigate('/app/estimates/new')}
          menu={{
            items: [
              {
                key: 'import-excel',
                label: 'Import from Excel',
                icon: <UploadOutlined />,
              },
            ],
            onClick: ({ key }) => {
              if (key === 'import-excel') setImportModalOpen(true);
            },
          }}
          style={isMobile ? { width: '100%' } : { flexShrink: 0 }}
          buttonsRender={([leftButton, rightButton]) => [
            React.cloneElement(leftButton as React.ReactElement, {
              style: {
                background: colors.primary,
                fontWeight: 600,
                borderRadius: '8px 0 0 8px',
                flex: isMobile ? 1 : undefined,
              },
            }),
            React.cloneElement(rightButton as React.ReactElement, {
              style: {
                background: colors.primary,
                borderRadius: '0 8px 8px 0',
              },
            }),
          ]}
        >
          <PlusOutlined /> New Estimate
        </Dropdown.Button>
      </div>

      {/* Filters */}
      <Card
        style={{ borderRadius: 12, marginBottom: 16 }}
        styles={{ body: { padding: '16px 20px' } }}
      >
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 12 }}>
          <Input
            placeholder="Search estimates..."
            prefix={<SearchOutlined style={{ color: colors.textMuted }} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: isMobile ? undefined : 1, maxWidth: isMobile ? '100%' : 300 }}
            allowClear
          />
          <Select
            placeholder="All statuses"
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: isMobile ? '100%' : 160 }}
            allowClear
            options={(statusConfigs || []).map((status) => ({
              value: status.name,
              label: status.name.charAt(0).toUpperCase() + status.name.slice(1),
            }))}
          />
        </div>
      </Card>

      {/* Mobile card view */}
      <div className="mobile-card-view">
        {isLoading ? (
          <div style={{ padding: '32px 0', textAlign: 'center', color: colors.textMuted }}>
            Loading...
          </div>
        ) : estimates.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <FileTextOutlined style={{ fontSize: 40, color: colors.textMuted, marginBottom: 12 }} />
            <div style={{ fontSize: 15, fontWeight: 500, color: colors.textPrimary, marginBottom: 8 }}>
              No estimates yet
            </div>
            <div style={{ color: colors.textSecondary, marginBottom: 20, fontSize: 14 }}>
              Create your first estimate to get started
            </div>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/app/estimates/new')}
              style={{ background: colors.primary, width: '100%' }}
            >
              Create Estimate
            </Button>
          </div>
        ) : (
          estimates.map((record) => {
            const config = getStatusDisplay(record.status || '', statusConfigs || []);
            return (
              <div
                key={record.id}
                className="mobile-card"
                onClick={() => navigate(`/app/estimates/${record.id}`)}
                style={{ cursor: 'pointer' }}
              >
                <div className="mobile-card-header">
                  <span className="mobile-card-title">{record.estimateNumber}</span>
                  <Tag style={{ color: config.color, background: config.bg, border: 'none', fontWeight: 500 }}>
                    {config.label}
                  </Tag>
                </div>
                {record.customerName && (
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Customer</span>
                    <span className="mobile-card-value">{record.customerName}</span>
                  </div>
                )}
                {record.title && (
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Title</span>
                    <span className="mobile-card-value" style={{ maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {record.title}
                    </span>
                  </div>
                )}
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Date</span>
                  <span className="mobile-card-value">{dayjs(record.estimateDate).format('MMM D, YYYY')}</span>
                </div>
                <div className="mobile-card-row" style={{ borderBottom: 'none' }}>
                  <span className="mobile-card-label">Total</span>
                  <span className="mobile-card-value" style={{ fontWeight: 700 }}>{formatCurrency(record.total)}</span>
                </div>
              </div>
            );
          })
        )}
        {/* Mobile pagination info */}
        {estimates.length > 0 && (
          <div style={{ textAlign: 'center', color: colors.textMuted, fontSize: 13, padding: '8px 0 4px' }}>
            {estimates.length} estimate{estimates.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Desktop table */}
      <Card className="desktop-table" style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
        <Table
          columns={columns}
          dataSource={estimates}
          rowKey="id"
          loading={isLoading}
          scroll={{ x: 560 }}
          pagination={{
            total: data?.total || 0,
            pageSize: 20,
            showSizeChanger: false,
            showTotal: (total) => `${total} estimates`,
          }}
          locale={{
            emptyText: (
              <div style={{ padding: 48, textAlign: 'center' }}>
                <FileTextOutlined
                  style={{ fontSize: 48, color: colors.textMuted, marginBottom: 16 }}
                />
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 500,
                    color: colors.textPrimary,
                    marginBottom: 8,
                  }}
                >
                  No estimates yet
                </div>
                <div style={{ color: colors.textSecondary, marginBottom: 24 }}>
                  Create your first estimate to get started
                </div>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => navigate('/app/estimates/new')}
                  style={{ background: colors.primary }}
                >
                  Create Estimate
                </Button>
              </div>
            ),
          }}
          onRow={(record) => ({
            style: { cursor: 'pointer' },
            onClick: () => navigate(`/app/estimates/${record.id}`),
          })}
        />
      </Card>

      <ImportExcelModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImport={(sections) => importMutation.mutate(sections)}
        documentType="estimate"
        onDownloadTemplate={estimateService.downloadExcelTemplate}
        onParseFile={estimateService.parseExcelFile}
        importing={importMutation.isPending}
      />
    </motion.div>
  );
};

export default EstimatesListPage;
