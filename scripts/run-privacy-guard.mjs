import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteBin = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');
const PORT = Number(process.env.PRIVACY_GUARD_PORT || 4184);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const REPORT_PATH = 'qa/vf_privacy_guard_20260627.md';
const REPORT_JSON_PATH = 'qa/vf_privacy_guard_20260627.json';

function sanitizeMessage(value) {
  const text = String(value || '').replace(/\u001b\[[0-9;]*m/g, '');
  if (/token|key|password|service_role|authorization|secret/i.test(text)) return '[redacted sensitive message]';
  return text.replace(/\s+/g, ' ').slice(0, 700);
}

async function waitForServer(url, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`local vite server did not become ready at ${url}`);
}

function writeReport(result) {
  const md = [
    '# VF Privacy Guard IA - 2026-06-27',
    '',
    `STATUS FINAL: ${result.status}`,
    '',
    `URL testada: ${result.url}`,
    '',
    '## Evidencia',
    '',
    `- Aviso exibido antes do upload/IA: ${result.guardVisible ? 'sim' : 'nao'}`,
    `- Checkbox obrigatorio exibido: ${result.checkboxVisible ? 'sim' : 'nao'}`,
    `- Upload bloqueado antes do aceite: ${result.uploadBlockedBeforeConsent ? 'sim' : 'nao'}`,
    `- Upload liberado apos aceite: ${result.uploadEnabledAfterConsent ? 'sim' : 'nao'}`,
    `- Requests OpenAI/IA antes do aceite: ${result.aiRequestsBeforeConsent}`,
    `- Requests OpenAI/IA totais: ${result.aiRequestsTotal}`,
    `- Secrets expostos: ${result.secretExposure ? 'sim' : 'nao'}`,
    `- Tokens: ${result.tokens}`,
    `- Custo OpenAI: R$ ${result.openAiCostBrl.toFixed(2)}`,
    '',
    '## Bugs/Bloqueios',
    '',
    result.errors.length ? result.errors.map((error) => `- ${error}`).join('\n') : '- Nenhum.',
    '',
    'UAT nao foi liberado automaticamente.',
    '',
  ].join('\n');

  writeFileSync(REPORT_PATH, md, 'utf8');
  writeFileSync(REPORT_JSON_PATH, JSON.stringify(result, null, 2), 'utf8');
}

