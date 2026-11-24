/* Visual verification harness — captures each reference screen with Playwright. */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

const URL = 'http://127.0.0.1:4200/';

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1936, height: 980 }, deviceScaleFactor: 1 });
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, '01-chat-home.png') });

  // Model dropdown
  await page.getByRole('button', { name: /ALLAM Qwen Adapted/ }).click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, '04-model-dropdown.png') });
  await page.getByRole('option', { name: /ALLAM Native/ }).click();
  await page.waitForTimeout(100);
  await page.getByRole('button', { name: /ALLAM Native/ }).click();
  await page.getByRole('option', { name: /ALLAM Qwen Adapted/ }).click();
  await page.waitForTimeout(100);

  // Skills
  await page.getByRole('button', { name: 'Skills', exact: true }).click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, '02-skills.png') });

  // Projects empty state
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, '05-projects-empty.png') });

  // Create project modal
  await page.getByRole('button', { name: 'New project' }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '06-create-project-modal.png') });
  await page.getByRole('button', { name: 'Cancel' }).click();

  // Profile menu (light)
  await page.getByRole('button', { name: /Mostafawr H/ }).click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, '07-profile-menu-light.png') });

  // Dark mode
  await page.getByRole('button', { name: 'Dark theme' }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '08-profile-menu-dark.png') });
  await page.locator('.main-surface').click({ position: { x: 600, y: 400 } });
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(OUT, '09-dark-projects.png') });

  // Collapsed sidebar (dark)
  await page.locator('[data-tooltip="Collapse sidebar"]').click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '10-collapsed-dark.png') });

  // Back to light / chat / expanded
  await page.getByRole('button', { name: /Mostafawr H/ }).click().catch(() => {});
  await page.locator('.rail-avatar').click().catch(() => {});
  await page.getByRole('button', { name: 'Light theme' }).click().catch(() => {});
  await page.locator('.main-surface').click({ position: { x: 600, y: 400 } });
  await page.locator('[data-tooltip="Expand sidebar"]').click();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, '11-chat-restored.png') });

  // Responsive snapshots
  for (const [name, width, height] of [
    ['12-laptop-1366', 1366, 768],
    ['13-tablet-768', 768, 1024],
    ['14-mobile-390', 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  }

  console.log('Captured screens in', OUT);
  console.log('Browser errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
