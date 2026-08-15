import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  detectLocalChanges,
  durableSnapshot,
  hashValue,
  mergeRemoteState,
  shouldSyncKey,
} from '../firebase-sync-core.js';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('единая оболочка содержит все согласованные сервисы', () => {
  const shell = read('index.html');
  for (const label of ['Главная','Эффективность','Утро','Учёт времени','ПС №1','Админ-шкала','Управление','Фонд PFF','Фонд Москва','SAFE','SOLID','Фонды','Друг','Доходы','Личный доход','FP','Инвестиции']) {
    assert.match(shell, new RegExp(label));
  }
  assert.doesNotMatch(shell, /\["mydynamics","Мои динамики"/);
  assert.match(shell, /\["personalpfp","PFF"/);
});

test('Firebase синхронизирует рабочие данные и изолирует каждого пользователя', () => {
  const shell = read('index.html');
  const sync = read('firebase-sync.js');
  const config = read('firebase-config.js');
  const rules = read('firestore.rules');
  assert.match(shell, /firebase-sync\.js/);
  assert.match(shell, /Firebase и Google Drive уже настроены в системе/);
  assert.doesNotMatch(shell, /firebase-connect|firebase-disconnect|Войти через Google/);
  assert.match(sync, /GoogleAuthProvider/);
  assert.match(sync, /browserLocalPersistence/);
  assert.match(sync, /onIdTokenChanged/);
  assert.match(sync, /piura-firebase-token/);
  assert.match(sync, /login_hint: firebaseOwnerEmail/);
  assert.match(sync, /async function automaticSignIn/);
  assert.match(sync, /automaticSignIn\(\)/);
  assert.match(sync, /users', currentUser\.uid, 'erpState/);
  assert.match(sync, /setInterval\(\(\) => scanAndPush/);
  assert.match(config, /projectId: 'erp-design-checklist'/);
  assert.match(config, /firebaseOwnerEmail = 'kol9932@gmail\.com'/);
  assert.doesNotMatch(config, /YOUR_FIREBASE_/);
  assert.match(rules, /request\.auth\.uid == userId/);
  assert.match(rules, /request\.auth\.token\.email == 'kol9932@gmail\.com'/);
  assert.match(rules, /request\.auth\.token\.email_verified == true/);
  assert.match(rules, /allow read, write: if false/);

  const values = new Map([
    ['morning_state', '{"done":true}'],
    ['piura_cache_income', '{"at":1}'],
    ['piura_erp_cloud_v1', '{}'],
  ]);
  const storage = {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
  };
  assert.deepEqual(durableSnapshot(storage), { morning_state: '{"done":true}' });
  assert.equal(shouldSyncKey('piura_cache_income'), false);

  const state = { keys: {}, lastSyncAt: 0 };
  const local = { morning_state: '{"done":true}' };
  detectLocalChanges(local, state, 200, false);
  const merged = mergeRemoteState(local, [{
    key: 'morning_state', value: '{"done":false}', deleted: false, updatedAt: 100,
  }], state, 200);
  assert.deepEqual(merged.apply, [{ key: 'morning_state', value: '{"done":false}', deleted: false }]);
  assert.equal(state.keys.morning_state.hash, hashValue('{"done":false}'));
});

test('личный доход подключает только согласованные листы Google Sheets в режиме чтения', () => {
  const shell = read('index.html');
  const loader = read('piura-erp-restored 3/modules/Personal-Sheets.js');
  const income = read('piura-erp-restored 3/modules/Personal-Income.html');
  const fp = read('piura-erp-restored 3/modules/Personal-FP.html');
  const pfp = read('piura-erp-restored 3/modules/Personal-PFP.html');
  assert.match(shell, /id:'personal-income',title:"Личный доход"/);
  assert.match(shell, /Personal-Income\.html/);
  assert.match(shell, /Personal-FP\.html/);
  assert.match(shell, /Personal-PFP\.html/);
  assert.match(loader, /1GWFyFKRVq1Z4x68gWICBmlilqP5FzYOXXBkC4xYzEbA/);
  for (const sheet of ['2026 (НЕД)','2026 (ФП)','2026 (РАСХОД)','2026 (МЕНТОР)','2026 (СРЕД)','2026 (ПЛАН)','2026 (ФП №1)']) assert.ok(loader.includes(sheet));
  for (const sheet of ['2026 (МЕС)','2026 (ПРИОРИТЕТЫ)','2026 (СОБ. КАП)']) assert.doesNotMatch(loader,new RegExp(sheet.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(loader, /gviz\/tq/);
  assert.match(loader, /1EmXh84m_H_4I--AbL2tRxBoONr6uTg1CxlyQpiSrFlA/);
  for (const sheet of ['2026 (PFF)','2026 (РЫНОК)','2026 (ЗОЛОТО)','2026 (КРИПТА)','2026 (СТАТ)','2026 (ПОДПИСКИ)','2026 (БАЛАНС)']) assert.ok(loader.includes(sheet));
  assert.match(income, /data-tab="income"[^>]*>[\s\S]{0,120}Доход/);
  assert.match(income, /data-tab="mentor"[^>]*>[\s\S]{0,120}Ментор/);
  assert.doesNotMatch(income, /data-tab="average">Средний/);
  assert.doesNotMatch(income, /data-tab="plan">План/);
  for (const control of ['По категориям','По источникам','Понедельно','Помесячно','Факт','План','Абонементы','Премии']) assert.match(income,new RegExp(control));
  assert.doesNotMatch(income, />Квота<|>Доля<|>Средний доход</);
  assert.match(fp, /data-tab="fp"[^>]*>[\s\S]{0,120}Планирование/);
  assert.match(fp, /data-tab="expense"[^>]*>[\s\S]{0,120}Расходы/);
  assert.match(fp, /data-tab="fp1"[^>]*>[\s\S]{0,120}FP №1/);
  for (const metric of ['Остаток','Выделено','Баланс','Расход']) assert.match(fp,new RegExp(metric,'i'));
  assert.doesNotMatch(fp, />\s*Пассивный доход\s*</i);
  assert.match(loader, /data-month="-1"/);
  assert.doesNotMatch(income+fp, /<input|contenteditable|textarea/i);
  for (const view of ['PFF','Рынок','Золото','Крипта','Статистика','Подписки','Баланс']) assert.match(pfp,new RegExp(view));
  assert.doesNotMatch(pfp, /<input|contenteditable|textarea/i);
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

test('главная объединяет эффективность, время и новую недельную ПС №1', () => {
  const overview = read('piura-erp-restored 3/modules/Overview.html');
  assert.match(overview, /id="overviewDph"/);
  assert.match(overview, /id="overviewWeekHours"/);
  assert.match(overview, /id="overviewPs"/);
  assert.match(overview, /time:'https:\/\/script\.google\.com\/macros\/s\//);
  assert.match(overview, /function loadHourlyIncome/);
  assert.match(overview, /function overallHourlyIncome/);
  const dashboard=overview.slice(overview.indexOf('<section class="dashboard">'),overview.indexOf('</section>'));
  const order=['admin-progress','tile ps','fund-goals','tile lamp','tile air','tile income','tile capital'].map(token=>dashboard.indexOf(token));
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

test('управление фондами содержит актуальные продукты и годовые цели Endowment', () => {
  const funds = read('piura-erp-restored 3/modules/Fonds.html');
  assert.match(funds, /Планета без бездомных домашних животных/);
  assert.match(funds, /goalProgress\('Доход',''/);
  assert.doesNotMatch(funds, /goalProgress\('Итого',''/);
  assert.match(funds, /product:'Разданные книги «Дорога к счастью»'/);
  assert.match(funds, /fundraising:2250,endowment:200000,income:1000,product:1000,total:2500/);
  assert.match(funds, /ENDOWMENT_CAPITAL_GOALS=\{2026:\{friend:20000,drugs:1000,scientology:1000,planet:1000,plants:10000\},2027:/);
  assert.match(funds, /monthlyIncomeGoal:capitalGoal\*\.06\/12/);
  assert.doesNotMatch(funds, /<label>Позиций<\/label>|Средний доход \/ позицию|id="endPositions"/);
});

test('главная показывает суммарные программы и текущую неделю без блока утра', () => {
  const overview = read('piura-erp-restored 3/modules/Overview.html');
  assert.doesNotMatch(overview, /refreshMorningFromCloud|Магия утра|tile morning/);
  assert.match(overview, /donePrograms/);
  assert.match(overview, /fallbackCounts=\[24,20,24,11,6,11,1,1\]/);
  assert.match(overview, /id="adminDynamics"/);
  assert.match(overview, /id="overviewWeekChart"/);
  assert.match(overview, /id="overviewPsToday"/);
  assert.match(overview, /id="overviewPsDayRecord"/);
  assert.match(overview, /id="overviewPsWeekRecord"/);
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
  assert.doesNotMatch(effectiveness, /ov-summary-sub">ДОХОД/);
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
  assert.match(overview, /v>50\?'Очень влажно'/);
  assert.match(overview, /\?'Чисто':'Проветрить'/);
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
  assert.match(time, /DIRTY_KEY/);
  assert.match(time, /id="timeEditButton"/);
  assert.match(time, /body>\.hero-topbar \.time-edit-button/);
  const syncStatusBlock = time.match(/<div class="sync-status"[\s\S]*?<\/div>/)?.[0] || '';
  assert.doesNotMatch(syncStatusBlock, /timeEditButton/);
  assert.doesNotMatch(time, /setTimeout\(\(\)=>syncFromSheets\(true\),900\)/);
  assert.doesNotMatch(time, /id="historyCard"|id="histWrap"|function renderHistory|function setHistoryOpen/);
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
  assert.equal(tasks.length,19);
  assert.equal(tasks.reduce((sum,task)=>sum+task.weight,0),1000);
  assert.equal(tasks.find(task=>task.name==='Сессия')?.weight,75);
  assert.equal(tasks.find(task=>task.name==='День без расстройств')?.weight,200);
  assert.equal(tasks.find(task=>task.name==='Описана тэта')?.weight,280);
  assert.equal(tasks.find(task=>task.name==='Kaizen-час')?.weight,20);
  assert.ok(tasks.some(task=>task.name==='Личная гигиена, душ, зубы, витамины'));
  assert.ok(tasks.some(task=>task.name==='Тренировка: теннис / спортзал / разминка / растяжка / 6 000 шагов'));
  assert.ok(tasks.some(task=>task.name==='Обучение (пара, инвестиции, наставничество, заочное или очное)'));
  assert.doesNotMatch(tasksSource, /Привлечены средства в Endowment|Наведён порядок дома/);
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
  assert.match(weekly, /\.task-row\{min-height:57px/);
  assert.match(weekly, /\.task-name\{font-size:14px;font-weight:840/);
  assert.match(weekly, /\.day-check\{width:42px;height:42px/);
  assert.match(weekly, /DAY_WINDOW=14,WEEK_WINDOW=12/);
  assert.match(weekly, /function weeklySeries\(dynamicId=null\)/);
  assert.match(weekly, /length:WEEK_WINDOW/);
  assert.match(weekly, /length:DAY_WINDOW/);
  assert.match(weekly, /function freezeWeek\(anchor\)/);
  assert.match(weekly, /week\.weights/);
  assert.match(weekly, /week\.taskDynamics/);
  assert.match(weekly, /localStorage\.setItem\(STORE,JSON\.stringify\(S\)\)/);
  assert.match(weekly, /function niceScaleMax\(series\)/);
  const scaleSource = weekly.match(/function niceScaleMax\(series\).*?(?=\nfunction chartSmoothPath)/s)?.[0];
  const niceScaleMax = Function('num',`return (${scaleSource.replace('function niceScaleMax','function')})`)(value=>Number(value)||0);
  assert.equal(niceScaleMax([{total:105},{total:35},{total:15},{total:0}]),150);
  assert.equal(niceScaleMax([{total:195}]),200);
  assert.equal((weekly.match(/class="score /g)||[]).length,4);
  assert.match(weekly, /id="dayScore"/);
  assert.match(weekly, /id="dayRecordScore"/);
  assert.match(weekly, /id="weekRecordScore"/);
  assert.match(weekly, /function dayRecord\(\)/);
  assert.match(weekly, /function fullWeekHistory\(\)/);
  assert.doesNotMatch(weekly, /id="maximumScore"|id="completionScore"/);
  assert.doesNotMatch(weekly, /недельного максимума|8 проверочных списков|Каждый пункт отмечается/);
  assert.match(weekly, /DAY_NAMES=\['Чт','Пт','Сб','Вс','Пн','Вт','Ср'\]/);
  assert.match(weekly, /function thursdayFor\(value\).*?date\.getDay\(\)-4\+7/s);
  const calendarSource = weekly.match(/function iso\(date\).*?(?=\nfunction shortDate)/s)?.[0];
  const calendar = Function(`${calendarSource};return{thursdayFor,daysFor,iso}`)();
  assert.equal(calendar.thursdayFor('2026-08-10'),'2026-08-06');
  assert.deepEqual(calendar.daysFor('2026-08-06').map(calendar.iso),['2026-08-06','2026-08-07','2026-08-08','2026-08-09','2026-08-10','2026-08-11','2026-08-12']);
  const toggleSource = weekly.match(/function toggleCheck\(taskId,date\).*?(?=\nfunction shiftIso)/s)?.[0];
  const toggled = Function(`${calendarSource};const num=value=>Number(value)||0;let selectedWeek='2026-08-13',S={tasks:[{id:301,dynamicId:3,w:20}],weeks:{}};function ensureWeek(anchor=selectedWeek){return S.weeks[anchor]||(S.weeks[anchor]={daily:{}})}function freezeWeek(anchor){const week=ensureWeek(anchor);week.weights=week.weights||{};week.taskDynamics=week.taskDynamics||{};S.tasks.forEach(task=>{if(!Number.isFinite(Number(week.weights[task.id])))week.weights[task.id]=num(task.w);if(!Number.isFinite(Number(week.taskDynamics[task.id])))week.taskDynamics[task.id]=num(task.dynamicId)});return week}function persist(){}function render(){}${toggleSource};toggleCheck(301,'2026-08-06');toggleCheck(301,'2026-08-07');return S`)();
  assert.deepEqual(Object.keys(toggled.weeks),['2026-08-06']);
  assert.equal(toggled.weeks['2026-08-06'].daily['2026-08-06']['301'],1);
  assert.equal(toggled.weeks['2026-08-06'].daily['2026-08-07']['301'],1);
  const realignSource = weekly.match(/function weeksNeedRealignment\(\).*?(?=\nfunction migrateTaskCatalog)/s)?.[0];
  const migrated = Function(`${calendarSource};const num=value=>Number(value)||0;let S={weeks:{'2026-08-13':{daily:{'2026-08-06':{'301':1},'2026-08-07':{'301':1}},weights:{301:20},taskDynamics:{301:3}}}};${realignSource};const needed=weeksNeedRealignment();realignWeeksToThursday();return{needed,S}`)();
  assert.equal(migrated.needed,true);
  assert.deepEqual(Object.keys(migrated.S.weeks),['2026-08-06']);
  assert.match(weekly, /function realignWeeksToThursday\(\)/);
  assert.match(weekly, /function weeksNeedRealignment\(\)/);
  assert.match(weekly, /needsWeekMigration\|\|weeksNeedRealignment\(\)/);
  assert.match(weekly, /function toggleCheck\(taskId,date\)\{const anchor=thursdayFor\(date\),week=freezeWeek\(anchor\)/);
  assert.match(weekly, /needsWeekMigration/);
  assert.match(weekly, /--chart-accent/);
  assert.match(weekly, /<path class="chart-line"/);
  assert.doesNotMatch(weekly, /<polyline class="chart-line"/);
  assert.match(weekly, /accent=dynamic\?\.accent\|\|'#8e78ee'/);
  assert.match(weekly, /panel\.style\.setProperty\('--chart-accent',accent\)/);
  assert.match(weekly, /chartSvg\(series,dynamic\?accent:null\)/);
  assert.match(weekly, /id="scoreLine"/);
  assert.match(weekly, /'#35d8f5'/);
  assert.match(weekly, /nextDate\.setDate\(nextDate\.getDate\(\)\+direction\*7\)/);
  assert.match(weekly, /SCHEMA_VERSION=13,DYNAMICS_VERSION=1,TASKS_VERSION=3,WEEK_CYCLE_VERSION=3/);
});

test('управление фондами сохраняет только Управление и Endowment', () => {
  const funds = read('piura-erp-restored 3/modules/Fonds.html');
  assert.match(funds, /data-tab="manage">Управление/);
  assert.match(funds, /data-tab="endowment">Endowment/);
  assert.doesNotMatch(funds, /data-tab="donations">Фонды/);
  assert.match(funds, /initialFundsTab=\['manage','endowment'\]/);
  assert.match(funds, /<div class="root-metrics">/);
  assert.match(funds, /id="inclPanel" style="display:none/);
  assert.match(funds, /id="filterPanel" style="display:none/);
});

test('Фонды и Друг являются отдельными сервисами со своими точными источниками', () => {
  const foundation = read('piura-erp-restored 3/modules/Foundation.html');
  const friend = read('piura-erp-restored 3/modules/Friend.html');
  const shell = read('index.html');
  for (const label of ['Котики','Наркотики','Саентология','Уборки','Растения','Ассоциация добрых дел']) assert.match(foundation,new RegExp(label));
  assert.doesNotMatch(foundation, /name:'Дети'/);
  assert.match(foundation, /data-year="2026"/);
  assert.match(foundation, /data-year="2027"/);
  assert.match(foundation, /activeYear===2026\?fund\.y26:fund\.y27/);
  assert.doesNotMatch(foundation, /фактический продукт/i);
  assert.match(foundation, /Дети, получившие просветительское образование по наркотикам и написавшие отзыв/);
  assert.match(foundation, /product:'Сделанные добрые дела'/);
  assert.match(shell, /\["foundation","Фонды"/);
  assert.match(shell, /\["friend","Друг"/);
  assert.match(friend, /ID='167qHytXogtUN8iWVNhOc149oDR2k_0wqGjmbQOx_Db4'/);
  assert.match(friend, /nameI=find\(\/подписчик\/,1\)/);
  assert.match(friend, /sumI=find\(\/сумм\/,4\)/);
  assert.match(friend, /people\.reduce\(\(sum,person\)=>sum\+person\.base,0\)/);
  assert.match(friend, /class="agents"/);
  assert.match(friend, /id="typeSelect"/);
  assert.match(friend, /id="tierSelect"/);
  assert.doesNotMatch(friend, /Все подписчики|id="peopleRows"/);
});

test('SOLID показывает оба объекта, валюты и графики на одной странице', () => {
  const solid = read('piura-erp-restored 3/modules/Solid.html');
  assert.match(solid, /№1 АКТИВЫ/);
  assert.match(solid, /№2 АКТИВЫ/);
  assert.match(solid, /Townhouse/);
  assert.match(solid, /Квартира в Мытищах/);
  assert.match(solid, /two\.capital\/fx/);
  assert.match(solid, /Ваш капитал/);
  assert.match(solid, /chart\('Платежи','обязательства по кредитному графику'/);
  assert.match(solid, /Следующий платёж/);
  assert.match(solid, /Поступления/);
  assert.doesNotMatch(solid, /data-tab=|Источник:/);
});

test('админ-шкала использует отдельный Docs-мост и включает дорожную карту', () => {
  const admin = read('piura-erp-restored 3/modules/AdminScale.html');
  const bridge = read('piura-erp-restored 3/google-apps-script/AdminScaleSync.gs');
  assert.match(admin, /data-workspace="roadmap"/);
  assert.match(admin, /data-workspace="dynamics"/);
  assert.match(admin, /My-Dynamics\.html\?v=[^'&]+&embed=/);
  const syncFunction = admin.match(/function getSyncSettings\(\)\{[^}]+\}/)?.[0] || '';
  assert.doesNotMatch(syncFunction, /piura_erp_cloud_v1/);
  assert.doesNotMatch(admin, /id="syncUrl"|id="syncToken"/);
  assert.match(admin, /Отдельный адрес, ключ или повторная авторизация не нужны/);
  assert.match(admin, /piura:firebase-token/);
  assert.match(admin, /<div class="topbar-inner">\s*<nav class="workspace-nav"[\s\S]*?<div class="browse-mode"[\s\S]*?<div class="dyn-tabs" id="dynTabs">/);
  assert.match(admin, /document\.body\.dataset\.adminWorkspace=view/);
  assert.match(bridge, /identitytoolkit\.googleapis\.com\/v1\/accounts:lookup/);
  assert.match(bridge, /kol9932@gmail\.com/);
});

test('единый защищённый мост поддерживает Docs, резервные копии и Govee', () => {
  const adminBridge = read('piura-erp-restored 3/google-apps-script/AdminScaleSync.gs');
  const integrationBridge = read('integrations/google-apps-script/PiuraBridge.gs');
  for (const bridge of [adminBridge, integrationBridge]) {
    assert.match(bridge, /action === 'snapshot'/);
    assert.match(bridge, /action === 'backupLoad'/);
    assert.match(bridge, /p\.action === 'backupSave'/);
    assert.match(bridge, /action === 'govee'/);
    assert.match(bridge, /action === 'goveeControl'/);
    assert.match(bridge, /function authorize_\(provided\)/);
    assert.match(bridge, /Firebase sign-in required/);
  }
  assert.equal(adminBridge, integrationBridge);
});

test('динамика эффективности хранит четыре расчётных направления, а время синхронизируется через 30 секунд', () => {
  const effectiveness = read('piura-erp-restored 3/modules/EFFECTIVNESS.html');
  const time = read('piura-erp-restored 3/modules/Time-tracker.html');
  for (const date of ['2026-07-01','2026-07-15','2026-08-01','2026-08-15']) assert.match(effectiveness,new RegExp(date));
  for (const label of ['Инвестиции','Наставничество','Климат','Управление деньгами']) assert.match(effectiveness,new RegExp(label));
  assert.doesNotMatch(effectiveness, /<span>Статус<\/span>|<span>Долларов в час<\/span>/);
  assert.match(effectiveness, /function checkpointDate/);
  assert.doesNotMatch(effectiveness, /id="checkpointChart"/);
  assert.doesNotMatch(effectiveness, /selectComparison|cp-point-meta|cp-change/);
  assert.match(effectiveness, /CHECKPOINT_KEY/);
  assert.match(effectiveness, /function restoreHistoricalCheckpoints/);
  assert.match(effectiveness, /new Date\(2026,6,1,12\)/);
  assert.match(effectiveness, /for\(const day of \[1,15\]\)/);
  assert.match(time, /SHEET_SYNC_DELAY = 30000/);
  assert.match(time, /PENDING_SYNC_KEY/);
  assert.match(time, /latestRevision<=syncRevision/);
  assert.match(time, /if\(synced&&/);
  assert.match(time, /async function verifySheetDate/);
  assert.match(time, /Google Sheets не подтвердил запись/);
});

test('инвестиционный PFF показывает недельные значения без графиков подписок и баланса', () => {
  const pff = read('piura-erp-restored 3/modules/Personal-PFP.html');
  assert.match(pff, /<h1>PFF<\/h1>/);
  assert.match(pff, /Доход месяца/);
  assert.match(pff, /monthControl/);
  assert.match(pff, /ПОНЕДЕЛЬНЫЕ ВЫПЛАТЫ/i);
  assert.match(pff, /weekColumns/);
  assert.match(pff, /weekIndexes/);
  assert.match(pff, /inferredCurrency/);
  assert.match(pff, /balancePerson/);
  const subscriptions = pff.slice(pff.indexOf('function renderSubscriptions'),pff.indexOf('function balanceModel'));
  const balance = pff.slice(pff.indexOf('function renderBalance'),pff.indexOf('function paint'));
  assert.doesNotMatch(subscriptions, /S\.lineChart/);
  assert.doesNotMatch(balance, /S\.lineChart/);
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
  assert.doesNotMatch(shell, /historyOpen|historyDays|История, дней/);
});

test('светлая тема не оставляет чёрные рамки на админ-шкале и фондах', () => {
  const shell = read('index.html');
  assert.match(shell, /\.browse-mode\{border:1px solid/);
  assert.match(shell, /\.type-card\{border:1px solid/);
  assert.match(shell, /\.item-row:hover,.level-block:hover,.section-dyn-card:hover\{animation:none/);
});

test('утро редактируется локально и восстанавливает скрытые пункты без отложенной миграции', () => {
  const morning = read('piura-erp-restored 3/modules/Morning.html');
  assert.match(morning, /id="btnEdit" title="Редактировать"/);
  assert.match(morning, /data-hide-block=/);
  assert.match(morning, /data-show-block=/);
  assert.match(morning, /body\.editing \.additem\{display:flex/);
  assert.match(morning, /let blocksData = restoreHiddenItems\(loadBlocks\(\)\)/);
  assert.match(morning, /localStorage\.setItem\(HIDDEN_RESTORE_KEY,'1'\)/);
  assert.doesNotMatch(morning, /setTimeout\([^)]*HIDDEN_RESTORE_KEY/);
});

test('климат показывает персональные идеалы 70°F и 45%, считая 73°F жарой', () => {
  const overview = read('piura-erp-restored 3/modules/Overview.html');
  assert.match(overview, /const target=70,tolerance=\.5/);
  assert.match(overview, /v>target\?'Жарко':'Прохладно'/);
  assert.match(overview, /v>50\?'Очень влажно'/);
  assert.match(overview, /Идеал 70°F/);
  assert.match(overview, /Идеал 45%/);
  assert.match(overview, /Идеал до 500 ppm/);
  const card = overview.match(/function climateCard\(profile\).*?(?=\nconst CLIMATE_SNAPSHOT_KEY)/s)?.[0] || '';
  assert.doesNotMatch(card, /air-range|air-delta|marker/);
  assert.match(card, /air-status/);
});

test('админ-шкала полностью исключает боевой план из интерфейса и синхронизации', () => {
  const admin = read('piura-erp-restored 3/modules/AdminScale.html');
  const bridge = read('piura-erp-restored 3/google-apps-script/AdminScaleSync.gs');
  assert.match(admin, /<title>Админ-шкала<\/title>/);
  assert.match(admin, /class="logo">Админ-шкала<\/div>/);
  assert.match(admin, /\.logo\{display:none!important\}/);
  assert.doesNotMatch(admin, /Боевой план|BATTLE_PLAN|__battleSync|battleAvailable/);
  assert.doesNotMatch(bridge, /боевой/);
  assert.doesNotMatch(admin, /block-open|function isBlockOpen/);
  assert.match(admin, /\.level-block:not\(\.block-expanded\) \.item-row\.item-overflow\{display:none\}/);
});

test('дорожная карта показывает только 2022–2026 и восстанавливает старые кеши', () => {
  const roadmap = read('piura-erp-restored 3/modules/My-Dynamics.html');
  assert.match(roadmap, /return \[2022,2023,2024,2025,CURRENT_YEAR\]/);
  assert.match(roadmap, /legacyKeys=\['roadmap_cells','roadmapCells','my_dynamics_cells_v1','myDynamicsCells'\]/);
  assert.match(roadmap, /\.\.\.historicalCells\(\),\s*\.\.\.legacy,\s*\.\.\.stored/);
  assert.doesNotMatch(roadmap, /years-toggle-btn/);
  assert.match(roadmap, /nextHead\.textContent='Что сделать дальше'/);
  assert.match(roadmap, /legacyKeys=\['roadmap_nextsteps','roadmapNextSteps','my_dynamics_nextsteps_v1','myDynamicsNextSteps'\]/);
  assert.match(roadmap, /roadmap_nextsteps_history_v1/);
  assert.match(roadmap, /roadmap_nextsteps_restore_20260812_v1/);
  assert.match(roadmap, /const HISTORICAL_NEXTSTEPS_V1 = Object\.freeze\(\{/);
  assert.match(roadmap, /'d1-0':'Купить большие шторы, которые будут автоматически открываться'/);
  assert.match(roadmap, /'d1-12':'Смотреть 1 видео Минаева в неделю, найти видео'/);
  assert.match(roadmap, /nextSteps=\{\.\.\.historical,\.\.\.recovered,\.\.\.legacy,\.\.\.stored\}/);
  assert.match(roadmap, /if\(shouldRestoreHistorical\)localStorage\.setItem\(NEXTSTEPS_RESTORE_KEY,'1'\)/);
  assert.match(roadmap, /history\.slice\(-40\)/);
  assert.match(roadmap, /Object\.keys\(stored\|\|\{\}\)\.length/);
  assert.match(roadmap, /hasStored=Object\.keys\(stored\|\|\{\}\)\.length>0,recovered=hasStored\?\{\}:recoverNextStepsFromLocalCache\(\)/);
  assert.doesNotMatch(read('index.html'), /Показывать скрытые годы/);
});

test('доходы используют один главный тренд и спокойную компактную иерархию', () => {
  const finance = read('piura-erp-restored 3/modules/Finance.html');
  assert.match(finance, /id="incomeTrend" aria-label="Доход по месяцам"/);
  assert.match(finance, /class="sec annual-plan-first"/);
  assert.match(finance, /id="kp">—<\/div>/);
  assert.match(finance, /<div class="kl">Прибыль<\/div>/);
  assert.match(finance, /\.exp-wrap>\.cb:nth-child\(2\)\{display:none!important\}/);
  assert.match(finance, /\.src2 \.cb>div\[style\*="height"\]\{display:none!important\}/);
  assert.match(finance, /1grODwtbQTEmy51OYwFdx4cnKuJXoOxq24vPlwM_XGB4/);
  assert.match(finance, /sheet=%D0%A4%D0%9F/);
  assert.match(finance, /==='РАСХОД'/);
  assert.match(finance, /categories\.sort\(function\(a,b\)\{return b\.total-a\.total;\}\)/);
  assert.match(finance, /\['Климат','Инвестиции','Наставничество','Учредитель','Управление деньгами','Снитч','ПЛАН','ДЕЛЬТА'\]/);
  assert.doesNotMatch(finance, /Детальные источники|Прогноз года/);
  assert.doesNotMatch(finance, /id="pc"/);
});
