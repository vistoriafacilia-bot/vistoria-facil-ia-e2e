import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'firebase-applet-config.json'), 'utf8'));

const mode = process.argv[2];
const allowedModes = new Set(['seed', 'cleanup']);
if (!allowedModes.has(mode)) {
  console.error('Usage: node scripts/staging-e2e-data.mjs <seed|cleanup>');
  process.exit(2);
}

const required = (key, fallback = '') => {
  const value = process.env[key] || fallback;
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

const projectId = required('FIREBASE_PROJECT_ID_STAGING', firebaseConfig.projectId);
const databaseId = process.env.FIRESTORE_DATABASE_ID || firebaseConfig.firestoreDatabaseId || '(default)';
const apiKey = required('FIREBASE_API_KEY', firebaseConfig.apiKey);
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket || `${projectId}.appspot.com`;
const email = required('STAGING_E2E_EMAIL');
const password = required('STAGING_E2E_PASSWORD');
const rawTestRunId = process.env.STAGING_TEST_RUN_ID || 'manual';
const testRunId = rawTestRunId.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 48) || 'manual';

const ids = {
  propertyId: `vf_e2e_property_${testRunId}`,
  inspectionId: `vf_e2e_inspection_${testRunId}`,
  roomId: `vf_e2e_room_sala_${testRunId}`,
  photoId: `vf_e2e_photo_${testRunId}`,
};

const firestoreBase = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents`;
const storageBase = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(storageBucket)}/o`;

const toFirestoreValue = (value) => {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return value.length === 0
      ? { arrayValue: {} }
      : { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, toFirestoreValue(nested)])),
      },
    };
  }
  return { stringValue: String(value) };
};

const toFirestoreFields = (data) => (
  Object.fromEntries(Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)]))
);

const fromFirestoreValue = (value) => {
  if (!value || typeof value !== 'object') return undefined;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue' in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields || {}).map(([key, nested]) => [key, fromFirestoreValue(nested)])
    );
  }
  return undefined;
};

const fromFirestoreDocument = (payload) => {
  const fields = payload?.fields || {};
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)]));
};

const encodeDocPath = (documentPath) => documentPath.split('/').map(encodeURIComponent).join('/');
const docUrl = (documentPath) => `${firestoreBase}/${encodeDocPath(documentPath)}`;
const collectionUrl = (parentPath, collectionId) => (
  parentPath ? `${docUrl(parentPath)}/${encodeURIComponent(collectionId)}` : `${firestoreBase}/${encodeURIComponent(collectionId)}`
);

const requestJson = async (url, options = {}, expected = [200]) => {
  const response = await fetch(url, options);
  if (!expected.includes(response.status)) {
    const text = await response.text();
    throw new Error(`Request failed ${response.status} ${options.method || 'GET'} ${url}: ${text}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
};

const signIn = async () => {
  const payload = await requestJson(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );

  if (!payload?.idToken || !payload?.localId) {
    throw new Error('Firebase Email/Password did not return idToken/localId.');
  }

  return {
    idToken: payload.idToken,
    uid: payload.localId,
    email: payload.email,
  };
};

const authHeaders = (idToken) => ({
  Authorization: `Bearer ${idToken}`,
  'Content-Type': 'application/json',
});

const setDoc = async (idToken, documentPath, data) => requestJson(
  docUrl(documentPath),
  {
    method: 'PATCH',
    headers: authHeaders(idToken),
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  }
);

const getDoc = async (idToken, documentPath) => {
  const response = await fetch(docUrl(documentPath), { headers: authHeaders(idToken) });
  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firestore get failed ${response.status} ${documentPath}: ${text}`);
  }
  return fromFirestoreDocument(await response.json());
};

const deleteDoc = async (idToken, documentPath) => requestJson(
  docUrl(documentPath),
  {
    method: 'DELETE',
    headers: authHeaders(idToken),
  },
  [200, 404]
).catch((error) => {
  if (String(error.message || error).includes('NOT_FOUND')) return null;
  throw error;
});

