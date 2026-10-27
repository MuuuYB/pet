import {FOODS} from './care.mjs';
export const CARE_CSS=`
main{max-width:1040px}.care{margin:24px 0 36px}.care-hero{display:grid;grid-template-columns:1.4fr 1fr;gap:18px;background:linear-gradient(125deg,#e9f4ff,#f4f0ff);border:1px solid #dce8fa;border-radius:22px;padding:26px}
.care-eyebrow{font-size:12px;letter-spacing:2px;color:#6480a2}.care-hero h2{font-size:28px;line-height:1.4;margin:8px 0}.care-hero p{margin:0;color:#647a99}.care-wallet{background:#ffffffb8;border:1px solid white;border-radius:16px;padding:18px}.care-wallet strong{display:block;font-size:34px;color:#9a6815;line-height:1.3}.care-wallet span{color:#886e44;font-size:13px}.care-wallet button{width:100%;margin:12px 0 0;background:#a66e18}
.care-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0}.care-stat{border:1px solid #e4ebf5;border-radius:14px;padding:16px;background:white}.care-stat p{display:flex;justify-content:space-between;margin:0 0 10px;color:#4c6180}.care-stat strong{color:#243c60}.care-stat progress{width:100%;height:9px;display:block;accent-color:#5b96ed;border:0;border-radius:8px}.care-stat progress{appearance:none;-webkit-appearance:none;background:#edf2f8;overflow:hidden}.care-stat progress::-webkit-progress-bar{background:#edf2f8;border-radius:8px}.care-stat progress::-webkit-progress-value{background:#5b96ed;border-radius:8px}.care-stat:nth-child(2) progress::-webkit-progress-value{background:#df9b40}.care-stat:nth-child(3) progress::-webkit-progress-value{background:#b18bda}.care-stat:nth-child(2) progress{accent-color:#df9b40}.care-stat:nth-child(3) progress{accent-color:#b18bda}
.care-toolbar{display:flex;gap:12px;align-items:center;justify-content:space-between;margin:10px 0 24px}.care-toolbar p{margin:0}.care-toolbar button{margin:0}.care h3{font-size:20px;margin:24px 0 3px}.care-subtitle{margin:0 0 16px;color:#74849a;font-size:13px}.care-foods{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.food-card{border:1px solid #e1e9f4;border-radius:16px;padding:18px;background:#fff;transition:box-shadow .2s}.food-card:hover{box-shadow:0 5px 20px #345e9510}.food-emoji{font-size:37px;line-height:1.4}.food-card h4{margin:9px 0 4px;font-size:16px}.food-card p{font-size:13px;margin:3px 0;color:#6d7c92}.food-card .food-stock{margin:13px 0 8px;color:#425d7f}.food-actions{display:flex;gap:8px}.food-actions button{padding:8px 10px;margin:0;flex:1;font-size:13px}.food-actions .buy{background:#edf3fc;color:#42648c}
.care-earn{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:24px}.care-panel{border:1px solid #e2eaf5;border-radius:16px;padding:20px;background:#f9fbff}.care-panel h3{margin:0 0 8px;font-size:17px}.care-panel p{margin:5px 0;font-size:13px}.care-panel button{margin-bottom:0;padding:9px 13px;font-size:13px}.care-message{min-height:24px;font-weight:500;color:#28704e;margin:12px 0}.care-message[data-error="true"]{color:#b94a4a}.care-history{margin:12px 0;padding-left:20px;color:#667993;font-size:13px}.care-history li{margin:5px 0}.care details{margin-top:16px;border-top:1px solid #e8edf5;padding-top:14px;color:#6e7f95;font-size:13px}.care summary{cursor:pointer;color:#4f6c93}
button:disabled{cursor:not-allowed}.food-card button:disabled{opacity:.45}.settings-divider{border:0;border-top:1px solid #e6edf7;margin:30px 0}
@media(max-width:760px){.care-hero{grid-template-columns:1fr;padding:20px}.care-foods{grid-template-columns:repeat(2,1fr)}.care-earn{grid-template-columns:1fr}.care-stats{gap:8px}.care-stat{padding:12px 10px}.care-hero h2{font-size:24px}}
@media(max-width:560px){.care-foods,.care-stats{grid-template-columns:1fr}.care-stat p{white-space:nowrap}.care-toolbar{align-items:flex-start;flex-direction:column}.food-actions button{flex:initial;min-width:120px}}
`;
export const CARE_HTML=`<section class="care" id="care-root" aria-labelledby="care-heading">
<div class="care-hero"><div><span class="care-eyebrow">WHALE'S LITTLE KITCHEN</span><h2 id="care-heading">鲸鱼娘的小食堂</h2><p id="care-condition">正在打开小食堂…</p><p><small>喂一口喜欢的，陪她慢慢长大。</small></p></div><div class="care-wallet"><span>我的金币</span><strong id="care-coins">—</strong><span id="care-checkin-hint">正在读取存档</span><button id="care-checkin" disabled>每日签到 · +30 金币</button></div></div>
<div class="care-stats"><div class="care-stat"><p>饱腹度 <strong id="care-satiety">—</strong></p><progress id="care-satiety-bar" max="100" value="0" aria-label="饱腹度"></progress></div><div class="care-stat"><p>心情 <strong id="care-mood">—</strong></p><progress id="care-mood-bar" max="100" value="0" aria-label="心情"></progress></div><div class="care-stat"><p>成长等级 <strong id="care-level">—</strong></p><progress id="care-xp-bar" max="100" value="0" aria-label="升级进度"></progress></div></div>
<div class="care-toolbar"><p id="care-feeding">准备好今天的小点心了吗？</p><button class="secondary" id="care-pet" disabled>摸摸头 · 心情 +8</button></div>
<p class="care-message" id="care-message" role="status" aria-live="polite"></p>
<h3>食物商店 &amp; 我的背包</h3><p class="care-subtitle">购买后放进背包，点击“喂食”就会播放对应的进食动作。</p>
<div class="care-foods">${FOODS.map(food=>`<article class="food-card"><span class="food-emoji" aria-hidden="true">${food.icon}</span><h4>${food.name}</h4><p>饱腹 +${food.satiety} · 心情 +${food.mood}</p><p class="food-stock" id="care-stock-${food.id}">背包：— 份</p><div class="food-actions"><button class="buy" id="care-buy-${food.id}" disabled>购买 · ${food.price} 金币</button><button id="care-feed-${food.id}" disabled>喂食</button></div></article>`).join('')}</div>
<div class="care-earn"><section class="care-panel"><h3>专注赚金币</h3><p id="care-focus-clock">10 分钟专注，奖励 20 金币</p><p id="care-focus-limit">每日最多领取 6 次</p><button id="care-focus-start" disabled>开始 10 分钟专注</button><button id="care-focus-claim" disabled hidden>领取 20 金币</button><button class="secondary" id="care-focus-cancel" disabled hidden>结束计时</button></section><section class="care-panel"><h3>和 ChatGPT 一起工作</h3><p>完成一个本机 Codex 任务，自动获得 10 金币。</p><p id="care-task-progress">今日任务奖励：— / 100 金币</p><p>签到、专注、任务奖励都可以用来购买食物。</p></section></div>
<details><summary>最近的养成记录与规则</summary><ol class="care-history" id="care-history"></ol><p>首次赠送 100 金币、米饭和零食各 2 份。签到每天 +30；任务奖励每天最多 100；10 分钟专注每次 +20，每天最多 6 次。</p><p>饱腹度每小时下降 4 点，心情每小时下降 2 点、最低为 20。离线也会自然变化，宠物不会因饥饿死亡。吃饱后会暂停喂食。</p><p>每日奖励按北京时间更新。任务奖励只识别运行期间新开始并完成的本机任务，不补发历史记录。</p></details>
</section><hr class="settings-divider">`;
export const CARE_JS=`
if(el('care-root')){
  const foodIds=${JSON.stringify(FOODS.map(food=>food.id))};
  let careState=null,careSaving=false,careEpoch=0,careClockOffset=0;
  const careNow=()=>Date.now()+careClockOffset;
  function careMessage(text,error=false){el('care-message').textContent=text;el('care-message').dataset.error=String(error);}
  function careButtons(){
    const now=careNow(),s=careState,locked=careSaving||!s;
    el('care-checkin').disabled=locked||!!s?.daily.checkin;
    el('care-pet').disabled=locked||now<(s?.petAvailableAt||0)||now<(s?.feedingUntil||0);
    for(const id of foodIds){
      const food=s?.catalog.find(item=>item.id===id);
      el('care-buy-'+id).disabled=locked||s.coins<(food?.price||0)||s.inventory[id]>=99;
      el('care-feed-'+id).disabled=locked||s.inventory[id]<1||s.satiety>=95||now<s.feedingUntil;
    }
    const focus=s?.focus,ready=!!focus&&now>=focus.readyAt;
    el('care-focus-start').hidden=!!focus;el('care-focus-start').disabled=locked||!!focus||s.daily.focusClaims>=6;
    el('care-focus-claim').hidden=!focus;el('care-focus-claim').disabled=locked||!ready||s.daily.focusClaims>=6;
    el('care-focus-cancel').hidden=!focus;el('care-focus-cancel').disabled=locked||!focus;
    if(focus){const seconds=Math.max(0,Math.ceil((focus.readyAt-now)/1000));el('care-focus-clock').textContent=ready?'专注完成，奖励可以领取啦！':'专注中 '+String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');}
    else el('care-focus-clock').textContent='10 分钟专注，奖励 20 金币';
    el('care-feeding').textContent=s&&now<s.feedingUntil?'啊呜～正在进食，'+Math.ceil((s.feedingUntil-now)/1000)+' 秒后可继续投喂':s?.satiety>=95?'已经吃得饱饱，晚一点再来吧。':'准备好今天的小点心了吗？';
  }
  function renderCare(s){
    careState=s;careClockOffset=s.serverTime-Date.now();
    el('care-coins').textContent=String(s.coins);
    el('care-condition').textContent='陪伴第 '+(Math.floor(Math.max(0,s.serverTime-s.createdAt)/86400000)+1)+' 天 · '+s.condition;
    el('care-checkin').textContent=s.daily.checkin?'今日已签到':'每日签到 · +30 金币';
    el('care-checkin-hint').textContent=s.daily.checkin?'明天再来领取奖励':'今天的签到奖励等你领取';
    el('care-satiety').textContent=s.satiety+' / 100';el('care-satiety-bar').value=s.satiety;
    el('care-mood').textContent=s.mood+' / 100';el('care-mood-bar').value=s.mood;
    el('care-level').textContent='Lv.'+s.level;el('care-xp-bar').value=s.levelProgress;
    el('care-xp-bar').setAttribute('aria-valuetext',s.levelProgress+' / 100 经验');
    for(const id of foodIds)el('care-stock-'+id).textContent='背包：'+s.inventory[id]+' 份';
    el('care-focus-limit').textContent='今日已领 '+s.daily.focusClaims+' / 6 次';
    el('care-task-progress').textContent='今日任务奖励：'+s.daily.taskCoins+' / 100 金币';
    const entries=s.history.map(item=>{const li=document.createElement('li');li.textContent=item.text+(item.coins?'（'+(item.coins>0?'+':'')+item.coins+' 金币）':'');return li;});
    el('care-history').replaceChildren(...entries);careButtons();
  }
  async function refreshCare(){
    const epoch=++careEpoch;
    try{const data=await request('/control/care');if(epoch===careEpoch)renderCare(data);}
    catch(error){if(epoch!==careEpoch)return;careState=null;careButtons();careMessage('小食堂连接失败：'+error.message,true);}
  }
  async function careAction(action,extra={}){
    if(careSaving||!careState)return;
    careSaving=true;++careEpoch;careButtons();careMessage('正在保存…');
    try{
      const result=await request('/control/care/action',{action,...extra,requestId:crypto.randomUUID()});
      renderCare(result.state);careMessage(result.message+(result.warning?' '+result.warning:''),!!result.warning);
    }catch(error){await refreshCare();careMessage(error.message,true);}
    finally{careSaving=false;careButtons();}
  }
  el('care-checkin').onclick=()=>careAction('checkin');el('care-pet').onclick=()=>careAction('pet');
  el('care-focus-start').onclick=()=>careAction('focus-start');el('care-focus-claim').onclick=()=>careAction('focus-claim');el('care-focus-cancel').onclick=()=>careAction('focus-cancel');
  for(const id of foodIds){el('care-buy-'+id).onclick=()=>careAction('buy',{foodId:id,quantity:1});el('care-feed-'+id).onclick=()=>careAction('feed',{foodId:id});}
  window.addEventListener('focus',()=>{if(!careSaving)void refreshCare();});
  setInterval(()=>{if(!careSaving&&!document.hidden)void refreshCare();},5000);
  setInterval(()=>{if(careState&&!document.hidden)careButtons();},1000);
  void refreshCare();
}
`;