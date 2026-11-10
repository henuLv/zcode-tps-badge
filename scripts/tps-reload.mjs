// /tps-reload 一键编排：重定位锚点 -> 构建 -> 打补丁 -> 冒烟 -> 挂守望者 -> 验证心跳
// 用法: node --experimental-vm-modules scripts/tps-reload.mjs <新版本号>
// 成功标准: 全部子步骤退出码 0 + 守望者心跳三行齐备，之后用户退出 ZCode 等 5 秒重开即可
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
if (!version) { console.error('用法: node --experimental-vm-modules scripts/tps-reload.mjs <版本号>'); process.exit(1); }
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const node = process.execPath;
const FLAG = '--experimental-vm-modules';

function run(name, args, cmd = node) {
  console.log(`\n===== ${name} =====`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: repoRoot });
  if (r.status !== 0) { console.error(`[abort] ${name} 失败 (exit=${r.status})`); process.exit(1); }
}

// 1. 锚点探测+重定位+三处同步（含从 asar 提取 chunk；已打补丁则直接退出成功）
run('relocate-anchors', [FLAG, path.join(scriptDir, 'relocate-anchors.mjs')]);

// 2. badge-def replacement 生成 + module 解析门禁（original 文件，可能不止一个版本，取最新）
const buildDir = path.join(repoRoot, 'logs', 'build');
const originals = fs.readdirSync(buildDir).filter(f => /^original-styles-.*\.js$/.test(f))
  .map(f => ({ f, t: fs.statSync(path.join(buildDir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
if (!originals.length) { console.error('[abort] logs/build 无 original-styles-*.js'); process.exit(1); }
const original = path.join(buildDir, originals[0].f);
console.log(`original = ${originals[0].f}`);
run('build-badge-patch', [FLAG, path.join(scriptDir, 'build-badge-patch.mjs'), original]);

// 3. 打补丁 + 重打包
run('patch-renderer', [FLAG, path.join(scriptDir, 'patch-renderer.mjs'),
  '--asar', 'C:/Program Files/ZCode/resources/app.asar', '--out-dir', 'logs/build']);

// 4. 冒烟测试
run('badge-smoke-test', [FLAG, path.join(scriptDir, 'badge-smoke-test.mjs')]);

// 5. 备份官方 asar + 挂守望者（任务计划程序，RunLevel Highest）
run('register-watcher', ['-NoProfile', '-ExecutionPolicy', 'Bypass',
  '-File', path.join(scriptDir, 'register-watcher.ps1'), '-LogSuffix', version],
  'powershell.exe');

// 6. 心跳验证：8 秒内须出现三行关键日志
import { setTimeout as sleep } from 'node:timers/promises';
await sleep(8000);
const logPath = path.join(repoRoot, '.tmp', `apply-${version}.log`);
const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
const need = ['wrapper started', 'probe: Program Files write OK', 'invoke apply-patch.ps1'];
const missing = need.filter(s => !log.includes(s));
if (missing.length) { console.error(`[abort] 守望者心跳缺失: ${missing.join('; ')}\n日志:\n${log}`); process.exit(1); }
console.log('\n===== 全部完成 =====');
console.log(fs.readFileSync(logPath, 'utf8').trim());
console.log(`\n请完全退出 ZCode -> 等约 5 秒 -> 重新打开（任务 30 分钟时限内）。`);
console.log(`换入结果看 .tmp/apply-${version}.log 出现 PATCHED_OK。`);
