# 《刘看山打工日记》智能体开发交接文档

> 最后核对日期：2026-09-12  
> 项目绝对路径：`C:\Users\hp\Desktop\LKS2.0\liukanshan-intern-diary`  
> 当前目标：知乎黑客松 2026「跨次元游乐场」网页游戏 Demo  
> 注意：根目录 `README.md` 仍描述旧版“20 天 / 8 事件 / 全部三选一”，已经过时。当前事实以本文件、`scripts/event_data.gd` 和 `api/_lib/events.ts` 为准。

---

## 1. 产品目标与不可破坏的体验原则

玩家扮演刚进入“看山创意部”的刘看山，在仿电脑版微信的界面里经历三个月实习。前三个事件用于稳定建立人物关系和基础玩法；后续事件通过自由输入和 AI 多轮对话考察玩家是否完成真实职场沟通目标。游戏同时用知乎真实内容提供事件后的延伸阅读和追问依据。

必须始终保持以下规则：

1. UI 遵循电脑版微信的三栏逻辑：左侧功能栏、中间会话/联系人列表、右侧当前聊天。
2. 固定剧情消息必须逐条出现，不能一次性全部铺开。
3. 不同联系人和群聊的消息严格隔离，绝不能把程女士的消息显示在林总私聊等错误窗口中。
4. AI 只能生成角色对话和判断玩家是否满足预设标准；AI 不能自行修改分数、事件顺序或结局条件。
5. 任务完成后的顺序固定为：`任务评价 → 两张知乎回答卡 → 无限追问 → 玩家主动进入下一阶段`。
6. 知乎卡片只能展示经过验证的真实标题、作者、摘要和链接；没有真实数据时显示明确占位，禁止伪造引用。
7. 网络、模型、知乎接口或外部小游戏不可用时，主线仍应能够完成。
8. OAuth、Access Secret、App Key 和模型 API Key 只能存在于服务端环境变量，不得进入 Godot 包、前端代码、日志、截图或仓库。

---

## 2. 当前实现概览

### 技术栈

- 游戏前端：Godot 4.4.1、GDScript、Compatibility 渲染器、单线程 Web 导出。
- 后端：Vercel Serverless Functions、Node.js 22+、TypeScript。
- 模型：OpenAI Chat Completions 兼容接口，由 `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL` 配置。
- 内容：知乎开放平台搜索/内容缓存、知乎知识接口、可选知乎 OAuth。
- 存档：Godot `user://liukanshan_intern_diary_save.json`，浏览器环境对应 IndexedDB/虚拟文件系统。

### 当前已落地

- 10 个三个月实习事件。
- 事件 1、2、3、6、8 为**固定任务**（固定剧本 + 固定选项 / 小游戏判定）。
- 事件 4、5、7、9、10 为**跑团式 AI 事件**：自由输入、多轮 AI 对话、三级任务判定（见 `规则书.md`）。
- 事件 6 为周岚发送的 PPT 小游戏消息卡，提供外部跳转接口与演示结果兜底。
- 事件 8 为固定三选一 + 限时小游戏：选项决定小游戏开局条件（时间 / 干扰文件），入口同样是聊天框里的气泡卡。
- AI 每轮支持 **1–2** 个微信气泡；发送者必须属于当前事件的 `participants`，不合法的气泡直接丢弃。
- AI 裁判结果分为 `excellent`、`completed`、`incomplete`；跑团式事件跑到第 15 轮仍未完成时，由前端判定 `failed`。
- 玩家至少发送两轮消息后才能提交任务处理结果；15 轮为上限，失败不可重试，按未命中标准的维度各扣 1 分。
- 模型不可用时 NPC 台词以**空白气泡占位**（`AI_PLACEHOLDER_BUBBLES`），主线照常可通关。
- AI 服务不可用时，Godot 和 API 均有关键词标准兜底判定。
- 旧 8 事件存档通过事件 ID 映射到新 10 事件结构，不主动清空存档。
- 首日入群、逐条欢迎、消息延迟撤回、周岚添加好友、知乎卡和无限追问均已实现。
- 所有事件完成后由玩家手动点击继续，中间播放不少于 1.5 秒的双阶段时间过渡。

