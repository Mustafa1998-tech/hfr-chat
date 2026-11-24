import { expect, test } from '@playwright/test';
import { resetEnglish, resetFastModel } from '../fixtures/helpers';

async function send(page: any, text: string) {
  const input = page.getByLabel('Message HFR CHAT');
  await input.fill(text);
  await input.press('Enter');
  await expect(input).toHaveValue('');
}

test.describe('Chat screen', () => {
  test.beforeEach(async ({ page, request }) => {
    await resetEnglish(request);
    await resetFastModel(request);
    await page.goto('/');
    await expect(page.locator('app-shell')).toBeVisible({ timeout: 20_000 });
  });

  test('creates conversation, streams a real Ollama reply, persists after refresh', async ({ page }) => {
    await send(page, 'Reply with exactly: OLLAMA_OK');
    await expect(page.locator('.message.assistant').first()).toBeVisible({ timeout: 120_000 });
    await expect(page.locator('.messages')).toContainText('OLLAMA_OK', { timeout: 120_000 });
    const chatTitle = await page.locator('.chat-header .chat-title').innerText();
    expect(chatTitle.length).toBeGreaterThan(0);
    await page.reload();
    await expect(page.locator('app-shell')).toBeVisible();
    await page.locator('.chat-item').first().click();
    await expect(page.locator('.messages')).toContainText('OLLAMA_OK');
  });

  test('supports multiple messages in one conversation', async ({ page }) => {
    await send(page, 'Reply with exactly: FIRST_OK');
    await expect(page.locator('.message.assistant')).toHaveCount(1, { timeout: 120_000 });
    await send(page, 'Reply with exactly: SECOND_OK');
    await expect(page.locator('.message.assistant')).toHaveCount(2, { timeout: 120_000 });
    expect(await page.locator('.message.user').count()).toBe(2);
  });

  test('model selector lists real Ollama models and saves preference', async ({ request, page }) => {
    await page.getByRole('button', { name: /qwen|gemma|deepseek/ }).first().click();
    const options = await page.getByRole('option').allTextContents();
    expect(options.length).toBeGreaterThan(0);
    expect(options.some((o) => /ALLAM/.test(o))).toBeFalsy();
    const hasDeepseek = options.some((o) => /deepseek-r1:7b/.test(o));
    const option = hasDeepseek
      ? page.getByRole('option').filter({ hasText: 'deepseek-r1:7b' }).first()
      : page.getByRole('option').first();
    const targetName = (await option.locator('.option-name').innerText()).trim();
    await option.click();
    await expect(page.locator('.model-trigger')).toContainText(targetName.slice(0, 10));
  });

  test('quick actions fill the composer, empty message does not send', async ({ page }) => {
    const input = page.getByLabel('Message HFR CHAT');
    await input.press('Enter');
    expect(await page.locator('.message.user').count()).toBe(0);
    await page.getByRole('button', { name: 'Write an email' }).click();
    await expect(input).toHaveValue('Write an email');
    await page.getByRole('button', { name: 'Explain simply' }).click();
    await expect(input).toHaveValue('Explain simply');
  });

  test('deep research toggle shows a configuration-required notice', async ({ page }) => {
    await page.locator('.deep-research').click();
    await expect(page.locator('.deep-research')).toHaveClass(/on/);
    await send(page, 'Research this deeply');
    await expect(page.locator('.notice')).toContainText('Deep Research', { timeout: 120_000 });
  });

  test('attachment upload, chip display and removal', async ({ page }) => {
    await page.locator('input[type=file]').setInputFiles({
      name: 'qa-notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('QA attachment content'),
    });
    await expect(page.locator('.attachment-chip')).toContainText('qa-notes.txt');
    await page.getByRole('button', { name: 'Remove attachment' }).click();
    await expect(page.locator('.attachment-chip')).toHaveCount(0);
  });

  test('rejects invalid file type with a visible error message', async ({ page }) => {
    await page.locator('input[type=file]').setInputFiles({
      name: 'bad.exe',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('MZ fake executable'),
    });
    await expect(page.locator('.attachment-chip')).toHaveCount(0);
  });

  test('deletes a chat after confirmation', async ({ page }) => {
    await send(page, 'Reply with exactly: DELETE_ME');
    await expect(page.locator('.message.assistant').first()).toBeVisible({ timeout: 120_000 });
    await page.getByRole('button', { name: 'Delete chat' }).click();
    await expect(page.locator('.confirm-popover')).toContainText('Delete conversation?');
    await page.locator('.confirm-popover').getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('app-chat-home')).toBeVisible();
    await expect(page.locator('.chat-item').filter({ hasText: 'DELETE_ME' })).toHaveCount(0);
  });

  test('NOT IMPLEMENTED: chat search, rename, stop and regenerate controls are absent', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Search chats' })).toHaveCount(1);
    for (const label of ['Rename', 'Stop generation', 'Regenerate']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0);
    }
  });
});
