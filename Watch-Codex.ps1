param([ValidateRange(1,30)][int]$PollSeconds=3)
$ErrorActionPreference='Stop'
$taskRoot=$PSScriptRoot
Import-Module (Join-Path $taskRoot 'tools\windows-startup.psm1') -Force
$mutex=[Threading.Mutex]::new($false,(Get-WhaleMutexName $taskRoot 'watch'))
$locked=$false
try {
  try{$locked=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$locked=$true}
  if(-not $locked){exit 0}
  $settingsFile=Join-Path $taskRoot 'data\codex-autostart.json'
  $statusFile=Join-Path $taskRoot 'data\codex-autostart-state.json'
  $logDirectory=Join-Path $taskRoot 'logs'
  [IO.Directory]::CreateDirectory($logDirectory) | Out-Null
  $logFile=Join-Path $logDirectory 'codex-autostart.log'
  $sessionId=(Get-Process -Id $PID).SessionId
  $policy=$null
  $lastKey=$null
  $phase='waiting-for-codex'
  Write-WhaleJson $statusFile @{pid=$PID;phase=$phase;startedAt=[DateTime]::UtcNow.ToString('o')}
  while($true){
    try{
      if(-not (Test-Path -LiteralPath $settingsFile)){break}
      $settings=Get-Content -LiteralPath $settingsFile -Raw -Encoding UTF8 | ConvertFrom-Json
      if($settings.enabled -ne $true){break}
      $configured=''
      $configFile=Join-Path $taskRoot 'local-config.json'
      if(Test-Path -LiteralPath $configFile){$config=Get-Content -LiteralPath $configFile -Raw -Encoding UTF8 | ConvertFrom-Json;$configured=[string]$config.desktopExecutable}
      $processes=@(Get-Process -Name ChatGPT,Codex -ErrorAction SilentlyContinue)
      $key=Get-CodexDesktopKey -Processes $processes -SessionId $sessionId -ConfiguredExecutable $configured
      $running=$false
      if($key -and (-not $policy -or $policy.SessionKey -ne $key -or -not $policy.Completed)){$running=$null -ne (Get-WhaleRuntime $taskRoot)}
      $policy=Get-WhaleAutostartDecision -State $policy -SessionKey $key -Running $running -Now ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
      $changed=$key -ne $lastKey
      if($policy.ShouldStart){
        Add-Content -LiteralPath $logFile -Encoding UTF8 -Value ((Get-Date -Format s)+' detected Codex; starting companion')
        $powershell=Join-Path $PSHOME 'powershell.exe'
        $arguments=@('-NoProfile','-ExecutionPolicy','Bypass','-File',('"{0}"' -f (Join-Path $taskRoot 'Start.ps1')),'-Silent')
        $starter=Start-Process -FilePath $powershell -ArgumentList $arguments -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDirectory 'autostart-start.log') -RedirectStandardError (Join-Path $logDirectory 'autostart-error.log')
        # Start-Process -Wait also waits for persistent descendants on Windows.
        # Wait only for the starter, so the watcher can observe the next app opening.
        $starterExited=$starter.WaitForExit(60000)
        $running=$null -ne (Get-WhaleRuntime $taskRoot)
        if($running){$policy.Completed=$true;$phase='started'}else{$phase='retry-pending'}
        Add-Content -LiteralPath $logFile -Encoding UTF8 -Value ((Get-Date -Format s)+" start result: $phase; starterExited=$starterExited")
        $changed=$true
      }elseif(-not $key){$phase='waiting-for-codex'}elseif($policy.Completed){$phase='session-handled'}elseif($policy.Attempts -ge 3){$phase='failed'}
      if($changed){Write-WhaleJson $statusFile @{pid=$PID;phase=$phase;sessionKey=$key;attempts=$policy.Attempts;checkedAt=[DateTime]::UtcNow.ToString('o')}}
      $lastKey=$key
    }catch{
      Add-Content -LiteralPath $logFile -Encoding UTF8 -Value ((Get-Date -Format s)+' watcher check failed: '+$_.Exception.Message)
    }
    Start-Sleep -Seconds $PollSeconds
  }
  Write-WhaleJson $statusFile @{pid=$PID;phase='disabled';checkedAt=[DateTime]::UtcNow.ToString('o')}
}finally{if($locked){$mutex.ReleaseMutex()};$mutex.Dispose()}
