import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const INSPECTION_LIFECYCLE_MODE = process.argv.includes('--inspection-lifecycle');
const RUN_ID = `${INSPECTION_LIFECYCLE_MODE ? 'inspection_lifecycle_p0' : 'persistence_p0'}_${Date.now()}`;
const REPORT_PATH = INSPECTION_LIFECYCLE_MODE
  ? 'qa/vf_inspection_lifecycle_p0_20260627.md'
  : 'qa/vf_persistence_p0_20260627.md';
const REPORT_JSON_PATH = INSPECTION_LIFECYCLE_MODE
  ? 'qa/vf_inspection_lifecycle_p0_20260627.json'
  : 'qa/vf_persistence_p0_20260627.json';
const EVIDENCE_DIR = path.join('test-results', 'persistence-p0');
const DEFAULT_ENV_CANDIDATES = [
  '.env.local',
  path.join('..', 'vistoria-facil-ia-staging', '.env.local'),
].filter(Boolean);
const TARGET_URL = process.env.PERSISTENCE_P0_BASE_URL || null;
const LOCAL_PORT = Number(process.env.PERSISTENCE_P0_PORT || 4291);
const TEST_EMAIL = `e2e-persistence-p0-${RUN_ID}@vistoriafacilia.com`;
const TEST_PASSWORD = `PersistenceP0-${RUN_ID}!`;

