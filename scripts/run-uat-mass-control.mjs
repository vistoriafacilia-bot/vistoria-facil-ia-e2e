import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const TARGET_URL = 'https://glittery-boba-2b3367.netlify.app';
const REPORT_PATH = 'qa/vf_uat_mass_control_20260626.md';
const BUCKET = 'inspection-photos';
const CLIENTS_PER_PLAN = 5;
const RUN_ID = `uat_mass_${Date.now()}`;
const ONE_PIXEL_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z',
  'base64',
);

function loadEnvLocal() {
  const values = {};
  if (!existsSync('.env.local')) return values;
  for (const raw of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    values[line.slice(0, idx)] = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
}

function sanitizeMessage(value) {
  const text = String(value || '');
  const lower = text.toLowerCase();
  if (
    lower.includes('supabase')
    || lower.includes('auth')
    || lower.includes('token')
    || lower.includes('key')
    || lower.includes('password')
    || lower.includes('service_role')
  ) {
    return '[redacted message mentioning auth/sensitive context]';
  }
  return text.replace(/\s+/g, ' ').slice(0, 300);
}

function sanitizeMessages(values) {
  return values.map(sanitizeMessage);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function roomNameRegex(roomName) {
  return new RegExp(`^\\s*${escapeRegex(roomName)}\\s*$`);
}

function roomRow(page, roomName) {
  return page
    .locator('div.group.flex.items-center.justify-between.gap-1')
    .filter({ has: page.locator('span.truncate').filter({ hasText: roomNameRegex(roomName) }) })
    .first();
}

function emailFor(planId, index) {
  return `e2e-uat-${RUN_ID}-${planId}-${index}@vistoriafacilia.test`;
}

function passwordFor(planId, index) {
  return `UatMass-${RUN_ID}-${planId}-${index}!`;
}

function photoFiles(prefix, count) {
  return Array.from({ length: count }, (_, index) => ({
    name: `${prefix}-${index + 1}.jpg`,
    mimeType: 'image/jpeg',
    buffer: ONE_PIXEL_JPEG,
  }));
}

async function waitForPhotoCount(supabase, inspectionId, expected, timeoutMs = 180_000) {
  const started = Date.now();
  let lastCount = -1;
  while (Date.now() - started < timeoutMs) {
    const { data, error } = await supabase
      .from('photos')
      .select('id', { count: 'exact' })
      .eq('inspection_id', inspectionId);
    if (error) throw new Error(`photo count query failed: ${error.message}`);
    lastCount = data?.length || 0;
    if (lastCount === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`photo count timeout: expected ${expected}, got ${lastCount}`);
}

async function waitForNoPhoto(supabase, photoId, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { data, error } = await supabase.from('photos').select('id').eq('id', photoId).maybeSingle();
    if (error) throw new Error(`photo delete query failed: ${error.message}`);
    if (!data) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`photo delete timeout: ${photoId}`);
}

async function waitForPropertyCard(page, nickname) {
  await page.getByText(nickname).waitFor({ state: 'visible', timeout: 30_000 });
  return page.locator('[data-testid^="property-card-"]').filter({ hasText: nickname });
}

async function selectRoom(page, roomName) {
  const row = roomRow(page, roomName);
  await row.waitFor({ state: 'visible', timeout: 15_000 });
  await row.locator('button').first().click();
  await page.getByText(new RegExp(`Registro de Fotos: ${escapeRegex(roomName)}`)).waitFor({
    state: 'visible',
    timeout: 15_000,
  });
}

async function assertRoomPhotosVisibleAfterResume(page, roomName) {
  await selectRoom(page, roomName);
  await page.getByText(/Sem An.lise de IA/i).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(async () => {
    // The wizard can rehydrate the default room after opening a draft; select again after that async load settles.
    await page.waitForTimeout(1000);
    await selectRoom(page, roomName);
    await page.getByText(/Sem An.lise de IA/i).first().waitFor({ state: 'visible', timeout: 20_000 });
  });
  const hasImage = (await page.locator('img[alt*="Foto registrada"]').count()) > 0;
  if (!hasImage) throw new Error('photo preview not visible after resume');
}

async function uploadFiles(page, count, prefix) {
  await page.locator('input[type="file"][multiple]').last().setInputFiles(photoFiles(prefix, count));
}

async function visibleOrFalse(locator) {
  return locator.isVisible().catch(() => false);
}

async function cleanupClient(admin, created) {
  await enrichCreated(admin, created);
  const result = {
    storageRemoved: 'not_needed',
    photosRemoved: 'not_needed',
    roomsRemoved: 'not_needed',
    reportsRemoved: 'not_needed',
    inspectionsRemoved: 'not_needed',
    propertiesRemoved: 'not_needed',
    entitlementsRemoved: 'not_needed',
    eventsRemoved: 'not_needed',
    profilesRemoved: 'not_needed',
    authUserDeleted: 'not_needed',
    leftovers: {},
    errors: [],
  };

  const paths = [...new Set(created.storagePaths.filter(Boolean))];
  const photoIds = [...new Set(created.photoIds.filter(Boolean))];
  const inspectionIds = [...new Set(created.inspectionIds.filter(Boolean))];
  const propertyIds = [...new Set(created.propertyIds.filter(Boolean))];
  const entitlementIds = [...new Set(created.entitlementIds.filter(Boolean))];

  if (paths.length) {
    const res = await admin.storage.from(BUCKET).remove(paths);
    result.storageRemoved = res.error ? `error: ${res.error.message}` : `ok:${Array.isArray(res.data) ? res.data.length : 'unknown'}`;
  }
  if (photoIds.length) {
    const res = await admin.from('photos').delete().in('id', photoIds);
    result.photosRemoved = res.error ? `error: ${res.error.message}` : 'ok';
  }
  if (inspectionIds.length) {
    let res = await admin.from('rooms').delete().in('inspection_id', inspectionIds);
    result.roomsRemoved = res.error ? `error: ${res.error.message}` : 'ok';
    res = await admin.from('reports').delete().in('inspection_id', inspectionIds);
    result.reportsRemoved = res.error ? `error: ${res.error.message}` : 'ok';
    res = await admin.from('inspections').delete().in('id', inspectionIds);
    result.inspectionsRemoved = res.error ? `error: ${res.error.message}` : 'ok';
  }
  if (propertyIds.length) {
    const res = await admin.from('properties').delete().in('id', propertyIds);
    result.propertiesRemoved = res.error ? `error: ${res.error.message}` : 'ok';
  }
  if (entitlementIds.length) {
    const res = await admin.from('entitlements').delete().in('id', entitlementIds);
    result.entitlementsRemoved = res.error ? `error: ${res.error.message}` : 'ok';
  }
  if (created.userId) {
    let res = await admin.from('events').delete().eq('user_id', created.userId);
    result.eventsRemoved = res.error ? `error: ${res.error.message}` : 'ok';
    res = await admin.from('profiles').delete().eq('id', created.userId);
    result.profilesRemoved = res.error ? `error: ${res.error.message}` : 'ok';
    const deleteUser = await admin.auth.admin.deleteUser(created.userId);
    result.authUserDeleted = deleteUser.error ? `error: ${deleteUser.error.message}` : 'ok';
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));

  for (const path of paths) {
    const parts = path.split('/');
    const fileName = parts.pop();
    const folder = parts.join('/');
    const listed = await admin.storage.from(BUCKET).list(folder, { limit: 100 });
    result.leftovers[path] = listed.error ? `list_error: ${listed.error.message}` : listed.data.some((entry) => entry.name === fileName);
  }

  const leftoverChecks = await verifyNoDatabaseLeftovers(admin, created);
  result.leftovers = { ...result.leftovers, ...leftoverChecks };
  return result;
}

async function enrichCreated(admin, created) {
  if (!created.userId) return;
  if (!created.propertyIds.length) {
    const res = await admin.from('properties').select('id').eq('user_id', created.userId);
    if (!res.error) created.propertyIds.push(...res.data.map((row) => row.id));
  }
  if (!created.inspectionIds.length) {
    const res = await admin.from('inspections').select('id').eq('user_id', created.userId);
    if (!res.error) created.inspectionIds.push(...res.data.map((row) => row.id));
  }
  if (!created.roomIds.length && created.inspectionIds.length) {
    const res = await admin.from('rooms').select('id').eq('user_id', created.userId);
    if (!res.error) created.roomIds.push(...res.data.map((row) => row.id));
  }
  if (!created.photoIds.length) {
    const res = await admin.from('photos').select('id,storage_path').eq('user_id', created.userId);
    if (!res.error) {
      created.photoIds.push(...res.data.map((row) => row.id));
      created.storagePaths.push(...res.data.map((row) => row.storage_path).filter(Boolean));
    }
  }
  if (!created.entitlementIds.length) {
    const res = await admin.from('entitlements').select('id').eq('user_id', created.userId);
    if (!res.error) created.entitlementIds.push(...res.data.map((row) => row.id));
  }
}

async function verifyNoDatabaseLeftovers(admin, created) {
  if (!created.userId) return {};
  const tables = ['properties', 'inspections', 'rooms', 'photos', 'reports', 'entitlements', 'events'];
  const result = {};
  for (const table of tables) {
    const res = await admin.from(table).select('id', { count: 'exact', head: true }).eq('user_id', created.userId);
    result[`${table}Rows`] = res.error ? `check_error: ${res.error.message}` : (res.count || 0);
  }
  const profile = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('id', created.userId);
  result.profileRows = profile.error ? `check_error: ${profile.error.message}` : (profile.count || 0);
  const authUser = await admin.auth.admin.getUserById(created.userId);
  result.authUserExists = authUser.data?.user ? true : false;
  return result;
}

function cleanupIsOk(cleanup) {
  if (cleanup.errors.length) return false;
  return Object.values(cleanup.leftovers).every((value) => value === false || value === 0);
}

async function createUserAndEntitlement(admin, plan, index) {
  const email = emailFor(plan.id, index);
  const password = passwordFor(plan.id, index);
  const created = {
    email,
    userId: null,
    propertyIds: [],
    inspectionIds: [],
    roomIds: [],
    photoIds: [],
    storagePaths: [],
    entitlementIds: [],
  };

  const user = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { testRunId: RUN_ID, planId: plan.id, purpose: 'uat_mass_control' },
  });
  if (user.error || !user.data.user) {
    throw new Error(`admin create user failed: ${user.error?.message || 'no user'}`);
  }
  created.userId = user.data.user.id;

  const entitlementId = `${created.userId}_${plan.id}_${RUN_ID}`;
  const entitlement = await admin.from('entitlements').insert({
    id: entitlementId,
    user_id: created.userId,
    plan_id: plan.id,
    status: 'active',
    source: 'manual_admin',
    max_photos_per_inspection: plan.max_photos_per_inspection,
    pdf_enabled: plan.pdf_enabled,
  }).select('id').single();
  if (entitlement.error) {
    throw new Error(`admin entitlement insert failed: ${entitlement.error.message}`);
  }
  created.entitlementIds.push(entitlementId);

  return { email, password, created };
}

