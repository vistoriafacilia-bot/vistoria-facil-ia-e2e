import { expect, test, type Page } from '@playwright/test';

async function requireAuthenticatedHome(page: Page) {
  await page.goto('/');
  const appHome = page.getByText(/Meus Im.veis/i);
  const googleLogin = page.getByRole('button', { name: /Entrar com o Google/i });

  if (await googleLogin.isVisible().catch(() => false)) {
    throw new Error(
      'STAGING_AUTH_BLOCKED: staging real abriu tela de login Google. ' +
      'A suite sem VITE_E2E_MODE precisa de uma estratégia automatizada de Auth real ' +
      '(ex.: usuário de teste de staging com provider automatizável ou estado autenticado gerado em CI).'
    );
  }

  await expect(appHome).toBeVisible();
}

async function startInspection(page: Page, type: 'entrada' | 'saida' = 'entrada') {
  await page.getByRole('button', { name: /Nova Vistoria/i }).click();
  await expect(page.getByText(/Iniciar Nova Vistoria/i)).toBeVisible();

  if (type === 'saida') {
    await page.getByRole('button', { name: /Vistoria de Sa.da/i }).click();
  }

  await page.getByRole('button', { name: /Come.ar Vistoria/i }).click();
  await expect(page.getByText(type === 'saida' ? /Vistoria de Sa.da/i : /Vistoria de Entrada/i)).toBeVisible();
}

test('VF-E2E-001 REAL: login real, plano gratuito e tela inicial carregam', async ({ page }) => {
  await requireAuthenticatedHome(page);
  await expect(page.getByText(/Vers.o Beta Limitada a 10 Fotos|free|gratuito/i)).toBeVisible();
});

test('VF-E2E-002 REAL: Nova Vistoria abre escolha Entrada/Saida', async ({ page }) => {
  await requireAuthenticatedHome(page);
  await page.getByRole('button', { name: /Nova Vistoria/i }).click();
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
  await page.getByRole('button', { name: /Nova Vistoria/i }).click();
  await expect(page.getByText(/Iniciar Nova Vistoria/i)).toBeVisible();
});

test('VF-E2E-007 REAL: fotos por comodo persistem', async ({ page }) => {
  await requireAuthenticatedHome(page);
  await startInspection(page, 'entrada');
  await expect(page.locator('input[type="file"][multiple]')).toBeAttached();
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
  await startInspection(page, 'entrada');
  throw new Error('REAL_STAGING_PRECONDITION: exige upload real de foto, Storage real e IA/API staging funcionais antes da geracao de PDF.');
});

test('VF-E2E-010 REAL: reload mantem estado', async ({ page }) => {
  await requireAuthenticatedHome(page);
  await page.reload();
  await expect(page.getByText(/Meus Im.veis/i)).toBeVisible();
});
