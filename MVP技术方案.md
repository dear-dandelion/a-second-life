# She Nicest 项目 MVP 技术方案

> 版本：v1.1
> 日期：2026-09-05
> 适用范围：部署于 Vercel 的移动端优先 Web App MVP，包括账号角色、AI 对话、最小 RAG、健康信息提取、语音输入、语音播放及健康报告导出。

## 0. 需求符合性结论与最终边界

根据最新要求，技术基线收敛如下：

| 要求 | 结论 | MVP 实现边界 |
| --- | --- | --- |
| 移动端产品形态 | 有条件符合 | Next.js 移动端优先 Web App，部署 Vercel；可配置 PWA。若要求上架 App Store/安卓商店，Vercel 本身不等于原生 App，需后续另行封装 |
| 前端 | 已收敛 | Next.js + React + TypeScript，仅实现本轮 MVP 页面 |
| 后端 Supabase | 符合，已替换原自建 Node 后端 | Supabase Auth、Postgres、RLS、Storage、Edge Functions、pgvector |
| AI 聊天 Agent | 符合 | 文字/语音、RAG、健康数据自动提取与校验写卡、受控工具调用 |
| 两类用户 | 符合 | 本人用户有健康记录/报告；支持者用户无这两项能力 |
| 好友系统 | 不进入 MVP | 好友列表、交友入口和消息提醒均为前端假数据；所有交互 toast“敬请期待” |
| 健康报告 | 符合 | 自动生成可编辑预览、本地 PDF、系统下载/分享 |

这里的“自动记录创建”定义为：AI 从用户明确表达中生成结构化变更，经服务端字段、枚举、日期与目标记录 ID 校验后自动写入正式健康卡片。前端必须显示更新提示，用户可随时修订或删除；模型输出不合格或写入失败时不得静默成功。

RAG 和两类用户是上一轮明确提出的要求，虽然未在本轮页面清单中单列，本方案仍保留其最小实现：RAG 只服务 AI 健康问答，不建设知识运营后台；角色只做注册选择、功能显隐和后端鉴权，不扩展角色社交功能。

### 0.1 严格 MVP 功能清单

| 模块 | 真实实现 | 明确不实现 |
| --- | --- | --- |
| 全局 | 四个 Tab、默认“今天的我”、统一 toast | 未实现入口对应的页面和业务后端 |
| 絮絮叨叨 | 文字/单句语音、TTS、SSE、多轮 Agent、最小 RAG、安全提示、健康卡片自动更新、已实现页面导航 | 实时 ASR 字幕、持续监听、未实现页面工具 |
| 今天动一动 | 首页 2～3 条建议、今日→近 3 天→默认回退、六分类列表 | 建议详情、分类详情、打卡 |
| 这个月的我 | 四维度日历/曲线、月度小结、月度总结及历史、分享、报告预览/PDF 下载分享 | 超出四维度的新分析、医生端、报告协作 |
| 交流广场 | 写死信息流及全部视觉入口 | 搜索、帖子详情、点赞评论收藏、发帖、商城及任何数据库表 |
| 我的消息 | “AI 帮我说”文字/语音、改写、编辑、复制/系统分享 | 好友后端、真实消息、微信 SDK；交友与消息列表仅假数据/toast |
| 我的 | 出生年份、既往病史、手术史；12 个静态锁定成就 | 上传检查报告、药物管理、收藏、设置逻辑、成就触发/存储 |
| 角色 | 两类用户的注册选择、功能显隐和后端拒绝 | 角色运营后台、角色切换工作流、角色间数据共享 |

由此删除：好友表与接口、社区/商城表、通知系统、成就埋点与存储、检查报告上传、药物联动、详情页、打卡、实时 ASR、复杂 RAG 后台、Vercel API 中转层。

## 1. MVP 技术目标

MVP 的核心不是做一个泛聊天机器人，而是验证下面这条业务闭环：

1. 用户通过文字或点击录音表达近况。
2. AI 以温和、简短、非诊断性的方式多轮回应。
3. 系统从当轮对话中提取健康信息，生成待确认的健康卡片。
4. 用户检查、编辑、勾选并确认后，数据才写入健康记录。
5. 已确认的数据可用于月度曲线、月度总结、今日行动建议和就医报告。
6. AI 可以通过受控工具读取记录、打开已实现页面或提出修改建议，但不能绕过用户确认直接改写健康数据。

MVP 优先验证四项指标：对话是否有帮助、健康信息提取是否准确、用户是否愿意确认并持续记录、语音链路是否足够顺畅。

