import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const TARGET_URL = process.env.UAT_REAL_BASE_URL || 'https://glittery-boba-2b3367.netlify.app';
const REPORT_PATH = 'qa/vf_real_public_auth_signup_uat_20260626.md';
const BUCKET = 'inspection-photos';
const RUN_ID = `uat_signup_${Date.now()}`;
const SIGNUP_EMAIL = `e2e-public-signup-${RUN_ID}@vistoriafacilia.com`;
const MISSING_EMAIL = `e2e-public-missing-${RUN_ID}@vistoriafacilia.test`;
const SIGNUP_PASSWORD = `SignupUat-${RUN_ID}!`;
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
    lower.includes('token')
    || lower.includes('key')
    || lower.includes('password')
    || lower.includes('service_role')
    || lower.includes('authorization')
  ) {
    return '[redacted sensitive message]';
  }
  return text.replace(/\s+/g, ' ').slice(0, 350);
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

async function selectRoom(page, roomName) {
  const row = roomRow(page, roomName);
  await row.waitFor({ state: 'visible', timeout: 20_000 });
  await row.locator('button').first().click();
  await page.getByText(new RegExp(`Registro de Fotos: ${escapeRegex(roomName)}`)).waitFor({
    state: 'visible',
    timeout: 20_000,
  });
}

async function assertRoomPhotosVisibleAfterResume(page, roomName) {
  await selectRoom(page, roomName).catch(async () => {
    await page.waitForTimeout(1000);
    await selectRoom(page, roomName);
  });
  await page.getByText(/Sem An.lise de IA/i).first().waitFor({ state: 'visible', timeout: 30_000 }).catch(async () => {
    await page.waitForTimeout(1000);
    await selectRoom(page, roomName);
    await page.getByText(/Sem An.lise de IA/i).first().waitFor({ state: 'visible', timeout: 30_000 });
  });
}

function photoFiles(prefix, count) {
  return Array.from({ length: count }, (_, index) => ({
    name: `${prefix}-${index + 1}.jpg`,
    mimeType: 'image/jpeg',
    buffer: ONE_PIXEL_JPEG,
  }));
}

async function visibleOrFalse(locator) {
  return locator.isVisible().catch(() => false);
}

async function waitForPhotoCount(page, expected, timeoutMs = 120_000) {
  const started = Date.now();
  const pattern = new RegExp(`${expected}\\s*/\\s*\\d+\\s*fotos`, 'i');
  while (Date.now() - started < timeoutMs) {
    if (await visibleOrFalse(page.getByText(pattern).first())) return;
    await page.waitForTimeout(1000);
  }
  throw new Error(`photo counter did not reach ${expected}`);
}

async function findUserByEmail(admin, email) {
  for (let page = 1; page <= 20; page += 1) {
    const users = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (users.error) throw new Error(`admin list users failed: ${users.error.message}`);
    const match = users.data.users.find((user) => (user.email || '').toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (users.data.users.length < 1000) return null;
  }
  return null;
}

async function collectCreated(admin, userId) {
  const created = {
    userId,
    propertyIds: [],
    inspectionIds: [],
    photoIds: [],
    storagePaths: [],
    entitlementIds: [],
  };

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
    leftovers[`${table}Rows`] = res.error ? `check_error: ${res.error.message}` : (res.count || 0);
  }
  const profile = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('id', userId);
  leftovers.profileRows = profile.error ? `check_error: ${profile.error.message}` : (profile.count || 0);
  const authUser = await admin.auth.admin.getUserById(userId);
  leftovers.authUserExists = authUser.data?.user ? true : false;

  for (const path of [...new Set(storagePaths.filter(Boolean))]) {
    const parts = path.split('/');
    const fileName = parts.pop();
    const folder = parts.join('/');
    const listed = await admin.storage.from(BUCKET).list(folder, { limit: 100 });
    leftovers[`storage:${path}`] = listed.error ? `list_error: ${listed.error.message}` : listed.data.some((entry) => entry.name === fileName);
  }

  return leftovers;
}

