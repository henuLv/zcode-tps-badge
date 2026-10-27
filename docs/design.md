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
  `{ usage, generationDurationMs, tokensPerSecond, recordedAt }`（rounds，保留最近 32 条），
  并记录网络事件 `networkEntries`（含 `model_request_started/completed` 状态）。
- 渲染器访问：`zcodeAgentService.readSessionDebug({workspacePath, workspaceIdentity, sessionId})`
  返回 `{ rounds, networkEntries, cache }`；官方"开发者工具"面板（tokenDebug）即以此每秒轮询。

## 六个补丁点（见 patches/renderer-patches.json）

1. `services-stash`：`Fl`(useServices) 命中时把 services 挂到 `globalThis.__zcodeTpsSvc`，
   让徽标能跨模块拿到 `zcodeAgentService`。
2. `qzt-sig`：工具栏 `QZt` 增收 `sessionId` prop（调用处本来就传，原被忽略）。
3. `qzt-stash`：`QZt` 渲染时把 `{workspacePath, workspaceIdentity, sessionId}` 写入
   `globalThis.__zcodeTpsCtx`。
4. `badge-def`：在圆圈图标 `kJt` 与触发器 `AJt` 之间的 var 声明列表注入 `zcodeTpsBadge`
   组件（同模块作用域，直接复用 `$`/`Q`），同时定义 `__zcodeTpsSet`。
5. `mxt-open` / `mxt-tail`：把圆圈按钮所在 span 的 children 从单元素改为
   `Fragment[按钮, 徽标]`，徽标即"圆圈右侧"。

## 徽标显示策略

每 1 秒轮询 readSessionDebug（与开发者工具同频）：

- 最近一轮 `tokensPerSecond` 有效，且（轮完成时间在 6 秒内 **或** 存在进行中的
  `model_request_started`）→ 显示 `N t/s`（≥100 取整，否则 1 位小数）。
- 否则隐藏（React 渲染 null，不占布局空间）。
- 轮询失败静默保持现状；卸载时清理定时器。逻辑由 `badge-smoke-test.mjs` 六场景覆盖。

## asar 重打包

- 布局：`[4B=4][4B=headerPickleLen][4B=payloadSize][4B=jsonLen][json][对齐pad][负载]`，
  负载内文件按 header 中的字符串偏移连续存放。
- 替换文件写到负载**尾部**（新 offset），其余文件字节与偏移原样保留 → 无需全量搬移，
  header 只改目标文件的 offset/size/integrity（SHA256 全量 + 4MB 分块）。
- 产物校验：文件数一致、styles 字节与补丁产物一致、抽样 3 个其他文件字节一致。

## 安全与回滚

- 补丁前自动语法检查（`node --check`），锚点必须唯一命中否则中止。
- apply-patch.ps1 首次换入前复制原 asar 为 `app.asar.bak-tps`（永久保留），restore.ps1 一键还原。
- 幂等：已含 `zcodeTpsBadge` 标记的 asar 会被补丁器识别并跳过。
