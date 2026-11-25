# 实现原理

## 为什么不能做成"纯插件"

ZCode 插件清单（`.zcode-plugin/plugin.json`）可声明的组件只有五类：skills、commands、
hooks、MCP servers、agents；`channels`、`lspServers`、`outputStyles`、`settings` 只登记不执行。
聊天输入工具栏（含上下文容量圆圈）由 Electron 渲染器 bundle 硬编码渲染，没有任何
statusLine / toolbar 扩展点（已检索 app.asar 与 zcode.cjs 全文确认）。因此"在圆圈旁显示
tps"必须修改渲染器代码本身。本插件 = 插件化交付（清单/自愈/文档）+ 渲染器补丁（实际功能）。

## 圆圈与数据链路

- 圆圈组件：`styles-*.js` 中的 `kJt`，用 SVG 两层 circle + strokeDashoffset 画环形进度，
  数据来自 `DJt()`（React Context `TJt`，由 `OJt` 提供 usedTokens/maxTokens）。
- 宿主：`MXt` 组件把圆圈放进 tooltip 触发按钮 `AJt`，按钮外套 `span.inline-flex.shrink-0`。
- TPS 数据：核心运行时（zcode.cjs）对每轮模型请求记录
  `{ usage, generationDurationMs, tokensPerSecond, recordedAt }`（rounds 为环形缓冲，
  3.18.2 实测上限 200 条——zod schema `rounds:e.array(RF).max(HR.rounds)`，
  HR=`{rounds:200,network:100,dedupe:2e3}`；满后轮数不再增长，徽标按"首轮被挤出"判定新轮），
  并记录网络事件 `networkEntries`（含 `model_request_started/completed` 状态）。
- 渲染器访问：`zcodeAgentService.readSessionDebug({workspacePath, workspaceIdentity, sessionId})`
  返回 `{ rounds, networkEntries, cache }`；官方"开发者工具"面板（tokenDebug）即以此每秒轮询。

## 五个补丁点（见 patches/renderer-patches.json）

1. `services-stash`：`Fl`(useServices) 命中时把 services 挂到 `globalThis.__zcodeTpsSvc`，
   让徽标能跨模块拿到 `zcodeAgentService`（积分链路同样从这里取
   `usageStatsService` / `providerSettingsService`）。
2. `qzt-stash`：工具栏 `QZt` 渲染时把 `{workspacePath, workspaceIdentity, sessionId}` 写入
   `globalThis.__zcodeTpsCtx`（sessionId 已在其签名解构）。
3. `badge-def`：在圆圈图标 `kJt` 与触发器 `AJt` 之间的 var 声明列表注入 `zcodeTpsBadge`
   组件（同模块作用域，直接复用 `$`/`Q`），同时定义 `__zcodeTpsSet`。
4. `mxt-open` / `mxt-tail`：把圆圈按钮所在 span 的 children 从单元素改为
   `Fragment[徽标, 按钮]`，徽标显示在圆圈**左侧**。

## 徽标显示策略

每 1 秒轮询 readSessionDebug（与开发者工具同频）：

- **绝对常驻**：徽标永不隐藏。无可信数据显示灰色 `0.0`。
- **可信口径**（参考 zcode-token-usage-statusbar 的 turn-stats）：从最近轮次往回找第一个
  满足 `generationDurationMs >= 200 && < 3.6e6 && outputTokens >= 50 && tokensPerSecond < 500`
  的轮次，显示其 `tokensPerSecond`（≥100 取整，否则 1 位小数）。毫秒级小请求
  （标题生成等）被过滤，不会出现几万 t/s 的虚高值。
- **分级色**（仅数字）：`< 40` 红 / `40-80` 橙黄 / `≥ 80` 绿，优先读语义 CSS 变量
  （--color-success/warning/error），回退硬编码色值。闪电与 `t/s` 恒灰。
- **生成中提示**：`networkEntries` 最后一条 `statusType` 为 `model_request_started`
  / `model_stream_stalled` / `model_retry_scheduled` 时判定"生成中"（这些网络事件
  实时写入，与轮粒度无关），闪电图标做 `zcodeTpsPulse` 脉动动画、tps 数字变淡至
  55%、悬停提示"生成中 · 本轮完成后更新"；`completed`/`failed` 或空列表即恢复。
  解决"数字只在轮完成后更新"的感知滞后，不依赖渲染器内部流式状态。
