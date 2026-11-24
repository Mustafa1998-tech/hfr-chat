const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('http://127.0.0.1:4200', { waitUntil: 'networkidle' });
  await page.waitForSelector('app-shell');
  await page.locator('[data-tooltip="Collapse sidebar"]').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/scaled-ui.png' });
  console.log(await page.evaluate(() => ({
    zoom: document.documentElement.style.zoom,
    composer: Math.round(document.querySelector('.composer').getBoundingClientRect().width),
    greeting: Math.round(document.querySelector('.greeting').getBoundingClientRect().height),
  })));
  await browser.close();
})();
