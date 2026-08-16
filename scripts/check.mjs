import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { Script } from 'node:vm';

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
const expected = ['Overview','EFFECTIVNESS','Morning','Time-tracker','Dynamics-2','AdminScale','My-Dynamics','Fonds','Foundation'];
const errors = [];

if (indexes.length !== 1 || indexes[0] !== join(root, 'index.html')) errors.push(`Нужен один корневой index.html, найдено: ${indexes.length}`);
for (const name of expected) if (!serviceViews.some(file => basename(file) === `${name}.html`)) errors.push(`Нет сервиса ${name}`);
if (/modules\/(?:PFF|MSK|Safe|Solid|Finance|Personal-Income|Personal-Mentor|Personal-FP|Personal-PFP)\.html/i.test(source)) errors.push('В основной ERP остались маршруты финансовых сервисов');
if (!source.includes('Тёмная · Premium') || !source.includes('Светлая · Air')) errors.push('Нет обеих премиальных тем');
if (!source.includes("goveeControl") || !source.includes('lampPower') || !source.includes('lamp-palette') || !source.includes('data-lamp-color') || !source.includes('controlAllLights') || !source.includes('ELGATO_BRIDGE')) errors.push('Нет единого управления лампами Govee и Elgato');
if (source.includes('body{filter:grayscale')) errors.push('Глобальный монохромный фильтр всё ещё включён');

for (const file of [...indexes, ...serviceViews]) {
  const html = readFileSync(file, 'utf8');
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/.test(match[1])) continue;
    try { new Script(match[2], { filename: file }); }
    catch (error) { errors.push(`Ошибка JavaScript в ${file}: ${error.message}`); }
  }
}

if (errors.length) {
  console.error(errors.map(error => `✗ ${error}`).join('\n'));
  process.exit(1);
}
console.log(`✓ Основная ERP: 1 index, ${expected.length} рабочих экранов, финансовые сервисы вынесены, темы, цели, Govee и Elgato подключены`);