### 当前未完成或仅预留

- PPT 整理小游戏本体尚未制作，只有卡片、跳转与回调协议。
- 新生成的像素沙漏仅为审阅稿，尚未切成严格 10 帧，也未替换当前代码绘制沙漏。
- `curatedInsights` 当前为空，知乎卡仍会显示两个真实接口占位卡。
- 尚未配置实际的 `LLM_*`、知乎 Access Secret 或黑客松 OAuth 凭证。
- README 和旧的 `tests/VERIFICATION.md` 尚未同步到 10 事件版本。
- 目前没有正式公网 Vercel 部署地址；本机页面使用 `http://127.0.0.1:3800/game/` 检查静态导出。

---

## 3. 目录与职责

### Godot 前端

- `scenes/Main.tscn`：主场景。
- `scripts/main.gd`：界面构建、微信消息流、事件推进、AI 请求、裁判处理、存档、知乎卡、PPT 桥接、结局。
- `scripts/event_data.gd`：前端事件真源，包含 10 个事件、场景、角色、完成标准、关键词和固定事件选项。
- `scenes/DeliveryMinigame.tscn`、`scripts/delivery_minigame.gd`：急件冲刺小游戏。
- `scripts/pixel_hourglass.gd`：当前代码绘制的过渡沙漏，尚未替换成 Sprite Sheet。
- `scripts/avatar.gd`：角色到头像资源的映射和圆形 cover 裁剪。
- `scripts/ui_icons.gd`：代码绘制的通用线性 UI 图标。

### Vercel API

- `api/_lib/events.ts`：后端事件、评分标准和知乎缓存真源。修改事件时必须与 `scripts/event_data.gd` 同步。
- `api/_lib/npc.ts`：NPC 人设、模型提示、多气泡 JSON 校验和无模型兜底。
- `api/npc/reply.ts`：对话接口。
- `api/events/evaluate.ts`：AI 任务裁判接口；模型只返回命中的标准，服务端负责固定映射分数。
- `api/action.ts`：前三个固定事件的行动 ID 校验。
- `api/events/[id].ts`：事件读取。
- `api/zhihu/insights/[eventId].ts`：已人工验证的知乎卡片读取。
- `api/zhihu/knowledge.ts`：赛事专用知乎知识内容读取。
- `api/auth/*`：可选知乎 OAuth。

### 测试与导出

- `tests/isolated_main.gd`：内存存档测试壳，不读写真实玩家存档。
- `tests/ui_regression.gd`：1280×720 UI 与流程回归。
- `tests/screenshots/`：回归截图；目录中部分截图来自旧阶段，不应当作最新功能事实源。
- `export_presets.cfg`：Web 导出配置，使用项目内单线程模板。
- `public/game/`：最近一次导出的网页包。

---

## 4. 十个事件与主题线

| 序号 | 时间 | ID | 事件 | 玩法 | 核心主题 |
|---|---|---|---|---|---|
| 1 | 第一月·入职第 1 天 | `day-01` | 初入看山创意部 | 固定剧情 | 第一印象与沟通入口 |
| 2 | 第一月·第 3 天 | `day-03` | 一句模糊的任务 | 固定选择 | 需求澄清 |
| 3 | 第一月·第二周 | `day-05` | 临时跑腿请求 | 固定选择 | 边界与协作 |
| 4 | 第一月·第三周 | `day-07` | 第一次客户拜访 | AI 多轮对话 | 承诺与确认 |
| 5 | 第二月·第一周 | `day-10` | 会议里的不同意见 | AI 多轮对话 | 用证据表达异议 |
| 6 | 第二月·第二周 | `ppt-assembly` | 混乱的提案 PPT | 固定＋外部小游戏 | 文件协作与版本管理 |
| 7 | 第二月·第四周 | `feedback-rework` | 方案被全部打回 | 跑团式 AI 对话 | 反馈拆解与迭代 |
| 8 | 第三月·第一周 | `day-13` | 急件冲刺 | 固定三选一＋限时小游戏 | 压力下的判断与执行 |
| 9 | 第三月·第三周 | `day-16` | 功劳与协作 | AI 多轮对话 | 署名与团队信任 |
| 10 | 第三月·最后一天 | `day-20` | 结项答辩 | AI 多轮对话 | 复盘、成长与责任 |

