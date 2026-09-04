import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
test('four office colors use 100% lighting, serialize and deduplicate pending requests',async()=>{
  const calls=[],attributes={},listeners={},window={};
  const controller={piuraSetOfficeColor:async(...args)=>{calls.push(args);return [{source:'test',ok:true}]}};
  const document={documentElement:{dataset:attributes},addEventListener:(name,fn)=>listeners[name]=fn,
    createElement:()=>({contentWindow:controller,remove(){}}),body:{append(node){node.onload()}}};
  const context={window,document,URL,MutationObserver:class{observe(){}},location:{href:'https://example.com/ERPNIKOLAY/'},crypto:{randomUUID:()=>String(Math.random())},performance,setTimeout,clearTimeout};
  const script=read('office-modes.js');runInNewContext(script,context);
  assert.equal(calls.length,0);
  for(const [mode,color] of Object.entries({morning:'#39ff00',work:'#a600ff',learning:'#ff8000',mentorship:'#00e5df'})){
    window.piuraSetOfficeMode(mode);window.piuraSetOfficeMode(mode);
    await new Promise(setImmediate);
    assert.deepEqual(calls.at(-1),[color,100]);
    assert.equal(window.piuraOfficeLighting.status,'done');
    assert.equal(window.piuraOfficeLighting.brightness,100);
  }
  assert.equal(calls.length,4);
  const state=window.piuraOfficeLighting;
  runInNewContext(script,context);assert.equal(window.piuraOfficeLighting,state,'a duplicate script must not reset pending/completed lighting');
  window.piuraSetOfficeMode('investments');await new Promise(setImmediate);
  assert.equal(window.piuraOfficeLighting.mode,'work');
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
test('wallpaper all-Spaces transformation preserves unrelated preferences',{skip:process.platform!=='darwin'},()=>{
  const dir=mkdtempSync(join(tmpdir(),'piura-wallpaper-unit-')),bin=join(dir,'test');
  try {
    const compile=spawnSync('swiftc',[new URL('mac/WallpaperStore.swift',root).pathname,new URL('tests/WallpaperStoreTests.swift',root).pathname,'-o',bin],{encoding:'utf8'});
    assert.equal(compile.status,0,compile.stderr);
    const run=spawnSync(bin,[],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
  } finally {rmSync(dir,{recursive:true,force:true})}
});
