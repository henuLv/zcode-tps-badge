// TPS 徽标箭头函数源码（会被 build-badge-patch.mjs 验证后嵌入渲染器补丁）
// 数据链: globalThis.__zcodeTpsSvc(zcodeAgentService) + __zcodeTpsCtx(workspacePath/sid)
// 口径(参考 zcode-token-usage-statusbar turn-stats.js): 生成时长>=200ms 且 <6min,
// 输出 token>=50, 速率<500 t/s; 数字取最近一个可信轮次, 悬停显示会话全局平均
// (可信轮次总输出 ÷ 总时长, 加权平均); 永久常驻(无数据显示 0, 灰色),
// 会话切换清空; 数字分级色: <40 红 40-80 橙黄 >=80 绿; 闪电与 t/s 恒灰
// token 累计: 左侧数据库图标 + 数字(全轮 usage.totalTokens 求和, 输入+输出),
// 格式 <1k 原值 / <1m x.xk / >=1m x.xxm, 悬停 tooltip 展示输入/输出/缓存细分
() => {
  let [v, setV] = (0, Q.useState)(null);
  const okV = v != null && Number.isFinite(v.v);
  const okT = v != null && Number.isFinite(v.tok);
  const fmt = n => {
    if (!Number.isFinite(n)) return "0";
    if (n < 1000) return String(Math.round(n));
    if (n < 1e6) { const x = n / 1000; return (x >= 100 ? Math.round(x) : Math.round(x * 10) / 10) + "k"; }
    const x = n / 1e6; return (x >= 10 ? Math.round(x) : Math.round(x * 100) / 100) + "m";
  };
  const grp = n => Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "0";
  return (0, Q.useEffect)(() => {
    let dead = false, timer = null, seenSid = null;
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
          + " t/s（" + v.n + " 轮长回复加权）"),
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
    ]
  });
}
