/**
 * ScopeIt - PDF Editor Tool Types
 */

export interface PdfDocument {
  id: string;
  name: string;
  fileSize: number;
  pageCount: number;
  mimeType: string;
  sourceType: string;
  sourceId: string | null;
  annotations: Annotation[];
  thumbnailUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
}

export interface PdfDocumentListResponse {
  items: PdfDocument[];
  total: number;
  skip: number;
  limit: number;
}

export interface AnnotationStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: string;
  textDecoration?: string;
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  opacity?: number;
}

export interface Annotation {
  id: string;
  type: 'text' | 'image' | 'drawing' | 'stamp' | 'sign_field' | 'shape';
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  content: string;
  style: AnnotationStyle;
}

export interface SignFieldDef {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'signature' | 'date' | 'name' | 'initials';
  label?: string;
}

export interface SignRequest {
  id: string;
  documentId: string;
  documentName: string | null;
  recipientEmail: string;
  recipientName: string;
  senderEmail: string;
  senderName: string;
  customerId: string | null;
  status: string;
  signFields: SignFieldDef[];
  emailSubject: string | null;
  emailMessage: string | null;
  expiresAt: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  declinedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
  sign_url?: string;
}

export interface SignRequestListResponse {
  items: SignRequest[];
  total: number;
  skip: number;
  limit: number;
}

export interface SignAuditEvent {
  id: string;
  eventType: string;
  actorEmail: string | null;
  actorIp: string | null;
  eventMetadata: Record<string, unknown>;
  createdAt: string;
}

export interface SignViewData {
  documentName: string;
  senderName: string;
  senderEmail: string;
  recipientName: string | null;
  companyName: string | null;
  companyLogoUrl: string | null;
  pageCount: number;
  signFields: SignFieldDef[];
  status: string;
  expiresAt: string;
}

export interface CompanyDocument {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  fileSize: number;
  mimeType: string;
  pageCount: number;
  thumbnailUrl: string | null;
  tags: string[];
  useCount: number;
  lastUsedAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
}

export interface CompanyDocumentListResponse {
  items: CompanyDocument[];
  total: number;
  skip: number;
  limit: number;
}

export type EditorTool = 'select' | 'text' | 'image' | 'draw' | 'stamp' | 'sign' | 'sign_field' | 'shape_rect' | 'shape_circle' | 'shape_line';

export interface EditorState {
  documentId: string | null;
  currentPage: number;
  zoom: number;
  tool: EditorTool;
  annotations: Annotation[];
  selectedAnnotationId: string | null;
  isDirty: boolean;
}
