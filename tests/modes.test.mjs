import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const html=read('modes.html');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];

function panel(native=true){
  const status={textContent:'',className:''};
  const buttons=['morning','climate','investments','learning','mentorship'].map(mode=>({
    dataset:{mode},disabled:false,
    addEventListener(event,handler){this[event]=handler;},
  }));
  const messages=[],timers=[];
  const window={location:{href:''}};
  if(native)window.webkit={messageHandlers:{piura:{postMessage:value=>messages.push(value)}}};
  const context={window,document:{getElementById:()=>status,querySelectorAll:()=>buttons},setTimeout:fn=>timers.push(fn)};
  runInNewContext(script,context);
  return {context,window,buttons,status,messages,timers};
}

test('native panel dispatches all five modes without any browser protocol handoff',()=>{
  for(const mode of ['morning','climate','investments','learning','mentorship']){
    const p=panel();
    assert.equal(p.messages.length,0,'page load must not start a mode');
    p.buttons.find(b=>b.dataset.mode===mode).click();
    assert.equal(p.messages.length,1);
    assert.equal(p.messages[0].mode,mode);
    assert.equal(p.messages[0].preview,false);
    assert.equal(p.window.location.href,'');
    assert.ok(p.buttons.every(b=>b.disabled));
    p.window.piuraModeFinished({ok:false,message:'Нужно разрешение'});
    assert.equal(p.status.textContent,'Нужно разрешение');
    assert.equal(p.status.className,'error');
    assert.ok(p.buttons.every(b=>!b.disabled));
  }
});

test('browser HTML dispatches the chosen mode and does not claim success',()=>{
  const p=panel(false);
  p.buttons[1].click();
  assert.equal(p.window.location.href,'piura-modes://climate');
  assert.notEqual(p.status.className,'ok');
  p.timers.forEach(fn=>fn());
  assert.ok(p.buttons.every(b=>!b.disabled));
  assert.match(p.status.textContent,/без вопроса/);
});

test('unknown modes cannot launch a protocol or a native action',()=>{
  const p=panel();
  runInNewContext("sendMode('invalid');sendMode('__proto__')",p.context);
  assert.equal(p.messages.length,0);
  assert.equal(p.window.location.href,'');
});

test('Mac stays dark; Morning changes actual desktop images from a permanent location',()=>{
  const app=read('mac/PIURAModes.swift');
  assert.match(app,/set dark mode to true/);
  assert.doesNotMatch(app,/set dark mode to false/);
  assert.match(app,/supportDirectory\.appendingPathComponent\("Wallpapers"/);
  assert.match(app,/workspace\.setDesktopImageURL\(permanentURL, for: screen/);
  assert.match(app,/tell every desktop to set picture/);
  for(const asset of ['Magic-Morning','Climate-Cat','Investments','Learning','Mentorship'])assert.match(app,new RegExp(asset));
  assert.doesNotMatch(html,/Magic-Morning\.png/);
});

test('Climate and Investments use true full-screen Telegram Split View',()=>{
  const app=read('mac/PIURAModes.swift');
  assert.match(app,/name of t contains "Рабочая таблица"/);
  assert.match(app,/set current tab of w to t/);
  assert.match(app,/telegramIDs = \["ru\.keepcoder\.Telegram", "org\.telegram\.desktop"\]/);
  assert.match(app,/arrangeTelegramSplitView\(on: center\)/);
  assert.match(app,/applicationShouldTerminateAfterLastWindowClosed[\s\S]*!isModeRunning/);
  assert.match(app,/selectLeftFullScreenTile\(of: telegram\)/);
  assert.match(app,/menu item "Left of Screen"/);
  assert.match(app,/postPointerClick\(at: CGPoint\(x: target\.rect\.minX \+ target\.rect\.width \* 0\.75/);
  assert.match(app,/bothFullScreen = aFull as\? Bool == true && bFull as\? Bool == true/);
  assert.match(app,/bothFullScreen &&/);
  assert.match(app,/abs\(right\.minX - left\.maxX\) < 18/);
  assert.match(app,/abs\(left\.width - right\.width\) < 16/);
  assert.match(app,/keep\.formUnion\(telegramIDs/);
  assert.match(app,/configuration\.activates = telegramIDs\.contains\(id\)/);
  assert.match(app,/\[kAXMainWindowAttribute, kAXFocusedWindowAttribute\]/);
  assert.match(app,/if mode\.needsChatGPT/);
});

test('the five mode recipes contain the supplied workspaces',()=>{
  const app=read('mac/PIURAModes.swift');
  assert.match(app,/case morning, climate, investments, learning, mentorship/);
  assert.equal((html.match(/<button[^>]+data-mode=/g)||[]).length,5);
  assert.equal((app.match(/https:\/\/docs\.google\.com\/spreadsheets\/d\//g)||[]).length,5);
  assert.match(app,/extension\.flag\.today\/course\//);
  assert.match(app,/module=funds&theme=dark/);
  assert.match(app,/communication-policy\.html/);
  assert.match(app,/if mode != \.learning/);
  assert.match(app,/if mode\.needsMusic && !startYandexMusic/);
});
