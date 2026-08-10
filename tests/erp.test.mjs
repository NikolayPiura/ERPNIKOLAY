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

test('обзор содержит климат и единое управление Govee и двумя Elgato', () => {
  const overview = read('piura-erp-restored 3/modules/Overview.html');
  assert.match(overview, /id="lampPower"/);
  assert.match(overview, /class="lamp-palette"/);
  assert.match(overview, /data-lamp-color/);
  for (const color of ['Красный','Зелёный','Синий','Жёлтый','Белый']) assert.match(overview,new RegExp(`>${color}<`));
  assert.match(overview, /goveeControl/);
  assert.match(overview, /ELGATO_BRIDGE='http:\/\/127\.0\.0\.1:45831'/);
  assert.match(overview, /function controlAllLights\(command,value\)/);
  assert.match(overview, /elgatoLightCount/);
  assert.match(overview, /temperature/);
  assert.match(overview, /humidity/);
  assert.doesNotMatch(overview, /id="lampBrightness"|id="lampColor"|id="lampWheel"|id="lampKelvin"/);

  const bridge = read('integrations/elgato-local-bridge/server.py');
  assert.match(bridge, /elgato-light-strip-pro-d026\.local/);
  assert.match(bridge, /elgato-light-strip-pro-8c54\.local/);
  assert.match(bridge, /Access-Control-Allow-Private-Network/);
  assert.match(bridge, /"\/lights"/);
});

