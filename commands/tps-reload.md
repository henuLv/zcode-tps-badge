---
description: ZCode 升级覆盖 app.asar 后，重新适配 TPS 徽标渲染器补丁（重定位锚点→验证→重打包→守望者换入）
argument-hint: "[可选: 新版本号或异常现象描述]"
---

用户报告 ZCode 升级后 TPS 徽标失效。执行以下 SOP 完成重新适配。插件仓库：`C:/Users/24475/Desktop/zcode-default/zcode-tps-badge`（下称 REPO）。

## 环境硬约束

- node 必须用 `/c/Program Files/nodejs/node.exe`（PATH 里 anaconda 的旧 node 不认 `--experimental-vm-modules`）
- acorn 已收编进 REPO `vendor/acorn.js`，builder 默认自动找到，无需 ACORN_DIR
- 复杂 node 分析脚本一律写成 REPO `.tmp/*.mjs` 文件再执行，禁止内联长 `-e` 代码（转义会错位）
- 渲染器是 `<script type=module>`，`node --check` 是假阴性，一切以 module 严格解析 + acorn 为准

## 流程

1. **确认现状**：`powershell -Command '(Get-Item "C:\Program Files\ZCode\ZCode.exe").VersionInfo.ProductVersion'` + `stat` 官方 asar（`C:/Program Files/ZCode/resources/app.asar`）大小/mtime。若 asar 里已含补丁（marker `zcodeTpsBadge`）则直接告知无需处理，结束。
2. **提取新 chunk**：用 REPO `scripts/asar-lib.mjs`（openAsar/walkFiles/findEntry/readEntryBytes）把 `/out/renderer/assets/styles-*.js`（>3MB，名字带新内容哈希）写到 REPO `logs/build/`。
3. **探测 5 个锚点**（对照 `patches/renderer-patches.json`）：`services-stash`（`useServices 必须在 ServiceProvider 内使用`）历来跨版本存活；其余 4 个若命中数≠1 则进入第 4 步重定位。
4. **重定位锚点**（结构启发式，混淆名每版必变）：
   - 工具栏组件：正则 `function \w+\(\{[^{}]{0,200}workspaceIdentity[^{}]{0,300}`，取 900 字符内同时含 `openCodingPlanUpgrade`/`locale:`/`sessionId` 的唯一命中；记录其签名解构名（workspacePath=e, workspaceIdentity=t, sessionId=o）与体首文本（`{let{intl:E,locale:D}=q(),{openCodingPlanUpgrade:O}=XX(),k=s??\`glm\`,` 形态，辅助函数名会变）
   - 圆圈 SVG：唯一命中 `transform:\`rotate(-90deg)\``，其后紧跟 `},触发器名=({children:e,loading:t=!1,` ——此即 badge-def 注入点
   - mxt-open：搜 `children:(0,$.jsx)(\`span\`,{className:\`inline-flex shrink-0\`,children:(0,$.jsx)(触发器名,{` 且 300 字符内含 `data-chat-toolbar-popover-trigger`，必须唯一
   - mxt-tail：搜 `&&(s||g(!0))}}` 后接 `}),(0,$.jsx)(弹层名,{` 的唯一命中；**闭合影序列硬约束**：原文 `}})})}),` 补丁后必须为 `}})]})})}),`（10 符号，多出的 `]})` 对应 Fragment 数组闭合），差异超出此结构立即停下报告用户，禁止硬凑
   - 同步修改三处：`renderer-patches.json` 各锚点、`scripts/build-badge-patch.mjs` 模板里的触发器名、`scripts/badge-smoke-test.mjs` 的 END 标记（`),触发器名=({children:e,loading:t=!1,`）
5. **构建+验证**（REPO 根目录跑，产物进 `logs/build`，out-dir 用相对路径 `logs/build` 勿加 `..`）：
   - builder：`node --experimental-vm-modules scripts/build-badge-patch.mjs logs/build/original-styles-*.js`（必须传 original 文件——`styles-*.js` 会被 patch-renderer 覆盖为补丁版）
   - `node --experimental-vm-modules scripts/patch-renderer.mjs --asar "C:/Program Files/ZCode/resources/app.asar" --out-dir logs/build`
   - `node --experimental-vm-modules scripts/badge-smoke-test.mjs`（8 场景必须全过）
   - 任何一步失败：修复后重跑；若 module 门禁拒绝，绝不允许绕过或手改闭合影序列硬凑——按 acorn 报错 pos 定位（builder 已内置失败时打印上下文）
6. **备份+换入**：`Copy-Item` 官方 asar 覆盖备份 `app.asar.bak-tps`；杀旧守望者（过滤 CommandLine 含 `apply-patch.ps1`/`watcher-wrapper` 且排除自身）；挂守望者用**任务计划程序**（3.18.0.10300 适配三次翻车后定型）。**三个已踩实的坑**：
   - 坑 A：`Start-Process`/Bash 后台挂的守望者仍是 ZCode 进程树后代，用户退出 ZCode 时被连坐杀掉 → 必须系统级分离（任务计划程序，父进程 svchost）
   - 坑 B：**PS5.1 把无 BOM 的 .ps1 按 ANSI/GBK 读，UTF-8 中文注释的尾字节可能吞掉换行符导致解析随机错位**（同文件时而好时而坏）→ 写 `.ps1` 一律 ASCII-only 注释，写完先 `[scriptblock]::Create((Get-Content -Raw <file>))` 验证解析；反引号续行在 LF-only 行尾下也会断参（`-PatchedPath` 变 null）
   - 坑 C：任务计划默认 RunLevel Limited，降权令牌写不了 Program Files（Copy-Item 全部 RETRY 耗尽）→ 必须 `-RunLevel Highest` 注册
   - 挂载流程：写 ASCII 单行调用的 wrapper（含心跳 `Add-Content` 日志 + Program Files 写权限探针 + try/catch 遗言）→ `Register-ScheduledTask -TaskName tps-watcher -Once -At (now+5s) -RunLevel Highest -Settings (ExecutionTimeLimit 30min) -Force` → 10 秒后查日志须出现 `wrapper started` + `probe: Program Files write OK` + `invoke apply-patch.ps1` 三行，且进程父进程为 svchost → 才算在位。任务 30 分钟执行时限，超时需重挂
   - 提醒用户：完全退出 ZCode 后**等约 5 秒**再重开（apply-patch 轮询 800ms，过快重启可能错过全退窗口）
7. **收尾**：git add 三处改动文件并 commit+push（message 写"适配 ZCode <版本>"；不要 vX 迭代号、不升 plugin.json 版本）；更新记忆文件 `zcode-internals-ui-patch.md` 的当前版本锚点表。
8. **汇报**：告诉用户完全退出 ZCode 再重开（守望者自动换入，`.tmp/apply-*.log` 出现 `PATCHED_OK` 即成功）；徽标行为不变（圆环左侧 ⚡ t/s，悬停显示会话平均）。

用户输入 $ARGUMENTS 若包含版本号或异常描述，结合到第 1 步与最终汇报里。
