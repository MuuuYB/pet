import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const execute=promisify(execFile);
const root=fileURLToPath(new URL('../',import.meta.url));
const windows=process.platform==='win32';
const quote=value=>"'"+value.replace(/'/g,"''")+"'";
const ps=process.env.SystemRoot?path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'):'powershell.exe';
function fixture(t){const base=path.join(root,'logs','startup-tests');fs.mkdirSync(base,{recursive:true});const dir=fs.mkdtempSync(path.join(base,'case-'));t.after(async()=>{for(let attempt=0;;attempt++){try{await fs.promises.rm(dir,{recursive:true,force:true});return;}catch(error){if(attempt>=15||!['EPERM','EBUSY','ENOTEMPTY'].includes(error.code))throw error;await new Promise(resolve=>setTimeout(resolve,200));}}});return dir;}
async function powershell(file){return execute(ps,['-NoProfile','-ExecutionPolicy','Bypass','-File',file],{windowsHide:true,timeout:40000});}

test('Windows autostart recognizes desktop sessions and preserves manual exit until reopening',{skip:!windows},async t=>{
  const dir=fixture(t),file=path.join(dir,'policy.ps1');
  fs.writeFileSync(file,'\ufeff'+String.raw`
$ErrorActionPreference='Stop'
Import-Module ${quote(path.join(root,'tools/windows-startup.psm1'))} -Force
function Assert-True($condition,$message){if(-not $condition){throw $message}}
$main=[pscustomobject]@{Id=123;SessionId=1;MainWindowHandle=7;Path='C:\Program Files\WindowsApps\OpenAI.Codex_99.1_x64__test\app\ChatGPT.exe';StartTime=[DateTime]'2026-10-30'}
$key=Get-CodexDesktopKey @($main) 1
Assert-True ($key -like '123:*') 'new app versions must match'
Assert-True ((Get-CodexDesktopKey @($main) 2) -eq '') 'ignore other desktop sessions'
$main.MainWindowHandle=0
Assert-True ((Get-CodexDesktopKey @($main) 1) -eq '') 'ignore subprocess/background-only windows'
$main.MainWindowHandle=7;$main.Path='C:\tools\codex.exe'
Assert-True ((Get-CodexDesktopKey @($main) 1) -eq '') 'ignore CLI process'
$state=Get-WhaleAutostartDecision $null '' $false 0
Assert-True (-not $state.ShouldStart) 'no app, no launch'
$state=Get-WhaleAutostartDecision $state 'A' $false 1000
Assert-True ($state.ShouldStart -and $state.Attempts -eq 1) 'first opening launches'
$state=Get-WhaleAutostartDecision $state 'A' $true 2000
$state=Get-WhaleAutostartDecision $state 'A' $false 3000
Assert-True (-not $state.ShouldStart) 'manual exit must remain closed'
$state=Get-WhaleAutostartDecision $state '' $false 4000
$state=Get-WhaleAutostartDecision $state 'A' $false 5000
Assert-True ($state.ShouldStart) 'same process window reopened launches again'
$state=Get-WhaleAutostartDecision $state 'B' $false 6000
Assert-True ($state.ShouldStart -and $state.Attempts -eq 1) 'new process launches'
$state=Get-WhaleAutostartDecision $state 'B' $false 7000
Assert-True (-not $state.ShouldStart) 'failure retry waits'
$state=Get-WhaleAutostartDecision $state 'B' $false 36000
Assert-True ($state.ShouldStart -and $state.Attempts -eq 2) 'second attempt'
$state=Get-WhaleAutostartDecision $state 'B' $false 66000
Assert-True ($state.ShouldStart -and $state.Attempts -eq 3) 'third attempt'
$state=Get-WhaleAutostartDecision $state 'B' $false 96000
Assert-True (-not $state.ShouldStart) 'retry is bounded'
$settingsFile=Join-Path $PSScriptRoot 'settings.json'
Write-WhaleJson $settingsFile @{enabled=$true}
Write-WhaleJson $settingsFile @{enabled=$false}
Assert-True ((Get-Content -LiteralPath $settingsFile -Raw|ConvertFrom-Json).enabled -eq $false) 'atomic settings replacement works on Windows PowerShell 5'
Write-Output 'policy-ok'
`);
  assert.match((await powershell(file)).stdout,/policy-ok/);
});

test('concurrent silent Windows starters create only one companion and do not open settings',{skip:!windows},async t=>{
  const dir=fixture(t);
  fs.mkdirSync(path.join(dir,'tools'));fs.mkdirSync(path.join(dir,'src'));
  fs.copyFileSync(path.join(root,'Start.ps1'),path.join(dir,'Start.ps1'));
  fs.copyFileSync(path.join(root,'tools/windows-startup.psm1'),path.join(dir,'tools/windows-startup.psm1'));
  const token=crypto.randomBytes(32).toString('base64url'),instanceId=crypto.randomUUID();
  fs.writeFileSync(path.join(dir,'src','launcher.mjs'),String.raw`
import fs from 'node:fs';import http from 'node:http';
fs.mkdirSync('data',{recursive:true});fs.appendFileSync('data/launch-count','1\n');
const server=http.createServer((req,res)=>{
 if(req.url==='/health'){res.setHeader('content-type','application/json; charset=utf-8');res.end(JSON.stringify({ok:true,name:'ChatGPT 桌宠桥接',instanceId:${JSON.stringify(instanceId)}}));}
 else if(req.url==='/quit'&&req.headers.authorization===${JSON.stringify('Bearer '+token)}){res.end('ok');server.close();}
 else {res.writeHead(404);res.end();}
});
server.listen(0,'127.0.0.1',()=>fs.writeFileSync('data/bridge-runtime.json',JSON.stringify({name:'chatgpt-whale-companion',port:server.address().port,pid:process.pid,instanceId:${JSON.stringify(instanceId)},token:${JSON.stringify(token)},controlUrl:'invalid-settings-url-must-not-open'})));
`);
  const start=()=>new Promise((resolve,reject)=>{
    // Windows grandchildren can retain inherited pipe handles after PowerShell exits.
    const child=spawn(ps,['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(dir,'Start.ps1'),'-Silent'],{windowsHide:true,stdio:'ignore'});
    const timer=setTimeout(()=>{child.kill();reject(new Error('starter timed out'));},35000);
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('starter exit '+code));});
  });
  let serverState;
  try {
    await Promise.all([start(),start()]);
    serverState=JSON.parse(fs.readFileSync(path.join(dir,'data/bridge-runtime.json'),'utf8'));
    assert.equal(fs.readFileSync(path.join(dir,'data/launch-count'),'utf8'),'1\n');
    await start();assert.equal(fs.readFileSync(path.join(dir,'data/launch-count'),'utf8'),'1\n');
  }finally{
    if(!serverState&&fs.existsSync(path.join(dir,'data/bridge-runtime.json')))serverState=JSON.parse(fs.readFileSync(path.join(dir,'data/bridge-runtime.json'),'utf8'));
    if(serverState){await fetch(`http://127.0.0.1:${serverState.port}/quit`,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(2500)});await new Promise(resolve=>setTimeout(resolve,500));}
  }
});
