import test from 'node:test';
import assert from 'node:assert/strict';
import {startGateway,MODEL} from '../src/gateway.mjs';
const token='test-local-capability-000000000000000000000';
const message={model:MODEL,messages:[{role:'user',content:'你好'}]};
const headers={authorization:'Bearer '+token,'content-type':'application/json'};

test('本机聊天接口验证授权、消息结构及流式中文回复',async t=>{
  const captured=[];
  const gateway=await startGateway({token,runChat:async messages=>{captured.push(messages);return '主人你好呀～🐋';}});
  t.after(()=>gateway.close());const base=`http://127.0.0.1:${gateway.port}`;
  let response=await fetch(base+'/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(message)});
  assert.equal(response.status,401);assert.equal(captured.length,0);
  response=await fetch(base+'/v1/chat/completions',{method:'POST',headers:{...headers,origin:'https://example.com'},body:JSON.stringify(message)});
  assert.equal(response.status,403);assert.equal(captured.length,0);
  response=await fetch(base+'/v1/chat/completions',{method:'POST',headers,body:JSON.stringify({...message,messages:[{role:'tool',content:'test'}]})});
  assert.equal(response.status,400);assert.equal(captured.length,0);
  response=await fetch(base+'/v1/chat/completions',{method:'POST',headers,body:JSON.stringify({...message,stream:true})});
  const stream=await response.text();assert.equal(response.status,200);assert.match(stream,/主人你好呀～🐋/);assert.match(stream,/\[DONE\]/);assert.deepEqual(captured[0],message.messages);
  response=await fetch(base+'/health');const health=await response.json();assert.equal(health.busy,false);assert.equal('token' in health,false);
});

test('关闭聊天连接会取消模型请求，并释放忙碌状态',async t=>{
  let enteredResolve,cancelledResolve;const entered=new Promise(r=>enteredResolve=r),cancelled=new Promise(r=>cancelledResolve=r);
  const gateway=await startGateway({token,runChat:async(_messages,{signal})=>{enteredResolve();return await new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{cancelledResolve();reject(new Error('cancelled'));},{once:true}));}});
  t.after(()=>gateway.close());const base=`http://127.0.0.1:${gateway.port}`,controller=new AbortController();
  const responsePromise=fetch(base+'/v1/chat/completions',{method:'POST',headers,body:JSON.stringify({...message,stream:true}),signal:controller.signal});
  await entered;await responsePromise;
  const busy=await fetch(base+'/v1/chat/completions',{method:'POST',headers,body:JSON.stringify(message)});assert.equal(busy.status,409);
  controller.abort();await Promise.race([cancelled,new Promise((_r,reject)=>setTimeout(()=>reject(new Error('取消未传递')),2000))]);
  await new Promise(resolve=>setTimeout(resolve,30));const health=await (await fetch(base+'/health')).json();assert.equal(health.busy,false);
});

test('模型故障返回明确失败，不伪造成功回复',async t=>{
 const gateway=await startGateway({token,runChat:async()=>{throw new Error('ChatGPT 登录已失效');}});t.after(()=>gateway.close());
 const response=await fetch(`http://127.0.0.1:${gateway.port}/v1/chat/completions`,{method:'POST',headers,body:JSON.stringify(message)});
 assert.equal(response.status,502);assert.match((await response.json()).error.message,/登录已失效/);
});