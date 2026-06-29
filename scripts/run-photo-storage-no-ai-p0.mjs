#!/usr/bin/env node

import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const TARGET_URL = process.env.PHOTO_STORAGE_NO_AI_BASE_URL || process.env.UAT_REAL_BASE_URL || 'https://glittery-boba-2b3367.netlify.app';
const REPORT_PATH = 'qa/vf_photo_storage_no_ai_p0_20260627.md';
const REPORT_JSON_PATH = 'qa/vf_photo_storage_no_ai_p0_20260627.json';
const EVIDENCE_DIR = 'test-results/photo-storage-no-ai-p0';
const BUCKET = 'inspection-photos';
const RUN_ID = `photo_no_ai_${Date.now()}`;
const TEST_EMAIL = `e2e-photo-no-ai-${RUN_ID}@vistoriafacilia.com`;
const TEST_PASSWORD = `PhotoNoAi-${RUN_ID}!`;
const SYNTHETIC_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
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

function runtimeEnv() {
  return { ...loadEnvLocal(), ...process.env };
}

function sanitize(value) {
  const text = String(value || '').replace(/\u001b\[[0-9;]*m/g, '');
  if (/token|key|password|service_role|authorization|secret/i.test(text)) return '[redacted sensitive message]';
  return text.replace(/\s+/g, ' ').slice(0, 900);
}

function addCase(result, phase, caso, esperado, status, evidencia = '') {
  result.matrix.push({ phase, caso, esperado, status, evidencia });
}

async function visibleOrFalse(locator) {
  return locator.isVisible().catch(() => false);
}

async function capture(page, name) {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const file = path.join(EVIDENCE_DIR, `${RUN_ID}_${name}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => undefined);
  return file;
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
    return sanitize(url);
  }
}

async function login(page, email, password) {
  await page.getByRole('button', { name: /^Entrar$/i }).first().click().catch(() => undefined);
  await page.getByLabel(/^E-mail$/i).fill(email);
  await page.getByLabel(/^Senha$/i).fill(password);
  await page.getByRole('button', { name: /^Entrar$/i }).last().click();
  await page.getByText(/Meus Im.veis/i).waitFor({ state: 'visible', timeout: 45_000 });
}

async function logout(page) {
  await page.getByRole('button', { name: /Sair/i }).click();
  await page.getByRole('button', { name: /^Entrar$/i }).first().waitFor({ state: 'visible', timeout: 45_000 });
}

async function createUserAndEntitlement(admin) {
  const user = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { testRunId: RUN_ID, purpose: 'photo_storage_no_ai_p0' },
  });
  if (user.error || !user.data.user) throw new Error(`admin create user failed: ${user.error?.message || 'no user'}`);

  const plan = await admin
    .from('plans')
    .select('id,max_photos_per_inspection,pdf_enabled')
    .in('id', ['free_10', 'beta_paid_4990'])
    .order('max_photos_per_inspection', { ascending: false })
    .limit(1)
    .single();
  if (plan.error || !plan.data) throw new Error(`plan query failed: ${plan.error?.message || 'missing plan'}`);

  const entitlement = await admin.from('entitlements').upsert({
    id: `${user.data.user.id}_photo_no_ai_${RUN_ID}`,
    user_id: user.data.user.id,
    plan_id: plan.data.id,
    status: 'active',
    max_photos_per_inspection: plan.data.max_photos_per_inspection,
    pdf_enabled: plan.data.pdf_enabled,
    payment_required: false,
  }).select().single();
  if (entitlement.error) throw new Error(`admin entitlement insert failed: ${entitlement.error.message}`);

  return { userId: user.data.user.id, email: TEST_EMAIL, password: TEST_PASSWORD };
}

async function createProperty(page, name) {
  await page.getByRole('button', { name: /Cadastrar/i }).first().click();
  const inputs = page.locator('form input');
  await inputs.nth(0).fill(name);
  await inputs.nth(1).fill('01001-000');
  await inputs.nth(2).fill('SP');
  await inputs.nth(3).fill(`Rua Foto No IA ${RUN_ID}`);
  await inputs.nth(4).fill('101');
  await inputs.nth(5).fill('Gate foto sem IA');
  await inputs.nth(6).fill('Centro');
  await inputs.nth(7).fill('Sao Paulo');
  await inputs.nth(8).fill(`Referencia ${RUN_ID}`);
  await page.locator('form textarea').fill(`Gate photo-storage-no-ai-p0 ${RUN_ID}`);
  await page.getByRole('button', { name: /Salvar Im.vel/i }).click();
  await page.locator('[data-testid^="property-card-"]').filter({ hasText: name }).first().waitFor({ state: 'visible', timeout: 45_000 });
}

async function openHistory(page, propertyName) {
  await page.getByText(/Meus Im.veis/i).waitFor({ state: 'visible', timeout: 45_000 });
  await page.locator('[data-testid^="property-card-"]').filter({ hasText: propertyName }).getByRole('button', { name: /Hist.rico/i }).click();
  await page.getByText(/Hist.rico de Vistorias/i).waitFor({ state: 'visible', timeout: 45_000 });
}

async function startInspection(page) {
  await page.getByRole('button', { name: /Criar Primeira Vistoria|Nova Vistoria/i }).first().click();
  await page.getByText(/Iniciar Nova Vistoria/i).waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByRole('button', { name: /Vistoria de Entrada/i }).click();
  await page.getByRole('button', { name: /Come.ar Vistoria/i }).click();
  await page.getByRole('button', { name: /Concluir.*Revisar/i }).waitFor({ state: 'visible', timeout: 45_000 });
  await page.getByText(/Registro de Fotos:/i).waitFor({ state: 'visible', timeout: 45_000 });
}

async function pathExists(admin, storagePath) {
  if (!storagePath) return false;
  const parts = storagePath.split('/');
  const fileName = parts.pop();
  const folder = parts.join('/');
  const listed = await admin.storage.from(BUCKET).list(folder, { limit: 1000 });
  if (listed.error) throw new Error(`storage list failed: ${listed.error.message}`);
  return listed.data.some((entry) => entry.name === fileName);
}

async function waitForPhotoRow(admin, inspectionId, beforeIds) {
  const started = Date.now();
  while (Date.now() - started < 45_000) {
    const photos = await admin.from('photos').select('*').eq('inspection_id', inspectionId).order('created_at', { ascending: true });
    if (photos.error) throw new Error(`photos query failed: ${photos.error.message}`);
    const created = (photos.data || []).find((photo) => !beforeIds.has(photo.id));
    if (created) return created;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('PHOTO_ROW_NOT_CREATED');
}

async function collectStoragePaths(admin, userId) {
  const paths = [];
  const photos = await admin.from('photos').select('storage_path').eq('user_id', userId);
  if (!photos.error) paths.push(...(photos.data || []).map((row) => row.storage_path).filter(Boolean));
  const reports = await admin.from('reports').select('storage_path').eq('user_id', userId);
  if (!reports.error) paths.push(...(reports.data || []).map((row) => row.storage_path).filter(Boolean));
  return [...new Set(paths)];
}

async function cleanup(admin, userId) {
  const result = { ok: false, errors: [], leftovers: {}, storagePaths: [] };
  const storagePaths = await collectStoragePaths(admin, userId).catch((error) => {
    result.errors.push(`collect storage paths: ${sanitize(error.message)}`);
    return [];
  });
  result.storagePaths = storagePaths;
  if (storagePaths.length) {
    const removed = await admin.storage.from(BUCKET).remove(storagePaths);
    if (removed.error) result.errors.push(`storage remove: ${removed.error.message}`);
  }
  for (const table of ['photos', 'rooms', 'reports', 'inspections', 'properties', 'entitlements', 'events']) {
    const res = await admin.from(table).delete().eq('user_id', userId);
    if (res.error) result.errors.push(`${table} delete: ${res.error.message}`);
  }
  const profile = await admin.from('profiles').delete().eq('id', userId);
  if (profile.error) result.errors.push(`profiles delete: ${profile.error.message}`);
  const auth = await admin.auth.admin.deleteUser(userId);
  if (auth.error) result.errors.push(`auth delete: ${auth.error.message}`);

  for (const table of ['properties', 'inspections', 'rooms', 'photos', 'reports', 'entitlements', 'events']) {
    const count = await admin.from(table).select('id', { count: 'exact', head: true }).eq('user_id', userId);
    result.leftovers[table] = count.error ? `count_error: ${count.error.message}` : (count.count || 0);
  }
  for (const storagePath of storagePaths) {
    result.leftovers[`storage:${storagePath}`] = await pathExists(admin, storagePath).catch((error) => `list_error: ${sanitize(error.message)}`);
  }
  result.ok = result.errors.length === 0 && Object.values(result.leftovers).every((value) => value === 0 || value === false);
  return result;
}

function renderReport(result) {
  const lines = [
    '# VF Photo Storage No-IA P0 - 2026-06-27',
    '',
    `Status: ${result.status}`,
    '',
    '## Summary',
    `- URL: ${TARGET_URL}`,
    `- OpenAI/IA requests observed: ${result.aiRequests.length}`,
    `- Cost OpenAI: R$ ${result.openAiCostBrl.toFixed(2)}`,
    `- Property ID: ${result.propertyId || 'not captured'}`,
    `- Inspection ID: ${result.inspectionId || 'not captured'}`,
    `- Room ID: ${result.roomId || 'not captured'}`,
    `- Photo ID: ${result.photoId || 'not captured'}`,
    `- Storage path: ${result.storagePath || 'not captured'}`,
    `- Delete UI: ${result.deleteUiStatus || 'not evaluated'}`,
    `- Cleanup: ${result.cleanupOk ? 'PASS' : 'FAIL'}`,
    '',
    '## Matrix',
    '',
    '| Phase | Case | Expected | Status | Evidence |',
    '| --- | --- | --- | --- | --- |',
    ...result.matrix.map((row) => `| ${row.phase} | ${row.caso} | ${row.esperado} | ${row.status} | ${row.evidencia || ''} |`),
    '',
    '## AI Requests',
    ...(
      result.aiRequests.length
        ? result.aiRequests.map((item) => `- ${item.phase}: ${item.url}`)
        : ['- none']
    ),
    '',
    '## Screenshots',
    ...result.screenshots.map((file) => `- ${file}`),
    '',
  ];
  return lines.join('\n');
}

async function main() {
  const result = {
    status: 'FAIL_CORE',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    matrix: [],
    screenshots: [],
    aiRequests: [],
    openAiCostBrl: 0,
    propertyId: '',
    inspectionId: '',
    roomId: '',
    photoId: '',
    storagePath: '',
    deleteUiStatus: '',
    cleanupOk: false,
    cleanupDetails: null,
    error: null,
  };

  const env = runtimeEnv();
  const missing = ['VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((key) => !env[key]);
  if (missing.length) {
    result.status = 'BLOCKED_ENV';
    result.error = `missing ${missing.join(', ')}`;
    addCase(result, '0', 'Environment', 'Required Supabase admin configuration is available without printing values', 'BLOCKED_ENV', result.error);
    mkdirSync('qa', { recursive: true });
    writeFileSync(REPORT_PATH, renderReport(result), 'utf8');
    writeFileSync(REPORT_JSON_PATH, JSON.stringify(result, null, 2), 'utf8');
    console.log(JSON.stringify({ status: result.status, error: result.error, report: REPORT_PATH }, null, 2));
    process.exitCode = 2;
    return;
  }

  const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let browser = null;
  let provisioned = null;
  try {
    provisioned = await createUserAndEntitlement(admin);
    const propertyName = `Foto sem IA ${RUN_ID}`;

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    let phase = 'init';
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (isAiRequestUrl(url)) {
        result.aiRequests.push({ phase, url: redactUrl(url) });
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });
    page.on('pageerror', (error) => {
      result.matrix.push({ phase, caso: 'Page error', esperado: 'No critical page error', status: 'FAIL', evidencia: sanitize(error.message) });
    });

    phase = 'login';
    const response = await page.goto(`${TARGET_URL}/?photo_no_ai=${RUN_ID}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (!response || response.status() >= 400) throw new Error(`PUBLIC_URL_HTTP_${response?.status() || 'NO_RESPONSE'}`);
    await login(page, provisioned.email, provisioned.password);
    addCase(result, '1', 'Auth', 'Login tecnico no app publico', 'PASS', 'Meus Imoveis visible');

    phase = 'property';
    await createProperty(page, propertyName);
    const property = await admin.from('properties').select('*').eq('user_id', provisioned.userId).eq('name', propertyName).single();
    if (property.error || !property.data?.id) throw new Error(`PROPERTY_NOT_PERSISTED: ${property.error?.message || 'missing'}`);
    result.propertyId = property.data.id;
    addCase(result, '2', 'Property', 'Criar imovel e validar Supabase', 'PASS', result.propertyId);

    phase = 'inspection';
    await openHistory(page, propertyName);
    await startInspection(page);
    const inspection = await admin.from('inspections').select('*').eq('user_id', provisioned.userId).eq('property_id', result.propertyId).order('started_at', { ascending: false }).limit(1).single();
    if (inspection.error || !inspection.data?.id) throw new Error(`INSPECTION_NOT_PERSISTED: ${inspection.error?.message || 'missing'}`);
    result.inspectionId = inspection.data.id;
    const room = await admin.from('rooms').select('*').eq('inspection_id', result.inspectionId).order('display_order', { ascending: true }).limit(1).single();
    if (room.error || !room.data?.id) throw new Error(`ROOM_NOT_PERSISTED: ${room.error?.message || 'missing'}`);
    result.roomId = room.data.id;
    addCase(result, '3', 'Inspection/room links', 'Vistoria e comodo persistidos com property_id/inspection_id/user_id corretos', 'PASS', `inspection=${result.inspectionId}; room=${result.roomId}`);

    phase = 'privacy_guard';
    await page.getByTestId('privacy-ai-upload-guard').waitFor({ state: 'visible', timeout: 30_000 });
    const uploadDisabledBefore = await page.getByTestId('privacy-gallery-upload-button').isDisabled().catch(() => false);
    if (!uploadDisabledBefore) throw new Error('PRIVACY_GUARD_UPLOAD_NOT_BLOCKED_BEFORE_CONSENT');
    await page.getByTestId('privacy-ai-upload-checkbox').check();
    addCase(result, '4', 'Privacy Guard', 'Upload bloqueado antes do aceite e liberado apos checkbox', 'PASS', 'privacy-ai-upload-checkbox checked');

    phase = 'photo_upload_no_ai';
    const beforePhotos = await admin.from('photos').select('id').eq('inspection_id', result.inspectionId);
    if (beforePhotos.error) throw new Error(`PHOTOS_BEFORE_QUERY_FAILED: ${beforePhotos.error.message}`);
    const beforeIds = new Set((beforePhotos.data || []).map((photo) => photo.id));
    await page.getByTestId('privacy-gallery-file-input').setInputFiles({
      name: `photo-no-ai-${RUN_ID}.png`,
      mimeType: 'image/png',
      buffer: SYNTHETIC_IMAGE,
    });
    await page.locator('[data-testid^="photo-card-"]').first().waitFor({ state: 'visible', timeout: 60_000 });
    await page.waitForTimeout(2500);
    if (result.aiRequests.length > 0) {
      throw new Error(`COST_GUARD_AI_REQUEST_DETECTED: ${result.aiRequests.map((item) => item.url).join(', ')}`);
    }

    const photo = await waitForPhotoRow(admin, result.inspectionId, beforeIds);
    result.photoId = photo.id;
    result.storagePath = photo.storage_path || '';
    if (!result.storagePath) throw new Error('PHOTO_STORAGE_PATH_MISSING');
    if (photo.user_id !== provisioned.userId) throw new Error('PHOTO_USER_ID_MISMATCH');
    if (photo.inspection_id !== result.inspectionId) throw new Error('PHOTO_INSPECTION_ID_MISMATCH');
    if (photo.room_id !== result.roomId) throw new Error('PHOTO_ROOM_ID_MISMATCH');
    if (!(await pathExists(admin, result.storagePath))) throw new Error('PHOTO_STORAGE_OBJECT_MISSING');
    addCase(result, '5', 'Upload/link/storage', 'Foto criada, listada e vinculada a user_id/property_id/inspection_id/room_id/storage_path', 'PASS', `photo=${result.photoId}; storage=${result.storagePath}`);

    phase = 'reopen_reload';
    await page.getByLabel(/Voltar para hist.rico/i).click();
    await page.getByRole('button', { name: /Continuar Rascunho/i }).first().click();
    await page.locator(`[data-testid="photo-card-${result.photoId}"]`).waitFor({ state: 'visible', timeout: 45_000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator(`[data-testid="photo-card-${result.photoId}"]`).waitFor({ state: 'visible', timeout: 45_000 });
    addCase(result, '6', 'Reopen/reload', 'Foto reaparece ao sair/reabrir e apos reload', 'PASS', result.photoId);

    phase = 'logout_login';
    await page.getByLabel(/Voltar para hist.rico/i).click().catch(() => undefined);
    await page.getByText(/Hist.rico de Vistorias/i).waitFor({ state: 'visible', timeout: 30_000 }).catch(() => undefined);
    await page.getByLabel(/Voltar para im.veis/i).click().catch(() => undefined);
    await logout(page);
    await login(page, provisioned.email, provisioned.password);
    await openHistory(page, propertyName);
    await page.getByRole('button', { name: /Continuar Rascunho/i }).first().click();
    await page.locator(`[data-testid="photo-card-${result.photoId}"]`).waitFor({ state: 'visible', timeout: 45_000 });
    addCase(result, '7', 'Logout/login', 'Foto persiste apos logout/login e reabertura por historico', 'PASS', result.photoId);

    phase = 'delete';
    const deleteButton = page.getByTestId(`photo-delete-${result.photoId}`);
    if (await visibleOrFalse(deleteButton)) {
      await deleteButton.click();
      await page.locator(`[data-testid="photo-card-${result.photoId}"]`).waitFor({ state: 'detached', timeout: 30_000 });
      const afterDelete = await admin.from('photos').select('id').eq('id', result.photoId).maybeSingle();
      if (afterDelete.error) throw new Error(`PHOTO_DELETE_VERIFY_FAILED: ${afterDelete.error.message}`);
      if (afterDelete.data) throw new Error('PHOTO_REAPPEARED_AFTER_DELETE');
      if (await pathExists(admin, result.storagePath)) throw new Error('STORAGE_OBJECT_REAPPEARED_AFTER_DELETE');
      result.deleteUiStatus = 'PASS';
      addCase(result, '8', 'Delete UI', 'Excluir foto pela UI remove linha e arquivo Storage sem reaparecimento', 'PASS', result.photoId);
    } else {
      result.deleteUiStatus = 'GAP_PRODUCT_DECISION';
      addCase(result, '8', 'Delete UI', 'Se delete nao existir, registrar GAP_PRODUCT_DECISION e exigir cleanup admin', 'GAP_PRODUCT_DECISION', 'photo delete button not visible');
    }

    if (result.aiRequests.length > 0) throw new Error(`COST_GUARD_AI_REQUEST_DETECTED_AFTER_DELETE: ${result.aiRequests.length}`);
    result.status = result.deleteUiStatus === 'GAP_PRODUCT_DECISION' ? 'PASS_WITH_GAP_PRODUCT_DECISION' : 'PASS';
  } catch (error) {
    const message = sanitize(error?.message || error);
    result.error = message;
    if (/COST_GUARD|AI_REQUEST/i.test(message)) result.status = 'COST_GUARD';
    else if (/missing|BLOCKED|ENV|permission|rate limit|supabase|storage/i.test(message)) result.status = 'BLOCKED_ENV';
    else result.status = 'FAIL_CORE';
    result.screenshots.push(browser ? await capture((await browser.contexts()[0]?.pages()?.[0]) || null, 'failure').catch(() => 'screenshot_failed') : 'browser_not_started');
    addCase(result, 'X', 'Failure', 'Gate must stop on P0/cost/env failure', result.status, message);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (provisioned?.userId) {
      result.cleanupDetails = await cleanup(admin, provisioned.userId).catch((error) => ({ ok: false, errors: [sanitize(error?.message || error)], leftovers: { cleanupFailed: true } }));
      result.cleanupOk = result.cleanupDetails.ok;
      addCase(result, '9', 'Cleanup', 'Remover fotos, Storage, registros e usuario de teste', result.cleanupOk ? 'PASS' : 'FAIL', result.cleanupOk ? 'Sem leftovers' : JSON.stringify(result.cleanupDetails.errors));
      if ((result.status === 'PASS' || result.status === 'PASS_WITH_GAP_PRODUCT_DECISION') && !result.cleanupOk) result.status = 'FAIL_CORE';
    }
    result.finishedAt = new Date().toISOString();
    mkdirSync('qa', { recursive: true });
    writeFileSync(REPORT_PATH, renderReport(result), 'utf8');
    writeFileSync(REPORT_JSON_PATH, JSON.stringify(result, null, 2), 'utf8');
  }

  console.log(JSON.stringify({
    status: result.status,
    openAiRequests: result.aiRequests.length,
    cleanupOk: result.cleanupOk,
    deleteUiStatus: result.deleteUiStatus,
    report: REPORT_PATH,
    reportJson: REPORT_JSON_PATH,
    error: result.error,
  }, null, 2));

  process.exitCode = (result.status === 'PASS' || result.status === 'PASS_WITH_GAP_PRODUCT_DECISION') ? 0 : result.status === 'BLOCKED_ENV' || result.status === 'COST_GUARD' ? 2 : 1;
}

main().catch((error) => {
  const result = {
    status: 'FAIL_CORE',
    error: sanitize(error?.message || error),
    aiRequests: [],
    matrix: [{ phase: 'fatal', caso: 'Unhandled error', esperado: 'No unhandled error', status: 'FAIL_CORE', evidencia: sanitize(error?.message || error) }],
    screenshots: [],
    openAiCostBrl: 0,
    cleanupOk: false,
  };
  mkdirSync('qa', { recursive: true });
  writeFileSync(REPORT_PATH, renderReport(result), 'utf8');
  writeFileSync(REPORT_JSON_PATH, JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify({ status: result.status, error: result.error, report: REPORT_PATH }, null, 2));
  process.exitCode = 1;
});
