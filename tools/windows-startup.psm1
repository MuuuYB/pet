Set-StrictMode -Version 2

function Get-WhaleMutexName {
  param([string]$TaskRoot,[string]$Purpose)
  $sha=[Security.Cryptography.SHA256]::Create()
  try {$hash=[BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes([IO.Path]::GetFullPath($TaskRoot).ToLowerInvariant()))).Replace('-','').Substring(0,16)} finally {$sha.Dispose()}
  return "Local\WhalePet-$Purpose-$hash"
}
function Get-WhaleRuntime {
  param([string]$TaskRoot)
  try {
    $file=Join-Path $TaskRoot 'data\bridge-runtime.json'
    if(-not (Test-Path -LiteralPath $file)){return $null}
    $state=Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
    if($state.name -ne 'chatgpt-whale-companion' -or $state.port -notmatch '^\d+$' -or [int]$state.port -lt 1 -or [int]$state.port -gt 65535 -or $state.token -notmatch '^[A-Za-z0-9_-]{43}$'){return $null}
    $instance=[Guid]::Empty
    if(-not [Guid]::TryParse([string]$state.instanceId,[ref]$instance)){return $null}
    $endpoint='http://127.0.0.1:'+([int]$state.port)
    $health=Invoke-RestMethod -Uri ($endpoint+'/health') -TimeoutSec 2 -MaximumRedirection 0
    if($health.ok -and $health.name -eq 'ChatGPT 桌宠桥接' -and $health.instanceId -eq $state.instanceId){
      $state | Add-Member -NotePropertyName controlUrl -NotePropertyValue ($endpoint+'/#token='+$state.token) -Force
      return $state
    }
  }catch{}
  return $null
}
function Get-CodexDesktopKey {
  param([object[]]$Processes,[int]$SessionId,[string]$ConfiguredExecutable='')
  $keys=@(foreach($candidate in $Processes){
    try {
      if($candidate.SessionId -ne $SessionId -or $candidate.MainWindowHandle -eq 0){continue}
      $exe=[string]$candidate.Path
      $known=$exe -match '\\WindowsApps\\OpenAI\.(Codex|ChatGPT(-Desktop)?)_[^\\]+\\(app\\)?(ChatGPT|Codex)\.exe$'
      $configured=$ConfiguredExecutable -and [string]::Equals($exe,$ConfiguredExecutable,[StringComparison]::OrdinalIgnoreCase)
      if(-not ($known -or $configured)){continue}
      '{0}:{1}' -f $candidate.Id,$candidate.StartTime.ToUniversalTime().Ticks
    }catch{}
  })
  return (($keys | Sort-Object -Unique) -join ';')
}
function Get-WhaleAutostartDecision {
  param($State,[string]$SessionKey,[bool]$Running,[long]$Now)
  if(-not $State -or $State.SessionKey -ne $SessionKey){$State=[pscustomobject]@{SessionKey=$SessionKey;Completed=$false;Attempts=0;NextAttemptAt=0L;ShouldStart=$false}}
  $State.ShouldStart=$false
  if(-not $SessionKey){return $State}
  if($Running){$State.Completed=$true;return $State}
  if(-not $State.Completed -and $State.Attempts -lt 3 -and $Now -ge $State.NextAttemptAt){
    $State.ShouldStart=$true;$State.Attempts++;$State.NextAttemptAt=$Now+30000
  }
  return $State
}
function Write-WhaleJson {
  param([string]$File,$Value)
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($File)) | Out-Null
  $temporary=$File+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
  try{
    [IO.File]::WriteAllText($temporary,($Value | ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
    if(Test-Path -LiteralPath $File){[IO.File]::Replace($temporary,$File,[NullString]::Value)}else{[IO.File]::Move($temporary,$File)}
  }finally{if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary}}
}
function Get-WhaleStartupShortcut {
  param([string]$TaskRoot)
  $key=(Get-WhaleMutexName $TaskRoot 'watch').Split('-')[-1]
  return Join-Path ([Environment]::GetFolderPath('Startup')) ("鲸鱼娘 Codex 联动-$key.lnk")
}
Export-ModuleMember -Function Get-WhaleMutexName,Get-WhaleRuntime,Get-CodexDesktopKey,Get-WhaleAutostartDecision,Write-WhaleJson,Get-WhaleStartupShortcut
