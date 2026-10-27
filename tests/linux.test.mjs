import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import http from 'node:http';
import crypto from 'node:crypto';
import {checkDesktopEnvironment,initializePetConfig,desktopRuntimeReady,activeRuntime,runtimeEndpoint,desktopEntry,sandboxProfile,shellQuote} from '../src/linux-support.mjs';
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'whale-linux-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}

test('Linux requires a desktop user and X11/XWayland; Windows remains unrestricted',()=>{
  assert.throws(()=>checkDesktopEnvironment({platform:'linux',uid:0,env:{DISPLAY:':0'}}),/sudo/);
  assert.throws(()=>checkDesktopEnvironment({platform:'linux',uid:1000,env:{}}),/图形桌面/);
  assert.throws(()=>checkDesktopEnvironment({platform:'linux',uid:1000,env:{WAYLAND_DISPLAY:'wayland-0'}}),/XWayland/);
  assert.doesNotThrow(()=>checkDesktopEnvironment({platform:'linux',uid:1000,env:{DISPLAY:':0',WAYLAND_DISPLAY:'wayland-0'}}));
  assert.doesNotThrow(()=>checkDesktopEnvironment({platform:'win32',uid:0,env:{}}));
  assert.doesNotThrow(()=>checkDesktopEnvironment({platform:'darwin',uid:0,env:{}}));
});
test('initialization preserves user configuration and care saves on repeated setup',t=>{
  const root=fixture(t);fs.mkdirSync(path.join(root,'config'));
  fs.writeFileSync(path.join(root,'config','main-config.example.jsonc'),'{"pets":[]}');
  initializePetConfig(root);
  const config=path.join(root,'data','dsh-pet','main-config.jsonc');assert.equal(fs.readFileSync(config,'utf8'),'{"pets":[]}');
  fs.writeFileSync(config,'// user preferences');fs.writeFileSync(path.join(root,'data','care-save.json'),'user save');
  initializePetConfig(root);assert.equal(fs.readFileSync(config,'utf8'),'// user preferences');assert.equal(fs.readFileSync(path.join(root,'data','care-save.json'),'utf8'),'user save');
});
test('native bootstrap selects X11 only on Linux and leaves Windows switches unchanged',()=>{
  const moduleCode=fs.readFileSync(new URL('../vendor/dsh-pet/runtime/electron-helper/linux-platform.js',import.meta.url),'utf8');
  const source=fs.readFileSync(new URL('../vendor/dsh-pet/runtime/electron-helper/main.js',import.meta.url),'utf8');
  const bootstrap=source.slice(0,source.indexOf("const path = require('node:path');"));
  for(const platform of ['linux','win32','darwin']){
    const calls=[],app={commandLine:{appendSwitch:(...args)=>calls.push(args)}};
    const module={exports:{}};vm.runInNewContext(moduleCode,{module,process:{platform}});
    vm.runInNewContext(bootstrap,{process:{platform},require:name=>{if(name==='electron')return {app};if(name==='./linux-platform.js')return module.exports;throw new Error(name);}});
    assert.deepEqual(calls,platform==='linux'?[['ozone-platform','x11']]:[]);
  }
});
test('runtime discovery refuses wrong instances and redirects without disclosing capabilities',async t=>{
  const root=fixture(t),file=path.join(root,'runtime.json');
  assert.equal(await activeRuntime(file),null);
  const state={name:'chatgpt-whale-companion',instanceId:crypto.randomUUID(),token:crypto.randomBytes(32).toString('base64url')};
  let mode='valid',requests=[];
  const server=http.createServer((req,res)=>{
    requests.push({url:req.url,authorization:req.headers.authorization});
    if(mode==='redirect'){res.writeHead(302,{location:'/unexpected'});res.end();return;}
    res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,name:'ChatGPT 桌宠桥接',instanceId:mode==='wrong'?crypto.randomUUID():state.instanceId,petReady:true}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  state.port=server.address().port;state.controlUrl='https://example.invalid/steal';fs.writeFileSync(file,JSON.stringify(state));
  const live=await activeRuntime(file);assert.equal(live.endpoint,`http://127.0.0.1:${state.port}`);assert.equal(live.health.petReady,true);
  mode='wrong';assert.equal(await activeRuntime(file),null);
  mode='redirect';assert.equal(await activeRuntime(file),null);
  assert.ok(requests.every(req=>req.url==='/health'&&req.authorization===undefined));
  assert.throws(()=>runtimeEndpoint({...state,port:'80/path'}),/无效/);
  assert.throws(()=>runtimeEndpoint({...state,token:'invalid'}),/无效/);
});
test('Linux desktop entry and AppArmor profile handle spaces without broad path grants',()=>{
  const entry=desktopEntry('/home/alice/宠物 space/%U $test','/home/alice/node/bin/node');
  assert.ok(entry.includes('%%U'));assert.ok(entry.includes('\\\\$test'));assert.ok(!entry.includes('sh -c'));
  assert.throws(()=>desktopEntry('/home/alice/bad\nExec=evil','/usr/bin/node'),/换行/);
  const profile=sandboxProfile('/home/alice/宠物 space/data/electron/electron');
  assert.match(profile.id,/^chatgpt-whale-[a-f0-9]{12}$/);assert.ok(profile.text.includes('"/home/alice/宠物 space/data/electron/electron"'));assert.ok(profile.text.includes('userns,'));
  assert.ok(!profile.text.includes('**'));assert.throws(()=>sandboxProfile('/home/*/electron'),/路径/);
  assert.throws(()=>sandboxProfile('/home/alice/"/electron'),/路径/);
  assert.equal(shellQuote("/home/it's here"),"'/home/it'\\''s here'");
});

test('Linux startup requires a renderer pose, not just backend health',async t=>{
  const root=fixture(t),file=path.join(root,'pet-runtime.json');
  assert.equal(await desktopRuntimeReady(file),false);
  fs.writeFileSync(file,JSON.stringify({port:3096,token:'x'.repeat(43)}));
  let ready=false;
  const fetchImpl=async (url,options)=>{
    assert.equal(url,'http://127.0.0.1:3096/dsh-pet-7340/pose?pet=main');
    assert.equal(options.redirect,'error');assert.equal(options.headers['x-dsh-pet-token'],'x'.repeat(43));
    return {ok:true,json:async()=>({ok:ready})};
  };
  assert.equal(await desktopRuntimeReady(file,{fetchImpl}),false);
  ready=true;assert.equal(await desktopRuntimeReady(file,{fetchImpl}),true);
  assert.equal(await desktopRuntimeReady(file,{fetchImpl:async()=>{throw new Error('renderer gone');}}),false);
});
