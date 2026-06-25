import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const exists = file => fs.existsSync(path.join(root, file));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const failures = [];
const warnings = [];
const pass = message => console.log(`PASS ${message}`);
const fail = message => failures.push(message);
const warn = message => warnings.push(message);

const requiredFiles = [
  'qa/aistudio_staging_runbook_v0_4.md',
  'qa/ai_studio_apply_checklist_v0_4.md',
  'qa/staging_evidence_template_v0_4.md',
  'qa/release_candidate_gate_v0_4.md',
  'qa/uat_script_v0_4.md',
  '.env.example',
  'firestore.rules',
  'storage.rules',
  'qa/performance_budget_v0_4.md',
  'scripts/qa-performance-budget.mjs'
];

for (const file of requiredFiles) {
  exists(file) ? pass(`arquivo de staging presente: ${file}`) : fail(`arquivo de staging ausente: ${file}`);
}

const requiredRunbookTokens = [
  'AI Studio não será usado para pensar',
  'backup válido',
  'rollback',
  'Mercado Pago sandbox',
  'webhook',
  'entitlement',
  'Firestore rules',
  'Storage rules',
  'STG-E2E-01',
  'STG-E2E-07',
  'UAT só entra após PASS'
];

if (exists('qa/aistudio_staging_runbook_v0_4.md')) {
  const runbook = read('qa/aistudio_staging_runbook_v0_4.md');
  for (const token of requiredRunbookTokens) {
    runbook.includes(token) ? pass(`runbook contém: ${token}`) : fail(`runbook não contém: ${token}`);
  }
}

if (exists('qa/staging_evidence_template_v0_4.md')) {
  const evidence = read('qa/staging_evidence_template_v0_4.md');
  for (const token of ['Gates locais', 'Configuração sem segredos', 'Defeitos abertos', 'PASS', 'BLOCKED', 'ROLLBACK']) {
    evidence.includes(token) ? pass(`template de evidência contém: ${token}`) : fail(`template de evidência não contém: ${token}`);
  }
}

if (exists('qa/ai_studio_apply_checklist_v0_4.md')) {
  const checklist = read('qa/ai_studio_apply_checklist_v0_4.md');
  for (const token of ['Exportar backup atual', 'Plano pago sandbox aprovado', 'Pagamento pendente/recusado', 'Isolamento de usuário']) {
    checklist.includes(token) ? pass(`checklist contém: ${token}`) : fail(`checklist não contém: ${token}`);
  }
}

if (exists('package.json')) {
  const pkg = JSON.parse(read('package.json'));
  pkg.scripts?.['qa:staging'] ? pass('script qa:staging presente.') : fail('script qa:staging ausente.');
  pkg.scripts?.['qa:performance'] ? pass('script qa:performance presente.') : fail('script qa:performance ausente.');
}

if (exists('.env.example')) {
  const env = read('.env.example');
  for (const key of ['APP_URL', 'MERCADOPAGO_ACCESS_TOKEN', 'GEMINI_API_KEY', 'FIREBASE_PROJECT_ID']) {
    env.includes(key) ? pass(`.env.example contém ${key}`) : fail(`.env.example não contém ${key}`);
  }
  if (/MERCADOPAGO_ACCESS_TOKEN=.*APP_USR-[A-Za-z0-9_-]{12,}/.test(env) || /MERCADOPAGO_ACCESS_TOKEN=.*TEST-(?!MY_)[A-Za-z0-9_-]{12,}/.test(env)) {
    warn('.env.example parece conter token real do Mercado Pago; revisar antes de compartilhar.');
  }
}

if (exists('qa/performance_budget_v0_4.md')) {
  const performance = read('qa/performance_budget_v0_4.md');
  for (const token of ['chunk principal', 'maior chunk', 'vendor-react', 'vendor-firebase', 'qa:performance']) {
    performance.includes(token) ? pass(`performance budget contém: ${token}`) : fail(`performance budget não contém: ${token}`);
  }
}

if (warnings.length) {
  console.log('\nWARNINGS');
  for (const item of warnings) console.log(`WARN ${item}`);
}

if (failures.length) {
  console.error('\nSTAGING READINESS FAILED');
  for (const item of failures) console.error(`FAIL ${item}`);
  process.exit(1);
}

console.log('\nSTAGING READINESS PASSED');
