// TPS 徽标箭头函数源码（会被 build-badge-patch.mjs 验证后嵌入渲染器补丁）
// 数据链: globalThis.__zcodeTpsSvc(zcodeAgentService) + __zcodeTpsCtx(workspacePath/sid)
// 口径(参考 zcode-token-usage-statusbar turn-stats.js): 生成时长>=200ms 且 <1h,
// 输出 token>=50, 速率<500 t/s; 数字取最近一个可信轮次, 悬停显示会话全局平均
// (主进程 rounds 为环形缓冲, 3.18.x~3.19.x 实测上限 200 条, 满后轮数不再增长)
// (可信轮次总输出 ÷ 总时长, 加权平均); 永久常驻(无数据显示 0, 灰色),
// 会话切换清空; 数字分级色: <40 红 40-80 橙黄 >=80 绿; 闪电与 t/s 恒灰
// token 累计: 左侧数据库图标 + 数字(全轮 usage.totalTokens 求和, 输入+输出),
// 格式 <1k 原值 / <1m x.xk / >=1m x.xxm, 悬停 tooltip 展示输入/输出/缓存细分
// 积分元素: 硬币图标 + 近7天积分消耗(服务端 7d 口径, 非估算), 数据链与官方
// "用量"页同源——providerSettingsService.getView() 找当前 zhipu-account 连接
// (mode=start-plan / individual-coding-plan, 准入参考官方 WP/KP),
// usageStatsService 取数: coding-plan → getCodingPlanUsageSnapshot(range 7d)
// → detail.model.totalCredits; start-plan → getEntitlementSnapshot 余额桶
// (Σusage=累计已用, billing/balance 无 7d 口径, 显示套餐周期累计);
// 60s 轮询, 服务端统计有分钟级延迟(tooltip 注明), 失败保留旧值并标注,
// 无套餐连接时隐藏积分元素
() => {
  if (typeof document !== "undefined" && !document.getElementById("zcodeTpsPulseStyle")) {
    const st = document.createElement("style");
    st.id = "zcodeTpsPulseStyle";
    st.textContent = "@keyframes zcodeTpsPulse{0%,100%{opacity:1}50%{opacity:0.25}}";
    document.head.appendChild(st);
  }
  let [v, setV] = (0, Q.useState)(null);
  let [c, setC] = (0, Q.useState)(null);
  const okV = v != null && Number.isFinite(v.v);
  const okT = v != null && Number.isFinite(v.tok);
  const okC = c != null && Number.isFinite(c.used);
  const okG = v != null && !!v.gen;
  // 积分结算等待分钟数(服务端分钟级延迟, 持续对话时可能连跨数轮才入账)
  const pmins = okC && c.pend && c.pendSince ? Math.round((Date.now() - c.pendSince) / 60000) : 0;
  const fmt = n => {
    if (!Number.isFinite(n)) return "0";
    if (n < 1000) return String(Math.round(n));
    if (n < 1e6) { const x = n / 1000; return (x >= 100 ? Math.round(x) : Math.round(x * 10) / 10) + "k"; }
    const x = n / 1e6; return (x >= 10 ? Math.round(x) : Math.round(x * 100) / 100) + "m";
  };
  const grp = n => Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "0";
  const dfmt = t => {
    const d = new Date(t);
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  };
  const hfmt = t => {
    const d = new Date(t);
    return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
  };
  // 悬浮卡片: 命令式 DOM 直接挂 body——脱离 React 渲染树与工具栏祖先 transform
  // (fixed 定位永准), document 级 mouseover/out 委托触发(任何界面必触发),
  // 每次渲染同步内容与位置(数据每秒刷新, hover 期间自动跟随)
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // 卡片主题自适应: 卡片是命令式 DOM(不进 React 树), 拿不到组件级主题——读根节点
  // --color-foreground-subtle 亮度推断明暗(徽标本体用语义 CSS 变量天然自适应, 仅卡片需要)
  // 前景色亮 = 深色主题; 读取失败一律按深色(历史默认)。
  // 解析不用正则拆文本: 变量原文本可能是 8 位 hex/color-mix/oklch 等(#e5e5e599 会被
  // \d+ 拆成 [5,5,5] 亮度 5, 深色误判浅色致卡片变白, 11-21 真机反馈), 这里用探针元素
  // 让 CSS 引擎解析 var()/color-mix() 全链, computed color 喂 canvas 归一化成 sRGB 读亮度
  const th = (() => {
    let dark = true;
    try {
      if (typeof document !== "undefined" && typeof getComputedStyle === "function") {
        const raw = getComputedStyle(document.documentElement).getPropertyValue("--color-foreground-subtle") || "";
        if (raw) {
          const probe = document.createElement("span");
          probe.style.color = "var(--color-foreground-subtle)";
          (document.body || document.documentElement).appendChild(probe);
          const resolved = getComputedStyle(probe).color || "";
          probe.remove();
          if (resolved) {
            const cv = document.createElement("canvas");
            const cx2 = cv.getContext && cv.getContext("2d");
            if (cx2) {
              cx2.fillStyle = "#010203";
              cx2.fillStyle = resolved;
              if (cx2.fillStyle !== "#010203") {
                cx2.fillRect(0, 0, 1, 1);
                const d = cx2.getImageData(0, 0, 1, 1).data;
                dark = (0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2]) > 140;
              }
            }
          }
        }
      }
    } catch (e) { /* 读取失败按深色 */ }
    return dark ? {
      bg: "rgba(24,24,28,0.98)", border: "rgba(255,255,255,0.10)", shadow: "0 8px 28px rgba(0,0,0,0.5)",
      txt: "#e5e7eb", label: "#9ca3af", dim: "#8b8f98", line: "rgba(255,255,255,0.08)",
      ok: "#3ecf6e", warn: "#f0a13a", err: "#ef4444"
    } : {
      bg: "rgba(255,255,255,0.98)", border: "rgba(0,0,0,0.12)", shadow: "0 8px 28px rgba(0,0,0,0.18)",
      txt: "#1f2328", label: "#6b7280", dim: "#8b8f98", line: "rgba(0,0,0,0.10)",
      ok: "#1a7f37", warn: "#9a6700", err: "#cf222e"
    };
  })();
  const cardCss = "position:fixed;z-index:2147483000;pointer-events:none;width:252px;padding:10px 12px;border-radius:10px;background:" + th.bg
    + ";border:1px solid " + th.border + ";box-shadow:" + th.shadow
    + ";font-size:12px;line-height:18px;color:" + th.txt + ";font-variant-numeric:tabular-nums;text-align:left;white-space:nowrap;overflow:hidden"
    + ";transition:opacity 120ms ease";
  const cRow = (lb, vl, vc) => '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:16px"><span style="color:' + th.label + '">' + lb + '</span><span style="font-weight:600;color:' + (vc || th.txt) + '">' + vl + "</span></div>";
  const cSub = tx => '<div style="color:' + th.dim + ';font-size:11px;line-height:15px;margin-top:2px">' + tx + "</div>";
  const cDv = '<div style="height:1px;background:' + th.line + ';margin:7px 0"></div>';
  const cHtml = (() => {
    let ct = '<div style="display:flex;align-items:baseline;gap:6px">'
      + '<span style="font-size:19px;font-weight:700;line-height:22px;color:' + (!okV ? th.label : v.v >= 80 ? th.ok : v.v >= 40 ? th.warn : th.err) + '">'
      + (!okV ? "0.0" : v.v >= 100 ? v.v.toFixed(0) : v.v.toFixed(1)) + '</span>'
      + '<span style="color:' + th.label + '">t/s 最近一轮' + (okV && v.dur >= 1000 ? " · " + (v.dur / 1000).toFixed(1) + "s" : "") + '</span>'
      + '<span style="margin-left:auto;color:' + th.label + ';font-size:11px">'
      + (!okV ? "暂无长回复数据" : "会话平均 " + (v.avg >= 100 ? v.avg.toFixed(0) : v.avg.toFixed(1)) + " t/s · " + v.n + " 轮")
      + "</span></div>" + cDv
      + cRow("本次对话", grp(okT ? v.tok : 0) + " tok")
      + cSub("输入 " + grp(okT ? v.tin : 0) + " · 输出 " + grp(okT ? v.tout : 0)
        + (okT && v.treason > 0 ? " · 思考 " + grp(v.treason) : "")
        + (okT && v.tcr > 0 ? " · 缓存读 " + grp(v.tcr) : "") + (okT && v.tcw > 0 ? " · 缓存写 " + grp(v.tcw) : "")
        + (okT && v.hit != null ? "（会话命中 " + Math.round(v.hit * 100) + "%）" : ""));
    if (okC) {
      ct += cDv + cRow(c.planKind === "start-plan" ? "套餐累计已用" : "近7天积分", grp(c.used),
        c.pct != null && c.pct <= 0.1 ? "#ef4444" : c.pct != null && c.pct <= 0.2 ? "#f0a13a" : null);
      if (c.planKind === "start-plan") {
        ct += cSub("剩余 " + (Number.isFinite(c.rem) ? grp(c.rem) : "-") + (c.pct != null ? "（剩 " + Math.round(c.pct * 100) + "%）" : "")
          + (c.pEnd ? " · 周期至 " + dfmt(c.pEnd) : ""));
      }
      ct += cRow("最近一轮", c.pend ? (pmins >= 1 ? "结算中 · 已 " + pmins + " 分钟" : "结算中…") : "+" + grp(c.lastCost) + (c.lastCostAt ? " · " + hfmt(c.lastCostAt) : " · 待首轮结算"),
        c.pend ? th.label : th.ok);
    } else if (c != null && c.err) {
      ct += cDv + cSub("积分: " + esc(c.err) + " · 将自动重试");
    }
    ct += '<div style="margin-top:7px;padding-top:7px;border-top:1px solid ' + th.line + ';color:' + th.dim + ';font-size:11px;line-height:15px">'
      + (okG ? "生成中 · 本轮完成后更新" : "更新 " + (okC ? hfmt(c.at) : "-") + " · 服务端统计有分钟级延迟")
      + (okV && v.model ? " · " + esc(v.model) : "") + "</div>";
    return ct;
  })();
  globalThis.__zcodeTpsSyncCard = () => {
    const d = globalThis.__zcodeTpsCardEl;
    if (!d) return;
    const b = typeof document !== "undefined" ? document.querySelector("[data-zcode-tps-badge]") : null;
    if (!b) { d.remove(); globalThis.__zcodeTpsCardEl = null; return; }
    // 每次同步重设样式: 主题动态切换后, 已打开的卡片也要换配色;
    // cssText 整体重置会抹掉淡出中的 opacity, 按隐藏标记恢复
    d.style.cssText = cardCss;
    if (globalThis.__zcodeTpsCardHiding) d.style.opacity = 0;
    d.innerHTML = cHtml;
    const r = b.getBoundingClientRect();
    const w = d.offsetWidth || 252;
    const hgt = d.offsetHeight || 150;
    // 默认底边贴徽标顶(上方弹出); 上方放不下时改为徽标下方弹出, 水平按实际宽度居中并夹紧屏内
    let cx = r.left + r.width / 2;
    const half = w / 2;
    if (cx - half < 8) cx = 8 + half;
    if (cx + half > window.innerWidth - 8) cx = window.innerWidth - 8 - half;
    const above = r.top - 12 - hgt >= 8;
    d.style.left = cx + "px";
    d.style.top = (above ? r.top - 12 : r.bottom + 12) + "px";
    d.style.transform = above ? "translate(-50%,-100%)" : "translate(-50%,0)";
  };
  globalThis.__zcodeTpsShowCard = () => {
    const hT = globalThis.__zcodeTpsHideTimer;
    if (hT) { globalThis.clearTimeout(hT); globalThis.__zcodeTpsHideTimer = null; }
    globalThis.__zcodeTpsCardHiding = false;
    let d = globalThis.__zcodeTpsCardEl;
    if (!d || !d.isConnected) {
      d = document.createElement("div");
      d.style.cssText = cardCss;
      d.style.opacity = 0;
      document.body.appendChild(d);
      globalThis.__zcodeTpsCardEl = d;
      // 淡入: 下一帧回 1; 计时器走 globalThis(setTimeout)——冒烟测试注入的假计时器
      // 只接管 tick 链, 视觉动画不占它的单槽
      globalThis.setTimeout(() => { if (globalThis.__zcodeTpsCardEl === d) d.style.opacity = 1; }, 16);
    } else {
      d.style.opacity = 1;
    }
    globalThis.__zcodeTpsSyncCard();
  };
  globalThis.__zcodeTpsSyncCard();
  const info = "本次对话累计: " + grp(okT ? v.tok : 0) + " tokens"
    + (okT ? "\n输入 " + grp(v.tin) + " · 输出 " + grp(v.tout)
      + (v.treason > 0 ? " · 思考 " + grp(v.treason) : "")
      + (v.tcr > 0 ? " · 缓存读 " + grp(v.tcr) : "")
      + (v.tcw > 0 ? " · 缓存写 " + grp(v.tcw) : "")
      + (v.hit != null ? "\n缓存命中: " + Math.round(v.hit * 100) + "%" : "") : "")
    + "\n" + (!okV ? "模型输出速度 · 暂无长回复数据（<40 红 40-80 黄 ≥80 绿）" + (okG ? " · 生成中，完成后显示" : "")
      : "最近一轮: " + (v.v >= 100 ? v.v.toFixed(0) : v.v.toFixed(1)) + " t/s"
        + (v.dur >= 1000 ? "（" + (v.dur / 1000).toFixed(1) + "s 生成）" : "")
        + "\n会话平均: " + (v.avg >= 100 ? v.avg.toFixed(0) : v.avg.toFixed(1))
        + (v.model ? "\n模型: " + v.model : "")
        + " t/s（" + v.n + " 轮长回复加权）" + (okG ? "\n生成中 · 本轮完成后更新" : ""))
    + (c == null ? "" : !okC ? "\n套餐积分: " + c.err + " · 将自动重试"
      : c.planKind === "start-plan"
        ? "\n套餐累计已用: " + grp(c.used) + (c.total ? " / " + grp(c.total) : "")
          + (Number.isFinite(c.rem) ? "\n剩余 " + grp(c.rem) + (c.pct != null ? "（剩 " + Math.round(c.pct * 100) + "%）" : "") : "")
          + (c.pEnd ? " · 周期至 " + dfmt(c.pEnd) : "")
          + "\n更新 " + hfmt(c.at) + " · 服务端统计有分钟级延迟"
        : "\n近7天积分消耗: " + grp(c.used)
          + "\n更新 " + hfmt(c.at) + " · 服务端统计有分钟级延迟")
    + (c != null && okC ? (c.pend ? "\n本轮积分结算中（服务端有延迟" + (pmins >= 1 ? "，已 " + pmins + " 分钟" : "") + "）"
      : "\n最近一轮消耗: +" + grp(c.lastCost) + " 积分"
        + (c.lastCostAt ? "（" + hfmt(c.lastCostAt) + " 结算）" : "（待首轮结算）")) : "")
    + (okC && c.err ? "（上次刷新失败: " + c.err + "）" : "");
  return (0, Q.useEffect)(() => {
    let dead = false, timer = null, seenSid = null;
    let credAt = 0, credBusy = false;
    // 空闲降频状态: sig=轮数+末轮key+网络末态+token合计, 不变即空闲步进降频
    let tickBusy = false, idleTicks = 0, lastSig = null, wakeSid = null;
    // 服务调用超时防护: readSessionDebug/积分接口若挂死(主进程忙、睡眠恢复等),
    // await 永不返回会冻结 1s tick 链或 credBusy 永久卡死——30s 兜底让链复活下一轮重试。
    // 用 globalThis.setTimeout 而非作用域内 setTimeout: 冒烟测试注入的假计时器只接管
    // tick 链, 超时兜底走真实计时器(测试以 __zcodeTpsRaceMs 调小毫秒数验证);
    // 返回值 unref(node)避免真实计时器拖住进程, 浏览器返回数字短路安全
    const RACE_MS = globalThis.__zcodeTpsRaceMs || 30000;
    const raceTimeout = (p, ms) => {
      let t = null;
      const limit = new Promise((_, rj) => { t = globalThis.setTimeout(() => rj(new Error("timeout")), ms); });
      if (t && typeof t.unref === "function") t.unref();
      return Promise.race([p, limit]);
    };
    // 会话切换即时唤醒: qzt-stash 写入新 ctx 后调用, 立即重置空闲降频并跑一轮
    // (降频后切换会话, 否则最多滞后 5s 才清零旧数据); qzt 组件每次 render 都会调,
    // 须按 sid 去重——同会话重复唤醒会抵消降频收益; tickBusy 防与在途 tick 重入
    globalThis.__zcodeTpsWake = () => {
      if (dead || tickBusy || !timer) return;
      const sid = globalThis.__zcodeTpsCtx && globalThis.__zcodeTpsCtx.sid;
      if (sid != null && sid === wakeSid) return;
      wakeSid = sid;
      idleTicks = 0;
      clearTimeout(timer);
      timer = null;
      tick();
    };
    // 每轮积分: 轮完成锚定累计基线, 服务端累计上涨时差值=本轮消耗(真实值相减)
    // +N 常驻: 启动即显示 +0, 首轮结算后变为真实值; pending 超 10 分钟放弃归属
    // (服务端延迟过久时不再无限"结算中", carry 冻结基线, 该轮消耗并入下次差值, 账不丢)
    // lastFK: 末轮环形缓冲(200 条)满后轮数不再增长, 靠首轮被挤出判定新轮
    let lastCum = null, roundPending = false, lastRK = null, lastFK = null, carry = false;
    let lastCostVal = 0, lastCostAtVal = 0;
    let pendTries = 0, prevLen = 0, pendStart = 0;
    const fetchCred = async () => {
      try {
        const svc = globalThis.__zcodeTpsSvc;
        const usage = svc && svc.usageStatsService;
        const ps = svc && svc.providerSettingsService;
        if (!usage || !ps || typeof ps.getView !== "function") { setC(null); return; }
        const view = await ps.getView();
        const providers = view && Array.isArray(view.providers) ? view.providers : [];
        let pick = null;
        for (let k = 0; k < providers.length; k++) {
          const p = providers[k];
          const acc = p && p.effectiveConfig && p.effectiveConfig.access;
          if (!acc || acc.type !== "zhipu-account") continue;
          if (acc.mode !== "start-plan" && acc.mode !== "individual-coding-plan") continue;
          const st = p.accountState;
          if (st && st.availability === "unavailable" && !(acc.mode === "start-plan" && st.unavailableReason === "not-entitled")) continue;
          if (!st && acc.entitled !== true) continue;
          if (!pick || (st && st.current === true && !(pick.accountState && pick.accountState.current === true))) pick = p;
        }
        if (!pick) { lastCum = null; roundPending = false; lastRK = null; lastFK = null; carry = false; pendTries = 0; pendStart = 0; prevLen = 0; setC(prev => prev === null ? prev : null); return; }
        const acc = pick.effectiveConfig.access;
        const pid = pick.providerId;
        const access = { type: "zhipu-account", family: acc.accountType, planKind: acc.mode };
        let cur = null, extra = null;
        if (acc.mode === "start-plan") {
          const snap = await usage.getEntitlementSnapshot({ preferredProviderId: pid, accountAccess: access, includeSubscription: true, allowDisabledPreferredProvider: true, requirePreferredProvider: true, allowEnvApiKey: false });
          const limits = snap && snap.quota && Array.isArray(snap.quota.limits) ? snap.quota.limits : [];
          let used = 0, total = 0, rem = 0, seen = false, pEnd = 0;
          for (let k = 0; k < limits.length; k++) {
            const l = limits[k];
            if (!l) continue;
            const u = Number(l.usage), tn = Number(l.number), tr = Number(l.remaining);
            if (Number.isFinite(u)) { used += u; seen = true; }
            if (Number.isFinite(tn)) total += tn;
            if (Number.isFinite(tr)) rem += tr;
            const pe = Number(l.periodEnd);
            if (Number.isFinite(pe) && pe > 0 && (pEnd === 0 || pe < pEnd)) pEnd = pe;
          }
          cur = seen ? used : null;
          const rs = snap && snap.remaining;
          const pct = rs && Number.isFinite(rs.percentage) ? rs.percentage : (total > 0 && Number.isFinite(rem) ? rem / total : null);
          extra = { total: total > 0 ? total : null, rem: rem, pct: pct, label: (snap && snap.quota && snap.quota.level) || "Start", pEnd: pEnd };
        } else {
          const tz = typeof Intl !== "undefined" && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
          const snap = await usage.getCodingPlanUsageSnapshot({ range: "7d", preferredProviderId: pid, accountAccess: access, timeZone: tz });
          const dm = snap && snap.detail && snap.detail.model ? snap.detail.model : null;
          cur = dm && Number.isFinite(dm.totalCredits) ? dm.totalCredits : null;
          extra = { total: null, rem: null, pct: null, label: "近7天", pEnd: 0 };
        }
        if (cur != null) {
          if (lastCum != null && roundPending) {
            if (cur > lastCum) {
              lastCostVal = cur - lastCum;
              lastCostAtVal = Date.now();
              roundPending = false;
              pendTries = 0;
              pendStart = 0;
              carry = false;
            } else {
              // 累计回落(如 start-plan 周期重置): 放弃 carry, pending 保留等下一轮上涨
              carry = false;
            }
            lastCum = cur;
          } else if (!carry || lastCum == null) {
            // 常规重锚; carry(超时未结算)期间冻结基线, 跨轮消耗并入下次差值
            // (行尾注释会破坏压缩器 join, 注释必须独立成行)
            lastCum = cur;
          } else if (cur < lastCum) {
            // carry 期间服务端回落(周期重置): 重置重锚, 放弃跨轮并入
            lastCum = cur;
            carry = false;
          }
        }
        const lc = { lastCost: lastCostVal, lastCostAt: lastCostAtVal, pend: roundPending, pendSince: roundPending ? pendStart : 0 };
        if (cur == null) {
          setC(prev => prev && Number.isFinite(prev.used) ? Object.assign({}, prev, { at: Date.now(), err: "服务端未返回积分" })
            : Object.assign({ used: null, total: null, rem: null, pct: null, label: extra ? extra.label : "", planKind: acc.mode, family: acc.accountType, pEnd: 0, at: Date.now(), err: "服务端未返回积分" }, lc));
          return;
        }
        setC(Object.assign({ used: cur, total: extra.total, rem: extra.rem, pct: extra.pct, label: extra.label, planKind: acc.mode, family: acc.accountType, pEnd: extra.pEnd, at: Date.now(), err: null }, lc));
      } catch (e) {
        const msg = String(e && e.message || e).slice(0, 60);
        setC(prev => {
          if (prev && Number.isFinite(prev.used)) return Object.assign({}, prev, { at: Date.now(), err: msg });
          return prev && prev.err === msg ? prev : { used: null, total: null, rem: null, pct: null, label: "", planKind: "", family: "", pEnd: 0, at: Date.now(), err: msg, lastCost: lastCostVal, lastCostAt: lastCostAtVal, pend: roundPending };
        });
      }
    };
    const tick = async () => {
      if (tickBusy) return;
      tickBusy = true;
      let gen = false;
      try {
        const ctx = globalThis.__zcodeTpsCtx;
        const svc = globalThis.__zcodeTpsSvc && globalThis.__zcodeTpsSvc.zcodeAgentService;
        if (ctx && ctx.sid && ctx.ws && svc && typeof svc.readSessionDebug === "function") {
          if (seenSid !== ctx.sid) { seenSid = ctx.sid; setV(null); lastRK = null; lastFK = null; roundPending = false; pendTries = 0; pendStart = 0; prevLen = 0; }
          const data = await raceTimeout(svc.readSessionDebug({
            workspacePath: ctx.ws, workspaceIdentity: ctx.wi, sessionId: ctx.sid
          }), RACE_MS);
          const rounds = data && Array.isArray(data.rounds) ? data.rounds : [];
          // 轮完成检测: 末轮 eventKey 变化, 且轮数增长或首轮被环形缓冲挤出(满 200 条后轮数不再增长)
          // (首现只记录不归属; 会话截断致轮数缩短时 key 变化不触发归属); rk/fk 提升作用域供 sig 使用
          let rk = "", fk = "";
          if (rounds.length > 0) {
            const lr = rounds[rounds.length - 1];
            rk = String(lr.eventKey || (lr.requestId + ":" + lr.requestIndex));
            const fr = rounds[0];
            fk = String(fr.eventKey || (fr.requestId + ":" + fr.requestIndex));
            if (rk !== lastRK) {
              const grew = rounds.length > prevLen;
              const evicted = rounds.length === prevLen && lastFK !== null && fk !== lastFK;
              if (lastRK !== null && lastCum != null && (grew || evicted)) {
                // 连续轮 pending 不重置窗口: 持续对话时服务端一直未入账, 若每轮刷新
                // 10 分钟时限则"结算中"永不解除(11-18 真机实测), 窗口只在进入 pending 时起算
                if (!roundPending) { pendStart = Date.now(); }
                roundPending = true;
              }
              lastRK = rk;
              lastFK = fk;
            }
          }
          prevLen = rounds.length;
          const ne = data && Array.isArray(data.networkEntries) ? data.networkEntries : [];
          const lastE = ne.length > 0 ? ne[ne.length - 1] : null;
          gen = !!lastE && (lastE.statusType === "model_request_started"
            || lastE.statusType === "model_stream_stalled"
            || lastE.statusType === "model_retry_scheduled");
          // 当前模型: 最近一条带 modelId 的网络条目(生成中/刚完成时即本轮模型)
          let model = "";
          for (let k = ne.length - 1; k >= 0; k--) {
            if (ne[k] && typeof ne[k].modelId === "string" && ne[k].modelId) { model = ne[k].modelId; break; }
          }
          // 会话级缓存命中率(readSessionDebug 顶层 cache, 空会话为 null)
          const cacheHit = data && data.cache && Number.isFinite(data.cache.hitRate) ? data.cache.hitRate : null;
          let rate = null, sumOut = 0, sumDur = 0, count = 0;
          let tok = 0, tin = 0, tout = 0, tcr = 0, tcw = 0, tokN = 0;
          let treason = 0;
          let lastDur = 0;
          for (let k = rounds.length - 1; k >= 0; k--) {
            const r = rounds[k];
            const u = r && r.usage;
            const fin = x => Number.isFinite(x) ? x : 0;
            if (u) {
              tok += Number.isFinite(u.totalTokens) ? u.totalTokens : fin(u.inputTokens) + fin(u.outputTokens);
              tin += fin(u.inputTokens); tout += fin(u.outputTokens);
              treason += fin(u.reasoningTokens);
              // readSessionDebug 的 rounds 走 zod strict schema, 3.19.1 字段名是
              // cachedInputTokens/cachedWriteInputTokens(cacheReadTokens 是协议事件层的
              // 字段名, 读它会恒 0); 两个名字相加兼容跨版本——任一版本只有一个存在
              tcr += fin(u.cachedInputTokens) + fin(u.cacheReadTokens);
              tcw += fin(u.cachedWriteInputTokens) + fin(u.cacheWriteTokens);
              tokN++;
            }
            const dur = r && r.generationDurationMs;
            const out = u && u.outputTokens;
            if (Number.isFinite(dur) && dur >= 200 && dur < 36e5 &&
                Number.isFinite(out) && out >= 50 &&
                Number.isFinite(r.tokensPerSecond) && r.tokensPerSecond < 500) {
              if (rate === null) { rate = r.tokensPerSecond; lastDur = dur; }
              sumOut += out;
              sumDur += dur;
              count++;
            }
          }
          const avg = sumDur > 0 ? sumOut * 1000 / sumDur : null;
          // 空闲判定: 轮数/末轮key/网络末态/token 合计与缓存读全不变视为无变化(步进降频)
          const sig = rounds.length + ":" + rk + ":" + (lastE ? lastE.statusType : "") + ":" + tok + ":" + tcr;
          if (sig === lastSig) idleTicks++; else { idleTicks = 0; lastSig = sig; }
          setV(prev => {
            const next = rate === null ? null : { v: rate, avg: avg, n: count, dur: lastDur, tok: tok, tin: tin, tout: tout, treason: treason, tcr: tcr, tcw: tcw, hit: cacheHit, model: model, gen: gen };
            // 全字段比较: 缓存读写不一定计入 totalTokens, 漏比较会导致缓存数变化不刷新
            const same = next === null ? prev === null
              : prev !== null && prev.v === rate && prev.avg === avg && prev.n === count && prev.gen === gen && prev.dur === lastDur
                && prev.tok === tok && prev.tin === tin && prev.tout === tout && prev.treason === treason
                && prev.tcr === tcr && prev.tcw === tcw && prev.hit === cacheHit && prev.model === model;
            return same ? prev : next;
          });
        }
      } catch (e) { /* 静默, 下一轮重试 */ }
      const nowMs = Date.now();
      // pending 超 10 分钟未结算(服务端延迟异常)则放弃归属: 恢复显示上一轮 +N,
      // carry 冻结基线不让常规轮询重锚, 该轮消耗并入下次差值(累计制, 账不丢)
      if (roundPending && pendStart && nowMs - pendStart > 600000) {
        roundPending = false;
        pendTries = 0;
        pendStart = 0;
        carry = true;
      }
      // 常规 60s 轮询; 本轮待结算时前 8 次 15s 加急(约 2 分钟), 之后回落 60s 节奏
      // (pending 仍可被常规取数 resolve, 但不再无限高频打接口)
      const accel = roundPending && pendTries < 8;
      if (!dead && !credBusy && nowMs - credAt >= (accel ? 15000 : 60000)) {
        credAt = nowMs;
        if (roundPending) pendTries++;
        credBusy = true;
        // 超时兜底同样覆盖积分取数: 挂死时 credBusy 若不释放, 积分轮询会永久停摆
        raceTimeout(fetchCred(), RACE_MS).then(() => { credBusy = false; }, () => { credBusy = false; });
      }
      tickBusy = false;
      if (!dead) {
        // 空闲自适应降频: 连续无变化 4 轮后 2s、8 轮后 5s, 省去长时间挂机时的每秒空转 IPC;
        // 生成中保持 1s(闪电脉动与网络状态要实时), 数据变化(sig 归零)/会话切换(wake)即时回 1s
        let nextDelay = idleTicks >= 8 ? 5000 : idleTicks >= 4 ? 2000 : 1000;
        if (gen) nextDelay = 1000;
        timer = setTimeout(tick, nextDelay);
      }
    };
    tick();
    // 卡片悬停: document 级委托(捕获), 不依赖 React 合成事件——任何界面必触发
    const bSel = "[data-zcode-tps-badge]";
    const inBadge = t => !!(t && t.closest && t.closest(bSel));
    const onOver = e => {
      if (inBadge(e.target) && !(e.relatedTarget && inBadge(e.relatedTarget))) globalThis.__zcodeTpsShowCard();
    };
    const onOut = e => {
      if (inBadge(e.target) && !(e.relatedTarget && inBadge(e.relatedTarget))) {
        const d = globalThis.__zcodeTpsCardEl;
        if (d) {
          // 淡出: 先置透明标记再延时移除(快速移回时 showCard 清 timer 复用卡片);
          // 计时器走 globalThis.setTimeout, 不占冒烟 mock 的单槽
          globalThis.__zcodeTpsCardHiding = true;
          d.style.opacity = 0;
          globalThis.__zcodeTpsHideTimer = globalThis.setTimeout(() => {
            globalThis.__zcodeTpsHideTimer = null;
            globalThis.__zcodeTpsCardHiding = false;
            if (globalThis.__zcodeTpsCardEl === d) { d.remove(); globalThis.__zcodeTpsCardEl = null; }
          }, 140);
        }
      }
    };
    let cleanupCard = () => {};
    if (typeof document !== "undefined" && document.addEventListener) {
      document.addEventListener("mouseover", onOver, true);
      document.addEventListener("mouseout", onOut, true);
      cleanupCard = () => {
        document.removeEventListener("mouseover", onOver, true);
        document.removeEventListener("mouseout", onOut, true);
        if (globalThis.__zcodeTpsHideTimer) { globalThis.clearTimeout(globalThis.__zcodeTpsHideTimer); globalThis.__zcodeTpsHideTimer = null; }
        globalThis.__zcodeTpsCardHiding = false;
        const d = globalThis.__zcodeTpsCardEl;
        if (d) { d.remove(); globalThis.__zcodeTpsCardEl = null; }
      };
    }
    return () => {
      dead = true;
      if (timer) clearTimeout(timer);
      cleanupCard();
    };
  }, []),
  (0, $.jsxs)("span", {
    "data-info": info,
    "data-zcode-tps-badge": "1",
    style: {
      display: "inline-flex", alignItems: "center", gap: "4px",
      margin: "2px 8px 0 2px", fontSize: "12.5px", lineHeight: "16px",
      verticalAlign: "middle",
      fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
      userSelect: "none", cursor: "default",
      color: "var(--color-foreground-subtle, #9ca3af)"
    },
    children: [
      (0, $.jsxs)("svg", {
        width: 12, height: 12, viewBox: "0 0 24 24", fill: "none",
        stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round",
        strokeLinejoin: "round", "aria-hidden": "true",
        style: { flexShrink: 0, opacity: 0.9 },
        children: [
          (0, $.jsx)("ellipse", { cx: 12, cy: 5, rx: 9, ry: 3 }),
          (0, $.jsx)("path", { d: "M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5" }),
          (0, $.jsx)("path", { d: "M3 12c0 1.7 4 3 9 3s9-1.3 9-3" })
        ]
      }),
      (0, $.jsx)("span", {
        style: { fontWeight: 500, fontSize: "12.5px" },
        children: okT ? fmt(v.tok) : "0"
      }),
      (0, $.jsx)("span", {
        "aria-hidden": "true",
        style: { width: "1px", height: "11px", margin: "0 6px 0 5px",
          background: "currentColor", opacity: 0.25, flexShrink: 0,
          display: "inline-block", borderRadius: "1px" }
      }),
      (0, $.jsx)("svg", {
        width: 12, height: 12, viewBox: "0 0 24 24",
        fill: "currentColor", stroke: "none",
        strokeLinejoin: "round", "aria-hidden": "true",
        style: { flexShrink: 0, opacity: okG ? 1 : 0.9, animation: okG ? "zcodeTpsPulse 1.1s ease-in-out infinite" : undefined },
        children: (0, $.jsx)("path", { d: "M13 2 3 14h9l-1 8 10-12h-9l1-8z" })
      }),
      (0, $.jsx)("span", {
        style: {
          fontWeight: 600, fontSize: "13px", opacity: okG ? 0.55 : 1,
          color: !okV ? "var(--color-foreground-subtle, #9ca3af)"
            : v.v >= 80 ? "var(--color-success, #3ecf6e)"
            : v.v >= 40 ? "var(--color-warning, #f0a13a)"
            : "var(--color-error, #ef4444)"
        },
        children: !okV ? "0.0" : v.v >= 100 ? v.v.toFixed(0) : v.v.toFixed(1)
      }),
      (0, $.jsx)("span", { style: { fontWeight: 400, fontSize: "11.5px", opacity: 0.85 }, children: "t/s" }),
      (0, $.jsx)("span", {
        "aria-hidden": "true",
        style: { width: "1px", height: "11px", margin: "0 6px 0 5px",
          background: "currentColor", opacity: 0.25, flexShrink: 0,
          display: "inline-block", borderRadius: "1px" }
      })
    ].concat(okC ? [
      (0, $.jsx)("svg", {
        width: 12, height: 12, viewBox: "0 0 24 24", fill: "none",
        stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round",
        strokeLinejoin: "round", "aria-hidden": "true",
        style: { flexShrink: 0, opacity: 0.9 },
        children: [
          (0, $.jsx)("circle", { cx: 12, cy: 12, r: 9 }),
          (0, $.jsx)("path", { d: "M8.5 7.5 12 12l3.5-4.5" }),
          (0, $.jsx)("path", { d: "M12 12v6" }),
          (0, $.jsx)("path", { d: "M8.5 14.5h7" })
        ]
      }),
      (0, $.jsx)("span", {
        style: {
          fontWeight: 500, fontSize: "12.5px",
          color: c.pct != null && c.pct <= 0.1 ? "var(--color-error, #ef4444)"
            : c.pct != null && c.pct <= 0.2 ? "var(--color-warning, #f0a13a)"
            : undefined
        },
        children: fmt(c.used)
      }),
      Number.isFinite(c.lastCost) ? (0, $.jsx)("span", {
        style: {
          fontWeight: 500, fontSize: "11.5px", lineHeight: "16px",
          color: "var(--color-success, #3ecf6e)", marginLeft: "1px"
        },
        children: "+" + fmt(c.lastCost)
      }) : null
    ] : [])
  });
}
