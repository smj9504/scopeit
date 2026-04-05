/**
 * ScopeIt - Public E-Signature Page
 * Route: /sign/:token  (no authentication required)
 *
 * Flow:
 *  1. User fills each field individually (signature, initials, date, name)
 *  2. Signature/Initials → draw/type modal
 *  3. Date/Name → auto-filled on click (date = today, name = recipient name)
 *  4. After all fields filled → review & submit
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useParams } from 'react-router-dom';
import {
  Button,
  Card,
  Input,
  Modal,
  Radio,
  Result,
  Spin,
  Typography,
  message,
} from 'antd';
import {
  CheckCircleFilled,
  EditOutlined,
} from '@ant-design/icons';
import SignaturePad from 'signature_pad';

import { pdfEditorApi } from '@/components/features/tools/pdf-editor/pdfEditorApi';
import type { SignFieldDef, SignViewData } from '@/components/features/tools/pdf-editor/types';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// ---------------------------------------------------------------------------
// Cursive font catalogue
// ---------------------------------------------------------------------------

type CursiveFont = { label: string; family: string };

const CURSIVE_FONTS: CursiveFont[] = [
  { label: 'Dancing Script', family: 'Dancing Script' },
  { label: 'Great Vibes', family: 'Great Vibes' },
  { label: 'Caveat', family: 'Caveat' },
  { label: 'Sacramento', family: 'Sacramento' },
];

const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Great+Vibes&family=Caveat:wght@700&family=Sacramento&display=swap';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PageStatus = 'idle' | 'loading' | 'error' | 'expired' | 'already_signed' | 'success' | 'declined';
type SignMode = 'draw' | 'type';

/** Per-field captured value */
interface FieldValue {
  /** base64 image (no prefix) for signature/initials, or display text for date/name */
  data: string;
  /** For signature/initials: 'draw' | 'type'. For date/name: 'auto' */
  mode: SignMode | 'auto';
  /** Font used if typed */
  font?: string;
  /** Display label shown on the field overlay */
  displayText?: string;
  /** base64 image for rendering (signature/initials have this, date/name don't) */
  imageBase64?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function todayFormatted(): string {
  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit', day: '2-digit', year: 'numeric',
  }).format(new Date());
}

function renderTextToCanvas(text: string, fontFamily: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 500;
  canvas.height = 150;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `60px "${fontFamily}"`;
  ctx.fillStyle = '#111827';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 20, canvas.height / 2);
  return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
}

/** Build a unique key for a field (by index, since fields have no id) */
function fieldKey(idx: number): string {
  return `field_${idx}`;
}

// ---------------------------------------------------------------------------
// Sub-component: single PDF page with overlaid sign fields
// ---------------------------------------------------------------------------

interface PageViewProps {
  token: string;
  pageNum: number;
  totalPages: number;
  signFields: SignFieldDef[];
  fieldValues: Record<string, FieldValue>;
  isSigned: boolean;
  onFieldClick: (field: SignFieldDef, globalIndex: number) => void;
  /** Global start index for fields on this page (for fieldKey) */
  globalIndexOffset: number;
}

