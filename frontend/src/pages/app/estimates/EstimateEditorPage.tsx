/**
 * ScopeIt - Estimate Editor Page
 * Section-based line item management with multi-select, copy/paste, drag & drop
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  Input,
  InputNumber,
  Select,
  Checkbox,
  Dropdown,
  Modal,
  Form,
  DatePicker,
  Divider,
  Tooltip,
  List,
  Empty,
  Tag,
  Spin,
  AutoComplete,
  App,
} from 'antd';
import {
  PlusOutlined,
  SaveOutlined,
  ArrowLeftOutlined,
  MoreOutlined,
  HolderOutlined,
  DeleteOutlined,
  CopyOutlined,
  ScissorOutlined,
  CaretDownOutlined,
  CaretRightOutlined,
  CloseOutlined,
  SearchOutlined,
  FileTextOutlined,
  AppstoreAddOutlined,
  EyeOutlined,
  EditOutlined,
} from '@ant-design/icons';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion, AnimatePresence } from 'framer-motion';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { colors, fonts } from '@/styles/theme';
import { CustomerSelector, CustomerData } from '@/components/features/CustomerSelector';
import { lineItemService } from '@/services/lineItemService';
import { estimateService } from '@/services/estimateService';
import { settingsService } from '@/services/settingsService';
import { useIsMobile } from '@/hooks/useIsMobile';
import { MobileLineItemDrawer, MobileLineItemCard } from '@/components/common/MobileLineItemDrawer';
import { PdfPreviewModal } from '@/components/features/PdfPreviewModal';
import type { LineItem, LineItemNote, PdfTemplateInfo, PdfTemplateId } from '@/types/entities';

// Types
interface LineItemData {
  id: string;
  sectionId: string;
  lineItemId?: string; // Reference to library item
  name: string;
  description?: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  isTaxable: boolean;
  orderIndex: number;
  notes?: string[]; // Selected notes for this item
}

interface SectionData {
  id: string;
  name: string;
  isCollapsed: boolean;
  orderIndex: number;
}

// Generate unique ID
const generateId = () => Math.random().toString(36).substr(2, 9);

// Sortable Line Item Row
const SortableLineItem: React.FC<{
  item: LineItemData;
  isSelected: boolean;
  onToggleSelect: () => void;
  onUpdate: (updates: Partial<LineItemData>) => void;
  onDelete: () => void;
  onManageNotes: () => void;
  onEdit: () => void;
}> = ({ item, isSelected, onToggleSelect, onUpdate, onDelete, onManageNotes, onEdit }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const total = item.quantity * item.unitPrice;
  const hasNotes = item.notes && item.notes.length > 0;

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: isSelected ? '#eff6ff' : colors.bgWhite,
        borderBottom: `1px solid ${colors.border}`,
        transition: 'background 0.15s ease',
      }}
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        style={{ cursor: 'grab', color: colors.textMuted, padding: 4 }}
      >
        <HolderOutlined />
      </div>

      {/* Checkbox */}
      <Checkbox checked={isSelected} onChange={onToggleSelect} />

      {/* Name */}
      <div style={{ flex: 2 }}>
        <Input
          value={item.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="Item name"
          variant="borderless"
          style={{ fontWeight: 500 }}
        />
        {item.description && (
          <div style={{ fontSize: 12, color: colors.textSecondary, paddingLeft: 11 }}>
            {item.description}
          </div>
        )}
      </div>

      {/* Notes Button */}
      <Tooltip title={hasNotes ? `${item.notes!.length} note(s) attached` : 'Add notes'}>
        <Button
          type="text"
          size="small"
          icon={<FileTextOutlined />}
          onClick={onManageNotes}
          style={{ color: hasNotes ? colors.primary : colors.textMuted }}
        >
          {hasNotes ? item.notes!.length : ''}
        </Button>
      </Tooltip>

      {/* Quantity */}
      <div style={{ width: 80 }}>
        <InputNumber
          value={item.quantity}
          onChange={(val) => onUpdate({ quantity: val ?? 0 })}
          min={0}
          style={{ width: '100%' }}
        />
      </div>

      {/* Unit */}
      <div style={{ width: 80 }}>
        <AutoComplete
          value={item.unit}
          onChange={(val) => onUpdate({ unit: val })}
          style={{ width: '100%' }}
          options={[
            { value: 'EA', label: 'EA' },
            { value: 'SF', label: 'SF' },
            { value: 'LF', label: 'LF' },
            { value: 'HR', label: 'HR' },
            { value: 'DAY', label: 'DAY' },
          ]}
          filterOption={(input, option) =>
            option?.label?.toString().toLowerCase().includes(input.toLowerCase()) ?? false
          }
        />
      </div>

      {/* Unit Price */}
      <div style={{ width: 100 }}>
        <InputNumber
          value={item.unitPrice}
          onChange={(val) => onUpdate({ unitPrice: val ?? 0 })}
          min={0}
          precision={2}
          prefix="$"
          style={{ width: '100%' }}
        />
      </div>

      {/* Total */}
      <div style={{ width: 100, textAlign: 'right' }}>
        <div style={{ fontWeight: 600 }}>${total.toFixed(2)}</div>
        {!item.isTaxable && (
          <div style={{ fontSize: 10, color: colors.textMuted }}>Non-tax</div>
        )}
      </div>

      {/* Edit */}
      <Tooltip title="Edit item details">
        <Button
          type="text"
          icon={<EditOutlined />}
          onClick={onEdit}
          style={{ color: colors.textMuted }}
          size="small"
        />
      </Tooltip>

      {/* Delete */}
      <Button
        type="text"
        icon={<DeleteOutlined />}
        onClick={onDelete}
        style={{ color: colors.textMuted }}
        size="small"
      />
    </div>
  );
};

