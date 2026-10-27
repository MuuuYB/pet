# 第三方来源与修改说明

`vendor/dsh-pet` 来自 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet) 的 npm 包 `dsh-pet@0.3.8`，保留其源代码、编译产物、106 段 WebM 动画、字体、表情包及原始说明。

原包声明 MIT 许可证，Copyright (c) 2026 PC2005-cloud。完整许可保存在 `vendor/dsh-pet/LICENSE`。素材沿用上游包中的内容；本仓库不额外声明其权利归属或授权范围。`companion.ico` 由原包 `assets/logo.png` 转换。

本次对上游运行时的修改：

- `runtime/electron-helper/main.js`：隔离 Electron 用户配置目录；接入打开 ChatGPT、设置页和退出操作；为受信任桌宠窗口只读查询自动碎碎念状态。
- `runtime/electron-helper/sprite.js`：替换相关菜单文字及其本地操作目标；显示自动碎碎念状态，将手动触发标为“手动说一句”，新增小食堂入口。
- `runtime/electron-helper/preload.js`：增加只返回公开状态的查询接口，令牌保留在主进程。

- `runtime/electron-helper/events.js`：自动工作状态延后到进食等显式动画结束后应用；碎碎念气泡不抢占正在播放的显式动画。

`native-adaptations.json` 记录上述文件修改前后的 SHA-256，`provenance.json` 记录移植来源与当时使用的依赖版本。`src` 是独立的 ChatGPT CLI 桥接与状态适配层。

运行依赖通过 npm 安装，其许可证分别随对应依赖提供。上游 README 描述的是 DSH 原插件；本伴侣的安装与使用以仓库根目录 README 为准。
