import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const script=read('work-modes.js'), app=read('mac/PIURAModes.swift');
const names=['morning','climate','investments','learning','mentorship'];
function panel(native=true){
  const status={textContent:'',dataset:{}}, events={},messages=[],timers=new Map();
  let sequence=0;
  const buttons=names.map(mode=>({
    dataset:{mode},attributes:{},href:'piura-modes://'+mode,
    addEventListener(event,handler){this[event]=handler},
    setAttribute(key,value){this.attributes[key]=value},
    removeAttribute(key){delete this.attributes[key]}
  }));
  const root={classList:{add(){}},innerHTML:'',querySelectorAll:()=>buttons};
  const window={crypto:{randomUUID:()=>String(++sequence)},addEventListener:(name,fn)=>events[name]=fn};
  if(native)window.webkit={messageHandlers:{piura:{postMessage:value=>messages.push(value)}}};
  runInNewContext(script,{
    window,location:{origin:'https://nikolaypiura.github.io'},
    document:{querySelector:()=>status,querySelectorAll:s=>s==='[data-work-modes]'?[root]:buttons},
    setTimeout:fn=>{const id=++sequence;timers.set(id,fn);return id},
    clearTimeout:id=>timers.delete(id)
  });
  const click=index=>{let prevented=false;buttons[index].click({preventDefault(){prevented=true}});return prevented};
  return {window,buttons,root,status,messages,timers,events,click};
}
test('five distinct illustrated links; page load starts nothing',()=>{
  const p=panel();
  assert.equal(p.messages.length,0);
  assert.equal((p.root.innerHTML.match(/<a class="work-mode"/g)||[]).length,5);
  assert.equal((p.root.innerHTML.match(/<svg /g)||[]).length,5);
  for(const name of names)assert.ok(p.root.innerHTML.includes('piura-modes://'+name));
});
test('all five native buttons work and stay available while switching',()=>{
  const p=panel();
  names.forEach((name,i)=>{
    assert.equal(p.click(i),true);
    assert.equal(p.messages.at(-1).mode,name);
    assert.equal(p.messages.at(-1).preview,false);
    assert.ok(p.buttons.every(b=>!b.disabled));
  });
  assert.equal(p.messages.length,5);
  assert.equal(new Set(p.messages.map(m=>m.requestID)).size,5);
});
test('old callbacks cannot overwrite the newest request; errors release busy state',()=>{
  const p=panel();
  p.click(0);const old=p.messages[0].requestID;
  p.click(2);const current=p.messages[1].requestID;
  p.window.piuraModeFinished({requestID:old,ok:true,message:'stale'});
  assert.notEqual(p.status.textContent,'stale');
  p.window.piuraModeFinished({requestID:current,ok:false,message:'Ошибка'});
  assert.equal(p.status.dataset.state,'error');
  assert.equal(p.status.textContent,'Ошибка');
  assert.ok(p.buttons.every(b=>!b.attributes['aria-busy']));
  assert.equal(p.timers.size,0);
  p.click(4);assert.equal(p.messages.length,3);
});
test('browser uses user-initiated protocol links, timeout never claims completion',()=>{
  const p=panel(false);
  assert.equal(p.click(1),false);
  assert.match(p.buttons[1].href,/^piura-modes:\/\/climate\?request=/);
  assert.equal(p.messages.length,0);
  for(const fn of p.timers.values())fn();
  assert.notEqual(p.status.dataset.state,'ok');
  assert.ok(p.buttons.every(b=>!b.disabled&&!b.attributes['aria-busy']));
  p.click(3);assert.match(p.buttons[3].href,/learning/);
});
test('foreign origin cannot inject a success message',()=>{
  const p=panel();
  p.events.message({origin:'https://evil.example',data:{type:'piura-mode-result',message:'fake'}});
  assert.notEqual(p.status.textContent,'fake');
});
test('component is on main ERP after fund goals and before room controls',()=>{
  const html=read('piura-erp-restored 3/modules/Overview.html');
  const goals=html.indexOf('id="fundGoals"'),modes=html.indexOf('<section data-work-modes'),controls=html.indexOf('<section class="control-grid"');
  assert.ok(goals<modes&&modes<controls);
  assert.match(html,/work-modes\.js/);assert.match(read('mac/build-app.sh'),/work-modes\.css/);
});
test('native safeguards: stable IDs, bounded scripts, latest pending request, no force quit',()=>{
  assert.match(app,/window id erpID/);assert.match(app,/window id leftID/);
  assert.match(app,/pendingLaunch = \(mode, preview, id\)/);
  assert.match(app,/runDeadline/);assert.match(app,/SIGKILL/);
  assert.doesNotMatch(app,/executeAndReturnError|forceTerminate\(\)/);
  assert.match(app,/requestID == id/);
});
test('real fullscreen verification and all five recipes',()=>{
  assert.match(app,/titles: \["Window", "Full Screen Tile", "Left of Screen"\]/);
  assert.match(app,/bothFullScreen = aFull as\? Bool == true && bFull as\? Bool == true/);
  assert.match(app,/let left = a, right = b/);
  assert.match(app,/required\.allSatisfy/);
  assert.match(app,/New \\\(mode\.title\) Window/);
  const investmentList=app.split('private let investmentURLs = [')[1].split(']')[0];
  assert.equal((investmentList.match(/https:\/\/docs\.google\.com\/spreadsheets\/d\//g)||[]).length,5);
  assert.match(app,/set dark mode to true/);assert.doesNotMatch(app,/set dark mode to false/);
  assert.match(app,/workspace.setDesktopImageURL/);
  assert.match(app,/if mode.needsMusic && !startYandexMusic/);
});
test('green icon-only compact dashboard and enlarged rules without metadata',()=>{
  const p=panel(),css=read('work-modes.css'),policy=read('communication-policy.html');
  assert.doesNotMatch(p.root.innerHTML,/<strong>|Три экрана · пять режимов/);
  assert.match(css,/\.work-mode\[data-mode\]\{--tone:#63e4d3/);
  assert.equal((policy.match(/<li>/g)||[]).length,12);
  assert.doesNotMatch(policy,/<header|<footer|Кому:|11\.04\.2025|ЛИЧНЫЙ СТАНДАРТ/);
});
test('isolated reusable profiles, recoverable cleanup, fullscreen and portrait wallpapers',()=>{
  assert.match(app,/profileName\(of: \$0\) == mode.title/);
  assert.match(app,/profileSeeded-v5/);
  assert.match(app,/firstSetup \|\| existing == nil/);
  assert.match(app,/SessionBackups/);
  assert.match(app,/set oldIDs to id of every window/);
  assert.match(app,/close window id \(oldID as integer\)/);
  assert.doesNotMatch(app,/then set miniaturized of w to true|then set minimized of w to true/);
  assert.match(app,/learningERPMinimized/);
  assert.match(app,/fullScreenWindow\(of: app, on: target\)/);
  assert.match(app,/\? "-Portrait" : ""/);
  assert.doesNotMatch(app,/every desktop to set picture/);
  assert.match(app,/ethicalProgramURL/);
  assert.match(app,/tradingViewURL/);
});
test('new profiles tolerate blank URLs and preserve loading tabs before cleanup',()=>{
  assert.match(app,/if u is missing value then set u to "about:blank"/);
  assert.match(app,/desired.contains\("\/folders\/"\)/);
  assert.match(app,/desired.contains\("\/course\/"\)/);
  assert.match(app,/let loadDeadline/);
  assert.ok(app.indexOf('let loadDeadline')<app.indexOf('for offset in urls.indices.reversed()'));
  assert.match(app,/duplicates.dropFirst\(\).reversed\(\)/);
  assert.match(app,/tell desktop id \\\(displayID.uint32Value\)/);
});