// Section Component
const Section: React.FC<{
  section: SectionData;
  items: LineItemData[];
  selectedIds: Set<string>;
  clipboardCount: number;
  onToggleCollapse: () => void;
  onUpdateSection: (updates: Partial<SectionData>) => void;
  onDeleteSection: () => void;
  onAddItem: () => void;
  onAddFromLibrary: () => void;
  onPasteHere: () => void;
  onToggleSelect: (itemId: string) => void;
  onSelectAllInSection: () => void;
  onUpdateItem: (itemId: string, updates: Partial<LineItemData>) => void;
  onDeleteItem: (itemId: string) => void;
  onManageItemNotes: (itemId: string) => void;
  // Mobile props
  isMobile?: boolean;
  onMobileAddItem?: () => void;
  onMobileEditItem?: (item: LineItemData) => void;
}> = ({
  section,
  items,
  selectedIds,
  clipboardCount,
  onToggleCollapse,
  onUpdateSection,
  onDeleteSection,
  onAddItem,
  onAddFromLibrary,
  onPasteHere,
  onToggleSelect,
  onSelectAllInSection,
  onUpdateItem,
  onDeleteItem,
  onManageItemNotes,
  isMobile = false,
  onMobileAddItem,
  onMobileEditItem,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const allSelected = items.length > 0 && items.every((item) => selectedIds.has(item.id));
  const someSelected = items.some((item) => selectedIds.has(item.id));

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: section.id, data: { type: 'section' } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card
        style={{
          borderRadius: 8,
          marginBottom: 12,
          overflow: 'hidden',
        }}
        styles={{ body: { padding: 0 } }}
      >
        {/* Section Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            background: colors.bgLight,
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          {/* Drag Handle */}
          <div
            {...attributes}
            {...listeners}
            style={{ cursor: 'grab', color: colors.textMuted }}
          >
            <HolderOutlined />
          </div>

          {/* Select All Checkbox */}
          <Checkbox
            checked={allSelected}
            indeterminate={someSelected && !allSelected}
            onChange={onSelectAllInSection}
          />

          {/* Collapse Toggle */}
          <Button
            type="text"
            size="small"
            icon={section.isCollapsed ? <CaretRightOutlined /> : <CaretDownOutlined />}
            onClick={onToggleCollapse}
          />

          {/* Section Name */}
          {isEditing ? (
            <Input
              value={section.name}
              onChange={(e) => onUpdateSection({ name: e.target.value })}
              onBlur={() => setIsEditing(false)}
              onPressEnter={() => setIsEditing(false)}
              autoFocus
              style={{ width: 200 }}
            />
          ) : (
            <span
              style={{
                fontFamily: fonts.heading,
                fontWeight: 600,
                cursor: 'pointer',
              }}
              onClick={() => setIsEditing(true)}
            >
              {section.name}
            </span>
          )}

          {/* Subtotal */}
          <span style={{ marginLeft: 'auto', fontWeight: 600 }}>
            ${subtotal.toFixed(2)}
          </span>

          {/* Add Buttons */}
          <Dropdown
            menu={{
              items: [
                {
                  key: 'new',
                  icon: <PlusOutlined />,
                  label: 'Add Blank Item',
                  onClick: isMobile && onMobileAddItem ? onMobileAddItem : onAddItem,
                },
                {
                  key: 'library',
                  icon: <AppstoreAddOutlined />,
                  label: 'Add from Library',
                  onClick: onAddFromLibrary,
                },
                ...(clipboardCount > 0
                  ? [
                      { type: 'divider' as const },
                      {
                        key: 'paste',
                        icon: <CopyOutlined />,
                        label: `Paste ${clipboardCount} item${clipboardCount !== 1 ? 's' : ''} here`,
                        onClick: onPasteHere,
                      },
                    ]
                  : []),
              ],
            }}
            trigger={['click']}
          >
            <Button type="text" icon={<PlusOutlined />} size="small">
              Add Item
            </Button>
          </Dropdown>

          {/* More Menu */}
          <Dropdown
            menu={{
              items: [
                { key: 'rename', label: 'Rename Section', onClick: () => setIsEditing(true) },
                { type: 'divider' },
                { key: 'delete', label: 'Delete Section', danger: true, onClick: onDeleteSection },
              ],
            }}
            trigger={['click']}
          >
            <Button type="text" icon={<MoreOutlined />} size="small" />
          </Dropdown>
        </div>

        {/* Section Items */}
        {!section.isCollapsed && (
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {items.length > 0 ? (
              isMobile ? (
                // Mobile: Card-based items with tap to edit
                items.map((item) => (
                  <MobileLineItemCard
                    key={item.id}
                    item={item as any}
                    isSelected={selectedIds.has(item.id)}
                    onSelect={() => onToggleSelect(item.id)}
                    onTap={() => onMobileEditItem?.(item)}
                  />
                ))
              ) : (
                // Desktop: Inline editable items
                items.map((item) => (
                  <SortableLineItem
                    key={item.id}
                    item={item}
                    isSelected={selectedIds.has(item.id)}
                    onToggleSelect={() => onToggleSelect(item.id)}
                    onUpdate={(updates) => onUpdateItem(item.id, updates)}
                    onDelete={() => onDeleteItem(item.id)}
                    onManageNotes={() => onManageItemNotes(item.id)}
                    onEdit={() => onMobileEditItem?.(item)}
                  />
                ))
              )
            ) : (
              <div
                style={{
                  padding: 32,
                  textAlign: 'center',
                  color: colors.textMuted,
                }}
              >
                No items in this section.{' '}
                <Button type="link" onClick={isMobile ? onMobileAddItem : onAddItem} style={{ padding: 0 }}>
                  Add one
                </Button>
                {' or '}
                <Button type="link" onClick={onAddFromLibrary} style={{ padding: 0 }}>
                  add from library
                </Button>
              </div>
            )}
          </SortableContext>
        )}
      </Card>
    </div>
  );
};