test('учёт времени переключает дни без календаря, а удаление категории оставляет в настройках', () => {
  const time = read('piura-erp-restored 3/modules/Time-tracker.html');
  assert.match(time, /<div class="hero-topbar" id="dateNavigation">[\s\S]*?<div class="hero">/);
  assert.match(time, /body>\.hero-topbar\{display:grid!important/);
  assert.match(time, /id="prevDay"/);
  assert.match(time, /id="nextDay"/);
  assert.match(time, /id="todayDay"/);
  assert.doesNotMatch(time, /id="dateJump" type="date"/);
  assert.match(time, /function deleteCategory\(key\)/);
  assert.doesNotMatch(time, /class="card-delete"/);
  assert.match(time, /class="mr-del"/);
});

test('ПС №1 сохраняет старые данные при миграции, но не показывает старую шкалу', () => {
  const weekly = read('piura-erp-restored 3/modules/Dynamics-2.html');
  assert.match(weekly, /legacyHistory/);
  assert.match(weekly, /legacyBackup/);
  assert.match(weekly, /function extractLegacy\(saved\)/);
  assert.doesNotMatch(weekly, /id="weeksArchive"/);
  assert.doesNotMatch(weekly, /Старая шкала/);
  assert.equal((weekly.match(/\['2026-\d{2}-\d{2}',\d+\]/g)||[]).length,12);
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
  assert.match(overview, /<h2>Доход в час<\/h2>/);
  assert.match(overview, /resolvedHourly=number\(hourlyValue\)\|\|cachedHourly\|\|/);
  assert.doesNotMatch(dashboard, /class="progress-caption"/);
  assert.doesNotMatch(overview, /Годовая цель|Цель \$500 в час|Близость к идеалу/);
  assert.doesNotMatch(overview, /class="ps-badge">ПС №1/);
  assert.doesNotMatch(overview, /Сегодня можно начать в любой момент/);
  assert.doesNotMatch(overview, /id="lampLabel"|id="lampStatus"/);
});

test('фонды содержат точные цели продукта, фандрайзинга, Endowment и дохода', () => {
  const funds = read('piura-erp-restored 3/modules/Fonds.html');
  assert.match(funds, /Планета без бездомных домашних животных/);
  assert.match(funds, /goalProgress\('Доход',''/);
  assert.doesNotMatch(funds, /goalProgress\('Итого',''/);
  assert.match(funds, /product:'Раздано книг'/);
  assert.match(funds, /fundraising:2250,endowment:50000,income:250,product:1000,total:2500/);
  assert.match(funds, /пять фондов · общая цель капитала \$1 млн · цель доходности 12%/);
  assert.match(funds, /Цель каждого фонда<\/label><strong>\$200 тыс\.<\/strong>/);
  assert.doesNotMatch(funds, /<label>Позиций<\/label>|Средний доход \/ позицию|id="endPositions"/);
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
  assert.doesNotMatch(overview, /Что делать|норма 68/);
  assert.match(overview, /function climateNumber\(raw\)/);
  assert.match(overview, /raw==null\|\|raw===''/);
  assert.doesNotMatch(overview, /Number\.isFinite\(Number\(data\?\.\[name\]\)\)/);
  assert.match(overview, /Promise\.allSettled\(\[directState\(sensor\)/);
  assert.match(overview, /CLIMATE_SNAPSHOT_KEY='overview_govee_climate_v1'/);
  assert.doesNotMatch(overview, /temperature==null&&humidity==null\)throw/);
  assert.match(overview, /renderClimate\(readings\);renderLamp\(data\)/);
  assert.match(read('piura-erp-restored 3/modules/EFFECTIVNESS.html'), /source:'effectiveness'/);
  assert.doesNotMatch(overview, /localStorage\.setItem\(EFFECTIVENESS_SUMMARY_KEY/);
  const shell = read('index.html');
  assert.match(shell, /function saveServicePrefs\(\)/);
  assert.match(shell, /cloud\.lastLocalChangeAt=Date\.now\(\)/);
});

test('главный экран использует согласованные названия и спокойную типографику', () => {
  const overview = read('piura-erp-restored 3/modules/Overview.html');
  assert.match(overview, /'МЕСТ'/);
  assert.doesNotMatch(overview, /'MEST'/);
  assert.match(overview, /\.ps \.hero-value\{font-size:clamp\(64px,6\.6vw,96px\)/);
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
  assert.match(time, /limit:20,open:true/);
  assert.match(time, /DIRTY_KEY/);
  assert.doesNotMatch(time, /setTimeout\(\(\)=>syncFromSheets\(true\),900\)/);
  assert.match(time, /function setHistoryOpen/);
  assert.match(morning, /morn_hidden_restore_v2/);
  for (const id of ['b1i2','b1i7','b2i1','b2i5','b2i7','q1','q3','q6','b4r1','b4r2','b4r6']) assert.match(morning,new RegExp(`'${id}'`));
});

test('ПС №1 использует один дневной или недельный график для общей шкалы и восьми динамик', () => {
  const weekly = read('piura-erp-restored 3/modules/Dynamics-2.html');
  const dynamicsSource = weekly.match(/const DYNAMICS=\[(.*?)\];/s)?.[1]||'';
  const tasksSource = weekly.match(/const DEFAULT_TASKS=\[(.*?)\n\]\.map/s)?.[1]||'';
  const dynamics = [...dynamicsSource.matchAll(/\{id:(\d+),name:'([^']+)'/g)];
  const tasks = [...tasksSource.matchAll(/\[(\d+),(\d+),'([^']+)',(\d+)\]/g)].map(match=>({id:Number(match[1]),dynamic:Number(match[2]),name:match[3],weight:Number(match[4])}));
  assert.equal(dynamics.length,8);
  assert.deepEqual(dynamics.map(match=>match[2]),['Я','Семья','Группа','Человечество','Жизнь','Вселенная','Духовное','Бесконечность']);
  assert.equal(tasks.length,21);
  assert.equal(tasks.reduce((sum,task)=>sum+task.weight,0),900);
  assert.equal(tasks.find(task=>task.name==='Сессия')?.weight,75);
  assert.equal(tasks.find(task=>task.name==='День без расстройств')?.weight,140);
  assert.equal(tasks.find(task=>task.name==='Описана тэта')?.weight,180);
  assert.equal((weekly.match(/id="scoreChart"/g)||[]).length,1);
  assert.doesNotMatch(weekly, /id="dynamicOverview"/);
  assert.match(weekly, /id="dynamicChecklists"/);
  assert.match(weekly, /id="chartModes"/);
  assert.match(weekly, /data-chart-mode="daily"/);
  assert.match(weekly, /data-chart-mode="weekly"/);
  assert.match(weekly, /function dailySeries\(dynamicId=null\)/);
  assert.match(weekly, /function selectDynamic\(id\)/);
  assert.match(weekly, /data-select-dynamic=/);
  assert.match(weekly, /selectedDynamicId!=null\)selectDynamic\(null\)/);
  assert.match(weekly, /function renderChecklists\(\)/);
  assert.match(weekly, /data-edit-toggle/);
  assert.match(weekly, /id="taskDynamic"/);
  assert.match(weekly, /id="taskWeight" type="number" min="1" step="1"/);
  assert.match(weekly, /task\.w=w/);
  assert.match(weekly, /\.task-row\{min-height:84px/);
  assert.match(weekly, /\.task-name\{min-width:0;font-size:17px/);
  assert.doesNotMatch(weekly, /недельного максимума|8 проверочных списков|Каждый пункт отмечается/);
  assert.match(weekly, /DAY_NAMES=\['Пн','Вт','Ср','Чт','Пт','Сб','Вс'\]/);
  assert.match(weekly, /nextDate\.setDate\(nextDate\.getDate\(\)\+direction\*7\)/);
  assert.match(weekly, /SCHEMA_VERSION=10,DYNAMICS_VERSION=1/);
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
  for (const product of ['Спасённые котики','Спасённые люди','Раздано книг','Проведено уборок','Посажено деревьев']) assert.match(funds,new RegExp(product));
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
  assert.match(shell, /historyOpen:'Раскрыта'/);
});

test('светлая тема не оставляет чёрные рамки на админ-шкале и фондах', () => {
  const shell = read('index.html');
  assert.match(shell, /\.browse-mode\{border:1px solid/);
  assert.match(shell, /\.type-card\{border:1px solid/);
  assert.match(shell, /\.item-row:hover,.level-block:hover,.section-dyn-card:hover\{animation:none/);
});
