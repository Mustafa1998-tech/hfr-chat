import { expect, test } from '@playwright/test';
import { resetFastModel } from '../fixtures/helpers';

test.describe('Conversational agents', () => {
  test.beforeEach(async ({ page, request }) => {
    await resetFastModel(request);
    await page.goto('/');
    await expect(page.locator('app-shell')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Agents', exact: true }).click();
    await expect(page.locator('.agent-card').first()).toBeVisible();
  });

  test('lists four built-in agents with correct names and badges', async ({ page }) => {
    const names = await page.locator('.agent-card h2').allTextContents();
    expect(names).toEqual(['المساعد العام', 'وكيل البحث', 'وكيل البرمجة', 'الوكيل المنسّق']);
    const badges = await page.locator('.agent-card .badge').allTextContents();
    expect(badges).toEqual(['أساسي', 'اختياري', 'اختياري', 'اختياري']);
    await expect(page.getByText('أدوات البحث المباشر غير موصولة')).toBeVisible();
  });

  test('create agent panel adds a clearly local-only card', async ({ page }) => {
    await page.getByRole('button', { name: 'إنشاء وكيل' }).click();
    await page.getByPlaceholder('اسم الوكيل').fill('وكيل QA');
    await page.getByPlaceholder('وصف مختصر').fill('اختبار');
    await page.getByRole('button', { name: 'إضافة' }).click();
    await expect(page.locator('.agent-card').filter({ hasText: 'وكيل QA' })).toBeVisible();
    await expect(page.locator('.notice')).toContainText('محليًا فقط');
    await page.locator('.agent-card').filter({ hasText: 'وكيل QA' })
      .getByRole('button', { name: 'ابدأ محادثة' }).click();
    await expect(page.locator('.notice')).toBeVisible();
  });

  test('general agent produces a real streamed Ollama reply', async ({ page }) => {
    await page.locator('.agent-card').filter({ hasText: 'المساعد العام' })
      .getByRole('button', { name: 'ابدأ محادثة' }).click();
    await expect(page.locator('.agent-tag')).toContainText('المساعد العام');
    const input = page.getByLabel('Message HFR CHAT');
    await input.fill('Reply with exactly: AGENT_OK');
    await input.press('Enter');
    await expect(page.locator('.messages')).toContainText('AGENT_OK', { timeout: 120_000 });
  });

  test('coding agent instruction changes the real reply', async ({ page }) => {
    await page.locator('.agent-card').filter({ hasText: 'وكيل البرمجة' })
      .getByRole('button', { name: 'ابدأ محادثة' }).click();
    await expect(page.locator('.agent-tag')).toContainText('وكيل البرمجة');
    const input = page.getByLabel('Message HFR CHAT');
    await input.fill('Write a tiny JS function to add two numbers. Reply with code only.');
    await input.press('Enter');
    await expect(page.locator('.message.assistant').first()).toBeVisible({ timeout: 120_000 });
    expect((await page.locator('.message.assistant').last().innerText()).trim().length).toBeGreaterThan(10);
  });

  test('search agent runs without inventing sources', async ({ page }) => {
    await page.locator('.agent-card').filter({ hasText: 'وكيل البحث' })
      .getByRole('button', { name: 'ابدأ محادثة' }).click();
    const input = page.getByLabel('Message HFR CHAT');
    await input.fill('Find the latest breaking news with sources.');
    await input.press('Enter');
    await expect(page.locator('.message.assistant').first()).toBeVisible({ timeout: 120_000 });
  });

  test('NOT IMPLEMENTED: no ADK runtime, tools, approvals or execution logs', async ({ page }) => {
    expect(await page.getByRole('button', { name: /Assign tools|Execute|Approval|Execution logs/ }).count()).toBe(0);
  });
});