### 固定事件规则

#### 事件 1：初入看山创意部

- 新存档最初只有林总。
- 林总先说「刘看山，欢迎。」，约 1.2 秒后再出「先拉你进项目群，人都在里面。」＋ 300px 宽的入群邀请卡；点击后才新增公司群。
- 群内 10 条人物消息按**不等间隔**逐条出现（0.5–4.0 秒），带时间戳分隔与文件气泡；**群聊不显示"正在输入…"**。
- 玩家完成固定三选一；**玩家气泡是选项里写好的第一人称发言**，选项的行为标签不会变成气泡；潜水选项不发任何气泡。
- 选项之后的我方与 NPC 反应同样逐条播放（我方 0.4／1.0 秒，对方 1.2–2.55 秒），播放期间收起选项只留一行「……」。
- 玩家随后在群内发送任意消息：消息先显示约 1.1 秒，再被周岚撤回。
- 周岚添加好友，私聊内由其转发两张知乎卡（**全游戏唯一由角色转发的卡片**），再开放无限追问。

#### 事件 2：一句模糊的任务

固定选择分别对应：主动确认目标、先做小样、按自己理解闷头完成。选项和分数不能由 AI 改写。

#### 事件 3：临时跑腿请求

固定选择分别对应：说明 deadline 并协调、立即帮忙后独自赶工、直接拒绝且不给替代方案。主题不是简单判断“帮或不帮”，而是边界能否被清楚表达。

### 六个 AI 事件的完成标准

#### 事件 4：第一次客户拜访

- `clarified_concern`：确认客户真正关心的问题。
- `set_boundary`：说明现有信息边界，不编造数据。
- `confirmed_deadline`：约定明确补充时间。

#### 事件 5：会议里的不同意见

- `cited_evidence`：提出具体用户证据。
- `respected_plan`：承认现有方案的价值。
- `proposed_test`：提出可验证的下一步。

#### 事件 7：方案被全部打回

- `split_feedback`：将模糊反馈拆成具体问题。
- `confirm_priority`：确认修改优先级。
- `revision_list`：形成下一版修改清单与分工。

#### 事件 8：紧急送交签约件

- `confirm_version`：确认正确文件版本。
- `confirm_handoff`：确认交接人和地点。
- `confirm_time`：确认剩余时间并立即行动。
- AI 对话通过后才启动急件冲刺。当前小游戏成功/失败会继续改变分数并完成事件。

#### 事件 9：功劳与协作

- `public_credit`：公开补全同事贡献。
- `explain_action`：向阿麦说明具体修正办法。
- `future_rule`：建立后续署名规则。

#### 事件 10：结项答辩

- `specific_results`：说明具体成果和证据。
- `team_credit`：准确说明协作贡献并感谢团队。
- `reflection_next`：提出反思和下一阶段责任。

### 三级评价与固定分数

- 命中 3 项：`excellent`，三项能力各 `+2`。
- 命中 2 项：`completed`，三项能力各 `+1`。
- 命中 0–1 项：`incomplete`，不加分、不完成事件，提示缺失目标并允许继续对话。

服务端模型只能返回 `metCriteria` 和反馈文案；状态和 `scoreDelta` 必须由服务端根据命中数量计算。Godot 收到结果后再次按本地固定规则加分，不信任模型自由生成的分数。

---

## 5. 人设与模型演绎约束

### 刘看山

玩家角色，刚进入创意部的实习生。善于观察但缺乏职场经验。AI 绝不能替刘看山发言，也不能假定玩家完成了没有明确说出的行动。

### 林总

部门负责人，目标导向、克制、重视结果与风险。常追问目标、依据、责任人和截止时间；不接受只强调努力和加班。

### 周岚

