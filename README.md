# 《刘看山打工日记》· 知乎小游戏

一个以**刘看山**为主角的竖屏剧情小游戏：微信式对话 + 格子地图 + 《胡闹厨房》式限时工作关。
十段职场成长故事；所有文字在 DOM 里渲染，像素画**整数倍缩放 + 最近邻**。

> 本项目为**知乎黑客松**作品。刘看山及相关角色形象版权归**知乎**所有；
> 项目内美术为赛事期间用生成式模型制作并加工的同人练习作，仅供赛事展示。详见 NOTICE.md。

## 特性

- **双模式叙事**：微信式聊天推进剧情，格子地图负责「去哪儿」，两者互相驱动
- **限时工作关**：领任务单 → 查资料 / 写稿 / 校对 → 交稿；工单超时会作废并记一次交错
- **真实知乎内容**：剧情里的「知乎卡」全部来自知乎开放平台的真实检索结果（离线烘焙进仓库）
- **知乎账号接入**：OAuth 登录后显示真实的知乎用户名 / 头像 / 签名
- **像素完美**：整数倍缩放 + 最近邻过滤；五档宽高比；32 色以内
- **全中文文案**，所有文字都在 DOM 中（可朗读、可搜索、可复制）

## 快速开始

环境要求：Node.js 18+（开发建议 20+）

    # 1) 安装依赖（游戏本体在 liukanshan-career）
    cd liukanshan-career
    npm install

    # 2) 开发（热更新）
    npm run dev            # 默认 http://127.0.0.1:5273

    # 3) 构建
    npm run build          # 产物在 liukanshan-career/dist

    # 4) 本地预览构建产物
    npx vite preview

## 目录结构

    liukanshan-career/        游戏本体（Vite + React + TypeScript + Phaser）
      src/screens/            各屏幕：开场 / 微信(Avg) / 地图(MapScreen) / 关卡
      src/game/map/           地图场景（手工固定布局）
      src/game/greybox/       工作关的灰盒关卡（按窗口尺寸生成）
      src/game/scenes/        工作关场景（拾取 / 工序 / 交单 / AI 队友）
      src/state/              全局状态（zustand）：剧情 / 存档 / 音效 / 工单
      src/story/              剧本与数据（事件一~四、跑团、知乎卡、道具卡…）
      src/ui/                 通用 UI（弹窗 / 摇杆 / 技能卡 / 知乎账号…）
      server/zhihu-oauth.mjs  知乎 OAuth 登录服务（零依赖，systemd 托管）
      tools/                  验收用无头浏览器脚本（体检）
      public/assets/          美术与音频（构建时原样拷贝）

    工具/                     构建期工具（美术流水线、地图生成、部署脚本）
    美术/                     美术源文件（原图 / 成品 / 提示词）
    设计/                     策划文档
    docs/                     设计与规划文档
    交接文档.md               ★ 项目全量交接（踩坑史 + 待办，改代码前必读）

## 部署

生产环境是 nginx + 静态文件（/srv/liukanshan/刘看山/），另有 systemd 托管的知乎 OAuth 服务。

    # 构建并打包
    cd liukanshan-career && npm run build && tar -czf dist.tar.gz -C dist .

    # 上传 + 解包（凭据走环境变量，脚本见 工具/远程.mjs）
    node 工具/远程.mjs put dist.tar.gz /tmp/lks-dist.tar.gz
    node 工具/远程.mjs sh "bash /tmp/lks-1.sh"

    # 线上验收（真浏览器，要求 0 失败请求 / 0 控制台报错）
    cd liukanshan-career && node tools/部署验收.mjs https://<你的域名>/刘看山/

> 部署三条硬规矩：**构建失败不打包**、**上传要重试**、**部署后核对服务器文件哈希**。

## 知乎 OAuth

    # 服务端密钥（只放服务器，权限 600）
    /etc/liukanshan-zhihu.env    ZHIHU_APP_ID / ZHIHU_APP_KEY / ZHIHU_REDIRECT_URI
    systemctl status liukanshan-zhihu

    # 接口
    GET  /刘看山/api/zhihu/status     当前登录状态与资料
    GET  /刘看山/api/zhihu/login      跳转知乎授权页
    GET  /刘看山/api/zhihu/callback   回调（换 token + 拉 /user）
    POST /刘看山/api/zhihu/logout     退出

> 回调地址必须是**公网 HTTPS**，并且要在知乎开放平台**登记成完全一致的值**。
> 授权页最后那一下由**用户本人**点击，程序不代点。

## 技术栈

| 层 | 选型 |
|---|---|
| 构建 | Vite |
| UI | React + TypeScript（文字全在 DOM） |
| 游戏 | Phaser 3（地图与关卡用 canvas） |
| 状态 | zustand |
| 服务端 | Node 原生 http（无第三方依赖） |
| 美术 | 像素画，整数倍缩放 + 最近邻 |

## 开发约定（重要）

- **像素完美**：只允许整数倍缩放 + nearest 过滤，禁止平滑插值
- **文字不画进 canvas**：一律 DOM 渲染，保证可访问、可搜索
- **离线可通关**：外部服务（知乎登录 / AI 队友）都只是增强，断网也能把故事走完
- **AI 不改数值**：AI 只生成台词，评分 / 剧情 / 数据来源一律由程序决定
- **知乎内容不编造**：卡片文案必须来自真实检索结果，宁可少一张也不编

## 参与贡献

见 CONTRIBUTING.md。

## 许可

代码以 **MIT** 发布，见 LICENSE。
**美术素材与角色形象另有限制**，见 NOTICE.md。
