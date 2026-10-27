# Ubuntu 24.04 图形桌面安装

本分支：`feat/ubuntu-24.04`。Windows 继续使用 `main` 和原有 PowerShell 入口。Linux 使用同一套动画、聊天和养成逻辑，增加 Bash 入口与 X11／XWayland 适配。

## 适用环境

- Ubuntu 24.04 **图形桌面**，以普通登录用户运行。
- x64 或 arm64 的 Node.js ≥22.12.0，推荐 Node.js 24；安装后确认 `node --version` 和 `npm --version`。
- 官方 Codex CLI 已安装并登录，`codex login status` 成功。
- X11，或提供 `DISPLAY` 的 XWayland 会话。桌宠会为自己的 Electron 选择 `--ozone-platform=x11`，以支持移动、置顶和拖拽。不会修改系统默认会话。

纯 SSH／无桌面服务器无法显示悬浮宠物。远程桌面需要在远程桌面内的终端启动。不要用 `sudo` 启动桌宠。

## 首次安装

安装常用系统依赖（Ubuntu 24.04 使用带 `t64` 后缀的 GTK／音频库）：

```bash
sudo apt update
sudo apt install git curl xdg-utils xwayland libgtk-3-0t64 libnss3 libasound2t64 libgbm1
```

从 [Node.js 官方下载页](https://nodejs.org/en/download) 安装 Node.js 24，确认版本满足要求。再按 [OpenAI 官方 CLI 文档](https://learn.chatgpt.com/docs/cli) 安装并登录 Codex：

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
# 按安装器提示更新 PATH 或重新打开终端
codex login
codex login status
```

在希望存放桌宠的目录执行：

```bash
git clone --branch feat/ubuntu-24.04 https://github.com/MuuuYB/pet.git
cd pet
bash Setup.sh
```

仓库为私有仓库时，需要先具备 GitHub 访问权限。已经克隆 Windows 版的用户，建议另建目录克隆本分支，避免两套运行环境共用本地配置。

安装脚本会检查 Node.js 和登录状态、安装 npm 依赖、下载 Linux Electron、初始化独立配置，并创建应用菜单中的「鲸鱼娘 ChatGPT」。再次运行会保留配置、聊天记忆和养成存档。更新前应先停止当前桌宠。

### Ubuntu 24.04 的沙箱权限

Ubuntu 24.04 默认限制未经授权的应用创建用户命名空间。安装脚本检测到该限制时，会生成**绑定本项目 Electron 实际绝对路径**的 AppArmor profile，并输出两条 `sudo` 命令。执行终端输出的那两条命令后再启动。

该 profile 采用 Ubuntu 文档建议的 `unconfined` 模式加 `userns` 许可；它仅解决此可执行文件的命名空间权限，并不是完整应用隔离策略。安装脚本不会自动修改 `/etc`，也不会关闭整个系统的限制或添加 `--no-sandbox`。

如果移动项目目录或更换 Electron 路径，请重新运行 `bash Setup.sh`，按新路径生成 profile。旧 profile 对应的文件名包含路径哈希；不再需要时可先执行 `sudo apparmor_parser -R /etc/apparmor.d/<旧profile文件名>`，再删除该**确切文件**。

## 日常使用

```bash
bash Start.sh       # 后台启动；重复启动会打开设置
bash Settings.sh    # 启动并打开设置
bash Stop.sh        # 只停止本目录对应的桌宠
```

也可从应用菜单启动「鲸鱼娘 ChatGPT」。首次安装会记录 Node 和 Codex 的绝对路径，支持通过 nvm 等方式安装；如果日后移除了对应运行时版本，重新运行安装脚本并检查 `local-config.json` 中的路径。

右键宠物 →「喂食与金币」打开小食堂；「对话」进行聊天；「自动碎碎念」显示开关状态。金币、背包等保存在 `data/care-save.json`；聊天仍使用官方 CLI 已登录账号。

Linux 未配置本地 ChatGPT 客户端路径时，可以直接用桌宠自己的聊天窗口；菜单中的「打开 ChatGPT」会回到桌宠设置页。无需复制 Windows 客户端的 exe 路径。

## 常见问题

- **提示未检测到 XWayland**：在图形桌面终端执行 `echo "$XDG_SESSION_TYPE $DISPLAY"`。Wayland 会话下需要安装并正常启动 XWayland；重新登录桌面，或在登录界面选择「Ubuntu on Xorg」。不要随意猜测并手动设置 DISPLAY。
- **启动服务后没有宠物／提示 No usable sandbox、namespace 或 chrome-sandbox 权限错误**：先执行 Setup 输出的 AppArmor 命令，再查看 `logs/pet-error.log`。不要给用户可写的 Electron 目录批量设置 root/setuid，也不要以关闭沙箱作为默认处理。
- **找不到共享库**：执行 `ldd data/electron/electron`，根据 `not found` 行补齐 Ubuntu 软件包。
- **启动失败或聊天失败**：查看 `logs` 中最新 `bridge-error.log` 和 `pet-error.log`；确认 `codex login status`。CLI 参数随版本变化可能需要适配。
- **异常退出留下启动锁**：确认没有启动程序仍在运行，再删除本项目 `data/linux-start.lock`。停止操作使用经实例校验的本机接口，不按旧 PID 杀进程。
- **设置页没有自动打开**：确认已安装 `xdg-utils` 并设置默认浏览器；也可右键宠物打开设置。

## 验证范围

本分支加入 Ubuntu 24.04 CI：Node 测试、Shell 语法检查和 Xvfb 虚拟屏幕上的 Electron 动画播放检查。动画检查使用离线 CLI 替身，不调用真实账号；不等于真实 ChatGPT 聊天或 GNOME 桌面上的拖拽、穿透、多屏效果验收。以该次 GitHub Actions 实际结果为准。

本地开发环境为 Windows；目标电脑还需要验证：透明背景、置顶、拖拽、右键菜单、聊天、自动碎碎念开关、喂食动画和重启后存档。

## 依据

- [Electron BrowserWindow 的 Wayland 限制](https://www.electronjs.org/docs/latest/api/browser-window)
- [Ubuntu 24.04 发布说明：用户命名空间限制](https://documentation.ubuntu.com/release-notes/24.04/)
- [官方 Codex CLI 安装与登录](https://learn.chatgpt.com/docs/cli)