项目组长和直接带教，温和但流程意识强。群内维护秩序，私聊解释规则，不替玩家做决定。PPT 小游戏必须由周岚发送。

### 阿麦

热情外向、创意多、容易在压力下临时求助。不是恶意甩锅；主要承载协作、边界和功劳归属冲突。

### 韩策

资深执行，严谨直接，重视结构、命名、版本、数据和交付检查。

### 小鹿

年轻设计师，重视用户感受和视觉表达，灵感丰富，但可能忽略成本或执行复杂度。

### 程女士

客户负责人，结果导向、时间紧，会临时改变需求，但不是故意刁难。接受诚实的信息边界和明确补充时间，不接受编造数据。

### 输出格式

- 每轮生成 **1–2** 条独立气泡。
- 每条建议 15–45 个汉字，服务端最终截断到 180 字。
- `sender` 必须属于当前事件 `participants`；不合法的那条**直接丢弃**（不再改写成事件 NPC）。
- `emotion` 仅允许 `neutral | warm | serious | concerned`。
- 禁止提及模型、提示词、隐藏分数、轮次、剧情分支或未提供的知乎来源。
- 客户端会把当前轮次（第 N / 15 轮）传给服务端，用于让步阶梯；模型不得向玩家复述轮次。
- 失败扣分按未命中标准所属维度各 −1（映射表见 `规则书.md` §8），不由模型决定。

---

## 6. API 协议

### NPC 多轮回复

`POST /api/npc/reply`

请求：

```json
{
  "eventId": "day-07",
  "role": "程女士",
  "message": "我想先确认您最关心的是舆情、授权还是执行风险？",
  "history": [
    {"sender": "程女士", "text": "我更关心校园联名的风险。"},
    {"sender": "刘看山", "text": "我想先确认具体是哪类风险。"}
  ]
}
```

响应：

```json
{
  "messages": [
    {"sender": "程女士", "text": "先说授权和舆情，你们现有资料能确认到哪一步？", "emotion": "serious"}
  ],
  "canSubmit": true,
  "mode": "model"
}
```

接口只取最近 20 条消息，校验事件、角色和 180 字输入上限。无模型配置时返回事件的角色化兜底消息。

### AI 任务裁判

`POST /api/events/evaluate`

请求：

```json
{
  "eventId": "day-07",
  "history": [
    {"sender": "刘看山", "text": "我先确认您具体关心的风险。"},
    {"sender": "刘看山", "text": "目前数据不足，我会在明天十点前补充回复。"}
  ]
}
```

响应：

```json
{
  "status": "excellent",
  "feedback": "目标、信息边界和回复时间都已说明。",
  "metCriteria": ["clarified_concern", "set_boundary", "confirmed_deadline"],
  "missingCriteria": [],
  "scoreDelta": {"trust": 2, "team": 2, "growth": 2},
  "mode": "model"
}
```

模型服务失败时 API 按关键词命中本地计算；Godot 桌面 Debug 因 `get_api_origin()` 返回空，也直接执行同一类本地兜底。

### PPT 小游戏桥接

前端调用语义：

```text
launch_minigame("ppt-assembly", {"returnEventId": "ppt-assembly"})
```

地址来源：

- 原生环境读取进程环境变量 `PPT_MINIGAME_URL`。
- Web 环境优先读取 `window.PPT_MINIGAME_URL`。
- 当前 Vercel 环境变量不会自动进入 Godot 浏览器运行时。正式接入时需要在 HTML Shell 或同源配置接口中显式注入 `window.PPT_MINIGAME_URL`，注意不能把任何秘密放入该变量。

跳转时自动附加：

```text
?eventId=ppt-assembly&returnContext=<URL编码JSON>
```

外部小游戏返回 Web 主页面时调用：

```javascript
window.opener?.completePptMinigame(JSON.stringify({
  eventId: "ppt-assembly",
  status: "excellent",
  details: {
    versionCorrect: true,
    structureComplete: true,
    creditsComplete: true
  }
}));
```

允许状态：`excellent | completed | failed`。`failed` 不完成任务；其他状态保存到 `minigame_results`、加固定分数并进入知乎卡流程。当前未配置 URL 时会提示小游戏仍在准备，并提供“使用演示结果继续”。

