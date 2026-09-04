import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=read('mac/PIURAModes.swift');
test('music observation never clicks the player, even while buffering',()=>{
  const code=app.split('let readState = """')[1].split('"""')[0];
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
  assert.match(office,/target.piuraSetOfficeColor\(colors\[mode\],100\)/);
  assert.match(overview,/commitLampWheelColor\(hex\).*window.piuraSetOfficeColor\(hex\)/);
  assert.match(overview,/if\(!lightingOnly\)refreshFinancialSummary/);
  assert.match(office,/status:devices.every\(x=>x.ok\)\?'done':'partial'/);
  assert.match(overview,/item.status==='fulfilled'&&!item.value\?\.errors\?\.length/);
  assert.match(overview,/error\?\.name==='TimeoutError'\|\|error\?\.name==='AbortError'\)break/);
});
test('every mode has three distinct desktop images',()=>{
  assert.match(app,/mode == .morning && index == 0.*Magic-Morning-Left/);

  assert.match(app,/mode == .work && index == 0.*Investments-Left/);
  assert.match(app,/mode == .learning && index == 2.*Learning-Right/);
  const hashes=[];
  for(const names of [
    ['Magic-Morning-Left','Magic-Morning','Magic-Morning-Portrait'],

    ['Investments-Left','Investments','Investments-Portrait'],
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
  assert.match(app,/changedAfterLayout/);
});
test('final screen audit forbids duplicate music windows and music in quiet modes',()=>{
  assert.match(app,/musicIDs == \[leftWindowID\] : musicIDs.isEmpty/);
  assert.match(app,/mode == \.morning \? morningAdminPreviewURL/);
  assert.match(app,/"morningLeftForeground":"goals-and-plans","musicHiddenBehind":true/);
  assert.match(app,/finalSideWindowsVerified/);
  const audit=app.slice(app.indexOf('private func verifyFinalSides'),app.indexOf('private func verifyOfficeLighting'));
  assert.doesNotMatch(audit,/AXRaise|\.click\(|startYandexMusic/);
  assert.match(app,/distinct == job.records.count/);
});
test('morning keeps music in the left window and shows goals with plans above it',()=>{
  const preview=read('morning-admin-preview.html');
  const admin=read('piura-erp-restored 3/modules/AdminScale.html');
  assert.match(preview,/grid-template-columns:1fr 1fr/);
  assert.match(preview,/section=%D1%86%D0%B5%D0%BB%D0%B8/);
  assert.match(preview,/section=%D0%BF%D0%BB%D0%B0%D0%BD%D1%8B/);
  assert.match(admin,/const adminPreviewParams=new URLSearchParams\(location\.search\)/);
  assert.match(admin,/browseMode=adminPreview\?'sections'/);
  assert.match(admin,/body\[data-admin-preview="1"\] \.topbar/);
});
test('focus menu tolerates the macOS recording indicator suffix',()=>{
  assert.match(app,/\["Control Center","Do Not Disturb"\].contains\(title\)/);
  assert.match(app,/role:kAXMenuBarItemRole/);
  assert.match(app,/Focus value did not change/);
});
