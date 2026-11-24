// 原生弹层"会话统计"面板（注入到上下文容量弹层, 缓存命中率行与配额区之间）
// 数据链: 徽标组件的 tick/pullCtx/fetchCred 每次更新时镜像到 globalThis.__zcodeTpsDataV/A/C,
// 本面板每秒强刷读取镜像——与徽标共享同一份数据, 不重复轮询
// 样式用弹层同款 tailwind 类(text-foreground-subtle/font-mono text-ui-sm/border-border), 视觉原生融合
() => {
  const [, force] = (0, Q.useState)(0);
  (0, Q.useEffect)(() => {
    const t = setInterval(() => force(x => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const v = globalThis.__zcodeTpsDataV || null;
  const a = globalThis.__zcodeTpsDataA || null;
  const fmt = n => {
    if (!Number.isFinite(n)) return "0";
    if (n < 1000) return String(Math.round(n));
    if (n < 1e6) { const x = n / 1000; return (x >= 100 ? Math.round(x) : Math.round(x * 10) / 10) + "k"; }
    const x = n / 1e6; return (x >= 10 ? Math.round(x) : Math.round(x * 100) / 100) + "m";
  };
  const okV = v != null && Number.isFinite(v.v);
  const okT = v != null && Number.isFinite(v.tok);
  const okA = a != null && typeof a.cats === "string" && a.cats.length > 0;
  // 分类键本身可含冒号(Tool:Bash), 按最后一个冒号切键值
  const aPairs = okA ? a.cats.split(",").map(s2 => { const k2 = s2.lastIndexOf(":"); return [s2.slice(0, k2), Number(s2.slice(k2 + 1))]; }) : [];
  const row = (lb, vl, key) => (0, $.jsxs)("div", {
    className: "flex items-center justify-between gap-3 text-ui-sm",
    children: [
      (0, $.jsx)("span", { className: "text-foreground-subtle", children: lb }),
      (0, $.jsx)("span", { className: "font-mono text-ui-sm tabular-nums text-foreground", children: vl })
    ]
  }, key || lb);
  const rows = [];
  rows.push(row("最近一轮", okV
    ? (v.v >= 100 ? v.v.toFixed(0) : v.v.toFixed(1)) + " t/s" + (Number.isFinite(v.dur) && v.dur >= 1000 ? "（" + (v.dur / 1000).toFixed(1) + "s）" : "")
    : "暂无长回复", "cur"));
  rows.push(row("会话平均", okV && Number.isFinite(v.avg)
    ? (v.avg >= 100 ? v.avg.toFixed(0) : v.avg.toFixed(1)) + " t/s · " + v.n + " 轮"
    : "-", "avg"));
  rows.push(row("本次对话", okT ? fmt(v.tok) + " tok" : "-", "tok"));
  if (okT && v.fx != null) rows.push(row("上下文固定开销", fmt(v.fx) + " tok", "fx"));
  if (okA) rows.push(row("Token 分类(≈)", aPairs.slice(0, 3).map(kv => kv[0].replace(/^Tool:/, "") + " ≈" + fmt(kv[1])).join(" · "), "cats"));
  return (0, $.jsxs)("div", {
    className: "space-y-3 border-t border-border pt-3",
    children: [
      (0, $.jsx)("div", {
        className: "flex items-center justify-between gap-3",
        children: (0, $.jsx)("span", { className: "text-ui-sm font-medium text-foreground", children: "会话统计 · TPS 徽标" })
      }),
      ...rows
    ]
  });
}
