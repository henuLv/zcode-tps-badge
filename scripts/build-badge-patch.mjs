// 构建 badge-def 补丁：验证徽标源码 -> 组装 replacement -> 全文 6 补丁 module 解析验证 -> 写回配置
// 用法: node --experimental-vm-modules build-badge-patch.mjs <original-styles.js>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const acorn = require(path.join(process.env.ACORN_DIR || '.', 'node_modules', 'acorn', 'dist', 'acorn.js'));

const scriptDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const patchDir = path.resolve(scriptDir, '../patches');
const origPath = process.argv[2];
if (!origPath) { console.error('用法: node build-badge-patch.mjs <original-styles.js>'); process.exit(1); }

// 1. 读徽标源码并单体验证（作为表达式）
const arrowSrc = fs.readFileSync(path.join(patchDir, 'badge-arrow.src.js'), 'utf8');
try {
  acorn.parse(`var __badge = ${arrowSrc};`, { ecmaVersion: 2024, sourceType: 'module' });
  console.log('[ok] 徽标源码单体解析通过');
} catch (e) {
  console.error('徽标源码语法错误:', e.message, JSON.stringify(arrowSrc.slice(Math.max(0, (e.pos || 0) - 80), (e.pos || 0) + 40)));
  process.exit(1);
}
// 压缩: 剔除独立成行的 // 注释与空行, 去行首缩进; 块注释可安全保留
const arrowCompact = arrowSrc
  .split('\n')
  .filter(line => !/^\s*\/\//.test(line) && !/^\s*\/\*[\s\S]*\*\/\s*$/.test(line))
  .map(line => line.trim())
  .join('');

// 2. 组装 replacement（保留 kJt 的闭合 '}'，插入 zcodeTpsBadge 声明，还原 AJt 头）
const anchor = '},AJt=({children:e,loading:t=!1,';
const replacement =
  '},zcodeTpsBadge=(globalThis.__zcodeTpsSet=e=>{globalThis.__zcodeTpsCtx=e},' +
  arrowCompact +
  '),AJt=({children:e,loading:t=!1,';

// 3. 对原版全文应用全部补丁（badge 用新 replacement），module 严格解析验证
const config = JSON.parse(fs.readFileSync(path.join(patchDir, 'renderer-patches.json'), 'utf8'));
let text = fs.readFileSync(origPath, 'utf8');
for (const p of config.patches) {
  const n = text.split(p.anchor).length - 1;
  if (n !== 1) { console.error(`补丁 ${p.id} 锚点命中 ${n} 次`); process.exit(1); }
  text = text.replace(p.anchor, p.id === 'badge-def' ? replacement : p.replacement);
}
if (!text.includes('zcodeTpsBadge')) { console.error('补丁标记缺失'); process.exit(1); }
try {
  new vm.SourceTextModule(text);
  console.log('[ok] 全文 6 补丁 module 严格解析通过');
} catch (e) {
  console.error('module 解析失败:', e.message);
  process.exit(1);
}
// 双保险: acorn 也过一遍
try {
  acorn.parse(text, { ecmaVersion: 2024, sourceType: 'module' });
  console.log('[ok] acorn 全文解析通过');
} catch (e) {
  console.error('acorn 解析失败:', e.message);
  process.exit(1);
}

// 4. 写回配置
const badge = config.patches.find(p => p.id === 'badge-def');
badge.replacement = replacement;
fs.writeFileSync(path.join(patchDir, 'renderer-patches.json'), JSON.stringify(config, null, 2) + '\n');
console.log('[done] badge-def replacement 已更新:', replacement.length, '字符');
