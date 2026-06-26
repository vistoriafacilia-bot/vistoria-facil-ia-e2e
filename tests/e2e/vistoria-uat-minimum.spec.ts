import { expect, test, type Page } from '@playwright/test';

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64'
);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => (window as any).__VF_E2E_RESET_STORE__?.());
  await page.reload();
  await expect(page.getByText(/Meus Im.veis/i)).toBeVisible();
  await expect(page.getByText(/Apartamento E2E Persist.ncia/i)).toBeVisible();
});

async function startInspection(page: Page, type: 'entrada' | 'saida' = 'entrada') {
  await page.getByRole('button', { name: /Nova Vistoria/i }).click();
  await expect(page.getByText(/Iniciar Nova Vistoria/i)).toBeVisible();

  if (type === 'saida') {
    await page.getByRole('button', { name: /Vistoria de Sa.da/i }).click();
  }

  await page.getByRole('button', { name: /Come.ar Vistoria/i }).click();
  await expect(page.getByText(type === 'saida' ? /Vistoria de Sa.da/i : /Vistoria de Entrada/i)).toBeVisible();
  await expect(page.getByText(/Registro de Fotos: Sala/i)).toBeVisible();
}

async function addRoom(page: Page, roomName: string) {
  await page.getByPlaceholder(/Novo c.modo/i).fill(roomName);
  await page.getByTitle(/Adicionar c.modo/i).click();
  await expect(page.getByText(roomName)).toBeVisible();
}

async function uploadPhotoToCurrentRoom(page: Page) {
  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: 'e2e-room-photo.png',
    mimeType: 'image/png',
    buffer: onePixelPng,
  });
  await expect(page.getByText(/Sem An.lise de IA/i)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /Confirmar Revis.o/i }).last().click();
  await expect(page.getByText(/Confirmado/i).last()).toBeVisible();
}

async function dumpStore(page: Page) {
  return page.evaluate(() => (window as any).__VF_E2E_DUMP_STORE__?.());
}

test('VF-E2E-001: login mockado, plano gratuito e tela inicial carregam', async ({ page }) => {
  await expect(page.getByText(/Vers.o Beta Limitada a 10 Fotos/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Nova Vistoria/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Hist.rico/i })).toBeVisible();
});

test('VF-E2E-002: Nova Vistoria sempre abre selecao explicita de Entrada/Saida', async ({ page }) => {
  await page.getByRole('button', { name: /Nova Vistoria/i }).click();
  await expect(page.getByText(/Iniciar Nova Vistoria/i)).toBeVisible();
  await expect(page.getByText(/Selecione o tipo de vistoria/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Vistoria de Entrada/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Vistoria de Sa.da/i })).toBeVisible();
});

test('VF-E2E-003: Comecar Vistoria avanca para checklist de comodos', async ({ page }) => {
  await startInspection(page, 'entrada');
  await expect(page.getByRole('button', { name: /^Sala\b/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Quarto 1/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Banheiro/i })).toBeVisible();
});

test('VF-E2E-004: adicionar comodos persiste no backend local', async ({ page }) => {
  await startInspection(page, 'saida');
  await addRoom(page, 'Sala Principal E2E');
  await addRoom(page, 'Quarto QA E2E');

  const store = await dumpStore(page);
  const roomNames = Object.entries(store)
    .filter(([path]) => path.includes('/rooms/'))
    .map(([, data]: any) => data.name);

  expect(roomNames).toContain('Sala Principal E2E');
  expect(roomNames).toContain('Quarto QA E2E');
});

test('VF-E2E-005: sair, voltar pelo historico e continuar rascunho preserva estrutura', async ({ page }) => {
  await startInspection(page, 'saida');
  await addRoom(page, 'Sala Principal E2E');
  await addRoom(page, 'Quarto QA E2E');

  await page.getByLabel(/Voltar para hist.rico/i).click();
  await expect(page.getByText(/Hist.rico de Vistorias/i)).toBeVisible();
  await expect(page.getByText(/Vistoria de Sa.da/i)).toBeVisible();

  await page.getByRole('button', { name: /Continuar Rascunho/i }).click();
  await expect(page.getByText(/Vistoria de Sa.da/i)).toBeVisible();
  await expect(page.getByText('Sala Principal E2E')).toBeVisible();
  await expect(page.getByText('Quarto QA E2E')).toBeVisible();
});