async function cleanup(admin, email) {
  const user = await findUserByEmail(admin, email);
  if (!user?.id) return { ok: true, userFound: false, leftovers: {}, errors: [] };

  const created = await collectCreated(admin, user.id);
  const storagePaths = [...new Set(created.storagePaths.filter(Boolean))];
  const result = { ok: false, userFound: true, leftovers: {}, errors: [] };

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

  let res = await admin.from('events').delete().eq('user_id', user.id);
  if (res.error) result.errors.push(`events delete: ${res.error.message}`);
  res = await admin.from('profiles').delete().eq('id', user.id);
  if (res.error) result.errors.push(`profiles delete: ${res.error.message}`);
  const auth = await admin.auth.admin.deleteUser(user.id);
  if (auth.error) result.errors.push(`auth user delete: ${auth.error.message}`);

  await new Promise((resolve) => setTimeout(resolve, 1000));
  result.leftovers = await verifyNoLeftovers(admin, user.id, storagePaths);
  result.ok = result.errors.length === 0 && Object.values(result.leftovers).every((value) => value === 0 || value === false);
  return result;
}

function classifyRuntime(runtime) {
  const expectedConsoleError = /email\/password login failed|invalid login credentials|erro ao analisar a foto|ia server-side desabilitada|falha na resposta do servidor para an.lise de ia|password reset request failed/i;
  const criticalConsoleErrors = runtime.consoleErrors.filter((entry) => {
    if (entry.phase === 'login_missing_user' && /failed to load resource|email\/password login failed|invalid login credentials/i.test(entry.text)) return false;
    return !expectedConsoleError.test(entry.text);
  });
  const criticalFailedRequests = runtime.failedRequests.filter((request) => request.phase !== 'login_missing_user');
  return {
    criticalConsoleErrors: criticalConsoleErrors.length,
    criticalConsoleSamples: criticalConsoleErrors.slice(0, 5).map((entry) => sanitizeMessage(entry.text)),
    pageErrors: runtime.pageErrors.length,
    criticalFailedRequests: criticalFailedRequests.length,
    expectedAuthFailures: runtime.failedRequests.length - criticalFailedRequests.length,
  };
}

function reportLineStatus(status) {
  return status || 'NOT_RUN';
}

function renderReport(result) {
  const runtime = result.runtimeSummary;
  const lines = [
    '# VF Real Public Auth Signup UAT - 2026-06-26',
    '',
    `Status: ${result.status}`,
    '',
    `URL testada: ${result.url}`,
    `Run ID: ${result.runId}`,
    `Inicio: ${result.startedAt}`,
    `Fim: ${result.finishedAt}`,
    '',
    '## Autenticacao publica',
    '',
    `- Google login oculto: ${reportLineStatus(result.googleHidden)}`,
    `- Entrar visivel: ${reportLineStatus(result.loginVisible)}`,
    `- Criar conta visivel: ${reportLineStatus(result.signupVisible)}`,
    `- Login com e-mail inexistente: ${reportLineStatus(result.missingUserLogin)}`,
    `- Criar conta: ${reportLineStatus(result.signup)}`,
    `- Politica de e-mail tecnico: ${result.signupEmailPolicy}`,
    `- Login apos criacao: ${reportLineStatus(result.login)}`,
    `- Esqueci minha senha: ${reportLineStatus(result.forgotPassword)}`,
    `- Confirmacao de e-mail bloqueia fluxo: ${result.emailConfirmationBlocksFlow ? 'sim' : 'nao'}`,
    '',
    '## Fluxo principal pos-login',
    '',
    `- Criar local/imovel: ${reportLineStatus(result.crudProperty)}`,
    `- Criar vistoria: ${reportLineStatus(result.inspection)}`,
    `- Criar comodo: ${reportLineStatus(result.room)}`,
    `- Upload/foto/revisao: ${reportLineStatus(result.photos)}`,
    `- Concluir/Revisar: ${reportLineStatus(result.finishReview)}`,
    `- Persistencia/retomada: ${reportLineStatus(result.persistence)}`,
    '',
    '## Runtime',
    '',
    `- Console errors criticos: ${runtime.criticalConsoleErrors}`,
    ...(runtime.criticalConsoleSamples?.length ? runtime.criticalConsoleSamples.map((message) => `  - ${message}`) : []),
    `- Page errors: ${runtime.pageErrors}`,
    `- Failed requests criticos: ${runtime.criticalFailedRequests}`,
    `- Failed requests esperados no login invalido: ${runtime.expectedAuthFailures}`,
    '',
    '## Cleanup',
    '',
    `- Cleanup: ${reportLineStatus(result.cleanup)}`,
    `- Leftovers: ${result.cleanupDetails ? JSON.stringify(result.cleanupDetails.leftovers) : 'nao executado'}`,
    '',
    '## Decisao',
    '',
    result.status === 'PASS'
      ? 'UAT manual pode comecar como rodada controlada. UAT nao foi liberado automaticamente.'
      : 'UAT manual permanece bloqueado ate resolver o item registrado.',
    '',
    result.error ? `Erro: ${result.error}` : '',
    '',
  ];
  return lines.join('\n');
}

