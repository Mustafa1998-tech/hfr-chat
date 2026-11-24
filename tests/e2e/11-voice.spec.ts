import { expect, test } from '@playwright/test';
import { API_BASE, localToken } from '../fixtures/helpers';

test.describe('Voice conversation (real STT → Ollama → TTS)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('app-shell')).toBeVisible({ timeout: 20_000 });
  });

  test('records Arabic speech, shows transcript, gets AI reply and speaks it', async ({ page }) => {
    await page.getByRole('button', { name: 'Microphone' }).click();
    await expect(page.locator('.voice-status')).toContainText('Listening', { timeout: 15_000 });
    await page.waitForTimeout(3000);
    await page.getByRole('button', { name: 'Stop recording' }).click();

    await expect(page.locator('.voice-transcript')).toContainText('صباح الخير', { timeout: 120_000 });
    await expect(page.locator('.message.assistant').first()).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole('button', { name: 'Replay voice reply' })).toBeVisible({ timeout: 120_000 });
    await page.screenshot({ path: 'tests/reports/voice-conversation.png' });

    await page.getByRole('button', { name: 'Cancel voice' }).click();
    await expect(page.locator('.voice-status')).toHaveCount(0);

    await page.reload();
    await expect(page.locator('app-shell')).toBeVisible();
    await page.locator('.chat-item').first().click();
    await expect(page.locator('.messages')).toContainText('صباح الخير', { timeout: 30_000 });
  });

  test('permission denial surfaces an actionable error and releases the mic state', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => {
            throw new DOMException('Permission denied', 'NotAllowedError');
          },
        },
      });
    });
    await page.reload();
    await expect(page.locator('app-shell')).toBeVisible();
    await page.getByRole('button', { name: 'Microphone' }).click();
    await expect(page.locator('.voice-status')).toContainText('Microphone permission denied', { timeout: 15_000 });
    await page.screenshot({ path: 'tests/reports/voice-permission-error.png' });
    await page.getByRole('button', { name: 'Cancel voice' }).click();
    await expect(page.locator('.voice-status')).toHaveCount(0);
  });

  test('backend rejects invalid audio and empty synthesis input', async ({ request }) => {
    const token = await localToken(request);
    const headers = { Authorization: `Bearer ${token}` };
    const response = await request.post(`${API_BASE}/voice/transcribe`, {
      headers,
      multipart: {
        file: { name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('not audio') },
      },
    });
    expect(response.status()).toBe(415);
    const empty = await request.post(`${API_BASE}/voice/synthesize`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { text: '' },
    });
    expect(empty.status()).toBe(400);
  });
});
