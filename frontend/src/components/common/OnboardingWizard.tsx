import React, { useState } from 'react';
import { Modal, Steps, Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  FileTextOutlined,
  DollarOutlined,
  UserOutlined,
  SettingOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { colors, fonts } from '@/styles/theme';

interface OnboardingWizardProps {
  userId: string;
  open: boolean;
  onClose: () => void;
}

const TOTAL_STEPS = 3;

const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ userId, open, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const navigate = useNavigate();

  const handleComplete = () => {
    localStorage.setItem(`onboarding_${userId}`, 'done');
    onClose();
  };

  const handleSkip = () => {
    localStorage.setItem(`onboarding_${userId}`, 'done');
    onClose();
  };

  const handleNext = () => {
    if (currentStep < TOTAL_STEPS - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const featureCards = [
    {
      icon: <FileTextOutlined style={{ fontSize: 22, color: colors.primary }} />,
      title: 'Estimates',
      description: 'Build detailed estimates with line items and send them to customers.',
    },
    {
      icon: <DollarOutlined style={{ fontSize: 22, color: colors.primary }} />,
      title: 'Invoices',
      description: 'Convert approved estimates to invoices and track payments.',
    },
    {
      icon: <UserOutlined style={{ fontSize: 22, color: colors.primary }} />,
      title: 'Customers',
      description: 'Manage your customer list and attach them to documents.',
    },
  ];

  const settingsChecklist = [
    'Company name, logo, and contact info',
    'Default tax rate for estimates',
    'Custom document numbering format',
    'Branding on PDF exports',
  ];

  const stepContent: React.ReactNode[] = [
    // Step 1 — Welcome
    <div key="step-0">
      <h2
        style={{
          fontFamily: fonts.heading,
          fontSize: 22,
          fontWeight: 700,
          color: colors.textPrimary,
          margin: '0 0 8px',
        }}
      >
        Welcome to ScopeIt! 🎉
      </h2>
      <p style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 28 }}>
        ScopeIt helps restoration contractors create estimates, track invoices, and manage customers — all in one place.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {featureCards.map((card) => (
          <div
            key={card.title}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 14,
              padding: '14px 16px',
              borderRadius: 10,
              border: `1px solid ${colors.border}`,
              background: colors.bgLight,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: colors.bgWhite,
                border: `1px solid ${colors.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {card.icon}
            </div>
            <div>
              <div
                style={{
                  fontFamily: fonts.heading,
                  fontWeight: 600,
                  fontSize: 14,
                  color: colors.textPrimary,
                  marginBottom: 2,
                }}
              >
                {card.title}
              </div>
              <div style={{ fontSize: 13, color: colors.textSecondary }}>{card.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>,

    // Step 2 — Set Up Company
    <div key="step-1">
      <h2
        style={{
          fontFamily: fonts.heading,
          fontSize: 22,
          fontWeight: 700,
          color: colors.textPrimary,
          margin: '0 0 8px',
        }}
      >
        Set up your company
      </h2>
      <p style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 24 }}>
        Add your company details for professional estimates and invoices.
      </p>
      <div style={{ marginBottom: 24 }}>
        {settingsChecklist.map((item) => (
          <div
            key={item}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 0',
              borderBottom: `1px solid ${colors.border}`,
            }}
          >
            <CheckCircleOutlined style={{ fontSize: 16, color: colors.textMuted }} />
            <span style={{ fontSize: 14, color: colors.textPrimary }}>{item}</span>
          </div>
        ))}
      </div>
      <Button
        icon={<SettingOutlined />}
        onClick={() => {
          navigate('/app/settings');
          handleComplete();
        }}
        style={{ borderRadius: 6, fontWeight: 600 }}
      >
        Go to Settings
      </Button>
    </div>,

    // Step 3 — Get Started
    <div key="step-2" style={{ textAlign: 'center' }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: colors.bgLight,
          border: `1px solid ${colors.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
        }}
      >
        <FileTextOutlined style={{ fontSize: 28, color: colors.primary }} />
      </div>
      <h2
        style={{
          fontFamily: fonts.heading,
          fontSize: 22,
          fontWeight: 700,
          color: colors.textPrimary,
          margin: '0 0 8px',
        }}
      >
        You're all set!
      </h2>
      <p
        style={{
          color: colors.textSecondary,
          fontSize: 14,
          marginBottom: 28,
          maxWidth: 320,
          margin: '0 auto 28px',
        }}
      >
        Start by creating your first estimate — it only takes a minute.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
        <Button
          type="primary"
          size="large"
          icon={<FileTextOutlined />}
          onClick={() => {
            handleComplete();
            navigate('/app/estimates/new');
          }}
          style={{
            background: colors.primary,
            fontWeight: 600,
            borderRadius: 8,
            width: 220,
            height: 44,
          }}
        >
          Create Estimate
        </Button>
        <Button
          size="large"
          onClick={() => {
            handleComplete();
            navigate('/app/dashboard');
          }}
          style={{ borderRadius: 8, width: 220, height: 44, fontWeight: 600 }}
        >
          Explore Dashboard
        </Button>
      </div>
    </div>,
  ];

  const isLastStep = currentStep === TOTAL_STEPS - 1;

  return (
    <Modal
      open={open}
      footer={null}
      closable={false}
      maskClosable={false}
      width={480}
      styles={{ body: { padding: '32px 32px 24px' } }}
    >
      <Steps
        current={currentStep}
        size="small"
        style={{ marginBottom: 28 }}
        items={[
          { title: 'Welcome' },
          { title: 'Company' },
          { title: 'Get Started' },
        ]}
      />

      <div style={{ minHeight: 280 }}>{stepContent[currentStep]}</div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 28,
          paddingTop: 20,
          borderTop: `1px solid ${colors.border}`,
        }}
      >
        <button
          onClick={handleSkip}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: colors.textMuted,
            fontSize: 13,
            padding: 0,
          }}
        >
          Skip for now
        </button>

        <div style={{ display: 'flex', gap: 8 }}>
          {currentStep > 0 && (
            <Button onClick={handleBack} style={{ borderRadius: 6 }}>
              Back
            </Button>
          )}
          {!isLastStep && (
            <Button
              type="primary"
              onClick={handleNext}
              style={{ background: colors.primary, borderRadius: 6, fontWeight: 600 }}
            >
              Next
            </Button>
          )}
          {isLastStep && (
            <Button
              type="primary"
              onClick={handleComplete}
              style={{ background: colors.primary, borderRadius: 6, fontWeight: 600 }}
            >
              Get Started
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default OnboardingWizard;
