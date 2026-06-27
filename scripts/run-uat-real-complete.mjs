import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const MODE_ARG = process.argv.find((arg) => arg.startsWith('--mode='))?.slice('--mode='.length);
const MODE = MODE_ARG || 'legacy-real-complete';
const TARGET_URL = process.env.UAT_REAL_COMPLETE_BASE_URL || process.env.UAT_REAL_BASE_URL || 'https://glittery-boba-2b3367.netlify.app';
const PHOTO_ROOT = process.env.UAT_REAL_COMPLETE_PHOTO_ROOT || 'E:\\AI - Aprendizado\\VistoriaFacilIA\\Fotos para Testes';
const REPORT_BASENAME = MODE === 'core-discovery'
  ? 'vf_uat_core_discovery_20260627'
  : MODE === 'core-certification'
    ? 'vf_uat_core_certification_20260627'
    : 'vf_uat_real_complete_20260627';
const REPORT_PATH = `qa/${REPORT_BASENAME}.md`;
const REPORT_JSON_PATH = `qa/${REPORT_BASENAME}.json`;
const EVIDENCE_DIR = 'test-results/uat-governance';
const BUCKET = 'inspection-photos';
const RUN_ID = `real_complete_${Date.now()}`;
const TEST_EMAIL = `e2e-real-complete-${RUN_ID}@vistoriafacilia.com`;
const TEST_PASSWORD = `RealComplete-${RUN_ID}!`;
const VALID_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MAX_IA_PHOTOS = 50;
const MAX_PHOTOS_PER_ROOM = 5;
const COST_BASE_PER_PHOTO_BRL = 0.15;
const COST_STRESS_PER_PHOTO_BRL = 0.25;
const ENABLE_IA_PHASE = process.env.UAT_REAL_COMPLETE_ENABLE_AI === 'true';
const DISCOVERY_ONLY = MODE === 'core-discovery'
  || (MODE === 'legacy-real-complete' && process.env.UAT_REAL_COMPLETE_DISCOVERY_ONLY !== 'false');
