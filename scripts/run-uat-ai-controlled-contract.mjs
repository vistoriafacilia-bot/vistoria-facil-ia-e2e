import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DRY_RUN = process.argv.includes('--dry') || process.env.UAT_AI_CONTROLLED_DRY === 'true';
const TARGET_URL = process.env.UAT_AI_CONTROLLED_BASE_URL || process.env.UAT_REAL_BASE_URL || 'https://glittery-boba-2b3367.netlify.app';
const PHOTO_ROOT = process.env.UAT_AI_CONTROLLED_PHOTO_ROOT || 'E:\\AI - Aprendizado\\VistoriaFacilIA\\Fotos para Testes';
const DATASET_PATH = process.env.UAT_AI_CONTROLLED_DATASET_PATH || 'qa/vf_ai_dataset_selection_20260627.json';
const REPORT_BASENAME = DRY_RUN ? 'vf_uat_ai_controlled_dry_20260627' : 'vf_uat_ai_controlled_20260627';
const REPORT_PATH = `qa/${REPORT_BASENAME}.md`;
const REPORT_JSON_PATH = `qa/${REPORT_BASENAME}.json`;
const BUCKET = 'inspection-photos';
const RUN_ID = `ai_controlled_${Date.now()}`;
const TEST_EMAIL = `e2e-ai-controlled-${RUN_ID}@vistoriafacilia.com`;
const TEST_PASSWORD = `AiControlled-${RUN_ID}!`;
const VALID_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MAX_AI_PHOTOS = 10;
const MAX_PHOTOS_PER_ROOM = 1;
const COST_BASE_PER_PHOTO_BRL = 0.15;
const COST_STRESS_PER_PHOTO_BRL = 0.25;

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

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function addCase(result, phase, caso, esperado, status, evidencia) {
  result.matrix.push({ phase, caso, esperado, status, evidencia });
}

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function inventoryPhotos() {
  const governanceErrors = [];
  let approved = null;

  if (!existsSync(DATASET_PATH)) {
    governanceErrors.push(`DATASET_JSON_MISSING: ${DATASET_PATH}`);
  } else {
    try {
      approved = JSON.parse(readFileSync(DATASET_PATH, 'utf8'));
    } catch (error) {
      governanceErrors.push(`DATASET_JSON_INVALID: ${sanitizeMessage(error?.message || error)}`);
    }
  }

  const all = [];
  if (existsSync(PHOTO_ROOT)) {
    const scan = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) scan(full);
        else if (entry.isFile()) all.push(full);
      }
    };
    scan(PHOTO_ROOT);
  } else {
    governanceErrors.push(`PHOTO_ROOT_NOT_FOUND: ${PHOTO_ROOT}`);
  }

  const valid = all.filter((file) => VALID_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const selection = Array.isArray(approved?.selection) ? approved.selection : [];
  if (!Array.isArray(approved?.selection)) governanceErrors.push('DATASET_SELECTION_MISSING');
  if (selection.length !== MAX_AI_PHOTOS) {
    governanceErrors.push(`DATASET_PHOTO_COUNT_INVALID: expected ${MAX_AI_PHOTOS}, got ${selection.length}`);
  }

  const seenRooms = new Set();
  const seenPaths = new Set();
  const rooms = [];
  const sample = [];

  for (const row of selection) {
    const room = String(row?.room || '').trim();
    const filePath = String(row?.file_path || '').trim();
    const fileName = String(row?.file_name || '').trim();

    if (!room) governanceErrors.push('DATASET_ROOM_MISSING');
    if (!filePath) governanceErrors.push(`DATASET_FILE_PATH_MISSING: ${room || '[unknown room]'}`);
    if (!fileName) governanceErrors.push(`DATASET_FILE_NAME_MISSING: ${room || '[unknown room]'}`);
    if (room && seenRooms.has(room)) governanceErrors.push(`DATASET_DUPLICATE_ROOM: ${room}`);
    if (filePath && seenPaths.has(path.normalize(filePath).toLowerCase())) governanceErrors.push(`DATASET_DUPLICATE_FILE: ${filePath}`);
    if (room) seenRooms.add(room);
    if (filePath) seenPaths.add(path.normalize(filePath).toLowerCase());

    if (filePath && !existsSync(filePath)) {
      governanceErrors.push(`DATASET_FILE_NOT_FOUND: ${filePath}`);
      continue;
    }

    if (filePath) {
      if (!VALID_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
        governanceErrors.push(`DATASET_FILE_EXTENSION_INVALID: ${filePath}`);
      }
      if (fileName && path.basename(filePath) !== fileName) {
        governanceErrors.push(`DATASET_FILE_NAME_MISMATCH: room=${room}; json=${fileName}; actual=${path.basename(filePath)}`);
      }
      const expectedRoot = path.resolve(PHOTO_ROOT).toLowerCase();
      const resolvedFile = path.resolve(filePath).toLowerCase();
      if (!resolvedFile.startsWith(`${expectedRoot}${path.sep.toLowerCase()}`)) {
        governanceErrors.push(`DATASET_FILE_OUTSIDE_PHOTO_ROOT: ${filePath}`);
      }
      if (row?.sha256) {
        const actualHash = sha256File(filePath);
        if (actualHash !== row.sha256) {
          governanceErrors.push(`DATASET_SHA256_MISMATCH: ${filePath}`);
        }
      }
    }

    if (room && filePath) {
      const sizeMb = existsSync(filePath) ? Number((statSync(filePath).size / 1024 / 1024).toFixed(2)) : 0;
      rooms.push({
        name: room,
        count: 1,
        files: [filePath],
        sampleFiles: [filePath],
        totalMb: sizeMb,
        approvedFileName: fileName || path.basename(filePath),
        visualRisk: row?.visual_risk || '',
        recommendation: row?.recommendation || '',
      });
      sample.push({ room, file: filePath, fileName: fileName || path.basename(filePath) });
    }
  }

  if (seenRooms.size !== selection.length) {
    governanceErrors.push(`DATASET_ROOM_UNIQUENESS_INVALID: unique=${seenRooms.size}; rows=${selection.length}`);
  }
  if (sample.length > MAX_AI_PHOTOS) {
    governanceErrors.push(`DATASET_COST_GUARD_INVALID: ${sample.length} photos selected; max=${MAX_AI_PHOTOS}`);
  }
  if (rooms.some((room) => room.sampleFiles.length !== MAX_PHOTOS_PER_ROOM)) {
    governanceErrors.push(`DATASET_ROOM_PHOTO_COUNT_INVALID: expected ${MAX_PHOTOS_PER_ROOM} per room`);
  }

  return {
    photoRoot: PHOTO_ROOT,
    datasetPath: DATASET_PATH,
    datasetStatus: approved?.status || null,
    totalRooms: rooms.length,
    totalValidPhotos: valid.length,
    rooms,
    sample,
    samplePhotoCount: sample.length,
    costBase: Number((sample.length * COST_BASE_PER_PHOTO_BRL).toFixed(2)),
    costStress: Number((sample.length * COST_STRESS_PER_PHOTO_BRL).toFixed(2)),
    governanceErrors,
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

async function createProperty(page, name) {
  await page.getByRole('button', { name: /Cadastrar/i }).first().click();
  const inputs = page.locator('form input');
  await inputs.nth(0).fill(name);
  await inputs.nth(1).fill('01001-000');
  await inputs.nth(2).fill('SP');
  await inputs.nth(3).fill(`Rua IA Controlada ${RUN_ID}`);
  await inputs.nth(4).fill('101');
  await inputs.nth(5).fill('Apto IA');
  await inputs.nth(6).fill('Centro');
  await inputs.nth(7).fill('Sao Paulo');
  await inputs.nth(8).fill(`Referencia ${RUN_ID}`);
  await page.locator('form textarea').fill(`Imovel UAT IA controlada ${RUN_ID}`);
  await page.getByRole('button', { name: /Salvar Im.vel/i }).click();
  await page.locator('[data-testid^="property-card-"]').filter({ hasText: name }).first().waitFor({ state: 'visible', timeout: 45_000 });
}

async function openHistory(page, propertyName) {
  await page.getByText(/Meus Im.veis/i).waitFor({ state: 'visible', timeout: 45_000 });
  await page.locator('[data-testid^="property-card-"]').filter({ hasText: propertyName }).getByRole('button', { name: /Hist.rico/i }).click();
  await page.getByText(/Hist.rico de Vistorias/i).waitFor({ state: 'visible', timeout: 45_000 });
}

async function inspectionEvidence(page) {
  const photoRegistry = await visibleOrFalse(page.getByText(/Registro de Fotos:/i));
  const fileInputCount = await page.locator('input[type="file"]').count().catch(() => 0);
  const addRoomVisible = await visibleOrFalse(page.getByPlaceholder(/Novo c.modo/i));
  const roomRows = await page.locator('div.group.flex.items-center.justify-between.gap-1').count().catch(() => 0);
  const backToHistory = await visibleOrFalse(page.getByLabel(/Voltar para hist.rico/i));
  const reviewButton = await visibleOrFalse(page.getByRole('button', { name: /Concluir.*Revisar/i }).first());
  return {
    operational: photoRegistry || ((fileInputCount > 0 || addRoomVisible || reviewButton) && (roomRows > 0 || backToHistory)),
    photoRegistry,
    fileInputCount,
    addRoomVisible,
    roomRows,
    backToHistory,
    reviewButton,
    url: page.url(),
  };
}

async function waitForInspectionEvidence(page, timeoutMs = 30_000) {
  const started = Date.now();
  let latest = await inspectionEvidence(page);
  while (Date.now() - started < timeoutMs) {
    latest = await inspectionEvidence(page);
    if (latest.operational) return latest;
    await page.waitForTimeout(500);
  }
  return latest;
}

async function startInspectionFromHistory(page) {
  await page.getByRole('button', { name: /Criar Primeira Vistoria|Nova Vistoria/i }).first().click();
  await page.getByText(/Iniciar Nova Vistoria/i).waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByRole('button', { name: /Vistoria de Entrada/i }).click();
  await page.getByRole('button', { name: /Come.ar Vistoria/i }).click();
  const evidence = await waitForInspectionEvidence(page, 45_000);
  if (!evidence.operational) throw new Error(`INSPECTION_CREATED_NOT_OPENED: ${JSON.stringify(evidence)}`);
  return evidence;
}

async function openDraftFromHistory(page) {
  await page.getByText(/Hist.rico de Vistorias/i).waitFor({ state: 'visible', timeout: 45_000 });
  await page.getByRole('button', { name: /Continuar Rascunho/i }).first().click();
  const evidence = await waitForInspectionEvidence(page, 45_000);
  if (!evidence.operational) throw new Error(`INSPECTION_CREATED_NOT_OPENED: ${JSON.stringify(evidence)}`);
  return evidence;
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

async function selectRoom(page, roomName) {
  const row = roomRow(page, roomName);
  await row.waitFor({ state: 'visible', timeout: 45_000 });
  await row.locator('button').first().click();
  await page.waitForTimeout(500);
}

async function waitForAiForCurrentRoom(page, expectedCards, timeoutMs = 180_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const cards = await page.locator('[data-testid^="photo-card-"]').count();
    const completed = await page.locator('[data-testid^="photo-ai-completed-"]').count();
    const fallback = await page.locator('[data-testid^="photo-ai-fallback-"]').count();
    if (fallback > 0) throw new Error(`AI_FALLBACK_APPLIED: fallback=${fallback}`);
    if (cards >= expectedCards && completed >= expectedCards) return;
    await page.waitForTimeout(1500);
  }
  throw new Error(`AI_TIMEOUT: completed panels did not reach ${expectedCards}`);
}

async function reportEvidence(page) {
  const titleVisible = await visibleOrFalse(page.getByText(/Visualizar Relat.rio/i).first());
  const downloadButtonVisible = await visibleOrFalse(page.getByRole('button', { name: /Baixar Relat.rio PDF/i }).first());
  const summaryVisible = await visibleOrFalse(page.getByText(/Resumo Geral da Vistoria/i).first());
  const catalogVisible = await visibleOrFalse(page.getByText(/Itens e fotos catalogados/i).first());
  const readyVisible = await visibleOrFalse(page.getByText(/Pronto para gerar/i).first());
  const visibleText = await page.locator('body').innerText({ timeout: 3_000 })
    .then((text) => text.replace(/\s+/g, ' ').slice(0, 2_500))
    .catch(() => '');
  const operational = titleVisible
    || downloadButtonVisible
    || (summaryVisible && catalogVisible)
    || (readyVisible && /Baixar Relat.rio PDF/i.test(visibleText));
  return {
    operational,
    titleVisible,
    downloadButtonVisible,
    summaryVisible,
    catalogVisible,
    readyVisible,
    url: page.url(),
    visibleText,
  };
}

async function waitForReportEvidence(page, timeoutMs = 60_000) {
  const started = Date.now();
  let latest = await reportEvidence(page);
  while (Date.now() - started < timeoutMs) {
    latest = await reportEvidence(page);
    if (latest.operational) return latest;
    await page.waitForTimeout(500);
  }
  return latest;
}

async function createUserAndEntitlement(admin) {
  const user = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { testRunId: RUN_ID, purpose: 'uat_ai_controlled_10_photos' },
  });
  if (user.error || !user.data.user) throw new Error(`admin create user failed: ${user.error?.message || 'no user'}`);

  const plan = await admin
    .from('plans')
    .select('id,max_photos_per_inspection,pdf_enabled')
    .eq('id', 'beta_paid_4990')
    .single();
  if (plan.error || !plan.data) throw new Error(`plan beta_paid_4990 unavailable: ${plan.error?.message || 'missing'}`);

  const entitlement = await admin.from('entitlements').insert({
    id: `${user.data.user.id}_beta_paid_4990_${RUN_ID}`,
    user_id: user.data.user.id,
    plan_id: plan.data.id,
    status: 'active',
    source: 'manual_admin',
    max_photos_per_inspection: plan.data.max_photos_per_inspection,
    pdf_enabled: plan.data.pdf_enabled,
  }).select('id').single();
  if (entitlement.error) throw new Error(`admin entitlement insert failed: ${entitlement.error.message}`);

  return { userId: user.data.user.id, email: TEST_EMAIL, password: TEST_PASSWORD, plan: plan.data };
}

