import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const TARGET_URL = process.env.REPORT_DIAGNOSTIC_BASE_URL || process.env.UAT_AI_CONTROLLED_BASE_URL || 'https://glittery-boba-2b3367.netlify.app';
const REPORT_PATH = 'qa/vf_report_no_cost_diagnostic_20260627.md';
const REPORT_JSON_PATH = 'qa/vf_report_no_cost_diagnostic_20260627.json';
const EVIDENCE_DIR = 'test-results/report-no-cost-diagnostic';
const RUN_ID = `report_no_cost_${Date.now()}`;
const TEST_EMAIL = `e2e-report-no-cost-${RUN_ID}@vistoriafacilia.com`;
const TEST_PASSWORD = `ReportNoCost-${RUN_ID}!`;
const SYNTHETIC_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

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
  return text.replace(/\s+/g, ' ').slice(0, 900);
}

function addCase(result, phase, caso, esperado, status, evidencia) {
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

async function getVisibleText(page) {
  return page.locator('body').innerText({ timeout: 5_000 })
    .then((text) => text.replace(/\s+/g, ' ').slice(0, 4_000))
    .catch((error) => `BODY_TEXT_UNAVAILABLE: ${sanitizeMessage(error.message)}`);
}

async function getVisibleButtons(page) {
  const buttons = await page.locator('button:visible').allTextContents().catch(() => []);
  return buttons.map((button) => button.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 40);
}

async function login(page, email, password) {
  await page.getByRole('button', { name: /^Entrar$/i }).first().click().catch(() => undefined);
  await page.getByLabel(/^E-mail$/i).fill(email);
  await page.getByLabel(/^Senha$/i).fill(password);
  await page.getByRole('button', { name: /^Entrar$/i }).last().click();
  await page.getByText(/Meus Im.veis/i).waitFor({ state: 'visible', timeout: 45_000 });
}

async function createUserAndEntitlement(admin) {
  const user = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { testRunId: RUN_ID, purpose: 'report_no_cost_diagnostic' },
  });
  if (user.error || !user.data.user) throw new Error(`admin create user failed: ${user.error?.message || 'no user'}`);

  const plan = await admin
    .from('plans')
    .select('id,max_photos_per_inspection,pdf_enabled')
    .eq('id', 'beta_paid_4990')
    .single();
  if (plan.error || !plan.data) throw new Error(`plan beta_paid_4990 unavailable: ${plan.error?.message || 'missing'}`);

  const entitlement = await admin.from('entitlements').insert({
    id: `${user.data.user.id}_report_no_cost_${RUN_ID}`,
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

async function createProperty(page, name) {
  await page.getByRole('button', { name: /Cadastrar/i }).first().click();
  const inputs = page.locator('form input');
  await inputs.nth(0).fill(name);
  await inputs.nth(1).fill('01001-000');
  await inputs.nth(2).fill('SP');
  await inputs.nth(3).fill(`Rua Relatorio ${RUN_ID}`);
  await inputs.nth(4).fill('101');
  await inputs.nth(5).fill('Diagnostico sem custo');
  await inputs.nth(6).fill('Centro');
  await inputs.nth(7).fill('Sao Paulo');
  await inputs.nth(8).fill(`Referencia ${RUN_ID}`);
  await page.locator('form textarea').fill(`Diagnostico de relatorio sem custo ${RUN_ID}`);
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
}

async function cleanup(admin, userId) {
  const result = { ok: false, errors: [], leftovers: {} };
  for (const table of ['photos', 'rooms', 'reports', 'inspections', 'properties', 'entitlements', 'events']) {
    const res = await admin.from(table).delete().eq('user_id', userId);
    if (res.error) result.errors.push(`${table} delete: ${res.error.message}`);
  }
  const profile = await admin.from('profiles').delete().eq('id', userId);
  if (profile.error) result.errors.push(`profiles delete: ${profile.error.message}`);
  const auth = await admin.auth.admin.deleteUser(userId);
  if (auth.error) result.errors.push(`auth user delete: ${auth.error.message}`);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  for (const table of ['properties', 'inspections', 'rooms', 'photos', 'reports', 'entitlements', 'events']) {
    const res = await admin.from(table).select('id', { count: 'exact', head: true }).eq('user_id', userId);
    result.leftovers[`${table}Rows`] = res.error ? `check_error: ${res.error.message}` : (res.count || 0);
  }
  const authUser = await admin.auth.admin.getUserById(userId);
  result.leftovers.authUserExists = authUser.data?.user ? true : false;
  result.ok = result.errors.length === 0 && Object.values(result.leftovers).every((value) => value === 0 || value === false);
  return result;
}

function classifyReport(result) {
  if (result.openAiCalls > 0) return 'COST_GUARD';
  if (result.reportTitleVisible) return 'REPORT_GENERATED_NOT_DETECTED';
  if (result.reportButtonVisible && !result.reportTitleVisible) return 'REPORT_BUTTON_TEXT_CHANGED';
  if (result.dialogs.length > 0 || /Gera..o de PDF Bloqueada|Imposs.vel concluir|Bloqueada/i.test(result.visibleTextAfter || '')) return 'REPORT_FUNCTIONAL_BUG';
  if (result.inspectionStatusAfter === 'concluida' && !result.reportTitleVisible) return 'REPORT_NOT_GENERATED';
  return 'UNKNOWN';
}

function renderReport(result) {
  const lines = [
    '# VF Report No-Cost Diagnostic - 2026-06-27',
    '',
    `STATUS FINAL: ${result.status}`,
    `Classificacao: ${result.classification}`,
    '',
    `URL testada: ${result.url}`,
    `Run ID: ${result.runId}`,
    '',
    '## Evidencia',
    '',
    `- OpenAI chamada: ${result.openAiCalls}`,
    `- Tokens: ${result.tokens}`,
    `- Custo OpenAI: R$ ${result.openAiCostBrl.toFixed(2)}`,
    `- Titulo Visualizar Relatorio visivel: ${result.reportTitleVisible ? 'sim' : 'nao'}`,
    `- Botao Baixar Relatorio PDF visivel: ${result.reportButtonVisible ? 'sim' : 'nao'}`,
    `- Status da vistoria apos clique: ${result.inspectionStatusAfter || 'nao verificado'}`,
    `- URL apos clique: ${result.urlAfter || 'nao capturada'}`,
    `- Cleanup: ${result.cleanupOk ? 'PASS' : 'FAIL'}`,
    '',
    '## Matriz',
    '',
    '| Fase | Caso | Esperado | Status | Evidencia |',
    '| --- | --- | --- | --- | --- |',
    ...result.matrix.map((row) => `| ${row.phase} | ${row.caso} | ${row.esperado} | ${row.status} | ${row.evidencia || ''} |`),
    '',
    '## Botoes visiveis apos clique',
    '',
    result.buttonsAfter.length ? result.buttonsAfter.map((button) => `- ${button}`).join('\n') : '- Nenhum botao capturado.',
    '',
    '## Dialogs',
    '',
    result.dialogs.length ? result.dialogs.map((dialog) => `- ${dialog}`).join('\n') : '- Nenhum.',
    '',
    '## Texto visivel apos clique',
    '',
    '```text',
    result.visibleTextAfter || '',
    '```',
    '',
    '## Evidencias visuais',
    '',
    result.screenshots.length ? result.screenshots.map((file) => `- ${file}`).join('\n') : '- Nenhuma.',
    '',
    'UAT nao foi liberado automaticamente.',
    '',
  ];
  return lines.join('\n');
}

async function run() {
  const result = {
    status: 'FAIL',
    classification: 'UNKNOWN',
    url: TARGET_URL,
    runId: RUN_ID,
    matrix: [],
    screenshots: [],
    buttonsAfter: [],
    visibleTextAfter: '',
    dialogs: [],
    openAiCalls: 0,
    tokens: 0,
    openAiCostBrl: 0,
    reportTitleVisible: false,
    reportButtonVisible: false,
    urlAfter: '',
    inspectionId: '',
    inspectionStatusAfter: '',
    cleanupOk: false,
    cleanupDetails: null,
    error: null,
  };

  const env = loadEnvLocal();
  const missing = ['VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((key) => !env[key]);
  if (missing.length) {
    result.status = 'BLOCKED';
    result.error = `missing ${missing.join(', ')} in .env.local`;
    result.classification = 'UNKNOWN';
    writeFileSync(REPORT_PATH, renderReport(result), 'utf8');
    writeFileSync(REPORT_JSON_PATH, JSON.stringify(result, null, 2), 'utf8');
    console.log(JSON.stringify({ status: result.status, classification: result.classification, error: result.error, report: REPORT_PATH }, null, 2));
    process.exitCode = 2;
    return;
  }

  const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  let provisioned = null;
  let browser = null;
  let context = null;

  try {
    provisioned = await createUserAndEntitlement(admin);
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    const page = await context.newPage();

    page.on('dialog', async (dialog) => {
      result.dialogs.push(sanitizeMessage(dialog.message()));
      await dialog.accept().catch(() => undefined);
    });
    page.on('request', (request) => {
      if (/\/\.netlify\/functions\/analyze-photo|api\.openai\.com/i.test(request.url())) result.openAiCalls += 1;
    });

    const response = await page.goto(`${TARGET_URL}/?report_no_cost=${RUN_ID}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if ((response?.status() || 0) !== 200) throw new Error(`public URL status ${response?.status() || 'unknown'}`);
    await login(page, provisioned.email, provisioned.password);
    addCase(result, '1', 'Login tecnico', 'Entrar no app publico sem IA', 'PASS', 'Meus Imoveis visivel');

    const propertyName = `Relatorio Sem Custo ${RUN_ID}`;
    await createProperty(page, propertyName);
    await openHistory(page, propertyName);
    await startInspection(page);

    const inspection = await admin.from('inspections').select('id,status').eq('user_id', provisioned.userId).order('started_at', { ascending: false }).limit(1).single();
    if (inspection.error || !inspection.data?.id) throw new Error(`inspection query failed: ${inspection.error?.message || 'missing'}`);
    result.inspectionId = inspection.data.id;
    const room = await admin.from('rooms').select('id,name').eq('inspection_id', result.inspectionId).order('display_order', { ascending: true }).limit(1).single();
    if (room.error || !room.data?.id) throw new Error(`room query failed: ${room.error?.message || 'missing'}`);
    addCase(result, '2', 'Setup vistoria', 'Criar imovel, vistoria e comodos sem upload/IA', 'PASS', `inspectionId=${result.inspectionId}`);

    const photoId = `report_no_cost_photo_${RUN_ID}`;
    const inserted = await admin.from('photos').insert({
      id: photoId,
      inspection_id: result.inspectionId,
      room_id: room.data.id,
      room_name: room.data.name,
      user_id: provisioned.userId,
      url: SYNTHETIC_IMAGE,
      image_url: SYNTHETIC_IMAGE,
      storage_path: null,
      caption: 'Foto sintetica para diagnostico sem custo',
      display_title: 'Diagnostico sem custo',
      description: 'Registro sintetico para validar transicao ao relatorio sem chamada OpenAI.',
      ai_analysis: { condicao_sugerida: 'OK', confianca: 'alta', observacao_sugerida: 'Registro sintetico sem IA para diagnostico de relatorio.' },
      reviewed_status: 'confirmado',
      upload_status: 'completed',
      analysis_status: 'completed',
      review_status: 'confirmed',
      condition_suggested: 'OK',
      item_observed: 'Registro sintetico',
      description_suggested: 'Registro sintetico sem IA para diagnostico de relatorio.',
      fallback_applied: false,
      analysis_error: null,
    });
    if (inserted.error) throw new Error(`synthetic photo insert failed: ${inserted.error.message}`);
    addCase(result, '3', 'Foto sintetica sem custo', 'Criar pre-condicao minima de relatorio sem upload e sem OpenAI', 'PASS', photoId);

    await page.getByLabel(/Voltar para hist.rico/i).click();
    await page.getByText(/Hist.rico de Vistorias/i).waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByRole('button', { name: /Continuar Rascunho/i }).first().click();
    await page.getByText(/Registro de Fotos:/i).waitFor({ state: 'visible', timeout: 45_000 });
    await page.getByText(/Diagnostico sem custo/i).first().waitFor({ state: 'visible', timeout: 30_000 });
    result.screenshots.push(await capture(page, 'before_report_click'));

    await page.getByRole('button', { name: /Concluir.*Revisar/i }).click();
    await page.waitForTimeout(5_000);
    result.urlAfter = page.url();
    result.reportTitleVisible = await visibleOrFalse(page.getByText(/Visualizar Relat.rio/i).first());
    result.reportButtonVisible = await visibleOrFalse(page.getByRole('button', { name: /Baixar Relat.rio PDF/i }).first());
    result.visibleTextAfter = await getVisibleText(page);
    result.buttonsAfter = await getVisibleButtons(page);
    result.screenshots.push(await capture(page, 'after_report_click'));

    const statusAfter = await admin.from('inspections').select('status').eq('id', result.inspectionId).single();
    if (!statusAfter.error) result.inspectionStatusAfter = statusAfter.data?.status || '';
    result.classification = classifyReport(result);
    addCase(result, '4', 'Transicao para relatorio', 'Clicar Concluir & Revisar e observar tela/estado', result.reportTitleVisible ? 'PASS' : 'FAIL', result.classification);
    result.status = result.openAiCalls > 0 ? 'COST_GUARD' : 'PASS';
  } catch (error) {
    result.error = sanitizeMessage(error?.message || error);
    result.classification = result.openAiCalls > 0 ? 'COST_GUARD' : 'UNKNOWN';
    result.status = result.openAiCalls > 0 ? 'COST_GUARD' : 'FAIL';
    result.screenshots.push(`screenshot_failed: ${result.error}`);
  } finally {
    if (context) await context.close().catch(() => undefined);
    if (browser) await browser.close().catch(() => undefined);
    if (provisioned?.userId) {
      result.cleanupDetails = await cleanup(admin, provisioned.userId).catch((error) => ({ ok: false, errors: [sanitizeMessage(error?.message || error)], leftovers: { cleanupFailed: true } }));
      result.cleanupOk = result.cleanupDetails.ok;
    }
    writeFileSync(REPORT_PATH, renderReport(result), 'utf8');
    writeFileSync(REPORT_JSON_PATH, JSON.stringify(result, null, 2), 'utf8');
  }

  console.log(JSON.stringify({
    status: result.status,
    classification: result.classification,
    openAiCalls: result.openAiCalls,
    tokens: result.tokens,
    openAiCostBrl: result.openAiCostBrl,
    reportTitleVisible: result.reportTitleVisible,
    reportButtonVisible: result.reportButtonVisible,
    cleanupOk: result.cleanupOk,
    report: REPORT_PATH,
    reportJson: REPORT_JSON_PATH,
    screenshots: result.screenshots,
    error: result.error,
  }, null, 2));

  process.exitCode = result.status === 'PASS' ? 0 : result.status === 'COST_GUARD' || result.status === 'BLOCKED' ? 2 : 1;
}

run();
