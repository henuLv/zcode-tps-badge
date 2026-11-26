// 聊天流 Agent 工具卡的子代理 TPS 标签(11-26 新增): 卡片头部名字后面的小速度标
// 样式与主徽标一致(11-26 拍板): 数字粗体分级色(<40 红 / 40-80 橙黄 / >=80 绿),
// t/s 后缀恒灰——不做"低调灰字"版, 用户点名要与主界面 TPS 同款
// 数据链: 徽标轮询(listSessionSubagents→readSessionDebug per childSessionId)镜像到
// globalThis.__zcodeTpsSub, 本组件只读镜像不自己轮询; 子代理结束后镜像条目
// 永久保留最后值(切会话才清), 卡片侧 output 文本里 agentId 一直在, 结束仍显示
// childSessionId 解析链(toolCall 侧): 官方 spawn_agent 写 _meta.zcode.backgroundAgent,
// CLI Agent 工具在 output 文本里写 "agentId: agent_xxx"(启动即写入, 完成后保留),
// childSessionId = "sess_subagent_agent_" + agentId(实测 metadata.json 命名);
// 三种来源都取不到时返回 null 不渲染(优雅降级, 不影响卡片本体)
({ toolCall: e }) => {
  const pick = (o, keys) => {
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (o && typeof o === "object" && typeof o[k] === "string" && o[k]) return o[k];
    }
    return null;
  };
  let cid = null;
  const raw = e && typeof e.raw === "object" && e.raw ? e.raw : null;
  const meta = raw && typeof raw._meta === "object" && raw._meta ? raw._meta : null;
  const zc = meta && typeof meta.zcode === "object" && meta.zcode ? meta.zcode : null;
  const bg = zc && typeof zc.backgroundAgent === "object" && zc.backgroundAgent ? zc.backgroundAgent : null;
  cid = pick(bg, ["childSessionId", "sessionId", "agentId"]);
  const out = e ? e.output : null;
  if (!cid && out && typeof out === "object") cid = pick(out, ["childSessionId", "sessionId", "agentId"]);
  if (!cid && typeof out === "string") {
    const m = out.match(/sess_subagent_agent_[A-Za-z0-9._-]+/);
    if (m) cid = m[0];
  }
  if (!cid && typeof out === "string") {
    const m2 = out.match(/agentId[:：]\s*[`'"]?(agent_[A-Za-z0-9._-]+)/);
    if (m2) cid = "sess_subagent_" + m2[1];
  }
  if (!cid || cid.indexOf("sess_subagent_") !== 0) {
    // 官方 spawn_agent 的 meta 可能直接给裸 agentId(无前缀), 拼上标准前缀再查
    if (cid && cid.indexOf("agent_") === 0) cid = "sess_subagent_" + cid;
    else cid = null;
  }
  const sub = cid ? globalThis.__zcodeTpsSub : null;
  const d = cid && sub ? sub[cid] : null;
  if (!d || !Number.isFinite(d.tps)) return null;
  const num = d.tps >= 100 ? String(Math.round(d.tps)) : String(Math.round(d.tps * 10) / 10);
  const col = d.tps >= 80 ? "var(--color-success, #3ecf6e)"
    : d.tps >= 40 ? "var(--color-warning, #f0a13a)"
    : "var(--color-error, #ef4444)";
  return (0, $.jsxs)("span", {
    style: { display: "inline-flex", alignItems: "baseline", gap: "3px", flexShrink: 0 },
    title: "子代理输出速度（生成时长 ≥0.3s 的最近可信轮，结束后保留最后值）",
    children: [
      (0, $.jsx)("span", {
        className: "tabular-nums",
        style: { fontWeight: 600, fontSize: "12.5px", color: col },
        children: num
      }),
      (0, $.jsx)("span", {
        style: { fontWeight: 400, fontSize: "11px", color: "var(--color-foreground-subtle, #9ca3af)" },
        children: "t/s"
      })
    ]
  });
}
