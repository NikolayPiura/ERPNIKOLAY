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
  for (const label of ['Главная','Эффективность','Утро','Учёт времени','ПС №1','Админ-шкала','Управление','Фонды']) {
    assert.match(shell, new RegExp(label));
  }
  assert.doesNotMatch(shell, /\["mydynamics","Мои динамики"/);
  assert.doesNotMatch(shell, /Personal-(?:Income|Mentor|FP|PFP)\.html|modules\/(?:PFF|MSK|Safe|Solid|Finance)\.html/);
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

test('финансовые сервисы полностью вынесены из основной ERP', () => {
  const shell=read('index.html');
  for(const name of ['PFF','MSK','Safe','Solid','Finance','Personal-Income','Personal-Mentor','Personal-FP','Personal-PFP'])assert.equal(existsSync(new URL(`piura-erp-restored 3/modules/${name}.html`,root)),false);
  assert.equal(existsSync(new URL('piura-erp-restored 3/modules/Personal-Sheets.js',root)),false);
  assert.equal(existsSync(new URL('piura-erp-restored 3/modules/Personal-Sheets.css',root)),false);
  assert.doesNotMatch(shell,/Фонд PFF|Фонд Москва|SAFE|SOLID|Личный доход|Доходы|Personal-(?:Income|Mentor|FP|PFP)/);
});

test('premium/light темы и сдержанные палитры доступны из полноэкранных настроек', () => {
  const shell = read('index.html');
  assert.match(shell, /Тёмная · Premium/);
  assert.match(shell, /Светлая · Air/);
  assert.match(shell, /class="modal-bg settings-page"/);
  assert.match(shell, /data-palette="\$\{id\}"/);
  assert.doesNotMatch(shell, /body\{filter:grayscale/);
});

test('обзор управляет вентилятором, очистителем, кондиционером, четырьмя зонами и общим светом', () => {
  const overview = read('piura-erp-restored 3/modules/Overview.html');
  const bridge = read('integrations/elgato-local-bridge/server.py');
  assert.match(overview, /id="lampPower"/);
  assert.match(overview, /class="lamp-palette"/);
  assert.match(overview, /id="lampColorWheel"/);
  assert.match(overview, /function pickLampWheel/);
  assert.match(overview, /setPointerCapture/);
  assert.match(overview, /name:'Ассоциация'/);
  assert.match(overview, /name:'Котики'.*?target:400/);
  assert.match(overview, /name:'Ассоциация'.*?target:60/);
  assert.match(overview, /fan-card>\.device-section-head,.control-grid \.minimal-lamp>\.device-section-head\{display:none!important\}/);
  assert.match(overview, /minimal-lamp \.master-toggle\{display:none!important\}/);
  assert.match(overview, /goveeControl/);
  assert.match(overview, /ELGATO_BRIDGE='http:\/\/127\.0\.0\.1:45831'/);
  assert.match(overview, /function controlAllLights\(command,value\)/);
  assert.match(overview, /elgatoLightCount/);
  assert.match(overview, /id="lampBrightness"/);
  assert.doesNotMatch(overview, /data-lamp-scene/);
  assert.match(overview, /id="fanToggle"/);
  assert.match(overview, /id="fanRotor"/);
  assert.doesNotMatch(overview, /id="fanAction"|>Включить<|>Выключить</);
  assert.match(overview, /id="purifierCard"/);
  assert.match(overview, /id="purifierPower"/);
  assert.doesNotMatch(overview, /id="purifierFilter"|id="purifierFilterRing"/);
  for (const mode of ['1','2','3']) assert.match(overview, new RegExp(`data-purifier-mode="${mode}"`));
  assert.match(overview, /requestElgato\('\/smart-home\/status\?devices=purifier'\)/);
  assert.match(overview, /const speed=\{1:33,2:66,3:100\}\[mode\]/);
  assert.doesNotMatch(overview, /192\.168\.4\.39|Levoit/);
  assert.doesNotMatch(overview, /<span class="device-kicker">Розетка/);
  assert.doesNotMatch(overview, /id="fanStatus"|id="fanHint"|id="zoneSummary"|id="mapSyncStatus"|TY-02-3CH\.V5\.1<\/span>/);
  assert.match(overview, /SMART_LIFE_BRIDGE='http:\/\/127\.0\.0\.1:8765'/);
  assert.match(overview, /requestSmartLife\('\/api\/status'\)/);
  assert.match(overview, /requestSmartLife\('\/api\/power'/);
  assert.match(overview, /requestSmartLife\('\/api\/map\/status'\)/);
  assert.match(overview, /requestSmartLife\('\/api\/map\/power'/);
  assert.match(overview, /requestSmartLife\('\/api\/map\/color'/);
  assert.match(overview, /const ZONE_DEVICE_CATALOG=\[\{id:'1',name:'Основное'\},\{id:'3',name:'Карта'\},\{id:'2',name:'Шкаф'\},\{id:'5',name:'Голова'\}\]/);
  for (const id of ['1','2','3','5']) assert.match(overview, new RegExp(`data-zone-device="${id}"`));
  assert.doesNotMatch(overview, /data-strip-index|zone-strip|stripDeviceState|rawStrip/);
  assert.match(overview, /id="zoneAllToggle"/);
  assert.doesNotMatch(overview, /data-zone-device="[1235]"[^>]*disabled/);
  assert.doesNotMatch(overview, /id="zoneAllToggle"[^>]*disabled/);
  assert.match(overview, /button\.disabled=everythingBusy\|\|zoneAllBusy\|\|Boolean\(next\.busy\)/);
  assert.doesNotMatch(overview, /if\(!device\?\.online/);
  assert.match(overview, /catch\(error\)\{renderZoneDevices\(\);console\.warn\('Четыре зоны'/);
  assert.match(overview, /ZONE_STATE_KEY='overview_zone_state_v1'/);
  assert.match(overview, /if\(incoming\.length\)rememberZonePower\(\)/);
  assert.match(overview, /function controllableZoneDevices\(\)/);
  assert.match(overview, /function setAllZonePower\(power\)/);
  assert.match(overview, /function toggleAllZones\(\)/);
  assert.match(overview, /requestElgato\('\/smart-home\/status\?devices=1,2,3,5'\)/);
  assert.match(overview, /requestElgato\('\/smart-home',\{method:'POST'/);
  assert.doesNotMatch(overview, /requestElgato\('\/smart-home\/status'\)/);
  assert.doesNotMatch(overview, /SMART_HOME_CATALOG|AUX_DEVICE_CATALOG|data-aux-device/);
  assert.match(bridge, /def smart_home_status\(device_ids: set\[str\] \| None = None\)/);
  assert.match(bridge, /parse_qs\(request\.query\)\.get\("devices", \[\]\)/);
  assert.match(bridge, /pending = \[\] if device_ids is not None else/);
  assert.match(bridge, /PURIFIER = \("purifier", "Очиститель", "192\.168\.4\.39", "Levoit"\)/);
  assert.match(bridge, /if percentage not in \{33, 66, 100\}/);
  assert.match(overview, /fan-card\.is-on \.fan-blades\{animation:fanSpin/);
  assert.match(overview, /id="masterPower"/);
  assert.match(overview, /master-toggle\[hidden\]\{display:none!important\}/);
  assert.match(overview, /\.control-grid>\.fan-card,\.control-grid>\.purifier-card,\.control-grid>\.hvac-card\{grid-column:span 4!important/);
  assert.doesNotMatch(overview, /class="hvac-(?:display|led|sensor-dot)"/);
  assert.match(overview, /function toggleEverything\(\)/);
  assert.match(overview, /function anythingIsOn\(\)/);
  assert.match(overview, /const target=!anythingIsOn\(\)/);
  assert.match(overview, /jobs\.push\(\{source:'map',promise:controlMap\(command,value\)\}\)/);
  assert.match(overview, /lampOn=goveeLampOn\|\|elgatoLampOn\|\|mapLightOn/);
  assert.match(overview, /function queueBrightness\(value,immediate=false\)/);
  assert.match(overview, /setTimeout\(flushBrightness,immediate\?0:100\)/);
  assert.match(overview, /id="hvacCard"/);
  assert.match(overview, /class="hvac-art"/);
  assert.match(overview, /id="hvacRangeMinus"/);
  assert.match(overview, /id="hvacRange"/);
  assert.match(overview, /id="hvacRangePlus"/);
  assert.match(overview, /function shiftHvacRange\(direction\)/);
  assert.match(overview, /commitHvac\(\{mode:'auto',heatC,coolC\}\)/);
  assert.match(overview, /hvac-card\.is-running \.hvac-flow path/);
  assert.match(overview, /purifier\.is-on \.purifier-art\{animation:purifierBodyBreathe/);
  assert.match(overview, /card\.classList\.toggle\('is-heating',mode==='heat'\)/);
  assert.match(overview, /card\.classList\.toggle\('is-cooling',mode==='cool'\)/);
  assert.match(overview, /home-controls-card \.zone-switch strong,\.dashboard>\.air>\.tile-head\{display:none!important\}/);
  assert.match(overview, /class="tile zone-card home-controls-card"/);
  assert.match(overview, /class="home-controls-layout"/);
  assert.match(overview, /home-controls-card \.zone-switch-grid\{grid-template-columns:repeat\(2/);
  assert.doesNotMatch(overview, /<div class="hvac-head">|<h2>Кондиционер<\/h2>/);
  assert.match(overview, /ECOBEE_BRIDGE='http:\/\/127\.0\.0\.1:4179'/);
  assert.match(overview, /requestLocal\(ECOBEE_BRIDGE,'\/api\/status'\)/);
  assert.match(overview, /requestLocal\(ECOBEE_BRIDGE,'\/api\/control'/);
  assert.doesNotMatch(overview, /id="hvacCurrent"|id="hvacHeat"|id="hvacCool"|id="hvacSensors"|<[^>]+data-hvac-mode|<[^>]+data-hvac-setpoint/);
  assert.doesNotMatch(overview, /<span aria-hidden="true">⏻<\/span> Всё/);
  assert.match(overview, /id="masterPower"[^>]*hidden/);
  assert.doesNotMatch(overview, /id="smartHomeDevices"|id="smartHomeRefresh"|id="smartHomeAllOn"|id="smartHomeAllOff"|id="smartHomeMessage"|id="lampStatus"/);
  assert.match(overview, /temperature/);
  assert.match(overview, /humidity/);
  assert.doesNotMatch(overview, /id="lampColor"|id="lampWheel"|id="lampKelvin"/);
  assert.match(overview, /class="fund-goal-ratio"/);
  assert.doesNotMatch(overview, /class="fund-goal-index"/);
  assert.doesNotMatch(overview, /выполнено/);
  assert.match(overview, /\.dashboard>\.fund-goals\{min-height:0!important;height:auto!important/);
  assert.match(overview, /\.dashboard>\.air \.air-reading\{display:grid!important;place-items:center!important/);

  assert.match(bridge, /elgato-light-strip-pro-d026\.local/);
  assert.match(bridge, /elgato-light-strip-pro-8c54\.local/);
  assert.match(bridge, /Access-Control-Allow-Private-Network/);
  assert.match(bridge, /"\/lights"/);
  assert.match(bridge, /"\/smart-home"/);
  assert.match(bridge, /def smart_home_status\(device_ids:/);
  assert.match(bridge, /192\.168\.4\.33/);
  assert.match(bridge, /any\(device\["on"\] for device in devices\)/);
});

test('учёт времени переключает дни и сохраняет шесть стартовых редактируемых категорий', () => {
  const time = read('piura-erp-restored 3/modules/Time-tracker.html');
  assert.match(time, /<div class="hero-topbar" id="dateNavigation">[\s\S]*?<div class="hero">/);
  assert.match(time, /body>\.hero-topbar\{display:grid!important/);
  assert.match(time, /id="prevDay"/);
  assert.match(time, /id="nextDay"/);
  assert.match(time, /id="todayDay"/);
  assert.doesNotMatch(time, /id="dateJump" type="date"/);
  const defaults = time.match(/const DEFAULT_CATS = \[([\s\S]*?)\n\];/)?.[1] || '';
  const labels = [...defaults.matchAll(/label:'([^']+)'/g)].map(match=>match[1]);
  assert.deepEqual(labels,['Обучение','Наставник','Климат','Инвестиции','Управление деньгами','Фонды']);
  assert.equal(labels.includes('Основное'),false);
  assert.equal(labels.includes('Эффективность'),false);
  assert.match(time, /id="timeEditButton"/);
  assert.match(time, /const addTile=document\.createElement\('button'\)/);
  assert.match(time, /function saveCats\(cats\)/);
  assert.match(time, /catsCache=normalized;localStorage\.setItem/);
  assert.match(time, /function migrateLegacyTimeData\(force=false\)/);
  assert.match(time, /day\.fondy=legacyFunds/);
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

test('ПС №1 оставляет по одному действию в динамиках 4–6 и сохраняет старые отметки', () => {
  const weekly = read('piura-erp-restored 3/modules/Dynamics-2.html');
  for (const [id, word] of [[401,'четвертой'],[501,'пятой'],[602,'шестой']]) {
    assert.match(weekly, new RegExp(`\\[${id},[456],'Сделано действие по ${word} динамике',200\\]`));
  }
  assert.match(weekly, /TASKS_VERSION=5/);
  assert.match(weekly, /mergeCurrentTask\(401,\[404\]\)/);
  assert.match(weekly, /mergeCurrentTask\(501,\[502\]\)/);
  assert.match(weekly, /mergeCurrentTask\(602,\[603,604\]\)/);
  assert.match(weekly, /REMOVED_TASK_IDS=\[402,403,404,502,601,603,604\]/);
});

test('эффективность показывает доказательство времени в день и в неделю', () => {
  const effectiveness = read('piura-erp-restored 3/modules/EFFECTIVNESS.html');
  assert.match(effectiveness, /dailyHours=observedHours\/observedDays,weeklyHours=dailyHours\*7/);
  assert.match(effectiveness, /<span>В день<\/span>/);
  assert.match(effectiveness, /<span>В неделю<\/span>/);
  assert.match(effectiveness, /hours\(dailyHours\).*?× 7/);
});

test('утренний редактор открывает все блоки и переносит пункты между ними', () => {
  const morning = read('piura-erp-restored 3/modules/Morning.html');
  assert.match(morning, /body\.editing \.block\.locked\{opacity:1;filter:none\}/);
  assert.match(morning, /body\.editing \.block\.locked \.block-items,body\.editing \.block\.locked \.additem\{pointer-events:auto\}/);
  assert.match(morning, /group:'morning-items'/);
  assert.match(morning, /const fromId=evt\.from\.dataset\.blockItems,toId=evt\.to\.dataset\.blockItems/);
  assert.match(morning, /delete state\[fromId\]\.items\[moved\.id\];state\[toId\]\.items\[moved\.id\]=wasChecked/);
});

test('статистика времени использует увеличенные карточки и отступы', () => {
  const time = read('piura-erp-restored 3/modules/Time-tracker.html');
  assert.match(time, /\.stats-view\{gap:44px!important\}/);
  assert.match(time, /\.stats-summary-card\{min-height:174px!important/);
  assert.match(time, /\.stats-category-grid\{gap:32px!important\}/);
  assert.match(time, /\.stats-category\{min-height:320px!important/);
});

test('глобальные размеры применяются и к центру настроек', () => {
  const shell = read('index.html');
  assert.match(shell, /--settings-scale/);
  assert.match(shell, /control\.style\.zoom/);
  assert.match(shell, /class="choice-btn/);
});

test('главная возвращает полезные сводные цифры без маршрутов финансовых сервисов', () => {
  const overview = read('piura-erp-restored 3/modules/Overview.html');
  const dashboard=overview.slice(overview.indexOf('<section class="dashboard">'),overview.indexOf('<div class="legacy">'));
  const order=['admin-progress','fund-goals','control-grid','home-controls-card','fan-card','purifier-card','hvac-card','tile air','overview-number-grid'].map(token=>dashboard.indexOf(token));
  assert.ok(order.every((value,index)=>value>=0&&(index===0||value>order[index-1])));
  assert.doesNotMatch(dashboard, /tile ps|week-kpis|overviewWeekChart/);
  for(const label of ['Доход за год','Доллар в час','Капитал фондов','Piura Family Fund','Endowment','Подписчики'])assert.match(dashboard,new RegExp(label));
  assert.match(dashboard, /id="numbersToggle"/);
  assert.match(dashboard, /id="overviewNumbers"[^>]*hidden/);
  assert.match(overview, /setNumbersVisible\(false\)/);
  assert.match(overview, /function refreshFinancialSummary\(\)/);
  assert.doesNotMatch(dashboard, /data-go="finance"|data-go="pff"/);
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

test('главная показывает крупные программы без утра и недельного графика', () => {
  const shell = read('index.html');
  const overview = read('piura-erp-restored 3/modules/Overview.html');
  const dashboard=overview.slice(overview.indexOf('<section class="dashboard">'),overview.indexOf('<div class="legacy">'));
  assert.doesNotMatch(overview, /refreshMorningFromCloud|Магия утра|tile morning/);
  assert.match(overview, /donePrograms/);
  assert.match(overview, /fallbackCounts=\[24,20,24,11,6,11,1,1\]/);
  assert.match(overview, /id="adminDynamics"/);
  assert.doesNotMatch(dashboard, /overviewWeekChart|overviewPsToday|overviewPsDayRecord|overviewPsWeekRecord/);
  assert.match(overview, /\.admin-progress\{min-height:560px!important/);
  assert.match(overview, /\.fund-goals\{min-height:610px!important/);
  assert.match(shell, /\.admin-progress\{min-height:620px!important\}/);
  assert.match(shell, /\.fund-goals\{min-height:560px!important\}/);
  assert.match(overview, /calm, equal control surfaces/);
  assert.match(overview, /\.fund-goal-list\{flex:1;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)!important/);
  assert.match(overview, /background:var\(--erp-raised,var\(--raised\)\)!important/);
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

test('главная содержит только компактную финансовую сводку, а управление фондами остаётся просторным', () => {
  const overview = read('piura-erp-restored 3/modules/Overview.html');
  const funds = read('piura-erp-restored 3/modules/Fonds.html');
  assert.match(overview, /compactMoney=value=>/);
  assert.match(overview, /overview_finance_snapshot_v1/);
  assert.doesNotMatch(overview, /data-go="finance"|data-go="pff"/);
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
  assert.equal(tasks.length,20);
  assert.equal(tasks.reduce((sum,task)=>sum+task.weight,0),1935);
  assert.equal(tasks.find(task=>task.name==='Сессия')?.weight,75);
  assert.equal(tasks.find(task=>task.name==='День без расстройств')?.weight,100);
  assert.equal(tasks.find(task=>task.name==='Описана тэта')?.weight,500);
  assert.equal(tasks.find(task=>task.name==='Хорошо сделан кайдзен-час')?.weight,20);
  assert.equal(tasks.find(task=>task.name==='Все задачи предыдущего дня')?.weight,70);
  assert.equal(tasks.find(task=>task.name==='Сделано действие по четвертой динамике')?.weight,200);
  assert.equal(tasks.find(task=>task.name==='Сделано действие по пятой динамике')?.weight,200);
  assert.equal(tasks.find(task=>task.name==='Сделано действие по шестой динамике')?.weight,200);
  assert.equal(tasks.find(task=>task.name==='Выполнен пункт этического плана')?.weight,100);
  assert.ok(tasks.some(task=>task.name==='Личная гигиена, душ, зубы, витамины'));
  assert.ok(tasks.some(task=>task.name==='Тренировка: теннис / спортзал / разминка / растяжка / 6 000 шагов'));
  assert.ok(tasks.some(task=>task.name==='Обучение (пара, инвестиции, наставничество, заочное или очное)'));
  assert.ok(tasks.some(task=>task.name==='Занятие хобби (шахматы, рисование, чтение)'));
  assert.ok(tasks.some(task=>task.name==='Хорошо выполнены совместные ритуалы'));
  assert.ok(tasks.some(task=>task.name==='Выполнен план работы по направлению дня'));
  assert.ok(tasks.some(task=>task.name==='Описаны мои динамики'));
  assert.doesNotMatch(tasksSource, /Привлечены средства в Endowment|Наведён порядок дома|Написана глава книги/);
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
  assert.match(weekly, /SCHEMA_VERSION=15,DYNAMICS_VERSION=1,TASKS_VERSION=5,WEEK_CYCLE_VERSION=3/);
  assert.match(weekly, /REMOVED_TASK_IDS=\[402,403,404,502,601,603,604\]/);
  assert.match(weekly, /if\(needsTaskMigration\)migrateTaskCatalog\(\)/);
  assert.match(weekly, /function mergeCurrentTask\(canonicalId,legacyIds\)/);
});

test('миграция ПС №1 сохраняет отметки и старые недельные веса', () => {
  const weekly = read('piura-erp-restored 3/modules/Dynamics-2.html');
  const rows = [...(weekly.match(/const DEFAULT_TASKS=\[(.*?)\n\]\.map/s)?.[1]||'').matchAll(/\[(\d+),(\d+),'([^']+)',(\d+)\]/g)];
  const defaults = rows.map((match,order)=>({id:Number(match[1]),dynamicId:Number(match[2]),name:match[3],w:Number(match[4]),order,active:true}));
  const migrationSource = weekly.match(/function mergeCurrentTask\(canonicalId,legacyIds\).*?(?=\nfunction taskWeekWeight)/s)?.[0]||'';
  const beforeDaily = {'2026-08-18':{'101':1,'102':1,'403':1}};
  const migrated = Function('DEFAULT_TASKS','beforeDaily',`
    const REMOVED_TASK_IDS=[402,403,404,502,601,603,604],clone=value=>JSON.parse(JSON.stringify(value)),num=value=>Number(value)||0;
    const current='2026-08-13',previous='2026-08-06';
    let S={tasks:[
      {id:101,dynamicId:1,name:'Личная гигиена, душ, зубы, витамины',w:10,order:0,active:true},
      {id:102,dynamicId:1,name:'Тренировка',w:20,order:1,active:true},
      {id:403,dynamicId:4,name:'Написана глава книги',w:30,order:2,active:true}
    ],weeks:{
      [current]:{daily:clone(beforeDaily),weights:{101:10,102:20,403:30},taskDynamics:{101:1,102:1,403:4}},
      [previous]:{daily:{'2026-08-07':{'102':1}},weights:{102:20},taskDynamics:{102:1}}
    }};
    function today(){return '2026-08-18'}
    function thursdayFor(){return current}
    function weekHasRawData(week){return Object.values(week?.daily||{}).some(scores=>Object.values(scores||{}).some(value=>num(value)>0))}
    function ensureWeek(anchor){return S.weeks[anchor]||(S.weeks[anchor]={daily:{},planned:{}})}
    function freezeWeek(anchor){const week=ensureWeek(anchor);week.weights=week.weights||{};week.taskDynamics=week.taskDynamics||{};S.tasks.forEach(task=>{if(!Number.isFinite(Number(week.weights[task.id])))week.weights[task.id]=num(task.w);if(!Number.isFinite(Number(week.taskDynamics[task.id])))week.taskDynamics[task.id]=num(task.dynamicId)});return week}
    ${migrationSource}
    migrateTaskCatalog();
    return S;
  `)(defaults,beforeDaily);
  assert.deepEqual(migrated.weeks['2026-08-13'].daily,beforeDaily);
  assert.equal(migrated.weeks['2026-08-13'].weights['102'],30);
  assert.equal(migrated.weeks['2026-08-06'].weights['102'],20);
  assert.equal(migrated.tasks.find(task=>task.id===403)?.active,false);
  assert.equal(migrated.tasks.find(task=>task.id===105)?.active,true);
  assert.equal(migrated.weeks['2026-08-13'].daily['2026-08-18']['105'],undefined);
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
  assert.match(funds, /ALL_FUNDS_DEFAULTS_KEY = 'piura_funds_all_included_v3'/);
  assert.match(funds, /allF\(merged\)\.forEach\(f=>\{f\.included=true\}\)/);
  assert.match(funds, /#view-manage \.conn-row\{display:block!important/);
  assert.match(funds, /#inclRow \.pill\.on\{/);
  assert.match(funds, /<polygon points=/);
  assert.match(funds, /class="endowment-card-metrics"/);
  assert.match(funds, /Доход \/ месяц/);
  assert.match(funds, /Доходность/);
  assert.match(funds, /% капитала/);
  assert.doesNotMatch(funds, /id="endTotalGoal"|id="endYieldGoal"|id="endAnnual"|Цель дохода \/ месяц/);
});

test('Фонды показывают понятный результат и план, а сервис Друг удалён', () => {
  const foundation = read('piura-erp-restored 3/modules/Foundation.html');
  const shell = read('index.html');
  for (const label of ['Котики','Наркотики','Саентология','Экология','Ассоциация добрых дел']) assert.match(foundation,new RegExp(label));
  assert.doesNotMatch(foundation, /name:'Уборки'|name:'Растения'/);
  assert.match(foundation, /Планета, избавленная от лишнего мусора, в которой численность растений поддерживается в норме/);
  assert.match(foundation, /goals:\[\{key:'planet',product:'Проведённые уборки'/);
  assert.match(foundation, /\{key:'plants',product:'Посаженные деревья'/);
  assert.match(foundation, /fund-results\$\{goals\.length>1\?' is-multiple':''\}/);
  assert.doesNotMatch(foundation, /name:'Дети'/);
  assert.match(foundation, /data-year="2026"/);
  assert.match(foundation, /data-year="2027"/);
  assert.match(foundation, /activeYear===2026\?goal\.y26:goal\.y27/);
  assert.doesNotMatch(foundation, /фактический продукт/i);
  assert.match(foundation, /Отзывы детей после антинаркотического просвещения/);
  assert.match(foundation, /product:'Добрые дела участников ассоциации'/);
  assert.doesNotMatch(foundation, /Прогресс \$\{activeYear\}/);
  assert.doesNotMatch(foundation, /Шесть направлений|<h1>Результаты<\/h1>/);
  assert.doesNotMatch(foundation, /class="yearbar"/);
  assert.match(foundation, /class="fund-years"/);
  assert.match(foundation, /class="fund-goal"/);
  assert.match(foundation, /class="fund-result"/);
  assert.doesNotMatch(foundation, /class="fund-label">Цель/);
  assert.doesNotMatch(foundation, /class="product-label">Продукт/);
  assert.match(foundation, /<span>\$\{activeYear\}<\/span>/);
  assert.match(foundation, /<small>Сделано<\/small>/);
  assert.match(foundation, /<small>План<\/small>/);
  assert.doesNotMatch(foundation, /<h1>Фонды<\/h1>/);
  assert.match(shell, /\["foundation","Фонды"/);
  assert.match(shell, /Результаты и цели пяти направлений/);
  assert.match(read('piura-erp-restored 3/modules/Overview.html'), /name:'Экология',metrics:\[\{detail:'Уборки'/);
  assert.doesNotMatch(shell, /\["friend","Друг"/);
  assert.equal(existsSync(new URL('piura-erp-restored 3/modules/Friend.html',root)),false);
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
  assert.match(admin, /piura:request-firebase-token/);
  assert.match(admin, /u\.searchParams\.set\('t',String\(Date\.now\(\)\)\)/);
  assert.match(admin, /setInterval\(\(\)=>\{if\(document\.visibilityState==='visible'\)refreshDocs\(\);\},15000\)/);
  assert.match(admin, /window\.addEventListener\('focus',refreshDocs\)/);
  assert.match(admin, /Не смотреть порно пол года/);
  for (const item of [
    'Выстроить официальную оплату всем подрядчикам в РФ',
    'Выстроить новую систему по выплате дивидендов и ЗП в компании',
    'Оформить людей в компанию официально',
    'Рассчитать и оплатить налоги по всем инвест. фондам',
    'Заплатить абсолютно все личные налоги',
    'Сделать проверку на безопасности по технологии в компании',
  ]) assert.match(admin, new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
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

test('динамика эффективности хранит четыре расчётных направления, а время быстро и безопасно синхронизируется', () => {
  const shell = read('index.html');
  const effectiveness = read('piura-erp-restored 3/modules/EFFECTIVNESS.html');
  const time = read('piura-erp-restored 3/modules/Time-tracker.html');
  for (const date of ['2026-08-01','2026-08-15','2026-08-30']) assert.match(effectiveness,new RegExp(date));
  assert.doesNotMatch(effectiveness, /2026-07-01|2026-07-15/);
  for (const label of ['Инвестиции','Наставничество','Климат','Управление деньгами']) assert.match(effectiveness,new RegExp(label));
  assert.doesNotMatch(effectiveness, /<span>Статус<\/span>|<span>Долларов в час<\/span>/);
  assert.match(effectiveness, /function checkpointDate/);
  assert.doesNotMatch(effectiveness, /id="checkpointChart"/);
  assert.doesNotMatch(effectiveness, /selectComparison|cp-point-meta|cp-change/);
  assert.match(effectiveness, /CHECKPOINT_KEY/);
  assert.match(effectiveness, /function restoreHistoricalCheckpoints/);
  assert.match(effectiveness, /function normalizedEffectiveness\(incomeTotal,observedHours,observedDays,periodDays\)/);
  assert.match(effectiveness, /observedHours\/observedDays\*periodDays/);
  assert.match(effectiveness, /version===3/);
  assert.match(effectiveness, /formula:'normalized-periods'/);
  assert.doesNotMatch(effectiveness, /function calcDph|last3avg|weighted|Лучший мес|Медиана/);
  assert.match(effectiveness, /function scheduledCheckpointDates/);
  assert.match(effectiveness, /function scheduledCheckpointDates\(\)\{return\['2026-08-01','2026-08-15','2026-08-30'\]\}/);
  assert.doesNotMatch(effectiveness, /new Date\(2026,7,22,12\)|cursor\.setDate/);
  assert.match(effectiveness, /ov-row cp-overview-row/);
  assert.match(effectiveness, /ov-summary cp-summary/);
  assert.match(effectiveness, /id="proofmodal"/);
  assert.match(effectiveness, /function openCheckpointProof\(date,id\)/);
  assert.match(effectiveness, /observationStart/);
  assert.match(effectiveness, /Каждая цифра зафиксирована на эту дату/);
  assert.doesNotMatch(effectiveness, /К ПРОШЛОЙ НЕДЕЛЕ|ТОЧКА ОТСЧЁТА|ЕЖЕНЕДЕЛЬНЫЙ КОНТРОЛЬ|Последняя точка/);
  assert.match(time, /SHEET_SYNC_DELAY = 1500/);
  assert.match(time, /PENDING_SYNC_KEY/);
  assert.match(time, /latestRevision<=syncRevision/);
  assert.match(time, /if\(synced&&/);
  assert.match(time, /async function verifySheetDate/);
  assert.match(time, /Google Sheets не подтвердил запись/);
  assert.match(time, /const values = Object\.fromEntries\(cats\.map/);
  assert.match(time, /label: c\.syncLabel/);
  assert.match(time, /sheetCategories=new Set\(payload\.categories\|\|\[\]\)/);
  assert.doesNotMatch(time, /\(payload\.categories\|\|\[\]\)\.forEach\(\(label,index\)/);
  assert.match(time, /protectedDates\.has\(serverDay\.date\)/);
  assert.match(time, /if\(!labels\.length\)return/);
  assert.match(time, /'Content-Type': 'text\/plain;charset=UTF-8'/);
  assert.match(time, /keepalive: true/);
  assert.match(time, /window\.addEventListener\('pagehide',sendPendingOnPageHide\)/);
  assert.match(time, /function scheduleSummaryRender\(\)/);
  assert.match(time, /id="statsViewTab"/);
  assert.match(time, /function statisticsSnapshot\(period=statsPeriod\)/);
  assert.match(time, /data-stats-period="7"/);
  assert.match(time, /data-stats-period="30"/);
  assert.match(time, /data-stats-period="all"/);
  assert.match(time, /Итого · \$\{data\.label\}/);
  assert.match(time, /<span>В день<\/span>/);
  assert.match(time, /let activeTimeView = 'daily'/);
  assert.match(time, /setTimeView\('daily'\)/);
  assert.doesNotMatch(time, /Личный ритм|дней с записями|% всего времени/);
  assert.match(time, /\.entry-grid\{gap:36px!important;padding:40px!important;border-radius:30px!important\}/);
  assert.match(time, /\.entry-card,\.add-card\{min-height:204px!important;border-radius:22px!important\}/);
  assert.match(shell, /\.entry-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important;gap:30px!important\}/);
  assert.match(shell, /\.entry-card\{min-height:190px!important/);
});

test('Главная остаётся единственной основной панелью', () => {
  const shell = read('index.html');
  assert.match(shell, /\["overview","Главная"/);
  assert.doesNotMatch(shell, /overviewtest|Главное тест|Overview-Test/);
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
  assert.match(shell, /settings-hub-btn[^}]*<svg|settings-hub-btn[^`]*<svg/);
  assert.match(shell, /gap:18/);
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
  assert.match(morning, /let blocksData = applyVisibilityPrefs\(restoreHiddenItems\(loadBlocks\(\)\)\)/);
  assert.match(morning, /localStorage\.setItem\(HIDDEN_RESTORE_KEY,'1'\)/);
  assert.match(morning, /const VISIBILITY_KEY = 'morn_v8_visibility_v1'/);
  assert.match(morning, /function saveBlocks\(\)[\s\S]*?writeVisibilityPrefs\(blocksData\);[\s\S]*?notifyDataChanged\(\)/);
  assert.match(morning, /const DATA_VERSION = 3/);
  assert.match(morning, /id:'b1i10'[\s\S]*?Заполнил[\s\S]*?ПС[\s\S]*?№1[\s\S]*?вчерашний/);
  assert.match(morning, /'b1i3','b1i9','b1i7','b1i10'/);
  assert.match(morning, /JSON\.stringify\(\{version:2,date:stateDate,blocks:state\}\)/);
  assert.match(morning, /if\(envelope\?\.date!==currentDate\|\|!envelope\?\.blocks/);
  assert.match(morning, /function ensureTodayState\(\)/);
  assert.match(morning, /function renderDate\(\)\{\s*ensureTodayState\(\)/);
  assert.doesNotMatch(morning, /setTimeout\([^)]*HIDDEN_RESTORE_KEY/);
});

test('климат сохраняет персональные пороги, но не дублирует подписи «Идеал»', () => {
  const overview = read('piura-erp-restored 3/modules/Overview.html');
  assert.match(overview, /const target=70,tolerance=\.5/);
  assert.match(overview, /v>target\?'Жарко':'Прохладно'/);
  assert.match(overview, /v>50\?'Очень влажно'/);
  assert.doesNotMatch(overview, /Идеал 70°F|Идеал 45%|Идеал до 500 ppm/);
  const cards = [...overview.matchAll(/function climateCard\(profile\).*?(?=\nconst CLIMATE_SNAPSHOT_KEY)/gs)];
  const card = cards.at(-1)?.[0] || '';
  assert.doesNotMatch(card, /air-range|air-delta|marker/);
  assert.doesNotMatch(card, /air-ideal|profile\.ideal/);
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

test('августовские правки интерфейса сохраняют прогресс, цвета и порядок завершённых', () => {
  const overview = read('piura-erp-restored 3/modules/Overview.html');
  const effectiveness = read('piura-erp-restored 3/modules/EFFECTIVNESS.html');
  const weekly = read('piura-erp-restored 3/modules/Dynamics-2.html');
  const admin = read('piura-erp-restored 3/modules/AdminScale.html');
  const foundation = read('piura-erp-restored 3/modules/Foundation.html');

  assert.match(overview, /\.page\{width:100%;max-width:none;min-height:100vh;margin:0;padding:0\}/);
  assert.match(overview, /class="admin-total-panel"/);
  assert.match(overview, /class="admin-total-head"><span>Общий прогресс<\/span><strong id="adminValue">/);
  assert.doesNotMatch(overview, /id="admin(?:Percent|Complete|Remaining|Directions)"/);
  assert.match(overview, /const totalProgress=/);
  assert.match(overview, /class="fund-goal fund-goal-ecology"/);
  assert.match(overview, /goal\.metrics\.reduce\(\(sum,metric\)=>sum\+Math\.min\(100/);
  assert.match(overview, /data-piura-keep-full/);
  assert.match(effectiveness, /return\['2026-08-01','2026-08-15','2026-08-30'\]/);
  assert.match(effectiveness, /const CHECKPOINT_COLORS=\{inv:'#4faeff',nav:'#b47cff',klim:'#42d9a4',money:'#f2c75c'\}/);
  assert.match(effectiveness, /--checkpoint-color:\$\{color\}/);
  assert.match(weekly, /compact PS №1/);
  assert.match(weekly, /\.score\{min-height:142px;padding:22px 24px\}/);
  assert.doesNotMatch(admin, /\.item-row\.item-done\{display:none\}/);
  assert.match(admin, /items=\[\.\.\.activeItems,\.\.\.doneItems,\.\.\.hiddenItems\]/);
  assert.match(admin, /overflowCount=Math\.max\(0,activeItems\.length-limit\)\+doneItems\.length/);
  assert.match(admin, /\(item\.done\|\|visibleIndex>=limit\)\?' item-overflow'/);
  assert.match(foundation, /\.fund\{min-height:300px/);
  assert.doesNotMatch(foundation, /class="(?:fund|product)-label">(?:Цель|Продукт)<\/span>/);
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
