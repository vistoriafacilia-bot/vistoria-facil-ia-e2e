import { AppUser, Entitlement, Inspection, Photo, Property, Room, SystemEvent } from '../types';

type LocalTable =
  | 'profiles'
  | 'properties'
  | 'inspections'
  | 'rooms'
  | 'photos'
  | 'entitlements'
  | 'events'
  | 'reports';

type LocalState = Record<LocalTable, any[]>;

const STORE_KEY = 'vf-supabase-local-store-v1';
const COUNTER_KEY = 'vf-supabase-local-counters-v1';

export const localTestUser: AppUser = {
  uid: 'e2e-user-001',
  id: 'e2e-user-001',
  email: 'e2e@vistoriafacil.test',
  displayName: 'Usuario E2E',
  photoURL: null,
};

const now = () => new Date().toISOString();

function defaultState(): LocalState {
  const freeEntitlement: Entitlement = {
    id: `${localTestUser.uid}_free_10`,
    userId: localTestUser.uid,
    planId: 'free_10',
    status: 'active',
    source: 'free_self_service',
    maxPhotosPerInspection: 10,
    pdfEnabled: true,
    createdAt: now(),
    updatedAt: now(),
  };

  const property: Property = {
    id: 'prop-e2e-001',
    userId: localTestUser.uid,
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
      reference: 'Proximo ao teste automatizado',
    },
    generalNotes: 'Imovel sem dados reais; massa de teste local.',
    createdAt: now(),
    updatedAt: now(),
  };

  return {
    profiles: [{
      id: localTestUser.uid,
      uid: localTestUser.uid,
      name: localTestUser.displayName,
      email: localTestUser.email,
      createdAt: now(),
      lastLoginAt: now(),
      plan: 'gratuito',
    }],
    properties: [property],
    inspections: [],
    rooms: [],
    photos: [],
    entitlements: [freeEntitlement],
    events: [],
    reports: [],
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function readLocalState(): LocalState {
  if (typeof window === 'undefined') return defaultState();
  const raw = window.localStorage.getItem(STORE_KEY);
  if (!raw) {
    const seeded = defaultState();
    window.localStorage.setItem(STORE_KEY, JSON.stringify(seeded));
    return seeded;
  }
  return JSON.parse(raw);
}

export function writeLocalState(state: LocalState) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }
}

export function nextLocalId(prefix: string) {
  if (typeof window === 'undefined') {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  }
  const counters = JSON.parse(window.localStorage.getItem(COUNTER_KEY) || '{}');
  counters[prefix] = (counters[prefix] || 0) + 1;
  window.localStorage.setItem(COUNTER_KEY, JSON.stringify(counters));
  return `${prefix}-${String(counters[prefix]).padStart(4, '0')}`;
}

export function localList<T>(table: LocalTable, predicate?: (row: T) => boolean): T[] {
  const rows = readLocalState()[table] as T[];
  return clone(predicate ? rows.filter(predicate) : rows);
}

export function localGet<T extends { id: string }>(table: LocalTable, id: string): T | null {
  return clone((readLocalState()[table] as T[]).find(row => row.id === id) || null);
}

export function localUpsert<T extends { id: string }>(table: LocalTable, row: T): T {
  const state = readLocalState();
  const rows = state[table] as T[];
  const index = rows.findIndex(item => item.id === row.id);
  if (index >= 0) rows[index] = { ...rows[index], ...clone(row) };
  else rows.push(clone(row));
  writeLocalState(state);
  return clone(row);
}

export function localPatch<T extends { id: string }>(table: LocalTable, id: string, patch: Partial<T>): T {
  const state = readLocalState();
  const rows = state[table] as T[];
  const index = rows.findIndex(item => item.id === id);
  if (index < 0) throw new Error(`${table}/${id} not found`);
  rows[index] = { ...rows[index], ...clone(patch) };
  writeLocalState(state);
  return clone(rows[index]);
}

export function localDelete(table: LocalTable, predicate: (row: any) => boolean) {
  const state = readLocalState();
  state[table] = state[table].filter(row => !predicate(row));
  writeLocalState(state);
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function localCountEvents(userId: string) {
  const events = localList<SystemEvent>('events', event => event.userId === userId);
  return {
    ai: events.filter(event => event.event === 'ai_analysis').length,
    pdf: events.filter(event => event.event === 'pdf_generation').length,
  };
}

function toPathDump(state: LocalState) {
  const dump: Record<string, any> = {};
  state.properties.forEach((property: Property) => {
    dump[`properties/${property.id}`] = property;
  });
  state.inspections.forEach((inspection: Inspection) => {
    dump[`inspections/${inspection.id}`] = inspection;
  });
  state.rooms.forEach((room: Room) => {
    dump[`inspections/${room.inspectionId}/rooms/${room.id}`] = room;
  });
  state.photos.forEach((photo: Photo) => {
    dump[`inspections/${photo.inspectionId}/photos/${photo.id}`] = photo;
  });
  state.entitlements.forEach((entitlement: Entitlement) => {
    dump[`entitlements/${entitlement.id}`] = entitlement;
  });
  state.events.forEach((event: SystemEvent & { id?: string }) => {
    dump[`events/${event.id || `${event.event}-${event.createdAt}`}`] = event;
  });
  state.reports.forEach((report: any) => {
    dump[`inspections/${report.inspectionId}/reports/${report.id}`] = report;
  });
  return dump;
}

if (typeof window !== 'undefined') {
  (window as any).__VF_E2E_RESET_STORE__ = () => {
    window.localStorage.removeItem(STORE_KEY);
    window.localStorage.removeItem(COUNTER_KEY);
    readLocalState();
  };
  (window as any).__VF_E2E_DUMP_STORE__ = () => toPathDump(readLocalState());
  readLocalState();
}
