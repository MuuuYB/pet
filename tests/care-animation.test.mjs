import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('进食中的显式动画优先，自动工作状态延后到播放结束再恢复',()=>{
 const context=vm.createContext({navigator:{platform:'Win32'},console});
 vm.runInContext(fs.readFileSync(new URL('../vendor/dsh-pet/runtime/electron-helper/sprite.js',import.meta.url),'utf8')+'\nglobalThis.TestSprite=PetSprite;',context);
 vm.runInContext(fs.readFileSync(new URL('../vendor/dsh-pet/runtime/electron-helper/events.js',import.meta.url),'utf8'),context);
 const sprite=Object.create(context.TestSprite.prototype);
 Object.assign(sprite,{pet:{workStatusEnabled:true},playback:'feeding-test',prevWorkTick:0,dragState:{active:false},frozen:false});
 sprite.onWorkTick({state:'working'},1);sprite.onWorkTick({state:'success'},2);
 assert.equal(sprite.playback,'feeding-test');assert.equal(sprite.prevWorkTick,0);assert.equal(sprite.pendingWorkTick.snapshot.state,'success');
 const events=[];sprite.reportPlayback=(id,state)=>events.push([id,state]);sprite.onWorkTick=(snapshot,tick)=>events.push([snapshot.state,tick]);
 sprite.handleEnded();assert.equal(sprite.playback,null);assert.equal(sprite.pendingWorkTick,null);
 assert.deepEqual(events,[['feeding-test','ended'],['success',2]]);
});