import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const TARGET_URL = process.env.AI_SMOKE_BASE_URL || process.env.UAT_REAL_BASE_URL || 'https://glittery-boba-2b3367.netlify.app';
const REPORT_PATH = 'qa/vf_ia_001a_openai_smoke_20260626.md';
const BUCKET = 'inspection-photos';
const RUN_ID = `ia_smoke_${Date.now()}`;
const TEST_EMAIL = `e2e-ai-smoke-${RUN_ID}@vistoriafacilia.com`;
const TEST_PASSWORD = `AiSmoke-${RUN_ID}!`;

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
  if (/token|key|password|service_role|authorization|secret/i.test(text)) {
    return '[redacted sensitive message]';
  }
  return text.replace(/\s+/g, ' ').slice(0, 500);
}

function writeReport(result) {
  const lines = [
    '# IA-001A OpenAI Smoke Test - 2026-06-26',
    '',
    `STATUS FINAL: ${result.status}`,
    '',
    `URL testada: ${result.url}`,
    `Run ID: ${result.runId}`,
    `Inicio: ${result.startedAt}`,
    `Fim: ${result.finishedAt}`,
    '',
    '## Resultado funcional',
    '',
    `- Foto subiu: ${result.photoUploaded ? 'sim' : 'nao'}`,
    `- OpenAI chamada: ${result.openAiCalled ? 'sim' : 'nao'}`,
    `- Sugestao apareceu na UI: ${result.suggestionVisible ? 'sim' : 'nao'}`,
    `- Sugestao util para vistoria: ${result.suggestionUseful ? 'sim' : 'nao'}`,
    `- Fallback manual usado: ${result.usedFallback ? 'sim' : 'nao'}`,
    `- Modelo: ${result.model || 'nao informado'}`,
    `- Uso/custo estimado: ${result.usageSummary || 'nao disponivel'}`,
    `- Cleanup: ${result.cleanupOk ? 'sim' : 'nao'}`,
    '',
    '## Evidencia',
    '',
    `- Observacao sugerida: ${result.observation || 'nao disponivel'}`,
    `- Condicao sugerida: ${result.condition || 'nao disponivel'}`,
    `- Confianca: ${result.confidence || 'nao disponivel'}`,
    `- Bloqueio/erro: ${result.blocker || 'nenhum'}`,
    `- Console errors criticos: ${result.consoleErrors || 0}`,
    `- Requests criticos: ${result.failedRequests || 0}`,
    '',
    'UAT nao foi liberado automaticamente.',
    '',
  ];
  writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
}

async function visibleOrFalse(locator) {
  return locator.isVisible().catch(() => false);
}

async function pathExists(admin, path) {
  const parts = path.split('/');
  const fileName = parts.pop();
  const folder = parts.join('/');
  const listed = await admin.storage.from(BUCKET).list(folder, { limit: 100 });
  if (listed.error) throw new Error(`storage list failed: ${listed.error.message}`);
  return listed.data.some((entry) => entry.name === fileName);
}

async function createUserAndEntitlement(admin) {
  const user = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { testRunId: RUN_ID, purpose: 'ia_001a_openai_smoke' },
  });
  if (user.error || !user.data.user) {
    throw new Error(`admin create user failed: ${user.error?.message || 'no user'}`);
  }

  const plan = await admin
    .from('plans')
    .select('id,max_photos_per_inspection,pdf_enabled')
    .eq('id', 'free_10')
    .single();
  if (plan.error || !plan.data) throw new Error(`plan free_10 unavailable: ${plan.error?.message || 'missing'}`);

  const entitlement = await admin.from('entitlements').insert({
    id: `${user.data.user.id}_free_10_${RUN_ID}`,
    user_id: user.data.user.id,
    plan_id: plan.data.id,
    status: 'active',
    source: 'manual_admin',
    max_photos_per_inspection: plan.data.max_photos_per_inspection,
    pdf_enabled: plan.data.pdf_enabled,
  }).select('id').single();
  if (entitlement.error) throw new Error(`admin entitlement insert failed: ${entitlement.error.message}`);

  return { userId: user.data.user.id, email: TEST_EMAIL, password: TEST_PASSWORD };
}

