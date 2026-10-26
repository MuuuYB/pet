import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {ActivityTracker,watchLocalSessions} from '../src/session-status.mjs';

test('多个工作任务并行时，完成一个不会让另一个错误地显示空闲',()=>{
 let now=100;const tracker=new ActivityTracker(()=>{},()=>now);
 tracker.consume('a',{type:'event_msg',payload:{type:'task_started'}});tracker.consume('b',{type:'event_msg',payload:{type:'task_started'}});
 tracker.consume('a',{type:'event_msg',payload:{type:'task_complete',last_agent_message:'敏感内容不会进入状态文案'}});
 assert.equal(tracker.snapshot().state,'thinking');assert.equal(tracker.snapshot().activeCount,1);assert.doesNotMatch(tracker.snapshot().task,/敏感/);
 tracker.consume('b',{type:'event_msg',payload:{type:'task_complete'}});assert.equal(tracker.snapshot().state,'success');now+=7000;assert.equal(tracker.snapshot().state,null);
});

test('启动时重放已有完成记录不会弹出虚假的任务完成提示',()=>{
 const changes=[];const tracker=new ActivityTracker(value=>changes.push(value));
 tracker.consume('old',{type:'event_msg',payload:{type:'task_started'}},{initial:true});
 tracker.consume('old',{type:'event_msg',payload:{type:'task_complete'}},{initial:true});tracker.publish();
 assert.deepEqual(changes,[{state:null,task:null,activeCount:0}]);
});

test('会话日志分段追加可以合并，停止监听后不再改变状态',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'whale-status-'));const now=new Date(),folder=path.join(root,String(now.getFullYear()),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0'));
 await fs.mkdir(folder,{recursive:true});const file=path.join(folder,'rollout-test.jsonl');await fs.writeFile(file,'');
 const tracker=new ActivityTracker();const stop=await watchLocalSessions(root,tracker);
 try{
  await fs.appendFile(file,'{"type":"event_msg","payload":{"type":"task_');await new Promise(r=>setTimeout(r,100));assert.equal(tracker.snapshot().state,null);
  await fs.appendFile(file,'started"}}\n');
  for(let i=0;i<50&&tracker.snapshot().state!=='thinking';i++)await new Promise(r=>setTimeout(r,30));assert.equal(tracker.snapshot().state,'thinking');
  await fs.appendFile(file,JSON.stringify({type:'event_msg',payload:{type:'task_complete'}})+'\n');
  for(let i=0;i<50&&tracker.snapshot().state!=='success';i++)await new Promise(r=>setTimeout(r,30));assert.equal(tracker.snapshot().state,'success');
 } finally {stop();await fs.rm(root,{recursive:true,force:true});}
});