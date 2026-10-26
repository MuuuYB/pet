import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

export function writePrivateJson(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive:true});
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  const fd = fs.openSync(temp, 'wx', 0o600);
  try {
    if (process.platform === 'win32') {
      const system = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
      const identity = execFileSync(path.join(system,'whoami.exe'), ['/user','/fo','csv','/nh'], {encoding:'utf8',windowsHide:true});
      const sid = identity.match(/\bS-1-\d+(?:-\d+)+\b/)?.[0];
      if (!sid) throw new Error('无法确定本机用户');
      execFileSync(path.join(system,'icacls.exe'), [temp,'/inheritance:r','/grant:r',`*${sid}:F`], {stdio:'pipe',windowsHide:true});
    }
    fs.writeFileSync(fd, JSON.stringify(value, null, 2), 'utf8');
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  try { fs.renameSync(temp,file); }
  catch (error) { fs.rmSync(temp,{force:true}); throw error; }
}