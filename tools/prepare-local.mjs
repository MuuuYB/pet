import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const source=path.resolve(process.env.DSH_PET_SOURCE || path.join(os.homedir(),'.dsh','profiles','desktop','node_modules','dsh-pet'));
const vendor=path.join(root,'vendor','dsh-pet');
if(fs.existsSync(vendor))throw new Error('目标引擎目录已存在，停止以避免覆盖');
fs.mkdirSync(path.dirname(vendor),{recursive:true});
fs.cpSync(source,vendor,{recursive:true,dereference:true});
const installed=new Map(),copies=[];
function originalPackage(name,from){
  if(!/^(@[\w.-]+\/)?[\w.-]+$/.test(name))throw new Error('无效依赖名');
  const req=createRequire(path.join(from,'package.json'));
  for(const base of req.resolve.paths(name)||[]){const directory=path.join(base,...name.split('/'));if(fs.existsSync(path.join(directory,'package.json')))return fs.realpathSync(directory);}
  throw new Error('本机缺少运行依赖：'+name);
}
function copyPackage(name,from,parent,{optional=false}={}){
  let actual;try{actual=originalPackage(name,from);}catch(error){if(optional)return;throw error;}
  const manifest=JSON.parse(fs.readFileSync(path.join(actual,'package.json'),'utf8'));
  const key=name+'@'+manifest.version;
  const global=installed.get(name);
  if(global?.version===manifest.version)return;
  const target=global?path.join(parent,'node_modules',...name.split('/')):path.join(root,'node_modules',...name.split('/'));
  if(fs.existsSync(target))return;
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.cpSync(actual,target,{recursive:true,dereference:true});
  if(!global)installed.set(name,{version:manifest.version,target});
  copies.push({name,version:manifest.version,path:path.relative(root,target)});
  for(const dep of Object.keys(manifest.dependencies||{}))copyPackage(dep,actual,target);
  for(const dep of Object.keys(manifest.optionalDependencies||{}))copyPackage(dep,actual,target,{optional:true});
}
const manifest=JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8'));
for(const name of Object.keys(manifest.dependencies||{}))copyPackage(name,source,vendor);
const home=path.join(root,'data'),petHome=path.join(home,'dsh-pet');fs.mkdirSync(petHome,{recursive:true});
const originalHome=path.resolve(process.env.DSH_PET_ORIGINAL_HOME || path.join(os.homedir(),'.dsh','dsh-pet'));
const originalConfig=path.join(originalHome,'main-config.jsonc');
const config=JSON.parse(fs.readFileSync(originalConfig,'utf8').replace(/^\uFEFF/,''));
for(const pet of config.pets||[]){pet.name=(pet.name||'鲸鱼娘')+'（ChatGPT）';pet.balanceEnabled=false;pet.workStatusEnabled=true;pet.display='desktop';if(pet.position)pet.position.marginX=520;}
fs.writeFileSync(path.join(petHome,'main-config.jsonc'),JSON.stringify(config,null,2),'utf8');
for(const name of ['pet','main-animation','memory.json']){const item=path.join(originalHome,name);if(fs.existsSync(item))fs.cpSync(item,path.join(petHome,name),{recursive:true,dereference:true});}
const videos=fs.readdirSync(path.join(vendor,'assets','webm')).filter(name=>name.endsWith('.webm'));
const provenance={sourcePackage:manifest.name,sourceVersion:manifest.version,sourceRepository:manifest.repository?.url,preparedAt:new Date().toISOString(),originalPluginModified:false,videoCount:videos.length,dependencies:copies};
fs.writeFileSync(path.join(root,'provenance.json'),JSON.stringify(provenance,null,2));
console.log(JSON.stringify({ok:true,source:manifest.name,version:manifest.version,videos:videos.length,dependencies:copies.length,originalPluginModified:false}));