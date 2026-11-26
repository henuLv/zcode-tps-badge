// TPS 徽标箭头函数源码（会被 build-badge-patch.mjs 验证后嵌入渲染器补丁）
// 数据链: globalThis.__zcodeTpsSvc(zcodeAgentService) + __zcodeTpsCtx(workspacePath/sid);
// tick/pullCtx/fetchCred 的 setState 同步镜像到 __zcodeTpsDataV/A/O/C,
// 统计展示统一在原生弹层面板(badge-panel.src.js); 11-25 拍板"外部只留 TPS":
// 徽标本体只剩 闪电+N t/s 一组数字, token 累计与积分只在面板/data-info/复制里
// 口径(参考 zcode-token-usage-statusbar turn-stats.js): 生成时长>=200ms 且 <1h,
// 输出 token>=50, 速率<500 t/s; 数字取最近一个可信轮次, 悬停显示会话全局平均
// (主进程 rounds 为环形缓冲, 3.18.x~3.19.x 实测上限 200 条, 满后轮数不再增长)
// (可信轮次总输出 ÷ 总时长, 加权平均); 永久常驻(无数据显示 0, 灰色),
// 会话切换清空; 数字分级色: <40 红 40-80 橙黄 >=80 绿; 闪电与 t/s 恒灰
// token/积分数据链(面板与 data-info 消费): token=全轮 usage 求和; 积分链与官方
// "用量"页同源——providerSettingsService.getView() 找当前 zhipu-account 连接
// (mode=start-plan / individual-coding-plan, 准入参考官方 WP/KP),
// usageStatsService 取数: coding-plan → getCodingPlanUsageSnapshot(range 7d)
// → detail.model.totalCredits; start-plan → getEntitlementSnapshot 余额桶
// (Σusage=累计已用, billing/balance 无 7d 口径, 显示套餐周期累计);
// 60s 轮询, 服务端统计有分钟级延迟(面板注明), 失败保留旧值并标注
() => {
  if (typeof document !== "undefined" && !document.getElementById("zcodeTpsPulseStyle")) {
    const st = document.createElement("style");
    st.id = "zcodeTpsPulseStyle";
    st.textContent = "@keyframes zcodeTpsPulse{0%,100%{opacity:1}50%{opacity:0.25}}";
    document.head.appendChild(st);
  }
  let [v, setV] = (0, Q.useState)(null);
  let [c, setC] = (0, Q.useState)(null);
  // 分类账本(移植 zcode-context 思路): 打开卡片时按需拉 session/messages, step 水位差值
  // 实测记账 + 窗口内字符折算(≈标注); 存逗号串保 same 判定
  let [a, setA] = (0, Q.useState)(null);
  // 官方来源构成(ZCode 4.0): session/read 的 runtime.contextUsage.breakdown 是 agent 自身
  // 的上下文构成快照(7 类字符数), 比字符折算权威; 官方弹层按 chars 占比画分段条, 同口径展示
  let [o, setO] = (0, Q.useState)(null);
  const okV = v != null && Number.isFinite(v.v);
  const okT = v != null && Number.isFinite(v.tok);
  const okC = c != null && Number.isFinite(c.used);
  const okG = v != null && !!v.gen;
  const okA = a != null && typeof a.cats === "string" && a.cats.length > 0;
  // 分类键本身可含冒号(Tool:Bash), 按最后一个冒号切键值
  const aPairs = okA ? a.cats.split(",").map(s2 => { const k2 = s2.lastIndexOf(":"); return [s2.slice(0, k2), Number(s2.slice(k2 + 1))]; }) : [];
  const okO = o != null && typeof o.bd === "string" && o.bd.length > 0;
  const oPairs = okO ? o.bd.split(",").map(s2 => { const k2 = s2.lastIndexOf(":"); return [s2.slice(0, k2), Number(s2.slice(k2 + 1))]; }) : [];
  const oTotal = oPairs.reduce((s2, kv) => s2 + kv[1], 0);
  // 7 类来源中文名取弹层同款 i18n 文案, 自造名会与官方界面不一致
  const SRC = { messages: "消息", system_prompt: "系统提示", meta_user_context: "其他", skills: "技能", tool_prompt: "工具提示", system_tool_schemas: "系统工具", mcp_tool_schemas: "MCP 工具" };
  const sLb = k2 => SRC[k2] || k2;
  // 官方 Tan() 同口径: 百分比 <10 保留一位小数, 四舍五入到 0.4% 级别
  const sPct = c2 => {
    const p2 = oTotal > 0 ? c2 / oTotal * 100 : 0;
    return (p2 >= 10 ? Math.round(p2) : Math.round(p2 * 10) / 10) + "%";
  };
  // 积分结算等待分钟数(服务端分钟级延迟, 持续对话时可能连跨数轮才入账)
  const pmins = okC && c.pend && c.pendSince ? Math.round((Date.now() - c.pendSince) / 60000) : 0;
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
  // 点击徽标复制会话统计(纯文本多行); 定义在组件体, 每次渲染刷新闭包——点击时永远拿到最新 v/c
  const buildStats = () => {
    const lines = ["ZCode 会话统计 " + dfmt(Date.now()) + " " + hfmt(Date.now())];
    if (okV) {
      if (v.model) lines.push("模型: " + v.model);
      lines.push("最近一轮: " + (v.v >= 100 ? v.v.toFixed(0) : v.v.toFixed(1)) + " t/s" + (v.dur >= 1000 ? "（" + (v.dur / 1000).toFixed(1) + "s）" : ""));
      lines.push("会话平均: " + (v.avg >= 100 ? v.avg.toFixed(0) : v.avg.toFixed(1)) + " t/s · " + v.n + " 轮长回复");
      lines.push("本次对话: " + grp(v.tok) + " tokens（输入 " + grp(v.tin) + " · 输出 " + grp(v.tout)
        + (v.treason > 0 ? " · 思考 " + grp(v.treason) : "")
        + (v.tcr > 0 ? " · 缓存读 " + grp(v.tcr) : "") + (v.tcw > 0 ? " · 缓存写 " + grp(v.tcw) : "")
        + (v.hit != null ? " · 命中 " + Math.round(v.hit * 100) + "%" : "") + "）");
      // 官方构成不依赖轮次数据(独立数据源), 放在固定开销块外
      if (okO) {
        lines.push("上下文来源（官方字符构成，与上下文容量弹层同源）: "
          + oPairs.map(kv => sLb(kv[0]) + " " + sPct(kv[1]) + "（" + grp(kv[1]) + " 字符）").join(" · "));
      }
      if (v.fx != null) {
        lines.push("上下文固定开销: " + grp(v.fx) + " tokens（首轮输入=系统提示+技能+工具定义+MCP）");
        if (okA) {
          lines.push("Token 分类（≈窗口差值字符折算，近 120 消息）: " + aPairs.map(kv => kv[0].replace(/^Tool:/, "") + " ≈" + grp(kv[1])).join(" · "));
          lines.push("助手输出（精确）: " + grp(a.out) + " tokens");
        }
        if (v.top) {
          lines.push("最大增量轮: " + v.top.split(",").map(p => {
            const kv = p.split(":");
            return "第" + (Number(kv[0]) + 1) + "轮 +" + grp(Number(kv[1]));
          }).join(" · ") + "（当前水位 " + grp(v.curIn) + " tokens）");
        }
      }
    } else {
      lines.push("暂无长回复数据");
    }
    if (okC) {
      lines.push((c.planKind === "start-plan" ? "套餐累计已用: " : "近7天积分: ") + grp(c.used)
        + (c.planKind === "start-plan" && c.total ? " / " + grp(c.total) : ""));
      lines.push("最近一轮积分: +" + grp(c.lastCost) + (c.lastCostAt ? "（" + hfmt(c.lastCostAt) + " 结算）" : "（待首轮结算）"));
    }
    return lines.join("\n");
  };
  globalThis.__zcodeTpsBuildStats = buildStats;
  // 悬停卡片已删(11-25 拍板"外面这层不要了"): 弹层面板(badge-panel.src.js)是唯一统计面,
  // 走原生 tailwind 类天然跟随主题, 不再需要自绘配色; 这里只留点击复制的轻提示 toast
  // (复制是全局快捷操作, 触发时弹层多半没开, 用不上面板)
  const showHint = msg => {
    const b = typeof document !== "undefined" && document.querySelector ? document.querySelector("[data-zcode-tps-badge]") : null;
    if (!b || !document.body) return;
    const d = document.createElement("div");
    d.textContent = msg;
    d.style.cssText = "position:fixed;z-index:2147483000;padding:6px 10px;border-radius:8px;font-size:12px;"
      + "background:var(--color-background,#18181c);color:var(--color-foreground,#e5e7eb);"
      + "border:1px solid var(--color-border,rgba(255,255,255,0.1));box-shadow:0 4px 14px rgba(0,0,0,0.4);"
      + "pointer-events:none;transition:opacity 140ms ease";
    document.body.appendChild(d);
    const r = b.getBoundingClientRect();
    const w = d.offsetWidth || 90;
    const vw = window.innerWidth || 1920;
    d.style.left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), vw - 8 - w) + "px";
    d.style.top = Math.max(8, r.top - 38) + "px";
    // 视觉计时器走 globalThis.setTimeout——冒烟假计时器只接管 tick 链的单槽, 不抢它
    globalThis.setTimeout(() => { d.style.opacity = 0; globalThis.setTimeout(() => d.remove(), 160); }, 1400);
  };
  // 悬停迷你卡(11-25 二次拍板: 最近一轮/会话平均/趋势条移出面板, 悬停徽标即见):
  // 只放 TPS 四件事——大数字/最近一轮(生成中换等待计时)/会话平均/趋势条;
  // token/积分/上下文仍在弹层面板。配色全走语义 CSS 变量, 深浅主题免探测自适应
  // (上一版卡片是命令式 DOM 拿不到组件级主题, 曾用探针+canvas 判明暗, 变量方案更省)
  const cardCss = "position:fixed;z-index:2147483000;pointer-events:none;width:252px;padding:10px 12px;border-radius:10px;"
    + "background:var(--color-background,#18181c);border:1px solid var(--color-border,rgba(255,255,255,0.1));"
    + "box-shadow:0 8px 28px rgba(0,0,0,0.4);font-size:12px;line-height:18px;color:var(--color-foreground,#e5e7eb);"
    + "font-variant-numeric:tabular-nums;text-align:left;white-space:nowrap;overflow:hidden;transition:opacity 140ms ease";
  const cGrade = () => !okV ? "var(--color-foreground-subtle,#9ca3af)"
    : v.v >= 80 ? "var(--color-success,#3ecf6e)" : v.v >= 40 ? "var(--color-warning,#f0a13a)" : "var(--color-error,#ef4444)";
  const cardHtml = '<div style="display:flex;align-items:baseline;gap:4px">'
    + '<span style="font-size:19px;font-weight:700;line-height:22px;color:' + cGrade() + ';opacity:' + (okG ? 0.55 : 1) + '">'
    + (!okV ? "0.0" : v.v >= 100 ? v.v.toFixed(0) : v.v.toFixed(1)) + '</span>'
    + '<span style="color:var(--color-foreground-subtle,#9ca3af);font-size:12px">t/s</span></div>'
    + '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-top:3px">'
    + '<span style="color:var(--color-foreground-subtle,#9ca3af);font-size:12px">'
    + (okG ? "生成中 · 已等待 " + Math.floor((v.waitMs || 0) / 1000) + "s"
      : "最近一轮" + (okV && v.dur >= 1000 ? " · " + (v.dur / 1000).toFixed(1) + "s" : ""))
    + '</span><span style="color:var(--color-foreground-subtle,#9ca3af);font-size:11px">'
    + (!okV ? "暂无长回复数据" : "会话平均 " + (v.avg >= 100 ? v.avg.toFixed(0) : v.avg.toFixed(1)) + " t/s · " + v.n + " 轮")
    + "</span></div>"
    // 迷你趋势: 最近 12 个可信轮速率条形(旧→新), 最新一条高亮; 阈值配色与徽标分级一致
    + (okV && typeof v.trend === "string" && v.trend ? (() => {
      const arr = v.trend.split(",");
      const mx = Math.max.apply(null, arr.map(parseFloat));
      return '<div style="display:flex;align-items:flex-end;gap:2px;height:14px;margin-top:5px">'
        + arr.map((x, i) => {
          const r = parseFloat(x);
          const h2 = Math.round(4 + (mx > 0 ? r / mx : 0) * 10);
          const col = r >= 80 ? "var(--color-success,#3ecf6e)" : r >= 40 ? "var(--color-warning,#f0a13a)" : "var(--color-error,#ef4444)";
          return '<div style="width:4px;height:' + h2 + 'px;background:' + col + ';opacity:' + (i === arr.length - 1 ? "1" : "0.45") + ';border-radius:1px"></div>';
        }).join("") + "</div>";
    })() : "");
  globalThis.__zcodeTpsSyncCard = () => {
    const d = globalThis.__zcodeTpsCardEl;
    if (!d) return;
    const b = typeof document !== "undefined" ? document.querySelector("[data-zcode-tps-badge]") : null;
    if (!b) { d.remove(); globalThis.__zcodeTpsCardEl = null; return; }
    // 每次同步重设样式: 主题/内容动态变化后已打开的卡片跟随;
    // cssText 整体重置会抹掉淡出中的 opacity, 按隐藏标记恢复
    d.style.cssText = cardCss;
    if (globalThis.__zcodeTpsCardHiding) d.style.opacity = 0;
    d.innerHTML = cardHtml;
    const r = b.getBoundingClientRect();
    const w = d.offsetWidth || 252;
    const hgt = d.offsetHeight || 80;
    // 默认底边贴徽标顶(上方弹出); 上方放不下改为下方弹出, 水平按实际宽度居中并夹紧屏内
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
      // 淡入: 下一帧回 1
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
    + "\n" + (!okV ? "模型输出速度 · 暂无长回复数据（<40 红 40-80 黄 ≥80 绿）" + (okG ? " · 生成中" + (v && v.waitMs > 0 ? "，已等待 " + Math.floor(v.waitMs / 1000) + "s" : "") : "")
      : "最近一轮: " + (v.v >= 100 ? v.v.toFixed(0) : v.v.toFixed(1)) + " t/s"
        + (v.dur >= 1000 ? "（" + (v.dur / 1000).toFixed(1) + "s 生成）" : "")
        + "\n会话平均: " + (v.avg >= 100 ? v.avg.toFixed(0) : v.avg.toFixed(1))
        + (v.model ? "\n模型: " + v.model : "")
        + " t/s（" + v.n + " 轮长回复加权）" + (okG ? "\n生成中" + (v.waitMs > 0 ? "，已等待 " + Math.floor(v.waitMs / 1000) + "s" : "") + " · 本轮完成后更新" : ""))
    + (okT && v.fx != null ? "\n上下文固定开销: " + grp(v.fx) + " tokens（首轮输入=系统提示+技能+工具定义+MCP；定位法：设置里临时关掉某 MCP/技能，看此值变化）"
      + (v.top ? "\n最大增量: " + v.top.split(",").map(p => {
          const kv = p.split(":");
          return "第" + (Number(kv[0]) + 1) + "轮 +" + grp(Number(kv[1]));
        }).join(" · ") : "")
      + "\n当前水位: " + grp(v.curIn) + " tokens（相邻轮差=窗口新增，大增量多为大工具结果）"
      + (okA ? "\nToken 分类（≈窗口差值按字符折算，近 120 消息）: "
        + aPairs.map(kv => kv[0].replace(/^Tool:/, "") + " ≈" + grp(kv[1])).join(" · ")
        + "\n助手输出（精确）: " + grp(a.out) + " tokens" : "") : "")
    + (okO ? "\n上下文来源（官方字符构成）: "
      + oPairs.map(kv => sLb(kv[0]) + " " + sPct(kv[1]) + "（" + grp(kv[1]) + " 字符）").join(" · ") : "")
    + (c == null ? "" : !okC ? "\n套餐积分: " + c.err + " · 将自动重试"
      : c.planKind === "start-plan"
        ? "\n套餐累计已用: " + grp(c.used) + (c.total ? " / " + grp(c.total) : "")
          + (Number.isFinite(c.rem) ? "\n剩余 " + grp(c.rem) + (c.pct != null ? "（剩 " + Math.round(c.pct * 100) + "%）" : "") : "")
          + (c.pEnd ? " · 周期至 " + dfmt(c.pEnd) : "")
          + "\n更新 " + hfmt(c.at) + " · 服务端统计有分钟级延迟"
        : "\n近7天积分消耗: " + grp(c.used) + (c.daily ? "（日均 " + grp(c.daily) + "）" : "")
          + "\n更新 " + hfmt(c.at) + " · 服务端统计有分钟级延迟")
    + (c != null && okC ? (c.pend ? "\n本轮积分结算中（服务端有延迟" + (pmins >= 1 ? "，已 " + pmins + " 分钟" : "") + "）"
      : "\n最近一轮消耗: +" + grp(c.lastCost) + " 积分"
        + (c.lastCostAt ? "（" + hfmt(c.lastCostAt) + " 结算）" : "（待首轮结算）")) : "")
    + (okC && c.err ? "（上次刷新失败: " + c.err + "）" : "");
  return (0, Q.useEffect)(() => {
    let dead = false, timer = null, seenSid = null;
    let credAt = 0, credBusy = false;
    // 子代理 TPS 轮询节奏: 2.5s 一拍(快于积分慢于 tick), subBusy 防重入
    let subAt = 0, subBusy = false;
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
    // 上下文固定开销: 首轮输入=系统提示+技能+工具定义+MCP schema+首条消息(全部 API 精确值)。
    // 环形缓冲(200 条)把首轮挤出后就拿不到了, 只在缓冲未满时记录一次; 切会话清零重记
    let fxCache = null;
    const fetchCred = async () => {
      try {
        const svc = globalThis.__zcodeTpsSvc;
        const usage = svc && svc.usageStatsService;
        const ps = svc && svc.providerSettingsService;
        if (!usage || !ps || typeof ps.getView !== "function") { globalThis.__zcodeTpsDataC = null; setC(null); return; }
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
        if (!pick) { lastCum = null; roundPending = false; lastRK = null; lastFK = null; carry = false; pendTries = 0; pendStart = 0; prevLen = 0; globalThis.__zcodeTpsDataC = null; setC(prev => prev === null ? prev : null); return; }
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
          extra = { total: total > 0 ? total : null, rem: rem, pct: pct, label: (snap && snap.quota && snap.quota.level) || "Start", pEnd: pEnd, daily: null };
        } else {
          const tz = typeof Intl !== "undefined" && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
          const snap = await usage.getCodingPlanUsageSnapshot({ range: "7d", preferredProviderId: pid, accountAccess: access, timeZone: tz });
          const dm = snap && snap.detail && snap.detail.model ? snap.detail.model : null;
          cur = dm && Number.isFinite(dm.totalCredits) ? dm.totalCredits : null;
          extra = { total: null, rem: null, pct: null, label: "近7天", pEnd: 0, daily: dm && Number.isFinite(dm.averageDailyCredits) ? dm.averageDailyCredits : null };
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
            : Object.assign({ used: null, total: null, rem: null, pct: null, label: extra ? extra.label : "", planKind: acc.mode, family: acc.accountType, pEnd: 0, daily: null, at: Date.now(), err: "服务端未返回积分" }, lc));
          return;
        }
        const cObj = Object.assign({ used: cur, total: extra.total, rem: extra.rem, pct: extra.pct, label: extra.label, planKind: acc.mode, family: acc.accountType, pEnd: extra.pEnd, daily: extra.daily, at: Date.now(), err: null }, lc);
        globalThis.__zcodeTpsDataC = cObj;
        setC(cObj);
      } catch (e) {
        const msg = String(e && e.message || e).slice(0, 60);
        setC(prev => {
          if (prev && Number.isFinite(prev.used)) return Object.assign({}, prev, { at: Date.now(), err: msg });
          return prev && prev.err === msg ? prev : { used: null, total: null, rem: null, pct: null, label: "", planKind: "", family: "", pEnd: 0, at: Date.now(), err: msg, lastCost: lastCostVal, lastCostAt: lastCostAtVal, pend: roundPending };
        });
      }
    };
    // Token 分类账本(移植 zcode-context 记账): 打开卡片时 30s 节流拉一次 session/messages。
    // 记账: step-finish 部件的 tokens.input 是相邻请求的精确水位, 差值=窗口新增(实测);
    // 窗口内条目(工具结果/用户消息)按字符占比折算 token(≈估算, zcode-context 同款兜底);
    // 首个 step 水位=固定开销(系统+工具定义+MCP); 助手输出按响应 tokens.output 精确单列
    let lastPull = 0;
    const pullCtx = async () => {
      // 官方来源构成先拉: session/read 的 runtime.contextUsage.breakdown 是 agent 自身
      // 的上下文构成快照(messageLimit 1 只取元数据), 7 类字符数; 独立 try——旧版本/
      // 空会话/未跑过模型时无 breakdown, 不能拖垮下面的折算账本
      try {
        const ctx3 = globalThis.__zcodeTpsCtx;
        const svc3 = globalThis.__zcodeTpsSvc && globalThis.__zcodeTpsSvc.zcodeAgentService;
        if (ctx3 && ctx3.sid && ctx3.ws && svc3 && typeof svc3.readSession === "function") {
          const rd = await raceTimeout(svc3.readSession({
            workspacePath: ctx3.ws, workspaceIdentity: ctx3.wi, sessionId: ctx3.sid, messageLimit: 1
          }), RACE_MS);
          const cu = rd && rd.runtime && rd.runtime.contextUsage;
          const bdIn = cu && Array.isArray(cu.breakdown) ? cu.breakdown : [];
          // 同源合并(弹层 kan() 也是按 source 求和): 协议可能按请求重复上报同一来源
          const m2 = {};
          for (const it of bdIn) {
            if (!it || typeof it.source !== "string" || !Number.isFinite(it.chars) || it.chars <= 0) continue;
            m2[it.source] = (m2[it.source] || 0) + it.chars;
          }
          const bdStr = Object.keys(m2).map(k => [k, m2[k]]).sort((x, y) => y[1] - x[1]).map(kv => kv[0] + ":" + kv[1]).join(",");
          if (bdStr && !dead) {
            const used = Number.isFinite(cu.used) ? cu.used : null;
            const size = Number.isFinite(cu.size) ? cu.size : null;
            const oPrev = globalThis.__zcodeTpsDataO;
            if (!oPrev || oPrev.bd !== bdStr || oPrev.used !== used || oPrev.size !== size) {
              const oObj = { bd: bdStr, used: used, size: size, at: Date.now() };
              globalThis.__zcodeTpsDataO = oObj;
              setO(oObj);
            }
          }
        }
      } catch (e) { /* 官方构成取不到时保留折算视图 */ }
      try {
        const ctx2 = globalThis.__zcodeTpsCtx;
        const svc2 = globalThis.__zcodeTpsSvc && globalThis.__zcodeTpsSvc.zcodeAgentService;
        if (!ctx2 || !ctx2.sid || !ctx2.ws || !svc2 || typeof svc2.readSessionMessages !== "function") return;
        let msgs = null;
        try {
          msgs = await raceTimeout(svc2.readSessionMessages({ workspacePath: ctx2.ws, workspaceIdentity: ctx2.wi, sessionId: ctx2.sid, limit: 120, direction: "backward" }), RACE_MS);
        } catch (e1) {
          msgs = await raceTimeout(svc2.readSessionMessages({ workspacePath: ctx2.ws, workspaceIdentity: ctx2.wi, sessionId: ctx2.sid, limit: 120 }), RACE_MS);
        }
        if (dead || !Array.isArray(msgs)) return;
        const arr = msgs.slice().sort((x, y) => ((x.info && x.info.time) || 0) - ((y.info && y.info.time) || 0));
        const steps = [], items = [];
        let out2 = 0;
        for (const m of arr) {
          const info = m && m.info;
          const t0 = (info && info.time) || 0;
          if (info && info.role === "assistant" && info.tokens && Number.isFinite(info.tokens.output)) out2 += info.tokens.output;
          const parts2 = Array.isArray(m.parts) ? m.parts : [];
          for (const p of parts2) {
            if (!p || !p.type) continue;
            if (p.type === "step-finish" && p.tokens && Number.isFinite(p.tokens.input)) steps.push({ t: t0, input: p.tokens.input });
            if (info && info.role === "user" && p.type === "text" && typeof p.text === "string" && p.text.length > 0) {
              const kind = info.kind || "user_prompt";
              items.push({ t: t0, chars: p.text.length, cat: kind === "user_prompt" ? "用户输入" : "系统注入·" + kind });
            }
            if (p.type === "tool" && p.state && p.state.status === "completed" && typeof p.state.output === "string" && p.state.output.length > 0) {
              items.push({ t: Number(p.state.completedAt) || t0, chars: p.state.output.length, cat: "Tool:" + (p.tool || "?") });
            }
          }
        }
        const cats = {};
        if (steps.length > 0) {
          cats["系统+工具定义"] = steps[0].input;
          for (let i = 1; i < steps.length; i++) {
            const d = steps[i].input - steps[i - 1].input;
            if (d <= 0) continue;
            const win = items.filter(x => x.t > steps[i - 1].t && x.t <= steps[i].t);
            const tot = win.reduce((s2, x) => s2 + x.chars, 0);
            if (tot <= 0) continue;
            win.forEach(x => { cats[x.cat] = (cats[x.cat] || 0) + Math.round(x.chars / tot * d); });
          }
        }
        const catStr = Object.keys(cats).map(k => [k, cats[k]]).sort((x, y) => y[1] - x[1]).slice(0, 8).map(kv => kv[0] + ":" + kv[1]).join(",");
        if (catStr) { const aObj = { cats: catStr, out: out2, at: Date.now() }; globalThis.__zcodeTpsDataA = aObj; setA(prev => prev && prev.cats === catStr && prev.out === out2 ? prev : aObj); }
      } catch (e) { /* 静默, 下次开卡重试 */ }
    };
    globalThis.__zcodeTpsPullCtx = () => {
      if (dead || Date.now() - lastPull < 30000) return;
      lastPull = Date.now();
      pullCtx();
    };
    const tick = async () => {
      if (tickBusy) return;
      tickBusy = true;
      let gen = false;
      try {
        const ctx = globalThis.__zcodeTpsCtx;
        const svc = globalThis.__zcodeTpsSvc && globalThis.__zcodeTpsSvc.zcodeAgentService;
        if (ctx && ctx.sid && ctx.ws && svc && typeof svc.readSessionDebug === "function") {
          if (seenSid !== ctx.sid) {
            seenSid = ctx.sid; setV(null); lastRK = null; lastFK = null; roundPending = false; pendTries = 0; pendStart = 0; prevLen = 0; fxCache = null;
            // 换会话即清旧账本与官方构成, 否则会把上个会话的分类/来源挂到新会话
            globalThis.__zcodeTpsDataA = null; globalThis.__zcodeTpsDataO = null; setA(null); setO(null);
            globalThis.__zcodeTpsSub = null;
            lastPull = 0; subAt = 0;
          }
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
          // 生成中已等待时长: 末条网络事件距现在(1s tick 驱动实时跳动)
          let waitMs = 0;
          if (gen && lastE && Number.isFinite(lastE.recordedAt)) waitMs = Math.max(0, Date.now() - lastE.recordedAt);
          let rate = null, sumOut = 0, sumDur = 0, count = 0;
          let tok = 0, tin = 0, tout = 0, tcr = 0, tcw = 0, tokN = 0;
          let treason = 0;
          let lastDur = 0;
          const rates = [];
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
              rates.push(r.tokensPerSecond);
              sumOut += out;
              sumDur += dur;
              count++;
            }
          }
          const avg = sumDur > 0 ? sumOut * 1000 / sumDur : null;
          // 迷你趋势: 最近 12 个可信轮速率(旧→新), 存逗号串——数组每次重建引用不同,
          // 串比较才能让 setV 的 same 判定在空闲时保持命中
          rates.reverse();
          const trendStr = rates.slice(-12).map(x => x >= 100 ? String(Math.round(x)) : String(Math.round(x * 10) / 10)).join(",");
          // 上下文去向: 每轮 inputTokens 是请求时上下文水位(API 精确值), 相邻轮差值=该窗口新增。
          // 大增量轮通常=大工具结果(读文件/命令输出/MCP 返回)或长用户消息; 固定开销见 fxCache 注释
          let curIn = 0;
          const deltas = [];
          if (fxCache == null && rounds.length > 0 && rounds.length < 200 && rounds[0].usage && Number.isFinite(rounds[0].usage.inputTokens)) {
            fxCache = rounds[0].usage.inputTokens;
          }
          for (let k = 0; k < rounds.length; k++) {
            const u2 = rounds[k] && rounds[k].usage;
            const in2 = u2 && Number.isFinite(u2.inputTokens) ? u2.inputTokens : 0;
            curIn = in2;
            if (k > 0) {
              const pu = rounds[k - 1] && rounds[k - 1].usage;
              const pin = pu && Number.isFinite(pu.inputTokens) ? pu.inputTokens : 0;
              if (in2 - pin > 0) deltas.push({ i: k, d: in2 - pin });
            }
          }
          deltas.sort((a, b) => b.d - a.d);
          // top 编码 "requestIndex:增量" 逗号串(串比较稳 setV same 判定), 组件体再格式化
          const topStr = deltas.slice(0, 3).map(x => {
            const rr = rounds[x.i];
            return (Number.isFinite(rr && rr.requestIndex) ? rr.requestIndex : x.i) + ":" + x.d;
          }).join(",");
          // 空闲判定: 轮数/末轮key/网络末态/token 合计与缓存读全不变视为无变化(步进降频)
          const sig = rounds.length + ":" + rk + ":" + (lastE ? lastE.statusType : "") + ":" + tok + ":" + tcr;
          if (sig === lastSig) idleTicks++; else { idleTicks = 0; lastSig = sig; }
          setV(prev => {
            const next = rate === null ? null : { v: rate, avg: avg, n: count, dur: lastDur, tok: tok, tin: tin, tout: tout, treason: treason, tcr: tcr, tcw: tcw, hit: cacheHit, model: model, trend: trendStr, waitMs: waitMs, gen: gen, fx: fxCache, curIn: curIn, top: topStr };
            // 弹层面板镜像: zcodeTpsPanel 每秒读 globalThis 镜像, 与徽标共享数据不重复轮询
            globalThis.__zcodeTpsDataV = next;
            // 全字段比较: 缓存读写不一定计入 totalTokens, 漏比较会导致缓存数变化不刷新
            const same = next === null ? prev === null
              : prev !== null && prev.v === rate && prev.avg === avg && prev.n === count && prev.gen === gen && prev.dur === lastDur
                && prev.tok === tok && prev.tin === tin && prev.tout === tout && prev.treason === treason
                && prev.fx === fxCache && prev.curIn === curIn && prev.top === topStr
                && prev.tcr === tcr && prev.tcw === tcw && prev.hit === cacheHit && prev.model === model
                && prev.trend === trendStr && prev.waitMs === waitMs;
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
      // 子代理 TPS 镜像(11-26): listSessionSubagents 拿 running(childSessionId),
      // 逐个 readSessionDebug 取最近可信轮写 __zcodeTpsSub, 聊天流 Agent 卡片标签
      // (zcodeTpsSubTag)按 childSessionId 消费。口径比主徽标放宽: 子代理轮次普遍短,
      // 输出>=20 且时长>=300ms; 条目从 running 消失后保留最后值 10s 再淡出
      if (!dead && !subBusy && nowMs - subAt >= 2500) {
        subAt = nowMs;
        const svcS = globalThis.__zcodeTpsSvc && globalThis.__zcodeTpsSvc.zcodeAgentService;
        const ctxS = globalThis.__zcodeTpsCtx;
        if (ctxS && ctxS.sid && ctxS.ws && svcS && typeof svcS.listSessionSubagents === "function") {
          subBusy = true;
          raceTimeout((async () => {
            const lst = await raceTimeout(svcS.listSessionSubagents({
              workspacePath: ctxS.ws, workspaceIdentity: ctxS.wi, sessionId: ctxS.sid, endedLimit: 0
            }), RACE_MS);
            const running = lst && Array.isArray(lst.running) ? lst.running : [];
            const prevSub = globalThis.__zcodeTpsSub || {};
            const next = {};
            const jobs = [];
            for (let k = 0; k < running.length; k++) {
              const cid = running[k] && typeof running[k].childSessionId === "string" ? running[k].childSessionId : null;
              if (!cid) continue;
              next[cid] = prevSub[cid] || { tps: null, at: 0 };
              jobs.push(raceTimeout(svcS.readSessionDebug({
                workspacePath: ctxS.ws, workspaceIdentity: ctxS.wi, sessionId: cid
              }), RACE_MS).then(rd => ({ cid: cid, rd: rd }), () => null));
            }
            // 结束保留: 不在 running 但 10s 内有过值的条目继续保留最后值
            for (const pid of Object.keys(prevSub)) {
              if (!(pid in next) && Number.isFinite(prevSub[pid].tps) && nowMs - (prevSub[pid].at || 0) < 10000) {
                next[pid] = prevSub[pid];
              }
            }
            const rs = await Promise.all(jobs);
            for (let k = 0; k < rs.length; k++) {
              const r = rs[k];
              if (!r) continue;
              const rounds2 = r.rd && Array.isArray(r.rd.rounds) ? r.rd.rounds : [];
              let tps2 = null, out2 = 0, dur2 = 0;
              for (let j = rounds2.length - 1; j >= 0; j--) {
                const rr = rounds2[j]; const uu = rr && rr.usage;
                const dd = rr && rr.generationDurationMs; const oo = uu && uu.outputTokens;
                if (Number.isFinite(dd) && dd >= 300 && dd < 36e5 &&
                    Number.isFinite(oo) && oo >= 20 &&
                    Number.isFinite(rr.tokensPerSecond) && rr.tokensPerSecond < 500) {
                  tps2 = rr.tokensPerSecond; out2 = oo; dur2 = dd; break;
                }
              }
              if (tps2 != null) next[r.cid] = { tps: tps2, out: out2, dur: dur2, at: Date.now() };
              else if (next[r.cid]) next[r.cid].at = Date.now();
            }
            if (!dead) globalThis.__zcodeTpsSub = next;
          })(), RACE_MS * 2).then(() => { subBusy = false; }, () => { subBusy = false; });
        }
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
    // 点击判定: document 级委托(捕获), 不依赖 React 合成事件
    const bSel = "[data-zcode-tps-badge]";
    const inBadge = t => !!(t && t.closest && t.closest(bSel));
    // 悬停迷你卡: 进徽标开卡, 出徽标 140ms 淡出(快速移回时 showCard 清 timer 复用卡片);
    // 淡出计时器走 globalThis.setTimeout, 不占冒烟 mock 的单槽
    const onOver = e => {
      if (inBadge(e.target) && !(e.relatedTarget && inBadge(e.relatedTarget))) globalThis.__zcodeTpsShowCard();
    };
    const onOut = e => {
      if (inBadge(e.target) && !(e.relatedTarget && inBadge(e.relatedTarget))) {
        const d = globalThis.__zcodeTpsCardEl;
        if (d) {
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
    // 点击徽标复制: capture 阶段拦下并 stopPropagation——徽标位于弹层触发器内部,
    // 不拦截会冒泡打开弹层; 无剪贴板 API 时静默(统计可从弹层面板看)
    const onClick = e => {
      if (!inBadge(e.target)) return;
      e.stopPropagation();
      e.preventDefault();
      const build = globalThis.__zcodeTpsBuildStats;
      if (!build || typeof navigator === "undefined" || !navigator.clipboard || !navigator.clipboard.writeText) return;
      navigator.clipboard.writeText(build()).then(() => showHint("已复制会话统计"), () => showHint("复制失败"));
    };
    let cleanupDoc = () => {};
    if (typeof document !== "undefined" && document.addEventListener) {
      document.addEventListener("mouseover", onOver, true);
      document.addEventListener("mouseout", onOut, true);
      document.addEventListener("click", onClick, true);
      cleanupDoc = () => {
        document.removeEventListener("mouseover", onOver, true);
        document.removeEventListener("mouseout", onOut, true);
        document.removeEventListener("click", onClick, true);
        if (globalThis.__zcodeTpsHideTimer) { globalThis.clearTimeout(globalThis.__zcodeTpsHideTimer); globalThis.__zcodeTpsHideTimer = null; }
        globalThis.__zcodeTpsCardHiding = false;
        const d = globalThis.__zcodeTpsCardEl;
        if (d) { d.remove(); globalThis.__zcodeTpsCardEl = null; }
      };
    }
    return () => {
      dead = true;
      if (timer) clearTimeout(timer);
      if (globalThis.__zcodeTpsPullCtx) globalThis.__zcodeTpsPullCtx = null;
      cleanupDoc();
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
      userSelect: "none", cursor: "pointer",
      color: "var(--color-foreground-subtle, #9ca3af)"
    },
    children: [
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
      (0, $.jsx)("span", { style: { fontWeight: 400, fontSize: "11.5px", opacity: 0.85 }, children: "t/s" })
    ]
  });
}
