/**
 * ScopeIt - Auth Types
 */

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  avatarUrl?: string;
  companyId: string;
  role: 'admin' | 'manager' | 'staff';
  isActive: boolean;
  isSuperuser?: boolean;
  defaultPdfTemplate?: 'classic' | 'modern' | 'professional' | 'detailed';
  createdAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
  companyName: string;
}

export interface RegisterResponse extends LoginResponse {}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}