const PageView: React.FC<PageViewProps> = ({
  token,
  pageNum,
  signFields,
  fieldValues,
  isSigned,
  onFieldClick,
  globalIndexOffset,
}) => {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgLoading, setImgLoading] = useState(true);
  const [imgError, setImgError] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setImgLoading(true);
    setImgError(false);

    pdfEditorApi
      .getSignPageImage(token, pageNum)
      .then((url) => {
        if (cancelled) { URL.revokeObjectURL(url); return; }
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = url;
        setImgUrl(url);
        setImgLoading(false);
      })
      .catch(() => {
        if (!cancelled) { setImgError(true); setImgLoading(false); }
      });

    return () => { cancelled = true; };
  }, [token, pageNum]);

  useEffect(() => {
    return () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); };
  }, []);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    observer.observe(containerRef.current);
    setContainerWidth(containerRef.current.offsetWidth);
    return () => observer.disconnect();
  }, []);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
  };

  const pageFields = signFields.filter((f) => f.page === pageNum);
  const scaleFactor = naturalSize ? containerWidth / naturalSize.w : 1;
  const scaledHeight = naturalSize ? naturalSize.h * scaleFactor : undefined;

  return (
    <div style={{ marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.12)', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
      <div ref={containerRef} style={{ position: 'relative', width: '100%', height: scaledHeight, minHeight: imgLoading ? 200 : undefined, background: '#f3f4f6' }}>
        {imgLoading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spin />
          </div>
        )}
        {imgError && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Text type="secondary">Failed to load page {pageNum}</Text>
          </div>
        )}
        {imgUrl && (
          <img src={imgUrl} alt={`Page ${pageNum}`} onLoad={handleImageLoad} style={{ display: 'block', width: '100%', height: 'auto' }} />
        )}

        {/* Sign field overlays */}
        {!imgLoading && !imgError && naturalSize &&
          pageFields.map((field) => {
            // Find global index for this field
            const globalIdx = signFields.indexOf(field) >= 0
              ? globalIndexOffset + pageFields.indexOf(field)
              : globalIndexOffset;
            // Recalculate: we need the actual global index from all fields
            const allFieldGlobalIdx = globalIndexOffset + pageFields.indexOf(field);
            const key = fieldKey(allFieldGlobalIdx);
            const value = fieldValues[key];
            const isFilled = !!value;

            const displayH = naturalSize.h * scaleFactor;
            const left = field.x * containerWidth;
            const top = field.y * displayH;
            const width = field.width * containerWidth;
            const height = field.height * displayH;

            // Determine display content
            let overlayContent: React.ReactNode;
            if (isSigned) {
              overlayContent = (
                <span style={{ fontSize: Math.max(9, Math.min(13, height * 0.3)), color: '#10b981' }}>
                  <CheckCircleFilled style={{ marginRight: 3 }} />Signed
                </span>
              );
            } else if (isFilled && value.imageBase64) {
              // Show signature/initials image
              overlayContent = (
                <img
                  src={`data:image/png;base64,${value.imageBase64}`}
                  alt={field.type}
                  style={{ maxWidth: '90%', maxHeight: '85%', objectFit: 'contain', pointerEvents: 'none' }}
                />
              );
            } else if (isFilled && value.displayText) {
              // Show date/name text
              overlayContent = (
                <span style={{ fontSize: Math.max(10, Math.min(14, height * 0.35)), color: '#111827', fontWeight: 500, pointerEvents: 'none' }}>
                  {value.displayText}
                </span>
              );
            } else {
              // Not filled yet — show prompt
              const label = field.label ?? ({
                signature: 'Click to sign',
                initials: 'Click for initials',
                date: 'Click to add date',
                name: 'Click to add name',
              }[field.type] || 'Click to fill');
              overlayContent = (
                <span style={{ fontSize: Math.max(9, Math.min(13, height * 0.3)), color: '#6b7280' }}>
                  {label}
                </span>
              );
            }

            return (
              <button
                key={allFieldGlobalIdx}
                onClick={() => !isSigned && onFieldClick(field, allFieldGlobalIdx)}
                disabled={isSigned}
                aria-label={field.label ?? `${field.type} field`}
                style={{
                  position: 'absolute',
                  left, top, width, height,
                  background: isSigned
                    ? 'rgba(16,185,129,0.08)'
                    : isFilled
                      ? 'rgba(16,185,129,0.05)'
                      : 'rgba(17,24,39,0.06)',
                  border: isSigned
                    ? '1.5px solid rgba(16,185,129,0.4)'
                    : isFilled
                      ? '1.5px solid rgba(16,185,129,0.3)'
                      : '1.5px dashed rgba(17,24,39,0.3)',
                  borderRadius: 4,
                  cursor: isSigned ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 4,
                  transition: 'background 0.15s, border-color 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (!isSigned)
                    (e.currentTarget as HTMLButtonElement).style.background =
                      isFilled ? 'rgba(16,185,129,0.1)' : 'rgba(17,24,39,0.12)';
                }}
                onMouseLeave={(e) => {
                  if (!isSigned)
                    (e.currentTarget as HTMLButtonElement).style.background =
                      isFilled ? 'rgba(16,185,129,0.05)' : 'rgba(17,24,39,0.06)';
                }}
              >
                {overlayContent}
              </button>
            );
          })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-component: Signature Modal (for signature & initials)
// ---------------------------------------------------------------------------

interface SignatureModalProps {
  open: boolean;
  onClose: () => void;
  onApply: (base64: string, mode: SignMode, font?: string) => void;
  fieldType: 'signature' | 'initials';
}

const SignatureModal: React.FC<SignatureModalProps> = ({ open, onClose, onApply, fieldType }) => {
  const [mode, setMode] = useState<SignMode>('draw');
  const [typedName, setTypedName] = useState('');
  const [selectedFont, setSelectedFont] = useState(CURSIVE_FONTS[0].family);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const savedDataRef = useRef<string | null>(null);

  const title = fieldType === 'initials' ? 'Enter Initials' : 'Sign Document';

  useEffect(() => {
    if (!open || mode !== 'draw') return;
    const timer = setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (!padRef.current) {
        const ratio = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * ratio;
        canvas.height = rect.height * ratio;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.scale(ratio, ratio);
        padRef.current = new SignaturePad(canvas, { penColor: '#111827', backgroundColor: 'rgba(0,0,0,0)' });
      }
      if (savedDataRef.current && padRef.current) {
        padRef.current.fromDataURL(savedDataRef.current);
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [open, mode]);

  useEffect(() => {
    if (mode !== 'draw' && padRef.current && !padRef.current.isEmpty()) {
      savedDataRef.current = padRef.current.toDataURL();
    }
  }, [mode]);

  useEffect(() => {
    if (!open) {
      if (padRef.current) { padRef.current.off(); padRef.current = null; }
      savedDataRef.current = null;
      setTypedName('');
      setMode('draw');
    }
  }, [open]);

  const handleClear = () => padRef.current?.clear();

  const handleApply = () => {
    if (mode === 'draw') {
      if (!padRef.current || padRef.current.isEmpty()) {
        message.warning(fieldType === 'initials' ? 'Please draw your initials.' : 'Please draw your signature.');
        return;
      }
      const dataUrl = padRef.current.toDataURL('image/png');
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
      onApply(base64, 'draw');
    } else {
      const name = typedName.trim();
      if (!name) {
        message.warning(fieldType === 'initials' ? 'Please enter your initials.' : 'Please enter your name.');
        return;
      }
      const base64 = renderTextToCanvas(name, selectedFont);
      onApply(base64, 'type', selectedFont);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={title}
      width={520}
      footer={[
        <Button key="cancel" onClick={onClose}>Cancel</Button>,
        <Button key="apply" type="primary" onClick={handleApply} style={{ background: '#111827', borderColor: '#111827' }}>
          Apply {fieldType === 'initials' ? 'Initials' : 'Signature'}
        </Button>,
      ]}
      destroyOnHidden
    >
      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid #e5e7eb', paddingBottom: 12 }}>
        <button
          onClick={() => setMode('draw')}
          style={{
            padding: '6px 16px', borderRadius: 6,
            border: mode === 'draw' ? '1.5px solid #111827' : '1px solid #e5e7eb',
            background: mode === 'draw' ? '#111827' : '#fff',
            color: mode === 'draw' ? '#fff' : '#374151',
            fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 500, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
          aria-pressed={mode === 'draw'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          Draw
        </button>
        <button
          onClick={() => setMode('type')}
          style={{
            padding: '6px 16px', borderRadius: 6,
            border: mode === 'type' ? '1.5px solid #111827' : '1px solid #e5e7eb',
            background: mode === 'type' ? '#111827' : '#fff',
            color: mode === 'type' ? '#fff' : '#374151',
            fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 500, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
          aria-pressed={mode === 'type'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
          </svg>
          Type
        </button>
      </div>

      {mode === 'draw' && (
        <div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
            {fieldType === 'initials' ? 'Draw your initials in the box below' : 'Draw your signature in the box below'}
          </Text>
          <div style={{ border: '1px solid #d1d5db', borderRadius: 8, overflow: 'hidden', background: '#fafafa', position: 'relative' }}>
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: 160, cursor: 'crosshair', touchAction: 'none' }} />
          </div>
          <div style={{ textAlign: 'right', marginTop: 8 }}>
            <Button size="small" onClick={handleClear} style={{ color: '#6b7280' }}>Clear</Button>
          </div>
        </div>
      )}

      {mode === 'type' && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <Text style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
              {fieldType === 'initials' ? 'Your initials' : 'Full name'}
            </Text>
            <Input
              placeholder={fieldType === 'initials' ? 'JS' : 'John Smith'}
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              size="large"
              style={{ borderRadius: 6 }}
              maxLength={fieldType === 'initials' ? 5 : 60}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <Text style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 500 }}>Font style</Text>
            <Radio.Group value={selectedFont} onChange={(e) => setSelectedFont(e.target.value)} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CURSIVE_FONTS.map((f) => (
                <Radio.Button key={f.family} value={f.family} style={{ fontFamily: `"${f.family}", cursive`, fontSize: 18, height: 40, lineHeight: '38px', borderRadius: 6, paddingLeft: 12, paddingRight: 12 }}>
                  {f.label}
                </Radio.Button>
              ))}
            </Radio.Group>
          </div>
          <div>
            <Text style={{ display: 'block', marginBottom: 6, fontSize: 12 }} type="secondary">Preview</Text>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, background: '#fafafa', height: 80, display: 'flex', alignItems: 'center', paddingLeft: 20, overflow: 'hidden' }}>
              <span style={{ fontFamily: `"${selectedFont}", cursive`, fontSize: 40, color: '#111827', whiteSpace: 'nowrap' }}>
                {typedName || (fieldType === 'initials' ? 'AB' : 'Your signature')}
              </span>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Sub-component: Decline Modal
// ---------------------------------------------------------------------------

interface DeclineModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  loading: boolean;
}

const DeclineModal: React.FC<DeclineModalProps> = ({ open, onClose, onConfirm, loading }) => {
  const [reason, setReason] = useState('');
  return (
    <Modal
      open={open}
      onCancel={() => { setReason(''); onClose(); }}
      title="Decline to Sign"
      footer={[
        <Button key="cancel" onClick={() => { setReason(''); onClose(); }} disabled={loading}>Cancel</Button>,
        <Button key="decline" danger onClick={() => onConfirm(reason.trim())} loading={loading}>Decline</Button>,
      ]}
      width={440}
    >
      <Paragraph style={{ color: '#6b7280', marginBottom: 16 }}>
        Are you sure you want to decline this document? The sender will be notified.
      </Paragraph>
      <Text style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>Reason (optional)</Text>
      <TextArea placeholder="Let the sender know why you're declining..." rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} style={{ borderRadius: 6 }} disabled={loading} />
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Sub-component: Review Modal
// ---------------------------------------------------------------------------

interface ReviewModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
  loading: boolean;
  signFields: SignFieldDef[];
  fieldValues: Record<string, FieldValue>;
}

const ReviewModal: React.FC<ReviewModalProps> = ({ open, onClose, onSubmit, loading, signFields, fieldValues }) => {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Review & Submit"
      width={520}
      footer={[
        <Button key="cancel" onClick={onClose} disabled={loading}>Back</Button>,
        <Button key="submit" type="primary" onClick={onSubmit} loading={loading} style={{ background: '#111827', borderColor: '#111827' }}>
          Submit Signature
        </Button>,
      ]}
    >
      <Paragraph style={{ color: '#6b7280', marginBottom: 20 }}>
        Please review your entries before submitting. Once submitted, this cannot be changed.
      </Paragraph>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {signFields.map((field, idx) => {
          const key = fieldKey(idx);
          const value = fieldValues[key];
          const typeLabel = { signature: 'Signature', initials: 'Initials', date: 'Date', name: 'Name' }[field.type] || field.type;

          return (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
              <div style={{ flex: '0 0 80px' }}>
                <Text strong style={{ fontSize: 13, color: '#374151' }}>{field.label || typeLabel}</Text>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>Page {field.page}</div>
              </div>
              <div style={{ flex: 1, minHeight: 36, display: 'flex', alignItems: 'center' }}>
                {value?.imageBase64 ? (
                  <img
                    src={`data:image/png;base64,${value.imageBase64}`}
                    alt={typeLabel}
                    style={{ maxHeight: 48, maxWidth: '100%', objectFit: 'contain' }}
                  />
                ) : value?.displayText ? (
                  <Text style={{ fontSize: 14, color: '#111827' }}>{value.displayText}</Text>
                ) : (
                  <Text type="secondary" style={{ fontSize: 13 }}>Not filled</Text>
                )}
              </div>
              <CheckCircleFilled style={{ color: value ? '#10b981' : '#d1d5db', fontSize: 18 }} />
            </div>
          );
        })}
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Main SignPage component
// ---------------------------------------------------------------------------

const SignPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();

  const [status, setStatus] = useState<PageStatus>('loading');
  const [viewData, setViewData] = useState<SignViewData | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const [signModalOpen, setSignModalOpen] = useState(false);
  const [signModalFieldType, setSignModalFieldType] = useState<'signature' | 'initials'>('signature');
  const [activeFieldIndex, setActiveFieldIndex] = useState<number | null>(null);
  const [declineModalOpen, setDeclineModalOpen] = useState(false);
  const [declineLoading, setDeclineLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  // Per-field captured values
  const [fieldValues, setFieldValues] = useState<Record<string, FieldValue>>({});

  // Load Google Fonts
  useEffect(() => {
    const existing = document.querySelector('link[data-scopeit-sig-fonts]');
    if (existing) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = GOOGLE_FONTS_URL;
    link.setAttribute('data-scopeit-sig-fonts', '1');
    document.head.appendChild(link);
  }, []);

  // Fetch document info
  useEffect(() => {
    if (!token) { setStatus('error'); setErrorMessage('Invalid signing link.'); return; }

    pdfEditorApi.viewSignDocument(token).then((data) => {
      setViewData(data);
      const s = data.status?.toLowerCase();
      if (s === 'signed' || s === 'completed') setStatus('already_signed');
      else if (s === 'declined') setStatus('declined');
      else if (s === 'expired' || s === 'cancelled' || s === 'canceled') setStatus('expired');
      else setStatus('idle');
    }).catch((err) => {
      const httpStatus = err?.response?.status;
      if (httpStatus === 404) { setErrorMessage('This signing link was not found or has already been used.'); setStatus('expired'); }
      else if (httpStatus === 410) { setErrorMessage('This signing link has expired.'); setStatus('expired'); }
      else { setErrorMessage('Unable to load the document. Please try again or contact the sender.'); setStatus('error'); }
    });
  }, [token]);

  // Compute global field index offsets per page
  const allFields = viewData?.signFields ?? [];
  const totalFields = allFields.length;
  const filledCount = Object.keys(fieldValues).length;
  const allFilled = totalFields > 0 && filledCount >= totalFields;

  // Compute page-based global index offsets
  const pageIndexOffsets: Record<number, number> = {};
  let offset = 0;
  const seenPages = new Set<number>();
  for (let i = 0; i < allFields.length; i++) {
    const pg = allFields[i].page;
    if (!seenPages.has(pg)) {
      pageIndexOffsets[pg] = offset;
      seenPages.add(pg);
    }
    offset++;
  }
  // Actually, simpler: compute per-page offset properly
  // allFields are already indexed 0..n-1, and per page we pass offset = index of first field on that page
  // Let's compute it differently:
  const fieldPageGroups: Record<number, number[]> = {};
  allFields.forEach((f, i) => {
    if (!fieldPageGroups[f.page]) fieldPageGroups[f.page] = [];
    fieldPageGroups[f.page].push(i);
  });

  // Handle field click
  const handleFieldClick = useCallback((field: SignFieldDef, globalIndex: number) => {
    const key = fieldKey(globalIndex);

    if (field.type === 'signature' || field.type === 'initials') {
      setActiveFieldIndex(globalIndex);
      setSignModalFieldType(field.type);
      setSignModalOpen(true);
    } else if (field.type === 'date') {
      const dateStr = todayFormatted();
      setFieldValues((prev) => ({
        ...prev,
        [key]: { data: dateStr, mode: 'auto', displayText: dateStr },
      }));
    } else if (field.type === 'name') {
      const name = viewData?.recipientName ?? '';
      if (name) {
        setFieldValues((prev) => ({
          ...prev,
          [key]: { data: name, mode: 'auto', displayText: name },
        }));
      } else {
        // If no recipient name, prompt
        const entered = window.prompt('Enter your name:');
        if (entered?.trim()) {
          setFieldValues((prev) => ({
            ...prev,
            [key]: { data: entered.trim(), mode: 'auto', displayText: entered.trim() },
          }));
        }
      }
    }
  }, [viewData]);

  // Handle signature/initials applied from modal
  const handleSignatureApply = useCallback((base64: string, mode: SignMode, font?: string) => {
    if (activeFieldIndex === null) return;
    const key = fieldKey(activeFieldIndex);
    setFieldValues((prev) => ({
      ...prev,
      [key]: { data: base64, mode, font, imageBase64: base64 },
    }));
    setSignModalOpen(false);
    setActiveFieldIndex(null);
  }, [activeFieldIndex]);

  // Find the primary signature data for API submission
  const getSignatureForSubmission = useCallback((): { base64: string; mode: SignMode | 'auto'; font?: string } | null => {
    // Find the first 'signature' field value, or fall back to 'initials'
    for (const field of allFields) {
      const idx = allFields.indexOf(field);
      const key = fieldKey(idx);
      const val = fieldValues[key];
      if (val && (field.type === 'signature') && val.imageBase64) {
        return { base64: val.imageBase64, mode: val.mode, font: val.font };
      }
    }
    // Fall back to initials
    for (const field of allFields) {
      const idx = allFields.indexOf(field);
      const key = fieldKey(idx);
      const val = fieldValues[key];
      if (val && (field.type === 'initials') && val.imageBase64) {
        return { base64: val.imageBase64, mode: val.mode, font: val.font };
      }
    }
    return null;
  }, [allFields, fieldValues]);

  // Submit signature
  const handleSubmit = useCallback(async () => {
    if (!token || !viewData) return;

    const sig = getSignatureForSubmission();
    if (!sig) {
      message.error('Please complete at least the signature or initials field.');
      return;
    }

    setSubmitLoading(true);
    try {
      await pdfEditorApi.submitSignature(token, {
        signatureDataUrl: `data:image/png;base64,${sig.base64}`,
        signatureType: sig.mode === 'auto' ? 'type' : sig.mode,
        signatureFont: sig.font,
      });
      setReviewOpen(false);
      setStatus('success');
    } catch (err: unknown) {
      const httpStatus = (err as { response?: { status?: number } })?.response?.status;
      if (httpStatus === 409) {
        message.error('This document has already been signed.');
        setStatus('already_signed');
      } else {
        message.error('Failed to submit signature. Please try again.');
      }
    } finally {
      setSubmitLoading(false);
    }
  }, [token, viewData, getSignatureForSubmission]);

  // Decline flow
  const handleDeclineConfirm = useCallback(async (reason: string) => {
    if (!token) return;
    setDeclineLoading(true);
    try {
      await pdfEditorApi.declineSignature(token, reason || undefined);
      setDeclineModalOpen(false);
      setStatus('declined');
    } catch {
      message.error('Failed to decline. Please try again.');
    } finally {
      setDeclineLoading(false);
    }
  }, [token]);

  const isSigned = status === 'already_signed' || status === 'success';

  // ────────────────────────────────────────────────────────────────────────
  // Render states
  // ────────────────────────────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div style={styles.centeredFull}>
        <Spin size="large" />
        <Text type="secondary" style={{ marginTop: 16 }}>Loading document…</Text>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div style={styles.centeredFull}>
        <Card style={styles.resultCard} bordered={false}>
          {viewData?.companyLogoUrl && <img src={viewData.companyLogoUrl} alt="logo" style={styles.logo} />}
          <Result
            status="success"
            title="Document Signed"
            subTitle={
              <>
                <p>You have successfully signed <strong>{viewData?.documentName ?? 'the document'}</strong>.</p>
                <p style={{ marginTop: 8, color: '#6b7280', fontSize: 13 }}>A copy will be sent to {viewData?.senderEmail}.</p>
              </>
            }
          />
        </Card>
      </div>
    );
  }

  if (status === 'already_signed') {
    return (
      <div style={styles.centeredFull}>
        <Card style={styles.resultCard} bordered={false}>
          {viewData?.companyLogoUrl && <img src={viewData.companyLogoUrl} alt="logo" style={styles.logo} />}
          <Result
            icon={
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            }
            title="Already Signed"
            subTitle={`${viewData?.documentName ?? 'This document'} has already been signed.`}
          />
        </Card>
      </div>
    );
  }

  if (status === 'declined') {
    return (
      <div style={styles.centeredFull}>
        <Card style={styles.resultCard} bordered={false}>
          {viewData?.companyLogoUrl && <img src={viewData.companyLogoUrl} alt="logo" style={styles.logo} />}
          <Result status="warning" title="Signature Declined" subTitle={`You have declined to sign ${viewData?.documentName ?? 'this document'}. The sender has been notified.`} />
        </Card>
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <div style={styles.centeredFull}>
        <Card style={styles.resultCard} bordered={false}>
          <Result status="error" title="Link Unavailable" subTitle={errorMessage || 'This signing link has expired or is no longer valid.'} />
        </Card>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div style={styles.centeredFull}>
        <Card style={styles.resultCard} bordered={false}>
          <Result status="error" title="Something went wrong" subTitle={errorMessage || 'Unable to load the document.'} />
        </Card>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // Main signing view
  // ────────────────────────────────────────────────────────────────────────
  const pageCount = viewData?.pageCount ?? 0;

  // Compute per-page global index offset for PageView
  const pageFieldStartIndex: Record<number, number> = {};
  {
    let idx = 0;
    const pages = [...new Set(allFields.map((f) => f.page))].sort((a, b) => a - b);
    for (const pg of pages) {
      pageFieldStartIndex[pg] = idx;
      idx += allFields.filter((f) => f.page === pg).length;
    }
  }

  return (
    <div style={styles.pageRoot}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.branding}>
            {viewData?.companyLogoUrl ? (
              <img src={viewData.companyLogoUrl} alt={viewData?.companyName ?? 'Company logo'} style={styles.headerLogo} />
            ) : (
              <div style={styles.logoPlaceholder} aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <path d="M8 12h8M8 8h5" />
                </svg>
              </div>
            )}
            <Text strong style={{ fontSize: 15, color: '#111827' }}>
              {viewData?.companyName ?? 'Document Signing'}
            </Text>
          </div>
          <div style={styles.docMeta}>
            <Text style={{ fontSize: 13, color: '#374151' }}><strong>{viewData?.documentName}</strong></Text>
            <Text type="secondary" style={{ fontSize: 12 }}>From: {viewData?.senderName} &lt;{viewData?.senderEmail}&gt;</Text>
            {viewData?.expiresAt && <Text type="secondary" style={{ fontSize: 12 }}>Expires: {formatDate(viewData.expiresAt)}</Text>}
          </div>
        </div>
      </header>

      {/* Progress bar */}
      {totalFields > 0 && (
        <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '10px 20px' }}>
          <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.round((filledCount / totalFields) * 100)}%`,
                  height: '100%',
                  background: allFilled ? '#10b981' : '#111827',
                  borderRadius: 3,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <Text style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>
              {filledCount} / {totalFields} fields
            </Text>
          </div>
        </div>
      )}

      {/* Body */}
      <main style={styles.main} aria-label="Document pages">
        <div style={styles.contentWrapper}>
          {pageCount === 0 ? (
            <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>
          ) : (
            Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNum) => (
              <PageView
                key={pageNum}
                token={token!}
                pageNum={pageNum}
                totalPages={pageCount}
                signFields={allFields}
                fieldValues={fieldValues}
                isSigned={isSigned}
                onFieldClick={handleFieldClick}
                globalIndexOffset={pageFieldStartIndex[pageNum] ?? 0}
              />
            ))
          )}
        </div>
      </main>

      {/* Footer */}
      <footer style={styles.footer}>
        <div style={styles.footerInner}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {allFilled ? (
              <Button
                type="primary"
                size="large"
                onClick={() => setReviewOpen(true)}
                loading={submitLoading}
                disabled={isSigned}
                icon={<CheckCircleFilled />}
                style={{
                  background: '#10b981', borderColor: '#10b981', borderRadius: 8,
                  fontWeight: 600, height: 44, paddingLeft: 22, paddingRight: 22,
                }}
              >
                Review & Submit
              </Button>
            ) : (
              <Button
                type="primary"
                size="large"
                disabled
                style={{
                  borderRadius: 8, fontWeight: 600, height: 44,
                  paddingLeft: 22, paddingRight: 22,
                }}
              >
                Fill all fields to submit ({filledCount}/{totalFields})
              </Button>
            )}

            {!isSigned && (
              <Button
                size="large"
                danger
                onClick={() => setDeclineModalOpen(true)}
                disabled={submitLoading}
                style={{ borderRadius: 8, height: 44, paddingLeft: 22, paddingRight: 22 }}
              >
                Decline
              </Button>
            )}
          </div>

          <Text type="secondary" style={{ fontSize: 11 }}>Powered by ScopeIt</Text>
        </div>
      </footer>

      {/* Modals */}
      <SignatureModal
        open={signModalOpen}
        onClose={() => { setSignModalOpen(false); setActiveFieldIndex(null); }}
        onApply={handleSignatureApply}
        fieldType={signModalFieldType}
      />

      <ReviewModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        onSubmit={handleSubmit}
        loading={submitLoading}
        signFields={allFields}
        fieldValues={fieldValues}
      />

      <DeclineModal
        open={declineModalOpen}
        onClose={() => setDeclineModalOpen(false)}
        onConfirm={handleDeclineConfirm}
        loading={declineLoading}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  centeredFull: {
    minHeight: '100vh', background: '#f9fafb', display: 'flex',
    flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  resultCard: {
    width: '100%', maxWidth: 480, borderRadius: 12,
    boxShadow: '0 1px 8px rgba(0,0,0,0.08)', padding: 8,
  },
  logo: {
    display: 'block', maxHeight: 40, maxWidth: 160,
    objectFit: 'contain', margin: '0 auto 16px',
  },
  pageRoot: {
    minHeight: '100vh', background: '#f9fafb', display: 'flex', flexDirection: 'column',
  },
  header: {
    background: '#fff', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 100,
  },
  headerInner: {
    maxWidth: 800, margin: '0 auto', padding: '12px 20px',
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  branding: { display: 'flex', alignItems: 'center', gap: 10 },
  headerLogo: { height: 32, width: 'auto', maxWidth: 120, objectFit: 'contain' },
  logoPlaceholder: {
    width: 36, height: 36, borderRadius: 8, background: '#f3f4f6',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  docMeta: { display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 4 },
  main: { flex: 1, overflowY: 'auto', padding: '24px 16px 120px' },
  contentWrapper: { maxWidth: 800, margin: '0 auto' },
  footer: {
    position: 'sticky', bottom: 0, background: '#fff',
    borderTop: '1px solid #e5e7eb', zIndex: 100,
  },
  footerInner: {
    maxWidth: 800, margin: '0 auto', padding: '14px 20px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
  },
};

export default SignPage;
