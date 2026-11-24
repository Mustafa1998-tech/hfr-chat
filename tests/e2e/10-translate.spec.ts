import { expect, test } from '@playwright/test';
import { resetEnglish } from '../fixtures/helpers';

test.describe('Arabic ↔ English translation', () => {
  test.beforeEach(async ({ page, request }) => {
    await resetEnglish(request);
    await page.goto('/');
    await expect(page.locator('app-shell')).toBeVisible({ timeout: 20_000 });
  });

  test('translates English to Arabic and back with real Ollama output', async ({ page }) => {
    await page.locator('.profile-btn').click();
    await page.getByRole('menuitem', { name: 'Translate' }).click();
    const modal = page.getByRole('dialog', { name: 'Translate' });
    await expect(modal).toBeVisible();
    await modal.getByLabel('Text to translate').fill('Good morning, how are you?');
    await expect(modal.getByLabel('From language')).toHaveValue('en');
    await expect(modal.getByLabel('To language')).toHaveValue('ar');
    await modal.getByRole('button', { name: 'Translate', exact: true }).click();
    await expect(modal.locator('.result p')).toHaveText(/[\u0600-\u06FF]/, { timeout: 120_000 });
    await expect(modal.locator('.result')).toHaveAttribute('dir', 'rtl');
    const arabic = await modal.locator('.result p').innerText();

    await modal.getByRole('button', { name: 'Swap languages' }).click();
    await modal.getByLabel('Text to translate').fill(arabic);
    await expect(modal.getByLabel('From language')).toHaveValue('ar');
    await expect(modal.getByLabel('To language')).toHaveValue('en');
    await modal.getByRole('button', { name: 'Translate', exact: true }).click();
    await expect(modal.locator('.result p')).toContainText('morning', { timeout: 120_000 });
    await expect(modal.locator('.result')).toHaveAttribute('dir', 'ltr');
  });

  test('auto-detects Arabic input and opens from the chat header', async ({ page }) => {
    const input = page.getByLabel('Message HFR CHAT');
    await input.fill('صباح الخير');
    await input.press('Enter');
    await expect(page.locator('.messages')).toContainText('صباح الخير', { timeout: 120_000 });
    await page.getByRole('button', { name: 'Translate', exact: true }).first().click();
    const modal = page.getByRole('dialog', { name: 'Translate' });
    await expect(modal).toBeVisible();
    await expect(modal.getByLabel('Text to translate')).toHaveValue(/صباح الخير/);
    await expect(modal.getByLabel('From language')).toHaveValue('ar');
    await expect(modal.getByLabel('To language')).toHaveValue('en');
    await modal.getByLabel('Text to translate').fill('مرحبا بالعالم');
    await modal.getByRole('button', { name: 'Translate', exact: true }).click();
    await expect(modal.locator('.result p')).not.toBeEmpty({ timeout: 120_000 });
  });
});
