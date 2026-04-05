/**
 * Mobile Line Item Drawer
 * A slide-up bottom drawer on mobile, side drawer on iPad for editing line items.
 * Full-screen on mobile (< 768px), 420px side drawer on tablet (768-1023px).
 */
import React, { useEffect } from 'react';
import {
  Drawer,
  Form,
  Input,
  InputNumber,
  AutoComplete,
  Button,
  Switch,
} from 'antd';
import { DeleteOutlined, FileTextOutlined, CameraOutlined } from '@ant-design/icons';
import { colors, fonts } from '@/styles/theme';
import { formatCurrency } from '@/utils/formatters';
import { useIsMobile } from '@/hooks/useIsMobile';

interface LineItemData {
  id: string;
  name: string;
  description?: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  isTaxable: boolean;
  notes?: string[];
  images?: { filename: string; data: string }[];
}

interface MobileLineItemDrawerProps {
  open: boolean;
  item: LineItemData | null;
  isNew?: boolean;
  onClose: () => void;
  onSave: (updates: Partial<LineItemData>) => void;
  onDelete?: () => void;
  onManageNotes?: () => void;
  onManagePhotos?: () => void;
}

const unitOptions = [
  { value: 'EA', label: 'EA - Each' },
  { value: 'SF', label: 'SF - Square Feet' },
  { value: 'LF', label: 'LF - Linear Feet' },
  { value: 'HR', label: 'HR - Hour' },
  { value: 'DAY', label: 'DAY - Day' },
  { value: 'SQ', label: 'SQ - Square (100 SF)' },
  { value: 'CY', label: 'CY - Cubic Yard' },
];

export const MobileLineItemDrawer: React.FC<MobileLineItemDrawerProps> = ({
  open,
  item,
  isNew = false,
  onClose,
  onSave,
  onDelete,
  onManageNotes,
  onManagePhotos,
}) => {
  const [form] = Form.useForm();
  const isMobile = useIsMobile();

  // Populate form when item changes
  useEffect(() => {
    if (item && open) {
      form.setFieldsValue({
        name: item.name,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        isTaxable: item.isTaxable,
      });
    } else if (isNew && open) {
      form.resetFields();
      form.setFieldsValue({
        quantity: 1,
        unit: 'EA',
        unitPrice: 0,
        isTaxable: true,
      });
    }
  }, [item, isNew, open, form]);

  const handleSave = () => {
    form.validateFields().then((values) => {
      onSave(values);
      onClose();
    }).catch(() => {
      // Validation failed — stay open
    });
  };

  const handleDelete = () => {
    onDelete?.();
    onClose();
  };

  const hasNotes = item?.notes && item.notes.length > 0;

  // Placement: bottom drawer on mobile, right drawer on tablet+
  const placement = isMobile ? 'bottom' : 'right';

  // Height: nearly full screen on mobile (leaves a small gap at top)
  // Width: 420px on tablet, full-width handled by placement=bottom
  const drawerHeight = isMobile ? 'calc(100dvh - 48px)' : undefined;
  const drawerWidth = !isMobile ? 420 : undefined;

  return (
    <Drawer
      title={isNew ? 'Add Line Item' : 'Edit Line Item'}
      placement={placement}
      open={open}
      onClose={onClose}
      height={drawerHeight}
      width={drawerWidth}
      styles={{
        header: {
          paddingTop: isMobile ? 16 : 20,
          paddingBottom: isMobile ? 12 : 16,
          borderBottom: `1px solid ${colors.border}`,
        },
        body: {
          padding: '16px',
          overflowY: 'auto',
          // Leave room for the fixed footer buttons
          paddingBottom: 88,
        },
        footer: {
          padding: '12px 16px',
          borderTop: `1px solid ${colors.border}`,
        },
      }}
      footer={
        <div style={{ display: 'flex', gap: 8 }}>
          {!isNew && onDelete && (
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={handleDelete}
              style={{ flexShrink: 0 }}
            />
          )}
          <Button onClick={onClose} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button
            type="primary"
            onClick={handleSave}
            style={{ background: colors.primary, flex: 1, fontWeight: 600 }}
          >
            {isNew ? 'Add Item' : 'Save Changes'}
          </Button>
        </div>
      }
    >
      <Form
        form={form}
        layout="vertical"
        onValuesChange={() => form.validateFields(['name'])}
      >
        {/* Item Name */}
        <Form.Item
          name="name"
          label="Item Name"
          rules={[{ required: true, message: 'Please enter item name' }]}
          style={{ marginBottom: 16 }}
        >
          <Input placeholder="Enter item name" />
        </Form.Item>

        {/* Description */}
        <Form.Item name="description" label="Description" style={{ marginBottom: 16 }}>
          <Input.TextArea
            placeholder="Optional description"
            rows={2}
            autoSize={{ minRows: 2, maxRows: 4 }}
          />
        </Form.Item>

        {/* Quantity & Unit on same row, Unit Price below */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 0 }}>
          <Form.Item name="quantity" label="Quantity" style={{ marginBottom: 16 }}>
            <InputNumber
              min={0}
              precision={2}
              style={{ width: '100%' }}
              placeholder="1"
              inputMode="decimal"
            />
          </Form.Item>
          <Form.Item name="unit" label="Unit" style={{ marginBottom: 16 }}>
            <AutoComplete
              options={unitOptions}
              style={{ width: '100%' }}
              filterOption={(input, option) =>
                option?.label?.toString().toLowerCase().includes(input.toLowerCase()) ?? false
              }
              placeholder="EA"
            />
          </Form.Item>
        </div>

        <Form.Item name="unitPrice" label="Unit Price" style={{ marginBottom: 16 }}>
          <InputNumber
            min={0}
            precision={2}
            prefix="$"
            style={{ width: '100%' }}
            placeholder="0.00"
            inputMode="decimal"
          />
        </Form.Item>

        {/* Total (readonly calculated) */}
        <Form.Item label="Total" shouldUpdate style={{ marginBottom: 16 }}>
          {() => {
            const qty = form.getFieldValue('quantity') || 0;
            const price = form.getFieldValue('unitPrice') || 0;
            const calculatedTotal = qty * price;
            return (
              <div
                style={{
                  background: colors.bgLight,
                  padding: '12px 16px',
                  borderRadius: 8,
                  fontSize: 18,
                  fontWeight: 600,
                  fontFamily: fonts.heading,
                }}
              >
                {formatCurrency(calculatedTotal)}
              </div>
            );
          }}
        </Form.Item>

        {/* Taxable Toggle */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            background: colors.bgLight,
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          <span style={{ fontWeight: 500 }}>Taxable</span>
          <Form.Item name="isTaxable" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Switch />
          </Form.Item>
        </div>

        {/* Notes & Photos Buttons — only for existing items */}
        {!isNew && (onManageNotes || onManagePhotos) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {onManageNotes && (
              <Button
                block
                icon={<FileTextOutlined />}
                onClick={() => { onManageNotes(); }}
                style={{ height: 44 }}
              >
                {hasNotes ? `Manage Notes (${item?.notes?.length})` : 'Add Notes'}
              </Button>
            )}
            {onManagePhotos && (
              <Button
                block
                icon={<CameraOutlined />}
                onClick={() => { onManagePhotos(); }}
                style={{ height: 44 }}
              >
                {item?.images && item.images.length > 0
                  ? `Manage Photos (${item.images.length})`
                  : 'Add Photos'}
              </Button>
            )}
          </div>
        )}
      </Form>
    </Drawer>
  );
};