- 会话切换（sessionId 变化）清空回 0.0，等新会话产生可信数据。
- **积分数据链**（11-25 起不上徽标，只在弹层面板与 data-info 展示）：
  - 连接判定：`providerSettingsService.getView()` 找 `zhipu-account` 连接
    （`mode=start-plan` 或 `individual-coding-plan`），准入与参数推导复刻官方
    用量页 `WP`/`KP` 的规则（unavailable 且非 start-plan not-entitled 跳过、
    无 accountState 时要求 `entitled===true`、优先取 `accountState.current`）；
    未命中则面板不渲染积分行。
  - 取数（与官方 Settings → 用量页同源，`usageStatsService`）：
    - coding-plan：`getCodingPlanUsageSnapshot({range:'7d', timeZone, ...})` →
      `detail.model.totalCredits`（近 7 天积分累计；host 端 Fre/Nje/Ore 组装），
      即官方用量页"近7天"口径，主数字直接显示。
    - start-plan：`getEntitlementSnapshot({preferredProviderId, accountAccess:
      {type:'zhipu-account', family: accountType, planKind:'start-plan'}, includeSubscription:
      true, ...})` → `quota.limits[]`（billing/balance 余额桶归一化：`usage`=已用、
      `number`=总量、`remaining`=剩余、`periodEnd`=周期止）；billing/balance 无 7d
      口径，主数字显示 Σusage（套餐周期累计已用），面板/悬停见总量/剩余/周期。
  - **每轮消耗（+N）**：API 无请求级积分，采用轮完成锚定的累计差值——检测到
    `rounds` 末轮 eventKey 变化**且轮数增长**（新一轮完成；会话截断致轮数缩短时
    key 变化不触发归属）且已有累计基线时置 pending；pending 期间前 8 次 15s
    加急轮询（约 2 分钟，之后回落 60s 常规节奏，仍可被常规取数 resolve），
    服务端累计上涨后 `差值=最近一轮消耗`（覆盖两次取数间完成的所有轮次），
    `+N` 显示在面板"最近一轮积分"行，注明结算时刻或"结算中"。首次出现的
    轮次只记录不归属（避免把历史账算进来）；累计回落（start-plan 周期重置）
    时重锚基线、pending 保留等下一轮上涨。
  - 刷新频次 60 秒（pending 时前 8 次 15 秒加急，挂在 1 秒 tps tick 内做节流），
    失败保留上次数值并在悬停 tooltip 标注错误原因；剩余 ≤ 10% 红 / ≤ 20% 橙黄；
    悬停注明服务端用量统计有分钟级延迟。
- **服务调用超时防护**：readSessionDebug 与积分取数包 30s 超时兜底（`raceTimeout`）——
  接口挂死（主进程忙、睡眠恢复等）时 await 永不返回，会冻结 1s tick 链或使 credBusy
  永久卡死积分停摆；超时后链复活下一轮重试，挂死期间 tps 显示冻结值但不丢轮询能力。
  超时计时器走 `globalThis.setTimeout`（脱离测试注入作用域，测试用
  `__zcodeTpsRaceMs` 调小毫秒数验证），返回值 unref 兼容浏览器数字返回值。
- **统计展示面演化（11-25 两次拍板）**：先"外面这层不要了"删掉整张悬停卡片（含主题探针/
  canvas 亮度检测），全部统计并入弹层面板（badge-panel.src.js，原生 tailwind 类跟随主题）；
  随后"最近一轮/会话平均/趋势条移到外面"——悬停迷你卡回归，但只放 TPS 四件事
  （大数字/最近一轮或生成中等待/会话平均/趋势条），且配色全走语义 CSS 变量
  （var(--color-background/foreground/border/success/warning/error) 带兜底色），
  命令式 DOM 拿不到组件级主题也不用再探测明暗；面板删除这三行，账本拉取触发
  保留在"面板挂载+每秒强刷"；点击复制保留，提示为轻量 toast（1.4s 自毁）。
