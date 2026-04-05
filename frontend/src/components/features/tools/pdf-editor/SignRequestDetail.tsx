/**
 * ScopeIt - Sign Request Detail
 *
 * Full detail view for a single e-signature request, including:
 *  - Document & recipient information
 *  - Contextual action buttons
 *  - Full audit trail timeline
 *
 * Usage:
 *   <SignRequestDetail requestId={id} onBack={() => setDetailId(null)} />
 */
import React, { useCallback } from 'react';
import {
  Button,
  Card,
  Descriptions,
  Timeline,
  Tag,
  Space,
  Typography,
  Spin,
  App,
  Popconfirm,
} from 'antd';
import {
  ArrowLeftOutlined,
  DownloadOutlined,
  CloseCircleOutlined,
  LinkOutlined,
  BellOutlined,
  CheckCircleOutlined,
  SendOutlined,
  EyeOutlined,
  StopOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  EditOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pdfEditorApi } from './pdfEditorApi';
import type { SignRequest, SignAuditEvent } from './types';
import { colors, fonts, fontSizes, fontWeights, borderRadius, spacing } from '@/styles/theme';

const { Text, Title } = Typography;

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft:     { label: 'Draft',     color: '#6b7280' },
  sent:      { label: 'Sent',      color: '#3b82f6' },
  viewed:    { label: 'Viewed',    color: '#8b5cf6' },
  signed:    { label: 'Signed',    color: '#10b981' },
  declined:  { label: 'Declined',  color: '#ef4444' },
  expired:   { label: 'Expired',   color: '#f59e0b' },
  cancelled: { label: 'Cancelled', color: '#6b7280' },
};

// ── Audit event config ────────────────────────────────────────────────────────

interface AuditEventConfig {
  label: string;
  icon: React.ReactNode;
  dotColor: string;
}

