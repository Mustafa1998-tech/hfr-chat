const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1649, height: 928 } });
  await page.goto('http://127.0.0.1:4200', { waitUntil: 'networkidle' });
  await page.waitForSelector('app-shell');
  const input = page.getByLabel('Message HFR CHAT');
  await input.fill('صباح الخير');
  await input.press('Enter');
  await page.waitForTimeout(2500);
  console.log('messages:', await page.locator('.message .content').allTextContents());
  console.log('translate buttons:', await page.getByRole('button', { name: 'Translate', exact: true }).count());
  await page.getByRole('button', { name: 'Translate', exact: true }).first().click();
  await page.waitForTimeout(300);
  console.log('textarea value:', JSON.stringify(await page.getByLabel('Text to translate').inputValue()));
  await browser.close();
})();
