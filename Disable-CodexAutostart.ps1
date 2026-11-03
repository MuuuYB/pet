$ErrorActionPreference='Stop'
$taskRoot=$PSScriptRoot
Import-Module (Join-Path $taskRoot 'tools\windows-startup.psm1') -Force
Write-WhaleJson (Join-Path $taskRoot 'data\codex-autostart.json') @{enabled=$false}
$spec=Get-WhaleScheduledTaskSpec $taskRoot
$existing=Get-ScheduledTask -TaskPath '\' | Where-Object {$_.TaskName -eq $spec.TaskName}
if($existing){
  if(-not (Test-WhaleScheduledTaskOwner $existing $spec)){throw '同名计划任务不属于本桌宠，未删除。'}
  Unregister-ScheduledTask -TaskName $spec.TaskName -TaskPath '\' -Confirm:$false
}
Remove-WhaleLegacyStartupShortcut $taskRoot
Write-Output '已关闭 Codex 联动启动并移除本项目的计划任务。监听程序将在数秒内退出；当前桌宠可继续使用。'
