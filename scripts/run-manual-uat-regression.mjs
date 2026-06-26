import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const TARGET_URL = process.env.UAT_MANUAL_BASE_URL || process.env.UAT_REAL_BASE_URL || 'https://glittery-boba-2b3367.netlify.app';
const REPORT_PATH = 'qa/vf_manual_uat_regression_20260626.md';
const BUCKET = 'inspection-photos';
const RUN_ID = `manual_regression_${Date.now()}`;
const TEST_EMAIL = `e2e-manual-regression-${RUN_ID}@vistoriafacilia.com`;
const TEST_PASSWORD = `ManualRegression-${RUN_ID}!`;

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
  return text.replace(/\s+/g, ' ').slice(0, 400);
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

async function visibleOrFalse(locator) {
  return locator.isVisible().catch(() => false);
}

async function hoverRoomAction(page, row) {
  const box = await row.boundingBox();
  if (!box) throw new Error('room row bounding box unavailable');
  await page.mouse.move(box.x + Math.max(1, box.width - 8), box.y + (box.height / 2));
  await page.waitForTimeout(250);
}

async function fillLogin(page, email, password) {
  await page.getByRole('button', { name: /^Entrar$/i }).first().click().catch(() => undefined);
  await page.getByLabel(/^E-mail$/i).fill(email);
  await page.getByLabel(/^Senha$/i).fill(password);
  await page.getByRole('button', { name: /^Entrar$/i }).last().click();
  await page.getByText(/Meus Im.veis/i).waitFor({ state: 'visible', timeout: 30_000 });
}

async function logout(page) {
  await page.getByTitle(/Sair do aplicativo/i).click();
  await page.getByTestId('public-email-auth-form').waitFor({ state: 'visible', timeout: 30_000 });
}

async function createUserAndEntitlement(admin) {
  const user = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { testRunId: RUN_ID, purpose: 'manual_uat_regression' },
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
  const result = { ok: false, leftovers: {}, errors: [] };

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
  const criticalConsoleErrors = runtime.consoleErrors.filter((entry) => {
    const text = entry.text || '';
    return !/erro ao analisar a foto|ia server-side desabilitada|failed to load resource/i.test(text);
  });
  const criticalFailedRequests = runtime.failedRequests.filter((entry) =>
    !/net::ERR_ABORTED|NS_BINDING_ABORTED|operation canceled/i.test(entry.failure || '')
  );
  return {
    criticalConsoleErrors: criticalConsoleErrors.length,
    criticalConsoleSamples: criticalConsoleErrors.slice(0, 5).map((entry) => sanitizeMessage(entry.text)),
    pageErrors: runtime.pageErrors.length,
    failedRequests: criticalFailedRequests.length,
    failedRequestSamples: criticalFailedRequests.slice(0, 5).map((entry) => sanitizeMessage(`${entry.failure} ${entry.url || ''}`)),
    httpErrors: runtime.httpErrors.length,
    httpErrorSamples: runtime.httpErrors.slice(0, 5).map((entry) => `${entry.status} ${entry.url}`),
  };
}

