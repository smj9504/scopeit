/**
 * ScopeIt - Import from Excel Modal
 * Shared between Estimates and Invoices list pages.
 */
import React, { useState } from 'react';
import {
  Modal,
  Upload,
  Button,
  Table,
  Alert,
  Typography,
  Space,
  Tag,
  message,
  Spin,
} from 'antd';
import {
  DownloadOutlined,
  FileExcelOutlined,
  InboxOutlined,
  CheckCircleOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { colors } from '@/styles/theme';
import type { ExcelParseResult, ExcelParsedSection } from '@/types/entities';
import type { ColumnsType } from 'antd/es/table';

const { Dragger } = Upload;
const { Text } = Typography;

interface ImportExcelModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (sections: ExcelParsedSection[]) => void;
  documentType: 'estimate' | 'invoice';
  onDownloadTemplate: () => Promise<Blob>;
  onParseFile: (file: File) => Promise<ExcelParseResult>;
  importing?: boolean;
}

interface PreviewRow {
  key: string;
  sectionName: string;
  code: string | null;
  name: string;
  description: string | null;
  unit: string | null;
  quantity: number;
  unit_price: number;
  is_taxable: boolean;
}

export function ImportExcelModal({
  open,
  onClose,
  onImport,
  documentType,
  onDownloadTemplate,
  onParseFile,
  importing = false,
}: ImportExcelModalProps) {
  const [parseResult, setParseResult] = useState<ExcelParseResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState('');

  const handleDownloadTemplate = async () => {
    try {
      const blob = await onDownloadTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scopeit_${documentType}_template.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      message.error('Failed to download template');
    }
  };

  const handleFileUpload = async (file: File) => {
    setParsing(true);
    setFileName(file.name);
    try {
      const result = await onParseFile(file);
      setParseResult(result);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || 'Failed to parse Excel file';
      message.error(detail);
      setParseResult(null);
    } finally {
      setParsing(false);
    }
    return false;
  };

  const handleImport = () => {
    if (parseResult) {
      onImport(parseResult.sections);
    }
  };

  const handleClose = () => {
    setParseResult(null);
    setFileName('');
    onClose();
  };

  const previewColumns: ColumnsType<PreviewRow> = [
    { title: 'Section', dataIndex: 'sectionName', width: 130 },
    { title: 'Code', dataIndex: 'code', width: 90 },
    { title: 'Name', dataIndex: 'name', width: 180, ellipsis: true },
    { title: 'Unit', dataIndex: 'unit', width: 60, align: 'center' },
    { title: 'Qty', dataIndex: 'quantity', width: 70, align: 'right' },
    {
      title: 'Unit Price',
      dataIndex: 'unit_price',
      width: 100,
      align: 'right',
      render: (v: number) => `$${v.toFixed(2)}`,
    },
    {
      title: 'Total',
      key: 'total',
      width: 100,
      align: 'right',
      render: (_: any, record: PreviewRow) =>
        `$${(record.quantity * record.unit_price).toFixed(2)}`,
    },
    {
      title: 'Tax',
      dataIndex: 'is_taxable',
      width: 55,
      align: 'center',
      render: (v: boolean) =>
        v ? <Tag color="blue">Yes</Tag> : <Tag>No</Tag>,
    },
  ];

  // Flatten sections into preview rows
  const previewData: PreviewRow[] =
    parseResult?.sections.flatMap((section) =>
      section.items.map((item, idx) => ({
        key: `${section.name}-${idx}`,
        sectionName: idx === 0 ? section.name : '',
        ...item,
      }))
    ) || [];

  const label = documentType === 'estimate' ? 'Estimate' : 'Invoice';

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      title={`Import ${label} from Excel`}
      width={920}
      footer={
        parseResult
          ? [
              <Button key="cancel" onClick={handleClose}>
                Cancel
              </Button>,
              <Button
                key="import"
                type="primary"
                onClick={handleImport}
                loading={importing}
                icon={<CheckCircleOutlined />}
                style={{ background: colors.primary }}
              >
                Import {parseResult.total_items} Items
              </Button>,
            ]
          : [
              <Button key="cancel" onClick={handleClose}>
                Cancel
              </Button>,
            ]
      }
    >
      {/* Template download banner */}
      <div
        style={{
          marginBottom: 20,
          padding: '12px 16px',
          background: '#f0f5ff',
          borderRadius: 8,
          border: '1px solid #d6e4ff',
        }}
      >
        <Space>
          <FileExcelOutlined style={{ color: '#217346', fontSize: 18 }} />
          <Text>Need the template?</Text>
          <Button
            type="link"
            icon={<DownloadOutlined />}
            onClick={handleDownloadTemplate}
            style={{ padding: 0 }}
          >
            Download Excel Template
          </Button>
        </Space>
      </div>

      {/* File upload area */}
      {!parseResult && (
        <Dragger
          accept=".xlsx,.xls"
          showUploadList={false}
          beforeUpload={(file) => {
            handleFileUpload(file as unknown as File);
            return false;
          }}
          disabled={parsing}
          style={{ padding: '20px 0' }}
        >
          {parsing ? (
            <div style={{ padding: 24 }}>
              <Spin tip="Parsing file..." />
            </div>
          ) : (
            <>
              <p className="ant-upload-drag-icon">
                <InboxOutlined style={{ color: colors.primary, fontSize: 40 }} />
              </p>
              <p className="ant-upload-text">
                Click or drag an Excel file here
              </p>
              <p className="ant-upload-hint">
                Upload a .xlsx file with your {documentType} line items
              </p>
            </>
          )}
        </Dragger>
      )}

      {/* Parse result preview */}
      {parseResult && (
        <>
          <Alert
            type="success"
            showIcon
            message={
              <span>
                Parsed <strong>{parseResult.total_items}</strong> items in{' '}
                <strong>{parseResult.sections.length}</strong> section(s) from{' '}
                <Text code>{fileName}</Text>
              </span>
            }
            style={{ marginBottom: 16 }}
          />

          {parseResult.errors.length > 0 && (
            <Alert
              type="warning"
              showIcon
              message={`${parseResult.errors.length} warning(s)`}
              description={
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {parseResult.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              }
              style={{ marginBottom: 16 }}
            />
          )}

          <Table
            columns={previewColumns}
            dataSource={previewData}
            size="small"
            pagination={false}
            scroll={{ y: 300 }}
            style={{ marginBottom: 16 }}
          />

          <Button
            icon={<UploadOutlined />}
            onClick={() => {
              setParseResult(null);
              setFileName('');
            }}
          >
            Upload a different file
          </Button>
        </>
      )}
    </Modal>
  );
}
