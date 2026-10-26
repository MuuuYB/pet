import http from 'node:http';
import crypto from 'node:crypto';

export const MODEL='chatgpt-current-account';
function reply(res,status,value){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value));}
function authenticated(req,token){
  const auth=req.headers.authorization;
  if(typeof auth!=='string'||!auth.startsWith('Bearer '))return false;
  const received=Buffer.from(auth.slice(7)),expected=Buffer.from(token);
  return received.length===expected.length&&crypto.timingSafeEqual(received,expected);
}
export function validateMessages(body){
  if(!body||body.model!==MODEL||!Array.isArray(body.messages)||body.messages.length<1||body.messages.length>66)throw new Error('消息格式无效');
  let length=0;
  const messages=body.messages.map(message=>{
    if(!message||!['system','developer','user','assistant'].includes(message.role)||typeof message.content!=='string')throw new Error('仅支持文字聊天');
    length+=message.content.length;
    return {role:message.role,content:message.content};
  });
  if(length>32768||messages.at(-1).role!=='user')throw new Error('对话过长或缺少用户消息');
  return messages;
}
async function readJson(req){
  let size=0,parts=[];
  for await(const part of req){size+=part.length;if(size>150000){const e=new Error('请求过大');e.status=413;throw e;}parts.push(part);}
  try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw new Error('请求不是有效 JSON');}
}
export async function startGateway({token,runChat,port=0,onState=()=>{},getExtraHealth=()=>({}),admin}={}){
  if(typeof token!=='string'||token.length<32)throw new Error('需要本机能力令牌');
  let busy=false;
  const controllers=new Set();
  const server=http.createServer(async(req,res)=>{
    const host=req.headers.host;
    if(host!==`127.0.0.1:${server.address().port}`&&host!==`localhost:${server.address().port}`)return reply(res,403,{error:{message:'仅允许本机访问'}});
    if(req.headers.origin && req.headers.origin!==`http://${host}`)return reply(res,403,{error:{message:'不允许跨站请求'}});
    const pathname=new URL(req.url,'http://127.0.0.1').pathname;
    if(req.method==='GET'&&pathname==='/health')return reply(res,200,{ok:true,name:'ChatGPT 桌宠桥接',busy,...getExtraHealth()});
    if(admin?.publicRoute?.(req,res,pathname))return;
    if(!authenticated(req,token))return reply(res,401,{error:{message:'本机连接未授权'}});
    if(req.method==='GET'&&pathname==='/v1/models')return reply(res,200,{object:'list',data:[{id:MODEL,object:'model',owned_by:'local-chatgpt'}]});
    if(admin?.handle && pathname.startsWith('/control/')){
      try {await admin.handle(req,res,pathname,()=>readJson(req));}catch{reply(res,400,{error:{message:'设置操作失败'}});}return;
    }
    if(req.method!=='POST'||pathname!=='/v1/chat/completions')return reply(res,404,{error:{message:'接口不存在'}});
    let body,messages;
    try{body=await readJson(req);messages=validateMessages(body);}catch(error){return reply(res,error.status||400,{error:{message:error.message}});}
    if(busy)return reply(res,409,{error:{message:'正在回复上一条消息，请稍候'}});
    busy=true; const controller=new AbortController(); controllers.add(controller);
    const cancel=()=>{if(!res.writableEnded)controller.abort();};
    res.on('close',cancel);
    let heartbeat;
    try{
      onState('thinking');
      if(body.stream){
        res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
        res.write(': connected\n\n');heartbeat=setInterval(()=>res.write(': waiting\n\n'),10000);
      }
      const text=await runChat(messages,{signal:controller.signal});
      if(controller.signal.aborted)return;
      const id='chatcmpl-local-'+crypto.randomUUID(),created=Math.floor(Date.now()/1000);
      if(body.stream){
        const chunk=(delta,finish_reason=null)=>({id,object:'chat.completion.chunk',created,model:MODEL,choices:[{index:0,delta,finish_reason}]});
        res.write('data: '+JSON.stringify(chunk({role:'assistant',content:text}))+'\n\n');
        res.write('data: '+JSON.stringify(chunk({},'stop'))+'\n\ndata: [DONE]\n\n');res.end();
      }else reply(res,200,{id,object:'chat.completion',created,model:MODEL,choices:[{index:0,message:{role:'assistant',content:text},finish_reason:'stop'}]});
      onState('success');
    }catch(error){
      if(!controller.signal.aborted){
        if(res.headersSent){res.write('data: '+JSON.stringify({error:{message:error.message||'聊天连接失败'}})+'\n\n');res.end();}
        else reply(res,502,{error:{message:error.message||'聊天连接失败'}});
        onState('error');
      }
    }finally{
      clearInterval(heartbeat);busy=false;controllers.delete(controller);res.off('close',cancel);onState('idle');
    }
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return {port:server.address().port,server,async close(){for(const c of controllers)c.abort();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}