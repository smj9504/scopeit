/**
 * ScopeIt - Customers List Page
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Input, Card, Modal, Form, message, Spin } from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  UserOutlined,
  MailOutlined,
  PhoneOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { colors, fonts } from '@/styles/theme';
import { customerService } from '@/services/customerService';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { Customer, CustomerCreate } from '@/types/entities';
import type { ColumnsType } from 'antd/es/table';

const CustomersListPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form] = Form.useForm();
  const isMobile = useIsMobile();

  // Fetch customers
  const { data, isLoading } = useQuery({
    queryKey: ['customers', search],
    queryFn: () => customerService.getList({ search: search || undefined, limit: 100 }),
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: CustomerCreate) => customerService.create(data),
    onSuccess: () => {
      message.success('Customer created successfully');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setModalOpen(false);
      form.resetFields();
    },
    onError: () => {
      message.error('Failed to create customer');
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CustomerCreate> }) =>
      customerService.update(id, data),
    onSuccess: () => {
      message.success('Customer updated successfully');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setModalOpen(false);
      setEditingCustomer(null);
      form.resetFields();
    },
    onError: () => {
      message.error('Failed to update customer');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => customerService.delete(id),
    onSuccess: () => {
      message.success('Customer deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: () => {
      message.error('Failed to delete customer');
    },
  });

  const handleOpenModal = (customer?: Customer) => {
    if (customer) {
      setEditingCustomer(customer);
      form.setFieldsValue({
        name: customer.name,
        contactName: customer.contactName,
        email: customer.email,
        phone: customer.phone,
        addressLine1: customer.addressLine1,
        addressLine2: customer.addressLine2,
        city: customer.city,
        state: customer.state,
        zipcode: customer.zipcode,
        notes: customer.notes,
      });
    } else {
      setEditingCustomer(null);
      form.resetFields();
    }
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingCustomer(null);
    form.resetFields();
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingCustomer) {
        updateMutation.mutate({ id: editingCustomer.id, data: values });
      } else {
        createMutation.mutate(values);
      }
    } catch (error) {
      // Validation error
    }
  };

  const handleDelete = () => {
    if (!editingCustomer) return;
    Modal.confirm({
      title: 'Delete Customer',
      icon: <ExclamationCircleOutlined />,
      content: `Are you sure you want to delete "${editingCustomer.name}"? This action cannot be undone.`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: () => {
        deleteMutation.mutate(editingCustomer.id);
        handleCloseModal();
      },
    });
  };

  const columns: ColumnsType<Customer> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      width: 150,
      ellipsis: true,
      render: (text, record) => (
        <div>
          <div style={{ fontWeight: 600, color: colors.textPrimary }}>{text}</div>
          {record.contactName && (
            <div style={{ fontSize: 13, color: colors.textSecondary }}>{record.contactName}</div>
          )}
        </div>
      ),
    },
    {
      title: 'Contact',
      key: 'contact',
      width: 180,
      ellipsis: true,
      render: (_, record) => (
        <div style={{ fontSize: 13 }}>
          {record.email && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: colors.textSecondary }}>
              <MailOutlined /> {record.email}
            </div>
          )}
          {record.phone && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: colors.textSecondary, marginTop: 4 }}>
              <PhoneOutlined /> {record.phone}
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Location',
      key: 'location',
      width: 120,
      ellipsis: true,
      responsive: ['md'] as const,
      render: (_, record) => (
        <span style={{ color: colors.textSecondary }}>
          {[record.city, record.state].filter(Boolean).join(', ') || '-'}
        </span>
      ),
    },
  ];

  const customers = data?.items || [];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontFamily: fonts.heading, fontSize: 24, fontWeight: 700, margin: 0 }}>Customers</h1>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          size="large"
          onClick={() => handleOpenModal()}
          style={{ background: colors.primary, fontWeight: 600, height: 44, borderRadius: 8 }}
        >
          Add Customer
        </Button>
      </div>

      {/* Search */}
      <Card style={{ borderRadius: 12, marginBottom: 16 }} styles={{ body: { padding: '16px 20px' } }}>
        <Input
          placeholder="Search customers..."
          prefix={<SearchOutlined style={{ color: colors.textMuted }} />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: isMobile ? '100%' : 300 }}
          size="large"
          allowClear
        />
      </Card>

      {/* Table */}
      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
        <Spin spinning={isLoading}>
          <Table
            columns={columns}
            dataSource={customers}
            rowKey="id"
            scroll={isMobile ? { x: 380 } : undefined}
            pagination={{ pageSize: 20, showTotal: (total) => `${total} customers` }}
            onRow={(record) => ({
              onClick: () => handleOpenModal(record),
              style: { cursor: 'pointer' },
            })}
            locale={{
              emptyText: (
                <div style={{ padding: 48, textAlign: 'center' }}>
                  <UserOutlined style={{ fontSize: 48, color: colors.textMuted, marginBottom: 16 }} />
                  <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>No customers yet</div>
                  <div style={{ color: colors.textSecondary, marginBottom: 24 }}>
                    Add your first customer to get started
                  </div>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
                    Add Customer
                  </Button>
                </div>
              ),
            }}
          />
        </Spin>
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        title={editingCustomer ? 'Edit Customer' : 'Add Customer'}
        open={modalOpen}
        onCancel={handleCloseModal}
        afterOpenChange={(open) => {
          if (open && editingCustomer) {
            form.setFieldsValue({
              name: editingCustomer.name,
              contactName: editingCustomer.contactName,
              email: editingCustomer.email,
              phone: editingCustomer.phone,
              addressLine1: editingCustomer.addressLine1,
              addressLine2: editingCustomer.addressLine2,
              city: editingCustomer.city,
              state: editingCustomer.state,
              zipcode: editingCustomer.zipcode,
              notes: editingCustomer.notes,
            });
          }
        }}
        footer={
          <div style={{ display: 'flex', justifyContent: editingCustomer ? 'space-between' : 'flex-end' }}>
            {editingCustomer && (
              <Button danger onClick={handleDelete}>
                Delete
              </Button>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={handleCloseModal}>Cancel</Button>
              <Button
                type="primary"
                onClick={handleSubmit}
                loading={createMutation.isPending || updateMutation.isPending}
                style={{ background: colors.primary }}
              >
                {editingCustomer ? 'Save Changes' : 'Add Customer'}
              </Button>
            </div>
          </div>
        }
      >
        <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
          <Form.Item name="name" label="Company / Customer Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="ABC Corporation" />
          </Form.Item>
          <Form.Item name="contactName" label="Contact Name">
            <Input placeholder="John Smith" />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Please enter a valid email' }]}>
            <Input placeholder="john@example.com" />
          </Form.Item>
          <Form.Item name="phone" label="Phone">
            <Input placeholder="555-0100" />
          </Form.Item>
          <Form.Item name="addressLine1" label="Address">
            <Input placeholder="123 Main St" />
          </Form.Item>
          <Form.Item name="addressLine2">
            <Input placeholder="Suite 100 (optional)" />
          </Form.Item>
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item name="city" label="City" style={{ flex: 1 }}>
              <Input placeholder="New York" />
            </Form.Item>
            <Form.Item name="state" label="State" style={{ width: 100 }}>
              <Input placeholder="NY" />
            </Form.Item>
            <Form.Item name="zipcode" label="ZIP" style={{ width: 100 }}>
              <Input placeholder="10001" />
            </Form.Item>
          </div>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea placeholder="Additional notes about this customer..." rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </motion.div>
  );
};

export default CustomersListPage;
