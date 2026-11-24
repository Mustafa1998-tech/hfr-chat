const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('http://127.0.0.1:4200', { waitUntil: 'networkidle' });
  await page.waitForSelector('app-shell');
  await page.locator('[data-tooltip="Collapse sidebar"]').click();
  await page.waitForTimeout(400);
  const boxes = await page.evaluate(() => {
    const q = (s) => {
      const e = document.querySelector(s);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), font: cs.fontSize };
    };
    return {
      shell: q('.app-shell'),
      sidebarHost: q('app-sidebar'),
      sidebar: q('.sidebar.collapsed'),
      card: q('.main-surface'),
      greet: q('.greeting'),
      composer: q('.composer'),
      label: q('.composer-label'),
    };
  });
  console.log(JSON.stringify(boxes, null, 2));
  console.log('dpr', await page.evaluate(() => window.devicePixelRatio));
  await browser.close();
})();
