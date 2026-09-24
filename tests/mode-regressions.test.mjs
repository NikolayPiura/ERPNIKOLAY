import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=read('mac/PIURAModes.swift');
test('music observation never clicks the player, even while buffering',()=>{
  const music=app.slice(app.indexOf('private func startYandexMusic'),app.indexOf('private func configureMusic'));
  const code=music.split('let readState = """')[1].split('"""')[0];
  let clicks=0,playing=false;
  const ctx={navigator:{mediaSession:{playbackState:'paused'}},document:{querySelector:()=>({querySelector:s=>s.includes('Пауза')?(playing?{}:null):{click(){clicks++}}})}};
  for(let i=0;i<12;i++)assert.equal(runInNewContext(code,ctx),'ready');
  assert.equal(clicks,0);playing=true;
  assert.equal(runInNewContext(code,ctx),'already-playing');assert.equal(clicks,0);
  assert.match(app,/state == "ready" && !clicked/);
});
test('pairing excludes foreign apps and verifies both Telegram PIDs on screen',()=>{
  assert.match(app,/hiddenForPairing\.allSatisfy/);
  assert.match(app,/visiblePIDs\.contains\(telegram.processIdentifier\) && visiblePIDs\.contains\(lite.processIdentifier\)/);
  const run=app.slice(app.indexOf('private func runMode'),app.indexOf('private func display'));
  assert.ok(run.indexOf('arrangeTelegramSplitView')<run.indexOf('openCompanionApps'));
  assert.ok(run.indexOf('restoreForeground')<run.indexOf('finishDesktopWallpaper'));
});
test('office modes reuse wheel control, not ERP palettes or HVAC',()=>{
  const shell=read('index.html'),office=read('office-modes.js'),overview=read('piura-erp-restored 3/modules/Overview.html');
  assert.doesNotMatch(shell,/prefs\.palette=(mode|launchWorkMode)/);
  assert.doesNotMatch(office,/controlHvac|toggleEverything|zoneAllToggle/);
  assert.match(office,/brightness=mode==='morning'\?70:100/);
  assert.match(office,/target.piuraSetOfficeColor\(colors\[mode\],brightness\)/);
  assert.match(overview,/commitLampWheelColor\(hex\).*window.piuraSetOfficeColor\(hex\)/);
  const officeColor=overview.slice(overview.indexOf('window.piuraSetOfficeColor'),overview.indexOf('async function commitLampWheelColor'));
  assert.ok(officeColor.indexOf("controlAllLights('power','on')")<officeColor.indexOf("controlAllLights('color',hex)"));
  assert.ok(officeColor.indexOf("controlAllLights('color',hex)")<officeColor.indexOf("controlAllLights('brightness'"));
  assert.match(overview,/if\(!lightingOnly\)refreshFinancialSummary/);
  assert.match(office,/status:devices.every\(x=>x.ok\)\?'done':'partial'/);
  assert.match(overview,/item.status==='fulfilled'&&!item.value\?\.errors\?\.length/);
  assert.match(overview,/error\?\.name==='TimeoutError'\|\|error\?\.name==='AbortError'\)break/);
});
test('every mode has three distinct desktop images',()=>{
  assert.match(app,/mode == .morning && index == 0.*Magic-Morning-Left/);
  assert.match(app,/case .work: "Climate"/);
  assert.match(app,/mode == .work && index == 0.*Climate-Left/);
  assert.match(app,/mode == .learning && index == 2.*Learning-Right/);
  const hashes=[];
  for(const names of [
    ['Magic-Morning-Left','Magic-Morning','Magic-Morning-Portrait'],
    ['Climate-Left','Climate','Climate-Portrait'],
    ['Learning-Left','Learning','Learning-Right'],
    ['Mentorship','Mentorship-Center','Mentorship-Right']
  ]) {
    const files=names.map(name=>readFileSync(new URL('../mac/resources/'+name+'.png',import.meta.url)));
    hashes.push(...files.map(file=>createHash('sha256').update(file).digest('hex')));
    assert.ok(!files[0].equals(files[1])&&!files[1].equals(files[2])&&!files[0].equals(files[2]),names.join(','));
  }
  assert.equal(new Set(hashes).size,12,'All twelve screen assignments must use different image content');
});
test('communication policy keeps all twelve rules in column reading order',()=>{
  const policy=read('communication-policy.html');
  assert.equal((policy.match(/<li>/g)||[]).length,12);
  assert.match(policy,/grid-auto-flow:column;grid-template-rows:repeat\(6/);
  assert.match(policy,/grid-auto-flow:row;grid-template-rows:none/);
});
test('wallpaper changes wait for final Spaces, while asset preparation is early',()=>{
  const prepare=app.slice(app.indexOf('private func startDesktopWallpaper'),app.indexOf('private func finishDesktopWallpaper'));
  assert.doesNotMatch(prepare,/runAppleScript|setDesktopImageURL|DispatchQueue/);
  const run=app.slice(app.indexOf('private func runMode'),app.indexOf('private func display'));
  assert.ok(run.indexOf('startDesktopWallpaper')<run.indexOf('arrangeSafari'));
  assert.ok(run.indexOf('restoreForeground')<run.indexOf('finishDesktopWallpaper'));
  const finish=app.slice(app.indexOf('private func finishDesktopWallpaper'),app.indexOf('private func synchronizeWallpaperSpaces'));
  assert.match(finish,/synchronizeWallpaperSpaces\(job\)/);
  assert.ok((finish.match(/setDesktopImageURL/g)||[]).length>=2,'wallpaper is applied before and after the all-Spaces reload');
  assert.match(app,/changedAfterLayout/);
});
test('four mode recipes keep their screen and audio contracts',()=>{
  assert.match(app,/case .work: "Климат"/);
  assert.match(app,/var needsTelegram: Bool \{ self == \.work \|\| self == \.mentorship \}/);
  assert.match(app,/var needsChatGPT: Bool \{ self == \.work \}/);
  assert.match(app,/var needsMusic: Bool \{ true \}/);
  assert.match(app,/var musicVolume: Int\? \{ self == \.morning \? 20 : 40 \}/);
  assert.match(app,/case .learning: required = \[courseURL\]/);
  assert.match(app,/learningERPMinimized/);
  assert.match(app,/let needsLeft = mode == \.mentorship/);
  assert.match(app,/morningGoalsOpened":false/);
  assert.match(app,/if mode\.needsMusic[\s\S]*configureERPMusicVolume\(for:mode\)[\s\S]*verifyERPMusicPlaying\(\)[\s\S]*else[\s\S]*verifyERPMusicPaused\(\)/);
  assert.match(read('work-modes.js'),/work:'Климат'/);
});
test('morning powers outlets, starts quiet music, then wakes screens without goals',()=>{
  const run=app.slice(app.indexOf('private func runMode'),app.indexOf('private func display'));
  assert.ok(run.indexOf('holdSystemAwakeForMorning()')<run.indexOf('setMorningOutletsOn()'));
  assert.ok(run.indexOf('setMorningOutletsOn()')<run.indexOf('prepareMorningAudioBeforeDisplays()'));
  assert.ok(run.indexOf('prepareMorningAudioBeforeDisplays()')<run.indexOf('wakeConnectedDisplays()'));
  assert.match(run,/mode != \.morning/);
  assert.match(app,/process\.arguments = \["-d", "-u", "-t", "180"\]/);
  assert.match(app,/verifyERPMusicPlaying\(timeout:35\)/);
  assert.match(app,/\["1","2","3","5"\]/);
  assert.match(app,/Magic-Morning-Left-v2/);
  assert.doesNotMatch(app,/morningAdminPreview/);
});
test('automatic morning wakes a sleeping Mac before the 07:00 launch',()=>{
  const installer=read('mac/install-auto-morning.sh');
  const agent=read('mac/com.piura.modes.morning.plist');
  assert.match(installer,/pmset repeat wakeorpoweron MTWRFSU 06:59:30/);
  assert.match(agent,/<key>Hour<\/key>\s*<integer>7<\/integer>/);
  assert.match(agent,/<key>Minute<\/key>\s*<integer>0<\/integer>/);
});
test('final screen audit leaves music to the ERP control and never assigns it a display',()=>{
  assert.match(app,/var needsMusic: Bool \{ true \}/);
  assert.match(app,/let leftURL = policyURL/);
  assert.match(app,/"morningLeftForeground":"wallpaper-only","morningGoalsOpened":false/);
  assert.match(app,/"musicDisplay":"ERP control only"/);
  assert.match(app,/finalSideWindowsVerified/);
  const audit=app.slice(app.indexOf('private func verifyFinalSides'),app.indexOf('private func verifyOfficeLighting'));
  assert.doesNotMatch(audit,/AXRaise|\.click\(|startYandexMusic/);
  assert.match(app,/distinct == job.records.count/);
});
test('morning and mentorship helpers are repaired onto the left while ERP stays right',()=>{
  const repair=app.slice(app.indexOf('private func enforceYandexSides'),app.indexOf('private func verifyFinalSides'));
  assert.match(repair,/rightmostDisplay\(\).*leftmostDisplay\(\)/s);
  assert.match(repair,/id:erpWindowID,target:right,expectedURL:erpURL/);
  assert.match(repair,/id:leftWindowID,target:left,expectedURL:expected/);
  assert.match(repair,/selected:erp/);
  assert.match(repair,/selected:helper/);
  assert.match(repair,/"mentorshipLeftForeground"/);
  assert.match(repair,/"rightForeground":"ERP-only"/);
  const arrangement=app.slice(app.indexOf('private func arrangeYandex'),app.indexOf('private func yandexWindow'));
  assert.match(arrangement,/repeat with tabNumber from \(count every tab of window id leftID\) to 1 by -1/);
  assert.match(arrangement,/does not start with "\\\(leftURL\)" then close tab tabNumber/);
});
test('Yandex windows survive generic AX titles by binding immutable IDs to frames',()=>{
  const binding=app.slice(app.indexOf('private func yandexWindow'),app.indexOf('private func verifyBrowserWindow'));
  assert.match(binding,/bounds of window id \\\(id\) as text/);
  assert.match(binding,/kAXFocusedWindowAttribute,kAXMainWindowAttribute/);
  assert.match(binding,/sameFrame\(\$0,expected\)/);
  assert.match(binding,/"boundBy":"immutable-frame"/);
  assert.doesNotMatch(binding,/return candidates\.first/);
});
test('legacy goals preview remains valid but is no longer assigned by morning mode',()=>{
  const preview=read('morning-admin-preview.html');
  const admin=read('piura-erp-restored 3/modules/AdminScale.html');
  assert.match(preview,/grid-template-columns:1fr/);
  assert.doesNotMatch(preview,/Куда направлено внимание|Что двигаем сегодня|class="mark"/);
  assert.match(preview,/theme=light/);
  assert.match(preview,/section=%D1%86%D0%B5%D0%BB%D0%B8/);
  assert.doesNotMatch(preview,/section=%D0%BF%D0%BB%D0%B0%D0%BD%D1%8B/);
  assert.match(admin,/const adminPreviewParams=new URLSearchParams\(location\.search\)/);
  assert.match(admin,/browseMode=adminPreview\?'sections'/);
  assert.match(admin,/body\[data-admin-preview="1"\] \.topbar/);
  assert.match(admin,/grid-template-columns:1fr!important/);
  assert.match(admin,/grid-template-rows:repeat\(8,auto\)/);
  assert.match(admin,/--accent:#54b8ff/);
  assert.match(admin,/@media\(min-width:850px\) and \(min-height:1000px\)/);
  assert.match(admin,/body\[data-admin-preview="1"\] \.item-text\{font-size:1rem!important/);
  assert.match(admin,/body\[data-admin-preview="1"\] \.check-btn[^\{]*\{display:none/);
  assert.match(admin,/body\[data-admin-preview="1"\] \.block-more\{display:none/);
});
test('focus menu tolerates the macOS recording indicator suffix',()=>{
  assert.match(app,/\["Control Center","Do Not Disturb"\].contains\(title\)/);
  assert.match(app,/role:kAXMenuBarItemRole/);
  assert.match(app,/Focus value did not change/);
});