- **空闲自适应降频**：sig=轮数+末轮 key+网络末态+token 合计+缓存读，连续不变 4 轮后
  tick 间隔 1s→2s、8 轮后→5s（挂机时省空转 IPC）；任何数据变化 sig 归零即回 1s，
  生成中恒 1s（闪电脉动与网络状态要实时）。tickBusy 防重入。
- **会话切换即时唤醒**：qzt-stash 写入新 ctx 后调 `__zcodeTpsWake`——重置降频、清当前
  timer 立即跑一轮（否则降频后切会话最多滞后 5s 才清零旧数据）；按 sid 去重
  （qzt 组件每次 render 都调，同会话重复唤醒会抵消降频收益）。
-
  - **迷你趋势**：面板渲染最近 12 个可信轮速率条形（旧→新，4~14px 高按速率映射，最新一条全亮、历史 45% 透明），分色同徽标；存逗号串（数组每次重建引用不同，串比较才能保持 setV same 判定）。
  - **生成中计时**：末条 started 的 recordedAt 距今，面板"最近一轮"行与 data-info 显示"已等待 Ns"每秒跳动（1s tick 驱动，waitMs 入 v 状态）。
  - **积分日均**：编码套餐 extra.daily=averageDailyCredits，面板积分行内"（日均 N）"。
- **点击复制会话统计**：点击徽标（capture 阶段 stopPropagation，防冒泡误开所在弹层）把模型/最近一轮/会话平均/token 细分/积分写入剪贴板（navigator.clipboard），轻量 toast（徽标上方居中，1.4s 自毁）；统计文本由组件体 buildStats 构造（globalThis 暴露，点击时取最新渲染数据）。
- **上下文去向**：全部 API 精确值（readSessionDebug rounds.inputTokens）——固定开销=首轮输入
  （系统提示+技能+工具定义+MCP schema+首条消息；环形缓冲挤出后拿不到真实首轮，fxCache 只在
  缓冲<200 时记录一次，切会话重置）；每轮 Δinput=相邻 inputTokens 差（该窗口新增，大增量多为
  大工具结果），Top3 以 "requestIndex:增量" 逗号串入 state（串比较保 same 判定），面板一行
  （固定开销+最大增量+水位），data-info 附定位法（临时关掉某 MCP/技能对比固定开销变化）。
  按 skill/MCP/tool 的拆分见下条"官方来源构成"（ZCode 4.0 起有官方数据源）。
- **Token 分类（移植 zcode-context 记账）**：打开弹层时 30s 节流调 readSessionMessages
  （{info,parts} 数组，direction backward 失败回退默认；近 120 消息）——step-finish 部件的
  tokens.input 是相邻请求的精确水位，差值=窗口新增（实测）；窗口内条目（工具结果按 tool 名、
  用户消息按 kind）按字符占比折算 token（≈估算，zcode-context 同款兜底）；首个 step 水位=
  "系统+工具定义"（精确）；助手输出按响应 tokens.output 精确单列。面板显示 Top3 分类行，
  data-info/复制统计带 Top8+助手输出；分类键可含冒号（Tool:Bash），序列化按最后一个冒号切键值。
  与 zcode-context 的差异：它离线读 db.sqlite 可看全史+30 天统计；徽标走 IPC 只看近 120 消息，
  但零依赖单插件。setA 第三 state 槽，逗号串保 same 判定。
- **官方来源构成（ZCode 4.0 数据源）**：`readSession({..., messageLimit: 1})` 响应的
  `runtime.contextUsage.breakdown`（host `contextUsageFromRuntime` 透传）是 agent 自身生成的
  上下文构成快照，按 7 类上报字符数：messages / system_prompt / meta_user_context / skills /
  tool_prompt / system_tool_schemas / mcp_tool_schemas（agent 打包器 bmc 白名单；app/deferred
  tool schema 归入 system 桶）。官方弹层的分段条就是它：percent = 该类 chars / chars 总和
  （kan()），<0.78% 的桶隐藏——徽标沿用同口径，只补字符数与 Top4 列表。同源重复上报先求和
  （kan() 同款）。字符口径报数不换算 token（换算即引入估算）；构成缺失（旧版/空会话/未跑过
  模型）时静默保留折算视图。存 `__zcodeTpsDataO`（{bd, used, size}，bd 为 source:chars 降序
  逗号串），面板"来源构成"+复制统计+data-info 三处展示；切会话清空 A/O 两个账本。
  内部曾有更细的 turn admission composition（11 类 tokens + items 逐项名，agent 侧 tM），
  但只走 controller 协议（`conversationContextComposition`），渲染器无 channel 可达。
