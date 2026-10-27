import {CARE_CSS,CARE_HTML,CARE_JS} from './care-ui.mjs';
export const DASHBOARD = `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>鲸鱼娘 · ChatGPT</title>
<style>
body{margin:0;background:#f4f7fc;color:#22304a;font:15px/1.65 "Microsoft YaHei",sans-serif}
main{max-width:650px;margin:7vh auto;padding:32px;background:white;border-radius:24px;box-shadow:0 18px 60px #17365c12}
h1{margin:0 0 8px;font-size:28px}p{color:#65738a}.pill{display:inline-block;background:#edf6ff;color:#2474c4;border-radius:20px;padding:4px 12px}
button{border:0;border-radius:12px;padding:11px 17px;margin:8px 8px 8px 0;background:#397fe5;color:white;cursor:pointer;font:inherit}
button.secondary{background:#edf2fa;color:#334d71}button:disabled{cursor:wait;opacity:.65}button:focus-visible{outline:3px solid #91b9f3;outline-offset:3px}
.whisper-card{border:1px solid #e1e8f2;border-radius:16px;background:#f8faff;margin-top:24px;padding:20px}
.whisper-card h2{font-size:18px;margin:0}.whisper-status{font-size:18px;font-weight:bold;margin:10px 0 4px;color:#65738a}
.whisper-status[data-state="on"]{color:#147448}.whisper-status[data-state="off"]{color:#526076}
#whispers[data-state="on"]{background:#edf2fa;color:#334d71}#result{white-space:pre-wrap;min-height:24px;padding:12px 0}small{color:#6e7d94}
@media(max-width:720px){main{margin:20px 12px;padding:24px}}
${CARE_CSS}
</style>
<main><span class="pill" id="status">正在连接</span><h1>鲸鱼娘 · ChatGPT</h1>
<p>原有动作、拖拽和右键菜单继续使用。聊天通过这台电脑已登录的 ChatGPT 账号完成。</p>
${CARE_HTML}
<button id="test">试着聊一句</button><button class="secondary" id="open">打开客户端</button>
<section class="whisper-card" aria-labelledby="whisper-heading"><h2 id="whisper-heading">自动碎碎念</h2>
<p class="whisper-status" id="whisper-status" role="status" aria-live="polite">正在读取状态…</p>
<button id="whispers" type="button" role="switch" aria-label="自动碎碎念" aria-checked="false" disabled>正在读取…</button><br>
<small>开启后每 5 分钟自动说一句，使用账号额度。关闭后仍可右键选择“手动说一句”或“对话”。</small></section>
<p id="result" role="status" aria-live="polite"></p><button class="secondary" id="quit">退出这只桌宠</button>
<p><small>任务提示跟随本机 ChatGPT/Codex 工作任务。普通网页中的云端聊天不会自动同步到这里。</small></p>
</main><script type="module" src="/dashboard.js"></script></html>`;

export const DASHBOARD_JS = `
const token=new URLSearchParams(location.hash.slice(1)).get('token');
history.replaceState(null,'',location.pathname);
const el=id=>document.getElementById(id);
let automaticWhispers=null,saving=false,refreshSequence=0;
async function request(path,body){
  const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(path==='/v1/chat/completions'?65000:path==='/control/care/action'?15000:8000)});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error?.message||'连接失败');
  return result;
}
function renderWhispers(){
  const button=el('whispers'),status=el('whisper-status');
  const known=typeof automaticWhispers==='boolean';
  const state=known?(automaticWhispers?'on':'off'):'unknown';
  button.dataset.state=status.dataset.state=state;
  button.disabled=saving||!known;
  button.setAttribute('aria-checked',String(automaticWhispers===true));
  button.setAttribute('aria-busy',String(saving));
  status.textContent=known?'当前状态：'+(automaticWhispers?'已开启':'已关闭'):'状态读取失败，请重新打开设置';
  button.textContent=saving?'正在保存…':known?(automaticWhispers?'关闭自动碎碎念':'开启自动碎碎念'):'暂时无法切换';
}
async function refresh(){
  const sequence=++refreshSequence;
  try{
    const data=await request('/control/state');
    if(sequence!==refreshSequence)return;
    if(typeof data.automaticWhispers!=='boolean')throw new Error('状态无效');
    automaticWhispers=data.automaticWhispers;
    el('status').textContent=data.petReady?'桌宠已连接':'正在准备桌宠';
  }catch{
    if(sequence!==refreshSequence)return;
    automaticWhispers=null;
    el('status').textContent='请从桌面的“桌宠设置”重新打开';
  }
  renderWhispers();
}
el('whispers').onclick=async()=>{
  if(saving||typeof automaticWhispers!=='boolean')return;
  const requested=!automaticWhispers;
  ++refreshSequence;
  saving=true;renderWhispers();
  try{
    await request('/control/preferences',{automaticWhispers:requested});
    await refresh();
    if(automaticWhispers!==requested)throw new Error('未能确认保存结果，请查看当前状态后重试');
    el('result').textContent='已保存：自动碎碎念'+(automaticWhispers?'已开启':'已关闭');
  }catch(error){
    await refresh();
    el('result').textContent='切换失败：'+error.message;
  }finally{saving=false;renderWhispers();}
};
el('test').onclick=async()=>{
  el('test').disabled=true;el('result').textContent='正在等鲸鱼娘回复…';
  try{
    const data=await request('/v1/chat/completions',{model:'chatgpt-current-account',stream:false,messages:[{role:'system',content:'你是可爱温柔的蓝发鲸鱼小女仆。简短自然地打招呼，只回复一句中文。'},{role:'user',content:'你好，和我打个招呼吧。'}]});
    el('result').textContent=data.choices[0].message.content;
  }catch(error){el('result').textContent=error.message;}finally{el('test').disabled=false;}
};
el('open').onclick=()=>request('/control/open-app',{}).catch(error=>el('result').textContent=error.message);
el('quit').onclick=async()=>{
  try{await request('/control/quit',{});el('status').textContent='已退出';automaticWhispers=null;renderWhispers();}
  catch(error){el('result').textContent=error.message;}
};
window.addEventListener('focus',()=>{if(!saving)void refresh();});
setInterval(()=>{if(!saving&&!document.hidden)void refresh();},5000);
void refresh();
${CARE_JS}
`;