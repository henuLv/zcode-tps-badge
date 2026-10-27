# zcode-tps-badge

在 ZCode 聊天输入工具栏的**上下文容量圆圈左侧**常驻显示模型输出速度（tokens/s）。

```text
⚡ 121.8 t/s    ◯ GLM-5.3-Flash 最高 ▾
└─ 本插件徽标 ─┘└─ 上下文圆圈（原生）─┘
```

- **绝对常驻**：无对话数据时显示灰色 `0.0`；有数据后数字按速率分级变色：**< 40 红 / 40-80 橙黄 / ≥ 80 绿**。闪电图标与 `t/s` 恒为灰色。
- **真实口径**：只统计"长回复"轮次（生成时长 ≥ 200ms 且 < 6 分钟、输出 ≥ 50 token、速率 < 500 t/s），取最近一个可信轮次——标题生成等毫秒级请求不会算出几万 t/s 的虚高值。

## 重要说明（必读）

**ZCode 官方插件 API（skills/commands/hooks/MCP/agents）没有工具栏 UI 注入点**，无法直接在
上下文圆圈旁渲染任何内容。本插件通过**给渲染器 bundle 打补丁**实现显示效果：

- 数据源与官方"开发者工具"面板同一条链路（`zcodeAgentService.readSessionDebug()`，
  每 1 秒轮询最近一轮请求的 `tokensPerSecond` = 输出 tokens ÷ 生成时长）。
- 补丁只改一个文件：`resources/app.asar` 内的 `out/renderer/assets/styles-*.js`。
- 要求本机 ZCode 的 Electron fuse `EnableEmbeddedAsarIntegrityValidation` 为关闭
  （ZCode 当前版本默认关闭；可用本仓库 `scripts/` 外任意 fuse 解析工具自行确认）。
- tps 为**每轮平均值**（输出 tokens ÷ 该轮生成时长），非流式瞬时值——瞬时值需要订阅
  渲染器内部状态按字符增量估算，脆弱且数值抖动，本插件不做。

## 使用步骤

前置：Node.js ≥ 18（系统 PATH 可用）。

```powershell
# 1. 生成补丁 asar（--experimental-vm-modules 必须带：module 严格解析是防白屏门禁）
node --experimental-vm-modules scripts/patch-renderer.mjs --asar "C:/Program Files/ZCode/resources/app.asar" --out-dir logs/build

# 2. 完全退出 ZCode，然后换入（自动先备份为 app.asar.bak-tps）
powershell -File scripts/apply-patch.ps1 -PatchedPath logs/build/app.asar.patched

# 3. 重新打开 ZCode，圆圈左侧即出现常驻徽标
```

输出目录出现 `READY` 文件代表补丁产物校验通过。`apply-patch.ps1` 若输出 `ZCODE_RUNNING`
表示 ZCode 仍在运行（未完全退出），处理后重跑即可。

回滚：

```powershell
powershell -File scripts/restore.ps1   # 关闭 ZCode 后运行，用备份还原官方版本
```

## 改徽标样式后重新构建

徽标样式/逻辑独立在 `patches/badge-arrow.src.js`（可读源码），改完执行：

```powershell
# 重新生成补丁配置（acorn 单体+全文双解析验证），再按"使用步骤"重打换入
$env:ACORN_DIR="<含 node_modules/acorn 的目录>"; node --experimental-vm-modules scripts/build-badge-patch.mjs <original-styles.js>
```

`<original-styles.js>` 为未打补丁的 styles chunk（首次可从任一 asar 提取，之后复用；
本仓库不附带 ZCode 的代码文件）。逻辑变更建议跑 `scripts/badge-smoke-test.mjs`。

## ZCode 升级后

升级会覆盖 app.asar 使补丁失效（徽标消失）。重新执行"使用步骤"即可；锚点文本若因版本
变化不再唯一命中，补丁器会明确报错而不是盲目修改，届时按报错适配 `patches/renderer-patches.json`。

## 安装为插件（可选）

补丁功能不依赖插件安装（脚本独立工作）。安装到 ZCode 只是在设置界面可见、并可选启用
自愈 hook：Settings → Plugin Management → Discover → `+` 添加本地目录指向本仓库根目录
（自带 `marketplace.json`），或 `zcode plugins marketplace add <本仓库路径>` 后安装
`zcode-tps-badge@local-tps`。

## 自愈（可选，默认关闭）

自动重打补丁：把 `hooks/hooks.optin.json` 覆盖为 `hooks/hooks.json`（注意其中 node.exe
路径按本机修改），并在插件根目录放置空文件 `.selfheal-enabled`。启用后每次会话开始检查
补丁标记，发现丢失则后台重打，等 ZCode 下次退出时自动换入（冷却 1 小时）。

## 已知限制

- ZCode 版本更新后补丁锚点可能漂移（见上节）。
- tps 按轮完成后更新，流式生成过程中数字不实时跳动。
- 徽标位置在圆圈左侧、样式为内联 style，不依赖 Tailwind 类名。

## 文件结构

| 路径 | 用途 |
| --- | --- |
| `patches/badge-arrow.src.js` | 徽标组件可读源码（样式/口径/分级色都在这改） |
| `patches/renderer-patches.json` | 6 个补丁锚点与替换文本（唯一需要随版本维护的文件） |
| `scripts/build-badge-patch.mjs` | 徽标源码 → 补丁配置的构建器（acorn 单体+全文双验证） |
| `scripts/patch-renderer.mjs` | 补丁器：定位 chunk、校验锚点、注入、重打包、回读验证 |
| `scripts/asar-lib.mjs` | asar 读取/重打包最小实现 |
| `scripts/badge-smoke-test.mjs` | 徽标逻辑冒烟测试（mock React，7 场景） |
| `scripts/apply-patch.ps1` | 等 ZCode 退出后备份并原子换入 |
| `scripts/restore.ps1` | 从备份还原 |
| `scripts/selfheal.cjs` | 可选自愈 hook 入口（默认关闭） |
| `docs/design.md` | 实现原理与数据链路 |
