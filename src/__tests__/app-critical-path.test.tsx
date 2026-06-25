import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { Entitlement, Inspection, Property, Room, Photo } from '../types';

const firestoreStore = vi.hoisted(() => ({
  docs: new Map<string, any>(),
  counters: new Map<string, number>(),
}));

const pathFromArgs = (...args: any[]) => args
  .map(arg => {
    if (!arg) return '';
    if (typeof arg === 'string') return arg;
    if (typeof arg === 'object' && 'path' in arg) return arg.path;
    return '';
  })
  .filter(Boolean)
  .join('/');

const nextId = (prefix: string) => {
  const current = firestoreStore.counters.get(prefix) || 0;
  firestoreStore.counters.set(prefix, current + 1);
  return `${prefix}-${String(current + 1).padStart(3, '0')}`;
};

const makeDoc = (path: string) => ({ id: path.split('/').pop() || path, path });
const makeCollection = (path: string) => ({ path });

const firestoreMocks = vi.hoisted(() => ({
  collection: vi.fn((...args: any[]) => makeCollection(pathFromArgs(...args))),
  doc: vi.fn((...args: any[]) => {
    if (args.length === 1 && args[0]?.path) {
      const prefix = args[0].path.split('/').pop() || 'doc';
      return makeDoc(`${args[0].path}/${nextId(prefix)}`);
    }
    return makeDoc(pathFromArgs(...args));
  }),
  where: vi.fn((field: string, op: string, value: any) => ({ field, op, value })),
  query: vi.fn((ref: any, ...clauses: any[]) => ({ ...ref, clauses })),
  getDoc: vi.fn(async (ref: any) => {
    const data = firestoreStore.docs.get(ref.path);
    return {
      exists: () => !!data,
      data: () => data,
      id: ref.id,
    };
  }),
  setDoc: vi.fn(async (ref: any, data: any) => {
    // Audit events are intentionally non-critical. This simulates the exact
    // class of Firestore permission failure that broke the first staging check.
    if (ref.path.startsWith('events/')) {
      throw new Error('Missing or insufficient permissions');
    }
    firestoreStore.docs.set(ref.path, { ...data });
  }),
  updateDoc: vi.fn(async (ref: any, patch: any) => {
    const current = firestoreStore.docs.get(ref.path) || {};
    firestoreStore.docs.set(ref.path, { ...current, ...patch });
  }),
  deleteDoc: vi.fn(async (ref: any) => {
    firestoreStore.docs.delete(ref.path);
  }),
  getDocs: vi.fn(async (ref: any) => {
    const path = ref.path;
    const clauses = ref.clauses || [];
    const entries = Array.from(firestoreStore.docs.entries())
      .filter(([docPath]) => {
        if (path === 'entitlements') return docPath.startsWith('entitlements/') && docPath.split('/').length === 2;
        if (path === 'properties') return docPath.startsWith('properties/') && docPath.split('/').length === 2;
        if (path === 'inspections') return docPath.startsWith('inspections/') && docPath.split('/').length === 2;
        if (/^inspections\/[^/]+\/rooms$/.test(path)) return docPath.startsWith(`${path}/`) && docPath.split('/').length === 4;
        if (/^inspections\/[^/]+\/photos$/.test(path)) return docPath.startsWith(`${path}/`) && docPath.split('/').length === 4;
        if (/^inspections\/[^/]+\/reports$/.test(path)) return docPath.startsWith(`${path}/`) && docPath.split('/').length === 4;
        return false;
      })
      .filter(([, data]) => clauses.every((clause: any) => clause.op === '==' ? data[clause.field] === clause.value : true));

    return {
      empty: entries.length === 0,
      docs: entries.map(([docPath, data]) => ({ id: docPath.split('/').pop(), data: () => data })),
      forEach: (cb: any) => entries.forEach(([docPath, data]) => cb({ id: docPath.split('/').pop(), data: () => data })),
    };
  }),
}));

const testUser = vi.hoisted(() => ({
  uid: 'test-user-123',
  email: 'test@example.com',
  displayName: 'Usuário Teste',
  getIdToken: vi.fn(async () => 'fake-token'),
}));

vi.mock('../firebase', () => ({
  db: {},
  auth: { currentUser: testUser },
  loginWithGoogle: vi.fn(),
  logout: vi.fn(),
  OperationType: {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    LIST: 'list',
    GET: 'get',
    WRITE: 'write',
  },
  handleFirestoreError: vi.fn((err) => { throw err; }),
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((auth, cb) => {
    cb(testUser);
    return () => {};
  }),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  getAuth: vi.fn(() => ({ currentUser: testUser })),
}));

vi.mock('firebase/firestore', () => ({
  collection: firestoreMocks.collection,
  doc: firestoreMocks.doc,
  getDoc: firestoreMocks.getDoc,
  getDocs: firestoreMocks.getDocs,
  setDoc: firestoreMocks.setDoc,
  updateDoc: firestoreMocks.updateDoc,
  deleteDoc: firestoreMocks.deleteDoc,
  query: firestoreMocks.query,
  where: firestoreMocks.where,
  orderBy: vi.fn(),
  serverTimestamp: vi.fn(),
}));

