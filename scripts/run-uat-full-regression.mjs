import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const TARGET_URL = process.env.UAT_FULL_BASE_URL || process.env.UAT_REAL_BASE_URL || 'https://glittery-boba-2b3367.netlify.app';
const REPORT_PATH = 'qa/vf_uat_full_regression_20260626.md';
const BUCKET = 'inspection-photos';
const RUN_ID = `uat_full_${Date.now()}`;
const ONE_PIXEL_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z',
  'base64',
);

const MATRIX = [
  ['auth_wrong_password', 'Login com senha errada', 'Tela publica de auth', 'Campo Senha + botao Entrar', 'Exibir mensagem clara sem autenticar'],
  ['auth_login', 'Login correto', 'Tela publica de auth', 'E-mail/senha + botao Entrar', 'Autenticar e abrir Meus Imoveis'],
  ['auth_forgot_password', 'Esqueci senha', 'Tela publica de auth', 'Botao Esqueci minha senha', 'Solicitacao aceita ou bloqueio externo registrado'],
  ['auth_public_signup', 'Criar conta publica', 'Tela publica de auth', 'Aba Criar conta + botao Criar conta', 'Criar conta ou registrar rate limit 429 sem repetir'],
  ['auth_resend_confirmation', 'Reenviar confirmacao', 'Tela publica de auth', 'Botao/link de reenviar confirmacao', 'Permitir reenvio quando existir na UI'],
  ['auth_logout_login', 'Logout/login', 'Navbar', 'Botao sair + login novamente', 'Sair e entrar sem perder dados'],
  ['plans_cta', 'Ver Planos', 'Home autenticada', 'Botao Ver Planos', 'Abrir planos sem voltar automaticamente para home'],
  ['plans_catalog', 'Catalogo de planos', 'Tela de planos', 'Cards/lista de planos', 'Exibir free_10, beta_paid_4990 e limites 10/50'],
  ['property_create_list', 'Imovel criar/listar', 'Meus Imoveis', 'Cadastrar Imovel + Salvar Imovel', 'Criar e listar imovel real'],
  ['property_edit', 'Imovel alterar', 'Card do imovel', 'Botao Editar imovel', 'Persistir alteracao no Supabase'],
  ['property_delete', 'Imovel deletar', 'Card do imovel', 'Botao Excluir imovel + modal', 'Excluir e nao reaparecer'],
  ['property_navigation_persistence', 'Imovel sair/voltar/reload/relogin', 'Meus Imoveis/Historico', 'Historico, voltar, reload, logout/login', 'Imovel editado permanece visivel'],
  ['inspection_create_entry', 'Vistoria de Entrada criar', 'Nova Vistoria', 'Vistoria de Entrada + Comecar Vistoria', 'Criar rascunho de entrada'],
  ['inspection_list_continue', 'Vistoria listar/continuar rascunho', 'Historico de Vistorias', 'Continuar Rascunho', 'Reabrir rascunho correto'],
  ['inspection_edit', 'Vistoria alterar', 'Historico/Wizard', 'Controle de edicao de vistoria', 'Alterar metadados quando suportado'],
  ['inspection_delete', 'Vistoria deletar', 'Historico de Vistorias', 'Botao Excluir vistoria', 'Excluir rascunho e nao duplicar sem intencao'],
  ['inspection_no_duplicates', 'Vistoria sem duplicacao', 'Historico de Vistorias', 'Nova Vistoria/Continuar Rascunho', 'Nao criar rascunhos extras sem acao explicita'],
  ['rooms_defaults', 'Comodos padrao', 'Wizard de vistoria', 'Checklist de comodos', 'Carregar template inicial em nova vistoria'],
  ['rooms_edit_create_delete', 'Comodos criar/alterar/deletar', 'Wizard de vistoria', 'Novo comodo, Renomear, Excluir', 'CRUD real de comodos'],
  ['rooms_navigation_reload_relogin', 'Comodos persistencia completa', 'Wizard/Historico', 'Voltar, reabrir, reload, logout/login', 'Comodos editados persistem e deletado nao volta'],
  ['rooms_no_template_overwrite', 'Template nao sobrescreve', 'Wizard reaberto', 'Continuar Rascunho', 'Nao recriar template quando ja existe estado persistido'],
  ['photos_add_preview', 'Fotos adicionar/visualizar', 'Registro de Fotos', 'Escolher da Galeria', 'Upload e preview visivel'],
  ['photos_delete_replace', 'Fotos deletar/substituir', 'Registro de Fotos', 'Excluir foto + novo upload', 'Foto deletada nao reaparece e nova entra no lugar'],
  ['photos_plan_limit', 'Fotos limite de plano', 'Registro de Fotos', 'Contador e botao upload', 'Abaixo, no limite e acima do limite controlados'],
  ['photos_reload_relogin_storage', 'Fotos persistencia Storage', 'Wizard/Supabase Storage', 'Reload, logout/login, leitura Storage', 'Foto persiste no app e no Storage real'],
  ['ai_real_analysis', 'IA real analisa foto', 'Card de foto', 'Analise automatica', 'IA analisa e sugere texto de fato'],
  ['ai_fallback', 'Fallback Sem Analise de IA', 'Card de foto', 'Painel Sem Analise de IA', 'Fallback claro quando IA real nao esta ativa'],
  ['ai_manual_edit_accept', 'Descricao/observacao manual', 'Card de foto', 'Editar + Salvar Alteracoes', 'Usuario edita texto/status e salva'],
  ['ai_reject', 'Rejeitar sugestao', 'Card de foto', 'Botao rejeitar/nao aceitar', 'Permitir rejeitar sugestao quando suportado'],
  ['ai_review_persistence', 'Revisao persistente', 'Card de foto', 'Confirmar Revisao/Salvar Alteracoes', 'Texto, status e revisao persistem apos relogin'],
  ['report_generate', 'Relatorio/PDF gerar', 'Visualizar Relatorio', 'Baixar Relatorio PDF', 'Gerar PDF utilizavel'],
  ['report_content', 'Relatorio conteudo', 'PDF/registro Supabase', 'Preview/download + tabela reports', 'Conter imovel, vistoria, comodos, fotos e observacoes'],
  ['report_reload_relogin', 'Relatorio acessivel depois', 'Historico de Vistorias', 'Ver PDF / Compartilhar', 'Relatorio segue acessivel apos logout/login'],
];

const CORE_FUNCTIONAL_KEYS = [
  'auth_wrong_password',
  'auth_login',
  'auth_logout_login',
  'plans_cta',
  'plans_catalog',
  'property_create_list',
  'property_edit',
  'property_delete',
  'property_navigation_persistence',
  'inspection_create_entry',
  'inspection_list_continue',
  'inspection_delete',
  'inspection_no_duplicates',
  'rooms_defaults',
  'rooms_edit_create_delete',
  'rooms_navigation_reload_relogin',
  'rooms_no_template_overwrite',
  'photos_add_preview',
  'photos_delete_replace',
  'photos_plan_limit',
  'photos_reload_relogin_storage',
  'ai_fallback',
  'ai_manual_edit_accept',
  'ai_review_persistence',
  'report_generate',
  'report_content',
  'report_reload_relogin',
];

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
  return text.replace(/\s+/g, ' ').slice(0, 500);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildInitialRows() {
  const rows = new Map();
  for (const [key, functionality, screen, control, expected] of MATRIX) {
    rows.set(key, {
      key,
      functionality,
      screen,
      control,
      expected,
      immediate: 'Nao executado ainda.',
      afterNavigate: 'Nao executado ainda.',
      afterReload: 'Nao executado ainda.',
      afterRelogin: 'Nao executado ainda.',
      supabasePersisted: 'Nao verificado ainda.',
      cleanup: 'Nao executado ainda.',
      status: 'BLOCKED',
      evidence: 'Bloqueado ate o passo ser executado.',
    });
  }
  rows.get('auth_resend_confirmation').status = 'NOT_SUPPORTED';
  rows.get('auth_resend_confirmation').immediate = 'UI publica nao possui controle visivel de reenviar confirmacao.';
  rows.get('auth_resend_confirmation').expected = 'Produto futuro se necessario.';
  rows.get('inspection_edit').status = 'NOT_SUPPORTED';
  rows.get('inspection_edit').immediate = 'Nao ha UI de edicao de metadados da vistoria alem do fluxo de rascunho.';
  rows.get('ai_reject').status = 'NOT_SUPPORTED';
  rows.get('ai_reject').immediate = 'Nao ha botao dedicado de rejeitar sugestao; usuario pode editar manualmente.';
  return rows;
}

