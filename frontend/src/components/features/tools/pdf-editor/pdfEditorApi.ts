/**
 * ScopeIt - PDF Editor API Client
 *
 * Uses the centralized `api` axios instance (auth headers, token refresh).
 * For public signing endpoints (no auth required), uses raw axios.
 */
import axios from 'axios';
import api from '@/services/api';
import type {
  PdfDocument,
  PdfDocumentListResponse,
  Annotation,
  SignRequest,
  SignRequestListResponse,
  SignAuditEvent,
  SignViewData,
  CompanyDocument,
  CompanyDocumentListResponse,
} from './types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001/api';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Fetch a binary response and convert to a browser object URL. */
async function blobToObjectUrl(promise: Promise<{ data: Blob }>): Promise<string> {
  const response = await promise;
  return URL.createObjectURL(response.data);
}

// ── PDF Documents ─────────────────────────────────────────────────────────────

export const pdfEditorApi = {
  /**
   * Upload a PDF file and create a new document record.
   */
  uploadDocument: async (file: File, name?: string, rotation = 0): Promise<PdfDocument> => {
    const form = new FormData();
    form.append('file', file);
    if (name) form.append('name', name);
    if (rotation) form.append('rotation', String(rotation));
    const response = await api.post<PdfDocument>('/tools/pdf-editor/documents/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  /**
   * Convert one or more image files into a single PDF document.
   */
  imagesToPdf: async (files: File[], name?: string): Promise<PdfDocument> => {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    if (name) form.append('name', name);
    const response = await api.post<PdfDocument>('/tools/pdf-editor/documents/images-to-pdf', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  /**
   * List documents for the current company with optional pagination and search.
   */
  listDocuments: async (
    skip = 0,
    limit = 20,
    search?: string,
  ): Promise<PdfDocumentListResponse> => {
    const response = await api.get<PdfDocumentListResponse>('/tools/pdf-editor/documents', {
      params: { skip, limit, ...(search ? { search } : {}) },
    });
    return response.data;
  },

  /**
   * Get a single document by ID.
   */
  getDocument: async (id: string): Promise<PdfDocument> => {
    const response = await api.get<PdfDocument>(`/tools/pdf-editor/documents/${id}`);
    return response.data;
  },

  /**
   * Download the PDF file. Pass `flatten: true` to bake annotations into the PDF.
   */
  downloadDocument: async (id: string, flatten = false): Promise<Blob> => {
    const response = await api.get(`/tools/pdf-editor/documents/${id}/download`, {
      responseType: 'blob',
      params: flatten ? { flatten: true } : undefined,
    });
    return response.data;
  },

  /**
   * Fetch a rasterized page image and return a browser object URL.
   * Caller is responsible for calling URL.revokeObjectURL() when done.
   */
  getPageImage: async (id: string, pageNum: number): Promise<string> => {
    return blobToObjectUrl(
      api.get(`/tools/pdf-editor/documents/${id}/page/${pageNum}`, {
        responseType: 'blob',
      }),
    );
  },

  /**
   * Permanently delete a document.
   */
  deleteDocument: async (id: string): Promise<void> => {
    await api.delete(`/tools/pdf-editor/documents/${id}`);
  },

  /**
   * Create a copy of an existing document.
   */
  duplicateDocument: async (id: string, name?: string): Promise<PdfDocument> => {
    const response = await api.post<PdfDocument>(`/tools/pdf-editor/documents/${id}/duplicate`, {
      ...(name ? { name } : {}),
    });
    return response.data;
  },

  /**
   * Rename a document without changing its contents.
   */
  renameDocument: async (id: string, name: string): Promise<PdfDocument> => {
    const response = await api.patch<PdfDocument>(`/tools/pdf-editor/documents/${id}`, { name });
    return response.data;
  },

  // ── Page Operations ──────────────────────────────────────────────────────

  /**
   * Merge multiple documents into a single new document.
   * The order of `documentIds` determines page order.
   */
  mergeDocuments: async (documentIds: string[], name?: string): Promise<PdfDocument> => {
    const response = await api.post<PdfDocument>('/tools/pdf-editor/documents/merge', {
      document_ids: documentIds,
      ...(name ? { name } : {}),
    });
    return response.data;
  },

  /**
   * Reorder pages within a document.
   * `pageOrder` is a 1-based array of the desired page positions.
   */
  reorderPages: async (id: string, pageOrder: number[]): Promise<PdfDocument> => {
    const response = await api.post<PdfDocument>(
      `/tools/pdf-editor/documents/${id}/pages/reorder`,
      { page_order: pageOrder },
    );
    return response.data;
  },

  /**
   * Permanently remove specific pages from a document.
   * `pageNumbers` is 1-based.
   */
  deletePages: async (id: string, pageNumbers: number[]): Promise<PdfDocument> => {
    const response = await api.post<PdfDocument>(
      `/tools/pdf-editor/documents/${id}/pages/delete`,
      { page_numbers: pageNumbers },
    );
    return response.data;
  },

  /**
   * Rotate specific pages within a document.
   * `rotations` maps 1-based page number (as string key) to degrees (90, 180, 270).
   */
  rotatePages: async (id: string, rotations: Record<string, number>): Promise<PdfDocument> => {
    const response = await api.post<PdfDocument>(
      `/tools/pdf-editor/documents/${id}/pages/rotate`,
      { rotations },
    );
    return response.data;
  },

  // ── Annotations ──────────────────────────────────────────────────────────

  /**
   * Persist the full annotation list for a document (replaces existing).
   */
  saveAnnotations: async (id: string, annotations: Annotation[]): Promise<PdfDocument> => {
    const response = await api.put<PdfDocument>(
      `/tools/pdf-editor/documents/${id}/annotations`,
      { annotations },
    );
    return response.data;
  },

  /**
   * Render annotations into the PDF and return the flattened file as a Blob.
   */
  flattenAnnotations: async (id: string): Promise<Blob> => {
    const response = await api.post(
      `/tools/pdf-editor/documents/${id}/flatten`,
      {},
      { responseType: 'blob' },
    );
    return response.data;
  },

  // ── Import ───────────────────────────────────────────────────────────────

  /**
   * Generate a PDF from an existing estimate and create a new document.
   */
  importEstimate: async (estimateId: string, template?: string): Promise<PdfDocument> => {
    const response = await api.post<PdfDocument>('/tools/pdf-editor/documents/import-estimate', {
      estimate_id: estimateId,
      ...(template ? { template } : {}),
    });
    return response.data;
  },

  /**
   * Generate a PDF from an existing invoice and create a new document.
   */
  importInvoice: async (invoiceId: string, template?: string): Promise<PdfDocument> => {
    const response = await api.post<PdfDocument>('/tools/pdf-editor/documents/import-invoice', {
      invoice_id: invoiceId,
      ...(template ? { template } : {}),
    });
    return response.data;
  },

  /**
   * Copy a company document template into the editor as a new editable document.
   */
  importCompanyDoc: async (companyDocId: string): Promise<PdfDocument> => {
    const response = await api.post<PdfDocument>(
      '/tools/pdf-editor/documents/import-company-doc',
      { company_document_id: companyDocId },
    );
    return response.data;
  },

  // ── Sign Requests ────────────────────────────────────────────────────────

  /**
   * Create a new e-signature request for a document.
   */
  createSignRequest: async (data: {
    documentId: string;
    recipientEmail: string;
    recipientName: string;
    customerId?: string;
    signFields: Array<{
      page: number;
      x: number;
      y: number;
      width: number;
      height: number;
      type: 'signature' | 'date' | 'name' | 'initials';
      label?: string;
    }>;
    emailSubject?: string;
    emailMessage?: string;
    expiresInDays?: number;
  }): Promise<SignRequest> => {
    const response = await api.post<SignRequest>('/tools/pdf-editor/sign/requests', {
      document_id: data.documentId,
      recipient_email: data.recipientEmail,
      recipient_name: data.recipientName,
      ...(data.customerId ? { customer_id: data.customerId } : {}),
      sign_fields: data.signFields.map((f) => ({
        page: f.page,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        type: f.type,
        ...(f.label ? { label: f.label } : {}),
      })),
      ...(data.emailSubject ? { email_subject: data.emailSubject } : {}),
      ...(data.emailMessage ? { email_message: data.emailMessage } : {}),
      ...(data.expiresInDays !== undefined ? { expires_in_days: data.expiresInDays } : {}),
    });
    return response.data;
  },

  /**
   * List sign requests with optional status filter and pagination.
   */
  listSignRequests: async (
    status?: string,
    skip = 0,
    limit = 20,
  ): Promise<SignRequestListResponse> => {
    const response = await api.get<SignRequestListResponse>('/tools/pdf-editor/sign/requests', {
      params: { skip, limit, ...(status ? { status } : {}) },
    });
    return response.data;
  },

  /**
   * Get a single sign request by ID.
   */
  getSignRequest: async (id: string): Promise<SignRequest> => {
    const response = await api.get<SignRequest>(`/tools/pdf-editor/sign/requests/${id}`);
    return response.data;
  },

  /**
   * Dispatch the sign request email to the recipient.
   */
  sendSignRequest: async (id: string): Promise<SignRequest> => {
    const response = await api.post<SignRequest>(`/tools/pdf-editor/sign/requests/${id}/send`);
    return response.data;
  },

  /**
   * Send a reminder email to the recipient.
   */
  sendReminder: async (id: string): Promise<SignRequest> => {
    const response = await api.post<SignRequest>(`/tools/pdf-editor/sign/requests/${id}/reminder`);
    return response.data;
  },

  /**
   * Cancel a pending sign request.
   */
  cancelSignRequest: async (id: string): Promise<SignRequest> => {
    const response = await api.post<SignRequest>(`/tools/pdf-editor/sign/requests/${id}/cancel`);
    return response.data;
  },

  /**
   * Retrieve the audit trail events for a sign request.
   */
  getSignAudit: async (id: string): Promise<SignAuditEvent[]> => {
    const response = await api.get<SignAuditEvent[]>(
      `/tools/pdf-editor/sign/requests/${id}/audit`,
    );
    return response.data;
  },

  /**
   * Download the completed (signed) PDF.
   */
  downloadSignedDocument: async (id: string): Promise<Blob> => {
    const response = await api.get(`/tools/pdf-editor/sign/requests/${id}/signed-document`, {
      responseType: 'blob',
    });
    return response.data;
  },

  // ── Public Signing (no auth token) ──────────────────────────────────────

  /**
   * Fetch document metadata for the public signing view using a one-time token.
   * Does NOT use the authenticated `api` instance.
   */
  viewSignDocument: async (token: string): Promise<SignViewData> => {
    const response = await axios.get<SignViewData>(
      `${API_BASE}/sign/view/${token}`,
    );
    return response.data;
  },

  /**
   * Fetch a rasterised page image for the public signing view.
   * Returns a browser object URL. Caller must revoke when done.
   */
  getSignPageImage: async (token: string, pageNum: number): Promise<string> => {
    const response = await axios.get(
      `${API_BASE}/sign/view/${token}/page/${pageNum}`,
      { responseType: 'blob' },
    );
    return URL.createObjectURL(response.data);
  },

  /**
   * Submit the completed signature data for a signing session.
   */
  submitSignature: async (
    token: string,
    data: {
      signatureDataUrl: string;
      signatureType?: 'draw' | 'type';
      signatureFont?: string;
      signerName?: string;
    },
  ): Promise<void> => {
    // Strip data URL prefix to get raw base64
    const base64 = data.signatureDataUrl.replace(/^data:image\/\w+;base64,/, '');
    await axios.post(`${API_BASE}/sign/submit/${token}`, {
      signature_data: base64,
      signature_type: data.signatureType || 'draw',
      ...(data.signatureFont ? { signature_font: data.signatureFont } : {}),
    });
  },

  /**
   * Decline a signing request and optionally provide a reason.
   */
  declineSignature: async (token: string, reason?: string): Promise<void> => {
    await axios.post(`${API_BASE}/sign/decline/${token}`, {
      ...(reason ? { reason } : {}),
    });
  },

  // ── Company Documents ────────────────────────────────────────────────────

  /**
   * List company document templates with optional search and category filter.
   */
  listCompanyDocs: async (
    skip = 0,
    limit = 20,
    search?: string,
    category?: string,
  ): Promise<CompanyDocumentListResponse> => {
    const response = await api.get<CompanyDocumentListResponse>(
      '/tools/pdf-editor/company-docs',
      {
        params: {
          skip,
          limit,
          ...(search ? { search } : {}),
          ...(category ? { category } : {}),
        },
      },
    );
    return response.data;
  },

  /**
   * Upload a new company document template.
   */
  uploadCompanyDoc: async (
    file: File,
    name: string,
    description?: string,
    category?: string,
    tags?: string[],
  ): Promise<CompanyDocument> => {
    const form = new FormData();
    form.append('file', file);
    form.append('name', name);
    if (description) form.append('description', description);
    if (category) form.append('category', category);
    if (tags?.length) form.append('tags', JSON.stringify(tags));
    const response = await api.post<CompanyDocument>('/tools/pdf-editor/company-docs', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  /**
   * Get a single company document by ID.
   */
  getCompanyDoc: async (id: string): Promise<CompanyDocument> => {
    const response = await api.get<CompanyDocument>(`/tools/pdf-editor/company-docs/${id}`);
    return response.data;
  },

  /**
   * Update company document metadata (name, description, category, tags).
   */
  updateCompanyDoc: async (
    id: string,
    data: {
      name?: string;
      description?: string;
      category?: string;
      tags?: string[];
    },
  ): Promise<CompanyDocument> => {
    const response = await api.patch<CompanyDocument>(
      `/tools/pdf-editor/company-docs/${id}`,
      data,
    );
    return response.data;
  },

  /**
   * Delete a company document template.
   */
  deleteCompanyDoc: async (id: string): Promise<void> => {
    await api.delete(`/tools/pdf-editor/company-docs/${id}`);
  },
};
