# 刘看山打工日记

知乎黑客松 2026「跨次元游乐场」参赛原型：玩家以刘看山身份在仿桌面微信中完成 20 天实习。八个关键事件、三项固定评价、一个限时 2D 送件小游戏与三个结局都能离线运行；AI 对话和知乎来源仅做增强，不会阻塞主线。

## 已实现

- Godot 4.4 Web 项目：公司群聊、林总私聊、阿麦私聊、任务与档案五个入口。
- 随包嵌入 Noto Sans SC 可变字体（SIL OFL 1.1），保证 Web 版中文显示正常。
- 8 个完整事件、每事件 3 个可控分支、3 次 NPC 自由追问上限、本地存档、转正／跳级升职／结束实习三结局。
- 第 13 天「紧急送件」：60 秒 2D 躲避与路线小游戏，结果计入职业评价。
- Vercel TypeScript API：事件读取、行动校验、NPC 对话、已验证知乎来源缓存、赛事专用「知乎知识」读取、可选 OAuth 授权。
- 无凭证降级：NPC 使用作者预写角色回复；知乎来源为空时明确不展示虚构作者、标题或链接。

## 本地试玩

1. 解压或安装 Godot 4.4.1，打开 [`project.godot`](project.godot)。
2. 运行主场景 [`scenes/Main.tscn`](scenes/Main.tscn)。桌面端用 A/D 或方向键操作第 13 天送件任务。
3. 游戏存档保存在 Godot 的 `user://` 目录；点击“重新实习”即可清除。

## 导出与部署

1. 已生成的网页包位于 `public/game/`，可直接部署。改动 Godot 内容后，使用本仓库 `work/godot_templates/` 下按需提取的 Web 模板重新导出：

   ```powershell
   Godot_v4.4.1-stable_win64_console.exe --headless --path . --export-release Web public/game/index.html
   ```

2. 安装 Vercel 依赖并执行检查：

   ```powershell
   npm install --cache .npm-cache
   npm run typecheck
   npx vercel --prod
   ```

   Vercel 会自动托管 `public/` 下的入口与 Godot 包，并部署 `api/` 下的同域函数。

3. 在 Vercel 项目设置中按 [`.env.example`](.env.example) 填入需要的环境变量。绝不要把 `LLM_API_KEY`、`ZHIHU_ACCESS_SECRET` 或 `ZHIHU_OAUTH_APP_KEY` 放进 Godot 导出包、前端代码、截图或仓库。

## 知乎内容与 OAuth

- `api/_lib/events.ts` 中的 `curatedInsights` 故意为空。拿到 Access Secret 后，用官方 Zhihu CLI 搜索每个事件的关键词，人工确认标题、作者、摘要和链接，再写入这个缓存。这样弱网、配额耗尽时仍能展示已核对来源。
- 赛事专用「知乎知识」接口可以在后续版本接入为下班后的知识充电卡；不得把其正文改写为本项目原创内容。
- OAuth 回调仅按赛事文档交换 Token，随后立即丢弃；不会将 Token 存入 Cookie、URL、响应或日志。当前官方参考未给出用户基本资料接口，因此界面只确认授权完成，不伪造昵称或头像。

## 验证状态

- `npm run typecheck`：TypeScript API 已通过。
- Godot 4.4.1 headless 脚本加载：已通过。
- Web 导出需要本机 Godot Web Export Templates；导出后再用无痕窗口验证三条结局和线上 API 降级。
