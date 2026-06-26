import { Inspection, InspectionType } from '../../types';
import { APP_VERSION } from '../appVersion';
import { isLocalE2EMode, requireSupabaseConfigured, supabase, throwIfSupabaseError } from '../supabaseClient';
import { localDelete, localList, localPatch, localUpsert, nextLocalId } from '../supabaseLocalStore';

const fromRow = (row: any): Inspection => ({
  id: row.id,
  userId: row.user_id,
  propertyId: row.property_id,
  inspectionType: row.inspection_type,
  status: row.status,
  startedAt: row.started_at,
  completedAt: row.completed_at || undefined,
  pdfUrl: row.pdf_url || undefined,
  summary: row.summary || undefined,
  appVersion: row.app_version,
});

const toRow = (inspection: Inspection) => ({
  id: inspection.id,
  user_id: inspection.userId,
  property_id: inspection.propertyId,
  inspection_type: inspection.inspectionType,
  status: inspection.status,
  started_at: inspection.startedAt,
  completed_at: inspection.completedAt || null,
  pdf_url: inspection.pdfUrl || null,
  summary: inspection.summary || null,
  app_version: inspection.appVersion,
});

export function newInspectionId() {
  return isLocalE2EMode() ? nextLocalId('inspection') : crypto.randomUUID();
}

export async function listInspections(userId: string, propertyId: string): Promise<Inspection[]> {
  if (isLocalE2EMode()) {
    return localList<Inspection>('inspections', inspection =>
      inspection.userId === userId && inspection.propertyId === propertyId
    ).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  requireSupabaseConfigured();
  const { data, error } = await supabase
    .from('inspections')
    .select('*')
    .eq('user_id', userId)
    .eq('property_id', propertyId)
    .order('started_at', { ascending: false });
  throwIfSupabaseError(error, 'Supabase list inspections');
  return (data || []).map(fromRow);
}

export async function createInspection(params: {
  userId: string;
  propertyId: string;
  inspectionType: InspectionType;
}): Promise<Inspection> {
  const now = new Date().toISOString();
  const inspection: Inspection = {
    id: newInspectionId(),
    userId: params.userId,
    propertyId: params.propertyId,
    inspectionType: params.inspectionType,
    status: 'em_andamento',
    startedAt: now,
    appVersion: APP_VERSION,
  };

  if (isLocalE2EMode()) return localUpsert('inspections', inspection);
  const { data, error } = await supabase.from('inspections').insert(toRow(inspection)).select().single();
  throwIfSupabaseError(error, 'Supabase create inspection');
  return fromRow(data);
}

export async function updateInspection(id: string, patch: Partial<Inspection>) {
  if (isLocalE2EMode()) return localPatch<Inspection>('inspections', id, patch);
  const rowPatch: Record<string, any> = {};
  if (patch.status !== undefined) rowPatch.status = patch.status;
  if (patch.completedAt !== undefined) rowPatch.completed_at = patch.completedAt;
  if (patch.pdfUrl !== undefined) rowPatch.pdf_url = patch.pdfUrl || null;
  if (patch.summary !== undefined) rowPatch.summary = patch.summary || null;
  const { data, error } = await supabase.from('inspections').update(rowPatch).eq('id', id).select().single();
  throwIfSupabaseError(error, 'Supabase update inspection');
  return fromRow(data);
}

export async function deleteInspection(id: string) {
  if (isLocalE2EMode()) {
    localDelete('photos', photo => photo.inspectionId === id);
    localDelete('rooms', room => room.inspectionId === id);
    localDelete('reports', report => report.inspectionId === id);
    localDelete('inspections', inspection => inspection.id === id);
    return;
  }
  const { error } = await supabase.from('inspections').delete().eq('id', id);
  throwIfSupabaseError(error, 'Supabase delete inspection');
}
