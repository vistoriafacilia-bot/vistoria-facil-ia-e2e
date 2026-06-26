import { Room } from '../../types';
import { isLocalE2EMode, requireSupabaseConfigured, supabase, throwIfSupabaseError } from '../supabaseClient';
import { localDelete, localList, localPatch, localUpsert, nextLocalId } from '../supabaseLocalStore';

const fromRow = (row: any): Room => ({
  id: row.id,
  inspectionId: row.inspection_id,
  userId: row.user_id,
  name: row.name,
  order: row.display_order,
  isDefault: row.is_default,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toRow = (room: Room) => ({
  id: room.id,
  inspection_id: room.inspectionId,
  user_id: room.userId,
  name: room.name,
  display_order: room.order,
  is_default: room.isDefault,
  created_at: room.createdAt,
  updated_at: room.updatedAt,
});

export function newRoomId() {
  return isLocalE2EMode() ? nextLocalId('room') : crypto.randomUUID();
}

export async function listRooms(inspectionId: string): Promise<Room[]> {
  if (isLocalE2EMode()) {
    return localList<Room>('rooms', room => room.inspectionId === inspectionId)
      .sort((a, b) => a.order - b.order);
  }
  requireSupabaseConfigured();
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('inspection_id', inspectionId)
    .order('display_order', { ascending: true });
  throwIfSupabaseError(error, 'Supabase list rooms');
  return (data || []).map(fromRow);
}

export async function saveRoom(room: Room) {
  if (isLocalE2EMode()) return localUpsert('rooms', room);
  const { data, error } = await supabase.from('rooms').upsert(toRow(room), { onConflict: 'id' }).select().single();
  throwIfSupabaseError(error, 'Supabase save room');
  return fromRow(data);
}

export async function updateRoom(id: string, patch: Partial<Room>) {
  if (isLocalE2EMode()) return localPatch<Room>('rooms', id, patch);
  const rowPatch: Record<string, any> = {};
  if (patch.name !== undefined) rowPatch.name = patch.name;
  if (patch.order !== undefined) rowPatch.display_order = patch.order;
  if (patch.updatedAt !== undefined) rowPatch.updated_at = patch.updatedAt;
  const { data, error } = await supabase.from('rooms').update(rowPatch).eq('id', id).select().single();
  throwIfSupabaseError(error, 'Supabase update room');
  return fromRow(data);
}

export async function deleteRoom(id: string) {
  if (isLocalE2EMode()) {
    localDelete('rooms', room => room.id === id);
    return;
  }
  const { error } = await supabase.from('rooms').delete().eq('id', id);
  throwIfSupabaseError(error, 'Supabase delete room');
}