const seedCoreData = () => {
  const property: Property = {
    id: 'prop-1',
    userId: testUser.uid,
    nickname: 'Apartamento Centro QA',
    propertyType: 'apartamento',
    address: {
      street: 'Av Paulista',
      number: '1000',
      complement: 'Apt 12',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01310-100',
    },
    createdAt: '2026-06-25T10:00:00.000Z',
    updatedAt: '2026-06-25T10:00:00.000Z',
  };
  const entitlement: Entitlement = {
    id: `${testUser.uid}_free_10`,
    userId: testUser.uid,
    planId: 'free_10',
    status: 'active',
    source: 'free_self_service',
    maxPhotosPerInspection: 10,
    pdfEnabled: true,
    createdAt: '2026-06-25T10:00:00.000Z',
    updatedAt: '2026-06-25T10:00:00.000Z',
  };
  firestoreStore.docs.set(`users/${testUser.uid}`, {
    uid: testUser.uid,
    email: testUser.email,
    createdAt: '2026-06-25T10:00:00.000Z',
  });
  firestoreStore.docs.set(`properties/${property.id}`, property);
  firestoreStore.docs.set(`entitlements/${entitlement.id}`, entitlement);
  return { property, entitlement };
};

describe('App integrated critical path', () => {
  beforeEach(() => {
    firestoreStore.docs.clear();
    firestoreStore.counters.clear();
    vi.clearAllMocks();
    seedCoreData();
  });

  it('loads entitlement, opens a property, starts inspection and shows default rooms even when audit event is denied', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Apartamento Centro QA')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Nova Vistoria/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Começar Vistoria/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Começar Vistoria/i }));

    await waitFor(() => {
      expect(screen.getByText('Sala')).toBeInTheDocument();
    });

    const storedInspection = Array.from(firestoreStore.docs.values()).find((doc: any) => doc?.propertyId === 'prop-1' && doc?.status === 'em_andamento') as Inspection | undefined;
    expect(storedInspection).toBeTruthy();
    expect(storedInspection?.userId).toBe(testUser.uid);
    expect(storedInspection?.appVersion).toBe('V0.4.0-rc2');

    const storedRooms = Array.from(firestoreStore.docs.entries()).filter(([path]) => path.includes(`/rooms/`));
    expect(storedRooms).toHaveLength(9);

    expect(firestoreMocks.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringMatching(/^events\//) }),
      expect.objectContaining({ event: 'inspection_create', id: expect.any(String), userId: testUser.uid })
    );
  });

  it('opens existing inspection history and continues a draft with persisted rooms and photos', async () => {
    const inspection: Inspection = {
      id: 'insp-existing-1',
      userId: testUser.uid,
      propertyId: 'prop-1',
      inspectionType: 'entrada',
      status: 'em_andamento',
      startedAt: '2026-06-25T11:00:00.000Z',
      appVersion: 'V0.4.0-rc2',
    };
    const room: Room = {
      id: 'room-existing-1',
      inspectionId: inspection.id,
      userId: testUser.uid,
      name: 'Sala Histórica',
      order: 0,
      isDefault: false,
      createdAt: '2026-06-25T11:00:00.000Z',
      updatedAt: '2026-06-25T11:00:00.000Z',
    };
    const photo: Photo = {
      id: 'photo-existing-1',
      inspectionId: inspection.id,
      roomId: room.id,
      roomName: room.name,
      userId: testUser.uid,
      url: 'data:image/png;base64,abc',
      caption: 'Parede da sala',
      reviewedStatus: 'confirmado',
      analysisStatus: 'completed',
      createdAt: '2026-06-25T11:05:00.000Z',
      description: 'Parede em bom estado aparente.',
    };
    firestoreStore.docs.set(`inspections/${inspection.id}`, inspection);
    firestoreStore.docs.set(`inspections/${inspection.id}/rooms/${room.id}`, room);
    firestoreStore.docs.set(`inspections/${inspection.id}/photos/${photo.id}`, photo);

    render(<App />);

    await waitFor(() => expect(screen.getByText('Apartamento Centro QA')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Histórico/i }));

    await waitFor(() => expect(screen.getByText(/Vistoria de Entrada/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Continuar Rascunho/i }));

    await waitFor(() => expect(screen.getByText('Sala Histórica')).toBeInTheDocument());
    expect(screen.getByText('Parede da sala')).toBeInTheDocument();
  });

  it('persists custom room organization and resumes it only through Historico -> Continuar Rascunho', async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText('Apartamento Centro QA')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Nova Vistoria/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Começar Vistoria/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Começar Vistoria/i }));

    await waitFor(() => expect(screen.getByText('Sala')).toBeInTheDocument());

    // Rename the default first room to prove updates persist, not only creation.
    fireEvent.click(screen.getAllByTitle('Renomear')[0]);
    const renameInput = screen.getByPlaceholderText(/Novo nome do cômodo/i);
    fireEvent.change(renameInput, { target: { value: 'Sala Principal QA' } });
    fireEvent.click(screen.getByRole('button', { name: /^Salvar$/i }));
    await waitFor(() => expect(screen.getByText('Sala Principal QA')).toBeInTheDocument());

    // Add two custom rooms, the exact user-reported class of organization changes.
    const addRoom = async (roomName: string) => {
      const input = screen.getByPlaceholderText(/Novo cômodo/i);
      fireEvent.change(input, { target: { value: roomName } });
      fireEvent.click(screen.getByTitle('Adicionar cômodo'));
      await waitFor(() => expect(screen.getByText(roomName)).toBeInTheDocument());
    };

    await addRoom('Sala Extra QA');
    await addRoom('Quarto QA');

    const storedInspection = Array.from(firestoreStore.docs.entries())
      .find(([path, data]) => path.startsWith('inspections/') && path.split('/').length === 2 && data?.propertyId === 'prop-1')?.[1] as Inspection | undefined;
    expect(storedInspection).toBeTruthy();

    const roomNamesBeforeLeaving = Array.from(firestoreStore.docs.entries())
      .filter(([path]) => path.startsWith(`inspections/${storedInspection!.id}/rooms/`))
      .map(([, data]) => data.name)
      .sort();

    expect(roomNamesBeforeLeaving).toContain('Sala Principal QA');
    expect(roomNamesBeforeLeaving).toContain('Sala Extra QA');
    expect(roomNamesBeforeLeaving).toContain('Quarto QA');

    fireEvent.click(screen.getByRole('button', { name: /Voltar para histórico/i }));
    await waitFor(() => expect(screen.getByText(/Histórico de Vistorias/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Continuar Rascunho/i }));

    await waitFor(() => expect(screen.getByText('Sala Principal QA')).toBeInTheDocument());
    expect(screen.getByText('Sala Extra QA')).toBeInTheDocument();
    expect(screen.getByText('Quarto QA')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Começar Vistoria/i })).not.toBeInTheDocument();
  });

  it('always opens explicit Entrada/Saida selection when clicking Nova Vistoria, even with an existing draft', async () => {
    const inspection: Inspection = {
      id: 'insp-existing-draft',
      userId: testUser.uid,
      propertyId: 'prop-1',
      inspectionType: 'entrada',
      status: 'em_andamento',
      startedAt: '2026-06-25T11:00:00.000Z',
      appVersion: 'V0.4.0-rc2',
    };
    const room: Room = {
      id: 'room-existing-draft',
      inspectionId: inspection.id,
      userId: testUser.uid,
      name: 'Sala Existente QA',
      order: 0,
      isDefault: false,
      createdAt: '2026-06-25T11:00:00.000Z',
      updatedAt: '2026-06-25T11:00:00.000Z',
    };
    firestoreStore.docs.set(`inspections/${inspection.id}`, inspection);
    firestoreStore.docs.set(`inspections/${inspection.id}/rooms/${room.id}`, room);

    render(<App />);

    await waitFor(() => expect(screen.getByText('Apartamento Centro QA')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Nova Vistoria/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /Começar Vistoria/i })).toBeInTheDocument());
    expect(screen.getByText(/Selecione o tipo de vistoria/i)).toBeInTheDocument();
    expect(screen.getByText(/Vistoria de Entrada/i)).toBeInTheDocument();
    expect(screen.getByText(/Vistoria de Saída/i)).toBeInTheDocument();
    expect(screen.queryByText('Sala Existente QA')).not.toBeInTheDocument();
  });

  it('creates a Saida inspection when the user explicitly selects Vistoria de Saida before starting', async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText('Apartamento Centro QA')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Nova Vistoria/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Começar Vistoria/i })).toBeInTheDocument());

    fireEvent.click(screen.getByText(/Vistoria de Saída/i));
    fireEvent.click(screen.getByRole('button', { name: /Começar Vistoria/i }));

    await waitFor(() => expect(screen.getByText(/Vistoria de Saída/i)).toBeInTheDocument());
    const storedInspection = Array.from(firestoreStore.docs.entries())
      .find(([path, data]) => path.startsWith('inspections/') && path.split('/').length === 2 && data?.propertyId === 'prop-1')?.[1] as Inspection | undefined;
    expect(storedInspection?.inspectionType).toBe('saida');
  });

  it('queries inspections with userId and propertyId to satisfy Firestore ownership rules', async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText('Apartamento Centro QA')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Histórico/i }));

    await waitFor(() => expect(screen.getByText(/Histórico de Vistorias/i)).toBeInTheDocument());

    expect(firestoreMocks.where).toHaveBeenCalledWith('userId', '==', testUser.uid);
    expect(firestoreMocks.where).toHaveBeenCalledWith('propertyId', '==', 'prop-1');
  });
});
