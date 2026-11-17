// TPS 徽标箭头函数源码（会被 build-badge-patch.mjs 验证后嵌入渲染器补丁）
// 数据链: globalThis.__zcodeTpsSvc(zcodeAgentService) + __zcodeTpsCtx(workspacePath/sid)
// 口径(参考 zcode-token-usage-statusbar turn-stats.js): 生成时长>=200ms 且 <6min,
// 输出 token>=50, 速率<500 t/s; 数字取最近一个可信轮次, 悬停显示会话全局平均
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
  let [v, setV] = (0, Q.useState)(null);
  let [c, setC] = (0, Q.useState)(null);
  const okV = v != null && Number.isFinite(v.v);
  const okT = v != null && Number.isFinite(v.tok);
  const okC = c != null && Number.isFinite(c.used);
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
  return (0, Q.useEffect)(() => {
    let dead = false, timer = null, seenSid = null;
    let credAt = 0, credBusy = false;
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
        if (!pick) { setC(prev => prev === null ? prev : null); return; }
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
        if (cur == null) {
          setC(prev => prev && Number.isFinite(prev.used) ? Object.assign({}, prev, { at: Date.now(), err: "服务端未返回积分" })
            : { used: null, total: null, rem: null, pct: null, label: extra ? extra.label : "", planKind: acc.mode, family: acc.accountType, pEnd: 0, at: Date.now(), err: "服务端未返回积分" });
          return;
        }
        setC({ used: cur, total: extra.total, rem: extra.rem, pct: extra.pct, label: extra.label, planKind: acc.mode, family: acc.accountType, pEnd: extra.pEnd, at: Date.now(), err: null });
      } catch (e) {
        const msg = String(e && e.message || e).slice(0, 60);
        setC(prev => {
          if (prev && Number.isFinite(prev.used)) return Object.assign({}, prev, { at: Date.now(), err: msg });
          return prev && prev.err === msg ? prev : { used: null, total: null, rem: null, pct: null, label: "", planKind: "", family: "", pEnd: 0, at: Date.now(), err: msg };
        });
      }
    };
    const tick = async () => {
      try {
        const ctx = globalThis.__zcodeTpsCtx;
        const svc = globalThis.__zcodeTpsSvc && globalThis.__zcodeTpsSvc.zcodeAgentService;
        if (ctx && ctx.sid && ctx.ws && svc && typeof svc.readSessionDebug === "function") {
          if (seenSid !== ctx.sid) { seenSid = ctx.sid; setV(null); }
          const data = await svc.readSessionDebug({
            workspacePath: ctx.ws, workspaceIdentity: ctx.wi, sessionId: ctx.sid
          });
          const rounds = data && Array.isArray(data.rounds) ? data.rounds : [];
          let rate = null, sumOut = 0, sumDur = 0, count = 0;
          let tok = 0, tin = 0, tout = 0, tcr = 0, tcw = 0, tokN = 0;
          for (let k = rounds.length - 1; k >= 0; k--) {
            const r = rounds[k];
            const u = r && r.usage;
            const fin = x => Number.isFinite(x) ? x : 0;
            if (u) {
              tok += Number.isFinite(u.totalTokens) ? u.totalTokens : fin(u.inputTokens) + fin(u.outputTokens);
              tin += fin(u.inputTokens); tout += fin(u.outputTokens);
              tcr += fin(u.cacheReadTokens); tcw += fin(u.cacheWriteTokens);
              tokN++;
            }
            const dur = r && r.generationDurationMs;
            const out = u && u.outputTokens;
            if (Number.isFinite(dur) && dur >= 200 && dur < 36e5 &&
                Number.isFinite(out) && out >= 50 &&
                Number.isFinite(r.tokensPerSecond) && r.tokensPerSecond < 500) {
              if (rate === null) rate = r.tokensPerSecond;
              sumOut += out;
              sumDur += dur;
              count++;
            }
          }
          const avg = sumDur > 0 ? sumOut * 1000 / sumDur : null;
          setV(prev => {
            const next = rate === null ? null : { v: rate, avg: avg, n: count, tok: tok, tin: tin, tout: tout, tcr: tcr, tcw: tcw };
            const same = next === null ? prev === null
              : prev !== null && prev.v === rate && prev.avg === avg && prev.n === count && prev.tok === tok;
            return same ? prev : next;
          });
        }
      } catch (e) { /* 静默, 下一轮重试 */ }
      if (!dead && !credBusy && Date.now() - credAt >= 60000) {
        credAt = Date.now();
        credBusy = true;
        fetchCred().then(() => { credBusy = false; }, () => { credBusy = false; });
      }
      if (!dead) timer = setTimeout(tick, 1000);
    };
    tick();
    return () => { dead = true; if (timer) clearTimeout(timer); };
  }, []),
  (0, $.jsxs)("span", {
    title: "本次对话累计: " + grp(okT ? v.tok : 0) + " tokens"
      + (okT ? "\n输入 " + grp(v.tin) + " · 输出 " + grp(v.tout)
        + (v.tcr > 0 ? " · 缓存读 " + grp(v.tcr) : "")
        + (v.tcw > 0 ? " · 缓存写 " + grp(v.tcw) : "") : "")
      + "\n" + (!okV ? "模型输出速度 · 暂无长回复数据（<40 红 40-80 黄 ≥80 绿）"
        : "最近一轮: " + (v.v >= 100 ? v.v.toFixed(0) : v.v.toFixed(1)) + " t/s"
          + "\n会话平均: " + (v.avg >= 100 ? v.avg.toFixed(0) : v.avg.toFixed(1))
          + " t/s（" + v.n + " 轮长回复加权）")
      + (c == null ? "" : !okC ? "\n套餐积分: " + c.err + " · 将自动重试"
        : c.planKind === "start-plan"
          ? "\n套餐累计已用: " + grp(c.used) + (c.total ? " / " + grp(c.total) : "")
            + (Number.isFinite(c.rem) ? "\n剩余 " + grp(c.rem) + (c.pct != null ? "（剩 " + Math.round(c.pct * 100) + "%）" : "") : "")
            + (c.pEnd ? " · 周期至 " + dfmt(c.pEnd) : "")
            + "\n更新 " + hfmt(c.at) + " · 服务端统计有分钟级延迟"
          : "\n近7天积分消耗: " + grp(c.used)
            + "\n更新 " + hfmt(c.at) + " · 服务端统计有分钟级延迟")
      + (c != null && c.err ? "（上次刷新失败: " + c.err + "）" : ""),
    style: {
      display: "inline-flex", alignItems: "center", gap: "5px",
      margin: "2px 6px 0 2px", fontSize: "14px", lineHeight: "18px",
      verticalAlign: "middle",
      fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
      userSelect: "none", cursor: "default",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      color: "var(--color-foreground-subtle, #9ca3af)"
    },
    children: [
      (0, $.jsxs)("svg", {
        width: 13, height: 13, viewBox: "0 0 24 24", fill: "none",
        stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round",
        strokeLinejoin: "round", "aria-hidden": "true",
        style: { flexShrink: 0 },
        children: [
          (0, $.jsx)("ellipse", { cx: 12, cy: 5, rx: 9, ry: 3 }),
          (0, $.jsx)("path", { d: "M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5" }),
          (0, $.jsx)("path", { d: "M3 12c0 1.7 4 3 9 3s9-1.3 9-3" })
        ]
      }),
      (0, $.jsx)("span", {
        style: { fontWeight: 600, fontSize: "14px", lineHeight: "16px" },
        children: okT ? fmt(v.tok) : "0"
      }),
      (0, $.jsx)("svg", {
        width: 13, height: 13, viewBox: "0 0 24 24", fill: "none",
        stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round",
        strokeLinejoin: "round", "aria-hidden": "true",
        style: { flexShrink: 0 },
        children: (0, $.jsx)("path", { d: "M13 2 3 14h9l-1 8 10-12h-9l1-8z" })
      }),
      (0, $.jsx)("span", {
        style: {
          fontWeight: 700, fontSize: "16px", lineHeight: "16px",
          color: !okV ? "var(--color-foreground-subtle, #9ca3af)"
            : v.v >= 80 ? "var(--color-success, #3ecf6e)"
            : v.v >= 40 ? "var(--color-warning, #f0a13a)"
            : "var(--color-error, #ef4444)"
        },
        children: !okV ? "0.0" : v.v >= 100 ? v.v.toFixed(0) : v.v.toFixed(1)
      }),
      (0, $.jsx)("span", { style: { fontWeight: 400 }, children: "t/s" })
    ].concat(okC ? [
      (0, $.jsx)("svg", {
        width: 13, height: 13, viewBox: "0 0 24 24", fill: "none",
        stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round",
        strokeLinejoin: "round", "aria-hidden": "true",
        style: { flexShrink: 0 },
        children: [
          (0, $.jsx)("circle", { cx: 12, cy: 12, r: 9 }),
          (0, $.jsx)("path", { d: "M8.5 7.5 12 12l3.5-4.5" }),
          (0, $.jsx)("path", { d: "M12 12v6" }),
          (0, $.jsx)("path", { d: "M8.5 13.5h7" }),
          (0, $.jsx)("path", { d: "M8.5 16.5h7" })
        ]
      }),
      (0, $.jsx)("span", {
        style: {
          fontWeight: 600, fontSize: "14px", lineHeight: "16px",
          color: c.pct != null && c.pct <= 0.1 ? "var(--color-error, #ef4444)"
            : c.pct != null && c.pct <= 0.2 ? "var(--color-warning, #f0a13a)"
            : undefined
        },
        children: fmt(c.used)
      })
    ] : [])
  });
}