## 2. 技术选型

| 层级 | MVP 选型 | 用途 |
| --- | --- | --- |
| 移动端前端 | Next.js + React + TypeScript | 移动端响应式页面、MediaRecorder、SSE、健康卡片和报告预览 |
| 前端部署 | Vercel | 构建、预览环境、生产发布；不承载百炼密钥和健康数据写入逻辑 |
| 后端平台 | Supabase | Auth、Postgres、RLS、Storage、Edge Functions、定时任务 |
| AI 文本模型 | 阿里云百炼千问 Flash + Plus | Flash 负责高频对话与轻任务；Plus 负责复杂提取、总结和报告草稿 |
| ASR | 阿里云百炼 Fun-ASR-Realtime | MVP 使用文件/单句模式；后续升级 WebSocket 实时转写 |
| TTS | 阿里云百炼 CosyVoice Flash | 将适合朗读的短回复转换为音频 |
| 业务数据库 | Supabase Postgres | 用户、角色、会话、健康记录、月度总结和知识库；不存好友/社区假数据和最终 PDF |
| RAG | Supabase pgvector + Postgres RPC | 审核知识的切片、向量检索、权限与来源过滤 |
| 对象存储 | Supabase Storage | 知识库原文件；必要时短暂中转录音，使用私有桶与短时签名 URL |
| 可观测性 | 应用日志 + Sentry/阿里云日志服务 | 错误、延迟、模型调用和安全规则命中情况 |

### 2.1 模型路由建议

| 场景 | 默认模型 | 调用方式 | 说明 |
| --- | --- | --- | --- |
| 日常多轮聊天 | Qwen Flash | 流式 | 低延迟、低成本 |
| “AI 帮我说”改写 | Qwen Flash | 非流式或短流式 | 输出短文本，不调用健康工具 |
| 当轮信息提取 | 支持严格 JSON Schema 的 Qwen Flash/Plus 版本 | 非流式、结构化输出 | 与聊天回答分开调用，便于校验和重试 |
| 健康卡片复杂修订 | Qwen Plus | Function Calling，非流式控制 | 先生成变更草案，用户确认后由业务服务写库 |
| 月度总结/就医报告草稿 | Qwen Plus | 异步、结构化输出 | 先由 SQL 聚合事实，再由模型负责表述 |
| 页面导航/查询记录 | Qwen Flash | Function Calling | 工具白名单，仅允许 MVP 已实现能力 |

生产环境应使用配置项保存具体模型 ID，并支持灰度切换，不在业务代码里写死“最新版”。测试通过后锁定快照版本，避免模型自动升级导致提取结果漂移。

### 2.2 最小可用 RAG 知识库

RAG 用于回答更年期健康知识和 App 使用问题，不用于替代结构化健康数据查询。用户个人记录必须通过 `get_health_records` 工具按权限读取，不能把个人健康数据混进公共知识向量库。

MVP 只建设一个经过人工审核的公共知识库：

- 内容来源限定为权威指南、项目医疗顾问审核材料、常见问题和 App 使用说明，不允许模型自行联网补充。
- 文档入库时保存 `title`、`source_url`、`publisher`、`version`、`reviewed_at`、`reviewer`、`status` 和适用人群。
- 文档按标题和自然段切片；每片约 300～600 个中文字符，并保留少量重叠。
- 使用同一个经中文效果验证的 Embedding 模型生成文档向量和查询向量，存入 Supabase `pgvector`。
- 查询采用“角色/状态元数据过滤 + 向量召回”，MVP 返回 Top 3～5，低于相似度阈值时不注入上下文。
- Agent 回答引用知识库时返回来源标题；没有可靠材料时明确说“不确定”，不得补造出处。

建议表：`knowledge_documents` 保存文档元数据，`knowledge_chunks` 保存切片正文和向量。只允许后台服务角色写入，登录用户只能通过受控 RPC 检索已发布内容。知识库一期控制在 30～100 篇审核材料，先保证质量和可追溯性，不建设内容管理后台，采用 SQL/脚本批量导入。

### 2.3 两类用户与权限

注册引导时必须选择用户类型：

| 类型 | 标识 | MVP 能力 |
| --- | --- | --- |
| 更年期女性本人 | `self_user` | AI Agent、健康记录、今日卡片、月度数据、健康报告和展示页 |
| 非更年期女性本人/支持者 | `supporter` | AI Agent、RAG 问答和展示页；无健康记录、月度数据和报告 |

