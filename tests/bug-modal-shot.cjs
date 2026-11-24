const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://127.0.0.1:4200', { waitUntil: 'networkidle' });
  await page.waitForSelector('app-shell');
  await page.getByRole('button', { name: 'Report a bug' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/report-bug-modal.png' });
  console.log('modal visible:', await page.getByRole('heading', { name: 'Report a bug' }).isVisible());
  console.log('submit disabled initially:', await page.getByRole('button', { name: 'Submit' }).isDisabled());
  await page.locator('#bug-title').fill('Test issue');
  await page.locator('#bug-details').fill('Steps to reproduce');
  console.log('submit enabled after filling:', !(await page.getByRole('button', { name: 'Submit' }).isDisabled()));
  await page.getByRole('button', { name: 'Submit' }).click();
  console.log('prototype note:', await page.locator('.prototype-note').isVisible());
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})();