---

## 7. 存档结构与迁移

`SAVE_VERSION` 当前仍为 `2`。不要仅因为增加普通字段就随意升级或删除存档。

核心字段：

```json
{
  "version": 2,
  "current_index": 0,
  "current_event_id": "day-01",
  "active_tab": "林总",
  "completed": [],
  "history": [],
  "asks": {},
  "revealed": {},
  "joined_main_group": false,
  "groups": [],
  "contacts": ["林总"],
  "unread": {"林总": 0},
  "contact_notices": [],
  "day01_intro_selected": false,
  "day01_redirected": false,
  "event_dialogues": {},
  "evaluation_attempts": {},
  "event_results": {},
  "minigame_results": {},
  "scores": {"trust": 0, "team": 0, "growth": 0}
}
```

注意事项：

- 新版优先用 `current_event_id` 恢复事件，避免数组插入导致错位。
- 没有 `current_event_id` 的旧存档使用原 8 个事件 ID 顺序映射。
- `normalize_game_state()` 会补齐新增字典字段。
- 历史消息必须同时按 `event_id` 和 `channel` 过滤。
- `tests/isolated_main.gd` 使用内存存档，回归测试不会覆盖用户真实存档。
- `event_dialogues` 目前只预留，实际对话仍以 `history` 为真源；后续若启用该字段，必须避免复制存储产生不一致。

---

## 8. 知乎生态接入

### 当前行为

- 每个事件都有 `keyword`。
- 任务完成后调用同源 `/api/zhihu/insights/:eventId`。
- 若 `curatedInsights[eventId]` 为空，前端显示两张“待接入”占位卡，不生成虚构作者或标题。
- 有真实数据时，点击卡片仅允许打开 HTTPS 知乎域名链接。

### 正式填充流程

1. 使用官方知乎 Skill/CLI 按事件关键词搜索。
2. 人工核对原始标题、作者、摘要与链接。
3. 只将真正支撑该事件主题的两条结果写入 `api/_lib/events.ts` 的 `curatedInsights`。
4. 摘要不能冒充原文或项目原创；卡片应保留“知乎”来源标识和原回答链接。
5. 做服务端缓存和请求去重，遵守赛事额度与禁止刷屏要求。

当前机器上的知乎 CLI 已安装且版本兼容，但尚未配置 Access Secret。不要擅自安装新 Skill、升级 Skill 或代用户生成凭证。

---

## 9. 结局规则

三项累计评价为：

- `trust`：老板信任。
- `team`：团队协作。
- `growth`：职业成长。

当前 `show_ending()` 规则：

- 三项均至少 9 且总分至少 29：跳级升职。
- 三项均至少 3 且总分至少 14：实习转正。
- 其他情况：结束实习。

注意：新版本事件数量和可获得总分已经变化，但上述阈值仍沿用旧版本。后续应优先做三条完整路径的分数审计，确认优秀路线、普通路线和失败路线都能稳定到达目标结局，再决定是否调整阈值。

---

## 10. 本地启动、测试与导出

### 安装后端依赖

```powershell
Set-Location 'C:\Users\hp\Desktop\LKS2.0\liukanshan-intern-diary'
& 'C:\Program Files\nodejs\npm.cmd' ci
```

注意：最近一次 `npm ci` 报告 17 个依赖安全告警（1 low、9 moderate、6 high、1 critical）。尚未执行 `npm audit fix --force`，因为它可能引入破坏性升级。接手者应先运行 `npm audit` 分析来源，不要直接强制升级。

### TypeScript 检查

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
```

最近一次结果：通过。

### Godot 静态检查

本机已知可用 Godot 控制台路径：

```powershell
& 'C:\Users\hp\Documents\Codex\2026-09-11\ai-ai-agent-ai-ai-agent\work\godot\Godot_v4.4.1-stable_win64_console.exe' `
  --headless --path . --script res://scripts/main.gd --check-only
```

最近一次结果：通过。

### UI 回归