- **弹层集成（会话统计进原生弹层）**：新增第 6 补丁 popover-panel——在上下文容量弹层的缓存命中率
  行与配额区之间注入 zcodeTpsPanel（var 链与徽标同模块）；数据来自 globalThis 镜像
  （__zcodeTpsDataV/A/O/C，徽标 tick/pullCtx/fetchCred 每次 setState 时同步写入），面板 1s 强刷
  读取并顺带节流拉账本（原卡片悬停触发点随卡片删除迁移到面板），不重复轮询；样式用弹层同款 tailwind 类（text-foreground-subtle/font-mono/border-border）
  视觉原生融合。重定位启发式：cacheHitRate formatMessage 用法后 400 字符内的
  children:<值>})]}):null,<y>&&<x>?(0,$.jsx)(<配额组件>,{autoCelebrateArm 模式。
  smoke 徽标提取 END 标记改为 ),zcodeTpsPanel=(（旧 ),Drn= 会把面板吸进徽标）。
- 轮询失败静默保持现状；卸载时清理定时器。逻辑由 `badge-smoke-test.mjs` 38 场景覆盖
  （11-15 积分链路基础 / 17 生成中脉动 / 18 每轮消耗归属 / 19 加急上限 /
  20 回落重锚 / 25 readSessionDebug 挂死链复活 / 26 积分挂死 credBusy 释放 /
  27 弹层面板全量渲染 / 28 空闲降频节奏 / 29 wake 即时唤醒与轮耗时 / 30 3.19.1 字段名修复 / 38 官方来源构成）。
- **最近一轮生成时长**：可信轮的 generationDurationMs 进状态（v.dur），面板"最近一轮"行
  "85.5 t/s（12.3s）"、data-info "（12.3s 生成）"，>=1s 才显示。

## 工程方法（防白屏门禁）

徽标**不手写内联 JS**：样式/口径改在可读源码 `patches/badge-arrow.src.js` 里完成，
`build-badge-patch.mjs` 用 acorn 做**单体解析 + 全文六补丁 module 严格解析**双重验证后才
写回配置；`patch-renderer.mjs` 再次执行 module 门禁（`vm.SourceTextModule`），解析失败
拒绝产出 asar。背景：渲染器以 `<script type=module>` 加载，`node --check` 对该文件是
假阴性（CJS/ESM 检测差异），曾因此产出语法坏点导致白屏——门禁即为此而设。

## asar 重打包

- 布局：`[4B=4][4B=headerPickleLen][4B=payloadSize][4B=jsonLen][json][对齐pad][负载]`，
  负载内文件按 header 中的字符串偏移连续存放。
- 替换文件写到负载**尾部**（新 offset），其余文件字节与偏移原样保留 → 无需全量搬移，
  header 只改目标文件的 offset/size/integrity（SHA256 全量 + 4MB 分块）。
  代价：旧 styles 副本留在负载内成为死数据，**每轮增量重打 asar 增大约一个 styles chunk
  （3.18.x 约 7MB）**；安全换取体积，多轮版本适配后如需回收可从 bak-tps 全量重打。
- 产物校验：文件数一致、styles 字节与补丁产物一致、抽样 3 个其他文件字节一致。

## 安全与回滚

- 补丁前自动语法检查（`node --check` + module 严格解析双门禁），锚点必须唯一命中否则中止。
- apply-patch.ps1 首次换入前复制原 asar 为 `app.asar.bak-tps`（永久保留），restore.ps1 一键还原。
- 幂等：已含 `zcodeTpsBadge` 标记的 asar 不再跳过，而是以 outDir 同名
  `original-styles-*.js` 底稿增量重打（同版本可重复交付徽标更新；底稿锚点失配
  说明 ZCode 已升级，需先跑 relocate-anchors）。
