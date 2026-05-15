# Section 기반 Line Item 관리 기능

> Estimate/Invoice에서 Section 단위로 Line Item을 관리하는 기능 명세

---

## 📌 기능 개요

### 핵심 기능

| 기능 | 설명 |
|------|------|
| **Section 관리** | Section 생성, 이름 변경, 삭제, 순서 변경 |
| **Line Item 추가** | Section 내에 Line Item 추가 |
| **Multi-select** | 여러 Line Item 체크박스로 선택 |
| **일괄 삭제** | 선택된 Line Items 한번에 삭제 |
| **복사/붙여넣기** | 선택된 Line Items 복사 → 다른 Section에 붙여넣기 |
| **드래그 이동** | Line Item을 Section 간 드래그 앤 드롭 |

---

## 🗄️ 데이터베이스 설계

### Option A: Section을 별도 테이블로 (추천 ✅)

```sql
-- 기존 estimate_items 테이블에서 section 컬럼 제거하고 별도 테이블 생성

-- Sections 테이블
CREATE TABLE estimate_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    estimate_id UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
    
    name VARCHAR(255) NOT NULL,           -- Section 이름
    order_index INTEGER NOT NULL DEFAULT 0,
    is_collapsed BOOLEAN DEFAULT FALSE,   -- UI 접기 상태
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_estimate_sections ON estimate_sections(estimate_id, order_index);

-- estimate_items 수정
ALTER TABLE estimate_items 
    ADD COLUMN section_id UUID REFERENCES estimate_sections(id) ON DELETE SET NULL;

CREATE INDEX idx_estimate_items_section ON estimate_items(section_id, order_index);


-- Invoice도 동일하게
CREATE TABLE invoice_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    
    name VARCHAR(255) NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    is_collapsed BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE invoice_items 
    ADD COLUMN section_id UUID REFERENCES invoice_sections(id) ON DELETE SET NULL;
```

### ERD

```
┌─────────────────┐       ┌─────────────────────┐       ┌─────────────────┐
│    estimates    │       │  estimate_sections  │       │  estimate_items │
├─────────────────┤       ├─────────────────────┤       ├─────────────────┤
│ id              │──┐    │ id                  │──┐    │ id              │
│ estimate_number │  │    │ estimate_id     FK  │◀─┘    │ estimate_id  FK │
│ customer_id     │  └───▶│ name                │       │ section_id   FK │◀─┐
│ total           │       │ order_index         │       │ name            │  │
│ ...             │       │ is_collapsed        │       │ quantity        │  │
└─────────────────┘       └─────────────────────┘       │ unit_price      │  │
                                     │                  │ order_index     │  │
                                     │                  └─────────────────┘  │
                                     └───────────────────────────────────────┘
                                              1:N 관계
```

---

## 📡 API 설계

### Section API

#### GET /estimates/{id}/sections
Section 목록 조회 (Line Items 포함)

**Response:**
```json
{
  "sections": [
    {
      "id": "section-uuid-1",
      "name": "Water Damage",
      "orderIndex": 0,
      "isCollapsed": false,
      "items": [
        {
          "id": "item-uuid-1",
          "name": "Water Extraction",
          "quantity": 1500,
          "unit": "SF",
          "unitPrice": 2.50,
          "total": 3750.00,
          "orderIndex": 0
        },
        {
          "id": "item-uuid-2",
          "name": "Dehumidifier Rental",
          "quantity": 5,
          "unit": "DAY",
          "unitPrice": 75.00,
          "total": 375.00,
          "orderIndex": 1
        }
      ],
      "subtotal": 4125.00
    },
    {
      "id": "section-uuid-2",
      "name": "Mold Remediation",
      "orderIndex": 1,
      "isCollapsed": false,
      "items": [...],
      "subtotal": 3500.00
    }
  ],
  "unsectionedItems": [
    // section_id가 NULL인 아이템들
  ]
}
```

---

#### POST /estimates/{id}/sections
Section 생성

