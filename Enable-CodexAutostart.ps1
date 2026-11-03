$ErrorActionPreference='Stop'
$taskRoot=$PSScriptRoot
Import-Module (Join-Path $taskRoot 'tools\windows-startup.psm1') -Force
$spec=Get-WhaleScheduledTaskSpec $taskRoot
$existing=Get-ScheduledTask -TaskPath '\' | Where-Object {$_.TaskName -eq $spec.TaskName}
if($existing -and -not (Test-WhaleScheduledTaskOwner $existing $spec)){throw '同名计划任务不属于本桌宠，未覆盖。'}
$definition=New-WhaleScheduledTaskDefinition $spec
Register-ScheduledTask -TaskName $spec.TaskName -TaskPath '\' -InputObject $definition -Force | Out-Null
Write-WhaleJson (Join-Path $taskRoot 'data\codex-autostart.json') @{enabled=$true}
# Let Task Scheduler create the process independently of this terminal/Codex.
Start-ScheduledTask -TaskName $spec.TaskName -TaskPath '\'
Remove-WhaleLegacyStartupShortcut $taskRoot
Write-Output '已启用：Windows 计划任务独立监听 Codex，监听退出后约一分钟内自动恢复。手动退出桌宠后，本次 Codex 会话内不再自动拉起。'