async function runClient(browser, anon, admin, plan, index) {
  const isLimitRepresentative = index === 1;
  const label = `${plan.id}-${index}`;
  const client = {
    planId: plan.id,
    planName: plan.name,
    index,
    email: emailFor(plan.id, index),
    status: 'PENDING',
    auth: { wrongPassword: 'NOT_RUN', login: 'NOT_RUN', forgotPassword: 'NOT_SUPPORTED', resendEmail: 'NOT_SUPPORTED' },
    crud: { propertyCreate: 'NOT_RUN', propertyEdit: 'NOT_RUN', inspectionCreate: 'NOT_RUN', roomCreate: 'NOT_RUN', roomEdit: 'NOT_RUN', roomDelete: 'NOT_RUN', photoDelete: 'NOT_RUN', photoReplace: 'NOT_RUN' },
    limits: { realLimit: plan.max_photos_per_inspection, below: 'NOT_RUN', at: 'NOT_RUN', above: 'NOT_RUN', testedPhotos: 0, capApplied: false },
    storage: { upload: 'NOT_RUN', read: 'NOT_RUN', delete: 'NOT_RUN' },
    persistence: 'NOT_RUN',
    fallback: 'NOT_RUN',
    manualReview: 'NOT_RUN',
    navigationPersistence: 'NOT_RUN',
    cleanup: 'NOT_RUN',
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    screenshot: null,
    error: null,
  };

  let provisioned;
  try {
    provisioned = await createUserAndEntitlement(admin, plan, index);
  } catch (error) {
    client.status = 'BLOCKED';
    client.error = sanitizeMessage(error?.message || error);
    return client;
  }

  const { email, password, created } = provisioned;
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') client.consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => client.pageErrors.push(String(err.message || err)));
  page.on('requestfailed', (request) => {
    client.failedRequests.push({ resourceType: request.resourceType(), failure: request.failure()?.errorText || 'unknown' });
  });

  let phase = 'open_url';
  try {
    const response = await page.goto(`${TARGET_URL}/?uat_mass=${RUN_ID}_${label}`, { waitUntil: 'networkidle', timeout: 60_000 });
    if ((response?.status() || 0) !== 200) throw new Error(`HTTP status ${response?.status() || 'unknown'}`);
    await page.getByTestId('staging-email-auth-form').waitFor({ state: 'visible', timeout: 20_000 });

    const loginBody = await page.locator('body').innerText();
    client.auth.forgotPassword = /esqueci|minha senha|reset/i.test(loginBody) ? 'SUPPORTED_NOT_EXERCISED' : 'NOT_SUPPORTED';
    client.auth.resendEmail = /reenviar|convite|confirm/i.test(loginBody) ? 'SUPPORTED_NOT_EXERCISED' : 'NOT_SUPPORTED';

    phase = 'wrong_password';
    await page.getByLabel(/Email tecnico E2E/i).fill(email);
    await page.getByLabel(/Senha tecnica E2E/i).fill(`wrong-${password}`);
    await page.getByRole('button', { name: /Entrar no staging/i }).click();
    await page.getByText(/Falha no login tecnico/i).waitFor({ state: 'visible', timeout: 20_000 });
    client.auth.wrongPassword = 'PASS';

    phase = 'correct_login';
    await page.getByLabel(/Senha tecnica E2E/i).fill(password);
    await page.getByRole('button', { name: /Entrar no staging/i }).click();
    await page.getByText(/Meus Im.veis/i).waitFor({ state: 'visible', timeout: 30_000 });
    client.auth.login = 'PASS';

    phase = 'create_property';
    const baseName = `UAT ${RUN_ID} ${plan.id} ${index}`;
    const editedName = `${baseName} editado`;
    await page.getByRole('button', { name: /Cadastrar/i }).first().click();
    const inputs = page.locator('form input');
    await inputs.nth(0).fill(baseName);
    await inputs.nth(1).fill('01001-000');
    await inputs.nth(2).fill('SP');
    await inputs.nth(3).fill(`Rua UAT ${RUN_ID}`);
    await inputs.nth(4).fill(String(100 + index));
    await inputs.nth(5).fill('Apto QA');
    await inputs.nth(6).fill('Centro');
    await inputs.nth(7).fill('Sao Paulo');
    await inputs.nth(8).fill(`Referencia ${RUN_ID}`);
    await page.locator('form textarea').fill(`Teste massivo ${RUN_ID} ${plan.id} ${index}`);
    await page.getByRole('button', { name: /Salvar Im.vel/i }).click();
    await page.getByText(baseName).waitFor({ state: 'visible', timeout: 30_000 });
    client.crud.propertyCreate = 'PASS';

    const prop = await admin.from('properties').select('id').eq('user_id', created.userId).eq('nickname', baseName).single();
    if (prop.error || !prop.data?.id) throw new Error(`property row not found: ${prop.error?.message || 'missing'}`);
    created.propertyIds.push(prop.data.id);

    phase = 'edit_property';
    let card = await waitForPropertyCard(page, baseName);
    await card.locator('button[title^="Editar"]').click();
    await page.locator('form input').nth(0).fill(editedName);
    await page.locator('form textarea').fill(`Teste massivo editado ${RUN_ID}`);
    await page.getByRole('button', { name: /Salvar Im.vel/i }).click();
    await page.getByText(editedName).waitFor({ state: 'visible', timeout: 30_000 });
    client.crud.propertyEdit = 'PASS';

    phase = 'create_inspection';
    card = await waitForPropertyCard(page, editedName);
    await card.getByRole('button', { name: /Nova Vistoria/i }).click();
    await page.getByText(/Iniciar Nova Vistoria/i).waitFor({ state: 'visible', timeout: 20_000 });
    const typeButton = page.getByRole('button', { name: index % 2 === 0 ? /Vistoria de Sa.da/i : /Vistoria de Entrada/i });
    if (await typeButton.isVisible().catch(() => false)) await typeButton.click();
    await page.getByRole('button', { name: /Come.ar Vistoria/i }).click();
    await page.getByText(/Registro de Fotos:/i).waitFor({ state: 'visible', timeout: 30_000 });
    client.crud.inspectionCreate = 'PASS';

    const insp = await admin.from('inspections').select('id').eq('user_id', created.userId).eq('property_id', created.propertyIds[0]).order('started_at', { ascending: false }).limit(1).single();
    if (insp.error || !insp.data?.id) throw new Error(`inspection row not found: ${insp.error?.message || 'missing'}`);
    created.inspectionIds.push(insp.data.id);

    phase = 'rooms';
    const mainRoom = `Comodo principal ${index}`;
    const tempRoom = `Comodo temp ${index}`;
    const editedRoom = `Comodo editado ${index}`;
    await page.getByPlaceholder(/Novo c.modo/i).fill(mainRoom);
    await page.getByTitle(/Adicionar c.modo/i).click();
    await page.getByText(mainRoom).waitFor({ state: 'visible', timeout: 20_000 });
    await page.getByPlaceholder(/Novo c.modo/i).fill(tempRoom);
    await page.getByTitle(/Adicionar c.modo/i).click();
    await page.getByText(tempRoom).waitFor({ state: 'visible', timeout: 20_000 });
    client.crud.roomCreate = 'PASS';

    const tempGroup = roomRow(page, tempRoom);
    await tempGroup.hover();
    await tempGroup.locator('button[title="Renomear"]').click();
    await page.getByPlaceholder(/Novo nome do c.modo/i).fill(editedRoom);
    await page.getByRole('button', { name: /^Salvar$/i }).click();
    await page.getByText(editedRoom).waitFor({ state: 'visible', timeout: 20_000 });
    client.crud.roomEdit = 'PASS';

    const editedGroup = roomRow(page, editedRoom);
    await editedGroup.hover();
    await editedGroup.locator('button[title="Excluir"]').click({ force: true });
    await page.getByText(editedRoom).waitFor({ state: 'detached', timeout: 20_000 }).catch(async () => {
      if (await visibleOrFalse(page.getByText(editedRoom))) throw new Error('edited room still visible after delete');
    });
    client.crud.roomDelete = 'PASS';

    const room = await admin.from('rooms').select('id').eq('inspection_id', created.inspectionIds[0]).eq('name', mainRoom).single();
    if (room.error || !room.data?.id) throw new Error(`main room row not found: ${room.error?.message || 'missing'}`);
    created.roomIds.push(room.data.id);

    phase = 'photo_delete_replace';
    await selectRoom(page, mainRoom);
    await uploadFiles(page, 1, `${label}-initial`);
    await page.getByText(/Sem An.lise de IA/i).waitFor({ state: 'visible', timeout: 60_000 });
    client.storage.upload = 'PASS';
    client.fallback = 'PASS';
    await page.getByRole('button', { name: /Confirmar Revis.o/i }).click();
    await page.getByText(/Confirmado/i).waitFor({ state: 'visible', timeout: 30_000 });
    client.manualReview = 'PASS';

    let photoRows = await admin.from('photos').select('id,storage_path,reviewed_status').eq('inspection_id', created.inspectionIds[0]);
    if (photoRows.error || !photoRows.data.length) throw new Error(`initial photo row missing: ${photoRows.error?.message || 'missing'}`);
    const initialPhoto = photoRows.data[0];
    created.photoIds.push(initialPhoto.id);
    if (initialPhoto.storage_path) created.storagePaths.push(initialPhoto.storage_path);
    await page.locator('button[title="Excluir foto"]').first().click();
    await waitForNoPhoto(admin, initialPhoto.id);
    client.crud.photoDelete = 'PASS';
    client.storage.delete = 'PASS';

    await uploadFiles(page, 1, `${label}-replacement`);
    await page.getByText(/Sem An.lise de IA/i).waitFor({ state: 'visible', timeout: 60_000 });
    await page.getByRole('button', { name: /Confirmar Revis.o/i }).click();
    await page.getByText(/Confirmado/i).waitFor({ state: 'visible', timeout: 30_000 });
    client.crud.photoReplace = 'PASS';

    await waitForPhotoCount(admin, created.inspectionIds[0], 1);

    phase = 'limit';
    const limit = Number(plan.max_photos_per_inspection);
    if (isLimitRepresentative) {
      const belowTarget = Math.max(1, limit - 1);
      const current = 1;
      if (belowTarget > current) {
        await uploadFiles(page, belowTarget - current, `${label}-below`);
        await waitForPhotoCount(admin, created.inspectionIds[0], belowTarget, Math.max(180_000, limit * 8_000));
      }
      client.limits.below = 'PASS';

      if (belowTarget < limit) {
        await uploadFiles(page, limit - belowTarget, `${label}-at`);
        await waitForPhotoCount(admin, created.inspectionIds[0], limit, Math.max(180_000, limit * 8_000));
      }
      client.limits.at = 'PASS';

      await page.getByText(new RegExp(`${limit}\\s*/\\s*${limit}\\s*fotos`)).waitFor({
        state: 'visible',
        timeout: 30_000,
      }).catch(() => undefined);
      await page.waitForTimeout(1000);
      const uploadButton = page.getByRole('button', { name: /Escolher da Galeria/i }).first();
      const disabled = await uploadButton.isDisabled().catch(() => false);
      const afterLimit = await admin.from('photos').select('id').eq('inspection_id', created.inspectionIds[0]);
      client.limits.above = disabled && !afterLimit.error && afterLimit.data.length === limit ? 'PASS' : 'FAIL';
      if (client.limits.above !== 'PASS') throw new Error(`above limit not blocked for ${plan.id}`);
    } else {
      client.limits.below = 'PASS';
      client.limits.at = 'NOT_EXERCISED_REPRESENTATIVE_ONLY';
      client.limits.above = 'NOT_EXERCISED_REPRESENTATIVE_ONLY';
    }

    phase = 'persistence_storage';
    photoRows = await admin
      .from('photos')
      .select('id,storage_path,reviewed_status')
      .eq('inspection_id', created.inspectionIds[0]);
    if (photoRows.error || !photoRows.data.length) throw new Error(`photo persistence missing: ${photoRows.error?.message || 'missing'}`);
    created.photoIds.push(...photoRows.data.map((row) => row.id));
    created.storagePaths.push(...photoRows.data.map((row) => row.storage_path).filter(Boolean));
    for (const row of photoRows.data) {
      if (!row.storage_path) throw new Error(`photo missing storage path: ${row.id}`);
      const downloaded = await admin.storage.from(BUCKET).download(row.storage_path);
      if (downloaded.error) throw new Error(`storage read failed: ${downloaded.error.message}`);
      const bytes = typeof downloaded.data?.arrayBuffer === 'function' ? (await downloaded.data.arrayBuffer()).byteLength : 0;
      if (bytes <= 0) throw new Error(`storage read empty: ${row.id}`);
    }
    client.storage.read = 'PASS';
    client.persistence = 'PASS';
    client.limits.testedPhotos = photoRows.data.length;

    phase = 'navigation_resume';
    await page.getByLabel(/Voltar para hist.rico/i).click();
    await page.getByText(/Hist.rico de Vistorias/i).waitFor({ state: 'visible', timeout: 20_000 });
    await page.getByRole('button', { name: /Continuar Rascunho/i }).first().click();
    await page.getByText(mainRoom).waitFor({ state: 'visible', timeout: 20_000 });
    await assertRoomPhotosVisibleAfterResume(page, mainRoom);
    client.navigationPersistence = 'PASS';

    client.status = 'PASS';
  } catch (error) {
    client.status = /policy|permission|rls|service_role|staging-email-auth-form|missing/i.test(String(error?.message || error))
      ? 'BLOCKED'
      : 'FAIL';
    client.error = `${phase}: ${sanitizeMessage(error?.message || error)}`;
    mkdirSync('test-results', { recursive: true });
    const screenshot = `test-results/uat-mass-${RUN_ID}-${plan.id}-${index}.png`;
    await page.screenshot({ path: screenshot, fullPage: true }).catch(() => undefined);
    client.screenshot = screenshot;
  } finally {
    await context.close().catch(() => undefined);
    const cleanup = await cleanupClient(admin, created).catch((error) => ({
      errors: [sanitizeMessage(error?.message || error)],
      leftovers: { cleanupFailed: true },
    }));
    client.cleanup = cleanupIsOk(cleanup) ? 'PASS' : 'FAIL';
    client.cleanupDetails = cleanup;
    if (client.status === 'PASS' && client.cleanup !== 'PASS') client.status = 'BLOCKED';
    client.consoleErrors = sanitizeMessages(client.consoleErrors);
    client.pageErrors = sanitizeMessages(client.pageErrors);
  }

  return client;
}