**Request:**
```json
{
  "name": "Fire Damage",
  "orderIndex": 2
}
```

**Response:**
```json
{
  "id": "section-uuid-3",
  "name": "Fire Damage",
  "orderIndex": 2,
  "isCollapsed": false,
  "items": [],
  "subtotal": 0
}
```

---

#### PUT /estimates/{id}/sections/{sectionId}
Section 수정

**Request:**
```json
{
  "name": "Fire & Smoke Damage",
  "isCollapsed": true
}
```

---

#### DELETE /estimates/{id}/sections/{sectionId}
Section 삭제

**Query Params:**
- `moveItemsTo`: 삭제 시 아이템을 이동할 Section ID (없으면 아이템도 삭제)

```
DELETE /estimates/{id}/sections/{sectionId}?moveItemsTo=other-section-id
```

---

#### PUT /estimates/{id}/sections/reorder
Section 순서 변경

**Request:**
```json
{
  "sectionIds": ["section-uuid-2", "section-uuid-1", "section-uuid-3"]
}
```

---

### Line Item 일괄 작업 API

#### POST /estimates/{id}/items/bulk-action
Line Items 일괄 작업

**Request - 삭제:**
```json
{
  "action": "delete",
  "itemIds": ["item-uuid-1", "item-uuid-2", "item-uuid-3"]
}
```

**Request - 이동:**
```json
{
  "action": "move",
  "itemIds": ["item-uuid-1", "item-uuid-2"],
  "targetSectionId": "section-uuid-2",
  "targetIndex": 0  // 삽입 위치 (선택)
}
```

**Request - 복사:**
```json
{
  "action": "copy",
  "itemIds": ["item-uuid-1", "item-uuid-2"],
  "targetSectionId": "section-uuid-2"
}
```

**Response (복사 시):**
```json
{
  "success": true,
  "createdItems": [
    {
      "id": "new-item-uuid-1",
      "name": "Water Extraction",
      "sectionId": "section-uuid-2",
      ...
    },
    {
      "id": "new-item-uuid-2",
      "name": "Dehumidifier Rental",
      "sectionId": "section-uuid-2",
      ...
    }
  ]
}
```

---

#### PUT /estimates/{id}/items/reorder
Line Item 순서/Section 변경 (드래그 앤 드롭)

**Request:**
```json
{
  "itemId": "item-uuid-1",
  "targetSectionId": "section-uuid-2",
  "targetIndex": 1
}
```

---

## 🖥️ Frontend 구현

### 상태 관리 (Zustand)