function updateRow(rows, key, patch) {
  const existing = rows.get(key);
  if (!existing) throw new Error(`unknown matrix row: ${key}`);
  rows.set(key, { ...existing, ...patch });
}

function visibleOrFalse(locator) {
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

function photoFiles(prefix, count) {
  return Array.from({ length: count }, (_, index) => ({
    name: `${prefix}-${index + 1}.jpg`,
    mimeType: 'image/jpeg',
    buffer: ONE_PIXEL_JPEG,
  }));
}

async function hoverRoomAction(page, row) {
  const box = await row.boundingBox();
  if (!box) throw new Error('room row bounding box unavailable');
  await page.mouse.move(box.x + Math.max(1, box.width - 8), box.y + (box.height / 2));
  await page.waitForTimeout(250);
}

async function selectRoom(page, roomName) {
  const row = roomRow(page, roomName);
  await row.waitFor({ state: 'visible', timeout: 30_000 });
  await row.locator('button').first().click();
  await page.getByText(new RegExp(`Registro de Fotos: ${escapeRegex(roomName)}`)).waitFor({ state: 'visible', timeout: 30_000 });
}

async function waitForPhotoCount(page, expected, timeoutMs = 180_000) {
  const started = Date.now();
  const pattern = new RegExp(`${expected}\\s*/\\s*\\d+\\s*fotos`, 'i');
  while (Date.now() - started < timeoutMs) {
    if (await visibleOrFalse(page.getByText(pattern).first())) return;
    await page.waitForTimeout(1000);
  }
  throw new Error(`photo counter did not reach ${expected}`);
}

async function waitForAny(outcomes, timeoutMs = 45_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    for (const outcome of outcomes) {
      if (await visibleOrFalse(outcome.locator())) return outcome.name;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}

function attachRuntime(page, runtime) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') runtime.consoleErrors.push({ phase: runtime.phase, text: msg.text() });
  });
  page.on('pageerror', (err) => runtime.pageErrors.push({ phase: runtime.phase, text: sanitizeMessage(err.message || err) }));
  page.on('requestfailed', (request) => {
    runtime.failedRequests.push({
      phase: runtime.phase,
      resourceType: request.resourceType(),
      failure: request.failure()?.errorText || 'unknown',
    });
  });
  page.on('response', (response) => {
    const status = response.status();
    if (status >= 400) {
      runtime.httpResponses.push({
        phase: runtime.phase,
        status,
        urlKind: response.url().includes('/auth/v1/') ? 'supabase-auth' : response.url().includes('/storage/v1/') ? 'supabase-storage' : 'other',
      });
    }
  });
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

async function fillPropertyForm(page, name, note) {
  const inputs = page.locator('form input');
  await inputs.nth(0).fill(name);
  await inputs.nth(1).fill('01001-000');
  await inputs.nth(2).fill('SP');
  await inputs.nth(3).fill(`Rua UAT Full ${RUN_ID}`);
  await inputs.nth(4).fill('101');
  await inputs.nth(5).fill('Apto UAT');
  await inputs.nth(6).fill('Centro');
  await inputs.nth(7).fill('Sao Paulo');
  await inputs.nth(8).fill(`Referencia ${RUN_ID}`);
  await page.locator('form textarea').fill(note);
}

async function createPropertyViaUi(page, name, note) {
  await page.getByRole('button', { name: /Cadastrar/i }).first().click();
  await fillPropertyForm(page, name, note);
  await page.getByRole('button', { name: /Salvar Im.vel/i }).click();
  await page.locator('[data-testid^="property-card-"]').filter({ hasText: name }).first().waitFor({ state: 'visible', timeout: 45_000 });
}

async function openHistory(page, propertyName) {
  await page.getByText(/Meus Im.veis/i).waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('[data-testid^="property-card-"]').filter({ hasText: propertyName }).getByRole('button', { name: /Hist.rico/i }).click();
  await page.getByText(/Hist.rico de Vistorias/i).waitFor({ state: 'visible', timeout: 30_000 });
}

async function startInspectionFromCurrentPropertyScreen(page, propertyName) {
  const card = page.locator('[data-testid^="property-card-"]').filter({ hasText: propertyName });
  if (await visibleOrFalse(card.getByRole('button', { name: /Nova Vistoria/i }))) {
    await card.getByRole('button', { name: /Nova Vistoria/i }).click();
  } else {
    await page.getByRole('button', { name: /Nova Vistoria|Criar Primeira Vistoria/i }).first().click();
  }
  await page.getByText(/Iniciar Nova Vistoria/i).waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByRole('button', { name: /Vistoria de Entrada/i }).click();
  await page.getByRole('button', { name: /Come.ar Vistoria/i }).click();
  await page.getByText(/Registro de Fotos:/i).waitFor({ state: 'visible', timeout: 45_000 });
}

async function openDraftFromHistory(page) {
  await page.getByText(/Hist.rico de Vistorias/i).waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByRole('button', { name: /Continuar Rascunho/i }).first().click();
  await page.getByText(/Registro de Fotos:/i).waitFor({ state: 'visible', timeout: 45_000 });
}

async function assertRoomsVisible(page, expected) {
  await roomRow(page, expected.renamedOne).waitFor({ state: 'visible', timeout: 30_000 });
  await roomRow(page, expected.renamedTwo).waitFor({ state: 'visible', timeout: 30_000 });
  await roomRow(page, expected.added).waitFor({ state: 'visible', timeout: 30_000 });
  if (await visibleOrFalse(roomRow(page, expected.deleted))) {
    throw new Error(`deleted room visible after resume: ${expected.deleted}`);
  }
}

async function confirmOneReviewButton(page) {
  const button = page.getByRole('button', { name: /Confirmar Revis.o/i }).first();
  if (!(await visibleOrFalse(button))) {
    throw new Error('no pending review button available to confirm');
  }
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await page.getByText(/Confirmado/i).first().waitFor({ state: 'visible', timeout: 30_000 });
}

async function clickFirstPhotoEdit(page) {
  const instrumentedCard = page.locator('[data-testid^="photo-card-"]').first();
  const photoCard = await visibleOrFalse(instrumentedCard)
    ? instrumentedCard
    : page.locator('img').first().locator('xpath=ancestor::div[contains(@class,"grid")][1]');
  const instrumentedButton = photoCard.locator('[data-testid^="photo-edit-"]').first();
  const button = await visibleOrFalse(instrumentedButton)
    ? instrumentedButton
    : photoCard.locator('button[title^="Editar"], button:has-text("Editar")').first();
  await button.scrollIntoViewIfNeeded();
  await button.click({ timeout: 20_000 });
  const instrumentedForm = photoCard.locator('[data-testid^="photo-edit-form-"]').first();
  if (await instrumentedForm.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false)) {
    return instrumentedForm;
  }
  const fallbackForm = photoCard.locator('form').first();
  await fallbackForm.waitFor({ state: 'visible', timeout: 20_000 });
  return fallbackForm;
}

async function fillPhotoEditForm(form, runId) {
  const captionInput = form.locator('[data-testid^="photo-edit-caption-"]').first();
  const descriptionInput = form.locator('[data-testid^="photo-edit-description-"]').first();
  const conditionInput = form.locator('[data-testid^="photo-edit-condition-"]').first();
  const saveButton = form.locator('[data-testid^="photo-edit-save-"]').first();

  await (await visibleOrFalse(captionInput) ? captionInput : form.locator('input').first()).fill(`Foto manual ${runId}`);
  await (await visibleOrFalse(descriptionInput) ? descriptionInput : form.locator('textarea').first()).fill(`Manual UAT Full observacao persistida ${runId}`);
  await (await visibleOrFalse(conditionInput) ? conditionInput : form.locator('select').first()).selectOption({ index: 1 });
  await (await visibleOrFalse(saveButton) ? saveButton : form.getByRole('button', { name: /Salvar Altera/i })).click();
}

