import { expect, test } from '@playwright/test';
import { api, localToken } from '../fixtures/helpers';

test.describe('Projects', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('app-shell')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Projects', exact: true }).click();
  });

  test('shows empty state when no projects exist', async ({ page }) => {
    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(page.getByText('No projects yet')).toBeVisible();
  });

  test('cancel creation closes modal without a project', async ({ page }) => {
    await page.getByRole('button', { name: 'New project' }).click();
    await expect(page.locator('#project-name')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('#project-name')).toHaveCount(0);
  });

  test('suggestion chip fills the name field', async ({ page }) => {
    await page.getByRole('button', { name: 'New project' }).click();
    await page.getByRole('button', { name: /Trip Planning/ }).click();
    await expect(page.locator('#project-name')).toHaveValue('Trip Planning');
    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  test('creates a project, verifies API + DB + UI persistence, then deletes it', async ({ page, request }) => {
    const token = await localToken(request);
    const name = `QA Project ${Date.now()}`;
    await page.getByRole('button', { name: 'New project' }).click();
    await page.locator('#project-name').fill(name);
    await page.getByRole('button', { name: 'Create project' }).click();
    const card = page.locator('.project-card').filter({ hasText: name });
    await expect(card).toBeVisible();
    const list = await (await api(request, 'GET', '/projects', token)).json();
    const created = list.find((p: any) => p.name === name);
    expect(created, 'project persisted in SQL Server').toBeTruthy();
    await page.reload();
    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    await expect(page.locator('.project-card').filter({ hasText: name })).toBeVisible();
    await page.locator('.project-card').filter({ hasText: name })
      .getByRole('button', { name: 'Delete project' }).click();
    await expect(page.locator('.confirm-popover')).toContainText('Delete project?');
    await page.locator('.confirm-popover').getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('.project-card').filter({ hasText: name })).toHaveCount(0);
    const after = await (await api(request, 'GET', '/projects', token)).json();
    expect(after.some((p: any) => p.id === created.id)).toBeFalsy();
  });

  test('NOT IMPLEMENTED: project edit, instructions, link chat and file UI are absent', async ({ page }) => {
    expect(await page.getByRole('button', { name: /Edit project|Project instructions|Link chat|Upload file/ }).count()).toBe(0);
  });
});
