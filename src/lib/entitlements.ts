import { Entitlement } from '../types';
import { FREE_PLAN_ID, PAID_BETA_PLAN_ID, PLAN_DEFINITIONS } from './plans';
import { db } from '../firebase';
import { collection, query, where, getDocs, setDoc, doc } from 'firebase/firestore';

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
  const list: Entitlement[] = [];
  
  try {
    const q = query(collection(db, 'entitlements'), where('userId', '==', userId));
    const snap = await getDocs(q);
    
    snap.forEach(doc => {
      list.push({ id: doc.id, ...doc.data() } as Entitlement);
    });
    
    // Select best active entitlement
    const best = selectBestActiveEntitlement(list);
    if (best) return best;
  } catch (readError) {
    console.warn('Error reading entitlements from Firestore (permission issue?):', readError);
  }
  
  // If no active entitlement, create default free entitlement
  const nowIso = new Date().toISOString();
  const entitlementId = `${userId}_free_init`;
  const defaultFree: Entitlement = {
    id: entitlementId,
    userId,
    planId: 'free_10',
    status: 'active',
    source: 'free_self_service',
    maxPhotosPerInspection: 10,
    pdfEnabled: true,
    createdAt: nowIso,
    updatedAt: nowIso
  };
  
  try {
    await setDoc(doc(db, 'entitlements', entitlementId), defaultFree);
  } catch (writeError) {
    console.warn('Error creating default entitlement in Firestore (permission issue?):', writeError);
  }
  
  return defaultFree;
}
