import { expect, test } from '@playwright/test';
import { api, localToken, resetFastModel } from '../fixtures/helpers';

test.describe('Skills', () => {
  test.beforeEach(async ({ page, request }) => {
    await resetFastModel(request);
    await page.goto('/');
    await expect(page.locator('app-shell')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Skills', exact: true }).click();
    await expect(page.locator('app-skill-card').first()).toBeVisible();
  });

  test('lists seeded skills and active count', async ({ page }) => {
    expect(await page.locator('app-skill-card').count()).toBe(5);
    await expect(page.locator('.active-count')).toContainText('active');
  });

  test('search filters skills and shows empty state', async ({ page }) => {
    await page.getByPlaceholder('Search skills...').fill('Canvas');
    await expect(page.locator('app-skill-card')).toHaveCount(1);
    await expect(page.locator('app-skill-card')).toContainText('Canvas Design');
    await page.getByPlaceholder('Search skills...').fill('zzz-not-found');
    await expect(page.getByText('No skills found')).toBeVisible();
  });

  test('enable/disable persists after refresh', async ({ page }) => {
    const sw = page.getByRole('switch').first();
    const before = await sw.getAttribute('aria-checked');
    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', before === 'true' ? 'false' : 'true');
    await page.reload();
    await page.getByRole('button', { name: 'Skills', exact: true }).click();
    await expect(page.getByRole('switch').first()).toHaveAttribute(
      'aria-checked', before === 'true' ? 'false' : 'true');
  });

  test('read more expands and collapses description', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Read more' }).first();
    await btn.click();
    await expect(page.getByRole('button', { name: 'Read less' }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Read less' }).first().click();
    await expect(page.getByRole('button', { name: 'Read more' }).first()).toBeVisible();
  });

  test('creates a custom skill with validation and persists it', async ({ request, page }) => {
    const token = await localToken(request);
    await page.getByRole('button', { name: 'Create skill' }).click();
    await page.getByPlaceholder('Skill name').fill('QA Skill');
    await page.getByPlaceholder('Short description').fill('QA description');
    await page.getByPlaceholder('Instructions used when this skill is active').fill('Be terse.');
    await page.getByRole('button', { name: 'Save skill' }).click();
    await expect(page.locator('app-skill-card').filter({ hasText: 'QA Skill' })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Skills', exact: true }).click();
    await expect(page.locator('app-skill-card').filter({ hasText: 'QA Skill' })).toBeVisible();
    const list = await (await api(request, 'GET', '/skills', token)).json();
    const created = list.find((s: any) => s.name === 'QA Skill');
    expect(created).toBeTruthy();
    await api(request, 'DELETE', `/skills/${created.id}`, token);
  });

  test('enabled skill instructions affect a real Ollama reply', async ({ request, page }) => {
    const token = await localToken(request);
    const created = await (await api(request, 'POST', '/skills', token, {
      name: 'QA Marker Skill',
      description: 'marker test',
      instructions: 'You MUST start every reply with QA_SKILL_ON.',
    })).json();
    await page.reload();
    await page.getByRole('button', { name: 'Skills', exact: true }).click();
    const card = page.locator('app-skill-card').filter({ hasText: 'QA Marker Skill' });
    await expect(card.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: 'New', exact: true }).click();
    const input = page.getByLabel('Message HFR CHAT');
    await input.fill('Say hello.');
    await input.press('Enter');
    await expect(page.locator('.messages')).toContainText('QA_SKILL_ON', { timeout: 120_000 });
    await api(request, 'DELETE', `/skills/${created.id}`, token);
  });

  test('NOT IMPLEMENTED: custom skill edit/delete controls are absent from UI', async ({ page }) => {
    expect(await page.getByRole('button', { name: /Edit skill|Delete skill/ }).count()).toBe(0);
  });
});
