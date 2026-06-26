import { isLocalE2EMode, requireSupabaseConfigured, SUPABASE_PHOTO_BUCKET, supabase, throwIfSupabaseError } from '../supabaseClient';
import { blobToDataUrl } from '../supabaseLocalStore';

export function buildPhotoStoragePath(userId: string, inspectionId: string, photoId: string) {
  return `${userId}/photos/${inspectionId}/${photoId}.jpg`;
}

export function buildReportStoragePath(params: {
  userId: string;
  propertyId: string;
  inspectionId: string;
  filename: string;
}) {
  return `${params.userId}/reports/${params.propertyId}/${params.inspectionId}/${params.filename}`;
}

export async function uploadFile(path: string, blob: Blob, contentType: string) {
  if (isLocalE2EMode()) {
    return { path, url: await blobToDataUrl(blob) };
  }

  requireSupabaseConfigured();
  const { error } = await supabase.storage
    .from(SUPABASE_PHOTO_BUCKET)
    .upload(path, blob, { contentType, upsert: true });
  throwIfSupabaseError(error, 'Supabase Storage upload');

  const { data, error: signedError } = await supabase.storage
    .from(SUPABASE_PHOTO_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24);
  throwIfSupabaseError(signedError, 'Supabase Storage signed URL');
  return { path, url: data.signedUrl };
}

export async function deleteFile(path: string) {
  if (isLocalE2EMode()) return;
  const { error } = await supabase.storage.from(SUPABASE_PHOTO_BUCKET).remove([path]);
  throwIfSupabaseError(error, 'Supabase Storage delete');
}
