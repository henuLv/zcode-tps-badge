// 插件缓存同步：repo -> ZCode 插件缓存 + marketplace 副本（单向覆盖，不删除）
// 背景：缓存按 plugin.json version 目录缓存，版本号不升级就不刷新，repo 更新后
// /tps-reload 等命令会加载旧文本旧脚本（3.18.1 适配时踩坑）。本脚本幂等，可反复跑。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginBase = 'C:/Users/24475/.zcode/cli/plugins/cache/local-tps/zcode-tps-badge';
// 缓存按 version 子目录缓存，动态枚举全部版本目录，版本号将来变化也不失效
const targets = fs.readdirSync(pluginBase).filter(n => fs.statSync(path.join(pluginBase, n)).isDirectory())
  .map(n => path.join(pluginBase, n));
targets.push('C:/Users/24475/.zcode/cli/plugins/marketplaces/local-tps');
// 只同步插件运行需要的稳定目录/文件；logs/.tmp/.git 属于工作区残留不同步
const syncDirs = ['commands', 'scripts', 'patches', 'hooks', 'docs', 'vendor'];
const syncFiles = ['marketplace.json', 'README.md'];

function walk(dir, base = '') {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const rel = `${base}${name}`;
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) out.push(...walk(full, `${rel}/`));
    else out.push(rel);
  }
  return out;
}
function same(a, b) {
  if (!fs.existsSync(b)) return false;
  const ba = fs.readFileSync(a), bb = fs.readFileSync(b);
  return ba.equals(bb);
}

let copied = 0, checked = 0;
const jobs = [];
for (const d of syncDirs) jobs.push(...walk(path.join(repoRoot, d), `${d}/`).map(rel => ({ rel, src: path.join(repoRoot, rel) })));
for (const f of syncFiles) jobs.push({ rel: f, src: path.join(repoRoot, f) });

for (const t of targets) {
  if (!fs.existsSync(t)) { console.error(`[skip] 目标不存在: ${t}`); continue; }
  for (const { rel, src } of jobs) {
    checked++;
    const dst = path.join(t, rel);
    if (!same(src, dst)) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      copied++;
      console.log(`[copy] ${t.includes('cache') ? 'cache' : 'marketplace'}/${rel}`);
    }
  }
}
console.log(`[done] 校验 ${checked} 处、覆盖 ${copied} 处（两目标）`);