async function runMainFlow(page, planLimit) {
  const propertyName = `Signup UAT ${RUN_ID}`;
  const roomName = `Comodo Signup ${RUN_ID.slice(-6)}`;

  await page.getByRole('button', { name: /Cadastrar/i }).first().click();
  const inputs = page.locator('form input');
  await inputs.nth(0).fill(propertyName);
  await inputs.nth(1).fill('01001-000');
  await inputs.nth(2).fill('SP');
  await inputs.nth(3).fill(`Rua Signup UAT ${RUN_ID}`);
  await inputs.nth(4).fill('101');
  await inputs.nth(5).fill('Apto UAT');
  await inputs.nth(6).fill('Centro');
  await inputs.nth(7).fill('Sao Paulo');
  await inputs.nth(8).fill(`Referencia ${RUN_ID}`);
  await page.locator('form textarea').fill(`Teste signup publico ${RUN_ID}`);
  await page.getByRole('button', { name: /Salvar Im.vel/i }).click();
  await page.locator('[data-testid^="property-card-"]').filter({ hasText: propertyName }).first().waitFor({ state: 'visible', timeout: 30_000 });

  await page.locator('[data-testid^="property-card-"]').filter({ hasText: propertyName }).getByRole('button', { name: /Nova Vistoria/i }).click();
  await page.getByText(/Iniciar Nova Vistoria/i).waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByRole('button', { name: /Vistoria de Entrada/i }).click();
  await page.getByRole('button', { name: /Come.ar Vistoria/i }).click();
  await page.getByText(/Registro de Fotos:/i).waitFor({ state: 'visible', timeout: 30_000 });

  await page.getByPlaceholder(/Novo c.modo/i).fill(roomName);
  await page.getByTitle(/Adicionar c.modo/i).click();
  await page.getByText(roomName).waitFor({ state: 'visible', timeout: 20_000 });
  await selectRoom(page, roomName);

  const uploadInput = page.locator('input[type="file"][multiple]').last();
  await uploadInput.setInputFiles(photoFiles(`${RUN_ID}-signup-initial`, 1));
  await page.getByText(/Sem An.lise de IA/i).first().waitFor({ state: 'visible', timeout: 60_000 });
  await page.getByRole('button', { name: /Confirmar Revis.o/i }).first().click();
  await page.getByText(/Confirmado/i).first().waitFor({ state: 'visible', timeout: 30_000 });

  if (planLimit > 1) {
    await uploadInput.setInputFiles(photoFiles(`${RUN_ID}-signup-limit`, planLimit - 1));
    await waitForPhotoCount(page, planLimit, Math.max(180_000, planLimit * 8_000));
  }
  const limitDisabled = await page.getByRole('button', { name: /Escolher da Galeria/i }).first().isDisabled().catch(() => false);
  if (!limitDisabled) throw new Error('plan photo limit is not disabled in UI at the limit');

  await page.getByLabel(/Voltar para hist.rico/i).click();
  await page.getByText(/Hist.rico de Vistorias/i).waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByRole('button', { name: /Continuar Rascunho/i }).first().click();
  await page.getByText(roomName).waitFor({ state: 'visible', timeout: 30_000 });
  await assertRoomPhotosVisibleAfterResume(page, roomName);

  let finishDialog = '';
  const dialogPromise = page.waitForEvent('dialog', { timeout: 10_000 }).then(async (dialog) => {
    finishDialog = dialog.message();
    await dialog.accept();
  }).catch(() => undefined);
  await page.getByRole('button', { name: /Concluir.*Revisar/i }).click();
  await dialogPromise;
  if (finishDialog && !/Imposs.vel concluir|Imposs.*concluir|vistoria|foto|revis/i.test(finishDialog)) {
    throw new Error(`unexpected finish/review dialog: ${finishDialog}`);
  }
  if (!finishDialog) {
    await page.getByText(/Relat.rio|PDF|Baixar/i).first().waitFor({ state: 'visible', timeout: 20_000 });
  }
}

