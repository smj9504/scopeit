import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Modal,
  Button,
  InputNumber,
  Switch,
  Input,
  Collapse,
  Divider,
  Space,
  Row,
  Col,
  Typography,
  message,
  Tag,
  Table,
  Card,
  Tooltip,
  Checkbox,
  Alert,
} from 'antd';
import {
  CloseOutlined,
  WarningOutlined,
  FilePdfOutlined,
  FileExcelOutlined,
  FileTextOutlined,
  SaveOutlined,
  PlusOutlined,
  CheckOutlined,
  CloseCircleOutlined,
  UserOutlined,
  BankOutlined,
  DownOutlined,
  RightOutlined,
} from '@ant-design/icons';
import ReportExportModal from './ReportExportModal';
import type { ColumnsType } from 'antd/es/table';
import { colors, fonts, borderRadius } from '@/styles/theme';
import { packingApi } from './packingApi';
import type {
  EstimateResponse,
  SectionDetailLine,
  ClientInfo,
  CompanyInfoOverride,
} from './types';

const { Title, Text } = Typography;
const { Panel } = Collapse;

// ── Mobile detection ──────────────────────────────────────────────────────────

function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const SECTION_ORDER = [
  'Pack-Out Labor',
  'Pack-Back Labor',
  'Transport Out',
  'Transport Back',
  'Materials',
  'Special Items',
  'Storage',
];

