#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if [[ "$(uname -s)" != Linux ]]; then
  printf '%s\n' '此安装入口用于 Linux；Windows 请按 README 安装。' >&2
  exit 1
fi
if [[ "$EUID" -eq 0 ]]; then
  printf '%s\n' '请使用普通桌面用户安装，不要 sudo bash Setup.sh。' >&2
  exit 1
fi
for command_name in node npm codex; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf '缺少 %s，请按 docs/ubuntu-24.04.md 安装后重试。\n' "$command_name" >&2
    exit 1
  fi
done
node --input-type=module -e 'const [major,minor]=process.versions.node.split(".").map(Number); if(major<22||(major===22&&minor<12)){console.error("需要 Node.js >=22.12.0，推荐 Node.js 24。"); process.exit(1)}'
codex login status || { printf '%s\n' '请先执行 codex login，再重新运行安装。' >&2; exit 1; }
npm ci --ignore-scripts
node tools/linux-control.mjs init
export DSH_HOME="$PWD/data"
node vendor/dsh-pet/scripts/ensure-electron.mjs
CHATGPT_PET_SETUP_CODEX="$(command -v codex)" node tools/linux-control.mjs install
