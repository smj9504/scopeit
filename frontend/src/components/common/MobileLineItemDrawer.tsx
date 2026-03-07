/**
 * Mobile Line Item Drawer
 * A slide-up drawer for editing line items on mobile devices
 */
import React, { useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  InputNumber,
  AutoComplete,
  Button,
  Switch,
} from 'antd';
import { DeleteOutlined, FileTextOutlined } from '@ant-design/icons';
import { colors, fonts } from '@/styles/theme';
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
}

interface MobileLineItemDrawerProps {
  open: boolean;
  item: LineItemData | null;
  isNew?: boolean;
  onClose: () => void;
  onSave: (updates: Partial<LineItemData>) => void;
  onDelete?: () => void;
  onManageNotes?: () => void;
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
      // Validation failed
    });
  };

  const hasNotes = item?.notes && item.notes.length > 0;

  return (
    <Modal
      title={isNew ? 'Add Line Item' : 'Edit Line Item'}
      open={open}
      onCancel={onClose}
      onOk={handleSave}
      okText={isNew ? 'Add Item' : 'Save Changes'}
      cancelText="Cancel"
      okButtonProps={{
        style: { background: colors.primary },
      }}
      width={isMobile ? '100%' : 600}
      centered
      style={isMobile ? {
        maxWidth: 'calc(100vw - 32px)',
        margin: '16px',
        top: 0,
      } : undefined}
      styles={isMobile ? {
        body: {
          padding: '16px',
          maxHeight: 'calc(100vh - 200px)',
          overflowY: 'auto',
        },
      } : undefined}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 24 }} onValuesChange={() => form.validateFields()}>
        {/* Item Name */}
        <Form.Item
          name="name"
          label="Item Name"
          rules={[{ required: true, message: 'Please enter item name' }]}
        >
          <Input
            placeholder="Enter item name"
          />
        </Form.Item>

        {/* Description */}
        <Form.Item name="description" label="Description">
          <Input.TextArea
            placeholder="Optional description"
            rows={2}
          />
        </Form.Item>

        {/* Quantity, Unit & Unit Price - Responsive layout */}
        {isMobile ? (
          <>
            {/* Mobile: Stack vertically with 2-column grid for Qty/Unit */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 0 }}>
              <Form.Item name="quantity" label="Quantity" style={{ marginBottom: 16 }}>
                <InputNumber
                  min={0}
                  precision={2}
                  style={{ width: '100%' }}
                  placeholder="1"
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
            <Form.Item name="unitPrice" label="Unit Price">
              <InputNumber
                min={0}
                precision={2}
                prefix="$"
                style={{ width: '100%' }}
                placeholder="0.00"
              />
            </Form.Item>
          </>
        ) : (
          /* Desktop: Side by side */
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="quantity" label="Quantity" style={{ width: 120 }}>
              <InputNumber
                min={0}
                precision={2}
                style={{ width: '100%' }}
                placeholder="1"
              />
            </Form.Item>
            <Form.Item name="unit" label="Unit" style={{ width: 120 }}>
              <AutoComplete
                options={unitOptions}
                style={{ width: '100%' }}
                filterOption={(input, option) =>
                  option?.label?.toString().toLowerCase().includes(input.toLowerCase()) ?? false
                }
                placeholder="EA"
              />
            </Form.Item>
            <Form.Item name="unitPrice" label="Unit Price" style={{ flex: 1 }}>
              <InputNumber
                min={0}
                precision={2}
                prefix="$"
                style={{ width: '100%' }}
                placeholder="0.00"
              />
            </Form.Item>
          </div>
        )}

        {/* Total (readonly) */}
        <Form.Item label="Total" shouldUpdate>
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
                ${calculatedTotal.toFixed(2)}
              </div>
            );
          }}
        </Form.Item>

        {/* Taxable Toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Form.Item name="isTaxable" label="Taxable" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Switch />
          </Form.Item>
        </div>

        {/* Notes Button */}
        {onManageNotes && !isNew && (
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              block
              icon={<FileTextOutlined />}
              onClick={onManageNotes}
            >
              {hasNotes ? `Manage Notes (${item?.notes?.length})` : 'Add Notes'}
            </Button>
          </Form.Item>
        )}
      </Form>
    </Modal>
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
        padding: '10px 12px',
        background: isSelected ? '#eff6ff' : colors.bgWhite,
        borderBottom: `1px solid ${colors.border}`,
        cursor: 'pointer',
        transition: 'background 0.15s ease',
      }}
      onClick={onTap}
    >
      {/* Checkbox - stop propagation to prevent card tap */}
      <div onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onSelect}
          style={{
            width: 20,
            height: 20,
            cursor: 'pointer',
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
                fontSize: 15,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.name || 'Untitled Item'}
            </div>
            <div style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
              {item.quantity} {item.unit} × ${item.unitPrice.toFixed(2)}
              {!item.isTaxable && (
                <span style={{ marginLeft: 8, fontSize: 11, color: colors.textMuted }}>(Non-tax)</span>
              )}
              {hasNotes && (
                <span style={{ marginLeft: 8 }}>
                  <FileTextOutlined style={{ fontSize: 12, color: colors.primary }} /> {item.notes?.length}
                </span>
              )}
            </div>
          </div>
          <div
            style={{
              fontWeight: 600,
              fontSize: 15,
              fontFamily: fonts.heading,
              whiteSpace: 'nowrap',
            }}
          >
            ${total.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobileLineItemDrawer;