// Bulk Action Bar
const BulkActionBar: React.FC<{
  selectedCount: number;
  clipboardCount: number;
  clipboardOperation: 'copy' | 'cut' | null;
  onCopy: () => void;
  onCut: () => void;
  onDelete: () => void;
  onMove: () => void;
  onPaste: () => void;
  onDeselect: () => void;
  isMobile?: boolean;
}> = ({ selectedCount, clipboardCount, clipboardOperation, onCopy, onCut, onDelete, onMove, onPaste, onDeselect, isMobile }) => {
  const hasClipboard = clipboardCount > 0;
  const hasSelection = selectedCount > 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: 'spring', damping: 25 }}
        style={{
          position: 'fixed',
          bottom: isMobile ? 16 : 24,
          left: isMobile ? 16 : '50%',
          right: isMobile ? 16 : 'auto',
          transform: isMobile ? 'none' : 'translateX(-50%)',
          background: '#111827',
          borderRadius: 12,
          padding: isMobile ? '10px 12px' : '12px 20px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isMobile ? 'space-between' : 'flex-start',
          gap: isMobile ? 8 : 16,
          zIndex: 1000,
        }}
      >
        {hasSelection && (
          <>
            <span style={{ color: '#fff', fontWeight: 600, fontSize: isMobile ? 13 : 14, whiteSpace: 'nowrap' }}>
              {selectedCount} selected
            </span>

            <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.2)' }} />

            <Tooltip title="Copy (Ctrl+C)">
              <Button
                type="text"
                icon={<CopyOutlined style={{ color: '#fff' }} />}
                onClick={onCopy}
                size={isMobile ? 'small' : 'middle'}
              />
            </Tooltip>

            <Tooltip title="Cut (Ctrl+X)">
              <Button
                type="text"
                icon={<ScissorOutlined style={{ color: '#fff' }} />}
                onClick={onCut}
                size={isMobile ? 'small' : 'middle'}
              />
            </Tooltip>

            <Tooltip title="Move to Section">
              <Button
                type="text"
                onClick={onMove}
                style={{ color: '#fff', padding: isMobile ? '0 4px' : undefined }}
                size={isMobile ? 'small' : 'middle'}
              >
                Move
              </Button>
            </Tooltip>

            <Tooltip title="Delete">
              <Button
                type="text"
                icon={<DeleteOutlined style={{ color: '#ef4444' }} />}
                onClick={onDelete}
                size={isMobile ? 'small' : 'middle'}
              />
            </Tooltip>
          </>
        )}

        {hasClipboard && (
          <>
            {hasSelection && <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.2)' }} />}

            <Tooltip title={`Paste ${clipboardCount} item${clipboardCount > 1 ? 's' : ''} (Ctrl+V)`}>
              <Button
                type="text"
                onClick={onPaste}
                style={{
                  color: '#10b981',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
                size={isMobile ? 'small' : 'middle'}
              >
                <span style={{
                  background: clipboardOperation === 'cut' ? '#f59e0b' : '#10b981',
                  color: '#fff',
                  borderRadius: 10,
                  padding: '2px 8px',
                  fontSize: 11,
                  fontWeight: 700,
                }}>
                  {clipboardCount}
                </span>
                Paste{clipboardOperation === 'cut' ? ' (Cut)' : ''}
              </Button>
            </Tooltip>
          </>
        )}

        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.2)' }} />

        <Button
          type="text"
          icon={<CloseOutlined style={{ color: '#fff' }} />}
          onClick={onDeselect}
          size={isMobile ? 'small' : 'middle'}
        />
      </motion.div>
    </AnimatePresence>
  );
};

