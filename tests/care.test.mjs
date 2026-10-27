import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createCareStore,CARE_RULES,FOODS} from '../src/care.mjs';
import {createCareRoutes} from '../src/care-routes.mjs';
import {startGateway} from '../src/gateway.mjs';
import {ActivityTracker} from '../src/session-status.mjs';
function fixture(t){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'whale-care-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const file=path.join(directory,'care.json');let time=Date.parse('2026-10-27T04:00:00Z'),failWrite=false;
 const options={file,now:()=>time,write:(file,state)=>{if(failWrite)throw new Error('disk full');fs.writeFileSync(file,JSON.stringify(state));}};
 const care=createCareStore(options);
 return {care,file,options,advance:ms=>time+=ms,failWrite:value=>failWrite=value,act:(action,extra={})=>care.act({action,requestId:randomUUID(),...extra})};
}
test('新档礼包只发一次；购买与喂食分别扣金币和库存，重启后保留',t=>{
 const f=fixture(t);assert.equal(f.care.view().coins,100);assert.equal(f.care.view().inventory.rice,2);
 f.act('buy',{foodId:'rice',quantity:2});assert.equal(f.care.view().coins,76);assert.equal(f.care.view().inventory.rice,4);
 const fed=f.act('feed',{foodId:'rice'});assert.equal(fed.state.inventory.rice,3);assert.equal(fed.state.satiety,85);assert.equal(fed.effect.animation,'吃白饭');
 assert.throws(()=>f.act('feed',{foodId:'snack'}),/还在吃/);
 const restored=createCareStore(f.options).view();assert.equal(restored.coins,76);assert.equal(restored.inventory.rice,3);assert.equal(restored.xp,8);
});
test('重复请求幂等；相同编号不得换操作；非法商品、数量和余额不足都不会扣款',t=>{
 const f=fixture(t),requestId=randomUUID(),input={action:'buy',foodId:'hotpot',requestId};
 f.care.act(input);const duplicate=f.care.act(input);assert.equal(duplicate.duplicate,true);assert.equal(duplicate.state.coins,65);assert.equal(duplicate.state.inventory.hotpot,1);
 assert.throws(()=>f.care.act({...input,foodId:'rice'}),/其他请求/);
 for(const input of [{foodId:'__proto__'},{foodId:'rice',quantity:-2},{foodId:'rice',quantity:1.5},{foodId:'hotpot',quantity:20}])assert.throws(()=>f.act('buy',input));
 assert.equal(f.care.view().coins,65);assert.throws(()=>f.act('reward-task'),/不支持/);
});
test('每日签到防止重复，跨北京时间零点可再次领取；回拨时钟不再发礼包',t=>{
 const f=fixture(t);f.act('checkin');assert.equal(f.care.view().coins,130);assert.throws(()=>f.act('checkin'),/已经签/);
 f.advance(12*3600000);f.act('checkin');assert.equal(f.care.view().coins,160);
 f.advance(-12*3600000);assert.throws(()=>f.act('checkin'),/已经签/);assert.equal(f.care.view().coins,160);
});
test('专注必须等待真实期限，可取消，重启后继续，单日奖励有上限',t=>{
 const f=fixture(t);f.act('focus-start');assert.throws(()=>f.act('focus-claim'),/还没到/);
 const restored=createCareStore(f.options);assert.ok(restored.view().focus);
 f.act('focus-cancel');assert.equal(f.care.view().coins,100);assert.equal(f.care.view().focus,null);
 for(let i=0;i<6;i++){f.act('focus-start');f.advance(CARE_RULES.focusMs);f.act('focus-claim');}
 assert.equal(f.care.view().coins,220);assert.throws(()=>f.act('focus-start'),/领满/);
});
test('自然衰减与满饱保护，不会把金币或心情扣到负数',t=>{
 const f=fixture(t);f.act('feed',{foodId:'rice'});f.advance(CARE_RULES.feedMs+1);f.act('feed',{foodId:'rice'});f.advance(CARE_RULES.feedMs+1);
 assert.throws(()=>f.act('feed',{foodId:'snack'}),/很饱/);assert.equal(f.care.view().inventory.snack,2);
 f.advance(72*3600000);const state=f.care.view();assert.equal(state.satiety,0);assert.equal(state.mood,20);assert.equal(state.coins,100);
});
test('任务奖励持久去重、当日封顶；历史回放、失败、重复完成事件不重复发钱',t=>{
 const f=fixture(t),tracker=new ActivityTracker(()=>{},()=>0,{onTaskComplete:key=>f.care.rewardTask(key)});
 const record=(type,turn_id)=>({type:'event_msg',payload:{type,turn_id}});
 tracker.consume('old',record('task_started','old'),{initial:true});tracker.consume('old',record('task_complete','old'));
 assert.equal(f.care.view().coins,100);
 tracker.consume('live',record('task_started','live'));tracker.consume('live',{type:'response_item',payload:{type:'message',role:'assistant',phase:'final_answer'}});tracker.consume('live',record('task_complete','live'));tracker.consume('live',record('task_complete','live'));
 assert.equal(f.care.view().coins,110);
 tracker.consume('failed',record('task_started','bad'));tracker.consume('failed',record('turn_failed','bad'));tracker.consume('failed',record('task_complete','bad'));assert.equal(f.care.view().coins,110);
 const restored=createCareStore(f.options);assert.equal(restored.rewardTask('live\0live'),false);
 for(let i=0;i<20;i++)f.care.rewardTask('task-'+i);assert.equal(f.care.view().daily.taskCoins,100);assert.equal(f.care.view().coins,200);
});
test('保存失败不会在内存中扣金币；损坏存档不会静默重置并发礼包',t=>{
 const f=fixture(t);f.failWrite(true);assert.throws(()=>f.act('buy',{foodId:'rice'}),/disk/);assert.equal(f.care.view().coins,100);assert.equal(f.care.view().inventory.rice,2);
 fs.writeFileSync(f.file,'broken');assert.throws(()=>createCareStore(f.options),/无法读取/);assert.equal(fs.readFileSync(f.file,'utf8'),'broken');
});
test('养成接口继承鉴权和跨站防护；重发喂食不会重复消费或重复播动作',async t=>{
 const f=fixture(t),effects=[];
 const careRoutes=createCareRoutes({care:f.care,playEffect:async effect=>{effects.push(effect);return {accepted:true};}});
 const token='care-test-capability-000000000000000000000';
 const gateway=await startGateway({token,runChat:async()=>'',admin:{handle:careRoutes}});t.after(()=>gateway.close());
 const base=`http://127.0.0.1:${gateway.port}`,headers={authorization:'Bearer '+token,'content-type':'application/json'};
 assert.equal((await fetch(base+'/control/care')).status,401);
 assert.equal((await fetch(base+'/control/care',{headers:{...headers,origin:'https://example.com'}})).status,403);
 const payload={action:'feed',foodId:'rice',requestId:randomUUID()};
 for(let i=0;i<2;i++){
  const response=await fetch(base+'/control/care/action',{method:'POST',headers,body:JSON.stringify(payload)});assert.equal(response.status,200);const data=await response.json();assert.equal(data.state.inventory.rice,1);assert.equal(data.duplicate,i===1);
 }
 assert.equal(effects.length,1);assert.equal(effects[0].animation,'吃白饭');
 assert.equal((await fetch(base+'/control/care/action',{method:'POST',headers,body:'{bad json'})).status,400);
});
test('每种食物的进食动作都能找到对应的本地视频',()=>{
 for(const food of FOODS)assert.ok(fs.existsSync(new URL('../vendor/dsh-pet/assets/webm/'+food.animation+'.webm',import.meta.url)),food.animation);
});

test('动作暂不可用时明确提示已保存的养成结果，避免误报动画成功',async t=>{
 const f=fixture(t),routes=createCareRoutes({care:f.care,playEffect:async()=>{throw new Error('unavailable');}});
 let status,body;const res={writeHead(value){status=value;},end(value){body=JSON.parse(value);}};
 await routes({method:'POST'},res,'/control/care/action',async()=>({action:'feed',foodId:'rice',requestId:randomUUID()}));
 assert.equal(status,200);assert.equal(body.state.inventory.rice,1);assert.match(body.warning,/动作暂未响应/);assert.equal(body.animation,null);
});