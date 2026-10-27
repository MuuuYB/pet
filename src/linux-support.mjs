import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function checkDesktopEnvironment({platform=process.platform,env=process.env,uid=process.getuid?.()}={}) {
  if (platform !== 'linux') return;
  if (uid === 0) throw new Error('请使用桌面登录用户启动桌宠，不要使用 sudo 或 root。');
  if (!env.DISPLAY) throw new Error(env.WAYLAND_DISPLAY
    ? '未检测到 XWayland 显示连接。请安装 xwayland，重新登录桌面，或选择 Ubuntu on Xorg。'
    : '未检测到图形桌面。请在 Ubuntu 桌面的终端中运行，不要在纯 SSH 会话中启动。');
}

export function initializePetConfig(root) {
  const destination=path.join(root,'data','dsh-pet','main-config.jsonc');
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  try { fs.copyFileSync(path.join(root,'config','main-config.example.jsonc'),destination,fs.constants.COPYFILE_EXCL); }
  catch(error) { if(error.code!=='EEXIST')throw error; }
}

export function runtimeEndpoint(state) {
  if(state?.name!=='chatgpt-whale-companion'||!Number.isInteger(state.port)||state.port<1||state.port>65535
    ||typeof state.instanceId!=='string'||!/^[a-f0-9-]{36}$/i.test(state.instanceId)
    ||typeof state.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(state.token))throw new Error('桌宠运行信息无效，请检查本项目 data/bridge-runtime.json。');
  return `http://127.0.0.1:${state.port}`;
}

export async function activeRuntime(file,{fetchImpl=fetch}={}) {
  let state;
  try{state=JSON.parse(fs.readFileSync(file,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw new Error('无法读取桌宠运行信息，请检查本项目 data/bridge-runtime.json。');}
  const endpoint=runtimeEndpoint(state);
  let health;
  try{const response=await fetchImpl(endpoint+'/health',{redirect:'error',signal:AbortSignal.timeout(1500)});if(!response.ok)return null;health=await response.json();}catch{return null;}
  if(!health.ok||health.name!=='ChatGPT 桌宠桥接'||health.instanceId!==state.instanceId)return null;
  return {state,endpoint,health};
}

// Desktop Entry Exec is not a shell command. Escape its own quoting and field codes.
export function desktopQuote(value) {
  if(/[\r\n\0]/.test(value))throw new Error('路径不能包含换行或空字符。');
  const escaped=value.replace(/[%]/g,'%%').replace(/[\\"`$]/g,'\\$&');
  return '"'+escaped.replace(/\\/g,'\\\\')+'"';
}
export function desktopEntry(root,nodeExecutable) {
  const script=path.join(root,'tools','linux-control.mjs');
  return `[Desktop Entry]\nType=Application\nName=鲸鱼娘 ChatGPT\nComment=桌面陪伴、聊天与小食堂\nExec=${desktopQuote(nodeExecutable)} ${desktopQuote(script)} start --settings\nTerminal=false\nCategories=Game;\nStartupNotify=false\n`;
}
export function sandboxProfile(executable) {
  if(!path.posix.isAbsolute(executable)||/[\r\n\0"\\*?\[\]{}]/.test(executable))throw new Error('Electron 路径包含 AppArmor 不支持的字符，请使用普通目录名。');
  const id='chatgpt-whale-'+crypto.createHash('sha256').update(executable).digest('hex').slice(0,12);
  return {id,text:`abi <abi/4.0>,\ninclude <tunables/global>\n\nprofile ${id} "${executable}" flags=(unconfined) {\n  userns,\n}\n`};
}
export function shellQuote(value){return "'"+value.replace(/'/g,"'\\''")+"'";}

// A listening backend alone does not establish that Electron rendered a pet.
export async function desktopRuntimeReady(file,{fetchImpl=fetch}={}) {
  try {
    const state=JSON.parse(fs.readFileSync(file,'utf8'));
    if(!Number.isInteger(state.port)||state.port<1||state.port>65535||typeof state.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(state.token))return false;
    const response=await fetchImpl(`http://127.0.0.1:${state.port}/dsh-pet-7340/pose?pet=main`,{
      headers:{'x-dsh-pet-token':state.token},redirect:'error',signal:AbortSignal.timeout(1500),
    });
    return response.ok&&(await response.json()).ok===true;
  }catch{return false;}
}