async function cleanup(admin, userId) {
  const result = { ok: false, errors: [] };
  const photos = await admin.from('photos').select('id,storage_path').eq('user_id', userId);
  const storagePaths = photos.error ? [] : photos.data.map((row) => row.storage_path).filter(Boolean);
  if (storagePaths.length) {
    const res = await admin.storage.from(BUCKET).remove(storagePaths);
    if (res.error) result.errors.push(`storage remove: ${res.error.message}`);
  }

  const tables = ['photos', 'rooms', 'reports', 'inspections', 'properties', 'entitlements', 'events', 'profiles'];
  for (const table of tables) {
    const res = await admin.from(table).delete().eq(table === 'profiles' ? 'id' : 'user_id', userId);
    if (res.error) result.errors.push(`${table} delete: ${res.error.message}`);
  }
  const auth = await admin.auth.admin.deleteUser(userId);
  if (auth.error) result.errors.push(`auth user delete: ${auth.error.message}`);

  await new Promise((resolve) => setTimeout(resolve, 1000));
  const leftovers = [];
  for (const table of ['properties', 'inspections', 'rooms', 'photos', 'reports', 'entitlements', 'events']) {
    const res = await admin.from(table).select('id', { count: 'exact', head: true }).eq('user_id', userId);
    if (!res.error && (res.count || 0) > 0) leftovers.push(`${table}:${res.count}`);
  }
  for (const path of storagePaths) {
    if (await pathExists(admin, path).catch(() => true)) leftovers.push(`storage:${path}`);
  }
  result.ok = result.errors.length === 0 && leftovers.length === 0;
  result.leftovers = leftovers;
  return result;
}

async function login(page, email, password) {
  await page.getByRole('button', { name: /^Entrar$/i }).first().click().catch(() => undefined);
  await page.getByLabel(/^E-mail$/i).fill(email);
  await page.getByLabel(/^Senha$/i).fill(password);
  await page.getByRole('button', { name: /^Entrar$/i }).last().click();
  await page.getByText(/Meus Im.veis/i).waitFor({ state: 'visible', timeout: 45_000 });
}

async function createInspectionWithOnePhoto(page, photoPath) {
  await page.getByRole('button', { name: /Cadastrar/i }).first().click();
  const inputs = page.locator('form input');
  await inputs.nth(0).fill(`IA Smoke ${RUN_ID}`);
  await inputs.nth(1).fill('01001-000');
  await inputs.nth(2).fill('SP');
  await inputs.nth(3).fill(`Rua IA Smoke ${RUN_ID}`);
  await inputs.nth(4).fill('101');
  await inputs.nth(5).fill('Apto smoke');
  await inputs.nth(6).fill('Centro');
  await inputs.nth(7).fill('Sao Paulo');
  await inputs.nth(8).fill(`Referencia IA ${RUN_ID}`);
  await page.locator('form textarea').fill(`Imovel de teste IA ${RUN_ID}`);
  await page.getByRole('button', { name: /Salvar Im.vel/i }).click();
  await page.locator('[data-testid^="property-card-"]').filter({ hasText: `IA Smoke ${RUN_ID}` }).first().waitFor({ state: 'visible', timeout: 45_000 });

  await page.locator('[data-testid^="property-card-"]').filter({ hasText: `IA Smoke ${RUN_ID}` }).getByRole('button', { name: /Nova Vistoria/i }).click();
  await page.getByText(/Iniciar Nova Vistoria/i).waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByRole('button', { name: /Vistoria de Entrada/i }).click();
  await page.getByRole('button', { name: /Come.ar Vistoria/i }).click();
  await page.getByText(/Registro de Fotos:/i).waitFor({ state: 'visible', timeout: 45_000 });

  await page.locator('input[type="file"]').last().setInputFiles(photoPath);
}

function usageSummary(photoRow) {
  const usage = photoRow?.ai_analysis?.openai?.usage;
  if (!usage || typeof usage !== 'object') return 'nao disponivel';
  const parts = [];
  if (usage.input_tokens !== undefined) parts.push(`input_tokens=${usage.input_tokens}`);
  if (usage.output_tokens !== undefined) parts.push(`output_tokens=${usage.output_tokens}`);
  if (usage.total_tokens !== undefined) parts.push(`total_tokens=${usage.total_tokens}`);
  return parts.length ? parts.join(', ') : 'usage retornado sem totais';
}