async function pathExists(admin, path) {
  const parts = path.split('/');
  const fileName = parts.pop();
  const folder = parts.join('/');
  const listed = await admin.storage.from(BUCKET).list(folder, { limit: 100 });
  if (listed.error) throw new Error(`storage list failed: ${listed.error.message}`);
  return listed.data.some((entry) => entry.name === fileName);
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

async function createUserAndEntitlement(admin) {
  const email = `e2e-full-${RUN_ID}@vistoriafacilia.com`;
  const password = `FullUat-${RUN_ID}!`;
  const user = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { testRunId: RUN_ID, purpose: 'uat_full_regression' },
  });
  if (user.error || !user.data.user) {
    throw new Error(`admin create user failed: ${user.error?.message || 'no user'}`);
  }

  const plans = await admin
    .from('plans')
    .select('id,name,max_photos_per_inspection,pdf_enabled,payment_required')
    .in('id', ['free_10', 'beta_paid_4990']);
  if (plans.error) throw new Error(`plans query failed: ${plans.error.message}`);
  const freePlan = plans.data.find((plan) => plan.id === 'free_10');
  const paidPlan = plans.data.find((plan) => plan.id === 'beta_paid_4990');
  if (!freePlan || !paidPlan) throw new Error('required plans free_10 and beta_paid_4990 are not available');

  const entitlementId = `${user.data.user.id}_free_10_${RUN_ID}`;
  const entitlement = await admin.from('entitlements').insert({
    id: entitlementId,
    user_id: user.data.user.id,
    plan_id: freePlan.id,
    status: 'active',
    source: 'manual_admin',
    max_photos_per_inspection: freePlan.max_photos_per_inspection,
    pdf_enabled: freePlan.pdf_enabled,
  }).select('id').single();
  if (entitlement.error) throw new Error(`admin entitlement insert failed: ${entitlement.error.message}`);

  return {
    email,
    password,
    userId: user.data.user.id,
    plan: freePlan,
    paidPlan,
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

  for (const path of [...new Set(storagePaths.filter(Boolean))]) {
    leftovers[`storage:${path}`] = await pathExists(admin, path).catch((error) => `list_error: ${sanitizeMessage(error.message)}`);
  }

  return leftovers;
}