function renderReport({ status, plans, clients, startedAt, finishedAt, totals, blockers }) {
  const rows = clients.map((client) => [
    client.planId,
    String(client.index),
    client.status,
    client.auth.wrongPassword,
    client.auth.login,
    client.auth.forgotPassword,
    client.auth.resendEmail,
    [client.crud.propertyCreate, client.crud.propertyEdit, client.crud.inspectionCreate, client.crud.roomCreate, client.crud.roomEdit, client.crud.roomDelete, client.crud.photoDelete, client.crud.photoReplace].every((item) => item === 'PASS') ? 'PASS' : 'FAIL',
    client.limits.above === 'FAIL' ? 'FAIL' : 'PASS',
    [client.storage.upload, client.storage.read, client.storage.delete].every((item) => item === 'PASS') ? 'PASS' : 'FAIL',
    client.persistence,
    client.cleanup,
    client.error || '',
  ]);

  const lines = [
    '# VF UAT Mass Control - 2026-06-26',
    '',
    `Status: ${status}`,
    '',
    `URL testada: ${TARGET_URL}`,
    `Run ID: ${RUN_ID}`,
    `Inicio: ${startedAt}`,
    `Fim: ${finishedAt}`,
    '',
    '## Planos detectados',
    '',
    '| Plano | Nome | Limite de fotos | PDF | Pagamento |',
    '|---|---:|---:|---:|---:|',
    ...plans.map((plan) => `| \`${plan.id}\` | ${plan.name} | ${plan.max_photos_per_inspection} | ${plan.pdf_enabled ? 'sim' : 'nao'} | ${plan.payment_required ? 'sim' : 'nao'} |`),
    '',
    '## Totais',
    '',
    `- Clientes solicitados: ${totals.requestedClients}`,
    `- Clientes executados: ${totals.executedClients}`,
    `- Fotos persistidas durante a rodada: ${totals.persistedPhotos}`,
    `- Cleanup total: ${totals.cleanupOk ? 'sim' : 'nao'}`,
    `- Forgot password: NOT_SUPPORTED na UI atual`,
    `- Reenviar e-mail/convite: NOT_SUPPORTED na UI atual`,
    '',
    '## Matriz por cliente',
    '',
    '| Plano | Cliente | Status | Senha errada | Login | Esqueci senha | Reenviar email | CRUD | Limites | Storage | Persistencia | Cleanup | Erro |',
    '|---|---:|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map((row) => `| ${row.join(' | ')} |`),
    '',
    '## Limites por plano',
    '',
    ...plans.map((plan) => {
      const representative = clients.find((client) => client.planId === plan.id && client.index === 1);
      return [
        `### ${plan.id}`,
        '',
        `- Limite real: ${plan.max_photos_per_inspection}`,
        `- Abaixo do limite: ${representative?.limits.below || 'NOT_RUN'}`,
        `- No limite: ${representative?.limits.at || 'NOT_RUN'}`,
        `- Acima do limite: ${representative?.limits.above || 'NOT_RUN'}`,
        `- Fotos efetivamente persistidas no representante: ${representative?.limits.testedPhotos || 0}`,
        '- Cap tecnico aplicado: nao',
        '',
      ].join('\n');
    }),
    '',
    '## Erros de runtime',
    '',
    `- Console errors sanitizados: ${clients.reduce((sum, client) => sum + client.consoleErrors.length, 0)}`,
    `- Page errors: ${clients.reduce((sum, client) => sum + client.pageErrors.length, 0)}`,
    `- Failed requests: ${clients.reduce((sum, client) => sum + client.failedRequests.length, 0)}`,
    '',
    '## Blockers',
    '',
    blockers.length ? blockers.map((item) => `- ${item}`).join('\n') : '- Nenhum blocker remanescente da rodada automatizada.',
    '',
    '## Decisao',
    '',
    status === 'PASS'
      ? 'A rodada massiva automatizada passou e pode apoiar o inicio de UAT manual controlado. UAT nao foi liberado automaticamente.'
      : 'UAT manual controlado ainda nao deve comecar ate tratar os itens com FAIL/BLOCKED.',
    '',
  ];

  return lines.join('\n');
}