`profiles.user_type` 不能只做前端开关。Supabase RLS 和 Edge Function 必须再次校验：`supporter` 对健康记录、健康草案、健康报告相关表和函数均无 `select/insert/update/delete` 权限，相关工具也不进入该用户的 Agent 工具清单。本人用户默认也只能访问自己的健康数据。

MVP 不允许用户类型在 Web App 内自行反复切换；如确需修改，通过客服或一次受控的重新确认流程处理，避免借切换角色绕过权限策略。

### 2.4 好友与社区仅展示

MVP 不实现好友系统后端。好友列表、消息提醒、交流广场帖子、点赞数、评论数和收藏状态全部使用前端本地假数据；搜索、添加好友、好友条目、消息提醒、帖子交互、商城和发帖入口点击后统一 toast“敬请期待”。不创建好友表、好友 API、Realtime 订阅、通知任务或健康数据共享权限。

## 3. 总体架构

```text
移动端浏览器 / PWA（Vercel）
  ├─ 文字输入 ───────────────────────────────┐
  ├─ MediaRecorder ─ speech-asr Edge Function ┤
  ├─ fetch ─ chat Edge Function（SSE）────────┤
  └─ speech-tts Edge Function ─ Web Audio ────┤
                                            ▼
                                  Supabase Edge Functions
                                  ├─ 鉴权、限流、幂等
                                  ├─ 安全规则与危急症状兜底
                                  ├─ Qwen 对话与工具循环
                                  ├─ pgvector RAG 检索
                                  ├─ 健康信息结构化提取
                                  ├─ Fun-ASR / CosyVoice 适配器
                                  └─ 审计与指标
                                      │       │
                              Postgres/RLS   Storage
```

MVP 不增加 NestJS、Redis、消息队列或独立向量数据库。Vercel 只部署前端；服务端逻辑收敛在少量 Supabase Edge Functions 中：`chat`、`speech-asr`、`speech-tts`、`health-card-confirm`、`report-preview`。公共的 AI、安全和鉴权代码放在 Edge Functions 的共享模块中。月度任务优先使用 Supabase 定时任务；只有实际触发运行时或并发瓶颈后再引入外部 worker。

### 3.1 Supabase MVP 数据域

| 数据域 | 核心表 | 权限原则 |
| --- | --- | --- |
| 账号与角色 | `profiles` | 用户读写本人资料；`user_type` 受控修改 |
| 对话 | `conversations`、`messages` | 仅会话所属用户可见 |
| 健康草案 | `health_record_drafts`、`health_record_draft_items` | 仅 `self_user` 且仅本人可见 |
| 健康记录 | 现有 `health_record` 及各分类子表 | 仅 `self_user` 且 `user_id = auth.uid()` |
| 知识库 | `knowledge_documents`、`knowledge_chunks` | 客户端不可直接读取草稿；RPC 只返回已发布切片 |
| 月度总结 | `monthly_summaries` | 仅 `self_user` 且仅本人可见；PDF 不落库 |
| 审计 | `ai_runs`、`record_change_audits` | App 不可直接查询，由服务端最小化写入 |

所有 `public` Schema 业务表默认开启 RLS；迁移中为 `anon`、`authenticated` 分别编写 allow/deny 测试。Edge Function 使用用户 JWT 创建客户端，让普通数据操作自然继承 RLS；只有知识入库、定时任务等后台作业可使用 Secret Key。

### 3.2 Vercel 前端部署边界

- 使用一个 Next.js 项目实现移动端响应式界面，生产环境部署 Vercel，默认首页进入“今天的我”。
- 健康数据、聊天和录音从浏览器直接请求 Supabase Data API/Edge Functions；不经过 Vercel Serverless Functions。
- Vercel 环境变量只配置可公开的 Supabase Project URL 和 Publishable Key；百炼 API Key、Supabase Secret Key、数据库连接串不得以 `NEXT_PUBLIC_*` 暴露。
- 健康页面使用动态渲染或纯客户端数据加载，不进入静态生成产物、CDN 缓存、Vercel Analytics 请求参数或错误日志。
- Supabase 只允许正式 Vercel 域名、受控预览域名和本地开发域名跨域访问；生产与预览环境分别连接生产/测试 Supabase 项目。
- 若要获得接近 App 的入口体验，可补充 manifest、图标和“添加到主屏幕”；离线健康数据同步、推送通知、原生商店上架不属于 MVP。

## 4. 核心业务流程

### 4.1 文字对话与健康卡片提取