```powershell
& 'C:\Users\hp\Documents\Codex\2026-09-11\ai-ai-agent-ai-ai-agent\work\godot\Godot_v4.4.1-stable_win64_console.exe' `
  --path . --script res://tests/ui_regression.gd `
  --log-file 'C:\Users\hp\Documents\Codex\2026-09-11\ai-ai-agent-ai-ai-agent\work\ten-events-ui-final.log'
```

最近一次 `UI_REGRESSION_RESULT`：`PASS`。

覆盖内容包括：

- 首日邀请、逐条欢迎、撤回、加好友和知乎卡顺序。
- 继续按钮各状态可读性。
- 时间过渡不少于 1.5 秒。
- 10 个事件与 6 个 AI 事件数量。
- AI 事件无固定行动按钮。
- 两轮前不可提交、未完成阻断、继续对话后优秀完成。
- PPT 卡片、演示结果回调。
- 跨联系人消息隔离。
- 头像 cover 与圆形裁剪。
- 存档字段往返保持。

### Web 导出

```powershell
& 'C:\Users\hp\Documents\Codex\2026-09-11\ai-ai-agent-ai-ai-agent\work\godot\Godot_v4.4.1-stable_win64_console.exe' `
  --headless --path . --export-release Web public/game/index.html
```

最近一次导出：成功。静态页面入口为 `public/game/index.html`，本机曾通过 `http://127.0.0.1:3800/game/` 实际加载检查。

### 同源 API 调试

单纯静态服务器只能验证 Godot 和本地兜底，不能验证 Vercel API。验证真实 AI/API 时应从项目根目录运行：

```powershell
& 'C:\Program Files\nodejs\npx.cmd' vercel dev
```

然后使用 Vercel 输出的同源地址进入 `/game/`。Godot Web 会将 API 请求发送到 `window.location.origin`。

---

## 11. 环境变量

服务端参考 `.env.example`：

```text
LLM_API_KEY=
LLM_BASE_URL=
LLM_MODEL=
ZHIHU_OAUTH_APP_ID=
ZHIHU_OAUTH_APP_KEY=
ZHIHU_OAUTH_REDIRECT_URI=https://YOUR-VERCEL-DOMAIN/api/auth/callback
ZHIHU_ACCESS_SECRET=
```

另有非秘密的小游戏地址：

```text
PPT_MINIGAME_URL=
```

Web 中需要将 PPT 地址安全地注入为 `window.PPT_MINIGAME_URL`；不要注入任何 API Key。

---

## 12. 像素沙漏审阅稿

当前生成的审阅稿位于项目外：

```text
C:\Users\hp\.codex\output\imagegen\mcp-1789211164000184700.png
```

状态：仅供用户审视，未复制进仓库，未替换 `scripts/pixel_hourglass.gd`，也没有生成承诺中的 GIF。

审阅稿本身不是严格可直接切片的 640×64 素材：生成图尺寸较大，十帧的留白和宽度也不完全一致。用户确认美术方向后，应执行以下步骤：

1. 将每个状态重绘/整理为严格 64×64 画布。
2. 输出 640×64、透明背景、10 帧等宽 Sprite Sheet。
3. 检查透明边缘和像素硬边，不允许平滑缩放。
4. 制作循环 GIF 仅用于审阅。
5. 在 Godot 中用帧区域切换播放，纹理过滤设为 `NEAREST`。
6. 禁止继续旋转整个 Control 节点，否则 Web 端会再次出现模糊和旋转中心问题。

---

## 13. 已知技术风险与下一步优先级

### P0：先保证比赛现场可完整通关

1. 从新存档完整走通 10 个事件，分别验证优秀、普通和失败路线。
2. 审计事件 8：AI 评价先加分、小游戏成功/失败再加分，确认组合分数符合产品预期。
3. 审计结局阈值，确保三种结局稳定可复现。
4. 使用 `vercel dev` 真实调用 `/api/npc/reply` 与 `/api/events/evaluate`，检查模型是否严格输出 JSON。
5. 对模型输出失败、超时、空数组、非法发送者和非法标准 ID 做实际回归。

### P1：完成知乎生态价值

