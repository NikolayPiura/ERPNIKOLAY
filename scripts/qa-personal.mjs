import { mkdir, writeFile } from 'node:fs/promises';

const endpoint = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9222';
const origin = process.env.ERP_ORIGIN || 'http://127.0.0.1:4173';
const screenshotDir = process.env.QA_SCREENSHOT_DIR || '';
const targets = await fetch(`${endpoint}/json/list`).then(response => response.json());
const target = targets.find(item => item.type === 'page');
if (!target) throw new Error('Chrome page target is unavailable');

let sequence = 0;
const pending = new Map();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});
function send(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
  return result.result.value;
}
const wait = delay => new Promise(resolve => setTimeout(resolve, delay));
async function navigate(file) {
  await send('Page.navigate', { url: `${origin}/piura-erp-restored%203/modules/${file}` });
  await wait(5000);
}
async function capture(name) {
  if (!screenshotDir) return;
  await mkdir(screenshotDir, { recursive: true });
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(`${screenshotDir}/${name}.png`, Buffer.from(data, 'base64'));
}
async function snapshot(label) {
  const state = await evaluate(`(() => ({
    title: document.title,
    error: document.querySelector('.ps-error')?.innerText || '',
    loading: Boolean(document.querySelector('.ps-loading')),
    overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth,
    charts: document.querySelectorAll('.ps-chart').length,
    metrics: document.querySelectorAll('.ps-metric').length,
    rows: document.querySelectorAll('tbody tr').length,
    heading: document.querySelector('#content h2, #content h3')?.textContent?.trim() || '',
    text: document.querySelector('#content')?.innerText?.replace(/\\s+/g, ' ').slice(0, 240) || ''
  }))()`);
  const ok = !state.error && !state.loading && state.overflow <= 2;
  console.log(JSON.stringify({ label, ok, ...state }));
  if (!ok) process.exitCode = 1;
}
async function click(selector, label) {
  const found = await evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) return false; node.click(); return true })()`);
  if (!found) {
    console.log(JSON.stringify({ label, ok: false, error: `Control not found: ${selector}` }));
    process.exitCode = 1;
    return;
  }
  await wait(450);
  await snapshot(label);
}

await navigate('Personal-Income.html');
await snapshot('income/default');
for (const [selector, label] of [
  ['[data-control="group"][data-value="source"]', 'income/sources'],
  ['[data-control="period"][data-value="month"]', 'income/monthly'],
  ['[data-control="mode"][data-value="plan"]', 'income/plan'],
  ['[data-control="mode"][data-value="compare"]', 'income/plan-fact'],
  ['[data-control="scope"][data-value="year"]', 'income/year'],
  ['[data-tab="mentor"]', 'income/mentor'],
  ['[data-control="mentorKind"][data-value="bonuses"]', 'income/mentor-bonus'],
  ['[data-control="mentorPeriod"][data-value="month"]', 'income/mentor-month']
]) await click(selector, label);

await navigate('Personal-FP.html');
await snapshot('fp/default');
for (const [selector, label] of [
  ['[data-week="1"]', 'fp/week'],
  ['[data-tab="expense"]', 'fp/expenses'],
  ['[data-control="expenseScope"][data-value="year"]', 'fp/expenses-year'],
  ['[data-tab="fp1"]', 'fp/fp1']
]) await click(selector, label);

await navigate('Personal-PFP.html');
await snapshot('pfp/portfolio');
for (const tab of ['market', 'gold', 'crypto', 'stats', 'subscriptions', 'balance']) {
  await click(`[data-tab="${tab}"]`, `pfp/${tab}`);
}

await evaluate(`(() => {
  localStorage.setItem('piura-erp-shell-compact', '0');
  const key = 'piura_erp_shell_v5';
  const prefs = JSON.parse(localStorage.getItem(key) || '{}');
  prefs.collapsed = false;
  localStorage.setItem(key, JSON.stringify(prefs));
})()`);
await send('Page.navigate', { url: `${origin}/index.html` });
await wait(2200);
for (const service of ['personalincome', 'personalfp', 'personalpfp']) {
  const selected = await evaluate(`(() => {
    const button = document.querySelector('[data-id="${service}"]');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!selected) {
    console.log(JSON.stringify({ label: `shell/${service}`, ok: false, error: 'Navigation item not found' }));
    process.exitCode = 1;
    continue;
  }
  await wait(5200);
  const state = await evaluate(`(() => {
    const frame = document.querySelector('#moduleFrame');
    const doc = frame?.contentDocument;
    return {
      active: document.querySelector('.menu-item.active')?.dataset.id || '',
      sidebar: Math.round(document.querySelector('.sidebar')?.getBoundingClientRect().width || 0),
      stage: Math.round(document.querySelector('.stage')?.getBoundingClientRect().width || 0),
      frameOverflow: doc ? Math.max(doc.documentElement.scrollWidth, doc.body.scrollWidth) - doc.documentElement.clientWidth : 999,
      error: doc?.querySelector('.ps-error')?.innerText || '',
      loading: Boolean(doc?.querySelector('.ps-loading')),
      heading: doc?.querySelector('h1')?.textContent?.trim() || ''
    };
  })()`);
  const ok = state.active === service && !state.error && !state.loading && state.frameOverflow <= 2 && state.sidebar >= 240;
  console.log(JSON.stringify({ label: `shell/${service}`, ok, ...state }));
  if (!ok) process.exitCode = 1;
  await capture(`shell-${service}`);
}
socket.close();
