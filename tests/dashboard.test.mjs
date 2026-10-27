import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DASHBOARD_JS} from '../src/dashboard.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function dashboard(initial,{postError=false,holdPost=false}={}){
  let state=initial,posts=0,finishPost;
  const elements=new Map(['status','whisper-status','whispers','result','test','open','quit'].map(id=>[id,{textContent:'',disabled:id==='whispers',dataset:{},attributes:{},setAttribute(key,value){this.attributes[key]=value;}}]));
  const callbacks={};
  const context=vm.createContext({
    location:{hash:'#token=local-test-capability',pathname:'/'},history:{replaceState(){}},URLSearchParams,AbortSignal,
    document:{hidden:false,getElementById:id=>elements.get(id)},
    window:{addEventListener:(name,callback)=>callbacks[name]=callback},setInterval:callback=>callbacks.poll=callback,
    fetch:async(path,options)=>{
      if(path==='/control/state')return {ok:true,json:async()=>({petReady:true,automaticWhispers:state})};
      assert.equal(path,'/control/preferences');++posts;
      if(holdPost)await new Promise(resolve=>finishPost=resolve);
      if(postError)return {ok:false,json:async()=>({error:{message:'模拟保存失败'}})};
      state=JSON.parse(options.body).automaticWhispers;
      return {ok:true,json:async()=>({ok:true})};
    },
  });
  new vm.Script(DASHBOARD_JS).runInContext(context);await tick();
  return {el:id=>elements.get(id),callbacks,posts:()=>posts,setState:value=>state=value,release:()=>finishPost?.()};
}
test('设置页加载真实开关值并在保存后明确确认，保存期间防止重复提交',async()=>{
  for(const initial of [true,false]){
    const page=await dashboard(initial,{holdPost:true});
    assert.equal(page.el('whispers').attributes['aria-checked'],String(initial));
    assert.match(page.el('whisper-status').textContent,initial?/已开启/:/已关闭/);
    const saving=page.el('whispers').onclick();await tick();
    assert.equal(page.el('whispers').disabled,true);
    await page.el('whispers').onclick();assert.equal(page.posts(),1);
    page.release();await saving;
    assert.equal(page.el('whispers').attributes['aria-checked'],String(!initial));
    assert.equal(page.el('whispers').disabled,false);
    assert.match(page.el('result').textContent,initial?/已保存.*已关闭/:/已保存.*已开启/);
  }
});
test('保存失败重新读取实际值，页面回到前台时同步外部修改',async()=>{
  const page=await dashboard(true,{postError:true});
  await page.el('whispers').onclick();
  assert.match(page.el('result').textContent,/切换失败/);
  assert.match(page.el('whisper-status').textContent,/已开启/);
  assert.equal(page.el('whispers').disabled,false);
  page.setState(false);page.callbacks.focus();await tick();
  assert.match(page.el('whisper-status').textContent,/已关闭/);
});
test('读不到有效状态时显示未知并禁用切换，避免误报关闭',async()=>{
  const page=await dashboard(undefined);
  assert.match(page.el('whisper-status').textContent,/状态读取失败/);
  assert.equal(page.el('whispers').disabled,true);
  await page.el('whispers').onclick();assert.equal(page.posts(),0);
});

test('右键菜单区分手动触发与自动状态，每次打开刷新，失败时显示未知',async()=>{
  let state=true,fail=false,readCount=0,labels=[];
  const context=vm.createContext({navigator:{platform:'Win32'},window:{__dshPetDebug:{},petBridge:{getCompanionState:async()=>{++readCount;if(fail)throw new Error('offline');return {automaticWhispers:state};}}},OPEN_TARGET:'site',S:{
    displayMenuBranch:()=>({label:'显示位置'}),buildMoreBranch:()=>null,buildMenuTree:()=>[],
    mountContextMenu:({tree})=>{labels=tree.map(item=>({textContent:item.label,isConnected:true}));return {el:{querySelectorAll:()=>labels},close(){for(const label of labels)label.isConnected=false;}};},
  }});
  const file=new URL('../vendor/dsh-pet/runtime/electron-helper/sprite.js',import.meta.url);
  vm.runInContext(fs.readFileSync(file,'utf8')+'\nglobalThis.TestSprite=PetSprite;',context);
  const sprite=Object.create(context.TestSprite.prototype);
  Object.assign(sprite,{dragState:{active:false,dragging:false},justDragged:false,menuOpen:false,animations:{},menuItems:[],stopThrow(){},stopMove(){},setInteractive(){},syncInputBusy(){},syncInputRegions(){},visibleClampRect:()=>null,inputBusy:()=>false});
  const open=async()=>{sprite.onContextMenu({preventDefault(){},clientX:20,clientY:20});await tick();return labels.map(label=>label.textContent);};
  let menu=await open();assert.ok(menu.includes('手动说一句'));assert.ok(menu.includes('自动碎碎念：已开启'));
  sprite.closeMenu();state=false;menu=await open();assert.ok(menu.includes('自动碎碎念：已关闭'));
  sprite.closeMenu();fail=true;menu=await open();assert.ok(menu.includes('自动碎碎念：状态未知'));assert.equal(readCount,3);
});