1. 配置 Access Secret 后搜索每个事件关键词。
2. 每个事件人工选定两条真实高质量回答。
3. 填充 `curatedInsights`，逐一检查链接域名和摘要准确性。
4. 确认卡片在评价后、追问前出现，追问提示明确指向上方两条回答。

### P1：接入 PPT 小游戏

1. 确定小游戏 URL 与托管方式。
2. 注入 `window.PPT_MINIGAME_URL`。
3. 实现成功、普通、失败三种回调。
4. 检查重复回调不能重复加分。
5. 决定外部页面是新窗口还是同页跳转；当前使用 `OS.shell_open`，通常会打开新页面/新标签。

### P2：替换沙漏动画

等待用户确认审阅稿后再制作严格 Sprite Sheet 和 GIF，不要直接把现有大图塞进游戏。

### P2：文档与工程清理

1. 更新 `README.md` 为 10 事件版本。
2. 更新或替换过时的 `tests/VERIFICATION.md`。
3. 检查 `event_dialogues` 是否确实需要；若不用可在下一次明确的存档迁移中移除。
4. 运行 `npm audit` 并制定非破坏性依赖升级方案。

---

## 14. 接手智能体的操作约束

1. 只修改 `C:\Users\hp\Desktop\LKS2.0\liukanshan-intern-diary`，不要修改同目录下其他项目。
2. 修改文件必须先阅读当前实现，尤其不要按旧 README 把项目退回 8 事件。
3. 不要清除或重置用户存档，除非用户明确要求。
4. 修改事件时必须同步 Godot 与 TypeScript 两份事件数据。
5. 不要让模型直接返回或控制最终分数。
6. 不要把跨事件或跨联系人的历史一起发送给模型。
7. 不要伪造知乎回答或作者。
8. 不要在获得用户同意前升级知乎 Skill、创建凭证或执行外部发布。
9. 每次交付前至少完成：TypeScript 检查、Godot 静态检查、UI 回归、Web 重新导出、浏览器实际复测。
10. 不要仅凭“代码已修改”声称功能完成；必须给出实际测试结果。

---

## 15. 当前交付基线

最近一次已确认：

- `npm run typecheck`：通过。
- Godot `main.gd --check-only`：通过。
- `tests/ui_regression.gd`：全部通过。
- Web Release 导出：成功。
- `http://127.0.0.1:3800/game/`：实际加载成功。
- 页面保留了用户已有存档，因此浏览器截图当时显示在第二个事件，而不是新存档首页；这不代表首日流程缺失。

接手后第一件事建议是复制/使用独立测试存档进行完整 10 事件人工试玩，同时保持用户真实存档不变。

---

## 16. 本轮改动记录（2026-09-12 · 剧本、人设与演出改造）

### 16.1 新增与重写

- `STORY_BIBLE.md`（新）：舞台世界观、7 个角色人设、群聊生态规则、演出规则、10 个事件剧本、分数与结局、能力清单、流程线与主题。
- `剧本.md`（新）：同一剧本的传统剧本体全文。
- `规则书.md`（新）：跑团式 AI 事件的 GM 规则——回合定义、每轮 1–2 条、15 轮上限、让步阶梯、权力边界、失败与收尾、每轮自检清单。
- `通关走查.md`（新）：完整通关走查稿、分数审计与"旧串 → 新串"落地清单。
- `scripts/event_data.gd`：重写为最终文案。消息元组扩展为 `[sender, text, channel, kind, delay, stamp]`（kind：`text|file|system|typing`）；固定选项改为 `{id, label, bubbles, replies, scores, minigame}`；AI 标准新增 `dimension`（失败扣分维度）。
- `scripts/main.gd`：第一人称玩家气泡（选项标签只作行为说明，不再成为气泡）、AI 空白气泡占位、可变节奏 + `正在输入…` + 时间戳分隔 + 文件气泡、轮次计数与 15 轮失败结算、事件 8 气泡卡与限时小游戏开局条件、事件 1 的知乎卡改由周岚转发、入群邀请分两条出现。
- `scripts/delivery_minigame.gd`：新增 `configure(seconds, distractors)`，默认时限 90 秒。
- `api/_lib/events.ts`、`api/_lib/types.ts`、`api/_lib/npc.ts`、`api/npc/reply.ts`：与前端数据同步；每轮 1–2 条；非法 `sender` 直接丢弃；`round` / `roundLimit` 传入提示用于让步阶梯。
- `tests/ui_regression.gd`：同步新文案与新按钮；新增 `tests/full_playthrough.gd`（完整通关 + 15 轮失败 + 维度扣分映射单测）。

