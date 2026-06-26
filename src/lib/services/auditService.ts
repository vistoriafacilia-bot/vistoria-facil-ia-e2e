import { SystemEvent } from '../../types';
import { isLocalE2EMode, supabase, throwIfSupabaseError } from '../supabaseClient';
import { localUpsert } from '../supabaseLocalStore';

export async function createAuditEvent(userId: string, eventName: string, metadata: any = {}) {
  const event: SystemEvent & { id: string } = {
    id: `event-${Math.random().toString(36).slice(2, 11)}`,
    userId,
    event: eventName,
    createdAt: new Date().toISOString(),
    metadata,
  };

  if (isLocalE2EMode()) {
    localUpsert('events', event);
    return;
  }

  const { error } = await supabase.from('events').insert({
    id: event.id,
    user_id: event.userId,
    event: event.event,
    created_at: event.createdAt,
    metadata: event.metadata,
  });
  throwIfSupabaseError(error, 'Supabase create audit event');
}
