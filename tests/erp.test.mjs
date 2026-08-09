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

test('фонды содержат точные цели продукта, фандрайзинга, Endowment и дохода', () => {
  const funds = read('piura-erp-restored 3/modules/Fonds.html');
  assert.match(funds, /Планета без бездомных домашних животных/);
  assert.match(funds, /Истребуемый доход/);
  assert.match(funds, /Итого денежных целей/);
  assert.match(funds, /fundraising:2250,endowment:50000,income:250,product:1000,total:2500/);
});

test('главная показывает суммарные программы и синхронизирует утро', () => {
  const overview = read('piura-erp-restored 3/modules/Overview.html');
  assert.match(overview, /refreshMorningFromCloud/);
  assert.match(overview, /donePrograms/);
  assert.match(overview, /fallbackCounts=\[24,20,24,11,6,11,1,1\]/);
  assert.match(overview, /overview_finance_snapshot_v1/);
  assert.doesNotMatch(overview, /год прошёл/);
  assert.doesNotMatch(overview, /hero-value (?:medium )?skeleton/);
  assert.doesNotMatch(overview, /id="weekTrend"|id="roadmapProgress"|id="workdayValue"/);
});

test('эффективность сразу открывает обзор и оставляет две метрики направления', () => {
  const shell = read('index.html');
  const effectiveness = read('piura-erp-restored 3/modules/EFFECTIVNESS.html');
  assert.match(shell, /EFFECTIVNESS\.html[^"']*&tab=overview/);
  assert.match(effectiveness, /cycleOverviewPeriod/);
  assert.match(effectiveness, /ov-row-tile[^`]*Время[^`]*ov-row-tile[^`]*Деньги/);
  assert.match(effectiveness, /ОБЩИЙ ДОХОД В ЧАС/);
});

test('утро и учёт времени сохраняются без отдельных кнопок подтверждения', () => {
  const morning = read('piura-erp-restored 3/modules/Morning.html');
  const time = read('piura-erp-restored 3/modules/Time-tracker.html');
  assert.doesNotMatch(morning, /data-confirm=/);
  assert.match(morning, /if\(completed\)state\[bid\]\.confirmed=true/);
  assert.doesNotMatch(time, /<button class="pk-(?:save|clear)"/);
  assert.match(time, /function commitPicker/);
  assert.match(time, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(time, /limit:20,open:false/);
});

test('ПС №1 разделяет недельные и дневные задачи и сохраняет автоматически', () => {
  const weekly = read('piura-erp-restored 3/modules/Dynamics-2.html');
  assert.match(weekly, /id="weeklyTasks"/);
  assert.match(weekly, /id="dailyPanel"/);
  assert.match(weekly, /draggable="\$\{editing\}"/);
  assert.match(weekly, /data-edit-toggle/);
  assert.doesNotMatch(weekly, /баллов за выполнение|баллов в день|•••/);
  assert.doesNotMatch(weekly, /Сохранить неделю|прогресс до максимума/i);
});

test('фонды поддерживают отдельные цели 2026 и 2027 без дублирующих названий', () => {
  const funds = read('piura-erp-restored 3/modules/Fonds.html');
  assert.match(funds, /data-goal-year="2026"/);
  assert.match(funds, /data-goal-year="2027"/);
  assert.match(funds, /all\[year\]=all\[year\]\|\|\{\}/);
  assert.match(funds, /target\[key\]/);
  assert.match(funds, /<label>Друг<\/label>/);
  assert.match(funds, /<label>Уборки<\/label>/);
  assert.match(funds, /class="root-total-title">Итого/);
  assert.match(funds, /Проведённая уборка или помощь в её проведении/);
});

test('светлая тема не оставляет чёрные рамки на админ-шкале и фондах', () => {
  const shell = read('index.html');
  assert.match(shell, /\.browse-mode\{border:1px solid/);
  assert.match(shell, /\.type-card\{border:1px solid/);
  assert.match(shell, /\.item-row:hover,.level-block:hover,.section-dyn-card:hover\{animation:none/);
});
