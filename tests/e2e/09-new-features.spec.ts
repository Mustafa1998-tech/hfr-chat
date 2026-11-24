import { expect, test } from '@playwright/test';
import { resetEnglish, resetFastModel } from '../fixtures/helpers';

test.describe('New overlays, RTL and confirmations', () => {
  test.beforeEach(async ({ page, request }) => {
    await resetEnglish(request);
    await resetFastModel(request);
    await page.goto('/');
    await expect(page.locator('app-shell')).toBeVisible({ timeout: 20_000 });
  });

  test('search conversations modal finds and opens a chat', async ({ page }) => {
    const input = page.getByLabel('Message HFR CHAT');
    await input.fill('Reply with exactly: SEARCH_OK');
    await input.press('Enter');
    await expect(page.locator('.messages')).toContainText('SEARCH_OK', { timeout: 120_000 });
    await page.locator('.profile-btn').click();
    await page.getByRole('menuitem', { name: 'Search' }).click();
    const dialog = page.getByRole('dialog', { name: 'Search' });
    await expect(dialog).toBeVisible();
    await dialog.getByPlaceholder('Search conversations...').fill('SEARCH_OK');
    await expect(dialog.locator('.result').first()).toContainText('SEARCH_OK');
    await dialog.locator('.result').first().click();
    await expect(page.locator('app-chat-home')).toHaveCount(0);
    await expect(page.locator('.messages')).toContainText('SEARCH_OK');
  });

  test('settings modal saves profile and exposes appearance/personalization tabs', async ({ page }) => {
    await page.locator('.profile-btn').click();
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Full Name').fill('QA Renamed');
    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(dialog.locator('.saved')).toBeVisible();
    await dialog.getByRole('button', { name: 'Appearance' }).click();
    await dialog.getByRole('button', { name: 'Dark', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await dialog.getByRole('button', { name: 'Personalization' }).click();
    await dialog.getByRole('button', { name: 'العربية' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('.greeting')).toContainText('صباح الخير');
    await dialog.getByRole('button', { name: 'English' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('help modal routes to report bug and tour', async ({ page }) => {
    await page.locator('.profile-btn').click();
    await page.getByRole('menuitem', { name: 'Help & Support' }).click();
    const help = page.getByRole('dialog', { name: 'Help & Support' });
    await expect(help).toBeVisible();
    await help.getByRole('button', { name: /Contact Support/ }).click();
    await expect(help.locator('.notice')).toContainText('No support channel');
    await help.getByRole('button', { name: /Report a bug/ }).click();
    await expect(page.getByRole('dialog', { name: 'Report a bug' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('.profile-btn').click();
    await page.getByRole('menuitem', { name: 'Take a Tour' }).click();
    await expect(page.locator('.tour-card')).toContainText('Start a Conversation');
    await page.getByRole('button', { name: /Next/ }).click();
    await expect(page.locator('.tour-card')).toContainText('Explore Skills');
    await page.getByRole('button', { name: 'Skip tour' }).click();
    await expect(page.locator('.tour-card')).toHaveCount(0);
  });

  test('delete confirmation can be cancelled', async ({ page }) => {
    const input = page.getByLabel('Message HFR CHAT');
    await input.fill('Reply with exactly: KEEP_OK');
    await input.press('Enter');
    await expect(page.locator('.messages')).toContainText('KEEP_OK', { timeout: 120_000 });
    await page.getByRole('button', { name: 'Delete chat' }).click();
    await page.locator('.confirm-popover').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('.confirm-popover')).toHaveCount(0);
    await expect(page.locator('.messages')).toContainText('KEEP_OK');
  });
});
