import {CareError} from './care.mjs';
const json=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value));};
export function createCareRoutes({care,playEffect=async()=>{},isPetReady=()=>true}){
  return async function handle(req,res,pathname,readBody){
    if(pathname!=='/control/care'&&pathname!=='/control/care/action')return false;
    try{
      if(pathname==='/control/care'&&req.method==='GET'){json(res,200,care.view());return true;}
      if(pathname!=='/control/care/action'||req.method!=='POST'){json(res,405,{error:{message:'不支持这个请求方式'}});return true;}
      let input;try{input=await readBody();}catch{throw new CareError('请求格式无效，请刷新后重试');}
      if(['feed','pet'].includes(input?.action)&&!isPetReady())throw new CareError('桌宠还在准备，请稍后再喂食或互动',503);
      const result=care.act(input);
      let animation=null,warning;
      if(result.effect){
        try{animation=await playEffect(result.effect);}
        catch{warning='养成状态已保存，桌宠动作暂未响应，请稍后查看。';}
      }
      json(res,200,{state:care.view(),message:result.message,duplicate:result.duplicate,animation,...(warning?{warning}:{})});
    }catch(error){json(res,error instanceof CareError?error.status:500,{error:{message:error instanceof CareError?error.message:'养成操作未完成，请检查本地存档后重试'}});}
    return true;
  };
}