// 徽标逻辑冒烟测试：从补丁产物提取徽标源码，mock React/服务驱动
// 覆盖: 无数据灰色0.0 / 可信值显示且常驻 / 异常口径过滤 / 分级色三档 / 会话切换清空 / 卸载清理
// 用法: node scripts/badge-smoke-test.mjs [补丁产物目录]（默认 logs/build，
//       目录内需有 patch-renderer.mjs 产出的 styles-*.js）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openAsar, walkFiles, findEntry, readEntryBytes } from './asar-lib.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.resolve(scriptDir, process.argv[2] || '../logs/build');
const patchedAsar = path.join(buildDir, 'app.asar.patched');
if (!fs.existsSync(patchedAsar)) { console.error(`未找到补丁产物: ${patchedAsar}`); process.exit(1); }
const asarCtx = openAsar(patchedAsar);
const stylesEntry = walkFiles(asarCtx.header).find(
  f => /^\/out\/renderer\/assets\/styles-[A-Za-z0-9_-]+\.js$/.test(f.path) && f.size > 3e6
);
if (!stylesEntry) { console.error('补丁 asar 内未定位到 styles chunk'); process.exit(1); }
const patched = readEntryBytes(asarCtx, findEntry(asarCtx.header, stylesEntry.path)).toString('utf8');
fs.closeSync(asarCtx.fd);
const START = '},zcodeTpsBadge=(globalThis.__zcodeTpsSet=e=>{globalThis.__zcodeTpsCtx=e},';
const END = '),AJt=({children:e,loading:t=!1,';
const s = patched.indexOf(START), e2 = patched.indexOf(END, s);
if (s < 0 || e2 < 0) { console.error('未找到徽标源码'); process.exit(1); }
const arrow = patched.slice(s + START.length, e2);

let failures = 0;
let effects = [];
let pendingTimer = null, cleared = 0;
const fakeSetTimeout = fn => { pendingTimer = fn; return 1; };
const fakeClearTimeout = () => { cleared++; };
const $ = { jsx: (t, p) => ({ type: t, props: p }), jsxs: (t, p) => ({ type: t, props: p }) };
async function flush() { await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r)); }

function makeReact(stateVal) {
  effects = [];
  let cur = stateVal;
  return {
    Q: {
      useState: init => [cur === undefined ? init : cur, x => { cur = typeof x === 'function' ? x(cur) : x; }],
      useEffect: fn => effects.push(fn),
    },
  };
}
function runComp(h) {
  const comp = new Function('Q', '$', 'setTimeout', 'clearTimeout', `return (${arrow});`)(h.Q, $, fakeSetTimeout, fakeClearTimeout);
  return comp();
}
function runEffects() { effects.splice(0).forEach(fn => fn()); }

// 场景1: 无上下文 -> null
{
  globalThis.__zcodeTpsCtx = null; globalThis.__zcodeTpsSvc = null;
  const h = makeReact(undefined);
  const el = runComp(h); runEffects(); await flush();
  const ok1 = el && el.props.children[1].props.children === '0.0' && String(el.props.children[1].props.style.color).includes('foreground-subtle');
  if (ok1) console.log('[ok] 1 无数据显示灰色 0.0'); else { console.error('1 失败', el && el.props.children); failures++; }
}

// 场景2: 可信轮次(60s/2万token→但需<500) -> 显示且常驻(远超6s仍显示)
{
  globalThis.__zcodeTpsCtx = { ws: 'C:/w', wi: '', sid: 's1' };
  globalThis.__zcodeTpsSvc = { zcodeAgentService: { readSessionDebug: async () => ({
    rounds: [
      { tokensPerSecond: 85.5, generationDurationMs: 40000, usage: { outputTokens: 3420 }, recordedAt: Date.now() - 600000 },
    ], networkEntries: []
  }) } };
  const h = makeReact(undefined);
  runComp(h); runEffects(); await flush();
  const el = runComp(h);
  const txt = el && el.props.children[1].props.children;
  if (el && txt === '85.5') console.log('[ok] 2 可信值 85.5 显示(10分钟前的数据仍常驻)'); else { console.error('2 失败', el); failures++; }
}

// 场景3: 异常口径过滤 -> 跳过短请求/超大速率, 取可信轮次
{
  globalThis.__zcodeTpsSvc = { zcodeAgentService: { readSessionDebug: async () => ({
    rounds: [
      { tokensPerSecond: 88.2, generationDurationMs: 30000, usage: { outputTokens: 2646 } },   // 可信
      { tokensPerSecond: 21667, generationDurationMs: 90, usage: { outputTokens: 1950 } },     // 短请求, 应跳过
      { tokensPerSecond: 3000, generationDurationMs: 500, usage: { outputTokens: 1500 } },     // >=500, 应跳过
      { tokensPerSecond: 120, generationDurationMs: 5000, usage: { outputTokens: 30 } },       // 输出<50, 应跳过
    ], networkEntries: []
  }) } };
  const h = makeReact(undefined);
  runComp(h); runEffects(); await flush();
  const el = runComp(h);
  const txt = el && el.props.children[1].props.children;
  if (el && txt === '88.2') console.log('[ok] 3 过滤异常口径, 取 88.2'); else { console.error('3 失败', el && el.props.children); failures++; }
}

