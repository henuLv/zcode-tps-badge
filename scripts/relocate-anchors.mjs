// 锚点自动重定位：提取 styles chunk -> 探测 5 锚点 -> 结构启发式重定位失效锚点 -> 同步三处文件
// 用法: node scripts/relocate-anchors.mjs [styles文件路径]  （省略则从官方 asar 提取）
// 幂等：锚点全部存活时三处文件内容不变（可用于回归验证）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openAsar, walkFiles, findEntry, readEntryBytes } from './asar-lib.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const patchJson = path.join(repoRoot, 'patches', 'renderer-patches.json');
const builderJs = path.join(repoRoot, 'scripts', 'build-badge-patch.mjs');
const smokeJs = path.join(repoRoot, 'scripts', 'badge-smoke-test.mjs');
const buildDir = path.join(repoRoot, 'logs', 'build');
const ASAR = 'C:/Program Files/ZCode/resources/app.asar';
const MARKER = 'zcodeTpsBadge';

function fail(msg) { console.error(`[relocate] ${msg}`); process.exit(1); }
// 混淆名可含 $（如 $5t）：进 RegExp 须转义，进 replace 替换串须防 $N 组引用
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const repAll = (s, from, to) => s.split(from).join(to);
function countOf(text, s) { let n = 0, i = -1; while ((i = text.indexOf(s, i + 1)) !== -1) n++; return n; }
function must1(text, s, what) {
  const n = countOf(text, s);
  if (n !== 1) fail(`${what} 命中 ${n} 次(需 1): ${JSON.stringify(s.slice(0, 80))}`);
  return s;
}

// ---- 1. 拿到 styles 文本 ----
let stylesPath = process.argv[2];
if (!stylesPath) {
  fs.mkdirSync(buildDir, { recursive: true });
  const ctx = openAsar(ASAR);
  const entry = walkFiles(ctx.header).find(
    f => /^\/out\/renderer\/assets\/styles-[A-Za-z0-9_-]+\.js$/.test(f.path) && f.size > 3e6);
  if (!entry) fail('asar 内未找到 styles chunk');
  const buf = readEntryBytes(ctx, findEntry(ctx.header, entry.path));
  fs.closeSync(ctx.fd);
  if (buf.includes(MARKER)) { console.log('[relocate] asar 已含补丁，无需处理'); process.exit(0); }
  stylesPath = path.join(buildDir, path.basename(entry.path));
  fs.writeFileSync(stylesPath, buf);
  fs.writeFileSync(path.join(buildDir, 'original-' + path.basename(entry.path)), buf); // builder 需 original
  console.log(`[relocate] 已提取 ${entry.path} (${buf.length} bytes)`);
}
const text = fs.readFileSync(stylesPath, 'utf8');
if (text.includes(MARKER)) fail('输入文件已含补丁 marker（应传 original）');

// ---- 2. 读当前配置，探测 ----（oldAnchors 必须在更新前快照，byId 与 patches 是同引用）
const config = JSON.parse(fs.readFileSync(patchJson, 'utf8'));
const byId = Object.fromEntries(config.patches.map(p => [p.id, p]));
const oldAnchors = new Map(config.patches.map(p => [p.id, p.anchor]));
const alive = {}, dead = [];
for (const p of config.patches) {
  const n = countOf(text, p.anchor);
  if (n === 1) alive[p.id] = p.anchor; else dead.push({ id: p.id, n });
}
console.log(`[relocate] 存活: ${Object.keys(alive).join(', ') || '无'}; 失效: ${dead.map(d => `${d.id}(${d.n})`).join(', ') || '无'}`);