```typescript
// stores/estimateEditorStore.ts

interface EstimateEditorState {
  // 데이터
  sections: Section[];
  unsectionedItems: EstimateItem[];
  
  // 선택 상태
  selectedItemIds: Set<string>;
  
  // 클립보드
  clipboard: {
    items: EstimateItem[];
    operation: 'copy' | 'cut' | null;
  };
  
  // Actions
  selectItem: (itemId: string) => void;
  deselectItem: (itemId: string) => void;
  selectAll: (sectionId?: string) => void;
  deselectAll: () => void;
  toggleSelectItem: (itemId: string) => void;
  
  // Clipboard Actions
  copySelectedItems: () => void;
  cutSelectedItems: () => void;
  pasteItems: (targetSectionId: string) => void;
  
  // Bulk Actions
  deleteSelectedItems: () => void;
  moveSelectedItems: (targetSectionId: string) => void;
  
  // Section Actions
  addSection: (name: string) => void;
  updateSection: (sectionId: string, data: Partial<Section>) => void;
  deleteSection: (sectionId: string, moveItemsTo?: string) => void;
  reorderSections: (sectionIds: string[]) => void;
  
  // Item Actions
  moveItem: (itemId: string, targetSectionId: string, targetIndex: number) => void;
}

export const useEstimateEditorStore = create<EstimateEditorState>((set, get) => ({
  sections: [],
  unsectionedItems: [],
  selectedItemIds: new Set(),
  clipboard: { items: [], operation: null },
  
  // 선택 관련
  selectItem: (itemId) => set((state) => ({
    selectedItemIds: new Set([...state.selectedItemIds, itemId])
  })),
  
  deselectItem: (itemId) => set((state) => {
    const newSet = new Set(state.selectedItemIds);
    newSet.delete(itemId);
    return { selectedItemIds: newSet };
  }),
  
  toggleSelectItem: (itemId) => {
    const { selectedItemIds, selectItem, deselectItem } = get();
    if (selectedItemIds.has(itemId)) {
      deselectItem(itemId);
    } else {
      selectItem(itemId);
    }
  },
  
  selectAll: (sectionId) => set((state) => {
    let itemIds: string[];
    if (sectionId) {
      const section = state.sections.find(s => s.id === sectionId);
      itemIds = section?.items.map(i => i.id) || [];
    } else {
      itemIds = state.sections.flatMap(s => s.items.map(i => i.id));
    }
    return { selectedItemIds: new Set(itemIds) };
  }),
  
  deselectAll: () => set({ selectedItemIds: new Set() }),
  
  // 클립보드
  copySelectedItems: () => set((state) => {
    const allItems = state.sections.flatMap(s => s.items);
    const items = allItems.filter(i => state.selectedItemIds.has(i.id));
    return { 
      clipboard: { items, operation: 'copy' }
    };
  }),
  
  cutSelectedItems: () => set((state) => {
    const allItems = state.sections.flatMap(s => s.items);
    const items = allItems.filter(i => state.selectedItemIds.has(i.id));
    return { 
      clipboard: { items, operation: 'cut' }
    };
  }),
  
  pasteItems: async (targetSectionId) => {
    const { clipboard, selectedItemIds } = get();
    if (!clipboard.items.length) return;
    
    // API 호출
    if (clipboard.operation === 'copy') {
      await estimateService.bulkAction(estimateId, {
        action: 'copy',
        itemIds: clipboard.items.map(i => i.id),
        targetSectionId
      });
    } else if (clipboard.operation === 'cut') {
      await estimateService.bulkAction(estimateId, {
        action: 'move',
        itemIds: clipboard.items.map(i => i.id),
        targetSectionId
      });
      // cut은 한번만 붙여넣기 가능
      set({ clipboard: { items: [], operation: null } });
    }
    
    // 데이터 리로드
    // ...
  },
  
  deleteSelectedItems: async () => {
    const { selectedItemIds } = get();
    await estimateService.bulkAction(estimateId, {
      action: 'delete',
      itemIds: Array.from(selectedItemIds)
    });
    set({ selectedItemIds: new Set() });
    // 데이터 리로드
  },
  
  // ... 나머지 actions
}));
```

---

### 컴포넌트 구조

```
components/features/estimate/
├── EstimateEditor.tsx              # 메인 에디터
├── SectionList.tsx                 # Section 목록 (DnD Container)
├── Section.tsx                     # 개별 Section
├── SectionHeader.tsx               # Section 헤더 (이름, 접기/펴기)
├── LineItemList.tsx                # Line Item 목록 (DnD Container)
├── LineItemRow.tsx                 # 개별 Line Item 행
├── LineItemCheckbox.tsx            # 선택 체크박스
├── BulkActionBar.tsx               # 선택 시 하단 액션 바
├── AddSectionButton.tsx            # Section 추가 버튼
├── AddItemButton.tsx               # Line Item 추가 버튼
└── MoveToSectionModal.tsx          # Section 이동 모달
```

---

### EstimateEditor.tsx

