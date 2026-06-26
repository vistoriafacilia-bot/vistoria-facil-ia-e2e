import { Entitlement } from '../types';
import { FREE_PLAN_ID, PAID_BETA_PLAN_ID, PLAN_DEFINITIONS } from './plans';
import { getOrCreateSupabaseEntitlement } from './services/entitlementService';

export const isEntitlementActive = (entitlement?: Entitlement | null, now = new Date()) => {
  if (!entitlement || entitlement.status !== 'active') return false;
  if (entitlement.expiresAt && new Date(entitlement.expiresAt).getTime() < now.getTime()) return false;
  return true;
};

export const getEntitlementPriority = (entitlement: Entitlement) => {
  if (entitlement.planId === PAID_BETA_PLAN_ID) return 20;
  if (entitlement.planId === FREE_PLAN_ID) return 10;
  return 0;
};

export const selectBestActiveEntitlement = (entitlements: Entitlement[], now = new Date()) => {
  return entitlements
    .filter(entitlement => isEntitlementActive(entitlement, now))
    .sort((a, b) => getEntitlementPriority(b) - getEntitlementPriority(a))[0] || null;
};

export const getPhotoLimitForEntitlement = (entitlement?: Entitlement | null) => {
  if (!entitlement) return PLAN_DEFINITIONS.free_10.maxPhotosPerInspection;
  return entitlement.maxPhotosPerInspection || PLAN_DEFINITIONS[entitlement.planId]?.maxPhotosPerInspection || 10;
};

export const canGeneratePdf = (entitlement?: Entitlement | null) => {
  if (!entitlement) return false;
  return isEntitlementActive(entitlement) && entitlement.pdfEnabled;
};

export async function getOrCreateUserEntitlement(userId: string): Promise<Entitlement> {
  return getOrCreateSupabaseEntitlement(userId);
}