// Line Item Library Modal
const LineItemLibraryModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onSelectItem: (item: LineItem, selectedNotes: string[]) => void;
}> = ({ open, onClose, onSelectItem }) => {
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<LineItem | null>(null);
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());

  // Fetch line items
  const { data, isLoading } = useQuery({
    queryKey: ['lineItems', { search }],
    queryFn: () => lineItemService.list({ search: search || undefined }),
    enabled: open,
  });

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!open) {
      setSearch('');
      setSelectedItem(null);
      setSelectedNotes(new Set());
    }
  }, [open]);

  const handleSelectItem = (item: LineItem) => {
    setSelectedItem(item);
    // Pre-select all notes by default
    if (item.notes && item.notes.length > 0) {
      setSelectedNotes(new Set(item.notes.map((n) => n.content)));
    } else {
      setSelectedNotes(new Set());
    }
  };

  const handleToggleNote = (noteContent: string) => {
    setSelectedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(noteContent)) {
        next.delete(noteContent);
      } else {
        next.add(noteContent);
      }
      return next;
    });
  };

  const handleAdd = () => {
    if (selectedItem) {
      onSelectItem(selectedItem, Array.from(selectedNotes));
      setSelectedItem(null);
      setSelectedNotes(new Set());
    }
  };

  return (
    <Modal
      title="Add Item from Library"
      open={open}
      onCancel={onClose}
      width={700}
      footer={null}
      styles={{ body: { paddingTop: 20 } }}
    >
      <div style={{ display: 'flex', gap: 16, minHeight: 400 }}>
        {/* Left: Search and List */}
        <div style={{ flex: 1, borderRight: `1px solid ${colors.border}`, paddingRight: 16 }}>
          <Input
            placeholder="Search line items..."
            prefix={<SearchOutlined style={{ color: colors.textMuted }} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ marginBottom: 16 }}
            allowClear
          />

          <Spin spinning={isLoading}>
            {data?.items && data.items.length > 0 ? (
              <List
                dataSource={data.items}
                style={{ maxHeight: 350, overflow: 'auto' }}
                renderItem={(item) => (
                  <List.Item
                    key={item.id}
                    onClick={() => handleSelectItem(item)}
                    style={{
                      cursor: 'pointer',
                      padding: '12px',
                      borderRadius: 8,
                      marginBottom: 4,
                      background: selectedItem?.id === item.id ? '#eff6ff' : 'transparent',
                      border: selectedItem?.id === item.id ? `1px solid ${colors.primary}` : '1px solid transparent',
                    }}
                  >
                    <div style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 500 }}>{item.name}</span>
                        <span style={{ fontWeight: 600 }}>${Number(item.unitPrice || 0).toFixed(2)}</span>
                      </div>
                      {item.includes && (
                        <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                          {item.includes}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        {item.cat && (
                          <Tag style={{ border: 'none', background: colors.bgLight, fontSize: 11 }}>
                            {item.cat}
                          </Tag>
                        )}
                        {item.notes && item.notes.length > 0 && (
                          <Tag style={{ border: 'none', background: '#dbeafe', color: colors.primary, fontSize: 11 }}>
                            <FileTextOutlined /> {item.notes.length} notes
                          </Tag>
                        )}
                      </div>
                    </div>
                  </List.Item>
                )}
              />
            ) : (
              <Empty
                description={search ? 'No items found' : 'No line items in library'}
                style={{ marginTop: 60 }}
              />
            )}
          </Spin>
        </div>

        {/* Right: Selected Item Details */}
        <div style={{ width: 280 }}>
          {selectedItem ? (
            <>
              <h4 style={{ fontFamily: fonts.heading, fontWeight: 600, marginBottom: 8 }}>
                {selectedItem.name}
              </h4>
              {selectedItem.includes && (
                <p style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 16 }}>
                  {selectedItem.includes}
                </p>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: colors.textSecondary }}>Unit:</span>
                <span>{selectedItem.unit || 'EA'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <span style={{ color: colors.textSecondary }}>Unit Price:</span>
                <span style={{ fontWeight: 600 }}>${Number(selectedItem.unitPrice || 0).toFixed(2)}</span>
              </div>

              {selectedItem.notes && selectedItem.notes.length > 0 && (
                <>
                  <Divider style={{ margin: '12px 0' }} />
                  <h5 style={{ fontWeight: 600, marginBottom: 8 }}>
                    Select Notes to Include:
                  </h5>
                  <div style={{ maxHeight: 200, overflow: 'auto' }}>
                    {selectedItem.notes.map((note: LineItemNote) => (
                      <div
                        key={note.id}
                        style={{
                          display: 'flex',
                          gap: 8,
                          padding: '8px',
                          background: colors.bgLight,
                          borderRadius: 6,
                          marginBottom: 6,
                        }}
                      >
                        <Checkbox
                          checked={selectedNotes.has(note.content)}
                          onChange={() => handleToggleNote(note.content)}
                        />
                        <span style={{ fontSize: 13 }}>{note.content}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <Button
                type="primary"
                block
                onClick={handleAdd}
                style={{ marginTop: 16, background: colors.primary }}
              >
                Add to Estimate
              </Button>
            </>
          ) : (
            <div style={{ textAlign: 'center', color: colors.textMuted, marginTop: 100 }}>
              Select an item from the list
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

// Item Notes Modal
const ItemNotesModal: React.FC<{
  open: boolean;
  item: LineItemData | null;
  onClose: () => void;
  onSave: (notes: string[]) => void;
}> = ({ open, item, onClose, onSave }) => {
  const [notes, setNotes] = useState<string[]>([]);
  const [newNote, setNewNote] = useState('');
  const isMobile = useIsMobile();

  useEffect(() => {
    if (item) {
      setNotes(item.notes || []);
    }
  }, [item]);

  const handleAddNote = () => {
    if (newNote.trim()) {
      setNotes([...notes, newNote.trim()]);
      setNewNote('');
    }
  };

  const handleDeleteNote = (index: number) => {
    setNotes(notes.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    onSave(notes);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && newNote.trim()) {
      e.preventDefault();
      handleAddNote();
    }
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <FileTextOutlined style={{ flexShrink: 0 }} />
          <span style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            Notes: {item?.name}
          </span>
        </div>
      }
      open={open}
      onCancel={onClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onClose} style={{ flex: isMobile ? 1 : undefined }}>Cancel</Button>
          <Button type="primary" onClick={handleSave} style={{ background: colors.primary, flex: isMobile ? 1 : undefined }}>
            Save Notes
          </Button>
        </div>
      }
      width={isMobile ? '100%' : 500}
      style={isMobile ? { top: 20, maxWidth: 'calc(100vw - 32px)', margin: '0 auto' } : undefined}
      styles={isMobile ? { body: { padding: '16px', maxHeight: 'calc(100vh - 180px)', overflowY: 'auto' } } : undefined}
    >
      <div style={{ marginBottom: 20 }}>
        <Input.TextArea
          placeholder="Add a note..."
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          style={{ marginBottom: 8 }}
        />
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'stretch' : 'center',
          gap: isMobile ? 12 : 8
        }}>
          <span style={{ fontSize: 12, color: colors.textSecondary, order: isMobile ? 2 : 1 }}>
            Notes will appear on the document for this item.
          </span>
          <Button
            type="primary"
            size={isMobile ? 'middle' : 'small'}
            onClick={handleAddNote}
            disabled={!newNote.trim()}
            style={{ background: colors.primary, order: isMobile ? 1 : 2, flexShrink: 0 }}
          >
            Add Note
          </Button>
        </div>
      </div>

      {notes.length > 0 && (
        <>
          <Divider style={{ margin: '0 0 16px 0' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {notes.map((note, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  background: colors.bgLight,
                  borderRadius: 8,
                  padding: '12px 16px',
                }}
              >
                <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: 1 }}>
                  {note}
                </div>
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  danger
                  onClick={() => handleDeleteNote(index)}
                  style={{ marginLeft: 8, flexShrink: 0 }}
                />
              </div>
            ))}
          </div>
        </>
      )}

      {notes.length === 0 && (
        <div style={{ textAlign: 'center', color: colors.textSecondary, padding: '20px 0' }}>
          No notes added yet.
        </div>
      )}
    </Modal>
  );
};

