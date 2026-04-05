/**
 * ScopeIt - Send for Signature Modal
 *
 * Two-step wizard:
 *   Step 1: Click on PDF page images to place signature fields (signature, date, name, initials).
 *   Step 2: Configure recipient details and send the e-signature request.
 *
 * Usage:
 *   <SendForSignModal
 *     open={open}
 *     onClose={() => setOpen(false)}
 *     documentId={doc.id}
 *     documentName={doc.name}
 *     pageCount={doc.pageCount}
 *   />
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Modal,
  Button,
  Form,
  Input,
  Select,
  Space,
  Typography,
  Spin,
  App,
  Divider,
  Badge,
} from 'antd';
import {
  CloseOutlined,
  SendOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { pdfEditorApi } from './pdfEditorApi';
import type { SignFieldDef } from './types';
import api from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import type { Customer } from '@/types/entities';
import { colors, fonts, fontSizes, borderRadius, shadows } from '@/styles/theme';

const { Text, Title } = Typography;
const { TextArea } = Input;

// ── Types ─────────────────────────────────────────────────────────────────────

type FieldType = 'signature' | 'date' | 'name' | 'initials';

interface PlacedField extends SignFieldDef {
  id: string; // local unique id
}

export interface SendForSignModalProps {
  open: boolean;
  onClose: () => void;
  documentId: string;
  documentName: string;
  pageCount: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FIELD_DEFAULTS: Record<FieldType, { width: number; height: number; label: string }> = {
  signature: { width: 180, height: 52, label: 'Sign here' },
  date: { width: 120, height: 36, label: 'Date' },
  name: { width: 150, height: 36, label: 'Full name' },
  initials: { width: 72, height: 36, label: 'Initials' },
};

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  signature: 'Signature',
  date: 'Date',
  name: 'Name',
  initials: 'Initials',
};

const EXPIRY_OPTIONS = [
  { label: '7 days', value: 7 },
  { label: '14 days', value: 14 },
  { label: '30 days', value: 30 },
  { label: '60 days', value: 60 },
];

let fieldIdCounter = 1;
function nextFieldId() {
  return `sf-${fieldIdCounter++}`;
}

// ── Field Type Button ─────────────────────────────────────────────────────────

interface FieldTypeButtonProps {
  type: FieldType;
  active: boolean;
  onClick: () => void;
}

// Icons as inline SVG to stay grayscale per project rule
const FIELD_ICONS: Record<FieldType, React.ReactNode> = {
  signature: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17c3.333-5.333 5.333-8 6-8 1 0 1 1 2 1s1-1 2-1 1.5 3 2.5 3 2-3 3-3" />
      <line x1="3" y1="21" x2="21" y2="21" />
    </svg>
  ),
  date: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  name: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  initials: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="14" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  ),
};

function FieldTypeButton({ type, active, onClick }: FieldTypeButtonProps) {
  return (
    <button
      onClick={onClick}
      title={`Place ${FIELD_TYPE_LABELS[type]} field`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        border: active
          ? `2px solid ${colors.primary}`
          : `1.5px solid ${colors.border}`,
        borderRadius: borderRadius.base,
        background: active ? colors.primary : colors.bgWhite,
        color: active ? colors.textWhite : colors.textPrimary,
        fontSize: fontSizes.xs,
        fontFamily: fonts.body,
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ opacity: 0.85 }}>{FIELD_ICONS[type]}</span>
      {FIELD_TYPE_LABELS[type]}
    </button>
  );
}

// ── Page Image with Field Overlays ────────────────────────────────────────────

interface PageImageProps {
  pdfDoc: PDFDocumentProxy | null;
  pageNum: number;
  fields: PlacedField[];
  activeType: FieldType;
  onPlaceField: (page: number, x: number, y: number, relW: number, relH: number) => void;
  onRemoveField: (id: string) => void;
  onMoveField: (id: string, x: number, y: number) => void;
}

function PageImage({
  pdfDoc,
  pageNum,
  fields,
  activeType,
  onPlaceField,
  onRemoveField,
  onMoveField,
}: PageImageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number } | null>(null);

  // Render PDF page to canvas using pdfjs (client-side, no poppler dependency)
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;

    const render = async () => {
      setLoading(true);
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (cancelled) { page.cleanup(); return; }

        // Scale so width fills the container (~650px modal body)
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = 1200 / baseViewport.width;
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas || cancelled) { page.cleanup(); return; }

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) { page.cleanup(); return; }

        await page.render({ canvas: null, canvasContext: ctx, viewport }).promise;

        if (!cancelled) {
          setLoading(false);
        }
        page.cleanup();
      } catch {
        if (!cancelled) setLoading(false);
      }
    };

    render();
    return () => { cancelled = true; };
  }, [pdfDoc, pageNum]);

  // Measure canvas size AFTER it becomes visible (loading=false → display: block)
  useEffect(() => {
    if (loading || !canvasRef.current) return;
    // Wait one frame for the browser to paint the now-visible canvas
    const raf = requestAnimationFrame(() => {
      if (canvasRef.current) {
        setCanvasSize({ w: canvasRef.current.offsetWidth, h: canvasRef.current.offsetHeight });
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [loading]);

  // Re-measure on window resize
  useEffect(() => {
    if (loading || !canvasRef.current) return;
    const measure = () => {
      if (canvasRef.current) {
        setCanvasSize({ w: canvasRef.current.offsetWidth, h: canvasRef.current.offsetHeight });
      }
    };
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [loading]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!canvasRef.current || !canvasSize) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const relX = clickX / canvasSize.w;
      const relY = clickY / canvasSize.h;
      const relW = FIELD_DEFAULTS[activeType].width / canvasSize.w;
      const relH = FIELD_DEFAULTS[activeType].height / canvasSize.h;
      onPlaceField(pageNum, relX, relY, relW, relH);
    },
    [activeType, canvasSize, onPlaceField, pageNum],
  );

  const pageFields = fields.filter((f) => f.page === pageNum);

  return (
    <div style={{ marginBottom: 24 }}>
      <Text
        style={{
          display: 'block',
          fontSize: fontSizes.xs,
          color: colors.textSecondary,
          marginBottom: 6,
          fontFamily: fonts.body,
        }}
      >
        Page {pageNum}
      </Text>
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          display: 'inline-block',
          width: '100%',
          border: `1px solid ${colors.border}`,
          borderRadius: borderRadius.md,
          overflow: 'hidden',
          cursor: 'crosshair',
          background: colors.bgLight,
        }}
        onClick={handleClick}
      >
        {loading && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 280,
            }}
          >
            <Spin indicator={<LoadingOutlined style={{ fontSize: 24, color: colors.textSecondary }} />} />
          </div>
        )}
        <canvas
          ref={canvasRef}
          style={{
            display: loading ? 'none' : 'block',
            width: '100%',
            height: 'auto',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
        {/* Field overlays */}
        {canvasSize &&
          pageFields.map((field) => (
            <SignFieldOverlay
              key={field.id}
              field={field}
              imgWidth={canvasSize.w}
              imgHeight={canvasSize.h}
              onRemove={() => onRemoveField(field.id)}
              onMove={(x, y) => onMoveField(field.id, x, y)}
            />
          ))}
      </div>
    </div>
  );
}

