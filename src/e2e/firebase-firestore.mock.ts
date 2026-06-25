type Store = Record<string, any>;
type Clause = { kind: 'where'; field: string; op: string; value: any } | { kind: 'orderBy'; field: string; direction?: string };
type Ref = { id?: string; path: string; __type: 'doc' | 'collection'; clauses?: Clause[] };

const STORAGE_KEY = 'vf-e2e-firestore-store-v2';
const COUNTER_KEY = 'vf-e2e-firestore-counters-v2';

const now = () => new Date().toISOString();

function defaultStore(): Store {
  return {
    'users/e2e-user-001': {
      uid: 'e2e-user-001',
      name: 'Usuário E2E',
      email: 'e2e@vistoriafacil.test',
      createdAt: now(),
      lastLoginAt: now(),
      plan: 'gratuito',
    },
    'entitlements/e2e-user-001_free_10': {
      id: 'e2e-user-001_free_10',
      userId: 'e2e-user-001',
      planId: 'free_10',
      status: 'active',
      source: 'free_self_service',
      maxPhotosPerInspection: 10,
      pdfEnabled: true,
      createdAt: now(),
      updatedAt: now(),
    },
    'properties/prop-e2e-001': {
      id: 'prop-e2e-001',
      userId: 'e2e-user-001',
      nickname: 'Apartamento E2E Persistência',
      propertyType: 'apartamento',
      address: {
        street: 'Rua E2E',
        number: '100',
        complement: 'Bloco Teste',
        neighborhood: 'Tijuca',
        city: 'Rio de Janeiro',
        state: 'RJ',
        zipCode: '20511000',
        reference: 'Próximo ao teste automatizado',
      },
      generalNotes: 'Imóvel sem dados reais; massa de teste local.',
      createdAt: now(),
      updatedAt: now(),
    },
  };
}

function readStore(): Store {
  if (typeof window === 'undefined') return defaultStore();
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seeded = defaultStore();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
  return JSON.parse(raw);
}

function writeStore(store: Store) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }
}

function nextId(prefix: string): string {
  if (typeof window === 'undefined') return `${prefix}-node-${Math.random().toString(36).slice(2, 8)}`;
  const counters = JSON.parse(window.localStorage.getItem(COUNTER_KEY) || '{}');
  counters[prefix] = (counters[prefix] || 0) + 1;
  window.localStorage.setItem(COUNTER_KEY, JSON.stringify(counters));
  return `${prefix}-${String(counters[prefix]).padStart(4, '0')}`;
}

function clean(parts: any[]): string[] {
  return parts.flatMap((part) => {
    if (!part) return [];
    if (typeof part === 'string') return [part];
    if (typeof part === 'object' && typeof part.path === 'string') return [part.path];
    return [];
  }).map(String).filter(Boolean);
}

function joinPath(parts: any[]): string {
  return clean(parts).join('/').replace(/\/+/g, '/');
}

function collectionPrefix(path: string) {
  return path.endsWith('/') ? path : `${path}/`;
}

function isDirectChild(docPath: string, collectionPath: string) {
  if (!docPath.startsWith(collectionPrefix(collectionPath))) return false;
  const suffix = docPath.slice(collectionPrefix(collectionPath).length);
  return suffix.length > 0 && !suffix.includes('/');
}

function snapshotDoc(path: string, data: any) {
  return {
    id: path.split('/').pop(),
    ref: { path, id: path.split('/').pop(), __type: 'doc' },
    exists: () => !!data,
    data: () => data,
  };
}

export function initializeFirestore() { return {}; }
export function getFirestore() { return {}; }
export function getDocFromServer(ref: Ref) { return getDoc(ref); }

export function collection(...args: any[]): Ref {
  return { path: joinPath(args), __type: 'collection' };
}

export function doc(...args: any[]): Ref {
  if (args.length === 1 && args[0]?.__type === 'collection') {
    const base = args[0].path;
    const prefix = base.split('/').pop() || 'doc';
    const id = nextId(prefix);
    return { id, path: `${base}/${id}`, __type: 'doc' };
  }
  const path = joinPath(args);
  return { id: path.split('/').pop(), path, __type: 'doc' };
}

export function where(field: string, op: string, value: any): Clause {
  return { kind: 'where', field, op, value };
}

export function orderBy(field: string, direction?: string): Clause {
  return { kind: 'orderBy', field, direction };
}

export function query(ref: Ref, ...clauses: Clause[]): Ref {
  return { ...ref, clauses };
}

export function serverTimestamp() {
  return now();
}

export async function setDoc(ref: Ref, data: any) {
  const store = readStore();
  store[ref.path] = { ...data };
  writeStore(store);
}

export async function updateDoc(ref: Ref, patch: any) {
  const store = readStore();
  const current = store[ref.path] || {};
  store[ref.path] = { ...current, ...patch };
  writeStore(store);
}

export async function deleteDoc(ref: Ref) {
  const store = readStore();
  delete store[ref.path];
  for (const key of Object.keys(store)) {
    if (key.startsWith(`${ref.path}/`)) delete store[key];
  }
  writeStore(store);
}

export async function addDoc(col: Ref, data: any) {
  const ref = doc(col);
  await setDoc(ref, { ...data, id: data?.id ?? ref.id });
  return ref;
}

export async function getDoc(ref: Ref) {
  const store = readStore();
  return snapshotDoc(ref.path, store[ref.path]);
}

export async function getDocs(ref: Ref) {
  const store = readStore();
  let entries = Object.entries(store).filter(([path]) => isDirectChild(path, ref.path));
  const clauses = ref.clauses || [];
  for (const clause of clauses) {
    if (clause.kind === 'where') {
      entries = entries.filter(([, data]) => {
        if (clause.op === '==') return data?.[clause.field] === clause.value;
        return true;
      });
    }
  }
  const order = clauses.find((c): c is Extract<Clause, { kind: 'orderBy' }> => c.kind === 'orderBy');
  if (order) {
    entries.sort(([, a], [, b]) => String(a?.[order.field] || '').localeCompare(String(b?.[order.field] || '')));
    if (order.direction === 'desc') entries.reverse();
  }
  const docs = entries.map(([path, data]) => snapshotDoc(path, data));
  return {
    empty: docs.length === 0,
    size: docs.length,
    docs,
    forEach: (cb: (doc: any) => void) => docs.forEach(cb),
  };
}

if (typeof window !== 'undefined') {
  (window as any).__VF_E2E_RESET_STORE__ = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(COUNTER_KEY);
    readStore();
  };
  (window as any).__VF_E2E_DUMP_STORE__ = () => readStore();
  readStore();
}
