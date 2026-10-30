$ErrorActionPreference='Stop'
$taskRoot=$PSScriptRoot
Import-Module (Join-Path $taskRoot 'tools\windows-startup.psm1') -Force
$watcher=Join-Path $taskRoot 'Watch-Codex.ps1'
$powershell=Join-Path $PSHOME 'powershell.exe'
$arguments='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$watcher+'"'
$link=Get-WhaleStartupShortcut $taskRoot
$shell=New-Object -ComObject WScript.Shell
try{
  $shortcut=$shell.CreateShortcut($link)
  if((Test-Path -LiteralPath $link) -and ($shortcut.Arguments -ne $arguments -or $shortcut.TargetPath -ne $powershell)){throw '同名登录启动项不属于本桌宠，未覆盖。'}
  $shortcut.TargetPath=$powershell
  $shortcut.Arguments=$arguments
  $shortcut.WorkingDirectory=$taskRoot
  $shortcut.WindowStyle=7
  $shortcut.Description='检测到 Codex 桌面窗口后，自动启动鲸鱼娘'
  $shortcut.Save()
}finally{[Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) | Out-Null}
Write-WhaleJson (Join-Path $taskRoot 'data\codex-autostart.json') @{enabled=$true}
Start-Process -FilePath $powershell -ArgumentList $arguments -WorkingDirectory $taskRoot -WindowStyle Hidden | Out-Null
Write-Output '已启用：登录 Windows 后自动监听，打开 Codex 时启动鲸鱼娘。手动退出桌宠后，本次 Codex 会话内不再自动拉起。'