// ── Sign Field Overlay ────────────────────────────────────────────────────────

interface SignFieldOverlayProps {
  field: PlacedField;
  imgWidth: number;
  imgHeight: number;
  onRemove: () => void;
  onMove: (relX: number, relY: number) => void;
}

const FIELD_OVERLAY_BG: Record<FieldType, string> = {
  signature: 'rgba(17,24,39,0.06)',
  date: 'rgba(107,114,128,0.08)',
  name: 'rgba(17,24,39,0.06)',
  initials: 'rgba(107,114,128,0.08)',
};

function SignFieldOverlay({ field, imgWidth, imgHeight, onRemove, onMove }: SignFieldOverlayProps) {
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ dx: 0, dy: 0 });
  const dragStartRef = useRef<{ startMouseX: number; startMouseY: number; startLeft: number; startTop: number } | null>(null);
  const elRef = useRef<HTMLDivElement>(null);

  const left = field.x * imgWidth;
  const top = field.y * imgHeight;
  const width = field.width * imgWidth;
  const height = field.height * imgHeight;

  const handleRemoveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove();
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Ignore if clicking remove button
    if ((e.target as HTMLElement).closest('button')) return;
    e.stopPropagation();
    e.preventDefault();
    setDragging(true);
    setDragOffset({ dx: 0, dy: 0 });
    dragStartRef.current = {
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startLeft: left,
      startTop: top,
    };
  }, [left, top]);

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.startMouseX;
      const dy = e.clientY - dragStartRef.current.startMouseY;
      setDragOffset({ dx, dy });
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!dragStartRef.current) { setDragging(false); return; }
      const dx = e.clientX - dragStartRef.current.startMouseX;
      const dy = e.clientY - dragStartRef.current.startMouseY;
      // Convert pixel offset to relative coords
      const newRelX = Math.max(0, Math.min(1 - field.width, (dragStartRef.current.startLeft + dx) / imgWidth));
      const newRelY = Math.max(0, Math.min(1 - field.height, (dragStartRef.current.startTop + dy) / imgHeight));
      onMove(newRelX, newRelY);
      setDragging(false);
      setDragOffset({ dx: 0, dy: 0 });
      dragStartRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, field.width, field.height, imgWidth, imgHeight, onMove]);

  const displayLeft = dragging ? left + dragOffset.dx : left;
  const displayTop = dragging ? top + dragOffset.dy : top;

  return (
    <div
      ref={elRef}
      onMouseDown={handleMouseDown}
      style={{
        position: 'absolute',
        left: displayLeft,
        top: displayTop,
        width,
        height,
        background: FIELD_OVERLAY_BG[field.type],
        border: `1.5px dashed ${dragging ? colors.primary : colors.textSecondary}`,
        borderRadius: borderRadius.sm,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'all',
        cursor: dragging ? 'grabbing' : 'grab',
        boxSizing: 'border-box',
        boxShadow: dragging ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
        transition: dragging ? 'none' : 'box-shadow 0.15s ease',
        userSelect: 'none',
        zIndex: dragging ? 10 : 1,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Type label badge */}
      <div
        style={{
          position: 'absolute',
          top: -1,
          left: 0,
          background: colors.primary,
          color: colors.textWhite,
          fontSize: 10,
          fontFamily: fonts.body,
          fontWeight: 600,
          padding: '1px 5px',
          borderRadius: `${borderRadius.sm} 0 ${borderRadius.sm} 0`,
          lineHeight: '16px',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >
        {FIELD_TYPE_LABELS[field.type]}
      </div>
      {/* Close button */}
      <button
        onClick={handleRemoveClick}
        title="Remove field"
        style={{
          position: 'absolute',
          top: -1,
          right: -1,
          width: 18,
          height: 18,
          background: colors.textSecondary,
          color: colors.textWhite,
          border: 'none',
          borderRadius: `0 ${borderRadius.sm} 0 ${borderRadius.sm}`,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          lineHeight: 1,
        }}
      >
        <CloseOutlined style={{ fontSize: 9 }} />
      </button>
      {/* Field hint text */}
      <Text
        style={{
          fontSize: 11,
          color: colors.textSecondary,
          fontFamily: fonts.body,
          fontStyle: 'italic',
          pointerEvents: 'none',
          textAlign: 'center',
          padding: '0 6px',
          lineHeight: 1.2,
        }}
      >
        {FIELD_DEFAULTS[field.type].label}
      </Text>
    </div>
  );
}

// ── Field Summary ─────────────────────────────────────────────────────────────

function fieldSummary(fields: PlacedField[]): string {
  const counts: Partial<Record<FieldType, number>> = {};
  for (const f of fields) {
    counts[f.type] = (counts[f.type] ?? 0) + 1;
  }
  const parts: string[] = [];
  const order: FieldType[] = ['signature', 'date', 'name', 'initials'];
  for (const t of order) {
    const c = counts[t];
    if (c) parts.push(`${c} ${FIELD_TYPE_LABELS[t].toLowerCase()}${c > 1 ? 's' : ''}`);
  }
  return parts.join(', ');
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export default function SendForSignModal({
  open,
  onClose,
  documentId,
  documentName,
  pageCount,
}: SendForSignModalProps) {
  const { message } = App.useApp();
  const user = useAuthStore((s) => s.user);
  const [form] = Form.useForm();

  // Wizard state
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 state
  const [activeType, setActiveType] = useState<FieldType>('signature');
  const [fields, setFields] = useState<PlacedField[]>([]);

  // Step 2 state
  const [sending, setSending] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [successSignUrl, setSuccessSignUrl] = useState<string | null>(null);

  // PDF document loaded client-side for page rendering (no poppler dependency)
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);

  // Load the PDF document when modal opens
  useEffect(() => {
    if (!open || !documentId) {
      // Destroy previous doc when modal closes
      if (pdfDoc) { pdfDoc.destroy(); setPdfDoc(null); }
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const token = useAuthStore.getState().accessToken;
        const apiBase = import.meta.env.VITE_API_URL || '/api';
        const url = `${apiBase}/tools/pdf-editor/documents/${documentId}/download`;
        const response = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) return;
        const data = await response.arrayBuffer();
        if (cancelled) return;
        const pdf = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) { pdf.destroy(); return; }
        setPdfDoc(pdf);
      } catch {
        // silent – page images will show loading spinner
      }
    };
    load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, documentId]);

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setStep(1);
      setActiveType('signature');
      setFields([]);
      setSending(false);
      form.resetFields();
      // Pre-fill sender email and default subject
      form.setFieldsValue({
        sender_email: user?.email ?? '',
        email_subject: `Signature requested: ${documentName}`,
        expires_in_days: 14,
      });
    }
  }, [open, documentName, user, form]);

  // Customers query for selector
  const { data: customersData } = useQuery({
    queryKey: ['customers-for-sign', customerSearch],
    queryFn: async () => {
      const { data } = await api.get('/customers', {
        params: { skip: 0, limit: 100, ...(customerSearch ? { search: customerSearch } : {}) },
      });
      return data;
    },
    enabled: open && step === 2,
  });

  const customers: Customer[] = customersData?.items ?? customersData ?? [];

  // Place field handler
  const handlePlaceField = useCallback(
    (page: number, x: number, y: number, relW: number, relH: number) => {
      const def = FIELD_DEFAULTS[activeType];
      setFields((prev) => [
        ...prev,
        {
          id: nextFieldId(),
          page,
          x,
          y,
          width: relW,
          height: relH,
          type: activeType,
          label: def.label,
        },
      ]);
    },
    [activeType],
  );

  const handleRemoveField = useCallback((id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleMoveField = useCallback((id: string, x: number, y: number) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, x, y } : f)));
  }, []);

  // Customer select -> auto-fill name + email
  const handleCustomerChange = (customerId: string) => {
    const customer = customers.find((c) => c.id === customerId);
    if (customer) {
      form.setFieldsValue({
        recipient_name: customer.contactName || customer.name,
        recipient_email: customer.email ?? '',
      });
    }
  };

  // Send handler
  const handleSend = async () => {
    try {
      await form.validateFields();
    } catch {
      return;
    }

    const values = form.getFieldsValue();
    setSending(true);
    try {
      const signReq = await pdfEditorApi.createSignRequest({
        documentId,
        recipientEmail: values.recipient_email,
        recipientName: values.recipient_name,
        customerId: values.customer_id ?? undefined,
        signFields: fields.map((f) => ({
          page: f.page,
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
          type: f.type,
          label: f.label,
        })),
        emailSubject: values.email_subject || undefined,
        emailMessage: values.email_message || undefined,
        expiresInDays: values.expires_in_days,
      });

      const sendResult = await pdfEditorApi.sendSignRequest(signReq.id);

      // If sign_url is returned (dev mode / email not configured), show it
      const signUrl = sendResult?.sign_url;
      if (signUrl) {
        setSuccessSignUrl(signUrl);
      } else {
        message.success(`Signature request sent to ${values.recipient_email}`);
        onClose();
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      const errorMsg = Array.isArray(detail)
        ? detail.map((d: any) => `${d.loc?.join('.')}: ${d.msg}`).join('; ')
        : typeof detail === 'string' ? detail : 'Failed to send signature request. Please try again.';
      console.error('[SendForSign] Error:', detail || err);
      message.error(errorMsg);
    } finally {
      setSending(false);
    }
  };

  const canProceed = fields.length >= 1;

  // ── Step 1 footer
  const step1Footer = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 0 0',
      }}
    >
      <Text style={{ fontSize: fontSizes.xs, color: colors.textSecondary, fontFamily: fonts.body }}>
        {fields.length === 0
          ? 'Click on the page to place a field'
          : `${fields.length} field${fields.length !== 1 ? 's' : ''} placed`}
      </Text>
      <Space>
        <Button onClick={onClose} disabled={sending}>
          Cancel
        </Button>
        <Button
          type="primary"
          icon={<ArrowRightOutlined />}
          iconPosition="end"
          onClick={() => setStep(2)}
          disabled={!canProceed}
          style={{ background: colors.primary, borderColor: colors.primary }}
        >
          Next
        </Button>
      </Space>
    </div>
  );

  // ── Step 2 footer
  const step2Footer = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 0 0',
      }}
    >
      <Button icon={<ArrowLeftOutlined />} onClick={() => setStep(1)} disabled={sending}>
        Back
      </Button>
      <Button
        type="primary"
        icon={<SendOutlined />}
        onClick={handleSend}
        loading={sending}
        style={{ background: colors.primary, borderColor: colors.primary }}
      >
        Send
      </Button>
    </div>
  );

  // ── Step 1 content
  const step1Content = (
    <>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          background: colors.bgLight,
          border: `1px solid ${colors.border}`,
          borderRadius: borderRadius.md,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <Text
          style={{
            fontSize: fontSizes.xs,
            color: colors.textSecondary,
            fontFamily: fonts.body,
            marginRight: 4,
            whiteSpace: 'nowrap',
          }}
        >
          Place:
        </Text>
        {(['signature', 'date', 'name', 'initials'] as FieldType[]).map((t) => (
          <FieldTypeButton
            key={t}
            type={t}
            active={activeType === t}
            onClick={() => setActiveType(t)}
          />
        ))}
        {fields.length > 0 && (
          <button
            onClick={() => setFields([])}
            title="Clear all fields"
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '5px 10px',
              border: `1px solid ${colors.border}`,
              borderRadius: borderRadius.base,
              background: colors.bgWhite,
              color: colors.textSecondary,
              fontSize: fontSizes.xs,
              fontFamily: fonts.body,
              cursor: 'pointer',
            }}
          >
            <CloseOutlined style={{ fontSize: 10 }} />
            Clear all
          </button>
        )}
      </div>

      {/* Page images */}
      <div
        style={{
          maxHeight: 480,
          overflowY: 'auto',
          paddingRight: 4,
        }}
      >
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNum) => (
          <PageImage
            key={pageNum}
            pdfDoc={pdfDoc}
            pageNum={pageNum}
            fields={fields}
            activeType={activeType}
            onPlaceField={handlePlaceField}
            onRemoveField={handleRemoveField}
            onMoveField={handleMoveField}
          />
        ))}
      </div>

      {step1Footer}
    </>
  );

  // ── Step 2 content
  const step2Content = (
    <Form
      form={form}
      layout="vertical"
      style={{ fontFamily: fonts.body }}
      requiredMark={false}
    >
      {/* Recipient */}
      <div
        style={{
          fontSize: fontSizes.xs,
          fontWeight: 600,
          color: colors.textSecondary,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: 10,
          fontFamily: fonts.body,
        }}
      >
        Recipient
      </div>

      <Form.Item
        name="customer_id"
        label={
          <span style={{ fontFamily: fonts.body, fontSize: fontSizes.sm, color: colors.textPrimary }}>
            Customer <span style={{ color: colors.textMuted, fontWeight: 400 }}>(optional)</span>
          </span>
        }
        style={{ marginBottom: 12 }}
      >
        <Select
          showSearch
          allowClear
          placeholder="Select a customer to auto-fill..."
          filterOption={false}
          onSearch={setCustomerSearch}
          onChange={handleCustomerChange}
          onClear={() => setCustomerSearch('')}
          notFoundContent={
            <Text style={{ fontSize: fontSizes.xs, color: colors.textMuted }}>
              No customers found
            </Text>
          }
          style={{ width: '100%' }}
        >
          {customers.map((c) => (
            <Select.Option key={c.id} value={c.id}>
              <span style={{ fontFamily: fonts.body, fontSize: fontSizes.sm }}>
                {c.name}
                {c.email && (
                  <span style={{ color: colors.textSecondary, marginLeft: 6 }}>
                    — {c.email}
                  </span>
                )}
              </span>
            </Select.Option>
          ))}
        </Select>
      </Form.Item>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Form.Item
          name="recipient_name"
          label={
            <span style={{ fontFamily: fonts.body, fontSize: fontSizes.sm, color: colors.textPrimary }}>
              Recipient Name
            </span>
          }
          rules={[{ required: true, message: 'Recipient name is required' }]}
          style={{ marginBottom: 12 }}
        >
          <Input placeholder="John Smith" style={{ fontFamily: fonts.body }} />
        </Form.Item>

        <Form.Item
          name="recipient_email"
          label={
            <span style={{ fontFamily: fonts.body, fontSize: fontSizes.sm, color: colors.textPrimary }}>
              Recipient Email
            </span>
          }
          rules={[
            { required: true, message: 'Recipient email is required' },
            { type: 'email', message: 'Enter a valid email address' },
          ]}
          style={{ marginBottom: 12 }}
        >
          <Input placeholder="recipient@example.com" style={{ fontFamily: fonts.body }} />
        </Form.Item>
      </div>

      <Divider style={{ margin: '4px 0 16px', borderColor: colors.border }} />

      {/* Sender & email */}
      <div
        style={{
          fontSize: fontSizes.xs,
          fontWeight: 600,
          color: colors.textSecondary,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: 10,
          fontFamily: fonts.body,
        }}
      >
        Email Details
      </div>

      <Form.Item
        name="sender_email"
        label={
          <span style={{ fontFamily: fonts.body, fontSize: fontSizes.sm, color: colors.textPrimary }}>
            Sender Email
          </span>
        }
        rules={[
          { required: true, message: 'Sender email is required' },
          { type: 'email', message: 'Enter a valid email address' },
        ]}
        style={{ marginBottom: 12 }}
      >
        <Input style={{ fontFamily: fonts.body }} />
      </Form.Item>

      <Form.Item
        name="email_subject"
        label={
          <span style={{ fontFamily: fonts.body, fontSize: fontSizes.sm, color: colors.textPrimary }}>
            Subject
          </span>
        }
        style={{ marginBottom: 12 }}
      >
        <Input style={{ fontFamily: fonts.body }} />
      </Form.Item>

      <Form.Item
        name="email_message"
        label={
          <span style={{ fontFamily: fonts.body, fontSize: fontSizes.sm, color: colors.textPrimary }}>
            Message <span style={{ color: colors.textMuted, fontWeight: 400 }}>(optional)</span>
          </span>
        }
        style={{ marginBottom: 12 }}
      >
        <TextArea
          rows={3}
          placeholder="Add a personal message to the recipient..."
          style={{ fontFamily: fonts.body, resize: 'none' }}
        />
      </Form.Item>

      <Form.Item
        name="expires_in_days"
        label={
          <span style={{ fontFamily: fonts.body, fontSize: fontSizes.sm, color: colors.textPrimary }}>
            Expires in
          </span>
        }
        style={{ marginBottom: 12 }}
      >
        <Select style={{ width: 160 }}>
          {EXPIRY_OPTIONS.map((opt) => (
            <Select.Option key={opt.value} value={opt.value}>
              {opt.label}
            </Select.Option>
          ))}
        </Select>
      </Form.Item>

      <Divider style={{ margin: '4px 0 14px', borderColor: colors.border }} />

      {/* Fields summary */}
      <div
        style={{
          background: colors.bgLight,
          border: `1px solid ${colors.border}`,
          borderRadius: borderRadius.md,
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke={colors.textSecondary}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0 }}
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
        </svg>
        <Text
          style={{
            fontSize: fontSizes.xs,
            color: colors.textSecondary,
            fontFamily: fonts.body,
          }}
        >
          {fields.length} field{fields.length !== 1 ? 's' : ''} placed
          {fields.length > 0 && `: ${fieldSummary(fields)}`}
        </Text>
        <button
          onClick={() => setStep(1)}
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: colors.textSecondary,
            fontSize: fontSizes.xs,
            fontFamily: fonts.body,
            textDecoration: 'underline',
            textUnderlineOffset: 2,
          }}
        >
          Edit fields
        </button>
      </div>

      {step2Footer}
    </Form>
  );

  // ── Modal header
  const modalTitle = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div>
        <Title
          level={5}
          style={{
            margin: 0,
            fontFamily: fonts.heading,
            fontSize: fontSizes.md,
            color: colors.textPrimary,
          }}
        >
          Send for Signature
        </Title>
        <Text
          style={{
            fontSize: fontSizes.xs,
            color: colors.textSecondary,
            fontFamily: fonts.body,
          }}
        >
          {documentName}
        </Text>
      </div>
      <Text
        style={{
          fontSize: fontSizes.xs,
          color: colors.textSecondary,
          fontFamily: fonts.body,
          fontWeight: 500,
        }}
      >
        Step {step} of 2
      </Text>
    </div>
  );

  return (
    <>
    <Modal
      open={open}
      onCancel={onClose}
      title={modalTitle}
      footer={null}
      closable={!sending}
      maskClosable={!sending}
      width={step === 1 ? 720 : 520}
      destroyOnHidden={false}
      styles={{
        body: { padding: '16px 24px 8px' },
        header: {
          padding: '16px 24px 12px',
          borderBottom: `1px solid ${colors.border}`,
          marginBottom: 0,
          borderRadius: `${borderRadius.lg} ${borderRadius.lg} 0 0`,
        },
        content: {
          borderRadius: borderRadius.lg,
          fontFamily: fonts.body,
        },
      }}
    >
      {/* Step indicator */}
      <div
        style={{
          display: 'flex',
          gap: 0,
          marginBottom: 16,
        }}
      >
        {([1, 2] as const).map((s) => (
          <div
            key={s}
            style={{
              flex: 1,
              height: 3,
              background: step >= s ? colors.primary : colors.border,
              borderRadius: s === 1 ? '2px 0 0 2px' : '0 2px 2px 0',
              transition: 'background 0.2s ease',
            }}
          />
        ))}
      </div>

      {step === 1 ? step1Content : step2Content}
    </Modal>

    {/* Success modal (dev mode / email not configured) */}
    <Modal
      open={!!successSignUrl}
      onCancel={() => { setSuccessSignUrl(null); onClose(); }}
      footer={null}
      closable={false}
      width={480}
      centered
      styles={{
        body: { padding: '32px 28px 24px' },
        content: {
          borderRadius: borderRadius.lg,
          fontFamily: fonts.body,
        },
      }}
    >
      <div style={{ textAlign: 'center' }}>
        {/* Check icon */}
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: '#f0fdf4',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>

        <Title
          level={4}
          style={{
            margin: '0 0 8px',
            fontFamily: fonts.heading,
            fontSize: fontSizes.xl,
            color: colors.textPrimary,
          }}
        >
          Signature request created
        </Title>

        <Text
          style={{
            display: 'block',
            fontSize: fontSizes.sm,
            color: colors.textSecondary,
            fontFamily: fonts.body,
            marginBottom: 16,
          }}
        >
          Email service is not configured. Use this link to sign:
        </Text>

        <div
          style={{
            background: colors.bgLight,
            border: `1px solid ${colors.border}`,
            borderRadius: borderRadius.md,
            padding: '12px 14px',
            marginBottom: 20,
          }}
        >
          <a
            href={successSignUrl ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              wordBreak: 'break-all',
              fontSize: fontSizes.xs,
              color: colors.textPrimary,
              fontFamily: fonts.body,
              textDecoration: 'underline',
              textUnderlineOffset: 2,
            }}
          >
            {successSignUrl}
          </a>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <Button
            onClick={() => {
              if (successSignUrl) {
                navigator.clipboard.writeText(successSignUrl);
                message.success('Link copied');
              }
            }}
            style={{
              borderRadius: borderRadius.base,
              fontFamily: fonts.body,
              fontWeight: 500,
              fontSize: fontSizes.sm,
            }}
          >
            Copy Link
          </Button>
          <Button
            type="primary"
            onClick={() => { setSuccessSignUrl(null); onClose(); }}
            style={{
              borderRadius: borderRadius.base,
              background: colors.primary,
              borderColor: colors.primary,
              fontFamily: fonts.body,
              fontWeight: 600,
              fontSize: fontSizes.sm,
            }}
          >
            Done
          </Button>
        </div>
      </div>
    </Modal>
    </>
  );
}