// 场景4: 只有异常轮次 -> 不显示
{
  globalThis.__zcodeTpsSvc = { zcodeAgentService: { readSessionDebug: async () => ({
    rounds: [
      { tokensPerSecond: 21667, generationDurationMs: 90, usage: { outputTokens: 1950 } },
      { tokensPerSecond: 45, generationDurationMs: 100, usage: { outputTokens: 5 } },
    ], networkEntries: []
  }) } };
  const h = makeReact(undefined);
  runComp(h); runEffects(); await flush();
  const el = runComp(h);
  const ok4 = el && el.props.children[1].props.children === '0.0';
  if (ok4) console.log('[ok] 4 无可信轮次显示灰色 0.0'); else { console.error('4 失败', el && el.props.children); failures++; }
}

// 场景5: 会话切换清空
{
  globalThis.__zcodeTpsCtx = { ws: 'C:/w', wi: '', sid: 's2' };  // 从 s1 切到 s2
  globalThis.__zcodeTpsSvc = { zcodeAgentService: { readSessionDebug: async () => ({ rounds: [], networkEntries: [] }) } };
  const h = makeReact(85.5);  // 上一个会话的旧值在 state 里（数字）
  runComp(h); runEffects(); await flush();
  const el = runComp(h);
  const ok5 = el && el.props.children[1].props.children === '0.0';
  if (ok5) console.log('[ok] 5 会话切换回到灰色 0.0'); else { console.error('5 失败', el && el.props.children); failures++; }
}

// 场景6: 卸载清理定时器
{
  const effects2 = [];
  const Q2 = { useState: () => [null, () => {}], useEffect: fn => effects2.push(fn) };
  const comp = new Function('Q', '$', 'setTimeout', 'clearTimeout', `return (${arrow});`)(Q2, $, fakeSetTimeout, fakeClearTimeout);
  comp();
  const cleanups = effects2.splice(0).map(fn => fn());
  await flush();
  cleanups.forEach(fn => fn());
  if (cleared > 0) console.log('[ok] 6 卸载清理定时器'); else { console.error('6 失败: 未清理'); failures++; }
}

// 场景7: 分级色断言(≥80绿/40-80黄/<40红; 闪电恒灰; 数字16px灰闪电)
{
  const mk = rate => ({ __zcodeTpsCtx: { ws: 'C:/w', wi: '', sid: 's1' },
    __zcodeTpsSvc: { zcodeAgentService: { readSessionDebug: async () => ({
      rounds: [{ tokensPerSecond: rate, generationDurationMs: 30000, usage: { outputTokens: 3654 } }], networkEntries: []
    }) } } });
  const cases = [[121.8, '122', 'success'], [79.9, '79.9', 'warning'], [39.5, '39.5', 'error']];
  for (const [rate, shown, varName] of cases) {
    Object.assign(globalThis, mk(rate));
    const h = makeReact(undefined);
    runComp(h); runEffects(); await flush();
    const el = runComp(h);
    const svg = el && el.props.children[0];
    const num = el && el.props.children[1];
    const ts = el && el.props.children[2];
    const okSvg = svg && svg.props.stroke === 'currentColor';
    const okNum = num && num.props.children === shown &&
      String(num.props.style.color).includes('--color-' + varName) &&
      num.props.style.fontWeight === 700;
    const okTs = ts && ts.props.children === 't/s' && !ts.props.style.color;
    if (!(el && okSvg && okNum && okTs)) {
      console.error('7 失败 rate=' + rate, { okSvg, okNum, okTs, color: num && num.props.style.color });
      failures++;
    }
  }
  if (failures === 0) console.log('[ok] 7 分级色: 121.8绿/79.9黄/39.5红, 灰闪电, 数字16px灰闪电');
}

// 场景8: 悬停 title 显示会话加权平均（总输出÷总时长）
{
  Object.assign(globalThis, { __zcodeTpsCtx: { ws: 'C:/w', wi: '', sid: 's1' },
    __zcodeTpsSvc: { zcodeAgentService: { readSessionDebug: async () => ({
      rounds: [
        { tokensPerSecond: 100, generationDurationMs: 30000, usage: { outputTokens: 3000 } },
        { tokensPerSecond: 110, generationDurationMs: 12000, usage: { outputTokens: 1320 } },
        { tokensPerSecond: 21667, generationDurationMs: 90, usage: { outputTokens: 1950 } },
      ], networkEntries: []
    }) } } });
  const h = makeReact(undefined);
  runComp(h); runEffects(); await flush();
  const el = runComp(h);
  const title = el && el.props.title;
  // 数组尾=最新: 最近轮=110; 加权平均=(3000+1320)*1000/(30000+12000)=102.9→103; 短请求不入账
  const ok = el && title.includes('最近一轮: 110 t/s') && title.includes('会话平均: 103') && title.includes('2 轮长回复');
  if (ok) console.log('[ok] 8 悬停: 最近轮 110 + 会话平均 103 t/s(2 轮加权), 短请求不计入');
  else { console.error('8 失败', JSON.stringify(title)); failures++; }
}

console.log(failures === 0 ? '全部通过' : failures + ' 个场景失败');
process.exit(failures === 0 ? 0 : 1);