async function pathExists(admin, storagePath) {
  const parts = storagePath.split('/');
  const fileName = parts.pop();
  const folder = parts.join('/');
  const listed = await admin.storage.from(BUCKET).list(folder, { limit: 1000 });
  if (listed.error) throw new Error(`storage list failed: ${listed.error.message}`);
  return listed.data.some((entry) => entry.name === fileName);
}

async function cleanup(admin, userId) {
  const created = { storagePaths: [] };
  const photos = await admin.from('photos').select('storage_path').eq('user_id', userId);
  if (!photos.error) created.storagePaths.push(...photos.data.map((row) => row.storage_path).filter(Boolean));
  const reports = await admin.from('reports').select('storage_path').eq('user_id', userId);
  if (!reports.error) created.storagePaths.push(...reports.data.map((row) => row.storage_path).filter(Boolean));

  const result = { ok: false, errors: [], leftovers: {}, storagePaths: [...new Set(created.storagePaths)] };
  if (result.storagePaths.length) {
    const res = await admin.storage.from(BUCKET).remove(result.storagePaths);
    if (res.error) result.errors.push(`storage remove: ${res.error.message}`);
  }

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
  const profileCheck = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('id', userId);
  result.leftovers.profileRows = profileCheck.error ? `check_error: ${profileCheck.error.message}` : (profileCheck.count || 0);
  const authUser = await admin.auth.admin.getUserById(userId);
  result.leftovers.authUserExists = authUser.data?.user ? true : false;
  for (const storagePath of result.storagePaths) {
    result.leftovers[`storage:${storagePath}`] = await pathExists(admin, storagePath).catch((error) => `list_error: ${sanitizeMessage(error.message)}`);
  }
  result.ok = result.errors.length === 0 && Object.values(result.leftovers).every((value) => value === 0 || value === false);
  return result;
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

function usefulSuggestion(photo) {
  const text = photo.description_suggested || photo.description || photo.ai_analysis?.descricao_neutra || photo.ai_analysis?.observacao_sugerida || '';
  if (!text || text.length < 20) return false;
  if (/fallback|sem analise|manual|nao disponivel|não disponível/i.test(text)) return false;
  return true;
}

async function queryAiState(admin, userId, inspectionId) {
  const photos = await admin
    .from('photos')
    .select('id,room_id,storage_path,analysis_status,analysis_error,ai_analysis,description,description_suggested,condition_suggested,fallback_applied,reviewed_status')
    .eq('user_id', userId)
    .eq('inspection_id', inspectionId)
    .order('created_at', { ascending: true });
  if (photos.error) throw new Error(`photos query failed: ${photos.error.message}`);
  return photos.data;
}

function renderReport(result) {
  const lines = [
    '# VF UAT IA Controlada - 10 Fotos Reais - 2026-06-27',
    '',
    `STATUS FINAL: ${result.status}`,
    '',
    `URL testada: ${result.url}`,
    `Run ID: ${result.runId}`,
    `Inicio: ${result.startedAt}`,
    `Fim: ${result.finishedAt}`,
    '',
    '## Limite de Custo',
    '',
    `- Dataset aprovado: ${result.inventory.datasetPath || DATASET_PATH}`,
    `- Status do dataset: ${result.inventory.datasetStatus || 'nao informado'}`,
    `- Fotos maximas permitidas: ${MAX_AI_PHOTOS}`,
    `- Fotos selecionadas: ${result.inventory.samplePhotoCount}`,
    `- Base aprovada: R$ ${(MAX_AI_PHOTOS * COST_BASE_PER_PHOTO_BRL).toFixed(2)}`,
    `- Stress aprovado: R$ ${(MAX_AI_PHOTOS * COST_STRESS_PER_PHOTO_BRL).toFixed(2)}`,
    `- Custo estimado executado base: R$ ${(result.photosAnalyzedByIa * COST_BASE_PER_PHOTO_BRL).toFixed(2)}`,
    `- Custo estimado executado stress: R$ ${(result.photosAnalyzedByIa * COST_STRESS_PER_PHOTO_BRL).toFixed(2)}`,
    `- Requests IA observados: ${result.openAiRequestCount}`,
    `- Tokens totais: ${result.usage.totalTokens}`,
    '',
    '## Matriz',
    '',
    '| Fase | Caso | Esperado | Status | Evidencia |',
    '| --- | --- | --- | --- | --- |',
    ...result.matrix.map((row) => `| ${row.phase} | ${row.caso} | ${row.esperado} | ${row.status} | ${row.evidencia || ''} |`),
    '',
    '## Fotos por Comodo',
    '',
    '| Comodo | Foto | Status IA | Condicao | Confianca | Sugestao util |',
    '| --- | --- | --- | --- | --- | --- |',
    ...result.photoEvidence.map((row) => `| ${row.room} | ${row.fileName} | ${row.analysisStatus} | ${row.condition || ''} | ${row.confidence || ''} | ${row.useful ? 'sim' : 'nao'} |`),
    '',
    '## Gaps',
    '',
    result.gaps.length ? result.gaps.map((gap) => `- ${gap}`).join('\n') : '- Nenhum gap registrado.',
    '',
    '## Bugs/Bloqueios',
    '',
    result.bugs.length ? result.bugs.map((bug) => `- ${bug}`).join('\n') : '- Nenhum bug bloqueador registrado.',
    '',
    '## Cleanup',
    '',
    `- Cleanup total: ${result.cleanupOk ? 'sim' : 'nao'}`,
    `- Leftovers: ${result.cleanupDetails ? JSON.stringify(result.cleanupDetails.leftovers) : 'nao executado'}`,
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
    photoEvidence: [],
    gaps: [],
    bugs: [],
    photosUploaded: 0,
    photosAnalyzedByIa: 0,
    openAiRequestCount: 0,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    cleanupOk: false,
    cleanupDetails: null,
    reportWorked: false,
    error: null,
  };

  if (inventory.governanceErrors.length) {
    result.status = 'FAIL_DATASET_GOVERNANCE';
    result.error = inventory.governanceErrors.join('; ');
    result.bugs.push(...inventory.governanceErrors);
    addCase(result, '0', 'Governanca do dataset aprovado', 'JSON aprovado com exatamente 10 fotos, 1 por comodo, caminhos validos e hashes coerentes', 'FAIL', result.error);
    result.finishedAt = new Date().toISOString();
    writeFileSync(REPORT_PATH, renderReport(result), 'utf8');
    writeFileSync(REPORT_JSON_PATH, JSON.stringify(result, null, 2), 'utf8');
    console.log(JSON.stringify({
      status: result.status,
      datasetPath: inventory.datasetPath,
      photosUploaded: 0,
      photosAnalyzedByIa: 0,
      openAiCalls: 0,
      tokens: 0,
      estimatedCostBaseBrl: 0,
      estimatedCostStressBrl: 0,
      report: REPORT_PATH,
      reportJson: REPORT_JSON_PATH,
      error: result.error,
    }, null, 2));
    process.exitCode = 1;
    return;
  }

  addCase(result, '0', 'Governanca do dataset aprovado', 'Usar exclusivamente qa/vf_ai_dataset_selection_20260627.json', 'PASS', `${inventory.samplePhotoCount} fotos aprovadas; ${inventory.totalRooms} comodos; OpenAI=0 antes do upload`);

  if (DRY_RUN) {
    result.status = 'PASS_DATASET_DRY_NO_COST';
    result.finishedAt = new Date().toISOString();
    writeFileSync(REPORT_PATH, renderReport(result), 'utf8');
    writeFileSync(REPORT_JSON_PATH, JSON.stringify(result, null, 2), 'utf8');
    console.log(JSON.stringify({
      status: result.status,
      datasetPath: inventory.datasetPath,
      totalRooms: inventory.totalRooms,
      selectedPhotos: inventory.samplePhotoCount,
      selectedFiles: inventory.sample.map((item) => ({ room: item.room, fileName: path.basename(item.file) })),
      photosUploaded: 0,
      photosAnalyzedByIa: 0,
      openAiCalls: 0,
      tokens: 0,
      estimatedCostBaseBrl: 0,
      estimatedCostStressBrl: 0,
      report: REPORT_PATH,
      reportJson: REPORT_JSON_PATH,
    }, null, 2));
    process.exitCode = 0;
    return;
  }

  if (inventory.totalRooms !== 10 || inventory.samplePhotoCount !== 10) {
    result.status = 'COST_GUARD';
    result.error = `Amostra invalida: rooms=${inventory.totalRooms}, photos=${inventory.samplePhotoCount}`;
    result.bugs.push(result.error);
    result.finishedAt = new Date().toISOString();
    writeFileSync(REPORT_PATH, renderReport(result), 'utf8');
    writeFileSync(REPORT_JSON_PATH, JSON.stringify(result, null, 2), 'utf8');
    console.log(JSON.stringify({ status: result.status, error: result.error, report: REPORT_PATH }, null, 2));
    process.exitCode = 2;
    return;
  }
  addCase(result, '0', 'COST_GUARD inicial', '10 comodos, 1 foto por comodo, maximo 10 chamadas IA', 'PASS', 'Amostra 10/10; base R$ 1.50; stress R$ 2.50');

  const env = loadEnvLocal();
  const missing = ['VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((key) => !env[key]);
  if (missing.length) throw new Error(`missing ${missing.join(', ')} in .env.local`);

  const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  let provisioned = null;
  let browser = null;
  let context = null;
  let inspectionId = null;
  const runtime = { aiRequests: [], consoleErrors: [], pageErrors: [], failedRequests: [] };

  try {
    provisioned = await createUserAndEntitlement(admin);
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    page.on('request', (request) => {
      if (/\/\.netlify\/functions\/analyze-photo/i.test(request.url())) runtime.aiRequests.push({ url: request.url(), at: new Date().toISOString() });
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !/invalid login credentials/i.test(msg.text())) runtime.consoleErrors.push(sanitizeMessage(msg.text()));
    });
    page.on('pageerror', (error) => runtime.pageErrors.push(sanitizeMessage(error.message || error)));
    page.on('requestfailed', (request) => runtime.failedRequests.push(sanitizeMessage(request.failure()?.errorText || 'request failed')));

    const response = await page.goto(`${TARGET_URL}/?uat_ai_controlled=${RUN_ID}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if ((response?.status() || 0) !== 200) throw new Error(`public URL status ${response?.status() || 'unknown'}`);
    await login(page, provisioned.email, provisioned.password);

    const propertyName = `IA Controlada ${RUN_ID}`;
    await createProperty(page, propertyName);
    await openHistory(page, propertyName);
    await startInspectionFromHistory(page);

    const latestInspection = await admin.from('inspections').select('id,property_id').eq('user_id', provisioned.userId).order('started_at', { ascending: false }).limit(1).single();
    if (latestInspection.error || !latestInspection.data?.id) throw new Error(`inspection query failed: ${latestInspection.error?.message || 'missing'}`);
    inspectionId = latestInspection.data.id;
    addCase(result, '1', 'Setup core', 'Usuario, imovel e vistoria criados no app publico', 'PASS', `inspectionId=${inspectionId}`);

    const defaultRoomNames = ['Sala', 'Quarto 1', 'Quarto 2', 'Banheiro', 'Cozinha', 'Área de Serviço', 'Varanda', 'Garagem', 'Outros'];
    const roomNames = inventory.rooms.map((room) => room.name);
    for (let i = 0; i < Math.min(defaultRoomNames.length, roomNames.length); i += 1) {
      await renameRoom(page, defaultRoomNames[i], roomNames[i]);
    }
    for (const roomName of roomNames.slice(defaultRoomNames.length)) {
      await addRoom(page, roomName);
    }
    addCase(result, '2', 'Comodos', 'Criar 10 comodos a partir das pastas reais', 'PASS', `${roomNames.length} comodos`);

    for (let index = 0; index < inventory.rooms.length; index += 1) {
      if (result.photosUploaded >= MAX_AI_PHOTOS || runtime.aiRequests.length >= MAX_AI_PHOTOS) {
        throw new Error(`COST_GUARD: limit reached before room ${inventory.rooms[index].name}`);
      }
      const room = inventory.rooms[index];
      const file = room.sampleFiles[0];
      await selectRoom(page, room.name);
      const beforeCards = await page.locator('[data-testid^="photo-card-"]').count();
      await page.locator('input[type="file"][multiple]').last().setInputFiles(file);
      result.photosUploaded += 1;
      await waitForAiForCurrentRoom(page, beforeCards + 1, 210_000);
      if (runtime.aiRequests.length > MAX_AI_PHOTOS) throw new Error(`COST_GUARD: ${runtime.aiRequests.length} IA requests observed`);
      result.photoEvidence.push({
        room: room.name,
        fileName: path.basename(file),
        analysisStatus: 'ui_completed',
        condition: '',
        confidence: '',
        useful: false,
      });
      addCase(result, '3', `Upload/IA ${room.name}`, '1 foto real sobe e recebe IA sem fallback', 'PASS', path.basename(file));
    }

    const photos = await queryAiState(admin, provisioned.userId, inspectionId);
    if (photos.length !== MAX_AI_PHOTOS) throw new Error(`PHOTO_COUNT_MISMATCH: expected ${MAX_AI_PHOTOS}, got ${photos.length}`);
    const completed = photos.filter((photo) => photo.analysis_status === 'completed' && photo.ai_analysis && !photo.fallback_applied);
    if (completed.length !== MAX_AI_PHOTOS) {
      const failed = photos.find((photo) => photo.fallback_applied || photo.analysis_status !== 'completed');
      const reason = failed?.analysis_error || failed?.ai_analysis?.error || 'AI incomplete';
      throw new Error(/quota|openai|key|permission|429|503/i.test(reason) ? `BLOCKED: ${reason}` : `FAIL: ${reason}`);
    }
    const useless = completed.filter((photo) => !usefulSuggestion(photo));
    if (useless.length) throw new Error(`USELESS_AI_SUGGESTION: ${useless.map((photo) => photo.id).join(',')}`);
    for (const photo of completed) {
      if (!photo.storage_path || !(await pathExists(admin, photo.storage_path))) throw new Error(`STORAGE_MISSING: ${photo.id}`);
      if (!photo.condition_suggested && !photo.ai_analysis?.condicao_sugerida) throw new Error(`CONDITION_MISSING: ${photo.id}`);
      if (!photo.ai_analysis?.confianca) throw new Error(`CONFIDENCE_MISSING: ${photo.id}`);
    }
    result.usage = usageTotals(completed);
    result.photosAnalyzedByIa = completed.length;
    result.openAiRequestCount = runtime.aiRequests.length;
    result.photoEvidence = completed.map((photo, index) => ({
      room: inventory.sample[index]?.room || photo.room_id,
      fileName: path.basename(inventory.sample[index]?.file || photo.storage_path || photo.id),
      analysisStatus: photo.analysis_status,
      condition: photo.condition_suggested || photo.ai_analysis?.condicao_sugerida || '',
      confidence: photo.ai_analysis?.confianca || '',
      useful: usefulSuggestion(photo),
    }));
    if (result.openAiRequestCount !== MAX_AI_PHOTOS) throw new Error(`OPENAI_CALL_COUNT_MISMATCH: expected ${MAX_AI_PHOTOS}, got ${result.openAiRequestCount}`);
    addCase(result, '4', 'Persistencia Supabase/Storage', '10 fotos completas, sugestoes uteis, condicao/confianca e storage validos', 'PASS', `tokens=${result.usage.totalTokens}`);

    await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
    await page.getByText(/Meus Im.veis/i).waitFor({ state: 'visible', timeout: 45_000 });
    await openHistory(page, propertyName);
    await openDraftFromHistory(page);
    if ((await queryAiState(admin, provisioned.userId, inspectionId)).filter((photo) => photo.analysis_status === 'completed' && photo.ai_analysis).length !== MAX_AI_PHOTOS) {
      throw new Error('PERSISTENCE_RELOAD_FAILED');
    }
    await logout(page);
    await login(page, provisioned.email, provisioned.password);
    await openHistory(page, propertyName);
    await openDraftFromHistory(page);
    if ((await queryAiState(admin, provisioned.userId, inspectionId)).filter((photo) => photo.analysis_status === 'completed' && photo.ai_analysis).length !== MAX_AI_PHOTOS) {
      throw new Error('PERSISTENCE_RELOGIN_FAILED');
    }
    if (runtime.aiRequests.length > MAX_AI_PHOTOS) throw new Error(`COST_GUARD: reanalysis observed after reload/relogin (${runtime.aiRequests.length})`);
    addCase(result, '5', 'Persistencia reload/logout-login', 'Analises continuam salvas sem reanalise automatica', 'PASS', `requests IA=${runtime.aiRequests.length}`);

    await page.getByRole('button', { name: /Concluir.*Revisar/i }).click();
    const reportUi = await waitForReportEvidence(page, 60_000);
    if (!reportUi.operational) {
      throw new Error(`REPORT_NOT_DETECTED: ${JSON.stringify(reportUi)}`);
    }
    for (const row of result.photoEvidence.slice(0, 3)) {
      if (row.condition) await page.getByText(new RegExp(escapeRegex(row.condition))).first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
    }
    if (!reportUi.downloadButtonVisible) throw new Error(`REPORT_BUTTON_NOT_FOUND: ${JSON.stringify(reportUi)}`);
    const reportsBefore = await admin.from('reports').select('id', { count: 'exact', head: true }).eq('inspection_id', inspectionId);
    const downloadPromise = page.waitForEvent('download', { timeout: 120_000 }).catch(() => null);
    await page.getByRole('button', { name: /Baixar Relat.rio PDF/i }).click();
    await downloadPromise;
    await page.getByText(/Relat.rio gerado com sucesso/i).waitFor({ state: 'visible', timeout: 120_000 });
    const reportsAfter = await admin.from('reports').select('*').eq('inspection_id', inspectionId);
    if (reportsAfter.error) throw new Error(`REPORT_QUERY_FAILED: ${reportsAfter.error.message}`);
    if ((reportsAfter.data?.length || 0) <= (reportsBefore.count || 0)) throw new Error('REPORT_NOT_PERSISTED');
    result.reportWorked = true;
    addCase(result, '6', 'Revisao/relatorio', 'Relatorio mostra fotos/observacoes IA e persiste PDF', 'PASS', `${reportsAfter.data.length} report(s); evidencia=${JSON.stringify({
      title: reportUi.titleVisible,
      download: reportUi.downloadButtonVisible,
      summary: reportUi.summaryVisible,
      catalog: reportUi.catalogVisible,
      ready: reportUi.readyVisible,
    })}`);

    result.status = 'PASS';
  } catch (error) {
    const message = sanitizeMessage(error?.message || error);
    result.error = message;
    if (/COST_GUARD|OPENAI_CALL_COUNT_MISMATCH/i.test(message)) result.status = 'COST_GUARD';
    else if (/BLOCKED|quota|openai|api_key|netlify|supabase|storage|permission|rate limit|missing|429|503/i.test(message)) result.status = 'BLOCKED';
    else result.status = 'FAIL';
    result.bugs.push(message);
  } finally {
    if (context) await context.close().catch(() => undefined);
    if (browser) await browser.close().catch(() => undefined);
    if (provisioned?.userId) {
      result.cleanupDetails = await cleanup(admin, provisioned.userId).catch((error) => ({ ok: false, errors: [sanitizeMessage(error?.message || error)], leftovers: { cleanupFailed: true } }));
      result.cleanupOk = result.cleanupDetails.ok;
      addCase(result, '7', 'Cleanup', 'Remover usuarios, dados e arquivos de teste', result.cleanupOk ? 'PASS' : 'FAIL', result.cleanupOk ? 'Sem leftovers' : JSON.stringify(result.cleanupDetails.errors));
      if (result.status === 'PASS' && !result.cleanupOk) result.status = 'FAIL';
    }
    result.finishedAt = new Date().toISOString();
    writeFileSync(REPORT_PATH, renderReport(result), 'utf8');
    writeFileSync(REPORT_JSON_PATH, JSON.stringify(result, null, 2), 'utf8');
  }

  console.log(JSON.stringify({
    status: result.status,
    url: result.url,
    photosUploaded: result.photosUploaded,
    photosAnalyzedByIa: result.photosAnalyzedByIa,
    openAiCalls: result.openAiRequestCount,
    tokens: result.usage.totalTokens,
    estimatedCostBaseBrl: Number((result.photosAnalyzedByIa * COST_BASE_PER_PHOTO_BRL).toFixed(2)),
    estimatedCostStressBrl: Number((result.photosAnalyzedByIa * COST_STRESS_PER_PHOTO_BRL).toFixed(2)),
    reportWorked: result.reportWorked,
    cleanupOk: result.cleanupOk,
    report: REPORT_PATH,
    reportJson: REPORT_JSON_PATH,
    error: result.error,
  }, null, 2));

  process.exitCode = result.status === 'PASS' ? 0 : result.status === 'COST_GUARD' || result.status === 'BLOCKED' ? 2 : 1;
}

run().catch((error) => {
  const message = sanitizeMessage(error?.message || error);
  const result = {
    status: /COST_GUARD/i.test(message) ? 'COST_GUARD' : 'BLOCKED',
    url: TARGET_URL,
    runId: RUN_ID,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    inventory: { photoRoot: PHOTO_ROOT, totalRooms: 0, totalValidPhotos: 0, rooms: [], sample: [], samplePhotoCount: 0, costBase: 0, costStress: 0 },
    matrix: [],
    photoEvidence: [],
    gaps: [],
    bugs: [message],
    photosUploaded: 0,
    photosAnalyzedByIa: 0,
    openAiRequestCount: 0,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    cleanupOk: false,
    cleanupDetails: null,
    reportWorked: false,
    error: message,
  };
  writeFileSync(REPORT_PATH, renderReport(result), 'utf8');
  writeFileSync(REPORT_JSON_PATH, JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify({ status: result.status, error: message, report: REPORT_PATH }, null, 2));
  process.exitCode = 2;
});