### 16.2 顺带修掉的三个真实 bug

1. `clear_children()` 只做 `queue_free()`：同一帧内重复渲染时旧节点仍在树上，Godot 会把新节点的重名自动改掉（`FixedAction0` → `@FixedAction0@2`），按名字查控件会失败。现在先 `remove_child` 再 `queue_free`。
2. `skip_current_messages()` 不打断正在等待的播放协程：协程醒来后把 `revealed` 覆盖回旧值（玩家长按跳过即可复现）。现在用 `reveal_epoch` 作废在飞的协程。
3. **选项之后的对话会一次性全部出现**：只有事件开场的 `messages` 走了逐条播放，选项触发的我方气泡与 NPC 反应是整段写入 `history` 后一次渲染的。现在 `run_action_sequence()` 把"我方 → 对方 → 系统行"按不等间隔逐条播（我方 0.4／1.0 秒，对方 1.2／1.65／2.1／2.55 秒，落气泡前先显示"正在输入…"），播放期间收起选项只留一行「……」；模型占位回复也改成先"正在输入"1.1 秒再落空白气泡。

### 16.3 验证结果

- `npm run typecheck`：通过。
- Godot `main.gd --check-only`：通过。
- `tests/ui_regression.gd`：`UI_REGRESSION_RESULT: PASS`。
- `tests/full_playthrough.gd`：`FULL_PLAYTHROUGH_RESULT: PASS`（125 项断言，退出码 0）。优秀路线终局 `trust 20 / team 18 / growth 22 = 60` → 跳级升职；15 轮失败路径实测 `trust −2 / growth −1`，与 `规则书.md` §8 映射表逐条一致。
- Web Release 导出：成功，`public/game/index.pck` 已更新（2026-09-12 22:20，含逐条播放修复）。

### 16.4 测试用评价码与打字提示规则（2026-09-12 追加）

在跑团式事件（4、5、7、9、10）的输入框里**直接输入数字**即可跳过对话：

| 输入 | 结果 |
|---|---|
| `159` | 强制判定**优秀**（三项各 +2，事件完成） |
| `258` | 强制判定**良好**（三项各 +1，事件完成） |
| `357` | 强制判定**未完成**（不加分、事件保持开放，可继续对话） |

- 调试码不会写进聊天记录，也不消耗轮次；屏幕会显示一行「〔调试〕强制评价：优秀／良好／未完成」。
- 实现：`scripts/main.gd` 的 `DEBUG_EVAL_CODES`、`apply_debug_evaluation()`、`evaluation_feedback()`。
- 同时收紧了打字提示：**"某某 正在输入…"只在联系人（一对一）窗口出现，群聊里不出现，且每轮对话只显示一次**（此前是每条消息都出现）。群聊的 `typing` 数据行保留支持，但只在联系人窗口渲染。

### 16.5 仍未完成

- **浏览器内实测**：导出成功但没有人工在浏览器里点完 10 个事件，需要部署后复测。
- `curatedInsights` 仍为空，知乎卡在界面上显示"待接入"占位；周岚转发的引导语已经先在剧情里留好。
- 事件 8 的小游戏本体仍是 2D 躲避原型（已支持 90/75 秒与干扰文件的开局条件）；胡闹厨房式的多工位 / 订单队列玩法只写进了 `STORY_BIBLE.md` §6.8 与 `剧本.md` 第八场，尚未实现。
- 结局阈值仍是旧版（三项 ≥9 且总分 ≥29），而满分已到 60，建议按 `通关走查.md` §15.1 重新配平。
