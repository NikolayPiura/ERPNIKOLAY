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

test('учёт времени позволяет выбрать дату, а удаление категории оставляет в настройках', () => {
  const time = read('piura-erp-restored 3/modules/Time-tracker.html');
  assert.match(time, /<div class="hero-topbar" id="dateNavigation">[\s\S]*?<div class="hero">/);
  assert.match(time, /body>\.hero-topbar\{display:grid!important/);
  assert.match(time, /id="dateJump" type="date"/);
  assert.match(time, /function deleteCategory\(key\)/);
  assert.doesNotMatch(time, /class="card-delete"/);
  assert.match(time, /class="mr-del"/);
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
  assert.match(overview, /time:'https:\/\/script\.google\.com\/macros\/s\//);
  assert.match(overview, /function loadHourlyIncome/);
  assert.match(overview, /function overallHourlyIncome/);
  const dashboard=overview.slice(overview.indexOf('<section class="dashboard">'),overview.indexOf('</section>'));
  const order=['admin-progress','tile morning','fund-goals','tile lamp','tile air','tile income','tile capital'].map(token=>dashboard.indexOf(token));
  assert.ok(order.every((value,index)=>value>=0&&(index===0||value>order[index-1])));
  for (const id of ['psBar','incomeBar','dphBar','capitalBar','pffBar','endowmentBar','subscribersBar']) assert.match(overview,new RegExp(`id="${id}"`));
  for (const id of ['incomeTarget','dphTarget','capitalTarget','pffTarget','endowmentTarget','subscribersTarget']) assert.match(overview,new RegExp(`id="${id}"`));
  assert.match(overview, /\.income,\.dph,\.capital,\.pff,\.endowment,\.subscribers\{grid-column:span 4/);
  assert.match(overview, /<h2>Доход сейчас<\/h2>/);
  assert.match(overview, /resolvedHourly=number\(hourlyValue\)\|\|cachedHourly\|\|/);
  assert.doesNotMatch(dashboard, /class="progress-caption"/);
  assert.doesNotMatch(overview, /Годовая цель|Цель \$500 в час|Близость к идеалу/);
  assert.match(overview, /class="ps-badge">ПС №1/);
});

test('фонды содержат точные цели продукта, фандрайзинга, Endowment и дохода', () => {
  const funds = read('piura-erp-restored 3/modules/Fonds.html');
  assert.match(funds, /Планета без бездомных домашних животных/);
  assert.match(funds, /goalProgress\('Доход',''/);
  assert.doesNotMatch(funds, /goalProgress\('Итого',''/);
  assert.match(funds, /product:'Книги'/);
  assert.match(funds, /fundraising:2250,endowment:50000,income:250,product:1000,total:2500/);
});

test('главная показывает суммарные программы и синхронизирует утро', () => {
  const overview = read('piura-erp-restored 3/modules/Overview.html');
  assert.match(overview, /refreshMorningFromCloud/);
  assert.match(overview, /donePrograms/);
  assert.match(overview, /fallbackCounts=\[24,20,24,11,6,11,1,1\]/);
  assert.match(overview, /id="adminDynamics"/);
  assert.match(read('piura-erp-restored 3/modules/AdminScale.html'), /return\{done,total,dynamics,updatedAt/);
  assert.match(overview, /overview_finance_snapshot_v1/);
  assert.doesNotMatch(overview, /год прошёл/);
  assert.doesNotMatch(overview, /hero-value (?:medium )?skeleton/);
  assert.doesNotMatch(overview, /id="weekTrend"|id="roadmapProgress"|id="workdayValue"/);
});

test('эффективность сразу открывает обзор и оставляет две метрики направления', () => {
  const shell = read('index.html');
  const effectiveness = read('piura-erp-restored 3/modules/EFFECTIVNESS.html');
  assert.match(shell, /switchTab\?\.\(tabMap\[sp\.overview\]\|\|'overview'\)/);
  assert.match(effectiveness, /cycleOverviewPeriod/);
  assert.match(effectiveness, /ov-row-tile[^`]*Время[^`]*ov-row-tile[^`]*Деньги/);
  assert.match(effectiveness, /ov-summary-sub">ДОХОД/);
  assert.doesNotMatch(effectiveness, /ОБЩИЙ ДОХОД В ЧАС/);
  assert.match(effectiveness, /height:13px/);
  assert.match(effectiveness, /piura_effectiveness_overview_v1/);
});

test('Govee принимает обычный API-ключ и сохраняет резервное обнаружение датчика', () => {
  const overview = read('piura-erp-restored 3/modules/Overview.html');
  assert.match(overview, /value\.length>=20/);
  assert.match(overview, /sku:'H5140'/);
  assert.match(overview, /device:'29:9C:DC:B4:D9:F2:F5:00'/);
  assert.match(overview, /discoveredGoveeKey/);
  assert.match(overview, /\.lamp,\.air\{grid-column:span 12/);
  assert.match(overview, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(overview, /climateProfile\('temperature'/);
  assert.match(overview, /climateProfile\('humidity'/);
  assert.match(overview, /climateProfile\('air'/);
  assert.match(overview, /Слишком влажно/);
  assert.match(overview, /Нужно проветрить/);
  assert.match(overview, /function climateNumber\(raw\)/);
  assert.match(overview, /raw==null\|\|raw===''/);
  assert.doesNotMatch(overview, /Number\.isFinite\(Number\(data\?\.\[name\]\)\)/);
  assert.match(read('piura-erp-restored 3/modules/EFFECTIVNESS.html'), /source:'effectiveness'/);
  assert.doesNotMatch(overview, /localStorage\.setItem\(EFFECTIVENESS_SUMMARY_KEY/);
  const shell = read('index.html');
  assert.match(shell, /function saveServicePrefs\(\)/);
  assert.match(shell, /cloud\.lastLocalChangeAt=Date\.now\(\)/);
});

test('главная сокращает большие суммы, а управление фондами остаётся просторным', () => {
  const overview = read('piura-erp-restored 3/modules/Overview.html');
  const funds = read('piura-erp-restored 3/modules/Fonds.html');
  assert.match(overview, /compactMoney=value=>/);
  assert.match(overview, /\+'M'/);
  assert.match(overview, /\+'K'/);
  assert.match(overview, /\.lamp\{min-height:330px;padding:30px 36px\}/);
  assert.match(funds, /#view-manage\{width:100%;max-width:1880px/);
  assert.match(funds, /#view-manage \.fc\{min-height:390px/);
  assert.match(funds, /@media\(max-width:1400px\)\{#view-manage \.fund-row\{grid-template-columns:repeat\(2/);
});

test('утро и учёт времени сохраняются без отдельных кнопок подтверждения', () => {
  const morning = read('piura-erp-restored 3/modules/Morning.html');
  const time = read('piura-erp-restored 3/modules/Time-tracker.html');
  assert.doesNotMatch(morning, /data-confirm=/);
  assert.match(morning, /if\(completed\)state\[bid\]\.confirmed=true/);
  assert.doesNotMatch(time, /<button class="pk-(?:save|clear)"/);
  assert.match(time, /function commitPicker/);
  assert.match(time, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(time, /SELECTED_DATE_KEY = 'tt_selected_date_v1'/);
  assert.match(time, /function persistSelectedDate\(\)/);
  assert.match(time, /limit:20,open:false/);
  assert.match(time, /DIRTY_KEY/);
  assert.doesNotMatch(time, /setTimeout\(\(\)=>syncFromSheets\(true\),900\)/);
  assert.match(time, /function setHistoryOpen/);
  assert.match(morning, /morn_hidden_restore_v2/);
  for (const id of ['b1i2','b1i7','b2i1','b2i5','b2i7','q1','q3','q6','b4r1','b4r2','b4r6']) assert.match(morning,new RegExp(`'${id}'`));
});

test('ПС №1 разделяет недельные и дневные задачи и сохраняет автоматически', () => {
  const weekly = read('piura-erp-restored 3/modules/Dynamics-2.html');
  assert.match(weekly, /id="weeklyTasks"/);
  assert.match(weekly, /id="dailyPanel"/);
  assert.match(weekly, /draggable="\$\{editing\}"/);
  assert.match(weekly, /data-edit-toggle/);
  assert.doesNotMatch(weekly, /баллов за выполнение|баллов в день|•••/);
  assert.doesNotMatch(weekly, /Сохранить неделю|прогресс до максимума/i);
  assert.match(weekly, /function chartSeries\(\)/);
  assert.match(weekly, /nextDate\.setDate\(nextDate\.getDate\(\)\+7\)/);
  assert.match(weekly, /dailyLayoutVersion=2/);
});

test('фонды поддерживают отдельные цели 2026 и 2027 без дублирующих названий', () => {
  const funds = read('piura-erp-restored 3/modules/Fonds.html');
  assert.match(funds, /data-goal-year="2026"/);
  assert.match(funds, /data-goal-year="2027"/);
  assert.match(funds, /all\[year\]=all\[year\]\|\|\{\}/);
  assert.match(funds, /data-goal-path="\$\{path\}"/);
  assert.match(funds, /FOUNDATION_GOALS_KEY/);
  assert.match(funds, /<label>Друг<\/label>/);
  assert.match(funds, /<label>Уборки<\/label>/);
  assert.doesNotMatch(funds, /class="root-total-title">Итого/);
  assert.ok(funds.includes("document.querySelector('[data-tab=\"manage\"]')?.click();"));
  assert.match(funds, /#view-donations>\.portfolio-hero\{display:none/);
  assert.match(funds, /Проведённая уборка или помощь в её проведении/);
  assert.match(funds, /<div class="root-metrics">/);
  assert.match(funds, /id="inclPanel" style="display:none/);
  assert.match(funds, /id="filterPanel" style="display:none/);
  assert.doesNotMatch(funds, /goalProgress\('Итого',''/);
});

test('оболочка сама подхватывает новую опубликованную версию без очистки истории', () => {
  const shell = read('index.html');
  const version = JSON.parse(read('build-version.json')).version;
  assert.match(shell, new RegExp(`const BUILD_ID='${version}'`));
  assert.match(shell, /moduleUrl\.searchParams\.set\('build',BUILD_ID\)/);
  assert.match(shell, /fetch\(`build-version\.json\?t=\$\{Date\.now\(\)\}`/);
  assert.match(shell, /navigator\.serviceWorker\.getRegistrations/);
  assert.match(shell, /caches\.delete/);
  assert.match(shell, /http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate"/);
});

test('кнопка настроек использует ту же высоту, что и остальные пункты меню', () => {
  const shell = read('index.html');
  assert.match(shell, /\.settings-menu-group \.settings-hub-btn\{width:100%;height:auto;min-height:var\(--item-height\)/);
  assert.doesNotMatch(shell, /\.settings-menu-group \.settings-hub-btn\{width:100%;height:68px/);
});

test('цветовые темы применяют выбранную палитру к служебным акцентам', () => {
  const shell=read('index.html');
  assert.match(shell, /success:p\[1\],warning:p\[2\]/);
  assert.match(shell, /info:p\[0\]/);
  assert.doesNotMatch(shell, /prefs\.palette==='mono'/);
  assert.match(shell, /historyOpen:'Скрыта'/);
});

test('светлая тема не оставляет чёрные рамки на админ-шкале и фондах', () => {
  const shell = read('index.html');
  assert.match(shell, /\.browse-mode\{border:1px solid/);
  assert.match(shell, /\.type-card\{border:1px solid/);
  assert.match(shell, /\.item-row:hover,.level-block:hover,.section-dyn-card:hover\{animation:none/);
});