test('VF-E2E-006: Nova Vistoria nao retoma rascunho silenciosamente', async ({ page }) => {
  await startInspection(page, 'entrada');
  await page.getByLabel(/Voltar para hist.rico/i).click();
  await expect(page.getByText(/Hist.rico de Vistorias/i)).toBeVisible();
  await page.getByRole('button', { name: /Voltar para im.veis/i }).click();
  await expect(page.getByText(/Meus Im.veis/i)).toBeVisible();

  await page.getByRole('button', { name: /Nova Vistoria/i }).click();
  await expect(page.getByText(/Iniciar Nova Vistoria/i)).toBeVisible();
  await expect(page.getByText(/Selecione o tipo de vistoria/i)).toBeVisible();
  await expect(page.getByText(/Registro de Fotos/i)).not.toBeVisible();
});

test('VF-E2E-007: fotos por comodo persistem no comodo correto', async ({ page }) => {
  await startInspection(page, 'entrada');
  await uploadPhotoToCurrentRoom(page);

  await page.getByRole('button', { name: /Quarto 1/i }).click();
  await expect(page.getByText(/Registro de Fotos: Quarto 1/i)).toBeVisible();
  await uploadPhotoToCurrentRoom(page);

  const store = await dumpStore(page);
  const photos = Object.entries(store)
    .filter(([path]) => path.includes('/photos/'))
    .map(([, data]: any) => data);

  expect(photos).toEqual(expect.arrayContaining([
    expect.objectContaining({ roomName: 'Sala' }),
    expect.objectContaining({ roomName: 'Quarto 1' }),
  ]));
});

test('VF-E2E-008: concluir e revisar bloqueia vistoria sem foto', async ({ page }) => {
  await startInspection(page, 'entrada');

  let dialogMessage = '';
  const dialogPromise = page.waitForEvent('dialog').then(async dialog => {
    dialogMessage = dialog.message();
    await dialog.accept();
  });
  await page.getByRole('button', { name: /Concluir.*Revisar/i }).click();
  await dialogPromise;

  expect(dialogMessage).toContain('pelo menos uma foto');
  await expect(page.getByText(/Visualizar Relat.rio/i)).not.toBeVisible();
  await expect(page.getByText(/Registro de Fotos: Sala/i)).toBeVisible();
});

test('VF-E2E-009: PDF gera, salva metadados e historico reabre relatorio', async ({ page }) => {
  await startInspection(page, 'entrada');
  await uploadPhotoToCurrentRoom(page);

  await page.getByRole('button', { name: /Concluir.*Revisar/i }).click();
  await expect(page.getByText(/Visualizar Relat.rio/i)).toBeVisible();
  await page.getByRole('button', { name: /Baixar Relat.rio PDF/i }).click();
  await expect(page.getByText(/Relat.rio gerado com sucesso/i)).toBeVisible({ timeout: 20_000 });

  const store = await dumpStore(page);
  expect(Object.entries(store).some(([path]) => path.includes('/reports/'))).toBe(true);
  expect(Object.values(store).some((data: any) => data.status === 'pdf_gerado' && data.pdfUrl)).toBe(true);

  await page.reload();
  await expect(page.getByText(/Meus Im.veis/i)).toBeVisible();
  await page.getByRole('button', { name: /Hist.rico/i }).click();
  await expect(page.getByText(/PDF Dispon.vel/i)).toBeVisible();
  await page.getByRole('button', { name: /Ver PDF/i }).click();
  await expect(page.getByText(/Visualizar Relat.rio/i)).toBeVisible();
});

test('VF-E2E-010: reload real mantem rascunho, comodos e fotos', async ({ page }) => {
  await startInspection(page, 'saida');
  await addRoom(page, 'Deposito E2E');
  await uploadPhotoToCurrentRoom(page);

  await page.reload();
  await expect(page.getByText(/Meus Im.veis/i)).toBeVisible();
  await page.getByRole('button', { name: /Hist.rico/i }).click();
  await expect(page.getByText(/Vistoria de Sa.da/i)).toBeVisible();
  await page.getByRole('button', { name: /Continuar Rascunho/i }).click();
  await expect(page.getByText('Deposito E2E')).toBeVisible();
  await expect(page.getByText(/Confirmado/i).last()).toBeVisible();
});
