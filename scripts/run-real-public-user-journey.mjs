import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const TARGET_URL = process.env.UAT_REAL_BASE_URL || 'https://glittery-boba-2b3367.netlify.app';
const REPORT_PATH = 'qa/vf_real_user_journey_uat_20260626.md';
const BUCKET = 'inspection-photos';
const RUN_ID = `uat_real_${Date.now()}`;
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

async function hoverRoomAction(page, row) {
  const box = await row.boundingBox();
  if (!box) throw new Error('room row bounding box unavailable');
  await page.mouse.move(box.x + Math.max(1, box.width - 8), box.y + (box.height / 2));
  await page.waitForTimeout(300);
}

async function visibleButtons(page) {
  return page.locator('button:visible').evaluateAll((buttons) => buttons
    .map((button) => (button.textContent || button.getAttribute('aria-label') || button.getAttribute('title') || '').trim())
    .filter(Boolean));
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

async function createUserAndEntitlement(admin) {
  const email = `e2e-real-${RUN_ID}@vistoriafacilia.test`;
  const password = `RealUat-${RUN_ID}!`;
  const user = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { testRunId: RUN_ID, purpose: 'real_public_uat' },
  });
  if (user.error || !user.data.user) {
    throw new Error(`admin create user failed: ${user.error?.message || 'no user'}`);
  }

  const plan = await admin
    .from('plans')
    .select('id,name,max_photos_per_inspection,pdf_enabled,payment_required')
    .eq('id', 'free_10')
    .single();
  if (plan.error || !plan.data) throw new Error(`plan free_10 unavailable: ${plan.error?.message || 'missing'}`);

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
  if (entitlement.error) throw new Error(`admin entitlement insert failed: ${entitlement.error.message}`);

  return {
    email,
    password,
    userId: user.data.user.id,
    plan: plan.data,
    entitlementId,
  };
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

