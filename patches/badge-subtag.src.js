// 聊天流 Agent 工具卡的子代理 TPS 标签(11-26 新增): 卡片头部名字后面的小速度标
// 数据链: 徽标轮询(listSessionSubagents→readSessionDebug per childSessionId)镜像到
// globalThis.__zcodeTpsSub, 本组件只读镜像不自己轮询;
// childSessionId 解析链(toolCall 侧): 官方 spawn_agent 写 _meta.zcode.backgroundAgent,
// CLI Agent 工具在 output 文本里写 "agentId: agent_xxx"(启动即写入, 完成后保留),
// childSessionId = "sess_subagent_agent_" + agentId(实测 metadata.json 命名);
// 三种来源都取不到时返回 null 不渲染(优雅降级, 不影响卡片本体)
// 样式: 官方 tailwind 类 + 语义色变量, 自动跟随主题; 无自绘色值
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
  const txt = (d.tps >= 100 ? Math.round(d.tps) : Math.round(d.tps * 10) / 10) + " t/s";
  return (0, $.jsx)("span", {
    className: "text-ui-sm tabular-nums text-foreground-subtle",
    style: { flexShrink: 0 },
    title: "子代理输出速度（生成时长 ≥0.3s 的最近可信轮）",
    children: txt
  });
}