// ---- 3. 重定位（启发式与 SOP 手工流程一致） ----
const loc = {};
if (!alive['services-stash']) {
  // 唯一跨版本存活的锚也失效 = 结构大改，必须人工
  fail('services-stash 锚失效，结构变化超出自动重定位能力，需人工分析');
}
if (dead.some(d => d.id === 'qzt-stash')) {
  // 工具栏组件体首: workspaceIdentity 解构 + 900 字符窗口过滤
  const re = /function \w+\(\{[^{}]{0,200}workspaceIdentity[^{}]{0,300}/g;
  let m, hit = null;
  while ((m = re.exec(text)) !== null) {
    const win = text.slice(m.index, m.index + 900);
    if (win.includes('openCodingPlanUpgrade') && win.includes('locale:') && win.includes('sessionId')) {
      if (hit) fail('qzt-stash: 工具栏组件启发式命中多个');
      hit = m;
    }
  }
  if (!hit) fail('qzt-stash: 工具栏组件启发式未命中');
  const bodyRe = /\{let\{intl:\w+,locale:\w+\}=q\(\),\{openCodingPlanUpgrade:\w+\}=\w+\(\),\w+=s\?\?`glm`,/;
  const bm = bodyRe.exec(text.slice(hit.index, hit.index + 2000));
  if (!bm) fail('qzt-stash: 体首形态变化（intl/locale/openCodingPlanUpgrade 解构不匹配），需人工');
  loc['qzt-stash'] = { anchor: bm[0] };
  // 签名解构名 -> stash 调用的 ws/wi/sid
  const sig = text.slice(hit.index, hit.index + 900);
  const ws = /workspacePath:(\w+)/.exec(sig), wi = /workspaceIdentity:(\w+)/.exec(sig), sid = /sessionId:(\w+)/.exec(sig);
  if (!ws || !wi || !sid) fail('qzt-stash: 签名缺少 workspacePath/workspaceIdentity/sessionId');
  // 锚点首字符 '{'（函数体开头）由 stash 前缀的 '{' 顶替，避免叠出 '{{'
  loc['qzt-stash'].prefix = `{globalThis.__zcodeTpsSet&&globalThis.__zcodeTpsSet({ws:${ws[1]},wi:${wi[1]},sid:${sid[1]}??null});`;
}
let trigger = null, tailLayer = null;
if (dead.some(d => d.id === 'badge-def')) {
  const r = text.indexOf('transform:`rotate(-90deg)`');
  if (r < 0) fail('badge-def: rotate(-90deg) 圆圈 SVG 未找到');
  const tm = /\},([\w$]+)=\(\{children:e,loading:t=!1,/.exec(text.slice(r, r + 300));
  if (!tm) fail('badge-def: 圆圈后触发器定义形态变化，需人工');
  trigger = tm[1];
  loc['badge-def'] = { anchor: must1(text, tm[0], 'badge-def') };
  console.log(`[relocate] 触发器名: ${trigger}`);
}
if (dead.some(d => d.id === 'mxt-open')) {
  if (!trigger) { const m = /children:\(0,\$\.jsx\)\(`span`,\{className:`inline-flex shrink-0`,children:\(0,\$\.jsx\)\(([\w$]+),\{/.exec(byId['mxt-open'].anchor); trigger = m && m[1]; if (!trigger) fail('mxt-open: 无触发器名可用'); }
  const openRe = new RegExp(
    `children:\\(0,\\$\\.jsx\\)\\(\`span\`,\\{className:\`inline-flex shrink-0\`,children:\\(0,\\$\\.jsx\\)\\(${reEsc(trigger)},\\{"aria-label":\\w+,`);
  const om = openRe.exec(text);
  if (!om) fail('mxt-open: 触发器 span 启发式未命中');
  if (!text.slice(om.index, om.index + 300).includes('data-chat-toolbar-popover-trigger')) fail('mxt-open: 命中处缺少 popover-trigger 特征（可能命中错误位置）');
  loc['mxt-open'] = { anchor: must1(text, om[0], 'mxt-open') };
}
if (dead.some(d => d.id === 'mxt-tail')) {
  const tailRe = /&&\(\w+\|\|\w+\(!0\)\)\}\}\)\}\)\}\),\(0,\$\.jsx\)\(([\w$]+),\{/g;
  let m; const hits = [];
  while ((m = tailRe.exec(text)) !== null) hits.push({ i: m.index, s: m[0], modal: m[1] });
  // 取 mxt-open 位置之后最近的一个
  const openIdx = loc['mxt-open'] ? text.indexOf(loc['mxt-open'].anchor) : text.indexOf(byId['mxt-open'].anchor);
  const after = hits.filter(h => h.i > openIdx && h.i < openIdx + 3000);
  if (after.length !== 1) fail(`mxt-tail: mxt-open 后 3000 字符内命中 ${after.length} 个(需 1)`);
  tailLayer = after[0].modal;
  const anchor = must1(text, after[0].s, 'mxt-tail');
  // 闭合序列硬约束（3.17 适配定型）: 原文 '}})})}),' 补丁后 '}})]})}),'（多出的 ']})' 对应 Fragment 数组闭合）
  if (!anchor.includes('}})})}),')) fail(`mxt-tail: 闭合序列形态变化，需人工: ${anchor}`);
  const tailRep = anchor.replace('}})})}),', '}})]})})}),');
  loc['mxt-tail'] = { anchor, replacement: tailRep };
  console.log(`[relocate] 弹层名: ${tailLayer}`);
}

// ---- 4. 同步三处文件 ----
// renderer-patches.json
const oldTrigM = /\},([\w$]+)=\(\{children:e,loading:t=!1,/.exec(oldAnchors.get('badge-def'));
const oldTrig = oldTrigM && oldTrigM[1];
for (const p of config.patches) {
  const l = loc[p.id];
  if (!l) continue;
  p.anchor = l.anchor;
  if (p.id === 'qzt-stash') p.replacement = l.prefix + l.anchor.slice(1);
  else if (p.id === 'mxt-open') p.replacement = repAll(
    repAll(l.anchor, 'children:(0,$.jsx)(`span`', 'children:(0,$.jsxs)(`span`'),
    `,children:(0,$.jsx)(${trigger},{`,
    `,children:(0,$.jsxs)($.Fragment,{children:[(0,$.jsx)(zcodeTpsBadge,{}),(0,$.jsx)(${trigger},{`);
  else if (p.id === 'mxt-tail') p.replacement = l.replacement;
  // badge-def 的 replacement 由 builder 重新生成；desc 里的旧触发器名顺手更新
  if (oldTrig && oldTrig !== trigger) p.desc = repAll(p.desc, oldTrig, trigger);
}
fs.writeFileSync(patchJson, JSON.stringify(config, null, 2) + '\n');
console.log('[relocate] 已写 renderer-patches.json');

// build-badge-patch.mjs / badge-smoke-test.mjs: 替换触发器名（老触发器名从现有锚点提取）
if (trigger) {
  const old = oldTrig;
  if (old && old !== trigger) {
    for (const [f, pats] of [
      [builderJs, [`},old=({children:e,loading:t=!1,`, `'),old=({children:e,loading:t=!1,`]],
      [smokeJs, [`const END = '),old=({children:e,loading:t=!1,'`]],
    ]) {
      let src = fs.readFileSync(f, 'utf8');
      for (const pat of pats) {
        const from = pat.replaceAll('old', old), to = pat.replaceAll('old', trigger);
        if (!src.includes(from)) fail(`${path.basename(f)} 缺少预期模板: ${from}`);
        src = repAll(src, from, to);
      }
      fs.writeFileSync(f, src);
      console.log(`[relocate] 已同步 ${path.basename(f)} (${old} -> ${trigger})`);
    }
  }
}

// ---- 5. 终检: 新锚点全部唯一命中 ----
for (const p of config.patches) must1(text, p.anchor, `终检 ${p.id}`);
console.log('[relocate] 全部锚点唯一命中，三处文件已同步');
