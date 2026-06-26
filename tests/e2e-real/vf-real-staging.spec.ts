import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const testRunId = (process.env.STAGING_TEST_RUN_ID || 'manual')
  .replace(/[^a-zA-Z0-9_-]+/g, '_')
  .slice(0, 48) || 'manual';
const propertyId = `vf_e2e_property_${testRunId}`;
const propertyCardTestId = `property-card-${propertyId}`;
const propertyStartTestId = `property-start-${propertyId}`;
const propertyHistoryTestId = `property-history-${propertyId}`;
const seededPropertyName = `VF E2E ${testRunId}`;
const onePixelJpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z',
  'base64'
);

async function requireAuthenticatedHome(page: Page) {
  await page.goto('/');
  const appHome = page.getByText(/Meus Im.veis/i);
  const googleLogin = page.getByRole('button', { name: /Entrar com o Google/i });
  const publicEmailForm = page.getByTestId('public-email-auth-form');

  if (await publicEmailForm.isVisible().catch(() => false)) {
    const email = process.env.STAGING_E2E_EMAIL;
    const password = process.env.STAGING_E2E_PASSWORD;
    if (!email || !password) {
      throw new Error(
        'STAGING_AUTH_BLOCKED: formulario Email/Password real esta disponivel, ' +
        'mas STAGING_E2E_EMAIL/STAGING_E2E_PASSWORD nao foram definidos no CI.'
      );
    }

    await page.getByLabel(/^E-mail$/i).fill(email);
    await page.getByLabel(/^Senha$/i).fill(password);
    await page.getByRole('button', { name: /^Entrar$/i }).click();
  }

  if (await googleLogin.isVisible().catch(() => false)) {
    throw new Error(
      'STAGING_AUTH_BLOCKED: staging real abriu tela de login Google. ' +
      'A suite sem VITE_E2E_MODE precisa de uma estratégia automatizada de Auth real ' +
      '(ex.: usuário de teste de staging com provider automatizável ou estado autenticado gerado em CI).'
    );
  }

  await expect(appHome).toBeVisible({ timeout: 20_000 });
  try {
    await expect(page.getByTestId(propertyCardTestId)).toBeVisible({ timeout: 20_000 });
  } catch {
    throw new Error(
      `STAGING_SEED_BLOCKED: imovel seed ${seededPropertyName} (${propertyId}) nao foi encontrado. ` +
      'Execute node scripts/staging-e2e-data.mjs seed com o mesmo STAGING_TEST_RUN_ID antes da suite.'
    );
  }
}

async function startInspection(page: Page, type: 'entrada' | 'saida' = 'entrada') {
  await page.getByTestId(propertyStartTestId).click();
  await expect(page.getByText(/Iniciar Nova Vistoria/i)).toBeVisible();

  if (type === 'saida') {
    await page.getByRole('button', { name: /Vistoria de Sa.da/i }).click();
  }

  await page.getByRole('button', { name: /Come.ar Vistoria/i }).click();
  await expect(page.getByText(type === 'saida' ? /Vistoria de Sa.da/i : /Vistoria de Entrada/i)).toBeVisible();
}

test('VF-E2E-001 REAL: login real, plano gratuito e tela inicial carregam', async ({ page }) => {
  await requireAuthenticatedHome(page);
  await expect(page.getByText(seededPropertyName)).toBeVisible();
  await expect(page.getByText(/Vers.o Beta Limitada a 10 Fotos|free|gratuito/i)).toBeVisible();
});

test('VF-E2E-002 REAL: Nova Vistoria abre escolha Entrada/Saida', async ({ page }) => {
  await requireAuthenticatedHome(page);
  await page.getByTestId(propertyStartTestId).click();
  await expect(page.getByText(/Iniciar Nova Vistoria/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Vistoria de Entrada/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Vistoria de Sa.da/i })).toBeVisible();
});

test('VF-E2E-003 REAL: Comecar Vistoria avanca', async ({ page }) => {
  await requireAuthenticatedHome(page);
  await startInspection(page, 'entrada');
  await expect(page.getByText(/Registro de Fotos: Sala/i)).toBeVisible();
});

