/**
 * ScopeIt Design Theme
 * Clean, minimal design system
 */

export const colors = {
  // Primary
  primary: '#111827',
  primaryHover: '#374151',
  
  // Background
  bgWhite: '#ffffff',
  bgLight: '#f9fafb',
  bgDark: '#111827',
  
  // Border
  border: '#e5e7eb',
  borderDark: '#d1d5db',
  borderDarkMode: '#1f2937',
  
  // Text
  textPrimary: '#111827',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
  textWhite: '#ffffff',
  
  // Status
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
  
  // Accent (for numbers, highlights)
  accent: '#e5e7eb',
} as const;

export const fonts = {
  heading: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  body: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
} as const;

export const fontSizes = {
  xs: '13px',
  sm: '14px',
  base: '15px',
  md: '16px',
  lg: '17px',
  xl: '20px',
  '2xl': '24px',
  '3xl': '28px',
  '4xl': '32px',
  '5xl': '48px',
} as const;

export const fontWeights = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
} as const;

export const borderRadius = {
  sm: '4px',
  base: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px',
} as const;

export const spacing = {
  0: '0',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
  20: '80px',
  24: '96px',
} as const;

export const shadows = {
  none: 'none',
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  base: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
} as const;

export const transitions = {
  fast: '0.15s ease',
  base: '0.2s ease',
  slow: '0.3s ease',
} as const;

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
} as const;

// Ant Design theme config
export const antdTheme = {
  token: {
    colorPrimary: colors.primary,
    colorBgContainer: colors.bgWhite,
    colorBorder: colors.border,
    colorText: colors.textPrimary,
    colorTextSecondary: colors.textSecondary,
    fontFamily: fonts.body,
    borderRadius: 6,
    wireframe: false,
  },
  components: {
    Button: {
      borderRadius: 6,
      controlHeight: 36,
      fontWeight: 600,
      fontSize: 14,
    },
    Input: {
      borderRadius: 6,
      controlHeight: 36,
      fontSize: 14,
    },
    InputNumber: {
      borderRadius: 6,
      controlHeight: 36,
      fontSize: 14,
    },
    Select: {
      borderRadius: 6,
      controlHeight: 36,
      fontSize: 14,
    },
    DatePicker: {
      borderRadius: 6,
      controlHeight: 36,
      fontSize: 14,
    },
    Form: {
      labelFontSize: 14,
      fontSize: 14,
    },
    Table: {
      borderRadius: 8,
      headerBg: colors.bgLight,
      fontSize: 14,
    },
    Card: {
      borderRadius: 12,
    },
    Modal: {
      borderRadius: 12,
    },
    Menu: {
      itemSelectedBg: colors.primary,
      itemSelectedColor: colors.textWhite,
      itemHoverBg: colors.bgLight,
      itemBorderRadius: 8,
      iconSize: 18,
      itemMarginInline: 0,
      itemPaddingInline: 16,
    },
  },
};

export const theme = {
  colors,
  fonts,
  fontSizes,
  fontWeights,
  borderRadius,
  spacing,
  shadows,
  transitions,
  breakpoints,
};

export type Theme = typeof theme;
export default theme;