const listCollection = async (idToken, parentPath, collectionId) => {
  const payload = await requestJson(
    collectionUrl(parentPath, collectionId),
    { headers: authHeaders(idToken) },
    [200, 404]
  );
  return (payload?.documents || []).map((doc) => ({
    path: doc.name.split('/documents/')[1],
    id: doc.name.split('/').pop(),
    data: fromFirestoreDocument(doc),
  }));
};

const runInspectionQuery = async (idToken, uid) => {
  const payload = await requestJson(
    `${firestoreBase}:runQuery`,
    {
      method: 'POST',
      headers: authHeaders(idToken),
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'inspections' }],
          where: {
            compositeFilter: {
              op: 'AND',
              filters: [
                {
                  fieldFilter: {
                    field: { fieldPath: 'userId' },
                    op: 'EQUAL',
                    value: toFirestoreValue(uid),
                  },
                },
                {
                  fieldFilter: {
                    field: { fieldPath: 'propertyId' },
                    op: 'EQUAL',
                    value: toFirestoreValue(ids.propertyId),
                  },
                },
              ],
            },
          },
        },
      }),
    }
  );

  return (payload || [])
    .filter((item) => item.document)
    .map((item) => ({
      path: item.document.name.split('/documents/')[1],
      id: item.document.name.split('/').pop(),
      data: fromFirestoreDocument(item.document),
    }));
};

