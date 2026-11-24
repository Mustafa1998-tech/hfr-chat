import { expect, test } from '@playwright/test';

test.describe('Application shell / navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('app-shell')).toBeVisible({ timeout: 20_000 });
  });

  test('boots directly without a login screen', async ({ page }) => {
    await expect(page.getByText('Sign in')).toHaveCount(0);
    await expect(page.getByLabel('Message HFR CHAT')).toBeVisible();
    await expect(page.locator('.chat-item, .chat-empty').first()).toBeVisible();
  });

  test('navigates all four pages and keeps selected state', async ({ page }) => {
    for (const [name, selector] of [
      ['Skills', 'app-skills-page'],
      ['Projects', 'app-projects-page'],
      ['Agents', 'app-agents-page'],
    ] as const) {
      await page.getByRole('button', { name, exact: true }).click();
      await expect(page.locator(selector)).toBeVisible();
      await expect(page.locator('.nav-item.active')).toContainText(name);
    }
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await expect(page.locator('app-chat-home')).toBeVisible();
  });

  test('collapses and expands the sidebar with tooltips', async ({ page }) => {
    await page.locator('[data-tooltip="Collapse sidebar"]').click();
    await expect(page.locator('[data-tooltip="Expand sidebar"]')).toBeVisible();
    await expect(page.locator('.sidebar.collapsed')).toBeVisible();
    await page.locator('[data-tooltip="Expand sidebar"]').hover();
    await expect(page.locator('[data-tooltip="Expand sidebar"]')).toBeVisible();
    await page.locator('[data-tooltip="Expand sidebar"]').click();
    await expect(page.getByText('HFR')).toBeVisible();
  });

  test('opens and closes the profile menu', async ({ page }) => {
    await page.locator('.profile-btn').click();
    await expect(page.getByRole('menu', { name: 'Profile' })).toBeVisible();
    await page.locator('.main-surface').click({ position: { x: 600, y: 300 } });
    await expect(page.getByRole('menu', { name: 'Profile' })).toHaveCount(0);
  });

  test('toggles light/dark theme and persists after refresh', async ({ page }) => {
    await page.locator('.profile-btn').click();
    await page.getByRole('button', { name: 'Dark theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('app-shell')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.locator('.profile-btn').click();
    await page.getByRole('button', { name: 'Light theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('report bug modal: validation, submit notice, escape close', async ({ page }) => {
    await page.getByRole('button', { name: 'Report a bug' }).click();
    const submit = page.getByRole('button', { name: 'Submit' });
    await expect(submit).toBeDisabled();
    await page.locator('#bug-title').fill('QA test');
    await page.locator('#bug-details').fill('Expected vs actual');
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page.locator('.prototype-note')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#bug-title')).toHaveCount(0);
  });

  test('responsive: no horizontal scroll at 1366 / 768 / 390', async ({ page }) => {
    for (const width of [1366, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(150);
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(2);
    }
  });
});
