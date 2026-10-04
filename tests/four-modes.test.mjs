import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
test('office colors use full brightness, serialize requests and support scheduled power-off',async()=>{
  const calls=[],attributes={},listeners={},window={};
  const controller={piuraSetOfficeColor:async(...args)=>{calls.push(args);return [{source:'test',ok:true}]},piuraSetOfficePower:async(...args)=>{calls.push(args);return [{source:'test',ok:true}]}};
  const document={documentElement:{dataset:attributes},addEventListener:(name,fn)=>listeners[name]=fn,
    createElement:()=>({contentWindow:controller,remove(){}}),body:{append(node){node.onload()}}};
  const context={window,document,URL,MutationObserver:class{observe(){}},location:{href:'https://example.com/ERPNIKOLAY/'},crypto:{randomUUID:()=>String(Math.random())},performance,setTimeout,clearTimeout};
  const script=read('office-modes.js');runInNewContext(script,context);
  assert.equal(calls.length,0);
  const colors={morning:'#39ff00',work:'#a600ff',learning:'#ff8000',mentorship:'#00e5df',weekday1:'#42d8a7',weekday2:'#4f8ef7',weekday3:'#9a72ed',weekday4:'#ffad4f',weekday5:'#ff5f98'};
  for(const [mode,color] of Object.entries(colors)){
    window.piuraSetOfficeMode(mode);window.piuraSetOfficeMode(mode);
    await new Promise(setImmediate);
    const brightness=100;
    assert.deepEqual(calls.at(-1),[color,brightness]);
    assert.equal(window.piuraOfficeLighting.status,'done');
    assert.equal(window.piuraOfficeLighting.brightness,brightness);
  }
  assert.equal(calls.length,Object.keys(colors).length);
  const state=window.piuraOfficeLighting;
  runInNewContext(script,context);assert.equal(window.piuraOfficeLighting,state,'a duplicate script must not reset pending/completed lighting');
  window.piuraSetOfficeMode('investments');await new Promise(setImmediate);
  assert.equal(window.piuraOfficeLighting.mode,'work');
  window.piuraSetOfficePower('off');window.piuraSetOfficePower('off');await new Promise(setImmediate);
  assert.equal(window.piuraOfficeLighting.status,'power-done');
  assert.equal(window.piuraOfficeLighting.power,'off');
  assert.deepEqual(calls.at(-1),['off']);
});
test('music morning skin is reversible, does not reload or toggle playback',()=>{
  const script=read('mac/resources/music-appearance.js');let element;
  const context={PIURA_MODE:'morning',document:{body:{},querySelector:()=>({}),getElementById:()=>element,createElement:()=>({remove(){element=undefined}}),head:{append(x){element=x}}},getComputedStyle:()=>({getPropertyValue:()=>'#fff',backgroundColor:'rgb(251, 253, 249)'})};
  assert.equal(JSON.parse(runInNewContext(script,context)).light,true);
  assert.match(element.textContent,/background-color:#fff/);
  context.PIURA_MODE='work';runInNewContext(script,context);assert.equal(element,undefined);
  assert.doesNotMatch(script,/\.click\(|\.play\(|\.pause\(|location\.reload|filter:invert/);
  assert.match(read('mac/PIURAModes.swift'),/mode == .morning \? 25 : 40/);
});
test('wallpaper all-Spaces transformation preserves unrelated preferences',{skip:process.platform!=='darwin'},t=>{
  const dir=mkdtempSync(join(tmpdir(),'piura-wallpaper-unit-')),bin=join(dir,'test');
  try {
    const compile=spawnSync('swiftc',[new URL('mac/WallpaperStore.swift',root).pathname,new URL('tests/WallpaperStoreTests.swift',root).pathname,'-o',bin],{encoding:'utf8'});
    if(compile.status===69&&/license agreements/i.test(compile.stderr)){t.skip('Xcode license is not accepted on this Mac');return}
    assert.equal(compile.status,0,compile.stderr);
    const run=spawnSync(bin,[],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
  } finally {rmSync(dir,{recursive:true,force:true})}
});