async function main() {
  const startedAt = new Date().toISOString();
  const env = loadEnvLocal();
  const result = {
    status: 'BLOCKED',
    url: TARGET_URL,
    runId: RUN_ID,
    startedAt,
    finishedAt: null,
    googleHidden: 'NOT_RUN',
    loginVisible: 'NOT_RUN',
    signupVisible: 'NOT_RUN',
    missingUserLogin: 'NOT_RUN',
    signup: 'NOT_RUN',
    signupEmailPolicy: 'Supabase Auth rejeita TLD .test no signup publico; gate usa dominio valido vistoriafacilia.com.',
    login: 'NOT_RUN',
    forgotPassword: 'NOT_RUN',
    emailConfirmationBlocksFlow: false,
    crudProperty: 'NOT_RUN',
    inspection: 'NOT_RUN',
    room: 'NOT_RUN',
    photos: 'NOT_RUN',
    finishReview: 'NOT_RUN',
    persistence: 'NOT_RUN',
    cleanup: 'NOT_RUN',
    cleanupDetails: null,
    runtimeSummary: { criticalConsoleErrors: 0, criticalConsoleSamples: [], pageErrors: 0, criticalFailedRequests: 0, expectedAuthFailures: 0 },
    error: null,
  };

  const required = ['VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) {
    result.error = `missing ${missing.join(' and ')} in .env.local`;
    result.finishedAt = new Date().toISOString();
    writeFileSync(REPORT_PATH, renderReport(result), 'utf8');
    console.log(`BLOCKED: ${result.error}`);
    process.exitCode = 2;
    return;
  }

  const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const freePlan = await admin.from('plans').select('max_photos_per_inspection').eq('id', 'free_10').single();
  if (freePlan.error || !freePlan.data) {
    result.error = `free_10 plan unavailable: ${sanitizeMessage(freePlan.error?.message || 'missing')}`;
    result.finishedAt = new Date().toISOString();
    writeFileSync(REPORT_PATH, renderReport(result), 'utf8');
    console.log(`BLOCKED: ${result.error}`);
    process.exitCode = 2;
    return;
  }

  let browser = null;
  let page = null;
  const runtime = { phase: 'bootstrap', consoleErrors: [], pageErrors: [], failedRequests: [] };

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    page = await context.newPage();

    page.on('console', (msg) => {
      if (msg.type() === 'error') runtime.consoleErrors.push({ phase: runtime.phase, text: msg.text() });
    });
    page.on('pageerror', (err) => runtime.pageErrors.push(sanitizeMessage(err.message || err)));
    page.on('requestfailed', (request) => {
      runtime.failedRequests.push({ phase: runtime.phase, resourceType: request.resourceType(), failure: request.failure()?.errorText || 'unknown' });
    });

    runtime.phase = 'open_public_url';
    const response = await page.goto(`${TARGET_URL}/?signup_uat=${RUN_ID}`, { waitUntil: 'networkidle', timeout: 60_000 });
    if ((response?.status() || 0) !== 200) throw new Error(`HTTP status ${response?.status() || 'unknown'}`);

    const googleVisible = await visibleOrFalse(page.getByRole('button', { name: /Entrar com o Google/i }));
    if (googleVisible) throw new Error('Google login button is visible while Google OAuth is disabled.');
    result.googleHidden = 'PASS';

    await page.getByRole('button', { name: /^Entrar$/i }).first().waitFor({ state: 'visible', timeout: 20_000 });
    await page.getByRole('button', { name: /Criar conta/i }).first().waitFor({ state: 'visible', timeout: 20_000 });
    result.loginVisible = 'PASS';
    result.signupVisible = 'PASS';

    runtime.phase = 'login_missing_user';
    await page.getByLabel(/^E-mail$/i).fill(MISSING_EMAIL);
    await page.getByLabel(/^Senha$/i).fill(SIGNUP_PASSWORD);
    await page.getByRole('button', { name: /^Entrar$/i }).last().click();
    await page.getByText(/Se voce ainda nao tem conta, escolha Criar conta/i).waitFor({ state: 'visible', timeout: 20_000 });
    result.missingUserLogin = 'PASS';

    runtime.phase = 'forgot_password';
    await page.getByRole('button', { name: /Esqueci minha senha/i }).click();
    await page.getByText(/Se houver uma conta para este e-mail/i).waitFor({ state: 'visible', timeout: 30_000 });
    result.forgotPassword = 'PASS';

    runtime.phase = 'signup';
    await page.getByRole('button', { name: /Criar conta/i }).first().click();
    await page.getByLabel(/^E-mail$/i).fill(SIGNUP_EMAIL);
    await page.getByLabel(/^Senha$/i).fill(SIGNUP_PASSWORD);
    await page.getByLabel(/Confirmar senha/i).fill(SIGNUP_PASSWORD);
    await page.getByRole('button', { name: /^Criar conta$/i }).last().click();

    const signupOutcome = await Promise.race([
      page.getByText(/Meus Im.veis/i).waitFor({ state: 'visible', timeout: 45_000 }).then(() => 'authenticated').catch(() => null),
      page.getByText(/Conta criada\. Verifique seu e-mail/i).waitFor({ state: 'visible', timeout: 45_000 }).then(() => 'confirmation_required').catch(() => null),
      page.getByText(/Muitas tentativas de criacao de conta/i).waitFor({ state: 'visible', timeout: 45_000 }).then(() => 'email_rate_limit').catch(() => null),
      page.getByText(/Informe um e-mail valido/i).waitFor({ state: 'visible', timeout: 45_000 }).then(() => 'invalid_email').catch(() => null),
    ]);
    if (signupOutcome === 'email_rate_limit') {
      result.signup = 'BLOCKED';
      result.login = 'NOT_RUN';
      throw new Error('Supabase Auth email rate limit exceeded during public signup');
    }
    if (signupOutcome === 'invalid_email') {
      result.signup = 'FAIL';
      throw new Error('Supabase Auth rejected signup email as invalid');
    }
    if (signupOutcome === 'confirmation_required') {
      result.signup = 'PASS';
      result.login = 'BLOCKED';
      result.emailConfirmationBlocksFlow = true;
      throw new Error('email confirmation required');
    }
    if (signupOutcome !== 'authenticated') {
      throw new Error('signup did not authenticate or show email confirmation message');
    }
    result.signup = 'PASS';
    result.login = 'PASS';

    runtime.phase = 'main_flow';
    await runMainFlow(page, Number(freePlan.data.max_photos_per_inspection));
    result.crudProperty = 'PASS';
    result.inspection = 'PASS';
    result.room = 'PASS';
    result.photos = 'PASS';
    result.finishReview = 'PASS';
    result.persistence = 'PASS';
    result.status = 'PASS';
  } catch (error) {
    const message = sanitizeMessage(error?.message || error);
    result.error = message;
    result.status = /missing|not visible|provider|permission|policy|rls|confirmation required|rate limit/i.test(message) ? 'BLOCKED' : 'FAIL';
    if (page) {
      mkdirSync('test-results', { recursive: true });
      await page.screenshot({ path: `test-results/vf-real-public-signup-${RUN_ID}.png`, fullPage: true }).catch(() => undefined);
    }
  } finally {
    if (page) result.runtimeSummary = classifyRuntime(runtime);
    if (browser) await browser.close().catch(() => undefined);
    result.cleanupDetails = await cleanup(admin, SIGNUP_EMAIL).catch((error) => ({
      ok: false,
      errors: [sanitizeMessage(error?.message || error)],
      leftovers: { cleanupFailed: true },
    }));
    result.cleanup = result.cleanupDetails.ok ? 'PASS' : 'FAIL';
    if (result.status === 'PASS' && result.cleanup !== 'PASS') result.status = 'BLOCKED';
    if (
      result.status === 'PASS'
      && (
        result.runtimeSummary.criticalConsoleErrors > 0
        || result.runtimeSummary.pageErrors > 0
        || result.runtimeSummary.criticalFailedRequests > 0
      )
    ) {
      result.status = 'FAIL';
      result.error = 'critical runtime errors observed during public signup journey';
    }
    result.finishedAt = new Date().toISOString();
    writeFileSync(REPORT_PATH, renderReport(result), 'utf8');
  }

  console.log(JSON.stringify({
    status: result.status,
    url: TARGET_URL,
    signup: result.signup,
    login: result.login,
    forgotPassword: result.forgotPassword,
    emailConfirmationBlocksFlow: result.emailConfirmationBlocksFlow,
    mainFlow: result.persistence === 'PASS' ? 'PASS' : 'NOT_COMPLETED',
    cleanup: result.cleanup,
    report: REPORT_PATH,
  }, null, 2));
  process.exitCode = result.status === 'PASS' ? 0 : result.status === 'BLOCKED' ? 2 : 1;
}