/**
 * Mobile Line Item Card
 * A compact card view of a line item for mobile displays
 */
interface MobileLineItemCardProps {
  item: LineItemData;
  isSelected: boolean;
  onSelect: () => void;
  onTap: () => void;
}

export const MobileLineItemCard: React.FC<MobileLineItemCardProps> = ({
  item,
  isSelected,
  onSelect,
  onTap,
}) => {
  const total = item.quantity * item.unitPrice;
  const hasNotes = item.notes && item.notes.length > 0;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '12px 12px',
        background: isSelected ? '#f0f4ff' : colors.bgWhite,
        borderBottom: `1px solid ${colors.border}`,
        cursor: 'pointer',
        transition: 'background 0.15s ease',
        minHeight: 56,
      }}
      onClick={onTap}
    >
      {/* Checkbox — stop propagation to prevent card tap */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ flexShrink: 0 }}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onSelect}
          style={{
            width: 20,
            height: 20,
            cursor: 'pointer',
            accentColor: colors.primary,
          }}
        />
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: 500,
                fontSize: 14,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                lineHeight: '1.4',
              }}
            >
              {item.name || 'Untitled Item'}
            </div>
            <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: '1.3' }}>
              {item.quantity} {item.unit} × {formatCurrency(item.unitPrice)}
              {!item.isTaxable && (
                <span style={{ marginLeft: 6, fontSize: 11, color: colors.textMuted }}>(Non-tax)</span>
              )}
              {hasNotes && (
                <span style={{ marginLeft: 6 }}>
                  <FileTextOutlined style={{ fontSize: 11 }} /> {item.notes?.length}
                </span>
              )}
            </div>
          </div>
          <div
            style={{
              fontWeight: 600,
              fontSize: 14,
              fontFamily: fonts.heading,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {formatCurrency(total)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobileLineItemDrawer;
