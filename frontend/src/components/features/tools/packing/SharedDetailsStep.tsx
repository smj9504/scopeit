/**
 * SharedDetailsStep
 * Extracted unified Details step for the packing wizard.
 * Contains: Client Information, Company Override, Estimation Settings, O&P, Contingency.
 * Special Items have been moved to per-room configuration (RoomSpecialItems).
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  Row,
  Col,
  Select,
  Input,
  InputNumber,
  Switch,
  Radio,
  Space,
  Tooltip,
  Button,
  message,
  Popconfirm,
  Typography,
} from 'antd';
import { InfoCircleOutlined, SaveOutlined, DeleteOutlined } from '@ant-design/icons';

const { Text } = Typography;
import { colors, fonts, borderRadius } from '@/styles/theme';
import { REGION_OPTIONS, DEFAULT_SETTINGS } from './constants';
import { packingApi } from './packingApi';
import CustomerSelector from '@/components/features/CustomerSelector';
import type { CustomerData } from '@/components/features/CustomerSelector';
import type { PackingSettings, ClientInfo, CompanyInfoOverride, SavedCompanyProfile } from './types';

// ── Props ────────────────────────────────────────────────────────────────────

export interface SharedDetailsStepProps {
  settings: PackingSettings;
  setSettings: React.Dispatch<React.SetStateAction<PackingSettings>>;
  clientInfo: ClientInfo;
  setClientInfo: React.Dispatch<React.SetStateAction<ClientInfo>>;
  companyOverride: CompanyInfoOverride;
  setCompanyOverride: React.Dispatch<React.SetStateAction<CompanyInfoOverride>>;
  /** When true, renders a compact single-section layout (no section titles). */
  compact?: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