```tsx
import React, { useEffect } from 'react';
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useEstimateEditorStore } from '@/stores/estimateEditorStore';
import { SectionList } from './SectionList';
import { BulkActionBar } from './BulkActionBar';
import { AddSectionButton } from './AddSectionButton';

interface EstimateEditorProps {
  estimateId: string;
}

export const EstimateEditor: React.FC<EstimateEditorProps> = ({ estimateId }) => {
  const { 
    sections, 
    selectedItemIds,
    moveItem,
    reorderSections,
    loadEstimate 
  } = useEstimateEditorStore();
  
  useEffect(() => {
    loadEstimate(estimateId);
  }, [estimateId]);
  
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    
    const activeId = active.id as string;
    const overId = over.id as string;
    
    // Section 드래그인지 Item 드래그인지 판별
    if (active.data.current?.type === 'section') {
      // Section 순서 변경
      const oldIndex = sections.findIndex(s => s.id === activeId);
      const newIndex = sections.findIndex(s => s.id === overId);
      const newOrder = arrayMove(sections, oldIndex, newIndex).map(s => s.id);
      reorderSections(newOrder);
    } else {
      // Item 이동
      const targetSectionId = over.data.current?.sectionId || overId;
      const targetIndex = over.data.current?.index || 0;
      moveItem(activeId, targetSectionId, targetIndex);
    }
  };
  
  return (
    <div className="estimate-editor">
      <DndContext 
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SectionList sections={sections} />
        
        <AddSectionButton />
      </DndContext>
      
      {/* 선택된 아이템이 있을 때 하단 액션 바 표시 */}
      {selectedItemIds.size > 0 && (
        <BulkActionBar selectedCount={selectedItemIds.size} />
      )}
    </div>
  );
};
```

---

### Section.tsx

```tsx
import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Checkbox, Button, Dropdown, Input } from 'antd';
import { 
  HolderOutlined, 
  PlusOutlined, 
  MoreOutlined,
  CaretDownOutlined,
  CaretRightOutlined 
} from '@ant-design/icons';
import { LineItemList } from './LineItemList';
import { useEstimateEditorStore } from '@/stores/estimateEditorStore';
import { formatCurrency } from '@/utils/formatters';

interface SectionProps {
  section: Section;
}

export const Section: React.FC<SectionProps> = ({ section }) => {
  const { 
    selectedItemIds, 
    selectAll, 
    deselectAll,
    updateSection,
    deleteSection,
    addItemToSection 
  } = useEstimateEditorStore();
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ 
    id: section.id,
    data: { type: 'section' }
  });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  
  // 이 섹션의 모든 아이템이 선택되었는지
  const allSelected = section.items.length > 0 && 
    section.items.every(item => selectedItemIds.has(item.id));
  const someSelected = section.items.some(item => selectedItemIds.has(item.id));
  
  const handleSelectAll = () => {
    if (allSelected) {
      section.items.forEach(item => {
        selectedItemIds.delete(item.id);
      });
      deselectAll(); // 또는 부분 해제
    } else {
      selectAll(section.id);
    }
  };
  
  const toggleCollapse = () => {
    updateSection(section.id, { isCollapsed: !section.isCollapsed });
  };
  
  const menuItems = [
    { key: 'rename', label: 'Rename Section' },
    { key: 'duplicate', label: 'Duplicate Section' },
    { type: 'divider' },
    { key: 'delete', label: 'Delete Section', danger: true },
  ];
  
  return (
    <div ref={setNodeRef} style={style} className="section">
      {/* Section Header */}
      <div className="section-header">
        {/* 드래그 핸들 */}
        <div className="drag-handle" {...attributes} {...listeners}>
          <HolderOutlined />
        </div>
        
        {/* 전체 선택 체크박스 */}
        <Checkbox 
          checked={allSelected}
          indeterminate={someSelected && !allSelected}
          onChange={handleSelectAll}
        />
        
        {/* 접기/펴기 버튼 */}
        <Button type="text" onClick={toggleCollapse}>
          {section.isCollapsed ? <CaretRightOutlined /> : <CaretDownOutlined />}
        </Button>
        
        {/* Section 이름 */}
        <span className="section-name">{section.name}</span>
        
        {/* Subtotal */}
        <span className="section-subtotal">
          {formatCurrency(section.subtotal)}
        </span>
        
        {/* 아이템 추가 버튼 */}
        <Button 
          type="text" 
          icon={<PlusOutlined />}
          onClick={() => addItemToSection(section.id)}
        >
          Add Item
        </Button>
        
        {/* 더보기 메뉴 */}
        <Dropdown menu={{ items: menuItems }}>
          <Button type="text" icon={<MoreOutlined />} />
        </Dropdown>
      </div>
      
      {/* Section Items */}
      {!section.isCollapsed && (
        <LineItemList 
          sectionId={section.id} 
          items={section.items} 
        />
      )}
    </div>
  );
};
```