const CORE_ONLY = MODE === 'core-discovery' || MODE === 'core-certification';

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
  const text = String(value || '').replace(/\u001b\[[0-9;]*m/g, '');
  if (/token|key|password|service_role|authorization|secret/i.test(text)) return '[redacted sensitive message]';
  return text.replace(/\s+/g, ' ').slice(0, 700);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function addCase(result, phase, caso, acao, esperado, status, evidencia, resultado = '') {
  result.matrix.push({ phase, caso, acao, esperado, resultado, status, evidencia });
}

function addGap(result, message) {
  if (!result.gaps.includes(message)) result.gaps.push(message);
}

function setCase(result, caso, patch) {
  const row = result.matrix.find((item) => item.caso === caso);
  if (row) Object.assign(row, patch);
}

function inventoryPhotos() {
  if (!existsSync(PHOTO_ROOT)) {
    throw new Error(`photo root missing: ${PHOTO_ROOT}`);
  }
  const all = [];
  const scan = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) scan(full);
      else if (entry.isFile()) all.push(full);
    }
  };
  scan(PHOTO_ROOT);

  const valid = all.filter((file) => VALID_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const invalid = all.filter((file) => !VALID_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const groups = new Map();
  const rootName = path.basename(PHOTO_ROOT);

  for (const file of valid) {
    const relDir = path.relative(PHOTO_ROOT, path.dirname(file));
    const parts = relDir.split(/[\\/]+/).filter(Boolean);
    let room = parts.join(' / ') || rootName || 'Raiz';
    if (parts.length > 1) room = parts.slice(1).join(' / ');
    if (!groups.has(room)) groups.set(room, []);
    groups.get(room).push(file);
  }

  const rooms = [...groups.entries()]
    .map(([name, files]) => ({
      name,
      files: files.sort((a, b) => a.localeCompare(b)),
      count: files.length,
      totalMb: Number((files.reduce((sum, file) => sum + statSync(file).size, 0) / 1024 / 1024).toFixed(2)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const sample = [];
  for (const room of rooms) {
    const remaining = Math.max(0, MAX_IA_PHOTOS - sample.length);
    const selected = room.files.slice(0, Math.min(MAX_PHOTOS_PER_ROOM, remaining));
    room.sampleFiles = selected;
    sample.push(...selected.map((file) => ({ room: room.name, file })));
  }

  return {
    photoRoot: PHOTO_ROOT,
    totalRooms: rooms.length,
    totalValidPhotos: valid.length,
    invalidFiles: invalid.length,
    invalidExtensions: Object.entries(invalid.reduce((acc, file) => {
      const ext = path.extname(file).toLowerCase() || '[none]';
      acc[ext] = (acc[ext] || 0) + 1;
      return acc;
    }, {})).map(([extension, count]) => ({ extension, count })),
    rooms,
    sample,
    samplePhotoCount: sample.length,
    fullCostBase: Number((valid.length * COST_BASE_PER_PHOTO_BRL).toFixed(2)),
    fullCostStress: Number((valid.length * COST_STRESS_PER_PHOTO_BRL).toFixed(2)),
    sampleCostBase: Number((sample.length * COST_BASE_PER_PHOTO_BRL).toFixed(2)),
    sampleCostStress: Number((sample.length * COST_STRESS_PER_PHOTO_BRL).toFixed(2)),
  };
}

async function visibleOrFalse(locator) {
  return locator.isVisible().catch(() => false);
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

async function hoverRoomAction(page, row) {
  const box = await row.boundingBox();
  if (!box) throw new Error('room row bounding box unavailable');
  await page.mouse.move(box.x + Math.max(1, box.width - 8), box.y + box.height / 2);
  await page.waitForTimeout(250);
}

async function login(page, email, password) {
  await page.getByRole('button', { name: /^Entrar$/i }).first().click().catch(() => undefined);
  await page.getByLabel(/^E-mail$/i).fill(email);
  await page.getByLabel(/^Senha$/i).fill(password);
  await page.getByRole('button', { name: /^Entrar$/i }).last().click();
  await page.getByText(/Meus Im.veis/i).waitFor({ state: 'visible', timeout: 45_000 });
}

async function logout(page) {
  await page.getByTitle(/Sair do aplicativo/i).click();
  await page.getByTestId('public-email-auth-form').waitFor({ state: 'visible', timeout: 30_000 });
}

async function createProperty(page, name, note) {
  await page.getByRole('button', { name: /Cadastrar/i }).first().click();
  const inputs = page.locator('form input');
  await inputs.nth(0).fill(name);
  await inputs.nth(1).fill('01001-000');
  await inputs.nth(2).fill('SP');
  await inputs.nth(3).fill(`Rua UAT Real ${RUN_ID}`);
  await inputs.nth(4).fill('101');
  await inputs.nth(5).fill('Apto UAT Real');
  await inputs.nth(6).fill('Centro');
  await inputs.nth(7).fill('Sao Paulo');
  await inputs.nth(8).fill(`Referencia ${RUN_ID}`);
  await page.locator('form textarea').fill(note);
  await page.getByRole('button', { name: /Salvar Im.vel/i }).click();
  await page.locator('[data-testid^="property-card-"]').filter({ hasText: name }).first().waitFor({ state: 'visible', timeout: 45_000 });
}

async function openHistory(page, propertyName) {
  await page.getByText(/Meus Im.veis/i).waitFor({ state: 'visible', timeout: 45_000 });
  await page.locator('[data-testid^="property-card-"]').filter({ hasText: propertyName }).getByRole('button', { name: /Hist.rico/i }).click();
  await page.getByText(/Hist.rico de Vistorias/i).waitFor({ state: 'visible', timeout: 45_000 });
}

async function startInspectionFromHistory(page) {
  await page.getByRole('button', { name: /Criar Primeira Vistoria|Nova Vistoria/i }).first().click();
  await page.getByText(/Iniciar Nova Vistoria/i).waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByRole('button', { name: /Vistoria de Entrada/i }).click();
  await page.getByRole('button', { name: /Come.ar Vistoria/i }).click();
  await page.getByText(/Registro de Fotos:/i).waitFor({ state: 'visible', timeout: 45_000 });
}

async function inspectionEvidence(page) {
  const photoRegistry = await visibleOrFalse(page.getByText(/Registro de Fotos:/i));
  const fileInputCount = await page.locator('input[type="file"]').count().catch(() => 0);
  const addRoomVisible = await visibleOrFalse(page.getByPlaceholder(/Novo c.modo/i));
  const roomRows = await page.locator('div.group.flex.items-center.justify-between.gap-1').count().catch(() => 0);
  const backToHistory = await visibleOrFalse(page.getByLabel(/Voltar para hist.rico/i));
  const reviewButton = await visibleOrFalse(page.getByRole('button', { name: /Concluir.*Revisar/i }).first());
  const operational = photoRegistry || ((fileInputCount > 0 || addRoomVisible || reviewButton) && (roomRows > 0 || backToHistory));
  return { operational, photoRegistry, fileInputCount, addRoomVisible, roomRows, backToHistory, reviewButton, url: page.url() };
}

async function waitForInspectionEvidence(page, timeoutMs = 15_000) {
  const started = Date.now();
  let latest = await inspectionEvidence(page);
  while (Date.now() - started < timeoutMs) {
    latest = await inspectionEvidence(page);
    if (latest.operational) return latest;
    await page.waitForTimeout(500);
  }
  return latest;
}

async function captureEvidence(page, name) {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const file = path.join(EVIDENCE_DIR, `${RUN_ID}_${name}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => undefined);
  return file;
}

async function latestInspectionForProperty(admin, userId, propertyId) {
  const res = await admin
    .from('inspections')
    .select('id,property_id,status,started_at')
    .eq('user_id', userId)
    .eq('property_id', propertyId)
    .order('started_at', { ascending: false })
    .limit(5);
  if (res.error) throw new Error(`inspection query failed: ${res.error.message}`);
  return res.data || [];
}

async function returnToHistory(page, propertyName) {
  if (await visibleOrFalse(page.getByLabel(/Voltar para hist.rico/i))) {
    await page.getByLabel(/Voltar para hist.rico/i).click();
    await page.getByText(/Hist.rico de Vistorias/i).waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
  }
  if (!(await visibleOrFalse(page.getByText(/Hist.rico de Vistorias/i)))) {
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.getByRole('button', { name: /Vistoria F.cil IA/i }).first().click().catch(() => undefined);
    await page.getByText(/Meus Im.veis/i).waitFor({ state: 'visible', timeout: 30_000 }).catch(() => undefined);
    await openHistory(page, propertyName);
  }
}

async function openDraftFromHistoryRobust(page) {
  await page.getByText(/Hist.rico de Vistorias/i).waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByRole('button', { name: /Continuar Rascunho/i }).first().click();
  return waitForInspectionEvidence(page, 20_000);
}

async function startInspectionFromHistoryRobust(page, admin, userId, property, result, label) {
  const before = await latestInspectionForProperty(admin, userId, property.id);
  await page.getByRole('button', { name: /Criar Primeira Vistoria|Nova Vistoria/i }).first().click();
  await page.getByText(/Iniciar Nova Vistoria/i).waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByRole('button', { name: /Vistoria de Entrada/i }).click();
  await page.getByRole('button', { name: /Come.ar Vistoria/i }).click();

  const primaryEvidence = await waitForInspectionEvidence(page, 20_000);
  const after = await latestInspectionForProperty(admin, userId, property.id);
  const beforeIds = new Set(before.map((inspection) => inspection.id));
  const created = after.find((inspection) => !beforeIds.has(inspection.id)) || after[0];
  if (!created?.id) {
    const screenshot = await captureEvidence(page, `${label}_inspection_create_failed`);
    throw new Error(`INSPECTION_CREATE_FAILED: no inspection row found after creation attempt; evidence=${screenshot}`);
  }
  const duplicates = after.length > before.length + 1 ? after.length - before.length : 0;

  if (primaryEvidence.operational) {
    if (!primaryEvidence.photoRegistry) {
      const screenshot = await captureEvidence(page, `${label}_functional_evidence_without_photo_registry_text`);
      addGap(result, `Gate aceitou vistoria ${label} por evidencia funcional sem texto Registro de Fotos. Screenshot: ${screenshot}`);
      return { inspectionId: created.id, openedByFallback: true, duplicates, evidence: primaryEvidence, screenshot };
    }
    return { inspectionId: created.id, openedByFallback: false, duplicates, evidence: primaryEvidence };
  }

  const screenshot = await captureEvidence(page, `${label}_primary_navigation_timeout`);
  await returnToHistory(page, property.nickname);
  const fallbackEvidence = await openDraftFromHistoryRobust(page);
  if (fallbackEvidence.operational) {
    addGap(result, `Gate precisou fallback para abrir vistoria ${label}; seletor/estado principal fragil. Screenshot: ${screenshot}`);
    return { inspectionId: created.id, openedByFallback: true, duplicates, evidence: fallbackEvidence, screenshot };
  }

  const fallbackScreenshot = await captureEvidence(page, `${label}_created_not_opened`);
  throw new Error(`INSPECTION_CREATED_NOT_OPENED: inspectionId=${created.id}; primaryEvidence=${JSON.stringify(primaryEvidence)}; fallbackEvidence=${JSON.stringify(fallbackEvidence)}; evidence=${fallbackScreenshot}`);
}

async function openDraftFromHistory(page) {
  await page.getByText(/Hist.rico de Vistorias/i).waitFor({ state: 'visible', timeout: 45_000 });
  await page.getByRole('button', { name: /Continuar Rascunho/i }).first().click();
  const evidence = await waitForInspectionEvidence(page, 45_000);
  if (!evidence.operational) throw new Error(`INSPECTION_CREATED_NOT_OPENED: draft list click did not reach operational inspection state; evidence=${JSON.stringify(evidence)}`);
  return evidence;
}

async function selectRoom(page, roomName) {
  const row = roomRow(page, roomName);
  await row.waitFor({ state: 'visible', timeout: 45_000 });
  await row.locator('button').first().click();
  await page.getByText(new RegExp(`Registro de Fotos: ${escapeRegex(roomName)}`)).waitFor({ state: 'visible', timeout: 45_000 });
}

async function renameRoom(page, fromName, toName) {
  const row = roomRow(page, fromName);
  await row.waitFor({ state: 'visible', timeout: 30_000 });
  await row.hover();
  await hoverRoomAction(page, row);
  await row.locator('button[title="Renomear"]').click();
  await page.getByPlaceholder(/Novo nome do c.modo/i).fill(toName);
  await page.getByRole('button', { name: /^Salvar$/i }).click();
  await roomRow(page, toName).waitFor({ state: 'visible', timeout: 30_000 });
}

async function addRoom(page, name) {
  await page.getByPlaceholder(/Novo c.modo/i).fill(name);
  await page.getByTitle(/Adicionar c.modo/i).click();
  await roomRow(page, name).waitFor({ state: 'visible', timeout: 30_000 });
}

async function deleteRoomByName(page, name) {
  const row = roomRow(page, name);
  await row.waitFor({ state: 'visible', timeout: 30_000 });
  await row.hover();
  await hoverRoomAction(page, row);
  await row.locator('button[title="Excluir"]').click();
  await page.waitForTimeout(1000);
  if (await visibleOrFalse(roomRow(page, name))) throw new Error(`room not deleted: ${name}`);
}

async function waitForRoomAi(page, expectedCount, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const cards = await page.locator('[data-testid^="photo-card-"]').count();
    const completed = await page.locator('[data-testid^="photo-ai-completed-"]').count();
    const fallback = await page.locator('[data-testid^="photo-ai-fallback-"]').count();
    if (fallback > 0) throw new Error(`AI fallback appeared in room upload: fallback=${fallback}`);
    if (cards >= expectedCount && completed >= expectedCount) return;
    await page.waitForTimeout(1500);
  }
  throw new Error(`AI completed panels did not reach ${expectedCount}`);
}

async function uploadFilesToCurrentRoom(page, files, expectedCountInRoom) {
  const input = page.locator('input[type="file"][multiple]').last();
  await input.setInputFiles(files);
  await waitForRoomAi(page, expectedCountInRoom, Math.max(180_000, files.length * 90_000));
}

async function clickFirstPhotoEdit(page, nth = 0) {
  const card = page.locator('[data-testid^="photo-card-"]').nth(nth);
  await card.waitFor({ state: 'visible', timeout: 30_000 });
  const button = card.locator('[data-testid^="photo-edit-"]').first();
  await button.scrollIntoViewIfNeeded();
  await button.click();
  const form = card.locator('[data-testid^="photo-edit-form-"]').first();
  await form.waitFor({ state: 'visible', timeout: 20_000 });
  return form;
}

async function fillPhotoEditForm(form) {
  await form.locator('[data-testid^="photo-edit-caption-"]').first().fill(`Foto editada UAT ${RUN_ID}`);
  await form.locator('[data-testid^="photo-edit-description-"]').first().fill(`Observacao editada pelo usuario durante UAT completo ${RUN_ID}.`);
  await form.locator('[data-testid^="photo-edit-condition-"]').first().selectOption({ index: 1 });
  await form.locator('[data-testid^="photo-edit-save-"]').first().click();
}

async function createUserAndEntitlement(admin) {
  const user = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { testRunId: RUN_ID, purpose: 'uat_real_complete' },
  });
  if (user.error || !user.data.user) throw new Error(`admin create user failed: ${user.error?.message || 'no user'}`);

  const plans = await admin
    .from('plans')
    .select('id,name,max_photos_per_inspection,pdf_enabled,payment_required')
    .in('id', ['free_10', 'beta_paid_4990']);
  if (plans.error) throw new Error(`plans query failed: ${plans.error.message}`);
  const paidPlan = plans.data.find((plan) => plan.id === 'beta_paid_4990');
  if (!paidPlan) throw new Error('beta_paid_4990 plan not available');

  const entitlement = await admin.from('entitlements').insert({
    id: `${user.data.user.id}_beta_paid_4990_${RUN_ID}`,
    user_id: user.data.user.id,
    plan_id: paidPlan.id,
    status: 'active',
    source: 'manual_admin',
    max_photos_per_inspection: paidPlan.max_photos_per_inspection,
    pdf_enabled: paidPlan.pdf_enabled,
  }).select('id').single();
  if (entitlement.error) throw new Error(`admin entitlement insert failed: ${entitlement.error.message}`);

  return {
    userId: user.data.user.id,
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    plan: paidPlan,
    plans: plans.data,
  };
}

async function pathExists(admin, storagePath) {
  const parts = storagePath.split('/');
  const fileName = parts.pop();
  const folder = parts.join('/');
  const listed = await admin.storage.from(BUCKET).list(folder, { limit: 1000 });
  if (listed.error) throw new Error(`storage list failed: ${listed.error.message}`);
  return listed.data.some((entry) => entry.name === fileName);
}

async function collectCreated(admin, userId) {
  const created = { propertyIds: [], inspectionIds: [], photoIds: [], storagePaths: [], entitlementIds: [] };
  const entitlements = await admin.from('entitlements').select('id').eq('user_id', userId);
  if (!entitlements.error) created.entitlementIds.push(...entitlements.data.map((row) => row.id));
  const properties = await admin.from('properties').select('id').eq('user_id', userId);
  if (!properties.error) created.propertyIds.push(...properties.data.map((row) => row.id));
  const inspections = await admin.from('inspections').select('id').eq('user_id', userId);
  if (!inspections.error) created.inspectionIds.push(...inspections.data.map((row) => row.id));
  const photos = await admin.from('photos').select('id,storage_path').eq('user_id', userId);
  if (!photos.error) {
    created.photoIds.push(...photos.data.map((row) => row.id));
    created.storagePaths.push(...photos.data.map((row) => row.storage_path).filter(Boolean));
  }
  const reports = await admin.from('reports').select('storage_path').eq('user_id', userId);
  if (!reports.error) created.storagePaths.push(...reports.data.map((row) => row.storage_path).filter(Boolean));
  return created;
}

async function verifyNoLeftovers(admin, userId, storagePaths) {
  const leftovers = {};
  for (const table of ['properties', 'inspections', 'rooms', 'photos', 'reports', 'entitlements', 'events']) {
    const res = await admin.from(table).select('id', { count: 'exact', head: true }).eq('user_id', userId);
    leftovers[`${table}Rows`] = res.error ? `check_error: ${res.error.message}` : (res.count || 0);
  }
  const profile = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('id', userId);
  leftovers.profileRows = profile.error ? `check_error: ${profile.error.message}` : (profile.count || 0);
  const authUser = await admin.auth.admin.getUserById(userId);
  leftovers.authUserExists = authUser.data?.user ? true : false;
  for (const storagePath of [...new Set(storagePaths.filter(Boolean))]) {
    leftovers[`storage:${storagePath}`] = await pathExists(admin, storagePath).catch((error) => `list_error: ${sanitizeMessage(error.message)}`);
  }
  return leftovers;
}

async function cleanup(admin, userId) {
  const created = await collectCreated(admin, userId);
  const storagePaths = [...new Set(created.storagePaths.filter(Boolean))];
  const result = { ok: false, errors: [], leftovers: {}, storagePaths };
  if (storagePaths.length) {
    const res = await admin.storage.from(BUCKET).remove(storagePaths);
    if (res.error) result.errors.push(`storage remove: ${res.error.message}`);
  }
  if (created.photoIds.length) {
    const res = await admin.from('photos').delete().in('id', created.photoIds);
    if (res.error) result.errors.push(`photos delete: ${res.error.message}`);
  }
  if (created.inspectionIds.length) {
    let res = await admin.from('rooms').delete().in('inspection_id', created.inspectionIds);
    if (res.error) result.errors.push(`rooms delete: ${res.error.message}`);
    res = await admin.from('reports').delete().in('inspection_id', created.inspectionIds);
    if (res.error) result.errors.push(`reports delete: ${res.error.message}`);
    res = await admin.from('inspections').delete().in('id', created.inspectionIds);
    if (res.error) result.errors.push(`inspections delete: ${res.error.message}`);
  }
  if (created.propertyIds.length) {
    const res = await admin.from('properties').delete().in('id', created.propertyIds);
    if (res.error) result.errors.push(`properties delete: ${res.error.message}`);
  }
  if (created.entitlementIds.length) {
    const res = await admin.from('entitlements').delete().in('id', created.entitlementIds);
    if (res.error) result.errors.push(`entitlements delete: ${res.error.message}`);
  }
  let res = await admin.from('events').delete().eq('user_id', userId);
  if (res.error) result.errors.push(`events delete: ${res.error.message}`);
  res = await admin.from('profiles').delete().eq('id', userId);
  if (res.error) result.errors.push(`profiles delete: ${res.error.message}`);
  const auth = await admin.auth.admin.deleteUser(userId);
  if (auth.error) result.errors.push(`auth user delete: ${auth.error.message}`);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  result.leftovers = await verifyNoLeftovers(admin, userId, storagePaths);
  result.ok = result.errors.length === 0 && Object.values(result.leftovers).every((value) => value === 0 || value === false);
  return result;
}

async function queryPersisted(admin, userId, propertyName, inspectionId, expectedRooms, expectedFinalPhotoCount, deletedPath) {
  const property = await admin.from('properties').select('*').eq('user_id', userId).eq('nickname', propertyName).single();
  if (property.error || !property.data) throw new Error(`property not persisted: ${property.error?.message || 'missing'}`);
  const inspection = await admin.from('inspections').select('*').eq('id', inspectionId).single();
  if (inspection.error || !inspection.data) throw new Error(`inspection not persisted: ${inspection.error?.message || 'missing'}`);
  if (inspection.data.property_id !== property.data.id) throw new Error('inspection property link mismatch');
  const rooms = await admin.from('rooms').select('id,name').eq('inspection_id', inspectionId).order('display_order', { ascending: true });
  if (rooms.error) throw new Error(`rooms query failed: ${rooms.error.message}`);
  const roomNames = rooms.data.map((room) => room.name);
  for (const room of expectedRooms) {
    if (!roomNames.includes(room)) throw new Error(`room missing after persistence: ${room}`);
  }
  const photos = await admin.from('photos').select('*').eq('inspection_id', inspectionId).order('created_at', { ascending: true });
  if (photos.error) throw new Error(`photos query failed: ${photos.error.message}`);
  if (photos.data.length !== expectedFinalPhotoCount) throw new Error(`photo count mismatch: expected ${expectedFinalPhotoCount}, got ${photos.data.length}`);
  const aiPhotos = photos.data.filter((photo) => photo.analysis_status === 'completed' && photo.ai_analysis && !photo.fallback_applied);
  if (aiPhotos.length !== expectedFinalPhotoCount) throw new Error(`AI completed mismatch: expected ${expectedFinalPhotoCount}, got ${aiPhotos.length}`);
  const generic = aiPhotos.find((photo) => !photo.description_suggested || photo.description_suggested.length < 20 || /fallback|manual/i.test(photo.description_suggested));
  if (generic) throw new Error(`photo suggestion not useful enough: ${generic.id}`);
  for (const photo of photos.data) {
    if (!photo.storage_path || !(await pathExists(admin, photo.storage_path))) throw new Error(`storage missing for photo ${photo.id}`);
  }
  if (deletedPath && await pathExists(admin, deletedPath)) throw new Error('deleted temporary photo still exists in storage');
  const reports = await admin.from('reports').select('*').eq('inspection_id', inspectionId);
  if (reports.error) throw new Error(`reports query failed: ${reports.error.message}`);
  return { property: property.data, inspection: inspection.data, rooms: rooms.data, photos: photos.data, aiPhotos, reports: reports.data };
}

function usageTotals(photos) {
  let input = 0;
  let output = 0;
  let total = 0;
  for (const photo of photos) {
    const usage = photo.ai_analysis?.openai?.usage || {};
    input += Number(usage.input_tokens || 0);
    output += Number(usage.output_tokens || 0);
    total += Number(usage.total_tokens || 0);
  }
  return { inputTokens: input, outputTokens: output, totalTokens: total };
}

function isAiRequestUrl(url) {
  return /openai|\/api\/analy[sz]e|\/api\/photo|\/api\/vision|\/\.netlify\/functions\/.*(ai|photo|analy[sz]e)/i.test(url || '');
}

function redactUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    return parsed.toString();
  } catch {
    return sanitizeMessage(url);
  }
}

async function queryPhaseACore(admin, userId, propertyName, inspectionId, expectedRooms) {
  const property = await admin.from('properties').select('*').eq('user_id', userId).eq('nickname', propertyName).single();
  if (property.error || !property.data) throw new Error(`phase A property not persisted: ${property.error?.message || 'missing'}`);
  const inspection = await admin.from('inspections').select('*').eq('id', inspectionId).single();
  if (inspection.error || !inspection.data) throw new Error(`phase A inspection not persisted: ${inspection.error?.message || 'missing'}`);
  if (inspection.data.property_id !== property.data.id) throw new Error('phase A inspection property link mismatch');
  const rooms = await admin.from('rooms').select('id,name').eq('inspection_id', inspectionId).order('display_order', { ascending: true });
  if (rooms.error) throw new Error(`phase A rooms query failed: ${rooms.error.message}`);
  const roomNames = rooms.data.map((room) => room.name);
  for (const room of expectedRooms) {
    if (!roomNames.includes(room)) throw new Error(`phase A room missing after persistence: ${room}`);
  }
  const photos = await admin.from('photos').select('id,ai_analysis', { count: 'exact' }).eq('inspection_id', inspectionId);
  if (photos.error) throw new Error(`phase A photos query failed: ${photos.error.message}`);
  if ((photos.count || photos.data.length) > 0) throw new Error(`COST_GUARD: Phase A created ${photos.count || photos.data.length} photo row(s) before IA phase`);
  return { property: property.data, inspection: inspection.data, rooms: rooms.data, photoCount: photos.count || photos.data.length };
}

async function assertPhaseACostZero(result, runtime, admin, userId, inspectionId) {
  const photos = await admin.from('photos').select('id,ai_analysis', { count: 'exact' }).eq('inspection_id', inspectionId);
  if (photos.error) throw new Error(`phase A photo guard query failed: ${photos.error.message}`);
  const photoCount = photos.count || photos.data.length;
  if (photoCount > 0) throw new Error(`COST_GUARD: Phase A created ${photoCount} photo row(s)`);
  if (result.photosProcessed !== 0 || result.photosAnalyzedByIa !== 0 || result.usage.totalTokens !== 0) {
    throw new Error(`COST_GUARD: Phase A counters not zero: photos=${result.photosProcessed}, ai=${result.photosAnalyzedByIa}, tokens=${result.usage.totalTokens}`);
  }
  if (runtime.aiRequests.length > 0) {
    throw new Error(`COST_GUARD: Phase A attempted IA request: ${runtime.aiRequests[0].url}`);
  }
}

function classifyRuntime(runtime) {
  const expectedConsole = /invalid login credentials|password reset|auth/i;
  const expectedAuthResourceError = (item) => ['wrong_password', 'forgot_password'].includes(item.phase)
    && /Failed to load resource: the server responded with a status of (400|422|429)/i.test(item.text || '');
  const criticalConsole = runtime.consoleErrors.filter((item) => !expectedAuthResourceError(item) && !expectedConsole.test(item.text || ''));
  const criticalFailed = runtime.failedRequests.filter((item) => !/ERR_ABORTED|NS_BINDING_ABORTED|operation canceled|cancelled|canceled/i.test(item.failure || ''));
  const criticalHttp = runtime.httpResponses.filter((item) => !(item.phase === 'wrong_password' && [400, 422].includes(item.status)) && !(item.phase === 'forgot_password' && [400, 422, 429].includes(item.status)));
  return {
    criticalConsoleErrors: criticalConsole.length,
    criticalConsoleSamples: criticalConsole.slice(0, 5).map((item) => sanitizeMessage(item.text)),
    pageErrors: runtime.pageErrors.length,
    criticalFailedRequests: criticalFailed.length,
    criticalHttpResponses: criticalHttp.length,
    expectedHttpResponses: runtime.httpResponses.length - criticalHttp.length,
    aiRequestsBeforePhaseB: runtime.aiRequests.filter((item) => item.phase !== 'photos_ai_upload' && item.phase !== 'review_actions' && item.phase !== 'persistence_after_ai' && item.phase !== 'final_review_report').length,
    aiRequestSamples: runtime.aiRequests.slice(0, 5),
  };
}

function attachRuntime(page, runtime) {
  page.on('request', (request) => {
    const url = request.url();
    if (isAiRequestUrl(url)) runtime.aiRequests.push({ phase: runtime.phase, url: redactUrl(url) });
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') runtime.consoleErrors.push({ phase: runtime.phase, text: msg.text() });
  });
  page.on('pageerror', (err) => runtime.pageErrors.push({ phase: runtime.phase, text: sanitizeMessage(err.message || err) }));
  page.on('requestfailed', (request) => {
    runtime.failedRequests.push({ phase: runtime.phase, failure: request.failure()?.errorText || 'unknown', url: request.url() });
  });
  page.on('response', (response) => {
    if (response.status() >= 400) runtime.httpResponses.push({ phase: runtime.phase, status: response.status(), url: response.url() });
  });
}

function renderReport(result) {
  const lines = [
    '# VF UAT Funcional Real Completo - 2026-06-27',
    '',
    `STATUS FINAL: ${result.status}`,
    '',
    `URL testada: ${result.url}`,
    `Run ID: ${result.runId}`,
    `Inicio: ${result.startedAt}`,
    `Fim: ${result.finishedAt}`,
    `FASE A - Core sem custo: ${result.phaseAStatus}`,
    `FASE B - IA controlada: ${result.phaseBStatus}`,
    `Modo do gate: ${MODE}`,
    `Fase B autorizada por ambiente: ${ENABLE_IA_PHASE ? 'sim' : 'nao'}`,
    `Modo Discovery sem custo: ${DISCOVERY_ONLY ? 'sim' : 'nao'}`,
    '',
    '## Inventario e Amostragem',
    '',
    `- Diretorio: ${result.inventory.photoRoot}`,
    `- Comodos detectados: ${result.inventory.totalRooms}`,
    `- Fotos validas no acervo: ${result.inventory.totalValidPhotos}`,
    `- Fotos selecionadas para IA: ${result.inventory.samplePhotoCount}`,
    `- Limite inicial de IA: ${MAX_IA_PHOTOS} fotos`,
    `- FASE A permite upload de fotos: nao, porque upload pode disparar IA automaticamente`,
    `- Custo acervo completo base: R$ ${result.inventory.fullCostBase.toFixed(2)}`,
    `- Custo acervo completo stress: R$ ${result.inventory.fullCostStress.toFixed(2)}`,
    `- Custo amostra base: R$ ${result.inventory.sampleCostBase.toFixed(2)}`,
    `- Custo amostra stress: R$ ${result.inventory.sampleCostStress.toFixed(2)}`,
    '',
    '| Comodo | Fotos no acervo | Fotos selecionadas |',
    '| --- | ---: | ---: |',
    ...result.inventory.rooms.map((room) => `| ${room.name} | ${room.count} | ${room.sampleFiles.length} |`),
    '',
    '## Matriz por Fase',
    '',
    '| Fase | Caso | Acao | Esperado | Resultado | Status | Evidencia |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...result.matrix.map((row) => `| ${row.phase} | ${row.caso} | ${row.acao} | ${row.esperado} | ${row.resultado || ''} | ${row.status} | ${row.evidencia || ''} |`),
    '',
    '## Totais',
    '',
    `- Quantidade de comodos criados/validados: ${result.totalRoomsCreated}`,
    `- Quantidade de fotos processadas: ${result.photosProcessed}`,
    `- Quantidade de fotos analisadas por IA: ${result.photosAnalyzedByIa}`,
    `- Uso total de tokens: ${result.usage.totalTokens}`,
    `- Input tokens: ${result.usage.inputTokens}`,
    `- Output tokens: ${result.usage.outputTokens}`,
    `- Custo estimado base: R$ ${(result.photosAnalyzedByIa * COST_BASE_PER_PHOTO_BRL).toFixed(2)}`,
    `- Custo estimado stress: R$ ${(result.photosAnalyzedByIa * COST_STRESS_PER_PHOTO_BRL).toFixed(2)}`,
    `- Custo OpenAI FASE A: R$ ${(result.phaseACostOpenAi || 0).toFixed(2)}`,
    '',
    '## Gaps Funcionais',
    '',
    result.gaps.length ? result.gaps.map((gap) => `- ${gap}`).join('\n') : '- Nenhum gap funcional registrado.',
    '',
    '## Bugs Bloqueadores',
    '',
    result.bugs.length ? result.bugs.map((bug) => `- ${bug}`).join('\n') : '- Nenhum bug bloqueador registrado.',
    '',
    '## Runtime',
    '',
    `- Console errors criticos: ${result.runtime.criticalConsoleErrors}`,
    ...(result.runtime.criticalConsoleSamples || []).map((item) => `  - ${item}`),
    `- Page errors: ${result.runtime.pageErrors}`,
    `- Failed requests criticos: ${result.runtime.criticalFailedRequests}`,
    `- HTTP criticos: ${result.runtime.criticalHttpResponses}`,
    `- HTTP esperados: ${result.runtime.expectedHttpResponses}`,
    `- Requests IA antes da FASE B: ${result.runtime.aiRequestsBeforePhaseB || 0}`,
    ...((result.runtime.aiRequestSamples || []).length ? ['- Amostras de requests IA:', ...(result.runtime.aiRequestSamples || []).map((item) => `  - ${item.phase}: ${item.url}`)] : []),
    '',
    '## Cleanup',
    '',
    `- Cleanup total: ${result.cleanupOk ? 'sim' : 'nao'}`,
    `- Leftovers: ${result.cleanupDetails ? JSON.stringify(result.cleanupDetails.leftovers) : 'nao executado'}`,
    '',
    '## Evidencias',
    '',
    `- Relatorio MD: ${REPORT_PATH}`,
    `- Relatorio JSON: ${REPORT_JSON_PATH}`,
    '',
    result.error ? `Erro principal: ${result.error}` : '',
    '',
    'UAT nao foi liberado automaticamente.',
    '',
  ];
  return lines.join('\n');
}

async function run() {
  const startedAt = new Date().toISOString();
  const inventory = inventoryPhotos();
  const result = {
    status: 'BLOCKED',
    url: TARGET_URL,
    runId: RUN_ID,
    startedAt,
    finishedAt: '',
    inventory,
    matrix: [],
    phaseAStatus: 'PENDING',
    phaseBStatus: 'PENDING',
    phaseACostOpenAi: 0,
    totalRoomsCreated: 0,
    photosProcessed: 0,
    photosAnalyzedByIa: 0,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    gaps: [],
    bugs: [],
    runtime: { criticalConsoleErrors: 0, criticalConsoleSamples: [], pageErrors: 0, criticalFailedRequests: 0, criticalHttpResponses: 0, expectedHttpResponses: 0, aiRequestsBeforePhaseB: 0, aiRequestSamples: [] },
    cleanupOk: false,
    cleanupDetails: null,
    error: null,
  };

  addCase(result, '0', 'Inventario', 'Mapear subpastas e selecionar ate 5 fotos por comodo com maximo total 50', 'Todos os comodos entram no core e amostra IA fica <= 50', 'PASS', `${inventory.samplePhotoCount} fotos selecionadas em ${inventory.totalRooms} comodos`, `Acervo ${inventory.totalValidPhotos} fotos`);
  if (inventory.samplePhotoCount > MAX_IA_PHOTOS) {
    setCase(result, 'Inventario', { status: 'COST_GUARD', evidencia: `Amostra calculada ${inventory.samplePhotoCount} > ${MAX_IA_PHOTOS}` });
    result.status = 'COST_GUARD';
    result.finishedAt = new Date().toISOString();
    writeFileSync(REPORT_PATH, renderReport(result), 'utf8');
    writeFileSync(REPORT_JSON_PATH, JSON.stringify(result, null, 2), 'utf8');
    console.log(JSON.stringify({ status: result.status, report: REPORT_PATH }, null, 2));
    process.exitCode = 2;
    return;
  }

  const env = loadEnvLocal();
  const missing = ['VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((key) => !env[key]);
  if (missing.length) throw new Error(`missing ${missing.join(', ')} in .env.local`);

  const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  let provisioned = null;
  let browser = null;
  let context = null;
  const runtime = { phase: 'bootstrap', consoleErrors: [], pageErrors: [], failedRequests: [], httpResponses: [], aiRequests: [] };

  try {
    provisioned = await createUserAndEntitlement(admin);
    addCase(result, '1', 'Usuario UAT valido', 'Provisionar usuario tecnico e entitlement beta_paid_4990', 'Usuario normal entra pelo frontend; service_role apenas setup/cleanup', 'PASS', `Plano ${provisioned.plan.id} com limite ${provisioned.plan.max_photos_per_inspection}`);

    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    attachRuntime(page, runtime);

    runtime.phase = 'open_public_app';
    const response = await page.goto(`${TARGET_URL}/?uat_real_complete=${RUN_ID}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if ((response?.status() || 0) !== 200) throw new Error(`public URL status ${response?.status() || 'unknown'}`);

    runtime.phase = 'wrong_password';
    await page.getByLabel(/^E-mail$/i).fill(provisioned.email);
    await page.getByLabel(/^Senha$/i).fill(`wrong-${provisioned.password}`);
    await page.getByRole('button', { name: /^Entrar$/i }).last().click();
    await page.getByText(/E-mail ou senha invalidos/i).waitFor({ state: 'visible', timeout: 20_000 });
    addCase(result, '1', 'Senha errada', 'Tentar login com senha invalida', 'Mensagem clara sem autenticar', 'PASS', 'Mensagem de credenciais invalidas exibida');

    runtime.phase = 'forgot_password';
    await page.getByRole('button', { name: /Esqueci minha senha/i }).click();
    const forgotAccepted = await page.getByText(/Se houver uma conta para este e-mail/i).waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false);
    const forgotRateLimit = await visibleOrFalse(page.getByText(/Muitas tentativas de recuperacao/i));
    addCase(result, '1', 'Esqueci senha', 'Solicitar recuperacao uma vez', 'Solicitacao aceita ou bloqueio externo documentado', forgotAccepted ? 'PASS' : forgotRateLimit ? 'GAP' : 'GAP', forgotAccepted ? 'Fluxo aceito pela UI' : forgotRateLimit ? 'P1/P2: rate limit Supabase Auth; Discovery continua' : 'P1/P2: mensagem esperada nao apareceu; Discovery continua');
    if (!forgotAccepted) {
      addGap(result, forgotRateLimit ? 'Esqueci senha bloqueado por rate limit Supabase Auth; nao bloqueia Discovery core.' : 'Esqueci senha nao retornou mensagem esperada; nao bloqueia Discovery core.');
    }

    addGap(result, 'Esqueci e-mail / recuperar e-mail nao existe na UI publica atual.');
    addCase(result, '1', 'Esqueci e-mail', 'Procurar fluxo equivalente', 'Registrar suporte ou GAP funcional', 'NOT_SUPPORTED', 'Nao existe controle visivel de recuperar e-mail.');

    runtime.phase = 'valid_login';
    await login(page, provisioned.email, provisioned.password);
    addCase(result, '1', 'Login valido', 'Entrar com usuario UAT', 'Abrir Meus Imoveis', 'PASS', 'Login por e-mail/senha abriu app autenticado');

    await logout(page);
    await login(page, provisioned.email, provisioned.password);
    addCase(result, '1', 'Logout/login', 'Sair e entrar novamente', 'Sessao volta sem erro', 'PASS', 'Logout retornou ao auth e login reabriu app');

    runtime.phase = 'property_crud';
    const propertyName = `UAT Real ${RUN_ID}`;
    const editedPropertyName = `UAT Real ${RUN_ID} editado`;
    const tempPropertyName = `UAT Real temp ${RUN_ID}`;
    await createProperty(page, propertyName, `Imovel principal UAT ${RUN_ID}`);
    await page.locator('[data-testid^="property-card-"]').filter({ hasText: propertyName }).locator('button[title^="Editar"]').click();
    await page.locator('form input').nth(0).fill(editedPropertyName);
    await page.locator('form textarea').fill(`Imovel editado UAT ${RUN_ID}`);
    await page.getByRole('button', { name: /Salvar Im.vel/i }).click();
    await page.locator('[data-testid^="property-card-"]').filter({ hasText: editedPropertyName }).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
    await page.locator('[data-testid^="property-card-"]').filter({ hasText: editedPropertyName }).first().waitFor({ state: 'visible', timeout: 45_000 });
    await logout(page);
    await login(page, provisioned.email, provisioned.password);
    await page.locator('[data-testid^="property-card-"]').filter({ hasText: editedPropertyName }).first().waitFor({ state: 'visible', timeout: 45_000 });
    await createProperty(page, tempPropertyName, 'Temporario para delete');
    await page.locator('[data-testid^="property-card-"]').filter({ hasText: tempPropertyName }).locator('button[title^="Excluir"]').click();
    await page.getByRole('button', { name: /Sim, Excluir/i }).click();
    await page.waitForTimeout(1000);
    if (await visibleOrFalse(page.locator('[data-testid^="property-card-"]').filter({ hasText: tempPropertyName }))) throw new Error('temporary property still visible');
    const persistedProperty = await admin.from('properties').select('id,nickname').eq('user_id', provisioned.userId).eq('nickname', editedPropertyName).single();
    if (persistedProperty.error || !persistedProperty.data?.id) throw new Error(`PROPERTY_PERSISTENCE_FAILED: ${persistedProperty.error?.message || 'missing'}`);
    addCase(result, '2', 'CRUD imovel', 'Criar, listar, alterar, reload, logout/login e deletar temporario', 'Imovel principal persiste e temporario some', 'PASS', 'UI validada; Supabase validado no fechamento');

    runtime.phase = 'inspection_crud';
    await openHistory(page, editedPropertyName);
    const openedInspection = await startInspectionFromHistoryRobust(page, admin, provisioned.userId, persistedProperty.data, result, 'principal');
    const inspectionId = openedInspection.inspectionId;
    if (openedInspection.duplicates) addGap(result, `Possivel duplicidade de rascunho detectada ao criar vistoria principal: ${openedInspection.duplicates} extras.`);
    await page.getByLabel(/Voltar para hist.rico/i).click();
    await page.getByText(/Hist.rico de Vistorias/i).waitFor({ state: 'visible', timeout: 30_000 });
    await openDraftFromHistory(page);
    await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
    await page.getByText(/Meus Im.veis/i).waitFor({ state: 'visible', timeout: 45_000 });
    await openHistory(page, editedPropertyName);
    await openDraftFromHistory(page);
    await page.getByLabel(/Voltar para hist.rico/i).click();
    await page.getByText(/Hist.rico de Vistorias/i).waitFor({ state: 'visible', timeout: 30_000 });
    const tempInspection = await startInspectionFromHistoryRobust(page, admin, provisioned.userId, persistedProperty.data, result, 'temporaria');
    await page.getByLabel(/Voltar para hist.rico/i).click();
    page.once('dialog', async (dialog) => dialog.accept());
    await page.locator('button[title="Excluir vistoria"]').first().click();
    await page.waitForTimeout(1000);
    const tempStillExists = await admin.from('inspections').select('id', { count: 'exact', head: true }).eq('id', tempInspection.inspectionId);
    if (tempStillExists.error) throw new Error(`INSPECTION_DELETE_CHECK_FAILED: ${tempStillExists.error.message}`);
    if ((tempStillExists.count || 0) > 0) throw new Error(`INSPECTION_DELETE_FAILED: temp inspection ${tempInspection.inspectionId} still exists`);
    const primaryStillExists = await admin.from('inspections').select('id', { count: 'exact', head: true }).eq('id', inspectionId);
    if (primaryStillExists.error) throw new Error(`INSPECTION_PRIMARY_CHECK_FAILED: ${primaryStillExists.error.message}`);
    if ((primaryStillExists.count || 0) !== 1) throw new Error(`INSPECTION_PRIMARY_LOST: primary inspection ${inspectionId} not found after temp delete`);
    await openDraftFromHistory(page);
    addCase(result, '3', 'CRUD vistoria', 'Criar entrada, listar/retomar, reload/logout-login e deletar temporaria', 'Vistoria principal persiste vinculada ao imovel', openedInspection.openedByFallback || tempInspection.openedByFallback ? 'PASS_WITH_GATE_FALLBACK' : 'PASS', `inspectionId=${inspectionId}; evidencias=${JSON.stringify(openedInspection.evidence)}`);
    addGap(result, 'Edicao de metadados/status de vistoria nao tem controle dedicado na UI atual.');
    addCase(result, '3', 'Alterar vistoria', 'Procurar controle de edicao de metadados/status', 'Alterar se suportado', 'NOT_SUPPORTED', 'Sem UI dedicada alem do fluxo rascunho/concluir.');

    runtime.phase = 'rooms_crud';
    const defaultRoomNames = ['Sala', 'Quarto 1', 'Quarto 2', 'Banheiro', 'Cozinha', 'Área de Serviço', 'Varanda', 'Garagem', 'Outros'];
    const roomNames = inventory.rooms.map((room) => room.name);
    const initialTargets = roomNames.slice(0, defaultRoomNames.length);
    for (let i = 0; i < initialTargets.length; i += 1) {
      await renameRoom(page, defaultRoomNames[i], initialTargets[i]);
    }
    for (const roomName of roomNames.slice(initialTargets.length)) {
      await addRoom(page, roomName);
    }
    const editedRoomOriginal = roomNames[0];
    const editedRoomName = `${editedRoomOriginal} Revisada`;
    await renameRoom(page, editedRoomOriginal, editedRoomName);
    roomNames[0] = editedRoomName;
    const tempRoomName = `Comodo temporario ${RUN_ID.slice(-6)}`;
    await addRoom(page, tempRoomName);
    await deleteRoomByName(page, tempRoomName);
    await page.getByLabel(/Voltar para hist.rico/i).click();
    await openDraftFromHistory(page);
    for (const roomName of roomNames) await roomRow(page, roomName).waitFor({ state: 'visible', timeout: 30_000 });
    await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
    await page.getByText(/Meus Im.veis/i).waitFor({ state: 'visible', timeout: 45_000 });
    await openHistory(page, editedPropertyName);
    await openDraftFromHistory(page);
    await logout(page);
    await login(page, provisioned.email, provisioned.password);
    await openHistory(page, editedPropertyName);
    await openDraftFromHistory(page);
    for (const roomName of roomNames) await roomRow(page, roomName).waitFor({ state: 'visible', timeout: 30_000 });
    result.totalRoomsCreated = roomNames.length;
    addCase(result, '4', 'CRUD comodos', 'Criar comodos por subpasta, editar um, deletar temporario, reload/logout-login', 'Todos os comodos persistem', 'PASS', `${roomNames.length} comodos validados`);

    runtime.phase = 'phase_a_cost_guard';
    const phaseACore = await queryPhaseACore(admin, provisioned.userId, editedPropertyName, inspectionId, roomNames);
    await assertPhaseACostZero(result, runtime, admin, provisioned.userId, inspectionId);
    result.phaseAStatus = 'PASS';
    result.phaseACostOpenAi = 0;
    addCase(result, 'A', 'Barreira custo zero FASE A', 'Validar Auth, imovel, vistoria, comodos, Supabase e nenhum uso de IA', '0 fotos, 0 tokens, 0 requests IA antes da FASE B', 'PASS', `${phaseACore.rooms.length} comodos persistidos; custo OpenAI R$ 0.00`);

    if (CORE_ONLY || DISCOVERY_ONLY || !ENABLE_IA_PHASE) {
      result.phaseBStatus = MODE === 'core-certification' ? 'NOT_EXECUTED_CORE_CERTIFICATION' : 'NOT_EXECUTED_DISCOVERY';
      result.status = result.gaps.length ? 'PASS_CORE_WITH_GAPS_NO_COST' : 'PASS_CORE_NO_COST';
      addCase(result, 'B', 'FASE B nao executada', 'Recalcular custo e manter IA bloqueada no gate core', 'Nao subir fotos nem chamar OpenAI', 'NOT_EXECUTED', `Amostra IA ${inventory.samplePhotoCount}/${MAX_IA_PHOTOS}; base R$ ${inventory.sampleCostBase.toFixed(2)}; stress R$ ${inventory.sampleCostStress.toFixed(2)}`);
    } else {
      result.phaseBStatus = 'RUNNING';
      addCase(result, 'B', 'COST_GUARD FASE B', 'Recalcular custo antes de fotos/IA', 'Amostra <= 50 e custo registrado antes da primeira chamada', 'PASS', `Amostra IA ${inventory.samplePhotoCount}/${MAX_IA_PHOTOS}; base R$ ${inventory.sampleCostBase.toFixed(2)}; stress R$ ${inventory.sampleCostStress.toFixed(2)}`);

    runtime.phase = 'photos_ai_upload';
    let deletedTempPath = null;
    let processed = 0;
    for (let index = 0; index < inventory.rooms.length; index += 1) {
      const inventoryRoom = inventory.rooms[index];
      const appRoomName = index === 0 ? editedRoomName : inventoryRoom.name;
      await selectRoom(page, appRoomName);
      let files = inventoryRoom.sampleFiles;
      if (index === 0) {
        const tempFile = files[0];
        await uploadFilesToCurrentRoom(page, [tempFile], 1);
        processed += 1;
        const tempPhoto = await admin.from('photos').select('id,storage_path').eq('inspection_id', inspectionId).order('created_at', { ascending: false }).limit(1).single();
        if (tempPhoto.error || !tempPhoto.data?.id) throw new Error(`temp photo query failed: ${tempPhoto.error?.message || 'missing'}`);
        deletedTempPath = tempPhoto.data.storage_path;
        await page.locator('button[title="Excluir foto"]').first().click();
        await page.waitForTimeout(1000);
        files = files.slice(1);
      }
      if (files.length) {
        await uploadFilesToCurrentRoom(page, files, files.length);
        processed += files.length;
      }
      addCase(result, '5/6', `Fotos e IA - ${appRoomName}`, `Subir ${files.length}${index === 0 ? ' finais + 1 temporaria deletada' : ''}`, 'Fotos aparecem e IA real gera sugestoes uteis sem fallback', 'PASS', `${files.length} foto(s) finais no comodo`);
    }
    result.photosProcessed = processed;
    result.photosAnalyzedByIa = processed;

    runtime.phase = 'review_actions';
    await selectRoom(page, roomNames[0]);
    const firstConfirm = page.getByRole('button', { name: /Confirmar Sugest.o/i }).first();
    await firstConfirm.waitFor({ state: 'visible', timeout: 30_000 });
    await firstConfirm.click();
    await page.getByText(/Confirmado/i).first().waitFor({ state: 'visible', timeout: 30_000 });
    const editForm = await clickFirstPhotoEdit(page, 1);
    await fillPhotoEditForm(editForm);
    await page.getByText(/Observacao editada pelo usuario/i).first().waitFor({ state: 'visible', timeout: 30_000 });
    const rejectVisible = await visibleOrFalse(page.getByRole('button', { name: /Rejeitar|Nao aceitar|Não aceitar/i }).first());
    if (!rejectVisible) result.gaps.push('Rejeitar sugestao explicitamente nao existe na UI; usuario consegue editar a sugestao.');
    addCase(result, '6', 'Revisao de sugestoes IA', 'Confirmar uma sugestao, editar outra e procurar rejeicao', 'Decisoes salvas e rejeicao documentada se ausente', 'PASS', rejectVisible ? 'Rejeicao visivel' : 'Rejeicao explicita NOT_SUPPORTED');

    runtime.phase = 'persistence_after_ai';
    await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
    await page.getByText(/Meus Im.veis/i).waitFor({ state: 'visible', timeout: 45_000 });
    await openHistory(page, editedPropertyName);
    await openDraftFromHistory(page);
    await selectRoom(page, roomNames[0]);
    await page.getByText(/Observacao editada pelo usuario/i).first().waitFor({ state: 'visible', timeout: 30_000 });
    await logout(page);
    await login(page, provisioned.email, provisioned.password);
    await openHistory(page, editedPropertyName);
    await openDraftFromHistory(page);
    await selectRoom(page, roomNames[0]);
    await page.getByText(/Observacao editada pelo usuario/i).first().waitFor({ state: 'visible', timeout: 30_000 });
    addCase(result, '6/7', 'Persistencia IA/revisao', 'Reload e logout/login apos analises', 'Analises e texto editado persistem', 'PASS', 'Texto editado visivel apos retomada');

    runtime.phase = 'final_review_report';
    await page.getByRole('button', { name: /Concluir.*Revisar/i }).click();
    await page.getByText(/Visualizar Relat.rio/i).waitFor({ state: 'visible', timeout: 60_000 });
    for (const roomName of roomNames) {
      await page.getByText(new RegExp(escapeRegex(roomName))).first().waitFor({ state: 'visible', timeout: 30_000 });
    }
    await page.getByText(/Observacao editada pelo usuario/i).first().waitFor({ state: 'visible', timeout: 30_000 });
    addCase(result, '7', 'Revisao final', 'Abrir tela final e validar comodos/fotos/observacoes', 'Dados revisados aparecem', 'PASS', 'Comodos e observacao editada visiveis');

    const downloadPromise = page.waitForEvent('download', { timeout: 120_000 }).catch(() => null);
    await page.getByRole('button', { name: /Baixar Relat.rio PDF/i }).click();
    await downloadPromise;
    await page.getByText(/Relat.rio gerado com sucesso/i).waitFor({ state: 'visible', timeout: 120_000 });
    await page.getByRole('button', { name: /Vistoria F.cil IA/i }).first().click();
    await page.getByText(/Meus Im.veis/i).waitFor({ state: 'visible', timeout: 45_000 });
    await openHistory(page, editedPropertyName);
    await logout(page);
    await login(page, provisioned.email, provisioned.password);
    await openHistory(page, editedPropertyName);
    await page.getByRole('button', { name: /Ver PDF|Compartilhar/i }).first().click();
    await page.getByText(/Visualizar Relat.rio/i).waitFor({ state: 'visible', timeout: 45_000 });
    addCase(result, '8', 'Relatorio/PDF', 'Gerar PDF, validar conteudo e reabrir apos logout/login', 'Relatorio utilizavel com fotos e observacoes IA', 'PASS', 'PDF gerado e reaberto');

    const persisted = await queryPersisted(admin, provisioned.userId, editedPropertyName, inspectionId, roomNames, inventory.samplePhotoCount - 1, deletedTempPath);
    const usage = usageTotals(persisted.photos);
    result.usage = usage;
    result.photosAnalyzedByIa = processed;
    if (!persisted.reports.length || persisted.inspection.status !== 'pdf_gerado') throw new Error('report was not persisted as pdf_gerado');
    addCase(result, '2-8', 'Validacao Supabase/Storage', 'Consultar tabelas e objetos criados', 'Dados, fotos, IA e relatorio persistidos', 'PASS', `${persisted.rooms.length} rooms, ${persisted.photos.length} photos, ${persisted.reports.length} reports`);

      result.phaseBStatus = 'PASS';
      result.status = 'PASS';
    }
  } catch (error) {
    result.error = sanitizeMessage(error?.message || error);
    if (result.phaseAStatus !== 'PASS') result.phaseAStatus = /rate limit|supabase|storage|permission|missing/i.test(result.error) ? 'BLOCKED' : 'FAIL';
    if (result.phaseAStatus === 'PASS' && result.phaseBStatus === 'RUNNING') result.phaseBStatus = /quota|openai|api_key|netlify|supabase|storage|permission|rate limit|missing/i.test(result.error) ? 'BLOCKED' : 'FAIL';
    if (/COST_GUARD|UAT_REAL_COMPLETE_ENABLE_AI/i.test(result.error)) result.status = 'COST_GUARD';
    else result.status = /quota|openai|api_key|netlify|supabase|storage|permission|rate limit|missing/i.test(result.error) ? 'BLOCKED' : 'FAIL_CORE';
    result.bugs.push(result.error);
  } finally {
    if (context) await context.close().catch(() => undefined);
    if (browser) await browser.close().catch(() => undefined);
    result.runtime = classifyRuntime(runtime);
    if ((result.status === 'PASS_CORE_NO_COST' || result.status === 'PASS_CORE_WITH_GAPS_NO_COST' || result.status === 'PASS') && (result.runtime.criticalConsoleErrors || result.runtime.pageErrors || result.runtime.criticalFailedRequests || result.runtime.criticalHttpResponses)) {
      result.status = 'FAIL_CORE';
      result.bugs.push('Critical runtime errors observed.');
    }
    if (provisioned?.userId) {
      result.cleanupDetails = await cleanup(admin, provisioned.userId).catch((error) => ({ ok: false, errors: [sanitizeMessage(error?.message || error)], leftovers: { cleanupFailed: true } }));
      result.cleanupOk = result.cleanupDetails.ok;
      addCase(result, '9', 'Cleanup', 'Remover dados e fotos do teste', 'Sem leftovers no Supabase/Storage/Auth', result.cleanupOk ? 'PASS' : 'FAIL', result.cleanupOk ? 'Cleanup total confirmado' : JSON.stringify(result.cleanupDetails.errors));
      if ((result.status === 'PASS_CORE_NO_COST' || result.status === 'PASS_CORE_WITH_GAPS_NO_COST' || result.status === 'PASS') && !result.cleanupOk) result.status = 'FAIL_CORE';
    }
    result.finishedAt = new Date().toISOString();
    writeFileSync(REPORT_PATH, renderReport(result), 'utf8');
    writeFileSync(REPORT_JSON_PATH, JSON.stringify(result, null, 2), 'utf8');
  }

  console.log(JSON.stringify({
    status: result.status,
    url: result.url,
    rooms: result.totalRoomsCreated,
    photosProcessed: result.photosProcessed,
    photosAnalyzedByIa: result.photosAnalyzedByIa,
    tokens: result.usage.totalTokens,
    cleanupOk: result.cleanupOk,
    report: REPORT_PATH,
    reportJson: REPORT_JSON_PATH,
    error: result.error,
  }, null, 2));

  process.exitCode = result.status === 'PASS_CORE_NO_COST' || result.status === 'PASS_CORE_WITH_GAPS_NO_COST' || result.status === 'PASS' ? 0 : result.status === 'COST_GUARD' || result.status === 'BLOCKED' ? 2 : 1;
}

run().catch((error) => {
  const message = sanitizeMessage(error?.message || error);
  const result = {
    status: /cost/i.test(message) ? 'COST_GUARD' : 'BLOCKED',
    url: TARGET_URL,
    runId: RUN_ID,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    inventory: { photoRoot: PHOTO_ROOT, rooms: [], totalRooms: 0, totalValidPhotos: 0, samplePhotoCount: 0, fullCostBase: 0, fullCostStress: 0, sampleCostBase: 0, sampleCostStress: 0 },
    matrix: [],
    totalRoomsCreated: 0,
    photosProcessed: 0,
    photosAnalyzedByIa: 0,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    gaps: [],
    bugs: [message],
    runtime: { criticalConsoleErrors: 0, criticalConsoleSamples: [], pageErrors: 0, criticalFailedRequests: 0, criticalHttpResponses: 0, expectedHttpResponses: 0 },
    cleanupOk: false,
    cleanupDetails: null,
    error: message,
  };
  writeFileSync(REPORT_PATH, renderReport(result), 'utf8');
  writeFileSync(REPORT_JSON_PATH, JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify({ status: result.status, error: message, report: REPORT_PATH }, null, 2));
  process.exitCode = 2;
});
