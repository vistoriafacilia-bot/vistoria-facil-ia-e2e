export const sanitizeReportFilenamePart = (value: string, fallback = 'vistoria') => {
  const sanitized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);

  return sanitized || fallback;
};

export const buildReportFilename = (params: {
  propertyNickname: string;
  inspectionType: string;
  inspectionId: string;
}) => {
  const nickname = sanitizeReportFilenamePart(params.propertyNickname, 'imovel');
  const inspectionType = sanitizeReportFilenamePart(params.inspectionType, 'vistoria');
  const shortId = sanitizeReportFilenamePart(params.inspectionId.slice(0, 12), 'sem_codigo');
  return `Vistoria_${nickname}_${inspectionType}_${shortId}.pdf`;
};

export const buildReportStoragePath = (params: {
  userId: string;
  propertyId: string;
  inspectionId: string;
  filename: string;
}) => {
  const userId = sanitizeReportFilenamePart(params.userId, 'user');
  const propertyId = sanitizeReportFilenamePart(params.propertyId, 'property');
  const inspectionId = sanitizeReportFilenamePart(params.inspectionId, 'inspection');
  const filename = sanitizeReportFilenamePart(params.filename.replace(/\.pdf$/i, ''), 'relatorio');
  return `reports/${userId}/${propertyId}/${inspectionId}/${filename}.pdf`;
};

export const buildReportId = (inspectionId: string, generatedAtIso: string) => {
  const safeInspectionId = sanitizeReportFilenamePart(inspectionId, 'inspection');
  const timestamp = generatedAtIso.replace(/[^0-9]/g, '').slice(0, 14) || String(Date.now());
  return `rpt_${safeInspectionId}_${timestamp}`;
};
