// 徽标逻辑冒烟测试：从补丁产物提取徽标源码，mock React/服务驱动
// 覆盖: 无数据灰色0.0 / 可信值显示且常驻 / 异常口径过滤 / 分级色三档 / 会话切换清空 / 卸载清理
//       / token 累计与格式化 / 悬停 token 细分
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
const END = '),a7t=({children:e,loading:t=!1,';
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
  // 多槽 useState: 徽标有 tps/积分两个独立 state, 按调用序分槽
  const slots = [stateVal];
  let idx = 0;
  const h = {
    Q: {
      useState: init => {
        const i = idx++;
        if (slots[i] === undefined) slots[i] = init;
        const set = x => { slots[i] = typeof x === 'function' ? x(slots[i]) : x; };
        return [slots[i], set];
      },
      useEffect: fn => effects.push(fn),
    },
    _reset: () => { idx = 0; },
  };
  return h;
}
function runComp(h) {
  h._reset();
  const comp = new Function('Q', '$', 'setTimeout', 'clearTimeout', `return (${arrow});`)(h.Q, $, fakeSetTimeout, fakeClearTimeout);
  return comp();
}
function runEffects() { effects.splice(0).forEach(fn => fn()); }
// children 布局: [0]token图标 [1]token数字 [2]分隔线 [3]闪电svg [4]tps数字 [5]t/s [6]分隔线
// 有套餐积分时尾部 concat: [7]硬币svg [8]积分数字
const tokNum = el => el && el.props.children[1] && el.props.children[1].props.children;
const tpsNum = el => el && el.props.children[4] && el.props.children[4].props.children;
const credNum = el => el && el.props.children[8] && el.props.children[8].props.children;

// 场景1: 无上下文 -> null
{
  globalThis.__zcodeTpsCtx = null; globalThis.__zcodeTpsSvc = null;
  const h = makeReact(undefined);
  const el = runComp(h); runEffects(); await flush();
  const ok1 = el && tpsNum(el) === '0.0' && String(el.props.children[4].props.style.color).includes('foreground-subtle')
    && tokNum(el) === '0';
  if (ok1) console.log('[ok] 1 无数据显示灰色 0.0 / token 0'); else { console.error('1 失败', el && el.props.children); failures++; }
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
  const txt = tpsNum(el);
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
  const txt = tpsNum(el);
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
  const ok4 = el && tpsNum(el) === '0.0';
  if (ok4) console.log('[ok] 4 无可信轮次显示灰色 0.0'); else { console.error('4 失败', el && el.props.children); failures++; }
}

