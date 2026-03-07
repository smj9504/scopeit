/**
 * ScopeIt - Line Items List Page
 */
import React, { useState, useMemo } from 'react';
import {
  Table,
  Button,
  Input,
  Select,
  Card,
  Modal,
  Form,
  InputNumber,
  Switch,
  message,
  Dropdown,
  Tag,
  Spin,
  Divider,
  Popconfirm,
  AutoComplete,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  MoreOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  UnorderedListOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { colors, fonts } from '@/styles/theme';
import { lineItemService, LineItemNoteCreate } from '@/services/lineItemService';
import { settingsService } from '@/services/settingsService';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { LineItem, LineItemNote, LineItemCreate } from '@/types/entities';
import type { ColumnsType } from 'antd/es/table';

const LineItemsListPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LineItem | null>(null);
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<LineItem | null>(null);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [form] = Form.useForm();
  const isMobile = useIsMobile();

  // Fetch line items
  const { data, isLoading } = useQuery({
    queryKey: ['lineItems', { search, category: categoryFilter }],
    queryFn: () => lineItemService.list({ search: search || undefined, category: categoryFilter }),
  });

  // Fetch categories from Settings
  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ['lineItemCategories'],
    queryFn: () => settingsService.categories.list(),
    staleTime: 30000, // Cache for 30 seconds
  });

  // Fetch units from Settings
  const { data: units = [], isLoading: unitsLoading } = useQuery({
    queryKey: ['lineItemUnits'],
    queryFn: () => settingsService.units.list(),
    staleTime: 30000, // Cache for 30 seconds
  });

  // Create category mutation (for auto-creating new categories)
  const createCategoryMutation = useMutation({
    mutationFn: (name: string) => {
      // Generate a random color from preset colors
      const colorPresets = [
        '#6b7280', '#ef4444', '#f59e0b', '#eab308', '#22c55e',
        '#10b981', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1',
        '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
      ];
      const randomColor = colorPresets[Math.floor(Math.random() * colorPresets.length)];
      
      return settingsService.categories.create({
        name: name.trim(),
        color: randomColor,
        is_default: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lineItemCategories'] });
    },
    onError: (error: any) => {
      // If category already exists, that's okay - just continue
      if (error?.response?.status !== 409) {
        console.error('Failed to create category:', error);
      }
    },
  });

  // Create unit mutation (for auto-creating new units)
  const createUnitMutation = useMutation({
    mutationFn: (name: string) => {
      return settingsService.units.create({
        name: name.trim(),
        label: name.trim(), // Use name as label if not provided
        is_default: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lineItemUnits'] });
    },
    onError: (error: any) => {
      // If unit already exists, that's okay - just continue
      if (error?.response?.status !== 409) {
        console.error('Failed to create unit:', error);
      }
    },
  });

  // Create line item mutation
  const createMutation = useMutation({
    mutationFn: (data: LineItemCreate) => lineItemService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lineItems'] });
      message.success('Line item created');
      handleCloseModal();
    },
    onError: () => message.error('Failed to create line item'),
  });

  // Update line item mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<LineItemCreate> }) => lineItemService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lineItems'] });
      message.success('Line item updated');
      handleCloseModal();
    },
    onError: () => message.error('Failed to update line item'),
  });

  // Delete line item mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => lineItemService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lineItems'] });
      message.success('Line item deleted');
    },
    onError: () => message.error('Failed to delete line item'),
  });

  // Duplicate line item mutation
  const duplicateMutation = useMutation({
    mutationFn: (id: string) => lineItemService.duplicate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lineItems'] });
      message.success('Line item duplicated');
    },
    onError: () => message.error('Failed to duplicate line item'),
  });

  // Add note mutation
  const addNoteMutation = useMutation({
    mutationFn: ({ lineItemId, data }: { lineItemId: string; data: LineItemNoteCreate }) =>
      lineItemService.createNote(lineItemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lineItems'] });
      setNewNoteContent('');
      message.success('Note added');
    },
    onError: () => message.error('Failed to add note'),
  });

  // Delete note mutation
  const deleteNoteMutation = useMutation({
    mutationFn: ({ lineItemId, noteId }: { lineItemId: string; noteId: string }) =>
      lineItemService.deleteNote(lineItemId, noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lineItems'] });
      message.success('Note deleted');
    },
    onError: () => message.error('Failed to delete note'),
  });

  const columns: ColumnsType<LineItem> = [
    {
      title: 'Code',
      dataIndex: 'code',
      key: 'code',
      width: 80,
      ellipsis: true,
      responsive: ['md'] as const,
      render: (text) => (
        <span style={{ fontFamily: 'monospace', color: colors.textSecondary }}>{text || '-'}</span>
      ),
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      width: 150,
      ellipsis: true,
      render: (text, record) => (
        <div>
          <div style={{ fontWeight: 600, color: colors.textPrimary }}>{text}</div>
          {record.includes && !isMobile && (
            <div style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>{record.includes}</div>
          )}
        </div>
      ),
    },
    {
      title: 'Category',
      dataIndex: 'cat',
      key: 'cat',
      width: 100,
      ellipsis: true,
      responsive: ['lg'] as const,
      render: (cat) => cat && <Tag style={{ border: 'none', background: colors.bgLight }}>{cat}</Tag>,
    },
    {
      title: 'Unit',
      dataIndex: 'unit',
      key: 'unit',
      width: 60,
      render: (unit) => <span style={{ color: colors.textSecondary }}>{unit || '-'}</span>,
    },
    {
      title: 'Price',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 80,
      align: 'right',
      render: (price) => <span style={{ fontWeight: 600 }}>${(price || 0).toFixed(2)}</span>,
    },
    {
      title: 'Notes',
      key: 'notes',
      width: 70,
      align: 'center',
      responsive: ['lg'] as const,
      render: (_, record) => (
        <Button
          type="text"
          size="small"
          icon={<FileTextOutlined />}
          onClick={() => {
            setSelectedItem(record);
            setNotesModalOpen(true);
          }}
          style={{
            color: record.notes && record.notes.length > 0 ? colors.primary : colors.textMuted,
          }}
        >
          {record.notes?.length || 0}
        </Button>
      ),
    },
    {
      title: 'Taxable',
      dataIndex: 'isTaxable',
      key: 'isTaxable',
      width: 70,
      responsive: ['md'] as const,
      render: (taxable) => (
        <span style={{ color: taxable ? colors.success : colors.textMuted }}>{taxable ? 'Yes' : 'No'}</span>
      ),
    },
    {
      title: 'Visibility',
      dataIndex: 'visibility',
      key: 'visibility',
      width: 90,
      responsive: ['lg'] as const,
      render: (visibility) => (
        <Tag
          style={{
            border: 'none',
            background: visibility === 'company' ? '#dbeafe' : '#f3f4f6',
            color: visibility === 'company' ? '#1d4ed8' : '#6b7280',
          }}
        >
          {visibility === 'company' ? 'Shared' : 'Private'}
        </Tag>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      render: (_, record) => (
        <Dropdown
          menu={{
            items: [
              {
                key: 'edit',
                icon: <EditOutlined />,
                label: 'Edit',
                onClick: () => {
                  setEditingItem(record);
                  form.setFieldsValue({
                    code: record.code,
                    name: record.name,
                    includes: record.includes,
                    unit: record.unit,
                    unitPrice: record.unitPrice,
                    cat: record.cat,
                    isTaxable: record.isTaxable,
                    visibility: record.visibility,
                  });
                  setModalOpen(true);
                },
              },
              {
                key: 'notes',
                icon: <FileTextOutlined />,
                label: 'Manage Notes',
                onClick: () => {
                  setSelectedItem(record);
                  setNotesModalOpen(true);
                },
              },
              {
                key: 'duplicate',
                icon: <CopyOutlined />,
                label: 'Duplicate',
                onClick: () => duplicateMutation.mutate(record.id),
              },
              { type: 'divider' },
              {
                key: 'delete',
                icon: <DeleteOutlined />,
                label: 'Delete',
                danger: true,
                onClick: () => deleteMutation.mutate(record.id),
              },
            ],
          }}
          trigger={['click']}
        >
          <Button type="text" icon={<MoreOutlined />} />
        </Dropdown>
      ),
    },
  ];

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      
      // Handle unit - ensure new units are created
      let unitValue: string | undefined = undefined;
      if (values.unit) {
        unitValue = values.unit;
        // Create if it's a new unit
        if (unitValue && !availableUnits.some(u => u.value === unitValue)) {
          createUnitMutation.mutate(unitValue);
        }
      }
      
      // Handle category - single value only
      let catValue: string | undefined = undefined;
      if (values.cat) {
        catValue = values.cat;
      }
      
      const payload: LineItemCreate = {
        code: values.code || undefined,
        name: values.name,
        includes: values.includes || undefined,
        unit: unitValue || undefined,
        unitPrice: values.unitPrice,
        cat: catValue,
        isTaxable: values.isTaxable ?? true,
        visibility: values.visibility || 'private',
      };

      if (editingItem) {
        updateMutation.mutate({ id: editingItem.id, data: payload });
      } else {
        createMutation.mutate(payload);
      }
    } catch (error) {
      // Validation error
    }
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingItem(null);
    form.resetFields();
  };

  const handleAddNote = () => {
    if (!selectedItem || !newNoteContent.trim()) return;

    addNoteMutation.mutate({
      lineItemId: selectedItem.id,
      data: {
        content: newNoteContent.trim(),
        order_index: selectedItem.notes?.length || 0,
      },
    });
  };

  const handleDeleteNote = (noteId: string) => {
    if (!selectedItem) return;
    deleteNoteMutation.mutate({ lineItemId: selectedItem.id, noteId });
  };

  // Refresh selected item when notes change
  const refreshedSelectedItem = selectedItem
    ? data?.items?.find((item) => item.id === selectedItem.id) || selectedItem
    : null;

  // Get category names from Settings (only active categories)
  const availableCategories = useMemo(() => {
    if (!categories || categories.length === 0) {
      return [];
    }
    // Filter active categories and map to names
    // Note: We show all categories (both active and inactive) to ensure users can see all options
    const result = categories
      .map((cat) => cat.name)
      .filter((name) => name && name.trim()) // Filter out empty names
      .sort();
    return result;
  }, [categories]);

  // Get unit options from Settings
  const availableUnits = useMemo(() => {
    if (!units || units.length === 0) {
      return [];
    }
    const result = units
      .map((unit) => ({
        value: unit.name,
        label: unit.label || unit.name,
      }))
      .filter((unit) => unit.value && unit.value.trim()) // Filter out empty names
      .sort((a, b) => a.label.localeCompare(b.label));
    return result;
  }, [units]);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontFamily: fonts.heading, fontSize: 24, fontWeight: 700, margin: 0 }}>Line Items</h1>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          size="large"
          onClick={() => setModalOpen(true)}
          style={{ background: colors.primary, fontWeight: 600, height: 44, borderRadius: 8 }}
        >
          Add Line Item
        </Button>
      </div>

      {/* Filters */}
      <Card style={{ borderRadius: 12, marginBottom: 16 }} styles={{ body: { padding: '16px 20px' } }}>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 12 }}>
          <Input
            placeholder="Search line items..."
            prefix={<SearchOutlined style={{ color: colors.textMuted }} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: isMobile ? '100%' : 300 }}
            size="large"
            allowClear
          />
          <Select
            placeholder="All categories"
            value={categoryFilter}
            onChange={setCategoryFilter}
            style={{ width: isMobile ? '100%' : 180 }}
            size="large"
            allowClear
            showSearch
            loading={categoriesLoading}
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
            options={availableCategories.map((cat) => ({ value: cat, label: cat }))}
          />
        </div>
      </Card>

      {/* Table */}
      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
        <Spin spinning={isLoading}>
          <Table
            columns={columns}
            dataSource={data?.items || []}
            rowKey="id"
            scroll={isMobile ? { x: 360 } : undefined}
            pagination={{
              pageSize: 20,
              total: data?.total || 0,
              showTotal: (total) => `${total} items`,
            }}
            locale={{
              emptyText: (
                <div style={{ padding: 48, textAlign: 'center' }}>
                  <UnorderedListOutlined style={{ fontSize: 48, color: colors.textMuted, marginBottom: 16 }} />
                  <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>No line items yet</div>
                  <div style={{ color: colors.textSecondary, marginBottom: 24 }}>
                    Build your library of reusable line items
                  </div>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
                    Add Line Item
                  </Button>
                </div>
              ),
            }}
          />
        </Spin>
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        title={editingItem ? 'Edit Line Item' : 'Add Line Item'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={handleCloseModal}
        okText={editingItem ? 'Save Changes' : 'Add Item'}
        okButtonProps={{
          style: { background: colors.primary },
          loading: createMutation.isPending || updateMutation.isPending,
        }}
        width={isMobile ? '100%' : 600}
        style={isMobile ? { top: 20, maxWidth: 'calc(100vw - 32px)', margin: '0 auto' } : undefined}
        styles={isMobile ? { body: { padding: '16px', maxHeight: 'calc(100vh - 180px)', overflowY: 'auto' } } : undefined}
      >
        <Form form={form} layout="vertical" style={{ marginTop: isMobile ? 16 : 24 }}>
          {/* Code + Name: Stack on mobile */}
          <div style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            gap: isMobile ? 0 : 16
          }}>
            <Form.Item
              name="code"
              label="Code"
              style={{ width: isMobile ? '100%' : 120, marginBottom: isMobile ? 12 : undefined }}
            >
              <Input placeholder="WD-001" />
            </Form.Item>
            <Form.Item
              name="name"
              label="Name"
              rules={[{ required: true }]}
              style={{ flex: 1, marginBottom: isMobile ? 12 : undefined }}
            >
              <Input placeholder="Water Extraction - Carpet" />
            </Form.Item>
          </div>

          <Form.Item name="includes" label="Description / Includes" style={{ marginBottom: isMobile ? 12 : undefined }}>
            <Input.TextArea rows={2} placeholder="Includes setup, extraction, and cleanup" />
          </Form.Item>

          {/* Unit / Unit Price / Category: 2-col grid on mobile */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr 1fr' : '120px 150px 1fr',
            gap: isMobile ? 12 : 16,
          }}>
            <Form.Item
              name="unit"
              label="Unit"
              style={{ marginBottom: isMobile ? 12 : undefined }}
            >
              <AutoComplete
                placeholder={isMobile ? 'Select' : 'Select or type'}
                allowClear
                options={availableUnits}
                filterOption={(input, option) => {
                  if (!option || !option.label) return false;
                  return String(option.label).toLowerCase().includes(input.toLowerCase());
                }}
                onBlur={(e) => {
                  const value = (e.target as HTMLInputElement).value;
                  if (value && value.trim() && !availableUnits.some(u => u.value === value)) {
                    createUnitMutation.mutate(value.trim());
                  }
                }}
              />
            </Form.Item>
            <Form.Item
              name="unitPrice"
              label="Unit Price"
              rules={[{ required: true }]}
              style={{ marginBottom: isMobile ? 12 : undefined }}
            >
              <InputNumber prefix="$" min={0} precision={2} style={{ width: '100%' }} placeholder="0.00" />
            </Form.Item>
            <Form.Item
              name="cat"
              label="Category"
              style={{
                gridColumn: isMobile ? '1 / -1' : undefined,
                marginBottom: isMobile ? 12 : undefined
              }}
            >
              <Select
                placeholder="Select category"
                allowClear
                showSearch
                loading={categoriesLoading}
                filterOption={(input, option) => {
                  if (!option || !option.label) return false;
                  return option.label.toLowerCase().includes(input.toLowerCase());
                }}
                options={availableCategories.map((c) => ({ value: c, label: c }))}
                notFoundContent={categoriesLoading ? 'Loading...' : 'No categories found'}
              />
            </Form.Item>
          </div>

          {/* Taxable + Visibility: Row on mobile with proper spacing */}
          <div style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            gap: isMobile ? 12 : 24
          }}>
            <Form.Item
              name="isTaxable"
              label="Taxable"
              valuePropName="checked"
              initialValue={true}
              style={{ marginBottom: isMobile ? 8 : undefined }}
            >
              <Switch />
            </Form.Item>
            <Form.Item
              name="visibility"
              label="Visibility"
              initialValue="private"
              style={{ flex: isMobile ? 1 : undefined, marginBottom: 0 }}
            >
              <Select
                style={{ width: isMobile ? '100%' : 180 }}
                options={[
                  { value: 'private', label: 'Private (Only me)' },
                  { value: 'company', label: 'Shared (Team)' },
                ]}
              />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {/* Notes Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <FileTextOutlined style={{ flexShrink: 0 }} />
            <span style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              Notes: {refreshedSelectedItem?.name}
            </span>
          </div>
        }
        open={notesModalOpen}
        onCancel={() => {
          setNotesModalOpen(false);
          setSelectedItem(null);
          setNewNoteContent('');
        }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              onClick={() => {
                setNotesModalOpen(false);
                setSelectedItem(null);
                setNewNoteContent('');
              }}
              style={{ flex: isMobile ? 1 : undefined }}
            >
              Close
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
            value={newNoteContent}
            onChange={(e) => setNewNoteContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && newNoteContent.trim()) {
                e.preventDefault();
                handleAddNote();
              }
            }}
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
              Notes will appear when using this item.
            </span>
            <Button
              type="primary"
              size={isMobile ? 'middle' : 'small'}
              onClick={handleAddNote}
              loading={addNoteMutation.isPending}
              disabled={!newNoteContent.trim()}
              style={{ background: colors.primary, order: isMobile ? 1 : 2, flexShrink: 0 }}
            >
              Add Note
            </Button>
          </div>
        </div>

        {(refreshedSelectedItem?.notes || []).length > 0 && (
          <>
            <Divider style={{ margin: '0 0 16px 0' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(refreshedSelectedItem?.notes || []).map((note: LineItemNote) => (
                <div
                  key={note.id}
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
                    {note.content}
                  </div>
                  <Popconfirm
                    title="Delete this note?"
                    onConfirm={() => handleDeleteNote(note.id)}
                    okText="Delete"
                    okButtonProps={{ danger: true }}
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={<DeleteOutlined />}
                      danger
                      loading={deleteNoteMutation.isPending}
                      style={{ marginLeft: 8, flexShrink: 0 }}
                    />
                  </Popconfirm>
                </div>
              ))}
            </div>
          </>
        )}

        {(refreshedSelectedItem?.notes || []).length === 0 && (
          <div style={{ textAlign: 'center', color: colors.textSecondary, padding: '20px 0' }}>
            No notes yet. Add your first note above.
          </div>
        )}
      </Modal>
    </motion.div>
  );
};

export default LineItemsListPage;
