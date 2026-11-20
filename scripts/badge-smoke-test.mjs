// 徽标逻辑冒烟测试：从补丁产物提取徽标源码，mock React/服务驱动
// 覆盖: 无数据灰色0.0 / 可信值显示且常驻 / 异常口径过滤 / 分级色三档 / 会话切换清空 / 卸载清理
//       / token 累计与格式化 / 悬停 token 细分 / 套餐积分两模式 / 每轮消耗归属与超时记账
//       / 环形缓冲满(200 条)后轮完成判定 / 积分报错信息不重复 / 持续对话超时窗口不重置
//       / readSessionDebug 挂死超时链复活 / 积分接口挂死 credBusy 释放恢复取数
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
const END = '),Srn=({children:e,loading:t=!1,';
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
    const okSvg = svg && svg.props.fill === 'currentColor' && svg.props.stroke === 'none';
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
  const title = el && el.props["data-info"];
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
  const title = el && el.props["data-info"];
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
  const title = el && el.props["data-info"];
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
  const title = el && el.props["data-info"];
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
  const title15 = el && el.props["data-info"];
  const errCount = (String(title15).match(/Coding Plan entitlement refresh failed/g) || []).length;
  const ok = el && el.props.children.length === 7 && errCount === 1;
  if (ok) console.log('[ok] 15 积分接口报错: 元素隐藏, 悬停标注原因且不重复');
  else { console.error('15 失败', { len: el && el.props.children.length, errCount, title: JSON.stringify(title15) }); failures++; }
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
    const ok = expectGen ? (hasAnim && dimmed && el.props["data-info"].includes('生成中'))
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
  // t1: 首次取数, 记累计 1000, 首轮只记录不归属; +N 常驻显示 +0
  runComp(h); runEffects(); await flush();
  const el1 = runComp(h);
  const okBase = credNum(el1) === '1k' && el1.props.children[9] && el1.props.children[9].props.children === '+0'
    && el1.props["data-info"].includes('最近一轮消耗: +0 积分（待首轮结算）');
  // t2(+61s): 常规轮询, 累计未变
  Date.now = () => realNow() + 61000;
  pendingTimer(); await flush();
  const el2 = runComp(h);
  const okNoCost = el2.props.children[9] && el2.props.children[9].props.children === '+0';
  // t3: 新一轮完成(eventKey b) + 服务端累计 1000→1030 → +30 归属本轮
  rounds.push({ eventKey: 'b', tokensPerSecond: 110, generationDurationMs: 12000, usage: { outputTokens: 1320 } });
  credits = 1030;
  Date.now = () => realNow() + 122000;
  pendingTimer(); await flush();
  Date.now = realNow;
  const el3 = runComp(h);
  const costSpan = el3 && el3.props.children[9];
  const okCost = costSpan && costSpan.props.children === '+30'
    && el3.props["data-info"].includes('最近一轮消耗: +30 积分');
  if (okBase && okNoCost && okCost) console.log('[ok] 18 每轮积分: 轮完成锚定基线, 服务端累计+30 后显示 "+30", 悬停注明结算时刻');
  else { console.error('18 失败', { okBase, okNoCost, cost: costSpan && costSpan.props.children, title: JSON.stringify(el3 && el3.props["data-info"]) }); failures++; }
}

