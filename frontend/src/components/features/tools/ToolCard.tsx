/**
 * ScopeIt - Tool Card
 */
import React from 'react';
import { Card, Tag, Button, Tooltip } from 'antd';
import { LockOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { Tool } from '@/types/tools';
import { colors, fonts, borderRadius } from '@/styles/theme';

interface ToolCardProps {
  tool: Tool;
}

export const ToolCard: React.FC<ToolCardProps> = ({ tool }) => {
  const navigate = useNavigate();

  const handleLaunch = () => {
    if (tool.hasAccess) {
      navigate(`/app/tools/${tool.id}`);
    }
  };

  return (
    <Card
      hoverable={tool.hasAccess}
      style={{
        borderRadius: borderRadius.lg,
        opacity: tool.hasAccess ? 1 : 0.6,
        cursor: tool.hasAccess ? 'pointer' : 'default',
        height: '100%',
      }}
      onClick={handleLaunch}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{
            fontSize: 13,
            color: colors.textMuted,
            marginBottom: 4,
            fontWeight: 500,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.5px',
          }}>
            {tool.category}
          </div>
          <h3 style={{
            margin: 0,
            fontSize: 16,
            fontFamily: fonts.heading,
            fontWeight: 700,
            color: colors.textPrimary,
          }}>
            {tool.name}
          </h3>
        </div>
        {!tool.hasAccess && (
          <Tooltip title={`Requires ${tool.requiredPlan} plan`}>
            <LockOutlined style={{ color: colors.textMuted, fontSize: 16 }} />
          </Tooltip>
        )}
      </div>

      <p style={{
        marginTop: 8,
        marginBottom: 16,
        fontSize: 14,
        color: colors.textSecondary,
        lineHeight: 1.5,
      }}>
        {tool.description}
      </p>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {tool.tags.slice(0, 2).map(tag => (
            <Tag key={tag} style={{ fontSize: 11, margin: 0 }}>{tag}</Tag>
          ))}
        </div>
        {tool.hasAccess ? (
          <Button
            type="primary"
            size="small"
            icon={<ArrowRightOutlined />}
            onClick={(e) => { e.stopPropagation(); handleLaunch(); }}
          >
            Launch
          </Button>
        ) : (
          <Button size="small" disabled>
            Upgrade
          </Button>
        )}
      </div>
    </Card>
  );
};
