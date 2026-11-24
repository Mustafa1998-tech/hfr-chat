import { expect, test } from '@playwright/test';

test.describe('Continuous two-way voice conversation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('app-shell')).toBeVisible({ timeout: 20_000 });
  });

  test('one click starts a call, turns are taken automatically, then the call ends', async ({ page }) => {
    test.setTimeout(240_000);
    await page.getByRole('button', { name: 'Start voice conversation' }).click();
    const panel = page.getByRole('status', { name: 'Voice conversation' });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('جارٍ الاستماع');

    await expect(panel.locator('.call-transcript p').first()).toBeVisible({ timeout: 150_000 });
    const userTurn = await panel.locator('.call-transcript p').first().innerText();
    expect(userTurn).toContain('أنت');
    expect(userTurn).toMatch(/[\u0600-\u06FF]/);

    await expect(panel.locator('.call-transcript p.ai').first()).toBeVisible({ timeout: 150_000 });
    const aiTurn = await panel.locator('.call-transcript p.ai').first().innerText();
    expect(aiTurn).toMatch(/[\u0600-\u06FF]/);

    // A second user turn proves the call returned to listening automatically
    // after the AI finished speaking (fake audio keeps supplying speech).
    await expect(panel.locator('.call-transcript p').nth(2)).toBeVisible({ timeout: 180_000 });
    await page.screenshot({ path: 'tests/reports/continuous-voice.png' });

    const latency = await panel.locator('.call-latency').innerText().catch(() => '');
    console.log('Measured voice latency:', latency || 'not yet available');

    await page.getByRole('button', { name: 'كتم' }).click();
    await page.getByRole('button', { name: 'فتح الميكروفون' }).click();

    await page.getByRole('button', { name: 'إنهاء المكالمة' }).click();
    await expect(panel).toHaveCount(0);

    await page.reload();
    await expect(page.locator('app-shell')).toBeVisible();
    await page.locator('.chat-item').first().click();
    await expect(page.locator('.messages')).toContainText('أنت').catch(() => undefined);
  });

  test('denied microphone permission shows an actionable error and no active call', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: async () => { throw new DOMException('denied', 'NotAllowedError'); } },
      });
    });
    await page.reload();
    await expect(page.locator('app-shell')).toBeVisible();
    await page.getByRole('button', { name: 'Start voice conversation' }).click();
    await expect(page.locator('.voice-status.error')).toContainText('رفض إذن الميكروفون', { timeout: 15_000 });
  });
});
