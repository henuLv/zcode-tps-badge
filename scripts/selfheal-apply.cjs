// 自愈后台链: 独立进程内同步跑 patch-renderer -> 成功后调度换入。
// 为什么单独成进程: selfheal.cjs 是 SessionStart hook(60s 时限), 且 patcher 一旦
// unref 派生, hook 进程随即退出, on('exit') 回调永不执行——patch 与 swap 的衔接
// 必须活在同一个存活进程里(3.18.x 自愈通道从未真正换入过的根因)。
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const LOG = path.join(PLUGIN_ROOT, 'logs', 'selfheal.log');
const log = m => { try { fs.appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`); } catch { /* 日志失败不影响主流程 */ } };

const asarPath = 'C:/Program Files/ZCode/resources/app.asar';
const buildDir = path.join(PLUGIN_ROOT, 'logs', 'build');
fs.mkdirSync(buildDir, { recursive: true });

// patch-renderer 内部以 SourceTextModule 做 module 解析门禁, 必须带 --experimental-vm-modules
const r = spawnSync(process.execPath, ['--experimental-vm-modules',
  path.join(PLUGIN_ROOT, 'scripts', 'patch-renderer.mjs'),
  '--asar', asarPath, '--out-dir', buildDir], { timeout: 300000 });
if (r.status === 2) { log('asar 已含补丁(可能已被 /tps-reload 处理), 无需自愈'); process.exit(0); }
if (r.status !== 0) { log(`patcher 退出码 ${r.status}, 放弃本次自愈`); process.exit(1); }
if (!fs.existsSync(path.join(buildDir, 'READY'))) { log('patcher 未产出 READY, 放弃'); process.exit(1); }
log('patcher 完成, 调度换入');

spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
  path.join(PLUGIN_ROOT, 'scripts', 'apply-patch.ps1'),
  '-PatchedPath', path.join(buildDir, 'app.asar.patched')], { stdio: 'ignore', detached: true }).unref();
log('已调度 apply-patch.ps1(等待 ZCode 退出后生效)');
