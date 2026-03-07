/**
 * ScopeIt - Invoice Detail Page
 */
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Tag, Descriptions, Table, Dropdown, Space, Divider, message, Modal, Form, InputNumber, DatePicker, Select, Input, Tooltip } from 'antd';
import {
  EditOutlined,
  SendOutlined,
  DownloadOutlined,
  MoreOutlined,
  ArrowLeftOutlined,
  CopyOutlined,
  DeleteOutlined,
  DollarOutlined,
  StopOutlined,
  PlusOutlined,
  ExclamationCircleOutlined,
  DownOutlined,
  FileTextOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import dayjs from 'dayjs';
import { colors, fonts } from '@/styles/theme';
import { invoiceService } from '@/services/invoiceService';
import { useInvoiceStatuses, getStatusDisplay } from '@/hooks/useSettings';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useBackNav } from '@/hooks/useHeaderNav';
import type { InvoiceStatus, PaymentMethod, Adjustment, Payment, PdfTemplateInfo } from '@/types/entities';
import { ReceiptPreviewModal } from '@/components/features/ReceiptPreviewModal';

const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: 'Cash',
  check: 'Check',
  credit_card: 'Credit Card',
  bank_transfer: 'Bank Transfer',
  other: 'Other',
};

const InvoiceDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [adjustmentModalOpen, setAdjustmentModalOpen] = useState(false);

  useBackNav('Back to Invoices', '/app/invoices');
  const [receiptPreviewPayment, setReceiptPreviewPayment] = useState<Payment | null>(null);
  const [paymentForm] = Form.useForm();
  const [adjustmentForm] = Form.useForm();

  // Fetch invoice statuses
  const { data: statusConfigs, isLoading: isLoadingStatuses } = useInvoiceStatuses();

  // Fetch PDF templates for receipt preview
  const { data: pdfTemplates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ['invoiceTemplates'],
    queryFn: () => invoiceService.getTemplates(),
  });

  // Fetch invoice data
  const { data: invoice, isLoading, refetch } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => invoiceService.getById(id!),
    enabled: !!id,
  });

  // Add adjustment mutation
  const addAdjustmentMutation = useMutation({
    mutationFn: (data: { type: 'premium' | 'discount'; name: string; percentage: number }) =>
      invoiceService.adjustments.add(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      message.success('Adjustment added');
      setAdjustmentModalOpen(false);
      adjustmentForm.resetFields();
    },
    onError: () => {
      message.error('Failed to add adjustment');
    },
  });

  // Delete adjustment mutation
  const deleteAdjustmentMutation = useMutation({
    mutationFn: (adjustmentId: string) => invoiceService.adjustments.delete(id!, adjustmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      message.success('Adjustment deleted');
    },
    onError: () => {
      message.error('Failed to delete adjustment');
    },
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: (statusId: string) => invoiceService.updateStatus(id!, statusId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      message.success('Status updated');
    },
    onError: () => {
      message.error('Failed to update status');
    },
  });

  // Handlers
  const handleDownloadPdf = async () => {
    try {
      const blob = await invoiceService.getPdf(id!);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${invoice?.invoiceNumber || 'invoice'}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
      message.success('PDF downloaded successfully');
    } catch (error) {
      message.error('Failed to download PDF');
    }
  };

  const handleSend = async () => {
    // TODO: Implement send email modal
    message.info('Send email feature coming soon');
  };

  const handleRecordPayment = async (values: any) => {
    try {
      await invoiceService.payments.record(id!, {
        amount: values.amount,
        paymentMethod: values.paymentMethod,
        paymentDate: values.paymentDate.format('YYYY-MM-DD'),
        referenceNumber: values.referenceNumber,
        notes: values.notes,
      });
      message.success('Payment recorded successfully');
      setPaymentModalVisible(false);
      paymentForm.resetFields();
      refetch();
    } catch (error) {
      message.error('Failed to record payment');
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    Modal.confirm({
      title: 'Delete Payment',
      content: 'Are you sure you want to delete this payment?',
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await invoiceService.payments.delete(id!, paymentId);
          message.success('Payment deleted');
          refetch();
        } catch (error) {
          message.error('Failed to delete payment');
        }
      },
    });
  };

  const handleDelete = async () => {
    try {
      await invoiceService.delete(id!);
      message.success('Invoice deleted successfully');
      navigate('/app/invoices');
    } catch (error) {
      message.error('Failed to delete invoice');
    }
  };

  const handleCancel = async () => {
    Modal.confirm({
      title: 'Cancel Invoice',
      content: 'Are you sure you want to cancel this invoice? This action cannot be undone.',
      okText: 'Cancel Invoice',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await invoiceService.cancel(id!);
          message.success('Invoice canceled');
          refetch();
        } catch (error) {
          message.error('Failed to cancel invoice');
        }
      },
    });
  };

  const handleAddAdjustment = (values: { type: 'premium' | 'discount'; name: string; percentage: number }) => {
    addAdjustmentMutation.mutate(values);
  };

  const handleDeleteAdjustment = (adjustmentId: string) => {
    Modal.confirm({
      title: 'Delete Adjustment',
      icon: <ExclamationCircleOutlined />,
      content: 'Are you sure you want to delete this adjustment?',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: () => deleteAdjustmentMutation.mutate(adjustmentId),
    });
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <span>Loading...</span>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <h2>Invoice not found</h2>
        <Button onClick={() => navigate('/app/invoices')}>Back to Invoices</Button>
      </div>
    );
  }

  // Extract invoice fields
  const invoiceNumber = invoice.invoiceNumber || '';
  const customerName = invoice.customerName || '';
  const customerEmail = invoice.customerEmail || '';
  const customerAddress = invoice.customerAddress || '';
  const invoiceDate = invoice.invoiceDate;
  const dueDate = invoice.dueDate;
  const subtotal = Number(invoice.subtotal || 0);
  const taxRate = Number(invoice.taxRate || 0);
  const taxLabel = invoice.taxLabel || 'Tax';
  const taxAmount = Number(invoice.taxAmount || 0);
  const total = Number(invoice.total || 0);
  const amountPaid = Number(invoice.amountPaid || 0);
  const balanceDue = Number(invoice.balanceDue || 0) || total - amountPaid;
  const sections = invoice.sections || [];
  const payments = invoice.payments || [];
  const adjustments = invoice.adjustments || [];

  const statusInfo = getStatusDisplay(invoice.status as InvoiceStatus, statusConfigs || []);
  const currentStatusConfig = statusConfigs?.find((s) => s.id === invoice.statusId);
  
  // Ensure statusId exists in statusConfigs before rendering Select
  const statusOptions = (statusConfigs || [])
    .map((s) => ({
      value: s.id,
      label: s.label,
    }));
  
  const hasValidStatus = invoice.statusId && statusOptions.some((opt) => opt.value === invoice.statusId);

  // Check if invoice can receive payments (not paid or canceled)
  const statusName = currentStatusConfig?.name?.toLowerCase() || invoice.status?.toLowerCase() || '';
  const canRecordPayment = !['paid', 'canceled'].includes(statusName) && balanceDue > 0;
  const isCanceled = statusName === 'canceled';

  const itemColumns = [
    {
      title: 'Description',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Unit',
      dataIndex: 'unit',
      key: 'unit',
      width: 80,
    },
    {
      title: 'Qty',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
      align: 'right' as const,
      render: (quantity: number) => Number(quantity || 0).toFixed(2),
    },
    {
      title: 'Price',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 100,
      align: 'right' as const,
      render: (price: number) => `$${Number(price || 0).toFixed(2)}`,
    },
    {
      title: 'Total',
      dataIndex: 'total',
      key: 'total',
      width: 120,
      align: 'right' as const,
      render: (total: number) => <span style={{ fontWeight: 600 }}>${Number(total || 0).toFixed(2)}</span>,
    },
  ];

  const paymentColumns = [
    {
      title: 'Date',
      dataIndex: 'paymentDate',
      key: 'paymentDate',
      render: (date: string) => dayjs(date).format('MMM D, YYYY'),
    },
    {
      title: 'Method',
      dataIndex: 'paymentMethod',
      key: 'paymentMethod',
      render: (method: PaymentMethod) => paymentMethodLabels[method],
    },
    {
      title: 'Reference',
      dataIndex: 'referenceNumber',
      key: 'referenceNumber',
      render: (ref?: string) => ref || '—',
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right' as const,
      render: (amount: number) => <span style={{ fontWeight: 600 }}>${Number(amount || 0).toFixed(2)}</span>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 140,
      align: 'center' as const,
      render: (_: any, record: Payment) => (
        <Space size="small">
          <Tooltip title="View Receipt">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => setReceiptPreviewPayment(record)}
              style={{ color: '#16a34a' }}
            />
          </Tooltip>
          <Tooltip title="Download Receipt">
            <Button
              type="text"
              size="small"
              icon={<DownloadOutlined />}
              onClick={async () => {
                try {
                  const blob = await invoiceService.payments.getReceiptPdf(id!, record.id);
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  const paymentDateStr = record.paymentDate
                    ? dayjs(record.paymentDate).format('YYYYMMDD')
                    : 'NoDate';
                  a.download = `Receipt_${record.id.substring(0, 8).toUpperCase()}_${paymentDateStr}.pdf`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  window.URL.revokeObjectURL(url);
                  message.success('Receipt downloaded');
                } catch (error) {
                  message.error('Failed to download receipt');
                }
              }}
              style={{ color: colors.primary }}
            />
          </Tooltip>
          <Button
            type="text"
            size="small"
            danger
            onClick={() => handleDeletePayment(record.id)}
          >
            Delete
          </Button>
        </Space>
      ),
    },
  ];

  const moreMenuItems = [
    { key: 'duplicate', icon: <CopyOutlined />, label: 'Duplicate' },
    ...(!isCanceled ? [
      { key: 'cancel', icon: <StopOutlined />, label: 'Cancel Invoice', danger: true },
    ] : []),
    { type: 'divider' as const },
    { key: 'delete', icon: <DeleteOutlined />, label: 'Delete', danger: true },
  ];

  // Mobile action menu - combines all actions except Record Payment
  const mobileActionMenuItems = [
    { key: 'download', icon: <DownloadOutlined />, label: 'Download PDF' },
    { key: 'send', icon: <SendOutlined />, label: 'Send' },
    { key: 'edit', icon: <EditOutlined />, label: 'Edit' },
    { type: 'divider' as const },
    { key: 'duplicate', icon: <CopyOutlined />, label: 'Duplicate' },
    ...(!isCanceled ? [
      { key: 'cancel', icon: <StopOutlined />, label: 'Cancel Invoice', danger: true },
    ] : []),
    { type: 'divider' as const },
    { key: 'delete', icon: <DeleteOutlined />, label: 'Delete', danger: true },
  ];

  const handleMobileMenuClick = ({ key }: { key: string }) => {
    switch (key) {
      case 'download':
        handleDownloadPdf();
        break;
      case 'send':
        handleSend();
        break;
      case 'edit':
        navigate(`/app/invoices/${id}/edit`);
        break;
      case 'duplicate':
        message.info('Duplicate feature coming soon');
        break;
      case 'cancel':
        handleCancel();
        break;
      case 'delete':
        setDeleteModalVisible(true);
        break;
    }
  };

  const handleMoreMenuClick = ({ key }: { key: string }) => {
    switch (key) {
      case 'duplicate':
        message.info('Duplicate feature coming soon');
        break;
      case 'cancel':
        handleCancel();
        break;
      case 'delete':
        setDeleteModalVisible(true);
        break;
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <h1 style={{ fontFamily: fonts.heading, fontSize: 24, fontWeight: 700, margin: 0 }}>
                {invoiceNumber}
              </h1>
              <Dropdown
                menu={{
                  items: (statusConfigs || [])
                    .filter((s) => s.isActive)
                    .map((s) => ({
                      key: s.id,
                      label: (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: s.color,
                            }}
                          />
                          {s.label}
                        </div>
                      ),
                    })),
                  onClick: ({ key }) => updateStatusMutation.mutate(key),
                  selectedKeys: invoice.statusId ? [invoice.statusId] : [],
                }}
                trigger={['click']}
              >
                <Tag
                  style={{
                    color: statusInfo.color,
                    background: statusInfo.bg,
                    border: 'none',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  {statusInfo.label}
                </Tag>
              </Dropdown>
            </div>
            <div style={{ color: colors.textSecondary }}>{invoice.title || 'No title'}</div>
          </div>

          {/* Mobile: Record Payment button + Actions dropdown */}
          {isMobile ? (
            <Space>
              {canRecordPayment && (
                <Button
                  icon={<DollarOutlined />}
                  type="primary"
                  style={{ background: colors.primary }}
                  onClick={() => setPaymentModalVisible(true)}
                >
                  Record Payment
                </Button>
              )}
              <Dropdown menu={{ items: mobileActionMenuItems, onClick: handleMobileMenuClick }} trigger={['click']}>
                <Button icon={<MoreOutlined />} />
              </Dropdown>
            </Space>
          ) : (
            /* Desktop: All buttons visible */
            <Space>
              <Button icon={<DownloadOutlined />} onClick={handleDownloadPdf}>
                Download PDF
              </Button>
              <Button icon={<SendOutlined />} onClick={handleSend}>
                Send
              </Button>
              {canRecordPayment && (
                <Button
                  icon={<DollarOutlined />}
                  type="primary"
                  style={{ background: colors.primary }}
                  onClick={() => setPaymentModalVisible(true)}
                >
                  Record Payment
                </Button>
              )}
              <Button icon={<EditOutlined />} onClick={() => navigate(`/app/invoices/${id}/edit`)}>
                Edit
              </Button>
              <Dropdown menu={{ items: moreMenuItems, onClick: handleMoreMenuClick }} trigger={['click']}>
                <Button icon={<MoreOutlined />} />
              </Dropdown>
            </Space>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
        {/* Main Content */}
        <div style={{ flex: 1, minWidth: isMobile ? 'auto' : 600 }}>
          {/* Customer & Dates */}
          <Card style={{ borderRadius: 12, marginBottom: 16 }}>
            <Descriptions column={{ xs: 1, sm: 1, md: 1, lg: 2, xl: 3 }}>
              <Descriptions.Item label="Customer">
                <div style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                  <div style={{ fontWeight: 600 }}>{customerName || '—'}</div>
                  {customerEmail && (
                    <div style={{ color: colors.textSecondary, fontSize: 13 }}>{customerEmail}</div>
                  )}
                  {customerAddress && (
                    <div style={{ color: colors.textSecondary, fontSize: 13 }}>{customerAddress}</div>
                  )}
                </div>
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                {statusOptions.length > 0 ? (
                  <Dropdown
                    menu={{
                      items: statusOptions.map((opt) => {
                        const status = statusConfigs?.find((s) => s.id === opt.value);
                        return {
                          key: opt.value,
                          label: (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  background: status?.color || '#999',
                                }}
                              />
                              {opt.label}
                            </div>
                          ),
                        };
                      }),
                      onClick: ({ key }) => updateStatusMutation.mutate(key),
                      selectedKeys: invoice.statusId ? [invoice.statusId] : [],
                    }}
                    trigger={['click']}
                  >
                    <Tag
                      style={{
                        color: statusInfo.color,
                        background: statusInfo.bg,
                        border: 'none',
                        fontWeight: 500,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'all 0.2s ease',
                        userSelect: 'none',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = '0.8';
                        e.currentTarget.style.transform = 'scale(1.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = '1';
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                    >
                      {statusInfo.label}
                      <DownOutlined style={{ fontSize: 10 }} />
                    </Tag>
                  </Dropdown>
                ) : (
                  <Tag
                    style={{
                      color: statusInfo.color,
                      background: statusInfo.bg,
                      border: 'none',
                      fontWeight: 500,
                    }}
                  >
                    {statusInfo.label}
                  </Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Invoice Date">
                <span style={{ whiteSpace: 'nowrap' }}>
                  {invoiceDate ? dayjs(invoiceDate).format('MMMM D, YYYY') : '—'}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Due Date">
                <span style={{ whiteSpace: 'nowrap' }}>
                  {dueDate ? dayjs(dueDate).format('MMMM D, YYYY') : '—'}
                </span>
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {/* Line Items by Section */}
          {sections.length > 0 ? (
            sections.map((section) => (
              <Card key={section.id} style={{ borderRadius: 12, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 style={{ fontFamily: fonts.heading, fontSize: 16, fontWeight: 600, margin: 0 }}>
                    {section.name}
                  </h3>
                  <span style={{ fontWeight: 600 }}>${Number(section.subtotal || 0).toFixed(2)}</span>
                </div>
                <Table
                  columns={itemColumns}
                  dataSource={section.items || []}
                  rowKey="id"
                  pagination={false}
                  size="small"
                />
              </Card>
            ))
          ) : (
            <Card style={{ borderRadius: 12, marginBottom: 16 }}>
              <div style={{ textAlign: 'center', padding: 24, color: colors.textSecondary }}>
                No line items added yet
              </div>
            </Card>
          )}

          {/* Payment History */}
          {payments.length > 0 && (
            <Card style={{ borderRadius: 12, marginBottom: 16 }}>
              <h3 style={{ fontFamily: fonts.heading, fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
                Payment History
              </h3>
              <Table
                columns={paymentColumns}
                dataSource={payments}
                rowKey="id"
                pagination={false}
                size="small"
              />
            </Card>
          )}

          {/* Notes */}
          {invoice.notes && (
            <Card style={{ borderRadius: 12 }}>
              <h3 style={{ fontFamily: fonts.heading, fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Notes</h3>
              <p style={{ color: colors.textSecondary, margin: 0 }}>{invoice.notes}</p>
            </Card>
          )}
        </div>

        {/* Summary Sidebar - Responsive */}
        <Card style={{ borderRadius: 12, width: isMobile ? '100%' : 'auto', flex: isMobile ? 1 : '0 0 280px', flexShrink: 0, alignSelf: 'flex-start', minWidth: isMobile ? 'auto' : 280 }}>
          <h3 style={{ fontFamily: fonts.heading, fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Summary</h3>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: colors.textSecondary }}>Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>

          {/* Adjustments */}
          {adjustments.length > 0 && (
            <>
              {adjustments.map((adj: Adjustment) => (
                <div key={adj.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: adj.type === 'premium' ? '#16a34a' : '#dc2626' }}>
                      {adj.name} ({adj.type === 'premium' ? '+' : '-'}{Number(adj.percentage).toFixed(1)}%)
                    </span>
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => handleDeleteAdjustment(adj.id)}
                      style={{ padding: 0, height: 'auto' }}
                    />
                  </div>
                  <span style={{ color: adj.type === 'premium' ? '#16a34a' : '#dc2626' }}>
                    {adj.type === 'premium' ? '+' : '-'}${Number(adj.amount || 0).toFixed(2)}
                  </span>
                </div>
              ))}
            </>
          )}

          <Button
            type="dashed"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => setAdjustmentModalOpen(true)}
            style={{ width: '100%', marginBottom: 8 }}
          >
            Add Premium/Discount
          </Button>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: colors.textSecondary }}>
              {taxLabel} ({taxRate}%)
            </span>
            <span>${taxAmount.toFixed(2)}</span>
          </div>

          <Divider style={{ margin: '16px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontWeight: 600, fontSize: 16 }}>Total</span>
            <span style={{ fontWeight: 700, fontSize: 20, fontFamily: fonts.heading }}>
              ${total.toFixed(2)}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: colors.textSecondary }}>Amount Paid</span>
            <span style={{ color: '#059669', fontWeight: 600 }}>
              -${amountPaid.toFixed(2)}
            </span>
          </div>

          <Divider style={{ margin: '8px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, fontSize: 16 }}>Balance Due</span>
            <span style={{
              fontWeight: 700,
              fontSize: 20,
              fontFamily: fonts.heading,
              color: balanceDue > 0 ? '#dc2626' : '#059669'
            }}>
              ${balanceDue.toFixed(2)}
            </span>
          </div>
        </Card>
      </div>

      {/* Record Payment Modal */}
      <Modal
        title="Record Payment"
        open={paymentModalVisible}
        onCancel={() => {
          setPaymentModalVisible(false);
          paymentForm.resetFields();
        }}
        onOk={() => paymentForm.submit()}
        okText="Record Payment"
      >
        <Form
          form={paymentForm}
          layout="vertical"
          onFinish={handleRecordPayment}
          initialValues={{
            paymentDate: dayjs(),
            paymentMethod: 'check',
            amount: balanceDue,
          }}
        >
          <Form.Item
            label="Amount"
            name="amount"
            rules={[
              { required: true, message: 'Please enter amount' },
              { type: 'number', min: 0.01, message: 'Amount must be greater than 0' },
              { type: 'number', max: balanceDue, message: 'Amount cannot exceed balance due' },
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              prefix="$"
              precision={2}
              min={0}
              max={balanceDue}
            />
          </Form.Item>

          <Form.Item
            label="Payment Method"
            name="paymentMethod"
            rules={[{ required: true, message: 'Please select payment method' }]}
          >
            <Select>
              <Select.Option value="cash">Cash</Select.Option>
              <Select.Option value="check">Check</Select.Option>
              <Select.Option value="credit_card">Credit Card</Select.Option>
              <Select.Option value="bank_transfer">Bank Transfer</Select.Option>
              <Select.Option value="other">Other</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="Payment Date"
            name="paymentDate"
            rules={[{ required: true, message: 'Please select payment date' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item label="Reference Number" name="referenceNumber">
            <Input placeholder="Check number, transaction ID, etc." />
          </Form.Item>

          <Form.Item label="Notes" name="notes">
            <Input.TextArea rows={3} placeholder="Optional payment notes" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        title="Delete Invoice"
        open={deleteModalVisible}
        onCancel={() => setDeleteModalVisible(false)}
        onOk={handleDelete}
        okText="Delete"
        okButtonProps={{ danger: true }}
      >
        <p>Are you sure you want to delete this invoice? This action cannot be undone.</p>
      </Modal>

      {/* Adjustment Modal */}
      <Modal
        title="Add Premium/Discount"
        open={adjustmentModalOpen}
        onCancel={() => {
          setAdjustmentModalOpen(false);
          adjustmentForm.resetFields();
        }}
        onOk={() => adjustmentForm.submit()}
        confirmLoading={addAdjustmentMutation.isPending}
      >
        <Form form={adjustmentForm} layout="vertical" onFinish={handleAddAdjustment}>
          <Form.Item
            name="type"
            label="Type"
            rules={[{ required: true, message: 'Please select the type' }]}
          >
            <Select placeholder="Select type">
              <Select.Option value="premium">Premium (+%)</Select.Option>
              <Select.Option value="discount">Discount (-%)</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Please enter a name' }]}
          >
            <Input placeholder="e.g., Holiday Premium, Volume Discount" />
          </Form.Item>
          <Form.Item
            name="percentage"
            label="Percentage"
            rules={[{ required: true, message: 'Please enter the percentage' }]}
          >
            <InputNumber
              suffix="%"
              style={{ width: '100%' }}
              min={0}
              max={100}
              precision={2}
              placeholder="10.00"
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Receipt Preview Modal */}
      {receiptPreviewPayment && (
        <ReceiptPreviewModal
          open={!!receiptPreviewPayment}
          onClose={() => setReceiptPreviewPayment(null)}
          invoiceId={id!}
          invoiceNumber={invoiceNumber}
          payment={receiptPreviewPayment}
          customerName={customerName}
          templates={pdfTemplates}
          templatesLoading={templatesLoading}
        />
      )}
    </motion.div>
  );
};

export default InvoiceDetailPage;