// 场景19: 结算加急轮询 8 次上限——之后回落 60s 常规节奏, 不再无限高频打接口
{
  const realNow = Date.now;
  const rounds = [{ eventKey: 'a', tokensPerSecond: 100, generationDurationMs: 30000, usage: { outputTokens: 3000 } }];
  let calls = 0;
  Object.assign(globalThis, { __zcodeTpsCtx: { ws: 'C:/w', wi: '', sid: 's1' },
    __zcodeTpsSvc: {
      zcodeAgentService: { readSessionDebug: async () => ({ rounds: rounds.slice(), networkEntries: [] }) },
      usageStatsService: { getCodingPlanUsageSnapshot: async () => { calls++; return { detail: { model: { totalCredits: 1000 } } }; } },
      providerSettingsService: { getView: async () => ({ providers: [
        { providerId: 'account:bigmodel-individual-coding-plan',
          accountState: { current: true, availability: 'available' },
          effectiveConfig: { access: { type: 'zhipu-account', accountType: 'bigmodel', mode: 'individual-coding-plan', entitled: true } } },
      ] }) },
    } });
  const h = makeReact(undefined);
  let t = 0;
  const step = s => { t += s; Date.now = () => realNow() + t; pendingTimer(); return flush(); };
  runComp(h); runEffects(); await flush();          // 首次取数 calls=1
  rounds.push({ eventKey: 'b', tokensPerSecond: 110, generationDurationMs: 12000, usage: { outputTokens: 1320 } });
  await step(61000);                                 // 检测+加急#1, calls=2
  for (let i = 0; i < 7; i++) await step(15000);     // 加急#2..#8, calls=9
  const okCap = calls === 9;
  await step(15000);                                 // 上限后 15s 不再取数
  const okHold = calls === 9;
  await step(46000);                                 // 距上次 61s, 常规节奏恢复
  const okFall = calls === 10;
  Date.now = realNow;
  if (okCap && okHold && okFall) console.log('[ok] 19 加急上限: 8 次后 15s 不取数, 61s 恢复常规节奏');
  else { console.error('19 失败', { okCap, okHold, okFall, calls }); failures++; }
}

// 场景20: 累计回落重锚——周期重置致累计下降时重锚基线, pending 保留等下一轮上涨
{
  const realNow = Date.now;
  const rounds = [{ eventKey: 'a', tokensPerSecond: 100, generationDurationMs: 30000, usage: { outputTokens: 3000 } }];
  let credits = 1000;
  Object.assign(globalThis, { __zcodeTpsCtx: { ws: 'C:/w', wi: '', sid: 's1' },
    __zcodeTpsSvc: {
      zcodeAgentService: { readSessionDebug: async () => ({ rounds: rounds.slice(), networkEntries: [] }) },
      usageStatsService: { getCodingPlanUsageSnapshot: async () => ({ detail: { model: { totalCredits: credits } } }) },
      providerSettingsService: { getView: async () => ({ providers: [
        { providerId: 'account:bigmodel-individual-coding-plan',
          accountState: { current: true, availability: 'available' },
          effectiveConfig: { access: { type: 'zhipu-account', accountType: 'bigmodel', mode: 'individual-coding-plan', entitled: true } } },
      ] }) },
    } });
  const h = makeReact(undefined);
  let t = 0;
  const step = s => { t += s; Date.now = () => realNow() + t; pendingTimer(); return flush(); };
  runComp(h); runEffects(); await flush();           // 基线 1000
  rounds.push({ eventKey: 'b', tokensPerSecond: 110, generationDurationMs: 12000, usage: { outputTokens: 1320 } });
  credits = 900;                                     // 服务端回落(周期重置)
  await step(61000);                                 // 重锚 900, pending 保留
  const el1 = runComp(h);
  const okRe = el1.props["data-info"].includes('本轮积分结算中') && el1.props.children[9].props.children === '+0';
  credits = 930;                                     // 新周期累计上涨
  await step(15000);                                 // 930>900 → +30 归属本轮
  Date.now = realNow;
  const el2 = runComp(h);
  const okResolve = el2.props.children[9] && el2.props.children[9].props.children === '+30'
    && el2.props["data-info"].includes('最近一轮消耗: +30 积分');
  if (okRe && okResolve) console.log('[ok] 20 回落重锚: 累计下降时重锚基线, 上涨后 +30 正确归属');
  else { console.error('20 失败', { okRe, okResolve, title: JSON.stringify(el2 && el2.props["data-info"]) }); failures++; }
}

