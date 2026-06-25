type AuthCallback = (user: any | null) => void;

const testUser = {
  uid: 'e2e-user-001',
  email: 'e2e@vistoriafacil.test',
  displayName: 'Usuário E2E',
  emailVerified: true,
  isAnonymous: false,
  tenantId: null,
  providerData: [{ providerId: 'google.com', email: 'e2e@vistoriafacil.test' }],
  getIdToken: async () => 'e2e-token',
};

const auth = {
  currentUser: testUser,
};

export type User = typeof testUser;

export function getAuth() {
  return auth;
}

export class GoogleAuthProvider {}

export async function signInWithPopup() {
  auth.currentUser = testUser;
  return { user: testUser };
}

export async function signInWithEmailAndPassword() {
  auth.currentUser = testUser;
  return { user: testUser };
}

export async function signOut() {
  auth.currentUser = null;
}

export function onAuthStateChanged(_auth: any, callback: AuthCallback) {
  setTimeout(() => callback(auth.currentUser), 0);
  return () => {};
}
