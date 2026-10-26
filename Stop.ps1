$ErrorActionPreference = 'Stop'
$runtimeFile = Join-Path $PSScriptRoot 'data\bridge-runtime.json'
if (-not (Test-Path -LiteralPath $runtimeFile)) { Write-Output 'ChatGPT 鲸鱼娘当前没有运行。'; exit 0 }
$state = Get-Content -LiteralPath $runtimeFile -Raw -Encoding UTF8 | ConvertFrom-Json
$headers = @{ Authorization = ('Bearer ' + $state.token) }
Invoke-RestMethod -Uri ("http://127.0.0.1:{0}/control/quit" -f $state.port) -Method Post -Headers $headers -ContentType 'application/json' -Body '{}' -TimeoutSec 6 | Out-Null
Write-Output '已退出 ChatGPT 鲸鱼娘。'