// 场景21: pending 10 分钟超时放弃——"结算中"恢复为上一轮 +N, 不再无限悬挂
{
  const realNow = Date.now;
  const rounds = [{ eventKey: 'a', tokensPerSecond: 100, generationDurationMs: 30000, usage: { outputTokens: 3000 } }];
  let credits = 1000;
  Object.assign(globalThis, { __zcodeTpsCtx: { ws: 'C:/w', wi: '', sid: 's1' },
    __zcodeTpsSvc: {
      zcodeAgentService: { readSessionDebug: async () => ({ rounds: rounds.slice(), networkEntries: [] }) },
      usageStatsService: { getCodingPlanUsageSnapshot: async () => ({ detail: { model: { totalCredits: credits } } }) },
      providerSettingsService: { getView: async () => ({ providers: [
        { providerId: 'account:bigmodel-individual-coding-plan',
          accountState: { current: true, availability: 'available' },
          effectiveConfig: { access: { type: 'zhipu-account', accountType: 'bigmodel', mode: 'individual-coding-plan', entitled: true } } },
      ] }) },
    } });
  const h = makeReact(undefined);
  let t = 0;
  const step = s => { t += s; Date.now = () => realNow() + t; pendingTimer(); return flush(); };
  runComp(h); runEffects(); await flush();            // 基线 1000, +0 常驻
  rounds.push({ eventKey: 'b', tokensPerSecond: 110, generationDurationMs: 12000, usage: { outputTokens: 1320 } });
  await step(61000);                                  // 轮完成 → pending, "结算中"
  const el1 = runComp(h);
  const okPend = el1.props['data-info'].includes('本轮积分结算中');
  credits = 1100;                                     // 账涨 → +100 结算
  await step(15000);
  const el2 = runComp(h);
  const okResolved = el2.props.children[9].props.children === '+100';
  rounds.push({ eventKey: 'c', tokensPerSecond: 120, generationDurationMs: 10000, usage: { outputTokens: 1200 } });
  await step(61000);                                  // 新轮 pending(账不涨)
  const el3 = runComp(h);
  const okPend2 = el3.props['data-info'].includes('本轮积分结算中');
  await step(600100);                                 // 推进至 10 分钟超时(137s+600s)
  const el4 = runComp(h);
  const okGiveUp = !el4.props['data-info'].includes('结算中')
    && el4.props.children[9].props.children === '+100';   // 恢复显示上一轮 +100
  Date.now = realNow;
  if (okPend && okResolved && okPend2 && okGiveUp) console.log('[ok] 21 pending 超时: 10 分钟未结算恢复上一轮 +100, 不再无限"结算中"');
  else { console.error('21 失败', { okPend, okResolved, okPend2, okGiveUp }); failures++; }
}

// 场景22: 环形缓冲满(主进程 3.18.x 实测 rounds 上限 200, 轮数不再增长)
// ——末轮 key 变化 + 首轮被挤出仍判定新轮, 长会话积分归属不断链
{
  const realNow = Date.now;
  const mkRound = k => ({ eventKey: 'k' + k, tokensPerSecond: 100, generationDurationMs: 30000, usage: { outputTokens: 3000 } });
  const rounds = Array.from({ length: 200 }, (_, i) => mkRound(i + 1));
  let credits = 1000;
  Object.assign(globalThis, { __zcodeTpsCtx: { ws: 'C:/w', wi: '', sid: 's1' },
    __zcodeTpsSvc: {
      zcodeAgentService: { readSessionDebug: async () => ({ rounds: rounds.slice(), networkEntries: [] }) },
      usageStatsService: { getCodingPlanUsageSnapshot: async () => ({ detail: { model: { totalCredits: credits } } }) },
      providerSettingsService: { getView: async () => ({ providers: [
        { providerId: 'account:bigmodel-individual-coding-plan',
          accountState: { current: true, availability: 'available' },
          effectiveConfig: { access: { type: 'zhipu-account', accountType: 'bigmodel', mode: 'individual-coding-plan', entitled: true } } },
      ] }) },
    } });
  const h = makeReact(undefined);
  runComp(h); runEffects(); await flush();            // 基线 1000, lastRK=k200, lastFK=k1, prevLen=200
  rounds.shift(); rounds.push(mkRound(201));          // 缓冲满: 长度不变, 首轮 k1 被挤出
  credits = 1030;
  Date.now = () => realNow() + 61000;
  pendingTimer(); await flush();
  Date.now = realNow;
  const el = runComp(h);
  const costSpan = el && el.props.children[9];
  const ok = costSpan && costSpan.props.children === '+30'
    && el.props["data-info"].includes('最近一轮消耗: +30 积分');
  if (ok) console.log('[ok] 22 环形缓冲满: 首轮被挤出仍判定新轮, +30 正常归属');
  else { console.error('22 失败', { cost: costSpan && costSpan.props.children, title: JSON.stringify(el && el.props["data-info"]) }); failures++; }
}

