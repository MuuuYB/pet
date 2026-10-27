// CI-only: fresh checkout, virtual screen and a local login-status stub.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {activeRuntime} from '../src/linux-support.mjs';
if(process.platform!=='linux'||process.env.CI!=='true')throw new Error('仅允许在 Linux CI 的全新检出中运行。');
const root=fileURLToPath(new URL('../',import.meta.url));
const data=path.join(root,'data');fs.mkdirSync(data,{recursive:true});
const configFile=path.join(root,'local-config.json');
if(fs.existsSync(configFile)||fs.existsSync(path.join(data,'care-save.json')))throw new Error('拒绝覆盖已有配置或存档。');
const stub=path.join(data,'codex-ci-stub');
fs.writeFileSync(stub,'#!/usr/bin/env node\nif(process.argv[2]==="login"&&process.argv[3]==="status"){process.exit(0)} console.error("离线 CI 不运行模型");process.exit(1);\n',{mode:0o700});
fs.writeFileSync(configFile,JSON.stringify({codexExecutable:stub}));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function command(file,args){await new Promise((resolve,reject)=>{const child=spawn(file,args,{cwd:root,stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(file+' exited '+code)));});}
let started=false;
try {
  await command('bash',['Start.sh']);started=true;
  const active=await activeRuntime(path.join(data,'bridge-runtime.json'));
  if(!active?.health.petReady)throw new Error('桥接未就绪');
  const runtime=JSON.parse(fs.readFileSync(path.join(data,'dsh-pet','standalone-runtime.json'),'utf8'));
  const base=`http://127.0.0.1:${runtime.port}`;
  const headers={'content-type':'application/json','x-dsh-pet-token':runtime.token};
  let playback;
  for(let attempt=0;attempt<40;attempt++){
    const response=await fetch(base+'/dsh-pet-7340/anim?pet=main&surface=desktop',{method:'POST',headers,body:JSON.stringify({name:'吃白饭'}),signal:AbortSignal.timeout(3000)});
    const value=await response.json();
    if(value.ok&&value.playbackId){playback=value.playbackId;break;}
    await pause(500);
  }
  if(!playback)throw new Error('桌面渲染器未接收动画');
  let ended=false;
  for(let attempt=0;attempt<100;attempt++){
    const response=await fetch(base+'/dsh-pet-7340/playback/'+encodeURIComponent(playback),{headers,signal:AbortSignal.timeout(3000)});
    const value=await response.json();
    const status=value.status||value.playback?.status;
    if(status==='ended'){ended=true;break;}
    if(['failed','cancelled'].includes(status))throw new Error('桌面动画未完成：'+status);
    await pause(300);
  }
  if(!ended)throw new Error('没有收到动画 ended 回执');
  console.log(JSON.stringify({ok:true,platform:'Ubuntu 24.04 / Xvfb',desktopAnimation:'ended',realChatTested:false}));
} finally {
  if(started)await command('bash',['Stop.sh']);
}
