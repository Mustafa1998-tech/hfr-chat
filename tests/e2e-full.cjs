/* Full-stack Playwright verification with REAL Ollama inference. */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'screenshots', 'ollama');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:4200/';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1936, height: 980 } });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('app-shell', { timeout: 20000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '01-chat-home.png') });
  if (await page.getByText('Sign in').count()) throw new Error('Login screen is still shown');
  console.log('PASS opens directly with no login screen');

  // Real model names from Ollama.
  await page.getByRole('button', { name: /ALLAM|qwen|gemma|deepseek/ }).first().click();
  await page.waitForTimeout(200);
  const optionNames = await page.getByRole('option').allTextContents();
  if (!optionNames.some((n) => /qwen|gemma|deepseek/.test(n))) throw new Error('Ollama models not listed');
  if (optionNames.some((n) => /ALLAM/.test(n))) throw new Error('Invented ALLAM models still listed');
  await page.screenshot({ path: path.join(OUT, '02-model-dropdown.png') });
  await page.getByRole('option', { name: /qwen2.5:3b/ }).click();
  console.log('PASS dynamic model list from Ollama:', optionNames.map((n) => n.split('\n')[0]).join(', '));

  // Real streamed reply.
  const input = page.getByLabel('Message HFR CHAT');
  await input.fill('Reply with exactly: OLLAMA_OK');
  await input.press('Enter');
  await page.waitForSelector('.message.assistant, .message .content', { timeout: 180000 });
  await page.waitForFunction(
    () => document.body.innerText.includes('OLLAMA_OK'),
    { timeout: 180000 },
  );
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '03-real-ollama-reply.png') });
  const reply = await page.locator('.message').last().innerText();
  if (!reply.includes('OLLAMA_OK')) throw new Error(`Unexpected reply: ${reply}`);
  console.log('PASS real Ollama reply rendered in Angular');

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('app-shell');
  await page.locator('.chat-item').first().click();
  await page.waitForTimeout(400);
  const history = await page.locator('.messages').innerText();
  if (!history.includes('OLLAMA_OK')) throw new Error('History not persisted in SQL Server');
  console.log('PASS conversation persisted after reload');

  // Skills toggle still persists.
  await page.getByRole('button', { name: 'Skills', exact: true }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '04-skills.png') });
  const before = await page.getByRole('switch').first().getAttribute('aria-checked');
  await page.getByRole('switch').first().click();
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('app-shell');
  await page.getByRole('button', { name: 'Skills', exact: true }).click();
  const after = await page.getByRole('switch').first().getAttribute('aria-checked');
  if (before === after) throw new Error('Skill toggle did not persist');
  console.log('PASS skill state persisted');

  // Projects + theme + sidebar.
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '05-projects-empty.png') });
  await page.getByRole('button', { name: 'New project' }).click();
  await page.locator('#project-name').fill('Ollama Project');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.waitForSelector('.project-card');
  await page.screenshot({ path: path.join(OUT, '06-project-created.png') });

  await page.locator('.profile-btn').click();
  await page.getByRole('button', { name: 'Dark theme' }).click();
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('app-shell');
  if (await page.evaluate(() => document.documentElement.getAttribute('data-theme')) !== 'dark')
    throw new Error('Theme did not persist');
  await page.screenshot({ path: path.join(OUT, '07-dark.png') });
  await page.locator('[data-tooltip="Collapse sidebar"]').click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '08-collapsed.png') });
  console.log('PASS projects, theme and collapsed sidebar');

  console.log('Console errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
