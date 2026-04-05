/**
 * ScopeIt - Packing Tool: Photo AI Tab
 * Step-based wizard: Details → Rooms & Photos → Review
 * Photo-based packing estimation using AI room analysis.
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  Steps,
  Card,
  Button,
  Select,
  Input,
  InputNumber,
  Space,
  Tag,
  Badge,
  Tooltip,
  message,
  Typography,
  Row,
  Col,
  Alert,
  Collapse,
  Divider,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  CameraOutlined,
  ScanOutlined,
  ExclamationCircleOutlined,
  StarOutlined,
  WarningOutlined,
  CalculatorOutlined,
  LoadingOutlined,
  EditOutlined,
  CheckOutlined,
  UserOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  ThunderboltOutlined,
  CloseOutlined,
  DownOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { packingApi } from './packingApi';
import { FolderImportModal } from './FolderImportModal';
import { useGoogleDrive } from './useGoogleDrive';
import {
  DENSITY_OPTIONS,
  FLOOR_OPTIONS,
  CONTAMINATION_OPTIONS,
  REGION_OPTIONS,
} from './constants';
import { ITEM_CATEGORIES } from './types';
import { SharedDetailsStep } from './SharedDetailsStep';
import { RoomSpecialItems } from './RoomSpecialItems';
import type {
  PhotoRoom,
  PackingSettings,
  ClientInfo,
  CompanyInfoOverride,
  EstimateResponse,
  RoomPreset,
  DetectedContentItem,
  CustomSpecialItem,
  BatchAnalysisState,
  BatchRoomEvent,
  BatchCompleteEvent,
} from './types';
import { colors, fonts, borderRadius } from '@/styles/theme';
import { useIsNarrow } from '@/hooks/useIsMobile';

const { Text, Title } = Typography;
const { Option } = Select;

// ── Types ─────────────────────────────────────────────────────────────────────

interface PhotoAITabProps {
  presets: Record<string, RoomPreset[]>;
  presetsLoading: boolean;
  photoRooms: PhotoRoom[];
  setPhotoRooms: React.Dispatch<React.SetStateAction<PhotoRoom[]>>;
  settings: PackingSettings;
  setSettings: React.Dispatch<React.SetStateAction<PackingSettings>>;
  clientInfo: ClientInfo;
  setClientInfo: React.Dispatch<React.SetStateAction<ClientInfo>>;
  companyOverride: CompanyInfoOverride;
  setCompanyOverride: React.Dispatch<React.SetStateAction<CompanyInfoOverride>>;
  onEstimateResult: (res: EstimateResponse) => void;
  activeSessionId?: string;
}

// Inline edit state tracks which cell is being edited
interface EditingCell {
  roomId: string;
  itemIndex: number;
  field: 'name' | 'category' | 'quantity';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateId(): string {
  return `room_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function defaultPhotoRoom(roomName: string, presetId?: string): PhotoRoom {
  return {
    id: generateId(),
    room_name: roomName,
    preset_id: presetId,
    floor: '1st',
    density: 'normal',
    contamination: 'clean',
    photos: [],
    items: [],
    analyzed: false,
    analyzing: false,
    field_notes: [],
    special_items: [],
    custom_special_items: [],
  };
}

/** Convert File to base64 string (data URI stripped) */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Build a data URI for displaying a base64 image */
function toDataUri(base64: string): string {
  if (base64.startsWith('data:')) return base64;
  return `data:image/jpeg;base64,${base64}`;
}

function confidenceColor(score?: number): string {
  if (!score) return colors.textMuted;
  if (score >= 0.8) return colors.success;
  if (score >= 0.6) return colors.warning;
  return colors.error;
}

function confidenceLabel(score?: number): string {
  if (!score) return 'Not analyzed';
  return `${Math.round(score * 100)}% confidence`;
}

// ── Add Room Panel (used in Step 2) ─────────────────────────────────────────

interface AddRoomPanelProps {
  presets: Record<string, RoomPreset[]>;
  presetsLoading: boolean;
  onAddRoom: (room: PhotoRoom) => void;
}