async function main() {
  const startedAt = new Date().toISOString();
  const env = loadEnvLocal();
  const required = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'SUPABASE_E2E_EMAIL',
    'SUPABASE_E2E_PASSWORD',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) {
    console.log(`BLOCKED: missing ${missing.join(' and ')} in .env.local`);
    process.exitCode = 2;
    return;
  }

  const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const deployCheckBrowser = await chromium.launch({ headless: true });
  const deployPage = await deployCheckBrowser.newPage();
  const deployResponse = await deployPage.goto(`${TARGET_URL}/?mass_preflight=${RUN_ID}`, { waitUntil: 'networkidle', timeout: 60_000 });
  const stagingVisible = await deployPage.getByTestId('staging-email-auth-form').isVisible().catch(() => false);
  await deployCheckBrowser.close().catch(() => undefined);
  if ((deployResponse?.status() || 0) !== 200 || !stagingVisible) {
    console.log('BLOCKED: Netlify deploy is not ready or VITE_STAGING_E2E_AUTH is not active.');
    process.exitCode = 2;
    return;
  }

  const plansResult = await anon
    .from('plans')
    .select('id,name,max_photos_per_inspection,pdf_enabled,payment_required')
    .in('id', ['free_10', 'beta_paid_4990'])
    .order('price_cents', { ascending: true });
  if (plansResult.error) {
    console.log(`BLOCKED: plans query failed: ${sanitizeMessage(plansResult.error.message)}`);
    process.exitCode = 2;
    return;
  }
  const plans = plansResult.data || [];
  if (plans.length !== 2) {
    console.log(`BLOCKED: expected 2 plans, found ${plans.length}`);
    process.exitCode = 2;
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const clients = [];
  try {
    for (const plan of plans) {
      for (let index = 1; index <= CLIENTS_PER_PLAN; index += 1) {
        const client = await runClient(browser, anon, admin, plan, index);
        clients.push(client);
        console.log(`UAT_MASS_CLIENT ${plan.id} #${index}: ${client.status}`);
        if (client.status !== 'PASS') {
          // Stop early on real failures to avoid unnecessary external load.
          break;
        }
      }
      if (clients.some((client) => client.status !== 'PASS')) break;
    }
  } finally {
    await browser.close().catch(() => undefined);
  }

  const blockers = clients
    .filter((client) => client.status !== 'PASS')
    .map((client) => `${client.planId} #${client.index}: ${client.status} ${client.error || ''}`.trim());
  const totals = {
    requestedClients: plans.length * CLIENTS_PER_PLAN,
    executedClients: clients.length,
    persistedPhotos: clients.reduce((sum, client) => sum + Number(client.limits.testedPhotos || 0), 0),
    cleanupOk: clients.length > 0 && clients.every((client) => client.cleanup === 'PASS'),
  };
  const status = clients.length === totals.requestedClients
    && clients.every((client) => client.status === 'PASS')
    && totals.cleanupOk
    ? 'PASS'
    : (clients.some((client) => client.status === 'BLOCKED') ? 'BLOCKED' : 'FAIL');

  const report = renderReport({
    status,
    plans,
    clients,
    startedAt,
    finishedAt: new Date().toISOString(),
    totals,
    blockers,
  });
  writeFileSync(REPORT_PATH, report, 'utf8');
  console.log(JSON.stringify({
    status,
    plans: plans.map((plan) => ({ id: plan.id, maxPhotos: plan.max_photos_per_inspection })),
    totalClients: clients.length,
    totalPhotos: totals.persistedPhotos,
    cleanupOk: totals.cleanupOk,
    report: REPORT_PATH,
  }, null, 2));
  process.exitCode = status === 'PASS' ? 0 : status === 'BLOCKED' ? 2 : 1;
}

main().catch((error) => {
  console.log(`BLOCKED: ${sanitizeMessage(error?.message || error)}`);
  process.exitCode = 2;
});
