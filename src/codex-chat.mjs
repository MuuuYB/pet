import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn,execFileSync} from 'node:child_process';

export function findCodex(explicit) {
  if (explicit && fs.existsSync(explicit)) return explicit;
  if (process.platform === 'win32') {
    try {
      const found=execFileSync('where.exe',['codex.exe'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/);
      if (found[0] && fs.existsSync(found[0])) return found[0];
    } catch {}
    const directory=path.join(process.env.LOCALAPPDATA || path.join(os.homedir(),'AppData','Local'),'OpenAI','Codex','bin');
    const found=fs.existsSync(directory) ? fs.readdirSync(directory).map(name=>path.join(directory,name,'codex.exe')).filter(file=>fs.existsSync(file)).sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs) : [];
    if (found[0]) return found[0];
  }
  return 'codex';
}

export function chatArgs(cwd) {
  return ['exec','--json','--ephemeral','--skip-git-repo-check','--ignore-user-config','--sandbox','read-only','--disable','apps','--disable','multi_agent','--disable','shell_tool','--disable','skill_search','--enable','skip_host_skill_discovery','-c','web_search="disabled"','-c','model_reasoning_effort="low"','--cd',cwd,'-'];
}

export function buildPrompt(messages) {
  const system=messages.filter(m=>m.role==='system'||m.role==='developer').map(m=>m.content).join('\n');
  const history=messages.filter(m=>m.role==='user'||m.role==='assistant');
  return '你正在为用户的桌面陪伴宠物生成一次聊天回复。只生成回复，不执行电脑操作，不使用工具，不访问文件，不调用技能，不创建或发送其他任务。遵守以下宠物人设、输出格式和对话上下文；若人设要求 JSON，则只输出该 JSON，不加代码围栏。以下 JSON 中 history 最后一条 user 是本次问题。不要提及这段接入说明。\n'+JSON.stringify({persona:system,history});
}

export function createCodexRunner({executable,cwd,timeoutMs=55000,onEvent=()=>{}}) {
  return async function run(messages,{signal}={}) {
    if (signal?.aborted) throw new Error('请求已取消');
    return await new Promise((resolve,reject)=>{
      const child=spawn(executable,chatArgs(cwd),{cwd,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,NO_COLOR:'1'}});
      let buffer='', received=0, result='', finished=false, stderr='';
      const finish=(error,text)=>{
        if(finished) return;
        finished=true; clearTimeout(timer); signal?.removeEventListener('abort',cancel);
        if(error){ child.kill(); reject(error); } else resolve(text);
      };
      const cancel=()=>finish(new Error('请求已取消'));
      const timer=setTimeout(()=>finish(new Error('ChatGPT 回复超时，请稍后重试')),timeoutMs);
      signal?.addEventListener('abort',cancel,{once:true});
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.on('error',()=>finish(new Error('无法启动官方 ChatGPT/Codex 命令，请检查客户端安装')));
      child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-3000);});
      child.stdout.on('data',chunk=>{
        received+=chunk.length;
        if(received>2*1024*1024) return finish(new Error('模型返回内容过长'));
        buffer+=chunk.toString();
        let end;
        while((end=buffer.indexOf('\n'))>=0){
          const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
          let event;try{event=JSON.parse(line);}catch{continue;}
          if(event.type==='item.completed'&&event.item?.type==='agent_message') result=event.item.text||'';
          if(event.type==='turn.failed') return finish(new Error('ChatGPT 请求失败，请检查登录状态或可用额度'));
          onEvent(event.type);
        }
      });
      child.on('close',code=>{
        if(finished)return;
        if(code===0&&result.trim()) finish(null,result);
        else finish(new Error(/401|unauthori|not logged|login/i.test(stderr)?'ChatGPT 登录已失效，请在客户端重新登录':'ChatGPT 暂时无法回复，请稍后重试'));
      });
      child.stdin.on('error',()=>{});
      child.stdin.end(buildPrompt(messages));
    });
  };
}