// 场景5: 会话切换清空
{
  globalThis.__zcodeTpsCtx = { ws: 'C:/w', wi: '', sid: 's2' };  // 从 s1 切到 s2
  globalThis.__zcodeTpsSvc = { zcodeAgentService: { readSessionDebug: async () => ({ rounds: [], networkEntries: [] }) } };
  const h = makeReact(85.5);  // 上一个会话的旧值在 state 里（数字）
  runComp(h); runEffects(); await flush();
  const el = runComp(h);
  const ok5 = el && tpsNum(el) === '0.0' && tokNum(el) === '0';
  if (ok5) console.log('[ok] 5 会话切换回到灰色 0.0 / token 0'); else { console.error('5 失败', el && el.props.children); failures++; }
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
    const svg = el && el.props.children[3];
    const num = el && el.props.children[4];
    const ts = el && el.props.children[5];
    const okSvg = svg && svg.props.stroke === 'currentColor';
    const okNum = num && num.props.children === shown &&
      String(num.props.style.color).includes('--color-' + varName) &&
      num.props.style.fontWeight === 600;
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

// 场景9: token 累计(全轮, 含短请求) + k 格式化 + 悬停细分
{
  Object.assign(globalThis, { __zcodeTpsCtx: { ws: 'C:/w', wi: '', sid: 's1' },
    __zcodeTpsSvc: { zcodeAgentService: { readSessionDebug: async () => ({
      rounds: [
        { tokensPerSecond: 100, generationDurationMs: 30000,
          usage: { inputTokens: 1000, outputTokens: 3000, totalTokens: 4000, cacheReadTokens: 500 } },
        { tokensPerSecond: 21667, generationDurationMs: 90,
          usage: { inputTokens: 100, outputTokens: 1950, totalTokens: 2050 } },
      ], networkEntries: []
    }) } } });
  const h = makeReact(undefined);
  runComp(h); runEffects(); await flush();
  const el = runComp(h);
  const title = el && el.props.title;
  // 全轮求和: 4000+2050=6050 → "6.1k"; 输入 1100 · 输出 4950 · 缓存读 500(千分位)
  const okTok = tokNum(el) === '6.1k';
  const okTitle = el && title.includes('6,050 tokens') && title.includes('输入 1,100 · 输出 4,950') && title.includes('缓存读 500');
  if (okTok && okTitle) console.log('[ok] 9 token 累计 6050→6.1k(短请求也计入), 悬停细分输入/输出/缓存');
  else { console.error('9 失败', { tok: tokNum(el), title: JSON.stringify(title) }); failures++; }
}

// 场景10: token 大数值格式化(无 totalTokens 回退 input+output; m 级格式)
{
  globalThis.__zcodeTpsSvc = { zcodeAgentService: { readSessionDebug: async () => ({
    rounds: [
      { tokensPerSecond: 80, generationDurationMs: 30000, usage: { inputTokens: 1500000, outputTokens: 123456 } },
    ], networkEntries: []
  }) } };
  const h = makeReact(undefined);
  runComp(h); runEffects(); await flush();
  const el = runComp(h);
  // 无 totalTokens → input+output = 1623456 → 1.62m
  const ok = el && tokNum(el) === '1.62m';
  if (ok) console.log('[ok] 10 无 totalTokens 回退 input+output, 1,623,456→1.62m');
  else { console.error('10 失败', { tok: tokNum(el) }); failures++; }
}

// 场景11: start-plan 套餐积分——余额桶求和显示, 悬停总量/剩余/百分比/周期
{
  const PEND = new Date('2026-11-30T00:00:00Z').getTime();
  Object.assign(globalThis, { __zcodeTpsCtx: { ws: 'C:/w', wi: '', sid: 's1' },
    __zcodeTpsSvc: {
      zcodeAgentService: { readSessionDebug: async () => ({ rounds: [], networkEntries: [] }) },
      usageStatsService: { getEntitlementSnapshot: async o => {
        if (o.preferredProviderId !== 'account:bigmodel-start-plan') throw new Error('unexpected provider');
        return { quota: { level: 'Start', limits: [
          { usage: 1200, number: 5000, remaining: 3800, periodEnd: PEND },
          { usage: 300, number: 2000, remaining: 1700 },
        ] }, remaining: { count: 5500, percentage: 0.7869 }, subscription: { planName: 'GLM Start' } };
      } },
      providerSettingsService: { getView: async () => ({ providers: [
        { providerId: 'account:bigmodel-start-plan',
          accountState: { current: true, availability: 'available' },
          effectiveConfig: { access: { type: 'zhipu-account', accountType: 'bigmodel', mode: 'start-plan', entitled: true } } },
      ] }) },
    } });
  const h = makeReact(undefined);
  runComp(h); runEffects(); await flush();
  const el = runComp(h);
  const title = el && el.props.title;
  // start-plan 无 7d 口径, 主数字=桶求和累计已用; 悬停总量/剩余/周期
  const okNum = credNum(el) === '1.5k';
  const okTitle = el && title.includes('套餐累计已用: 1,500 / 7,000') && title.includes('剩余 5,500（剩 79%）')
    && title.includes('周期至 2026-11-30') && title.includes('分钟级延迟');
  if (okNum && okTitle) console.log('[ok] 11 start-plan 累计已用 1.5k(桶求和), 悬停总量/剩余/周期');
  else { console.error('11 失败', { num: credNum(el), title: JSON.stringify(title) }); failures++; }
}

// 场景12: 无套餐连接 -> 积分元素隐藏(children 回到 5 个), 原两元素不受影响
{
  Object.assign(globalThis, { __zcodeTpsCtx: { ws: 'C:/w', wi: '', sid: 's1' },
    __zcodeTpsSvc: {
      zcodeAgentService: { readSessionDebug: async () => ({ rounds: [
        { tokensPerSecond: 90, generationDurationMs: 30000, usage: { outputTokens: 2700 } } ], networkEntries: [] }) },
      usageStatsService: { getEntitlementSnapshot: async () => { throw new Error('should not be called'); } },
      providerSettingsService: { getView: async () => ({ providers: [
        { providerId: 'builtin:zai', accountState: null,
          effectiveConfig: { access: { type: 'api-key', apiKey: 'sk-x' } } },
      ] }) },
    } });
  const h = makeReact(undefined);
  runComp(h); runEffects(); await flush();
  const el = runComp(h);
  const ok = el && el.props.children.length === 7 && tpsNum(el) === '90.0';
  if (ok) console.log('[ok] 12 无套餐连接隐藏积分元素, tps 正常显示');
  else { console.error('12 失败', { len: el && el.props.children.length, tps: tpsNum(el) }); failures++; }
}

// 场景13: coding-plan 连接 -> getCodingPlanUsageSnapshot 近30天 totalCredits
{
  Object.assign(globalThis, { __zcodeTpsCtx: { ws: 'C:/w', wi: '', sid: 's1' },
    __zcodeTpsSvc: {
      zcodeAgentService: { readSessionDebug: async () => ({ rounds: [], networkEntries: [] }) },
      usageStatsService: { getCodingPlanUsageSnapshot: async o => {
        if (o.range !== '7d' || !o.timeZone) throw new Error('bad args');
        if (o.preferredProviderId !== 'account:bigmodel-individual-coding-plan') throw new Error('unexpected provider');
        // 与 host 端 Fre/Ore 组装的真实结构对齐: detail.model.totalCredits
        return { detail: { model: { totalCredits: 12345.6, averageDailyCredits: 411.5 } } };
      } },
      providerSettingsService: { getView: async () => ({ providers: [
        { providerId: 'account:bigmodel-individual-coding-plan',
          accountState: { current: true, availability: 'available' },
          effectiveConfig: { access: { type: 'zhipu-account', accountType: 'bigmodel', mode: 'individual-coding-plan', entitled: true } } },
      ] }) },
    } });
  const h = makeReact(undefined);
  runComp(h); runEffects(); await flush();
  const el = runComp(h);
  const title = el && el.props.title;
  const ok = credNum(el) === '12.3k' && title.includes('近7天积分消耗: 12,346') && title.includes('分钟级延迟');
  if (ok) console.log('[ok] 13 coding-plan 近7天积分 12.3k(7d 口径)');
  else { console.error('13 失败', { num: credNum(el), title: JSON.stringify(title) }); failures++; }
}

// 场景14: 剩余比例<=10% 积分数字变红, 20% 内变黄（pct 直接当剩余比例）
{
  const mk = pct => {
    const total = 100, rem = Math.round(100 * pct);
    return { __zcodeTpsCtx: { ws: 'C:/w', wi: '', sid: 's1' },
      __zcodeTpsSvc: {
        zcodeAgentService: { readSessionDebug: async () => ({ rounds: [], networkEntries: [] }) },
        usageStatsService: { getEntitlementSnapshot: async () => ({
          quota: { level: 'Start', limits: [ { usage: total - rem, number: total, remaining: rem } ] },
          remaining: { count: rem, percentage: pct } }) },
        providerSettingsService: { getView: async () => ({ providers: [
          { providerId: 'account:bigmodel-start-plan',
            accountState: { current: true, availability: 'available' },
            effectiveConfig: { access: { type: 'zhipu-account', accountType: 'bigmodel', mode: 'start-plan', entitled: true } } },
        ] }) },
      } };
  };
  for (const [pct, varName] of [[0.08, 'error'], [0.18, 'warning']]) {
    Object.assign(globalThis, mk(pct));
    const h = makeReact(undefined);
    runComp(h); runEffects(); await flush();
    const el = runComp(h);
    const numEl = el && el.props.children[8];
    const ok = numEl && String(numEl.props.style.color || '').includes('--color-' + varName);
    if (!ok) { console.error('14 失败 pct=' + pct, numEl && numEl.props.style); failures++; }
  }
  if (failures === 0) console.log('[ok] 14 积分低额分色: 8%红 / 18%黄');
}

// 场景15: 积分接口报错 -> 无数字(元素隐藏), tooltip 标注错误原因
{
  Object.assign(globalThis, { __zcodeTpsCtx: { ws: 'C:/w', wi: '', sid: 's1' },
    __zcodeTpsSvc: {
      zcodeAgentService: { readSessionDebug: async () => ({ rounds: [], networkEntries: [] }) },
      usageStatsService: { getEntitlementSnapshot: async () => { throw new Error('Coding Plan entitlement refresh failed'); } },
      providerSettingsService: { getView: async () => ({ providers: [
        { providerId: 'account:bigmodel-start-plan',
          accountState: { current: true, availability: 'available' },
          effectiveConfig: { access: { type: 'zhipu-account', accountType: 'bigmodel', mode: 'start-plan', entitled: true } } },
      ] }) },
    } });
  const h = makeReact(undefined);
  runComp(h); runEffects(); await flush();
  const el = runComp(h);
  const ok = el && el.props.children.length === 7 && el.props.title.includes('Coding Plan entitlement refresh failed');
  if (ok) console.log('[ok] 15 积分接口报错: 元素隐藏, 悬停标注原因');
  else { console.error('15 失败', { len: el && el.props.children.length, title: JSON.stringify(el && el.props.title) }); failures++; }
}

// 场景17: 生成中提示——networkEntries 最后一条状态驱动闪电动画/数字变淡/悬停提示
{
  const mk = last => ({ __zcodeTpsCtx: { ws: 'C:/w', wi: '', sid: 's1' },
    __zcodeTpsSvc: { zcodeAgentService: { readSessionDebug: async () => ({
      rounds: [{ tokensPerSecond: 95, generationDurationMs: 30000, usage: { outputTokens: 2850 } }],
      networkEntries: last ? [{ statusType: last, recordedAt: Date.now() }] : []
    }) } } });
  const cases = [
    ['model_request_started', true],
    ['model_stream_stalled', true],
    ['model_retry_scheduled', true],
    ['model_request_completed', false],
    ['model_request_failed', false],
  ];
  let ok17 = true;
  for (const [status, expectGen] of cases) {
    Object.assign(globalThis, mk(status));
    const h = makeReact(undefined);
    runComp(h); runEffects(); await flush();
    const el = runComp(h);
    const bolt = el && el.props.children[3];
    const num = el && el.props.children[4];
    const hasAnim = bolt && String(bolt.props.style.animation || '').includes('zcodeTpsPulse');
    const dimmed = num && num.props.style.opacity === 0.55;
    const ok = expectGen ? (hasAnim && dimmed && el.props.title.includes('生成中'))
      : (!hasAnim && num.props.style.opacity === 1);
    if (!ok) { console.error('17 失败 status=' + status, { hasAnim, dimmed }); ok17 = false; }
  }
  // 无 networkEntries -> 非生成中
  Object.assign(globalThis, mk(null));
  const h = makeReact(undefined);
  runComp(h); runEffects(); await flush();
  const el = runComp(h);
  if (el && !String(el.props.children[3].props.style.animation || '').includes('zcodeTpsPulse')) { /* ok */ }
  else { console.error('17 失败: 空列表仍有动画'); ok17 = false; }
  if (ok17) console.log('[ok] 17 生成中脉动: started/stalled/retry 触发动画+变淡+提示, completed/failed/空 恢复');
  else failures++;
}

// 场景18: 每轮消耗积分——轮完成(eventKey变化)锚定累计基线, 服务端累计上涨后差值归属本轮
{
  const realNow = Date.now;
  const rounds = [{ eventKey: 'a', tokensPerSecond: 100, generationDurationMs: 30000, usage: { outputTokens: 3000 } }];
  let credits = 1000;
  Object.assign(globalThis, { __zcodeTpsCtx: { ws: 'C:/w', wi: '', sid: 's1' },
    __zcodeTpsSvc: {
      zcodeAgentService: { readSessionDebug: async () => ({ rounds: rounds.slice(), networkEntries: [] }) },
      usageStatsService: { getCodingPlanUsageSnapshot: async () => ({
        detail: { model: { totalCredits: credits } } }) },
      providerSettingsService: { getView: async () => ({ providers: [
        { providerId: 'account:bigmodel-individual-coding-plan',
          accountState: { current: true, availability: 'available' },
          effectiveConfig: { access: { type: 'zhipu-account', accountType: 'bigmodel', mode: 'individual-coding-plan', entitled: true } } },
      ] }) },
    } });
  const h = makeReact(undefined);
  // t1: 首次取数, 记累计 1000, 首轮只记录不归属
  runComp(h); runEffects(); await flush();
  const el1 = runComp(h);
  const okBase = credNum(el1) === '1k' && !el1.props.title.includes('最近一轮消耗');
  // t2(+61s): 常规轮询, 累计未变
  Date.now = () => realNow() + 61000;
  pendingTimer(); await flush();
  const el2 = runComp(h);
  const okNoCost = !el2.props.children[9];
  // t3: 新一轮完成(eventKey b) + 服务端累计 1000→1030 → +30 归属本轮
  rounds.push({ eventKey: 'b', tokensPerSecond: 110, generationDurationMs: 12000, usage: { outputTokens: 1320 } });
  credits = 1030;
  Date.now = () => realNow() + 122000;
  pendingTimer(); await flush();
  Date.now = realNow;
  const el3 = runComp(h);
  const costSpan = el3 && el3.props.children[9];
  const okCost = costSpan && costSpan.props.children === '+30'
    && el3.props.title.includes('最近一轮消耗: +30 积分');
  if (okBase && okNoCost && okCost) console.log('[ok] 18 每轮积分: 轮完成锚定基线, 服务端累计+30 后显示 "+30", 悬停注明结算时刻');
  else { console.error('18 失败', { okBase, okNoCost, cost: costSpan && costSpan.props.children, title: JSON.stringify(el3 && el3.props.title) }); failures++; }
}

console.log(failures === 0 ? '全部通过' : failures + ' 个场景失败');
process.exit(failures === 0 ? 0 : 1);
