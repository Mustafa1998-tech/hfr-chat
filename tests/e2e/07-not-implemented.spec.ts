import { expect, test } from '@playwright/test';

test.describe('Visible but NOT IMPLEMENTED functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('app-shell')).toBeVisible({ timeout: 20_000 });
  });

  test('profile menu exposes new actions; sign-out is still absent', async ({ page }) => {
    await page.locator('.profile-btn').click();
    const menu = page.getByRole('menu', { name: 'Profile' });
    for (const label of ['Search', 'Settings', 'Take a Tour', 'Help & Support', 'Arabic'])
      await expect(menu.getByRole('menuitem', { name: label })).toBeVisible();
    expect(await menu.getByRole('menuitem', { name: /Sign Out|Logout/ }).count()).toBe(0);
  });

  test('sidebar chat search still has no handler', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Search chats' })).toBeVisible();
  });

  test('deep research is a real configuration-required state, not a fake result', async ({ page, request }) => {
    await page.locator('.deep-research').click();
    const input = page.getByLabel('Message HFR CHAT');
    await input.fill('Find live news');
    await input.press('Enter');
    await expect(page.locator('.notice')).toContainText('Deep Research', { timeout: 120_000 });
    expect(await page.locator('.message.assistant').count()).toBe(0);
  });
});