const AddRoomPanel: React.FC<AddRoomPanelProps> = ({ presets, presetsLoading, onAddRoom }) => {
  const [expanded, setExpanded] = useState(false);
  const [useCustom, setUseCustom] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | undefined>(undefined);
  const [customName, setCustomName] = useState('');
  const [pendingPhotos, setPendingPhotos] = useState<string[]>([]);
  const addFileRef = useRef<HTMLInputElement>(null);

  const allPresets: RoomPreset[] = Object.values(presets).flat();

  const handleFilesSelected = useCallback(async (files: FileList) => {
    const fileArray = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (fileArray.length === 0) return;
    const base64List = await Promise.all(fileArray.map(fileToBase64));
    setPendingPhotos((prev) => [...prev, ...base64List]);
  }, []);

  const handleAdd = () => {
    const roomName = useCustom
      ? customName.trim()
      : allPresets.find((p) => p.key === selectedPreset)?.name ?? '';

    if (!roomName) {
      message.warning('Please select or enter a room name.');
      return;
    }
    if (pendingPhotos.length === 0) {
      message.warning('Please upload at least one photo.');
      return;
    }

    const room = defaultPhotoRoom(roomName, useCustom ? undefined : selectedPreset);
    room.photos = [...pendingPhotos];
    onAddRoom(room);

    // Reset and collapse
    setSelectedPreset(undefined);
    setCustomName('');
    setPendingPhotos([]);
    setExpanded(false);
  };

  // ── Collapsed: single dashed trigger row ──
  if (!expanded) {
    return (
      <div
        onClick={() => setExpanded(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '10px 16px',
          border: `1.5px dashed ${colors.border}`,
          borderRadius: borderRadius.lg,
          cursor: 'pointer',
          background: colors.bgWhite,
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor = colors.primary;
          (e.currentTarget as HTMLDivElement).style.background = colors.primary + '06';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor = colors.border;
          (e.currentTarget as HTMLDivElement).style.background = colors.bgWhite;
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded(true)}
      >
        <PlusOutlined style={{ fontSize: 14, color: colors.textMuted }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: colors.textSecondary, fontFamily: fonts.body }}>
          Add a room...
        </span>
      </div>
    );
  }

  // ── Expanded: compact 2-row form ──
  return (
    <div
      style={{
        border: `1.5px solid ${colors.border}`,
        borderRadius: borderRadius.lg,
        padding: '12px 14px',
        marginBottom: 12,
        background: colors.bgWhite,
      }}
    >
      {/* Row 1: Room name + preset/custom toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {useCustom ? (
            <Input
              placeholder="Room name (e.g. Master Bedroom)"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              onPressEnter={handleAdd}
              size="middle"
            />
          ) : (
            <Select
              placeholder={presetsLoading ? 'Loading...' : 'Select a room'}
              loading={presetsLoading}
              value={selectedPreset}
              onChange={setSelectedPreset}
              style={{ width: '100%' }}
              showSearch
              optionFilterProp="label"
              size="middle"
            >
              {Object.entries(presets).map(([category, list]) => (
                <Select.OptGroup key={category} label={category}>
                  {list.map((p) => (
                    <Option key={p.key} value={p.key} label={p.name}>
                      {p.name}
                    </Option>
                  ))}
                </Select.OptGroup>
              ))}
            </Select>
          )}
        </div>
        <button
          onClick={() => setUseCustom((v) => !v)}
          style={{
            fontSize: 12,
            fontFamily: fonts.body,
            color: colors.primary,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            fontWeight: 500,
            padding: '4px 0',
            flexShrink: 0,
          }}
        >
          {useCustom ? 'Preset' : 'Custom'}
        </button>
        <button
          onClick={() => {
            setExpanded(false);
            setPendingPhotos([]);
            setSelectedPreset(undefined);
            setCustomName('');
          }}
          style={{
            fontSize: 16,
            color: colors.textMuted,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '2px 0',
            lineHeight: 1,
            flexShrink: 0,
          }}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {/* Row 2: Photo upload + Add button */}
      {pendingPhotos.length === 0 ? (
        /* Empty state: wide upload zone */
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            onClick={() => addFileRef.current?.click()}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '10px 16px',
              border: `1.5px dashed ${colors.border}`,
              borderRadius: borderRadius.base,
              cursor: 'pointer',
              background: colors.bgLight,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = colors.primary;
              (e.currentTarget as HTMLDivElement).style.background = colors.primary + '06';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = colors.border;
              (e.currentTarget as HTMLDivElement).style.background = colors.bgLight;
            }}
          >
            <CameraOutlined style={{ fontSize: 16, color: colors.textMuted }} />
            <span style={{ fontSize: 13, color: colors.textSecondary, fontFamily: fonts.body }}>
              Upload room photos
            </span>
          </div>
          <input
            ref={addFileRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFilesSelected(e.target.files);
                e.target.value = '';
              }
            }}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAdd}
            disabled
            style={{ flexShrink: 0, fontWeight: 600, fontSize: 13 }}
          >
            Add
          </Button>
        </div>
      ) : (
        /* Has photos: thumbnails + add more + submit */
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, flexWrap: 'wrap', minWidth: 0 }}>
            {pendingPhotos.map((b64, i) => (
              <div
                key={i}
                style={{
                  position: 'relative',
                  width: 44,
                  height: 44,
                  borderRadius: borderRadius.sm,
                  overflow: 'hidden',
                  border: `1px solid ${colors.border}`,
                  flexShrink: 0,
                }}
              >
                <img src={toDataUri(b64)} alt={`Photo ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button
                  onClick={() => setPendingPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                  style={{
                    position: 'absolute',
                    top: 1,
                    right: 1,
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'rgba(0,0,0,0.55)',
                    color: '#fff',
                    fontSize: 9,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    lineHeight: 1,
                  }}
                  aria-label="Remove photo"
                >
                  ×
                </button>
              </div>
            ))}
            <div
              onClick={() => addFileRef.current?.click()}
              style={{
                width: 44,
                height: 44,
                borderRadius: borderRadius.sm,
                border: `1px dashed ${colors.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                background: colors.bgLight,
                flexShrink: 0,
              }}
            >
              <PlusOutlined style={{ fontSize: 13, color: colors.textMuted }} />
            </div>
          </div>
          <input
            ref={addFileRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFilesSelected(e.target.files);
                e.target.value = '';
              }
            }}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAdd}
            style={{
              background: colors.primary,
              borderColor: colors.primary,
              flexShrink: 0,
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            Add ({pendingPhotos.length})
          </Button>
        </div>
      )}
    </div>
  );
};

// ── Inline-Editable Item Row ────────────────────────────────────────────────

interface ItemRowProps {
  item: DetectedContentItem;
  roomId: string;
  itemIndex: number;
  editingCell: EditingCell | null;
  onStartEdit: (cell: EditingCell) => void;
  onCommitEdit: (roomId: string, itemIndex: number, field: EditingCell['field'], value: string | number) => void;
  onCancelEdit: () => void;
  onDelete: () => void;
}

const ItemRow: React.FC<ItemRowProps> = ({
  item,
  roomId,
  itemIndex,
  editingCell,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onDelete,
}) => {
  const [editValue, setEditValue] = useState<string | number>('');
  const isEditing = (field: EditingCell['field']) =>
    editingCell?.roomId === roomId &&
    editingCell?.itemIndex === itemIndex &&
    editingCell?.field === field;

  const startEdit = (field: EditingCell['field']) => {
    const initial =
      field === 'name' ? item.name : field === 'category' ? item.category : item.quantity;
    setEditValue(initial);
    onStartEdit({ roomId, itemIndex, field });
  };

  const commit = (field: EditingCell['field']) => {
    onCommitEdit(roomId, itemIndex, field, editValue);
  };

  const cellStyle: React.CSSProperties = {
    cursor: 'pointer',
    padding: '2px 4px',
    borderRadius: borderRadius.sm,
    transition: 'background 0.15s',
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 100px 52px 60px',
        gap: 4,
        alignItems: 'center',
        padding: '5px 6px',
        borderBottom: `1px solid ${colors.border}`,
        fontSize: 12,
        fontFamily: fonts.body,
      }}
    >
      {/* Name */}
      {isEditing('name') ? (
        <Input
          size="small"
          value={editValue as string}
          autoFocus
          onChange={(e) => setEditValue(e.target.value)}
          onPressEnter={() => commit('name')}
          onBlur={() => commit('name')}
          onKeyDown={(e) => e.key === 'Escape' && onCancelEdit()}
          style={{ fontSize: 12, height: 24 }}
        />
      ) : (
        <div
          style={{ ...cellStyle, display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}
          onClick={() => startEdit('name')}
          title="Click to edit"
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: colors.textPrimary }}>
            {item.name}
          </span>
          {item.is_high_value && (
            <Tooltip title="High value">
              <StarOutlined style={{ color: colors.warning, fontSize: 11, flexShrink: 0 }} />
            </Tooltip>
          )}
          {item.is_fragile && (
            <Tooltip title="Fragile">
              <WarningOutlined style={{ color: colors.error, fontSize: 11, flexShrink: 0 }} />
            </Tooltip>
          )}
        </div>
      )}

      {/* Category */}
      {isEditing('category') ? (
        <Select
          size="small"
          value={editValue as string}
          autoFocus
          open
          onChange={(v) => {
            setEditValue(v);
            onCommitEdit(roomId, itemIndex, 'category', v);
          }}
          onBlur={() => onCancelEdit()}
          style={{ fontSize: 12, width: '100%' }}
        >
          {ITEM_CATEGORIES.map((cat) => (
            <Option key={cat} value={cat}>
              {cat}
            </Option>
          ))}
        </Select>
      ) : (
        <Tag
          color="default"
          style={{ fontSize: 11, cursor: 'pointer', margin: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}
          onClick={() => startEdit('category')}
          title="Click to edit"
        >
          {item.category || 'Other'}
        </Tag>
      )}

      {/* Quantity */}
      {isEditing('quantity') ? (
        <InputNumber
          size="small"
          min={1}
          value={editValue as number}
          autoFocus
          onChange={(v) => setEditValue(v ?? 1)}
          onPressEnter={() => commit('quantity')}
          onBlur={() => commit('quantity')}
          onKeyDown={(e) => e.key === 'Escape' && onCancelEdit()}
          style={{ width: '100%', fontSize: 12 }}
        />
      ) : (
        <div
          style={{ ...cellStyle, textAlign: 'center', color: colors.textSecondary }}
          onClick={() => startEdit('quantity')}
          title="Click to edit"
        >
          x{item.quantity}
        </div>
      )}

      {/* Delete */}
      <Button
        type="text"
        size="small"
        icon={<DeleteOutlined />}
        danger
        onClick={onDelete}
        style={{ padding: '0 4px', height: 24 }}
        aria-label={`Delete ${item.name}`}
      />
    </div>
  );
};