// 场景23: pending 超时的跨轮记账——carry 冻结基线不被常规轮询重锚, 超时轮的消耗并入下次归属
{
  const realNow = Date.now;
  const rounds = [{ eventKey: 'a', tokensPerSecond: 100, generationDurationMs: 30000, usage: { outputTokens: 3000 } }];
  let credits = 1000;
  Object.assign(globalThis, { __zcodeTpsCtx: { ws: 'C:/w', wi: '', sid: 's1' },
    __zcodeTpsSvc: {
      zcodeAgentService: { readSessionDebug: async () => ({ rounds: rounds.slice(), networkEntries: [] }) },
      usageStatsService: { getCodingPlanUsageSnapshot: async () => ({ detail: { model: { totalCredits: credits } } }) },
      providerSettingsService: { getView: async () => ({ providers: [
        { providerId: 'account:bigmodel-individual-coding-plan',
          accountState: { current: true, availability: 'available' },
          effectiveConfig: { access: { type: 'zhipu-account', accountType: 'bigmodel', mode: 'individual-coding-plan', entitled: true } } },
      ] }) },
    } });
  const h = makeReact(undefined);
  let t = 0;
  const step = s => { t += s; Date.now = () => realNow() + t; pendingTimer(); return flush(); };
  runComp(h); runEffects(); await flush();             // 基线 1000
  rounds.push({ eventKey: 'b', tokensPerSecond: 110, generationDurationMs: 12000, usage: { outputTokens: 1320 } });
  await step(61000);                                   // 轮完成, 服务端迟迟不涨 → "结算中"
  const el1 = runComp(h);
  const okPend = el1.props['data-info'].includes('本轮积分结算中');
  for (let i = 0; i < 11; i++) await step(60000);      // 10 分钟不结算 → 超时放弃(t=721s)
  const el2 = runComp(h);
  const okGiveUp = !el2.props['data-info'].includes('结算中') && el2.props.children[9].props.children === '+0';
  credits = 1030;                                      // 超时轮的账事后才涨(无新轮在途)
  await step(60000);
  const el3 = runComp(h);                              // carry: 基线仍冻结在 1000, 不被重锚吞掉
  const okFrozen = el3.props.children[9].props.children === '+0';
  rounds.push({ eventKey: 'c', tokensPerSecond: 120, generationDurationMs: 10000, usage: { outputTokens: 1200 } });
  await step(61000);                                   // 新轮归属: 1030-1000=+30(含超时轮)
  Date.now = realNow;
  const el4 = runComp(h);
  const okCarry = el4.props.children[9] && el4.props.children[9].props.children === '+30'
    && el4.props["data-info"].includes('最近一轮消耗: +30 积分');
  if (okPend && okGiveUp && okFrozen && okCarry) console.log('[ok] 23 超时跨轮记账: carry 冻结基线, 超时轮消耗并入下次归属 +30');
  else { console.error('23 失败', { okPend, okGiveUp, okFrozen, okCarry, title: JSON.stringify(el4 && el4.props["data-info"]) }); failures++; }
}