---

### LineItemRow.tsx

```tsx
import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Checkbox, InputNumber, Input, Button } from 'antd';
import { HolderOutlined, DeleteOutlined } from '@ant-design/icons';
import { useEstimateEditorStore } from '@/stores/estimateEditorStore';
import { formatCurrency } from '@/utils/formatters';

interface LineItemRowProps {
  item: EstimateItem;
  sectionId: string;
  index: number;
}

export const LineItemRow: React.FC<LineItemRowProps> = ({ 
  item, 
  sectionId, 
  index 
}) => {
  const { 
    selectedItemIds, 
    toggleSelectItem,
    updateItem,
    deleteItem 
  } = useEstimateEditorStore();
  
  const isSelected = selectedItemIds.has(item.id);
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: item.id,
    data: { 
      type: 'item',
      sectionId,
      index 
    }
  });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    backgroundColor: isSelected ? '#f0f5ff' : undefined,
  };
  
  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`line-item-row ${isSelected ? 'selected' : ''}`}
    >
      {/* 드래그 핸들 */}
      <div className="drag-handle" {...attributes} {...listeners}>
        <HolderOutlined />
      </div>
      
      {/* 선택 체크박스 */}
      <Checkbox 
        checked={isSelected}
        onChange={() => toggleSelectItem(item.id)}
      />
      
      {/* 아이템 정보 */}
      <div className="item-name">
        <Input 
          value={item.name}
          onChange={(e) => updateItem(item.id, { name: e.target.value })}
          bordered={false}
        />
      </div>
      
      <div className="item-quantity">
        <InputNumber 
          value={item.quantity}
          onChange={(val) => updateItem(item.id, { quantity: val })}
          min={0}
          style={{ width: 80 }}
        />
      </div>
      
      <div className="item-unit">
        <Input 
          value={item.unit}
          onChange={(e) => updateItem(item.id, { unit: e.target.value })}
          style={{ width: 60 }}
        />
      </div>
      
      <div className="item-price">
        <InputNumber 
          value={item.unitPrice}
          onChange={(val) => updateItem(item.id, { unitPrice: val })}
          min={0}
          prefix="$"
          style={{ width: 100 }}
        />
      </div>
      
      <div className="item-total">
        {formatCurrency(item.total)}
      </div>
      
      {/* 삭제 버튼 */}
      <Button 
        type="text" 
        danger
        icon={<DeleteOutlined />}
        onClick={() => deleteItem(item.id)}
      />
    </div>
  );
};
```

---

### BulkActionBar.tsx

