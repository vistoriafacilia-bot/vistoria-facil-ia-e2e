import { Entitlement, Inspection, Photo, Property, Room } from '../types';
import { canGeneratePdf, isEntitlementActive } from './entitlements';

export type QaGateSeverity = 'blocker' | 'warning';

export interface QaGateIssue {
  code: string;
  severity: QaGateSeverity;
  message: string;
}

export interface QaGateResult {
  passed: boolean;
  blockers: QaGateIssue[];
  warnings: QaGateIssue[];
  issues: QaGateIssue[];
  summary: string;
}

export interface InspectionCompletionGateInput {
  inspection?: Inspection | null;
  property?: Property | null;
  rooms: Room[];
  photos: Photo[];
  photoLimit: number;
  userId?: string | null;
}

export interface ReportGenerationGateInput extends InspectionCompletionGateInput {
  entitlement?: Entitlement | null;
}

const issue = (code: string, severity: QaGateSeverity, message: string): QaGateIssue => ({
  code,
  severity,
  message
});

export const buildQaGateResult = (issues: QaGateIssue[]): QaGateResult => {
  const blockers = issues.filter(item => item.severity === 'blocker');
  const warnings = issues.filter(item => item.severity === 'warning');
  const passed = blockers.length === 0;
  const summary = passed
    ? warnings.length > 0
      ? `Aprovado com ${warnings.length} alerta(s) não bloqueante(s).`
      : 'Aprovado sem bloqueadores.'
    : `Bloqueado por ${blockers.length} pendência(s) crítica(s).`;

  return {
    passed,
    blockers,
    warnings,
    issues,
    summary
  };
};

export const formatQaGateIssues = (result: QaGateResult) => {
  if (result.issues.length === 0) return result.summary;
  return [
    result.summary,
    ...result.blockers.map(item => `BLOQUEIO ${item.code}: ${item.message}`),
    ...result.warnings.map(item => `ALERTA ${item.code}: ${item.message}`)
  ].join('\n');
};

