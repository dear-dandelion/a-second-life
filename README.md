# She Nicest MVP 后端

本目录是基于 Supabase 的 MVP 后端实现，覆盖 AI 聊天、文字/语音输入、RAG、健康卡片确认、月度数据、今日推荐、就医报告预览和「AI 帮我说」。交流广场、好友列表、消息列表、成就墙及其他仅展示页面不提供后端接口，继续使用前端静态数据。

模型密钥目前没有写入项目。未配置模型时，生产环境会明确返回 `MODEL_NOT_CONFIGURED`；本地可显式开启 `AI_MOCK_MODE=true` 完成界面联调。

## 目录

- `supabase/migrations/`：数据表、RLS、权限、事务 RPC 和 RAG 检索函数。
- `supabase/functions/`：Supabase Edge Functions。
- `scripts/import-knowledge.mjs`：本地 Markdown 知识库导入工具。
- `tests/`：知识库分块和 SQL 语法测试。
- `前后端接口设计.md`：冻结的完整请求、响应和 SSE 事件契约。

## 已实现的后端能力

| 能力 | 接口 | 角色 |
| --- | --- | --- |
| AI 多轮聊天、RAG、草案、导航 | `POST /functions/v1/chat`（SSE） | 两类用户；健康数据仅本人 |
| 录音转文字 | `POST /functions/v1/speech-asr` | 两类用户 |
| 简短文本转语音 | `POST /functions/v1/speech-tts` | 两类用户 |
| 草案确认并写健康卡片 | `POST /functions/v1/health-card-confirm` | 仅本人 |
| 今日行动推荐 | `GET /functions/v1/recommendations` | 本人个性化，其他人默认推荐 |
| 月度总结懒生成 | `POST /functions/v1/monthly-summary` | 仅本人 |
| 就医报告聚合预览 | `POST /functions/v1/report-preview` | 仅本人 |
| AI 帮我说 | `POST /functions/v1/ai-rephrase` | 两类用户 |
| 单日健康卡片读取 | RPC `get_health_record(target_date)` | 仅本人 |
| 健康卡片手工保存 | RPC `save_health_record(target_date,payload)` | 仅本人 |
| 月度四维统计 | RPC `get_monthly_stats(target_month)` | 仅本人 |
| 报告时间覆盖范围 | RPC `get_report_coverage()` | 仅本人 |

最终 PDF 由前端固定模板生成、下载和系统分享，不上传 Supabase；MVP 不保存报告文件。月度总结采用首次访问时生成并缓存，不配置 Cron。好友、帖子、成就和未实现入口不建表、不埋点。

## 本地启动

要求 Node.js 20+、Docker Desktop，以及可运行的 Supabase CLI。

```powershell
npm.cmd install
Copy-Item supabase/.env.example supabase/.env.local
npm.cmd run supabase:start
npm.cmd run supabase:reset
npm.cmd run functions:serve
```

将本地 `supabase status` 输出的 URL、anon key 和 service role key 填入 `supabase/.env.local`。前端使用 Supabase Auth 获取 access token，所有 Edge Function 请求均发送：

```http
Authorization: Bearer <access_token>
```

Supabase Auth 不另做登录接口。演示用测试手机号和固定验证码需在 Supabase Dashboard 的 Phone Provider 测试号码中配置，验证码不得写入前端或仓库。

## 环境变量

Edge Functions 使用 `supabase/.env.example` 作为模板：

- `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`：Supabase 服务端配置。
- `ALLOWED_ORIGINS`：逗号分隔的 Vercel 正式域名和受控 Preview 域名；生产不得设为 `*`。
- `AI_MOCK_MODE`：只允许本地/演示环境设为 `true`。
- `MODEL_BASE_URL`、`MODEL_API_KEY`、`MODEL_CHAT_MODEL`：OpenAI-compatible 文本模型配置，后续可填百炼兼容模式地址；聊天建议使用 Qwen Plus。
- `MODEL_FAST_MODEL`：结构化提取、月度摘要和「AI 帮我说」使用的低成本模型，建议 Qwen Flash；留空时回退 `MODEL_CHAT_MODEL`。
- `MODEL_EMBEDDING_MODEL`、`MODEL_EMBEDDING_DIMENSIONS`：可选向量模型；未配置时 RAG 自动使用 PostgreSQL 关键词相似度检索。
- `DASHSCOPE_API_KEY`、`DASHSCOPE_WORKSPACE_ID`：百炼语音服务配置。
- `ASR_MODEL`：默认 `fun-asr-realtime`；MVP Edge Function 使用单文件/单句请求。
- `TTS_MODEL`、`TTS_VOICE`：默认 `cosyvoice-v3-flash`、`longanyang`。

