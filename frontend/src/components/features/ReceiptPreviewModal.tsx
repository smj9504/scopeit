/**
 * ScopeIt - Receipt Preview Modal
 * Displays a preview of payment receipts with download functionality
 */
import React, { useState, useEffect, useRef } from 'react';
import { Modal, Select, Button, Spin, Space, Tooltip, message } from 'antd';
import {
  DownloadOutlined,
  PrinterOutlined,
  ExpandOutlined,
  CompressOutlined,
} from '@ant-design/icons';
import { colors, borderRadius } from '@/styles/theme';
import { invoiceService } from '@/services/invoiceService';
import type { PdfTemplateId, PdfTemplateInfo, Payment } from '@/types/entities';
import dayjs from 'dayjs';

interface ReceiptPreviewModalProps {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
  invoiceNumber: string;
  payment: Payment;
  customerName?: string;
  defaultTemplate?: PdfTemplateId;
  templates: PdfTemplateInfo[];
  templatesLoading?: boolean;
}

export const ReceiptPreviewModal: React.FC<ReceiptPreviewModalProps> = ({
  open,
  onClose,
  invoiceId,
  invoiceNumber,
  payment,
  customerName,
  defaultTemplate = 'classic',
  templates,
  templatesLoading = false,
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<PdfTemplateId>(defaultTemplate);
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Load preview when modal opens or template changes
  useEffect(() => {
    if (open && invoiceId && payment?.id) {
      loadPreview();
    }
  }, [open, invoiceId, payment?.id, selectedTemplate]);

  // Reset template when modal opens
  useEffect(() => {
    if (open) {
      setSelectedTemplate(defaultTemplate);
    }
  }, [open, defaultTemplate]);

  const loadPreview = async () => {
    setLoading(true);
    try {
      const html = await invoiceService.payments.getReceiptPreview(
        invoiceId,
        payment.id,
        selectedTemplate
      );
      setPreviewHtml(html);
    } catch (error) {
      message.error('Failed to load receipt preview');
      console.error('Preview error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const blob = await invoiceService.payments.getReceiptPdf(
        invoiceId,
        payment.id,
        selectedTemplate
      );

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // Generate filename
      const paymentDateStr = payment.paymentDate
        ? dayjs(payment.paymentDate).format('YYYYMMDD')
        : 'NoDate';
      const customerPart = customerName
        ? `_${customerName.replace(/[^a-zA-Z0-9]/g, '_')}`
        : '';
      const receiptNumber = `RCP-${payment.id.substring(0, 8).toUpperCase()}`;
      a.download = `Receipt_${receiptNumber}${customerPart}_${paymentDateStr}.pdf`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      message.success('Receipt downloaded successfully');
    } catch (error) {
      message.error('Failed to download receipt');
      console.error('Download error:', error);
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.print();
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const paymentDateDisplay = payment.paymentDate
    ? dayjs(payment.paymentDate).format('MMM D, YYYY')
    : 'No date';

  const paymentAmountDisplay = `$${Number(payment.amount || 0).toFixed(2)}`;

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontWeight: 600 }}>Payment Receipt</span>
          <span
            style={{
              background: '#dcfce7',
              color: '#16a34a',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {paymentAmountDisplay}
          </span>
          <span
            style={{
              color: colors.textSecondary,
              fontSize: 13,
              fontWeight: 400,
            }}
          >
            {paymentDateDisplay}
          </span>
        </div>
      }
      open={open}
      onCancel={onClose}
      width={isFullscreen ? '100%' : 900}
      style={isFullscreen ? { top: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
      styles={{
        body: {
          padding: 0,
          height: isFullscreen ? 'calc(100vh - 110px)' : 600,
          overflow: 'hidden',
        },
      }}
      footer={null}
      centered={!isFullscreen}
    >
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          borderBottom: `1px solid ${colors.border}`,
          background: colors.bgLight,
        }}
      >
        {/* Template Selector */}
        <Space>
          <span style={{ fontSize: 14, color: colors.textSecondary }}>Template:</span>
          <Select
            value={selectedTemplate}
            onChange={setSelectedTemplate}
            style={{ width: 180 }}
            loading={templatesLoading}
            options={templates.map((t) => ({
              value: t.id,
              label: t.name,
            }))}
          />
        </Space>

        {/* Actions */}
        <Space>
          <Tooltip title="Print">
            <Button
              icon={<PrinterOutlined />}
              onClick={handlePrint}
              disabled={loading}
            />
          </Tooltip>
          <Tooltip title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            <Button
              icon={isFullscreen ? <CompressOutlined /> : <ExpandOutlined />}
              onClick={toggleFullscreen}
            />
          </Tooltip>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleDownload}
            loading={downloading}
            disabled={loading}
            style={{ background: '#16a34a' }}
          >
            Download Receipt
          </Button>
        </Space>
      </div>

      {/* Preview Content */}
      <div
        style={{
          height: 'calc(100% - 57px)',
          overflow: 'auto',
          background: '#525659',
          display: 'flex',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        {loading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
            }}
          >
            <Spin size="large" tip="Loading receipt preview..." />
          </div>
        ) : (
          <div
            style={{
              width: '8.5in',
              minHeight: '11in',
              background: '#fff',
              boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
              borderRadius: borderRadius.sm,
              overflow: 'hidden',
            }}
          >
            <iframe
              ref={iframeRef}
              srcDoc={previewHtml}
              style={{
                width: '100%',
                height: '100%',
                minHeight: '11in',
                border: 'none',
              }}
              title="Receipt Preview"
            />
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ReceiptPreviewModal;
