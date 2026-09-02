import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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
  assert.match(office,/target.piuraSetOfficeColor\(colors\[mode\]\)/);
  assert.match(overview,/commitLampWheelColor\(hex\).*window.piuraSetOfficeColor\(hex\)/);
  assert.match(overview,/if\(!lightingOnly\)refreshFinancialSummary/);
  assert.match(office,/status:devices.every\(x=>x.ok\)\?'done':'partial'/);
});
test('learning has a new right image and investments have three distinct assets',()=>{
  assert.match(app,/mode == .investments && index == 0.*Investments-Left/);
  assert.match(app,/mode == .learning && index == 2.*Learning-Right/);
  const files=['Investments-Left','Investments','Investments-Portrait'].map(name=>readFileSync(new URL('../mac/resources/'+name+'.png',import.meta.url)));
  assert.ok(!files[0].equals(files[1])&&!files[1].equals(files[2]));
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
