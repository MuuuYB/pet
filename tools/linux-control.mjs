#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {writePrivateJson} from '../src/private-files.mjs';
import {activeRuntime,desktopRuntimeReady,checkDesktopEnvironment,initializePetConfig,desktopEntry,sandboxProfile,shellQuote} from '../src/linux-support.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const runtimeFile=path.join(root,'data','bridge-runtime.json');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sleepLimit=60000;

async function openSettings(active) {
  const url=active.endpoint+'/#token='+active.state.token;
  await new Promise((resolve,reject)=>{
    const browser=spawn('xdg-open',[url],{detached:true,stdio:'ignore'});
    browser.once('error',()=>reject(new Error('无法打开浏览器，请安装 xdg-utils，或右键宠物打开设置。')));
    browser.once('spawn',()=>{browser.unref();resolve();});
  });
}
async function waitUntilReady(child) {
  const deadline=Date.now()+sleepLimit;
  while(Date.now()<deadline){
    if(child&&(child.exitCode!==null||child.signalCode!==null))throw new Error('桌宠进程已退出，请查看 logs 中最新的 bridge-error.log。');
    const active=await activeRuntime(runtimeFile);
    if(active?.health.petReady&&await desktopRuntimeReady(path.join(root,'data','dsh-pet','standalone-runtime.json')))return active;
    await pause(350);
  }
  throw new Error('桌宠启动超时，请查看 logs 中最新的 bridge-error.log 和 pet-error.log。');
}
function acquireStartLock() {
  const file=path.join(root,'data','linux-start.lock');
  try{const fd=fs.openSync(file,'wx',0o600);fs.writeFileSync(fd,String(process.pid));fs.closeSync(fd);return ()=>fs.rmSync(file,{force:true});}
  catch(error){if(error.code!=='EEXIST')throw error;}
  const pid=Number(fs.readFileSync(file,'utf8'));
  if(!Number.isSafeInteger(pid)||pid<=0)throw new Error('启动锁无效，请确认没有启动程序运行后删除 data/linux-start.lock。');
  try{process.kill(pid,0);}catch(error){if(error.code==='ESRCH')throw new Error('上次启动程序异常退出。确认没有启动操作后，删除 data/linux-start.lock 再重试。');throw error;}
  throw new Error('另一个启动程序正在运行，请稍后重试。');
}
async function start(showSettings) {
  checkDesktopEnvironment();
  initializePetConfig(root);
  const unlock=acquireStartLock();
  let child;
  try {
    let active=await activeRuntime(runtimeFile);
    if(active){if(!active.health.petReady)active=await waitUntilReady();console.log('鲸鱼娘已经在运行。');await openSettings(active);return;}
    const configFile=path.join(root,'local-config.json');
    const config=fs.existsSync(configFile)?JSON.parse(fs.readFileSync(configFile,'utf8')):{};
    const electron=config.electronExecutable||path.join(root,'data','electron','electron');
    if(!fs.existsSync(electron))throw new Error('尚未安装 Linux Electron，请先执行 bash Setup.sh。');
    fs.accessSync(electron,fs.constants.X_OK);
    const logs=path.join(root,'logs');fs.mkdirSync(logs,{recursive:true});
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    const out=fs.openSync(path.join(logs,stamp+'-bridge.log'),'a',0o600);
    const err=fs.openSync(path.join(logs,stamp+'-bridge-error.log'),'a',0o600);
    try{child=spawn(process.execPath,[path.join(root,'src','launcher.mjs')],{cwd:root,detached:true,stdio:['ignore',out,err],env:process.env,windowsHide:true});}
    finally{fs.closeSync(out);fs.closeSync(err);}
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',()=>reject(new Error('无法启动 Node.js 桌宠进程。')));});
    try{active=await waitUntilReady(child);}catch(error){child.kill('SIGTERM');throw error;}
    child.unref();
    console.log('鲸鱼娘桌面窗口已就绪。右键宠物可打开小食堂和设置；退出桌面前可运行 bash Stop.sh。');
    if(showSettings)await openSettings(active);
  }finally{unlock();}
}
async function stop() {
  const active=await activeRuntime(runtimeFile);
  if(!active){console.log('本项目的鲸鱼娘当前没有运行。');return;}
  const response=await fetch(active.endpoint+'/control/quit',{method:'POST',headers:{authorization:'Bearer '+active.state.token,'content-type':'application/json'},body:'{}',redirect:'error',signal:AbortSignal.timeout(7000)});
  if(!response.ok)throw new Error('桌宠拒绝退出请求，请使用右键菜单退出。');
  const deadline=Date.now()+10000;
  while(Date.now()<deadline){const current=await activeRuntime(runtimeFile);if(!current||current.state.instanceId!==active.state.instanceId){console.log('鲸鱼娘已退出。');return;}await pause(250);}
  throw new Error('已发送退出请求，进程仍在收尾；请查看日志后重试。');
}
function install() {
  initializePetConfig(root);
  const dataDirectory=process.env.XDG_DATA_HOME||path.join(os.homedir(),'.local','share');
  const applications=path.join(dataDirectory,'applications');fs.mkdirSync(applications,{recursive:true});
  const desktop=path.join(applications,'chatgpt-whale-pet.desktop');
  fs.writeFileSync(desktop,desktopEntry(root,process.execPath),{mode:0o644});
  console.log('已创建应用菜单入口：鲸鱼娘 ChatGPT');
  const configFile=path.join(root,'local-config.json');
  const config=fs.existsSync(configFile)?JSON.parse(fs.readFileSync(configFile,'utf8')):{};
  if(!config.codexExecutable&&process.env.CHATGPT_PET_SETUP_CODEX){
    config.codexExecutable=path.resolve(process.env.CHATGPT_PET_SETUP_CODEX);
    writePrivateJson(configFile,config);
  }
  const executable=fs.realpathSync(config.electronExecutable||path.join(root,'data','electron','electron'));
  const profile=sandboxProfile(executable);
  const file=path.join(root,'data',profile.id+'.apparmor');
  fs.writeFileSync(file,profile.text,{mode:0o644});
  let restricted=false;
  try{restricted=fs.readFileSync('/proc/sys/kernel/apparmor_restrict_unprivileged_userns','utf8').trim()==='1';}catch{}
  if(restricted){
    console.log('\nUbuntu 限制未授权程序创建沙箱。首次使用请执行以下两条命令，为本桌宠的 Electron 允许 userns：');
    const target='/etc/apparmor.d/'+profile.id;
    console.log('sudo install -m 644 -- '+shellQuote(file)+' '+shellQuote(target));
    console.log('sudo apparmor_parser -r -- '+shellQuote(target));
  }
  console.log('\n安装完成后，在图形桌面的终端运行 bash Start.sh。');
}
async function main() {
  if(process.platform!=='linux')throw new Error('这些入口用于 Linux；Windows 请继续使用 Start.ps1 / Stop.ps1。');
  if(process.getuid?.()===0)throw new Error('请使用普通桌面用户运行，不要使用 sudo。');
  const [command,...flags]=process.argv.slice(2);
  if(flags.some(flag=>flag!=='--settings')||(command!=='start'&&flags.length))throw new Error('参数无效。');
  if(command==='init')initializePetConfig(root);
  else if(command==='install')install();
  else if(command==='start')await start(flags.includes('--settings'));
  else if(command==='stop')await stop();
  else throw new Error('用法：node tools/linux-control.mjs start [--settings] | stop | init | install');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