function renderReport(result) {
  const runtime = result.runtimeSummary;
  const lines = [
    '# VF Manual UAT Regression - 2026-06-26',
    '',
    `Status: ${result.status}`,
    '',
    `URL testada: ${result.url}`,
    `Run ID: ${result.runId}`,
    `Inicio: ${result.startedAt}`,
    `Fim: ${result.finishedAt}`,
    '',
    '## Bugs cobertos',
    '',
    `- Bug Ver Planos: ${result.planCta}`,
    `- Bug persistencia de comodos apos logout/login: ${result.roomPersistence}`,
    '',
    '## Causa raiz',
    '',
    '- Ver Planos: PlanGate redirecionava automaticamente para a home quando encontrava entitlement ativo, parecendo que o clique nao fazia nada.',
    '- Comodos: reidratacao de rascunho podia recriar o template default quando a lista persistida vinha vazia; agora defaults sao criados apenas ao iniciar uma nova vistoria.',
    '',
    '## Validacoes',
    '',
    `- Login tecnico por e-mail/senha: ${result.login}`,
    `- Modal/tela de planos aberta: ${result.planScreen}`,
    `- free_10 visivel: ${result.freePlan}`,
    `- beta_paid_4990 visivel: ${result.paidPlan}`,
    `- Mensagem upgrade assistido: ${result.assistedUpgrade}`,
    `- Criar imovel/local: ${result.property}`,
    `- Criar vistoria: ${result.inspection}`,
    `- Renomear comodo: ${result.roomRename}`,
    `- Adicionar comodo: ${result.roomAdd}`,
    `- Deletar comodo: ${result.roomDelete}`,
    `- Navegacao interna preservou comodos: ${result.internalResume}`,
    `- Logout/login preservou comodos: ${result.logoutLoginResume}`,
    `- Banco confirmou estado persistido: ${result.databaseState}`,
    `- Cleanup: ${result.cleanup}`,
    '',
    '## Runtime',
    '',
    `- Console errors criticos: ${runtime.criticalConsoleErrors}`,
    ...(runtime.criticalConsoleSamples?.length ? runtime.criticalConsoleSamples.map((message) => `  - ${message}`) : []),
    `- Page errors: ${runtime.pageErrors}`,
    `- Failed requests: ${runtime.failedRequests}`,
    ...(runtime.failedRequestSamples?.length ? runtime.failedRequestSamples.map((message) => `  - ${message}`) : []),
    `- HTTP errors: ${runtime.httpErrors}`,
    ...(runtime.httpErrorSamples?.length ? runtime.httpErrorSamples.map((message) => `  - ${message}`) : []),
    '',
    '## Cleanup',
    '',
    `- Cleanup total: ${result.cleanup}`,
    `- Leftovers: ${result.cleanupDetails ? JSON.stringify(result.cleanupDetails.leftovers) : 'nao executado'}`,
    '',
    '## Arquivos alterados',
    '',
    '- src/components/PlanGate.tsx',
    '- src/components/InspectionWizard.tsx',
    '- src/App.tsx',
    '- package.json',
    '- scripts/run-manual-uat-regression.mjs',
    '- tests/e2e/vistoria-uat-minimum.spec.ts',
    '- qa/vf_manual_uat_regression_20260626.md',
    '',
    '## Decisao',
    '',
    result.status === 'PASS'
      ? 'UAT manual pode recomecar como rodada controlada apos publicacao do novo commit. UAT nao foi liberado automaticamente.'
      : 'UAT manual nao deve recomecar ate resolver a falha/bloqueio registrado.',
    '',
    result.error ? `Erro: ${result.error}` : '',
    '',
  ];
  return lines.join('\n');
}

async function queryPersistedState(admin, userId, propertyName, expected) {
  const property = await admin
    .from('properties')
    .select('id')
    .eq('user_id', userId)
    .eq('nickname', propertyName)
    .single();
  if (property.error || !property.data?.id) {
    throw new Error(`property not persisted: ${property.error?.message || 'missing'}`);
  }

  const inspection = await admin
    .from('inspections')
    .select('id')
    .eq('user_id', userId)
    .eq('property_id', property.data.id)
    .order('started_at', { ascending: false })
    .limit(1)
    .single();
  if (inspection.error || !inspection.data?.id) {
    throw new Error(`inspection not persisted: ${inspection.error?.message || 'missing'}`);
  }

  const rooms = await admin
    .from('rooms')
    .select('name')
    .eq('inspection_id', inspection.data.id)
    .order('display_order', { ascending: true });
  if (rooms.error) throw new Error(`rooms query failed: ${rooms.error.message}`);
  const names = rooms.data.map((room) => room.name);
  if (!names.includes(expected.renamedRoom)) throw new Error(`renamed room not persisted: ${expected.renamedRoom}`);
  if (!names.includes(expected.addedRoom)) throw new Error(`added room not persisted: ${expected.addedRoom}`);
  if (names.includes(expected.deletedRoom)) throw new Error(`deleted room was recreated: ${expected.deletedRoom}`);
  return { propertyId: property.data.id, inspectionId: inspection.data.id, roomNames: names };
}

async function createProperty(page, propertyName) {
  await page.getByRole('button', { name: /Cadastrar/i }).first().click();
  const inputs = page.locator('form input');
  await inputs.nth(0).fill(propertyName);
  await inputs.nth(1).fill('01001-000');
  await inputs.nth(2).fill('SP');
  await inputs.nth(3).fill(`Rua Manual UAT ${RUN_ID}`);
  await inputs.nth(4).fill('101');
  await inputs.nth(5).fill('Apto UAT');
  await inputs.nth(6).fill('Centro');
  await inputs.nth(7).fill('Sao Paulo');
  await inputs.nth(8).fill(`Referencia ${RUN_ID}`);
  await page.locator('form textarea').fill(`Regressao manual UAT ${RUN_ID}`);
  await page.getByRole('button', { name: /Salvar Im.vel/i }).click();
  await page.locator('[data-testid^="property-card-"]').filter({ hasText: propertyName }).first().waitFor({ state: 'visible', timeout: 30_000 });
}

async function openHistoryAndDraft(page, propertyName) {
  await page.locator('[data-testid^="property-card-"]').filter({ hasText: propertyName }).getByRole('button', { name: /Hist.rico/i }).click();
  await page.getByText(/Hist.rico de Vistorias/i).waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByRole('button', { name: /Continuar Rascunho/i }).first().click();
  await page.getByText(/Registro de Fotos:/i).waitFor({ state: 'visible', timeout: 30_000 });
}