async function cleanup(admin, userId) {
  const created = await collectCreated(admin, userId);
  const storagePaths = [...new Set(created.storagePaths.filter(Boolean))];
  const result = { leftovers: {}, errors: [] };

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

function classifyRuntime(runtime) {
  const expectedAuthFailures = runtime.failedRequests.filter((request) => request.phase === 'wrong_password');
  const criticalFailedRequests = runtime.failedRequests.filter((request) => request.phase !== 'wrong_password');
  const expectedConsoleError = /email\/password login failed|invalid login credentials|erro ao analisar a foto|ia server-side desabilitada|falha na resposta do servidor para an.lise de ia/i;
  const criticalConsoleErrors = runtime.consoleErrors.filter((entry) => {
    const message = typeof entry === 'string' ? entry : entry.text;
    const phase = typeof entry === 'string' ? '' : entry.phase;
    if (phase === 'wrong_password' && /failed to load resource|email\/password login failed|invalid login credentials/i.test(message)) {
      return false;
    }
    return !expectedConsoleError.test(message);
  });
  return {
    expectedAuthFailures: expectedAuthFailures.length,
    criticalFailedRequests: criticalFailedRequests.length,
    criticalConsoleErrors: criticalConsoleErrors.length,
    criticalConsoleSamples: criticalConsoleErrors.slice(0, 5).map((entry) => sanitizeMessage(typeof entry === 'string' ? entry : entry.text)),
    pageErrors: runtime.pageErrors.length,
  };
}

function renderReport(result) {
  const buttonRows = result.buttonAudit.map((item) => `| ${item.name} | ${item.status} | ${item.note || ''} |`);
  const runtime = result.runtimeSummary;
  const lines = [
    '# VF Real User Journey UAT - 2026-06-26',
    '',
    `Status: ${result.status}`,
    '',
    `URL testada: ${result.url}`,
    `Run ID: ${result.runId}`,
    `Inicio: ${result.startedAt}`,
    `Fim: ${result.finishedAt}`,
    '',
    '## Correcao de criterio',
    '',
    '- UAT massivo anterior reclassificado como PASS tecnico controlado.',
    '- UAT real fim a fim exige navegador limpo, URL publica, cliques em botoes visiveis e login pela UI real.',
    '- Service role foi usado somente para setup/cleanup administrativo local.',
    '',
    '## Botoes e links visiveis auditados',
    '',
    '| Item | Status | Observacao |',
    '|---|---|---|',
    ...buttonRows,
    '',
    '## Caminhos testados',
    '',
    `- Login e-mail/senha: ${result.auth}`,
    `- Redirect Google ausente: ${result.googleRedirectAbsent}`,
    `- CRUD local/imovel: ${result.crudProperty}`,
    `- CRUD vistoria/comodos: ${result.crudInspectionRooms}`,
    `- Fotos via UI: ${result.photos}`,
    `- Limite de plano via UI: ${result.planLimit}`,
    `- Fallback Sem Analise de IA: ${result.aiFallback}`,
    `- Revisao manual: ${result.manualReview}`,
    `- Persistencia/retomada: ${result.persistence}`,
    `- Cleanup: ${result.cleanup}`,
    '',
    '## Caminhos removidos/ocultados',
    '',
    `- Entrar com o Google: ${result.googleButton}`,
    `- Texto tecnico de staging na jornada publica: ${result.technicalText}`,
    '',
    '## Runtime',
    '',
    `- Console errors criticos: ${runtime.criticalConsoleErrors}`,
    ...(runtime.criticalConsoleSamples?.length ? runtime.criticalConsoleSamples.map((message) => `  - ${message}`) : []),
    `- Page errors: ${runtime.pageErrors}`,
    `- Failed requests criticos: ${runtime.criticalFailedRequests}`,
    `- Failed requests esperados na senha errada: ${runtime.expectedAuthFailures}`,
    '',
    '## Cleanup',
    '',
    `- Cleanup total: ${result.cleanup}`,
    `- Leftovers: ${result.cleanupDetails ? JSON.stringify(result.cleanupDetails.leftovers) : 'nao executado'}`,
    '',
    '## Decisao',
    '',
    result.status === 'PASS'
      ? 'UAT manual pode comecar como rodada controlada. UAT nao foi liberado automaticamente.'
      : 'UAT manual nao deve comecar ate resolver o bloqueio/falha registrado.',
    '',
    result.error ? `Erro: ${result.error}` : '',
    '',
  ];
  return lines.join('\n');
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
    auth: 'NOT_RUN',
    googleRedirectAbsent: 'NOT_RUN',
    crudProperty: 'NOT_RUN',
    crudInspectionRooms: 'NOT_RUN',
    photos: 'NOT_RUN',
    planLimit: 'NOT_RUN',
    aiFallback: 'NOT_RUN',
    manualReview: 'NOT_RUN',
    persistence: 'NOT_RUN',
    cleanup: 'NOT_RUN',
    googleButton: 'NOT_RUN',
    technicalText: 'NOT_RUN',
    buttonAudit: [],
    runtimeSummary: { criticalConsoleErrors: 0, criticalConsoleSamples: [], pageErrors: 0, criticalFailedRequests: 0, expectedAuthFailures: 0 },
    cleanupDetails: null,
    error: null,
  };

  const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) {
    result.status = 'BLOCKED';
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

  let provisioned = null;
  let browser = null;
  let page = null;
  const runtime = { phase: 'bootstrap', consoleErrors: [], pageErrors: [], failedRequests: [] };

  try {
    provisioned = await createUserAndEntitlement(admin);
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
    const response = await page.goto(`${TARGET_URL}/?real_uat=${RUN_ID}`, { waitUntil: 'networkidle', timeout: 60_000 });
    if ((response?.status() || 0) !== 200) throw new Error(`HTTP status ${response?.status() || 'unknown'}`);

    const loginButtons = await visibleButtons(page);
    const googleVisible = await visibleOrFalse(page.getByRole('button', { name: /Entrar com o Google/i }));
    const publicFormVisible = await visibleOrFalse(page.getByTestId('public-email-auth-form'));
    const oldTechnicalFormVisible = await visibleOrFalse(page.getByTestId('staging-email-auth-form'));
    const bodyText = await page.locator('body').innerText();
    result.googleButton = googleVisible ? 'FAIL' : 'OCULTADO_CORRETAMENTE';
    result.technicalText = /ACESSO TECNICO|ACESSO T.CNICO|Email tecnico|Senha tecnica|Entrar no staging/i.test(bodyText) || oldTechnicalFormVisible
      ? 'FAIL'
      : 'OCULTADO_CORRETAMENTE';
    result.buttonAudit.push(
      { name: 'Entrar', status: loginButtons.some((text) => /^Entrar$/i.test(text)) ? 'PASS' : 'FAIL', note: 'Botao principal de login por e-mail/senha.' },
      { name: 'Google login', status: googleVisible ? 'FAIL' : 'OCULTADO_CORRETAMENTE', note: 'Provider Google nao esta habilitado neste ambiente.' },
    );

    if (googleVisible) throw new Error('Google login button is visible while VITE_ENABLE_GOOGLE_AUTH is not enabled on target.');
    if (!publicFormVisible) throw new Error('public email/password form is not visible on target.');
    await page.getByLabel(/^E-mail$/i).waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByLabel(/^Senha$/i).waitFor({ state: 'visible', timeout: 10_000 });

    runtime.phase = 'wrong_password';
    await page.getByLabel(/^E-mail$/i).fill(provisioned.email);
    await page.getByLabel(/^Senha$/i).fill(`wrong-${provisioned.password}`);
    await page.getByRole('button', { name: /^Entrar$/i }).click();
    await page.getByText(/E-mail ou senha invalidos/i).waitFor({ state: 'visible', timeout: 20_000 });

    runtime.phase = 'correct_login';
    await page.getByLabel(/^Senha$/i).fill(provisioned.password);
    await page.getByRole('button', { name: /^Entrar$/i }).click();
    await page.getByText(/Meus Im.veis/i).waitFor({ state: 'visible', timeout: 30_000 });
    if (/provider=google|\/auth\/v1\/authorize/i.test(page.url())) throw new Error('unexpected Google OAuth redirect');
    result.auth = 'PASS';
    result.googleRedirectAbsent = 'PASS';

    const propertyName = `Real UAT ${RUN_ID}`;
    const editedPropertyName = `${propertyName} editado`;
    runtime.phase = 'create_property';
    result.buttonAudit.push({ name: 'Criar local/imovel', status: 'PASS', note: 'Botao Cadastrar visivel e exercitado.' });
    await page.getByRole('button', { name: /Cadastrar/i }).first().click();
    const inputs = page.locator('form input');
    await inputs.nth(0).fill(propertyName);
    await inputs.nth(1).fill('01001-000');
    await inputs.nth(2).fill('SP');
    await inputs.nth(3).fill(`Rua Real UAT ${RUN_ID}`);
    await inputs.nth(4).fill('101');
    await inputs.nth(5).fill('Apto UAT');
    await inputs.nth(6).fill('Centro');
    await inputs.nth(7).fill('Sao Paulo');
    await inputs.nth(8).fill(`Referencia ${RUN_ID}`);
    await page.locator('form textarea').fill(`Teste real publico ${RUN_ID}`);
    await page.getByRole('button', { name: /Salvar Im.vel/i }).click();
    await page.locator('[data-testid^="property-card-"]').filter({ hasText: propertyName }).first().waitFor({ state: 'visible', timeout: 30_000 });

    runtime.phase = 'edit_property';
    const propertyCard = page.locator('[data-testid^="property-card-"]').filter({ hasText: propertyName });
    await propertyCard.locator('button[title^="Editar"]').click();
    await page.locator('form input').nth(0).fill(editedPropertyName);
    await page.locator('form textarea').fill(`Teste real publico editado ${RUN_ID}`);
    await page.getByRole('button', { name: /Salvar Im.vel/i }).click();
    await page.locator('[data-testid^="property-card-"]').filter({ hasText: editedPropertyName }).first().waitFor({ state: 'visible', timeout: 30_000 });
    result.buttonAudit.push({ name: 'Editar local/imovel', status: 'PASS', note: 'Botao de edicao exercitado pela UI.' });
    result.crudProperty = 'PASS';

    runtime.phase = 'create_inspection';
    await page.locator('[data-testid^="property-card-"]').filter({ hasText: editedPropertyName }).getByRole('button', { name: /Nova Vistoria/i }).click();
    await page.getByText(/Iniciar Nova Vistoria/i).waitFor({ state: 'visible', timeout: 20_000 });
    await page.getByRole('button', { name: /Vistoria de Entrada/i }).click();
    await page.getByRole('button', { name: /Come.ar Vistoria/i }).click();
    await page.getByText(/Registro de Fotos:/i).waitFor({ state: 'visible', timeout: 30_000 });
    result.buttonAudit.push(
      { name: 'Nova vistoria', status: 'PASS', note: 'Botao visivel e exercitado.' },
      { name: 'Entrada/Saida', status: 'PASS', note: 'Escolha Entrada/Saida visivel; Entrada exercitada.' },
    );

    runtime.phase = 'rooms';
    const mainRoom = `Comodo Real ${RUN_ID.slice(-6)}`;
    const tempRoom = `Temp Real ${RUN_ID.slice(-6)}`;
    const editedRoom = `Editado Real ${RUN_ID.slice(-6)}`;
    await page.getByPlaceholder(/Novo c.modo/i).fill(mainRoom);
    await page.getByTitle(/Adicionar c.modo/i).click();
    await page.getByText(mainRoom).waitFor({ state: 'visible', timeout: 20_000 });
    await page.getByPlaceholder(/Novo c.modo/i).fill(tempRoom);
    await page.getByTitle(/Adicionar c.modo/i).click();
    await page.getByText(tempRoom).waitFor({ state: 'visible', timeout: 20_000 });
    const tempGroup = roomRow(page, tempRoom);
    await tempGroup.hover();
    await tempGroup.locator('button[title="Renomear"]').click();
    await page.getByPlaceholder(/Novo nome do c.modo/i).fill(editedRoom);
    await page.getByRole('button', { name: /^Salvar$/i }).click();
    await page.getByText(editedRoom).waitFor({ state: 'visible', timeout: 20_000 });
    const editedGroup = roomRow(page, editedRoom);
    await editedGroup.hover();
    await hoverRoomAction(page, editedGroup);
    await editedGroup.locator('button[title="Excluir"]').click({ timeout: 10_000 });
    await page.getByText(editedRoom).waitFor({ state: 'detached', timeout: 20_000 }).catch(async () => {
      if (await visibleOrFalse(page.getByText(editedRoom))) throw new Error('edited room still visible after delete');
    });
    result.buttonAudit.push(
      { name: 'Adicionar comodo', status: 'PASS', note: 'Criacao de comodo pela UI.' },
      { name: 'Editar comodo', status: 'PASS', note: 'Renomeacao de comodo pela UI.' },
      { name: 'Deletar comodo', status: 'PASS', note: 'Exclusao visivel e exercitada antes de fotos.' },
    );
    result.crudInspectionRooms = 'PASS';

    runtime.phase = 'photos';
    await selectRoom(page, mainRoom);
    const uploadInput = page.locator('input[type="file"][multiple]').last();
    await uploadInput.setInputFiles(photoFiles(`${RUN_ID}-initial`, 1));
    await page.getByText(/Sem An.lise de IA/i).first().waitFor({ state: 'visible', timeout: 60_000 });
    await page.getByRole('button', { name: /Confirmar Revis.o/i }).first().click();
    await page.getByText(/Confirmado/i).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('button[title="Excluir foto"]').first().click();
    await page.getByText(/Nenhuma foto enviada neste c.modo/i).waitFor({ state: 'visible', timeout: 30_000 });
    await uploadInput.setInputFiles(photoFiles(`${RUN_ID}-replacement`, 1));
    await page.getByText(/Sem An.lise de IA/i).first().waitFor({ state: 'visible', timeout: 60_000 });
    await page.getByRole('button', { name: /Confirmar Revis.o/i }).first().click();
    await page.getByText(/Confirmado/i).first().waitFor({ state: 'visible', timeout: 30_000 });
    result.photos = 'PASS';
    result.aiFallback = 'PASS';
    result.manualReview = 'PASS';
    result.buttonAudit.push(
      { name: 'Adicionar foto', status: 'PASS', note: 'Upload pela UI com input de arquivo.' },
      { name: 'Deletar foto', status: 'PASS', note: 'Exclusao de foto pela UI.' },
    );

    runtime.phase = 'plan_limit';
    const limit = Number(provisioned.plan.max_photos_per_inspection);
    if (limit > 1) {
      await uploadInput.setInputFiles(photoFiles(`${RUN_ID}-limit`, limit - 1));
      await waitForPhotoCount(page, limit, Math.max(180_000, limit * 8_000));
    }
    const limitDisabled = await page.getByRole('button', { name: /Escolher da Galeria/i }).first().isDisabled().catch(() => false);
    if (!limitDisabled) throw new Error('plan photo limit is not disabled in UI at the limit');
    result.planLimit = 'PASS';

    runtime.phase = 'persistence';
    await page.getByLabel(/Voltar para hist.rico/i).click();
    await page.getByText(/Hist.rico de Vistorias/i).waitFor({ state: 'visible', timeout: 20_000 });
    await page.getByRole('button', { name: /Continuar Rascunho/i }).first().click();
    await page.getByText(mainRoom).waitFor({ state: 'visible', timeout: 30_000 });
    await assertRoomPhotosVisibleAfterResume(page, mainRoom);
    result.persistence = 'PASS';
    result.buttonAudit.push({ name: 'Voltar/Sair/Retomar', status: 'PASS', note: 'Historico e Continuar Rascunho exercitados.' });

    runtime.phase = 'finish_review_button';
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
    result.buttonAudit.push({
      name: 'Concluir/Revisar',
      status: 'PASS',
      note: finishDialog ? 'Botao exercitado; bloqueio validado por gate de conclusao.' : 'Botao exercitado e avancou para revisao/relatorio.',
    });

    result.status = 'PASS';
  } catch (error) {
    const message = sanitizeMessage(error?.message || error);
    result.error = message;
    result.status = /missing|not visible|google login button|deploy|provider|permission|policy|rls/i.test(message) ? 'BLOCKED' : 'FAIL';
    if (page) {
      mkdirSync('test-results', { recursive: true });
      await page.screenshot({ path: `test-results/vf-real-user-journey-${RUN_ID}.png`, fullPage: true }).catch(() => undefined);
    }
  } finally {
    if (page) {
      result.runtimeSummary = classifyRuntime(runtime);
    }
    if (browser) await browser.close().catch(() => undefined);
    if (provisioned?.userId) {
      result.cleanupDetails = await cleanup(admin, provisioned.userId).catch((error) => ({
        ok: false,
        errors: [sanitizeMessage(error?.message || error)],
        leftovers: { cleanupFailed: true },
      }));
      result.cleanup = result.cleanupDetails.ok ? 'PASS' : 'FAIL';
      if (result.status === 'PASS' && result.cleanup !== 'PASS') result.status = 'BLOCKED';
    }
    if (
      result.status === 'PASS'
      && (
        result.runtimeSummary.criticalConsoleErrors > 0
        || result.runtimeSummary.pageErrors > 0
        || result.runtimeSummary.criticalFailedRequests > 0
      )
    ) {
      result.status = 'FAIL';
      result.error = 'critical runtime errors observed during real user journey';
    }
    result.finishedAt = new Date().toISOString();
    writeFileSync(REPORT_PATH, renderReport(result), 'utf8');
  }

  console.log(JSON.stringify({
    status: result.status,
    url: TARGET_URL,
    auth: result.auth,
    googleButton: result.googleButton,
    crudProperty: result.crudProperty,
    crudInspectionRooms: result.crudInspectionRooms,
    photos: result.photos,
    planLimit: result.planLimit,
    persistence: result.persistence,
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
    auth: 'NOT_RUN',
    googleRedirectAbsent: 'NOT_RUN',
    crudProperty: 'NOT_RUN',
    crudInspectionRooms: 'NOT_RUN',
    photos: 'NOT_RUN',
    planLimit: 'NOT_RUN',
    aiFallback: 'NOT_RUN',
    manualReview: 'NOT_RUN',
    persistence: 'NOT_RUN',
    cleanup: 'NOT_RUN',
    googleButton: 'NOT_RUN',
    technicalText: 'NOT_RUN',
    buttonAudit: [],
    runtimeSummary: { criticalConsoleErrors: 0, criticalConsoleSamples: [], pageErrors: 0, criticalFailedRequests: 0, expectedAuthFailures: 0 },
    cleanupDetails: null,
    error: sanitizeMessage(error?.message || error),
  };
  writeFileSync(REPORT_PATH, renderReport(result), 'utf8');
  console.log(`BLOCKED: ${result.error}`);
  process.exitCode = 2;
});
