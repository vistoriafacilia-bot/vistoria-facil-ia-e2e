export type PropertyType = 'apartamento' | 'casa' | 'sala comercial' | 'outro';

export interface PropertyAddress {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  reference?: string;
}

export interface Property {
  id: string;
  userId: string;
  nickname: string;
  propertyType: PropertyType;
  address: PropertyAddress;
  generalNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppUser {
  uid: string;
  id: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
}

export type InspectionType = 'entrada' | 'saida';
export type InspectionStatus = 'rascunho' | 'em_andamento' | 'concluida' | 'pdf_gerado' | 'finalizado';

export interface Inspection {
  id: string;
  userId: string;
  propertyId: string;
  inspectionType: InspectionType;
  status: InspectionStatus;
  startedAt: string;
  completedAt?: string;
  pdfUrl?: string;
  summary?: string;
  appVersion: string;
}

export interface Room {
  id: string;
  inspectionId: string;
  userId: string;
  name: string;
  order: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AiAnalysis {
  item_observado: string;
  condicao_sugerida: 'OK' | 'Atenção' | 'Problema';
  descricao_neutra: string;
  pontos_de_atencao: string[];
  confianca: 'baixa' | 'média' | 'alta';
}

export type ReviewedStatus = 'pendente' | 'confirmado' | 'editated';

export interface Photo {
  id: string;
  inspectionId?: string;
  roomId: string;
  roomName?: string;
  userId?: string;
  url: string; // Supabase Storage signed URL or highly compressed base64 fallback
  imageUrl?: string;
  storagePath?: string;
  caption: string;
  displayTitle?: string;
  description?: string;
  aiAnalysis?: AiAnalysis;
  reviewedStatus: ReviewedStatus;
  createdAt: string;
  updatedAt?: string;
  uploadStatus?: 'uploaded' | 'upload_error';
  analysisStatus?: 'completed' | 'failed' | 'pending';
  reviewStatus?: 'pending' | 'confirmed' | 'edited';
  conditionSuggested?: 'OK' | 'Atenção' | 'Problema';
  itemObserved?: string;
  descriptionSuggested?: string;
  fallbackApplied?: boolean;
  analysisError?: string;
}

export interface SystemEvent {
  userId: string;
  event: string;
  inspectionId?: string;
  createdAt: string;
  metadata?: any;
}

export interface SystemMetrics {
  totalUsers: number;
  totalProperties: number;
  totalInspections: number;
  totalPhotos: number;
  totalAiAnalyses: number;
  totalPdfsGenerated: number;
}

export type EntitlementPlan = 'free_10' | 'beta_paid_4990';

export interface PlanDefinition {
  id: EntitlementPlan;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  maxPhotosPerInspection: number;
  pdfEnabled: boolean;
  paymentRequired: boolean;
  badge: string;
}

export interface Entitlement {
  id: string;
  userId: string;
  planId: EntitlementPlan;
  status: 'active' | 'pending' | 'expired';
  source: 'free_self_service' | 'mercado_pago' | 'manual_admin';
  maxPhotosPerInspection: number;
  pdfEnabled: boolean;
  orderId?: string | null;
  paymentId?: string | null;
  preferenceId?: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | null;
}

export type ReportCreditPlanId = 'report_50_beta_4990' | 'report_100_9990' | 'report_150_14990';
export type ReportCreditStatus = 'available' | 'assigned' | 'in_progress' | 'finalized' | 'canceled' | 'refunded';

export interface ReportCreditPlan {
  id: ReportCreditPlanId;
  name: string;
  description: string;
  priceCents: number;
  regularPriceCents?: number | null;
  currency: string;
  analysisLimit: number;
  badge: string;
  active: boolean;
}

export interface ReportCredit {
  id: string;
  userId: string;
  planId: ReportCreditPlanId;
  orderId?: string | null;
  paymentId?: string | null;
  preferenceId?: string | null;
  inspectionId?: string | null;
  status: ReportCreditStatus;
  analysisLimit: number;
  analysisUsed: number;
  priceCents: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  assignedAt?: string | null;
  finalizedAt?: string | null;
}