1. 前端发送 `conversationId`、`clientMessageId` 和用户文本到 `POST /api/chat`。
2. 服务端校验身份、输入长度和幂等键，保存用户消息。
3. 先执行确定性安全规则；若命中胸痛、呼吸困难、意识异常、自伤等高危表达，立即发送 `safety_alert`，展示急救/就医提示。模型只能补充表达，不能取消该提示。
4. 服务端读取最近若干轮消息、用户摘要和本次任务所需的最小健康上下文，调用 Qwen 流式生成回答。
5. 服务端把模型增量文本转换成项目自定义 SSE 事件发给前端。
6. 回答完成后，异步发起第二次结构化提取调用，只分析“本轮用户原话 + 必要上下文”，返回严格 JSON。
7. 业务服务进行 JSON Schema、枚举、日期和数值校验，并按 `quote` 回查原文，生成 `health_card_preview` 事件。
8. 用户编辑、勾选后调用 `POST /api/health-card/confirm`；只有此接口可以把草案提交为正式健康记录。

对话生成与结构化提取必须分开。这样聊天可以持续流式输出，提取失败也不会阻塞回答；同时避免把展示文案和可入库数据混在一个不稳定的模型响应里。

### 4.2 点击录音式语音输入

1. 用户点击麦克风后，移动端浏览器请求麦克风权限，并使用 `MediaRecorder` 启动录音。
2. 再次点击即停止录音，将 Blob 作为 `multipart/form-data` 上传到 `POST /api/asr`。
3. 前端先通过 `MediaRecorder.isTypeSupported()` 选择 `audio/webm;codecs=opus`、`audio/mp4` 等浏览器支持的格式；Edge Function 按文件头识别格式，不能只信任客户端 MIME。
4. Edge Function 校验 MIME、文件头、大小和时长，直接使用 Fun-ASR-Realtime 文件/Base64 模式支持的格式调用模型。MVP 不在 Edge Function 内引入 FFmpeg 转码；目标浏览器若不能产生受支持格式，则提示改用文字输入。
5. 返回转写文本和置信/状态信息。前端将文本放入输入框，默认让用户确认后再发送，避免识别错误直接进入健康记录链路。
6. 原始录音默认仅作临时处理，转写完成后删除；如果因接口要求暂存 Supabase Storage，必须使用私有桶、短时签名 URL 和生命周期清理规则。

MVP 建议限制单次录音 60 秒，前端在 50 秒提示即将结束，60 秒自动停止。录音 Blob 默认只保留在页面内存中；转写完成即释放。后续再把音频分片通过 WebSocket 送入 Fun-ASR-Realtime，不在 MVP 实现实时字幕。

### 4.3 TTS 播放

1. 聊天完成时，服务端同时给出 `speakableText`：去除 Markdown、链接、表格、工具提示和长清单，建议不超过 150～200 个汉字。
2. 用户点击播放，或在开启“自动朗读”时，由前端请求 `POST /api/tts`。
3. 服务端调用 CosyVoice Flash，向前端返回音频二进制流或短期音频 URL。
4. 前端使用 HTML Audio/Web Audio 显示加载、播放、暂停、重播状态；新一轮录音开始时自动停止当前朗读，避免回声被录入。

不建议把音频 Base64 放进 `/api/chat` 的 SSE。SSE 只发送文本和控制事件，音频走独立接口，能减少约三分之一的 Base64 体积膨胀，并简化断点、缓存和播放器处理。

### 4.4 健康报告自动预览、下载和分享

该功能仅对 `self_user` 开放：

1. 用户选择 1 个月、3 个月或半年；无足够数据的时间范围按 PRD 置灰。
2. `report-preview` Edge Function 从已确认记录和个人资料执行确定性 SQL 聚合，生成事实数据。
3. Qwen Plus 只根据这些事实生成报告叙述，不允许新增诊断；输出通过结构化 Schema 校验。
4. Web App 展示完整可编辑预览，自动带入出生年份、既往病史和手术史；用户可补充其余字段。
5. 用户确认后，前端将固定模板渲染成 PDF；提供“下载 PDF”，支持 Web Share API 的移动浏览器再显示“分享”，不支持时回退为下载文件后由用户自行分享。
6. MVP 不保存最终 PDF 文件；用户需要时从已确认数据重新生成，避免增加文件生命周期、跨设备下载和存储权限逻辑。

MVP 不做复杂服务端排版引擎。报告模板固定为一个移动端可预览、A4 可打印的版本；模型只生成字段内容，不控制字体、颜色、分页或 HTML。报告生成失败时仍保留事实预览，用户可以重试 PDF 导出。

### 4.5 Function Calling

