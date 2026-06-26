import { getCurrentUser, loginWithEmailPassword, loginWithGoogle, logout } from './lib/services/authService';

// Compatibility facade retained for older tests and imports during the Supabase migration.
// Production code must use src/lib/services/* directly.
export { loginWithEmailPassword, loginWithGoogle, logout };

export const db = {};
export const storage = {};
export const googleProvider = {};

export const auth = {
  get currentUser() {
    return null;
  },
};

// --------------------------------------------------
// ERROR HANDLING FOR SECURITY RULES COMPLIANCE
// --------------------------------------------------
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface PersistenceErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  };
}

export async function getSupabaseAuthInfo() {
  const user = await getCurrentUser();
  return {
    userId: user?.uid || null,
    email: user?.email || null,
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: PersistenceErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    authInfo: {
      userId: null,
      email: null,
    },
  };
  console.error('Persistence Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