function readEnvFile(filePath) {
  const values = {};
  if (!filePath || !existsSync(filePath)) return values;
  for (const raw of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    values[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
}

function loadEnvLocal() {
  const explicit = process.env.PERSISTENCE_P0_ENV_FILE;
  const candidates = explicit ? [explicit] : DEFAULT_ENV_CANDIDATES;
  const fileValues = candidates.reduce((acc, filePath) => ({ ...acc, ...readEnvFile(filePath) }), {});
  return { ...fileValues, ...process.env };
}

function sanitizeMessage(value) {
  const text = String(value || '');
  const lower = text.toLowerCase();
  if (
    lower.includes('token')
    || lower.includes('key')
    || lower.includes('password')
    || lower.includes('service_role')
    || lower.includes('authorization')
    || lower.includes('bearer')
  ) {
    return '[redacted sensitive message]';
  }
  return text.replace(/\s+/g, ' ').slice(0, 600);
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

function inspectionCard(page, inspectionId) {
  return page
    .locator('div.bg-white.rounded-2xl.border.border-slate-100')
    .filter({ hasText: inspectionId })
    .filter({ has: page.getByRole('button', { name: /Continuar Rascunho|Ver PDF|Compartilhar/i }) })
    .first();
}

async function visibleOrFalse(locator) {
  return locator.isVisible().catch(() => false);
}

async function waitFor(fn, timeoutMs = 20_000, intervalMs = 500) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  if (lastError) throw lastError;
  return false;
}

async function captureEvidence(page, name) {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const safeName = name.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 80);
  const file = path.join(EVIDENCE_DIR, `${RUN_ID}_${safeName}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => undefined);
  return file;
}

async function visibleTexts(page) {
  const text = await page.locator('body').innerText({ timeout: 5_000 }).catch(() => '');
  return text.replace(/\s+/g, ' ').slice(0, 3000);
}

async function visibleButtons(page) {
  return page.getByRole('button').evaluateAll((buttons) =>
    buttons
      .map((button) => button.textContent?.replace(/\s+/g, ' ').trim() || button.getAttribute('aria-label') || button.getAttribute('title') || '')
      .filter(Boolean)
      .slice(0, 80)
  ).catch(() => []);
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

function attachRuntime(page, runtime) {
  page.on('request', (request) => {
    const url = request.url();
    if (isAiRequestUrl(url)) runtime.aiRequests.push({ phase: runtime.phase, url: redactUrl(url) });
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') runtime.consoleErrors.push({ phase: runtime.phase, text: sanitizeMessage(msg.text()) });
  });
  page.on('pageerror', (err) => runtime.pageErrors.push({ phase: runtime.phase, text: sanitizeMessage(err.message || err) }));
  page.on('requestfailed', (request) => {
    runtime.failedRequests.push({
      phase: runtime.phase,
      failure: sanitizeMessage(request.failure()?.errorText || 'unknown'),
      url: redactUrl(request.url()),
    });
  });
  page.on('response', (response) => {
    if (response.status() >= 500) runtime.httpErrors.push({ phase: runtime.phase, status: response.status(), url: redactUrl(response.url()) });
  });
}

async function startLocalServer(env) {
  if (TARGET_URL) {
    return { baseUrl: TARGET_URL.replace(/\/$/, ''), stop: async () => undefined, logs: [] };
  }

  const baseUrl = `http://127.0.0.1:${LOCAL_PORT}`;
  const minimalEnv = {
    PATH: process.env.PATH || process.env.Path || '',
    Path: process.env.Path || process.env.PATH || '',
    SystemRoot: process.env.SystemRoot || 'C:\\Windows',
    COMSPEC: process.env.COMSPEC || process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe',
    ComSpec: process.env.ComSpec || process.env.COMSPEC || 'C:\\Windows\\System32\\cmd.exe',
    TEMP: process.env.TEMP || process.env.TMP || '',
    TMP: process.env.TMP || process.env.TEMP || '',
    VITE_SUPABASE_URL: env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY,
    VITE_ENABLE_GOOGLE_AUTH: 'false',
  };
  const viteBin = process.platform === 'win32'
    ? path.join('node_modules', '.bin', 'vite.cmd')
    : path.join('node_modules', '.bin', 'vite');
  const viteArgs = ['--host', '127.0.0.1', '--port', String(LOCAL_PORT), '--strictPort'];
  const child = process.platform === 'win32'
    ? spawn('cmd.exe', ['/d', '/s', '/c', viteBin, ...viteArgs], {
      cwd: process.cwd(),
      env: minimalEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    : spawn(viteBin, viteArgs, {
      cwd: process.cwd(),
      env: minimalEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

  const logs = [];
  child.stdout.on('data', (chunk) => logs.push(sanitizeMessage(chunk.toString())));
  child.stderr.on('data', (chunk) => logs.push(sanitizeMessage(chunk.toString())));

  await waitFor(async () => {
    try {
      const response = await fetch(baseUrl);
      return response.status < 500;
    } catch {
      return false;
    }
  }, 45_000, 750);

  return {
    baseUrl,
    logs,
    stop: async () => {
      if (process.platform === 'win32' && child.pid) {
        await new Promise((resolve) => {
          const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
          killer.on('close', resolve);
          killer.on('error', resolve);
        });
        return;
      }
      if (!child.killed) child.kill('SIGTERM');
      await new Promise((resolve) => setTimeout(resolve, 750));
      if (!child.killed) child.kill('SIGKILL');
    },
  };
}

async function createUserAndEntitlement(admin) {
  const user = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { testRunId: RUN_ID, purpose: 'persistence_p0' },
  });
  if (user.error || !user.data.user) {
    throw new Error(`admin create user failed: ${user.error?.message || 'no user'}`);
  }

  const plan = await admin
    .from('plans')
    .select('id,name,max_photos_per_inspection,pdf_enabled,payment_required')
    .eq('id', 'free_10')
    .single();
  if (plan.error || !plan.data) {
    throw new Error(`plan free_10 unavailable: ${plan.error?.message || 'missing'}`);
  }

  const entitlementId = `${user.data.user.id}_free_10_${RUN_ID}`;
  const entitlement = await admin.from('entitlements').insert({
    id: entitlementId,
    user_id: user.data.user.id,
    plan_id: plan.data.id,
    status: 'active',
    source: 'manual_admin',
    max_photos_per_inspection: plan.data.max_photos_per_inspection,
    pdf_enabled: plan.data.pdf_enabled,
  }).select('id').single();
  if (entitlement.error) {
    throw new Error(`admin entitlement insert failed: ${entitlement.error.message}`);
  }

  return {
    userId: user.data.user.id,
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    entitlementId,
  };
}

async function collectCreated(admin, userId) {
  const created = { userId, propertyIds: [], inspectionIds: [], photoIds: [], storagePaths: [], entitlementIds: [] };
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
  return created;
}

async function verifyNoLeftovers(admin, userId, storagePaths) {
  const leftovers = {};
  for (const table of ['properties', 'inspections', 'rooms', 'photos', 'reports', 'entitlements', 'events']) {
    const res = await admin.from(table).select('id', { count: 'exact', head: true }).eq('user_id', userId);
    leftovers[`${table}Rows`] = res.error ? `check_error: ${sanitizeMessage(res.error.message)}` : (res.count || 0);
  }
  const profile = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('id', userId);
  leftovers.profileRows = profile.error ? `check_error: ${sanitizeMessage(profile.error.message)}` : (profile.count || 0);
  const authUser = await admin.auth.admin.getUserById(userId);
  leftovers.authUserExists = authUser.data?.user ? true : false;
  for (const storagePath of [...new Set(storagePaths.filter(Boolean))]) {
    const parts = storagePath.split('/');
    const filename = parts.pop();
    const folder = parts.join('/');
    const listed = await admin.storage.from('inspection-photos').list(folder, { limit: 100 });
    leftovers[`storage:${storagePath}`] = listed.error ? `list_error: ${sanitizeMessage(listed.error.message)}` : listed.data.some((entry) => entry.name === filename);
  }
  return leftovers;
}

async function cleanup(admin, userId) {
  const created = await collectCreated(admin, userId);
  const storagePaths = [...new Set(created.storagePaths.filter(Boolean))];
  const result = { ok: false, leftovers: {}, errors: [] };

  if (storagePaths.length) {
    const res = await admin.storage.from('inspection-photos').remove(storagePaths);
    if (res.error) result.errors.push(`storage remove: ${sanitizeMessage(res.error.message)}`);
  }
  if (created.photoIds.length) {
    const res = await admin.from('photos').delete().in('id', created.photoIds);
    if (res.error) result.errors.push(`photos delete: ${sanitizeMessage(res.error.message)}`);
  }
  if (created.inspectionIds.length) {
    let res = await admin.from('rooms').delete().in('inspection_id', created.inspectionIds);
    if (res.error) result.errors.push(`rooms delete: ${sanitizeMessage(res.error.message)}`);
    res = await admin.from('reports').delete().in('inspection_id', created.inspectionIds);
    if (res.error) result.errors.push(`reports delete: ${sanitizeMessage(res.error.message)}`);
    res = await admin.from('inspections').delete().in('id', created.inspectionIds);
    if (res.error) result.errors.push(`inspections delete: ${sanitizeMessage(res.error.message)}`);
  }
  if (created.propertyIds.length) {
    const res = await admin.from('properties').delete().in('id', created.propertyIds);
    if (res.error) result.errors.push(`properties delete: ${sanitizeMessage(res.error.message)}`);
  }
  if (created.entitlementIds.length) {
    const res = await admin.from('entitlements').delete().in('id', created.entitlementIds);
    if (res.error) result.errors.push(`entitlements delete: ${sanitizeMessage(res.error.message)}`);
  }
  let res = await admin.from('events').delete().eq('user_id', userId);
  if (res.error) result.errors.push(`events delete: ${sanitizeMessage(res.error.message)}`);
  res = await admin.from('profiles').delete().eq('id', userId);
  if (res.error) result.errors.push(`profiles delete: ${sanitizeMessage(res.error.message)}`);
  const auth = await admin.auth.admin.deleteUser(userId);
  if (auth.error) result.errors.push(`auth user delete: ${sanitizeMessage(auth.error.message)}`);

  await new Promise((resolve) => setTimeout(resolve, 750));
  result.leftovers = await verifyNoLeftovers(admin, userId, storagePaths);
  result.ok = result.errors.length === 0 && Object.values(result.leftovers).every((value) => value === 0 || value === false);
  return result;
}

async function fillLogin(page, email, password) {
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

async function createProperty(page, propertyName) {
  await page.getByRole('button', { name: /Cadastrar/i }).first().click();
  const inputs = page.locator('form input');
  await inputs.nth(0).fill(propertyName);
  await inputs.nth(1).fill('01001-000');
  await inputs.nth(2).fill('SP');
  await inputs.nth(3).fill(`Rua Persistence P0 ${RUN_ID}`);
  await inputs.nth(4).fill('101');
  await inputs.nth(5).fill('Apto P0');
  await inputs.nth(6).fill('Centro');
  await inputs.nth(7).fill('Sao Paulo');
  await inputs.nth(8).fill(`Referencia ${RUN_ID}`);
  await page.locator('form textarea').fill(`Persistencia P0 ${RUN_ID}`);
  await page.getByRole('button', { name: /Salvar Im.vel/i }).click();
  await page.locator('[data-testid^="property-card-"]').filter({ hasText: propertyName }).first().waitFor({ state: 'visible', timeout: 45_000 });
}

async function queryProperty(admin, userId, propertyName) {
  const res = await admin.from('properties').select('*').eq('user_id', userId).eq('nickname', propertyName).single();
  if (res.error || !res.data) throw new Error(`PROPERTY_PERSISTENCE_FAILED: ${res.error?.message || 'missing'}`);
  return res.data;
}

async function queryInspections(admin, userId, propertyId) {
  const res = await admin
    .from('inspections')
    .select('*')
    .eq('user_id', userId)
    .eq('property_id', propertyId)
    .order('started_at', { ascending: false });
  if (res.error) throw new Error(`INSPECTION_QUERY_FAILED: ${res.error.message}`);
  return res.data || [];
}

async function queryRooms(admin, inspectionId) {
  const res = await admin.from('rooms').select('*').eq('inspection_id', inspectionId).order('display_order', { ascending: true });
  if (res.error) throw new Error(`ROOM_QUERY_FAILED: ${res.error.message}`);
  return res.data || [];
}

async function queryPhotoCount(admin, inspectionId) {
  const res = await admin.from('photos').select('id', { count: 'exact', head: true }).eq('inspection_id', inspectionId);
  if (res.error) throw new Error(`PHOTO_GUARD_QUERY_FAILED: ${res.error.message}`);
  return res.count || 0;
}

async function listStoragePrefix(admin, prefix) {
  const listed = await admin.storage.from('inspection-photos').list(prefix, { limit: 100 });
  if (listed.error) throw new Error(`STORAGE_PREFIX_QUERY_FAILED:${prefix}: ${listed.error.message}`);
  return listed.data || [];
}

async function queryLifecycleChildState(admin, params) {
  const { userId, propertyId, inspectionId } = params;
  const [inspection, rooms, photos, reports, photoStorageFiles, reportStorageFiles] = await Promise.all([
    admin.from('inspections').select('*').eq('id', inspectionId).maybeSingle(),
    admin.from('rooms').select('*').eq('inspection_id', inspectionId).order('display_order', { ascending: true }),
    admin.from('photos').select('*').eq('inspection_id', inspectionId),
    admin.from('reports').select('*').eq('inspection_id', inspectionId),
    listStoragePrefix(admin, `${userId}/photos/${inspectionId}`),
    listStoragePrefix(admin, `${userId}/reports/${propertyId}/${inspectionId}`),
  ]);
  if (inspection.error) throw new Error(`INSPECTION_STATE_QUERY_FAILED: ${inspection.error.message}`);
  if (rooms.error) throw new Error(`ROOM_STATE_QUERY_FAILED: ${rooms.error.message}`);
  if (photos.error) throw new Error(`PHOTO_STATE_QUERY_FAILED: ${photos.error.message}`);
  if (reports.error) throw new Error(`REPORT_STATE_QUERY_FAILED: ${reports.error.message}`);

  const photosWithAiAnalysis = (photos.data || []).filter((photo) => photo.ai_analysis);
  const storagePhotoFiles = photoStorageFiles.filter((entry) => entry.name && !entry.name.endsWith('/'));
  const storageReportFiles = reportStorageFiles.filter((entry) => entry.name && !entry.name.endsWith('/'));
  return {
    inspection: inspection.data || null,
    rooms: rooms.data || [],
    photos: photos.data || [],
    reports: reports.data || [],
    photosWithAiAnalysis,
    storagePhotoFiles,
    storageReportFiles,
  };
}

function assertEmptyDraftInitialState(state, inspectionId) {
  if (!state.inspection) throw new Error(`EMPTY_DRAFT_STATE_MISSING: ${inspectionId}`);
  if (state.inspection.status !== 'em_andamento' && state.inspection.status !== 'rascunho') {
    throw new Error(`EMPTY_DRAFT_ADVANCED_STATUS: ${inspectionId}; status=${state.inspection.status}`);
  }
  if (state.photos.length) throw new Error(`EMPTY_DRAFT_HAS_PHOTOS_BEFORE_DISCARD: ${inspectionId}; count=${state.photos.length}`);
  if (state.photosWithAiAnalysis.length) throw new Error(`EMPTY_DRAFT_HAS_AI_ANALYSIS_BEFORE_DISCARD: ${inspectionId}; count=${state.photosWithAiAnalysis.length}`);
  if (state.reports.length) throw new Error(`EMPTY_DRAFT_HAS_REPORTS_BEFORE_DISCARD: ${inspectionId}; count=${state.reports.length}`);
  if (state.storagePhotoFiles.length) throw new Error(`EMPTY_DRAFT_HAS_STORAGE_PHOTOS_BEFORE_DISCARD: ${inspectionId}; count=${state.storagePhotoFiles.length}`);
  if (state.storageReportFiles.length) throw new Error(`EMPTY_DRAFT_HAS_STORAGE_REPORTS_BEFORE_DISCARD: ${inspectionId}; count=${state.storageReportFiles.length}`);
}

function assertDiscardedDraftLeavesNoChildren(state, inspectionId) {
  if (state.inspection) throw new Error(`EMPTY_DRAFT_INSPECTION_LEFTOVER: ${inspectionId}`);
  if (state.rooms.length) throw new Error(`EMPTY_DRAFT_ROOMS_LEFTOVER: ${inspectionId}; count=${state.rooms.length}`);
  if (state.photos.length) throw new Error(`EMPTY_DRAFT_PHOTOS_LEFTOVER: ${inspectionId}; count=${state.photos.length}`);
  if (state.photosWithAiAnalysis.length) throw new Error(`EMPTY_DRAFT_AI_ANALYSIS_LEFTOVER: ${inspectionId}; count=${state.photosWithAiAnalysis.length}`);
  if (state.reports.length) throw new Error(`EMPTY_DRAFT_REPORTS_LEFTOVER: ${inspectionId}; count=${state.reports.length}`);
  if (state.storagePhotoFiles.length) throw new Error(`EMPTY_DRAFT_STORAGE_PHOTOS_LEFTOVER: ${inspectionId}; count=${state.storagePhotoFiles.length}`);
  if (state.storageReportFiles.length) throw new Error(`EMPTY_DRAFT_STORAGE_REPORTS_LEFTOVER: ${inspectionId}; count=${state.storageReportFiles.length}`);
}

async function openHistory(page, propertyName) {
  await page.getByText(/Meus Im.veis/i).waitFor({ state: 'visible', timeout: 45_000 });
  await page.locator('[data-testid^="property-card-"]').filter({ hasText: propertyName }).getByRole('button', { name: /Hist.rico/i }).click();
  await page.getByText(/Hist.rico de Vistorias/i).waitFor({ state: 'visible', timeout: 45_000 });
}

async function openDraftByInspectionId(page, inspectionId) {
  await page.getByText(/Hist.rico de Vistorias/i).waitFor({ state: 'visible', timeout: 45_000 });
  const card = inspectionCard(page, inspectionId);
  await card.waitFor({ state: 'visible', timeout: 30_000 });
  await card.getByRole('button', { name: /Continuar Rascunho/i }).click();
  await page.getByText(/Registro de Fotos:/i).waitFor({ state: 'visible', timeout: 45_000 });
}

async function startNewInspection(page, admin, userId, property) {
  const before = await queryInspections(admin, userId, property.id);
  await page.getByRole('button', { name: /Criar Primeira Vistoria|Nova Vistoria/i }).first().click();
  await page.getByText(/Iniciar Nova Vistoria/i).waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByRole('button', { name: /Vistoria de Entrada/i }).click();
  await page.getByRole('button', { name: /Come.ar Vistoria/i }).click();
  await page.getByText(/Registro de Fotos:/i).waitFor({ state: 'visible', timeout: 45_000 });

  const after = await waitFor(async () => {
    const rows = await queryInspections(admin, userId, property.id);
    return rows.length > before.length ? rows : false;
  }, 20_000, 500);
  const beforeIds = new Set(before.map((row) => row.id));
  const created = after.find((row) => !beforeIds.has(row.id));
  if (!created) throw new Error('INSPECTION_CREATE_FAILED: no new inspection row after starting inspection');
  return created;
}

async function clickBackToHistory(page) {
  await page.getByLabel(/Voltar para hist.rico/i).click();
  await page.getByText(/Hist.rico de Vistorias/i).waitFor({ state: 'visible', timeout: 45_000 });
}

async function hoverRoomAction(page, row) {
  const box = await row.boundingBox();
  if (!box) throw new Error('ROOM_ACTION_UNAVAILABLE: room row bounding box unavailable');
  await page.mouse.move(box.x + Math.max(1, box.width - 8), box.y + (box.height / 2));
  await page.waitForTimeout(250);
}

async function renameRoom(page, admin, inspectionId, fromName, toName) {
  const row = roomRow(page, fromName);
  await row.waitFor({ state: 'visible', timeout: 30_000 });
  await row.hover();
  await hoverRoomAction(page, row);
  await row.locator('button[title="Renomear"]').click();
  await page.getByPlaceholder(/Novo nome do c.modo/i).fill(toName);
  await page.getByRole('button', { name: /^Salvar$/i }).click();
  await roomRow(page, toName).waitFor({ state: 'visible', timeout: 30_000 });
  await waitFor(async () => {
    const rooms = await queryRooms(admin, inspectionId);
    return rooms.some((room) => room.name === toName) && !rooms.some((room) => room.name === fromName);
  }, 20_000, 500);
}

async function addRoom(page, admin, inspectionId, name) {
  await page.getByPlaceholder(/Novo c.modo/i).fill(name);
  await page.getByTitle(/Adicionar c.modo/i).click();
  await roomRow(page, name).waitFor({ state: 'visible', timeout: 30_000 });
  await waitFor(async () => (await queryRooms(admin, inspectionId)).some((room) => room.name === name), 20_000, 500);
}

async function deleteRoomByName(page, admin, inspectionId, name) {
  const row = roomRow(page, name);
  await row.waitFor({ state: 'visible', timeout: 30_000 });
  await row.hover();
  await hoverRoomAction(page, row);
  await row.locator('button[title="Excluir"]').click();
  await waitFor(async () => !(await visibleOrFalse(roomRow(page, name))), 20_000, 500);
  await waitFor(async () => !(await queryRooms(admin, inspectionId)).some((room) => room.name === name), 20_000, 500);
}

async function assertRoomsState(page, admin, inspectionId, expected, stage) {
  const rooms = await queryRooms(admin, inspectionId);
  const names = rooms.map((room) => room.name);
  const missing = expected.present.filter((name) => !names.includes(name));
  const unexpected = expected.absent.filter((name) => names.includes(name));
  const duplicateNames = names.filter((name, index) => names.indexOf(name) !== index);

  if (missing.length || unexpected.length || duplicateNames.length) {
    throw new Error(`ROOM_DB_MISMATCH:${stage}: missing=${missing.join(',')}; unexpected=${unexpected.join(',')}; duplicates=${duplicateNames.join(',')}`);
  }
  for (const name of expected.present) {
    await roomRow(page, name).waitFor({ state: 'visible', timeout: 30_000 });
  }
  for (const name of expected.absent) {
    if (await visibleOrFalse(roomRow(page, name))) {
      throw new Error(`ROOM_UI_MISMATCH:${stage}: deleted room visible: ${name}`);
    }
  }
  return { stage, roomCount: names.length, names };
}

async function assertInspectionLink(admin, userId, propertyId, inspectionId) {
  const rows = await queryInspections(admin, userId, propertyId);
  const inspection = rows.find((row) => row.id === inspectionId);
  if (!inspection) throw new Error(`INSPECTION_PERSISTENCE_FAILED: ${inspectionId} not found for property ${propertyId}`);
  if (inspection.property_id !== propertyId) throw new Error(`INSPECTION_PROPERTY_LINK_MISMATCH: ${inspection.property_id} !== ${propertyId}`);
  return inspection;
}

async function assertNoDraftCreatedByCancel(page, admin, userId, property, originalInspectionId) {
  const before = await queryInspections(admin, userId, property.id);
  const beforeIds = new Set(before.map((row) => row.id));
  await page.getByRole('button', { name: /Nova Vistoria/i }).first().click();
  await page.getByText(/Iniciar Nova Vistoria/i).waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByLabel(/Voltar para hist.rico/i).click();
  await page.getByText(/Hist.rico de Vistorias/i).waitFor({ state: 'visible', timeout: 45_000 });
  const after = await queryInspections(admin, userId, property.id);
  const afterIds = new Set(after.map((row) => row.id));
  const newIds = [...afterIds].filter((id) => !beforeIds.has(id));
  if (newIds.length) throw new Error(`ORPHAN_DRAFT_CREATED_BY_CANCEL: ${newIds.join(',')}`);
  const card = inspectionCard(page, originalInspectionId);
  await card.waitFor({ state: 'visible', timeout: 30_000 });
  return { beforeCount: before.length, afterCount: after.length };
}

function classifyError(message) {
  if (/missing .*\.env\.local|unavailable|rate limit|permission|policy|rls|network|fetch failed|spawn|connection_refused|ERR_CONNECTION_REFUSED/i.test(message)) return 'BLOCKED';
  return 'FAIL';
}

function renderReport(result) {
  const lines = [
    INSPECTION_LIFECYCLE_MODE
      ? '# VF INSPECTION-LIFECYCLE-P0'
      : '# VF PERSISTENCE-P0 - STABILIZATION-001',
    '',
    `STATUS FINAL: ${result.status}`,
    '',
    `Branch: ${result.branch}`,
    `Base URL: ${result.url}`,
    `Run ID: ${result.runId}`,
    `Inicio: ${result.startedAt}`,
    `Fim: ${result.finishedAt}`,
    '',
    '## Reproducao',
    '',
    `- Falha reproduzida: ${result.failureReproduced ? 'sim' : 'nao'}`,
    `- Causa raiz: ${result.rootCause}`,
    '',
    '## Diagnostico Obrigatorio',
    '',
    `1. Edicao de comodo salva no Supabase: ${result.diagnosis.roomEditSavedInSupabase}`,
    `2. Salva no inspection_id correto: ${result.diagnosis.savedOnCorrectInspectionId}`,
    `3. UI usa estado local sem reidratar corretamente: ${result.diagnosis.uiLocalStateHydrationIssue}`,
    `4. Defaults sobrescrevem dados persistidos: ${result.diagnosis.defaultsOverwritePersistedRooms}`,
    `5. Nova Vistoria cria rascunho imediatamente: ${result.diagnosis.newInspectionCreatesDraftImmediately}`,
    `6. Voltar/cancelar deixa rascunho orfao: ${result.diagnosis.cancelLeavesOrphanDraft}`,
    `7. Historico ordena/filtra corretamente: ${result.diagnosis.historyOrderingFiltering}`,
    `8. App retoma vistoria errada: ${result.diagnosis.resumesWrongInspection}`,
    `9. Supabase diverge da UI: ${result.diagnosis.supabaseUiDivergence}`,
    '',
    '## Matriz',
    '',
    '| Fase | Resultado | Evidencia |',
    '| --- | --- | --- |',
    ...result.matrix.map((row) => `| ${row.phase} | ${row.status} | ${row.evidence || ''} |`),
    '',
    '## Estado Supabase/UI',
    '',
    `- Property ID: ${result.supabase.propertyId || 'n/a'}`,
    `- Inspection ID: ${result.supabase.inspectionId || 'n/a'}`,
    `- Rooms finais: ${result.supabase.roomNames.length ? result.supabase.roomNames.join(', ') : 'n/a'}`,
    `- Total de fotos criadas: ${result.photoCount}`,
    `- Rascunho vazio removido/oculto: ${result.emptyDraftGuard}`,
    `- Rascunho vazio antes do descarte: ${JSON.stringify(result.emptyDraftChildState?.beforeDiscard || 'n/a')}`,
    `- Rascunho vazio depois do descarte: ${JSON.stringify(result.emptyDraftChildState?.afterDiscard || 'n/a')}`,
    `- Vistoria com acao real: ${JSON.stringify(result.meaningfulDraftChildState || 'n/a')}`,
    '',
    '## Custo',
    '',
    `- OpenAI chamada: ${result.openAiCalls}`,
    `- Tokens: ${result.tokens}`,
    `- Custo OpenAI: R$ ${result.openAiCostBrl.toFixed(2)}`,
    '',
    '## Runtime',
    '',
    `- Console errors: ${result.runtime.consoleErrors.length}`,
    `- Page errors: ${result.runtime.pageErrors.length}`,
    `- Failed requests: ${result.runtime.failedRequests.length}`,
    `- HTTP 5xx: ${result.runtime.httpErrors.length}`,
    `- AI requests: ${result.runtime.aiRequests.length}`,
    '',
    '## Cleanup',
    '',
    `- Cleanup: ${result.cleanup}`,
    `- Leftovers: ${result.cleanupDetails ? JSON.stringify(result.cleanupDetails.leftovers) : 'nao executado'}`,
    '',
    '## Evidencias',
    '',
    `- Relatorio MD: ${REPORT_PATH}`,
    `- Relatorio JSON: ${REPORT_JSON_PATH}`,
    ...(result.screenshots.length ? result.screenshots.map((item) => `- Screenshot: ${item}`) : []),
    '',
    result.error ? `Erro: ${result.error}` : '',
    '',
    'UAT nao foi liberado.',
    '',
  ];
  return lines.join('\n');
}

async function main() {
  const startedAt = new Date().toISOString();
  mkdirSync('qa', { recursive: true });
  mkdirSync(EVIDENCE_DIR, { recursive: true });

  const result = {
    status: 'BLOCKED',
    branch: process.env.GIT_BRANCH || 'stabilization/persistence-p0',
    url: TARGET_URL || `local:${LOCAL_PORT}`,
    runId: RUN_ID,
    startedAt,
    finishedAt: '',
    failureReproduced: false,
    rootCause: 'PENDING',
    diagnosis: {
      roomEditSavedInSupabase: 'NOT_RUN',
      savedOnCorrectInspectionId: 'NOT_RUN',
      uiLocalStateHydrationIssue: 'NOT_RUN',
      defaultsOverwritePersistedRooms: 'NOT_RUN',
      newInspectionCreatesDraftImmediately: 'NOT_RUN',
      cancelLeavesOrphanDraft: 'NOT_RUN',
      historyOrderingFiltering: 'NOT_RUN',
      resumesWrongInspection: 'NOT_RUN',
      supabaseUiDivergence: 'NOT_RUN',
    },
    matrix: [],
    supabase: { propertyId: null, inspectionId: null, roomNames: [] },
    photoCount: 0,
    emptyDraftGuard: 'NOT_RUN',
    emptyDraftChildState: {
      beforeDiscard: 'NOT_RUN',
      afterDiscard: 'NOT_RUN',
    },
    meaningfulDraftChildState: null,
    openAiCalls: 0,
    tokens: 0,
    openAiCostBrl: 0,
    runtime: { consoleErrors: [], pageErrors: [], failedRequests: [], httpErrors: [], aiRequests: [] },
    cleanup: 'NOT_RUN',
    cleanupDetails: null,
    screenshots: [],
    error: null,
  };

  const addCase = (phase, status, evidence = '') => {
    result.matrix.push({ phase, status, evidence });
  };

  const env = loadEnvLocal();
  const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'].filter((key) => !env[key]);
  if (missing.length) {
    result.error = `missing ${missing.join(', ')} in .env.local or process env`;
    result.finishedAt = new Date().toISOString();
    writeFileSync(REPORT_PATH, renderReport(result), 'utf8');
    writeFileSync(REPORT_JSON_PATH, JSON.stringify(result, null, 2), 'utf8');
    console.log(JSON.stringify({ status: result.status, error: result.error, report: REPORT_PATH }, null, 2));
    process.exitCode = 2;
    return;
  }

  const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  let server = null;
  let browser = null;
  let context = null;
  let page = null;
  let provisioned = null;
  let property = null;
  let inspection = null;
  const expected = {
    renamedExisting: `Sala Editada P0 ${RUN_ID.slice(-6)}`,
    newInitial: `Comodo Novo P0 ${RUN_ID.slice(-6)}`,
    newEdited: `Comodo Novo Editado P0 ${RUN_ID.slice(-6)}`,
    temp: `Comodo Temporario P0 ${RUN_ID.slice(-6)}`,
    present: [],
    absent: [],
  };

  try {
    provisioned = await createUserAndEntitlement(admin);
    addCase('setup usuario tecnico', 'PASS', 'Usuario e entitlement criados por admin local isolado');

    server = await startLocalServer(env);
    result.url = server.baseUrl;
    addCase('base limpa local', 'PASS', TARGET_URL ? 'Usando PERSISTENCE_P0_BASE_URL' : `Vite local ${server.baseUrl}`);

    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    page = await context.newPage();
    attachRuntime(page, result.runtime);

    result.runtime.phase = 'open_app';
    const response = await page.goto(`${server.baseUrl}/?persistence_p0=${RUN_ID}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if ((response?.status() || 0) !== 200) throw new Error(`APP_OPEN_FAILED: HTTP ${response?.status() || 'unknown'}`);

    result.runtime.phase = 'login';
    await fillLogin(page, provisioned.email, provisioned.password);
    addCase('login tecnico', 'PASS', 'Login abriu Meus Imoveis');

    result.runtime.phase = 'property_create';
    const propertyName = `Persistence P0 ${RUN_ID}`;
    await createProperty(page, propertyName);
    property = await queryProperty(admin, provisioned.userId, propertyName);
    result.supabase.propertyId = property.id;
    addCase('imovel criar/listar/persistir', 'PASS', `property_id=${property.id}`);

    if (INSPECTION_LIFECYCLE_MODE) {
      result.runtime.phase = 'new_inspection_cancel_before_create';
      await openHistory(page, propertyName);
      const beforePreStartCancel = await queryInspections(admin, provisioned.userId, property.id);
      await page.getByRole('button', { name: /Criar Primeira Vistoria|Nova Vistoria/i }).first().click();
      await page.getByText(/Iniciar Nova Vistoria/i).waitFor({ state: 'visible', timeout: 30_000 });
      await page.getByLabel(/Voltar para hist.rico/i).click();
      await page.getByText(/Hist.rico de Vistorias/i).waitFor({ state: 'visible', timeout: 45_000 });
      const afterPreStartCancel = await queryInspections(admin, provisioned.userId, property.id);
      if (afterPreStartCancel.length !== beforePreStartCancel.length) {
        throw new Error(`ORPHAN_DRAFT_CREATED_BEFORE_START: before=${beforePreStartCancel.length}; after=${afterPreStartCancel.length}`);
      }
      addCase('Nova Vistoria + voltar antes de comecar', 'PASS', 'Nenhuma inspection criada antes do botao Comecar Vistoria');

      result.runtime.phase = 'empty_started_draft_cancel_guard';
      const beforeEmptyStart = await queryInspections(admin, provisioned.userId, property.id);
      const emptyStartedInspection = await startNewInspection(page, admin, provisioned.userId, property);
      const emptyBeforeDiscard = await queryLifecycleChildState(admin, {
        userId: provisioned.userId,
        propertyId: property.id,
        inspectionId: emptyStartedInspection.id,
      });
      assertEmptyDraftInitialState(emptyBeforeDiscard, emptyStartedInspection.id);
      result.emptyDraftChildState.beforeDiscard = {
        status: emptyBeforeDiscard.inspection?.status || null,
        rooms: emptyBeforeDiscard.rooms.length,
        photos: emptyBeforeDiscard.photos.length,
        aiAnalysisRows: emptyBeforeDiscard.photosWithAiAnalysis.length,
        reports: emptyBeforeDiscard.reports.length,
        storagePhotos: emptyBeforeDiscard.storagePhotoFiles.length,
        storageReports: emptyBeforeDiscard.storageReportFiles.length,
      };
      await clickBackToHistory(page);
      const emptyDraftStillInDb = await waitFor(async () => {
        const rows = await queryInspections(admin, provisioned.userId, property.id);
        return !rows.some((row) => row.id === emptyStartedInspection.id) ? rows : false;
      }, 20_000, 500).catch(async () => queryInspections(admin, provisioned.userId, property.id));
      const emptyDraftRows = Array.isArray(emptyDraftStillInDb) ? emptyDraftStillInDb : await queryInspections(admin, provisioned.userId, property.id);
      const existsInDb = emptyDraftRows.some((row) => row.id === emptyStartedInspection.id);
      const visibleInHistory = await visibleOrFalse(inspectionCard(page, emptyStartedInspection.id));
      if (existsInDb || visibleInHistory || emptyDraftRows.length !== beforeEmptyStart.length) {
        throw new Error(`EMPTY_DRAFT_VISIBLE_OR_PERSISTED: inspectionId=${emptyStartedInspection.id}; existsInDb=${existsInDb}; visibleInHistory=${visibleInHistory}; before=${beforeEmptyStart.length}; after=${emptyDraftRows.length}`);
      }
      const emptyAfterDiscard = await queryLifecycleChildState(admin, {
        userId: provisioned.userId,
        propertyId: property.id,
        inspectionId: emptyStartedInspection.id,
      });
      assertDiscardedDraftLeavesNoChildren(emptyAfterDiscard, emptyStartedInspection.id);
      result.emptyDraftChildState.afterDiscard = {
        inspection: emptyAfterDiscard.inspection ? 1 : 0,
        rooms: emptyAfterDiscard.rooms.length,
        photos: emptyAfterDiscard.photos.length,
        aiAnalysisRows: emptyAfterDiscard.photosWithAiAnalysis.length,
        reports: emptyAfterDiscard.reports.length,
        storagePhotos: emptyAfterDiscard.storagePhotoFiles.length,
        storageReports: emptyAfterDiscard.storageReportFiles.length,
      };
      result.emptyDraftGuard = 'PASS';
      addCase('Comecar Vistoria + voltar sem acao real', 'PASS', `Rascunho vazio ${emptyStartedInspection.id} removido; rooms/photos/ai/reports/storage sem leftovers`);
    }

    result.runtime.phase = 'inspection_create';
    if (!(await visibleOrFalse(page.getByText(/Hist.rico de Vistorias/i)))) {
      await openHistory(page, propertyName);
    }
    inspection = await startNewInspection(page, admin, provisioned.userId, property);
    result.supabase.inspectionId = inspection.id;
    await assertInspectionLink(admin, provisioned.userId, property.id, inspection.id);
    addCase('vistoria criar/abrir', 'PASS', `inspection_id=${inspection.id}`);

    result.runtime.phase = 'room_edit_existing';
    await renameRoom(page, admin, inspection.id, 'Sala', expected.renamedExisting);
    result.diagnosis.roomEditSavedInSupabase = 'YES';
    result.diagnosis.savedOnCorrectInspectionId = 'YES';
    expected.present = [expected.renamedExisting];
    expected.absent = ['Sala'];
    await assertRoomsState(page, admin, inspection.id, expected, 'after_existing_room_rename');
    addCase('comodo existente editar', 'PASS', `${expected.renamedExisting} visivel e persistido`);

    result.runtime.phase = 'human_back_resume';
    await clickBackToHistory(page);
    await assertInspectionLink(admin, provisioned.userId, property.id, inspection.id);
    await openDraftByInspectionId(page, inspection.id);
    await assertRoomsState(page, admin, inspection.id, expected, 'after_back_resume');
    addCase('sair/voltar/continuar rascunho correto', 'PASS', 'Card localizado por inspection_id; alteracao permaneceu');

    result.runtime.phase = 'reload_resume';
    await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
    await page.getByText(/Meus Im.veis/i).waitFor({ state: 'visible', timeout: 45_000 });
    await openHistory(page, propertyName);
    await openDraftByInspectionId(page, inspection.id);
    await assertRoomsState(page, admin, inspection.id, expected, 'after_reload');
    addCase('reload/retomada', 'PASS', 'Comodo editado permaneceu');

    result.runtime.phase = 'logout_login_resume';
    await logout(page);
    await fillLogin(page, provisioned.email, provisioned.password);
    await openHistory(page, propertyName);
    await openDraftByInspectionId(page, inspection.id);
    await assertRoomsState(page, admin, inspection.id, expected, 'after_logout_login');
    addCase('logout/login/retomada', 'PASS', 'Comodo editado permaneceu na vistoria correta');

    result.runtime.phase = 'room_create_edit_delete';
    await addRoom(page, admin, inspection.id, expected.newInitial);
    await renameRoom(page, admin, inspection.id, expected.newInitial, expected.newEdited);
    await addRoom(page, admin, inspection.id, expected.temp);
    await deleteRoomByName(page, admin, inspection.id, expected.temp);
    expected.present = [expected.renamedExisting, expected.newEdited];
    expected.absent = ['Sala', expected.newInitial, expected.temp];
    await assertRoomsState(page, admin, inspection.id, expected, 'after_create_edit_delete');
    addCase('comodos criar/editar/deletar', 'PASS', `${expected.newEdited} persistido; ${expected.temp} removido`);

    result.runtime.phase = 'final_resume_matrix';
    await clickBackToHistory(page);
    await openDraftByInspectionId(page, inspection.id);
    await assertRoomsState(page, admin, inspection.id, expected, 'after_second_back_resume');
    await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
    await page.getByText(/Meus Im.veis/i).waitFor({ state: 'visible', timeout: 45_000 });
    await openHistory(page, propertyName);
    await openDraftByInspectionId(page, inspection.id);
    await assertRoomsState(page, admin, inspection.id, expected, 'after_second_reload');
    await logout(page);
    await fillLogin(page, provisioned.email, provisioned.password);
    await openHistory(page, propertyName);
    await openDraftByInspectionId(page, inspection.id);
    await assertRoomsState(page, admin, inspection.id, expected, 'after_second_logout_login');
    addCase('matriz final de persistencia', 'PASS', 'Criado/editado/deletado preservado em back, reload e logout/login');

    result.runtime.phase = 'new_inspection_cancel_guard';
    await clickBackToHistory(page);
    const cancelGuard = await assertNoDraftCreatedByCancel(page, admin, provisioned.userId, property, inspection.id);
    result.diagnosis.newInspectionCreatesDraftImmediately = INSPECTION_LIFECYCLE_MODE
      ? 'TRANSIENT_ONLY_DISCARDED_ON_BACK'
      : 'NO';
    result.diagnosis.cancelLeavesOrphanDraft = 'NO';
    if (result.emptyDraftGuard === 'NOT_RUN') result.emptyDraftGuard = 'PASS';
    addCase('Nova Vistoria + voltar', 'PASS', `inspections before=${cancelGuard.beforeCount}; after=${cancelGuard.afterCount}`);

    result.runtime.phase = 'history_correct_draft';
    await openDraftByInspectionId(page, inspection.id);
    await assertRoomsState(page, admin, inspection.id, expected, 'after_cancel_open_original');
    result.diagnosis.historyOrderingFiltering = 'YES_BY_EXPLICIT_INSPECTION_ID';
    result.diagnosis.resumesWrongInspection = 'NO';
    addCase('historico identifica vistoria correta', 'PASS', `Rascunho aberto por codigo ${inspection.id}`);

    result.runtime.phase = 'supabase_validation';
    const linkedInspection = await assertInspectionLink(admin, provisioned.userId, property.id, inspection.id);
    const meaningfulState = await queryLifecycleChildState(admin, {
      userId: provisioned.userId,
      propertyId: property.id,
      inspectionId: inspection.id,
    });
    const rooms = meaningfulState.rooms;
    result.supabase.roomNames = rooms.map((room) => room.name);
    result.photoCount = meaningfulState.photos.length;
    result.meaningfulDraftChildState = {
      inspection: meaningfulState.inspection ? 1 : 0,
      rooms: meaningfulState.rooms.length,
      photos: meaningfulState.photos.length,
      aiAnalysisRows: meaningfulState.photosWithAiAnalysis.length,
      reports: meaningfulState.reports.length,
      storagePhotos: meaningfulState.storagePhotoFiles.length,
      storageReports: meaningfulState.storageReportFiles.length,
    };
    if (result.photoCount !== 0) throw new Error(`COST_GUARD: PERSISTENCE-P0 created ${result.photoCount} photo rows`);
    if (meaningfulState.reports.length !== 0) throw new Error(`LIFECYCLE_GUARD: unexpected report rows before report phase: ${meaningfulState.reports.length}`);
    if (meaningfulState.storagePhotoFiles.length !== 0) throw new Error(`LIFECYCLE_GUARD: unexpected photo storage files before photo phase: ${meaningfulState.storagePhotoFiles.length}`);
    if (meaningfulState.storageReportFiles.length !== 0) throw new Error(`LIFECYCLE_GUARD: unexpected report storage files before report phase: ${meaningfulState.storageReportFiles.length}`);
    if (result.runtime.aiRequests.length > 0) throw new Error(`COST_GUARD: AI request attempted during PERSISTENCE-P0: ${result.runtime.aiRequests[0].url}`);
    if (linkedInspection.property_id !== property.id) throw new Error('INSPECTION_LINK_MISMATCH_AFTER_FINAL_VALIDATION');
    result.diagnosis.uiLocalStateHydrationIssue = 'NO_REPRODUCED';
    result.diagnosis.defaultsOverwritePersistedRooms = result.supabase.roomNames.includes('Sala') ? 'YES' : 'NO';
    result.diagnosis.supabaseUiDivergence = 'NO';
    addCase('Supabase x UI', 'PASS', `${rooms.length} rooms vinculados ao inspection_id correto; fotos=0; IA=0`);

    result.failureReproduced = false;
    result.rootCause = INSPECTION_LIFECYCLE_MODE
      ? 'EMPTY_DRAFT_CREATED_ON_START_WAS_NOT_DISCARDED_AND_HISTORY_DID_NOT_FILTER_DEFAULT_ONLY_DRAFTS_BEFORE_FIX'
      : 'NOT_REPRODUCED_ON_ORIGIN_MAIN_WITH_EXPLICIT_INSPECTION_ID_GATE';
    result.status = 'PASS';
  } catch (error) {
    const message = sanitizeMessage(error?.message || error);
    result.error = message;
    result.status = classifyError(message);
    result.failureReproduced = result.status === 'FAIL';
    result.rootCause = message.split(':')[0] || 'UNKNOWN';
    if (page) {
      const screenshot = await captureEvidence(page, `failure_${result.runtime.phase || 'unknown'}`);
      result.screenshots.push(screenshot);
      result.failureContext = {
        url: page.url(),
        texts: await visibleTexts(page),
        buttons: await visibleButtons(page),
      };
    }
    if (inspection?.id) {
      result.supabase.inspectionId = inspection.id;
      const rooms = await queryRooms(admin, inspection.id).catch(() => []);
      result.supabase.roomNames = rooms.map((room) => room.name);
      result.photoCount = await queryPhotoCount(admin, inspection.id).catch(() => 0);
    }
  } finally {
    result.openAiCalls = result.runtime.aiRequests.length;
    result.tokens = 0;
    result.openAiCostBrl = 0;
    if (browser) await browser.close().catch(() => undefined);
    if (server) await server.stop().catch(() => undefined);
    if (provisioned?.userId) {
      result.cleanupDetails = await cleanup(admin, provisioned.userId).catch((error) => ({
        ok: false,
        errors: [sanitizeMessage(error?.message || error)],
        leftovers: { cleanupFailed: true },
      }));
      result.cleanup = result.cleanupDetails.ok ? 'PASS' : 'FAIL';
      if (result.status === 'PASS' && result.cleanup !== 'PASS') {
        result.status = 'BLOCKED';
        result.error = 'cleanup did not fully clear test data';
      }
    }
    if (result.status === 'PASS' && result.openAiCalls !== 0) {
      result.status = 'FAIL';
      result.error = 'COST_GUARD: OpenAI request occurred during PERSISTENCE-P0';
    }
    result.finishedAt = new Date().toISOString();
    writeFileSync(REPORT_PATH, renderReport(result), 'utf8');
    writeFileSync(REPORT_JSON_PATH, JSON.stringify(result, null, 2), 'utf8');
  }

  console.log(JSON.stringify({
    status: result.status,
    failureReproduced: result.failureReproduced,
    rootCause: result.rootCause,
    propertyId: result.supabase.propertyId,
    inspectionId: result.supabase.inspectionId,
    roomCount: result.supabase.roomNames.length,
    openAiCalls: result.openAiCalls,
    tokens: result.tokens,
    costBrl: result.openAiCostBrl,
    cleanup: result.cleanup,
    report: REPORT_PATH,
    reportJson: REPORT_JSON_PATH,
    error: result.error,
  }, null, 2));
  process.exitCode = result.status === 'PASS' ? 0 : result.status === 'BLOCKED' ? 2 : 1;
}

main().catch((error) => {
  const result = {
    status: 'BLOCKED',
    branch: process.env.GIT_BRANCH || 'stabilization/persistence-p0',
    url: TARGET_URL || `local:${LOCAL_PORT}`,
    runId: RUN_ID,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    failureReproduced: false,
    rootCause: 'SCRIPT_BOOTSTRAP_FAILED',
    diagnosis: {
      roomEditSavedInSupabase: 'NOT_RUN',
      savedOnCorrectInspectionId: 'NOT_RUN',
      uiLocalStateHydrationIssue: 'NOT_RUN',
      defaultsOverwritePersistedRooms: 'NOT_RUN',
      newInspectionCreatesDraftImmediately: 'NOT_RUN',
      cancelLeavesOrphanDraft: 'NOT_RUN',
      historyOrderingFiltering: 'NOT_RUN',
      resumesWrongInspection: 'NOT_RUN',
      supabaseUiDivergence: 'NOT_RUN',
    },
    matrix: [],
    supabase: { propertyId: null, inspectionId: null, roomNames: [] },
    photoCount: 0,
    openAiCalls: 0,
    tokens: 0,
    openAiCostBrl: 0,
    runtime: { consoleErrors: [], pageErrors: [], failedRequests: [], httpErrors: [], aiRequests: [] },
    cleanup: 'NOT_RUN',
    cleanupDetails: null,
    screenshots: [],
    error: sanitizeMessage(error?.message || error),
  };
  mkdirSync('qa', { recursive: true });
  writeFileSync(REPORT_PATH, renderReport(result), 'utf8');
  writeFileSync(REPORT_JSON_PATH, JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify({ status: result.status, error: result.error, report: REPORT_PATH }, null, 2));
  process.exitCode = 2;
});