// Main Editor Page
const EstimateEditorPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEditing = Boolean(id);
  const isMobile = useIsMobile();
  const { message } = App.useApp();

  // Form state
  const [customerData, setCustomerData] = useState<CustomerData>({
    customerId: undefined,
    name: '',
    email: '',
    phone: '',
    address: '',
  });
  const [title, setTitle] = useState('');
  const [estimateDate, setEstimateDate] = useState(dayjs());
  const [validUntil, setValidUntil] = useState(dayjs().add(30, 'days'));
  const [taxRate, setTaxRate] = useState(0);
  const [notes, setNotes] = useState('');

  // Sections and Items
  const [sections, setSections] = useState<SectionData[]>([
    { id: generateId(), name: 'General', isCollapsed: false, orderIndex: 0 },
  ]);
  const [items, setItems] = useState<LineItemData[]>([]);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [clipboard, setClipboard] = useState<{ items: LineItemData[]; operation: 'copy' | 'cut' | null }>({
    items: [],
    operation: null,
  });

  // Modal state
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [libraryModalOpen, setLibraryModalOpen] = useState(false);
  const [libraryTargetSection, setLibraryTargetSection] = useState<string | null>(null);
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [notesTargetItem, setNotesTargetItem] = useState<LineItemData | null>(null);

  // Mobile drawer state
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [mobileEditItem, setMobileEditItem] = useState<LineItemData | null>(null);
  const [isNewMobileItem, setIsNewMobileItem] = useState(false);
  const [mobileEditSectionId, setMobileEditSectionId] = useState<string | null>(null);

  // PDF Preview state
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Fetch estimate data in edit mode
  const { data: estimateData, isLoading: isLoadingEstimate } = useQuery({
    queryKey: ['estimate', id],
    queryFn: () => estimateService.getById(id!),
    enabled: isEditing,
    retry: 1,
  });

  // Fetch PDF templates
  const { data: pdfTemplates = [], isLoading: isLoadingTemplates } = useQuery({
    queryKey: ['estimate-templates'],
    queryFn: () => estimateService.getTemplates(),
  });

  // Fetch units from Settings
  const { data: units = [] } = useQuery({
    queryKey: ['lineItemUnits'],
    queryFn: () => settingsService.units.list(),
  });

  // Available unit options
  const availableUnits = units.length > 0
    ? units.map((unit) => ({ value: unit.name, label: unit.label || unit.name }))
    : [
        { value: 'EA', label: 'EA' },
        { value: 'SF', label: 'SF' },
        { value: 'LF', label: 'LF' },
        { value: 'HR', label: 'HR' },
        { value: 'DAY', label: 'DAY' },
      ];

  // Load estimate data in edit mode
  useEffect(() => {
    if (estimateData) {
      // Customer data
      setCustomerData({
        customerId: estimateData.customerId,
        name: estimateData.customerName || '',
        email: estimateData.customerEmail || '',
        phone: '',
        address: estimateData.customerAddress || '',
      });

      // Estimate details
      setTitle(estimateData.title || '');
      setEstimateDate(dayjs(estimateData.estimateDate));

      if (estimateData.validUntil) {
        setValidUntil(dayjs(estimateData.validUntil));
      }

      setTaxRate(Number(estimateData.taxRate) || 0);
      setNotes(estimateData.notes || '');

      // Sections and items
      if (estimateData.sections && estimateData.sections.length > 0) {
        const loadedSections: SectionData[] = estimateData.sections.map((section) => ({
          id: section.id,
          name: section.name,
          isCollapsed: section.isCollapsed,
          orderIndex: section.orderIndex,
        }));
        setSections(loadedSections);

        const loadedItems: LineItemData[] = estimateData.sections.flatMap((section) =>
          section.items.map((item) => ({
            id: item.id,
            sectionId: section.id,
            lineItemId: item.lineItemId,
            name: item.name,
            description: item.description,
            unit: item.unit,
            quantity: Number(item.quantity) || 0,
            unitPrice: Number(item.unitPrice) || 0,
            isTaxable: item.isTaxable,
            orderIndex: item.orderIndex,
            notes: item.notes,
          }))
        );
        setItems(loadedItems);
      }
    }
  }, [estimateData]);

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const taxableSubtotal = items
    .filter((item) => item.isTaxable)
    .reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const taxAmount = taxableSubtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  // Selection handlers
  const toggleSelect = useCallback((itemId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  const selectAllInSection = useCallback((sectionId: string) => {
    const sectionItems = items.filter((i) => i.sectionId === sectionId);
    const allSelected = sectionItems.every((i) => selectedIds.has(i.id));

    setSelectedIds((prev) => {
      const next = new Set(prev);
      sectionItems.forEach((item) => {
        if (allSelected) {
          next.delete(item.id);
        } else {
          next.add(item.id);
        }
      });
      return next;
    });
  }, [items, selectedIds]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Section handlers
  const addSection = useCallback(() => {
    const newSection: SectionData = {
      id: generateId(),
      name: 'New Section',
      isCollapsed: false,
      orderIndex: sections.length,
    };
    setSections((prev) => [...prev, newSection]);
  }, [sections.length]);

  const updateSection = useCallback((sectionId: string, updates: Partial<SectionData>) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, ...updates } : s))
    );
  }, []);

  const deleteSection = useCallback((sectionId: string) => {
    // Delete section and its items
    setSections((prev) => prev.filter((s) => s.id !== sectionId));
    setItems((prev) => prev.filter((i) => i.sectionId !== sectionId));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      items.filter((i) => i.sectionId === sectionId).forEach((i) => next.delete(i.id));
      return next;
    });
  }, [items]);

  // Item handlers
  const addItem = useCallback((sectionId: string) => {
    const sectionItems = items.filter((i) => i.sectionId === sectionId);
    const newItem: LineItemData = {
      id: generateId(),
      sectionId,
      name: '',
      unit: 'EA',
      quantity: 1,
      unitPrice: 0,
      isTaxable: true,
      orderIndex: sectionItems.length,
    };
    setItems((prev) => [...prev, newItem]);
  }, [items]);

  const addItemFromLibrary = useCallback((libraryItem: LineItem, selectedNotes: string[], sectionId: string) => {
    const sectionItems = items.filter((i) => i.sectionId === sectionId);
    const newItem: LineItemData = {
      id: generateId(),
      sectionId,
      lineItemId: libraryItem.id,
      name: libraryItem.name,
      description: libraryItem.includes || undefined,
      unit: libraryItem.unit || 'EA',
      quantity: 1,
      unitPrice: Number(libraryItem.unitPrice) || 0,
      isTaxable: libraryItem.isTaxable,
      orderIndex: sectionItems.length,
      notes: selectedNotes.length > 0 ? selectedNotes : undefined,
    };
    setItems((prev) => [...prev, newItem]);
  }, [items]);

  const updateItem = useCallback((itemId: string, updates: Partial<LineItemData>) => {
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, ...updates } : i))
    );
  }, []);

  const deleteItem = useCallback((itemId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
  }, []);

  // Bulk actions
  const copySelected = useCallback(() => {
    const selectedItems = items.filter((i) => selectedIds.has(i.id));
    setClipboard({ items: selectedItems, operation: 'copy' });
    message.success(`${selectedItems.length} items copied`);
  }, [items, selectedIds]);

  const cutSelected = useCallback(() => {
    const selectedItems = items.filter((i) => selectedIds.has(i.id));
    setClipboard({ items: selectedItems, operation: 'cut' });
    message.success(`${selectedItems.length} items cut`);
  }, [items, selectedIds]);

  const deleteSelected = useCallback(() => {
    setItems((prev) => prev.filter((i) => !selectedIds.has(i.id)));
    setSelectedIds(new Set());
    message.success('Items deleted');
  }, [selectedIds]);

  const moveSelected = useCallback((targetSectionId: string) => {
    setItems((prev) =>
      prev.map((item) =>
        selectedIds.has(item.id) ? { ...item, sectionId: targetSectionId } : item
      )
    );
    setSelectedIds(new Set());
    setMoveModalOpen(false);
    message.success('Items moved');
  }, [selectedIds]);

  const pasteItems = useCallback((targetSectionId: string) => {
    if (!clipboard.items.length) return;

    if (clipboard.operation === 'copy') {
      // Copy: create new items with new IDs
      const newItems = clipboard.items.map((item) => ({
        ...item,
        id: generateId(),
        sectionId: targetSectionId,
      }));
      setItems((prev) => [...prev, ...newItems]);
      message.success(`${newItems.length} items pasted`);
    } else if (clipboard.operation === 'cut') {
      // Cut: move existing items
      setItems((prev) =>
        prev.map((item) =>
          clipboard.items.some((ci) => ci.id === item.id)
            ? { ...item, sectionId: targetSectionId }
            : item
        )
      );
      setClipboard({ items: [], operation: null });
      message.success('Items moved');
    }
  }, [clipboard]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (modifier && e.key === 'c' && selectedIds.size > 0) {
        e.preventDefault();
        copySelected();
      }
      if (modifier && e.key === 'x' && selectedIds.size > 0) {
        e.preventDefault();
        cutSelected();
      }
      if (modifier && e.key === 'v' && clipboard.items.length > 0) {
        e.preventDefault();
        setPasteModalOpen(true);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        e.preventDefault();
        deleteSelected();
      }
      if (e.key === 'Escape') {
        deselectAll();
        setClipboard({ items: [], operation: null });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, clipboard.items.length, copySelected, cutSelected, deleteSelected, deselectAll]);

  // Drag and drop handler
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeItem = items.find((i) => i.id === active.id);
    const overItem = items.find((i) => i.id === over.id);

    if (activeItem && overItem) {
      // Reorder items
      const oldIndex = items.indexOf(activeItem);
      const newIndex = items.indexOf(overItem);

      if (activeItem.sectionId === overItem.sectionId) {
        // Same section - just reorder
        setItems((prev) => arrayMove(prev, oldIndex, newIndex));
      } else {
        // Different section - move to new section
        setItems((prev) =>
          prev.map((item) =>
            item.id === activeItem.id
              ? { ...item, sectionId: overItem.sectionId }
              : item
          )
        );
      }
    }
  };

  // Library modal handlers
  const openLibraryModal = (sectionId: string) => {
    setLibraryTargetSection(sectionId);
    setLibraryModalOpen(true);
  };

  const handleSelectFromLibrary = (item: LineItem, selectedNotes: string[]) => {
    if (libraryTargetSection) {
      addItemFromLibrary(item, selectedNotes, libraryTargetSection);
      message.success('Item added from library');
    }
  };

  // Notes modal handlers
  const openNotesModal = (itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    if (item) {
      setNotesTargetItem(item);
      setNotesModalOpen(true);
    }
  };

  const handleSaveNotes = (updatedNotes: string[]) => {
    if (notesTargetItem) {
      updateItem(notesTargetItem.id, { notes: updatedNotes.length > 0 ? updatedNotes : undefined });
    }
  };

  // Mobile drawer handlers
  const openMobileDrawerForNew = (sectionId: string) => {
    setMobileEditSectionId(sectionId);
    setMobileEditItem(null);
    setIsNewMobileItem(true);
    setMobileDrawerOpen(true);
  };

  const openMobileDrawerForEdit = (item: LineItemData) => {
    setMobileEditItem(item);
    setMobileEditSectionId(item.sectionId);
    setIsNewMobileItem(false);
    setMobileDrawerOpen(true);
  };

  const handleMobileDrawerSave = (updates: Partial<LineItemData>) => {
    if (isNewMobileItem && mobileEditSectionId) {
      // Create new item
      const sectionItems = items.filter((i) => i.sectionId === mobileEditSectionId);
      const newItem: LineItemData = {
        id: generateId(),
        sectionId: mobileEditSectionId,
        name: updates.name || '',
        description: updates.description,
        unit: updates.unit || 'EA',
        quantity: updates.quantity || 1,
        unitPrice: updates.unitPrice || 0,
        isTaxable: updates.isTaxable ?? true,
        orderIndex: sectionItems.length,
      };
      setItems((prev) => [...prev, newItem]);
      message.success('Item added');
    } else if (mobileEditItem) {
      // Update existing item
      updateItem(mobileEditItem.id, updates);
      message.success('Item updated');
    }
    setMobileDrawerOpen(false);
    setMobileEditItem(null);
    setMobileEditSectionId(null);
  };

  const handleMobileDrawerDelete = () => {
    if (mobileEditItem) {
      deleteItem(mobileEditItem.id);
      message.success('Item deleted');
    }
  };

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: Parameters<typeof estimateService.create>[0]) => {
      if (isEditing && id) {
        return estimateService.update(id, data);
      }
      return estimateService.create(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] });
      if (isEditing && id) {
        queryClient.invalidateQueries({ queryKey: ['estimate', id] });
      }
      message.success(isEditing ? 'Estimate updated' : 'Estimate created');
      navigate('/app/estimates');
    },
    onError: (error: Error) => {
      message.error(error.message || 'Failed to save estimate');
    },
  });

  // Save handler
  const handleSave = () => {
    // Validate customer data
    if (!customerData.name) {
      message.error('Please select a customer or enter customer details');
      return;
    }

    // Build sections with items
    const sectionsData = sections.map((section) => ({
      name: section.name,
      order_index: section.orderIndex,
      items: items
        .filter((item) => item.sectionId === section.id)
        .map((item) => ({
          line_item_id: item.lineItemId,
          name: item.name,
          description: item.description,
          unit: item.unit,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          is_taxable: item.isTaxable,
          order_index: item.orderIndex,
          notes: item.notes,
        })),
    }));

    const payload = {
      customer_id: customerData.customerId || null,
      customer_name: customerData.name || null,
      customer_email: customerData.email || null,
      customer_address: customerData.address || null,
      title,
      estimate_date: estimateDate.format('YYYY-MM-DD'),
      valid_until: validUntil.format('YYYY-MM-DD'),
      tax_rate: taxRate,
      notes,
      sections: sectionsData,
    };

    saveMutation.mutate(payload as Parameters<typeof estimateService.create>[0]);
  };

  // Show loading spinner in edit mode
  if (isEditing && isLoadingEstimate) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Spin size="large" tip="Loading estimate..." />
      </div>
    );
  }

  // Show not found message
  if (isEditing && !isLoadingEstimate && !estimateData) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/app/estimates')}
          style={{ marginBottom: 16, padding: 0, color: colors.textSecondary }}
        >
          Back to Estimates
        </Button>
        <Card style={{ textAlign: 'center', padding: 48 }}>
          <h2 style={{ fontFamily: fonts.heading, marginBottom: 16 }}>Estimate Not Found</h2>
          <p style={{ color: colors.textSecondary, marginBottom: 24 }}>
            The estimate you're looking for doesn't exist or you don't have permission to access it.
          </p>
          <Button type="primary" onClick={() => navigate('/app/estimates')}>
            Back to Estimates
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/app/estimates')}
          style={{ marginBottom: 16, padding: 0, color: colors.textSecondary }}
        >
          Back to Estimates
        </Button>

        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'stretch' : 'center',
          gap: isMobile ? 16 : 12,
        }}>
          <h1 style={{ fontFamily: fonts.heading, fontSize: isMobile ? 20 : 24, fontWeight: 700, margin: 0 }}>
            {isEditing ? 'Edit Estimate' : 'New Estimate'}
          </h1>
          <div style={{
            display: 'flex',
            gap: 12,
            flexDirection: isMobile ? 'row' : 'row',
            width: isMobile ? '100%' : 'auto',
          }}>
            {isEditing && (
              <Button
                icon={<EyeOutlined />}
                size="large"
                onClick={() => setPreviewModalOpen(true)}
                style={{
                  fontWeight: 600,
                  height: 44,
                  borderRadius: 8,
                  flex: isMobile ? 1 : 'none',
                }}
              >
                Preview PDF
              </Button>
            )}
            <Button
              type="primary"
              icon={<SaveOutlined />}
              size="large"
              onClick={handleSave}
              style={{
                background: colors.primary,
                fontWeight: 600,
                height: 44,
                borderRadius: 8,
                flex: isMobile ? 1 : 'none',
              }}
            >
              {isEditing ? 'Save Changes' : 'Create Estimate'}
            </Button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 24, flexWrap: 'wrap' }}>
        {/* Main Editor */}
        <div style={{ flex: 1, minWidth: isMobile ? 'auto' : 600 }}>
          {/* Customer Selection */}
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontFamily: fonts.heading, fontWeight: 600, marginBottom: 12 }}>
              Customer
            </h3>
            <CustomerSelector
              value={customerData}
              onChange={setCustomerData}
            />
          </div>

          {/* Estimate Details */}
          <Card style={{ borderRadius: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
              <Form.Item label="Estimate Date" style={{ marginBottom: 0, flex: isMobile ? 'none' : '1 1 auto', minWidth: isMobile ? 'auto' : 150 }}>
                <DatePicker value={estimateDate} onChange={(d) => d && setEstimateDate(d)} style={{ height: 40, width: '100%' }} />
              </Form.Item>
              <Form.Item label="Valid Until" style={{ marginBottom: 0, flex: isMobile ? 'none' : '1 1 auto', minWidth: isMobile ? 'auto' : 150 }}>
                <DatePicker value={validUntil} onChange={(d) => d && setValidUntil(d)} style={{ height: 40, width: '100%' }} />
              </Form.Item>
            </div>

            <Form.Item label="Title" style={{ marginTop: 16, marginBottom: 0 }}>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Water Damage Restoration - Basement"
              />
            </Form.Item>
          </Card>

          {/* Sections */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sections.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              {sections.map((section) => (
                <Section
                  key={section.id}
                  section={section}
                  items={items
                    .filter((i) => i.sectionId === section.id)
                    .sort((a, b) => a.orderIndex - b.orderIndex)}
                  selectedIds={selectedIds}
                  clipboardCount={clipboard.items.length}
                  onToggleCollapse={() =>
                    updateSection(section.id, { isCollapsed: !section.isCollapsed })
                  }
                  onUpdateSection={(updates) => updateSection(section.id, updates)}
                  onDeleteSection={() => deleteSection(section.id)}
                  onAddItem={() => addItem(section.id)}
                  onAddFromLibrary={() => openLibraryModal(section.id)}
                  onPasteHere={() => {
                    pasteItems(section.id);
                    deselectAll();
                  }}
                  onToggleSelect={toggleSelect}
                  onSelectAllInSection={() => selectAllInSection(section.id)}
                  onUpdateItem={updateItem}
                  onDeleteItem={deleteItem}
                  onManageItemNotes={openNotesModal}
                  // Mobile props
                  isMobile={isMobile}
                  onMobileAddItem={() => openMobileDrawerForNew(section.id)}
                  onMobileEditItem={openMobileDrawerForEdit}
                />
              ))}
            </SortableContext>
          </DndContext>

          {/* Add Section Button */}
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={addSection}
            block
            style={{ height: 48, marginBottom: 16 }}
          >
            Add Section
          </Button>

          {/* Notes */}
          <Card style={{ borderRadius: 12 }}>
            <h3 style={{ fontFamily: fonts.heading, fontWeight: 600, marginBottom: 12 }}>Notes</h3>
            <Input.TextArea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Payment due upon completion of work."
            />
          </Card>
        </div>

        {/* Summary Sidebar - Responsive */}
        <Card style={{ borderRadius: 12, width: isMobile ? '100%' : 'auto', flex: isMobile ? 1 : '0 0 280px', flexShrink: 0, alignSelf: 'flex-start', position: isMobile ? 'static' : 'sticky', top: isMobile ? 'auto' : 88, minWidth: isMobile ? 'auto' : 280 }}>
            <h3 style={{ fontFamily: fonts.heading, fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Summary</h3>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: colors.textSecondary }}>Subtotal</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: colors.textSecondary }}>Taxable</span>
              <span>${taxableSubtotal.toFixed(2)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ color: colors.textSecondary }}>Tax Rate</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <InputNumber
                  value={taxRate}
                  onChange={(val) => setTaxRate(val || 0)}
                  min={0}
                  max={100}
                  precision={2}
                  style={{ width: 70 }}
                  size="small"
                />
                <span style={{ color: colors.textSecondary }}>%</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: colors.textSecondary }}>Tax Amount</span>
              <span>${taxAmount.toFixed(2)}</span>
            </div>

            <Divider style={{ margin: '16px 0' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, fontSize: 16 }}>Total</span>
              <span style={{ fontWeight: 700, fontSize: 20, fontFamily: fonts.heading }}>
                ${total.toFixed(2)}
              </span>
            </div>
          </Card>
      </div>

      {/* Bulk Action Bar */}
      {(selectedIds.size > 0 || clipboard.items.length > 0) && (
        <BulkActionBar
          selectedCount={selectedIds.size}
          clipboardCount={clipboard.items.length}
          clipboardOperation={clipboard.operation}
          onCopy={copySelected}
          onCut={cutSelected}
          onDelete={deleteSelected}
          onMove={() => setMoveModalOpen(true)}
          onPaste={() => setPasteModalOpen(true)}
          onDeselect={() => {
            deselectAll();
            setClipboard({ items: [], operation: null });
          }}
          isMobile={isMobile}
        />
      )}

      {/* Move to Section Modal */}
      <Modal
        title="Move to Section"
        open={moveModalOpen}
        onCancel={() => setMoveModalOpen(false)}
        footer={null}
        width={400}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
          {sections.map((section) => (
            <Button
              key={section.id}
              block
              onClick={() => moveSelected(section.id)}
              style={{ textAlign: 'left', height: 'auto', padding: '12px 16px' }}
            >
              {section.name}
              <span style={{ marginLeft: 'auto', color: colors.textMuted }}>
                {items.filter((i) => i.sectionId === section.id).length} items
              </span>
            </Button>
          ))}
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() => {
              addSection();
              setMoveModalOpen(false);
            }}
          >
            Create New Section & Move
          </Button>
        </div>
      </Modal>

      {/* Paste to Section Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Paste {clipboard.items.length} item{clipboard.items.length !== 1 ? 's' : ''} to Section</span>
            {clipboard.operation === 'cut' && (
              <Tag color="orange" style={{ marginLeft: 8 }}>Cut</Tag>
            )}
            {clipboard.operation === 'copy' && (
              <Tag color="green" style={{ marginLeft: 8 }}>Copy</Tag>
            )}
          </div>
        }
        open={pasteModalOpen}
        onCancel={() => setPasteModalOpen(false)}
        footer={null}
        width={400}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
          {clipboard.items.length > 0 && (
            <div style={{
              background: colors.bgLight,
              borderRadius: 8,
              padding: 12,
              marginBottom: 8,
              fontSize: 13,
              color: colors.textSecondary,
            }}>
              <strong style={{ color: colors.textPrimary }}>Items to paste:</strong>
              <ul style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
                {clipboard.items.slice(0, 5).map((item, index) => (
                  <li key={index}>{item.name || 'Unnamed item'}</li>
                ))}
                {clipboard.items.length > 5 && (
                  <li>...and {clipboard.items.length - 5} more</li>
                )}
              </ul>
            </div>
          )}
          {sections.map((section) => (
            <Button
              key={section.id}
              block
              onClick={() => {
                pasteItems(section.id);
                setPasteModalOpen(false);
                deselectAll();
              }}
              style={{ textAlign: 'left', height: 'auto', padding: '12px 16px' }}
            >
              {section.name}
              <span style={{ marginLeft: 'auto', color: colors.textMuted }}>
                {items.filter((i) => i.sectionId === section.id).length} items
              </span>
            </Button>
          ))}
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() => {
              const newSectionId = generateId();
              const newSection: SectionData = {
                id: newSectionId,
                name: 'New Section',
                isCollapsed: false,
                orderIndex: sections.length,
              };
              setSections((prev) => [...prev, newSection]);
              pasteItems(newSectionId);
              setPasteModalOpen(false);
              deselectAll();
            }}
          >
            Create New Section & Paste
          </Button>
        </div>
      </Modal>

      {/* Line Item Library Modal */}
      <LineItemLibraryModal
        open={libraryModalOpen}
        onClose={() => {
          setLibraryModalOpen(false);
          setLibraryTargetSection(null);
        }}
        onSelectItem={handleSelectFromLibrary}
      />

      {/* Item Notes Modal */}
      <ItemNotesModal
        open={notesModalOpen}
        item={notesTargetItem}
        onClose={() => {
          setNotesModalOpen(false);
          setNotesTargetItem(null);
        }}
        onSave={handleSaveNotes}
      />

      {/* Line Item Edit Drawer (works on both desktop and mobile) */}
      <MobileLineItemDrawer
        open={mobileDrawerOpen}
        item={mobileEditItem}
        isNew={isNewMobileItem}
        onClose={() => {
          setMobileDrawerOpen(false);
          setMobileEditItem(null);
          setMobileEditSectionId(null);
        }}
        onSave={handleMobileDrawerSave}
        onDelete={handleMobileDrawerDelete}
        onManageNotes={mobileEditItem ? () => openNotesModal(mobileEditItem.id) : undefined}
      />

      {/* PDF Preview Modal */}
      {isEditing && id && (
        <PdfPreviewModal
          open={previewModalOpen}
          onClose={() => setPreviewModalOpen(false)}
          documentType="estimate"
          documentId={id}
          documentNumber={estimateData?.estimateNumber || ''}
          customerName={estimateData?.customerName}
          isPaid={(estimateData?.balanceDue ?? 0) <= 0.01}
          fetchPreview={estimateService.getPreview}
          fetchPdf={estimateService.getPdf}
          templates={pdfTemplates}
          templatesLoading={isLoadingTemplates}
        />
      )}
    </div>
  );
};

export default EstimateEditorPage;