// ── Room Card ───────────────────────────────────────────────────────────────

interface RoomCardProps {
  room: PhotoRoom;
  editingCell: EditingCell | null;
  onUpdate: (id: string, updates: Partial<PhotoRoom>) => void;
  onDelete: (id: string) => void;
  onAnalyze: (id: string) => void;
  onCancelAnalyze: (id: string) => void;
  onStartEdit: (cell: EditingCell) => void;
  onCommitEdit: (roomId: string, itemIndex: number, field: EditingCell['field'], value: string | number) => void;
  onCancelEdit: () => void;
  onAddPhoto: (id: string, files: FileList) => void;
  onRemovePhoto: (id: string, index: number) => void;
  onAddItem: (id: string) => void;
  onDeleteItem: (roomId: string, itemIndex: number) => void;
  analysisFailed?: boolean;
}

const RoomCard: React.FC<RoomCardProps> = ({
  room,
  editingCell,
  onUpdate,
  onDelete,
  onAnalyze,
  onCancelAnalyze,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onAddPhoto,
  onRemovePhoto,
  onAddItem,
  onDeleteItem,
  analysisFailed,
}) => {
  const [editingAttrs, setEditingAttrs] = useState(false);
  const [itemsCollapsed, setItemsCollapsed] = useState(false);

  const totalLaborHours = room.items.reduce((sum, item) => sum + (item.estimated_labor_hours ?? 0), 0);
  const fragileCount = room.items.filter((i) => i.is_fragile).length;
  const specialItemCount = room.special_items.length + room.custom_special_items.length;

  const handleToggleSpecialItem = useCallback(
    (key: string) => {
      const current = room.special_items;
      const next = current.includes(key)
        ? current.filter((k) => k !== key)
        : [...current, key];
      onUpdate(room.id, { special_items: next });
    },
    [room.id, room.special_items, onUpdate],
  );

  const handleAddCustomSpecialItem = useCallback(
    (item: CustomSpecialItem) => {
      onUpdate(room.id, { custom_special_items: [...room.custom_special_items, item] });
    },
    [room.id, room.custom_special_items, onUpdate],
  );

  const handleRemoveCustomSpecialItem = useCallback(
    (idx: number) => {
      onUpdate(room.id, {
        custom_special_items: room.custom_special_items.filter((_, i) => i !== idx),
      });
    },
    [room.id, room.custom_special_items, onUpdate],
  );

  return (
    <Card
      size="small"
      style={{
        borderRadius: borderRadius.lg,
        border: `1px solid ${
          analysisFailed
            ? colors.error + '55'
            : room.analyzed
              ? colors.success + '55'
              : colors.border
        }`,
        marginBottom: 12,
        width: '100%',
      }}
      bodyStyle={{ padding: 0 }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: fonts.heading, fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {room.room_name}
            </span>
            {!editingAttrs && (
              <>
                <Tag style={{ margin: 0, fontSize: 11, borderRadius: 4 }}>{room.floor}</Tag>
                <Tag style={{ margin: 0, fontSize: 11, borderRadius: 4 }}>{room.density}</Tag>
                {room.contamination !== 'clean' && (
                  <Tag color="warning" style={{ margin: 0, fontSize: 11, borderRadius: 4 }}>
                    {room.contamination.replace('_', ' ')}
                  </Tag>
                )}
              </>
            )}
            {room.analyzed && (
              <Badge
                count={confidenceLabel(room.confidence_score)}
                style={{
                  backgroundColor: confidenceColor(room.confidence_score),
                  fontSize: 10,
                  height: 18,
                  lineHeight: '18px',
                  padding: '0 6px',
                  borderRadius: 9,
                  whiteSpace: 'nowrap',
                }}
              />
            )}
            {room.analyzing && <LoadingOutlined style={{ fontSize: 14, color: colors.info }} />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Tooltip title={editingAttrs ? 'Done editing' : 'Edit room settings'}>
              <Button
                type="text"
                size="small"
                icon={editingAttrs ? <CheckOutlined /> : <EditOutlined />}
                onClick={() => setEditingAttrs((v) => !v)}
                style={{ color: editingAttrs ? colors.success : colors.textMuted }}
              />
            </Tooltip>
            <Button
              type="text"
              size="small"
              icon={<DeleteOutlined />}
              danger
              onClick={() => onDelete(room.id)}
              aria-label={`Delete room ${room.room_name}`}
            />
          </div>
        </div>
      }
    >
      <div style={{ padding: '12px 16px' }}>
        {/* Editable attributes */}
        {editingAttrs && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12, padding: '10px 12px', background: colors.bgLight, borderRadius: borderRadius.md }}>
            <div style={{ flex: '1 1 140px' }}>
              <span style={{ fontSize: 12, color: colors.textMuted, fontFamily: fonts.body, display: 'block', marginBottom: 2 }}>Floor</span>
              <Select
                value={room.floor}
                onChange={(v) => onUpdate(room.id, { floor: v })}
                style={{ width: '100%' }}
                disabled={room.analyzing}
              >
                {FLOOR_OPTIONS.map((o) => (
                  <Option key={o.value} value={o.value}>{o.label}</Option>
                ))}
              </Select>
            </div>
            <div style={{ flex: '1 1 140px' }}>
              <span style={{ fontSize: 12, color: colors.textMuted, fontFamily: fonts.body, display: 'block', marginBottom: 2 }}>Density</span>
              <Select
                value={room.density}
                onChange={(v) => onUpdate(room.id, { density: v })}
                style={{ width: '100%' }}
                disabled={room.analyzing}
              >
                {DENSITY_OPTIONS.map((o) => (
                  <Option key={o.value} value={o.value}>{o.label}</Option>
                ))}
              </Select>
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <span style={{ fontSize: 12, color: colors.textMuted, fontFamily: fonts.body, display: 'block', marginBottom: 2 }}>Contamination</span>
              <Select
                value={room.contamination}
                onChange={(v) => onUpdate(room.id, { contamination: v })}
                style={{ width: '100%' }}
                disabled={room.analyzing}
              >
                {CONTAMINATION_OPTIONS.map((o) => (
                  <Option key={o.value} value={o.value}>{o.label}</Option>
                ))}
              </Select>
            </div>
          </div>
        )}

        {/* Photos */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {room.photos.map((b64, i) => (
              <div
                key={i}
                style={{
                  position: 'relative',
                  width: 56,
                  height: 56,
                  borderRadius: borderRadius.base,
                  overflow: 'hidden',
                  border: `1px solid ${colors.border}`,
                  flexShrink: 0,
                }}
              >
                <img
                  src={toDataUri(b64)}
                  alt={`Photo ${i + 1}`}
                  style={{ width: 56, height: 56, objectFit: 'cover', display: 'block' }}
                />
                {!room.analyzing && (
                  <button
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); onRemovePhoto(room.id, i); }}
                    style={{
                      position: 'absolute',
                      top: 2,
                      right: 2,
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      border: 'none',
                      background: 'rgba(0,0,0,0.6)',
                      color: '#fff',
                      fontSize: 11,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                      lineHeight: 1,
                      zIndex: 10,
                    }}
                    aria-label="Remove photo"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            {!room.analyzing && (
              <div
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*';
                  input.multiple = true;
                  input.onchange = () => {
                    if (input.files && input.files.length > 0) onAddPhoto(room.id, input.files);
                  };
                  input.click();
                }}
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: borderRadius.base,
                  border: `1px dashed ${colors.border}`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  background: colors.bgLight,
                  flexShrink: 0,
                  gap: 2,
                }}
              >
                <PlusOutlined style={{ fontSize: 14, color: colors.textMuted }} />
                <span style={{ fontSize: 10, color: colors.textMuted }}>Photo</span>
              </div>
            )}
            <span style={{ fontSize: 12, color: colors.textMuted, fontFamily: fonts.body }}>
              {room.photos.length} photo{room.photos.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Analyze / Cancel button */}
        {room.analyzing ? (
          <Button
            danger
            icon={<CloseOutlined />}
            onClick={() => onCancelAnalyze(room.id)}
            style={{
              width: '100%',
              marginBottom: room.analyzed || room.items.length > 0 ? 12 : 0,
            }}
          >
            Cancel Analysis
          </Button>
        ) : (
          <Button
            type={room.analyzed ? 'default' : 'primary'}
            icon={<ScanOutlined />}
            disabled={room.photos.length === 0}
            onClick={() => onAnalyze(room.id)}
            style={{
              width: '100%',
              marginBottom: room.analyzed || room.items.length > 0 ? 12 : 0,
              ...(room.analyzed ? {} : { background: colors.primary, borderColor: colors.primary }),
            }}
          >
            {analysisFailed ? 'Retry Analysis' : room.analyzed ? 'Re-Analyze' : 'Analyze Room'}
          </Button>
        )}

        {/* Detected items + field notes (collapsible together) */}
        {(room.analyzed || room.items.length > 0) && (
          <div>
            {/* Toggle header */}
            <div
              onClick={() => setItemsCollapsed((v) => !v)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: itemsCollapsed ? 0 : 6,
                cursor: 'pointer',
                userSelect: 'none',
                padding: '4px 0',
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setItemsCollapsed((v) => !v)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {itemsCollapsed
                  ? <RightOutlined style={{ fontSize: 10, color: colors.textMuted }} />
                  : <DownOutlined style={{ fontSize: 10, color: colors.textMuted }} />
                }
                <Text style={{ fontSize: 12, fontWeight: 600, color: colors.textSecondary, fontFamily: fonts.body }}>
                  Detected Items ({room.items.length})
                </Text>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {totalLaborHours > 0 && (
                  <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>{totalLaborHours.toFixed(1)}h labor</Tag>
                )}
                {fragileCount > 0 && (
                  <Tag color="red" style={{ fontSize: 11, margin: 0 }}>{fragileCount} fragile</Tag>
                )}
              </div>
            </div>

            {/* Collapsible content */}
            {!itemsCollapsed && (
              <>
                {/* Field notes */}
                {room.field_notes.length > 0 && (
                  <div style={{ marginBottom: 10, padding: '8px 10px', background: '#fffbeb', borderRadius: borderRadius.base, border: `1px solid #fde68a` }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#92400e', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <ExclamationCircleOutlined /> Field Notes
                    </div>
                    {room.field_notes.map((note, i) => (
                      <div key={i} style={{ fontSize: 11, color: '#78350f', marginBottom: 2 }}>- {note}</div>
                    ))}
                  </div>
                )}
                {room.items.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '12px 0', color: colors.textMuted, fontSize: 12 }}>
                    No items detected. Try re-analyzing or add items manually.
                  </div>
                ) : (
                  <div style={{ border: `1px solid ${colors.border}`, borderRadius: borderRadius.base, overflow: 'hidden', marginBottom: 8 }}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 100px 52px 60px',
                        gap: 4,
                        padding: '4px 6px',
                        background: colors.bgLight,
                        borderBottom: `1px solid ${colors.border}`,
                        fontSize: 11,
                        fontWeight: 600,
                        color: colors.textSecondary,
                        fontFamily: fonts.body,
                      }}
                    >
                      <span>Name</span>
                      <span>Category</span>
                      <span style={{ textAlign: 'center' }}>Qty</span>
                      <span />
                    </div>
                    {room.items.map((item, idx) => (
                      <ItemRow
                        key={idx}
                        item={item}
                        roomId={room.id}
                        itemIndex={idx}
                        editingCell={editingCell}
                        onStartEdit={onStartEdit}
                        onCommitEdit={onCommitEdit}
                        onCancelEdit={onCancelEdit}
                        onDelete={() => onDeleteItem(room.id, idx)}
                      />
                    ))}
                  </div>
                )}

                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  size="small"
                  onClick={() => onAddItem(room.id)}
                  style={{ width: '100%', fontSize: 12, marginBottom: 8 }}
                >
                  Add Item Manually
                </Button>
              </>
            )}
          </div>
        )}

        {/* Room size badge */}
        {room.room_size && (
          <div style={{ marginTop: 8, marginBottom: 8 }}>
            <Tag color="default" style={{ fontSize: 11 }}>{room.room_size}</Tag>
          </div>
        )}

        {/* Special Items - hidden in Photo AI mode (items detected from photos) */}
      </div>
    </Card>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