async function main() {
  const result = {
    status: 'BLOCKED',
    url: TARGET_URL,
    runId: RUN_ID,
    startedAt: new Date().toISOString(),
    finishedAt: '',
    photoUploaded: false,
    openAiCalled: false,
    suggestionVisible: false,
    suggestionUseful: false,
    usedFallback: false,
    cleanupOk: false,
    consoleErrors: 0,
    failedRequests: 0,
  };

  const env = loadEnvLocal();
  const supabaseUrl = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const photoPath = process.env.AI_SMOKE_PHOTO_PATH;

  if (!photoPath || !existsSync(photoPath)) {
    result.blocker = 'AI_SMOKE_PHOTO_PATH ausente ou invalido; e necessaria uma foto real local para IA-001A.';
    result.finishedAt = new Date().toISOString();
    writeReport(result);
    console.log(JSON.stringify({ status: result.status, blocker: result.blocker, report: REPORT_PATH }, null, 2));
    process.exit(2);
  }
  if (!supabaseUrl || !serviceRole) {
    result.blocker = 'SUPABASE service role local ausente para setup/cleanup seguro do smoke.';
    result.finishedAt = new Date().toISOString();
    writeReport(result);
    console.log(JSON.stringify({ status: result.status, blocker: result.blocker, report: REPORT_PATH }, null, 2));
    process.exit(2);
  }

  const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  let user;
  let browser;
  try {
    user = await createUserAndEntitlement(admin);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const runtime = { consoleErrors: [], failedRequests: [] };
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !/invalid login credentials/i.test(msg.text())) {
        runtime.consoleErrors.push(sanitizeMessage(msg.text()));
      }
    });
    page.on('requestfailed', (request) => {
      runtime.failedRequests.push(sanitizeMessage(request.failure()?.errorText || 'request failed'));
    });

    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await login(page, user.email, user.password);
    await createInspectionWithOnePhoto(page, photoPath);

    const aiPanel = page.locator('[data-testid^="photo-ai-completed-"]').first();
    const fallbackPanel = page.locator('[data-testid^="photo-ai-fallback-"]').first();
    await Promise.race([
      aiPanel.waitFor({ state: 'visible', timeout: 120_000 }),
      fallbackPanel.waitFor({ state: 'visible', timeout: 120_000 }),
    ]);

    result.suggestionVisible = await visibleOrFalse(aiPanel);
    result.usedFallback = await visibleOrFalse(fallbackPanel);
    result.photoUploaded = await visibleOrFalse(page.locator('[data-testid^="photo-card-"]').first());

    const photos = await admin
      .from('photos')
      .select('id,analysis_status,ai_analysis,description,description_suggested,fallback_applied,condition_suggested')
      .eq('user_id', user.userId);
    if (photos.error) throw new Error(`photo verification failed: ${photos.error.message}`);
    const row = photos.data.find((item) => item.analysis_status === 'completed' && item.ai_analysis);
    result.openAiCalled = Boolean(row);
    result.observation = row?.description_suggested || row?.description || row?.ai_analysis?.descricao_neutra || '';
    result.condition = row?.condition_suggested || row?.ai_analysis?.condicao_sugerida || '';
    result.confidence = row?.ai_analysis?.confianca || '';
    result.model = row?.ai_analysis?.openai?.model || '';
    result.usageSummary = usageSummary(row);
    result.suggestionUseful = Boolean(result.observation && result.observation.length >= 20 && !/fallback|nao pode|manual/i.test(result.observation));

    result.consoleErrors = runtime.consoleErrors.length;
    result.failedRequests = runtime.failedRequests.length;

    if (!result.openAiCalled) {
      result.status = 'BLOCKED';
      result.blocker = result.usedFallback ? 'OpenAI nao retornou analise; UI caiu em fallback.' : 'Analise OpenAI nao foi encontrada.';
    } else if (!result.suggestionVisible || !result.suggestionUseful || result.usedFallback) {
      result.status = 'FAIL';
      result.blocker = 'Sugestao IA nao ficou util/visivel ou fallback foi usado.';
    } else {
      result.status = 'PASS';
    }
  } catch (error) {
    const message = sanitizeMessage(error?.message || error);
    result.status = /openai_api_key_missing|quota|billing|permission|401|403|429|model/i.test(message)
      ? 'BLOCKED'
      : 'FAIL';
    result.blocker = message;
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (user?.userId) {
      const cleanupResult = await cleanup(admin, user.userId).catch((error) => ({ ok: false, errors: [sanitizeMessage(error?.message || error)] }));
      result.cleanupOk = cleanupResult.ok;
      if (!cleanupResult.ok && result.status === 'PASS') {
        result.status = 'FAIL';
        result.blocker = `cleanup failed: ${(cleanupResult.errors || []).join('; ')}`;
      }
    }
    result.finishedAt = new Date().toISOString();
    writeReport(result);
  }

  console.log(JSON.stringify({
    status: result.status,
    url: result.url,
    photoUploaded: result.photoUploaded,
    openAiCalled: result.openAiCalled,
    suggestionVisible: result.suggestionVisible,
    suggestionUseful: result.suggestionUseful,
    usedFallback: result.usedFallback,
    usageSummary: result.usageSummary || 'nao disponivel',
    cleanupOk: result.cleanupOk,
    blocker: result.blocker || null,
    report: REPORT_PATH,
  }, null, 2));

  process.exit(result.status === 'PASS' ? 0 : 2);
}

main().catch((error) => {
  const result = {
    status: 'FAIL',
    url: TARGET_URL,
    runId: RUN_ID,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    blocker: sanitizeMessage(error?.message || error),
  };
  writeReport(result);
  console.log(JSON.stringify({ status: result.status, blocker: result.blocker, report: REPORT_PATH }, null, 2));
  process.exit(1);
});
