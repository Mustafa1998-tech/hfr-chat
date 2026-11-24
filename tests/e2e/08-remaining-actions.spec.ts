import { expect, test } from '@playwright/test';
import { resetEnglish, resetFastModel } from '../fixtures/helpers';

test.describe('Remaining interactive actions', () => {
  test.beforeEach(async ({ page, request }) => {
    await resetEnglish(request);
    await resetFastModel(request);
    await page.goto('/');
    await expect(page.locator('app-shell')).toBeVisible({ timeout: 20_000 });
  });

  test('collapsed rail navigation reaches every page and New chat', async ({ page }) => {
    await page.locator('[data-tooltip="Collapse sidebar"]').click();
    for (const [tip, selector] of [
      ['Skills', 'app-skills-page'],
      ['Projects', 'app-projects-page'],
      ['Agents', 'app-agents-page'],
      ['Chats', 'app-chat-home'],
    ] as const) {
      await page.locator(`[data-tooltip="${tip}"]`).click();
      await expect(page.locator(selector)).toBeVisible();
    }
    await page.locator('[data-tooltip="New chat"]').click();
    await expect(page.locator('app-chat-home')).toBeVisible();
  });

  test('model dropdown closes on outside click', async ({ page }) => {
    await page.locator('.model-trigger').click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.locator('.main-surface').click({ position: { x: 900, y: 200 } });
    await expect(page.getByRole('listbox')).toHaveCount(0);
  });

  test('microphone/send button sends typed text', async ({ page }) => {
    const input = page.getByLabel('Message HFR CHAT');
    await input.fill('Reply with exactly: BUTTON_OK');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.locator('.messages')).toContainText('BUTTON_OK', { timeout: 120_000 });
    await expect(input).toHaveValue('');
  });

  test('all four quick actions fill the composer', async ({ page }) => {
    const input = page.getByLabel('Message HFR CHAT');
    for (const label of ['Write an email', 'Draft a team update', 'Explain simply', 'Create Skill']) {
      await page.getByRole('button', { name: label }).click();
      await expect(input).toHaveValue(label);
    }
  });

  test('create-skill panel close button discards the form', async ({ page }) => {
    await page.getByRole('button', { name: 'Skills', exact: true }).click();
    await page.getByRole('button', { name: 'Create skill' }).click();
    await page.getByPlaceholder('Skill name').fill('discard me');
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByPlaceholder('Skill name')).toHaveCount(0);
  });

  test('project modal closes via Escape, backdrop and X', async ({ page }) => {
    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    await page.getByRole('button', { name: 'New project' }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#project-name')).toHaveCount(0);
    await page.getByRole('button', { name: 'New project' }).click();
    await page.locator('.backdrop').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#project-name')).toHaveCount(0);
    await page.getByRole('button', { name: 'New project' }).click();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('#project-name')).toHaveCount(0);
  });

  test('report bug modal closes via backdrop and X', async ({ page }) => {
    await page.getByRole('button', { name: 'Report a bug' }).click();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('#bug-title')).toHaveCount(0);
    await page.getByRole('button', { name: 'Report a bug' }).click();
    await page.locator('.backdrop').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#bug-title')).toHaveCount(0);
  });

  test('agent create panel close button discards input', async ({ page }) => {
    await page.getByRole('button', { name: 'Agents', exact: true }).click();
    await page.getByRole('button', { name: 'إنشاء وكيل' }).click();
    await page.getByPlaceholder('اسم الوكيل').fill('discard');
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByPlaceholder('اسم الوكيل')).toHaveCount(0);
  });

  test('opening a chat from sidebar and returning home', async ({ page }) => {
    await page.getByRole('button', { name: 'New', exact: true }).click();
    const input = page.getByLabel('Message HFR CHAT');
    await input.fill('Reply with exactly: REOPEN_OK');
    await input.press('Enter');
    await expect(page.locator('.messages')).toContainText('REOPEN_OK', { timeout: 120_000 });
    await page.getByRole('button', { name: /Back to chat home/ }).click();
    await expect(page.locator('app-chat-home')).toBeVisible();
    await page.locator('.chat-item').first().click();
    await expect(page.locator('.messages')).toContainText('REOPEN_OK');
  });
});