// 场景24: 持续对话下"结算中"不解除——连续轮完成不重置 10 分钟窗口(以首次进入 pending 起算)
{
  const realNow = Date.now;
  const rounds = [{ eventKey: 'a', tokensPerSecond: 100, generationDurationMs: 30000, usage: { outputTokens: 3000 } }];
  let credits = 1000;
  Object.assign(globalThis, { __zcodeTpsCtx: { ws: 'C:/w', wi: '', sid: 's1' },
    __zcodeTpsSvc: {
      zcodeAgentService: { readSessionDebug: async () => ({ rounds: rounds.slice(), networkEntries: [] }) },
      usageStatsService: { getCodingPlanUsageSnapshot: async () => ({ detail: { model: { totalCredits: credits } } }) },
      providerSettingsService: { getView: async () => ({ providers: [
        { providerId: 'account:bigmodel-individual-coding-plan',
          accountState: { current: true, availability: 'available' },
          effectiveConfig: { access: { type: 'zhipu-account', accountType: 'bigmodel', mode: 'individual-coding-plan', entitled: true } } },
      ] }) },
    } });
  const h = makeReact(undefined);
  let t = 0;
  const step = s => { t += s; Date.now = () => realNow() + t; pendingTimer(); return flush(); };
  runComp(h); runEffects(); await flush();              // 基线 1000
  rounds.push({ eventKey: 'b', tokensPerSecond: 110, generationDurationMs: 12000, usage: { outputTokens: 1320 } });
  await step(61000);                                    // 轮 b 完成 → pending, 窗口起点 61s
  rounds.push({ eventKey: 'c', tokensPerSecond: 120, generationDurationMs: 10000, usage: { outputTokens: 1200 } });
  await step(61000);                                    // 轮 c 完成(账未涨) → 仍 pending, 窗口不得重置
  const el1 = runComp(h);
  const okStill = el1.props['data-info'].includes('本轮积分结算中');
  await step(540000);                                   // t=662s: 距首次 pending 601s > 10 分钟 → 放弃
  const el2 = runComp(h);
  const okGiveUp = !el2.props['data-info'].includes('结算中') && el2.props.children[9].props.children === '+0';
  credits = 1060;                                       // b+c+d 的消耗一起入账
  rounds.push({ eventKey: 'd', tokensPerSecond: 130, generationDurationMs: 8000, usage: { outputTokens: 1040 } });
  await step(61000);                                    // 新轮 pending → 差值 +60 一次归属
  Date.now = realNow;
  const el3 = runComp(h);
  const okCarry = el3.props.children[9] && el3.props.children[9].props.children === '+60';
  if (okStill && okGiveUp && okCarry) console.log('[ok] 24 持续对话: 连续轮不重置窗口, 601s 放弃"结算中", 后续一次归属 +60');
  else { console.error('24 失败', { okStill, okGiveUp, okCarry, title: JSON.stringify(el3 && el3.props["data-info"]) }); failures++; }
}

