/**
 * ScopeIt - Tools Launcher Page
 */
import React from 'react';
import { Row, Col, Spin, Empty, Typography } from 'antd';
import { AppstoreOutlined } from '@ant-design/icons';
import { useTools } from '@/hooks/useTools';
import { ToolCard } from '@/components/features/tools/ToolCard';
import { colors, fonts } from '@/styles/theme';

const { Title, Text } = Typography;

const ToolsPage: React.FC = () => {
  const { data: tools, isLoading } = useTools();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <AppstoreOutlined style={{ fontSize: 24, color: colors.primary }} />
          <Title level={2} style={{ margin: 0, fontFamily: fonts.heading }}>
            Tools
          </Title>
        </div>
        <Text style={{ color: colors.textSecondary }}>
          Specialized tools for restoration contractors
        </Text>
      </div>

      {!tools || tools.length === 0 ? (
        <Empty description="No tools available" />
      ) : (
        <Row gutter={[16, 16]}>
          {tools.map(tool => (
            <Col key={tool.id} xs={24} sm={12} lg={8}>
              <ToolCard tool={tool} />
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
};

export default ToolsPage;