async function run() {
  const result = {
    status: 'FAIL',
    url: BASE_URL,
    guardVisible: false,
    checkboxVisible: false,
    uploadBlockedBeforeConsent: false,
    uploadEnabledAfterConsent: false,
    aiRequestsBeforeConsent: 0,
    aiRequestsTotal: 0,
    secretExposure: false,
    tokens: 0,
    openAiCostBrl: 0,
    errors: [],
  };

  const server = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(PORT)], {
    cwd: rootDir,
    env: {
      ...process.env,
      VITE_E2E_MODE: 'true',
      E2E_MODE: 'true',
      DISABLE_HMR: 'true',
      VITE_SUPABASE_URL: 'https://e2e-local.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'e2e-local-anon-key',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const serverLogs = [];
  server.stdout.on('data', (chunk) => serverLogs.push(sanitizeMessage(chunk.toString())));
  server.stderr.on('data', (chunk) => serverLogs.push(sanitizeMessage(chunk.toString())));

  let browser;
  try {
    await waitForServer(BASE_URL);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const aiRequests = [];
    const consoleErrors = [];

    await page.route('**/.netlify/functions/analyze-photo', async (route) => {
      aiRequests.push(route.request().url());
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"privacy_guard_should_not_call_ai"}' });
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(sanitizeMessage(msg.text()));
    });

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.evaluate(() => globalThis.__VF_E2E_RESET_STORE__?.());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText(/Meus Im.veis/i).waitFor({ state: 'visible', timeout: 30_000 });

    await page.getByRole('button', { name: /Nova Vistoria/i }).click();
    await page.getByRole('button', { name: /Come.ar Vistoria/i }).click();
    await page.getByText(/Registro de Fotos/i).waitFor({ state: 'visible', timeout: 30_000 });

    const guard = page.getByTestId('privacy-ai-upload-guard');
    const checkbox = page.getByTestId('privacy-ai-upload-checkbox');
    const headerCamera = page.getByTestId('privacy-camera-upload-button');
    const headerGallery = page.getByTestId('privacy-gallery-upload-button');
    const emptyCamera = page.getByTestId('privacy-empty-camera-upload-button');
    const emptyGallery = page.getByTestId('privacy-empty-gallery-upload-button');
    const cameraInput = page.getByTestId('privacy-camera-file-input');
    const galleryInput = page.getByTestId('privacy-gallery-file-input');

    result.guardVisible = await guard.isVisible();
    result.checkboxVisible = await checkbox.isVisible();
    const guardText = await guard.innerText();
    const requiredPhrases = [
      /processadas por servico de inteligencia artificial/i,
      /Nao envie fotos que contenham pessoas/i,
      /documentos/i,
      /dados bancarios/i,
      /dados medicos/i,
      /criancas/i,
      /informacao pessoal\/sensivel/i,
      /Li e confirmo/i,
    ];
    for (const pattern of requiredPhrases) {
      if (!pattern.test(guardText)) result.errors.push(`Aviso nao contem trecho esperado: ${pattern}`);
    }

    const beforeDisabled = await Promise.all([
      headerCamera.isDisabled(),
      headerGallery.isDisabled(),
      emptyCamera.isDisabled(),
      emptyGallery.isDisabled(),
      cameraInput.isDisabled(),
      galleryInput.isDisabled(),
    ]);
    result.uploadBlockedBeforeConsent = beforeDisabled.every(Boolean);
    result.aiRequestsBeforeConsent = aiRequests.length;

    await checkbox.check();
    const afterEnabled = await Promise.all([
      headerCamera.isEnabled(),
      headerGallery.isEnabled(),
      emptyCamera.isEnabled(),
      emptyGallery.isEnabled(),
      cameraInput.isEnabled(),
      galleryInput.isEnabled(),
    ]);
    result.uploadEnabledAfterConsent = afterEnabled.every(Boolean);
    result.aiRequestsTotal = aiRequests.length;
    const sensitiveLogPattern = new RegExp([
      'OPENAI' + '_API' + '_KEY=',
      'SUPABASE' + '_SERVICE' + '_ROLE' + '_KEY=',
      'VITE' + '_SUPABASE' + '_ANON' + '_KEY=',
      's' + 'k-',
      'e' + 'yJ',
    ].join('|'), 'i');
    result.secretExposure = [...consoleErrors, ...serverLogs].some((line) => sensitiveLogPattern.test(line));

    if (!result.guardVisible) result.errors.push('Privacy guard nao ficou visivel.');
    if (!result.checkboxVisible) result.errors.push('Checkbox obrigatorio nao ficou visivel.');
    if (!result.uploadBlockedBeforeConsent) result.errors.push('Upload estava habilitado antes do aceite.');
    if (!result.uploadEnabledAfterConsent) result.errors.push('Upload nao foi liberado apos aceite.');
    if (result.aiRequestsBeforeConsent !== 0 || result.aiRequestsTotal !== 0) result.errors.push('Foi detectada chamada IA durante o gate de privacidade.');
    if (result.secretExposure) result.errors.push('Possivel secret exposto em logs.');

    result.status = result.errors.length ? 'FAIL' : 'PASS';
  } catch (error) {
    result.status = 'FAIL';
    result.errors.push(sanitizeMessage(error?.message || error));
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    server.kill('SIGTERM');
    writeReport(result);
  }

  console.log(JSON.stringify({
    status: result.status,
    guardVisible: result.guardVisible,
    uploadBlockedBeforeConsent: result.uploadBlockedBeforeConsent,
    uploadEnabledAfterConsent: result.uploadEnabledAfterConsent,
    aiRequestsBeforeConsent: result.aiRequestsBeforeConsent,
    aiRequestsTotal: result.aiRequestsTotal,
    tokens: result.tokens,
    openAiCostBrl: result.openAiCostBrl,
    report: REPORT_PATH,
    reportJson: REPORT_JSON_PATH,
    errors: result.errors,
  }, null, 2));
  process.exitCode = result.status === 'PASS' ? 0 : 1;
}

run();
