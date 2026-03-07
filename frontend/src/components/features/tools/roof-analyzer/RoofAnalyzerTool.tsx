/**
 * ScopeIt - Roof Analyzer Tool
 * Placeholder - full EagleView parsing + SVG visualization TBD.
 */
import React from 'react';
import { Card, Typography, Upload, Button } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import type { ToolComponentProps } from '../registry';
import { colors, fonts, borderRadius } from '@/styles/theme';

const { Title, Text } = Typography;

const RoofAnalyzerTool: React.FC<ToolComponentProps> = () => {
  return (
    <div>
      <Card style={{ borderRadius: borderRadius.lg, marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0, marginBottom: 8, fontFamily: fonts.heading }}>
          Roof Analyzer
        </Title>
        <Text style={{ color: colors.textSecondary }}>
          Upload an EagleView measurement file (XML, JSON, or PDF) to begin analysis.
        </Text>

        <div style={{ marginTop: 24 }}>
          <Upload accept=".xml,.json,.pdf" maxCount={1}>
            <Button icon={<UploadOutlined />}>
              Upload EagleView File
            </Button>
          </Upload>
        </div>
      </Card>

      <Card
        style={{
          borderRadius: borderRadius.lg,
          minHeight: 400,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: colors.bgLight,
          borderStyle: 'dashed',
        }}
      >
        <Text style={{ color: colors.textMuted }}>
          Roof visualization will appear here after upload
        </Text>
      </Card>
    </div>
  );
};

export default RoofAnalyzerTool;
