import { Entitlement } from '../../types';
import { FREE_PLAN_ID, PLAN_DEFINITIONS } from '../plans';
import { isLocalE2EMode, requireSupabaseConfigured, supabase, throwIfSupabaseError } from '../supabaseClient';
import { localList, localUpsert } from '../supabaseLocalStore';

const fromRow = (row: any): Entitlement => ({
  id: row.id,
  userId: row.user_id,
  planId: row.plan_id,
  status: row.status,
  source: row.source,
  maxPhotosPerInspection: row.max_photos_per_inspection,
  pdfEnabled: row.pdf_enabled,
  orderId: row.order_id || null,
  paymentId: row.payment_id || null,
  preferenceId: row.preference_id || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  expiresAt: row.expires_at || null,
});

const toRow = (entitlement: Entitlement) => ({
  id: entitlement.id,
  user_id: entitlement.userId,
  plan_id: entitlement.planId,
  status: entitlement.status,
  source: entitlement.source,
  max_photos_per_inspection: entitlement.maxPhotosPerInspection,
  pdf_enabled: entitlement.pdfEnabled,
  order_id: entitlement.orderId || null,
  payment_id: entitlement.paymentId || null,
  preference_id: entitlement.preferenceId || null,
  created_at: entitlement.createdAt,
  updated_at: entitlement.updatedAt,
  expires_at: entitlement.expiresAt || null,
});

export function createFreeEntitlement(userId: string): Entitlement {
  const now = new Date().toISOString();
  const plan = PLAN_DEFINITIONS[FREE_PLAN_ID];
  return {
    id: `${userId}_${FREE_PLAN_ID}`,
    userId,
    planId: FREE_PLAN_ID,
    status: 'active',
    source: 'free_self_service',
    maxPhotosPerInspection: plan.maxPhotosPerInspection,
    pdfEnabled: plan.pdfEnabled,
    createdAt: now,
    updatedAt: now,
  };
}

export async function listEntitlements(userId: string): Promise<Entitlement[]> {
  if (isLocalE2EMode()) return localList<Entitlement>('entitlements', item => item.userId === userId);
  requireSupabaseConfigured();
  const { data, error } = await supabase.from('entitlements').select('*').eq('user_id', userId);
  throwIfSupabaseError(error, 'Supabase list entitlements');
  return (data || []).map(fromRow);
}

export async function saveEntitlement(entitlement: Entitlement) {
  if (isLocalE2EMode()) return localUpsert('entitlements', entitlement);
  const { data, error } = await supabase
    .from('entitlements')
    .upsert(toRow(entitlement), { onConflict: 'id' })
    .select()
    .single();
  throwIfSupabaseError(error, 'Supabase save entitlement');
  return fromRow(data);
}

export async function getOrCreateSupabaseEntitlement(userId: string): Promise<Entitlement> {
  const best = (await listEntitlements(userId))
    .filter(entitlement => entitlement.status === 'active' && (!entitlement.expiresAt || new Date(entitlement.expiresAt).getTime() > Date.now()))
    .sort((a, b) => {
      const priorityA = a.planId === 'beta_paid_4990' ? 20 : 10;
      const priorityB = b.planId === 'beta_paid_4990' ? 20 : 10;
      return priorityB - priorityA;
    })[0];
  if (best) return best;
  const free = createFreeEntitlement(userId);
  await saveEntitlement(free);
  return free;
}
