import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const script=read('work-modes.js'), app=read('mac/PIURAModes.swift');
const names=['morning','work','learning','mentorship'];
const buttonSpecs=[
  {mode:'morning'},
  {mode:'learning'},
  {mode:'work',day:'1',dayName:'Понедельник',focus:'Климат'},
  {mode:'work',day:'2',dayName:'Вторник',focus:'Инвестиции'},
  {mode:'work',day:'3',dayName:'Среда',focus:'Климат'},
  {mode:'work',day:'4',dayName:'Четверг',focus:'Админ'},
  {mode:'work',day:'5',dayName:'Пятница',focus:'Фонды'},
  {mode:'mentorship',day:'6',dayName:'Суббота',focus:'Наставничество'},
  {mode:'mentorship',day:'0',dayName:'Воскресенье',focus:'Наставничество'}
];
function panel(native=true){
  const status={textContent:'',dataset:{}}, events={},messages=[],timers=new Map();
  let sequence=0;
  const buttons=buttonSpecs.map(spec=>({
    dataset:{...spec},attributes:{},href:'piura-modes://'+spec.mode,
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
test('seven daily links plus small morning and learning shortcuts; page load starts nothing',()=>{
  const p=panel();
  assert.equal(p.messages.length,0);
  assert.equal((p.root.innerHTML.match(/<a class="work-mode(?:\s|")/g)||[]).length,7);
  assert.equal((p.root.innerHTML.match(/<svg /g)||[]).length,7);
  assert.equal((p.root.innerHTML.match(/piura-modes:\/\/work/g)||[]).length,5);
  assert.equal((p.root.innerHTML.match(/piura-modes:\/\/mentorship/g)||[]).length,2);
  assert.match(p.root.innerHTML,/morning-shortcut[^>]+piura-modes:\/\/morning/);
  assert.match(p.root.innerHTML,/learning-shortcut[^>]+piura-modes:\/\/learning/);
  assert.match(p.root.innerHTML,/Только инвестиции и решения по капиталу/);
});
test('all nine weekly controls work and stay available while switching',()=>{
  const p=panel();
  buttonSpecs.forEach((spec,i)=>{
    assert.equal(p.click(i),true);
    assert.equal(p.messages.at(-1).mode,spec.mode);
    assert.equal(p.messages.at(-1).preview,false);
    assert.ok(p.buttons.every(b=>!b.disabled));
  });
  assert.equal(p.messages.length,9);
  assert.equal(new Set(p.messages.map(m=>m.requestID)).size,9);
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
  assert.equal(p.timers.size,1); // The nonblocking error toast expires.
  p.click(3);assert.equal(p.messages.length,3);
});
test('browser uses user-initiated protocol links, timeout never claims completion',()=>{
  const p=panel(false);
  assert.equal(p.click(2),false);
  assert.match(p.buttons[2].href,/^piura-modes:\/\/work\?request=/);
  assert.equal(p.messages.length,0);
  for(const fn of p.timers.values())fn();
  assert.notEqual(p.status.dataset.state,'ok');
  assert.ok(p.buttons.every(b=>!b.disabled&&!b.attributes['aria-busy']));
  p.click(2);assert.match(p.buttons[2].href,/work/);
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
test('real fullscreen verification and all four recipes',()=>{
  assert.match(app,/titles: \["Window", "Full Screen Tile", "Left of Screen"\]/);
  assert.match(app,/bothFullScreen = aFull as\? Bool == true && bFull as\? Bool == true/);
  assert.match(app,/let left = a, right = b/);
  assert.match(app,/required\.allSatisfy/);
  assert.match(app,/New \\\(mode\.safariProfile\) Window/);
  const investmentList=app.split('private let investmentURLs = [')[1].split(']')[0];
  assert.equal((investmentList.match(/https:\/\/docs\.google\.com\/spreadsheets\/d\//g)||[]).length,5);
  assert.match(app,/set dark mode to true/);assert.doesNotMatch(app,/set dark mode to false/);
  assert.match(app,/private func finishDesktopWallpaper/);
  assert.match(app,/synchronizeWallpaperSpaces/);
  const runMode=app.slice(app.indexOf('private func runMode'),app.indexOf('private func display'));
  assert.doesNotMatch(runMode,/controlYandexMusic/);
});
test('green weekly dashboard and enlarged rules without metadata',()=>{
  const p=panel(),css=read('work-modes.css'),policy=read('communication-policy.html');
  assert.match(p.root.innerHTML,/Понедельник/);
  assert.match(p.root.innerHTML,/Пятница/);
  assert.doesNotMatch(p.root.innerHTML,/work-modes-head|work-mode-name|>Режим недели<|>Среда · Климат</);
  assert.doesNotMatch(p.root.innerHTML,/>Понедельник<|>Вторник<|>Среда<|>Четверг<|>Пятница</);
  assert.match(css,/grid-template-columns:repeat\(7/);
  assert.equal((policy.match(/<li>/g)||[]).length,12);
  assert.doesNotMatch(policy,/<header|<footer|Кому:|11\.04\.2025|ЛИЧНЫЙ СТАНДАРТ/);
});
test('ERP music card controls authenticated My Wave through the invisible native bridge',()=>{
  const html=read('piura-erp-restored 3/modules/Overview.html'),controller=read('music-controller.js'),index=read('index.html');
  assert.ok(html.indexOf('home-controls-card')<html.indexOf('id="musicCard"'));
  assert.ok(html.indexOf('id="musicCard"')<html.indexOf('id="fanCard"'));
  assert.match(html,/music-controller\.js/);
  assert.match(index,/id="erpMusicFrame"/);
  assert.match(index,/piura-modes:\/\/music\?action=/);
  assert.match(index,/postMusic\('wave'\)/);
  assert.match(index,/postMusic\('pause'\)/);
  assert.match(index,/delta<0\?'previous':'next'/);
  assert.doesNotMatch(index,/MUSIC_QUEUE|PLAY_QUEUE|bandlink-wiki/);
  assert.match(app,/['"]wave['"]/);
  assert.match(app,/моя волна/);
  assert.match(controller,/piuraMusicCommand/);
  assert.doesNotMatch(controller,/piura-modes:\/\/music|messageHandlers|webkit/);
  assert.doesNotMatch(html,/id="musicVolume"/);
  assert.doesNotMatch(html,/music-kicker|id="musicTitle"|Готово к воспроизведению|Управление без перехода/);
  assert.doesNotMatch(controller,/volume|send\('volume'/i);
  assert.match(app,/var needsMusic: Bool \{ self == \.morning \|\| self == \.work \}/);
  const runMode=app.slice(app.indexOf('private func runMode'),app.indexOf('private func closeRegularApplications'));
  assert.doesNotMatch(runMode,/controlYandexMusic/);
});

test('music card sends transport commands to the ERP iframe controller and paints real state',()=>{
  const source=read('music-controller.js'),commands=[],events={};
  const classes=new Set();
  const classList={toggle(name,on){if(on)classes.add(name);else classes.delete(name)},add:name=>classes.add(name),remove:name=>classes.delete(name)};
  const makeButton=action=>({dataset:{musicAction:action},disabled:false,innerHTML:'',attributes:{},addEventListener(name,fn){this[name]=fn},setAttribute(name,value){this.attributes[name]=value}});
  const buttons=['previous','toggle','next'].map(makeButton);
  const artist={textContent:'Исполнитель'},status={textContent:''};
  const card={classList,querySelectorAll:()=>buttons};
  const byID={musicCard:card,musicArtist:artist,musicPlay:buttons[1],musicStatus:status};
  const parent={piuraMusicCommand:value=>commands.push(value),piuraMusicSnapshot:()=>({status:'IDLE'})};
  const window={parent,addEventListener:(name,fn)=>events[name]=fn};
  const document={activeElement:null,getElementById:id=>byID[id]};
  runInNewContext(source,{window,document,location:{origin:'https://nikolaypiura.github.io',href:''}});
  buttons[1].click();
  assert.equal(commands[0],'toggle');
  events.message({origin:'https://nikolaypiura.github.io',data:{type:'piura-music-state',status:'PLAYING',currentTrack:{subtitle:'Исполнитель теста'}}});
  assert.equal(artist.textContent,'Исполнитель теста');
  assert.ok(classes.has('is-playing'));
  assert.equal(buttons[1].attributes['aria-label'],'Поставить музыку на паузу');
});
test('isolated reusable profiles, recoverable cleanup, fullscreen and portrait wallpapers',()=>{
  assert.match(app,/profileName\(of: \$0\) == mode.safariProfile/);
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
  assert.match(app,/CGDisplayCreateUUIDFromDisplayID/);
});
test('repeat launches reuse windows and preserve exact split before any retile',()=>{
  const running=app.slice(app.indexOf('private func runningApplication'),app.indexOf('private func activateAndDismissMenus'));
  assert.ok(running.indexOf('return existing')<running.indexOf('workspace.openApplication'));
  const split=app.slice(app.indexOf('private func arrangeTelegramSplitView'),app.indexOf('private func moveWindowToDisplay'));
  assert.ok(split.indexOf('telegramSplitIsExact')<split.indexOf('moveWindowToDisplay'));
  assert.match(app,/"durationSeconds"/);assert.match(app,/"timings"/);
  assert.match(app,/selected: erpWindow/);assert.match(app,/selected: leftWindow/);
  assert.doesNotMatch(app,/set bounds of window id (erpID|leftID)/);
});
test('companion apps, learning exception and selective wallpapers',()=>{
  assert.match(app,/mode.needsZoom.*keep.insert\("us.zoom.xos"\)/);
  assert.match(app,/var needsTelegram: Bool \{ self == \.work \|\| self == \.mentorship \}/);
  assert.match(app,/var needsZoom: Bool \{ self == \.mentorship \}/);
  assert.doesNotMatch(app,/mode == \.work.*com\.apple\.Notes/);
  assert.match(app,/case .learning:.*theme=light/);
  for(const file of ['Learning-Left','Mentorship-Center','Mentorship-Right']) assert.match(app,new RegExp(file));
});
test('successful status disappears and mode colors can change ERP without reloading',()=>{
  const p=panel();p.click(1);p.window.piuraModeFinished({ok:true,message:'Режим климат включён.'});
  assert.equal(p.status.textContent,'');
  const shell=read('index.html');
  assert.match(shell,/window.piuraApplyWorkMode=mode/);
  assert.match(shell,/if\(current\[0\]!==appearance.module\)selectModule/);
  assert.match(shell,/history.replaceState\(null,'',url\)/);
  for(const mode of names)assert.match(shell,new RegExp(mode+':\\{module:'));
});
