import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const exists = file => fs.existsSync(path.join(root, file));

const failures = [];
const warnings = [];
const pass = message => console.log(`PASS ${message}`);
const fail = message => failures.push(message);
const warn = message => warnings.push(message);

const requiredFiles = [
  'README.md',
  'security_spec.md',
  'supabase/migrations/202606250001_vistoria_facil_foundation.sql',
  '.env.example',
  'src/lib/appVersion.ts',
  'src/lib/plans.ts',
  'src/lib/entitlements.ts',
  'src/lib/paymentGuards.ts',
  'src/lib/qaGates.ts',
  'src/lib/reporting.ts',
  'src/lib/supabaseClient.ts',
  'src/lib/services/authService.ts',
  'src/lib/services/propertyService.ts',
  'src/lib/services/inspectionService.ts',
  'src/lib/services/roomService.ts',
  'src/lib/services/photoService.ts',
  'src/lib/services/storageService.ts',
  'qa/patch017_e2e_hardening_checklist.md',
  'qa/patch018_payment_webhook_hardening_checklist.md',
  'qa/release_candidate_gate_v0_4.md',
  'qa/uat_script_v0_4.md',
  'qa/aistudio_staging_runbook_v0_4.md',
  'qa/ai_studio_apply_checklist_v0_4.md',
  'qa/staging_evidence_template_v0_4.md',
  'qa/performance_budget_v0_4.md',
  'scripts/qa-performance-budget.mjs',
  'vite.config.ts'
];

for (const file of requiredFiles) {
  exists(file) ? pass(`arquivo obrigatório presente: ${file}`) : fail(`arquivo obrigatório ausente: ${file}`);
}

if (exists('package.json')) {
  const pkg = JSON.parse(read('package.json'));
  for (const script of ['lint', 'test', 'test:ci', 'build', 'qa:rc', 'qa:static', 'qa:staging', 'qa:performance']) {
    pkg.scripts?.[script] ? pass(`script package.json presente: ${script}`) : fail(`script package.json ausente: ${script}`);
  }
}

if (exists('.env.example')) {
  const env = read('.env.example');
  for (const key of [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'VITE_E2E_MODE'
  ]) {
    env.includes(key) ? pass(`.env.example documenta ${key}`) : fail(`.env.example não documenta ${key}`);
  }
}

if (exists('supabase/migrations/202606250001_vistoria_facil_foundation.sql')) {
  const migration = read('supabase/migrations/202606250001_vistoria_facil_foundation.sql');
  for (const token of [
    'create table if not exists public.profiles',
    'create table if not exists public.properties',
    'create table if not exists public.inspections',
    'create table if not exists public.rooms',
    'create table if not exists public.photos',
    'create table if not exists public.entitlements',
    'enable row level security',
    'auth.uid()',
    'inspection-photos',
    'storage.objects'
  ]) {
    migration.includes(token) ? pass(`migration Supabase contem ${token}`) : fail(`migration Supabase nao contem ${token}`);
  }
}

if (exists('.github/workflows/e2e.yml')) {
  const workflow = read('.github/workflows/e2e.yml');
  for (const forbidden of ['gcloud', 'firebase deploy', 'google-github-actions', 'Cloud Run', 'Artifact Registry']) {
    workflow.includes(forbidden)
      ? fail(`workflow ainda referencia recurso pago/billing: ${forbidden}`)
      : pass(`workflow nao referencia ${forbidden}`);
  }
}

if (exists('firestore.rules')) {
  const rules = read('firestore.rules');
  for (const token of ['match /orders', 'match /payments', 'match /entitlements', 'match /webhook_events', 'match /inspections']) {
    rules.includes(token) ? pass(`firestore.rules contém ${token}`) : fail(`firestore.rules não contém ${token}`);
  }
  if (/allow\s+(create|create,\s*update,\s*delete)\s*:\s*if\s*false/.test(rules)) pass('Firestore bloqueia criação client-side em pelo menos uma coleção sensível.');
  else warn('Não encontrei bloqueio explícito de create em regras sensíveis; revisar manualmente.');
}

if (exists('storage.rules')) {
  const rules = read('storage.rules');
  rules.includes('reports/{userId}/{propertyId}/{inspectionId}/{fileName}')
    ? pass('storage.rules limita relatórios por user/property/inspection.')
    : fail('storage.rules não contém path controlado de relatórios.');
  rules.includes("request.resource.contentType == 'application/pdf'")
    ? pass('storage.rules limita upload de relatório a PDF.')
    : fail('storage.rules não limita upload de relatório a PDF.');
}

const prodFiles = [];
const walk = dir => {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', 'dist', '.git', '__tests__', 'test'].includes(entry.name)) walk(rel);
      continue;
    }
    if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) prodFiles.push(rel);
  }
};
walk('src');

for (const file of prodFiles) {
  const contents = read(file);
  if (contents.includes('V0.1.0')) fail(`versão antiga V0.1.0 ainda aparece em arquivo de produção: ${file}`);
  if (/MERCADOPAGO_ACCESS_TOKEN\s*=\s*['\"][^'\"]+['\"]/.test(contents)) fail(`possível segredo Mercado Pago hardcoded em ${file}`);
}
pass('varredura de versão antiga/segredos concluída.');

if (exists('vite.config.ts')) {
  const viteConfig = read('vite.config.ts');
  viteConfig.includes('manualChunks')
    ? pass('vite.config.ts contém manualChunks para split de bundle.')
    : fail('vite.config.ts não contém manualChunks para split de bundle.');
  for (const chunk of ['vendor-react', 'vendor-supabase', 'vendor-ui']) {
    viteConfig.includes(chunk)
      ? pass(`vite.config.ts configura chunk ${chunk}.`)
      : fail(`vite.config.ts não configura chunk ${chunk}.`);
  }
}

if (exists('src/lib/appVersion.ts')) {
  const appVersion = read('src/lib/appVersion.ts');
  appVersion.includes('V0.4.0-rc2')
    ? pass('APP_VERSION centralizada em V0.4.0-rc2.')
    : fail('APP_VERSION esperada V0.4.0-rc2 não encontrada.');
}

if (warnings.length) {
  console.log('\nWARNINGS');
  for (const item of warnings) console.log(`WARN ${item}`);
}

if (failures.length) {
  console.error('\nRELEASE GATE FAILED');
  for (const item of failures) console.error(`FAIL ${item}`);
  process.exit(1);
}

console.log('\nRELEASE GATE PASSED');
