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
      fixed: isMobile ? undefined : 'left',
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
      width: 120,
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
      width: 100,
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
        <span style={{ fontWeight: 600 }}>${total.toLocaleString()}</span>
      ),
    },
  ];

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
          alignItems: 'center',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <h1
          style={{
            fontFamily: fonts.heading,
            fontSize: 24,
            fontWeight: 700,
            color: colors.textPrimary,
            margin: 0,
          }}
        >
          Estimates
        </h1>
        <div style={{ flexShrink: 0 }}>
          <Dropdown.Button
            type="primary"
            size="large"
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
            buttonsRender={([leftButton, rightButton]) => [
              React.cloneElement(leftButton as React.ReactElement, {
                style: {
                  background: colors.primary,
                  fontWeight: 600,
                  height: 44,
                  borderRadius: '8px 0 0 8px',
                },
              }),
              React.cloneElement(rightButton as React.ReactElement, {
                style: {
                  background: colors.primary,
                  height: 44,
                  borderRadius: '0 8px 8px 0',
                },
              }),
            ]}
          >
            <PlusOutlined /> New Estimate
          </Dropdown.Button>
        </div>
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
            style={{ width: isMobile ? '100%' : 250, minWidth: isMobile ? 'auto' : 200 }}
            size="large"
            allowClear
          />
          <Select
            placeholder="All statuses"
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: isMobile ? '100%' : 150, minWidth: isMobile ? 'auto' : 120 }}
            size="large"
            allowClear
            options={(statusConfigs || []).map((status) => ({
              value: status.name,
              label: status.name.charAt(0).toUpperCase() + status.name.slice(1),
            }))}
          />
        </div>
      </Card>

      {/* Table */}
      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
        <Table
          columns={columns}
          dataSource={data?.items || []}
          rowKey="id"
          loading={isLoading}
          scroll={isMobile ? { x: 560 } : undefined}
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
