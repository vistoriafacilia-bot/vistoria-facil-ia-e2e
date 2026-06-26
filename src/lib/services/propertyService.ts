import { Property } from '../../types';
import { isLocalE2EMode, requireSupabaseConfigured, supabase, throwIfSupabaseError } from '../supabaseClient';
import { localDelete, localList, localPatch, localUpsert } from '../supabaseLocalStore';

const fromRow = (row: any): Property => ({
  id: row.id,
  userId: row.user_id,
  nickname: row.nickname,
  propertyType: row.property_type,
  address: row.address,
  generalNotes: row.general_notes || undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toRow = (property: Property) => ({
  id: property.id,
  user_id: property.userId,
  nickname: property.nickname,
  property_type: property.propertyType,
  address: property.address,
  general_notes: property.generalNotes || null,
  created_at: property.createdAt,
  updated_at: property.updatedAt,
});

export async function listProperties(userId: string): Promise<Property[]> {
  if (isLocalE2EMode()) {
    return localList<Property>('properties', property => property.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  requireSupabaseConfigured();
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  throwIfSupabaseError(error, 'Supabase list properties');
  return (data || []).map(fromRow);
}

export async function createProperty(property: Property) {
  if (isLocalE2EMode()) return localUpsert('properties', property);
  const { data, error } = await supabase.from('properties').insert(toRow(property)).select().single();
  throwIfSupabaseError(error, 'Supabase create property');
  return fromRow(data);
}

export async function updateProperty(id: string, patch: Partial<Property>) {
  if (isLocalE2EMode()) return localPatch<Property>('properties', id, patch);
  const rowPatch: Record<string, any> = {};
  if (patch.nickname !== undefined) rowPatch.nickname = patch.nickname;
  if (patch.propertyType !== undefined) rowPatch.property_type = patch.propertyType;
  if (patch.address !== undefined) rowPatch.address = patch.address;
  if (patch.generalNotes !== undefined) rowPatch.general_notes = patch.generalNotes || null;
  if (patch.updatedAt !== undefined) rowPatch.updated_at = patch.updatedAt;
  const { data, error } = await supabase.from('properties').update(rowPatch).eq('id', id).select().single();
  throwIfSupabaseError(error, 'Supabase update property');
  return fromRow(data);
}

export async function deleteProperty(id: string) {
  if (isLocalE2EMode()) {
    localDelete('properties', property => property.id === id);
    return;
  }
  const { error } = await supabase.from('properties').delete().eq('id', id);
  throwIfSupabaseError(error, 'Supabase delete property');
}
