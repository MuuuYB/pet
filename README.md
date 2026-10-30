# 鲸鱼娘 · ChatGPT 桌面伴侣

将 `dsh-pet@0.3.8` 移植为独立桌面悬浮宠物，保留 106 段透明视频、动作菜单、拖拽物理、表情包与聊天窗口，通过本机官方 Codex CLI 使用已登录的 ChatGPT 账号。

这是与电脑客户端配合运行的独立伴侣窗口。聊天保留自己的历史；本地 Codex 任务状态可联动，普通 ChatGPT 网页或云端聊天不属于该状态来源。

## 环境

- Windows；已在 Node.js 24.15.0、Windows PowerShell 上验证。依赖要求 Node.js ≥22.12.0。
- 官方 Codex CLI 可用，且 `codex login status` 成功。找不到命令时，可在本地配置中填写客户端自带的 `codex.exe` 路径。
- 首次安装需要网络获取 npm 依赖及 Electron。聊天会使用当前账号额度。

## 首次安装

在 PowerShell 中执行：

```powershell
git clone https://github.com/MuuuYB/pet.git
cd pet
npm ci --ignore-scripts
codex login

# 创建本伴侣的独立配置；已有配置时保留
New-Item -ItemType Directory -Path .\data\dsh-pet -Force | Out-Null
if (-not (Test-Path .\data\dsh-pet\main-config.jsonc)) {
  Copy-Item .\config\main-config.example.jsonc .\data\dsh-pet\main-config.jsonc
}

# 将 Electron 下载到本项目 data/electron
$env:DSH_HOME = Join-Path $PWD 'data'
node .\vendor\dsh-pet\scripts\ensure-electron.mjs

powershell -NoProfile -ExecutionPolicy Bypass -File .\Start.ps1
```

已安装并登录 Codex 的电脑可省略再次登录。若要复用已有 Electron，或需要菜单直接打开指定客户端，将 `local-config.example.json` 复制成 `local-config.json` 并填写绝对路径：

- `codexExecutable`：官方 `codex.exe`；留空时自动查找。
- `electronExecutable`：已有的 `electron.exe`；留空时由原引擎查找本项目 `data/electron` 等位置。
- `desktopExecutable`：电脑客户端的可执行文件；留空时“打开 ChatGPT”将提示从任务栏打开，或回到设置页。

JSON 中 Windows 路径的反斜线需写成 `\\`，也可用 `/`。本地配置被 Git 忽略。

## 小食堂与养成

右键宠物 → **喂食与金币**，可查看金币、饱腹度、心情、等级和食物背包。首次赠送 100 金币、米饭和零食各 2 份；支持 6 种食物，喂食会播放对应的原有进食动画。

每日签到 +30 金币，完成本机任务每次 +10（每天最多 100），专注 10 分钟领取 +20（每天最多 6 次）。养成数据自动保存在 `data/care-save.json`，重启后继续。完整玩法、数值与设计来源见 [小食堂与金币系统](docs/pet-care.md)。

## 日常使用

- 运行 `Start.ps1` 后，桌宠在后台运行。再次运行会打开设置页；`Settings.ps1` 也可打开设置。
- 右键宠物 → **对话** 进行聊天；动作菜单和拖拽交互继续由原引擎提供。
- 右键 → **自动碎碎念：已开启／已关闭** 可查看当前状态，点击打开设置。**手动说一句** 只生成一次，不改变自动开关。
- 右键 → **桌宠设置** 可试聊、开启或关闭自动碎碎念、打开客户端或退出。设置页会明确显示当前状态及保存结果；保存失败会重新读取实际状态。
- 自动碎碎念默认关闭。开启后每五分钟按原人设发起请求，使用当前账号额度。
- 右键 → **退出 ChatGPT 桌宠**，或运行 `Stop.ps1`，停止本伴侣。
- `npm start` 可在终端前台运行，方便排查启动失败；日志位于 `logs`。

可以为 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "<项目绝对路径>\Start.ps1"` 创建桌面快捷方式。

## 跟随 Codex 启动（Windows）

执行一次：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Enable-CodexAutostart.ps1
```

这会在当前用户的 Windows 登录启动目录创建本桌宠的监听快捷方式，并立即启动后台监听。每 3 秒检查当前桌面会话中的官方 Codex／ChatGPT 主窗口，发现打开客户端时调用 `Start.ps1 -Silent`。客户端升级后的 WindowsApps 路径也会被识别；没有窗口的 CLI、GPU 等子进程不触发。

已有桌宠不会重复启动或弹出设置页；手动退出桌宠后，本次客户端会话内不再自动拉起。关闭客户端窗口被监听到后，再打开窗口或启动新的客户端进程时会重新联动。关闭客户端不会自动关闭桌宠。首次启动失败最多尝试 3 次，间隔至少 30 秒，日志位于 `logs/codex-autostart.log`。

取消联动：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Disable-CodexAutostart.ps1
```

它仅移除本项目的登录启动项，监听程序会在数秒内退出，当前桌宠继续运行。移动项目目录后请先在旧目录关闭联动，再到新目录重新启用。该功能属于本桌宠的 Windows 启动集成，未修改 Codex 的配置或程序文件。

## 接入方式与限制

聊天经仅监听 `127.0.0.1` 的兼容接口交给 `codex exec`。使用 CLI 默认模型与低推理强度，复用官方 CLI 登录，无需另填 OpenAI API Key。CLI 参数适配当前客户端版本，后续升级可能需要调整。

每次聊天使用只读沙箱，关闭 shell、应用连接和多智能体等能力，并使用临时 CLI 会话；连续聊天由原桌宠记忆管理。超时、登录失效和额度不足会返回错误。它不会自动把文字发送到客户端当前聊天。

任务状态适配读取本机 `.codex/sessions` 中的事件类型，只转发通用状态文字，不把其他任务的提示词、回复或工具参数复制进宠物聊天。权限等待只有在对应事件可见时才能显示；日志格式变化可能影响联动。

DeepSeek 余额与充值功能在示例配置中关闭；原动画库中的余额主题动作仍可手动点播，不代表真实账户余额。

`data` 包含本机接口令牌、聊天记忆与 Electron 配置，`logs` 包含运行日志。它们与 `local-config.json`、`node_modules` 均被 Git 忽略。原 DSH 安装由独立目录保存，运行本伴侣不要求打开 DeepSeek 主程序。

## 开发与验证

```powershell
npm test
# 已启动本伴侣时，检查实际运行状况与保存的开关值
npm run check:live
```

自动测试覆盖接口鉴权、跨站请求防护、中文 SSE、请求取消、并发限制、模型错误、任务状态聚合、历史日志回放与不完整日志行。

`tools/smoke-real-chat.mjs`、`tools/integration-check.mjs` 会真实调用当前账号；后者还会关闭自动碎碎念。比较动画来源默认使用当前用户 `.dsh` 目录，也可通过 `DSH_PET_SOURCE` 指定原包路径。

`tools/prepare-local.mjs` 和 `tools/adapt-native-menu.mjs` 是移植来源准备工具，仅用于从未适配的原包重新制作，日常安装无需运行；目标目录已存在时准备工具会停止，以免覆盖。

## 来源

- [dsh-pet 原项目](https://github.com/PC2005-cloud/dsh-pet)，版本 0.3.8、MIT；原许可和修改说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
- [官方 CLI 非交互接入文档](https://learn.chatgpt.com/docs/non-interactive-mode)。
- [ChatGPT 原生宠物文档](https://learn.chatgpt.com/docs/pets)，本项目保留原引擎交互，采用独立悬浮窗口。