export const PhotoAITab: React.FC<PhotoAITabProps> = ({
  presets,
  presetsLoading,
  photoRooms,
  setPhotoRooms,
  settings,
  setSettings,
  clientInfo,
  setClientInfo,
  companyOverride,
  setCompanyOverride,
  onEstimateResult,
  activeSessionId: _activeSessionId,
}) => {
  const gDrive = useGoogleDrive();
  const isNarrow = useIsNarrow();
  const [currentStep, setCurrentStep] = useState(0);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [generatingEstimate, setGeneratingEstimate] = useState(false);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [batchState, setBatchState] = useState<BatchAnalysisState>({
    isRunning: false,
    currentRoomIndex: 0,
    totalRooms: 0,
    completedRooms: 0,
    failedRooms: [],
    aborted: false,
  });
  const batchAbortRef = useRef<{ abort: () => void } | null>(null);

  const analyzedRooms = photoRooms.filter((r) => r.analyzed);
  const canGenerate = analyzedRooms.length > 0 && !generatingEstimate;

  // ── Room mutation helpers ──────────────────────────────────────────────
  const updateRoom = useCallback(
    (id: string, updates: Partial<PhotoRoom>) => {
      setPhotoRooms((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));
    },
    [setPhotoRooms],
  );

  const deleteRoom = useCallback(
    (id: string) => {
      setPhotoRooms((prev) => prev.filter((r) => r.id !== id));
    },
    [setPhotoRooms],
  );

  const addRoom = useCallback(
    (room: PhotoRoom) => {
      setPhotoRooms((prev) => [room, ...prev]);
    },
    [setPhotoRooms],
  );

  // ── Photo helpers ──────────────────────────────────────────────────────
  const handleAddPhotos = useCallback(
    async (roomId: string, files: FileList) => {
      const fileArray = Array.from(files).filter((f) => f.type.startsWith('image/'));
      if (fileArray.length === 0) return;
      try {
        const base64List = await Promise.all(fileArray.map(fileToBase64));
        updateRoom(roomId, {
          photos: [...(photoRooms.find((r) => r.id === roomId)?.photos ?? []), ...base64List],
        });
      } catch {
        message.error('Failed to process image files.');
      }
    },
    [photoRooms, updateRoom],
  );

  const handleRemovePhoto = useCallback(
    (roomId: string, index: number) => {
      setPhotoRooms((prev) =>
        prev.map((r) =>
          r.id === roomId ? { ...r, photos: r.photos.filter((_, i) => i !== index) } : r,
        ),
      );
    },
    [setPhotoRooms],
  );

  // ── AI Analysis ────────────────────────────────────────────────────────
  // Track per-room AbortControllers so each analysis can be cancelled
  const analyzeAbortRef = useRef<Record<string, AbortController>>({});

  const handleAnalyze = useCallback(
    async (roomId: string) => {
      const room = photoRooms.find((r) => r.id === roomId);
      console.log('[PhotoAI] handleAnalyze called', { roomId, found: !!room, photoCount: room?.photos.length });
      if (!room || room.photos.length === 0) return;

      // Create AbortController for this room
      const controller = new AbortController();
      analyzeAbortRef.current[roomId] = controller;

      updateRoom(roomId, { analyzing: true });
      try {
        console.log('[PhotoAI] Sending analyze request...', { room_name: room.room_name, images: room.photos.length });
        const result = await packingApi.analyzeRoom(
          {
            room_name: room.room_name,
            images: room.photos,
            existing_items: room.items.map((i) => ({ name: i.name, quantity: i.quantity })),
          },
          controller.signal,
        );
        console.log('[PhotoAI] Analyze success', { items: result.items.length });
        updateRoom(roomId, {
          items: result.items,
          density: (result.density as PhotoRoom['density']) ?? room.density,
          room_size: result.room_size,
          confidence_score: result.confidence_score,
          field_notes: result.field_notes,
          analyzed: true,
          analyzing: false,
        });
        message.success(`Analyzed ${room.room_name}: ${result.items.length} items detected`);
      } catch (err: any) {
        if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED' || controller.signal.aborted) {
          message.info('Analysis cancelled.');
        } else {
          console.error('Photo analysis error:', err);
          const detail = err?.response?.data?.detail;
          const status = err?.response?.status;
          let msg = 'Failed to analyze room. Try again.';
          if (detail) {
            msg = detail;
          } else if (err?.code === 'ERR_NETWORK' || err?.message === 'Network Error') {
            msg = 'Cannot reach the server. Make sure the backend is running.';
          } else if (status) {
            msg = `Server error (${status}). Check backend logs for details.`;
          }
          message.error(msg);
        }
        updateRoom(roomId, { analyzing: false });
      } finally {
        delete analyzeAbortRef.current[roomId];
      }
    },
    [photoRooms, updateRoom],
  );

  const handleCancelAnalyze = useCallback(
    (roomId: string) => {
      const controller = analyzeAbortRef.current[roomId];
      if (controller) {
        controller.abort();
      }
      updateRoom(roomId, { analyzing: false });
    },
    [updateRoom],
  );

  // ── Bulk Room Import (from folder) ────────────────────────────────────
  const handleBulkAddRooms = useCallback(
    (newRooms: PhotoRoom[]) => {
      setPhotoRooms((prev) => [...newRooms, ...prev]);
    },
    [setPhotoRooms],
  );

  // ── Batch Analysis (SSE) ────────────────────────────────────────────
  const unanalyzedWithPhotos = photoRooms.filter(
    (r) => !r.analyzed && r.photos.length > 0 && !r.analyzing,
  );

  const handleBatchAnalyze = useCallback(() => {
    const rooms = photoRooms.filter(
      (r) => !r.analyzed && r.photos.length > 0,
    );
    if (rooms.length === 0) {
      message.warning('No unanalyzed rooms with photos.');
      return;
    }

    // Mark all target rooms as analyzing
    setPhotoRooms((prev) =>
      prev.map((r) =>
        rooms.some((t) => t.id === r.id)
          ? { ...r, analyzing: true }
          : r,
      ),
    );

    setBatchState({
      isRunning: true,
      currentRoomIndex: 0,
      totalRooms: rooms.length,
      completedRooms: 0,
      failedRooms: [],
      aborted: false,
    });

    const handle = packingApi.analyzeBatch(
      rooms.map((r) => ({
        room_name: r.room_name,
        images: r.photos,
        existing_items: r.items.length > 0
          ? r.items.map((i) => ({ name: i.name, quantity: i.quantity }))
          : undefined,
      })),
      {
        onRoomResult: (evt: BatchRoomEvent) => {
          const targetRoom = rooms[evt.room_index];
          if (!targetRoom) return;

          if (evt.status === 'success' && evt.result) {
            updateRoom(targetRoom.id, {
              items: evt.result.items,
              density: (evt.result.density as PhotoRoom['density']) ?? 'normal',
              room_size: evt.result.room_size,
              confidence_score: evt.result.confidence_score,
              field_notes: evt.result.field_notes,
              analyzed: true,
              analyzing: false,
            });
          } else {
            // Error: leave room in previous state, mark not analyzing
            updateRoom(targetRoom.id, { analyzing: false });
            setBatchState((prev) => ({
              ...prev,
              failedRooms: [
                ...prev.failedRooms,
                {
                  id: targetRoom.id,
                  name: targetRoom.room_name,
                  error: evt.error_message || 'Unknown error',
                },
              ],
            }));
          }

          setBatchState((prev) => ({
            ...prev,
            currentRoomIndex: evt.room_index + 1,
            completedRooms: prev.completedRooms + 1,
          }));
        },
        onComplete: (evt: BatchCompleteEvent) => {
          setBatchState((prev) => ({
            ...prev,
            isRunning: false,
          }));
          batchAbortRef.current = null;

          if (evt.failed > 0) {
            message.warning(
              `${evt.succeeded} room${evt.succeeded !== 1 ? 's' : ''} analyzed, ${evt.failed} failed. Check rooms marked in red.`,
            );
          } else {
            message.success(
              `All ${evt.succeeded} room${evt.succeeded !== 1 ? 's' : ''} analyzed successfully.`,
            );
          }
        },
        onError: (error: string) => {
          // Stream-level error: mark all analyzing rooms as not analyzing
          setPhotoRooms((prev) =>
            prev.map((r) => (r.analyzing ? { ...r, analyzing: false } : r)),
          );
          setBatchState((prev) => ({
            ...prev,
            isRunning: false,
          }));
          batchAbortRef.current = null;
          message.error(`Batch analysis failed: ${error}`);
        },
      },
    );

    batchAbortRef.current = handle;
  }, [photoRooms, setPhotoRooms, updateRoom]);

  const handleBatchCancel = useCallback(() => {
    batchAbortRef.current?.abort();
    batchAbortRef.current = null;
    setPhotoRooms((prev) =>
      prev.map((r) => (r.analyzing ? { ...r, analyzing: false } : r)),
    );
    setBatchState((prev) => ({
      ...prev,
      isRunning: false,
      aborted: true,
    }));
    message.info('Batch analysis cancelled.');
  }, [setPhotoRooms]);

  // ── Item inline edit ──────────────────────────────────────────────────
  const handleCommitEdit = useCallback(
    (roomId: string, itemIndex: number, field: EditingCell['field'], value: string | number) => {
      setPhotoRooms((prev) =>
        prev.map((r) => {
          if (r.id !== roomId) return r;
          const items = r.items.map((item, i) => {
            if (i !== itemIndex) return item;
            if (field === 'name') return { ...item, name: String(value) };
            if (field === 'category') return { ...item, category: String(value) };
            if (field === 'quantity') return { ...item, quantity: Number(value) };
            return item;
          });
          return { ...r, items };
        }),
      );
      setEditingCell(null);
    },
    [setPhotoRooms],
  );

  const handleDeleteItem = useCallback(
    (roomId: string, itemIndex: number) => {
      setPhotoRooms((prev) =>
        prev.map((r) =>
          r.id === roomId ? { ...r, items: r.items.filter((_, i) => i !== itemIndex) } : r,
        ),
      );
    },
    [setPhotoRooms],
  );

  const handleAddItem = useCallback(
    (roomId: string) => {
      const newItem: DetectedContentItem = {
        name: 'New Item',
        category: 'Other',
        quantity: 1,
        is_high_value: false,
        is_fragile: false,
        needs_disassembly: false,
      };
      setPhotoRooms((prev) =>
        prev.map((r) => (r.id === roomId ? { ...r, items: [...r.items, newItem] } : r)),
      );
    },
    [setPhotoRooms],
  );

  // ── Generate Estimate ──────────────────────────────────────────────────
  const handleGenerateEstimate = useCallback(async () => {
    if (analyzedRooms.length === 0) return;
    setGeneratingEstimate(true);

    // Aggregate per-room special items
    const allSpecialItems = [...new Set(analyzedRooms.flatMap((r) => r.special_items))];
    const allCustomSpecialItems = analyzedRooms.flatMap((r) => r.custom_special_items);

    try {
      const result = await packingApi.contentEstimate({
        rooms: analyzedRooms.map((r) => ({
          room_name: r.room_name,
          preset_id: r.preset_id,
          items: r.items,
          density: r.density,
          floor: r.floor,
          contamination: r.contamination,
          special_items: r.special_items,
          custom_special_items: r.custom_special_items,
        })),
        crew_size: settings.crew_size,
        storage_months: settings.storage_months,
        staging_type: settings.staging_type,
        include_packback: settings.include_packback,
        include_op: settings.include_op,
        op_rate: settings.op_rate,
        include_contingency: false,
        contingency_rate: 0,
        region: settings.region,
        special_items: allSpecialItems,
        custom_special_items: allCustomSpecialItems,
      });
      onEstimateResult(result);
      message.success('Estimate generated successfully!');
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? 'Failed to generate estimate.';
      message.error(msg);
    } finally {
      setGeneratingEstimate(false);
    }
  }, [analyzedRooms, settings, onEstimateResult]);

  // ── Step definitions ───────────────────────────────────────────────────

  const steps = [
    { title: 'Details', description: 'Client & settings', icon: <UserOutlined /> },
    { title: 'Rooms', description: 'Photos & analysis', icon: <CameraOutlined /> },
    { title: 'Review', description: 'Generate estimate', icon: <FileTextOutlined /> },
  ];

  const canGoNext = () => {
    if (currentStep === 1) return analyzedRooms.length > 0;
    return true;
  };

  const handleNext = () => {
    if (!canGoNext()) {
      if (currentStep === 1) {
        if (photoRooms.length === 0) {
          message.warning('Add at least one room to continue.');
        } else {
          message.warning('Analyze at least one room before continuing.');
        }
      }
      return;
    }
    setCurrentStep((s) => Math.min(s + 1, steps.length - 1));
  };

  const handleBack = () => setCurrentStep((s) => Math.max(s - 1, 0));

  const handleStepClick = (idx: number) => {
    if (idx > currentStep && idx >= 2 && analyzedRooms.length === 0) {
      message.warning('Analyze at least one room first.');
      return;
    }
    setCurrentStep(idx);
  };

  // ── Step 2: Rooms & Photos content ────────────────────────────────────
  const renderStepRooms = () => (
    <div>
      {/* Import toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <div style={{ flex: 1, display: 'flex' }}>
          <div style={{ width: '100%' }}>
            <AddRoomPanel presets={presets} presetsLoading={presetsLoading} onAddRoom={addRoom} />
          </div>
        </div>
        <Tooltip title="Import rooms from folder">
          <Button
            icon={<FolderOpenOutlined />}
            onClick={() => setFolderModalOpen(true)}
            style={{
              flexShrink: 0,
              fontSize: 13,
              fontWeight: 500,
              height: 'auto',
              borderRadius: borderRadius.lg,
            }}
          >
            Import
          </Button>
        </Tooltip>
      </div>

      {photoRooms.length === 0 ? (
        <Card
          style={{ borderRadius: borderRadius.lg, border: `1px solid ${colors.border}`, textAlign: 'center' }}
          bodyStyle={{ padding: '48px 24px' }}
        >
          <CameraOutlined style={{ fontSize: 40, color: colors.textMuted, marginBottom: 12 }} />
          <Title level={5} style={{ color: colors.textSecondary, fontFamily: fonts.heading, marginBottom: 8 }}>
            No Rooms Added
          </Title>
          <Text style={{ color: colors.textMuted, fontSize: 13, fontFamily: fonts.body }}>
            Add a room above, upload photos, or import a folder to get started.
          </Text>
        </Card>
      ) : (
        <>
          {/* Batch progress bar (only visible during batch analysis or when unanalyzed rooms exist) */}
          {batchState.isRunning && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
                padding: '8px 12px',
                background: colors.bgLight,
                borderRadius: borderRadius.md,
                border: `1px solid ${colors.border}`,
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                <LoadingOutlined style={{ fontSize: 14, color: colors.primary }} />
                <Text style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, fontFamily: fonts.heading }}>
                  Analyzing {batchState.completedRooms}/{batchState.totalRooms} rooms...
                </Text>
                <div
                  style={{
                    width: 80,
                    height: 4,
                    borderRadius: 2,
                    background: colors.border,
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: `${batchState.totalRooms > 0 ? (batchState.completedRooms / batchState.totalRooms) * 100 : 0}%`,
                      height: '100%',
                      background: colors.primary,
                      borderRadius: 2,
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>
              <Button
                size="small"
                icon={<CloseOutlined />}
                onClick={handleBatchCancel}
                style={{ fontSize: 12, flexShrink: 0 }}
              >
                Cancel
              </Button>
            </div>
          )}
          {!batchState.isRunning && unanalyzedWithPhotos.length > 0 && (
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
              <Tooltip title={`Analyze ${unanalyzedWithPhotos.length} unanalyzed room${unanalyzedWithPhotos.length !== 1 ? 's' : ''}`}>
                <Button
                  size="small"
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  onClick={handleBatchAnalyze}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    background: colors.primary,
                    borderColor: colors.primary,
                  }}
                >
                  Analyze All ({unanalyzedWithPhotos.length})
                </Button>
              </Tooltip>
            </div>
          )}

          {/* Batch failure summary */}
          {!batchState.isRunning && batchState.failedRooms.length > 0 && (
            <div
              style={{
                marginBottom: 12,
                padding: '8px 12px',
                background: colors.error + '08',
                border: `1px solid ${colors.error}33`,
                borderRadius: borderRadius.md,
                fontSize: 12,
                color: colors.error,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <ExclamationCircleOutlined /> {batchState.failedRooms.length} room{batchState.failedRooms.length !== 1 ? 's' : ''} failed analysis
              </div>
              {batchState.failedRooms.map((f) => (
                <div key={f.id} style={{ marginLeft: 18, color: colors.textSecondary }}>
                  {f.name}: {f.error}
                </div>
              ))}
            </div>
          )}

          {photoRooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              editingCell={editingCell}
              onUpdate={updateRoom}
              onDelete={deleteRoom}
              onAnalyze={handleAnalyze}
              onCancelAnalyze={handleCancelAnalyze}
              onStartEdit={setEditingCell}
              onCommitEdit={handleCommitEdit}
              onCancelEdit={() => setEditingCell(null)}
              onAddPhoto={handleAddPhotos}
              onRemovePhoto={handleRemovePhoto}
              onAddItem={handleAddItem}
              onDeleteItem={handleDeleteItem}
              analysisFailed={batchState.failedRooms.some((f) => f.id === room.id)}
            />
          ))}
        </>
      )}

      {/* Folder Import Modal */}
      <FolderImportModal
        open={folderModalOpen}
        onClose={() => setFolderModalOpen(false)}
        onRoomsCreated={handleBulkAddRooms}
        existingRoomNames={photoRooms.map((r) => r.room_name)}
        gDrive={gDrive.isAvailable ? gDrive : undefined}
      />
    </div>
  );

  // ── Step 3: Review & Generate ─────────────────────────────────────────
  const renderStepReview = () => {
    const statCard = (label: string, value: string | number) => (
      <Card
        size="small"
        style={{ borderRadius: borderRadius.md, border: `1.5px solid ${colors.border}`, textAlign: 'center', height: '100%' }}
        styles={{ body: { padding: '14px 10px', height: '100%', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center' } }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, fontFamily: fonts.heading, color: colors.textPrimary, lineHeight: 1.3, wordBreak: 'keep-all' }}>
          {value}
        </div>
        <div style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>{label}</div>
      </Card>
    );

    const allSpecialItems = [...new Set(analyzedRooms.flatMap((r) => r.special_items))];
    const allCustomSpecialItems = analyzedRooms.flatMap((r) => r.custom_special_items);
    const totalSpecialCount = allSpecialItems.length + allCustomSpecialItems.length;

    // Compute meaningful stats from analyzed rooms
    // Room-based labor estimate matching backend classify_labor_hours logic
    const ROOM_BASE_PH: Record<string, number> = { small: 2.0, large: 5.5, xlarge: 9.0 };
    const DENSITY_MULT: Record<string, number> = { light: 0.7, normal: 1.0, dense: 1.3, heavy: 1.6, extreme: 2.5 };
    const FLOOR_MULT: Record<string, number> = { basement: 1.1, '1st': 1.0, '2nd': 1.15, '3rd': 1.25, '4th+': 1.4 };

    const getRoomSize = (r: PhotoRoom): string => {
      const name = (r.room_name || '').toLowerCase();
      if (['bath', 'closet', 'pantry', 'laundry', 'half'].some((k) => name.includes(k))) return 'small';
      if (['master', 'basement', 'garage', 'attic', 'family'].some((k) => name.includes(k))) return 'xlarge';
      return 'large';
    };

    let reviewHvCount = 0;
    let reviewFragileCount = 0;
    let reviewLaborPH = 0;
    analyzedRooms.forEach((r) => {
      const items = r.items || [];
      items.forEach((i) => {
        if (i.is_high_value) reviewHvCount += 1;
        if (i.is_fragile) reviewFragileCount += 1;
      });
      // Room-based labor calculation
      const size = getRoomSize(r);
      let basePH = ROOM_BASE_PH[size] ?? 5.5;
      if (r.density === 'light' && size === 'small') basePH = 0.5;
      const dm = DENSITY_MULT[r.density] ?? 1.0;
      const fm = FLOOR_MULT[r.floor] ?? 1.0;
      let roomPH = basePH * dm * fm;
      // Content type modifier (simplified)
      const total = items.length;
      if (total > 0) {
        const fragileRatio = items.filter((i) => i.is_fragile || i.category === 'Kitchenware' || i.category === 'Fragile').length / total;
        const furnitureRatio = items.filter((i) => i.category === 'Furniture').length / total;
        if (fragileRatio >= 0.3) roomPH *= 1.4;
        else if (furnitureRatio >= 0.3) roomPH *= 1.3;
      }
      reviewLaborPH += roomPH;
    });
    // Convert person-hours to elapsed hours (divide by crew)
    const reviewElapsedHrs = Math.round((reviewLaborPH / (settings.crew_size || 4)) * 10) / 10;
    const reviewLaborDisplay = reviewElapsedHrs;

    return (
      <div>
        <h3 style={{ fontFamily: fonts.heading, fontSize: 16, fontWeight: 700, color: colors.textPrimary, marginBottom: 4 }}>
          Review & Generate
        </h3>
        <p style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 24 }}>
          Confirm your selections below, then click Generate to create the estimate.
        </p>

        <Row gutter={[12, 12]} style={{ marginBottom: 28 }}>
          <Col span={12}>{statCard('Rooms', analyzedRooms.length)}</Col>
          <Col span={12}>{statCard('Est. Labor', reviewLaborDisplay > 0 ? `${reviewLaborDisplay} hrs` : '\u2014')}</Col>
          <Col span={12}>{statCard('Crew Size', `${settings.crew_size} workers`)}</Col>
          <Col span={12}>{statCard('Region', REGION_OPTIONS.find((r) => r.value === settings.region)?.label ?? settings.region)}</Col>
        </Row>

        {/* High-value & Fragile summary */}
        {(reviewHvCount > 0 || reviewFragileCount > 0) && (
          <div style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
            {reviewHvCount > 0 && (
              <span style={{ color: '#b45309' }}>
                {reviewHvCount} high-value item{reviewHvCount !== 1 ? 's' : ''}
              </span>
            )}
            {reviewFragileCount > 0 && (
              <span style={{ color: '#dc2626' }}>
                {reviewFragileCount} fragile item{reviewFragileCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        {/* Client + Rooms side by side */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {/* Client info preview */}
          {clientInfo.name && (
            <Card
              size="small"
              style={{ borderRadius: borderRadius.md, border: `1.5px solid ${colors.border}`, flex: '1 1 240px', minWidth: 240 }}
              styles={{ body: { padding: '12px 16px' } }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: colors.textMuted, marginBottom: 8 }}>CLIENT</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary }}>{clientInfo.name}</div>
              {clientInfo.property_address && (
                <div style={{ fontSize: 13, color: colors.textSecondary }}>{clientInfo.property_address}</div>
              )}
              {clientInfo.phone && (
                <div style={{ fontSize: 13, color: colors.textSecondary }}>{clientInfo.phone}</div>
              )}
              {clientInfo.email && (
                <div style={{ fontSize: 13, color: colors.textSecondary }}>{clientInfo.email}</div>
              )}
            </Card>
          )}

          {/* Rooms preview */}
          {analyzedRooms.length > 0 && (
            <Card
              size="small"
              style={{ borderRadius: borderRadius.md, border: `1.5px solid ${colors.border}`, flex: '1 1 240px', minWidth: 240 }}
              styles={{ body: { padding: '12px 16px' } }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: colors.textMuted, marginBottom: 8 }}>
                ANALYZED ROOMS ({analyzedRooms.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {analyzedRooms.map((room) => (
                  <Tag
                    key={room.id}
                    style={{
                      borderRadius: borderRadius.sm,
                      fontSize: 12,
                      border: `1px solid ${colors.border}`,
                      background: colors.bgLight,
                      color: colors.textPrimary,
                    }}
                  >
                    {room.room_name} {'\u00B7'} {room.floor} floor{room.density !== 'normal' ? ` \u00B7 ${room.density}` : ''}
                  </Tag>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Aggregated special items preview */}
        {totalSpecialCount > 0 && (
          <Card
            size="small"
            style={{ borderRadius: borderRadius.md, border: `1.5px solid ${colors.border}`, marginBottom: 20 }}
            styles={{ body: { padding: '12px 16px' } }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: colors.textMuted, marginBottom: 8 }}>
              SPECIAL ITEMS ({totalSpecialCount})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {allSpecialItems.map((key) => (
                <Tag
                  key={key}
                  style={{
                    borderRadius: borderRadius.sm,
                    fontSize: 12,
                    border: 'none',
                    background: colors.primary + '15',
                    color: colors.primary,
                  }}
                >
                  {key}
                </Tag>
              ))}
              {allCustomSpecialItems.map((item, idx) => (
                <Tag
                  key={`custom-${idx}`}
                  style={{
                    borderRadius: borderRadius.sm,
                    fontSize: 12,
                    border: `1px solid ${colors.border}`,
                    background: colors.bgLight,
                    color: colors.textPrimary,
                  }}
                >
                  {item.name} (${item.price.toFixed(0)})
                </Tag>
              ))}
            </div>
          </Card>
        )}

        {analyzedRooms.length === 0 && (
          <Alert
            type="warning"
            message="No analyzed rooms"
            description="Go back to Step 2 and analyze at least one room."
            showIcon
            style={{ borderRadius: borderRadius.md, marginBottom: 20 }}
          />
        )}

        <Button
          type="primary"
          size="large"
          icon={generatingEstimate ? <LoadingOutlined /> : <CalculatorOutlined />}
          loading={generatingEstimate}
          disabled={!canGenerate}
          onClick={handleGenerateEstimate}
          style={{
            width: '100%',
            height: 52,
            fontFamily: fonts.heading,
            fontWeight: 700,
            fontSize: 16,
            borderRadius: borderRadius.base,
            background: canGenerate ? colors.primary : undefined,
            borderColor: canGenerate ? colors.primary : undefined,
          }}
        >
          {generatingEstimate
            ? 'Generating…'
            : `Generate Estimate (${analyzedRooms.length} room${analyzedRooms.length !== 1 ? 's' : ''})`}
        </Button>
      </div>
    );
  };

  const isEditMode = !!_activeSessionId;

  // ── Edit mode: Rooms (left) + Review (right), stacks on narrow ──────

  if (isEditMode) {
    return (
      <div
        style={{
          width: '100%',
          padding: '20px 16px 32px',
          fontFamily: fonts.body,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: isNarrow ? 'column' : 'row',
          gap: isNarrow ? 0 : 24,
          alignItems: 'flex-start',
        }}
      >
        {/* Rooms - left side */}
        <div style={{ flex: '1 1 0%', minWidth: 0, width: isNarrow ? '100%' : undefined }}>
          {renderStepRooms()}
        </div>

        {isNarrow && <Divider />}

        {/* Review & Generate - right side (sticky on desktop) */}
        <div
          style={{
            width: isNarrow ? '100%' : 380,
            flexShrink: 0,
            position: isNarrow ? 'relative' : 'sticky',
            top: isNarrow ? undefined : 60,
          }}
        >
          {renderStepReview()}
        </div>
      </div>
    );
  }

  // ── Create mode: 3-step wizard ──────────────────────────────────────────

  const stepContent = [
    <SharedDetailsStep
      key="details"
      settings={settings}
      setSettings={setSettings}
      clientInfo={clientInfo}
      setClientInfo={setClientInfo}
      companyOverride={companyOverride}
      setCompanyOverride={setCompanyOverride}
    />,
    renderStepRooms(),
    renderStepReview(),
  ];

  return (
    <div
      style={{
        width: '100%',
        padding: '20px 16px 32px',
        fontFamily: fonts.body,
        boxSizing: 'border-box',
      }}
    >
      {/* Step Indicator */}
      <div style={{ marginBottom: 28 }}>
        <Steps
          current={currentStep}
          onChange={handleStepClick}
          items={steps.map((s, idx) => ({
            title: (
              <span style={{ fontFamily: fonts.heading, fontWeight: currentStep === idx ? 700 : 500, fontSize: 13 }}>
                {s.title}
              </span>
            ),
            description: (
              <span style={{ fontSize: 11, color: colors.textMuted }}>{s.description}</span>
            ),
            icon: s.icon,
          }))}
          size="small"
          style={{ maxWidth: 600 }}
        />
      </div>

      {/* Step Content */}
      <div style={{ minHeight: 300 }}>{stepContent[currentStep]}</div>

      {/* Navigation */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 32,
          paddingTop: 20,
          borderTop: `1px solid ${colors.border}`,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <Button
          size="large"
          onClick={handleBack}
          disabled={currentStep === 0}
          style={{ minWidth: 100, borderRadius: borderRadius.base, fontWeight: 600 }}
        >
          Back
        </Button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {steps.map((_, idx) => (
            <div
              key={idx}
              style={{
                width: idx === currentStep ? 20 : 8,
                height: 8,
                borderRadius: borderRadius.full,
                background: idx === currentStep ? colors.primary : colors.border,
                transition: 'all 0.2s ease',
                cursor: 'pointer',
              }}
              onClick={() => handleStepClick(idx)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && handleStepClick(idx)}
              aria-label={`Go to step ${idx + 1}: ${steps[idx].title}`}
              aria-current={idx === currentStep ? 'step' : undefined}
            />
          ))}
        </div>

        {currentStep < steps.length - 1 ? (
          <Button
            type="primary"
            size="large"
            onClick={handleNext}
            style={{
              minWidth: 100,
              borderRadius: borderRadius.base,
              fontWeight: 600,
              background: colors.primary,
              borderColor: colors.primary,
            }}
          >
            Next
          </Button>
        ) : (
          <div style={{ minWidth: 100 }} />
        )}
      </div>
    </div>
  );
};
