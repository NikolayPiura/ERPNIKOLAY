import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function collect(path, result = []) {
  for (const name of readdirSync(path)) {
    if (name === '.git') continue;
    const target = join(path, name);
    statSync(target).isDirectory() ? collect(target, result) : result.push(target);
  }
  return result;
}

test('ERP has one HTML entry and no iframe architecture', () => {
  const files = collect(process.cwd());
  const html = files.filter(file => file.endsWith('.html'));
  assert.deepEqual(html.map(file => file.replace(`${process.cwd()}/`, '')), ['index.html']);
  const source = files.filter(file => /\.(html|js)$/.test(file)).map(file => readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(source, /<iframe\b/i);
  assert.doesNotMatch(source, /Personal-Finance\.html|Finance OS/i);
});
