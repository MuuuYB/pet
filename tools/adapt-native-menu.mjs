import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const modifications=[];
function update(relative,changes){const file=path.join(root,relative);const before=fs.readFileSync(file,'utf8');let source=before.replace(/\r\n/g,'\n');for(const [old,value] of changes){if(!source.includes(old))throw new Error('没有找到预期适配点：'+old.slice(0,60));source=source.replace(old,value);}fs.writeFileSync(file,source);modifications.push({file:relative,beforeSha256:crypto.createHash('sha256').update(before).digest('hex'),afterSha256:crypto.createHash('sha256').update(source).digest('hex')});}
update('vendor/dsh-pet/runtime/electron-helper/main.js',[
 ["const fsPromises = require('node:fs/promises');",`const fsPromises = require('node:fs/promises');
// ChatGPT companion keeps its Electron profile separate from the original DSH pet.
if (process.env.CHATGPT_PET_USER_DATA) {
  const companionProfile = path.resolve(process.env.CHATGPT_PET_USER_DATA);
  require('node:fs').mkdirSync(companionProfile, { recursive: true });
  app.setPath('userData', companionProfile);
  app.setPath('sessionData', companionProfile);
}`],
 ["    if (OPEN_TARGET === 'desktop') {",`    const controlUrl = process.env.CHATGPT_PET_CONTROL_URL;
    if (controlUrl && [...windows.values()].some(win => win.webContents.id === event.sender.id)) {
      const destination = new URL(url).pathname;
      if (destination === '/chatgpt-pet-settings') {
        shell.openExternal(controlUrl).catch(() => console.error('无法打开桌宠设置'));
        return;
      }
      if (destination === '/chatgpt-pet-quit') {
        const control = new URL(controlUrl);
        const capability = new URLSearchParams(control.hash.slice(1)).get('token');
        fetch(control.origin + '/control/quit', { method: 'POST', headers: { authorization: 'Bearer ' + capability } }).catch(() => console.error('无法退出桌宠'));
        return;
      }
      const desktopExecutable = process.env.CHATGPT_PET_DESKTOP_EXECUTABLE;
      if (desktopExecutable && require('node:fs').existsSync(desktopExecutable)) {
        const childEnvironment = { ...process.env };
        delete childEnvironment.ELECTRON_RUN_AS_NODE;
        const client = require('node:child_process').spawn(desktopExecutable, [], { detached: true, stdio: 'ignore', windowsHide: true, env: childEnvironment });
        client.on('error', () => console.error('无法打开 ChatGPT 客户端'));
        client.unref();
      } else shell.openExternal(controlUrl).catch(() => {});
      return;
    }
    if (OPEN_TARGET === 'desktop') {`]
]);
update('vendor/dsh-pet/runtime/electron-helper/sprite.js',[
 ["label: OPEN_TARGET === 'desktop' ? '打开软件' : '打开网站'", "label: '打开 ChatGPT'"],
 ["tools.push({ label: '查看余额', action: 'show-balance' });", "tools.push({ label: '桌宠设置', action: 'chatgpt-settings' }, { label: '退出 ChatGPT 桌宠', action: 'chatgpt-quit' });"],
 ["    if (leaf.action === 'open-site') {",`    if (leaf.action === 'chatgpt-settings' || leaf.action === 'chatgpt-quit') {
      if (window.petBridge) window.petBridge.openDshSite(ORIGIN + (leaf.action === 'chatgpt-settings' ? '/chatgpt-pet-settings' : '/chatgpt-pet-quit'));
      return;
    }
    if (leaf.action === 'open-site') {`]
]);
update('src/launcher.mjs',[["NO_COLOR:'1'};", "NO_COLOR:'1',CHATGPT_PET_USER_DATA:path.join(home,'electron-profile'),CHATGPT_PET_CONTROL_URL:`http://127.0.0.1:${gateway.port}/#token=${token}`,CHATGPT_PET_DESKTOP_EXECUTABLE:config.desktopExecutable||''};"]]);
update("vendor/dsh-pet/runtime/electron-helper/main.js",[["  ipcMain.on('pet:open-site', (event, payload) => {","  // Only return public companion state; the local capability stays in the main process.\n  ipcMain.handle('pet:companion-state', async (event) => {\n    if (![...windows.values()].some(win => !win.isDestroyed() && win.webContents.id === event.sender.id)) {\n      throw new Error('桌宠窗口未授权');\n    }\n    try {\n      const control = new URL(process.env.CHATGPT_PET_CONTROL_URL || '');\n      if (control.protocol !== 'http:' || control.hostname !== '127.0.0.1') throw new Error('invalid endpoint');\n      const capability = new URLSearchParams(control.hash.slice(1)).get('token');\n      if (!capability) throw new Error('missing capability');\n      const response = await fetch(control.origin + '/control/state', {\n        headers: { authorization: 'Bearer ' + capability },\n        signal: AbortSignal.timeout(3000), redirect: 'error',\n      });\n      if (!response.ok) throw new Error('unavailable');\n      const state = await response.json();\n      if (typeof state.automaticWhispers !== 'boolean') throw new Error('invalid state');\n      return { automaticWhispers: state.automaticWhispers };\n    } catch {\n      throw new Error('自动碎碎念状态读取失败，请打开桌宠设置');\n    }\n  });\n\n  ipcMain.on('pet:open-site', (event, payload) => {"]]);
update("vendor/dsh-pet/runtime/electron-helper/preload.js",[["  openDshSite(url) {","  getCompanionState() {\n    return ipcRenderer.invoke('pet:companion-state');\n  },\n  openDshSite(url) {"]]);
update("vendor/dsh-pet/runtime/electron-helper/sprite.js",[["    tools.push({ label: '桌宠设置', action: 'chatgpt-settings' }, { label: '退出 ChatGPT 桌宠', action: 'chatgpt-quit' });","    tools.push({ label: '桌宠设置', action: 'chatgpt-settings' }, { label: '退出 ChatGPT 桌宠', action: 'chatgpt-quit' });\n    tools.push({ label: '自动碎碎念：读取中…', action: 'chatgpt-settings', hint: '点此设置' });"]]);
update("vendor/dsh-pet/runtime/electron-helper/sprite.js",[["{ label: '碎碎念', action: 'whisper' }","{ label: '手动说一句', action: 'whisper' }"]]);
update("vendor/dsh-pet/runtime/electron-helper/sprite.js",[["    this.menuClose = m.close;","    this.menuClose = m.close;\n    // Read fresh state on each opening. A failed read is unknown, never a false \"off\".\n    const whisperLabel = [...m.el.querySelectorAll('.dsh-pet-menu-item > span:first-child')]\n      .find(label => label.textContent === '自动碎碎念：读取中…');\n    const readState = window.petBridge && window.petBridge.getCompanionState;\n    Promise.resolve().then(() => {\n      if (!readState) throw new Error('unavailable');\n      return readState();\n    }).then(state => {\n      if (typeof state?.automaticWhispers !== 'boolean') throw new Error('invalid state');\n      if (whisperLabel?.isConnected) whisperLabel.textContent = '自动碎碎念：' + (state.automaticWhispers ? '已开启' : '已关闭');\n    }).catch(() => {\n      if (whisperLabel?.isConnected) whisperLabel.textContent = '自动碎碎念：状态未知';\n    });"]]);
fs.writeFileSync(path.join(root,'native-adaptations.json'),JSON.stringify(modifications,null,2));
console.log(JSON.stringify({ok:true,changed:modifications.map(item=>item.file)}));