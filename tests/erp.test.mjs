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

test('premium/light темы и сдержанные палитры доступны из полноэкранных настроек', () => {
  const shell = read('index.html');
  assert.match(shell, /Тёмная · Premium/);
  assert.match(shell, /Светлая · Air/);
  assert.match(shell, /class="modal-bg settings-page"/);
  assert.match(shell, /data-palette="\$\{id\}"/);
  assert.doesNotMatch(shell, /body\{filter:grayscale/);
});

test('обзор содержит климат и управление лампой', () => {
  const overview = read('piura-erp-restored 3/modules/Overview.html');
  assert.match(overview, /id="lampPower"/);
  assert.match(overview, /id="lampBrightness"/);
  assert.match(overview, /id="lampColor"/);
  assert.match(overview, /id="lampWheel"/);
  assert.match(overview, /id="lampKelvin"/);
  assert.match(overview, /colorTemperatureK/);
  assert.match(overview, /data-lamp-color/);
  assert.match(overview, /goveeControl/);
  assert.match(overview, /temperature/);
  assert.match(overview, /humidity/);
});

test('учёт времени позволяет выбрать дату и удалить категорию', () => {
  const time = read('piura-erp-restored 3/modules/Time-tracker.html');
  assert.match(time, /id="dateJump" type="date"/);
  assert.match(time, /deleteCategory\('\$\{cat\.key\}'\)/);
  assert.match(time, /function deleteCategory\(key\)/);
});

test('ПС №1 показывает полный архив сохранённых недель', () => {
  const weekly = read('piura-erp-restored 3/modules/Dynamics-2.html');
  assert.match(weekly, /id="weeksArchive"/);
  assert.match(weekly, /function renderWeeksArchive\(\)/);
  assert.match(weekly, /\[\.\.\.S\.history\]/);
});

test('глобальные размеры применяются и к центру настроек', () => {
  const shell = read('index.html');
  assert.match(shell, /--settings-scale/);
  assert.match(shell, /control\.style\.zoom/);
  assert.match(shell, /class="choice-btn/);
});

test('главная объединяет эффективность, время и ПС №1', () => {
  const overview = read('piura-erp-restored 3/modules/Overview.html');
  assert.match(overview, /id="overviewDph"/);
  assert.match(overview, /id="overviewWeekHours"/);
  assert.match(overview, /id="overviewPs"/);
});

test('фонды содержат прогресс целей продукта, фандрайзинга и аудитории', () => {
  const funds = read('piura-erp-restored 3/modules/Fonds.html');
  assert.match(funds, /Цель фандрайзинга/);
  assert.match(funds, /Цель продукта/);
  assert.match(funds, /Цель подписчиков/);
  assert.match(funds, /До Нового года/);
});
