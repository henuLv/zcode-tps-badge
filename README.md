# zcode-tps-badge

在 ZCode 聊天输入工具栏的**上下文容量圆圈**旁显示模型输出速度（tokens/s）。

![示意] 生成回复时，圆圈右侧出现 `87.3 t/s` 小徽标；空闲约 6 秒后自动隐藏，不打扰界面。

## 重要说明（必读）

**ZCode 官方插件 API（skills/commands/hooks/MCP/agents）没有工具栏 UI 注入点**，无法直接在
上下文圆圈旁渲染任何内容。本插件通过**给渲染器 bundle 打补丁**实现显示效果：

- 数据源与官方"开发者工具"面板同一条链路（`zcodeAgentService.readSessionDebug()`，
  每 1 秒轮询最近一轮请求的 `tokensPerSecond` = 输出 tokens ÷ 生成时长）。
- 补丁只改一个文件：`resources/app.asar` 内的 `out/renderer/assets/styles-*.js`。
- 已确认本机 ZCode 的 Electron fuse `EnableEmbeddedAsarIntegrityValidation` 为关闭，
  补丁 asar 不会被拒绝加载。

## 使用步骤

```powershell
# 1. 生成补丁 asar（输出到 logs/build/app.asar.patched，可重复运行，幂等）
node scripts/patch-renderer.mjs --asar "C:/Program Files/ZCode/resources/app.asar" --out-dir logs/build

# 2. 关闭 ZCode，然后换入（自动先备份为 app.asar.bak-tps）
powershell -File scripts/apply-patch.ps1 -PatchedPath logs/build/app.asar.patched

# 3. 重新打开 ZCode，生成回复即可看到 tps 徽标
```

回滚：

```powershell
powershell -File scripts/restore.ps1   # 关闭 ZCode 后运行，用备份还原
```

## 自愈（可选，默认关闭）

ZCode 升级会覆盖 app.asar 使补丁失效。如需自动重打补丁：

1. 把 `hooks/hooks.optin.json` 覆盖为 `hooks/hooks.json`；
2. 在插件根目录放一个空文件 `.selfheal-enabled`；
3. 注意其中的 node.exe 路径按本机实际情况修改。

注意：若插件已通过 marketplace 安装，ZCode 实际加载的是缓存副本
`C:\Users\24475\.zcode\cli\plugins\cache\local-tps\zcode-tps-badge\0.1.0\`，
上述修改应对该副本进行（或改完后执行 `zcode plugins update zcode-tps-badge@local-tps` 同步）。

启用后，每次会话开始时自愈脚本检查补丁标记（未启用时该 hook 直接退出，不产生开销）；
发现补丁丢失则后台重打补丁，等 ZCode 下次退出时自动换入。冷却间隔 1 小时。

## 安装为插件（可选）

本插件的实际功能不依赖插件安装（补丁脚本独立工作）。安装到 ZCode 只是让它在
设置界面可见、并可选启用自愈 hook：Settings → Plugin Management → Discover → 添加
本地目录指向本插件根目录。

## 已知限制

- ZCode 版本更新后锚点文本可能变化，补丁器会明确报错而不是盲目修改。
- tps 口径与官方开发者工具一致：按"每轮请求完成后"更新，流式过程中的瞬间速度不体现。
- 徽标位置在圆圈按钮右侧，跟随工具栏主题色，样式为内联 style 不依赖 Tailwind 类名。

## 文件结构

| 路径 | 用途 |
| --- | --- |
| `scripts/patch-renderer.mjs` | 补丁器：定位 chunk、校验锚点、注入、重打包、回读验证 |
| `scripts/asar-lib.mjs` | asar 读取/重打包最小实现 |
| `scripts/badge-smoke-test.mjs` | 徽标组件逻辑冒烟测试（mock React，6 场景） |
| `scripts/apply-patch.ps1` | 等 ZCode 退出后备份并原子换入 |
| `scripts/restore.ps1` | 从备份还原 |
| `scripts/selfheal.cjs` | 可选自愈 hook 入口 |
| `patches/renderer-patches.json` | 6 个补丁锚点与替换文本（唯一需要随版本维护的文件） |
| `docs/design.md` | 实现原理与数据链路 |
