import fs from 'node:fs';
import crypto from 'node:crypto';
import {writePrivateJson} from './private-files.mjs';

export const FOODS=Object.freeze([
  {id:'rice',name:'暖心白米饭',icon:'🍚',price:12,satiety:25,mood:3,animation:'吃白饭'},
  {id:'snack',name:'快乐小零食',icon:'🍪',price:8,satiety:12,mood:8,animation:'大口吃零食'},
  {id:'token',name:'Token 脆饼',icon:'🧇',price:10,satiety:16,mood:6,animation:'吃Token'},
  {id:'watermelon',name:'清甜西瓜',icon:'🍉',price:15,satiety:20,mood:6,animation:'吃西瓜'},
  {id:'icecream',name:'梦幻冰淇淋',icon:'🍦',price:20,satiety:15,mood:12,animation:'吃冰淇淋融化'},
  {id:'hotpot',name:'暖暖小火锅',icon:'🍲',price:35,satiety:40,mood:10,animation:'涮火锅'},
].map(Object.freeze));
export const CARE_RULES=Object.freeze({starterCoins:100,checkinCoins:30,taskCoins:10,taskDailyCap:100,focusCoins:20,focusMs:10*60*1000,focusDailyCap:6,feedMs:12000,petCooldownMs:60000,satietyPerHour:4,moodPerHour:2});
const catalog=new Map(FOODS.map(food=>[food.id,food]));
const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'});
const dayOf=time=>dayFormatter.format(new Date(time));
const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,value));
export class CareError extends Error {constructor(message,status=400){super(message);this.status=status;}}
function initialState(now){return {version:1,createdAt:now,updatedAt:now,coins:100,xp:0,satiety:60,mood:75,inventory:Object.fromEntries(FOODS.map(food=>[food.id,['rice','snack'].includes(food.id)?2:0])),daily:{date:dayOf(now),checkin:false,taskCoins:0,focusClaims:0},focus:null,feedingUntil:0,petAvailableAt:0,taskReceipts:[],operations:[],history:[{at:now,text:'欢迎回家！收到 100 金币、米饭和零食各 2 份。',coins:100}]};}
function validateSave(value){
  const number=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
  const integer=(n,min,max)=>Number.isSafeInteger(n)&&number(n,min,max);
  if(!value||value.version!==1||!integer(value.coins,0,1000000000)||!integer(value.xp,0,1000000000)||!number(value.satiety,0,100)||!number(value.mood,0,100)||!number(value.createdAt,0,1e14)||!number(value.updatedAt,0,1e14))throw new Error('invalid save');
  if(!value.inventory||FOODS.some(food=>!integer(value.inventory[food.id],0,99)))throw new Error('invalid inventory');
  const d=value.daily;
  if(!d||!/^\d{4}-\d{2}-\d{2}$/.test(d.date)||typeof d.checkin!=='boolean'||!integer(d.taskCoins,0,100)||!integer(d.focusClaims,0,6))throw new Error('invalid daily');
  if(!number(value.feedingUntil,0,1e14)||!number(value.petAvailableAt,0,1e14))throw new Error('invalid timers');
  if(value.focus!==null&&(!value.focus||!number(value.focus.startedAt,0,1e14)||!number(value.focus.readyAt,value.focus.startedAt,1e14)||value.focus.readyAt-value.focus.startedAt!==CARE_RULES.focusMs))throw new Error('invalid focus');
  if(!Array.isArray(value.taskReceipts)||value.taskReceipts.length>2048||value.taskReceipts.some(key=>typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key)))throw new Error('invalid rewards');
  if(!Array.isArray(value.operations)||value.operations.length>128||value.operations.some(item=>!item||typeof item.id!=='string'||typeof item.fingerprint!=='string'||typeof item.message!=='string'))throw new Error('invalid receipts');
  if(!Array.isArray(value.history)||value.history.length>40||value.history.some(item=>!item||!number(item.at,0,1e14)||typeof item.text!=='string'||!integer(item.coins,-1000000,1000000)))throw new Error('invalid history');
  return value;
}
function advance(save,now){
  const current=Math.max(save.updatedAt,now),hours=(current-save.updatedAt)/3600000;
  save.satiety=clamp(save.satiety-hours*CARE_RULES.satietyPerHour);
  save.mood=clamp(save.mood-hours*CARE_RULES.moodPerHour,20);
  save.updatedAt=current;
  const date=dayOf(current);
  if(date>save.daily.date)save.daily={date,checkin:false,taskCoins:0,focusClaims:0};
  return save;
}
function history(save,now,text,coins=0){save.history.unshift({at:now,text,coins});save.history=save.history.slice(0,40);}
function snapshot(save,now){
  const s=advance(structuredClone(save),now);
  return {serverTime:now,createdAt:s.createdAt,coins:s.coins,xp:s.xp,level:1+Math.floor(s.xp/100),levelProgress:s.xp%100,satiety:Math.round(s.satiety),mood:Math.round(s.mood),condition:now<s.feedingUntil?'正在进食':s.satiety<25?'肚子饿了':s.mood<40?'想要陪伴':s.satiety>=85?'吃得饱饱':'状态不错',inventory:s.inventory,daily:s.daily,focus:s.focus,feedingUntil:s.feedingUntil,petAvailableAt:s.petAvailableAt,history:s.history.slice(0,8),catalog:FOODS,rules:CARE_RULES};
}
export function createCareStore({file,now=()=>Date.now(),write=writePrivateJson}={}){
  let state;
  try{state=fs.existsSync(file)?validateSave(JSON.parse(fs.readFileSync(file,'utf8'))):initialState(now());}
  catch{throw new CareError('养成存档无法读取，请先备份存档后修复',503);}
  if(!fs.existsSync(file))write(file,state);
  const view=()=>snapshot(state,now());
  function commit(draft){validateSave(draft);write(file,draft);state=draft;}
  function act(input){
    if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.requestId!=='string'||! /^[a-zA-Z0-9-]{16,80}$/.test(input.requestId))throw new CareError('操作编号无效，请刷新后重试');
    const {action,foodId,quantity=1,requestId}=input;
    if(!['checkin','buy','feed','pet','focus-start','focus-claim','focus-cancel'].includes(action))throw new CareError('不支持这个操作');
    const food=catalog.get(foodId);
    if(['buy','feed'].includes(action)&&!food)throw new CareError('没有这种食物');
    if(!Number.isInteger(quantity)||quantity<1||quantity>20)throw new CareError('一次只能购买 1 到 20 份');
    if(action!=='buy'&&quantity!==1)throw new CareError('这项操作一次只能执行一份');
    const fingerprint=JSON.stringify([action,foodId??null,quantity]);
    const previous=state.operations.find(item=>item.id===requestId);
    if(previous){if(previous.fingerprint!==fingerprint)throw new CareError('操作编号已用于其他请求',409);return {state:view(),message:previous.message,duplicate:true,effect:null};}
    const time=Math.max(now(),state.updatedAt),draft=advance(structuredClone(state),time);
    let message,effect=null;
    if(action==='checkin'){
      if(draft.daily.checkin)throw new CareError('今天已经签过到啦，明天再来',409);
      draft.daily.checkin=true;draft.coins+=30;draft.xp+=5;message='签到成功，获得 30 金币！';history(draft,time,message,30);
    }else if(action==='buy'){
      const cost=food.price*quantity;
      if(draft.coins<cost)throw new CareError('金币不够啦，先签到或完成专注任务吧',409);
      if(draft.inventory[food.id]+quantity>99)throw new CareError('这种食物最多保存 99 份',409);
      draft.coins-=cost;draft.inventory[food.id]+=quantity;message='买到了 '+quantity+' 份'+food.name+'！';history(draft,time,message,-cost);
    }else if(action==='feed'){
      if(time<draft.feedingUntil)throw new CareError('鲸鱼娘还在吃，等她吃完再喂吧',409);
      if(draft.satiety>=95)throw new CareError('已经吃得很饱啦，晚些时候再喂吧',409);
      if(draft.inventory[food.id]<1)throw new CareError('背包里没有这份食物，先去购买吧',409);
      const gainedSatiety=Math.min(food.satiety,100-draft.satiety),gainedMood=Math.min(food.mood,100-draft.mood);
      draft.inventory[food.id]-=1;draft.satiety=clamp(draft.satiety+food.satiety);draft.mood=clamp(draft.mood+food.mood);draft.xp+=8;draft.feedingUntil=time+CARE_RULES.feedMs;
      message='正在享用'+food.name+'，饱腹 +'+Math.round(gainedSatiety)+'、心情 +'+Math.round(gainedMood)+'！';
      effect={animation:food.animation,text:'啊呜～'+food.name+'真好吃，谢谢主人！',kind:'feed'};history(draft,time,'喂食了'+food.name+'。');
    }else if(action==='pet'){
      if(time<draft.feedingUntil)throw new CareError('鲸鱼娘正在吃东西，等她吃完再摸摸头吧',409);
      if(time<draft.petAvailableAt)throw new CareError('刚刚陪伴过啦，稍等一会儿再来',409);
      draft.mood=clamp(draft.mood+8);draft.xp+=2;draft.petAvailableAt=time+CARE_RULES.petCooldownMs;
      message='摸摸头，心情 +8！';effect={animation:'点击回应-开心跃动',text:'被主人摸摸头，今天也要元气满满～',kind:'pet'};history(draft,time,'陪鲸鱼娘玩了一会儿。');
    }else if(action==='focus-start'){
      if(draft.focus)throw new CareError('已经有一段专注计时正在进行',409);
      if(draft.daily.focusClaims>=6)throw new CareError('今天的专注奖励已领满，明天再来',409);
      draft.focus={startedAt:time,readyAt:time+CARE_RULES.focusMs};message='开始 10 分钟专注，结束后可以领取 20 金币。';
    }else if(action==='focus-claim'){
      if(!draft.focus||time<draft.focus.readyAt)throw new CareError('专注时间还没到，继续加油',409);
      if(draft.daily.focusClaims>=6)throw new CareError('今天的专注奖励已领满',409);
      draft.focus=null;draft.daily.focusClaims+=1;draft.coins+=20;draft.xp+=10;message='专注完成，获得 20 金币！';history(draft,time,message,20);
    }else{
      if(!draft.focus)throw new CareError('当前没有专注计时',409);
      draft.focus=null;message='已结束本次专注计时，没有扣除金币。';
    }
    draft.operations.push({id:requestId,fingerprint,message});draft.operations=draft.operations.slice(-128);
    commit(draft);return {state:view(),message,effect,duplicate:false};
  }
  function rewardTask(taskId){
    if(typeof taskId!=='string'||!taskId||taskId.length>8192)return false;
    const key=crypto.createHash('sha256').update(taskId).digest('hex');
    if(state.taskReceipts.includes(key))return false;
    const time=Math.max(now(),state.updatedAt),draft=advance(structuredClone(state),time);
    draft.taskReceipts.push(key);draft.taskReceipts=draft.taskReceipts.slice(-2048);
    const reward=Math.min(10,100-draft.daily.taskCoins);
    if(reward>0){draft.coins+=reward;draft.xp+=5;draft.daily.taskCoins+=reward;history(draft,time,'完成一个本机工作任务，获得 '+reward+' 金币！',reward);}
    commit(draft);return reward>0;
  }
  return {view,act,rewardTask};
}