async function assertRoomsVisible(page, expected) {
  await roomRow(page, expected.renamedRoom).waitFor({ state: 'visible', timeout: 30_000 });
  await roomRow(page, expected.addedRoom).waitFor({ state: 'visible', timeout: 30_000 });
  if (await visibleOrFalse(roomRow(page, expected.deletedRoom))) {
    throw new Error(`deleted room visible after resume: ${expected.deletedRoom}`);
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
    login: 'NOT_RUN',
    planCta: 'NOT_RUN',
    planScreen: 'NOT_RUN',
    freePlan: 'NOT_RUN',
    paidPlan: 'NOT_RUN',
    assistedUpgrade: 'NOT_RUN',
    property: 'NOT_RUN',
    inspection: 'NOT_RUN',
    roomRename: 'NOT_RUN',
    roomAdd: 'NOT_RUN',
    roomDelete: 'NOT_RUN',
    internalResume: 'NOT_RUN',
    logoutLoginResume: 'NOT_RUN',
    databaseState: 'NOT_RUN',
    roomPersistence: 'NOT_RUN',
    cleanup: 'NOT_RUN',
    cleanupDetails: null,
    runtimeSummary: { criticalConsoleErrors: 0, criticalConsoleSamples: [], pageErrors: 0, failedRequests: 0, httpErrors: 0, httpErrorSamples: [] },
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

  let provisioned = null;
  let browser = null;
  let page = null;
  const runtime = { phase: 'bootstrap', consoleErrors: [], pageErrors: [], failedRequests: [], httpErrors: [] };

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
      runtime.failedRequests.push({ phase: runtime.phase, resourceType: request.resourceType(), failure: request.failure()?.errorText || 'unknown', url: request.url() });
    });
    page.on('response', (response) => {
      const status = response.status();
      if (status >= 500) runtime.httpErrors.push({ phase: runtime.phase, status, url: response.url() });
    });

    runtime.phase = 'open_public_url';
    const response = await page.goto(`${TARGET_URL}/?manual_uat=${RUN_ID}`, { waitUntil: 'networkidle', timeout: 60_000 });
    if ((response?.status() || 0) !== 200) throw new Error(`HTTP status ${response?.status() || 'unknown'}`);

    runtime.phase = 'login';
    await fillLogin(page, provisioned.email, provisioned.password);
    result.login = 'PASS';

    runtime.phase = 'plan_cta';
    await page.getByText(/Vers.o Beta Limitada a 10 Fotos/i).waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByRole('button', { name: /Ver Planos/i }).click();
    await page.getByText(/Planos de Assinatura/i).waitFor({ state: 'visible', timeout: 30_000 });
    result.planCta = 'PASS';
    result.planScreen = 'PASS';
    await page.getByText(/free_10/i).waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByText(/beta_paid_4990/i).waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByText(/At. 10 fotos/i).first().waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByText(/At. 50 fotos/i).first().waitFor({ state: 'visible', timeout: 10_000 });
    result.freePlan = 'PASS';
    result.paidPlan = 'PASS';
    await page.getByRole('button', { name: /Solicitar upgrade/i }).click();
    await page.getByText(/Upgrade em beta assistido/i).first().waitFor({ state: 'visible', timeout: 10_000 });
    result.assistedUpgrade = 'PASS';
    await page.getByRole('button', { name: /Voltar para im.veis/i }).click();
    await page.getByText(/Meus Im.veis/i).waitFor({ state: 'visible', timeout: 30_000 });

    runtime.phase = 'create_property';
    const propertyName = `Manual UAT ${RUN_ID}`;
    await createProperty(page, propertyName);
    result.property = 'PASS';

    runtime.phase = 'create_inspection';
    await page.locator('[data-testid^="property-card-"]').filter({ hasText: propertyName }).getByRole('button', { name: /Nova Vistoria/i }).click();
    await page.getByText(/Iniciar Nova Vistoria/i).waitFor({ state: 'visible', timeout: 20_000 });
    await page.getByRole('button', { name: /Vistoria de Entrada/i }).click();
    await page.getByRole('button', { name: /Come.ar Vistoria/i }).click();
    await page.getByText(/Registro de Fotos:/i).waitFor({ state: 'visible', timeout: 30_000 });
    result.inspection = 'PASS';

    runtime.phase = 'rooms';
    const expected = {
      renamedRoom: `Sala Persistida ${RUN_ID.slice(-6)}`,
      addedRoom: `Comodo Novo ${RUN_ID.slice(-6)}`,
      deletedRoom: 'Quarto 2',
    };

    const salaRow = roomRow(page, 'Sala');
    await salaRow.waitFor({ state: 'visible', timeout: 20_000 });
    await salaRow.hover();
    await hoverRoomAction(page, salaRow);
    await salaRow.locator('button[title="Renomear"]').click();
    await page.getByPlaceholder(/Novo nome do c.modo/i).fill(expected.renamedRoom);
    await page.getByRole('button', { name: /^Salvar$/i }).click();
    await roomRow(page, expected.renamedRoom).waitFor({ state: 'visible', timeout: 30_000 });
    result.roomRename = 'PASS';

    await page.getByPlaceholder(/Novo c.modo/i).fill(expected.addedRoom);
    await page.getByTitle(/Adicionar c.modo/i).click();
    await roomRow(page, expected.addedRoom).waitFor({ state: 'visible', timeout: 30_000 });
    result.roomAdd = 'PASS';

    const deleteRow = roomRow(page, expected.deletedRoom);
    await deleteRow.waitFor({ state: 'visible', timeout: 20_000 });
    await deleteRow.hover();
    await hoverRoomAction(page, deleteRow);
    await deleteRow.locator('button[title="Excluir"]').click();
    await roomRow(page, expected.deletedRoom).waitFor({ state: 'detached', timeout: 20_000 }).catch(async () => {
      if (await visibleOrFalse(roomRow(page, expected.deletedRoom))) {
        throw new Error(`deleted room still visible: ${expected.deletedRoom}`);
      }
    });
    result.roomDelete = 'PASS';

    runtime.phase = 'internal_resume';
    await page.getByLabel(/Voltar para hist.rico/i).click();
    await page.getByText(/Hist.rico de Vistorias/i).waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByRole('button', { name: /Continuar Rascunho/i }).first().click();
    await page.getByText(/Registro de Fotos:/i).waitFor({ state: 'visible', timeout: 30_000 });
    await assertRoomsVisible(page, expected);
    result.internalResume = 'PASS';

    runtime.phase = 'logout_login_resume';
    await logout(page);
    await fillLogin(page, provisioned.email, provisioned.password);
    await openHistoryAndDraft(page, propertyName);
    await assertRoomsVisible(page, expected);
    result.logoutLoginResume = 'PASS';
    result.roomPersistence = 'PASS';

    runtime.phase = 'database_state';
    await queryPersistedState(admin, provisioned.userId, propertyName, expected);
    result.databaseState = 'PASS';

    result.status = 'PASS';
  } catch (error) {
    const message = sanitizeMessage(error?.message || error);
    result.error = message;
    result.status = /missing|not visible|permission|policy|rls|rate limit|cleanup|service/i.test(message) ? 'BLOCKED' : 'FAIL';
    if (page) {
      mkdirSync('test-results', { recursive: true });
      await page.screenshot({ path: `test-results/vf-manual-uat-regression-${RUN_ID}.png`, fullPage: true }).catch(() => undefined);
    }
  } finally {
    if (page) result.runtimeSummary = classifyRuntime(runtime);
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
        || result.runtimeSummary.failedRequests > 0
        || result.runtimeSummary.httpErrors > 0
      )
    ) {
      result.status = 'FAIL';
      result.error = 'critical runtime errors observed during manual UAT regression';
    }
    result.finishedAt = new Date().toISOString();
    writeFileSync(REPORT_PATH, renderReport(result), 'utf8');
  }

  console.log(JSON.stringify({
    status: result.status,
    url: TARGET_URL,
    planCta: result.planCta,
    roomPersistence: result.roomPersistence,
    logoutLoginResume: result.logoutLoginResume,
    databaseState: result.databaseState,
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
    login: 'NOT_RUN',
    planCta: 'NOT_RUN',
    planScreen: 'NOT_RUN',
    freePlan: 'NOT_RUN',
    paidPlan: 'NOT_RUN',
    assistedUpgrade: 'NOT_RUN',
    property: 'NOT_RUN',
    inspection: 'NOT_RUN',
    roomRename: 'NOT_RUN',
    roomAdd: 'NOT_RUN',
    roomDelete: 'NOT_RUN',
    internalResume: 'NOT_RUN',
    logoutLoginResume: 'NOT_RUN',
    databaseState: 'NOT_RUN',
    roomPersistence: 'NOT_RUN',
    cleanup: 'NOT_RUN',
    cleanupDetails: null,
    runtimeSummary: { criticalConsoleErrors: 0, criticalConsoleSamples: [], pageErrors: 0, failedRequests: 0, httpErrors: 0, httpErrorSamples: [] },
    error: sanitizeMessage(error?.message || error),
  };
  writeFileSync(REPORT_PATH, renderReport(result), 'utf8');
  console.log(`BLOCKED: ${result.error}`);
  process.exitCode = 2;
});
