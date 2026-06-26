import { Photo } from '../../types';
import { isLocalE2EMode, requireSupabaseConfigured, supabase, throwIfSupabaseError } from '../supabaseClient';
import { localDelete, localList, localPatch, localUpsert, nextLocalId } from '../supabaseLocalStore';

const fromRow = (row: any): Photo => ({
  id: row.id,
  inspectionId: row.inspection_id,
  roomId: row.room_id,
  roomName: row.room_name || undefined,
  userId: row.user_id,
  url: row.url,
  imageUrl: row.image_url || undefined,
  storagePath: row.storage_path || undefined,
  caption: row.caption,
  displayTitle: row.display_title || undefined,
  description: row.description || undefined,
  aiAnalysis: row.ai_analysis || undefined,
  reviewedStatus: row.reviewed_status,
  createdAt: row.created_at,
  updatedAt: row.updated_at || undefined,
  uploadStatus: row.upload_status || undefined,
  analysisStatus: row.analysis_status || undefined,
  reviewStatus: row.review_status || undefined,
  conditionSuggested: row.condition_suggested || undefined,
  itemObserved: row.item_observed || undefined,
  descriptionSuggested: row.description_suggested || undefined,
  fallbackApplied: row.fallback_applied || undefined,
  analysisError: row.analysis_error || undefined,
});

const toRow = (photo: Photo) => ({
  id: photo.id,
  inspection_id: photo.inspectionId,
  room_id: photo.roomId,
  room_name: photo.roomName || null,
  user_id: photo.userId,
  url: photo.url,
  image_url: photo.imageUrl || null,
  storage_path: photo.storagePath || null,
  caption: photo.caption,
  display_title: photo.displayTitle || null,
  description: photo.description || null,
  ai_analysis: photo.aiAnalysis || null,
  reviewed_status: photo.reviewedStatus,
  created_at: photo.createdAt,
  updated_at: photo.updatedAt || null,
  upload_status: photo.uploadStatus || null,
  analysis_status: photo.analysisStatus || null,
  review_status: photo.reviewStatus || null,
  condition_suggested: photo.conditionSuggested || null,
  item_observed: photo.itemObserved || null,
  description_suggested: photo.descriptionSuggested || null,
  fallback_applied: photo.fallbackApplied || false,
  analysis_error: photo.analysisError || null,
});

export function newPhotoId() {
  return isLocalE2EMode() ? nextLocalId('photo') : crypto.randomUUID();
}

export async function listPhotos(inspectionId: string): Promise<Photo[]> {
  if (isLocalE2EMode()) {
    return localList<Photo>('photos', photo => photo.inspectionId === inspectionId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
  requireSupabaseConfigured();
  const { data, error } = await supabase
    .from('photos')
    .select('*')
    .eq('inspection_id', inspectionId)
    .order('created_at', { ascending: true });
  throwIfSupabaseError(error, 'Supabase list photos');
  return (data || []).map(fromRow);
}

export async function savePhoto(photo: Photo) {
  if (isLocalE2EMode()) return localUpsert('photos', photo);
  const { data, error } = await supabase.from('photos').upsert(toRow(photo), { onConflict: 'id' }).select().single();
  throwIfSupabaseError(error, 'Supabase save photo');
  return fromRow(data);
}

export async function updatePhoto(id: string, patch: Partial<Photo>) {
  if (isLocalE2EMode()) return localPatch<Photo>('photos', id, patch);
  const { data: existing, error: readError } = await supabase.from('photos').select('*').eq('id', id).single();
  throwIfSupabaseError(readError, 'Supabase read photo before update');
  if (!existing) throw new Error(`Supabase photo not found: ${id}`);
  const merged = toRow({ ...fromRow(existing), ...patch });
  const { data, error } = await supabase.from('photos').update(merged).eq('id', id).select().single();
  throwIfSupabaseError(error, 'Supabase update photo');
  return fromRow(data);
}

export async function deletePhoto(id: string) {
  if (isLocalE2EMode()) {
    localDelete('photos', photo => photo.id === id);
    return;
  }
  const { error } = await supabase.from('photos').delete().eq('id', id);
  throwIfSupabaseError(error, 'Supabase delete photo');
}
