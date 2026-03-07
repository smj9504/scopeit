/**
 * ScopeIt - Packing & Moving Estimator
 * Placeholder - implementation will be provided separately.
 */
import React from 'react';
import { Card, Typography } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import type { ToolComponentProps } from '../registry';
import { colors, fonts, borderRadius } from '@/styles/theme';

const { Title, Text } = Typography;

const PackingTool: React.FC<ToolComponentProps> = () => {
  return (
    <Card style={{ borderRadius: borderRadius.lg }}>
      <div style={{ textAlign: 'center', padding: 48 }}>
        <InboxOutlined style={{ fontSize: 48, color: colors.textMuted, marginBottom: 16 }} />
        <Title level={4} style={{ fontFamily: fonts.heading }}>
          Packing & Moving Estimator
        </Title>
        <Text style={{ color: colors.textSecondary }}>
          Implementation coming soon. This tool will support parameter-based and
          photo-upload estimation for packing and moving jobs.
        </Text>
      </div>
    </Card>
  );
};

export default PackingTool;
