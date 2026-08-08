import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const root = process.cwd();
const files = [];
function visit(path) {
  for (const name of readdirSync(path)) {
    if (name === '.git' || name === 'node_modules') continue;
    const target = join(path, name);
    if (statSync(target).isDirectory()) visit(target); else files.push(target);
  }
}
visit(root);

const html = files.filter(file => extname(file) === '.html');
const source = files.filter(file => /\.(html|js|css|md)$/.test(file)).map(file => readFileSync(file, 'utf8')).join('\n');
const errors = [];
if (html.length !== 1 || !html[0].endsWith('/index.html')) errors.push(`Expected one index.html, found ${html.length}`);
if (/<iframe\b/i.test(source)) errors.push('iframe is forbidden in unified ERP');
if (/Personal-Finance\.html|Finance OS|Финансовая картина фонда/i.test(source)) errors.push('Removed Finance OS is still referenced');
if (!source.includes('Premium Dark') || !source.includes('Light')) errors.push('Both visual themes must exist');
if (!source.includes("goveeControl")) errors.push('Govee control adapter is missing');
if (errors.length) {
  console.error(errors.map(error => `✗ ${error}`).join('\n'));
  process.exit(1);
}
console.log(`✓ Unified architecture: ${html.length} index, ${files.length} files, no iframe, Finance OS removed`);
