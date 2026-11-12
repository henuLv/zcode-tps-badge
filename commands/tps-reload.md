---
description: ZCode 升级覆盖 app.asar 后，重新适配 TPS 徽标渲染器补丁（一键重定位→验证→守望者换入）
argument-hint: "[可选: 新版本号或异常现象描述]"
---

用户报告 ZCode 升级后 TPS 徽标失效。插件仓库：`C:/Users/24475/Desktop/zcode-default/zcode-tps-badge`（下称 REPO）。

## 一键流程（正常情况 5 分钟内）

1. **取版本号**：`powershell -Command '(Get-Item "C:\Program Files\ZCode\ZCode.exe").VersionInfo.ProductVersion'`
2. **跑一键编排**（REPO 根目录）：
   `"/c/Program Files/nodejs/node.exe" --experimental-vm-modules scripts/tps-reload.mjs <版本号>`

   编排内部依次执行，任一步失败立即中止并报错：
   - `relocate-anchors.mjs`：从官方 asar 提取新 styles chunk → 探测 5 锚点 → 结构启发式自动重定位 → 同步三处（renderer-patches.json / build-badge-patch.mjs / badge-smoke-test.mjs）。asar 已含补丁时直接成功退出。**services-stash 锚失效或任何启发式不唯一命中都会报错退出——此时才转手动**（按报错信息 + 本文件末尾"启发式定义"人工分析）
   - `build-badge-patch.mjs`：生成 badge-def replacement + module 严格解析门禁（绝不允许绕过或硬凑闭合影序列）
   - `patch-renderer.mjs`：打补丁 + 重打包 + 抽样一致
   - `badge-smoke-test.mjs`：10 场景全过
   - `register-watcher.ps1`：备份官方 asar + 任务计划程序挂守望者（RunLevel Highest）+ 心跳验证（wrapper started / probe OK / invoke 三行齐备）
   - `sync-plugin-cache.mjs`：把 repo 新版 commands/scripts/patches 同步进 ZCode 插件缓存与 marketplace 副本（缓存按 version 目录缓存、版本号不升级不刷新，不同步则下个会话本命令仍是旧文本）
3. **告知用户**：完全退出 ZCode → 等 5 秒 → 重开（30 分钟时限内）；`.tmp/apply-<版本>.log` 出现 `PATCHED_OK` 即成功；徽标行为不变（圆环左侧 ⚡ t/s，悬停显示会话平均）。
4. **收尾**：git commit+push（message 写"适配 ZCode <版本>"，不升 plugin.json 版本）；更新记忆 `zcode-internals-ui-patch.md` 的锚点表（新混淆名）。若未走一键编排而是手动分步执行的，收尾必须补跑 `sync-plugin-cache.mjs`。

## 环境硬约束（踩坑定型，勿省略）

- node 必须用 `/c/Program Files/nodejs/node.exe`（anaconda 旧 node 不认 `--experimental-vm-modules`）
- **所有 .ps1 一律 ASCII-only 注释**：PS5.1 把无 BOM 的 .ps1 按 ANSI/GBK 读，UTF-8 中文注释可吞换行把下一行代码粘进注释（同文件时而好时而坏）；写完用 `[scriptblock]::Create((Get-Content -Raw <f>))` 验证
- **守望者必须任务计划程序 + `-RunLevel Highest`**：Start-Process/WMI 的进程要么被 ZCode 退出连坐要么无日志硬死；降权令牌写不了 Program Files
- 渲染器是 `<script type=module>`，一切以 module 严格解析 + acorn 为准（`node --check` 假阴性）
- 混淆名可含 `$`（如 `$5t`）：正则用 `[\w$]+`，replace 替换串防 `$N` 组引用（用 split/join）
- 复杂 node 分析写 REPO `.tmp/*.mjs` 再跑，禁止内联 `-e`（转义错位）

## 启发式定义（手动重定位时用，与 relocate-anchors.mjs 一致）

- **services-stash**：`useServices 必须在 ServiceProvider 内使用`（历版存活；它失效=结构大改，必须人工）
- **qzt-stash**：`function \w+\(\{...workspaceIdentity...` 且 900 字符内含 `openCodingPlanUpgrade`/`locale:`/`sessionId` 的唯一命中；体首形态 `{let{intl:X,locale:Y}=q(),{openCodingPlanUpgrade:Z}=W(),v=s??\`glm\`,`；签名解构名(workspacePath/workspaceIdentity/sessionId)动态提取进 stash 调用
- **badge-def**：唯一 `transform:\`rotate(-90deg)\`` 后第一个 `},触发器=({children:e,loading:t=!1,`
- **mxt-open**：`children:(0,$.jsx)(\`span\`,{className:\`inline-flex shrink-0\`,children:(0,$.jsx)(触发器,{"aria-label":X,` 且 300 字符内含 `data-chat-toolbar-popover-trigger`，唯一
- **mxt-tail**：mxt-open 后 3000 字符内唯一 `&&(X||Y(!0))}})})}),(0,$.jsx)(弹层,{`；**闭合硬约束**：`}})})}),` → `}})]})})}),`
- 同步三处：json 各锚点/replacement、builder 两处触发器模板、smoke 的 END 标记

用户输入 $ARGUMENTS 若包含版本号或异常描述，结合到第 1 步与最终汇报里。