main().catch((error) => {
  const result = {
    status: 'BLOCKED',
    url: TARGET_URL,
    runId: RUN_ID,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    googleHidden: 'NOT_RUN',
    loginVisible: 'NOT_RUN',
    signupVisible: 'NOT_RUN',
    missingUserLogin: 'NOT_RUN',
    signup: 'NOT_RUN',
    signupEmailPolicy: 'Supabase Auth rejeita TLD .test no signup publico; gate usa dominio valido vistoriafacilia.com.',
    login: 'NOT_RUN',
    forgotPassword: 'NOT_RUN',
    emailConfirmationBlocksFlow: false,
    crudProperty: 'NOT_RUN',
    inspection: 'NOT_RUN',
    room: 'NOT_RUN',
    photos: 'NOT_RUN',
    finishReview: 'NOT_RUN',
    persistence: 'NOT_RUN',
    cleanup: 'NOT_RUN',
    cleanupDetails: null,
    runtimeSummary: { criticalConsoleErrors: 0, criticalConsoleSamples: [], pageErrors: 0, criticalFailedRequests: 0, expectedAuthFailures: 0 },
    error: sanitizeMessage(error?.message || error),
  };
  writeFileSync(REPORT_PATH, renderReport(result), 'utf8');
  console.log(`BLOCKED: ${result.error}`);
  process.exitCode = 2;
});