const SharedDetailsStep: React.FC<SharedDetailsStepProps> = ({
  settings,
  setSettings,
  clientInfo,
  setClientInfo,
  companyOverride,
  setCompanyOverride,
  compact = false,
}) => {
  const [showCompanyOverride, setShowCompanyOverride] = useState(
    !!(companyOverride.name || companyOverride.address || companyOverride.phone || companyOverride.email),
  );
  const [profiles, setProfiles] = useState<SavedCompanyProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | undefined>(undefined);

  // Load profiles from DB on mount
  useEffect(() => {
    setProfilesLoading(true);
    packingApi.getCompanyProfiles()
      .then((loaded) => {
        setProfiles(loaded);
        // Auto-show the override section if profiles exist
        if (loaded.length > 0 && !showCompanyOverride) {
          setShowCompanyOverride(true);
        }
      })
      .catch(() => {})
      .finally(() => setProfilesLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const patchSettings = (patch: Partial<PackingSettings>) =>
    setSettings((prev) => ({ ...prev, ...patch }));

  const patchCompany = (patch: Partial<CompanyInfoOverride>) => {
    setCompanyOverride((prev) => ({ ...prev, ...patch }));
    setSelectedProfileId(undefined);
  };

  const handleSelectProfile = useCallback((profileId: string) => {
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) return;
    setCompanyOverride(profile.data);
    setSelectedProfileId(profileId);
    setShowCompanyOverride(true);
  }, [profiles, setCompanyOverride]);

  const handleSaveProfile = useCallback(async () => {
    const label = companyOverride.name?.trim();
    if (!label) {
      message.warning('Enter a company name first.');
      return;
    }
    try {
      const saved = await packingApi.saveCompanyProfile(label, companyOverride);
      // Refresh list
      const updated = await packingApi.getCompanyProfiles();
      setProfiles(updated);
      setSelectedProfileId(saved.id);
      message.success(`Saved "${label}"`);
    } catch {
      message.error('Failed to save profile.');
    }
  }, [companyOverride]);

  const handleDeleteProfile = useCallback(async (profileId: string) => {
    try {
      await packingApi.deleteCompanyProfile(profileId);
      setProfiles((prev) => prev.filter((p) => p.id !== profileId));
      if (selectedProfileId === profileId) setSelectedProfileId(undefined);
      message.success('Profile deleted');
    } catch {
      message.error('Failed to delete profile.');
    }
  }, [selectedProfileId]);

  // Convert ClientInfo <-> CustomerData for the CustomerSelector
  const customerData: CustomerData = {
    name: clientInfo.name,
    email: clientInfo.email || undefined,
    phone: clientInfo.phone || undefined,
    address: clientInfo.property_address || undefined,
  };

  const handleCustomerChange = useCallback(
    (data: CustomerData) => {
      setClientInfo({
        name: data.name || '',
        email: data.email || '',
        phone: data.phone || '',
        property_address: data.address || '',
      });
    },
    [setClientInfo],
  );

  // ── Shared helpers ─────────────────────────────────────────────────────────

  const sectionTitle = (text: string) => (
    <h4
      style={{
        fontFamily: fonts.heading,
        fontSize: 15,
        fontWeight: 700,
        color: colors.textPrimary,
        margin: '0 0 16px',
        paddingBottom: 8,
        borderBottom: `1px solid ${colors.border}`,
      }}
    >
      {text}
    </h4>
  );

  const fieldLabel = (text: string, tip?: string) => (
    <label
      style={{
        fontSize: 13,
        fontWeight: 500,
        color: colors.textSecondary,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        marginBottom: 6,
      }}
    >
      {text}
      {tip && (
        <Tooltip title={tip}>
          <InfoCircleOutlined style={{ fontSize: 12, color: colors.textMuted }} />
        </Tooltip>
      )}
    </label>
  );

  // ── Estimation Settings block (reused in both full & compact modes) ──────

  const estimationSettingsBlock = (
    <Row gutter={[16, 14]}>
      <Col xs={24} sm={12} md={8}>
        {fieldLabel('Crew Size', 'Number of workers on the job')}
        <Select
          value={settings.crew_size}
          onChange={(val) => patchSettings({ crew_size: val })}
          style={{ width: '100%' }}
          options={[2, 3, 4, 5, 6].map((n) => ({
            value: n,
            label: `${n} workers`,
          }))}
          aria-label="Crew size"
        />
      </Col>
      <Col xs={24} sm={12} md={8}>
        {fieldLabel('Region', 'Affects labor rate multiplier')}
        <Select
          value={settings.region}
          onChange={(val) => patchSettings({ region: val })}
          style={{ width: '100%' }}
          options={REGION_OPTIONS.map((o) => ({
            value: o.value,
            label: `${o.label}  ${o.description}`,
          }))}
          aria-label="Region"
        />
      </Col>
      <Col xs={24} sm={24} md={8}>
        {fieldLabel('Staging Type')}
        <Radio.Group
          value={settings.staging_type}
          onChange={(e) => patchSettings({ staging_type: e.target.value })}
          optionType="button"
          buttonStyle="solid"
          style={{ width: '100%', display: 'flex' }}
        >
          <Radio.Button value="off_site" style={{ flex: 1, textAlign: 'center', fontSize: 13, height: 32, lineHeight: '30px' }}>
            Off-site
          </Radio.Button>
          <Radio.Button value="on_site" style={{ flex: 1, textAlign: 'center', fontSize: 13, height: 32, lineHeight: '30px' }}>
            On-site
          </Radio.Button>
        </Radio.Group>
      </Col>

      {settings.staging_type === 'off_site' && (
        <Col xs={24} sm={12} md={8}>
          {fieldLabel('Storage Months', 'How long contents will be stored')}
          <InputNumber
            min={0}
            max={36}
            value={settings.storage_months}
            onChange={(val) => patchSettings({ storage_months: val ?? 0 })}
            style={{ width: '100%' }}
            addonAfter="mo"
            aria-label="Storage months"
          />
        </Col>
      )}

      <Col xs={24} sm={12} md={8}>
        {fieldLabel('Pack-back', 'Include return delivery / unpack service')}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
          <Switch
            checked={settings.include_packback}
            onChange={(val) => patchSettings({ include_packback: val })}
            aria-label="Include pack-back"
          />
          <span style={{ fontSize: 13, color: colors.textSecondary }}>
            {settings.include_packback ? 'Included' : 'Not included'}
          </span>
        </div>
      </Col>
    </Row>
  );

  // ── O&P block ─────────────────────────────────────────────────────────────

  const opContingencyBlock = (
    <Row gutter={[16, 14]}>
      {/* O&P */}
      <Col xs={24} sm={12} md={8}>
        {fieldLabel('O&P', 'Overhead & Profit percentage')}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
          <Switch
            checked={settings.include_op}
            onChange={(val) => patchSettings({ include_op: val })}
            aria-label="Include O&P"
          />
          {settings.include_op ? (
            <InputNumber
              min={0}
              max={30}
              value={settings.op_rate}
              onChange={(val) => patchSettings({ op_rate: val ?? DEFAULT_SETTINGS.op_rate })}
              style={{ width: 100 }}
              addonAfter="%"
              step={0.5}
              aria-label="O&P rate"
            />
          ) : (
            <span style={{ fontSize: 13, color: colors.textSecondary }}>Not included</span>
          )}
        </div>
      </Col>
      <Col xs={24} sm={12}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Text style={{ fontSize: 13, fontFamily: fonts.body }}>Material Rate</Text>
          <InputNumber
            min={10}
            max={40}
            value={settings.material_rate ?? 25}
            onChange={(val) => patchSettings({ material_rate: val ?? 25 })}
            style={{ width: 100 }}
            addonAfter="%"
            step={5}
            aria-label="Material rate"
          />
        </div>
        <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
          % of pack-out labor (industry: 15-25%)
        </div>
      </Col>
      <Col xs={24}>
        <div style={{ fontSize: 12, color: '#999' }}>
          Supplements are auto-detected based on room conditions
        </div>
      </Col>
    </Row>
  );

  // ── Company Override block (shared between compact and full modes) ────────

  const companyOverrideBlock = (
    <section>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          paddingBottom: 8,
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <h4
          style={{
            fontFamily: fonts.heading,
            fontSize: 15,
            fontWeight: 700,
            color: colors.textPrimary,
            margin: 0,
          }}
        >
          Company Override
        </h4>
        <Space size={8}>
          <span style={{ fontSize: 13, color: colors.textSecondary }}>
            {showCompanyOverride ? 'Shown' : 'Hidden'}
          </span>
          <Switch
            size="small"
            checked={showCompanyOverride}
            onChange={setShowCompanyOverride}
            aria-label="Toggle company override"
          />
        </Space>
      </div>
      {showCompanyOverride && (
        <>
          {/* Saved profiles selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Select
              placeholder={profilesLoading ? 'Loading...' : 'Select saved company...'}
              value={selectedProfileId}
              onChange={handleSelectProfile}
              loading={profilesLoading}
              allowClear
              onClear={() => {
                setSelectedProfileId(undefined);
                setCompanyOverride({});
              }}
              style={{ flex: 1 }}
              size="middle"
              options={profiles.map((p) => ({ value: p.id, label: p.label }))}
              notFoundContent={
                <span style={{ fontSize: 12, color: colors.textMuted }}>No saved profiles yet</span>
              }
            />
            <Tooltip title="Save current as profile">
              <Button
                icon={<SaveOutlined />}
                size="middle"
                onClick={handleSaveProfile}
                disabled={!companyOverride.name?.trim()}
              />
            </Tooltip>
            {selectedProfileId && (
              <Popconfirm
                title="Delete this profile?"
                onConfirm={() => handleDeleteProfile(selectedProfileId)}
                okText="Delete"
                cancelText="Cancel"
              >
                <Button
                  icon={<DeleteOutlined />}
                  size="middle"
                  danger
                />
              </Popconfirm>
            )}
          </div>

          <Row gutter={[16, 14]}>
            <Col xs={24} sm={12}>
              {fieldLabel('Company Name')}
              <Input
                placeholder="Restoration Co."
                value={companyOverride.name ?? ''}
                onChange={(e) => patchCompany({ name: e.target.value })}
                aria-label="Company name override"
              />
            </Col>
            <Col xs={24} sm={12}>
              {fieldLabel('Address')}
              <Input
                placeholder="456 Business Ave"
                value={companyOverride.address ?? ''}
                onChange={(e) => patchCompany({ address: e.target.value })}
                aria-label="Company address override"
              />
            </Col>
            <Col xs={24} sm={12}>
              {fieldLabel('Phone')}
              <Input
                placeholder="(555) 111-2222"
                value={companyOverride.phone ?? ''}
                onChange={(e) => patchCompany({ phone: e.target.value })}
                aria-label="Company phone override"
              />
            </Col>
            <Col xs={24} sm={12}>
              {fieldLabel('Email')}
              <Input
                type="email"
                placeholder="info@company.com"
                value={companyOverride.email ?? ''}
                onChange={(e) => patchCompany({ email: e.target.value })}
                aria-label="Company email override"
              />
            </Col>
          </Row>
        </>
      )}
      {!showCompanyOverride && (
        <p style={{ fontSize: 13, color: colors.textMuted, margin: 0 }}>
          Toggle on to override company info on the exported estimate.
        </p>
      )}
    </section>
  );

  // ── Compact mode: settings-only (for edit modal) ─────────────────────────

  if (compact) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <section>
          <CustomerSelector value={customerData} onChange={handleCustomerChange} />
        </section>
        {companyOverrideBlock}
        <section>{estimationSettingsBlock}</section>
        <section>{opContingencyBlock}</section>
      </div>
    );
  }

  // ── Full mode: wizard step with section titles ───────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* ── Client Information (CustomerSelector) ──── */}
      <section>
        {sectionTitle('Client Information')}
        <CustomerSelector
          value={customerData}
          onChange={handleCustomerChange}
        />
      </section>

      {/* ── Company Override ─────────────────────────────── */}
      {companyOverrideBlock}

      {/* ── Estimation Settings ──────────────────────────── */}
      <section>
        {sectionTitle('Estimation Settings')}
        {estimationSettingsBlock}
      </section>

      {/* ── O&P ───────────────────────────────────────────── */}
      <section>
        {sectionTitle('O&P')}
        {opContingencyBlock}
      </section>
    </div>
  );
};

export default SharedDetailsStep;
export { SharedDetailsStep };
