/**
 * ScopeIt - Invoices List Page
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Input, Select, Tag, Card, Dropdown, message } from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  DollarOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { invoiceService } from '@/services/invoiceService';
import { colors, fonts } from '@/styles/theme';
import { useInvoiceStatuses, getStatusDisplay } from '@/hooks/useSettings';
import { useIsMobile } from '@/hooks/useIsMobile';
import { ImportExcelModal } from '@/components/common/ImportExcelModal';
import type { Invoice, InvoiceStatus, ExcelParsedSection } from '@/types/entities';
import type { ColumnsType } from 'antd/es/table';

const InvoicesListPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [importModalOpen, setImportModalOpen] = useState(false);
  const isMobile = useIsMobile();

  // Fetch invoice statuses
  const { data: statusConfigs } = useInvoiceStatuses();

  // Import from Excel mutation
  const importMutation = useMutation({
    mutationFn: (sections: ExcelParsedSection[]) =>
      invoiceService.create({ sections } as any),
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      message.success('Invoice imported successfully');
      setImportModalOpen(false);
      navigate(`/app/invoices/${invoice.id}/edit`);
    },
    onError: () => {
      message.error('Failed to create invoice from import');
    },
  });

  // Fetch invoices from API
  const { data, isLoading } = useQuery({
    queryKey: ['invoices', { search, status: statusFilter }],
    queryFn: () =>
      invoiceService.getList({
        search: search || undefined,
        status: statusFilter,
        limit: 100,
      }),
  });

  const columns: ColumnsType<Invoice> = [
    {
      title: 'Number',
      dataIndex: 'invoiceNumber',
      key: 'invoiceNumber',
      width: 100,
      ellipsis: true,
      render: (text) => (
        <span style={{ fontWeight: 600, color: colors.textPrimary, cursor: 'pointer' }}>
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
      title: 'Date',
      dataIndex: 'invoiceDate',
      key: 'invoiceDate',
      width: 100,
      render: (date) => dayjs(date).format('MMM D, YYYY'),
    },
    {
      title: 'Due Date',
      dataIndex: 'dueDate',
      key: 'dueDate',
      width: 100,
      responsive: ['md'] as const,
      render: (date) => dayjs(date).format('MMM D, YYYY'),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (status: InvoiceStatus) => {
        const config = getStatusDisplay(status, statusConfigs || []);
        return (
          <Tag style={{ color: config.color, background: config.bg, border: 'none', fontWeight: 500 }}>
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
      render: (total) => <span style={{ fontWeight: 600 }}>${(total || 0).toLocaleString()}</span>,
    },
    {
      title: 'Balance',
      dataIndex: 'balanceDue',
      key: 'balanceDue',
      width: 100,
      align: 'right',
      responsive: ['lg'] as const,
      render: (balance) => (
        <span style={{ fontWeight: 600, color: (balance || 0) > 0 ? colors.error : colors.success }}>
          ${(balance || 0).toLocaleString()}
        </span>
      ),
    },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <h1 style={{ fontFamily: fonts.heading, fontSize: isMobile ? 20 : 24, fontWeight: 700, margin: 0 }}>Invoices</h1>
        <div style={{ flexShrink: 0 }}>
          <Dropdown.Button
            type="primary"
            size="large"
            onClick={() => navigate('/app/invoices/new')}
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
            <PlusOutlined /> New Invoice
          </Dropdown.Button>
        </div>
      </div>

      {/* Filters */}
      <Card style={{ borderRadius: 12, marginBottom: 16 }} styles={{ body: { padding: '16px 20px' } }}>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 12 }}>
          <Input
            placeholder="Search invoices..."
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
            showTotal: (total) => `${total} invoices`,
          }}
          onRow={(record) => ({
            onClick: () => navigate(`/app/invoices/${record.id}`),
            style: { cursor: 'pointer' },
          })}
          locale={{
            emptyText: (
              <div style={{ padding: 48, textAlign: 'center' }}>
                <DollarOutlined style={{ fontSize: 48, color: colors.textMuted, marginBottom: 16 }} />
                <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>No invoices yet</div>
                <div style={{ color: colors.textSecondary, marginBottom: 24 }}>
                  Create your first invoice or convert an approved estimate
                </div>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => navigate('/app/invoices/new')}
                  style={{ background: colors.primary }}
                >
                  Create Invoice
                </Button>
              </div>
            ),
          }}
        />
      </Card>

      <ImportExcelModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImport={(sections) => importMutation.mutate(sections)}
        documentType="invoice"
        onDownloadTemplate={invoiceService.downloadExcelTemplate}
        onParseFile={invoiceService.parseExcelFile}
        importing={importMutation.isPending}
      />
    </motion.div>
  );
};

export default InvoicesListPage;
