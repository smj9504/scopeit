/**
 * RoomSpecialItems
 * Per-room special items component. Renders preset toggle cards (Piano, Pool Table, Gun Safe)
 * and a custom items section with add/remove functionality.
 * Designed to live inside room cards in a compact layout.
 */
import React, { useState } from 'react';
import { Row, Col, Button, Input, InputNumber, Space } from 'antd';
import { PlusOutlined, DeleteOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { colors, fonts, borderRadius } from '@/styles/theme';
import { SPECIAL_ITEMS } from './constants';
import type { CustomSpecialItem } from './types';

// ── Props ────────────────────────────────────────────────────────────────────

export interface RoomSpecialItemsProps {
  selectedItems: string[];
  customItems: CustomSpecialItem[];
  onToggleItem: (key: string) => void;
  onAddCustom: (item: CustomSpecialItem) => void;
  onRemoveCustom: (index: number) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

const RoomSpecialItems: React.FC<RoomSpecialItemsProps> = ({
  selectedItems,
  customItems,
  onToggleItem,
  onAddCustom,
  onRemoveCustom,
}) => {
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState<number | null>(null);

  const handleAdd = () => {
    if (!customName.trim() || !customPrice) return;
    onAddCustom({ name: customName.trim(), price: customPrice });
    setCustomName('');
    setCustomPrice(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── Preset Special Items ────────────────────────── */}
      <Row gutter={[8, 8]}>
        {SPECIAL_ITEMS.map((item) => {
          const isActive = selectedItems.includes(item.key);
          return (
            <Col key={item.key} xs={24} sm={8}>
              <div
                role="checkbox"
                aria-checked={isActive}
                tabIndex={0}
                onClick={() => onToggleItem(item.key)}
                onKeyDown={(e) => e.key === 'Enter' && onToggleItem(item.key)}
                style={{
                  border: `1.5px solid ${isActive ? colors.primary : colors.border}`,
                  borderRadius: borderRadius.md,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  backgroundColor: isActive ? colors.primary + '08' : colors.bgWhite,
                  transition: 'all 0.15s ease',
                  userSelect: 'none',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: isActive ? colors.primary : colors.textPrimary,
                    }}
                  >
                    {item.label}
                  </span>
                  {isActive && (
                    <CheckCircleOutlined
                      style={{ color: colors.primary, fontSize: 14 }}
                      aria-hidden="true"
                    />
                  )}
                </div>
                <span style={{ fontSize: 12, color: colors.textMuted }}>
                  +${item.price.toFixed(0)}
                </span>
              </div>
            </Col>
          );
        })}
      </Row>

      {/* ── Custom Items List ───────────────────────────── */}
      {customItems.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: colors.textSecondary,
              marginBottom: 6,
            }}
          >
            Custom Items
          </div>
          {customItems.map((item, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                background: colors.bgLight,
                borderRadius: borderRadius.md,
                marginBottom: 4,
                fontSize: 13,
              }}
            >
              <span style={{ fontWeight: 500 }}>{item.name}</span>
              <Space size={8}>
                <span style={{ color: colors.textSecondary }}>${item.price.toFixed(0)}</span>
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  size="small"
                  onClick={() => onRemoveCustom(idx)}
                  aria-label={`Remove ${item.name}`}
                  style={{ padding: '0 4px' }}
                />
              </Space>
            </div>
          ))}
        </div>
      )}

      {/* ── Add Custom Item Row ─────────────────────────── */}
      <Row gutter={[8, 8]} align="middle">
        <Col xs={24} sm={12}>
          <Input
            placeholder="Item name (e.g. Hot Tub)"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            onPressEnter={handleAdd}
            aria-label="Custom item name"
            style={{ fontFamily: fonts.body, fontSize: 13 }}
          />
        </Col>
        <Col xs={14} sm={8}>
          <InputNumber
            placeholder="Price"
            min={0}
            value={customPrice}
            onChange={(val) => setCustomPrice(val)}
            style={{ width: '100%', fontFamily: fonts.body, fontSize: 13 }}
            prefix="$"
            aria-label="Custom item price"
          />
        </Col>
        <Col xs={10} sm={4}>
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={handleAdd}
            disabled={!customName.trim() || !customPrice}
            style={{ width: '100%', fontFamily: fonts.body, fontSize: 13 }}
            aria-label="Add custom item"
          >
            Add
          </Button>
        </Col>
      </Row>
    </div>
  );
};

export default RoomSpecialItems;
export { RoomSpecialItems };