const deleteStorageObject = async (idToken, storagePath) => {
  if (!storagePath) return { storagePath, deleted: false, reason: 'missing_path' };
  const response = await fetch(`${storageBase}/${encodeURIComponent(storagePath)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if ([200, 204, 404].includes(response.status)) {
    return { storagePath, deleted: response.status !== 404 };
  }
  const text = await response.text();
  throw new Error(`Storage delete failed ${response.status} ${storagePath}: ${text}`);
};

const seed = async (session) => {
  const now = new Date().toISOString();
  const photoUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z';

  await setDoc(session.idToken, `users/${session.uid}`, {
    uid: session.uid,
    name: 'Vistoria Facil E2E Staging',
    email: session.email || email,
    createdAt: now,
    lastLoginAt: now,
    plan: 'gratuito',
    testRunId,
  });

  const entitlementId = `${session.uid}_free_init`;
  const existingEntitlement = await getDoc(session.idToken, `entitlements/${entitlementId}`).catch(() => null);
  if (!existingEntitlement) {
    await setDoc(session.idToken, `entitlements/${entitlementId}`, {
      id: entitlementId,
      userId: session.uid,
      planId: 'free_10',
      status: 'active',
      source: 'free_self_service',
      maxPhotosPerInspection: 10,
      pdfEnabled: true,
      createdAt: now,
      updatedAt: now,
      testRunId,
    });
  }

  await setDoc(session.idToken, `properties/${ids.propertyId}`, {
    id: ids.propertyId,
    userId: session.uid,
    nickname: `VF E2E ${testRunId}`,
    propertyType: 'apartamento',
    address: {
      street: 'Rua Staging',
      number: '002',
      neighborhood: 'E2E',
      city: 'Sao Paulo',
      state: 'SP',
      zipCode: '01000-000',
      reference: 'seed VF-STAGING-GATE-002',
    },
    generalNotes: `Seed automatizado VF-STAGING-GATE-002 testRunId=${testRunId}`,
    createdAt: now,
    updatedAt: now,
    testRunId,
  });

  await setDoc(session.idToken, `inspections/${ids.inspectionId}`, {
    id: ids.inspectionId,
    userId: session.uid,
    propertyId: ids.propertyId,
    inspectionType: 'entrada',
    status: 'concluida',
    startedAt: now,
    completedAt: now,
    summary: `Vistoria seed VF-STAGING-GATE-002 testRunId=${testRunId}`,
    appVersion: 'V0.4.0-rc2',
    testRunId,
  });

  await setDoc(session.idToken, `inspections/${ids.inspectionId}/rooms/${ids.roomId}`, {
    id: ids.roomId,
    inspectionId: ids.inspectionId,
    userId: session.uid,
    name: 'Sala E2E',
    order: 0,
    isDefault: false,
    createdAt: now,
    updatedAt: now,
    testRunId,
  });

  await setDoc(session.idToken, `inspections/${ids.inspectionId}/photos/${ids.photoId}`, {
    id: ids.photoId,
    inspectionId: ids.inspectionId,
    roomId: ids.roomId,
    roomName: 'Sala E2E',
    userId: session.uid,
    url: photoUrl,
    imageUrl: photoUrl,
    storagePath: `inspection-photos/${session.uid}/${ids.inspectionId}/${ids.photoId}.jpg`,
    caption: 'Foto seed real staging',
    displayTitle: 'Foto seed real staging',
    description: 'Registro tecnico de teste para validacao de PDF e Storage em staging.',
    aiAnalysis: {
      item_observado: 'Parede de teste',
      condicao_sugerida: 'OK',
      descricao_neutra: 'Registro tecnico de teste para validacao de PDF e Storage em staging.',
      pontos_de_atencao: [],
      confianca: 'alta',
    },
    reviewedStatus: 'confirmado',
    reviewStatus: 'confirmed',
    uploadStatus: 'uploaded',
    analysisStatus: 'completed',
    conditionSuggested: 'OK',
    itemObserved: 'Parede de teste',
    descriptionSuggested: 'Registro tecnico de teste para validacao de PDF e Storage em staging.',
    fallbackApplied: false,
    createdAt: now,
    updatedAt: now,
    testRunId,
  });

  return {
    mode,
    status: 'seeded',
    projectId,
    databaseId,
    storageBucket,
    testRunId,
    user: { uid: session.uid, email: session.email || email },
    ids,
  };
};

const cleanup = async (session) => {
  const inspections = await runInspectionQuery(session.idToken, session.uid).catch(async (error) => {
    console.warn(`Inspection query failed, falling back to deterministic inspection cleanup: ${error.message}`);
    return [{ id: ids.inspectionId, path: `inspections/${ids.inspectionId}`, data: {} }];
  });

  const storageResults = [];
  const deleted = {
    reports: 0,
    photos: 0,
    rooms: 0,
    inspections: 0,
    properties: 0,
  };

  for (const inspection of inspections) {
    const inspectionId = inspection.id;
    const inspectionPath = `inspections/${inspectionId}`;
    const reports = await listCollection(session.idToken, inspectionPath, 'reports').catch(() => []);
    const photos = await listCollection(session.idToken, inspectionPath, 'photos').catch(() => []);
    const rooms = await listCollection(session.idToken, inspectionPath, 'rooms').catch(() => []);

    for (const report of reports) {
      if (report.data?.storagePath) {
        storageResults.push(await deleteStorageObject(session.idToken, report.data.storagePath));
      }
      await deleteDoc(session.idToken, `${inspectionPath}/reports/${report.id}`);
      deleted.reports += 1;
    }

    for (const photo of photos) {
      if (photo.data?.storagePath?.startsWith('inspection-photos/')) {
        storageResults.push(await deleteStorageObject(session.idToken, photo.data.storagePath));
      }
      await deleteDoc(session.idToken, `${inspectionPath}/photos/${photo.id}`);
      deleted.photos += 1;
    }

    for (const room of rooms) {
      await deleteDoc(session.idToken, `${inspectionPath}/rooms/${room.id}`);
      deleted.rooms += 1;
    }

    await deleteDoc(session.idToken, inspectionPath);
    deleted.inspections += 1;
  }

  await deleteDoc(session.idToken, `properties/${ids.propertyId}`);
  deleted.properties += 1;

  return {
    mode,
    status: 'cleaned',
    projectId,
    databaseId,
    storageBucket,
    testRunId,
    user: { uid: session.uid, email: session.email || email },
    ids,
    deleted,
    storageResults,
    note: 'Entitlement free_self_service is intentionally not deleted because Firestore rules block client deletes for entitlements.',
  };
};

const main = async () => {
  const session = await signIn();
  const result = mode === 'seed' ? await seed(session) : await cleanup(session);
  fs.mkdirSync(path.join(rootDir, 'test-results'), { recursive: true });
  fs.writeFileSync(
    path.join(rootDir, 'test-results', `staging-e2e-${mode}.json`),
    JSON.stringify(result, null, 2)
  );
  console.log(JSON.stringify(result, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
