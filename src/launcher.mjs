import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {writePrivateJson} from './private-files.mjs';
import {findCodex,createCodexRunner} from './codex-chat.mjs';
import {startGateway,MODEL} from './gateway.mjs';
import {ActivityTracker,watchLocalSessions,createPetStatusWriter} from './session-status.mjs';
import {DASHBOARD,DASHBOARD_JS} from './dashboard.mjs';
import {createCareStore,CARE_RULES} from './care.mjs';
import {createCareRoutes} from './care-routes.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const home=path.join(root,'data');
const runtimeFile=path.join(home,'bridge-runtime.json');
const petRuntimeFile=path.join(home,'dsh-pet','standalone-runtime.json');
const preferencesFile=path.join(home,'preferences.json');
const configFile=path.join(root,'local-config.json');
const config=fs.existsSync(configFile)?JSON.parse(fs.readFileSync(configFile,'utf8')):{};
const codex=findCodex(config.codexExecutable);
const auth=spawnSync(codex,['login','status'],{encoding:'utf8',windowsHide:true,timeout:15000});
if(auth.status!==0)throw new Error('请先在 ChatGPT/Codex 客户端登录，再启动桌宠。');
let preferences={automaticWhispers:false};
try{preferences={...preferences,...JSON.parse(fs.readFileSync(preferencesFile,'utf8'))};}catch{}
const token=crypto.randomBytes(32).toString('base64url');
const instanceId=crypto.randomUUID();
const workspace=path.join(home,'chat-workspace');
fs.mkdirSync(workspace,{recursive:true});fs.mkdirSync(path.join(root,'logs'),{recursive:true});
const care=createCareStore({file:path.join(home,'care-save.json')});
const writer=createPetStatusWriter(home);
const tracker=new ActivityTracker(value=>writer.set(value),()=>Date.now(),{onTaskComplete:key=>care.rewardTask(key)});
let pet,petReady=false,stopping=false,unwatch=()=>{};
const timer=setInterval(()=>tracker.publish(),1000);
const runChat=createCodexRunner({executable:codex,cwd:workspace});
function json(res,status,value){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value));}
async function runtime(){return JSON.parse(await fsp.readFile(petRuntimeFile,'utf8'));}
async function petCall(url,{method='GET',body}={}){
  const state=await runtime();
  if(!Number.isInteger(state.port)||!/^[A-Za-z0-9_-]{43}$/.test(state.token))throw new Error('桌宠连接无效');
  const response=await fetch(`http://127.0.0.1:${state.port}${url}`,{method,headers:{'content-type':'application/json','x-dsh-pet-token':state.token},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error('桌宠设置暂时不可用');
  return response.status===204?{}:await response.json();
}
const careRoutes=createCareRoutes({care,isPetReady:()=>petReady,playEffect:async effect=>{
  const animation=await petCall('/dsh-pet-7340/anim?pet=main&surface=desktop',{method:'POST',body:{name:effect.animation}});
  if(!animation.ok)throw new Error('桌宠动作暂不可用');
  try{await petCall('/dsh-pet-7340/broadcast?pet=main&surface=desktop',{method:'POST',body:{text:effect.text,duration:CARE_RULES.feedMs,anim:false}});}catch{}
  return {accepted:true,playbackId:animation.playbackId};
}});
const gateway=await startGateway({token,runChat,onState:state=>tracker.update('pet-chat',state),getExtraHealth:()=>({pid:process.pid,instanceId,petReady,activeLocalTasks:tracker.snapshot().activeCount}),admin:{
  publicRoute(req,res,pathname){
    if(req.method==='GET'&&(pathname==='/'||pathname==='/dashboard.js')){
      res.writeHead(200,{'content-type':pathname==='/'?'text/html; charset=utf-8':'text/javascript; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"});res.end(pathname==='/'?DASHBOARD:DASHBOARD_JS);return true;
    }return false;
  },
  async handle(req,res,pathname,readBody){
    if(await careRoutes(req,res,pathname,readBody))return;
    if(pathname==='/control/state'&&req.method==='GET')return json(res,200,{petReady,automaticWhispers:preferences.automaticWhispers});
    if(pathname==='/control/preferences'&&req.method==='POST'){
      const body=await readBody();if(typeof body.automaticWhispers!=='boolean')return json(res,400,{error:{message:'碎碎念开关无效'}});
      await petCall('/standalone-ai/settings',{method:'POST',body:{automaticWhispers:body.automaticWhispers}});
      preferences={...preferences,automaticWhispers:body.automaticWhispers};writePrivateJson(preferencesFile,preferences);return json(res,200,{ok:true});
    }
    if(pathname==='/control/open-app'&&req.method==='POST'){
      if(!config.desktopExecutable||!fs.existsSync(config.desktopExecutable))return json(res,400,{error:{message:'请从任务栏打开 ChatGPT/Codex 客户端'}});
      const app=spawn(config.desktopExecutable,[],{detached:true,stdio:'ignore',windowsHide:true});app.on('error',()=>{});app.unref();return json(res,200,{ok:true});
    }
    if(pathname==='/control/quit'&&req.method==='POST'){json(res,200,{ok:true});setTimeout(()=>void shutdown(),50);return;}
    return json(res,404,{error:{message:'设置接口不存在'}});
  }
}});
const aiSettings={protocol:'openai-compatible',baseUrl:`http://127.0.0.1:${gateway.port}/v1`,model:MODEL,enabled:true,automaticWhispers:!!preferences.automaticWhispers,whisperIntervalSec:300,maxTokens:1024,timeoutMs:60000,apiKey:token};
writePrivateJson(path.join(home,'dsh-pet','standalone-ai.json'),aiSettings);
writePrivateJson(runtimeFile,{name:'chatgpt-whale-companion',pid:process.pid,instanceId,port:gateway.port,token,controlUrl:`http://127.0.0.1:${gateway.port}/#token=${token}`,startedAt:new Date().toISOString()});
const electron=config.electronExecutable;
const environment={...process.env,DSH_HOME:home,...(electron?{DSH_PET_ELECTRON_PATH:electron}:{}),NO_COLOR:'1',CHATGPT_PET_USER_DATA:path.join(home,'electron-profile'),CHATGPT_PET_CONTROL_URL:`http://127.0.0.1:${gateway.port}/#token=${token}`,CHATGPT_PET_DESKTOP_EXECUTABLE:config.desktopExecutable||''};
const out=fs.openSync(path.join(root,'logs','pet.log'),'a'),err=fs.openSync(path.join(root,'logs','pet-error.log'),'a');
pet=spawn(process.execPath,[path.join(root,'vendor','dsh-pet','lib','standalone.js'),'--port','3096'],{cwd:root,env:environment,windowsHide:true,stdio:['ignore',out,err]});
fs.closeSync(out);fs.closeSync(err);
pet.on('error',()=>{console.error('无法启动桌宠引擎');void shutdown(1);});
pet.on('exit',code=>{if(!stopping){console.error('桌宠引擎已退出：'+code);void shutdown(code||0);}});
async function shutdown(code=0){
  if(stopping)return;stopping=true;clearInterval(timer);unwatch();writer.close();
  try{await petCall('/shutdown',{method:'POST'});}catch{}
  if(pet?.exitCode===null){await new Promise(resolve=>{const limit=setTimeout(()=>{pet.kill();resolve();},4000);pet.once('exit',()=>{clearTimeout(limit);resolve();});});}
  await gateway.close();
  try{const saved=JSON.parse(fs.readFileSync(runtimeFile,'utf8'));if(saved.instanceId===instanceId)fs.rmSync(runtimeFile);}catch{}
  process.exitCode=code;
}
process.on('SIGINT',()=>void shutdown());process.on('SIGTERM',()=>void shutdown());
try{
  let lastError;
  for(let attempt=0;attempt<80&&!stopping;attempt++){
    try{const state=await runtime();if(state.pid===pet.pid){const health=await fetch(`http://127.0.0.1:${state.port}/health`,{signal:AbortSignal.timeout(1500)});if(health.ok){petReady=true;break;}}}catch(error){lastError=error;}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  if(!petReady)throw lastError||new Error('桌宠启动超时');
  unwatch=await watchLocalSessions(path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'sessions'),tracker);
  console.log('ChatGPT 鲸鱼娘已启动；原有动画与菜单由原桌宠引擎运行。');
  console.log('聊天使用已登录账号；自动碎碎念：'+(preferences.automaticWhispers?'开启':'关闭'));
}catch(error){console.error(error.message);await shutdown(1);}