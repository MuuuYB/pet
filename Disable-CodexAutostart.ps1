$ErrorActionPreference='Stop'
$taskRoot=$PSScriptRoot
Import-Module (Join-Path $taskRoot 'tools\windows-startup.psm1') -Force
Write-WhaleJson (Join-Path $taskRoot 'data\codex-autostart.json') @{enabled=$false}
$link=Get-WhaleStartupShortcut $taskRoot
if(Test-Path -LiteralPath $link){
  $shell=New-Object -ComObject WScript.Shell
  try{
    $shortcut=$shell.CreateShortcut($link)
    $expected='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+(Join-Path $taskRoot 'Watch-Codex.ps1')+'"'
    if($shortcut.Arguments -ne $expected){throw '同名启动项内容已变化，未删除。'}
    Remove-Item -LiteralPath $link
  }finally{[Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) | Out-Null}
}
Write-Output '已关闭 Codex 联动启动。监听程序将在数秒内退出；当前桌宠可继续使用。'