MVP 工具白名单建议如下：

| 工具 | 作用 | 是否直接写库 |
| --- | --- | --- |
| `get_health_records` | 按日期和维度读取已确认记录 | 否 |
| `get_monthly_summary_data` | 获取后端聚合后的月度事实 | 否 |
| `propose_health_record_changes` | 生成新增/修改/删除草案 | 否，必须用户确认 |
| `get_today_actions` | 获取今日建议，按今日→近 3 天→默认规则回退 | 否 |
| `navigate_to` | 打开月度记录、报告、今日行动等已实现页面 | 否 |
| `prepare_report` | 创建报告预览任务 | 否，先进入可编辑预览 |

工具参数使用 JSON Schema；服务端校验工具名、参数、用户权限和资源归属。模型返回的工具调用只是一项“调用建议”，实际执行权始终在服务端。对未实现页面，`navigate_to` 返回 `NOT_AVAILABLE_IN_MVP`，前端统一 toast“敬请期待”。

建议采用“控制调用 → 执行工具 → 回填工具结果 → 流式生成最终回答”的编排。不要让模型生成 SQL，也不要把数据库连接能力暴露给模型。

工具集合按角色动态下发：`self_user` 可以使用健康记录与报告工具；`supporter` 只能使用公共 RAG 问答、App 导航和与自身账号相关的非健康工具。

## 5. API 与 SSE 协议

### 5.1 `POST /api/chat`

前端使用 `fetch` 发 POST，并从 `response.body` 的 `ReadableStream` 解析 `text/event-stream`。逻辑路径 `/api/chat` 在 Supabase 中映射为 `chat` Edge Function；Vercel 不代理该请求，以避免重复函数费用和多一跳延迟。

请求示例：

```json
{
  "conversationId": "conv_123",
  "clientMessageId": "01J...",
  "text": "昨晚两点才睡，今天潮热五次，很难受",
  "voiceReply": false
}
```

SSE 事件约定：

```text
event: message_started
data: {"requestId":"req_123","messageId":"msg_456"}

event: text_delta
data: {"delta":"听起来昨晚休息得不太好。"}

event: safety_alert
data: {"level":"urgent","message":"如出现持续胸痛或呼吸困难，请立即拨打急救电话。"}

event: tool_status
data: {"name":"get_health_records","status":"completed"}

event: health_card_preview
data: {"draftId":"draft_789","items":[...]}

event: message_completed
data: {"messageId":"msg_456","speakableText":"...","usage":{"inputTokens":0,"outputTokens":0}}

event: error
data: {"code":"MODEL_TIMEOUT","message":"暂时没有连接上，请稍后再试","retryable":true}
```

每个事件以空行结束。建议增加单调递增的 `id:`，客户端断线重试时携带最后事件 ID；服务端以 `requestId + eventId` 做短期事件缓存。响应头至少包括：

