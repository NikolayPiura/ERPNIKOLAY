import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('единая оболочка содержит все согласованные сервисы', () => {
  const shell = read('index.html');
  for (const label of ['Главная','Эффективность','Утро','Учёт времени','ПС №1','Админ-шкала','Мои динамики','Структура фондов','Фонд PFF','Фонд Москва','SAFE','Доходы']) {
    assert.match(shell, new RegExp(label));
  }
});

test('Personal Finance удалён из файлов и навигации', () => {
  assert.equal(existsSync(new URL('piura-erp-restored 3/modules/Personal-Finance.html', root)), false);
  assert.doesNotMatch(read('index.html'), /financeos|Finance OS|Personal-Finance/i);
  assert.doesNotMatch(read('piura-erp-restored 3/modules/Overview.html'), /financeos|Finance OS|Personal-Finance/i);
});

test('premium/light темы остаются монохромными', () => {
  const shell = read('index.html');
  assert.match(shell, /Тёмная · Premium/);
  assert.match(shell, /Светлая · Лёгкая/);
  assert.match(shell, /grayscale\(1\) saturate\(0\)/);
});

test('обзор содержит климат и управление лампой', () => {
  const overview = read('piura-erp-restored 3/modules/Overview.html');
  assert.match(overview, /id="lampPower"/);
  assert.match(overview, /id="lampBrightness"/);
  assert.match(overview, /goveeControl/);
  assert.match(overview, /temperature/);
  assert.match(overview, /humidity/);
});
