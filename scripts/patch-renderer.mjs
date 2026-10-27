// ZCode 渲染器 TPS 徽标补丁器
// 用法: node patch-renderer.mjs --asar "C:/Program Files/ZCode/resources/app.asar" --out-dir <dir>
// 流程: 定位 styles chunk -> 校验锚点唯一 -> 应用补丁 -> 语法检查 -> 重打包 -> 回读验证
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openAsar, walkFiles, findEntry, readEntryBytes, repackWithReplacement } from './asar-lib.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(scriptDir, '../patches/renderer-patches.json'), 'utf8'));

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) args[argv[i]] = argv[i + 1];
  if (!args['--asar'] || !args['--out-dir']) {
    console.error('用法: node patch-renderer.mjs --asar <app.asar> --out-dir <输出目录>');
    process.exit(1);
  }
  return args;
}

function countOccurrences(text, needle) {
  let n = 0, i = 0;
  while ((i = text.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
  return n;
}

function syntaxCheck(label, file) {
  const r = spawnSync(process.execPath, ['--check', file], { timeout: 120000 });
  if (r.status !== 0) {
    console.error(`[语法检查失败] ${label}`);
    console.error(r.stderr.toString().slice(0, 2000));
    process.exit(1);
  }
  console.log(`[ok] 语法检查通过: ${label}`);
}

const args = parseArgs(process.argv);
const asarPath = args['--asar'];
const outDir = args['--out-dir'];
fs.mkdirSync(outDir, { recursive: true });

const ctx = openAsar(asarPath);
const allFiles = walkFiles(ctx.header);
const candidates = allFiles.filter(f => !f.unpacked && new RegExp(config.targetPattern).test(f.path) && f.size >= config.minSizeBytes);
console.log(`styles 候选: ${candidates.map(f => `${f.path} (${(f.size / 1048576).toFixed(1)}MB)`).join(', ') || '无'}`);
if (candidates.length === 0) process.exit(1);

let target = null, originalText = '';
const anchorReport = [];
for (const cand of candidates) {
  const entry = findEntry(ctx.header, cand.path);
  const text = readEntryBytes(ctx, entry).toString('utf8');
  if (text.includes(config.patchedMarker)) {
    console.log(`该 asar 已包含 TPS 徽标补丁（${cand.path}），无需重复处理。`);
    process.exit(2);
  }
  const counts = config.patches.map(p => ({ id: p.id, n: countOccurrences(text, p.anchor) }));
  if (counts.every(c => c.n === 1)) { target = cand; originalText = text; break; }
  anchorReport.push({ path: cand.path, counts });
}
if (!target) {
  console.error('没有任何 styles 候选同时满足全部锚点唯一，ZCode 版本可能已变化。各候选锚点情况:');
  for (const r of anchorReport) console.error(r.path, JSON.stringify(r.counts));
  process.exit(1);
}
console.log(`[ok] 目标 chunk: ${target.path}`);

let patched = originalText;
for (const p of config.patches) {
  const n = countOccurrences(patched, p.anchor);
  if (n !== 1) {
    console.error(`补丁 ${p.id} 锚点出现 ${n} 次（应为 1），中止。`);
    process.exit(1);
  }
  patched = patched.replace(p.anchor, p.replacement);
  console.log(`[ok] 应用补丁: ${p.id} — ${p.desc}`);
}
if (!patched.includes(config.patchedMarker)) {
  console.error('补丁标记缺失，中止。');
  process.exit(1);
}

const patchedPath = path.join(outDir, path.basename(target.path));
fs.writeFileSync(patchedPath, patched, 'utf8');
const originalPath = path.join(outDir, 'original-' + path.basename(target.path));
fs.writeFileSync(originalPath, originalText, 'utf8');
syntaxCheck(`原始 ${path.basename(target.path)}`, originalPath);
syntaxCheck(`补丁后 ${path.basename(target.path)}`, patchedPath);

// renderer 以 <script type=module> 加载，必须通过 module 严格解析（node --check 会假阴性）
let moduleCheckAvailable = false;
try {
  const vm = await import('node:vm');
  if (vm.SourceTextModule) {
    moduleCheckAvailable = true;
    new vm.SourceTextModule(patched);
    console.log('[ok] module 严格解析通过（补丁后）');
  }
} catch (e) {
  console.error(`[module 解析失败] ${e.message}`);
  console.error('渲染器会因此白屏，禁止产出补丁。');
  process.exit(1);
}
if (!moduleCheckAvailable) {
  console.error('[警告] 当前 node 未启用 --experimental-vm-modules，跳过 module 解析门禁（不可靠）。');
  process.exit(1);
}

const outAsar = path.join(outDir, 'app.asar.patched');
const info = repackWithReplacement(asarPath, target.path, Buffer.from(patched, 'utf8'), outAsar);
console.log(`[ok] 重打包: ${outAsar} (${(info.newFileSize / 1048576).toFixed(1)}MB, styles 负载偏移 ${info.tailOffset})`);

// 回读验证：文件数一致、styles 字节一致、抽样其他文件字节一致
const vctx = openAsar(outAsar);
const vfiles = walkFiles(vctx.header);
if (vfiles.length !== allFiles.length) {
  console.error(`回读文件数不一致: ${vfiles.length} != ${allFiles.length}`);
  process.exit(1);
}
const vstyles = readEntryBytes(vctx, findEntry(vctx.header, target.path)).toString('utf8');
if (vstyles !== patched) { console.error('回读 styles 与补丁产物不一致'); process.exit(1); }
const samples = ['/package.json', '/out/main/index.js', '/out/preload/index.cjs'].filter(p => findEntry(ctx.header, p));
for (const s of samples) {
  const a = readEntryBytes(ctx, findEntry(ctx.header, s));
  const b = readEntryBytes(vctx, findEntry(vctx.header, s));
  if (!a.equals(b)) { console.error(`抽样不一致: ${s}`); process.exit(1); }
  console.log(`[ok] 抽样一致: ${s} (${(a.length / 1024).toFixed(0)}KB)`);
}
for (const c of [vctx, ctx]) fs.closeSync(c.fd);

fs.writeFileSync(path.join(outDir, 'READY'), `${new Date().toISOString()} target=${target.path}\n`);
console.log('[done] 补丁产物已就绪:', outAsar);
console.log('下一步: 关闭 ZCode 后运行 apply-patch.ps1 换入补丁文件（或由自愈 hook 自动完成）。');
