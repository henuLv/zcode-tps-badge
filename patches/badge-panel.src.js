// 原生弹层"会话统计"面板（注入到上下文容量弹层, 缓存命中率行与配额区之间）
// 悬停卡片已删(11-25 拍板"外面这层不要了"): 本面板是唯一统计面, 徽标 tick/pullCtx/fetchCred
// 的 setState 同步镜像到 globalThis.__zcodeTpsDataV/A/O/C, 面板每秒强刷读镜像;
// 打开弹层时顺带节流拉分类/官方账本(拉取器内部 30s 节流, 每秒空调用零成本)
// 排版(11-25 打磨): 走官方 UI 字体(去 font-mono——官方弹层无 mono, mono 数字偏大偏黑且
// 中文 fallback 突兀); 行分三组(用量/上下文构成/积分), 组间 space-y-3、组内 space-y-1.5,
// 子行 pl-3 悬挂缩进; 值 = 主数字 + 弱化后缀(单位/日均/时刻降一级, tabular-nums 对齐);
// 配色全走语义 CSS 变量——原生主题怎么换面板就怎么跟
() => {
  const [, force] = (0, Q.useState)(0);
  (0, Q.useEffect)(() => {
    if (globalThis.__zcodeTpsPullCtx) globalThis.__zcodeTpsPullCtx();
    const t = setInterval(() => {
      force(x => x + 1);
      if (globalThis.__zcodeTpsPullCtx) globalThis.__zcodeTpsPullCtx();
    }, 1000);
    return () => clearInterval(t);
  }, []);
  const v = globalThis.__zcodeTpsDataV || null;
  const a = globalThis.__zcodeTpsDataA || null;
  const o = globalThis.__zcodeTpsDataO || null;
  const c = globalThis.__zcodeTpsDataC || null;
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
  const okV = v != null && Number.isFinite(v.v);
  const okT = v != null && Number.isFinite(v.tok);
  const okA = a != null && typeof a.cats === "string" && a.cats.length > 0;
  // 分类键本身可含冒号(Tool:Bash), 按最后一个冒号切键值
  const aPairs = okA ? a.cats.split(",").map(s2 => { const k2 = s2.lastIndexOf(":"); return [s2.slice(0, k2), Number(s2.slice(k2 + 1))]; }) : [];
  const okO = o != null && typeof o.bd === "string" && o.bd.length > 0;
  const oPairs = okO ? o.bd.split(",").map(s2 => { const k2 = s2.lastIndexOf(":"); return [s2.slice(0, k2), Number(s2.slice(k2 + 1))]; }) : [];
  const oTotal = oPairs.reduce((s2, kv) => s2 + kv[1], 0);
  // 7 类来源中文名与官方弹层 i18n 文案一致, 自造名会跟原生界面打架
  const SRC = { messages: "消息", system_prompt: "系统提示", meta_user_context: "其他", skills: "技能", tool_prompt: "工具提示", system_tool_schemas: "系统工具", mcp_tool_schemas: "MCP 工具" };
  const sLb = k2 => SRC[k2] || k2;
  // 官方 Tan() 同口径: 百分比 >=10 取整, 不足 10 保留一位小数
  const sPct = c2 => {
    const p2 = oTotal > 0 ? c2 / oTotal * 100 : 0;
    return (p2 >= 10 ? Math.round(p2) : Math.round(p2 * 10) / 10) + "%";
  };
  // 结算等待分钟数(服务端分钟级延迟, 持续对话时可能连跨数轮才入账)
  const pmins = c != null && c.pend && c.pendSince ? Math.round((Date.now() - c.pendSince) / 60000) : 0;
  // 主行: 标签左 + 值右, 基线对齐(官方数值行同款); 标签 shrink-0 防长值挤压换行
  const row = (lb, body, key) => (0, $.jsxs)("div", {
    className: "flex items-baseline justify-between gap-3 text-ui-sm",
    children: [
      (0, $.jsx)("span", { className: "text-foreground-subtle shrink-0", children: lb }),
      (0, $.jsx)("span", { children: body })
    ]
  }, key || lb);
  // 值 = 主数字 + 弱化后缀(单位/日均/时刻降一级); color 用于阈值告警与状态色,
  // 后缀 span 自带 subtle 类不受继承色影响
  const val = (main, tail, color) => (0, $.jsxs)("span", {
    className: "tabular-nums",
    style: color ? { color: color } : undefined,
    children: [
      main,
      tail ? (0, $.jsx)("span", { className: "text-xs text-foreground-subtle", children: tail }) : null
    ]
  });
  // 子行: pl-3 悬挂缩进(折行后仍在缩进内), 弱化小字, 观感对齐原生 compressDescription
  const sub = (tx, key) => (0, $.jsx)("div", {
    className: "pl-3 text-xs leading-4 text-foreground-subtle", children: tx
  }, key);
  // 三组: 用量 / 上下文构成 / 积分; 组内紧凑(1.5), 组间靠外层 space-y-3 拉开层级
  const gUse = [], gCtx = [], gCred = [];
  gUse.push(row("本次对话", val(okT ? grp(v.tok) : "-", okT ? " tok" : null), "tok"));
  if (okT) {
    gUse.push(sub("输入 " + grp(v.tin) + " · 输出 " + grp(v.tout)
      + (v.treason > 0 ? " · 思考 " + grp(v.treason) : ""), "tin"));
    if (v.tcr > 0 || v.tcw > 0) {
      gUse.push(sub("缓存读 " + grp(v.tcr) + " · 缓存写 " + grp(v.tcw)
        + (v.hit != null ? " · 命中 " + Math.round(v.hit * 100) + "%" : ""), "tcr"));
    }
  }
  if (okT && v.fx != null) {
    gCtx.push(row("上下文固定开销", val(grp(v.fx), " tok"), "fx"));
    const topTxt = v.top ? v.top.split(",").map(p => {
      const kv = p.split(":");
      return "第" + (Number(kv[0]) + 1) + "轮 +" + grp(Number(kv[1]));
    }).join(" · ") + " · " : "";
    gCtx.push(sub(topTxt + "水位 " + grp(v.curIn) + " tok（相邻轮差=窗口新增）", "fxsub"));
  }
  // 官方来源构成: agent 自身构成快照的 7 类字符占比(与上方分段条同源), 补字符数维度
  if (okO) {
    gCtx.push(row("来源构成", val(grp(oTotal), " 字符"), "src"));
    gCtx.push(sub(oPairs.slice(0, 4).map(kv => sLb(kv[0]) + " " + sPct(kv[1])).join(" · ")
      + (oPairs.length > 4 ? "（共 " + oPairs.length + " 类）" : ""), "srcsub"));
  }
  // Token 分类是窗口差值折算的估算值(≈), 整值弱化避免与实测行同等权重
  if (okA) gCtx.push(row("Token 分类（≈）", (0, $.jsx)("span", {
    className: "text-foreground-subtle tabular-nums",
    children: aPairs.slice(0, 3).map(kv => kv[0].replace(/^Tool:/, "") + " ≈" + fmt(kv[1])).join(" · ")
  }), "cats"));
  if (c != null && Number.isFinite(c.used)) {
    gCred.push(row(c.planKind === "start-plan" ? "套餐累计已用" : "近7天积分",
      val(grp(c.used), c.planKind !== "start-plan" && c.daily ? "（日均 " + grp(c.daily) + "）" : null,
        c.pct != null && c.pct <= 0.1 ? "var(--color-error)" : c.pct != null && c.pct <= 0.2 ? "var(--color-warning)" : undefined),
      "cred"));
    if (c.planKind === "start-plan") {
      gCred.push(sub("剩余 " + (Number.isFinite(c.rem) ? grp(c.rem) : "-")
        + (c.pct != null ? "（剩 " + Math.round(c.pct * 100) + "%）" : "")
        + (c.pEnd ? " · 周期至 " + dfmt(c.pEnd) : ""), "credsub"));
    }
    // 结算中是临时态给 warning 色提示"未入账"; 入账后 +N 恢复 success 绿, 时刻弱化
    gCred.push(row("最近一轮积分",
      c.pend ? val(pmins >= 1 ? "结算中 · 已 " + pmins + " 分钟" : "结算中…", null, "var(--color-warning)")
        : val("+" + grp(c.lastCost), c.lastCostAt ? " · " + hfmt(c.lastCostAt) : " · 待首轮结算", "var(--color-success)"),
      "lastcost"));
  } else if (c != null && c.err) {
    gCred.push(sub("积分: " + c.err + " · 将自动重试", "crederr"));
  }
  // 模型名提到标题行右侧(省一行, 标题行不再空半边), 与官方"标题+右值"布局同款
  const groups = [gUse, gCtx, gCred].filter(g => g.length > 0);
  return (0, $.jsxs)("div", {
    className: "space-y-3 border-t border-border pt-3",
    children: [
      (0, $.jsxs)("div", {
        className: "flex items-baseline justify-between gap-3",
        children: [
          (0, $.jsx)("span", { className: "text-ui-sm font-medium text-foreground", children: "会话统计 · TPS 徽标" }),
          okV && v.model ? (0, $.jsx)("span", { className: "text-xs text-foreground-subtle", children: v.model }) : null
        ]
      }),
      ...groups.map((g, gi) => (0, $.jsx)("div", { className: "space-y-1.5", children: g }, "grp" + gi))
    ]
  });
}