function sortSections(sections: Record<string, number>): [string, number][] {
  const entries = Object.entries(sections);
  return entries.sort(([a], [b]) => {
    const ai = SECTION_ORDER.indexOf(a);
    const bi = SECTION_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

// ── Interfaces ────────────────────────────────────────────────────────────────

interface EstimateEditorModalProps {
  open: boolean;
  onClose: () => void;
  result: EstimateResponse;
  setResult: React.Dispatch<React.SetStateAction<EstimateResponse | null>>;
  mode: 'quick' | 'content';
  clientInfo: ClientInfo;
  setClientInfo: React.Dispatch<React.SetStateAction<ClientInfo>>;
  companyOverride: CompanyInfoOverride;
  setCompanyOverride: React.Dispatch<React.SetStateAction<CompanyInfoOverride>>;
  activeSessionId?: string;
  onCreateEstimate?: () => void;
  onSaveSession?: () => Promise<void>;
  photoRooms?: import('./types').PhotoRoom[];
  rooms?: import('./types').PackingRoom[];
}

interface EditingState {
  sectionName: string;
  lineIndex: number;
  name: string;
  detail: string;
  qty: number;
  unit: string;
  rate: number;
}

interface NewLineState {
  sectionName: string;
  name: string;
  detail: string;
  qty: number;
  unit: string;
  rate: number;
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

interface SectionLineTableProps {
  sectionName: string;
  lines: SectionDetailLine[];
  editing: EditingState | null;
  onStartEdit: (sectionName: string, lineIndex: number, line: SectionDetailLine) => void;
  onEditField: (field: keyof EditingState, value: string | number) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDeleteLine: (sectionName: string, lineIndex: number) => void;
}

const SectionLineTable: React.FC<SectionLineTableProps> = ({
  sectionName,
  lines,
  editing,
  onStartEdit,
  onEditField,
  onSaveEdit,
  onCancelEdit,
  onDeleteLine,
}) => {
  const isRowEditing = (record: { _index: number }) =>
    editing?.sectionName === sectionName && editing?.lineIndex === record._index;

  const columns: ColumnsType<SectionDetailLine & { _index: number }> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      width: 140,
      ellipsis: true,
      render: (val, record) => {
        if (isRowEditing(record)) {
          return (
            <Input
              size="small"
              value={editing!.name}
              onChange={(e) => onEditField('name', e.target.value)}
              onPressEnter={onSaveEdit}
              autoFocus
              style={{ fontFamily: fonts.body }}
            />
          );
        }
        return <Text style={{ fontSize: 13, fontFamily: fonts.body }}>{val}</Text>;
      },
    },
    {
      title: 'Detail',
      dataIndex: 'detail',
      key: 'detail',
      ellipsis: true,
      render: (val, record) => {
        if (isRowEditing(record)) {
          return (
            <Input
              size="small"
              value={editing!.detail}
              onChange={(e) => onEditField('detail', e.target.value)}
              onPressEnter={onSaveEdit}
              style={{ fontFamily: fonts.body }}
            />
          );
        }
        return (
          <Text style={{ fontSize: 13, color: colors.textSecondary, fontFamily: fonts.body }}>
            {val}
          </Text>
        );
      },
    },
    {
      title: 'Qty',
      dataIndex: 'qty',
      key: 'qty',
      width: 80,
      align: 'right' as const,
      render: (val, record) => {
        if (isRowEditing(record)) {
          return (
            <InputNumber
              size="small"
              min={0}
              step={0.5}
              value={editing!.qty}
              onChange={(v) => onEditField('qty', v ?? 0)}
              style={{ width: 70 }}
              onPressEnter={onSaveEdit}
            />
          );
        }
        return <Text style={{ fontSize: 13 }}>{val}</Text>;
      },
    },
    {
      title: 'Unit',
      dataIndex: 'unit',
      key: 'unit',
      width: 70,
      render: (val, record) => {
        if (isRowEditing(record)) {
          return (
            <Input
              size="small"
              value={editing!.unit}
              onChange={(e) => onEditField('unit', e.target.value)}
              onPressEnter={onSaveEdit}
              style={{ width: 55 }}
            />
          );
        }
        return <Text style={{ fontSize: 13, color: colors.textSecondary }}>{val}</Text>;
      },
    },
    {
      title: 'Rate',
      dataIndex: 'rate',
      key: 'rate',
      width: 100,
      align: 'right' as const,
      render: (val, record) => {
        if (isRowEditing(record)) {
          return (
            <InputNumber
              size="small"
              min={0}
              step={1}
              value={editing!.rate}
              onChange={(v) => onEditField('rate', v ?? 0)}
              style={{ width: 80 }}
              prefix="$"
              onPressEnter={onSaveEdit}
            />
          );
        }
        return <Text style={{ fontSize: 13 }}>{fmt(val)}</Text>;
      },
    },
    {
      title: 'Amount',
      key: 'amount',
      width: 100,
      align: 'right' as const,
      render: (_, record) => {
        const ed = isRowEditing(record);
        const amount = ed ? editing!.qty * editing!.rate : record.amount;
        return (
          <Text strong style={{ fontSize: 13, color: ed ? colors.info : colors.textPrimary }}>
            {fmt(amount)}
          </Text>
        );
      },
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      fixed: 'right' as const,
      align: 'center' as const,
      render: (_, record) => {
        if (isRowEditing(record)) {
          return (
            <Space size={4}>
              <Button
                type="text"
                size="small"
                icon={<CheckOutlined style={{ color: colors.success }} />}
                onClick={onSaveEdit}
              />
              <Button
                type="text"
                size="small"
                icon={<CloseCircleOutlined style={{ color: colors.error }} />}
                onClick={onCancelEdit}
              />
            </Space>
          );
        }
        return (
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined style={{ color: colors.textMuted, fontSize: 11 }} />}
            onClick={() => onDeleteLine(sectionName, record._index)}
          />
        );
      },
    },
  ];

  const data = lines.map((line, i) => ({ ...line, _index: i, key: i }));

  return (
    <Table
      className="estimate-compact-table"
      columns={columns}
      dataSource={data}
      size="small"
      pagination={false}
      scroll={{ x: 600 }}
      onRow={(record) => ({
        onDoubleClick: () => {
          if (!editing) {
            onStartEdit(sectionName, record._index, record);
          }
        },
        style: {
          cursor: 'pointer',
          background:
            editing?.sectionName === sectionName && editing?.lineIndex === record._index
              ? '#eff6ff'
              : undefined,
        },
      })}
      style={{ marginTop: 4 }}
    />
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

export const EstimateEditorModal: React.FC<EstimateEditorModalProps> = ({
  open,
  onClose,
  result,
  setResult,
  mode,
  clientInfo,
  setClientInfo,
  companyOverride,
  setCompanyOverride,
  activeSessionId,
  onCreateEstimate,
  onSaveSession,
  photoRooms,
  rooms,
}) => {
  // ── Responsive ─────────────────────────────────────────────────────────────
  const isMobile = useIsMobile();

  // ── Local state ────────────────────────────────────────────────────────────
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [taxRate, setTaxRate] = useState<number>(0);
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);
  const [showCompanyOverride, setShowCompanyOverride] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  // New line draft state
  const [newLine, setNewLine] = useState<NewLineState | null>(null);

  // Add section state
  const [newSectionName, setNewSectionName] = useState('');
  const [showAddSection, setShowAddSection] = useState(false);

  // ── Derived totals ─────────────────────────────────────────────────────────
  const computedGrandTotal = useMemo(() => {
    const tax = result.subtotal * (taxRate / 100);
    return result.subtotal + result.op_amount + (result.supplements_total || 0) + result.contingency_amount + tax;
  }, [result.subtotal, result.op_amount, result.supplements_total, result.contingency_amount, taxRate]);

  // ── Inline edit handlers ──────────────────────────────────────────────────

  const handleStartEdit = useCallback(
    (sectionName: string, lineIndex: number, line: SectionDetailLine) => {
      setEditing({
        sectionName,
        lineIndex,
        name: line.name,
        detail: line.detail || '',
        qty: line.qty,
        unit: line.unit || 'EA',
        rate: line.rate,
      });
    },
    [],
  );

  const handleEditField = useCallback(
    (field: keyof EditingState, value: string | number) => {
      setEditing((prev) => (prev ? { ...prev, [field]: value } : prev));
    },
    [],
  );

  const handleSaveEdit = useCallback(() => {
    if (!editing) return;
    const { sectionName, lineIndex, name, detail, qty, unit, rate } = editing;
    const newAmount = Math.round(qty * rate * 100) / 100;

    setResult((prev) => {
      if (!prev) return prev;

      const isMat = sectionName === 'Materials';
      const hasMaterialDetails = isMat && prev.material_details && prev.material_details.length > 0;

      let newMaterialDetails = prev.material_details;
      const details = prev.section_details ? { ...prev.section_details } : {};

      if (hasMaterialDetails) {
        // Update material_details
        const md = [...prev.material_details!];
        if (lineIndex < md.length) {
          md[lineIndex] = {
            ...md[lineIndex],
            name,
            code: detail,
            quantity: qty,
            unit,
            unit_price: rate,
            total: newAmount,
          };
        }
        newMaterialDetails = md;

        // Also sync section_details.Materials.lines if it exists
        if (details[sectionName]) {
          const sdLines = [...details[sectionName].lines];
          if (lineIndex < sdLines.length) {
            sdLines[lineIndex] = { ...sdLines[lineIndex], name, detail, qty, unit, rate, amount: newAmount };
          }
          details[sectionName] = { lines: sdLines };
        }
      } else {
        if (!details[sectionName]) return prev;
        const lines = [...details[sectionName].lines];
        lines[lineIndex] = { ...lines[lineIndex], name, detail, qty, unit, rate, amount: newAmount };
        details[sectionName] = { lines };
      }

      // Recalculate section total
      const sectionTotal = hasMaterialDetails
        ? newMaterialDetails!.reduce((sum, m) => sum + m.total, 0)
        : details[sectionName]?.lines.reduce((sum: number, l: any) => sum + l.amount, 0) ?? 0;
      const newSections = { ...prev.sections, [sectionName]: sectionTotal };
      const subtotal = Object.values(newSections).reduce((s, v) => s + v, 0);
      const opAmount = prev.include_op ? subtotal * (prev.op_rate / 100) : 0;
      const contingencyAmount = prev.include_contingency
        ? subtotal * (prev.contingency_rate / 100)
        : 0;

      return {
        ...prev,
        sections: newSections,
        section_details: details,
        material_details: newMaterialDetails,
        subtotal,
        op_amount: opAmount,
        contingency_amount: contingencyAmount,
        grand_total: subtotal + opAmount + contingencyAmount + (prev.supplements_total || 0),
      };
    });

    setEditing(null);
  }, [editing, setResult]);

  const handleCancelEdit = useCallback(() => setEditing(null), []);

  const handleDeleteLine = useCallback(
    (sectionName: string, lineIndex: number) => {
      setResult((prev) => {
        if (!prev) return prev;

        // Materials section: may use material_details instead of section_details
        const isMat = sectionName === 'Materials';
        const hasMaterialDetails = isMat && prev.material_details && prev.material_details.length > 0;

        let newMaterialDetails = prev.material_details;
        let sectionTotal: number;

        if (hasMaterialDetails) {
          // Delete from material_details
          const md = [...prev.material_details!];
          md.splice(lineIndex, 1);
          newMaterialDetails = md;
          sectionTotal = md.reduce((sum, m) => sum + m.total, 0);
        } else {
          // Delete from section_details
          const details = prev.section_details ? { ...prev.section_details } : {};
          if (!details[sectionName]) return prev;
          const lines = [...details[sectionName].lines];
          lines.splice(lineIndex, 1);
          sectionTotal = lines.reduce((sum, l) => sum + l.amount, 0);

          const newSections = { ...prev.sections, [sectionName]: sectionTotal };
          const subtotal = Object.values(newSections).reduce((s, v) => s + v, 0);
          const opAmount = prev.include_op ? subtotal * (prev.op_rate / 100) : 0;
          const contingencyAmount = prev.include_contingency
            ? subtotal * (prev.contingency_rate / 100)
            : 0;
          return {
            ...prev,
            sections: newSections,
            section_details: { ...details, [sectionName]: { lines } },
            subtotal,
            op_amount: opAmount,
            contingency_amount: contingencyAmount,
            grand_total: subtotal + opAmount + contingencyAmount + (prev.supplements_total || 0),
          };
        }

        // Update section total and recalculate for material_details path
        const newSections = { ...prev.sections, [sectionName]: sectionTotal };
        // Also sync section_details.Materials.lines if it exists
        const details = prev.section_details ? { ...prev.section_details } : {};
        if (details[sectionName]) {
          const sdLines = [...details[sectionName].lines];
          if (lineIndex < sdLines.length) sdLines.splice(lineIndex, 1);
          details[sectionName] = { lines: sdLines };
        }
        const subtotal = Object.values(newSections).reduce((s, v) => s + v, 0);
        const opAmount = prev.include_op ? subtotal * (prev.op_rate / 100) : 0;
        const contingencyAmount = prev.include_contingency
          ? subtotal * (prev.contingency_rate / 100)
          : 0;

        return {
          ...prev,
          sections: newSections,
          section_details: details,
          material_details: newMaterialDetails,
          subtotal,
          op_amount: opAmount,
          contingency_amount: contingencyAmount,
          grand_total: subtotal + opAmount + contingencyAmount + (prev.supplements_total || 0),
        };
      });
    },
    [setResult],
  );

  // ── Add line handlers ──────────────────────────────────────────────────────

  const handleStartNewLine = (sectionName: string) => {
    setNewLine({
      sectionName,
      name: '',
      detail: '',
      qty: 1,
      unit: 'EA',
      rate: 0,
    });
  };

  const handleCommitNewLine = () => {
    if (!newLine) return;
    if (!newLine.name.trim()) {
      message.warning('Line item name is required');
      return;
    }

    const amount = newLine.qty * newLine.rate;

    setResult((prev) => {
      if (!prev) return prev;
      const details = prev.section_details ? { ...prev.section_details } : {};
      const existingLines = details[newLine.sectionName]?.lines ?? [];
      const lines = [
        ...existingLines,
        {
          name: newLine.name,
          detail: newLine.detail,
          qty: newLine.qty,
          unit: newLine.unit,
          rate: newLine.rate,
          amount,
        },
      ];
      const sectionTotal = lines.reduce((sum, l) => sum + l.amount, 0);
      const newSections = { ...prev.sections, [newLine.sectionName]: sectionTotal };
      const subtotal = Object.values(newSections).reduce((s, v) => s + v, 0);
      const opAmount = prev.include_op ? subtotal * (prev.op_rate / 100) : 0;
      const contingencyAmount = prev.include_contingency
        ? subtotal * (prev.contingency_rate / 100)
        : 0;

      return {
        ...prev,
        sections: newSections,
        section_details: { ...details, [newLine.sectionName]: { lines } },
        subtotal,
        op_amount: opAmount,
        contingency_amount: contingencyAmount,
        grand_total: subtotal + opAmount + contingencyAmount + (prev.supplements_total || 0),
      };
    });

    setNewLine(null);
  };

  // ── Add section handler ────────────────────────────────────────────────────

  const handleAddSection = () => {
    if (!newSectionName.trim()) {
      message.warning('Section name is required');
      return;
    }
    setResult((prev) => {
      if (!prev) return prev;
      if (prev.sections[newSectionName]) {
        message.warning('Section already exists');
        return prev;
      }
      return {
        ...prev,
        sections: { ...prev.sections, [newSectionName]: 0 },
        section_details: {
          ...(prev.section_details ?? {}),
          [newSectionName]: { lines: [] },
        },
      };
    });
    setNewSectionName('');
    setShowAddSection(false);
  };

  // ── O&P / Contingency handlers ─────────────────────────────────────────────

  const handleOpToggle = (checked: boolean) => {
    setResult((prev) => {
      if (!prev) return prev;
      const opAmount = checked ? prev.subtotal * (prev.op_rate / 100) : 0;
      const contingencyAmount = prev.include_contingency
        ? prev.subtotal * (prev.contingency_rate / 100)
        : prev.contingency_amount;
      return {
        ...prev,
        include_op: checked,
        op_amount: opAmount,
        grand_total: prev.subtotal + opAmount + contingencyAmount + (prev.supplements_total || 0),
      };
    });
  };

  const handleOpRateChange = (val: number | null) => {
    const rate = val ?? 0;
    setResult((prev) => {
      if (!prev) return prev;
      const opAmount = prev.include_op ? prev.subtotal * (rate / 100) : 0;
      return {
        ...prev,
        op_rate: rate,
        op_amount: opAmount,
        grand_total: prev.subtotal + opAmount + prev.contingency_amount + (prev.supplements_total || 0),
      };
    });
  };

  // ── Export handlers ────────────────────────────────────────────────────────

  const handleExportPdf = async () => {
    if (!activeSessionId) {
      message.error('No active session to export');
      return;
    }
    setExporting('pdf');
    try {
      // Save latest edits to session before exporting
      if (onSaveSession) await onSaveSession();
      const blob = await packingApi.exportPdf(activeSessionId, companyOverride, taxRate);
      const addr = clientInfo.property_address?.trim().replace(/[<>:"/\\|?*]+/g, '').replace(/\s+/g, ' ');
      const pdfName = addr ? `Pack_in_out Estimate - ${addr}.pdf` : `Pack_in_out Estimate-${activeSessionId}.pdf`;
      triggerDownload(blob, pdfName);
      message.success('PDF downloaded');
    } catch {
      message.error('Failed to export PDF');
    } finally {
      setExporting(null);
    }
  };

  const handleExportExcel = async () => {
    if (!activeSessionId) {
      message.error('No active session to export');
      return;
    }
    setExporting('excel');
    try {
      if (onSaveSession) await onSaveSession();
      const blob = await packingApi.exportExcel(activeSessionId, companyOverride, taxRate);
      const addr = clientInfo.property_address?.trim().replace(/[<>:"/\\|?*]+/g, '').replace(/\s+/g, ' ');
      const xlsName = addr ? `Pack_in_out Estimate - ${addr}.xlsx` : `Pack_in_out Estimate-${activeSessionId}.xlsx`;
      triggerDownload(blob, xlsName);
      message.success('Excel downloaded');
    } catch {
      message.error('Failed to export Excel');
    } finally {
      setExporting(null);
    }
  };

  // ── Sections rendering ─────────────────────────────────────────────────────

  const sortedSections = sortSections(result.sections);

  const sectionPanels = sortedSections.map(([sectionName, sectionTotal]) => {
    const detail = result.section_details?.[sectionName];
    const isAddingHere = newLine?.sectionName === sectionName;
    const isMaterialsSection = sectionName === 'Materials';

    return (
      <Panel
        key={sectionName}
        header={
          <Row justify="space-between" align="middle" style={{ width: '100%', paddingRight: 8 }}>
            <Col>
              <Text
                strong
                style={{
                  fontSize: 14,
                  fontFamily: fonts.heading,
                  color: colors.textPrimary,
                }}
              >
                {sectionName}{isMaterialsSection && (result.material_details || detail?.lines) ? ` (${(result.material_details?.length ?? detail?.lines?.length ?? 0)} items)` : ''}
              </Text>
            </Col>
            <Col>
              <Text
                strong
                style={{ fontSize: 14, color: colors.info, fontFamily: fonts.body }}
              >
                {fmt(sectionTotal)}
              </Text>
            </Col>
          </Row>
        }
        style={{
          marginBottom: 8,
          border: `1px solid ${colors.border}`,
          borderRadius: borderRadius.md,
          overflow: 'hidden',
        }}
      >
        {/* Materials section: convert material_details to standard line format */}
        {isMaterialsSection && result.material_details && result.material_details.length > 0 && (
          <SectionLineTable
            sectionName={sectionName}
            lines={result.material_details.map((m) => ({
              name: m.name,
              detail: m.detail ?? m.code ?? '',
              qty: m.quantity,
              unit: m.unit,
              rate: m.unit_price,
              amount: m.total,
            }))}
            editing={editing}
            onStartEdit={handleStartEdit}
            onEditField={handleEditField}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={handleCancelEdit}
            onDeleteLine={handleDeleteLine}
          />
        )}

        {/* Materials fallback: use section_details lines when material_details is absent */}
        {isMaterialsSection && !result.material_details && detail && detail.lines.length > 0 && (
          <SectionLineTable
            sectionName={sectionName}
            lines={detail.lines}
            editing={editing}
            onStartEdit={handleStartEdit}
            onEditField={handleEditField}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={handleCancelEdit}
            onDeleteLine={handleDeleteLine}
          />
        )}

        {/* Other sections: show section_details lines */}
        {!isMaterialsSection && detail && detail.lines.length > 0 && (
          <SectionLineTable
            sectionName={sectionName}
            lines={detail.lines}
            editing={editing}
            onStartEdit={handleStartEdit}
            onEditField={handleEditField}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={handleCancelEdit}
            onDeleteLine={handleDeleteLine}
          />
        )}

        {/* New line row */}
        {isAddingHere && newLine && (
          <div
            style={{
              display: 'flex',
              gap: 6,
              padding: '8px 12px',
              background: '#f0f9ff',
              borderTop: `1px solid ${colors.border}`,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <Input
              size="small"
              placeholder="Name"
              value={newLine.name}
              onChange={(e) => setNewLine((n) => n && { ...n, name: e.target.value })}
              autoFocus
              style={{ flex: '1 1 120px', minWidth: 100 }}
            />
            <Input
              size="small"
              placeholder="Detail"
              value={newLine.detail}
              onChange={(e) => setNewLine((n) => n && { ...n, detail: e.target.value })}
              style={{ flex: '2 1 160px', minWidth: 100 }}
            />
            <InputNumber
              size="small"
              min={0}
              value={newLine.qty}
              onChange={(v) => setNewLine((n) => n && { ...n, qty: v ?? 1 })}
              style={{ width: 70 }}
            />
            <Input
              size="small"
              placeholder="Unit"
              value={newLine.unit}
              onChange={(e) => setNewLine((n) => n && { ...n, unit: e.target.value })}
              style={{ width: 60 }}
            />
            <InputNumber
              size="small"
              min={0}
              value={newLine.rate}
              onChange={(v) => setNewLine((n) => n && { ...n, rate: v ?? 0 })}
              prefix="$"
              style={{ width: 90 }}
            />
            <Space size={4}>
              <Button
                type="primary"
                size="small"
                icon={<CheckOutlined />}
                onClick={handleCommitNewLine}
              />
              <Button
                size="small"
                icon={<CloseOutlined />}
                onClick={() => setNewLine(null)}
              />
            </Space>
          </div>
        )}

        <div style={{ padding: '8px 12px' }}>
          <Button
            type="dashed"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => handleStartNewLine(sectionName)}
            disabled={isAddingHere || !!editing}
            style={{ width: '100%', borderColor: colors.border, color: colors.textSecondary }}
          >
            Add Line
          </Button>
        </div>
      </Panel>
    );
  });

  // ── Room summaries ─────────────────────────────────────────────────────────

  const roomSummaryPanels = result.room_summaries?.map((rs) => (
    <Panel
      key={rs.room_name}
      header={
        <Row justify="space-between" align="middle">
          <Col>
            <Text strong style={{ fontSize: 13, fontFamily: fonts.body }}>
              {rs.room_name}
            </Text>
          </Col>
          <Col>
            <Tag style={{ fontSize: 11 }}>{rs.item_count} items</Tag>
          </Col>
        </Row>
      }
      style={{
        marginBottom: 6,
        border: `1px solid ${colors.border}`,
        borderRadius: borderRadius.base,
      }}
    >
      <Row gutter={[16, 8]}>
        {rs.notable_items.length > 0 && (
          <Col span={24}>
            <Text style={{ fontSize: 12, color: colors.textSecondary }}>Notable: </Text>
            {rs.notable_items.slice(0, 5).map((item) => (
              <Tag key={item} style={{ fontSize: 11, marginBottom: 4 }}>
                {item}
              </Tag>
            ))}
          </Col>
        )}
        {rs.high_value_items.length > 0 && (
          <Col span={24}>
            <Text style={{ fontSize: 12, color: colors.warning }}>High Value: </Text>
            {rs.high_value_items.slice(0, 4).map((item) => (
              <Tag
                key={item}
                color="warning"
                style={{ fontSize: 11, marginBottom: 4 }}
              >
                {item}
              </Tag>
            ))}
          </Col>
        )}
      </Row>
    </Panel>
  ));

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width="95vw"
      style={{ top: 20, maxWidth: 1200 }}
      styles={{
        body: {
          padding: 0,
          height: 'calc(95vh - 40px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        },
        content: {
          padding: 0,
          borderRadius: borderRadius.lg,
          overflow: 'hidden',
        },
      }}
      closeIcon={null}
      destroyOnHidden
    >
      {/* Compact table styles */}
      <style>{`
        .estimate-compact-table .ant-table-thead > tr > th {
          padding: 4px 8px !important;
          font-size: 12px;
          line-height: 1.4;
        }
        .estimate-compact-table .ant-table-tbody > tr > td {
          padding: 4px 8px !important;
          line-height: 1.4;
        }
        .estimate-compact-table .ant-table-thead > tr > th.ant-table-cell {
          background: ${colors.bgLight};
        }
        .estimate-editor-panel .ant-input {
          font-size: 13px !important;
          padding: 4px 8px !important;
        }
        .estimate-editor-panel .ant-input-affix-wrapper {
          font-size: 13px !important;
          padding: 4px 8px !important;
        }
        .estimate-editor-panel .ant-input-affix-wrapper > .ant-input {
          font-size: 13px !important;
          padding: 0 !important;
        }
      `}</style>
      {/* ── Sticky Header ──────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: `1px solid ${colors.border}`,
          background: colors.bgWhite,
          flexShrink: 0,
          gap: 16,
        }}
      >
        {/* Left: title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Title
            level={5}
            style={{
              margin: 0,
              fontFamily: fonts.heading,
              color: colors.textPrimary,
              fontWeight: 700,
            }}
          >
            Estimate Editor
          </Title>
          {mode === 'content' && (
            <Tag color="blue" style={{ fontSize: 11 }}>
              Photo AI
            </Tag>
          )}
        </div>

        {/* Stale result warning */}
        {(result as any)?._stale && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 12px', background: '#fffbeb', border: '1px solid #fde68a',
            borderRadius: borderRadius.base, fontSize: 12, color: '#92400e',
          }}>
            <WarningOutlined />
            Items were modified. Re-calculate to update the estimate.
          </div>
        )}

        {/* Right: close button */}
        <Button
          type="text"
          icon={<CloseOutlined />}
          onClick={onClose}
          style={{ marginLeft: 'auto', color: colors.textSecondary }}
        />
      </div>

      {/* ── Scrollable Body ─────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: isMobile ? '16px 16px' : '32px 32px',
          background: colors.bgLight,
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: 24,
        }}
      >
        {/* Left column: Sections + Materials + Room Summaries */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, paddingRight: isMobile ? 0 : 10, order: isMobile ? 2 : 1 }}>
          {/* ── Sections ──────────────────────────────────────────────────── */}
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <Title
                level={5}
                style={{
                  margin: 0,
                  fontFamily: fonts.heading,
                  fontSize: 15,
                  color: colors.textPrimary,
                }}
              >
                Sections
              </Title>
              <Text
                style={{ fontSize: 12, color: colors.textMuted }}
              >
                Double-click a row to edit
              </Text>
            </div>

            <Collapse
              bordered={false}
              defaultActiveKey={sortedSections.map(([k]) => k)}
              style={{ background: 'transparent' }}
              expandIcon={({ isActive }) =>
                isActive ? (
                  <DownOutlined style={{ fontSize: 11 }} />
                ) : (
                  <RightOutlined style={{ fontSize: 11 }} />
                )
              }
            >
              {sectionPanels}
            </Collapse>

            {/* Add Section */}
            <div style={{ marginTop: 8 }}>
              {showAddSection ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <Input
                    placeholder="Section name"
                    value={newSectionName}
                    onChange={(e) => setNewSectionName(e.target.value)}
                    onPressEnter={handleAddSection}
                    autoFocus
                    size="small"
                    style={{ flex: 1 }}
                  />
                  <Button size="small" type="primary" onClick={handleAddSection}>
                    Add
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      setShowAddSection(false);
                      setNewSectionName('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={() => setShowAddSection(true)}
                  style={{
                    width: '100%',
                    borderColor: colors.borderDark,
                    color: colors.textSecondary,
                  }}
                >
                  Add Section
                </Button>
              )}
            </div>
          </div>

          {/* Materials detail is now rendered inline inside the Materials section panel above */}

          {/* ── Room Summaries ─────────────────────────────────────────────── */}
          {mode === 'content' && result.room_summaries && result.room_summaries.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <Collapse
                bordered={false}
                style={{ background: 'transparent' }}
                expandIcon={({ isActive }) =>
                  isActive ? (
                    <DownOutlined style={{ fontSize: 11 }} />
                  ) : (
                    <RightOutlined style={{ fontSize: 11 }} />
                  )
                }
              >
                <Panel
                  key="room-summaries"
                  header={
                    <Text
                      strong
                      style={{
                        fontSize: 14,
                        fontFamily: fonts.heading,
                        color: colors.textPrimary,
                      }}
                    >
                      Room Summaries
                    </Text>
                  }
                  style={{
                    border: `1px solid ${colors.border}`,
                    borderRadius: borderRadius.md,
                    overflow: 'hidden',
                    background: colors.bgWhite,
                  }}
                >
                  <Collapse
                    bordered={false}
                    style={{ background: 'transparent' }}
                    size="small"
                  >
                    {roomSummaryPanels}
                  </Collapse>
                </Panel>
              </Collapse>
            </div>
          )}
        </div>

        {/* Right column: Stats + Totals + Customer Info */}
        <div style={{ width: isMobile ? '100%' : 320, flexShrink: isMobile ? 1 : 0, order: isMobile ? 1 : 2 }}>
          {/* ── Stats Card ──────────────────────────────────────────────────── */}
          <Card
            style={{
              border: `1px solid ${colors.border}`,
              borderRadius: borderRadius.lg,
              marginBottom: 16,
            }}
            styles={{ body: { padding: '16px 20px' } }}
          >
            <Row gutter={16} justify="space-around">
              <Col style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 4 }}>Rooms</div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: fonts.heading, color: colors.textPrimary }}>{result.total_rooms}</div>
              </Col>
              <Col style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 4 }}>Hours</div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: fonts.heading, color: colors.textPrimary }}>{result.total_hours}</div>
              </Col>
              <Col style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 4 }}>Crew</div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: fonts.heading, color: colors.textPrimary }}>{result.crew_size}</div>
              </Col>
            </Row>
          </Card>

          {/* ── Scheduling Notes ─────────────────────────────────────────────── */}
          {result.notes && result.notes.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              {result.notes.map((note, i) => (
                <Alert
                  key={i}
                  message={note}
                  type="warning"
                  showIcon
                  style={{ marginBottom: i < result.notes!.length - 1 ? 8 : 0 }}
                />
              ))}
            </div>
          )}

          {/* ── Totals Panel ────────────────────────────────────────────────── */}
          <Card
            style={{
              border: `1px solid ${colors.border}`,
              borderRadius: borderRadius.lg,
              marginBottom: 16,
            }}
            styles={{ body: { padding: '20px 20px' } }}
          >
            <Title
              level={5}
              style={{
                margin: '0 0 16px',
                fontFamily: fonts.heading,
                fontSize: 15,
              }}
            >
              Totals
            </Title>

            {/* Subtotal */}
            <Row justify="space-between" style={{ marginBottom: 10 }}>
              <Col>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Subtotal</Text>
              </Col>
              <Col>
                <Text strong style={{ fontSize: 13 }}>
                  {fmt(result.subtotal)}
                </Text>
              </Col>
            </Row>

            <Divider style={{ margin: '8px 0' }} />

            {/* O&P */}
            <Row justify="space-between" align="middle" style={{ marginBottom: 6 }}>
              <Col>
                <Space>
                  <Switch
                    size="small"
                    checked={result.include_op}
                    onChange={handleOpToggle}
                  />
                  <Text style={{ fontSize: 13 }}>O&P</Text>
                </Space>
              </Col>
              <Col>
                <Space size={8}>
                  <Text style={{ fontSize: 13, minWidth: 60, textAlign: 'right' }}>
                    {result.include_op ? fmt(result.op_amount) : '—'}
                  </Text>
                  <InputNumber
                    size="small"
                    min={0}
                    max={100}
                    value={result.op_rate}
                    onChange={handleOpRateChange}
                    disabled={!result.include_op}
                    suffix="%"
                    style={{ width: 72 }}
                  />
                </Space>
              </Col>
            </Row>

            {/* Conditional Supplements */}
            {(result.supplements || []).filter(s => s.triggered).length > 0 && (
              <>
                <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4, marginBottom: 6 }}>
                  Conditional Supplements
                </div>
                {(result.supplements || []).filter(s => s.triggered).map(s => (
                  <Row key={s.key} justify="space-between" align="top" style={{ marginBottom: 6 }}>
                    <Col flex="1" style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Checkbox
                          checked={s.enabled}
                          onChange={(e) => {
                            setResult(prev => {
                              if (!prev) return prev;
                              const newSupplements = (prev.supplements || []).map(p =>
                                p.key === s.key ? { ...p, enabled: e.target.checked } : p
                              );
                              const newSupplementsTotal = newSupplements.filter(x => x.enabled).reduce((sum, x) => sum + (x.amount || 0), 0);
                              return {
                                ...prev,
                                supplements: newSupplements,
                                supplements_total: newSupplementsTotal,
                                grand_total: prev.subtotal + prev.op_amount + prev.contingency_amount + newSupplementsTotal,
                              };
                            });
                          }}
                        />
                        <Tooltip title={s.description}>
                          <Text style={{ fontSize: 13 }}>{s.name}</Text>
                        </Tooltip>
                      </div>
                      {s.enabled && (
                        <Input
                          size="small"
                          placeholder="Reason (shown on estimate)"
                          value={s.reason || ''}
                          onChange={(e) => {
                            setResult(prev => {
                              if (!prev) return prev;
                              return {
                                ...prev,
                                supplements: (prev.supplements || []).map(p =>
                                  p.key === s.key ? { ...p, reason: e.target.value } : p
                                ),
                              };
                            });
                          }}
                          style={{
                            marginTop: 4,
                            marginLeft: 28,
                            fontSize: 12,
                            color: colors.textSecondary,
                          }}
                        />
                      )}
                    </Col>
                    <Col flex="none">
                      <InputNumber
                        size="small"
                        value={s.amount || 0}
                        min={0}
                        step={5}
                        prefix="$"
                        style={{ width: 100, fontSize: 13, opacity: s.enabled ? 1 : 0.4 }}
                        onChange={(val) => {
                          setResult(prev => {
                            if (!prev) return prev;
                            const newSupplements = (prev.supplements || []).map(p =>
                              p.key === s.key ? { ...p, amount: val || 0 } : p
                            );
                            const newSupplementsTotal = newSupplements.filter(x => x.enabled).reduce((sum, x) => sum + (x.amount || 0), 0);
                            return {
                              ...prev,
                              supplements: newSupplements,
                              supplements_total: newSupplementsTotal,
                              grand_total: prev.subtotal + prev.op_amount + prev.contingency_amount + newSupplementsTotal,
                            };
                          });
                        }}
                      />
                    </Col>
                  </Row>
                ))}
              </>
            )}

            {/* Tax */}
            <Row justify="space-between" align="middle" style={{ marginBottom: 6 }}>
              <Col>
                <Text style={{ fontSize: 13 }}>Tax Rate</Text>
              </Col>
              <Col>
                <Space size={8}>
                  <Text style={{ fontSize: 13, minWidth: 60, textAlign: 'right' }}>
                    {taxRate > 0 ? fmt(result.subtotal * (taxRate / 100)) : '—'}
                  </Text>
                  <InputNumber
                    size="small"
                    min={0}
                    max={30}
                    value={taxRate}
                    onChange={(v) => setTaxRate(v ?? 0)}
                    suffix="%"
                    style={{ width: 72 }}
                  />
                </Space>
              </Col>
            </Row>

            <Divider style={{ margin: '12px 0' }} />

            {/* Grand Total */}
            <Row justify="space-between" align="middle">
              <Col>
                <Text
                  strong
                  style={{
                    fontSize: 15,
                    fontFamily: fonts.heading,
                    color: colors.textPrimary,
                  }}
                >
                  Grand Total
                </Text>
              </Col>
              <Col>
                <Text
                  strong
                  style={{
                    fontSize: 22,
                    fontFamily: fonts.heading,
                    color: colors.info,
                  }}
                >
                  {fmt(computedGrandTotal)}
                </Text>
              </Col>
            </Row>
          </Card>

          {/* ── Customer Info ───────────────────────────────────────────────── */}
          <Card
            className="estimate-editor-panel"
            style={{
              border: `1px solid ${colors.border}`,
              borderRadius: borderRadius.lg,
            }}
            styles={{ body: { padding: '16px 20px' } }}
          >
            <Collapse
              bordered={false}
              style={{ background: 'transparent', margin: '-8px -8px' }}
              expandIcon={({ isActive }) =>
                isActive ? (
                  <DownOutlined style={{ fontSize: 11 }} />
                ) : (
                  <RightOutlined style={{ fontSize: 11 }} />
                )
              }
            >
              <Panel
                key="client"
                header={
                  <Space>
                    <UserOutlined style={{ color: colors.textSecondary }} />
                    <Text
                      strong
                      style={{ fontSize: 13, fontFamily: fonts.heading }}
                    >
                      Customer Info
                    </Text>
                  </Space>
                }
                style={{ border: 'none' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Input
                    size="small"
                    placeholder="Client Name"
                    value={clientInfo.name}
                    onChange={(e) =>
                      setClientInfo((ci) => ({ ...ci, name: e.target.value }))
                    }
                    prefix={<UserOutlined style={{ color: colors.textMuted, fontSize: 12 }} />}
                  />
                  <Input
                    size="small"
                    placeholder="Phone"
                    value={clientInfo.phone}
                    onChange={(e) =>
                      setClientInfo((ci) => ({ ...ci, phone: e.target.value }))
                    }
                  />
                  <Input
                    size="small"
                    placeholder="Email"
                    value={clientInfo.email}
                    onChange={(e) =>
                      setClientInfo((ci) => ({ ...ci, email: e.target.value }))
                    }
                  />
                  <Input
                    size="small"
                    placeholder="Property Address"
                    value={clientInfo.property_address}
                    onChange={(e) =>
                      setClientInfo((ci) => ({
                        ...ci,
                        property_address: e.target.value,
                      }))
                    }
                  />
                </div>
              </Panel>

              {/* Company Override */}
              <Panel
                key="company"
                header={
                  <Row justify="space-between" align="middle" style={{ width: '100%' }}>
                    <Col>
                      <Space>
                        <BankOutlined style={{ color: colors.textSecondary }} />
                        <Text strong style={{ fontSize: 13, fontFamily: fonts.heading }}>
                          Company Override
                        </Text>
                      </Space>
                    </Col>
                    <Col>
                      <Switch
                        size="small"
                        checked={showCompanyOverride}
                        onChange={(v) => {
                          setShowCompanyOverride(v);
                          if (!v) {
                            setCompanyOverride({});
                          }
                        }}
                        onClick={(_, e) => e.stopPropagation()}
                      />
                    </Col>
                  </Row>
                }
                style={{ border: 'none' }}
              >
                {showCompanyOverride && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Input
                      size="small"
                      placeholder="Company Name"
                      value={companyOverride.name ?? ''}
                      onChange={(e) =>
                        setCompanyOverride((co) => ({ ...co, name: e.target.value }))
                      }
                    />
                    <Input
                      size="small"
                      placeholder="Address"
                      value={companyOverride.address ?? ''}
                      onChange={(e) =>
                        setCompanyOverride((co) => ({ ...co, address: e.target.value }))
                      }
                    />
                    <Input
                      size="small"
                      placeholder="Phone"
                      value={companyOverride.phone ?? ''}
                      onChange={(e) =>
                        setCompanyOverride((co) => ({ ...co, phone: e.target.value }))
                      }
                    />
                    <Input
                      size="small"
                      placeholder="Email"
                      value={companyOverride.email ?? ''}
                      onChange={(e) =>
                        setCompanyOverride((co) => ({ ...co, email: e.target.value }))
                      }
                    />
                    <Input
                      size="small"
                      placeholder="License #"
                      value={companyOverride.license ?? ''}
                      onChange={(e) =>
                        setCompanyOverride((co) => ({ ...co, license: e.target.value }))
                      }
                    />
                  </div>
                )}
                {!showCompanyOverride && (
                  <Text style={{ fontSize: 12, color: colors.textMuted }}>
                    Toggle to override company info on the export
                  </Text>
                )}
              </Panel>
            </Collapse>
          </Card>
        </div>
      </div>

      {/* ── Sticky Footer: action buttons ──────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
          padding: isMobile ? '10px 12px' : '12px 20px',
          borderTop: `1px solid ${colors.border}`,
          background: colors.bgWhite,
          flexShrink: 0,
        }}
      >
        <Button
          icon={<FilePdfOutlined />}
          loading={exporting === 'pdf'}
          onClick={handleExportPdf}
          disabled={!activeSessionId}
          size={isMobile ? 'small' : 'middle'}
          style={{ borderColor: colors.border }}
        >
          PDF
        </Button>
        <Button
          icon={<FileExcelOutlined />}
          loading={exporting === 'excel'}
          onClick={handleExportExcel}
          disabled={!activeSessionId}
          size={isMobile ? 'small' : 'middle'}
          style={{ borderColor: colors.border }}
        >
          Excel
        </Button>
        <Button
          icon={<FileTextOutlined />}
          onClick={() => setShowReportModal(true)}
          disabled={!activeSessionId}
          size={isMobile ? 'small' : 'middle'}
          style={{ borderColor: colors.border }}
        >
          Report
        </Button>
        <Button
          icon={<SaveOutlined />}
          size={isMobile ? 'small' : 'middle'}
          onClick={() => message.success('Estimate saved')}
        >
          Save
        </Button>
        {onCreateEstimate && (
          <Button
            type="primary"
            onClick={onCreateEstimate}
            size={isMobile ? 'small' : 'middle'}
            style={{ background: colors.primary, borderColor: colors.primary }}
          >
            {isMobile ? 'Create Estimate' : 'Create ScopeIt Estimate'}
          </Button>
        )}
      </div>

      {/* Report Export Modal */}
      <ReportExportModal
        open={showReportModal}
        onClose={() => setShowReportModal(false)}
        result={result}
        mode={mode}
        clientInfo={clientInfo}
        companyOverride={companyOverride}
        activeSessionId={activeSessionId}
        photoRooms={photoRooms}
        rooms={rooms}
        onRequestSign={async (blob, filename) => {
          // Upload report PDF to PDF editor, then user can create sign request
          try {
            const { pdfEditorApi } = await import(
              '../pdf-editor/pdfEditorApi'
            );
            const file = new File([blob], filename, { type: 'application/pdf' });
            const doc = await pdfEditorApi.uploadDocument(file, filename);
            message.success(
              'Report uploaded to PDF Editor. Open PDF Editor to send for signature.',
            );
            setShowReportModal(false);
            // Log doc id so user can find it
            console.info('Report document uploaded:', doc.id);
          } catch (err: any) {
            message.error(
              err?.response?.data?.detail || 'Failed to upload report for signing',
            );
          }
        }}
      />
    </Modal>
  );
};

export default EstimateEditorModal;
