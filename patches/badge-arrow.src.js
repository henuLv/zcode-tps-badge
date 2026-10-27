// TPS 徽标箭头函数源码（会被 build-badge-patch.mjs 验证后嵌入渲染器补丁）
// 数据链: globalThis.__zcodeTpsSvc(zcodeAgentService) + __zcodeTpsCtx(workspacePath/sid)
// 口径(参考 zcode-token-usage-statusbar turn-stats.js): 生成时长>=200ms 且 <6min,
// 输出 token>=50, 速率<500 t/s, 取最近一个可信轮次; 永久常驻(无数据显示 0, 灰色),
// 会话切换清空; 数字分级色: <40 红 40-80 橙黄 >=80 绿; 闪电与 t/s 恒灰
() => {
  let [v, setV] = (0, Q.useState)(null);
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
          let rate = null;
          for (let k = rounds.length - 1; k >= 0; k--) {
            const r = rounds[k];
            const dur = r && r.generationDurationMs;
            const out = r && r.usage && r.usage.outputTokens;
            if (Number.isFinite(dur) && dur >= 200 && dur < 36e5 &&
                Number.isFinite(out) && out >= 50 &&
                Number.isFinite(r.tokensPerSecond) && r.tokensPerSecond < 500) {
              rate = r.tokensPerSecond;
              break;
            }
          }
          if (rate != null) setV(rate);
        }
      } catch (e) { /* 静默, 下一轮重试 */ }
      if (!dead) timer = setTimeout(tick, 1000);
    };
    tick();
    return () => { dead = true; if (timer) clearTimeout(timer); };
  }, []),
  (0, $.jsxs)("span", {
    title: "模型输出速度 · 最近一轮长回复的真实值（无数据显示 0；<40 红 40-80 黄 ≥80 绿）",
    style: {
      display: "inline-flex", alignItems: "center", gap: "5px",
      margin: "0 6px 0 2px", fontSize: "14px", lineHeight: "18px",
      fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
      userSelect: "none", cursor: "default",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      color: "var(--color-foreground-subtle, #9ca3af)"
    },
    children: [
      (0, $.jsx)("svg", {
        width: 13, height: 13, viewBox: "0 0 24 24", fill: "none",
        stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round",
        strokeLinejoin: "round", "aria-hidden": "true",
        style: { flexShrink: 0 },
        children: (0, $.jsx)("path", { d: "M13 2 3 14h9l-1 8 10-12h-9l1-8z" })
      }),
      (0, $.jsx)("span", {
        style: {
          fontWeight: 700, fontSize: "16px",
          color: v == null ? "var(--color-foreground-subtle, #9ca3af)"
            : v >= 80 ? "var(--color-success, #3ecf6e)"
            : v >= 40 ? "var(--color-warning, #f0a13a)"
            : "var(--color-error, #ef4444)"
        },
        children: v == null ? "0.0" : v >= 100 ? v.toFixed(0) : v.toFixed(1)
      }),
      (0, $.jsx)("span", { style: { fontWeight: 400 }, children: "t/s" })
    ]
  });
}
