import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => (window as any).__VF_E2E_RESET_STORE__?.());
  await page.reload();
  await expect(page.getByText('Meus Imóveis')).toBeVisible();
  await expect(page.getByText('Apartamento E2E Persistência')).toBeVisible();
});

test('E2E-001: Nova Vistoria sempre abre seleção explícita de Entrada/Saída', async ({ page }) => {
  await page.getByRole('button', { name: /Nova Vistoria/i }).click();
  await expect(page.getByText('Iniciar Nova Vistoria')).toBeVisible();
  await expect(page.getByText('Selecione o tipo de vistoria:')).toBeVisible();
  await expect(page.getByRole('button', { name: /Vistoria de Entrada/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Vistoria de Saída/i })).toBeVisible();
});

test('E2E-002: começar vistoria de saída, organizar cômodos, sair e retomar rascunho preserva estrutura', async ({ page }) => {
  await page.getByRole('button', { name: /Nova Vistoria/i }).click();
  await expect(page.getByText('Iniciar Nova Vistoria')).toBeVisible();

  await page.getByRole('button', { name: /Vistoria de Saída/i }).click();
  await page.getByRole('button', { name: /Começar Vistoria/i }).click();

  await expect(page.getByText('Vistoria de Saída')).toBeVisible();
  await expect(page.getByText('Registro de Fotos: Sala')).toBeVisible();
  await expect(page.getByText('Quarto 1')).toBeVisible();

  // Adiciona cômodos personalizados que foram o ponto de regressão real.
  await page.getByPlaceholder('Novo cômodo...').fill('Sala Principal E2E');
  await page.getByTitle('Adicionar cômodo').click();
  await expect(page.getByText('Sala Principal E2E')).toBeVisible();

  await page.getByPlaceholder('Novo cômodo...').fill('Quarto QA E2E');
  await page.getByTitle('Adicionar cômodo').click();
  await expect(page.getByText('Quarto QA E2E')).toBeVisible();

  // Sai para histórico; o app precisa salvar e carregar do backend/mock de persistência.
  await page.getByLabel('Voltar para histórico').click();
  await expect(page.getByText('Histórico de Vistorias')).toBeVisible();
  await expect(page.getByText('Vistoria de Saída')).toBeVisible();
  await expect(page.getByRole('button', { name: /Continuar Rascunho/i })).toBeVisible();

  await page.getByRole('button', { name: /Continuar Rascunho/i }).click();
  await expect(page.getByText('Vistoria de Saída')).toBeVisible();
  await expect(page.getByText('Sala Principal E2E')).toBeVisible();
  await expect(page.getByText('Quarto QA E2E')).toBeVisible();

  // Prova adicional: reload real do navegador mantém persistência no storage mock.
  await page.reload();
  await expect(page.getByText('Meus Imóveis')).toBeVisible();
  await page.getByRole('button', { name: /Histórico/i }).click();
  await expect(page.getByText('Vistoria de Saída')).toBeVisible();
  await page.getByRole('button', { name: /Continuar Rascunho/i }).click();
  await expect(page.getByText('Sala Principal E2E')).toBeVisible();
  await expect(page.getByText('Quarto QA E2E')).toBeVisible();
});

test('E2E-003: Nova Vistoria não retoma rascunho silenciosamente depois de já existir rascunho', async ({ page }) => {
  await page.getByRole('button', { name: /Nova Vistoria/i }).click();
  await page.getByRole('button', { name: /Começar Vistoria/i }).click();
  await expect(page.getByText('Vistoria de Entrada')).toBeVisible();
  await page.getByLabel('Voltar para histórico').click();
  await expect(page.getByText('Histórico de Vistorias')).toBeVisible();
  await page.getByRole('button', { name: /Voltar para imóveis/i }).click();
  await expect(page.getByText('Meus Imóveis')).toBeVisible();

  await page.getByRole('button', { name: /Nova Vistoria/i }).click();
  await expect(page.getByText('Iniciar Nova Vistoria')).toBeVisible();
  await expect(page.getByText('Selecione o tipo de vistoria:')).toBeVisible();
});