模型地址约定为以 `/v1` 结尾的兼容模式基础地址，代码会追加 `chat/completions` 和 `embeddings`。模型配置交付后只需设置 Supabase secrets，无需修改业务代码。

## 知识库导入

默认读取 `G:\tide\menopause-knowledge-base`。导入器解析 YAML frontmatter，按 Markdown 标题进行 800 字以内分块并保留约 100 字重叠；自动排除 README、`00-索引.md` 和 `07-原始资料/`。

```powershell
Copy-Item .env.example .env.local
npm.cmd run knowledge:dry-run
npm.cmd run knowledge:import
npm.cmd run knowledge:publish
```

`knowledge:import` 只写入 `draft`，不会被聊天检索。资料完成来源、时效、医疗准确性及商用版权审核后，才执行 `knowledge:publish`。当前库含第三方科普内容，发布前必须由项目方确认使用授权；导入脚本不等于版权许可。

如果配置了 embedding API，导入时同时保存向量；未配置则保存正文分块，RAG 仍可通过 `pg_trgm` 工作。知识库导入使用 service role key，只能在可信服务端执行。

## 部署到 Supabase

```powershell
npx.cmd supabase login
npx.cmd supabase link --project-ref <project-ref>
npx.cmd supabase db push
npx.cmd supabase secrets set --env-file supabase/.env.production
npx.cmd supabase functions deploy chat
npx.cmd supabase functions deploy speech-asr
npx.cmd supabase functions deploy speech-tts
npx.cmd supabase functions deploy health-card-confirm
npx.cmd supabase functions deploy report-preview
npx.cmd supabase functions deploy recommendations
npx.cmd supabase functions deploy monthly-summary
npx.cmd supabase functions deploy ai-rephrase
```

部署后再以生产项目配置执行 `npm.cmd run knowledge:publish`。不要把 `.env.production`、service role key、百炼密钥提交仓库，也不要放进任何 `NEXT_PUBLIC_*` 变量。

## 数据与安全边界

- `profiles.user_type` 由注册元数据初始化，客户端只能编辑出生年份、既往病史、手术史，不能自行改角色。
- 本人健康数据由 RLS 隔离；`supporter` 调用健康 RPC/报告/月度总结返回 `ROLE_NOT_ALLOWED`。
- AI 聊天只生成 `chat_card_drafts`，不会直接写正式记录。用户勾选后，`confirm_health_card` 在同一数据库事务中保存记录、消费草案并保存幂等结果。
- `chat_messages` 对客户端只读，防止伪造 assistant/tool 消息；写入只由鉴权后的 Edge Function 完成。
- ASR 限 60 秒和 8 MiB；TTS 限 300 字，音频只在请求期间转发，不持久化。
- 报告和 AI 输出均为健康信息整理，不构成医学诊断。聊天包含危急症状硬规则兜底，不能被模型覆盖。

## 校验

```powershell
npm.cmd test
npm.cmd run test:edge
npm.cmd run check
npm.cmd run knowledge:dry-run
```

`npm test` 会解析完整 PostgreSQL/PLpgSQL 迁移并测试知识库解析/分块；`npm run test:edge` 测试报告日期、安全兜底与页面导航；`npm run check` 对全部 Edge Functions 做 Deno 严格类型检查。完整数据库/RLS 集成验证需在安装 Docker Desktop 后执行 `npm.cmd run supabase:start` 和 `npm.cmd run supabase:reset`。