```tsx
import React, { useState } from 'react';
import { Button, Space, Tooltip } from 'antd';
import { 
  DeleteOutlined, 
  CopyOutlined, 
  ScissorOutlined,
  SwapOutlined,
  CloseOutlined 
} from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { useEstimateEditorStore } from '@/stores/estimateEditorStore';
import { MoveToSectionModal } from './MoveToSectionModal';

interface BulkActionBarProps {
  selectedCount: number;
}

export const BulkActionBar: React.FC<BulkActionBarProps> = ({ selectedCount }) => {
  const { 
    deselectAll,
    copySelectedItems,
    cutSelectedItems,
    deleteSelectedItems,
    clipboard
  } = useEstimateEditorStore();
  
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  
  return (
    <AnimatePresence>
      <motion.div 
        className="bulk-action-bar"
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: 'spring', damping: 25 }}
        style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#111827',
          borderRadius: 12,
          padding: '12px 20px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          zIndex: 1000,
        }}
      >
        {/* 선택 개수 */}
        <span style={{ color: '#fff', fontWeight: 600 }}>
          {selectedCount} selected
        </span>
        
        <div style={{ 
          width: 1, 
          height: 24, 
          background: 'rgba(255,255,255,0.2)' 
        }} />
        
        {/* 액션 버튼들 */}
        <Space size={8}>
          <Tooltip title="Copy (Ctrl+C)">
            <Button 
              type="text" 
              icon={<CopyOutlined style={{ color: '#fff' }} />}
              onClick={copySelectedItems}
            />
          </Tooltip>
          
          <Tooltip title="Cut (Ctrl+X)">
            <Button 
              type="text" 
              icon={<ScissorOutlined style={{ color: '#fff' }} />}
              onClick={cutSelectedItems}
            />
          </Tooltip>
          
          <Tooltip title="Move to Section">
            <Button 
              type="text" 
              icon={<SwapOutlined style={{ color: '#fff' }} />}
              onClick={() => setMoveModalOpen(true)}
            />
          </Tooltip>
          
          <Tooltip title="Delete (Del)">
            <Button 
              type="text" 
              danger
              icon={<DeleteOutlined />}
              onClick={deleteSelectedItems}
            />
          </Tooltip>
        </Space>
        
        <div style={{ 
          width: 1, 
          height: 24, 
          background: 'rgba(255,255,255,0.2)' 
        }} />
        
        {/* 선택 해제 */}
        <Button 
          type="text" 
          icon={<CloseOutlined style={{ color: '#fff' }} />}
          onClick={deselectAll}
        />
        
        {/* Section 이동 모달 */}
        <MoveToSectionModal 
          open={moveModalOpen}
          onClose={() => setMoveModalOpen(false)}
        />
      </motion.div>
    </AnimatePresence>
  );
};
```

---

### MoveToSectionModal.tsx

```tsx
import React from 'react';
import { Modal, List, Button } from 'antd';
import { FolderOutlined, PlusOutlined } from '@ant-design/icons';
import { useEstimateEditorStore } from '@/stores/estimateEditorStore';

interface MoveToSectionModalProps {
  open: boolean;
  onClose: () => void;
}

export const MoveToSectionModal: React.FC<MoveToSectionModalProps> = ({ 
  open, 
  onClose 
}) => {
  const { sections, moveSelectedItems, addSection } = useEstimateEditorStore();
  
  const handleMove = (sectionId: string) => {
    moveSelectedItems(sectionId);
    onClose();
  };
  
  const handleCreateAndMove = async () => {
    const newSection = await addSection('New Section');
    if (newSection) {
      moveSelectedItems(newSection.id);
    }
    onClose();
  };
  
  return (
    <Modal
      title="Move to Section"
      open={open}
      onCancel={onClose}
      footer={null}
      width={400}
    >
      <List
        dataSource={sections}
        renderItem={(section) => (
          <List.Item
            style={{ cursor: 'pointer', padding: '12px 16px' }}
            onClick={() => handleMove(section.id)}
          >
            <FolderOutlined style={{ marginRight: 12 }} />
            {section.name}
            <span style={{ marginLeft: 'auto', color: '#6b7280' }}>
              {section.items.length} items
            </span>
          </List.Item>
        )}
      />
      
      <Button 
        type="dashed" 
        block 
        icon={<PlusOutlined />}
        onClick={handleCreateAndMove}
        style={{ marginTop: 12 }}
      >
        Create New Section & Move
      </Button>
    </Modal>
  );
};
```

---

## ⌨️ 키보드 단축키