export const validateInspectionCompletionGate = ({
  inspection,
  property,
  rooms,
  photos,
  photoLimit,
  userId
}: InspectionCompletionGateInput): QaGateResult => {
  const issues: QaGateIssue[] = [];

  if (!inspection) {
    issues.push(issue('INSP_MISSING', 'blocker', 'Nenhuma vistoria ativa foi encontrada.'));
    return buildQaGateResult(issues);
  }

  if (!userId) {
    issues.push(issue('AUTH_MISSING', 'blocker', 'Sessão autenticada ausente ou expirada.'));
  }

  if (userId && inspection.userId !== userId) {
    issues.push(issue('INSP_USER_MISMATCH', 'blocker', 'A vistoria não pertence ao usuário autenticado.'));
  }

  if (property) {
    if (property.id !== inspection.propertyId) {
      issues.push(issue('PROPERTY_MISMATCH', 'blocker', 'A vistoria está vinculada a outro imóvel.'));
    }
    if (userId && property.userId !== userId) {
      issues.push(issue('PROPERTY_USER_MISMATCH', 'blocker', 'O imóvel não pertence ao usuário autenticado.'));
    }
  }

  if (!inspection.id || !inspection.propertyId || !inspection.inspectionType || !inspection.startedAt) {
    issues.push(issue('INSP_REQUIRED_FIELDS', 'blocker', 'A vistoria está sem campos obrigatórios de identificação.'));
  }

  if (!Array.isArray(rooms) || rooms.length === 0) {
    issues.push(issue('ROOMS_EMPTY', 'blocker', 'A vistoria não possui cômodos cadastrados.'));
  }

  if (!Array.isArray(photos) || photos.length === 0) {
    issues.push(issue('PHOTOS_EMPTY', 'blocker', 'A vistoria precisa ter pelo menos uma foto para ser concluída.'));
  }

  if (photos.length > photoLimit) {
    issues.push(issue('PHOTO_LIMIT_EXCEEDED', 'blocker', `A vistoria possui ${photos.length} fotos, acima do limite do plano (${photoLimit}).`));
  }

  const roomIds = new Set(rooms.map(room => room.id));
  const duplicatePhotoIds = photos
    .map(photo => photo.id)
    .filter((id, index, ids) => id && ids.indexOf(id) !== index);

  if (duplicatePhotoIds.length > 0) {
    issues.push(issue('PHOTO_DUPLICATE_ID', 'blocker', 'Há fotos com IDs duplicados na vistoria.'));
  }

  const invalidPhotoRef = photos.find(photo =>
    !photo.id ||
    !photo.roomId ||
    (photo.inspectionId && photo.inspectionId !== inspection.id) ||
    !roomIds.has(photo.roomId)
  );
  if (invalidPhotoRef) {
    issues.push(issue('PHOTO_INVALID_REFERENCE', 'blocker', 'Há foto sem vínculo consistente com a vistoria/cômodo.'));
  }

  const photoWithWrongUser = userId && photos.find(photo => photo.userId && photo.userId !== userId);
  if (photoWithWrongUser) {
    issues.push(issue('PHOTO_USER_MISMATCH', 'blocker', 'Há foto vinculada a outro usuário.'));
  }

  const pendingPhotos = photos.filter(photo => photo.analysisStatus === 'pending');
  if (pendingPhotos.length > 0) {
    issues.push(issue('AI_ANALYSIS_PENDING', 'blocker', `${pendingPhotos.length} foto(s) ainda estão com análise de IA pendente.`));
  }

  const roomsWithoutPhotos = rooms.filter(room => !photos.some(photo => photo.roomId === room.id));
  if (rooms.length > 0 && roomsWithoutPhotos.length > 0) {
    issues.push(issue('ROOMS_WITHOUT_PHOTOS', 'warning', `${roomsWithoutPhotos.length} cômodo(s) não possuem fotos. Isso pode ser aceitável, mas deve ser consciente.`));
  }

  const failedAiPhotos = photos.filter(photo => photo.analysisStatus === 'failed' || photo.fallbackApplied);
  if (failedAiPhotos.length > 0) {
    issues.push(issue('AI_FALLBACK_APPLIED', 'warning', `${failedAiPhotos.length} foto(s) foram salvas com fallback/erro de IA. Revise manualmente antes do PDF.`));
  }

  const unreviewedPhotos = photos.filter(photo => {
    const status = photo.reviewStatus || photo.reviewedStatus;
    return status === 'pending' || status === 'pendente' || !status;
  });
  if (unreviewedPhotos.length > 0) {
    issues.push(issue('PHOTOS_NOT_REVIEWED', 'warning', `${unreviewedPhotos.length} foto(s) ainda não foram confirmadas/editadas pelo usuário.`));
  }

  const photosWithoutDescription = photos.filter(photo => !photo.description && !photo.aiAnalysis?.descricao_neutra && !photo.descriptionSuggested);
  if (photosWithoutDescription.length > 0) {
    issues.push(issue('PHOTO_DESCRIPTION_MISSING', 'warning', `${photosWithoutDescription.length} foto(s) estão sem descrição estruturada.`));
  }

  return buildQaGateResult(issues);
};

export const validateReportGenerationGate = ({
  entitlement,
  ...inspectionInput
}: ReportGenerationGateInput): QaGateResult => {
  const issues = [...validateInspectionCompletionGate(inspectionInput).issues];
  const { inspection } = inspectionInput;

  if (!entitlement) {
    issues.push(issue('ENTITLEMENT_MISSING', 'blocker', 'Nenhum plano ativo foi encontrado para liberar o relatório.'));
  } else {
    if (!isEntitlementActive(entitlement)) {
      issues.push(issue('ENTITLEMENT_INACTIVE', 'blocker', 'O plano encontrado não está ativo.'));
    }
    if (!canGeneratePdf(entitlement)) {
      issues.push(issue('PDF_NOT_ALLOWED', 'blocker', 'O plano ativo não permite geração de PDF.'));
    }
  }

  if (inspection && !['concluida', 'pdf_gerado'].includes(inspection.status)) {
    issues.push(issue('INSPECTION_NOT_COMPLETED', 'blocker', 'A vistoria precisa estar concluída antes da geração do PDF.'));
  }

  return buildQaGateResult(issues);
};