```text
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

每 15 秒发送注释心跳 `: ping`，并确认 Supabase Edge Function 与前置网关不会缓存完整响应。用户点击“停止生成”时，浏览器中止 fetch；Edge Function 收到连接关闭信号后同步取消上游模型请求。

### 5.2 其他核心接口

| 方法与路径 | 用途 |
| --- | --- |
| `POST /api/asr` | 上传单句录音，返回转写文本 |
| `POST /api/tts` | 输入短文本/消息 ID，返回音频流或短时 URL |
| `GET /api/conversations/:id/messages` | 分页读取会话历史 |
| `POST /api/health-card/confirm` | 兼容旧草案确认流程；当前主链路不依赖该接口 |
| `PATCH /api/health-records/:id` | 用户手动编辑已确认记录 |
| `GET /api/health-records` | 按日期范围和维度查询记录 |
| `GET /api/monthly-summary/:month` | 获取月度总结及生成状态 |
| `POST /api/reports/preview` | 聚合事实并生成可编辑报告预览 |

所有变更接口使用 `Idempotency-Key` 或客户端生成的唯一 ID，避免弱网重试造成重复记录。

## 6. 健康信息结构化输出

结构化提取结果使用项目《健康信息提取原则》中的 10 类体系：身体症状、情绪、睡眠与作息、月经与出血、体重与食欲、运动与活动、饮食与饮品、用药提及、生活事件与社交、就医诉求。

建议的顶层结构：

```ts
interface HealthExtractionDraft {
  schemaVersion: "1.0";
  sourceMessageId: string;
  recordDate: string; // YYYY-MM-DD，服务端结合用户时区校正
  items: Array<{
    clientItemId: string;
    category: HealthCategory;
    operation: "create" | "update" | "delete";
    targetRecordId?: string;
    data: Record<string, unknown>;
    quote: string;
    confidence: number;
    needsConfirmation: true;
  }>;
  ambiguities: Array<{
    field: string;
    question: string;
  }>;
}
```

关键约束：

- 模型不得补齐用户没有说过的症状、程度、次数、用药和诊断。
- 否定表达保留为 `occurred: false`，不能丢弃。
- “越来越严重/减轻”等写入 `trend`，模糊频率保留原文，不强行转成数值。
- 每项必须带可在用户原文中定位的 `quote`；服务端找不到引用时丢弃该项并记录质量日志。
- 低置信度或时间指代不清的内容只进入 `ambiguities`，通过追问澄清。
- AI 提出的删除或历史修改必须展示修改前后差异，再由用户确认。

数据库保存三层数据：用户原始消息、AI 提取草案、用户确认后的规范记录。这样可以审计模型错误，也能在 Schema 升级后重新提取，但原始消息的保留期限和重新处理必须在隐私政策中说明。

## 7. 会话与上下文管理

- 前端只提交当前输入和会话 ID；历史消息由服务端读取，防止客户端伪造系统上下文。
- 短会话携带最近 10～20 轮；超长会话生成摘要，摘要与关键事实分开保存。
- 已确认健康记录通过工具按需查询，不把半年明细每轮全部塞给模型。
- 对话上下文中的健康信息只用于回答；只有通过提取校验并成功写卡的明确事实才成为正式健康记录。
- Prompt 分层：固定安全规则、产品角色、用户偏好、任务上下文、工具定义、当前消息。固定 Prompt 加版本号并纳入回归测试。

## 8. 医疗安全与隐私

本产品定位为健康记录与一般性支持工具，不做诊断、处方或替代医生决策。

### 8.1 安全策略

- 使用“确定性规则 + 模型安全分类 + 回答约束”三层防护，规则优先级最高。
- 对胸痛、严重呼吸困难、昏厥/意识异常、突发单侧无力、严重出血、自伤/自杀意图等表达，立即给出紧急求助提示，并建议联系当地急救服务或身边可信任的人。
- 不基于单次自然语言记录推断疾病或更改药物；涉及停药、加量、替代治疗时明确建议咨询医生/药师。
- 页面长期展示简短免责声明；高风险提示不能只依赖 Prompt，也不能被用户关闭后永久隐藏。
- 对模型回复做输出扫描，拦截明确诊断、保证疗效、具体处方和不安全用药建议。

### 8.2 数据保护

- 百炼 API Key 和 Supabase Secret Key 仅保存在 Edge Function Secrets 中，绝不进入前端构建产物；浏览器只能使用 Supabase Publishable Key。
- 全链路 HTTPS；敏感表启用 RLS，必要字段应用层加密；Supabase Storage 使用私有桶和短时签名 URL。
- 日志默认不记录完整对话、录音、健康卡片正文和 Authorization；排障日志使用脱敏 ID。
- 提供账号注销、数据删除、数据导出和用户授权说明；明确录音是否保存及保存期限。
- 管理后台访问健康数据需要角色权限、二次验证和审计日志。

## 9. 可靠性、降级与可观测性

### 9.1 降级策略

| 故障 | 用户体验 | 系统处理 |
| --- | --- | --- |
| Qwen 超时 | 保留用户输入，显示重试 | 指数退避，仅对未产生输出的请求自动重试一次 |
| 结构化提取失败 | 聊天正常完成，不弹卡片 | Schema 校验失败后用同模型修复一次，再进入质量日志 |
| ASR 失败 | 保留录音并允许重试/改文字 | 不自动发送空文本；临时文件按策略清理 |
| TTS 失败 | 文字仍可阅读 | 隐藏自动重试，展示“暂时无法播放” |
| 工具失败 | AI 说明暂时无法读取 | 不让模型臆造工具结果 |
| SSE 中断 | 已显示文本保留 | 用事件 ID 恢复；无法恢复则重试该轮 |

### 9.2 核心指标

- 对话：首字延迟、完整响应耗时、成功率、停止生成率、每轮 Token 和成本。
- ASR：转写耗时、失败率、人工修改率、目标移动端浏览器与音频格式的成功率。
- 提取：Schema 合法率、草案弹出率、确认率、逐字段修改率、误提取率、漏提取率。
- TTS：首音频延迟、播放成功率、播放完成率。
- 安全：高危规则命中数、误报/漏报抽检、违规回答拦截数。
- 业务：次日/7 日记录留存、每周有效健康记录数、月度总结查看率、报告预览与导出率。

每次模型调用记录 `requestId`、模型版本、Prompt 版本、耗时、Token、工具名、错误码和脱敏后的质量标签；不默认记录原始健康文本。

## 10. MVP 开发阶段

### 阶段 0：基础准备（3～5 个工作日）

- 确认百炼华北 2（北京）地域、业务空间、API Key、Supabase 项目地域和预算告警。
- 建立开发/测试/生产环境，创建 Supabase migration、RLS 测试和模型适配层。
- 固化健康 Schema、危急症状词表、免责声明和模型评测集。

### 阶段 1：前端、账号与角色基础（0.5～1 周）

- 完成 Supabase Auth、注册引导和 `self_user/supporter` 角色。
- 完成底部导航的角色化显示及健康表 RLS 拒绝测试。
- 完成 Vercel 部署、移动端布局、全局 Tab、统一 toast 和展示页假数据。

### 阶段 2：文字对话与 RAG（1.5～2 周）

- 完成会话、消息、`POST /api/chat`、SSE 和停止生成。
- 接入 Qwen Flash 多轮对话。
- 完成审核知识导入、pgvector 检索、来源展示和无结果降级。
- 实现安全规则、免责声明、错误与限流。

### 阶段 3：健康卡片闭环（1.5～2 周）

- 接入结构化提取、Schema 校验、原文引用回查。
- 完成草案预览、编辑、勾选确认和事务写库。
- 接入读取记录、修改草案、页面导航等 Function Calling。

### 阶段 4：语音闭环（1 周）

- 完成 `expo-audio` 权限、录制、60 秒限制和文件/单句 ASR。
- 完成短文本 CosyVoice 合成、播放控制和音频清理。
- 在最低支持版本到最新版本的 Android/iOS 真机测试。

### 阶段 5：数据消费与报告（1.5～2 周）

- 基于确定性 SQL 聚合实现四维度日历/曲线。
- 接入今日行动建议回退链、月度总结和就医报告预览。
- 报告采用“事实聚合 → AI 文案 → 用户编辑确认 → PDF”的流程。

### 阶段 6：上线准备（1 周）

- 完成回归、压力、弱网、断流、隐私和安全测试。
- 对至少 100～200 条去标识化样本做提取评测。
- 配置模型成本、错误率、安全命中率告警，小流量灰度上线。

按一个前端、一个后端/AI、一个产品/测试协作估算，AI 核心闭环约 4～5 周；连同最小角色、RAG、月度记录和报告，建议预留 7～9 周。UI 设计、合规评审、知识审核和真实用户测试需并行开展。

## 11. MVP 验收标准

### 功能验收

- 注册时完成用户类型选择；`supporter` 在界面、Edge Function 和数据库三层均无法访问健康记录与报告。
- 好友列表、消息提醒、交流广场和成就墙均使用前端假数据，不产生任何对应后端写入；所有交互按范围统一 toast。
- 文字对话能连续进行 10 轮以上，刷新页面后历史可恢复。
- `/api/chat` 可逐字/逐片段返回，支持停止、超时、重试和明确错误事件。
- RAG 回答能展示审核来源；低相关结果不注入，知识检索不包含其他用户数据。
- 录音可在目标 iOS/Android 移动端浏览器完成“录制—转写—编辑—发送”。
- AI 回复可手动播放；TTS 失败不影响文字对话。
- 10 类健康信息能生成草案，未确认前数据库正式记录不发生变化。
- 对历史记录的增删改均展示差异并要求用户确认。
- 月度曲线和报告只消费已确认数据。
- 报告能自动生成可编辑预览，并在移动端浏览器完成 PDF 下载；支持 Web Share API 时可直接分享。
- 未实现入口统一展示“敬请期待”。

### 建议质量门槛

- 结构化输出 JSON Schema 合法率 ≥ 99%。
- 健康条目字段级准确率在内部金标集上 ≥ 90%；高风险字段需单独统计。
- 录音转写成功率 ≥ 95%，失败时可无损回退到文字输入。
- 普通对话首字延迟 P95 ≤ 3 秒；完整短回答 P95 ≤ 10 秒。
- 后端 API 成功率 ≥ 99.5%，且不存在 API Key 前端泄露、无校验写入或自动写入失败被静默忽略的问题。

以上阈值是 MVP 上线门槛建议，最终应基于测试设备、网络和真实样本校准。

## 12. 暂不纳入 MVP

- 浏览器到 ASR 的全双工实时字幕和语音打断。
- 数字人、持续监听、唤醒词和电话通话。
- AI 自动诊断、处方或根据模型判断调整用药。
- 多知识库、自动网页抓取、复杂 Agentic RAG 和未审核资料自动发布；MVP 仅做单一审核知识库。
- 微服务拆分、Kafka 等重型基础设施。
- 社区、商城、好友、私聊和成就系统的任何真实后端逻辑。

## 13. 上线前待确认事项

1. 产品所称“移动端 App”是否接受 Vercel 上的移动 Web/PWA；若必须上架应用商店，需要后续增加原生壳或 React Native 客户端，该工作不属于当前 MVP。
2. Supabase 托管版当前没有中国大陆项目地域。若主要服务中国大陆用户，健康数据放在新加坡/东京等境外地域会同时带来网络时延、可用性和数据跨境合规问题；上线前必须在“境外托管 Supabase”与“中国大陆合规环境自托管 Supabase”之间完成评估和决策。
3. 若 Supabase 在境外而百炼在北京，录音、对话和健康文本会跨地域传输；必须明确哪些数据可以发送、保存在哪里以及保留多久。
4. 百炼具体模型快照、配额、并发和预算上限。
5. CosyVoice 音色、是否默认自动朗读，以及单次最大朗读长度。
6. 原始录音、原始对话、模型提取草案各自的保留期限。
7. 危急症状提示文案和健康数据合规方案是否经过医疗/法务审核。
8. 目标浏览器最低版本、PWA 是否启用、隐私政策和麦克风权限文案；上线前需用中国大陆真实移动网络验证 Vercel 域名、Supabase API 和音频链路的可达性与延迟。

## 14. 官方能力核对

- 千问支持流式输出；OpenAI 兼容接口可通过 `stream: true` 获取 SSE 数据。
- 千问的结构化输出包含 JSON Object 和 JSON Schema 两种模式，严格 JSON Schema 仅由部分模型版本支持，因此选型时必须按实际模型 ID 验证。
- 千问 Plus 系列支持 Function Calling；具体模型和流式工具调用组合需在选定版本上做集成测试。
- Fun-ASR-Realtime 支持 WebSocket 实时流，也支持短文件/Base64 的非实时调用方式，可覆盖 MVP 的单句录音。
- CosyVoice 支持 HTTP/WebSocket 及流式合成；MVP 可先采用短文本单向合成。
- Supabase 官方提供 Next.js 接入、Postgres RLS、Edge Functions、Storage，以及基于 pgvector 的语义检索和权限控制 RAG。
- Next.js 可直接部署到 Vercel；Vercel 支持开发、预览、生产环境分别配置部署变量。
- Supabase 托管项目的官方可选地域目前包括新加坡、东京、首尔等，但不包括中国大陆；项目地域决定主数据存放位置。

参考文档：

- [Supabase Next.js Auth](https://supabase.com/docs/guides/auth/quickstarts/nextjs)
- [Supabase Semantic Search](https://supabase.com/docs/guides/ai/semantic-search)
- [Supabase RAG with Permissions](https://supabase.com/docs/guides/ai/rag-with-permissions)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Available Regions](https://supabase.com/docs/guides/platform/regions)
- [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs)
- [Vercel Environments](https://vercel.com/docs/deployments/environments)

---

## 15. 当前实现差异与补充（2026-09-05）

本文此前将“用户确认后写入健康记录”列为上线要求。当前产品交互已调整为自动更新健康卡片：模型/Mock 从用户本轮原话提取事实，经过字段与目标记录校验后自动调用 `save_health_record`；前端以更新气泡告知用户，并提供随时编辑、补充、删除的能力。

该调整不改变以下安全边界：

- 只记录明确事实，不作诊断、处方或自主用药调整。
- 危急表达优先发送就医安全提示。
- 写入前仍必须进行结构、枚举、日期、目标 ID 和权限校验；不合格模型输出可修复一次，仍不合格则丢弃。
- 自动写卡失败必须可见，并允许用户进入手动编辑器修订。

前端已实现移动端专用健康卡片工作区：共用固定日期/分类区、“今日健康卡片”提示条和底部保存栏，只有分类内容滚动。对话端已实现固定底部输入、Markdown 回复、语音转写/播放、SSE 更新提示及功能卡片导航。

当前版本仍需在上线前完成真实设备、真实网络、模型提取准确性与医学/法务安全文案验证。详细实现参见 [实现更新说明.md](./实现更新说明.md)。