```tsx
// hooks/useKeyboardShortcuts.ts

import { useEffect } from 'react';
import { useEstimateEditorStore } from '@/stores/estimateEditorStore';

export function useKeyboardShortcuts() {
  const { 
    selectedItemIds,
    copySelectedItems,
    cutSelectedItems,
    pasteItems,
    deleteSelectedItems,
    selectAll,
    deselectAll,
    clipboard
  } = useEstimateEditorStore();
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 입력 필드에서는 무시
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }
      
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;
      
      // Ctrl/Cmd + A: 전체 선택
      if (modifier && e.key === 'a') {
        e.preventDefault();
        selectAll();
      }
      
      // Ctrl/Cmd + C: 복사
      if (modifier && e.key === 'c' && selectedItemIds.size > 0) {
        e.preventDefault();
        copySelectedItems();
      }
      
      // Ctrl/Cmd + X: 잘라내기
      if (modifier && e.key === 'x' && selectedItemIds.size > 0) {
        e.preventDefault();
        cutSelectedItems();
      }
      
      // Ctrl/Cmd + V: 붙여넣기
      if (modifier && e.key === 'v' && clipboard.items.length > 0) {
        e.preventDefault();
        // 현재 포커스된 섹션에 붙여넣기
        // 또는 모달 열기
      }
      
      // Delete/Backspace: 삭제
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedItemIds.size > 0) {
        e.preventDefault();
        deleteSelectedItems();
      }
      
      // Escape: 선택 해제
      if (e.key === 'Escape') {
        deselectAll();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItemIds, clipboard]);
}
```

---

## 🎨 스타일

```css
/* styles/estimate-editor.css */

.estimate-editor {
  padding-bottom: 100px; /* BulkActionBar 공간 */
}

.section {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-bottom: 16px;
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  gap: 8px;
}

.section-name {
  font-weight: 600;
  flex: 1;
}

.section-subtotal {
  font-weight: 600;
  color: #111827;
  margin-right: 16px;
}

.drag-handle {
  cursor: grab;
  color: #9ca3af;
  padding: 4px;
}

.drag-handle:hover {
  color: #6b7280;
}

.line-item-row {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #f3f4f6;
  gap: 12px;
  transition: background 0.15s;
}

.line-item-row:hover {
  background: #f9fafb;
}

.line-item-row.selected {
  background: #eff6ff;
}

.line-item-row:last-child {
  border-bottom: none;
}

.item-name {
  flex: 2;
}

.item-quantity,
.item-unit,
.item-price {
  flex: 0 0 auto;
}

.item-total {
  width: 100px;
  text-align: right;
  font-weight: 600;
}

/* Bulk Action Bar Animation */
.bulk-action-bar {
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    transform: translateX(-50%) translateY(100px);
    opacity: 0;
  }
  to {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
  }
}
```

---

## 📋 구현 체크리스트

### Phase 1: 기본 Section 관리
- [ ] DB 스키마 변경 (estimate_sections, invoice_sections)
- [ ] Backend API 구현 (CRUD)
- [ ] Frontend Section 컴포넌트
- [ ] Section 접기/펴기
- [ ] Section 이름 변경

### Phase 2: Line Item 선택 및 일괄 작업
- [ ] Multi-select 체크박스
- [ ] BulkActionBar 컴포넌트
- [ ] 일괄 삭제 기능
- [ ] Bulk API 구현

### Phase 3: 복사/붙여넣기
- [ ] 클립보드 상태 관리
- [ ] 복사 기능
- [ ] 붙여넣기 기능
- [ ] 키보드 단축키

### Phase 4: 드래그 앤 드롭
- [ ] @dnd-kit 설정
- [ ] Section 순서 변경
- [ ] Line Item 이동 (같은 Section 내)
- [ ] Line Item 이동 (Section 간)

### Phase 5: UX 개선
- [ ] 애니메이션 추가
- [ ] 모바일 터치 지원
- [ ] Undo/Redo (선택)

---

## 🔗 필요한 라이브러리

```bash
# 드래그 앤 드롭
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities

# 이미 있음
# - zustand (상태관리)
# - framer-motion (애니메이션)
# - antd (UI)
```

---

*Last Updated: 2026-01-26*
