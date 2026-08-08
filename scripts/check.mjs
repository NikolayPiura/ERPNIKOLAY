import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const root = process.cwd();
const files = [];
function visit(path) {
  for (const name of readdirSync(path)) {
    if (name === '.git' || name === 'node_modules' || name === '.git-worktree-link') continue;
    const target = join(path, name);
    if (statSync(target).isDirectory()) visit(target); else files.push(target);
  }
}
visit(root);

const indexes = files.filter(file => basename(file) === 'index.html');
const serviceViews = files.filter(file => extname(file) === '.html' && basename(file) !== 'index.html');
const source = files.filter(file => /\.(html|js|css)$/.test(file)).map(file => readFileSync(file, 'utf8')).join('\n');
const expected = ['Overview','EFFECTIVNESS','Morning','Time-tracker','Dynamics-2','AdminScale','My-Dynamics','Finance','Fonds','PFF','MSK','Safe'];
const errors = [];

if (indexes.length !== 1 || indexes[0] !== join(root, 'index.html')) errors.push(`Нужен один корневой index.html, найдено: ${indexes.length}`);
for (const name of expected) if (!serviceViews.some(file => basename(file) === `${name}.html`)) errors.push(`Нет сервиса ${name}`);
if (/Personal-Finance\.html|Finance OS|financeos|Финансовая картина фонда/i.test(source)) errors.push('Удалённый Personal Finance всё ещё упоминается');
if (!source.includes('Тёмная · Premium') || !source.includes('Светлая · Лёгкая')) errors.push('Нет обеих монохромных тем');
if (!source.includes("goveeControl") || !source.includes('lampBrightness') || !source.includes('lampPower')) errors.push('Нет управления лампой Govee');

if (errors.length) {
  console.error(errors.map(error => `✗ ${error}`).join('\n'));
  process.exit(1);
}
console.log(`✓ Одна ERP: 1 index, ${expected.length} сервисов, Personal Finance удалён, темы и Govee подключены`);
