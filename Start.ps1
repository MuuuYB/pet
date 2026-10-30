param([switch]$OpenSettings,[switch]$Silent)
$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
Import-Module (Join-Path $taskRoot 'tools\windows-startup.psm1') -Force
$mutex=[Threading.Mutex]::new($false,(Get-WhaleMutexName $taskRoot 'start'))
$locked=$false
try {
  try{$locked=$mutex.WaitOne([TimeSpan]::FromSeconds(60))}catch [Threading.AbandonedMutexException]{$locked=$true}
  if(-not $locked){throw '另一个桌宠启动操作尚未完成，请稍后重试。'}
$running = Get-WhaleRuntime $taskRoot
if ($running) {
  if (-not $Silent -or $OpenSettings) { Start-Process -FilePath $running.controlUrl }
  exit 0
}
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { 'C:\Program Files\nodejs\node.exe' }
if (-not (Test-Path -LiteralPath $nodePath)) { throw '未找到 Node.js，请安装 Node.js 24 或更新版本。' }
$launchFile = Join-Path $taskRoot 'src\launcher.mjs'
$logDirectory = Join-Path $taskRoot 'logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$process = Start-Process -FilePath $nodePath -ArgumentList @(('"{0}"' -f $launchFile)) -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory "$stamp-bridge.log") -RedirectStandardError (Join-Path $logDirectory "$stamp-bridge-error.log") -PassThru
for ($attempt = 0; $attempt -lt 80; $attempt++) {
  Start-Sleep -Milliseconds 250
  $running = Get-WhaleRuntime $taskRoot
  if ($running) {
    if ($OpenSettings) { Start-Process -FilePath $running.controlUrl }
    Write-Output 'ChatGPT 鲸鱼娘已启动。再次运行本快捷方式可打开设置。'
    exit 0
  }
  $process.Refresh()
  if ($process.HasExited) { throw "桌宠启动失败，请查看 $logDirectory 中最新的 bridge-error.log。" }
}
throw '桌宠启动未就绪，请查看 logs 文件夹。'
} finally { if($locked){$mutex.ReleaseMutex()};$mutex.Dispose() }