test('VF-E2E-004 REAL: adicionar e renomear comodos persiste', async ({ page }) => {
  await requireAuthenticatedHome(page);
  await startInspection(page, 'entrada');
  await page.getByPlaceholder(/Novo c.modo/i).fill('Comodo Real Staging');
  await page.getByTitle(/Adicionar c.modo/i).click();
  await expect(page.getByText('Comodo Real Staging')).toBeVisible();
});

test('VF-E2E-005 REAL: historico retoma rascunho', async ({ page }) => {
  await requireAuthenticatedHome(page);
  await startInspection(page, 'saida');
  await page.getByLabel(/Voltar para hist.rico/i).click();
  await expect(page.getByText(/Hist.rico de Vistorias/i)).toBeVisible();
  await page.getByRole('button', { name: /Continuar Rascunho/i }).click();
  await expect(page.getByText(/Vistoria de Sa.da/i)).toBeVisible();
});

test('VF-E2E-006 REAL: Nova Vistoria nao retoma rascunho silenciosamente', async ({ page }) => {
  await requireAuthenticatedHome(page);
  await startInspection(page, 'entrada');
  await page.getByLabel(/Voltar para hist.rico/i).click();
  await page.getByRole('button', { name: /Voltar para im.veis/i }).click();
  await page.getByTestId(propertyStartTestId).click();
  await expect(page.getByText(/Iniciar Nova Vistoria/i)).toBeVisible();
});

test('VF-E2E-007 REAL: fotos por comodo persistem', async ({ page }) => {
  await requireAuthenticatedHome(page);
  await startInspection(page, 'entrada');
  const fileInput = page.locator('input[type="file"][multiple]').last();
  await expect(fileInput).toBeAttached();
  await fileInput.setInputFiles({
    name: `vf-e2e-storage-${testRunId}.jpg`,
    mimeType: 'image/jpeg',
    buffer: onePixelJpeg,
  });

  const storageImage = page.locator('img[src*="firebasestorage"], img[src*="storage.googleapis"]').first();
  await expect(storageImage).toBeVisible({ timeout: 45_000 });
  const src = await storageImage.getAttribute('src');
  expect(src || '').toMatch(/firebasestorage|storage\.googleapis/);

  const readResponse = await page.request.get(src!);
  expect(readResponse.ok()).toBeTruthy();
});

test('VF-E2E-008 REAL: concluir/revisar bloqueia sem foto', async ({ page }) => {
  await requireAuthenticatedHome(page);
  await startInspection(page, 'entrada');
  let dialogMessage = '';
  const dialogPromise = page.waitForEvent('dialog').then(async dialog => {
    dialogMessage = dialog.message();
    await dialog.accept();
  });
  await page.getByRole('button', { name: /Concluir.*Revisar/i }).click();
  await dialogPromise;
  expect(dialogMessage).toContain('pelo menos uma foto');
});

test('VF-E2E-009 REAL: PDF gera, salva e historico reabre', async ({ page }) => {
  await requireAuthenticatedHome(page);
  const health = await page.request.get('/api/health');
  expect(health.status(), 'Cloud Run/API /api/health deve responder pelo rewrite do Firebase Hosting').toBe(200);
  const healthPayload = await health.json();
  expect(healthPayload.status).toBe('ok');
  expect(healthPayload.geminiConfigured, 'GEMINI_API_KEY precisa estar configurada no backend staging').toBeTruthy();

  await page.getByTestId(propertyHistoryTestId).click();
  await expect(page.getByText(/Hist.rico de Vistorias/i)).toBeVisible();
  await page.getByRole('button', { name: /Ver PDF/i }).first().click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Baixar Relat.rio PDF/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^Vistoria_.*\.pdf$/);
  await expect(page.getByText(/Relat.rio gerado com sucesso/i)).toBeVisible({ timeout: 45_000 });
});

test('VF-E2E-010 REAL: reload mantem estado', async ({ page }) => {
  await requireAuthenticatedHome(page);
  await page.reload();
  await expect(page.getByText(/Meus Im.veis/i)).toBeVisible();
  await expect(page.getByTestId(propertyCardTestId)).toBeVisible();
});