function getAuditEventConfig(eventType: string): AuditEventConfig {
  const iconStyle = { fontSize: 14 };

  const map: Record<string, AuditEventConfig> = {
    created: {
      label: 'Created',
      icon: <FileTextOutlined style={iconStyle} />,
      dotColor: colors.textSecondary,
    },
    sent: {
      label: 'Sent',
      icon: <SendOutlined style={iconStyle} />,
      dotColor: colors.info,
    },
    viewed: {
      label: 'Viewed',
      icon: <EyeOutlined style={iconStyle} />,
      dotColor: '#8b5cf6',
    },
    signed: {
      label: 'Signed',
      icon: <CheckCircleOutlined style={iconStyle} />,
      dotColor: colors.success,
    },
    declined: {
      label: 'Declined',
      icon: <StopOutlined style={iconStyle} />,
      dotColor: colors.error,
    },
    cancelled: {
      label: 'Cancelled',
      icon: <CloseCircleOutlined style={iconStyle} />,
      dotColor: colors.textMuted,
    },
    expired: {
      label: 'Expired',
      icon: <ClockCircleOutlined style={iconStyle} />,
      dotColor: colors.warning,
    },
    reminder_sent: {
      label: 'Reminder Sent',
      icon: <BellOutlined style={iconStyle} />,
      dotColor: colors.textSecondary,
    },
  };

  return (
    map[eventType] ?? {
      label: eventType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      icon: <FileTextOutlined style={iconStyle} />,
      dotColor: colors.textMuted,
    }
  );
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface SignRequestDetailProps {
  requestId: string;
  onBack: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

const SignRequestDetail: React.FC<SignRequestDetailProps> = ({ requestId, onBack }) => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();

  // Fetch sign request
  const {
    data: req,
    isLoading: reqLoading,
    isError: reqError,
  } = useQuery<SignRequest>({
    queryKey: ['sign-request', requestId],
    queryFn: () => pdfEditorApi.getSignRequest(requestId),
  });

  // Fetch audit trail
  const { data: auditEvents = [], isLoading: auditLoading } = useQuery<SignAuditEvent[]>({
    queryKey: ['sign-audit', requestId],
    queryFn: () => pdfEditorApi.getSignAudit(requestId),
    enabled: !!req,
  });

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: () => pdfEditorApi.cancelSignRequest(requestId),
    onSuccess: () => {
      message.success('Sign request cancelled');
      queryClient.invalidateQueries({ queryKey: ['sign-request', requestId] });
      queryClient.invalidateQueries({ queryKey: ['sign-audit', requestId] });
      queryClient.invalidateQueries({ queryKey: ['sign-requests'] });
    },
    onError: () => message.error('Failed to cancel sign request'),
  });

  // Download signed document
  const handleDownload = useCallback(async () => {
    if (!req) return;
    try {
      const blob = await pdfEditorApi.downloadSignedDocument(requestId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const baseName = req.documentName
        ? req.documentName.replace(/\.[^.]+$/, '')
        : `document_${requestId}`;
      a.download = `${baseName}_signed.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      message.error('Failed to download signed document');
    }
  }, [req, requestId, message]);

  // Copy signing link
  const handleCopyLink = useCallback(() => {
    const url = `${window.location.origin}/sign/${requestId}`;
    navigator.clipboard
      .writeText(url)
      .then(() => message.success('Signing link copied to clipboard'))
      .catch(() => message.error('Failed to copy link'));
  }, [requestId, message]);

  // Send reminder
  const reminderMutation = useMutation({
    mutationFn: () => pdfEditorApi.sendReminder(requestId),
    onSuccess: () => {
      message.success('Reminder sent to the recipient');
      queryClient.invalidateQueries({ queryKey: ['sign-audit', requestId] });
    },
    onError: () => message.error('Failed to send reminder'),
  });

  const handleReminder = useCallback(() => {
    reminderMutation.mutate();
  }, [reminderMutation]);

  // ── Loading / error states ────────────────────────────────────────────────

  if (reqLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 320,
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  if (reqError || !req) {
    return (
      <div style={{ padding: spacing[6] }}>
        <Button icon={<ArrowLeftOutlined />} type="text" onClick={onBack} style={{ marginBottom: spacing[4] }}>
          Back to Sign Requests
        </Button>
        <Text type="danger">Failed to load sign request. Please try again.</Text>
      </div>
    );
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const statusCfg = STATUS_CONFIG[req.status] ?? { label: req.status, color: colors.textMuted };
  const canCancel = req.status === 'sent' || req.status === 'viewed';
  const canDownload = req.status === 'signed';
  const canReminder = req.status === 'sent' || req.status === 'viewed';

  // ── Audit timeline items ──────────────────────────────────────────────────

  const timelineItems = auditEvents.map((event) => {
    const cfg = getAuditEventConfig(event.eventType);
    const meta = event.eventMetadata as Record<string, string | undefined>;

    return {
      key: event.id,
      dot: (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: `${cfg.dotColor}18`,
            color: cfg.dotColor,
            border: `1.5px solid ${cfg.dotColor}40`,
          }}
        >
          {cfg.icon}
        </span>
      ),
      children: (
        <div style={{ paddingBottom: spacing[2] }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: spacing[2],
              marginBottom: 2,
            }}
          >
            <Text
              strong
              style={{
                fontSize: fontSizes.sm,
                color: colors.textPrimary,
                fontFamily: fonts.body,
              }}
            >
              {cfg.label}
            </Text>
            <Text
              style={{
                fontSize: fontSizes.xs,
                color: colors.textMuted,
                fontFamily: fonts.body,
              }}
            >
              {formatDateTime(event.createdAt)}
            </Text>
          </div>

          {event.actorEmail && (
            <Text
              style={{
                display: 'block',
                fontSize: fontSizes.xs,
                color: colors.textSecondary,
                fontFamily: fonts.body,
              }}
            >
              By: {event.actorEmail}
            </Text>
          )}

          {event.actorIp && (
            <Text
              style={{
                display: 'block',
                fontSize: fontSizes.xs,
                color: colors.textMuted,
                fontFamily: fonts.body,
              }}
            >
              IP: {event.actorIp}
            </Text>
          )}

          {/* Extra metadata */}
          {meta.signature_type && (
            <Text
              style={{
                display: 'block',
                fontSize: fontSizes.xs,
                color: colors.textMuted,
                fontFamily: fonts.body,
              }}
            >
              Type:{' '}
              <span style={{ textTransform: 'capitalize' }}>
                {String(meta.signature_type)}
              </span>
            </Text>
          )}

          {meta.reason && (
            <Text
              style={{
                display: 'block',
                fontSize: fontSizes.xs,
                color: colors.textMuted,
                fontFamily: fonts.body,
              }}
            >
              Reason: {String(meta.reason)}
            </Text>
          )}
        </div>
      ),
    };
  });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        width: '100%',
        padding: `${spacing[4]} ${spacing[4]}`,
        fontFamily: fonts.body,
      }}
    >
      {/* Back button */}
      <Button
        icon={<ArrowLeftOutlined />}
        type="text"
        onClick={onBack}
        style={{
          marginBottom: spacing[5],
          padding: `0 ${spacing[2]}`,
          height: 32,
          color: colors.textSecondary,
          fontFamily: fonts.body,
          fontSize: fontSizes.sm,
        }}
      >
        Back to Sign Requests
      </Button>

      {/* Page title */}
      <div style={{ marginBottom: spacing[5] }}>
        <Title
          level={4}
          style={{
            margin: 0,
            fontFamily: fonts.heading,
            fontWeight: fontWeights.semibold,
            color: colors.textPrimary,
            fontSize: fontSizes.xl,
          }}
        >
          Sign Request
        </Title>
      </div>

      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {/* Document info */}
        <Card
          size="small"
          title={
            <span
              style={{
                fontFamily: fonts.body,
                fontWeight: fontWeights.semibold,
                fontSize: fontSizes.sm,
                color: colors.textPrimary,
              }}
            >
              <FileTextOutlined style={{ marginRight: 8, color: colors.textMuted }} />
              Document
            </span>
          }
          styles={{
            body: { padding: `${spacing[3]} ${spacing[4]}` },
            header: {
              borderBottom: `1px solid ${colors.border}`,
              minHeight: 40,
              padding: `0 ${spacing[4]}`,
            },
          }}
          style={{
            borderRadius: borderRadius.lg,
            border: `1px solid ${colors.border}`,
          }}
        >
          <Descriptions
            column={2}
            size="small"
            labelStyle={{
              color: colors.textSecondary,
              fontSize: fontSizes.xs,
              fontFamily: fonts.body,
              fontWeight: fontWeights.medium,
              width: 100,
            }}
            contentStyle={{
              color: colors.textPrimary,
              fontSize: fontSizes.sm,
              fontFamily: fonts.body,
            }}
          >
            <Descriptions.Item label="Document" span={2}>
              {req.documentName ?? <Text type="secondary">—</Text>}
            </Descriptions.Item>

            <Descriptions.Item label="Status">
              <Tag
                style={{
                  color: statusCfg.color,
                  background: `${statusCfg.color}18`,
                  border: `1px solid ${statusCfg.color}40`,
                  borderRadius: borderRadius.sm,
                  fontFamily: fonts.body,
                  fontSize: fontSizes.xs,
                  fontWeight: fontWeights.medium,
                  lineHeight: '20px',
                  padding: `0 ${spacing[2]}`,
                }}
              >
                {statusCfg.label}
              </Tag>
            </Descriptions.Item>

            <Descriptions.Item label="Sent">
              {formatDate(req.sentAt)}
            </Descriptions.Item>

            {req.signedAt && (
              <Descriptions.Item label="Signed">
                {formatDate(req.signedAt)}
              </Descriptions.Item>
            )}

            {req.viewedAt && !req.signedAt && (
              <Descriptions.Item label="Viewed">
                {formatDate(req.viewedAt)}
              </Descriptions.Item>
            )}

            {req.declinedAt && (
              <Descriptions.Item label="Declined">
                {formatDate(req.declinedAt)}
              </Descriptions.Item>
            )}

            {req.expiresAt && (
              <Descriptions.Item label="Expires">
                {formatDate(req.expiresAt)}
              </Descriptions.Item>
            )}
          </Descriptions>
        </Card>

        {/* Recipient */}
        <Card
          size="small"
          title={
            <span
              style={{
                fontFamily: fonts.body,
                fontWeight: fontWeights.semibold,
                fontSize: fontSizes.sm,
                color: colors.textPrimary,
              }}
            >
              <UserOutlined style={{ marginRight: 8, color: colors.textMuted }} />
              Recipient
            </span>
          }
          styles={{
            body: { padding: `${spacing[3]} ${spacing[4]}` },
            header: {
              borderBottom: `1px solid ${colors.border}`,
              minHeight: 40,
              padding: `0 ${spacing[4]}`,
            },
          }}
          style={{
            borderRadius: borderRadius.lg,
            border: `1px solid ${colors.border}`,
          }}
        >
          <Descriptions
            column={2}
            size="small"
            labelStyle={{
              color: colors.textSecondary,
              fontSize: fontSizes.xs,
              fontFamily: fonts.body,
              fontWeight: fontWeights.medium,
              width: 100,
            }}
            contentStyle={{
              color: colors.textPrimary,
              fontSize: fontSizes.sm,
              fontFamily: fonts.body,
            }}
          >
            <Descriptions.Item label="Name">
              {req.recipientName || <Text type="secondary">—</Text>}
            </Descriptions.Item>

            <Descriptions.Item label="Email">
              {req.recipientEmail}
            </Descriptions.Item>

            {req.customerId && (
              <Descriptions.Item label="Customer ID" span={2}>
                <Text
                  style={{
                    fontSize: fontSizes.xs,
                    color: colors.textMuted,
                    fontFamily: 'monospace',
                  }}
                >
                  {req.customerId}
                </Text>
              </Descriptions.Item>
            )}
          </Descriptions>
        </Card>

        {/* Sender */}
        <Card
          size="small"
          title={
            <span
              style={{
                fontFamily: fonts.body,
                fontWeight: fontWeights.semibold,
                fontSize: fontSizes.sm,
                color: colors.textPrimary,
              }}
            >
              <EditOutlined style={{ marginRight: 8, color: colors.textMuted }} />
              Sender
            </span>
          }
          styles={{
            body: { padding: `${spacing[3]} ${spacing[4]}` },
            header: {
              borderBottom: `1px solid ${colors.border}`,
              minHeight: 40,
              padding: `0 ${spacing[4]}`,
            },
          }}
          style={{
            borderRadius: borderRadius.lg,
            border: `1px solid ${colors.border}`,
          }}
        >
          <Descriptions
            column={2}
            size="small"
            labelStyle={{
              color: colors.textSecondary,
              fontSize: fontSizes.xs,
              fontFamily: fonts.body,
              fontWeight: fontWeights.medium,
              width: 100,
            }}
            contentStyle={{
              color: colors.textPrimary,
              fontSize: fontSizes.sm,
              fontFamily: fonts.body,
            }}
          >
            <Descriptions.Item label="Name">
              {req.senderName || <Text type="secondary">—</Text>}
            </Descriptions.Item>

            <Descriptions.Item label="Email">
              {req.senderEmail}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {/* Actions */}
        {(canDownload || canCancel || canReminder || true) && (
          <Card
            size="small"
            title={
              <span
                style={{
                  fontFamily: fonts.body,
                  fontWeight: fontWeights.semibold,
                  fontSize: fontSizes.sm,
                  color: colors.textPrimary,
                }}
              >
                Actions
              </span>
            }
            styles={{
              body: { padding: `${spacing[3]} ${spacing[4]}` },
              header: {
                borderBottom: `1px solid ${colors.border}`,
                minHeight: 40,
                padding: `0 ${spacing[4]}`,
              },
            }}
            style={{
              borderRadius: borderRadius.lg,
              border: `1px solid ${colors.border}`,
            }}
          >
            <Space wrap>
              {canDownload && (
                <Button
                  icon={<DownloadOutlined />}
                  type="primary"
                  onClick={handleDownload}
                  style={{
                    fontFamily: fonts.body,
                    fontWeight: fontWeights.medium,
                    fontSize: fontSizes.sm,
                    background: colors.primary,
                    borderColor: colors.primary,
                  }}
                >
                  Download Signed PDF
                </Button>
              )}

              {canReminder && (
                <Button
                  icon={<BellOutlined />}
                  onClick={handleReminder}
                  loading={reminderMutation.isPending}
                  style={{
                    fontFamily: fonts.body,
                    fontWeight: fontWeights.medium,
                    fontSize: fontSizes.sm,
                  }}
                >
                  Send Reminder
                </Button>
              )}

              <Button
                icon={<LinkOutlined />}
                onClick={handleCopyLink}
                style={{
                  fontFamily: fonts.body,
                  fontWeight: fontWeights.medium,
                  fontSize: fontSizes.sm,
                }}
              >
                Copy Signing Link
              </Button>

              {canCancel && (
                <Popconfirm
                  title="Cancel this sign request?"
                  description="The recipient will no longer be able to sign this document."
                  okText="Cancel Request"
                  cancelText="Keep"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => cancelMutation.mutate()}
                >
                  <Button
                    icon={<CloseCircleOutlined />}
                    danger
                    loading={cancelMutation.isPending}
                    style={{
                      fontFamily: fonts.body,
                      fontWeight: fontWeights.medium,
                      fontSize: fontSizes.sm,
                    }}
                  >
                    Cancel Request
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </Card>
        )}

        {/* Audit trail */}
        <Card
          size="small"
          title={
            <span
              style={{
                fontFamily: fonts.body,
                fontWeight: fontWeights.semibold,
                fontSize: fontSizes.sm,
                color: colors.textPrimary,
              }}
            >
              Audit Trail
            </span>
          }
          styles={{
            body: { padding: `${spacing[6]} ${spacing[5]}` },
            header: {
              borderBottom: `1px solid ${colors.border}`,
              minHeight: 40,
              padding: `0 ${spacing[4]}`,
            },
          }}
          style={{
            borderRadius: borderRadius.lg,
            border: `1px solid ${colors.border}`,
          }}
        >
          {auditLoading ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: `${spacing[8]} 0`,
              }}
            >
              <Spin />
            </div>
          ) : timelineItems.length === 0 ? (
            <Text
              style={{
                color: colors.textMuted,
                fontSize: fontSizes.sm,
                fontFamily: fonts.body,
              }}
            >
              No audit events recorded yet.
            </Text>
          ) : (
            <Timeline items={timelineItems} />
          )}
        </Card>
      </Space>
    </div>
  );
};

export default SignRequestDetail;