// 场景25: readSessionDebug 挂死(主进程忙/睡眠恢复)——30s 超时兜底让 1s tick 链复活,
// 恢复挂死不再冻结; 无防护时 await 永不返回, tick 末尾 setTimeout 永不注册, 徽标永久冻结。
// 超时兜底走真实计时器(globalThis.__zcodeTpsRaceMs 调小), 不经注入的假计时器
{
  globalThis.__zcodeTpsRaceMs = 15;
  const realNow = Date.now;
  const wall = ms => new Promise(r => setTimeout(r, ms));
  let hang = true;
  Object.assign(globalThis, { __zcodeTpsCtx: { ws: 'C:/w', wi: '', sid: 's1' },
    __zcodeTpsSvc: { zcodeAgentService: { readSessionDebug: () => hang
      ? new Promise(() => {})
      : Promise.resolve({ rounds: [{ tokensPerSecond: 85.5, generationDurationMs: 40000, usage: { outputTokens: 3420 } }], networkEntries: [] }) } } });
  const h = makeReact(undefined);
  runComp(h); runEffects(); await flush();            // 首次 tick: readSessionDebug 挂死, tick 卡在 await
  const el0 = runComp(h);
  const okHang = el0 && tpsNum(el0) === '0.0';
  await wall(30); await flush();                       // 超时兜底 fire → tick 复活, 注册下一轮 timer
  const okAlive1 = typeof pendingTimer === 'function';
  pendingTimer(); await flush();                       // 第二次 tick: 仍挂死 → 再卡 await
  await wall(30); await flush();                       // 再次超时复活 → 链持续
  const okAlive2 = typeof pendingTimer === 'function';
  hang = false;                                        // 服务恢复
  pendingTimer(); await flush();
  Date.now = realNow;
  const el3 = runComp(h);
  const okRecover = el3 && tpsNum(el3) === '85.5';
  if (okHang && okAlive1 && okAlive2 && okRecover) console.log('[ok] 25 readSessionDebug 挂死: 超时兜底复活 tick 链, 恢复后自动显示 85.5');
  else { console.error('25 失败', { okHang, okAlive1, okAlive2, okRecover, tps: el3 && tpsNum(el3) }); failures++; }
}

// 场景26: 积分接口挂死——credBusy 超时兜底释放, 轮询不停摆; 服务恢复后自动取数。
// 无防护时 credBusy 永久 true, 积分永久停在隐藏态
{
  globalThis.__zcodeTpsRaceMs = 15;
  const realNow = Date.now;
  const wall = ms => new Promise(r => setTimeout(r, ms));
  let hang = true, calls = 0;
  Object.assign(globalThis, { __zcodeTpsCtx: { ws: 'C:/w', wi: '', sid: 's1' },
    __zcodeTpsSvc: {
      zcodeAgentService: { readSessionDebug: async () => ({ rounds: [
        { tokensPerSecond: 95, generationDurationMs: 30000, usage: { outputTokens: 2850 } } ], networkEntries: [] }) },
      usageStatsService: { getCodingPlanUsageSnapshot: async () => { calls++;
        return hang ? new Promise(() => {}) : { detail: { model: { totalCredits: 1030 } } }; } },
      providerSettingsService: { getView: async () => ({ providers: [
        { providerId: 'account:bigmodel-individual-coding-plan',
          accountState: { current: true, availability: 'available' },
          effectiveConfig: { access: { type: 'zhipu-account', accountType: 'bigmodel', mode: 'individual-coding-plan', entitled: true } } },
      ] }) },
    } });
  const h = makeReact(undefined);
  runComp(h); runEffects(); await flush();             // tps 取到; fetchCred 挂死(credBusy=true)
  const el0 = runComp(h);
  const okTps = el0 && tpsNum(el0) === '95.0' && el0.props.children.length === 7;
  Date.now = () => realNow() + 2000;
  pendingTimer(); await flush();                       // 挂死期间 tick 链继续, 不阻塞
  const el1 = runComp(h);
  const okNoBlock = el1 && tpsNum(el1) === '95.0' && el1.props.children.length === 7;
  await wall(30); await flush();                       // 超时兜底 → credBusy 释放(fetchCred 本体仍在后台挂)
  hang = false;
  Date.now = () => realNow() + 62000;
  pendingTimer(); await flush();                       // 61s 常规节奏 → fetchCred 重试成功
  await wall(30); await flush();
  Date.now = realNow;
  const el2 = runComp(h);
  const okCred = el2 && credNum(el2) === '1k' && el2.props.children.length === 10;
  if (okTps && okNoBlock && okCred) console.log('[ok] 26 积分接口挂死: 超时兜底释放 credBusy 轮询不停摆, 恢复后自动取数 1k');
  else { console.error('26 失败', { okTps, okNoBlock, okCred, num: credNum(el2), len: el2 && el2.props.children.length }); failures++; }
}
delete globalThis.__zcodeTpsRaceMs;

console.log(failures === 0 ? '全部通过' : failures + ' 个场景失败');
process.exit(failures === 0 ? 0 : 1);
