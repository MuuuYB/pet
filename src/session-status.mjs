import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const STATE_TEXT={thinking:'ChatGPT 正在思考',working:'ChatGPT 正在处理任务',result:'ChatGPT 已完成一个步骤',waiting:'ChatGPT 需要你确认',success:'ChatGPT 任务完成啦',error:'ChatGPT 任务遇到问题'};
export class ActivityTracker {
  constructor(onChange=()=>{},now=()=>Date.now(),{onTaskComplete=()=>{}}={}){this.onTaskComplete=onTaskComplete;this.rewardTurns=new Map();this.onChange=onChange;this.now=now;this.active=new Map();this.lastOutcome=null;this.previous='';}
  update(id,state,{initial=false}={}){
    if(state==='success'||state==='error'){
      this.active.delete(id);
      if(!initial)this.lastOutcome={state,until:this.now()+(state==='error'?12000:6500)};
    }else if(state==='idle')this.active.delete(id);
    else this.active.set(id,{state,at:this.now()});
    if(!initial)this.publish();
  }
  consume(id,record,{initial=false}={}){
    const p=record?.payload;
    if(record?.type==='event_msg'&&p?.type==='task_started'){
      this.rewardTurns.set(id,{key:id+'\0'+String(p.turn_id||record.timestamp||crypto.randomUUID()),eligible:!initial,completed:false});
    }
    if(record?.type==='event_msg'&&p?.type==='task_complete'){
      const turn=this.rewardTurns.get(id);
      if(turn&&!initial&&turn.eligible&&!turn.completed){
        turn.completed=true;
        try{this.onTaskComplete(turn.key);}catch{ /* A save failure must not disrupt task status watching. */ }
      }
    }
    if(record?.type==='event_msg'&&['turn_aborted','turn_failed','error'].includes(p?.type))this.rewardTurns.delete(id);
    if(record?.type==='event_msg'){
      if(p?.type==='task_started')this.update(id,'thinking',{initial});
      else if(p?.type==='task_complete')this.update(id,'success',{initial});
      else if(p?.type==='turn_aborted')this.update(id,'idle',{initial});
      else if(['turn_failed','error'].includes(p?.type))this.update(id,'error',{initial});
      else if(['approval_request','approval_requested','request_user_input'].includes(p?.type))this.update(id,'waiting',{initial});
    } else if(record?.type==='response_item'&&this.active.has(id)){
      if(['function_call','custom_tool_call'].includes(p?.type))this.update(id,'working',{initial});
      else if(p?.type==='message'&&p.role==='assistant'&&p.phase==='final_answer')this.update(id,'success',{initial});
    }
  }
  snapshot(){
    for(const [id,item] of this.active)if(this.now()-item.at>30*60*1000)this.active.delete(id);
    const priority=['waiting','error','working','thinking','result'];
    let state=priority.find(s=>[...this.active.values()].some(item=>item.state===s));
    if(!state&&this.lastOutcome?.until>this.now())state=this.lastOutcome.state;
    return {state:state||null,task:state?(STATE_TEXT[state]||'ChatGPT 正在工作'):null,activeCount:this.active.size};
  }
  publish(){const value=this.snapshot(),key=JSON.stringify(value);if(key!==this.previous){this.previous=key;this.onChange(value);}}
}

export async function watchLocalSessions(root,tracker,{now=()=>Date.now(),maxInitialAgeMs=30*60*1000}={}){
  const offsets=new Map();const chains=new Map();let disposed=false;
  function safeFile(relative){const file=path.resolve(root,relative);return file.startsWith(path.resolve(root)+path.sep)&&file.endsWith('.jsonl')?file:null;}
  async function consume(file,initial=false){
    let stat;try{stat=await fsp.stat(file);}catch{return;}
    if(!stat.isFile())return;
    let item=offsets.get(file);
    if(item&&stat.size<item.offset)item=null;
    const offset=item?.offset ?? Math.max(0,stat.size-4*1024*1024);
    if(stat.size===offset)return;
    const handle=await fsp.open(file,'r');let buffer;
    try{buffer=Buffer.alloc(Math.min(stat.size-offset,4*1024*1024));await handle.read(buffer,0,buffer.length,stat.size-buffer.length);}finally{await handle.close();}
    let text=(item?.tail||'')+buffer.toString('utf8');
    if(!item&&offset>0)text=text.slice(text.indexOf('\n')+1);
    const lines=text.split('\n'),tail=lines.pop()||'';
    offsets.set(file,{offset:stat.size,tail:tail.slice(0,128000)});
    const fresh=stat.mtimeMs>=now()-maxInitialAgeMs;
    if(initial&&!fresh)return;
    for(const line of lines){let record;try{record=JSON.parse(line);}catch{continue;}
      // No prompt, answer or tool argument is copied to the pet or bridge logs.
      tracker.consume(file,record,{initial});
    }
  }
  function enqueue(file,initial=false){
    const next=(chains.get(file)||Promise.resolve()).then(()=>disposed?undefined:consume(file,initial)).catch(()=>{});
    chains.set(file,next);next.finally(()=>{if(chains.get(file)===next)chains.delete(file);});return next;
  }
  async function recentFiles(){
    const result=[];
    for(let day=0;day<3;day++){
      const date=new Date(now()-day*86400000),directory=path.join(root,String(date.getFullYear()),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0'));
      let entries;try{entries=await fsp.readdir(directory,{withFileTypes:true});}catch{continue;}
      for(const entry of entries)if(entry.isFile()&&entry.name.endsWith('.jsonl'))result.push(path.join(directory,entry.name));
    }
    return result;
  }
  if(fs.existsSync(root))await Promise.all((await recentFiles()).map(file=>enqueue(file,true)));
  tracker.publish();
  let watcher;
  try{watcher=fs.watch(root,{recursive:true},(_event,relative)=>{if(!relative)return;const file=safeFile(String(relative));if(file)void enqueue(file,false);});watcher.on('error',()=>{});}catch{}
  const poll=setInterval(async()=>{if(disposed)return;for(const file of await recentFiles())await enqueue(file,false);tracker.publish();},4000);
  return ()=>{disposed=true;clearInterval(poll);watcher?.close();};
}

export function createPetStatusWriter(home,{fetcher=fetch,onError=()=>{}}={}){
  const runtimeFile=path.join(home,'dsh-pet','standalone-runtime.json');let latest=null,busy=false,stopped=false;
  async function flush(){
    if(busy||!latest||stopped)return;busy=true;const value=latest;latest=null;
    try{
      const runtime=JSON.parse(await fsp.readFile(runtimeFile,'utf8'));
      if(!Number.isInteger(runtime.port)||!/^[A-Za-z0-9_-]{43}$/.test(runtime.token))throw new Error('Invalid runtime');
      const response=await fetcher(`http://127.0.0.1:${runtime.port}/dsh-pet-7340/work-status`,{method:value.state?'POST':'DELETE',headers:{'content-type':'application/json','x-dsh-pet-token':runtime.token},...(value.state?{body:JSON.stringify({state:value.state,task:value.task})}:{}),signal:AbortSignal.timeout(3000)});
      if(!response.ok)throw new Error('State bridge rejected');
    }catch{onError();}finally{busy=false;if(latest)void flush();}
  }
  return {set(value){latest=value;void flush();},close(){stopped=true;}};
}