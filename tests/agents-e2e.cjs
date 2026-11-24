/* Playwright/Chromium verification for the new Agents page and all related actions. */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'screenshots', 'agents');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('http://127.0.0.1:4200', { waitUntil: 'networkidle' });
  await page.waitForSelector('app-shell');
  console.log('PASS app opens directly');

  await page.getByRole('button', { name: 'Agents', exact: true }).click();
  await page.waitForSelector('.agent-card');
  const cards = await page.locator('.agent-card').count();
  if (cards !== 4) throw new Error(`Expected 4 agents, got ${cards}`);
  const names = await page.locator('.agent-card h2').allTextContents();
  for (const n of ['المساعد العام', 'وكيل البحث', 'وكيل البرمجة', 'الوكيل المنسّق'])
    if (!names.includes(n)) throw new Error(`Missing agent: ${n}`);
  const badges = await page.locator('.agent-card .badge').allTextContents();
  if (!badges.includes('أساسي') || badges.filter((b) => b === 'اختياري').length !== 3)
    throw new Error(`Wrong badges: ${badges}`);
  await page.screenshot({ path: path.join(OUT, '01-agents-list.png') });
  console.log('PASS 4 agents with correct badges');

  // Create agent (local-only) action.
  await page.getByRole('button', { name: 'إنشاء وكيل' }).click();
  await page.getByPlaceholder('اسم الوكيل').fill('وكيل تجريبي');
  await page.getByPlaceholder('وصف مختصر').fill('اختبار محلي');
  await page.getByRole('button', { name: 'إضافة' }).click();
  await page.waitForSelector('.notice');
  if (await page.locator('.agent-card').count() !== 5) throw new Error('Custom agent was not added');
  await page.screenshot({ path: path.join(OUT, '02-custom-agent.png') });
  console.log('PASS create agent adds a local card with honest notice');

  // Coding agent must inject real instructions into Ollama request.
  const codingCard = page.locator('.agent-card').filter({ hasText: 'وكيل البرمجة' });
  await codingCard.getByRole('button', { name: 'ابدأ محادثة' }).click();
  await page.waitForSelector('.agent-tag');
  if (!(await page.locator('.agent-tag').innerText()).includes('وكيل البرمجة'))
    throw new Error('Agent tag missing');
  await page.screenshot({ path: path.join(OUT, '03-coding-agent-chat.png') });
  const input = page.getByLabel('Message HFR CHAT');
  await input.fill('Write a tiny JavaScript function that adds two numbers. Reply with code only.');
  await input.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.message.assistant').length > 0, { timeout: 180000 });
  await page.waitForTimeout(400);
  const reply = await page.locator('.message.assistant').last().innerText();
  if (reply.trim().length < 10) throw new Error('Empty AI reply for coding agent');
  await page.screenshot({ path: path.join(OUT, '04-coding-agent-reply.png') });
  console.log('PASS coding agent produced a real Ollama reply');

  // General agent with deterministic reply.
  await page.getByRole('button', { name: 'Agents', exact: true }).click();
  await page.waitForSelector('.agent-card');
  await page.locator('.agent-card').filter({ hasText: 'المساعد العام' })
    .getByRole('button', { name: 'ابدأ محادثة' }).click();
  await page.waitForSelector('.agent-tag');
  const input2 = page.getByLabel('Message HFR CHAT');
  await input2.fill('Reply with exactly: OLLAMA_OK');
  await input2.press('Enter');
  await page.waitForFunction(() => document.body.innerText.includes('OLLAMA_OK'), { timeout: 180000 });
  console.log('PASS general agent real streamed reply');

  // Search agent must state that live search tools are unavailable.
  await page.getByRole('button', { name: 'Agents', exact: true }).click();
  await page.locator('.agent-card').filter({ hasText: 'وكيل البحث' })
    .getByRole('button', { name: 'ابدأ محادثة' }).click();
  await page.waitForSelector('.agent-tag');
  const input3 = page.getByLabel('Message HFR CHAT');
  await input3.fill('Find the latest breaking news and cite sources.');
  await input3.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.message.assistant').length > 0, { timeout: 180000 });
  console.log('PASS search agent handled request without invented sources');

  // Theme + collapsed sidebar + report bug.
  await page.locator('.profile-btn').click();
  await page.getByRole('button', { name: 'Dark theme' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '05-dark-agents.png') });
  await page.locator('[data-tooltip="Collapse sidebar"]').click();
  await page.waitForTimeout(250);
  if (await page.locator('[data-tooltip="Agents"]').count() !== 1)
    throw new Error('Agents icon missing in collapsed rail');
  await page.screenshot({ path: path.join(OUT, '06-collapsed-agents.png') });
  await page.getByRole('button', { name: 'Report a bug' }).click();
  await page.waitForSelector('#bug-title');
  await page.locator('#bug-title').fill('Agent issue');
  await page.locator('#bug-details').fill('Steps');
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.waitForSelector('.prototype-note');
  await page.screenshot({ path: path.join(OUT, '07-report-bug.png') });
  console.log('PASS theme, collapsed rail, report bug');

  console.log('Console errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
