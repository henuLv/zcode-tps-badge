// TPS 徽标自愈：ZCode 升级覆盖 app.asar 后自动重新打补丁（需 opt-in）
// 触发: SessionStart hook（hooks/hooks.optin.json）。未放 .selfheal-enabled 标记时立即退出。
// 行为: 检查标记 -> 冷却检查(1h) -> asar 已含补丁则退出 -> 否则后台重打补丁并调度换入，绝不阻塞会话。
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const PLUGIN_ROOT = process.env.ZCODE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const LOG_DIR = path.join(PLUGIN_ROOT, 'logs');
const STATE_FILE = path.join(LOG_DIR, 'selfheal-state.json');
const NODE_EXE = process.execPath;

function log(msg) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(path.join(LOG_DIR, 'selfheal.log'), `${new Date().toISOString()} ${msg}\n`);
  } catch { /* 日志失败不影响主流程 */ }
}

async function main() {
  if (!fs.existsSync(path.join(PLUGIN_ROOT, '.selfheal-enabled'))) return;
  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (Date.now() - (state.lastRun ?? 0) < 3600 * 1000) return;
  } catch { /* 无状态文件，继续 */ }
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({ lastRun: Date.now() }));

  const asarPath = 'C:/Program Files/ZCode/resources/app.asar';
  const { openAsar, walkFiles, findEntry, readEntryBytes } = await import(
    pathToFileURL(path.join(PLUGIN_ROOT, 'scripts', 'asar-lib.mjs'))
  );
  const ctx = openAsar(asarPath);
  try {
    const styles = walkFiles(ctx.header).find(
      f => /^\/out\/renderer\/assets\/styles-[A-Za-z0-9_-]+\.js$/.test(f.path) && f.size > 3e6
    );
    const text = styles ? readEntryBytes(ctx, findEntry(ctx.header, styles.path)).toString('utf8') : '';
    if (styles && text.includes('zcodeTpsBadge')) {
      log('已打补丁，无需处理');
      return;
    }
    log(`检测到未打补丁（styles=${styles ? styles.path : '未找到'}），后台重打补丁`);
  } finally {
    fs.closeSync(ctx.fd);
  }

  // 整条 patch→swap 链交给独立的 detached 进程: hook 只有 60s 时限, 且本进程派生
  // patcher 后立即退出, on('exit') 衔接换入的方案在 hook 场景下永远不会执行
  const chain = spawn(NODE_EXE, [path.join(PLUGIN_ROOT, 'scripts', 'selfheal-apply.cjs')], { stdio: 'ignore', detached: true });
  chain.unref();
  log('已派发后台自愈链 selfheal-apply（patch→换入）');
}

main().catch(e => log('自愈异常: ' + (e && e.message)));