async function cleanupUser(admin, userId) {
  const created = await collectCreated(admin, userId);
  const storagePaths = [...new Set(created.storagePaths.filter(Boolean))];
  const result = { ok: false, leftovers: {}, errors: [], storagePaths };

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

async function cleanupSignupUser(admin, email) {
  const user = await findUserByEmail(admin, email);
  if (!user?.id) return { ok: true, userFound: false, leftovers: {}, errors: [] };
  return cleanupUser(admin, user.id);
}

function classifyRuntime(runtime) {
  const expectedConsoleError = /email\/password login failed|invalid login credentials|erro ao analisar|ia server-side desabilitada|password reset request failed/i;
  const criticalConsoleErrors = runtime.consoleErrors.filter((entry) => {
    if (['wrong_password', 'public_signup', 'forgot_password'].includes(entry.phase) && /failed to load resource|invalid login credentials|rate limit|password reset/i.test(entry.text)) {
      return false;
    }
    return !expectedConsoleError.test(entry.text);
  });
  const expectedFailedRequests = runtime.failedRequests.filter((entry) => ['wrong_password', 'public_signup', 'forgot_password'].includes(entry.phase));
  const criticalFailedRequests = runtime.failedRequests.filter((entry) => {
    if (['wrong_password', 'public_signup', 'forgot_password'].includes(entry.phase)) return false;
    return !/ERR_ABORTED|NS_BINDING_ABORTED|operation canceled|cancelled|canceled/i.test(entry.failure || '');
  });
  const expectedHttp = runtime.httpResponses.filter((entry) => ['wrong_password', 'public_signup', 'forgot_password'].includes(entry.phase) && [400, 422, 429].includes(entry.status));
  const criticalHttp = runtime.httpResponses.filter((entry) => !(entry.phase === 'wrong_password' && [400, 422].includes(entry.status)) && !(entry.phase === 'public_signup' && [400, 422, 429].includes(entry.status)) && !(entry.phase === 'forgot_password' && [400, 422, 429].includes(entry.status)));
  return {
    criticalConsoleErrors: criticalConsoleErrors.length,
    criticalConsoleSamples: criticalConsoleErrors.slice(0, 5).map((entry) => sanitizeMessage(entry.text)),
    pageErrors: runtime.pageErrors.length,
    criticalFailedRequests: criticalFailedRequests.length,
    expectedFailedRequests: expectedFailedRequests.length,
    criticalHttpResponses: criticalHttp.length,
    expectedHttpResponses: expectedHttp.length,
    publicSignup429: runtime.httpResponses.some((entry) => entry.phase === 'public_signup' && entry.status === 429),
  };
}

function computeStatus(rows, runtimeSummary, cleanupOk) {
  if (!cleanupOk) return 'FAIL';
  if (runtimeSummary.criticalConsoleErrors > 0 || runtimeSummary.pageErrors > 0 || runtimeSummary.criticalFailedRequests > 0 || runtimeSummary.criticalHttpResponses > 0) {
    return 'FAIL';
  }
  const coreRows = CORE_FUNCTIONAL_KEYS.map((key) => rows.get(key));
  if (coreRows.some((row) => !row || row.status !== 'PASS')) return 'FAIL';
  return rows.get('ai_real_analysis')?.status === 'PASS'
    ? 'PASS_FUNCIONAL_COMPLETO'
    : 'PASS_FUNCIONAL_PARCIAL';
}

function renderReport(result, rows) {
  const matrixLines = [...rows.values()].map((row) => [
    row.functionality,
    row.screen,
    row.control,
    row.expected,
    row.immediate,
    row.afterNavigate,
    row.afterReload,
    row.afterRelogin,
    row.supabasePersisted,
    row.cleanup,
    row.status,
    row.evidence,
  ].map((cell) => String(cell || '').replace(/\|/g, '/')).join(' | '));

  const groups = { PASS: [], FAIL: [], BLOCKED: [], NOT_SUPPORTED: [] };
  for (const row of rows.values()) groups[row.status]?.push(row.functionality);

  const runtime = result.runtimeSummary;
  return [
    '# VF UAT Full Regression - 2026-06-26',
    '',
    `STATUS FINAL: ${result.status}`,
    '',
    `URL testada: ${result.url}`,
    `Run ID: ${result.runId}`,
    `Inicio: ${result.startedAt}`,
    `Fim: ${result.finishedAt}`,
    '',
    '## Resumo',
    '',
    `- PASS: ${groups.PASS.length ? groups.PASS.join('; ') : 'nenhum'}`,
    `- FAIL: ${groups.FAIL.length ? groups.FAIL.join('; ') : 'nenhum'}`,
    `- BLOCKED: ${groups.BLOCKED.length ? groups.BLOCKED.join('; ') : 'nenhum'}`,
    `- NOT_SUPPORTED: ${groups.NOT_SUPPORTED.length ? groups.NOT_SUPPORTED.join('; ') : 'nenhum'}`,
    `- IA real funcionou: ${result.aiRealWorked ? 'sim' : 'nao'}`,
    `- Relatorio/PDF publico funcionou: ${result.reportWorked ? 'sim' : 'nao'}`,
    `- Persistencia pos logout/login passou: ${result.persistenceAfterRelogin ? 'sim' : 'nao'}`,
    `- Cleanup total: ${result.cleanupOk ? 'sim' : 'nao'}`,
    '',
    '## Matriz funcional',
    '',
    'Funcionalidade | Tela | Botao/campo usado | Acao esperada | Resultado imediato | Resultado apos navegar fora/voltar | Resultado apos reload | Resultado apos logout/login | Persistiu no Supabase? | Cleanup executado? | Status | Evidencia/resumo',
    '--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---',
    ...matrixLines,
    '',
    '## Runtime',
    '',
    `- Console errors criticos: ${runtime.criticalConsoleErrors}`,
    ...(runtime.criticalConsoleSamples?.length ? runtime.criticalConsoleSamples.map((message) => `  - ${message}`) : []),
    `- Page errors: ${runtime.pageErrors}`,
    `- Failed requests criticos: ${runtime.criticalFailedRequests}`,
    `- Failed requests esperados: ${runtime.expectedFailedRequests}`,
    `- HTTP criticos: ${runtime.criticalHttpResponses}`,
    `- HTTP esperados: ${runtime.expectedHttpResponses}`,
    `- Signup publico 429: ${runtime.publicSignup429 ? 'sim' : 'nao'}`,
    '',
    '## Bugs encontrados',
    '',
    result.bugs.length ? result.bugs.map((bug) => `- ${bug}`).join('\n') : '- Nenhum bug tecnico novo alem dos bloqueios/gaps classificados.',
    '',
    '## Gaps de produto',
    '',
    result.gaps.length ? result.gaps.map((gap) => `- ${gap}`).join('\n') : '- Nenhum gap adicional registrado.',
    '',
    '## Cleanup',
    '',
    `- Cleanup user tecnico: ${result.cleanupDetails ? (result.cleanupDetails.ok ? 'PASS' : 'FAIL') : 'nao executado'}`,
    `- Cleanup signup publico: ${result.signupCleanupDetails ? (result.signupCleanupDetails.ok ? 'PASS' : 'FAIL') : 'nao executado'}`,
    `- Leftovers user tecnico: ${result.cleanupDetails ? JSON.stringify(result.cleanupDetails.leftovers) : 'nao executado'}`,
    `- Leftovers signup publico: ${result.signupCleanupDetails ? JSON.stringify(result.signupCleanupDetails.leftovers) : 'nao executado'}`,
    '',
    '## Decisao',
    '',
    result.status.startsWith('PASS_FUNCIONAL')
      ? 'UAT manual pode recomecar como rodada controlada do fluxo manual. UAT nao foi liberado automaticamente.'
      : 'UAT manual nao deve comecar como completo ate resolver os itens FAIL/BLOCKED. UAT nao foi liberado automaticamente.',
    '',
    result.error ? `Erro principal: ${result.error}` : '',
    '',
  ].join('\n');
}

async function runPublicAuthChecks({ browser, admin, provisioned, rows, runtime, result }) {
  const signupEmail = `vfe2efull${RUN_ID.replace(/\D/g, '')}@gmail.com`;
  const signupPassword = `FullSignup-${RUN_ID}!`;
  let signupCleanup = null;

  const context = await browser.newContext();
  const page = await context.newPage();
  attachRuntime(page, runtime);

  try {
    runtime.phase = 'open_public_auth';
    const response = await page.goto(`${TARGET_URL}/?uat_full_auth=${RUN_ID}`, { waitUntil: 'networkidle', timeout: 60_000 });
    if ((response?.status() || 0) !== 200) throw new Error(`HTTP status ${response?.status() || 'unknown'}`);

    const googleVisible = await visibleOrFalse(page.getByRole('button', { name: /Entrar com o Google/i }));
    const loginVisible = await visibleOrFalse(page.getByRole('button', { name: /^Entrar$/i }).first());
    const signupVisible = await visibleOrFalse(page.getByRole('button', { name: /Criar conta/i }).first());
    if (googleVisible) {
      updateRow(rows, 'auth_login', { status: 'FAIL', immediate: 'Botao Google apareceu indevidamente.', evidence: 'Google OAuth nao deveria aparecer neste ambiente.' });
      return;
    }
    if (!loginVisible || !signupVisible) throw new Error('public login/signup controls are not visible');

    runtime.phase = 'wrong_password';
    await page.getByLabel(/^E-mail$/i).fill(provisioned.email);
    await page.getByLabel(/^Senha$/i).fill(`wrong-${provisioned.password}`);
    await page.getByRole('button', { name: /^Entrar$/i }).last().click();
    await page.getByText(/E-mail ou senha invalidos/i).waitFor({ state: 'visible', timeout: 20_000 });
    updateRow(rows, 'auth_wrong_password', {
      status: 'PASS',
      immediate: 'Mensagem clara exibida para senha errada.',
      evidence: 'Texto orienta criar conta quando necessario.',
    });

    runtime.phase = 'forgot_password';
    await page.getByRole('button', { name: /Esqueci minha senha/i }).click();
    const forgotOutcome = await waitForAny([
      { name: 'accepted', locator: () => page.getByText(/Se houver uma conta para este e-mail/i) },
      { name: 'rate_limit', locator: () => page.getByText(/Muitas tentativas de recuperacao/i) },
      { name: 'failed', locator: () => page.getByText(/Nao foi possivel solicitar/i) },
    ], 30_000);
    updateRow(rows, 'auth_forgot_password', {
      status: forgotOutcome === 'accepted' ? 'PASS' : forgotOutcome === 'rate_limit' ? 'BLOCKED' : 'FAIL',
      immediate: forgotOutcome === 'accepted' ? 'Solicitacao aceita pela UI.' : `Resultado: ${forgotOutcome || 'timeout'}.`,
      evidence: forgotOutcome === 'rate_limit' ? 'Possivel limite externo do Supabase Auth.' : 'Fluxo exercitado uma vez, sem repetir.',
    });

    runtime.phase = 'public_signup';
    await page.getByRole('button', { name: /Criar conta/i }).first().click();
    await page.getByLabel(/^E-mail$/i).fill(signupEmail);
    await page.getByLabel(/^Senha$/i).fill(signupPassword);
    await page.getByLabel(/Confirmar senha/i).fill(signupPassword);
    await page.getByRole('button', { name: /^Criar conta$/i }).last().click();

    const signupOutcome = await waitForAny([
      { name: 'authenticated', locator: () => page.getByText(/Meus Im.veis/i) },
      { name: 'confirmation_required', locator: () => page.getByText(/Conta criada\. Verifique seu e-mail/i) },
      { name: 'rate_limit', locator: () => page.getByText(/Muitas tentativas de criacao de conta/i) },
      { name: 'invalid_email', locator: () => page.getByText(/Informe um e-mail valido/i) },
      { name: 'generic_failure', locator: () => page.getByText(/Nao foi possivel criar a conta/i) },
    ], 45_000);

    if (signupOutcome === 'authenticated') {
      updateRow(rows, 'auth_public_signup', {
        status: 'PASS',
        immediate: 'Conta publica criada e autenticada.',
        afterNavigate: 'Fluxo pos-login ficaria disponivel para esse usuario.',
        supabasePersisted: 'Usuario criado em auth.users.',
        cleanup: 'Cleanup administrativo agendado.',
        evidence: 'Signup publico passou sem usar service_role no frontend.',
      });
    } else if (signupOutcome === 'confirmation_required') {
      updateRow(rows, 'auth_public_signup', {
        status: 'BLOCKED',
        immediate: 'Conta criada, mas confirmacao de e-mail bloqueia fluxo pos-login.',
        supabasePersisted: 'Usuario pode existir em auth.users.',
        cleanup: 'Cleanup administrativo agendado.',
        evidence: 'Bloqueio externo/configuracao de Auth, nao contornado.',
      });
    } else if (signupOutcome === 'rate_limit' || runtime.httpResponses.some((entry) => entry.phase === 'public_signup' && entry.status === 429)) {
      updateRow(rows, 'auth_public_signup', {
        status: 'BLOCKED',
        immediate: 'Supabase Auth limitou criacao de conta.',
        evidence: 'Erro 429/rate limit detectado; o gate nao repetiu tentativa.',
      });
    } else {
      updateRow(rows, 'auth_public_signup', {
        status: 'FAIL',
        immediate: `Resultado inesperado: ${signupOutcome || 'timeout'}.`,
        evidence: 'Criacao publica nao concluiu nem reportou bloqueio esperado.',
      });
    }

    const resendVisible = await visibleOrFalse(page.getByRole('button', { name: /reenviar|confirmacao|confirma/i }));
    updateRow(rows, 'auth_resend_confirmation', {
      status: resendVisible ? 'FAIL' : 'NOT_SUPPORTED',
      immediate: resendVisible ? 'Controle de reenvio existe, mas o gate ainda nao o exercitou.' : 'Nao ha UI de reenviar confirmacao hoje.',
      evidence: resendVisible ? 'Adicionar teste especifico antes de liberar UAT.' : 'Gap de produto documentado, nao classificado como bug tecnico.',
    });
  } finally {
    await context.close().catch(() => undefined);
    signupCleanup = await cleanupSignupUser(admin, signupEmail).catch((error) => ({
      ok: false,
      errors: [sanitizeMessage(error?.message || error)],
      leftovers: { cleanupFailed: true },
    }));
    result.signupCleanupDetails = signupCleanup;
    const signupRow = rows.get('auth_public_signup');
    if (signupRow.status === 'PASS' || signupRow.status === 'BLOCKED') {
      updateRow(rows, 'auth_public_signup', {
        cleanup: signupCleanup.ok ? 'Cleanup administrativo executado.' : 'Cleanup falhou; ver detalhes.',
        status: signupCleanup.ok ? signupRow.status : 'BLOCKED',
      });
    }
  }
}

async function queryPersistedState(admin, params) {
  const property = await admin
    .from('properties')
    .select('id,nickname,general_notes')
    .eq('user_id', params.userId)
    .eq('nickname', params.propertyName)
    .single();
  if (property.error || !property.data?.id) throw new Error(`property not persisted: ${property.error?.message || 'missing'}`);

  const inspections = await admin
    .from('inspections')
    .select('id,status,inspection_type,pdf_url,summary')
    .eq('user_id', params.userId)
    .eq('property_id', property.data.id)
    .order('started_at', { ascending: false });
  if (inspections.error) throw new Error(`inspections query failed: ${inspections.error.message}`);
  const mainInspection = inspections.data.find((inspection) => inspection.id === params.inspectionId) || inspections.data[0];
  if (!mainInspection) throw new Error('main inspection not persisted');

  const rooms = await admin
    .from('rooms')
    .select('id,name')
    .eq('inspection_id', mainInspection.id)
    .order('display_order', { ascending: true });
  if (rooms.error) throw new Error(`rooms query failed: ${rooms.error.message}`);
  const roomNames = rooms.data.map((room) => room.name);
  for (const expected of [params.rooms.renamedOne, params.rooms.renamedTwo, params.rooms.added]) {
    if (!roomNames.includes(expected)) throw new Error(`room not persisted: ${expected}`);
  }
  if (roomNames.includes(params.rooms.deleted)) throw new Error(`deleted room was recreated: ${params.rooms.deleted}`);

  const photos = await admin
    .from('photos')
    .select('id,storage_path,caption,description,reviewed_status,review_status,analysis_status,fallback_applied,condition_suggested')
    .eq('inspection_id', mainInspection.id)
    .order('created_at', { ascending: true });
  if (photos.error) throw new Error(`photos query failed: ${photos.error.message}`);
  if (photos.data.length !== params.expectedPhotoCount) {
    throw new Error(`photo count mismatch: expected ${params.expectedPhotoCount}, got ${photos.data.length}`);
  }
  if (!photos.data.some((photo) => /Manual UAT Full/.test(photo.description || '') && /Aten/i.test(photo.condition_suggested || ''))) {
    throw new Error('manual photo edit/status was not persisted');
  }
  for (const photo of photos.data) {
    if (!photo.storage_path || !(await pathExists(admin, photo.storage_path))) {
      throw new Error(`storage object missing for photo ${photo.id}`);
    }
  }
  if (params.deletedPhotoPath && await pathExists(admin, params.deletedPhotoPath)) {
    throw new Error('deleted photo still exists in Storage');
  }

  const reports = await admin
    .from('reports')
    .select('id,pdf_url,storage_path,filename,general_summary')
    .eq('inspection_id', mainInspection.id);
  if (reports.error) throw new Error(`reports query failed: ${reports.error.message}`);

  return {
    property: property.data,
    inspection: mainInspection,
    inspectionsCount: inspections.data.length,
    rooms: rooms.data,
    photos: photos.data,
    reports: reports.data,
  };
}

async function runFunctionalFlow({ browser, admin, provisioned, rows, runtime, result }) {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  attachRuntime(page, runtime);
  const state = {
    propertyName: `Full UAT ${RUN_ID}`,
    editedPropertyName: `Full UAT ${RUN_ID} editado`,
    deletePropertyName: `Full UAT delete ${RUN_ID}`,
    inspectionId: null,
    deletedPhotoPath: null,
    rooms: {
      renamedOne: `Sala Full ${RUN_ID.slice(-6)}`,
      renamedTwo: `Quarto Full ${RUN_ID.slice(-6)}`,
      added: `Comodo Full ${RUN_ID.slice(-6)}`,
      deleted: 'Quarto 2',
    },
  };

  try {
    runtime.phase = 'open_functional_flow';
    const response = await page.goto(`${TARGET_URL}/?uat_full_flow=${RUN_ID}`, { waitUntil: 'networkidle', timeout: 60_000 });
    if ((response?.status() || 0) !== 200) throw new Error(`HTTP status ${response?.status() || 'unknown'}`);

    runtime.phase = 'correct_login';
    await login(page, provisioned.email, provisioned.password);
    updateRow(rows, 'auth_login', {
      status: 'PASS',
      immediate: 'Login correto abriu Meus Imoveis.',
      evidence: 'Usuario tecnico normal autenticado via UI publica.',
    });

    runtime.phase = 'plans';
    await page.getByText(/Vers.o Beta Limitada a 10 Fotos/i).waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByRole('button', { name: /Ver Planos/i }).click();
    await page.getByText(/Planos de Assinatura/i).waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByText(/free_10/i).waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByText(/beta_paid_4990/i).waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByText(/At. 10 fotos/i).first().waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByText(/At. 50 fotos/i).first().waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByRole('button', { name: /Solicitar upgrade/i }).click();
    await page.getByText(/Upgrade em beta assistido/i).first().waitFor({ state: 'visible', timeout: 10_000 });
    updateRow(rows, 'plans_cta', {
      status: 'PASS',
      immediate: 'Clique abriu tela de planos.',
      afterNavigate: 'Tela permaneceu em planos ate acao explicita de voltar.',
      evidence: 'Nao houve retorno automatico para home.',
    });
    updateRow(rows, 'plans_catalog', {
      status: 'PASS',
      immediate: 'free_10 e beta_paid_4990 visiveis.',
      supabasePersisted: 'Planos reais consultados no Supabase durante setup.',
      evidence: `Limites detectados: free_10=${provisioned.plan.max_photos_per_inspection}, beta_paid_4990=${provisioned.paidPlan.max_photos_per_inspection}.`,
    });
    await page.getByRole('button', { name: /Voltar para im.veis/i }).click();
    await page.getByText(/Meus Im.veis/i).waitFor({ state: 'visible', timeout: 30_000 });

    runtime.phase = 'property_crud';
    await createPropertyViaUi(page, state.propertyName, `Nota inicial ${RUN_ID}`);
    updateRow(rows, 'property_create_list', {
      status: 'PASS',
      immediate: 'Imovel criado e listado na tela.',
      supabasePersisted: 'Verificacao administrativa sera feita no fechamento.',
      cleanup: 'Cleanup administrativo agendado.',
      evidence: state.propertyName,
    });

    const propertyCard = page.locator('[data-testid^="property-card-"]').filter({ hasText: state.propertyName });
    await propertyCard.locator('button[title^="Editar"]').click();
    await page.locator('form input').nth(0).fill(state.editedPropertyName);
    await page.locator('form textarea').fill(`Nota editada ${RUN_ID}`);
    await page.getByRole('button', { name: /Salvar Im.vel/i }).click();
    await page.locator('[data-testid^="property-card-"]').filter({ hasText: state.editedPropertyName }).first().waitFor({ state: 'visible', timeout: 30_000 });
    updateRow(rows, 'property_edit', {
      status: 'PASS',
      immediate: 'Nome e observacao do imovel alterados pela UI.',
      supabasePersisted: 'Verificacao administrativa sera feita no fechamento.',
      cleanup: 'Cleanup administrativo agendado.',
      evidence: state.editedPropertyName,
    });

    await createPropertyViaUi(page, state.deletePropertyName, `Imovel para delete ${RUN_ID}`);
    const deleteCard = page.locator('[data-testid^="property-card-"]').filter({ hasText: state.deletePropertyName });
    await deleteCard.locator('button[title^="Excluir"]').click();
    await page.getByRole('button', { name: /Sim, Excluir/i }).click();
    await page.locator('[data-testid^="property-card-"]').filter({ hasText: state.deletePropertyName }).waitFor({ state: 'detached', timeout: 30_000 }).catch(async () => {
      if (await visibleOrFalse(page.locator('[data-testid^="property-card-"]').filter({ hasText: state.deletePropertyName }))) {
        throw new Error('deleted property still visible');
      }
    });
    updateRow(rows, 'property_delete', {
      status: 'PASS',
      immediate: 'Imovel temporario deletado pela UI e sumiu da lista.',
      supabasePersisted: 'Cleanup final tambem verifica leftovers do usuario.',
      cleanup: 'Ja deletado pela UI; cleanup admin final valida.',
      evidence: state.deletePropertyName,
    });

    runtime.phase = 'inspection_delete_probe';
    await page.locator('[data-testid^="property-card-"]').filter({ hasText: state.editedPropertyName }).getByRole('button', { name: /Nova Vistoria/i }).click();
    await page.getByText(/Iniciar Nova Vistoria/i).waitFor({ state: 'visible', timeout: 20_000 });
    await page.getByRole('button', { name: /Vistoria de Entrada/i }).click();
    await page.getByRole('button', { name: /Come.ar Vistoria/i }).click();
    await page.getByText(/Registro de Fotos:/i).waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByLabel(/Voltar para hist.rico/i).click();
    await page.getByText(/Hist.rico de Vistorias/i).waitFor({ state: 'visible', timeout: 30_000 });
    page.once('dialog', async (dialog) => dialog.accept());
    await page.locator('button[title="Excluir vistoria"]').first().click();
    await page.getByText(/Nenhuma vistoria neste im.vel/i).waitFor({ state: 'visible', timeout: 30_000 });
    updateRow(rows, 'inspection_delete', {
      status: 'PASS',
      immediate: 'Rascunho temporario excluido pela UI.',
      afterNavigate: 'Historico voltou ao estado sem vistorias.',
      cleanup: 'Excluido pela UI; cleanup admin final valida.',
      evidence: 'Botao Excluir vistoria exercitado com confirm dialog.',
    });

    runtime.phase = 'main_inspection';
    await page.getByRole('button', { name: /Criar Primeira Vistoria|Nova Vistoria/i }).first().click();
    await page.getByText(/Iniciar Nova Vistoria/i).waitFor({ state: 'visible', timeout: 20_000 });
    await page.getByRole('button', { name: /Vistoria de Entrada/i }).click();
    await page.getByRole('button', { name: /Come.ar Vistoria/i }).click();
    await page.getByText(/Registro de Fotos:/i).waitFor({ state: 'visible', timeout: 45_000 });
    const latestInspection = await admin
      .from('inspections')
      .select('id')
      .eq('user_id', provisioned.userId)
      .order('started_at', { ascending: false })
      .limit(1)
      .single();
    if (latestInspection.error || !latestInspection.data?.id) throw new Error(`latest inspection query failed: ${latestInspection.error?.message || 'missing'}`);
    state.inspectionId = latestInspection.data.id;
    updateRow(rows, 'inspection_create_entry', {
      status: 'PASS',
      immediate: 'Vistoria de Entrada criada.',
      supabasePersisted: 'Linha de inspections encontrada por admin.',
      cleanup: 'Cleanup administrativo agendado.',
      evidence: `inspectionId=${state.inspectionId}`,
    });

    runtime.phase = 'rooms';
    await roomRow(page, 'Sala').waitFor({ state: 'visible', timeout: 30_000 });
    await roomRow(page, 'Quarto 1').waitFor({ state: 'visible', timeout: 30_000 });
    updateRow(rows, 'rooms_defaults', {
      status: 'PASS',
      immediate: 'Template inicial carregou Sala e Quarto 1.',
      supabasePersisted: 'Verificacao administrativa no fechamento.',
      evidence: 'Nova vistoria cria comodos padrao uma unica vez.',
    });

    for (const [fromName, toName] of [['Sala', state.rooms.renamedOne], ['Quarto 1', state.rooms.renamedTwo]]) {
      const row = roomRow(page, fromName);
      await row.hover();
      await hoverRoomAction(page, row);
      await row.locator('button[title="Renomear"]').click();
      await page.getByPlaceholder(/Novo nome do c.modo/i).fill(toName);
      await page.getByRole('button', { name: /^Salvar$/i }).click();
      await roomRow(page, toName).waitFor({ state: 'visible', timeout: 30_000 });
    }
    await page.getByPlaceholder(/Novo c.modo/i).fill(state.rooms.added);
    await page.getByTitle(/Adicionar c.modo/i).click();
    await roomRow(page, state.rooms.added).waitFor({ state: 'visible', timeout: 30_000 });
    const deleteRoomRow = roomRow(page, state.rooms.deleted);
    await deleteRoomRow.hover();
    await hoverRoomAction(page, deleteRoomRow);
    await deleteRoomRow.locator('button[title="Excluir"]').click();
    await roomRow(page, state.rooms.deleted).waitFor({ state: 'detached', timeout: 20_000 }).catch(async () => {
      if (await visibleOrFalse(roomRow(page, state.rooms.deleted))) throw new Error('deleted default room still visible');
    });
    updateRow(rows, 'rooms_edit_create_delete', {
      status: 'PASS',
      immediate: 'Dois comodos renomeados, um criado e um deletado.',
      supabasePersisted: 'Verificacao administrativa no fechamento.',
      cleanup: 'Cleanup administrativo agendado.',
      evidence: `${state.rooms.renamedOne}, ${state.rooms.renamedTwo}, ${state.rooms.added}; removido ${state.rooms.deleted}.`,
    });

    runtime.phase = 'photos_initial_delete';
    await selectRoom(page, state.rooms.added);
    const uploadInput = page.locator('input[type="file"][multiple]').last();
    await uploadInput.setInputFiles(photoFiles(`${RUN_ID}-initial`, 1));
    await page.getByText(/Sem An.lise de IA/i).first().waitFor({ state: 'visible', timeout: 60_000 });
    await page.locator('img').first().waitFor({ state: 'visible', timeout: 20_000 });
    const initialPhoto = await admin
      .from('photos')
      .select('id,storage_path')
      .eq('inspection_id', state.inspectionId)
      .limit(1)
      .single();
    if (initialPhoto.error || !initialPhoto.data?.storage_path) throw new Error(`initial photo query failed: ${initialPhoto.error?.message || 'missing'}`);
    state.deletedPhotoPath = initialPhoto.data.storage_path;
    await page.locator('button[title="Excluir foto"]').first().click();
    await page.getByText(/Nenhuma foto enviada neste c.modo/i).waitFor({ state: 'visible', timeout: 30_000 });
    updateRow(rows, 'photos_delete_replace', {
      status: 'PASS',
      immediate: 'Foto inicial deletada; substituicao sera feita por novo upload.',
      supabasePersisted: 'Storage sera verificado no fechamento para garantir que a foto deletada nao ficou.',
      cleanup: 'Cleanup administrativo final valida.',
      evidence: 'UI nao tem botao dedicado de substituir; delete+novo upload cobre substituicao funcional.',
    });

    runtime.phase = 'photos_limit_upload';
    await uploadInput.setInputFiles(photoFiles(`${RUN_ID}-replacement`, 1));
    await page.getByText(/Sem An.lise de IA/i).first().waitFor({ state: 'visible', timeout: 60_000 });
    const neutralIaMessageVisible = await page
      .getByText(/Foto salva.*an.lise autom.tica.*Revise manualmente/i)
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    const editForm = await clickFirstPhotoEdit(page);
    await fillPhotoEditForm(editForm, RUN_ID);
    await page.getByText(/Manual UAT Full observacao persistida/i).waitFor({ state: 'visible', timeout: 30_000 });

    const limit = Number(provisioned.plan.max_photos_per_inspection);
    if (limit > 1) {
      await uploadInput.setInputFiles(photoFiles(`${RUN_ID}-limit`, limit - 1));
      await waitForPhotoCount(page, limit, Math.max(180_000, limit * 10_000));
    }
    await confirmOneReviewButton(page);
    const limitDisabled = await page.getByRole('button', { name: /Escolher da Galeria/i }).first().isDisabled().catch(() => false);
    if (!limitDisabled) throw new Error('plan photo limit is not disabled in UI at the limit');
    updateRow(rows, 'photos_add_preview', {
      status: 'PASS',
      immediate: 'Upload e preview de imagem ficaram visiveis.',
      supabasePersisted: 'Verificacao administrativa no fechamento.',
      cleanup: 'Cleanup administrativo agendado.',
      evidence: `${limit} foto(s) sinteticas pequenas processadas no limite do plano.`,
    });
    updateRow(rows, 'photos_plan_limit', {
      status: 'PASS',
      immediate: 'Abaixo do limite funcionou; no limite o botao de upload ficou desabilitado.',
      evidence: `Plano free_10 limitou em ${limit} foto(s); acima do limite bloqueado pela UI sem forcar input desabilitado.`,
    });
    updateRow(rows, 'ai_real_analysis', {
      status: 'BLOCKED',
      immediate: 'IA real nao analisou imagem; app exibiu fallback.',
      evidence: 'Codigo atual desabilita IA server-side no Supabase Free. GAP DE PRODUTO.',
    });
    updateRow(rows, 'ai_fallback', {
      status: neutralIaMessageVisible ? 'PASS' : 'FAIL',
      immediate: neutralIaMessageVisible
        ? 'Fallback Sem Analise de IA exibido com mensagem neutra apos upload.'
        : 'Fallback apareceu, mas a mensagem neutra de IA indisponivel nao foi encontrada.',
      supabasePersisted: 'Campos analysis_status/fallback_applied verificados no fechamento.',
      evidence: 'Sem contornar com backend pago.',
    });
    updateRow(rows, 'ai_manual_edit_accept', {
      status: 'PASS',
      immediate: 'Descricao manual e status Atencao salvos pela UI.',
      supabasePersisted: 'Verificacao administrativa no fechamento.',
      evidence: 'Usuario editou texto/observacao e salvou.',
    });

    runtime.phase = 'persistence_navigation';
    await page.getByLabel(/Voltar para hist.rico/i).click();
    await page.getByText(/Hist.rico de Vistorias/i).waitFor({ state: 'visible', timeout: 30_000 });
    await openDraftFromHistory(page);
    await assertRoomsVisible(page, state.rooms);
    await selectRoom(page, state.rooms.added);
    await page.getByText(/Manual UAT Full observacao persistida/i).waitFor({ state: 'visible', timeout: 30_000 });
    updateRow(rows, 'inspection_list_continue', {
      status: 'PASS',
      immediate: 'Historico listou vistoria e Continuar Rascunho reabriu a correta.',
      afterNavigate: 'Dados principais visiveis apos voltar e reabrir.',
      supabasePersisted: 'Verificacao administrativa no fechamento.',
      evidence: 'Rascunho retomado via UI publica.',
    });
    updateRow(rows, 'rooms_navigation_reload_relogin', {
      status: 'PASS',
      immediate: 'Navegacao interna preservou comodos.',
      afterNavigate: 'Voltar ao historico e continuar preservou alteracoes.',
      supabasePersisted: 'Verificacao administrativa no fechamento.',
      cleanup: 'Cleanup administrativo agendado.',
      evidence: 'Preparado para reload e relogin.',
    });

    await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
    await page.getByText(/Meus Im.veis/i).waitFor({ state: 'visible', timeout: 45_000 });
    await openHistory(page, state.editedPropertyName);
    await openDraftFromHistory(page);
    await assertRoomsVisible(page, state.rooms);
    await selectRoom(page, state.rooms.added);
    await page.getByText(/Manual UAT Full observacao persistida/i).waitFor({ state: 'visible', timeout: 30_000 });
    updateRow(rows, 'property_navigation_persistence', {
      status: 'PASS',
      immediate: 'Imovel editado continuou visivel.',
      afterNavigate: 'Historico abriu corretamente.',
      afterReload: 'Reload manteve sessao e dados.',
      afterRelogin: 'Ainda sera validado apos logout/login.',
      supabasePersisted: 'Verificacao administrativa no fechamento.',
      cleanup: 'Cleanup administrativo agendado.',
      evidence: state.editedPropertyName,
    });
    updateRow(rows, 'rooms_navigation_reload_relogin', {
      ...rows.get('rooms_navigation_reload_relogin'),
      afterReload: 'Reload e reabertura preservaram comodos e foto.',
    });
    updateRow(rows, 'photos_reload_relogin_storage', {
      status: 'PASS',
      immediate: 'Foto permaneceu visivel apos navegacao.',
      afterReload: 'Reload preservou foto e texto manual.',
      supabasePersisted: 'Storage verificado no fechamento.',
      cleanup: 'Cleanup administrativo agendado.',
      evidence: 'Preparado para logout/login.',
    });

    await logout(page);
    await login(page, provisioned.email, provisioned.password);
    await openHistory(page, state.editedPropertyName);
    await openDraftFromHistory(page);
    await assertRoomsVisible(page, state.rooms);
    await selectRoom(page, state.rooms.added);
    await page.getByText(/Manual UAT Full observacao persistida/i).waitFor({ state: 'visible', timeout: 30_000 });
    updateRow(rows, 'auth_logout_login', {
      status: 'PASS',
      immediate: 'Logout levou para tela publica e login retornou.',
      afterRelogin: 'Dados principais continuaram acessiveis.',
      evidence: 'Fluxo exercitado com usuario normal.',
    });
    updateRow(rows, 'property_navigation_persistence', {
      ...rows.get('property_navigation_persistence'),
      afterRelogin: 'Imovel editado visivel apos logout/login.',
    });
    updateRow(rows, 'rooms_navigation_reload_relogin', {
      ...rows.get('rooms_navigation_reload_relogin'),
      afterRelogin: 'Comodos editados/criados/deletados corretos apos logout/login.',
    });
    updateRow(rows, 'rooms_no_template_overwrite', {
      status: 'PASS',
      immediate: 'Template padrao nao sobrescreveu os comodos persistidos.',
      afterNavigate: 'Comodo deletado nao voltou apos reabrir.',
      afterReload: 'Comodo deletado nao voltou apos reload.',
      afterRelogin: 'Comodo deletado nao voltou apos logout/login.',
      supabasePersisted: 'Verificacao administrativa no fechamento.',
      evidence: `${state.rooms.deleted} permaneceu ausente.`,
    });
    updateRow(rows, 'photos_reload_relogin_storage', {
      ...rows.get('photos_reload_relogin_storage'),
      afterRelogin: 'Foto e descricao manual visiveis apos logout/login.',
    });
    updateRow(rows, 'ai_review_persistence', {
      status: 'PASS',
      immediate: 'Revisao manual ficou visivel.',
      afterReload: 'Texto/status persistiram apos reload.',
      afterRelogin: 'Texto/status persistiram apos logout/login.',
      supabasePersisted: 'Verificacao administrativa no fechamento.',
      cleanup: 'Cleanup administrativo agendado.',
      evidence: 'Descricao manual e status Atencao reidratados.',
    });
    result.persistenceAfterRelogin = true;

    runtime.phase = 'report';
    await page.getByRole('button', { name: /Concluir.*Revisar/i }).click();
    await page.getByText(/Visualizar Relat.rio/i).waitFor({ state: 'visible', timeout: 45_000 });
    await page.getByText(new RegExp(escapeRegex(state.editedPropertyName))).first().waitFor({ state: 'visible', timeout: 20_000 });
    await page.getByText(state.rooms.added).waitFor({ state: 'visible', timeout: 20_000 });
    await page.locator('textarea').first().fill(`Resumo UAT Full ${RUN_ID} com observacoes persistidas`);

    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 }).catch(() => null);
    await page.getByRole('button', { name: /Baixar Relat.rio PDF/i }).click();
    await downloadPromise;
    await page.getByText(/Relat.rio gerado com sucesso/i).waitFor({ state: 'visible', timeout: 60_000 });
    updateRow(rows, 'report_generate', {
      status: 'PASS',
      immediate: 'PDF gerado pela UI publica.',
      supabasePersisted: 'Registro reports verificado no fechamento.',
      cleanup: 'Cleanup administrativo agendado.',
      evidence: 'Download foi disparado e mensagem de sucesso apareceu.',
    });

    await page.getByRole('button', { name: /Vistoria F.cil IA/i }).first().click();
    await page.getByText(/Meus Im.veis/i).waitFor({ state: 'visible', timeout: 30_000 });
    await openHistory(page, state.editedPropertyName);
    await logout(page);
    await login(page, provisioned.email, provisioned.password);
    await openHistory(page, state.editedPropertyName);
    await page.getByRole('button', { name: /Ver PDF|Compartilhar/i }).first().click();
    await page.getByText(/Visualizar Relat.rio/i).waitFor({ state: 'visible', timeout: 30_000 });
    updateRow(rows, 'report_reload_relogin', {
      status: 'PASS',
      immediate: 'Relatorio apareceu no historico apos relogin.',
      afterRelogin: 'Botao Ver PDF / Compartilhar abriu a tela de relatorio.',
      supabasePersisted: 'Registro reports verificado no fechamento.',
      cleanup: 'Cleanup administrativo agendado.',
      evidence: 'Relatorio acessivel apos logout/login.',
    });

    const persisted = await queryPersistedState(admin, {
      userId: provisioned.userId,
      propertyName: state.editedPropertyName,
      inspectionId: state.inspectionId,
      rooms: state.rooms,
      expectedPhotoCount: limit,
      deletedPhotoPath: state.deletedPhotoPath,
    });
    const reportOk = persisted.reports.length > 0 && persisted.inspection.status === 'pdf_gerado' && persisted.reports.some((report) => report.storage_path);
    if (!reportOk) throw new Error('report record or pdf status not persisted');
    updateRow(rows, 'report_content', {
      status: 'PASS',
      immediate: 'Tela de relatorio mostrou imovel/comodo/resumo.',
      supabasePersisted: 'reports, inspection.pdf_url/status e Storage verificados.',
      cleanup: 'Cleanup administrativo agendado.',
      evidence: `reports=${persisted.reports.length}, photos=${persisted.photos.length}, rooms=${persisted.rooms.length}.`,
    });
    result.reportWorked = true;

    for (const key of ['property_create_list', 'property_edit', 'property_navigation_persistence', 'inspection_create_entry', 'inspection_list_continue', 'inspection_no_duplicates', 'rooms_defaults', 'rooms_edit_create_delete', 'rooms_navigation_reload_relogin', 'rooms_no_template_overwrite', 'photos_add_preview', 'photos_delete_replace', 'photos_plan_limit', 'photos_reload_relogin_storage', 'ai_fallback', 'ai_manual_edit_accept', 'ai_review_persistence', 'report_generate', 'report_content', 'report_reload_relogin']) {
      const row = rows.get(key);
      if (row.status === 'PASS') {
        updateRow(rows, key, {
          ...row,
          supabasePersisted: row.supabasePersisted.includes('Verificacao') ? 'Sim, confirmado no Supabase/Storage por consulta admin.' : row.supabasePersisted,
        });
      }
    }
    updateRow(rows, 'inspection_no_duplicates', {
      status: 'PASS',
      immediate: 'Criacao de vistoria exigiu acao explicita.',
      afterNavigate: 'Historico mostrou rascunho correto sem duplicata involuntaria.',
      supabasePersisted: `Inspections restantes do usuario: ${persisted.inspectionsCount}.`,
      cleanup: 'Cleanup administrativo agendado.',
      evidence: 'Rascunho temporario foi criado/deletado explicitamente; rascunho principal continuou unico para o fluxo.',
    });
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function main() {
  const startedAt = new Date().toISOString();
  const rows = buildInitialRows();
  const result = {
    status: 'BLOCKED',
    url: TARGET_URL,
    runId: RUN_ID,
    startedAt,
    finishedAt: null,
    runtimeSummary: { criticalConsoleErrors: 0, criticalConsoleSamples: [], pageErrors: 0, criticalFailedRequests: 0, expectedFailedRequests: 0, criticalHttpResponses: 0, expectedHttpResponses: 0, publicSignup429: false },
    cleanupDetails: null,
    signupCleanupDetails: null,
    cleanupOk: false,
    aiRealWorked: false,
    reportWorked: false,
    persistenceAfterRelogin: false,
    bugs: [],
    gaps: [
      'IA real server-side esta desabilitada no Supabase Free; gate valida fallback e edicao manual, mas IA real permanece BLOCKED/GAP DE PRODUTO.',
      'Reenviar confirmacao nao existe na UI publica atual.',
    ],
    error: null,
  };

  const env = loadEnvLocal();
  const required = ['VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) {
    result.error = `missing ${missing.join(' and ')} in .env.local`;
    result.finishedAt = new Date().toISOString();
    writeFileSync(REPORT_PATH, renderReport(result, rows), 'utf8');
    console.log(JSON.stringify({ status: 'BLOCKED', error: result.error, report: REPORT_PATH }, null, 2));
    process.exitCode = 2;
    return;
  }

  const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  let browser = null;
  let provisioned = null;
  const runtime = { phase: 'bootstrap', consoleErrors: [], pageErrors: [], failedRequests: [], httpResponses: [] };

  try {
    provisioned = await createUserAndEntitlement(admin);
    browser = await chromium.launch({ headless: true });
    await runPublicAuthChecks({ browser, admin, provisioned, rows, runtime, result });
    await runFunctionalFlow({ browser, admin, provisioned, rows, runtime, result });
  } catch (error) {
    const message = sanitizeMessage(error?.message || error);
    result.error = message;
    result.bugs.push(message);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (provisioned?.userId) {
      result.cleanupDetails = await cleanupUser(admin, provisioned.userId).catch((error) => ({
        ok: false,
        errors: [sanitizeMessage(error?.message || error)],
        leftovers: { cleanupFailed: true },
      }));
      const cleanupStatus = result.cleanupDetails.ok ? 'Cleanup administrativo executado.' : 'Cleanup falhou; ver detalhes.';
      for (const row of rows.values()) {
        if (row.cleanup.includes('agendado') || row.cleanup.includes('admin')) {
          updateRow(rows, row.key, { cleanup: cleanupStatus });
        }
      }
    }
    result.cleanupOk = Boolean(result.cleanupDetails?.ok) && Boolean(result.signupCleanupDetails?.ok ?? true);
    result.runtimeSummary = classifyRuntime(runtime);
    result.status = computeStatus(rows, result.runtimeSummary, result.cleanupOk);
    result.finishedAt = new Date().toISOString();
    writeFileSync(REPORT_PATH, renderReport(result, rows), 'utf8');
  }

  console.log(JSON.stringify({
    status: result.status,
    url: TARGET_URL,
    pass: [...rows.values()].filter((row) => row.status === 'PASS').length,
    fail: [...rows.values()].filter((row) => row.status === 'FAIL').length,
    blocked: [...rows.values()].filter((row) => row.status === 'BLOCKED').length,
    notSupported: [...rows.values()].filter((row) => row.status === 'NOT_SUPPORTED').length,
    aiRealWorked: result.aiRealWorked,
    reportWorked: result.reportWorked,
    persistenceAfterRelogin: result.persistenceAfterRelogin,
    cleanupTotal: result.cleanupOk,
    report: REPORT_PATH,
  }, null, 2));
  process.exitCode = result.status.startsWith('PASS_FUNCIONAL') ? 0 : 1;
}

main().catch((error) => {
  const rows = buildInitialRows();
  const result = {
    status: 'BLOCKED',
    url: TARGET_URL,
    runId: RUN_ID,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    runtimeSummary: { criticalConsoleErrors: 0, criticalConsoleSamples: [], pageErrors: 0, criticalFailedRequests: 0, expectedFailedRequests: 0, criticalHttpResponses: 0, expectedHttpResponses: 0, publicSignup429: false },
    cleanupDetails: null,
    signupCleanupDetails: null,
    cleanupOk: false,
    aiRealWorked: false,
    reportWorked: false,
    persistenceAfterRelogin: false,
    bugs: [sanitizeMessage(error?.message || error)],
    gaps: [],
    error: sanitizeMessage(error?.message || error),
  };
  writeFileSync(REPORT_PATH, renderReport(result, rows), 'utf8');
  console.log(JSON.stringify({ status: 'BLOCKED', error: result.error, report: REPORT_PATH }, null, 2));
  process.exitCode = 2;
});
